// Mr. C's Maze: students steer their heroes through a maze with the arrow pad on their iPad.
// Locked gates need a correct answer (each student unlocks their own gates). A wild Mr. C roams
// the maze; if he catches a hero they battle: a correct answer bonks him away, a wrong one
// costs a heart. Escape through the exit for big points. Everyone plays at their own pace.
import { BOSSES, bossSVG } from '../boss.js';

const MRC = Math.max(0, BOSSES.findIndex(b => b.custom === 'mrc'));
const SIZES = { small: [9, 5], medium: [12, 7], large: [15, 8] };
const STEP_MS = 190, MRC_STEP_MS = 430, HEARTS = 3;
const DIRS = { u: [0, -1], d: [0, 1], l: [-1, 0], r: [1, 0] };
const key = (x, y) => x + ',' + y;

// Perfect maze (one route between any two spots) with the recursive backtracker.
function genMaze(cw, ch) {
  const W = cw * 2 + 1, H = ch * 2 + 1;
  const g = Array.from({ length: H }, () => Array(W).fill(1));
  const seen = new Set(['0,0']), stack = [[0, 0]];
  g[1][1] = 0;
  while (stack.length) {
    const [cx, cy] = stack[stack.length - 1];
    const nb = Object.values(DIRS).map(([dx, dy]) => [cx + dx, cy + dy]).filter(([x, y]) => x >= 0 && y >= 0 && x < cw && y < ch && !seen.has(key(x, y)));
    if (!nb.length) { stack.pop(); continue; }
    const [nx, ny] = nb[Math.floor(Math.random() * nb.length)];
    g[cy * 2 + 1 + (ny - cy)][cx * 2 + 1 + (nx - cx)] = 0;
    g[ny * 2 + 1][nx * 2 + 1] = 0;
    seen.add(key(nx, ny)); stack.push([nx, ny]);
  }
  return { W, H, g };
}

// Distances from (sx, sy) to every floor tile.
function bfs(T, sx, sy) {
  const dist = Array.from({ length: T.H }, () => Array(T.W).fill(Infinity));
  dist[sy][sx] = 0;
  const q = [[sx, sy]];
  for (let i = 0; i < q.length; i++) {
    const [x, y] = q[i];
    for (const [dx, dy] of Object.values(DIRS)) {
      const nx = x + dx, ny = y + dy;
      if (T.g[ny] && T.g[ny][nx] === 0 && dist[ny][nx] === Infinity) { dist[ny][nx] = dist[y][x] + 1; q.push([nx, ny]); }
    }
  }
  return dist;
}

function pathTo(T, from, to) {
  const dist = bfs(T, to.x, to.y), path = [];
  let x = from.x, y = from.y;
  while (dist[y][x] > 0) {
    let best = null;
    for (const [dx, dy] of Object.values(DIRS)) { const nx = x + dx, ny = y + dy; if (T.g[ny] && T.g[ny][nx] === 0 && dist[ny][nx] < dist[y][x]) best = [nx, ny]; }
    if (!best) break;
    [x, y] = best; path.push({ x, y });
  }
  return path;
}

