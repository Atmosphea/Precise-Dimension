# Precise Dimension

A digital ruler for vibe coding. Click the icon on any web page and it shows the size of every box, in units you can say to your coding agent ("make the navbar 13vh tall and the logo 10vw wide"). You can also draw boxes, drag things around like in Photoshop, and copy all of that as a screenshot or as plain words.

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

Click the icon, or press **Alt+Shift+D** (Option+Shift+D on a Mac). Every box on the page outlines itself and labels its size. Click the icon again or press **Esc** to turn it off. Your drawings and edits stay in memory until you refresh the page; refreshing always starts clean.

### White toolbar (top right)

| Button | What it does |
| --- | --- |
| × | Turn it off |
| fill slider | How strong the blue fill is, from off to full |
| unit (e.g. `vw/vh`) | Switch units: vw/vh → px → % → rem → em → pt → Tailwind. Shortcut: **U** (Shift+U goes back) |
| draw | Drag on the page to draw boxes. They scroll with the page and show their size and distances |
| canvas | A blank white board with a dot grid, for sketching a layout from scratch |
| screenshot | Hover it and it splits in two: **left half copies**, **right half downloads** what you see right now. A check mark means it worked |
| full page | Same split, but for the whole page from top to bottom |
| change mode | Turns everything purple so you can move and resize the page itself (see below) |
| eye | Hide or show all the guides. Shortcut: **H** |

Screenshots include your drawings and the size labels (hide the guides first if you only want the drawings). On pages that don't allow copying (plain `http://` sites that aren't localhost), the screenshot downloads instead.

### Change mode (purple)

Treat the page like a Photoshop file. Moving or resizing one thing never pushes anything else around.

- **Hover** to see outlines and small inward-pointing arrows on the nearest edges.
- **Click** to select (four corners appear). **Click again** to pick the box around it. **Shift-click** to add more things.
- **Drag** to move. Things snap to nearby edges and centres (pink lines). Hold **⌘** (Ctrl on Windows) to switch snapping off.
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
| eye | Hide or show the guides |

### Drawing boxes and the canvas

- **Drag** to draw a box. **Drag a box** to move it, drag its edges or corners to resize, **Alt-drag** to duplicate, **right-click** to remove.
- **Shift-drag** or **double-click-drag** selects several boxes. A small align bar then appears above them.
- **Click a size label** to type an exact size, such as `25vw`, `300px` or `w-64`.

### Esc

Esc steps back one thing at a time: stops a drag, closes a menu, clears the selection, leaves the canvas, leaves change mode, then turns the tool off.

## Notes and limits

- The browser doesn't let extensions run on its own pages (`chrome://…`, `comet://…`, the extension store, the built-in PDF viewer). There the icon shows a red **!**.
- For local files (`file://…`), turn on **Allow access to file URLs** on the extension's details page.
- On very big pages, only the part around the screen is measured, and the rest fills in as you scroll.
- Website content inside iframes (embedded videos, some widgets) is measured as one box.

## For developers

```bash
cd extension
npm install
node build.mjs            # builds extension/build (the folder you load in the browser)
node build.mjs --watch    # rebuilds on every save
node test/run.mjs         # end-to-end tests in a real Chromium; screenshots land in extension/test-output
node test/run.mjs sites   # the same checks on six live websites (needs internet)
```

The source lives in `extension/src`. `content/` is everything drawn on the page, and `background.js` handles the toolbar icon and screenshots. The extension only asks for `activeTab`, `scripting` and `storage`. It runs only on the tab where you click it, and it sends nothing anywhere.
