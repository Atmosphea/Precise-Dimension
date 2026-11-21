// The white and purple circle toolbars, their flyouts and panels, tooltips, hints,
// toasts, and the little box for typing an exact size.
import { app, requestRender, requestFull, keepAnimating } from './app.js';
import { hub } from './hub.js';
import { iconEl } from './icons.js';
import { UNITS, parseDim, rawValue } from './units.js';
import { union, clamp, describe } from './util.js';
import { setSelection, onSelection, startState, applyRect, itemRect, itemCtx, same } from './items.js';
import { begin, commit, undo, canUndo, onHistory } from './history.js';
import { group, ungroup, align, distribute, pulseReflow, magicFix, resetAll, flexInfo, setFlexProp } from './tools.js';
import { buildEditsText } from './exporttext.js';
import { captureVisible, captureFull, stopCapture, copyImage, copyText, downloadBlob, fileName } from './capture.js';
import { savePrefs } from './prefs.js';

const R = {};
export const refs = R;

const UNIT_TIPS = {
  'vw/vh': 'Units: vw / vh — % of the screen width / height (U)',
  px: 'Units: px — screen pixels (U)',
  '%': 'Units: % — of the box it sits in (U)',
  rem: 'Units: rem — multiples of the page font size (U)',
  em: "Units: em — multiples of the element's own font size (U)",
  pt: 'Units: pt — print points (U)',
  tw: 'Units: Tailwind steps — w-4 is 16px (U)',
};

function mk(tag, cls, parent, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}

function statusLayers(b) {
  mk('span', 'st yes', b).appendChild(iconEl('check'));
  mk('span', 'st no', b).appendChild(iconEl('cross'));
}

function circle(parent, cls, icon, tip, onClick) {
  const b = mk('button', 'btn ' + cls, parent);
  b.type = 'button';
  if (icon) b.appendChild(iconEl(icon));
  if (tip) b.dataset.tip = tip;
  b.setAttribute('aria-label', tip || cls);
  statusLayers(b);
  b.addEventListener('click', (e) => {
    hideTip();
    onClick(e, b);
  });
  return b;
}

function split(parent, cls, face, left, right) {
  const w = mk('div', 'btn split ' + cls, parent);
  mk('span', 'face', w).appendChild(iconEl(face));
  const L = mk('button', 'half l', w);
  L.type = 'button';
  L.dataset.tip = left[0];
  L.setAttribute('aria-label', left[0]);
  L.appendChild(iconEl(left[1]));
  const Rt = mk('button', 'half r', w);
  Rt.type = 'button';
  Rt.dataset.tip = right[0];
  Rt.setAttribute('aria-label', right[0]);
  Rt.appendChild(iconEl(right[1]));
  statusLayers(w);
  L.addEventListener('click', (e) => {
    hideTip();
    left[2](e, w, L);
  });
  Rt.addEventListener('click', (e) => {
    hideTip();
    right[2](e, w, Rt);
  });
  return w;
}

function flash(b, ok, ms = 1500) {
  if (!b) return;
  b.classList.remove('ok', 'bad');
  void b.offsetWidth;
  b.classList.add(ok ? 'ok' : 'bad');
  clearTimeout(b._ft);
  b._ft = setTimeout(() => b.classList.remove('ok', 'bad'), ms);
}

function center(el) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

// ---- tooltips ------------------------------------------------------------------------------

let tipTimer = 0;
let tipEl = null;
let tipLast = 0;

function showTipFor(el, text) {
  if (!text || !R.tip || app.state.capturing) return;
  const r = el.getBoundingClientRect();
  R.tip.textContent = text;
  R.tip.classList.add('on');
  const w = R.tip.offsetWidth;
  const x = clamp(r.left + r.width / 2 - w / 2, 6, app.vw - w - 6);
  let y = r.bottom + 8;
  if (y + 24 > app.vh) y = r.top - 30;
  R.tip.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  tipLast = performance.now();
}

export function hideTip() {
  clearTimeout(tipTimer);
  tipEl = null;
  if (R.tip) R.tip.classList.remove('on');
}

function onTipOver(e) {
  const t = e.target && e.target.closest ? e.target.closest('[data-tip]') : null;
  if (!t) return;
  if (t === tipEl) return;
  tipEl = t;
  clearTimeout(tipTimer);
  const quick = performance.now() - tipLast < 700;
  tipTimer = setTimeout(() => {
    if (tipEl === t) showTipFor(t, t.dataset.tip);
  }, quick ? 40 : 380);
}

