// Quiz Kart Rally: everyone races around the track. Crossing the start line stops you at a quiz
// gate: a right answer gives a turbo boost, a wrong one a short wait. Item boxes give a Turbo or a
// banana peel to drop behind you; hit a peel and you spin out until you answer a question.
// The projector shows the track from above; each iPad shows a 3D-ish road view (js/kartpad.js).
//
// Messages: each iPad drives its own kart and reports its position about once a second; the
// projector sends everyone one combined update a second.
import { buildTrack, paintTrack, WORLD } from '../karttrack.js';
import { heroTag } from '../terview.js';

const SNAP_MS = 1000, MAX_SPEED = 210;
const PLACE_PTS = [300, 250, 210, 180, 160, 140, 120, 100];

function ensure(ctx, p) {
  if (p.m && p.m.slot !== undefined) return;
  const T = ctx.G.extra;
  const slot = T.nextSlot++;
  const g = T.track.gridSpot(slot);
  p.m = { slot, x: g.x, y: g.y, a: g.a, s: 0, lap: 1, i: T.track.nearest(g.x, g.y), half: false, fin: false, finAt: 0, rank: 0, busy: null, qorder: [], seen: performance.now(), lastLapAt: 0, drops: 0, waitUntil: 0 };
  p.asked = p.asked || 0;
}

// Race position: laps done, then how far round this lap. Before the halfway point, a spot near the
// end of the loop means "just behind the start line", not "almost done".
const progress = (T, p) => {
  if (p.m.fin) return 1e9 - p.m.finAt;
  const N = T.track.N, i = p.m.half || p.m.i < N * 0.5 ? p.m.i : p.m.i - N;
  return (p.m.lap - 1) * N + i;
};
function standings(ctx) {
  const T = ctx.G.extra;
  return ctx.players().slice().sort((a, b) => progress(T, b) - progress(T, a));
}

// ---------------- questions (personal, like the maze) ----------------
function nextQ(ctx, p) {
  if (!p.m.qorder.length) {
    p.m.qorder = ctx.G.qs.map((_, i) => i);
    for (let i = p.m.qorder.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [p.m.qorder[i], p.m.qorder[j]] = [p.m.qorder[j], p.m.qorder[i]]; }
  }
  return p.m.qorder.pop();
}
function ask(ctx, p, kind) {
  const qi = nextQ(ctx, p), token = Math.random().toString(36).slice(2, 9);
  p.m.busy = { kind, token, qi };
  const q = ctx.G.qs[qi];
  ctx.send({ t: 'mq', to: p.id, k: token, kind, q: { prompt: q.prompt, choices: q.choices } });
  if (p.bot) ctx.later(() => answer(ctx, p, token, Math.random() < p.skill ? q.correct : (q.correct + 1) % q.choices.length), 1000 + Math.random() * 3500);
}
function resend(ctx, p) { const b = p.m.busy; if (!b) return; const q = ctx.G.qs[b.qi]; ctx.send({ t: 'mq', to: p.id, k: b.token, kind: b.kind, q: { prompt: q.prompt, choices: q.choices } }); }
function track(ctx, p, qi, ok) {
  const q = ctx.G.qs[qi];
  if (!p.bot) { const st = ctx.G.qstats[qi] || (ctx.G.qstats[qi] = { p: q.prompt, a: q.choices[q.correct], n: 0, r: 0 }); st.n++; if (ok) st.r++; }
  p.asked++; p.answered = (p.answered || 0) + 1;
  if (ok) { p.correct++; p.streak++; } else { p.streak = 0; (p.missed = p.missed || []).push(qi); }
}
const tagOf = (ctx, p) => (p.m.fin ? `🏁 #${p.m.rank}` : `Lap ${Math.min(p.m.lap, ctx.S.kartLaps || 3)}/${ctx.S.kartLaps || 3}`);
const res = (ctx, p, ok, line, extra = {}) => ctx.send({ t: 'mres', to: p.id, ok, line, score: p.score, tag: tagOf(ctx, p), ...extra });

function answer(ctx, p, token, c) {
  const b = p.m.busy;
  if (!b || b.token !== token) return;
  const q = ctx.G.qs[b.qi], ok = Number(c) === q.correct;
  track(ctx, p, b.qi, ok);
  p.m.busy = null;
  const right = `(Answer: ${q.choices[q.correct]})`;
  if (b.kind === 'lap') {
    p.m.lap++; p.m.lastLapAt = performance.now();
    if (ok) { p.score += 50; res(ctx, p, true, `Correct! +50 ⚡ TURBO! Lap ${p.m.lap}!`, { boost: true, lap: p.m.lap }); ctx.sfx('reveal'); }
    else { p.m.waitUntil = performance.now() + 3000; res(ctx, p, false, `Not quite ${right}. Wait 3 seconds…`, { wait: 3000, lap: p.m.lap }); ctx.sfx('bad'); }
  } else {
    if (ok) { p.score += 20; res(ctx, p, true, 'Correct! +20. Back in the race!'); }
    else { p.m.waitUntil = performance.now() + 3000; res(ctx, p, false, `Not quite ${right}. Wait 3 seconds…`, { wait: 3000 }); }
  }
  renderSide(ctx);
}

