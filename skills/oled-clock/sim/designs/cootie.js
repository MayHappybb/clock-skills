// Cootie — a paper fortune teller (cootie catcher) in real 3D, that tells
// the time the way it tells fortunes.
//
// The paper is modelled as it is folded: the inner surface is the square
// [-1,1]^2 creased into eight right triangles (O, C_k, M_j) round its centre
// O, with four tips C_k (the pocket points) and four rim points M_j (the
// edge midpoints, where two pockets meet). Every triangle is rigid: given
// the four tips anywhere on the sphere |C| = sqrt2, each rim point is fixed
// (|M| = |M - C_a| = |M - C_b| = 1), so any pose of the tips is a real,
// unstretched fold, from shut, through open one way or the other, to flat.
// Each pocket has an outside (two backs and a floor). Faces are rasterised
// with a z-buffer and perspective-correct sheet coordinates. The paper is
// drawn dark: its outline, its creases, and a light tint on the faces
// turned to the light. The ink is solid and bold in a dark moat, so the
// time is the brightest thing on it. 24-hour clock.
//
// The time. Held open, the far wall of the mouth is one inner flap, and on
// it the hour is written in felt tip; the minutes are written across the
// two near pockets, one digit filling each. The ink is on the paper: it foreshortens, folds into
// the seams and turns away with it. Every second the fingers give a little
// pinch; the paper breathes and wobbles in the hand.
//
// The minute: it is counted out. Snap shut, open the other way, shut, open,
// shut, while it turns a quarter in the fingers, and it lands open on the
// next station: another flap, two other pocket faces, with the new minute.
// (Four stations; the turn hides the old faces before :00 and brings the
// new round after.)
//
// The hour: it snaps shut and unfolds flat in the fingers, the whole crease
// pattern laid out and turned to the eye, old hour on the far flap, old
// minutes on the near one; at :00 it is flipped over the vertical, and on
// the back is the new time, written large. It is flipped back over the
// diagonal, which turns it a quarter onto the next station, new hour on
// top, and folds itself up again.
//
// Burn-in: the wobble, the quarter turn every minute, and kit.orbit.
// 23:00-07:00 the panel dims (ctx.night).

import { clamp, ease, progress, clockFields, previousMinute, orbit } from '../js/kit.js';

const W = 128, H = 64;
const R2 = Math.SQRT2, TAU = Math.PI * 2;

// ------------------------------------------------------------ the paper
// Pockets k: 0 NE, 1 NW, 2 SW, 3 SE. Seams j (rim points) 0 N, 1 W, 2 S, 3 E;
// seam j lies between pockets j and j+1. Face [k, j]: triangle O, C_k, M_j.
const DIAG = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
const SEAM = [[0, 1], [-1, 0], [0, -1], [1, 0]];

function midOf(a, b, s, out) {
  const c = Math.max(0, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]);
  const al = 1 / (2 + c);
  let nx = a[1] * b[2] - a[2] * b[1], ny = a[2] * b[0] - a[0] * b[2], nz = a[0] * b[1] - a[1] * b[0];
  let l = Math.hypot(nx, ny, nz);
  if (l < 1e-9) { nx = s[0]; ny = s[1]; nz = 0; l = 1; }
  if (nx * s[0] + ny * s[1] < 0) { nx = -nx; ny = -ny; nz = -nz; }
  const gm = Math.sqrt(c / (2 + c)) / l;
  out[0] = al * (a[0] + b[0]) + gm * nx; out[1] = al * (a[1] + b[1]) + gm * ny; out[2] = al * (a[2] + b[2]) + gm * nz;
  return out;
}

/** The pocket's floor point: O reflected through the plane C, M1, M2. */
function floorOf(c, m1, m2) {
  const ax = m1[0] - c[0], ay = m1[1] - c[1], az = m1[2] - c[2], bx = m2[0] - c[0], by = m2[1] - c[1], bz = m2[2] - c[2];
  let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
  const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
  const d = c[0] * nx + c[1] * ny + c[2] * nz;
  return [2 * d * nx, 2 * d * ny, 2 * d * nz];
}

/**
 * A pose. `a1` opens the E/W seams (tips pair north and south), `a2` the
 * N/S seams (tips pair east and west); `flat` 0..1 lays the paper out.
 */
