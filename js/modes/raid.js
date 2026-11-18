// Boss Raid: the whole class teams up. Correct answers attack the boss.
// 3+ right in a row = STREAK CRIT (double damage). The boss attacks back after every question:
// the more students miss, the harder it hits the team. Team HP 0 = the boss wins.
import { BOSSES, bossSVG } from '../boss.js';

// Boss difficulty: health multiplier and how hard it hits back (team damage if everyone missed).
export const LEVELS = {
  easy: { label: 'Easy', hp: 0.6, atk: 15 },
  normal: { label: 'Normal', hp: 1, atk: 25 },
  hard: { label: 'Hard', hp: 1.4, atk: 32 },
  epic: { label: 'Epic', hp: 2, atk: 40 },
};
const level = S => LEVELS[S.bossLevel] || LEVELS.normal;

function setTeam(ctx, v) {
  const R = ctx.G.extra;
  R.visTeam = Math.max(0, Math.min(100, v));
  const f = R.visTeam / 100;
  ctx.$('#teamFill').style.transform = `scaleX(${f})`;
  ctx.$('#teamText').textContent = `${Math.round(R.visTeam)} / 100`;
  ctx.$('#teamBar').classList.toggle('low', f < 0.3);
}

function setHp(ctx, v) {
  const { G, $, fmt } = ctx, R = G.extra;
  R.visHp = Math.max(0, Math.min(R.bossMax, v));
  const f = R.visHp / R.bossMax;
  $('#hpFill').style.transform = `scaleX(${f})`;
  $('#hpGhost').style.transform = `scaleX(${f})`;
  $('#hpText').textContent = `${fmt(R.visHp)} / ${fmt(R.bossMax)}`;
  const b = $('#boss');
  b.classList.toggle('angry', f < 0.5);
  b.classList.toggle('scared', f < 0.25);
}

function renderPlayers(ctx) {
  const { $, $$, heroEls, heroHTML, esc, players } = ctx;
  const party = $('#party'); if (!party) return;
  const list = players();
  const n = list.length;
  const hs = n <= 10 ? 96 : n <= 18 ? 80 : n <= 28 ? 66 : 54;
  party.style.setProperty('--hs', hs + 'px');
  party.innerHTML = list.map(p => `<div class="hero" data-id="${esc(p.id)}">${heroHTML(p)}</div>`).join('');
  heroEls.clear();
  $$('#party .hero').forEach(el => heroEls.set(el.dataset.id, el));
  if (ctx.G.phase === 'question') for (const id of ctx.G.answers.keys()) heroEls.get(id)?.classList.add('done');
}

function bossHit(ctx, h) {
  const b = ctx.$('#boss');
  b.classList.remove('hit'); void b.offsetWidth; b.classList.add('hit');
  ctx.floatText(ctx.$('#bossArea'), (h.crit ? '🔥 STREAK CRIT ' : '') + ctx.fmt(h.dmg), h.crit ? 'crit streak' : '');
  ctx.sfx(h.crit ? 'crit' : 'hit');
  if (h.crit) { const br = b.getBoundingClientRect(); ctx.sparks(br.left + br.width / 2, br.top + br.height / 2, '#ff7b00', 14, 120); }
}

