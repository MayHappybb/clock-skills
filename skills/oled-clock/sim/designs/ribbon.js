// Ribbon: the time written in the air by a rhythmic-gymnastics ribbon.
//
// One long satin ribbon, in real 3D, runs from a stick in the corner
// through the time: a cord off the stick's tip, the two hour numerals small
// and far up on the left, a long swoop forward, the two minute numerals big
// and near on the right, and a free tail fluttering off the edge. The
// numerals are not a font with a texture: each is one continuous ribbon
// path, a cursive hand designed for a strip that can only bend and twist
// (centre-lines in 3D with their own relief, folds and loops, and a stretch
// laid back side up). Every frame the ribbon is built point by point (its
// width across the tangent, turned by the twist), cut into triangles,
// projected in perspective and drawn into a z-buffer. The face it shows is
// worked out per piece: the front is solid satin, the back is drawn as its
// two hems and a ladder of rungs, an edge-on ribbon is a bright hairline,
// and where one strand passes over another the one underneath is cut back
// a pixel.
//
// Always alive: every 2.6 s the stick flicks and a full twist runs down the
// whole ribbon; where it passes the ribbon pinches, flips its back up and
// bulges towards the viewer, and each numeral it reaches squashes onto its
// baseline and springs back with a hop. Under that a ripple runs out of
// the plane, the width breathes, each numeral sways in yaw, pitch and roll
// on its own bow, and the tail snakes.
//
// The minute: the hand whips the stick, the changing numeral peels off
// from its end into a corkscrew tipped towards the viewer, spinning and
// climbing (both faces flashing past as it turns), and is laid back down
// from its start as the new numeral, every point on its own spring. The
// old one is gone before :00 and the new one starts after, so no instant
// shows a wrong digit.
//
// The hour: from :55 the hand whirls and the tail is thrown up over the
// minutes into a row of rolling spirals; then all four numerals peel into
// one long coil spring arched across the glass, spinning, and the new time
// is laid out of it (about 0.9 s with no readable time).
//
// Burn-in: the whole projection walks round kit.orbit; 23:00-07:00 the
// panel dims (ctx.night).

import { dither, clamp, progress, clockFields, previousMinute, orbit } from '../js/kit.js';

const TAU = Math.PI * 2;
const W = 128, H = 64;

// ------------------------------------------------------------ camera
// World: px, x right, y down, z away from the viewer. The eye is D in front
// of the origin; at z = 0 the projection is 1:1.
const D = 170, VX = 64, VY = 32;
let vx = VX, vy = VY;   // the projection centre, walked a pixel or two for burn-in
const norm3 = (x, y, z) => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; };
const LIGHT = norm3(-0.45, -0.75, -0.6);

// ------------------------------------------------------------ letterforms
// Each numeral is one continuous ribbon path: centre-line control points
// (x, y, z) in a 20 x 28 box, z the relief (negative = towards the viewer),
// joined by a centripetal Catmull-Rom spline and resampled to N points by
// arc length, so every digit has the same number of points and one can
// become another point for point.

const N = 80, GW = 20, GH = 28, HW = 1.55;   // HW: ribbon half-width in glyph units

const SKETCH = {
  0: [[3.2, 8, 0], [6.5, 3.4, 0], [11.5, 2.4, 0], [16, 5, 0], [17.6, 11, 0], [17.4, 18, 0], [15.4, 23.6, 0], [10.5, 25.9, 0], [5.5, 24.5, 0], [2.8, 19, 0], [2.6, 12, 0], [4.6, 5.5, -1.5], [9, 2.4, -3], [14, 2.6, -3.5], [17.6, 4.6, -3.5]],
  1: [[4.2, 10.5, 0], [8, 7, 0], [12.2, 2.4, 0], [12.4, 9, 0], [12.4, 16, 0], [12.2, 22.5, 0], [10.5, 25.4, 0], [7, 25.8, -1], [5.4, 25.2, -1.5], [7.5, 25.9, -2.5], [12, 25.9, -3], [16.8, 25.6, -3]],
  2: [[5.5, 10, 0], [3, 7, 0], [5, 3.2, 0], [10, 2.4, 0], [15, 3.6, 0], [17.4, 8, 0], [16, 13, 0], [11, 18.5, 0], [5.5, 23, 0], [3, 25.6, 0], [8, 25.6, 0], [13, 25.6, -1], [17.8, 25.4, -2]],
  3: [[3.2, 5.5, 0], [7, 2.6, 0], [12.5, 2.6, 0], [16.5, 5.5, 0], [16.6, 10, 0], [13, 13, -1], [8.5, 13.8, -2], [13.5, 14.6, -1], [17.4, 18.5, 0], [16.6, 23.5, 0], [12, 25.8, 0], [6.5, 25.6, 0], [2.8, 22.5, 0]],
  4: [[10, 2.4, 0], [6.4, 9, 0], [3, 15.5, 0], [3, 19.4, 0], [7.5, 19.6, 0], [12, 19.6, 0], [17.4, 19.4, -1], [19.4, 16.5, -3], [17.4, 11, -4.5], [14.4, 4.5, -4], [13.4, 2.4, -2.5], [13.4, 7, 0.5], [13.4, 14, 1.5], [13.4, 20.5, 1.5], [13.4, 25.8, 0.5]],
  5: [[17, 2.6, 0], [11, 2.6, 0], [5.2, 2.6, 0], [4.2, 7, 0], [3.8, 12, 0], [7.5, 10.6, 0], [12.5, 10.6, 0], [16.6, 13.6, 0], [17.4, 18.5, 0], [15.6, 23.5, 0], [11, 25.8, 0], [6, 25.4, 0], [2.8, 22, 0]],
  6: [[15.6, 3.6, 0], [11, 2.4, 0], [6, 4, 0], [3, 10, 0], [2.6, 17, 0], [4, 23, 0], [8, 25.8, 0], [13, 25.6, 0], [16.8, 22, 0], [17, 17, 0], [14, 13.5, -1], [9.5, 13, -2], [5, 15, -2.5], [3, 18.5, -3]],
  7: [[2.6, 5.4, 0], [4, 2.6, 0], [10, 2.6, 0], [17.4, 2.6, 0], [14, 9, 0], [10.5, 16, 0], [8.5, 25.6, 0]],
  8: [[3.6, 6.5, 0], [7, 2.6, 0], [12.5, 2.5, 0], [15.8, 6, 0], [14.2, 10.6, 0], [10, 13.6, -2], [5.4, 16.5, -1], [2.6, 21, 0], [5.2, 25.4, 0], [10, 25.9, 0], [14.8, 25.4, 0], [17.4, 21, 0], [14.8, 16.5, 0], [10, 13.6, 2], [5.6, 10.6, 1], [4, 6.5, -1], [6.4, 3, -2.5], [11.5, 2.2, -3.5], [16.4, 4, -3.5]],
  9: [[16.5, 10, 0], [13, 12.5, -1], [8, 12.8, -1.5], [3.6, 10, -1], [3, 5.5, 0], [6.5, 2.6, 0], [12, 2.4, 0], [16.5, 5, 0], [17.4, 10, 0], [17, 17, 0], [14.5, 23.5, 0], [9.5, 25.8, 0], [4.5, 24.5, 0]],
};

