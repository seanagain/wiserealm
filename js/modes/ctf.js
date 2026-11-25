// Capture the Flag: Red (left half) vs Blue (right half). Sneak into the other half, grab their flag
// and carry it back to your own half to score. If you bump into an enemy on THEIR half, you must
// answer a question: right = you slip away (safe for a few seconds), wrong = their jail.
// In jail, answer 3 questions right to escape, or wait for a free teammate to reach the jail and
// break everyone out. Most captures when time runs out wins.
// Maps, movement, team picking and the iPad map are shared with Territory Battle.
import territory, { build, MAPS } from './territory.js';
import { TEAMS, mapSVG, encodeMap, encodeOwn, heroTag } from '../terview.js';

const STEP_MS = 200, SAFE_MS = 4000, JAIL_NEED = 3, TICK_MS = 1000;
const DIRS = { u: [0, -1], d: [0, 1], l: [-1, 0], r: [1, 0] };
const pct = (T, x, y) => ({ left: ((x + 0.5) / T.W) * 100 + '%', top: ((y + 0.5) / T.H) * 100 + '%' });
const sideOf = (T, x) => (x < T.W / 2 ? 1 : 2);
const enemy = t => 3 - t;

// ---------------- the field ----------------
function setup(ctx) {
  const T = build(ctx), { W, H } = T;
  const open = (x, y) => { T.rock[y][x] = false; T.kind[y][x] = ''; };
  const mid = Math.floor(H / 2);
  for (const t of [1, 2]) {
    const fx = t === 1 ? 1 : W - 2;
    T.flagHome = T.flagHome || {};
    T.flagHome[t] = { x: fx, y: mid };
    for (const [dx, dy] of [[0, 0], [0, -1], [0, 1], [1, 0], [-1, 0]]) { const x = fx + dx, y = mid + dy; if (x >= 0 && x < W) open(x, y); }
    // jail: a 2 x 2 cell in the team's top back corner (it holds the OTHER team's prisoners)
    const jx = t === 1 ? 0 : W - 2;
    T.jail = T.jail || {};
    T.jail[t] = { x: jx, y: 0, w: 2, h: 2 };
    for (let y = 0; y < 2; y++) for (let x = jx; x < jx + 2; x++) { open(x, y); T.deco[y][x] = ''; }
    open(t === 1 ? 2 : W - 3, 1); open(t === 1 ? 1 : W - 2, 2); // a way out of the corner
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) T.own[y][x] = sideOf(T, x);
  T.flags = { 1: { carrier: null }, 2: { carrier: null } };
  T.score = { 1: 0, 2: 0 };
  return T;
}
const inJail = (T, t, x, y) => { const j = T.jail[t]; return x >= j.x && x < j.x + j.w && y >= j.y && y < j.y + j.h; };
function spawn(T, team) {
  const xs = team === 1 ? [0, 1, 2] : [T.W - 1, T.W - 2, T.W - 3];
  for (let k = 0; k < 60; k++) {
    const x = xs[Math.floor(Math.random() * 3)], y = 2 + Math.floor(Math.random() * (T.H - 2));
    if (!T.rock[y][x] && !inJail(T, team, x, y)) return { x, y };
  }
  return { x: xs[0], y: T.H - 1 };
}
function teamSizes(ctx) { const s = [0, 0, 0]; for (const p of ctx.players()) if (p.m && p.m.team) s[p.m.team]++; return s; }
function ensure(ctx, p, team) {
  if (p.m && p.m.team) return;
  const T = ctx.G.extra, s = teamSizes(ctx);
  const chosen = ctx.S.terTeams && ctx.S.terTeams !== 'random' && (p.team === 1 || p.team === 2) ? p.team : 0;
  const t = team || chosen || (s[1] <= s[2] ? 1 : 2), at = spawn(T, t);
  p.m = { team: t, x: at.x, y: at.y, dir: null, dirAt: 0, last: 0, busy: null, safe: 0, jailed: false, jailRight: 0, qorder: [], caps: 0, tags: 0, frees: 0, tagCool: 0, role: Math.random() < 0.55 ? 'attack' : 'guard' };
  p.asked = p.asked || 0;
}

