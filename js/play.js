// Student screen (iPad). Joins a game, shows questions, sends answers.
// Works for every game type; the projector tells it which game is running.
// Students can play as a guest, or sign in with Google to use their shop hero and earn coins.
import { $, esc, show, uid, load, save, fmt, CHOICE_STYLE } from './common.js';
import { openRoom, isOnline } from './net.js';
import { accounts } from './supa.js';
import { usableEmotes } from './emotes.js';
import { createTerPad } from './terpad.js';
import { avatarSVG, normalizeAvatar, restrictAvatar, randomAvatar, SKINS, COLORS, HATS, FACES, CLASSES, STYLES } from './avatar.js';

// One ID per device so a student who reloads keeps their score.
// In Local Test Mode each tab is its own pretend student.
function getPid() {
  if (!isOnline()) {
    try { let p = sessionStorage.getItem('cq_pid'); if (!p) { p = uid(12); sessionStorage.setItem('cq_pid', p); } return p; }
    catch { return uid(12); }
  }
  let p = load('cq_pid', null);
  if (!p) { p = uid(12); save('cq_pid', p); }
  return p;
}
const pid = getPid();
const profile = load('cq_profile', null) || { name: '', av: randomAvatar() };
profile.av = normalizeAvatar(profile.av);
let account = null; // { user, prof } when signed in

let net = null, netCode = null, code = '';
let joined = false, joinTries = 0, joinTimer = null, joinedGame = null, coinsOn = false;
let last = null, shownKey = null, myAns = -1, myPick = -1, myDig = -1;
let deadline = 0, limit = 1, raf = null;

// ---------------- Account ----------------
async function loadAccount() {
  const box = $('#acct');
  try {
    const user = await accounts.user();
    if (!user) {
      box.hidden = false;
      box.innerHTML = `<div class="grow"><b>Earn coins & unlock items!</b><br><small>Sign in with your school Google account. (Or just play as a guest below.)</small></div>
        <button class="btn small primary" id="signInBtn">Sign in</button>`;
      $('#signInBtn').onclick = () => accounts.signIn().catch(e => alert(e.message));
      return;
    }
    const prof = await accounts.profile();
    account = { user, prof };
    profile.name = prof.display_name;
    profile.av = restrictAvatar(prof.avatar, prof.owned || []);
    $('#nameIn').value = profile.name;
    $('#nameIn').readOnly = true;
    $('#nameNote').hidden = false;
    $('#toAvatar').textContent = 'Join game!';
    box.hidden = false;
    box.innerHTML = `<div class="acct-row"><div class="mini">${avatarSVG(profile.av)}</div>
        <div class="grow"><b>${esc(prof.display_name)}</b>${accounts.mode === 'demo' ? ' <small>(preview)</small>' : ''}</div>
        <span class="coin-pill">🪙 ${fmt(prof.coins)}</span></div>
      <div class="acct-actions">
        <a class="btn small primary" href="shop.html">Shop</a>
        <a class="btn small" href="practice.html">Practice</a>
        <a class="btn small" href="me.html">Profile</a>
        <button class="btn small" id="signOutBtn">Sign out</button>
      </div>`;
    $('#signOutBtn').onclick = async () => { await accounts.signOut(); location.reload(); };
    // Came back from signing in during a game: rejoin it automatically.
    let auto = null;
    try { auto = sessionStorage.getItem('wr_autojoin'); sessionStorage.removeItem('wr_autojoin'); } catch { /* ignore */ }
    if (auto && /^\d{5}$/.test(auto)) { $('#codeIn').value = auto; code = auto; connect(); }
  } catch (e) {
    console.warn(e);
    box.hidden = false;
    box.innerHTML = `<div class="grow"><small>${esc(e.message)}</small></div>`;
  }
}

// ---------------- Join ----------------
// Game code from the QR link (?join=12345). Older links used ?code=, which Google sign-in also uses, so only accept 5 digits.
const qs = new URLSearchParams(location.search);
const urlCode = qs.get('join') || (/^\d{5}$/.test(qs.get('code') || '') ? qs.get('code') : '');
$('#codeIn').value = (urlCode || '').replace(/\D/g, '').slice(0, 5);
$('#nameIn').value = profile.name || '';

