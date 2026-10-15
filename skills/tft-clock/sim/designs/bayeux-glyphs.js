// Numerals for 'bayeux': ten things out of the tapestry, each drawn as the
// numeral it stands for, in a 27 x 44 box:
//   0 a round shield, studs and boss         5 a mast, yard and bellied striped sail
//   1 a tower, battlements, door, pennant    6 an oliphant horn, bell up, bound in bands
//   2 a horse's head on an arched neck       7 a Danish axe: blade the bar, haft the stem
//   3 a bow with horn nocks and a grip       8 an interlace knot, one strand over
//   4 a lance with a gonfanon and a cross    9 a bishop's crozier, crook and knop
// Each is built from strokes and polygons (signed distances, at load) and
// rasterised once into embroidery: laid wool in solid colour fields, laid in
// columns, held down by couching bars, and a stem-stitch outline round every
// field. Every pixel also gets the time it is stitched (laid, couched,
// outlined), which drives the needle at the minute turn. Flash tables:
// per numeral w x h px x 7 bytes, plus the needle's path.

import { polygonDist } from '../js/kit.js';

export const DW = 27, DH = 44;

// ------------------------------------------------------------ the wools (the tapestry's eight)
export const WOOL = {
  linen: 0xe4d6b4,
  terra: 0xa9473a,     // madder terracotta
  ochre: 0xd3a043,     // weld yellow
  sage: 0x8e9a62,
  green: 0x3d5a3f,
  lblue: 0x86a0b2,     // woad, light
  indigo: 0x2a3456,    // woad, deep: the outlines
  black: 0x24211f,
};

const R8 = (c) => (c >> 16) & 255, G8 = (c) => (c >> 8) & 255, B8 = (c) => c & 255;
export const shade = (c, k) => ((Math.min(255, Math.round(R8(c) * k)) << 16) | (Math.min(255, Math.round(G8(c) * k)) << 8) | Math.min(255, Math.round(B8(c) * k)));
export const mixc = (a, b, u) => ((Math.round(R8(a) + (R8(b) - R8(a)) * u) << 16) | (Math.round(G8(a) + (G8(b) - G8(a)) * u) << 8) | Math.round(B8(a) + (B8(b) - B8(a)) * u));
export const to565 = (c) => ((R8(c) >> 3) << 11) | ((G8(c) >> 2) << 5) | (B8(c) >> 3);

// ------------------------------------------------------------ geometry helpers

/** Catmull-Rom through the points, `n` steps a span: a smooth polyline. */
function curve(pts, n = 6) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}
/** An elliptical arc, clock degrees (0 = up, clockwise). */
function arcPts(cx, cy, rx, ry, a0, a1, n = 32) {
  const out = [];
  for (let k = 0; k <= n; k++) {
    const a = ((a0 + (a1 - a0) * (k / n)) * Math.PI) / 180;
    out.push([cx + rx * Math.sin(a), cy - ry * Math.cos(a)]);
  }
  return out;
}

/** Nearest point on a polyline: distance and arclength fraction. */
function nearest(pts, len, px, py) {
  let best = Infinity, at = 0, acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy, l = Math.sqrt(l2);
    let u = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    u = u < 0 ? 0 : u > 1 ? 1 : u;
    const ex = px - ax - u * dx, ey = py - ay - u * dy, e = Math.sqrt(ex * ex + ey * ey);
    if (e < best) { best = e; at = acc + u * l; }
    acc += l;
  }
  return [best, len ? at / len : 0];
}
function plen(pts) { let s = 0; for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return s; }

// parts: { d(x,y) -> signed distance, u(x,y) -> 0..1 along it, role, col, key }
function stroke(pts, r, o = {}) {
  const L = plen(pts);
  return { d: (x, y) => nearest(pts, L, x, y)[0] - r, u: (x, y) => nearest(pts, L, x, y)[1], role: 'body', ...o };
}
function poly(pts, o = {}) {
  let cx = 0, cy = 0; for (const p of pts) { cx += p[0]; cy += p[1]; } cx /= pts.length; cy /= pts.length;
  return { d: (x, y) => polygonDist(x, y, pts), u: (x, y) => (Math.atan2(x - cx, cy - y) / (2 * Math.PI) + 1) % 1, role: 'body', ...o };
}
function disc(cx, cy, r, o = {}) {
  return { d: (x, y) => Math.hypot(x - cx, y - cy) - r, u: (x, y) => (Math.atan2(x - cx, cy - y) / (2 * Math.PI) + 1) % 1, role: 'body', ...o };
}
const rectP = (x0, y0, x1, y1, o) => poly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], o);

