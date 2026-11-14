// Game host (projector). This tab runs the game: it checks answers, keeps score and
// (when the teacher is signed in) awards coins. Each game type lives in js/modes/.
import { $, $$, esc, show, load, save, fmt, CHOICE_STYLE } from './common.js';
import { getSet, buildQuestions, cleanItems } from './sets.js';
import { openRoom, isOnline } from './net.js';
import { accounts } from './supa.js';
import { avatarSVG, normalizeAvatar, avatarColor, randomAvatar } from './avatar.js';
import { sfx, isMuted, setMuted } from './sound.js';
import raid from './modes/raid.js';
import corners from './modes/corners.js';
import treasure from './modes/treasure.js';

export const MODES = { raid, corners, treasure };
const params = new URLSearchParams(location.search);
const set = getSet(params.get('set'));
const mode = MODES[params.get('game')] || raid;
const S = Object.assign({ time: 20, count: 0, auto: false, flip: false }, load('cq_host_settings', {}));
const code = String(10000 + Math.floor(Math.random() * 90000));
const joinBase = new URL('./', location.href).href;

const G = {
  phase: 'lobby', players: new Map(), kicked: new Set(),
  qs: [], qi: -1, answers: new Map(), qStart: 0, limit: 0,
  timers: [], tick: null, flow: 0, round: 0,
  reveal: null, end: null, coins: null, teacher: false, extra: {},
};
let net = null;
const heroEls = new Map();

// ---------------- Helpers shared with the game modes ----------------
function later(fn, ms) { const t = setTimeout(fn, ms); G.timers.push(t); return t; }
function clearTimers() { G.timers.forEach(clearTimeout); G.timers.forEach(clearInterval); G.timers = []; clearInterval(G.tick); G.tick = null; }
const wait = ms => new Promise(res => later(res, ms));
const playerList = () => [...G.players.values()];
const ranked = () => playerList().sort((a, b) => b.score - a.score || b.correct - a.correct);
const heroHTML = p => `<div class="av-wrap">${avatarSVG(p.av)}</div><div class="nm">${esc(p.name)}</div>`;

function floatText(container, text, cls = '', xPct = null, yPct = null) {
  const d = document.createElement('div');
  d.className = 'dmg ' + cls;
  d.textContent = text;
  d.style.left = (xPct ?? 25 + Math.random() * 50) + '%';
  d.style.top = (yPct ?? 15 + Math.random() * 40) + '%';
  container.append(d);
  setTimeout(() => d.remove(), 1100);
}

function sparks(x, y, color, n = 6, power = 60) {
  for (let i = 0; i < n; i++) {
    const s = document.createElement('div');
    s.className = 'spark';
    s.style.left = x + 'px'; s.style.top = y + 'px'; s.style.background = color;
    document.body.append(s);
    const a = Math.random() * Math.PI * 2, d = power * (0.5 + Math.random());
    s.animate([{ transform: 'translate(0,0)', opacity: 1 }, { transform: `translate(${Math.cos(a) * d}px, ${Math.sin(a) * d}px) scale(.3)`, opacity: 0 }],
      { duration: 500 + Math.random() * 300, easing: 'ease-out' }).onfinish = () => s.remove();
  }
}

function confetti() {
  const colors = ['#ffd166', '#ef476f', '#06d6a0', '#4cc9f0', '#c77dff'];
  for (let i = 0; i < 90; i++) {
    const c = document.createElement('div');
    c.className = 'confetti';
    c.style.left = Math.random() * 100 + 'vw';
    c.style.background = colors[i % colors.length];
    document.body.append(c);
    c.animate([{ transform: 'translateY(0) rotate(0)' }, { transform: `translateY(110vh) rotate(${720 * Math.random()}deg)` }],
      { duration: 2500 + Math.random() * 2000, delay: Math.random() * 800, easing: 'ease-in' }).onfinish = () => c.remove();
  }
}

function intro(html, ms = 2600) {
  $('#introText').innerHTML = html;
  $('#intro').classList.add('on');
  return wait(ms).then(() => $('#intro').classList.remove('on'));
}

