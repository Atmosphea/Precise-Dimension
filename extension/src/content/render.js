// Draws every guide, label, box, handle and animation onto one full-screen canvas.
import { app } from './app.js';
import { clipRect } from './collect.js';
import { fmt, fmtGap } from './units.js';
import { clamp, easeOutCubic, easeOutBack, rectOf, isRootish, union, intersect, deepContains } from './util.js';
import { activeShapes, shapeRect } from './shapes.js';
import { itemRect, itemCtx, elItem, shapeItem } from './items.js';

const FONT = '600 10px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const FONT_INFO = '600 10.5px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const CHIP_H = 14;
const REVEAL_MS = 460;
const PINK = '#ff2d6f';
const BLUE_SEL = '#2563eb';
const PURPLE_SEL = '#7c3aed';

export function selColor() {
  return app.state.mode === 'change' ? PURPLE_SEL : BLUE_SEL;
}

const widths = new Map();
function tw(ctx, s) {
  let w = widths.get(s);
  if (w == null) {
    w = ctx.measureText(s).width;
    widths.set(s, w);
    if (widths.size > 6000) widths.clear();
  }
  return w;
}

export function hueFor(depth, mode) {
  const t = Math.min(depth / 7, 1);
  if (mode === 'change') return [266 + 36 * t, 82, 58 + 5 * t];
  return [226 - 38 * t, 90, 48 + 6 * t];
}
const hsla = (c, a, dl = 0) => `hsla(${c[0]},${c[1]}%,${c[2] + dl}%,${a})`;

class Grid {
  constructor(size) {
    this.s = size;
    this.m = new Map();
  }
  key(i, j) {
    return (i + 2000) * 100000 + (j + 2000);
  }
  cells(r, pad, fn) {
    const s = this.s;
    const x1 = Math.floor((r.x - pad) / s);
    const x2 = Math.floor((r.x + r.w + pad) / s);
    const y1 = Math.floor((r.y - pad) / s);
    const y2 = Math.floor((r.y + r.h + pad) / s);
    for (let i = x1; i <= x2; i++) for (let j = y1; j <= y2; j++) if (fn(this.key(i, j)) === true) return true;
    return false;
  }
  hits(r, pad = 1.5) {
    return this.cells(r, pad, (k) => {
      const list = this.m.get(k);
      if (!list) return false;
      for (const q of list) {
        if (r.x - pad < q.x + q.w && q.x < r.x + r.w + pad && r.y - pad < q.y + q.h && q.y < r.y + r.h + pad) return true;
      }
      return false;
    });
  }
  add(r) {
    this.cells(r, 0, (k) => {
      let list = this.m.get(k);
      if (!list) this.m.set(k, (list = []));
      list.push(r);
    });
  }
  tryAdd(r, pad = 1.5) {
    if (this.hits(r, pad)) return false;
    this.add(r);
    return true;
  }
}

function boxPath(ctx, r, rad = 0, circle = false) {
  if (circle) {
    ctx.arc(r.x + r.w / 2, r.y + r.h / 2, Math.max(0.5, r.w / 2), 0, Math.PI * 2);
  } else if (rad > 0.5 && ctx.roundRect) {
    ctx.roundRect(r.x, r.y, r.w, r.h, Math.min(rad, r.w / 2, r.h / 2));
  } else {
    ctx.rect(r.x, r.y, r.w, r.h);
  }
}

function chip(ctx, r, s, bg, fg, lp = 1, border = null) {
  const sc = lp >= 1 ? 1 : 0.65 + 0.35 * easeOutBack(lp);
  ctx.save();
  ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
  if (sc !== 1) ctx.scale(sc, sc);
  ctx.beginPath();
  ctx.roundRect(-r.w / 2, -r.h / 2, r.w, r.h, 3.5);
  ctx.fillStyle = bg;
  ctx.fill();
  if (border) {
    ctx.lineWidth = 1;
    ctx.strokeStyle = border;
    ctx.stroke();
  }
  ctx.fillStyle = fg;
  ctx.fillText(s, 0, 0.5);
  ctx.restore();
}

// Vertical chip (reads top to bottom like the original's height label).
function chipV(ctx, r, s, bg, fg, lp = 1, border = null) {
  const sc = lp >= 1 ? 1 : 0.65 + 0.35 * easeOutBack(lp);
  ctx.save();
  ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
  ctx.rotate(Math.PI / 2);
  if (sc !== 1) ctx.scale(sc, sc);
  ctx.beginPath();
  ctx.roundRect(-r.h / 2, -r.w / 2, r.h, r.w, 3.5);
  ctx.fillStyle = bg;
  ctx.fill();
  if (border) {
    ctx.lineWidth = 1;
    ctx.strokeStyle = border;
    ctx.stroke();
  }
  ctx.fillStyle = fg;
  ctx.fillText(s, 0, 0.5);
  ctx.restore();
}

function revealP(c, now) {
  return clamp((now - c.at) / REVEAL_MS, 0, 1);
}

// ---- main ---------------------------------------------------------------------

