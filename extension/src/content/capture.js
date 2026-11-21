// Screenshots of the visible screen or the whole page, with every guide baked in.
//
// The whole page is taken piece by piece: scroll, snap, scroll, snap, then the pieces are
// joined pixel for pixel at the screen's real resolution. Before that it scrolls through once,
// so lazy pictures and scroll-in animations have loaded. Sticky headers are put back in their
// place in the page (so they show once, at the top, instead of on every piece), fixed bars and
// buttons show up once, and pages that scroll a panel instead of the page itself (most web
// apps) get that panel stretched out to its full length.
import { app, requestRender, requestFull } from './app.js';
import { frames, sleep, deepContains, isOurs, parentOf } from './util.js';
import { getRec } from './edits.js';
import { PngWriter } from './png.js';

const GAP = 560; // Chrome allows about two captures a second
const MAX_SLICES = 150;
const MAX_CSS_H = 250000;
// Bigger than this and the picture is written strip by strip instead of on one canvas.
const CANVAS_MAX_H = 16384;
const CANVAS_MAX_AREA = 80e6;

let lastCapture = 0;
let stopFlag = false;

export class Stopped extends Error {
  constructor() {
    super('Screenshot stopped');
    this.stopped = true;
  }
}

export function stopCapture() {
  stopFlag = true;
}

const NOHUD = { show() {}, hide() {}, phase() {}, progress() {}, snap() {}, previewStart() {}, previewDraw() {} };

function dataUrlToBlob(url) {
  const comma = url.indexOf(',');
  const meta = url.slice(5, comma);
  const bin = atob(url.slice(comma + 1));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: meta.split(';')[0] || 'image/png' });
}

async function waitSlot() {
  const wait = GAP - (performance.now() - lastCapture);
  if (wait > 0) await sleep(wait);
}

async function grab() {
  for (let attempt = 0; ; attempt++) {
    await waitSlot();
    lastCapture = performance.now();
    const res = await chrome.runtime.sendMessage({ type: 'pd:capture' });
    if (res && res.ok) return res.dataUrl;
    const err = (res && res.error) || 'Screenshot failed';
    if (attempt < 2 && /MAX_CAPTURE|quota|per second/i.test(err)) {
      await sleep(700);
      continue;
    }
    throw new Error(err);
  }
}

async function prepare() {
  app.state.capturing = true;
  app.root.classList.add('capturing');
  app.wave = null; // screenshots never catch the opening animation half way
  const done = performance.now() - 5000;
  for (const c of app.cands) if (c.at > done) c.at = done;
  requestFull();
  await frames(3);
}

function unprepare() {
  app.state.capturing = false;
  app.root.classList.remove('capturing');
  requestRender();
}

export async function captureVisible() {
  await prepare();
  try {
    return dataUrlToBlob(await grab());
  } finally {
    unprepare();
  }
}

// ---- what scrolls ----------------------------------------------------------------------------

function docScroller() {
  const de = document.documentElement;
  const se = document.scrollingElement || de;
  const quirks = document.compatMode === 'BackCompat' && document.body;
  const x0 = window.scrollX;
  return {
    kind: 'doc',
    el: se,
    top: () => window.scrollY,
    to: (y) => window.scrollTo({ left: x0, top: y, behavior: 'instant' }),
    height: () => se.scrollHeight,
    view: () => {
      let w = quirks ? document.body.clientWidth : de.clientWidth;
      let h = quirks ? document.body.clientHeight : de.clientHeight;
      if (!(w > 0 && w <= window.innerWidth)) w = window.innerWidth;
      if (!(h > 0 && h <= window.innerHeight)) h = window.innerHeight;
      return { x: 0, y: 0, w, h };
    },
  };
}

function elScroller(el) {
  return {
    kind: 'el',
    el,
    top: () => el.scrollTop,
    to: (y) => el.scrollTo({ left: el.scrollLeft, top: y, behavior: 'instant' }),
    height: () => el.scrollHeight,
    view: () => {
      const r = el.getBoundingClientRect();
      return { x: r.left + el.clientLeft, y: r.top + el.clientTop, w: el.clientWidth, h: el.clientHeight };
    },
  };
}

