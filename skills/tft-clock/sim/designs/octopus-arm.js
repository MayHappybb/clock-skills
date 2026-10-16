// Drawing an octopus arm: a round brush whose radius tapers from root to tip
// is stamped along the arm's nodes into a full-glass distance buffer (the
// signed distance to the arm's edge, which node is nearest, and where across
// the arm the pixel lies), then shaded through the colourway: a dark keyline
// with one anti-aliased step, skin whose tone is set per node (the
// chromatophore waves), a paler sucker side, a light rim on the back of the
// arm, spots, and finally the suckers themselves, a row of pale discs on
// the inside of every curl.
//
// RAM: distance (Int16), node (Uint8) and across (Int8) buffers over the
// glass: 51.2 KB. Flash: the sqrt table (11 KB) and the spot map (1.6 KB).

import { N } from './octopus-glyphs.js';

const W = 160, H = 80, WH = W * H;
const E = new Int16Array(WH).fill(32767), K = new Uint8Array(WH), LT = new Int8Array(WH);
const RO_MAX = 6.8;
const SQ = new Uint8Array(Math.ceil((RO_MAX * 16) ** 2) + 1);
for (let i = 0; i < SQ.length; i++) SQ[i] = Math.min(255, Math.round(Math.sqrt(i)));

// colour slots in an arm's lookup table
export const C = { KEY: 0, DARK: 1, BASE: 2, LIGHT: 3, FLASH: 4, RIM: 5, SPOT: 6, SPOT2: 7, SRIM: 8, SIN: 9, VENT: 10, GLOW: 11 };

// spots on the skin, fixed in (node, across): a blob every ~7 nodes, off-centre
const SPOT = new Uint8Array((N + 1) * 17);
{
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let c = 4; c < N - 2; c += 6 + Math.floor(rnd() * 3)) {
    const l = Math.round((rnd() - 0.5) * 7);
    for (let k = c - 2; k <= c + 2; k++) for (let a = -4; a <= 4; a++) {
      const q = ((k - c) / 1.6) ** 2 + ((a - l) / 3.4) ** 2;
      if (k < 0 || k > N || l + a < -8 || l + a > 8) continue;
      const v = q < 0.45 ? 1 : q < 1 ? 2 : 0;
      const i = k * 17 + (Math.max(-8, Math.min(8, a)) + 8);
      if (v && (SPOT[i] === 0 || v < SPOT[i])) SPOT[i] = v;
    }
  }
}

function blend565(d, s, a) {
  const dr = d >> 11, dg = (d >> 5) & 63, db = d & 31, sr = s >> 11, sg = (s >> 5) & 63, sb = s & 31;
  return ((((dr * (16 - a) + sr * a) >> 4) << 11) | (((dg * (16 - a) + sg * a) >> 4) << 5) | ((db * (16 - a) + sb * a) >> 4));
}

const TX = new Float32Array(N + 1), TY = new Float32Array(N + 1);

/**
 * Draw one arm onto g.
 * a.X, a.Y   node centres (glass coords, N + 1)
 * a.R        skin radius per node (px); the keyline adds 1 px outside it
 * a.SG       sucker side per node, -1..1 (+1 = left of travel)
 * a.TONE     per node: 1 dark, 2 base, 3 light, 4 flash
 * a.SPK      per node: 0 no spots, 1 spots, 2 lit spots
 * a.lut      Uint16Array of RGB565 colours by C slot; a.lut2 for nodes whose WAY is 1
 * a.ledge    Uint8Array(W): first row hidden behind the rock, per column
 * a.sph      sucker phase along the arm, px
 */
