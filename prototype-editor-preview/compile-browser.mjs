// PROTOTYPE — browser port of the render-fidelity compiler (prototype/render-fidelity),
// instrumented and cache-aware so editor preview strategies can be compared.
//
// Same rules as the batch compiler: text wrapping decided HERE (greedy break over
// opentype.js advance widths), emitted as fixed <tspan> lines. The only additions are
// (a) timers around layout vs emission and (b) two memo caches keyed by object identity —
// an immutable editor store hands us a NEW element object only for what changed.

export const timers = { layout: 0, emit: 0, layoutCalls: 0, emitCalls: 0, memoHits: 0 };
export function resetTimers() {
  timers.layout = 0; timers.emit = 0;
  timers.layoutCalls = 0; timers.emitCalls = 0; timers.memoHits = 0;
}

let fonts = {}; // weight -> opentype font
export function setFonts(f) { fonts = f; }

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---- caches (WeakMap keyed by the element object itself) ----
const layoutCache = new WeakMap(); // textEl -> layout
const emitCache = new WeakMap();   // el -> { markup, defs }

export function clearCaches() {
  // WeakMaps cannot be cleared; swapping is not needed because strategy 'full'
  // simply does not consult them. Kept as a no-op so call sites read honestly.
}

export function layoutText(el, { useCache }) {
  if (useCache) {
    const hit = layoutCache.get(el);
    if (hit) { timers.memoHits++; return hit; }
  }
  const t0 = performance.now();
  const font = fonts[el.fontWeight >= 600 ? 700 : 400];
  const words = el.content.split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const cand = cur ? cur + ' ' + w : w;
    if (!cur || font.getAdvanceWidth(cand, el.fontSize, { kerning: true }) <= el.width) cur = cand;
    else { lines.push(cur); cur = w; }
  }
  lines.push(cur);
  const lineH = (el.lineHeight ?? 1.2) * el.fontSize;
  const ascent = (font.ascender / font.unitsPerEm) * el.fontSize;
  const totalH = lines.length * lineH;
  const halfLeading = (lineH - el.fontSize) / 2;
  const out = { lines, lineH, ascent, totalH, halfLeading };
  timers.layout += performance.now() - t0;
  timers.layoutCalls++;
  layoutCache.set(el, out);
  return out;
}

// Vertical placement depends on y/anchor, which are cheap and may change per frame,
// so they are applied at emission over the cached line breaking.
function placeText(el, lay) {
  const top = el.anchor === 'middle' ? el.y - lay.totalH / 2
            : el.anchor === 'bottom' ? el.y - lay.totalH
            : el.y;
  const baselines = lay.lines.map((_, i) => top + i * lay.lineH + lay.halfLeading + lay.ascent);
  return { top, baselines };
}

let uid = 0;

