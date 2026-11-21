"use strict";
(() => {
  // src/content/app.js
  var HOST_TAG = "precise-dimension";
  var WAVE = -1;
  var app = {
    // DOM
    host: null,
    shadow: null,
    root: null,
    canvas: null,
    ctx: null,
    layer: null,
    board: null,
    // viewport
    vw: window.innerWidth,
    vh: window.innerHeight,
    dpr: window.devicePixelRatio || 1,
    rootFS: 16,
    state: {
      open: false,
      closing: false,
      closeStart: 0,
      unit: "vw/vh",
      fill: 0.08,
      guides: true,
      mode: "measure",
      // 'measure' | 'draw' | 'change'
      canvasMode: false,
      capturing: false,
      alignOpen: false
    },
    // measured page elements
    cands: [],
    candByEl: /* @__PURE__ */ new WeakMap(),
    clips: [],
    truncated: false,
    openedAt: 0,
    revealed: /* @__PURE__ */ new WeakMap(),
    // el -> time it first appeared (so re-collects don't replay the cascade)
    wave: null,
    // the opening animation: { t0, ox, oy, maxR, end }
    reduceMotion: false,
    // user-drawn boxes
    shapes: { page: [], canvas: [] },
    // interaction
    sel: [],
    // items: { kind: 'el', el } | { kind: 'shape', shape }
    hover: null,
    hot: null,
    // handle under the cursor
    mouse: { x: -1, y: -1, inside: false },
    drag: null,
    marquee: null,
    preview: null,
    snapLines: [],
    arrows: [],
    crowded: false,
    mods: { mod: false, shift: false },
    // Ctrl/⌘ and Shift, for the click previews
    chips: [],
    spacing: null,
    pulses: [],
    hiddenForCapture: /* @__PURE__ */ new Set(),
    // render bookkeeping
    dirty: true,
    needFull: true,
    needCollect: true,
    live: 0,
    animUntil: 0,
    raf: 0,
    frame: 0
  };
  function requestRender() {
    app.dirty = true;
  }
  function requestFull() {
    app.needFull = true;
    app.dirty = true;
  }
  function requestCollect() {
    app.needCollect = true;
    app.dirty = true;
  }
  function keepAnimating(ms) {
    const until = performance.now() + ms;
    if (until > app.animUntil) app.animUntil = until;
    app.dirty = true;
  }
  function liveFor(ms) {
    app.live++;
    keepAnimating(ms);
    setTimeout(() => {
      app.live = Math.max(0, app.live - 1);
      requestFull();
    }, ms);
  }

  // src/content/hub.js
  var noop = () => {
  };
  var hub = {
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
    cancelCapture: noop,
    refreshHot: noop
  };

  // src/content/util.js
  var clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  var easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  var easeOutBack = (t) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  };
  function rectOf(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  }
  function intersect(a, b) {
    const x = Math.max(a.x, b.x);
    const y = Math.max(a.y, b.y);
    const r = Math.min(a.x + a.w, b.x + b.w);
    const bt = Math.min(a.y + a.h, b.y + b.h);
    return r > x && bt > y ? { x, y, w: r - x, h: bt - y } : null;
  }
  function overlaps(a, b) {
    return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  }
  function containsRect(outer, inner, tol = 0) {
    return inner.x >= outer.x - tol && inner.y >= outer.y - tol && inner.x + inner.w <= outer.x + outer.w + tol && inner.y + inner.h <= outer.y + outer.h + tol;
  }
  function containsPt(r, x, y, tol = 0) {
    return x >= r.x - tol && x <= r.x + r.w + tol && y >= r.y - tol && y <= r.y + r.h + tol;
  }
  function union(rects) {
    if (!rects.length) return null;
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const r of rects) {
      x1 = Math.min(x1, r.x);
      y1 = Math.min(y1, r.y);
      x2 = Math.max(x2, r.x + r.w);
      y2 = Math.max(y2, r.y + r.h);
    }
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }
  function sameRect(a, b, tol = 0.75) {
    return Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol && Math.abs(a.w - b.w) <= tol && Math.abs(a.h - b.h) <= tol;
  }
  function normRect(x1, y1, x2, y2) {
    return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
  }
  var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  var nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
  async function frames(n = 2) {
    for (let i = 0; i < n; i++) await nextFrame();
  }
  function isOurs(node) {
    if (!node) return false;
    if (node === app.host) return true;
    try {
      return node.getRootNode && node.getRootNode() === app.shadow;
    } catch {
      return false;
    }
  }
  function deepContains(a, b) {
    for (let n = b; n; n = n.parentNode || n.nodeType === 11 && n.host || null) if (n === a) return true;
    return false;
  }
  function isRootish(el) {
    return el === document.documentElement || el === document.body;
  }
  function parentOf(el) {
    if (el.parentElement) return el.parentElement;
    const root = el.getRootNode ? el.getRootNode() : null;
    return root && root.host ? root.host : null;
  }
  function parentPick(el) {
    const r = rectOf(el);
    let p = parentOf(el);
    while (p && !isRootish(p)) {
      const pr = rectOf(p);
      if (!sameRect(pr, r, 0.6) && pr.w >= 2 && pr.h >= 2) return p;
      p = parentOf(p);
    }
    return null;
  }
  function pageIsTyping() {
    let a = document.activeElement;
    while (a && a.shadowRoot && a.shadowRoot.activeElement) a = a.shadowRoot.activeElement;
    if (!a || a === app.host) return false;
    if (a.isContentEditable) return true;
    const tag = a.tagName;
    if (tag === "TEXTAREA") return true;
    if (tag === "SELECT") return true;
    if (tag === "INPUT") {
      const t = (a.getAttribute("type") || "text").toLowerCase();
      return !["button", "checkbox", "radio", "submit", "reset", "range", "color", "file", "image"].includes(t);
    }
    return false;
  }
  var KIND = {
    a: "Link",
    button: "Button",
    img: "Image",
    picture: "Image",
    svg: "Icon",
    video: "Video",
    canvas: "Canvas",
    iframe: "Embed",
    input: "Input",
    textarea: "Text box",
    select: "Dropdown",
    label: "Label",
    h1: "Heading",
    h2: "Heading",
    h3: "Heading",
    h4: "Heading",
    h5: "Heading",
    h6: "Heading",
    p: "Paragraph",
    span: "Text",
    strong: "Text",
    em: "Text",
    small: "Text",
    nav: "Nav",
    header: "Header",
    footer: "Footer",
    main: "Main",
    section: "Section",
    article: "Article",
    aside: "Sidebar",
    form: "Form",
    ul: "List",
    ol: "List",
    li: "List item",
    table: "Table",
    tr: "Table row",
    td: "Table cell",
    th: "Table cell",
    figure: "Figure",
    hr: "Divider"
  };
  function describe(el) {
    if (!el || el.nodeType !== 1) return "Element";
    if (el.hasAttribute && el.hasAttribute("data-pd-group")) return "New group";
    const tag = el.tagName.toLowerCase();
    let kind = KIND[tag];
    if (!kind) {
      let display = "";
      try {
        display = getComputedStyle(el).display;
      } catch {
      }
      if (display.includes("flex")) kind = "Flex box";
      else if (display.includes("grid")) kind = "Grid";
      else kind = "Box";
    }
    const label = el.getAttribute("aria-label") || el.getAttribute("alt") || el.getAttribute("title") || el.getAttribute("placeholder") || "";
    let text = label.trim();
    if (!text) {
      const raw = (el.innerText || el.textContent || "").trim().replace(/\s+/g, " ");
      text = raw;
    }
    if (text.length > 34) text = text.slice(0, 32).trim() + "…";
    return text ? `${kind} "${text}"` : kind;
  }
  var UTIL_RE = /^-?(m|mx|my|mt|mr|mb|ml|ms|me|p|px|py|pt|pr|pb|pl|ps|pe|w|h|min|max|size|gap|space|text|bg|from|via|to|flex|grid|col|row|items|justify|content|self|place|order|rounded|border|divide|ring|outline|shadow|font|leading|tracking|line|decoration|underline|overflow|z|top|left|right|bottom|inset|translate|scale|rotate|skew|origin|transition|duration|ease|delay|animate|opacity|blur|backdrop|fill|stroke|object|aspect|basis|grow|shrink|cursor|select|pointer|sr|whitespace|break|truncate|list|appearance|columns|float|clear|isolation|mix|filter|drop|invert|sepia|saturate|hue|contrast|brightness|grayscale|accent|caret|scroll|snap|touch|will|tabular|antialiased|uppercase|lowercase|capitalize|italic|not|visible|invisible|collapse|static|fixed|absolute|relative|sticky|block|inline|hidden|contents|table|container|prose|dark|sm|md|lg|xl|2xl|group|peer)(-|$)/;
  function nameClasses(el) {
    return [...el.classList].filter(
      (c) => /^[A-Za-z_][\w-]*$/.test(c) && c.length <= 32 && !UTIL_RE.test(c) && !/\d{3,}/.test(c)
    );
  }
  function selectorFor(el) {
    if (!el || el.nodeType !== 1) return "";
    const idOk = (id) => id && /^[A-Za-z][\w-]*$/.test(id) && id.length < 40;
    if (idOk(el.id)) return "#" + el.id;
    const parts = [];
    let cur2 = el;
    while (cur2 && cur2.nodeType === 1 && parts.length < 4 && !isRootish(cur2)) {
      if (idOk(cur2.id)) {
        parts.unshift("#" + cur2.id);
        break;
      }
      let part = cur2.tagName.toLowerCase();
      if (cur2.hasAttribute("data-pd-group")) part = "div[data-pd-group]";
      const cls = nameClasses(cur2).slice(0, 2);
      if (cls.length) part += "." + cls.join(".");
      const parent = cur2.parentElement;
      if (parent) {
        const same2 = [...parent.children].filter((s) => s.tagName === cur2.tagName);
        if (same2.length > 1 && !cls.length) part += `:nth-of-type(${same2.indexOf(cur2) + 1})`;
      }
      parts.unshift(part);
      cur2 = cur2.parentElement;
    }
    return parts.join(" > ");
  }
  function cssPx(v) {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }

  // src/content/collect.js
  var SKIP = /* @__PURE__ */ new Set([
    "SCRIPT",
    "STYLE",
    "LINK",
    "META",
    "HEAD",
    "TITLE",
    "NOSCRIPT",
    "TEMPLATE",
    "BR",
    "WBR",
    "PARAM",
    "SOURCE",
    "TRACK",
    "BASE",
    "DATALIST",
    "OPTION",
    "OPTGROUP",
    "AREA",
    "MAP"
  ]);
  var LEAF = /* @__PURE__ */ new Set(["svg", "SVG", "IFRAME", "VIDEO", "AUDIO", "CANVAS", "IMG", "PICTURE", "INPUT", "TEXTAREA", "SELECT", "OBJECT", "EMBED", "math", "MATH"]);
  var MAX = 5e3;
  function childrenOf(el) {
    if (el.shadowRoot) return el.shadowRoot.children;
    if (el.tagName === "SLOT" && el.assignedElements) {
      const a = el.assignedElements({ flatten: true });
      return a.length ? a : el.children;
    }
    return el.children;
  }
  function hasOwnText(el) {
    const nodes = el.childNodes;
    const n = Math.min(nodes.length, 24);
    for (let i = 0; i < n; i++) {
      const c = nodes[i];
      if (c.nodeType === 3 && c.nodeValue && c.nodeValue.trim()) return true;
    }
    return false;
  }
  function textBox(el, r) {
    try {
      const range = document.createRange();
      range.selectNodeContents(el);
      const rects = range.getClientRects();
      let x1 = Infinity;
      let y1 = Infinity;
      let x2 = -Infinity;
      let y2 = -Infinity;
      const n = Math.min(rects.length, 400);
      for (let i = 0; i < n; i++) {
        const q = rects[i];
        if (q.width < 0.5 || q.height < 0.5) continue;
        if (q.left < x1) x1 = q.left;
        if (q.top < y1) y1 = q.top;
        if (q.right > x2) x2 = q.right;
        if (q.bottom > y2) y2 = q.bottom;
      }
      if (!Number.isFinite(x1)) return null;
      return { x: x1 - r.left, y: y1 - r.top, w: x2 - x1, h: y2 - y1 };
    } catch {
      return null;
    }
  }
  function opaqueBg(cs) {
    if (cs.backgroundImage && cs.backgroundImage !== "none") return true;
    if (cs.backdropFilter && cs.backdropFilter !== "none") return true;
    const m = /rgba?\(([^)]+)\)/.exec(cs.backgroundColor || "");
    if (!m) return false;
    const parts = m[1].split(/[\s,/]+/).filter(Boolean);
    const a = parts.length >= 4 ? parseFloat(parts[3]) * (parts[3].endsWith("%") ? 0.01 : 1) : 1;
    return a >= 0.5;
  }
  function inFront(o) {
    const x1 = Math.max(o.x, 0);
    const x2 = Math.min(o.x + o.w, window.innerWidth);
    const y1 = Math.max(o.y, 0);
    const y2 = Math.min(o.y + o.h, window.innerHeight);
    if (x2 - x1 < 4 || y2 - y1 < 4) return true;
    const ym = (y1 + y2) / 2;
    let front = 0;
    for (const fx of [0.5, 0.2, 0.8]) {
      let top = null;
      try {
        for (const e of document.elementsFromPoint(x1 + (x2 - x1) * fx, ym)) {
          if (e !== app.host && !isOurs(e)) {
            top = e;
            break;
          }
        }
      } catch {
      }
      if (!top || deepContains(o.el, top) || deepContains(top, o.el)) front++;
    }
    return front >= 2;
  }
  function collect() {
    const t0 = performance.now();
    app.rootFS = cssPx(getComputedStyle(document.documentElement).fontSize) || 16;
    const out = [];
    const clips = [];
    const contentBox2 = /* @__PURE__ */ new Map();
    const sx = window.scrollX;
    const sy = window.scrollY;
    let truncated = false;
    let texts = 0;
    const occluders = [];
    const vh = window.innerHeight;
    const band = document.getElementsByTagName("*").length > 2500 ? { top: sy - vh * 1.5, bottom: sy + vh * 2.5 } : null;
    const parentContent = (p) => {
      if (!p || p.nodeType !== 1) return { pw: app.vw, ph: app.vh };
      let v = contentBox2.get(p);
      if (v) return v;
      try {
        const cs = getComputedStyle(p);
        const pw = p.clientWidth - cssPx(cs.paddingLeft) - cssPx(cs.paddingRight);
        const ph = p.clientHeight - cssPx(cs.paddingTop) - cssPx(cs.paddingBottom);
        v = { pw: pw > 0 ? pw : app.vw, ph: ph > 0 ? ph : app.vh };
      } catch {
        v = { pw: app.vw, ph: app.vh };
      }
      contentBox2.set(p, v);
      return v;
    };
    const visit = (el, ctx) => {
      if (out.length >= MAX) {
        truncated = true;
        return;
      }
      if (el === app.host || el.nodeType !== 1) return;
      const tag = el.tagName;
      if (SKIP.has(tag)) return;
      let cs;
      try {
        cs = getComputedStyle(el);
      } catch {
        return;
      }
      const display = cs.display;
      if (display === "none") return;
      if (display === "contents") {
        for (const k of childrenOf(el)) visit(k, ctx);
        return;
      }
      if (cs.opacity === "0") return;
      const isRoot = el === document.documentElement || el === document.body;
      const r = el.getBoundingClientRect();
      const pos = cs.position;
      const fixed = pos === "fixed";
      const dynamic = ctx.dynamic || fixed || pos === "sticky";
      if (band && !isRoot && !dynamic) {
        const top = r.top + sy;
        if (top > band.bottom || top + r.height < band.top && top + (el.scrollHeight || 0) < band.top) return;
      }
      const clip = fixed ? null : ctx.clip;
      let cand = null;
      if (!isRoot && cs.visibility === "visible" && r.width >= 2 && r.height >= 2 && app.hiddenForCapture.has(el) === false) {
        const parent = ctx.cand;
        const dup = !!parent && Math.abs(parent.x - r.left) < 0.75 && Math.abs(parent.y - r.top) < 0.75 && Math.abs(parent.w - r.width) < 0.75 && Math.abs(parent.h - r.height) < 0.75;
        const brs = cs.borderTopLeftRadius;
        let rad = 0;
        if (brs && brs !== "0px") {
          const v = parseFloat(brs);
          rad = brs.includes("%") ? v / 100 * Math.min(r.width, r.height) : v;
        }
        rad = Math.min(rad || 0, Math.min(r.width, r.height) / 2);
        const circle2 = rad >= Math.min(r.width, r.height) / 2 - 0.5 && Math.abs(r.width - r.height) < 1.5 && r.width >= 6;
        const pc = parentContent(el.parentElement);
        cand = {
          el,
          tag: tag.toLowerCase(),
          depth: dup ? parent.depth : parent ? parent.depth + 1 : 0,
          parent,
          dup,
          dynamic,
          clip,
          x: r.left,
          y: r.top,
          w: r.width,
          h: r.height,
          dx: r.left + sx,
          dy: r.top + sy,
          rad,
          circle: circle2,
          fs: cssPx(cs.fontSize),
          pw: pc.pw,
          ph: pc.ph,
          flex: display === "flex" || display === "inline-flex",
          grid: display === "grid" || display === "inline-grid",
          dir: cs.flexDirection,
          gapX: cssPx(cs.columnGap),
          gapY: cssPx(cs.rowGap),
          text: hasOwnText(el),
          textR: null,
          occ: ctx.occ || null,
          isOcc: false,
          at: 0
        };
        if (cand.text && texts++ < 2500) cand.textR = textBox(el, r);
        if ((fixed || pos === "sticky" || ctx.inFixed) && !ctx.occ && r.width >= 8 && r.height >= 8 && opaqueBg(cs)) {
          cand.isOcc = true;
          occluders.push(cand);
        }
        out.push(cand);
      }
      if (LEAF.has(tag)) return;
      let nclip = clip;
      let childDynamic = dynamic;
      const ox = cs.overflowX;
      const oy = cs.overflowY;
      const scrollish = ox === "auto" || ox === "scroll" || oy === "auto" || oy === "scroll";
      if (isRoot) {
        if (scrollish && (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1) && el.clientHeight < window.innerHeight + 2) {
          childDynamic = true;
        }
      } else if (ox !== "visible" || oy !== "visible") {
        const k = {
          el,
          parent: clip,
          dynamic,
          x: r.left,
          y: r.top,
          w: r.width,
          h: r.height,
          dx: r.left + sx,
          dy: r.top + sy,
          frame: -1,
          vis: null
        };
        clips.push(k);
        nclip = k;
        if (scrollish && (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1)) childDynamic = true;
      }
      const nctx = {
        cand: cand ? cand.dup ? cand.parent : cand : ctx.cand,
        dynamic: childDynamic,
        clip: nclip,
        occ: cand && cand.isOcc ? cand : ctx.occ,
        inFixed: ctx.inFixed || fixed || pos === "sticky"
      };
      for (const k of childrenOf(el)) visit(k, nctx);
    };
    const start = document.documentElement;
    if (start) {
      for (const k of start.children) visit(k, { cand: null, dynamic: false, clip: null, occ: null, inFixed: false });
    }
    const behind = /* @__PURE__ */ new Set();
    for (const o of occluders) if (!inFront(o)) behind.add(o);
    if (behind.size) {
      for (const o of behind) o.isOcc = false;
      for (const c of out) if (c.occ && behind.has(c.occ)) c.occ = null;
    }
    const now = performance.now();
    const fresh = out.filter((c) => !app.revealed.has(c.el));
    if (fresh.length && (app.state.capturing || app.reduceMotion)) {
      for (const c of fresh) app.revealed.set(c.el, now - 5e3);
    } else if (fresh.length && app.wave && now < app.wave.grow) {
      for (const c of fresh) app.revealed.set(c.el, WAVE);
    } else if (fresh.length) {
      const order = fresh.slice().sort((a, b) => a.depth - b.depth || a.dy - b.dy || a.dx - b.dx);
      const total = 260;
      const step = clamp(total / order.length, 0.5, 12);
      order.forEach((c, i) => app.revealed.set(c.el, now + Math.min(i * step, total)));
    }
    for (const c of out) c.at = app.revealed.get(c.el) ?? now;
    out.sort((a, b) => a.depth - b.depth);
    app.cands = out;
    app.clips = clips;
    app.occluders = behind.size ? occluders.filter((o) => !behind.has(o)) : occluders;
    app.truncated = truncated;
    app.band = band;
    app.candByEl = /* @__PURE__ */ new WeakMap();
    for (const c of out) app.candByEl.set(c.el, c);
    app.needCollect = false;
    app.needFull = false;
    app.lastCollect = performance.now();
    app.collectMs = app.lastCollect - t0;
    return out;
  }
  function measure(full) {
    const sx = window.scrollX;
    const sy = window.scrollY;
    const all = full || app.needFull || app.live > 0;
    for (const c of app.cands) {
      if (all || c.dynamic) {
        if (!c.el.isConnected) {
          c.w = 0;
          c.h = 0;
          continue;
        }
        const r = c.el.getBoundingClientRect();
        c.x = r.left;
        c.y = r.top;
        c.w = r.width;
        c.h = r.height;
        c.dx = r.left + sx;
        c.dy = r.top + sy;
      } else {
        c.x = c.dx - sx;
        c.y = c.dy - sy;
      }
    }
    for (const k of app.clips) {
      if (all || k.dynamic) {
        if (!k.el.isConnected) continue;
        const r = k.el.getBoundingClientRect();
        k.x = r.left;
        k.y = r.top;
        k.w = r.width;
        k.h = r.height;
        k.dx = r.left + sx;
        k.dy = r.top + sy;
      } else {
        k.x = k.dx - sx;
        k.y = k.dy - sy;
      }
    }
    if (all) {
      app.needFull = false;
      app.lastFull = performance.now();
    }
    app.frame++;
  }
  var NOCLIP = null;
  function clipRect(k) {
    if (!k) return NOCLIP;
    if (k.frame === app.frame) return k.vis;
    let r = { x: k.x, y: k.y, w: k.w, h: k.h };
    const p = clipRect(k.parent);
    if (p !== NOCLIP) {
      if (p === false) r = false;
      else {
        const x = Math.max(r.x, p.x);
        const y = Math.max(r.y, p.y);
        const x2 = Math.min(r.x + r.w, p.x + p.w);
        const y2 = Math.min(r.y + r.h, p.y + p.h);
        r = x2 > x && y2 > y ? { x, y, w: x2 - x, h: y2 - y } : false;
      }
    }
    k.frame = app.frame;
    k.vis = r;
    return r;
  }

  // src/content/units.js
  var UNITS = ["vw/vh", "px", "%", "rem", "em", "pt", "tw"];
  function trim(n, d) {
    const f = Math.pow(10, d);
    return String(Math.round(n * f) / f);
  }
  function smart(n) {
    return Math.abs(n) >= 10 ? String(Math.round(n)) : trim(n, 1);
  }
  function fmt(px, axis, ctx = null, unit = app.state.unit) {
    const vw = app.vw;
    const vh = app.vh;
    switch (unit) {
      case "vw/vh":
        return axis === "w" ? smart(px / vw * 100) + "vw" : smart(px / vh * 100) + "vh";
      case "px":
        return Math.round(px) + "px";
      case "%": {
        const base = axis === "w" ? ctx && ctx.pw || vw : ctx && ctx.ph || vh;
        return smart(px / base * 100) + "%";
      }
      case "rem":
        return trim(px / app.rootFS, 2) + "rem";
      case "em":
        return trim(px / (ctx && ctx.fs || app.rootFS), 2) + "em";
      case "pt":
        return smart(px * 0.75) + "pt";
      case "tw": {
        const n = px / 4;
        const q = Math.round(n * 2) / 2;
        const prefix = axis === "w" ? "w-" : "h-";
        return Math.abs(n - q) < 0.13 ? prefix + trim(q, 1) : prefix + "[" + Math.round(px) + "px]";
      }
      default:
        return Math.round(px) + "px";
    }
  }
  function fmtGap(px, axis, ctx = null, unit = app.state.unit) {
    if (unit === "tw") {
      const n = px / 4;
      const q = Math.round(n * 2) / 2;
      return Math.abs(n - q) < 0.13 ? trim(q, 1) : "[" + Math.round(px) + "px]";
    }
    return fmt(px, axis, ctx, unit);
  }
  function both(px, axis, ctx = null) {
    const p = Math.round(px) + "px";
    if (app.state.unit === "px") return p;
    return `${p} (${fmt(px, axis, ctx)})`;
  }
  function unitStep(axis, ctx = null, unit = app.state.unit) {
    switch (unit) {
      case "vw/vh":
        return axis === "w" ? app.vw / 100 : app.vh / 100;
      case "%":
        return (axis === "w" ? ctx && ctx.pw || app.vw : ctx && ctx.ph || app.vh) / 100;
      case "rem":
        return app.rootFS / 4;
      case "em":
        return (ctx && ctx.fs || app.rootFS) / 4;
      case "pt":
        return 4 / 3;
      case "tw":
        return 4;
      default:
        return 1;
    }
  }
  function snapToUnit(px, axis, ctx = null) {
    const s = unitStep(axis, ctx);
    if (s <= 0) return px;
    const v = Math.round(px / s) * s;
    return v > 0 ? v : s;
  }
  function parseDim(str, axis, ctx = null) {
    let t = String(str).trim().toLowerCase().replace(/^(w|h|size)-/, "");
    let tw2 = false;
    const br = t.match(/^\[(.*)\]$/);
    if (br) t = br[1];
    else if (/^\d*\.?\d+$/.test(t) && app.state.unit === "tw") tw2 = true;
    const m = t.match(/^(-?\d*\.?\d+)\s*([a-z%]*)$/);
    if (!m) return null;
    const n = parseFloat(m[1]);
    let u = m[2];
    if (!u) {
      u = app.state.unit;
      if (u === "vw/vh") u = axis === "w" ? "vw" : "vh";
      if (u === "tw") u = tw2 ? "tw" : "px";
    }
    switch (u) {
      case "px":
        return n;
      case "vw":
        return n / 100 * app.vw;
      case "vh":
        return n / 100 * app.vh;
      case "%":
        return n / 100 * (axis === "w" ? ctx && ctx.pw || app.vw : ctx && ctx.ph || app.vh);
      case "rem":
        return n * app.rootFS;
      case "em":
        return n * (ctx && ctx.fs || app.rootFS);
      case "pt":
        return n / 0.75;
      case "tw":
        return n * 4;
      default:
        return null;
    }
  }
  function rawValue(px, axis, ctx = null) {
    if (app.state.unit === "tw") {
      const n = px / 4;
      const q = Math.round(n * 2) / 2;
      return Math.abs(n - q) < 0.13 ? trim(q, 1) : Math.round(px) + "px";
    }
    const s = fmt(px, axis, ctx);
    const m = s.match(/^-?\d*\.?\d+/);
    return m ? m[0] : String(Math.round(px));
  }

  // src/content/shapes.js
  var nextId = 1;
  function space() {
    return app.state.canvasMode ? "canvas" : "page";
  }
  function activeShapes() {
    return app.shapes[space()];
  }
  function createShape(vr, sp = space()) {
    const s = {
      id: nextId++,
      space: sp,
      x: vr.x + (sp === "page" ? window.scrollX : 0),
      y: vr.y + (sp === "page" ? window.scrollY : 0),
      w: vr.w,
      h: vr.h,
      born: performance.now()
    };
    app.shapes[sp].push(s);
    requestRender();
    return s;
  }
  function shapeRect(s) {
    if (s.space === "page") return { x: s.x - window.scrollX, y: s.y - window.scrollY, w: s.w, h: s.h };
    return { x: s.x, y: s.y, w: s.w, h: s.h };
  }
  function setShapeRect(s, r) {
    s.x = r.x + (s.space === "page" ? window.scrollX : 0);
    s.y = r.y + (s.space === "page" ? window.scrollY : 0);
    s.w = Math.max(1, r.w);
    s.h = Math.max(1, r.h);
    requestRender();
  }
  function removeShape(s) {
    const list = app.shapes[s.space];
    const i = list.indexOf(s);
    if (i >= 0) list.splice(i, 1);
    requestRender();
  }
  function shapeAt(x, y, tol = 3) {
    const list = activeShapes();
    for (let i = list.length - 1; i >= 0; i--) {
      const r = shapeRect(list[i]);
      if (x >= r.x - tol && x <= r.x + r.w + tol && y >= r.y - tol && y <= r.y + r.h + tol) return list[i];
    }
    return null;
  }
  function cloneShapes() {
    return {
      page: app.shapes.page.map((s) => ({ ...s })),
      canvas: app.shapes.canvas.map((s) => ({ ...s })),
      nextId
    };
  }
  function restoreShapes(snap2) {
    for (const sp of ["page", "canvas"]) {
      const byId = new Map(app.shapes[sp].map((s) => [s.id, s]));
      app.shapes[sp] = snap2[sp].map((d) => {
        const s = byId.get(d.id) || {};
        return Object.assign(s, d);
      });
    }
    requestRender();
  }
  function findShapeById(id) {
    return app.shapes.page.find((s) => s.id === id) || app.shapes.canvas.find((s) => s.id === id) || null;
  }
  function duplicateShape(s, dx = 16, dy = 16) {
    const r = shapeRect(s);
    return createShape({ x: r.x + dx, y: r.y + dy, w: r.w, h: r.h }, s.space);
  }

  // src/content/edits.js
  var recs = /* @__PURE__ */ new Map();
  var seq = 0;
  var IMP = "important";
  var r2 = (n) => Math.round(n * 100) / 100;
  function nextFlowSibling(el) {
    let n = el.nextElementSibling;
    while (n) {
      if (n !== app.host) {
        try {
          const cs = getComputedStyle(n);
          if (cs.display !== "none" && cs.position !== "absolute" && cs.position !== "fixed") return n;
        } catch {
        }
      }
      n = n.nextElementSibling;
    }
    return null;
  }
  function getRec(el) {
    return recs.get(el) || null;
  }
  function ensureRec(el) {
    let rec = recs.get(el);
    if (rec) return rec;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const parent = el.parentElement;
    const pcs = parent ? getComputedStyle(parent) : null;
    const display = cs.display;
    const position = cs.position;
    const pDisplay = pcs ? pcs.display : "block";
    const outOfFlow = position === "absolute" || position === "fixed";
    const tablePart = /^table-(cell|row|row-group|header-group|footer-group|column|column-group|caption)$/.test(display);
    const parentFlexGrid = /flex|grid/.test(pDisplay);
    rec = {
      el,
      id: ++seq,
      origStyle: el.getAttribute("style"),
      origParent: el.parentNode,
      origNext: el.nextSibling,
      orig: { x: r.left + window.scrollX, y: r.top + window.scrollY, w: r.width, h: r.height },
      o: {
        display,
        position,
        translate: cs.translate,
        left: cs.left,
        top: cs.top,
        mr: cssPx(cs.marginRight),
        mb: cssPx(cs.marginBottom),
        flexDirection: cs.flexDirection,
        flexWrap: cs.flexWrap,
        justifyContent: cs.justifyContent,
        alignItems: cs.alignItems,
        gap: cs.columnGap,
        rowGap: cs.rowGap,
        pDisplay
      },
      inFlow: !outOfFlow && !tablePart,
      flexItem: parentFlexGrid && !outOfFlow,
      inline: display === "inline",
      blockFlow: !parentFlexGrid && !display.startsWith("inline") && cs.float === "none" && !outOfFlow,
      tx: 0,
      ty: 0,
      w: null,
      h: null,
      mr: null,
      mb: null,
      deleted: false,
      collapsed: false,
      css: {},
      created: false,
      name: describe(el),
      selector: selectorFor(el)
    };
    recs.set(el, rec);
    return rec;
  }
  function markCreated(el) {
    const rec = ensureRec(el);
    rec.created = true;
    rec.origStyle = null;
    rec.origParent = null;
    rec.origNext = null;
    return rec;
  }
  function composeTranslate(base, tx, ty) {
    const x = r2(tx);
    const y = r2(ty);
    if (!base || base === "none") return `${x}px ${y}px`;
    const parts = base.trim().split(/\s+/);
    const bx = parts[0] || "0px";
    const by = parts[1] || "0px";
    const bz = parts[2];
    return `calc(${bx} + ${x}px) calc(${by} + ${y}px)${bz ? " " + bz : ""}`;
  }
  function applyRec(rec) {
    const el = rec.el;
    if (rec.origStyle == null) el.removeAttribute("style");
    else el.style.cssText = rec.origStyle;
    const s = el.style;
    const set = (p, v) => s.setProperty(p, v, IMP);
    const moved = Math.abs(rec.tx) > 4e-3 || Math.abs(rec.ty) > 4e-3;
    const sized = rec.w != null || rec.h != null;
    if (moved) {
      if (rec.inline && !sized && (rec.o.position === "static" || rec.o.position === "relative")) {
        const base = (v) => rec.o.position === "relative" && /px$/.test(v || "") ? parseFloat(v) : 0;
        set("position", "relative");
        set("left", r2(base(rec.o.left) + rec.tx) + "px");
        set("top", r2(base(rec.o.top) + rec.ty) + "px");
      } else {
        if (rec.inline) set("display", "inline-block");
        set("translate", composeTranslate(rec.o.translate, rec.tx, rec.ty));
      }
    }
    if (sized) {
      set("box-sizing", "border-box");
      if (rec.inline) set("display", "inline-block");
      if (rec.flexItem) {
        set("flex-grow", "0");
        set("flex-shrink", "0");
        set("flex-basis", "auto");
      }
    }
    if (rec.w != null) {
      set("width", r2(rec.w) + "px");
      set("min-width", "0px");
      set("max-width", "none");
    }
    if (rec.h != null) {
      set("height", r2(rec.h) + "px");
      set("min-height", "0px");
      set("max-height", "none");
    }
    if (rec.mr != null) set("margin-right", r2(rec.mr) + "px");
    if (rec.mb != null) set("margin-bottom", r2(rec.mb) + "px");
    for (const p in rec.css) set(p, rec.css[p]);
    if (rec.deleted && !rec.collapsed) {
      set("visibility", "hidden");
      set("pointer-events", "none");
    }
    if (rec.collapsed) set("display", "none");
  }
  function beginOp(el) {
    const rec = ensureRec(el);
    const rect = rectOf(el);
    const next = rec.inFlow ? nextFlowSibling(el) : null;
    const parent = el.parentElement;
    return {
      el,
      rec,
      start: { rect, tx: rec.tx, ty: rec.ty, w: rec.w, h: rec.h, mr: rec.mr, mb: rec.mb },
      next,
      next0: next ? rectOf(next) : null,
      parent,
      parent0: parent ? rectOf(parent) : null
    };
  }
  function moveTo(op, x, y) {
    const { rec, start } = op;
    rec.tx = start.tx + (x - start.rect.x);
    rec.ty = start.ty + (y - start.rect.y);
    applyRec(rec);
  }
  function residual(op) {
    const { next, next0, parent, parent0, start } = op;
    const ex = start.rect.x - start.tx;
    const ey = start.rect.y - start.ty;
    const er = { x: ex, y: ey, w: start.rect.w, h: start.rect.h };
    let rx = 0;
    let ry = 0;
    const p = parent && parent0 ? rectOf(parent) : null;
    if (next && next0 && next.isConnected) {
      const n = rectOf(next);
      const sameRow = next0.y < er.y + er.h - 1 && next0.x >= er.x + er.w - 1.5;
      if (sameRow) {
        rx = n.x - next0.x;
        if (p) ry = p.h - parent0.h;
      } else {
        ry = n.y - next0.y;
        if (p) rx = p.w - parent0.w;
      }
    } else if (p) {
      rx = p.w - parent0.w;
      ry = p.h - parent0.h;
    }
    return { rx, ry };
  }
  function resizeTo(op, t) {
    const { rec, el, start } = op;
    const changeW = Math.abs(t.w - start.rect.w) > 0.05;
    const changeH = Math.abs(t.h - start.rect.h) > 0.05;
    rec.w = changeW ? Math.max(1, t.w) : start.w;
    rec.h = changeH ? Math.max(1, t.h) : start.h;
    if (rec.inFlow) {
      const dW = (changeW ? rec.w : start.rect.w) - start.rect.w;
      const dH = (changeH ? rec.h : start.rect.h) - start.rect.h;
      const baseMr = start.mr != null ? start.mr : rec.o.mr;
      const baseMb = start.mb != null ? start.mb : rec.o.mb;
      rec.mr = changeW && !rec.blockFlow ? baseMr - dW : start.mr;
      rec.mb = changeH ? baseMb - dH : start.mb;
      applyRec(rec);
      for (let i = 0; i < 3; i++) {
        const { rx, ry } = residual(op);
        if (Math.abs(rx) < 0.4 && Math.abs(ry) < 0.4) break;
        if (Math.abs(rx) >= 0.4) rec.mr = (rec.mr != null ? rec.mr : rec.o.mr) - rx;
        if (Math.abs(ry) >= 0.4) rec.mb = (rec.mb != null ? rec.mb : rec.o.mb) - ry;
        applyRec(rec);
      }
    } else {
      applyRec(rec);
    }
    const now = rectOf(el);
    rec.tx += t.x - now.x;
    rec.ty += t.y - now.y;
    applyRec(rec);
    requestFull();
  }
  function setDeleted(el, on) {
    const rec = ensureRec(el);
    rec.deleted = on;
    applyRec(rec);
    requestFull();
  }
  function setCss(el, props) {
    const rec = ensureRec(el);
    for (const p in props) {
      if (props[p] == null) delete rec.css[p];
      else rec.css[p] = props[p];
    }
    applyRec(rec);
    requestFull();
  }
  function isEdited(rec) {
    return rec.created || Math.abs(rec.tx) > 0.5 || Math.abs(rec.ty) > 0.5 || rec.w != null || rec.h != null || rec.deleted || rec.collapsed || Object.keys(rec.css).length > 0 || rec.el.parentNode !== rec.origParent;
  }
  function cloneRec(rec) {
    return { ...rec, css: { ...rec.css } };
  }
  function snapshot(el) {
    const rec = recs.get(el);
    return {
      style: el.getAttribute("style"),
      parent: el.parentNode,
      next: el.nextSibling,
      rec: rec ? cloneRec(rec) : null
    };
  }
  function sameSnapshot(a, b) {
    if (a.style !== b.style || a.parent !== b.parent || a.next !== b.next) return false;
    const ra = a.rec;
    const rb = b.rec;
    if (!ra || !rb) return !ra && !rb;
    return ra.tx === rb.tx && ra.ty === rb.ty && ra.w === rb.w && ra.h === rb.h && ra.mr === rb.mr && ra.mb === rb.mb && ra.deleted === rb.deleted && ra.collapsed === rb.collapsed && JSON.stringify(ra.css) === JSON.stringify(rb.css);
  }
  function restoreDom(el, snap2) {
    if (!snap2.parent) {
      if (el.parentNode) el.parentNode.removeChild(el);
      return;
    }
    if (el.parentNode === snap2.parent && el.nextSibling === snap2.next) return;
    if (snap2.next && snap2.next.parentNode === snap2.parent) snap2.parent.insertBefore(el, snap2.next);
    else snap2.parent.appendChild(el);
  }
  function restoreState(el, snap2) {
    if (snap2.style == null) el.removeAttribute("style");
    else el.style.cssText = snap2.style;
    if (snap2.rec) recs.set(el, cloneRec(snap2.rec));
    else recs.delete(el);
  }
  function allRecs() {
    return [...recs.values()].sort((a, b) => a.id - b.id);
  }

  // src/content/history.js
  var undoStack = [];
  var redoStack = [];
  var cur = null;
  var listeners = /* @__PURE__ */ new Set();
  function onHistory(fn) {
    listeners.add(fn);
  }
  function notify() {
    for (const fn of listeners) fn();
  }
  function begin(label) {
    if (cur) commit();
    cur = { label, els: /* @__PURE__ */ new Map(), shapes: null, selBefore: app.sel.slice() };
    return cur;
  }
  function touch(el) {
    if (!cur || !el) return;
    if (!cur.els.has(el)) cur.els.set(el, { before: snapshot(el), after: null });
  }
  function touchShapes() {
    if (!cur || cur.shapes) return;
    cur.shapes = { before: cloneShapes(), after: null };
  }
  function commit() {
    if (!cur) return false;
    const t = cur;
    cur = null;
    let changed = false;
    for (const [el, e] of t.els) {
      e.after = snapshot(el);
      if (!sameSnapshot(e.before, e.after)) changed = true;
    }
    if (t.shapes) {
      t.shapes.after = cloneShapes();
      if (JSON.stringify(t.shapes.before.page) !== JSON.stringify(t.shapes.after.page) || JSON.stringify(t.shapes.before.canvas) !== JSON.stringify(t.shapes.after.canvas)) changed = true;
    }
    if (!changed) return false;
    t.selAfter = app.sel.slice();
    undoStack.push(t);
    if (undoStack.length > 200) undoStack.shift();
    redoStack.length = 0;
    notify();
    return true;
  }
  function cancel() {
    if (!cur) return;
    const t = cur;
    cur = null;
    apply(t, "before");
  }
  function apply(t, which) {
    const entries = [...t.els.entries()];
    for (let pass = 0; pass < 2; pass++) {
      for (let i = entries.length - 1; i >= 0; i--) {
        const [el, e] = entries[i];
        restoreDom(el, e[which]);
      }
    }
    for (const [el, e] of entries) restoreState(el, e[which]);
    if (t.shapes) restoreShapes(t.shapes[which]);
    const sel = which === "before" ? t.selBefore : t.selAfter || t.selBefore;
    app.sel = (sel || []).map((it) => it.kind === "shape" ? { kind: "shape", shape: findShapeById(it.shape.id) } : it).filter((it) => it.kind === "shape" ? !!it.shape : it.el.isConnected);
    requestCollect();
    requestFull();
  }
  function undo() {
    if (cur) commit();
    const t = undoStack.pop();
    if (!t) return false;
    apply(t, "before");
    redoStack.push(t);
    notify();
    return true;
  }
  function redo() {
    const t = redoStack.pop();
    if (!t) return false;
    apply(t, "after");
    undoStack.push(t);
    notify();
    return true;
  }
  function canUndo() {
    return undoStack.length > 0;
  }
  function canRedo() {
    return redoStack.length > 0;
  }

  // src/content/items.js
  var elItem = (el) => ({ kind: "el", el });
  var shapeItem = (shape) => ({ kind: "shape", shape });
  function same(a, b) {
    return !!a && !!b && a.kind === b.kind && (a.kind === "el" ? a.el === b.el : a.shape === b.shape);
  }
  function itemRect(it) {
    return it.kind === "el" ? rectOf(it.el) : shapeRect(it.shape);
  }
  function isSelected(it) {
    return app.sel.some((s) => same(s, it));
  }
  var selListeners = /* @__PURE__ */ new Set();
  function onSelection(fn) {
    selListeners.add(fn);
  }
  function setSelection(items) {
    const out = [];
    for (const it of items) {
      if (!it) continue;
      if (out.some((o) => same(o, it))) continue;
      out.push(it);
    }
    app.sel = out;
    for (const fn of selListeners) fn();
    requestRender();
  }
  function toggleSelected(it) {
    if (isSelected(it)) setSelection(app.sel.filter((s) => !same(s, it)));
    else setSelection([...app.sel, it]);
  }
  function startState(it) {
    if (it.kind === "el") {
      touch(it.el);
      const op = beginOp(it.el);
      return { it, rect: op.start.rect, op };
    }
    touchShapes();
    return { it, rect: shapeRect(it.shape) };
  }
  function applyRect(st, r, resize = null) {
    const it = st.it;
    if (it.kind === "shape") {
      setShapeRect(it.shape, r);
      return;
    }
    const isResize = resize != null ? resize : Math.abs(r.w - st.rect.w) > 0.05 || Math.abs(r.h - st.rect.h) > 0.05;
    if (isResize) resizeTo(st.op, r);
    else moveTo(st.op, r.x, r.y);
    requestFull();
  }
  function itemCtx(it) {
    if (it.kind === "shape") return { pw: app.vw, ph: app.vh, fs: app.rootFS };
    const c = app.candByEl.get(it.el);
    if (c) return c;
    const p = it.el.parentElement;
    let pw = app.vw;
    let ph = app.vh;
    if (p) {
      const cs = getComputedStyle(p);
      pw = p.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) || app.vw;
      ph = p.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) || app.vh;
    }
    let fs = app.rootFS;
    try {
      fs = parseFloat(getComputedStyle(it.el).fontSize) || fs;
    } catch {
    }
    return { pw, ph, fs };
  }

  // src/content/alike.js
  var MAX2 = 400;
  var cache = null;
  function classesOf(el) {
    return el.classList ? [...el.classList] : [];
  }
  function sigOf(el) {
    if (!el) return "";
    return el.tagName + "." + classesOf(el).sort().join(".");
  }
  function jaccard(a, b) {
    if (!a.length && !b.length) return 1;
    const B = new Set(b);
    let both2 = 0;
    for (const c of a) if (B.has(c)) both2++;
    return both2 / (a.length + b.length - both2);
  }
  function visible(el) {
    if (!el.isConnected || el === app.host || isOurs(el)) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    try {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility !== "visible") return false;
    } catch {
      return false;
    }
    return true;
  }
  function matcher(el) {
    const mine = classesOf(el);
    const named = nameClasses(el);
    if (named.length) {
      const want = named.filter((c) => !/^(is-|has-)?(active|selected|current|open|show|hover|focus|disabled|checked)$/.test(c));
      const need = want.length ? want : named;
      return (o) => {
        const cl = o.classList;
        for (const c of need) if (!cl.contains(c)) return false;
        return true;
      };
    }
    if (mine.length) {
      return (o) => jaccard(mine, classesOf(o)) >= 0.7;
    }
    const ps = sigOf(el.parentElement);
    return (o) => !o.classList.length && sigOf(o.parentElement) === ps;
  }
  function alikeOf(el) {
    if (!el || el.nodeType !== 1) return [];
    const root = el.getRootNode ? el.getRootNode() : document;
    const tag = el.tagName;
    const match = matcher(el);
    let pool;
    try {
      pool = (root.querySelectorAll ? root : document).querySelectorAll(tag.toLowerCase());
    } catch {
      pool = [el];
    }
    const found = [];
    for (const o of pool) {
      if (o.tagName !== tag) continue;
      if (o !== el && !match(o)) continue;
      if (!visible(o)) continue;
      found.push(o);
      if (found.length >= MAX2 * 2) break;
    }
    if (!found.includes(el)) found.unshift(el);
    const out = found.filter((o) => !found.some((p) => p !== o && deepContains(p, o)));
    out.sort((a, b) => {
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      return ra.top - rb.top || ra.left - rb.left;
    });
    return out.slice(0, MAX2);
  }
  function alikeCached(el) {
    if (cache && cache.el === el && cache.at === app.lastCollect) return cache.list;
    cache = { el, at: app.lastCollect, list: alikeOf(el) };
    return cache.list;
  }
  function alikeLabel(el) {
    const tag = el.tagName.toLowerCase();
    const named = nameClasses(el);
    if (named.length) return "." + named.slice(0, 2).join(".");
    if (el.classList.length) return tag + " with the same classes";
    const p = el.parentElement;
    if (p) {
      const pn = nameClasses(p);
      return `${tag} in ${p.tagName.toLowerCase()}${pn.length ? "." + pn[0] : ""}`;
    }
    return tag;
  }

  // src/content/render.js
  var FONT = '600 10px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
  var FONT_INFO = '600 10.5px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
  var CHIP_H = 14;
  var REVEAL_MS = 460;
  var PINK = "#ff2d6f";
  var BLUE_SEL = "#2563eb";
  var PURPLE_SEL = "#7c3aed";
  function selColor() {
    return app.state.mode === "change" ? PURPLE_SEL : BLUE_SEL;
  }
  var widths = /* @__PURE__ */ new Map();
  function tw(ctx, s) {
    let w = widths.get(s);
    if (w == null) {
      w = ctx.measureText(s).width;
      widths.set(s, w);
      if (widths.size > 6e3) widths.clear();
    }
    return w;
  }
  function hueFor(depth, mode) {
    const t = Math.min(depth / 7, 1);
    if (mode === "change") return [266 + 36 * t, 82, 58 + 5 * t];
    return [226 - 38 * t, 90, 48 + 6 * t];
  }
  var hsla = (c, a, dl = 0) => `hsla(${c[0]},${c[1]}%,${c[2] + dl}%,${a})`;
  var Grid = class {
    constructor(size) {
      this.s = size;
      this.m = /* @__PURE__ */ new Map();
    }
    key(i, j) {
      return (i + 2e3) * 1e5 + (j + 2e3);
    }
    cells(r, pad, fn) {
      const s = this.s;
      const x1 = Math.floor((r.x - pad) / s);
      const x2 = Math.floor((r.x + r.w + pad) / s);
      const y1 = Math.floor((r.y - pad) / s);
      const y2 = Math.floor((r.y + r.h + pad) / s);
      for (let i = x1; i <= x2; i++) for (let j = y1; j <= y2; j++) if (fn(this.key(i, j)) === true) return true;
      return false;
    }
    hits(r, pad = 1.5) {
      return this.cells(r, pad, (k) => {
        const list = this.m.get(k);
        if (!list) return false;
        for (const q of list) {
          if (r.x - pad < q.x + q.w && q.x < r.x + r.w + pad && r.y - pad < q.y + q.h && q.y < r.y + r.h + pad) return true;
        }
        return false;
      });
    }
    add(r) {
      this.cells(r, 0, (k) => {
        let list = this.m.get(k);
        if (!list) this.m.set(k, list = []);
        list.push(r);
      });
    }
    tryAdd(r, pad = 1.5) {
      if (this.hits(r, pad)) return false;
      this.add(r);
      return true;
    }
  };
  function boxPath(ctx, r, rad = 0, circle2 = false) {
    if (circle2) {
      ctx.arc(r.x + r.w / 2, r.y + r.h / 2, Math.max(0.5, r.w / 2), 0, Math.PI * 2);
    } else if (rad > 0.5 && ctx.roundRect) {
      ctx.roundRect(r.x, r.y, r.w, r.h, Math.min(rad, r.w / 2, r.h / 2));
    } else {
      ctx.rect(r.x, r.y, r.w, r.h);
    }
  }
  function grow(ctx, bp) {
    if (bp >= 1) return;
    const k = easeOutBack(bp);
    ctx.scale(Math.max(0.01, k), Math.max(0.01, 0.45 + 0.55 * Math.min(1, easeOutCubic(bp))));
  }
  function chip(ctx, r, s, bg, fg, bp = 1, border = null, tp = 1) {
    if (bp <= 0) return;
    ctx.save();
    ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
    grow(ctx, bp);
    ctx.beginPath();
    ctx.roundRect(-r.w / 2, -r.h / 2, r.w, r.h, 3.5);
    ctx.fillStyle = bg;
    ctx.fill();
    if (border) {
      ctx.lineWidth = 1;
      ctx.strokeStyle = border;
      ctx.stroke();
    }
    if (tp > 0) {
      if (tp < 1) ctx.globalAlpha *= tp;
      ctx.fillStyle = fg;
      ctx.fillText(s, 0, 0.5);
    }
    ctx.restore();
  }
  function chipV(ctx, r, s, bg, fg, bp = 1, border = null, tp = 1) {
    if (bp <= 0) return;
    ctx.save();
    ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
    ctx.rotate(Math.PI / 2);
    grow(ctx, bp);
    ctx.beginPath();
    ctx.roundRect(-r.h / 2, -r.w / 2, r.h, r.w, 3.5);
    ctx.fillStyle = bg;
    ctx.fill();
    if (border) {
      ctx.lineWidth = 1;
      ctx.strokeStyle = border;
      ctx.stroke();
    }
    if (tp > 0) {
      if (tp < 1) ctx.globalAlpha *= tp;
      ctx.fillStyle = fg;
      ctx.fillText(s, 0, 0.5);
    }
    ctx.restore();
  }
  function revealP(c, now) {
    return clamp((now - c.at) / REVEAL_MS, 0, 1);
  }
  var WAVE_MS = 760;
  var CHIP_MS = 220;
  var TEXT_MS = 240;
  var CHIP_LAG = 90;
  var TEXT_SPREAD = 200;
  var GLOW = 120;
  var waveEase = (t) => 1 - Math.pow(1 - t, 2.4);
  var waveInv = (p) => 1 - Math.pow(1 - clamp(p, 0, 1), 1 / 2.4);
  function startWave() {
    app.wave = null;
    if (app.reduceMotion) return;
    const ox = Math.max(0, app.vw - 92);
    const oy = -40;
    const maxR = Math.max(Math.hypot(ox, app.vh - oy), Math.hypot(app.vw - ox, app.vh - oy)) + GLOW;
    const t0 = performance.now();
    app.wave = { t0, ox, oy, maxR, grow: t0 + WAVE_MS, end: t0 + WAVE_MS + CHIP_LAG + CHIP_MS + TEXT_SPREAD + TEXT_MS };
    keepAnimating(app.wave.end - t0 + 120);
  }
  function waveOn(now) {
    const w = app.wave;
    return !!w && !app.state.capturing && now < w.end;
  }
  function waveR(w, now) {
    return w.maxR * waveEase(clamp((now - w.t0) / WAVE_MS, 0, 1));
  }
  function distNear(r, w) {
    const dx = Math.max(r.x - w.ox, 0, w.ox - (r.x + r.w));
    const dy = Math.max(r.y - w.oy, 0, w.oy - (r.y + r.h));
    return Math.hypot(dx, dy);
  }
  function distFar(r, w) {
    const dx = Math.max(Math.abs(r.x - w.ox), Math.abs(r.x + r.w - w.ox));
    const dy = Math.max(Math.abs(r.y - w.oy), Math.abs(r.y + r.h - w.oy));
    return Math.hypot(dx, dy);
  }
  function labelTimes(w, d) {
    const box = w.t0 + CHIP_LAG + waveInv(d / w.maxR) * WAVE_MS;
    const text = w.t0 + WAVE_MS + CHIP_LAG + CHIP_MS + d / w.maxR * TEXT_SPREAD;
    return [box, text];
  }
  function draw(now) {
    const ctx = app.ctx;
    if (!ctx) return;
    const W = app.vw;
    const H = app.vh;
    const st = app.state;
    ctx.setTransform(app.dpr, 0, 0, app.dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    let gA = 1;
    if (st.closing) gA = 1 - clamp((now - st.closeStart) / 240, 0, 1);
    ctx.globalAlpha = gA;
    ctx.font = FONT;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    app.chips = [];
    const guides = st.guides && !st.canvasMode;
    const ui = !st.capturing;
    const editing2 = st.mode === "change" || st.mode === "draw" || st.canvasMode;
    if (guides) drawGuides(ctx, now);
    if (guides && ui && !app.drag) {
      if (st.mode === "change") drawChangeHover(ctx, now);
      else drawMeasureHover(ctx, now);
    }
    if (st.mode === "change" && guides && ui) drawFlexForSelection(ctx);
    drawShapes(ctx, now, ui);
    if (ui) {
      drawSelection(ctx);
      if (editing2) {
        app.arrows = computeArrows();
        hub.refreshHot();
        drawArrows(ctx);
      } else app.arrows = [];
      drawSpacing(ctx);
      drawMarquee(ctx);
      drawPreview(ctx);
      drawDistancesForActive(ctx);
      drawSnapLines(ctx);
    } else {
      app.arrows = [];
    }
    drawPulses(ctx, now);
    ctx.globalAlpha = 1;
  }
  function drawGuides(ctx, now) {
    const W = app.vw;
    const H = app.vh;
    const change = app.state.mode === "change";
    const mode = change ? "change" : "measure";
    const fill = app.state.fill;
    const vis = [];
    const occ = [];
    for (const o of app.occluders || []) {
      if (o.w < 1 || o.h < 1 || o.x > W || o.y > H || o.x + o.w < 0 || o.y + o.h < 0) continue;
      if (app.hiddenForCapture.size && app.hiddenForCapture.has(o.el)) continue;
      occ.push(o);
    }
    app.occRects = occ;
    let occPath = null;
    const w = waveOn(now) ? app.wave : null;
    const wr = w ? waveR(w, now) : 0;
    let glow = null;
    if (w && wr < w.maxR - 1) {
      glow = ctx.createRadialGradient(w.ox, w.oy, Math.max(0, wr - GLOW), w.ox, w.oy, Math.max(1, wr));
      glow.addColorStop(0, "rgba(110,215,255,0)");
      glow.addColorStop(0.62, "rgba(120,220,255,0.28)");
      glow.addColorStop(0.93, "rgba(225,248,255,0.9)");
      glow.addColorStop(1, "rgba(255,255,255,1)");
    }
    for (const c of app.cands) {
      if (c.dup || c.w < 1 || c.h < 1) continue;
      if (c.x > W || c.y > H || c.x + c.w < 0 || c.y + c.h < 0) continue;
      if (app.hiddenForCapture.size && app.hiddenForCapture.has(c.el)) continue;
      const clip = c.clip ? clipRect(c.clip) : null;
      if (clip === false) continue;
      if (clip && (c.x >= clip.x + clip.w || c.y >= clip.y + clip.h || c.x + c.w <= clip.x || c.y + c.h <= clip.y)) continue;
      const under = occ.length && !c.isOcc && !c.occ ? occ.filter((o) => overlapsR(o, c)) : null;
      if (under && under.some((o) => o.x <= c.x && o.y <= c.y && o.x + o.w >= c.x + c.w && o.y + o.h >= c.y + c.h)) continue;
      const hidden = under && under.length ? under : null;
      let e = 1;
      let fp = 1;
      let cut = false;
      let lit = false;
      const byWave = c.at === WAVE && !!w;
      if (byWave) {
        const dn = distNear(c, w);
        if (dn > wr) {
          vis.push({ c, e: 0, clip, under: hidden, show: false, wave: true });
          continue;
        }
        const df = distFar(c, w);
        cut = df > wr;
        lit = !!glow && df > wr - GLOW;
        fp = clamp((wr - dn) / (df - dn + 220), 0, 1);
      } else if (c.at !== WAVE) {
        const p = revealP(c, now);
        if (p <= 0) {
          vis.push({ c, e: 0, clip, under: hidden, show: false });
          continue;
        }
        e = easeOutCubic(p);
        fp = clamp((e - 0.2) / 0.8, 0, 1);
      }
      const col = hueFor(c.depth, mode);
      const clipped = clip && !(c.x >= clip.x && c.y >= clip.y && c.x + c.w <= clip.x + clip.w && c.y + c.h <= clip.y + clip.h);
      const saved = clipped || hidden || cut;
      if (saved) {
        ctx.save();
        if (clipped) {
          ctx.beginPath();
          ctx.rect(clip.x, clip.y, clip.w, clip.h);
          ctx.clip();
        }
        if (hidden) {
          if (!occPath) {
            occPath = new Path2D();
            occPath.rect(-10, -10, W + 20, H + 20);
            for (const o of occ) occPath.rect(o.x, o.y, o.w, o.h);
          }
          ctx.clip(occPath, "evenodd");
        }
      }
      ctx.beginPath();
      boxPath(ctx, c, c.rad, c.circle);
      if (fill > 1e-3 && fp > 0) {
        ctx.fillStyle = hsla(col, fill * fp);
        ctx.fill();
      }
      if (cut) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(w.ox, w.oy, wr, 0, Math.PI * 2);
        ctx.clip();
        ctx.beginPath();
        boxPath(ctx, c, c.rad, c.circle);
      }
      const op = byWave ? 1 : clamp(e / 0.72, 0, 1);
      if (op < 1) {
        const per = 2 * (c.w + c.h);
        ctx.setLineDash([per * op, per + 20]);
      } else if (change && (c.flex || c.grid)) ctx.setLineDash([5, 3]);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = hsla(col, change ? 0.5 : 0.85);
      ctx.stroke();
      ctx.setLineDash([]);
      if (lit) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = glow;
        ctx.stroke();
      }
      if (cut) ctx.restore();
      if (saved) ctx.restore();
      vis.push({ c, e, clip, under: hidden, show: true, wave: byWave });
    }
    drawLabels(ctx, vis, mode, now, w);
  }
  function overlapsR(a, b) {
    return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  }
  function drawLabels(ctx, vis, mode, now, w) {
    const grid = new Grid(48);
    if (app.uiRect) grid.tryAdd(app.uiRect, 0);
    const view = { x: 0, y: 0, w: app.vw, h: app.vh };
    const words = new Grid(48);
    for (const v of vis) {
      const T = v.c.textR;
      if (!T) continue;
      const t = intersect({ x: v.c.x + T.x, y: v.c.y + T.y, w: T.w, h: T.h }, v.clip || view);
      if (t) words.add(t);
    }
    ctx.font = FONT;
    const prog = (v, r) => {
      if (v.wave && w) {
        const [tb, tt] = labelTimes(w, Math.hypot(r.x + r.w / 2 - w.ox, r.y + r.h / 2 - w.oy));
        return [clamp((now - tb) / CHIP_MS, 0, 1), clamp((now - tt) / TEXT_MS, 0, 1)];
      }
      if (!v.show) return [0, 0];
      return [clamp((v.e - 0.42) / 0.34, 0, 1), clamp((v.e - 0.7) / 0.3, 0, 1)];
    };
    for (const v of vis) {
      const c = v.c;
      let bound = intersect(c, view);
      if (bound && v.clip) bound = intersect(bound, v.clip);
      if (!bound) continue;
      const col = hueFor(c.depth, mode);
      const a = mode === "change" ? 0.8 : 0.95;
      const bg = hsla(col, a, -8);
      const fg = "rgba(255,255,255,1)";
      const put = (vertical, r, s) => {
        const [bp, tp] = prog(v, r);
        if (bp <= 0) return;
        const b = tp >= 1 ? bg : hsla(col, a * (0.5 + 0.5 * tp), -8 + 14 * (1 - tp));
        if (vertical) chipV(ctx, r, s, b, fg, bp, null, tp);
        else chip(ctx, r, s, b, fg, bp, null, tp);
      };
      if (c.circle) {
        const s = "⌀ " + fmt(c.w, "w", c);
        const cw = tw(ctx, s) + 8;
        const r = { x: bound.x + bound.w / 2 - cw / 2, y: bound.y + bound.h / 2 - CHIP_H / 2, w: cw, h: CHIP_H };
        if (bound.w >= cw + 2 && bound.h >= CHIP_H && !words.hits(r, 0.5) && grid.tryAdd(r)) put(false, r, s);
        continue;
      }
      const ok = (r) => {
        if (r.x < 0 || r.y < 0 || r.x + r.w > app.vw || r.y + r.h > app.vh) return false;
        if (v.clip && (r.y + r.h > v.clip.y + v.clip.h + 1 || r.x + r.w > v.clip.x + v.clip.w + 1)) return false;
        if (app.occRects && app.occRects.length && !c.isOcc && !c.occ) {
          for (const o of app.occRects) if (overlapsR(o, r)) return false;
        }
        if (words.hits(r, 0.5)) return false;
        return grid.tryAdd(r);
      };
      const ws = fmt(c.w, "w", c);
      const wW = tw(ctx, ws) + 8;
      const hs = fmt(c.h, "h", c);
      const hW = tw(ctx, hs) + 8;
      const T = c.textR;
      let wAtRight = false;
      if (bound.w >= wW + 6) {
        const midX = bound.x + bound.w / 2 - wW / 2;
        let spots;
        if (T) {
          const roomBelow = c.y + c.h - (c.y + T.y + T.h);
          const roomRight = c.x + c.w - (c.x + T.x + T.w);
          spots = [];
          if (roomBelow >= CHIP_H + 4) spots.push({ x: midX, y: bound.y + bound.h - CHIP_H - 2 });
          if (roomRight >= wW + 8) spots.push({ x: bound.x + bound.w - wW - 3, y: bound.y + bound.h / 2 - CHIP_H / 2, right: true });
          spots.push({ x: midX, y: bound.y + bound.h + 2 });
        } else if (bound.h < CHIP_H * 2 + 8) {
          spots = [{ x: midX, y: bound.y + bound.h + 2 }];
        } else {
          spots = [{ x: midX, y: bound.y + bound.h - CHIP_H - 3 }];
        }
        for (const sp of spots) {
          const r = { x: sp.x, y: sp.y, w: wW, h: CHIP_H };
          if (ok(r)) {
            put(false, r, ws);
            wAtRight = !!sp.right;
            break;
          }
        }
      }
      if (bound.h >= hW + 6) {
        const y = bound.y + bound.h / 2 - hW / 2;
        let spots;
        if (T) {
          const roomRight = c.x + c.w - (c.x + T.x + T.w);
          spots = [];
          if (!wAtRight && roomRight >= CHIP_H + 8) spots.push(bound.x + bound.w - CHIP_H - 3);
          spots.push(bound.x + bound.w + 2);
        } else if (bound.w < CHIP_H * 2 + 12) {
          spots = [bound.x + bound.w + 2];
        } else {
          spots = [bound.x + bound.w - CHIP_H - 3];
        }
        for (const x of spots) {
          const r = { x, y, w: CHIP_H, h: hW };
          if (ok(r)) {
            put(true, r, hs);
            break;
          }
        }
      }
    }
  }
  function parentBox(el) {
    let p = el.parentElement;
    const r = rectOf(el);
    while (p && !isRootish(p)) {
      const pr = rectOf(p);
      if (Math.abs(pr.x - r.x) > 0.5 || Math.abs(pr.y - r.y) > 0.5 || Math.abs(pr.w - r.w) > 0.5 || Math.abs(pr.h - r.h) > 0.5) return { el: p, r: pr };
      p = p.parentElement;
    }
    return null;
  }
  function infoChip(ctx, r, s, bg) {
    ctx.font = FONT_INFO;
    const w = tw(ctx, s) + 12;
    const h = 18;
    let x = r.x;
    let y = r.y - h - 5;
    if (y < 4) y = r.y + r.h + 5;
    if (y + h > app.vh - 4) y = Math.max(4, r.y + 4);
    x = clamp(x, 4, app.vw - w - 4);
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 5);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.textAlign = "left";
    ctx.fillText(s, x + 6, y + h / 2 + 0.5);
    ctx.textAlign = "center";
    ctx.font = FONT;
  }
  function elInfo(el, r, c) {
    let s = `${describe(el)}   ${fmt(r.w, "w", c)} × ${fmt(r.h, "h", c)}`;
    if (c && c.text && c.fs) s += `   ·   ${Math.round(c.fs)}px text`;
    if (c && c.circle) s = `${describe(el)}   ⌀ ${fmt(r.w, "w", c)}`;
    return s;
  }
  var pop = { el: null, t0: 0 };
  function popped(el, r, now) {
    if (pop.el !== el) {
      pop.el = el;
      pop.t0 = now;
      keepAnimating(220);
    }
    const e = easeOutCubic(clamp((now - pop.t0) / 170, 0, 1));
    const k = (1 - e) * 6;
    return { r: { x: r.x - k, y: r.y - k, w: r.w + 2 * k, h: r.h + 2 * k }, e, k };
  }
  function hoverBox(ctx, el, r, c, col, now, strong) {
    const P = popped(el, r, now);
    ctx.save();
    ctx.beginPath();
    boxPath(ctx, P.r, (c.rad || 0) + P.k, c.circle);
    ctx.fillStyle = hsla(col, (strong ? 0.16 : 0.1) + app.state.fill * 0.3);
    ctx.fill();
    ctx.lineWidth = strong ? 5.5 : 4;
    ctx.strokeStyle = `rgba(255,255,255,${(strong ? 0.85 : 0.6) * P.e})`;
    ctx.stroke();
    ctx.lineWidth = strong ? 2.5 : 2;
    ctx.strokeStyle = hsla(col, 1);
    ctx.stroke();
    ctx.restore();
  }
  function drawMeasureHover(ctx, now) {
    const h = app.hover;
    if (!h || h.kind !== "el" || !h.el.isConnected) return;
    const el = h.el;
    const r = rectOf(el);
    if (r.w < 1 || r.h < 1) return;
    const c = app.candByEl.get(el) || itemCtx(h);
    const col = [217, 96, 54];
    hoverBox(ctx, el, r, c, col, now, false);
    const p = parentBox(el);
    if (p) drawInnerDistances(ctx, r, p.r, c, el);
    infoChip(ctx, r, elInfo(el, r, c), hsla(col, 0.97, -10));
  }
  var MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || "");
  var MOD_NAME = MAC ? "Ctrl/⌘" : "Ctrl";
  function climbTarget(el) {
    const cur2 = app.sel.length === 1 && app.sel[0].kind === "el" ? app.sel[0].el : null;
    if (cur2 && cur2.isConnected && deepContains(cur2, el)) return parentPick(cur2) || cur2;
    return el;
  }
  function alikeBase(el) {
    const cur2 = app.sel.length === 1 && app.sel[0].kind === "el" ? app.sel[0].el : null;
    return cur2 && cur2.isConnected && deepContains(cur2, el) ? cur2 : el;
  }
  function drawChangeHover(ctx, now) {
    const h = app.hover;
    if (!h || h.kind !== "el" || !h.el.isConnected) return;
    const el = h.el;
    const mods = app.mods;
    const col = [270, 88, 58];
    if (mods.mod && mods.shift) return drawAlikePreview(ctx, el, now);
    let target = el;
    if (mods.mod) target = climbTarget(el);
    const r = rectOf(target);
    if (r.w < 1 || r.h < 1) return;
    const c = app.candByEl.get(target) || itemCtx(elItem(target));
    hoverBox(ctx, target, r, c, col, now, true);
    if (c.flex || c.grid) drawFlexGaps(ctx, target, r, c);
    const picked = app.sel.some((s) => s.kind === "el" && s.el === target);
    if (mods.mod && target !== el) infoChip(ctx, r, `${MOD_NAME}-click picks the box around it: ${describe(target)}`, hsla(col, 0.97, -16));
    else if (!picked) infoChip(ctx, r, elInfo(target, r, c), hsla(col, 0.97, -12));
  }
  function drawAlikePreview(ctx, el, now) {
    const base = alikeBase(el);
    const list = alikeCached(base);
    const col = [292, 84, 60];
    ctx.save();
    for (const o of list) {
      if (!o.isConnected) continue;
      const r3 = rectOf(o);
      if (r3.x > app.vw || r3.y > app.vh || r3.x + r3.w < 0 || r3.y + r3.h < 0) continue;
      const c = app.candByEl.get(o) || { rad: 0 };
      ctx.beginPath();
      boxPath(ctx, r3, c.rad || 0, c.circle);
      ctx.fillStyle = hsla(col, 0.14);
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(255,255,255,0.7)";
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.strokeStyle = hsla(col, 1);
      ctx.stroke();
    }
    ctx.restore();
    const r = rectOf(base);
    const n = list.length;
    const s = n > 1 ? `${MOD_NAME}+Shift-click picks all ${n} like this (${alikeLabel(base)})` : `Nothing else here looks like this (${alikeLabel(base)})`;
    infoChip(ctx, r, s, hsla(col, 0.97, -18));
    popped(base, r, now);
  }
  function neighbourEdges(el, r, pr) {
    let L = pr.x;
    let R2 = pr.x + pr.w;
    let T = pr.y;
    let B = pr.y + pr.h;
    const p = el && el.parentElement;
    if (p) {
      let n = 0;
      for (const k of p.children) {
        if (k === el || k === app.host || n++ > 200) continue;
        const kr = rectOf(k);
        if (kr.w < 1 || kr.h < 1) continue;
        const yo = kr.y < r.y + r.h - 0.5 && kr.y + kr.h > r.y + 0.5;
        const xo = kr.x < r.x + r.w - 0.5 && kr.x + kr.w > r.x + 0.5;
        if (yo) {
          if (kr.x + kr.w <= r.x + 0.5 && kr.x + kr.w > L) L = kr.x + kr.w;
          if (kr.x >= r.x + r.w - 0.5 && kr.x < R2) R2 = kr.x;
        }
        if (xo) {
          if (kr.y + kr.h <= r.y + 0.5 && kr.y + kr.h > T) T = kr.y + kr.h;
          if (kr.y >= r.y + r.h - 0.5 && kr.y < B) B = kr.y;
        }
      }
    }
    return { L, R: R2, T, B };
  }
  function drawInnerDistances(ctx, r, pr, c, el) {
    ctx.save();
    ctx.strokeStyle = PINK;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 2]);
    const midY = r.y + r.h / 2;
    const midX = r.x + r.w / 2;
    const items = [];
    const e = neighbourEdges(el, r, pr);
    const L = r.x - e.L;
    const R2 = e.R - (r.x + r.w);
    const T = r.y - e.T;
    const B = e.B - (r.y + r.h);
    if (L > 0.5) items.push([e.L, midY, r.x, midY, fmtGap(L, "w", c)]);
    if (R2 > 0.5) items.push([r.x + r.w, midY, e.R, midY, fmtGap(R2, "w", c)]);
    if (T > 0.5) items.push([midX, e.T, midX, r.y, fmtGap(T, "h", c)]);
    if (B > 0.5) items.push([midX, r.y + r.h, midX, e.B, fmtGap(B, "h", c)]);
    for (const [x1, y1, x2, y2] of items) {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.font = FONT;
    for (const [x1, y1, x2, y2, s] of items) {
      const w = tw(ctx, s) + 8;
      const len = Math.hypot(x2 - x1, y2 - y1);
      if (len < 6) continue;
      const r22 = { x: (x1 + x2) / 2 - w / 2, y: (y1 + y2) / 2 - CHIP_H / 2, w, h: CHIP_H };
      chip(ctx, r22, s, PINK, "#fff");
    }
    ctx.restore();
  }
  function drawOuterDistances(ctx, r, exclude) {
    const W = app.vw;
    const H = app.vh;
    let left = app.state.canvasMode ? 0 : -Infinity;
    let right = app.state.canvasMode ? W : Infinity;
    let top = app.state.canvasMode ? 0 : -Infinity;
    let bottom = app.state.canvasMode ? H : Infinity;
    const consider = (o) => {
      const yo = o.y < r.y + r.h && o.y + o.h > r.y;
      const xo = o.x < r.x + r.w && o.x + o.w > r.x;
      if (yo) {
        for (const e of [o.x, o.x + o.w]) {
          if (e <= r.x + 0.5 && e > left) left = e;
          if (e >= r.x + r.w - 0.5 && e < right) right = e;
        }
      }
      if (xo) {
        for (const e of [o.y, o.y + o.h]) {
          if (e <= r.y + 0.5 && e > top) top = e;
          if (e >= r.y + r.h - 0.5 && e < bottom) bottom = e;
        }
      }
    };
    if (!app.state.canvasMode && app.state.guides) {
      for (const c of app.cands) {
        if (c.dup || c.x > W || c.y > H || c.x + c.w < 0 || c.y + c.h < 0) continue;
        if (exclude && exclude.some((e) => deepContains(e, c.el))) continue;
        consider(c);
      }
    }
    for (const s of activeShapes()) {
      const sr = shapeRect(s);
      if (sr.x === r.x && sr.y === r.y && sr.w === r.w && sr.h === r.h) continue;
      consider(sr);
    }
    const ctxU = { pw: app.vw, ph: app.vh, fs: app.rootFS };
    const midY = r.y + r.h / 2;
    const midX = r.x + r.w / 2;
    const segs = [];
    if (Number.isFinite(left) && r.x - left > 0.5) segs.push([left, midY, r.x, midY, fmtGap(r.x - left, "w", ctxU)]);
    if (Number.isFinite(right) && right - (r.x + r.w) > 0.5) segs.push([r.x + r.w, midY, right, midY, fmtGap(right - r.x - r.w, "w", ctxU)]);
    if (Number.isFinite(top) && r.y - top > 0.5) segs.push([midX, top, midX, r.y, fmtGap(r.y - top, "h", ctxU)]);
    if (Number.isFinite(bottom) && bottom - (r.y + r.h) > 0.5) segs.push([midX, r.y + r.h, midX, bottom, fmtGap(bottom - r.y - r.h, "h", ctxU)]);
    ctx.save();
    ctx.strokeStyle = PINK;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 2]);
    for (const [x1, y1, x2, y2] of segs) {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.font = FONT;
    for (const [x1, y1, x2, y2, s] of segs) {
      const len = Math.hypot(x2 - x1, y2 - y1);
      if (len < 10) continue;
      const w = tw(ctx, s) + 8;
      chip(ctx, { x: (x1 + x2) / 2 - w / 2, y: (y1 + y2) / 2 - CHIP_H / 2, w, h: CHIP_H }, s, PINK, "#fff");
    }
    ctx.restore();
  }
  function drawDistancesForActive(ctx) {
    const d = app.drag;
    if (d && d.type === "draw" && app.preview) {
      drawOuterDistances(ctx, app.preview.rect, null);
      return;
    }
    if (d && (d.type === "move" || d.type === "edge" || d.type === "corner") && d.items && d.items.length === 1) {
      const it = d.items[0].it;
      const r = itemRect(it);
      if (it.kind === "el") {
        const p = parentBox(it.el);
        if (p) drawInnerDistances(ctx, r, p.r, itemCtx(it), it.el);
      } else drawOuterDistances(ctx, r, null);
      return;
    }
    if (!d && app.sel.length === 1) {
      const it = app.sel[0];
      if (it.kind === "shape") drawOuterDistances(ctx, itemRect(it), null);
      else if (app.state.mode === "change" && it.el.isConnected) {
        const p = parentBox(it.el);
        if (p) drawInnerDistances(ctx, rectOf(it.el), p.r, itemCtx(it), it.el);
      }
    }
  }
  var hatch = null;
  function hatchPattern(ctx) {
    if (hatch) return hatch;
    const s = 8;
    const c = document.createElement("canvas");
    c.width = s;
    c.height = s;
    const g = c.getContext("2d");
    g.strokeStyle = "rgba(168,85,247,0.6)";
    g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(0, s);
    g.lineTo(s, 0);
    g.moveTo(-s / 2, s / 2);
    g.lineTo(s / 2, -s / 2);
    g.moveTo(s / 2, s * 1.5);
    g.lineTo(s * 1.5, s / 2);
    g.stroke();
    hatch = ctx.createPattern(c, "repeat");
    return hatch;
  }
  function flowChildren(el) {
    const out = [];
    for (const k of el.children) {
      if (k === app.host) continue;
      let cs;
      try {
        cs = getComputedStyle(k);
      } catch {
        continue;
      }
      if (cs.display === "none" || cs.position === "absolute" || cs.position === "fixed") continue;
      const r = rectOf(k);
      if (r.w < 0.5 && r.h < 0.5) continue;
      out.push({ el: k, r });
    }
    return out;
  }
  function drawFlexGaps(ctx, el, r, c) {
    const kids = flowChildren(el);
    if (kids.length < 2) return;
    const row = c.flex ? !String(c.dir).startsWith("column") : true;
    const sorted = kids.slice().sort((a, b) => row ? a.r.x - b.r.x || a.r.y - b.r.y : a.r.y - b.r.y || a.r.x - b.r.x);
    const pat = hatchPattern(ctx);
    ctx.save();
    ctx.font = FONT;
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i].r;
      const b = sorted[i + 1].r;
      let g = null;
      if (row) {
        const overlapY = a.y < b.y + b.h && b.y < a.y + a.h;
        if (!overlapY || b.x <= a.x + a.w + 0.5) continue;
        const y1 = Math.min(a.y, b.y);
        const y2 = Math.max(a.y + a.h, b.y + b.h);
        g = { x: a.x + a.w, y: y1, w: b.x - (a.x + a.w), h: y2 - y1, axis: "w" };
      } else {
        const overlapX = a.x < b.x + b.w && b.x < a.x + a.w;
        if (!overlapX || b.y <= a.y + a.h + 0.5) continue;
        const x1 = Math.min(a.x, b.x);
        const x2 = Math.max(a.x + a.w, b.x + b.w);
        g = { x: x1, y: a.y + a.h, w: x2 - x1, h: b.y - (a.y + a.h), axis: "h" };
      }
      if (pat) {
        ctx.fillStyle = pat;
        ctx.fillRect(g.x, g.y, g.w, g.h);
      }
      const s = fmtGap(g.axis === "w" ? g.w : g.h, g.axis, c);
      const w = tw(ctx, s) + 8;
      if (g.axis === "w" && g.h > CHIP_H + 4 || g.axis === "h" && g.w > w + 4) {
        if (g.axis === "w" && g.w < 12) continue;
        chip(ctx, { x: g.x + g.w / 2 - w / 2, y: g.y + g.h / 2 - CHIP_H / 2, w, h: CHIP_H }, s, "rgba(147,51,234,0.95)", "#fff");
      }
    }
    const badge = c.grid ? "grid" : row ? "flex →" : "flex ↓";
    const bw = tw(ctx, badge) + 10;
    const by = r.y - CHIP_H - 3 >= 2 ? r.y - CHIP_H - 3 : r.y + 3;
    chip(ctx, { x: r.x + r.w - bw, y: by, w: bw, h: CHIP_H }, badge, "rgba(91,33,182,0.95)", "#fff");
    ctx.restore();
  }
  function drawFlexForSelection(ctx) {
    if (app.sel.length !== 1 || app.sel[0].kind !== "el") return;
    const el = app.sel[0].el;
    if (!el.isConnected) return;
    const c = app.candByEl.get(el);
    if (!c || !(c.flex || c.grid)) return;
    drawFlexGaps(ctx, el, rectOf(el), c);
  }
  function drawShapes(ctx, now, ui) {
    const list = activeShapes();
    if (!list.length) return;
    const canvasMode = app.state.canvasMode;
    const W = app.vw;
    const H = app.vh;
    const ctxU = { pw: W, ph: H, fs: app.rootFS };
    ctx.font = FONT;
    for (const s of list) {
      const r = shapeRect(s);
      if (r.x > W || r.y > H || r.x + r.w < 0 || r.y + r.h < 0) continue;
      const p = easeOutCubic(clamp((now - Math.max(s.born, app.openedAt)) / 320, 0, 1));
      ctx.save();
      ctx.globalAlpha *= p;
      ctx.beginPath();
      ctx.rect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = canvasMode ? "#ffffff" : `rgba(255,255,255,${0.28 + 0.6 * app.state.fill})`;
      ctx.fill();
      if (!canvasMode) {
        ctx.lineWidth = 4;
        ctx.strokeStyle = "rgba(255,255,255,0.85)";
        ctx.stroke();
      }
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#111";
      ctx.stroke();
      const ws = fmt(r.w, "w", ctxU);
      const hs = fmt(r.h, "h", ctxU);
      const wW = tw(ctx, ws) + 8;
      const hW = tw(ctx, hs) + 8;
      const wr = r.w >= wW + 8 && r.h >= CHIP_H + 8 ? { x: r.x + r.w / 2 - wW / 2, y: r.y + r.h - CHIP_H - 4, w: wW, h: CHIP_H } : { x: r.x + r.w / 2 - wW / 2, y: r.y + r.h + 4, w: wW, h: CHIP_H };
      const hr = r.h >= hW + 8 && r.w >= CHIP_H + 8 + (wr.y < r.y + r.h ? 0 : 0) ? { x: r.x + r.w - CHIP_H - 4, y: r.y + r.h / 2 - hW / 2, w: CHIP_H, h: hW } : { x: r.x + r.w + 4, y: r.y + r.h / 2 - hW / 2, w: CHIP_H, h: hW };
      const border = canvasMode ? "rgba(0,0,0,0.14)" : "rgba(0,0,0,0.18)";
      chip(ctx, wr, ws, "#fff", "#111", 1, border);
      chipV(ctx, hr, hs, "#fff", "#111", 1, border);
      ctx.restore();
      if (ui) {
        const it = shapeItem(s);
        app.chips.push({ ...wr, it, axis: "w" }, { ...hr, it, axis: "h" });
      }
    }
  }
  function drawSelection(ctx) {
    const sel = app.sel;
    if (!sel.length) return;
    const color = selColor();
    const rects = [];
    for (const it of sel) {
      if (it.kind === "el" && !it.el.isConnected) continue;
      const r = itemRect(it);
      rects.push(r);
      ctx.lineWidth = 2;
      ctx.strokeStyle = color;
      ctx.setLineDash([]);
      ctx.strokeRect(r.x, r.y, r.w, r.h);
    }
    if (!rects.length) return;
    const B = union(rects);
    if (rects.length > 1) {
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(B.x - 0.5, B.y - 0.5, B.w + 1, B.h + 1);
      ctx.setLineDash([]);
    }
    for (const [x, y] of [[B.x, B.y], [B.x + B.w, B.y], [B.x, B.y + B.h], [B.x + B.w, B.y + B.h]]) {
      ctx.beginPath();
      ctx.rect(x - 4, y - 4, 8, 8);
      ctx.fillStyle = "#fff";
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = color;
      ctx.stroke();
    }
    const onlyShapes = sel.every((s) => s.kind === "shape");
    if (!onlyShapes || sel.length > 1) {
      const it = sel.length === 1 ? sel[0] : null;
      const cU = it ? itemCtx(it) : { pw: app.vw, ph: app.vh, fs: app.rootFS };
      ctx.font = FONT;
      const ws = fmt(B.w, "w", cU);
      const hs = fmt(B.h, "h", cU);
      const wW = tw(ctx, ws) + 10;
      const hW = tw(ctx, hs) + 10;
      let wy = B.y + B.h + 8;
      if (wy + CHIP_H > app.vh - 2) wy = B.y + B.h - CHIP_H - 8;
      let hx = B.x + B.w + 8;
      if (hx + CHIP_H > app.vw - 2) hx = B.x + B.w - CHIP_H - 8;
      const wr = { x: B.x + B.w / 2 - wW / 2, y: wy, w: wW, h: CHIP_H + 2 };
      const hr = { x: hx, y: B.y + B.h / 2 - hW / 2, w: CHIP_H + 2, h: hW };
      chip(ctx, wr, ws, color, "#fff");
      chipV(ctx, hr, hs, color, "#fff");
      if (it) app.chips.push({ ...wr, it, axis: "w" }, { ...hr, it, axis: "h" });
    }
  }
  function edgePoints(r) {
    return [
      ["t", r.x + r.w / 2, r.y],
      ["b", r.x + r.w / 2, r.y + r.h],
      ["l", r.x, r.y + r.h / 2],
      ["r", r.x + r.w, r.y + r.h / 2]
    ];
  }
  function alongEdge(r, edge, f = 0.5) {
    if (edge === "t" || edge === "b") return [r.x + r.w * f, edge === "t" ? r.y : r.y + r.h];
    return [edge === "l" ? r.x : r.x + r.w, r.y + r.h * f];
  }
  function edgeLine(r, edge) {
    if (edge === "t") return [r.x, r.y, r.x + r.w, r.y];
    if (edge === "b") return [r.x, r.y + r.h, r.x + r.w, r.y + r.h];
    if (edge === "l") return [r.x, r.y, r.x, r.y + r.h];
    return [r.x + r.w, r.y, r.x + r.w, r.y + r.h];
  }
  function isCrowded(list) {
    const pts = [];
    for (const a of list) if (!pts.some((p) => Math.abs(p.x - a.x) < 3 && Math.abs(p.y - a.y) < 3)) pts.push(a);
    if (pts.length > 9) return true;
    let close2 = 0;
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) if (Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) < 18) close2++;
    }
    return close2 >= 3;
  }
  function edgeUnderCursor(mx, my, pageEls, crowded) {
    let best = null;
    const test = (r3, info2) => {
      if (r3.w < 4 || r3.h < 4) return;
      const inside = mx >= r3.x && mx <= r3.x + r3.w && my >= r3.y && my <= r3.y + r3.h;
      const tolX = info2.sel ? 6 : clamp(r3.w * 0.16, 2, 5);
      const tolY = info2.sel ? 6 : clamp(r3.h * 0.16, 2, 5);
      const inX = mx >= r3.x - 1 && mx <= r3.x + r3.w + 1;
      const inY = my >= r3.y - 1 && my <= r3.y + r3.h + 1;
      const opts = [];
      if (inX) opts.push(["t", Math.abs(my - r3.y), tolY], ["b", Math.abs(my - (r3.y + r3.h)), tolY]);
      if (inY) opts.push(["l", Math.abs(mx - r3.x), tolX], ["r", Math.abs(mx - (r3.x + r3.w)), tolX]);
      for (const [edge2, dist, tol] of opts) {
        if (dist > tol) continue;
        const score = dist - (info2.sel ? 8 : 0) - (inside ? 1.5 : 0) + Math.sqrt(r3.w * r3.h) * 2e-3;
        if (!best || score < best.score) best = { score, edge: edge2, r: r3, info: info2 };
      }
    };
    let inSel = false;
    for (const it2 of app.sel) {
      if (it2.kind === "el" && !it2.el.isConnected) continue;
      const r3 = itemRect(it2);
      if (containsPt(r3, mx, my)) inSel = true;
      test(r3, { sel: true, it: it2 });
    }
    if (crowded && !inSel) for (const s of activeShapes()) test(shapeRect(s), { it: shapeItem(s) });
    if (pageEls && crowded && !inSel) {
      const onBar = app.occRects && app.occRects.some((o) => containsPt(o, mx, my));
      for (const c of app.cands) {
        if (c.dup || c.w < 6 || c.h < 6) continue;
        if (c.x > mx + 8 || c.x + c.w < mx - 8 || c.y > my + 8 || c.y + c.h < my - 8) continue;
        if (onBar && !c.isOcc && !c.occ) continue;
        if (c.clip) {
          const k = clipRect(c.clip);
          if (k === false || k && !containsPt(k, mx, my, 2)) continue;
        }
        test(c, { el: c.el });
      }
    }
    if (!best) return null;
    const { edge, r, info } = best;
    const horiz = edge === "t" || edge === "b";
    const len = horiz ? r.w : r.h;
    let f = 0.5;
    if (len > 16) f = clamp((horiz ? mx - r.x : my - r.y) / len, 6 / len, 1 - 6 / len);
    const [x, y] = alongEdge(r, edge, f);
    const it = info.it || elItem(info.el);
    return { it, edge, x, y, f, d: 0, exact: true, sel: !!info.sel, line: edgeLine(r, edge) };
  }
  function computeArrows() {
    const out = [];
    const m = app.mouse;
    app.crowded = false;
    if (!m.inside || app.state.capturing) return out;
    const d = app.drag;
    if (d && d.type !== "pending") {
      if (d.type === "edge") {
        const it = d.main || d.items[0].it;
        const r = itemRect(it);
        const [x, y] = alongEdge(r, d.edge, d.f == null ? 0.5 : d.f);
        out.push({ it, edge: d.edge, x, y, d: 0, hot: true, line: d.exact ? edgeLine(r, d.edge) : null });
      }
      return out;
    }
    const R2 = Math.min(app.vw * 0.1, 170);
    const W = app.vw;
    const H = app.vh;
    const near = [];
    const push = (it, r, key) => {
      for (const [edge, x, y] of edgePoints(r)) {
        const dd = Math.hypot(x - m.x, y - m.y);
        if (dd < R2) near.push({ it, key, edge, x, y, d: dd });
      }
    };
    for (const s of activeShapes()) push(shapeItem(s), shapeRect(s), s);
    const pageEls = app.state.mode === "change" && !app.state.canvasMode && app.state.guides;
    if (pageEls) {
      for (const c of app.cands) {
        if (c.dup || c.w < 10 || c.h < 10) continue;
        if (c.x > W || c.y > H || c.x + c.w < 0 || c.y + c.h < 0) continue;
        if (c.x > m.x + R2 || c.x + c.w < m.x - R2 || c.y > m.y + R2 || c.y + c.h < m.y - R2) continue;
        push(null, c, c.el);
      }
    }
    const selA = [];
    for (const it of app.sel) {
      if (it.kind === "el" && !it.el.isConnected) continue;
      for (const [edge, x, y] of edgePoints(itemRect(it))) selA.push({ it, edge, x, y, d: Math.min(R2 * 0.5, Math.hypot(x - m.x, y - m.y)), sel: true });
    }
    const crowded = isCrowded(near);
    app.crowded = crowded;
    const exact = edgeUnderCursor(m.x, m.y, pageEls, crowded);
    let list;
    if (crowded) {
      list = selA;
    } else {
      list = selA.concat(near);
    }
    if (exact) {
      const key = exact.it.kind === "el" ? exact.it.el : exact.it.shape;
      list = list.filter((a) => a.edge !== exact.edge || (a.it ? a.it.kind === "el" ? a.it.el : a.it.shape : a.key) !== key);
      list.push(exact);
    }
    list.sort((a, b) => (a.exact ? 0 : 1) - (b.exact ? 0 : 1) || (a.sel ? 0 : 1) - (b.sel ? 0 : 1) || a.d - b.d);
    for (const a of list) {
      if (out.length >= 30) break;
      if (out.some((b) => Math.abs(b.x - a.x) < 9 && Math.abs(b.y - a.y) < 9)) continue;
      if (!a.it) a.it = a.key && a.key.nodeType === 1 ? elItem(a.key) : shapeItem(a.key);
      out.push(a);
    }
    return out;
  }
  function tri(ctx, tx, ty, dx, dy, s) {
    const bx = tx - dx * s * 1.25;
    const by = ty - dy * s * 1.25;
    const px = -dy;
    const py = dx;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(bx + px * s, by + py * s);
    ctx.lineTo(bx - px * s, by - py * s);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  function drawArrows(ctx) {
    const R2 = Math.min(app.vw * 0.1, 170);
    const hot = app.hot && app.hot.type === "edge" ? app.hot : null;
    const change = app.state.mode === "change";
    const solid = change ? PURPLE_SEL : BLUE_SEL;
    ctx.save();
    for (const a of app.arrows) {
      if (!a.line) continue;
      ctx.globalAlpha = 1;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(a.line[0], a.line[1]);
      ctx.lineTo(a.line[2], a.line[3]);
      ctx.lineWidth = 5;
      ctx.strokeStyle = "rgba(255,255,255,0.85)";
      ctx.stroke();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = solid;
      ctx.stroke();
    }
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    for (const a of app.arrows) {
      const isHot = a.hot || a.exact || hot && hot.edge === a.edge && same(hot.it, a.it);
      const alpha = isHot ? 1 : clamp(1 - a.d / R2, 0.18, 0.95);
      const s = isHot ? 5.5 : 4.2;
      const gap = 2.5;
      ctx.fillStyle = change ? `rgba(124,58,237,${alpha})` : `rgba(37,99,235,${alpha})`;
      ctx.globalAlpha = Math.min(1, alpha + 0.1);
      if (a.edge === "t" || a.edge === "b") {
        tri(ctx, a.x, a.y - gap, 0, 1, s);
        tri(ctx, a.x, a.y + gap, 0, -1, s);
      } else {
        tri(ctx, a.x - gap, a.y, 1, 0, s);
        tri(ctx, a.x + gap, a.y, -1, 0, s);
      }
    }
    ctx.restore();
  }
  function computeSpacing(items) {
    if (items.length < 2) return null;
    const rs = items.filter((it) => it.kind === "shape" || it.el.isConnected).map((it) => ({ it, r: itemRect(it) }));
    if (rs.length < 2) return null;
    const tryAxis = (axis) => {
      const sorted = rs.slice().sort((a, b) => axis === "x" ? a.r.x - b.r.x : a.r.y - b.r.y);
      const gaps = [];
      for (let i = 0; i < sorted.length - 1; i++) {
        const a = sorted[i].r;
        const b = sorted[i + 1].r;
        const g = axis === "x" ? b.x - (a.x + a.w) : b.y - (a.y + a.h);
        if (g < -1) return null;
        let mx, my;
        if (axis === "x") {
          mx = a.x + a.w + g / 2;
          const y1 = Math.max(a.y, b.y);
          const y2 = Math.min(a.y + a.h, b.y + b.h);
          my = y2 > y1 ? (y1 + y2) / 2 : (a.y + a.h / 2 + b.y + b.h / 2) / 2;
        } else {
          my = a.y + a.h + g / 2;
          const x1 = Math.max(a.x, b.x);
          const x2 = Math.min(a.x + a.w, b.x + b.w);
          mx = x2 > x1 ? (x1 + x2) / 2 : (a.x + a.w / 2 + b.x + b.w / 2) / 2;
        }
        gaps.push({ g, x: mx, y: my });
      }
      return { axis, sorted, gaps };
    };
    const bx = tryAxis("x");
    const by = tryAxis("y");
    if (bx && by) {
      const spreadX = union(rs.map((r) => r.r)).w;
      const spreadY = union(rs.map((r) => r.r)).h;
      return spreadX >= spreadY ? bx : by;
    }
    return bx || by;
  }
  function drawSpacing(ctx) {
    const d = app.drag;
    const items = d && d.type === "spacing" ? d.items.map((s) => s.it) : app.sel;
    const sp = items.length >= 2 && (!d || d.type === "spacing") ? computeSpacing(items) : null;
    app.spacing = sp;
    if (!sp) return;
    ctx.save();
    ctx.font = FONT;
    const ctxU = { pw: app.vw, ph: app.vh, fs: app.rootFS };
    for (const g of sp.gaps) {
      const hot = app.hot && app.hot.type === "spacing";
      const len = 14;
      const r = sp.axis === "x" ? { x: g.x - 2.5, y: g.y - len / 2, w: 5, h: len } : { x: g.x - len / 2, y: g.y - 2.5, w: len, h: 5 };
      ctx.beginPath();
      ctx.roundRect(r.x, r.y, r.w, r.h, 3);
      ctx.fillStyle = PINK;
      ctx.fill();
      ctx.lineWidth = hot ? 2 : 1.5;
      ctx.strokeStyle = "#fff";
      ctx.stroke();
      const s = fmtGap(Math.max(0, g.g), sp.axis === "x" ? "w" : "h", ctxU);
      const w = tw(ctx, s) + 8;
      const cr = sp.axis === "x" ? { x: g.x - w / 2, y: g.y - len / 2 - CHIP_H - 4, w, h: CHIP_H } : { x: g.x + len / 2 + 4, y: g.y - CHIP_H / 2, w, h: CHIP_H };
      chip(ctx, cr, s, PINK, "#fff");
    }
    ctx.restore();
  }
  function drawMarquee(ctx) {
    const m = app.marquee;
    if (!m) return;
    const color = selColor();
    ctx.save();
    ctx.fillStyle = color === PURPLE_SEL ? "rgba(124,58,237,0.08)" : "rgba(37,99,235,0.08)";
    ctx.fillRect(m.x, m.y, m.w, m.h);
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = color;
    ctx.strokeRect(m.x + 0.5, m.y + 0.5, m.w, m.h);
    ctx.restore();
  }
  function drawPreview(ctx) {
    const p = app.preview;
    if (!p) return;
    const r = p.rect;
    const s = p.start;
    ctx.save();
    ctx.fillStyle = "rgba(219,234,254,0.35)";
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#60a5fa";
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.setLineDash([]);
    ctx.strokeStyle = "#3b82f6";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(r.x, s.y + 0.5);
    ctx.lineTo(r.x + r.w, s.y + 0.5);
    ctx.moveTo(s.x + 0.5, r.y);
    ctx.lineTo(s.x + 0.5, r.y + r.h);
    ctx.stroke();
    const ctxU = { pw: app.vw, ph: app.vh, fs: app.rootFS };
    ctx.font = FONT;
    const ws = fmt(r.w, "w", ctxU);
    const hs = fmt(r.h, "h", ctxU);
    const wW = tw(ctx, ws) + 8;
    const hW = tw(ctx, hs) + 8;
    const right = s.x <= r.x + 0.5 ? r.x + r.w : r.x;
    chip(ctx, { x: right - wW / 2, y: s.y - CHIP_H - 6, w: wW, h: CHIP_H }, ws, "#fff", "#111", 1, "rgba(0,0,0,0.18)");
    const bottom = s.y <= r.y + 0.5 ? r.y + r.h : r.y;
    chip(ctx, { x: s.x + 6, y: bottom - CHIP_H / 2, w: hW, h: CHIP_H }, hs, "#fff", "#111", 1, "rgba(0,0,0,0.18)");
    ctx.restore();
  }
  function drawSnapLines(ctx) {
    if (!app.snapLines.length) return;
    ctx.save();
    ctx.strokeStyle = PINK;
    ctx.lineWidth = 1;
    for (const l of app.snapLines) {
      ctx.beginPath();
      ctx.moveTo(l.x1 + (l.x1 === l.x2 ? 0.5 : 0), l.y1 + (l.y1 === l.y2 ? 0.5 : 0));
      ctx.lineTo(l.x2 + (l.x1 === l.x2 ? 0.5 : 0), l.y2 + (l.y1 === l.y2 ? 0.5 : 0));
      ctx.stroke();
      for (const [x, y] of [[l.x1, l.y1], [l.x2, l.y2]]) {
        ctx.beginPath();
        ctx.moveTo(x - 3, y - 3);
        ctx.lineTo(x + 3, y + 3);
        ctx.moveTo(x + 3, y - 3);
        ctx.lineTo(x - 3, y + 3);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
  function drawPulses(ctx, now) {
    if (!app.pulses.length) return;
    const maxR = Math.hypot(app.vw, app.vh);
    app.pulses = app.pulses.filter((p) => now - p.t0 < p.dur);
    for (const p of app.pulses) {
      const t = clamp((now - p.t0) / p.dur, 0, 1);
      const e = easeOutCubic(t);
      ctx.save();
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(1, e * maxR * (p.scale || 1)), 0, Math.PI * 2);
      ctx.lineWidth = 2 + 14 * (1 - t);
      ctx.strokeStyle = p.color.replace("ALPHA", String(0.55 * (1 - t)));
      ctx.stroke();
      ctx.restore();
    }
  }
  function resizeCanvas() {
    const c = app.canvas;
    if (!c) return;
    app.vw = window.innerWidth;
    app.vh = window.innerHeight;
    app.dpr = window.devicePixelRatio || 1;
    c.width = Math.round(app.vw * app.dpr);
    c.height = Math.round(app.vh * app.dpr);
    c.style.width = app.vw + "px";
    c.style.height = app.vh + "px";
    app.dirty = true;
  }

  // src/content/icons.js
  var svg = (body, extra = "") => [body, extra];
  var NS = "http://www.w3.org/2000/svg";
  var ATTR = /([\w:-]+)="([^"]*)"/g;
  var TAG = /<(\w+)((?:\s+[\w:-]+="[^"]*")*)\s*\/>/g;
  function setAttrs(node, str) {
    for (const m of str.matchAll(ATTR)) node.setAttribute(m[1], m[2]);
  }
  function iconEl(name) {
    const def = icons[name] || icons.close;
    const s = document.createElementNS(NS, "svg");
    setAttrs(s, 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"');
    if (def[1]) setAttrs(s, def[1]);
    for (const m of def[0].matchAll(TAG)) {
      const n = document.createElementNS(NS, m[1]);
      setAttrs(n, m[2]);
      s.appendChild(n);
    }
    return s;
  }
  var icons = {
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
    plus: svg('<path d="M12 6v12M6 12h12"/>', 'stroke-width="2.4"')
  };

  // src/content/tools.js
  var FLIP_MS = 560;
  function captureRects(els) {
    const m = /* @__PURE__ */ new Map();
    for (const el of els) if (el && el.isConnected) m.set(el, rectOf(el));
    return m;
  }
  function flip(first) {
    let n = 0;
    for (const [el, f] of first) {
      if (!el.isConnected) continue;
      const l = rectOf(el);
      const dx = f.x - l.x;
      const dy = f.y - l.y;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
      try {
        el.animate([{ translate: `${dx}px ${dy}px` }, { translate: "0px 0px" }], {
          duration: FLIP_MS,
          easing: "cubic-bezier(.2,.85,.25,1)",
          composite: "add"
        });
        n++;
      } catch {
      }
    }
    liveFor(FLIP_MS + 60);
    return n;
  }
  function pulse(x, y, color = "rgba(124,58,237,ALPHA)", dur = 750, scale = 1) {
    app.pulses.push({ x, y, t0: performance.now(), dur, color, scale });
    keepAnimating(dur + 30);
  }
  function selEls() {
    return app.sel.filter((s) => s.kind === "el" && s.el.isConnected).map((s) => s.el);
  }
  function outermost(els) {
    return els.filter((e) => !els.some((o) => o !== e && deepContains(o, e)));
  }
  function lca(els) {
    if (!els.length) return null;
    let a = els[0].parentElement;
    while (a && !els.every((e) => a.contains(e))) a = a.parentElement;
    return a;
  }
  function childOf(ancestor, el) {
    let c = el;
    while (c && c.parentElement !== ancestor) c = c.parentElement;
    return c;
  }
  function arrangement(rects) {
    let rowVotes = 0;
    let colVotes = 0;
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i];
        const b = rects[j];
        const yo = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        const xo = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        if (yo > 0 && yo >= xo) rowVotes++;
        else colVotes++;
      }
    }
    return rowVotes >= colVotes ? "row" : "column";
  }
  function median(a) {
    if (!a.length) return 0;
    const s = a.slice().sort((x, y) => x - y);
    return s[Math.floor(s.length / 2)];
  }
  function group() {
    let els = outermost(selEls()).filter((e) => !isRootish(e));
    if (!els.length) return { ok: false, msg: "Select 2 or more things to group" };
    if (els.length === 1) return makeFlex(els[0]);
    const rects = els.map(rectOf);
    const dir2 = arrangement(rects);
    const order = els.map((el, i) => ({ el, r: rects[i] })).sort((a, b) => dir2 === "row" ? a.r.x - b.r.x || a.r.y - b.r.y : a.r.y - b.r.y || a.r.x - b.r.x);
    const gaps = [];
    for (let i = 0; i < order.length - 1; i++) {
      const a = order[i].r;
      const b = order[i + 1].r;
      gaps.push(Math.max(0, dir2 === "row" ? b.x - (a.x + a.w) : b.y - (a.y + a.h)));
    }
    const gap = Math.round(median(gaps));
    const ends = (f) => order.map((o) => f(o.r));
    const spread = (arr) => Math.max(...arr) - Math.min(...arr);
    let align2 = "flex-start";
    if (dir2 === "row") {
      const t = spread(ends((r) => r.y));
      const c = spread(ends((r) => r.y + r.h / 2));
      const b = spread(ends((r) => r.y + r.h));
      align2 = c + 0.5 < t && c <= b ? "center" : b + 0.5 < t ? "flex-end" : "flex-start";
    } else {
      const l = spread(ends((r) => r.x));
      const c = spread(ends((r) => r.x + r.w / 2));
      const rr = spread(ends((r) => r.x + r.w));
      align2 = c + 0.5 < l && c <= rr ? "center" : rr + 0.5 < l ? "flex-end" : "flex-start";
    }
    const parent = lca(els);
    if (!parent) return { ok: false, msg: "Could not group these" };
    const domFirst = els.slice().sort((a, b) => a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1)[0];
    const anchor = childOf(parent, domFirst);
    begin("Group");
    const first = captureRects(els);
    const wrap = document.createElement("div");
    wrap.setAttribute("data-pd-group", "");
    touch(wrap);
    for (const el of els) touch(el);
    const rec = markCreated(wrap);
    rec.name = "New group";
    rec.css = {
      display: "flex",
      "flex-direction": dir2,
      gap: gap + "px",
      "align-items": align2,
      "box-sizing": "border-box",
      "max-width": "100%",
      width: "fit-content"
    };
    parent.insertBefore(wrap, anchor);
    applyRec(rec);
    for (const o of order) {
      const r = ensureRec(o.el);
      wrap.appendChild(o.el);
      r.tx = 0;
      r.ty = 0;
      r.mr = null;
      r.mb = null;
      r.css = { ...r.css, margin: "0px" };
      applyRec(r);
    }
    commit();
    flip(first);
    setSelection([elItem(wrap)]);
    requestCollect();
    return { ok: true, msg: `Grouped ${els.length} into a ${dir2 === "row" ? "row" : "column"} · gap ${gap}px` };
  }
  function makeFlex(el) {
    const kids = flowChildren(el);
    if (!kids.length) return { ok: false, msg: "Select 2 or more things to group" };
    const cs = getComputedStyle(el);
    if (cs.display.includes("flex")) return { ok: true, msg: "Already a flex box — use the panel to change it" };
    const dir2 = arrangement(kids.map((k) => k.r));
    const gaps = [];
    const sorted = kids.slice().sort((a, b) => dir2 === "row" ? a.r.x - b.r.x : a.r.y - b.r.y);
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i].r;
      const b = sorted[i + 1].r;
      gaps.push(Math.max(0, dir2 === "row" ? b.x - (a.x + a.w) : b.y - (a.y + a.h)));
    }
    begin("Make flex");
    touch(el);
    const first = captureRects(kids.map((k) => k.el));
    setCss(el, { display: cs.display.startsWith("inline") ? "inline-flex" : "flex", "flex-direction": dir2, gap: Math.round(median(gaps)) + "px" });
    commit();
    flip(first);
    requestCollect();
    return { ok: true, msg: `Turned into a flex ${dir2}` };
  }
  function ungroup() {
    const els = selEls().filter((e) => !isRootish(e));
    if (!els.length) return { ok: false, msg: "Select a group to ungroup" };
    const target = els[0];
    const parent = target.parentElement;
    if (!parent) return { ok: false, msg: "Cannot ungroup this" };
    const kidsEl = [...target.children];
    if (!kidsEl.length) return { ok: false, msg: "Nothing inside to ungroup" };
    begin("Ungroup");
    const first = captureRects([...kidsEl, ...[...parent.children]]);
    touch(target);
    const nodes = [...target.childNodes];
    for (const n of nodes) if (n.nodeType === 1) touch(n);
    for (const n of nodes) parent.insertBefore(n, target);
    parent.removeChild(target);
    for (const k of kidsEl) {
      const r = getRec(k);
      if (r && r.css.margin === "0px") {
        delete r.css.margin;
        applyRec(r);
      }
    }
    commit();
    flip(first);
    setSelection(kidsEl.filter((k) => k.isConnected).map(elItem));
    requestCollect();
    return { ok: true, msg: `Ungrouped ${kidsEl.length} item${kidsEl.length === 1 ? "" : "s"}` };
  }
  function flexInfo(el) {
    const cs = getComputedStyle(el);
    return {
      display: cs.display,
      isFlex: cs.display.includes("flex"),
      isGrid: cs.display.includes("grid"),
      dir: cs.flexDirection,
      wrap: cs.flexWrap,
      justify: cs.justifyContent,
      align: cs.alignItems,
      gap: cssPx(cs.columnGap),
      rowGap: cssPx(cs.rowGap)
    };
  }
  function setFlexProp(el, props, label = "Flex") {
    const kids = [...el.children];
    begin(label);
    touch(el);
    const first = captureRects(kids);
    setCss(el, props);
    commit();
    flip(first);
    requestCollect();
  }
  function refRect(items) {
    if (items.length > 1) return union(items.map(itemRect));
    const it = items[0];
    if (it.kind === "el") {
      const p = it.el.parentElement;
      if (p && !isRootish(p)) {
        const r = rectOf(p);
        const cs = getComputedStyle(p);
        return {
          x: r.x + cssPx(cs.borderLeftWidth) + cssPx(cs.paddingLeft),
          y: r.y + cssPx(cs.borderTopWidth) + cssPx(cs.paddingTop),
          w: r.w - cssPx(cs.borderLeftWidth) - cssPx(cs.borderRightWidth) - cssPx(cs.paddingLeft) - cssPx(cs.paddingRight),
          h: r.h - cssPx(cs.borderTopWidth) - cssPx(cs.borderBottomWidth) - cssPx(cs.paddingTop) - cssPx(cs.paddingBottom)
        };
      }
    }
    return { x: 0, y: 0, w: app.vw, h: app.vh };
  }
  function align(how, items = app.sel) {
    items = items.filter((it) => it.kind === "shape" || it.el.isConnected);
    if (!items.length) return { ok: false, msg: "Select something to align" };
    const B = refRect(items);
    begin("Align");
    const states = items.map(startState);
    for (const st of states) {
      const r = { ...st.rect };
      if (how === "left") r.x = B.x;
      if (how === "hcenter") r.x = B.x + B.w / 2 - r.w / 2;
      if (how === "right") r.x = B.x + B.w - r.w;
      if (how === "top") r.y = B.y;
      if (how === "vcenter") r.y = B.y + B.h / 2 - r.h / 2;
      if (how === "bottom") r.y = B.y + B.h - r.h;
      applyRect(st, r, false);
    }
    commit();
    liveFor(80);
    return { ok: true, msg: "Aligned " + how.replace("hcenter", "center").replace("vcenter", "middle") };
  }
  function distribute(axis, items = app.sel) {
    items = items.filter((it) => it.kind === "shape" || it.el.isConnected);
    if (items.length < 3) {
      if (items.length === 2) return { ok: true, msg: "Spacing is already even with 2 — drag the pink handle to change it" };
      return { ok: false, msg: "Select 3 or more to space evenly" };
    }
    begin("Even spacing");
    const states = items.map(startState).sort((a, b) => axis === "x" ? a.rect.x - b.rect.x : a.rect.y - b.rect.y);
    const first = states[0].rect;
    const last = states[states.length - 1].rect;
    const span = axis === "x" ? last.x + last.w - first.x : last.y + last.h - first.y;
    const total = states.reduce((s, st) => s + (axis === "x" ? st.rect.w : st.rect.h), 0);
    const gap = (span - total) / (states.length - 1);
    let pos = axis === "x" ? first.x : first.y;
    for (const st of states) {
      const r = { ...st.rect };
      if (axis === "x") r.x = pos;
      else r.y = pos;
      applyRect(st, r, false);
      pos += (axis === "x" ? r.w : r.h) + gap;
    }
    commit();
    liveFor(80);
    return { ok: true, msg: `Even spacing · ${Math.round(gap)}px` };
  }
  function visualOrder(kids, parent) {
    const cs = getComputedStyle(parent);
    const disp = cs.display;
    const row = disp.includes("flex") ? !cs.flexDirection.startsWith("column") : disp.includes("grid");
    const items = kids.map((el) => ({ el, r: rectOf(el) }));
    items.sort((a, b) => {
      const ay = a.r.y + a.r.h / 2;
      const by = b.r.y + b.r.h / 2;
      const ax = a.r.x + a.r.w / 2;
      const bx = b.r.x + b.r.w / 2;
      if (row) {
        const sameLine = Math.abs(ay - by) < Math.min(a.r.h, b.r.h) / 2;
        return sameLine ? ax - bx : ay - by;
      }
      const sameCol = Math.abs(ax - bx) < Math.min(a.r.w, b.r.w) / 2 && disp.includes("grid");
      return sameCol ? ay - by : ay - by || ax - bx;
    });
    if (cs.flexDirection.endsWith("reverse")) items.reverse();
    return items.map((i) => i.el);
  }
  function pulseReflow(origin) {
    const edited = allRecs().filter((r) => r.el.isConnected && !r.created && isEdited(r));
    if (origin) pulse(origin.x, origin.y, "rgba(124,58,237,ALPHA)", 820, 1);
    if (!edited.length) return { ok: true, msg: "Nothing to reflow yet — move or resize something first" };
    begin("Reflow");
    const parents = new Set(edited.map((r) => r.el.parentElement).filter(Boolean));
    const watch = /* @__PURE__ */ new Set();
    for (const p of parents) for (const k of p.children) watch.add(k);
    for (const r of edited) watch.add(r.el);
    const first = captureRects([...watch]);
    for (const p of parents) {
      const kids = [...p.children].filter((k) => {
        if (k === app.host) return false;
        const cs = getComputedStyle(k);
        return cs.display !== "none" && cs.position !== "absolute" && cs.position !== "fixed";
      });
      const moved = kids.some((k) => {
        const r = getRec(k);
        return r && (Math.abs(r.tx) > 0.5 || Math.abs(r.ty) > 0.5);
      });
      const texty = [...p.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim());
      if (!moved || texty || kids.length < 2) continue;
      const order = visualOrder(kids, p);
      const changed = order.some((el, i) => el !== kids[i]);
      if (!changed) continue;
      for (const k of kids) touch(k);
      const anchor = kids[kids.length - 1].nextSibling;
      for (const el of order) p.insertBefore(el, anchor);
    }
    for (const r of edited) {
      touch(r.el);
      r.tx = 0;
      r.ty = 0;
      r.mr = null;
      r.mb = null;
      if (r.deleted) r.collapsed = true;
      if (r.w != null) {
        const p = r.el.parentElement;
        if (p && !isRootish(p)) {
          const cs = getComputedStyle(p);
          const inner = p.clientWidth - cssPx(cs.paddingLeft) - cssPx(cs.paddingRight);
          if (inner > 20 && r.w > inner) r.w = inner;
        }
      }
      applyRec(r);
    }
    commit();
    flip(first);
    requestCollect();
    return { ok: true, msg: `Reflowed ${edited.length} edit${edited.length === 1 ? "" : "s"} into the layout` };
  }
  function siblingsRects(el) {
    const p = el.parentElement;
    if (!p) return [];
    return flowChildren(p).filter((k) => k.el !== el && !deepContains(k.el, el) && !deepContains(el, k.el));
  }
  function contentBox(p) {
    const r = rectOf(p);
    const cs = getComputedStyle(p);
    return {
      x: r.x + cssPx(cs.borderLeftWidth) + cssPx(cs.paddingLeft),
      y: r.y + cssPx(cs.borderTopWidth) + cssPx(cs.paddingTop),
      w: p.clientWidth - cssPx(cs.paddingLeft) - cssPx(cs.paddingRight),
      h: p.clientHeight - cssPx(cs.paddingTop) - cssPx(cs.paddingBottom)
    };
  }
  function nearest(v, list, th) {
    let best = null;
    for (const t of list) {
      const d = t - v;
      if (Math.abs(d) <= th && (best == null || Math.abs(d) < Math.abs(best))) best = d;
    }
    return best;
  }
  function magicFix(origin) {
    let targets = allRecs().filter((r) => r.el.isConnected && !r.created && !r.deleted && (Math.abs(r.tx) > 0.5 || Math.abs(r.ty) > 0.5 || r.w != null || r.h != null));
    let items = targets.map((r) => elItem(r.el));
    const shapeSel = app.sel.filter((s) => s.kind === "shape");
    if (!items.length && app.sel.length) items = app.sel.slice();
    else items = items.concat(shapeSel);
    if (origin) pulse(origin.x, origin.y, "rgba(236,72,153,ALPHA)", 650, 0.35);
    if (!items.length) return { ok: true, msg: "Nothing to fix — everything is where the page put it" };
    begin("Magic fix");
    const states = items.map(startState);
    const firstMap = /* @__PURE__ */ new Map();
    for (const st of states) {
      const r = { ...st.rect };
      let refs = [];
      let box = null;
      if (st.it.kind === "el") {
        refs = siblingsRects(st.it.el).map((k) => k.r);
        const p = st.it.el.parentElement;
        if (p && !isRootish(p)) box = contentBox(p);
      } else {
        refs = (app.state.canvasMode ? app.shapes.canvas : app.shapes.page).filter((s) => s !== st.it.shape).map((s) => ({ x: s.x - (s.space === "page" ? window.scrollX : 0), y: s.y - (s.space === "page" ? window.scrollY : 0), w: s.w, h: s.h }));
        box = { x: 0, y: 0, w: app.vw, h: app.vh };
      }
      for (const o of refs) {
        if (Math.abs(o.w - r.w) / Math.max(o.w, 1) < 0.06 && Math.abs(o.w - r.w) > 0.5) r.w = o.w;
        if (Math.abs(o.h - r.h) / Math.max(o.h, 1) < 0.06 && Math.abs(o.h - r.h) > 0.5) r.h = o.h;
      }
      r.w = Math.round(r.w);
      r.h = Math.round(r.h);
      const xs = [];
      const ys = [];
      for (const o of refs) {
        xs.push(o.x, o.x + o.w / 2, o.x + o.w);
        ys.push(o.y, o.y + o.h / 2, o.y + o.h);
      }
      if (box) {
        xs.push(box.x, box.x + box.w / 2, box.x + box.w);
        ys.push(box.y, box.y + box.h / 2, box.y + box.h);
      }
      const TH = 10;
      let best = null;
      for (const [f, off] of [[r.x, 0], [r.x + r.w / 2, r.w / 2], [r.x + r.w, r.w]]) {
        const d = nearest(f, xs, TH);
        if (d != null && (best == null || Math.abs(d) < Math.abs(best))) best = d;
      }
      if (best != null) r.x += best;
      best = null;
      for (const f of [r.y, r.y + r.h / 2, r.y + r.h]) {
        const d = nearest(f, ys, TH);
        if (d != null && (best == null || Math.abs(d) < Math.abs(best))) best = d;
      }
      if (best != null) r.y += best;
      if (box && box.w > 20) {
        if (r.w > box.w) r.w = box.w;
        if (r.x < box.x) r.x = box.x;
        if (r.x + r.w > box.x + box.w) r.x = box.x + box.w - r.w;
      }
      if (r.x < 0) r.x = 0;
      if (r.x + r.w > app.vw) r.x = Math.max(0, app.vw - r.w);
      r.x = Math.round(r.x);
      r.y = Math.round(r.y);
      if (st.it.kind === "el") firstMap.set(st.it.el, st.rect);
      applyRect(st, r);
    }
    const byParent = /* @__PURE__ */ new Map();
    for (const st of states) {
      if (st.it.kind !== "el") continue;
      const p = st.it.el.parentElement;
      if (!p) continue;
      if (!byParent.has(p)) byParent.set(p, []);
      byParent.get(p).push(st.it.el);
    }
    for (const [p] of byParent) {
      const kids = flowChildren(p);
      if (kids.length < 3) continue;
      const dir2 = arrangement(kids.map((k) => k.r));
      const sorted = kids.slice().sort((a, b) => dir2 === "row" ? a.r.x - b.r.x : a.r.y - b.r.y);
      const gaps = [];
      let ok = true;
      for (let i = 0; i < sorted.length - 1; i++) {
        const a = sorted[i].r;
        const b = sorted[i + 1].r;
        const g = dir2 === "row" ? b.x - (a.x + a.w) : b.y - (a.y + a.h);
        if (g < -1) ok = false;
        gaps.push(g);
      }
      if (!ok) continue;
      const m = median(gaps);
      const spread = Math.max(...gaps) - Math.min(...gaps);
      if (spread < 1 || spread > 18) continue;
      let pos = dir2 === "row" ? sorted[0].r.x : sorted[0].r.y;
      for (const k of sorted) {
        const r = { ...k.r };
        if (dir2 === "row") r.x = Math.round(pos);
        else r.y = Math.round(pos);
        pos += (dir2 === "row" ? r.w : r.h) + m;
        const moved = dir2 === "row" ? Math.abs(r.x - k.r.x) > 0.5 : Math.abs(r.y - k.r.y) > 0.5;
        if (!moved) continue;
        const st = startState(elItem(k.el));
        if (!firstMap.has(k.el)) firstMap.set(k.el, st.rect);
        applyRect(st, r, false);
      }
    }
    commit();
    flip(firstMap);
    return { ok: true, msg: `Tidied ${items.length} thing${items.length === 1 ? "" : "s"}` };
  }
  function resetAll() {
    const list = allRecs();
    if (!list.length) return { ok: true, msg: "Nothing to reset" };
    begin("Reset all");
    const watch = /* @__PURE__ */ new Set();
    for (const r of list) {
      if (!r.el.isConnected && !r.origParent) continue;
      touch(r.el);
      if (r.el.parentElement) for (const k of r.el.parentElement.children) watch.add(k);
    }
    const first = captureRects([...watch]);
    for (let pass = 0; pass < 2; pass++) {
      for (let i = list.length - 1; i >= 0; i--) {
        const r = list[i];
        if (!r.origParent) {
          if (r.el.parentNode) {
            for (const n of [...r.el.childNodes]) r.el.parentNode.insertBefore(n, r.el);
            r.el.parentNode.removeChild(r.el);
          }
          continue;
        }
        if (r.el.parentNode !== r.origParent || r.el.nextSibling !== r.origNext) {
          if (r.origNext && r.origNext.parentNode === r.origParent) r.origParent.insertBefore(r.el, r.origNext);
          else r.origParent.appendChild(r.el);
        }
      }
    }
    for (const r of list) {
      if (!r.origParent) continue;
      r.tx = 0;
      r.ty = 0;
      r.w = null;
      r.h = null;
      r.mr = null;
      r.mb = null;
      r.deleted = false;
      r.collapsed = false;
      r.css = {};
      if (r.origStyle == null) r.el.removeAttribute("style");
      else r.el.style.cssText = r.origStyle;
    }
    commit();
    flip(first);
    setSelection(app.sel.filter((s) => s.kind === "shape" || s.el.isConnected));
    requestCollect();
    requestFull();
    return { ok: true, msg: "Page put back the way it was" };
  }

  // src/content/exporttext.js
  function dir(n, pos, neg) {
    return `${Math.round(Math.abs(n))}px ${n >= 0 ? pos : neg}`;
  }
  function ctxFor(el) {
    const c = app.candByEl.get(el);
    if (c) return c;
    const p = el.parentElement;
    if (!p) return { pw: app.vw, ph: app.vh };
    const cs = getComputedStyle(p);
    return {
      pw: p.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) || app.vw,
      ph: p.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) || app.vh,
      fs: parseFloat(getComputedStyle(el).fontSize) || app.rootFS
    };
  }
  function flexWords(f) {
    const d = f.dir.startsWith("column") ? "column (stacked)" : "row (side by side)";
    const parts = [`flex ${d}`];
    if (f.gap) parts.push(`gap ${Math.round(f.gap)}px`);
    if (f.justify && f.justify !== "normal" && f.justify !== "flex-start" && f.justify !== "start") parts.push(`justify-content ${f.justify}`);
    if (f.align && f.align !== "normal" && f.align !== "stretch") parts.push(`align-items ${f.align}`);
    if (f.wrap === "wrap") parts.push("wraps");
    return parts.join(", ");
  }
  function buildEditsText() {
    const lines = [];
    const url = location.origin + location.pathname;
    lines.push(`Precise Dimension edits for ${url}`);
    lines.push(`Viewport ${app.vw} × ${app.vh}px · sizes shown in px${app.state.unit !== "px" ? ` and ${app.state.unit}` : ""}`);
    lines.push("");
    const recs2 = allRecs().filter((r) => r.el.isConnected && isEdited(r));
    const groups = recs2.filter((r) => r.created);
    const grouped = /* @__PURE__ */ new Set();
    let n = 0;
    for (const g of groups) {
      const kids = [...g.el.children];
      kids.forEach((k) => grouped.add(k));
      const f = flexInfo(g.el);
      const where = g.el.parentElement && !isRootish(g.el.parentElement) ? ` inside ${describe(g.el.parentElement)} (\`${selectorFor(g.el.parentElement)}\`)` : "";
      n++;
      lines.push(`${n}. New wrapper${where}: ${flexWords(f)}.`);
      lines.push(`   Contains, in order: ${kids.map((k) => describe(k)).join(", ")}.`);
    }
    for (const r of recs2) {
      if (r.created) continue;
      const el = r.el;
      const c = ctxFor(el);
      const out = [];
      const now = rectOf(el);
      if (r.collapsed) out.push("remove it (the space it took is closed up)");
      else if (r.deleted) out.push("hide/remove it (its space stays empty for now)");
      else {
        const sizeChanged = Math.abs(now.w - r.orig.w) > 0.5 || Math.abs(now.h - r.orig.h) > 0.5;
        if (sizeChanged) {
          const parts = [];
          if (Math.abs(now.w - r.orig.w) > 0.5) parts.push(`width ${both(r.orig.w, "w", c)} → ${both(now.w, "w", c)}`);
          if (Math.abs(now.h - r.orig.h) > 0.5) parts.push(`height ${both(r.orig.h, "h", c)} → ${both(now.h, "h", c)}`);
          out.push(parts.join("; "));
        }
        const dx = Math.abs(r.tx) > 0.5 ? r.tx : 0;
        const dy = Math.abs(r.ty) > 0.5 ? r.ty : 0;
        if (dx || dy) {
          const mv = [];
          if (dx) mv.push(dir(dx, "right", "left"));
          if (dy) mv.push(dir(dy, "down", "up"));
          out.push(`move it ${mv.join(" and ")} (keep everything around it where it is)`);
        }
        if (el.parentNode !== r.origParent && !grouped.has(el)) {
          out.push(`move it into ${describe(el.parentElement)} (\`${selectorFor(el.parentElement)}\`)`);
        } else if (el.parentNode === r.origParent && el.nextSibling !== r.origNext && !grouped.has(el)) {
          const prev = el.previousElementSibling;
          out.push(prev ? `place it right after ${describe(prev)}` : "make it the first item in its container");
        }
        if (Object.keys(r.css).some((p) => /^(display|flex|gap|justify|align)/.test(p))) {
          const f = flexInfo(el);
          const was = [];
          if (r.o.display !== f.display) was.push(`display ${r.o.display} → ${f.display}`);
          if (f.isFlex) {
            if (r.o.flexDirection !== f.dir) was.push(`direction ${r.o.flexDirection} → ${f.dir}`);
            if (r.o.justifyContent !== f.justify) was.push(`justify-content ${r.o.justifyContent} → ${f.justify}`);
            if (r.o.alignItems !== f.align) was.push(`align-items ${r.o.alignItems} → ${f.align}`);
            if (r.o.flexWrap !== f.wrap) was.push(`wrap ${r.o.flexWrap} → ${f.wrap}`);
          }
          if (parseFloat(r.o.gap) !== f.gap) was.push(`gap ${Math.round(parseFloat(r.o.gap) || 0)}px → ${Math.round(f.gap)}px`);
          if (was.length) out.push(`layout: ${was.join(", ")}`);
        }
      }
      if (!out.length) continue;
      n++;
      lines.push(`${n}. ${r.name} (\`${r.selector}\`): ${out.join("; ")}.`);
    }
    const shapes = app.shapes.page;
    if (shapes.length) {
      lines.push("");
      lines.push("Boxes I drew on the page (spots for new or resized things):");
      shapes.forEach((s, i) => {
        const vx = s.x - window.scrollX;
        const vy = s.y - window.scrollY;
        let over = "";
        const cxp = Math.min(Math.max(vx + 1, 0), app.vw - 1);
        const cyp = Math.min(Math.max(vy + 1, 0), app.vh - 1);
        if (vx >= 0 && vy >= 0 && vx < app.vw && vy < app.vh) {
          const stack = document.elementsFromPoint(cxp, cyp).filter((e) => e !== app.host && !isRootish(e));
          if (stack[0]) {
            const pr = rectOf(stack[0]);
            over = ` — top-left corner is inside ${describe(stack[0])} (\`${selectorFor(stack[0])}\`), ${Math.round(vx - pr.x)}px from its left and ${Math.round(vy - pr.y)}px from its top`;
          }
        }
        lines.push(`- Box ${i + 1}: ${fmt(s.w, "w")} × ${fmt(s.h, "h")} (${Math.round(s.w)} × ${Math.round(s.h)}px), ${Math.round(s.x)}px from the page's left, ${Math.round(s.y)}px from the page's top${over}.`);
      });
    }
    const canvasShapes = app.shapes.canvas;
    if (canvasShapes.length) {
      lines.push("");
      lines.push(`Layout sketched on the blank canvas (screen ${app.vw} × ${app.vh}px):`);
      canvasShapes.slice().sort((a, b) => a.y - b.y || a.x - b.x).forEach((s, i) => {
        lines.push(`- Box ${i + 1}: ${fmt(s.w, "w")} × ${fmt(s.h, "h")} (${Math.round(s.w)} × ${Math.round(s.h)}px) at ${fmt(s.x, "w")} from the left, ${fmt(s.y, "h")} from the top.`);
      });
    }
    if (n === 0 && !shapes.length && !canvasShapes.length) return null;
    if (n === 0) {
      lines.splice(3, 0, "No changes to page elements yet.");
    }
    return lines.join("\n");
  }

  // src/content/png.js
  var CRC = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    let c = 4294967295;
    for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 255] ^ c >>> 8;
    return (c ^ 4294967295) >>> 0;
  }
  function chunk(type, data) {
    const out = new Uint8Array(12 + data.length);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
    return out;
  }
  var PngWriter = class {
    constructor(width, height) {
      this.w = width;
      this.h = height;
      this.rows = 0;
      this.prev = new Uint8Array(width * 3);
      const cs = new CompressionStream("deflate");
      this.writer = cs.writable.getWriter();
      this.parts = [];
      const reader = cs.readable.getReader();
      this.drained = (async () => {
        for (; ; ) {
          const { value, done } = await reader.read();
          if (done) return;
          this.parts.push(value);
        }
      })();
    }
    // rgba: pixels straight from getImageData (width × rows × 4). Stored as RGB: screenshots are opaque.
    async addRows(rgba, rows) {
      const w = this.w;
      const line = 1 + w * 3;
      const out = new Uint8Array(line * rows);
      const prev = this.prev;
      for (let y = 0; y < rows; y++) {
        let o = y * line;
        out[o++] = 2;
        let si = y * w * 4;
        for (let p = 0; p < w * 3; p += 3) {
          const r = rgba[si];
          const g = rgba[si + 1];
          const b = rgba[si + 2];
          out[o] = r - prev[p];
          out[o + 1] = g - prev[p + 1];
          out[o + 2] = b - prev[p + 2];
          prev[p] = r;
          prev[p + 1] = g;
          prev[p + 2] = b;
          o += 3;
          si += 4;
        }
      }
      this.rows += rows;
      await this.writer.write(out);
    }
    async finish() {
      if (this.rows !== this.h) throw new Error(`PNG got ${this.rows} of ${this.h} rows`);
      await this.writer.close();
      await this.drained;
      const ihdr = new Uint8Array(13);
      const dv = new DataView(ihdr.buffer);
      dv.setUint32(0, this.w);
      dv.setUint32(4, this.h);
      ihdr[8] = 8;
      ihdr[9] = 2;
      const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr)];
      let pending = [];
      let size = 0;
      const flush = () => {
        if (!size) return;
        const data = new Uint8Array(size);
        let o = 0;
        for (const p of pending) {
          data.set(p, o);
          o += p.length;
        }
        parts.push(chunk("IDAT", data));
        pending = [];
        size = 0;
      };
      for (const p of this.parts) {
        pending.push(p);
        size += p.length;
        if (size >= 1 << 20) flush();
      }
      flush();
      parts.push(chunk("IEND", new Uint8Array(0)));
      this.parts = [];
      return new Blob(parts, { type: "image/png" });
    }
  };

  // src/content/capture.js
  var GAP = 560;
  var MAX_SLICES = 150;
  var MAX_CSS_H = 25e4;
  var CANVAS_MAX_H = 16384;
  var CANVAS_MAX_AREA = 8e7;
  var lastCapture = 0;
  var stopFlag = false;
  var Stopped = class extends Error {
    constructor() {
      super("Screenshot stopped");
      this.stopped = true;
    }
  };
  function stopCapture() {
    stopFlag = true;
  }
  var NOHUD = { show() {
  }, hide() {
  }, phase() {
  }, progress() {
  }, snap() {
  }, previewStart() {
  }, previewDraw() {
  } };
  function dataUrlToBlob(url) {
    const comma = url.indexOf(",");
    const meta = url.slice(5, comma);
    const bin = atob(url.slice(comma + 1));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: meta.split(";")[0] || "image/png" });
  }
  async function waitSlot() {
    const wait = GAP - (performance.now() - lastCapture);
    if (wait > 0) await sleep(wait);
  }
  async function grab() {
    for (let attempt = 0; ; attempt++) {
      await waitSlot();
      lastCapture = performance.now();
      const res = await chrome.runtime.sendMessage({ type: "pd:capture" });
      if (res && res.ok) return res.dataUrl;
      const err = res && res.error || "Screenshot failed";
      if (attempt < 2 && /MAX_CAPTURE|quota|per second/i.test(err)) {
        await sleep(700);
        continue;
      }
      throw new Error(err);
    }
  }
  async function prepare() {
    app.state.capturing = true;
    app.root.classList.add("capturing");
    app.wave = null;
    const done = performance.now() - 5e3;
    for (const c of app.cands) if (c.at > done) c.at = done;
    requestFull();
    await frames(3);
  }
  function unprepare() {
    app.state.capturing = false;
    app.root.classList.remove("capturing");
    requestRender();
  }
  async function captureVisible() {
    await prepare();
    try {
      return dataUrlToBlob(await grab());
    } finally {
      unprepare();
    }
  }
  function docScroller() {
    const de = document.documentElement;
    const se = document.scrollingElement || de;
    const quirks = document.compatMode === "BackCompat" && document.body;
    const x0 = window.scrollX;
    return {
      kind: "doc",
      el: se,
      top: () => window.scrollY,
      to: (y) => window.scrollTo({ left: x0, top: y, behavior: "instant" }),
      height: () => se.scrollHeight,
      view: () => {
        let w = quirks ? document.body.clientWidth : de.clientWidth;
        let h = quirks ? document.body.clientHeight : de.clientHeight;
        if (!(w > 0 && w <= window.innerWidth)) w = window.innerWidth;
        if (!(h > 0 && h <= window.innerHeight)) h = window.innerHeight;
        return { x: 0, y: 0, w, h };
      }
    };
  }
  function elScroller(el) {
    return {
      kind: "el",
      el,
      top: () => el.scrollTop,
      to: (y) => el.scrollTo({ left: el.scrollLeft, top: y, behavior: "instant" }),
      height: () => el.scrollHeight,
      view: () => {
        const r = el.getBoundingClientRect();
        return { x: r.left + el.clientLeft, y: r.top + el.clientTop, w: el.clientWidth, h: el.clientHeight };
      }
    };
  }
  function pickScroller() {
    const doc = docScroller();
    if (doc.height() - doc.view().h > 4) return doc;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let best = null;
    const seen = /* @__PURE__ */ new Set();
    for (const [fx, fy] of [[0.5, 0.5], [0.3, 0.55], [0.7, 0.55], [0.5, 0.8], [0.5, 0.3]]) {
      let list;
      try {
        list = document.elementsFromPoint(vw * fx, vh * fy);
      } catch {
        continue;
      }
      const hit = list.find((e) => e !== app.host && !isOurs(e));
      for (let e = hit; e && e !== document.documentElement; e = parentOf(e)) {
        if (seen.has(e)) continue;
        seen.add(e);
        if (e.scrollHeight - e.clientHeight < 8) continue;
        let oy;
        try {
          oy = getComputedStyle(e).overflowY;
        } catch {
          continue;
        }
        if (oy !== "auto" && oy !== "scroll" && oy !== "overlay") continue;
        const r = e.getBoundingClientRect();
        const w = Math.min(r.right, vw) - Math.max(r.left, 0);
        const h = Math.min(r.bottom, vh) - Math.max(r.top, 0);
        if (w <= 0 || h <= 0 || w * h < vw * vh * 0.18) continue;
        if (r.top < -1 || r.bottom > vh + 1) continue;
        if (!best || w * h > best.area) best = { e, area: w * h };
      }
    }
    return best ? elScroller(best.e) : null;
  }
  var Saver = class {
    constructor() {
      this.list = [];
    }
    set(el, prop, val) {
      this.list.push([el, prop, el.style.getPropertyValue(prop), el.style.getPropertyPriority(prop)]);
      el.style.setProperty(prop, val, "important");
    }
    restore() {
      for (let i = this.list.length - 1; i >= 0; i--) {
        const [el, p, v, pr] = this.list[i];
        if (v) el.style.setProperty(p, v, pr);
        else el.style.removeProperty(p);
      }
      this.list = [];
    }
  };
  function hideScrollbar(sc, keep) {
    if (sc.kind === "doc") {
      const de = document.documentElement;
      if (window.innerWidth - de.clientWidth <= 0) keep.set(de, "scrollbar-width", "none");
      return;
    }
    const el = sc.el;
    let cs;
    try {
      cs = getComputedStyle(el);
    } catch {
      return;
    }
    const gutter = el.offsetWidth - el.clientWidth - parseFloat(cs.borderLeftWidth || 0) - parseFloat(cs.borderRightWidth || 0);
    if (gutter < 0.5) keep.set(el, "scrollbar-width", "none");
    else keep.set(el, "scrollbar-color", "transparent transparent");
  }
  function scanPositioned() {
    const sticky = [];
    const fixed = [];
    const all = document.body ? document.body.querySelectorAll("*") : [];
    for (const el of all) {
      if (el === app.host) continue;
      let pos;
      try {
        pos = getComputedStyle(el).position;
      } catch {
        continue;
      }
      if (pos === "sticky" || pos === "-webkit-sticky") sticky.push(el);
      else if (pos === "fixed") fixed.push(el);
    }
    return { sticky, fixed };
  }
  function paintsItself(el) {
    const tag = el.tagName;
    if (tag === "IMG" || tag === "VIDEO" || tag === "CANVAS" || tag === "svg" || tag === "PICTURE") return true;
    let cs;
    try {
      cs = getComputedStyle(el);
    } catch {
      return false;
    }
    if (cs.backgroundImage && cs.backgroundImage !== "none") return true;
    const m = /rgba?\(([^)]+)\)/.exec(cs.backgroundColor || "");
    if (!m) return false;
    const parts = m[1].split(/[\s,/]+/).filter(Boolean);
    const a = parts.length >= 4 ? parseFloat(parts[3]) * (parts[3].endsWith("%") ? 0.01 : 1) : 1;
    return a > 0.05;
  }
  function behindContent(el, r) {
    const x1 = Math.max(r.left, 0);
    const x2 = Math.min(r.right, window.innerWidth);
    const y1 = Math.max(r.top, 0);
    const y2 = Math.min(r.bottom, window.innerHeight);
    let front = 0;
    for (const [fx, fy] of [[0.5, 0.5], [0.2, 0.3], [0.8, 0.7]]) {
      let top = null;
      try {
        top = document.elementsFromPoint(x1 + (x2 - x1) * fx, y1 + (y2 - y1) * fy).find((e) => e !== app.host && !isOurs(e)) || null;
      } catch {
      }
      if (top && (top === el || deepContains(el, top))) front++;
    }
    return front < 2;
  }
  function classifyFixed(list) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const out = [];
    for (const el of list) {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      if (r.bottom <= 0 || r.top >= vh || r.right <= 0 || r.left >= vw) continue;
      if (paintsItself(el) && behindContent(el, r)) continue;
      out.push({ el, bottom: r.top + r.height / 2 > vh * 0.55 && r.height < vh * 0.7 });
    }
    return out;
  }
  var Hider = class {
    constructor(items) {
      this.items = items.map((it) => ({ ...it, v: it.el.style.getPropertyValue("visibility"), p: it.el.style.getPropertyPriority("visibility"), off: false }));
    }
    set(it, off) {
      if (it.off === off) return;
      it.off = off;
      if (off) it.el.style.setProperty("visibility", "hidden", "important");
      else if (it.v) it.el.style.setProperty("visibility", it.v, it.p);
      else it.el.style.removeProperty("visibility");
    }
    // which: 'all' | 'first' | 'last' | 'none'
    show(which) {
      for (const it of this.items) {
        const on = which === "all" || which === "first" && !it.bottom || which === "last" && it.bottom;
        this.set(it, !on);
      }
      const set = app.hiddenForCapture;
      set.clear();
      for (const it of this.items) {
        if (!it.off) continue;
        set.add(it.el);
        for (const c of app.cands) if (deepContains(it.el, c.el)) set.add(c.el);
      }
    }
    restore() {
      for (const it of this.items) this.set(it, false);
      app.hiddenForCapture.clear();
    }
  };
  async function waitImages(ms) {
    const t0 = performance.now();
    for (; ; ) {
      let pending = 0;
      for (const img of document.images) {
        if (img.complete) continue;
        const r = img.getBoundingClientRect();
        if (r.width < 1 || r.bottom < 0 || r.top > window.innerHeight) continue;
        pending++;
      }
      if (!pending || performance.now() - t0 > ms) return;
      await sleep(80);
    }
  }
  async function loadPass(sc, hud2, check) {
    const view = sc.view();
    const H = sc.height();
    if (H - view.h < 4) return;
    hud2.phase("Loading the whole page…");
    const n = Math.min(60, Math.ceil((H - view.h) / view.h));
    for (let i = 1; i <= n; i++) {
      check();
      sc.to(Math.min(H - view.h, i * view.h));
      await frames(1);
      await sleep(100);
      hud2.progress(0.02 + 0.2 * (i / n));
    }
    await waitImages(1500);
    sc.to(0);
    await frames(2);
    await sleep(200);
  }
  var Stitcher = class {
    constructor(W, H, hud2) {
      this.W = W;
      this.H = H;
      this.hud = hud2;
      this.whole = H <= CANVAS_MAX_H && W * H <= CANVAS_MAX_AREA;
      this.ops = [];
      this.done = 0;
      this.live = /* @__PURE__ */ new Set();
      if (this.whole) {
        this.cv = new OffscreenCanvas(W, H);
        this.g = this.cv.getContext("2d");
        this.g.imageSmoothingEnabled = false;
        this.g.fillStyle = "#fff";
        this.g.fillRect(0, 0, W, H);
      } else {
        this.png = new PngWriter(W, H);
        this.band = Math.max(16, Math.min(512, Math.floor(16e6 / (W * 4))));
        this.bc = new OffscreenCanvas(W, this.band);
        this.bg = this.bc.getContext("2d", { willReadFrequently: true });
        this.bg.imageSmoothingEnabled = false;
      }
      hud2.previewStart(W, H);
    }
    draw(img, sx, sy, sw, sh, dx, dy, dw = sw, dh = sh) {
      if (sw <= 0 || sh <= 0 || dw <= 0 || dh <= 0) return;
      this.hud.previewDraw(img, sx, sy, sw, sh, dx, dy, dw, dh);
      if (this.whole) this.g.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
      else {
        this.ops.push({ img, sx, sy, sw, sh, dx, dy, dw, dh });
        this.live.add(img);
      }
    }
    // Done with this piece (it's freed once nothing still needs it).
    release(img) {
      if (this.whole) img.close();
      else img._free = true;
    }
    // Rows above upTo won't change any more: write them out (strip mode).
    async flush(upTo) {
      if (this.whole) return;
      upTo = Math.min(this.H, Math.round(upTo));
      while (this.done < upTo) {
        const y0 = this.done;
        const n = Math.min(this.band, upTo - y0);
        const g = this.bg;
        g.fillStyle = "#fff";
        g.fillRect(0, 0, this.W, n);
        for (const o of this.ops) if (o.dy < y0 + n && o.dy + o.dh > y0) g.drawImage(o.img, o.sx, o.sy, o.sw, o.sh, o.dx, o.dy - y0, o.dw, o.dh);
        await this.png.addRows(g.getImageData(0, 0, this.W, n).data, n);
        this.done += n;
      }
      this.ops = this.ops.filter((o) => o.dy + o.dh > this.done);
      const still = new Set(this.ops.map((o) => o.img));
      for (const img of this.live) {
        if (!still.has(img) && img._free) {
          img.close();
          this.live.delete(img);
        }
      }
    }
    async finish() {
      if (this.whole) {
        const blob = await this.cv.convertToBlob({ type: "image/png" });
        this.cv.width = 1;
        this.cv.height = 1;
        return blob;
      }
      await this.flush(this.H);
      for (const img of this.live) img.close();
      this.live.clear();
      return this.png.finish();
    }
    abort() {
      for (const img of this.live) {
        try {
          img.close();
        } catch {
        }
      }
      this.live.clear();
      this.ops = [];
    }
  };
  var Layout = class {
    constructor(sc, view, H, maxTop, bmp, hud2) {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      this.bw = bmp.width;
      this.bh = bmp.height;
      const dpr = window.devicePixelRatio || 1;
      const mx = bmp.width / vw;
      const my = bmp.height / vh;
      const kx = Math.abs(mx - dpr) < 0.03 ? dpr : mx;
      const ky = Math.abs(my - dpr) < 0.03 ? dpr : my;
      this.X = (v) => Math.round(v * kx);
      this.Y = (v) => Math.round(v * ky);
      this.view = view;
      this.maxTop = maxTop;
      this.doc = sc.kind === "doc";
      if (this.doc) {
        this.W = Math.min(bmp.width, this.X(view.w));
        this.sliceH = Math.min(bmp.height, this.Y(view.h));
        this.H = Math.max(this.sliceH, this.Y(H));
      } else {
        this.x0 = Math.max(0, this.X(view.x));
        this.x1 = Math.min(bmp.width, this.X(view.x + view.w));
        this.y0 = Math.max(0, this.Y(view.y));
        this.y1 = Math.min(bmp.height, this.Y(view.y + view.h));
        this.extra = Math.max(0, this.Y(H) - (this.y1 - this.y0));
        const de = document.documentElement;
        this.W = Math.min(bmp.width, this.X(de.clientWidth > 0 && de.clientWidth <= vw ? de.clientWidth : vw));
        this.H = bmp.height + this.extra;
      }
      this.out = new Stitcher(this.W, this.H, hud2);
    }
    async add(bmp, t, first, last) {
      const o = this.out;
      const next = Math.min(t + this.view.h, this.maxTop);
      if (this.doc) {
        const dy2 = this.Y(t);
        o.draw(bmp, 0, 0, this.W, Math.min(this.sliceH, this.H - dy2), 0, dy2);
        o.release(bmp);
        await o.flush(last ? this.H : this.Y(next));
        return;
      }
      if (first) this.statics(bmp);
      const dy = this.y0 + this.Y(t);
      o.draw(bmp, this.x0, this.y0, this.x1 - this.x0, Math.min(this.y1 - this.y0, this.y1 + this.extra - dy), this.x0, dy);
      o.release(bmp);
      await o.flush(last ? this.H : this.y0 + this.Y(next));
    }
    // The parts of a web app around its scrolling panel come from the first piece: what's above
    // it goes at the top, what's below it at the bottom, and side bars are stretched by repeating
    // one plain row of pixels (picked where nothing is drawn, so buttons stay crisp).
    statics(bmp) {
      const o = this.out;
      const { W, x0, x1, y0, y1, extra } = this;
      o.draw(bmp, 0, 0, W, y0, 0, 0);
      o.draw(bmp, 0, y1, W, this.bh - y1, 0, y1 + extra);
      for (const [sx, sw] of [[0, x0], [x1, W - x1]]) {
        if (sw <= 0 || y1 - y0 <= 0) continue;
        const q = calmRow(bmp, sx, sw, y0, y1);
        o.draw(bmp, sx, y0, sw, q - y0, sx, y0);
        if (extra > 0) o.draw(bmp, sx, q, sw, 1, sx, q, sw, extra);
        o.draw(bmp, sx, q, sw, y1 - q, sx, q + extra);
      }
    }
  };
  function calmRow(bmp, sx, sw, y0, y1) {
    const h = y1 - y0;
    if (h < 4) return y1 - 1;
    let d;
    try {
      const c = new OffscreenCanvas(sw, h);
      const g = c.getContext("2d", { willReadFrequently: true });
      g.drawImage(bmp, sx, y0, sw, h, 0, 0, sw, h);
      d = g.getImageData(0, 0, sw, h).data;
    } catch {
      return y1 - 1;
    }
    const n = sw * 4;
    const same2 = (a, b) => {
      const oa = a * n;
      const ob = b * n;
      for (let i = 0; i < n; i++) if (Math.abs(d[oa + i] - d[ob + i]) > 2) return false;
      return true;
    };
    let best = null;
    let start = 0;
    for (let r = 1; r <= h; r++) {
      if (r < h && same2(r - 1, r)) continue;
      const len = r - start;
      if (len >= 3 && (!best || len >= best.len)) best = { start, len };
      start = r;
    }
    if (!best) return y1 - 1;
    return y0 + best.start + Math.floor(best.len / 2);
  }
  async function snap(hud2) {
    await waitSlot();
    if (document.visibilityState !== "visible") throw new Error("the tab was switched during the screenshot");
    hud2.snap(true);
    await frames(2);
    try {
      return await grab();
    } finally {
      hud2.snap(false);
    }
  }
  async function captureFull(hud2 = NOHUD) {
    if (app.state.canvasMode) return captureVisible();
    const sc = pickScroller();
    if (!sc) return captureVisible();
    stopFlag = false;
    const check = () => {
      if (stopFlag) throw new Stopped();
    };
    const keep = new Saver();
    const de = document.documentElement;
    const sx0 = window.scrollX;
    const sy0 = window.scrollY;
    const et0 = sc.kind === "el" ? sc.el.scrollTop : 0;
    let hider = null;
    let lay = null;
    hud2.show();
    hud2.phase("Getting the page ready…");
    hud2.progress(0.02);
    await prepare();
    try {
      keep.set(de, "scroll-behavior", "auto");
      if (document.body) keep.set(document.body, "scroll-behavior", "auto");
      if (sc.kind === "el") keep.set(sc.el, "scroll-behavior", "auto");
      hideScrollbar(sc, keep);
      if (document.fonts && document.fonts.ready) await Promise.race([document.fonts.ready, sleep(1200)]);
      await loadPass(sc, hud2, check);
      const pos = scanPositioned();
      for (const el of pos.sticky) {
        if (getRec(el)) continue;
        keep.set(el, "position", "relative");
        for (const p of ["top", "bottom", "left", "right"]) keep.set(el, p, "auto");
      }
      sc.to(0);
      await frames(2);
      await sleep(150);
      hider = new Hider(classifyFixed(pos.fixed));
      const view = sc.view();
      const H = Math.min(sc.height(), MAX_CSS_H);
      const maxTop = Math.max(0, H - view.h);
      const plan = Math.min(MAX_SLICES, Math.ceil(maxTop / Math.max(1, view.h)) + 1);
      let want = 0;
      let prevT = -1;
      for (let k = 0; ; k++) {
        check();
        if (k > 0) {
          sc.to(want);
          await frames(2);
          await sleep(140);
        }
        const t = sc.top();
        const last = t >= maxTop - 0.5 || k >= MAX_SLICES - 1 || k > 0 && t <= prevT + 0.5;
        hider.show(k === 0 && last ? "all" : k === 0 ? "first" : last ? "last" : "none");
        await waitImages(1500);
        requestFull();
        await frames(2);
        hud2.phase(`Capturing ${k + 1} of ${Math.max(plan, k + 1)}`);
        check();
        const url = await snap(hud2);
        const bmp = await createImageBitmap(dataUrlToBlob(url), { colorSpaceConversion: "none", premultiplyAlpha: "none" });
        if (!lay) lay = new Layout(sc, view, H, maxTop, bmp, hud2);
        else if (bmp.width !== lay.bw || bmp.height !== lay.bh) {
          bmp.close();
          throw new Error("the window changed size during the screenshot — try again");
        }
        await lay.add(bmp, t, k === 0, last);
        hud2.progress(0.24 + 0.66 * Math.min(1, (t + view.h) / Math.max(1, H)));
        if (last) break;
        prevT = t;
        want = Math.min(maxTop, t + view.h);
      }
    } catch (err) {
      if (lay) lay.out.abort();
      throw err;
    } finally {
      if (sc.kind === "el") sc.el.scrollTo({ top: et0, left: sc.el.scrollLeft, behavior: "instant" });
      window.scrollTo({ left: sx0, top: sy0, behavior: "instant" });
      if (hider) hider.restore();
      keep.restore();
      unprepare();
      requestFull();
    }
    hud2.phase("Stitching…");
    hud2.progress(0.94);
    const blob = await lay.out.finish();
    blob._w = lay.W;
    blob._h = lay.H;
    hud2.progress(1);
    return blob;
  }
  function copyImage(blobPromise) {
    const item = new ClipboardItem({ "image/png": blobPromise });
    return navigator.clipboard.write([item]);
  }
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).catch(() => legacyCopy(text));
    return legacyCopy(text);
  }
  function legacyCopy(text) {
    return new Promise((resolve, reject) => {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;left:-9999px;top:0;width:10px;height:10px;opacity:0;";
      (app.root || document.body).appendChild(ta);
      ta.select();
      let ok = false;
      try {
        ok = document.execCommand("copy");
      } catch {
      }
      ta.remove();
      if (ok) resolve();
      else reject(new Error("copy blocked"));
    });
  }
  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.style.display = "none";
    (app.root || document.body).appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 5e3);
  }
  function fileName(kind) {
    const d = /* @__PURE__ */ new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const host = (location.hostname || "page").replace(/^www\./, "").replace(/[^a-z0-9.-]/gi, "-");
    return `precise-dimension_${host}_${kind}_${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.png`;
  }

  // src/content/prefs.js
  var KEY = "pd_prefs";
  var timer = 0;
  function loadPrefs() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(KEY, (v) => {
          const p = v && v[KEY] || {};
          if (UNITS.includes(p.unit)) app.state.unit = p.unit;
          if (typeof p.fill === "number" && p.fill >= 0 && p.fill <= 1) app.state.fill = p.fill;
          if (typeof p.guides === "boolean") app.state.guides = p.guides;
          resolve(p);
        });
      } catch {
        resolve({});
      }
    });
  }
  function savePrefs() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        chrome.storage.local.set({ [KEY]: { unit: app.state.unit, fill: app.state.fill, guides: app.state.guides } });
      } catch {
      }
    }, 250);
  }

  // src/content/ui.js
  var R = {};
  var UNIT_TIPS = {
    "vw/vh": "Units: vw / vh — % of the screen width / height (U)",
    px: "Units: px — screen pixels (U)",
    "%": "Units: % — of the box it sits in (U)",
    rem: "Units: rem — multiples of the page font size (U)",
    em: "Units: em — multiples of the element's own font size (U)",
    pt: "Units: pt — print points (U)",
    tw: "Units: Tailwind steps — w-4 is 16px (U)"
  };
  function mk(tag, cls, parent, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  function statusLayers(b) {
    mk("span", "st yes", b).appendChild(iconEl("check"));
    mk("span", "st no", b).appendChild(iconEl("cross"));
  }
  function circle(parent, cls, icon, tip, onClick) {
    const b = mk("button", "btn " + cls, parent);
    b.type = "button";
    if (icon) b.appendChild(iconEl(icon));
    if (tip) b.dataset.tip = tip;
    b.setAttribute("aria-label", tip || cls);
    statusLayers(b);
    b.addEventListener("click", (e) => {
      hideTip();
      onClick(e, b);
    });
    return b;
  }
  function split(parent, cls, face, left, right) {
    const w = mk("div", "btn split " + cls, parent);
    mk("span", "face", w).appendChild(iconEl(face));
    const L = mk("button", "half l", w);
    L.type = "button";
    L.dataset.tip = left[0];
    L.setAttribute("aria-label", left[0]);
    L.appendChild(iconEl(left[1]));
    const Rt = mk("button", "half r", w);
    Rt.type = "button";
    Rt.dataset.tip = right[0];
    Rt.setAttribute("aria-label", right[0]);
    Rt.appendChild(iconEl(right[1]));
    statusLayers(w);
    L.addEventListener("click", (e) => {
      hideTip();
      left[2](e, w, L);
    });
    Rt.addEventListener("click", (e) => {
      hideTip();
      right[2](e, w, Rt);
    });
    return w;
  }
  function flash(b, ok, ms = 1500) {
    if (!b) return;
    b.classList.remove("ok", "bad");
    void b.offsetWidth;
    b.classList.add(ok ? "ok" : "bad");
    clearTimeout(b._ft);
    b._ft = setTimeout(() => b.classList.remove("ok", "bad"), ms);
  }
  function center(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  var tipTimer = 0;
  var tipEl = null;
  var tipLast = 0;
  function showTipFor(el, text) {
    if (!text || !R.tip || app.state.capturing) return;
    const r = el.getBoundingClientRect();
    R.tip.textContent = text;
    R.tip.classList.add("on");
    const w = R.tip.offsetWidth;
    const x = clamp(r.left + r.width / 2 - w / 2, 6, app.vw - w - 6);
    let y = r.bottom + 8;
    if (y + 24 > app.vh) y = r.top - 30;
    R.tip.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    tipLast = performance.now();
  }
  function hideTip() {
    clearTimeout(tipTimer);
    tipEl = null;
    if (R.tip) R.tip.classList.remove("on");
  }
  function onTipOver(e) {
    const t = e.target && e.target.closest ? e.target.closest("[data-tip]") : null;
    if (!t) return;
    if (t === tipEl) return;
    tipEl = t;
    clearTimeout(tipTimer);
    const quick = performance.now() - tipLast < 700;
    tipTimer = setTimeout(() => {
      if (tipEl === t) showTipFor(t, t.dataset.tip);
    }, quick ? 40 : 380);
  }
  function onTipOut(e) {
    const t = e.target && e.target.closest ? e.target.closest("[data-tip]") : null;
    if (!t) return;
    if (e.relatedTarget && t.contains(e.relatedTarget)) return;
    if (tipEl === t) {
      if (R.tip.classList.contains("on")) tipLast = performance.now();
      hideTip();
    }
  }
  var hintTimer = 0;
  var toastTimer = 0;
  var selHintShown = false;
  function hintFor() {
    const st = app.state;
    if (st.canvasMode) return "Drag to draw boxes · Shift-drag or double-click-drag to select · Esc leaves the canvas";
    if (st.mode === "draw") return "Drag to draw a box · drag a box to move it · grab the arrows on its edges to resize · Esc to stop";
    if (st.mode === "change")
      return `Click to pick anything · ${modKey()}-click again for the box around it · ${modKey()}+Shift-click picks everything like it · drag to move · W A S D resize`;
    return "Hover anything to see its size and spacing · U switches units · H hides guides · Esc closes";
  }
  function modKey() {
    return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || "") ? "Ctrl/⌘" : "Ctrl";
  }
  function showHint(text, ms = 6500) {
    if (!R.hint) return;
    R.hint.textContent = text || hintFor();
    R.hint.classList.add("on");
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => R.hint.classList.remove("on"), ms);
  }
  function toast(msg, ms = 2600) {
    if (!msg || !R.toast) return;
    R.toast.textContent = msg;
    R.toast.classList.add("on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => R.toast.classList.remove("on"), ms);
  }
  function runTool(w, fn) {
    let res;
    try {
      res = fn();
    } catch (err) {
      console.warn("[Precise Dimension]", err);
      res = { ok: false, msg: "That didn't work on this page" };
    }
    if (res && res.msg) toast(res.msg);
    flash(w, !res || res.ok !== false);
    sync();
    requestFull();
    return res;
  }
  var busy = false;
  function captureError(err) {
    const m = String(err && err.message || err || "");
    if (/permission|activeTab|not allowed|cannot access|must request/i.test(m))
      return "Screenshot blocked — click the extension icon on this tab again, then retry";
    return "Screenshot failed" + (m ? ": " + m.slice(0, 90) : "");
  }
  function cameraFlash() {
    if (!app.root) return;
    const f = mk("div", "flash", app.root);
    app.lastFlash = performance.now();
    f.addEventListener("animationend", () => f.remove());
    setTimeout(() => f.remove(), 2e3);
  }
  var hud = {
    t: null,
    k: 1,
    show() {
      clearTimeout(hud.t);
      R.hudFill.style.width = "0%";
      R.hud.classList.remove("snap");
      R.hud.classList.add("on");
    },
    hide(ms = 0) {
      clearTimeout(hud.t);
      hud.t = setTimeout(() => R.hud.classList.remove("on"), ms);
    },
    phase(text) {
      R.hudSub.textContent = text;
    },
    progress(p) {
      R.hudFill.style.width = (clamp(p, 0, 1) * 100).toFixed(1) + "%";
    },
    snap(on) {
      R.hud.classList.toggle("snap", on);
    },
    previewStart(W, H) {
      const c = R.hudPrev;
      const dpr = window.devicePixelRatio || 1;
      const cw = 52;
      const ch = Math.round(clamp(cw * H / W, 24, 132));
      c.style.width = cw + "px";
      c.style.height = ch + "px";
      c.width = Math.round(cw * dpr);
      c.height = Math.round(ch * dpr);
      hud.k = Math.min(c.width / W, c.height / H);
      hud.ox = (c.width - W * hud.k) / 2;
      const g = c.getContext("2d");
      g.fillStyle = "#f3f4f6";
      g.fillRect(0, 0, c.width, c.height);
      c.classList.add("on");
    },
    previewDraw(img, sx, sy, sw, sh, dx, dy, dw, dh) {
      const g = R.hudPrev.getContext("2d");
      const k = hud.k;
      try {
        g.drawImage(img, sx, sy, sw, sh, hud.ox + dx * k, dy * k, dw * k, Math.max(1, dh * k));
      } catch {
      }
    }
  };
  function shot(kind, how, w) {
    if (busy) return;
    busy = true;
    hideTip();
    closeEditor(true);
    const full = kind === "full";
    const make = full ? () => captureFull(hud) : captureVisible;
    const label = full ? "Full page" : "Screenshot";
    const done = (ok, msg, blob) => {
      busy = false;
      if (full) hud.hide(ok ? 120 : 0);
      if (ok) cameraFlash();
      flash(w, ok, ok ? 1600 : 2400);
      if (msg) toast(msg, ok ? 2400 : 3600);
    };
    const fail = (err) => {
      if (err && err.stopped) {
        busy = false;
        if (full) hud.hide();
        toast("Screenshot stopped", 1600);
        return;
      }
      done(false, captureError(err));
    };
    const size = (blob) => blob && blob._w ? ` (${blob._w} × ${blob._h})` : "";
    const name = fileName(full ? "full-page" : "screen");
    const saveInstead = (p, why) => p.then(
      (blob) => {
        downloadBlob(blob, name);
        const what = label.toLowerCase();
        const m = String(why && why.message || "");
        let msg;
        if (!window.isSecureContext) msg = `This page doesn't allow copying, so the ${what} was downloaded instead`;
        else if (/focus/i.test(m)) msg = `Copying needs this tab to stay in front, so the ${what} was downloaded instead`;
        else msg = `Couldn't copy that picture (it may be too big for the clipboard), so the ${what} was downloaded instead`;
        done(true, msg);
      },
      fail
    );
    if (how === "copy") {
      let p;
      try {
        p = make();
        copyImage(p).then(
          () => p.then((blob) => done(true, `${label} copied${size(blob)} — paste it anywhere`)),
          (why) => saveInstead(p, why)
        );
      } catch (err) {
        if (p) saveInstead(p);
        else fail(err);
      }
    } else {
      make().then(
        (blob) => {
          downloadBlob(blob, name);
          done(true, `${label} downloaded`);
        },
        fail
      );
    }
  }
  function copyEdits(b) {
    let text = null;
    try {
      text = buildEditsText();
    } catch (err) {
      console.warn("[Precise Dimension]", err);
    }
    if (!text) {
      flash(b, false);
      toast("Nothing to copy yet — move, resize or draw something first");
      return;
    }
    copyText(text).then(
      () => {
        flash(b, true);
        toast("Edits copied as text — paste them to your coding agent");
      },
      () => {
        flash(b, false);
        toast("This page won't let me copy text");
      }
    );
  }
  function cycleUnit(dir2 = 1) {
    const i = UNITS.indexOf(app.state.unit);
    app.state.unit = UNITS[(i + dir2 + UNITS.length) % UNITS.length];
    savePrefs();
    sync();
    requestRender();
    if (R.unit) {
      showTipFor(R.unit, UNIT_TIPS[app.state.unit]);
      clearTimeout(tipTimer);
      tipTimer = setTimeout(hideTip, 1800);
    }
  }
  function toggleGuides() {
    app.state.guides = !app.state.guides;
    savePrefs();
    sync();
    requestFull();
    toast(app.state.guides ? "Guides on" : "Guides off — your boxes and edits stay", 1500);
  }
  var canvasPrev = "measure";
  function leaveCanvas() {
    app.state.canvasMode = false;
    app.state.mode = canvasPrev;
  }
  function setMode(mode) {
    const st = app.state;
    if (st.canvasMode) leaveCanvas();
    if (st.mode === mode) {
      sync();
      return;
    }
    hub.cancelDrag();
    closeEditor(false);
    st.mode = mode;
    st.alignOpen = false;
    app.hover = null;
    setSelection([]);
    showHint();
    sync();
    requestFull();
  }
  function setCanvas(on) {
    const st = app.state;
    if (!!on === st.canvasMode) return;
    hub.cancelDrag();
    closeEditor(false);
    setSelection([]);
    st.alignOpen = false;
    if (on) {
      canvasPrev = st.mode;
      const c = center(R.canvas);
      app.board.style.setProperty("--ox", c.x + "px");
      app.board.style.setProperty("--oy", c.y + "px");
      st.canvasMode = true;
      st.mode = "draw";
    } else {
      leaveCanvas();
    }
    app.hover = null;
    showHint();
    sync();
    requestFull();
    keepAnimating(800);
  }
  var ALIGN_ITEMS = [
    ["alignLeft", "left", "Align left edges"],
    ["alignHCenter", "hcenter", "Align centers"],
    ["alignRight", "right", "Align right edges"],
    null,
    ["alignTop", "top", "Align tops"],
    ["alignVCenter", "vcenter", "Align middles"],
    ["alignBottom", "bottom", "Align bottoms"],
    null,
    ["distH", "x", "Even spacing, left to right"],
    ["distV", "y", "Even spacing, top to bottom"]
  ];
  function fillAlign(container) {
    for (const it of ALIGN_ITEMS) {
      if (!it) {
        mk("span", "sep", container);
        continue;
      }
      const b = mk("button", "ib", container);
      b.type = "button";
      b.dataset.tip = it[2];
      b.setAttribute("aria-label", it[2]);
      b.appendChild(iconEl(it[0]));
      b.addEventListener("click", () => {
        hideTip();
        let res;
        try {
          res = it[1] === "x" || it[1] === "y" ? distribute(it[1]) : align(it[1]);
        } catch (err) {
          console.warn("[Precise Dimension]", err);
          res = { ok: false, msg: "That didn't work on this page" };
        }
        if (res && res.msg) toast(res.msg, 1800);
        sync();
        requestFull();
      });
    }
  }
  function toggleAlign() {
    app.state.alignOpen = !app.state.alignOpen;
    if (app.state.alignOpen && !app.sel.length) toast("Pick one or more things — one thing lines up inside the box around it", 2600);
    sync();
  }
  function updateAlignFly() {
    const st = app.state;
    const open2 = st.alignOpen && st.mode === "change" && !st.canvasMode && R.purple.classList.contains("shown") && !st.closing;
    R.fly.classList.toggle("open", open2);
    R.align.classList.toggle("on", open2);
    if (!open2) return;
    const r = R.align.getBoundingClientRect();
    const w = R.fly.offsetWidth;
    const x = clamp(r.left + r.width / 2 - w / 2, 8, app.vw - w - 8);
    R.fly.style.transform = `translate(${Math.round(x)}px, ${Math.round(r.bottom + 10)}px)`;
  }
  var curFlex = null;
  var normJ = (v) => ["normal", "start", "flex-start", "left"].includes(v) ? "flex-start" : ["end", "flex-end", "right"].includes(v) ? "flex-end" : v;
  var normA = (v) => ["normal", "stretch"].includes(v) ? "stretch" : ["start", "flex-start", "self-start"].includes(v) ? "flex-start" : ["end", "flex-end", "self-end"].includes(v) ? "flex-end" : v;
  function flexTarget() {
    const st = app.state;
    if (st.mode !== "change" || st.canvasMode || app.sel.length !== 1 || app.sel[0].kind !== "el") return null;
    const el = app.sel[0].el;
    if (!el.isConnected) return null;
    try {
      return flexInfo(el).isFlex ? el : null;
    } catch {
      return null;
    }
  }
  function flexSet(props, label) {
    const el = flexTarget();
    if (!el) return;
    setFlexProp(el, props, label || "Flex");
    sync();
  }
  function buildFlexPanel() {
    const p = mk("div", "panel ui", app.root);
    R.fpTitle = mk("div", "ttl", p);
    const row = (label) => {
      const r = mk("div", "row", p);
      mk("span", "lab", r, label);
      return r;
    };
    const ib = (parent, icon, tip, fn) => {
      const b = mk("button", "ib", parent);
      b.type = "button";
      b.dataset.tip = tip;
      b.setAttribute("aria-label", tip);
      b.appendChild(iconEl(icon));
      b.addEventListener("click", (e) => {
        hideTip();
        fn(e);
      });
      return b;
    };
    const r1 = row("Direction");
    R.fpRow = ib(r1, "dirRow", "Side by side (row)", () => flexSet({ "flex-direction": "row" }, "Direction"));
    R.fpCol = ib(r1, "dirCol", "Stacked (column)", () => flexSet({ "flex-direction": "column" }, "Direction"));
    R.fpWrap = ib(r1, "wrap", "Wrap onto new lines", () => flexSet({ "flex-wrap": curFlex && curFlex.wrap === "wrap" ? "nowrap" : "wrap" }, "Wrap"));
    const r22 = row("Spread");
    R.fpJ = [
      ["jStart", "flex-start", "Pack at the start"],
      ["jCenter", "center", "Pack in the middle"],
      ["jEnd", "flex-end", "Pack at the end"],
      ["jBetween", "space-between", "Spread out, no space at the ends"],
      ["jAround", "space-around", "Spread out with space around each"]
    ].map(([icon, v, tip]) => {
      const b = ib(r22, icon, tip, () => flexSet({ "justify-content": v }, "Spread"));
      b.dataset.v = v;
      return b;
    });
    const r3 = row("Line up");
    R.fpA = [
      ["aStart", "flex-start", "Line up at the start"],
      ["aCenter", "center", "Line up the middles"],
      ["aEnd", "flex-end", "Line up at the end"],
      ["aStretch", "stretch", "Stretch to fill"]
    ].map(([icon, v, tip]) => {
      const b = ib(r3, icon, tip, () => flexSet({ "align-items": v }, "Line up"));
      b.dataset.v = v;
      return b;
    });
    const r4 = row("Gap");
    const gapStep = (dir2, e) => {
      const el = flexTarget();
      if (!el) return;
      const f = flexInfo(el);
      const step = e && e.shiftKey ? 1 : 4;
      const g = Math.max(0, Math.round(f.gap) + dir2 * step);
      flexSet({ gap: g + "px" }, "Gap");
    };
    ib(r4, "minus", "Less space between (Shift = 1px)", (e) => gapStep(-1, e));
    R.fpGap = mk("span", "val", r4, "0px");
    ib(r4, "plus", "More space between (Shift = 1px)", (e) => gapStep(1, e));
    R.panel = p;
  }
  function updateFlexPanel() {
    const el = flexTarget();
    const open2 = !!el && R.purple.classList.contains("shown") && !app.state.closing;
    R.panel.classList.toggle("open", open2);
    if (!open2) return;
    const f = flexInfo(el);
    curFlex = f;
    R.fpTitle.textContent = (el.hasAttribute("data-pd-group") ? "New group" : describe(el)) + " · flex box";
    const col = f.dir.startsWith("column");
    R.fpRow.classList.toggle("on", !col);
    R.fpCol.classList.toggle("on", col);
    R.fpWrap.classList.toggle("on", f.wrap === "wrap");
    for (const b of R.fpJ) b.classList.toggle("on", normJ(f.justify) === b.dataset.v);
    for (const b of R.fpA) b.classList.toggle("on", normA(f.align) === b.dataset.v);
    R.fpGap.textContent = Math.round(f.gap) + "px";
    const below = R.fly.classList.contains("open") ? R.fly.getBoundingClientRect().bottom : R.purple.getBoundingClientRect().bottom;
    const w = R.panel.offsetWidth;
    R.panel.style.transform = `translate(${Math.round(app.vw - 12 - w)}px, ${Math.round(below + 10)}px)`;
  }
  var editing = null;
  function setupEditor() {
    const inp = R.edit;
    inp.type = "text";
    inp.spellcheck = false;
    inp.autocomplete = "off";
    inp.setAttribute("aria-label", "Size");
    inp.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") {
        e.preventDefault();
        closeEditor(true);
      } else if (e.key === "Escape") {
        e.preventDefault();
        closeEditor(false);
      } else if (e.key === "Tab") {
        e.preventDefault();
        const ed = editing;
        if (closeEditor(true) && ed) openEditorFor(ed.it, ed.axis === "w" ? "h" : "w");
      }
    });
    inp.addEventListener("blur", () => closeEditor(true));
  }
  function openEditor(chip2) {
    openEditorFor(chip2.it, chip2.axis, chip2);
  }
  function openEditorFor(it, axis, chip2) {
    closeEditor(false);
    if (it.kind === "el" && !it.el.isConnected) return;
    const ctx = itemCtx(it);
    const r = itemRect(it);
    const px = axis === "w" ? r.w : r.h;
    const c = chip2 || app.chips.find((k) => same(k.it, it) && k.axis === axis);
    const cx = c ? c.x + c.w / 2 : axis === "w" ? r.x + r.w / 2 : r.x + r.w;
    const cy = c ? c.y + c.h / 2 : axis === "w" ? r.y + r.h : r.y + r.h / 2;
    const inp = R.edit;
    inp.value = rawValue(px, axis, ctx);
    inp.style.display = "block";
    const w = 70;
    inp.style.width = w + "px";
    inp.style.left = clamp(cx - w / 2, 4, app.vw - w - 4) + "px";
    inp.style.top = clamp(cy - 10, 4, app.vh - 24) + "px";
    editing = { it, axis, ctx };
    inp.focus({ preventScroll: true });
    inp.select();
    const other = axis === "w" ? "height" : "width";
    toast(`Type a ${axis === "w" ? "width" : "height"} — like 240, 20vw, 50% or 12rem · Enter sets it · Tab for ${other}`, 3400);
  }
  function closeEditor(apply2) {
    if (!editing) return false;
    const ed = editing;
    editing = null;
    const inp = R.edit;
    const val = inp.value;
    inp.style.display = "none";
    if (app.shadow.activeElement === inp) inp.blur();
    if (!apply2) return true;
    const v = parseDim(val, ed.axis, ed.ctx);
    if (v == null || !(v > 0)) {
      if (val.trim()) toast(`"${val.trim()}" isn't a size I understand — try 240, 20vw or 50%`);
      return false;
    }
    if (ed.it.kind === "el" && !ed.it.el.isConnected) return false;
    begin("Set size");
    const s = startState(ed.it);
    const r = { ...s.rect };
    if (ed.axis === "w") r.w = v;
    else r.h = v;
    applyRect(s, r, true);
    commit();
    requestFull();
    return true;
  }
  function closeFlyouts() {
    let any = false;
    if (app.state.alignOpen) {
      app.state.alignOpen = false;
      any = true;
    }
    if (editing) {
      closeEditor(false);
      any = true;
    }
    if (any) sync();
    return any;
  }
  function prepFly(bar, roll) {
    const kids = [...bar.children];
    const n = kids.length;
    const right = bar.offsetLeft + bar.offsetWidth;
    kids.forEach((k, i) => {
      const toRight = right - (k.offsetLeft + k.offsetWidth);
      const dx = toRight + k.offsetWidth / 2 + (roll ? 30 : 8);
      k.style.setProperty("--dx", Math.round(dx) + "px");
      k.style.setProperty("--d", (n - 1 - i) * (roll ? 42 : 36) + "ms");
      if (roll) k.style.setProperty("--rot", Math.round(dx / (Math.PI * 34) * 360) + "deg");
    });
  }
  function setPurple(show) {
    const on = R.purple.classList.contains("shown");
    if (show === on) return;
    if (show) {
      prepFly(R.purple, true);
      void R.purple.offsetWidth;
      R.purple.classList.add("shown");
    } else {
      R.purple.classList.remove("shown");
    }
    app.uiRectDirty = true;
    setTimeout(() => {
      app.uiRectDirty = true;
      updateFlexPanel();
      updateAlignFly();
    }, 380);
  }
  function showBars() {
    R.white.classList.remove("shown");
    prepFly(R.white, false);
    void R.white.offsetWidth;
    requestAnimationFrame(() => {
      R.white.classList.add("shown");
      sync();
    });
  }
  function hideBars() {
    hideTip();
    R.white.classList.remove("shown");
    R.purple.classList.remove("shown");
    R.hint.classList.remove("on");
    R.toast.classList.remove("on");
  }
  function sync() {
    if (!R.white) return;
    const st = app.state;
    const root = app.root;
    root.dataset.mode = st.mode;
    if (st.canvasMode) root.dataset.canvas = "1";
    else delete root.dataset.canvas;
    R.draw.classList.toggle("on", st.mode === "draw" && !st.canvasMode);
    R.canvas.classList.toggle("on", st.canvasMode);
    R.change.classList.toggle("on", st.mode === "change" && !st.canvasMode);
    for (const g of [R.guidesW, R.guidesP]) {
      g.classList.toggle("off", !st.guides);
      g.dataset.tip = st.guides ? "Hide guides (H)" : "Show guides (H)";
    }
    R.unitTxt.textContent = st.unit;
    R.unit.classList.toggle("long", st.unit.length > 3);
    R.unit.dataset.tip = UNIT_TIPS[st.unit];
    const pct = String(Math.round(st.fill * 100));
    if (R.range.value !== pct) R.range.value = pct;
    R.range.style.setProperty("--p", pct + "%");
    setPurple(st.open && !st.closing && st.mode === "change" && !st.canvasMode && R.white.classList.contains("shown"));
    R.undo.classList.toggle("dim", !canUndo());
    updateAlignFly();
    updateFlexPanel();
    if (st.mode === "change" && !st.canvasMode && app.sel.length === 1 && !selHintShown) {
      selHintShown = true;
      showHint(`${modKey()}-click again for the box around it · ${modKey()}+Shift-click picks all like it · Shift-click adds more · W/S shorter/taller · A/D narrower/wider`, 7e3);
    }
    app.uiRectDirty = true;
  }
  var uiFrame = 0;
  function fitBars() {
    const natural = Math.max(R.white.scrollWidth, R.purple.scrollWidth);
    const room = app.vw - 24;
    const k = natural > room ? clamp(room / natural, 0.55, 1) : 1;
    const v = k < 1 ? `scale(${k.toFixed(3)})` : "";
    if (R.bars.style.transform !== v) R.bars.style.transform = v;
  }
  function frameUI() {
    if (!R.afloat) return;
    const st = app.state;
    const show = (st.canvasMode || st.mode === "draw") && app.sel.length >= 2 && !app.drag && !st.capturing && !st.closing;
    if (show) {
      const B = union(app.sel.map(itemRect));
      const w = R.afloat.offsetWidth || 300;
      const h = R.afloat.offsetHeight || 36;
      let y = B.y - h - 14;
      if (y < 8) y = B.y + B.h + 14;
      if (y + h > app.vh - 8) y = clamp(B.y + 8, 8, app.vh - h - 8);
      const x = clamp(B.x + B.w / 2 - w / 2, 8, app.vw - w - 8);
      R.afloat.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    }
    if (R.afloat.classList.contains("open") !== show) R.afloat.classList.toggle("open", show);
    if (app.uiRectDirty || uiFrame++ % 40 === 0) {
      fitBars();
      const r = R.bars.getBoundingClientRect();
      app.uiRect = { x: r.left - 4, y: r.top - 4, w: r.width + 8, h: r.height + 8 };
      app.uiRectDirty = false;
    }
  }
  function buildUI() {
    const root = app.root;
    const bars = mk("div", "bars", root);
    const white = mk("div", "bar white ui", bars);
    const purple = mk("div", "bar purple ui", bars);
    R.bars = bars;
    R.white = white;
    R.purple = purple;
    R.close = circle(white, "small close", "close", "Close (Esc)", () => hub.close());
    const pill = mk("div", "btn pill", white);
    pill.dataset.tip = "How strong the blue fill is";
    mk("span", "plab", pill, "fill");
    const range = mk("input", "range", pill);
    range.type = "range";
    range.min = "0";
    range.max = "100";
    range.step = "1";
    range.value = String(Math.round(app.state.fill * 100));
    range.setAttribute("aria-label", "Fill strength");
    range.addEventListener("input", () => {
      app.state.fill = Number(range.value) / 100;
      range.style.setProperty("--p", range.value + "%");
      showTipFor(pill, `Fill ${range.value}%`);
      clearTimeout(tipTimer);
      tipTimer = setTimeout(hideTip, 900);
      requestRender();
      savePrefs();
    });
    R.pill = pill;
    R.range = range;
    R.unit = circle(white, "unit", null, UNIT_TIPS[app.state.unit], (e) => cycleUnit(e.shiftKey ? -1 : 1));
    R.unitTxt = mk("span", "txt", R.unit, app.state.unit);
    R.draw = circle(white, "draw", "draw", "Draw boxes — drag on the page", () => {
      const st = app.state;
      if (st.canvasMode) {
        setCanvas(false);
        setMode("draw");
      } else setMode(st.mode === "draw" ? "measure" : "draw");
    });
    R.canvas = circle(white, "canvas", "canvas", "Blank canvas — sketch a layout", () => setCanvas(!app.state.canvasMode));
    R.shot = split(
      white,
      "shot",
      "screen",
      ["Copy a screenshot of what you see", "copy", (e, w) => shot("screen", "copy", w)],
      ["Download a screenshot of what you see", "download", (e, w) => shot("screen", "download", w)]
    );
    R.full = split(
      white,
      "full",
      "fullpage",
      ["Copy a screenshot of the whole page", "copy", (e, w) => shot("full", "copy", w)],
      ["Download a screenshot of the whole page", "download", (e, w) => shot("full", "download", w)]
    );
    R.change = circle(white, "change", "change", "Change mode — move and resize anything on the page", () => {
      const st = app.state;
      if (st.canvasMode) {
        setCanvas(false);
        setMode("change");
      } else setMode(st.mode === "change" ? "measure" : "change");
    });
    R.guidesW = guidesButton(white);
    R.reflow = split(
      purple,
      "reflow",
      "reflow",
      ["Pulse reflow — turn your moves into real layout", "pulse", (e, w) => runTool(w, () => pulseReflow(center(w)))],
      ["Magic fix — line things up neatly", "magic", (e, w) => runTool(w, () => magicFix(center(w)))]
    );
    R.group = split(
      purple,
      "group",
      "group",
      ["Group into a flex box (⌘G)", "group", (e, w) => runTool(w, group)],
      ["Ungroup (⇧⌘G)", "ungroup", (e, w) => runTool(w, ungroup)]
    );
    R.align = circle(purple, "align", "align", "Align and even spacing", () => toggleAlign());
    R.text = circle(purple, "text", "text", "Copy edits as text — for your coding agent", (e, b) => copyEdits(b));
    R.undo = split(
      purple,
      "undo",
      "undo",
      [
        "Undo (⌘Z)",
        "undo",
        () => {
          if (!undo()) toast("Nothing to undo");
          sync();
          requestFull();
        }
      ],
      ["Reset everything back to the original page", "reset", (e, w) => runTool(w, resetAll)]
    );
    R.guidesP = guidesButton(purple);
    R.fly = mk("div", "fly ui", root);
    fillAlign(R.fly);
    R.afloat = mk("div", "afloat ui", root);
    fillAlign(R.afloat);
    buildFlexPanel();
    R.hud = mk("div", "hud", root);
    R.hudPrev = mk("canvas", "hud-prev", R.hud);
    const ht = mk("div", "hud-txt", R.hud);
    mk("div", "hud-title", ht, "Full-page screenshot");
    R.hudSub = mk("div", "hud-sub", ht, "");
    const hb = mk("div", "hud-bar", ht);
    R.hudFill = mk("i", "", hb);
    mk("div", "hud-esc", ht, "Esc stops");
    R.tip = mk("div", "tip", root);
    R.hint = mk("div", "hint", root);
    R.toast = mk("div", "toast", root);
    R.toast.setAttribute("role", "status");
    R.edit = mk("input", "dimedit ui", root);
    setupEditor();
    root.addEventListener("pointerover", onTipOver);
    root.addEventListener("pointerout", onTipOut);
    root.addEventListener("pointerdown", (e) => {
      if (e.target && e.target.closest && e.target.closest("[data-tip]")) hideTip();
    });
    onSelection(sync);
    onHistory(sync);
    Object.assign(hub, {
      toast,
      hint: showHint,
      sync,
      openEditor,
      closeEditor,
      closeFlyouts,
      setMode,
      setCanvas,
      cycleUnit,
      toggleGuides,
      group: () => runTool(R.group, group),
      ungroup: () => runTool(R.group, ungroup),
      cancelCapture: stopCapture
    });
  }
  function guidesButton(parent) {
    const b = circle(parent, "guides", null, "Hide guides (H)", () => toggleGuides());
    const on = iconEl("eye");
    on.classList.add("i-on");
    const off = iconEl("eyeOff");
    off.classList.add("i-off");
    b.prepend(off);
    b.prepend(on);
    return b;
  }

  // src/content/snap.js
  var SNAP = 5;
  function buildTargets(movingItems = []) {
    const xs = [];
    const ys = [];
    const movingEls = movingItems.filter((i) => i.kind === "el").map((i) => i.el);
    const movingShapes = new Set(movingItems.filter((i) => i.kind === "shape").map((i) => i.shape));
    const add = (r) => {
      xs.push({ v: r.x, r }, { v: r.x + r.w / 2, r }, { v: r.x + r.w, r });
      ys.push({ v: r.y, r }, { v: r.y + r.h / 2, r }, { v: r.y + r.h, r });
    };
    const view = { x: 0, y: 0, w: app.vw, h: app.vh };
    xs.push({ v: app.vw / 2, r: view });
    ys.push({ v: app.vh / 2, r: view });
    if (app.state.canvasMode) {
      xs.push({ v: 0, r: view }, { v: app.vw, r: view });
      ys.push({ v: 0, r: view }, { v: app.vh, r: view });
    }
    for (const s of activeShapes()) if (!movingShapes.has(s)) add(shapeRect(s));
    if (!app.state.canvasMode) {
      let n = 0;
      for (const c of app.cands) {
        if (c.dup || c.w * c.h < 300) continue;
        if (c.x > app.vw || c.y > app.vh || c.x + c.w < 0 || c.y + c.h < 0) continue;
        if (movingEls.some((m) => deepContains(m, c.el))) continue;
        add({ x: c.x, y: c.y, w: c.w, h: c.h });
        if (++n > 800) break;
      }
    }
    return { xs, ys };
  }
  function bestSnap(features, list) {
    let best = null;
    for (const f of features) {
      for (const t of list) {
        const d = t.v - f;
        const ad = Math.abs(d);
        if (ad <= SNAP && (!best || ad < Math.abs(best.d))) best = { d, v: t.v, r: t.r };
      }
    }
    return best;
  }
  function vLine(v, a, b) {
    const y1 = Math.min(a.y, b.y);
    const y2 = Math.max(a.y + a.h, b.y + b.h);
    return { x1: v, y1, x2: v, y2 };
  }
  function hLine(v, a, b) {
    const x1 = Math.min(a.x, b.x);
    const x2 = Math.max(a.x + a.w, b.x + b.w);
    return { x1, y1: v, x2, y2: v };
  }
  function snapMove(rect, targets) {
    const sx = bestSnap([rect.x, rect.x + rect.w / 2, rect.x + rect.w], targets.xs);
    const sy = bestSnap([rect.y, rect.y + rect.h / 2, rect.y + rect.h], targets.ys);
    const dx = sx ? sx.d : 0;
    const dy = sy ? sy.d : 0;
    const moved = { x: rect.x + dx, y: rect.y + dy, w: rect.w, h: rect.h };
    const lines = [];
    if (sx) lines.push(vLine(sx.v, moved, sx.r));
    if (sy) lines.push(hLine(sy.v, moved, sy.r));
    return { dx, dy, lines };
  }
  function snapEdges(rect, edges, targets) {
    let { x, y, w, h } = rect;
    const lines = [];
    if (edges.l) {
      const s = bestSnap([x], targets.xs);
      if (s) {
        w -= s.d;
        x += s.d;
        lines.push(vLine(s.v, { x, y, w, h }, s.r));
      }
    } else if (edges.r) {
      const s = bestSnap([x + w], targets.xs);
      if (s) {
        w += s.d;
        lines.push(vLine(s.v, { x, y, w, h }, s.r));
      }
    }
    if (edges.t) {
      const s = bestSnap([y], targets.ys);
      if (s) {
        h -= s.d;
        y += s.d;
        lines.push(hLine(s.v, { x, y, w, h }, s.r));
      }
    } else if (edges.b) {
      const s = bestSnap([y + h], targets.ys);
      if (s) {
        h += s.d;
        lines.push(hLine(s.v, { x, y, w, h }, s.r));
      }
    }
    return { rect: { x, y, w: Math.max(1, w), h: Math.max(1, h) }, lines, snappedX: lines.some((l) => l.x1 === l.x2), snappedY: lines.some((l) => l.y1 === l.y2) };
  }

  // src/content/interact.js
  var lastUp = { t: 0, x: -99, y: -99 };
  var cursor = "";
  function interactive() {
    const st = app.state;
    return st.canvasMode || st.mode === "draw" || st.mode === "change";
  }
  function overUI(e) {
    const path = e.composedPath ? e.composedPath() : [];
    for (const n of path) {
      if (n === app.layer) return false;
      if (n === app.host) return false;
      if (n.classList && n.classList.contains("ui")) return true;
    }
    return false;
  }
  function pickElement(x, y) {
    let list;
    try {
      list = document.elementsFromPoint(x, y);
    } catch {
      return null;
    }
    let hit = null;
    for (const el of list) {
      if (el === app.host) continue;
      hit = el;
      break;
    }
    if (!hit) return null;
    for (let i = 0; i < 6 && hit.shadowRoot; i++) {
      let inner = null;
      try {
        inner = hit.shadowRoot.elementsFromPoint(x, y).find((e2) => e2 !== hit && hit.shadowRoot.contains(e2));
      } catch {
      }
      if (!inner) break;
      hit = inner;
    }
    let e = hit;
    while (e && !isRootish(e)) {
      if (app.candByEl.has(e)) return e;
      e = parentOf(e);
    }
    return null;
  }
  function itemAt(x, y) {
    const s = shapeAt(x, y, 2);
    if (s) return shapeItem(s);
    if (app.state.mode === "change" && !app.state.canvasMode) {
      const el = pickElement(x, y);
      if (el) return elItem(el);
    }
    return null;
  }
  function liveSel() {
    return app.sel.filter((it) => it.kind === "shape" || it.el.isConnected);
  }
  function selBounds() {
    const items = liveSel();
    return items.length ? union(items.map(itemRect)) : null;
  }
  function findHot(x, y) {
    if (!interactive() || app.state.capturing) return null;
    const B = selBounds();
    if (B) {
      const corners = [
        [B.x, B.y, "nw"],
        [B.x + B.w, B.y, "ne"],
        [B.x, B.y + B.h, "sw"],
        [B.x + B.w, B.y + B.h, "se"]
      ];
      for (const [cx, cy, corner] of corners) {
        if (Math.abs(x - cx) <= 7 && Math.abs(y - cy) <= 7) return { type: "corner", corner };
      }
    }
    if (app.spacing && app.sel.length >= 2) {
      for (let i = 0; i < app.spacing.gaps.length; i++) {
        const g = app.spacing.gaps[i];
        const ax = app.spacing.axis === "x";
        if (Math.abs(x - g.x) <= (ax ? 6 : 10) && Math.abs(y - g.y) <= (ax ? 10 : 6)) return { type: "spacing", i, axis: app.spacing.axis };
      }
    }
    let best = null;
    for (const pass of [true, false]) {
      let bd = 10;
      for (const a of app.arrows) {
        if (pass && !a.sel) continue;
        const d = Math.hypot(x - a.x, y - a.y);
        if (d < bd) {
          bd = d;
          best = a;
        }
      }
      if (best) break;
    }
    if (best) return { type: "edge", it: best.it, edge: best.edge, x: best.x, y: best.y, f: best.f, exact: !!best.exact };
    for (const c of app.chips) if (containsPt(c, x, y, 1)) return { type: "chip", chip: c };
    return null;
  }
  function setCursor(c) {
    if (c === cursor || !app.layer) return;
    cursor = c;
    app.layer.style.cursor = c;
  }
  function cursorFor(hot, item) {
    if (!interactive()) return "";
    if (hot) {
      if (hot.type === "corner") return hot.corner === "nw" || hot.corner === "se" ? "nwse-resize" : "nesw-resize";
      if (hot.type === "edge") return hot.edge === "l" || hot.edge === "r" ? "ew-resize" : "ns-resize";
      if (hot.type === "spacing") return hot.axis === "x" ? "col-resize" : "row-resize";
      if (hot.type === "chip") return "text";
    }
    if (item && (item.kind === "shape" || isSelected(item))) return "move";
    if (app.state.mode === "change" && !app.state.canvasMode) return item ? "pointer" : "default";
    return "crosshair";
  }
  function updateHover(x, y) {
    const st = app.state;
    const hot = findHot(x, y);
    app.hot = hot;
    let hover = null;
    let item = null;
    if (!st.canvasMode && (st.mode === "measure" || st.mode === "change")) {
      const el = pickElement(x, y);
      if (el) hover = elItem(el);
    }
    if (interactive()) {
      const s = shapeAt(x, y, 2);
      item = s ? shapeItem(s) : st.mode === "change" && !st.canvasMode ? hover : null;
    }
    if (!same(hover, app.hover)) app.hover = hover;
    setCursor(cursorFor(hot, item));
    requestRender();
  }
  function sameHot(a, b) {
    if (!a || !b) return a === b;
    if (a.type !== b.type) return false;
    if (a.type === "edge") return a.edge === b.edge && same(a.it, b.it);
    if (a.type === "corner") return a.corner === b.corner;
    if (a.type === "spacing") return a.i === b.i;
    if (a.type === "chip") return a.chip.x === b.chip.x && a.chip.y === b.chip.y;
    return true;
  }
  function refreshHot() {
    if (app.drag || !app.mouse.inside || !app.state.open || app.state.capturing) return;
    if (!sameHot(findHot(app.mouse.x, app.mouse.y), app.hot)) updateHover(app.mouse.x, app.mouse.y);
  }
  function setMouse(x, y, inside) {
    app.mouse.x = x;
    app.mouse.y = y;
    app.mouse.inside = inside;
  }
  function setMods(e) {
    const mod = !!(e.metaKey || e.ctrlKey);
    const shift = !!e.shiftKey;
    if (app.mods.mod === mod && app.mods.shift === shift) return;
    app.mods = { mod, shift };
    requestRender();
  }
  function onDown(e) {
    if (e.button !== 0 || !interactive() || app.state.closing || app.state.capturing) return;
    e.preventDefault();
    hub.closeEditor(true);
    try {
      app.layer.setPointerCapture(e.pointerId);
    } catch {
    }
    const x = e.clientX;
    const y = e.clientY;
    setMouse(x, y, true);
    const now = performance.now();
    const dbl = now - lastUp.t < 400 && Math.hypot(x - lastUp.x, y - lastUp.y) < 12;
    let hot = findHot(x, y);
    if (hot && hot.type === "chip" && e.shiftKey) hot = null;
    const item = !hot || hot.type === "chip" ? itemAt(x, y) : null;
    app.drag = {
      type: "pending",
      sx: x,
      sy: y,
      x,
      y,
      hot,
      item,
      shift: e.shiftKey,
      alt: e.altKey,
      mod: e.metaKey || e.ctrlKey,
      dbl,
      pointerId: e.pointerId
    };
    requestRender();
  }
  function onMove(e) {
    if (!app.state.open) return;
    const x = e.clientX;
    const y = e.clientY;
    setMods(e);
    const d = app.drag;
    if (d) {
      if (e.pointerId !== d.pointerId) return;
      d.x = x;
      d.y = y;
      d.shift = e.shiftKey;
      d.alt = e.altKey;
      d.mod = e.metaKey || e.ctrlKey;
      setMouse(x, y, true);
      if (d.type === "pending") {
        if (Math.hypot(x - d.sx, y - d.sy) < 3) return;
        startDrag(d);
      }
      dragMove(d);
      requestRender();
      return;
    }
    if (overUI(e)) {
      setMouse(x, y, false);
      app.hover = null;
      app.hot = null;
      requestRender();
      return;
    }
    setMouse(x, y, true);
    updateHover(x, y);
  }
  function onUp(e) {
    const d = app.drag;
    if (!d || e.pointerId !== d.pointerId) return;
    try {
      app.layer.releasePointerCapture(e.pointerId);
    } catch {
    }
    app.drag = null;
    if (d.type === "pending") click(d);
    else endDrag(d);
    lastUp = { t: performance.now(), x: e.clientX, y: e.clientY };
    app.snapLines = [];
    app.marquee = null;
    app.preview = null;
    updateHover(e.clientX, e.clientY);
    hub.sync();
    requestFull();
  }
  function onCancel(e) {
    const d = app.drag;
    if (!d || e.pointerId !== d.pointerId) return;
    app.drag = null;
    if (d.type !== "pending") endDrag(d);
    app.snapLines = [];
    app.marquee = null;
    app.preview = null;
    requestFull();
  }
  function startDrag(d) {
    const st = app.state;
    const hot = d.hot;
    if (hot && hot.type === "corner") return beginCorner(d);
    if (hot && hot.type === "edge") return beginEdge(d, hot);
    if (hot && hot.type === "spacing") return beginSpacing(d);
    if (d.shift || d.dbl && !d.item) return beginMarquee(d);
    if (d.item) {
      const inside = d.item.kind === "el" && liveSel().some((s) => s.kind === "el" && s.el !== d.item.el && deepContains(s.el, d.item.el));
      if (!isSelected(d.item) && !inside) setSelection([d.item]);
      if (d.alt && app.sel.every((s) => s.kind === "shape")) {
        begin("Duplicate");
        touchShapes();
        const copies = app.sel.map((s) => shapeItem(duplicateShape(s.shape, 0, 0)));
        setSelection(copies);
        return beginMove(d, true);
      }
      return beginMove(d);
    }
    if (st.canvasMode || st.mode === "draw") return beginDraw(d);
    return beginMarquee(d);
  }
  function dragMove(d) {
    switch (d.type) {
      case "move":
        return moveDrag(d);
      case "edge":
        return edgeDrag(d);
      case "corner":
        return cornerDrag(d);
      case "spacing":
        return spacingDrag(d);
      case "marquee":
        return marqueeDrag(d);
      case "draw":
        return drawDrag(d);
    }
  }
  function endDrag(d) {
    if (d.live) app.live = Math.max(0, app.live - 1);
    if (d.type === "draw") {
      const r = app.preview && app.preview.rect;
      if (r && r.w >= 3 && r.h >= 3) {
        begin("Draw box");
        touchShapes();
        const s = createShape(r);
        commit();
        setSelection([shapeItem(s)]);
      }
    } else if (d.type === "move" || d.type === "edge" || d.type === "corner" || d.type === "spacing") {
      commit();
    }
    requestFull();
  }
  function cancelDrag() {
    const d = app.drag;
    if (!d) return false;
    app.drag = null;
    if (d.live) app.live = Math.max(0, app.live - 1);
    if (d.type === "move" || d.type === "edge" || d.type === "corner" || d.type === "spacing") cancel();
    if (d.type === "marquee") setSelection(d.base || []);
    try {
      app.layer.releasePointerCapture(d.pointerId);
    } catch {
    }
    app.preview = null;
    app.marquee = null;
    app.snapLines = [];
    requestFull();
    return true;
  }
  function goLive(d, items) {
    if (items.some((i) => i.kind === "el")) {
      app.live++;
      d.live = true;
    }
  }
  function unitRound(r, edge, item, on = true) {
    const out = { ...r };
    const ctx = item ? itemCtx(item) : { pw: app.vw, ph: app.vh, fs: app.rootFS };
    const horiz = edge === "l" || edge === "r";
    const size = horiz ? r.w : r.h;
    const v = on ? snapToUnit(size, horiz ? "w" : "h", ctx) : Math.max(1, Math.round(size));
    if (horiz) {
      if (edge === "l") out.x = r.x + r.w - v;
      out.w = v;
    } else {
      if (edge === "t") out.y = r.y + r.h - v;
      out.h = v;
    }
    return out;
  }
  function nearestTarget(v, list) {
    let best = null;
    for (const t of list) {
      const dd = Math.abs(t.v - v);
      if (dd <= SNAP && (!best || dd < Math.abs(best - v))) best = t.v;
    }
    return best;
  }
  function beginDraw(d) {
    d.type = "draw";
    d.targets = buildTargets([]);
    if (!d.mod) {
      const x = nearestTarget(d.sx, d.targets.xs);
      const y = nearestTarget(d.sy, d.targets.ys);
      if (x != null) d.sx = x;
      if (y != null) d.sy = y;
    }
    setSelection([]);
  }
  function drawDrag(d) {
    let px = d.x;
    let py = d.y;
    if (d.shift) {
      const s = Math.max(Math.abs(px - d.sx), Math.abs(py - d.sy));
      px = d.sx + Math.sign(px - d.sx || 1) * s;
      py = d.sy + Math.sign(py - d.sy || 1) * s;
    }
    let r = normRect(d.sx, d.sy, px, py);
    const edges = { l: px < d.sx, r: px >= d.sx, t: py < d.sy, b: py >= d.sy };
    let lines = [];
    if (!d.mod && !d.shift) {
      const res = snapEdges(r, edges, d.targets);
      r = res.rect;
      lines = res.lines;
      if (!res.snappedX) r = unitRound(r, edges.l ? "l" : "r", null);
      if (!res.snappedY) r = unitRound(r, edges.t ? "t" : "b", null);
    }
    app.preview = { rect: r, start: { x: d.sx, y: d.sy } };
    app.snapLines = lines;
  }
  function beginMove(d, inTx = false) {
    if (!inTx) begin("Move");
    const items = liveSel();
    d.type = "move";
    d.items = items.map(startState);
    d.box0 = union(d.items.map((s) => s.rect));
    d.targets = buildTargets(items);
    goLive(d, items);
  }
  function moveDrag(d) {
    let dx = d.x - d.sx;
    let dy = d.y - d.sy;
    let lockX = false;
    let lockY = false;
    if (d.shift) {
      if (Math.abs(dx) > Math.abs(dy)) {
        dy = 0;
        lockY = true;
      } else {
        dx = 0;
        lockX = true;
      }
    }
    let lines = [];
    if (!d.mod) {
      const s = snapMove({ x: d.box0.x + dx, y: d.box0.y + dy, w: d.box0.w, h: d.box0.h }, d.targets);
      if (!lockX) dx += s.dx;
      if (!lockY) dy += s.dy;
      lines = s.lines.filter((l) => l.x1 === l.x2 ? !lockX : !lockY);
    }
    for (const s of d.items) applyRect(s, { x: s.rect.x + dx, y: s.rect.y + dy, w: s.rect.w, h: s.rect.h }, false);
    app.snapLines = lines;
  }
  function beginEdge(d, hot) {
    const it = hot.it;
    if (!isSelected(it)) setSelection([it]);
    const group2 = app.sel.length > 1 ? liveSel() : [it];
    begin("Resize");
    d.type = "edge";
    d.edge = hot.edge;
    d.f = hot.f;
    d.exact = !!hot.exact;
    d.main = it;
    d.items = group2.map(startState);
    d.mainState = d.items.find((s) => same(s.it, it)) || d.items[0];
    d.targets = buildTargets(group2);
    goLive(d, group2);
  }
  function edgeDrag(d) {
    const e = d.edge;
    const m = d.mainState.rect;
    let r = { ...m };
    if (e === "r") r.w = Math.max(1, d.x - m.x);
    if (e === "l") {
      const x2 = m.x + m.w;
      r.x = Math.min(d.x, x2 - 1);
      r.w = x2 - r.x;
    }
    if (e === "b") r.h = Math.max(1, d.y - m.y);
    if (e === "t") {
      const y2 = m.y + m.h;
      r.y = Math.min(d.y, y2 - 1);
      r.h = y2 - r.y;
    }
    let lines = [];
    const res = d.mod ? null : snapEdges(r, { l: e === "l", r: e === "r", t: e === "t", b: e === "b" }, d.targets);
    if (res) {
      r = res.rect;
      lines = res.lines;
    }
    const snapped = res && (e === "l" || e === "r" ? res.snappedX : res.snappedY);
    if (!snapped) r = unitRound(r, e, d.main, !d.mod);
    const dl = r.x - m.x;
    const dt = r.y - m.y;
    const dw = r.w - m.w;
    const dh = r.h - m.h;
    for (const s of d.items) {
      const q = s === d.mainState ? r : { x: s.rect.x + dl, y: s.rect.y + dt, w: Math.max(1, s.rect.w + dw), h: Math.max(1, s.rect.h + dh) };
      applyRect(s, q, true);
    }
    app.snapLines = lines;
  }
  function beginCorner(d) {
    const items = liveSel();
    if (!items.length) return beginMarquee(d);
    begin("Resize");
    d.type = "corner";
    d.corner = d.hot.corner;
    d.items = items.map(startState);
    d.box0 = union(d.items.map((s) => s.rect));
    d.targets = buildTargets(items);
    goLive(d, items);
  }
  function cornerDrag(d) {
    const B = d.box0;
    const c = d.corner;
    const west = c.includes("w");
    const north = c.includes("n");
    const ax = west ? B.x + B.w : B.x;
    const ay = north ? B.y + B.h : B.y;
    let w = Math.max(1, west ? ax - d.x : d.x - ax);
    let h = Math.max(1, north ? ay - d.y : d.y - ay);
    if (d.shift) {
      const k = Math.max(w / B.w, h / B.h);
      w = Math.max(1, B.w * k);
      h = Math.max(1, B.h * k);
    }
    let r = { x: west ? ax - w : ax, y: north ? ay - h : ay, w, h };
    let lines = [];
    if (!d.mod && !d.shift) {
      const res = snapEdges(r, { l: west, r: !west, t: north, b: !north }, d.targets);
      r = res.rect;
      lines = res.lines;
      if (d.items.length === 1) {
        if (!res.snappedX) r = unitRound(r, west ? "l" : "r", d.items[0].it);
        if (!res.snappedY) r = unitRound(r, north ? "t" : "b", d.items[0].it);
      }
    }
    const sx = r.w / B.w;
    const sy = r.h / B.h;
    for (const s of d.items) {
      const q = d.items.length === 1 ? r : { x: r.x + (s.rect.x - B.x) * sx, y: r.y + (s.rect.y - B.y) * sy, w: Math.max(1, s.rect.w * sx), h: Math.max(1, s.rect.h * sy) };
      applyRect(s, q, true);
    }
    app.snapLines = lines;
  }
  function beginSpacing(d) {
    const sp = computeSpacing(liveSel());
    if (!sp) return beginMarquee(d);
    begin("Spacing");
    d.type = "spacing";
    d.axis = sp.axis;
    d.items = sp.sorted.map((o) => startState(o.it));
    d.gaps0 = sp.gaps.map((g) => g.g);
    goLive(d, d.items.map((s) => s.it));
  }
  function spacingDrag(d) {
    const delta = d.axis === "x" ? d.x - d.sx : d.y - d.sy;
    const step = d.mod ? 1 : Math.max(1, unitStep(d.axis === "x" ? "w" : "h"));
    let pos = null;
    d.items.forEach((s, i) => {
      const r = { ...s.rect };
      if (i > 0) {
        if (d.axis === "x") r.x = pos;
        else r.y = pos;
      }
      applyRect(s, r, false);
      if (i < d.gaps0.length) {
        let g = Math.max(0, d.gaps0[i] + delta);
        g = Math.round(g / step) * step;
        pos = (d.axis === "x" ? r.x + r.w : r.y + r.h) + g;
      }
    });
  }
  function beginMarquee(d) {
    d.type = "marquee";
    d.base = d.shift ? app.sel.slice() : [];
  }
  function marqueeDrag(d) {
    const m = normRect(d.sx, d.sy, d.x, d.y);
    app.marquee = m;
    const found = [];
    for (const s of activeShapes()) if (overlaps(shapeRect(s), m)) found.push(shapeItem(s));
    if (app.state.mode === "change" && !app.state.canvasMode && m.w > 2 && m.h > 2) {
      const inside = /* @__PURE__ */ new Set();
      for (const c of app.cands) {
        if (c.dup || c.w < 2 || c.h < 2) continue;
        if (containsRect(m, c)) inside.add(c);
      }
      for (const c of inside) {
        let p = c.parent;
        let nested = false;
        while (p) {
          if (inside.has(p)) {
            nested = true;
            break;
          }
          p = p.parent;
        }
        if (!nested) found.push(elItem(c.el));
        if (found.length > 300) break;
      }
    }
    const merged = d.base.slice();
    for (const f of found) if (!merged.some((b) => same(b, f))) merged.push(f);
    setSelection(merged);
  }
  function click(d) {
    const hot = d.hot;
    if (hot && hot.type === "chip") return hub.openEditor(hot.chip);
    if (hot && hot.type === "edge") {
      const chip2 = app.chips.find((c) => containsPt(c, d.sx, d.sy, 1));
      if (chip2) return hub.openEditor(chip2);
      if (!isSelected(hot.it)) setSelection([hot.it]);
      return;
    }
    if (hot) return;
    const it = d.item;
    if (!it) {
      if (!d.shift) setSelection([]);
      return;
    }
    if (d.alt && it.kind === "shape") {
      begin("Duplicate");
      touchShapes();
      const s = duplicateShape(it.shape);
      commit();
      setSelection([shapeItem(s)]);
      return;
    }
    if (d.mod && it.kind === "el") return modClick(it, d.shift);
    if (d.shift) return toggleSelected(it);
    setSelection([it]);
  }
  function modClick(it, shift) {
    if (shift) {
      const base = alikeBase(it.el);
      const list = alikeOf(base);
      setSelection(list.map(elItem));
      hub.toast(
        list.length > 1 ? `Picked all ${list.length} like this (${alikeLabel(base)}) — W A S D or drag to change them together` : `Nothing else on the page looks like this (${alikeLabel(base)})`,
        2600
      );
      return;
    }
    const sel = liveSel().filter((s) => s.kind === "el");
    const inside = sel.filter((s) => deepContains(s.el, it.el));
    if (!inside.length) {
      setSelection([it]);
      return;
    }
    const up = (sel.length > 1 ? sel : inside).map((s) => parentPick(s.el) || s.el);
    const uniq = [];
    for (const el of up) if (!uniq.includes(el)) uniq.push(el);
    const outer = uniq.filter((el) => !uniq.some((o) => o !== el && deepContains(o, el)));
    const moved = outer.some((el) => !sel.some((s) => s.el === el));
    if (!moved) {
      hub.toast("That's already the biggest box", 1400);
      return;
    }
    setSelection(outer.map(elItem));
    hub.toast(outer.length === 1 ? `Picked the box around it: ${describe(outer[0])}` : `Picked the boxes around them (${outer.length})`, 1600);
  }
  function onContext(e) {
    if (!interactive()) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.ctrlKey && e.button === 0) return;
    const s = shapeAt(e.clientX, e.clientY, 2);
    if (!s) return;
    begin("Remove box");
    touchShapes();
    removeShape(s);
    commit();
    setSelection(app.sel.filter((it) => !(it.kind === "shape" && it.shape === s)));
  }
  function canScroll(el, dx, dy) {
    let cs;
    try {
      cs = getComputedStyle(el);
    } catch {
      return false;
    }
    const oy = cs.overflowY;
    const ox = cs.overflowX;
    if (dy && (oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight + 1) {
      if (dy > 0 ? el.scrollTop + el.clientHeight < el.scrollHeight - 1 : el.scrollTop > 0) return true;
    }
    if (dx && (ox === "auto" || ox === "scroll") && el.scrollWidth > el.clientWidth + 1) {
      if (dx > 0 ? el.scrollLeft + el.clientWidth < el.scrollWidth - 1 : el.scrollLeft > 0) return true;
    }
    return false;
  }
  function onWheel(e) {
    if (app.state.canvasMode) {
      e.preventDefault();
      return;
    }
    if (e.ctrlKey) return;
    const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? app.vh : 1;
    const dx = e.deltaX * k;
    const dy = e.deltaY * k;
    let list;
    try {
      list = document.elementsFromPoint(e.clientX, e.clientY);
    } catch {
      return;
    }
    const hit = list.find((el2) => el2 !== app.host);
    let el = hit;
    while (el && !isRootish(el)) {
      if (canScroll(el, dx, dy)) {
        e.preventDefault();
        el.scrollBy({ left: dx, top: dy, behavior: "instant" });
        requestFull();
        return;
      }
      el = parentOf(el);
    }
  }
  function nudge(key, step) {
    const items = liveSel();
    if (!items.length) return;
    const dx = key === "ArrowLeft" ? -step : key === "ArrowRight" ? step : 0;
    const dy = key === "ArrowUp" ? -step : key === "ArrowDown" ? step : 0;
    begin("Nudge");
    for (const s of items.map(startState)) applyRect(s, { x: s.rect.x + dx, y: s.rect.y + dy, w: s.rect.w, h: s.rect.h }, false);
    commit();
    requestFull();
  }
  function keyResize(key, fine) {
    const items = liveSel();
    if (!items.length) return;
    begin("Resize");
    for (const s of items.map(startState)) {
      const r = { ...s.rect };
      const f = (v, grow2) => {
        if (fine) return Math.max(1, Math.round(v) + (grow2 ? 1 : -1));
        let n = Math.round(grow2 ? v * 1.05 : v / 1.05);
        if (n === Math.round(v)) n += grow2 ? 1 : -1;
        return Math.max(1, n);
      };
      if (key === "d") r.w = f(r.w, true);
      if (key === "a") r.w = f(r.w, false);
      if (key === "s") r.h = f(r.h, true);
      if (key === "w") r.h = f(r.h, false);
      applyRect(s, r, true);
    }
    commit();
    requestFull();
  }
  function deleteSelection() {
    const items = liveSel();
    if (!items.length) return;
    begin("Delete");
    let els = 0;
    let boxes = 0;
    for (const it of items) {
      if (it.kind === "shape") {
        touchShapes();
        removeShape(it.shape);
        boxes++;
      } else {
        touch(it.el);
        setDeleted(it.el, true);
        els++;
      }
    }
    commit();
    setSelection([]);
    requestCollect();
    if (els) hub.toast(`Hid ${els} element${els === 1 ? "" : "s"} — its space stays · Reflow closes the gap · ⌘Z undoes`);
    else if (boxes > 1) hub.toast(`Removed ${boxes} boxes`);
  }
  function escape() {
    if (cancelDrag()) return true;
    if (hub.closeFlyouts()) return true;
    if (app.sel.length) {
      setSelection([]);
      return true;
    }
    if (app.state.canvasMode) {
      hub.setCanvas(false);
      return true;
    }
    if (app.state.mode !== "measure") {
      hub.setMode("measure");
      return true;
    }
    hub.close();
    return true;
  }
  function onKey(e) {
    if (!app.state.open || app.state.closing) return;
    const t = e.composedPath ? e.composedPath()[0] : e.target;
    if (t && isOurs(t) && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
    if (e.isComposing || pageIsTyping()) return;
    const k = e.key || "";
    const lower = k.length === 1 ? k.toLowerCase() : k;
    const mod = e.metaKey || e.ctrlKey;
    const st = app.state;
    const editing2 = interactive();
    const hasSel = editing2 && app.sel.length > 0;
    const d = app.drag;
    setMods(e);
    if (d && (k === "Shift" || k === "Meta" || k === "Control" || k === "Alt")) {
      d.shift = e.shiftKey;
      d.mod = e.metaKey || e.ctrlKey;
      if (d.type !== "pending") dragMove(d);
      requestRender();
      return;
    }
    if (st.capturing) {
      if (k === "Escape") {
        hub.cancelCapture();
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
      return;
    }
    let handled = false;
    if (k === "Escape") handled = escape();
    else if (mod && !e.altKey && lower === "z") {
      if (e.shiftKey ? canRedo() : canUndo()) {
        handled = true;
        if (e.shiftKey) redo();
        else undo();
        hub.sync();
      }
    } else if (mod && !e.altKey && !e.shiftKey && lower === "y" && canRedo()) {
      handled = true;
      redo();
      hub.sync();
    } else if (mod && !e.altKey && lower === "g" && st.mode === "change" && !st.canvasMode && hasSel) {
      handled = true;
      if (e.shiftKey) hub.ungroup();
      else hub.group();
    } else if (!mod && !e.altKey) {
      if ((k === "Delete" || k === "Backspace") && hasSel) {
        handled = true;
        deleteSelection();
      } else if (k.startsWith("Arrow") && hasSel) {
        handled = true;
        nudge(k, e.shiftKey ? 10 : 1);
      } else if (lower.length === 1 && "wasd".includes(lower) && hasSel) {
        handled = true;
        keyResize(lower, e.shiftKey);
      } else if (lower === "u") {
        handled = true;
        hub.cycleUnit(e.shiftKey ? -1 : 1);
      } else if (lower === "h") {
        handled = true;
        hub.toggleGuides();
      }
    }
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      hub.sync();
    }
  }
  function onKeyUp(e) {
    setMods(e);
    const d = app.drag;
    if (!d) return;
    d.shift = e.shiftKey;
    d.mod = e.metaKey || e.ctrlKey;
    if (d.type !== "pending") dragMove(d);
    requestRender();
  }
  function onOut(e) {
    if (!e.relatedTarget && !app.drag) {
      app.mouse.inside = false;
      app.hover = null;
      app.hot = null;
      requestRender();
    }
  }
  function onBlur() {
    app.mods = { mod: false, shift: false };
    if (app.drag && app.drag.type !== "pending") {
      const d = app.drag;
      app.drag = null;
      endDrag(d);
      app.preview = null;
      app.marquee = null;
      app.snapLines = [];
    }
  }
  var STOP = ["pointerdown", "pointerup", "mousedown", "mouseup", "click", "dblclick", "auxclick", "contextmenu", "keydown", "keyup", "keypress", "touchstart", "touchend"];
  function setupLayer() {
    app.layer.addEventListener("pointerdown", onDown);
    app.layer.addEventListener("contextmenu", onContext);
    app.layer.addEventListener("wheel", onWheel, { passive: false });
    for (const t of STOP) app.root.addEventListener(t, (e) => e.stopPropagation(), t.startsWith("touch") ? { passive: true } : false);
  }
  function attachInteract() {
    window.addEventListener("pointermove", onMove, true);
    window.addEventListener("pointerup", onUp, true);
    window.addEventListener("pointercancel", onCancel, true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("mouseout", onOut, true);
    window.addEventListener("blur", onBlur);
    hub.cancelDrag = cancelDrag;
    hub.refreshHot = refreshHot;
  }
  function detachInteract() {
    cancelDrag();
    window.removeEventListener("pointermove", onMove, true);
    window.removeEventListener("pointerup", onUp, true);
    window.removeEventListener("pointercancel", onCancel, true);
    window.removeEventListener("keydown", onKey, true);
    window.removeEventListener("keyup", onKeyUp, true);
    window.removeEventListener("mouseout", onOut, true);
    window.removeEventListener("blur", onBlur);
    app.hover = null;
    app.hot = null;
    setCursor("");
  }

  // src/content/styles.js
  var CSS = `
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
.btn.guides .i-off { display: none; }
.btn.guides.off .i-on { display: none; }
.btn.guides.off .i-off { display: block; }
.btn.guides.off { color: #9ca3af; }

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
.purple .btn.guides.off { color: #c4b5fd; }
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

  // src/content/index.js
  var VERSION = "0.2.0";
  var BUILD = true ? "d622bdeec66b" : VERSION;
  var mo = null;
  var timers = [];
  var closeTimer = 0;
  var collectTimer = 0;
  function build() {
    const host = document.createElement(HOST_TAG);
    host.style.cssText = "all: initial !important; position: fixed !important; inset: 0 !important; z-index: 2147483647 !important; pointer-events: none !important; display: block !important;";
    const shadow = host.attachShadow({ mode: "open" });
    let styled = false;
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(CSS);
      shadow.adoptedStyleSheets = [sheet];
      styled = true;
    } catch {
    }
    if (!styled) {
      const st = document.createElement("style");
      st.textContent = CSS;
      shadow.appendChild(st);
    }
    const root = document.createElement("div");
    root.className = "pd";
    root.dataset.mode = "measure";
    shadow.appendChild(root);
    const board = document.createElement("div");
    board.className = "board";
    const canvas = document.createElement("canvas");
    canvas.className = "cv";
    const layer = document.createElement("div");
    layer.className = "layer";
    root.append(board, canvas, layer);
    app.host = host;
    app.shadow = shadow;
    app.root = root;
    app.board = board;
    app.canvas = canvas;
    app.ctx = canvas.getContext("2d");
    app.layer = layer;
    buildUI();
    setupLayer();
  }
  function scheduleCollect() {
    if (collectTimer) return;
    const wait = Math.max(250, Math.min(2e3, (app.collectMs || 0) * 6));
    collectTimer = setTimeout(() => {
      collectTimer = 0;
      requestCollect();
    }, wait);
  }
  function onMutations(list) {
    if (!app.state.open) return;
    for (const m of list) {
      const t = m.target;
      if (t === app.host) continue;
      if (m.type === "childList") {
        let ours = true;
        for (const n of m.addedNodes) if (n !== app.host) ours = false;
        for (const n of m.removedNodes) if (n !== app.host) ours = false;
        if (ours) continue;
      } else if (m.type === "attributes" && m.attributeName === "style" && getRec(t)) {
        continue;
      }
      scheduleCollect();
      return;
    }
  }
  function onScroll(e) {
    const t = e.target;
    if (t === document || t === document.documentElement || t === document.body || t === window) {
      requestRender();
      const b = app.band;
      if (b) {
        const sy = window.scrollY;
        const vh = window.innerHeight;
        if (sy < b.top + vh * 0.5 || sy + vh > b.bottom - vh * 0.5) requestCollect();
      }
    } else requestFull();
  }
  function onResize() {
    resizeCanvas();
    requestCollect();
    app.uiRectDirty = true;
  }
  function onSettled() {
    requestFull();
  }
  function attachListeners() {
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    window.addEventListener("resize", onResize);
    window.addEventListener("transitionend", onSettled, true);
    window.addEventListener("animationend", onSettled, true);
    window.addEventListener("load", onSettled, true);
    try {
      document.fonts.addEventListener("loadingdone", onSettled);
    } catch {
    }
    mo = new MutationObserver(onMutations);
    mo.observe(document.documentElement, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class", "style", "hidden", "open", "src", "srcset", "width", "height", "colspan", "rowspan", "type", "dir"]
    });
    timers.push(setInterval(requestFull, 1e3));
  }
  function detachListeners() {
    window.removeEventListener("scroll", onScroll, { capture: true });
    window.removeEventListener("resize", onResize);
    window.removeEventListener("transitionend", onSettled, true);
    window.removeEventListener("animationend", onSettled, true);
    window.removeEventListener("load", onSettled, true);
    try {
      document.fonts.removeEventListener("loadingdone", onSettled);
    } catch {
    }
    if (mo) mo.disconnect();
    mo = null;
    for (const t of timers) clearInterval(t);
    timers = [];
    clearTimeout(collectTimer);
    collectTimer = 0;
  }
  function tick(now) {
    app.raf = requestAnimationFrame(tick);
    const st = app.state;
    if (!st.open) return;
    if (window.innerWidth !== app.vw || window.innerHeight !== app.vh || (window.devicePixelRatio || 1) !== app.dpr) {
      resizeCanvas();
      requestCollect();
    }
    if (app.needCollect && !app.drag && !st.closing) {
      try {
        collect();
      } catch (err) {
        console.warn("[Precise Dimension] measuring failed", err);
        app.needCollect = false;
      }
      keepAnimating(900);
    }
    const animating = now < app.animUntil || app.live > 0 || !!app.drag;
    if (!app.dirty && !animating) return;
    app.dirty = false;
    try {
      measure(false);
      draw(now);
      frameUI(now);
    } catch (err) {
      console.warn("[Precise Dimension] drawing failed", err);
    }
  }
  function open() {
    const st = app.state;
    if (st.open && !st.closing) return;
    clearTimeout(closeTimer);
    if (!app.host) build();
    if (!app.host.isConnected) (document.documentElement || document.body).appendChild(app.host);
    const wasClosing = st.closing;
    st.open = true;
    st.closing = false;
    st.capturing = false;
    st.mode = "measure";
    st.canvasMode = false;
    st.alignOpen = false;
    app.root.classList.remove("capturing");
    if (!wasClosing) {
      app.openedAt = performance.now();
      app.revealed = /* @__PURE__ */ new WeakMap();
      app.reduceMotion = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
      resizeCanvas();
      startWave();
      collect();
      attachListeners();
    }
    keepAnimating(2100);
    attachInteract();
    showBars();
    sync();
    showHint();
    if (!app.raf) app.raf = requestAnimationFrame(tick);
  }
  function finish() {
    detachListeners();
    if (app.raf) cancelAnimationFrame(app.raf);
    app.raf = 0;
    app.state.open = false;
    app.state.closing = false;
    if (app.host) app.host.remove();
  }
  function close() {
    const st = app.state;
    if (!st.open || st.closing) return;
    hub.cancelDrag();
    hub.closeEditor(false);
    st.alignOpen = false;
    st.canvasMode = false;
    st.mode = "measure";
    setSelection([]);
    st.closing = true;
    st.closeStart = performance.now();
    hideBars();
    sync();
    detachInteract();
    keepAnimating(500);
    closeTimer = setTimeout(finish, 420);
  }
  function toggle() {
    if (app.state.open && !app.state.closing) close();
    else open();
  }
  hub.close = close;
  function retire() {
    clearTimeout(closeTimer);
    try {
      hub.cancelDrag();
      detachInteract();
    } catch {
    }
    finish();
  }
  (function main() {
    const existing = window.__PD__;
    if (existing && typeof existing.toggle === "function") {
      if (existing.build === BUILD) {
        existing.toggle();
        return;
      }
      try {
        if (typeof existing.retire === "function") existing.retire();
        else existing.close();
      } catch {
      }
      for (const n of document.querySelectorAll(HOST_TAG)) n.remove();
    }
    if (!document.documentElement) return;
    window.__PD__ = { version: VERSION, build: BUILD, app, hub, open, close, toggle, retire, requestFull, requestRender };
    loadPrefs().finally(open);
  })();
})();
