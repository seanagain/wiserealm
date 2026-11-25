// Territory Battle: two teams (Red and Blue) paint the arena by walking on it with the arrow
// pad. Painting new tiles uses ink; when a hero runs out, a question refills it. When heroes
// from opposite teams bump into each other, BOTH get the same question: whoever answers right
// first wins the duel, splashes paint around and sends the loser back to base.
// The team that owns the most of the arena when time runs out wins.
import { TEAMS, MAPS, isBase, mapSVG, paintCell, encodeMap, encodeOwn, heroTag } from '../terview.js';
export { MAPS };
const STEP_MS = 200, INK_MAX = 10, DUEL_MS = 15000, TICK_MS = 1000;
const DIRS = { u: [0, -1], d: [0, 1], l: [-1, 0], r: [1, 0] };

// ---------------- Battlefields ----------------
// Every map is mirrored left/right so it's fair for both teams. T.kind says what is on each
// tile: '' = open ground, or a blocker ('rock', 'bush', 'hay', 'water', 'mount') that heroes
// can't walk through. T.deco holds decorations you CAN walk on ('tree', 'bridge', 'sand', 'flower').
const grid = (W, H, v) => Array.from({ length: H }, () => Array(W).fill(v));
const rnd = n => Math.floor(Math.random() * n);

function genArena(T) {
  for (let i = 0; i < Math.round(T.W * T.H / 22); i++) T.set(3 + rnd(T.W / 2 - 3), rnd(T.H), 'rock');
}

function genField(T) {
  // A sports field: a few hay bales and bushes, and a clear middle so teams meet there.
  for (let i = 0; i < Math.round(T.W * T.H / 30); i++) {
    const x = 2 + rnd(T.W / 2 - 3), y = rnd(T.H);
    if (Math.abs(y - (T.H - 1) / 2) < 1.5 && x > T.W / 2 - 4) continue;
    T.set(x, y, Math.random() < 0.5 ? 'hay' : 'bush');
  }
  for (let i = 0; i < T.W; i++) { const x = 1 + rnd(T.W / 2 - 1), y = rnd(T.H); if (!T.kind[y][x]) T.dec(x, y, 'flower'); }
}

function genCountry(T) {
  const { W, H } = T, half = W / 2;
  // Coastline: the sea nibbles in from the top and bottom edges.
  let top = 0, bot = 0;
  const deep = H >= 11 ? 2 : 1;
  for (let x = 1; x < half - 1; x++) {
    top = Math.max(0, Math.min(deep, top + rnd(3) - 1 - (Math.random() < 0.3))); bot = Math.max(0, Math.min(deep, bot + rnd(3) - 1 - (Math.random() < 0.3)));
    for (let y = 0; y < top; y++) T.set(x, y, 'water');
    for (let y = 0; y < bot; y++) T.set(x, H - 1 - y, 'water');
  }
  // A river down the middle, with bridges to cross it. Duels love bridges!
  const bridges = new Set();
  const nb = H >= 11 ? 3 : 2;
  for (let i = 0; i < nb; i++) bridges.add(Math.round(((i + 0.5) / nb) * (H - 1)) + rnd(3) - 1);
  for (let y = 0; y < H; y++) {
    if (bridges.has(y)) { T.set(half - 1, y, ''); T.dec(half - 1, y, 'bridge'); }
    else T.set(half - 1, y, 'water');
  }
  // A lake, mountains and forests on each side.
  const lx = 3 + rnd(Math.max(1, half - 6)), ly = 2 + rnd(Math.max(1, H - 5));
  T.set(lx, ly, 'water'); if (Math.random() < 0.7) T.set(lx + 1, ly, 'water'); if (Math.random() < 0.5) T.set(lx, ly + 1, 'water');
  for (let i = 0; i < Math.round(W * H / 40); i++) {
    let x = 2 + rnd(half - 4), y = 1 + rnd(H - 2);
    for (let k = 0; k < 1 + rnd(3); k++) { if (!T.kind[y]?.[x] && x > 1 && x < half - 2) T.set(x, y, 'mount'); x += rnd(3) - 1; y += rnd(3) - 1; if (y < 0 || y >= H) break; }
  }
  for (let i = 0; i < Math.round(W * H / 9); i++) { const x = 1 + rnd(half - 2), y = rnd(H); if (!T.kind[y][x]) T.dec(x, y, 'tree'); }
  // Beaches next to the water.
  for (let y = 0; y < H; y++) for (let x = 1; x < half - 1; x++) {
    if (T.kind[y][x] || T.deco[y][x]) continue;
    if ([[0, 1], [0, -1], [1, 0], [-1, 0]].some(([dx, dy]) => T.kind[y + dy]?.[x + dx] === 'water')) T.dec(x, y, 'sand');
  }
}

