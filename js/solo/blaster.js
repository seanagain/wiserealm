// Asteroid Blaster: the question is at the top, answers fall as asteroids. Tap the right one
// to blast it before it hits your ship. Wrong hits and missed asteroids cost a shield.
export default {
  id: 'blaster',
  name: 'Asteroid Blaster',
  icon: '☄️',
  blurb: 'Answers fall as asteroids. Blast the right one before it reaches your ship! It gets faster…',

  run(ctx) {
    const { root, esc } = ctx;
    const MAX_WAVES = 20;
    let shields = 3, score = 0, wave = 0, rights = 0, q = null, rocks = [], recorded = false, waveStart = 0, dur = 9000, over = false, raf = 0;

    root.innerHTML = `<div class="sg-top"><span id="blShields"></span><span id="blWave"></span><span id="blScore"></span><button class="btn small" id="blQuit">Finish</button></div>
      <div class="card sg-q" id="blQ"></div>
      <div class="blaster" id="bl"><div class="ship" id="ship">${shipSVG()}</div></div>`;
    const $ = s => root.querySelector(s);
    const field = $('#bl');

    const hud = () => {
      $('#blShields').textContent = '🛡'.repeat(shields) + '·'.repeat(3 - shields);
      $('#blWave').textContent = `Wave ${wave} / ${MAX_WAVES}`;
      $('#blScore').textContent = `${ctx.fmt(score)} pts`;
    };

    const end = headline => { if (over) return; over = true; cancelAnimationFrame(raf); setTimeout(() => ctx.finish(score, headline), 700); };

    const nextWave = () => {
      if (over) return;
      rocks.forEach(r => r.el.remove()); rocks = [];
      if (wave >= MAX_WAVES) return end('You cleared the asteroid field! 🚀');
      wave++; recorded = false;
      q = ctx.question(ctx.next());
      $('#blQ').textContent = q.prompt;
      dur = Math.max(4200, 9000 - wave * 260);
      const lanes = q.choices.map((_, k) => k).sort(() => Math.random() - 0.5);
      q.choices.forEach((c, k) => {
        const el = document.createElement('button');
        el.className = 'rock';
        el.innerHTML = `<span>${esc(c)}</span>`;
        el.style.left = (100 / q.choices.length) * (lanes[k] + 0.5) + '%';
        el.style.width = Math.min(30, 92 / q.choices.length) + '%';
        el.dataset.k = k;
        field.append(el);
        rocks.push({ el, k, delay: Math.random() * 600 });
      });
      waveStart = performance.now();
      hud();
    };

    const laser = el => {
      const s = $('#ship').getBoundingClientRect(), r = el.getBoundingClientRect(), f = field.getBoundingClientRect();
      const x1 = s.left + s.width / 2 - f.left, y1 = s.top - f.top, x2 = r.left + r.width / 2 - f.left, y2 = r.top + r.height / 2 - f.top;
      const beam = document.createElement('div');
      beam.className = 'laser';
      beam.style.left = x1 + 'px'; beam.style.top = y1 + 'px';
      beam.style.height = Math.hypot(x2 - x1, y2 - y1) + 'px';
      beam.style.transform = `rotate(${Math.atan2(x2 - x1, -(y2 - y1))}rad)`;
      field.append(beam);
      setTimeout(() => beam.remove(), 180);
    };

    const boom = (el, good) => { el.classList.add(good ? 'boom' : 'bad'); setTimeout(() => el.remove(), 350); };

    field.addEventListener('pointerdown', e => {
      const el = e.target.closest('.rock'); if (!el || over || el.classList.contains('boom')) return;
      e.preventDefault();
      laser(el);
      const k = +el.dataset.k, isRight = k === q.correct;
      if (!recorded) { recorded = true; if (ctx.record(q.i, q.choices[k])) rights++; }
      rocks = rocks.filter(r => r.el !== el);
      if (isRight) {
        const t = Math.min(1, (performance.now() - waveStart) / dur);
        score += 100 + Math.round((1 - t) * 100);
        boom(el, true); hud();
        setTimeout(nextWave, 450);
      } else {
        boom(el, false);
        shields--; hud();
        field.classList.remove('shake'); void field.offsetWidth; field.classList.add('shake');
        if (shields <= 0) end('Your ship ran out of shields!');
      }
    });

    const loop = now => {
      if (over) return;
      const t = (now - waveStart) / dur;
      for (const r of rocks) r.el.style.top = Math.max(-12, ((now - waveStart - r.delay) / dur) * 100 - 12) + '%';
      const right = rocks.find(r => r.k === q.correct);
      if (right && (now - waveStart - right.delay) / dur >= 1.0) {
        if (!recorded) { recorded = true; ctx.record(q.i, ''); }
        shields--; hud();
        boom(right.el, false);
        rocks = rocks.filter(r => r !== right);
        field.classList.remove('shake'); void field.offsetWidth; field.classList.add('shake');
        if (shields <= 0) return end('An asteroid got through!');
        setTimeout(nextWave, 500);
      } else if (t > 1.3) nextWave();
      raf = requestAnimationFrame(loop);
    };

    $('#blQuit').onclick = () => { over = true; cancelAnimationFrame(raf); ctx.answered() ? ctx.finish(score, 'Game saved!') : ctx.quit(); };
    nextWave();
    raf = requestAnimationFrame(loop);
  },
};

function shipSVG() {
  const rows = ['....K....', '...KWK...', '...KBK...', '..KWWWK..', '.KWWBWWK.', 'KWWWWWWWK', 'KRK...KRK', '.O.....O.'];
  const pal = { K: '#1a1226', W: '#e3e8ef', B: '#4cc9f0', R: '#e63946', O: '#ffd23f' };
  let r = '';
  rows.forEach((row, y) => [...row].forEach((c, x) => { if (pal[c]) r += `<rect x="${x}" y="${y}" width="1.04" height="1.04" fill="${pal[c]}"/>`; }));
  return `<svg viewBox="0 0 9 8" shape-rendering="crispEdges">${r}</svg>`;
}
