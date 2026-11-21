// Styles for everything inside the overlay's private (shadow) DOM.
export const CSS = `
:host {
  all: initial !important;
  position: fixed !important;
  inset: 0 !important;
  z-index: 2147483647 !important;
  display: block !important;
  pointer-events: none !important;
  contain: strict !important;
  opacity: 1 !important;
  visibility: visible !important;
  transform: none !important;
  filter: none !important;
  color-scheme: light !important;
}
* { box-sizing: border-box; }
.pd {
  position: fixed; inset: 0; pointer-events: none;
  font: 500 12px/1.25 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  color: #111; -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility;
  user-select: none; -webkit-user-select: none;
}
button {
  all: unset; box-sizing: border-box; cursor: pointer; -webkit-tap-highlight-color: transparent;
}
button:focus-visible { outline: 2px solid #2563eb; outline-offset: 2px; }

/* blank canvas: a white board with a dot grid that opens like a circle from its button */
.board {
  position: absolute; inset: 0; z-index: 0; pointer-events: none;
  background-color: #fff;
  background-image: radial-gradient(circle at center, #c7cad1 1.1px, transparent 1.5px);
  background-size: 24px 24px; background-position: 12px 12px;
  clip-path: circle(0px at var(--ox, calc(100% - 60px)) var(--oy, 30px));
  transition: clip-path .62s cubic-bezier(.65,0,.25,1);
}
.pd[data-canvas] .board { clip-path: circle(160vmax at var(--ox, calc(100% - 60px)) var(--oy, 30px)); }

.cv { position: absolute; left: 0; top: 0; z-index: 1; pointer-events: none; }
.layer { position: absolute; inset: 0; z-index: 2; pointer-events: none; touch-action: none; }
.pd[data-mode="draw"] .layer, .pd[data-mode="change"] .layer, .pd[data-canvas] .layer { pointer-events: auto; cursor: crosshair; }
.pd[data-mode="change"]:not([data-canvas]) .layer { cursor: default; }

/* toolbars */
.bars {
  position: absolute; top: 12px; right: 12px; z-index: 4;
  display: flex; flex-direction: column; align-items: flex-end; gap: 10px;
  transform-origin: top right;
}
.bar { display: flex; align-items: center; gap: 8px; }
.btn {
  position: relative; flex: none;
  width: 34px; height: 34px; border-radius: 17px;
  display: grid; place-items: center;
  background: #fff; color: #111;
  box-shadow: 0 0 0 1px rgba(0,0,0,.07), 0 1px 2px rgba(0,0,0,.10), 0 4px 14px rgba(0,0,0,.10);
  pointer-events: auto;
  opacity: 0;
  transform: translateX(var(--dx, 0px)) rotate(var(--rot, 0deg)) scale(.35);
  transition:
    transform .56s cubic-bezier(.2,1.25,.32,1) var(--d, 0ms),
    opacity .22s ease var(--d, 0ms),
    width .22s cubic-bezier(.3,1.3,.5,1),
    background-color .15s, color .15s, box-shadow .15s;
}
.bar.shown > .btn { opacity: 1; transform: none; }
.bar:not(.shown) > .btn { pointer-events: none; }
.btn svg { width: 17px; height: 17px; display: block; pointer-events: none; }
.btn:hover { background-color: #f3f4f6; }
.btn:active { background-color: #e5e7eb; }
.btn.on { background-color: #111; color: #fff; }
.btn.on:hover { background-color: #262626; }
.btn.change.on { background-color: #7c3aed; box-shadow: 0 0 0 1px rgba(76,29,149,.25), 0 4px 14px rgba(124,58,237,.35); }
.btn.change.on:hover { background-color: #6d28d9; }
.btn.small { width: 26px; height: 26px; border-radius: 13px; color: #6b7280; }
.btn.small svg { width: 12px; height: 12px; }
.btn.small:hover { color: #111; }
.btn .txt { font-size: 10.5px; font-weight: 700; letter-spacing: -.2px; line-height: 1; pointer-events: none; }
.btn.long .txt { font-size: 8.8px; letter-spacing: -.35px; }
/* the eye joined to the detail level: [eye | Blocks] */
.btn.duo { width: auto; display: flex; align-items: stretch; padding: 0; cursor: default; }
.btn.duo:hover, .btn.duo:active { background-color: #fff; }
.duo > .seg {
  height: 34px; display: grid; place-items: center; color: inherit;
  transition: background-color .15s, color .15s;
}
.duo > .seg.eye { width: 33px; padding-left: 2px; border-radius: 17px 4px 4px 17px; }
.duo > .seg.lvl { min-width: 46px; padding: 0 12px 0 8px; border-radius: 4px 17px 17px 4px; box-shadow: inset 1px 0 0 rgba(0,0,0,.08); }
.duo > .seg:hover { background-color: #f3f4f6; }
.duo > .seg:active { background-color: #e5e7eb; }
.duo .seg svg { width: 17px; height: 17px; display: block; pointer-events: none; }
.duo .seg .i-off { display: none; }
.duo.off .seg .i-on { display: none; }
.duo.off .seg .i-off { display: block; }
.duo.off > .seg { color: #9ca3af; }

/* fill strength slider */
.btn.pill { width: auto; padding: 0 12px 0 12px; display: flex; gap: 7px; align-items: center; cursor: default; }
.btn.pill:hover { background-color: #fff; }
.plab { font-size: 10px; font-weight: 650; color: #6b7280; letter-spacing: .2px; }
.range {
  -webkit-appearance: none; appearance: none; width: 74px; height: 22px; margin: 0; padding: 0;
  background: transparent; cursor: pointer; outline: none; pointer-events: auto;
}
.range::-webkit-slider-runnable-track {
  height: 4px; border-radius: 2px;
  background: linear-gradient(90deg, hsl(218 88% 50%) 0 var(--p, 8%), #e5e7eb var(--p, 8%) 100%);
}
.range::-webkit-slider-thumb {
  -webkit-appearance: none; appearance: none; width: 14px; height: 14px; border-radius: 50%;
  background: #fff; border: 1.5px solid #111; margin-top: -5px; box-shadow: 0 1px 3px rgba(0,0,0,.25);
}
.range:focus-visible::-webkit-slider-thumb { outline: 2px solid #2563eb; outline-offset: 1px; }

/* split buttons: hover turns one circle into two halves */
.btn.split { width: 34px; }
.bar.shown > .btn.split:hover, .btn.split.hold { width: 66px; background-color: transparent; box-shadow: none; }
.split > .face {
  position: absolute; inset: 0; display: grid; place-items: center; border-radius: 17px;
  transition: opacity .14s; pointer-events: none;
}
.split > .half {
  position: absolute; top: 0; width: 31px; height: 34px; display: grid; place-items: center;
  background: #fff; color: inherit; opacity: 0; pointer-events: none;
  box-shadow: 0 0 0 1px rgba(0,0,0,.07), 0 1px 2px rgba(0,0,0,.10), 0 4px 14px rgba(0,0,0,.10);
  transition: opacity .14s, background-color .15s;
}
.split > .half.l { left: 0; border-radius: 17px 5px 5px 17px; }
.split > .half.r { right: 0; border-radius: 5px 17px 17px 5px; }
.split > .half svg { width: 15px; height: 15px; }
.bar.shown > .split:hover > .face, .split.hold > .face { opacity: 0; }
.bar.shown > .split:hover > .half, .split.hold > .half { opacity: 1; pointer-events: auto; }
.split > .half:hover { background-color: #f3f4f6; }
.split > .half:active { background-color: #e5e7eb; }
.split.dim > .half.l { color: #a1a1aa; }

/* check / cross feedback */
.st {
  position: absolute; inset: 0; border-radius: 17px; display: grid; place-items: center;
  background: #fff; color: #16a34a; opacity: 0; transform: scale(.6); pointer-events: none;
  transition: opacity .16s, transform .32s cubic-bezier(.2,1.7,.4,1);
}
.st.no { color: #dc2626; }
.st svg { width: 18px; height: 18px; }
.btn.ok > .st.yes, .btn.bad > .st.no { opacity: 1; transform: none; }

/* purple change-mode bar */
.purple .btn, .purple .split > .half {
  background-color: #7c3aed; color: #fff;
  box-shadow: 0 0 0 1px rgba(76,29,149,.22), 0 1px 2px rgba(76,29,149,.25), 0 4px 14px rgba(124,58,237,.30);
}
.purple .btn:hover, .purple .split > .half:hover { background-color: #6d28d9; }
.purple .btn:active, .purple .split > .half:active { background-color: #5b21b6; }
.purple .btn.on { background-color: #4c1d95; }
.bar.purple.shown > .btn.split:hover, .bar.purple > .btn.split.hold { background-color: transparent; box-shadow: none; }
.purple .st { background: #7c3aed; color: #fff; }
.purple .st.no { background: #7c3aed; color: #fecaca; }
.purple .btn.duo:hover, .purple .btn.duo:active { background-color: #7c3aed; }
.purple .duo > .seg:hover { background-color: #6d28d9; }
.purple .duo > .seg:active { background-color: #5b21b6; }
.purple .duo > .seg.lvl { box-shadow: inset 1px 0 0 rgba(255,255,255,.2); }
.purple .duo.off > .seg { color: #c4b5fd; }
.purple .split.dim > .half.l { color: #c4b5fd; }

/* small icon buttons used in flyouts and panels */
.ib {
  width: 28px; height: 28px; border-radius: 8px; display: grid; place-items: center; flex: none;
  color: #111; transition: background-color .12s, color .12s;
}
.ib svg { width: 16px; height: 16px; display: block; pointer-events: none; }
.ib:hover { background: #f3f4f6; }
.ib.on { background: #111; color: #fff; }
.sep { width: 1px; align-self: stretch; margin: 5px 3px; background: #e5e7eb; flex: none; }

.fly, .afloat, .panel {
  position: absolute; left: 0; top: 0; z-index: 5;
  background: #fff; border-radius: 12px;
  box-shadow: 0 0 0 1px rgba(0,0,0,.07), 0 2px 4px rgba(0,0,0,.08), 0 10px 28px rgba(0,0,0,.14);
  opacity: 0; pointer-events: none;
}
.fly, .afloat { display: flex; align-items: center; gap: 1px; padding: 4px; transition: opacity .15s; }
.fly.open, .afloat.open, .panel.open { opacity: 1; pointer-events: auto; }
.fly .ib, .panel .ib { color: #4c1d95; }
.fly .ib:hover, .panel .ib:hover { background: #f3efff; }
.panel .ib.on { background: #7c3aed; color: #fff; }

.panel { width: 214px; padding: 10px 10px 8px; transition: opacity .18s; }
.ttl {
  font-weight: 700; font-size: 11px; color: #5b21b6; margin: 0 2px 4px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.row { display: flex; align-items: center; gap: 1px; margin-top: 3px; }
.lab { width: 54px; flex: none; color: #6b7280; font-size: 10.5px; padding-left: 2px; }
.val { min-width: 48px; text-align: center; font-weight: 650; font-size: 11px; font-variant-numeric: tabular-nums; }

/* tooltip, hint line, toast */
.tip {
  position: absolute; left: 0; top: 0; z-index: 7; padding: 4px 8px; border-radius: 6px;
  background: rgba(17,17,17,.92); color: #fff; font-size: 11px; font-weight: 500; white-space: nowrap;
  pointer-events: none; opacity: 0; transition: opacity .12s;
}
.tip.on { opacity: 1; }
.hint, .toast {
  position: absolute; left: 50%; z-index: 6; max-width: calc(100vw - 40px);
  padding: 6px 12px; border-radius: 999px; color: #fff; font-size: 11px; white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis; pointer-events: none;
  opacity: 0; transform: translate(-50%, 6px); transition: opacity .28s, transform .28s;
}
.hint { bottom: 14px; background: rgba(17,17,17,.74); }
.pd[data-mode="change"]:not([data-canvas]) .hint { background: rgba(76,29,149,.84); }
.toast { bottom: 46px; background: rgba(17,17,17,.94); font-weight: 600; }
.hint.on, .toast.on { opacity: 1; transform: translate(-50%, 0); }

/* typing a size into a label */
.dimedit {
  position: absolute; z-index: 6; display: none; height: 20px; margin: 0; padding: 0 6px;
  border: 1.5px solid #2563eb; border-radius: 5px; background: #fff; color: #111;
  font: 650 11px/1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; text-align: center;
  outline: none; box-shadow: 0 2px 10px rgba(0,0,0,.18); pointer-events: auto;
  user-select: text; -webkit-user-select: text;
}
.pd[data-mode="change"] .dimedit { border-color: #7c3aed; }

/* hidden while a screenshot is taken */
.pd.capturing .bars, .pd.capturing .tip, .pd.capturing .hint, .pd.capturing .toast,
.pd.capturing .fly, .pd.capturing .panel, .pd.capturing .afloat, .pd.capturing .dimedit {
  visibility: hidden !important; transition: none !important;
}

/* full-page screenshot progress card (it hides for the instant each piece is taken) */
.hud {
  position: absolute; top: 14px; left: 50%; z-index: 8;
  display: flex; align-items: flex-start; gap: 12px; padding: 10px 16px 11px 10px;
  background: #fff; border-radius: 14px; color: #111; pointer-events: none;
  box-shadow: 0 0 0 1px rgba(0,0,0,.07), 0 2px 4px rgba(0,0,0,.08), 0 12px 32px rgba(0,0,0,.16);
  opacity: 0; transform: translate(-50%, -10px) scale(.96);
  transition: opacity .2s, transform .3s cubic-bezier(.2,1.25,.3,1);
}
.hud.on { opacity: 1; transform: translate(-50%, 0); }
.hud.snap { visibility: hidden !important; transition: none !important; }
.hud-prev { display: block; flex: none; border-radius: 4px; background: #f3f4f6; box-shadow: 0 0 0 1px rgba(0,0,0,.08); }
.hud-txt { display: flex; flex-direction: column; gap: 3px; min-width: 160px; padding-top: 1px; }
.hud-title { font-size: 12px; font-weight: 700; letter-spacing: -.1px; }
.hud-sub { font-size: 11px; color: #6b7280; font-variant-numeric: tabular-nums; white-space: nowrap; }
.hud-bar { position: relative; height: 4px; border-radius: 2px; background: #e5e7eb; overflow: hidden; margin-top: 5px; }
.hud-bar > i { position: absolute; left: 0; top: 0; bottom: 0; width: 0; background: #2563eb; border-radius: 2px; transition: width .25s ease; }
.pd[data-mode="change"] .hud-bar > i { background: #7c3aed; }
.hud-esc { font-size: 10px; color: #9ca3af; margin-top: 3px; }

/* camera flash after a screenshot: white for a moment, then it fades away */
.flash { position: absolute; inset: 0; z-index: 30; background: #fff; pointer-events: none; animation: pdflash .72s cubic-bezier(.3,0,.2,1) forwards; }
@keyframes pdflash { 0% { opacity: 1; } 28% { opacity: 1; } 100% { opacity: 0; } }
@keyframes pdflashsoft { 0% { opacity: .4; } 100% { opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .flash { animation: pdflashsoft .4s ease-out forwards; } }
`;
