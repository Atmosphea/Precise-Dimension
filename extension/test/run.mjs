// End-to-end tests: loads the real extension into Chrome, clicks the toolbar icon the way a
// person would, then exercises every feature and saves screenshots to test-output/.
//   node test/run.mjs            all scenarios
//   node test/run.mjs draw       only scenarios whose name contains "draw"
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { serve, launch, pdWorld, sleep, uiRect, clickUI, drag, rectOfPage } from './lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, '../test-output');
const DL = path.join(OUT, 'downloads');
const only = process.argv[2] || '';

if (!only) await fs.rm(OUT, { recursive: true, force: true });
await fs.mkdir(DL, { recursive: true });

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}
const near = (a, b, tol = 1.5) => Math.abs(a - b) <= tol;

const { server, url } = await serve(path.join(here, 'pages'));
const { browser, ext } = await launch(path.join(here, '../build'));
export { ext };

async function setup(target = url, { width = 1280, height = 800, before } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  if (before) await before(page);
  const logs = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
  await page.goto(target, { waitUntil: 'load', timeout: 45000 });
  await page.bringToFront();
  const world = await pdWorld(page);
  await ext.triggerAction(page);
  await sleep(1900);
  // start every scenario from the default settings
  await world.eval(`(() => { const A = __PD__.app; A.state.unit = 'vw/vh'; A.state.fill = 0.08; A.state.guides = true; __PD__.hub.sync(); __PD__.requestFull(); })()`);
  await sleep(100);
  return { page, world, logs };
}

const shot = (page, name) => page.screenshot({ path: path.join(OUT, name + '.png') });
const S = (world, expr) => world.eval(`(() => { const A = __PD__.app; ${expr} })()`);

function ourErrors(world, logs) {
  const ex = world.errors.map((e) => (e.exception && e.exception.description) || e.text);
  const lg = logs.filter((l) => /Precise Dimension|content\.js/.test(l));
  return [...ex, ...lg];
}

// ---------------------------------------------------------------------------------------------

async function measureScenario() {
  const { page, world, logs } = await setup();
  const st = await S(world, `return { open: A.state.open, n: A.cands.length, unit: A.state.unit, mode: A.state.mode };`);
  check('opens on icon click', st.open && st.n > 30, `${st.n} boxes`);
  const bar = await uiRect(page, '.bar.white');
  check('white toolbar visible top-right', bar && bar.x + bar.w > 1200 && bar.y < 30, JSON.stringify(bar));
  await shot(page, 'measure-1-open');

  // hover a button
  const btn = await rectOfPage(page, '.cta .btn');
  await page.mouse.move(btn.x + btn.w / 2, btn.y + btn.h / 2, { steps: 5 });
  await sleep(250);
  const hov = await S(world, `return A.hover && A.hover.el && A.hover.el.textContent.trim();`);
  check('hover picks the element under the mouse', hov === 'Start free', String(hov));
  await shot(page, 'measure-2-hover');

  // units
  const seen = [];
  for (let i = 0; i < 7; i++) {
    await clickUI(page, '.btn.unit');
    await sleep(120);
    seen.push(await S(world, `return A.state.unit;`));
    if (seen[seen.length - 1] === 'px') await shot(page, 'measure-3-px');
    if (seen[seen.length - 1] === 'tw') await shot(page, 'measure-4-tailwind');
  }
  check('unit button cycles all units', seen.join(',') === 'px,%,rem,em,pt,tw,vw/vh', seen.join(','));
  await page.keyboard.press('u');
  await sleep(80);
  check('U key cycles units', (await S(world, `return A.state.unit;`)) === 'px');
  await page.keyboard.down('Shift');
  await page.keyboard.press('U');
  await page.keyboard.up('Shift');
  await sleep(80);
  check('Shift+U goes back', (await S(world, `return A.state.unit;`)) === 'vw/vh');

  // fill slider
  const range = await uiRect(page, '.range');
  await page.mouse.click(range.x + range.w * 0.6, range.cy);
  await sleep(150);
  const fill = await S(world, `return A.state.fill;`);
  check('fill slider changes fill', fill > 0.4 && fill < 0.8, String(fill));
  await page.mouse.move(640, 500);
  await sleep(500);
  await shot(page, 'measure-5-fill60');
  await page.mouse.click(range.x + 1, range.cy);
  await sleep(150);
  check('fill slider goes to off', (await S(world, `return A.state.fill;`)) < 0.06);
  await page.mouse.click(range.x + range.w * 0.12, range.cy);
  await sleep(100);

  // guides toggle
  await clickUI(page, '.bar.white .btn.guides');
  await sleep(200);
  check('guides toggle off', (await S(world, `return A.state.guides;`)) === false);
  await page.mouse.move(640, 500);
  await sleep(400);
  await shot(page, 'measure-6-guides-off');
  await page.keyboard.press('h');
  await sleep(150);
  check('H turns guides back on', (await S(world, `return A.state.guides;`)) === true);

  // scrolling keeps boxes on their elements
  await page.mouse.wheel({ deltaY: 700 });
  await sleep(600);
  const off = await S(world, `
    const out = [];
    for (const c of A.cands) {
      if (c.dup || c.el.closest('header')) continue;
      const r = c.el.getBoundingClientRect();
      out.push(Math.max(Math.abs(r.left - c.x), Math.abs(r.top - c.y), Math.abs(r.width - c.w), Math.abs(r.height - c.h)));
    }
    return Math.max(...out);`);
  check('boxes follow the page while scrolling', off < 1, `max drift ${off}px`);
  await shot(page, 'measure-7-scrolled');

  // nested scroller keeps working in measure mode (page gets the wheel)
  const list = await rectOfPage(page, '.list');
  await page.mouse.move(list.x + 50, list.y + 50);
  await page.mouse.wheel({ deltaY: 120 });
  await sleep(400);
  const lt = await page.evaluate(() => document.querySelector('.list').scrollTop);
  check('nested scroll area scrolls in measure mode', lt > 0, `scrollTop ${lt}`);

  const errs = ourErrors(world, logs);
  check('no errors (measure)', !errs.length, errs.join(' | '));
  await page.close();
}