// The boss lunges and throws a fireball at the party; heroes who missed flash red.
function bossAttack(ctx, teamDmg, results, after) {
  const { later, $, sfx, heroEls } = ctx;
  if (!teamDmg) {
    later(() => { ctx.floatText($('#bossArea'), 'MISS!', ''); }, after + 200);
    return 600;
  }
  later(() => {
    const boss = $('#boss');
    boss.classList.remove('lunge'); void boss.offsetWidth; boss.classList.add('lunge');
    sfx('roar');
    const br = boss.getBoundingClientRect(), pr = $('#party').getBoundingClientRect();
    const ball = document.createElement('div');
    ball.className = 'fireball';
    ball.style.left = br.left + br.width / 2 - 20 + 'px'; ball.style.top = br.top + br.height * 0.6 + 'px';
    document.body.append(ball);
    ball.animate([{ transform: 'translate(0,0) scale(.6)' }, { transform: `translate(${pr.left + pr.width / 2 - (br.left + br.width / 2)}px, ${pr.top + pr.height * 0.3 - (br.top + br.height * 0.6)}px) scale(1.4)` }],
      { duration: 600, easing: 'ease-in' }).onfinish = () => {
      ball.remove();
      sfx('explode');
      ctx.sparks(pr.left + pr.width / 2, pr.top + pr.height * 0.3, '#ff7b00', 18, 160);
      $('#party').classList.remove('shake'); void $('#party').offsetWidth; $('#party').classList.add('shake');
      for (const r of results) if (!r.correct) { const el = heroEls.get(r.p.id); if (el) { el.classList.remove('hurt'); void el.offsetWidth; el.classList.add('hurt'); } }
      setTeam(ctx, ctx.G.extra.team);
      ctx.floatText($('#bossArea'), `-${teamDmg} TEAM HP`, 'teamhit', 50, 80);
    };
  }, after + 150);
  return 1400;
}

