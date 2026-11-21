// Group / ungroup, flex controls, align, even spacing, pulse reflow, magic fix.
import { app, requestCollect, requestFull, liveFor, keepAnimating } from './app.js';
import { rectOf, union, isRootish, cssPx, deepContains } from './util.js';
import { ensureRec, applyRec, markCreated, allRecs, isEdited, getRec, setCss } from './edits.js';
import { begin, commit, touch, touchShapes } from './history.js';
import { itemRect, startState, applyRect, setSelection, elItem } from './items.js';
import { flowChildren } from './render.js';

const FLIP_MS = 560;

// ---- FLIP: animate elements from where they were to where layout put them ----------

export function captureRects(els) {
  const m = new Map();
  for (const el of els) if (el && el.isConnected) m.set(el, rectOf(el));
  return m;
}

export function flip(first) {
  let n = 0;
  for (const [el, f] of first) {
    if (!el.isConnected) continue;
    const l = rectOf(el);
    const dx = f.x - l.x;
    const dy = f.y - l.y;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
    try {
      el.animate([{ translate: `${dx}px ${dy}px` }, { translate: '0px 0px' }], {
        duration: FLIP_MS,
        easing: 'cubic-bezier(.2,.85,.25,1)',
        composite: 'add',
      });
      n++;
    } catch {}
  }
  liveFor(FLIP_MS + 60);
  return n;
}

export function pulse(x, y, color = 'rgba(124,58,237,ALPHA)', dur = 750, scale = 1) {
  app.pulses.push({ x, y, t0: performance.now(), dur, color, scale });
  keepAnimating(dur + 30);
}

function selEls() {
  return app.sel.filter((s) => s.kind === 'el' && s.el.isConnected).map((s) => s.el);
}

function outermost(els) {
  return els.filter((e) => !els.some((o) => o !== e && deepContains(o, e)));
}

function lca(els) {
  if (!els.length) return null;
  let a = els[0].parentElement;
  while (a && !els.every((e) => a.contains(e))) a = a.parentElement;
  return a;
}

function childOf(ancestor, el) {
  let c = el;
  while (c && c.parentElement !== ancestor) c = c.parentElement;
  return c;
}

function arrangement(rects) {
  // row if most boxes share vertical space, otherwise column
  let rowVotes = 0;
  let colVotes = 0;
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i];
      const b = rects[j];
      const yo = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      const xo = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      if (yo > 0 && yo >= xo) rowVotes++;
      else colVotes++;
    }
  }
  return rowVotes >= colVotes ? 'row' : 'column';
}

function median(a) {
  if (!a.length) return 0;
  const s = a.slice().sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
}

// ---- group / ungroup -------------------------------------------------------------

