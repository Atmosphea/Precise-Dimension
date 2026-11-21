// Mouse, keyboard and wheel handling: drawing boxes, picking page elements, moving,
// resizing, spacing, marquee selection, nudging and shortcuts.
import { app, requestRender, requestFull, requestCollect, minLevel } from './app.js';
import { hub } from './hub.js';
import { normRect, union, containsPt, containsRect, overlaps, isRootish, isOurs, pageIsTyping, describe, deepContains, parentOf, parentPick, hasPaint, rectOf, settleFlips } from './util.js';
import { createShape, removeShape, shapeAt, shapeRect, activeShapes, duplicateShape } from './shapes.js';
import { elItem, shapeItem, same, itemRect, isSelected, setSelection, toggleSelected, startState, applyRect, itemCtx } from './items.js';
import { begin, commit, cancel, undo, redo, canUndo, canRedo, touch, touchShapes } from './history.js';
import { buildTargets, snapMove, snapEdges, SNAP } from './snap.js';
import { snapToUnit, unitStep } from './units.js';
import { setDeleted, beginOp, applyRec, moveTo, pullOut, putBack, canPull, isFree } from './edits.js';
import { computeSpacing, alikeBase } from './render.js';
import { alikeOf, alikeLabel } from './alike.js';
import { captureRects, flip } from './tools.js';

let lastUp = { t: 0, x: -99, y: -99, click: false, count: 0 };
let cursor = '';
let toldPull = false;
const MULTI_MS = 500; // clicks closer together than this count as a double (triple, …) click
const PULL = 6; // how far past the edge of its box the mouse goes before something is pulled out

export function interactive() {
  const st = app.state;
  return st.canvasMode || st.mode === 'draw' || st.mode === 'change';
}

function overUI(e) {
  const path = e.composedPath ? e.composedPath() : [];
  for (const n of path) {
    if (n === app.layer) return false;
    if (n === app.host) return false;
    if (n.classList && n.classList.contains('ui')) return true;
  }
  return false;
}

// The page element under a point (skipping our own overlay), climbed to something we measured
// at the current detail level (at "Sections", anything inside a section picks the section).
export function pickElement(x, y, min = minLevel()) {
  let list;
  try {
    list = document.elementsFromPoint(x, y);
  } catch {
    return null;
  }
  let hit = null;
  for (const el of list) {
    if (el === app.host) continue;
    hit = el;
    break;
  }
  if (!hit) return null;
  for (let i = 0; i < 6 && hit.shadowRoot; i++) {
    let inner = null;
    try {
      inner = hit.shadowRoot.elementsFromPoint(x, y).find((e) => e !== hit && hit.shadowRoot.contains(e));
    } catch {}
    if (!inner) break;
    hit = inner;
  }
  let e = hit;
  while (e && !isRootish(e)) {
    const c = app.candByEl.get(e);
    if (c && c.lv >= min) return e;
    e = parentOf(e);
  }
  return null;
}

export { parentPick };

function itemAt(x, y) {
  const s = shapeAt(x, y, 2);
  if (s) return shapeItem(s);
  if (app.state.mode === 'change' && !app.state.canvasMode) {
    const el = pickElement(x, y);
    if (el) return elItem(el);
  }
  return null;
}

function liveSel() {
  return app.sel.filter((it) => it.kind === 'shape' || it.el.isConnected);
}

function selBounds() {
  const items = liveSel();
  return items.length ? union(items.map(itemRect)) : null;
}

function findHot(x, y) {
  if (!interactive() || app.state.capturing) return null;
  const B = selBounds();
  if (B) {
    const corners = [
      [B.x, B.y, 'nw'],
      [B.x + B.w, B.y, 'ne'],
      [B.x, B.y + B.h, 'sw'],
      [B.x + B.w, B.y + B.h, 'se'],
    ];
    for (const [cx, cy, corner] of corners) {
      if (Math.abs(x - cx) <= 7 && Math.abs(y - cy) <= 7) return { type: 'corner', corner };
    }
  }
  if (app.spacing && app.sel.length >= 2) {
    for (let i = 0; i < app.spacing.gaps.length; i++) {
      const g = app.spacing.gaps[i];
      const ax = app.spacing.axis === 'x';
      if (Math.abs(x - g.x) <= (ax ? 6 : 10) && Math.abs(y - g.y) <= (ax ? 10 : 6)) return { type: 'spacing', i, axis: app.spacing.axis };
    }
  }
  // the selection's own handles first, then any other handle under the cursor
  let best = null;
  for (const pass of [true, false]) {
    let bd = 10;
    for (const a of app.arrows) {
      if (pass && !a.sel) continue;
      const d = Math.hypot(x - a.x, y - a.y);
      if (d < bd) {
        bd = d;
        best = a;
      }
    }
    if (best) break;
  }
  if (best) return { type: 'edge', it: best.it, edge: best.edge, x: best.x, y: best.y, f: best.f, exact: !!best.exact };
  for (const c of app.chips) if (containsPt(c, x, y, 1)) return { type: 'chip', chip: c };
  return null;
}

function setCursor(c) {
  if (c === cursor || !app.layer) return;
  cursor = c;
  app.layer.style.cursor = c;
}

