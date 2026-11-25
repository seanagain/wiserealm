// The class village: walk your hero around and into your classmates' houses.
// The houses come from the class list each time (class_village in supabase/schema.sql), so the
// village grows and shrinks as students join or leave. Only the class's members and teacher can
// open it. Walking happens only on this device: it uses no live messages at all.
import { $, esc } from './common.js';
import { accounts } from './supa.js';
import { avatarSVG } from './avatar.js';
import { roomSVG, DEFAULT_HOUSE, HOUSE_BY_ID, normalizeHouse, TILE, ROOM_W, ROOM_H, WALL_ROWS } from './furniture.js';
import { buildVillage, paintVillage } from './villagemap.js';

let classes = [], current = null, data = null, myAvatar = {};
let v = null;                 // the built village (map, solid areas, doors)
let where = 'out';            // 'out' in the village, or 'in' a house
let hero = { x: 0, y: 0, face: 1, moving: false };
let target = null;            // tap-to-walk: { x, y, enter }
let room = null;              // inside: { i, owner, solid }
const keys = new Set();
let padDir = null;

// Plots saved for future buildings (mini games, enrichment...).
const COMING = [{ ic: '📚', name: 'Library' }, { ic: '🕹️', name: 'Arcade' }, { ic: '🏛️', name: 'Museum' }];
const DIRS = { u: [0, -1], d: [0, 1], l: [-1, 0], r: [1, 0] };
const SPEED_OUT = 46, SPEED_IN = 34; // pixels per second (map pixels / room pixels)
const RW = ROOM_W * TILE, RH = ROOM_H * TILE;

const pc = (n, of) => (100 * n) / of + '%';
const boxStyle = b => `left:${pc(b.x, v.W)};top:${pc(b.y, v.H)};width:${pc(b.w, v.W)};height:${pc(b.h, v.H)}`;
const owner = i => (i < 0 ? data.teacher : data.houses[i]);
const placeName = i => (i < 0 ? `${owner(i).name}’s castle` : `${owner(i).name}’s cottage`);

// ---------------- Drawing the village ----------------
function render() {
  $('#classTabs').innerHTML = classes.length > 1
    ? classes.map(c => `<button class="btn ${c.id === current ? 'sel' : ''}" data-class="${esc(c.id)}">${esc(c.name)}</button>`).join('') : '';
  const el = $('#village');
  if (!data) { el.innerHTML = '<p class="muted" style="padding:20px">Loading the village…</p>'; return; }
  const kids = data.houses;
  v = buildVillage(kids.length, current, kids.map(h => (h.house && Number.isInteger(h.house.ext) ? h.house.ext : 0)));
  el.innerHTML = `
    <div class="village-banner"><span>🏰 ${esc(data.name)} Village</span></div>
    <div class="vview" id="vview">
      <div class="vworld" id="vworld" style="aspect-ratio:${v.W} / ${v.H}">
        <canvas id="vcanvas"></canvas>
        <div class="vlayer">
          ${data.teacher ? `<button class="vplot castle" data-i="-1" style="${boxStyle(v.castle)}" aria-label="Walk to the castle"><span class="vname lord">👑 ${esc(data.teacher.name)}</span></button>` : ''}
          ${kids.map((h, i) => `<button class="vplot ${h.me ? 'me' : ''}" data-i="${i}" style="${boxStyle(v.houses[i])}" aria-label="Walk to ${esc(h.name)}'s house">
            ${h.me ? '' : `<span class="vhero">${avatarSVG(h.avatar || {})}</span>`}<span class="vname">${esc(h.name)}${h.me ? ' ★' : ''}</span></button>`).join('')}
          ${v.lots.map((l, i) => `<div class="vlot" style="${boxStyle(l)}"><span>${COMING[i].ic} ${esc(COMING[i].name)}<br><small>Coming soon</small></span></div>`).join('')}
          <div class="vme" id="vme">${avatarSVG(myAvatar)}</div>
        </div>
      </div>
      <div class="vroom" id="vroom" hidden>
        <div class="vroom-head"><b id="roomTitle"></b><span class="spacer"></span><button class="btn small" id="roomLeave">🚪 Leave</button></div>
        <div class="vroom-box" id="roomBox"><div id="roomArt"></div><div class="vexit">▼ Exit ▼</div><div class="vme in" id="roomMe">${avatarSVG(myAvatar)}</div></div>
        <p class="muted vroom-note" id="roomNote"></p>
      </div>
      <button class="btn primary vprompt" id="vprompt" hidden></button>
      <div class="dpad vpad" id="vpad">
        <button data-d="u" aria-label="Up">▲</button><button data-d="l" aria-label="Left">◀</button>
        <div class="mid"></div>
        <button data-d="r" aria-label="Right">▶</button><button data-d="d" aria-label="Down">▼</button>
      </div>
    </div>
    <p class="muted" style="text-align:center;margin:0">Walk with the arrows (or tap where to go). Walk up to a front door to go inside!</p>`;
  paintVillage($('#vcanvas'), v);
  // Start outside my own front door (or on the road by the bridge).
  const mine = data.houses.findIndex(h => h.me);
  const s = mine >= 0 ? { x: v.houses[mine].door.x, y: v.houses[mine].door.y + 4 } : data.teacher && data.teacher.me ? { x: v.castle.door.x, y: v.castle.door.y + 6 } : v.start;
  hero = { x: s.x, y: s.y, face: 1, moving: false };
  where = 'out'; target = null; room = null;
  sizeView(); draw();
  wireControls();
}