// ---------------- projector drawing ----------------
function renderSide(ctx) {
  const { $, esc } = ctx, el = $('#krSide'); if (!el) return;
  const list = standings(ctx), laps = ctx.S.kartLaps || 3;
  el.innerHTML = `<h3>🏁 Standings</h3>` + list.map((p, i) => `<div class="brow"><span>${i + 1}. ${esc(p.name)}</span><b>${p.m.fin ? '🏁' : `Lap ${Math.min(p.m.lap, laps)}/${laps}`}</b></div>`).join('');
}
function drawKarts(ctx) {
  const T = ctx.G.extra, layer = ctx.$('#krLayer'); if (!layer) return;
  for (const p of ctx.players()) {
    let el = ctx.heroEls.get(p.id);
    if (!el) {
      el = document.createElement('div'); el.className = 'kr-kart';
      el.innerHTML = `<div class="av-wrap">${ctx.avatarSVG(p.av)}</div><div class="nm">${ctx.esc(p.name)}</div>`;
      layer.append(el); ctx.heroEls.set(p.id, el);
    }
    el.style.left = (100 * p.m.x) / WORLD + '%'; el.style.top = (100 * p.m.y) / WORLD + '%';
    el.classList.toggle('busy', !!p.m.busy); el.classList.toggle('fin', p.m.fin);
  }
  const bl = ctx.$('#krBananas');
  if (bl) bl.innerHTML = T.bananas.map(b => `<span class="kr-banana" style="left:${(100 * b.x) / WORLD}%;top:${(100 * b.y) / WORLD}%">🍌</span>`).join('');
}

// ---------------- iPad updates ----------------
function syncRoster(ctx) {
  const T = ctx.G.extra, list = ctx.players();
  const key = list.map(p => p.id + ':' + p.m.slot).join('|');
  if (key === T.rosterKey) return false;
  T.rosterKey = key; T.ver = (T.ver || Math.floor(Math.random() * 1e6)) + 1;
  return true;
}
function sendRoster(ctx) {
  const T = ctx.G.extra, now = performance.now();
  if (now - (T.rosterAt || 0) < 1200) return;
  T.rosterAt = now;
  syncRoster(ctx);
  const r = [];
  for (const p of ctx.players()) r[p.m.slot] = [heroTag(ctx.code, p.id), p.name, p.av];
  ctx.send({ t: 'kr', v: T.ver, laps: ctx.S.kartLaps || 3, r: r.map(e => e || ['', '', {}]) });
}
function sendSnap(ctx) {
  const T = ctx.G.extra;
  if (syncRoster(ctx)) { T.rosterAt = 0; sendRoster(ctx); }
  const list = standings(ctx), rank = new Map(list.map((p, i) => [p.id, i + 1]));
  const p = ctx.players().map(q => [q.m.slot, Math.round(q.m.x), Math.round(q.m.y), Math.round(q.m.a * 100) / 100, Math.round(q.m.s), q.m.lap, rank.get(q.id)]);
  const b = T.bananas.map(x => [x.id, x.x, x.y, x.by]);
  const sig = JSON.stringify([p, b]), now = performance.now();
  if (sig === T.snapSig && now - (T.snapAt || 0) < 5000) return;
  T.snapSig = sig; T.snapAt = now;
  ctx.send({ t: 'ks', v: T.ver, p, b });
}