$('#toAvatar').onclick = () => {
  const c = $('#codeIn').value.replace(/\D/g, '');
  const n = $('#nameIn').value.replace(/\s+/g, ' ').trim();
  if (c.length !== 5) return ($('#joinErr').textContent = 'The game code is 5 numbers. Look at the big screen.');
  if (!n) return ($('#joinErr').textContent = 'Please type your name.');
  $('#joinErr').textContent = '';
  code = c;
  if (account) return connect(); // signed-in heroes are designed in the shop
  profile.name = n.slice(0, 16);
  save('cq_profile', profile);
  renderBuilder();
  show('s-avatar');
};
$('#codeIn').addEventListener('keydown', e => { if (e.key === 'Enter') $('#nameIn').focus(); });
$('#nameIn').addEventListener('keydown', e => { if (e.key === 'Enter') $('#toAvatar').click(); });
$('#backToJoin').onclick = () => show('s-join');
$('#joinBtn').onclick = () => { save('cq_profile', profile); connect(); };
$('#msgBtn').onclick = () => show('s-join');

// ---------------- Guest hero builder (free options only) ----------------
const GROUPS = [
  { key: 'cls', title: 'Hero class', items: CLASSES.map(c => c.label) },
  { key: 'style', title: 'Outfit', items: STYLES.map(st => st.label) },
  { key: 'color', title: 'Adventurer outfit color', swatch: COLORS },
  { key: 'skin', title: 'Skin tone', swatch: SKINS },
  { key: 'hat', title: 'Hair / hat', items: HATS.map(h => h.label) },
  { key: 'hc', title: 'Hair / hat color', swatch: COLORS },
  { key: 'face', title: 'Face', items: FACES.map(f => f.label) },
];

function renderBuilder() {
  $('#preview').innerHTML = avatarSVG(profile.av);
  $('#optGroups').innerHTML = GROUPS.map(g => `
    <div class="opt-group"><h4>${g.title}</h4><div class="opts">
      ${(g.swatch || g.items).map((v, i) => g.swatch
        ? `<button class="opt swatch ${profile.av[g.key] === i ? 'sel' : ''}" data-k="${g.key}" data-v="${i}" style="background:${v}" aria-label="${g.title} ${i + 1}"></button>`
        : `<button class="opt ${profile.av[g.key] === i ? 'sel' : ''}" data-k="${g.key}" data-v="${i}">${esc(v)}</button>`).join('')}
    </div></div>`).join('');
}
$('#optGroups').addEventListener('click', e => {
  const b = e.target.closest('.opt'); if (!b) return;
  profile.av[b.dataset.k] = +b.dataset.v;
  renderBuilder();
});
$('#randomize').onclick = () => { profile.av = randomAvatar(); renderBuilder(); };

// ---------------- Networking ----------------
// Messages from a student go only to the projector (host), not to every iPad.
const toHost = (m, opts) => {
  try { const r = net && net.toHost(m, opts); if (r && r.catch) r.catch(e => console.warn(e)); } catch (e) { console.warn(e); }
};
// Privacy: signed-in iPads send a random ticket for this game, never their account ID.
// The ticket is registered in the database first (join_game), so only the projector can
// look up whose it is.
function ticketFor(c) {
  const key = 'wr_tk_' + pid, all = load(key, {});
  if (!all[c]) { for (const k of Object.keys(all)) if (Object.keys(all).length > 5) delete all[k]; all[c] = uid(10) + '-' + uid(10); save(key, all); }
  return all[c];
}
let classNote = '';
async function register() {
  if (!account) return;
  try {
    const r = await accounts.joinGame(code, ticketFor(code));
    if (r && r.class) classNote = `You’re now in the class “${r.class}”.`;
  } catch (e) { console.warn(e); }
}
const sendJoin = (viaRoom = false) => toHost({ t: 'join', id: pid, tk: account ? ticketFor(code) : null, acct: !!account, name: profile.name, av: profile.av }, { viaRoom });

// If an update seems to be missing (e.g. the iPad dozed off), politely ask the host to resend.
let lastSync = 0;
setInterval(() => {
  if (!joined || !last || (last.phase !== 'question' && last.phase !== 'dig')) return;
  const now = performance.now();
  if (now > deadline + 4000 && now - lastSync > 5000) { lastSync = now; toHost({ t: 'sync' }); }
}, 1000);

