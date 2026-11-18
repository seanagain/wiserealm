// Lobby playground: a pixel classroom on the projector. While waiting for the game to start,
// students walk their heroes around with the arrow pad on their iPad and send emotes.
// Nothing here is sent back to the iPads (students watch the big screen), so it uses
// very few network messages: one when a student presses or lets go of an arrow.
const DIRS = { u: [0, -1], d: [0, 1], l: [-1, 0], r: [1, 0] };
const HOLD_MS = 4500;   // an arrow counts as "held" this long unless refreshed (iPads resend every 3 seconds here)
const FLOOR_TOP = 0.34; // heroes' feet stay below the chalkboard wall
const DESKS = [];
for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) DESKS.push({ x: 0.2 + c * 0.2, y: 0.52 + r * 0.17 });

// Tiny pixel-art pieces, drawn from text grids like the heroes.
function pixels(rows, pal, extra = '') {
  const w = rows[0].length, h = rows.length;
  let rects = '';
  rows.forEach((row, y) => { for (let x = 0; x < w; x++) { const c = pal[row[x]]; if (c) rects += `<rect x="${x}" y="${y}" width="1.02" height="1.02" fill="${c}"/>`; } });
  return `<svg viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges" ${extra}>${rects}</svg>`;
}
const DESK = pixels([
  '..hhhhhhhhhhhh..',
  '.hTTTTTTTTTTTTh.',
  'hTTTTppTTTTTTTTh',
  'hTTTTppTTTTTTTTh',
  'hTTTTTTTTTTTTTTh',
  'hBBBBBBBBBBBBBBh',
  '.hLh........hLh.',
  '.hLh........hLh.',
  '.hLh........hLh.',
  '.hhh........hhh.',
], { h: '#1b1430', T: '#b0733f', p: '#f4f1de', B: '#7a4a26', L: '#5a3a24' });
const TEACHER_DESK = pixels([
  '...........rr.........',
  '..........rRRr........',
  'hhhhhhhhhhhrrhhhhhhhhh',
  'hTTTTTTTTTTTTTTTTTTTTh',
  'hTTTTTTTTTTTTTTTTTTTTh',
  'hBBBBBBBBBBBBBBBBBBBBh',
  'hDDDDDDDhhhhhhDDDDDDDh',
  'hDDDkDDDh....hDDDkDDDh',
  'hDDDDDDDh....hDDDDDDDh',
  'hhhhhhhhh....hhhhhhhhh',
], { h: '#1b1430', T: '#b0733f', B: '#7a4a26', D: '#8f5a2e', k: '#ffd23f', r: '#3ddc84', R: '#ef476f' });
const SHELF = pixels([
  'hhhhhhhhhh',
  'hrbgyrbpgh',
  'hrbgyrbpgh',
  'hhhhhhhhhh',
  'hgyprbgryh',
  'hgyprbgryh',
  'hhhhhhhhhh',
  'h........h',
], { h: '#5a3a24', r: '#ef476f', b: '#4cc9f0', g: '#3ddc84', y: '#ffd23f', p: '#c77dff' });
const CLOCK = pixels([
  '.hhhh.',
  'hwwwwh',
  'hwwkwh',
  'hwkkwh',
  'hwwwwh',
  '.hhhh.',
], { h: '#1b1430', w: '#f4f1de', k: '#1b1430' });

