// Tiny synthesized sound effects (no audio files needed).
import { load, save } from './common.js';

let ctx = null;
let muted = load('cq_muted', false);
let lastHit = 0;

export const isMuted = () => muted;
export function setMuted(m) { muted = m; save('cq_muted', m); }

function tone(freq, dur, { type = 'square', vol = 0.08, at = 0, to = null } = {}) {
  const t0 = ctx.currentTime + at;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t0); o.stop(t0 + dur + 0.02);
}

export function sfx(kind) {
  if (muted) return;
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    switch (kind) {
      case 'hit': {
        const now = performance.now();
        if (now - lastHit < 70) return;
        lastHit = now;
        tone(320 + Math.random() * 120, 0.12, { to: 90, vol: 0.07 });
        break;
      }
      case 'join': tone(660, 0.08, { type: 'triangle', vol: 0.1 }); tone(990, 0.1, { type: 'triangle', vol: 0.1, at: 0.07 }); break;
      case 'tick': tone(880, 0.05, { type: 'sine', vol: 0.06 }); break;
      case 'start': [262, 330, 392, 523].forEach((f, i) => tone(f, 0.16, { type: 'triangle', vol: 0.1, at: i * 0.09 })); break;
      case 'roar': tone(140, 0.7, { type: 'sawtooth', vol: 0.09, to: 55 }); break;
      case 'heal': tone(523, 0.15, { type: 'sine', vol: 0.08 }); tone(784, 0.25, { type: 'sine', vol: 0.08, at: 0.1 }); break;
      case 'win': [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0.22, { type: 'triangle', vol: 0.11, at: i * 0.12 })); break;
      case 'lose': [392, 330, 262, 196].forEach((f, i) => tone(f, 0.3, { type: 'triangle', vol: 0.1, at: i * 0.18 })); break;
      case 'good': tone(784, 0.1, { type: 'triangle', vol: 0.1 }); tone(1175, 0.18, { type: 'triangle', vol: 0.1, at: 0.08 }); break;
      case 'bad': tone(220, 0.25, { type: 'sawtooth', vol: 0.06, to: 150 }); break;
    }
  } catch { /* audio not available */ }
}
