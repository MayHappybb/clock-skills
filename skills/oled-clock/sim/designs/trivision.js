// Trivision — a roadside prism billboard, in real 3D, seen from the road.
//
// The board is fifteen vertical triangular prisms in a steel frame on a pole,
// looked up at from below and a little to the side. Nothing is a sprite but
// the pigeon: every frame the prisms are turned in 3D, their faces projected
// in perspective, back faces dropped by their winding on screen, and each
// face filled by inverse perspective mapping into the poster it carries.
// Seen from below, every prism shows its triangular bottom cap, so the row of
// little triangles under the poster turns with the slats.
//
// The poster: the hour in sign-painter's numerals drawn for the slats (each
// digit three slats wide, its stems sitting on the outer slats), chiselled
// like a prism themselves: a ridge down every stroke, the facet towards the
// lamp lit and the far one in half-shadow, so as the lamp swings the light
// rolls over the strokes. The minutes are on a scalloped price sticker.
// Each face is shaded by how it faces the lamps, and the paper catches the
// lamp's reflection (Blinn, per face, from its own place), so a glint slides
// from slat to slat as the board sways on its pole.
//
// Always: the board sways and bobs on its sprung pole, the slats breathe in a
// wave along the row, a shiver runs along them every ten seconds, and the
// pigeon on the header beam is the seconds: one hop a second, end to end in a
// minute, back the other way the next. Two power lines sag behind.
//
// The minute: a wave runs along the slats, each winding back, pushed out of
// the board and springing a third of a turn on with overshoot, bringing the
// next poster round; the board kicks on its pole. The sticker's slats turn
// together at :00, never one digit before the other. The wave tosses the
// pigeon, which turns round in the air.
//
// The hour: the pigeon leaves for the wire; the board winds back and spins
// right round on its pole, its X-braced back passing at :00 (the slats turn
// while hidden), then every slat spins a full turn in a wave; the pigeon
// comes home.
//
// Burn-in: the sway, kit.orbit, a dither offset that moves every five
// minutes; the wires walk their own orbit. 23:00-07:00 the panel dims.

import { dither, clamp, ease, progress, clockFields, orbit, sprite } from '../js/kit.js';

const TAU = Math.PI * 2, THIRD = TAU / 3;
const W = 128, H = 64;

// ------------------------------------------------------------ the billboard
// Board frame: px, x right, y down, z away from the viewer, origin at the
// middle of the poster. N vertical triangular prisms on a pitch of P px.
// The poster is laid out in units of a 7 px pitch (42 tall) and printed at GS.
const N = 15, GS = 0.86, P = 7 * GS, BW = N * P, BH = 42 * GS;
const FW = P * 0.965, RC = FW / Math.sqrt(3);      // face width, circumradius
const YAW0 = -0.07;                                  // the board stands a little turned from the road
const PZ = 7;                                       // the pole's axis, behind the poster
const prismX = (i) => -BW / 2 + P * (i + 0.5);

// ------------------------------------------------------------ the camera
// The eye stands on the road below the board, D px in front of it, and looks
// straight ahead (an off-axis view), so the board shows undistorted but its
// underside, the prisms' bottom caps and the lamps are seen from below.
const D = 115, EYE_Y = 88, VX = 64, VY = 31 + EYE_Y;
let PX = 0, PY = 0;
function project(x, y, z) { const w = z + D; PX = VX + (D * x) / w; PY = VY + (D * (y - EYE_Y)) / w; }
// Towards the lamps: below and in front, a little to the left.
const LIGHT = (() => { const v = [-0.25, 0.5, -0.83]; const l = Math.hypot(...v); return v.map((c) => c / l); })();

// ------------------------------------------------------------ letterforms
// Sign-painter's poster numerals, drawn for the slats. A hour digit is three
// slats wide and its stems sit exactly on the outer slats, so the seams run
// between strokes and only cut the bars: every digit is three strips that a
// turn takes apart and puts back. Fat round bowls, a 6 px stroke, a black
// keyline. Centre-lines in a 21 x 36 box, stroked round.
const GL = 3.5, GR = 17.5, GC = 10.5, GT = 3.5, GB = 32.5, GM = 18, SW = 3;

