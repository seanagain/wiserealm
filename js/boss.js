// Pixel-art bosses for Boss Raid (original designs, 32 x 28 pixels).
// The sprite is drawn as a left half and mirrored to make it symmetrical.
import { makeGrid, paint, dots, gridRects, shade } from './avatar.js';

export const BOSSES = [
  { name: 'Grumblor the Slime King', body: '#5fd068', belly: '#b7f5a8', horn: '#f4d35e', crown: true },
  { name: 'Magmaw the Molten', body: '#ff7a45', belly: '#ffd08a', horn: '#5c2b1d' },
  { name: 'Frostfang the Glacier Wyrm', body: '#4cc9f0', belly: '#e3f8ff', horn: '#f8f9fa' },
  { name: 'Umbrax of the Void', body: '#8e44ad', belly: '#d7a6f5', horn: '#ff4d6d' },
  { name: 'Mr. C', custom: 'mrc' },
];

// ---------- Mr. C (the teacher!) ----------
const MRC_ROWS = [
  '.............K....K..K..........',
  '..........KKKHKKKKHKKHKK........',
  '........KKHHHHHHHHHHHHKK........',
  '.......KHHHHHHHHHllHHHHHK.......',
  '......KHHHHHHHllHHHHHHHHHK......',
  '......KHHHHHhhHHHHHHHHHHHK......',
  '......KHHHHHHHHHHHSSSSSSHK......',
  '......KHHHHHHHhSSSSSSSSSHK......',
  '......KHHHhSSSSSSSSSSSSSHK......',
  '......KHSSSSSSSSSSSSSSSSHK......',
  '......KSSSGGGGSSSSGGGGSSSK......',
  '......KGGGgEESGGGGgEESGGGK......',
  '......KSSGESSEGssGESSEGSSK......',
  '......KSSSGGGGSssSGGGGSSSK......',
  '......KSSrrSSSSssSSSSrrSSK......',
  '......KSSSMMMMMMMMMMMMSSSK......',
  '......KSSSMWWWWWWWWWWMSSSK......',
  '......KSSSSMMMMMMMMMMSSSSKKK.KK.',
  '.......KSSSSSSSSSSSSSSSSKKSSKSSK',
  '........KKSSSSSSSSSSSSKK.KSSKSSK',
  '..........KKSSSSSSSSKK...KSSKSSK',
  '.....KBwBbWWWSSSSSSWWWPPBKSSSSSK',
  '....KwBwBwbWWWSSSSWWWbPPBKSSSSSK',
  '...KBwBwBwBwbWWSSWWbBwPPBKSsSSSK',
  '...KBwBwBwBwBwBwkwBwBwPPBKSSSSSK',
  '...KBwBwBwBwBwBwwwBwBwPPBwKSSSK.',
  '...KBwBwBwBwBwBwkwBwBwPPBwBKKK..',
  '...KKKKKKKKKKKKKKKKKKKKKKKKKK...'
,
];

function mrcSVG() {
  const pal = {
    K: '#1a1226', H: '#7a4f2c', h: '#53351c', l: '#a8743f', S: '#f2c8a8', s: '#d9a585', r: '#f09a8a',
    G: '#2f2f36', g: '#dfe9f5', E: '#1a1226', W: '#ffffff', M: '#5a1a22',
    B: '#9cc3ea', w: '#eef5ff', b: '#7ea6cf', k: '#c9d6e6', P: '#2b2b36',
  };
  const g = makeGrid(32, 28);
  paint(g, { rows: MRC_ROWS }, pal);
  // ears
  dots(g, [[5, 10], [5, 11], [5, 12], [26, 10], [26, 11], [26, 12]], pal.S);
  dots(g, [[4, 10], [4, 11], [4, 12], [5, 9], [5, 13], [27, 10], [27, 11], [27, 12], [26, 9], [26, 13]], pal.K);
  const brows = makeGrid(32, 28);
  dots(brows, [[9, 8], [10, 8], [11, 9], [12, 9], [13, 9], [22, 8], [21, 8], [20, 9], [19, 9], [18, 9]], pal.h);
  const sweat = makeGrid(32, 28);
  dots(sweat, [[28, 6], [27, 7], [28, 7], [29, 7], [28, 8], [3, 9], [3, 10]], '#8fd8ff');
  return `<svg class="boss-svg" viewBox="0 0 32 28" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
${gridRects(g)}<g class="brows">${gridRects(brows)}</g><g class="sweat">${gridRects(sweat)}</g></svg>`;
}

const LEFT = [
  '................',
  '....KK..........',
  '....KHK.........',
  '....KHHK........',
  '.....KHHK.......',
  '.....KHHHK......',
  '......KHHKKKKKKK',
  '.....KHHBBBBBBBB',
  '.....KBBBBBBBBBB',
  '....KBBBBBBBBBBB',
  '....KBBBWWBBBBBB',
  '...KBBBWWWWBBBBB',
  '...KBBBWPPWBBBBB',
  '...KBBBWPPWBBBBB',
  '...KBBBBWWBBBBBB',
  '..KBBBBBBBBBBBBB',
  'KAKBBBMMMMMMMMMM',
  'KAKBBBMTMMTMMTMM',
  'KAKBBBBMMMMMMMMM',
  'KKKBBBBLLLLLLLLL',
  '.KBBBBLLLLLLLLLL',
  '.KBBBBLLLLLLLLLL',
  '.KBBBBBLLLLLLLLL',
  '.KbBBBBBLLLLLLLL',
  '..KbbBBBBBBBBBBB',
  '...KKKbbbbbbbbbb',
  '.....KKKKKKKKKKK',
  '..oooooooooooooo',
];
const ROWS = LEFT.map(r => r + [...r].reverse().join(''));
const mirror = list => list.flatMap(([x, y]) => [[x, y], [31 - x, y]]);

export function bossSVG(i) {
  const b = BOSSES[i] || BOSSES[0];
  if (b.custom === 'mrc') return mrcSVG();
  const pal = {
    K: '#140f22', B: b.body, b: shade(b.body, -0.25), A: shade(b.body, -0.15), H: b.horn,
    L: b.belly, W: '#ffffff', P: '#140f22', M: '#3a0d1a', T: '#ffffff', o: 'rgba(0,0,0,.3)',
  };
  const g = makeGrid(32, 28);
  paint(g, { rows: ROWS }, pal);
  dots(g, [[7, 8], [8, 8], [9, 8], [6, 9]], shade(b.body, 0.35)); // shine
  if (b.crown) {
    dots(g, [[12, 3], [15, 3], [16, 3], [19, 3], [12, 4], [13, 4], [15, 4], [16, 4], [18, 4], [19, 4]], '#ffd23f');
    dots(g, [12, 13, 14, 15, 16, 17, 18, 19].map(x => [x, 5]), '#ffd23f');
    dots(g, [12, 13, 14, 15, 16, 17, 18, 19].map(x => [x, 6]), '#c9961a');
    dots(g, [[13, 6], [18, 6]], '#e63946');
  }
  const brows = makeGrid(32, 28);
  dots(brows, mirror([[5, 8], [6, 8], [7, 9], [8, 9], [9, 9], [10, 10]]), '#140f22');
  const sweat = makeGrid(32, 28);
  dots(sweat, [[27, 7], [26, 8], [27, 8], [28, 8], [27, 9], [4, 11], [4, 12]], '#8fd8ff');
  return `<svg class="boss-svg" viewBox="0 0 32 28" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
${gridRects(g)}<g class="brows">${gridRects(brows)}</g><g class="sweat">${gridRects(sweat)}</g></svg>`;
}
