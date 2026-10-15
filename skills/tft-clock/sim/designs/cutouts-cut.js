// Cut-outs: the minute turn's two processes.
//
// cutSheet: a painted sheet lies flat over the slot and the blade frees it
// along the numeral's contour. Each piece of waste (a counter when its
// contour closes, the outside in bands behind the blade) comes away and
// falls, turning over as it goes (its painted face and its plain back
// alternate, squeezed flat, never tilted in depth), and the numeral is left.
//
// scissors: Matisse's own big tailor's shears, flat: two pale steel blades
// with a dark keyline and black bows, snipping as they go.

import { W, H, TEX, mix565, dark565 } from './cutouts-paper.js';

export const FALL = 0.9;   // s a freed piece is seen falling, at most

/**
 * Draw a numeral being cut. Field origin on screen at (ox, oy), integers.
 * p: cut progress 0..1; Tc: the cut's length in s (for the fall); `sh` the
 * paper's shades, `back` its reverse; `dir` the side the pieces drift to.
 */
export function cutSheet(g, G, ox, oy, pRaw, Tc, sh, back, dir) {
  const p = pRaw < 0 ? 0 : pRaw > 1 ? 1 : pRaw;
  const buf = g.buf, fw = G.w, D = G.d, PC = G.piece, REL = G.rel, TA = G.tau, P = p * 254;
  const [sx0, sy0, sw, shh] = G.sheet;
  let n = 0, nb = 0;
  // the sheet and the numeral where they lie
  for (let j = sy0; j < sy0 + shh; j++) {
    const Y = oy + j;
    if (Y < 0 || Y >= H) continue;
    for (let i = sx0; i < sx0 + sw; i++) {
      const X = ox + i;
      if (X < 0 || X >= W) continue;
      n++;
      const k = j * fw + i, id = PC[k], o = Y * W + X;
      const c = sh[TEX[((j & 63) << 6) | (i & 63)]];
      // still lying: the numeral, and waste not yet freed except the slit the blade has opened
      if (id === 255 || (REL[id] > p && (D[k] > 13 || TA[k] >= P))) { buf[o] = c; continue; }
      // freed: the ground shows, in the flat shadow of what still lies there;
      // the numeral's own edge keeps its anti-aliasing
      const ks = k - 2 * fw - 1, is = PC[ks];
      if (is === 255 || (is > 0 && REL[is] > p && (D[ks] > 13 || TA[ks] >= P))) { buf[o] = dark565(buf[o], 170); nb++; }
      let cv = 8 - D[k]; cv = cv < 0 ? 0 : cv > 16 ? 16 : cv;
      if (cv > 0) { buf[o] = mix565(buf[o], c, cv); nb++; }
    }
  }
  g.cost.box += n * 5; g.cost.blend += nb; g.cost.px += n;
  // the freed pieces fall away, turning over as paper does (both faces show)
  for (const q of G.pieces) {
    if (q.rel > p) continue;
    const a = (pRaw - q.rel) * Tc;
    if (a >= FALL) continue;
    const cx = ox + q.cx + dir * (7 * a + 6 * a * a) + 2 * sin1(a * 5 + q.id);
    const cy = oy + q.cy + 10 * a + 150 * a * a;
    const th = dir * (0.9 * a + 0.8 * a * a) * (q.id & 1 ? 1 : -0.7);
    let kx = Math.cos(a * (5 + (q.id % 3) * 1.5));
    const front = kx >= 0;
    kx = kx < 0 ? -kx : kx;
    if (kx < 0.15) kx = 0.15;
    fallPiece(g, G, q, cx, cy, th, kx, front ? sh : null, back);
  }
}
const sin1 = (x) => Math.sin(x);

function fallPiece(g, G, q, cx, cy, th, kx, sh, back) {
  const buf = g.buf, fw = G.w, PC = G.piece, id = q.id;
  const c = Math.cos(th), s = Math.sin(th), ik = 1 / kx;
  const [bx0, by0, bx1, by1] = q.box;
  // screen box of the piece's box (squeezed along its own x, turned, moved)
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (let k = 0; k < 4; k++) {
    const u = ((k & 1 ? bx1 : bx0) - q.cx) * kx, v = (k & 2 ? by1 : by0) - q.cy;
    const X = cx + u * c - v * s, Y = cy + u * s + v * c;
    if (X < x0) x0 = X; if (X > x1) x1 = X; if (Y < y0) y0 = Y; if (Y > y1) y1 = Y;
  }
  x0 = x0 < 0 ? 0 : x0 | 0; y0 = y0 < 0 ? 0 : y0 | 0;
  x1 = x1 >= W ? W : (x1 | 0) + 1; y1 = y1 >= H ? H : (y1 | 0) + 1;
  let n = 0;
  for (let Y = y0; Y < y1; Y++) {
    const dy = Y + 0.5 - cy;
    for (let X = x0; X < x1; X++) {
      n++;
      const dx = X + 0.5 - cx;
      const u = q.cx + (dx * c + dy * s) * ik, v = q.cy - dx * s + dy * c;
      if (u < bx0 || v < by0 || u >= bx1 || v >= by1) continue;
      const iu = u | 0, iv = v | 0;
      if (PC[iv * fw + iu] !== id) continue;
      buf[Y * W + X] = sh ? sh[TEX[((iv & 63) << 6) | (iu & 63)]] : back;
    }
  }
  g.cost.box += n * 6; g.cost.px += n >> 1;
}

