// Ferrofluid numerals: ten bold pools of magnetic fluid, drawn as centre
// lines (a 10 x 16 design box) swept by a round brush and joined with a
// liquid fillet (smooth minimum), then baked at load into flash tables per
// size:
//   sdf    Int8 signed distance to the edge, 1/8 px (negative inside)
//   phase  Uint8 position along the stroke, 32 steps per wavelength, so a
//          wave can run along the strokes (seamless on closed loops)
//   spikes anchors on the OUTER edge only, each with its outward normal, its
//          stroke phase and the longest spike the free space allows (none
//          into a counter, none pointing down, short ones into open bays)
//   drips  the lowest points, where a drop can hang and fall
const TAU = Math.PI * 2;

function arc(cx, cy, rx, ry, a0, a1, step = 8) {
  const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / step));
  const p = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    p.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return p;
}

// centre lines in a 10 x 16 box, y down; angles in degrees, 0 = right, 90 = down
const SKEL = {
  0: [arc(5, 8, 3.6, 6.6, 0, 360, 6)],
  1: [[[2.3, 4.6], [3.9, 3.5], [5.3, 2.3], [6.0, 1.4]], [[6.0, 1.4], [6.0, 14.6]]],
  2: [arc(5, 4.85, 3.5, 3.45, 160, 395), [[7.87, 6.83], [5.9, 9.0], [3.5, 11.7], [1.45, 14.6]], [[1.45, 14.6], [8.6, 14.6]]],
  3: [arc(5, 4.5, 3.35, 3.1, 205, 450), [[5, 7.6], [3.6, 7.6]], arc(5, 11.0, 3.6, 3.6, 270, 515)],
  4: [[[7.0, 1.4], [1.3, 10.9]], [[1.3, 10.9], [8.7, 10.9]], [[7.0, 1.4], [7.0, 14.6]]],
  5: [[[8.4, 1.4], [2.4, 1.4]], [[2.4, 1.4], [2.3, 7.4]], arc(4.9, 10.5, 3.7, 4.1, 228, 518)],
  6: [arc(5, 10.75, 3.6, 3.85, 0, 360, 6), [[1.4, 10.75], [1.6, 7.0], [2.6, 4.3], [4.3, 2.2], [6.3, 1.4], [8.1, 1.8]]],
  7: [[[1.4, 1.4], [8.6, 1.4]], [[8.6, 1.4], [6.6, 5.4], [5.0, 9.7], [4.2, 14.6]]],
  8: [arc(5, 4.5, 3.1, 3.1, -90, 270, 6), arc(5, 11.05, 3.6, 3.55, -90, 270, 6)],
  9: [arc(5, 5.25, 3.6, 3.85, 0, 360, 6), [[8.6, 5.25], [8.4, 9.0], [7.4, 12.3], [5.4, 14.4], [3.0, 14.5], [1.6, 13.4]]],
};

const smin = (a, b, k) => {
  const h = Math.max(0, Math.min(1, 0.5 + (0.5 * (b - a)) / k));
  return b + (a - b) * h - k * h * (1 - h);
};

function segInfo(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = ax + dx * t - px, qy = ay + dy * t - py;
  return [Math.sqrt(qx * qx + qy * qy), t];
}

/**
 * Bake digit `d` for a box of w x h px with brush radius r.
 * Returns { bw, bh, pad, sdf, phase, spikes: [{x,y,nx,ny,L,u}], drips: [{x,y}] }.
 * Box coordinates: the glyph's design box starts at (pad, pad).
 */
