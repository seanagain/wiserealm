// Accounts, coins and the shop.
// Online: Supabase (Google sign-in + database). The database enforces the rules
// (prices, coin balances, who can award coins), so the browser can't cheat.
// Preview: when Supabase isn't configured, a pretend account saved on this device
// so the shop and coins can be tried out.
import { CONFIG } from './config.js';
import { load, save } from './common.js';
import { ITEM_BY_ID, ITEMS } from './items.js';
import { PREMIUM_SLOTS } from './avatar.js';

export const isOnline = () => !!(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY);
const CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/+esm';

let clientP = null;
export function getClient() {
  if (!isOnline()) return Promise.resolve(null);
  clientP = clientP || import(CDN).then(({ createClient }) => createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
    auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    realtime: { params: { eventsPerSecond: 30 } },
  }));
  return clientP;
}

// Turns database errors into messages a student can understand.
function friendly(err) {
  const m = String((err && (err.message || err.error_description)) || err || '');
  if (/not enough coins/i.test(m)) return 'Not enough coins yet. Keep playing!';
  if (/already own/i.test(m)) return 'You already own that.';
  if (/not signed in|jwt|auth/i.test(m)) return 'Please sign in again.';
  if (/provider is not enabled|unsupported provider/i.test(m)) return 'Google sign-in isn’t switched on yet. Ask your teacher.';
  if (/not a teacher/i.test(m)) return 'Only teachers can do that.';
  return m || 'Something went wrong. Try again.';
}

// ---------------- Online (Supabase) ----------------
const online = {
  mode: 'online',
  async user() {
    const c = await getClient();
    const { data } = await c.auth.getSession();
    return data.session ? data.session.user : null;
  },
  async signIn(returnTo = location.href) {
    const c = await getClient();
    const url = new URL(returnTo); url.hash = '';
    url.searchParams.delete('code'); // Google sign-in adds its own ?code= when it returns
    const { error } = await c.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: url.href, queryParams: { prompt: 'select_account' } },
    });
    if (error) throw new Error(friendly(error));
  },
  async signOut() { const c = await getClient(); await c.auth.signOut(); },
  async onChange(cb) { const c = await getClient(); c.auth.onAuthStateChange((_e, session) => cb(session ? session.user : null)); },
  async rpc(name, args) {
    const c = await getClient();
    const { data, error } = await c.rpc(name, args || {});
    if (error) throw new Error(friendly(error));
    return data;
  },
  profile() { return this.rpc('my_profile'); },
  buy(item) { return this.rpc('buy_item', { p_item: item }); },
  setAvatar(avatar) { return this.rpc('set_avatar', { p_avatar: avatar }); },
  isTeacher() { return this.rpc('am_i_teacher'); },
  createGame(code, mode) { return this.rpc('create_game', { p_code: code, p_mode: mode }); },
  joinGame(code) { return this.rpc('join_game', { p_code: code }); },
  awardCoins(code, round, awards) { return this.rpc('award_coins', { p_code: code, p_round: round, p_awards: awards }); },
  students() { return this.rpc('list_students'); },
  giveCoins(user, amount, reason) { return this.rpc('give_coins', { p_user: user, p_amount: amount, p_reason: reason }); },
};

// ---------------- Preview (this device only) ----------------
const DEMO_KEY = 'wr_demo_profile', DEMO_SIGNED = 'wr_demo_signed_in';
const demoProfile = () => load(DEMO_KEY, null) || { id: 'demo-user', display_name: 'Demo Hero', email: 'preview@wiserealm', avatar: {}, coins: 500, owned: [] };
const demo = {
  mode: 'demo',
  async user() { return load(DEMO_SIGNED, false) ? { id: 'demo-user', email: 'preview@wiserealm' } : null; },
  async signIn() { save(DEMO_SIGNED, true); location.reload(); },
  async signOut() { save(DEMO_SIGNED, false); },
  async onChange() {},
  async profile() { const p = demoProfile(); save(DEMO_KEY, p); return p; },
  async buy(id) {
    const p = demoProfile(), it = ITEM_BY_ID[id];
    if (!it) throw new Error('That item doesn’t exist.');
    if (p.owned.includes(id)) throw new Error('You already own that.');
    if (p.coins < it.price) throw new Error('Not enough coins yet. Keep playing!');
    p.coins -= it.price; p.owned.push(id); save(DEMO_KEY, p); return p;
  },
  async setAvatar(avatar) {
    const p = demoProfile();
    for (const slot of PREMIUM_SLOTS) if (avatar[slot] && !p.owned.includes(avatar[slot])) throw new Error('You don’t own that item.');
    p.avatar = avatar; save(DEMO_KEY, p); return p;
  },
  async isTeacher() { return true; },
  async createGame() { return true; },
  async joinGame() { return true; },
  async awardCoins(_code, _round, awards) {
    const p = demoProfile();
    if (awards[p.id]) { p.coins += Math.min(300, Math.max(0, awards[p.id] | 0)); save(DEMO_KEY, p); }
    return Object.keys(awards).length;
  },
  async students() { const p = demoProfile(); return [{ id: p.id, display_name: p.display_name, email: p.email, coins: p.coins, items: p.owned.length }]; },
  async giveCoins(_u, amount) { const p = demoProfile(); p.coins = Math.max(0, p.coins + (amount | 0)); save(DEMO_KEY, p); return p.coins; },
};

export const accounts = isOnline() ? online : demo;
export const SHOP = ITEMS;
