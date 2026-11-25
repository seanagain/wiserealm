// Game host (projector). This tab runs the game: it checks answers, keeps score and
// (when the teacher is signed in) awards coins. Each game type lives in js/modes/.
import { $, $$, esc, show, load, save, fmt, CHOICE_STYLE } from './common.js';
import { getSet, getSets, buildQuestions, cleanItems } from './sets.js';
import { openRoom, isOnline } from './net.js';
import { accounts } from './supa.js';
import { avatarSVG, normalizeAvatar, restrictAvatar, avatarColor, randomAvatar } from './avatar.js';
import { blockedWord } from './namefilter.js';
import { gameArt } from './gameart.js';
import { createPlayground } from './lobby.js';
import { sfx, isMuted, setMuted } from './sound.js';
import { playEmote, bubbleHTML } from './emotes.js';
import { ITEM_BY_ID, isFree } from './items.js';
import raid from './modes/raid.js';
import corners from './modes/corners.js';
import treasure from './modes/treasure.js';
import maze from './modes/maze.js';
import territory from './modes/territory.js';
import kart from './modes/kart.js';

export const MODES = { raid, corners, treasure, maze, territory, kart };
const params = new URLSearchParams(location.search);
// The game and question set can be switched in the lobby (same room code, same students).
let set = getSet(params.get('set'));
let mode = MODES[params.get('game')] || raid;
const S = Object.assign({ time: 20, count: 0, auto: false, flip: false, emotes: true, coinMult: 1, signin: false }, load('cq_host_settings', {}));
const code = String(10000 + Math.floor(Math.random() * 90000));
const joinBase = new URL('./', location.href).href;

const G = {
  phase: 'lobby', players: new Map(), kicked: new Set(),
  qs: [], qi: -1, answers: new Map(), qStart: 0, limit: 0,
  timers: [], tick: null, flow: 0, round: 0,
  reveal: null, end: null, coins: null, teacher: false, extra: {}, locked: false,
};
let net = null;
const heroEls = new Map();
if (params.has('debug')) window.__wr = { G }; // for automated tests only

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

let lobbyBc = null;
const ctx = {
  G, S, code, $, $$, esc, fmt, later, wait, sfx, intro, confetti, sparks, floatText,
  heroHTML, avatarSVG, avatarColor, players: playerList, ranked, heroEls,
  broadcast: () => broadcast(),
  // Something about the lobby changed (e.g. teams): redraw, and tell the iPads (batched).
  lobbyChanged: () => { renderRoster(); clearTimeout(lobbyBc); lobbyBc = setTimeout(() => { if (G.phase === 'lobby') broadcast(); }, 400); },
  setStatus: html => { $('#statusLine').innerHTML = html; },
  setRoundMsg: html => { $('#roundMsg').innerHTML = html; },
  stage: null,
};

Object.defineProperty(ctx, 'set', { get: () => set });

// ---------------- Networking ----------------
const send = m => { try { net && net.send(m); countUsage(1 + humanCount()); } catch (e) { console.warn(e); } };

// ---- Free plan usage: rough count of live-game messages, saved every minute (teacher signed in only) ----
// Each update from the projector is delivered to every connected iPad; each message from an iPad
// is counted twice (sent + delivered). Supabase's Usage page has the exact numbers.
let usage = 0;
const humanCount = () => { let n = 0; for (const p of G.players.values()) if (!p.bot) n++; return n; };
function countUsage(n) { if (net && net.mode === 'online') usage += n; }
function flushUsage() {
  if (!G.teacher || usage < 1) return;
  const n = Math.round(usage); usage = 0;
  accounts.addUsage(n).catch(e => { console.warn(e); usage += n; });
}
setInterval(flushUsage, 60000);
addEventListener('pagehide', flushUsage);
ctx.send = send;

function stateMsg() {
  const s = { t: 'state', mode: mode.id, scoreName: mode.scoreName, phase: G.phase, qi: G.qi, total: G.qs.length, stats: {}, change: !!mode.allowChange };
  for (const p of G.players.values()) if (!p.bot) s.stats[p.id] = [p.score, p.correct, p.streak, mode.tag ? mode.tag(ctx, p) : '', mode.selfPaced ? (p.asked || 0) : null];
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
  s.emotes = S.emotes !== false;
  if (G.phase === 'lobby') {
    s.book = S.book !== false;
    if (G.vote) s.vote = { options: G.vote.options.map(id => ({ id, name: MODES[id].name })), left: Math.max(0, G.vote.endsAt - performance.now()) };
    if (G.voteWinner) s.voteWinner = MODES[G.voteWinner] ? MODES[G.voteWinner].name : '';
  }
  return s;
}
function broadcast() { send(stateMsg()); }