/** A polyline with rounded corners: points [x, y, r], r the corner radius. */
function fillet(pts, closed) {
  const n = pts.length, out = [];
  for (let i = 0; i < n; i++) {
    const [x, y, r = 0] = pts[i];
    if ((!closed && (i === 0 || i === n - 1)) || !r) { out.push([x, y]); continue; }
    const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
    const l1 = Math.hypot(a[0] - x, a[1] - y), l2 = Math.hypot(b[0] - x, b[1] - y);
    const t = Math.min(r, l1 / 2, l2 / 2);
    const p0 = [x + ((a[0] - x) * t) / l1, y + ((a[1] - y) * t) / l1], p1 = [x + ((b[0] - x) * t) / l2, y + ((b[1] - y) * t) / l2];
    // A circular-ish corner: a quadratic through the corner, sampled.
    for (let k = 0; k <= 10; k++) {
      const u = k / 10, v = 1 - u;
      out.push([v * v * p0[0] + 2 * v * u * x + u * u * p1[0], v * v * p0[1] + 2 * v * u * y + u * u * p1[1]]);
    }
  }
  if (closed) out.push(out[0]);
  return out;
}
const op = (...p) => ({ p, closed: false }), cl = (...p) => ({ p, closed: true });
const SKETCH = {
  0: [cl([GL, GT, 7], [GR, GT, 7], [GR, GB, 7], [GL, GB, 7])],
  1: [op([4, 10], [GC, GT, 0.5], [GC, GB]), op([4.5, GB], [16.5, GB])],
  2: [op([GL, 10.5], [GL, GT, 7], [GR, GT, 7], [GR, 12, 7], [GL, 25, 4], [GL, GB, 0.5], [GR + 0.5, GB])],
  3: [op([GL + 0.5, GT], [GR, GT, 6], [GR, GM, 5], [8, GM]), op([8, GM], [GR, GM, 6], [GR, GB, 7], [GL, GB])],
  4: [op([GL, GT], [GL, 23, 2.5], [GR + 2.5, 23]), op([GR, 9], [GR, GB])],
  5: [op([GR + 0.5, GT], [GL, GT, 1], [GL, 15.5, 1], [GR, 15.5, 7], [GR, GB, 7], [GL, GB])],
  6: [op([GR - 1, GT], [GL, GT, 7], [GL, GB, 7], [GR, GB, 7], [GR, 16.5, 7], [GL, 16.5])],
  7: [op([GL - 0.5, GT], [GR, GT, 2], [GC, 21, 6], [GC, GB])],
  8: [cl([4.3, GT, 6], [16.7, GT, 6], [16.7, GM - 0.5, 6], [4.3, GM - 0.5, 6]), cl([GL, GM - 0.5, 7], [GR, GM - 0.5, 7], [GR, GB, 7], [GL, GB, 7])],
};
SKETCH[9] = SKETCH[6].map((s) => ({ ...s, p: s.p.map(([x, y, r]) => [21 - x, 36 - y, r]) }));

// Distance to the centre-line, tabulated at 2 samples per unit over the box
// and a margin (for the keyline).
const TX0 = -5, TY0 = -5, TW = 62, TH = 92, TS = 2;
function buildTable(d) {
  const segs = [];
  for (const st of SKETCH[d]) {
    const p = fillet(st.p, st.closed);
    for (let i = 1; i < p.length; i++) segs.push([p[i - 1][0], p[i - 1][1], p[i][0], p[i][1]]);
  }
  // The distance, and which way the stroke's surface faces there: the stroke
  // is a prism too, a ridge along its centre-line with a facet either side,
  // so (FX, FY) is the unit direction from the ridge out to the point.
  const T = new Float32Array(TW * TH), FX = new Float32Array(TW * TH), FY = new Float32Array(TW * TH);
  for (let j = 0; j < TH; j++)
    for (let i = 0; i < TW; i++) {
      const x = TX0 + (i + 0.5) / TS, y = TY0 + (j + 0.5) / TS;
      let best = 1e9, bx_ = 0, by_ = 0;
      for (const [ax, ay, bx, by] of segs) {
        const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
        const u = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0;
        const ex = x - ax - u * dx, ey = y - ay - u * dy, e = ex * ex + ey * ey;
        if (e < best - 1e-9) { best = e; bx_ = ex; by_ = ey; }
      }
      const l = Math.hypot(bx_, by_) || 1, k = j * TW + i;
      T[k] = Math.sqrt(best); FX[k] = bx_ / l; FY[k] = by_ / l;
    }
  return { T, FX, FY };
}
const DIST = Array.from({ length: 10 }, (_, d) => buildTable(d));
/** Distance from glyph-box point (x, y) to digit d's centre-line. */
function gdist(d, x, y) {
  const i = ((x - TX0) * TS) | 0, j = ((y - TY0) * TS) | 0;
  if (x < TX0 || y < TY0 || i >= TW || j >= TH) return 99;
  return DIST[d].T[j * TW + i];
}
// The lamp's direction across the poster, set each frame: the facets that
// face it are bright, so the light rolls over the strokes as the lamp swings.
let FLX = -0.6, FLY = 0.8;
/** How lit digit d's facet at glyph-box point (x, y) is: -1..1. */
function gfacet(d, x, y) {
  const k = (((y - TY0) * TS) | 0) * TW + (((x - TX0) * TS) | 0);
  return DIST[d].FX[k] * FLX + DIST[d].FY[k] * FLY;
}

