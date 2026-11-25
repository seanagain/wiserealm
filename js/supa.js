// Accounts, coins and the shop.
// Online: Supabase (Google sign-in + database). The database enforces the rules
// (prices, coin balances, who can award coins), so the browser can't cheat.
// Preview: when Supabase isn't configured, a pretend account saved on this device
// so the shop and coins can be tried out.
import { CONFIG } from './config.js';
import { load, save } from './common.js';
import { ITEM_BY_ID, ITEMS } from './items.js';
import { PREMIUM_SLOTS, randomAvatar } from './avatar.js';
import { blockedWord } from './namefilter.js';
import { HOUSE_BY_ID, MILESTONES, FURNITURE, EXTERIORS, normalizeHouse, canUse } from './furniture.js';

export const isOnline = () => !!(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY);
const TZ = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } })();
// Supabase's library is stored on this site (vendor/), not loaded from a public CDN,
// so no outside company sees who visits WiseRealm.
const LIB = new URL('../vendor/supabase.js', import.meta.url).href;
function loadLib() {
  if (window.supabase && window.supabase.createClient) return Promise.resolve(window.supabase);
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = LIB; s.onload = () => res(window.supabase); s.onerror = () => rej(new Error('Could not load. Check your internet.'));
    document.head.append(s);
  });
}