/** Centripetal Catmull-Rom through pts, `per` samples a span. */
function spline(pts, per = 16) {
  const P = pts.map((p) => [p[0], p[1], p[2] ?? 0]);
  const n = P.length, ext = (a, b) => a.map((v, c) => 2 * v - b[c]);
  const Q = [ext(P[0], P[1]), ...P, ext(P[n - 1], P[n - 2])];
  const out = [];
  for (let i = 1; i < Q.length - 2; i++) {
    const p0 = Q[i - 1], p1 = Q[i], p2 = Q[i + 1], p3 = Q[i + 2];
    const dt = (a, b) => Math.max(1e-4, Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])));
    const t0 = 0, t1 = dt(p0, p1), t2 = t1 + dt(p1, p2), t3 = t2 + dt(p2, p3);
    for (let k = 0; k < per; k++) {
      const t = t1 + ((t2 - t1) * k) / per;
      const L = (a, b, ta, tb) => a.map((v, c) => ((tb - t) * v + (t - ta) * b[c]) / (tb - ta));
      const A1 = L(p0, p1, t0, t1), A2 = L(p1, p2, t1, t2), A3 = L(p2, p3, t2, t3);
      const B1 = L(A1, A2, t0, t2), B2 = L(A2, A3, t1, t3);
      out.push(L(B1, B2, t1, t2));
    }
  }
  out.push(P[n - 1]);
  return out;
}

/** n points evenly spaced by arc length along a polyline. */
function resample(poly, n) {
  const cum = [0];
  for (let i = 1; i < poly.length; i++) cum.push(cum[i - 1] + Math.hypot(...poly[i].map((v, c) => v - poly[i - 1][c])));
  const total = cum[cum.length - 1], out = new Float64Array(n * 3);
  let j = 0;
  for (let k = 0; k < n; k++) {
    const s = (total * k) / (n - 1);
    while (j < poly.length - 2 && cum[j + 1] < s) j++;
    const u = (s - cum[j]) / Math.max(1e-9, cum[j + 1] - cum[j]);
    for (let c = 0; c < 3; c++) out[k * 3 + c] = poly[j][c] + (poly[j + 1][c] - poly[j][c]) * u - (c === 0 ? GW / 2 : c === 1 ? GH / 2 : 0);
  }
  return out;
}

// 5, 6 and 9 are drawn backwards, so they end at the right.
for (const d of [5, 6, 9]) SKETCH[d].reverse();
const GLYPH = Array.from({ length: 10 }, (_, d) => resample(spline(SKETCH[d]), N));

// Where each numeral turns its back: [u0, u1] stretches (0..1 along the
// ribbon) laid with the back face up, a half twist in and out of each, so
// every numeral shows both faces of the ribbon.
const BACKS = {
  0: [[0.4, 0.62]], 1: [[-0.01, 0.2]], 2: [[0.5, 0.7]], 3: [[0.43, 0.58]], 4: [[0.47, 0.64]],
  5: [[0.22, 0.44]], 6: [[-0.01, 0.28]], 7: [[0.58, 0.78]], 8: [[0.38, 0.58]], 9: [[0.12, 0.32]],
};
const sstep = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
const TWG = Array.from({ length: 10 }, (_, d) => {
  const o = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const u = i / (N - 1);
    for (const [a, b] of BACKS[d]) o[i] += Math.PI * (sstep((u - a) / 0.07 + 0.5) - sstep((u - b) / 0.07 + 0.5));
  }
  return o;
});
// ------------------------------------------------------------ the ribbon renderer
// A ribbon is a centre-line of points with a half-width and a twist each.
// At every point the width runs across the tangent, flat to the viewer when
// untwisted (T x z), then turned about the tangent by the twist; the strip
// between neighbouring points is two triangles, projected in perspective
// and drawn into a z-buffer that also keeps, per pixel, the arc length s and
// the position v across the ribbon. Then each pixel is shaded by the face it
// shows: the front is satin (lit, dithered as it turns from the light), the
// back is drawn as its two hems and a diagonal weave, an edge-on ribbon is a
// bright line. Where one strand lies over another, the one underneath is
// cut back a pixel, so crossings read.

