// My House: decorate your room with furniture you bought or unlocked with learning milestones.
// The database checks everything again when saving (save_house in supabase/schema.sql).
import { $, $$, esc, fmt } from './common.js';
import { accounts } from './supa.js';
import {
  FURNITURE, WALLS, FLOORS, MILESTONES, EXTERIORS, HOUSE_BY_ID, DEFAULT_HOUSE, ROOM_W, ROOM_H, TILE, MAX_ITEMS, MAX_COPIES,
  canUse, clampPos, normalizeHouse, roomSVG, itemSVG, houseSVG, itemRect, drawOrder,
} from './furniture.js';

let prof = null, info = null;  // profile (coins, owned) and my_house() result (progress, unlocked, teacher)
let draft = null, saved = null; // the house being edited, and the last saved version
let sel = -1, tab = 'mine';

const usable = it => canUse(it, prof.owned || [], info.unlocked || [], info.teacher);
const clone = h => JSON.parse(JSON.stringify(h));
const dirty = () => JSON.stringify(draft) !== JSON.stringify(saved);
const copies = id => draft.items.filter(e => e[0] === id).length;
function note(msg, good = true) { $('#saveNote').textContent = msg; $('#saveNote').style.color = good ? 'var(--good)' : 'var(--bad)'; }

// ---------- The room ----------
function renderRoom() {
  $('#room').innerHTML = roomSVG(draft);
  const e = draft.items[sel];
  const it = e && HOUSE_BY_ID[e[0]];
  $('#sel').hidden = !it;
  $('#selTools').hidden = !it; $('#toolHint').hidden = !!it;
  if (it) {
    const r = itemRect(it, e[1], e[2]);
    Object.assign($('#sel').style, { left: (100 * r.px) / (ROOM_W * TILE) + '%', top: (100 * r.py) / (ROOM_H * TILE) + '%', width: (100 * r.w) / (ROOM_W * TILE) + '%', height: (100 * r.h) / (ROOM_H * TILE) + '%' });
    $('#selName').textContent = it.name;
  }
  $('#coins').textContent = `🪙 ${fmt(prof.coins)}`; $('#coins').hidden = false;
  if (dirty()) note('Unsaved changes'); else if (/Unsaved/.test($('#saveNote').textContent)) note('');
}

$('#roomWrap').addEventListener('click', e => {
  const box = $('#room svg').getBoundingClientRect();
  const px = ((e.clientX - box.left) / box.width) * ROOM_W * TILE, py = ((e.clientY - box.top) / box.height) * ROOM_H * TILE;
  // Tapped on a piece of furniture? (the one drawn on top wins)
  const hit = drawOrder(draft.items).reverse().find(o => { const r = itemRect(o.it, o.x, o.y); return px >= r.px && px < r.px + r.w && py >= r.py && py < r.py + r.h; });
  if (hit && hit.i !== sel) { sel = hit.i; return renderRoom(); }
  if (sel >= 0 && !hit) { // move the selected thing here
    const it = HOUSE_BY_ID[draft.items[sel][0]];
    const [x, y] = clampPos(it, Math.floor(px / TILE) - Math.floor((it.w - 1) / 2), it.kind === 'wall' ? Math.floor(py / TILE) : Math.floor(py / TILE));
    draft.items[sel][1] = x; draft.items[sel][2] = y;
  } else if (!hit) sel = -1;
  renderRoom();
});
$('#selTools').addEventListener('click', e => {
  const b = e.target.closest('[data-mv]'); if (!b || sel < 0) return;
  const d = { l: [-1, 0], r: [1, 0], u: [0, -1], d: [0, 1] }[b.dataset.mv], it = HOUSE_BY_ID[draft.items[sel][0]];
  const [x, y] = clampPos(it, draft.items[sel][1] + d[0], draft.items[sel][2] + d[1]);
  draft.items[sel][1] = x; draft.items[sel][2] = y;
  renderRoom();
});
$('#flip').onclick = () => { if (sel >= 0) { draft.items[sel][3] = draft.items[sel][3] ? 0 : 1; renderRoom(); } };
$('#remove').onclick = () => { if (sel >= 0) { draft.items.splice(sel, 1); sel = -1; renderRoom(); renderPanel(); } };
$('#done').onclick = () => { sel = -1; renderRoom(); };
document.addEventListener('keydown', e => {
  if (sel < 0 || e.target.matches('input, select, textarea')) return;
  const k = { ArrowLeft: 'l', ArrowRight: 'r', ArrowUp: 'u', ArrowDown: 'd' }[e.key];
  if (k) { e.preventDefault(); $(`#selTools [data-mv="${k}"]`).click(); }
  else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); $('#remove').click(); }
  else if (e.key === 'Escape') $('#done').click();
});

