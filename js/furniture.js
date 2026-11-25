// Houses: furniture catalog (pixel art), learning milestones, and drawing rooms and houses.
// Prices and milestones are also in supabase/schema.sql (run `node tools/gen-shop-sql.mjs`
// after editing), which is what the database checks.
//
// A room is 12 x 9 tiles of 8 x 8 pixels: rows 0-2 are the back wall, rows 3-8 the floor.
// Floor furniture stands on its tile row (its picture can be taller than one tile);
// wall furniture hangs on the wall rows. A house is saved as
//   { wall, floor, ext, items: [[id, x, y, flip], ...] }
import { makeGrid, gridRects, avatarSVG } from './avatar.js';

export const ROOM_W = 12, ROOM_H = 9, WALL_ROWS = 3, TILE = 8, MAX_ITEMS = 40, MAX_COPIES = 4;

const K = '#1b1430';

// ---------- Learning milestones (unlock special furniture) ----------
export const MILESTONES = [
  { id: 'm_class', ic: '🏫', name: 'Join a class', need: 1, stat: 'classes' },
  { id: 'm_game1', ic: '⚔️', name: 'Play your first game', need: 1, stat: 'games' },
  { id: 'm_game10', ic: '🧭', name: 'Play 10 games', need: 10, stat: 'games' },
  { id: 'm_game25', ic: '🛡️', name: 'Play 25 games', need: 25, stat: 'games' },
  { id: 'm_correct100', ic: '✅', name: 'Answer 100 questions right in games', need: 100, stat: 'correct' },
  { id: 'm_practice10', ic: '📚', name: 'Finish 10 practice sessions', need: 10, stat: 'practices' },
  { id: 'm_streak5', ic: '🔥', name: 'Practice 5 days in a row', need: 5, stat: 'streak' },
  { id: 'm_master20', ic: '⭐', name: 'Master 20 practice questions (★★★)', need: 20, stat: 'mastered' },
  { id: 'm_master75', ic: '🌟', name: 'Master 75 practice questions (★★★)', need: 75, stat: 'mastered' },
];

// ---------- Sprites ----------
const BOOKS = ['KKKKKKKKKKKKKKKK', 'KWWWWWWWWWWWWWWK', 'KWrbbgyKrrpbgyWK', 'KWrbbgyKrrpbgyWK', 'KWrbbgyKrrpbgyWK', 'KWWWWWWWWWWWWWWK',
  'KWgyprKbbgyrrKWK', 'KWgyprKbbgyrrKWK', 'KWgyprKbbgyrrKWK', 'KWWWWWWWWWWWWWWK', 'KWbbrKgypprbgyWK', 'KWbbrKgypprbgyWK',
  'KWbbrKgypprbgyWK', 'KWWWWWWWWWWWWWWK', 'KKKKKKKKKKKKKKKK'];
const TROPHY = ['KKKKKKKK', 'KCCCCCCK', 'KCcCCCCK', 'KCcCCCCK', '.KCCCCK.', '..KCCK..', '...KK...', '...KK...', '..KKKK..', '.KWWWWK.', '.KWyWWK.', '.KKKKKK.'];
const DESK = ['KKKKKKKKKKKKKKKK', 'KTTTTTTTTTTTTTTK', 'KKKKKKKKKKKKKKKK', 'KDDDDDK....KDDDK', 'KDDyDDK....KDDDK', 'KKKKKKK....KDDDK',
  'KDDDDDK....KDDDK', 'KDDyDDK....KDDDK', 'KKKKKKK....KKKKK'];
const WOOD = { T: '#b0733f', D: '#8f5a2e', y: '#ffd23f' };

const F = (id, name, price, w, rows, pal, extra = {}) => ({ id, slot: 'furn', name, price, w, rows, pal, kind: 'floor', ...extra });
const WALLF = (id, name, price, w, rows, pal) => ({ id, slot: 'furn', name, price, w, rows, pal, kind: 'wall', h: Math.ceil(rows.length / TILE) });

