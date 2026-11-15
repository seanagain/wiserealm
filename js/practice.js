// Practice hub: assigned sets, mastery, streak, and the four solo study games.
import { $, $$, esc, fmt, shuffle } from './common.js';
import { accounts } from './supa.js';
import { questionFor } from './sets.js';
import { avatarSVG, restrictAvatar } from './avatar.js';
import training from './solo/training.js';
import blaster from './solo/blaster.js';
import match from './solo/match.js';
import dungeon from './solo/dungeon.js';

const GAMES = [training, blaster, match, dungeon];
const norm = s => String(s ?? '').trim().toLowerCase();
let data = null, prof = null, current = null;

function view(id) { ['gate', 'hub', 'pick', 'game', 'result'].forEach(v => ($('#' + v).hidden = v !== id)); window.scrollTo(0, 0); }

function stars(n) { return '★'.repeat(Math.max(0, n)) + '☆'.repeat(3 - Math.max(0, n)); }

function renderTop() {
  $('#streakPill').hidden = false; $('#coinPill').hidden = false;
  $('#streakPill').textContent = `🔥 ${data.streak} day${data.streak === 1 ? '' : 's'}`;
  $('#coinPill').textContent = `🪙 ${data.today_coins}/${data.cap} today`;
  $('#capText').textContent = data.cap;
}

function renderHub() {
  renderTop();
  $('#sets').innerHTML = data.sets.length ? data.sets.map(s => {
    const pct = s.cards ? Math.round((100 * s.mastered) / s.cards) : 0;
    return `<div class="card set-card"><h3>${esc(s.title)}</h3><div class="muted">${esc(s.class_name)} · ${s.cards} cards</div>
      <div>Mastered <span class="pctbar"><span style="width:${pct}%"></span></span> <b>${s.mastered}/${s.cards}</b></div>
      <div class="row"><button class="btn primary" data-set="${esc(s.id)}">Practice ▶</button></div></div>`;
  }).join('') : '<div class="card pr-panel">Your teacher hasn’t assigned any sets to your class yet. Make sure you’ve joined your class on <a href="me.html">My profile</a>.</div>';
  view('hub');
}

async function openSet(id) {
  const set = data.sets.find(s => s.id === id); if (!set) return;
  const rows = await accounts.myCards(id);
  const cards = new Map(rows.map(r => [r.card_key, r.box]));
  current = { set, cards };
  $('#pickTitle').textContent = set.title;
  const counts = [0, 0, 0, 0]; let unseen = 0;
  set.items.forEach(it => { const b = cards.get(norm(it.prompt)); if (b === undefined) unseen++; else counts[b]++; });
  $('#pickMastery').innerHTML = `<div class="flex" style="gap:18px">
    <span><b>${counts[3]}</b> ★★★ mastered</span><span><b>${counts[2]}</b> ★★☆</span><span><b>${counts[1]}</b> ★☆☆</span>
    <span><b>${counts[0]}</b> need work</span><span class="muted"><b>${unseen}</b> not tried yet</span></div>`;
  $('#games').innerHTML = GAMES.map(g => `<div class="card game-card"><div class="gicon">${g.icon}</div><h3>${esc(g.name)}</h3>
    <p class="muted">${esc(g.blurb)}</p><button class="btn primary" data-game="${g.id}">Play</button></div>`).join('');
  view('pick');
}