export function drawArm(g, a) {
  const { X, Y, R, SG, TONE, SPK, WAY, lut, lut2, ledge } = a;
  const buf = g.buf;
  let mnx = 1e9, mny = 1e9, mxx = -1e9, mxy = -1e9;
  for (let i = 0; i <= N; i++) {
    if (X[i] < mnx) mnx = X[i]; if (X[i] > mxx) mxx = X[i];
    if (Y[i] < mny) mny = Y[i]; if (Y[i] > mxy) mxy = Y[i];
  }
  const bx0 = Math.max(0, (mnx - RO_MAX - 1) | 0), by0 = Math.max(0, (mny - RO_MAX - 1) | 0);
  const bx1 = Math.min(W, ((mxx + RO_MAX + 2) | 0)), by1 = Math.min(H, ((mxy + RO_MAX + 2) | 0));
  if (bx1 <= bx0 || by1 <= by0) return;
  for (let y = by0; y < by1; y++) E.fill(32767, y * W + bx0, y * W + bx1);
  let ops = (bx1 - bx0) * (by1 - by0);

  // tangents
  for (let i = 0; i <= N; i++) {
    const i0 = i > 0 ? i - 1 : 0, i1 = i < N ? i + 1 : N;
    const tx = X[i1] - X[i0], ty = Y[i1] - Y[i0];
    // alpha-max-beta-min length: a few per cent off, plenty for a direction
    const ax = tx < 0 ? -tx : tx, ay = ty < 0 ? -ty : ty;
    const l = (ax > ay ? ax + 0.4 * ay : ay + 0.4 * ax) || 1;
    TX[i] = tx / l; TY[i] = ty / l;
  }

  // ---- stamp: a disc every ~1.4 px along the arm (closer nodes are skipped;
  // further ones get in-between discs), which keeps the edge free of scallops
  let lx = -99, ly = -99;
  for (let i = 0; i <= N; i++) {
    let sub = 1;
    if (i < N) {
      const gx = X[i + 1] - X[i], gy = Y[i + 1] - Y[i], g2 = gx * gx + gy * gy;
      if (g2 > 2.4) { sub = (Math.sqrt(g2) / 1.4 + 1) | 0; if (sub > 16) sub = 16; }
      else { const hx = X[i] - lx, hy = Y[i] - ly; if (hx * hx + hy * hy < 1.6 && i > 0) continue; }
    }
    lx = X[i]; ly = Y[i];
    for (let q = 0; q < sub; q++) {
      const u = q / sub;
      const x = q ? X[i] + (X[i + 1] - X[i]) * u : X[i], y = q ? Y[i] + (Y[i + 1] - Y[i]) * u : Y[i];
      const r = q ? R[i] + (R[i + 1] - R[i]) * u : R[i];
      const kk = q && u >= 0.5 ? i + 1 : i;
      const ro = r + 1.65, R16 = (r * 16) | 0, RO16 = (ro * 16) | 0, RO2 = RO16 * RO16;
      const X16 = (x * 16) | 0, Y16 = (y * 16) | 0;
      let x0 = (X16 - RO16) >> 4, x1 = (X16 + RO16) >> 4, y0 = (Y16 - RO16) >> 4, y1 = (Y16 + RO16) >> 4;
      if (x0 < bx0) x0 = bx0; if (y0 < by0) y0 = by0; if (x1 >= bx1) x1 = bx1 - 1; if (y1 >= by1) y1 = by1 - 1;
      const tx = TX[kk], ty = TY[kk], il = 8 / (R16 || 1);
      for (let py = y0; py <= y1; py++) {
        const dy = py * 16 + 8 - Y16, dy2 = dy * dy;
        if (dy2 >= RO2) continue;
        const row = py * W;
        for (let px = x0; px <= x1; px++) {
          const dx = px * 16 + 8 - X16, d2 = dx * dx + dy2;
          if (d2 >= RO2) continue;
          const e = SQ[d2] - R16, j = row + px;
          if (e < E[j]) {
            E[j] = e; K[j] = kk;
            let l = ((dx * ty - dy * tx) * il) | 0;
            LT[j] = l > 8 ? 8 : l < -8 ? -8 : l;
          }
        }
      }
      ops += (x1 - x0 + 1) * (y1 - y0 + 1);
    }
  }

  // ---- shade
  let px = 0, bl = 0;
  for (let y = by0; y < by1; y++) {
    const row = y * W;
    for (let x = bx0; x < bx1; x++) {
      const j = row + x, e = E[j];
      if (e >= 26 || y >= ledge[x]) continue;
      const k = K[j], lu = WAY[k] ? lut2 : lut;
      if (e >= 16) { buf[j] = blend565(buf[j], lu[0], ((26 - e) * 13) >> 3); bl++; continue; }
      px++;
      if (e >= 0) { buf[j] = lu[0]; continue; }
      const t = TONE[k], side = LT[j] * (SG[k] > 0.25 ? 1 : SG[k] < -0.25 ? -1 : 0);
      let c;
      const sp = SPK[k] ? SPOT[k * 17 + LT[j] + 8] : 0;
      if (t === 4) c = C.FLASH;
      else if (sp) c = sp === 1 ? (SPK[k] === 2 ? C.GLOW : C.SPOT) : C.SPOT2;
      else if (side < -4 && e > -22) c = t === 1 ? C.BASE : C.RIM;
      else if (side > 3) c = t === 1 ? C.BASE : C.VENT;
      else c = t;
      buf[j] = lu[c];
    }
  }

  // ---- suckers: a pale disc every ~3.1 px on the inside of the curl
  const step = a.L / N;
  let sOps = 0;
  for (let s = (a.sph % 4.2 + 4.2) % 4.2 + 2; s < a.L - 2; s += 4.2) {
    const f = s / step, i = f | 0;
    if (i >= N) break;
    const u = f - i, r = R[i] + (R[i + 1] - R[i]) * u, sg = SG[i] + (SG[i + 1] - SG[i]) * u;
    const rs = r * 0.31;
    if (rs < 0.55) continue;
    const off = sg * r * 0.42;
    const cx = X[i] + (X[i + 1] - X[i]) * u + TY[i] * off, cy = Y[i] + (Y[i + 1] - Y[i]) * u - TX[i] * off;
    const ro = rs + 0.3, ro2 = ro * ro, ri2 = (rs - 0.75) * (rs - 0.75);
    let x0 = (cx - ro) | 0, x1 = (cx + ro) | 0, y0 = (cy - ro) | 0, y1 = (cy + ro) | 0;
    if (x0 < 0) x0 = 0; if (y0 < 0) y0 = 0; if (x1 > W - 1) x1 = W - 1; if (y1 > H - 1) y1 = H - 1;
    for (let y = y0; y <= y1; y++) {
      const dy = y + 0.5 - cy;
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx, d2 = dx * dx + dy * dy;
        sOps++;
        if (d2 >= ro2 || y >= ledge[x]) continue;
        const j = y * W + x, kk = K[j];
        if (E[j] > -10 || kk + 6 < i || kk > i + 7 || TONE[kk] === 4) continue;
        buf[j] = (WAY[kk] ? lut2 : lut)[rs >= 1.1 && d2 < ri2 ? C.SIN : C.SRIM];
      }
    }
  }
  g.cost.box += ops * 4 + (bx1 - bx0) * (by1 - by0) * 2 + sOps * 3;
  g.cost.px += px; g.cost.blend += bl;
}
