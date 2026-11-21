# Changelog

## 0.2.0 (2026-11-21)

**Opening**
- A wave pulses out from the toolbar icon when you turn it on. You never see the circle itself, only the outlines being traced where it passes, each with a bright tip. Each size label's box pops in next, one after another, and the numbers fade in on top once they're all in.

**Change mode**
- Crowded spots (toolbars, rows of tags, icon grids) no longer show a ring of arrows. Only the edge right under your mouse lights up, with one handle that follows your mouse along it.
- The box you're about to pick stands out much more: a white halo, a bold outline and a tint, with its name and size above it.
- **Ctrl-click** (Ctrl or ⌘ on a Mac) picks the box around what you clicked. Keep Ctrl-clicking to climb one level at a time. With several things picked, they all climb together.
- **Ctrl+Shift-click** picks everything like it (same class), so a whole row of cards or buttons can be resized together.
- Holding Ctrl or Ctrl+Shift previews what a click would pick.
- A plain click now always picks the thing under the mouse (it used to climb on a second click).

**Screenshots**
- Full-page screenshots are now real stitched screenshots. It scrolls for you, takes the page one screen at a time, and joins the pieces pixel for pixel at the screen's full sharpness (checked at 1×, 1.5×, 2× and 3×).
  - It loads lazy pictures first. Sticky headers and floating buttons show only once.
  - Web apps with a scrolling middle panel get that panel stretched out to full length.
  - A progress card with a live preview shows what's happening, and Esc stops it.
  - Pictures taller than the browser's canvas limit are written strip by strip, so they keep full resolution.
- The screen flashes white, like a camera, when a screenshot is taken.
- Clearer messages when copying isn't possible ("too big for the clipboard" vs "this page doesn't allow copying"), with the picture downloaded instead.

**Other**
- Toolbars shrink to fit narrow windows.
- Store listing text and privacy policy added (STORE.md, PRIVACY.md).

## 0.1.0 (2026-11-20)

- First version. It measures every box in vw/vh, px, %, rem, em, pt or Tailwind.
- Draw boxes, or sketch on a blank canvas.
- Change mode moves and resizes things like in Photoshop: snapping, W A S D, groups with flex controls, reflow and magic fix.
- Copy edits as plain-English text for your coding agent.
- Copy or download screenshots of the screen or the whole page.
