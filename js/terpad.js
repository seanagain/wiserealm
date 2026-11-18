// Territory Battle on the iPad: the student's own copy of the map, so they don't have to find
// themselves on the projector.
//
// To save Supabase messages the projector sends the map ONCE (tmap), then one small update a
// second (tt) with the paint and everyone's positions. Between updates the iPad moves the
// student's own hero itself, with the same rules as the projector, so steering feels instant.
// The projector stays in charge: if it disagrees about where the hero is, the iPad snaps to it.
import { mapSVG, paintCell, decodeMap, decodeOwn, heroTag, isBase, TEAMS } from './terview.js';

const STEP_MS = 200, LOOP_MS = 60;
const DIRS = { u: [0, -1], d: [0, 1], l: [-1, 0], r: [1, 0] };

export function createTerPad({ box, getCode, pid, avatarSVG, toHost, getDir, canMove, active }) {
  let T = null, ver = null, roster = [], meIdx = -1, els = [];
  let me = null, team = 0, flags = 0, ink = 0, hist = [], lastStep = 0, lastMove = 0, askedAt = 0;
  const pending = new Map(); // tiles this iPad painted that the projector hasn't confirmed yet
  let shown = '';            // paint currently drawn, one digit per tile

  const pct = (x, y) => ({ left: ((x + 0.5) / T.W) * 100 + '%', top: ((y + 0.5) / T.H) * 100 + '%' });
  const board = () => box.querySelector('.tp-board');

  function needMap() {
    const now = performance.now();
    if (now - askedAt < 2500) return;
    askedAt = now;
    toHost({ t: 'tneed', id: pid });
  }

  function onMap(m) {
    const t = decodeMap(m); if (!t) return;
    const old = T && T.W === t.W && T.H === t.H ? shown : '';
    T = t; ver = m.v; roster = Array.isArray(m.pl) ? m.pl : [];
    if (old) decodeOwn(T, old);
    const myTag = heroTag(getCode(), pid);
    meIdx = roster.findIndex(r => r && r[0] === myTag);
    team = meIdx >= 0 ? +roster[meIdx][2] : 0;
    box.innerHTML = `<div class="mz-board tp-board" style="--ratio:${T.W / T.H};--tile:${100 / T.W}%">${mapSVG(T, 'pv')}</div>`;
    shown = T.own.map(r => r.join('')).join('');
    const b = board();
    els = roster.map((r, i) => {
      const el = document.createElement('div');
      el.className = 'mz-hero ter-hero tp-hero team' + (+r[2] || 1) + (i === meIdx ? ' me' : '');
      el.innerHTML = `<div class="av-wrap">${avatarSVG(r[3] || {})}</div>` + (i === meIdx ? '<div class="tp-you">YOU</div>' : '');
      el.hidden = true;
      b.append(el);
      return el;
    });
    if (meIdx >= 0) els[meIdx].style.zIndex = 50;
  }

  function put(i, x, y) {
    const el = els[i]; if (!el) return;
    const p = pct(x, y);
    el.style.left = p.left; el.style.top = p.top; el.hidden = false;
  }

  function repaint() {
    let s = '';
    for (let y = 0; y < T.H; y++) for (let x = 0; x < T.W; x++) {
      const v = String(T.own[y][x]);
      if (shown[y * T.W + x] !== v) paintCell(T, x, y, 'pv');
      s += v;
    }
    shown = s;
  }

  function onTick(m) {
    if (!T || m.v !== ver) { needMap(); return; }
    if (!decodeOwn(T, m.o)) return;
    const now = performance.now();
    // Keep our own fresh paint until the projector catches up (or someone paints over it).
    let unconfirmed = 0;
    for (const [k, t] of pending) {
      const [x, y] = k.split(',').map(Number);
      if (T.own[y][x] === team || now - t > 2000) pending.delete(k);
      else { T.own[y][x] = team; unconfirmed++; }
    }
    repaint();
    const ps = Array.isArray(m.p) ? m.p : [];
    ps.forEach((p, i) => {
      if (!Array.isArray(p) || !els[i]) return;
      const [x, y, f] = p;
      els[i].classList.toggle('busy', !!(f & 1));
      els[i].classList.toggle('done', !!(f & 2));
      els[i].classList.toggle('inv', !!(f & 4));
      if (i !== meIdx) put(i, x, y);
    });
    const mine = ps[meIdx];
    if (!mine) return;
    const [hx, hy, f, hk] = mine;
    flags = f; ink = Math.max(0, (+hk || 0) - unconfirmed);
    const same = me && me.x === hx && me.y === hy;
    const behind = hist.some(h => h.x === hx && h.y === hy && now - h.t < 2000);
    const recently = now - lastMove < 1500;
    // Snap to the projector when it has moved us (duel lost, bounced back) or we disagree.
    if (!me || (f & 3) || (!same && !(behind && recently))) { me = { x: hx, y: hy }; hist = []; }
    put(meIdx, me.x, me.y);
  }

  function step() {
    if (!T || !me || meIdx < 0 || !active()) return;
    const d = getDir(), now = performance.now();
    if (!d || !DIRS[d] || !canMove() || (flags & 3) || now - lastStep < STEP_MS) return;
    lastStep = now;
    const [dx, dy] = DIRS[d], nx = me.x + dx, ny = me.y + dy;
    if (nx < 0 || ny < 0 || nx >= T.W || ny >= T.H || T.rock[ny][nx]) return;
    if (isBase(T, nx) && nx !== (team === 1 ? 0 : T.W - 1)) return;
    if (T.own[ny][nx] !== team) {
      if (ink <= 0) return; // the projector will ask an ink question
      ink--;
      T.own[ny][nx] = team; pending.set(nx + ',' + ny, now); paintCell(T, nx, ny, 'pv');
      shown = shown.slice(0, ny * T.W + nx) + team + shown.slice(ny * T.W + nx + 1);
    }
    hist.push({ x: me.x, y: me.y, t: now }); if (hist.length > 12) hist.shift();
    me = { x: nx, y: ny }; lastMove = now;
    put(meIdx, nx, ny);
  }
  setInterval(step, LOOP_MS);

  return {
    onMsg(m) { if (m.t === 'tmap') onMap(m); else if (m.t === 'tt') onTick(m); },
    teamName: () => (team ? TEAMS[team].name : ''),
    ready() { if (!T) { box.innerHTML = '<p class="muted">Loading the map…</p>'; needMap(); } },
  };
}