// Bots follow the middle of the road at their own speed.
function botStep(ctx, p, dt, now) {
  const T = ctx.G.extra, tr = T.track;
  if (p.m.fin || p.m.busy || now < p.m.waitUntil) { p.m.s = 0; return; }
  p.m.botSpeed = p.m.botSpeed || 85 + Math.random() * 30;
  p.m.s = Math.min(p.m.botSpeed, p.m.s + 95 * dt); // speeds up like a real kart
  const before = p.m.i;
  p.m.i = (p.m.i + Math.max(1, Math.round((p.m.s * dt) / 4))) % tr.N;
  if (p.m.i > tr.N * 0.4 && p.m.i < tr.N * 0.6) p.m.half = true;
  const wrapped = p.m.i < before, counts = wrapped && p.m.half;
  if (wrapped) p.m.half = false;
  const [x, y] = tr.pts[p.m.i], [dx, dy] = tr.dirs[p.m.i], off = ((p.m.slot % 3) - 1) * 10;
  p.m.x = x - dy * off; p.m.y = y + dx * off; p.m.a = Math.atan2(dy, dx);
  if (counts) lapDone(ctx, p);
}
function lapDone(ctx, p) {
  const laps = ctx.S.kartLaps || 3, T = ctx.G.extra;
  if (p.m.lap >= laps) {
    p.m.fin = true; p.m.finAt = performance.now(); p.m.rank = ++T.finished;
    p.score += PLACE_PTS[p.m.rank - 1] || 80;
    res(ctx, p, true, `🏁 You finished ${p.m.rank}${['st', 'nd', 'rd'][p.m.rank - 1] || 'th'}! +${PLACE_PTS[p.m.rank - 1] || 80}`, { lap: p.m.lap });
    ctx.sfx(p.m.rank === 1 ? 'crit' : 'reveal');
    if (p.m.rank === 1) ctx.setRoundMsg(`<span style="color:var(--gold)">🏆 ${ctx.esc(p.name)} wins the race!</span>`);
  } else ask(ctx, p, 'lap');
  renderSide(ctx);
}

