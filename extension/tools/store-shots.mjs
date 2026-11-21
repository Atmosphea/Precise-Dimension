// Makes the extension store pictures: five 1280×800 screenshots and the 440×280 promo tile.
// Run: node tools/store-shots.mjs (after node build.mjs). Pictures land in extension/store.
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { serve, launch, sleep, pdWorld, clickUI, drag, rectOfPage, uiRect } from '../test/lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, '../store');
await fs.mkdir(OUT, { recursive: true });
const { server, url } = await serve(path.join(here, '../test/pages'));
const { browser, ext } = await launch(path.join(here, '../build'));
const shot = (page, name) => page.screenshot({ path: path.join(OUT, name) });
// Esc steps back one thing at a time; stop once back in plain measuring (one more would turn it off)
async function backToMeasure(world, page) {
  for (let i = 0; i < 4; i++) {
    const st = await world.eval(`(() => { const s = __PD__.app.state; return { mode: s.mode, canvas: s.canvasMode, sel: __PD__.app.sel.length }; })()`);
    if (st.mode === 'measure' && !st.canvas && !st.sel) return;
    await page.keyboard.press('Escape');
    await sleep(350);
  }
}

const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
await page.goto(url, { waitUntil: 'load' });
await page.bringToFront();
const world = await pdWorld(page);
await ext.triggerAction(page);
await sleep(2300);
await world.eval(`(() => { const A = __PD__.app; A.state.unit = 'vw/vh'; A.state.fill = 0.08; A.state.guides = true; A.state.detail = 'all'; __PD__.hub.sync(); __PD__.requestFull(); })()`);
await sleep(200);

// 1. every box measured, one hovered
const start = await page.evaluate(() => {
  const r = [...document.querySelectorAll('.cta .btn')][0].getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
await page.mouse.move(start.x, start.y, { steps: 6 });
await sleep(500);
await shot(page, 'screenshot-1-measure.png');

// 2. change mode: one thing picked, another hovered
await clickUI(page, '.btn.change');
await sleep(1000);
const card = await rectOfPage(page, '.art .card');
await page.mouse.click(card.x + card.w / 2, card.y + card.h / 2);
await sleep(250);
await page.mouse.move(start.x, start.y, { steps: 8 });
await sleep(500);
await shot(page, 'screenshot-2-change.png');

// 3. Alt+Shift held over a feature card: every card like it lights up
await page.keyboard.press('Escape');
await sleep(200);
const feat = await rectOfPage(page, '.feature');
await page.mouse.move(feat.x + feat.w * 0.75, feat.y + feat.h * 0.3, { steps: 6 });
await sleep(200);
await page.keyboard.down('Alt');
await page.keyboard.down('Shift');
await page.mouse.move(feat.x + feat.w * 0.75 + 2, feat.y + feat.h * 0.3 + 1, { steps: 2 });
await sleep(500);
await shot(page, 'screenshot-3-alike.png');
await page.keyboard.up('Shift');
await page.keyboard.up('Alt');
await backToMeasure(world, page);
await sleep(600);

// 4. sketching a layout on the blank canvas
await clickUI(page, '.btn.canvas');
await sleep(1000);
const boxes = [
  [64, 96, 1216, 160],
  [64, 192, 320, 736],
  [352, 192, 1216, 448],
  [352, 480, 628, 736],
  [646, 480, 922, 736],
  [940, 480, 1216, 736],
];
for (const [x1, y1, x2, y2] of boxes) await drag(page, x1, y1, x2, y2);
await sleep(200);
await page.mouse.move(780, 320, { steps: 6 });
await sleep(500);
await shot(page, 'screenshot-4-canvas.png');
await backToMeasure(world, page);
await sleep(900);

// 5. a full-page screenshot being taken (the card normally hides for the instant each piece
//    is taken; here it's kept on so this picture always shows it)
await page.evaluate(() => {
  const st = document.createElement('style');
  st.textContent = '.hud.snap.snap { visibility: visible !important; }';
  document.querySelector('precise-dimension').shadowRoot.appendChild(st);
});
const cdp = await browser.target().createCDPSession();
const dl = path.join(here, '../test-output/downloads');
await fs.mkdir(dl, { recursive: true });
await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dl });
await clickUI(page, '.split.full .half.r', { hoverFirst: '.split.full' });
await page.mouse.move(640, 600, { steps: 4 });
for (let i = 0; i < 200; i++) {
  const sub = await page.evaluate(() => document.querySelector('precise-dimension').shadowRoot.querySelector('.hud-sub').textContent);
  if (/Capturing 2 of/.test(sub)) break;
  await sleep(40);
}
await sleep(450);
await shot(page, 'screenshot-5-full-page.png');
await sleep(4000);
await page.close();

// promo tile
const icon = await fs.readFile(path.join(here, '../static/icons/icon128.png'));
const tile = await browser.newPage();
await tile.setViewport({ width: 440, height: 280, deviceScaleFactor: 1 });
await tile.setContent(`<!doctype html><html><head><style>
  * { box-sizing: border-box; }
  body { margin: 0; width: 440px; height: 280px; overflow: hidden; font-family: -apple-system, system-ui, sans-serif; background: #f8fafc; position: relative; }
  .top { position: absolute; left: 34px; top: 40px; display: flex; gap: 20px; align-items: center; }
  .top img { width: 88px; height: 88px; display: block; }
  h1 { margin: 0; font-size: 30px; letter-spacing: -.7px; color: #0f172a; line-height: 1.1; white-space: nowrap; }
  p { margin: 15px 0 0; font-size: 15px; color: #475569; line-height: 1.3; white-space: nowrap; }
  .row { position: absolute; left: 34px; right: 34px; top: 176px; display: flex; gap: 16px; }
  .blk { flex: 1; height: 58px; border-radius: 8px; background: #e2e8f0; }
  .blk:nth-child(2) { flex: 1.6; }
  .g { position: absolute; border: 1.5px solid #2563eb; background: rgba(37,99,235,.08); border-radius: 3px; pointer-events: none; }
  .c { position: absolute; background: #2563eb; color: #fff; font: 700 9.5px/1 -apple-system, system-ui, sans-serif; padding: 3px 5px; border-radius: 4px; transform: translate(-50%, -50%); white-space: nowrap; }
</style></head><body>
  <div class="top"><img class="m" src="data:image/png;base64,${icon.toString('base64')}"><div><h1 class="m">Precise Dimension</h1><p class="m">A measurement tool for your mind.</p></div></div>
  <div class="row"><div class="blk m"></div><div class="blk m"></div><div class="blk m"></div></div>
  <script>
    // outline every marked thing and label its width, like the extension does
    for (const el of document.querySelectorAll('.m')) {
      const r = el.getBoundingClientRect();
      const g = document.createElement('div');
      g.className = 'g';
      Object.assign(g.style, { left: r.left - 1 + 'px', top: r.top - 1 + 'px', width: r.width + 2 + 'px', height: r.height + 2 + 'px' });
      document.body.appendChild(g);
      const c = document.createElement('div');
      c.className = 'c';
      c.textContent = Math.round(r.width) + 'px';
      Object.assign(c.style, { left: r.left + r.width / 2 + 'px', top: r.bottom + 'px' });
      document.body.appendChild(c);
    }
  </script>
</body></html>`, { waitUntil: 'load' });
await tile.screenshot({ path: path.join(OUT, 'promo-440x280.png') });

await browser.close();
server.close();
console.log('store pictures in', OUT);