function addItem(it) {
  if (draft.items.length >= MAX_ITEMS) return note(`Your house is full (${MAX_ITEMS} things at most).`, false);
  if (copies(it.id) >= MAX_COPIES) return note(`You can place up to ${MAX_COPIES} of each thing.`, false);
  const [x, y] = clampPos(it, Math.floor((ROOM_W - it.w) / 2), it.kind === 'wall' ? 0 : 6);
  draft.items.push([it.id, x, y, 0]);
  sel = draft.items.length - 1;
  renderRoom(); renderPanel();
  note('Tap the room to move it, or use the arrows.', true);
}

// ---------- The side panel ----------
const card = (it, body) => `<div class="hitem" data-id="${esc(it.id)}"><div class="pic">${itemSVG(it)}</div><div class="nm">${esc(it.name)}</div>${body}</div>`;
const buyBtn = it => `<div class="price">🪙 ${fmt(it.price)}</div><button class="btn small primary" data-buy="${esc(it.id)}" ${prof.coins < it.price ? 'disabled' : ''}>Buy · ${fmt(it.price)}</button>`;

function renderPanel() {
  $$('#tabs .btn').forEach(b => b.classList.toggle('sel', b.dataset.tab === tab));
  const p = $('#panel');
  if (tab === 'mine') {
    const mine = FURNITURE.filter(usable);
    p.innerHTML = `<p class="muted" style="margin-top:0">Tap <b>+ Add</b> to put it in your room. (${draft.items.length}/${MAX_ITEMS} things placed)</p>
      <div class="hitems">${mine.map(it => card(it, `${it.milestone ? '<div class="owned">🏆 EARNED</div>' : it.price === 0 ? '<div class="owned">FREE</div>' : '<div class="owned">OWNED</div>'}
        <button class="btn small" data-add="${esc(it.id)}">+ Add <span class="muted">(${copies(it.id)}/${MAX_COPIES})</span></button>`)).join('')}</div>
      <p class="muted">Want more? Buy furniture in the <b>Store</b>, or earn special pieces with <b>🏆 Milestones</b>.</p>`;
  } else if (tab === 'store') {
    const forSale = [...FURNITURE, ...WALLS, ...FLOORS].filter(it => !it.milestone && it.price > 0);
    p.innerHTML = `<div class="hitems">${forSale.map(it => card(it, usable(it) ? '<div class="owned">OWNED</div>' : buyBtn(it))).join('')}</div>`;
  } else if (tab === 'room') {
    const pats = (list, key) => `<div class="hitems">${list.map(it => card(it, usable(it)
      ? `<button class="btn small ${draft[key] === it.id ? 'primary' : ''}" data-pat="${key}:${esc(it.id)}">${draft[key] === it.id ? '✓ Using' : 'Use'}</button>`
      : buyBtn(it))).join('')}</div>`;
    p.innerHTML = `<h3 style="margin-top:0">Wallpaper</h3>${pats(WALLS, 'wall')}<h3>Floor</h3>${pats(FLOORS, 'floor')}`;
  } else if (tab === 'outside') {
    p.innerHTML = `<p class="muted" style="margin-top:0">How your house looks in the class village. All colors are free!</p>
      <div class="hitems">${EXTERIORS.map((_, i) => `<button class="hitem ext ${draft.ext === i ? 'sel' : ''}" data-ext="${i}"><div class="pic">${houseSVG(i)}</div></button>`).join('')}</div>`;
  } else {
    p.innerHTML = `<p class="muted" style="margin-top:0">Special furniture you can’t buy: earn it by learning!</p>
      <div class="goals">${MILESTONES.map(m => {
        const it = FURNITURE.find(f => f.milestone === m.id), have = (info.unlocked || []).includes(m.id);
        const val = Math.min(m.need, +(info.progress || {})[m.stat] || 0);
        return `<div class="goal ${have ? 'done' : ''}"><div class="pic">${it ? itemSVG(it) : ''}</div>
          <div class="grow"><b>${m.ic} ${esc(m.name)}</b><br><span class="muted">Reward: ${esc(it ? it.name : '')}</span>
          <div class="meter-bar"><span style="width:${(100 * (have ? m.need : val)) / m.need}%;background:${have ? 'var(--good)' : 'var(--gold)'}"></span></div>
          <span class="muted">${have ? '✓ Unlocked! Find it in My things.' : `${fmt(val)} / ${fmt(m.need)}`}</span></div></div>`;
      }).join('')}</div>`;
  }
}