let clientP = null;
export function getClient() {
  if (!isOnline()) return Promise.resolve(null);
  clientP = clientP || loadLib().then(({ createClient }) => createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
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
  if (/yourself/i.test(m)) return 'You can’t remove yourself.';
  if (/assigned to your class/i.test(m)) return 'That set isn’t assigned to your class anymore.';
  if (/saved to your account/i.test(m)) return 'Sign in on the teacher page first so this set is saved to your account.';
  if (/look like an email/i.test(m)) return 'That doesn’t look like an email address.';
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
  joinGame(code, ticket) { return this.rpc('join_game', { p_code: code, p_device: ticket }); },
  gameRoster(code) { return this.rpc('game_roster', { p_code: code }); },
  setGameClass(code, cls) { return this.rpc('set_game_class', { p_code: code, p_class: cls || null }); },
  deleteMyData() { return this.rpc('delete_my_data'); },
  addUsage(n) { return this.rpc('add_usage', { p_msgs: n }); },
  siteUsage() { return this.rpc('site_usage'); },
  deleteStudentData(user) { return this.rpc('delete_student_data', { p_user: user }); },
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
  // teacher account: question sets & colleagues
  listSets() { return this.rpc('list_sets'); },
  saveSet(id, title, items) { return this.rpc('save_set', { p_id: id, p_title: title, p_items: items }); },
  deleteSet(id) { return this.rpc('delete_set', { p_id: id }); },
  listTeachers() { return this.rpc('list_teachers'); },
  addTeacher(email) { return this.rpc('add_teacher', { p_email: email }); },
  removeTeacher(email) { return this.rpc('remove_teacher', { p_email: email }); },
  playersOwned(uids) { return uids.length ? this.rpc('players_owned', { p_users: uids }) : Promise.resolve([]); },
  setDisplayName(name) { return this.rpc('set_display_name', { p_name: name }); },
  renameStudent(user, name) { return this.rpc('rename_student', { p_user: user, p_name: name }); },
  // houses & the class village
  myHouse() { return this.rpc('my_house', { p_tz: TZ }); },
  saveHouse(house) { return this.rpc('save_house', { p_house: house }); },
  classVillage(cls) { return this.rpc('class_village', { p_class: cls }); },
  resetHouse(user) { return this.rpc('reset_house', { p_user: user }); },
  setVillageLive(cls, minutes) { return this.rpc('set_village_live', { p_class: cls, p_minutes: minutes }); },
  getNameFilter() { return this.rpc('my_name_filter'); },
  setNameFilter(on, words) { return this.rpc('set_name_filter', { p_on: on, p_words: words }); },
  // solo practice
  assignSet(cls, set, on) { return this.rpc('assign_set', { p_class: cls, p_set: set, p_on: on }); },
  classAssignedSets(cls) { return this.rpc('class_assigned_sets', { p_class: cls }); },
  classPractice(cls) { return this.rpc('class_practice', { p_class: cls, p_tz: TZ }); },
  myPractice() { return this.rpc('my_practice', { p_tz: TZ }); },
  myCards(set) { return this.rpc('my_cards', { p_set: set }); },
  savePractice(set, game, answers, score, duration) {
    return this.rpc('save_practice', { p_set: set, p_game: game, p_answers: answers, p_score: score, p_duration: duration, p_tz: TZ });
  },
};

// ---------------- Preview (this device only) ----------------
const DEMO_KEY = 'wr_demo_profile', DEMO_SIGNED = 'wr_demo_signed_in';
const demoProfile = () => Object.assign({ id: 'demo-user', display_name: 'Demo Hero', real_name: 'Preview Student', email: 'preview@wiserealm', avatar: {}, coins: 500, owned: [] }, load(DEMO_KEY, {}) || {});
// Preview "game_players": which iPad tickets joined which game, and the class picked for each game.
const demoGames = () => load('wr_demo_games', {});
const demo = {
  mode: 'demo',
  async user() { return load(DEMO_SIGNED, false) ? { id: 'demo-user', email: 'preview@wiserealm' } : null; },
  async signIn() { save(DEMO_SIGNED, true); location.reload(); },
  async signOut() { save(DEMO_SIGNED, false); },
  async onChange() {},
  async profile() { const p = demoProfile(); save(DEMO_KEY, p); return p; },
  async buy(id) {
    const p = demoProfile(), it = ITEM_BY_ID[id] || HOUSE_BY_ID[id];
    if (!it) throw new Error('That item doesn’t exist.');
    if (it.milestone) throw new Error('That is earned with a learning milestone, not bought.');
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
  async joinGame(code, ticket) {
    const g = demoGames(); const e = g[code] = g[code] || { tickets: [], cls: null };
    if (!e.tickets.includes(ticket)) e.tickets.push(ticket);
    save('wr_demo_games', g);
    let cls = null;
    if (e.cls) { try { cls = await this.joinClassById(e.cls); } catch { /* ignore */ } }
    return { ok: true, class: cls };
  },
  async gameRoster(code) {
    const e = demoGames()[code]; if (!e || !load(DEMO_SIGNED, false)) return [];
    const p = demoProfile();
    return e.tickets.map(t => ({ device: t, user_id: p.id, display_name: p.display_name, real_name: p.real_name, avatar: p.avatar, owned: p.owned }));
  },
  async setGameClass(code, cls) {
    const g = demoGames(); const e = g[code] = g[code] || { tickets: [], cls: null };
    e.cls = cls || null; save('wr_demo_games', g);
    if (cls && e.tickets.length) await this.joinClassById(cls).catch(() => {});
    return true;
  },
  async deleteMyData() {
    for (const k of [DEMO_KEY, 'wr_demo_db', 'wr_demo_games']) localStorage.removeItem(k);
    save(DEMO_SIGNED, false); return true;
  },
  async deleteStudentData() { return this.deleteMyData().then(() => 'deleted'); },
  async addUsage(n) { save('wr_demo_usage', load('wr_demo_usage', 0) + (n | 0)); return true; },
  async siteUsage() {
    const d = load('wr_demo_db', {}), m = load('wr_demo_usage', 0);
    return { month_start: new Date().toISOString(), db_bytes: 24e6, students: 1, active_users: 2, msgs_month: m, msgs_today: m,
      games_month: (d.sessions || []).length, practice_month: (load('wr_demo_db', {}).psessions || []).length,
      by_teacher: [{ email: 'preview@wiserealm', name: 'Demo Hero', msgs: m, games: (d.sessions || []).length }] };
  },
  async awardCoins(_code, _round, awards) {
    const p = demoProfile();
    if (awards[p.id]) { p.coins += Math.min(300, Math.max(0, awards[p.id] | 0)); save(DEMO_KEY, p); }
    return Object.keys(awards).length;
  },
  async students() { const p = demoProfile(); return [{ id: p.id, display_name: p.display_name, real_name: p.real_name, email: p.email, coins: p.coins, items: p.owned.length }]; },
  async giveCoins(_u, amount) { const p = demoProfile(); p.coins = Math.max(0, p.coins + (amount | 0)); save(DEMO_KEY, p); return p.coins; },
  ...demoClasses(),
  // Preview "cloud": a second store on this device, so syncing can be tried out.
  async listSets() { return load('wr_demo_cloud_sets', []); },
  async saveSet(id, title, items) {
    const all = load('wr_demo_cloud_sets', []).filter(x => x.id !== id);
    const t = new Date().toISOString(); all.unshift({ id, title, items, updated_at: t }); save('wr_demo_cloud_sets', all); return t;
  },
  async deleteSet(id) { save('wr_demo_cloud_sets', load('wr_demo_cloud_sets', []).filter(x => x.id !== id)); return true; },
  async listTeachers() { return load('wr_demo_teachers', [{ email: 'preview@wiserealm', signed_up: true }]); },
  async addTeacher(email) {
    const e = String(email).trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new Error('That doesn’t look like an email address');
    const all = await this.listTeachers(); if (!all.some(t => t.email === e)) all.push({ email: e, signed_up: false }); save('wr_demo_teachers', all); return true;
  },
  async removeTeacher(email) {
    if (email === 'preview@wiserealm') throw new Error('You can’t remove yourself');
    save('wr_demo_teachers', (await this.listTeachers()).filter(t => t.email !== email)); return true;
  },
  async playersOwned(uids) { const p = demoProfile(); return uids.includes(p.id) ? [{ id: p.id, owned: p.owned }] : []; },
  ...demoPractice(),
  ...demoHouses(),
  async setDisplayName(name) {
    const p = demoProfile(), n = demoCleanName(name), f = load('wr_demo_namefilter', { on: true, words: [] });
    if (f.on && blockedWord(n, f.words)) throw new Error('That name isn’t allowed. Please choose a different one.');
    p.display_name = n; save(DEMO_KEY, p); return p;
  },
  async getNameFilter() { return load('wr_demo_namefilter', { on: true, words: [] }); },
  async setNameFilter(on, words) { save('wr_demo_namefilter', { on: !!on, words }); return true; },
  async renameStudent(_u, name) { const p = demoProfile(); p.display_name = demoCleanName(name); save(DEMO_KEY, p); return p.display_name; },
};

// Same rules as clean_name() in supabase/schema.sql.
function demoCleanName(name) {
  const n = String(name || '').trim().replace(/\s+/g, ' ');
  if (n.length < 2 || n.length > 16) throw new Error('Names must be 2 to 16 characters');
  if (!/^[\p{L}\p{N} .'-]+$/u.test(n)) throw new Error('Names can only use letters, numbers, spaces, periods, apostrophes and dashes');
  return n;
}

// Preview-mode houses, mirroring my_house / save_house / class_village in supabase/schema.sql.
// The village is filled with a few pretend classmates so it can be tried out.
function demoHouses() {
  const db = () => Object.assign({ classes: [], members: [], cards: [], psessions: [], results: [] }, load('wr_demo_db', {}));
  const day = t => new Date(t).toLocaleDateString('en-CA');
  const progress = () => {
    const d = db(), days = new Set(d.psessions.map(x => day(x.played_at)));
    let t = new Date(), streak = 0; if (!days.has(day(t))) t.setDate(t.getDate() - 1);
    while (days.has(day(t))) { streak++; t.setDate(t.getDate() - 1); }
    const mine = d.results.filter(r => r.user_id === 'demo-user');
    return { classes: d.members.filter(m => m.user_id === 'demo-user').length, games: mine.length, correct: mine.reduce((a, r) => a + r.correct, 0),
      practices: d.psessions.length, streak, mastered: d.cards.filter(c => c.box >= 3).length };
  };
  const NAMES = ['Maya L.', 'Leo K.', 'Ava S.', 'Kai T.', 'Zoe P.', 'Max R.', 'Ivy W.', 'Sam H.'];
  const fake = i => {
    const free = FURNITURE.filter(f => !f.milestone), pick = n => free[(i * 7 + n * 5) % free.length];
    const items = [[pick(1).id, 1, 4, 0], [pick(2).id, 6, 5, i % 2], [pick(3).id, 3, 7, 0], [pick(4).id, 9, 6, 0], ['f_window', 4, 0, 0]];
    return { name: NAMES[i], avatar: randomAvatar(), house: normalizeHouse({ wall: ['w_plain', 'w_blue', 'w_stripes', 'w_brick'][i % 4], floor: ['fl_wood', 'fl_tile', 'fl_carpet'][i % 3], ext: i % EXTERIORS.length, items }), me: false };
  };
  return {
    async myHouse() {
      const prog = progress(), p = demoProfile();
      const un = [...new Set([...(p.unlocked || []), ...MILESTONES.filter(m => prog[m.stat] >= m.need).map(m => m.id)])];
      p.unlocked = un; save(DEMO_KEY, p);
      return { house: load('wr_demo_house', null), progress: prog, unlocked: un, teacher: false };
    },
    async saveHouse(house) {
      const p = demoProfile();
      for (const e of house.items || []) if (!canUse(HOUSE_BY_ID[e[0]], p.owned, p.unlocked || [])) throw new Error('You can’t use that yet.');
      save('wr_demo_house', normalizeHouse(house)); return true;
    },
    async classVillage(cls) {
      const d = db(), c = d.classes.find(x => x.id === cls); if (!c) throw new Error('You can only visit villages of your own classes');
      const p = demoProfile(), neighbors = load('wr_demo_neighbors', null) || NAMES.slice(0, 6).map((_, i) => fake(i));
      save('wr_demo_neighbors', neighbors);
      const me = d.members.some(m => m.class_id === cls && m.user_id === 'demo-user') ? [{ name: p.display_name, avatar: p.avatar, house: load('wr_demo_house', null), me: true }] : [];
      const live = c.live_until > Date.now() ? { code: c.live_code, left: Math.round((c.live_until - Date.now()) / 1000) } : null;
      return { name: c.name, live, teacher: { name: 'Your teacher', avatar: { cls: 1, hat: 3, color: 7 }, house: { wall: 'w_stars', floor: 'fl_carpet', ext: 1, items: [['f_bookshelf', 0, 3, 0], ['f_throne', 6, 5, 0], ['m_globe', 9, 4, 0], ['f_painting', 4, 0, 0], ['f_rug_star', 5, 6, 0]] }, me: false },
        houses: [...me, ...neighbors] };
    },
    async resetHouse() { localStorage.removeItem('wr_demo_house'); return true; },
    async setVillageLive(cls, minutes) {
      const d = db(), c = d.classes.find(x => x.id === cls); if (!c) throw new Error('Not your class');
      if (!(minutes > 0)) { c.live_code = null; c.live_until = 0; save('wr_demo_db', d); return null; }
      if (!(c.live_until > Date.now()) || !c.live_code) c.live_code = 'v' + Math.random().toString(36).slice(2, 12);
      c.live_until = Date.now() + Math.min(90, minutes) * 60000; save('wr_demo_db', d);
      return { code: c.live_code, left: minutes * 60 };
    },
  };
}

// Preview-mode practice, mirroring save_practice etc. in supabase/schema.sql.
function demoPractice() {
  const DB = 'wr_demo_db';
  const db = () => Object.assign({ classes: [], members: [], class_sets: [], cards: [], psessions: [] }, load(DB, {}));
  const put = d => save(DB, d);
  const cloudSet = id => load('wr_demo_cloud_sets', []).find(s => s.id === id);
  const key = p => String(p || '').trim().toLowerCase();
  const day = t => new Date(t).toLocaleDateString('en-CA');
  const streak = d => { const days = new Set(d.psessions.map(s => day(s.played_at))); let t = new Date(); if (!days.has(day(t))) t.setDate(t.getDate() - 1); let n = 0; while (days.has(day(t))) { n++; t.setDate(t.getDate() - 1); } return n; };
  const todayCoins = d => d.psessions.filter(s => day(s.played_at) === day(Date.now())).reduce((a, s) => a + s.coins, 0);
  return {
    async assignSet(cls, set, on) {
      const d = db(); if (!cloudSet(set)) throw new Error('That set isn’t saved to your account yet');
      d.class_sets = d.class_sets.filter(x => !(x.class_id === cls && x.set_id === set));
      if (on) d.class_sets.push({ class_id: cls, set_id: set, assigned_at: new Date().toISOString() });
      put(d); return true;
    },
    async classAssignedSets(cls) { const d = db(); return d.class_sets.filter(x => x.class_id === cls).map(x => { const s = cloudSet(x.set_id); return s && { set_id: s.id, title: s.title, cards: s.items.length, assigned_at: x.assigned_at }; }).filter(Boolean); },
    async classPractice(cls) {
      const d = db(), p = demoProfile();
      const sets = d.class_sets.filter(x => x.class_id === cls).map(x => cloudSet(x.set_id)).filter(Boolean);
      return d.members.filter(m => m.class_id === cls).map(() => {
        const ss = d.psessions.filter(s => sets.some(x => x.id === s.set_id));
        return { user_id: p.id, display_name: p.display_name, real_name: p.real_name, sessions: ss.length, minutes: Math.floor(ss.reduce((a, s) => a + s.duration_s, 0) / 60),
          last_practiced: d.psessions.length ? d.psessions[d.psessions.length - 1].played_at : null,
          mastered: d.cards.filter(c => c.box >= 3 && sets.some(x => x.id === c.set_id)).length, total_cards: sets.reduce((a, x) => a + x.items.length, 0), streak: streak(d) };
      });
    },
    async myPractice() {
      const d = db(); const out = [];
      for (const m of d.members.filter(m => m.user_id === 'demo-user')) {
        const c = d.classes.find(x => x.id === m.class_id); if (!c || c.archived) continue;
        for (const cs of d.class_sets.filter(x => x.class_id === c.id)) {
          const s = cloudSet(cs.set_id); if (!s || out.some(o => o.id === s.id)) continue;
          out.push({ id: s.id, title: s.title, class_name: c.name, items: s.items, cards: s.items.length,
            mastered: d.cards.filter(k => k.set_id === s.id && k.box >= 3).length, seen: d.cards.filter(k => k.set_id === s.id).length });
        }
      }
      return { sets: out, streak: streak(d), today_coins: todayCoins(d), cap: 50 };
    },
    async myCards(set) { return db().cards.filter(c => c.set_id === set); },
    async savePractice(setId, game, answers, score, duration) {
      const d = db(), s = cloudSet(setId); if (!s) throw new Error('That set isn’t assigned to your class');
      let right = 0, n = 0;
      for (const a of answers.slice(0, 300)) {
        const item = s.items[a.q]; if (!item) continue;
        const ok = key(a.a) === key(item.answer); n++; if (ok) right++;
        const k = key(item.prompt); let c = d.cards.find(x => x.set_id === setId && x.card_key === k);
        if (!c) { c = { set_id: setId, card_key: k, box: 0, seen: 0, right_count: 0 }; d.cards.push(c); }
        c.box = ok ? Math.min(3, c.box + 1) : 0; c.seen++; c.right_count += ok ? 1 : 0; c.last_seen = new Date().toISOString();
      }
      const today = todayCoins(d), dur = Math.max(1, duration | 0);
      let earn = Math.min(20, Math.floor(right / 2) + (n >= 10 ? 3 : 0), Math.max(0, 50 - today));
      if (n > dur * 2) earn = 0;
      d.psessions.push({ set_id: setId, game, correct: right, answered: n, score, duration_s: dur, coins: earn, played_at: new Date().toISOString() });
      put(d);
      if (earn) { const p = demoProfile(); p.coins += earn; save(DEMO_KEY, p); }
      return { correct: right, answered: n, coins: earn, today_coins: today + earn, cap: 50, streak: streak(d) };
    },
  };
}

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
    async joinClassById(id) {
      const d = db(); const c = d.classes.find(x => x.id === id && !x.archived); if (!c) return null;
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
        return { user_id: m.user_id, display_name: p.display_name, real_name: p.real_name, email: p.email, coins: p.coins, games: rs.length,
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
      return { ...s, results: d.results.filter(r => r.session_id === id).map(r => ({ ...r, name: p.display_name, real_name: p.real_name })) };
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
      return { profile: { id: p.id, name: p.display_name, real_name: p.real_name, email: p.email, coins: p.coins }, games: rs.map(r => gameRow(d, r)).sort((a, b) => a.played_at.localeCompare(b.played_at)),
        missed: [...missed.values()].sort((a, b) => b.times - a.times) };
    },
  };
}

export const accounts = isOnline() ? online : demo;
export const SHOP = ITEMS;