function emitElement(el, defs, assets, opts) {
  const rot = (cx, cy) => (el.rotation ? ` transform="rotate(${el.rotation} ${cx} ${cy})"` : '');
  switch (el.type) {
    case 'rect': {
      let fill = el.fill, extra = '';
      if (typeof el.fill === 'object') {
        const id = `grad${uid++}`;
        defs.push(`<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">` +
          el.fill.stops.map((s) => `<stop offset="${s.offset}" stop-color="${s.color}"/>`).join('') +
          `</linearGradient>`);
        fill = `url(#${id})`;
      }
      if (el.shadow) {
        const id = `sh${uid++}`;
        defs.push(`<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%">` +
          `<feDropShadow dx="${el.shadow.dx}" dy="${el.shadow.dy}" stdDeviation="${el.shadow.blur / 2}" ` +
          `flood-color="${el.shadow.color}" flood-opacity="${el.shadow.opacity}"/></filter>`);
        extra = ` filter="url(#${id})"`;
      }
      const r = el.cornerRadius ? ` rx="${el.cornerRadius}"` : '';
      return `<rect data-el="${el.id}" x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}"${r} fill="${fill}"${extra}${el.opacity != null ? ` opacity="${el.opacity}"` : ''}${rot(el.x + el.width / 2, el.y + el.height / 2)}/>`;
    }
    case 'ellipse':
      return `<ellipse data-el="${el.id}" cx="${el.x + el.width / 2}" cy="${el.y + el.height / 2}" rx="${el.width / 2}" ry="${el.height / 2}" fill="${el.fill}"${rot(el.x + el.width / 2, el.y + el.height / 2)}/>`;
    case 'image': {
      const id = `clip${uid++}`;
      const shape = el.clip === 'ellipse'
        ? `<ellipse cx="${el.x + el.width / 2}" cy="${el.y + el.height / 2}" rx="${el.width / 2}" ry="${el.height / 2}"/>`
        : `<rect x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}"/>`;
      defs.push(`<clipPath id="${id}">${shape}</clipPath>`);
      const c = el.content;
      return `<g data-el="${el.id}" clip-path="url(#${id})"${rot(el.x + el.width / 2, el.y + el.height / 2)}>` +
        `<image x="${el.x + c.offsetX}" y="${el.y + c.offsetY}" width="${el.naturalWidth * c.scale}" height="${el.naturalHeight * c.scale}" preserveAspectRatio="none" href="${assets[el.src]}"/></g>`;
    }
    case 'vector':
      return `<path data-el="${el.id}" d="${el.path}" fill="${el.fill}" transform="translate(${el.x} ${el.y})${el.rotation ? ` rotate(${el.rotation} ${el.width / 2} ${el.height / 2})` : ''}"/>`;
    case 'text': {
      const lay = layoutText(el, opts);
      const { top, baselines } = placeText(el, lay);
      const anchorAttr = el.align === 'center' ? ' text-anchor="middle"' : el.align === 'right' ? ' text-anchor="end"' : '';
      const ax = el.align === 'center' ? el.x + el.width / 2 : el.align === 'right' ? el.x + el.width : el.x;
      const spans = lay.lines.map((l, i) => `<tspan x="${ax}" y="${baselines[i].toFixed(2)}">${esc(l)}</tspan>`).join('');
      return `<text data-el="${el.id}" font-family="Lato" font-size="${el.fontSize}" font-weight="${el.fontWeight}" fill="${el.color}"${anchorAttr}${rot(el.x + el.width / 2, top + lay.totalH / 2)}>${spans}</text>`;
    }
    case 'group': {
      const inner = el.children.map((c) => compileElement(c, defs, assets, opts)).join('');
      let maxX = 0, maxY = 0;
      for (const c of el.children) {
        maxX = Math.max(maxX, c.x + (c.width ?? 0));
        maxY = Math.max(maxY, c.y + (c.height ?? (c.type === 'text' ? layoutText(c, opts).totalH : 0)));
      }
      return `<g data-el="${el.id}" transform="translate(${el.x} ${el.y})${el.rotation ? ` rotate(${el.rotation} ${maxX / 2} ${maxY / 2})` : ''}"${el.opacity != null ? ` opacity="${el.opacity}"` : ''}>${inner}</g>`;
    }
  }
}

// Memoized per element. Cached entry stores its own defs so they can be replayed.
function compileElement(el, defs, assets, opts) {
  if (opts.memo) {
    const hit = emitCache.get(el);
    if (hit) { timers.memoHits++; defs.push(...hit.defs); return hit.markup; }
  }
  const t0 = performance.now();
  const before = defs.length;
  const layoutBefore = timers.layout;
  const markup = emitElement(el, defs, assets, opts);
  // emission time excludes the text-layout time this call happened to trigger
  timers.emit += performance.now() - t0 - (timers.layout - layoutBefore);
  timers.emitCalls++;
  if (opts.memo) emitCache.set(el, { markup, defs: defs.slice(before) });
  return markup;
}

export function compile(doc, assets, opts = { memo: false, useCache: false }) {
  uid = 0;
  const defs = [];
  const body = doc.elements.map((el) => compileElement(el, defs, assets, opts)).join('\n');
  const { width, height, background } = doc.canvas;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<defs>${defs.join('')}</defs>` +
    `<rect width="${width}" height="${height}" fill="${background}"/>` +
    body + `</svg>`;
}

// Compile a single element in isolation — used by the DOM-patch strategy.
export function compileOne(el, assets, opts) {
  uid = 900000; // separate id space so patched defs cannot collide with the full pass
  const defs = [];
  const markup = emitElement(el, defs, assets, opts);
  return { markup, defs };
}
