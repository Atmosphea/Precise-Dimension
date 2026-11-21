// Renders the toolbar icon at every size Chrome wants (run once: node tools/make-icons.mjs).
import puppeteer from 'puppeteer';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, '../static/icons');

// Blue tile, a white measured box, and a white dimension line with end ticks above it.
const svg = (size) => {
  const small = size <= 32;
  const sw = small ? 11 : 9;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 128 128">
  <rect x="4" y="4" width="120" height="120" rx="30" fill="#1d4ed8"/>
  <rect x="${small ? 28 : 30}" y="${small ? 50 : 50}" width="${small ? 72 : 68}" height="${small ? 50 : 48}" rx="7" fill="none" stroke="#fff" stroke-width="${sw}"/>
  <path d="M${small ? 28 : 30} 29H${small ? 100 : 98}" stroke="#fff" stroke-width="${small ? 9 : 7}" stroke-linecap="round"/>
  <path d="M${small ? 28 : 30} 19V39M${small ? 100 : 98} 19V39" stroke="#fff" stroke-width="${small ? 9 : 7}" stroke-linecap="round"/>
</svg>`;
};

await fs.mkdir(outDir, { recursive: true });
const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
for (const size of [16, 32, 48, 128]) {
  await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg(size)}</body></html>`);
  const el = await page.$('svg');
  await el.screenshot({ path: path.join(outDir, `icon${size}.png`), omitBackground: true });
  console.log('icon', size);
}
await browser.close();