export function draw(now) {
  const ctx = app.ctx;
  if (!ctx) return;
  const W = app.vw;
  const H = app.vh;
  const st = app.state;
  ctx.setTransform(app.dpr, 0, 0, app.dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  let gA = 1;
  if (st.closing) gA = 1 - clamp((now - st.closeStart) / 240, 0, 1);
  ctx.globalAlpha = gA;
  ctx.font = FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  app.chips = [];

  const guides = st.guides && !st.canvasMode;
  const ui = !st.capturing;
  const editing = st.mode === 'change' || st.mode === 'draw' || st.canvasMode;

  if (guides) drawGuides(ctx, now);
  if (guides && ui && !app.drag) {
    if (st.mode === 'change') drawChangeHover(ctx);
    else drawMeasureHover(ctx);
  }
  if (st.mode === 'change' && guides && ui) drawFlexForSelection(ctx);
  drawShapes(ctx, now, ui);
  if (ui) {
    drawSelection(ctx);
    if (editing) {
      app.arrows = computeArrows();
      drawArrows(ctx);
    } else app.arrows = [];
    drawSpacing(ctx);
    drawMarquee(ctx);
    drawPreview(ctx);
    drawDistancesForActive(ctx);
    drawSnapLines(ctx);
  } else {
    app.arrows = [];
  }
  drawPulses(ctx, now);
  ctx.globalAlpha = 1;
}

// ---- page guides ------------------------------------------------------------------

function drawGuides(ctx, now) {
  const W = app.vw;
  const H = app.vh;
  const change = app.state.mode === 'change';
  const mode = change ? 'change' : 'measure';
  const fill = app.state.fill;
  const vis = [];
  // solid sticky/fixed bars currently on screen: what scrolls under them stays hidden
  const occ = [];
  for (const o of app.occluders || []) {
    if (o.w < 1 || o.h < 1 || o.x > W || o.y > H || o.x + o.w < 0 || o.y + o.h < 0) continue;
    if (app.hiddenForCapture.size && app.hiddenForCapture.has(o.el)) continue;
    occ.push(o);
  }
  app.occRects = occ;
  let occPath = null;
  for (const c of app.cands) {
    if (c.dup || c.w < 1 || c.h < 1) continue;
    if (c.x > W || c.y > H || c.x + c.w < 0 || c.y + c.h < 0) continue;
    if (app.hiddenForCapture.size && app.hiddenForCapture.has(c.el)) continue;
    const clip = c.clip ? clipRect(c.clip) : null;
    if (clip === false) continue;
    if (clip && (c.x >= clip.x + clip.w || c.y >= clip.y + clip.h || c.x + c.w <= clip.x || c.y + c.h <= clip.y)) continue;
    const under = occ.length && !c.isOcc && !c.occ ? occ.filter((o) => overlapsR(o, c)) : null;
    if (under && under.some((o) => o.x <= c.x && o.y <= c.y && o.x + o.w >= c.x + c.w && o.y + o.h >= c.y + c.h)) continue;
    const p = revealP(c, now);
    if (p <= 0) continue;
    const e = easeOutCubic(p);
    const col = hueFor(c.depth, mode);
    const clipped = clip && !(c.x >= clip.x && c.y >= clip.y && c.x + c.w <= clip.x + clip.w && c.y + c.h <= clip.y + clip.h);
    const hidden = under && under.length;
    if (clipped || hidden) {
      ctx.save();
      if (clipped) {
        ctx.beginPath();
        ctx.rect(clip.x, clip.y, clip.w, clip.h);
        ctx.clip();
      }
      if (hidden) {
        if (!occPath) {
          occPath = new Path2D();
          occPath.rect(-10, -10, W + 20, H + 20);
          for (const o of occ) occPath.rect(o.x, o.y, o.w, o.h);
        }
        ctx.clip(occPath, 'evenodd');
      }
    }
    ctx.beginPath();
    boxPath(ctx, c, c.rad, c.circle);
    const fp = clamp((e - 0.2) / 0.8, 0, 1);
    if (fill > 0.001 && fp > 0) {
      ctx.fillStyle = hsla(col, fill * fp);
      ctx.fill();
    }
    const op = clamp(e / 0.72, 0, 1);
    if (op < 1) {
      const per = 2 * (c.w + c.h);
      ctx.setLineDash([per * op, per + 20]);
    } else if (change && (c.flex || c.grid)) ctx.setLineDash([5, 3]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = hsla(col, change ? 0.5 : 0.85);
    ctx.stroke();
    ctx.setLineDash([]);
    if (clipped || hidden) ctx.restore();
    vis.push({ c, e, clip, under: hidden ? under : null });
  }
  drawLabels(ctx, vis, mode);
}

function overlapsR(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function drawLabels(ctx, vis, mode) {
  const grid = new Grid(48);
  if (app.uiRect) grid.tryAdd(app.uiRect, 0);
  const view = { x: 0, y: 0, w: app.vw, h: app.vh };
  // Where the words are: labels never sit on top of text.
  const words = new Grid(48);
  for (const v of vis) {
    const T = v.c.textR;
    if (!T) continue;
    const t = intersect({ x: v.c.x + T.x, y: v.c.y + T.y, w: T.w, h: T.h }, v.clip || view);
    if (t) words.add(t);
  }
  ctx.font = FONT;
  for (const v of vis) {
    const c = v.c;
    const lp = clamp((v.e - 0.45) / 0.55, 0, 1);
    if (lp <= 0) continue;
    let bound = intersect(c, view);
    if (bound && v.clip) bound = intersect(bound, v.clip);
    if (!bound) continue;
    const col = hueFor(c.depth, mode);
    const a = (mode === 'change' ? 0.8 : 0.95) * lp;
    const bg = hsla(col, a, -8);
    const fg = `rgba(255,255,255,${Math.min(1, a + 0.05)})`;
    if (c.circle) {
      const s = '⌀ ' + fmt(c.w, 'w', c);
      const w = tw(ctx, s) + 8;
      const r = { x: bound.x + bound.w / 2 - w / 2, y: bound.y + bound.h / 2 - CHIP_H / 2, w, h: CHIP_H };
      if (bound.w >= w + 2 && bound.h >= CHIP_H && !words.hits(r, 0.5) && grid.tryAdd(r)) chip(ctx, r, s, bg, fg, lp);
      continue;
    }
    // Labels sit inside the box, like the original app: width at the bottom, height on the
    // right. Boxes with words in them get their labels in the empty space beside or under the
    // words (or just outside the box) so the text stays readable.
    const ok = (r) => {
      if (r.x < 0 || r.y < 0 || r.x + r.w > app.vw || r.y + r.h > app.vh) return false;
      if (v.clip && (r.y + r.h > v.clip.y + v.clip.h + 1 || r.x + r.w > v.clip.x + v.clip.w + 1)) return false;
      if (app.occRects && app.occRects.length && !c.isOcc && !c.occ) {
        for (const o of app.occRects) if (overlapsR(o, r)) return false;
      }
      if (words.hits(r, 0.5)) return false;
      return grid.tryAdd(r);
    };
    const ws = fmt(c.w, 'w', c);
    const wW = tw(ctx, ws) + 8;
    const hs = fmt(c.h, 'h', c);
    const hW = tw(ctx, hs) + 8;
    const T = c.textR;
    let wAtRight = false;
    if (bound.w >= wW + 6) {
      const midX = bound.x + bound.w / 2 - wW / 2;
      let spots;
      if (T) {
        const roomBelow = c.y + c.h - (c.y + T.y + T.h);
        const roomRight = c.x + c.w - (c.x + T.x + T.w);
        spots = [];
        if (roomBelow >= CHIP_H + 4) spots.push({ x: midX, y: bound.y + bound.h - CHIP_H - 2 });
        if (roomRight >= wW + 8) spots.push({ x: bound.x + bound.w - wW - 3, y: bound.y + bound.h / 2 - CHIP_H / 2, right: true });
        spots.push({ x: midX, y: bound.y + bound.h + 2 });
      } else if (bound.h < CHIP_H * 2 + 8) {
        spots = [{ x: midX, y: bound.y + bound.h + 2 }];
      } else {
        spots = [{ x: midX, y: bound.y + bound.h - CHIP_H - 3 }];
      }
      for (const sp of spots) {
        const r = { x: sp.x, y: sp.y, w: wW, h: CHIP_H };
        if (ok(r)) {
          chip(ctx, r, ws, bg, fg, lp);
          wAtRight = !!sp.right;
          break;
        }
      }
    }
    if (bound.h >= hW + 6) {
      const y = bound.y + bound.h / 2 - hW / 2;
      let spots;
      if (T) {
        const roomRight = c.x + c.w - (c.x + T.x + T.w);
        spots = [];
        if (!wAtRight && roomRight >= CHIP_H + 8) spots.push(bound.x + bound.w - CHIP_H - 3);
        spots.push(bound.x + bound.w + 2);
      } else if (bound.w < CHIP_H * 2 + 12) {
        spots = [bound.x + bound.w + 2];
      } else {
        spots = [bound.x + bound.w - CHIP_H - 3];
      }
      for (const x of spots) {
        const r = { x, y, w: CHIP_H, h: hW };
        if (ok(r)) {
          chipV(ctx, r, hs, bg, fg, lp);
          break;
        }
      }
    }
  }
}

function parentBox(el) {
  let p = el.parentElement;
  const r = rectOf(el);
  while (p && !isRootish(p)) {
    const pr = rectOf(p);
    if (Math.abs(pr.x - r.x) > 0.5 || Math.abs(pr.y - r.y) > 0.5 || Math.abs(pr.w - r.w) > 0.5 || Math.abs(pr.h - r.h) > 0.5) return { el: p, r: pr };
    p = p.parentElement;
  }
  return null;
}

function infoChip(ctx, r, s, bg) {
  ctx.font = FONT_INFO;
  const w = tw(ctx, s) + 12;
  const h = 18;
  let x = r.x;
  let y = r.y - h - 5;
  if (y < 4) y = r.y + r.h + 5;
  if (y + h > app.vh - 4) y = Math.max(4, r.y + 4);
  x = clamp(x, 4, app.vw - w - 4);
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 5);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'left';
  ctx.fillText(s, x + 6, y + h / 2 + 0.5);
  ctx.textAlign = 'center';
  ctx.font = FONT;
}

function elInfo(el, r, c) {
  const tag = el.tagName.toLowerCase();
  let s = `${tag}   ${fmt(r.w, 'w', c)} × ${fmt(r.h, 'h', c)}`;
  if (c && c.text && c.fs) s += `   ·   ${Math.round(c.fs)}px text`;
  if (c && c.circle) s = `${tag}   ⌀ ${fmt(r.w, 'w', c)}`;
  return s;
}

function drawMeasureHover(ctx) {
  const h = app.hover;
  if (!h || h.kind !== 'el' || !h.el.isConnected) return;
  const el = h.el;
  const r = rectOf(el);
  if (r.w < 1 || r.h < 1) return;
  const c = app.candByEl.get(el) || itemCtx(h);
  const col = [217, 96, 54];
  ctx.beginPath();
  boxPath(ctx, r, c.rad || 0, c.circle);
  ctx.fillStyle = hsla(col, 0.1 + app.state.fill * 0.3);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = hsla(col, 1);
  ctx.stroke();
  const p = parentBox(el);
  if (p) drawInnerDistances(ctx, r, p.r, c, el);
  infoChip(ctx, r, elInfo(el, r, c), hsla(col, 0.97, -10));
}

function drawChangeHover(ctx) {
  const h = app.hover;
  if (!h) return;
  if (h.kind === 'el') {
    if (!h.el.isConnected) return;
    const r = rectOf(h.el);
    const c = app.candByEl.get(h.el) || itemCtx(h);
    const col = [270, 88, 58];
    ctx.beginPath();
    boxPath(ctx, r, c.rad || 0, c.circle);
    ctx.fillStyle = hsla(col, 0.12 + app.state.fill * 0.3);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = hsla(col, 1);
    ctx.stroke();
    if (c.flex || c.grid) drawFlexGaps(ctx, h.el, r, c);
    if (!app.sel.some((s) => s.kind === 'el' && s.el === h.el)) infoChip(ctx, r, elInfo(h.el, r, c), hsla(col, 0.97, -12));
  }
}

// Nearest edge in each direction: a neighbour beside it, or else the box it sits in.
function neighbourEdges(el, r, pr) {
  let L = pr.x;
  let R = pr.x + pr.w;
  let T = pr.y;
  let B = pr.y + pr.h;
  const p = el && el.parentElement;
  if (p) {
    let n = 0;
    for (const k of p.children) {
      if (k === el || k === app.host || n++ > 200) continue;
      const kr = rectOf(k);
      if (kr.w < 1 || kr.h < 1) continue;
      const yo = kr.y < r.y + r.h - 0.5 && kr.y + kr.h > r.y + 0.5;
      const xo = kr.x < r.x + r.w - 0.5 && kr.x + kr.w > r.x + 0.5;
      if (yo) {
        if (kr.x + kr.w <= r.x + 0.5 && kr.x + kr.w > L) L = kr.x + kr.w;
        if (kr.x >= r.x + r.w - 0.5 && kr.x < R) R = kr.x;
      }
      if (xo) {
        if (kr.y + kr.h <= r.y + 0.5 && kr.y + kr.h > T) T = kr.y + kr.h;
        if (kr.y >= r.y + r.h - 0.5 && kr.y < B) B = kr.y;
      }
    }
  }
  return { L, R, T, B };
}

function drawInnerDistances(ctx, r, pr, c, el) {
  ctx.save();
  ctx.strokeStyle = PINK;
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 2]);
  const midY = r.y + r.h / 2;
  const midX = r.x + r.w / 2;
  const items = [];
  const e = neighbourEdges(el, r, pr);
  const L = r.x - e.L;
  const R = e.R - (r.x + r.w);
  const T = r.y - e.T;
  const B = e.B - (r.y + r.h);
  if (L > 0.5) items.push([e.L, midY, r.x, midY, fmtGap(L, 'w', c)]);
  if (R > 0.5) items.push([r.x + r.w, midY, e.R, midY, fmtGap(R, 'w', c)]);
  if (T > 0.5) items.push([midX, e.T, midX, r.y, fmtGap(T, 'h', c)]);
  if (B > 0.5) items.push([midX, r.y + r.h, midX, e.B, fmtGap(B, 'h', c)]);
  for (const [x1, y1, x2, y2] of items) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.font = FONT;
  for (const [x1, y1, x2, y2, s] of items) {
    const w = tw(ctx, s) + 8;
    const len = Math.hypot(x2 - x1, y2 - y1);
    if (len < 6) continue;
    const r2 = { x: (x1 + x2) / 2 - w / 2, y: (y1 + y2) / 2 - CHIP_H / 2, w, h: CHIP_H };
    chip(ctx, r2, s, PINK, '#fff');
  }
  ctx.restore();
}

