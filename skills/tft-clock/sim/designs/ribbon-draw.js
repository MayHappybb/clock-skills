// Ribbon drawing: the satin band and the gymnasts.
//
// The band is rasterised from its centre line every frame. Each segment
// between two samples scans a small box and records, per pixel, the arc
// length s along the ribbon and the signed distance d across it, keeping two
// layers: where the ribbon crosses itself (an 8's waist, a 4's crossbar, a
// 0's lap) the later stretch lies on top and the earlier one is kept below
// it. Segments next to a fold extend past the crease, so the two arms meet in
// a mitre and the seam between them (nearest arm wins) is the diagonal fold
// line. Then every pixel looks up the look of the ribbon at its s (half
// width, sideways ripple, colour: computed once per pixel of ribbon length
// per frame by the caller) and paints rim, face or nothing. All integer-able
// work; it is billed to the estimate as box work.

import { NS } from './ribbon-glyphs.js';

const W = 160, H = 80;
const BW = 80, BH = 80;                      // the scan box, at most
const SA = new Int16Array(BW * BH), DA = new Int16Array(BW * BH);
const SB = new Int16Array(BW * BH), DB = new Int16Array(BW * BH);
export const SMAX = 512;
/** Per pixel of ribbon length, filled by the caller's look(): half width, sideways offset (px), face and rim (RGB565). */
export const LOOK = { hw: new Float32Array(SMAX), off: new Float32Array(SMAX), fill: new Uint16Array(SMAX), rim: new Uint16Array(SMAX) };
const S = new Float32Array(NS);
export const R_MAX = 4.6;                    // farthest a band edge can lie from its centre line
const SAME = 48;                             // quarter px: closer than 12 px along the ribbon = the same stretch

function blend565(bg, fg, a) {
  if (a >= 1) return fg;
  const k = (a * 32) | 0;
  if (k <= 0) return bg;
  const br = bg >> 11, bgg = (bg >> 5) & 63, bb = bg & 31;
  const fr = fg >> 11, fgg = (fg >> 5) & 63, fb = fg & 31;
  return ((br + (((fr - br) * k) >> 5)) << 11) | ((bgg + (((fgg - bgg) * k) >> 5)) << 5) | (bb + (((fb - bb) * k) >> 5));
}

/**
 * Draw one ribbon. X, Y: the centre line (NS samples, screen px). ext: how
 * far each sample's segments reach past it (folds reach R; 0 means the
 * default). look(S, L): fills LOOK for 0..L. Returns the arc length.
 */