// Everything a game needs: questions (weakest cards first), recording answers, finishing.
function makeCtx(game) {
  const { set, cards } = current;
  const items = set.items;
  const log = [];
  const startedAt = performance.now();
  const box = i => { const b = cards.get(norm(items[i].prompt)); return b === undefined ? -1 : b; };
  const order = n => {
    const idx = shuffle(items.map((_, i) => i)).sort((a, b) => box(a) - box(b));
    return n ? idx.slice(0, n) : idx;
  };
  let pool = [];
  return {
    set, items, root: $('#game'), box, stars, order, esc, fmt,
    hero: prof ? avatarSVG(restrictAvatar(prof.avatar, prof.owned || [])) : '',
    next() { if (!pool.length) pool = order(); return pool.shift(); },
    question: i => ({ i, ...questionFor(items, i) }),
    // Returns true if right. The database grades it again when the game is saved.
    record(i, answerText) {
      const ok = norm(answerText) === norm(items[i].answer);
      log.push({ q: i, a: String(answerText ?? '') });
      const k = norm(items[i].prompt), b = cards.get(k);
      cards.set(k, ok ? Math.min(3, (b === undefined ? 0 : b) + 1) : 0);
      return ok;
    },
    answered: () => log.length,
    async finish(score, headline) {
      const dur = Math.round((performance.now() - startedAt) / 1000);
      $('#result').innerHTML = '<div class="spinner" style="margin:30px auto"></div>';
      view('result');
      let res = null;
      if (log.length) { try { res = await accounts.savePractice(set.id, game.id, log, Math.round(score), dur); } catch (e) { res = { error: e.message }; } }
      showResult(game, headline, score, res, log.length);
    },
    quit() { openSet(set.id); },
  };
}

function showResult(game, headline, score, res, n) {
  const right = res && !res.error ? res.correct : null;
  $('#result').innerHTML = `<h1 style="margin-top:0">${esc(headline || 'Nice work!')}</h1>
    <div class="tiles" style="margin:16px 0">
      <div class="card tile-stat"><div class="lbl">Score</div><div class="num">${fmt(score)}</div></div>
      <div class="card tile-stat"><div class="lbl">Correct</div><div class="num">${right === null ? '-' : `${right}/${res.answered}`}</div></div>
      <div class="card tile-stat"><div class="lbl">Coins</div><div class="num">${res && !res.error ? '+' + res.coins : '-'}</div><div class="sub">${res && !res.error ? `${res.today_coins}/${res.cap} today` : ''}</div></div>
      <div class="card tile-stat"><div class="lbl">Streak</div><div class="num">${res && !res.error ? '🔥 ' + res.streak : '-'}</div><div class="sub">days in a row</div></div>
    </div>
    ${res && res.error ? `<p style="color:var(--bad)">Couldn’t save this game: ${esc(res.error)}</p>` : ''}
    ${res && !res.error && res.today_coins >= res.cap ? '<p class="muted">You’ve hit today’s practice coin limit. Practicing still builds your stars! ⭐</p>' : ''}
    ${!n ? '<p class="muted">No answers this time, so nothing was saved.</p>' : ''}
    <div class="flex" style="justify-content:center"><button class="btn primary big" id="again">Play again</button><button class="btn big" id="toSet">Choose another game</button></div>`;
  $('#again').onclick = () => startGame(game.id);
  $('#toSet').onclick = async () => { await reload(); openSet(current.set.id); };
  reload().then(renderTop).catch(() => {});
}

function startGame(id) {
  const game = GAMES.find(g => g.id === id);
  $('#game').innerHTML = '';
  view('game');
  game.run(makeCtx(game));
}

async function reload() { data = await accounts.myPractice(); return data; }

$('#sets').addEventListener('click', e => { const b = e.target.closest('[data-set]'); if (b) openSet(b.dataset.set); });
$('#games').addEventListener('click', e => { const b = e.target.closest('[data-game]'); if (b) startGame(b.dataset.game); });
$('#pickBack').onclick = async () => { await reload(); renderHub(); };
$('#signIn').onclick = () => accounts.signIn().catch(err => ($('#gateErr').textContent = err.message));

(async function init() {
  $('#previewBanner').hidden = accounts.mode !== 'demo';
  try {
    const user = await accounts.user();
    if (!user) { view('gate'); return; }
    prof = await accounts.profile();
    await reload();
    renderHub();
  } catch (e) { view('gate'); $('#gateErr').textContent = e.message; }
})();
