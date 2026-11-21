// Small stroke icons (24×24). currentColor so buttons can recolor them.
// Built with DOM calls (not innerHTML) so pages with strict security rules can't block them.
const svg = (body, extra = '') => [body, extra];
const NS = 'http://www.w3.org/2000/svg';
const ATTR = /([\w:-]+)="([^"]*)"/g;
const TAG = /<(\w+)((?:\s+[\w:-]+="[^"]*")*)\s*\/>/g;

function setAttrs(node, str) {
  for (const m of str.matchAll(ATTR)) node.setAttribute(m[1], m[2]);
}

export function iconEl(name) {
  const def = icons[name] || icons.close;
  const s = document.createElementNS(NS, 'svg');
  setAttrs(s, 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"');
  if (def[1]) setAttrs(s, def[1]);
  for (const m of def[0].matchAll(TAG)) {
    const n = document.createElementNS(NS, m[1]);
    setAttrs(n, m[2]);
    s.appendChild(n);
  }
  return s;
}

export const icons = {
  draw: svg('<path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4" stroke-dasharray="0"/><path d="M12 8v8M8 12h8"/>'),
  canvas: svg('<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><circle cx="8.5" cy="8.5" r=".6" fill="currentColor"/><circle cx="12" cy="8.5" r=".6" fill="currentColor"/><circle cx="15.5" cy="8.5" r=".6" fill="currentColor"/><circle cx="8.5" cy="12" r=".6" fill="currentColor"/><circle cx="12" cy="12" r=".6" fill="currentColor"/><circle cx="15.5" cy="12" r=".6" fill="currentColor"/><circle cx="8.5" cy="15.5" r=".6" fill="currentColor"/><circle cx="12" cy="15.5" r=".6" fill="currentColor"/><circle cx="15.5" cy="15.5" r=".6" fill="currentColor"/>'),
  screen: svg('<path d="M3.5 8V5.5a2 2 0 0 1 2-2H8M16 3.5h2.5a2 2 0 0 1 2 2V8M20.5 16v2.5a2 2 0 0 1-2 2H16M8 20.5H5.5a2 2 0 0 1-2-2V16"/><rect x="8" y="8" width="8" height="8" rx="1.5"/>'),
  fullpage: svg('<rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M12 7v8M9 12.5l3 3 3-3"/>'),
  change: svg('<path d="M5 4.5 18 10l-5.6 1.9L10.5 17.5z"/><path d="M14.5 14.5l4.5 4.5"/>'),
  eye: svg('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>'),
  eyeOff: svg('<path d="M3 3l18 18"/><path d="M10.6 5.6A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.9 3.6M6.4 6.5C3.9 8.2 2.5 12 2.5 12S6 18.5 12 18.5c1.7 0 3.2-.5 4.4-1.2"/><path d="M9.9 9.9a2.8 2.8 0 0 0 4.2 4.2"/>'),
  close: svg('<path d="M7 7l10 10M17 7 7 17"/>', 'stroke-width="2.2"'),
  copy: svg('<rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2"/><path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5"/>'),
  download: svg('<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5"/><path d="M4.5 17.5v1a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-1"/>'),
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 'stroke-width="2.6"'),
  cross: svg('<path d="M7 7l10 10M17 7 7 17"/>', 'stroke-width="2.6"'),
  reflow: svg('<path d="M3.5 12h3.5l2.2-5.5 4.6 11 2.2-5.5h4.5"/>'),
  pulse: svg('<path d="M3.5 12h3.5l2.2-5.5 4.6 11 2.2-5.5h4.5"/>'),
  magic: svg('<path d="M4 20 15 9"/><path d="m13 7 2-2 4 4-2 2z"/><path d="M8 3.5v3M6.5 5h3M18.5 13.5v3M17 15h3M4 9.5v2M3 10.5h2"/>'),
  group: svg('<rect x="3" y="3" width="18" height="18" rx="3" stroke-dasharray="3 2.6"/><rect x="7" y="8" width="4.5" height="8" rx="1"/><rect x="13" y="8" width="4.5" height="8" rx="1"/>'),
  groupOn: svg('<rect x="3" y="3" width="18" height="18" rx="3" stroke-dasharray="3 2.6"/><rect x="7" y="8" width="4.5" height="8" rx="1"/><rect x="13" y="8" width="4.5" height="8" rx="1"/>'),
  ungroup: svg('<rect x="3" y="7" width="7.5" height="10" rx="1.5"/><rect x="13.5" y="7" width="7.5" height="10" rx="1.5"/><path d="M12 4v1.5M12 18.5V20"/>'),
  align: svg('<path d="M12 3v18"/><rect x="5" y="6" width="14" height="4.5" rx="1"/><rect x="8" y="13.5" width="8" height="4.5" rx="1"/>'),
  text: svg('<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4.5V3h6v1.5M8.5 10h7M8.5 13.5h7M8.5 17h4.5"/>'),
  undo: svg('<path d="M9 7 4.5 11.5 9 16"/><path d="M4.5 11.5H15a4.5 4.5 0 0 1 0 9h-2"/>'),
  reset: svg('<path d="M4 4.5v5h5"/><path d="M4.7 14a8 8 0 1 0 1.6-7.6L4 9.5"/>'),
  alignLeft: svg('<path d="M4.5 3.5v17"/><rect x="8" y="6" width="11" height="4.5" rx="1"/><rect x="8" y="13.5" width="6.5" height="4.5" rx="1"/>'),
  alignHCenter: svg('<path d="M12 3.5v17"/><rect x="5.5" y="6" width="13" height="4.5" rx="1"/><rect x="8.5" y="13.5" width="7" height="4.5" rx="1"/>'),
  alignRight: svg('<path d="M19.5 3.5v17"/><rect x="5" y="6" width="11" height="4.5" rx="1"/><rect x="9.5" y="13.5" width="6.5" height="4.5" rx="1"/>'),
  alignTop: svg('<path d="M3.5 4.5h17"/><rect x="6" y="8" width="4.5" height="11" rx="1"/><rect x="13.5" y="8" width="4.5" height="6.5" rx="1"/>'),
  alignVCenter: svg('<path d="M3.5 12h17"/><rect x="6" y="5.5" width="4.5" height="13" rx="1"/><rect x="13.5" y="8.5" width="4.5" height="7" rx="1"/>'),
  alignBottom: svg('<path d="M3.5 19.5h17"/><rect x="6" y="5" width="4.5" height="11" rx="1"/><rect x="13.5" y="9.5" width="4.5" height="6.5" rx="1"/>'),
  distH: svg('<path d="M4 4v16M20 4v16"/><rect x="9.5" y="7" width="5" height="10" rx="1"/>'),
  distV: svg('<path d="M4 4h16M4 20h16"/><rect x="7" y="9.5" width="10" height="5" rx="1"/>'),
  dirRow: svg('<path d="M4 12h15M14.5 7.5 19 12l-4.5 4.5"/>'),
  dirCol: svg('<path d="M12 4v15M7.5 14.5 12 19l4.5-4.5"/>'),
  wrap: svg('<path d="M4 7h13a3.5 3.5 0 0 1 0 7H8"/><path d="M10.5 11.5 8 14l2.5 2.5"/><path d="M4 18h4"/>'),
  jStart: svg('<path d="M4 4v16"/><rect x="6.5" y="8" width="4" height="8" rx="1"/><rect x="12" y="8" width="4" height="8" rx="1"/>'),
  jCenter: svg('<path d="M12 4v2.5M12 17.5V20"/><rect x="6.5" y="8" width="4" height="8" rx="1"/><rect x="13.5" y="8" width="4" height="8" rx="1"/>'),
  jEnd: svg('<path d="M20 4v16"/><rect x="8" y="8" width="4" height="8" rx="1"/><rect x="13.5" y="8" width="4" height="8" rx="1"/>'),
  jBetween: svg('<path d="M4 4v16M20 4v16"/><rect x="6" y="8" width="4" height="8" rx="1"/><rect x="14" y="8" width="4" height="8" rx="1"/>'),
  jAround: svg('<path d="M3 4v16M21 4v16"/><rect x="6.5" y="8" width="3.5" height="8" rx="1"/><rect x="14" y="8" width="3.5" height="8" rx="1"/>'),
  aStart: svg('<path d="M4 4h16"/><rect x="6.5" y="6.5" width="4" height="10" rx="1"/><rect x="13.5" y="6.5" width="4" height="6" rx="1"/>'),
  aCenter: svg('<path d="M4 12h2.5M17.5 12H20"/><rect x="7.5" y="5.5" width="4" height="13" rx="1"/><rect x="12.5" y="8.5" width="4" height="7" rx="1"/>'),
  aEnd: svg('<path d="M4 20h16"/><rect x="6.5" y="7.5" width="4" height="10" rx="1"/><rect x="13.5" y="11.5" width="4" height="6" rx="1"/>'),
  aStretch: svg('<path d="M4 4h16M4 20h16"/><rect x="6.5" y="6.5" width="4" height="11" rx="1"/><rect x="13.5" y="6.5" width="4" height="11" rx="1"/>'),
  minus: svg('<path d="M6 12h12"/>', 'stroke-width="2.4"'),
  plus: svg('<path d="M12 6v12M6 12h12"/>', 'stroke-width="2.4"'),
};
