// Pixel-art heroes, built from layered sprite maps (20 x 24 pixels).
// Each layer is a list of text rows; each character is one pixel ('.' = transparent).
// Later steps add shop items as more layers.

export const SKINS = ['#ffdcb8', '#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#5c3a21'];
export const COLORS = ['#e63946', '#f4845f', '#ffd23f', '#3ddc84', '#2ec4b6', '#1e88e5', '#4361ee', '#8e44ad', '#34344a', '#eeeeee', '#ff8fab', '#8d6346'];
export const HATS = [
  { id: 'hair', label: 'Hair' }, { id: 'cap', label: 'Cap' }, { id: 'beanie', label: 'Beanie' },
  { id: 'wizard', label: 'Wizard' }, { id: 'crown', label: 'Crown' }, { id: 'headphones', label: 'Headphones' },
  { id: 'helmet', label: 'Helmet' }, { id: 'horns', label: 'Horns' },
];
export const FACES = [
  { id: 'smile', label: 'Smile' }, { id: 'grin', label: 'Grin' }, { id: 'cool', label: 'Shades' },
  { id: 'wink', label: 'Wink' }, { id: 'focused', label: 'Focused' },
];
export const CLASSES = [
  { id: 'knight', label: 'Knight' }, { id: 'mage', label: 'Mage' },
  { id: 'archer', label: 'Archer' }, { id: 'ninja', label: 'Ninja' },
];

const pick = a => Math.floor(Math.random() * a.length);

export function randomAvatar() {
  return { cls: pick(CLASSES), color: pick(COLORS), skin: pick(SKINS), hat: pick(HATS), hc: pick(COLORS), face: pick(FACES) };
}

export function normalizeAvatar(a) {
  a = a && typeof a === 'object' ? a : {};
  const n = (v, arr) => (Number.isInteger(v) && v >= 0 && v < arr.length ? v : 0);
  return { cls: n(a.cls, CLASSES), color: n(a.color, COLORS), skin: n(a.skin, SKINS), hat: n(a.hat, HATS), hc: n(a.hc, COLORS), face: n(a.face, FACES) };
}

export function shade(hex, amt) {
  const num = parseInt(hex.replace('#', ''), 16);
  let r = num >> 16, g = (num >> 8) & 255, b = num & 255;
  const t = amt < 0 ? 0 : 255, p = Math.abs(amt);
  r = Math.round((t - r) * p + r); g = Math.round((t - g) * p + g); b = Math.round((t - b) * p + b);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

export const avatarColor = a => COLORS[normalizeAvatar(a).color];

// ---------- Tiny sprite engine (shared with boss.js) ----------
export function makeGrid(w, h) { return Array.from({ length: h }, () => Array(w).fill(null)); }

export function paint(grid, layer, pal) {
  const y0 = layer.y || 0, x0 = layer.x || 0;
  layer.rows.forEach((row, dy) => {
    for (let dx = 0; dx < row.length; dx++) {
      const col = pal[row[dx]];
      const y = y0 + dy, x = x0 + dx;
      if (col && grid[y] && x >= 0 && x < grid[y].length) grid[y][x] = col;
    }
  });
}

export function dots(grid, list, color) {
  for (const [x, y] of list) if (grid[y] && x >= 0 && x < grid[y].length) grid[y][x] = color;
}

// Turns a pixel grid into SVG rectangles, merging runs of the same color in each row.
export function gridRects(grid) {
  let out = '';
  grid.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const c = row[x];
      if (!c) { x++; continue; }
      let n = 1;
      while (x + n < row.length && row[x + n] === c) n++;
      // the tiny overlap hides hairline seams when the sprite is scaled
      out += `<rect x="${x}" y="${y}" width="${n + 0.04}" height="1.04" fill="${c}"/>`;
      x += n;
    }
  });
  return out;
}

// ---------- Hero layers ----------
const INK = '#1a1226';

const BASE = { y: 3, rows: [
  '.....KKKKKKKK',
  '....KSSSSSSSSK',
  '...KSSSSSSSSSSK',
  '...KSSSSSSSSSSK',
  '...KSSSSSSSSSSK',
  '...KSSSSSSSSSSK',
  '...KsSSSSSSSSsK',
  '....KsSSSSSSsK',
  '.....KKKKKKKK',
  '....KCCCCCCCCK',
  '...KCCCCccCCCCK',
  '..KSKCCCCCCCCKSK',
  '..KSKCCCCCCCCKSK',
  '..KKKBBBGBBBBKKK',
  '....KCCCCCCCCK',
  '....KccCCCCccK',
  '....KKKKKKKKKK',
  '.....KBBK.KBBK',
  '.....KBBK.KBBK',
  '.....KKKK.KKKK',
  '....oooooooooo',
] };

const EYES = [[6, 7], [6, 8], [11, 7], [11, 8]];
const BLUSH = [[5, 9], [12, 9]];
const SMILE = [[7, 9], [10, 9], [8, 10], [9, 10]];