export function drawRibbon(g, X, Y, ext, look) {
  // arc length
  let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
  S[0] = 0;
  for (let i = 0; i < NS; i++) {
    if (i > 0) { const dx = X[i] - X[i - 1], dy = Y[i] - Y[i - 1]; S[i] = S[i - 1] + Math.sqrt(dx * dx + dy * dy); }
    if (X[i] < minX) minX = X[i]; if (X[i] > maxX) maxX = X[i];
    if (Y[i] < minY) minY = Y[i]; if (Y[i] > maxY) maxY = Y[i];
  }
  const L = Math.min(S[NS - 1], SMAX - 2);
  look(S, L);
  let hwMax = 0;
  for (let k = 0, n = Math.ceil(L) + 1; k <= n; k++) { const v = LOOK.hw[k] + Math.abs(LOOK.off[k]); if (v > hwMax) hwMax = v; }
  const R = Math.min(R_MAX, hwMax + 0.6);

  const bx0 = Math.max(0, Math.floor(minX - R - 1)), by0 = Math.max(0, Math.floor(minY - R - 1));
  const bx1 = Math.min(W, Math.ceil(maxX + R + 2), bx0 + BW), by1 = Math.min(H, Math.ceil(maxY + R + 2), by0 + BH);
  const bw = bx1 - bx0, bh = by1 - by0;
  if (bw <= 0 || bh <= 0) return L;
  SA.fill(-1, 0, bw * bh); SB.fill(-1, 0, bw * bh);
  let scanned = 0;

  // ---- rasterise: segment by segment, scanning only the span of each row
  // that lies inside the segment's rectangle (its length plus the reach past
  // each end, by 2R across)
  let rows = 0;
  for (let j = 0; j < NS - 1; j++) {
    const ax = X[j], ay = Y[j], dx = X[j + 1] - ax, dy = Y[j + 1] - ay;
    const len = S[j + 1] - S[j];
    if (len < 1e-3) continue;
    const ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
    const e0 = j === 0 ? 0.5 : ext[j] || 0.6, e1 = j + 1 === NS - 1 ? 0 : ext[j + 1] || 0.6;
    const em = e0 > e1 ? e0 : e1, m = R + em;
    let y0 = ((ay < ay + dy ? ay : ay + dy) - m) | 0, y1 = ((ay > ay + dy ? ay : ay + dy) + m + 1) | 0;
    if (y0 < by0) y0 = by0; if (y1 > by1 - 1) y1 = by1 - 1;
    const s0 = S[j] * 4;
    for (let y = y0; y <= y1; y++) {
      const ry = y + 0.5 - ay;
      // t = rx*ux + ry*uy in [-e0, len+e1] and d = rx*nx + ry*ny in [-R, R], with rx = px - ax
      let lo = -1e9, hi = 1e9;
      const tA = ry * uy, dA = ry * ny;
      if (ux > 1e-6 || ux < -1e-6) {
        let p = (-e0 - tA) / ux, q = (len + e1 - tA) / ux;
        if (p > q) { const z = p; p = q; q = z; }
        if (p > lo) lo = p; if (q < hi) hi = q;
      } else if (tA < -e0 || tA > len + e1) continue;
      if (nx > 1e-6 || nx < -1e-6) {
        let p = (-R - dA) / nx, q = (R - dA) / nx;
        if (p > q) { const z = p; p = q; q = z; }
        if (p > lo) lo = p; if (q < hi) hi = q;
      } else if (dA < -R || dA > R) continue;
      rows++;
      // integer ceil and floor (|0 truncates toward zero)
      const va = ax + lo - 0.5, vb = ax + hi - 0.5;
      let xa = va | 0, xb = vb | 0;
      if (xa < va) xa++; if (xb > vb) xb--;
      if (xa < bx0) xa = bx0; if (xb > bx1 - 1) xb = bx1 - 1;
      let k = (y - by0) * bw + (xa - bx0);
      for (let x = xa; x <= xb; x++, k++) {
        const rx = x + 0.5 - ax;
        const t = rx * ux + tA;
        const d = rx * nx + dA;
        const sq = (s0 + (t < 0 ? 0 : t > len ? len : t) * 4) | 0, dq = (d * 16) | 0;
        const sa = SA[k];
        if (sa < 0) { SA[k] = sq; DA[k] = dq; continue; }
        const ds = sq - sa;
        if (ds < SAME && ds > -SAME) {
          const da = DA[k];
          if ((dq < 0 ? -dq : dq) < (da < 0 ? -da : da)) { SA[k] = sq; DA[k] = dq; }
        } else if (sq > sa) {
          // a later stretch crossing over: the old one goes underneath
          const sb = SB[k];
          if (sb < 0 || (sa - sb < SAME && sa - sb > -SAME)) { SB[k] = sa; DB[k] = DA[k]; }
          SA[k] = sq; DA[k] = dq;
        } else {
          const sb = SB[k];
          if (sb < 0) { SB[k] = sq; DB[k] = dq; }
          else if (sq - sb < SAME && sq - sb > -SAME) {
            const db = DB[k];
            if ((dq < 0 ? -dq : dq) < (db < 0 ? -db : db)) { SB[k] = sq; DB[k] = dq; }
          }
        }
      }
      if (xb >= xa) scanned += xb - xa + 1;
    }
  }

  // ---- paint: every pixel looks up its stretch of ribbon
  const buf = g.buf, hwA = LOOK.hw, offA = LOOK.off, fillA = LOOK.fill, rimA = LOOK.rim;
  const Lq = L * 4;
  let written = 0, blended = 0;
  for (let y = by0; y < by1; y++) {
    let k = (y - by0) * bw;
    for (let x = bx0; x < bx1; x++, k++) {
      let sq = SA[k];
      if (sq < 0) continue;
      let dq = DA[k], col = -1, cov = 0;
      for (let layer = 0; layer < 2; layer++) {
        if (layer === 1) { sq = SB[k]; if (sq < 0) break; dq = DB[k]; }
        const si = sq >> 2;
        const hw = hwA[si];
        let ad = dq / 16 - offA[si];
        if (ad < 0) ad = -ad;
        let e = hw - ad + 0.5;
        if (e <= 0) continue;
        // the tail is cut in a swallowtail notch
        const tail = (Lq - sq) / 4;
        if (tail < 2 && hw > 2.2) { const notch = 2 * (1 - ad / hw); if (tail < notch) continue; }
        cov = e >= 1 ? 1 : e;
        col = hw >= 2.2 && ad > hw - 1.05 ? rimA[si] : fillA[si];
        break;
      }
      if (col < 0) continue;
      const i = y * W + x;
      if (cov >= 1) { buf[i] = col; written++; } else { buf[i] = blend565(buf[i], col, cov); blended++; }
    }
  }
  g.cost.box += scanned * 5 + rows * 8 + bw * bh * 3;
  g.cost.px += written; g.cost.blend += blended; g.cost.calls += 2;
  return L;
}

// ------------------------------------------------------------ the gymnasts

