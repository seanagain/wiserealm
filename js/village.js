// The class village: a house for every classmate (and the teacher), worked out fresh from the
// class list each time, so it grows and shrinks as students join or leave. Tap a house to look
// inside. Only the class's members and teacher can open it (class_village in supabase/schema.sql).
import { $, esc } from './common.js';
import { accounts } from './supa.js';
import { avatarSVG } from './avatar.js';
import { roomSVG, DEFAULT_HOUSE } from './furniture.js';
import { buildVillage, paintVillage } from './villagemap.js';

let classes = [], current = null, data = null;

// Plots saved for future buildings (mini games, enrichment...).
const COMING = [
  { ic: '📚', name: 'Library' },
  { ic: '🕹️', name: 'Arcade' },
  { ic: '🏛️', name: 'Museum' },
];

const pc = (v, n, of) => (100 * n) / of + '%';
function box(v, b) { return `left:${pc(v, b.x, v.W)};top:${pc(v, b.y, v.H)};width:${pc(v, b.w, v.W)};height:${pc(v, b.h, v.H)}`; }

function render() {
  $('#classTabs').innerHTML = classes.length > 1
    ? classes.map(c => `<button class="btn ${c.id === current ? 'sel' : ''}" data-class="${esc(c.id)}">${esc(c.name)}</button>`).join('') : '';
  const el = $('#village');
  if (!data) { el.innerHTML = '<p class="muted" style="padding:20px">Loading the village…</p>'; return; }
  const kids = data.houses;
  const v = buildVillage(kids.length, current, kids.map(h => (h.house && Number.isInteger(h.house.ext) ? h.house.ext : 0)));
  el.innerHTML = `
    <div class="village-banner"><span>🏰 ${esc(data.name)} Village</span></div>
    <div class="vmap" style="aspect-ratio:${v.W} / ${v.H}">
      <canvas id="vcanvas"></canvas>
      <div class="vlayer">
        ${data.teacher ? `<button class="vplot castle ${data.teacher.me ? 'me' : ''}" data-i="-1" style="${box(v, v.castle)}" title="Visit the castle">
          <span class="vname lord">👑 ${esc(data.teacher.name)}</span></button>` : ''}
        ${kids.map((h, i) => { const b = v.houses[i]; return `<button class="vplot ${h.me ? 'me' : ''}" data-i="${i}" style="${box(v, b)}" title="Visit ${esc(h.name)}'s house">
          <span class="vhero">${avatarSVG(h.avatar || {})}</span><span class="vname">${esc(h.name)}${h.me ? ' ★' : ''}</span></button>`; }).join('')}
        ${v.lots.map((l, i) => `<div class="vlot" style="${box(v, l)}"><span>${COMING[i].ic} ${esc(COMING[i].name)}<br><small>Coming soon</small></span></div>`).join('')}
      </div>
    </div>
    ${kids.length ? '' : '<p class="muted" style="text-align:center">No villagers yet. A cottage appears here for each student who joins the class.</p>'}`;
  paintVillage($('#vcanvas'), v);
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
  const b = e.target.closest('.vplot'); if (!b || !data) return;
  const i = +b.dataset.i, h = i < 0 ? data.teacher : data.houses[i];
  $('#visitTitle').textContent = i < 0 ? `🏰 ${h.name}’s castle` : `🏠 ${h.name}’s cottage`;
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