// Can every open tile be reached from both bases? Unreachable pockets become blockers.
function connect(T) {
  const seen = grid(T.W, T.H, false), todo = [];
  for (let y = 0; y < T.H; y++) { seen[y][0] = true; todo.push([0, y]); }
  while (todo.length) {
    const [x, y] = todo.pop();
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= T.W || ny >= T.H || seen[ny][nx] || T.rock[ny][nx]) continue;
      seen[ny][nx] = true; todo.push([nx, ny]);
    }
  }
  if (!seen.some(r => r[T.W - 1])) return false;
  for (let y = 0; y < T.H; y++) for (let x = 0; x < T.W; x++) if (!T.rock[y][x] && !seen[y][x]) {
    T.rock[y][x] = true; T.kind[y][x] = T.map === 'country' ? 'water' : T.map === 'field' ? 'bush' : 'rock'; T.deco[y][x] = '';
  }
  return true;
}

export function build(ctx) {
  const n = ctx.players().length;
  const size = ctx.S.terSize && ctx.S.terSize !== 'auto' ? ctx.S.terSize : n <= 10 ? 'small' : n <= 22 ? 'medium' : 'large';
  const [W, H] = { small: [16, 9], medium: [20, 11], large: [24, 13] }[size];
  let map = ctx.S.terMap || 'country';
  if (!MAPS[map]) map = Object.keys(MAPS)[rnd(3)]; // "Surprise me"
  for (let attempt = 0; ; attempt++) {
    const T = { W, H, map: attempt < 30 ? map : 'arena', own: grid(W, H, 0), rock: grid(W, H, false), kind: grid(W, H, ''), deco: grid(W, H, ''), duels: [], events: [] };
    T.set = (x, y, k) => { for (const xx of [x, W - 1 - x]) { T.kind[y][xx] = k; T.rock[y][xx] = !!k; if (k) T.deco[y][xx] = ''; } };
    T.dec = (x, y, d) => { for (const xx of [x, W - 1 - x]) T.deco[y][xx] = d; };
    ({ country: genCountry, field: genField, arena: genArena })[T.map](T);
    // Bases: the first and last columns.
    for (let y = 0; y < H; y++) for (const x of [0, W - 1]) { T.rock[y][x] = false; T.kind[y][x] = ''; T.deco[y][x] = ''; T.own[y][x] = x ? 2 : 1; }
    if (connect(T)) { delete T.set; delete T.dec; return T; }
  }
}

const baseX = (T, team) => (team === 1 ? 0 : T.W - 1);
const pct = (T, x, y) => ({ left: ((x + 0.5) / T.W) * 100 + '%', top: ((y + 0.5) / T.H) * 100 + '%' });

function teamSizes(ctx) {
  const s = [0, 0, 0];
  for (const p of ctx.players()) if (p.m && p.m.team) s[p.m.team]++;
  return s;
}

function ensure(ctx, p, team) {
  if (p.m && p.m.team) return;
  const T = ctx.G.extra, s = teamSizes(ctx);
  const chosen = ctx.S.terTeams && ctx.S.terTeams !== 'random' && (p.team === 1 || p.team === 2) ? p.team : 0;
  const t = team || chosen || (s[1] <= s[2] ? 1 : 2);
  p.m = { team: t, x: baseX(T, t), y: Math.floor(Math.random() * T.H), dir: null, dirAt: 0, last: 0, busy: null, ink: INK_MAX,
    cool: 0, safe: 0, frozen: 0, qorder: [], tiles: 0, wins: 0 };
  p.asked = p.asked || 0;
}

// ---------------- Drawing ----------------
function fitBoard(ctx) {
  const T = ctx.G.extra, wrap = ctx.$('#mzBoardWrap'), board = ctx.$('#mzBoard');
  if (!wrap || !board) return;
  const r = wrap.getBoundingClientRect(), ratio = T.W / T.H;
  const w = Math.max(200, Math.min(r.width, r.height * ratio));
  board.style.width = w + 'px'; board.style.height = w / ratio + 'px';
}