function pose(a1, a2, flat) {
  const e = 0.07;
  const C = DIAG.map(([dx, dy], k) => {
    const hx = e * dx + 0.8 * a2 * dx, hy = e * dy + 0.8 * a1 * dy;
    let th = Math.atan(Math.hypot(hx, hy)), ps = Math.atan2(hy, hx);
    const dps = Math.atan2(dy, dx);
    let d = dps - ps; d = Math.atan2(Math.sin(d), Math.cos(d));
    ps += d * flat; th += (Math.PI / 2 - th) * flat;
    return [R2 * Math.sin(th) * Math.cos(ps), R2 * Math.sin(th) * Math.sin(ps), R2 * Math.cos(th)];
  });
  const M = SEAM.map((s, j) => midOf(C[j], C[(j + 1) % 4], s, [0, 0, 0]));
  const B = C.map((c, k) => {
    const f = floorOf(c, M[k], M[(k + 3) % 4]);
    return [f[0] * (1 - flat) + c[0] * 0.5 * flat, f[1] * (1 - flat) + c[1] * 0.5 * flat, f[2] * (1 - flat)];
  });
  return { C, M, B };
}

// ------------------------------------------------------------ the camera

let EL = 1.05, CE = Math.cos(EL), SE = Math.sin(EL);
const DIST = 7.5;
let FOC = 240;
let CX = 64, CY = 31, TZ = 0.55, LIFT = 0;
const ROT = [1, 0, 0, 0, 1, 0, 0, 0, 1];   // the paper's own turn (wobble), row-major

function mat3(A, B) {
  const o = new Array(9);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o[r * 3 + c] = A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c];
  return o;
}
const RX = (a) => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c]; };
const RY = (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; };
const RZ = (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1]; };

/**
 * R = Rx(tilt) . F2 . Ry(flip) . Rz(yaw): turn the paper about its axis,
 * flip it over the screen's vertical, then (flip2) over the diagonal at
 * 45 deg, which with the first flip makes a quarter turn; tilt it to the eye.
 */
function setRot(yaw, tilt, flip, flip2 = 0) {
  let M = mat3(RY(flip), RZ(yaw));
  if (flip2) M = mat3(mat3(RZ(Math.PI / 4), mat3(RY(flip2), RZ(-Math.PI / 4))), M);
  M = mat3(RX(tilt), M);
  for (let i = 0; i < 9; i++) ROT[i] = M[i];
}

/** Paper point -> world (turned, lifted) in w -> screen [sx, sy, depth] in out. */
function project(p, out, w) {
  const x = ROT[0] * p[0] + ROT[1] * p[1] + ROT[2] * p[2];
  const y = ROT[3] * p[0] + ROT[4] * p[1] + ROT[5] * p[2];
  const z = ROT[6] * p[0] + ROT[7] * p[1] + ROT[8] * p[2] + LIFT;
  w[0] = x; w[1] = y; w[2] = z;
  const zz = z - TZ;
  const Y = y * SE + zz * CE, Z = DIST + y * CE - zz * SE;
  out[0] = CX + (FOC * x) / Z; out[1] = CY - (FOC * Y) / Z; out[2] = Z;
}

// ------------------------------------------------------------ letterforms
// A felt-tip hand, as a kid writes the numbers inside a fortune teller:
// round, upright, centre-lines in a 10 x 14 box, smoothed (Catmull-Rom) and
// stroked round.

const SK = {
  0: [[[5.6, 1.2], [2.2, 3.2], [1.4, 7.4], [2.6, 11.8], [5.4, 13.1], [8.2, 11], [8.8, 6.4], [7.6, 2.4], [5.2, 1.1], [3.8, 1.9]]],
  1: [[[2.4, 4.4], [4.6, 2.6], [6.0, 1.0], [5.9, 7], [5.8, 13.2]]],
  2: [[[1.6, 4.4], [3.0, 1.8], [5.6, 1.0], [8.2, 2.6], [8.2, 5.4], [5.6, 8.6], [1.6, 13.0], [5.4, 12.8], [9.0, 13.0]]],
  3: [[[1.8, 2.8], [4.6, 1.0], [7.8, 2.0], [7.8, 5.0], [4.8, 6.8], [3.8, 6.9]], [[4.8, 6.8], [8.2, 8.0], [8.6, 11.0], [5.6, 13.2], [1.4, 11.8]]],
  4: [[[6.2, 1.0], [3.8, 5.0], [1.2, 9.6], [5.4, 9.6], [9.4, 9.6]], [[7.2, 4.8], [7.1, 9.0], [7.0, 13.4]]],
  5: [[[8.6, 1.2], [5.2, 1.2], [2.6, 1.2], [2.2, 4.0], [2.0, 6.6], [4.8, 5.6], [8.0, 6.8], [8.8, 10.0], [6.4, 13.0], [3.0, 13.0], [1.4, 11.4]]],
  6: [[[7.8, 1.4], [4.6, 2.8], [2.0, 6.6], [1.8, 10.8], [5.0, 13.2], [8.2, 11.6], [8.4, 8.4], [5.6, 6.8], [2.4, 8.4]]],
  7: [[[1.2, 2.6], [1.4, 1.2], [5.4, 1.2], [9.0, 1.2], [6.6, 5.2], [4.6, 9.4], [3.8, 13.4]]],
  8: [[[5.2, 6.9], [2.4, 5.0], [2.2, 2.4], [5.0, 1.0], [7.8, 2.2], [7.8, 4.8], [5.2, 6.9], [1.6, 9.0], [2.0, 12.0], [5.0, 13.3], [8.2, 12.0], [8.6, 9.2], [5.2, 6.9]]],
  9: [[[8.2, 4.8], [5.4, 7.2], [2.2, 6.0], [2.0, 2.8], [5.0, 1.0], [8.0, 2.2], [8.4, 5.0], [8.0, 9.4], [6.6, 13.4]]],
};

