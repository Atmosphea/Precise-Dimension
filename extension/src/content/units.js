import { app } from './app.js';

// Same cycle as the original app, plus Tailwind steps at the end.
export const UNITS = ['vw/vh', 'px', '%', 'rem', 'em', 'pt', 'tw'];

export function nextUnit(u) {
  return UNITS[(UNITS.indexOf(u) + 1) % UNITS.length];
}

function trim(n, d) {
  const f = Math.pow(10, d);
  return String(Math.round(n * f) / f);
}

function smart(n) {
  return Math.abs(n) >= 10 ? String(Math.round(n)) : trim(n, 1);
}

// ctx: { pw, ph, fs } = parent content width/height and own font size (for % and em)
export function fmt(px, axis, ctx = null, unit = app.state.unit) {
  const vw = app.vw;
  const vh = app.vh;
  switch (unit) {
    case 'vw/vh':
      return axis === 'w' ? smart((px / vw) * 100) + 'vw' : smart((px / vh) * 100) + 'vh';
    case 'px':
      return Math.round(px) + 'px';
    case '%': {
      const base = axis === 'w' ? (ctx && ctx.pw) || vw : (ctx && ctx.ph) || vh;
      return smart((px / base) * 100) + '%';
    }
    case 'rem':
      return trim(px / app.rootFS, 2) + 'rem';
    case 'em':
      return trim(px / ((ctx && ctx.fs) || app.rootFS), 2) + 'em';
    case 'pt':
      return smart(px * 0.75) + 'pt';
    case 'tw': {
      const n = px / 4;
      const q = Math.round(n * 2) / 2;
      const prefix = axis === 'w' ? 'w-' : 'h-';
      return Math.abs(n - q) < 0.13 ? prefix + trim(q, 1) : prefix + '[' + Math.round(px) + 'px]';
    }
    default:
      return Math.round(px) + 'px';
  }
}

// Distances and gaps: same units, but Tailwind shows the bare spacing step.
export function fmtGap(px, axis, ctx = null, unit = app.state.unit) {
  if (unit === 'tw') {
    const n = px / 4;
    const q = Math.round(n * 2) / 2;
    return Math.abs(n - q) < 0.13 ? trim(q, 1) : '[' + Math.round(px) + 'px]';
  }
  return fmt(px, axis, ctx, unit);
}

// Both px and the current unit, for the copy-as-text export.
export function both(px, axis, ctx = null) {
  const p = Math.round(px) + 'px';
  if (app.state.unit === 'px') return p;
  return `${p} (${fmt(px, axis, ctx)})`;
}

// Size of one display unit in px for the current unit (used for snapping drawn boxes to whole numbers).
export function unitStep(axis, ctx = null, unit = app.state.unit) {
  switch (unit) {
    case 'vw/vh':
      return axis === 'w' ? app.vw / 100 : app.vh / 100;
    case '%':
      return (axis === 'w' ? (ctx && ctx.pw) || app.vw : (ctx && ctx.ph) || app.vh) / 100;
    case 'rem':
      return app.rootFS / 4;
    case 'em':
      return ((ctx && ctx.fs) || app.rootFS) / 4;
    case 'pt':
      return 4 / 3;
    case 'tw':
      return 4;
    default:
      return 1;
  }
}

export function snapToUnit(px, axis, ctx = null) {
  const s = unitStep(axis, ctx);
  if (s <= 0) return px;
  const v = Math.round(px / s) * s;
  return v > 0 ? v : s;
}

// Parse what someone typed into a dimension label. "13" means 13 of the current unit.
export function parseDim(str, axis, ctx = null) {
  // accept "w-12", "h-[250px]", "[250px]" as well as "13", "13vw", "250px"
  let t = String(str).trim().toLowerCase().replace(/^(w|h|size)-/, '');
  let tw = false;
  const br = t.match(/^\[(.*)\]$/);
  if (br) t = br[1];
  else if (/^\d*\.?\d+$/.test(t) && app.state.unit === 'tw') tw = true;
  const m = t.match(/^(-?\d*\.?\d+)\s*([a-z%]*)$/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  let u = m[2];
  if (!u) {
    u = app.state.unit;
    if (u === 'vw/vh') u = axis === 'w' ? 'vw' : 'vh';
    if (u === 'tw') u = tw ? 'tw' : 'px';
  }
  switch (u) {
    case 'px':
      return n;
    case 'vw':
      return (n / 100) * app.vw;
    case 'vh':
      return (n / 100) * app.vh;
    case '%':
      return (n / 100) * (axis === 'w' ? (ctx && ctx.pw) || app.vw : (ctx && ctx.ph) || app.vh);
    case 'rem':
      return n * app.rootFS;
    case 'em':
      return n * ((ctx && ctx.fs) || app.rootFS);
    case 'pt':
      return n / 0.75;
    case 'tw':
      return n * 4;
    default:
      return null;
  }
}

// The number shown in a label without its unit (for pre-filling the editor).
export function rawValue(px, axis, ctx = null) {
  if (app.state.unit === 'tw') {
    const n = px / 4;
    const q = Math.round(n * 2) / 2;
    return Math.abs(n - q) < 0.13 ? trim(q, 1) : Math.round(px) + 'px';
  }
  const s = fmt(px, axis, ctx);
  const m = s.match(/^-?\d*\.?\d+/);
  return m ? m[0] : String(Math.round(px));
}
