// Medieval village pixel art: cottages and the castle (shaded, 3/4 view), plus scenery
// (trees, water, roads...). Everything is drawn into pixel grids from code, no image files.
import { makeGrid } from './avatar.js';

const K = '#1b1430';

// Cottage looks: [roof, roof dark, roof light, plaster, door]
export const EXTERIORS = [
  ['#c9a24a', '#9c7a2e', '#e3c46e', '#f1e6cc', '#7a4a26'], // thatch
  ['#b5523b', '#86382a', '#d47a5e', '#f4ead2', '#4a5a7a'], // red clay tiles
  ['#4a5a7a', '#33405a', '#6e81a3', '#eee3c8', '#8f2335'], // slate
  ['#4f7a3a', '#365a27', '#76a35a', '#efe2c2', '#5a3a24'], // mossy
  ['#6d3b6e', '#4c264d', '#93609a', '#f3e9d6', '#c9a24a'], // plum
  ['#5a3a24', '#3d2616', '#80583a', '#e9dcc0', '#2f6a5a'], // dark shingles
];

// ---------- tiny raster helpers ----------
export function rng(seed) { // mulberry32
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const hashStr = s => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const set = (g, x, y, c) => { x |= 0; y |= 0; if (g[y] && x >= 0 && x < g[y].length && c) g[y][x] = c; };
const rect = (g, x0, y0, x1, y1, c) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(g, x, y, typeof c === 'function' ? c(x, y) : c); };
function poly(g, pts, c) {
  const ys = pts.map(p => p[1]), y0 = Math.floor(Math.min(...ys)), y1 = Math.ceil(Math.max(...ys));
  const xs = pts.map(p => p[0]), x0 = Math.floor(Math.min(...xs)), x1 = Math.ceil(Math.max(...xs));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const px = x + 0.5, py = y + 0.5; let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
    }
    if (inside) set(g, x, y, typeof c === 'function' ? c(x, y) : c);
  }
}
function line(g, x0, y0, x1, y1, c) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1;
  for (let i = 0; i <= n; i++) set(g, Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), c);
}
function ellipse(g, cx, cy, rx, ry, c) {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
    if (dx * dx + dy * dy <= 1) set(g, x, y, typeof c === 'function' ? c(x, y, dx, dy) : c);
  }
}
// Dark outline around everything drawn so far (classic pixel-art look).
function outline(g, col = K) {
  const H = g.length, W = g[0].length, add = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (g[y][x]) continue;
    if ((g[y][x - 1] && g[y][x - 1] !== col) || (g[y][x + 1] && g[y][x + 1] !== col) || (g[y - 1] && g[y - 1][x] && g[y - 1][x] !== col) || (g[y + 1] && g[y + 1][x] && g[y + 1][x] !== col)) add.push([x, y]);
  }
  for (const [x, y] of add) g[y][x] = col;
}
const mix = (a, b, t) => { // blend two #rrggbb colors
  const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)), A = p(a), B = p(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
};

