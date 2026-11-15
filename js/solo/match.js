// Memory Match: flip cards to pair each question/word with its answer. Fewer misses and a
// faster time mean a higher score.
import { shuffle } from '../common.js';

export default {
  id: 'match',
  name: 'Memory Match',
  icon: '🃏',
  blurb: 'Flip cards to match each word or question with its answer. Fast and few misses = big score!',

  run(ctx) {
    const { root, esc } = ctx;
    // Up to 6 pairs, weakest cards first, with no repeated answers (so every match is clear).
    const seenA = new Set(), seenP = new Set(), pick = [];
    for (const i of ctx.order()) {
      const a = ctx.items[i].answer.trim().toLowerCase(), p = ctx.items[i].prompt.trim().toLowerCase();
      if (seenA.has(a) || seenP.has(p)) continue;
      seenA.add(a); seenP.add(p); pick.push(i);
      if (pick.length === 6) break;
    }
    const cards = shuffle(pick.flatMap(i => [{ i, side: 'q', text: ctx.items[i].prompt }, { i, side: 'a', text: ctx.items[i].answer }]));
    let first = null, busy = false, matched = 0, misses = 0;
    const t0 = performance.now();

    root.innerHTML = `<div class="sg-top"><span id="mmPairs"></span><span id="mmTime"></span><span id="mmMiss"></span><button class="btn small" id="mmQuit">Finish</button></div>
      <div class="mm-grid" id="mm" style="--cols:${cards.length > 8 ? 4 : 3}">${cards.map((c, n) =>
        `<button class="mm-card ${c.side}" data-n="${n}"><span class="back">?</span><span class="front">${esc(c.text)}</span></button>`).join('')}</div>`;
    const $ = s => root.querySelector(s);
    const hud = () => {
      $('#mmPairs').textContent = `Pairs ${matched} / ${pick.length}`;
      $('#mmMiss').textContent = `Misses ${misses}`;
    };
    const clock = setInterval(() => { $('#mmTime') && ($('#mmTime').textContent = `⏱ ${Math.floor((performance.now() - t0) / 1000)}s`); }, 250);
    hud();

    $('#mm').addEventListener('click', e => {
      const el = e.target.closest('.mm-card'); if (!el || busy || el.classList.contains('up') || el.classList.contains('done')) return;
      el.classList.add('up');
      const c = cards[+el.dataset.n];
      if (!first) { first = { el, c }; return; }
      const a = first; first = null;
      if (a.c.i === c.i && a.c.side !== c.side) {
        a.el.classList.add('done'); el.classList.add('done');
        ctx.record(c.i, ctx.items[c.i].answer);
        matched++; hud();
        if (matched === pick.length) {
          clearInterval(clock);
          const secs = (performance.now() - t0) / 1000;
          setTimeout(() => ctx.finish(Math.max(100, Math.round(1200 - secs * 8 - misses * 25)), misses === 0 ? 'Perfect memory! 🧠' : 'All matched!'), 600);
        }
      } else {
        misses++; busy = true; hud();
        a.el.classList.add('nope'); el.classList.add('nope');
        setTimeout(() => { a.el.classList.remove('up', 'nope'); el.classList.remove('up', 'nope'); busy = false; }, 900);
      }
    });
    $('#mmQuit').onclick = () => { clearInterval(clock); ctx.answered() ? ctx.finish(matched * 100, 'Game saved!') : ctx.quit(); };
  },
};