// Nearest page edge in each direction from a box (for drawn boxes and moves).
function drawOuterDistances(ctx, r, exclude) {
  const W = app.vw;
  const H = app.vh;
  let left = app.state.canvasMode ? 0 : -Infinity;
  let right = app.state.canvasMode ? W : Infinity;
  let top = app.state.canvasMode ? 0 : -Infinity;
  let bottom = app.state.canvasMode ? H : Infinity;
  const consider = (o) => {
    const yo = o.y < r.y + r.h && o.y + o.h > r.y;
    const xo = o.x < r.x + r.w && o.x + o.w > r.x;
    if (yo) {
      for (const e of [o.x, o.x + o.w]) {
        if (e <= r.x + 0.5 && e > left) left = e;
        if (e >= r.x + r.w - 0.5 && e < right) right = e;
      }
    }
    if (xo) {
      for (const e of [o.y, o.y + o.h]) {
        if (e <= r.y + 0.5 && e > top) top = e;
        if (e >= r.y + r.h - 0.5 && e < bottom) bottom = e;
      }
    }
  };
  if (!app.state.canvasMode && app.state.guides) {
    for (const c of app.cands) {
      if (c.dup || c.x > W || c.y > H || c.x + c.w < 0 || c.y + c.h < 0) continue;
      if (exclude && exclude.some((e) => deepContains(e, c.el))) continue;
      consider(c);
    }
  }
  for (const s of activeShapes()) {
    const sr = shapeRect(s);
    if (sr.x === r.x && sr.y === r.y && sr.w === r.w && sr.h === r.h) continue;
    consider(sr);
  }
  const ctxU = { pw: app.vw, ph: app.vh, fs: app.rootFS };
  const midY = r.y + r.h / 2;
  const midX = r.x + r.w / 2;
  const segs = [];
  if (Number.isFinite(left) && r.x - left > 0.5) segs.push([left, midY, r.x, midY, fmtGap(r.x - left, 'w', ctxU)]);
  if (Number.isFinite(right) && right - (r.x + r.w) > 0.5) segs.push([r.x + r.w, midY, right, midY, fmtGap(right - r.x - r.w, 'w', ctxU)]);
  if (Number.isFinite(top) && r.y - top > 0.5) segs.push([midX, top, midX, r.y, fmtGap(r.y - top, 'h', ctxU)]);
  if (Number.isFinite(bottom) && bottom - (r.y + r.h) > 0.5) segs.push([midX, r.y + r.h, midX, bottom, fmtGap(bottom - r.y - r.h, 'h', ctxU)]);
  ctx.save();
  ctx.strokeStyle = PINK;
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 2]);
  for (const [x1, y1, x2, y2] of segs) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.font = FONT;
  for (const [x1, y1, x2, y2, s] of segs) {
    const len = Math.hypot(x2 - x1, y2 - y1);
    if (len < 10) continue;
    const w = tw(ctx, s) + 8;
    chip(ctx, { x: (x1 + x2) / 2 - w / 2, y: (y1 + y2) / 2 - CHIP_H / 2, w, h: CHIP_H }, s, PINK, '#fff');
  }
  ctx.restore();
}