// ---------------- questions ----------------
function nextQ(ctx, p) {
  if (!p.m.qorder.length) {
    p.m.qorder = ctx.G.qs.map((_, i) => i);
    for (let i = p.m.qorder.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [p.m.qorder[i], p.m.qorder[j]] = [p.m.qorder[j], p.m.qorder[i]]; }
  }
  return p.m.qorder.pop();
}
function sendQ(ctx, p) {
  const b = p.m.busy; if (!b) return;
  const q = ctx.G.qs[b.qi];
  ctx.send({ t: 'mq', to: p.id, k: b.token, kind: b.kind, vs: b.vs || '', q: { prompt: q.prompt, choices: q.choices } });
}
function ask(ctx, p, kind, extra = {}) {
  const qi = nextQ(ctx, p), token = Math.random().toString(36).slice(2, 9);
  p.m.busy = { kind, token, qi, ...extra };
  p.m.dir = null;
  sendQ(ctx, p); place(ctx, p);
  if (p.bot) { const q = ctx.G.qs[qi]; ctx.later(() => answer(ctx, p, token, Math.random() < p.skill ? q.correct : (q.correct + 1) % q.choices.length), 1000 + Math.random() * 3000); }
}
function track(ctx, p, qi, ok) {
  const q = ctx.G.qs[qi];
  if (!p.bot) { const st = ctx.G.qstats[qi] || (ctx.G.qstats[qi] = { p: q.prompt, a: q.choices[q.correct], n: 0, r: 0 }); st.n++; if (ok) st.r++; }
  p.asked++; p.answered = (p.answered || 0) + 1;
  if (ok) { p.correct++; p.streak++; } else { p.streak = 0; (p.missed = p.missed || []).push(qi); }
}
const teamTag = p => (p.m && p.m.team ? `${TEAMS[p.m.team].emoji} ${TEAMS[p.m.team].name} team${p.m.jailed ? ' · ⛓ jail' : ''}` : '');
const res = (ctx, p, ok, line) => ctx.send({ t: 'mres', to: p.id, ok, line, score: p.score, tag: teamTag(p) });
const event = (ctx, html) => ctx.setRoundMsg(html);

function answer(ctx, p, token, c) {
  const b = p.m.busy;
  if (!b || b.token !== token) return;
  const T = ctx.G.extra, q = ctx.G.qs[b.qi], ok = Number(c) === q.correct, now = performance.now();
  track(ctx, p, b.qi, ok);
  p.m.busy = null; p.m.jailAskAt = now; // (the next jail question comes after a short pause)
  const right = `(Answer: ${q.choices[q.correct]})`;
  if (b.kind === 'tag') {
    const tagger = ctx.G.players.get(b.by);
    if (ok) {
      p.score += 20; p.m.safe = now + SAFE_MS;
      res(ctx, p, true, `Correct! +20. You slipped away! Safe for ${SAFE_MS / 1000} seconds.`);
      ctx.sfx('reveal');
    } else {
      sendToJail(ctx, p);
      if (tagger) { tagger.score += 50; tagger.m.tags++; }
      res(ctx, p, false, `Caught! ${right} You’re in jail: answer ${JAIL_NEED} right to escape.`);
      event(ctx, `<span style="color:${TEAMS[enemy(p.m.team)].css}">⛓ ${ctx.esc(tagger ? tagger.name : 'A guard')} caught ${ctx.esc(p.name)}!</span>`);
      ctx.sfx('bad');
      ctx.later(() => { if (p.m.jailed && !p.m.busy) ask(ctx, p, 'jail', { vs: `0/${JAIL_NEED}` }); }, 900);
    }
  } else if (b.kind === 'jail') {
    if (!p.m.jailed) return;
    if (ok) {
      p.m.jailRight++;
      if (p.m.jailRight >= JAIL_NEED) {
        p.score += 40; release(ctx, p);
        res(ctx, p, true, `Correct! You escaped from jail! +40. Back to base.`);
        event(ctx, `<span class="good">🔓 ${ctx.esc(p.name)} escaped from jail!</span>`);
        ctx.sfx('heal');
      } else {
        res(ctx, p, true, `Correct! ${p.m.jailRight}/${JAIL_NEED} to escape.`);
        ctx.later(() => { if (p.m.jailed && !p.m.busy) ask(ctx, p, 'jail', { vs: `${p.m.jailRight}/${JAIL_NEED}` }); }, 700);
      }
    } else {
      res(ctx, p, false, `Not quite ${right}. Still ${p.m.jailRight}/${JAIL_NEED}. Next question soon…`);
      ctx.later(() => { if (p.m.jailed && !p.m.busy) ask(ctx, p, 'jail', { vs: `${p.m.jailRight}/${JAIL_NEED}` }); }, 2200);
    }
  }
  place(ctx, p); renderSide(ctx);
}

