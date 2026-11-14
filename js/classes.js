// Teacher dashboard: classes, each student's progress, game history, and what to reteach.
import { $, $$, esc, fmt, show } from './common.js';
import { accounts } from './supa.js';
import { newSet, upsertSet } from './sets.js';
import { barChart, sparkline, pctBar, enableTips } from './charts.js';

const MODE_NAMES = { raid: 'Boss Raid', corners: 'Four Corners', treasure: 'Treasure Hunt' };
const day = d => (d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '-');
const when = d => (d ? new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '-');
const joinUrl = () => new URL('me.html', location.href).href.replace(/^https?:\/\//, '');

let classes = [];
let current = null; // class being viewed
let tab = 'students';
let cache = {};

export async function showClasses() {
  enableTips();
  $('#classesArea').hidden = false;
  $('#classView').hidden = true;
  await renderGrid();
}

async function renderGrid() {
  classes = await accounts.teacherClasses();
  const showArch = $('#showArchived').checked;
  const list = classes.filter(c => showArch || !c.archived);
  $('#classGrid').innerHTML = list.length ? list.map(c => `
    <div class="card class-card">
      <h3>${esc(c.name)}${c.archived ? ' <span class="muted">(archived)</span>' : ''}</h3>
      <div>Class code <span class="code-pill">${esc(c.join_code)}</span></div>
      <div class="muted">${c.members} student${c.members === 1 ? '' : 's'} · ${c.games} game${c.games === 1 ? '' : 's'} played</div>
      <div>${c.accuracy === null || c.accuracy === undefined ? '<span class="muted">No results yet</span>' : `Class accuracy ${pctBar(c.accuracy)}`}</div>
      <div class="flex" style="margin-top:auto">
        <button class="btn primary small" data-open="${esc(c.id)}">Open</button>
        <button class="btn small" data-code="${esc(c.id)}">Show join code</button>
      </div>
    </div>`).join('') : '<p class="muted">No classes yet. Create one above, e.g. “Grade 8 · Period 2”.</p>';
}

function showCode(c) {
  $('#codeBody').innerHTML = `<h2 style="margin-top:0">${esc(c.name)}</h2>
    <p style="font-size:1.2rem">Students: sign in at <b style="color:var(--gold)">${esc(joinUrl())}</b> and enter</p>
    <div class="big-code">${esc(c.join_code)}</div>
    <p class="muted">Or join automatically by playing a game where this class is picked in the lobby.</p>`;
  $('#codeDialog').showModal();
}

async function openClass(id) {
  current = classes.find(c => c.id === id);
  if (!current) return;
  cache = {};
  $('#classesArea').hidden = true;
  $('#classView').hidden = false;
  await renderClass();
}

async function renderClass() {
  const c = current;
  const [overview, sessions, hard] = await Promise.all([
    accounts.classOverview(c.id), accounts.classSessions(c.id), accounts.hardQuestions(c.id),
  ]);
  cache = { overview, sessions, hard };
  const totalC = overview.reduce((s, r) => s + r.correct, 0), totalQ = overview.reduce((s, r) => s + r.total, 0);
  const active = overview.filter(r => r.games > 0).length;
  const review = hard.filter(q => q.pct !== null && q.pct < 60).length;
  $('#classView').innerHTML = `
    <div class="topbar">
      <button class="btn" id="cvBack">← All classes</button>
      <div class="flex">
        <button class="btn small" id="cvCode">Show join code</button>
        <button class="btn small" id="cvRename">Rename</button>
        <button class="btn small" id="cvArchive">${c.archived ? 'Unarchive' : 'Archive'}</button>
        <button class="btn small" id="cvCsv">⬇ Export CSV</button>
      </div>
    </div>
    <div class="flex"><h2 style="margin:0">${esc(c.name)}</h2><span class="code-pill">${esc(c.join_code)}</span></div>
    <div class="tiles">
      <div class="card tile-stat"><div class="lbl">Students</div><div class="num">${overview.length}</div><div class="sub">${active} have played</div></div>
      <div class="card tile-stat"><div class="lbl">Games played</div><div class="num">${sessions.length}</div><div class="sub">${sessions[0] ? 'last ' + day(sessions[0].played_at) : 'none yet'}</div></div>
      <div class="card tile-stat"><div class="lbl">Class accuracy</div><div class="num">${totalQ ? Math.round((100 * totalC) / totalQ) + '%' : '-'}</div><div class="sub">${fmt(totalC)} of ${fmt(totalQ)} answers right</div></div>
      <div class="card tile-stat"><div class="lbl">Questions to review</div><div class="num">${review}</div><div class="sub">under 60% correct</div></div>
    </div>
    <div class="tabs flex" id="cvTabs">
      <button class="btn ${tab === 'students' ? 'primary' : ''}" data-tab="students">Students</button>
      <button class="btn ${tab === 'games' ? 'primary' : ''}" data-tab="games">Game history</button>
      <button class="btn ${tab === 'review' ? 'primary' : ''}" data-tab="review">What to reteach</button>
    </div>
    <div class="card" style="padding:18px" id="cvPanel"></div>`;
  renderTab();
  $('#cvBack').onclick = () => { current = null; showClasses(); };
  $('#cvCode').onclick = () => showCode(c);
  $('#cvRename').onclick = async () => {
    const name = prompt('New class name', c.name); if (!name) return;
    current = await accounts.updateClass(c.id, name, null); Object.assign(c, current); current = c; renderClass();
  };
  $('#cvArchive').onclick = async () => {
    if (!c.archived && !confirm('Archive this class? Students can no longer join it, but all results are kept.')) return;
    const u = await accounts.updateClass(c.id, null, !c.archived); c.archived = u.archived; renderClass();
  };
  $('#cvCsv').onclick = () => exportCsv(c, overview);
  $('#cvTabs').onclick = e => { const b = e.target.closest('[data-tab]'); if (!b) return; tab = b.dataset.tab; $$('#cvTabs .btn').forEach(x => x.classList.toggle('primary', x === b)); renderTab(); };
}

function renderTab() {
  const panel = $('#cvPanel');
  const { overview, sessions, hard } = cache;
  if (tab === 'students') {
    panel.innerHTML = overview.length ? `<div class="table-wrap"><table class="data-table"><thead><tr>
        <th>Student</th><th>Games</th><th>Accuracy</th><th>Last 10 games</th><th>Last played</th><th>Coins</th><th>Give coins</th><th></th></tr></thead><tbody>
      ${overview.map(r => `<tr data-id="${esc(r.user_id)}">
        <td><button class="linkish" data-student="${esc(r.user_id)}">${esc(r.display_name)}</button><br><span class="muted" style="font-size:.8rem">${esc(r.email || '')}</span></td>
        <td>${r.games}</td><td>${pctBar(r.accuracy)}</td><td>${sparkline(r.recent, 'Game')}</td><td>${day(r.last_played)}</td>
        <td><span class="coin-pill">🪙 ${fmt(r.coins)}</span></td>
        <td class="flex"><button class="btn small" data-give="10">+10</button><button class="btn small" data-give="50">+50</button></td>
        <td><button class="btn small danger" data-remove="${esc(r.user_id)}" title="Remove from class">✕</button></td></tr>`).join('')}
      </tbody></table></div>
      <p class="muted" style="font-size:.85rem">Click a student’s name to see their progress chart and the questions they miss most.</p>`
      : `<p>No students in this class yet. Show the join code <span class="code-pill">${esc(current.join_code)}</span>, or pick this class in a game lobby and everyone who plays signed in is added.</p>`;
  } else if (tab === 'games') {
    panel.innerHTML = sessions.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>When</th><th>Game</th><th>Question set</th><th>Players</th><th>Accuracy</th><th></th></tr></thead><tbody>
      ${sessions.map(s => `<tr class="clickable" data-session="${s.id}"><td>${when(s.played_at)}</td><td>${esc(MODE_NAMES[s.mode] || s.mode)}</td><td>${esc(s.set_title || '')}</td>
        <td>${s.players}</td><td>${pctBar(s.accuracy)}</td><td><button class="btn small" data-session="${s.id}">Details</button></td></tr>`).join('')}
      </tbody></table></div>` : '<p class="muted">No games saved for this class yet. Pick this class in the lobby (with coins on) and results are saved automatically.</p>';
  } else {
    panel.innerHTML = hard.length ? `<p class="muted" style="margin-top:0">Questions this class gets wrong most often, across all games. Tick some and make a review set to play again.</p>
      <div class="table-wrap"><table class="data-table"><thead><tr><th></th><th>Question</th><th>Correct answer</th><th>% correct</th><th>Times answered</th></tr></thead><tbody>
      ${hard.map((q, i) => `<tr><td><input type="checkbox" class="rv" data-i="${i}" ${q.pct !== null && q.pct < 60 ? 'checked' : ''}></td>
        <td>${esc(q.prompt)}</td><td>${esc(q.answer || '')}</td><td>${pctBar(q.pct)}</td><td>${q.asked}</td></tr>`).join('')}
      </tbody></table></div>
      <div class="flex" style="margin-top:12px"><button class="btn primary" id="makeReview">Make a review set from ticked questions</button><span id="reviewMsg" class="muted"></span></div>`
      : '<p class="muted">Once this class has played some games, the hardest questions will show up here.</p>';
    const mk = $('#makeReview');
    if (mk) mk.onclick = () => {
      const picked = $$('.rv:checked').map(cb => hard[+cb.dataset.i]).filter(q => q && q.prompt && q.answer);
      if (picked.length < 2) return alert('Tick at least 2 questions.');
      const set = newSet(`Review: ${current.name} (${day(new Date())})`);
      set.items = picked.map(q => ({ prompt: q.prompt, answer: q.answer, wrong: [] }));
      upsertSet(set);
      $('#reviewMsg').innerHTML = `Created <b>${esc(set.title)}</b> with ${picked.length} questions. Find it under <b>All sets</b>.`;
    };
  }
}

async function openStudent(uid) {
  const d = await accounts.studentDetail(current.id, uid);
  const g = d.games;
  const acc = x => (x.total ? Math.round((100 * x.correct) / x.total) : 0);
  const totalC = g.reduce((s, x) => s + x.correct, 0), totalQ = g.reduce((s, x) => s + x.total, 0);
  const firstHalf = g.slice(0, Math.floor(g.length / 2)), secondHalf = g.slice(Math.floor(g.length / 2));
  const avg = l => { const t = l.reduce((s, x) => s + x.total, 0); return t ? Math.round((100 * l.reduce((s, x) => s + x.correct, 0)) / t) : null; };
  const trend = g.length >= 4 ? avg(secondHalf) - avg(firstHalf) : null;
  $('#detailBody').innerHTML = `
    <h2 style="margin-top:0">${esc(d.profile.name)} <span class="muted" style="font-size:.7rem">${esc(d.profile.email || '')}</span></h2>
    <div class="tiles">
      <div class="card tile-stat"><div class="lbl">Games</div><div class="num">${g.length}</div></div>
      <div class="card tile-stat"><div class="lbl">Accuracy</div><div class="num">${totalQ ? Math.round((100 * totalC) / totalQ) + '%' : '-'}</div><div class="sub">${totalC} of ${totalQ} right</div></div>
      <div class="card tile-stat"><div class="lbl">Trend</div><div class="num">${trend === null ? '-' : (trend >= 0 ? '▲ +' : '▼ ') + trend + '%'}</div><div class="sub">recent games vs earlier</div></div>
      <div class="card tile-stat"><div class="lbl">Coins</div><div class="num">${fmt(d.profile.coins)}</div></div>
    </div>
    <h3>Accuracy per game</h3>
    ${barChart(g.slice(-20).map(x => ({ value: acc(x), label: day(x.played_at), tip: `${when(x.played_at)} · ${MODE_NAMES[x.mode] || x.mode} · ${x.set_title || ''}: ${x.correct}/${x.total} (${acc(x)}%)` })), { title: 'Accuracy per game' })}
    <h3>Questions missed most</h3>
    ${d.missed.length ? `<table class="data-table"><thead><tr><th>Question</th><th>Correct answer</th><th>Missed</th></tr></thead><tbody>
      ${d.missed.slice(0, 15).map(m => `<tr><td>${esc(m.prompt)}</td><td>${esc(m.answer || '')}</td><td>${m.times}×</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Nothing missed yet. 🎉</p>'}
    <h3>Recent games</h3>
    ${g.length ? `<table class="data-table"><thead><tr><th>When</th><th>Game</th><th>Set</th><th>Correct</th><th>Place</th></tr></thead><tbody>
      ${g.slice().reverse().slice(0, 15).map(x => `<tr><td>${when(x.played_at)}</td><td>${esc(MODE_NAMES[x.mode] || x.mode)}</td><td>${esc(x.set_title || '')}</td>
        <td>${x.correct}/${x.total} (${acc(x)}%)</td><td>${x.rank ? `#${x.rank} of ${x.players}` : '-'}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">No games yet.</p>'}`;
  $('#detail').showModal();
}

async function openSession(id) {
  const s = await accounts.sessionDetail(id);
  const qs = s.questions.map((q, i) => ({ ...q, i, pct: q.n ? Math.round((100 * q.r) / q.n) : null }));
  $('#detailBody').innerHTML = `
    <h2 style="margin-top:0">${esc(MODE_NAMES[s.mode] || s.mode)} · ${esc(s.set_title || '')}</h2>
    <p class="muted">${when(s.played_at)} · ${s.results.length} signed-in players</p>
    <h3>How each question went</h3>
    <table class="data-table"><thead><tr><th>#</th><th>Question</th><th>Answer</th><th>% correct</th></tr></thead><tbody>
      ${qs.map(q => `<tr><td>${q.i + 1}</td><td>${esc(q.p)}</td><td>${esc(q.a)}</td><td>${q.n ? pctBar(q.pct) + ` <span class="muted">(${q.r}/${q.n})</span>` : '<span class="muted">no answers</span>'}</td></tr>`).join('')}
    </tbody></table>
    <h3>Players</h3>
    <table class="data-table"><thead><tr><th>Place</th><th>Student</th><th>Correct</th><th>Score</th><th>Missed questions</th></tr></thead><tbody>
      ${s.results.map(r => `<tr><td>${r.rank ? '#' + r.rank : '-'}</td><td>${esc(r.name)}</td><td>${r.correct}/${r.total}</td><td>${fmt(r.score)}</td>
        <td class="muted">${(r.missed || []).map(i => '#' + (i + 1)).join(', ') || '-'}</td></tr>`).join('')}
    </tbody></table>`;
  $('#detail').showModal();
}

function exportCsv(c, rows) {
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [['Student', 'Email', 'Games played', 'Correct', 'Questions answered', 'Accuracy %', 'Last played', 'Coins'].map(q).join(',')]
    .concat(rows.map(r => [r.display_name, r.email, r.games, r.correct, r.total, r.accuracy ?? '', r.last_played ? new Date(r.last_played).toLocaleDateString() : '', r.coins].map(q).join(',')));
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${c.name.replace(/[^\w\- ]+/g, '').trim() || 'class'} progress ${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------------- events ----------------
$('#createClass').onclick = async () => {
  const name = $('#newClassName').value.trim();
  if (!name) return $('#newClassName').focus();
  try { const c = await accounts.createClass(name); $('#newClassName').value = ''; await renderGrid(); showCode(c); }
  catch (e) { alert(e.message); }
};
$('#newClassName').addEventListener('keydown', e => { if (e.key === 'Enter') $('#createClass').click(); });
$('#showArchived').onchange = renderGrid;
$('#classGrid').addEventListener('click', e => {
  const o = e.target.closest('[data-open]'); if (o) return openClass(o.dataset.open);
  const c = e.target.closest('[data-code]'); if (c) return showCode(classes.find(x => x.id === c.dataset.code));
});
$('#classView').addEventListener('click', async e => {
  const st = e.target.closest('[data-student]'); if (st) return openStudent(st.dataset.student);
  const se = e.target.closest('[data-session]'); if (se) return openSession(+se.dataset.session);
  const give = e.target.closest('[data-give]');
  if (give) {
    const tr = give.closest('tr'); give.disabled = true;
    try { await accounts.giveCoins(tr.dataset.id, +give.dataset.give, 'From your teacher'); await renderClass(); } catch (err) { alert(err.message); give.disabled = false; }
    return;
  }
  const rm = e.target.closest('[data-remove]');
  if (rm) {
    if (!confirm('Remove this student from the class? Their past results stay saved.')) return;
    await accounts.removeMember(current.id, rm.dataset.remove); await renderClass();
  }
});
$('#detailClose').onclick = () => $('#detail').close();
$('#codeClose').onclick = () => $('#codeDialog').close();
