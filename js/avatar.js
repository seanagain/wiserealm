// Layered SVG characters. Later steps add shop items as new layers.

export const SKINS = ['#ffdcb8', '#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#5c3a21'];
export const COLORS = ['#ef476f', '#f78c6b', '#ffd166', '#06d6a0', '#2ec4b6', '#118ab2', '#4361ee', '#7209b7', '#2b2d42', '#f1f1f1', '#ff8fab', '#8d6346'];
export const HATS = [
  { id: 'hair', label: 'Hair' }, { id: 'cap', label: 'Cap' }, { id: 'beanie', label: 'Beanie' },
  { id: 'wizard', label: 'Wizard' }, { id: 'crown', label: 'Crown' }, { id: 'headphones', label: 'Headphones' },
  { id: 'helmet', label: 'Helmet' }, { id: 'horns', label: 'Horns' },
];
export const FACES = [
  { id: 'smile', label: 'Smile' }, { id: 'grin', label: 'Grin' }, { id: 'cool', label: 'Shades' },
  { id: 'wink', label: 'Wink' }, { id: 'focused', label: 'Focused' },
];
export const CLASSES = [
  { id: 'knight', label: 'Knight' }, { id: 'mage', label: 'Mage' },
  { id: 'archer', label: 'Archer' }, { id: 'ninja', label: 'Ninja' },
];

const pick = a => Math.floor(Math.random() * a.length);

export function randomAvatar() {
  return { cls: pick(CLASSES), color: pick(COLORS), skin: pick(SKINS), hat: pick(HATS), hc: pick(COLORS), face: pick(FACES) };
}

export function normalizeAvatar(a) {
  a = a && typeof a === 'object' ? a : {};
  const n = (v, arr) => (Number.isInteger(v) && v >= 0 && v < arr.length ? v : 0);
  return { cls: n(a.cls, CLASSES), color: n(a.color, COLORS), skin: n(a.skin, SKINS), hat: n(a.hat, HATS), hc: n(a.hc, COLORS), face: n(a.face, FACES) };
}

export function shade(hex, amt) {
  const h = hex.replace('#', '');
  const num = parseInt(h, 16);
  let r = num >> 16, g = (num >> 8) & 255, b = num & 255;
  const t = amt < 0 ? 0 : 255, p = Math.abs(amt);
  r = Math.round((t - r) * p + r); g = Math.round((t - g) * p + g); b = Math.round((t - b) * p + b);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

export const avatarColor = a => COLORS[normalizeAvatar(a).color];

const INK = '#1d1d1d';

function face(id) {
  const eyes = `<ellipse cx="41" cy="41" rx="3.2" ry="4" fill="${INK}"/><ellipse cx="59" cy="41" rx="3.2" ry="4" fill="${INK}"/>`;
  const smile = `<path d="M42 50 Q50 57 58 50" stroke="${INK}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`;
  switch (id) {
    case 'grin': return `<path d="M37 43 Q41 37 45 43 M55 43 Q59 37 63 43" stroke="${INK}" stroke-width="2.6" fill="none" stroke-linecap="round"/><path d="M41 49 Q50 61 59 49 Z" fill="${INK}"/>`;
    case 'cool': return `<rect x="34" y="36" width="14" height="9" rx="3" fill="#111"/><rect x="52" y="36" width="14" height="9" rx="3" fill="#111"/><rect x="47" y="38" width="6" height="2" fill="#111"/><rect x="37" y="38" width="4" height="2" fill="#fff" opacity=".5"/><path d="M44 52 Q51 55 57 50" stroke="${INK}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`;
    case 'wink': return `<ellipse cx="41" cy="41" rx="3.2" ry="4" fill="${INK}"/><path d="M55 42 Q59 45 63 42" stroke="${INK}" stroke-width="2.6" fill="none" stroke-linecap="round"/>${smile}`;
    case 'focused': return `<path d="M35 33 L46 36 M65 33 L54 36" stroke="${INK}" stroke-width="2.8" stroke-linecap="round"/>${eyes}<path d="M44 52 L56 52" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>`;
    default: return eyes + smile;
  }
}

const hair = c => `<path d="M26 38 Q26 14 50 14 Q74 14 74 38 Q70 26 58 24 Q52 30 40 27 Q30 28 26 38 Z" fill="${c}"/>`;

function hat(id, c) {
  const d = shade(c, -0.22);
  switch (id) {
    case 'cap': return `<path d="M27 34 Q27 13 50 13 Q73 13 73 34 Z" fill="${c}"/><path d="M50 29 Q70 27 87 33 Q85 38 72 37 L50 34 Z" fill="${d}"/><circle cx="50" cy="13" r="2.5" fill="${d}"/>`;
    case 'beanie': return `<path d="M26 36 Q26 10 50 10 Q74 10 74 36 Z" fill="${c}"/><rect x="24" y="29" width="52" height="10" rx="5" fill="${d}"/><circle cx="50" cy="9" r="6" fill="${shade(c, 0.35)}"/>`;
    case 'wizard': return `<path d="M30 26 L56 -10 L66 -7 L60 -1 L72 26 Z" fill="${c}"/><ellipse cx="50" cy="26" rx="31" ry="6" fill="${d}"/><circle cx="50" cy="10" r="3" fill="#ffd166"/><circle cx="58" cy="17" r="2" fill="#ffd166"/><circle cx="44" cy="19" r="1.6" fill="#ffd166"/>`;
    case 'crown': return hair('#3b2a20') + `<path d="M31 24 L31 7 L40 15 L45 2 L50 12 L55 2 L60 15 L69 7 L69 24 Z" fill="#ffd166" stroke="#c9a227" stroke-width="1.5" stroke-linejoin="round"/><circle cx="50" cy="19" r="3" fill="${c}"/><circle cx="38" cy="20" r="2" fill="${c}"/><circle cx="62" cy="20" r="2" fill="${c}"/>`;
    case 'headphones': return hair('#3b2a20') + `<path d="M25 42 Q25 10 50 10 Q75 10 75 42" stroke="#2b2d42" stroke-width="5" fill="none"/><rect x="18" y="33" width="12" height="18" rx="5" fill="${c}"/><rect x="70" y="33" width="12" height="18" rx="5" fill="${c}"/>`;
    case 'helmet': return `<path d="M24 35 Q24 10 50 10 Q76 10 76 35 Z" fill="#c3ccd6"/><rect x="24" y="30" width="52" height="5" fill="#9aa5b1"/><rect x="47" y="30" width="6" height="15" rx="2" fill="#9aa5b1"/><path d="M50 11 Q53 0 64 -3" stroke="${c}" stroke-width="6" fill="none" stroke-linecap="round"/>`;
    case 'horns': return hair('#2b2d42') + `<path d="M33 24 Q21 12 25 -1 Q32 14 42 18 Z" fill="${c}"/><path d="M67 24 Q79 12 75 -1 Q68 14 58 18 Z" fill="${c}"/>`;
    default: return hair(c);
  }
}

function star(cx, cy, ro, ri, n = 4) {
  let pts = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? ri : ro, ang = (Math.PI / n) * i - Math.PI / 2;
    pts.push((cx + r * Math.cos(ang)).toFixed(1) + ',' + (cy + r * Math.sin(ang)).toFixed(1));
  }
  return pts.join(' ');
}