export function group() {
  let els = outermost(selEls()).filter((e) => !isRootish(e));
  if (!els.length) return { ok: false, msg: 'Select 2 or more things to group' };
  if (els.length === 1) return makeFlex(els[0]);
  const rects = els.map(rectOf);
  const dir = arrangement(rects);
  const order = els
    .map((el, i) => ({ el, r: rects[i] }))
    .sort((a, b) => (dir === 'row' ? a.r.x - b.r.x || a.r.y - b.r.y : a.r.y - b.r.y || a.r.x - b.r.x));
  const gaps = [];
  for (let i = 0; i < order.length - 1; i++) {
    const a = order[i].r;
    const b = order[i + 1].r;
    gaps.push(Math.max(0, dir === 'row' ? b.x - (a.x + a.w) : b.y - (a.y + a.h)));
  }
  const gap = Math.round(median(gaps));
  // alignment along the cross axis
  const ends = (f) => order.map((o) => f(o.r));
  const spread = (arr) => Math.max(...arr) - Math.min(...arr);
  let align = 'flex-start';
  if (dir === 'row') {
    const t = spread(ends((r) => r.y));
    const c = spread(ends((r) => r.y + r.h / 2));
    const b = spread(ends((r) => r.y + r.h));
    align = c + 0.5 < t && c <= b ? 'center' : b + 0.5 < t ? 'flex-end' : 'flex-start';
  } else {
    const l = spread(ends((r) => r.x));
    const c = spread(ends((r) => r.x + r.w / 2));
    const rr = spread(ends((r) => r.x + r.w));
    align = c + 0.5 < l && c <= rr ? 'center' : rr + 0.5 < l ? 'flex-end' : 'flex-start';
  }
  const parent = lca(els);
  if (!parent) return { ok: false, msg: 'Could not group these' };
  const domFirst = els.slice().sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))[0];
  const anchor = childOf(parent, domFirst);

  begin('Group');
  const first = captureRects(els);
  const wrap = document.createElement('div');
  wrap.setAttribute('data-pd-group', '');
  touch(wrap);
  for (const el of els) touch(el);
  const rec = markCreated(wrap);
  rec.name = 'New group';
  rec.css = {
    display: 'flex',
    'flex-direction': dir,
    gap: gap + 'px',
    'align-items': align,
    'box-sizing': 'border-box',
    'max-width': '100%',
    width: 'fit-content',
  };
  parent.insertBefore(wrap, anchor);
  applyRec(rec);
  for (const o of order) {
    const r = ensureRec(o.el);
    wrap.appendChild(o.el);
    r.tx = 0;
    r.ty = 0;
    r.mr = null;
    r.mb = null;
    r.css = { ...r.css, margin: '0px' };
    applyRec(r);
  }
  commit();
  flip(first);
  setSelection([elItem(wrap)]);
  requestCollect();
  return { ok: true, msg: `Grouped ${els.length} into a ${dir === 'row' ? 'row' : 'column'} · gap ${gap}px` };
}

function makeFlex(el) {
  const kids = flowChildren(el);
  if (!kids.length) return { ok: false, msg: 'Select 2 or more things to group' };
  const cs = getComputedStyle(el);
  if (cs.display.includes('flex')) return { ok: true, msg: 'Already a flex box — use the panel to change it' };
  const dir = arrangement(kids.map((k) => k.r));
  const gaps = [];
  const sorted = kids.slice().sort((a, b) => (dir === 'row' ? a.r.x - b.r.x : a.r.y - b.r.y));
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i].r;
    const b = sorted[i + 1].r;
    gaps.push(Math.max(0, dir === 'row' ? b.x - (a.x + a.w) : b.y - (a.y + a.h)));
  }
  begin('Make flex');
  touch(el);
  const first = captureRects(kids.map((k) => k.el));
  setCss(el, { display: cs.display.startsWith('inline') ? 'inline-flex' : 'flex', 'flex-direction': dir, gap: Math.round(median(gaps)) + 'px' });
  commit();
  flip(first);
  requestCollect();
  return { ok: true, msg: `Turned into a flex ${dir}` };
}

export function ungroup() {
  const els = selEls().filter((e) => !isRootish(e));
  if (!els.length) return { ok: false, msg: 'Select a group to ungroup' };
  const target = els[0];
  const parent = target.parentElement;
  if (!parent) return { ok: false, msg: 'Cannot ungroup this' };
  const kidsEl = [...target.children];
  if (!kidsEl.length) return { ok: false, msg: 'Nothing inside to ungroup' };
  begin('Ungroup');
  const first = captureRects([...kidsEl, ...[...parent.children]]);
  touch(target);
  const nodes = [...target.childNodes];
  for (const n of nodes) if (n.nodeType === 1) touch(n);
  for (const n of nodes) parent.insertBefore(n, target);
  parent.removeChild(target);
  for (const k of kidsEl) {
    const r = getRec(k);
    if (r && r.css.margin === '0px') {
      delete r.css.margin;
      applyRec(r);
    }
  }
  commit();
  flip(first);
  setSelection(kidsEl.filter((k) => k.isConnected).map(elItem));
  requestCollect();
  return { ok: true, msg: `Ungrouped ${kidsEl.length} item${kidsEl.length === 1 ? '' : 's'}` };
}

// ---- flex container controls --------------------------------------------------------