function drawBoard(ctx) {
  const { $, G, esc, heroEls, avatarSVG, players } = ctx, T = G.extra;
  const board = $('#mzBoard');
  fitBoard(ctx);
  board.innerHTML = mapSVG(T, 'tt') +
    `<div class="ter-base" style="left:${pct(T, 0, -0.1).left};top:3%">🟥 BASE</div><div class="ter-base" style="left:${pct(T, T.W - 1, 0).left};top:3%">🟦 BASE</div>`;
  board.style.setProperty('--tile', (100 / T.W) + '%');
  heroEls.clear();
  for (const p of players()) {
    ensure(ctx, p);
    const el = document.createElement('div');
    el.className = 'mz-hero ter-hero team' + p.m.team;
    el.dataset.id = p.id;
    el.innerHTML = `<div class="av-wrap">${avatarSVG(p.av)}</div><div class="nm">${esc(p.name)}</div>`;
    board.append(el);
    heroEls.set(p.id, el);
    place(ctx, p);
  }
}

const paintTile = (T, x, y) => paintCell(T, x, y, 'tt');

function place(ctx, p) {
  const T = ctx.G.extra, el = ctx.heroEls.get(p.id); if (!el) return;
  const h = [...p.id].reduce((a, c) => a + c.charCodeAt(0), 0);
  const ox = ((h % 5) - 2) * 0.1, oy = ((Math.floor(h / 5) % 3) - 1) * 0.08;
  const pos = pct(T, p.m.x + ox, p.m.y + oy);
  el.style.left = pos.left; el.style.top = pos.top;
  const now = performance.now();
  el.classList.toggle('busy', !!p.m.busy);
  el.classList.toggle('fight', !!(p.m.busy && p.m.busy.kind === 'duel'));
  el.classList.toggle('inv', now < p.m.safe);
  el.classList.toggle('done', now < p.m.frozen);
  el.classList.toggle('empty', p.m.ink <= 0);
}

function counts(T) {
  const c = [0, 0, 0]; let total = 0;
  for (let y = 0; y < T.H; y++) for (let x = 0; x < T.W; x++) if (!T.rock[y][x]) { c[T.own[y][x]]++; total++; }
  return { red: c[1], blue: c[2], total };
}

// ---------------- The map on the iPads ----------------
// The map is sent once (and again only if an iPad asks, e.g. after a reload). After that, ONE small
// update a second goes to everyone, and none at all while nothing changes, to save Supabase messages.
const padsOn = ctx => ctx.S.terPads !== false;
function syncRoster(ctx) {
  const T = ctx.G.extra, list = ctx.players();
  const key = list.map(p => p.id + ':' + (p.m && p.m.team)).join('|');
  if (key !== T.rosterKey) { T.rosterKey = key; T.roster = list; T.ver = T.ver ? T.ver + 1 : 1 + Math.floor(Math.random() * 1e6); return true; }
  return false;
}
function sendMap(ctx, force) {
  const T = ctx.G.extra, now = performance.now();
  if (!T || !padsOn(ctx) || (!force && now - (T.mapAt || 0) < 1500)) return;
  T.mapAt = now;
  syncRoster(ctx);
  ctx.send({ t: 'tmap', v: T.ver, ...encodeMap(T), pl: T.roster.map(p => [heroTag(ctx.code, p.id), p.name, p.m ? p.m.team : 0, p.av]) });
  T.tickSig = ''; // follow with a fresh update
}
function tick(ctx, now) {
  const T = ctx.G.extra;
  if (!padsOn(ctx) || !ctx.players().some(p => !p.bot)) return;
  if (syncRoster(ctx)) sendMap(ctx, true); // someone joined or left
  const o = encodeOwn(T);
  const ps = T.roster.map(p => p.m && p.m.team ? [p.m.x, p.m.y, (p.m.busy ? 1 : 0) | (now < p.m.frozen ? 2 : 0) | (now < p.m.safe ? 4 : 0), Math.min(99, p.m.ink)] : [-9, -9, 0, 0]);
  const sig = o + JSON.stringify(ps);
  if (sig === T.tickSig && now - (T.tickAt || 0) < 5000) return;
  T.tickSig = sig; T.tickAt = now;
  ctx.send({ t: 'tt', v: T.ver, o, p: ps });
}

function event(ctx, html) { ctx.setRoundMsg(html); }

