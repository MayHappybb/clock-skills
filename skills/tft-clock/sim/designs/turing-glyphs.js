// Turing: the ten numerals as living tissue, and their distance maps.
//
// Each digit is a few strokes, each stroke a centreline of points
// [x, y, r] in a 32 x 66 glyph box (y down): r is the tissue's half-width
// there, so strokes swell in their bellies and taper to rounded tips, like
// a body grown rather than a letter drawn. Nothing here is a font outline.
//
// From the strokes, once (flash tables on the device, built lazily here):
//   SD    signed distance to the glyph's outline, px (negative inside), on a
//         padded map. The skin's stripes inside a digit run along it, so they
//         hug the outline the way Turing stripes align to a boundary, and
//         the inhibition moat outside reads it too.
//   SEED  distance to the nearest of the digit's nucleation seeds, spaced
//         along the centrelines. A digit grows as max(SD, SEED - R): spots
//         at the seeds that swell and fuse into the strokes, and it heals
//         away the same way backwards.
//
// On the device: two Int8 maps per glyph in quarter pixels, 52 x 86 each,
// 11 glyphs (the colon is one) = ~98 KB of flash, or keep one map and
// derive SEED from 3 seed points per cell; either is a lookup a pixel.

export const GW = 32, GH = 66, PAD = 10;
export const MW = GW + 2 * PAD, MH = GH + 2 * PAD;

const D2R = Math.PI / 180;

/** Points along an elliptic arc, degrees, y down (0 = right, 90 = down); r eased from r0 to r1 (or a function of angle). */
function arc(cx, cy, rx, ry, a0, a1, r0, r1, n = 0) {
  n = n || Math.max(8, Math.round(Math.abs(a1 - a0) / 9));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, a = (a0 + (a1 - a0) * u) * D2R;
    const r = typeof r0 === 'function' ? r0(a) : r0 + (r1 - r0) * u;
    pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a), r]);
  }
  return pts;
}

/** Quadratic sweep from p0 through control c to p1 ([x, y, r] ends). */
function quad(p0, c, p1, n = 12) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, v = 1 - u;
    pts.push([v * v * p0[0] + 2 * u * v * c[0] + u * u * p1[0], v * v * p0[1] + 2 * u * v * c[1] + u * u * p1[1], p0[2] + (p1[2] - p0[2]) * u]);
  }
  return pts;
}

/** A body that swells at its sides and slims at top and bottom. */
const belly = (fat, thin) => (a) => (fat + thin) / 2 + ((fat - thin) / 2) * Math.cos(2 * a);

// Strokes per digit. Half-widths ~5 (10 px of tissue), tips ~3.6.
const STROKES = {
  0: [arc(16, 33, 10.6, 27.6, -90, 270, belly(5.7, 4.5), 0, 44)],
  1: [
    quad([7.5, 18, 3.4], [13, 14.5], [19.5, 6, 5.0], 10),
    [[19.5, 6, 5.0], [19.5, 34, 5.6], [19.5, 60.5, 5.4]],
  ],
  2: [
    arc(16, 19.5, 10.4, 13.6, 192, 395, 3.6, 5.3),
    quad([16 + 10.4 * Math.cos(35 * D2R), 19.5 + 13.6 * Math.sin(35 * D2R), 5.3], [14, 42], [6, 60.5, 5.2], 14),
    [[6, 60.5, 5.2], [17, 60.5, 4.9], [27.2, 60.5, 4.0]],
  ],
  3: [
    arc(15.5, 18.2, 10.2, 12.4, 205, 450, 3.6, 4.9),
    [[15.5, 30.6, 4.9], [10.5, 30.6, 3.9]],
    arc(15.5, 45.6, 11.2, 15.0, 270, 518, 5.0, 3.6),
  ],
  4: [
    [[21, 6, 4.4], [12.5, 26, 4.9], [5, 44, 5.0]],
    [[5, 44, 5.0], [17, 44, 4.8], [28.2, 44, 3.8]],
    [[21, 7, 4.6], [21, 34, 5.5], [21, 61, 5.3]],
  ],
  5: [
    [[27, 6, 3.8], [17, 6, 4.8], [9, 6, 5.0]],
    [[9, 6, 5.0], [8.3, 30, 5.0]],
    arc(15.6, 44.2, 10.6, 15.6, 233, 512, 4.9, 3.6),
  ],
  6: [
    quad([25.5, 8.5, 3.6], [6.5, 9.5], [5.4, 43, 5.3], 16),
    arc(16, 43, 10.6, 17.4, 180, 540, belly(5.4, 4.6), 0, 36),
  ],
  7: [
    [[5, 6, 4.0], [16, 6, 4.8], [27, 6, 5.1]],
    quad([27, 6, 5.1], [19, 30], [13, 60.5, 5.4], 14),
  ],
  8: [
    arc(16, 18.4, 9.0, 12.4, 90, 450, belly(5.1, 4.3), 0, 32),
    arc(16, 46, 10.8, 14.6, -90, 270, belly(5.6, 4.5), 0, 36),
  ],
  9: [
    arc(16, 23, 10.6, 17.4, 0, 360, belly(5.4, 4.6), 0, 36),
    quad([26.6, 23, 5.3], [26.0, 55], [7, 58, 3.6], 16),
  ],
  // The colon: two Turing spots.
  10: [[[16, 23, 3.6]], [[16, 43, 3.6]]],
};