function onMsg(m) {
  if (!m || typeof m !== 'object') return;
  countUsage(2);
  if (m.t === 'join') handleJoin(m);
  else if (m.t === 'ans') handleAns(m);
  else if (m.t === 'sync') resync();
  else if (m.t === 'emote') handleEmote(m);
  else if (m.t === 'vote') castVote(m);
  else if (m.t === 'dir' && G.phase === 'lobby') { const p = G.players.get(m.id); if (p) playground.setDir(p, m.d); }
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

// ---- Which signed-in student is on which iPad ----
// Privacy: iPads never send account IDs over the game connection (anyone with the room code
// could read those). Each signed-in iPad registers a random ticket for this game in the
// database, sends only the ticket, and the projector looks it up with the teacher's login.
const roster = new Map(), ticketOwner = new Map();
// Name filter settings (teacher page). Until the teacher's own settings load, the built-in list is on.
let nameFilter = { on: true, words: [] };
async function loadNameFilter() { if (G.teacher) { try { nameFilter = Object.assign({ on: true, words: [] }, await accounts.getNameFilter()); } catch (e) { console.warn(e); } } }
let pending = [], batchTimer = null, fetching = false;
function lookupTicket(tk, fresh = false) {
  // fresh: ask the database again, e.g. a student rejoining after changing clothes in the shop.
  if (!fresh && roster.has(tk)) return Promise.resolve(roster.get(tk));
  if (!G.teacher) return Promise.resolve(null);
  return new Promise(res => { pending.push({ tk, res }); scheduleRoster(); });
}
function scheduleRoster() { if (!batchTimer && !fetching) batchTimer = setTimeout(fetchRoster, 250); }
async function fetchRoster() {
  batchTimer = null; fetching = true;
  const batch = pending; pending = [];
  try { for (const r of (await accounts.gameRoster(code)) || []) roster.set(r.device, r); } catch (e) { console.warn(e); }
  fetching = false;
  for (const b of batch) b.res(roster.get(b.tk) || null);
  if (pending.length) scheduleRoster();
}

// Students can change clothes in the shop between games: check for new looks every 15 seconds
// in the lobby (a database read, not a live-game message, so it doesn't count toward the limit).
let refreshing = false;
async function refreshLooks() {
  if (!G.teacher || refreshing || !playerList().some(p => p.tk)) return;
  refreshing = true;
  try { for (const r of (await accounts.gameRoster(code)) || []) roster.set(r.device, r); } catch (e) { console.warn(e); }
  refreshing = false;
  let changed = false;
  for (const p of playerList()) {
    const r = p.tk && roster.get(p.tk);
    if (!r || r.user_id !== p.uid) continue;
    const av = normalizeAvatar(restrictAvatar(r.avatar || {}, r.owned || []));
    if (JSON.stringify(av) !== JSON.stringify(p.av)) { p.av = av; p.owned = r.owned || []; changed = true; }
  }
  if (changed && G.phase === 'lobby') renderRoster();
}
setInterval(() => { if (G.phase === 'lobby' && !document.hidden) refreshLooks(); }, 15000);

const joining = new Set();
async function handleJoin(m) {
  const id = String(m.id || '').slice(0, 40);
  if (!id || joining.has(id)) return;
  if (G.kicked.has(id)) return send({ t: 'joined', to: id, ok: false, reason: 'kicked' });
  const tk = typeof m.tk === 'string' && /^[\w-]{8,64}$/.test(m.tk) ? m.tk : null;
  let acct = null;
  if (tk) { joining.add(id); try { acct = await lookupTicket(tk, true); } finally { joining.delete(id); } }
  // A ticket only works for the iPad that used it first.
  if (acct) {
    const owner = ticketOwner.get(tk);
    if (owner && owner !== id && G.players.has(owner)) acct = null; else ticketOwner.set(tk, id);
  }
  const uid = acct ? acct.user_id : null;
  const existing = G.players.get(id) || (uid && playerList().find(p => p.uid === uid));
  if (G.locked && !existing) return send({ t: 'joined', to: id, ok: false, reason: 'locked' });
  if (S.signin && G.teacher && !uid) return send({ t: 'joined', to: id, ok: false, reason: 'signin' });
  const name = String((acct && acct.display_name) || m.name || '').replace(/\s+/g, ' ').trim().slice(0, 16);
  if (!name) return send({ t: 'joined', to: id, ok: false, reason: 'Please type a name.' });
  const signedIn = !!(uid || m.acct);
  const taken = n => playerList().some(p => p.id !== id && p.uid !== (uid || '-') && p.name.toLowerCase() === n.toLowerCase());
  let finalName = name;
  if (taken(name)) {
    // Signed-in students can't pick their name here, so give them a number (e.g. two "Maya L.").
    if (!signedIn) return send({ t: 'joined', to: id, ok: false, reason: `Someone is already using “${name}”. Try a different name!` });
    for (let n = 2; taken(finalName); n++) finalName = name.slice(0, 13) + ' ' + n;
  }
  // Name filter: guests pick another name; a signed-in student's saved name is swapped for "Hero N".
  let renamed = false;
  if (nameFilter.on && blockedWord(finalName, nameFilter.words)) {
    if (!signedIn) return send({ t: 'joined', to: id, ok: false, reason: 'That name isn’t allowed. Please choose a different name.' });
    renamed = true;
    for (let n = 1; ; n++) { finalName = 'Hero ' + n; if (!taken(finalName)) break; }
  }
  const av = acct ? normalizeAvatar(restrictAvatar(acct.avatar || {}, acct.owned || [])) : normalizeAvatar(m.av);
  // One account can only play once per game (it can still rejoin from a new tab, keeping its score).
  let p = G.players.get(id);
  if (!p && existing && existing.id !== id) {
    G.players.delete(existing.id);
    if (G.phase === 'lobby') { p = existing; p.id = id; G.players.set(id, p); }
  }
  if (!p) {
    p = { id, uid, name: finalName, av, score: 0, correct: 0, streak: 0, m: {} };
    G.players.set(id, p);
    if (G.phase !== 'lobby' && mode.addPlayer) mode.addPlayer(ctx, p);
    sfx('join');
  } else { p.name = finalName; p.av = av; p.uid = uid || p.uid; }
  if (acct) { p.owned = acct.owned || []; p.tk = tk; p.real = acct.real_name || ''; }
  p.filtered = renamed;
  send({ t: 'joined', to: id, ok: true, name: finalName, coinsOn: G.teacher && !!p.uid, state: stateMsg() });
  renderRoster();
  if (G.phase !== 'lobby' && mode.renderPlayers) mode.renderPlayers(ctx);
  if (G.phase !== 'lobby' && mode.rejoin) mode.rejoin(ctx, p);
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

// ---------------- Emotes ----------------
// Students can only use free emotes and ones they really own (p.owned comes from game_roster).
const EMOTE_PHASES = ['lobby', 'intro', 'reveal', 'dug', 'end'];
const recentEmotes = [];
function handleEmote(m) {
  if (S.emotes === false || !EMOTE_PHASES.includes(G.phase)) return;
  const p = G.players.get(m.id), e = ITEM_BY_ID[m.e];
  if (!p || !e || e.slot !== 'emote') return;
  if (!isFree(e) && !(p.owned || []).includes(e.id)) return;
  const now = performance.now();
  if (p.lastEmote && now - p.lastEmote < 2500) return;          // one every few seconds per student
  while (recentEmotes.length && now - recentEmotes[0] > 2000) recentEmotes.shift();
  if (recentEmotes.length >= 8) return;                         // and not too many at once overall
  p.lastEmote = now; recentEmotes.push(now);
  showEmote(p, e.id);
}
function showEmote(p, id) {
  sfx('emote');
  let el = null;
  if ($('#gameScreen').classList.contains('active')) el = heroEls.get(p.id);
  else if ($('#lobbyScreen').classList.contains('active')) el = $(`#roster .hero[data-id="${CSS.escape(p.id)}"]`);
  if (el && el.offsetParent) return playEmote(el, id);
  // No hero on screen (e.g. Treasure Hunt or the results screen): show it in a corner feed.
  let feed = $('#emoteFeed');
  if (!feed) { feed = document.createElement('div'); feed.id = 'emoteFeed'; feed.className = 'emote-feed'; document.body.append(feed); }
  const row = document.createElement('div');
  row.className = 'feed-row';
  row.innerHTML = `<b>${esc(p.name)}</b>${bubbleHTML(id)}`;
  feed.append(row);
  while (feed.children.length > 5) feed.firstChild.remove();
  setTimeout(() => row.remove(), 3000);
}
function refreshAutoToggle() {
  $('#autoToggle').textContent = S.auto ? '⏩ Auto-next: on' : '⏸ Auto-next: off';
  $('#autoToggle').hidden = !!mode.selfPaced;
}
function refreshEmoteToggle() { $('#emoteToggle').textContent = S.emotes === false ? '😶 Emotes off' : '😀 Emotes on'; $('#setEmotes').checked = S.emotes !== false; }

function fail(msg) { $('#errMsg').textContent = msg; show('errScreen'); }

// ---------------- Lobby ----------------
const playground = createPlayground($('#roster'), { players: playerList, heroHTML, teamOf: p => (mode.lobbyTeam ? mode.lobbyTeam(ctx, p) : 0), onBook: p => sendBook(p) });

// ---- The lobby book: a preview of this game's questions (priming before the game) ----
// The questions are picked now, so the book shows exactly what the game will ask
// (in a different order). Answers are only sent if the teacher chose to show them.
let bookQs = null;
function prepBook() { bookQs = buildQuestions(set, { count: S.count, flip: S.flip }); }
function sendBook(p) {
  if (S.book === false || G.phase !== 'lobby' || !bookQs || !bookQs.length) return;
  const now = performance.now();
  if (p.bookAt && now - p.bookAt < 6000) return; // walked away and back: don't resend right away
  p.bookAt = now;
  const order = bookQs.map((q, i) => [Math.random(), i]).sort((a, b) => a[0] - b[0]).map(x => bookQs[x[1]]);
  const show = !!S.bookAns;
  send({ t: 'book', to: p.id, title: set.title, ans: show,
    qs: order.slice(0, 60).map(q => Object.assign({ p: String(q.prompt).slice(0, 300), c: q.choices.map(c => String(c).slice(0, 200)) }, show ? { a: q.correct } : {})) });
}
function renderRoster() {
  $('#playerCount').textContent = playerList().length;
  renderPlayerList();
  playground.sync();
  const mp = $('#modePanel');
  if (mp && mode.lobbyPanel) mode.lobbyPanel(ctx, mp);
  else if (mp) { mp.hidden = true; mp.innerHTML = ''; }
}
function refreshLock() {
  $('#lockBtn').textContent = G.locked ? '🔒 Room locked' : '🔓 Room open';
  $('#lockBtn').classList.toggle('danger', G.locked);
}
$('#lockBtn').onclick = () => { G.locked = !G.locked; refreshLock(); };
function refreshSigninHint() {
  $('#setSignin').checked = !!S.signin;
  $('#signinHint').textContent = !S.signin ? 'Guests can join with any name.'
    : G.teacher ? 'Only signed-in students can join. Guests see a “Sign in” button.'
    : 'Sign in as the teacher (below) to use this.';
}

// ---- Choosing the game: a picture grid, or a class vote on the iPads ----
function chooseGame(id) {
  if (!MODES[id]) return;
  if (G.vote) endVote(true);
  mode = MODES[id]; G.extra = {}; G.voteWinner = null;
  applyChoice(); broadcast();
}
const voteOut = new Set(load('cq_vote_out', []));
function openGamePick() {
  $('#gpGrid').innerHTML = Object.values(MODES).map(m => `<div class="gp-card ${m.id === mode.id ? 'sel' : ''}" data-g="${m.id}" tabindex="0">
      <div class="ga">${gameArt(m.id)}</div><b>${esc(m.name)}</b><p class="muted">${esc(m.blurb || '')}</p>
      <label class="gp-in"><input type="checkbox" data-in="${m.id}" ${voteOut.has(m.id) ? '' : 'checked'}> In the vote</label></div>`).join('');
  $('#gamePick').showModal();
}
$('#gpClose').onclick = () => $('#gamePick').close();
$('#gpGrid').addEventListener('change', e => {
  const c = e.target.closest('[data-in]'); if (!c) return;
  if (c.checked) voteOut.delete(c.dataset.in); else voteOut.add(c.dataset.in);
  save('cq_vote_out', [...voteOut]);
});
$('#gpGrid').addEventListener('click', e => {
  if (e.target.closest('.gp-in')) return;
  const card = e.target.closest('[data-g]'); if (!card) return;
  chooseGame(card.dataset.g); $('#gamePick').close();
});
$('#voteStart').onclick = () => {
  const options = Object.keys(MODES).filter(id => !voteOut.has(id));
  if (options.length < 2) return alert('Pick at least two games for the vote.');
  $('#gamePick').close();
  startVote(options);
};

const VOTE_MS = 20000;
let voteTick = null;
function startVote(options) {
  if (G.phase !== 'lobby') return;
  G.vote = { options, votes: new Map(), endsAt: performance.now() + VOTE_MS };
  G.voteWinner = null;
  clearInterval(voteTick);
  voteTick = setInterval(() => { if (!G.vote) return clearInterval(voteTick); if (performance.now() >= G.vote.endsAt) endVote(); else renderVote(); }, 250);
  // test bots vote too, so the vote can be tried out
  for (const p of playerList()) if (p.bot) later(() => castVote({ id: p.id, g: options[Math.floor(Math.random() * options.length)] }), 1000 + Math.random() * 9000);
  sfx('warning');
  renderVote(); broadcast();
}
function castVote(m) {
  if (!G.vote || G.phase !== 'lobby') return;
  const p = G.players.get(m.id);
  if (!p || !G.vote.options.includes(m.g)) return;
  G.vote.votes.set(p.id, m.g);
  renderVote();
}
function endVote(cancel = false) {
  const v = G.vote; if (!v) return;
  G.vote = null; clearInterval(voteTick);
  if (!cancel) {
    const counts = v.options.map(id => [id, [...v.votes.values()].filter(g => g === id).length]);
    const best = Math.max(...counts.map(c => c[1]));
    if (best > 0) {
      const top = counts.filter(c => c[1] === best).map(c => c[0]);
      const win = top[Math.floor(Math.random() * top.length)];
      mode = MODES[win]; G.extra = {}; applyChoice();
      G.voteWinner = win;
      sfx('crit'); confetti();
      $('#votePanel').hidden = false;
      $('#votePanel').innerHTML = `<div class="vote-win"><div class="ga">${gameArt(win)}</div><div><div class="muted">The class chose</div><b>🎉 ${esc(MODES[win].name)}!</b>
        <div class="muted">${best} vote${best === 1 ? '' : 's'}${top.length > 1 ? ' (a tie, so a coin flip decided)' : ''}</div></div>
        <button class="btn primary big" id="voteGo">Start game!</button><button class="btn small" id="voteHide">OK</button></div>`;
      $('#voteGo').onclick = () => { $('#votePanel').hidden = true; startGame(); };
      $('#voteHide').onclick = () => { $('#votePanel').hidden = true; };
      broadcast();
      return;
    }
  }
  $('#votePanel').hidden = true;
  broadcast();
}
function renderVote() {
  const v = G.vote, el = $('#votePanel');
  if (!v) return;
  const left = Math.max(0, Math.ceil((v.endsAt - performance.now()) / 1000));
  const total = v.votes.size, humans = playerList().length;
  el.hidden = false;
  el.innerHTML = `<div class="vote-head"><b>🗳 Vote for the next game on your iPad!</b><span class="vote-time">${left}s</span>
      <span class="muted">${total} / ${humans} voted</span><span class="spacer"></span>
      <button class="btn small primary" id="voteEnd">End vote now</button><button class="btn small" id="voteCancel">Cancel</button></div>
    <div class="vote-bars">${v.options.map(id => {
      const n = [...v.votes.values()].filter(g => g === id).length;
      return `<div class="vote-row"><div class="ga">${gameArt(id)}</div><b>${esc(MODES[id].name)}</b>
        <div class="vote-bar"><span style="width:${total ? (100 * n) / total : 0}%"></span></div><b class="vote-n">${n}</b></div>`;
    }).join('')}</div>`;
  $('#voteEnd').onclick = () => endVote();
  $('#voteCancel').onclick = () => endVote(true);
}

// ---- Lobby player list (with real names on request, for checking who is who) ----
let revealUntil = 0, revealTimer = null;
function renderPlayerList() {
  if (!$('#plist').open) return;
  const reveal = performance.now() < revealUntil;
  const list = playerList();
  $('#plistTable').innerHTML = `<tr><th>#</th><th></th><th>In-game name</th><th>Account</th><th>Real name</th><th></th></tr>` +
    (list.map((p, i) => `<tr><td>${i + 1}</td><td><span class="plist-hero">${avatarSVG(p.av)}</span></td>
      <td><b>${esc(p.name)}</b>${p.filtered ? ' <span title="Their saved name was blocked by the name filter" class="bad">⚠ renamed</span>' : ''}</td>
      <td>${p.bot ? '🤖 Test bot' : p.uid ? '✅ Signed in' : 'Guest'}</td>
      <td>${p.uid ? (reveal ? esc(p.real || '(no name on account)') : '••••••') : '<span class="muted">-</span>'}</td>
      <td><button class="btn small danger" data-kick="${esc(p.id)}">Remove</button></td></tr>`).join('') ||
      '<tr><td colspan="6" class="muted">Nobody has joined yet.</td></tr>');
  $('#revealNames').textContent = reveal ? '🙈 Hide real names' : '👁 Show real names';
}
$('#plist').addEventListener('toggle', renderPlayerList);
$('#revealNames').onclick = () => {
  revealUntil = performance.now() < revealUntil ? 0 : performance.now() + 15000;
  clearTimeout(revealTimer); revealTimer = setTimeout(renderPlayerList, 15100);
  renderPlayerList();
};
$('#plistTable').addEventListener('click', e => { const b = e.target.closest('[data-kick]'); if (b) kickPlayer(b.dataset.kick); });
function kickPlayer(pid) {
  const p = G.players.get(pid); if (!p) return;
  if (!confirm(`Remove ${p.name} from this game?`)) return;
  G.players.delete(p.id);
  if (!p.bot) { G.kicked.add(p.id); send({ t: 'kicked', to: p.id }); }
  renderRoster();
}

$('#roster').addEventListener('click', e => {
  const el = e.target.closest('.hero'); if (!el) return;
  const p = G.players.get(el.dataset.id); if (!p) return;
  if (!confirm(`Remove ${p.name} from this game?`)) return;
  G.players.delete(p.id);
  if (!p.bot) { G.kicked.add(p.id); send({ t: 'kicked', to: p.id }); }
  renderRoster();
});

// Game + question set pickers. Switching keeps the room code and everyone who joined.
function applyChoice() {
  document.title = `WiseRealm · ${mode.name}`;
  $$('.set-title').forEach(e => (e.textContent = set.title));
  $$('.mode-name').forEach(e => (e.textContent = mode.name));
  $('#modeBlurb').textContent = mode.blurb || '';
  $('#setGame').value = mode.id;
  $('#gameNowArt').innerHTML = gameArt(mode.id); $('#gameNowName').textContent = mode.name;
  $('#setSet').value = set.id;
  const n = cleanItems(set.items).length;
  $('#setCount').innerHTML = `<option value="0">All (${n})</option>` +
    [5, 10, 15, 20, 30].filter(x => x < n).map(x => `<option value="${x}">${x}</option>`).join('');
  $('#setCount').value = [...$('#setCount').options].some(o => +o.value === S.count) ? S.count : 0;
  ['#setTime', '#setCount', '#setAuto'].forEach(sel => ($(sel).closest('label').hidden = !!mode.selfPaced));
  $('#modeSettings').innerHTML = '';
  if (mode.settings) mode.settings(ctx, $('#modeSettings'), () => save('cq_host_settings', S));
  history.replaceState(null, '', `host.html?set=${encodeURIComponent(set.id)}&game=${mode.id}${params.has('debug') ? '&debug' : ''}`);
  refreshAutoToggle();
  if (G.phase === 'lobby') ctx.lobbyChanged(); // e.g. show or hide the team picker
  prepBook();
}

function setupLobby() {
  $('#setGame').innerHTML = Object.values(MODES).map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('');
  $('#setSet').innerHTML = getSets().filter(s => cleanItems(s.items).length >= 2).map(s => `<option value="${esc(s.id)}">${esc(s.title)}</option>`).join('');
  $('#setGame').onchange = () => chooseGame($('#setGame').value);
  $('#gameChange').onclick = openGamePick;
  $('#setSet').onchange = () => { set = getSet($('#setSet').value) || set; applyChoice(); };
  $('#joinUrl').textContent = joinBase.replace(/^https?:\/\//, '').replace(/index\.html$/, '');
  $('#joinCode').textContent = code;
  $('#smallCode').textContent = code;
  $('#localNote').hidden = isOnline();

  $('#setTime').value = S.time;
  $('#setFlip').checked = S.flip;
  $('#setAuto').checked = S.auto;
  const persist = () => {
    S.time = +$('#setTime').value; S.count = +$('#setCount').value;
    S.flip = $('#setFlip').checked; S.auto = $('#setAuto').checked;
    save('cq_host_settings', S);
    refreshAutoToggle();
    prepBook();
  };
  ['#setTime', '#setCount', '#setFlip', '#setAuto'].forEach(s => $(s).addEventListener('change', persist));
  $('#setCoins').value = String(S.coinMult ?? 1);
  $('#coinHint').textContent = coinHint();
  $('#setCoins').addEventListener('change', () => { S.coinMult = Number($('#setCoins').value); save('cq_host_settings', S); $('#coinHint').textContent = coinHint(); });
  $('#setSignin').addEventListener('change', () => { S.signin = $('#setSignin').checked; save('cq_host_settings', S); refreshSigninHint(); });
  refreshSigninHint(); refreshLock();
  $('#setEmotes').addEventListener('change', () => { S.emotes = $('#setEmotes').checked; save('cq_host_settings', S); refreshEmoteToggle(); broadcast(); });
  $('#emoteToggle').onclick = () => { S.emotes = S.emotes === false; save('cq_host_settings', S); refreshEmoteToggle(); broadcast(); };
  refreshEmoteToggle();
  $('#setBook').checked = S.book !== false; $('#setBookAns').checked = !!S.bookAns;
  const refreshBook = () => { $('#setBookAns').closest('label').hidden = S.book === false; playground.setBook(S.book !== false); };
  $('#setBook').addEventListener('change', () => { S.book = $('#setBook').checked; save('cq_host_settings', S); refreshBook(); broadcast(); });
  $('#setBookAns').addEventListener('change', () => { S.bookAns = $('#setBookAns').checked; save('cq_host_settings', S); });
  refreshBook();
  // Auto-advance can also be switched during a game
  $('#autoToggle').onclick = () => {
    S.auto = !S.auto; save('cq_host_settings', S); $('#setAuto').checked = S.auto; refreshAutoToggle();
    if (S.auto && (G.phase === 'reveal' || G.phase === 'dug') && !$('#nextBtn').hidden) later(next, 3000);
  };
  applyChoice();
  loadQR(joinBase + '?join=' + code);
}

function loadQR(url) {
  const s = document.createElement('script');
  s.src = 'vendor/qrcode.js'; // stored on this site (no outside CDN)
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
    roster.clear();
    loadNameFilter();
    refreshSigninHint();
    // Students who joined before the teacher signed in: ask their iPads to register again.
    send({ t: 'reg' });
    const classes = (await accounts.teacherClasses().catch(() => [])).filter(c => !c.archived);
    if (!classes.some(c => c.id === S.classId)) S.classId = '';
    box.innerHTML = `<b style="color:var(--good)">Coins &amp; progress: on</b><br><span class="muted">Signed-in students earn coins and their results are saved.${accounts.mode === 'demo' ? ' (Preview mode)' : ''}</span>
      <label style="margin-top:8px">Class <select id="classPick"><option value="">No class</option>${classes.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select></label>
      <div class="muted" id="classHint" style="font-size:.82rem"></div>`;
    const pick = $('#classPick');
    const hint = () => {
      const c = classes.find(x => x.id === S.classId);
      $('#classHint').textContent = c ? `Results go to ${c.name}. Students who sign in and join are added to this class automatically (no class code needed).` : classes.length ? 'Pick a class to track progress.' : 'Create classes on the teacher page (Classes & progress).';
    };
    pick.value = S.classId || '';
    const linkClass = () => accounts.setGameClass(code, S.classId || null).catch(e => console.warn(e));
    pick.onchange = () => { S.classId = pick.value; save('cq_host_settings', S); hint(); linkClass(); };
    hint(); linkClass();
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
  if (G.vote) endVote(true);
  G.voteWinner = null; $('#votePanel').hidden = true;
  if (!G.players.size) return alert('Wait for at least one student to join (or add test bots).');
  const qs = bookQs && bookQs.length ? bookQs : buildQuestions(set, { count: S.count, flip: S.flip });
  bookQs = null;
  if (!qs.length) return alert('This set needs at least 2 questions with answers.');
  clearTimers();
  const flow = ++G.flow;
  G.round++;
  G.qs = qs; G.qi = -1; G.end = null; G.coins = null; G.reveal = null;
  for (const p of G.players.values()) { p.score = 0; p.correct = 0; p.streak = 0; p.m = {}; p.answered = 0; p.missed = []; }
  G.qstats = [];
  ctx.stage = $('#stage');
  ctx.stage.innerHTML = '';
  ctx.stage.className = 'stage stage-' + mode.id;
  $('#hChoices').hidden = mode.showChoices === false;
  $('#qpanel').hidden = !!mode.selfPaced;
  $('#gameScreen .arena').classList.toggle('no-q', !!mode.selfPaced);
  $('#qText').textContent = ''; $('#hChoices').innerHTML = ''; $('#statusLine').textContent = ''; $('#roundMsg').textContent = '';
  $('#nextBtn').hidden = true; $('#skipBtn').hidden = true;
  mode.mount(ctx);
  G.phase = 'intro';
  show('gameScreen');
  broadcast();
  await mode.start(ctx);
  if (flow !== G.flow) return;
  if (mode.selfPaced) {
    // Everyone plays at their own pace (e.g. the maze); the mode runs until it's over.
    G.phase = 'play';
    $('#qCounter').textContent = mode.name;
    broadcast();
    await mode.run(ctx);
    if (flow === G.flow) endGame();
    return;
  }
  nextQuestion();
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
  // Progress tracking (real players only, not test bots)
  const real = results.filter(r => !r.p.bot);
  G.qstats[G.qi] = { p: q.prompt, a: q.choices[q.correct], n: real.filter(r => r.a).length, r: real.filter(r => r.correct).length };
  for (const r of real) {
    r.p.answered = (r.p.answered || 0) + (r.a ? 1 : 0);
    if (!r.correct) (r.p.missed = r.p.missed || []).push(G.qi);
  }
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
// The teacher's "Coin rewards" setting multiplies this (None ×0, Low ×½, Normal ×1, High ×2, Huge ×3).
function computeCoins(list, win) {
  const awards = {}, mult = Number(S.coinMult ?? 1);
  if (!mult) return awards;
  list.forEach((p, i) => {
    if (p.bot || !p.uid) return;
    const amt = Math.round((20 + p.correct * 10 + ([30, 20, 10][i] || 0) + (win ? 25 : 0)) * mult);
    awards[p.id] = Math.max(1, Math.min(300, amt));
  });
  return awards;
}
// Rough range shown under the setting (10 questions, half to all right).
function coinHint() {
  const mult = Number(S.coinMult ?? 1);
  if (!mult) return 'Students won’t earn coins this game (progress is still saved).';
  const lo = Math.round((20 + 5 * 10) * mult), hi = Math.min(300, Math.round((20 + 10 * 10 + 30) * mult));
  return `About ${lo}–${hi} coins per student for a 10-question game.`;
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
  if (!G.teacher) { status.textContent = 'Coins and progress are off for this game (teacher not signed in).'; return; }
  saveResults(list, byPlayer);
  if (!Number(S.coinMult ?? 1)) { status.textContent = 'Coin rewards were set to None for this game. Progress was saved.'; return; }
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

// Save this game's results so the teacher can see progress (Classes & progress on the teacher page).
async function saveResults(list, coins) {
  const asked = G.qstats.filter(Boolean).length;
  if (!asked) return;
  // Places are counted among real players (test bots don't count).
  const humans = list.filter(p => !p.bot);
  const results = humans.map((p, i) => ({ p, rank: i + 1 })).filter(x => x.p.uid).map(({ p, rank }) => ({
    uid: p.uid, score: p.score, correct: p.correct, answered: p.answered || 0, total: mode.selfPaced ? (p.asked || 0) : asked, rank, players: humans.length,
    coins: coins[p.id] || 0, missed: p.missed || [],
  }));
  try {
    await accounts.recordGame(code, G.round, S.classId || null, mode.id, set.title, G.qstats.filter(Boolean), results);
  } catch (e) { console.warn('Could not save results', e); }
}

// ---------------- Controls ----------------
$('#startBtn').onclick = startGame;
$('#nextBtn').onclick = next;
$('#skipBtn').onclick = endQuestion;
$('#endEarly').onclick = () => { if (confirm('End this game now and show results?')) endGame(); };
function backToLobby() {
  clearTimers();
  G.flow++;
  G.phase = 'lobby';
  G.extra = {};
  for (const p of G.players.values()) { p.score = 0; p.correct = 0; p.streak = 0; p.m = {}; }
  renderRoster();
  broadcast();
  show('lobbyScreen');
  refreshLooks();
  prepBook();
  loadNameFilter();
}
$('#againBtn').onclick = backToLobby;
$('#replayBtn').onclick = () => { backToLobby(); startGame(); };
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