export const FURNITURE = [
  // ----- Free starter furniture -----
  F('f_bed', 'Cozy Bed', 0, 2, ['KKKK', 'KHHK', 'KHHKKKKKKKKKKKKK', 'KHHWWWKBBBBBBBBK', 'KHHWWWKBBBBBBBBK', 'KHHKKKKBbBBbBBBK',
    'KHHBBBBBBBBBBBBK', 'KHHbbbbbbbbbbbbK', 'KKKKKKKKKKKKKKKK', 'KFK..........KFK'], { H: '#a0703f', W: '#f4f1de', B: '#4cc9f0', b: '#2e8fb0', F: '#5a3a24' }),
  F('f_chair', 'Wooden Chair', 0, 1, ['.KKK....', '.KHK....', '.KHK....', '.KHK....', '.KHKKKKK', '.KHHHHHK', '.KKKKKKK', '.KhK.KhK', '.KhK.KhK', '.KKK.KKK'],
    { H: '#b0733f', h: '#7a4a26' }),
  F('f_table', 'Little Table', 0, 2, ['KKKKKKKKKKKKKKKK', 'KTTTTTTTTTTTTTTK', 'KttttttttttttttK', 'KKKKKKKKKKKKKKKK', '.KhK........KhK.',
    '.KhK........KhK.', '.KhK........KhK.', '.KKK........KKK.'], { T: '#b0733f', t: '#8f5a2e', h: '#7a4a26' }),
  F('f_rug', 'Round Rug', 0, 2, ['...KKKKKKKKKK...', '.KKRRRRRRRRRRKK.', 'KRRrRRrRRrRRrRRK', '.KKRRRRRRRRRRKK.', '...KKKKKKKKKK...'],
    { R: '#e76f51', r: '#f4a261' }, { flat: true }),
  // ----- Store -----
  F('f_plant', 'Potted Plant', 30, 1, ['...K.K..', '..KGKGK.', '.KGgKGGK', 'KGGKGgK.', '.KGGGGK.', '..KGGK..', '.KKKKKK.', '.KPPPPK.', '.KPpPPK.', '..KPPK..', '..KKKK..'],
    { G: '#3ddc84', g: '#2a9d5c', P: '#c96a45', p: '#e08a5a' }),
  F('f_lamp', 'Floor Lamp', 40, 1, ['..KKKK..', '.KYYYYK.', 'KYYYYYYK', 'KyyyyyyK', 'KKKKKKKK', '...KK...', '...KK...', '...KK...', '...KK...',
    '...KK...', '...KK...', '..KKKK..', '.KMMMMK.', '.KKKKKK.'], { Y: '#ffe8a3', y: '#f2c94c', M: '#8b95a7' }),
  F('f_beanbag', 'Beanbag', 60, 1, ['..KKKK..', '.KBBBBK.', 'KBBbBBBK', 'KBBBBbBK', 'KBbBBBBK', '.KKKKKK.'], { B: '#ef476f', b: '#ff8fab' }),
  F('f_rug_star', 'Starry Rug', 70, 2, ['KKKKKKKKKKKKKKKK', 'KBBBBBBBBBBBBBBK', 'KBYBBBYBBBYBBBYK', 'KBBBBBBBBBBBBBBK', 'KKKKKKKKKKKKKKKK'],
    { B: '#4361ee', Y: '#ffd23f' }, { flat: true }),
  F('f_desk', 'Desk', 80, 2, DESK, WOOD),
  F('f_guitar', 'Guitar', 90, 1, ['...KK...', '...KK...', '...KH...', '...KH...', '...KH...', '..KHHK..', '.KOOOOK.', 'KOOKKOOK', 'KOOKKOOK',
    '.KOOOOK.', 'KOOOOOOK', 'KOOOOOOK', '.KKKKKK.'], { O: '#e76f51', H: '#5a3a24' }),
  F('f_bookshelf', 'Bookshelf', 90, 2, BOOKS, { W: '#8f5a2e', r: '#e63946', b: '#4cc9f0', g: '#3ddc84', y: '#ffd23f', p: '#c77dff' }),
  F('f_fridge', 'Snack Fridge', 100, 1, ['KKKKKKKK', 'KWWWWWWK', 'KWWWWWMK', 'KWWWWWMK', 'KWWWWWWK', 'KKKKKKKK', 'KWWWWWWK', 'KWWWWWMK',
    'KWWWWWMK', 'KWWWWWMK', 'KWWWWWWK', 'KWWWWWWK', 'KWWWWWWK', 'KKKKKKKK', '.K....K.'], { W: '#e8f0ff', M: '#8b95a7' }),
  F('f_sofa', 'Comfy Sofa', 120, 2, ['.KKKKKKKKKKKKKK.', '.KSSSSSSSSSSSSK.', '.KSSSSSSSSSSSSK.', 'KKKKKKKKKKKKKKKK', 'KSKssssssssssKSK',
    'KSKssssssssssKSK', 'KSKKKKKKKKKKKKSK', 'KSSSSSSSSSSSSSSK', 'KKKKKKKKKKKKKKKK', '.KK..........KK.'], { S: '#7b5ea7', s: '#9d7fd1' }),
  F('f_tv', 'TV', 150, 2, ['.KKKKKKKKKKKKKK.', '.KMMMMMMMMMMMMK.', '.KMCCCCCCCCCCMK.', '.KMCcCCCCCCCCMK.', '.KMCCcCCCCCCCMK.', '.KMCCCCCCCCCCMK.',
    '.KMCCCCCCCCCCMK.', '.KMMMMMMMMMMMMK.', '.KKKKKKKKKKKKKK.', '......KMMK......', 'KKKKKKKKKKKKKKKK', 'KWWWWWWKWWWWWWWK', 'KWWWyWWKWWWyWWWK',
    'KWWWWWWKWWWWWWWK', 'KKKKKKKKKKKKKKKK'], { M: '#34344a', C: '#4cc9f0', c: '#b8f0ff', W: '#8f5a2e', y: '#ffd23f' }),
  F('f_fishtank', 'Fish Tank', 160, 2, ['KKKKKKKKKKKKKKKK', 'KAAAAAAAAAAAAAAK', 'KAAoAAAAAAAAAAAK', 'KAAAAAOOAAAoAAAK', 'KAAAAOOOOAAAAAAK', 'KAoAAAOOAAAAAAAK',
    'KAAAAAAAAAAOOAAK', 'KAGAAAAAAAOOOOAK', 'KGGAAGAAAAAOOAAK', 'KGGsGGsssGsssssK', 'KKKKKKKKKKKKKKKK', '.KWWWWWWWWWWWWK.', '.KWWWWWWWWWWWWK.', '.KKKKKKKKKKKKKK.'],
    { A: '#7fd3f5', o: '#e3f8ff', O: '#ff7b00', G: '#3ddc84', s: '#e0c27a', W: '#34344a' }),
  F('f_fireplace', 'Fireplace', 220, 2, ['KKKKKKKKKKKKKKKK', 'KWWWWWWWWWWWWWWK', 'KKKKKKKKKKKKKKKK', '.KBBBBBBBBBBBBK.', '.KBBKKKKKKKKBBK.', '.KBKkkkkkkkkKBK.',
    '.KBKkkkYkkkkKBK.', '.KBKkkYOYkkkKBK.', '.KBKkkORYkYkKBK.', '.KBKkYOROYOYKBK.', '.KBKkORRRORoKBK.', '.KBKKwKwKwKwKBK.', '.KBBBBBBBBBBBBK.', '.KKKKKKKKKKKKKK.'],
    { W: '#8f5a2e', B: '#a4433a', k: '#2a1f2e', Y: '#ffd23f', O: '#ff7b00', R: '#e63946', o: '#ff7b00', w: '#5a3a24' }),
  F('f_piano', 'Piano', 250, 2, ['KKKKKKKKKKKKKKKK', 'KPPPPPPPPPPPPPPK', 'KPPPPPPPPPPPPPPK', 'KPPPPPKKKKPPPPPK', 'KPPPPPKwwKPPPPPK', 'KKKKKKKKKKKKKKKK',
    'KWKWKWWKWKWKWWWK', 'KWKWKWWKWKWKWWWK', 'KWWWWWWWWWWWWWWK', 'KKKKKKKKKKKKKKKK', 'KPPK........KPPK', 'KPPK........KPPK', 'KPPK........KPPK', 'KKKK........KKKK'],
    { P: '#2b2b36', w: '#f4f1de', W: '#ffffff' }),
  F('f_arcade', 'Arcade Machine', 300, 1, ['KKKKKKKK', 'KRRRRRRK', 'KRYYYYRK', 'KKKKKKKK', 'KMCCCCMK', 'KMCcCCMK', 'KMCCCCMK', 'KMCCCCMK', 'KKKKKKKK',
    'KRRRRRRK', 'KRgRrRrK', 'KRRRRRRK', 'KKKKKKKK', 'KRRRRRRK', 'KRRRRRRK', 'KRRRRRRK', 'KKKKKKKK'],
    { R: '#4361ee', Y: '#ffd23f', M: '#34344a', C: '#3ddc84', c: '#b8ffd6', g: '#e63946', r: '#ffd23f' }),
  F('f_throne', 'Golden Throne', 400, 1, ['K.KK.K..', 'KYKYKYK.', 'KYYYYYK.', 'KYRRRYK.', 'KYRRRYK.', 'KYRRRYK.', 'KYYYYYKK', 'KYRRRRRK', 'KYYYYYYK',
    'KKKKKKKK', 'KYK..KYK', 'KKK..KKK'], { Y: '#ffd23f', R: '#c0283f' }),
  // ----- Wall decorations -----
  WALLF('f_clock', 'Wall Clock', 25, 1, ['..KKKK..', '.KWWWWK.', 'KWWKWWWK', 'KWWKWWWK', 'KWWKKKWK', 'KWWWWWWK', '.KWWWWK.', '..KKKK..'], { W: '#f4f1de' }),
  WALLF('f_poster', 'Space Poster', 35, 1, ['KKKKKKKK', 'KNNNNNNK', 'KNyNNNNK', 'KNNNOONK', 'KNNOOOOK', 'KNNNOONK', 'KNNNNyNK', 'KNyNNNNK', 'KNNNNNNK', 'KKKKKKKK'],
    { N: '#1b2a5b', y: '#ffffff', O: '#ff7b00' }),
  WALLF('f_shelf', 'Wall Shelf', 45, 2, ['..K.....K.......', '.KRK...KYK..KK..', '.KRK..KYYYK.KGK.', '.KRK..KYYYK.KGK.', 'KKKKKKKKKKKKKKKK', 'KWWWWWWWWWWWWWWK',
    'KKKKKKKKKKKKKKKK', '.KK..........KK.'], { R: '#e63946', Y: '#ffd23f', G: '#3ddc84', W: '#8f5a2e' }),
  WALLF('f_window', 'Window', 50, 2, ['KKKKKKKKKKKKKKKK', 'KWWWWWWWWWWWWWWK', 'KWSSSSSKSSSSSSWK', 'KWSsSSSKSSSSSSWK', 'KWSSsSSKSSSsSSWK', 'KWSSSSSKSSSSSSWK',
    'KWKKKKKKKKKKKKWK', 'KWSSSSSKSSSSSSWK', 'KWSSSSSKSSSSSSWK', 'KWSSSSSKSSSSSSWK', 'KWWWWWWWWWWWWWWK', 'KKKKKKKKKKKKKKKK'], { S: '#8fd8ff', s: '#ffffff', W: '#f4f1de' }),
  WALLF('f_painting', 'Mountain Painting', 60, 2, ['KKKKKKKKKKKKKKKK', 'KYYYYYYYYYYYYYYK', 'KYSSSSSSSSSSSSYK', 'KYSSSSSSSwSSSSYK', 'KYSSSSSSwwwSSSYK',
    'KYSSGSSwwwwwSSYK', 'KYSGGGwwwwwwwSYK', 'KYGGGGGGGGGGGGYK', 'KYYYYYYYYYYYYYYK', 'KKKKKKKKKKKKKKKK'], { Y: '#ffd23f', S: '#8fd8ff', w: '#8b95a7', G: '#3ddc84' }),
  // ----- Milestone furniture (earned by learning, can't be bought) -----
  F('m_mat', 'Welcome Mat', 0, 2, ['KKKKKKKKKKKKKKKK', 'KGGGGGGGGGGGGGGK', 'KGyGyGyGyGyGyGGK', 'KGGGGGGGGGGGGGGK', 'KKKKKKKKKKKKKKKK'],
    { G: '#2a9d5c', y: '#ffd23f' }, { flat: true, milestone: 'm_class' }),
  F('m_trophy1', 'Bronze Trophy', 0, 1, TROPHY, { C: '#cd7f32', c: '#f3c29b', W: '#5a3a24', y: '#ffd23f' }, { milestone: 'm_game1' }),
  F('m_trophy2', 'Silver Trophy', 0, 1, TROPHY, { C: '#c0c8d8', c: '#ffffff', W: '#5a3a24', y: '#ffd23f' }, { milestone: 'm_game10' }),
  F('m_trophy3', 'Gold Trophy', 0, 1, TROPHY, { C: '#ffd23f', c: '#fff6c2', W: '#5a3a24', y: '#e63946' }, { milestone: 'm_game25' }),
  F('m_telescope', 'Telescope', 0, 1, ['......KK', '.....KMK', '....KMMK', '...KMMK.', '..KMMK..', '.KMMK...', 'KMMK....', 'KKK.....', '...KK...',
    '..K..K..', '.K....K.', 'K......K'], { M: '#4361ee' }, { milestone: 'm_correct100' }),
  F('m_studydesk', 'Study Desk', 0, 2, ['.......KKK......', '......KYYYK.....', '.......KK.......', '..KKK..KK..KK...', '.KRBGK.KK.KWWK..', ...DESK],
    { ...WOOD, Y: '#ffe8a3', R: '#e63946', B: '#4cc9f0', G: '#3ddc84', W: '#f4f1de' }, { milestone: 'm_practice10' }),
  F('m_torch', 'Streak Torch', 0, 1, ['...Y....', '..YOY...', '..YORY..', '.YORRY..', '.YORROY.', '..YOOY..', '.KKKKKK.', '.KWWWWK.', '..KWWK..',
    '..KWWK..', '..KWWK..', '..KWWK..', '..KWWK..', '.KKKKKK.', 'KWWWWWWK', 'KKKKKKKK'], { Y: '#ffd23f', O: '#ff7b00', R: '#e63946', W: '#8b95a7' }, { milestone: 'm_streak5' }),
  F('m_wisdom', 'Bookshelf of Wisdom', 0, 2, BOOKS, { W: '#ffd23f', r: '#8e44ad', b: '#4361ee', g: '#2ec4b6', y: '#ffffff', p: '#ff8fab' }, { milestone: 'm_master20' }),
  F('m_globe', 'Giant Globe', 0, 1, ['..KKKK..', '.KBGBBK.', 'KBGGBBBK', 'KBBGGBGK', 'KBBBGGBK', '.KBBBBK.', '..KKKK..', '...KK...', '...KK...', '..KKKK..',
    '.KWWWWK.', '.KKKKKK.'], { B: '#4cc9f0', G: '#3ddc84', W: '#ffd23f' }, { milestone: 'm_master75' }),
];

