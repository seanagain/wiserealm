// Dungeon Crawl: explore three floors. Monsters are questions (right answer = defeat it,
// wrong = lose a heart). Chests hold gold. The final boss on floor 3 needs three right answers.
import { CHOICE_STYLE } from '../common.js';
import { bossSVG, BOSSES } from '../boss.js';

const FLOORS = 3, HEARTS = 5;
const DIRS = { u: [0, -1], d: [0, 1], l: [-1, 0], r: [1, 0] };
const KEYS = { ArrowUp: 'u', ArrowDown: 'd', ArrowLeft: 'l', ArrowRight: 'r', w: 'u', s: 'd', a: 'l', d: 'r' };
const MRC = Math.max(0, BOSSES.findIndex(b => b.custom === 'mrc'));

function genFloor(cw, ch) {
  const W = cw * 2 + 1, H = ch * 2 + 1;
  const g = Array.from({ length: H }, () => Array(W).fill(1));
  const seen = new Set(['0,0']), stack = [[0, 0]];
  g[1][1] = 0;
  while (stack.length) {
    const [cx, cy] = stack[stack.length - 1];
    const nb = Object.values(DIRS).map(([dx, dy]) => [cx + dx, cy + dy]).filter(([x, y]) => x >= 0 && y >= 0 && x < cw && y < ch && !seen.has(x + ',' + y));
    if (!nb.length) { stack.pop(); continue; }
    const [nx, ny] = nb[Math.floor(Math.random() * nb.length)];
    g[cy * 2 + 1 + (ny - cy)][cx * 2 + 1 + (nx - cx)] = 0; g[ny * 2 + 1][nx * 2 + 1] = 0;
    seen.add(nx + ',' + ny); stack.push([nx, ny]);
  }
  // a few extra openings so it feels like rooms, not a pure maze
  for (let k = 0; k < cw; k++) {
    const x = 1 + Math.floor(Math.random() * (W - 2)), y = 1 + Math.floor(Math.random() * (H - 2));
    if (g[y][x] === 1 && ((g[y][x - 1] === 0 && g[y][x + 1] === 0) || (g[y - 1] && g[y - 1][x] === 0 && g[y + 1] && g[y + 1][x] === 0))) g[y][x] = 0;
  }
  // distances from start
  const dist = Array.from({ length: H }, () => Array(W).fill(Infinity)); dist[1][1] = 0;
  const q = [[1, 1]];
  for (let i = 0; i < q.length; i++) { const [x, y] = q[i]; for (const [dx, dy] of Object.values(DIRS)) { const nx = x + dx, ny = y + dy; if (g[ny] && g[ny][nx] === 0 && dist[ny][nx] === Infinity) { dist[ny][nx] = dist[y][x] + 1; q.push([nx, ny]); } } }
  const floor = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (g[y][x] === 0 && !(x === 1 && y === 1)) floor.push({ x, y, d: dist[y][x] });
  floor.sort((a, b) => b.d - a.d);
  return { W, H, g, floor };
}