export function createPlayground(room, { players, heroHTML }) {
  room.classList.add('classroom');
  room.innerHTML = `
    <div class="cr-wall">
      <div class="cr-board"><span class="cr-chalk">Welcome, heroes!</span><span class="cr-chalk small">Use the arrows on your iPad to walk around</span></div>
      <div class="cr-clock">${CLOCK}</div>
      <div class="cr-shelf">${SHELF}</div>
    </div>
    <div class="cr-floor"></div>
    <div class="cr-layer"></div>`;
  const layer = room.querySelector('.cr-layer');
  const props = [
    ...DESKS.map(d => ({ ...d, html: DESK, cls: 'cr-desk' })),
    { x: 0.11, y: FLOOR_TOP + 0.06, html: TEACHER_DESK, cls: 'cr-tdesk' },
  ];
  for (const pr of props) {
    const el = document.createElement('div');
    el.className = 'cr-prop ' + pr.cls;
    el.innerHTML = pr.html;
    el.style.left = pr.x * 100 + '%'; el.style.top = pr.y * 100 + '%';
    el.style.zIndex = Math.round(pr.y * 1000);
    layer.append(el);
  }

  const els = new Map();
  let raf = 0, lastT = 0, W = 1, H = 1, size = 80;

  function place(p) {
    if (p.lb) return;
    p.lb = { x: 0.08 + Math.random() * 0.84, y: FLOOR_TOP + 0.12 + Math.random() * (0.96 - FLOOR_TOP - 0.12), dir: null, at: 0, face: 1, next: 0 };
  }
  function measure() {
    W = room.clientWidth || 1; H = room.clientHeight || 1;
    size = Math.max(54, Math.min(104, H * 0.15, W / 9));
    room.style.setProperty('--hs', size + 'px');
  }

  function sync() {
    measure();
    const list = players();
    const ids = new Set(list.map(p => p.id));
    for (const [id, el] of els) if (!ids.has(id)) { el.remove(); els.delete(id); }
    for (const p of list) {
      place(p);
      let el = els.get(p.id);
      if (!el) {
        el = document.createElement('div');
        el.className = 'hero lb-hero';
        el.dataset.id = p.id;
        el.title = 'Click to remove';
        layer.append(el);
        els.set(p.id, el);
      }
      const sig = p.name + '|' + JSON.stringify(p.av);
      if (el.dataset.sig !== sig) {
        el.dataset.sig = sig;
        el.querySelectorAll(':scope > :not(.emote-bubble)').forEach(c => c.remove());
        el.insertAdjacentHTML('afterbegin', heroHTML(p));
      }
    }
    draw();
    start();
  }

  function setDir(p, d) {
    place(p);
    p.lb.dir = DIRS[d] ? d : null;
    p.lb.at = performance.now();
  }

  function step(t, dt) {
    const speed = size * 2.4; // pixels per second
    const halfW = size / 2 / W, minY = FLOOR_TOP + size * 0.2 / H;
    for (const p of players()) {
      place(p);
      const s = p.lb;
      if (p.bot && t > s.next) {
        // Test bots wander about on their own.
        const keys = Object.keys(DIRS);
        s.dir = Math.random() < 0.35 ? null : keys[Math.floor(Math.random() * 4)];
        s.at = t; s.next = t + 700 + Math.random() * 2200;
      }
      const v = s.dir && t - s.at < HOLD_MS ? DIRS[s.dir] : null;
      if (!v) { s.moving = false; continue; }
      s.moving = true;
      if (v[0]) s.face = v[0];
      s.x = Math.min(1 - halfW, Math.max(halfW, s.x + v[0] * speed * dt / W));
      s.y = Math.min(0.985, Math.max(minY, s.y + v[1] * speed * dt / H));
    }
  }

  function draw() {
    const h = size * 24 / 26 + 22; // hero picture + name tag
    for (const p of players()) {
      const el = els.get(p.id); if (!el || !p.lb) continue;
      const s = p.lb;
      el.style.transform = `translate(${Math.round(s.x * W - size / 2)}px, ${Math.round(s.y * H - h)}px)`;
      el.style.zIndex = Math.round(s.y * 1000) + 1;
      el.classList.toggle('walking', !!s.moving);
      el.classList.toggle('face-left', s.face < 0);
    }
  }

  function loop(t) {
    if (!room.isConnected || room.offsetParent === null) { raf = 0; return; }
    const dt = Math.min(0.05, (t - lastT) / 1000);
    lastT = t;
    step(t, dt);
    draw();
    raf = requestAnimationFrame(loop);
  }
  function start() { if (!raf) { lastT = performance.now(); raf = requestAnimationFrame(loop); } }

  addEventListener('resize', () => { measure(); draw(); });
  return { sync, setDir, start };
}