/**
 * A gymnast in the flat style of a sports pictogram: round head with a bun,
 * a leotard torso, long legs with pointed feet, thin arms. `face` runs from
 * 1 (facing right) through 0 (side on, mid pirouette) to -1: every sideways
 * offset is scaled by it, so a turn is continuous. The stick hand reaches
 * for `tip` (the ribbon's held end) and the stick is drawn to it; with no
 * tip (the juggler) that arm takes the pose `arm2`.
 *
 * p: { x, hip, lean, face, legs: [[a, k], [a, k]], arm: [a, e], arm2, tip,
 *      stick }  angles in radians from straight down, positive
 *      toward the way she faces. sin, cos: the kit's table trig.
 */
export function gymnast(g, p, C, sin, cos) {
  const aa = { aa: true };
  const f = p.face, hx = p.x, hy = p.hip, lean = p.lean, z = p.sc || 1;   // z: her scale (the back row is smaller)
  const sl = sin(lean), cl = cos(lean);
  const sx = hx + f * 9 * z * sl, sy = hy - 9 * z * cl;          // shoulder
  const nx = hx + f * 12.8 * z * sl, ny = hy - 12.8 * z * cl;    // head centre
  const limb = (ox, oy, a1, l1, a2, l2) => {
    const kx = ox + f * l1 * sin(a1), ky = oy + l1 * cos(a1);
    return [kx, ky, kx + f * l2 * sin(a1 + a2), ky + l2 * cos(a1 + a2)];
  };
  const leg0 = limb(hx, hy, p.legs[0][0], 6.6 * z, -p.legs[0][1], 6.4 * z);
  const leg1 = limb(hx, hy, p.legs[1][0], 6.6 * z, -p.legs[1][1], 6.4 * z);
  const drawLeg = (L, c) => { g.thickLine(hx, hy, L[0], L[1], 2.8 * z, c, aa); g.thickLine(L[0], L[1], L[2], L[3], 2.2 * z, c, aa); };
  drawLeg(leg1, C.skinFar);
  const arm = limb(sx, sy + 0.5, p.arm[0], 4.6 * z, p.arm[1], 4.4 * z);
  g.thickLine(sx, sy + 0.5, arm[0], arm[1], 1.8 * z, C.skinFar, aa);
  g.thickLine(arm[0], arm[1], arm[2], arm[3], 1.5 * z, C.skinFar, aa);
  g.thickLine(hx, hy - 0.5, sx, sy, 4.4 * z, C.leo, aa);
  g.fillCircle(hx, hy, 2.5 * z, C.leo, aa);
  drawLeg(leg0, C.skin);
  g.fillCircle(nx - f * 2.3 * z, ny - 1.9 * z, 1.5 * z, C.hair, aa);
  g.fillCircle(nx, ny, 2.8 * z, C.skin, aa);
  if (!p.tip) {
    const a2 = limb(sx, sy + 0.4, p.arm2[0], 4.6 * z, p.arm2[1], 4.4 * z);
    g.thickLine(sx, sy + 0.4, a2[0], a2[1], 1.6 * z, C.skin, aa);
    g.thickLine(a2[0], a2[1], a2[2], a2[3], 1.4 * z, C.skin, aa);
    return { hand: [a2[2], a2[3]], free: [arm[2], arm[3]] };
  }
  // the stick arm reaches for the stick, the stick for the ribbon; with
  // `release` > 0 the hand lets go and drifts to the pose arm2 (the caller
  // draws the stick in the air)
  const tx = p.tip[0], ty = p.tip[1];
  let vx = tx - sx, vy = ty - sy;
  const dist = Math.sqrt(vx * vx + vy * vy) || 1;
  vx /= dist; vy /= dist;
  const reach0 = Math.min(8.6 * z, Math.max(3 * z, dist - p.stick));
  const ikx = sx + vx * reach0, iky = sy + vy * reach0;
  let hxx = ikx, hyy = iky;
  const rel = p.release || 0;
  if (rel > 0) {
    const a2 = limb(sx, sy + 0.4, p.arm2[0], 4.6 * z, p.arm2[1], 4.4 * z);
    hxx += (a2[2] - hxx) * rel; hyy += (a2[3] - hyy) * rel;
  }
  let wx = hxx - sx, wy = hyy - sy;
  const reach = Math.sqrt(wx * wx + wy * wy) || 1;
  wx /= reach; wy /= reach;
  const half = 4.5 * z, bend = Math.sqrt(Math.max(0, half * half - (reach / 2) * (reach / 2)));
  const side = f;   // the elbow swings through as she turns
  const exx = (sx + hxx) / 2 - wy * bend * side * 0.8, eyy = (sy + hyy) / 2 + wx * bend * side * 0.8;
  g.thickLine(sx, sy + 0.4, exx, eyy, 1.8 * z, C.skin, aa);
  g.thickLine(exx, eyy, hxx, hyy, 1.6 * z, C.skin, aa);
  if (rel <= 0) {
    g.thickLine(hxx, hyy, tx, ty, 1.1, C.stick, aa);
    g.fillCircle(hxx, hyy, 1.0, C.grip, aa);
  }
  return { hand: [hxx, hyy], ik: [ikx, iky], free: [arm[2], arm[3]] };
}