function cursorFor(hot, item) {
  if (!interactive()) return '';
  if (hot) {
    if (hot.type === 'corner') return hot.corner === 'nw' || hot.corner === 'se' ? 'nwse-resize' : 'nesw-resize';
    if (hot.type === 'edge') return hot.edge === 'l' || hot.edge === 'r' ? 'ew-resize' : 'ns-resize';
    if (hot.type === 'spacing') return hot.axis === 'x' ? 'col-resize' : 'row-resize';
    if (hot.type === 'chip') return 'text';
  }
  if (item && (item.kind === 'shape' || isSelected(item))) return 'move';
  if (app.state.mode === 'change' && !app.state.canvasMode) return item ? 'pointer' : 'default';
  return 'crosshair';
}

function updateHover(x, y) {
  const st = app.state;
  const hot = findHot(x, y);
  app.hot = hot;
  let hover = null;
  let item = null;
  if (!st.canvasMode && (st.mode === 'measure' || st.mode === 'change')) {
    const el = pickElement(x, y);
    if (el) hover = elItem(el);
  }
  if (interactive()) {
    const s = shapeAt(x, y, 2);
    item = s ? shapeItem(s) : st.mode === 'change' && !st.canvasMode ? hover : null;
  }
  if (!same(hover, app.hover)) app.hover = hover;
  setCursor(cursorFor(hot, item));
  requestRender();
}

function sameHot(a, b) {
  if (!a || !b) return a === b;
  if (a.type !== b.type) return false;
  if (a.type === 'edge') return a.edge === b.edge && same(a.it, b.it);
  if (a.type === 'corner') return a.corner === b.corner;
  if (a.type === 'spacing') return a.i === b.i;
  if (a.type === 'chip') return a.chip.x === b.chip.x && a.chip.y === b.chip.y;
  return true;
}

// The handles are worked out while drawing, just after the mouse moved. If one has landed under
// a mouse that's now standing still, update what a press would grab (and the cursor) right away,
// instead of waiting for the next mouse move.
function refreshHot() {
  if (app.drag || !app.mouse.inside || !app.state.open || app.state.capturing) return;
  if (!sameHot(findHot(app.mouse.x, app.mouse.y), app.hot)) updateHover(app.mouse.x, app.mouse.y);
}

function setMouse(x, y, inside) {
  app.mouse.x = x;
  app.mouse.y = y;
  app.mouse.inside = inside;
}

// Alt (Option on a Mac) and Shift change what a click picks, so the hover shows that ahead of time.
function setMods(e) {
  const alt = !!e.altKey;
  const shift = !!e.shiftKey;
  if (app.mods.alt === alt && app.mods.shift === shift) return;
  app.mods = { alt, shift };
  requestRender();
}

// ---- pointer --------------------------------------------------------------------------

function onDown(e) {
  if (e.button !== 0 || !interactive() || app.state.closing || app.state.capturing) return;
  e.preventDefault();
  hub.closeEditor(true);
  try {
    app.layer.setPointerCapture(e.pointerId);
  } catch {}
  const x = e.clientX;
  const y = e.clientY;
  setMouse(x, y, true);
  const now = performance.now();
  const dbl = now - lastUp.t < MULTI_MS && Math.hypot(x - lastUp.x, y - lastUp.y) < 12;
  // double, triple, quadruple click: each extra click climbs one box further out
  const count = dbl && lastUp.click ? lastUp.count + 1 : 1;
  let hot = findHot(x, y);
  if (hot && hot.type === 'chip' && e.shiftKey) hot = null; // Shift-click always means "add to selection"
  const item = !hot || hot.type === 'chip' ? itemAt(x, y) : null;
  app.drag = {
    type: 'pending',
    sx: x,
    sy: y,
    x,
    y,
    hot,
    item,
    shift: e.shiftKey,
    alt: e.altKey,
    mod: e.metaKey || e.ctrlKey,
    dbl,
    count,
    pointerId: e.pointerId,
  };
  requestRender();
}

function onMove(e) {
  if (!app.state.open) return;
  const x = e.clientX;
  const y = e.clientY;
  setMods(e);
  const d = app.drag;
  if (d) {
    if (e.pointerId !== d.pointerId) return;
    d.x = x;
    d.y = y;
    d.shift = e.shiftKey;
    d.alt = e.altKey;
    d.mod = e.metaKey || e.ctrlKey;
    setMouse(x, y, true);
    if (d.type === 'pending') {
      if (Math.hypot(x - d.sx, y - d.sy) < 3) return;
      startDrag(d);
    }
    dragMove(d);
    requestRender();
    return;
  }
  if (overUI(e)) {
    setMouse(x, y, false);
    app.hover = null;
    app.hot = null;
    requestRender();
    return;
  }
  setMouse(x, y, true);
  updateHover(x, y);
}

function onUp(e) {
  const d = app.drag;
  if (!d || e.pointerId !== d.pointerId) return;
  try {
    app.layer.releasePointerCapture(e.pointerId);
  } catch {}
  app.drag = null;
  if (d.type === 'pending') click(d);
  else endDrag(d);
  lastUp = { t: performance.now(), x: e.clientX, y: e.clientY, click: d.type === 'pending', count: d.count || 1 };
  app.snapLines = [];
  app.marquee = null;
  app.preview = null;
  updateHover(e.clientX, e.clientY);
  hub.sync();
  requestFull();
}