// Wallpapers and floors: one 8 x 8 tile, repeated.
const PAT = (id, slot, name, price, rows, pal) => ({ id, slot, name, price, rows, pal });
export const WALLS = [
  PAT('w_plain', 'wall', 'Cream Wall', 0, ['AAAAAAAA', 'AAAAAAAA', 'AAAaAAAA', 'AAAAAAAA', 'AAAAAAAA', 'AAAAAAAa', 'AAAAAAAA', 'AAAAAAAA'], { A: '#e9dcc0', a: '#ddcfae' }),
  PAT('w_blue', 'wall', 'Sky Blue Wall', 30, ['AAAAAAAA', 'AAAAAAAA', 'aaaaaaaa', 'AAAAAAAA', 'AAAAAAAA', 'AAAAAAAA', 'aaaaaaaa', 'AAAAAAAA'], { A: '#9cc3ea', a: '#8ab4de' }),
  PAT('w_stripes', 'wall', 'Candy Stripes', 50, ['AAaaAAaa', 'AAaaAAaa', 'AAaaAAaa', 'AAaaAAaa', 'AAaaAAaa', 'AAaaAAaa', 'AAaaAAaa', 'AAaaAAaa'], { A: '#ffd6e0', a: '#ffffff' }),
  PAT('w_brick', 'wall', 'Brick Wall', 60, ['BBBBBBBk', 'BBBBBBBk', 'kkkkkkkk', 'BBBkBBBB', 'BBBkBBBB', 'kkkkkkkk', 'BBBBBBBk', 'BBBBBBBk'], { B: '#b5523b', k: '#8a3b2a' }),
  PAT('w_stars', 'wall', 'Night Sky', 80, ['NNNNNNNN', 'NNNyNNNN', 'NNNNNNNN', 'NNNNNNNN', 'NyNNNNNN', 'NNNNNNYN', 'NNNNNNNN', 'NNNNNNNN'], { N: '#1b2a5b', y: '#ffffff', Y: '#ffd23f' }),
];
export const FLOORS = [
  PAT('fl_wood', 'floor', 'Wood Floor', 0, ['WWWWWWWW', 'WWWWWWWW', 'wwwwwwww', 'WWWWwWWW', 'WWWWwWWW', 'wwwwwwww', 'WwWWWWWW', 'WwWWWWWW'], { W: '#c98a52', w: '#a86e3c' }),
  PAT('fl_tile', 'floor', 'White Tiles', 30, ['TTTTTTTg', 'TTTTTTTg', 'TTTTTTTg', 'TTTTTTTg', 'TTTTTTTg', 'TTTTTTTg', 'TTTTTTTg', 'gggggggg'], { T: '#eef2f7', g: '#c3ccd8' }),
  PAT('fl_carpet', 'floor', 'Blue Carpet', 50, ['CCCCCCCC', 'CCCcCCCC', 'CCCCCCCC', 'CCCCCCcC', 'CCCCCCCC', 'CcCCCCCC', 'CCCCCCCC', 'CCCCcCCC'], { C: '#3f6fb5', c: '#5683c8' }),
  PAT('fl_check', 'floor', 'Checkerboard', 60, ['BBBBWWWW', 'BBBBWWWW', 'BBBBWWWW', 'BBBBWWWW', 'WWWWBBBB', 'WWWWBBBB', 'WWWWBBBB', 'WWWWBBBB'], { B: '#2b2b36', W: '#f4f1de' }),
  PAT('fl_grass', 'floor', 'Indoor Grass', 80, ['GGGGGGGG', 'GgGGGGGG', 'GGGGGgGG', 'GGGGGGGG', 'GGgGGGGG', 'GGGGGGGg', 'GGGGgGGG', 'GGGGGGGG'], { G: '#4fa346', g: '#6cc26f' }),
];