function dropFlag(ctx, p) {
  const T = ctx.G.extra;
  for (const t of [1, 2]) if (T.flags[t].carrier === p.id) {
    T.flags[t].carrier = null;
    event(ctx, `<span class="muted">⚑ The ${TEAMS[t].name} flag went back home.</span>`);
  }
}
function sendToJail(ctx, p) {
  const T = ctx.G.extra, j = T.jail[enemy(p.m.team)];
  dropFlag(ctx, p);
  const k = ctx.players().filter(q => q.m && q.m.jailed && q.m.team === p.m.team).length;
  Object.assign(p.m, { jailed: true, jailRight: 0, x: j.x + (k % 2), y: j.y + (Math.floor(k / 2) % 2), dir: null });
}
function release(ctx, p) {
  const T = ctx.G.extra, at = spawn(T, p.m.team);
  Object.assign(p.m, { jailed: false, jailRight: 0, busy: null, x: at.x, y: at.y, safe: performance.now() + SAFE_MS, dir: null });
  place(ctx, p);
}

// ---------------- moving and the rules ----------------
function tryMove(ctx, p, d) {
  const T = ctx.G.extra, [dx, dy] = DIRS[d], nx = p.m.x + dx, ny = p.m.y + dy;
  if (nx < 0 || ny < 0 || nx >= T.W || ny >= T.H || T.rock[ny][nx]) return;
  if (inJail(T, p.m.team, nx, ny)) return; // your own jail is for the other team
  p.m.x = nx; p.m.y = ny;
  afterMove(ctx, p);
  place(ctx, p);
}
function afterMove(ctx, p) {
  const T = ctx.G.extra, t = p.m.team, o = enemy(t), now = performance.now();
  // grab the enemy flag
  const ef = T.flags[o], home = T.flagHome[o];
  if (!ef.carrier && p.m.x === home.x && p.m.y === home.y) {
    ef.carrier = p.id; p.score += 30;
    event(ctx, `<span style="color:${TEAMS[t].css}">⚑ ${ctx.esc(p.name)} grabbed the ${TEAMS[o].name} flag!</span>`);
    ctx.sfx('crit');
    ctx.send({ t: 'mres', to: p.id, ok: true, line: `You’ve got the ${TEAMS[o].name} flag! Run back to your side!`, score: p.score, tag: teamTag(p) });
  }
  // bring it home: back on your own half = a capture
  if (ef.carrier === p.id && sideOf(T, p.m.x) === t) {
    ef.carrier = null; T.score[t]++; p.m.caps++; p.score += 200;
    for (const q of ctx.players()) if (q !== p && q.m.team === t) q.score += 30;
    event(ctx, `<span style="color:${TEAMS[t].css};font-size:1.2em">🏆 ${ctx.esc(p.name)} CAPTURED the ${TEAMS[o].name} flag! ${TEAMS[1].emoji} ${T.score[1]} – ${T.score[2]} ${TEAMS[2].emoji}</span>`);
    ctx.sfx('crit'); ctx.confetti();
    ctx.send({ t: 'mres', to: p.id, ok: true, line: `🏆 CAPTURE! +200 for you, +30 for your team!`, score: p.score, tag: teamTag(p) });
  }
  // jailbreak: reach the enemy jail to free your teammates
  if (inJail(T, o, p.m.x, p.m.y)) {
    const freed = ctx.players().filter(q => q !== p && q.m.jailed && q.m.team === t);
    if (freed.length) {
      for (const q of freed) { release(ctx, q); res(ctx, q, true, `🔓 ${p.name} broke you out of jail!`); }
      p.score += 60; p.m.frees += freed.length; p.m.safe = now + SAFE_MS;
      const at = spawn(T, t); p.m.x = at.x; p.m.y = at.y;
      event(ctx, `<span class="good">🔓 JAILBREAK! ${ctx.esc(p.name)} freed ${freed.length} teammate${freed.length > 1 ? 's' : ''}!</span>`);
      ctx.sfx('heal');
      ctx.send({ t: 'mres', to: p.id, ok: true, line: `🔓 Jailbreak! You freed ${freed.length}! +60`, score: p.score, tag: teamTag(p) });
    }
  }
}
// Tagging: an intruder (on the other team's half) next to a defender (on their own half).
function checkTags(ctx, now) {
  const T = ctx.G.extra, all = ctx.players().filter(p => p.m && !p.m.jailed);
  for (const a of all) {
    if (a.m.busy || now < a.m.safe || sideOf(T, a.m.x) === a.m.team) continue; // not an intruder right now
    for (const d of all) {
      if (d.m.team === a.m.team || d.m.busy || sideOf(T, d.m.x) !== d.m.team || now < d.m.tagCool) continue;
      if (Math.abs(a.m.x - d.m.x) + Math.abs(a.m.y - d.m.y) > 1) continue;
      d.m.tagCool = now + 1500;
      ask(ctx, a, 'tag', { by: d.id, vs: d.name });
      event(ctx, `<span class="bad">🚨 ${ctx.esc(d.name)} tagged ${ctx.esc(a.name)}! Answer or go to jail…</span>`);
      ctx.sfx('roar');
      break;
    }
  }
}
// Bots: attackers go for the flag (and bring it home), guards stay on their side near the middle.
function botThink(ctx, p) {
  const T = ctx.G.extra, t = p.m.team, o = enemy(t);
  if (Math.random() < 0.15) { p.m.dir = Object.keys(DIRS)[Math.floor(Math.random() * 4)]; p.m.dirAt = performance.now(); return; }
  let goal;
  if (T.flags[o].carrier === p.id) goal = { x: t === 1 ? 1 : T.W - 2, y: p.m.y };
  else if (p.m.role === 'attack') {
    const jailed = ctx.players().some(q => q.m.jailed && q.m.team === t);
    goal = jailed && Math.random() < 0.5 ? T.jail[o] : T.flagHome[o];
  } else goal = { x: t === 1 ? Math.floor(T.W / 2) - 2 : Math.floor(T.W / 2) + 1, y: Math.floor(Math.random() * T.H) };
  const opts = Object.entries(DIRS).filter(([, [dx, dy]]) => { const x = p.m.x + dx, y = p.m.y + dy; return x >= 0 && y >= 0 && x < T.W && y < T.H && !T.rock[y][x] && !inJail(T, t, x, y); });
  if (!opts.length) return;
  opts.sort((a, b) => (Math.abs(p.m.x + a[1][0] - goal.x) + Math.abs(p.m.y + a[1][1] - goal.y)) - (Math.abs(p.m.x + b[1][0] - goal.x) + Math.abs(p.m.y + b[1][1] - goal.y)));
  p.m.dir = (Math.random() < 0.8 ? opts[0] : opts[Math.floor(Math.random() * opts.length)])[0];
  p.m.dirAt = performance.now();
}

