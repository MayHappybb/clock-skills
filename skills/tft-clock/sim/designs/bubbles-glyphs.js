// Bubble letters for 'bubbles': ten fat, inflated numerals drawn as soap
// film. Each digit is a skeleton of strokes and arcs, inflated by a radius
// and smooth-unioned so the joins swell like blown film. Built once at load
// into byte tables (flash on the device):
//   sdf    Int8, signed distance to the film's outer edge in quarter pixels
//          (negative inside), clamped to +-31 px
//   uv, vv per-pixel position in the tube: half-px arc length along the
//          nearest stroke, and (stroke id << 5 | quarter-px distance from its spine)
//   chains per stroke, the foam cells strung along it
//   drops  Int16 pairs: points on the rim where the film beads into drops
//          when the bubble pops
// Two sizes: hours (36 x 62 box) and minutes (0.78 of that).

const MARGIN = 7;

// ---- skeletons in the 36 x 62 design box. Angles in degrees, 0 = right, 90 = down.
function arc(cx, cy, rx, ry, a0, a1) {
  const pts = [], n = Math.max(6, Math.ceil(Math.abs(a1 - a0) / 6));
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + (a1 - a0) * i / n) * Math.PI) / 180;
    pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return pts;
}

// Each digit: a list of [polyline, radius] strokes (radius default R).
const R = 5.2;
const SKEL = {
  0: [[arc(18, 31, 12, 25, 0, 360)]],
  1: [[[[9, 16], [19.5, 6.5], [19.5, 55.5]]], [[[9, 56], [29, 56]], 5]],
  2: [[arc(18, 18.5, 12, 12.5, 168, 395).concat([[7, 55.5]])], [[[7, 56], [30, 56]]]],
  3: [[arc(17.5, 17, 11.5, 11, 200, 450)], [[[17.5, 28.5], [11, 29]], 5.2], [arc(17.5, 42, 12.5, 14, -90, 158)]],
  4: [[[[18.5, 6], [5, 41], [32, 41]]], [[[26, 15], [26, 56]]]],
  5: [[[[29, 6.5], [9.5, 6.5], [8, 29]]], [arc(17.5, 40.5, 12.5, 15, -146, 150)]],
  6: [[arc(18, 40.5, 12, 15.5, 0, 360)], [[[28.5, 9], [20, 6.5], [12, 11], [7.5, 21], [6, 33], [6.2, 41]]]],
  7: [[[[6, 6.5], [30, 6.5]]], [[[30, 6.5], [22.5, 24], [15.5, 56]]]],
  8: [[arc(18, 17, 10.2, 11, 0, 360)], [arc(18, 42, 12.5, 14, 0, 360)]],
  9: [[arc(18, 21.5, 12, 15.5, 0, 360)], [[[29.8, 23], [29.6, 35], [26, 46], [18.5, 54.5], [8.5, 56]]]],
};

// distance to a segment, and how far along it the nearest point is
let PROJ = 0;
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
  let u = l ? ((px - ax) * dx + (py - ay) * dy) / l : 0;
  u = u < 0 ? 0 : u > 1 ? 1 : u;
  PROJ = u * Math.sqrt(l);
  const ex = px - ax - u * dx, ey = py - ay - u * dy;
  return Math.sqrt(ex * ex + ey * ey);
}
// polynomial smooth minimum: puffy joins
function smin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

// The foam inside a tube: a periodic chain of cells along the stroke. For
// each half-pixel step u along the chain, CELL holds the signed distance to
// the cell centre (half px) and the cell radius (quarter px).
function chain(len2, closed, inner, seed) {
  let x = seed >>> 0;
  const rnd = () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; };
  const diam = [];
  const lo = Math.max(8, Math.round(inner * 2 * 1.6)), hi = Math.round(inner * 2 * 2.5);   // half px
  let sum = 0;
  const target = closed ? len2 : Math.max(len2 + 24, 64);
  while (sum < target) { const d = lo + Math.floor(rnd() * (hi - lo + 1)); diam.push(d); sum += d; }
  if (closed) {
    // stretch to fit the loop exactly
    const k = len2 / sum; sum = 0;
    for (let i = 0; i < diam.length; i++) { diam[i] = Math.max(6, Math.round(diam[i] * k)); sum += diam[i]; }
    diam[diam.length - 1] += len2 - sum; sum = len2;
  }
  const P = sum, du = new Int8Array(P), rad = new Uint8Array(P), cid = new Uint8Array(P);
  let at = 0, ci = 0;
  for (const d of diam) {
    for (let j = 0; j < d; j++) { du[at + j] = Math.round(j + 0.5 - d / 2); rad[at + j] = d; cid[at + j] = ci; }   // radius in quarter px = diameter in half px
    at += d; ci++;
  }
  return { P, du, rad, cid, n: ci };
}

