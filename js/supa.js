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
  if (/no class with that code/i.test(m)) return 'No class found with that code. Check it with your teacher.';
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
  // classes & progress
  teacherClasses() { return this.rpc('teacher_classes'); },
  createClass(name) { return this.rpc('create_class', { p_name: name }); },
  updateClass(id, name, archived) { return this.rpc('update_class', { p_class: id, p_name: name, p_archived: archived }); },
  removeMember(cls, user) { return this.rpc('remove_member', { p_class: cls, p_user: user }); },
  joinClass(code) { return this.rpc('join_class', { p_code: code }); },
  leaveClass(id) { return this.rpc('leave_class', { p_class: id }); },
  myStats() { return this.rpc('my_stats'); },
  recordGame(code, round, cls, mode, title, questions, results) {
    return this.rpc('record_game', { p_code: code, p_round: round, p_class: cls || null, p_mode: mode, p_set_title: title, p_questions: questions, p_results: results });
  },
  classOverview(id) { return this.rpc('class_overview', { p_class: id }); },
  classSessions(id) { return this.rpc('class_sessions', { p_class: id }); },
  sessionDetail(id) { return this.rpc('session_detail', { p_session: id }); },
  hardQuestions(id) { return this.rpc('class_hard_questions', { p_class: id }); },
  studentDetail(cls, user) { return this.rpc('student_detail', { p_class: cls, p_user: user }); },
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
  ...demoClasses(),
};