function onCancel(e) {
  const d = app.drag;
  if (!d || e.pointerId !== d.pointerId) return;
  app.drag = null;
  if (d.type !== 'pending') endDrag(d);
  app.snapLines = [];
  app.marquee = null;
  app.preview = null;
  requestFull();
}

function startDrag(d) {
  const st = app.state;
  const hot = d.hot;
  if (hot && hot.type === 'corner') return beginCorner(d);
  if (hot && hot.type === 'edge') return beginEdge(d, hot);
  if (hot && hot.type === 'spacing') return beginSpacing(d);
  // Shift-drag always selects; double-click-drag selects when it starts on empty space
  if (d.shift || (d.dbl && !d.item)) return beginMarquee(d);
  if (d.item) {
    // Dragging from inside something that's already selected moves that (like a design tool),
    // not the smaller thing that happens to be under the mouse. The same goes for the box around
    // it when the press lands inside the selected thing's outline but the page reports its
    // container there (the gap between two lines of a link, a canvas that ignores the mouse).
    const inside =
      d.item.kind === 'el' &&
      liveSel().some(
        (s) =>
          s.kind === 'el' &&
          s.el !== d.item.el &&
          (deepContains(s.el, d.item.el) || (deepContains(d.item.el, s.el) && containsPt(rectOf(s.el), d.sx, d.sy))),
      );
    if (!isSelected(d.item) && !inside) setSelection([d.item]);
    if (d.alt && app.sel.every((s) => s.kind === 'shape')) {
      begin('Duplicate');
      touchShapes();
      const copies = app.sel.map((s) => shapeItem(duplicateShape(s.shape, 0, 0)));
      setSelection(copies);
      return beginMove(d, true);
    }
    return beginMove(d);
  }
  if (st.canvasMode || st.mode === 'draw') return beginDraw(d);
  return beginMarquee(d);
}

function dragMove(d) {
  switch (d.type) {
    case 'move':
      return moveDrag(d);
    case 'edge':
      return edgeDrag(d);
    case 'corner':
      return cornerDrag(d);
    case 'spacing':
      return spacingDrag(d);
    case 'marquee':
      return marqueeDrag(d);
    case 'draw':
      return drawDrag(d);
  }
}

function endDrag(d) {
  if (d.live) app.live = Math.max(0, app.live - 1);
  if (d.type === 'draw') {
    const r = app.preview && app.preview.rect;
    if (r && r.w >= 3 && r.h >= 3) {
      begin('Draw box');
      touchShapes();
      const s = createShape(r);
      commit();
      setSelection([shapeItem(s)]);
    }
  } else if (d.type === 'move' || d.type === 'edge' || d.type === 'corner' || d.type === 'spacing') {
    commit();
  }
  if (d.restructured) requestCollect();
  requestFull();
}

export function cancelDrag() {
  const d = app.drag;
  if (!d) return false;
  app.drag = null;
  if (d.live) app.live = Math.max(0, app.live - 1);
  if (d.type === 'move' || d.type === 'edge' || d.type === 'corner' || d.type === 'spacing') cancel();
  if (d.type === 'marquee') setSelection(d.base || []);
  if (d.restructured) requestCollect();
  try {
    app.layer.releasePointerCapture(d.pointerId);
  } catch {}
  app.preview = null;
  app.marquee = null;
  app.snapLines = [];
  requestFull();
  return true;
}

function goLive(d, items) {
  if (items.some((i) => i.kind === 'el')) {
    app.live++;
    d.live = true;
  }
}

// ---- unit-friendly rounding --------------------------------------------------------------

function unitRound(r, edge, item, on = true) {
  const out = { ...r };
  const ctx = item ? itemCtx(item) : { pw: app.vw, ph: app.vh, fs: app.rootFS };
  const horiz = edge === 'l' || edge === 'r';
  const size = horiz ? r.w : r.h;
  const v = on ? snapToUnit(size, horiz ? 'w' : 'h', ctx) : Math.max(1, Math.round(size));
  if (horiz) {
    if (edge === 'l') out.x = r.x + r.w - v;
    out.w = v;
  } else {
    if (edge === 't') out.y = r.y + r.h - v;
    out.h = v;
  }
  return out;
}

// ---- drawing ----------------------------------------------------------------------------

function nearestTarget(v, list) {
  let best = null;
  for (const t of list) {
    const dd = Math.abs(t.v - v);
    if (dd <= SNAP && (!best || dd < Math.abs(best - v))) best = t.v;
  }
  return best;
}

function beginDraw(d) {
  d.type = 'draw';
  d.targets = buildTargets([]);
  if (!d.mod) {
    // the starting corner also clicks onto nearby edges
    const x = nearestTarget(d.sx, d.targets.xs);
    const y = nearestTarget(d.sy, d.targets.ys);
    if (x != null) d.sx = x;
    if (y != null) d.sy = y;
  }
  setSelection([]);
}

