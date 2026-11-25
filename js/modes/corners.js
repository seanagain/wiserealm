// Four Corners Dash: each answer is a corner of the map. Students tap a corner on their
// iPad and their hero walks there (they can change their mind until time runs out).
// Wrong corners turn to lava. Heroes have 3 hearts; knocked-out heroes become ghosts
// who keep answering for half points and come back after 2 correct answers in a row.
import { CHOICE_STYLE } from '../common.js';

const HEARTS = 3;
const LAYOUTS = {
  2: [{ x: 2, y: 8, w: 36, h: 84 }, { x: 62, y: 8, w: 36, h: 84 }],
  3: [{ x: 2, y: 3, w: 36, h: 44 }, { x: 62, y: 3, w: 36, h: 44 }, { x: 32, y: 55, w: 36, h: 42 }],
  4: [{ x: 2, y: 3, w: 36, h: 44 }, { x: 62, y: 3, w: 36, h: 44 }, { x: 2, y: 53, w: 36, h: 44 }, { x: 62, y: 53, w: 36, h: 44 }],
};
const SPAWN = { x: 40, y: 28, w: 20, h: 44 };

// Lone Wolf bonus: rewards thinking for yourself instead of following the crowd.
// Only counts if you picked in the first half of the time and never switched corners,
// so jumping to an empty corner at the last second doesn't work.
const LONE = 100, BOLD = 40;
const loneOn = ctx => ctx.S.loneBonus !== false;
const secretOn = ctx => !!ctx.S.secretCorners;

const alive = p => p.m.hearts > 0;
const heartsText = p => (alive(p) ? '♥'.repeat(p.m.hearts) + '♡'.repeat(HEARTS - p.m.hearts) : 'GHOST');

function ensure(p) {
  if (p.m.hearts === undefined) { p.m.hearts = HEARTS; p.m.ghostStreak = 0; p.m.spot = -1; }
}

// Spread heroes evenly over a rectangle (in % of the map).
function slots(rect, n) {
  if (!n) return [];
  // Corners are wide on screen, so prefer rows of heroes side by side.
  const cols = Math.max(1, Math.min(n, Math.ceil(Math.sqrt(n * (rect === SPAWN ? 1.2 : 2.6)))));
  const rows = Math.ceil(n / cols);
  const out = [];
  for (let i = 0; i < n; i++) {
    const c = i % cols, r = Math.floor(i / cols);
    out.push({ x: rect.x + (rect.w * (c + 0.5)) / cols, y: rect.y + 22 + ((rect.h - 22) * (r + 0.5)) / rows });
  }
  return out;
}