// ---------------- projector drawing ----------------
const FLAG_SVG = c => `<svg viewBox="0 0 10 12" shape-rendering="crispEdges"><rect x="1" y="0" width="1.2" height="12" fill="#5a3a24"/><rect x="2" y="0.5" width="7" height="5" fill="${c}" stroke="#1b1430" stroke-width=".6"/><rect x="3" y="2" width="2" height="1.2" fill="#fff" opacity=".6"/></svg>`;
function fitBoard(ctx) {
  const T = ctx.G.extra, wrap = ctx.$('#mzBoardWrap'), board = ctx.$('#mzBoard');
  if (!wrap || !board) return;
  const r = wrap.getBoundingClientRect(), ratio = T.W / T.H, w = Math.max(200, Math.min(r.width, r.height * ratio));
  board.style.width = w + 'px'; board.style.height = w / ratio + 'px';
}
function drawBoard(ctx) {
  const { $, G, esc, heroEls, avatarSVG, players } = ctx, T = G.extra, board = $('#mzBoard');
  fitBoard(ctx);
  const jail = t => { const j = T.jail[t], a = pct(T, j.x, j.y); return `<div class="cf-jail" style="left:${a.left};top:${a.top};width:${(200 / T.W)}%;height:${(200 / T.H)}%">⛓ ${TEAMS[t].name} jail</div>`; };
  board.innerHTML = mapSVG(T, 'cf') + `<div class="cf-mid"></div>${jail(1)}${jail(2)}` +
    [1, 2].map(t => `<div class="cf-flag" id="cfFlag${t}">${FLAG_SVG(TEAMS[t].color)}</div>`).join('');
  board.style.setProperty('--tile', (100 / T.W) + '%');
  heroEls.clear();
  for (const p of players()) {
    ensure(ctx, p);
    const el = document.createElement('div');
    el.className = 'mz-hero ter-hero team' + p.m.team; el.dataset.id = p.id;
    el.innerHTML = `<div class="av-wrap">${avatarSVG(p.av)}</div><div class="nm">${esc(p.name)}</div><div class="cf-carry"></div>`;
    board.append(el); heroEls.set(p.id, el);
    place(ctx, p);
  }
  placeFlags(ctx);
}
function place(ctx, p) {
  const T = ctx.G.extra, el = ctx.heroEls.get(p.id); if (!el) return;
  const h = [...p.id].reduce((a, c) => a + c.charCodeAt(0), 0);
  const pos = pct(T, p.m.x + ((h % 5) - 2) * 0.08, p.m.y + ((Math.floor(h / 5) % 3) - 1) * 0.06);
  el.style.left = pos.left; el.style.top = pos.top;
  const now = performance.now();
  el.classList.toggle('busy', !!p.m.busy); el.classList.toggle('fight', !!(p.m.busy && p.m.busy.kind === 'tag'));
  el.classList.toggle('inv', now < p.m.safe); el.classList.toggle('jailed', !!p.m.jailed);
  const carrying = [1, 2].find(t => T.flags[t].carrier === p.id);
  el.querySelector('.cf-carry').innerHTML = carrying ? FLAG_SVG(TEAMS[carrying].color) : '';
  placeFlags(ctx);
}
function placeFlags(ctx) {
  const T = ctx.G.extra;
  for (const t of [1, 2]) {
    const el = ctx.$('#cfFlag' + t); if (!el) continue;
    el.hidden = !!T.flags[t].carrier;
    const a = pct(T, T.flagHome[t].x, T.flagHome[t].y); el.style.left = a.left; el.style.top = a.top;
  }
  const bar = ctx.$('#cfScore');
  if (bar) bar.innerHTML = `<span class="r">${TEAMS[1].emoji} Red <b>${T.score[1]}</b></span><span class="vs">captures</span><span class="b"><b>${T.score[2]}</b> Blue ${TEAMS[2].emoji}</span>`;
}
function renderSide(ctx) {
  const { $, esc, fmt } = ctx, T = ctx.G.extra, side = $('#mzSide'); if (!side) return;
  placeFlags(ctx);
  const list = team => ctx.ranked().filter(p => p.m && p.m.team === team).slice(0, 6)
    .map(p => `<div class="brow"><span>${p.m.jailed ? '⛓ ' : T.flags[enemy(team)].carrier === p.id ? '⚑ ' : ''}${esc(p.name)}</span><b>${fmt(p.score)}</b></div>`).join('') || '<div class="muted">-</div>';
  side.innerHTML = `<h3 style="color:${TEAMS[1].css}">🟥 Red team</h3>${list(1)}<h3 style="color:${TEAMS[2].css};margin-top:12px">🟦 Blue team</h3>${list(2)}
    <div class="muted" style="font-size:.8rem;line-height:1.6;margin-top:12px">⚑ Grab their flag and run back to your side.<br>🚨 Tagged on their side? Answer right or go to jail.<br>⛓ In jail: 3 right answers to escape, or a teammate breaks you out.</div>`;
}