// ---------- Cottage (36 x 34): timber frame, gable front, roof and side wall in 3/4 view ----------
export function houseGrid(ext = 0, seed = 7) {
  const [roof, roofD, roofL, plaster, door] = EXTERIORS[ext] || EXTERIORS[0];
  const r = rng(seed + ext * 101), g = makeGrid(36, 34);
  const beam = '#4a2f1d', beamL = '#6b4527', plasterD = mix(plaster, '#7a6a50', 0.28), stone = '#8b8478', stoneD = '#5f594f', stoneL = '#a9a294';
  const plasterTex = (base, dark) => (x, y) => (r() < 0.07 ? dark : base);
  // side wall (in shadow), then front wall and gable
  poly(g, [[22, 17], [34.5, 12.8], [34.5, 28.5], [22, 32.5]], plasterTex(plasterD, mix(plasterD, '#000000', 0.12)));
  rect(g, 2, 17, 21, 31, plasterTex(plaster, mix(plaster, '#7a6a50', 0.12)));
  poly(g, [[2, 17.5], [12, 6.5], [22, 17.5]], plasterTex(plaster, mix(plaster, '#7a6a50', 0.12)));
  // stone foundation
  for (let x = 2; x <= 21; x++) for (let y = 29; y <= 31; y++) set(g, x, y, (x + (y % 2) * 2) % 4 === 0 ? stoneD : r() < 0.2 ? stoneL : stone);
  for (let x = 22; x <= 34; x++) { const top = Math.round(29 - ((x - 22) * 4) / 12.5); for (let y = top; y <= top + 3 && y <= 32; y++) set(g, x, y, (x + y) % 4 === 0 ? '#3f3a33' : stoneD); }
  // timber frame on the front
  for (const bx of [2, 7, 16, 21]) rect(g, bx, 17, bx, 28, beam);
  for (const by of [17, 23]) rect(g, 2, by, 21, by, beam);
  line(g, 3, 22, 6, 18, beam); line(g, 17, 18, 20, 22, beam);
  rect(g, 11, 8, 12, 17, beam); rect(g, 6, 12, 17, 12, beam);
  // timber on the side wall
  for (const bx of [27, 33]) { const top = Math.round(17 - ((bx - 22) * 4) / 12.5); rect(g, bx, top, bx, top + 11, mix(beam, '#000000', 0.2)); }
  // windows with lead lattice + side window
  const win = (x0, y0) => { rect(g, x0 - 1, y0 - 1, x0 + 4, y0 + 4, beam); rect(g, x0, y0, x0 + 3, y0 + 3, (x, y) => ((x + y) % 2 ? '#9cc9e8' : '#6fa3cf')); set(g, x0, y0, '#e8f6ff'); rect(g, x0 - 1, y0 + 4, x0 + 4, y0 + 4, beamL); };
  win(3, 24); win(17, 24); win(10, 13);
  for (let x = 28; x <= 31; x++) { const top = Math.round(20 - ((x - 22) * 4) / 12.5); rect(g, x, top, x, top + 3, (x + top) % 2 ? '#5f88ad' : '#4c7296'); }
  // arched plank door
  rect(g, 9, 21, 14, 28, door); rect(g, 10, 20, 13, 20, door);
  for (const px of [10, 12]) rect(g, px, 21, px, 28, mix(door, '#000000', 0.25));
  rect(g, 9, 21, 9, 28, beam); rect(g, 14, 21, 14, 28, beam); rect(g, 10, 19, 13, 19, beam); set(g, 9, 20, beam); set(g, 14, 20, beam);
  set(g, 13, 25, '#ffd23f'); rect(g, 10, 29, 13, 31, stoneL);
  // roof: side slope with shingle rows, ridge highlight, front edge showing the roof's thickness
  poly(g, [[12, 5], [23, 1], [35.5, 13], [23.5, 17.8]], (x, y) => {
    const k = y + ((x - 12) * 4) / 11;
    if (Math.floor(k) % 3 === 0) return roofD;
    if ((x + Math.floor(k / 3) * 2) % 5 === 0) return mix(roof, roofD, 0.5);
    return r() < 0.12 ? roofL : roof;
  });
  line(g, 12, 5, 23, 1, roofL); line(g, 13, 5, 24, 1, roofL);
  line(g, 1, 18, 12, 5, roof); line(g, 2, 18, 12, 6, roofD); line(g, 12, 5, 23, 17, roof); line(g, 12, 6, 22, 17, roofD);
  // chimney
  rect(g, 27, 0, 30, 7, (x, y) => (x === 30 ? stoneD : (x + y * 3) % 5 === 0 ? stoneD : stone)); rect(g, 26, 0, 31, 0, '#4f4a42');
  outline(g);
  // grass and shadow under the house
  for (let y = 31; y < 34; y++) for (let x = 0; x < 36; x++) if (!g[y][x] || (y === 33 && g[y][x] === K)) g[y][x] = x > 20 && y < 33 ? '#3d6e33' : (x + y) % 3 ? '#5a9e47' : '#4f8f3f';
  return g;
}

