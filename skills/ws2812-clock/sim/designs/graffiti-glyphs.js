// Graffiti tag numerals: fat, slanted, kinked strokes with tapered spikes,
// baked per slot into distance fields (letter, 3D extrusion), a spray-path
// parameter, highlight streaks, drip columns and a glint point.
//
// Skeletons in a unit box (u right, v down); points [u, v, radius multiplier].
// A multiplier of 0 is a pointed spike tip. Stroke order is the spray order.
const G = {
  0: [[[0.55, 0], [0.93, 0.12], [1, 0.5, 1.1], [0.9, 0.87], [0.48, 1], [0.08, 0.88], [0, 0.5, 1.1], [0.1, 0.12], [0.55, 0]]],
  1: [[[0.62, 0.04, 0.95], [0.22, 0.3, 0.6], [0.05, 0.36, 0]],
      [[0.66, 0, 1.15], [0.6, 1, 1.15]],
      [[0.3, 1, 0.8], [0.92, 1, 0.8], [1.12, 0.88, 0]]],
  2: [[[0.04, 0.27, 0.9], [0.33, 0.02], [0.74, 0.02], [0.97, 0.25], [0.88, 0.5], [0.1, 1], [0.92, 1, 0.9], [1.16, 0.84, 0]]],
  3: [[[0.04, 0.05, 0.85], [0.9, 0, 0.9], [0.98, 0.2], [0.5, 0.46, 0.9], [0.98, 0.68], [0.88, 0.95], [0.45, 1], [0.04, 0.9, 0.85], [-0.12, 0.74, 0]]],
  4: [[[0.6, 0], [0, 0.68], [1.02, 0.68, 0.85], [1.2, 0.6, 0]],
      [[0.74, 0.3], [0.72, 1, 1.1]]],
  5: [[[1.2, -0.08, 0], [1.02, 0, 0.85], [0.16, 0.02], [0.08, 0.46], [0.6, 0.37], [0.97, 0.58], [0.9, 0.9], [0.5, 1], [0.04, 0.88, 0.9], [-0.12, 0.72, 0]]],
  6: [[[1.06, -0.04, 0], [0.8, 0.04, 0.9], [0.32, 0.18], [0.04, 0.58], [0.12, 0.9], [0.5, 1], [0.9, 0.86], [0.95, 0.58], [0.58, 0.44], [0.1, 0.58]]],
  7: [[[-0.12, 0.14, 0], [0.04, 0.02, 0.85], [1, 0.02, 0.9], [0.38, 1, 1.1]]],
  8: [[[0.5, 0.46], [0.15, 0.3], [0.2, 0.05], [0.52, 0], [0.82, 0.06], [0.86, 0.3], [0.5, 0.46]],
      [[0.5, 0.46], [0.04, 0.7], [0.14, 0.95], [0.52, 1], [0.9, 0.94], [0.98, 0.7], [0.5, 0.46]]],
  9: [[[0.9, 0.4], [0.45, 0.55], [0.06, 0.4], [0.1, 0.1], [0.5, 0], [0.9, 0.12], [0.96, 0.45, 1.05], [0.76, 0.86], [0.2, 1, 0.9], [-0.06, 0.92, 0]]],
};

export const KW = 1.3;  // dark keyline round the fill, px
export const OW = 1.1;  // light outer outline, px

// distance from (px, py) to a tapered segment list; writes nearest s to OUT_S
let OUT_S = 0;
function sdf(seg, n, px, py) {
  let best = 1e9, bs = 0;
  for (let k = 0; k < n; k++) {
    const o = k * 8, ax = seg[o], ay = seg[o + 1], ra = seg[o + 2], bx = seg[o + 3], by = seg[o + 4], rb = seg[o + 5];
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
    let t = L2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = px - ax - t * dx, ey = py - ay - t * dy;
    const d = Math.sqrt(ex * ex + ey * ey) - (ra + (rb - ra) * t);
    if (d < best) { best = d; bs = seg[o + 6] + (seg[o + 7] - seg[o + 6]) * t; }
  }
  OUT_S = bs;
  return best;
}

/**
 * Bake digit `g` for slot S = { ox, oy, sw, sh, R, slant, rot, ext } (px).
 * Returns { x0, y0, w, h, dF, dS, sP, hl, grain, path, drips, glint }.
 */