// ------------------------------------------------------------ the ten

const R = 3.9;   // half the body stroke, outline included

function parts(d) {
  switch (d) {
    case 0: {
      const ring = arcPts(13.5, 22, 9.4, 18.1, 0, 360, 48);
      const studs = [];
      for (let k = 0; k < 10; k++) {
        const a = ((k + 0.5) / 10) * Math.PI * 2;
        studs.push(disc(13.5 + 9.4 * Math.sin(a), 22 - 18.1 * Math.cos(a), 1.25, { role: 'acc', col: 'ochre', bare: true }));
      }
      return [stroke(ring, R), ...studs, disc(13.5, 22, 2.2, { role: 'acc', col: 'ochre', key: true })];
    }
    case 1: return [
      rectP(8.5, 8, 19.5, 41, {}),
      poly([[6, 3.2], [9.6, 3.2], [9.6, 5.6], [12, 5.6], [12, 3.2], [15.6, 3.2], [15.6, 5.6], [18, 5.6], [18, 3.2], [21.5, 3.2], [21.5, 10.5], [6, 10.5]]),
      rectP(5, 39, 22.5, 44),
      poly([[8.6, 4.5], [8.6, 10.5], [0.8, 16.5], [2.2, 11.5], [0.6, 8.6]], { role: 'acc', col: 'ochre', key: true }),   // the pennant, flying down-left
      rectP(11.6, 33.5, 16.4, 39.8, { role: 'cut' }),
      disc(14, 33.5, 2.4, { role: 'cut' }),
      rectP(13.1, 17, 14.9, 22.5, { role: 'cut' }),
    ];
    case 2: return [
      stroke(curve([[9, 7.6], [13, 4.2], [17.6, 4], [21.4, 7.4], [22.4, 12.6], [20.6, 18.4], [15.5, 24.5], [9.5, 31], [4.2, 38.6]], 6), R),
      stroke([[2.4, 39.6], [25.2, 39.6]], R),
      poly([[11.4, 5.2], [7.6, 3.4], [3.4, 6.2], [0.4, 13.4], [1.2, 15.8], [4.4, 15.2], [7.4, 11.4], [11.8, 10.6]]),   // the horse's head, muzzle down
      poly([[7.4, 4.6], [8.2, 0.2], [10.6, 4.8]]),                                                                    // its ear
      disc(6.6, 7.6, 1.05, { role: 'cut' }),                                                                          // its eye
      poly([[12.6, 2.6], [17.4, 0.6], [22.6, 2.6], [25.4, 7], [26.2, 12.6], [23.2, 11.2], [22.6, 8.4], [19.8, 5.4], [15.4, 4.6], [12.4, 5.6]], { role: 'acc', col: 'ochre', key: true }),   // the mane
      stroke([[1.6, 11.6], [8.8, 9.2]], 0.8, { role: 'acc', col: 'ochre' }),                           // the bridle
    ];
    case 3: return [
      stroke(curve([[3.6, 7.5], [8.5, 3.6], [15, 3.4], [20.5, 7], [21.2, 13], [17, 18.6], [10.6, 21.4]], 6), R),
      stroke(curve([[10.6, 21.4], [17.5, 23.4], [22.3, 28.5], [22, 35.5], [16.5, 40.6], [9, 40.8], [3, 37]], 6), R),
      poly([[0.6, 4.6], [5.4, 4.2], [5, 9.8]], { role: 'acc', col: 'ochre', key: true }),     // horn nocks
      poly([[0.4, 40.4], [4.8, 34.6], [5.6, 40.2]], { role: 'acc', col: 'ochre', key: true }),
      rectP(9.2, 18.4, 14.4, 24.4, { role: 'acc', col: 'ochre', key: true, bands: 2 }),       // the grip, bound
    ];
    case 4: return [
      stroke([[19.5, 6], [19.5, 44]], 3.4),
      stroke([[1.8, 29], [25.6, 29]], R),
      stroke([[17.8, 8.6], [2.6, 28.6]], 3.3),
      poly([[19.5, 0.2], [22.6, 5], [19.5, 9.6], [16.4, 5]], { role: 'acc', col: 'lblue', key: true }),        // spearhead
      poly([[16.2, 11], [16.2, 26], [5.2, 26]], { role: 'acc', col: 'ochre', key: true, cross: [13.2, 21] }), // the banner cloth
    ];
    case 5: return [
      stroke([[6.6, 3], [6.6, 21]], R),
      stroke([[2.8, 3.4], [25, 3.4]], 3.4),
      stroke(curve([[6.6, 20.4], [13, 17.6], [19.8, 19.4], [23.4, 25.6], [23, 33], [18.8, 39.6], [11.6, 41], [5.6, 38.6], [2.6, 35]], 6), R, { stripes8: true }),
      disc(25, 3.4, 2.4, { role: 'acc', col: 'ochre', key: true }),      // the yard's end knob
    ];
    case 6: return [
      stroke(curve([[17.5, 4.6], [11, 6.5], [6.5, 12], [4.6, 20], [4.6, 29], [7.6, 37.4], [13.6, 40.6], [19.8, 38], [22.4, 31], [20.2, 24.2], [14, 22], [7.4, 25.2]], 6), R, { bands: 7 }),
      poly([[15.6, 2.4], [26.4, 0.2], [26.4, 10.6], [15.6, 7.6]], { role: 'acc', col: 'ochre', key: true }),   // the bell
      poly([[23.8, 1.4], [26.4, 0.8], [26.4, 10], [23.8, 9]], { role: 'acc', col: 'indigo', key: true }),     // its mouth
    ];
    case 7: return [
      stroke([[22.4, 4], [9.6, 44]], 3.5),
      disc(22.6, 2.6, 2.4),                                                                                          // the haft's knob
      poly([[20.6, 2.2], [20.6, 10.4], [14, 10.4], [7.6, 14.8], [2.8, 15.2], [0.6, 10.4], [0.6, 4.6], [2.6, 0.6], [9.6, 2.4]], { role: 'acc', col: 'lblue', key: true }),   // the blade, bearded
    ];
    case 8: return [
      stroke(curve([[13.5, 22.4], [19.4, 17.6], [21.2, 10.6], [18.4, 4.6], [13.5, 3.2], [8.6, 4.6], [5.8, 10.6], [7.6, 17.6], [13.5, 22.4],
        [19.8, 27.4], [22.8, 33.4], [20, 39.6], [13.5, 41.4], [7, 39.6], [4.2, 33.4], [7.2, 27.4], [13.5, 22.4]], 6), R),
      stroke([[9.2, 18.8], [17.8, 26]], R, { role: 'acc', col: 'body', key: true }),   // the strand on top at the crossing
    ];
    case 9: return [
      stroke(curve([[13.6, 20.6], [7.4, 18.8], [5, 12.6], [7.4, 5.8], [13.5, 3.4], [19.6, 5.8], [22.2, 12.6], [21.8, 22], [19.4, 31], [14.6, 38.6], [7.4, 41.6]], 6), R),
      disc(15.6, 20.4, 2.6, { role: 'acc', col: 'ochre', key: true }),     // the crook's finial
      rectP(18, 25.4, 25.4, 28.6, { role: 'acc', col: 'ochre', key: true }),  // the knop
    ];
  }
  return [];
}