function renderSide(ctx) {
  const { $, esc, fmt } = ctx, T = ctx.G.extra;
  const c = counts(T), r = Math.round((100 * c.red) / c.total), b = Math.round((100 * c.blue) / c.total);
  const bar = $('#terBar');
  if (bar) bar.innerHTML = `<span class="r" style="width:${(100 * c.red) / c.total}%">${r}%</span><span class="b" style="width:${(100 * c.blue) / c.total}%">${b}%</span>`;
  const side = $('#mzSide'); if (!side) return;
  const list = team => ctx.ranked().filter(p => p.m && p.m.team === team).slice(0, 5)
    .map(p => `<div class="brow"><span>${esc(p.name)}</span><b>${fmt(p.score)}</b></div>`).join('') || '<div class="muted">-</div>';
  side.innerHTML = `<h3 style="color:${TEAMS[1].css}">🟥 Red team</h3>${list(1)}<h3 style="color:${TEAMS[2].css};margin-top:12px">🟦 Blue team</h3>${list(2)}
    <div class="muted" style="font-size:.82rem;line-height:1.6;margin-top:12px">Walk to paint tiles (uses ink).<br>Out of ink? Answer to refill.<br>🗡️ Bump an enemy: first right answer wins!</div>`;
}

// ---------------- Questions ----------------
function nextQ(ctx, p) {
  if (!p.m.qorder.length) {
    p.m.qorder = ctx.G.qs.map((_, i) => i);
    for (let i = p.m.qorder.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [p.m.qorder[i], p.m.qorder[j]] = [p.m.qorder[j], p.m.qorder[i]]; }
  }
  return p.m.qorder.pop();
}

function sendQ(ctx, p) {
  const b = p.m.busy, q = ctx.G.qs[b.qi];
  ctx.send({ t: 'mq', to: p.id, k: b.token, kind: b.kind, vs: b.vs || '', q: { prompt: q.prompt, choices: q.choices } });
}

function ask(ctx, p, kind, qi, extra = {}) {
  const token = Math.random().toString(36).slice(2, 9);
  p.m.busy = { kind, token, qi, at: performance.now(), ...extra };
  p.m.dir = null;
  place(ctx, p);
  sendQ(ctx, p);
  if (p.bot) {
    const q = ctx.G.qs[qi];
    ctx.later(() => answer(ctx, p, token, Math.random() < p.skill ? q.correct : (q.correct + 1) % q.choices.length), 1200 + Math.random() * 3500);
  }
}

function track(ctx, p, qi, ok) {
  const q = ctx.G.qs[qi];
  if (!p.bot) {
    const st = ctx.G.qstats[qi] || (ctx.G.qstats[qi] = { p: q.prompt, a: q.choices[q.correct], n: 0, r: 0 });
    st.n++; if (ok) st.r++;
  }
  p.asked++; p.answered = (p.answered || 0) + 1;
  if (ok) { p.correct++; p.streak++; } else { p.streak = 0; (p.missed = p.missed || []).push(qi); }
}

const teamTag = p => (p.m && p.m.team ? `${TEAMS[p.m.team].emoji} ${TEAMS[p.m.team].name} team` : '');
const res = (ctx, p, ok, line) => ctx.send({ t: 'mres', to: p.id, ok, line, score: p.score, tag: teamTag(p) });

function answer(ctx, p, token, c) {
  const b = p.m.busy;
  if (!b || b.token !== token) return;
  const q = ctx.G.qs[b.qi], ok = Number(c) === q.correct;
  if (b.kind === 'ink') {
    track(ctx, p, b.qi, ok);
    p.m.busy = null;
    if (ok) {
      p.m.ink = INK_MAX; p.score += 20;
      res(ctx, p, true, `Ink refilled! +20. Go paint!`);
      ctx.sfx('reveal');
    } else {
      p.m.ink = 3; p.m.cool = performance.now() + 2000;
      res(ctx, p, false, `Not quite (answer: ${q.choices[q.correct]}). You got a little ink (3).`);
      ctx.sfx('bad');
    }
    place(ctx, p); renderSide(ctx);
    return;
  }
  if (b.kind === 'duel') {
    const D = b.duel;
    if (D.done || D.answered.has(p.id)) return;
    D.answered.add(p.id);
    track(ctx, p, b.qi, ok);
    if (ok) return endDuel(ctx, D, p);
    res(ctx, p, false, `Wrong! (answer: ${q.choices[q.correct]}) Hope ${D.a === p ? D.b.name : D.a.name} misses too…`);
    p.m.busy = { ...b, token: 'waiting' }; // stays in the duel but can't answer again
    if (D.answered.size >= 2) endDuel(ctx, D, null);
  }
}