function catmull(pts, n = 6) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let s = 0; s < n; s++) {
      const t = s / n, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((c) => 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3)));
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

// Distance fields, 4 samples per glyph unit, over a padded box.
const GS = 4, GPAD = 2, GW = (10 + 2 * GPAD) * GS, GH = (14 + 2 * GPAD) * GS;
const GLYPH = Array.from({ length: 10 }, (_, d) => {
  const segs = [];
  for (const st of SK[d]) {
    const p = catmull(st);
    for (let i = 1; i < p.length; i++) segs.push([p[i - 1][0], p[i - 1][1], p[i][0], p[i][1]]);
  }
  const F = new Float32Array(GW * GH);
  for (let j = 0; j < GH; j++)
    for (let i = 0; i < GW; i++) {
      const x = (i + 0.5) / GS - GPAD, y = (j + 0.5) / GS - GPAD;
      let best = 1e9;
      for (const [ax, ay, bx, by] of segs) {
        const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
        const u = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0;
        const e = (x - ax - u * dx) ** 2 + (y - ay - u * dy) ** 2;
        if (e < best) best = e;
      }
      F[j * GW + i] = Math.sqrt(best);
    }
  return F;
});

// Each numeral's horizontal centre (ink extent), so a narrow 1 sits in the middle of its flap.
const GCX = Object.keys(SK).map((d) => {
  const xs = SK[d].flat().map((p) => p[0]);
  return (Math.min(...xs) + Math.max(...xs)) / 2;
});

/** Distance (glyph units) from glyph point (x, y) to digit d's centre-line (centred on its ink). */
function glyphDist(d, x, y) {
  x += GCX[d] - 5;
  const i = Math.floor((x + GPAD) * GS), j = Math.floor((y + GPAD) * GS);
  if (i < 0 || j < 0 || i >= GW || j >= GH) return 99;
  return GLYPH[d][j * GW + i];
}

// ------------------------------------------------------------ stations
// The fortune teller rests open one way; a quarter turn plus a switch of
// the opening way looks the same but shows different faces. So it has four
// stations, s = 0..3 (s even: N/S seams open; s odd: E/W, turned +90 deg).
// At each, the far wall of the mouth is one inner flap (two faces) and the
// front lip is the outside of two pockets. Every face belongs to exactly
// one station.

const STATION = [0, 1, 2, 3].map((s) => ({
  s, mode: s % 2 ? 1 : 2, yaw: (s * Math.PI) / 2,
  far: (4 - s) % 4,                                   // seam at the back
  front: (6 - s) % 4, fl: (6 - s) % 4, fr: (7 - s) % 4, // seam at the front, its left and right pockets
}));
const REST = 0.78;

/** Pose at station s, opened by a. */
function stationPose(s, a, flat = 0) {
  return STATION[s].mode === 1 ? pose(a, 0, flat) : pose(0, a, flat);
}