export function flexInfo(el) {
  const cs = getComputedStyle(el);
  return {
    display: cs.display,
    isFlex: cs.display.includes('flex'),
    isGrid: cs.display.includes('grid'),
    dir: cs.flexDirection,
    wrap: cs.flexWrap,
    justify: cs.justifyContent,
    align: cs.alignItems,
    gap: cssPx(cs.columnGap),
    rowGap: cssPx(cs.rowGap),
  };
}

export function setFlexProp(el, props, label = 'Flex') {
  const kids = [...el.children];
  begin(label);
  touch(el);
  const first = captureRects(kids);
  setCss(el, props);
  commit();
  flip(first);
  requestCollect();
}

// ---- align / distribute -----------------------------------------------------------------

function refRect(items) {
  if (items.length > 1) return union(items.map(itemRect));
  const it = items[0];
  if (it.kind === 'el') {
    const p = it.el.parentElement;
    if (p && !isRootish(p)) {
      const r = rectOf(p);
      const cs = getComputedStyle(p);
      return {
        x: r.x + cssPx(cs.borderLeftWidth) + cssPx(cs.paddingLeft),
        y: r.y + cssPx(cs.borderTopWidth) + cssPx(cs.paddingTop),
        w: r.w - cssPx(cs.borderLeftWidth) - cssPx(cs.borderRightWidth) - cssPx(cs.paddingLeft) - cssPx(cs.paddingRight),
        h: r.h - cssPx(cs.borderTopWidth) - cssPx(cs.borderBottomWidth) - cssPx(cs.paddingTop) - cssPx(cs.paddingBottom),
      };
    }
  }
  return { x: 0, y: 0, w: app.vw, h: app.vh };
}

export function align(how, items = app.sel) {
  items = items.filter((it) => it.kind === 'shape' || it.el.isConnected);
  if (!items.length) return { ok: false, msg: 'Select something to align' };
  const B = refRect(items);
  begin('Align');
  const states = items.map(startState);
  for (const st of states) {
    const r = { ...st.rect };
    if (how === 'left') r.x = B.x;
    if (how === 'hcenter') r.x = B.x + B.w / 2 - r.w / 2;
    if (how === 'right') r.x = B.x + B.w - r.w;
    if (how === 'top') r.y = B.y;
    if (how === 'vcenter') r.y = B.y + B.h / 2 - r.h / 2;
    if (how === 'bottom') r.y = B.y + B.h - r.h;
    applyRect(st, r, false);
  }
  commit();
  liveFor(80);
  return { ok: true, msg: 'Aligned ' + how.replace('hcenter', 'center').replace('vcenter', 'middle') };
}

export function distribute(axis, items = app.sel) {
  items = items.filter((it) => it.kind === 'shape' || it.el.isConnected);
  if (items.length < 3) {
    if (items.length === 2) return { ok: true, msg: 'Spacing is already even with 2 — drag the pink handle to change it' };
    return { ok: false, msg: 'Select 3 or more to space evenly' };
  }
  begin('Even spacing');
  const states = items.map(startState).sort((a, b) => (axis === 'x' ? a.rect.x - b.rect.x : a.rect.y - b.rect.y));
  const first = states[0].rect;
  const last = states[states.length - 1].rect;
  const span = axis === 'x' ? last.x + last.w - first.x : last.y + last.h - first.y;
  const total = states.reduce((s, st) => s + (axis === 'x' ? st.rect.w : st.rect.h), 0);
  const gap = (span - total) / (states.length - 1);
  let pos = axis === 'x' ? first.x : first.y;
  for (const st of states) {
    const r = { ...st.rect };
    if (axis === 'x') r.x = pos;
    else r.y = pos;
    applyRect(st, r, false);
    pos += (axis === 'x' ? r.w : r.h) + gap;
  }
  commit();
  liveFor(80);
  return { ok: true, msg: `Even spacing · ${Math.round(gap)}px` };
}

export function evenSpacing(items = app.sel) {
  if (items.length < 2) return { ok: false, msg: 'Select 2 or more things' };
  const rs = items.map(itemRect);
  const dir = arrangement(rs);
  return distribute(dir === 'row' ? 'x' : 'y', items);
}