function drawDrag(d) {
  let px = d.x;
  let py = d.y;
  if (d.shift) {
    const s = Math.max(Math.abs(px - d.sx), Math.abs(py - d.sy));
    px = d.sx + Math.sign(px - d.sx || 1) * s;
    py = d.sy + Math.sign(py - d.sy || 1) * s;
  }
  let r = normRect(d.sx, d.sy, px, py);
  const edges = { l: px < d.sx, r: px >= d.sx, t: py < d.sy, b: py >= d.sy };
  let lines = [];
  if (!d.mod && !d.shift) {
    const res = snapEdges(r, edges, d.targets);
    r = res.rect;
    lines = res.lines;
    if (!res.snappedX) r = unitRound(r, edges.l ? 'l' : 'r', null);
    if (!res.snappedY) r = unitRound(r, edges.t ? 't' : 'b', null);
  }
  app.preview = { rect: r, start: { x: d.sx, y: d.sy } };
  app.snapLines = lines;
}

// ---- moving -----------------------------------------------------------------------------

function beginMove(d, inTx = false) {
  if (!inTx) begin('Move');
  settleFlips(); // measure everything where it really is, not halfway through a slide
  const items = liveSel();
  d.type = 'move';
  d.items = items.map(startState);
  d.box0 = union(d.items.map((s) => s.rect));
  d.targets = buildTargets(items);
  if (app.state.mode === 'change' && !app.state.canvasMode) for (const s of d.items) if (s.it.kind === 'el') findHome(d, s);
  goLive(d, items);
}

// ---- pulling things out of their box --------------------------------------------------------
// Drag something past the edge of the box it sits in (a link out of a menu, a label out of a
// button) and it comes out: it floats above everything, the box closes the gap behind it, and
// dropping it back over the box puts it back.

// The box something sits in: the nearest box around it that holds more than just it, has a look
// of its own (a background, border or shadow), or cuts off whatever spills out of it.
function homeOf(el) {
  let p = parentOf(el);
  for (let i = 0; p && !isRootish(p) && i < 40; i++, p = parentOf(p)) {
    if (p === app.host) return null;
    let cs;
    try {
      cs = getComputedStyle(p);
    } catch {
      return null;
    }
    if (cs.display === 'contents') continue;
    if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible' || (cs.clipPath && cs.clipPath !== 'none') || /paint|strict|content/.test(cs.contain || '')) return p;
    if (hasPaint(cs)) return p;
    if (thingsIn(p) >= 2) return p;
  }
  return null;
}

// How many visible things (elements or words) a box holds, stopping at 2.
function thingsIn(p) {
  let n = 0;
  for (const k of p.childNodes) {
    if (k.nodeType === 3) {
      if (k.nodeValue && k.nodeValue.trim()) n++;
    } else if (k.nodeType === 1 && k !== app.host) {
      const r = k.getBoundingClientRect();
      if (r.width >= 1 && r.height >= 1) n++;
    }
    if (n >= 2) return n;
  }
  return n;
}

// What actually comes out: the item itself, or the wrapper around it right inside its box (so a
// link in a list item takes its list item along and the menu closes up completely).
function liftOf(el, home) {
  let t = el;
  for (let p = parentOf(t); p && p !== home && !isRootish(p); p = parentOf(p)) t = p;
  return t;
}

function findHome(d, s) {
  const el = s.it.el;
  const home = homeOf(el);
  if (!home) return;
  const lift = liftOf(el, home);
  if (!isFree(lift) && !canPull(lift)) return;
  s.home = home;
  s.lift = lift;
  // the spot that decides when it has left its box: the mouse for the thing you grabbed, and
  // the matching spot on each other picked thing (so they don't all jump out at once)
  const r = s.rect;
  s.probe = { x: Math.min(Math.max(d.sx, r.x + 1), r.x + r.w - 1), y: Math.min(Math.max(d.sy, r.y + 1), r.y + r.h - 1) };
  if (lift !== el && isFree(lift)) {
    // it's riding in a wrapper that's already out: move the wrapper
    touch(lift);
    s.lop = beginOp(lift);
    const er = rectOf(el);
    const lr = rectOf(lift);
    s.off = { x: er.x - lr.x, y: er.y - lr.y };
  }
  d.pull = true;
}

function markLifted(el, on) {
  for (const c of app.cands) {
    if (!deepContains(el, c.el)) continue;
    c.top = on;
    if (on) {
      c.clip = null;
      c.occ = null;
      c.dynamic = true;
    }
  }
}