function drawDistancesForActive(ctx) {
  const d = app.drag;
  if (d && d.type === 'draw' && app.preview) {
    drawOuterDistances(ctx, app.preview.rect, null);
    return;
  }
  if (d && (d.type === 'move' || d.type === 'edge' || d.type === 'corner') && d.items && d.items.length === 1) {
    const it = d.items[0].it;
    const r = itemRect(it);
    if (it.kind === 'el') {
      const p = parentBox(it.el);
      if (p) drawInnerDistances(ctx, r, p.r, itemCtx(it), it.el);
    } else drawOuterDistances(ctx, r, null);
    return;
  }
  if (!d && app.sel.length === 1) {
    const it = app.sel[0];
    if (it.kind === 'shape') drawOuterDistances(ctx, itemRect(it), null);
    else if (app.state.mode === 'change' && it.el.isConnected) {
      const p = parentBox(it.el);
      if (p) drawInnerDistances(ctx, rectOf(it.el), p.r, itemCtx(it), it.el);
    }
  }
}

// ---- flex visuals ------------------------------------------------------------------

let hatch = null;
function hatchPattern(ctx) {
  if (hatch) return hatch;
  const s = 8;
  const c = document.createElement('canvas');
  c.width = s;
  c.height = s;
  const g = c.getContext('2d');
  g.strokeStyle = 'rgba(168,85,247,0.6)';
  g.lineWidth = 1.4;
  g.beginPath();
  g.moveTo(0, s);
  g.lineTo(s, 0);
  g.moveTo(-s / 2, s / 2);
  g.lineTo(s / 2, -s / 2);
  g.moveTo(s / 2, s * 1.5);
  g.lineTo(s * 1.5, s / 2);
  g.stroke();
  hatch = ctx.createPattern(c, 'repeat');
  return hatch;
}

