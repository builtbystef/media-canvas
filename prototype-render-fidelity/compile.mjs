// PROTOTYPE — deterministic Design Document (JSON) → SVG compiler.
// Text wrapping is decided HERE (greedy break, opentype.js advance widths),
// so both engines receive identical pre-broken <tspan> lines — wrapping can
// never drift between editor and worker.
import { readFileSync } from 'node:fs';
import opentype from 'opentype.js';

export const FONT_FILES = {
  400: '/usr/share/fonts/truetype/lato/Lato-Regular.ttf',
  700: '/usr/share/fonts/truetype/lato/Lato-Bold.ttf',
};

const fonts = Object.fromEntries(
  Object.entries(FONT_FILES).map(([w, p]) => [w, opentype.parse(readFileSync(p).buffer.slice(0))])
);

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function layoutText(el) {
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
  const top = el.anchor === 'middle' ? el.y - totalH / 2
            : el.anchor === 'bottom' ? el.y - totalH
            : el.y;
  const halfLeading = (lineH - el.fontSize) / 2;
  const baselines = lines.map((_, i) => top + i * lineH + halfLeading + ascent);
  return { lines, baselines, top, totalH };
}

let uid = 0;
function compileElement(el, defs, assets) {
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
      return `<rect x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}" fill="${fill}"${extra}${rot(el.x + el.width / 2, el.y + el.height / 2)}/>`;
    }
    case 'ellipse':
      return `<ellipse cx="${el.x + el.width / 2}" cy="${el.y + el.height / 2}" rx="${el.width / 2}" ry="${el.height / 2}" fill="${el.fill}"${rot(el.x + el.width / 2, el.y + el.height / 2)}/>`;
    case 'image': {
      const id = `clip${uid++}`;
      const shape = el.clip === 'ellipse'
        ? `<ellipse cx="${el.x + el.width / 2}" cy="${el.y + el.height / 2}" rx="${el.width / 2}" ry="${el.height / 2}"/>`
        : `<rect x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}"/>`;
      defs.push(`<clipPath id="${id}">${shape}</clipPath>`);
      const c = el.content;
      return `<g clip-path="url(#${id})"${rot(el.x + el.width / 2, el.y + el.height / 2)}>` +
        `<image x="${el.x + c.offsetX}" y="${el.y + c.offsetY}" width="${el.naturalWidth * c.scale}" height="${el.naturalHeight * c.scale}" preserveAspectRatio="none" href="${assets[el.src]}"/></g>`;
    }
    case 'vector':
      return `<path d="${el.path}" fill="${el.fill}" transform="translate(${el.x} ${el.y})${el.rotation ? ` rotate(${el.rotation} ${el.width / 2} ${el.height / 2})` : ''}"/>`;
    case 'text': {
      const { lines, baselines, top, totalH } = layoutText(el);
      const spans = lines.map((l, i) => `<tspan x="${el.x}" y="${baselines[i].toFixed(2)}">${esc(l)}</tspan>`).join('');
      return `<text font-family="${el.fontFamily}" font-size="${el.fontSize}" font-weight="${el.fontWeight}" fill="${el.color}"${rot(el.x + el.width / 2, top + totalH / 2)}>${spans}</text>`;
    }
    case 'group': {
      const inner = el.children.map((c) => compileElement(c, defs, assets)).join('');
      // bbox from child geometry (text: layout height)
      let maxX = 0, maxY = 0;
      for (const c of el.children) {
        maxX = Math.max(maxX, c.x + (c.width ?? 0));
        maxY = Math.max(maxY, c.y + (c.height ?? (c.type === 'text' ? layoutText(c).totalH : 0)));
      }
      return `<g transform="translate(${el.x} ${el.y})${el.rotation ? ` rotate(${el.rotation} ${maxX / 2} ${maxY / 2})` : ''}"${el.opacity != null ? ` opacity="${el.opacity}"` : ''}>${inner}</g>`;
    }
  }
}

export function compile(doc, assets) {
  uid = 0;
  const defs = [];
  const body = doc.elements.map((el) => compileElement(el, defs, assets)).join('\n');
  const { width, height, background } = doc.canvas;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n` +
    `<defs>${defs.join('')}</defs>\n` +
    `<rect width="${width}" height="${height}" fill="${background}"/>\n` +
    body + `\n</svg>`;
}
