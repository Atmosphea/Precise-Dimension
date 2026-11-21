// Entry point. Injected into the page each time the toolbar icon is clicked:
// the first click opens the overlay, the next click closes it.
import { app, HOST_TAG, requestRender, requestFull, requestCollect, keepAnimating } from './app.js';
import { hub } from './hub.js';
import { collect, measure } from './collect.js';
import { draw, resizeCanvas, startWave } from './render.js';
import { buildUI, showBars, hideBars, sync, frameUI, showHint } from './ui.js';
import { setupLayer, attachInteract, detachInteract } from './interact.js';
import { setSelection } from './items.js';
import { getRec } from './edits.js';
import { loadPrefs } from './prefs.js';
import { CSS } from './styles.js';

const VERSION = '0.2.0';
// eslint-disable-next-line no-undef
const BUILD = typeof __PD_BUILD__ === 'string' ? __PD_BUILD__ : VERSION; // set by build.mjs
let mo = null;
let timers = [];
let closeTimer = 0;
let collectTimer = 0;

function build() {
  const host = document.createElement(HOST_TAG);
  host.style.cssText =
    'all: initial !important; position: fixed !important; inset: 0 !important; z-index: 2147483647 !important; pointer-events: none !important; display: block !important;';
  const shadow = host.attachShadow({ mode: 'open' });
  let styled = false;
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(CSS);
    shadow.adoptedStyleSheets = [sheet];
    styled = true;
  } catch {}
  if (!styled) {
    const st = document.createElement('style');
    st.textContent = CSS;
    shadow.appendChild(st);
  }
  const root = document.createElement('div');
  root.className = 'pd';
  root.dataset.mode = 'measure';
  shadow.appendChild(root);
  const board = document.createElement('div');
  board.className = 'board';
  const canvas = document.createElement('canvas');
  canvas.className = 'cv';
  const layer = document.createElement('div');
  layer.className = 'layer';
  root.append(board, canvas, layer);
  app.host = host;
  app.shadow = shadow;
  app.root = root;
  app.board = board;
  app.canvas = canvas;
  app.ctx = canvas.getContext('2d');
  app.layer = layer;
  buildUI();
  setupLayer();
}

// ---- keeping the boxes in sync with the page ---------------------------------------------

function scheduleCollect() {
  if (collectTimer) return;
  // busy pages re-measure less often when measuring them is slow, so they stay smooth
  const wait = Math.max(250, Math.min(2000, (app.collectMs || 0) * 6));
  collectTimer = setTimeout(() => {
    collectTimer = 0;
    requestCollect();
  }, wait);
}

function onMutations(list) {
  if (!app.state.open) return;
  for (const m of list) {
    const t = m.target;
    if (t === app.host) continue;
    if (m.type === 'childList') {
      let ours = true;
      for (const n of m.addedNodes) if (n !== app.host) ours = false;
      for (const n of m.removedNodes) if (n !== app.host) ours = false;
      if (ours) continue;
    } else if (m.type === 'attributes' && m.attributeName === 'style' && getRec(t)) {
      continue; // our own edits; drags keep those boxes measured already
    }
    scheduleCollect();
    return;
  }
}

function onScroll(e) {
  const t = e.target;
  if (t === document || t === document.documentElement || t === document.body || t === window) {
    requestRender();
    const b = app.band;
    if (b) {
      const sy = window.scrollY;
      const vh = window.innerHeight;
      if (sy < b.top + vh * 0.5 || sy + vh > b.bottom - vh * 0.5) requestCollect();
    }
  } else requestFull();
}

function onResize() {
  resizeCanvas();
  requestCollect();
  app.uiRectDirty = true;
}

function onSettled() {
  requestFull();
}

function attachListeners() {
  window.addEventListener('scroll', onScroll, { capture: true, passive: true });
  window.addEventListener('resize', onResize);
  window.addEventListener('transitionend', onSettled, true);
  window.addEventListener('animationend', onSettled, true);
  window.addEventListener('load', onSettled, true);
  try {
    document.fonts.addEventListener('loadingdone', onSettled);
  } catch {}
  mo = new MutationObserver(onMutations);
  mo.observe(document.documentElement, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'hidden', 'open', 'src', 'srcset', 'width', 'height', 'colspan', 'rowspan', 'type', 'dir'],
  });
  timers.push(setInterval(requestFull, 1000));
}

