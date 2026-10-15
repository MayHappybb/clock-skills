// Effects of "nouveau" drawn on top of the poster: the loose strands of a
// lock in the minute turn, lily petals on the gusts, and the hour's lilies.
//
// Strands: a changing lock frays into five fibres (its own centre line at
// five offsets across its width); the breeze lifts them into big waves, and
// as they wave each fibre's points slide from the old numeral's centre line
// to the new one's (matched by fraction of length), then the waves die down
// on the new numeral and the lock fills in round them. Every point is a
// bilinear splat (four integer blends), derived in closed form from u.

import { sin } from '../js/kit.js';
import { W, H } from './nouveau-poster.js';

/** Integer blend of two RGB565 values, a in 0..256. */
export function blend565(d, s, a) {
  const dr = d >> 11, dg = (d >> 5) & 63, db = d & 31, sr = s >> 11, sg = (s >> 5) & 63, sb = s & 31;
  return ((((dr * (256 - a) + sr * a) >> 8) << 11) | (((dg * (256 - a) + sg * a) >> 8) << 5) | ((db * (256 - a) + sb * a) >> 8));
}

function splat(buf, x, y, c, a) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  if (ix < 1 || iy < 1 || ix >= W - 2 || iy >= H - 2) return;
  const i = iy * W + ix;
  const w00 = ((1 - fx) * (1 - fy) * a) | 0, w10 = (fx * (1 - fy) * a) | 0, w01 = ((1 - fx) * fy * a) | 0, w11 = (fx * fy * a) | 0;
  if (w00 > 4) buf[i] = blend565(buf[i], c, w00);
  if (w10 > 4) buf[i + 1] = blend565(buf[i + 1], c, w10);
  if (w01 > 4) buf[i + W] = blend565(buf[i + W], c, w01);
  if (w11 > 4) buf[i + W + 1] = blend565(buf[i + W + 1], c, w11);
}

const sm = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const OFFS = [-2.2, -1.1, 0, 1.1, 2.2];

/**
 * The fibres of one changing lock at turn progress u (0..1).
 * ga, gb: old and new glyphs; (bx, by) the glyph box origin; side: -1 left of the muse, +1 right.
 * cols: RGB565 for the fibres [dark, mid, light]. Returns the work done.
 */
export function strands(g, ga, gb, bx, by, u, s, side, cols) {
  const fade = sm(u / 0.1) * (1 - sm((u - 0.84) / 0.13));
  if (fade <= 0) return 0;
  const lift = sm((u - 0.06) / 0.3) * (1 - sm((u - 0.6) / 0.32));
  const b = sm((u - 0.36) / 0.28);
  const buf = g.buf, np = Math.max(ga.n, gb.n);
  let ops = 0;
  for (let j = 0; j < 5; j++) {
    const o = OFFS[j] * (1 + 0.8 * lift), c = cols[j === 2 ? 2 : j & 1], ph = j * 1.3 + side;
    const a = Math.round(220 * fade);
    for (let p = 0; p < np; p++) {
      const fr = p / (np - 1);
      const ka = fr * (ga.n - 1), ia = ka | 0, ta = ka - ia, ja = Math.min(ga.n - 1, ia + 1);
      const kb = fr * (gb.n - 1), ib = kb | 0, tb = kb - ib, jb = Math.min(gb.n - 1, ib + 1);
      const ax = ga.x[ia] + (ga.x[ja] - ga.x[ia]) * ta + ga.nx[ia] * o, ay = ga.y[ia] + (ga.y[ja] - ga.y[ia]) * ta + ga.ny[ia] * o;
      const cx = gb.x[ib] + (gb.x[jb] - gb.x[ib]) * tb + gb.nx[ib] * o, cy = gb.y[ib] + (gb.y[jb] - gb.y[ib]) * tb + gb.ny[ib] * o;
      // the breeze: big waves across each fibre, and a drift away from the muse and upward
      const wv = lift * 6.5 * sin(fr * 11 + ph - s * 7.5), wv2 = lift * 3.5 * sin(fr * 5.3 - ph * 0.7 + s * 4.1);
      const x = bx + ax + (cx - ax) * b + wv + side * lift * 4 * fr;
      const y = by + ay + (cy - ay) * b + wv2 - lift * 3 * sin(fr * 3.14);
      splat(buf, x, y, c, a);
    }
    ops += np * 40;
  }
  return ops;
}

// ------------------------------------------------------------ petals on the gusts