// Outer ink (the minutes, one digit per front pocket) is written as it
// looks at rest, across the whole outside of the pocket (both its faces):
// per station and face, the affine map from the face's paper chart to the
// rest view; per pocket, where the numeral sits and how big it is.
const OUTER_INK = [{}, {}, {}, {}];
function buildInk() {
  const q = [0, 0, 0], w = [0, 0, 0];
  const pr = (p) => { project(p, q, w); return [q[0], q[1]]; };
  for (const st of STATION) {
    setRot(st.yaw, 0, 0); LIFT = 0;
    const P = stationPose(st.s, REST);
    [st.fl, st.fr].forEach((k, side) => {
      const jf = st.front, jo = side === 0 ? (k + 3) % 4 : k;   // the pocket's front seam and its outer seam
      const B = pr(P.B[k]), C = pr(P.C[k]), Mf = pr(P.M[jf]), Mo = pr(P.M[jo]);
      // the numeral sits in the wide part of the kite C, Mf, B, Mo, centred
      // on its span, leaning with it (the kite's axis slants out at the top)
      const kite = [C, Mf, B, Mo];
      const span = (y) => {
        const xs = [];
        for (let i = 0; i < 4; i++) {
          const [ax, ay] = kite[i], [bx, by] = kite[(i + 1) % 4];
          if ((ay - y) * (by - y) <= 0 && ay !== by) xs.push(ax + ((y - ay) * (bx - ax)) / (by - ay));
        }
        return (Math.min(...xs) + Math.max(...xs)) / 2;
      };
      const gy = C[1] + 0.56 * (B[1] - C[1]);
      const gx = span(gy);
      const sc = (0.47 * (B[1] - C[1])) / 14;   // px per glyph unit at rest
      const lean = (span(gy - 7 * sc) - span(gy + 7 * sc)) / (14 * sc);
      for (const j of [jf, jo]) {
        const M = j === jf ? Mf : Mo;
        const [u1, v1] = DIAG[k], [u2, v2] = SEAM[j];
        const det = u1 * v2 - u2 * v1;
        const ix = [v2 / det, -u2 / det, -v1 / det, u1 / det];
        const dx1 = C[0] - B[0], dy1 = C[1] - B[1], dx2 = M[0] - B[0], dy2 = M[1] - B[1];
        const A = [dx1 * ix[0] + dx2 * ix[2], dx1 * ix[1] + dx2 * ix[3], dy1 * ix[0] + dy2 * ix[2], dy1 * ix[1] + dy2 * ix[3], B[0], B[1]];
        OUTER_INK[st.s][`${k},${j}`] = { A, gx, gy, sc, side, k, lean: lean * 0.8 };
      }
    });
  }
}

// Ink is a solid stroke with a dark moat round it, so it is the brightest,
// boldest thing on the paper. Radii in glyph units.
const INK_R = 1.4, MIN_R = 1.15, MOAT = 1.0;

// Inner ink (the hours) is written on the paper itself, upright on each
// flap as you would write it on the flat sheet: on flap N in station-0
// sheet coordinates, and the other flaps turned with their stations.
const HOUR_U = [-0.245, 0.245], HOUR_V = 0.655, HOUR_H = 0.62;   // centres and height, sheet units
const HK = HOUR_H / 14;

/** Is sheet point (u, v) on hour ink, for hour digits hd? (u, v) any flap. */
// FLAPS[j]: what is written on flap j (seam j): null (blank), or
// { d: [tens, ones], inv } where inv writes it upside down, to be read with
// the flap nearest the viewer (the flat sheet).
const FLAPS = [null, null, null, null];
function hourInk(u, v, _hd, w = 1) {
  // turn (u, v) into its flap's own frame (as flap N): upright when it is the far wall
  let x = u, y = v, j = 0;
  if (Math.abs(u) > Math.abs(v)) { if (u > 0) { x = -v; y = u; j = 3; } else { x = v; y = -u; j = 1; } }
  else if (v < 0) { x = -u; y = -v; j = 2; }
  const F = FLAPS[j];
  if (!F) return 0;
  if (F.inv) { x = -x; y = 2 * HOUR_V - y; }
  const hd = F.d;
  const side = x < 0 ? 0 : 1;
  const gx = (x - HOUR_U[side]) / HK + 5, gy = (HOUR_V - y) / HK + 7;
  const dd = glyphDist(hd[side], gx, gy);
  return dd < INK_R * w ? 1 : dd < INK_R * w + MOAT ? 2 : 0;
}

// The back of the flat sheet (seen once it is flipped over the vertical):
// the new time written large, the hour over the minutes, mirrored in u
// because the flip mirrors it back. BACK = { h: [d, d], m: [d, d] }.
function backInk(u, v) {
  const c = Math.cos(INKYAW), s = Math.sin(INKYAW);
  const X = -(c * u - s * v), Y = s * u + c * v;
  const row = Y > -0.18 ? 0 : 1;
  const hk = row ? 0.5 / 14 : 0.95 / 14, cy = row ? -0.56 : 0.34, gap = row ? 0.3 : 0.5;
  const side = X < 0 ? 0 : 1;
  const d = row ? BACK.m[side] : BACK.h[side];
  const dd = glyphDist(d, (X - (side ? gap : -gap)) / hk + 5, (cy - Y) / hk + 7) * hk;
  const r = row ? 0.075 : 0.095;
  return dd < r ? 1 : dd < r + 0.06 ? 2 : 0;
}

