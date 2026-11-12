// Chiptune sound effects, synthesized live (no audio files).
// Channels like an old game console: pulse (square) waves with different widths,
// a triangle wave for bass, and a noise channel for hits and explosions.
// All melodies here are original.
import { load, save } from './common.js';

let ctx = null, master = null, noiseBuf = null;
const waves = {};
let muted = load('cq_muted', false);
let lastHit = 0;

export const isMuted = () => muted;
export function setMuted(m) { muted = m; save('cq_muted', m); }

// note name → frequency, e.g. 'C5', 'F#4'
const SEMI = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
const hz = n => { const m = /^([A-G]#?)(\d)$/.exec(n); return 440 * Math.pow(2, (SEMI[m[1]] + (+m[2] + 1) * 12 - 69) / 12); };

function init() {
  if (ctx) return;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);
  // Pulse waves: duty 12.5%, 25%, 50%
  for (const [name, d] of [['p12', 0.125], ['p25', 0.25], ['p50', 0.5]]) {
    const N = 48, re = new Float32Array(N), im = new Float32Array(N);
    for (let n = 1; n < N; n++) { re[n] = Math.sin(2 * Math.PI * n * d) / (Math.PI * n); im[n] = (1 - Math.cos(2 * Math.PI * n * d)) / (Math.PI * n); }
    waves[name] = ctx.createPeriodicWave(re, im);
  }
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  // Stepped noise (held samples) sounds crunchier, like old hardware.
  let v = 0;
  for (let i = 0; i < data.length; i++) { if (i % 4 === 0) v = Math.random() * 2 - 1; data[i] = v; }
}

// Volume envelope in coarse steps, the way old sound chips faded notes out.
function steppedEnv(gain, t0, dur, vol, steps = 8) {
  gain.gain.setValueAtTime(vol, t0);
  for (let i = 1; i <= steps; i++) gain.gain.setValueAtTime(vol * (1 - i / steps) ** 1.5 + 0.0001, t0 + (dur * i) / steps);
}

function tone(freq, at, dur, { wave = 'p50', vol = 0.12, to = null, vib = 0, hold = false } = {}) {
  const t0 = ctx.currentTime + at;
  const o = ctx.createOscillator(), g = ctx.createGain();
  if (wave === 'tri') o.type = 'triangle'; else o.setPeriodicWave(waves[wave]);
  o.frequency.setValueAtTime(freq, t0);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  if (vib) {
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.frequency.value = 7; lg.gain.value = vib;
    lfo.connect(lg).connect(o.frequency); lfo.start(t0); lfo.stop(t0 + dur + 0.05);
  }
  if (hold) { g.gain.setValueAtTime(vol, t0); g.gain.setValueAtTime(0.0001, t0 + dur); }
  else steppedEnv(g, t0, dur, vol);
  o.connect(g).connect(master);
  o.start(t0); o.stop(t0 + dur + 0.05);
}

function noise(at, dur, { vol = 0.15, rate = 1, to = null, cutoff = 6000 } = {}) {
  const t0 = ctx.currentTime + at;
  const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = noiseBuf; src.loop = true;
  src.playbackRate.setValueAtTime(rate, t0);
  if (to) src.playbackRate.exponentialRampToValueAtTime(to, t0 + dur);
  f.type = 'lowpass'; f.frequency.value = cutoff;
  steppedEnv(g, t0, dur, vol, 6);
  src.connect(f).connect(g).connect(master);
  src.start(t0); src.stop(t0 + dur + 0.05);
}

// Plays a list of [note, beats] at a tempo. '-' is a rest.
function melody(notes, { at = 0, beat = 0.1, ...opts } = {}) {
  let t = at;
  for (const [n, b] of notes) { if (n !== '-') tone(hz(n), t, beat * b * 0.95, opts); t += beat * b; }
  return t;
}

const SFX = {
  join() { tone(hz('B5'), 0, 0.06, { wave: 'p25', vol: 0.1, hold: true }); tone(hz('E6'), 0.06, 0.3, { wave: 'p25', vol: 0.1 }); },
  tick() { tone(hz('A6'), 0, 0.04, { wave: 'p50', vol: 0.06, hold: true }); },
  start() { melody([['C5', 1], ['E5', 1], ['G5', 1], ['C6', 2]], { beat: 0.05, wave: 'p25', vol: 0.1 }); },
  hit() {
    const now = performance.now();
    if (now - lastHit < 60) return;
    lastHit = now;
    noise(0, 0.09, { vol: 0.16, rate: 0.9 + Math.random() * 0.4, cutoff: 5000 });
    tone(330 + Math.random() * 80, 0, 0.09, { wave: 'p50', vol: 0.06, to: 90 });
  },
  crit() {
    lastHit = 0; SFX.hit();
    tone(hz('C7'), 0.02, 0.05, { wave: 'p12', vol: 0.08, hold: true });
    tone(hz('G7'), 0.07, 0.12, { wave: 'p12', vol: 0.08 });
  },
  warning() { for (let i = 0; i < 6; i++) tone(i % 2 ? 660 : 880, i * 0.13, 0.12, { wave: 'p50', vol: 0.09, hold: true }); },
  roar() {
    noise(0, 0.8, { vol: 0.18, rate: 0.5, to: 0.15, cutoff: 1800 });
    tone(220, 0, 0.8, { wave: 'p50', vol: 0.08, to: 50, vib: 12 });
  },
  reveal() { tone(hz('A5'), 0, 0.08, { wave: 'p25', vol: 0.09, hold: true }); tone(hz('E6'), 0.08, 0.25, { wave: 'p25', vol: 0.09 }); },
  heal() { melody([['C5', 1], ['E5', 1], ['G5', 1], ['C6', 1], ['E6', 3]], { beat: 0.06, wave: 'tri', vol: 0.16 }); tone(hz('G6'), 0.2, 0.2, { wave: 'p12', vol: 0.05 }); },
  bad() { tone(hz('E4'), 0, 0.15, { wave: 'p50', vol: 0.08, hold: true }); tone(hz('C4'), 0.16, 0.35, { wave: 'p50', vol: 0.08, vib: 6 }); },
  explode() {
    for (let i = 0; i < 5; i++) noise(i * 0.22, 0.35, { vol: 0.2, rate: 0.7 - i * 0.1, to: 0.1, cutoff: 3000 });
    tone(880, 0, 1.2, { wave: 'p50', vol: 0.06, to: 40 });
  },
  win() {
    const lead = [['E5', 1], ['G5', 1], ['C6', 2], ['B5', 1], ['C6', 1], ['D6', 1], ['E6', 4], ['-', 1], ['D6', 1], ['E6', 1], ['G6', 6]];
    const end = melody(lead, { beat: 0.11, wave: 'p25', vol: 0.1 });
    melody([['C3', 4], ['G3', 4], ['A3', 4], ['G3', 2], ['C4', 6]], { beat: 0.11, wave: 'tri', vol: 0.2 });
    melody([['C5', 4], ['E5', 4], ['F5', 4], ['D5', 2], ['E5', 6]], { beat: 0.11, wave: 'p12', vol: 0.05 });
    return end;
  },
  lose() {
    melody([['G4', 2], ['F#4', 2], ['F4', 2], ['E4', 6]], { beat: 0.16, wave: 'p50', vol: 0.09, vib: 5 });
    melody([['C3', 6], ['B2', 6]], { beat: 0.16, wave: 'tri', vol: 0.18 });
  },
};

export function sfx(kind) {
  if (muted || !SFX[kind]) return;
  try {
    init();
    if (ctx.state === 'suspended') ctx.resume();
    SFX[kind]();
  } catch { /* audio not available */ }
}