function onTipOut(e) {
  const t = e.target && e.target.closest ? e.target.closest('[data-tip]') : null;
  if (!t) return;
  if (e.relatedTarget && t.contains(e.relatedTarget)) return;
  if (tipEl === t) {
    if (R.tip.classList.contains('on')) tipLast = performance.now();
    hideTip();
  }
}

// ---- hint line and toasts ------------------------------------------------------------------

let hintTimer = 0;
let toastTimer = 0;
let selHintShown = false;

function hintFor() {
  const st = app.state;
  if (st.canvasMode) return 'Drag to draw boxes · Shift-drag or double-click-drag to select · Esc leaves the canvas';
  if (st.mode === 'draw') return 'Drag to draw a box · drag a box to move it · grab the arrows on its edges to resize · Esc to stop';
  if (st.mode === 'change')
    return `Click to pick anything · ${modKey()}-click again for the box around it · ${modKey()}+Shift-click picks everything like it · drag to move · W A S D resize`;
  return 'Hover anything to see its size and spacing · U switches units · H hides guides · Esc closes';
}

function modKey() {
  return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '') ? 'Ctrl/⌘' : 'Ctrl';
}

export function showHint(text, ms = 6500) {
  if (!R.hint) return;
  R.hint.textContent = text || hintFor();
  R.hint.classList.add('on');
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => R.hint.classList.remove('on'), ms);
}

export function toast(msg, ms = 2600) {
  if (!msg || !R.toast) return;
  R.toast.textContent = msg;
  R.toast.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => R.toast.classList.remove('on'), ms);
}

// ---- actions ---------------------------------------------------------------------------------

function runTool(w, fn) {
  let res;
  try {
    res = fn();
  } catch (err) {
    console.warn('[Precise Dimension]', err);
    res = { ok: false, msg: "That didn't work on this page" };
  }
  if (res && res.msg) toast(res.msg);
  flash(w, !res || res.ok !== false);
  sync();
  requestFull();
  return res;
}

let busy = false;

function captureError(err) {
  const m = String((err && err.message) || err || '');
  if (/permission|activeTab|not allowed|cannot access|must request/i.test(m))
    return 'Screenshot blocked — click the extension icon on this tab again, then retry';
  return 'Screenshot failed' + (m ? ': ' + m.slice(0, 90) : '');
}

// A camera flash: the whole screen goes white for a moment, then fades away.
export function cameraFlash() {
  if (!app.root) return;
  const f = mk('div', 'flash', app.root);
  app.lastFlash = performance.now();
  f.addEventListener('animationend', () => f.remove());
  setTimeout(() => f.remove(), 2000);
}

// The little card that shows a full-page screenshot being taken, with a live preview of the
// picture as the pieces are joined. It hides for the instant each piece is taken.
const hud = {
  t: null,
  k: 1,
  show() {
    clearTimeout(hud.t);
    R.hudFill.style.width = '0%';
    R.hud.classList.remove('snap');
    R.hud.classList.add('on');
  },
  hide(ms = 0) {
    clearTimeout(hud.t);
    hud.t = setTimeout(() => R.hud.classList.remove('on'), ms);
  },
  phase(text) {
    R.hudSub.textContent = text;
  },
  progress(p) {
    R.hudFill.style.width = (clamp(p, 0, 1) * 100).toFixed(1) + '%';
  },
  snap(on) {
    R.hud.classList.toggle('snap', on);
  },
  previewStart(W, H) {
    const c = R.hudPrev;
    const dpr = window.devicePixelRatio || 1;
    const cw = 52;
    const ch = Math.round(clamp((cw * H) / W, 24, 132));
    c.style.width = cw + 'px';
    c.style.height = ch + 'px';
    c.width = Math.round(cw * dpr);
    c.height = Math.round(ch * dpr);
    hud.k = Math.min(c.width / W, c.height / H);
    hud.ox = (c.width - W * hud.k) / 2;
    const g = c.getContext('2d');
    g.fillStyle = '#f3f4f6';
    g.fillRect(0, 0, c.width, c.height);
    c.classList.add('on');
  },
  previewDraw(img, sx, sy, sw, sh, dx, dy, dw, dh) {
    const g = R.hudPrev.getContext('2d');
    const k = hud.k;
    try {
      g.drawImage(img, sx, sy, sw, sh, hud.ox + dx * k, dy * k, dw * k, Math.max(1, dh * k));
    } catch {}
  },
};

