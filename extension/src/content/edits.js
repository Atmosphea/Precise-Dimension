// Photoshop-style edits on real page elements.
// Moves use the CSS `translate` property (no reflow). Resizes set an explicit size and
// add compensating margins so neighbours stay exactly where they were.
// Something dragged out of the box it sits in is "pulled out": lifted into the browser's top
// layer, where nothing around it can cut it off or cover it, and out of the page flow, so the
// box it came from closes the gap. It's placed in page coordinates and scrolls with the page.
import { app, requestFull } from './app.js';
import { cssPx, describe, selectorFor, rectOf, dropStyle, settleFlips } from './util.js';

export const recs = new Map();
let seq = 0;
const IMP = 'important';
const r2 = (n) => Math.round(n * 100) / 100;

function nextFlowSibling(el) {
  let n = el.nextElementSibling;
  while (n) {
    if (n !== app.host) {
      try {
        const cs = getComputedStyle(n);
        if (cs.display !== 'none' && cs.position !== 'absolute' && cs.position !== 'fixed') return n;
      } catch {}
    }
    n = n.nextElementSibling;
  }
  return null;
}

export function getRec(el) {
  return recs.get(el) || null;
}

export function ensureRec(el) {
  let rec = recs.get(el);
  if (rec) return rec;
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  const parent = el.parentElement;
  const pcs = parent ? getComputedStyle(parent) : null;
  const display = cs.display;
  const position = cs.position;
  const pDisplay = pcs ? pcs.display : 'block';
  const outOfFlow = position === 'absolute' || position === 'fixed';
  const tablePart = /^table-(cell|row|row-group|header-group|footer-group|column|column-group|caption)$/.test(display);
  const parentFlexGrid = /flex|grid/.test(pDisplay);
  rec = {
    el,
    id: ++seq,
    origStyle: el.getAttribute('style'),
    origParent: el.parentNode,
    origNext: el.nextSibling,
    orig: { x: r.left + window.scrollX, y: r.top + window.scrollY, w: r.width, h: r.height },
    o: {
      display,
      position,
      translate: cs.translate,
      left: cs.left,
      top: cs.top,
      mr: cssPx(cs.marginRight),
      mb: cssPx(cs.marginBottom),
      flexDirection: cs.flexDirection,
      flexWrap: cs.flexWrap,
      justifyContent: cs.justifyContent,
      alignItems: cs.alignItems,
      gap: cs.columnGap,
      rowGap: cs.rowGap,
      pDisplay,
    },
    inFlow: !outOfFlow && !tablePart,
    flexItem: parentFlexGrid && !outOfFlow,
    inline: display === 'inline',
    blockFlow: !parentFlexGrid && !display.startsWith('inline') && cs.float === 'none' && !outOfFlow,
    tx: 0,
    ty: 0,
    w: null,
    h: null,
    mr: null,
    mb: null,
    deleted: false,
    collapsed: false,
    css: {},
    free: null, // pulled out: { left, top } in page px
    fw: null, // its own size while pulled out (unless you resized it)
    fh: null,
    freeCss: null, // how it looked, kept while it's lifted out
    home: null, // the box it was pulled out of
    created: false,
    name: describe(el),
    selector: selectorFor(el),
  };
  recs.set(el, rec);
  return rec;
}

export function markCreated(el) {
  const rec = ensureRec(el);
  rec.created = true;
  rec.origStyle = null;
  rec.origParent = null;
  rec.origNext = null;
  return rec;
}

function composeTranslate(base, tx, ty) {
  const x = r2(tx);
  const y = r2(ty);
  if (!base || base === 'none') return `${x}px ${y}px`;
  const parts = base.trim().split(/\s+/);
  const bx = parts[0] || '0px';
  const by = parts[1] || '0px';
  const bz = parts[2];
  return `calc(${bx} + ${x}px) calc(${by} + ${y}px)${bz ? ' ' + bz : ''}`;
}

