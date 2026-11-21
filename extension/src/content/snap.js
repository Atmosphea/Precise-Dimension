// Smart snapping to nearby edges and centers, with pink guide lines.
import { app, minLevel } from './app.js';
import { activeShapes, shapeRect } from './shapes.js';
import { deepContains } from './util.js';

export const SNAP = 5;

export function buildTargets(movingItems = []) {
  const xs = [];
  const ys = [];
  const movingEls = movingItems.filter((i) => i.kind === 'el').map((i) => i.el);
  const movingShapes = new Set(movingItems.filter((i) => i.kind === 'shape').map((i) => i.shape));
  const add = (r) => {
    xs.push({ v: r.x, r }, { v: r.x + r.w / 2, r }, { v: r.x + r.w, r });
    ys.push({ v: r.y, r }, { v: r.y + r.h / 2, r }, { v: r.y + r.h, r });
  };
  const view = { x: 0, y: 0, w: app.vw, h: app.vh };
  xs.push({ v: app.vw / 2, r: view });
  ys.push({ v: app.vh / 2, r: view });
  if (app.state.canvasMode) {
    xs.push({ v: 0, r: view }, { v: app.vw, r: view });
    ys.push({ v: 0, r: view }, { v: app.vh, r: view });
  }
  for (const s of activeShapes()) if (!movingShapes.has(s)) add(shapeRect(s));
  if (!app.state.canvasMode) {
    let n = 0;
    const L = minLevel();
    for (const c of app.cands) {
      if (c.dup || c.w * c.h < 300 || c.lv < L) continue;
      if (c.x > app.vw || c.y > app.vh || c.x + c.w < 0 || c.y + c.h < 0) continue;
      if (movingEls.some((m) => deepContains(m, c.el))) continue;
      add({ x: c.x, y: c.y, w: c.w, h: c.h });
      if (++n > 800) break;
    }
  }
  return { xs, ys };
}

function bestSnap(features, list) {
  let best = null;
  for (const f of features) {
    for (const t of list) {
      const d = t.v - f;
      const ad = Math.abs(d);
      if (ad <= SNAP && (!best || ad < Math.abs(best.d))) best = { d, v: t.v, r: t.r };
    }
  }
  return best;
}

function vLine(v, a, b) {
  const y1 = Math.min(a.y, b.y);
  const y2 = Math.max(a.y + a.h, b.y + b.h);
  return { x1: v, y1, x2: v, y2 };
}
function hLine(v, a, b) {
  const x1 = Math.min(a.x, b.x);
  const x2 = Math.max(a.x + a.w, b.x + b.w);
  return { x1, y1: v, x2, y2: v };
}

// Snap a moving box. Returns the corrected offset and guide lines.
export function snapMove(rect, targets) {
  const sx = bestSnap([rect.x, rect.x + rect.w / 2, rect.x + rect.w], targets.xs);
  const sy = bestSnap([rect.y, rect.y + rect.h / 2, rect.y + rect.h], targets.ys);
  const dx = sx ? sx.d : 0;
  const dy = sy ? sy.d : 0;
  const moved = { x: rect.x + dx, y: rect.y + dy, w: rect.w, h: rect.h };
  const lines = [];
  if (sx) lines.push(vLine(sx.v, moved, sx.r));
  if (sy) lines.push(hLine(sy.v, moved, sy.r));
  return { dx, dy, lines };
}

// Snap specific edges of a box being resized. edges: { l, r, t, b }
export function snapEdges(rect, edges, targets) {
  let { x, y, w, h } = rect;
  const lines = [];
  if (edges.l) {
    const s = bestSnap([x], targets.xs);
    if (s) {
      w -= s.d;
      x += s.d;
      lines.push(vLine(s.v, { x, y, w, h }, s.r));
    }
  } else if (edges.r) {
    const s = bestSnap([x + w], targets.xs);
    if (s) {
      w += s.d;
      lines.push(vLine(s.v, { x, y, w, h }, s.r));
    }
  }
  if (edges.t) {
    const s = bestSnap([y], targets.ys);
    if (s) {
      h -= s.d;
      y += s.d;
      lines.push(hLine(s.v, { x, y, w, h }, s.r));
    }
  } else if (edges.b) {
    const s = bestSnap([y + h], targets.ys);
    if (s) {
      h += s.d;
      lines.push(hLine(s.v, { x, y, w, h }, s.r));
    }
  }
  return { rect: { x, y, w: Math.max(1, w), h: Math.max(1, h) }, lines, snappedX: lines.some((l) => l.x1 === l.x2), snappedY: lines.some((l) => l.y1 === l.y2) };
}
