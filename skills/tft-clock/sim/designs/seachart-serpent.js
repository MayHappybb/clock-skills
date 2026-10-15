// One sea serpent, drawn into the face's material map from its glyph's
// distance table (seachart-glyphs.js). Per frame the body's centre line is
// displaced across itself by a travelling wave and its radius swells with a
// travelling bulge, both as small per-sample tables (quarter pixels); the
// pixel loop is then integer compares and one or two table lookups a pixel.
//
// Materials written (seachart-sheet.js): the ink keyline, the cross-bands
// engraved on its back (they slide along the body: the slither), the hatched
// shade on its belly side, its watercolour wash, the head with an open or
// shut jaw, the eye and a spined frill behind the head, and a clean moat of
// unengraved sea round it.

import { M } from './seachart-sheet.js';
import { NONE } from './seachart-glyphs.js';

const W = 160, H = 80;
const DISP = new Int16Array(512), RAD = new Int16Array(512);
// a small integer sine (256 steps a turn, amplitude 256): flash
export const ISIN = Int16Array.from({ length: 256 }, (_, i) => Math.round(256 * Math.sin((i / 256) * Math.PI * 2)));
// the sea's horizontal engraved lines as a cover order: as `cover` rises the
// sea closes over the body row by row, evenly over the whole digit
const ROWRANK = [0, 8, 4, 12, 2, 10, 6, 14, 1, 9, 5, 13, 3, 11, 7, 15];
const WOB = [0, 0, 1, 1, 1, 0, 0, 0, -1, -1, -1, 0, 0, 0, 1, 0];

/**
 * st: { amp (px), wl (px, wavelength), wph (0..1, wave phase), band (px, slither
 *   phase), bulge (arc px of the swell's centre), bAmp (px), jaw (0..1), cover (0..1),
 *   wash, shade (materials), dy (int px sink), frill (bool), bg (Uint8Array) }
 * Returns the number of pixels scanned (for the cost estimate).
 */
export function drawSerpent(map, gl, X, Y, st) {
  const { L, r, S, O, tw, th, ox, oy, eye } = gl;
  const n = gl.n, prof = gl.prof;
  // ---- per-sample tables: the travelling wave across the body, the swell
  const ampQ = st.amp * 4, k = 256 / st.wl, ph = st.wph * 256;
  for (let i = 0; i < n; i++) {
    // the head and the tail hold the wave less (they steer)
    const hold = i < 6 ? i / 6 : L - i < 8 ? (L - i) / 8 * 0.6 + 0.4 : 1;
    DISP[i] = (ISIN[((i * k + ph) | 0) & 255] * ampQ * hold) >> 8;
    const db = i - st.bulge;
    const bump = db * db < 64 ? (64 - db * db) / 64 : 0;
    RAD[i] = ((prof[i] + st.bAmp * bump) * 4 + 0.5) | 0;
  }
  const jawQ = st.jaw, cov = Math.round(st.cover * 16), band = Math.round(st.band * 4);
  const P4 = st.period * 4;
  const wash = st.wash, shade = st.shade, bg = st.bg, dy = st.dy | 0;
  const L4 = L * 4, side = eye, dw = st.dipW;
  let scanned = 0;
  for (let j = 0; j < th; j++) {
    const y = Y + oy + j + dy;
    if (y < 3 || y >= H - 3) continue;
    for (let i = 0; i < tw; i++) {
      const x = X + ox + i;
      if (x < 3 || x >= W - 3) continue;
      const kk = j * tw + i, s4 = S[kk];
      if (s4 === NONE) continue;
      scanned++;
      const si = s4 >> 2, o = O[kk] - DISP[si], a = o < 0 ? -o : o, rad = RAD[si];
      const p = y * W + x;
      const u4 = L4 - s4;
      if (a > rad) {
        if (a <= rad + 9 && map[p] < M.INK) map[p] = bg[p];   // the moat
        continue;
      }
      // the sea closing over a diving body: row by row, evenly
      if (cov > 0) {
        const rk = ROWRANK[(y + WOB[x & 15]) & 15];
        if (rk < cov) { map[p] = rk >= cov - 2 ? M.FAINT : bg[p]; continue; }
      }
      // a coil dipping through the waves: the sea's lines cross it where a dip passes
      if (u4 > 48) {
        const da = si - st.dipA, db2 = si - st.dipB;
        if ((da > -dw && da < dw) || (db2 > -dw && db2 < dw)) {
          const rk = ROWRANK[(y + WOB[x & 15]) & 15];
          if (rk < 6) { map[p] = rk >= 3 ? M.FAINT : bg[p]; continue; }
        }
      }
      if (a > rad - 4) { map[p] = M.INK; continue; }
      if (u4 < 20) {
        // the jaw: a shut mouth is a line from the snout; open, a red gape
        const om = o + side * 2, mw = 2 + jawQ * (20 - u4) * 0.75;
        const am = om < 0 ? -om : om;
        if (am < mw) { map[p] = jawQ > 0.3 && am < mw - 2.5 ? (u4 < 7 ? bg[p] : M.MOUTH) : M.INK; continue; }
        map[p] = wash; continue;
      }
      if (u4 < 28) { map[p] = wash; continue; }          // the head is plain
      // cross-bands on the back, a hatched shade on the belly side
      if (o * side < -rad * 0.28) { map[p] = ((x + y) & 1) ? shade : M.INK_H; continue; }
      const b = (s4 + band) % P4;
      map[p] = (b < 0 ? b + P4 : b) < 4 ? M.INK : wash;
    }
  }
  // ---- the eye: a white dot and a pupil, on the head's upper side
  if (cov < 10) {
    const hi = Math.max(0, L - 6), nx = -gl.ty[hi], ny = gl.tx[hi];
    const off = (side * RAD[hi] * 0.42 + DISP[hi]) / 4;
    const ex = X + gl.x[hi] + nx * off, ey = Y + gl.y[hi] + ny * off + dy;
    const ix = Math.floor(ex - 0.5), iy = Math.floor(ey - 0.5);
    for (let q = 0; q < 4; q++) {
      const xx = ix + (q & 1), yy = iy + (q >> 1);
      if (xx >= 0 && yy >= 0 && xx < W && yy < H) map[yy * W + xx] = M.EYE;
    }
    // the pupil looks forward, towards the snout
    const px = Math.round(ex - 0.5 + gl.tx[hi] * 0.7), py = Math.round(ey - 0.5 + gl.ty[hi] * 0.7);
    if (px >= 0 && py >= 0 && px < W && py < H) map[py * W + px] = M.INK;
  }
  return scanned + n * 4;
}
