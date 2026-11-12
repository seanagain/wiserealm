// Student screen (iPad). Joins a game, shows questions, sends answers.
import { $, esc, show, uid, load, save, fmt, CHOICE_STYLE } from './common.js';
import { openRoom, isOnline } from './net.js';
import { avatarSVG, normalizeAvatar, randomAvatar, SKINS, COLORS, HATS, FACES, CLASSES } from './avatar.js';

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

let net = null, netCode = null, code = '';
let joined = false, joinTries = 0, joinTimer = null;
let last = null, shownKey = null, myAns = -1;
let deadline = 0, limit = 1, raf = null;

// ---------------- Join ----------------
const urlCode = new URLSearchParams(location.search).get('code');
$('#codeIn').value = (urlCode || '').replace(/\D/g, '').slice(0, 5);
$('#nameIn').value = profile.name || '';

$('#toAvatar').onclick = () => {
  const c = $('#codeIn').value.replace(/\D/g, '');
  const n = $('#nameIn').value.replace(/\s+/g, ' ').trim();
  if (c.length !== 5) return ($('#joinErr').textContent = 'The game code is 5 numbers. Look at the big screen.');
  if (!n) return ($('#joinErr').textContent = 'Please type your name.');
  $('#joinErr').textContent = '';
  code = c; profile.name = n.slice(0, 16);
  save('cq_profile', profile);
  renderBuilder();
  show('s-avatar');
};
$('#codeIn').addEventListener('keydown', e => { if (e.key === 'Enter') $('#nameIn').focus(); });
$('#nameIn').addEventListener('keydown', e => { if (e.key === 'Enter') $('#toAvatar').click(); });
$('#backToJoin').onclick = () => show('s-join');
$('#joinBtn').onclick = () => { save('cq_profile', profile); connect(); };
$('#msgBtn').onclick = () => show('s-join');

// ---------------- Avatar builder ----------------
const GROUPS = [
  { key: 'cls', title: 'Hero class', items: CLASSES.map(c => c.label) },
  { key: 'color', title: 'Outfit color', swatch: COLORS },
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
const send = m => { try { net && net.send(m); } catch (e) { console.warn(e); } };
const sendJoin = () => send({ t: 'join', id: pid, name: profile.name, av: profile.av });

async function connect() {
  show('s-connecting');
  joined = false; shownKey = null; last = null; myAns = -1;
  try {
    if (net && netCode !== code) { net.close(); net = null; }
    if (!net) { net = await openRoom(code, onMsg); netCode = code; }
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
    sendJoin();
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
function myStats(s) { return (s.stats && s.stats[pid]) || [0, 0, 0]; }

function render(s) {
  const key = s.phase + ':' + s.qi;
  if (s.phase === 'lobby' || s.phase === 'intro') {
    myAns = -1;
    if (shownKey === key) return;
    shownKey = key;
    $('#waitHero').innerHTML = avatarSVG(profile.av);
    $('#waitName').textContent = profile.name;
    if (s.phase === 'intro') { $('#waitTitle').textContent = '⚔ The boss is here!'; $('#waitSub').textContent = 'Get ready to answer…'; }
    else { $('#waitTitle').textContent = 'You’re in!'; $('#waitSub').textContent = 'Look at the big screen. Your teacher will start soon.'; }
    show('s-wait');
  } else if (s.phase === 'question') {
    const newDeadline = performance.now() + (s.remain || 0);
    if (shownKey !== key || Math.abs(newDeadline - deadline) > 1500) deadline = newDeadline;
    limit = s.limit || 1;
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
  } else if (s.phase === 'end') {
    if (shownKey === key) return;
    shownKey = key;
    renderEnd(s);
  }
}

function bossPct(s) { return s.bossMax ? Math.max(0, Math.round((s.bossHp / s.bossMax) * 100)) : 100; }

function renderQuestion(s) {
  const [dmg] = myStats(s);
  $('#qNum').textContent = `Question ${s.qi + 1} / ${s.total}`;
  $('#qBoss').textContent = `Boss HP ${bossPct(s)}%`;
  $('#qDmg').textContent = `⚔ ${fmt(dmg)}`;
  $('#qPrompt').textContent = s.q.prompt;
  $('#pChoices').innerHTML = s.q.choices.map((c, i) =>
    `<button class="choice ${CHOICE_STYLE[i].cls}" data-c="${i}"><span class="ico">${CHOICE_STYLE[i].icon}</span><span>${esc(c)}</span></button>`).join('');
  show('s-question');
  cancelAnimationFrame(raf);
  const loop = () => {
    const remain = Math.max(0, deadline - performance.now());
    $('#tBar').style.transform = `scaleX(${remain / limit})`;
    if (remain > 0 && $('#s-question').classList.contains('active')) raf = requestAnimationFrame(loop);
  };
  loop();
}

$('#pChoices').addEventListener('click', e => {
  const b = e.target.closest('.choice');
  if (!b || !last || last.phase !== 'question' || myAns === last.qi) return;
  myAns = last.qi;
  send({ t: 'ans', id: pid, q: last.qi, c: +b.dataset.c });
  shownKey = last.phase + ':' + last.qi + ':locked';
  showLocked();
});

function showLocked() {
  $('#lockHero').innerHTML = avatarSVG(profile.av);
  show('s-locked');
}

function renderResult(s) {
  const res = s.res && s.res[pid];
  const [dmg, correct, streak] = myStats(s);
  const right = s.q.choices[s.correct];
  const hero = $('#resHero');
  hero.innerHTML = avatarSVG(profile.av);
  hero.className = 'hero-big';
  const t = $('#resTitle');
  if (res && res[0] === s.correct) {
    t.textContent = 'HIT! ⚔'; t.className = 'result-big good';
    $('#resSub').innerHTML = `You dealt <b style="color:var(--gold)">${fmt(res[1])}</b> damage!` + (streak >= 3 ? `<br>🔥 ${streak} in a row! Bonus damage!` : '');
    void hero.offsetWidth; hero.classList.add('hero-attack');
  } else {
    t.textContent = res ? 'Missed!' : 'Time’s up!'; t.className = 'result-big bad';
    $('#resSub').innerHTML = `Correct answer: <b>${esc(right)}</b>`;
    void hero.offsetWidth; hero.classList.add('hero-sad');
  }
  $('#resDmg').textContent = fmt(dmg);
  $('#resCorrect').textContent = `${correct} / ${s.qi + 1}`;
  $('#resNote').textContent = s.bossHp <= 0 ? 'The boss is going down!' : s.heal ? 'Too many misses, so the boss healed! Teamwork next time!' : `Boss HP: ${bossPct(s)}%`;
  show('s-result');
}

function renderEnd(s) {
  const [dmg, correct] = myStats(s);
  const rank = (s.ranks || []).indexOf(pid) + 1;
  $('#endHero').innerHTML = avatarSVG(profile.av);
  $('#endTitle').textContent = s.win ? '🏆 Victory!' : '💨 It escaped!';
  $('#endTitle').className = 'result-big ' + (s.win ? 'good' : 'bad');
  $('#endSub').textContent = s.win ? 'Your class defeated the boss!' : 'So close! Ask for a rematch!';
  $('#endRank').textContent = rank ? `#${rank} of ${s.ranks.length}` : '-';
  $('#endDmg').textContent = fmt(dmg);
  $('#endCorrect').textContent = `${correct} / ${s.total}`;
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