// The page itself, or (for web apps where the page stays put) the big panel that scrolls.
export function pickScroller() {
  const doc = docScroller();
  if (doc.height() - doc.view().h > 4) return doc;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let best = null;
  const seen = new Set();
  for (const [fx, fy] of [[0.5, 0.5], [0.3, 0.55], [0.7, 0.55], [0.5, 0.8], [0.5, 0.3]]) {
    let list;
    try {
      list = document.elementsFromPoint(vw * fx, vh * fy);
    } catch {
      continue;
    }
    const hit = list.find((e) => e !== app.host && !isOurs(e));
    for (let e = hit; e && e !== document.documentElement; e = parentOf(e)) {
      if (seen.has(e)) continue;
      seen.add(e);
      if (e.scrollHeight - e.clientHeight < 8) continue;
      let oy;
      try {
        oy = getComputedStyle(e).overflowY;
      } catch {
        continue;
      }
      if (oy !== 'auto' && oy !== 'scroll' && oy !== 'overlay') continue;
      const r = e.getBoundingClientRect();
      const w = Math.min(r.right, vw) - Math.max(r.left, 0);
      const h = Math.min(r.bottom, vh) - Math.max(r.top, 0);
      if (w <= 0 || h <= 0 || w * h < vw * vh * 0.18) continue;
      if (r.top < -1 || r.bottom > vh + 1) continue; // has to fit in the window top to bottom
      if (!best || w * h > best.area) best = { e, area: w * h };
    }
  }
  return best ? elScroller(best.e) : null;
}

// ---- temporary page changes, all undone afterwards ---------------------------------------------

class Saver {
  constructor() {
    this.list = [];
  }
  set(el, prop, val) {
    this.list.push([el, prop, el.style.getPropertyValue(prop), el.style.getPropertyPriority(prop)]);
    el.style.setProperty(prop, val, 'important');
  }
  restore() {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const [el, p, v, pr] = this.list[i];
      if (v) el.style.setProperty(p, v, pr);
      else el.style.removeProperty(p);
    }
    this.list = [];
  }
}

function hideScrollbar(sc, keep) {
  if (sc.kind === 'doc') {
    // Floating scrollbars (most Macs) are hidden. Classic ones take up room, and taking that
    // away would re-flow the page, so those are simply cut off the picture.
    const de = document.documentElement;
    if (window.innerWidth - de.clientWidth <= 0) keep.set(de, 'scrollbar-width', 'none');
    return;
  }
  const el = sc.el;
  let cs;
  try {
    cs = getComputedStyle(el);
  } catch {
    return;
  }
  const gutter = el.offsetWidth - el.clientWidth - parseFloat(cs.borderLeftWidth || 0) - parseFloat(cs.borderRightWidth || 0);
  if (gutter < 0.5) keep.set(el, 'scrollbar-width', 'none');
  else keep.set(el, 'scrollbar-color', 'transparent transparent'); // keeps its room, paints nothing
}

function scanPositioned() {
  const sticky = [];
  const fixed = [];
  const all = document.body ? document.body.querySelectorAll('*') : [];
  for (const el of all) {
    if (el === app.host) continue;
    let pos;
    try {
      pos = getComputedStyle(el).position;
    } catch {
      continue;
    }
    if (pos === 'sticky' || pos === '-webkit-sticky') sticky.push(el);
    else if (pos === 'fixed') fixed.push(el);
  }
  return { sticky, fixed };
}

function paintsItself(el) {
  const tag = el.tagName;
  if (tag === 'IMG' || tag === 'VIDEO' || tag === 'CANVAS' || tag === 'svg' || tag === 'PICTURE') return true;
  let cs;
  try {
    cs = getComputedStyle(el);
  } catch {
    return false;
  }
  if (cs.backgroundImage && cs.backgroundImage !== 'none') return true;
  const m = /rgba?\(([^)]+)\)/.exec(cs.backgroundColor || '');
  if (!m) return false;
  const parts = m[1].split(/[\s,/]+/).filter(Boolean);
  const a = parts.length >= 4 ? parseFloat(parts[3]) * (parts[3].endsWith('%') ? 0.01 : 1) : 1;
  return a > 0.05;
}