export function bakeGlyph(d, w, h, r, { lmaxUp = 7, lmaxSide = 3, lmaxDown = 2, spacing = 3.6, lambda = 15 } = {}) {
  const pad = 7, bw = w + 2 * pad, bh = h + 2 * pad;
  const sx = w / 10, sy = h / 16;
  // strokes in px, with cumulative length and wavelength per stroke
  const strokes = SKEL[d].map((pts) => {
    const P = pts.map(([x, y]) => [pad + x * sx, pad + y * sy]);
    const cum = [0];
    for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
    const L = cum[cum.length - 1];
    const closed = Math.hypot(P[0][0] - P[P.length - 1][0], P[0][1] - P[P.length - 1][1]) < 0.01;
    const lam = closed ? L / Math.max(1, Math.round(L / lambda)) : lambda;
    return { P, cum, L, closed, lam };
  });
  strokes.forEach((s, k) => (s.off = k * 0.37));

  const sdfF = new Float32Array(bw * bh);
  const sdf = new Int8Array(bw * bh), phase = new Uint8Array(bw * bh);
  const field = (x, y) => {
    let D = 1e9, best = 1e9, u = 0;
    for (const s of strokes) {
      let ds = 1e9, us = 0;
      for (let i = 1; i < s.P.length; i++) {
        const [dd, t] = segInfo(x, y, s.P[i - 1][0], s.P[i - 1][1], s.P[i][0], s.P[i][1]);
        if (dd < ds) { ds = dd; us = s.cum[i - 1] + t * (s.cum[i] - s.cum[i - 1]); }
      }
      D = D === 1e9 ? ds : smin(D, ds, 2.2);
      if (ds < best) { best = ds; u = us / s.lam + s.off; }
    }
    return [D - r, u];
  };
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
    const [D, u] = field(x + 0.5, y + 0.5);
    const i = y * bw + x;
    sdfF[i] = D;
    sdf[i] = Math.max(-127, Math.min(127, Math.round(D * 8)));
    phase[i] = Math.floor((((u % 1) + 1) % 1) * 32) & 31;
  }
  // bit 5: the edge here faces the light (up and to the left): where the glint runs
  for (let y = 1; y < bh - 1; y++) for (let x = 1; x < bw - 1; x++) {
    const i = y * bw + x;
    const gx = sdfF[i + 1] - sdfF[i - 1], gy = sdfF[i + bw] - sdfF[i - bw], gl = Math.hypot(gx, gy) || 1;
    if ((-0.55 * gx - 0.83 * gy) / gl > 0.78) phase[i] |= 32;
  }
  // exterior: ground connected to the box border (counters are not)
  const ext = new Uint8Array(bw * bh), stack = [];
  for (let x = 0; x < bw; x++) { stack.push(x, (bh - 1) * bw + x); }
  for (let y = 0; y < bh; y++) { stack.push(y * bw, y * bw + bw - 1); }
  while (stack.length) {
    const i = stack.pop();
    if (ext[i] || sdfF[i] < 0.6) continue;
    ext[i] = 1;
    const x = i % bw, y = (i / bw) | 0;
    if (x > 0) stack.push(i - 1);
    if (x < bw - 1) stack.push(i + 1);
    if (y > 0) stack.push(i - bw);
    if (y < bh - 1) stack.push(i + bw);
  }
  const at = (x, y) => {
    const ix = Math.floor(x), iy = Math.floor(y);
    if (ix < 0 || iy < 0 || ix >= bw || iy >= bh) return [9, 1];
    return [sdfF[iy * bw + ix], ext[iy * bw + ix]];
  };

  // spike anchors: along each stroke, both sides, plus the end caps
  const cand = [];
  for (const s of strokes) {
    const n = Math.max(1, Math.round(s.L / spacing));
    for (let k = 0; k <= n; k++) {
      if (s.closed && k === n) break;
      const want = (k / n) * s.L;
      let i = 1;
      while (i < s.P.length - 1 && s.cum[i] < want) i++;
      const a = s.P[i - 1], b = s.P[i], seg = s.cum[i] - s.cum[i - 1] || 1, t = (want - s.cum[i - 1]) / seg;
      const px = a[0] + (b[0] - a[0]) * t, py = a[1] + (b[1] - a[1]) * t;
      const tx = (b[0] - a[0]) / seg, ty = (b[1] - a[1]) / seg;
      const u = want / s.lam + s.off;
      cand.push([px, py, -ty, tx, u], [px, py, ty, -tx, u]);
      if (!s.closed && (k === 0 || k === n)) {
        const sg = k === 0 ? -1 : 1;
        for (const ang of [0]) {
          const c = Math.cos(ang), sn = Math.sin(ang);
          const ex = sg * tx, ey = sg * ty;
          cand.push([px, py, ex * c - ey * sn, ex * sn + ey * c, u]);
        }
      }
    }
  }
  const spikes = [], drips = [];
  for (const [px, py, nx, ny, u] of cand) {
    const ax = px + nx * r, ay = py + ny * r;
    if (at(ax + nx * 1.2, ay + ny * 1.2)[0] < 0.5) continue;   // buried in another stroke
    if (ny > 0.75) drips.push({ x: ax, y: ay, u });
    let free = 99, bad = false;
    for (let q = 1.5; q <= 14; q += 0.5) {
      const [dd, e] = at(ax + nx * q, ay + ny * q);
      if (dd < 0.3) { free = q; break; }
      if (!e) { bad = true; break; }                           // would point into a counter
    }
    if (bad) continue;
    const up = Math.max(0, Math.min(1, -ny)), dn = Math.max(0, Math.min(1, ny));
    const lmax = lmaxSide + (lmaxUp - lmaxSide) * up * up + (lmaxDown - lmaxSide) * dn;
    const L = free > 50 ? lmax : free > 13 ? Math.min(lmax, (free - 6) / 3) : 0;   // into open bays only short ones, and only wide bays
    if (L < 1.5) continue;
    spikes.push({ x: ax, y: ay, nx, ny, L, open: free > 50 ? 1 : 0, u: (((u % 1) + 1) % 1) });
  }
  // the lowest few drip points, spread apart
  drips.sort((a, b) => b.y - a.y);
  const dd = [];
  for (const p of drips) if (dd.length < 3 && dd.every((q) => Math.abs(q.x - p.x) > 5) && p.y > bh - pad - 6) dd.push(p);
  return { bw, bh, pad, w, h, sdf, phase, spikes, drips: dd.length ? dd : [{ x: bw / 2, y: bh - pad, u: 0 }] };
}

export const DIGITS = '0123456789';
export { TAU };
