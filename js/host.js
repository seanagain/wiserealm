// Boss Raid host (projector). This tab runs the game: it checks answers and keeps score.
import { $, $$, esc, show, load, save, fmt, CHOICE_STYLE } from './common.js';
import { getSet, buildQuestions, cleanItems } from './sets.js';
import { openRoom, isOnline } from './net.js';
import { avatarSVG, normalizeAvatar, avatarColor, randomAvatar } from './avatar.js';
import { BOSSES, bossSVG } from './boss.js';
import { sfx, isMuted, setMuted } from './sound.js';

const params = new URLSearchParams(location.search);
const set = getSet(params.get('set'));
const S = Object.assign({ time: 20, count: 0, boss: 0, auto: false, flip: false }, load('cq_host_settings', {}));
const code = String(10000 + Math.floor(Math.random() * 90000));
const joinBase = new URL('./', location.href).href;

const G = {
  phase: 'lobby', players: new Map(), kicked: new Set(),
  qs: [], qi: -1, answers: new Map(), qStart: 0, limit: 0,
  bossMax: 1, bossHp: 1, visHp: 1, reveal: null, win: false,
  timers: [], tick: null,
};
let net = null;
const heroEls = new Map();

// ---------------- Networking ----------------
const send = m => { try { net && net.send(m); } catch (e) { console.warn(e); } };

function stateMsg() {
  const s = { t: 'state', phase: G.phase, qi: G.qi, total: G.qs.length, bossHp: G.bossHp, bossMax: G.bossMax, boss: S.boss, stats: {} };
  for (const p of G.players.values()) if (!p.bot) s.stats[p.id] = [p.dmg, p.correct, p.streak];
  if (G.phase === 'question' || G.phase === 'reveal') {
    const q = G.qs[G.qi];
    s.q = { prompt: q.prompt, choices: q.choices };
  }
  if (G.phase === 'question') {
    s.remain = Math.max(0, G.limit - (performance.now() - G.qStart));
    s.limit = G.limit;
    s.ans = [...G.answers.keys()].filter(id => !G.players.get(id)?.bot);
  }
  if (G.phase === 'reveal') { s.correct = G.qs[G.qi].correct; s.res = G.reveal.res; s.heal = G.reveal.heal; }
  if (G.phase === 'end') { s.win = G.win; s.ranks = ranked().map(p => p.id); }
  return s;
}
const broadcast = () => send(stateMsg());

function onMsg(m) {
  if (!m || typeof m !== 'object') return;
  if (m.t === 'join') handleJoin(m);
  else if (m.t === 'ans') handleAns(m);
  else if (m.t === 'sync') resync();
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
  const clash = [...G.players.values()].find(p => p.id !== id && p.name.toLowerCase() === name.toLowerCase());
  if (clash) return send({ t: 'joined', to: id, ok: false, reason: `Someone is already using “${name}”. Try a different name!` });
  let p = G.players.get(id);
  if (!p) {
    p = { id, name, av: normalizeAvatar(m.av), dmg: 0, correct: 0, streak: 0 };
    G.players.set(id, p);
    sfx('join');
  } else { p.name = name; p.av = normalizeAvatar(m.av); }
  // One message carries both the welcome and the current game state.
  send({ t: 'joined', to: id, ok: true, name, state: stateMsg() });
  renderRoster(); renderParty();
}

function handleAns(m) {
  if (G.phase !== 'question' || m.q !== G.qi) return;
  const p = G.players.get(m.id);
  if (!p || G.answers.has(p.id)) return;
  const c = Number(m.c);
  if (!Number.isInteger(c) || c < 0 || c >= G.qs[G.qi].choices.length) return;
  G.answers.set(p.id, { c, el: performance.now() - G.qStart });
  heroEls.get(p.id)?.classList.add('done');
  updateStatus();
  if (G.answers.size >= G.players.size) {
    const qi = G.qi;
    later(() => { if (G.phase === 'question' && G.qi === qi) endQuestion(); }, 700);
  }
}