// ---------- The teacher's castle (84 x 66) ----------
export function castleGrid(ext = 2, seed = 3) {
  const roof = (EXTERIORS[ext] || EXTERIORS[2]), r = rng(seed), g = makeGrid(84, 66);
  const brick = shade => (x, y) => {
    const row = Math.floor(y / 3), off = (row % 2) * 3;
    if (y % 3 === 2 || (x + off) % 6 === 0) return mix('#6f6a60', '#000000', shade);
    return mix(r() < 0.15 ? '#a39d90' : '#8f897d', '#000000', shade);
  };
  const crenel = (x0, x1, y) => { for (let x = x0; x <= x1; x++) if ((x - x0) % 4 < 2) rect(g, x, y - 3, x, y - 1, brick(0)); };
  // keep (back, tall) with a darker side face for depth
  rect(g, 28, 14, 55, 44, brick(0)); rect(g, 56, 12, 59, 42, brick(0.3)); crenel(28, 55, 14);
  for (const wx of [35, 41, 47]) rect(g, wx, 20, wx, 24, '#1b1430');
  rect(g, 40, 30, 43, 35, '#2b2236'); rect(g, 41, 29, 42, 29, '#2b2236');
  // flag on the keep
  rect(g, 42, 0, 42, 10, '#5a3a24'); rect(g, 43, 1, 49, 5, (x, y) => (y === 3 ? '#ffd23f' : '#c0283f')); set(g, 49, 3, '#c0283f');
  // curtain wall (front) with battlements
  rect(g, 14, 36, 69, 61, brick(0)); crenel(14, 69, 36); rect(g, 14, 60, 69, 61, brick(0.25));
  // gate: arch, portcullis, wooden doors
  poly(g, [[34, 61.5], [34, 47], [37, 44], [46, 44], [49, 47], [49, 61.5]], '#241c2c');
  for (let x = 35; x <= 48; x += 3) rect(g, x, 46, x, 61, '#5f594f');
  for (let y = 48; y <= 60; y += 3) rect(g, 35, y, 48, y, '#5f594f');
  line(g, 34, 47, 37, 44, '#4f4a42'); line(g, 46, 44, 49, 47, '#4f4a42');
  // round towers with cone roofs (shaded left to right, so they look round)
  for (const tx of [4, 66]) {
    rect(g, tx, 22, tx + 13, 61, (x, y) => brick([0.1, 0, 0, 0.05, 0.12, 0.2, 0.28][Math.min(6, Math.floor(((x - tx) / 14) * 7))])(x, y));
    for (const sy of [32, 44]) rect(g, tx + 6, sy, tx + 6, sy + 4, '#1b1430');
    for (let x = tx - 1; x <= tx + 14; x++) if ((x - tx) % 3 === 0) rect(g, x, 19, x + 1, 21, brick(0.1));
    poly(g, [[tx - 2, 20], [tx + 7, 2], [tx + 16, 20]], (x, y) => {
      const t = (x - tx) / 14;
      const base = t < 0.35 ? roof[2] : t < 0.7 ? roof[0] : roof[1];
      return (y % 3 === 0 && (x + y) % 2) ? mix(base, '#000000', 0.18) : base;
    });
    rect(g, tx + 7, 0, tx + 7, 2, '#5a3a24'); rect(g, tx + 8, 0, tx + 11, 2, '#ffd23f');
  }
  outline(g);
  // a little hill under the castle
  for (let y = 62; y < 66; y++) for (let x = 0; x < 84; x++) if (!g[y][x]) g[y][x] = (x + y) % 3 ? '#5a9e47' : '#4f8f3f';
  return g;
}