function pullCheck(d) {
  const todo = [];
  for (const s of d.items) {
    if (!s.home || !s.home.isConnected) continue;
    const x = s.probe.x + d.x - d.sx;
    const y = s.probe.y + d.y - d.sy;
    const H = rectOf(s.home);
    const free = isFree(s.lift);
    if (!free && (x < H.x - PULL || x > H.x + H.w + PULL || y < H.y - PULL || y > H.y + H.h + PULL)) todo.push([s, true]);
    else if (free && x > H.x + 2 && x < H.x + H.w - 2 && y > H.y + 2 && y < H.y + H.h - 2) todo.push([s, false]);
  }
  if (!todo.length) return;
  // the things left behind slide over to close the gap (or open it again), and something put
  // back slides into its own spot
  const watch = new Set();
  for (const [s, out] of todo) {
    for (const k of s.home.children) if (k !== s.lift && k !== app.host) watch.add(k);
    if (!out) watch.add(s.lift);
  }
  const first = captureRects([...watch]);
  let pulled = false;
  for (const [s, out] of todo) {
    const el = s.it.el;
    const own = s.lift === el;
    if (out) {
      if (!own) {
        // the item sits back in its own spot inside the wrapper that comes out with it
        s.op.rec.tx = s.op.start.tx;
        s.op.rec.ty = s.op.start.ty;
        applyRec(s.op.rec);
        if (!s.lop) {
          touch(s.lift);
          s.lop = beginOp(s.lift);
        }
      }
      if (pullOut(own ? s.op : s.lop, s.home)) {
        pulled = true;
        s.back = false;
        if (!own) {
          const er = rectOf(el);
          const lr = rectOf(s.lift);
          s.off = { x: er.x - lr.x, y: er.y - lr.y };
        }
        markLifted(s.lift, true);
      }
    } else {
      // back in its box: it waits in its own spot (drag out again and it comes along again)
      putBack(own ? s.op : s.lop);
      s.back = true;
      markLifted(s.lift, false);
    }
  }
  d.restructured = true;
  flip(first, 280);
  d.targets = buildTargets(liveSel());
  if (pulled && !toldPull) {
    toldPull = true;
    hub.toast('Pulled it out of its box — the rest closed up · drop it back over the box to put it back', 3200);
  }
}

function moveDrag(d) {
  let dx = d.x - d.sx;
  let dy = d.y - d.sy;
  let lockX = false;
  let lockY = false;
  if (d.shift) {
    if (Math.abs(dx) > Math.abs(dy)) {
      dy = 0;
      lockY = true;
    } else {
      dx = 0;
      lockX = true;
    }
  }
  let lines = [];
  if (!d.mod) {
    const s = snapMove({ x: d.box0.x + dx, y: d.box0.y + dy, w: d.box0.w, h: d.box0.h }, d.targets);
    if (!lockX) dx += s.dx;
    if (!lockY) dy += s.dy;
    lines = s.lines.filter((l) => (l.x1 === l.x2 ? !lockX : !lockY));
  }
  if (d.pull) pullCheck(d);
  for (const s of d.items) {
    if (s.back && !isFree(s.lift)) continue;
    const r = { x: s.rect.x + dx, y: s.rect.y + dy, w: s.rect.w, h: s.rect.h };
    // a wrapper that came out carries the item: put the wrapper where the item should be
    if (s.lop && s.lift !== s.it.el && isFree(s.lift)) {
      moveTo(s.lop, r.x - s.off.x, r.y - s.off.y);
      requestFull();
    } else applyRect(s, r, false);
  }
  app.snapLines = lines;
}

// ---- edge resize (the inward arrows) ------------------------------------------------------

function beginEdge(d, hot) {
  const it = hot.it;
  if (!isSelected(it)) setSelection([it]);
  const group = app.sel.length > 1 ? liveSel() : [it];
  begin('Resize');
  d.type = 'edge';
  d.edge = hot.edge;
  d.f = hot.f;
  d.exact = !!hot.exact;
  d.main = it;
  d.items = group.map(startState);
  d.mainState = d.items.find((s) => same(s.it, it)) || d.items[0];
  d.targets = buildTargets(group);
  goLive(d, group);
}

function edgeDrag(d) {
  const e = d.edge;
  const m = d.mainState.rect;
  let r = { ...m };
  if (e === 'r') r.w = Math.max(1, d.x - m.x);
  if (e === 'l') {
    const x2 = m.x + m.w;
    r.x = Math.min(d.x, x2 - 1);
    r.w = x2 - r.x;
  }
  if (e === 'b') r.h = Math.max(1, d.y - m.y);
  if (e === 't') {
    const y2 = m.y + m.h;
    r.y = Math.min(d.y, y2 - 1);
    r.h = y2 - r.y;
  }
  let lines = [];
  const res = d.mod ? null : snapEdges(r, { l: e === 'l', r: e === 'r', t: e === 't', b: e === 'b' }, d.targets);
  if (res) {
    r = res.rect;
    lines = res.lines;
  }
  const snapped = res && (e === 'l' || e === 'r' ? res.snappedX : res.snappedY);
  if (!snapped) r = unitRound(r, e, d.main, !d.mod);
  const dl = r.x - m.x;
  const dt = r.y - m.y;
  const dw = r.w - m.w;
  const dh = r.h - m.h;
  for (const s of d.items) {
    const q = s === d.mainState ? r : { x: s.rect.x + dl, y: s.rect.y + dt, w: Math.max(1, s.rect.w + dw), h: Math.max(1, s.rect.h + dh) };
    applyRect(s, q, true);
  }
  app.snapLines = lines;
}

// ---- corner resize (the four corner squares) ----------------------------------------------

function beginCorner(d) {
  const items = liveSel();
  if (!items.length) return beginMarquee(d);
  begin('Resize');
  d.type = 'corner';
  d.corner = d.hot.corner;
  d.items = items.map(startState);
  d.box0 = union(d.items.map((s) => s.rect));
  d.targets = buildTargets(items);
  goLive(d, items);
}

