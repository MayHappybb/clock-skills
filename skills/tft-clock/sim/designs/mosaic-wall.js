// The wall for mosaic.js: the field's courses of gold tesserae (rows 3 px
// apart that swell gently, pieces of 3-5 px cut to length, joints staggered),
// the grey lime setting bed under them, and the smalti palettes. The course
// map and the beds are built once at boot (RAM).

import { rand, hash, to565, hex } from '../js/kit.js';

export const W = 160, H = 80;
export const c565 = (s) => to565(hex(s));

// ------------------------------------------------------------ the courses

/**
 * The field as courses that undulate gently, as the backgrounds of Ravenna
 * do (a mosaicist's rows are never ruled): row index from y plus a slow
 * swell, pieces cut along x, joints staggered row to row.
 */
export function waveField({ pitch = 3, len = 4 } = {}) {
  const map = new Int16Array(W * H), keys = new Map();
  const cx = [], cy = [], n = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const px = x + 0.5, py = y + 0.5;
      const sw = 2.4 * Math.sin(px * 0.045 + 0.8) + 1.3 * Math.sin(px * 0.11 + py * 0.05 + 2.1);
      const d = py + sw + 1, rn = Math.floor(d / pitch), fr = d / pitch - rn;
      const pl = 3 + (hash(rn, 9) % 3);                     // each course cut to its own length
      const fj = px / pl + rand(rn, 8) * 4, j = Math.floor(fj), fu = fj - j;
      const key = rn * 1000 + j;
      let id = keys.get(key);
      if (id === undefined) { id = keys.size; keys.set(key, id); cx.push(0); cy.push(0); n.push(0); }
      cx[id] += px; cy[id] += py; n[id]++;
      const grout = fr * pitch > pitch - 1 || fu * pl > pl - 1;
      map[y * W + x] = (id << 1) | (grout ? 1 : 0);
    }
  const N = keys.size;
  const v = new Uint8Array(N), tx = new Float32Array(N), ty = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    v[i] = hash(i, 3) & 3;
    tx[i] = (rand(i, 4) - 0.5) * 2 * rand(i, 5);
    ty[i] = (rand(i, 6) - 0.5) * 2 * rand(i, 7);
  }
  return { n: N, map, cx: Float32Array.from(cx, (s, i) => s / n[i]), cy: Float32Array.from(cy, (s, i) => s / n[i]), v, tx, ty };
}
export const field = waveField();

// ------------------------------------------------------------ the setting bed

export const BED = new Uint16Array(W * H), BED_NIGHT = new Uint16Array(W * H);
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    // grey lime, trowelled: a faint diagonal drag and grit
    const n = rand(x, y, 21) * 10 + ((x + 2 * y) % 7 === 0 ? -6 : 0) + rand(x >> 2, y >> 2, 22) * 6;
    const k = 132 + n;
    BED[y * W + x] = to565((Math.round(k + 4) << 16) | (Math.round(k) << 8) | Math.round(k - 10));
    const kn = 0.48 * k;   // by candlelight the lime is a warm dark grey
    BED_NIGHT[y * W + x] = to565((Math.round(kn + 8) << 16) | (Math.round(kn + 2) << 8) | Math.round(kn - 6));
  }

// ------------------------------------------------------------ smalti

const L = (arr) => Uint16Array.from(arr, c565);
export const PAL = {
  day: {
    gold: L(['#5c3c0c', '#8a6018', '#a87e24', '#c29a32', '#d6b040', '#ead060', '#fbe896', '#fffbe2']),
    groutGold: c565('#6a4c18'),
    centre: L(['#17296c', '#1a3078']),
    body: L(['#2a4aa2', '#2f54ae', '#26449a']),
    key: L(['#0b0e22', '#10142c']),
    pearl: L(['#f2ece0', '#e8e0cc', '#faf6ec']),
    groutLapis: c565('#0e1636'), groutPearl: c565('#8c7c5c'),
    flash: c565('#fff8e0'),
    sinopia: hex('#b2462a'),
  },
  night: {
    gold: L(['#2a1408', '#3e1e0a', '#5a3010', '#7a4818', '#a06a24', '#c88c34', '#eab452', '#ffe2a0']),
    groutGold: c565('#2c1a0a'),
    centre: L(['#2a48a8', '#2e4eb2']),
    body: L(['#4a72d0', '#5078d8', '#446ac6']),
    key: L(['#080a18', '#0c1020']),
    pearl: L(['#e8dcc0', '#dcd0b0', '#f0e6cc']),
    groutLapis: c565('#0a1030'), groutPearl: c565('#6c5c40'),
    flash: c565('#ffe8b0'),
    sinopia: hex('#a8442a'),
  },
};