const MAXP = 1400;
const PX = new Float64Array(MAXP), PY = new Float64Array(MAXP), PZ = new Float64Array(MAXP);
const PHW = new Float64Array(MAXP), PTH = new Float64Array(MAXP), PS = new Float64Array(MAXP);
const PK = new Uint8Array(MAXP);                 // 0 ribbon, 1 rod
let np = 0;
function push(x, y, z, hw, th, kind = 0) {
  PX[np] = x; PY[np] = y; PZ[np] = z; PHW[np] = hw; PTH[np] = th; PK[np] = kind; np++;
}

const ZB = new Float32Array(W * H), SB = new Float32Array(W * H), VB = new Float32Array(W * H), IB = new Int32Array(W * H);
const SEG_LEVEL = new Float32Array(MAXP), SEG_FACE = new Int8Array(MAXP), SEG_WPX = new Float32Array(MAXP);   // face: 1 front, -1 back, 0 edge-on, 2 rod

// Per point: screen centre, the two screen edges, depth, facing.
const SXL = new Float64Array(MAXP), SYL = new Float64Array(MAXP), SXR = new Float64Array(MAXP), SYR = new Float64Array(MAXP);
const SZ = new Float64Array(MAXP), FAC = new Float64Array(MAXP), LAM = new Float64Array(MAXP);

function tri(ax, ay, az, as, av, bx, by, bz, bs, bv, cx, cy, cz, cs, cv, seg) {
  const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  if (Math.abs(area) < 1e-7) return;
  const inv = 1 / area;
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx)));
  const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)));
  for (let y = y0; y <= y1; y++) {
    const py = y + 0.5;
    for (let x = x0; x <= x1; x++) {
      const px = x + 0.5;
      const w0 = ((bx - px) * (cy - py) - (by - py) * (cx - px)) * inv;
      if (w0 < -1e-6) continue;
      const w1 = ((cx - px) * (ay - py) - (cy - py) * (ax - px)) * inv;
      if (w1 < -1e-6) continue;
      const w2 = 1 - w0 - w1;
      if (w2 < -1e-6) continue;
      const z = w0 * az + w1 * bz + w2 * cz, i = y * W + x;
      if (z < ZB[i]) { ZB[i] = z; SB[i] = w0 * as + w1 * bs + w2 * cs; VB[i] = w0 * av + w1 * bv + w2 * cv; IB[i] = seg; }
    }
  }
}