export function flowChildren(el) {
  const out = [];
  for (const k of el.children) {
    if (k === app.host) continue;
    let cs;
    try {
      cs = getComputedStyle(k);
    } catch {
      continue;
    }
    if (cs.display === 'none' || cs.position === 'absolute' || cs.position === 'fixed') continue;
    const r = rectOf(k);
    if (r.w < 0.5 && r.h < 0.5) continue;
    out.push({ el: k, r });
  }
  return out;
}

function drawFlexGaps(ctx, el, r, c) {
  const kids = flowChildren(el);
  if (kids.length < 2) return;
  const row = c.flex ? !String(c.dir).startsWith('column') : true;
  const sorted = kids.slice().sort((a, b) => (row ? a.r.x - b.r.x || a.r.y - b.r.y : a.r.y - b.r.y || a.r.x - b.r.x));
  const pat = hatchPattern(ctx);
  ctx.save();
  ctx.font = FONT;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i].r;
    const b = sorted[i + 1].r;
    let g = null;
    if (row) {
      const overlapY = a.y < b.y + b.h && b.y < a.y + a.h;
      if (!overlapY || b.x <= a.x + a.w + 0.5) continue;
      const y1 = Math.min(a.y, b.y);
      const y2 = Math.max(a.y + a.h, b.y + b.h);
      g = { x: a.x + a.w, y: y1, w: b.x - (a.x + a.w), h: y2 - y1, axis: 'w' };
    } else {
      const overlapX = a.x < b.x + b.w && b.x < a.x + a.w;
      if (!overlapX || b.y <= a.y + a.h + 0.5) continue;
      const x1 = Math.min(a.x, b.x);
      const x2 = Math.max(a.x + a.w, b.x + b.w);
      g = { x: x1, y: a.y + a.h, w: x2 - x1, h: b.y - (a.y + a.h), axis: 'h' };
    }
    if (pat) {
      ctx.fillStyle = pat;
      ctx.fillRect(g.x, g.y, g.w, g.h);
    }
    const s = fmtGap(g.axis === 'w' ? g.w : g.h, g.axis, c);
    const w = tw(ctx, s) + 8;
    if ((g.axis === 'w' && g.h > CHIP_H + 4) || (g.axis === 'h' && g.w > w + 4)) {
      if (g.axis === 'w' && g.w < 12) continue;
      chip(ctx, { x: g.x + g.w / 2 - w / 2, y: g.y + g.h / 2 - CHIP_H / 2, w, h: CHIP_H }, s, 'rgba(147,51,234,0.95)', '#fff');
    }
  }
  const badge = c.grid ? 'grid' : row ? 'flex →' : 'flex ↓';
  const bw = tw(ctx, badge) + 10;
  const by = r.y - CHIP_H - 3 >= 2 ? r.y - CHIP_H - 3 : r.y + 3;
  chip(ctx, { x: r.x + r.w - bw, y: by, w: bw, h: CHIP_H }, badge, 'rgba(91,33,182,0.95)', '#fff');
  ctx.restore();
}

