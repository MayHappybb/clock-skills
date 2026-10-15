// Stained glass numerals: each digit is a ribbon of glass, cut into pieces
// and held by lead came, in a gothic hand (pointed-oval 0, closed 4, a 7
// with a bar). Paths are centre lines in a 16 x 36 design box (pixels);
// the ribbon is RIB wide. buildTile() rasterises one digit at 3x and
// returns per-pixel glass coverage, lead coverage and piece id.

export const RIB = 6;            // glass ribbon width (px)
export const BOX = [18, 40];     // centre-line box (designed at 16 x 36, scaled)
const SX = 18 / 16, SY = 40 / 36;
export const PAD = 6;            // tile margin around the centre-line box
export const TW = BOX[0] + 2 * PAD, TH = BOX[1] + 2 * PAD;

const D2R = Math.PI / 180;
function arc(cx, cy, rx, ry, a0, a1, step = 0.8) {
  const n = Math.max(2, Math.ceil((Math.abs(a1 - a0) * D2R * Math.max(rx, ry)) / step));
  const pts = [];
  for (let k = 0; k <= n; k++) {
    const a = (a0 + ((a1 - a0) * k) / n) * D2R;
    pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return pts;
}
const line = (...p) => p;
function quad(p0, c, p1, n = 24) {
  const pts = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n, u = 1 - t;
    pts.push([u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]]);
  }
  return pts;
}
const join = (...parts) => parts.reduce((a, b) => a.concat(a.length ? b.slice(1) : b), []);
const flip = (paths) => paths.map((p) => p.map(([x, y]) => [16 - x, 36 - y]));

// each digit: a list of paths (each a polyline of [x, y])
const SIX = [
  arc(16.5, 27, 16.5, 25, 252, 180),
  arc(8, 27.3, 8, 8.7, 180, 540),
];
export const DIGITS = [
  // 0: a vesica, two arcs struck from outside meeting in points
  [arc(24.25, 18, 24.25, 24.25, 228, 132), arc(-8.25, 18, 24.25, 24.25, -48, 48)],
  // 1: stem, flag, foot
  [line([9, 0], [9, 36]), line([2.5, 7], [9, 0]), line([3, 36], [15, 36])],
  // 2
  [join(arc(8, 9, 7.5, 9, 195, 385), line([15.05, 12.8], [0.5, 36], [16, 36]))],
  // 3: two bowls meeting in a point
  [arc(8, 8.6, 7.5, 8.6, 200, 450), arc(8, 26.6, 8, 9.4, 270, 520)],
  // 4: closed, pointed apex
  [line([12, 0], [0, 25], [16, 25]), line([12, 0], [12, 36])],
  // 5
  [join(line([16, 0], [2, 0], [1.2, 16.5]), arc(7.6, 25.7, 8.4, 10.3, 232, 505))],
  SIX,
  // 7: top bar, falling stem, continental bar
  [join(line([0, 0], [16, 0]), quad([16, 0], [11, 14], [6, 36])), line([5, 19], [15, 19])],
  // 8: small loop over a larger one
  [arc(8, 8.5, 6.6, 8.5, -90, 270), arc(8, 26.5, 8, 9.5, -90, 270)],
  flip(SIX),
];

const S = 3;  // supersampling
/** Rasterise digit d: { a, L, cell, ncell, order } over TW x TH pixels. */
export function buildTile(d) {
  const paths = DIGITS[d].map((p) => p.map(([x, y]) => [x * SX, y * SY]));
  // segments with cumulative arc length, and pieces per path
  const segs = [];
  let pieceBase = 1;
  for (const p of paths) {
    let len = 0;
    for (let k = 0; k + 1 < p.length; k++) len += Math.hypot(p[k + 1][0] - p[k][0], p[k + 1][1] - p[k][1]);
    const n = Math.max(1, Math.round(len / 8.5)), pl = len / n;
    let s = 0;
    for (let k = 0; k + 1 < p.length; k++) {
      const [ax, ay] = p[k], [bx, by] = p[k + 1], l = Math.hypot(bx - ax, by - ay);
      segs.push({ ax, ay, bx, by, l, s0: s, pl, n, base: pieceBase });
      s += l;
    }
    pieceBase += n;
  }
  const ncell = pieceBase;
  const HW = TW * S, HH = TH * S, id = new Int16Array(HW * HH);
  const half = RIB / 2;
  for (let y = 0; y < HH; y++) {
    for (let x = 0; x < HW; x++) {
      const px = (x + 0.5) / S - PAD, py = (y + 0.5) / S - PAD;
      let best = 1e9, bs = null, bt = 0;
      for (const g of segs) {
        const dx = g.bx - g.ax, dy = g.by - g.ay, L2 = dx * dx + dy * dy;
        let t = L2 ? ((px - g.ax) * dx + (py - g.ay) * dy) / L2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = px - g.ax - t * dx, ey = py - g.ay - t * dy, dd = ex * ex + ey * ey;
        if (dd < best) { best = dd; bs = g; bt = t; }
      }
      if (Math.sqrt(best) > half) continue;
      const s = bs.s0 + bt * bs.l;
      id[y * HW + x] = bs.base + Math.min(bs.n - 1, Math.floor(s / bs.pl));
    }
  }
  // lead: a sample within 2 sub-samples of a different id
  const lead = new Uint8Array(HW * HH);
  // inner cuts are thin came; the outline against the ground is a heavier one
  const R = 4, RIN = 2;
  for (let y = 0; y < HH; y++) {
    for (let x = 0; x < HW; x++) {
      const v = id[y * HW + x];
      let edge = 0;
      for (let oy = -R; oy <= R && !edge; oy++) {
        for (let ox = -R; ox <= R; ox++) {
          const r2 = ox * ox + oy * oy;
          if (r2 > R * R) continue;
          const xx = x + ox, yy = y + oy;
          const w = xx < 0 || yy < 0 || xx >= HW || yy >= HH ? 0 : id[yy * HW + xx];
          if (w === v) continue;
          if ((v === 0 || w === 0) ? r2 <= 10 : r2 <= RIN * RIN + 1) { edge = 1; break; }
        }
      }
      lead[y * HW + x] = edge;
    }
  }
  const N = TW * TH, a = new Float32Array(N), L = new Float32Array(N), cell = new Int16Array(N).fill(-1);
  const cx = new Float32Array(ncell), cy = new Float32Array(ncell), cn = new Float32Array(ncell);
  for (let ty = 0; ty < TH; ty++) {
    for (let tx = 0; tx < TW; tx++) {
      let ga = 0, la = 0;
      const count = new Map();
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const q = (ty * S + sy) * HW + tx * S + sx, v = id[q];
          if (lead[q] && v > 0) la++;
          else if (lead[q]) la++;            // lead on the background side too
          else if (v > 0) { ga++; count.set(v, (count.get(v) || 0) + 1); }
        }
      }
      const p = ty * TW + tx;
      a[p] = ga / (S * S); L[p] = la / (S * S);
      let bv = -1, bc = 0;
      for (const [v, c] of count) if (c > bc) { bc = c; bv = v; }
      cell[p] = bv;
      if (bv > 0) { cx[bv] += tx; cy[bv] += ty; cn[bv]++; }
    }
  }
  for (let c = 1; c < ncell; c++) if (cn[c]) { cx[c] /= cn[c]; cy[c] /= cn[c]; }
  return { a, L, cell, ncell, cx, cy, cn };
}