async function connect() {
  show('s-connecting');
  joined = false; shownKey = null; last = null; myAns = -1;
  try {
    if (net && netCode !== code) { net.close(); net = null; }
    if (!net) { net = await openRoom(code, onMsg, 'player'); netCode = code; }
  } catch (e) {
    console.error(e);
    return message('Could not connect. Check your internet and try again.');
  }
  joinTries = 0;
  clearInterval(joinTimer);
  await register();
  sendJoin();
  joinTimer = setInterval(() => {
    if (joined) return clearInterval(joinTimer);
    if (++joinTries >= 4) {
      clearInterval(joinTimer);
      $('#joinErr').textContent = `Couldn’t find game ${code}. Check the code on the big screen.`;
      show('s-join');
      return;
    }
    // No reply through the inbox, so switch to the always-works room channel.
    net.useRoomForHost();
    sendJoin(true);
  }, 2000);
  keepAwake();
}

function message(text) { $('#msgText').textContent = text; $('#msgSignIn').hidden = true; show('s-msg'); }
function signInNeeded() {
  $('#msgText').textContent = 'Your teacher wants everyone signed in for this game. Sign in with your school Google account and you’ll come right back.';
  $('#msgSignIn').hidden = false;
  show('s-msg');
}
$('#msgSignIn').onclick = () => $('#waitSignInBtn').click();

function onMsg(m) {
  if (!m || typeof m !== 'object') return;
  if (m.to && m.to !== pid) return;
  if (m.t === 'joined') {
    clearInterval(joinTimer);
    if (m.ok) {
      joined = true;
      coinsOn = !!m.coinsOn;
      joinedGame = code;
      if (m.state) last = m.state;
      render(last || { phase: 'lobby' });
    } else if (m.reason === 'kicked') {
      joined = false; message('Your teacher removed you from this game.');
    } else if (m.reason === 'locked') {
      joined = false; message('This game is locked. Ask your teacher to unlock it.');
    } else if (m.reason === 'signin') {
      joined = false;
      if (account) message('We couldn’t check your sign-in for this game. Wait a moment, then tap OK and try again.');
      else signInNeeded();
    } else {
      joined = false; $('#joinErr').textContent = m.reason || 'Could not join.'; show('s-join');
    }
  } else if (m.t === 'mq' || m.t === 'mres') {
    if (joined) mazeMsg(m);
  } else if (m.t === 'tmap' || m.t === 'tt') {
    if (joined) terPad.onMsg(m);
  } else if (m.t === 'reg') {
    // The teacher just signed in on the projector: register again so coins work.
    if (account && joined) register().then(() => sendJoin());
  } else if (m.t === 'kicked') {
    joined = false; message('Your teacher removed you from this game.');
  } else if (m.t === 'state') {
    last = m;
    if (!joined) {
      if (m.stats && pid in m.stats) joined = true; else return;
    }
    render(m);
  }
}

// ---------------- Rendering game state ----------------
const myStats = s => (s.stats && s.stats[pid]) || [0, 0, 0, ''];
const GAME_TEXT = {
  raid: { intro: 'The boss is here!', right: 'HIT!', wrong: 'Missed!' },
  corners: { intro: 'Get ready to run!', right: 'SAFE!', wrong: 'LAVA!' },
  treasure: { intro: 'Treasure Hunt!', right: 'CORRECT!', wrong: 'Not quite!' },
  maze: { intro: 'A wild Mr. C appeared!', right: 'CORRECT!', wrong: 'Not quite!' },
  territory: { intro: 'Red vs Blue!', right: 'CORRECT!', wrong: 'Not quite!' },
};
const text = s => GAME_TEXT[s.mode] || GAME_TEXT.raid;

function startTimer(barSel, screenSel) {
  cancelAnimationFrame(raf);
  const loop = () => {
    const remain = Math.max(0, deadline - performance.now());
    $(barSel).style.transform = `scaleX(${remain / limit})`;
    if (remain > 0 && $(screenSel).classList.contains('active')) raf = requestAnimationFrame(loop);
  };
  loop();
}

