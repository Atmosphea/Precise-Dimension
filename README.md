# Precise Dimension

**A measurement tool for your mind, so you can vibe code accurately.**

We built this tool because describing a layout in words is hard, especially when you're not a coder. Precise Dimension is for the non-coders. Measure anything on a page, see it in whatever unit you like, and know exactly how your layout should go, then hand those exact numbers to your AI.

AI tools can see now, so a good layout screenshot matters more than ever. This is a tool for designers to revel in, and for the designer in everybody, as more of us take on creative roles in our lives.

---

Click the icon on any web page and every box shows its size, in units you can say to your coding agent ("make the navbar 13vh tall and the logo 10vw wide"). You can also draw boxes, move and resize things like in Photoshop (even drag them out of the box they sit in), and copy all of it as a screenshot (the visible screen or the whole page) or as plain words.

There's also a quicker way to install it: download `precise-dimension-1.0.0.zip` from the [latest release](https://github.com/Atmosphea/Precise-Dimension/releases/latest), unzip it, and choose that folder in step 4 below.

- `extension/` holds the browser extension, which is what this README is about.
- The other folders hold the original Precise Dimension web app (Next.js, exported from v0).

## Install it (Comet, Chrome, Arc, Brave, Edge — any Chromium browser)

1. Download this repository: on GitHub press **Code → Download ZIP**, then unzip it somewhere you'll keep it, for example `Documents`.
2. Open the extensions page. Type one of these in the address bar:
   - Comet: `comet://extensions`
   - Chrome, Arc, Brave: `chrome://extensions`
   - Edge: `edge://extensions`
3. Turn on **Developer mode** (a switch in the top-right corner, or the left side in Edge).
4. Click **Load unpacked** and choose the `extension/build` folder inside the unzipped download.
5. Pin it: click the puzzle-piece icon next to the address bar, then the pin next to **Precise Dimension**.

To update later, replace the folder with the newer download. Then press the round **reload** arrow on the Precise Dimension card on the extensions page and reload the tabs you use it on.

## Use it

Click the icon, or press **Alt+Shift+D** (Option+Shift+D on a Mac). A wave ripples out from the toolbar icon and traces the outline of every box on the page. Then each size label's box pops in, and the numbers fade in on top. Click the icon again or press **Esc** to turn it off. Your drawings and edits stay in memory until you refresh the page; refreshing always starts clean.

### White toolbar (top right)

| Button | What it does |
| --- | --- |
| × | Turn it off |
| fill slider | How strong the blue fill is, from off to full |
| unit (e.g. `vw/vh`) | Switch units: vw/vh → px → % → rem → em → pt → Tailwind. Shortcut: **U** (Shift+U goes back) |
| draw | Drag on the page to draw boxes. They scroll with the page and show their size and distances |
| canvas | A blank white board with a dot grid, for sketching a layout from scratch |
| screenshot | Hover it and it splits in two: **left half copies**, **right half downloads** what you see right now. The screen flashes white like a camera and a check mark shows it worked |
| full page | Same split, but for the whole page from top to bottom, as one tall picture (see below) |
| change mode | Turns everything purple so you can move and resize the page itself (see below) |
| eye + level | Two halves. The **eye** hides or shows all the guides (**H**). The **level** next to it changes how much detail you see: **All** (every box, down to each word), then **Blocks** (cards, columns, buttons, pictures), then **Sections** (just the big parts: header, sections, sidebar, footer). Hovering and clicking follow the level, so at Sections a click picks a whole section. Shortcut: **L** (Shift+L goes back) |

Screenshots include your drawings and the size labels (hide the guides first if you only want the drawings). On pages that don't allow copying (plain `http://` sites that aren't localhost), the screenshot downloads instead.

On narrow windows (phone-sized, split screen) the toolbars shrink so every button still fits.

### Full-page screenshots

The full-page button scrolls the page for you, takes it one screen at a time, and joins the pieces into one picture at your screen's full sharpness (2× on a retina Mac, 3× on a phone-sized window). A small card at the top shows how far along it is, with a preview of the picture as it grows. Press **Esc** to stop. The card hides itself for the instant each piece is taken, so it never ends up in the picture.

It also tidies up as it goes:

- It scrolls through once first, so pictures that only load when you scroll to them (and scroll-in animations) are there.
- Sticky headers show once, at the top, instead of on every piece.
- Fixed things like chat bubbles and cookie bars show once: bars at the top in the first piece, bubbles at the bottom in the last piece.
- Web apps where only the middle panel scrolls (lots of dashboards, mail and note-taking apps) get that panel stretched out to its full length. The header stays at the top, the footer at the bottom, and side bars are stretched to match.
- Your page is put back exactly as it was afterwards, scroll position included.

Chrome allows about two screenshots a second, so it takes a moment: a page five screens tall takes about 5 seconds, ten screens about 9.

### Change mode (purple)

Treat the page like a Photoshop file. Moving or resizing one thing never pushes anything else around.

