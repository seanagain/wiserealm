// Treasure Hunt: answer correctly to earn a dig. Diggers pick a spot on the shared island
// from their iPads; it might hide gold, a gem, a chest... or a trap. Luck keeps it close!
import { makeGrid, paint, gridRects } from '../avatar.js';

const W = 10, H = 6;
const DIG_MS = 12000;

const ICONS = {
  C: { pal: { K: '#2a1a0e', B: '#8b5a2b', b: '#6b4226', G: '#ffd23f' }, rows: ['.KKKKKK.', 'KBBBBBBK', 'KbbbbbbK', 'KGGGGGGK', 'KBBGGBBK', 'KBBBBBBK', 'KbbbbbbK', '.KKKKKK.'] },
  G: { pal: { K: '#0b2a4a', B: '#4cc9f0', b: '#1e88e5', W: '#e3f8ff' }, rows: ['..KKKK..', '.KWBBbK.', 'KWBBBBbK', 'KBBBBBbK', '.KBBBbK.', '..KBbK..', '...KK...', '........'] },
  g: { pal: { K: '#6b4a00', Y: '#ffd23f', y: '#e0a800', W: '#fff3b0' }, rows: ['..KKKK..', '.KYYYYK.', 'KYWYYyyK', 'KYYYYyyK', 'KYYYyyyK', 'KyYyyyyK', '.KyyyyK.', '..KKKK..'] },
  T: { pal: { K: '#1a1226', W: '#eeeeee', w: '#b8b8c8', R: '#e63946' }, rows: ['.KKKKKK.', 'KWWWWWWK', 'KWKWWKWK', 'KWKWWKWK', 'KWWWWWWK', '.KwWWwK.', '.KWKKWK.', '..KKKK..'] },
  '.': { pal: { D: '#5c4022', d: '#3e2a15' }, rows: ['........', '..DDDD..', '.DddddD.', '.DddddD.', '.DddddD.', '..DDDD..', '........', '........'] },
};
const iconSVG = t => { const g = makeGrid(8, 8); paint(g, ICONS[t], ICONS[t].pal); return `<svg viewBox="0 0 8 8" shape-rendering="crispEdges">${gridRects(g)}</svg>`; };
const NAMES = { C: 'a treasure chest', G: 'a gem', g: 'gold', T: 'a trap', '.': 'nothing' };

function newIsland() {
  const bag = [...'CCC', ...'GGGGGGGG', ...'g'.repeat(26), ...'.'.repeat(17), ...'TTTTTT'];
  for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
  return bag.map(t => ({ t, v: t === 'C' ? 200 : t === 'G' ? 100 : t === 'g' ? 30 + 5 * Math.floor(Math.random() * 7) : t === 'T' ? -50 : 0, dug: false }));
}

function renderIsland(ctx) {
  const T = ctx.G.extra;
  ctx.$('#island').innerHTML = T.tiles.map((tile, i) =>
    `<div class="tile ${tile.dug ? 'dug' : ''}" data-i="${i}">${tile.dug ? iconSVG(tile.t) : `<span class="tnum">${i + 1}</span>`}</div>`).join('');
}

function renderBoard(ctx) {
  const { $, esc, fmt } = ctx;
  const top = ctx.ranked().slice(0, 8);
  $('#tboard').innerHTML = `<h3>Richest pirates</h3>` + top.map((p, i) =>
    `<div class="brow"><span>${i + 1}. ${esc(p.name)}</span><b>${fmt(p.score)}</b></div>`).join('');
}

function undug(T) { return T.tiles.map((t, i) => (t.dug ? -1 : i)).filter(i => i >= 0); }

function dig(ctx, p, idx) {
  const { G, $, fmt, floatText, sfx } = ctx, T = G.extra;
  if (!T.diggers.has(p.id) || T.picks.has(p.id)) return;
  let i = Number(idx);
  if (!Number.isInteger(i) || !T.tiles[i] || T.tiles[i].dug) {
    const free = undug(T);
    if (!free.length) return;
    i = free[Math.floor(Math.random() * free.length)];
  }
  const tile = T.tiles[i];
  tile.dug = true;
  T.picks.set(p.id, i);
  const before = p.score;
  p.score = Math.max(0, p.score + tile.v);
  const gained = p.score - before;
  T.digRes[p.id] = tile.t === 'T' ? `Oh no, a trap! You lost ${fmt(-gained)} gold.` : tile.t === '.' ? 'You dug... nothing. Better luck next time!' : `You found ${NAMES[tile.t]}! +${fmt(gained)} gold`;
  const el = $(`#island .tile[data-i="${i}"]`);
  if (el) {
    el.classList.add('dug', 'pop');
    el.innerHTML = iconSVG(tile.t) + `<span class="who">${ctx.esc(p.name)}</span>`;
    const rect = el.getBoundingClientRect(), box = $('#island').getBoundingClientRect();
    const x = ((rect.left + rect.width / 2 - box.left) / box.width) * 100, y = ((rect.top - box.top) / box.height) * 100;
    if (tile.t !== '.') floatText($('#island'), (gained >= 0 ? '+' : '') + fmt(gained), tile.t === 'T' ? '' : tile.t === 'C' ? 'crit' : 'heal', x - 4, y);
  }
  sfx(tile.t === 'T' ? 'bad' : tile.t === 'C' ? 'crit' : tile.t === '.' ? 'tick' : 'join');
  renderBoard(ctx);
}