function shot(kind, how, w) {
  if (busy) return;
  busy = true;
  hideTip();
  closeEditor(true);
  const full = kind === 'full';
  const make = full ? () => captureFull(hud) : captureVisible;
  const label = full ? 'Full page' : 'Screenshot';
  const done = (ok, msg, blob) => {
    busy = false;
    if (full) hud.hide(ok ? 120 : 0);
    if (ok) cameraFlash();
    flash(w, ok, ok ? 1600 : 2400);
    if (msg) toast(msg, ok ? 2400 : 3600);
  };
  const fail = (err) => {
    if (err && err.stopped) {
      busy = false;
      if (full) hud.hide();
      toast('Screenshot stopped', 1600);
      return;
    }
    done(false, captureError(err));
  };
  const size = (blob) => (blob && blob._w ? ` (${blob._w} × ${blob._h})` : '');
  const name = fileName(full ? 'full-page' : 'screen');
  // If this page doesn't allow copying (plain http:// sites, for example), save the file instead.
  const saveInstead = (p, why) =>
    p.then(
      (blob) => {
        downloadBlob(blob, name);
        const what = label.toLowerCase();
        const m = String((why && why.message) || '');
        let msg;
        if (!window.isSecureContext) msg = `This page doesn't allow copying, so the ${what} was downloaded instead`;
        else if (/focus/i.test(m)) msg = `Copying needs this tab to stay in front, so the ${what} was downloaded instead`;
        else msg = `Couldn't copy that picture (it may be too big for the clipboard), so the ${what} was downloaded instead`;
        done(true, msg);
      },
      fail,
    );
  if (how === 'copy') {
    let p;
    try {
      p = make();
      copyImage(p).then(
        () => p.then((blob) => done(true, `${label} copied${size(blob)} — paste it anywhere`)),
        (why) => saveInstead(p, why),
      );
    } catch (err) {
      if (p) saveInstead(p);
      else fail(err);
    }
  } else {
    make().then(
      (blob) => {
        downloadBlob(blob, name);
        done(true, `${label} downloaded`);
      },
      fail,
    );
  }
}

function copyEdits(b) {
  let text = null;
  try {
    text = buildEditsText();
  } catch (err) {
    console.warn('[Precise Dimension]', err);
  }
  if (!text) {
    flash(b, false);
    toast('Nothing to copy yet — move, resize or draw something first');
    return;
  }
  copyText(text).then(
    () => {
      flash(b, true);
      toast('Edits copied as text — paste them to your coding agent');
    },
    () => {
      flash(b, false);
      toast("This page won't let me copy text");
    },
  );
}

export function cycleUnit(dir = 1) {
  const i = UNITS.indexOf(app.state.unit);
  app.state.unit = UNITS[(i + dir + UNITS.length) % UNITS.length];
  savePrefs();
  sync();
  requestRender();
  if (R.unit) {
    showTipFor(R.unit, UNIT_TIPS[app.state.unit]);
    clearTimeout(tipTimer);
    tipTimer = setTimeout(hideTip, 1800);
  }
}

export function toggleGuides() {
  app.state.guides = !app.state.guides;
  savePrefs();
  sync();
  requestFull();
  toast(app.state.guides ? 'Guides on' : 'Guides off — your boxes and edits stay', 1500);
}

let canvasPrev = 'measure';

function leaveCanvas() {
  app.state.canvasMode = false;
  app.state.mode = canvasPrev;
}

export function setMode(mode) {
  const st = app.state;
  if (st.canvasMode) leaveCanvas();
  if (st.mode === mode) {
    sync();
    return;
  }
  hub.cancelDrag();
  closeEditor(false);
  st.mode = mode;
  st.alignOpen = false;
  app.hover = null;
  setSelection([]);
  showHint();
  sync();
  requestFull();
}