export function applyRec(rec) {
  const el = rec.el;
  if (rec.origStyle == null) dropStyle(el);
  else el.style.cssText = rec.origStyle; // CSSOM, so strict page security rules don't block it
  const s = el.style;
  const set = (p, v) => s.setProperty(p, v, IMP);
  const moved = Math.abs(rec.tx) > 0.004 || Math.abs(rec.ty) > 0.004;
  const sized = rec.w != null || rec.h != null;
  if (rec.free) applyFree(rec, set);
  else {
    if (moved) {
      if (rec.inline && !sized && (rec.o.position === 'static' || rec.o.position === 'relative')) {
        // Plain inline text (links, spans) ignores `translate`; a relative nudge moves it the
        // same way without changing the line it sits in.
        const base = (v) => (rec.o.position === 'relative' && /px$/.test(v || '') ? parseFloat(v) : 0);
        set('position', 'relative');
        set('left', r2(base(rec.o.left) + rec.tx) + 'px');
        set('top', r2(base(rec.o.top) + rec.ty) + 'px');
      } else {
        if (rec.inline) set('display', 'inline-block');
        set('translate', composeTranslate(rec.o.translate, rec.tx, rec.ty));
      }
    }
    if (sized) {
      set('box-sizing', 'border-box');
      if (rec.inline) set('display', 'inline-block');
      if (rec.flexItem) {
        set('flex-grow', '0');
        set('flex-shrink', '0');
        set('flex-basis', 'auto');
      }
    }
    if (rec.w != null) {
      set('width', r2(rec.w) + 'px');
      set('min-width', '0px');
      set('max-width', 'none');
    }
    if (rec.h != null) {
      set('height', r2(rec.h) + 'px');
      set('min-height', '0px');
      set('max-height', 'none');
    }
    if (rec.mr != null) set('margin-right', r2(rec.mr) + 'px');
    if (rec.mb != null) set('margin-bottom', r2(rec.mb) + 'px');
  }
  // the page's own animations would make moved things lag behind the mouse
  if (moved || sized || rec.free) set('transition', 'none');
  for (const p in rec.css) set(p, rec.css[p]);
  if (rec.deleted && !rec.collapsed) {
    set('visibility', 'hidden');
    set('pointer-events', 'none');
  }
  if (rec.collapsed) set('display', 'none');
  syncPop(el, rec);
}

// ---- pulled out of its box -------------------------------------------------------------------

const px4 = (n) => +n.toFixed(4) + 'px'; // exact: a hair narrower and words would wrap
const ourPop = new WeakSet(); // elements we gave the popover attribute
const NO_PULL = new Set(['HTML', 'BODY', 'DIALOG', 'OPTION', 'OPTGROUP', 'TD', 'TH', 'TR', 'THEAD', 'TBODY', 'TFOOT', 'COL', 'COLGROUP', 'CAPTION', 'AREA', 'SUMMARY', 'LEGEND']);
// The browser styles popovers itself (a border, padding, white background, its own text colour):
// these keep the look the element had in the page.
const FREEZE = [
  'color', 'background-color',
  'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
  'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style',
  'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'overflow-x', 'overflow-y',
];

function applyFree(rec, set) {
  set('position', 'absolute');
  set('left', r2(rec.free.left) + 'px');
  set('top', r2(rec.free.top) + 'px');
  set('right', 'auto');
  set('bottom', 'auto');
  set('margin', '0px');
  set('float', 'none');
  set('box-sizing', 'border-box');
  const w = rec.w != null ? rec.w : rec.fw;
  const h = rec.h != null ? rec.h : rec.fh;
  if (w != null) {
    set('width', rec.w != null ? r2(w) + 'px' : px4(w));
    set('min-width', '0px');
    set('max-width', 'none');
  }
  if (h != null) {
    set('height', rec.h != null ? r2(h) + 'px' : px4(h));
    set('min-height', '0px');
    set('max-height', 'none');
  }
  for (const p in rec.freeCss || {}) set(p, rec.freeCss[p]);
}

function popOpen(el) {
  try {
    return el.matches(':popover-open');
  } catch {
    return false;
  }
}

// Make the element's top-layer state match its record.
function syncPop(el, rec) {
  if (rec && rec.free) {
    if (!el.isConnected) return;
    if (!el.hasAttribute('popover')) {
      el.setAttribute('popover', 'manual');
      ourPop.add(el);
    }
    if (!popOpen(el)) {
      try {
        el.showPopover();
      } catch {}
      raiseHost();
    }
  } else if (ourPop.has(el)) {
    if (popOpen(el)) {
      try {
        el.hidePopover();
      } catch {}
    }
    el.removeAttribute('popover');
    ourPop.delete(el);
  }
}

// Our overlay has to stay above anything pulled out, so it joins the top layer too, last.
export function raiseHost() {
  const h = app.host;
  if (!h || !h.isConnected || typeof h.showPopover !== 'function') return;
  try {
    if (!h.hasAttribute('popover')) h.setAttribute('popover', 'manual');
    if (popOpen(h)) h.hidePopover();
    h.showPopover();
  } catch {}
}

export function hasFree() {
  for (const r of recs.values()) if (r.free && r.el.isConnected) return true;
  return false;
}

export function isFree(el) {
  const r = recs.get(el);
  return !!(r && r.free);
}

export function freeEls() {
  return [...recs.values()].filter((r) => r.free && r.el.isConnected).map((r) => r.el);
}