export function bake(g, S) {
  const cx = S.ox + S.sw / 2 + S.slant * S.sh / 2, cy = S.oy + S.sh / 2;
  const cr = Math.cos(S.rot), sr = Math.sin(S.rot);
  const tf = (u, v) => {
    const x = S.ox + u * S.sw + (1 - v) * S.slant * S.sh - cx, y = S.oy + v * S.sh - cy;
    return [cx + x * cr - y * sr, cy + x * sr + y * cr];
  };
  // segments in px with cumulative path length
  const raw = [];
  let len = 0;
  for (const stroke of G[g]) {
    for (let k = 0; k + 1 < stroke.length; k++) {
      const a = stroke[k], b = stroke[k + 1];
      const [ax, ay] = tf(a[0], a[1]), [bx, by] = tf(b[0], b[1]);
      const l = Math.hypot(bx - ax, by - ay);
      raw.push([ax, ay, S.R * (a[2] ?? 1), bx, by, S.R * (b[2] ?? 1), len, len + l]);
      len += l;
    }
  }
  const n = raw.length, seg = new Float32Array(n * 8);
  raw.forEach((r, k) => { for (let j = 0; j < 8; j++) seg[k * 8 + j] = j >= 6 ? r[j] / len : r[j]; });
  let mnx = 1e9, mny = 1e9, mxx = -1e9, mxy = -1e9;
  for (const r of raw) {
    mnx = Math.min(mnx, r[0] - r[2], r[3] - r[5]); mxx = Math.max(mxx, r[0] + r[2], r[3] + r[5]);
    mny = Math.min(mny, r[1] - r[2], r[4] - r[5]); mxy = Math.max(mxy, r[1] + r[2], r[4] + r[5]);
  }
  const pad = KW + OW + 2;
  const x0 = Math.floor(mnx - pad), y0 = Math.floor(mny - pad);
  const x1 = Math.ceil(mxx + S.ext + pad), y1 = Math.ceil(mxy + S.ext + pad);
  const w = x1 - x0, h = y1 - y0, M = w * h;
  const dF = new Float32Array(M), dS = new Float32Array(M), sP = new Float32Array(M);
  const hl = new Float32Array(M), grain = new Float32Array(M);
  const steps = Math.ceil(S.ext / 0.7);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const p = j * w + i, px = x0 + i, py = y0 + j;
    dF[p] = sdf(seg, n, px, py); sP[p] = OUT_S;
    let m = 1e9, sS = 0;
    for (let k = 1; k <= steps; k++) {
      const o = (S.ext * k) / steps;
      const d = sdf(seg, n, px - o, py - o);
      if (d < m) { m = d; sS = OUT_S; }
    }
    dS[p] = m;
    if (m < dF[p] - 0.5) sP[p] = sS;
    const hsh = Math.imul((px * 73856093) ^ (py * 19349663), 2654435761) >>> 0;
    grain[p] = (hsh % 1000) / 1000;
  }
  // highlight streaks: inside, near an edge whose outward normal faces up-left, dashed along the path
  for (let j = 1; j < h - 1; j++) for (let i = 1; i < w - 1; i++) {
    const p = j * w + i, d = dF[p];
    if (d > -1.0 || d < -2.9) continue;
    const gx = dF[p + 1] - dF[p - 1], gy = dF[p + w] - dF[p - w], gl = Math.hypot(gx, gy) || 1;
    const facing = (-gx - gy) / (gl * Math.SQRT2);
    if (facing < 0.45) continue;
    const dash = (sP[p] * len / 5) % 1;
    const band = 1 - Math.abs(d + 1.9) / 0.95;
    hl[p] = Math.max(0, band) * Math.min(1, (facing - 0.45) * 3) * (dash < 0.62 ? 1 : 0);
  }
  // drips: columns whose bottom fill edge has clear air below
  const drips = [];
  for (let i = 2; i < w - 2; i++) {
    for (let j = h - 2; j > 0; j--) {
      const p = j * w + i;
      if (dF[p] < -0.8) {
        let clear = true;
        for (let k = 2; k < 12 && j + k < h; k++) if (dF[(j + k) * w + i] < 0.5) { clear = false; break; }
        if (clear) drips.push([x0 + i, y0 + j + 0.5, i]);
        break;
      }
    }
  }
  // keep a few, spaced, chosen by hash
  const pick = [];
  for (const d of drips) {
    const hv = ((Math.imul(d[0] * 31 + g * 977 + S.ox * 13, 2654435761) >>> 0) % 1000) / 1000;
    if (hv < 0.22 && pick.every((q) => Math.abs(q[0] - d[0]) > 4)) pick.push([d[0], d[1], 2 + 6 * hv / 0.22, hv * 40]);
  }
  // glint: the most up-left point of the fill
  let gb = 1e9, glint = [cx, cy];
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const p = j * w + i;
    if (dF[p] < -1.6) { const sc = i + 1.3 * j; if (sc < gb) { gb = sc; glint = [x0 + i + 0.5, y0 + j + 0.5]; } }
  }
  // the path, sampled for the nozzle
  const path = new Float32Array(129 * 2);
  for (let q = 0; q <= 128; q++) {
    const s = q / 128;
    let k = 0;
    while (k < n - 1 && seg[k * 8 + 7] < s) k++;
    const o = k * 8, t = (s - seg[o + 6]) / Math.max(1e-6, seg[o + 7] - seg[o + 6]);
    path[2 * q] = seg[o] + (seg[o + 3] - seg[o]) * t;
    path[2 * q + 1] = seg[o + 1] + (seg[o + 4] - seg[o + 1]) * t;
  }
  return { x0, y0, w, h, dF, dS, sP, hl, grain, path, drips: pick, glint, top: mny, bot: mxy };
}

/** Point on the spray path at s (0..1), into out[0..1]. */
export function pathAt(B, s, out) {
  const f = Math.max(0, Math.min(1, s)) * 128, q = Math.min(127, Math.floor(f)), t = f - q, P = B.path;
  out[0] = P[2 * q] + (P[2 * q + 2] - P[2 * q]) * t;
  out[1] = P[2 * q + 1] + (P[2 * q + 3] - P[2 * q + 1]) * t;
  return out;
}
