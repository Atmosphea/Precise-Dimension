# Extension store listing

Everything needed to put Precise Dimension on the Chrome Web Store (the same text works for the Edge Add-ons store). Copy each part into the matching box in the developer dashboard.

## Upload file

`extension/dist/precise-dimension-0.2.0.zip`, a zip of the `extension/build` folder. To make it again after a change:

```bash
cd extension && node build.mjs && cd build && zip -r ../dist/precise-dimension-0.2.0.zip . -x '.*'
```

## Store listing tab

**Name:** Precise Dimension

**Summary** (comes from the extension itself, 127 of 132 characters):

> A measurement tool for your mind. See the exact size of everything on a page, then copy it as words or screenshots for your AI.

**Category:** Developer Tools (Art & Design also fits)

**Language:** English

**Description** (paste as is; the store shows plain text):

```text
A measurement tool for your mind, so you can vibe code accurately.

We built this tool because describing a layout in words is hard, especially when you're not a coder. Precise Dimension is for the non-coders. Measure anything on a page, see it in whatever unit you like, and know exactly how your layout should go, then hand those exact numbers to your AI.

AI tools can see now, so a good layout screenshot matters more than ever. This is a tool for designers to revel in, and for the designer in everybody, as more of us take on creative roles in our lives.

WHAT IT DOES
• Click the icon and every box on the page shows its size, in vw/vh, px, %, rem, em, pt or Tailwind classes. Press U to switch units.
• Hover anything to see its size and the space around it.
• Draw your own boxes on top of any page, or sketch a layout on a blank canvas, and type exact sizes like 25vw or w-64.
• Change mode: move and resize anything on the page as if it were a Photoshop file. Things snap to each other, and nothing else gets pushed around.
• Ctrl-click climbs from an icon to its card to the whole row. Ctrl+Shift-click picks everything like it, so a whole row of cards can be resized at once.
• In crowded spots only the edge under your mouse lights up, so you always grab the one you mean.
• Copy your changes as plain English with exact sizes, ready to paste to your coding agent. For example: Link "Book a demo": width 128px → 179px; move it 30px right.
• Take screenshots of the screen or the whole page, with every measurement in them. Copy or download.

FULL-PAGE SCREENSHOTS, DONE PROPERLY
It scrolls the page for you and joins the pieces pixel for pixel at your screen's full sharpness. It loads lazy pictures first, shows sticky headers and chat bubbles only once, and stretches web apps with a scrolling panel to their full length. A small card shows the progress, and Esc stops it.

PRIVATE BY DESIGN
It runs only on the tab where you click it. No accounts, no tracking, nothing sent anywhere. Screenshots go straight to your clipboard or your downloads.

SHORTCUTS
Alt+Shift+D (Option+Shift+D on a Mac) turns it on and off · U units · H hide guides · W A S D resize · Ctrl/⌘+Z undo · Esc steps back
```

**Graphics** (all in `extension/store/`):

| Box in the dashboard | File |
| --- | --- |
| Store icon (128×128) | `extension/build/icons/icon128.png` |
| Screenshots (1280×800) | `screenshot-1-measure.png` … `screenshot-5-full-page.png` |
| Small promo tile (440×280) | `promo-440x280.png` |

**Website / support:** https://github.com/Atmosphea/Precise-Dimension

## Privacy practices tab

**Single purpose:**

> Precise Dimension measures the layout of the web page you're on: the size of every element and the space between them. You can then capture those measurements as screenshots or as plain text to share with an AI coding assistant.

**Permission justifications:**

| Permission | Why it's needed |
| --- | --- |
| `activeTab` | Used only when you click the toolbar icon or press the shortcut. It lets the extension draw measurements over that one tab and take screenshots of it. |
| `scripting` | Puts the measuring overlay into the current tab when you click the icon. Nothing is added to any other tab, and nothing runs in the background. |
| `storage` | Remembers your own settings (unit, fill strength, guides on or off) on your computer, so they're the same next time. |

No host permissions are requested.

**Remote code:** No, I am not using remote code. All code ships inside the package.

**Data usage:** tick none of the data types (it collects nothing), then tick all three statements:
- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL:** https://github.com/Atmosphea/Precise-Dimension/blob/main/PRIVACY.md

## Publishing, step by step

1. Sign up at the Chrome Web Store Developer Dashboard (https://chrome.google.com/webstore/devconsole) with your Google account. There's a one-time registration fee.
2. Press **New item** and upload the zip.
3. Fill in the **Store listing** and **Privacy practices** tabs from this page. Under **Distribution**, choose Public (or Unlisted to share it by link only).
4. Press **Submit for review**. Reviews usually take from a few days to a couple of weeks.
5. For an update, raise `version` in `extension/static/manifest.json` and `extension/package.json`, rebuild, zip, then upload on the item's **Package** tab.
