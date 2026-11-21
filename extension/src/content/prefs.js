// Remembers units, fill strength, guides and detail level between visits (edits always start clean).
import { app, DETAILS } from './app.js';
import { UNITS } from './units.js';

const KEY = 'pd_prefs';
let timer = 0;

export function loadPrefs() {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(KEY, (v) => {
        const p = (v && v[KEY]) || {};
        if (UNITS.includes(p.unit)) app.state.unit = p.unit;
        if (typeof p.fill === 'number' && p.fill >= 0 && p.fill <= 1) app.state.fill = p.fill;
        if (typeof p.guides === 'boolean') app.state.guides = p.guides;
        if (DETAILS.includes(p.detail)) app.state.detail = p.detail;
        resolve(p);
      });
    } catch {
      resolve({});
    }
  });
}

export function savePrefs() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    try {
      chrome.storage.local.set({ [KEY]: { unit: app.state.unit, fill: app.state.fill, guides: app.state.guides, detail: app.state.detail } });
    } catch {}
  }, 250);
}
