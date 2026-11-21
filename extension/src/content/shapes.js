// Boxes the user draws. Page boxes live in page coordinates (they scroll with the page);
// canvas boxes live on the blank dot-grid board.
import { app, requestRender } from './app.js';

let nextId = 1;

export function space() {
  return app.state.canvasMode ? 'canvas' : 'page';
}

export function activeShapes() {
  return app.shapes[space()];
}

export function createShape(vr, sp = space()) {
  const s = {
    id: nextId++,
    space: sp,
    x: vr.x + (sp === 'page' ? window.scrollX : 0),
    y: vr.y + (sp === 'page' ? window.scrollY : 0),
    w: vr.w,
    h: vr.h,
    born: performance.now(),
  };
  app.shapes[sp].push(s);
  requestRender();
  return s;
}

export function shapeRect(s) {
  if (s.space === 'page') return { x: s.x - window.scrollX, y: s.y - window.scrollY, w: s.w, h: s.h };
  return { x: s.x, y: s.y, w: s.w, h: s.h };
}

export function setShapeRect(s, r) {
  s.x = r.x + (s.space === 'page' ? window.scrollX : 0);
  s.y = r.y + (s.space === 'page' ? window.scrollY : 0);
  s.w = Math.max(1, r.w);
  s.h = Math.max(1, r.h);
  requestRender();
}

export function removeShape(s) {
  const list = app.shapes[s.space];
  const i = list.indexOf(s);
  if (i >= 0) list.splice(i, 1);
  requestRender();
}

export function shapeAt(x, y, tol = 3) {
  const list = activeShapes();
  for (let i = list.length - 1; i >= 0; i--) {
    const r = shapeRect(list[i]);
    if (x >= r.x - tol && x <= r.x + r.w + tol && y >= r.y - tol && y <= r.y + r.h + tol) return list[i];
  }
  return null;
}

export function cloneShapes() {
  return {
    page: app.shapes.page.map((s) => ({ ...s })),
    canvas: app.shapes.canvas.map((s) => ({ ...s })),
    nextId,
  };
}

export function restoreShapes(snap) {
  // Keep object identity where ids match so selections stay valid.
  for (const sp of ['page', 'canvas']) {
    const byId = new Map(app.shapes[sp].map((s) => [s.id, s]));
    app.shapes[sp] = snap[sp].map((d) => {
      const s = byId.get(d.id) || {};
      return Object.assign(s, d);
    });
  }
  requestRender();
}

export function findShapeById(id) {
  return app.shapes.page.find((s) => s.id === id) || app.shapes.canvas.find((s) => s.id === id) || null;
}

export function duplicateShape(s, dx = 16, dy = 16) {
  const r = shapeRect(s);
  return createShape({ x: r.x + dx, y: r.y + dy, w: r.w, h: r.h }, s.space);
}
