// Territory Battle drawing, shared by the projector (js/modes/territory.js) and the iPads (js/play.js),
// plus the tiny text format the map is sent to iPads in.
export const TEAMS = [null, { name: 'Red', emoji: '🟥', color: '#e0465f', dark: '#8f2335', css: 'var(--bad)' }, { name: 'Blue', emoji: '🟦', color: '#3b82f6', dark: '#1e4a91', css: '#4cc9f0' }];
export const MAPS = {
  country: { name: 'Country map', ground: ['#7bbf5a', '#71b552'], paint: 0.78 },
  field: { name: 'Grass field', ground: ['#4fa346', '#46983e'], paint: 0.68 },
  arena: { name: 'Stone arena', ground: ['#2a2540', '#26213a'], paint: 1 },
};
export const isBase = (T, x) => x === 0 || x === T.W - 1;

// Paint sits on top of the ground as a see-through layer, so the map still shows.
function paintOf(T, x, y) {
  const o = T.own[y][x];
  if (!o) return { fill: '#000', op: 0 };
  return { fill: isBase(T, x) ? TEAMS[o].dark : TEAMS[o].color, op: isBase(T, x) ? 0.92 : MAPS[T.map].paint };
}

const R = (x, y, w, h, c) => `<rect x="${+x.toFixed(3)}" y="${+y.toFixed(3)}" width="${w}" height="${h}" fill="${c}"/>`;
function blocker(k, x, y) {
  switch (k) {
    case 'water': return R(x, y, 1.02, 1.02, '#173a6b') + R(x + 0.1, y + 0.28, 0.34, 0.09, '#5fd3e8') + R(x + 0.18, y + 0.2, 0.18, 0.09, '#5fd3e8') + R(x + 0.55, y + 0.68, 0.34, 0.09, '#5fd3e8') + R(x + 0.63, y + 0.6, 0.18, 0.09, '#5fd3e8');
    case 'mount': return R(x + 0.05, y + 0.62, 0.9, 0.36, '#6d6475') + R(x + 0.2, y + 0.38, 0.6, 0.26, '#857b8f') + R(x + 0.34, y + 0.14, 0.32, 0.26, '#9c93a6') + R(x + 0.38, y + 0.14, 0.24, 0.1, '#ffffff') + R(x + 0.05, y + 0.9, 0.9, 0.08, '#4d4655');
    case 'hay': return R(x + 0.1, y + 0.28, 0.8, 0.62, '#e2b84a') + R(x + 0.1, y + 0.28, 0.8, 0.1, '#f5d77a') + R(x + 0.3, y + 0.28, 0.07, 0.62, '#b88a2a') + R(x + 0.63, y + 0.28, 0.07, 0.62, '#b88a2a') + R(x + 0.1, y + 0.84, 0.8, 0.06, '#8a6620');
    case 'bush': return R(x + 0.12, y + 0.3, 0.76, 0.6, '#2e7d32') + R(x + 0.25, y + 0.15, 0.5, 0.3, '#388e3c') + R(x + 0.3, y + 0.22, 0.18, 0.12, '#66bb6a') + R(x + 0.12, y + 0.82, 0.76, 0.08, '#1b5e20');
    default: return R(x, y, 1.02, 1.02, '#4a4560') + R(x + 0.15, y + 0.15, 0.7, 0.6, '#6b6585') + R(x + 0.15, y + 0.15, 0.7, 0.15, '#8d87a8');
  }
}
function decoration(d, x, y) {
  switch (d) {
    case 'tree': return R(x + 0.45, y + 0.6, 0.12, 0.25, '#6b4226') + R(x + 0.28, y + 0.2, 0.46, 0.44, '#2f7d32') + R(x + 0.36, y + 0.1, 0.3, 0.14, '#3c9a40') + R(x + 0.34, y + 0.26, 0.12, 0.1, '#6cc26f');
    case 'flower': return R(x + 0.3, y + 0.4, 0.1, 0.1, '#fff7c2') + R(x + 0.62, y + 0.66, 0.1, 0.1, '#ffd23f');
    default: return '';
  }
}
function groundOf(T, x, y) {
  const g = MAPS[T.map].ground, d = T.deco[y][x];
  if (d === 'bridge') return R(x, y, 1.02, 1.02, '#173a6b') + R(x, y + 0.1, 1.02, 0.8, '#a0703f') + R(x + 0.32, y + 0.1, 0.06, 0.8, '#7a5230') + R(x + 0.65, y + 0.1, 0.06, 0.8, '#7a5230');
  if (d === 'sand') return R(x, y, 1.02, 1.02, (x + y) % 2 ? '#e0cf8a' : '#d8c47c');
  if (T.map === 'field') return R(x, y, 1.02, 1.02, g[Math.floor(x / 2) % 2]); // mowing stripes
  return R(x, y, 1.02, 1.02, g[(x + y) % 2]);
}
function fieldLines(T) {
  if (T.map !== 'field') return '';
  const { W, H } = T, c = 'stroke="#fff" stroke-opacity=".55" stroke-width=".09" fill="none"';
  const box = Math.min(3, Math.floor(H / 3));
  return `<g shape-rendering="geometricPrecision"><rect x="1.05" y=".05" width="${W - 2.1}" height="${H - 0.1}" ${c}/><line x1="${W / 2}" y1="0" x2="${W / 2}" y2="${H}" ${c}/>
    <circle cx="${W / 2}" cy="${H / 2}" r="${Math.min(2.2, H / 4)}" ${c}/><rect x="1" y="${(H - box * 2) / 2}" width="2.5" height="${box * 2}" ${c}/><rect x="${W - 3.5}" y="${(H - box * 2) / 2}" width="2.5" height="${box * 2}" ${c}/></g>`;
}