// ---------------------------------------------------------------------------------------------

async function drawScenario() {
  const { page, world, logs } = await setup();
  await clickUI(page, '.btn.draw');
  await sleep(250);
  check('draw button enters draw mode', (await S(world, `return A.state.mode;`)) === 'draw');
  await drag(page, 120, 120, 420, 330);
  await sleep(200);
  const s1 = await S(world, `const s = A.shapes.page[0]; return s && { x: s.x, y: s.y, w: s.w, h: s.h, n: A.shapes.page.length, vw: A.vw, vh: A.vh };`);
  check('drag draws a box', s1 && s1.n === 1, JSON.stringify(s1));
  if (s1) {
    const ws = await S(world, `return A.state.unit;`);
    check('drawn box was created with the default unit active', ws === 'vw/vh', ws);
  }
  await page.mouse.move(700, 600);
  await sleep(300);
  await shot(page, 'draw-1-box');

  // the box scrolls with the page
  await page.mouse.wheel({ deltaY: 200 });
  await sleep(500);
  const sy = await page.evaluate(() => scrollY);
  await shot(page, 'draw-2-scrolled');
  const sr = await S(world, `const s = A.shapes.page[0]; return { y: s.y - scrollY };`);
  check('drawn box stays on the page when scrolling', s1 && near(sr.y, s1.y - sy), `screen y ${sr.y}, scrollY ${sy}`);
  await page.evaluate(() => scrollTo(0, 0));
  await sleep(300);

  // move it
  await drag(page, 250, 200, 330, 260);
  await sleep(150);
  const s2 = await S(world, `const s = A.shapes.page[0]; return { x: s.x, y: s.y, w: s.w, h: s.h };`);
  check('dragging a box moves it', s1 && Math.abs(s2.x - s1.x - 80) < 8 && Math.abs(s2.y - s1.y - 60) < 8, `moved ${s2.x - s1.x}, ${s2.y - s1.y}`);

  // resize it from its right edge arrow
  const rEdge = { x: s2.x + s2.w, y: s2.y + s2.h / 2 };
  await page.mouse.move(rEdge.x - 30, rEdge.y);
  await sleep(120);
  await page.mouse.move(rEdge.x, rEdge.y, { steps: 3 });
  await sleep(150);
  const hot = await S(world, `return A.hot && A.hot.type + ':' + A.hot.edge;`);
  check('edge arrow is grabbable', hot === 'edge:r', String(hot));
  await drag(page, rEdge.x, rEdge.y, rEdge.x + 100, rEdge.y);
  const s3 = await S(world, `const s = A.shapes.page[0]; return { x: s.x, y: s.y, w: s.w, h: s.h };`);
  check('edge arrow resizes width only', Math.abs(s3.w - s2.w - 100) < 14 && near(s3.h, s2.h) && near(s3.x, s2.x), `w ${s2.w} → ${s3.w}`);
  await shot(page, 'draw-3-resized');

  // second box + marquee + align
  await drag(page, 700, 420, 900, 560);
  await sleep(100);
  await drag(page, 60, 90, 1000, 640, { shift: true });
  await sleep(250);
  const nsel = await S(world, `return A.sel.length;`);
  check('shift-drag selects several boxes', nsel === 2, `${nsel} selected`);
  await shot(page, 'draw-4-two-selected');
  const af = await uiRect(page, '.afloat');
  const afOpen = await page.evaluate(() => document.querySelector('precise-dimension').shadowRoot.querySelector('.afloat').classList.contains('open'));
  check('align strip appears for multiple boxes', afOpen && af && af.w > 100, JSON.stringify(af));
  await clickUI(page, '.afloat .ib:nth-child(5)'); // align tops
  await sleep(200);
  const tops = await S(world, `return A.shapes.page.map(s => s.y);`);
  check('align tops lines boxes up', near(tops[0], tops[1], 0.5), tops.join(','));
  await shot(page, 'draw-5-aligned');

  // undo
  await page.keyboard.down('Meta');
  await page.keyboard.press('z');
  await page.keyboard.up('Meta');
  await sleep(150);
  const tops2 = await S(world, `return A.shapes.page.map(s => s.y);`);
  check('⌘Z undoes the align', !near(tops2[0], tops2[1], 0.5), tops2.join(','));

  // delete
  await page.keyboard.press('Escape');
  await page.mouse.click(800, 490);
  await sleep(120);
  await page.keyboard.press('Delete');
  await sleep(150);
  check('Delete removes the selected box', (await S(world, `return A.shapes.page.length;`)) === 1);

  // type a size
  const chip = await S(world, `const c = A.chips.find(c => c.axis === 'w'); return c && { x: c.x + c.w / 2, y: c.y + c.h / 2 };`);
  await page.mouse.click(chip.x, chip.y);
  await sleep(200);
  const editing = await page.evaluate(() => getComputedStyle(document.querySelector('precise-dimension').shadowRoot.querySelector('.dimedit')).display);
  check('clicking a size label opens a text box', editing === 'block', editing);
  await page.keyboard.down('Meta');
  await page.keyboard.press('a');
  await page.keyboard.up('Meta');
  await page.keyboard.type('25');
  await page.keyboard.press('Enter');
  await sleep(200);
  const w25 = await S(world, `const s = A.shapes.page[0]; return s.w / A.vw * 100;`);
  check('typing 25 sets the width to 25vw', near(w25, 25, 0.01), w25.toFixed(2));

  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await sleep(150);
  check('Esc leaves draw mode', (await S(world, `return A.state.mode;`)) === 'measure');
  const errs = ourErrors(world, logs);
  check('no errors (draw)', !errs.length, errs.join(' | '));
  await page.close();
}