// ------------------------------------------------------------ maps

function segments(strokes) {
  const segs = [];
  for (const s of strokes) {
    if (s.length === 1) { segs.push([s[0][0], s[0][1], s[0][2], s[0][0], s[0][1], s[0][2]]); continue; }
    for (let i = 0; i + 1 < s.length; i++) segs.push([...s[i], ...s[i + 1]]);
  }
  return segs;
}

/** Nucleation seeds every ~9 px of centreline, merged when closer than 5 px. */
function seedsOf(strokes) {
  const out = [];
  for (const s of strokes) {
    let L = 0;
    const acc = [0];
    for (let i = 0; i + 1 < s.length; i++) { L += Math.hypot(s[i + 1][0] - s[i][0], s[i + 1][1] - s[i][1]); acc.push(L); }
    const n = Math.max(1, Math.round(L / 9));
    for (let k = 0; k < n; k++) {
      const at = (k + 0.5) * (L / n);
      let i = 0;
      while (i + 2 < acc.length && acc[i + 1] < at) i++;
      const span = acc[i + 1] - acc[i] || 1, u = s.length === 1 ? 0 : (at - acc[i]) / span;
      const a = s[i], b = s[Math.min(i + 1, s.length - 1)];
      const p = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
      if (!out.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 5)) out.push(p);
    }
  }
  return out;
}

function build(strokes) {
  const segs = segments(strokes), seeds = seedsOf(strokes);
  const sd = new Float32Array(MW * MH), seed = new Float32Array(MW * MH), near = new Uint8Array(MW * MH);
  let full = 0;
  for (let my = 0; my < MH; my++)
    for (let mx = 0; mx < MW; mx++) {
      const px = mx - PAD + 0.5, py = my - PAD + 0.5;
      let best = 1e9;
      for (const [ax, ay, ar, bx, by, br] of segs) {
        const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
        let u = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
        u = u < 0 ? 0 : u > 1 ? 1 : u;
        const d = Math.hypot(px - ax - dx * u, py - ay - dy * u) - (ar + (br - ar) * u);
        if (d < best) best = d;
      }
      let sb = 1e9, sn = 0;
      seeds.forEach(([sx, sy], k) => { const d = Math.hypot(px - sx, py - sy); if (d < sb) { sb = d; sn = k; } });
      const i = my * MW + mx;
      sd[i] = best; seed[i] = sb; near[i] = sn;
      if (best < 0.5 && sb > full) full = sb;
    }
  // `full`: the growth radius at which seed spots have fused into the whole glyph.
  return { sd, seed, near, full: full + 0.5, seeds };
}

let CACHE = null;
/** The 11 glyph maps (0-9 and the colon as 10), built once on first use. */
export function glyphs() {
  if (!CACHE) CACHE = Array.from({ length: 11 }, (_, d) => build(STROKES[d]));
  return CACHE;
}