export const HOUSE_ITEMS = [...FURNITURE, ...WALLS, ...FLOORS];
export const HOUSE_BY_ID = Object.fromEntries(HOUSE_ITEMS.map(i => [i.id, i]));
export const isFreeFurn = it => it && it.price === 0 && !it.milestone;

// Outside colors of a house: [roof, roof edge, walls, door]
export const EXTERIORS = [
  ['#e63946', '#a4283a', '#f4f1de', '#8f5a2e'], ['#4361ee', '#2c3fae', '#fff6c2', '#c0283f'], ['#2a9d5c', '#1d6e40', '#f4e3c3', '#5a3a24'],
  ['#8e44ad', '#5b2c6f', '#e8f0ff', '#ffd23f'], ['#ff7b00', '#c45c00', '#fdf0d5', '#2b2b36'], ['#34344a', '#1b1b28', '#c9e4f7', '#e76f51'],
];

export const DEFAULT_HOUSE = { wall: 'w_plain', floor: 'fl_wood', ext: 0, items: [['f_bed', 1, 4, 0], ['f_rug', 5, 6, 0], ['f_table', 6, 5, 0], ['f_chair', 5, 5, 0]] };

// What a student may use: free items, items they bought, and milestone items they've unlocked.
export function canUse(it, owned = [], unlocked = [], teacher = false) {
  if (!it) return false;
  if (teacher) return true; // teachers can decorate with anything, to show students what's possible
  if (it.milestone) return unlocked.includes(it.milestone);
  return it.price === 0 || owned.includes(it.id);
}