// ------------------------------------------------------------ rasterise into embroidery

const COUCH = 4;   // couching bars every 4 rows

/**
 * One digit as embroidery. `body` is the body wool. Returns per-pixel:
 *  fin  final colour (0xRRGGBB, -1 = bare linen)
 *  lay  colour after laying, before couching/outline (-1 = still bare)
 *  t0   when it is laid (0..255), t1 when it is finished (0..255)
 * and `path`: the stitched pixels sorted by t1, for the needle.
 */
export function embroider(P, BW, BH, sc, body) {
  const N = BW * BH;
  const fin = new Int32Array(N).fill(-1), lay = new Int32Array(N).fill(-1);
  const t0 = new Uint8Array(N), t1 = new Uint8Array(N);
  const bodies = P.filter((p) => p.role === 'body'), accs = P.filter((p) => p.role === 'acc'), cuts = P.filter((p) => p.role === 'cut');
  const nOut = P.length;
  for (let y = 0; y < BH; y++)
    for (let x = 0; x < BW; x++) {
      const px = (x + 0.5) / sc, py = (y + 0.5) / sc, i = y * BW + x;
      let db = Infinity, bi = -1;
      for (let k = 0; k < bodies.length; k++) { const v = bodies[k].d(px, py); if (v < db) { db = v; bi = k; } }
      let dc = Infinity; for (const c of cuts) dc = Math.min(dc, c.d(px, py));
      let da = Infinity, ai = -1;
      for (let k = 0; k < accs.length; k++) { const v = accs[k].d(px, py); if (v <= 0 && ai < 0) { da = v; ai = k; } }
      if (ai < 0) for (const a of accs) da = Math.min(da, a.d(px, py));
      db *= sc; da *= sc; dc *= sc;
      let U = Math.min(db, da);
      U = Math.max(U, -dc);
      if (U > 0) continue;
      // which field, and its wool
      const inAcc = ai >= 0 && -dc < 0 ? accs[ai] : null;
      const part = inAcc ?? bodies[bi];
      let wool = body;
      if (inAcc) wool = inAcc.col === 'body' ? body : WOOL[inAcc.col];
      if (part.stripes) { for (const [c, y0] of part.stripes) if (py >= y0) wool = c === 'body' ? body : WOOL[c]; }
      if (part.stripes8) wool = Math.floor(part.u(px, py) * 9) % 2 ? WOOL.ochre : body;
      if (part.bands && !inAcc) { const u = part.u(px, py) * part.bands; if (u % 1 > 0.82 && u > 0.6) wool = WOOL.ochre; }
      if (inAcc && inAcc.bands) { if (Math.floor((py - 18.4) / 1.5) % 2) wool = shade(WOOL.ochre, 0.8); }
      if (inAcc && inAcc.cross) { const [cx, cy] = inAcc.cross; if ((Math.abs(px - cx) < 0.8 && Math.abs(py - cy) < 2.4) || (Math.abs(py - cy) < 0.8 && Math.abs(px - cx) < 2.4)) wool = body; }
      // outline: the outer contour, and the keyline round an accent field
      let edge = U > -1.45;
      if (!edge && inAcc && inAcc.key && da > -1.0) edge = true;
      
      // laid work: threads in columns, a faint groove every third column, couching bars across
      // laid work: a solid field; couching bars across it every few rows, tacked down every third pixel
      const laid = wool;
      const couch = !inAcc?.bare && y % COUCH === 2;
      const tack = couch && (x + y) % 3 === 0;
      const stud = inAcc?.bare;
      const order = 0.5 * (x + y / BH) / BW;   // laid column by column, left to right
      t0[i] = Math.round(order * 255);
      lay[i] = laid;
      if (edge && !stud) {
        // stem stitch: a twisted line of slanted stitches
        const tw = (x + 2 * y) % 4 === 0;
        fin[i] = tw ? 0x3e4a74 : WOOL.indigo;
        const u = (P.indexOf(part) + (part.u(px, py) || 0)) / nOut;
        t1[i] = Math.round((0.72 + 0.28 * u) * 255);
      } else if (couch && !stud) {
        fin[i] = shade(wool, tack ? 0.7 : 0.86);
        t1[i] = Math.round((0.5 + 0.2 * ((Math.floor(y / COUCH) + x / BW) / (BH / COUCH))) * 255);
      } else if (stud) {
        fin[i] = wool; lay[i] = body; t1[i] = 230;
      } else {
        fin[i] = laid; t1[i] = t0[i];
      }
    }
  // the needle's path: stitched pixels in finishing order (prefix sums for a smooth running mean)
  const idx = [];
  for (let i = 0; i < N; i++) if (fin[i] >= 0) idx.push(i);
  idx.sort((a, b) => t1[a] - t1[b] || a - b);
  const ord = new Uint8Array(idx.length), sx = new Uint16Array(idx.length + 1), sy = new Uint16Array(idx.length + 1);
  idx.forEach((i, k) => { ord[k] = t1[i]; sx[k + 1] = sx[k] + (i % BW); sy[k + 1] = sy[k] + Math.floor(i / BW); });
  // as RGB565 for the frame loop
  const F = new Uint16Array(N), L = new Uint16Array(N), M = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (fin[i] >= 0) { F[i] = to565(fin[i]); L[i] = to565(lay[i]); M[i] = 1; }
  return { w: BW, h: BH, fin: F, lay: L, mask: M, t0, t1, ord, sx, sy, n: idx.length };
}

/** The ten numerals at `sc` times the 27 x 44 design size. */
export function buildDigits(body, sc = 1) {
  const bw = Math.round(DW * sc), bh = Math.round(DH * sc);
  return Array.from({ length: 10 }, (_, d) => embroider(parts(d), bw, bh, sc, body));
}
export { stroke, poly, disc, rectP, curve, arcPts };

/** Where the needle is when a digit is stitched up to `p` (0..255): mean of the last few stitches. */
export function needleAt(dg, p) {
  let lo = 0, hi = dg.n;
  while (lo < hi) { const m = (lo + hi) >> 1; if (dg.ord[m] <= p) lo = m + 1; else hi = m; }
  const k1 = Math.max(1, lo), k0 = Math.max(0, k1 - 14);
  return [(dg.sx[k1] - dg.sx[k0]) / (k1 - k0) + 0.5, (dg.sy[k1] - dg.sy[k0]) / (k1 - k0) + 0.5];
}