export default {
  id: 'kart',
  name: 'Quiz Kart Rally',
  blurb: 'Race karts around the track! Each lap starts with a quiz gate: right answers give a turbo boost. Grab item boxes for turbos and banana peels; slip on a peel and you must answer to drive on.',
  scoreName: 'Points',
  scoreShort: 'pts',
  selfPaced: true,

  settings(ctx, el, persist) {
    const { S } = ctx;
    S.kartLaps = S.kartLaps || 3; S.kartMins = S.kartMins || 6;
    el.innerHTML = `<label>Laps <select id="kLaps">${[2, 3, 4, 5].map(n => `<option value="${n}">${n} laps</option>`).join('')}</select></label>
      <label>Time limit <select id="kMins">${[4, 6, 8, 10].map(n => `<option value="${n}">${n} min</option>`).join('')}</select></label>
      <p class="muted" style="margin:-6px 0 0;font-size:.82rem">One question per lap, plus one for each banana peel hit. Each iPad shows a 3D road view.</p>`;
    const l = el.querySelector('#kLaps'), m = el.querySelector('#kMins');
    l.value = S.kartLaps; m.value = S.kartMins;
    l.onchange = () => { S.kartLaps = +l.value; persist(); };
    m.onchange = () => { S.kartMins = +m.value; persist(); };
  },

  mount(ctx) {
    ctx.stage.innerHTML = `<div class="kr-wrap"><div class="kr-map" id="krMap"><canvas id="krCanvas"></canvas><div id="krBananas"></div><div id="krLayer"></div></div>
      <div class="mz-side"><div class="card mz-timer-card"><div class="muted">TIME LEFT</div><div class="mz-timer" id="mzTimer">--:--</div></div>
      <div class="card cboard" id="krSide"></div></div></div>`;
    ctx.G.extra = { track: buildTrack(), nextSlot: 0, bananas: [], seq: 1, finished: 0 };
    paintTrack(ctx.$('#krCanvas'));
    ctx.heroEls.clear();
    for (const p of ctx.players()) { p.m = {}; ensure(ctx, p); }
    drawKarts(ctx); renderSide(ctx);
  },

  async start(ctx) {
    sendRoster(ctx); ctx.broadcast();
    ctx.sfx('warning');
    await ctx.intro(`<span style="color:var(--gold)">🏎 QUIZ KART RALLY</span><br>${ctx.S.kartLaps || 3} laps · quiz gate every lap<br><span style="font-size:.5em" class="muted">Steer with ◀ ▶ on your iPad. Grab ? boxes for turbos and banana peels!</span>`, 3000);
    for (const n of ['3', '2', '1']) { await ctx.intro(`<span style="font-size:2.4em">${n}</span>`, 700); }
  },

  run(ctx) {
    const { G, S } = ctx, T = G.extra;
    T.endAt = performance.now() + (S.kartMins || 6) * 60000;
    ctx.broadcast();
    ctx.setRoundMsg('🏁 GO!');
    return new Promise(resolve => {
      let lastT = performance.now(), lastSnap = 0, lastSide = 0;
      const iv = setInterval(() => {
        const now = performance.now(), dt = Math.min(0.2, (now - lastT) / 1000); lastT = now;
        const left = Math.max(0, T.endAt - now), all = ctx.players();
        const clock = `${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}`;
        const tEl = ctx.$('#mzTimer'); if (tEl) { tEl.textContent = clock; tEl.classList.toggle('urgent', left < 30000); }
        ctx.setStatus(`⏱ ${clock} left · ${T.finished} / ${all.length} finished`);
        const humansLeft = all.filter(p => !p.bot && !p.m.fin).length;
        if (left <= 0 || (all.length && T.finished === all.length) || (humansLeft === 0 && all.some(p => !p.bot))) { clearInterval(iv); resolve(); return; }
        for (const p of all) {
          ensure(ctx, p);
          if (p.bot) botStep(ctx, p, dt, now);
          else if (!p.m.fin && p.m.s > 0) { // fill in between the iPad's updates
            const tr = T.track, nx = p.m.x + Math.cos(p.m.a) * p.m.s * dt, ny = p.m.y + Math.sin(p.m.a) * p.m.s * dt;
            if (tr.surface(nx, ny)) { p.m.x = nx; p.m.y = ny; }
            const ni = tr.nearest(p.m.x, p.m.y, p.m.i);
            if (ni >= p.m.i || p.m.i - ni > tr.N / 2) p.m.i = ni; // keep the place up to date between reports
          }
        }
        T.bananas = T.bananas.filter(b => now - b.at < 90000);
        if (now - lastSnap >= SNAP_MS) { lastSnap = now; sendSnap(ctx); }
        if (now - lastSide > 900) { lastSide = now; renderSide(ctx); }
        drawKarts(ctx);
      }, 50);
      G.timers.push(iv);
    });
  },

  onMessage(ctx, m) {
    if (ctx.G.phase !== 'play' && ctx.G.phase !== 'intro') return;
    const p = ctx.G.players.get(m.id); if (!p) return;
    ensure(ctx, p);
    const T = ctx.G.extra, now = performance.now();
    if (m.t === 'kneed') { T.rosterAt = 0; sendRoster(ctx); return; }
    if (ctx.G.phase !== 'play') return;
    if (m.t === 'kp') {
      const x = +m.x, y = +m.y, dt = Math.max(0.3, (now - p.m.seen) / 1000);
      if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > WORLD || y > WORLD) return;
      if (Math.hypot(x - p.m.x, y - p.m.y) > MAX_SPEED * dt * 1.6 + 40) return; // too fast to be real
      Object.assign(p.m, { x, y, a: +m.a || 0, s: Math.min(MAX_SPEED, Math.max(0, +m.s || 0)), seen: now });
      if (Number.isInteger(m.i) && m.i >= 0 && m.i < T.track.N) { p.m.i = m.i; if (m.i > T.track.N * 0.4 && m.i < T.track.N * 0.6) p.m.half = true; }
    } else if (m.t === 'klap') {
      if (p.m.fin) return;
      if (p.m.busy && p.m.busy.kind === 'lap') return resend(ctx, p);
      if (Number(m.lap) !== p.m.lap || now - p.m.lastLapAt < 8000 || now < p.m.waitUntil) return;
      p.m.i = 0; p.m.half = false;
      lapDone(ctx, p);
    } else if (m.t === 'kdrop') {
      if (now - (p.m.lastDrop || 0) < 4000 || T.bananas.length > 40) return;
      p.m.lastDrop = now;
      const x = Math.round(+m.x), y = Math.round(+m.y);
      if (!Number.isFinite(x) || Math.hypot(x - p.m.x, y - p.m.y) > 80) return;
      T.bananas.push({ id: T.seq++, x, y, by: p.m.slot, at: now });
      T.snapSig = '';
    } else if (m.t === 'khit') {
      if (p.m.busy) return resend(ctx, p);
      T.bananas = T.bananas.filter(b => b.id !== m.b);
      T.snapSig = '';
      ask(ctx, p, 'banana');
    } else if (m.t === 'mans') answer(ctx, p, m.k, m.c);
  },

  renderPlayers(ctx) { if (ctx.G.phase === 'play' || ctx.G.phase === 'intro') { for (const p of ctx.players()) ensure(ctx, p); drawKarts(ctx); renderSide(ctx); } },
  addPlayer(ctx, p) { p.m = {}; p.asked = 0; ensure(ctx, p); drawKarts(ctx); renderSide(ctx); },
  rejoin(ctx, p) { ctx.G.extra.rosterAt = 0; sendRoster(ctx); if (p.m && p.m.busy) resend(ctx, p); },

  publicState(ctx) { const T = ctx.G.extra; return { laps: ctx.S.kartLaps || 3, ...(T && T.endAt ? { left: Math.max(0, T.endAt - performance.now()) } : {}) }; },
  tag(ctx, p) { return p.m && p.m.slot !== undefined ? tagOf(ctx, p) : ''; },
  hud(ctx) { const T = ctx.G.extra; return T && T.finished !== undefined ? `${T.finished} finished` : ''; },

  endInfo(ctx) {
    const list = standings(ctx), win = list[0];
    return { win: null, title: '🏁 Race results', sub: win ? `${win.name} ${win.m.fin ? 'won the race' : 'was in the lead'}!` : '' };
  },
};