/** A few lily petals blown across the poster during a gust that began at t0 (s since). */
export function petals(g, t, k, cols) {
  if (t < 0 || t > 3.4) return 0;
  const buf = g.buf;
  let ops = 0;
  for (let p = 0; p < 5; p++) {
    const st = p * 0.28, tt = t - st;
    if (tt < 0 || tt > 2.8) continue;
    const dir = (k + p) & 1 ? 1 : -1;
    // from the muse's head outward, sinking as it goes
    const x = 80 + dir * (6 + tt * 30), y = 18 + p * 7 + tt * 4 + 3 * sin(tt * 4 + p);
    if (x < 6 || x > W - 7) continue;
    const flip = sin(tt * 6 + p) > 0;
    const xi = Math.round(x), yi = Math.round(y);
    for (let dy = 0; dy < 3; dy++)
      for (let dx = 0; dx < 4; dx++) {
        const m = flip ? PET_A[dy * 4 + dx] : PET_B[dy * 4 + dx];
        if (!m) continue;
        const xx = xi + dx, yy = yi + dy;
        if (xx < 5 || yy < 5 || xx > W - 6 || yy > H - 6) continue;
        buf[yy * W + xx] = cols[m - 1];
      }
    ops += 30;
  }
  return ops;
}
// 1 = outline, 2 = petal white
const PET_A = [0, 1, 1, 0, 1, 2, 2, 1, 0, 1, 1, 0];
const PET_B = [1, 1, 0, 0, 1, 2, 1, 0, 0, 1, 1, 1];

// ------------------------------------------------------------ lilies

/**
 * A Madonna lily on its stem, rising from the bottom of the frame to (x, y).
 * open 0 (a closed bud pointing up) .. 1 (six petals spread as a star).
 * sway leans the stem; cols: { out, white, leaf, stamen } as 0xRRGGBB.
 */
export function lily(g, x, y, open, sway, cols) {
  const fx = x + sway, base = 76;
  // stem and a leaf
  g.thickLine(x, base, fx, y + 2, 2.6, cols.out, { aa: true });
  g.thickLine(x, base, fx, y + 2, 1.2, cols.leaf, { aa: true });
  const lx = x + (fx - x) * 0.4, ly = base - (base - y) * 0.4;
  g.fillPolygon([[lx, ly], [lx - 5 + sway * 0.3, ly - 5], [lx - 6 + sway * 0.4, ly - 2]], cols.out, { aa: true });
  g.fillPolygon([[lx - 0.6, ly - 0.6], [lx - 4.6 + sway * 0.3, ly - 4.3], [lx - 5.2 + sway * 0.4, ly - 2.2]], cols.leaf, { aa: true });
  // six petals: from a bud (all up, short) to a star
  const len = 2.6 + 2.4 * open;
  for (let p = 0; p < 6; p++) {
    const full = (p * Math.PI) / 3 + Math.PI / 6, bud = -Math.PI / 2 + (p - 2.5) * 0.12;
    let a = bud + (full - bud) * open;
    if (open > 0 && p >= 3) a = bud + (full - bud) * open;
    const ex = fx + Math.cos(a) * len, ey = y + Math.sin(a) * len - (1 - open) * 1.5;
    g.thickLine(fx, y, ex, ey, 3.2, cols.out, { aa: true });
  }
  for (let p = 0; p < 6; p++) {
    const full = (p * Math.PI) / 3 + Math.PI / 6, bud = -Math.PI / 2 + (p - 2.5) * 0.12;
    const a = bud + (full - bud) * open;
    const ex = fx + Math.cos(a) * len, ey = y + Math.sin(a) * len - (1 - open) * 1.5;
    g.thickLine(fx, y, ex, ey, 1.7, cols.white, { aa: true });
  }
  if (open > 0.3) g.fillCircle(fx, y, 1.1 * open, cols.stamen, { aa: true });
}

// her eyes: closed lids at rest; open (teal irises) through the hour's bloom
export function eyes(g, open, cols) {
  const P = (x, y, c) => g.pixel(x, y, c);
  for (const ex of [75, 82]) {
    // clear the closed lid
    if (open) {
      P(ex + 1, 30, cols.skin); P(ex + 2, 30, cols.skin);
      P(ex, 29, cols.out); P(ex + 1, 28, cols.out); P(ex + 2, 28, cols.out); P(ex + 3, 29, cols.out);
      P(ex + 1, 29, cols.iris); P(ex + 2, 29, cols.iris);
    }
  }
}
