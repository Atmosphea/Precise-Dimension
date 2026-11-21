// "Copy edits as text": a plain-language list of every change, ready to paste to a coding agent.
import { app } from './app.js';
import { allRecs, isEdited } from './edits.js';
import { both, fmt } from './units.js';
import { describe, selectorFor, rectOf, isRootish, deepContains, containsRect, parentOf } from './util.js';
import { flexInfo } from './tools.js';

function dir(n, pos, neg) {
  return `${Math.round(Math.abs(n))}px ${n >= 0 ? pos : neg}`;
}

function ctxFor(el) {
  const c = app.candByEl.get(el);
  if (c) return c;
  const p = el.parentElement;
  if (!p) return { pw: app.vw, ph: app.vh };
  const cs = getComputedStyle(p);
  return {
    pw: p.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) || app.vw,
    ph: p.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) || app.vh,
    fs: parseFloat(getComputedStyle(el).fontSize) || app.rootFS,
  };
}

function flexWords(f) {
  const d = f.dir.startsWith('column') ? 'column (stacked)' : 'row (side by side)';
  const parts = [`flex ${d}`];
  if (f.gap) parts.push(`gap ${Math.round(f.gap)}px`);
  if (f.justify && f.justify !== 'normal' && f.justify !== 'flex-start' && f.justify !== 'start') parts.push(`justify-content ${f.justify}`);
  if (f.align && f.align !== 'normal' && f.align !== 'stretch') parts.push(`align-items ${f.align}`);
  if (f.wrap === 'wrap') parts.push('wraps');
  return parts.join(', ');
}

// Where something pulled out of its box ended up, in words: the box it now sits over, and how
// far from that box's corner (plus where that is on the page).
function spotWords(el, r) {
  const page = `${Math.round(r.x + window.scrollX)}px from the page's left and ${Math.round(r.y + window.scrollY)}px from the page's top`;
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  if (cx < 0 || cy < 0 || cx >= app.vw || cy >= app.vh) return page;
  let under = null;
  try {
    under = document.elementsFromPoint(cx, cy).find((e) => e !== app.host && !deepContains(el, e) && !isRootish(e)) || null;
  } catch {}
  let box = under;
  while (box && !isRootish(box) && !containsRect(rectOf(box), r, 1)) box = parentOf(box);
  if (!box || isRootish(box)) return page;
  const b = rectOf(box);
  return `over ${describe(box)} (\`${selectorFor(box)}\`), ${Math.round(r.x - b.x)}px from its left and ${Math.round(r.y - b.y)}px from its top (${page})`;
}