export function setCanvas(on) {
  const st = app.state;
  if (!!on === st.canvasMode) return;
  hub.cancelDrag();
  closeEditor(false);
  setSelection([]);
  st.alignOpen = false;
  if (on) {
    canvasPrev = st.mode;
    const c = center(R.canvas);
    app.board.style.setProperty('--ox', c.x + 'px');
    app.board.style.setProperty('--oy', c.y + 'px');
    st.canvasMode = true;
    st.mode = 'draw';
  } else {
    leaveCanvas();
  }
  app.hover = null;
  showHint();
  sync();
  requestFull();
  keepAnimating(800);
}

// ---- align flyout (purple bar) and floating align strip (drawn boxes) -----------------

const ALIGN_ITEMS = [
  ['alignLeft', 'left', 'Align left edges'],
  ['alignHCenter', 'hcenter', 'Align centers'],
  ['alignRight', 'right', 'Align right edges'],
  null,
  ['alignTop', 'top', 'Align tops'],
  ['alignVCenter', 'vcenter', 'Align middles'],
  ['alignBottom', 'bottom', 'Align bottoms'],
  null,
  ['distH', 'x', 'Even spacing, left to right'],
  ['distV', 'y', 'Even spacing, top to bottom'],
];

function fillAlign(container) {
  for (const it of ALIGN_ITEMS) {
    if (!it) {
      mk('span', 'sep', container);
      continue;
    }
    const b = mk('button', 'ib', container);
    b.type = 'button';
    b.dataset.tip = it[2];
    b.setAttribute('aria-label', it[2]);
    b.appendChild(iconEl(it[0]));
    b.addEventListener('click', () => {
      hideTip();
      let res;
      try {
        res = it[1] === 'x' || it[1] === 'y' ? distribute(it[1]) : align(it[1]);
      } catch (err) {
        console.warn('[Precise Dimension]', err);
        res = { ok: false, msg: "That didn't work on this page" };
      }
      if (res && res.msg) toast(res.msg, 1800);
      sync();
      requestFull();
    });
  }
}

function toggleAlign() {
  app.state.alignOpen = !app.state.alignOpen;
  if (app.state.alignOpen && !app.sel.length) toast('Pick one or more things — one thing lines up inside the box around it', 2600);
  sync();
}

function updateAlignFly() {
  const st = app.state;
  const open = st.alignOpen && st.mode === 'change' && !st.canvasMode && R.purple.classList.contains('shown') && !st.closing;
  R.fly.classList.toggle('open', open);
  R.align.classList.toggle('on', open);
  if (!open) return;
  const r = R.align.getBoundingClientRect();
  const w = R.fly.offsetWidth;
  const x = clamp(r.left + r.width / 2 - w / 2, 8, app.vw - w - 8);
  R.fly.style.transform = `translate(${Math.round(x)}px, ${Math.round(r.bottom + 10)}px)`;
}

// ---- flex panel -------------------------------------------------------------------------------

let curFlex = null;

const normJ = (v) => (['normal', 'start', 'flex-start', 'left'].includes(v) ? 'flex-start' : ['end', 'flex-end', 'right'].includes(v) ? 'flex-end' : v);
const normA = (v) => (['normal', 'stretch'].includes(v) ? 'stretch' : ['start', 'flex-start', 'self-start'].includes(v) ? 'flex-start' : ['end', 'flex-end', 'self-end'].includes(v) ? 'flex-end' : v);

function flexTarget() {
  const st = app.state;
  if (st.mode !== 'change' || st.canvasMode || app.sel.length !== 1 || app.sel[0].kind !== 'el') return null;
  const el = app.sel[0].el;
  if (!el.isConnected) return null;
  try {
    return flexInfo(el).isFlex ? el : null;
  } catch {
    return null;
  }
}

function flexSet(props, label) {
  const el = flexTarget();
  if (!el) return;
  setFlexProp(el, props, label || 'Flex');
  sync();
}

