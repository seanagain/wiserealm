import { $, esc, show, uid, fmt } from './common.js';
import { accounts } from './supa.js';
import { showClasses } from './classes.js';
import { getSets, getSet, upsertSet, deleteSet, newSet, parseTable, rowsToItems, cleanItems } from './sets.js';
import { isOnline } from './net.js';

let current = null;
let saveTimer = null;

function renderBanner() {
  const b = $('#modeBanner');
  if (isOnline()) {
    b.className = 'banner ok';
    b.innerHTML = '✅ <b>Online mode is on.</b> Students can join from their iPads.';
  } else {
    b.className = 'banner';
    b.innerHTML = '🧪 <b>Local Test Mode.</b> Games only connect to other tabs in this browser, so you can try everything yourself (use “Add test bots” or “Open a test student”). To let student iPads join, connect a free Supabase project. See <b>README.md</b>.';
  }
}

function renderLib() {
  const sets = getSets().sort((a, b) => b.updated - a.updated);
  $('#setGrid').innerHTML = sets.length ? sets.map(s => `
    <div class="card set-card">
      <h3>${esc(s.title)}</h3>
      <div class="muted">${cleanItems(s.items).length} questions · edited ${new Date(s.updated).toLocaleDateString()}</div>
      <div class="row">
        <button class="btn primary small" data-play="${s.id}" data-game="raid">Boss Raid</button>
        <button class="btn primary small" data-play="${s.id}" data-game="corners">Four Corners</button>
        <button class="btn primary small" data-play="${s.id}" data-game="treasure">Treasure Hunt</button>
      </div>
      <div class="row">
        <button class="btn small" data-edit="${s.id}">Edit</button>
        <button class="btn small" data-dup="${s.id}">Duplicate</button>
      </div>
    </div>`).join('') : '<p class="muted">No question sets yet. Click “New question set” to make one.</p>';
}

function play(id, game = 'raid') { location.href = `host.html?set=${encodeURIComponent(id)}&game=${encodeURIComponent(game)}`; }

function openEditor(set) {
  current = structuredClone(set);
  $('#titleInput').value = current.title;
  $('#pasteBox').value = '';
  $('#pasteInfo').textContent = '';
  renderRows();
  $('#saveState').textContent = 'Saved';
  show('edit');
  window.scrollTo(0, 0);
}

function renderRows() {
  if (!current.items.length) current.items.push({ prompt: '', answer: '', wrong: [] });
  $('#rows').innerHTML = current.items.map((it, i) => `
    <tr data-i="${i}">
      <td class="num">${i + 1}</td>
      <td><input data-f="prompt" value="${esc(it.prompt)}" placeholder="Question or word"></td>
      <td><input data-f="answer" value="${esc(it.answer)}" placeholder="Correct answer"></td>
      ${[0, 1, 2].map(w => `<td><input data-f="w${w}" value="${esc((it.wrong || [])[w] || '')}" placeholder="—"></td>`).join('')}
      <td><button class="btn small danger" data-del="${i}" title="Remove">✕</button></td>
    </tr>`).join('');
  $('#countLbl').textContent = `(${cleanItems(current.items).length} ready)`;
}

function scheduleSave() {
  $('#saveState').textContent = 'Saving…';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 400);
}

function saveNow() {
  clearTimeout(saveTimer);
  if (!current) return;
  current.title = $('#titleInput').value.trim() || 'Untitled set';
  upsertSet(structuredClone(current));
  $('#saveState').textContent = 'Saved ✓';
  $('#countLbl').textContent = `(${cleanItems(current.items).length} ready)`;
}