// True when the page's content covers this fixed layer (it's a background, not a bar).
function behindContent(el, r) {
  const x1 = Math.max(r.left, 0);
  const x2 = Math.min(r.right, window.innerWidth);
  const y1 = Math.max(r.top, 0);
  const y2 = Math.min(r.bottom, window.innerHeight);
  let front = 0;
  for (const [fx, fy] of [[0.5, 0.5], [0.2, 0.3], [0.8, 0.7]]) {
    let top = null;
    try {
      top = document.elementsFromPoint(x1 + (x2 - x1) * fx, y1 + (y2 - y1) * fy).find((e) => e !== app.host && !isOurs(e)) || null;
    } catch {}
    if (top && (top === el || deepContains(el, top))) front++;
  }
  return front < 2;
}

// Fixed things (headers, chat bubbles, cookie bars) would show up on every piece. Ones near the
// top show on the first piece only, ones near the bottom on the last; backgrounds stay on all.
function classifyFixed(list) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const out = [];
  for (const el of list) {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    if (r.bottom <= 0 || r.top >= vh || r.right <= 0 || r.left >= vw) continue;
    if (paintsItself(el) && behindContent(el, r)) continue;
    out.push({ el, bottom: r.top + r.height / 2 > vh * 0.55 && r.height < vh * 0.7 });
  }
  return out;
}

class Hider {
  constructor(items) {
    this.items = items.map((it) => ({ ...it, v: it.el.style.getPropertyValue('visibility'), p: it.el.style.getPropertyPriority('visibility'), off: false }));
  }
  set(it, off) {
    if (it.off === off) return;
    it.off = off;
    if (off) it.el.style.setProperty('visibility', 'hidden', 'important');
    else if (it.v) it.el.style.setProperty('visibility', it.v, it.p);
    else it.el.style.removeProperty('visibility');
  }
  // which: 'all' | 'first' | 'last' | 'none'
  show(which) {
    for (const it of this.items) {
      const on = which === 'all' || (which === 'first' && !it.bottom) || (which === 'last' && it.bottom);
      this.set(it, !on);
    }
    const set = app.hiddenForCapture;
    set.clear();
    for (const it of this.items) {
      if (!it.off) continue;
      set.add(it.el);
      for (const c of app.cands) if (deepContains(it.el, c.el)) set.add(c.el);
    }
  }
  restore() {
    for (const it of this.items) this.set(it, false);
    app.hiddenForCapture.clear();
  }
}

async function waitImages(ms) {
  const t0 = performance.now();
  for (;;) {
    let pending = 0;
    for (const img of document.images) {
      if (img.complete) continue;
      const r = img.getBoundingClientRect();
      if (r.width < 1 || r.bottom < 0 || r.top > window.innerHeight) continue;
      pending++;
    }
    if (!pending || performance.now() - t0 > ms) return;
    await sleep(80);
  }
}

// Scroll through once so lazy pictures, infinite lists and scroll-in animations load.
async function loadPass(sc, hud, check) {
  const view = sc.view();
  const H = sc.height();
  if (H - view.h < 4) return;
  hud.phase('Loading the whole page…');
  const n = Math.min(60, Math.ceil((H - view.h) / view.h));
  for (let i = 1; i <= n; i++) {
    check();
    sc.to(Math.min(H - view.h, i * view.h));
    await frames(1);
    await sleep(100);
    hud.progress(0.02 + 0.2 * (i / n));
  }
  await waitImages(1500);
  sc.to(0);
  await frames(2);
  await sleep(200);
}

// ---- stitching ---------------------------------------------------------------------------------