function buildFlexPanel() {
  const p = mk('div', 'panel ui', app.root);
  R.fpTitle = mk('div', 'ttl', p);
  const row = (label) => {
    const r = mk('div', 'row', p);
    mk('span', 'lab', r, label);
    return r;
  };
  const ib = (parent, icon, tip, fn) => {
    const b = mk('button', 'ib', parent);
    b.type = 'button';
    b.dataset.tip = tip;
    b.setAttribute('aria-label', tip);
    b.appendChild(iconEl(icon));
    b.addEventListener('click', (e) => {
      hideTip();
      fn(e);
    });
    return b;
  };
  const r1 = row('Direction');
  R.fpRow = ib(r1, 'dirRow', 'Side by side (row)', () => flexSet({ 'flex-direction': 'row' }, 'Direction'));
  R.fpCol = ib(r1, 'dirCol', 'Stacked (column)', () => flexSet({ 'flex-direction': 'column' }, 'Direction'));
  R.fpWrap = ib(r1, 'wrap', 'Wrap onto new lines', () => flexSet({ 'flex-wrap': curFlex && curFlex.wrap === 'wrap' ? 'nowrap' : 'wrap' }, 'Wrap'));
  const r2 = row('Spread');
  R.fpJ = [
    ['jStart', 'flex-start', 'Pack at the start'],
    ['jCenter', 'center', 'Pack in the middle'],
    ['jEnd', 'flex-end', 'Pack at the end'],
    ['jBetween', 'space-between', 'Spread out, no space at the ends'],
    ['jAround', 'space-around', 'Spread out with space around each'],
  ].map(([icon, v, tip]) => {
    const b = ib(r2, icon, tip, () => flexSet({ 'justify-content': v }, 'Spread'));
    b.dataset.v = v;
    return b;
  });
  const r3 = row('Line up');
  R.fpA = [
    ['aStart', 'flex-start', 'Line up at the start'],
    ['aCenter', 'center', 'Line up the middles'],
    ['aEnd', 'flex-end', 'Line up at the end'],
    ['aStretch', 'stretch', 'Stretch to fill'],
  ].map(([icon, v, tip]) => {
    const b = ib(r3, icon, tip, () => flexSet({ 'align-items': v }, 'Line up'));
    b.dataset.v = v;
    return b;
  });
  const r4 = row('Gap');
  const gapStep = (dir, e) => {
    const el = flexTarget();
    if (!el) return;
    const f = flexInfo(el);
    const step = e && e.shiftKey ? 1 : 4;
    const g = Math.max(0, Math.round(f.gap) + dir * step);
    flexSet({ gap: g + 'px' }, 'Gap');
  };
  ib(r4, 'minus', 'Less space between (Shift = 1px)', (e) => gapStep(-1, e));
  R.fpGap = mk('span', 'val', r4, '0px');
  ib(r4, 'plus', 'More space between (Shift = 1px)', (e) => gapStep(1, e));
  R.panel = p;
}

function updateFlexPanel() {
  const el = flexTarget();
  const open = !!el && R.purple.classList.contains('shown') && !app.state.closing;
  R.panel.classList.toggle('open', open);
  if (!open) return;
  const f = flexInfo(el);
  curFlex = f;
  R.fpTitle.textContent = (el.hasAttribute('data-pd-group') ? 'New group' : describe(el)) + ' · flex box';
  const col = f.dir.startsWith('column');
  R.fpRow.classList.toggle('on', !col);
  R.fpCol.classList.toggle('on', col);
  R.fpWrap.classList.toggle('on', f.wrap === 'wrap');
  for (const b of R.fpJ) b.classList.toggle('on', normJ(f.justify) === b.dataset.v);
  for (const b of R.fpA) b.classList.toggle('on', normA(f.align) === b.dataset.v);
  R.fpGap.textContent = Math.round(f.gap) + 'px';
  const below = R.fly.classList.contains('open') ? R.fly.getBoundingClientRect().bottom : R.purple.getBoundingClientRect().bottom;
  const w = R.panel.offsetWidth;
  R.panel.style.transform = `translate(${Math.round(app.vw - 12 - w)}px, ${Math.round(below + 10)}px)`;
}

// ---- typing an exact size ------------------------------------------------------------------

let editing = null;

function setupEditor() {
  const inp = R.edit;
  inp.type = 'text';
  inp.spellcheck = false;
  inp.autocomplete = 'off';
  inp.setAttribute('aria-label', 'Size');
  inp.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      closeEditor(true);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeEditor(false);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const ed = editing;
      if (closeEditor(true) && ed) openEditorFor(ed.it, ed.axis === 'w' ? 'h' : 'w');
    }
  });
  inp.addEventListener('blur', () => closeEditor(true));
}

export function openEditor(chip) {
  openEditorFor(chip.it, chip.axis, chip);
}

