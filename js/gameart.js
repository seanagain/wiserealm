// Little pixel pictures for each game (game picker on the projector and the vote on iPads).
import { makeGrid, gridRects, avatarSVG } from './avatar.js';
import { bossSVG } from './boss.js';
import { fillRect, fillEllipse, fillPoly, px } from './village-art.js';

const K = '#1b1430';
const svg = g => `<svg viewBox="0 0 ${g[0].length} ${g.length}" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg">${gridRects(g)}</svg>`;
const W = 48, H = 30;

function corners() {
  const g = makeGrid(W, H);
  const zones = [[0, 0, '#7b5ea7'], [25, 0, '#2a9d8f'], [0, 16, '#e07a2f'], [25, 16, '#c0283f']];
  for (const [x, y, c] of zones) fillRect(g, x, y, x + 22, y + 13, c);
  for (const [x, y] of [[25, 0], [0, 16]]) fillRect(g, x, y, x + 22, y + 13, (xx, yy) => ((xx + yy) % 6 < 3 ? '#ff7b00' : '#ffd23f')); // lava
  fillRect(g, 0, 14, 47, 15, '#2b2546'); fillRect(g, 23, 0, 24, 29, '#2b2546');
  fillRect(g, 22, 12, 25, 17, '#f4f1de');
  return g;
}
function treasure() {
  const g = makeGrid(W, H);
  fillRect(g, 0, 0, W - 1, H - 1, (x, y) => ((x * 3 + y * 5) % 11 === 0 ? '#7fc0ee' : '#3778b8'));
  fillEllipse(g, 24, 18, 20, 10, (x, y, dx, dy) => (dx * dx + dy * dy > 0.8 ? '#e9d08a' : '#d8b96a'));
  fillRect(g, 13, 7, 14, 17, '#6b4527'); fillEllipse(g, 13, 7, 6, 2.5, '#3f8a35'); fillEllipse(g, 16, 6, 4, 2, '#58a845');
  fillRect(g, 22, 15, 33, 22, '#8b5a2b'); fillRect(g, 22, 15, 33, 16, '#6b4226'); fillRect(g, 22, 18, 33, 18, '#ffd23f'); fillRect(g, 27, 17, 28, 19, '#ffd23f');
  for (const [x, y] of [[36, 20], [38, 19], [37, 22], [19, 22]]) fillRect(g, x, y, x + 1, y + 1, '#ffd23f');
  fillRect(g, 9, 21, 11, 21, '#e63946'); fillRect(g, 10, 20, 10, 22, '#e63946'); // X marks the spot
  return g;
}
function maze() {
  const g = makeGrid(W, H);
  fillRect(g, 0, 0, W - 1, H - 1, '#1c1829');
  const walls = [[0, 0, 47, 1], [0, 28, 47, 29], [0, 0, 1, 29], [46, 0, 47, 29], [8, 0, 9, 20], [16, 8, 17, 29], [24, 0, 25, 14], [24, 20, 33, 21],
    [32, 6, 33, 21], [40, 0, 41, 12], [40, 18, 41, 29], [8, 20, 13, 21], [32, 6, 38, 7]];
  for (const [a, b, c, d] of walls) fillRect(g, a, b, c, d, (x, y) => ((x + y) % 4 === 0 ? '#4a4560' : '#6b6585'));
  fillRect(g, 42, 22, 44, 25, '#ffd23f'); // the exit
  fillRect(g, 3, 23, 6, 26, '#3ddc84'); // hero
  fillRect(g, 19, 3, 22, 6, '#e63946'); // Mr. C
  return g;
}
function territory() {
  const g = makeGrid(W, H);
  fillRect(g, 0, 0, W - 1, H - 1, (x, y) => ((x >> 2) + (y >> 2)) % 2 ? '#71b552' : '#7bbf5a');
  fillRect(g, 0, 0, 17, H - 1, (x, y) => ((x + y) % 7 === 0 ? '#c0283f' : '#e0465f'));
  fillRect(g, 30, 0, W - 1, H - 1, (x, y) => ((x + y) % 7 === 0 ? '#2d6cd6' : '#3b82f6'));
  fillRect(g, 22, 0, 25, H - 1, (x, y) => (y % 5 === 0 ? '#5fd3e8' : '#173a6b'));
  fillRect(g, 21, 12, 26, 16, '#a0703f');
  fillRect(g, 4, 2, 4, 10, '#5a3a24'); fillRect(g, 5, 2, 9, 5, '#ffd23f');
  fillRect(g, 43, 2, 43, 10, '#5a3a24'); fillRect(g, 38, 2, 42, 5, '#f4f1de');
  for (const [x, y] of [[12, 20], [36, 18]]) fillPoly(g, [[x, y + 6], [x + 3, y], [x + 6, y + 6]], '#4a4560');
  return g;
}

export function gameArt(id) {
  if (id === 'raid') return bossSVG(0);
  if (id === 'maze') return `<div class="ga-maze">${svg(maze())}<div class="ga-mrc">${bossSVG(4)}</div></div>`;
  const f = { corners, treasure, territory }[id];
  return f ? svg(f()) : '';
}
export { avatarSVG, px };
