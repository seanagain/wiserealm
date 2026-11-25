// Name filter: blocks rude or sensitive names (English and Chinese). Teachers can switch it off
// and add their own words on the teacher page. The same lists are in supabase/schema.sql
// (run `node tools/gen-shop-sql.mjs` after editing them), so names saved to accounts are
// checked by the database too.
//
// CONTAINS: blocked anywhere in the name (after removing spaces, dots, digits used as letters...).
// EXACT: blocked only as a whole word, because they hide inside normal names ("ass" in "Cassie",
// "hell" in "Hello", "dick" in "Dickson").
export const CONTAINS = [
  // English
  'fuck', 'fuk', 'fck', 'fvck', 'shit', 'bitch', 'biatch', 'cunt', 'pussy', 'whore', 'slut', 'bastard', 'asshole', 'dumbass',
  'butthole', 'motherf', 'nigger', 'nigga', 'faggot', 'retard', 'porn', 'penis', 'vagina', 'rapist', 'boob', 'piss', 'dildo',
  'hitler', 'killyourself', 'tranny', 'blowjob', 'handjob', 'jerkoff', 'wank', 'twat', 'horny', 'nude', 'naked',
  // Chinese (traditional and simplified)
  '幹你', '干你', '幹您', '操你', '肏', '屌', '靠北', '靠杯', '靠腰', '雞掰', '鸡掰', '機掰', '机掰', '雞巴', '鸡巴', '他媽', '他妈',
  '你媽', '你妈', '媽的', '妈的', '去死', '白痴', '白癡', '智障', '腦殘', '脑残', '婊子', '賤人', '贱人', '王八蛋', '混蛋', '傻逼',
  '傻屄', '屄', '草泥馬', '草泥马', '尼瑪', '尼玛', '三小', '北七', '廢物', '废物', '屁眼', '色情', '做愛', '做爱', '性交', '陰莖',
  '阴茎', '陰道', '阴道', '奶子', '強姦', '强奸', '自殺', '自杀', '支那', '黑鬼', '垃圾人', '死胖子', '蠢貨', '蠢货',
];
export const EXACT = [
  'ass', 'dick', 'cock', 'sex', 'sexy', 'cum', 'tit', 'tits', 'butt', 'damn', 'hell', 'crap', 'rape', 'nazi', 'kys', 'stfu', 'wtf',
  'chink', 'spic', 'kike', 'gook', 'niga', 'fag', 'hoe', 'thot', 'pedo', 'anal',
  '幹', '操', '屎', '屁', '賤', '贱', '婊', '滾', '滚', '豬', '猪', '笨蛋', '垃圾',
];

const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's', '!': 'i' };
const collapse = s => s.replace(/(.)\1+/gu, '$1');

// Lower case, digits/symbols that stand for letters, then everything that isn't a letter removed.
export function normalize(name) {
  const low = String(name || '').toLowerCase().replace(/[013457@$!]/g, c => LEET[c]);
  const compact = low.replace(/[^\p{L}]/gu, '');
  const tokens = low.split(/[^\p{L}]+/u).filter(Boolean);
  return { compact, tokens };
}

// Returns the word that matched, or '' if the name is fine.
export function blockedWord(name, extra = []) {
  const { compact, tokens } = normalize(name);
  if (!compact) return '';
  const coll = collapse(compact);
  for (const w of [...CONTAINS, ...extra.map(x => normalize(x).compact).filter(Boolean)]) {
    if (compact.includes(w) || (w === collapse(w) && coll.includes(w))) return w;
  }
  for (const w of EXACT) if (tokens.includes(w) || compact === w) return w;
  return '';
}

// Teacher-added words: one per line or comma separated.
export const parseWords = text => [...new Set(String(text || '').split(/[\n,，、;]+/).map(w => w.trim().toLowerCase()).filter(w => w.length >= 1 && w.length <= 30))].slice(0, 200);