function drawFlexForSelection(ctx) {
  if (app.sel.length !== 1 || app.sel[0].kind !== 'el') return;
  const el = app.sel[0].el;
  if (!el.isConnected) return;
  const c = app.candByEl.get(el);
  if (!c || !(c.flex || c.grid)) return;
  drawFlexGaps(ctx, el, rectOf(el), c);
}

// ---- drawn boxes -----------------------------------------------------------------

function drawShapes(ctx, now, ui) {
  const list = activeShapes();
  if (!list.length) return;
  const canvasMode = app.state.canvasMode;
  const W = app.vw;
  const H = app.vh;
  const ctxU = { pw: W, ph: H, fs: app.rootFS };
  ctx.font = FONT;
  for (const s of list) {
    const r = shapeRect(s);
    if (r.x > W || r.y > H || r.x + r.w < 0 || r.y + r.h < 0) continue;
    const p = easeOutCubic(clamp((now - Math.max(s.born, app.openedAt)) / 320, 0, 1));
    ctx.save();
    ctx.globalAlpha *= p;
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = canvasMode ? '#ffffff' : `rgba(255,255,255,${0.28 + 0.6 * app.state.fill})`;
    ctx.fill();
    if (!canvasMode) {
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.stroke();
    }
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#111';
    ctx.stroke();
    // labels in the original style: white tag, black text
    const ws = fmt(r.w, 'w', ctxU);
    const hs = fmt(r.h, 'h', ctxU);
    const wW = tw(ctx, ws) + 8;
    const hW = tw(ctx, hs) + 8;
    const wr = r.w >= wW + 8 && r.h >= CHIP_H + 8
      ? { x: r.x + r.w / 2 - wW / 2, y: r.y + r.h - CHIP_H - 4, w: wW, h: CHIP_H }
      : { x: r.x + r.w / 2 - wW / 2, y: r.y + r.h + 4, w: wW, h: CHIP_H };
    const hr = r.h >= hW + 8 && r.w >= CHIP_H + 8 + (wr.y < r.y + r.h ? 0 : 0)
      ? { x: r.x + r.w - CHIP_H - 4, y: r.y + r.h / 2 - hW / 2, w: CHIP_H, h: hW }
      : { x: r.x + r.w + 4, y: r.y + r.h / 2 - hW / 2, w: CHIP_H, h: hW };
    const border = canvasMode ? 'rgba(0,0,0,0.14)' : 'rgba(0,0,0,0.18)';
    chip(ctx, wr, ws, '#fff', '#111', 1, border);
    chipV(ctx, hr, hs, '#fff', '#111', 1, border);
    ctx.restore();
    if (ui) {
      const it = shapeItem(s);
      app.chips.push({ ...wr, it, axis: 'w' }, { ...hr, it, axis: 'h' });
    }
  }
}

// ---- selection & handles -----------------------------------------------------------

function drawSelection(ctx) {
  const sel = app.sel;
  if (!sel.length) return;
  const color = selColor();
  const rects = [];
  for (const it of sel) {
    if (it.kind === 'el' && !it.el.isConnected) continue;
    const r = itemRect(it);
    rects.push(r);
    ctx.lineWidth = 2;
    ctx.strokeStyle = color;
    ctx.setLineDash([]);
    ctx.strokeRect(r.x, r.y, r.w, r.h);
  }
  if (!rects.length) return;
  const B = union(rects);
  if (rects.length > 1) {
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(B.x - 0.5, B.y - 0.5, B.w + 1, B.h + 1);
    ctx.setLineDash([]);
  }
  // corner handles
  for (const [x, y] of [[B.x, B.y], [B.x + B.w, B.y], [B.x, B.y + B.h], [B.x + B.w, B.y + B.h]]) {
    ctx.beginPath();
    ctx.rect(x - 4, y - 4, 8, 8);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = color;
    ctx.stroke();
  }
  // size tags outside the box (only for page elements; drawn boxes already show theirs)
  const onlyShapes = sel.every((s) => s.kind === 'shape');
  if (!onlyShapes || sel.length > 1) {
    const it = sel.length === 1 ? sel[0] : null;
    const cU = it ? itemCtx(it) : { pw: app.vw, ph: app.vh, fs: app.rootFS };
    ctx.font = FONT;
    const ws = fmt(B.w, 'w', cU);
    const hs = fmt(B.h, 'h', cU);
    const wW = tw(ctx, ws) + 10;
    const hW = tw(ctx, hs) + 10;
    let wy = B.y + B.h + 8;
    if (wy + CHIP_H > app.vh - 2) wy = B.y + B.h - CHIP_H - 8;
    let hx = B.x + B.w + 8;
    if (hx + CHIP_H > app.vw - 2) hx = B.x + B.w - CHIP_H - 8;
    const wr = { x: B.x + B.w / 2 - wW / 2, y: wy, w: wW, h: CHIP_H + 2 };
    const hr = { x: hx, y: B.y + B.h / 2 - hW / 2, w: CHIP_H + 2, h: hW };
    chip(ctx, wr, ws, color, '#fff');
    chipV(ctx, hr, hs, color, '#fff');
    if (it) app.chips.push({ ...wr, it, axis: 'w' }, { ...hr, it, axis: 'h' });
  }
}