// ---------------- Emotes (between questions only) ----------------
const EMOTE_PHASES = ['lobby', 'intro', 'reveal', 'dug', 'end'];
let emoteCool = 0;
function renderEmoteBar(s) {
  const bar = $('#emoteBar');
  const allowed = joined && s && s.emotes !== false && EMOTE_PHASES.includes(s.phase);
  if (!allowed) { bar.hidden = true; return; }
  const list = usableEmotes(account ? account.prof.owned : []);
  const sig = list.map(e => e.id).join(',');
  if (bar.dataset.sig !== sig) {
    bar.dataset.sig = sig;
    bar.innerHTML = list.map(e => `<button data-e="${e.id}" title="${esc(e.name)}">${esc(e.text)}</button>`).join('') +
      (account ? '<a class="hint" href="shop.html">More in the shop</a>' : '<span class="hint">Sign in to unlock more emotes</span>');
  }
  bar.hidden = false;
}
$('#emoteBar').addEventListener('click', e => {
  const b = e.target.closest('[data-e]'); if (!b || !last) return;
  const now = performance.now();
  if (now < emoteCool) return;
  emoteCool = now + 3000;
  toHost({ t: 'emote', id: pid, e: b.dataset.e });
  const btns = document.querySelectorAll('#emoteBar button');
  btns.forEach(x => (x.disabled = true));
  setTimeout(() => btns.forEach(x => (x.disabled = false)), 3000);
});

function render(s) {
  renderEmoteBar(s);
  const key = s.phase + ':' + s.qi;
  document.querySelectorAll('.score-label').forEach(el => (el.textContent = s.scoreName || 'Score'));
  if (s.phase === 'lobby' || s.phase === 'intro') {
    myAns = -1; myPick = -1;
    if (shownKey === key) return;
    shownKey = key;
    showWait(s.phase === 'intro' ? text(s).intro : 'You’re in!',
      s.phase === 'intro' ? 'Get ready to answer…' : 'Walk around the classroom on the big screen while you wait!' +
        (account && !coinsOn ? ' (Coins are off for this game.)' : account ? ' Coins are on!' : ''), s.phase === 'lobby');
  } else if (s.phase === 'question') {
    const newDeadline = performance.now() + (s.remain || 0);
    if (shownKey !== key || Math.abs(newDeadline - deadline) > 1500) deadline = newDeadline;
    limit = s.limit || 1;
    if (s.change) { // Four Corners: stay on the choices so the student can switch corners
      if (shownKey !== key) { shownKey = key; myPick = s.picks && pid in s.picks ? s.picks[pid] : -1; renderQuestion(s); }
      return;
    }
    const answered = myAns === s.qi || (s.ans || []).includes(pid);
    if (answered) {
      if (shownKey !== key + ':locked') { shownKey = key + ':locked'; showLocked(); }
    } else if (shownKey !== key) {
      shownKey = key;
      renderQuestion(s);
    }
  } else if (s.phase === 'play') {
    renderMaze(s);
  } else if (s.phase === 'reveal') {
    if (shownKey === key) return;
    shownKey = key;
    renderResult(s);
  } else if (s.phase === 'dig') {
    const newDeadline = performance.now() + (s.dig ? s.dig.remain : 0);
    if (shownKey !== key) { deadline = newDeadline; myDig = -1; }
    limit = s.dig ? s.dig.limit : 1;
    if (shownKey === key) return;
    shownKey = key;
    if (s.dig && s.dig.diggers.includes(pid)) renderDig(s);
    else showWait('Watch the island!', 'Answer the next one right to earn a dig.');
  } else if (s.phase === 'dug') {
    if (shownKey === key) return;
    shownKey = key;
    const line = s.dres && s.dres[pid];
    if (line) showResultLine(s, /trap|nothing/i.test(line) ? 'Dig done!' : 'TREASURE!', line, !/trap/i.test(line));
    else showWait('Digging done!', 'Get ready for the next question.');
  } else if (s.phase === 'end') {
    if (shownKey === key + (s.coins ? ':coins' : '')) return;
    shownKey = key + (s.coins ? ':coins' : '');
    renderEnd(s);
  }
}