// ----- Library events -----
$('#setGrid').addEventListener('click', e => {
  const t = e.target.closest('button'); if (!t) return;
  if (t.dataset.play) play(t.dataset.play, t.dataset.game);
  if (t.dataset.edit) openEditor(getSet(t.dataset.edit));
  if (t.dataset.dup) {
    const s = structuredClone(getSet(t.dataset.dup));
    s.id = uid(8); s.title += ' (copy)';
    upsertSet(s); renderLib();
  }
});
$('#newBtn').onclick = () => { const s = newSet(); upsertSet(s); openEditor(s); $('#titleInput').focus(); };
$('#exportBtn').onclick = () => {
  const blob = new Blob([JSON.stringify({ app: 'wiserealm', version: 1, sets: getSets() }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `wiserealm-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
$('#importBtn').onclick = () => $('#importFile').click();
$('#importFile').onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    const incoming = Array.isArray(data) ? data : data.sets;
    if (!Array.isArray(incoming)) throw new Error('bad file');
    let n = 0;
    for (const s of incoming) {
      if (!s || !Array.isArray(s.items)) continue;
      upsertSet({ id: String(s.id || uid(8)), title: String(s.title || 'Imported set'), items: cleanItems(s.items) });
      n++;
    }
    alert(`Restored ${n} question set(s).`);
    renderLib();
  } catch { alert('That file doesn’t look like a WiseRealm backup.'); }
  e.target.value = '';
};

// ----- Editor events -----
$('#backBtn').onclick = () => { saveNow(); current = null; renderLib(); show('lib'); };
document.querySelectorAll('[data-play-edit]').forEach(b => (b.onclick = () => {
  saveNow();
  if (cleanItems(current.items).length < 2) return alert('Add at least 2 questions first.');
  play(current.id, b.dataset.playEdit);
}));
$('#titleInput').oninput = scheduleSave;
$('#rows').addEventListener('input', e => {
  const inp = e.target; const tr = inp.closest('tr'); if (!tr) return;
  const it = current.items[+tr.dataset.i];
  const f = inp.dataset.f;
  if (f === 'prompt' || f === 'answer') it[f] = inp.value;
  else { it.wrong = it.wrong || []; it.wrong[+f.slice(1)] = inp.value; }
  scheduleSave();
});
$('#rows').addEventListener('click', e => {
  const b = e.target.closest('[data-del]'); if (!b) return;
  current.items.splice(+b.dataset.del, 1);
  renderRows(); scheduleSave();
});
$('#addRow').onclick = () => {
  current.items.push({ prompt: '', answer: '', wrong: [] });
  renderRows();
  const inputs = document.querySelectorAll('#rows tr:last-child input');
  inputs[0]?.focus();
};
$('#pasteBox').oninput = () => {
  const { items, header } = rowsToItems(parseTable($('#pasteBox').value));
  $('#pasteInfo').textContent = $('#pasteBox').value.trim()
    ? `Found ${items.length} question${items.length === 1 ? '' : 's'}${header ? ' (header row skipped)' : ''}` : '';
};
$('#pasteAdd').onclick = () => {
  const { items } = rowsToItems(parseTable($('#pasteBox').value));
  if (!items.length) return alert('No questions found. Make sure each row has a question and an answer.');
  const existing = $('#pasteReplace').checked ? [] : cleanItems(current.items);
  current.items = existing.concat(items);
  $('#pasteBox').value = ''; $('#pasteInfo').textContent = `Added ${items.length}.`;
  renderRows(); saveNow();
};
$('#deleteSet').onclick = () => {
  if (!confirm(`Delete “${current.title}”? This can’t be undone.`)) return;
  deleteSet(current.id); current = null; renderLib(); show('lib');
};
window.addEventListener('beforeunload', () => { if (current) saveNow(); });

// ---------------- Students & coins ----------------
async function openStudents() {
  show('students');
  const box = $('#teacherBox');
  $('#classesArea').hidden = true; $('#classView').hidden = true;
  try {
    const user = await accounts.user();
    if (!user) {
      box.innerHTML = `<p style="margin-top:0">Sign in with your Google account to see students’ coins and to turn on coins in games.</p>
        <button class="btn primary" id="tSignIn">Sign in with Google</button>`;
      $('#tSignIn').onclick = () => accounts.signIn().catch(e => alert(e.message));
      return;
    }
    if (!(await accounts.isTeacher())) {
      box.innerHTML = `<p style="margin-top:0">You’re signed in as <b>${esc(user.email)}</b>, but that email isn’t on the teacher list yet.</p>
        <p class="muted">Add it in Supabase (see README → “Make yourself the teacher”), then reload.</p><button class="btn small" id="tOut">Sign out</button>`;
      $('#tOut').onclick = async () => { await accounts.signOut(); openStudents(); };
      return;
    }
    box.innerHTML = `Signed in as <b>${esc(user.email)}</b> (teacher)${accounts.mode === 'demo' ? ' · <span class="muted">Preview mode</span>' : ''}.
      Coins and progress tracking are on in games you host from this browser. <button class="btn small" id="tOut">Sign out</button>`;
    $('#tOut').onclick = async () => { await accounts.signOut(); openStudents(); };
    await showClasses();
    await renderStudents();
  } catch (e) { box.textContent = e.message; }
}

async function renderStudents() {
  const list = $('#studentList');
  const rows = await accounts.students();
  list.hidden = false;
  if (!rows.length) { list.innerHTML = '<p class="muted">No students have signed in yet. They appear here after they sign in on the join page.</p>'; return; }
  list.innerHTML = `<p class="muted" style="margin-top:0">Give bonus coins for great work or helping others (or take some away with a minus number).</p>
    <div class="table-wrap"><table class="editor-table"><thead><tr><th>Name</th><th>Email</th><th>Coins</th><th>Items</th><th>Give coins</th></tr></thead><tbody>
    ${rows.map(r => `<tr data-id="${esc(r.id)}"><td><b>${esc(r.display_name)}</b></td><td class="muted">${esc(r.email || '')}</td>
      <td><span class="coin-pill">🪙 ${fmt(r.coins)}</span></td><td>${r.items}</td>
      <td class="flex"><button class="btn small" data-give="10">+10</button><button class="btn small" data-give="50">+50</button>
      <input style="width:80px" type="number" placeholder="±" class="giveAmt"><button class="btn small" data-give="custom">Give</button></td></tr>`).join('')}
    </tbody></table></div>`;
}

$('#studentList').addEventListener('click', async e => {
  const b = e.target.closest('[data-give]'); if (!b) return;
  const tr = b.closest('tr');
  const amount = b.dataset.give === 'custom' ? parseInt(tr.querySelector('.giveAmt').value, 10) : +b.dataset.give;
  if (!amount) return;
  b.disabled = true;
  try { await accounts.giveCoins(tr.dataset.id, amount, 'From your teacher'); await renderStudents(); }
  catch (err) { alert(err.message); b.disabled = false; }
});
$('#studentsBtn').onclick = openStudents;
$('#studentsBack').onclick = () => { renderLib(); show('lib'); };

renderBanner();
renderLib();
if (location.hash === '#students' || location.hash === '#classes') openStudents();
