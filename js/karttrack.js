// Quiz Kart Rally: the race track, shared by the projector (top-down map) and the iPads (3D-ish view).
// The track is a smooth loop through control points in a 1024 x 1024 world. Everything (road, curbs,
// grass, start line, boost pads) is drawn from code into one texture.
export const WORLD = 1024, ROAD_W = 44;

const CONTROL = [
  [512, 880], [260, 872], [150, 760], [160, 570], [290, 480], [280, 340], [185, 240], [255, 130], [455, 135],
  [560, 255], [700, 200], [858, 150], [905, 320], [785, 430], [820, 565], [905, 705], [835, 862], [680, 892],
];

// Closed Catmull-Rom spline, sampled about every 4 pixels.
function spline(pts) {
  const out = [], n = pts.length;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]), steps = Math.max(4, Math.round(len / 4));
    for (let s = 0; s < steps; s++) {
      const t = s / steps, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  return out;
}

const rgba = (hex, a = 255) => { const n = parseInt(hex.slice(1), 16); return ((a << 24) | ((n & 255) << 16) | (((n >> 8) & 255) << 8) | (n >> 16)) >>> 0; };
function prng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

let cached = null;
export function buildTrack() {
  if (cached) return cached;
  const pts = spline(CONTROL), N = pts.length;
  const dirs = pts.map((p, i) => { const q = pts[(i + 1) % N]; const d = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1; return [(q[0] - p[0]) / d, (q[1] - p[1]) / d]; });
  const at = f => Math.floor(((f % 1) + 1) % 1 * N);
  const T = {
    W: WORLD, pts, dirs, N,
    startAngle: Math.atan2(dirs[0][1], dirs[0][0]),
    // item boxes: three across the road; boost pads: in the middle of the road
    boxes: [0.17, 0.5, 0.83].flatMap(f => { const i = at(f), [x, y] = pts[i], [dx, dy] = dirs[i]; return [-13, 0, 13].map(o => ({ x: x - dy * o, y: y + dx * o })); }),
    pads: [0.32, 0.68, 0.93].map(f => { const i = at(f); return { x: pts[i][0], y: pts[i][1], a: Math.atan2(dirs[i][1], dirs[i][0]) }; }),
  };

  // ----- ground: 0 grass, 1 road, 2 curb -----
  const mask = new Uint8Array(WORLD * WORLD), tex = new Uint32Array(WORLD * WORLD), r = prng(7);
  const G1 = rgba('#5aa245'), G2 = rgba('#529a3e'), ROAD = [rgba('#5d5a66'), rgba('#575460'), rgba('#63606c')], CURB_R = rgba('#d63c3c'), CURB_W = rgba('#f4f1de');
  for (let y = 0; y < WORLD; y++) for (let x = 0; x < WORLD; x++) tex[y * WORLD + x] = ((x >> 5) + (y >> 5)) % 2 ? G1 : G2;
  const stamp = (cx, cy, rad, fn) => {
    for (let y = Math.max(0, Math.floor(cy - rad)); y <= Math.min(WORLD - 1, cy + rad); y++) for (let x = Math.max(0, Math.floor(cx - rad)); x <= Math.min(WORLD - 1, cx + rad); x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= rad * rad) fn(x, y);
    }
  };
  pts.forEach(([cx, cy], i) => stamp(cx, cy, ROAD_W / 2 + 4, (x, y) => { const k = y * WORLD + x; if (mask[k] !== 1) { mask[k] = 2; tex[k] = (i >> 2) % 2 ? CURB_R : CURB_W; } }));
  pts.forEach(([cx, cy]) => stamp(cx, cy, ROAD_W / 2, (x, y) => { const k = y * WORLD + x; mask[k] = 1; tex[k] = ROAD[r() * 3 | 0]; }));
  // dashed centre line
  pts.forEach(([cx, cy], i) => { if (i % 10 < 5) stamp(cx, cy, 1.2, (x, y) => { tex[y * WORLD + x] = rgba('#e9e4c9'); }); });
  // checkered start/finish line across the road
  { const [x0, y0] = pts[0], [dx, dy] = dirs[0];
    for (let o = -ROAD_W / 2; o <= ROAD_W / 2; o += 1) for (let a = -3; a < 5; a++) {
      const x = Math.round(x0 - dy * o + dx * a), y = Math.round(y0 + dx * o + dy * a);
      if (x >= 0 && y >= 0 && x < WORLD && y < WORLD) tex[y * WORLD + x] = ((Math.floor(o / 4) + Math.floor((a + 4) / 4)) % 2) ? rgba('#111111') : rgba('#ffffff');
    } }
  // boost pads: yellow chevrons
  for (const p of T.pads) {
    const ca = Math.cos(p.a), sa = Math.sin(p.a);
    for (let u = -9; u <= 9; u++) for (let w = -9; w <= 9; w++) {
      const x = Math.round(p.x + ca * u - sa * w), y = Math.round(p.y + sa * u + ca * w);
      const chev = ((u + Math.abs(w) * 0.8) % 6 + 6) % 6 < 3;
      tex[y * WORLD + x] = chev ? rgba('#ffd23f') : rgba('#ff7b00');
    }
  }
  // scenery off the road: trees and flowers on the grass texture, plus trees standing up in 3D
  const nearRoad = (x, y, d) => { for (let i = 0; i < N; i += 3) if ((pts[i][0] - x) ** 2 + (pts[i][1] - y) ** 2 < d * d) return true; return false; };
  T.trees = [];
  for (let k = 0; k < 260 && T.trees.length < 70; k++) {
    const x = 30 + r() * (WORLD - 60), y = 30 + r() * (WORLD - 60);
    if (!nearRoad(x, y, ROAD_W / 2 + 26)) T.trees.push({ x, y, kind: r() < 0.5 ? 0 : 1 });
  }
  for (let k = 0; k < 2500; k++) { const x = r() * WORLD | 0, y = r() * WORLD | 0; if (!mask[y * WORLD + x]) tex[y * WORLD + x] = [rgba('#ffffff'), rgba('#ffd23f'), rgba('#e85d75'), rgba('#6cc26f')][r() * 4 | 0]; }

  Object.assign(T, { mask, tex });
  // nearest point on the centre line (search near a hint first: karts don't teleport)
  T.nearest = (x, y, hint = -1) => {
    let best = -1, bd = Infinity;
    const scan = (from, to) => { for (let j = from; j <= to; j++) { const i = ((j % N) + N) % N, d = (pts[i][0] - x) ** 2 + (pts[i][1] - y) ** 2; if (d < bd) { bd = d; best = i; } } };
    if (hint >= 0) scan(hint - 30, hint + 30);
    if (hint < 0 || bd > 60 * 60) scan(0, N - 1);
    return best;
  };
  T.surface = (x, y) => { const xi = x | 0, yi = y | 0; return xi < 0 || yi < 0 || xi >= WORLD || yi >= WORLD ? 0 : mask[yi * WORLD + xi]; };
  // starting grid: two columns behind the line
  T.gridSpot = n => { const row = Math.floor(n / 2), col = n % 2 ? 9 : -9, [x, y] = pts[0], [dx, dy] = dirs[0];
    return { x: x - dx * (14 + row * 16) - dy * col, y: y - dy * (14 + row * 16) + dx * col, a: T.startAngle }; };
  cached = T;
  return T;
}

// Paint the whole track onto a canvas (projector map).
export function paintTrack(canvas, scale = 1) {
  const T = buildTrack();
  canvas.width = WORLD * scale; canvas.height = WORLD * scale;
  const ctx = canvas.getContext('2d');
  const img = new ImageData(new Uint8ClampedArray(T.tex.buffer.slice(0)), WORLD, WORLD);
  if (scale === 1) ctx.putImageData(img, 0, 0);
  else { const c = document.createElement('canvas'); c.width = WORLD; c.height = WORLD; c.getContext('2d').putImageData(img, 0, 0); ctx.imageSmoothingEnabled = false; ctx.drawImage(c, 0, 0, WORLD * scale, WORLD * scale); }
  // trees seen from above
  for (const t of T.trees) {
    ctx.fillStyle = '#2f6b2a'; ctx.beginPath(); ctx.arc(t.x * scale, t.y * scale, 9 * scale, 0, 7); ctx.fill();
    ctx.fillStyle = t.kind ? '#58a845' : '#3f8a35'; ctx.beginPath(); ctx.arc((t.x - 2) * scale, (t.y - 2) * scale, 6 * scale, 0, 7); ctx.fill();
  }
  return T;
}
