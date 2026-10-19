// Papel picado sheets as cut masks. Every sheet is W x H pixels of tissue;
// a mask says, per texel, how much of it is paper at all (the silhouette,
// with its scalloped hem) and how much of that is cut away (the holes).
// The numerals are stencil cuts: bold holes whose counters are paper
// islands held on by thin bridges, with a flower punched into each island.
// The lace round them is fine slits, so it lets through far less light
// than the numerals and stays a texture, not a second set of figures.
//
// Masks are built once at 8x8 subsamples per pixel and stored at 2 texels
// per pixel (TW x TH), so a sheet can be sampled bilinearly at any warp.

export const W = 38, H = 50;            // sheet size in pixels
export const TS = 2;                    // texels per pixel
export const TW = W * TS, TH = H * TS;
const SS = 8;                           // subsamples per pixel while cutting
const MW = W * SS, MH = H * SS;
const DX = 7, DY = 11;                  // digit box (24 x 34) inside the sheet
export const FOLD = 3;                  // the top band folded over the string

// ---------------------------------------------------------------- cutting
const newMask = () => new Uint8Array(MW * MH);
function disc(m, x, y, r, val = 1) {
  const x0 = Math.max(0, Math.floor((x - r) * SS)), x1 = Math.min(MW - 1, Math.ceil((x + r) * SS));
  const y0 = Math.max(0, Math.floor((y - r) * SS)), y1 = Math.min(MH - 1, Math.ceil((y + r) * SS));
  const r2 = r * r;
  for (let j = y0; j <= y1; j++) {
    const dy = (j + 0.5) / SS - y;
    for (let i = x0; i <= x1; i++) {
      const dx = (i + 0.5) / SS - x;
      if (dx * dx + dy * dy <= r2) m[j * MW + i] = val;
    }
  }
}
/** Catmull-Rom through [x, y, r] points, stamping discs every 0.12 px. */
function stroke(m, pts, val = 1, grow = 0) {
  const n = pts.length;
  if (n === 1) { disc(m, pts[0][0], pts[0][1], pts[0][2] + grow, val); return; }
  for (let k = 0; k < n - 1; k++) {
    const p0 = pts[Math.max(0, k - 1)], p1 = pts[k], p2 = pts[k + 1], p3 = pts[Math.min(n - 1, k + 2)];
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const steps = Math.max(2, Math.ceil(len / 0.12));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps, t2 = t * t, t3 = t2 * t;
      const cr = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      const r = p1[2] + (p2[2] - p1[2]) * t;
      disc(m, cr(p0[0], p1[0], p2[0], p3[0]), cr(p0[1], p1[1], p2[1], p3[1]), r + grow, val);
    }
  }
}
/** Ellipse as stroke points; a = 0 at the top, clockwise; rf(a) gives the radius. */
function ell(cx, cy, rx, ry, rf, a0 = 0, a1 = Math.PI * 2, n = 72) {
  const pts = [];
  for (let k = 0; k <= n; k++) {
    const a = a0 + (a1 - a0) * k / n;
    pts.push([cx + rx * Math.sin(a), cy - ry * Math.cos(a), rf(a)]);
  }
  return pts;
}
const swell = (thin, thick) => (a) => thin + (thick - thin) * Math.abs(Math.sin(a));