function sizeView() {
  const view = $('#vview'); if (!view || !v) return;
  const worldH = (view.clientWidth * v.H) / v.W;
  view.style.height = Math.round(Math.min(worldH, Math.max(320, window.innerHeight * 0.72))) + 'px';
}
function fitRoom() {
  const view = $('#vview'), box = $('#roomBox'); if (!view || !box) return;
  const w = Math.min(view.clientWidth - 24, ((view.clientHeight - 96) * RW) / RH);
  box.style.width = Math.max(200, Math.floor(w)) + 'px';
}
addEventListener('resize', () => { sizeView(); fitRoom(); draw(); });

function draw() {
  if (!v || !$('#vworld')) return;
  if (where === 'out') {
    const me = $('#vme');
    me.style.left = pc(hero.x, v.W); me.style.top = pc(hero.y, v.H);
    me.classList.toggle('walking', hero.moving); me.classList.toggle('face-left', hero.face < 0);
    // camera follows the hero
    const view = $('#vview'), world = $('#vworld');
    const scale = view.clientWidth / v.W, worldH = v.H * scale;
    const cam = Math.max(0, Math.min(worldH - view.clientHeight, hero.y * scale - view.clientHeight / 2));
    world.style.transform = `translateY(${-Math.round(cam)}px)`;
  } else {
    const me = $('#roomMe');
    me.style.left = pc(hero.x, RW); me.style.top = pc(hero.y, RH);
    me.classList.toggle('walking', hero.moving); me.classList.toggle('face-left', hero.face < 0);
  }
  // "Enter" button when standing at a door
  const d = where === 'out' ? doorNear() : null, pr = $('#vprompt');
  pr.hidden = d === null;
  if (d !== null) { pr.textContent = `🚪 Go into ${placeName(d)}`; pr.dataset.i = d; }
}

