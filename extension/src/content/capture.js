// Screenshots of the visible screen or the whole page, with every guide baked in.
import { app, requestRender, requestFull } from './app.js';
import { frames, sleep, deepContains } from './util.js';

let lastCapture = 0;

function dataUrlToBlob(url) {
  const comma = url.indexOf(',');
  const meta = url.slice(5, comma);
  const bin = atob(url.slice(comma + 1));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: meta.split(';')[0] || 'image/png' });
}

async function rawCapture() {
  // Chrome allows about two captures per second.
  const wait = 560 - (performance.now() - lastCapture);
  if (wait > 0) await sleep(wait);
  lastCapture = performance.now();
  const res = await chrome.runtime.sendMessage({ type: 'pd:capture' });
  if (!res || !res.ok) throw new Error((res && res.error) || 'Screenshot failed');
  return res.dataUrl;
}

async function prepare() {
  app.state.capturing = true;
  app.root.classList.add('capturing');
  const done = performance.now() - 5000;
  for (const c of app.cands) if (c.at > done) c.at = done;
  requestFull();
  await frames(3);
}

function unprepare() {
  app.state.capturing = false;
  app.root.classList.remove('capturing');
  requestRender();
}

export async function captureVisible() {
  await prepare();
  try {
    const url = await rawCapture();
    return dataUrlToBlob(url);
  } finally {
    unprepare();
  }
}

function hideFixed() {
  const hidden = [];
  const all = document.body ? document.body.querySelectorAll('*') : [];
  for (const el of all) {
    if (el === app.host) continue;
    let pos;
    try {
      pos = getComputedStyle(el).position;
    } catch {
      continue;
    }
    if (pos !== 'fixed' && pos !== 'sticky') continue;
    hidden.push([el, el.style.getPropertyValue('visibility'), el.style.getPropertyPriority('visibility')]);
    el.style.setProperty('visibility', 'hidden', 'important');
  }
  const set = app.hiddenForCapture;
  for (const [el] of hidden) {
    set.add(el);
    for (const c of app.cands) if (deepContains(el, c.el)) set.add(c.el);
  }
  return hidden;
}

function unhide(hidden) {
  for (const [el, v, p] of hidden) {
    if (v) el.style.setProperty('visibility', v, p);
    else el.style.removeProperty('visibility');
  }
  app.hiddenForCapture.clear();
}

export async function captureFull() {
  if (app.state.canvasMode) return captureVisible();
  const se = document.scrollingElement || document.documentElement;
  const totalH = Math.max(se.scrollHeight, document.body ? document.body.scrollHeight : 0);
  const vh = window.innerHeight;
  const vw = window.innerWidth;
  if (totalH <= vh + 2) return captureVisible();
  const ox = window.scrollX;
  const oy = window.scrollY;
  const html = document.documentElement;
  const prevBehavior = [html.style.getPropertyValue('scroll-behavior'), html.style.getPropertyPriority('scroll-behavior')];
  html.style.setProperty('scroll-behavior', 'auto', 'important');
  await prepare();
  const slices = [];
  let hidden = [];
  try {
    let y = 0;
    for (let i = 0; i < 80; i++) {
      window.scrollTo({ left: ox, top: y, behavior: 'instant' });
      await frames(2);
      await sleep(i === 0 ? 80 : 180);
      if (i === 1) {
        hidden = hideFixed();
        requestFull();
        await frames(2);
      }
      requestFull();
      await frames(1);
      const actualY = window.scrollY;
      slices.push({ y: actualY, url: await rawCapture() });
      if (actualY + vh >= totalH - 1) break;
      y = actualY + vh;
    }
  } finally {
    unhide(hidden);
    window.scrollTo({ left: ox, top: oy, behavior: 'instant' });
    if (prevBehavior[0]) html.style.setProperty('scroll-behavior', prevBehavior[0], prevBehavior[1]);
    else html.style.removeProperty('scroll-behavior');
    unprepare();
    requestFull();
  }
  const bmps = await Promise.all(slices.map((s) => createImageBitmap(dataUrlToBlob(s.url))));
  const scale = bmps[0].width / vw;
  const outW = bmps[0].width;
  const outH = Math.round(totalH * scale);
  const k = Math.min(1, 32000 / outH, Math.sqrt(250e6 / (outW * outH)));
  const canvas = new OffscreenCanvas(Math.max(1, Math.round(outW * k)), Math.max(1, Math.round(outH * k)));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  slices.forEach((s, i) => {
    const b = bmps[i];
    ctx.drawImage(b, 0, Math.round(s.y * scale * k), Math.round(b.width * k), Math.round(b.height * k));
  });
  bmps.forEach((b) => b.close && b.close());
  return canvas.convertToBlob({ type: 'image/png' });
}

// Must be called synchronously inside the click so the browser allows it.
export function copyImage(blobPromise) {
  const item = new ClipboardItem({ 'image/png': blobPromise });
  return navigator.clipboard.write([item]);
}

export function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).catch(() => legacyCopy(text));
  return legacyCopy(text);
}

// Older copy method that still works on pages without the modern clipboard (plain http://).
function legacyCopy(text) {
  return new Promise((resolve, reject) => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;left:-9999px;top:0;width:10px;height:10px;opacity:0;';
    (app.root || document.body).appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {}
    ta.remove();
    if (ok) resolve();
    else reject(new Error('copy blocked'));
  });
}

export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.style.display = 'none';
  (app.root || document.body).appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 5000);
}

export function fileName(kind) {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const host = (location.hostname || 'page').replace(/^www\./, '').replace(/[^a-z0-9.-]/gi, '-');
  return `precise-dimension_${host}_${kind}_${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.png`;
}