// ---------------------------------------------------------------------------------------------

async function key(page, k, mods = []) {
  for (const m of mods) await page.keyboard.down(m);
  await page.keyboard.press(k);
  for (const m of mods.slice().reverse()) await page.keyboard.up(m);
  await sleep(90);
}

const R = (page) =>
  page.evaluate(() => {
    const q = (s) => {
      const el = typeof s === 'string' ? document.querySelector(s) : s;
      const r = el.getBoundingClientRect();
      return { x: +r.left.toFixed(2), y: +r.top.toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2) };
    };
    const btns = [...document.querySelectorAll('.cta .btn, [data-pd-group] .btn')];
    const a = btns.find((b) => b.textContent.includes('Start'));
    const b = btns.find((b) => b.textContent.includes('Book'));
    return { a: q(a), b: q(b), cta: q('.cta'), p: q('.hero p'), h1: q('.hero h1'), card: q('.art .card'), art: q('.art'), features: q('.features') };
  });

const same = (r1, r2, tol = 0.6) => ['x', 'y', 'w', 'h'].every((k) => Math.abs(r1[k] - r2[k]) <= tol);

async function changeScenario() {
  const { page, world, logs } = await setup();
  await browser.defaultBrowserContext().overridePermissions(new URL(url).origin, ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']);
  await clickUI(page, '.btn.change');
  await sleep(900);
  const st = await S(world, `return { mode: A.state.mode };`);
  const purple = await page.evaluate(() => document.querySelector('precise-dimension').shadowRoot.querySelector('.bar.purple').classList.contains('shown'));
  check('change button turns on change mode', st.mode === 'change');
  check('purple toolbar rolls out', purple);
  await page.mouse.move(640, 760);
  await sleep(300);
  await shot(page, 'change-1-open');

  const o = await R(page);
  // hover shows inward arrows near the cursor
  await page.mouse.move(o.a.x + o.a.w / 2, o.a.y + o.a.h / 2, { steps: 6 });
  await sleep(250);
  const arrows = await S(world, `return A.arrows.length;`);
  check('edge arrows appear near the cursor', arrows >= 4, `${arrows} arrows`);
  await shot(page, 'change-2-hover');

  // click selects
  await page.mouse.click(o.a.x + o.a.w / 2, o.a.y + o.a.h / 2);
  await sleep(200);
  const sel = await S(world, `return A.sel.map(s => s.kind === 'el' ? s.el.textContent.trim() : 'box');`);
  check('click selects the element', sel.length === 1 && sel[0] === 'Start free', JSON.stringify(sel));
  await shot(page, 'change-3-selected');

  // move like Photoshop (⌘ held = no snapping), neighbours stay put
  await drag(page, o.a.x + o.a.w / 2, o.a.y + o.a.h / 2, o.a.x + o.a.w / 2 + 60, o.a.y + o.a.h / 2 + 40, { meta: true });
  await sleep(200);
  let n = await R(page);
  check('drag moves the element', near(n.a.x, o.a.x + 60) && near(n.a.y, o.a.y + 40), `${(n.a.x - o.a.x).toFixed(1)}, ${(n.a.y - o.a.y).toFixed(1)}`);
  check('moving leaves neighbours alone', same(n.b, o.b) && same(n.cta, o.cta) && same(n.p, o.p));
  await shot(page, 'change-4-moved');

  // W A S D resize; neighbours stay put
  for (let i = 0; i < 3; i++) await key(page, 'd');
  for (let i = 0; i < 2; i++) await key(page, 's');
  await sleep(200);
  n = await R(page);
  check('D makes it wider (~5% a press)', n.a.w > o.a.w * 1.12 && n.a.w < o.a.w * 1.2, `${o.a.w} → ${n.a.w}`);
  check('S makes it taller', n.a.h > o.a.h * 1.07 && n.a.h < o.a.h * 1.14, `${o.a.h} → ${n.a.h}`);
  check('resizing leaves neighbours and the container alone', same(n.b, o.b) && same(n.cta, o.cta) && same(n.p, o.p) && same(n.features, o.features), JSON.stringify({ b: n.b, cta: n.cta }));
  for (let i = 0; i < 2; i++) await key(page, 'w');
  for (let i = 0; i < 3; i++) await key(page, 'a');
  n = await R(page);
  check('W and A shrink it back', Math.abs(n.a.w - o.a.w) <= 3 && Math.abs(n.a.h - o.a.h) <= 3, `${n.a.w}×${n.a.h}`);

  // undo everything so far
  for (let i = 0; i < 12; i++) await key(page, 'z', ['Meta']);
  await sleep(200);
  n = await R(page);
  check('⌘Z undoes back to the original', same(n.a, o.a) && same(n.b, o.b), JSON.stringify(n.a));

  // edge arrow on "Book a demo"
  await page.mouse.move(o.b.x + o.b.w - 20, o.b.y + o.b.h / 2, { steps: 4 });
  await sleep(100);
  await page.mouse.move(o.b.x + o.b.w, o.b.y + o.b.h / 2, { steps: 3 });
  await sleep(200);
  const hot = await S(world, `return A.hot && A.hot.type === 'edge' && A.hot.edge + ':' + A.hot.it.el.textContent.trim();`);
  check('right-edge arrow of "Book a demo" is grabbable', hot === 'r:Book a demo', String(hot));
  await drag(page, o.b.x + o.b.w, o.b.y + o.b.h / 2, o.b.x + o.b.w + 52, o.b.y + o.b.h / 2);
  await sleep(200);
  n = await R(page);
  const vwStep = 1280 / 100;
  check('edge drag widens it in whole vw steps', Math.abs(n.b.w - o.b.w - 52) <= vwStep && Math.abs((n.b.w / vwStep) - Math.round(n.b.w / vwStep)) < 0.02, `${o.b.w} → ${n.b.w}`);
  check('edge drag leaves the other button and container alone', same(n.a, o.a) && same(n.cta, o.cta));

  // shift-click both → spacing handle between them
  await page.mouse.click(o.a.x + 10, o.a.y + 10);
  await sleep(120);
  await page.keyboard.down('Shift');
  await page.mouse.click(n.b.x + 10, n.b.y + 10);
  await page.keyboard.up('Shift');
  await sleep(250);
  const sp = await S(world, `return A.sel.length + ':' + (A.spacing ? A.spacing.axis + ':' + A.spacing.gaps.map(g => [Math.round(g.x), Math.round(g.y), Math.round(g.g)].join('/')).join(',') : 'none');`);
  check('shift-click selects both and shows a spacing handle', /^2:x:/.test(sp), sp);
  await shot(page, 'change-5-two-selected');
  const g = await S(world, `const g = A.spacing.gaps[0]; return { x: g.x, y: g.y, g: g.g };`);
  await page.mouse.move(g.x, g.y, { steps: 3 });
  await sleep(150);
  await drag(page, g.x, g.y, g.x + 30, g.y, { meta: true });
  await sleep(200);
  n = await R(page);
  const gap = n.b.x - (n.a.x + n.a.w);
  check('dragging the spacing handle widens the gap', Math.abs(gap - (g.g + 30)) <= 1.5, `gap ${g.g.toFixed(1)} → ${gap.toFixed(1)}`);

  // copy edits as text
  await clickUI(page, '.bar.purple .btn.text');
  await sleep(400);
  const text = await page.evaluate(() => navigator.clipboard.readText()).catch((e) => 'ERR ' + e.message);
  check('copy edits as text puts a description on the clipboard', /Book a demo/.test(text) && /width/.test(text) && /move it/.test(text), text.slice(0, 400));
  await fs.writeFile(path.join(OUT, 'change-edits.txt'), text);

  // group into a flex box
  await key(page, 'g', ['Meta']);
  await sleep(700);
  const grp = await page.evaluate(() => {
    const g = document.querySelector('[data-pd-group]');
    return g && { kids: [...g.children].map((k) => k.textContent.trim()), display: getComputedStyle(g).display, dir: getComputedStyle(g).flexDirection, gap: getComputedStyle(g).columnGap };
  });
  check('⌘G groups them into a flex box', grp && grp.display === 'flex' && grp.kids.length === 2, JSON.stringify(grp));
  const panelOpen = await page.evaluate(() => document.querySelector('precise-dimension').shadowRoot.querySelector('.panel').classList.contains('open'));
  check('flex controls appear for the new group', panelOpen);
  await page.mouse.move(640, 760);
  await sleep(300);
  await shot(page, 'change-6-grouped');
  await clickUI(page, '.panel .row:nth-of-type(2) .ib:nth-of-type(2)'); // stacked (column)
  await sleep(800);
  n = await R(page);
  check('flex panel switches the group to a column', n.b.y > n.a.y + n.a.h - 1 && Math.abs(n.b.x - n.a.x) < 2, JSON.stringify({ a: n.a, b: n.b }));
  await shot(page, 'change-7-column');
  for (let i = 0; i < 2; i++) await key(page, 'z', ['Meta']);
  await sleep(300);
  const ungrouped = await page.evaluate(() => !document.querySelector('[data-pd-group]') && document.querySelectorAll('.cta > .btn').length === 2);
  check('undo removes the group again', ungrouped);

  // reset everything
  await clickUI(page, '.split.undo .half.r', { hoverFirst: '.split.undo' });
  await sleep(800);
  n = await R(page);
  check('reset all puts the page back exactly', same(n.a, o.a) && same(n.b, o.b) && same(n.cta, o.cta), JSON.stringify({ a: n.a, b: n.b }));

  // pulse reflow: drag "Book a demo" to the left of "Start free"
  await key(page, 'Escape');
  await page.mouse.click(o.b.x + o.b.w / 2, o.b.y + o.b.h / 2);
  await sleep(150);
  await drag(page, o.b.x + o.b.w / 2, o.b.y + o.b.h / 2, o.a.x + 10, o.b.y + o.b.h / 2, { meta: true });
  await sleep(150);
  await clickUI(page, '.split.reflow .half.l', { hoverFirst: '.split.reflow' });
  await sleep(150);
  await shot(page, 'change-8-reflow-pulse');
  await sleep(900);
  const order = await page.evaluate(() => [...document.querySelector('.cta').children].map((c) => c.textContent.trim()));
  n = await R(page);
  check('pulse reflow reorders by where things were dropped', order.join('|') === 'Book a demo|Start free', order.join('|'));
  check('after reflow the buttons sit in real layout (no offsets)', near(n.b.x, o.a.x, 1) && n.a.x > n.b.x + n.b.w, JSON.stringify({ a: n.a, b: n.b }));
  await shot(page, 'change-9-reflowed');

  // magic fix: nudge a button slightly off, then tidy
  await page.mouse.click(n.a.x + n.a.w / 2, n.a.y + n.a.h / 2);
  await sleep(120);
  await drag(page, n.a.x + n.a.w / 2, n.a.y + n.a.h / 2, n.a.x + n.a.w / 2 + 3, n.a.y + n.a.h / 2 + 7, { meta: true });
  const before = await R(page);
  await clickUI(page, '.split.reflow .half.r', { hoverFirst: '.split.reflow' });
  await sleep(900);
  const after = await R(page);
  check('magic fix lines it back up', Math.abs(after.a.y - after.b.y) < 0.6 && Math.abs(before.a.y - before.b.y) > 5, `before Δy ${(before.a.y - before.b.y).toFixed(1)}, after Δy ${(after.a.y - after.b.y).toFixed(1)}`);

  // delete hides but keeps the space
  await key(page, 'Escape');
  await page.mouse.click(o.card.x + o.card.w / 2, o.card.y + o.card.h / 2);
  await sleep(120);
  const what = await S(world, `return A.sel[0] && A.sel[0].el.className;`);
  await key(page, 'Delete');
  await sleep(200);
  const vis = await page.evaluate(() => getComputedStyle(document.querySelector('.art .card')).visibility);
  n = await R(page);
  check('Delete hides the element and keeps its space', what === 'card' && vis === 'hidden' && same(n.art, o.art), `${what} ${vis}`);
  await clickUI(page, '.split.undo .half.r', { hoverFirst: '.split.undo' });
  await sleep(800);
  const order2 = await page.evaluate(() => [...document.querySelector('.cta').children].map((c) => c.textContent.trim()).join('|'));
  n = await R(page);
  const vis2 = await page.evaluate(() => getComputedStyle(document.querySelector('.art .card')).visibility);
  check('reset all also undoes reflow, fixes and deletes', order2 === 'Start free|Book a demo' && same(n.a, o.a) && same(n.b, o.b) && vis2 === 'visible', `${order2} ${vis2}`);
  const leftover = await page.evaluate(() => [...document.querySelectorAll('[style]')].map((e) => e.tagName + '.' + e.className + ':' + e.getAttribute('style')).filter((s) => !s.startsWith('PRECISE-DIMENSION')));
  check('reset leaves no inline styles behind', leftover.length === 0, leftover.join(' ; '));

  // several at once: D widens both, arrow keys nudge both
  check('still in change mode', (await S(world, `return A.state.mode;`)) === 'change');
  await page.mouse.click(o.a.x + 10, o.a.y + 10);
  await sleep(120);
  await page.keyboard.down('Shift');
  await page.mouse.click(o.b.x + 10, o.b.y + 10);
  await page.keyboard.up('Shift');
  await sleep(200);
  await key(page, 'd');
  await key(page, 'd');
  await sleep(150);
  n = await R(page);
  check('D widens every selected item', near(n.a.w, o.a.w * 1.1025, 2) && near(n.b.w, o.b.w * 1.1025, 2) && same(n.cta, o.cta), `${o.a.w}→${n.a.w}, ${o.b.w}→${n.b.w}`);
  await key(page, 'ArrowRight');
  await key(page, 'ArrowRight');
  await key(page, 'ArrowDown', ['Shift']);
  await sleep(150);
  const m = await R(page);
  check('arrow keys nudge (Shift = 10px)', near(m.a.x - n.a.x, 2, 0.6) && near(m.b.x - n.b.x, 2, 0.6) && near(m.a.y - n.a.y, 10, 0.6), `Δx ${(m.a.x - n.a.x).toFixed(1)} Δy ${(m.a.y - n.a.y).toFixed(1)}`);
  for (let i = 0; i < 5; i++) await key(page, 'z', ['Meta']);
  await sleep(200);
  n = await R(page);
  check('undo puts both back', same(n.a, o.a) && same(n.b, o.b), JSON.stringify({ a: n.a, b: n.b }));

  for (let i = 0; i < 3 && (await S(world, `return A.state.mode;`)) !== 'measure'; i++) await key(page, 'Escape');
  await sleep(500);
  const purple2 = await page.evaluate(() => document.querySelector('precise-dimension').shadowRoot.querySelector('.bar.purple').classList.contains('shown'));
  check('Esc leaves change mode and the purple bar rolls away', (await S(world, `return A.state.mode;`)) === 'measure' && !purple2);
  const errs = ourErrors(world, logs);
  check('no errors (change)', !errs.length, errs.join(' | '));
  await page.close();
}

// ---------------------------------------------------------------------------------------------

async function canvasScenario() {
  const { page, world, logs } = await setup();
  await clickUI(page, '.btn.canvas');
  await sleep(900);
  const st = await S(world, `return { canvas: A.state.canvasMode, mode: A.state.mode };`);
  check('canvas button opens the blank canvas', st.canvas && st.mode === 'draw', JSON.stringify(st));
  await page.mouse.move(640, 700);
  await shot(page, 'canvas-1-blank');
  const boxes = [
    [90, 140, 330, 300],
    [470, 170, 600, 330],
    [760, 120, 1010, 270],
  ];
  for (const [x1, y1, x2, y2] of boxes) await drag(page, x1, y1, x2, y2);
  await sleep(150);
  const sh = await S(world, `return A.shapes.canvas.map(s => ({ x: s.x, y: s.y, w: s.w, h: s.h, wv: s.w / A.vw * 100, hv: s.h / A.vh * 100 }));`);
  check('three boxes drawn on the canvas', sh.length === 3, sh.map((s) => `${s.wv.toFixed(2)}vw×${s.hv.toFixed(2)}vh`).join(', '));
  check('canvas boxes snap to whole vw/vh', sh.every((s) => near(s.wv, Math.round(s.wv), 0.02) && near(s.hv, Math.round(s.hv), 0.02)));
  check('page boxes are kept separate from canvas boxes', (await S(world, `return A.shapes.page.length;`)) === 0);
  // double-click-drag on empty space selects
  await page.mouse.click(60, 600);
  await sleep(60);
  await drag(page, 60, 600, 1100, 100);
  await sleep(250);
  check('double-click-drag selects the boxes', (await S(world, `return A.sel.length;`)) === 3);
  await shot(page, 'canvas-2-selected');
  await clickUI(page, '.afloat .ib:nth-child(5)'); // align tops
  await sleep(150);
  await clickUI(page, '.afloat .ib:nth-child(9)'); // even spacing across
  await sleep(250);
  const sh2 = await S(world, `return A.shapes.canvas.slice().sort((a, b) => a.x - b.x).map(s => ({ x: s.x, y: s.y, w: s.w }));`);
  const g1 = sh2[1].x - (sh2[0].x + sh2[0].w);
  const g2 = sh2[2].x - (sh2[1].x + sh2[1].w);
  check('align tops + even spacing on the canvas', near(sh2[0].y, sh2[1].y, 0.5) && near(sh2[1].y, sh2[2].y, 0.5) && near(g1, g2, 0.6), `gaps ${g1.toFixed(1)} / ${g2.toFixed(1)}`);
  await page.mouse.move(640, 700);
  await sleep(200);
  await shot(page, 'canvas-3-aligned');
  await key(page, 'Escape');
  await key(page, 'Escape');
  await sleep(700);
  const st2 = await S(world, `return { canvas: A.state.canvasMode, mode: A.state.mode, n: A.shapes.canvas.length };`);
  check('Esc leaves the canvas (boxes are kept for next time)', !st2.canvas && st2.mode === 'measure' && st2.n === 3, JSON.stringify(st2));
  await shot(page, 'canvas-4-left');
  await clickUI(page, '.btn.canvas');
  await sleep(800);
  check('reopening the canvas shows the same boxes', (await S(world, `return A.state.canvasMode && A.shapes.canvas.length;`)) === 3);
  const errs = ourErrors(world, logs);
  check('no errors (canvas)', !errs.length, errs.join(' | '));
  await page.close();
}

// ---------------------------------------------------------------------------------------------

function pngSize(buf) {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

async function readClipboardImage(page) {
  return page.evaluate(async () => {
    const items = await navigator.clipboard.read();
    for (const it of items) {
      if (it.types.includes('image/png')) {
        const blob = await it.getType('image/png');
        const bmp = await createImageBitmap(blob);
        const buf = new Uint8Array(await blob.arrayBuffer());
        let bin = '';
        for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
        return { w: bmp.width, h: bmp.height, b64: btoa(bin) };
      }
    }
    return { types: items.map((i) => i.types.join(',')) };
  });
}

async function waitForFile(dir, before, ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.png') && !before.includes(f));
    if (files.length) {
      await sleep(300);
      return files[0];
    }
    await sleep(200);
  }
  return null;
}

async function captureScenario() {
  const { page, world, logs } = await setup();
  const origin = new URL(url).origin;
  await browser.defaultBrowserContext().overridePermissions(origin, ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']);
  const cdp = await browser.target().createCDPSession();
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL, eventsEnabled: true });
  await page.evaluate(() => navigator.clipboard.writeText('nothing yet'));

  // draw a box so the screenshot has a drawing in it
  await clickUI(page, '.btn.draw');
  await drag(page, 120, 470, 520, 520);
  await key(page, 'Escape');
  await key(page, 'Escape');
  await sleep(300);

  // visible area → clipboard
  await clickUI(page, '.split.shot .half.l', { hoverFirst: '.split.shot' });
  let ok = false;
  for (let i = 0; i < 30 && !ok; i++) {
    await sleep(200);
    ok = await page.evaluate(() => document.querySelector('precise-dimension').shadowRoot.querySelector('.split.shot').classList.contains('ok'));
  }
  check('copy screenshot shows a check mark', ok);
  await shot(page, 'capture-1-check');
  const img = await readClipboardImage(page);
  check('screenshot is on the clipboard at screen size', img.w === 1280 && img.h === 800, JSON.stringify({ w: img.w, h: img.h, types: img.types }));
  if (img.b64) await fs.writeFile(path.join(OUT, 'capture-2-clipboard-visible.png'), Buffer.from(img.b64, 'base64'));

  // visible area → download
  let before = await fs.readdir(DL);
  await clickUI(page, '.split.shot .half.r', { hoverFirst: '.split.shot' });
  let f = await waitForFile(DL, before);
  const sz = f && pngSize(await fs.readFile(path.join(DL, f)));
  check('download screenshot saves a PNG', !!sz && sz.w === 1280 && sz.h === 800, `${f} ${JSON.stringify(sz)}`);

  // full page → clipboard
  await sleep(700);
  const docH = await page.evaluate(() => document.documentElement.scrollHeight);
  await clickUI(page, '.split.full .half.l', { hoverFirst: '.split.full' });
  ok = false;
  for (let i = 0; i < 60 && !ok; i++) {
    await sleep(250);
    ok = await page.evaluate(() => document.querySelector('precise-dimension').shadowRoot.querySelector('.split.full').classList.contains('ok'));
  }
  check('full-page copy shows a check mark', ok);
  const full = await readClipboardImage(page);
  check('full-page screenshot covers the whole page', full.w === 1280 && Math.abs(full.h - docH) <= 2, `${full.w}×${full.h} (page ${docH})`);
  if (full.b64) await fs.writeFile(path.join(OUT, 'capture-3-clipboard-full.png'), Buffer.from(full.b64, 'base64'));
  const sy = await page.evaluate(() => scrollY);
  check('page scroll is put back after the full-page shot', sy === 0, `scrollY ${sy}`);

  // full page → download
  before = await fs.readdir(DL);
  await sleep(700);
  await clickUI(page, '.split.full .half.r', { hoverFirst: '.split.full' });
  f = await waitForFile(DL, before, 25000);
  const sz2 = f && pngSize(await fs.readFile(path.join(DL, f)));
  check('download full page saves a tall PNG', !!sz2 && Math.abs(sz2.h - docH) <= 2, `${f} ${JSON.stringify(sz2)}`);

  // guides off → screenshot has no guides but keeps the drawing
  await key(page, 'h');
  await sleep(300);
  await clickUI(page, '.split.shot .half.l', { hoverFirst: '.split.shot' });
  await sleep(1500);
  const plain = await readClipboardImage(page);
  if (plain.b64) await fs.writeFile(path.join(OUT, 'capture-4-guides-off.png'), Buffer.from(plain.b64, 'base64'));
  check('screenshot with guides off works', plain.w === 1280);
  await key(page, 'h');
  const errs = ourErrors(world, logs);
  check('no errors (capture)', !errs.length, errs.join(' | '));
  await page.close();
}