function openEditorFor(it, axis, chip) {
  closeEditor(false);
  if (it.kind === 'el' && !it.el.isConnected) return;
  const ctx = itemCtx(it);
  const r = itemRect(it);
  const px = axis === 'w' ? r.w : r.h;
  const c = chip || app.chips.find((k) => same(k.it, it) && k.axis === axis);
  const cx = c ? c.x + c.w / 2 : axis === 'w' ? r.x + r.w / 2 : r.x + r.w;
  const cy = c ? c.y + c.h / 2 : axis === 'w' ? r.y + r.h : r.y + r.h / 2;
  const inp = R.edit;
  inp.value = rawValue(px, axis, ctx);
  inp.style.display = 'block';
  const w = 70;
  inp.style.width = w + 'px';
  inp.style.left = clamp(cx - w / 2, 4, app.vw - w - 4) + 'px';
  inp.style.top = clamp(cy - 10, 4, app.vh - 24) + 'px';
  editing = { it, axis, ctx };
  inp.focus({ preventScroll: true });
  inp.select();
  const other = axis === 'w' ? 'height' : 'width';
  toast(`Type a ${axis === 'w' ? 'width' : 'height'} — like 240, 20vw, 50% or 12rem · Enter sets it · Tab for ${other}`, 3400);
}

export function closeEditor(apply) {
  if (!editing) return false;
  const ed = editing;
  editing = null;
  const inp = R.edit;
  const val = inp.value;
  inp.style.display = 'none';
  if (app.shadow.activeElement === inp) inp.blur();
  if (!apply) return true;
  const v = parseDim(val, ed.axis, ed.ctx);
  if (v == null || !(v > 0)) {
    if (val.trim()) toast(`"${val.trim()}" isn't a size I understand — try 240, 20vw or 50%`);
    return false;
  }
  if (ed.it.kind === 'el' && !ed.it.el.isConnected) return false;
  begin('Set size');
  const s = startState(ed.it);
  const r = { ...s.rect };
  if (ed.axis === 'w') r.w = v;
  else r.h = v;
  applyRect(s, r, true);
  commit();
  requestFull();
  return true;
}

export function closeFlyouts() {
  let any = false;
  if (app.state.alignOpen) {
    app.state.alignOpen = false;
    any = true;
  }
  if (editing) {
    closeEditor(false);
    any = true;
  }
  if (any) sync();
  return any;
}

// ---- show / hide the bars -------------------------------------------------------------------

function prepFly(bar, roll) {
  const kids = [...bar.children];
  const n = kids.length;
  const right = bar.offsetLeft + bar.offsetWidth;
  kids.forEach((k, i) => {
    const toRight = right - (k.offsetLeft + k.offsetWidth);
    const dx = toRight + k.offsetWidth / 2 + (roll ? 30 : 8);
    k.style.setProperty('--dx', Math.round(dx) + 'px');
    k.style.setProperty('--d', (n - 1 - i) * (roll ? 42 : 36) + 'ms');
    if (roll) k.style.setProperty('--rot', Math.round((dx / (Math.PI * 34)) * 360) + 'deg');
  });
}

function setPurple(show) {
  const on = R.purple.classList.contains('shown');
  if (show === on) return;
  if (show) {
    prepFly(R.purple, true);
    void R.purple.offsetWidth;
    R.purple.classList.add('shown');
  } else {
    R.purple.classList.remove('shown');
  }
  app.uiRectDirty = true;
  setTimeout(() => {
    app.uiRectDirty = true;
    updateFlexPanel();
    updateAlignFly();
  }, 380);
}

export function showBars() {
  R.white.classList.remove('shown');
  prepFly(R.white, false);
  void R.white.offsetWidth;
  requestAnimationFrame(() => {
    R.white.classList.add('shown');
    sync();
  });
}

export function hideBars() {
  hideTip();
  R.white.classList.remove('shown');
  R.purple.classList.remove('shown');
  R.hint.classList.remove('on');
  R.toast.classList.remove('on');
}

