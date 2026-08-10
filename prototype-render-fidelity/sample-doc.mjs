// PROTOTYPE — the hard-case sample Design Document (format per ADR 0001).
// Exercises: gradient fill, drop shadow, alpha colors, image frame/crop with
// ellipse clip, rotated elements, nested group with group opacity, wrapped
// text with auto height (top + middle anchors), a vector star.

function starPath(cx, cy, outer, inner, points = 5) {
  const pts = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI / points) * i - Math.PI / 2;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
}

export const doc = {
  schemaVersion: 1,
  canvas: { width: 1080, height: 1080, background: '#F4EFE8' },
  elements: [
    {
      id: 'hero', type: 'rect', x: 60, y: 60, width: 960, height: 520, rotation: 0,
      fill: { type: 'linear', direction: 'diagonal', stops: [
        { offset: 0, color: '#FF6B35' }, { offset: 1, color: '#7A1FA2' } ] },
      shadow: { dx: 0, dy: 12, blur: 24, color: '#000000', opacity: 0.35 },
    },
    {
      id: 'photo', type: 'image', x: 120, y: 140, width: 400, height: 360, rotation: -6,
      src: 'photo.png', naturalWidth: 800, naturalHeight: 600,
      content: { offsetX: -80, offsetY: -40, scale: 0.72 },
      clip: 'ellipse',
    },
    {
      id: 'sun', type: 'ellipse', x: 760, y: 120, width: 220, height: 220, rotation: 0,
      fill: '#FFD166CC',
    },
    {
      id: 'star', type: 'vector', x: 800, y: 380, width: 180, height: 180, rotation: 15,
      path: starPath(90, 90, 90, 36), fill: '#06D6A0',
    },
    {
      id: 'badge', type: 'group', x: 620, y: 470, rotation: 3, opacity: 0.85,
      children: [
        { id: 'badge-bg', type: 'rect', x: 0, y: 0, width: 330, height: 80, rotation: 0, fill: '#1D3557' },
        { id: 'badge-label', type: 'text', x: 25, y: 40, width: 290, rotation: 0,
          fontFamily: 'Lato', fontWeight: 700, fontSize: 30, lineHeight: 1.2,
          color: '#FFFFFF', anchor: 'middle', content: 'LIMITED OFFER' },
      ],
    },
    {
      id: 'headline', type: 'text', x: 60, y: 640, width: 720, rotation: 0,
      fontFamily: 'Lato', fontWeight: 700, fontSize: 64, lineHeight: 1.15,
      color: '#1D3557', anchor: 'top',
      content: 'Summer Sale — Up to 50% Off Everything You Love',
    },
    {
      id: 'body', type: 'text', x: 60, y: 880, width: 640, rotation: 0,
      fontFamily: 'Lato', fontWeight: 400, fontSize: 28, lineHeight: 1.4,
      color: '#1D3557CC', anchor: 'top',
      content: 'Fresh drops every week, free shipping over €50, and the fine print stays fine. Kerning check: AVATAR Wave.',
    },
  ],
};