function drawFace(g, id) {
  const K = INK, R = '#ff8a8a';
  switch (id) {
    case 'grin':
      dots(g, [[5, 8], [6, 7], [7, 8], [10, 8], [11, 7], [12, 8]], K);
      dots(g, [[7, 9], [8, 9], [9, 9], [10, 9]], K);
      dots(g, [[8, 10], [9, 10]], '#e63946');
      dots(g, BLUSH, R);
      break;
    case 'cool':
      dots(g, [[5, 7], [6, 7], [7, 7], [8, 7], [9, 7], [10, 7], [11, 7], [12, 7], [5, 8], [6, 8], [7, 8], [10, 8], [11, 8], [12, 8]], K);
      dots(g, [[5, 7], [10, 7]], '#ffffff');
      dots(g, [[8, 10], [9, 10], [10, 9]], K);
      break;
    case 'wink':
      dots(g, [[6, 7], [6, 8], [10, 8], [11, 8], [12, 8]], K);
      dots(g, SMILE, K); dots(g, BLUSH, R);
      break;
    case 'focused':
      dots(g, [[5, 5], [6, 6], [7, 6], [12, 5], [11, 6], [10, 6]], K);
      dots(g, EYES, K);
      dots(g, [[8, 10], [9, 10]], K);
      break;
    default:
      dots(g, EYES, K); dots(g, SMILE, K); dots(g, BLUSH, R);
  }
}

const HAT_LAYERS = {
  hair: { y: 2, rows: [
    '.....KKKKKKKK',
    '....KHHHHHHHHK',
    '...KHHhHHHHHHHK',
    '...KHH.....HHHK',
    '...KH........HK',
  ] },
  cap: { y: 2, rows: [
    '.....KKKKKKKK',
    '....KHHHHHHHHK',
    '...KHHHHWHHHHHK',
    '...KhhhhhhhhhhhhhK',
  ] },
  beanie: { y: 1, rows: [
    '........KWK',
    '.....KKKKKKKK',
    '....KHHHHHHHHK',
    '...KHHHHHHHHHHK',
    '...KhhhhhhhhhhK',
  ] },
  wizard: { y: 0, rows: [
    '..........KK',
    '.........KHK',
    '........KHHHK',
    '.......KHHGHHK',
    '......KHHHHHHHK',
    '..KhhhhhhhhhhhhK',
  ] },
  crown: { y: 1, rows: [
    '.....G..GG..G',
    '.....GG.GG.GG',
    '.....GGGGGGGG',
    '....KgRggggRgK',
    '...KDD......DDK',
  ] },
  headphones: { y: 1, rows: [
    '.....kkkkkkkk',
    '....kKKKKKKKKk',
    '...kKDDDDDDDDKk',
    '...kDDDDDDDDDDk',
    '..KHDD......DDHK',
    '..KH..........HK',
    '..KH..........HK',
    '..KK..........KK',
  ] },
  helmet: { y: 0, rows: [
    '..........HH',
    '.........HH',
    '.....KKKKKKKK',
    '....KMMMMMMMMK',
    '...KMWMMMMMMMMK',
    '...KmmmmmmmmmmK',
    '...Km...mm...mK',
  ] },
  horns: { y: 0, rows: [
    '..H...........H',
    '..HH.........HH',
    '...HHKKKKKKKKHH',
    '....KDDDDDDDDK',
    '...KDDDDDDDDDDK',
    '...KDD.....DDDK',
    '...KD........DK',
  ] },
};

const BLADE = '..............KMK';
const BOW_MID = '...............L.w';
const STAFF = '................w';
const WEAPON_LAYERS = {
  knight: { y: 3, rows: ['...............K', BLADE, BLADE, BLADE, BLADE, BLADE, BLADE, BLADE, BLADE, BLADE,
    '.............KgGGgK', '...............w', '...............w', '...............K'] },
  mage: { y: 1, rows: ['...............KKK', '..............KHHHK', '..............KHWHK', '..............KHHHK', '...............KKK',
    ...Array(17).fill(STAFF)] },
  archer: { y: 7, rows: ['...............Kw', '...............Lw', ...Array(9).fill(BOW_MID), '...............Lw', '...............Kw'] },
  ninja: { y: 12, rows: ['.................M', '................mMm', '...............MMKMM', '................mMm', '.................M'] },
};

export function avatarSVG(a, extraClass = '') {
  a = normalizeAvatar(a);
  const skin = SKINS[a.skin], col = COLORS[a.color], hc = COLORS[a.hc];
  const pal = {
    K: INK, S: skin, s: shade(skin, -0.16), C: col, c: shade(col, -0.28),
    H: hc, h: shade(hc, -0.3), D: '#3b2a20', B: '#4a2f1d', G: '#ffd23f', g: '#c9961a',
    M: '#e3e8ef', m: '#8b95a7', W: '#ffffff', w: '#8b5a2b', L: '#efe6d2', k: '#3a3a4a',
    R: '#e63946', o: 'rgba(0,0,0,.3)',
  };
  const g = makeGrid(20, 24);
  paint(g, BASE, pal);
  drawFace(g, FACES[a.face].id);
  paint(g, HAT_LAYERS[HATS[a.hat].id], pal);
  paint(g, WEAPON_LAYERS[CLASSES[a.cls].id], pal);
  return `<svg class="av ${extraClass}" viewBox="0 0 20 24" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${gridRects(g)}</svg>`;
}