export function sync() {
  if (!R.white) return;
  const st = app.state;
  const root = app.root;
  root.dataset.mode = st.mode;
  if (st.canvasMode) root.dataset.canvas = '1';
  else delete root.dataset.canvas;
  R.draw.classList.toggle('on', st.mode === 'draw' && !st.canvasMode);
  R.canvas.classList.toggle('on', st.canvasMode);
  R.change.classList.toggle('on', st.mode === 'change' && !st.canvasMode);
  for (const g of [R.guidesW, R.guidesP]) {
    g.classList.toggle('off', !st.guides);
    g.dataset.tip = st.guides ? 'Hide guides (H)' : 'Show guides (H)';
  }
  R.unitTxt.textContent = st.unit;
  R.unit.classList.toggle('long', st.unit.length > 3);
  R.unit.dataset.tip = UNIT_TIPS[st.unit];
  const pct = String(Math.round(st.fill * 100));
  if (R.range.value !== pct) R.range.value = pct;
  R.range.style.setProperty('--p', pct + '%');
  setPurple(st.open && !st.closing && st.mode === 'change' && !st.canvasMode && R.white.classList.contains('shown'));
  R.undo.classList.toggle('dim', !canUndo());
  updateAlignFly();
  updateFlexPanel();
  if (st.mode === 'change' && !st.canvasMode && app.sel.length === 1 && !selHintShown) {
    selHintShown = true;
    showHint(`${modKey()}-click again for the box around it · ${modKey()}+Shift-click picks all like it · Shift-click adds more · W/S shorter/taller · A/D narrower/wider`, 7000);
  }
  app.uiRectDirty = true;
}

let uiFrame = 0;

// Narrow windows (phones, split screens): shrink the toolbars so every button still fits.
function fitBars() {
  const natural = Math.max(R.white.scrollWidth, R.purple.scrollWidth);
  const room = app.vw - 24;
  const k = natural > room ? clamp(room / natural, 0.55, 1) : 1;
  const v = k < 1 ? `scale(${k.toFixed(3)})` : '';
  if (R.bars.style.transform !== v) R.bars.style.transform = v;
}

// Called every drawn frame.
export function frameUI() {
  if (!R.afloat) return;
  const st = app.state;
  const show = (st.canvasMode || st.mode === 'draw') && app.sel.length >= 2 && !app.drag && !st.capturing && !st.closing;
  if (show) {
    const B = union(app.sel.map(itemRect));
    const w = R.afloat.offsetWidth || 300;
    const h = R.afloat.offsetHeight || 36;
    let y = B.y - h - 14;
    if (y < 8) y = B.y + B.h + 14;
    if (y + h > app.vh - 8) y = clamp(B.y + 8, 8, app.vh - h - 8);
    const x = clamp(B.x + B.w / 2 - w / 2, 8, app.vw - w - 8);
    R.afloat.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }
  if (R.afloat.classList.contains('open') !== show) R.afloat.classList.toggle('open', show);
  if (app.uiRectDirty || uiFrame++ % 40 === 0) {
    fitBars();
    const r = R.bars.getBoundingClientRect();
    app.uiRect = { x: r.left - 4, y: r.top - 4, w: r.width + 8, h: r.height + 8 };
    app.uiRectDirty = false;
  }
}

// ---- build ------------------------------------------------------------------------------------