// ------------------------------------------------------------ rasteriser

const ZB = new Float32Array(W * H), FID = new Int16Array(W * H), PU = new Float32Array(W * H), PV = new Float32Array(W * H);
const LIGHT = (() => { const v = [-0.5, -0.45, 0.75]; const l = Math.hypot(...v); return v.map((c) => c / l); })();

function rasterTri(S, UV, id) {
  const [a, b, c] = S;
  const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]))), x1 = Math.min(W - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
  const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]))), y1 = Math.min(H - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
  const den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
  if (Math.abs(den) < 1e-6) return;
  const iza = 1 / a[2], izb = 1 / b[2], izc = 1 / c[2];
  for (let y = y0; y <= y1; y++) {
    const py = y + 0.5;
    for (let x = x0; x <= x1; x++) {
      const px = x + 0.5;
      const w0 = ((b[1] - c[1]) * (px - c[0]) + (c[0] - b[0]) * (py - c[1])) / den;
      const w1 = ((c[1] - a[1]) * (px - c[0]) + (a[0] - c[0]) * (py - c[1])) / den;
      const w2 = 1 - w0 - w1;
      if (w0 < -1e-3 || w1 < -1e-3 || w2 < -1e-3) continue;
      const iz = w0 * iza + w1 * izb + w2 * izc, z = 1 / iz;
      const i = y * W + x;
      if (z >= ZB[i]) continue;
      ZB[i] = z; FID[i] = id;
      PU[i] = (w0 * iza * UV[0][0] + w1 * izb * UV[1][0] + w2 * izc * UV[2][0]) * z;
      PV[i] = (w0 * iza * UV[0][1] + w1 * izb * UV[1][1] + w2 * izc * UV[2][1]) * z;
    }
  }
}

const TRIS = [];
for (let k = 0; k < 4; k++)
  for (const j of [k, (k + 3) % 4]) {
    TRIS.push({ kind: 0, k, j });   // inner face
    TRIS.push({ kind: 1, k, j });   // the pocket's outside behind it
  }
for (let k = 0; k < 4; k++) TRIS.push({ kind: 2, k, j: -1 });   // pocket floor

const S3 = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], WV = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
const LEV = new Float32Array(TRIS.length), SHOW = new Uint8Array(TRIS.length);
const ZERO = [0, 0, 0], UV0 = [[0, 0], [0, 0], [0, 0]];

/**
 * Draw the fortune teller in pose P. `hd` the hour digits inked inside,
 * `md` the minute digits on the pockets' outsides (null: none).
 */
let ALLINK = false, BACK = null, INKYAW = 0, FLAT = 0;
const INKW = new Float32Array(TRIS.length);   // stroke weight per face: thins as the ink turns off upright

/** Cosine between a screen vector (dx, dy) and screen-up. */
const upCos = (dx, dy) => -dy / (Math.hypot(dx, dy) || 1);