/** Draw points [a, b) as one strip. `sOff` keeps separate strips apart in s. */
function strip(a, b, sOff) {
  let bx0 = 0, by0 = -1, bz0 = 0;
  let s = sOff;
  for (let i = a; i < b; i++) {
    const i0 = Math.max(a, i - 1), i1 = Math.min(b - 1, i + 1);
    let tx = PX[i1] - PX[i0], ty = PY[i1] - PY[i0], tz = PZ[i1] - PZ[i0];
    const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
    if (i > a) s += Math.hypot(PX[i] - PX[i - 1], PY[i] - PY[i - 1], PZ[i] - PZ[i - 1]);
    PS[i] = s;
    // Width direction flat to the viewer: T x z. Where the tangent points
    // nearly along the line of sight that is undefined, so the last one is
    // carried on, made square to T.
    let bx = ty, by = -tx, bz = 0;
    const bl = Math.hypot(bx, by);
    if (bl < 0.2 && i > a) {
      const d = bx0 * tx + by0 * ty + bz0 * tz;
      bx = bx0 - d * tx; by = by0 - d * ty; bz = bz0 - d * tz;
      const l2 = Math.hypot(bx, by, bz) || 1; bx /= l2; by /= l2; bz /= l2;
    } else { bx /= bl || 1; by /= bl || 1; }
    bx0 = bx; by0 = by; bz0 = bz;
    // Twist about the tangent.
    const th = PTH[i], c = Math.cos(th), sn = Math.sin(th);
    const cxv = ty * bz - tz * by, cyv = tz * bx - tx * bz, czv = tx * by - ty * bx;   // T x b
    const wx = bx * c + cxv * sn, wy = by * c + cyv * sn, wz = bz * c + czv * sn;
    // Face normal T x w, and how it faces the eye and the light.
    const nx = ty * wz - tz * wy, ny = tz * wx - tx * wz, nz = tx * wy - ty * wx;
    const ex = -PX[i], ey = -PY[i], ez = -D - PZ[i], el = Math.hypot(ex, ey, ez);
    const f = (nx * ex + ny * ey + nz * ez) / el;
    FAC[i] = f;
    const sg = f >= 0 ? 1 : -1;
    LAM[i] = sg * (nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]);
    // Project the centre and both edges.
    const hw = PHW[i];
    const zc = PZ[i] + D, k = D / zc;
    const cxs = vx + PX[i] * k, cys = vy + PY[i] * k;
    const zl = PZ[i] - hw * wz + D, zr = PZ[i] + hw * wz + D;
    let lx = vx + (PX[i] - hw * wx) * D / zl, ly = vy + (PY[i] - hw * wy) * D / zl;
    let rx = vx + (PX[i] + hw * wx) * D / zr, ry = vy + (PY[i] + hw * wy) * D / zr;
    // An edge-on ribbon still has a hem: never thinner than ~1.4 px on screen.
    const stx = tx * k, sty = ty * k, stl = Math.hypot(stx, sty) || 1;
    const qx = -sty / stl, qy = stx / stl;
    const ar = (rx - cxs) * qx + (ry - cys) * qy, al = (lx - cxs) * qx + (ly - cys) * qy;
    const MIN = 0.72;
    if (Math.abs(ar - al) < 2 * MIN) {
      const sgn = ar >= al ? 1 : -1, need = (2 * MIN - Math.abs(ar - al)) / 2;
      rx += qx * need * sgn; ry += qy * need * sgn; lx -= qx * need * sgn; ly -= qy * need * sgn;
    }
    SXL[i] = lx; SYL[i] = ly; SXR[i] = rx; SYR[i] = ry; SZ[i] = zc;
  }
  for (let i = a; i < b - 1; i++) {
    const j = i + 1, f = (FAC[i] + FAC[j]) / 2;
    SEG_FACE[i] = PK[i] === 1 ? 2 : Math.abs(f) < 0.2 ? 0 : f > 0 ? 1 : -1;
    SEG_LEVEL[i] = (LAM[i] + LAM[j]) / 2;
    SEG_WPX[i] = Math.hypot(SXR[i] - SXL[i], SYR[i] - SYL[i]);
    tri(SXL[i], SYL[i], SZ[i], PS[i], -1, SXR[i], SYR[i], SZ[i], PS[i], 1, SXR[j], SYR[j], SZ[j], PS[j], 1, i);
    tri(SXL[i], SYL[i], SZ[i], PS[i], -1, SXR[j], SYR[j], SZ[j], PS[j], 1, SXL[j], SYL[j], SZ[j], PS[j], -1, i);
  }
}

function clearBuffers() { ZB.fill(1e9); IB.fill(-1); np = 0; }

const GAP_S = 9;
function shade(g, dox, doy) {
  const buf = g.buf;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x, seg = IB[i];
      if (seg < 0) continue;
      const s = SB[i], z = ZB[i];
      // Cut back where a different strand lies on top.
      let cut = false;
      if (x > 0 && IB[i - 1] >= 0 && ZB[i - 1] < z - 0.3 && Math.abs(SB[i - 1] - s) > GAP_S) cut = true;
      else if (x < W - 1 && IB[i + 1] >= 0 && ZB[i + 1] < z - 0.3 && Math.abs(SB[i + 1] - s) > GAP_S) cut = true;
      else if (y > 0 && IB[i - W] >= 0 && ZB[i - W] < z - 0.3 && Math.abs(SB[i - W] - s) > GAP_S) cut = true;
      else if (y < H - 1 && IB[i + W] >= 0 && ZB[i + W] < z - 0.3 && Math.abs(SB[i + W] - s) > GAP_S) cut = true;
      if (cut) continue;
      const face = SEG_FACE[seg];
      let on;
      if (face === 2 || face === 0) on = true;
      else if (face === 1) on = true;
      else {
        // The back: two hems a pixel wide and a rung across every few px.
        const v = Math.abs(VB[i]), wp = SEG_WPX[seg];
        on = v > 1 - 2.3 / Math.max(wp, 2.3) || (wp > 3.5 && ((s * 0.36) % 1 + 1) % 1 < 0.3);
      }
      if (on) buf[i] = 1;
    }
}

// ------------------------------------------------------------ placing a glyph

/** Push a glyph's points: centre (cx, cy, cz), scale k, rotation (yaw, pitch, roll), twist fn. */
function pushGlyph(G, cx, cy, cz, k, R, twist, hwk = 1) {
  for (let i = 0; i < N; i++) {
    const x = G[i * 3] * k, y = G[i * 3 + 1] * k, z = G[i * 3 + 2] * k;
    push(cx + R[0] * x + R[1] * y + R[2] * z, cy + R[3] * x + R[4] * y + R[5] * z, cz + R[6] * x + R[7] * y + R[8] * z, HW * k * hwk, twist(i));
  }
}

const rot = (yaw, pitch, roll) => {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
  // Ry * Rx * Rz
  const Rz = [cr, -sr, 0, sr, cr, 0, 0, 0, 1];
  const Rx = [1, 0, 0, 0, cp, -sp, 0, sp, cp];
  const Ry = [cy, 0, sy, 0, 1, 0, -sy, 0, cy];
  return mul(Ry, mul(Rx, Rz));
};
function mul(A, B) {
  const o = new Array(9);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o[r * 3 + c] = A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c];
  return o;
}