$('#tabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) { tab = b.dataset.tab; renderPanel(); } });
$('#panel').addEventListener('click', async e => {
  const add = e.target.closest('[data-add]');
  if (add) return addItem(HOUSE_BY_ID[add.dataset.add]);
  const pat = e.target.closest('[data-pat]');
  if (pat) { const [key, id] = pat.dataset.pat.split(':'); draft[key] = id; renderRoom(); return renderPanel(); }
  const ext = e.target.closest('[data-ext]');
  if (ext) { draft.ext = +ext.dataset.ext; renderRoom(); return renderPanel(); }
  const buy = e.target.closest('[data-buy]');
  if (buy) {
    const it = HOUSE_BY_ID[buy.dataset.buy];
    if (!confirm(`Buy ${it.name} for ${it.price} coins?`)) return;
    buy.disabled = true;
    try {
      prof = await accounts.buy(it.id);
      if (it.slot === 'wall' || it.slot === 'floor') { draft[it.slot] = it.id; renderPanel(); }
      else { tab = 'mine'; renderPanel(); addItem(it); }
      renderRoom();
      note(`You bought ${it.name}! 🎉 Remember to save your house.`);
    } catch (err) { note(err.message, false); buy.disabled = false; }
  }
});

$('#save').onclick = async () => {
  $('#save').disabled = true;
  try {
    await accounts.saveHouse(draft);
    saved = clone(draft);
    note('Saved! Your classmates will see it in the village. 🏠');
    renderRoom();
  } catch (err) { note(err.message, false); }
  $('#save').disabled = false;
};
$('#undo').onclick = () => { draft = clone(saved || normalizeHouse(DEFAULT_HOUSE, usable)); sel = -1; renderRoom(); renderPanel(); note(''); };
$('#signIn').onclick = () => accounts.signIn().catch(err => ($('#gateErr').textContent = err.message));
window.addEventListener('beforeunload', e => { if (draft && dirty()) { e.preventDefault(); e.returnValue = ''; } });

(async function init() {
  $('#previewBanner').hidden = accounts.mode !== 'demo';
  try {
    const user = await accounts.user();
    if (!user) { $('#gate').hidden = false; return; }
    [prof, info] = await Promise.all([accounts.profile(), accounts.myHouse()]);
    prof.owned = prof.owned || [];
    draft = normalizeHouse(info.house || DEFAULT_HOUSE, usable);
    saved = clone(draft);
    if (!info.house) saved = null; // a brand new house: let them save the starter room
    $('#main').hidden = false;
    renderRoom(); renderPanel();
    if (!info.house) note('Welcome to your new house! Decorate it, then tap Save.');
  } catch (err) {
    $('#gate').hidden = false;
    $('#gateErr').textContent = err.message;
  }
})();