// ------------------------------------------------------------ the poster
// One poster per minute, printed across all the slats: the hour as the
// headline, the minutes on a scalloped sticker (turned a little differently
// on every poster). Values: INK (lit), HALF (a stroke's shadowed facet),
// KEY (the black keyline), PAPER.
const INK = 3, HALF = 2, PAPER = 0, KEY = -1;
const HX = [-45.5, -17.5], HY = -18;                // hour digit boxes, top-left
const BX = 28, BY = 0.5, SPIKES = 13;           // the sticker: centre, scallops
const MS = 0.62, MX = [BX - 13.9, BX + 0.9], MY = BY - 11.1;   // minute digits: scale, boxes

function posterOf(key) {
  const f = clockFields(new Date(key * 60000));
  return { h: [Math.floor(f.h / 10), f.h % 10], m: [Math.floor(f.m / 10), f.m % 10], spin: (key % 5) * 0.09 };
}

/** What poster q has printed at board point (x, y). */
function posterAt(q, x, y) {
  // The hour.
  if (x < 3.5 && y > HY - 4 && y < HY + 40) {
    const k = x < -21 ? 0 : 1, d = q.h[k];
    const lx = x - HX[k], ly = y - HY;
    const a = gdist(d, lx, ly);
    // A chiselled stroke: the facet towards the lamp lit, the far side of the
    // ridge in half-shadow.
    if (a < SW) return a < 0.7 || gfacet(d, lx, ly) > -0.25 ? INK : HALF;
    // The drop: the stroke again, 2.5 px down and right, kept off it by a
    // black keyline, so only a solid crescent shows on the shadow side.
    if (a < SW + 1.5) return KEY;
  }
  // The sticker and the minutes.
  const dx = x - BX, dy = y - BY, rr = dx * dx + dy * dy;
  if (rr < 26 * 26) {
    const r = Math.sqrt(rr), an = Math.atan2(dy, dx) + q.spin;
    const edge = 19.3 + 0.8 * Math.cos(an * SPIKES);
    if (r < edge) {
      // A scalloped sticker: a 2 px rim, the minutes inside it.
      if (r > edge - 2.2) return INK;
      for (let k = 0; k < 2; k++) {
        const lx = (x - MX[k]) / MS, ly = (y - MY) / MS;
        if (lx > -3 && lx < 24 && gdist(q.m[k], lx, ly) < SW + 0.5) return INK;
      }
      return KEY;
    }
    if (r < edge + 2) return KEY;
  }
  return PAPER;
}

// ------------------------------------------------------------ 3D
const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const rotX = (a) => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c]; };
const rotY = (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; };
const rotZ = (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1]; };
function mul(A, B) {
  const o = new Array(9);
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++) o[r * 3 + c] = A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c];
  return o;
}

// The board's pose this frame: rotation RB about the pole's axis (x = 0,
// z = PZ), then translation TB.
let RB = I3, TB = [0, 0, 0];
let WX = 0, WY = 0, WZ = 0;
/** Board point -> world (WX, WY, WZ) and screen (PX, PY). */
function place(x, y, z) {
  const R = RB, lz = z - PZ;
  WX = R[0] * x + R[1] * y + R[2] * lz + TB[0];
  WY = R[3] * x + R[4] * y + R[5] * lz + TB[1];
  WZ = R[6] * x + R[7] * y + R[8] * lz + PZ + TB[2];
  project(WX, WY, WZ);
}
/** A board-frame direction turned into the world, dotted with the light. */
const lit = (nx, ny, nz) => Math.max(0, (RB[0] * nx + RB[1] * ny + RB[2] * nz) * LIGHT[0]
  + (RB[3] * nx + RB[4] * ny + RB[5] * nz) * LIGHT[1] + (RB[6] * nx + RB[7] * ny + RB[8] * nz) * LIGHT[2]);

const Q = new Float64Array(8);
/** Signed screen area of Q: positive when its corners run clockwise on the glass (it faces us). */
function areaQ() {
  let a = 0;
  for (let k = 0; k < 4; k++) { const j = (k + 1) & 3; a += Q[2 * k] * Q[2 * j + 1] - Q[2 * j] * Q[2 * k + 1]; }
  return a / 2;
}
/**
 * Fill the screen quad Q (corners for uv (0,0) (1,0) (1,1) (0,1)) by inverse
 * perspective mapping: every pixel centre is taken back through the quad's
 * homography to (u, v), and `shade(u, v, x, y)` returns 1 (lit), 0 (dark)
 * or -1 (leave).
 */