/** The digits sheet: all ten at minute size, for review. */
export function digitSheet(g, ds, t = 0, k = 1.4) {
  clearBuffers();
  ds.forEach((d, j) => {
    const cx = (j - (ds.length - 1) / 2) * 23 * k;
    pushGlyph(GLYPH[d], cx, 0, 0, k, rot(0.3 * Math.sin(t + d), 0.15 * Math.cos(t * 0.7 + d), 0), (i) => TWG[d][i]);
    strip(np - N, np, j * 1000);
  });
  shade(g, 0, 0);
}
// ------------------------------------------------------------ the scene
// Hours small and far up the left, minutes big and near on the right; one
// ribbon runs from the stick tip through both hour numerals, a spinning
// loop (the knot), both minute numerals, and out into a fluttering tail.

const HZ = 46, MZ = -8;
const toWorld = (sx, sy, z) => [(sx - VX) * (z + D) / D, (sy - VY) * (z + D) / D, z];
const SLOTS = [
  { c: toWorld(19, 19.5, HZ), k: 1.24, hw: 1.15 },
  { c: toWorld(41, 19.5, HZ), k: 1.24, hw: 1.15 },
  { c: toWorld(77.5, 36, MZ), k: 1.32, hw: 1.05 },
  { c: toWorld(107.5, 36, MZ), k: 1.32, hw: 1.05 },
];
const SPRING = (s, zeta = 0.42, w = 11) => {
  if (s <= 0) return 0;
  const wd = w * Math.sqrt(1 - zeta * zeta);
  return 1 - Math.exp(-zeta * w * s) * (Math.cos(wd * s) + ((zeta * w) / wd) * Math.sin(wd * s));
};
const BULGE = 3;   // numerals lie on a gentle bow towards the viewer
const lerp = (a, b, u) => a + (b - a) * u;
const ROT_SCRATCH = new Float64Array(N * 3), TW_SCRATCH = new Float64Array(N);

/** A glyph placed in the world: its N points into out (world), twists into tw. */
function placeGlyph(d, slot, R, bob, out, tw, sq = 0) {
  const G = GLYPH[d], k = slot.k, [cx, cy, cz] = slot.c;
  for (let i = 0; i < N; i++) {
    const gx = G[i * 3] / (GW / 2);
    const x = G[i * 3] * k * (1 + 0.7 * sq), y = (G[i * 3 + 1] - (G[i * 3 + 1] - GH / 2) * sq) * k, z = (G[i * 3 + 2] - BULGE * (1 - gx * gx)) * k;
    out[i * 3] = cx + R[0] * x + R[1] * y + R[2] * z;
    out[i * 3 + 1] = cy + bob + R[3] * x + R[4] * y + R[5] * z;
    out[i * 3 + 2] = cz + R[6] * x + R[7] * y + R[8] * z;
    tw[i] = TWG[d][i];
  }
}

// ------------------------------------------------------------ the face

export default {
  name: 'Ribbon',
  blurb: 'A gymnast\'s ribbon writes the time in 3D: twists run down it, on the minute it whips into a corkscrew and re-lays the numeral, on the hour it coils across the glass.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  driver: 'full',
  frame(g, ctx) {
    renderScene(g, ctx);
  },
};

const OLD = Array.from({ length: 4 }, () => new Float64Array(N * 3)), NEW = Array.from({ length: 4 }, () => new Float64Array(N * 3));
const OTW = Array.from({ length: 4 }, () => new Float64Array(N)), NTW = Array.from({ length: 4 }, () => new Float64Array(N));
const CUR = Array.from({ length: 4 }, () => new Float64Array(N * 3)), CTW = Array.from({ length: 4 }, () => new Float64Array(N));
const SHOW = { hour: null, flat: 1 };
const digitsOf = (f) => [...`${f.hh}${f.mm}`].map(Number);

// Where along the ribbon (in points) each numeral's middle is, for the waves.
const SLOT_GI = [40, 130, 244, 334];
/** Seconds since the last twist wave reached slot k's middle. */
function sinceWave(k, T) {
  const tk = T - SLOT_GI[k] / PACKET_SPEED;
  return tk - Math.floor(tk / PACKET_EVERY) * PACKET_EVERY;
}

function slotPose(k, T) {
  // A wave arriving kicks the numeral: it squashes onto its baseline and
  // springs back, with a little hop and a turn.
  const tw = sinceWave(k, T);
  const jig = Math.exp(-tw * 5) * Math.sin(tw * 17);
  const sq = 0.09 * jig;
  const yaw = 0.28 * Math.sin((TAU * T) / 6.7 + k * 1.7) + 0.07 * Math.sin((TAU * T) / 2.9 + k) + 0.12 * jig;
  const pitch = 0.1 * Math.sin((TAU * T) / 5.3 + k * 2.3);
  const roll = 0.045 * Math.sin((TAU * T) / 4.1 + k * 0.9);
  const bob = 0.9 * Math.sin((TAU * T) / 3.3 + k * 1.3) - 1.6 * Math.max(0, jig);
  return { R: rot(yaw, pitch, roll), bob, sq };
}