// Fit a placement inside the room for this item (wall items on the wall, floor items on the floor).
export function clampPos(it, x, y) {
  const w = it.w || 1;
  x = Math.max(0, Math.min(ROOM_W - w, x | 0));
  if (it.kind === 'wall') y = Math.max(0, Math.min(WALL_ROWS - (it.h || 1), y | 0));
  else y = Math.max(WALL_ROWS, Math.min(ROOM_H - 1, y | 0));
  return [x, y];
}

// Keep only valid data (same rules as save_house in the database).
export function normalizeHouse(h, allowed = () => true) {
  h = h && typeof h === 'object' ? h : {};
  const wall = HOUSE_BY_ID[h.wall] && HOUSE_BY_ID[h.wall].slot === 'wall' && allowed(HOUSE_BY_ID[h.wall]) ? h.wall : 'w_plain';
  const floor = HOUSE_BY_ID[h.floor] && HOUSE_BY_ID[h.floor].slot === 'floor' && allowed(HOUSE_BY_ID[h.floor]) ? h.floor : 'fl_wood';
  const ext = Number.isInteger(h.ext) && h.ext >= 0 && h.ext < EXTERIORS.length ? h.ext : 0;
  const counts = {}, items = [];
  for (const e of Array.isArray(h.items) ? h.items : []) {
    if (!Array.isArray(e) || items.length >= MAX_ITEMS) continue;
    const it = HOUSE_BY_ID[e[0]];
    if (!it || it.slot !== 'furn' || !allowed(it)) continue;
    if ((counts[it.id] = (counts[it.id] || 0) + 1) > MAX_COPIES) continue;
    const [x, y] = clampPos(it, e[1], e[2]);
    items.push([it.id, x, y, e[3] ? 1 : 0]);
  }
  return { wall, floor, ext, items };
}