// ---------------- Walking ----------------
function blockedOut(x, y) {
  for (let dy = -2; dy <= 0; dy++) for (let dx = -3; dx <= 3; dx++) {
    const px = Math.round(x + dx), py = Math.round(y + dy);
    if (px < 0 || py < 0 || px >= v.W || py >= v.H || v.solid[py * v.W + px]) return true;
  }
  return false;
}
function blockedIn(x, y) {
  if (x < 4 || x > RW - 4 || y < WALL_ROWS * TILE + 4 || y > RH - 1) return !(y > RH - 1 && Math.abs(x - RW / 2) < 8);
  return room.solid.some(b => x + 3 > b[0] && x - 3 < b[2] && y > b[1] && y - 2 < b[3]);
}
function doors() { return [...(data.teacher ? [[-1, v.castle.door]] : []), ...v.houses.map((h, i) => [i, h.door])]; }
function doorNear() {
  for (const [i, d] of doors()) if (Math.abs(hero.x - d.x) < 6 && Math.abs(hero.y - d.y) < 6) return i;
  return null;
}

function step(dt) {
  let dx = 0, dy = 0;
  if (padDir) [dx, dy] = DIRS[padDir];
  else {
    if (keys.has('l')) dx -= 1; if (keys.has('r')) dx += 1; if (keys.has('u')) dy -= 1; if (keys.has('d')) dy += 1;
  }
  if (dx || dy) target = null;
  else if (target) {
    const tx = target.x - hero.x, ty = target.y - hero.y, dist = Math.hypot(tx, ty);
    if (dist < 1.5) { const t = target; target = null; if (t.enter !== undefined) return enter(t.enter); }
    else { dx = tx / dist; dy = ty / dist; }
  }
  hero.moving = !!(dx || dy);
  if (!hero.moving) return;
  if (dx) hero.face = dx < 0 ? -1 : 1;
  const len = Math.hypot(dx, dy) || 1, sp = (where === 'out' ? SPEED_OUT : SPEED_IN) * dt;
  const mx = (dx / len) * sp, my = (dy / len) * sp;
  const blocked = where === 'out' ? blockedOut : blockedIn;
  let moved = false;
  if (!blocked(hero.x + mx, hero.y)) { hero.x += mx; moved = true; }
  if (!blocked(hero.x, hero.y + my)) { hero.y += my; moved = true; }
  if (!moved && target) { // stuck while walking to a tapped spot: give up (or go in if we're at the door)
    const t = target; target = null;
    if (t.enter !== undefined && Math.hypot(t.x - hero.x, t.y - hero.y) < 10) return enter(t.enter);
  }
  if (where === 'out') {
    // walking up into a front door goes inside
    const d = doorNear();
    if (d !== null && dy < 0 && !target) return enter(d);
  } else if (hero.y > RH - 2) leave();
}

let last = 0, raf = 0;
function loop(t) {
  const dt = Math.min(0.05, (t - (last || t)) / 1000); last = t;
  if (v && $('#vworld')) { step(dt); draw(); }
  raf = requestAnimationFrame(loop);
}

// ---------------- Inside a house ----------------
function enter(i) {
  const h = owner(i); if (!h) return;
  const house = normalizeHouse(h.house || DEFAULT_HOUSE);
  // furniture you can't walk through: the bottom row of each piece standing on the floor
  const solid = [];
  for (const [id, x, y] of house.items) {
    const it = HOUSE_BY_ID[id];
    if (!it || it.kind === 'wall' || it.flat) continue;
    solid.push([x * TILE + 1, y * TILE + 2, (x + it.w) * TILE - 1, (y + 1) * TILE]);
  }
  room = { i, solid };
  where = 'in'; target = null; keys.clear(); padDir = null;
  hero = { x: RW / 2, y: RH - 4, face: 1, moving: false };
  $('#roomArt').innerHTML = roomSVG(house);
  $('#roomTitle').textContent = `${i < 0 ? '🏰' : '🏠'} ${placeName(i)}`;
  $('#roomNote').innerHTML = h.me ? 'Your own house! <a href="house.html">Decorate it</a>' : (h.house ? 'Walk down through the door to leave.' : 'They haven’t decorated yet: this is the starter room.');
  $('#vroom').hidden = false; $('#vworld').hidden = true;
  fitRoom(); draw();
}
function leave() {
  if (where !== 'in') return;
  const d = room.i < 0 ? v.castle.door : v.houses[room.i].door;
  where = 'out'; room = null; target = null;
  hero = { x: d.x, y: d.y + 5, face: 1, moving: false };
  $('#vroom').hidden = true; $('#vworld').hidden = false;
  sizeView(); draw();
}