export function canPull(el) {
  if (!el || !el.isConnected || typeof el.showPopover !== 'function' || !(el instanceof HTMLElement)) return false;
  if (NO_PULL.has(el.tagName)) return false;
  if (el.hasAttribute('popover') && !ourPop.has(el)) return false;
  let cs;
  try {
    cs = getComputedStyle(el);
  } catch {
    return false;
  }
  return !/^(table-|none$|contents$)/.test(cs.display);
}

// Lift it out of its box, right where it is on screen now. op.base switches to page coordinates.
export function pullOut(op, home) {
  const { rec, el } = op;
  if (rec.free) return true;
  if (!canPull(el)) return false;
  settleFlips();
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  const flat = cs.transform === 'none' && (cs.rotate || 'none') === 'none' && (cs.scale || 'none') === 'none';
  const freeze = {};
  for (const p of FREEZE) freeze[p] = cs.getPropertyValue(p);
  rec.fw = flat ? r.width : el.offsetWidth;
  rec.fh = flat ? r.height : el.offsetHeight;
  if (cs.display === 'inline') {
    // a line of text on its own: keep the words exactly where they were
    if (el.getClientRects().length <= 1) {
      const pad = cssPx(cs.paddingTop) + cssPx(cs.paddingBottom) + cssPx(cs.borderTopWidth) + cssPx(cs.borderBottomWidth);
      freeze['line-height'] = Math.max(1, rec.fh - pad) + 'px';
      freeze['white-space'] = 'nowrap';
    } else rec.fh = null;
  }
  rec.freeCss = freeze;
  rec.home = home || el.parentElement;
  rec.free = { left: r.left + window.scrollX, top: r.top + window.scrollY };
  applyRec(rec);
  // land exactly where it was (margins, borders and the page's own transforms)
  const now = el.getBoundingClientRect();
  rec.free = { left: rec.free.left + (r.left - now.left), top: rec.free.top + (r.top - now.top) };
  applyRec(rec);
  if (!popOpen(el)) {
    // the browser said no: leave it in the page
    rec.free = null;
    applyRec(rec);
    return false;
  }
  op.base = { free: true, left: rec.free.left, top: rec.free.top, x: r.left, y: r.top };
  requestFull();
  return true;
}

// Back into its box: the gap opens again and it sits in its own spot (plus any move).
export function putBack(op) {
  const { rec, el } = op;
  if (!rec.free) return;
  rec.free = null;
  rec.tx = 0;
  rec.ty = 0;
  applyRec(rec);
  const r = rectOf(el);
  op.base = { free: false, tx: 0, ty: 0, x: r.x, y: r.y };
  requestFull();
}

// ---- operations -------------------------------------------------------------

export function beginOp(el) {
  const rec = ensureRec(el);
  const rect = rectOf(el);
  const next = rec.inFlow && !rec.free ? nextFlowSibling(el) : null;
  const parent = el.parentElement;
  return {
    el,
    rec,
    // what moves are measured from: its translate in the page flow, or its spot when pulled out
    base: rec.free ? { free: true, left: rec.free.left, top: rec.free.top, x: rect.x, y: rect.y } : { free: false, tx: rec.tx, ty: rec.ty, x: rect.x, y: rect.y },
    start: { rect, tx: rec.tx, ty: rec.ty, w: rec.w, h: rec.h, mr: rec.mr, mb: rec.mb },
    next,
    next0: next ? rectOf(next) : null,
    parent,
    parent0: parent ? rectOf(parent) : null,
  };
}

export function moveTo(op, x, y) {
  const { rec } = op;
  const b = op.base;
  if (rec.free && b.free) {
    rec.free = { left: b.left + (x - b.x), top: b.top + (y - b.y) };
  } else {
    rec.tx = b.tx + (x - b.x);
    rec.ty = b.ty + (y - b.y);
  }
  applyRec(rec);
}

function residual(op) {
  const { next, next0, parent, parent0, start } = op;
  // layout position of the element at op start (without our own translate)
  const ex = start.rect.x - start.tx;
  const ey = start.rect.y - start.ty;
  const er = { x: ex, y: ey, w: start.rect.w, h: start.rect.h };
  let rx = 0;
  let ry = 0;
  const p = parent && parent0 ? rectOf(parent) : null;
  if (next && next0 && next.isConnected) {
    const n = rectOf(next);
    const sameRow = next0.y < er.y + er.h - 1 && next0.x >= er.x + er.w - 1.5;
    if (sameRow) {
      rx = n.x - next0.x;
      if (p) ry = p.h - parent0.h;
    } else {
      ry = n.y - next0.y;
      if (p) rx = p.w - parent0.w;
    }
  } else if (p) {
    rx = p.w - parent0.w;
    ry = p.h - parent0.h;
  }
  return { rx, ry };
}