class Stitcher {
  constructor(W, H, hud) {
    this.W = W;
    this.H = H;
    this.hud = hud;
    this.whole = H <= CANVAS_MAX_H && W * H <= CANVAS_MAX_AREA;
    this.ops = [];
    this.done = 0;
    this.live = new Set();
    if (this.whole) {
      this.cv = new OffscreenCanvas(W, H);
      this.g = this.cv.getContext('2d');
      this.g.imageSmoothingEnabled = false;
      this.g.fillStyle = '#fff';
      this.g.fillRect(0, 0, W, H);
    } else {
      this.png = new PngWriter(W, H);
      this.band = Math.max(16, Math.min(512, Math.floor(16e6 / (W * 4))));
      this.bc = new OffscreenCanvas(W, this.band);
      this.bg = this.bc.getContext('2d', { willReadFrequently: true });
      this.bg.imageSmoothingEnabled = false;
    }
    hud.previewStart(W, H);
  }

  draw(img, sx, sy, sw, sh, dx, dy, dw = sw, dh = sh) {
    if (sw <= 0 || sh <= 0 || dw <= 0 || dh <= 0) return;
    this.hud.previewDraw(img, sx, sy, sw, sh, dx, dy, dw, dh);
    if (this.whole) this.g.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
    else {
      this.ops.push({ img, sx, sy, sw, sh, dx, dy, dw, dh });
      this.live.add(img);
    }
  }

  // Done with this piece (it's freed once nothing still needs it).
  release(img) {
    if (this.whole) img.close();
    else img._free = true;
  }

  // Rows above upTo won't change any more: write them out (strip mode).
  async flush(upTo) {
    if (this.whole) return;
    upTo = Math.min(this.H, Math.round(upTo));
    while (this.done < upTo) {
      const y0 = this.done;
      const n = Math.min(this.band, upTo - y0);
      const g = this.bg;
      g.fillStyle = '#fff';
      g.fillRect(0, 0, this.W, n);
      for (const o of this.ops) if (o.dy < y0 + n && o.dy + o.dh > y0) g.drawImage(o.img, o.sx, o.sy, o.sw, o.sh, o.dx, o.dy - y0, o.dw, o.dh);
      await this.png.addRows(g.getImageData(0, 0, this.W, n).data, n);
      this.done += n;
    }
    this.ops = this.ops.filter((o) => o.dy + o.dh > this.done);
    const still = new Set(this.ops.map((o) => o.img));
    for (const img of this.live) {
      if (!still.has(img) && img._free) {
        img.close();
        this.live.delete(img);
      }
    }
  }

  async finish() {
    if (this.whole) {
      const blob = await this.cv.convertToBlob({ type: 'image/png' });
      this.cv.width = 1;
      this.cv.height = 1;
      return blob;
    }
    await this.flush(this.H);
    for (const img of this.live) img.close();
    this.live.clear();
    return this.png.finish();
  }

  abort() {
    for (const img of this.live) {
      try {
        img.close();
      } catch {}
    }
    this.live.clear();
    this.ops = [];
  }
}