function build(ctx) {
  const [cw, ch] = SIZES[ctx.S.mazeSize] || SIZES.medium;
  const T = genMaze(cw, ch);
  T.start = { x: 1, y: 1 };
  T.exit = { x: T.W - 2, y: T.H - 2 };
  const path = pathTo(T, T.start, T.exit);
  const nGates = Math.max(3, Math.min(8, Math.round(path.length / 9)));
  T.gates = [];
  for (let i = 1; i <= nGates; i++) {
    const p = path[Math.floor((i * path.length) / (nGates + 1))];
    if (p && !(p.x === T.exit.x && p.y === T.exit.y)) T.gates.push({ id: T.gates.length, x: p.x, y: p.y, opened: 0 });
  }
  T.gateAt = new Map(T.gates.map(g => [key(g.x, g.y), g]));
  const floor = [];
  for (let y = 0; y < T.H; y++) for (let x = 0; x < T.W; x++) if (T.g[y][x] === 0) floor.push({ x, y });
  const free = floor.filter(t => !T.gateAt.has(key(t.x, t.y)) && key(t.x, t.y) !== key(1, 1) && key(t.x, t.y) !== key(T.exit.x, T.exit.y));
  T.gems = new Set();
  for (let i = 0; i < Math.round(floor.length / 14) && free.length; i++) T.gems.add((({ x, y }) => key(x, y))(free.splice(Math.floor(Math.random() * free.length), 1)[0]));
  T.toExit = bfs(T, T.exit.x, T.exit.y);
  const fromStart = bfs(T, 1, 1);
  T.far = floor.filter(t => fromStart[t.y][t.x] > 12);
  T.edison = ctx.S.mazeStyle === 'edison';
  // Edison Mode: lightning bolts to collect (zap Mr. C with them) and one extra Mr. C.
  T.bolts = new Set();
  if (T.edison) for (let i = 0; i < Math.max(6, Math.round(floor.length / 16)) && free.length; i++) {
    const t = free.splice(Math.floor(Math.random() * free.length), 1)[0]; T.bolts.add(key(t.x, t.y));
  }
  let nMrc = ctx.S.mazeMrc === 'auto' || !ctx.S.mazeMrc ? Math.min(3, Math.max(1, Math.ceil(ctx.players().length / 10))) : +ctx.S.mazeMrc;
  if (T.edison) nMrc = Math.min(4, nMrc + 1);
  T.mrcs = Array.from({ length: nMrc }, (_, i) => ({ id: i, ...farSpot(T), last: 0, stunUntil: performance.now() + 6000, busy: false }));
  T.finished = 0;
  T.events = [];
  return T;
}

function farSpot(T, awayFrom = null) {
  const list = awayFrom ? T.far.filter(t => Math.abs(t.x - awayFrom.x) + Math.abs(t.y - awayFrom.y) > 10) : T.far;
  const pick = (list.length ? list : T.far)[Math.floor(Math.random() * (list.length || T.far.length))];
  return { x: pick.x, y: pick.y };
}

const pct = (T, x, y) => ({ left: ((x + 0.5) / T.W) * 100 + '%', top: ((y + 0.5) / T.H) * 100 + '%' });

function ensure(ctx, p) {
  if (p.m.x !== undefined) return;
  const T = ctx.G.extra;
  Object.assign(p.m, { x: T.start.x, y: T.start.y, dir: null, dirAt: 0, last: 0, busy: null, cool: 0, inv: 0, hearts: HEARTS,
    unlocked: new Set(), check: { ...T.start }, qorder: [], finished: false, place: 0, bolts: 0 });
  p.asked = p.asked || 0;
}

// ---------------- Drawing ----------------
// Make the maze as big as the space allows while keeping its shape.
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
  let rects = '';
  for (let y = 0; y < T.H; y++) {
    let x = 0;
    while (x < T.W) {
      const wall = T.g[y][x] === 1; let n = 1;
      while (x + n < T.W && (T.g[y][x + n] === 1) === wall) n++;
      rects += wall
        ? `<rect x="${x}" y="${y}" width="${n + 0.02}" height="1.02" fill="${T.edison ? '#5b3fa8' : '#3b3652'}"/><rect x="${x}" y="${y}" width="${n}" height="0.18" fill="${T.edison ? '#a77bff' : '#57516e'}"/>`
        : `<rect x="${x}" y="${y}" width="${n + 0.02}" height="1.02" fill="${T.edison ? '#1a0f2e' : '#1c1829'}"/>`;
      x += n;
    }
  }
  board.innerHTML = `<svg class="mz-walls" viewBox="0 0 ${T.W} ${T.H}" preserveAspectRatio="none" shape-rendering="crispEdges">${rects}</svg>` +
    `<div class="mz-start" style="left:${pct(T, 1, 1).left};top:${pct(T, 1, 1).top}">START</div>` +
    `<div class="mz-exit" style="left:${pct(T, T.exit.x, T.exit.y).left};top:${pct(T, T.exit.x, T.exit.y).top}">🏆</div>` +
    T.gates.map(g => `<div class="mz-gate" id="gate${g.id}" style="left:${pct(T, g.x, g.y).left};top:${pct(T, g.x, g.y).top}">🔒<span>${g.opened}</span></div>`).join('') +
    [...T.bolts].map(k => { const [x, y] = k.split(',').map(Number); return `<div class="mz-bolt" data-k="${k}" style="left:${pct(T, x, y).left};top:${pct(T, x, y).top}">⚡</div>`; }).join('') +
    [...T.gems].map(k => { const [x, y] = k.split(',').map(Number); return `<div class="mz-gem" data-k="${k}" style="left:${pct(T, x, y).left};top:${pct(T, x, y).top}">◆</div>`; }).join('') +
    T.mrcs.map(m => `<div class="mz-mrc" id="mrc${m.id}">${bossSVG(MRC)}</div>`).join('');
  board.style.setProperty('--tile', (100 / T.W) + '%');
  board.classList.toggle('edison', !!T.edison);
  heroEls.clear();
  for (const p of players()) {
    ensure(ctx, p);
    const el = document.createElement('div');
    el.className = 'mz-hero';
    el.dataset.id = p.id;
    el.innerHTML = `<div class="av-wrap">${avatarSVG(p.av)}</div><div class="nm">${esc(p.name)}</div>`;
    board.append(el);
    heroEls.set(p.id, el);
    place(ctx, p);
  }
  T.mrcs.forEach(m => placeMrc(T, m));
}