// Resize (and position) an element to the target viewport rect without moving its neighbours.
export function resizeTo(op, t) {
  const { rec, el, start } = op;
  const changeW = Math.abs(t.w - start.rect.w) > 0.05;
  const changeH = Math.abs(t.h - start.rect.h) > 0.05;
  rec.w = changeW ? Math.max(1, t.w) : start.w;
  rec.h = changeH ? Math.max(1, t.h) : start.h;
  if (rec.free) {
    // out of the flow: nothing around it needs to be kept in place
    applyRec(rec);
    const now = rectOf(el);
    rec.free = { left: rec.free.left + (t.x - now.x), top: rec.free.top + (t.y - now.y) };
    applyRec(rec);
    requestFull();
    return;
  }
  if (rec.inFlow) {
    const dW = (changeW ? rec.w : start.rect.w) - start.rect.w;
    const dH = (changeH ? rec.h : start.rect.h) - start.rect.h;
    const baseMr = start.mr != null ? start.mr : rec.o.mr;
    const baseMb = start.mb != null ? start.mb : rec.o.mb;
    rec.mr = changeW && !rec.blockFlow ? baseMr - dW : start.mr;
    rec.mb = changeH ? baseMb - dH : start.mb;
    applyRec(rec);
    for (let i = 0; i < 3; i++) {
      const { rx, ry } = residual(op);
      if (Math.abs(rx) < 0.4 && Math.abs(ry) < 0.4) break;
      if (Math.abs(rx) >= 0.4) rec.mr = (rec.mr != null ? rec.mr : rec.o.mr) - rx;
      if (Math.abs(ry) >= 0.4) rec.mb = (rec.mb != null ? rec.mb : rec.o.mb) - ry;
      applyRec(rec);
    }
  } else {
    applyRec(rec);
  }
  const now = rectOf(el);
  rec.tx += t.x - now.x;
  rec.ty += t.y - now.y;
  applyRec(rec);
  requestFull();
}

// One call for "put this element exactly here at this size".
export function setElementRect(el, t) {
  const op = beginOp(el);
  if (Math.abs(t.w - op.start.rect.w) > 0.05 || Math.abs(t.h - op.start.rect.h) > 0.05) resizeTo(op, t);
  else moveTo(op, t.x, t.y);
  requestFull();
}

export function setDeleted(el, on) {
  const rec = ensureRec(el);
  rec.deleted = on;
  applyRec(rec);
  requestFull();
}

export function setCss(el, props) {
  const rec = ensureRec(el);
  for (const p in props) {
    if (props[p] == null) delete rec.css[p];
    else rec.css[p] = props[p];
  }
  applyRec(rec);
  requestFull();
}

export function isEdited(rec) {
  return (
    rec.created ||
    Math.abs(rec.tx) > 0.5 ||
    Math.abs(rec.ty) > 0.5 ||
    rec.w != null ||
    rec.h != null ||
    rec.deleted ||
    rec.collapsed ||
    !!rec.free ||
    Object.keys(rec.css).length > 0 ||
    rec.el.parentNode !== rec.origParent
  );
}

// ---- snapshots for undo -------------------------------------------------------

function cloneRec(rec) {
  return { ...rec, css: { ...rec.css }, free: rec.free ? { ...rec.free } : null };
}

export function snapshot(el) {
  const rec = recs.get(el);
  return {
    style: el.getAttribute('style'),
    parent: el.parentNode,
    next: el.nextSibling,
    rec: rec ? cloneRec(rec) : null,
  };
}

export function sameSnapshot(a, b) {
  if (a.style !== b.style || a.parent !== b.parent || a.next !== b.next) return false;
  const ra = a.rec;
  const rb = b.rec;
  if (!ra || !rb) return !ra && !rb;
  return (
    ra.tx === rb.tx && ra.ty === rb.ty && ra.w === rb.w && ra.h === rb.h && ra.mr === rb.mr && ra.mb === rb.mb &&
    ra.deleted === rb.deleted && ra.collapsed === rb.collapsed && JSON.stringify(ra.css) === JSON.stringify(rb.css) &&
    JSON.stringify(ra.free) === JSON.stringify(rb.free) && ra.fw === rb.fw && ra.fh === rb.fh
  );
}

export function restoreDom(el, snap) {
  if (!snap.parent) {
    if (el.parentNode) el.parentNode.removeChild(el);
    return;
  }
  if (el.parentNode === snap.parent && el.nextSibling === snap.next) return;
  if (snap.next && snap.next.parentNode === snap.parent) snap.parent.insertBefore(el, snap.next);
  else snap.parent.appendChild(el);
}

export function restoreState(el, snap) {
  if (snap.style == null) dropStyle(el);
  else el.style.cssText = snap.style;
  if (snap.rec) recs.set(el, cloneRec(snap.rec));
  else recs.delete(el);
  syncPop(el, snap.rec);
}

export function allRecs() {
  return [...recs.values()].sort((a, b) => a.id - b.id);
}