export default {
  id: 'treasure',
  name: 'Treasure Hunt',
  blurb: 'Answer right to earn a dig! Pick a spot on the island to find gold, gems and chests. Watch out for traps!',
  scoreName: 'Gold',
  scoreShort: 'gold',

  mount(ctx) {
    ctx.stage.innerHTML = `<div class="twrap"><div class="island-wrap"><div class="island" id="island" style="--tw:${W};--th:${H}"></div></div>
      <div class="card cboard" id="tboard"></div></div>`;
    ctx.G.extra = { tiles: newIsland(), diggers: new Set(), picks: new Map(), digRes: {}, islands: 1 };
    renderIsland(ctx);
    renderBoard(ctx);
  },

  async start(ctx) {
    ctx.sfx('start');
    await ctx.intro(`<span style="color:var(--gold)">TREASURE HUNT</span><br><span style="font-size:.5em" class="muted">Answer right to earn a dig!</span>`, 2400);
  },

  renderPlayers(ctx) { renderBoard(ctx); },
  addPlayer(ctx) { renderBoard(ctx); },

  reveal(ctx, q, results) {
    const T = ctx.G.extra, res = {};
    T.diggers = new Set(); T.picks = new Map(); T.digRes = {};
    for (const r of results) {
      if (r.correct) T.diggers.add(r.p.id);
      if (!r.p.bot && r.a) res[r.p.id] = [r.a.c, 0, r.correct ? 'You earned a dig! Get ready to pick a spot.' : ''];
    }
    const n = T.diggers.size;
    ctx.setRoundMsg(n ? `<span class="good">${n} digger${n === 1 ? '' : 's'}!</span>` : '<span class="bad">No diggers this round…</span>');
    if (!n) ctx.sfx('bad');
    return { res, note: n ? 'Diggers get to pick a spot next!' : 'Nobody got a dig this time.', duration: 1800 };
  },

  async afterReveal(ctx) {
    const { G, later, broadcast, wait, esc } = ctx, T = G.extra;
    if (!T.diggers.size) return;
    G.phase = 'dig';
    T.digStart = performance.now();
    ctx.setStatus(`⛏ Dig time! ${[...T.diggers].map(id => esc(G.players.get(id)?.name || '')).join(', ')}`);
    ctx.sfx('warning');
    broadcast();
    for (const id of T.diggers) {
      const p = G.players.get(id);
      if (p && p.bot) later(() => { const f = undug(T); dig(ctx, p, f[Math.floor(Math.random() * f.length)]); }, 1500 + Math.random() * 6000);
    }
    await new Promise(resolve => {
      const iv = setInterval(() => {
        const left = DIG_MS - (performance.now() - T.digStart);
        ctx.$('#ringNum').textContent = Math.max(0, Math.ceil(left / 1000));
        if (T.picks.size >= T.diggers.size || left <= 0) { clearInterval(iv); resolve(); }
      }, 200);
      G.timers.push(iv);
      ctx.$('#ring').style.visibility = 'visible';
    });
    ctx.$('#ring').style.visibility = 'hidden';
    // Anyone who didn't choose gets a random spot.
    for (const id of T.diggers) if (!T.picks.has(id)) { const p = G.players.get(id); if (p) dig(ctx, p, -1); }
    G.phase = 'dug';
    ctx.setStatus('');
    broadcast();
    await wait(1600);
    if (undug(T).length < T.tiles.length * 0.3) {
      T.tiles = newIsland(); T.islands++;
      await ctx.intro(`<span style="color:var(--gold)">A NEW ISLAND APPEARS!</span>`, 1800);
      renderIsland(ctx);
    }
  },

  onMessage(ctx, m) {
    if (m.t !== 'dig' || ctx.G.phase !== 'dig') return;
    const p = ctx.G.players.get(m.id);
    if (p) dig(ctx, p, m.tile);
  },

  publicState(ctx) {
    const { G } = ctx, T = G.extra;
    if (!T || !T.tiles) return {};
    if (G.phase === 'dig') {
      return { dig: { w: W, h: H, dug: T.tiles.map(t => (t.dug ? 'x' : '.')).join(''), diggers: [...T.diggers].filter(id => !G.players.get(id)?.bot),
        remain: Math.max(0, DIG_MS - (performance.now() - T.digStart)), limit: DIG_MS } };
    }
    if (G.phase === 'dug') return { dres: T.digRes };
    return {};
  },

  hud(ctx) { const T = ctx.G.extra; return T && T.tiles ? `${undug(T).length} spots left` : ''; },

  endInfo(ctx) {
    const list = ctx.ranked();
    const total = list.reduce((s, p) => s + p.score, 0);
    return { win: null, title: '💰 Treasure tally', sub: `Your crew found ${ctx.fmt(total)} gold!${list[0] ? ` Richest pirate: ${list[0].name}.` : ''}` };
  },
};
