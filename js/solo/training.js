// Training Grounds: flashcards with mastery stars. Weakest cards come first; a missed card
// comes back once more at the end of the session.
import { CHOICE_STYLE } from '../common.js';

export default {
  id: 'train',
  name: 'Training Grounds',
  icon: '🎯',
  blurb: 'Flashcards with stars. Cards you miss come back. Can you get them all to ★★★?',

  run(ctx) {
    const { root, esc } = ctx;
    const N = Math.min(10, ctx.items.length);
    const queue = ctx.order(N);
    const retried = new Set();
    let done = 0, right = 0, score = 0, streak = 0, total = queue.length, q = null, locked = false;

    root.innerHTML = `<div class="sg-top"><span id="trProg"></span><span id="trStreak"></span><span id="trScore"></span><button class="btn small" id="trQuit">Finish</button></div>
      <div class="card sg-card"><div class="sg-stars" id="trStars"></div><div class="sg-prompt" id="trPrompt"></div></div>
      <div class="p-choices sg-choices" id="trChoices"></div>
      <div class="sg-feedback" id="trFb"></div>`;
    const $ = s => root.querySelector(s);

    const next = () => {
      if (!queue.length) return ctx.finish(score, right === done ? 'Perfect training! 💯' : 'Training complete!');
      locked = false;
      const i = queue.shift();
      q = ctx.question(i);
      $('#trProg').textContent = `Card ${Math.min(done + 1, total)} / ${total}`;
      $('#trScore').textContent = `${ctx.fmt(score)} pts`;
      $('#trStreak').textContent = streak >= 2 ? `🔥 ${streak}` : '';
      const b = ctx.box(i);
      $('#trStars').textContent = b < 0 ? 'NEW CARD' : ctx.stars(b);
      $('#trPrompt').textContent = q.prompt;
      $('#trChoices').innerHTML = q.choices.map((c, k) =>
        `<button class="choice ${CHOICE_STYLE[k].cls}" data-c="${k}"><span class="ico">${CHOICE_STYLE[k].icon}</span><span>${esc(c)}</span></button>`).join('');
      $('#trFb').innerHTML = '';
    };

    $('#trChoices').addEventListener('click', e => {
      const btn = e.target.closest('.choice'); if (!btn || locked) return;
      locked = true;
      const k = +btn.dataset.c, ok = ctx.record(q.i, q.choices[k]);
      done++;
      root.querySelectorAll('#trChoices .choice').forEach((el, n) => { el.classList.toggle('right', n === q.correct); el.classList.toggle('dim', n !== q.correct && n !== k); });
      if (ok) {
        right++; streak++; score += 100 + Math.min(10, streak) * 10;
        $('#trStars').textContent = ctx.stars(ctx.box(q.i));
        $('#trFb').innerHTML = `<b style="color:var(--good)">Correct!</b> ${ctx.box(q.i) >= 3 ? 'Mastered ★★★' : ''}`;
        setTimeout(next, 900);
      } else {
        streak = 0;
        if (!retried.has(q.i)) { retried.add(q.i); queue.push(q.i); total++; }
        $('#trStars').textContent = ctx.stars(0);
        $('#trFb').innerHTML = `<b style="color:var(--bad)">Not quite.</b> The answer is <b>${esc(q.choices[q.correct])}</b>. It’ll come back later.
          <div style="margin-top:10px"><button class="btn primary" id="trNext">Got it ▶</button></div>`;
        $('#trNext').onclick = next;
      }
    });
    $('#trQuit').onclick = () => (ctx.answered() ? ctx.finish(score, 'Training saved!') : ctx.quit());
    next();
  },
};