// ---------------- Controls ----------------
function wireControls() {
  const pad = $('#vpad');
  pad.addEventListener('pointerdown', e => { const b = e.target.closest('[data-d]'); if (!b) return; e.preventDefault(); b.setPointerCapture?.(e.pointerId); padDir = b.dataset.d; b.classList.add('held'); });
  const up = () => { padDir = null; pad.querySelectorAll('.held').forEach(x => x.classList.remove('held')); };
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(ev => pad.addEventListener(ev, up));
  pad.addEventListener('contextmenu', e => e.preventDefault());
  // tap the map: walk there (tap a house: walk to its door and go in)
  $('#vworld').addEventListener('click', e => {
    const plot = e.target.closest('.vplot');
    if (plot) { const i = +plot.dataset.i, d = i < 0 ? v.castle.door : v.houses[i].door; target = { x: d.x, y: d.y - 1, enter: i }; return; }
    const r = $('#vworld').getBoundingClientRect();
    target = { x: ((e.clientX - r.left) / r.width) * v.W, y: ((e.clientY - r.top) / r.height) * v.H };
  });
  $('#roomBox').addEventListener('click', e => {
    const r = $('#roomBox').getBoundingClientRect();
    target = { x: ((e.clientX - r.left) / r.width) * RW, y: ((e.clientY - r.top) / r.height) * RH };
  });
  $('#vprompt').onclick = () => enter(+$('#vprompt').dataset.i);
  $('#roomLeave').onclick = leave;
}
const KEYMAP = { ArrowUp: 'u', ArrowDown: 'd', ArrowLeft: 'l', ArrowRight: 'r', w: 'u', s: 'd', a: 'l', d: 'r', W: 'u', S: 'd', A: 'l', D: 'r' };
addEventListener('keydown', e => {
  if (!v || e.target.matches('input, textarea, select')) return;
  const k = KEYMAP[e.key];
  if (k) { e.preventDefault(); keys.add(k); }
  else if ((e.key === 'Enter' || e.key === ' ') && where === 'out' && doorNear() !== null) { e.preventDefault(); enter(doorNear()); }
  else if (e.key === 'Escape' && where === 'in') leave();
});
addEventListener('keyup', e => { const k = KEYMAP[e.key]; if (k) keys.delete(k); });
addEventListener('blur', () => { keys.clear(); padDir = null; });

// ---------------- Loading ----------------
async function open(id) {
  current = id; data = null; render();
  try { data = await accounts.classVillage(id); }
  catch (e) { $('#village').innerHTML = `<p style="color:var(--bad);padding:20px">${esc(e.message)}</p>`; return; }
  const me = data.houses.find(h => h.me) || (data.teacher && data.teacher.me ? data.teacher : null);
  if (me && me.avatar) myAvatar = me.avatar;
  render();
  history.replaceState(null, '', 'village.html?class=' + encodeURIComponent(id));
}

$('#classTabs').addEventListener('click', e => { const b = e.target.closest('[data-class]'); if (b) open(b.dataset.class); });
$('#signIn').onclick = () => accounts.signIn().catch(err => ($('#gateErr').textContent = err.message));

(async function init() {
  $('#previewBanner').hidden = accounts.mode !== 'demo';
  try {
    const user = await accounts.user();
    if (!user) { $('#gate').hidden = false; return; }
    const [stats, prof] = await Promise.all([accounts.myStats().catch(() => ({ classes: [] })), accounts.profile().catch(() => null)]);
    if (prof) myAvatar = prof.avatar || {};
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
    raf = raf || requestAnimationFrame(loop);
  } catch (err) {
    $('#gate').hidden = false;
    $('#gateErr').textContent = err.message;
  }
})();
