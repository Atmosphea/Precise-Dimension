// Undo / redo for page edits and drawn boxes.
import { app, requestCollect, requestFull } from './app.js';
import { snapshot, sameSnapshot, restoreDom, restoreState } from './edits.js';
import { cloneShapes, restoreShapes, findShapeById } from './shapes.js';

const undoStack = [];
const redoStack = [];
let cur = null;
const listeners = new Set();

export function onHistory(fn) {
  listeners.add(fn);
}
function notify() {
  for (const fn of listeners) fn();
}

export function begin(label) {
  if (cur) commit();
  cur = { label, els: new Map(), shapes: null, selBefore: app.sel.slice() };
  return cur;
}

export function inTx() {
  return !!cur;
}

export function touch(el) {
  if (!cur || !el) return;
  if (!cur.els.has(el)) cur.els.set(el, { before: snapshot(el), after: null });
}

export function touchShapes() {
  if (!cur || cur.shapes) return;
  cur.shapes = { before: cloneShapes(), after: null };
}

export function commit() {
  if (!cur) return false;
  const t = cur;
  cur = null;
  let changed = false;
  for (const [el, e] of t.els) {
    e.after = snapshot(el);
    if (!sameSnapshot(e.before, e.after)) changed = true;
  }
  if (t.shapes) {
    t.shapes.after = cloneShapes();
    if (JSON.stringify(t.shapes.before.page) !== JSON.stringify(t.shapes.after.page) ||
        JSON.stringify(t.shapes.before.canvas) !== JSON.stringify(t.shapes.after.canvas)) changed = true;
  }
  if (!changed) return false;
  t.selAfter = app.sel.slice();
  undoStack.push(t);
  if (undoStack.length > 200) undoStack.shift();
  redoStack.length = 0;
  notify();
  return true;
}

export function cancel() {
  if (!cur) return;
  const t = cur;
  cur = null;
  apply(t, 'before');
}

function apply(t, which) {
  const entries = [...t.els.entries()];
  // Two passes so elements whose next sibling is itself being restored land in order.
  for (let pass = 0; pass < 2; pass++) {
    for (let i = entries.length - 1; i >= 0; i--) {
      const [el, e] = entries[i];
      restoreDom(el, e[which]);
    }
  }
  for (const [el, e] of entries) restoreState(el, e[which]);
  if (t.shapes) restoreShapes(t.shapes[which]);
  const sel = which === 'before' ? t.selBefore : t.selAfter || t.selBefore;
  app.sel = (sel || [])
    .map((it) => (it.kind === 'shape' ? { kind: 'shape', shape: findShapeById(it.shape.id) } : it))
    .filter((it) => (it.kind === 'shape' ? !!it.shape : it.el.isConnected));
  requestCollect();
  requestFull();
}

export function undo() {
  if (cur) commit();
  const t = undoStack.pop();
  if (!t) return false;
  apply(t, 'before');
  redoStack.push(t);
  notify();
  return true;
}

export function redo() {
  const t = redoStack.pop();
  if (!t) return false;
  apply(t, 'after');
  undoStack.push(t);
  notify();
  return true;
}

export function canUndo() {
  return undoStack.length > 0;
}
export function canRedo() {
  return redoStack.length > 0;
}