// ---------------------------------------------------------------- numerals
// Each: strokes (lists of [x, y, r] in the 24 x 34 digit box), balls
// (terminal discs), bridges ([x0, y0, x1, y1]: paper left across a stroke so
// a counter island stays attached) and flowers ([x, y, r]: punched into the
// islands).
const rot = (pts) => pts.map(([x, y, r]) => [24 - x, 34 - y, r]);
const SIX_TAIL = [[18.4, 5.0, 2.6], [14.5, 2.0, 1.9], [8.6, 3.3, 2.4], [4.6, 9.0, 2.9], [3.2, 16.5, 3.1], [3.1, 23.4, 3.1]];
const SIX_BOWL = ell(12, 23.4, 8.9, 9.0, swell(1.8, 3.1));
const DIGITS = {
  0: { strokes: [ell(12, 17, 9.1, 14.3, swell(1.8, 3.2))], balls: [],
       bridges: [[12, 0.6, 12, 4.8], [12, 29.2, 12, 33.4]], flowers: [[12, 17, 2.4]] },
  1: { strokes: [[[13.6, 1.2, 2.6], [13.6, 33, 3.1]], [[13.4, 1.6, 2.3], [9.5, 4.4, 2.0], [6.0, 6.2, 2.0]],
                 [[6.6, 32.4, 1.8], [20.6, 32.4, 1.8]]],
       balls: [[5.8, 6.6, 2.7]], bridges: [], flowers: [] },
  2: { strokes: [[[4.6, 9.4, 2.6], [6.2, 4.4, 2.1], [12, 1.9, 1.8], [18.4, 4.4, 2.4], [20.6, 10, 3.1], [18.2, 17, 3.0],
                  [11.8, 24, 2.6], [5.6, 29.6, 2.2], [3.3, 32.3, 2.1]],
                 [[3.3, 32.3, 2.1], [21.2, 32.3, 2.1], [22.2, 29.4, 1.9]]],
       balls: [[4.6, 9.4, 3.1]], bridges: [], flowers: [] },
  3: { strokes: [[[4.2, 6.6, 2.6], [7.2, 2.8, 2.0], [12, 1.8, 1.8], [17.4, 3.2, 2.4], [19.6, 8.2, 2.9], [17, 13.6, 2.4], [11.2, 15.9, 1.9]],
                 [[11.2, 15.9, 1.9], [17.6, 17.6, 2.6], [21, 24, 3.2], [18.2, 30.5, 2.6], [12, 32.4, 1.9], [6.4, 31.2, 2.2], [3.8, 27.6, 2.6]]],
       balls: [[4.2, 6.8, 3.0], [3.8, 27.6, 3.0]], bridges: [], flowers: [] },
  4: { strokes: [[[16.6, 1.8, 3.0], [16.6, 33, 3.1]], [[15.6, 2.2, 2.2], [9.2, 12.4, 2.4], [2.6, 23.4, 2.3]],
                 [[2.6, 23.4, 2.2], [23.2, 23.4, 2.2]], [[11.8, 32.6, 1.7], [21.6, 32.6, 1.7]]],
       balls: [], bridges: [[7.2, 11.4, 11.2, 13.8]], flowers: [] },
  5: { strokes: [[[21.4, 2.3, 2.1], [7.2, 2.3, 2.2]], [[21.4, 2.3, 1.9], [22.2, 5.2, 1.8]], [[7.2, 2.3, 2.4], [6.2, 14.6, 2.4]],
                 [[6.2, 14.6, 2.2], [11.6, 11.8, 2.0], [17.6, 13.6, 2.6], [21, 20.4, 3.2], [19.4, 27.8, 2.8], [13, 32.4, 1.9],
                  [7.2, 31.4, 2.2], [3.8, 27.6, 2.6]]],
       balls: [[3.8, 27.6, 3.0]], bridges: [], flowers: [] },
  6: { strokes: [SIX_TAIL, SIX_BOWL], balls: [[18.6, 5.4, 3.0]],
       bridges: [[18.6, 23.4, 23.4, 23.4]], flowers: [[12, 23.4, 1.9]] },
  7: { strokes: [[[3.0, 2.4, 2.2], [21.6, 2.4, 2.3]], [[3.0, 2.4, 2.0], [2.6, 6.6, 1.9]],
                 [[21.6, 2.4, 2.3], [17.2, 12, 2.8], [13, 22, 3.1], [11, 33, 3.1]]],
       balls: [[2.6, 6.8, 2.5]], bridges: [], flowers: [] },
  8: { strokes: [ell(12, 8.9, 7.3, 7.2, swell(1.7, 2.7)), ell(12, 24.6, 9.0, 8.6, swell(1.8, 3.2))], balls: [],
       bridges: [[12, 0.2, 12, 3.6], [12, 31.4, 12, 34.6]], flowers: [[12, 8.9, 1.0], [12, 24.6, 1.9]] },
  9: { strokes: [rot(SIX_TAIL), rot(SIX_BOWL)], balls: [[24 - 18.6, 34 - 5.4, 3.0]],
       bridges: [[24 - 18.6, 34 - 23.4, 24 - 23.4, 34 - 23.4]], flowers: [[12, 34 - 23.4, 1.9]] },
};