// ---------- Drawing ----------
function blit(g, rows, pal, x0, y0, flip) {
  const w = Math.max(...rows.map(r => r.length));
  rows.forEach((row, dy) => {
    const r = row.padEnd(w, '.');
    for (let dx = 0; dx < w; dx++) {
      const ch = flip ? r[w - 1 - dx] : r[dx];
      const col = ch === 'K' ? (pal.K || K) : pal[ch];
      const x = x0 + dx, y = y0 + dy;
      if (col && g[y] && x >= 0 && x < g[y].length) g[y][x] = col;
    }
  });
}
const spriteW = it => Math.max(...it.rows.map(r => r.length));
// Where a placed item's picture is, in room pixels (used for drawing and for tapping on it).
export function itemRect(it, x, y) {
  const w = spriteW(it), h = it.rows.length;
  const px = x * TILE + Math.floor((it.w * TILE - w) / 2);
  const py = it.kind === 'wall' ? y * TILE + 1 : (y + 1) * TILE - h;
  return { px, py, w, h };
}
// Drawing order: wall decorations, then rugs, then furniture from back to front.
export function drawOrder(items) {
  const layer = it => (it.kind === 'wall' ? 0 : it.flat ? 1 : 2);
  return items.map((e, i) => ({ i, it: HOUSE_BY_ID[e[0]], x: e[1], y: e[2], f: e[3] })).filter(o => o.it)
    .sort((a, b) => layer(a.it) - layer(b.it) || a.y - b.y || a.i - b.i);
}

