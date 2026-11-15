// Keeps the teacher's question sets saved to their account, so they follow them to any computer.
// This browser keeps a copy (so games start instantly); changes are uploaded in the background,
// and if the internet drops they wait in a queue and upload next time.
import { load, save } from './common.js';
import { getSets, getSet, onSetsChanged, isSample, replaceAllSets, cleanItems } from './sets.js';
import { accounts } from './supa.js';

const DIRTY = 'cq_sets_dirty';   // { setId: 'save' | 'delete' } waiting to upload
const OWNER = 'cq_sets_owner';   // which account this browser's copy belongs to
let onStatus = () => {};
let timer = null, started = false;

const mark = (id, what) => { const d = load(DIRTY, {}); d[id] = what; save(DIRTY, d); };

export async function startCloudSync(user, statusFn) {
  onStatus = statusFn || onStatus;
  if (started) return;
  started = true;
  // A different teacher used this browser before: don't upload their sets into this account.
  const owner = load(OWNER, null);
  if (owner && owner !== user.id) {
    replaceAllSets(getSets().filter(s => isSample(s.id)));
    save(DIRTY, {});
  } else if (!load('cq_sets_migrated_' + user.id, false)) {
    // First sign-in on this computer: upload the sets that only exist here.
    for (const s of getSets()) if (!isSample(s.id)) mark(s.id, 'save');
  }
  save(OWNER, user.id);
  onSetsChanged(({ id, deleted }) => { if (isSample(id)) return; mark(id, deleted ? 'delete' : 'save'); schedule(); });
  await flush();
  save('cq_sets_migrated_' + user.id, true);
  await pull();
}

function schedule() {
  onStatus('saving');
  clearTimeout(timer);
  timer = setTimeout(flush, 900);
}

export async function flush() {
  const d = load(DIRTY, {});
  const ids = Object.keys(d);
  if (!ids.length) { onStatus('synced'); return true; }
  onStatus('saving');
  let ok = true;
  for (const id of ids) {
    try {
      if (d[id] === 'delete') await accounts.deleteSet(id);
      else { const s = getSet(id); if (s) await accounts.saveSet(id, s.title, cleanItems(s.items)); }
      const now = load(DIRTY, {}); if (now[id] === d[id]) { delete now[id]; save(DIRTY, now); }
    } catch (e) { console.warn('Set sync failed', e); ok = false; }
  }
  onStatus(ok ? 'synced' : 'offline');
  return ok;
}

// Download the account's sets and make this computer match (keeping unsent changes).
export async function pull() {
  const cloud = await accounts.listSets();
  const dirty = load(DIRTY, {});
  const local = getSets();
  const merged = local.filter(s => isSample(s.id) || dirty[s.id] === 'save');
  for (const c of cloud) {
    if (dirty[c.id]) continue; // a newer local change is waiting to upload
    merged.push({ id: c.id, title: c.title, items: c.items, updated: new Date(c.updated_at).getTime() });
  }
  merged.sort((a, b) => (isSample(a.id) - isSample(b.id)) || b.updated - a.updated);
  replaceAllSets(merged);
  onStatus(Object.keys(dirty).length ? 'offline' : 'synced');
  return merged;
}