function showWait(title, sub, lobby = false) {
  $('#waitSignIn').hidden = !!account;
  $('#waitClass').textContent = classNote;
  $('#waitClass').hidden = !classNote;
  $('#lobbyPad').hidden = !lobby;
  $('#s-wait').classList.toggle('with-pad', lobby);
  if (!lobby) setDir(null);
  $('#waitHero').innerHTML = avatarSVG(profile.av);
  $('#waitName').textContent = profile.name;
  $('#waitTitle').textContent = title;
  $('#waitSub').textContent = sub;
  show('s-wait');
}

function renderQuestion(s) {
  const [score, , , tag] = myStats(s);
  $('#qNum').textContent = `Question ${s.qi + 1} / ${s.total}`;
  $('#qBoss').textContent = [s.hud, tag].filter(Boolean).join(' · ');
  $('#qDmg').textContent = `${s.scoreName || 'Score'} ${fmt(score)}`;
  $('#qPrompt').textContent = s.q.prompt;
  $('#pChoices').innerHTML = s.q.choices.map((c, i) =>
    `<button class="choice ${CHOICE_STYLE[i].cls} ${i === myPick ? 'picked' : ''}" data-c="${i}"><span class="ico">${CHOICE_STYLE[i].icon}</span><span>${esc(c)}</span></button>`).join('') +
    (s.change ? `<div class="pick-note" id="pickNote" style="grid-column:1/-1">${myPick >= 0 ? 'Running there! You can switch until time runs out.' : 'Tap a corner to run there!'}</div>` : '');
  show('s-question');
  startTimer('#tBar', '#s-question');
}

$('#pChoices').addEventListener('click', e => {
  const b = e.target.closest('.choice');
  if (!b || !last || last.phase !== 'question') return;
  const c = +b.dataset.c;
  if (last.change) {
    if (c === myPick) return;
    myPick = c;
    toHost({ t: 'ans', id: pid, q: last.qi, c });
    document.querySelectorAll('#pChoices .choice').forEach(el => el.classList.toggle('picked', +el.dataset.c === c));
    const note = $('#pickNote'); if (note) note.textContent = 'Running there! You can switch until time runs out.';
    return;
  }
  if (myAns === last.qi) return;
  myAns = last.qi;
  toHost({ t: 'ans', id: pid, q: last.qi, c });
  shownKey = last.phase + ':' + last.qi + ':locked';
  showLocked();
});

function showLocked() {
  $('#lockHero').innerHTML = avatarSVG(profile.av);
  show('s-locked');
}

function renderResult(s) {
  const res = s.res && s.res[pid];
  const right = s.q.choices[s.correct];
  const correct = !!res && res[0] === s.correct;
  const line = res && res[2] ? esc(res[2]) : '';
  showResultLine(s, correct ? text(s).right : res ? text(s).wrong : 'Time’s up!',
    correct ? line : `Correct answer: <b>${esc(right)}</b>` + (line ? `<br>${line}` : ''), correct, true);
}

function showResultLine(s, title, html, good, isHtml = false) {
  const [score, correct] = myStats(s);
  const hero = $('#resHero');
  hero.innerHTML = avatarSVG(profile.av);
  hero.className = 'hero-big';
  const t = $('#resTitle');
  t.textContent = title; t.className = 'result-big ' + (good ? 'good' : 'bad');
  if (isHtml) $('#resSub').innerHTML = html; else $('#resSub').textContent = html;
  void hero.offsetWidth; hero.classList.add(good ? 'hero-attack' : 'hero-sad');
  $('#resDmg').textContent = fmt(score);
  $('#resCorrect').textContent = `${correct} / ${s.qi + 1}`;
  $('#resNote').textContent = s.note || s.hud || '';
  show('s-result');
}

function renderDig(s) {
  const d = s.dig;
  $('#digHud').textContent = s.hud || '';
  const grid = $('#digGrid');
  grid.style.setProperty('--tw', d.w);
  grid.innerHTML = [...d.dug].map((c, i) => `<button data-i="${i}" ${c !== '.' ? 'disabled' : ''}>${i + 1}</button>`).join('');
  show('s-dig');
  startTimer('#digBar', '#s-dig');
}

