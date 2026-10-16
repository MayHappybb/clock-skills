// Ouija: the spirit's numerals. A Victorian modern-face (Didone) figure set,
// the kind printed on a 1890s talking board: hairline tops and bottoms,
// thick sides, ball terminals. Each figure is a union of a few shapes
// (stressed elliptical rings, tapered strokes, discs, bars) in a 17 x 27 box,
// sampled once at load with 4 x 4 supersampling into a coverage mask, plus a
// distance-to-ink field for the cold aura round it. Nothing here runs per
// frame except the lookups.

export const GW = 17, GH = 27, PAD = 4;
export const MW = GW + 2 * PAD, MH = GH + 2 * PAD;   // mask size, with room for the aura
export const CW = 7;                                // the colon's box width

const TK = 4.2, TN = 1.5;
const DEG = Math.PI / 180;

// ---- shape tests, (x, y) in glyph box pixels
function inRing(x, y, [, cx, cy, rx, ry, tk, tn, a0, a1]) {
  const dx = x - cx, dy = y - cy;
  const ox = rx + tk / 2, oy = ry + tn / 2, ix = rx - tk / 2, iy = ry - tn / 2;
  if ((dx / ox) ** 2 + (dy / oy) ** 2 > 1) return false;
  if ((dx / ix) ** 2 + (dy / iy) ** 2 < 1) return false;
  if (a0 === undefined) return true;
  let a = Math.atan2(dx, -dy) / DEG;            // clock angle, 0 = up, clockwise
  if (a < 0) a += 360;
  return a0 <= a1 ? a >= a0 && a <= a1 : a >= a0 || a <= a1;
}
function inCap(x, y, [, x0, y0, x1, y1, w0, w1]) {
  const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy;
  let u = ((x - x0) * dx + (y - y0) * dy) / l2;
  u = u < 0 ? 0 : u > 1 ? 1 : u;
  const ex = x - x0 - u * dx, ey = y - y0 - u * dy;
  return ex * ex + ey * ey <= ((w0 + (w1 - w0) * u) / 2) ** 2;
}
function inPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function inShape(x, y, s) {
  switch (s[0]) {
    case 'ring': return inRing(x, y, s);
    case 'cap': return inCap(x, y, s);
    case 'disc': return (x - s[1]) ** 2 + (y - s[2]) ** 2 <= s[3] ** 2;
    case 'rect': return x >= s[1] && x <= s[3] && y >= s[2] && y <= s[4];
    case 'poly': return inPoly(x, y, s[1]);
    default: throw new Error(`ouija-ghost: shape ${s[0]}`);
  }
}

