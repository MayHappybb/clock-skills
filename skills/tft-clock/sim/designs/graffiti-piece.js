// Painting the piece: a numeral from its distance field under the pose of
// the moment (bounce, squash, lean), in the layers a writer sprays: the fill
// fade in three flat bands with spray-grain borders, white highlight dashes,
// the near-black outline, the flat 3D block offset down-right with its own
// keyline, and the light cutback border round everything. Each layer can be
// partly sprayed (a density, revealed by a fixed pixel rank, so a coat builds
// up evenly over the whole letter). Also: the drips and the colon dots.
import { SDF, SHINE, SH, M, GW, GH } from './graffiti-glyphs.js';
import { W, H, RANK, BAYER } from './graffiti-wall.js';

const OUT = 2.0, KEY = 1.0, BORD = 3.4, BX = 1.6, BY = 2.4;   // px
const EDGE1 = 11.5, EDGE2 = 22.5;                              // fill-band edges, glyph v

/** Screen box of a pose (with all layers), clipped. */
export function boxOf(P) {
  const sx = P.sc * P.sx, sy = P.sc * P.sy, al = P.lean < 0 ? -P.lean : P.lean;
  const x0 = Math.max(0, Math.floor(P.ox + P.dx - M * sx - al)), x1 = Math.min(W - 1, Math.ceil(P.ox + P.dx + (GW - M) * sx + al));
  const y0 = Math.max(0, Math.floor(P.yb + P.dy - (SH + M) * sy)), y1 = Math.min(H - 1, Math.ceil(P.yb + P.dy + M * sy));
  return [x0, y0, x1, y1];
}

/**
 * Paint digit d at pose P. pal / palB: colourway tables (WAY565 rows); columns
 * x < frontX take palB. wave: per-column offset of the band edges (glyph v).
 * dF, dO, dB: densities 0..1 of the fill, the outline, the block + border.
 */
export function paintDigit(g, d, P, pal, palB, frontX, wave, dF, dO, dB) {
  const f = SDF[d], sh = SHINE[d], buf = g.buf;
  const sx = P.sc * P.sx, sy = P.sc * P.sy, isx = 1 / sx, isy = 1 / sy;
  const k8 = 8 / P.sc, tOut = OUT * k8, tKey = KEY * k8, tBord = BORD * k8;
  const bu = BX * isx, bv = BY * isy;
  const [x0, y0, x1, y1] = boxOf(P);
  const tF = (dF * 256) | 0, tO = (dO * 256) | 0, tB = (dB * 256) | 0;
  const ox = P.ox + P.dx, yb = P.yb + P.dy, lean = P.lean / SH;
  let n = 0, n2 = 0, wr = 0;
  for (let y = y0; y <= y1; y++) {
    const v = SH - (yb - (y + 0.5)) * isy;
    const shx = ox + lean * (SH - v);
    const gy = v + M - 0.5;
    if (gy < 0 || gy >= GH - 1) continue;
    const iy = gy | 0, fy = gy - iy, row = iy * GW;
    const gyb = gy - bv, iyb = gyb | 0, fyb = gyb - iyb, rowb = iyb * GW, okb = gyb >= 0 && gyb < GH - 1;
    const rk = (y & 15) << 4, by4 = (y & 3) << 2;
    for (let x = x0; x <= x1; x++) {
      const u = (x + 0.5 - shx) * isx;
      const gx = u + M - 0.5;
      if (gx < 0 || gx >= GW - 1) continue;
      n++;
      const ix = gx | 0, fx = gx - ix, k = row + ix;
      const a = f[k] + (f[k + 1] - f[k]) * fx, b = f[k + GW] + (f[k + GW + 1] - f[k + GW]) * fx;
      const s = a + (b - a) * fy;
      const r = RANK[rk | (x & 15)];
      const P6 = x < frontX - 3 ? palB : x < frontX && r < (frontX - x) * 85 ? palB : pal;   // the front is a band of fresh grain
      let c = -1;
      if (s < 0) {
        if (r < tF) {
          const iu = (gx + 0.5) | 0, iv = (gy + 0.5) | 0;
          if (sh[iv * GW + iu] && dB >= 1) c = P6[6];
          else {
            const vv = v + wave[x], bay = BAYER[by4 | (x & 3)];
            if (vv < EDGE1 - 1.5) c = P6[0];
            else if (vv < EDGE1 + 1.5) c = (vv - EDGE1) / 3 + 0.5 > bay ? P6[1] : P6[0];
            else if (vv < EDGE2 - 1.5) c = P6[1];
            else if (vv < EDGE2 + 1.5) c = (vv - EDGE2) / 3 + 0.5 > bay ? P6[2] : P6[1];
            else c = P6[2];
          }
        }
      } else if (s < tOut) {
        if (r < tO) c = P6[3];
      } else if (r < tB && okb) {
        n2++;
        const gxb = gx - bu;
        if (gxb >= 0 && gxb < GW - 1) {
          const ixb = gxb | 0, fxb = gxb - ixb, kb = rowb + ixb;
          const ab = f[kb] + (f[kb + 1] - f[kb]) * fxb, bb = f[kb + GW] + (f[kb + GW + 1] - f[kb + GW]) * fxb;
          const sb = ab + (bb - ab) * fyb;
          if (sb < tKey) c = P6[4];
          else if (sb < tOut) c = P6[3];
          else if (s < tBord || sb < tBord) c = P6[5];
        } else if (s < tBord) c = P6[5];
      }
      if (c >= 0) { buf[y * W + x] = c; wr++; }
    }
  }
  g.cost.box += n * 14 + n2 * 10; g.cost.px += wr;
}

/** A drip: a 2 px run of paint from (x, y) down len px, with a fat bead at its tip. */
export function drip(g, x, y, len, c) {
  if (len < 0.5) return;
  const X = Math.round(x - 1), Y = Math.round(y), L = Math.round(len);
  g.fillRect(X, Y, 2, L, c);
  if (L >= 3) { g.fillRect(X - 1, Y + L - 2, 4, 2, c); g.fillRect(X, Y + L, 2, 1, c); }
}

/** One colon dot: border, block, outline, fill: flat discs. */
export function dot(g, x, y, P6, dens = 1) {
  if (dens <= 0) return;
  const a = dens;
  g.fillCircle(x + BX * 0.6, y + BY * 0.6, 6.4, P6[5], { a });
  g.fillCircle(x, y, 6.0, P6[5], { a });
  g.fillCircle(x + BX, y + BY, 4.5, P6[3], { a });
  g.fillCircle(x + BX, y + BY, 3.5, P6[4], { a });
  g.fillCircle(x, y, 4.6, P6[3], { a });
  g.fillCircle(x, y, 2.7, P6[1], { a });
  g.fillRect(Math.round(x - 1.5), Math.round(y - 2), 1, 2, P6[6], { a });
}