// Draws a room. Returns SVG. `pad` adds empty pixels above so tall furniture on the back row fits.
export function roomSVG(house, cls = '') {
  const h = normalizeHouse(house);
  const W = ROOM_W * TILE, H = ROOM_H * TILE;
  const g = makeGrid(W, H);
  const wall = HOUSE_BY_ID[h.wall], floor = HOUSE_BY_ID[h.floor];
  for (let ty = 0; ty < ROOM_H; ty++) for (let tx = 0; tx < ROOM_W; tx++) {
    const p = ty < WALL_ROWS ? wall : floor;
    blit(g, p.rows, p.pal, tx * TILE, ty * TILE, false);
  }
  for (let x = 0; x < W; x++) { g[WALL_ROWS * TILE - 2][x] = '#5a3a24'; g[WALL_ROWS * TILE - 1][x] = K; } // baseboard
  for (const { it, x, y, f } of drawOrder(h.items)) {
    const { px, py } = itemRect(it, x, y);
    blit(g, it.rows, it.pal, px, py, f);
  }
  return `<svg class="room-svg ${cls}" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg">${gridRects(g)}</svg>`;
}

// One piece of furniture on its own (for the catalog).
export function itemSVG(it) {
  if (it.slot !== 'furn') {
    const g = makeGrid(16, 16);
    for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++) blit(g, it.rows, it.pal, tx * 8, ty * 8, false);
    return `<svg viewBox="0 0 16 16" shape-rendering="crispEdges">${gridRects(g)}</svg>`;
  }
  const w = Math.max(...it.rows.map(r => r.length)), hgt = it.rows.length, s = Math.max(w, hgt);
  const g = makeGrid(s, s);
  blit(g, it.rows, it.pal, Math.floor((s - w) / 2), s - hgt, false);
  return `<svg viewBox="0 0 ${s} ${s}" shape-rendering="crispEdges">${gridRects(g)}</svg>`;
}

