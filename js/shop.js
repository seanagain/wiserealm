// The shop: students design their hero, try on items, buy with coins, and save.
// The database checks every purchase and only lets a hero wear items it owns.
import { $, $$, esc, fmt } from './common.js';
import { accounts } from './supa.js';
import { ITEMS, ITEM_BY_ID, SLOTS } from './items.js';
import { avatarSVG, normalizeAvatar, restrictAvatar, SKINS, COLORS, HATS, FACES, CLASSES, STYLES } from './avatar.js';

let prof = null;      // saved profile from the server
let draft = null;     // the hero being edited (may include items being tried on)
let tab = 'look';

const FREE = [
  { key: 'cls', title: 'Hero class', items: CLASSES.map(c => c.label) },
  { key: 'style', title: 'Outfit', items: STYLES.map(st => st.label) },
  { key: 'color', title: 'Adventurer outfit color', swatch: COLORS },
  { key: 'skin', title: 'Skin tone', swatch: SKINS },
  { key: 'hat', title: 'Hair / hat (free)', items: HATS.map(h => h.label) },
  { key: 'hc', title: 'Hair / hat color', swatch: COLORS },
  { key: 'face', title: 'Face', items: FACES.map(f => f.label) },
];

const owned = id => prof.owned.includes(id);
const savedHero = () => restrictAvatar(prof.avatar, prof.owned);
const dirty = () => JSON.stringify(restrictAvatar(draft, prof.owned)) !== JSON.stringify(savedHero()) || tryingUnowned();
const tryingUnowned = () => ITEMS.some(it => draft[it.slot] === it.id && !owned(it.id));

function note(msg, good = true) { $('#saveNote').textContent = msg; $('#saveNote').style.color = good ? 'var(--good)' : 'var(--bad)'; }

function renderMirror() {
  $('#mirror').innerHTML = avatarSVG(draft);
  $('#coins').textContent = `🪙 ${fmt(prof.coins)}`;
  $('#coins').hidden = false;
  $('#who').textContent = prof.display_name;
  if (tryingUnowned()) note('Trying on! Buy items to keep them.', true);
  else if (dirty()) note('Unsaved changes', true);
  else note('');
}

function renderLook() {
  $('#panel').innerHTML = FREE.map(g => `
    <div class="opt-group"><h4>${g.title}</h4><div class="opts">
      ${(g.swatch || g.items).map((v, i) => g.swatch
        ? `<button class="opt swatch ${draft[g.key] === i ? 'sel' : ''}" data-k="${g.key}" data-v="${i}" style="background:${v}" aria-label="${g.title} ${i + 1}"></button>`
        : `<button class="opt ${draft[g.key] === i && !(g.key === 'hat' && draft.phat) ? 'sel' : ''}" data-k="${g.key}" data-v="${i}">${esc(v)}</button>`).join('')}
    </div></div>`).join('') + '<p class="muted">Want more? Visit the <b>Shop</b> tab for hats, outfits, capes, face items and pets.</p>';
}

function itemCard(it) {
  const preview = avatarSVG(Object.assign({}, draft, { [it.slot]: it.id }));
  const wearing = draft[it.slot] === it.id;
  let action;
  if (owned(it.id)) action = wearing ? `<button class="btn small" data-unequip="${it.slot}">Take off</button>` : `<button class="btn small" data-equip="${it.id}">Wear</button>`;
  else action = `<button class="btn small primary" data-buy="${it.id}" ${prof.coins < it.price ? 'disabled' : ''}>Buy · ${fmt(it.price)}</button>`;
  return `<div class="item ${wearing ? 'trying' : ''}" data-try="${it.id}">
    <div class="pic">${preview}</div><div class="nm">${esc(it.name)}</div>
    ${owned(it.id) ? '<div class="owned">OWNED</div>' : `<div class="price">🪙 ${fmt(it.price)}</div>`}
    ${action}</div>`;
}

function renderShop(onlyOwned) {
  const html = SLOTS.map(s => {
    const list = ITEMS.filter(it => it.slot === s.id && (!onlyOwned || owned(it.id)));
    if (!list.length) return '';
    return `<h3 class="slot-title">${s.label}</h3><div class="items">${list.map(itemCard).join('')}</div>`;
  }).join('');
  $('#panel').innerHTML = html || '<p>You don’t own any items yet. Earn coins by playing games, then visit the <b>Shop</b> tab!</p>';
}

function render() {
  renderMirror();
  $$('#tabs .btn').forEach(b => b.classList.toggle('sel', b.dataset.tab === tab));
  if (tab === 'look') renderLook(); else renderShop(tab === 'mine');
}

$('#tabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) { tab = b.dataset.tab; render(); } });

$('#panel').addEventListener('click', async e => {
  const opt = e.target.closest('.opt');
  if (opt) {
    draft[opt.dataset.k] = +opt.dataset.v;
    if (opt.dataset.k === 'hat') draft.phat = null; // picking a free hat takes off a shop hat
    return render();
  }
  const buy = e.target.closest('[data-buy]');
  if (buy) {
    const it = ITEM_BY_ID[buy.dataset.buy];
    if (!confirm(`Buy ${it.name} for ${it.price} coins?`)) return;
    buy.disabled = true;
    try {
      prof = await accounts.buy(it.id);
      draft[it.slot] = it.id;
      await saveHero(`You bought ${it.name}! 🎉`);
    } catch (err) { note(err.message, false); buy.disabled = false; }
    return;
  }
  const eq = e.target.closest('[data-equip]');
  if (eq) { const it = ITEM_BY_ID[eq.dataset.equip]; draft[it.slot] = it.id; return render(); }
  const un = e.target.closest('[data-unequip]');
  if (un) { draft[un.dataset.unequip] = null; return render(); }
  const card = e.target.closest('[data-try]');
  if (card) { // try it on (tap again to take it off)
    const it = ITEM_BY_ID[card.dataset.try];
    draft[it.slot] = draft[it.slot] === it.id ? null : it.id;
    render();
  }
});

async function saveHero(msg = 'Saved! Your hero will look like this in games.') {
  const toSave = restrictAvatar(draft, prof.owned);
  try {
    prof = await accounts.setAvatar(toSave);
    draft = normalizeAvatar(Object.assign({}, toSave));
    render();
    note(msg);
  } catch (err) { render(); note(err.message, false); }
}

$('#save').onclick = () => {
  if (tryingUnowned() && !confirm('Some items you’re trying on aren’t yours yet, so they won’t be saved. Save the rest?')) return;
  saveHero();
};
$('#undo').onclick = () => { draft = savedHero(); render(); };
$('#signIn').onclick = () => accounts.signIn().catch(err => ($('#gateErr').textContent = err.message));
$('#signOut').onclick = async () => { await accounts.signOut(); location.href = 'index.html'; };
window.addEventListener('beforeunload', e => { if (prof && draft && dirty() && !tryingUnowned()) { e.preventDefault(); e.returnValue = ''; } });

(async function init() {
  $('#previewBanner').hidden = accounts.mode !== 'demo';
  try {
    const user = await accounts.user();
    if (!user) { $('#gate').hidden = false; return; }
    prof = await accounts.profile();
    prof.owned = prof.owned || [];
    draft = savedHero();
    $('#main').hidden = false;
    $('#signOut').hidden = false;
    render();
  } catch (err) {
    $('#gate').hidden = false;
    $('#gateErr').textContent = err.message;
  }
})();
