// Finds every visible element on the page and keeps their boxes up to date.
import { app } from './app.js';
import { clamp, cssPx, isOurs, deepContains } from './util.js';

const SKIP = new Set([
  'SCRIPT', 'STYLE', 'LINK', 'META', 'HEAD', 'TITLE', 'NOSCRIPT', 'TEMPLATE', 'BR', 'WBR',
  'PARAM', 'SOURCE', 'TRACK', 'BASE', 'DATALIST', 'OPTION', 'OPTGROUP', 'AREA', 'MAP',
]);
// Measure these, but don't look inside them.
const LEAF = new Set(['svg', 'SVG', 'IFRAME', 'VIDEO', 'AUDIO', 'CANVAS', 'IMG', 'PICTURE', 'INPUT', 'TEXTAREA', 'SELECT', 'OBJECT', 'EMBED', 'math', 'MATH']);
const MAX = 5000;

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
    const fixed = pos === 'fixed';
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
        occ: ctx.occ || null,
        isOcc: false,
        at: 0,
      };
      if (cand.text && texts++ < 2500) cand.textR = textBox(el, r);
      if ((fixed || pos === 'sticky' || ctx.inFixed) && !ctx.occ && r.width >= 8 && r.height >= 8 && opaqueBg(cs)) {
        cand.isOcc = true;
        occluders.push(cand);
      }
      out.push(cand);
    }

    if (LEAF.has(tag)) return;

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
    const nctx = {
      cand: cand ? (cand.dup ? cand.parent : cand) : ctx.cand,
      dynamic: childDynamic,
      clip: nclip,
      occ: cand && cand.isOcc ? cand : ctx.occ,
      inFixed: ctx.inFixed || fixed || pos === 'sticky',
    };
    for (const k of childrenOf(el)) visit(k, nctx);
  };

  const start = document.documentElement;
  if (start) {
    for (const k of start.children) visit(k, { cand: null, dynamic: false, clip: null, occ: null, inFixed: false });
  }

  // Some fixed layers are page backgrounds that sit behind everything: only keep the ones
  // that are really in front.
  const behind = new Set();
  for (const o of occluders) if (!inFront(o)) behind.add(o);
  if (behind.size) {
    for (const o of behind) o.isOcc = false;
    for (const c of out) if (c.occ && behind.has(c.occ)) c.occ = null;
  }

  // Reveal cascade: new elements appear one by one, outer boxes first, top to bottom.
  const now = performance.now();
  const fresh = out.filter((c) => !app.revealed.has(c.el));
  if (fresh.length && app.state.capturing) {
    for (const c of fresh) app.revealed.set(c.el, now - 5000); // no animation inside screenshots
  } else if (fresh.length) {
    const firstOpen = now - app.openedAt < 200;
    const order = fresh.slice().sort((a, b) => a.depth - b.depth || a.dy - b.dy || a.dx - b.dx);
    const total = firstOpen ? 1000 : 260;
    const step = clamp(total / order.length, firstOpen ? 1.1 : 0.5, firstOpen ? 26 : 12);
    order.forEach((c, i) => app.revealed.set(c.el, now + Math.min(i * step, total)));
  }
  for (const c of out) c.at = app.revealed.get(c.el) || now;

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