/** A punched flower: n petal slits round a centre dot. */
function flower(m, x, y, r, n = 5, val = 1, rot0 = 0) {
  if (r < 1.5) { disc(m, x, y, Math.max(0.55, r * 0.55), val); return; }
  disc(m, x, y, 0.75, val);
  for (let k = 0; k < n; k++) {
    const a = rot0 + k * Math.PI * 2 / n, c = Math.cos(a), s = Math.sin(a);
    stroke(m, [[x + c * 1.4, y + s * 1.4, 0.45], [x + c * r, y + s * r, 0.6]], val);
  }
}

// ---------------------------------------------------------------- the sheet
const hemY = (u) => {               // scalloped hem: six bites along the bottom
  const w = W / 6, f = ((u % w) + w) % w / w - 0.5;
  return H - 3 + 3 * Math.sqrt(Math.max(0, 1 - 4 * f * f));
};
function silhouette() {
  const m = newMask();
  for (let j = 0; j < MH; j++) for (let i = 0; i < MW; i++) {
    const u = (i + 0.5) / SS, v = (j + 0.5) / SS;
    if (v < hemY(u)) m[j * MW + i] = 1;
  }
  return m;
}
/** Lace common to every sheet: a punched row under the fold, a slit frame, a hem of dots. */
function lace(m) {
  for (let u = 3.5; u < W - 2; u += 3.6) disc(m, u, 5.6, 0.75);
  const fx0 = 2.2, fx1 = W - 2.2, fy0 = 8.2, fy1 = H - 5.6;
  stroke(m, [[fx0, fy0, 0.42], [fx1, fy0, 0.42]]); stroke(m, [[fx0, fy1, 0.42], [fx1, fy1, 0.42]]);
  stroke(m, [[fx0, fy0, 0.42], [fx0, fy1, 0.42]]); stroke(m, [[fx1, fy0, 0.42], [fx1, fy1, 0.42]]);
  for (let k = 0; k < 6; k++) disc(m, (k + 0.5) * W / 6, H - 3.3, 0.7);
  for (let v = 12; v < fy1 - 2; v += 3.4) { disc(m, 3.9, v, 0.5); disc(m, W - 3.9, v, 0.5); }
  // the picado field: tiny staggered diamonds of punches, a texture of light
  for (let j = 0, v = 10.6; v < fy1 - 1.6; j++, v += 2.6)
    for (let u = 6 + (j & 1) * 1.6; u < W - 5.6; u += 3.2) disc(m, u, v, 0.42);
}

function downsample(sil, cut) {
  const cov = new Float32Array(TW * TH), hole = new Float32Array(TW * TH), k = SS / TS, n = k * k;
  for (let ty = 0; ty < TH; ty++) for (let tx = 0; tx < TW; tx++) {
    let c = 0, h = 0;
    for (let j = 0; j < k; j++) {
      const row = (ty * k + j) * MW + tx * k;
      for (let i = 0; i < k; i++) { const s = sil[row + i]; c += s; h += s & cut[row + i]; }
    }
    cov[ty * TW + tx] = c / n; hole[ty * TW + tx] = h / n;
  }
  return { cov, hole };
}

/** The cut sheet for digit d (0..9). */
function digitSheet(d) {
  const g = DIGITS[d], dig = newMask(), moat = newMask(), isle = newMask(), cut = newMask();
  const off = (pts) => pts.map(([x, y, r]) => [x + DX, y + DY, r]);
  for (const s of g.strokes) { stroke(dig, off(s)); stroke(moat, off(s), 1, 3.2); stroke(isle, off(s), 1, 1.5); }
  for (const [x, y, r] of g.balls) { disc(dig, x + DX, y + DY, r); disc(moat, x + DX, y + DY, r + 3.2); disc(isle, x + DX, y + DY, r + 1.5); }
  for (const [x0, y0, x1, y1] of g.bridges) stroke(dig, [[x0 + DX, y0 + DY, 0.7], [x1 + DX, y1 + DY, 0.7]], 0);
  const lc = newMask();
  lace(lc);
  for (let p = 0; p < cut.length; p++) cut[p] = dig[p] | (lc[p] & (moat[p] ^ 1));
  const fl = newMask();
  for (const [x, y, r] of g.flowers) flower(fl, x + DX, y + DY, r, 5, 1, -Math.PI / 2);
  for (let p = 0; p < cut.length; p++) if (fl[p] && !isle[p]) cut[p] = 1;
  return downsample(silhouette(), cut);
}