// ---------------- Helpers ----------------
function later(fn, ms) { const t = setTimeout(fn, ms); G.timers.push(t); return t; }
function clearTimers() { G.timers.forEach(clearTimeout); G.timers = []; clearInterval(G.tick); G.tick = null; }
const ranked = () => [...G.players.values()].sort((a, b) => b.dmg - a.dmg || b.correct - a.correct);
const heroHTML = p => `<div class="av-wrap">${avatarSVG(p.av)}</div><div class="nm">${esc(p.name)}</div>`;

function fail(msg) { $('#errMsg').textContent = msg; show('errScreen'); }

// ---------------- Lobby ----------------
function renderRoster() {
  const list = [...G.players.values()];
  $('#playerCount').textContent = list.length;
  $('#roster').innerHTML = list.map(p => `<div class="hero" data-id="${esc(p.id)}" title="Click to remove">${heroHTML(p)}</div>`).join('');
}

$('#roster').addEventListener('click', e => {
  const el = e.target.closest('.hero'); if (!el) return;
  const p = G.players.get(el.dataset.id); if (!p) return;
  if (!confirm(`Remove ${p.name} from this game?`)) return;
  G.players.delete(p.id);
  if (!p.bot) { G.kicked.add(p.id); send({ t: 'kicked', to: p.id }); }
  renderRoster(); renderParty();
});

