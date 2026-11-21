// Shared state for the whole overlay. Every module imports this one object.

export const HOST_TAG = 'precise-dimension';

export const app = {
  // DOM
  host: null,
  shadow: null,
  root: null,
  canvas: null,
  ctx: null,
  layer: null,
  board: null,

  // viewport
  vw: window.innerWidth,
  vh: window.innerHeight,
  dpr: window.devicePixelRatio || 1,
  rootFS: 16,

  state: {
    open: false,
    closing: false,
    closeStart: 0,
    unit: 'vw/vh',
    fill: 0.08,
    guides: true,
    mode: 'measure', // 'measure' | 'draw' | 'change'
    canvasMode: false,
    capturing: false,
    alignOpen: false,
  },

  // measured page elements
  cands: [],
  candByEl: new WeakMap(),
  clips: [],
  truncated: false,
  openedAt: 0,
  revealed: new WeakMap(), // el -> time it first appeared (so re-collects don't replay the cascade)

  // user-drawn boxes
  shapes: { page: [], canvas: [] },

  // interaction
  sel: [], // items: { kind: 'el', el } | { kind: 'shape', shape }
  hover: null,
  hot: null, // handle under the cursor
  mouse: { x: -1, y: -1, inside: false },
  drag: null,
  marquee: null,
  preview: null,
  snapLines: [],
  arrows: [],
  chips: [],
  spacing: null,
  pulses: [],
  hiddenForCapture: new Set(),

  // render bookkeeping
  dirty: true,
  needFull: true,
  needCollect: true,
  live: 0,
  animUntil: 0,
  raf: 0,
  frame: 0,
};

export function requestRender() {
  app.dirty = true;
}

export function requestFull() {
  app.needFull = true;
  app.dirty = true;
}

export function requestCollect() {
  app.needCollect = true;
  app.dirty = true;
}

export function keepAnimating(ms) {
  const until = performance.now() + ms;
  if (until > app.animUntil) app.animUntil = until;
  app.dirty = true;
}

// Short-lived "measure everything every frame" while things move (drags, FLIP animations).
export function liveFor(ms) {
  app.live++;
  keepAnimating(ms);
  setTimeout(() => {
    app.live = Math.max(0, app.live - 1);
    requestFull();
  }, ms);
}