// ---------- Scenery ----------
export function oakGrid(r) {
  const g = makeGrid(16, 19), leaf = ['#2f6b2a', '#3f8a35', '#58a845', '#7cc45a'];
  rect(g, 7, 12, 8, 18, (x) => (x === 8 ? '#4a2f1d' : '#6b4527'));
  ellipse(g, 8, 7, 7.5, 6.8, (x, y, dx, dy) => {
    const l = -dx - dy + (r() - 0.5) * 0.9;
    return leaf[l > 0.9 ? 3 : l > 0.1 ? 2 : l > -0.8 ? 1 : 0];
  });
  outline(g);
  return g;
}
export function pineGrid(r) {
  const g = makeGrid(12, 21), c = ['#1f4f2e', '#2e6b3c', '#3f8a4c'];
  rect(g, 5, 17, 6, 20, '#4a2f1d');
  for (const [top, w] of [[1, 3], [5, 4.5], [9, 5.5]]) poly(g, [[6, top], [6 - w, top + 8], [6 + w, top + 8]], (x, y) => c[x < 5 ? 2 : x < 7 ? 1 : 0]);
  outline(g);
  return g;
}
export function bushGrid(r) {
  const g = makeGrid(10, 7);
  ellipse(g, 5, 4, 4.6, 3.2, (x, y, dx, dy) => (-dx - dy > 0.4 ? '#6cb257' : r() < 0.15 ? '#e85d75' : '#3f8a35'));
  outline(g); return g;
}
export function rockGrid() {
  const g = makeGrid(8, 6);
  ellipse(g, 4, 3.5, 3.6, 2.4, (x, y, dx, dy) => (-dx - dy > 0.3 ? '#b3ad9f' : dx + dy > 0.6 ? '#6f6a60' : '#8f897d'));
  outline(g); return g;
}
export function haystackGrid() {
  const g = makeGrid(12, 9);
  ellipse(g, 6, 6, 5.6, 5.5, (x, y, dx) => (y % 2 && (x + y) % 3 === 0 ? '#b88a2a' : dx < -0.2 ? '#f0cf6a' : '#d9b24a'));
  for (let y = 7; y < 9; y++) for (let x = 0; x < 12; x++) if (g[y][x] && y === 8) g[y][x] = null;
  outline(g); return g;
}
export function wellGrid() {
  const g = makeGrid(16, 19);
  ellipse(g, 8, 14, 6.5, 3.6, (x, y, dx) => ((x + Math.floor(y / 2) * 2) % 4 === 0 ? '#5f594f' : dx > 0.3 ? '#77716a' : '#9a9488'));
  ellipse(g, 8, 12.4, 4.2, 1.3, '#1f4f7a'); set(g, 6, 12, '#5f9fd0');
  rect(g, 2, 4, 2, 13, '#5a3a24'); rect(g, 13, 4, 13, 13, '#5a3a24'); rect(g, 3, 7, 12, 7, '#6b4527');
  poly(g, [[0, 5], [8, 0], [16, 5]], (x) => (x < 8 ? '#b5523b' : '#86382a'));
  rect(g, 7, 8, 9, 10, '#8f5a2e');
  outline(g); return g;
}
export function signGrid() {
  const g = makeGrid(9, 10);
  rect(g, 4, 3, 4, 9, '#5a3a24'); rect(g, 0, 1, 8, 4, '#a0703f'); rect(g, 1, 2, 7, 2, '#6b4527');
  outline(g); return g;
}
export function barrelGrid() {
  const g = makeGrid(6, 7);
  rect(g, 0, 0, 5, 6, (x, y) => (y === 1 || y === 5 ? '#5f594f' : x === 0 ? '#a0703f' : x === 5 ? '#6b4527' : '#8f5a2e'));
  outline(g); return g;
}

export { set as px, rect as fillRect, poly as fillPoly, line as drawLine, ellipse as fillEllipse, mix };
