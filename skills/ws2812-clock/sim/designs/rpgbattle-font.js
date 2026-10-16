// Type for rpgbattle.
//  - DAMAGE: the minutes. A fat, round, slightly italic damage-number face,
//    white-hot at the top cooling to gold, with a lit orange keyline and a
//    black moat: the numbers that pop off a monster in a 16-bit JRPG.
//    Centre lines in a 9 x 17 box, stroke radius 2.35, keyline 1.15.
//  - MENU: a tiny 5-row caps face for the window chrome (never the time).
import { W, H, img } from './rpgbattle-gfx.js';

const arc = (cx, cy, rx, ry, a0, a1, n = 28) => {
  const p = [];
  for (let k = 0; k <= n; k++) { const a = (a0 + (a1 - a0) * (k / n)) * Math.PI / 180; p.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]); }
  return p;
};
const ellipseP = (cx, cy, rx, ry) => arc(cx, cy, rx, ry, 0, 360, 40);
// y runs down; angles in degrees, 0 = right, 90 = down
const SK = {
  0: [ellipseP(4.5, 8.5, 4.3, 8.3)],
  1: [[[1.2, 3.6], [5.2, 0.2], [5.2, 17]], [[1.6, 17], [8.8, 17]]],
  2: [[...arc(4.5, 4.4, 4.3, 4.2, 165, 385), [0.2, 17], [9, 17]]],
  3: [[...arc(4.4, 4.2, 4.1, 4.0, 195, 450)], [...arc(4.6, 12.6, 4.4, 4.4, -90, 165)], [[2.4, 8.3], [4.5, 8.3]]],
  4: [[[6.6, 17], [6.6, 0.2], [0, 11.6], [9.2, 11.6]]],
  5: [[[8.6, 0.2], [1.2, 0.2], [0.6, 7.4]], arc(4.5, 12.0, 4.4, 5.0, -128, 165)],
  6: [[...arc(4.7, 9, 4.6, 8.8, 300, 180)], ellipseP(4.6, 12.4, 4.4, 4.6), [[0.1, 9], [0.15, 12.4]]],
  7: [[[0, 0.2], [9, 0.2], [6.2, 7], [3.6, 17]]],
  8: [ellipseP(4.5, 4.2, 3.8, 4.0), ellipseP(4.5, 12.5, 4.5, 4.5)],
  9: null,
};
SK[9] = SK[6].map((st) => st.map(([x, y]) => [9.2 - x, 17 - y]));
// segments per digit, flat
const SEG = {};
for (const k in SK) {
  const a = [];
  for (const st of SK[k]) for (let i = 0; i + 1 < st.length; i++) a.push(st[i][0], st[i][1], st[i + 1][0], st[i + 1][1]);
  SEG[k] = new Float32Array(a);
}
export const DMG = { w: 9, h: 17, r: 2.35, ring: 1.15, adv: 15.5, slant: 0.13 };

const lin = (h) => { const n = parseInt(h.slice(1), 16), f = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return [f(n >> 16), f((n >> 8) & 255), f(n & 255)]; };
const TOP = lin('#fffbe8'), MID = lin('#ffd23c'), BOT = lin('#ff9a1a'), RING = lin('#e0300c'), HOT = lin('#ffffff');

/**
 * One damage digit. (x, y) = top-left of the glyph box in pixels (sub-pixel),
 * sc its scale, sy an extra vertical squash (1 = none, <1 squashed, kept on
 * the baseline), a opacity, flash 0..1 to white.
 */
