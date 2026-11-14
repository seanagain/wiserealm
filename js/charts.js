// Small, single-series charts for progress pages (pixel style, no libraries).
// One series = one color (gold); gridlines and labels stay quiet; every bar has a hover tip.
import { esc } from './common.js';

// Vertical bars, values 0-100 (e.g. accuracy per game). items: [{ value, label, tip }]
export function barChart(items, { height = 160, title = '' } = {}) {
  if (!items.length) return '<p class="muted">No games yet.</p>';
  const W = Math.max(320, items.length * 34), H = height, padL = 34, padB = 22, padT = 8;
  const plotW = W - padL - 6, plotH = H - padB - padT;
  const bw = Math.min(26, plotW / items.length - 2);
  const y = v => padT + plotH - (Math.max(0, Math.min(100, v)) / 100) * plotH;
  let svg = `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMinYMid meet" role="img" aria-label="${esc(title)}">`;
  for (const g of [0, 50, 100]) {
    svg += `<line x1="${padL}" x2="${W - 4}" y1="${y(g)}" y2="${y(g)}" class="grid"/>` +
      `<text x="${padL - 6}" y="${y(g) + 4}" class="axis" text-anchor="end">${g}%</text>`;
  }
  items.forEach((it, i) => {
    const x = padL + 4 + i * (plotW / items.length);
    const top = y(it.value), h = Math.max(2, padT + plotH - top);
    svg += `<g class="bar-hit" data-tip="${esc(it.tip)}"><rect x="${x - 2}" y="${padT}" width="${bw + 4}" height="${plotH}" fill="transparent"/>` +
      `<rect class="bar" x="${x}" y="${padT + plotH - h}" width="${bw}" height="${h}"/></g>`;
    if (it.label) svg += `<text x="${x + bw / 2}" y="${H - 6}" class="axis" text-anchor="middle">${esc(it.label)}</text>`;
  });
  return svg + '</svg>';
}

// Tiny trend bars for a table cell (last few games, 0-100).
export function sparkline(values, tipPrefix = 'Game') {
  if (!values || !values.length) return '<span class="muted">-</span>';
  const slots = 10, W = slots * 9, H = 24;
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><line x1="0" x2="${W}" y1="${H - 0.5}" y2="${H - 0.5}" class="base"/>` + values.slice(-slots).map((v, i) => {
    const h = Math.max(2, (Math.max(0, Math.min(100, v)) / 100) * (H - 2));
    return `<g class="bar-hit" data-tip="${esc(`${tipPrefix} ${i + 1}: ${v}%`)}"><rect x="${i * 9}" y="0" width="9" height="${H}" fill="transparent"/><rect class="bar" x="${i * 9}" y="${H - h}" width="7" height="${h}"/></g>`;
  }).join('') + '</svg>';
}

// Inline horizontal bar showing a percentage, with the number in normal text.
export function pctBar(pct) {
  if (pct === null || pct === undefined) return '<span class="muted">-</span>';
  const v = Math.max(0, Math.min(100, Number(pct)));
  return `<span class="pctbar" data-tip="${v}% correct"><span style="width:${v}%"></span></span> <b>${Math.round(v)}%</b>`;
}

// One shared tooltip for everything with data-tip (mouse and touch).
let tipEl = null;
export function enableTips(root = document) {
  if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'tip'; tipEl.hidden = true; document.body.append(tipEl); }
  const showTip = (e) => {
    const t = e.target.closest && e.target.closest('[data-tip]');
    if (!t || !t.dataset.tip) { tipEl.hidden = true; return; }
    tipEl.textContent = t.dataset.tip; tipEl.hidden = false;
    const r = t.getBoundingClientRect();
    tipEl.style.left = Math.min(window.innerWidth - tipEl.offsetWidth - 8, Math.max(8, r.left + r.width / 2 - tipEl.offsetWidth / 2)) + 'px';
    tipEl.style.top = Math.max(8, r.top - tipEl.offsetHeight - 8) + window.scrollY + 'px';
    document.querySelectorAll('.bar-hit.on').forEach(x => x.classList.remove('on'));
    if (t.classList.contains('bar-hit')) t.classList.add('on');
  };
  root.addEventListener('mouseover', showTip);
  root.addEventListener('touchstart', showTip, { passive: true });
  root.addEventListener('mouseout', e => { if (!e.relatedTarget || !e.relatedTarget.closest || !e.relatedTarget.closest('[data-tip]')) { tipEl.hidden = true; document.querySelectorAll('.bar-hit.on').forEach(x => x.classList.remove('on')); } });
}