export function buildEditsText() {
  const lines = [];
  const url = location.origin + location.pathname;
  lines.push(`Precise Dimension edits for ${url}`);
  lines.push(`Viewport ${app.vw} × ${app.vh}px · sizes shown in px${app.state.unit !== 'px' ? ` and ${app.state.unit}` : ''}`);
  lines.push('');

  const recs = allRecs().filter((r) => r.el.isConnected && isEdited(r));
  const groups = recs.filter((r) => r.created);
  const grouped = new Set();
  let n = 0;

  for (const g of groups) {
    const kids = [...g.el.children];
    kids.forEach((k) => grouped.add(k));
    const f = flexInfo(g.el);
    const where = g.el.parentElement && !isRootish(g.el.parentElement) ? ` inside ${describe(g.el.parentElement)} (\`${selectorFor(g.el.parentElement)}\`)` : '';
    n++;
    lines.push(`${n}. New wrapper${where}: ${flexWords(f)}.`);
    lines.push(`   Contains, in order: ${kids.map((k) => describe(k)).join(', ')}.`);
  }

  for (const r of recs) {
    if (r.created) continue;
    const el = r.el;
    const c = ctxFor(el);
    const out = [];
    const now = rectOf(el);
    if (r.collapsed) out.push('remove it (the space it took is closed up)');
    else if (r.deleted) out.push('hide/remove it (its space stays empty for now)');
    else if (r.free) {
      const home = r.home && r.home.isConnected ? r.home : el.parentElement;
      const from = home && !isRootish(home) ? `out of ${describe(home)} (\`${selectorFor(home)}\`)` : 'out of the box it was in';
      out.push(`take it ${from} so the rest close up the gap, and put it ${spotWords(el, now)}`);
      const sizeChanged = Math.abs(now.w - r.orig.w) > 0.5 || Math.abs(now.h - r.orig.h) > 0.5;
      if (sizeChanged) {
        const parts = [];
        if (Math.abs(now.w - r.orig.w) > 0.5) parts.push(`width ${both(r.orig.w, 'w', c)} → ${both(now.w, 'w', c)}`);
        if (Math.abs(now.h - r.orig.h) > 0.5) parts.push(`height ${both(r.orig.h, 'h', c)} → ${both(now.h, 'h', c)}`);
        out.push(parts.join('; '));
      }
    } else {
      const sizeChanged = Math.abs(now.w - r.orig.w) > 0.5 || Math.abs(now.h - r.orig.h) > 0.5;
      if (sizeChanged) {
        const parts = [];
        if (Math.abs(now.w - r.orig.w) > 0.5) parts.push(`width ${both(r.orig.w, 'w', c)} → ${both(now.w, 'w', c)}`);
        if (Math.abs(now.h - r.orig.h) > 0.5) parts.push(`height ${both(r.orig.h, 'h', c)} → ${both(now.h, 'h', c)}`);
        out.push(parts.join('; '));
      }
      const dx = Math.abs(r.tx) > 0.5 ? r.tx : 0;
      const dy = Math.abs(r.ty) > 0.5 ? r.ty : 0;
      if (dx || dy) {
        const mv = [];
        if (dx) mv.push(dir(dx, 'right', 'left'));
        if (dy) mv.push(dir(dy, 'down', 'up'));
        out.push(`move it ${mv.join(' and ')} (keep everything around it where it is)`);
      }
      if (el.parentNode !== r.origParent && !grouped.has(el)) {
        out.push(`move it into ${describe(el.parentElement)} (\`${selectorFor(el.parentElement)}\`)`);
      } else if (el.parentNode === r.origParent && el.nextSibling !== r.origNext && !grouped.has(el)) {
        const prev = el.previousElementSibling;
        out.push(prev ? `place it right after ${describe(prev)}` : 'make it the first item in its container');
      }
      if (Object.keys(r.css).some((p) => /^(display|flex|gap|justify|align)/.test(p))) {
        const f = flexInfo(el);
        const was = [];
        if (r.o.display !== f.display) was.push(`display ${r.o.display} → ${f.display}`);
        if (f.isFlex) {
          if (r.o.flexDirection !== f.dir) was.push(`direction ${r.o.flexDirection} → ${f.dir}`);
          if (r.o.justifyContent !== f.justify) was.push(`justify-content ${r.o.justifyContent} → ${f.justify}`);
          if (r.o.alignItems !== f.align) was.push(`align-items ${r.o.alignItems} → ${f.align}`);
          if (r.o.flexWrap !== f.wrap) was.push(`wrap ${r.o.flexWrap} → ${f.wrap}`);
        }
        if (parseFloat(r.o.gap) !== f.gap) was.push(`gap ${Math.round(parseFloat(r.o.gap) || 0)}px → ${Math.round(f.gap)}px`);
        if (was.length) out.push(`layout: ${was.join(', ')}`);
      }
    }
    if (!out.length) continue;
    n++;
    lines.push(`${n}. ${r.name} (\`${r.selector}\`): ${out.join('; ')}.`);
  }

  const shapes = app.shapes.page;
  if (shapes.length) {
    lines.push('');
    lines.push('Boxes I drew on the page (spots for new or resized things):');
    shapes.forEach((s, i) => {
      const vx = s.x - window.scrollX;
      const vy = s.y - window.scrollY;
      let over = '';
      const cxp = Math.min(Math.max(vx + 1, 0), app.vw - 1);
      const cyp = Math.min(Math.max(vy + 1, 0), app.vh - 1);
      if (vx >= 0 && vy >= 0 && vx < app.vw && vy < app.vh) {
        const stack = document.elementsFromPoint(cxp, cyp).filter((e) => e !== app.host && !isRootish(e));
        if (stack[0]) {
          const pr = rectOf(stack[0]);
          over = ` — top-left corner is inside ${describe(stack[0])} (\`${selectorFor(stack[0])}\`), ${Math.round(vx - pr.x)}px from its left and ${Math.round(vy - pr.y)}px from its top`;
        }
      }
      lines.push(`- Box ${i + 1}: ${fmt(s.w, 'w')} × ${fmt(s.h, 'h')} (${Math.round(s.w)} × ${Math.round(s.h)}px), ${Math.round(s.x)}px from the page's left, ${Math.round(s.y)}px from the page's top${over}.`);
    });
  }

  const canvasShapes = app.shapes.canvas;
  if (canvasShapes.length) {
    lines.push('');
    lines.push(`Layout sketched on the blank canvas (screen ${app.vw} × ${app.vh}px):`);
    canvasShapes
      .slice()
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .forEach((s, i) => {
        lines.push(`- Box ${i + 1}: ${fmt(s.w, 'w')} × ${fmt(s.h, 'h')} (${Math.round(s.w)} × ${Math.round(s.h)}px) at ${fmt(s.x, 'w')} from the left, ${fmt(s.y, 'h')} from the top.`);
      });
  }

  if (n === 0 && !shapes.length && !canvasShapes.length) return null;
  if (n === 0) {
    lines.splice(3, 0, 'No changes to page elements yet.');
  }
  return lines.join('\n');
}