function fillQuad(g, shade) {
  const [x0, y0, x1, y1, x2, y2, x3, y3] = Q;
  const sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3;
  const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2;
  const den = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(den) < 1e-9) return;
  const gg = (sx * dy2 - dx2 * sy) / den, hh = (dx1 * sy - sx * dy1) / den;
  const a = x1 - x0 + gg * x1, b = x3 - x0 + hh * x3, c = x0;
  const d = y1 - y0 + gg * y1, e = y3 - y0 + hh * y3, f = y0;
  const A = e - f * hh, B = c * hh - b, C = b * f - c * e;
  const Dd = f * gg - d, E = a - c * gg, F = c * d - a * f;
  const G = d * hh - e * gg, Hh = b * gg - a * hh, II = a * e - b * d;
  const xa = Math.max(0, Math.floor(Math.min(x0, x1, x2, x3))), xb = Math.min(W - 1, Math.ceil(Math.max(x0, x1, x2, x3)));
  const ya = Math.max(0, Math.floor(Math.min(y0, y1, y2, y3))), yb = Math.min(H - 1, Math.ceil(Math.max(y0, y1, y2, y3)));
  const buf = g.buf;
  for (let y = ya; y <= yb; y++) {
    const py = y + 0.5;
    for (let x = xa; x <= xb; x++) {
      const px = x + 0.5;
      const w = G * px + Hh * py + II;
      const u = (A * px + B * py + C) / w;
      if (u < 0 || u > 1) continue;
      const v = (Dd * px + E * py + F) / w;
      if (v < 0 || v > 1) continue;
      const r = shade(u, v, x, y);
      if (r >= 0) buf[y * W + x] = r;
    }
  }
}

/** A filled convex screen polygon (pts flat [x0, y0, x1, y1, ...]). */
function fillPoly(g, pts, shade) {
  const n = pts.length / 2;
  let xa = W, xb = 0, ya = H, yb = 0;
  for (let k = 0; k < n; k++) { xa = Math.min(xa, pts[2 * k]); xb = Math.max(xb, pts[2 * k]); ya = Math.min(ya, pts[2 * k + 1]); yb = Math.max(yb, pts[2 * k + 1]); }
  xa = Math.max(0, Math.floor(xa)); xb = Math.min(W - 1, Math.ceil(xb)); ya = Math.max(0, Math.floor(ya)); yb = Math.min(H - 1, Math.ceil(yb));
  for (let y = ya; y <= yb; y++)
    for (let x = xa; x <= xb; x++) {
      const px = x + 0.5, py = y + 0.5;
      let inside = false;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const xi = pts[2 * i], yi = pts[2 * i + 1], xj = pts[2 * j], yj = pts[2 * j + 1];
        if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
      }
      if (inside) { const r = shade(x, y); if (r >= 0) g.buf[y * W + x] = r; }
    }
}

// ------------------------------------------------------------ the prisms
// Prism i turns by theta[i] about its own vertical axis. Its face k faces the
// viewer when theta + k * THIRD = 0; face k carries poster FACE[k].
const THETA = new Float64Array(N), POP = new Float64Array(N);
let FACE = [null, null, null];
let LAMP = [0, 80, -80];               // the light the glint is of, in the world

function drawPrism(g, i, dk) {
  const xi = prismX(i), th = THETA[i], top = -BH / 2, bot = BH / 2, pz = POP[i];
  for (let k = 0; k < 3; k++) {
    const phi = th + k * THIRD;
    const a0 = phi - Math.PI / 3, a1 = phi + Math.PI / 3;
    const ax = xi + RC * Math.sin(a0), az = pz - RC * Math.cos(a0), bx = xi + RC * Math.sin(a1), bz = pz - RC * Math.cos(a1);
    place(ax, top, az); Q[0] = PX; Q[1] = PY;
    place(bx, top, bz); Q[2] = PX; Q[3] = PY;
    place(bx, bot, bz); Q[4] = PX; Q[5] = PY;
    place(ax, bot, az); Q[6] = PX; Q[7] = PY;
    if (areaQ() <= 0.3) continue;
    const lam = lit(Math.sin(phi), 0, -Math.cos(phi));
    // A face turned from the lamps falls into shadow: its print dims to a dither.
    const inkL = clamp((lam - 0.12) / 0.5, 0, 1);
    // The paper: dim, in shadow when turned from the lamps, and bright where
    // the face catches the lamp's reflection (Blinn: per face, from its own
    // place, so the glint slides from slat to slat as the board sways).
    place(xi + (Math.sin(a0) + Math.sin(a1)) * RC / 2, 0, pz - (Math.cos(a0) + Math.cos(a1)) * RC / 2);
    const nx = RB[0] * Math.sin(phi) - RB[2] * Math.cos(phi), ny = RB[3] * Math.sin(phi) - RB[5] * Math.cos(phi), nz = RB[6] * Math.sin(phi) - RB[8] * Math.cos(phi);
    let lx = LAMP[0] - WX, ly = LAMP[1] - WY, lz = LAMP[2] - WZ; const ll = Math.hypot(lx, ly, lz);
    let vx = -WX, vy = EYE_Y - WY, vz = -D - WZ; const vl = Math.hypot(vx, vy, vz);
    lx = lx / ll + vx / vl; ly = ly / ll + vy / vl; lz = lz / ll + vz / vl;
    // Only the horizontal part of the half-vector: a vertical face lights as a whole strip.
    const spec = Math.max(0, (nx * lx + nz * lz) / Math.hypot(lx, lz)) ** 150; if (globalThis.__SPEC) globalThis.__SPEC.push(spec);
    // Posterised: black, or one of three greys, never a sparse scatter.
    const paperL = spec > 0.7 ? 0.75 : spec > 0.4 ? 0.5 : spec > 0.18 ? 0.25 : 0;
    const q = FACE[k];
    const lenU = Math.hypot(Q[2] - Q[0], Q[3] - Q[1]);
    const seam = lenU > 3.2 ? 1 - 1 / lenU : 2;
    fillQuad(g, (u, v, x, y) => {
      const bxp = xi + (u - 0.5) * P, byp = top + v * BH;
      const val = posterAt(q, bxp / GS, byp / GS);
      // The gap between slats; the print bridges it, so the digits stay whole at rest.
      if (u > seam && val !== INK) return 0;
      if (val === INK) return inkL >= 1 || dither(x + dk, y, inkL) ? 1 : 0;
      if (val === HALF) return dither(x + dk, y, 0.5 * inkL) ? 1 : 0;
      if (val === KEY) return 0;
      // The paper: lit by the lamps, so each slat shows how it faces them.
      return dither(x + dk, y, paperL) ? 1 : 0;
    });
  }
  // The bottom cap, seen from below: a little triangle that turns with the prism.
  const pts = [];
  for (let k = 0; k < 3; k++) {
    const a = th + k * THIRD - Math.PI / 3;
    place(xi + RC * Math.sin(a), bot, pz - RC * Math.cos(a)); pts.push(PX, PY);
  }
  const ar = (pts[2] - pts[0]) * (pts[5] - pts[1]) - (pts[4] - pts[0]) * (pts[3] - pts[1]);
  if (ar > 0) fillPoly(g, pts, () => 1);
}

