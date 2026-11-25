// Lays out the whole medieval village as one pixel-art picture: forest all around, the castle
// (teacher) on top, a river with a stone bridge, a cobblestone high street, a cottage for every
// student along the lanes, and a pond, well and "coming soon" plots at the bottom.
// The same class always gets the same village (the scenery is seeded by the class).
import {
  houseGrid, castleGrid, oakGrid, pineGrid, bushGrid, rockGrid, haystackGrid, wellGrid, signGrid, barrelGrid,
  rng, hashStr, mix,
} from './village-art.js';

export const MAP_W = 320;
const ROAD = [152, 167], ROW_H = 52, COLS = [106, 178, 64, 220, 22, 262]; // nearest the road first

export function buildVillage(count, seedText, exts = []) {
  const r = rng(hashStr(seedText || 'village'));
  const rows = Math.max(1, Math.ceil(count / COLS.length));
  const RIVER = 92, ROW0 = 110, NB = ROW0 + rows * ROW_H, H = NB + 82;
  const W = MAP_W;

  // ---------- ground ----------
  const ground = Array.from({ length: H }, () => new Array(W));
  const grass = ['#5a9e47', '#549744', '#62a84e', '#4f8f3f'];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) ground[y][x] = grass[(r() * 10 | 0) === 0 ? 3 : r() < 0.18 ? 1 : r() < 0.1 ? 2 : 0];
  const put = (x, y, c) => { x |= 0; y |= 0; if (y >= 0 && y < H && x >= 0 && x < W) ground[y][x] = c; };
  // lighter hill under the castle
  for (let y = 4; y < 86; y++) for (let x = 60; x < 260; x++) { const dx = (x - 160) / 100, dy = (y - 52) / 40; if (dx * dx + dy * dy < 1 && r() < 0.7) put(x, y, '#68ae52'); }
  // farm fields beside the castle
  for (const [fx, fy] of [[26, 30], [228, 46]]) for (let y = 0; y < 26; y++) for (let x = 0; x < 62; x++) put(fx + x, fy + y, y % 4 < 2 ? (x % 7 === 3 ? '#d9b24a' : '#8f6a3a') : (r() < 0.4 ? '#7fb24a' : '#a88552'));
  // cobblestone road: castle gate → bridge → down the high street
  const cobble = (x, y) => { const s = ((x >> 2) + (y >> 1)) % 2, t = r(); put(x, y, (x % 4 === 0 || y % 3 === 0) ? '#6f6656' : t < 0.25 ? '#b7ab92' : s ? '#9a8f7a' : '#a89c84'); };
  for (let y = 80; y < NB + 46; y++) for (let x = ROAD[0]; x <= ROAD[1]; x++) cobble(x, y);
  for (let y = 80; y < NB + 46; y++) { put(ROAD[0] - 1, y, '#5f594f'); put(ROAD[1] + 1, y, '#5f594f'); }
  // river with a gentle meander, sandy banks, ripples
  const riverY = x => RIVER + Math.round(Math.sin(x / 26) * 2.5);
  for (let x = 0; x < W; x++) {
    const c = riverY(x);
    for (let y = c - 7; y <= c + 7; y++) {
      const d = Math.abs(y - c);
      put(x, y, d >= 7 ? '#c9b27a' : d >= 6 ? '#2a5e93' : (r() < 0.05 ? '#9fd4f5' : d < 2 ? '#3f86c8' : '#3778b8'));
    }
    if (r() < 0.12) { const yy = c - 4 + (r() * 8 | 0); for (let k = 0; k < 3; k++) put(x + k, yy, '#8fc8ef'); }
    if (r() < 0.06) for (let k = 0; k < 3; k++) put(x, c - 8 - k, '#3f7a35'); // reeds
  }
  // stone bridge over the river
  for (let y = RIVER - 10; y <= RIVER + 10; y++) for (let x = ROAD[0] - 4; x <= ROAD[1] + 4; x++) {
    const edge = x < ROAD[0] - 1 || x > ROAD[1] + 1;
    put(x, y, edge ? ((y % 3 === 0) ? '#5f594f' : '#8f897d') : ((x + y) % 5 === 0 ? '#7a7264' : '#a39d90'));
  }
  for (const yy of [RIVER - 11, RIVER + 11]) for (let x = ROAD[0] - 4; x <= ROAD[1] + 4; x++) put(x, yy, '#4f4a42');
  // dirt lanes in front of each row of houses
  const dirt = (x, y) => put(x, y, r() < 0.15 ? '#9c7a4a' : r() < 0.1 ? '#c9a46a' : '#b08a5a');
  for (let i = 0; i < rows; i++) { const ly = ROW0 + i * ROW_H + 33; for (let y = ly; y < ly + 6; y++) for (let x = 16; x < W - 16; x++) if (x < ROAD[0] - 1 || x > ROAD[1] + 1) dirt(x, y); }
  // village green at the bottom: pond, plots
  const pond = { x: 62, y: NB + 28, rx: 38, ry: 15 };
  for (let y = pond.y - pond.ry - 2; y <= pond.y + pond.ry + 2; y++) for (let x = pond.x - pond.rx - 2; x <= pond.x + pond.rx + 2; x++) {
    const dx = (x - pond.x) / pond.rx, dy = (y - pond.y) / pond.ry, d = dx * dx + dy * dy;
    if (d < 0.8) put(x, y, r() < 0.04 ? '#9fd4f5' : d < 0.3 ? '#3f86c8' : '#3778b8');
    else if (d < 1) put(x, y, '#2a5e93');
    else if (d < 1.18) put(x, y, '#c9b27a');
  }
  for (const [lx, ly] of [[48, NB + 24], [70, NB + 31], [80, NB + 22]]) { for (let k = 0; k < 4; k++) put(lx + k, ly, '#3f8a35'); put(lx + 1, ly - 1, '#3f8a35'); put(lx + 2, ly - 1, '#e85d75'); }
  const lots = [];
  for (const lx of [178, 220, 262]) {
    const ly = NB + 10;
    for (let y = ly; y < ly + 30; y++) for (let x = lx; x < lx + 36; x++) dirt(x, y);
    for (let x = lx; x < lx + 36; x++) { if (x % 3 !== 1) { put(x, ly, '#6b4527'); put(x, ly + 29, '#6b4527'); } }
    for (let y = ly; y < ly + 30; y++) { if (y % 3 !== 1) { put(lx, y, '#6b4527'); put(lx + 35, y, '#6b4527'); } }
    lots.push({ x: lx, y: ly, w: 36, h: 30 });
  }
  // flowers
  const isGrass = new Set([...grass, '#68ae52']);
  for (let i = 0; i < W * H / 110; i++) { const x = r() * W | 0, y = r() * H | 0; if (isGrass.has(ground[y][x])) put(x, y, ['#ffffff', '#ffd23f', '#e85d75', '#c77dff'][r() * 4 | 0]); }

  // ---------- things standing on the ground (drawn back to front) ----------
  const sprites = [];
  // box = the part you can't walk through (default: the bottom of the thing, like a tree trunk)
  const add = (g, x, y, box) => sprites.push({ g, x: Math.round(x), y: Math.round(y), box });
  const castle = castleGrid(2, hashStr(seedText));
  const cx = Math.round((W - castle[0].length) / 2), cy = 14;
  add(castle, cx, cy, [cx, cy, cx + castle[0].length - 1, cy + castle.length - 5]);
  const houses = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / COLS.length), x = COLS[i % COLS.length], y = ROW0 + row * ROW_H;
    add(houseGrid(exts[i] || 0, i + 3), x, y, [x + 1, y + 6, x + 34, y + 30]);
    houses.push({ x, y, w: 36, h: 34, door: { x: x + 11.5, y: y + 33 } });
  }
  add(wellGrid(), 112, NB + 16);
  for (const l of lots) add(signGrid(), l.x + 14, l.y + 4);
  // little props between rows and by the road
  const free = (x, y, w, h) => !houses.some(b => x < b.x + b.w + 1 && x + w > b.x - 1 && y < b.y + b.h + 6 && y + h > b.y - 1) && (x + w < ROAD[0] - 2 || x > ROAD[1] + 2);
  const props = [() => bushGrid(r), () => rockGrid(), () => haystackGrid(), () => barrelGrid(), () => bushGrid(r)];
  for (let i = 0; i < rows; i++) {
    const base = ROW0 + i * ROW_H + 40;
    for (let k = 0; k < 6; k++) {
      const g = props[r() * props.length | 0](), x = 18 + r() * (W - 36 - g[0].length), y = base + r() * (ROW_H - 42 - g.length + 6);
      if (free(x, y, g[0].length, g.length)) add(g, x, y);
    }
    // empty plots in an unfilled row get a tree instead
    for (let c = 0; c < COLS.length; c++) if (i * COLS.length + c >= count) add(r() < 0.5 ? oakGrid(r) : pineGrid(r), COLS[c] + 10 + r() * 10, ROW0 + i * ROW_H + 10);
  }
  // castle grounds: trees and haystacks
  for (let k = 0; k < 14; k++) {
    const left = k % 2 === 0, x = left ? 20 + r() * 90 : 210 + r() * 90, y = 6 + r() * 64;
    if ((y > 26 && y < 58 && ((left && x > 20 && x < 92) || (!left && x > 222 && x < 292)))) continue; // keep the fields clear
    add(r() < 0.5 ? oakGrid(r) : pineGrid(r), x, y);
  }
  add(haystackGrid(), 96, 62); add(haystackGrid(), 212, 30);
  // the forest all around
  const tree = () => (r() < 0.55 ? pineGrid(r) : oakGrid(r));
  for (let y = -8; y < H; y += 7 + r() * 4) { add(tree(), -4 + r() * 10, y); add(tree(), W - 14 + r() * 8, y); if (r() < 0.6) add(tree(), 6 + r() * 8, y + 3); if (r() < 0.6) add(tree(), W - 24 + r() * 8, y + 3); }
  for (let x = 0; x < W; x += 8 + r() * 6) { if (x < cx - 8 || x > cx + castle[0].length + 4) add(tree(), x, -10 + r() * 8); add(tree(), x, H - 22 + r() * 6); if (r() < 0.5) add(tree(), x + 3, H - 30 + r() * 4); }
  sprites.sort((a, b) => a.y + a.g.length - (b.y + b.g.length));

  // ---------- where you can walk ----------
  const solid = new Uint8Array(W * H);
  const block = (x0, y0, x1, y1) => { for (let y = Math.max(0, y0 | 0); y <= Math.min(H - 1, y1 | 0); y++) for (let x = Math.max(0, x0 | 0); x <= Math.min(W - 1, x1 | 0); x++) solid[y * W + x] = 1; };
  const WATER = new Set(['#2a5e93', '#3f86c8', '#3778b8', '#9fd4f5', '#8fc8ef']);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (WATER.has(ground[y][x])) solid[y * W + x] = 1;
  for (const sp of sprites) {
    const w = sp.g[0].length, h = sp.g.length;
    if (sp.box) block(...sp.box);
    else block(sp.x + w * 0.3, sp.y + h - 4, sp.x + w * 0.7, sp.y + h - 1);
  }
  block(0, 0, 9, H - 1); block(W - 10, 0, W - 1, H - 1); block(0, 0, W - 1, 8); block(0, H - 12, W - 1, H - 1); // the forest edge
  const castleBox = { x: cx, y: cy, w: castle[0].length, h: castle.length, door: { x: cx + 41.5, y: cy + castle.length - 2 } };
  const start = { x: (ROAD[0] + ROAD[1]) / 2, y: RIVER + 18 };

  return { W, H, ground, sprites, houses, castle: castleBox, lots, pond, solid, start };
}

// Paint a built village onto a <canvas> (one pixel per pixel; CSS scales it up crisply).
export function paintVillage(canvas, v) {
  canvas.width = v.W; canvas.height = v.H;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(v.W, v.H), d = img.data;
  const cache = new Map();
  const rgb = c => { let o = cache.get(c); if (!o) { o = [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)); cache.set(c, o); } return o; };
  for (let y = 0; y < v.H; y++) for (let x = 0; x < v.W; x++) { const [R, G, B] = rgb(v.ground[y][x]); const i = (y * v.W + x) * 4; d[i] = R; d[i + 1] = G; d[i + 2] = B; d[i + 3] = 255; }
  ctx.putImageData(img, 0, 0);
  for (const s of v.sprites) s.g.forEach((row, dy) => {
    let run = null, start = 0;
    const flush = end => { if (run) { ctx.fillStyle = run; ctx.fillRect(s.x + start, s.y + dy, end - start, 1); } };
    for (let dx = 0; dx <= row.length; dx++) {
      const c = row[dx] || null;
      if (c !== run) { flush(dx); run = c; start = dx; }
    }
  });
}

export { mix };