function renderScene(g, { date, fields: f, night, oled }) {
  const T = date.getTime() / 1000, sec = f.sec;
  const late = sec >= 50;
  const from = late ? f : previousMinute(date), to = late ? clockFields(new Date(date.getTime() + 60000)) : f;
  const tau = late ? sec - 60 : sec;
  const a = digitsOf(from), b = digitsOf(to);
  clearBuffers();
  // The orbit steps at :30 every 3 minutes; glide over 1.5 s instead of jumping.
  const ms = date.getTime(), since = (((ms - 30000) % 180000) + 180000) % 180000;
  const [ox, oy] = orbit(date, 2, 3), [px, py] = orbit(new Date(ms - since - 1000), 2, 3);
  const gu = sstep(since / 1500);
  vx = VX + lerp(px, ox, gu); vy = VY + lerp(py, oy, gu);
  const hour = to.m === 0 && tau > -HOUR_PRE && tau < 3;
  SHOW.hour = hour ? tau : null;
  let flat = 1;   // how laid the ribbon is: 1 all numerals laid, 0 all in flight
  for (let k = 0; k < 4; k++) {
    const { R, bob, sq } = slotPose(k, T);
    const turning = hour || a[k] !== b[k];
    if (!turning || tau < -2 || tau > 2.5) {
      const d = tau < 0 ? a[k] : b[k];
      placeGlyph(d, SLOTS[k], R, bob, CUR[k], CTW[k], sq);
      continue;
    }
    placeGlyph(a[k], SLOTS[k], R, bob, OLD[k], OTW[k], sq);
    placeGlyph(b[k], SLOTS[k], R, bob, NEW[k], NTW[k], sq);
    flat = Math.min(flat, morph(k, tau, T, hour));
  }
  SHOW.flat = flat;
  assemble(T, tau, CUR, CTW);
  shade(g, 0, 0);
  oled.contrast(0xcf + (0x20 - 0xcf) * night);
}

const PACKET_EVERY = 2.6, PACKET_SPEED = 85, PACKET_W = 7;
function twistPackets(gi, T) {
  let th = 0, bump = 0;
  const n0 = Math.floor(T / PACKET_EVERY);
  for (let n = n0 - 6; n <= n0; n++) {
    const c = (T - n * PACKET_EVERY) * PACKET_SPEED, q = (c - gi) / PACKET_W;
    th += TAU * sstep(q + 0.5);
    bump += Math.exp(-q * q * 1.5);
  }
  return [th, bump];
}

// ------------------------------------------------------------ the whole ribbon

const STICK_BASE = toWorld(-18, 86, 10), STICK_TIP = toWorld(5, 34, 10);
const TAIL_N = 30, TAIL_STEP = 1.3, PRE_N = 110;
let gi = 0;   // running index along the ribbon, for the idle life
/** Push one ribbon point with the idle life: an out-of-plane ripple, a breathing twist, travelling full twists. */
function rib(x, y, z, hw, th, T) {
  const ripple = 1.1 * Math.sin(0.21 * gi - 2.6 * T);
  const [tp, bump] = twistPackets(gi, T);
  push(x, y - 1.8 * bump, z + ripple - 4.5 * bump, hw, th + 0.3 * Math.sin(0.17 * gi - 3.1 * T) + tp);
  gi++;
}

/** A cubic from A (leaving along ta) to B (arriving along tb), n inner points, sagging back by zb. */
function connector(A, ta, B, tb, n, zb, thA, thB, hwA, hwB, T, loop = null, sag0 = 8) {
  const L = Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]);
  const ka = Math.min(7, L * 0.4), sag = sag0 * SHOW.flat;
  const c1 = [A[0] + ta[0] * ka, A[1] + ta[1] * ka + sag, A[2] + ta[2] * ka + zb];
  const c2 = [B[0] - tb[0] * ka, B[1] - tb[1] * ka + sag, B[2] - tb[2] * ka + zb];
  for (let j = 1; j <= n; j++) {
    const u = j / (n + 1), v = 1 - u;
    let x = v * v * v * A[0] + 3 * v * v * u * c1[0] + 3 * v * u * u * c2[0] + u * u * u * B[0];
    let y = v * v * v * A[1] + 3 * v * v * u * c1[1] + 3 * v * u * u * c2[1] + u * u * u * B[1];
    let z = v * v * v * A[2] + 3 * v * v * u * c1[2] + 3 * v * u * u * c2[2] + u * u * u * B[2];
    if (loop) {
      const q = progress(u, loop.u0, loop.u1);
      if (q > 0 && q < 1) {
        const psi = TAU * (loop.turns ?? 1) * q, dx = (B[0] - A[0]) / L, dy = (B[1] - A[1]) / L;
        const r = loop.r, sp = loop.spin;
        // e2: perpendicular to the run, turning about it.
        const px = -dy, py = dx;
        const e2x = px * Math.cos(sp), e2y = py * Math.cos(sp), e2z = Math.sin(sp);
        x += r * (-Math.sin(psi) * dx + (1 - Math.cos(psi)) * e2x);
        y += r * (-Math.sin(psi) * dy + (1 - Math.cos(psi)) * e2y);
        z += r * (1 - Math.cos(psi)) * e2z;
      }
    }
    rib(x, y, z, lerp(hwA, hwB, u), lerp(thA, thB + TAU, sstep(u)), T);
  }
}

const endT = (P, i, j) => { const x = P[j * 3] - P[i * 3], y = P[j * 3 + 1] - P[i * 3 + 1], z = P[j * 3 + 2] - P[i * 3 + 2]; const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; };
const at = (P, i) => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]];