// ------------------------------------------------------------ the frame
// Boxes in the board frame: [x0, x1, y0, y1, z0, z1].
const FZ0 = -RC - 0.6, FZ1 = RC + 3;
const RAILS = [
  // Only their parts in front of the prisms: seen from below, a beam's
  // underside behind the prisms' fronts would be hidden by them.
  [-BW / 2 - 2, BW / 2 + 2, -BH / 2 - 3.2, -BH / 2, FZ0, -RC / 2],          // the header beam
  [-BW / 2 - 2.2, -BW / 2 - 0.2, -BH / 2, BH / 2 + 0.6, FZ0, FZ1],              // the side posts
  [BW / 2 + 0.2, BW / 2 + 2.2, -BH / 2, BH / 2 + 0.6, FZ0, FZ1],
];
const BOXF = [
  { n: [0, 0, -1], c: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]] },
  { n: [0, 0, 1], c: [[1, 0, 1], [0, 0, 1], [0, 1, 1], [1, 1, 1]] },
  { n: [-1, 0, 0], c: [[0, 0, 1], [0, 0, 0], [0, 1, 0], [0, 1, 1]] },
  { n: [1, 0, 0], c: [[1, 0, 0], [1, 0, 1], [1, 1, 1], [1, 1, 0]] },
  { n: [0, -1, 0], c: [[0, 0, 1], [1, 0, 1], [1, 0, 0], [0, 0, 0]] },
  { n: [0, 1, 0], c: [[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]] },
];
/** A box with lit edges, its faces filled (if `lo` >= 0) by how they face the lamps. */
function drawBox(g, b, dk, lo = -1) {
  for (const F of BOXF) {
    for (let k = 0; k < 4; k++) { const c = F.c[k]; place(b[c[0]], b[2 + c[1]], b[4 + c[2]]); Q[2 * k] = PX; Q[2 * k + 1] = PY; }
    if (areaQ() <= 0.2) continue;
    const lam = lit(...F.n);
    const lv = lo < 0 ? 0 : lo + (1 - lo) * lam;
    const lu = Math.hypot(Q[2] - Q[0], Q[3] - Q[1]), lv2 = Math.hypot(Q[6] - Q[0], Q[7] - Q[1]);
    fillQuad(g, (u, v, x, y) => (Math.min(u, 1 - u) * lu < 1 || Math.min(v, 1 - v) * lv2 < 1 || dither(x + dk, y, lv) ? 1 : 0));
  }
}

/** The back of the board: a steel panel with X-bracing, seen when it turns round. */
function drawBack(g) {
  const z = FZ1;
  place(BW / 2, -BH / 2, z); Q[0] = PX; Q[1] = PY;
  place(-BW / 2, -BH / 2, z); Q[2] = PX; Q[3] = PY;
  place(-BW / 2, BH / 2 + 2.6, z); Q[4] = PX; Q[5] = PY;
  place(BW / 2, BH / 2 + 2.6, z); Q[6] = PX; Q[7] = PY;
  if (areaQ() <= 0.3) return false;
  const lu = Math.hypot(Q[2] - Q[0], Q[3] - Q[1]), lv = Math.hypot(Q[6] - Q[0], Q[7] - Q[1]);
  fillQuad(g, (u, v) => {
    const bay = (u * 4) % 1, wu = 1.2 / lu * 4, wv = 1.2 / lv;
    if (Math.abs(bay - v) < wu * 0.8 || Math.abs(1 - bay - v) < wu * 0.8) return 1;
    if (bay < wu || Math.abs(v - 0.5) < wv * 0.6) return 1;
    return 0;
  });
  return true;
}