function place(ctx, p) {
  const T = ctx.G.extra, el = ctx.heroEls.get(p.id); if (!el) return;
  // small offsets so heroes on the same tile don't hide each other
  const h = [...p.id].reduce((a, c) => a + c.charCodeAt(0), 0);
  const ox = ((h % 5) - 2) * 0.12, oy = ((Math.floor(h / 5) % 3) - 1) * 0.1;
  const pos = pct(T, p.m.x + ox, p.m.y + oy);
  el.style.left = pos.left; el.style.top = pos.top;
  el.classList.toggle('busy', !!p.m.busy);
  el.classList.toggle('fight', !!(p.m.busy && p.m.busy.kind === 'fight'));
  el.classList.toggle('inv', performance.now() < p.m.inv);
  el.classList.toggle('done', p.m.finished);
  el.classList.toggle('armed', p.m.bolts > 0);
}

function placeMrc(T, m) {
  const el = document.getElementById('mrc' + m.id); if (!el) return;
  const pos = pct(T, m.x, m.y);
  el.style.left = pos.left; el.style.top = pos.top;
  el.classList.toggle('stunned', performance.now() < m.stunUntil);
}

function event(ctx, html) {
  const T = ctx.G.extra;
  T.events.unshift(html); T.events.length = Math.min(T.events.length, 4);
  ctx.setRoundMsg(T.events[0]);
}

function renderBoard(ctx) {
  const { $, esc, fmt } = ctx;
  const top = ctx.ranked().slice(0, 8);
  $('#mzSide').innerHTML = `<h3>Leaderboard</h3>` + top.map((p, i) =>
    `<div class="brow"><span>${i + 1}. ${p.m.finished ? '🏆 ' : ''}${esc(p.name)}</span><b>${fmt(p.score)}</b></div>`).join('') +
    `<h3 style="margin-top:14px">Legend</h3><div class="muted" style="font-size:.85rem;line-height:1.7">🔒 Gate: answer to unlock<br>◆ Gem: +50<br>🏆 Exit: escape for a big bonus<br>Wild Mr. C: answer right to bonk him!` +
    (ctx.G.extra.edison ? `<br><b style="color:var(--gold)">⚡ Bolt:</b> run into a Mr. C to ZAP him (+300)` : '') + `</div>`;
}

// ---------------- Questions ----------------
function nextQ(ctx, p) {
  if (!p.m.qorder.length) {
    p.m.qorder = ctx.G.qs.map((_, i) => i);
    for (let i = p.m.qorder.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [p.m.qorder[i], p.m.qorder[j]] = [p.m.qorder[j], p.m.qorder[i]]; }
  }
  return p.m.qorder.pop();
}

function ask(ctx, p, kind, extra) {
  const qi = nextQ(ctx, p), q = ctx.G.qs[qi];
  const token = Math.random().toString(36).slice(2, 9);
  p.m.busy = { kind, token, qi, ...extra };
  p.m.dir = null;
  place(ctx, p);
  ctx.send({ t: 'mq', to: p.id, k: token, kind, q: { prompt: q.prompt, choices: q.choices } });
  if (p.bot) ctx.later(() => answer(ctx, p, token, Math.random() < p.skill ? q.correct : (q.correct + 1) % q.choices.length), 1500 + Math.random() * 3000);
}