// ---------------- Duels ----------------
function startDuel(ctx, a, b) {
  const qi = nextQ(ctx, a);
  const D = { a, b, qi, start: performance.now(), answered: new Set(), done: false };
  ctx.G.extra.duels.push(D);
  ask(ctx, a, 'duel', qi, { duel: D, vs: b.name });
  ask(ctx, b, 'duel', qi, { duel: D, vs: a.name });
  ctx.sfx('roar');
  event(ctx, `<span class="bad">🗡️ ${ctx.esc(a.name)} vs ${ctx.esc(b.name)}: DUEL!</span>`);
}

function endDuel(ctx, D, winner) {
  if (D.done) return;
  D.done = true;
  const T = ctx.G.extra, now = performance.now(), q = ctx.G.qs[D.qi];
  T.duels = T.duels.filter(x => x !== D);
  const { a, b } = D;
  a.m.busy = null; b.m.busy = null;
  if (!winner) {
    for (const p of [a, b]) {
      p.m.safe = now + 3000;
      const back = p.m.team === 1 ? -1 : 1, nx = p.m.x + back;
      if (nx >= 0 && nx < T.W && !T.rock[p.m.y][nx]) p.m.x = nx;
      res(ctx, p, false, `Nobody won that duel. (Answer: ${q.choices[q.correct]}) Both bounced back!`);
      place(ctx, p);
    }
    event(ctx, `<span class="muted">🗡️ ${ctx.esc(a.name)} and ${ctx.esc(b.name)} tied.</span>`);
    return;
  }
  const loser = winner === a ? b : a;
  winner.score += 100; winner.m.wins++; winner.m.ink = INK_MAX; winner.m.safe = now + 2000;
  // Paint splash around where the loser stood.
  let splashed = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const x = loser.m.x + dx, y = loser.m.y + dy;
    if (x < 0 || y < 0 || x >= T.W || y >= T.H || T.rock[y][x] || isBase(T, x) || T.own[y][x] === winner.m.team) continue;
    T.own[y][x] = winner.m.team; paintTile(T, x, y); splashed++;
  }
  winner.score += splashed * 10;
  Object.assign(loser.m, { x: baseX(T, loser.m.team), y: Math.floor(Math.random() * T.H), frozen: now + 2500, safe: now + 5000, dir: null });
  res(ctx, winner, true, `🗡️ You won the duel! +${100 + splashed * 10}. Paint splash!`);
  res(ctx, loser, false, `${winner.name} answered first! (Answer: ${q.choices[q.correct]}) Back to base…`);
  place(ctx, winner); place(ctx, loser);
  ctx.sfx('crit');
  const board = ctx.$('#mzBoard');
  if (board) ctx.floatText(board, 'SPLAT!', 'crit', ((loser.m.x + 0.5) / T.W) * 100, 40);
  event(ctx, `<span style="color:${TEAMS[winner.m.team].css}">💥 ${ctx.esc(winner.name)} beat ${ctx.esc(loser.name)} in a duel!</span>`);
  renderSide(ctx);
}

function checkDuels(ctx, now) {
  const all = ctx.players().filter(p => p.m && !p.m.busy && now >= p.m.safe && now >= p.m.frozen && !isBase(ctx.G.extra, p.m.x));
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    const a = all[i], b = all[j];
    if (a.m.team === b.m.team || a.m.busy || b.m.busy) continue;
    if (Math.abs(a.m.x - b.m.x) + Math.abs(a.m.y - b.m.y) <= 1) startDuel(ctx, a, b);
  }
  for (const D of ctx.G.extra.duels.slice()) if (now - D.start > DUEL_MS) endDuel(ctx, D, null);
}

// ---------------- Movement ----------------
function tryMove(ctx, p, d) {
  const T = ctx.G.extra, [dx, dy] = DIRS[d], nx = p.m.x + dx, ny = p.m.y + dy;
  if (nx < 0 || ny < 0 || nx >= T.W || ny >= T.H || T.rock[ny][nx]) return;
  if (isBase(T, nx) && nx !== baseX(T, p.m.team)) return; // can't enter the other team's base
  const owner = T.own[ny][nx];
  if (owner !== p.m.team) {
    if (p.m.ink <= 0) {
      if (performance.now() >= p.m.cool) ask(ctx, p, 'ink', nextQ(ctx, p));
      return;
    }
    p.m.ink--;
    T.own[ny][nx] = p.m.team; paintTile(T, nx, ny);
    p.m.tiles++; p.score += owner ? 15 : 10; // stealing enemy paint is worth more
  }
  p.m.x = nx; p.m.y = ny;
  place(ctx, p);
}

