// PROTOTYPE — the sample Design Document from prototype/render-fidelity, grown to a
// realistic editor document. `makeDoc(n)` returns a document of ~n top-level elements:
// the original hard case (gradient, shadow, image crop + ellipse clip, rotation, group
// opacity, vector, wrapped text) plus generated cards, badges, and captions.

function starPath(cx, cy, outer, inner, points = 5) {
  const pts = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI / points) * i - Math.PI / 2;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
}

const PALETTE = ['#FF6B35', '#7A1FA2', '#06D6A0', '#EF476F', '#118AB2', '#FFD166', '#1D3557'];
const WORDS = ('fresh drops every week free shipping over fifty euro and the fine print stays ' +
  'fine kerning check AVATAR Wave limited offer new arrivals shop the look today').split(' ');

function words(seed, count) {
  const out = [];
  for (let i = 0; i < count; i++) out.push(WORDS[(seed * 7 + i * 3) % WORDS.length]);
  return out.join(' ');
}

export function makeDoc(n) {
  const base = [
    {
      id: 'hero', type: 'rect', x: 60, y: 60, width: 960, height: 520, rotation: 0,
      fill: { type: 'linear', stops: [{ offset: 0, color: '#FF6B35' }, { offset: 1, color: '#7A1FA2' }] },
      shadow: { dx: 0, dy: 12, blur: 24, color: '#000000', opacity: 0.35 },
    },
    {
      id: 'photo', type: 'image', x: 120, y: 140, width: 400, height: 360, rotation: -6,
      src: 'photo.png', naturalWidth: 800, naturalHeight: 600,
      content: { offsetX: -80, offsetY: -40, scale: 0.72 }, clip: 'ellipse',
    },
    { id: 'sun', type: 'ellipse', x: 760, y: 120, width: 220, height: 220, rotation: 0, fill: '#FFD166CC' },
    {
      id: 'star', type: 'vector', x: 800, y: 380, width: 180, height: 180, rotation: 15,
      path: starPath(90, 90, 90, 36), fill: '#06D6A0',
    },
    {
      id: 'badge', type: 'group', x: 620, y: 470, rotation: 3, opacity: 0.85,
      children: [
        { id: 'badge-bg', type: 'rect', x: 0, y: 0, width: 330, height: 80, rotation: 0, fill: '#1D3557' },
        {
          id: 'badge-label', type: 'text', x: 25, y: 40, width: 290, rotation: 0, fontWeight: 700,
          fontSize: 30, lineHeight: 1.2, color: '#FFFFFF', anchor: 'middle', align: 'left',
          content: 'LIMITED OFFER',
        },
      ],
    },
    {
      id: 'headline', type: 'text', x: 60, y: 640, width: 720, rotation: 0, fontWeight: 700,
      fontSize: 64, lineHeight: 1.15, color: '#1D3557', anchor: 'top', align: 'left',
      content: 'Summer Sale — Up to 50% Off Everything You Love',
    },
    {
      id: 'body', type: 'text', x: 60, y: 880, width: 640, rotation: 0, fontWeight: 400,
      fontSize: 28, lineHeight: 1.4, color: '#1D3557CC', anchor: 'top', align: 'left',
      content: 'Fresh drops every week, free shipping over €50, and the fine print stays fine. Kerning check: AVATAR Wave.',
    },
  ];

  const elements = base.slice();
  let i = 0;
  // Each generated "card" is a group of 3 (rect + text + ellipse) — the shape real
  // documents take. Filler alternates cards, loose captions, and decorations so the
  // element mix stays representative as n grows.
  while (elements.length < n) {
    const c = PALETTE[i % PALETTE.length];
    const x = 40 + (i % 5) * 200;
    const y = 40 + Math.floor(i / 5) * 160;
    const kind = i % 3;
    if (kind === 0) {
      elements.push({
        id: `card${i}`, type: 'group', x, y, rotation: (i % 7) - 3, opacity: 0.92,
        children: [
          { id: `card${i}-bg`, type: 'rect', x: 0, y: 0, width: 180, height: 140, rotation: 0, fill: c, cornerRadius: 12,
            shadow: { dx: 0, dy: 4, blur: 10, color: '#000000', opacity: 0.25 } },
          { id: `card${i}-t`, type: 'text', x: 12, y: 20, width: 156, rotation: 0, fontWeight: 700, fontSize: 20,
            lineHeight: 1.25, color: '#FFFFFF', anchor: 'top', align: 'left', content: words(i, 6) },
          { id: `card${i}-dot`, type: 'ellipse', x: 140, y: 100, width: 28, height: 28, rotation: 0, fill: '#FFFFFFAA' },
        ],
      });
    } else if (kind === 1) {
      elements.push({
        id: `cap${i}`, type: 'text', x, y, width: 190, rotation: 0, fontWeight: 400, fontSize: 18,
        lineHeight: 1.35, color: c, anchor: 'top', align: i % 2 ? 'center' : 'left', content: words(i, 9),
      });
    } else {
      elements.push({
        id: `dec${i}`, type: 'vector', x, y, width: 90, height: 90, rotation: (i * 13) % 360,
        path: starPath(45, 45, 45, 18, 6), fill: c + 'CC',
      });
    }
    i++;
  }
  return { schemaVersion: 1, canvas: { width: 1080, height: 1080, background: '#F4EFE8' }, elements };
}

// Count every element including group children — the number the compiler actually walks.
export function deepCount(doc) {
  const walk = (els) => els.reduce((a, e) => a + 1 + (e.children ? walk(e.children) : 0), 0);
  return walk(doc.elements);
}

export function countText(doc) {
  const walk = (els) => els.reduce((a, e) => a + (e.type === 'text' ? 1 : 0) + (e.children ? walk(e.children) : 0), 0);
  return walk(doc.elements);
}