let MDS = -1;
function drawPaper(g, P, hd, md) {
  ZB.fill(1e9); FID.fill(-1);
  MDS = md ? md.findIndex((x) => x) : -1;
  const cam = [0, -CE * DIST, SE * DIST + TZ];
  for (let id = 0; id < TRIS.length; id++) {
    const T = TRIS[id];
    let V, UV;
    if (T.kind === 0) { V = [ZERO, P.C[T.k], P.M[T.j]]; UV = [[0, 0], DIAG[T.k], SEAM[T.j]]; }
    else if (T.kind === 1) { V = [P.B[T.k], P.C[T.k], P.M[T.j]]; UV = [[0, 0], DIAG[T.k], SEAM[T.j]]; }
    else { V = [P.B[T.k], P.M[T.k], P.M[(T.k + 3) % 4]]; UV = UV0; }
    if (T.kind > 0 && FLAT > 0.85) { SHOW[id] = 0; continue; }
    for (let i = 0; i < 3; i++) project(V[i], S3[i], WV[i]);
    const [p0, p1, p2] = WV;
    const ax = p1[0] - p0[0], ay = p1[1] - p0[1], az = p1[2] - p0[2], bx = p2[0] - p0[0], by = p2[1] - p0[1], bz = p2[2] - p0[2];
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    const vx = cam[0] - p0[0], vy = cam[1] - p0[1], vz = cam[2] - p0[2];
    const vl = Math.hypot(vx, vy, vz);
    const fc = (vx * nx + vy * ny + vz * nz) / vl;            // cosine to the eye, signed
    const sg = fc > 0 ? 1 : -1;
    LEV[id] = sg * (nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]);
    // ink only where the right side of the paper looks at the viewer squarely enough
    let show = 0;
    if (T.kind === 0) {
      const wind = DIAG[T.k][0] * SEAM[T.j][1] - DIAG[T.k][1] * SEAM[T.j][0];
      if ((fc > 0) === (wind > 0)) {
        // the hour reads up the flap, O -> M on screen
        const c = ALLINK ? 1 : upCos(S3[2][0] - S3[0][0], S3[2][1] - S3[0][1]);
        INKW[id] = clamp((c - 0.62) / 0.2, 0, 1) * clamp((Math.abs(fc) - 0.15) / 0.2, 0, 1);
        if (INKW[id] > 0) show = 1;
      } else if (BACK) { show = 3; INKW[id] = 1; }
    } else if (T.kind === 1 && MDS >= 0 && OUTER_INK[MDS][`${T.k},${T.j}`]) {
      // the numeral's up, carried from the rest view to now through the paper
      const I = OUTER_INK[MDS][`${T.k},${T.j}`];
      const det = I.A[0] * I.A[3] - I.A[1] * I.A[2];
      const su = I.A[1] / det, sv = -I.A[0] / det;   // sheet direction that is screen-up at rest: A^-1 (0,-1)
      const [u1, v1] = DIAG[T.k], [u2, v2] = SEAM[T.j], dt = u1 * v2 - u2 * v1;
      const wa = (su * v2 - sv * u2) / dt, wb = (sv * u1 - su * v1) / dt;   // su,sv = wa*DIAG + wb*SEAM
      const dx = wa * (S3[1][0] - S3[0][0]) + wb * (S3[2][0] - S3[0][0]), dy = wa * (S3[1][1] - S3[0][1]) + wb * (S3[2][1] - S3[0][1]);
      INKW[id] = clamp((upCos(dx, dy) - 0.62) / 0.2, 0, 1) * clamp((Math.abs(fc) - 0.15) / 0.2, 0, 1);
      if (INKW[id] > 0) show = 2;
    }
    SHOW[id] = show;
    rasterTri(S3, UV, id);
  }

  // a flat sheet seen edge-on is a line, not nothing
  if (FLAT > 0.85) {
    const q = [0, 0, 0], w = [0, 0, 0], pts = P.C.map((c) => { project(c, q, w); return [q[0], q[1]]; });
    for (let k = 0; k < 4; k++) { const a = pts[k], b2 = pts[(k + 1) % 4]; g.line(a[0], a[1], b2[0], b2[1]); }
  }
  // Paper: dark, drawn by its outline and its creases, with a light tint
  // only on the faces turned to the light. Ink: solid, in a dark moat.
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x, id = FID[i];
      if (id < 0) continue;
      const b = LEV[id], sh = SHOW[id];
      let ink = 0;
      if (sh === 1) ink = hourInk(PU[i], PV[i], hd, INKW[id]);
      else if (sh === 2) {
        const T = TRIS[id], I = OUTER_INK[MDS][`${T.k},${T.j}`];
        const sx = I.A[0] * PU[i] + I.A[1] * PV[i] + I.A[4], sy = I.A[2] * PU[i] + I.A[3] * PV[i] + I.A[5];
        const gyy = (sy - I.gy) / I.sc;
        const dd = glyphDist(md[MDS][I.side], (sx - I.gx) / I.sc + I.lean * gyy + 5, gyy + 7);
        const r = MIN_R * INKW[id];
        ink = INKW[id] > 0.05 && dd < r ? 1 : dd < r + MOAT ? 2 : 0;
      } else if (sh === 3) ink = backInk(PU[i], PV[i]);
      if (ink === 1) { g.pixel(x, y); continue; }
      if (ink === 2) continue;
      let edge = 0;
      for (let q = 0; q < 4; q++) {
        const xx = x + (q === 0 ? 1 : q === 1 ? -1 : 0), yy = y + (q === 2 ? 1 : q === 3 ? -1 : 0);
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const n = yy * W + xx, nid = FID[n];
        if (nid < 0) { edge = 2; break; }
        if (nid === id || (q & 1) || ZB[n] <= ZB[i] - 0.002) continue;
        // no crease across a numeral: the two faces of one inked pocket, or of the inked back
        const T = TRIS[id], N = TRIS[nid];
        if (sh === 3 && SHOW[nid] === 3) continue;
        if (sh === 2 && SHOW[nid] === 2 && T.k === N.k) continue;
        edge = 1;
      }
      if (edge) { g.pixel(x, y); continue; }
      if (b > 0.5 && !sh && !(x & 1) && !(y & 1)) g.pixel(x, y);
    }
}

