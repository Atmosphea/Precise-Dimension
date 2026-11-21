// Late-bound functions shared between the toolbar, the mouse/keyboard handlers and startup,
// so those modules don't have to import each other.
const noop = () => {};
export const hub = {
  toast: noop,
  hint: noop,
  sync: noop,
  openEditor: noop,
  closeEditor: () => false,
  closeFlyouts: () => false,
  setMode: noop,
  setCanvas: noop,
  close: noop,
  cycleUnit: noop,
  toggleGuides: noop,
  group: noop,
  ungroup: noop,
  cancelDrag: noop,
};