// ---- pulse reflow ----------------------------------------------------------------------
// Turns Photoshop-style placement into real layout: reorder moved things by where you
// dropped them, drop the temporary offsets, let everything flow around new sizes, and
// close the gaps left by deleted things. Everything glides to its new spot.

function visualOrder(kids, parent) {
  const cs = getComputedStyle(parent);
  const disp = cs.display;
  const row = disp.includes('flex') ? !cs.flexDirection.startsWith('column') : disp.includes('grid');
  const items = kids.map((el) => ({ el, r: rectOf(el) }));
  items.sort((a, b) => {
    const ay = a.r.y + a.r.h / 2;
    const by = b.r.y + b.r.h / 2;
    const ax = a.r.x + a.r.w / 2;
    const bx = b.r.x + b.r.w / 2;
    if (row) {
      const sameLine = Math.abs(ay - by) < Math.min(a.r.h, b.r.h) / 2;
      return sameLine ? ax - bx : ay - by;
    }
    const sameCol = Math.abs(ax - bx) < Math.min(a.r.w, b.r.w) / 2 && disp.includes('grid');
    return sameCol ? ay - by : ay - by || ax - bx;
  });
  if (cs.flexDirection.endsWith('reverse')) items.reverse();
  return items.map((i) => i.el);
}

export function pulseReflow(origin) {
  const edited = allRecs().filter((r) => r.el.isConnected && !r.created && isEdited(r));
  if (origin) pulse(origin.x, origin.y, 'rgba(124,58,237,ALPHA)', 820, 1);
  if (!edited.length) return { ok: true, msg: 'Nothing to reflow yet — move or resize something first' };
  begin('Reflow');
  const parents = new Set(edited.map((r) => r.el.parentElement).filter(Boolean));
  const watch = new Set();
  for (const p of parents) for (const k of p.children) watch.add(k);
  for (const r of edited) watch.add(r.el);
  const first = captureRects([...watch]);
  // 1) reorder within each parent by visual position (only where something was moved)
  for (const p of parents) {
    const kids = [...p.children].filter((k) => {
      if (k === app.host) return false;
      const cs = getComputedStyle(k);
      return cs.display !== 'none' && cs.position !== 'absolute' && cs.position !== 'fixed';
    });
    const moved = kids.some((k) => {
      const r = getRec(k);
      return r && (Math.abs(r.tx) > 0.5 || Math.abs(r.ty) > 0.5);
    });
    const texty = [...p.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim());
    if (!moved || texty || kids.length < 2) continue;
    const order = visualOrder(kids, p);
    const changed = order.some((el, i) => el !== kids[i]);
    if (!changed) continue;
    for (const k of kids) touch(k);
    const anchor = kids[kids.length - 1].nextSibling;
    for (const el of order) p.insertBefore(el, anchor);
  }
  // 2) commit sizes, drop offsets and compensation, collapse deleted things
  for (const r of edited) {
    touch(r.el);
    r.tx = 0;
    r.ty = 0;
    r.mr = null;
    r.mb = null;
    if (r.deleted) r.collapsed = true;
    if (r.w != null) {
      const p = r.el.parentElement;
      if (p && !isRootish(p)) {
        const cs = getComputedStyle(p);
        const inner = p.clientWidth - cssPx(cs.paddingLeft) - cssPx(cs.paddingRight);
        if (inner > 20 && r.w > inner) r.w = inner;
      }
    }
    applyRec(r);
  }
  commit();
  flip(first);
  requestCollect();
  return { ok: true, msg: `Reflowed ${edited.length} edit${edited.length === 1 ? '' : 's'} into the layout` };
}

// ---- magic fix ------------------------------------------------------------------------
// Keeps things roughly where you put them, but straightens them out.

function siblingsRects(el) {
  const p = el.parentElement;
  if (!p) return [];
  return flowChildren(p).filter((k) => k.el !== el && !deepContains(k.el, el) && !deepContains(el, k.el));
}