// ---------------------------------------------------------------------------------------------

async function lifecycleScenario() {
  const { page, world, logs } = await setup();
  await clickUI(page, '.btn.draw');
  await drag(page, 200, 200, 400, 300);
  await key(page, 'Escape');
  await ext.triggerAction(page);
  await sleep(700);
  check('clicking the icon again turns it off', !(await page.evaluate(() => !!document.querySelector('precise-dimension'))));
  await ext.triggerAction(page);
  await sleep(400);
  await shot(page, 'life-1-reopen-cascade');
  await sleep(1500);
  const st = await S(world, `return { open: A.state.open, boxes: A.shapes.page.length, mode: A.state.mode };`);
  check('clicking it again turns it back on, keeping your boxes', st.open && st.boxes === 1 && st.mode === 'measure', JSON.stringify(st));
  await key(page, 'Escape');
  await sleep(700);
  check('Esc closes it when nothing else is going on', !(await page.evaluate(() => !!document.querySelector('precise-dimension'))));

  // pretend the page still runs an older copy (as after updating the extension)
  await ext.triggerAction(page);
  await sleep(1200);
  const real = await S(world, `return __PD__.build;`);
  await S(world, `__PD__.build = 'old-copy'; return 1;`);
  await ext.triggerAction(page);
  await sleep(1500);
  const after = await S(world, `return { build: __PD__.build, open: __PD__.app.state.open, hosts: document.querySelectorAll('precise-dimension').length, n: __PD__.app.cands.length };`);
  check('a newer copy replaces an older one cleanly', after.build === real && after.open && after.hosts === 1 && after.n > 30, JSON.stringify(after));
  const errs = ourErrors(world, logs);
  check('no errors (lifecycle)', !errs.length, errs.join(' | '));
  await page.close();
}