function detachListeners() {
  window.removeEventListener('scroll', onScroll, { capture: true });
  window.removeEventListener('resize', onResize);
  window.removeEventListener('transitionend', onSettled, true);
  window.removeEventListener('animationend', onSettled, true);
  window.removeEventListener('load', onSettled, true);
  try {
    document.fonts.removeEventListener('loadingdone', onSettled);
  } catch {}
  if (mo) mo.disconnect();
  mo = null;
  for (const t of timers) clearInterval(t);
  timers = [];
  clearTimeout(collectTimer);
  collectTimer = 0;
}

// ---- frame loop ----------------------------------------------------------------------------

function tick(now) {
  app.raf = requestAnimationFrame(tick);
  const st = app.state;
  if (!st.open) return;
  if (window.innerWidth !== app.vw || window.innerHeight !== app.vh || (window.devicePixelRatio || 1) !== app.dpr) {
    resizeCanvas();
    requestCollect();
  }
  if (app.needCollect && !app.drag && !st.closing) {
    try {
      collect();
    } catch (err) {
      console.warn('[Precise Dimension] measuring failed', err);
      app.needCollect = false;
    }
    keepAnimating(900);
  }
  const animating = now < app.animUntil || app.live > 0 || !!app.drag;
  if (!app.dirty && !animating) return;
  app.dirty = false;
  try {
    measure(false);
    draw(now);
    frameUI(now);
  } catch (err) {
    console.warn('[Precise Dimension] drawing failed', err);
  }
}

// ---- open / close ----------------------------------------------------------------------------

function open() {
  const st = app.state;
  if (st.open && !st.closing) return;
  clearTimeout(closeTimer);
  if (!app.host) build();
  if (!app.host.isConnected) (document.documentElement || document.body).appendChild(app.host);
  const wasClosing = st.closing;
  st.open = true;
  st.closing = false;
  st.capturing = false;
  st.mode = 'measure';
  st.canvasMode = false;
  st.alignOpen = false;
  app.root.classList.remove('capturing');
  if (!wasClosing) {
    app.openedAt = performance.now();
    app.revealed = new WeakMap();
    app.reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    resizeCanvas();
    startWave(); // the opening pulse out of the toolbar icon
    collect();
    attachListeners();
  }
  keepAnimating(2100);
  attachInteract();
  showBars();
  sync();
  showHint();
  if (!app.raf) app.raf = requestAnimationFrame(tick);
}

function finish() {
  detachListeners();
  if (app.raf) cancelAnimationFrame(app.raf);
  app.raf = 0;
  app.state.open = false;
  app.state.closing = false;
  if (app.host) app.host.remove();
}

function close() {
  const st = app.state;
  if (!st.open || st.closing) return;
  hub.cancelDrag();
  hub.closeEditor(false);
  st.alignOpen = false;
  st.canvasMode = false;
  st.mode = 'measure';
  setSelection([]);
  st.closing = true;
  st.closeStart = performance.now();
  hideBars();
  sync();
  detachInteract();
  keepAnimating(500);
  closeTimer = setTimeout(finish, 420);
}

function toggle() {
  if (app.state.open && !app.state.closing) close();
  else open();
}

hub.close = close;

// Shut down at once, with no animation (used when a newer copy of the extension takes over).
function retire() {
  clearTimeout(closeTimer);
  try {
    hub.cancelDrag();
    detachInteract();
  } catch {}
  finish();
}

(function main() {
  const existing = window.__PD__;
  if (existing && typeof existing.toggle === 'function') {
    if (existing.build === BUILD) {
      existing.toggle();
      return;
    }
    // Left over from before the extension was updated: retire it and start fresh.
    try {
      if (typeof existing.retire === 'function') existing.retire();
      else existing.close();
    } catch {}
    for (const n of document.querySelectorAll(HOST_TAG)) n.remove();
  }
  if (!document.documentElement) return;
  window.__PD__ = { version: VERSION, build: BUILD, app, hub, open, close, toggle, retire, requestFull, requestRender };
  loadPrefs().finally(open);
})();