export default {
  id: 'dungeon',
  name: 'Dungeon Crawl',
  icon: '🗝️',
  blurb: 'Explore 3 dungeon floors. Monsters are questions, chests hold gold, and a boss waits at the bottom!',

  run(ctx) {
    const { root, esc } = ctx;
    let level = 0, hp = HEARTS, score = 0, F = null, hero = { x: 1, y: 1 }, battle = null, over = false;
    const seen = new Set();

    root.innerHTML = `<div class="sg-top"><span id="dgHp" class="dg-hp"></span><span id="dgFloor"></span><span id="dgScore"></span><button class="btn small" id="dgQuit">Finish</button></div>
      <div class="dg-msg card" id="dgMsg"></div>
      <div class="dg-wrap"><div class="dg-map" id="dgMap"></div></div>
      <div class="dg-pad" id="dgPad"><button data-d="u">▲</button><button data-d="l">◀</button><button data-d="d">▼</button><button data-d="r">▶</button></div>
      <div class="dg-battle" id="dgBattle" hidden><div class="card dg-bcard">
        <div class="dg-foe" id="dgFoe"></div><div class="dg-foe-name" id="dgFoeName"></div>
        <div class="sg-prompt" id="dgPrompt"></div><div class="p-choices sg-choices" id="dgChoices"></div><div id="dgFb" class="sg-feedback"></div></div></div>`;
    const $ = s => root.querySelector(s);

    const say = html => ($('#dgMsg').innerHTML = html);
    const hud = () => {
      $('#dgHp').textContent = '♥'.repeat(Math.max(0, hp)) + '♡'.repeat(Math.max(0, HEARTS - hp));
      $('#dgFloor').textContent = `Floor ${level} / ${FLOORS}`;
      $('#dgScore').textContent = `${ctx.fmt(score)} pts`;
    };

    const buildLevel = () => {
      level++;
      F = genFloor(level === FLOORS ? 7 : 6, 4);
      hero = { x: 1, y: 1 }; seen.clear();
      const spots = F.floor.slice(), take = () => spots.splice(Math.floor(Math.random() * Math.max(1, spots.length - 3)) + 1, 1)[0];
      const exit = spots.shift();
      F.things = new Map();
      if (level < FLOORS) F.things.set(exit.x + ',' + exit.y, { type: 'stairs' });
      else F.things.set(exit.x + ',' + exit.y, { type: 'boss', hp: 3, sprite: bossSVG(MRC), name: 'MR. C, DUNGEON LORD' });
      for (let k = 0; k < 2 + level; k++) { const s = take(); if (s && s.d > 2) F.things.set(s.x + ',' + s.y, { type: 'monster', hp: 1, sprite: bossSVG(k % 4), name: BOSSES[k % 4].name }); }
      for (let k = 0; k < 2; k++) { const s = take(); if (s) F.things.set(s.x + ',' + s.y, { type: 'chest' }); }
      reveal(); draw(); hud();
      say(level === 1 ? 'Find the stairs ⬇. Bump into a monster to battle it. Use the arrows (or keyboard).'
        : level === FLOORS ? '<b style="color:var(--bad)">Final floor!</b> The Dungeon Lord is waiting…' : `Floor ${level}. The monsters are getting tougher!`);
    };

    const reveal = () => { for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) seen.add((hero.x + dx) + ',' + (hero.y + dy)); };

    const draw = () => {
      const map = $('#dgMap');
      map.style.setProperty('--w', F.W); map.style.setProperty('--h', F.H); map.style.aspectRatio = `${F.W} / ${F.H}`;
      let html = '';
      for (let y = 0; y < F.H; y++) for (let x = 0; x < F.W; x++) {
        const k = x + ',' + y, vis = seen.has(k), wall = F.g[y][x] === 1, t = F.things.get(k);
        let inner = '';
        if (vis && x === hero.x && y === hero.y) inner = `<div class="dg-hero">${ctx.hero}</div>`;
        else if (vis && t) inner = t.type === 'stairs' ? '<span class="dg-ico">⬇</span>' : t.type === 'chest' ? '<span class="dg-ico">🧰</span>' : `<div class="dg-mon ${t.type}">${t.sprite}</div>`;
        html += `<div class="dg-t ${wall ? 'w' : 'f'} ${vis ? '' : 'fog'}">${inner}</div>`;
      }
      map.innerHTML = html;
    };

    const move = d => {
      if (over || battle) return;
      const [dx, dy] = DIRS[d], nx = hero.x + dx, ny = hero.y + dy;
      if (!F.g[ny] || F.g[ny][nx] !== 0) return;
      const k = nx + ',' + ny, t = F.things.get(k);
      if (t && (t.type === 'monster' || t.type === 'boss')) return startBattle(k, t);
      hero = { x: nx, y: ny };
      if (t && t.type === 'chest') { const gold = 20 + Math.floor(Math.random() * 4) * 10; score += gold; F.things.delete(k); say(`You opened a chest: <b style="color:var(--gold)">+${gold} gold</b>!`); }
      if (t && t.type === 'stairs') { score += 100; reveal(); draw(); hud(); say('Down the stairs you go… +100'); setTimeout(buildLevel, 600); return; }
      reveal(); draw(); hud();
    };

    const startBattle = (k, t) => {
      battle = { k, t, q: ctx.question(ctx.next()), locked: false };
      $('#dgFoe').innerHTML = t.sprite;
      $('#dgFoeName').textContent = t.type === 'boss' ? `${t.name} · ${'♥'.repeat(t.hp)}` : 'A wild monster appears!';
      showQ();
      $('#dgBattle').hidden = false;
    };
    const showQ = () => {
      const q = battle.q;
      $('#dgPrompt').textContent = q.prompt;
      $('#dgChoices').innerHTML = q.choices.map((c, n) => `<button class="choice ${CHOICE_STYLE[n].cls}" data-c="${n}"><span class="ico">${CHOICE_STYLE[n].icon}</span><span>${esc(c)}</span></button>`).join('');
      $('#dgFb').innerHTML = '';
      battle.locked = false;
    };

    $('#dgChoices').addEventListener('click', e => {
      const b = e.target.closest('.choice'); if (!b || !battle || battle.locked) return;
      battle.locked = true;
      const { q, t, k } = battle, n = +b.dataset.c, ok = ctx.record(q.i, q.choices[n]);
      root.querySelectorAll('#dgChoices .choice').forEach((el, m) => { el.classList.toggle('right', m === q.correct); el.classList.toggle('dim', m !== q.correct && m !== n); });
      if (ok) {
        t.hp--;
        $('#dgFoe').classList.remove('hit'); void $('#dgFoe').offsetWidth; $('#dgFoe').classList.add('hit');
        if (t.hp <= 0) {
          const pts = t.type === 'boss' ? 500 : 50 + level * 25;
          score += pts; F.things.delete(k);
          $('#dgFb').innerHTML = `<b style="color:var(--good)">Defeated! +${pts}</b>`;
          setTimeout(() => {
            $('#dgBattle').hidden = true; battle = null; draw(); hud();
            if (t.type === 'boss') { over = true; ctx.finish(score + hp * 50, 'You conquered the dungeon! 👑'); }
            else say('Monster defeated! Keep exploring.');
          }, 900);
        } else {
          $('#dgFoeName').textContent = `${t.name} · ${'♥'.repeat(t.hp)}`;
          $('#dgFb').innerHTML = `<b style="color:var(--good)">Hit!</b> ${t.hp} more to go…`;
          setTimeout(() => { battle.q = ctx.question(ctx.next()); showQ(); }, 900);
        }
      } else {
        hp--; hud();
        $('#dgFb').innerHTML = `<b style="color:var(--bad)">Ouch!</b> The answer was <b>${esc(q.choices[q.correct])}</b>.`;
        if (hp <= 0) { over = true; setTimeout(() => ctx.finish(score, 'You were defeated… try again!'), 1200); return; }
        setTimeout(() => { $('#dgBattle').hidden = true; battle = null; say(`You retreat with ${hp} heart${hp === 1 ? '' : 's'} left. Try again when you’re ready!`); }, 1600);
      }
    });

    $('#dgPad').addEventListener('pointerdown', e => { const b = e.target.closest('[data-d]'); if (b) { e.preventDefault(); move(b.dataset.d); } });
    const onKey = e => { if (!root.isConnected || root.hidden) return document.removeEventListener('keydown', onKey); if (KEYS[e.key]) { e.preventDefault(); move(KEYS[e.key]); } };
    document.addEventListener('keydown', onKey);
    $('#dgQuit').onclick = () => { over = true; document.removeEventListener('keydown', onKey); ctx.answered() ? ctx.finish(score, 'Adventure saved!') : ctx.quit(); };
    buildLevel();
  },
};