// The whole map as one SVG. Paint tiles get ids (prefix + x_y) so they can be recolored cheaply.
export function mapSVG(T, prefix) {
  let ground = '', paint = '', top = '';
  for (let y = 0; y < T.H; y++) for (let x = 0; x < T.W; x++) {
    if (T.rock[y][x]) {
      if (T.kind[y][x] !== 'water' && T.kind[y][x] !== 'rock') ground += groundOf(T, x, y);
      top += blocker(T.kind[y][x], x, y);
      continue;
    }
    ground += groundOf(T, x, y);
    const pt = paintOf(T, x, y);
    paint += `<rect id="${prefix}${x}_${y}" x="${x}" y="${y}" width="1.02" height="1.02" fill="${pt.fill}" fill-opacity="${pt.op}"/>`;
    top += decoration(T.deco[y][x], x, y);
  }
  return `<svg class="mz-walls" viewBox="0 0 ${T.W} ${T.H}" preserveAspectRatio="none" shape-rendering="crispEdges">${ground}${paint}${fieldLines(T)}${top}</svg>`;
}
export function paintCell(T, x, y, prefix) {
  const el = document.getElementById(`${prefix}${x}_${y}`);
  if (el) { const pt = paintOf(T, x, y); el.setAttribute('fill', pt.fill); el.setAttribute('fill-opacity', pt.op); }
}

// ---- Sending the map to iPads: one letter per tile ----
const KIND = { '': '.', rock: 'r', bush: 'b', hay: 'h', water: 'w', mount: 'm' };
const DECO = { '': '.', tree: 't', flower: 'f', sand: 's', bridge: 'B' };
const unKIND = Object.fromEntries(Object.entries(KIND).map(([k, v]) => [v, k]));
const unDECO = Object.fromEntries(Object.entries(DECO).map(([k, v]) => [v, k]));
export function encodeMap(T) {
  let k = '', d = '';
  for (let y = 0; y < T.H; y++) for (let x = 0; x < T.W; x++) { k += KIND[T.kind[y][x]] || '.'; d += DECO[T.deco[y][x]] || '.'; }
  return { W: T.W, H: T.H, map: T.map, k, d };
}
export function decodeMap(m) {
  const W = +m.W, H = +m.H;
  if (!(W > 0 && H > 0 && W <= 40 && H <= 30) || !MAPS[m.map]) return null;
  const T = { W, H, map: m.map, kind: [], deco: [], rock: [], own: [] };
  for (let y = 0; y < H; y++) {
    T.kind.push([]); T.deco.push([]); T.rock.push([]); T.own.push(Array(W).fill(0));
    for (let x = 0; x < W; x++) {
      const kk = unKIND[(m.k || '')[y * W + x]] || '';
      T.kind[y].push(kk); T.rock[y].push(!!kk); T.deco[y].push(unDECO[(m.d || '')[y * W + x]] || '');
    }
  }
  return T;
}
export const encodeOwn = T => T.own.map(r => r.join('')).join('');
export function decodeOwn(T, s) {
  if (typeof s !== 'string' || s.length !== T.W * T.H) return false;
  for (let y = 0; y < T.H; y++) for (let x = 0; x < T.W; x++) T.own[y][x] = +s[y * T.W + x] || 0;
  return true;
}
// A short tag so each iPad can find its own hero in the map message without seeing anyone's player ID.
export function heroTag(code, id) {
  let h = 2166136261;
  for (const c of code + ':' + id) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(36).slice(0, 6);
}