- **Hover** to see what you'd pick: it gets a white halo and a bold outline, plus small inward-pointing arrows on the nearest edges. In crowded spots (toolbars, rows of tags, icon grids) the ring of arrows steps aside. Only the edge right under your mouse lights up, with one handle that follows your mouse along it, ready to drag. Inside something you've already picked, a drag moves the whole thing instead of grabbing an edge inside it.
- **Click** to select the thing under the mouse (four corners appear). **Shift-click** to add more things.
- **Double-click** to pick the box around it, **triple-click** for the box around that, and **quadruple-click** for one more: icon → its card → the row of cards. **Alt-click** (Option-click on a Mac) climbs the same way, one level per click. Hold Alt (Option) while hovering to preview what you'd get. Then drag from inside it to move the whole box.
- **Alt+Shift-click** (Option+Shift-click on a Mac) picks everything like it: every card in the grid, every button in the menu (things that share the same class). Then W A S D or a drag changes them all together.
- **Drag** to move. Things snap to nearby edges and centres (pink lines). Hold **⌘** (Ctrl on Windows) to switch snapping off.
- **Drag it out of its box.** Drag something past the edge of the box it sits in (a link out of a menu, a button out of a card, a word out of a sticky header) and it comes out. It floats above everything, nothing cuts it off, and the box closes the gap behind it. Drag it back over its box and it slides back into its own spot.
- **Drag an edge arrow or a corner** to resize.
- **W / S** make it shorter or taller and **A / D** narrower or wider, about 5% per press (with Shift, 1px at a time).
- **Arrow keys** nudge by 1px (with Shift, 10px).
- **Delete** hides the selected thing but keeps its space.
- With two or more selected, drag the **pink handle in the gap** between them to change the spacing.
- **⌘Z** undo, **⇧⌘Z** redo.

The purple toolbar that rolls out under the white one:

| Button | What it does |
| --- | --- |
| reflow | Hover to split: **pulse reflow** turns your moves into a real layout (things re-order to where you dropped them). **Magic fix** lines things up and evens out the gaps |
| group | Hover to split: **group** wraps the selection in a flex box and opens flex controls (direction, spread, line-up, gap). **Ungroup** undoes it. Shortcuts: **⌘G** / **⇧⌘G** |
| align | Align edges or centres and even out spacing |
| copy as text | Copies a plain-English list of everything you changed, with sizes and CSS selectors, ready to paste to your coding agent |
| undo | Hover to split: **undo** the last step, or **reset all** to put the page back exactly as it was |
| eye + level | The same as on the white toolbar |

### Drawing boxes and the canvas

- **Drag** to draw a box. **Drag a box** to move it, drag its edges or corners to resize, **Alt-drag** to duplicate, **right-click** to remove.
- **Shift-drag** or **double-click-drag** selects several boxes. A small align bar then appears above them.
- **Click a size label** to type an exact size, such as `25vw`, `300px` or `w-64`.

### Esc

Esc steps back one thing at a time: stops a full-page screenshot or a drag (whatever you were dragging goes back where it was), closes a menu, clears the selection, leaves the canvas, leaves change mode, then turns the tool off.

## Notes and limits

- The browser doesn't let extensions run on its own pages (`chrome://…`, `comet://…`, the extension store, the built-in PDF viewer). There the icon shows a red **!**.
- For local files (`file://…`), turn on **Allow access to file URLs** on the extension's details page.
- On very big pages, only the part around the screen is measured, and the rest fills in as you scroll.
- Website content inside iframes (embedded videos, some widgets) is measured as one box.
- Full-page screenshots stop if you switch tabs while they're being taken, because the browser only lets extensions photograph the tab you're looking at. They go up to 150 screens (or 250,000 pixels) tall.
- Very tall full-page pictures may be too big for the clipboard. If copying fails, the picture downloads instead.
- If your computer is set to reduce motion, the opening wave is skipped and the flash is softer.
- Some things can't be dragged out of their box: table cells and rows, parts of an SVG drawing, and anything inside an iframe. They still move, but their box may cut them off.
- Pages that animate things with their own scripts (GitHub's mascot, for example) can move those things back while you work on them.

## For developers

```bash
cd extension
npm install
node build.mjs            # builds extension/build (the folder you load in the browser)
node build.mjs --watch    # rebuilds on every save
node test/run.mjs         # end-to-end tests in a real Chromium; screenshots land in extension/test-output
node test/run.mjs fullpage   # just one group (measure, wave, draw, change, dense, climb, detail, pull, canvas, capture, fullpage, …)
node test/run.mjs sites   # the same checks on six live websites (needs internet)
```

The source lives in `extension/src`. `content/` is everything drawn on the page, and `background.js` handles the toolbar icon and screenshots. `content/capture.js` takes and joins the full-page pieces. Pictures too tall for one canvas are written as a PNG strip by strip (`content/png.js`), so they keep full resolution. The extension only asks for `activeTab`, `scripting` and `storage`. It runs only on the tab where you click it, and it sends nothing anywhere.

The full-page tests check every stripe of a test page pixel by pixel at 1×, 1.5×, 2× and 3× screens, including a web-app layout and a picture taller than the canvas limit.

See [CHANGELOG.md](CHANGELOG.md) for what changed, [STORE.md](STORE.md) for the extension store listing, and [PRIVACY.md](PRIVACY.md) for the privacy policy.
