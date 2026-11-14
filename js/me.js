// Student profile: hero, classes, stats, accuracy chart, achievements, recent games.
import { $, esc, fmt } from './common.js';
import { accounts } from './supa.js';
import { avatarSVG, restrictAvatar } from './avatar.js';
import { barChart, enableTips } from './charts.js';

const MODE_NAMES = { raid: 'Boss Raid', corners: 'Four Corners', treasure: 'Treasure Hunt' };
const day = d => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const acc = g => (g.total ? Math.round((100 * g.correct) / g.total) : 0);

// Achievements are worked out from the student's saved games.
function badges(stats, prof) {
  const g = stats.games;
  const totalC = g.reduce((s, x) => s + x.correct, 0), totalQ = g.reduce((s, x) => s + x.total, 0);
  const modes = new Set(g.map(x => x.mode));
  return [
    { ic: '⚔️', name: 'First Quest', desc: 'Play your first game', ok: g.length >= 1 },
    { ic: '🧭', name: 'Adventurer', desc: 'Play 10 games', ok: g.length >= 10 },
    { ic: '🛡️', name: 'Veteran', desc: 'Play 25 games', ok: g.length >= 25 },
    { ic: '👑', name: 'Legend', desc: 'Play 50 games', ok: g.length >= 50 },
    { ic: '💯', name: 'Perfect!', desc: 'Get every question right in a game', ok: g.some(x => x.total >= 3 && x.correct === x.total) },
    { ic: '🏆', name: 'Champion', desc: 'Finish 1st in a game with 3+ players', ok: g.some(x => x.rank === 1 && x.players >= 3) },
    { ic: '🥉', name: 'Podium Regular', desc: 'Finish in the top 3 five times', ok: g.filter(x => x.rank && x.rank <= 3).length >= 5 },
    { ic: '🧠', name: 'Sharp Mind', desc: '80%+ accuracy over 5+ games', ok: g.length >= 5 && totalQ && totalC / totalQ >= 0.8 },
    { ic: '🗺️', name: 'Explorer', desc: 'Play all three game types', ok: ['raid', 'corners', 'treasure'].every(m => modes.has(m)) },
    { ic: '🎒', name: 'Collector', desc: 'Own 5 shop items', ok: (prof.owned || []).length >= 5 },
    { ic: '💰', name: 'Treasure Keeper', desc: 'Earn 1,000 coins', ok: stats.coins_earned >= 1000 },
    { ic: '🏫', name: 'Classmate', desc: 'Join a class', ok: stats.classes.length >= 1 },
  ];
}

async function load() {
  const prof = await accounts.profile();
  const stats = await accounts.myStats();
  $('#name').textContent = prof.display_name;
  $('#hero').innerHTML = avatarSVG(restrictAvatar(prof.avatar, prof.owned || []));
  $('#coins').textContent = `🪙 ${fmt(prof.coins)}`;

  $('#classes').innerHTML = stats.classes.length
    ? stats.classes.map(c => `<div class="class-row"><div class="grow"><b>${esc(c.name)}</b><br><span class="muted">${esc(c.teacher)}</span></div>
        <button class="btn small" data-leave="${esc(c.id)}">Leave</button></div>`).join('')
    : '<p class="muted" style="margin:0">You’re not in a class yet. Ask your teacher for the class code.</p>';

  const g = stats.games;
  const totalC = g.reduce((s, x) => s + x.correct, 0), totalQ = g.reduce((s, x) => s + x.total, 0);
  const best = g.reduce((m, x) => Math.max(m, acc(x)), 0);
  const podium = g.filter(x => x.rank && x.rank <= 3).length;
  $('#tiles').innerHTML = [
    ['Games played', fmt(g.length), ''],
    ['Accuracy', totalQ ? Math.round((100 * totalC) / totalQ) + '%' : '-', `${fmt(totalC)} of ${fmt(totalQ)} right`],
    ['Best game', g.length ? best + '%' : '-', 'highest accuracy'],
    ['Top-3 finishes', fmt(podium), ''],
    ['Coins earned', fmt(stats.coins_earned), `${stats.items} items owned`],
  ].map(([l, n, s]) => `<div class="card tile-stat"><div class="lbl">${l}</div><div class="num">${n}</div>${s ? `<div class="sub">${s}</div>` : ''}</div>`).join('');

  const recent = g.slice(-15);
  $('#chart').innerHTML = barChart(recent.map(x => ({
    value: acc(x), label: day(x.played_at),
    tip: `${day(x.played_at)} · ${MODE_NAMES[x.mode] || x.mode}: ${x.correct}/${x.total} right (${acc(x)}%)`,
  })), { title: 'My accuracy, last 15 games' });

  $('#badges').innerHTML = badges(stats, prof).map(b =>
    `<div class="badge ${b.ok ? '' : 'locked'}"><div class="ic">${b.ic}</div><div class="bn">${esc(b.name)}</div><div class="bd">${esc(b.desc)}</div></div>`).join('');

  $('#games').innerHTML = g.length ? `<table class="data-table"><thead><tr><th>Date</th><th>Game</th><th>Question set</th><th>Correct</th><th>Score</th><th>Place</th><th>Coins</th></tr></thead><tbody>
    ${g.slice().reverse().slice(0, 25).map(x => `<tr><td>${day(x.played_at)}</td><td>${esc(MODE_NAMES[x.mode] || x.mode)}</td><td>${esc(x.set_title || '')}</td>
      <td>${x.correct}/${x.total} (${acc(x)}%)</td><td>${fmt(x.score)}</td><td>${x.rank ? `#${x.rank} of ${x.players}` : '-'}</td><td>${x.coins ? '+' + fmt(x.coins) : '-'}</td></tr>`).join('')}
    </tbody></table>` : '<p class="muted">Play a game while signed in and it will show up here!</p>';
}

$('#joinClass').onclick = async () => {
  const code = $('#classCode').value.trim();
  if (!code) return;
  const msg = $('#classMsg');
  try {
    const name = await accounts.joinClass(code);
    msg.style.color = 'var(--good)'; msg.textContent = `You joined ${name}! 🎉`;
    $('#classCode').value = '';
    await load();
  } catch (e) { msg.style.color = 'var(--bad)'; msg.textContent = e.message; }
};
$('#classCode').addEventListener('keydown', e => { if (e.key === 'Enter') $('#joinClass').click(); });
$('#classes').addEventListener('click', async e => {
  const b = e.target.closest('[data-leave]'); if (!b) return;
  if (!confirm('Leave this class?')) return;
  await accounts.leaveClass(b.dataset.leave); await load();
});
$('#signIn').onclick = () => accounts.signIn().catch(err => ($('#gateErr').textContent = err.message));
$('#signOut').onclick = async () => { await accounts.signOut(); location.href = 'index.html'; };

(async function init() {
  $('#previewBanner').hidden = accounts.mode !== 'demo';
  enableTips();
  try {
    const user = await accounts.user();
    if (!user) { $('#gate').hidden = false; return; }
    $('#main').hidden = false; $('#signOut').hidden = false;
    const join = new URLSearchParams(location.search).get('class');
    if (join) $('#classCode').value = join;
    await load();
  } catch (err) { $('#gate').hidden = false; $('#gateErr').textContent = err.message; }
})();