function build(d, scale) {
  const bw = Math.round(36 * scale), bh = Math.round(62 * scale);
  const gw = bw + 2 * MARGIN, gh = bh + 2 * MARGIN;
  const strokes = SKEL[d].map(([pl, r]) => {
    const pts = pl.map(([x, y]) => [x * scale, y * scale]);
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const closed = Math.hypot(pts[0][0] - pts.at(-1)[0], pts[0][1] - pts.at(-1)[1]) < 0.01;
    return { pts, cum, closed, r: (r ?? R) * (0.5 + 0.5 * scale) - (scale < 1 ? 0.15 : 0) };
  });
  const f = new Float32Array(gw * gh);
  const sdf = new Int8Array(gw * gh), uv = new Uint8Array(gw * gh), vv = new Uint8Array(gw * gh);
  for (let gy = 0; gy < gh; gy++)
    for (let gx = 0; gx < gw; gx++) {
      const px = gx + 0.5 - MARGIN, py = gy + 0.5 - MARGIN;
      let best = 1e9, nearest = 1e9, sid = 0, u = 0, v = 0;
      strokes.forEach((S, k) => {
        let m = 1e9, mu = 0;
        for (let i = 0; i + 1 < S.pts.length; i++) {
          const q = segDist(px, py, S.pts[i][0], S.pts[i][1], S.pts[i + 1][0], S.pts[i + 1][1]);
          if (q < m) { m = q; mu = S.cum[i] + PROJ; }
        }
        if (m - S.r < nearest) { nearest = m - S.r; sid = k; u = mu; v = m; }
        best = best === 1e9 ? m - S.r : smin(best, m - S.r, 2.6 * scale);
      });
      const i = gy * gw + gx;
      f[i] = best;
      sdf[i] = Math.max(-127, Math.min(127, Math.round(best * 4)));
      uv[i] = Math.min(255, Math.round(u * 2));
      vv[i] = (sid << 5) | Math.min(31, Math.round(v * 4));
    }
  // counters: outside the skin but enclosed by it (not reachable from the
  // box edge). Flagged in vv bit 7 so loose bubbles behind stay hidden there.
  const out = new Uint8Array(gw * gh), st = [];
  for (let x = 0; x < gw; x++) st.push(x, (gh - 1) * gw + x);
  for (let y = 0; y < gh; y++) st.push(y * gw, y * gw + gw - 1);
  while (st.length) {
    const i = st.pop();
    if (out[i] || f[i] <= 0) continue;
    out[i] = 1;
    const x = i % gw, y = (i / gw) | 0;
    if (x > 0) st.push(i - 1); if (x < gw - 1) st.push(i + 1);
    if (y > 0) st.push(i - gw); if (y < gh - 1) st.push(i + gw);
  }
  for (let i = 0; i < gw * gh; i++) if (f[i] > 0 && !out[i]) vv[i] |= 128;
  const chains = strokes.map((S, k) => chain(Math.round(S.cum.at(-1) * 2), S.closed, S.r - 2, d * 977 + k * 131 + Math.round(scale * 100)));

  // beads on the rim, for the pop: the rim mid-line on a sparse lattice
  const dr = [];
  for (let gy = 0; gy < gh; gy++)
    for (let gx = 0; gx < gw; gx++) {
      const v = f[gy * gw + gx];
      if (v > -1.6 && v <= -0.4 && ((gx * 7 + gy * 3) % 4 === 0) && (gx + gy) % 2 === 0) dr.push(gx, gy);
    }
  return { gw, gh, bw, bh, sdf, uv, vv, chains, drops: Int16Array.from(dr) };
}

export const HOUR = [], MIN = [];
for (let d = 0; d < 10; d++) { HOUR.push(build(d, 1)); MIN.push(build(d, 0.72)); }

export const FLASH_BYTES = [...HOUR, ...MIN].reduce((s, g) => s + g.sdf.length * 3 + g.drops.length * 2 + g.chains.reduce((a, c) => a + c.P * 2, 0), 0);