/** The sheet alone, sliding into place (only its rectangle). */
export function sheetOnly(g, G, ox, oy, sh) {
  const buf = g.buf, [sx0, sy0, sw, shh] = G.sheet;
  let n = 0;
  for (let j = sy0; j < sy0 + shh; j++) {
    const Y = oy + j;
    if (Y < 0 || Y >= H) continue;
    for (let i = sx0; i < sx0 + sw; i++) {
      const X = ox + i;
      if (X < 0 || X >= W) continue;
      buf[Y * W + X] = sh[TEX[((j & 63) << 6) | (i & 63)]]; n++;
    }
    // its shadow along the bottom edge
  }
  const Yb = oy + sy0 + shh;
  if (Yb >= 0 && Yb < H) for (let i = sx0 + 1; i <= sx0 + sw; i++) { const X = ox + i; if (X >= 0 && X < W) buf[Yb * W + X] = dark565(buf[Yb * W + X], 200); }
  g.cost.px += n; g.cost.box += n;
}

/** Where along the scissors' path at progress p: [x, y, tx, ty, lifted]. */
export function pathAt(G, p) {
  const P = G.path, n = G.pathN;
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (P[m * 4 + 2] <= p) lo = m; else hi = m; }
  const t0 = P[lo * 4 + 2], t1 = P[hi * 4 + 2], u = t1 > t0 ? (p - t0) / (t1 - t0) : 0;
  const x = P[lo * 4] + (P[hi * 4] - P[lo * 4]) * u, y = P[lo * 4 + 1] + (P[hi * 4 + 1] - P[lo * 4 + 1]) * u;
  const lifted = P[hi * 4 + 3] === 1;
  // a smoothed heading: from a few points back to a few ahead (wrapping inside the contour)
  const a = Math.max(0, lo - 4), b = Math.min(n - 1, hi + 4);
  let tx = P[b * 4] - P[a * 4], ty = P[b * 4 + 1] - P[a * 4 + 1];
  const l = Math.sqrt(tx * tx + ty * ty) || 1;
  return [x, y, tx / l, ty / l, lifted];
}

const STEEL = 0xc3c7cf, KEY = 0x2a2830, BOW = 0x221f23;

/**
 * The shears, tip at (x, y), pointing along (tx, ty); `open` 0..1 the
 * blades' gap; `lift` 0..1 off the paper (its shadow falls further away).
 */
export function scissors(g, x, y, tx, ty, open, lift) {
  const nx = -ty, ny = tx;
  const P = (a, b) => [x + tx * a + nx * b, y + ty * a + ny * b];
  const piv = -10, ang = 0.06 + 0.3 * open;
  const sh = 1.2 + 2.5 * lift;
  // two blades from the pivot to the tip, spread by ang
  const blade = (sgn) => {
    const ca = Math.cos(ang * sgn), sa = Math.sin(ang * sgn);
    const R = (a, b) => { const u = a - piv; return P(piv + u * ca - b * sa, u * sa + b * ca); };
    return [R(piv, -1.9 * sgn), R(-2, -1.2 * sgn), R(2.2, 0), R(-1, 0.6 * sgn), R(piv, 1.5 * sgn)];
  };
  const bowAt = (sgn) => { const ca = Math.cos(ang * sgn), sa = Math.sin(ang * sgn); const u = -6.2; return P(piv + u * ca - 3.1 * sgn * sa, u * sa + 3.1 * sgn * ca); };
  // a flat shadow first
  for (const s of [1, -1]) {
    const bl = blade(s).map(([a, b]) => [a + sh, b + sh]);
    g.fillPolygon(bl, 0x000000, { aa: true, a: 0.18 });
    const [bx, by] = bowAt(s);
    g.ring(bx + sh, by + sh, 1.5, 2.9, 0x000000, { aa: true, a: 0.18 });
  }
  for (const s of [1, -1]) {
    const bl = blade(s);
    g.stroke([...bl, bl[0]], 1.3, KEY, { aa: true });
    g.fillPolygon(bl, STEEL, { aa: true });
    const [bx, by] = bowAt(s);
    g.ring(bx, by, 1.5, 2.9, BOW, { aa: true });
    g.thickLine(...P(piv, 1.2 * s), bx, by, 1.6, BOW, { aa: true });
  }
  const [px, py] = P(piv, 0);
  g.fillCircle(px, py, 1, KEY, { aa: true });
}