const ctx = {
  G, S, set, code, $, $$, esc, fmt, later, wait, sfx, intro, confetti, sparks, floatText,
  heroHTML, avatarSVG, avatarColor, players: playerList, ranked, heroEls,
  broadcast: () => broadcast(),
  setStatus: html => { $('#statusLine').innerHTML = html; },
  setRoundMsg: html => { $('#roundMsg').innerHTML = html; },
  stage: null,
};

// ---------------- Networking ----------------
const send = m => { try { net && net.send(m); } catch (e) { console.warn(e); } };

function stateMsg() {
  const s = { t: 'state', mode: mode.id, scoreName: mode.scoreName, phase: G.phase, qi: G.qi, total: G.qs.length, stats: {}, change: !!mode.allowChange };
  for (const p of G.players.values()) if (!p.bot) s.stats[p.id] = [p.score, p.correct, p.streak, mode.tag ? mode.tag(ctx, p) : ''];
  if (G.qs[G.qi] && ['question', 'reveal', 'dig', 'dug'].includes(G.phase)) {
    const q = G.qs[G.qi];
    s.q = { prompt: q.prompt, choices: q.choices };
  }
  if (G.phase === 'question') {
    s.remain = Math.max(0, G.limit - (performance.now() - G.qStart));
    s.limit = G.limit;
    s.ans = [...G.answers.keys()].filter(id => !G.players.get(id)?.bot);
    if (mode.allowChange) { s.picks = {}; for (const [id, a] of G.answers) if (!G.players.get(id)?.bot) s.picks[id] = a.c; }
  }
  if (G.phase === 'reveal' && G.reveal) { s.correct = G.qs[G.qi].correct; s.res = G.reveal.res; s.note = G.reveal.note || ''; }
  if (G.phase === 'end' && G.end) {
    Object.assign(s, { win: G.end.win, title: G.end.title, sub: G.end.sub, ranks: ranked().map(p => p.id), coins: G.coins });
  }
  if (mode.publicState) Object.assign(s, mode.publicState(ctx));
  s.hud = mode.hud ? mode.hud(ctx) : '';
  return s;
}
function broadcast() { send(stateMsg()); }

function onMsg(m) {
  if (!m || typeof m !== 'object') return;
  if (m.t === 'join') handleJoin(m);
  else if (m.t === 'ans') handleAns(m);
  else if (m.t === 'sync') resync();
  else if (mode.onMessage) mode.onMessage(ctx, m);
}

// A student's iPad thinks it missed an update (e.g. it fell asleep). Resend the state,
// but at most once every 1.5 seconds even if many ask at once.
let lastResync = 0;
function resync() {
  const now = performance.now();
  if (now - lastResync < 1500) return;
  lastResync = now;
  broadcast();
}

function handleJoin(m) {
  const id = String(m.id || '').slice(0, 40);
  if (!id) return;
  if (G.kicked.has(id)) return send({ t: 'joined', to: id, ok: false, reason: 'kicked' });
  const name = String(m.name || '').replace(/\s+/g, ' ').trim().slice(0, 16);
  if (!name) return send({ t: 'joined', to: id, ok: false, reason: 'Please type a name.' });
  const clash = playerList().find(p => p.id !== id && p.name.toLowerCase() === name.toLowerCase());
  if (clash) return send({ t: 'joined', to: id, ok: false, reason: `Someone is already using “${name}”. Try a different name!` });
  const uid = typeof m.uid === 'string' ? m.uid.slice(0, 40) : null;
  // One account can only play once per game (it can still rejoin from a new tab).
  if (uid) for (const p of G.players.values()) if (p.uid === uid && p.id !== id) G.players.delete(p.id);
  let p = G.players.get(id);
  if (!p) {
    p = { id, uid, name, av: normalizeAvatar(m.av), score: 0, correct: 0, streak: 0, m: {} };
    G.players.set(id, p);
    if (G.phase !== 'lobby' && mode.addPlayer) mode.addPlayer(ctx, p);
    sfx('join');
  } else { p.name = name; p.av = normalizeAvatar(m.av); p.uid = uid || p.uid; }
  send({ t: 'joined', to: id, ok: true, name, coinsOn: G.teacher, state: stateMsg() });
  renderRoster();
  if (G.phase !== 'lobby' && mode.renderPlayers) mode.renderPlayers(ctx);
}