/** The pole, a cylinder from the board down off the glass, lit on its lamp side. */
function drawPole(g, dk) {
  place(0, BH / 2 + 1, PZ);
  const tx = PX, ty = PY, tw = (5.5 * D) / (WZ + D);
  project(TB[0] * 0.15, 150, PZ);
  const bx = PX, by = PY, bw = (5.5 * D) / (PZ + D);
  const pts = [tx - tw, ty, tx + tw, ty, bx + bw, by, bx - bw, by];
  fillPoly(g, pts, (x, y) => {
    const u = (y + 0.5 - ty) / (by - ty), cx = tx + (bx - tx) * u, hw = tw + (bw - tw) * u;
    const s = (x + 0.5 - cx) / hw;
    if (s < -0.75) return 1;
    if (s < -0.15) return dither(x + dk, y, 0.5) ? 1 : 0;
    if (s > 0.8) return 1;
    return 0;
  });
}

// The lamps: two on goosenecks off the bottom rail, aimed up at the poster.
const LAMPS = [-BW / 2 - 1, BW / 2 + 1];
function drawLamp(g, x, swivel) {
  place(x, BH / 2 + 0.6, FZ0); const ax = PX, ay = PY;
  place(x * 0.9, BH / 2 + 5.5, -13); const hx = PX, hy = PY;
  g.line(Math.round(ax), Math.round(ay), Math.round(hx), Math.round(hy));
  // The head points at its aim; drawn as a little cone, mouth up.
  const dx = swivel * 1.6 * Math.sign(-x);
  const s = D / (WZ + D);
  const r = 2.6 * s;
  g.fillPolygon([[hx - 1.2 * s, hy + 1.6 * s], [hx + 1.2 * s, hy + 1.6 * s], [hx + dx + r, hy - 2.2 * s], [hx + dx - r, hy - 2.2 * s]]);
  g.fillEllipse(hx + dx, hy - 2.4 * s, r + 0.3, 1.1);
}


// ------------------------------------------------------------ the pigeon
// A pigeon lives on the header beam and is the seconds: one hop a second,
// end to end in a minute, back the other way the next. The wave of turning
// slats tosses it as the minute changes (it turns round in the air); on the
// hour the board spins out from under it and it flaps about until it can land.
const BIRD = {
  stand: sprite(`
......##.
.....#.##
......##.
..######.
########.
.######..
...#.#...`),
  hop: sprite(`
......##.
.....#.##
......##.
..######.
########.
.######..
..##.##..`),
  peck: sprite(`
.........
.........
..#####..
#######..
.######.#
..####.##
...#.#.#.`),
  up: sprite(`
...#.....
...##....
....##.##
..####.##
#######..
..####...
.........`),
  down: sprite(`
.........
.......##
..####.##
#######..
..####...
...##....
...#.....`),
};
const PERCH_Y = -BH / 2 - 3.2, PERCH_Z = (FZ0 - RC / 2) / 2, PERCH_L = BW / 2 - 8;

// ------------------------------------------------------------ the wires
// Two power lines sag across the road behind the board, swaying a little; a
// pigeon sitting on one pulls it into a V.
const WIRE = { on: -1, x: 0, load: 0, wind: 0, dy: 0 };
const WIRES = [[43, 47, 15, 0], [49, 53, 12, 1.7]];   // y at the left, y at the right, sag, phase
function wireY(k, x) {
  const [yl, yr, sag, ph] = WIRES[k], u = (x + 4) / 136;
  let y = WIRE.dy + yl + (yr - yl) * u + (sag + 0.7 * Math.sin((TAU * WIRE.wind) / 3.7 + ph)) * 4 * u * (1 - u);
  if (WIRE.on === k) y += WIRE.load * (x < WIRE.x ? (x + 4) / (WIRE.x + 4) : (132 - x) / (132 - WIRE.x));
  return y;
}
function drawWires(g) {
  for (let k = 0; k < WIRES.length; k++) {
    let py = wireY(k, -4);
    let px = -4;
    for (let x = -3; x <= 132; x++) { const y = wireY(k, x); g.line(px, Math.round(py), x, Math.round(y)); px = x; py = y; }
  }
}

// ------------------------------------------------------------ choreography
const smooth = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
/** Step response of a damped spring, 0 -> 1, starting at rest. */
function spring(s, zeta, w) {
  if (s <= 0) return 0;
  const wd = w * Math.sqrt(1 - zeta * zeta);
  return 1 - Math.exp(-zeta * w * s) * (Math.cos(wd * s) + ((zeta * w) / wd) * Math.sin(wd * s));
}
const firstAt = (fn, target) => { let t = 0; while (fn(t) < target) t += 0.0005; return t; };