// Where every piece goes in the final picture, in real screen pixels.
class Layout {
  constructor(sc, view, H, maxTop, bmp, hud) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    this.bw = bmp.width;
    this.bh = bmp.height;
    // Pages sit on whole screen pixels, so the screen's true density puts every piece exactly in
    // place. (The window's size in page pixels is rounded, so the picture's own size can be a
    // hair off at 125% or 175% scaling; it's only used if it clearly disagrees.)
    const dpr = window.devicePixelRatio || 1;
    const mx = bmp.width / vw;
    const my = bmp.height / vh;
    const kx = Math.abs(mx - dpr) < 0.03 ? dpr : mx;
    const ky = Math.abs(my - dpr) < 0.03 ? dpr : my;
    this.X = (v) => Math.round(v * kx);
    this.Y = (v) => Math.round(v * ky);
    this.view = view;
    this.maxTop = maxTop;
    this.doc = sc.kind === 'doc';
    if (this.doc) {
      this.W = Math.min(bmp.width, this.X(view.w)); // leaves out a classic scrollbar
      this.sliceH = Math.min(bmp.height, this.Y(view.h));
      this.H = Math.max(this.sliceH, this.Y(H));
    } else {
      this.x0 = Math.max(0, this.X(view.x));
      this.x1 = Math.min(bmp.width, this.X(view.x + view.w));
      this.y0 = Math.max(0, this.Y(view.y));
      this.y1 = Math.min(bmp.height, this.Y(view.y + view.h));
      this.extra = Math.max(0, this.Y(H) - (this.y1 - this.y0));
      const de = document.documentElement;
      this.W = Math.min(bmp.width, this.X(de.clientWidth > 0 && de.clientWidth <= vw ? de.clientWidth : vw));
      this.H = bmp.height + this.extra;
    }
    this.out = new Stitcher(this.W, this.H, hud);
  }

  async add(bmp, t, first, last) {
    const o = this.out;
    const next = Math.min(t + this.view.h, this.maxTop); // where the next piece will start
    if (this.doc) {
      const dy = this.Y(t);
      o.draw(bmp, 0, 0, this.W, Math.min(this.sliceH, this.H - dy), 0, dy);
      o.release(bmp);
      await o.flush(last ? this.H : this.Y(next));
      return;
    }
    if (first) this.statics(bmp);
    const dy = this.y0 + this.Y(t);
    o.draw(bmp, this.x0, this.y0, this.x1 - this.x0, Math.min(this.y1 - this.y0, this.y1 + this.extra - dy), this.x0, dy);
    o.release(bmp);
    await o.flush(last ? this.H : this.y0 + this.Y(next));
  }

  // The parts of a web app around its scrolling panel come from the first piece: what's above
  // it goes at the top, what's below it at the bottom, and side bars are stretched by repeating
  // one plain row of pixels (picked where nothing is drawn, so buttons stay crisp).
  statics(bmp) {
    const o = this.out;
    const { W, x0, x1, y0, y1, extra } = this;
    o.draw(bmp, 0, 0, W, y0, 0, 0);
    o.draw(bmp, 0, y1, W, this.bh - y1, 0, y1 + extra);
    for (const [sx, sw] of [[0, x0], [x1, W - x1]]) {
      if (sw <= 0 || y1 - y0 <= 0) continue;
      const q = calmRow(bmp, sx, sw, y0, y1);
      o.draw(bmp, sx, y0, sw, q - y0, sx, y0);
      if (extra > 0) o.draw(bmp, sx, q, sw, 1, sx, q, sw, extra);
      o.draw(bmp, sx, q, sw, y1 - q, sx, q + extra);
    }
  }
}

// The middle of the longest stretch of identical rows in a side strip.
function calmRow(bmp, sx, sw, y0, y1) {
  const h = y1 - y0;
  if (h < 4) return y1 - 1;
  let d;
  try {
    const c = new OffscreenCanvas(sw, h);
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(bmp, sx, y0, sw, h, 0, 0, sw, h);
    d = g.getImageData(0, 0, sw, h).data;
  } catch {
    return y1 - 1;
  }
  const n = sw * 4;
  const same = (a, b) => {
    const oa = a * n;
    const ob = b * n;
    for (let i = 0; i < n; i++) if (Math.abs(d[oa + i] - d[ob + i]) > 2) return false;
    return true;
  };
  let best = null;
  let start = 0;
  for (let r = 1; r <= h; r++) {
    if (r < h && same(r - 1, r)) continue;
    const len = r - start;
    if (len >= 3 && (!best || len >= best.len)) best = { start, len };
    start = r;
  }
  if (!best) return y1 - 1;
  return y0 + best.start + Math.floor(best.len / 2);
}

// ---- the whole page ---------------------------------------------------------------------------

async function snap(hud) {
  await waitSlot();
  if (document.visibilityState !== 'visible') throw new Error('the tab was switched during the screenshot');
  hud.snap(true);
  await frames(2);
  try {
    return await grab();
  } finally {
    hud.snap(false);
  }
}