/** The calavera: a sugar-skull sheet. Its jaw line sits at JAW. */
export const JAW = 35.2;
function skullSheet() {
  const cut = newMask(), skull = newMask();
  const out = [[19, 10.6], [25.8, 11.8], [30.4, 16.6], [31.6, 23], [29.8, 29], [27.6, 33], [26.2, 38], [23.2, 41.6], [19, 42.8],
    [14.8, 41.6], [11.8, 38], [10.4, 33], [8.2, 29], [6.4, 23], [7.6, 16.6], [12.2, 11.8], [19, 10.6]];
  stroke(skull, out.map(([x, y]) => [x, y, 2.6]));
  stroke(cut, out.map(([x, y]) => [x, y, 0.5]));
  disc(cut, 13.7, 24.2, 3.9); disc(cut, 24.3, 24.2, 3.9);                      // sockets
  for (const ex of [13.7, 24.3]) for (let k = 0; k < 9; k++) {                  // petal rims
    const a = k * Math.PI * 2 / 9 - Math.PI / 2;
    disc(cut, ex + 5.6 * Math.cos(a), 24.2 + 5.6 * Math.sin(a), 0.55);
  }
  stroke(cut, [[18, 29.8, 1.1], [19, 32.2, 0.45]]); stroke(cut, [[20, 29.8, 1.1], [19, 32.2, 0.45]]);   // nose
  stroke(cut, [[12.8, JAW, 0.45], [16, JAW + 1.2, 0.45], [19, JAW + 1.5, 0.45], [22, JAW + 1.2, 0.45], [25.2, JAW, 0.45]]);
  for (let u = 14; u <= 24; u += 2) stroke(cut, [[u, JAW - 1.4, 0.5], [u, JAW + 2.4 - Math.abs(u - 19) * 0.12, 0.5]]);
  flower(cut, 19, 16.4, 3.4, 6, 1, -Math.PI / 2);                               // forehead flower
  disc(cut, 10.6, 31.2, 0.8); disc(cut, 27.4, 31.2, 0.8);
  for (const [x, y] of [[13.6, 14.6], [24.4, 14.6]]) disc(cut, x, y, 0.6);
  const lc = newMask();
  lace(lc);
  for (let p = 0; p < cut.length; p++) if (lc[p] && !skull[p]) cut[p] = 1;
  return downsample(silhouette(), cut);
}

/** A marigold rosette sheet for the ends of the string (only fine cuts). */
function marigoldSheet() {
  const cut = newMask(), cx = W / 2, cy = 27;
  disc(cut, cx, cy, 1.6);
  for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; disc(cut, cx + 3.4 * Math.cos(a), cy + 3.4 * Math.sin(a), 0.7); }
  for (let k = 0; k < 14; k++) {
    const a = k * Math.PI * 2 / 14, c = Math.cos(a), s = Math.sin(a);
    stroke(cut, [[cx + 5.4 * c, cy + 5.4 * s, 0.4], [cx + 11 * c, cy + 11 * s, 0.75]]);
  }
  for (let k = 0; k < 14; k++) {
    const a = (k + 0.5) * Math.PI * 2 / 14;
    disc(cut, cx + 13.4 * Math.cos(a), cy + 13.4 * Math.sin(a), 0.55);
  }
  const lc = newMask();
  lace(lc);
  for (let p = 0; p < cut.length; p++) cut[p] |= lc[p];
  return downsample(silhouette(), cut);
}

let cache = null;
/** { digits: [10 sheets], skull, marigold }; each sheet { cov, hole } (TW x TH). */
export function sheets() {
  if (cache) return cache;
  cache = { digits: Array.from({ length: 10 }, (_, d) => digitSheet(d)), skull: skullSheet(), marigold: marigoldSheet() };
  return cache;
}