function layout(ctx, reveal = false) {
  const { G, heroEls } = ctx;
  // Secret corners: everyone waits in the middle until time is up, so there's no one to follow.
  const hide = secretOn(ctx) && G.phase === 'question' && !reveal;
  const q = G.qs[G.qi];
  const zones = q ? LAYOUTS[q.choices.length] || LAYOUTS[4] : [];
  const groups = new Map();
  for (const p of ctx.players()) {
    ensure(p);
    const a = G.phase === 'question' || G.phase === 'reveal' ? G.answers.get(p.id) : null;
    const key = a && !hide ? a.c : -1;
    const el = heroEls.get(p.id);
    if (el) el.classList.toggle('picked', !!a && hide);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  for (const [key, list] of groups) {
    const pos = slots(key === -1 ? SPAWN : zones[key], list.length);
    list.forEach((p, i) => {
      const el = heroEls.get(p.id); if (!el) return;
      if (p.m.spot !== key || el.dataset.x !== String(pos[i].x) || el.dataset.y !== String(pos[i].y)) {
        if (p.m.spot !== key) { el.classList.remove('walk'); void el.offsetWidth; el.classList.add('walk'); }
        el.style.left = pos[i].x + '%'; el.style.top = pos[i].y + '%';
        el.dataset.x = pos[i].x; el.dataset.y = pos[i].y;
      }
      p.m.spot = key;
    });
  }
}

function renderPlayers(ctx) {
  const { $, esc, heroEls, avatarSVG, players } = ctx;
  const map = $('#cmap'); if (!map) return;
  map.querySelectorAll('.chero').forEach(el => el.remove());
  heroEls.clear();
  const list = players();
  const size = list.length <= 12 ? 78 : list.length <= 24 ? 64 : 52;
  map.style.setProperty('--ch', size + 'px');
  for (const p of list) {
    ensure(p);
    const el = document.createElement('div');
    el.className = 'chero' + (alive(p) ? '' : ' ghost');
    el.dataset.id = p.id;
    el.innerHTML = `<div class="hearts">${heartsText(p)}</div><div class="av-wrap">${avatarSVG(p.av)}</div><div class="nm">${esc(p.name)}</div>`;
    el.style.left = SPAWN.x + SPAWN.w / 2 + '%'; el.style.top = SPAWN.y + SPAWN.h / 2 + '%';
    map.append(el);
    heroEls.set(p.id, el);
  }
  for (const p of list) p.m.spot = null;
  layout(ctx);
}

function updateHero(ctx, p) {
  const el = ctx.heroEls.get(p.id); if (!el) return;
  el.classList.toggle('ghost', !alive(p));
  el.querySelector('.hearts').textContent = heartsText(p);
}

function renderBoard(ctx) {
  const { $, esc, fmt } = ctx;
  const top = ctx.ranked().slice(0, 6);
  $('#cboard').innerHTML = `<h3>Top heroes</h3>` + top.map((p, i) =>
    `<div class="brow"><span>${i + 1}. ${esc(p.name)}</span><b>${fmt(p.score)}</b></div>`).join('');
}

export default {
  id: 'corners',
  // How it rates in the game picker (1-5): learning focus vs. fun gameplay.
  rating: { learn: 5, fun: 4, why: 'Everyone answers every question, with the answer shown each time. Turn on Secret corners to stop copying.' },
  name: 'Four Corners Dash',
  blurb: 'Run to the corner with the right answer! Wrong corners turn to lava. 3 hearts each; ghosts can revive.',
  scoreName: 'Points',
  scoreShort: 'pts',
  allowChange: true,
  showChoices: false,

  settings(ctx, el, persist) {
    const { S } = ctx;
    el.innerHTML = `<label title="Bonus for a right answer with few or no other players in your corner. Only if you picked in the first half of the time and never switched.">🐺 Lone Wolf bonus <input type="checkbox" id="cLone"></label>
      <p class="muted" style="margin:-6px 0 0;font-size:.82rem">Right and alone: +${LONE}. Right with only a few others: +${BOLD}. Must pick in the first half and stay put.</p>
      <label title="Heroes wait in the middle until time is up, so students can't follow each other">Secret corners <input type="checkbox" id="cSecret"></label>
      <p class="muted" style="margin:-6px 0 0;font-size:.82rem">Hides where everyone is running until time’s up.</p>`;
    const lone = el.querySelector('#cLone'), sec = el.querySelector('#cSecret');
    lone.checked = loneOn(ctx); sec.checked = secretOn(ctx);
    lone.onchange = () => { S.loneBonus = lone.checked; persist(); };
    sec.onchange = () => { S.secretCorners = sec.checked; persist(); };
  },
  publicState(ctx) { return { lone: loneOn(ctx), secret: secretOn(ctx) }; },

  mount(ctx) {
    ctx.stage.innerHTML = `<div class="cwrap"><div class="cmap" id="cmap"><div class="spawn" style="left:${SPAWN.x}%;top:${SPAWN.y}%;width:${SPAWN.w}%;height:${SPAWN.h}%"></div><div id="zones"></div></div>
      <div class="card cboard" id="cboard"></div></div>`;
    for (const p of ctx.players()) { p.m = {}; ensure(p); }
    renderPlayers(ctx);
    renderBoard(ctx);
  },

  async start(ctx) {
    ctx.sfx('warning');
    await ctx.intro(`<span style="color:var(--gold)">FOUR CORNERS DASH</span><br><span style="font-size:.5em" class="muted">Tap a corner on your iPad. Wrong corners turn to LAVA!</span>`, 2600);
  },

  renderPlayers,
  addPlayer(ctx, p) { ensure(p); renderPlayers(ctx); },

  onQuestion(ctx, q) {
    const { $, esc } = ctx;
    const zones = LAYOUTS[q.choices.length] || LAYOUTS[4];
    $('#zones').innerHTML = q.choices.map((c, i) => {
      const z = zones[i];
      const fs = c.length > 60 ? 0.85 : c.length > 30 ? 1.05 : 1.35;
      return `<div class="zone ${CHOICE_STYLE[i].cls}" style="left:${z.x}%;top:${z.y}%;width:${z.w}%;height:${z.h}%">
        <div class="zlabel"><span class="ico">${CHOICE_STYLE[i].icon}</span><span style="font-size:${fs}em">${esc(c)}</span></div></div>`;
    }).join('');
    for (const p of ctx.players()) ensure(p);
    layout(ctx);
  },

  onAnswer(ctx, p, c) {
    const { G } = ctx, frac = (performance.now() - G.qStart) / G.limit;
    if (!p.m.pick || p.m.pick.qi !== G.qi) p.m.pick = { qi: G.qi, c, early: frac <= 0.5, switched: false };
    else if (c !== p.m.pick.c) p.m.pick.switched = true;
    layout(ctx);
  },

  reveal(ctx, q, results) {
    const { $$, heroEls, fmt, later, sfx, floatText, $ } = ctx;
    const res = {};
    let safe = 0, knocked = 0, revived = 0;
    layout(ctx, true); // secret corners: everyone runs to their corner now
    const inCorner = q.choices.map((_, i) => results.filter(r => r.a && r.a.c === i).length);
    const total = results.length, wolves = [];
    $$('#zones .zone').forEach((z, i) => z.classList.add(i === q.correct ? 'safe' : 'lava'));
    sfx('roar');
    for (const r of results) {
      const { p, a } = r;
      ensure(p);
      let pts = 0, line = '';
      if (r.correct) {
        safe++;
        pts = alive(p) ? 100 + Math.round(100 * (1 - r.frac)) : 50;
        if (p.streak >= 3) pts = Math.round(pts * 1.25);
        let bonus = '';
        const pk = p.m.pick;
        if (loneOn(ctx) && pk && pk.qi === ctx.G.qi && pk.early && !pk.switched && a) {
          const n = inCorner[a.c];
          if (n === 1 && total >= 4) { pts += LONE; bonus = ` 🐺 Lone Wolf +${LONE}!`; wolves.push(p.name); }
          else if (n >= 2 && total >= 8 && n <= Math.floor(total / 4)) { pts += BOLD; bonus = ` 🦊 Bold pick +${BOLD}!`; }
        }
        p.score += pts;
        if (!alive(p)) {
          p.m.ghostStreak++;
          if (p.m.ghostStreak >= 2) { p.m.hearts = 1; p.m.ghostStreak = 0; revived++; line = `Revived! +${fmt(pts)} points`; }
          else line = `+${fmt(pts)} points. One more correct to revive!`;
        } else line = `Safe! +${fmt(pts)} points`;
        line += bonus;
      } else {
        p.m.ghostStreak = 0;
        if (alive(p)) {
          p.m.hearts--;
          if (!alive(p)) { knocked++; line = 'Knocked out! You’re a ghost now. Answer 2 in a row to revive!'; }
          else line = `Ouch! You lost a heart (${p.m.hearts} left).`;
        } else line = 'Still a ghost. Get the next one right!';
      }
      if (!p.bot) res[p.id] = [a ? a.c : -1, pts, line];
      const el = heroEls.get(p.id);
      if (el) {
        later(() => {
          el.classList.remove('jump', 'hurt'); void el.offsetWidth;
          el.classList.add(r.correct ? 'jump' : 'hurt');
          const wolf = wolves.includes(p.name);
          if (pts) floatText($('#cmap'), (wolf ? '🐺 ' : '') + '+' + fmt(pts), r.frac < 0.25 || wolf ? 'crit' : '', parseFloat(el.style.left), parseFloat(el.style.top) - 8);
          updateHero(ctx, p);
          if (!r.correct) sfx('hit');
        }, 500 + Math.random() * 500);
      }
    }
    if (revived) later(() => sfx('heal'), 1200);
    later(() => renderBoard(ctx), 1300);
    ctx.setRoundMsg(`<span class="good">${safe} safe</span> · <span class="bad">${results.length - safe} in the lava</span>` +
      (knocked ? ` · ${knocked} knocked out` : '') + (revived ? ` · <span class="good">${revived} revived!</span>` : '') +
      (wolves.length ? ` · <span style="color:var(--gold)">🐺 Lone Wolf: ${wolves.map(ctx.esc).join(', ')}</span>` : ''));
    const still = ctx.players().filter(alive).length;
    return { res, note: `${still} heroes still standing`, duration: 2300 };
  },

  tag(ctx, p) { ensure(p); return heartsText(p); },
  hud(ctx) { return `${ctx.players().filter(p => p.m.hearts > 0).length} standing`; },

  endInfo(ctx) {
    const list = ctx.ranked();
    const survivors = list.filter(p => p.m.hearts > 0).length;
    return { win: null, title: '🏁 Final standings', sub: `${survivors} of ${list.length} heroes survived the lava!${list[0] ? ` Top score: ${list[0].name}.` : ''}` };
  },
};
