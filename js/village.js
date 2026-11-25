// The class village: walk your hero around and into your classmates' houses.
// The houses come from the class list each time (class_village in supabase/schema.sql), so the
// village grows and shrinks as students join or leave. Only the class's members and teacher can
// open it. Walking happens on this device and uses no live messages, unless the teacher switches
// on the live village for class time (see "Live village" below).
import { $, esc } from './common.js';
import { accounts } from './supa.js';
import { avatarSVG } from './avatar.js';
import { roomSVG, DEFAULT_HOUSE, HOUSE_BY_ID, normalizeHouse, TILE, ROOM_W, ROOM_H, WALL_ROWS } from './furniture.js';
import { buildVillage, paintVillage } from './villagemap.js';
import { openRoom } from './net.js';

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
    <div class="vlive flex" id="vlive" hidden></div>
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
  renderLive(); rebuildOthers();
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
  hero.vx = dx / len; hero.vy = dy / len;
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
  if (v && $('#vworld')) { step(dt); stepOthers(dt); liveTick(); draw(); drawOthers(); }
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
  liveTick(true); rebuildOthers();
}
function leave() {
  if (where !== 'in') return;
  const d = room.i < 0 ? v.castle.door : v.houses[room.i].door;
  where = 'out'; room = null; target = null;
  hero = { x: d.x, y: d.y + 5, face: 1, moving: false };
  $('#vroom').hidden = true; $('#vworld').hidden = false;
  sizeView(); draw();
  liveTick(true); rebuildOthers();
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

// ---------------- Live village (class time) ----------------
// The teacher switches it on. The teacher's screen is the hub: each iPad tells the hub only when its
// hero starts, stops or turns (and every few seconds while walking); the hub sends everyone ONE
// combined update a second, and every device fills in the walking in between. Heroes are named by
// their house number, so no account IDs travel over the live connection.
const LIVE_SNAPSHOT_MS = 1000, LIVE_RESEND_MS = 2500, LIVE_HEARTBEAT_MS = 20000, LIVE_STALE_MS = 45000;
const params = new URLSearchParams(location.search);
let amTeacher = false;
const live = { net: null, code: null, hub: false, endsAt: 0, lastSnap: 0, players: new Map(), others: new Map(), sent: null, sentAt: 0, usage: 0, snapSig: '', snapAt: 0, timer: null };
const devId = (() => { try { let x = sessionStorage.getItem('wr_vdev'); if (!x) { x = Math.random().toString(36).slice(2, 12); sessionStorage.setItem('wr_vdev', x); } return x; } catch { return Math.random().toString(36).slice(2, 12); } })();

// Which hero am I? My house number, or -1 for the teacher (the castle). (?as=N: preview testing only)
function myKey() {
  if (accounts.mode === 'demo' && params.has('as')) return +params.get('as');
  const i = data.houses.findIndex(h => h.me);
  return i >= 0 ? i : data.teacher && data.teacher.me ? -1 : null;
}
const canHost = () => amTeacher && (data.teacher && data.teacher.me || (accounts.mode === 'demo' && !params.has('as')));
const whereCode = () => (where === 'out' ? 'o' : room.i);
const r1 = n => Math.round(n * 10) / 10;

function renderLive() {
  const el = $('#vlive'); if (!el || !data) return;
  const on = !!live.net, n = live.hub ? livePlayers().length : live.others.size + (on ? 1 : 0);
  if (canHost()) {
    el.innerHTML = on
      ? `<span class="live-dot"></span><b>LIVE</b> · <span id="liveLeft"></span> left · <b>${n}</b> walking around <span class="spacer"></span>
         <button class="btn small" id="liveMore">+10 min</button><button class="btn small danger" id="liveStop">Stop live village</button>`
      : `<b>🟢 Live village</b> <span class="muted">(class time: everyone sees each other walking around)</span><span class="spacer"></span>
         <select class="input" id="liveMins"><option value="10">10 min</option><option value="20" selected>20 min</option><option value="30">30 min</option><option value="45">45 min</option></select>
         <button class="btn small primary" id="liveStart">Start</button>
         <span class="muted live-cost">About 3,500 messages a minute with 30 students. Keep this page open: it passes everyone's walking along.</span>`;
    if (on) { $('#liveStop').onclick = () => stopLive(true); $('#liveMore').onclick = () => startLiveAsHost(Math.ceil((live.endsAt - Date.now()) / 60000) + 10); }
    else $('#liveStart').onclick = () => startLiveAsHost(+$('#liveMins').value);
  } else {
    el.innerHTML = on ? `<span class="live-dot"></span><b>Live village!</b> Your classmates are walking around too · <b>${n}</b> here <span class="muted" id="liveWait"></span>` : '';
  }
  el.hidden = !el.innerHTML;
  tickLiveClock();
}
function tickLiveClock() {
  const l = $('#liveLeft'); if (!l) return;
  const s = Math.max(0, Math.round((live.endsAt - Date.now()) / 1000));
  l.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

async function startLiveAsHost(mins) {
  try {
    const r = await accounts.setVillageLive(current, mins);
    data.live = r;
    await startLive(r, true);
  } catch (e) { alert(e.message); }
}
async function startLive(info, asHost = canHost()) {
  if (!info || !info.code) return;
  live.endsAt = Date.now() + info.left * 1000;
  if (live.net && live.code === info.code) { renderLive(); return; }
  stopLive(false);
  live.code = info.code; live.hub = asHost; live.players.clear(); live.others.clear(); live.sent = null; live.lastSnap = Date.now();
  try {
    live.net = await openRoom(info.code, onLiveMsg, asHost ? 'host' : 'player');
  } catch (e) { console.warn(e); live.net = null; renderLive(); return; }
  clearInterval(live.timer);
  live.timer = setInterval(() => {
    if (!live.net) return;
    if (Date.now() > live.endsAt) return stopLive(live.hub);
    if (live.hub) sendSnapshot(); else if (Date.now() - live.lastSnap > 8000) { const w = $('#liveWait'); if (w) w.textContent = '(waiting for your teacher’s screen…)'; }
    tickLiveClock();
  }, LIVE_SNAPSHOT_MS);
  liveTick(true);
  rebuildOthers(); renderLive();
}
function stopLive(tellServer) {
  if (live.net) {
    try { if (live.hub) live.net.send({ t: 'vend' }); else live.net.toHost({ t: 'vl', id: devId }); } catch { /* ignore */ }
    flushUsage();
    live.net.close();
  }
  live.net = null; live.code = null; live.players.clear(); live.others.clear();
  clearInterval(live.timer);
  if (tellServer && current) accounts.setVillageLive(current, 0).catch(e => console.warn(e));
  if (data) data.live = null;
  rebuildOthers(); renderLive();
}

// Messages ---------------------------------------------------------------
function validKey(k) { return Number.isInteger(k) && k >= -1 && k < data.houses.length && (k >= 0 || !!data.teacher); }
function onLiveMsg(m) {
  if (!m || typeof m !== 'object' || !data) return;
  if (live.hub) {
    live.usage += 2;
    if (m.t === 'vm' && typeof m.id === 'string' && validKey(m.k)) {
      const p = live.players.get(m.id) || {};
      const w = m.w === 'o' ? 'o' : validKey(m.w) ? m.w : 'o';
      Object.assign(p, { key: m.k, x: +m.x || 0, y: +m.y || 0, dx: clampDir(m.dx), dy: clampDir(m.dy), w, seen: Date.now() });
      live.players.set(m.id.slice(0, 20), p);
    } else if (m.t === 'vl') live.players.delete(String(m.id));
    return;
  }
  if (m.t === 'vs' && Array.isArray(m.p)) {
    live.lastSnap = Date.now();
    if (m.left) live.endsAt = Date.now() + m.left * 1000;
    const mine = myKey(), seen = new Set();
    for (const e of m.p) {
      if (!Array.isArray(e) || !validKey(e[0]) || e[0] === mine) continue;
      const [k, x, y, dx, dy, w] = e;
      seen.add(k);
      const o = live.others.get(k) || { x, y };
      if (o.w !== w || Math.hypot(o.x - x, o.y - y) > 10) { o.x = x; o.y = y; } else { o.x += (x - o.x) * 0.3; o.y += (y - o.y) * 0.3; }
      Object.assign(o, { dx: clampDir(dx), dy: clampDir(dy), w });
      live.others.set(k, o);
    }
    for (const k of [...live.others.keys()]) if (!seen.has(k)) live.others.delete(k);
    const w = $('#liveWait'); if (w) w.textContent = '';
    rebuildOthers(); renderLive();
  } else if (m.t === 'vend') stopLive(false);
}
const clampDir = n => Math.max(-1, Math.min(1, Number(n) || 0));

// Tell the hub about my walking (only when it changes, plus now and then).
function liveTick(force = false) {
  if (!live.net || !data) return;
  const k = myKey(); if (k === null) return;
  let dx = 0, dy = 0;
  if (hero.moving) { dx = hero.vx || 0; dy = hero.vy || 0; }
  const now = Date.now(), w = whereCode(), s = live.sent;
  const changed = !s || Math.abs(s.dx - dx) > 0.15 || Math.abs(s.dy - dy) > 0.15 || s.w !== w;
  const due = hero.moving ? now - live.sentAt > LIVE_RESEND_MS : now - live.sentAt > LIVE_HEARTBEAT_MS;
  if (!force && !changed && !due) return;
  if (!force && now - live.sentAt < 200) return; // at most 5 a second
  live.sent = { dx, dy, w }; live.sentAt = now;
  const msg = { t: 'vm', id: devId, k, x: r1(hero.x), y: r1(hero.y), dx: r1(dx), dy: r1(dy), w };
  if (live.hub) live.players.set(devId, { key: k, x: hero.x, y: hero.y, dx, dy, w, seen: now, self: true });
  else live.net.toHost(msg);
}

// Hub: one combined update a second (skipped when nothing changed).
function livePlayers() { const now = Date.now(); for (const [id, p] of live.players) if (!p.self && now - p.seen > LIVE_STALE_MS) live.players.delete(id); return [...live.players.values()]; }
function sendSnapshot() {
  const list = livePlayers();
  const me = live.players.get(devId);
  if (me) Object.assign(me, { x: hero.x, y: hero.y });
  const p = list.map(q => [q.key, r1(q.x), r1(q.y), r1(q.dx), r1(q.dy), q.w]);
  const sig = JSON.stringify(p), now = Date.now();
  if (sig === live.snapSig && now - live.snapAt < 5000) return;
  live.snapSig = sig; live.snapAt = now;
  live.net.send({ t: 'vs', p, left: Math.max(0, Math.round((live.endsAt - now) / 1000)) });
  live.usage += 1 + Math.max(0, list.length - 1);
  // the hub shows everyone else too
  const mine = myKey();
  for (const q of list) {
    if (q.self || q.key === mine) continue;
    const o = live.others.get(q.key) || {};
    live.others.set(q.key, Object.assign(o, { x: q.x, y: q.y, dx: q.dx, dy: q.dy, w: q.w }));
  }
  for (const k of [...live.others.keys()]) if (!list.some(q => q.key === k)) live.others.delete(k);
  rebuildOthers(); renderLive();
}
function flushUsage() { if (live.hub && live.usage > 0 && accounts.addUsage) { const n = Math.round(live.usage); live.usage = 0; accounts.addUsage(n).catch(() => {}); } }
setInterval(flushUsage, 60000);
addEventListener('pagehide', () => { if (live.net && !live.hub) live.net.toHost({ t: 'vl', id: devId }); flushUsage(); });

// Other heroes: drawn where they are (in the village, or in the house I'm in), walking in between updates.
function rebuildOthers() {
  document.querySelectorAll('.vother').forEach(e => e.remove());
  if (!data || !v) return;
  const liveKeys = new Set(live.others.keys());
  document.querySelectorAll('.vplot').forEach(b => { const h = b.querySelector('.vhero'); if (h) h.hidden = liveKeys.has(+b.dataset.i); });
  for (const [k, o] of live.others) {
    const h = owner(k); if (!h) continue;
    const inside = o.w !== 'o';
    if (inside && !(where === 'in' && room && room.i === o.w)) { o.el = null; continue; }
    if (!inside && where !== 'out') { o.el = null; continue; }
    const el = document.createElement('div');
    el.className = 'vother' + (inside ? ' in' : '');
    el.innerHTML = `${avatarSVG(h.avatar || {})}<span>${esc(h.name)}</span>`;
    (inside ? $('#roomBox') : $('#vworld .vlayer')).append(el);
    o.el = el;
  }
  drawOthers();
}
function stepOthers(dt) {
  for (const o of live.others.values()) {
    if (!o.dx && !o.dy) { o.moving = false; continue; }
    o.moving = true; if (o.dx) o.face = o.dx < 0 ? -1 : 1;
    const inside = o.w !== 'o';
    if (inside && !(where === 'in' && room && room.i === o.w)) continue;
    const len = Math.hypot(o.dx, o.dy) || 1, sp = (inside ? SPEED_IN : SPEED_OUT) * dt;
    const mx = (o.dx / len) * sp, my = (o.dy / len) * sp, blocked = inside ? blockedIn : blockedOut;
    if (!blocked(o.x + mx, o.y)) o.x += mx;
    if (!blocked(o.x, o.y + my)) o.y += my;
  }
  if (live.hub) for (const p of live.players.values()) { // the hub keeps everyone's position up to date for its updates
    if (p.self || (!p.dx && !p.dy)) continue;
    const inside = p.w !== 'o', len = Math.hypot(p.dx, p.dy) || 1, sp = (inside ? SPEED_IN : SPEED_OUT) * dt;
    const mx = (p.dx / len) * sp, my = (p.dy / len) * sp;
    if (inside) { p.x = Math.max(4, Math.min(RW - 4, p.x + mx)); p.y = Math.max(28, Math.min(RH - 3, p.y + my)); }
    else { if (!blockedOut(p.x + mx, p.y)) p.x += mx; if (!blockedOut(p.x, p.y + my)) p.y += my; }
  }
}
function drawOthers() {
  for (const o of live.others.values()) {
    if (!o.el) continue;
    const inside = o.w !== 'o';
    o.el.style.left = pc(o.x, inside ? RW : v.W); o.el.style.top = pc(o.y, inside ? RH : v.H);
    o.el.classList.toggle('walking', !!o.moving); o.el.classList.toggle('face-left', o.face < 0);
  }
}

// Students: check now and then whether the teacher switched live on (a database read, not a live message).
setInterval(async () => {
  if (!current || !data || document.hidden) return;
  if (live.net && !live.hub && Date.now() < live.endsAt) return;
  try {
    const d = await accounts.classVillage(current);
    if (d.live && !live.net) { data.live = d.live; startLive(d.live); }
    else if (!d.live && live.net && !live.hub) stopLive(false);
  } catch { /* ignore */ }
}, 30000);

// ---------------- Loading ----------------
async function open(id) {
  current = id; data = null; render();
  try { data = await accounts.classVillage(id); }
  catch (e) { $('#village').innerHTML = `<p style="color:var(--bad);padding:20px">${esc(e.message)}</p>`; return; }
  const me = data.houses.find(h => h.me) || (data.teacher && data.teacher.me ? data.teacher : null);
  if (me && me.avatar) myAvatar = me.avatar;
  if (live.net) stopLive(false);
  render();
  if (data.live) startLive(data.live);
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
    amTeacher = isT;
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
