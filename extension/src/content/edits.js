// Photoshop-style edits on real page elements.
// Moves use the CSS `translate` property (no reflow). Resizes set an explicit size and
// add compensating margins so neighbours stay exactly where they were.
import { app, requestFull } from './app.js';
import { cssPx, describe, selectorFor, rectOf } from './util.js';

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
  if (rec.origStyle == null) el.removeAttribute('style');
  else el.style.cssText = rec.origStyle; // CSSOM, so strict page security rules don't block it
  const s = el.style;
  const set = (p, v) => s.setProperty(p, v, IMP);
  const moved = Math.abs(rec.tx) > 0.004 || Math.abs(rec.ty) > 0.004;
  const sized = rec.w != null || rec.h != null;
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
  for (const p in rec.css) set(p, rec.css[p]);
  if (rec.deleted && !rec.collapsed) {
    set('visibility', 'hidden');
    set('pointer-events', 'none');
  }
  if (rec.collapsed) set('display', 'none');
}

// ---- operations -------------------------------------------------------------

export function beginOp(el) {
  const rec = ensureRec(el);
  const rect = rectOf(el);
  const next = rec.inFlow ? nextFlowSibling(el) : null;
  const parent = el.parentElement;
  return {
    el,
    rec,
    start: { rect, tx: rec.tx, ty: rec.ty, w: rec.w, h: rec.h, mr: rec.mr, mb: rec.mb },
    next,
    next0: next ? rectOf(next) : null,
    parent,
    parent0: parent ? rectOf(parent) : null,
  };
}

export function moveTo(op, x, y) {
  const { rec, start } = op;
  rec.tx = start.tx + (x - start.rect.x);
  rec.ty = start.ty + (y - start.rect.y);
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
    Object.keys(rec.css).length > 0 ||
    rec.el.parentNode !== rec.origParent
  );
}

// ---- snapshots for undo -------------------------------------------------------

function cloneRec(rec) {
  return { ...rec, css: { ...rec.css } };
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
    ra.deleted === rb.deleted && ra.collapsed === rb.collapsed && JSON.stringify(ra.css) === JSON.stringify(rb.css)
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
  if (snap.style == null) el.removeAttribute('style');
  else el.style.cssText = snap.style;
  if (snap.rec) recs.set(el, cloneRec(snap.rec));
  else recs.delete(el);
}

export function allRecs() {
  return [...recs.values()].sort((a, b) => a.id - b.id);
}
