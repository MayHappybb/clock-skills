// Drawing a dancer of "haring": the numeral body from its distance field
// under squash (sy), stretch, lean (k, px of shear at the top) and jump, in
// one pass that writes three bands: a ground-coloured moat (the plain wall
// Haring leaves round a figure), the 2 px black line, the flat fill. Arms
// and legs are two-segment capsules in the same line and fill; the rows of
// the body where a limb joins are filled again after it, so the limb grows
// out of the body with no seam, the way one continuous outline would draw it.
import { SDF, HEAD, HIPS, SHOULDERS, GW, GH, OUT, sample } from './haring-glyphs.js';

const W = 160, H = 80;
const HALO = 3;                    // moat, px beyond the black

/** Screen position of glyph point (u, v) under a pose. */
export function at(P, u, v) {
  return [P.cx + (u - GW / 2) * P.sx + (P.k * (GH - v)) / GH, P.by - (GH - v) * P.sy];
}

/**
 * The body pass. P: { d, cx, by, sx, sy, k }. ink/fill/moat: RGB565 (moat
 * -1: none). rows: [y0, y1] to redo only the fill there (a limb patch).
 */
export function body(g, P, ink, fill, moat, rows) {
  const f = SDF[P.d], buf = g.buf;
  const sc = P.sy < P.sx ? P.sy : P.sx;          // screen px per glyph px, for the band widths
  // the line thins with the figure when it shrinks in a leap, but never below 1 px
  const lw = sc < 1 ? Math.max(1, OUT * sc) : OUT, mw = sc < 1 ? Math.max(1.5, HALO * sc) : HALO;
  const tOut = (lw / sc) * 8, tMoat = Math.min(126, ((lw + mw) / sc) * 8);
  const ak = P.k < 0 ? -P.k : P.k;
  let x0 = Math.floor(P.cx - 20 * P.sx - ak - 1), x1 = Math.ceil(P.cx + 20 * P.sx + ak + 1);
  let y0 = Math.floor(P.by - (GH + 17) * P.sy), y1 = Math.ceil(P.by + 5 * P.sy);
  if (rows) { y0 = Math.max(y0, rows[0]); y1 = Math.min(y1, rows[1]); }
  if (x0 < 0) x0 = 0; if (y0 < 0) y0 = 0; if (x1 > W - 1) x1 = W - 1; if (y1 > H - 1) y1 = H - 1;
  const isx = 1 / P.sx, isy = 1 / P.sy, kk = P.k / GH;
  let n = 0;
  for (let y = y0; y <= y1; y++) {
    const v = GH - (P.by - (y + 0.5)) * isy;
    const sh = P.cx + kk * (GH - v);
    const row = y * W;
    for (let x = x0; x <= x1; x++) {
      const s = sample(f, (x + 0.5 - sh) * isx + GW / 2, v);
      n++;
      if (s < 0) buf[row + x] = fill;
      else if (rows) continue;
      else if (s < tOut) buf[row + x] = ink;
      else if (moat >= 0 && s < tMoat) buf[row + x] = moat;
    }
  }
  g.cost.box += n * 8;
}

export const hips = (P) => HIPS[P.d].map((h) => at(P, h[0], h[1]));
export const head = (P) => at(P, HEAD[P.d][0], HEAD[P.d][1]);
export const shoulders = (P) => SHOULDERS[P.d].map((h) => (h ? at(P, h[0], h[1]) : null));

/**
 * Limbs: each [root, joint, end] in screen coords, root inside the body's
 * fill. Drawn as the line (r 1.5 + 2) then the fill (r 1.5), then the body
 * rows round each root are filled again. sc scales the limb's thickness.
 */
export function limbs(g, P, L, inkC, fillC, fill, sc = 1) {
  if (!L.length) return;
  const ri = Math.max(0.6, 1.5 * sc), ro = ri + Math.max(1, OUT * sc);
  for (const [a, b, c] of L) { g.thickLine(a[0], a[1], b[0], b[1], ro * 2, inkC); g.thickLine(b[0], b[1], c[0], c[1], ro * 2, inkC); }
  for (const [a, b, c] of L) { g.thickLine(a[0], a[1], b[0], b[1], ri * 2, fillC); g.thickLine(b[0], b[1], c[0], c[1], ri * 2, fillC); }
  let ya = 1e9, yb = -1e9;
  for (const [a] of L) { if (a[1] < ya) ya = a[1]; if (a[1] > yb) yb = a[1]; }
  const pad = Math.ceil(ro + 1);
  if (yb - ya < 2 * pad + 6) body(g, P, 0, fill, -1, [Math.floor(ya - pad), Math.ceil(yb + pad)]);
  else for (const [a] of L) body(g, P, 0, fill, -1, [Math.floor(a[1] - pad), Math.ceil(a[1] + pad)]);
}