$('#digGrid').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b || b.disabled || !last || last.phase !== 'dig' || myDig >= 0) return;
  myDig = +b.dataset.i;
  toHost({ t: 'dig', id: pid, tile: myDig });
  showWait('Digging…', `You picked spot ${myDig + 1}. Look at the big screen!`);
});

function renderEnd(s) {
  const [score, correct] = myStats(s);
  const rank = (s.ranks || []).indexOf(pid) + 1;
  $('#endHero').innerHTML = avatarSVG(profile.av);
  $('#endTitle').textContent = s.title || 'Game over!';
  $('#endTitle').className = 'result-big ' + (s.win === false ? 'bad' : 'good');
  $('#endSub').textContent = s.sub || '';
  $('#endRank').textContent = rank ? `#${rank} of ${s.ranks.length}` : '-';
  $('#endDmg').textContent = fmt(score);
  const asked = myStats(s)[4];
  $('#endCorrect').textContent = `${correct} / ${asked ?? s.total}`;
  const coins = s.coins && s.coins[pid];
  $('#endCoins').innerHTML = coins
    ? `<div class="coin-pill" style="font-size:1rem">🪙 +${fmt(coins)} coins!</div><p><a class="btn primary" href="shop.html">Visit the shop</a></p>`
    : !account ? '<p class="muted">Sign in with Google next time to earn coins for the shop!</p>' : '';
  show('s-end');
}

// ---------------- Mr. C's Maze: arrow pad + personal questions ----------------
let mzToken = null, mzDir = null, mzRefresh = null, mzDone = false, mzEnd = 0, mzClock = null;
function renderMaze(s) {
  const [score, , , tag] = myStats(s);
  $('#mzHearts').textContent = tag || '';
  $('#mzScore').textContent = `${fmt(score)} pts`;
  if (s.left !== undefined) mzEnd = performance.now() + s.left;
  if (shownKey !== 'play') {
    shownKey = 'play';
    mzDone = false; mzToken = null;
    $('#mzHero').innerHTML = avatarSVG(profile.av);
    $('#mzQ').hidden = true; $('#dpad').hidden = false;
    $('#mzMsg').className = 'card mz-msg';
    const pads = s.mode === 'territory' && s.pads;
    $('#s-maze').classList.toggle('ter-mode', !!pads);
    $('#terPad').hidden = !pads;
    if (pads) terPad.ready();
    $('#mzMsg').textContent = s.mode === 'territory'
      ? `You’re on ${tag ? 'the ' + tag : 'a team'}! Walk with the arrows to paint the ${pads ? 'map. Your hero is the one marked YOU.' : 'arena.'} Bump into an enemy to duel: answer first to win!`
      : 'Use the arrows to move your hero through the maze. Watch the big screen!';
    show('s-maze');
    clearInterval(mzClock);
    mzClock = setInterval(() => {
      const left = Math.max(0, mzEnd - performance.now());
      $('#mzTime').textContent = `⏱ ${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}`;
      if (!$('#s-maze').classList.contains('active')) clearInterval(mzClock);
    }, 500);
  }
}

function setDir(d) {
  if (d === mzDir) return;
  mzDir = d;
  document.querySelectorAll('.dpad button').forEach(b => b.classList.toggle('held', b.dataset.d === d));
  toHost({ t: 'dir', id: pid, d });
  clearInterval(mzRefresh);
  // Keeps walking while held. In the lobby (just for fun) resend less often to save messages.
  const lobby = $('#s-wait').classList.contains('active');
  if (d) mzRefresh = setInterval(() => toHost({ t: 'dir', id: pid, d: mzDir }), lobby ? 3000 : 1000);
}
for (const dpad of document.querySelectorAll('.dpad')) {
  dpad.addEventListener('pointerdown', e => { const b = e.target.closest('[data-d]'); if (!b) return; e.preventDefault(); b.setPointerCapture?.(e.pointerId); setDir(b.dataset.d); });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(ev => dpad.addEventListener(ev, () => setDir(null)));
  dpad.addEventListener('contextmenu', e => e.preventDefault());
}
const KEYS = { ArrowUp: 'u', ArrowDown: 'd', ArrowLeft: 'l', ArrowRight: 'r', w: 'u', s: 'd', a: 'l', d: 'r' };
const padActive = () => ($('#s-maze').classList.contains('active') && !$('#dpad').hidden) || ($('#s-wait').classList.contains('active') && !$('#lobbyPad').hidden);
document.addEventListener('keydown', e => { if (padActive() && KEYS[e.key]) { e.preventDefault(); setDir(KEYS[e.key]); } });
document.addEventListener('keyup', e => { if (KEYS[e.key] && KEYS[e.key] === mzDir) setDir(null); });

