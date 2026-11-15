// Emote bubbles: shown above a hero on the projector, and as previews in the shop.
import { esc } from './common.js';
import { ITEM_BY_ID, EMOTES, isFree } from './items.js';

export { EMOTES };

// Which emotes someone can use: free ones plus any they own.
export const usableEmotes = owned => EMOTES.filter(e => isFree(e) || (owned || []).includes(e.id));

export function bubbleHTML(id) {
  const e = ITEM_BY_ID[id];
  if (!e) return '';
  const text = e.fx === 'sixseven'
    ? '<span class="s6">6</span><span class="hands">🤲</span><span class="s7">7</span>'
    : e.fx === 'stretch' ? [...e.text].map((c, i) => `<span style="animation-delay:${i * 0.05}s">${esc(c)}</span>`).join('') : esc(e.text);
  return `<div class="emote-bubble fx-${e.fx}">${text}</div>`;
}

// Pops an emote above `host` (an element with position: relative/absolute).
export function playEmote(host, id, { ms = 2600 } = {}) {
  const e = ITEM_BY_ID[id];
  if (!host || !e) return;
  host.querySelectorAll(':scope > .emote-bubble').forEach(b => b.remove());
  host.insertAdjacentHTML('beforeend', bubbleHTML(id));
  const bubble = host.lastElementChild;
  if (e.fx === 'dance') { host.classList.remove('emote-dance'); void host.offsetWidth; host.classList.add('emote-dance'); }
  if (e.fx === 'hearts' || e.fx === 'confetti') burst(host, e.fx);
  setTimeout(() => { bubble.remove(); host.classList.remove('emote-dance'); }, ms);
}

function burst(host, kind) {
  const r = host.getBoundingClientRect();
  const colors = kind === 'hearts' ? ['#ff5d73', '#ff8fab', '#ffb3c6'] : ['#ffd23f', '#4cc9f0', '#3ddc84', '#ff5d73', '#c77dff'];
  for (let i = 0; i < 12; i++) {
    const p = document.createElement('div');
    p.className = 'emote-particle';
    p.textContent = kind === 'hearts' ? '❤' : '';
    p.style.left = r.left + r.width / 2 + 'px'; p.style.top = r.top + r.height * 0.3 + window.scrollY + 'px';
    p.style.color = colors[i % colors.length];
    if (kind !== 'hearts') p.style.background = colors[i % colors.length];
    document.body.append(p);
    const a = kind === 'hearts' ? -Math.PI / 2 + (Math.random() - 0.5) * 1.2 : Math.random() * Math.PI * 2;
    const d = 40 + Math.random() * 70;
    p.animate([{ transform: 'translate(0,0)', opacity: 1 }, { transform: `translate(${Math.cos(a) * d}px, ${Math.sin(a) * d - 20}px)`, opacity: 0 }],
      { duration: 900 + Math.random() * 600, easing: 'ease-out' }).onfinish = () => p.remove();
  }
}