export function damageDigit(dg, x, y, sc, sy, a, flash = 0) {
  const sg = SEG[dg], R = DMG.r, RR = R + DMG.ring, sl = DMG.slant;
  const hx = sc, hy = sc * sy;
  const pad = RR + 2.2;
  const X0 = Math.max(0, Math.floor(x - pad * hx)), X1 = Math.min(W - 1, Math.ceil(x + (DMG.w + pad + DMG.h * sl) * hx));
  const Y0 = Math.max(0, Math.floor(y + (DMG.h * (1 - sy)) * sc - pad * hy)), Y1 = Math.min(H - 1, Math.ceil(y + DMG.h * sc + pad * hy));
  const n = sg.length;
  for (let py = Y0; py <= Y1; py++) {
    // to glyph space: undo the squash about the baseline, then the slant
    const gy = DMG.h - (y + DMG.h * sc - py) / hy;
    const shx = (DMG.h - gy) * sl;
    for (let px = X0; px <= X1; px++) {
      const gx = (px - x) / hx - shx;
      let dm = 1e9;
      for (let i = 0; i < n; i += 4) {
        const ax = sg[i], ay = sg[i + 1], ex = sg[i + 2] - ax, ey = sg[i + 3] - ay;
        let t = ((gx - ax) * ex + (gy - ay) * ey) / (ex * ex + ey * ey || 1e-9);
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const dx = gx - ax - t * ex, dy = gy - ay - t * ey, d2 = dx * dx + dy * dy;
        if (d2 < dm) dm = d2;
      }
      const d = (Math.sqrt(dm) - RR) * sc;              // distance outside the keyline, in px
      if (d > 2.2) continue;
      const o = 3 * (py * W + px);
      // moat
      const m = d < 0.4 ? 1 : 1 - (d - 0.4) / 1.8, k = 1 - 0.95 * m * a;
      img[o] *= k; img[o + 1] *= k; img[o + 2] *= k;
      if (d >= 0.5) continue;
      const cov = (d < -0.5 ? 1 : 0.5 - d) * a;
      const di = Math.sqrt(dm) - R;                     // < 0 inside the fill (glyph units)
      let c;
      if (di > 0) c = RING;
      else {
        const v = gy / DMG.h, f = v < 0.45 ? v / 0.45 : (v - 0.45) / 0.55;
        const A = v < 0.45 ? TOP : MID, B = v < 0.45 ? MID : BOT;
        // a soft inner bevel: the stroke's spine is hottest
        const core = Math.min(1, -di / R);
        c = [A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f, A[2] + (B[2] - A[2]) * f];
        const kk = 0.78 + 0.22 * core;
        c = [c[0] * kk, c[1] * kk, c[2] * kk];
        const ri = di > -0.55 ? (di + 0.55) / 0.55 : 0;        // inner edge blends to the ring
        c = [c[0] + (RING[0] - c[0]) * ri * 0.6, c[1] + (RING[1] - c[1]) * ri * 0.6, c[2] + (RING[2] - c[2]) * ri * 0.6];
      }
      if (flash > 0) c = [c[0] + (HOT[0] - c[0]) * flash, c[1] + (HOT[1] - c[1]) * flash, c[2] + (HOT[2] - c[2]) * flash];
      img[o] += (c[0] - img[o]) * cov; img[o + 1] += (c[1] - img[o + 1]) * cov; img[o + 2] += (c[2] - img[o + 2]) * cov;
    }
  }
}

// ------------------------------------------------------------------ menu
const M = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'], C: ['.##', '#..', '#..', '#..', '.##'], D: ['##.', '#.#', '#.#', '#.#', '##.'],
  E: ['###', '#..', '##.', '#..', '###'], F: ['###', '#..', '##.', '#..', '#..'], G: ['.##', '#..', '#.#', '#.#', '.##'],
  H: ['#.#', '#.#', '###', '#.#', '#.#'], I: ['###', '.#.', '.#.', '.#.', '###'], K: ['#.#', '#.#', '##.', '#.#', '#.#'],
  L: ['#..', '#..', '#..', '#..', '###'], M: ['#...#', '##.##', '#.#.#', '#...#', '#...#'], N: ['#..#', '##.#', '#.##', '#..#', '#..#'],
  O: ['.#.', '#.#', '#.#', '#.#', '.#.'], P: ['##.', '#.#', '##.', '#..', '#..'], R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['.##', '#..', '.#.', '..#', '##.'], T: ['###', '.#.', '.#.', '.#.', '.#.'], U: ['#.#', '#.#', '#.#', '#.#', '.#.'],
  W: ['#...#', '#...#', '#.#.#', '##.##', '#...#'], X: ['#.#', '#.#', '.#.', '#.#', '#.#'], Y: ['#.#', '#.#', '.#.', '.#.', '.#.'],
  Z: ['###', '..#', '.#.', '#..', '###'], V: ['#.#', '#.#', '#.#', '.#.', '.#.'], B: ['##.', '#.#', '##.', '#.#', '##.'],
  '!': ['#', '#', '#', '.', '#'], ' ': ['..'],
};
/** Menu text at integer (x, y), colour c, alpha a. Returns the end x. */
export function menuText(str, x, y, c, a = 1) {
  for (const ch of str) {
    const g = M[ch] || M[' '];
    for (let j = 0; j < g.length; j++) for (let i = 0; i < g[j].length; i++) {
      if (g[j][i] !== '#') continue;
      const X = x + i, Y = y + j;
      if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
      const o = 3 * (Y * W + X);
      img[o] += (c[0] - img[o]) * a; img[o + 1] += (c[1] - img[o + 1]) * a; img[o + 2] += (c[2] - img[o + 2]) * a;
    }
    x += g[0].length + 1;
  }
  return x;
}
export function menuWidth(str) { let w = 0; for (const ch of str) w += (M[ch] || M[' '])[0].length + 1; return w - 1; }