function animateAttacks(ctx, hits) {
  const { G, $, later, avatarColor, heroEls, sparks, sfx } = ctx;
  if (!hits.length) { sfx('bad'); return 600; }
  const stagger = Math.max(50, Math.min(170, 2600 / hits.length));
  hits.forEach((h, i) => {
    later(() => {
      const p = G.players.get(h.id);
      const heroEl = heroEls.get(h.id);
      const done = () => { setHp(ctx, G.extra.visHp - h.dmg); bossHit(ctx, h); };
      if (!heroEl || !p) return done();
      heroEl.classList.remove('jump'); void heroEl.offsetWidth; heroEl.classList.add('jump');
      const r = heroEl.getBoundingClientRect();
      const br = $('#boss').getBoundingClientRect();
      const sx = r.left + r.width / 2 - 8, sy = r.top + r.height * 0.35;
      const tx = br.left + br.width * (0.35 + Math.random() * 0.3) - 8, ty = br.top + br.height * (0.3 + Math.random() * 0.3);
      const proj = document.createElement('div');
      proj.className = 'proj';
      proj.style.left = sx + 'px'; proj.style.top = sy + 'px';
      proj.style.color = avatarColor(p.av);
      document.body.append(proj);
      const dx = tx - sx, dy = ty - sy;
      proj.animate([
        { transform: 'translate(0,0) scale(.5)' },
        { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 90}px) scale(1)` },
        { transform: `translate(${dx}px, ${dy}px) scale(1.2)` },
      ], { duration: 520, easing: 'ease-in' }).onfinish = () => { proj.remove(); sparks(tx + 8, ty + 8, avatarColor(p.av)); done(); };
    }, i * stagger);
  });
  return (hits.length - 1) * stagger + 520 + 450;
}

export default {
  id: 'raid',
  name: 'Boss Raid',
  blurb: 'Team up! Every correct answer attacks the boss. Fast answers hit harder.',
  scoreName: 'Damage',
  scoreShort: 'dmg',

  settings(ctx, el, persist) {
    const { S, esc, $$ } = ctx;
    if (!(S.boss >= 0 && S.boss < BOSSES.length)) S.boss = 0;
    if (!LEVELS[S.bossLevel]) S.bossLevel = 'normal';
    if (S.bossAttacks === undefined) S.bossAttacks = true;
    el.innerHTML = `<div style="margin-bottom:6px">Boss</div><div class="boss-pick" id="bossPick">${BOSSES.map((b, i) => `<button data-b="${i}" title="${esc(b.name)}">${bossSVG(i)}</button>`).join('')}</div>
      <div class="muted" id="bossName" style="font-size:.85rem;margin-top:4px"></div>
      <label style="margin-top:8px">Boss health <select id="bossLevel">${Object.entries(LEVELS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}</select></label>
      <label>Boss attacks back <input type="checkbox" id="bossAttacks"></label>
      <p class="muted" style="margin:-4px 0 0;font-size:.8rem">After each question the boss hits the team. More misses = bigger hit. Team HP 0 = boss wins.</p>`;
    const lv = el.querySelector('#bossLevel'), ak = el.querySelector('#bossAttacks');
    lv.value = S.bossLevel; ak.checked = S.bossAttacks;
    lv.onchange = () => { S.bossLevel = lv.value; persist(); };
    ak.onchange = () => { S.bossAttacks = ak.checked; persist(); };
    const mark = () => {
      $$('#bossPick button').forEach(b => b.classList.toggle('sel', +b.dataset.b === S.boss));
      el.querySelector('#bossName').textContent = BOSSES[S.boss].name;
    };
    el.querySelector('#bossPick').onclick = e => { const b = e.target.closest('button'); if (!b) return; S.boss = +b.dataset.b; persist(); mark(); };
    mark();
  },

  mount(ctx) {
    const { G, S, stage, players } = ctx;
    stage.innerHTML = `
      <div class="hp-wrap"><div class="hp-name" id="bossTitle"></div>
        <div class="hp-bar"><div class="hp-ghost" id="hpGhost"></div><div class="hp-fill" id="hpFill"></div><div class="hp-text" id="hpText"></div></div></div>
      <div class="boss-area" id="bossArea"><div class="boss" id="boss"></div></div>
      <div class="hp-wrap team-wrap" ${S.bossAttacks === false ? 'hidden' : ''}><div class="hp-name">Team HP</div>
        <div class="hp-bar team" id="teamBar"><div class="hp-fill team-fill" id="teamFill"></div><div class="hp-text" id="teamText"></div></div></div>
      <div class="party" id="party"></div>`;
    // Boss health scales with class size so roughly 65-70% accuracy wins on Normal.
    const max = Math.max(300, Math.round((players().length * G.qs.length * 150 * 0.65 * level(S).hp) / 50) * 50);
    G.extra = { bossMax: max, bossHp: max, visHp: max, team: 100, visTeam: 100 };
    ctx.$('#boss').innerHTML = bossSVG(S.boss);
    ctx.$('#bossTitle').textContent = BOSSES[S.boss].name;
    setHp(ctx, max);
    setTeam(ctx, 100);
    renderPlayers(ctx);
  },

  async start(ctx) {
    const { S, esc, sfx, later, $ } = ctx;
    sfx('warning');
    later(() => sfx('roar'), 850);
    $('#boss').classList.add('roar');
    await ctx.intro(`<span style="color:var(--bad)">!! WARNING !!</span><br>${esc(BOSSES[S.boss].name)}<br><span style="font-size:.5em" class="muted">has appeared!</span>`, 2800);
    $('#boss').classList.remove('roar');
  },

  renderPlayers,
  addPlayer(ctx) { renderPlayers(ctx); },

  onQuestion(ctx) { ctx.heroEls.forEach(el => el.classList.remove('done', 'miss')); },
  onAnswer(ctx, p) { ctx.heroEls.get(p.id)?.classList.add('done'); },

  reveal(ctx, q, results) {
    const { G, S, fmt, esc, heroEls } = ctx, R = G.extra;
    const res = {}, hits = [];
    let total = 0, nCorrect = 0;
    for (const r of results) {
      const { p, a } = r;
      let dmg = 0;
      if (r.correct) {
        dmg = 100 + Math.round(100 * (1 - r.frac));
        const streakCrit = p.streak >= 3; // 3+ right in a row = double damage
        if (streakCrit) dmg *= 2;
        p.score += dmg; nCorrect++; total += dmg;
        hits.push({ id: p.id, dmg, crit: streakCrit, streak: p.streak, el: a.el });
      }
      heroEls.get(p.id)?.classList.remove('done');
      if (!r.correct) heroEls.get(p.id)?.classList.add('miss');
      if (!p.bot && a) res[p.id] = [a.c, dmg, r.correct ? (p.streak >= 3 ? `🔥 STREAK CRIT! ${p.streak} in a row: ${fmt(dmg)} damage!` : `You dealt ${fmt(dmg)} damage!${p.streak === 2 ? ' One more right for a STREAK CRIT!' : ''}`) : ''];
    }
    hits.sort((a, b) => a.el - b.el);
    R.bossHp = Math.max(0, R.bossHp - total);
    // The boss strikes back (if it's still standing): damage grows with the share of misses.
    const missFrac = results.length ? (results.length - nCorrect) / results.length : 0;
    const attacks = S.bossAttacks !== false && R.bossHp > 0;
    const teamDmg = attacks ? Math.round(missFrac * level(S).atk) : 0;
    if (attacks) R.team = Math.max(0, R.team - teamDmg);
    for (const r of results) {
      if (r.correct || r.p.bot || !teamDmg) continue;
      res[r.p.id] = [r.a ? r.a.c : -1, 0, `The boss hit your team for ${teamDmg}! Team HP: ${R.team}`];
    }
    const fastest = hits[0] ? G.players.get(hits[0].id) : null;
    ctx.setRoundMsg(`<span class="good">${nCorrect} / ${results.length} hit!</span>` + (fastest ? ` <span class="muted">· Fastest: ${esc(fastest.name)}</span>` : ''));

    const dur = animateAttacks(ctx, hits);
    let extra = 0;
    if (attacks) extra = bossAttack(ctx, teamDmg, results, dur);
    ctx.later(() => {
      setHp(ctx, R.bossHp);
      if (R.bossHp <= 0) {
        ctx.$('#boss').classList.add('dead');
        const br = ctx.$('#boss').getBoundingClientRect();
        const colors = ['#ffd166', '#ff6b81', '#7bdff2', '#b2f7ef', '#fff'];
        for (let k = 0; k < 5; k++) ctx.later(() => ctx.sparks(br.left + br.width * Math.random(), br.top + br.height * Math.random(), colors[k], 14, 160), k * 200);
        ctx.sfx('explode');
      }
    }, dur);
    const pct = Math.round((R.bossHp / R.bossMax) * 100);
    const note = R.bossHp <= 0 ? 'The boss is going down!' : R.team <= 0 ? 'The boss defeated your team!' : teamDmg ? `Boss HP ${pct}% · The boss hit the team for ${teamDmg} (Team HP ${R.team})` : `Boss HP: ${pct}%`;
    return { res, note, duration: dur + extra + 200, overDelay: 1900 };
  },

  isOver(ctx) { const R = ctx.G.extra; return R.bossHp <= 0 || R.team <= 0; },

  hud(ctx) {
    const R = ctx.G.extra; if (!R || !R.bossMax) return '';
    return `Boss ${Math.max(0, Math.round((R.bossHp / R.bossMax) * 100))}%` + (ctx.S.bossAttacks !== false ? ` · Team ♥ ${R.team}` : '');
  },

  endInfo(ctx) {
    const { G, S, fmt, players } = ctx, R = G.extra;
    const list = players();
    const total = list.reduce((s, p) => s + p.score, 0);
    const asked = Math.max(1, Math.min(G.qi + 1, G.qs.length));
    const acc = list.length ? Math.round((list.reduce((s, p) => s + p.correct, 0) / (list.length * asked)) * 100) : 0;
    const name = BOSSES[S.boss].name;
    const win = R.bossHp <= 0;
    if (!win && R.team <= 0) return { win: false, title: '💀 Party defeated!', sub: `${name} knocked out your team with ${fmt(R.bossHp)} HP left. ${acc}% correct. Rematch?` };
    return win
      ? { win, title: '🏆 Victory!', sub: `Your class defeated ${name}! ${fmt(total)} total damage · ${acc}% correct` }
      : { win, title: '💨 The boss escaped!', sub: `${name} got away with ${fmt(R.bossHp)} HP left. ${acc}% correct. Rematch?` };
  },
};