export async function captureFull(hud = NOHUD) {
  if (app.state.canvasMode) return captureVisible();
  const sc = pickScroller();
  if (!sc) return captureVisible();
  stopFlag = false;
  const check = () => {
    if (stopFlag) throw new Stopped();
  };
  const keep = new Saver();
  const de = document.documentElement;
  const sx0 = window.scrollX;
  const sy0 = window.scrollY;
  const et0 = sc.kind === 'el' ? sc.el.scrollTop : 0;
  let hider = null;
  let lay = null;
  hud.show();
  hud.phase('Getting the page ready…');
  hud.progress(0.02);
  await prepare();
  try {
    // instant jumps, not smooth scrolling
    keep.set(de, 'scroll-behavior', 'auto');
    if (document.body) keep.set(document.body, 'scroll-behavior', 'auto');
    if (sc.kind === 'el') keep.set(sc.el, 'scroll-behavior', 'auto');
    hideScrollbar(sc, keep);
    if (document.fonts && document.fonts.ready) await Promise.race([document.fonts.ready, sleep(1200)]);
    await loadPass(sc, hud, check);
    const pos = scanPositioned();
    for (const el of pos.sticky) {
      if (getRec(el)) continue; // something you moved yourself stays where you put it
      keep.set(el, 'position', 'relative');
      for (const p of ['top', 'bottom', 'left', 'right']) keep.set(el, p, 'auto');
    }
    sc.to(0);
    await frames(2);
    await sleep(150);
    hider = new Hider(classifyFixed(pos.fixed));
    const view = sc.view();
    const H = Math.min(sc.height(), MAX_CSS_H);
    const maxTop = Math.max(0, H - view.h);
    const plan = Math.min(MAX_SLICES, Math.ceil(maxTop / Math.max(1, view.h)) + 1);
    let want = 0;
    let prevT = -1;
    for (let k = 0; ; k++) {
      check();
      if (k > 0) {
        sc.to(want);
        await frames(2);
        await sleep(140);
      }
      const t = sc.top();
      const last = t >= maxTop - 0.5 || k >= MAX_SLICES - 1 || (k > 0 && t <= prevT + 0.5);
      hider.show(k === 0 && last ? 'all' : k === 0 ? 'first' : last ? 'last' : 'none');
      await waitImages(1500);
      requestFull();
      await frames(2);
      hud.phase(`Capturing ${k + 1} of ${Math.max(plan, k + 1)}`);
      check();
      const url = await snap(hud);
      const bmp = await createImageBitmap(dataUrlToBlob(url), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
      if (!lay) lay = new Layout(sc, view, H, maxTop, bmp, hud);
      else if (bmp.width !== lay.bw || bmp.height !== lay.bh) {
        bmp.close();
        throw new Error('the window changed size during the screenshot — try again');
      }
      await lay.add(bmp, t, k === 0, last);
      hud.progress(0.24 + 0.66 * Math.min(1, (t + view.h) / Math.max(1, H)));
      if (last) break;
      prevT = t;
      want = Math.min(maxTop, t + view.h);
    }
  } catch (err) {
    if (lay) lay.out.abort();
    throw err;
  } finally {
    // put the page back exactly as it was
    if (sc.kind === 'el') sc.el.scrollTo({ top: et0, left: sc.el.scrollLeft, behavior: 'instant' });
    window.scrollTo({ left: sx0, top: sy0, behavior: 'instant' });
    if (hider) hider.restore();
    keep.restore();
    unprepare();
    requestFull();
  }
  hud.phase('Stitching…');
  hud.progress(0.94);
  const blob = await lay.out.finish();
  blob._w = lay.W;
  blob._h = lay.H;
  hud.progress(1);
  return blob;
}

// ---- clipboard and files -----------------------------------------------------------------------

// Must be called synchronously inside the click so the browser allows it.
export function copyImage(blobPromise) {
  const item = new ClipboardItem({ 'image/png': blobPromise });
  return navigator.clipboard.write([item]);
}

export function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).catch(() => legacyCopy(text));
  return legacyCopy(text);
}

// Older copy method that still works on pages without the modern clipboard (plain http://).
function legacyCopy(text) {
  return new Promise((resolve, reject) => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;left:-9999px;top:0;width:10px;height:10px;opacity:0;';
    (app.root || document.body).appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {}
    ta.remove();
    if (ok) resolve();
    else reject(new Error('copy blocked'));
  });
}

export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.style.display = 'none';
  (app.root || document.body).appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 5000);
}

export function fileName(kind) {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const host = (location.hostname || 'page').replace(/^www\./, '').replace(/[^a-z0-9.-]/gi, '-');
  return `precise-dimension_${host}_${kind}_${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.png`;
}
