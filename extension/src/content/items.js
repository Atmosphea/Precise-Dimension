// An "item" is anything you can select: a real page element or a box you drew.
import { app, requestRender, requestFull } from './app.js';
import { rectOf, union } from './util.js';
import { shapeRect, setShapeRect } from './shapes.js';
import { beginOp, moveTo, resizeTo } from './edits.js';
import { touch, touchShapes } from './history.js';

export const elItem = (el) => ({ kind: 'el', el });
export const shapeItem = (shape) => ({ kind: 'shape', shape });

export function same(a, b) {
  return !!a && !!b && a.kind === b.kind && (a.kind === 'el' ? a.el === b.el : a.shape === b.shape);
}

export function itemRect(it) {
  return it.kind === 'el' ? rectOf(it.el) : shapeRect(it.shape);
}

export function isSelected(it) {
  return app.sel.some((s) => same(s, it));
}

let selListeners = new Set();
export function onSelection(fn) {
  selListeners.add(fn);
}

export function setSelection(items) {
  // drop duplicates and elements inside other selected elements
  const out = [];
  for (const it of items) {
    if (!it) continue;
    if (out.some((o) => same(o, it))) continue;
    out.push(it);
  }
  app.sel = out;
  for (const fn of selListeners) fn();
  requestRender();
}

export function toggleSelected(it) {
  if (isSelected(it)) setSelection(app.sel.filter((s) => !same(s, it)));
  else setSelection([...app.sel, it]);
}

export function selectionRect(items = app.sel) {
  return union(items.map(itemRect));
}

// Start state for a drag/transform. Records history snapshots too.
export function startState(it) {
  if (it.kind === 'el') {
    touch(it.el);
    const op = beginOp(it.el);
    return { it, rect: op.start.rect, op };
  }
  touchShapes();
  return { it, rect: shapeRect(it.shape) };
}

export function applyRect(st, r, resize = null) {
  const it = st.it;
  if (it.kind === 'shape') {
    setShapeRect(it.shape, r);
    return;
  }
  const isResize = resize != null ? resize : Math.abs(r.w - st.rect.w) > 0.05 || Math.abs(r.h - st.rect.h) > 0.05;
  if (isResize) resizeTo(st.op, r);
  else moveTo(st.op, r.x, r.y);
  requestFull();
}

export function itemCtx(it) {
  if (it.kind === 'shape') return { pw: app.vw, ph: app.vh, fs: app.rootFS };
  const c = app.candByEl.get(it.el);
  if (c) return c;
  const p = it.el.parentElement;
  let pw = app.vw;
  let ph = app.vh;
  if (p) {
    const cs = getComputedStyle(p);
    pw = p.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) || app.vw;
    ph = p.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) || app.vh;
  }
  let fs = app.rootFS;
  try {
    fs = parseFloat(getComputedStyle(it.el).fontSize) || fs;
  } catch {}
  return { pw, ph, fs };
}
