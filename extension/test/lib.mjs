// Helpers for driving a real Chrome with the extension loaded.
import puppeteer from 'puppeteer';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml' };

export async function serve(dir) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const delay = +url.searchParams.get('delay') || 0; // slow files, like images on a real site
    if (delay) await sleep(delay);
    let p = path.join(dir, decodeURIComponent(url.pathname));
    if (p.endsWith('/')) p += 'index.html';
    try {
      const data = await fs.readFile(p);
      res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end('not found');
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, url: `http://127.0.0.1:${server.address().port}/` };
}

// dpr: run the whole browser at that screen density (like a retina or phone screen). Only setting
// it on a page is not enough for screenshots: Chrome's own capture ignores that setting.
export async function launch(extDir, { width = 1280, height = 800, headless = true, dpr = 1 } = {}) {
  const args = [`--window-size=${width},${height + 100}`, '--host-resolver-rules=MAP insecure.test 127.0.0.1'];
  if (dpr !== 1) args.push(`--force-device-scale-factor=${dpr}`);
  const browser = await puppeteer.launch({
    headless,
    pipe: true,
    enableExtensions: [extDir],
    defaultViewport: { width, height, deviceScaleFactor: dpr },
    // insecure.test → this machine, to try pages that count as "not secure" (plain http)
    args,
  });
  let ext = null;
  for (let i = 0; i < 50 && !ext; i++) {
    const all = await browser.extensions();
    ext = [...all.values()].find((e) => e.name.startsWith('Precise Dimension')) || null;
    if (!ext) await sleep(100);
  }
  if (!ext) throw new Error('extension did not load');
  for (let i = 0; i < 100 && !(await ext.workers()).length; i++) await sleep(100);
  return { browser, ext };
}

// Evaluate code inside the extension's own (isolated) world on a page, where window.__PD__ lives.
export async function pdWorld(page) {
  const client = await page.createCDPSession();
  const contexts = [];
  client.on('Runtime.executionContextCreated', (e) => {
    const c = e.context;
    if (c.auxData && c.auxData.type === 'isolated' && /Precise Dimension/.test(c.name)) contexts.push(c.id);
  });
  client.on('Runtime.executionContextDestroyed', (e) => {
    const i = contexts.indexOf(e.executionContextId);
    if (i >= 0) contexts.splice(i, 1);
  });
  client.on('Runtime.executionContextsCleared', () => contexts.splice(0));
  await client.send('Runtime.enable');
  const errors = [];
  client.on('Runtime.exceptionThrown', (e) => errors.push(e.exceptionDetails));
  return {
    client,
    errors,
    async eval(expression) {
      for (let i = 0; i < 40 && !contexts.length; i++) await sleep(50);
      const contextId = contexts[contexts.length - 1];
      if (!contextId) throw new Error('no extension context on page');
      const r = await client.send('Runtime.evaluate', { expression, contextId, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text);
      return r.result.value;
    },
  };
}

export async function uiRect(page, sel) {
  return page.evaluate((s) => {
    const host = document.querySelector('precise-dimension');
    if (!host || !host.shadowRoot) return null;
    const el = host.shadowRoot.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
  }, sel);
}

export async function clickUI(page, sel, { hoverFirst = null, wait = 260 } = {}) {
  if (hoverFirst) {
    const h = await uiRect(page, hoverFirst);
    if (!h) throw new Error('no ui element ' + hoverFirst);
    await page.mouse.move(h.cx, h.cy, { steps: 4 });
    await sleep(wait);
  }
  const r = await uiRect(page, sel);
  if (!r) throw new Error('no ui element ' + sel);
  await page.mouse.move(r.cx, r.cy, { steps: 3 });
  await sleep(60);
  await page.mouse.click(r.cx, r.cy);
  return r;
}

export async function drag(page, x1, y1, x2, y2, { steps = 12, shift = false, alt = false, meta = false } = {}) {
  if (shift) await page.keyboard.down('Shift');
  if (alt) await page.keyboard.down('Alt');
  if (meta) await page.keyboard.down('Meta');
  await page.mouse.move(x1, y1);
  await page.mouse.down();
  await page.mouse.move(x1 + (x2 - x1) * 0.2, y1 + (y2 - y1) * 0.2, { steps: 3 });
  await page.mouse.move(x2, y2, { steps });
  await sleep(40);
  await page.mouse.up();
  if (meta) await page.keyboard.up('Meta');
  if (alt) await page.keyboard.up('Alt');
  if (shift) await page.keyboard.up('Shift');
  await sleep(80);
}

export function rectOfPage(page, sel) {
  return page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  }, sel);
}