// The minute: a wave of turns runs left to right, each prism winding back,
// then springing a third of a turn on with overshoot. Slow through the hour
// (whose print does not change), then the sticker's slats almost together,
// crossing at :00: a wave through the minutes would show, for a moment, a
// time that is neither (10:09 -> 10:19 -> 10:10).
const SZ = 0.36, SW_ = 7.5;
const CROSS = firstAt((t) => spring(t, SZ, SW_), 0.5);
const STAG = (i) => (i < 8 ? i * 0.09 : 8 * 0.09 + 0.05);
const T0 = -CROSS - STAG(11);
const startOf = (i) => T0 + STAG(i);

// The hour: the board winds back on its pole and spins right round, its back
// passing the viewer at :00 (the prisms turn while it is hidden), then every
// prism spins a full turn in a wave, and the whole thing settles.
const HZ = 0.6, HW = 4.2;
const H_HALF = firstAt((t) => spring(t, HZ, HW), 0.5);
const H0 = -H_HALF, H_WIND = H0 - 1.1, H_CELEB = 0.75, H_END = 3.4;
// The pigeon's hour: off the beam, onto the wire, back.
const H_OFF = H_WIND + 0.1, H_ON = H_WIND + 0.85, H_UP = 1.7, H_HOME = 2.5;