function computeArrows() {
  const out = [];
  const m = app.mouse;
  if (!m.inside || app.state.capturing) return out;
  const d = app.drag;
  if (d && d.type !== 'pending') {
    if (d.type === 'edge') {
      const r = itemRect(d.items[0].it);
      const e = d.edge;
      const pt = e === 't' ? [r.x + r.w / 2, r.y] : e === 'b' ? [r.x + r.w / 2, r.y + r.h] : e === 'l' ? [r.x, r.y + r.h / 2] : [r.x + r.w, r.y + r.h / 2];
      out.push({ it: d.items[0].it, edge: e, x: pt[0], y: pt[1], d: 0, hot: true });
    }
    return out;
  }
  const R = Math.min(app.vw * 0.1, 170);
  const W = app.vw;
  const H = app.vh;
  const push = (it, r) => {
    const pts = [
      ['t', r.x + r.w / 2, r.y],
      ['b', r.x + r.w / 2, r.y + r.h],
      ['l', r.x, r.y + r.h / 2],
      ['r', r.x + r.w, r.y + r.h / 2],
    ];
    for (const [edge, x, y] of pts) {
      const dd = Math.hypot(x - m.x, y - m.y);
      if (dd < R) out.push({ it: typeof it === 'function' ? it() : it, edge, x, y, d: dd });
    }
  };
  for (const s of activeShapes()) push(shapeItem(s), shapeRect(s));
  if (app.state.mode === 'change' && !app.state.canvasMode && app.state.guides) {
    for (const c of app.cands) {
      if (c.dup || c.w < 10 || c.h < 10) continue;
      if (c.x > W || c.y > H || c.x + c.w < 0 || c.y + c.h < 0) continue;
      if (c.x > m.x + R || c.x + c.w < m.x - R || c.y > m.y + R || c.y + c.h < m.y - R) continue;
      const el = c.el;
      push(() => elItem(el), c);
    }
  }
  // selected items always show their edges
  for (const it of app.sel) {
    if (it.kind === 'el' && !it.el.isConnected) continue;
    const r = itemRect(it);
    const pts = [['t', r.x + r.w / 2, r.y], ['b', r.x + r.w / 2, r.y + r.h], ['l', r.x, r.y + r.h / 2], ['r', r.x + r.w, r.y + r.h / 2]];
    for (const [edge, x, y] of pts) out.push({ it, edge, x, y, d: Math.min(R * 0.5, Math.hypot(x - m.x, y - m.y)), sel: true });
  }
  // the selection's own handles win over a neighbour's handle in the same spot
  out.sort((a, b) => (a.sel ? 0 : 1) - (b.sel ? 0 : 1) || a.d - b.d);
  const res = [];
  for (const a of out) {
    if (res.length >= 30) break;
    if (res.some((b) => Math.abs(b.x - a.x) < 9 && Math.abs(b.y - a.y) < 9)) continue;
    res.push(a);
  }
  return res;
}

function tri(ctx, tx, ty, dx, dy, s) {
  const bx = tx - dx * s * 1.25;
  const by = ty - dy * s * 1.25;
  const px = -dy;
  const py = dx;
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(bx + px * s, by + py * s);
  ctx.lineTo(bx - px * s, by - py * s);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function drawArrows(ctx) {
  const R = Math.min(app.vw * 0.1, 170);
  const hot = app.hot && app.hot.type === 'edge' ? app.hot : null;
  const change = app.state.mode === 'change';
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  for (const a of app.arrows) {
    const isHot = a.hot || (hot && hot.x === a.x && hot.y === a.y);
    const alpha = isHot ? 1 : clamp(1 - a.d / R, 0.18, 0.95);
    const s = isHot ? 5.5 : 4.2;
    const gap = 2.5;
    ctx.fillStyle = change ? `rgba(124,58,237,${alpha})` : `rgba(37,99,235,${alpha})`;
    ctx.globalAlpha = Math.min(1, alpha + 0.1);
    if (a.edge === 't' || a.edge === 'b') {
      tri(ctx, a.x, a.y - gap, 0, 1, s);
      tri(ctx, a.x, a.y + gap, 0, -1, s);
    } else {
      tri(ctx, a.x - gap, a.y, 1, 0, s);
      tri(ctx, a.x + gap, a.y, -1, 0, s);
    }
  }
  ctx.restore();
}

export function computeSpacing(items) {
  if (items.length < 2) return null;
  const rs = items.filter((it) => it.kind === 'shape' || it.el.isConnected).map((it) => ({ it, r: itemRect(it) }));
  if (rs.length < 2) return null;
  const tryAxis = (axis) => {
    const sorted = rs.slice().sort((a, b) => (axis === 'x' ? a.r.x - b.r.x : a.r.y - b.r.y));
    const gaps = [];
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i].r;
      const b = sorted[i + 1].r;
      const g = axis === 'x' ? b.x - (a.x + a.w) : b.y - (a.y + a.h);
      if (g < -1) return null;
      let mx, my;
      if (axis === 'x') {
        mx = a.x + a.w + g / 2;
        const y1 = Math.max(a.y, b.y);
        const y2 = Math.min(a.y + a.h, b.y + b.h);
        my = y2 > y1 ? (y1 + y2) / 2 : (a.y + a.h / 2 + b.y + b.h / 2) / 2;
      } else {
        my = a.y + a.h + g / 2;
        const x1 = Math.max(a.x, b.x);
        const x2 = Math.min(a.x + a.w, b.x + b.w);
        mx = x2 > x1 ? (x1 + x2) / 2 : (a.x + a.w / 2 + b.x + b.w / 2) / 2;
      }
      gaps.push({ g, x: mx, y: my });
    }
    return { axis, sorted, gaps };
  };
  const bx = tryAxis('x');
  const by = tryAxis('y');
  if (bx && by) {
    const spreadX = union(rs.map((r) => r.r)).w;
    const spreadY = union(rs.map((r) => r.r)).h;
    return spreadX >= spreadY ? bx : by;
  }
  return bx || by;
}

