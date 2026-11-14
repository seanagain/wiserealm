// Student screen (iPad). Joins a game, shows questions, sends answers.
// Works for every game type; the projector tells it which game is running.
// Students can play as a guest, or sign in with Google to use their shop hero and earn coins.
import { $, esc, show, uid, load, save, fmt, CHOICE_STYLE } from './common.js';
import { openRoom, isOnline } from './net.js';
import { accounts } from './supa.js';
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
    box.innerHTML = `<div class="mini">${avatarSVG(profile.av)}</div>
      <div class="grow"><b>${esc(prof.display_name)}</b>${accounts.mode === 'demo' ? ' <small>(preview)</small>' : ''}<br><span class="coin-pill">🪙 ${fmt(prof.coins)}</span></div>
      <a class="btn small primary" href="shop.html">Shop</a>
      <a class="btn small" href="me.html">Profile</a>
      <button class="btn small" id="signOutBtn">Sign out</button>`;
    $('#signOutBtn').onclick = async () => { await accounts.signOut(); location.reload(); };
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
const sendJoin = (viaRoom = false) => toHost({ t: 'join', id: pid, uid: account ? account.user.id : null, name: profile.name, av: profile.av }, { viaRoom });

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

function message(text) { $('#msgText').textContent = text; show('s-msg'); }

function onMsg(m) {
  if (!m || typeof m !== 'object') return;
  if (m.to && m.to !== pid) return;
  if (m.t === 'joined') {
    clearInterval(joinTimer);
    if (m.ok) {
      joined = true;
      coinsOn = !!m.coinsOn;
      // Register this account in the game so it can earn coins.
      if (account && joinedGame !== code) { joinedGame = code; accounts.joinGame(code).catch(e => console.warn(e)); }
      if (m.state) last = m.state;
      render(last || { phase: 'lobby' });
    } else if (m.reason === 'kicked') {
      joined = false; message('Your teacher removed you from this game.');
    } else {
      joined = false; $('#joinErr').textContent = m.reason || 'Could not join.'; show('s-join');
    }
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

function render(s) {
  const key = s.phase + ':' + s.qi;
  document.querySelectorAll('.score-label').forEach(el => (el.textContent = s.scoreName || 'Score'));
  if (s.phase === 'lobby' || s.phase === 'intro') {
    myAns = -1; myPick = -1;
    if (shownKey === key) return;
    shownKey = key;
    showWait(s.phase === 'intro' ? text(s).intro : 'You’re in!',
      s.phase === 'intro' ? 'Get ready to answer…' : 'Look at the big screen. Your teacher will start soon.' +
        (account && !coinsOn ? ' (Coins are off for this game.)' : account ? ' Coins are on!' : ''));
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

function showWait(title, sub) {
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
  $('#endCorrect').textContent = `${correct} / ${s.total}`;
  const coins = s.coins && s.coins[pid];
  $('#endCoins').innerHTML = coins
    ? `<div class="coin-pill" style="font-size:1rem">🪙 +${fmt(coins)} coins!</div><p><a class="btn primary" href="shop.html">Visit the shop</a></p>`
    : !account ? '<p class="muted">Sign in with Google next time to earn coins for the shop!</p>' : '';
  show('s-end');
}

// ---------------- iPad niceties ----------------
let wakeLock = null;
async function keepAwake() {
  try { if ('wakeLock' in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => (wakeLock = null)); } } catch { /* not supported */ }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && net && code) { sendJoin(); keepAwake(); }
});

loadAccount();