// The outside of a house (28 x 26 pixels). big = the teacher's house, with a flag and a bell.
export function houseSVG(ext = 0, big = false) {
  const [roof, edge, wallc, door] = EXTERIORS[ext] || EXTERIORS[0];
  const W = 28, H = 26, g = makeGrid(W, H + (big ? 8 : 0)), o = big ? 8 : 0;
  const rect = (x0, y0, x1, y1, c) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (g[y + o] && x >= 0 && x < W) g[y + o][x] = c; };
  // walls, door, windows
  rect(1, 9, 26, 24, K); rect(2, 10, 25, 24, wallc);
  rect(11, 15, 16, 24, K); rect(12, 16, 15, 24, door); g[20 + o][14] = '#ffd23f';
  for (const wx of [3, 19]) { rect(wx, 12, wx + 5, 17, K); rect(wx + 1, 13, wx + 4, 16, '#8fd8ff'); rect(wx + 3, 13, wx + 3, 16, K); rect(wx + 1, 15, wx + 4, 15, K); g[13 + o][wx + 1] = '#ffffff'; }
  rect(0, 25, 27, 25, '#5a8f3c');
  // roof
  for (let r = 0; r <= 8; r++) {
    const half = Math.min(14, 1 + Math.floor(r * 1.6)), x0 = 14 - half, x1 = 13 + half;
    rect(x0, r, x1, r, r === 0 ? K : roof);
    rect(x0, r, x0, r, K); rect(x1, r, x1, r, K);
    if (r % 3 === 2) rect(x0 + 2, r, x1 - 2, r, edge); // shingle lines
  }
  rect(0, 9, 27, 9, edge); rect(0, 10, 27, 10, K);
  if (big) { // bell tower + flag for the teacher's house
    rect(11, -6, 16, 1, K); rect(12, -5, 15, 1, wallc); rect(13, -3, 14, -1, '#ffd23f');
    rect(13, -8, 13, -6, K); rect(14, -8, 17, -7, '#e63946');
  }
  return `<svg class="house-svg" viewBox="0 0 ${W} ${H + o}" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg">${gridRects(g)}</svg>`;
}

export { avatarSVG };
