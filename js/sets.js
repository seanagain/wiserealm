// Question sets: stored in this browser (localStorage) with JSON backup/restore.
// An item is { prompt, answer, wrong: [] }.
// If `wrong` is empty (vocab-style), wrong choices are borrowed from other items' answers.
import { uid, load, save, shuffle } from './common.js';

const KEY = 'cq_sets_v1';

export function getSets() {
  let sets = load(KEY, null);
  if (!Array.isArray(sets)) {
    sets = sampleSets();
    save(KEY, sets);
  }
  return sets;
}

export function getSet(id) { return getSets().find(s => s.id === id) || null; }

export function upsertSet(set) {
  const sets = getSets();
  set.updated = Date.now();
  const i = sets.findIndex(s => s.id === set.id);
  if (i >= 0) sets[i] = set; else sets.unshift(set);
  save(KEY, sets);
}

export function deleteSet(id) { save(KEY, getSets().filter(s => s.id !== id)); }

export function newSet(title = 'Untitled set') {
  return { id: uid(8), title, items: [], updated: Date.now() };
}

export function cleanItems(items) {
  return items
    .map(it => ({
      prompt: String(it.prompt ?? '').trim(),
      answer: String(it.answer ?? '').trim(),
      wrong: (it.wrong || []).map(w => String(w ?? '').trim()).filter(Boolean),
    }))
    .filter(it => it.prompt && it.answer);
}

// ---------- Pasting from a spreadsheet ----------

// Parses delimited text, handling quoted cells (Google Sheets wraps cells that contain line breaks in quotes).
function parseDelimited(text, delim) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else q = false;
      } else cell += ch;
    } else if (ch === '"' && cell === '') q = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (ch !== '\r') cell += ch;
  }
  row.push(cell); rows.push(row);
  return rows.map(r => r.map(c => c.trim())).filter(r => r.some(Boolean));
}

export function parseTable(text) {
  text = String(text || '').replace(/\r\n?/g, '\n').trim();
  if (!text) return [];
  if (text.includes('\t')) return parseDelimited(text, '\t');
  const lines = text.split('\n').filter(l => l.trim());
  const splitFirst = (sep) => lines.map(l => {
    const i = l.indexOf(sep);
    return i < 0 ? [l.trim()] : [l.slice(0, i).trim(), l.slice(i + sep.length).trim()];
  });
  const share = sep => lines.filter(l => l.includes(sep)).length / lines.length;
  if (share(' - ') >= 0.8) return splitFirst(' - ');
  if (share(':') >= 0.8) return splitFirst(':');
  return parseDelimited(text, ',');
}

const PROMPT_H = /^(question|questions|front|term|terms|word|words|vocab|vocabulary|prompt|q)$/i;
const ANSWER_H = /^(answer|answers|back|definition|definitions|correct|correct answer|meaning|a)$/i;
const WRONG_H = /(wrong|incorrect|distractor|choice|option|other)/i;

export function rowsToItems(rows) {
  if (!rows.length) return { items: [], header: false };
  const head = rows[0];
  let pi = 0, ai = 1, wi = null, header = false;
  const pIdx = head.findIndex(h => PROMPT_H.test(h));
  const aIdx = head.findIndex(h => ANSWER_H.test(h));
  if (pIdx >= 0 || aIdx >= 0) {
    header = true;
    if (pIdx >= 0) pi = pIdx;
    if (aIdx >= 0) ai = aIdx; else ai = pi === 0 ? 1 : 0;
    wi = head.map((h, i) => (WRONG_H.test(h) && i !== pi && i !== ai ? i : -1)).filter(i => i >= 0);
  }
  const body = header ? rows.slice(1) : rows;
  const items = body.map(r => {
    const wrong = wi ? wi.map(i => r[i]) : r.slice(2);
    return { prompt: r[pi], answer: r[ai], wrong };
  });
  return { items: cleanItems(items), header };
}

// ---------- Turning a set into game questions ----------

// Returns [{ prompt, choices: [..], correct: index }]
export function buildQuestions(set, { count = 0, shuffleOrder = true, flip = false } = {}) {
  let items = cleanItems(set.items).map(it =>
    flip && it.wrong.length === 0 ? { prompt: it.answer, answer: it.prompt, wrong: [] } : it);
  const allAnswers = [...new Set(items.map(it => it.answer))];
  if (shuffleOrder) items = shuffle(items);
  const out = [];
  for (const it of items) {
    let wrong = shuffle([...new Set(it.wrong)].filter(w => w.toLowerCase() !== it.answer.toLowerCase())).slice(0, 3);
    if (wrong.length === 0 && /^(true|false)$/i.test(it.answer)) {
      const choices = ['True', 'False'];
      out.push({ prompt: it.prompt, choices, correct: /^true$/i.test(it.answer) ? 0 : 1 });
      continue;
    }
    if (wrong.length < 3) {
      const extra = shuffle(allAnswers.filter(a =>
        a.toLowerCase() !== it.answer.toLowerCase() && !wrong.some(w => w.toLowerCase() === a.toLowerCase())));
      wrong = wrong.concat(extra.slice(0, 3 - wrong.length));
    }
    if (wrong.length < 1) continue;
    const choices = shuffle([it.answer, ...wrong]);
    out.push({ prompt: it.prompt, choices, correct: choices.indexOf(it.answer) });
  }
  return count > 0 ? out.slice(0, count) : out;
}

function sampleSets() {
  return [
    {
      id: 'sample-vocab', title: 'Sample: Earth Science Vocabulary', updated: Date.now(),
      items: [
        ['Erosion', 'The movement of rock and soil by wind, water, or ice'],
        ['Weathering', 'The breaking down of rocks into smaller pieces'],
        ['Magma', 'Melted rock found beneath Earth\'s surface'],
        ['Sediment', 'Small, solid pieces of material carried by wind or water'],
        ['Plate tectonics', 'The theory that Earth\'s outer layer is made of moving pieces'],
        ['Fossil', 'The preserved remains or traces of an ancient living thing'],
        ['Mineral', 'A naturally occurring solid with a crystal structure'],
        ['Igneous rock', 'Rock that forms when magma or lava cools'],
        ['Atmosphere', 'The layer of gases that surrounds Earth'],
        ['Fault', 'A break in Earth\'s crust where rocks have moved'],
      ].map(([prompt, answer]) => ({ prompt, answer, wrong: [] })),
    },
    {
      id: 'sample-quiz', title: 'Sample: Mixed Review Quiz', updated: Date.now() - 1,
      items: [
        { prompt: 'What is 7 × 8?', answer: '56', wrong: ['54', '48', '64'] },
        { prompt: 'Which planet is known as the Red Planet?', answer: 'Mars', wrong: ['Venus', 'Jupiter', 'Mercury'] },
        { prompt: 'What is the main idea of a paragraph called?', answer: 'Topic sentence', wrong: ['Conclusion', 'Detail', 'Transition'] },
        { prompt: 'Water boils at 100°C at sea level.', answer: 'True', wrong: [] },
        { prompt: 'Who wrote "Romeo and Juliet"?', answer: 'William Shakespeare', wrong: ['Charles Dickens', 'Mark Twain', 'Jane Austen'] },
        { prompt: 'What is the value of x if 3x + 2 = 14?', answer: '4', wrong: ['3', '5', '6'] },
        { prompt: 'The Pacific is the smallest ocean.', answer: 'False', wrong: [] },
        { prompt: 'Which part of the cell contains DNA?', answer: 'Nucleus', wrong: ['Cell wall', 'Ribosome', 'Cytoplasm'] },
      ],
    },
  ];
}