const terPad = createTerPad({
  box: $('#terPad'), getCode: () => code, pid, avatarSVG, toHost,
  getDir: () => mzDir, canMove: () => !mzToken && !mzDone,
  active: () => $('#s-maze').classList.contains('active') && !$('#terPad').hidden,
});

function mazeMsg(m) {
  if (!$('#s-maze').classList.contains('active')) { shownKey = null; renderMaze(last || { phase: 'play' }); }
  if (m.t === 'mq') {
    setDir(null);
    mzToken = m.k;
    $('#dpad').hidden = true;
    $('#mzQ').hidden = false;
    $('#mzKind').textContent = m.kind === 'zap' ? '⚡ ZAP MR. C! Answer right to knock him out!' : m.kind === 'fight' ? '⚔ MR. C ATTACKS! Answer to fight back!'
      : m.kind === 'duel' ? `🗡️ DUEL vs ${m.vs || 'an enemy'}! Answer right FIRST to win!` : m.kind === 'ink' ? '🖌 OUT OF INK: answer to refill' : '🔒 LOCKED GATE: answer to open it';
    $('#mzKind').className = 'kind ' + (m.kind === 'fight' || m.kind === 'duel' ? 'fight' : '');
    $('#mzPrompt').textContent = m.q.prompt;
    $('#mzChoices').innerHTML = m.q.choices.map((c, i) =>
      `<button class="choice ${CHOICE_STYLE[i].cls}" data-c="${i}"><span class="ico">${CHOICE_STYLE[i].icon}</span><span>${esc(c)}</span></button>`).join('');
    $('#mzMsg').className = 'card mz-msg ' + (m.kind === 'fight' || m.kind === 'duel' ? 'bad' : '');
    $('#mzMsg').textContent = m.kind === 'fight' ? 'Battle! Get it right to bonk Mr. C away!' : m.kind === 'duel' ? 'Quick! You both have the same question.'
      : m.kind === 'ink' ? 'Get it right for a full tank of ink.' : 'Answer correctly to unlock this gate.';
  } else {
    mzToken = null;
    $('#mzQ').hidden = true;
    $('#mzMsg').className = 'card mz-msg ' + (m.ok ? 'good' : 'bad');
    $('#mzMsg').textContent = m.line;
    $('#mzHearts').textContent = m.tag !== undefined ? m.tag : '♥'.repeat(m.hp || 0) + '♡'.repeat(Math.max(0, 3 - (m.hp || 0))) + (m.bolts ? ' ⚡' + m.bolts : '');
    $('#mzScore').textContent = `${fmt(m.score || 0)} pts`;
    if (m.done) { mzDone = true; $('#dpad').hidden = true; setDir(null); }
    else $('#dpad').hidden = false;
  }
}
$('#mzChoices').addEventListener('click', e => {
  const b = e.target.closest('.choice'); if (!b || !mzToken) return;
  toHost({ t: 'mans', id: pid, k: mzToken, c: +b.dataset.c });
  document.querySelectorAll('#mzChoices .choice').forEach(x => (x.disabled = true));
  b.classList.add('picked');
});

// Guests can sign in from the waiting screen and come straight back into the game.
$('#waitSignInBtn').onclick = () => {
  try { sessionStorage.setItem('wr_autojoin', code); } catch { /* ignore */ }
  const back = new URL('index.html', location.href); back.searchParams.set('join', code);
  accounts.signIn(back.href).catch(e => alert(e.message));
};

// ---------------- iPad niceties ----------------
let wakeLock = null;
async function keepAwake() {
  try { if ('wakeLock' in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => (wakeLock = null)); } } catch { /* not supported */ }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && net && code) { sendJoin(); keepAwake(); }
});

loadAccount();