export default {
  name: 'Trivision',
  blurb: 'A roadside prism billboard in real 3D: on the minute its slats turn in a wave to the next poster; on the hour the board spins round on its pole.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  driver: 'full',

  frame(g, { date, fields: f, oled, night }) {
    const T = date.getTime() / 1000, sec = f.sec;
    const late = sec >= 50;
    const keyF = late ? f.minuteKey : f.minuteKey - 1;       // the poster before the turn
    const tau = late ? sec - 60 : sec;
    const toF = clockFields(new Date((keyF + 1) * 60000));
    const hour = toF.m === 0 && tau > H_WIND && tau < H_END;
    const pF = posterOf(keyF), pT = posterOf(keyF + 1);
    const [ox, oy] = orbit(date, 2, 3);
    const dk = (Math.floor(f.minuteKey / 5) * 3) & 7;

    // ---- the board's sway: a sprung pole in the wind
    let yaw = YAW0 + 0.11 * Math.sin((TAU * T) / 6.3) + 0.035 * Math.sin((TAU * T) / 2.7 + 1);
    const pitch = 0.035 * Math.sin((TAU * T) / 5.1 + 0.5);
    let roll = 0.018 * Math.sin((TAU * T) / 4.4 + 2);
    let bob = 0.7 * Math.sin((TAU * T) / 3.6);
    const swayX = 0.8 * Math.sin((TAU * T) / 6.3 + 1.2);

    // ---- the prisms
    let flash = 0;
    for (let i = 0; i < N; i++) {
      let th = 0.09 * Math.sin((TAU * T) / 2.9 - i * 0.42);           // breathing, a wave along the row
      // A shiver runs along the row every ten seconds.
      for (const s0 of [10, 20, 30, 40]) {
        const u = sec - s0 - i * 0.045;
        if (u > 0 && u < 1.5) th += 0.38 * Math.exp(-u * 4.5) * Math.sin(u * 15);
      }
      let step = 0, pop = 0;
      if (hour) {
        step = smooth(progress(tau, -0.07, 0.07));
        const u = tau - (H_CELEB + i * 0.05);
        th -= TAU * spring(u, 0.5, 11);
      } else {
        const st = startOf(i), s = spring(tau - st, SZ, SW_);
        step = s;
        th += 0.3 * ease.inOutCubic(progress(tau, st - 0.5, st)) * clamp(1 - s, 0, 1);
        // Each slat is pushed out of the board as it turns, and drops back.
        pop = -11 * Math.sin(Math.PI * progress(tau, st - 0.25, st + 0.85)) ** 2;
      }
      THETA[i] = th - (keyF + step) * THIRD;
      POP[i] = pop;
    }
    // Which poster is on which face: the one turning away, the one coming.
    FACE = [0, 1, 2].map((k) => ((((k - keyF) % 3) + 3) % 3 === 0 ? pF : pT));
    if (hour && tau > 0.05) FACE = [pT, pT, pT];

    if (hour) {
      const wind = -0.3 * ease.inOutCubic(progress(tau, H_WIND, H0));
      const sp = spring(tau - H0, HZ, HW);
      yaw += wind * clamp(1 - sp, 0, 1) + TAU * sp;
      bob -= 3 * Math.sin(Math.PI * progress(tau, H0, H0 + 2 * H_HALF));
      const tl = tau - H_CELEB;
      if (tl > 0) roll += 0.03 * Math.exp(-tl * 2) * Math.sin(tl * 9);
      flash = Math.exp(-Math.abs(tau) * 3);
    } else {
      // The turning prisms kick the board on its pole.
      const u = tau - T0;
      if (u > 0) { yaw += 0.05 * Math.exp(-u * 2.2) * Math.sin(u * 6.5); bob += 0.8 * Math.exp(-u * 3) * Math.sin(u * 11); }
    }

    RB = mul(rotY(yaw), mul(rotX(pitch), rotZ(roll)));
    TB = [swayX + ox, bob + oy, 0];


    LAMP = [-40 + 80 * Math.sin((TAU * T) / 9.1), 60, -70];
    { const lx = LAMP[0] / 50 - Math.sin(yaw) * 0.6, l = Math.hypot(lx, 0.7); FLX = lx / l; FLY = 0.7 / l; }

    // ---- draw, far to near
    // ---- the wires behind, and whether the pigeon is weighing one down
    {
      const dirF = keyF % 2 ? -1 : 1;
      WIRE.on = hour && tau > H_ON - 0.05 && tau < H_UP + 0.1 ? 0 : hour ? -2 : -1;
      if (hour) WIRE.x = 64 + dirF * 47;
      const tl = tau - H_ON;
      WIRE.load = WIRE.on === 0 ? 2 + (tl > 0 ? 2.5 * Math.exp(-tl * 4) * Math.cos(tl * 15) : 0) : 0;
      WIRE.wind = T;
      WIRE.dy = orbit(new Date(date.getTime() + 45000), 3, 2)[1];   // the wires' ends walk too (burn-in)
      drawWires(g);
    }
    drawPole(g, dk);
    // The poster side is towards us if the eye is in front of the board's plane.
    place(0, 0, 0);
    const facing = -RB[2] * (0 - WX) - RB[5] * (EYE_Y - WY) - RB[8] * (-D - WZ) > 0;
    const order = Array.from({ length: N }, (_, i) => i);
    const zs = order.map((i) => { place(prismX(i), 0, 0); return WZ; });
    order.sort((a, b) => zs[b] - zs[a]);
    if (facing) for (const b of RAILS) drawBox(g, b, dk, b === RAILS[0] ? 0 : 0.35);
    for (const i of order) drawPrism(g, i, dk);
    if (!facing) { drawBack(g); for (const b of RAILS) drawBox(g, b, dk, b === RAILS[0] ? 0 : 0.35); }
    for (let j = 0; j < LAMPS.length; j++) drawLamp(g, LAMPS[j], Math.cos((TAU * T) / 9.1 + j * 1.3));

    // ---- the pigeon
    {
      const dir = f.minuteKey % 2 ? -1 : 1, si = Math.floor(sec), u = sec - si;
      const hopU = clamp(u / 0.32, 0, 1);
      const bxp = dir * (-PERCH_L + ((2 * PERCH_L) / 60) * (si + ease.inOutQuad(hopU)));
      let lift = 1.6 * Math.sin(Math.PI * hopU);
      let pose = hopU < 1 ? BIRD.hop : si % 5 === 2 && u > 0.45 && u < 0.85 ? BIRD.peck : BIRD.stand;
      let fl = dir < 0;
      // Tossed by the wave at the turn of the minute.
      const toss = progress(tau, -0.32, 0.42);
      if (!hour && toss > 0 && toss < 1) { lift = 7 * Math.sin(Math.PI * toss); pose = toss < 0.5 ? BIRD.up : BIRD.down; }
      place(bxp, PERCH_Y, PERCH_Z);
      let x = PX, y = PY - lift;
      if (hour) {
        // Off the beam before the spin, down to the wire, back once it settles.
        const [wx, wy] = [WIRE.x, wireY(0, WIRE.x)];
        const out = progress(tau, H_OFF, H_ON), back = progress(tau, H_UP, H_HOME);
        const flap = Math.floor(tau * 10) % 2 ? BIRD.up : BIRD.down;
        if (out < 1) { x += (wx - x) * smooth(out); y += (wy - y) * smooth(out) - 9 * Math.sin(Math.PI * out); pose = flap; fl = wx < x; }
        else if (back <= 0) { x = wx; y = wy; pose = BIRD.stand; fl = WIRE.x > 64; }
        else { x = wx + (x - wx) * smooth(back); y = wy + (y - wy) * smooth(back) - 10 * Math.sin(Math.PI * back); pose = back < 1 ? flap : pose; fl = back < 1 ? x > wx : fl; }
      }
      // A black keyline round it keeps it off the beam.
      const bx0 = Math.round(x - 4.5), by0 = Math.round(y - 7);
      for (const [ddx, ddy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) g.blit(pose, bx0 + ddx, by0 + ddy, { flipX: fl, c: 0 });
      g.blit(pose, bx0, by0, { flipX: fl });
    }

    oled.contrast(Math.min(255, 0xcf + 0x30 * flash) + (0x20 - 0xcf) * night);
  },
};
