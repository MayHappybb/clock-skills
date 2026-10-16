// calder: drawing wire. A wire is a turtle path (N headings and lengths from
// the hook); it is rebuilt each frame from the glyph, the coil and the
// hanging (swing, stretch), then stamped into a coverage buffer with
// pre-rasterised anti-aliased discs (8 x 8 sub-pixel phases), and blended
// onto the frame in its colour. Everything here is integer work on the
// device except one table sin/cos per segment.

import { sin, cos } from '../js/kit.js';
import { N, GLYPHS, coilHeadings } from './calder-font.js';

const W = 160, H = 80;
export const COV = new Uint8Array(W * H);   // 12.8 KB scratch, cleared as it is used

// ---------------------------------------------------------------- stamps (flash: 3 radii x 64 x 36 B)
function makeStamps(r) {
  const S = new Uint8Array(64 * 36);
  for (let fy = 0; fy < 8; fy++)
    for (let fx = 0; fx < 8; fx++)
      for (let j = 0; j < 6; j++)
        for (let i = 0; i < 6; i++) {
          const dx = i - 1.5 - (fx + 0.5) / 8, dy = j - 1.5 - (fy + 0.5) / 8;
          const c = r + 0.5 - Math.sqrt(dx * dx + dy * dy);
          S[(fy * 8 + fx) * 36 + j * 6 + i] = c <= 0 ? 0 : c >= 1 ? 255 : Math.round(c * 255);
        }
  return S;
}
export const STAMP_H = makeStamps(1.72);   // hours wire, 3.4 px
export const STAMP_M = makeStamps(1.5);    // minutes wire, 3.0 px
export const STAMP_T = makeStamps(0.82);   // the mobile's rods, 1.6 px

// ---------------------------------------------------------------- the wire's shape
const TMP = new Float32Array(N);
const COIL_A = new Float32Array(N), COIL_B = new Float32Array(N);
export const PITCH = 3.9, R0 = 1.9, SHRINK = 0.72;
/** The share of a numeral's wire that shows on the reel (the rest is wound inside). */
export const REEL = 0.36;

/**
 * Points of a wire into `out` (Float32Array 2 (N + 1)), canvas coordinates.
 *  d      glyph index
 *  w      0 = the numeral, 1 = the coil
 *  coil   Float32Array N of coil headings (or null when w = 0)
 *  coilL  the coil's wire length (glyph units)
 *  hx,hy  the hook; rot (rad) the swing about it; sx, sy the scale (stretch)
 * The numeral and the reel are both built as turtle paths from the hook;
 * between them the numeral shrinks toward the hook (it is being reeled in,
 * so a part-wound wire is a smaller copy of the same numeral, never another
 * one) while its points slide onto their places in the coil, swirling round
 * its centre.
 * Returns the work done (segments), for the estimate.
 */
export function wirePoints(out, d, w, coil, coilL, hx, hy, rot, sx, sy, swirl = 0.4) {
  const G = GLYPHS[d], gh = G.head, gl = G.len;
  let x = 0, y = 0;
  out[0] = 0; out[1] = 0;
  for (let i = 0; i < N; i++) {
    const a = gh[i] + rot;
    x += cos(a) * gl[i]; y += sin(a) * gl[i];
    out[2 * i + 2] = x; out[2 * i + 3] = y;
  }
  let n = N;
  if (w > 0) {
    // the coil, from the hook: heading 0 + rot at its outer end, clockwise
    const cl = coilL / N, R = Math.sqrt(R0 * R0 + (PITCH * coilL) / Math.PI);
    const ccx = -R * sin(rot), ccy = R * cos(rot);        // its centre, below the hook
    const sw = swirl * sin(Math.PI * w), cs = cos(sw), sn = sin(sw);
    // reeled in: the numeral shrinks toward the hook while its wire winds onto the reel
    const shr = 1 - SHRINK * w, cw = w * w;
    let cx = 0, cy = 0;
    for (let i = 0; i < N; i++) {
      const a = coil[i] + rot;
      cx += cos(a) * cl; cy += sin(a) * cl;
      const k = 2 * i + 2;
      const gx = out[k] * shr, gy = out[k + 1] * shr;
      let px = gx + (cx - gx) * cw - ccx, py = gy + (cy - gy) * cw - ccy;
      // swirl, stronger for the points that travel farther (the free end)
      const f = (i + 1) / N, c2 = 1 - (1 - cs) * f, s2 = sn * f;
      out[k] = ccx + px * c2 - py * s2; out[k + 1] = ccy + px * s2 + py * c2;
    }
    n += N;
  }
  for (let i = 0; i <= N; i++) { out[2 * i] = hx + out[2 * i] * sx; out[2 * i + 1] = hy + out[2 * i + 1] * sy; }
  return n;
}