// ------------------------------------------------------------ the face

let built = false, REST_TIPZ = 0;
function build() {
  if (built) return; built = true; buildInk();
  REST_TIPZ = stationPose(0, REST).C[0][2];
}
const digits2 = (n) => [Math.floor(n / 10), n % 10];

// Minute ink: the current station carries this minute; while counting,
// the old one keeps the old minute until :00 and the new one gets the new
// minute from :00 (the swap happens with the paper shut and mid-turn).
function minuteInk(s, minute, sOld, minuteOld) {
  const out = [null, null, null, null];
  if (sOld != null) out[sOld] = digits2(minuteOld);
  out[s] = digits2(minute);
  return out;
}

// The count, relative to :00: shut, open the other way, shut, open, shut,
// land open on the next station; the fortune teller turns a quarter in the
// fingers meanwhile. [time, openness, which station's way]
const COUNT = [[-1.05, 1, 0], [-0.82, 0, 0], [-0.6, 0.8, 1], [-0.4, 0, 1], [-0.2, 0.8, 0], [0, 0, 0], [0.65, 1, 1]];
const C_START = COUNT[0][0], C_END = COUNT[COUNT.length - 1][0];
function countPose(s0, tau) {
  let i = 0;
  while (i < COUNT.length - 2 && tau >= COUNT[i + 1][0]) i++;
  const [t0, o0, w0] = COUNT[i], [t1, o1, w1] = COUNT[i + 1];
  const u = clamp((tau - t0) / (t1 - t0), 0, 1);
  const last = i === COUNT.length - 2;
  const e = last ? ease.outBack(u) : o1 < o0 ? ease.inQuad(u) : ease.outQuad(u);
  const open = o0 + (o1 - o0) * e;
  const way = o1 > o0 ? w1 : w0;
  const m = STATION[(s0 + way) % 4].mode;
  const a = REST * Math.max(0, open);
  const turn = ease.inOutCubic(clamp((tau + 0.95) / 1.5, 0, 1));
  return { a1: m === 1 ? a : 0, a2: m === 2 ? a : 0, yaw: STATION[s0].yaw + (turn * Math.PI) / 2 };
}

// The hour, relative to :00: snap shut, unfold flat and turn it up to the
// eye (inside: the hour at the top, the minutes at the bottom), flip it
// over the vertical: on the back, the new time, written large. Flip it back
// over the diagonal, which turns it a quarter, so the next station's flap
// is now at the top, inked with the new hour; fold it up again.
const HR = { shut: -2.0, unfold: -1.65, flip: -0.55, back: 0.55, flip2: 2.1, front: 2.9, fold: 3.4, end: 4.6 };
const TILT = 0.55;
function hourPose(s0, tau, a0) {
  const st = STATION[s0];
  let a = REST, bring = 0, flip = 0, flip2 = 0;
  const p = (x, y) => clamp((tau - x) / (y - x), 0, 1);
  if (tau < HR.unfold) a = a0 * (1 - ease.inQuad(p(HR.shut, HR.unfold)));
  else if (tau < HR.fold) { a = 0; bring = ease.inOutCubic(p(HR.unfold, HR.flip - 0.05)); }
  else { bring = 1 - ease.inOutCubic(p(HR.fold, HR.end - 0.15)); a = REST * (1 + 0.12 * Math.sin(Math.PI * p(HR.fold + 0.5, HR.end))); }
  if (tau >= HR.flip) flip = Math.PI * ease.inOutCubic(p(HR.flip, HR.back));
  if (tau >= HR.flip2) flip2 = Math.PI * ease.inOutCubic(p(HR.flip2, HR.front));
  const m = STATION[tau >= HR.fold ? (s0 + 1) % 4 : s0].mode;
  // a little toss: the sheet lifts off the hands while it flips
  const toss = 0.25 * (Math.sin(Math.PI * p(HR.flip, HR.back)) + Math.sin(Math.PI * p(HR.flip2, HR.front)));
  return { a1: m === 1 ? a : 0, a2: m === 2 ? a : 0, flat: bring, tilt: TILT * bring, flip, flip2, yaw: st.yaw, bring, toss };
}