function cornerDrag(d) {
  const B = d.box0;
  const c = d.corner;
  const west = c.includes('w');
  const north = c.includes('n');
  const ax = west ? B.x + B.w : B.x;
  const ay = north ? B.y + B.h : B.y;
  let w = Math.max(1, west ? ax - d.x : d.x - ax);
  let h = Math.max(1, north ? ay - d.y : d.y - ay);
  if (d.shift) {
    const k = Math.max(w / B.w, h / B.h);
    w = Math.max(1, B.w * k);
    h = Math.max(1, B.h * k);
  }
  let r = { x: west ? ax - w : ax, y: north ? ay - h : ay, w, h };
  let lines = [];
  if (!d.mod && !d.shift) {
    const res = snapEdges(r, { l: west, r: !west, t: north, b: !north }, d.targets);
    r = res.rect;
    lines = res.lines;
    if (d.items.length === 1) {
      if (!res.snappedX) r = unitRound(r, west ? 'l' : 'r', d.items[0].it);
      if (!res.snappedY) r = unitRound(r, north ? 't' : 'b', d.items[0].it);
    }
  }
  const sx = r.w / B.w;
  const sy = r.h / B.h;
  for (const s of d.items) {
    const q =
      d.items.length === 1
        ? r
        : { x: r.x + (s.rect.x - B.x) * sx, y: r.y + (s.rect.y - B.y) * sy, w: Math.max(1, s.rect.w * sx), h: Math.max(1, s.rect.h * sy) };
    applyRect(s, q, true);
  }
  app.snapLines = lines;
}

// ---- spacing handle (pink bar in the gaps between selected things) --------------------

function beginSpacing(d) {
  const sp = computeSpacing(liveSel());
  if (!sp) return beginMarquee(d);
  begin('Spacing');
  d.type = 'spacing';
  d.axis = sp.axis;
  d.items = sp.sorted.map((o) => startState(o.it));
  d.gaps0 = sp.gaps.map((g) => g.g);
  goLive(d, d.items.map((s) => s.it));
}

function spacingDrag(d) {
  const delta = d.axis === 'x' ? d.x - d.sx : d.y - d.sy;
  const step = d.mod ? 1 : Math.max(1, unitStep(d.axis === 'x' ? 'w' : 'h'));
  let pos = null;
  d.items.forEach((s, i) => {
    const r = { ...s.rect };
    if (i > 0) {
      if (d.axis === 'x') r.x = pos;
      else r.y = pos;
    }
    applyRect(s, r, false);
    if (i < d.gaps0.length) {
      let g = Math.max(0, d.gaps0[i] + delta);
      g = Math.round(g / step) * step;
      pos = (d.axis === 'x' ? r.x + r.w : r.y + r.h) + g;
    }
  });
}

// ---- marquee ---------------------------------------------------------------------------

function beginMarquee(d) {
  d.type = 'marquee';
  d.base = d.shift ? app.sel.slice() : [];
}

function marqueeDrag(d) {
  const m = normRect(d.sx, d.sy, d.x, d.y);
  app.marquee = m;
  const found = [];
  for (const s of activeShapes()) if (overlaps(shapeRect(s), m)) found.push(shapeItem(s));
  if (app.state.mode === 'change' && !app.state.canvasMode && m.w > 2 && m.h > 2) {
    const inside = new Set();
    const L = minLevel();
    for (const c of app.cands) {
      if (c.dup || c.w < 2 || c.h < 2 || c.lv < L) continue;
      if (containsRect(m, c)) inside.add(c);
    }
    for (const c of inside) {
      let p = c.parent;
      let nested = false;
      while (p) {
        if (inside.has(p)) {
          nested = true;
          break;
        }
        p = p.parent;
      }
      if (!nested) found.push(elItem(c.el));
      if (found.length > 300) break;
    }
  }
  const merged = d.base.slice();
  for (const f of found) if (!merged.some((b) => same(b, f))) merged.push(f);
  setSelection(merged);
}

// ---- clicks -------------------------------------------------------------------------------

function click(d) {
  const hot = d.hot;
  if (hot && hot.type === 'chip') return hub.openEditor(hot.chip);
  if (hot && hot.type === 'edge') {
    const chip = app.chips.find((c) => containsPt(c, d.sx, d.sy, 1));
    if (chip) return hub.openEditor(chip);
    if (!isSelected(hot.it)) setSelection([hot.it]);
    return;
  }
  if (hot) return;
  const it = d.item;
  if (!it) {
    if (!d.shift) setSelection([]);
    return;
  }
  if (d.alt && it.kind === 'shape') {
    begin('Duplicate');
    touchShapes();
    const s = duplicateShape(it.shape);
    commit();
    setSelection([shapeItem(s)]);
    return;
  }
  if (it.kind === 'el') {
    // Alt+Shift-click: everything like it. Alt-click, or clicking again quickly (double, triple,
    // quadruple click): the box around it, one level further out each time.
    if (d.alt && d.shift) return pickAlike(it);
    if (d.alt || (d.count >= 2 && !d.shift)) return climb(it);
  }
  if (d.shift) return toggleSelected(it);
  setSelection([it]);
}

function pickAlike(it) {
  const base = alikeBase(it.el);
  const list = alikeOf(base);
  setSelection(list.map(elItem));
  hub.toast(
    list.length > 1 ? `Picked all ${list.length} like this (${alikeLabel(base)}) — W A S D or drag to change them together` : `Nothing else on the page looks like this (${alikeLabel(base)})`,
    2600,
  );
}