function weapon(cls, c) {
  switch (cls) {
    case 'mage': return `<line x1="80" y1="36" x2="80" y2="112" stroke="#8b5a2b" stroke-width="4.5" stroke-linecap="round"/><circle cx="80" cy="31" r="12" fill="${c}" opacity=".35"/><circle cx="80" cy="31" r="7.5" fill="${c}" stroke="#fff" stroke-width="1.5"/>`;
    case 'archer': return `<path d="M73 44 Q100 78 73 112" stroke="#8b5a2b" stroke-width="4.5" fill="none" stroke-linecap="round"/><line x1="73" y1="44" x2="73" y2="112" stroke="#eee" stroke-width="1.2"/>`;
    case 'ninja': return `<polygon points="${star(84, 76, 11, 3.5)}" fill="#c3ccd6" stroke="#6c757d" stroke-width="1.2"/><circle cx="84" cy="76" r="2" fill="#6c757d"/>`;
    default: return `<polygon points="76,42 79,31 82,42" fill="#e9eef5"/><rect x="76" y="41" width="6" height="40" fill="#e9eef5" stroke="#9aa5b1" stroke-width="1"/><rect x="70" y="79" width="18" height="5" rx="2" fill="#c9a227"/><rect x="76.5" y="84" width="5" height="10" fill="#6b4226"/>`;
  }
}

export function avatarSVG(a, extraClass = '') {
  a = normalizeAvatar(a);
  const skin = SKINS[a.skin], col = COLORS[a.color], hc = COLORS[a.hc], dk = shade(col, -0.25);
  const cls = CLASSES[a.cls].id;
  return `<svg class="av ${extraClass}" viewBox="0 -12 100 132" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
<ellipse cx="50" cy="114" rx="28" ry="5" fill="rgba(0,0,0,.25)"/>
<rect x="25" y="58" width="50" height="54" rx="20" fill="${col}"/>
<path d="M38 60 L50 72 L62 60" stroke="${dk}" stroke-width="3" fill="none" stroke-linejoin="round"/>
<rect x="25" y="88" width="50" height="6" fill="${dk}"/>
<circle cx="50" cy="40" r="24" fill="${skin}"/>
<circle cx="36" cy="49" r="3.5" fill="#ff7b7b" opacity=".25"/><circle cx="64" cy="49" r="3.5" fill="#ff7b7b" opacity=".25"/>
${face(FACES[a.face].id)}
${hat(HATS[a.hat].id, hc)}
<circle cx="23" cy="88" r="7" fill="${skin}"/>
${weapon(cls, hc)}
<circle cx="79" cy="88" r="7" fill="${skin}"/>
</svg>`;
}