/** Coil headings for length L, cached for the two lengths in use. */
const COIL_KEY = [NaN, NaN];
export function coilFor(L, slot) {
  const buf = slot ? COIL_B : COIL_A;
  if (COIL_KEY[slot] !== L) { coilHeadings(L, PITCH, R0, buf); COIL_KEY[slot] = L; }
  return buf;
}
/** A coil whose length is between two (lerp of headings, the wire being paid out). */
export function coilMix(LA, LB, u) {
  const a = coilFor(LA, 0), b = coilFor(LB, 1);
  for (let i = 0; i < N; i++) TMP[i] = a[i] + (b[i] - a[i]) * u;
  return TMP;
}

// ---------------------------------------------------------------- stamping and blending

/** A running box of what was stamped: [x0, y0, x1, y1]. */
export function newBox() { return [W, H, 0, 0]; }

/** Stamp a polyline of n + 1 points (out[0..2n+1]) into COV; grows box. Returns stamp count. */
export function stampLine(pts, n, S, box, from = 0) {
  let count = 0;
  for (let i = from; i < n; i++) {
    const x0 = pts[2 * i], y0 = pts[2 * i + 1], x1 = pts[2 * i + 2], y1 = pts[2 * i + 3];
    const dx = x1 - x0, dy = y1 - y0;
    const k = Math.max(1, Math.ceil((Math.abs(dx) > Math.abs(dy) ? Math.abs(dx) : Math.abs(dy)) * 2.2));
    for (let j = i === from ? 0 : 1; j <= k; j++) {
      const x = x0 + (dx * j) / k, y = y0 + (dy * j) / k;
      stamp(x, y, S, box);
      count++;
    }
  }
  return count;
}

export function stamp(x, y, S, box) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = ((x - ix) * 8) | 0, fy = ((y - iy) * 8) | 0;
  const bx = ix - 2, by = iy - 2, base = (fy * 8 + fx) * 36;
  for (let j = 0; j < 6; j++) {
    const yy = by + j;
    if (yy < 0 || yy >= H) continue;
    const row = yy * W;
    for (let i = 0; i < 6; i++) {
      const xx = bx + i;
      if (xx < 0 || xx >= W) continue;
      const c = S[base + j * 6 + i];
      if (c > COV[row + xx]) COV[row + xx] = c;
    }
  }
  if (bx < box[0]) box[0] = Math.max(0, bx);
  if (by < box[1]) box[1] = Math.max(0, by);
  if (bx + 6 > box[2]) box[2] = Math.min(W, bx + 6);
  if (by + 6 > box[3]) box[3] = Math.min(H, by + 6);
}

/** Blend COV over the frame in colour c (0xRRGGBB) inside box, and clear it. Returns [full, blended]. */
export function composite(buf, box, c, alpha = 256) {
  const cr = (c >> 19) & 31, cg = (c >> 10) & 63, cb = (c >> 3) & 31, full = (cr << 11) | (cg << 5) | cb;
  let nf = 0, nb = 0;
  for (let y = box[1]; y < box[3]; y++) {
    const row = y * W;
    for (let x = box[0]; x < box[2]; x++) {
      const i = row + x, a0 = COV[i];
      if (!a0) continue;
      COV[i] = 0;
      const a = alpha === 256 ? a0 : (a0 * alpha) >> 8;
      if (a === 255) { buf[i] = full; nf++; continue; }
      const d = buf[i], dr = d >> 11, dg = (d >> 5) & 63, db = d & 31;
      buf[i] = ((dr + (((cr - dr) * a + 128) >> 8)) << 11) | ((dg + (((cg - dg) * a + 128) >> 8)) << 5) | (db + (((cb - db) * a + 128) >> 8));
      nb++;
    }
  }
  return [nf, nb, (box[2] - box[0]) * (box[3] - box[1])];
}

/**
 * Stamp a polyline's shadow on the wall: each point pushed away from the
 * spotlight (up and to the left of the glass), so shadows grow and skew
 * with distance like real ones.
 */
export function stampShadow(pts, n, S, box, lx, ly, k, ox, oy) {
  let count = 0;
  for (let i = 0; i < n; i++) {
    const x0 = pts[2 * i], y0 = pts[2 * i + 1], x1 = pts[2 * i + 2], y1 = pts[2 * i + 3];
    const sx0 = x0 + (x0 - lx) * k + ox, sy0 = y0 + (y0 - ly) * k + oy;
    const sx1 = x1 + (x1 - lx) * k + ox, sy1 = y1 + (y1 - ly) * k + oy;
    const dx = sx1 - sx0, dy = sy1 - sy0;
    const m = Math.max(1, Math.ceil((Math.abs(dx) > Math.abs(dy) ? Math.abs(dx) : Math.abs(dy)) * 1.6));
    for (let j = i === 0 ? 0 : 1; j <= m; j++) { stamp(sx0 + (dx * j) / m, sy0 + (dy * j) / m, S, box); count++; }
  }
  return count;
}

export { N, GLYPHS };
