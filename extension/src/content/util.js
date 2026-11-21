import { app } from './app.js';

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutBack = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

export function rectOf(el) {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

export const rx2 = (r) => r.x + r.w;
export const ry2 = (r) => r.y + r.h;
export const cx = (r) => r.x + r.w / 2;
export const cy = (r) => r.y + r.h / 2;

export function intersect(a, b) {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const r = Math.min(a.x + a.w, b.x + b.w);
  const bt = Math.min(a.y + a.h, b.y + b.h);
  return r > x && bt > y ? { x, y, w: r - x, h: bt - y } : null;
}

export function overlaps(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export function containsRect(outer, inner, tol = 0) {
  return (
    inner.x >= outer.x - tol &&
    inner.y >= outer.y - tol &&
    inner.x + inner.w <= outer.x + outer.w + tol &&
    inner.y + inner.h <= outer.y + outer.h + tol
  );
}

export function containsPt(r, x, y, tol = 0) {
  return x >= r.x - tol && x <= r.x + r.w + tol && y >= r.y - tol && y <= r.y + r.h + tol;
}

export function union(rects) {
  if (!rects.length) return null;
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const r of rects) {
    x1 = Math.min(x1, r.x);
    y1 = Math.min(y1, r.y);
    x2 = Math.max(x2, r.x + r.w);
    y2 = Math.max(y2, r.y + r.h);
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

export function sameRect(a, b, tol = 0.75) {
  return (
    Math.abs(a.x - b.x) <= tol &&
    Math.abs(a.y - b.y) <= tol &&
    Math.abs(a.w - b.w) <= tol &&
    Math.abs(a.h - b.h) <= tol
  );
}

export function normRect(x1, y1, x2, y2) {
  return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
export async function frames(n = 2) {
  for (let i = 0; i < n; i++) await nextFrame();
}

export function isOurs(node) {
  if (!node) return false;
  if (node === app.host) return true;
  try {
    return node.getRootNode && node.getRootNode() === app.shadow;
  } catch {
    return false;
  }
}

// Like Node.contains, but also looks inside web components (shadow DOM).
export function deepContains(a, b) {
  for (let n = b; n; n = n.parentNode || (n.nodeType === 11 && n.host) || null) if (n === a) return true;
  return false;
}

export function isRootish(el) {
  return el === document.documentElement || el === document.body;
}

// True when the page itself has keyboard focus in a text field (so we leave its keys alone).
export function pageIsTyping() {
  let a = document.activeElement;
  while (a && a.shadowRoot && a.shadowRoot.activeElement) a = a.shadowRoot.activeElement;
  if (!a || a === app.host) return false;
  if (a.isContentEditable) return true;
  const tag = a.tagName;
  if (tag === 'TEXTAREA') return true;
  if (tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const t = (a.getAttribute('type') || 'text').toLowerCase();
    return !['button', 'checkbox', 'radio', 'submit', 'reset', 'range', 'color', 'file', 'image'].includes(t);
  }
  return false;
}

const KIND = {
  a: 'Link',
  button: 'Button',
  img: 'Image',
  picture: 'Image',
  svg: 'Icon',
  video: 'Video',
  canvas: 'Canvas',
  iframe: 'Embed',
  input: 'Input',
  textarea: 'Text box',
  select: 'Dropdown',
  label: 'Label',
  h1: 'Heading',
  h2: 'Heading',
  h3: 'Heading',
  h4: 'Heading',
  h5: 'Heading',
  h6: 'Heading',
  p: 'Paragraph',
  span: 'Text',
  strong: 'Text',
  em: 'Text',
  small: 'Text',
  nav: 'Nav',
  header: 'Header',
  footer: 'Footer',
  main: 'Main',
  section: 'Section',
  article: 'Article',
  aside: 'Sidebar',
  form: 'Form',
  ul: 'List',
  ol: 'List',
  li: 'List item',
  table: 'Table',
  tr: 'Table row',
  td: 'Table cell',
  th: 'Table cell',
  figure: 'Figure',
  hr: 'Divider',
};

export function describe(el) {
  if (!el || el.nodeType !== 1) return 'Element';
  if (el.hasAttribute && el.hasAttribute('data-pd-group')) return 'New group';
  const tag = el.tagName.toLowerCase();
  let kind = KIND[tag];
  if (!kind) {
    let display = '';
    try {
      display = getComputedStyle(el).display;
    } catch {}
    if (display.includes('flex')) kind = 'Flex box';
    else if (display.includes('grid')) kind = 'Grid';
    else kind = 'Box';
  }
  const label =
    el.getAttribute('aria-label') ||
    el.getAttribute('alt') ||
    el.getAttribute('title') ||
    el.getAttribute('placeholder') ||
    '';
  let text = label.trim();
  if (!text) {
    const raw = (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ');
    text = raw;
  }
  if (text.length > 34) text = text.slice(0, 32).trim() + '…';
  return text ? `${kind} "${text}"` : kind;
}

const UTIL_RE =
  /^-?(m|mx|my|mt|mr|mb|ml|ms|me|p|px|py|pt|pr|pb|pl|ps|pe|w|h|min|max|size|gap|space|text|bg|from|via|to|flex|grid|col|row|items|justify|content|self|place|order|rounded|border|divide|ring|outline|shadow|font|leading|tracking|line|decoration|underline|overflow|z|top|left|right|bottom|inset|translate|scale|rotate|skew|origin|transition|duration|ease|delay|animate|opacity|blur|backdrop|fill|stroke|object|aspect|basis|grow|shrink|cursor|select|pointer|sr|whitespace|break|truncate|list|appearance|columns|float|clear|isolation|mix|filter|drop|invert|sepia|saturate|hue|contrast|brightness|grayscale|accent|caret|scroll|snap|touch|will|tabular|antialiased|uppercase|lowercase|capitalize|italic|not|visible|invisible|collapse|static|fixed|absolute|relative|sticky|block|inline|hidden|contents|table|container|prose|dark|sm|md|lg|xl|2xl|group|peer)(-|$)/;

function nameClasses(el) {
  return [...el.classList].filter(
    (c) => /^[A-Za-z_][\w-]*$/.test(c) && c.length <= 32 && !UTIL_RE.test(c) && !/\d{3,}/.test(c),
  );
}

export function selectorFor(el) {
  if (!el || el.nodeType !== 1) return '';
  const idOk = (id) => id && /^[A-Za-z][\w-]*$/.test(id) && id.length < 40;
  if (idOk(el.id)) return '#' + el.id;
  const parts = [];
  let cur = el;
  while (cur && cur.nodeType === 1 && parts.length < 4 && !isRootish(cur)) {
    if (idOk(cur.id)) {
      parts.unshift('#' + cur.id);
      break;
    }
    let part = cur.tagName.toLowerCase();
    if (cur.hasAttribute('data-pd-group')) part = 'div[data-pd-group]';
    const cls = nameClasses(cur).slice(0, 2);
    if (cls.length) part += '.' + cls.join('.');
    const parent = cur.parentElement;
    if (parent) {
      const same = [...parent.children].filter((s) => s.tagName === cur.tagName);
      if (same.length > 1 && !cls.length) part += `:nth-of-type(${same.indexOf(cur) + 1})`;
    }
    parts.unshift(part);
    cur = cur.parentElement;
  }
  return parts.join(' > ');
}

export function cssPx(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

// Round for display/export: whole px unless clearly fractional.
export function r1(n) {
  return Math.round(n * 10) / 10;
}
export function r0(n) {
  return Math.round(n);
}