function answer(ctx, p, token, c) {
  const { G, fmt, sfx, floatText, $ } = ctx, T = G.extra, b = p.m.busy;
  if (!b || b.token !== token) return;
  const q = G.qs[b.qi], ok = Number(c) === q.correct;
  // progress stats (same format as the other games)
  if (!p.bot) {
    const st = G.qstats[b.qi] || (G.qstats[b.qi] = { p: q.prompt, a: q.choices[q.correct], n: 0, r: 0 });
    st.n++; if (ok) st.r++;
  }
  p.asked++; p.answered = (p.answered || 0) + 1;
  if (ok) { p.correct++; p.streak++; } else { p.streak = 0; (p.missed = p.missed || []).push(b.qi); }
  const now = performance.now();
  let line = '';
  p.m.busy = null;
  if (b.kind === 'gate') {
    const gate = T.gates[b.gate];
    if (ok) {
      p.m.unlocked.add(gate.id); p.m.check = { x: gate.x, y: gate.y }; p.score += 100; gate.opened++;
      const el = $('#gate' + gate.id); if (el) { el.querySelector('span').textContent = gate.opened; el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
      line = 'Gate unlocked! +100. Keep going!';
      sfx('reveal');
    } else {
      p.m.cool = now + 2500;
      line = `Not quite (answer: ${q.choices[q.correct]}). The gate stays locked. Try again in a moment!`;
      sfx('bad');
    }
  } else if (b.kind === 'zap') {
    const m = T.mrcs[b.mrc];
    m.busy = false; p.m.bolts = Math.max(0, p.m.bolts - 1);
    if (ok) {
      p.score += 300; p.m.inv = now + 2500;
      Object.assign(m, farSpot(T, p.m), { stunUntil: now + 12000 });
      placeMrc(T, m);
      line = '⚡ ZAP! You knocked Mr. C out for a while! +300';
      event(ctx, `<span style="color:var(--gold)">⚡ ${ctx.esc(p.name)} ZAPPED Mr. C!</span>`);
      sfx('explode');
      const board = $('#mzBoard'); board.classList.remove('zap'); void board.offsetWidth; board.classList.add('zap');
      floatText(board, 'ZAP!', 'crit', ((p.m.x + 0.5) / T.W) * 100, ((p.m.y) / T.H) * 100);
    } else {
      p.m.inv = now + 2500; m.stunUntil = now + 2000;
      line = `Your bolt fizzled! (Answer: ${q.choices[q.correct]}) Get away from Mr. C!`;
      sfx('bad');
    }
  } else if (b.kind === 'fight') {
    const m = T.mrcs[b.mrc];
    m.busy = false;
    if (ok) {
      p.score += 150; p.m.inv = now + 2500;
      Object.assign(m, farSpot(T, p.m), { stunUntil: now + 5000 });
      placeMrc(T, m);
      line = 'BONK! You knocked Mr. C away! +150';
      event(ctx, `<span class="good">💥 ${ctx.esc(p.name)} bonked Mr. C!</span>`);
      sfx('crit');
      floatText($('#mzBoard'), 'BONK!', 'crit', ((p.m.x + 0.5) / T.W) * 100, ((p.m.y) / T.H) * 100);
    } else {
      p.m.hearts--; p.m.inv = now + 3000; m.stunUntil = now + 2000;
      if (p.m.hearts <= 0) {
        p.m.hearts = HEARTS; p.score = Math.max(0, p.score - 100);
        Object.assign(p.m, { x: T.start.x, y: T.start.y, check: { ...T.start } });
        line = `Mr. C got you! (Answer: ${q.choices[q.correct]}) Out of hearts, so back to the start (−100).`;
      } else {
        Object.assign(p.m, { x: p.m.check.x, y: p.m.check.y });
        line = `Ouch! (Answer: ${q.choices[q.correct]}) You lost a heart and ran back to your last gate.`;
      }
      event(ctx, `<span class="bad">😈 Mr. C got ${ctx.esc(p.name)}!</span>`);
      sfx('hit');
    }
  }
  place(ctx, p);
  ctx.send({ t: 'mres', to: p.id, ok, line, hp: p.m.hearts, score: p.score, bolts: p.m.bolts });
  renderBoard(ctx);
}

function finish(ctx, p) {
  const T = ctx.G.extra;
  p.m.finished = true; p.m.dir = null;
  p.m.place = ++T.finished;
  const bonus = Math.max(300, 1000 - 150 * (p.m.place - 1));
  p.score += bonus;
  place(ctx, p);
  ctx.send({ t: 'mres', to: p.id, ok: true, done: true, line: `You escaped the maze! #${p.m.place} (+${bonus})`, hp: p.m.hearts, score: p.score });
  event(ctx, `<span class="good">🏆 ${ctx.esc(p.name)} escaped! (#${p.m.place})</span>`);
  ctx.sfx('heal');
  renderBoard(ctx);
}

// ---------------- Movement ----------------
function tryMove(ctx, p, d) {
  const T = ctx.G.extra, [dx, dy] = DIRS[d], nx = p.m.x + dx, ny = p.m.y + dy;
  if (!T.g[ny] || T.g[ny][nx] !== 0) return;
  const gate = T.gateAt.get(key(nx, ny));
  if (gate && !p.m.unlocked.has(gate.id)) {
    if (performance.now() >= p.m.cool) ask(ctx, p, 'gate', { gate: gate.id });
    return;
  }
  p.m.x = nx; p.m.y = ny;
  const k = key(nx, ny);
  if (T.gems.has(k)) {
    T.gems.delete(k); p.score += 50;
    const gem = ctx.$(`#mzBoard .mz-gem[data-k="${k}"]`); if (gem) gem.remove();
    ctx.sfx('join'); renderBoard(ctx);
  }
  if (T.bolts.has(k) && p.m.bolts < 3) {
    T.bolts.delete(k); p.m.bolts++; p.score += 20;
    const bolt = ctx.$(`#mzBoard .mz-bolt[data-k="${k}"]`); if (bolt) bolt.remove();
    ctx.sfx('crit');
    ctx.send({ t: 'mres', to: p.id, ok: true, line: `⚡ You got a lightning bolt (${p.m.bolts})! Run into a Mr. C to zap him.`, hp: p.m.hearts, score: p.score, bolts: p.m.bolts });
  }
  place(ctx, p);
  if (nx === T.exit.x && ny === T.exit.y) finish(ctx, p);
}

function botThink(ctx, p) {
  const T = ctx.G.extra;
  if (Math.random() < 0.1) { p.m.dir = null; return; }
  let best = null, bestD = T.toExit[p.m.y][p.m.x];
  for (const [d, [dx, dy]] of Object.entries(DIRS)) {
    const nx = p.m.x + dx, ny = p.m.y + dy;
    if (T.g[ny] && T.g[ny][nx] === 0 && T.toExit[ny][nx] < bestD) { best = d; bestD = T.toExit[ny][nx]; }
  }
  p.m.dir = best; p.m.dirAt = performance.now();
}

function mrcStep(ctx, m, now) {
  const T = ctx.G.extra;
  if (m.busy || now < m.stunUntil || now - m.last < MRC_STEP_MS) return;
  m.last = now;
  const prey = ctx.players().filter(p => !p.m.finished && !p.m.busy && now >= p.m.inv);
  const dist = bfs(T, m.x, m.y);
  let target = null, td = 14;
  for (const p of prey) { const d = dist[p.m.y][p.m.x]; if (d < td) { td = d; target = p; } }
  let next = null;
  if (target) { const path = pathTo(T, m, target.m); next = path[0]; }
  else {
    const opts = Object.values(DIRS).map(([dx, dy]) => ({ x: m.x + dx, y: m.y + dy })).filter(t => T.g[t.y] && T.g[t.y][t.x] === 0);
    next = opts[Math.floor(Math.random() * opts.length)];
  }
  if (next) { m.x = next.x; m.y = next.y; placeMrc(T, m); }
}

function checkCatch(ctx, now) {
  const T = ctx.G.extra;
  for (const m of T.mrcs) {
    if (m.busy || now < m.stunUntil) continue;
    const p = ctx.players().find(p => !p.m.finished && !p.m.busy && now >= p.m.inv && p.m.x === m.x && p.m.y === m.y);
    if (!p) continue;
    m.busy = true;
    if (p.m.bolts > 0) {
      ctx.sfx('warning');
      event(ctx, `<span style="color:var(--gold)">⚡ ${ctx.esc(p.name)} is zapping Mr. C!</span>`);
      ask(ctx, p, 'zap', { mrc: m.id });
      continue;
    }
    ctx.sfx('roar');
    event(ctx, `<span class="bad">⚔ Mr. C caught ${ctx.esc(p.name)}! Battle!</span>`);
    ask(ctx, p, 'fight', { mrc: m.id });
  }
  for (const m of T.mrcs) placeMrc(T, m);
}

export default {
  id: 'maze',
  name: 'Mr. C’s Maze',
  blurb: 'Steer your hero with the arrows on your iPad! Answer questions to unlock gates, and bonk the wild Mr. C before he gets you. Escape for a big bonus.',
  scoreName: 'Points',
  scoreShort: 'pts',
  selfPaced: true,

  settings(ctx, el, persist) {
    const { S } = ctx;
    S.mazeSize = S.mazeSize || 'medium'; S.mazeMins = S.mazeMins || 6; S.mazeMrc = S.mazeMrc || 'auto'; S.mazeStyle = S.mazeStyle || 'classic';
    el.innerHTML = `<label>Maze style <select id="mzStyle"><option value="classic">Classic</option><option value="edison">⚡ Edison Mode</option></select></label>
      <p class="muted" style="margin:-6px 0 0;font-size:.8rem" id="mzStyleHint"></p>
      <label>Maze size <select id="mzSize"><option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option></select></label>
      <label>Time limit <select id="mzMins">${[3, 5, 6, 8, 10, 15].map(m => `<option value="${m}">${m} min</option>`).join('')}</select></label>
      <label>Wild Mr. C’s <select id="mzMrc"><option value="auto">Auto (1 per 10 players)</option><option value="1">1</option><option value="2">2</option><option value="3">3</option></select></label>`;
    const sz = el.querySelector('#mzSize'), mn = el.querySelector('#mzMins'), mr = el.querySelector('#mzMrc');
    sz.value = S.mazeSize; mn.value = S.mazeMins; mr.value = S.mazeMrc;
    sz.onchange = () => { S.mazeSize = sz.value; persist(); };
    mn.onchange = () => { S.mazeMins = +mn.value; persist(); };
    mr.onchange = () => { S.mazeMrc = mr.value; persist(); };
    const st = el.querySelector('#mzStyle'), hint = el.querySelector('#mzStyleHint');
    const showHint = () => (hint.textContent = S.mazeStyle === 'edison' ? 'Purple maze with ⚡ lightning bolts. Grab one and run into a Mr. C to zap him! (+1 extra Mr. C)' : '');
    st.value = S.mazeStyle; showHint();
    st.onchange = () => { S.mazeStyle = st.value; persist(); showHint(); };
  },

  mount(ctx) {
    ctx.stage.innerHTML = `<div class="mz-wrap"><div class="mz-board-wrap" id="mzBoardWrap"><div class="mz-board" id="mzBoard"></div></div>
      <div class="mz-side"><div class="card mz-timer-card"><div class="muted">TIME LEFT</div><div class="mz-timer" id="mzTimer">--:--</div><div class="muted" id="mzEscaped"></div></div>
      <div class="card cboard" id="mzSide"></div></div></div>`;
    ctx.G.extra = build(ctx);
    for (const p of ctx.players()) { p.m = {}; p.asked = 0; ensure(ctx, p); }
    drawBoard(ctx);
    renderBoard(ctx);
  },

  async start(ctx) {
    fitBoard(ctx);
    ctx.sfx('warning');
    ctx.later(() => ctx.sfx('roar'), 850);
    if (ctx.G.extra.edison) return ctx.intro(`<span style="color:#c77dff">⚡ EDISON MODE ⚡</span><br>The Mr. C’s are loose in the purple maze!<br><span style="font-size:.5em" class="muted">Grab lightning bolts and zap them! Answer questions to open gates.</span>`, 3400);
    await ctx.intro(`<span style="color:var(--bad)">!! WARNING !!</span><br>A wild Mr. C appeared in the maze!<br><span style="font-size:.5em" class="muted">Use the arrows on your iPad. Answer questions to open gates.</span>`, 3200);
  },

  // The game loop: runs until time is up or everyone has escaped.
  run(ctx) {
    const { G, S } = ctx, T = G.extra;
    T.endAt = performance.now() + (S.mazeMins || 6) * 60000;
    T.mrcs.forEach(m => (m.stunUntil = performance.now() + 4000));
    fitBoard(ctx);
    ctx.broadcast(); // tells every iPad how much time is left
    return new Promise(resolve => {
      const iv = setInterval(() => {
        const now = performance.now();
        const left = Math.max(0, T.endAt - now);
        const all = ctx.players();
        const done = all.filter(p => p.m.finished).length;
        const clock = `${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}`;
        ctx.setStatus(`⏱ ${clock} left · ${done} / ${all.length} escaped`);
        const tEl = ctx.$('#mzTimer');
        if (tEl) { tEl.textContent = clock; tEl.classList.toggle('urgent', left < 30000); ctx.$('#mzEscaped').textContent = `${done} / ${all.length} escaped`; }
        if (left <= 0 || (all.length && done === all.length)) { clearInterval(iv); resolve(); return; }
        for (const p of all) {
          ensure(ctx, p);
          if (p.m.finished || p.m.busy) continue;
          if (p.bot && now - (p.m.think || 0) >= STEP_MS * 1.7) { p.m.think = now; botThink(ctx, p); }
          if (p.m.dir && now - p.m.last >= STEP_MS && (p.bot || now - p.m.dirAt < 2600)) { p.m.last = now; tryMove(ctx, p, p.m.dir); }
          else if (performance.now() >= p.m.inv && ctx.heroEls.get(p.id)?.classList.contains('inv')) place(ctx, p);
        }
        for (const m of T.mrcs) mrcStep(ctx, m, now);
        checkCatch(ctx, now);
      }, 60);
      G.timers.push(iv);
    });
  },

  onMessage(ctx, m) {
    if (ctx.G.phase !== 'play') return;
    const p = ctx.G.players.get(m.id); if (!p) return;
    ensure(ctx, p);
    if (m.t === 'dir') { p.m.dir = DIRS[m.d] ? m.d : null; p.m.dirAt = performance.now(); }
    else if (m.t === 'mans') answer(ctx, p, m.k, m.c);
  },

  renderPlayers(ctx) { if (ctx.G.phase === 'play' || ctx.G.phase === 'intro') { fitBoard(ctx); if (ctx.heroEls.size !== ctx.players().length) drawBoard(ctx); renderBoard(ctx); } },
  addPlayer(ctx, p) { p.m = {}; p.asked = 0; ensure(ctx, p); drawBoard(ctx); renderBoard(ctx); },
  // A student who reloads gets their open question again.
  rejoin(ctx, p) {
    const b = p.m && p.m.busy; if (!b) return;
    const q = ctx.G.qs[b.qi];
    ctx.send({ t: 'mq', to: p.id, k: b.token, kind: b.kind, q: { prompt: q.prompt, choices: q.choices } });
  },

  publicState(ctx) { const T = ctx.G.extra; return T && T.endAt ? { left: Math.max(0, T.endAt - performance.now()) } : {}; },
  tag(ctx, p) { return p.m && p.m.hearts !== undefined ? '♥'.repeat(p.m.hearts) + '♡'.repeat(HEARTS - p.m.hearts) + (p.m.bolts ? ' ⚡' + p.m.bolts : '') : ''; },
  hud(ctx) { const T = ctx.G.extra; return T && T.finished !== undefined ? `${T.finished} escaped` : ''; },

  endInfo(ctx) {
    const list = ctx.ranked();
    const escaped = list.filter(p => p.m.finished).length;
    return { win: null, title: '🏁 Maze results', sub: `${escaped} of ${list.length} heroes escaped Mr. C’s maze!${list[0] ? ` Top score: ${list[0].name}.` : ''}` };
  },
};