function handleAns(m) {
  if (G.phase !== 'question' || m.q !== G.qi) return;
  const p = G.players.get(m.id);
  if (!p) return;
  if (G.answers.has(p.id) && !mode.allowChange) return;
  const c = Number(m.c);
  if (!Number.isInteger(c) || c < 0 || c >= G.qs[G.qi].choices.length) return;
  const prev = G.answers.get(p.id);
  if (prev && prev.c === c) return;
  G.answers.set(p.id, { c, el: performance.now() - G.qStart });
  if (mode.onAnswer) mode.onAnswer(ctx, p, c);
  updateStatus();
  if (!mode.allowChange && G.answers.size >= G.players.size) {
    const qi = G.qi;
    later(() => { if (G.phase === 'question' && G.qi === qi) endQuestion(); }, 700);
  }
}

function fail(msg) { $('#errMsg').textContent = msg; show('errScreen'); }

// ---------------- Lobby ----------------
function renderRoster() {
  const list = playerList();
  $('#playerCount').textContent = list.length;
  $('#roster').innerHTML = list.map(p => `<div class="hero" data-id="${esc(p.id)}" title="Click to remove">${heroHTML(p)}</div>`).join('');
}

$('#roster').addEventListener('click', e => {
  const el = e.target.closest('.hero'); if (!el) return;
  const p = G.players.get(el.dataset.id); if (!p) return;
  if (!confirm(`Remove ${p.name} from this game?`)) return;
  G.players.delete(p.id);
  if (!p.bot) { G.kicked.add(p.id); send({ t: 'kicked', to: p.id }); }
  renderRoster();
});