function drawSpacing(ctx) {
  const d = app.drag;
  const items = d && d.type === 'spacing' ? d.items.map((s) => s.it) : app.sel;
  const sp = items.length >= 2 && (!d || d.type === 'spacing') ? computeSpacing(items) : null;
  app.spacing = sp;
  if (!sp) return;
  ctx.save();
  ctx.font = FONT;
  const ctxU = { pw: app.vw, ph: app.vh, fs: app.rootFS };
  for (const g of sp.gaps) {
    const hot = app.hot && app.hot.type === 'spacing';
    const len = 14;
    const r = sp.axis === 'x' ? { x: g.x - 2.5, y: g.y - len / 2, w: 5, h: len } : { x: g.x - len / 2, y: g.y - 2.5, w: len, h: 5 };
    ctx.beginPath();
    ctx.roundRect(r.x, r.y, r.w, r.h, 3);
    ctx.fillStyle = PINK;
    ctx.fill();
    ctx.lineWidth = hot ? 2 : 1.5;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
    const s = fmtGap(Math.max(0, g.g), sp.axis === 'x' ? 'w' : 'h', ctxU);
    const w = tw(ctx, s) + 8;
    const cr = sp.axis === 'x' ? { x: g.x - w / 2, y: g.y - len / 2 - CHIP_H - 4, w, h: CHIP_H } : { x: g.x + len / 2 + 4, y: g.y - CHIP_H / 2, w, h: CHIP_H };
    chip(ctx, cr, s, PINK, '#fff');
  }
  ctx.restore();
}

function drawMarquee(ctx) {
  const m = app.marquee;
  if (!m) return;
  const color = selColor();
  ctx.save();
  ctx.fillStyle = color === PURPLE_SEL ? 'rgba(124,58,237,0.08)' : 'rgba(37,99,235,0.08)';
  ctx.fillRect(m.x, m.y, m.w, m.h);
  ctx.setLineDash([4, 3]);
  ctx.lineWidth = 1;
  ctx.strokeStyle = color;
  ctx.strokeRect(m.x + 0.5, m.y + 0.5, m.w, m.h);
  ctx.restore();
}

function drawPreview(ctx) {
  const p = app.preview;
  if (!p) return;
  const r = p.rect;
  const s = p.start;
  ctx.save();
  ctx.fillStyle = 'rgba(219,234,254,0.35)';
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.setLineDash([6, 4]);
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#60a5fa';
  ctx.strokeRect(r.x, r.y, r.w, r.h);
  ctx.setLineDash([]);
  // rulers from the start point, like the original
  ctx.strokeStyle = '#3b82f6';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(r.x, s.y + 0.5);
  ctx.lineTo(r.x + r.w, s.y + 0.5);
  ctx.moveTo(s.x + 0.5, r.y);
  ctx.lineTo(s.x + 0.5, r.y + r.h);
  ctx.stroke();
  const ctxU = { pw: app.vw, ph: app.vh, fs: app.rootFS };
  ctx.font = FONT;
  const ws = fmt(r.w, 'w', ctxU);
  const hs = fmt(r.h, 'h', ctxU);
  const wW = tw(ctx, ws) + 8;
  const hW = tw(ctx, hs) + 8;
  const right = s.x <= r.x + 0.5 ? r.x + r.w : r.x;
  chip(ctx, { x: right - wW / 2, y: s.y - CHIP_H - 6, w: wW, h: CHIP_H }, ws, '#fff', '#111', 1, 'rgba(0,0,0,0.18)');
  const bottom = s.y <= r.y + 0.5 ? r.y + r.h : r.y;
  chip(ctx, { x: s.x + 6, y: bottom - CHIP_H / 2, w: hW, h: CHIP_H }, hs, '#fff', '#111', 1, 'rgba(0,0,0,0.18)');
  ctx.restore();
}

function drawSnapLines(ctx) {
  if (!app.snapLines.length) return;
  ctx.save();
  ctx.strokeStyle = PINK;
  ctx.lineWidth = 1;
  for (const l of app.snapLines) {
    ctx.beginPath();
    ctx.moveTo(l.x1 + (l.x1 === l.x2 ? 0.5 : 0), l.y1 + (l.y1 === l.y2 ? 0.5 : 0));
    ctx.lineTo(l.x2 + (l.x1 === l.x2 ? 0.5 : 0), l.y2 + (l.y1 === l.y2 ? 0.5 : 0));
    ctx.stroke();
    for (const [x, y] of [[l.x1, l.y1], [l.x2, l.y2]]) {
      ctx.beginPath();
      ctx.moveTo(x - 3, y - 3);
      ctx.lineTo(x + 3, y + 3);
      ctx.moveTo(x + 3, y - 3);
      ctx.lineTo(x - 3, y + 3);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawPulses(ctx, now) {
  if (!app.pulses.length) return;
  const maxR = Math.hypot(app.vw, app.vh);
  app.pulses = app.pulses.filter((p) => now - p.t0 < p.dur);
  for (const p of app.pulses) {
    const t = clamp((now - p.t0) / p.dur, 0, 1);
    const e = easeOutCubic(t);
    ctx.save();
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(1, e * maxR * (p.scale || 1)), 0, Math.PI * 2);
    ctx.lineWidth = 2 + 14 * (1 - t);
    ctx.strokeStyle = p.color.replace('ALPHA', String(0.55 * (1 - t)));
    ctx.stroke();
    ctx.restore();
  }
}

export function resizeCanvas() {
  const c = app.canvas;
  if (!c) return;
  app.vw = window.innerWidth;
  app.vh = window.innerHeight;
  app.dpr = window.devicePixelRatio || 1;
  c.width = Math.round(app.vw * app.dpr);
  c.height = Math.round(app.vh * app.dpr);
  c.style.width = app.vw + 'px';
  c.style.height = app.vh + 'px';
  app.dirty = true;
}