function climb(it) {
  const sel = liveSel().filter((s) => s.kind === 'el');
  const inside = sel.filter((s) => deepContains(s.el, it.el));
  if (!inside.length) {
    setSelection([it]);
    return;
  }
  // one level up: the picked thing becomes the box around it (all of them, if several are picked)
  const L = minLevel();
  const up = (sel.length > 1 ? sel : inside).map((s) => parentPick(s.el, L) || s.el);
  const uniq = [];
  for (const el of up) if (!uniq.includes(el)) uniq.push(el);
  const outer = uniq.filter((el) => !uniq.some((o) => o !== el && deepContains(o, el)));
  const moved = outer.some((el) => !sel.some((s) => s.el === el));
  if (!moved) {
    hub.toast("That's already the biggest box", 1400);
    return;
  }
  setSelection(outer.map(elItem));
  hub.toast(outer.length === 1 ? `Picked the box around it: ${describe(outer[0])}` : `Picked the boxes around them (${outer.length})`, 1600);
}

function onContext(e) {
  if (!interactive()) return;
  e.preventDefault();
  e.stopPropagation();
  // On a Mac, Control-click opens the menu too: treat it as a plain click, never as "remove box".
  if (e.ctrlKey && e.button === 0) return;
  const s = shapeAt(e.clientX, e.clientY, 2);
  if (!s) return;
  begin('Remove box');
  touchShapes();
  removeShape(s);
  commit();
  setSelection(app.sel.filter((it) => !(it.kind === 'shape' && it.shape === s)));
}

// ---- wheel: let nested scroll areas scroll even though our layer is on top ----------------