function stickTip(T, tau) {
  const whirl = (t) => sstep(progress(t, -HOUR_PRE, -HOUR_PRE + 1)) * (1 - sstep(progress(t, 1, 2.5)));
  let pre = 0, extra = 0;
  if (SHOW.hour !== null) {
    // The whirl's phase is the integral of its speed, so it speeds up smoothly.
    pre = whirl(SHOW.hour);
    const n = 24, h = (SHOW.hour + HOUR_PRE) / n;
    for (let j = 0; j < n; j++) extra += whirl(-HOUR_PRE + (j + 0.5) * h) * h;
  }
  const w = (TAU * T) / 1.7 + TAU * 2.2 * extra;
  const r = 1 + 3 * pre;
  // The flick that sends each wave down the ribbon.
  const ph = (T % PACKET_EVERY) / PACKET_EVERY;
  let fl = Math.sin(TAU * ph) * Math.exp(-ph * 9) * 3;
  // On the minute the hand whips the stick to throw the corkscrew.
  if (tau > -1.6 && tau < 0.6) { const q = tau + 1.6; fl += 7 * Math.sin(q * 7) * Math.exp(-q * 2.2) * sstep(q * 4); }
  return [STICK_TIP[0] + 2.2 * r * Math.cos(w) + fl * 2, STICK_TIP[1] + 1.6 * r * Math.sin(w) - fl * 3, STICK_TIP[2] + 2 * r * Math.sin(w + 1)];
}

function assemble(T, tau, P, TW) {
  gi = 0;
  const hwOf = (k) => HW * SLOTS[k].k * SLOTS[k].hw;
  const tip = stickTip(T, tau);
  // The stick: a rod, its grip off the glass; a short cord from its tip
  // (the swivel) to where the ribbon starts.
  const s0 = np;
  for (let j = 0; j <= 10; j++) {
    const u = j / 10;
    push(lerp(STICK_BASE[0], tip[0], u), lerp(STICK_BASE[1], tip[1], u), lerp(STICK_BASE[2], tip[2], u), u < 0.35 ? 1.8 : 1.1, 0, 1);
  }
  strip(s0, np, -5000);
  const c0 = np, B0 = at(P[0], 0), tb0 = endT(P[0], 0, 2);
  for (let j = 0; j <= 10; j++) {
    const u = j / 10, v = 1 - u, sag = 3 * Math.sin(Math.PI * u);
    const cx1 = tip[0] + (B0[0] - tip[0]) * 0.3, cy1 = tip[1] + (B0[1] - tip[1]) * 0.3 + 4;
    const cx2 = B0[0] - tb0[0] * 6, cy2 = B0[1] - tb0[1] * 6;
    push(v * v * v * tip[0] + 3 * v * v * u * cx1 + 3 * v * u * u * cx2 + u * u * u * B0[0],
      v * v * v * tip[1] + 3 * v * v * u * cy1 + 3 * v * u * u * cy2 + u * u * u * B0[1] + sag * 0,
      lerp(tip[2], B0[2], u), 0.3, 0, 1);
  }
  strip(c0, np, -4000);
  const r0 = np;
  for (let k = 0; k < 4; k++) {
    for (let i = 0; i < N; i++) rib(P[k][i * 3], P[k][i * 3 + 1], P[k][i * 3 + 2], hwOf(k), TW[k][i], T, k);
    if (k < 3) {
      const A = at(P[k], N - 1), B = at(P[k + 1], 0);
      const knot = k === 1 ? { u0: 0.42, u1: 0.68, r: 4.2, spin: T * 2.4 } : null;
      connector(A, endT(P[k], N - 3, N - 1), B, endT(P[k + 1], 0, 2), k === 1 ? 34 : 10, k === 1 ? 6 : 5, TW[k][N - 1], TW[k + 1][0], hwOf(k), hwOf(k + 1), T, knot, k === 1 ? 10 : 1.5);
    }
  }
  // The tail: off the last numeral and out past the right edge, a snake
  // running down it. Before the hour the whirl throws it up over the
  // minutes into a row of rolling spirals, the gymnast's spirals.
  const pre = SHOW.hour === null ? 0 : sstep(progress(SHOW.hour, -HOUR_PRE, -HOUR_PRE + 1.4)) * (1 - sstep(progress(SHOW.hour, -1.5, -0.6)));
  const E = at(P[3], N - 1), te = endT(P[3], N - 3, N - 1);
  let x = E[0], y = E[1], z = E[2];
  const h0 = Math.atan2(te[1], te[0]);
  const target = -0.5 + 0.35 * Math.sin(T * 0.9);
  let dh = target - h0; dh = ((dh + Math.PI) % TAU + TAU) % TAU - Math.PI;
  const n = pre > 0.002 ? PRE_N : TAIL_N;
  const roll = SHOW.hour === null ? 0 : (SHOW.hour + HOUR_PRE) * 7;
  for (let j = 1; j <= n; j++) {
    const u = Math.min(1, j / TAIL_N);
    const head = h0 + dh * sstep(j / 7) + 0.8 * u * Math.sin(0.5 * j - 6.5 * T);
    x += TAIL_STEP * Math.cos(head); y += TAIL_STEP * Math.sin(head); z += 0.4;
    let px = x, py = y, pz = z;
    if (pre > 0.002) {
      // Spirals: a prolate trochoid rolling leftwards along the top.
      const v = j / PRE_N, a = TAU * 5.5 * v + roll, r = 4.6 * sstep(v * 8);
      const zz = MZ + 14 + 3 * Math.sin(a);
      const lead = sstep(v * 7);
      const sx = lerp(124, 56, v) + r * Math.sin(a), sy = lerp(lerp(E[1] * D / (E[2] + D) + VY, 6, lead), 6, lead) - r * Math.cos(a) + 1.5 * Math.sin(TAU * v * 2 - 3 * T);
      const [wx, wy] = toWorld(sx, sy, zz);
      const m = pre * sstep(j / 6);
      px = lerp(x, wx, m); py = lerp(y, wy, m); pz = lerp(z, zz, m);
    }
    rib(px, py, pz, hwOf(3) * (1 - 0.2 * pre * j / PRE_N), TW[3][N - 1] + 0.2 * j, T);
  }
  strip(r0, np, 0);
}