function setupLobby() {
  $$('.set-title').forEach(e => (e.textContent = set.title));
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

  $('#bossPick').innerHTML = BOSSES.map((b, i) => `<button data-b="${i}" title="${esc(b.name)}">${bossSVG(i)}</button>`).join('');
  const markBoss = () => {
    $$('#bossPick button').forEach(b => b.classList.toggle('sel', +b.dataset.b === S.boss));
    $('#bossName').textContent = BOSSES[S.boss].name;
  };
  $('#bossPick').onclick = e => { const b = e.target.closest('button'); if (!b) return; S.boss = +b.dataset.b; save('cq_host_settings', S); markBoss(); };
  markBoss();

  loadQR(joinBase + '?code=' + code);
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

const BOT_NAMES = ['Bot Ada', 'Bot Max', 'Bot Zoe', 'Bot Leo', 'Bot Ivy', 'Bot Sam', 'Bot Kai', 'Bot Mia', 'Bot Jax', 'Bot Ruby', 'Bot Finn', 'Bot Nova'];
$('#addBots').onclick = () => {
  let added = 0;
  for (const nm of BOT_NAMES) {
    if (added >= 5) break;
    if ([...G.players.values()].some(p => p.name === nm)) continue;
    const id = 'bot-' + nm;
    G.players.set(id, { id, name: nm, av: randomAvatar(), dmg: 0, correct: 0, streak: 0, bot: true, skill: 0.55 + Math.random() * 0.35 });
    added++;
  }
  sfx('join'); renderRoster(); renderParty();
};
$('#openStudent').onclick = () => window.open(joinBase + 'index.html?code=' + code, '_blank');

// ---------------- Battle ----------------
function renderParty() {
  const list = [...G.players.values()];
  const n = list.length;
  const hs = n <= 10 ? 86 : n <= 18 ? 70 : n <= 28 ? 58 : 48;
  $('#party').style.setProperty('--hs', hs + 'px');
  $('#party').innerHTML = list.map(p => `<div class="hero" data-id="${esc(p.id)}">${heroHTML(p)}</div>`).join('');
  heroEls.clear();
  $$('#party .hero').forEach(el => heroEls.set(el.dataset.id, el));
  if (G.phase === 'question') for (const id of G.answers.keys()) heroEls.get(id)?.classList.add('done');
}

function setHp(v) {
  G.visHp = Math.max(0, Math.min(G.bossMax, v));
  const f = G.visHp / G.bossMax;
  $('#hpFill').style.transform = `scaleX(${f})`;
  $('#hpGhost').style.transform = `scaleX(${f})`;
  $('#hpText').textContent = `${fmt(G.visHp)} / ${fmt(G.bossMax)}`;
  const b = $('#boss');
  b.classList.toggle('angry', f < 0.5);
  b.classList.toggle('scared', f < 0.25);
}

function startGame() {
  if (!G.players.size) return alert('Wait for at least one student to join (or add test bots).');
  const qs = buildQuestions(set, { count: S.count, flip: S.flip });
  if (!qs.length) return alert('This set needs at least 2 questions with answers.');
  clearTimers();
  G.qs = qs; G.qi = -1; G.win = false;
  for (const p of G.players.values()) { p.dmg = 0; p.correct = 0; p.streak = 0; }
  // Boss health scales with class size so roughly 60-70% accuracy wins.
  G.bossMax = Math.max(300, Math.round((G.players.size * qs.length * 150 * 0.65) / 50) * 50);
  G.bossHp = G.bossMax;
  $('#boss').className = 'boss';
  $('#boss').innerHTML = bossSVG(S.boss);
  $('#bossTitle').textContent = BOSSES[S.boss].name;
  setHp(G.bossMax);
  renderParty();
  G.phase = 'intro';
  show('battleScreen');
  broadcast();
  $('#qText').textContent = ''; $('#hChoices').innerHTML = ''; $('#statusLine').textContent = ''; $('#roundMsg').textContent = '';
  $('#introText').innerHTML = `⚔<br>${esc(BOSSES[S.boss].name)}<br><span style="font-size:.5em" class="muted">has appeared!</span>`;
  $('#intro').classList.add('on');
  sfx('roar');
  $('#boss').classList.add('roar');
  later(() => { $('#intro').classList.remove('on'); $('#boss').classList.remove('roar'); nextQuestion(); }, 2800);
}

function renderChoices(q) {
  $('#hChoices').innerHTML = q.choices.map((c, i) =>
    `<div class="choice ${CHOICE_STYLE[i].cls}"><span class="ico">${CHOICE_STYLE[i].icon}</span><span>${esc(c)}</span><span class="cnt" data-cnt="${i}">0</span></div>`).join('');
}

function nextQuestion() {
  clearTimers();
  G.qi++;
  if (G.qi >= G.qs.length) return endGame(false);
  G.phase = 'question';
  G.answers.clear();
  const q = G.qs[G.qi];
  G.limit = S.time * 1000;
  G.qStart = performance.now();
  $('#qpanel').classList.remove('reveal');
  $('#qCounter').textContent = `Question ${G.qi + 1} of ${G.qs.length}`;
  $('#qText').textContent = q.prompt;
  renderChoices(q);
  $('#roundMsg').textContent = '';
  $('#nextBtn').hidden = true;
  $('#skipBtn').hidden = false;
  $('#ring').style.visibility = 'visible';
  heroEls.forEach(el => el.classList.remove('done', 'miss'));
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

  // Test bots answer after a random delay.
  for (const p of G.players.values()) {
    if (!p.bot) continue;
    later(() => {
      const right = Math.random() < p.skill;
      const wrongs = q.choices.map((_, i) => i).filter(i => i !== q.correct);
      handleAns({ id: p.id, q: G.qi, c: right ? q.correct : wrongs[Math.floor(Math.random() * wrongs.length)] });
    }, 1200 + Math.random() * G.limit * 0.6);
  }
}

function updateStatus() {
  $('#statusLine').innerHTML = `<span><b>${G.answers.size}</b> / ${G.players.size} answered</span>`;
}

function endQuestion() {
  if (G.phase !== 'question') return;
  clearTimers();
  G.phase = 'reveal';
  const q = G.qs[G.qi];
  const res = {}, hits = [];
  const counts = q.choices.map(() => 0);
  let total = 0, nCorrect = 0;
  for (const p of G.players.values()) {
    const a = G.answers.get(p.id);
    if (!a) { p.streak = 0; continue; }
    counts[a.c]++;
    let dmg = 0;
    if (a.c === q.correct) {
      const frac = Math.min(1, a.el / G.limit);
      dmg = 100 + Math.round(100 * (1 - frac));
      p.streak++;
      if (p.streak >= 3) dmg = Math.round(dmg * 1.25);
      p.dmg += dmg; p.correct++; nCorrect++; total += dmg;
      hits.push({ id: p.id, dmg, crit: frac < 0.25, el: a.el });
    } else p.streak = 0;
    if (!p.bot) res[p.id] = [a.c, dmg];
  }
  hits.sort((a, b) => a.el - b.el);
  const acc = G.players.size ? nCorrect / G.players.size : 0;
  let newHp = G.bossHp - total, heal = 0;
  if (newHp <= 0) newHp = 0;
  else if (acc < 0.4) { heal = Math.round(G.bossMax * 0.05); newHp = Math.min(G.bossMax, newHp + heal); }
  G.bossHp = newHp;
  G.reveal = { res, heal, hits, counts, total, nCorrect };
  broadcast();

  // Reveal UI
  $('#qpanel').classList.add('reveal');
  $('#skipBtn').hidden = true;
  $('#ring').style.visibility = 'hidden';
  $$('#hChoices .choice').forEach((el, i) => {
    el.classList.toggle('right', i === q.correct);
    el.classList.toggle('dim', i !== q.correct);
    el.querySelector('.cnt').textContent = counts[i];
  });
  for (const p of G.players.values()) {
    const a = G.answers.get(p.id);
    if (!a || a.c !== q.correct) heroEls.get(p.id)?.classList.add('miss');
    heroEls.get(p.id)?.classList.remove('done');
  }
  $('#statusLine').innerHTML = '';
  const fastest = hits[0] ? G.players.get(hits[0].id) : null;
  $('#roundMsg').innerHTML = `<span class="good">${nCorrect} / ${G.players.size} hit!</span>` +
    (fastest ? ` <span class="muted">· Fastest: ${esc(fastest.name)}</span>` : '');

  const dur = animateAttacks(hits);
  later(() => {
    setHp(G.bossHp - heal); // sync visible HP with real HP (before any heal)
    if (heal) {
      floatText('+' + fmt(heal), 'heal');
      sfx('roar'); sfx('heal');
      $('#boss').classList.add('roar');
      later(() => $('#boss').classList.remove('roar'), 800);
      later(() => setHp(G.bossHp), 300);
      $('#roundMsg').innerHTML += ` <span class="bad">· Too many misses, the boss healed!</span>`;
    }
    if (G.bossHp <= 0) {
      $('#boss').classList.add('dead');
      burst(true);
      later(() => endGame(true), 1900);
      return;
    }
    const last = G.qi + 1 >= G.qs.length;
    $('#nextBtn').textContent = last ? 'See results ▶' : 'Next question ▶';
    $('#nextBtn').hidden = false;
    if (S.auto) later(next, 5000);
  }, dur);
}

function animateAttacks(hits) {
  if (!hits.length) { sfx('bad'); return 600; }
  const stagger = Math.max(50, Math.min(170, 2600 / hits.length));
  hits.forEach((h, i) => {
    later(() => {
      const p = G.players.get(h.id);
      const heroEl = heroEls.get(h.id);
      const done = () => { setHp(G.visHp - h.dmg); bossHit(h); };
      if (!heroEl || !p) return done();
      heroEl.classList.remove('jump'); void heroEl.offsetWidth; heroEl.classList.add('jump');
      const r = heroEl.getBoundingClientRect();
      const br = $('#boss').getBoundingClientRect();
      const sx = r.left + r.width / 2 - 13, sy = r.top + r.height * 0.35;
      const tx = br.left + br.width * (0.35 + Math.random() * 0.3) - 13, ty = br.top + br.height * (0.3 + Math.random() * 0.3);
      const proj = document.createElement('div');
      proj.className = 'proj';
      proj.style.left = sx + 'px'; proj.style.top = sy + 'px';
      proj.style.color = avatarColor(p.av);
      document.body.append(proj);
      const dx = tx - sx, dy = ty - sy;
      const anim = proj.animate([
        { transform: 'translate(0,0) scale(.5)' },
        { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 90}px) scale(1)` },
        { transform: `translate(${dx}px, ${dy}px) scale(1.2)` },
      ], { duration: 520, easing: 'ease-in' });
      anim.onfinish = () => { proj.remove(); sparks(tx + 13, ty + 13, avatarColor(p.av)); done(); };
    }, i * stagger);
  });
  return (hits.length - 1) * stagger + 520 + 450;
}

function bossHit(h) {
  const b = $('#boss');
  b.classList.remove('hit'); void b.offsetWidth; b.classList.add('hit');
  floatText((h.crit ? 'CRIT ' : '') + fmt(h.dmg), h.crit ? 'crit' : '');
  sfx('hit');
}

function floatText(text, cls) {
  const d = document.createElement('div');
  d.className = 'dmg ' + cls;
  d.textContent = text;
  d.style.left = 25 + Math.random() * 50 + '%';
  d.style.top = 15 + Math.random() * 40 + '%';
  $('#bossArea').append(d);
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

function burst() {
  const br = $('#boss').getBoundingClientRect();
  const colors = ['#ffd166', '#ff6b81', '#7bdff2', '#b2f7ef', '#fff'];
  for (let k = 0; k < 5; k++) setTimeout(() => sparks(br.left + br.width * Math.random(), br.top + br.height * Math.random(), colors[k], 14, 160), k * 200);
}

function next() {
  if (G.phase !== 'reveal') return;
  if (G.qi + 1 >= G.qs.length) endGame(false); else nextQuestion();
}

function endGame(win) {
  clearTimers();
  G.phase = 'end';
  G.win = win;
  broadcast();
  later(broadcast, 1500); // resend in case someone missed it
  const list = ranked();
  const totalDmg = list.reduce((s, p) => s + p.dmg, 0);
  const answeredQs = Math.max(1, G.qi + (G.reveal ? 1 : 0));
  const acc = list.length ? Math.round((list.reduce((s, p) => s + p.correct, 0) / (list.length * Math.min(answeredQs, G.qs.length))) * 100) : 0;
  $('#endTitle').textContent = win ? '🏆 Victory!' : '💨 The boss escaped!';
  $('#endSub').textContent = win
    ? `Your class defeated ${BOSSES[S.boss].name}! ${fmt(totalDmg)} total damage · ${acc}% correct`
    : `${BOSSES[S.boss].name} got away with ${fmt(G.bossHp)} HP left. ${acc}% correct. Rematch?`;
  const top = list.slice(0, 3);
  const order = [top[1], top[0], top[2]].filter(Boolean);
  const heights = { 0: 150, 1: 110, 2: 80 };
  $('#podium').innerHTML = order.map(p => {
    const rank = top.indexOf(p);
    return `<div class="spot p${rank + 1}"><div class="av-wrap">${avatarSVG(p.av)}</div><div class="nm">${esc(p.name)}</div>
      <div class="muted">${fmt(p.dmg)} dmg</div><div class="block" style="height:${heights[rank]}px">${rank + 1}</div></div>`;
  }).join('');
  $('#endList').innerHTML = list.slice(3, 5).map((p, i) =>
    `<div class="card stat"><span class="muted">#${i + 4}</span> ${esc(p.name)}<b>${fmt(p.dmg)}</b></div>`).join('');
  show('endScreen');
  if (win) { sfx('win'); confetti(); } else sfx('lose');
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

// ---------------- Controls ----------------
$('#startBtn').onclick = startGame;
$('#nextBtn').onclick = next;
$('#skipBtn').onclick = endQuestion;
$('#endEarly').onclick = () => {
  if (!confirm('End this game now and show results?')) return;
  endGame(G.bossHp <= 0);
};
$('#againBtn').onclick = () => {
  clearTimers();
  G.phase = 'lobby';
  for (const p of G.players.values()) { p.dmg = 0; p.correct = 0; p.streak = 0; }
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
    else if (G.phase === 'reveal' && !$('#nextBtn').hidden) { e.preventDefault(); next(); }
  }
});
window.addEventListener('beforeunload', e => {
  if (G.phase !== 'lobby' && G.phase !== 'end') { e.preventDefault(); e.returnValue = ''; }
});
window.addEventListener('resize', () => { if (G.phase !== 'lobby') renderParty(); });

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
    fail('Could not connect to the game server. Check the internet connection and the Supabase settings in js/config.js, then reload.');
  }
})();