// Preview-mode classes & progress, stored on this device. Mirrors supabase/schema.sql.
function demoClasses() {
  const DB = 'wr_demo_db';
  const db = () => load(DB, null) || { classes: [], members: [], sessions: [], results: [], seq: 1 };
  const put = d => save(DB, d);
  const pct = (c, t) => (t ? Math.round((1000 * c) / t) / 10 : null);
  const mine = (d, id) => { const c = d.classes.find(x => x.id === id); if (!c) throw new Error('Not your class'); return c; };
  const code = () => Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
  const classResults = (d, id) => d.results.filter(r => d.sessions.find(s => s.id === r.session_id && s.class_id === id));
  const gameRow = (d, r) => { const s = d.sessions.find(x => x.id === r.session_id); return { played_at: s.played_at, mode: s.mode, set_title: s.set_title, score: r.score, correct: r.correct, answered: r.answered, total: r.total, rank: r.rank, coins: r.coins, players: r.players || d.results.filter(x => x.session_id === s.id).length }; };
  return {
    async teacherClasses() {
      const d = db();
      return d.classes.map(c => { const rs = classResults(d, c.id); return { ...c, members: d.members.filter(m => m.class_id === c.id).length, games: d.sessions.filter(s => s.class_id === c.id).length, accuracy: pct(rs.reduce((a, r) => a + r.correct, 0), rs.reduce((a, r) => a + r.total, 0)) }; });
    },
    async createClass(name) { const d = db(); const c = { id: 'class-' + d.seq++, name: String(name).trim().slice(0, 60), join_code: code(), archived: false, created_at: new Date().toISOString() }; d.classes.push(c); put(d); return c; },
    async updateClass(id, name, archived) { const d = db(); const c = mine(d, id); if (name) c.name = name.slice(0, 60); if (archived !== null && archived !== undefined) c.archived = archived; put(d); return c; },
    async removeMember(cls, user) { const d = db(); d.members = d.members.filter(m => !(m.class_id === cls && m.user_id === user)); put(d); return true; },
    async joinClass(joinCode) {
      const d = db(); const c = d.classes.find(x => x.join_code === String(joinCode).replace(/\s/g, '').toUpperCase() && !x.archived);
      if (!c) throw new Error('No class found with that code. Check it with your teacher.');
      if (!d.members.some(m => m.class_id === c.id && m.user_id === 'demo-user')) d.members.push({ class_id: c.id, user_id: 'demo-user' });
      put(d); return c.name;
    },
    async leaveClass(id) { const d = db(); d.members = d.members.filter(m => !(m.class_id === id && m.user_id === 'demo-user')); put(d); return true; },
    async myStats() {
      const d = db(), p = demoProfile();
      return { classes: d.members.filter(m => m.user_id === 'demo-user').map(m => d.classes.find(c => c.id === m.class_id)).filter(c => c && !c.archived).map(c => ({ id: c.id, name: c.name, teacher: 'Your teacher' })),
        games: d.results.filter(r => r.user_id === 'demo-user').map(r => gameRow(d, r)), coins_earned: p.coins, items: p.owned.length };
    },
    async recordGame(gcode, round, cls, mode, title, questions, results) {
      const d = db();
      let s = d.sessions.find(x => x.code === gcode && x.round === round);
      if (s) return s.id;
      s = { id: d.seq++, code: gcode, round, class_id: cls || null, mode, set_title: title, questions, question_count: questions.length, played_at: new Date().toISOString() };
      d.sessions.push(s);
      for (const r of results) {
        if (r.uid !== 'demo-user') continue; // preview mode only has one account
        d.results.push({ session_id: s.id, user_id: r.uid, score: r.score, correct: r.correct, answered: r.answered, total: r.total, rank: r.rank, players: r.players, coins: r.coins, missed: r.missed || [] });
        if (cls && !d.members.some(m => m.class_id === cls && m.user_id === r.uid)) d.members.push({ class_id: cls, user_id: r.uid });
      }
      put(d); return s.id;
    },
    async classOverview(id) {
      const d = db(); mine(d, id); const p = demoProfile();
      return d.members.filter(m => m.class_id === id).map(m => {
        const rs = classResults(d, id).filter(r => r.user_id === m.user_id);
        const games = rs.map(r => gameRow(d, r)).sort((a, b) => a.played_at.localeCompare(b.played_at));
        return { user_id: m.user_id, display_name: p.display_name, email: p.email, coins: p.coins, games: rs.length,
          correct: rs.reduce((a, r) => a + r.correct, 0), total: rs.reduce((a, r) => a + r.total, 0),
          accuracy: pct(rs.reduce((a, r) => a + r.correct, 0), rs.reduce((a, r) => a + r.total, 0)),
          last_played: games.length ? games[games.length - 1].played_at : null, recent: games.slice(-10).map(g => Math.round((100 * g.correct) / (g.total || 1))) };
      });
    },
    async classSessions(id) {
      const d = db(); mine(d, id);
      return d.sessions.filter(s => s.class_id === id).reverse().map(s => { const rs = d.results.filter(r => r.session_id === s.id);
        return { id: s.id, played_at: s.played_at, mode: s.mode, set_title: s.set_title, players: rs.length, question_count: s.question_count,
          accuracy: pct(rs.reduce((a, r) => a + r.correct, 0), rs.reduce((a, r) => a + r.total, 0)) }; });
    },
    async sessionDetail(id) {
      const d = db(), p = demoProfile(); const s = d.sessions.find(x => x.id === id); if (!s) throw new Error('Not your game');
      return { ...s, results: d.results.filter(r => r.session_id === id).map(r => ({ ...r, name: p.display_name })) };
    },
    async hardQuestions(id) {
      const d = db(); mine(d, id); const agg = new Map();
      for (const s of d.sessions.filter(x => x.class_id === id)) for (const q of s.questions) {
        if (!q.n) continue; const a = agg.get(q.p) || { prompt: q.p, answer: q.a, asked: 0, right_count: 0 }; a.asked += q.n; a.right_count += q.r; agg.set(q.p, a);
      }
      return [...agg.values()].map(a => ({ ...a, pct: pct(a.right_count, a.asked) })).sort((a, b) => a.pct - b.pct || b.asked - a.asked).slice(0, 50);
    },
    async studentDetail(cls, user) {
      const d = db(); mine(d, cls); const p = demoProfile();
      const rs = classResults(d, cls).filter(r => r.user_id === user);
      const missed = new Map();
      for (const r of rs) { const s = d.sessions.find(x => x.id === r.session_id); for (const i of r.missed) { const q = s.questions[i]; if (!q) continue; const m = missed.get(q.p) || { prompt: q.p, answer: q.a, times: 0 }; m.times++; missed.set(q.p, m); } }
      return { profile: { id: p.id, name: p.display_name, email: p.email, coins: p.coins }, games: rs.map(r => gameRow(d, r)).sort((a, b) => a.played_at.localeCompare(b.played_at)),
        missed: [...missed.values()].sort((a, b) => b.times - a.times) };
    },
  };
}

export const accounts = isOnline() ? online : demo;
export const SHOP = ITEMS;
