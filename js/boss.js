// Boss monsters for Boss Raid (original designs drawn in SVG).
export const BOSSES = [
  { name: 'Grumblor the Slime King', body: '#5fd068', belly: '#b7f5a8', horn: '#f4d35e', crown: true },
  { name: 'Magmaw the Molten', body: '#ff7a45', belly: '#ffc078', horn: '#5c2b1d' },
  { name: 'Frostfang the Glacier Wyrm', body: '#4cc9f0', belly: '#d7f3fb', horn: '#f8f9fa' },
  { name: 'Umbrax of the Void', body: '#7b2cbf', belly: '#c77dff', horn: '#ff4d6d' },
];

export function bossSVG(i) {
  const b = BOSSES[i] || BOSSES[0];
  const dark = 'rgba(0,0,0,.18)';
  const teeth = [118, 134, 150, 166].map(x => `<path d="M${x} 153 L${x + 6} 166 L${x + 12} 155 Z" fill="#fff"/>`).join('');
  return `<svg class="boss-svg" viewBox="0 0 300 260" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
<ellipse cx="150" cy="246" rx="112" ry="12" fill="rgba(0,0,0,.3)"/>
<ellipse class="arm-l" cx="44" cy="165" rx="26" ry="42" fill="${b.body}" transform="rotate(20 44 165)"/>
<ellipse class="arm-r" cx="256" cy="165" rx="26" ry="42" fill="${b.body}" transform="rotate(-20 256 165)"/>
<ellipse cx="44" cy="165" rx="26" ry="42" fill="${dark}" transform="rotate(20 44 165)"/>
<ellipse cx="256" cy="165" rx="26" ry="42" fill="${dark}" transform="rotate(-20 256 165)"/>
<path d="M92 76 Q68 32 94 6 Q100 44 122 62 Z" fill="${b.horn}"/>
<path d="M208 76 Q232 32 206 6 Q200 44 178 62 Z" fill="${b.horn}"/>
<path d="M62 236 Q30 236 34 172 Q40 58 150 50 Q260 58 266 172 Q270 236 238 236 Z" fill="${b.body}"/>
<path d="M62 236 Q30 236 34 172 Q36 120 70 90 Q48 150 70 236 Z" fill="${dark}"/>
<ellipse cx="150" cy="188" rx="72" ry="44" fill="${b.belly}"/>
${b.crown ? `<path d="M112 58 L112 30 L128 44 L140 22 L150 40 L160 22 L172 44 L188 30 L188 58 Z" fill="#ffd166" stroke="#c9a227" stroke-width="3" stroke-linejoin="round"/>` : ''}
<g class="eyes">
<circle cx="115" cy="112" r="25" fill="#fff"/><circle cx="185" cy="112" r="25" fill="#fff"/>
<circle class="pupil" cx="118" cy="116" r="11" fill="#141414"/><circle class="pupil" cx="182" cy="116" r="11" fill="#141414"/>
<circle cx="122" cy="111" r="3.5" fill="#fff"/><circle cx="186" cy="111" r="3.5" fill="#fff"/>
</g>
<g class="brows"><path d="M86 82 L138 98" stroke="#141414" stroke-width="9" stroke-linecap="round"/><path d="M214 82 L162 98" stroke="#141414" stroke-width="9" stroke-linecap="round"/></g>
<path d="M104 148 Q150 192 196 148 Q150 164 104 148 Z" fill="#3a0d1a"/>
${teeth}
<g class="sweat"><path d="M238 92 Q246 106 238 112 Q230 106 238 92 Z" fill="#9be7ff"/><path d="M62 104 Q68 115 62 120 Q56 115 62 104 Z" fill="#9be7ff"/></g>
</svg>`;
}