// ---------------- the iPad map (same as Territory Battle, plus flags and jails) ----------------
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
  T.mapAt = now; syncRoster(ctx);
  ctx.send({ t: 'tmap', v: T.ver, free: true, ...encodeMap(T), pl: T.roster.map(p => [heroTag(ctx.code, p.id), p.name, p.m ? p.m.team : 0, p.av]) });
  T.tickSig = '';
}
function tick(ctx, now) {
  const T = ctx.G.extra;
  if (!padsOn(ctx) || !ctx.players().some(p => !p.bot)) return;
  if (syncRoster(ctx)) sendMap(ctx, true);
  const ps = T.roster.map(p => (p.m && p.m.team ? [p.m.x, p.m.y, (p.m.busy || p.m.jailed ? 1 : 0) | (p.m.jailed ? 2 : 0) | (now < p.m.safe ? 4 : 0), 9] : [-9, -9, 0, 0]));
  const mk = [1, 2].flatMap(t => {
    const c = T.flags[t].carrier && ctx.G.players.get(T.flags[t].carrier), f = c ? [c.m.x, c.m.y] : [T.flagHome[t].x, T.flagHome[t].y];
    return [['f' + t, f[0], f[1]], ['j' + t, T.jail[t].x + 0.5, T.jail[t].y + 0.5]];
  });
  const o = encodeOwn(T), sig = JSON.stringify([ps, mk]);
  if (sig === T.tickSig && now - (T.tickAt || 0) < 5000) return;
  T.tickSig = sig; T.tickAt = now;
  ctx.send({ t: 'tt', v: T.ver, o, p: ps, mk });
}