export function buildUI() {
  const root = app.root;
  const bars = mk('div', 'bars', root);
  const white = mk('div', 'bar white ui', bars);
  const purple = mk('div', 'bar purple ui', bars);
  R.bars = bars;
  R.white = white;
  R.purple = purple;

  // white bar
  R.close = circle(white, 'small close', 'close', 'Close (Esc)', () => hub.close());

  const pill = mk('div', 'btn pill', white);
  pill.dataset.tip = 'How strong the blue fill is';
  mk('span', 'plab', pill, 'fill');
  const range = mk('input', 'range', pill);
  range.type = 'range';
  range.min = '0';
  range.max = '100';
  range.step = '1';
  range.value = String(Math.round(app.state.fill * 100));
  range.setAttribute('aria-label', 'Fill strength');
  range.addEventListener('input', () => {
    app.state.fill = Number(range.value) / 100;
    range.style.setProperty('--p', range.value + '%');
    showTipFor(pill, `Fill ${range.value}%`);
    clearTimeout(tipTimer);
    tipTimer = setTimeout(hideTip, 900);
    requestRender();
    savePrefs();
  });
  R.pill = pill;
  R.range = range;

  R.unit = circle(white, 'unit', null, UNIT_TIPS[app.state.unit], (e) => cycleUnit(e.shiftKey ? -1 : 1));
  R.unitTxt = mk('span', 'txt', R.unit, app.state.unit);

  R.draw = circle(white, 'draw', 'draw', 'Draw boxes — drag on the page', () => {
    const st = app.state;
    if (st.canvasMode) {
      setCanvas(false);
      setMode('draw');
    } else setMode(st.mode === 'draw' ? 'measure' : 'draw');
  });
  R.canvas = circle(white, 'canvas', 'canvas', 'Blank canvas — sketch a layout', () => setCanvas(!app.state.canvasMode));
  R.shot = split(
    white,
    'shot',
    'screen',
    ['Copy a screenshot of what you see', 'copy', (e, w) => shot('screen', 'copy', w)],
    ['Download a screenshot of what you see', 'download', (e, w) => shot('screen', 'download', w)],
  );
  R.full = split(
    white,
    'full',
    'fullpage',
    ['Copy a screenshot of the whole page', 'copy', (e, w) => shot('full', 'copy', w)],
    ['Download a screenshot of the whole page', 'download', (e, w) => shot('full', 'download', w)],
  );
  R.change = circle(white, 'change', 'change', 'Change mode — move and resize anything on the page', () => {
    const st = app.state;
    if (st.canvasMode) {
      setCanvas(false);
      setMode('change');
    } else setMode(st.mode === 'change' ? 'measure' : 'change');
  });
  R.guidesW = guidesButton(white);

  // purple bar (change mode)
  R.reflow = split(
    purple,
    'reflow',
    'reflow',
    ['Pulse reflow — turn your moves into real layout', 'pulse', (e, w) => runTool(w, () => pulseReflow(center(w)))],
    ['Magic fix — line things up neatly', 'magic', (e, w) => runTool(w, () => magicFix(center(w)))],
  );
  R.group = split(
    purple,
    'group',
    'group',
    ['Group into a flex box (⌘G)', 'group', (e, w) => runTool(w, group)],
    ['Ungroup (⇧⌘G)', 'ungroup', (e, w) => runTool(w, ungroup)],
  );
  R.align = circle(purple, 'align', 'align', 'Align and even spacing', () => toggleAlign());
  R.text = circle(purple, 'text', 'text', 'Copy edits as text — for your coding agent', (e, b) => copyEdits(b));
  R.undo = split(
    purple,
    'undo',
    'undo',
    [
      'Undo (⌘Z)',
      'undo',
      () => {
        if (!undo()) toast('Nothing to undo');
        sync();
        requestFull();
      },
    ],
    ['Reset everything back to the original page', 'reset', (e, w) => runTool(w, resetAll)],
  );
  R.guidesP = guidesButton(purple);

  // flyouts, panels, feedback
  R.fly = mk('div', 'fly ui', root);
  fillAlign(R.fly);
  R.afloat = mk('div', 'afloat ui', root);
  fillAlign(R.afloat);
  buildFlexPanel();
  R.hud = mk('div', 'hud', root);
  R.hudPrev = mk('canvas', 'hud-prev', R.hud);
  const ht = mk('div', 'hud-txt', R.hud);
  mk('div', 'hud-title', ht, 'Full-page screenshot');
  R.hudSub = mk('div', 'hud-sub', ht, '');
  const hb = mk('div', 'hud-bar', ht);
  R.hudFill = mk('i', '', hb);
  mk('div', 'hud-esc', ht, 'Esc stops');
  R.tip = mk('div', 'tip', root);
  R.hint = mk('div', 'hint', root);
  R.toast = mk('div', 'toast', root);
  R.toast.setAttribute('role', 'status');
  R.edit = mk('input', 'dimedit ui', root);
  setupEditor();

  root.addEventListener('pointerover', onTipOver);
  root.addEventListener('pointerout', onTipOut);
  root.addEventListener('pointerdown', (e) => {
    if (e.target && e.target.closest && e.target.closest('[data-tip]')) hideTip();
  });
  onSelection(sync);
  onHistory(sync);

  Object.assign(hub, {
    toast,
    hint: showHint,
    sync,
    openEditor,
    closeEditor,
    closeFlyouts,
    setMode,
    setCanvas,
    cycleUnit,
    toggleGuides,
    group: () => runTool(R.group, group),
    ungroup: () => runTool(R.group, ungroup),
    cancelCapture: stopCapture,
  });
}

function guidesButton(parent) {
  const b = circle(parent, 'guides', null, 'Hide guides (H)', () => toggleGuides());
  const on = iconEl('eye');
  on.classList.add('i-on');
  const off = iconEl('eyeOff');
  off.classList.add('i-off');
  b.prepend(off);
  b.prepend(on);
  return b;
}