// ---- the figures
const SIX = [
  ['ring', 8.5, 18.6, 6.0, 7.0, TK, TN],
  ['ring', 12.6, 18.6, 10.0, 15.6, TK, TN, 270, 359.9],
  ['disc', 13.3, 3.9, 2.4],
];
export const FIGURES = {
  0: [['ring', 8.5, 13.5, 6.3, 11.6, TK, TN]],
  1: [
    ['rect', 6.6, 1.4, 10.8, 25.6],
    ['cap', 7.4, 2.4, 2.6, 7.0, 2.4, 1.3],
    ['rect', 2.8, 25.4, 14.4, 27],
    ['poly', [[3.8, 25.6], [6.7, 22.6], [6.7, 25.6]]],
    ['poly', [[10.7, 22.6], [13.6, 25.6], [10.7, 25.6]]],
  ],
  2: [
    ['ring', 8.5, 8.0, 5.9, 6.1, 3.9, TN, 296, 128],
    ['disc', 3.9, 6.6, 2.5],
    ['cap', 13.0, 12.2, 2.4, 25.2, 3.7, 1.7],
    ['rect', 1.4, 24.4, 15.6, 27],
    ['rect', 14.0, 21.6, 15.6, 27],
  ],
  3: [
    ['ring', 8.0, 7.0, 5.3, 5.5, 3.7, TN, 292, 172],
    ['disc', 3.7, 5.6, 2.3],
    ['ring', 8.4, 19.2, 6.3, 6.8, TK, TN, 0, 248],
    ['disc', 3.0, 21.4, 2.5],
    ['cap', 6.0, 12.7, 9.0, 12.7, 1.5, 1.5],
  ],
  4: [
    ['rect', 10.2, 1.2, 14.4, 25.6],
    ['cap', 11.0, 1.6, 1.4, 19.0, 1.8, 1.8],
    ['rect', 1.0, 18.0, 16.6, 19.9],
    ['rect', 7.8, 25.4, 16.6, 27],
  ],
  5: [
    ['rect', 4.6, 1.2, 15.6, 3.7],
    ['rect', 14.2, 0.4, 15.6, 3.7],
    ['cap', 5.2, 2.0, 4.4, 12.6, 2.0, 1.8],
    ['ring', 8.4, 18.2, 6.2, 7.2, TK, TN, 318, 236],
    ['disc', 3.3, 22.2, 2.5],
  ],
  6: SIX,
  7: [
    ['rect', 1.4, 1.2, 15.8, 3.8],
    ['rect', 1.4, 1.2, 3.0, 6.6],
    ['cap', 15.2, 3.4, 10.2, 14.4, 2.2, 3.7],
    ['cap', 10.2, 14.4, 7.8, 25.2, 3.7, 4.3],
  ],
  8: [
    ['ring', 8.5, 7.3, 5.0, 5.7, 3.6, 1.4],
    ['ring', 8.5, 19.4, 6.0, 6.9, TK, TN],
  ],
  // 9 is the 6 turned half a turn
  9: SIX.map((s) => {
    if (s[0] === 'ring') {
      const r = [...s]; r[1] = GW - s[1]; r[2] = GH - s[2];
      if (s[7] !== undefined) { r[7] = (s[7] + 180) % 360; r[8] = (s[8] + 180) % 360; }
      return r;
    }
    return ['disc', GW - s[1], GH - s[2], s[3]];
  }),
  ':': [['disc', 3.5, 9.6, 2.1], ['disc', 3.5, 19.4, 2.1]],
};

/**
 * A figure's masks, PAD pixels of margin all round: `cov` ink coverage 0..1,
 * `dist` distance (px) from each pixel centre to the nearest inked pixel
 * centre (0 on the ink), for the aura.
 */
function bake(shapes) {
  const cov = new Float32Array(MW * MH), dist = new Float32Array(MW * MH);
  const S = 4;
  for (let j = 0; j < MH; j++)
    for (let i = 0; i < MW; i++) {
      let n = 0;
      for (let sy = 0; sy < S; sy++)
        for (let sx = 0; sx < S; sx++) {
          const x = i - PAD + (sx + 0.5) / S, y = j - PAD + (sy + 0.5) / S;
          if (shapes.some((s) => inShape(x, y, s))) n++;
        }
      cov[j * MW + i] = n / (S * S);
    }
  for (let j = 0; j < MH; j++)
    for (let i = 0; i < MW; i++) {
      let best = 99;
      for (let v = Math.max(0, j - 6); v < Math.min(MH, j + 7); v++)
        for (let u = Math.max(0, i - 6); u < Math.min(MW, i + 7); u++) {
          const c = cov[v * MW + u];
          if (c < 0.35) continue;
          const d = Math.hypot(u - i, v - j) + (1 - c) * 0.8;
          if (d < best) best = d;
        }
      dist[j * MW + i] = best;
    }
  return { cov, dist };
}

export const GLYPHS = Object.fromEntries(Object.entries(FIGURES).map(([k, s]) => [k, bake(s)]));

/** Bilinear lookup in a mask at fractional mask coordinates; `out` beyond the edge. */
export function sample(arr, u, v, out = 0) {
  if (u < 0 || v < 0 || u > MW - 1 || v > MH - 1) return out;
  const i = u | 0, j = v | 0, fu = u - i, fv = v - j;
  const i1 = i + 1 < MW ? i + 1 : i, j1 = j + 1 < MH ? j + 1 : j;
  const a = arr[j * MW + i], b = arr[j * MW + i1], c = arr[j1 * MW + i], d = arr[j1 * MW + i1];
  return (a + (b - a) * fu) * (1 - fv) + (c + (d - c) * fu) * fv;
}