function contentBox(p) {
  const r = rectOf(p);
  const cs = getComputedStyle(p);
  return {
    x: r.x + cssPx(cs.borderLeftWidth) + cssPx(cs.paddingLeft),
    y: r.y + cssPx(cs.borderTopWidth) + cssPx(cs.paddingTop),
    w: p.clientWidth - cssPx(cs.paddingLeft) - cssPx(cs.paddingRight),
    h: p.clientHeight - cssPx(cs.paddingTop) - cssPx(cs.paddingBottom),
  };
}

function nearest(v, list, th) {
  let best = null;
  for (const t of list) {
    const d = t - v;
    if (Math.abs(d) <= th && (best == null || Math.abs(d) < Math.abs(best))) best = d;
  }
  return best;
}

export function magicFix(origin) {
  let targets = allRecs().filter((r) => r.el.isConnected && !r.created && !r.deleted && (Math.abs(r.tx) > 0.5 || Math.abs(r.ty) > 0.5 || r.w != null || r.h != null));
  let items = targets.map((r) => elItem(r.el));
  const shapeSel = app.sel.filter((s) => s.kind === 'shape');
  if (!items.length && app.sel.length) items = app.sel.slice();
  else items = items.concat(shapeSel);
  if (origin) pulse(origin.x, origin.y, 'rgba(236,72,153,ALPHA)', 650, 0.35);
  if (!items.length) return { ok: true, msg: 'Nothing to fix — everything is where the page put it' };
  begin('Magic fix');
  const states = items.map(startState);
  const firstMap = new Map();
  for (const st of states) {
    const r = { ...st.rect };
    let refs = [];
    let box = null;
    if (st.it.kind === 'el') {
      refs = siblingsRects(st.it.el).map((k) => k.r);
      const p = st.it.el.parentElement;
      if (p && !isRootish(p)) box = contentBox(p);
    } else {
      refs = (app.state.canvasMode ? app.shapes.canvas : app.shapes.page)
        .filter((s) => s !== st.it.shape)
        .map((s) => ({ x: s.x - (s.space === 'page' ? window.scrollX : 0), y: s.y - (s.space === 'page' ? window.scrollY : 0), w: s.w, h: s.h }));
      box = { x: 0, y: 0, w: app.vw, h: app.vh };
    }
    // 1) match near-equal sizes
    for (const o of refs) {
      if (Math.abs(o.w - r.w) / Math.max(o.w, 1) < 0.06 && Math.abs(o.w - r.w) > 0.5) r.w = o.w;
      if (Math.abs(o.h - r.h) / Math.max(o.h, 1) < 0.06 && Math.abs(o.h - r.h) > 0.5) r.h = o.h;
    }
    // 2) round to whole pixels
    r.w = Math.round(r.w);
    r.h = Math.round(r.h);
    // 3) align to sibling / container edges and centers
    const xs = [];
    const ys = [];
    for (const o of refs) {
      xs.push(o.x, o.x + o.w / 2, o.x + o.w);
      ys.push(o.y, o.y + o.h / 2, o.y + o.h);
    }
    if (box) {
      xs.push(box.x, box.x + box.w / 2, box.x + box.w);
      ys.push(box.y, box.y + box.h / 2, box.y + box.h);
    }
    const TH = 10;
    let best = null;
    for (const [f, off] of [[r.x, 0], [r.x + r.w / 2, r.w / 2], [r.x + r.w, r.w]]) {
      const d = nearest(f, xs, TH);
      if (d != null && (best == null || Math.abs(d) < Math.abs(best))) best = d;
    }
    if (best != null) r.x += best;
    best = null;
    for (const f of [r.y, r.y + r.h / 2, r.y + r.h]) {
      const d = nearest(f, ys, TH);
      if (d != null && (best == null || Math.abs(d) < Math.abs(best))) best = d;
    }
    if (best != null) r.y += best;
    // 4) keep it inside its container (horizontally) and on the page
    if (box && box.w > 20) {
      if (r.w > box.w) r.w = box.w;
      if (r.x < box.x) r.x = box.x;
      if (r.x + r.w > box.x + box.w) r.x = box.x + box.w - r.w;
    }
    if (r.x < 0) r.x = 0;
    if (r.x + r.w > app.vw) r.x = Math.max(0, app.vw - r.w);
    r.x = Math.round(r.x);
    r.y = Math.round(r.y);
    if (st.it.kind === 'el') firstMap.set(st.it.el, st.rect);
    applyRect(st, r);
  }
  // 5) even out nearly-even gaps between things that share a parent
  const byParent = new Map();
  for (const st of states) {
    if (st.it.kind !== 'el') continue;
    const p = st.it.el.parentElement;
    if (!p) continue;
    if (!byParent.has(p)) byParent.set(p, []);
    byParent.get(p).push(st.it.el);
  }
  for (const [p] of byParent) {
    const kids = flowChildren(p);
    if (kids.length < 3) continue;
    const dir = arrangement(kids.map((k) => k.r));
    const sorted = kids.slice().sort((a, b) => (dir === 'row' ? a.r.x - b.r.x : a.r.y - b.r.y));
    const gaps = [];
    let ok = true;
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i].r;
      const b = sorted[i + 1].r;
      const g = dir === 'row' ? b.x - (a.x + a.w) : b.y - (a.y + a.h);
      if (g < -1) ok = false;
      gaps.push(g);
    }
    if (!ok) continue;
    const m = median(gaps);
    const spread = Math.max(...gaps) - Math.min(...gaps);
    if (spread < 1 || spread > 18) continue;
    let pos = dir === 'row' ? sorted[0].r.x : sorted[0].r.y;
    for (const k of sorted) {
      const r = { ...k.r };
      if (dir === 'row') r.x = Math.round(pos);
      else r.y = Math.round(pos);
      pos += (dir === 'row' ? r.w : r.h) + m;
      const moved = dir === 'row' ? Math.abs(r.x - k.r.x) > 0.5 : Math.abs(r.y - k.r.y) > 0.5;
      if (!moved) continue;
      const st = startState(elItem(k.el));
      if (!firstMap.has(k.el)) firstMap.set(k.el, st.rect);
      applyRect(st, r, false);
    }
  }
  commit();
  flip(firstMap);
  return { ok: true, msg: `Tidied ${items.length} thing${items.length === 1 ? '' : 's'}` };
}

