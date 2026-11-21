// Finds every visible element on the page and keeps their boxes up to date.
import { app, WAVE } from './app.js';
import { clamp, cssPx, isOurs, deepContains, hasPaint } from './util.js';
import { isFree } from './edits.js';

const SKIP = new Set([
  'SCRIPT', 'STYLE', 'LINK', 'META', 'HEAD', 'TITLE', 'NOSCRIPT', 'TEMPLATE', 'BR', 'WBR',
  'PARAM', 'SOURCE', 'TRACK', 'BASE', 'DATALIST', 'OPTION', 'OPTGROUP', 'AREA', 'MAP',
]);
// Measure these, but don't look inside them.
const LEAF = new Set(['svg', 'SVG', 'IFRAME', 'VIDEO', 'AUDIO', 'CANVAS', 'IMG', 'PICTURE', 'INPUT', 'TEXTAREA', 'SELECT', 'OBJECT', 'EMBED', 'math', 'MATH']);
const MAX = 5000;
// Things that are boxes in their own right even without a background (for the "Blocks" level).
const MEDIA = new Set(['svg', 'SVG', 'IFRAME', 'VIDEO', 'AUDIO', 'CANVAS', 'IMG', 'PICTURE', 'INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'OBJECT', 'EMBED', 'math', 'MATH']);
const ICONISH = new Set(['svg', 'SVG', 'IMG', 'PICTURE', 'CANVAS', 'math', 'MATH']);

function childrenOf(el) {
  if (el.shadowRoot) return el.shadowRoot.children;
  if (el.tagName === 'SLOT' && el.assignedElements) {
    const a = el.assignedElements({ flatten: true });
    return a.length ? a : el.children;
  }
  return el.children;
}

function hasOwnText(el) {
  const nodes = el.childNodes;
  const n = Math.min(nodes.length, 24);
  for (let i = 0; i < n; i++) {
    const c = nodes[i];
    if (c.nodeType === 3 && c.nodeValue && c.nodeValue.trim()) return true;
  }
  return false;
}

// Where the words sit inside a box (relative to the box), so labels can go in the empty space.
function textBox(el, r) {
  try {
    const range = document.createRange();
    range.selectNodeContents(el);
    const rects = range.getClientRects();
    let x1 = Infinity;
    let y1 = Infinity;
    let x2 = -Infinity;
    let y2 = -Infinity;
    const n = Math.min(rects.length, 400);
    for (let i = 0; i < n; i++) {
      const q = rects[i];
      if (q.width < 0.5 || q.height < 0.5) continue;
      if (q.left < x1) x1 = q.left;
      if (q.top < y1) y1 = q.top;
      if (q.right > x2) x2 = q.right;
      if (q.bottom > y2) y2 = q.bottom;
    }
    if (!Number.isFinite(x1)) return null;
    return { x: x1 - r.left, y: y1 - r.top, w: x2 - x1, h: y2 - y1 };
  } catch {
    return null;
  }
}

// Solid sticky/fixed bars (headers, toolbars) hide what scrolls under them.
function opaqueBg(cs) {
  if (cs.backgroundImage && cs.backgroundImage !== 'none') return true;
  if (cs.backdropFilter && cs.backdropFilter !== 'none') return true;
  const m = /rgba?\(([^)]+)\)/.exec(cs.backgroundColor || '');
  if (!m) return false;
  const parts = m[1].split(/[\s,/]+/).filter(Boolean);
  const a = parts.length >= 4 ? parseFloat(parts[3]) * (parts[3].endsWith('%') ? 0.01 : 1) : 1;
  return a >= 0.5;
}

function inFront(o) {
  const x1 = Math.max(o.x, 0);
  const x2 = Math.min(o.x + o.w, window.innerWidth);
  const y1 = Math.max(o.y, 0);
  const y2 = Math.min(o.y + o.h, window.innerHeight);
  if (x2 - x1 < 4 || y2 - y1 < 4) return true; // not on screen now: assume a normal bar
  const ym = (y1 + y2) / 2;
  let front = 0;
  for (const fx of [0.5, 0.2, 0.8]) {
    let top = null;
    try {
      for (const e of document.elementsFromPoint(x1 + (x2 - x1) * fx, ym)) {
        if (e !== app.host && !isOurs(e)) {
          top = e;
          break;
        }
      }
    } catch {}
    if (!top || deepContains(o.el, top) || deepContains(top, o.el)) front++;
  }
  return front >= 2;
}

export function collect() {
  const t0 = performance.now();
  app.rootFS = cssPx(getComputedStyle(document.documentElement).fontSize) || 16;
  const out = [];
  const clips = [];
  const contentBox = new Map();
  const sx = window.scrollX;
  const sy = window.scrollY;
  let truncated = false;
  let texts = 0;
  const occluders = [];
  // Very big pages: only look at the stretch around the screen (re-scanned as you scroll).
  const vh = window.innerHeight;
  const band = document.getElementsByTagName('*').length > 2500 ? { top: sy - vh * 1.5, bottom: sy + vh * 2.5 } : null;

  const parentContent = (p) => {
    if (!p || p.nodeType !== 1) return { pw: app.vw, ph: app.vh };
    let v = contentBox.get(p);
    if (v) return v;
    try {
      const cs = getComputedStyle(p);
      const pw = p.clientWidth - cssPx(cs.paddingLeft) - cssPx(cs.paddingRight);
      const ph = p.clientHeight - cssPx(cs.paddingTop) - cssPx(cs.paddingBottom);
      v = { pw: pw > 0 ? pw : app.vw, ph: ph > 0 ? ph : app.vh };
    } catch {
      v = { pw: app.vw, ph: app.vh };
    }
    contentBox.set(p, v);
    return v;
  };

  const visit = (el, ctx) => {
    if (out.length >= MAX) {
      truncated = true;
      return;
    }
    if (el === app.host || el.nodeType !== 1) return;
    const tag = el.tagName;
    if (SKIP.has(tag)) return;
    let cs;
    try {
      cs = getComputedStyle(el);
    } catch {
      return;
    }
    const display = cs.display;
    if (display === 'none') return;
    if (display === 'contents') {
      for (const k of childrenOf(el)) visit(k, ctx);
      return;
    }
    if (cs.opacity === '0') return;
    const isRoot = el === document.documentElement || el === document.body;
    const r = el.getBoundingClientRect();
    const pos = cs.position;
    // pulled out of its box: it floats above the page, nothing around it cuts it off
    const lifted = ctx.top || isFree(el);
    const fixed = pos === 'fixed' || (lifted && !ctx.top);
    const dynamic = ctx.dynamic || fixed || pos === 'sticky';
    if (band && !isRoot && !dynamic) {
      const top = r.top + sy;
      if (top > band.bottom || (top + r.height < band.top && top + (el.scrollHeight || 0) < band.top)) return;
    }
    const clip = fixed ? null : ctx.clip;
    let cand = null;

    if (!isRoot && cs.visibility === 'visible' && r.width >= 2 && r.height >= 2 && app.hiddenForCapture.has(el) === false) {
      const parent = ctx.cand;
      const dup =
        !!parent &&
        Math.abs(parent.x - r.left) < 0.75 &&
        Math.abs(parent.y - r.top) < 0.75 &&
        Math.abs(parent.w - r.width) < 0.75 &&
        Math.abs(parent.h - r.height) < 0.75;
      const brs = cs.borderTopLeftRadius;
      let rad = 0;
      if (brs && brs !== '0px') {
        const v = parseFloat(brs);
        rad = brs.includes('%') ? (v / 100) * Math.min(r.width, r.height) : v;
      }
      rad = Math.min(rad || 0, Math.min(r.width, r.height) / 2);
      const circle = rad >= Math.min(r.width, r.height) / 2 - 0.5 && Math.abs(r.width - r.height) < 1.5 && r.width >= 6;
      const pc = parentContent(el.parentElement);
      cand = {
        el,
        tag: tag.toLowerCase(),
        depth: dup ? parent.depth : parent ? parent.depth + 1 : 0,
        parent,
        dup,
        dynamic,
        clip,
        x: r.left,
        y: r.top,
        w: r.width,
        h: r.height,
        dx: r.left + sx,
        dy: r.top + sy,
        rad,
        circle,
        fs: cssPx(cs.fontSize),
        pw: pc.pw,
        ph: pc.ph,
        flex: display === 'flex' || display === 'inline-flex',
        grid: display === 'grid' || display === 'inline-grid',
        dir: cs.flexDirection,
        gapX: cssPx(cs.columnGap),
        gapY: cssPx(cs.rowGap),
        text: hasOwnText(el),
        textR: null,
        occ: lifted ? null : ctx.occ || null,
        isOcc: false,
        top: lifted,
        at: 0,
        // detail levels: 0 = words and little icons, 1 = blocks, 2 = the page's big sections
        lv: 0,
        boxKids: 0,
        paint: hasPaint(cs),
        media: MEDIA.has(tag),
        inl: display === 'inline',
      };
      if (cand.text && texts++ < 2500) cand.textR = textBox(el, r);
      if ((fixed || pos === 'sticky' || ctx.inFixed) && !lifted && !ctx.occ && r.width >= 8 && r.height >= 8 && opaqueBg(cs)) {
        cand.isOcc = true;
        occluders.push(cand);
      }
      out.push(cand);
    }

    if (LEAF.has(tag)) {
      if (cand) settle(cand, ctx);
      return;
    }

    let nclip = clip;
    let childDynamic = dynamic;
    const ox = cs.overflowX;
    const oy = cs.overflowY;
    const scrollish = ox === 'auto' || ox === 'scroll' || oy === 'auto' || oy === 'scroll';
    if (isRoot) {
      if (scrollish && (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1) && el.clientHeight < window.innerHeight + 2) {
        childDynamic = true;
      }
    } else if (ox !== 'visible' || oy !== 'visible') {
      const k = {
        el,
        parent: clip,
        dynamic,
        x: r.left,
        y: r.top,
        w: r.width,
        h: r.height,
        dx: r.left + sx,
        dy: r.top + sy,
        frame: -1,
        vis: null,
      };
      clips.push(k);
      nclip = k;
      if (scrollish && (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1)) childDynamic = true;
    }
    if (lifted) childDynamic = true;
    const nctx = {
      cand: cand ? (cand.dup ? cand.parent : cand) : ctx.cand,
      up: cand || ctx.up,
      dynamic: childDynamic,
      clip: nclip,
      occ: cand && cand.isOcc ? cand : lifted ? null : ctx.occ,
      inFixed: (ctx.inFixed || fixed || pos === 'sticky') && !lifted,
      top: lifted,
    };
    for (const k of childrenOf(el)) visit(k, nctx);
    if (cand) settle(cand, ctx);
  };

  // Once everything inside a box is measured: is it a block, or just words / a small icon?
  const settle = (c, ctx) => {
    const words = !c.paint && !c.media && c.boxKids === 0 && (c.text || c.inl);
    const icon = ICONISH.has(c.el.tagName) && !c.paint && c.w <= 28 && c.h <= 28;
    c.lv = words || icon ? 0 : 1;
    if (c.lv && ctx.up) ctx.up.boxKids++;
  };

  const start = document.documentElement;
  if (start) {
    for (const k of start.children) visit(k, { cand: null, up: null, dynamic: false, clip: null, occ: null, inFixed: false, top: false });
  }

  // Some fixed layers are page backgrounds that sit behind everything: only keep the ones
  // that are really in front.
  const behind = new Set();
  for (const o of occluders) if (!inFront(o)) behind.add(o);
  if (behind.size) {
    for (const o of behind) o.isOcc = false;
    for (const c of out) if (c.occ && behind.has(c.occ)) c.occ = null;
  }

  markSections(out, band);

  // How new boxes appear: while the opening wave is still spreading they're drawn in by it;
  // after that, boxes that show up later (scrolling, new content) fade in one by one.
  const now = performance.now();
  const fresh = out.filter((c) => !app.revealed.has(c.el));
  if (fresh.length && (app.state.capturing || app.reduceMotion)) {
    for (const c of fresh) app.revealed.set(c.el, now - 5000); // no animation inside screenshots
  } else if (fresh.length && app.wave && now < app.wave.grow) {
    for (const c of fresh) app.revealed.set(c.el, WAVE);
  } else if (fresh.length) {
    const order = fresh.slice().sort((a, b) => a.depth - b.depth || a.dy - b.dy || a.dx - b.dx);
    const total = 260;
    const step = clamp(total / order.length, 0.5, 12);
    order.forEach((c, i) => app.revealed.set(c.el, now + Math.min(i * step, total)));
  }
  for (const c of out) c.at = app.revealed.get(c.el) ?? now;

  // Draw outer boxes first so nested ones stack on top.
  out.sort((a, b) => a.depth - b.depth);

  app.cands = out;
  app.clips = clips;
  app.occluders = behind.size ? occluders.filter((o) => !behind.has(o)) : occluders;
  app.truncated = truncated;
  app.band = band;
  app.candByEl = new WeakMap();
  for (const c of out) app.candByEl.set(c.el, c);
  app.needCollect = false;
  app.needFull = false;
  app.lastCollect = performance.now();
  app.collectMs = app.lastCollect - t0;
  return out;
}

// ---- sections ------------------------------------------------------------------------------
// The page's big parts (header, hero, sidebar, the bands down the page, footer), found the way a
// designer would: start from the outermost boxes and open up any box that is just a frame around
// a few page-wide bands or full-height columns. Everything left is a section.

const SPLIT_MIN = 0.3; // a box has to cover this much of the page before it can be opened up

function markSections(out, band) {
  const de = document.documentElement;
  const sy = window.scrollY;
  const y1 = band ? band.top : -Infinity;
  const y2 = band ? band.bottom : Infinity;
  const pageW = Math.max(app.vw, de.scrollWidth || 0);
  const pageH = band ? band.bottom - band.top : Math.max(app.vh, de.scrollHeight || 0);
  const pageArea = pageW * pageH;
  // areas in page coordinates, and only the stretch that was measured on very big pages
  const span = (c) => {
    const a = Math.max(c.y + sy, y1);
    const b = Math.min(c.y + sy + c.h, y2);
    return [a, b];
  };
  const area = (c) => {
    const [a, b] = span(c);
    return Math.max(0, b - a) * c.w;
  };
  const overlap = (k, n) => {
    const [ka, kb] = span(k);
    const [na, nb] = span(n);
    const w = Math.min(k.x + k.w, n.x + n.w) - Math.max(k.x, n.x);
    const h = Math.min(kb, nb) - Math.max(ka, na);
    return w > 0 && h > 0 ? w * h : 0;
  };
  const kids = new Map();
  const roots = [];
  for (const c of out) {
    if (c.dup || c.lv < 1) continue;
    if (c.parent) {
      let l = kids.get(c.parent);
      if (!l) kids.set(c.parent, (l = []));
      l.push(c);
    } else roots.push(c);
  }
  // the boxes to use instead of n, or null when n is a section itself
  const split = (n, depth) => {
    if (depth > 10) return null;
    const A = area(n);
    if (A < SPLIT_MIN * pageArea) return null;
    const ks = (kids.get(n) || []).filter((k) => area(k) > 0);
    if (!ks.length) return null;
    // one box inside another: look inside it when it fills the outer one. A plain wrapper (no
    // background or border of its own, like a centred page column) only needs to fill half.
    if (ks.length === 1) return overlap(ks[0], n) >= (n.paint ? 0.85 : 0.5) * A ? split(ks[0], depth + 1) : null;
    let cover = 0;
    let regions = 0;
    let regionArea = 0;
    let thin = 0;
    for (const k of ks) {
      const a = overlap(k, n);
      cover += a;
      const row = k.w >= 0.8 * n.w;
      if (row || k.h >= 0.8 * n.h) {
        regions++;
        regionArea += a;
        if (row ? k.h < 0.25 * app.vh : k.w < 0.25 * app.vw) thin++;
      }
    }
    // a long stack of thin rows (a feed, a table of results) is one list, so one section
    if (regions >= 8 && thin === regions) return null;
    return regions >= 2 && cover >= 0.5 * A && regionArea >= 0.7 * cover ? ks : null;
  };
  const queue = roots.slice();
  for (let i = 0; i < queue.length && i < 3000; i++) {
    const c = queue[i];
    const parts = split(c, 0);
    if (parts) queue.push(...parts);
    else c.lv = 2;
  }
}

// Update every box for the current frame. Static boxes just follow the page scroll;
// boxes inside sticky/fixed/scrolling containers are re-measured.
export function measure(full) {
  const sx = window.scrollX;
  const sy = window.scrollY;
  const all = full || app.needFull || app.live > 0;
  for (const c of app.cands) {
    if (all || c.dynamic) {
      if (!c.el.isConnected) {
        c.w = 0;
        c.h = 0;
        continue;
      }
      const r = c.el.getBoundingClientRect();
      c.x = r.left;
      c.y = r.top;
      c.w = r.width;
      c.h = r.height;
      c.dx = r.left + sx;
      c.dy = r.top + sy;
    } else {
      c.x = c.dx - sx;
      c.y = c.dy - sy;
    }
  }
  for (const k of app.clips) {
    if (all || k.dynamic) {
      if (!k.el.isConnected) continue;
      const r = k.el.getBoundingClientRect();
      k.x = r.left;
      k.y = r.top;
      k.w = r.width;
      k.h = r.height;
      k.dx = r.left + sx;
      k.dy = r.top + sy;
    } else {
      k.x = k.dx - sx;
      k.y = k.dy - sy;
    }
  }
  if (all) {
    app.needFull = false;
    app.lastFull = performance.now();
  }
  app.frame++;
}

const NOCLIP = null;
// Visible area of a clipping container chain for this frame (memoised per frame).
export function clipRect(k) {
  if (!k) return NOCLIP;
  if (k.frame === app.frame) return k.vis;
  let r = { x: k.x, y: k.y, w: k.w, h: k.h };
  const p = clipRect(k.parent);
  if (p !== NOCLIP) {
    if (p === false) r = false;
    else {
      const x = Math.max(r.x, p.x);
      const y = Math.max(r.y, p.y);
      const x2 = Math.min(r.x + r.w, p.x + p.w);
      const y2 = Math.min(r.y + r.h, p.y + p.h);
      r = x2 > x && y2 > y ? { x, y, w: x2 - x, h: y2 - y } : false;
    }
  }
  k.frame = app.frame;
  k.vis = r;
  return r;
}