// ------------------------------------------------------------ the turns
// The minute: the changing numeral peels off from its end, the stick's end,
// into a corkscrew that whirls in front of its place (spinning, so both
// faces flash by), then it is laid down again from its start as the new
// numeral, every point on its own spring. The old one is gone by :00 and
// the new one starts only after, so no instant shows a wrong digit.
// The hour: all four numerals peel into one long corkscrew that spins
// across the whole glass, then the new time is laid out of it.

const HOUR_PRE = 4.5;
const M_PEEL = [-1.25, -0.05], M_LAY = [0.05, 0.75], STAG = 0.75;
const H_PEEL = [-1.1, -0.12], H_LAY = [0.02, 0.42];
const HELIX_Z = 12, HX0 = toWorld(6, 32, HELIX_Z), HX1 = toWorld(122, 32, HELIX_Z);

function flourish(k, u, tau, T, hour, out) {
  const sl = SLOTS[k], sc = sl.k;
  if (!hour) {
    // A corkscrew standing in the numeral's place, tipped towards the
    // viewer so its turns open, spinning and climbing.
    const phi = TAU * 2.6 * u + 8.5 * tau + k;
    const r = sc * (7 + 1.5 * Math.sin(Math.PI * u));
    const lx = r * Math.cos(phi), lz = r * Math.sin(phi), ly = sc * GH * 0.72 * (u - 0.5) - 3 * tau;
    const tp = 0.55, ct = Math.cos(tp), st = Math.sin(tp);
    out[0] = sl.c[0] + lx;
    out[1] = sl.c[1] - 4 + ly * ct - lz * st + 2 * Math.sin(TAU * T / 1.3);
    out[2] = sl.c[2] - 6 * sc + ly * st + lz * ct;
    return phi;
  }
  // One coil spring of ribbon across the glass, its axis turned a little
  // towards the viewer so the turns open into ellipses, spinning.
  const ug = (k + u) / 4;
  const phi = TAU * 6.5 * ug - 11 * tau;
  const R = 11 + 2.5 * Math.sin(TAU * ug * 1.5 + tau * 3);
  const ax = lerp(-74, 74, ug) + 6 * Math.sin(tau * 2.2);
  const yw = 0.8 + 0.2 * Math.sin(tau * 1.7), cy = Math.cos(yw), sy = Math.sin(yw);
  const ly = R * Math.cos(phi), lz = R * Math.sin(phi);
  out[0] = ax * cy - lz * sy;
  out[1] = 3 + ly - 9 * Math.sin(Math.PI * ug) + 3 * Math.sin(TAU * ug + tau * 4);
  out[2] = HELIX_Z + ax * sy * 0.6 + lz * cy;
  return phi;
}

const FL = [0, 0, 0];
/** Fill CUR[k] / CTW[k] for slot k mid-turn; returns how laid it is (0..1). */
function morph(k, tau, T, hour) {
  const P = CUR[k], tw = CTW[k], O = OLD[k], Nw = NEW[k];
  const peel = hour ? H_PEEL : M_PEEL, lay = hour ? H_LAY : M_LAY;
  const off = hour ? 0.04 * k : 0;
  let laid = 0;
  for (let i = 0; i < N; i++) {
    const u = i / (N - 1);
    const phi = flourish(k, u, tau, T, hour, FL);
    let x, y, z, th;
    if (tau < 0) {
      // Peel: from the end (the stick's side) back to the start.
      const t0 = peel[0] + off + (peel[1] - peel[0] - off) * STAG * (1 - u) * 0.999;
      const e = sstep((tau - t0) / ((peel[1] - peel[0] - off) * (1 - STAG)));
      const lift = Math.sin(Math.PI * e) * 7 * SLOTS[k].k;
      x = lerp(O[i * 3], FL[0], e); y = lerp(O[i * 3 + 1], FL[1], e) - lift * 0.4; z = lerp(O[i * 3 + 2], FL[2], e) - lift;
      th = lerp(OTW[k][i], phi * 0.5, e);
      laid += 1 - e;
    } else {
      // Lay: from the start, each point on a spring.
      const t0 = lay[0] + off + (lay[1] - lay[0]) * u;
      const e = SPRING(tau - t0, 0.48, 10);
      x = lerp(FL[0], Nw[i * 3], e); y = lerp(FL[1], Nw[i * 3 + 1], e); z = lerp(FL[2], Nw[i * 3 + 2], e);
      th = lerp(phi * 0.5, NTW[k][i], Math.min(1, e));
      laid += Math.min(1, e);
    }
    P[i * 3] = x; P[i * 3 + 1] = y; P[i * 3 + 2] = z; tw[i] = th;
  }
  return laid / N;
}