export default {
  id: 'ctf',
  name: 'Capture the Flag',
  blurb: 'Red vs Blue! Sneak onto the other side, grab their flag and run it home. Get tagged on their side and you must answer: wrong means jail. In jail, answer 3 right to escape, or wait for a jailbreak.',
  scoreName: 'Points',
  scoreShort: 'pts',
  selfPaced: true,

  settings(ctx, el, persist) {
    const { S } = ctx;
    S.ctfMins = S.ctfMins || 5; S.terSize = S.terSize || 'auto'; S.terMap = S.terMap || 'country';
    if (S.terPads === undefined) S.terPads = true;
    S.terTeams = S.terTeams || 'random';
    el.innerHTML = `<label>Time limit <select id="cfMins">${[3, 4, 5, 6, 8, 10].map(m => `<option value="${m}">${m} min</option>`).join('')}</select></label>
      <label>Battlefield <select id="cfMap">${Object.entries(MAPS).map(([k, m]) => `<option value="${k}">${m.name}</option>`).join('')}<option value="random">Surprise me</option></select></label>
      <label>Field size <select id="cfSize"><option value="auto">Auto (by players)</option><option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option></select></label>
      <label>Teams <select id="cfTeams"><option value="random">Random (at start)</option><option value="pick">Students pick</option><option value="teacher">I’ll choose</option></select></label>
      <label title="Each student sees the map and their own hero on their iPad">Map on iPads <input type="checkbox" id="cfPads"></label>`;
    const pick = (id, key, num) => { const s = el.querySelector(id); s.value = S[key]; s.onchange = () => { S[key] = num ? +s.value : s.value; persist(); if (key === 'terTeams') ctx.lobbyChanged(); }; };
    pick('#cfMins', 'ctfMins', true); pick('#cfMap', 'terMap'); pick('#cfSize', 'terSize'); pick('#cfTeams', 'terTeams');
    const pads = el.querySelector('#cfPads'); pads.checked = S.terPads !== false; pads.onchange = () => { S.terPads = pads.checked; persist(); };
  },

  mount(ctx) {
    ctx.stage.innerHTML = `<div class="mz-wrap"><div style="display:flex;flex-direction:column;gap:10px;min-height:0">
        <div class="cf-score" id="cfScore"></div>
        <div class="mz-board-wrap" id="mzBoardWrap" style="flex:1"><div class="mz-board ter-board cf-board" id="mzBoard"></div></div></div>
      <div class="mz-side"><div class="card mz-timer-card"><div class="muted">TIME LEFT</div><div class="mz-timer" id="mzTimer">--:--</div></div>
      <div class="card cboard" id="mzSide"></div></div></div>`;
    ctx.G.extra = setup(ctx);
    const list = ctx.players().slice();
    for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
    for (const p of list) p.m = {};
    if ((ctx.S.terTeams || 'random') === 'random') list.forEach((p, i) => ensure(ctx, p, (i % 2) + 1));
    else { for (const p of list) if (p.team === 1 || p.team === 2) ensure(ctx, p, p.team); for (const p of list) ensure(ctx, p); }
    drawBoard(ctx); renderSide(ctx);
  },

  async start(ctx) {
    fitBoard(ctx);
    ctx.broadcast(); sendMap(ctx, true);
    ctx.sfx('warning');
    await ctx.intro(`<span style="color:var(--bad)">🟥 RED</span> vs <span style="color:#4cc9f0">BLUE 🟦</span><br>CAPTURE THE FLAG!<br><span style="font-size:.5em" class="muted">Grab their ⚑ flag and run it home. Tagged on their side? Answer or go to jail!</span>`, 3600);
  },

  run(ctx) {
    const { G, S } = ctx, T = G.extra;
    T.endAt = performance.now() + (S.ctfMins || 5) * 60000;
    fitBoard(ctx); ctx.broadcast();
    let lastSide = 0, lastTick = 0;
    return new Promise(resolve => {
      const iv = setInterval(() => {
        const now = performance.now(), left = Math.max(0, T.endAt - now);
        const clock = `${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}`;
        ctx.setStatus(`⏱ ${clock} left · 🟥 ${T.score[1]} – ${T.score[2]} 🟦`);
        const tEl = ctx.$('#mzTimer'); if (tEl) { tEl.textContent = clock; tEl.classList.toggle('urgent', left < 30000); }
        if (left <= 0) { clearInterval(iv); resolve(); return; }
        for (const p of ctx.players()) {
          ensure(ctx, p);
          if (p.m.jailed) { // make sure prisoners always have a question to work on
            if (!p.m.busy && now - (p.m.jailAskAt || 0) > 3500) { p.m.jailAskAt = now; ask(ctx, p, 'jail', { vs: `${p.m.jailRight}/${JAIL_NEED}` }); }
            continue;
          }
          if (p.m.busy) continue;
          if (p.bot && now - (p.m.think || 0) >= STEP_MS * 2) { p.m.think = now; botThink(ctx, p); }
          const carrier = [1, 2].some(t => T.flags[t].carrier === p.id), step = carrier ? STEP_MS * 1.25 : STEP_MS; // the flag is heavy!
          if (p.m.dir && now - p.m.last >= step && (p.bot || now - p.m.dirAt < 2600)) { p.m.last = now; tryMove(ctx, p, p.m.dir); }
          else if (ctx.heroEls.get(p.id)?.classList.contains('inv') && now >= p.m.safe) place(ctx, p);
        }
        checkTags(ctx, now);
        if (now - lastTick >= TICK_MS) { lastTick = now; tick(ctx, now); }
        if (now - lastSide > 800) { lastSide = now; renderSide(ctx); }
      }, 60);
      G.timers.push(iv);
    });
  },

  // teams in the lobby work exactly like Territory Battle
  lobbyPanel: territory.lobbyPanel,
  lobbyTeam: territory.lobbyTeam,
  onMessage(ctx, m) {
    if (ctx.G.phase === 'lobby') return territory.onMessage(ctx, m);
    if (ctx.G.phase !== 'play') return;
    const p = ctx.G.players.get(m.id); if (!p) return;
    ensure(ctx, p);
    if (m.t === 'dir') { if (!p.m.jailed) { p.m.dir = DIRS[m.d] ? m.d : null; p.m.dirAt = performance.now(); } }
    else if (m.t === 'mans') answer(ctx, p, m.k, m.c);
    else if (m.t === 'tneed') sendMap(ctx);
  },
  renderPlayers(ctx) { if (ctx.G.phase === 'play' || ctx.G.phase === 'intro') { fitBoard(ctx); if (ctx.heroEls.size !== ctx.players().length) drawBoard(ctx); renderSide(ctx); } },
  addPlayer(ctx, p) { p.m = {}; p.asked = 0; ensure(ctx, p); drawBoard(ctx); renderSide(ctx); },
  rejoin(ctx, p) { if (p.m && p.m.busy) sendQ(ctx, p); },
  publicState(ctx) {
    if (ctx.G.phase === 'lobby') return territory.publicState(ctx);
    const T = ctx.G.extra;
    return T && T.endAt ? { left: Math.max(0, T.endAt - performance.now()), pads: padsOn(ctx) } : { pads: padsOn(ctx) };
  },
  tag(ctx, p) { return teamTag(p); },
  hud(ctx) { const T = ctx.G.extra; return T && T.score ? `🟥 ${T.score[1]} – ${T.score[2]} 🟦` : ''; },

  endInfo(ctx) {
    const T = ctx.G.extra, s = T.score;
    const title = s[1] === s[2] ? `🤝 It’s a tie, ${s[1]}–${s[2]}!` : s[1] > s[2] ? `🟥 Red team wins ${s[1]}–${s[2]}!` : `🟦 Blue team wins ${s[2]}–${s[1]}!`;
    const mvp = ctx.ranked()[0];
    return { win: null, title, sub: `Flag captures: Red ${s[1]} · Blue ${s[2]}.${mvp ? ` MVP: ${mvp.name}.` : ''}` };
  },
};