// ---------------------------------------------------------------------------------------------
// Real websites (needs internet; run with `node test/run.mjs sites`).

const SITES = [
  ['example', 'https://example.com/'],
  ['wikipedia', 'https://en.wikipedia.org/wiki/Ruler'],
  ['github', 'https://github.com/'],
  ['hackernews', 'https://news.ycombinator.com/'],
  ['tailwind', 'https://tailwindcss.com/'],
  ['mdn', 'https://developer.mozilla.org/en-US/docs/Web/CSS/flex'],
];

async function sitesScenario() {
  for (const [name, target] of SITES) {
    console.log(`  -- ${name}`);
    let page;
    try {
      const r = await setup(target, {
        before: (pg) =>
          pg.evaluateOnNewDocument(() => {
            window.__csp = [];
            document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI || ''} ${e.sourceFile || ''}:${e.lineNumber || ''}`));
          }),
      });
      page = r.page;
      const { world, logs } = r;
      await sleep(800);
      const st = await S(world, `return { open: A.state.open, n: A.cands.length, ms: Math.round(A.collectMs || 0), host: !!document.querySelector('precise-dimension') };`);
      check(`${name}: opens and measures`, st.open && st.host && st.n > 3, `${st.n} boxes in ${st.ms} ms`);
      await shot(page, `site-${name}-1-open`);
      await page.mouse.move(640, 430, { steps: 4 });
      await sleep(300);
      const hov = await S(world, `return A.hover ? (A.hover.el ? A.hover.el.tagName.toLowerCase() : 'box') : null;`);
      await shot(page, `site-${name}-2-hover`);

      // far down the page there should still be boxes (big pages are scanned around the screen)
      const H = await page.evaluate(() => document.documentElement.scrollHeight);
      if (H > 4000) {
        await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight * 0.8, behavior: 'instant' }));
        await sleep(900);
        const low = await S(world, `return A.cands.filter(c => !c.dup && c.y < A.vh && c.y + c.h > 0 && c.h < A.vh).length;`);
        check(`${name}: boxes still measured 80% down the page`, low > 5, `${low} boxes on screen`);
        await shot(page, `site-${name}-1b-scrolled`);
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
        await sleep(700);
      }

      // change mode: pick the thing in the middle and drag it
      await clickUI(page, '.btn.change');
      await sleep(700);
      await page.mouse.click(640, 430);
      await sleep(200);
      const before = await S(world, `const s = A.sel[0]; if (!s || !s.el) return null; const r = s.el.getBoundingClientRect(); return { tag: s.el.tagName.toLowerCase(), x: r.left, y: r.top, w: r.width, h: r.height };`);
      if (before) {
        // grab it somewhere inside (away from any resize handle), like a person would
        const vis = { x: Math.max(0, before.x), y: Math.max(0, before.y) };
        vis.w = Math.min(1280, before.x + before.w) - vis.x;
        vis.h = Math.min(800, before.y + before.h) - vis.y;
        let gx = 640;
        let gy = 430;
        for (const [fx, fy] of [[0.5, 0.5], [0.35, 0.4], [0.65, 0.4], [0.35, 0.65], [0.65, 0.65], [0.2, 0.5], [0.8, 0.5], [0.5, 0.2], [0.5, 0.8]]) {
          const px = vis.x + vis.w * fx;
          const py = vis.y + vis.h * fy;
          await page.mouse.move(px, py, { steps: 2 });
          await sleep(90);
          if (!(await S(world, `return A.hot ? A.hot.type : null;`))) {
            gx = px;
            gy = py;
            break;
          }
        }
        await drag(page, gx, gy, gx + 40, gy + 30, { meta: true });
        await sleep(250);
        const after = await S(world, `const r = A.sel[0].el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height };`);
        check(`${name}: drag moves the clicked ${before.tag}`, near(after.x - before.x, 40, 1) && near(after.y - before.y, 30, 1) && near(after.w, before.w, 1), `Δ ${(after.x - before.x).toFixed(1)}, ${(after.y - before.y).toFixed(1)}`);
        await shot(page, `site-${name}-3-moved`);
        await key(page, 'z', ['Meta']);
        await sleep(250);
        const back = await S(world, `const r = A.sel[0] ? A.sel[0].el.getBoundingClientRect() : null; return r && { x: r.left, y: r.top };`);
        check(`${name}: undo puts it back`, back && near(back.x, before.x, 1) && near(back.y, before.y, 1));
      } else {
        check(`${name}: click in change mode selects something`, false, `hover was ${hov}`);
      }
      for (let i = 0; i < 3 && (await S(world, `return A.state.mode;`)) !== 'measure'; i++) await key(page, 'Escape');

      // screenshot to clipboard
      await browser.defaultBrowserContext().overridePermissions(new URL(page.url()).origin, ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']);
      await clickUI(page, '.split.shot .half.l', { hoverFirst: '.split.shot' });
      let ok = false;
      for (let i = 0; i < 30 && !ok; i++) {
        await sleep(200);
        ok = await page.evaluate(() => document.querySelector('precise-dimension').shadowRoot.querySelector('.split.shot').classList.contains('ok'));
      }
      const img = ok ? await readClipboardImage(page).catch((e) => ({ err: e.message })) : {};
      check(`${name}: screenshot copies`, ok && img.w === 1280 && img.h === 800, JSON.stringify({ ok, w: img.w, h: img.h, err: img.err }));
      if (name === 'wikipedia') {
        const cdp = await browser.target().createCDPSession();
        await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL, eventsEnabled: true });
        const docH = await page.evaluate(() => document.documentElement.scrollHeight);
        const was = await fs.readdir(DL);
        const t0 = Date.now();
        await sleep(600);
        await clickUI(page, '.split.full .half.r', { hoverFirst: '.split.full' });
        const f = await waitForFile(DL, was, 90000);
        const sz = f && pngSize(await fs.readFile(path.join(DL, f)));
        check(`${name}: full-page download of a long page`, !!sz && sz.w > 0 && Math.abs(sz.h - Math.min(docH, 32000)) <= 3, `${JSON.stringify(sz)} page ${docH}px, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
      }
      await key(page, 'Escape');
      await key(page, 'Escape');
      await sleep(600);
      const gone = await page.evaluate(() => !document.querySelector('precise-dimension'));
      check(`${name}: closes cleanly`, gone);
      const csp = await page.evaluate(() => window.__csp || []);
      const ours = csp.filter((c) => /chrome-extension:/.test(c));
      const errs = ourErrors(world, logs);
      check(`${name}: no errors`, !errs.length && !ours.length, [...errs, ...ours].join(' | '));
      if (csp.length) console.log(`     (page's own CSP reports: ${csp.length})`);
    } catch (err) {
      check(`${name}: scenario crashed`, false, err.stack || String(err));
      if (page) await shot(page, `site-${name}-crash`).catch(() => {});
    }
    if (page) await page.close().catch(() => {});
  }
}

// ---------------------------------------------------------------------------------------------
// A plain http:// page that isn't localhost: the browser hides the modern clipboard there.

async function insecureScenario() {
  const target = url.replace('127.0.0.1', 'insecure.test');
  const { page, world, logs } = await setup(target);
  const secure = await page.evaluate(() => window.isSecureContext);
  check('test page counts as not secure', secure === false);
  const cdp = await browser.target().createCDPSession();
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL, eventsEnabled: true });
  const was = await fs.readdir(DL);
  await clickUI(page, '.split.shot .half.l', { hoverFirst: '.split.shot' });
  const f = await waitForFile(DL, was, 15000);
  const ok = await page.evaluate(() => document.querySelector('precise-dimension').shadowRoot.querySelector('.split.shot').classList.contains('ok'));
  check('copy screenshot falls back to a download', !!f && ok, String(f));
  await shot(page, 'insecure-1-fallback');

  // move something, then copy the edits as text with the older copy method
  await clickUI(page, '.btn.change');
  await sleep(700);
  const b = await rectOfPage(page, '.cta .btn.ghost');
  await page.mouse.click(b.x + b.w / 2, b.y + b.h / 2);
  await sleep(150);
  await drag(page, b.x + b.w / 2, b.y + b.h / 2, b.x + b.w / 2 + 50, b.y + b.h / 2, { meta: true });
  await sleep(150);
  await clickUI(page, '.bar.purple .btn.text');
  await sleep(500);
  const reader = await browser.newPage();
  await reader.goto(url);
  await browser.defaultBrowserContext().overridePermissions(new URL(url).origin, ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']);
  const text = await reader.evaluate(() => navigator.clipboard.readText()).catch((e) => 'ERR ' + e.message);
  await reader.close();
  check('copy edits as text still works there', /Book a demo/.test(text) && /50px right/.test(text), text.slice(0, 200));
  const errs = ourErrors(world, logs);
  check('no errors (insecure page)', !errs.length, errs.join(' | '));
  await page.close();
}

const scenarios = { measure: measureScenario, draw: drawScenario, change: changeScenario, canvas: canvasScenario, capture: captureScenario, lifecycle: lifecycleScenario, insecure: insecureScenario, sites: sitesScenario };
export { scenarios, setup, S, shot, check, near, ourErrors, browser, url, OUT, DL };

for (const [name, fn] of Object.entries(scenarios)) {
  if (only ? !name.includes(only) : name === 'sites') continue;
  console.log(`\n== ${name}`);
  try {
    await fn();
  } catch (err) {
    check(`${name} scenario crashed`, false, err.stack || String(err));
  }
}

await browser.close();
server.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