function canScroll(el, dx, dy) {
  let cs;
  try {
    cs = getComputedStyle(el);
  } catch {
    return false;
  }
  const oy = cs.overflowY;
  const ox = cs.overflowX;
  if (dy && (oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 1) {
    if (dy > 0 ? el.scrollTop + el.clientHeight < el.scrollHeight - 1 : el.scrollTop > 0) return true;
  }
  if (dx && (ox === 'auto' || ox === 'scroll') && el.scrollWidth > el.clientWidth + 1) {
    if (dx > 0 ? el.scrollLeft + el.clientWidth < el.scrollWidth - 1 : el.scrollLeft > 0) return true;
  }
  return false;
}

function onWheel(e) {
  if (app.state.canvasMode) {
    e.preventDefault();
    return;
  }
  if (e.ctrlKey) return;
  const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? app.vh : 1;
  const dx = e.deltaX * k;
  const dy = e.deltaY * k;
  let list;
  try {
    list = document.elementsFromPoint(e.clientX, e.clientY);
  } catch {
    return;
  }
  const hit = list.find((el) => el !== app.host);
  let el = hit;
  while (el && !isRootish(el)) {
    if (canScroll(el, dx, dy)) {
      e.preventDefault();
      el.scrollBy({ left: dx, top: dy, behavior: 'instant' });
      requestFull();
      return;
    }
    el = parentOf(el);
  }
}

// ---- keyboard ----------------------------------------------------------------------------

function nudge(key, step) {
  const items = liveSel();
  if (!items.length) return;
  const dx = key === 'ArrowLeft' ? -step : key === 'ArrowRight' ? step : 0;
  const dy = key === 'ArrowUp' ? -step : key === 'ArrowDown' ? step : 0;
  begin('Nudge');
  for (const s of items.map(startState)) applyRect(s, { x: s.rect.x + dx, y: s.rect.y + dy, w: s.rect.w, h: s.rect.h }, false);
  commit();
  requestFull();
}

// W/S = shorter/taller, A/D = narrower/wider (about 5% a press; Shift = 1px). Top-left stays put.
function keyResize(key, fine) {
  const items = liveSel();
  if (!items.length) return;
  begin('Resize');
  for (const s of items.map(startState)) {
    const r = { ...s.rect };
    const f = (v, grow) => {
      if (fine) return Math.max(1, Math.round(v) + (grow ? 1 : -1));
      let n = Math.round(grow ? v * 1.05 : v / 1.05);
      if (n === Math.round(v)) n += grow ? 1 : -1;
      return Math.max(1, n);
    };
    if (key === 'd') r.w = f(r.w, true);
    if (key === 'a') r.w = f(r.w, false);
    if (key === 's') r.h = f(r.h, true);
    if (key === 'w') r.h = f(r.h, false);
    applyRect(s, r, true);
  }
  commit();
  requestFull();
}

export function deleteSelection() {
  const items = liveSel();
  if (!items.length) return;
  begin('Delete');
  let els = 0;
  let boxes = 0;
  for (const it of items) {
    if (it.kind === 'shape') {
      touchShapes();
      removeShape(it.shape);
      boxes++;
    } else {
      touch(it.el);
      setDeleted(it.el, true);
      els++;
    }
  }
  commit();
  setSelection([]);
  requestCollect();
  if (els) hub.toast(`Hid ${els} element${els === 1 ? '' : 's'} — its space stays · Reflow closes the gap · ⌘Z undoes`);
  else if (boxes > 1) hub.toast(`Removed ${boxes} boxes`);
}

function escape() {
  if (cancelDrag()) return true;
  if (hub.closeFlyouts()) return true;
  if (app.sel.length) {
    setSelection([]);
    return true;
  }
  if (app.state.canvasMode) {
    hub.setCanvas(false);
    return true;
  }
  if (app.state.mode !== 'measure') {
    hub.setMode('measure');
    return true;
  }
  hub.close();
  return true;
}

function onKey(e) {
  if (!app.state.open || app.state.closing) return;
  const t = e.composedPath ? e.composedPath()[0] : e.target;
  if (t && isOurs(t) && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
  if (e.isComposing || pageIsTyping()) return;
  const k = e.key || '';
  const lower = k.length === 1 ? k.toLowerCase() : k;
  const mod = e.metaKey || e.ctrlKey;
  const st = app.state;
  const editing = interactive();
  const hasSel = editing && app.sel.length > 0;
  const d = app.drag;
  setMods(e);
  // Alt on its own would jump to the browser's menu on Windows; here it means "the box around it"
  if (k === 'Alt' && st.mode === 'change' && !st.canvasMode) e.preventDefault();
  if (d && (k === 'Shift' || k === 'Meta' || k === 'Control' || k === 'Alt')) {
    d.shift = e.shiftKey;
    d.alt = e.altKey;
    d.mod = e.metaKey || e.ctrlKey;
    if (d.type !== 'pending') dragMove(d);
    requestRender();
    return;
  }
  if (st.capturing) {
    if (k === 'Escape') {
      hub.cancelCapture();
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    }
    return;
  }
  let handled = false;
  if (k === 'Escape') handled = escape();
  else if (mod && !e.altKey && lower === 'z') {
    if (e.shiftKey ? canRedo() : canUndo()) {
      handled = true;
      if (e.shiftKey) redo();
      else undo();
      hub.sync();
    }
  } else if (mod && !e.altKey && !e.shiftKey && lower === 'y' && canRedo()) {
    handled = true;
    redo();
    hub.sync();
  } else if (mod && !e.altKey && lower === 'g' && st.mode === 'change' && !st.canvasMode && hasSel) {
    handled = true;
    if (e.shiftKey) hub.ungroup();
    else hub.group();
  } else if (!mod && !e.altKey) {
    if ((k === 'Delete' || k === 'Backspace') && hasSel) {
      handled = true;
      deleteSelection();
    } else if (k.startsWith('Arrow') && hasSel) {
      handled = true;
      nudge(k, e.shiftKey ? 10 : 1);
    } else if (lower.length === 1 && 'wasd'.includes(lower) && hasSel) {
      handled = true;
      keyResize(lower, e.shiftKey);
    } else if (lower === 'u') {
      handled = true;
      hub.cycleUnit(e.shiftKey ? -1 : 1);
    } else if (lower === 'h') {
      handled = true;
      hub.toggleGuides();
    } else if (lower === 'l') {
      handled = true;
      hub.cycleDetail(e.shiftKey ? -1 : 1);
    }
  }
  if (handled) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    hub.sync();
  }
}

function onKeyUp(e) {
  setMods(e);
  if (e.key === 'Alt' && app.state.open && app.state.mode === 'change' && !app.state.canvasMode) e.preventDefault();
  const d = app.drag;
  if (!d) return;
  d.shift = e.shiftKey;
  d.alt = e.altKey;
  d.mod = e.metaKey || e.ctrlKey;
  if (d.type !== 'pending') dragMove(d);
  requestRender();
}

function onOut(e) {
  if (!e.relatedTarget && !app.drag) {
    app.mouse.inside = false;
    app.hover = null;
    app.hot = null;
    requestRender();
  }
}

function onBlur() {
  app.mods = { alt: false, shift: false };
  if (app.drag && app.drag.type !== 'pending') {
    const d = app.drag;
    app.drag = null;
    endDrag(d);
    app.preview = null;
    app.marquee = null;
    app.snapLines = [];
  }
}

// Keep the page from reacting to clicks and keys that belong to our overlay.
const STOP = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'auxclick', 'contextmenu', 'keydown', 'keyup', 'keypress', 'touchstart', 'touchend'];

export function setupLayer() {
  app.layer.addEventListener('pointerdown', onDown);
  app.layer.addEventListener('contextmenu', onContext);
  app.layer.addEventListener('wheel', onWheel, { passive: false });
  for (const t of STOP) app.root.addEventListener(t, (e) => e.stopPropagation(), t.startsWith('touch') ? { passive: true } : false);
}

export function attachInteract() {
  window.addEventListener('pointermove', onMove, true);
  window.addEventListener('pointerup', onUp, true);
  window.addEventListener('pointercancel', onCancel, true);
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('keyup', onKeyUp, true);
  window.addEventListener('mouseout', onOut, true);
  window.addEventListener('blur', onBlur);
  hub.cancelDrag = cancelDrag;
  hub.refreshHot = refreshHot;
}

export function detachInteract() {
  cancelDrag();
  window.removeEventListener('pointermove', onMove, true);
  window.removeEventListener('pointerup', onUp, true);
  window.removeEventListener('pointercancel', onCancel, true);
  window.removeEventListener('keydown', onKey, true);
  window.removeEventListener('keyup', onKeyUp, true);
  window.removeEventListener('mouseout', onOut, true);
  window.removeEventListener('blur', onBlur);
  app.hover = null;
  app.hot = null;
  setCursor('');
}