function setupLobby() {
  document.title = `WiseRealm · ${mode.name}`;
  $$('.set-title').forEach(e => (e.textContent = set.title));
  $$('.mode-name').forEach(e => (e.textContent = mode.name));
  $('#modeBlurb').textContent = mode.blurb || '';
  $('#joinUrl').textContent = joinBase.replace(/^https?:\/\//, '').replace(/index\.html$/, '');
  $('#joinCode').textContent = code;
  $('#smallCode').textContent = code;
  $('#localNote').hidden = isOnline();

  const n = cleanItems(set.items).length;
  $('#setCount').innerHTML = `<option value="0">All (${n})</option>` +
    [5, 10, 15, 20, 30].filter(x => x < n).map(x => `<option value="${x}">${x}</option>`).join('');
  $('#setCount').value = [...$('#setCount').options].some(o => +o.value === S.count) ? S.count : 0;
  $('#setTime').value = S.time;
  $('#setFlip').checked = S.flip;
  $('#setAuto').checked = S.auto;
  const persist = () => {
    S.time = +$('#setTime').value; S.count = +$('#setCount').value;
    S.flip = $('#setFlip').checked; S.auto = $('#setAuto').checked;
    save('cq_host_settings', S);
  };
  ['#setTime', '#setCount', '#setFlip', '#setAuto'].forEach(s => $(s).addEventListener('change', persist));
  if (mode.settings) mode.settings(ctx, $('#modeSettings'), () => save('cq_host_settings', S));
  loadQR(joinBase + '?join=' + code);
}

function loadQR(url) {
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';
  s.onload = () => {
    try {
      const qr = window.qrcode(0, 'M');
      qr.addData(url); qr.make();
      $('#qr').innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
      $('#qr').hidden = false;
    } catch { /* no QR, that's fine */ }
  };
  document.head.append(s);
}

// ---- Teacher account: coins are only awarded when the teacher is signed in ----
async function setupTeacher() {
  const box = $('#coinBox');
  try {
    const user = await accounts.user();
    if (!user) {
      box.innerHTML = `<b>Coins: off</b><br><span class="muted">Sign in as the teacher so students earn coins.</span><br><button class="btn small" id="teacherSignIn">Sign in with Google</button>`;
      $('#teacherSignIn').onclick = () => accounts.signIn().catch(e => alert(e.message));
      return;
    }
    const isT = await accounts.isTeacher();
    if (!isT) {
      box.innerHTML = `<b>Coins: off</b><br><span class="muted">${esc(user.email)} isn’t on the teacher list (see README).</span>`;
      return;
    }
    await accounts.createGame(code, mode.id);
    G.teacher = true;
    box.innerHTML = `<b style="color:var(--good)">Coins: on</b><br><span class="muted">Signed-in students earn coins.${accounts.mode === 'demo' ? ' (Preview mode)' : ''}</span>`;
  } catch (e) {
    console.warn(e);
    box.innerHTML = `<b>Coins: off</b><br><span class="muted">${esc(e.message)}</span>`;
  }
}

const BOT_NAMES = ['Bot Ada', 'Bot Max', 'Bot Zoe', 'Bot Leo', 'Bot Ivy', 'Bot Sam', 'Bot Kai', 'Bot Mia', 'Bot Jax', 'Bot Ruby', 'Bot Finn', 'Bot Nova'];
$('#addBots').onclick = () => {
  let added = 0;
  for (const nm of BOT_NAMES) {
    if (added >= 5) break;
    if (playerList().some(p => p.name === nm)) continue;
    const id = 'bot-' + nm;
    G.players.set(id, { id, name: nm, av: randomAvatar(), score: 0, correct: 0, streak: 0, bot: true, skill: 0.55 + Math.random() * 0.35, m: {} });
    added++;
  }
  sfx('join'); renderRoster();
};
$('#openStudent').onclick = () => window.open(joinBase + 'index.html?join=' + code, '_blank');

// ---------------- Game flow ----------------
async function startGame() {
  if (!G.players.size) return alert('Wait for at least one student to join (or add test bots).');
  const qs = buildQuestions(set, { count: S.count, flip: S.flip });
  if (!qs.length) return alert('This set needs at least 2 questions with answers.');
  clearTimers();
  const flow = ++G.flow;
  G.round++;
  G.qs = qs; G.qi = -1; G.end = null; G.coins = null; G.reveal = null;
  for (const p of G.players.values()) { p.score = 0; p.correct = 0; p.streak = 0; p.m = {}; }
  ctx.stage = $('#stage');
  ctx.stage.innerHTML = '';
  ctx.stage.className = 'stage stage-' + mode.id;
  $('#hChoices').hidden = mode.showChoices === false;
  $('#qText').textContent = ''; $('#hChoices').innerHTML = ''; $('#statusLine').textContent = ''; $('#roundMsg').textContent = '';
  $('#nextBtn').hidden = true; $('#skipBtn').hidden = true;
  mode.mount(ctx);
  G.phase = 'intro';
  show('gameScreen');
  broadcast();
  await mode.start(ctx);
  if (flow === G.flow) nextQuestion();
}

function renderChoices(q) {
  $('#hChoices').innerHTML = q.choices.map((c, i) =>
    `<div class="choice ${CHOICE_STYLE[i].cls}"><span class="ico">${CHOICE_STYLE[i].icon}</span><span>${esc(c)}</span><span class="cnt" data-cnt="${i}">0</span></div>`).join('');
}

function nextQuestion() {
  clearTimers();
  G.qi++;
  if (G.qi >= G.qs.length) return endGame();
  G.phase = 'question';
  G.answers.clear();
  const q = G.qs[G.qi];
  G.limit = S.time * 1000;
  G.qStart = performance.now();
  $('#qpanel').classList.remove('reveal');
  $('#qCounter').textContent = `Question ${G.qi + 1} of ${G.qs.length}`;
  $('#qText').textContent = q.prompt;
  renderChoices(q);
  ctx.setRoundMsg('');
  $('#nextBtn').hidden = true;
  $('#skipBtn').hidden = false;
  $('#ring').style.visibility = 'visible';
  if (mode.onQuestion) mode.onQuestion(ctx, q);
  updateStatus();
  broadcast();
  sfx('start');

  let lastSec = null;
  G.tick = setInterval(() => {
    const remain = Math.max(0, G.limit - (performance.now() - G.qStart));
    const sec = Math.ceil(remain / 1000);
    $('#ringNum').textContent = sec;
    $('#ringFg').style.strokeDashoffset = String(226.2 * (1 - remain / G.limit));
    if (sec !== lastSec && sec <= 5 && sec > 0) sfx('tick');
    lastSec = sec;
    if (remain <= 0) endQuestion();
  }, 100);

  // Test bots answer after a random delay (and in Four Corners sometimes change their mind).
  for (const p of G.players.values()) {
    if (!p.bot) continue;
    const pickWrong = () => { const w = q.choices.map((_, i) => i).filter(i => i !== q.correct); return w[Math.floor(Math.random() * w.length)]; };
    const right = Math.random() < p.skill;
    if (mode.allowChange && Math.random() < 0.4) later(() => handleAns({ id: p.id, q: G.qi, c: pickWrong() }), 600 + Math.random() * G.limit * 0.25);
    later(() => handleAns({ id: p.id, q: G.qi, c: right ? q.correct : pickWrong() }), 1200 + Math.random() * G.limit * 0.6);
  }
}

function updateStatus() {
  const verb = mode.allowChange ? 'picked a spot' : 'answered';
  ctx.setStatus(`<span><b>${G.answers.size}</b> / ${G.players.size} ${verb}</span>`);
}

async function endQuestion() {
  if (G.phase !== 'question') return;
  clearTimers();
  const flow = G.flow;
  G.phase = 'reveal';
  const q = G.qs[G.qi];
  const counts = q.choices.map(() => 0);
  const results = playerList().map(p => {
    const a = G.answers.get(p.id) || null;
    if (a) counts[a.c]++;
    const correct = !!a && a.c === q.correct;
    if (correct) { p.correct++; p.streak++; } else p.streak = 0;
    return { p, a, correct, frac: a ? Math.min(1, a.el / G.limit) : 1 };
  });
  const out = mode.reveal(ctx, q, results);
  G.reveal = out;
  broadcast();

  sfx('reveal');
  $('#qpanel').classList.add('reveal');
  $('#skipBtn').hidden = true;
  $('#ring').style.visibility = 'hidden';
  $$('#hChoices .choice').forEach((el, i) => {
    el.classList.toggle('right', i === q.correct);
    el.classList.toggle('dim', i !== q.correct);
    el.querySelector('.cnt').textContent = counts[i];
  });
  ctx.setStatus('');
  await wait(out.duration || 1500);
  if (flow !== G.flow) return;
  if (mode.afterReveal) { await mode.afterReveal(ctx); if (flow !== G.flow) return; }
  if (mode.isOver && mode.isOver(ctx)) { await wait(out.overDelay || 0); if (flow === G.flow) endGame(); return; }
  const last = G.qi + 1 >= G.qs.length;
  $('#nextBtn').textContent = last ? 'See results ▶' : 'Next question ▶';
  $('#nextBtn').hidden = false;
  if (S.auto) later(next, 5000);
}

function next() {
  if (G.phase !== 'reveal' && G.phase !== 'dug') return;
  if (G.qi + 1 >= G.qs.length) endGame(); else nextQuestion();
}

// Coins: 20 for playing, 10 per correct answer, a bonus for the top 3,
// and 25 if the class won (Boss Raid). Capped at 300 per game by the database too.
function computeCoins(list, win) {
  const awards = {};
  list.forEach((p, i) => {
    if (p.bot || !p.uid) return;
    const amt = 20 + p.correct * 10 + ([30, 20, 10][i] || 0) + (win ? 25 : 0);
    awards[p.id] = Math.min(300, amt);
  });
  return awards;
}

async function endGame() {
  clearTimers();
  G.flow++;
  G.phase = 'end';
  const list = ranked();
  G.end = mode.endInfo(ctx);
  const byPlayer = computeCoins(list, G.end.win === true);
  broadcast();
  later(broadcast, 1500); // resend in case someone missed it

  $('#endTitle').textContent = G.end.title;
  $('#endSub').textContent = G.end.sub;
  const top = list.slice(0, 3);
  const order = [top[1], top[0], top[2]].filter(Boolean);
  const heights = { 0: 150, 1: 110, 2: 80 };
  $('#podium').innerHTML = order.map(p => {
    const rank = top.indexOf(p);
    return `<div class="spot p${rank + 1}"><div class="av-wrap">${avatarSVG(p.av)}</div><div class="nm">${esc(p.name)}</div>
      <div class="muted">${fmt(p.score)} ${esc(mode.scoreShort)}</div><div class="block" style="height:${heights[rank]}px">${rank + 1}</div></div>`;
  }).join('');
  $('#endList').innerHTML = list.slice(3, 5).map((p, i) =>
    `<div class="card stat"><span class="muted">#${i + 4}</span> ${esc(p.name)}<b>${fmt(p.score)}</b></div>`).join('');
  show('endScreen');
  if (G.end.win === false) sfx('lose'); else { sfx('win'); confetti(); }

  // Award coins to signed-in students (the database double-checks everything).
  const status = $('#coinStatus');
  const n = Object.keys(byPlayer).length;
  if (!G.teacher) { status.textContent = 'Coins are off for this game (teacher not signed in).'; return; }
  if (!n) { status.textContent = 'No signed-in students this round, so no coins were awarded.'; return; }
  status.textContent = 'Awarding coins…';
  try {
    const byUid = {};
    for (const [pid, amt] of Object.entries(byPlayer)) byUid[G.players.get(pid).uid] = amt;
    await accounts.awardCoins(code, G.round, byUid);
    G.coins = byPlayer;
    status.textContent = `🪙 Coins awarded to ${n} signed-in student${n === 1 ? '' : 's'}!`;
    broadcast();
  } catch (e) {
    console.warn(e);
    status.textContent = 'Could not award coins: ' + e.message;
  }
}

// ---------------- Controls ----------------
$('#startBtn').onclick = startGame;
$('#nextBtn').onclick = next;
$('#skipBtn').onclick = endQuestion;
$('#endEarly').onclick = () => { if (confirm('End this game now and show results?')) endGame(); };
$('#againBtn').onclick = () => {
  clearTimers();
  G.flow++;
  G.phase = 'lobby';
  for (const p of G.players.values()) { p.score = 0; p.correct = 0; p.streak = 0; }
  renderRoster();
  broadcast();
  show('lobbyScreen');
};
function refreshMute() { $$('.mute-btn').forEach(b => (b.textContent = isMuted() ? '🔇 Sound off' : '🔊 Sound on')); }
$$('.mute-btn').forEach(b => (b.onclick = () => { setMuted(!isMuted()); refreshMute(); }));
$$('.fs-btn').forEach(b => (b.onclick = () => {
  if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.();
}));
document.addEventListener('keydown', e => {
  if (e.target.matches('input, select, textarea')) return;
  if (e.key === ' ' || e.key === 'Enter') {
    if (G.phase === 'lobby' && $('#lobbyScreen').classList.contains('active')) { e.preventDefault(); startGame(); }
    else if ((G.phase === 'reveal' || G.phase === 'dug') && !$('#nextBtn').hidden) { e.preventDefault(); next(); }
  }
});
window.addEventListener('beforeunload', e => {
  if (G.phase !== 'lobby' && G.phase !== 'end') { e.preventDefault(); e.returnValue = ''; }
});
window.addEventListener('resize', () => { if (G.phase !== 'lobby' && mode.renderPlayers) mode.renderPlayers(ctx); });

// ---------------- Boot ----------------
(async function init() {
  if (!set) return fail('That question set wasn’t found in this browser.');
  if (cleanItems(set.items).length < 2) return fail('This set needs at least 2 questions with answers.');
  refreshMute();
  setupLobby();
  show('lobbyScreen');
  try {
    net = await openRoom(code, onMsg, 'host');
  } catch (e) {
    console.error(e);
    return fail('Could not connect to the game server. Check the internet connection and the Supabase settings in js/config.js, then reload.');
  }
  setupTeacher();
})();