// ---- reset everything -----------------------------------------------------------------

export function resetAll() {
  const list = allRecs();
  if (!list.length) return { ok: true, msg: 'Nothing to reset' };
  begin('Reset all');
  const watch = new Set();
  for (const r of list) {
    if (!r.el.isConnected && !r.origParent) continue;
    touch(r.el);
    if (r.el.parentElement) for (const k of r.el.parentElement.children) watch.add(k);
  }
  const first = captureRects([...watch]);
  // put structure back first (reverse order), then styles
  for (let pass = 0; pass < 2; pass++) {
    for (let i = list.length - 1; i >= 0; i--) {
      const r = list[i];
      if (!r.origParent) {
        // a group we made: move its children out, then remove it
        if (r.el.parentNode) {
          for (const n of [...r.el.childNodes]) r.el.parentNode.insertBefore(n, r.el);
          r.el.parentNode.removeChild(r.el);
        }
        continue;
      }
      if (r.el.parentNode !== r.origParent || r.el.nextSibling !== r.origNext) {
        if (r.origNext && r.origNext.parentNode === r.origParent) r.origParent.insertBefore(r.el, r.origNext);
        else r.origParent.appendChild(r.el);
      }
    }
  }
  for (const r of list) {
    if (!r.origParent) continue;
    r.tx = 0;
    r.ty = 0;
    r.w = null;
    r.h = null;
    r.mr = null;
    r.mb = null;
    r.deleted = false;
    r.collapsed = false;
    r.css = {};
    if (r.origStyle == null) r.el.removeAttribute('style');
    else r.el.style.cssText = r.origStyle;
  }
  commit();
  flip(first);
  setSelection(app.sel.filter((s) => s.kind === 'shape' || s.el.isConnected));
  requestCollect();
  requestFull();
  return { ok: true, msg: 'Page put back the way it was' };
}
