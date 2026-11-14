// Shop catalog. Each item is pixel art drawn as a layer on the hero (see avatar.js).
// Prices here are shown in the shop; the database (supabase/schema.sql) holds the
// official prices, so students can't change them. Keep the two lists in sync
// (run `node tools/gen-shop-sql.mjs` after editing this file).
//
// Coordinates are in "hero space" (the 20 x 24 hero). Pets use canvas space (abs: true).
// Letters map to colors through each item's own palette; '.' is transparent.

export const SLOTS = [
  { id: 'phat', label: 'Hats' },
  { id: 'top', label: 'Outfits' },
  { id: 'cape', label: 'Capes' },
  { id: 'acc', label: 'Face' },
  { id: 'pet', label: 'Pets' },
];

const cape = (id, name, price, X, x, trim) => ({
  id, slot: 'cape', name, price, y: 12,
  pal: { X, x, T: trim || x },
  rows: [
    '..KXXXXXXXXXXXXK',
    '.KXXXXXXXXXXXXXXK',
    'KXXXXXXXXXXXXXXXXK',
    'KXXXXXXXXXXXXXXXXK',
    'KXXXXXXXXXXXXXXXXK',
    'KXXXXXXXXXXXXXXXXK',
    'KXXXXXXXXXXXXXXXXK',
    'KXXXXXXXXXXXXXXXXK',
    'KXXXXXXXXXXXXXXXXK',
    'KxXXXXXXXXXXXXXXxK',
    'KxxXXxXXxXXxXXxxxK',
  ],
  // drawn over the body: cape draped on the shoulders with a clasp at the neck
  front: { y: 12, rows: ['....XX..TT..XX'] },
});