function botThink(ctx, p) {
  const T = ctx.G.extra;
  if (Math.random() < 0.12) { p.m.dir = null; return; }
  const opts = Object.entries(DIRS).filter(([, [dx, dy]]) => {
    const x = p.m.x + dx, y = p.m.y + dy;
    return x >= 0 && y >= 0 && x < T.W && y < T.H && !T.rock[y][x] && !(isBase(T, x) && x !== baseX(T, p.m.team));
  });
  if (!opts.length) return;
  const good = opts.filter(([, [dx, dy]]) => T.own[p.m.y + dy][p.m.x + dx] !== p.m.team);
  const pool = good.length && Math.random() < 0.75 ? good : opts;
  const pick = pool[Math.floor(Math.random() * pool.length)];
  p.m.dir = pick[0]; p.m.dirAt = performance.now();
}

export default {
  id: 'territory',
  // How it rates in the game picker (1-5): learning focus vs. fun gameplay.
  rating: { learn: 3, fun: 5, why: 'Questions refill ink and settle duels: frequent, but mixed with lots of running and team strategy.' },
  name: 'Territory Battle',
  blurb: 'Two teams paint the map with the arrows on their iPads! Run out of ink? Answer to refill. Bump into an enemy and you both get the same question: first right answer wins the duel. Most territory wins!',
  scoreName: 'Points',
  scoreShort: 'pts',
  selfPaced: true,

  settings(ctx, el, persist) {
    const { S } = ctx;
    S.terMins = S.terMins || 5; S.terSize = S.terSize || 'auto'; S.terMap = S.terMap || 'country';
    if (S.terPads === undefined) S.terPads = true;
    S.terTeams = S.terTeams || 'random';
    el.innerHTML = `<label>Time limit <select id="terMins">${[3, 4, 5, 6, 8, 10].map(m => `<option value="${m}">${m} min</option>`).join('')}</select></label>
      <label>Battlefield <select id="terMap">${Object.entries(MAPS).map(([k, m]) => `<option value="${k}">${m.name}</option>`).join('')}<option value="random">Surprise me</option></select></label>
      <label>Arena size <select id="terSize"><option value="auto">Auto (by players)</option><option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option></select></label>
      <label>Teams <select id="terTeams"><option value="random">Random (at start)</option><option value="pick">Students pick</option><option value="teacher">I’ll choose</option></select></label>
      <label title="Each student sees the map and their own hero on their iPad">Map on iPads <input type="checkbox" id="terPads"></label>
      <p class="muted" style="margin:-6px 0 0;font-size:.8rem">Random teams are split evenly when the game starts. The iPad map adds about 1 message per student per second.</p>`;
    const tm = el.querySelector('#terTeams');
    tm.value = S.terTeams;
    tm.onchange = () => { S.terTeams = tm.value; persist(); ctx.lobbyChanged(); };
    const pads = el.querySelector('#terPads');
    pads.checked = S.terPads !== false;
    pads.onchange = () => { S.terPads = pads.checked; persist(); };
    const mn = el.querySelector('#terMins'), sz = el.querySelector('#terSize');
    const mp = el.querySelector('#terMap');
    mn.value = S.terMins; sz.value = S.terSize; mp.value = S.terMap;
    mp.onchange = () => { S.terMap = mp.value; persist(); };
    mn.onchange = () => { S.terMins = +mn.value; persist(); };
    sz.onchange = () => { S.terSize = sz.value; persist(); };
  },

  mount(ctx) {
    ctx.stage.innerHTML = `<div class="mz-wrap"><div style="display:flex;flex-direction:column;gap:10px;min-height:0">
        <div class="ter-bar" id="terBar"></div>
        <div class="mz-board-wrap" id="mzBoardWrap" style="flex:1"><div class="mz-board ter-board" id="mzBoard"></div></div></div>
      <div class="mz-side"><div class="card mz-timer-card"><div class="muted">TIME LEFT</div><div class="mz-timer" id="mzTimer">--:--</div></div>
      <div class="card cboard" id="mzSide"></div></div></div>`;
    ctx.G.extra = build(ctx);
    const list = ctx.players().slice();
    for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
    for (const p of list) p.m = {};
    if ((ctx.S.terTeams || 'random') === 'random') {
      // Split teams evenly (shuffled, so friends aren't always together).
      list.forEach((p, i) => ensure(ctx, p, (i % 2) + 1));
    } else {
      // Teams picked in the lobby; anyone without a team joins the smaller one.
      for (const p of list) if (p.team === 1 || p.team === 2) ensure(ctx, p, p.team);
      for (const p of list) ensure(ctx, p);
    }
    drawBoard(ctx);
    renderSide(ctx);
  },

  async start(ctx) {
    fitBoard(ctx);
    ctx.broadcast(); // tells each iPad its team
    sendMap(ctx, true);
    ctx.sfx('warning');
    await ctx.intro(`<span style="color:var(--bad)">🟥 RED</span> vs <span style="color:#4cc9f0">BLUE 🟦</span><br>TERRITORY BATTLE!<br><span style="font-size:.5em" class="muted">Paint the arena with your team. Bump an enemy to duel!</span>`, 3400);
  },

  run(ctx) {
    const { G, S } = ctx, T = G.extra;
    T.endAt = performance.now() + (S.terMins || 5) * 60000;
    fitBoard(ctx);
    ctx.broadcast();
    let lastSide = 0, lastTick = 0;
    return new Promise(resolve => {
      const iv = setInterval(() => {
        const now = performance.now();
        const left = Math.max(0, T.endAt - now);
        const clock = `${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}`;
        const c = counts(T);
        ctx.setStatus(`⏱ ${clock} left · 🟥 ${Math.round((100 * c.red) / c.total)}% vs 🟦 ${Math.round((100 * c.blue) / c.total)}%`);
        const tEl = ctx.$('#mzTimer');
        if (tEl) { tEl.textContent = clock; tEl.classList.toggle('urgent', left < 30000); }
        if (left <= 0) { clearInterval(iv); for (const D of T.duels.slice()) endDuel(ctx, D, null); resolve(); return; }
        for (const p of ctx.players()) {
          ensure(ctx, p);
          if (p.m.busy || now < p.m.frozen) continue;
          if (p.bot && now - (p.m.think || 0) >= STEP_MS * 2) { p.m.think = now; botThink(ctx, p); }
          if (p.m.dir && now - p.m.last >= STEP_MS && (p.bot || now - p.m.dirAt < 2600)) { p.m.last = now; tryMove(ctx, p, p.m.dir); }
          else if (ctx.heroEls.get(p.id)?.classList.contains('inv') && now >= p.m.safe) place(ctx, p);
          else if (ctx.heroEls.get(p.id)?.classList.contains('done') && now >= p.m.frozen) place(ctx, p);
        }
        checkDuels(ctx, now);
        if (now - lastTick >= TICK_MS) { lastTick = now; tick(ctx, now); }
        if (now - lastSide > 700) { lastSide = now; renderSide(ctx); }
      }, 60);
      G.timers.push(iv);
    });
  },

  // ---- Choosing teams in the lobby ----
  lobbyPanel(ctx, el) {
    const { S, esc } = ctx, how = S.terTeams || 'random';
    if (how === 'random') { el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    const list = ctx.players(), on = t => list.filter(p => (p.team || 0) === t);
    const names = t => on(t).map(p => `<button class="tm-name" data-tm="${esc(p.id)}" title="Click to move">${esc(p.name)}${p.bot ? ' 🤖' : ''}</button>`).join('') || '<span class="muted">nobody yet</span>';
    const none = on(0);
    el.innerHTML = `<div class="tm-head"><b>${how === 'pick' ? '📱 Students pick a team on their iPads.' : '👆 Click a name to move them.'}</b>
        <span class="muted">${how === 'pick' ? 'Click a name to move them.' : ''} No team yet = put on the smaller team at the start.</span>
        <span class="spacer"></span>
        <button class="btn small" data-tact="even">⚖ Even out</button><button class="btn small" data-tact="shuffle">🔀 Shuffle</button><button class="btn small" data-tact="clear">Clear</button></div>
      <div class="tm-cols">
        <div class="tm-col red"><h3>🟥 Red · ${on(1).length}</h3>${names(1)}</div>
        ${none.length ? `<div class="tm-col none"><h3>No team · ${none.length}</h3>${names(0)}</div>` : ''}
        <div class="tm-col blue"><h3>🟦 Blue · ${on(2).length}</h3>${names(2)}</div>
      </div>`;
    el.onclick = e => {
      const nm = e.target.closest('[data-tm]'), act = e.target.closest('[data-tact]');
      if (nm) { const p = ctx.G.players.get(nm.dataset.tm); if (p) p.team = p.team === 1 ? 2 : 1; }
      else if (act) {
        const a = act.dataset.tact;
        if (a === 'clear') for (const p of list) p.team = 0;
        else if (a === 'shuffle') {
          const l = list.slice();
          for (let i = l.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [l[i], l[j]] = [l[j], l[i]]; }
          l.forEach((p, i) => (p.team = (i % 2) + 1));
        } else if (a === 'even') {
          for (const p of on(0)) p.team = on(1).length <= on(2).length ? 1 : 2;
          for (let big = on(1).length > on(2).length ? 1 : 2; Math.abs(on(1).length - on(2).length) > 1;) {
            const l = on(big); l[l.length - 1].team = 3 - big; // move the last one listed
          }
        }
      } else return;
      ctx.lobbyChanged();
    };
  },
  lobbyTeam(ctx, p) { return (ctx.S.terTeams || 'random') !== 'random' ? p.team || 0 : 0; },

  onMessage(ctx, m) {
    if (m.t === 'team' && ctx.G.phase === 'lobby') {
      const p = ctx.G.players.get(m.id), t = +m.team;
      if (!p || ctx.S.terTeams !== 'pick' || (t !== 1 && t !== 2) || p.team === t) return;
      const size = k => ctx.players().filter(q => q !== p && q.team === k).length;
      if (size(t) >= size(3 - t) + 2) return; // that team is full for now
      p.team = t;
      ctx.lobbyChanged();
      return;
    }
    if (ctx.G.phase !== 'play') return;
    const p = ctx.G.players.get(m.id); if (!p) return;
    ensure(ctx, p);
    if (m.t === 'dir') { p.m.dir = DIRS[m.d] ? m.d : null; p.m.dirAt = performance.now(); }
    else if (m.t === 'mans') answer(ctx, p, m.k, m.c);
    else if (m.t === 'tneed') sendMap(ctx);
  },

  renderPlayers(ctx) { if (ctx.G.phase === 'play' || ctx.G.phase === 'intro') { fitBoard(ctx); if (ctx.heroEls.size !== ctx.players().length) drawBoard(ctx); renderSide(ctx); } },
  addPlayer(ctx, p) { p.m = {}; p.asked = 0; ensure(ctx, p); drawBoard(ctx); renderSide(ctx); },
  rejoin(ctx, p) { const b = p.m && p.m.busy; if (b && b.token !== 'waiting') sendQ(ctx, p); },

  publicState(ctx) {
    const T = ctx.G.extra;
    if (ctx.G.phase === 'lobby') {
      const how = ctx.S.terTeams || 'random', list = ctx.players();
      if (how === 'random') return { teamPick: 'random' };
      return { teamPick: how, teams: Object.fromEntries(list.filter(p => !p.bot).map(p => [p.id, p.team || 0])), tsize: [0, 1, 2].map(t => list.filter(p => (p.team || 0) === t).length) };
    }
    return T && T.endAt ? { left: Math.max(0, T.endAt - performance.now()), pads: padsOn(ctx) } : { pads: padsOn(ctx) };
  },
  tag(ctx, p) { return teamTag(p); },
  hud(ctx) { const T = ctx.G.extra; if (!T || !T.own) return ''; const c = counts(T); return `🟥 ${Math.round((100 * c.red) / c.total)}% · 🟦 ${Math.round((100 * c.blue) / c.total)}%`; },

  endInfo(ctx) {
    const T = ctx.G.extra, c = counts(T);
    const r = Math.round((100 * c.red) / c.total), b = Math.round((100 * c.blue) / c.total);
    const title = c.red === c.blue ? '🤝 It’s a tie!' : c.red > c.blue ? '🟥 Red team wins!' : '🟦 Blue team wins!';
    const mvp = ctx.ranked()[0];
    return { win: null, title, sub: `Red ${r}% · Blue ${b}% of the arena.${mvp ? ` MVP: ${mvp.name}.` : ''}` };
  },
};
