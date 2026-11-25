// The class village: a house for every classmate (and the teacher), worked out fresh from the
// class list each time, so it grows and shrinks as students join or leave. Tap a house to look
// inside. Only the class's members and teacher can open it (class_village in supabase/schema.sql).
import { $, esc } from './common.js';
import { accounts } from './supa.js';
import { avatarSVG } from './avatar.js';
import { roomSVG, houseSVG, DEFAULT_HOUSE } from './furniture.js';

let classes = [], current = null, data = null;

// Spots for future neighborhood buildings (mini games, enrichment...).
const COMING = [
  { ic: '📚', name: 'Library' },
  { ic: '🕹️', name: 'Arcade' },
  { ic: '🏛️', name: 'Museum' },
];

function plot(h, i, teacher = false) {
  const ext = h.house && Number.isInteger(h.house.ext) ? h.house.ext : 0;
  return `<button class="plot ${teacher ? 'teacher' : ''} ${h.me ? 'me' : ''}" data-i="${i}" title="Visit ${esc(h.name)}'s house">
    <div class="plot-house">${houseSVG(ext, teacher)}</div>
    <div class="plot-hero">${avatarSVG(h.avatar || {})}</div>
    <div class="plot-name">${teacher ? '🍎 ' : ''}${esc(h.name)}${h.me ? ' (you)' : ''}</div>
  </button>`;
}

function render() {
  $('#classTabs').innerHTML = classes.length > 1
    ? classes.map(c => `<button class="btn ${c.id === current ? 'sel' : ''}" data-class="${esc(c.id)}">${esc(c.name)}</button>`).join('') : '';
  const v = $('#village');
  if (!data) { v.innerHTML = '<p class="muted" style="padding:20px">Loading the village…</p>'; return; }
  const kids = data.houses;
  v.innerHTML = `
    <div class="village-sign">🏘 ${esc(data.name)} Village</div>
    <div class="village-top">${data.teacher ? plot(data.teacher, -1, true) : ''}</div>
    <div class="village-road"></div>
    <div class="village-grid">${kids.map((h, i) => plot(h, i)).join('') || '<p class="muted">No classmates yet. Houses appear here as students join the class.</p>'}</div>
    <div class="village-road"></div>
    <div class="village-grid coming">${COMING.map(c => `<div class="lot"><div class="lot-sign">${c.ic}<br>${esc(c.name)}<br><small>Coming soon</small></div></div>`).join('')}</div>`;
}

async function open(id) {
  current = id; data = null; render();
  try { data = await accounts.classVillage(id); }
  catch (e) { $('#village').innerHTML = `<p style="color:var(--bad);padding:20px">${esc(e.message)}</p>`; return; }
  render();
  history.replaceState(null, '', 'village.html?class=' + encodeURIComponent(id));
}

$('#classTabs').addEventListener('click', e => { const b = e.target.closest('[data-class]'); if (b) open(b.dataset.class); });
$('#village').addEventListener('click', e => {
  const b = e.target.closest('.plot'); if (!b || !data) return;
  const i = +b.dataset.i, h = i < 0 ? data.teacher : data.houses[i];
  $('#visitTitle').textContent = `${i < 0 ? '🍎 ' : '🏠 '}${h.name}’s house`;
  $('#visitRoom').innerHTML = roomSVG(h.house || DEFAULT_HOUSE);
  $('#visitNote').innerHTML = h.me ? '<a class="btn small primary" href="house.html">🏠 Decorate my house</a>' : (h.house ? '' : 'They haven’t decorated yet. This is the starter room.');
  $('#visit').showModal();
});
$('#visitClose').onclick = () => $('#visit').close();
$('#visit').addEventListener('click', e => { if (e.target === $('#visit')) $('#visit').close(); });
$('#signIn').onclick = () => accounts.signIn().catch(err => ($('#gateErr').textContent = err.message));

(async function init() {
  $('#previewBanner').hidden = accounts.mode !== 'demo';
  try {
    const user = await accounts.user();
    if (!user) { $('#gate').hidden = false; return; }
    const stats = await accounts.myStats().catch(() => ({ classes: [] }));
    classes = stats.classes || [];
    // Teachers see the villages of their own classes too.
    const isT = await accounts.isTeacher().catch(() => false);
    if (isT) {
      const mine = await accounts.teacherClasses().catch(() => []);
      for (const c of mine) if (!c.archived && !classes.some(x => x.id === c.id)) classes.push({ id: c.id, name: c.name });
      $('#profileBtn').href = 'teacher.html'; $('#profileBtn').textContent = 'Teacher page';
    }
    $('#main').hidden = false;
    if (!classes.length) {
      $('#village').innerHTML = `<div class="card" style="padding:18px;margin-top:12px"><h2 style="margin-top:0">No village yet</h2>
        <p>Join a class to move into its village! Ask your teacher for the class code, or use their invite link.</p>
        <a class="btn primary" href="me.html">Join a class</a></div>`;
      return;
    }
    const want = new URLSearchParams(location.search).get('class');
    await open(classes.some(c => c.id === want) ? want : classes[0].id);
  } catch (err) {
    $('#gate').hidden = false;
    $('#gateErr').textContent = err.message;
  }
})();
