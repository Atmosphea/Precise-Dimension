// "Everything like this one": the elements that share a thing's tag and classes, used by
// Ctrl+Shift-click in change mode (for example every card in a grid, or every link in a menu).
import { app } from './app.js';
import { nameClasses, deepContains, isOurs } from './util.js';

const MAX = 400;
let cache = null;

function classesOf(el) {
  return el.classList ? [...el.classList] : [];
}

function sigOf(el) {
  if (!el) return '';
  return el.tagName + '.' + classesOf(el).sort().join('.');
}

function jaccard(a, b) {
  if (!a.length && !b.length) return 1;
  const B = new Set(b);
  let both = 0;
  for (const c of a) if (B.has(c)) both++;
  return both / (a.length + b.length - both);
}

function visible(el) {
  if (!el.isConnected || el === app.host || isOurs(el)) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return false;
  try {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility !== 'visible') return false;
  } catch {
    return false;
  }
  return true;
}

// A rule for "looks like the same kind of thing as el".
function matcher(el) {
  const mine = classesOf(el);
  const named = nameClasses(el);
  if (named.length) {
    // Hand-named classes (card, btn, nav-link): anything that has all of them. State classes
    // like "active" on the clicked one are left out on purpose, so they don't block a match.
    const want = named.filter((c) => !/^(is-|has-)?(active|selected|current|open|show|hover|focus|disabled|checked)$/.test(c));
    const need = want.length ? want : named;
    return (o) => {
      const cl = o.classList;
      for (const c of need) if (!cl.contains(c)) return false;
      return true;
    };
  }
  if (mine.length) {
    // Utility classes only (Tailwind and the like): mostly the same list.
    return (o) => jaccard(mine, classesOf(o)) >= 0.7;
  }
  // No classes at all: same tag inside the same kind of parent (every <li> of a menu).
  const ps = sigOf(el.parentElement);
  return (o) => !o.classList.length && sigOf(o.parentElement) === ps;
}

export function alikeOf(el) {
  if (!el || el.nodeType !== 1) return [];
  const root = el.getRootNode ? el.getRootNode() : document;
  const tag = el.tagName;
  const match = matcher(el);
  let pool;
  try {
    pool = (root.querySelectorAll ? root : document).querySelectorAll(tag.toLowerCase());
  } catch {
    pool = [el];
  }
  const found = [];
  for (const o of pool) {
    if (o.tagName !== tag) continue;
    if (o !== el && !match(o)) continue;
    if (!visible(o)) continue;
    found.push(o);
    if (found.length >= MAX * 2) break;
  }
  if (!found.includes(el)) found.unshift(el);
  // keep the outermost ones (a card inside a card would move twice)
  const out = found.filter((o) => !found.some((p) => p !== o && deepContains(p, o)));
  // top-to-bottom, left-to-right, like reading the page
  out.sort((a, b) => {
    const ra = a.getBoundingClientRect();
    const rb = b.getBoundingClientRect();
    return ra.top - rb.top || ra.left - rb.left;
  });
  return out.slice(0, MAX);
}

// Same answer for the same element until the page is measured again (it's used every frame
// while Ctrl+Shift is held).
export function alikeCached(el) {
  if (cache && cache.el === el && cache.at === app.lastCollect) return cache.list;
  cache = { el, at: app.lastCollect, list: alikeOf(el) };
  return cache.list;
}

// How to name the group in a message: ".card", "a.nav-link", "li in ul.menu".
export function alikeLabel(el) {
  const tag = el.tagName.toLowerCase();
  const named = nameClasses(el);
  if (named.length) return '.' + named.slice(0, 2).join('.');
  if (el.classList.length) return tag + ' with the same classes';
  const p = el.parentElement;
  if (p) {
    const pn = nameClasses(p);
    return `${tag} in ${p.tagName.toLowerCase()}${pn.length ? '.' + pn[0] : ''}`;
  }
  return tag;
}