/** For review (out/cootie-digits.png): the ten numerals in ink on paper, at hour and pocket size. */
export function specimen(g, sc = 1.25) {
  for (let d = 0; d <= 9; d++) {
    const ox = 4 + (d % 5) * 20, oy = 4 + Math.floor(d / 5) * 24;
    g.fillWhere((x, y) => glyphDist(d, (x - ox) / sc, (y - oy) / sc) < INK_R, 1, [ox - 3, oy - 3, 18, 24]);
  }
}

export default {
  name: 'Cootie',
  blurb: 'A paper fortune teller in real 3D: the hour inked inside its mouth, a minute digit across each front pocket; each minute it is counted out onto the next flap, and on the hour it unfolds flat and flips over to show the new time on the back.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  frame(g, { date, fields: f, oled, night }) {
    build();
    oled.contrast(Math.round(207 + (24 - 207) * night));
    const [ox, oy] = orbit(date, 3, 4);
    const T = date.getTime() / 1000, sec = f.sec;
    const K = f.minuteKey, s = ((K % 4) + 4) % 4;
    const nxt = clockFields(new Date(date.getTime() + 60000));
    const hourTurn = (sec >= 60 + HR.shut && nxt.m === 0) || (f.m === 0 && sec < HR.end);
    const start = hourTurn ? HR.shut : C_START, end = hourTurn ? HR.end : C_END;
    const late = sec >= 60 + start, tau = late ? sec - 60 : sec;
    // the breath and the pinch on every second
    const ph = sec % 1;
    const tick = ph < 0.1 ? ease.outQuad(ph / 0.1) : 1 - ease.inOutQuad(clamp((ph - 0.1) / 0.45, 0, 1));
    const aRest = REST + 0.03 * Math.sin(T * 1.3) - 0.1 * tick;
    let a1, a2, yaw, flat = 0, tilt = 0, flip = 0, flip2 = 0, bring = 0, toss = 0;
    const md = minuteInk(s, f.m);
    BACK = null; ALLINK = false;
    const hNow = digits2(f.h);
    for (let j = 0; j < 4; j++) FLAPS[j] = { d: hNow, inv: false };
    if (hourTurn && (late || tau < end)) {
      const s0 = late ? s : (s + 3) % 4, s1 = (s0 + 1) % 4;
      ({ a1, a2, yaw, flat, tilt, flip, flip2, bring, toss } = hourPose(s0, tau, aRest));
      const from = late ? f : previousMinute(date), to = late ? nxt : f;
      INKYAW = yaw;
      ALLINK = tau < HR.fold + 0.3;
      if (tau < HR.flip2 + 0.4) {          // the old side up: old hour on top, old minutes at the bottom
        FLAPS.fill(null);
        FLAPS[STATION[s0].far] = { d: digits2(from.h), inv: false };
        FLAPS[STATION[s0].front] = { d: digits2(from.m), inv: true };
      } else {                              // after the second flip: the next station's flaps
        FLAPS.fill(null);
        FLAPS[STATION[s1].far] = { d: digits2(to.h), inv: false };
        if (tau < HR.fold + 0.3) FLAPS[STATION[s1].front] = { d: digits2(to.m), inv: true };
        for (let j = 0; j < 4; j++) if (!FLAPS[j] && tau >= HR.fold + 0.3) FLAPS[j] = { d: digits2(to.h), inv: false };
      }
      BACK = { h: digits2(to.h), m: digits2(to.m) };
    } else if (late || tau < end) {
      ({ a1, a2, yaw } = countPose(late ? s : (s + 3) % 4, tau));
    } else {
      const st = STATION[s];
      a1 = st.mode === 1 ? aRest : 0; a2 = st.mode === 2 ? aRest : 0; yaw = st.yaw;
    }
    const wob = 1 - bring;
    setRot(yaw + 0.05 * Math.sin(T * 0.71) * wob, tilt + 0.04 * Math.sin(T * 0.93), flip + 0.05 * Math.sin(T * 0.57 + 1) * wob, flip2);
    FOC = 240 - 70 * bring + 25 * toss; CX = 64 + ox; CY = 27 + 5 * bring + oy * 0.7; TZ = 0.55 * (1 - bring);
    FLAT = flat;
    const PP = pose(a1, a2, flat);
    const tipZ = (PP.C[0][2] + PP.C[1][2] + PP.C[2][2] + PP.C[3][2]) / 4;
    LIFT = (REST_TIPZ - tipZ) * (1 - bring) * 0.9;
    drawPaper(g, PP, null, md);
  },
};
