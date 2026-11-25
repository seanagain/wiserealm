// Quiz Kart Rally on the iPad: a 3D-ish road view (the flat track drawn in perspective, row by row,
// like old arcade racers), driving, items and quiz gates.
//
// Each iPad drives its own kart and tells the projector where it is about once a second. The
// projector sends everyone ONE update a second with all the karts and banana peels, and each iPad
// fills in the movement in between. Questions arrive as personal messages (mq/mres), like the maze.
import { buildTrack, WORLD, ROAD_W } from './karttrack.js';
import { heroTag } from './terview.js';

const VW = 320, VH = 200, HORIZON = 78, CAM_H = 22, FOCAL = 160, CAM_BACK = 30;
const MAX_ROAD = 122, MAX_CURB = 100, MAX_GRASS = 58, ACCEL = 95, TURN = 2.5, BOOST_SPEED = 200, BOOST_MS = 1500;
const SEND_MS = 900;

export function createKartPad({ root, getCode, pid, avatarSVG, toHost, choiceStyle, esc }) {
  const T = buildTrack();
  root.innerHTML = `
    <div class="kp-view">
      <canvas width="${VW}" height="${VH}"></canvas>
      <div class="kp-hud"><span class="kp-lap">Lap 1/3</span><span class="kp-pos">-</span><span class="kp-time"></span></div>
      <div class="kp-item" title="Use item"><span>—</span></div>
      <div class="kp-msg" hidden></div>
      <div class="kp-q" hidden><div class="kp-kind"></div><div class="kp-prompt"></div><div class="kp-choices p-choices"></div></div>
      <button class="kp-btn kp-left" aria-label="Steer left">◀</button>
      <button class="kp-btn kp-right" aria-label="Steer right">▶</button>
      <button class="kp-btn kp-use" aria-label="Use item">ITEM</button>
    </div>`;
  const cv = root.querySelector('canvas'), ctx = cv.getContext('2d');
  const img = ctx.createImageData(VW, VH), buf = new Uint32Array(img.data.buffer);
  const $r = s => root.querySelector(s);

  // ---------------- state ----------------
  const me = { x: 0, y: 0, a: T.startAngle, s: 0, lap: 1, idx: 0, half: false, item: null, boostUntil: 0, spinUntil: 0, state: 'grid', waitUntil: 0, steer: 0, fin: false };
  let laps = 3, roster = [], ver = null, mySlot = -1, rivals = new Map(), bananas = [], qToken = null, lastSend = 0, sentLap = 0, askedAt = 0;
  let racing = false, endAt = 0, myRank = 0, running = false, raf = 0, last = 0;
  const boxCooldown = new Map(); // item boxes are picked up on this iPad only
  const keys = { l: false, r: false };
  const sprites = new Map(); // slot → kart sprite canvas

  // ---------------- sky + far hills (drawn into the buffer) ----------------
  const sky = [];
  for (let y = 0; y < HORIZON; y++) { const t = y / HORIZON; sky.push(rgb(120 + 80 * t, 190 + 40 * t, 255)); }
  const hills = new Float32Array(512), far = new Float32Array(512);
  for (let i = 0; i < 512; i++) {
    const a = (i / 512) * Math.PI * 2;
    hills[i] = 8 + 5 * Math.sin(a * 3) + 3 * Math.sin(a * 7 + 1) + 2 * Math.sin(a * 13);
    far[i] = 16 + 8 * Math.sin(a * 2 + 2) + 4 * Math.sin(a * 5) + (Math.sin(a * 11) > 0.6 ? 6 : 0);
  }
  function rgb(r, g, b) { return (255 << 24 | (b & 255) << 16 | (g & 255) << 8 | (r & 255)) >>> 0; }
  const GRASS_FAR = [rgb(90, 162, 69), rgb(82, 154, 62)];

  // ---------------- drawing ----------------
  function render(now) {
    const dirx = Math.cos(me.a), diry = Math.sin(me.a), rx = -diry, ry = dirx;
    const camx = me.x - dirx * CAM_BACK, camy = me.y - diry * CAM_BACK;
    // sky and hills
    for (let x = 0; x < VW; x++) {
      const ang = me.a + Math.atan((x - VW / 2) / FOCAL);
      const k = (((Math.floor((ang / (Math.PI * 2)) * 512) % 512) + 512) % 512);
      const fh = far[k], hh = hills[(k * 2) % 512];
      for (let y = 0; y < HORIZON; y++) {
        let c = sky[y];
        if (y > HORIZON - fh) c = rgb(110, 128, 170);
        if (y > HORIZON - hh) c = rgb(64, 122, 70);
        buf[y * VW + x] = c;
      }
    }
    // the ground, row by row
    const tex = T.tex;
    for (let y = HORIZON + 1; y < VH; y++) {
      const dist = (CAM_H * FOCAL) / (y - HORIZON), step = dist / FOCAL;
      let wx = camx + dirx * dist - rx * (VW / 2) * step, wy = camy + diry * dist - ry * (VW / 2) * step;
      const sx = rx * step, sy = ry * step, row = y * VW;
      for (let x = 0; x < VW; x++) {
        const xi = wx | 0, yi = wy | 0;
        buf[row + x] = xi >= 0 && yi >= 0 && xi < WORLD && yi < WORLD ? tex[yi * WORLD + xi] : GRASS_FAR[((xi >> 5) + (yi >> 5)) & 1];
        wx += sx; wy += sy;
      }
    }
    ctx.putImageData(img, 0, 0);
    // things standing on the track, far to near
    const things = [];
    const project = (x, y) => { const px = x - camx, py = y - camy, z = px * dirx + py * diry; if (z < 6 || z > 420) return null; const lx = px * rx + py * ry; return { z, sx: VW / 2 + (lx * FOCAL) / z, sy: HORIZON + (CAM_H * FOCAL) / z, k: FOCAL / z }; };
    for (const t of T.trees) { const p = project(t.x, t.y); if (p) things.push({ ...p, draw: () => drawTree(p, t.kind) }); }
    T.boxes.forEach((b, i) => { if ((boxCooldown.get(i) || 0) > now) return; const p = project(b.x, b.y); if (p) things.push({ ...p, draw: () => drawBox(p, now) }); });
    for (const b of bananas) { const p = project(b[1], b[2]); if (p) things.push({ ...p, draw: () => drawBanana(p) }); }
    for (const [slot, r] of rivals) { const p = project(r.x, r.y); if (p) things.push({ ...p, draw: () => drawKart(p, slot, r.a - me.a) }); }
    things.sort((a, b) => b.z - a.z).forEach(t => t.draw());
    // my kart
    const bob = me.s > 5 && T.surface(me.x, me.y) === 0 ? (now >> 6) % 2 : 0;
    const spin = now < me.spinUntil ? Math.sin(now / 60) * 1.2 : 0;
    drawKartAt(VW / 2 + me.steer * 6, VH - 6 - bob, 2.4, mySlot, me.steer * 0.25 + spin);
    if (now < me.boostUntil) { ctx.fillStyle = (now >> 5) % 2 ? '#ffd23f' : '#ff7b00'; ctx.fillRect(VW / 2 - 14, VH - 8, 6, 4); ctx.fillRect(VW / 2 + 8, VH - 8, 6, 4); }
  }

  function drawTree(p, kind) {
    const w = 22 * p.k, h = 34 * p.k, x = p.sx - w / 2, y = p.sy - h;
    if (w < 1) return;
    ctx.fillStyle = '#5a3a24'; ctx.fillRect(p.sx - w * 0.08, p.sy - h * 0.35, w * 0.16, h * 0.35);
    ctx.fillStyle = kind ? '#2e6b3c' : '#3f8a35';
    if (kind) { ctx.beginPath(); ctx.moveTo(p.sx, y); ctx.lineTo(x, p.sy - h * 0.3); ctx.lineTo(x + w, p.sy - h * 0.3); ctx.fill(); }
    else { ctx.beginPath(); ctx.ellipse(p.sx, p.sy - h * 0.62, w / 2, h * 0.36, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#58a845'; ctx.beginPath(); ctx.ellipse(p.sx - w * 0.12, p.sy - h * 0.72, w * 0.22, h * 0.16, 0, 0, 7); ctx.fill(); }
  }
  function drawBox(p, now) {
    const s = 9 * p.k, x = p.sx - s / 2, y = p.sy - s - 3 * p.k - Math.sin(now / 200) * 2 * p.k;
    if (s < 1) return;
    ctx.fillStyle = `hsl(${(now / 6) % 360},80%,60%)`; ctx.fillRect(x, y, s, s);
    ctx.strokeStyle = '#1b1430'; ctx.lineWidth = Math.max(1, s / 10); ctx.strokeRect(x, y, s, s);
    ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.max(6, s * 0.8)}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText('?', p.sx, y + s * 0.82);
  }
  function drawBanana(p) {
    const s = 7 * p.k; if (s < 1) return;
    ctx.fillStyle = '#ffd23f'; ctx.strokeStyle = '#6b4a00'; ctx.lineWidth = Math.max(1, s / 6);
    ctx.beginPath(); ctx.ellipse(p.sx, p.sy - s * 0.4, s * 0.6, s * 0.35, 0.3, 0, 7); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(p.sx - s * 0.35, p.sy - s * 0.2, s * 0.35, s * 0.2, -0.6, 0, 7); ctx.fill(); ctx.stroke();
  }
  function drawKart(p, slot, rel) { drawKartAt(p.sx, p.sy, p.k * 0.42, slot, 0); }
  function drawKartAt(cx, by, k, slot, tilt) {
    const spr = sprites.get(slot); if (!spr) return;
    const w = spr.width * k, h = spr.height * k;
    if (w < 2) return;
    ctx.save(); ctx.translate(cx, by); ctx.rotate(tilt * 0.15);
    ctx.drawImage(spr, -w / 2, -h, w, h);
    ctx.restore();
    if (slot !== mySlot && k > 0.35 && roster[slot]) {
      ctx.font = `${Math.max(7, Math.min(11, 9 * k))}px sans-serif`; ctx.textAlign = 'center'; ctx.fillStyle = '#1b1430'; ctx.fillRect(cx - 24, by - h - 11, 48, 10);
      ctx.fillStyle = '#fff'; ctx.fillText(roster[slot].name.slice(0, 10), cx, by - h - 3);
    }
  }

  // Kart sprites: a little kart from behind, with the hero's head on top.
  const COLORS = ['#e63946', '#4361ee', '#3ddc84', '#ffd23f', '#c77dff', '#ff7b00', '#2ec4b6', '#ff8fab'];
  function makeSprite(slot, av) {
    const c = document.createElement('canvas'); c.width = 34; c.height = 30;
    const g = c.getContext('2d'), col = COLORS[slot % COLORS.length];
    const body = () => {
      g.fillStyle = '#1b1430'; g.fillRect(2, 20, 8, 9); g.fillRect(24, 20, 8, 9); // wheels
      g.fillStyle = '#1b1430'; g.fillRect(5, 15, 24, 11);
      g.fillStyle = col; g.fillRect(6, 16, 22, 9);
      g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(7, 17, 20, 2);
      g.fillStyle = '#1b1430'; g.fillRect(9, 21, 16, 2); g.fillStyle = '#ffd23f'; g.fillRect(7, 22, 3, 2); g.fillRect(24, 22, 3, 2);
    };
    body();
    sprites.set(slot, c);
    const im = new Image();
    im.onload = () => { g.clearRect(0, 0, 34, 30); g.drawImage(im, 4, -2, 26, 24); body(); };
    im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(avatarSVG(av || {}));
  }

  // ---------------- driving ----------------
  function step(dt, now) {
    if (!racing || me.fin) { me.s = Math.max(0, me.s - ACCEL * 2 * dt); return; }
    const stopped = me.state === 'gate' || me.state === 'hit' || now < me.waitUntil;
    const surf = T.surface(me.x, me.y);
    let max = surf === 1 ? MAX_ROAD : surf === 2 ? MAX_CURB : MAX_GRASS;
    if (now < me.boostUntil) max = BOOST_SPEED;
    if (stopped || now < me.spinUntil) me.s = Math.max(0, me.s - 260 * dt);
    else if (me.s < max) me.s = Math.min(max, me.s + (now < me.boostUntil ? 400 : ACCEL) * dt);
    else me.s = Math.max(max, me.s - 120 * dt);
    const steer = (keys.l ? -1 : 0) + (keys.r ? 1 : 0);
    me.steer += (steer - me.steer) * Math.min(1, dt * 10);
    if (!stopped && now >= me.spinUntil) me.a += steer * TURN * dt * Math.min(1, me.s / 50 + 0.2);
    if (now < me.spinUntil) me.a += dt * 7;
    me.x = Math.max(8, Math.min(WORLD - 8, me.x + Math.cos(me.a) * me.s * dt));
    me.y = Math.max(8, Math.min(WORLD - 8, me.y + Math.sin(me.a) * me.s * dt));
    // where am I on the track? (laps)
    const idx = T.nearest(me.x, me.y, me.idx);
    if (idx > T.N * 0.4 && idx < T.N * 0.6) me.half = true;
    if (me.half && me.idx > T.N * 0.85 && idx < T.N * 0.15) crossLine(now);
    me.idx = idx;
    // boost pads
    for (const p of T.pads) if ((p.x - me.x) ** 2 + (p.y - me.y) ** 2 < 13 * 13) me.boostUntil = Math.max(me.boostUntil, now + 900);
    // item boxes
    T.boxes.forEach((b, i) => {
      if ((boxCooldown.get(i) || 0) > now || (b.x - me.x) ** 2 + (b.y - me.y) ** 2 > 8 * 8) return;
      boxCooldown.set(i, now + 6000);
      if (!me.item) { me.item = Math.random() < 0.55 ? 'turbo' : 'banana'; showItem(); flash(me.item === 'turbo' ? '⚡ Got a Turbo! Tap ITEM to use it.' : '🍌 Got a banana peel! Tap ITEM to drop it behind you.'); }
    });
    // banana peels
    if (now >= me.spinUntil && me.state === 'race') for (const b of bananas) {
      if ((b[1] - me.x) ** 2 + (b[2] - me.y) ** 2 > 7 * 7 || (b[3] === mySlot && now - (b[4] || 0) < 1500)) continue;
      bananas = bananas.filter(x => x !== b);
      me.spinUntil = now + 1000; me.state = 'hit'; askedAt = now;
      toHost({ t: 'khit', id: pid, b: b[0] });
      flash('🍌 You slipped on a banana peel! Answer to get going…');
      break;
    }
    if (me.state === 'hit' && !qToken && now - askedAt > 5000) { askedAt = now; toHost({ t: 'khit', id: pid, b: -1 }); }
    if (me.state === 'gate' && !qToken && now - askedAt > 5000) { askedAt = now; sendLap(); }
  }
  function crossLine(now) {
    me.half = false;
    if (me.lap >= laps) { me.fin = true; me.state = 'done'; sentLap = me.lap; toHost({ t: 'klap', id: pid, lap: me.lap }); flash('🏁 FINISH!'); return; }
    me.state = 'gate'; askedAt = now; sentLap = me.lap; sendLap();
    flash('🚦 Quiz gate! Answer to start the next lap.');
  }
  const sendLap = () => toHost({ t: 'klap', id: pid, lap: sentLap });

  function useItem() {
    if (!me.item || !racing || me.fin) return;
    const now = performance.now();
    if (me.item === 'turbo') { me.boostUntil = now + BOOST_MS; flash('⚡ TURBO!'); }
    else { const x = me.x - Math.cos(me.a) * 12, y = me.y - Math.sin(me.a) * 12; toHost({ t: 'kdrop', id: pid, x: Math.round(x), y: Math.round(y) }); bananas.push([-1, x, y, mySlot, now]); flash('🍌 Banana peel dropped!'); }
    me.item = null; showItem();
  }
  function showItem() { $r('.kp-item span').textContent = me.item === 'turbo' ? '⚡' : me.item === 'banana' ? '🍌' : '—'; $r('.kp-use').classList.toggle('ready', !!me.item); }
  let flashT = 0;
  function flash(text) { const m = $r('.kp-msg'); m.textContent = text; m.hidden = false; clearTimeout(flashT); flashT = setTimeout(() => (m.hidden = true), 2600); }

  // rivals move between updates
  function stepRivals(dt) {
    for (const r of rivals.values()) {
      r.x += Math.cos(r.a) * r.s * dt; r.y += Math.sin(r.a) * r.s * dt;
      r.x += (r.tx - r.x) * Math.min(1, dt * 2); r.y += (r.ty - r.y) * Math.min(1, dt * 2);
    }
  }

  function hud(now) {
    $r('.kp-lap').textContent = me.fin ? '🏁 Finished' : `Lap ${Math.min(me.lap, laps)}/${laps}`;
    $r('.kp-pos').textContent = myRank ? `${myRank}${['st', 'nd', 'rd'][myRank - 1] || 'th'}` : '';
    if (endAt) { const left = Math.max(0, endAt - now); $r('.kp-time').textContent = `⏱ ${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}`; }
  }

  function loop(t) {
    const dt = Math.min(0.05, (t - (last || t)) / 1000); last = t;
    step(dt, t); stepRivals(dt); render(t); hud(t);
    if (racing && t - lastSend > SEND_MS && mySlot >= 0) {
      lastSend = t;
      toHost({ t: 'kp', id: pid, x: Math.round(me.x * 10) / 10, y: Math.round(me.y * 10) / 10, a: Math.round(me.a * 100) / 100, s: Math.round(me.s), lap: me.lap, i: me.idx });
    }
    raf = running ? requestAnimationFrame(loop) : 0;
  }

  // ---------------- controls ----------------
  const hold = (sel, key) => {
    const b = $r(sel);
    b.addEventListener('pointerdown', e => { e.preventDefault(); b.setPointerCapture?.(e.pointerId); keys[key] = true; b.classList.add('held'); });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(ev => b.addEventListener(ev, () => { keys[key] = false; b.classList.remove('held'); }));
    b.addEventListener('contextmenu', e => e.preventDefault());
  };
  hold('.kp-left', 'l'); hold('.kp-right', 'r');
  $r('.kp-use').addEventListener('pointerdown', e => { e.preventDefault(); useItem(); });
  $r('.kp-item').addEventListener('pointerdown', e => { e.preventDefault(); useItem(); });
  addEventListener('keydown', e => {
    if (!running || e.target.matches('input, textarea')) return;
    if (e.key === 'ArrowLeft' || e.key === 'a') { keys.l = true; e.preventDefault(); }
    else if (e.key === 'ArrowRight' || e.key === 'd') { keys.r = true; e.preventDefault(); }
    else if (e.key === ' ' || e.key === 'ArrowUp') { e.preventDefault(); useItem(); }
  });
  addEventListener('keyup', e => { if (e.key === 'ArrowLeft' || e.key === 'a') keys.l = false; if (e.key === 'ArrowRight' || e.key === 'd') keys.r = false; });
  $r('.kp-choices').addEventListener('click', e => {
    const b = e.target.closest('.choice'); if (!b || !qToken) return;
    toHost({ t: 'mans', id: pid, k: qToken, c: +b.dataset.c });
    root.querySelectorAll('.kp-choices .choice').forEach(x => (x.disabled = true)); b.classList.add('picked');
  });

  function place() {
    if (mySlot < 0) return;
    const g = T.gridSpot(mySlot);
    Object.assign(me, { x: g.x, y: g.y, a: g.a, s: 0, lap: 1, idx: T.nearest(g.x, g.y), half: false, fin: false, state: 'grid', item: null, boostUntil: 0, spinUntil: 0, waitUntil: 0 });
    showItem();
  }

  return {
    // state from the projector (phase intro/play)
    state(s) {
      laps = s.laps || laps;
      if (s.left !== undefined) endAt = performance.now() + s.left;
      if (s.phase === 'play' && !racing) { racing = true; if (me.state === 'grid') me.state = 'race'; flash('GO! 🏁'); }
      if (s.phase === 'intro') { racing = false; }
      if (!running) { running = true; raf = requestAnimationFrame(loop); }
    },
    onMsg(m) {
      if (m.t === 'kr') {
        roster = Array.isArray(m.r) ? m.r.map(e => ({ tag: e[0], name: String(e[1] || ''), av: e[2] })) : [];
        if (m.laps) laps = m.laps;
        const tag = heroTag(getCode(), pid), slot = roster.findIndex(r => r.tag === tag);
        if (slot !== mySlot || ver !== m.v) { roster.forEach((r, i) => makeSprite(i, r.av)); }
        if (slot !== mySlot) { mySlot = slot; place(); }
        ver = m.v;
      } else if (m.t === 'ks') {
        if (m.v !== ver) { toHost({ t: 'kneed', id: pid }); return; }
        bananas = (m.b || []).map(b => [b[0], b[1], b[2], b[3], 0]);
        const seen = new Set();
        for (const e of m.p || []) {
          const [slot, x, y, a, s, , rank] = e;
          if (slot === mySlot) { myRank = rank || 0; continue; }
          seen.add(slot);
          const r = rivals.get(slot) || { x, y };
          if (Math.hypot(r.x - x, r.y - y) > 60) { r.x = x; r.y = y; }
          Object.assign(r, { tx: x, ty: y, a, s: s || 0 });
          rivals.set(slot, r);
        }
        for (const k of [...rivals.keys()]) if (!seen.has(k)) rivals.delete(k);
      } else if (m.t === 'mq') {
        qToken = m.k;
        const q = $r('.kp-q'); q.hidden = false;
        $r('.kp-kind').textContent = m.kind === 'banana' ? '🍌 Banana slip! Answer to drive on' : `🚦 Quiz gate: lap ${Math.min(sentLap + 1, laps)} of ${laps}`;
        $r('.kp-prompt').textContent = m.q.prompt;
        $r('.kp-choices').innerHTML = m.q.choices.map((c, i) => `<button class="choice ${choiceStyle[i].cls}" data-c="${i}"><span class="ico">${choiceStyle[i].icon}</span><span>${esc(c)}</span></button>`).join('');
      } else if (m.t === 'mres') {
        qToken = null; $r('.kp-q').hidden = true;
        const now = performance.now();
        if (m.lap) me.lap = m.lap;
        me.state = me.fin ? 'done' : 'race';
        if (m.ok) { if (m.boost) me.boostUntil = now + BOOST_MS; }
        else me.waitUntil = now + (m.wait || 3000);
        flash(m.line || '');
      }
    },
    reset() { racing = false; rivals.clear(); bananas = []; qToken = null; me.fin = false; myRank = 0; place(); $r('.kp-q').hidden = true; },
    stop() { running = false; racing = false; },
    debug: { me, T, get bananas() { return bananas; } }, // for automated tests (?debug)
  };
}