export const ITEMS = [
  // ---------- Hats (replace the free hair/hat) ----------
  { id: 'hat_top', slot: 'phat', name: 'Top Hat', price: 100, y: 0, pal: { D: '#22222b', R: '#e63946', n: '#3b2a20' }, rows: [
    '.....KKKKKKKK', '.....KDDDDDDK', '.....KDDDDDDK', '.....KRRRRRRK', '...KKKKKKKKKKKK', '...KnnK....KnnK'] },
  { id: 'hat_pirate', slot: 'phat', name: 'Pirate Hat', price: 120, y: 1, pal: { D: '#22222b', W: '#ffffff', Y: '#ffd23f' }, rows: [
    '.....KKKKKKKK', '....KDDDDDDDDK', '..KKDDDWWDDDDKK', '.KDDDDDDDDDDDDDDK', '..KYYYYYYYYYYYYK'] },
  { id: 'hat_viking', slot: 'phat', name: 'Viking Helmet', price: 150, y: 0, pal: { W: '#f4ecd8', M: '#c3ccd6', m: '#8b95a7', G: '#ffd23f' }, rows: [
    '..W..........W', '..WW........WW', '...WWKKKKKKKKWW', '....KMMMMMMMMK', '...KMMMMMMMMMMK', '...KmmGmmmmGmmK', '...Km........mK'] },
  { id: 'hat_chef', slot: 'phat', name: 'Chef Hat', price: 60, y: 0, pal: { W: '#ffffff', w: '#d9dde3' }, rows: [
    '......KKKKKK', '.....KWWWWWWK', '....KWWWWWWWWK', '....KWWWWWWWWK', '....KwwwwwwwwK'] },
  { id: 'hat_frog', slot: 'phat', name: 'Frog Hat', price: 90, y: 0, pal: { W: '#ffffff', E: '#1a1226', G: '#5fd068', g: '#3c9a47' }, rows: [
    '....KKK....KKK', '...KWEWK..KWEWK', '...KGGGKKKKGGGK', '...KGGGGGGGGGGK', '...KggggggggggK'] },
  { id: 'hat_halo', slot: 'phat', name: 'Halo', price: 200, y: 0, withHair: true, pal: { Y: '#ffe680' }, rows: [
    '......YYYYYY', '.....Y......Y', '......YYYYYY'] },
  { id: 'hat_flowers', slot: 'phat', name: 'Flower Crown', price: 80, y: 2, withHair: true, pal: { P: '#ff8fab', Y: '#ffd23f', g: '#3c9a47', W: '#ffffff' }, rows: [
    '.....P.W.P.Y', '....PgYgPgWgP'] },
  { id: 'hat_dragon', slot: 'phat', name: 'Dragon Helm', price: 300, y: 0, pal: { R: '#c0392b', r: '#7b241c', Y: '#ffd23f', W: '#ffffff' }, rows: [
    '...K..........K', '..KRK........KRK', '..KRRKKKKKKKKRRK', '...KRRRRRRRRRRK', '...KRRYRRRRYRRK', '...KrrrrrrrrrrK', '...Kr........rK'] },

  // ---------- Outfits (cover the shirt) ----------
  { id: 'top_armor', slot: 'top', name: 'Knight Armor', price: 160, y: 12, pal: { M: '#d8dee9', m: '#8b95a7', G: '#ffd23f' }, rows: [
    '....KMMMMMMMMK', '...KMMMMGMMMMMK', '..KSKMmmmmmmMKSK', '..KSKMMMGGMMMKSK', '..KKKmmmmmmmmKKK', '....KMMMMMMMMK', '....KmmMMMMmmK'] },
  { id: 'top_tux', slot: 'top', name: 'Tuxedo', price: 140, y: 12, pal: { D: '#22222b', W: '#ffffff', R: '#e63946' }, rows: [
    '....KDDWRRWDDK', '...KDDDWWWWDDDK', '..KSKDDDWWDDDKSK', '..KSKDDDWWDDDKSK', '..KKKDDDWWDDDKKK', '....KDDDWWDDDK', '....KDDDDDDDDK'] },
  { id: 'top_robe', slot: 'top', name: 'Wizard Robe', price: 120, y: 12, pal: { R: '#5b3fa8', r: '#3e2a78', G: '#ffd23f', Y: '#fff3b0' }, rows: [
    '....KRRRRRRRRK', '...KRRRGRRRRRRK', '..KSKRRRRRRRRKSK', '..KSKRRRRRYRRKSK', '..KKKGGGGGGGGKKK', '....KRRRRRRRRK', '...KRRRRYRRRRRK', '...KRRRRRRRRRRK', '...KrrrrrrrrrrK', '...KKKKKKKKKKKK'] },
  { id: 'top_jersey', slot: 'top', name: 'Team Jersey', price: 90, y: 12, pal: { J: '#e63946', j: '#a5222e', W: '#ffffff' }, rows: [
    '....KJJJJJJJJK', '...KJJJJJJJJJJK', '..KSKJJWWWWJJKSK', '..KSKJJJJJWJJKSK', '..KKKJJJJWJJJKKK', '....KJJJWJJJJK', '....KjjJJJJjjK'] },
  { id: 'top_hawaii', slot: 'top', name: 'Island Shirt', price: 110, y: 12, pal: { T: '#2ec4b6', F: '#ff8fab', f: '#ffd23f' }, rows: [
    '....KTTTTTTTTK', '...KTTFTTTTfTTK', '..KSKTTTTFTTTKSK', '..KSKTfTTTTTFKSK', '..KKKTTTFTTTTKKK', '....KTFTTTfTTK', '....KTTTTTTTTK'] },
  { id: 'top_hoodie', slot: 'top', name: 'Cozy Hoodie', price: 70, y: 12, pal: { H: '#6c757d', h: '#495057', W: '#ffffff' }, rows: [
    '....KHHWHWHHHK', '...KHHHWHWHHHHK', '..KHKHHHHHHHHKHK', '..KHKHhhhhhhHKHK', '..KKKHhHHHHhHKKK', '....KHhhhhhhHK', '....KhhHHHHhhK'] },

  // ---------- Capes ----------
  cape('cape_red', 'Hero Cape', 100, '#e63946', '#a5222e', '#ffd23f'),
  cape('cape_royal', 'Royal Cape', 180, '#5b3fa8', '#3e2a78', '#ffd23f'),
  cape('cape_shadow', 'Shadow Cape', 150, '#2b2b36', '#16161d', '#8e44ad'),
  cape('cape_ice', 'Frost Cape', 160, '#4cc9f0', '#1e88e5', '#eeeeee'),
  cape('cape_gold', 'Legendary Cape', 400, '#ffd23f', '#c9961a', '#ffffff'),

  // ---------- Face accessories ----------
  { id: 'acc_glasses', slot: 'acc', name: 'Smart Glasses', price: 50, y: 6, pal: {}, rows: [
    '....KKKK..KKKK', '....K..KKKK..K', '....K..K..K..K', '....KKKK..KKKK'] },
  { id: 'acc_patch', slot: 'acc', name: 'Eye Patch', price: 60, y: 6, pal: { k: '#2b2b36' }, rows: [
    '....kkkkkkKKK', '..........KKK', '..........KKK'] },
  { id: 'acc_stache', slot: 'acc', name: 'Mustache', price: 70, y: 9, pal: { D: '#5c3a21' }, rows: [
    '.....DDDDDDDD', '.....D......D'] },
  { id: 'acc_mask', slot: 'acc', name: 'Ninja Mask', price: 80, y: 9, pal: { k: '#2b2b36' }, rows: [
    '....kkkkkkkkkk', '.....kkkkkkkk'] },
  { id: 'acc_monocle', slot: 'acc', name: 'Monocle', price: 90, y: 6, pal: { G: '#ffd23f' }, rows: [
    '..........GGG', '..........G.G', '..........G.G', '..........GGG', '............G', '............G'] },
  { id: 'acc_shades', slot: 'acc', name: 'Star Shades', price: 120, y: 6, pal: { P: '#ff4d6d', p: '#ff8fab' }, rows: [
    '....P.P...P.P', '....PPPPPPPPPP', '....PppP..PppP', '.....PP....PP'] },

  // ---------- Pets (stand next to the hero) ----------
  { id: 'pet_slime', slot: 'pet', name: 'Slime Buddy', price: 150, abs: true, y: 18, x: 0, pal: { G: '#5fd068', g: '#3c9a47', W: '#ffffff', E: '#1a1226' }, rows: [
    '..KKK..', '.KGWGK.', 'KGEGEGK', 'KGGGGGK', 'KgggggK', '.KKKKK.'] },
  { id: 'pet_cat', slot: 'pet', name: 'Cat', price: 200, abs: true, y: 17, x: 0, pal: { O: '#f4845f', o: '#c96a45', P: '#ff8fab', E: '#1a1226' }, rows: [
    'K...K..', 'KOKOK..', 'KEOEK..', 'KOPOK.K', 'KOOOKKO', 'KoOoKK.', '.K.K...'] },
  { id: 'pet_owl', slot: 'pet', name: 'Owl', price: 250, abs: true, y: 17, x: 0, pal: { B: '#8d6346', b: '#5c3a21', W: '#ffffff', E: '#1a1226', o: '#ffa62b' }, rows: [
    'K...K', 'KBBBK', 'WEBEW', 'KBoBK', 'KBbBK', 'KbbbK', '.K.K.'] },
  { id: 'pet_duck', slot: 'pet', name: 'Duck', price: 120, abs: true, y: 18, x: 0, pal: { Y: '#ffd23f', y: '#e0a800', O: '#ff7b00', E: '#1a1226' }, rows: [
    '..KKK..', '.KYYEK.', '.KYYYOO', 'KKYYYK.', 'KyYYYYK', '.KKKKK.'] },
  { id: 'pet_dragon', slot: 'pet', name: 'Baby Dragon', price: 400, abs: true, y: 16, x: 0, pal: { R: '#8e44ad', r: '#5b2c6f', Y: '#ffd23f', E: '#1a1226', W: '#ffffff' }, rows: [
    '.K.....', 'KrK.KK.', 'KRRKRRK', 'KRWERRK', '.KRRRYK', 'KRRRRK.', 'KRKKRK.', '.K..K..'] },
];

export const ITEM_BY_ID = Object.fromEntries(ITEMS.map(i => [i.id, i]));
