// Eight Ball — the time is the answer floating up in a Magic 8-Ball.
//
// We look through the ball's window into dark liquid. The die, a real
// icosahedron, is ray-cast every frame: each pixel's ray enters the convex
// solid through the front-facing plane it meets last, so faces, edges and
// silhouette come out of one test. Nothing is dithered but the shadowed
// facets of the numerals: faces are black planes drawn only by their edges
// and by a few solid contour lines of the liquid's depth.
//
// The pressed face carries the time the way an 8-Ball carries its answers:
// stacked in the triangle, a wide line (the hour) over a narrow line (the
// minutes). The numerals are cut on the die's own lattice: centre-lines on a
// 60-degree grid drawn with a hexagonal nib, so every edge of every numeral
// runs parallel to a side of the triangle (or upright). They are moulded in
// relief: each stroke is a two-faceted ridge, the facets facing the lamp are
// lit, and the walls show by parallax when the face tilts.
//
// Always: the die floats against the glass, rocking, bobbing and turning a
// few degrees; the thin film of liquid between face and glass shows as
// interference fringes (contour lines of the gap) that swing as it rocks;
// the faces that fall away carry a few lines of the same contours, 6 px
// apart, that drop out with depth; the lamp's reflection wanders, so the
// light runs over the numerals' facets; a handful of bubbles rise up the
// sides of the window.
// The minute: the ball is shaken. The die is knocked back into the murk,
// rolls over an edge onto a neighbouring face (which already carries the
// new time) with a twist that stands that triangle apex-down, and floats
// back up to press against the glass, the fringes sweeping as the gap closes. Which
// edge it rolls over, and which way it twists, changes every minute.
// On the hour, a big shake: the die rolls at once, deep, and the new face
// is whirled one full turn in a three-armed vortex of bubbles as it rises.
//
// Burn-in: the die drifts and rocks, the dither travels with it, and the
// whole picture walks kit.orbit. 23:00-07:00 the panel dims (ctx.night).

import { dither, clamp, lerp, ease, progress, noise, previousMinute, orbit, segDist } from '../js/kit.js';

const TAU = Math.PI * 2;
const W = 128, H = 64;

// ------------------------------------------------------------ vectors and 3x3 matrices (row-major)

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; };
const apply = (M, v) => [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]];
const transpose = (M) => [M[0], M[3], M[6], M[1], M[4], M[7], M[2], M[5], M[8]];
const rotX = (a) => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c]; };
const rotY = (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; };
const rotZ = (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1]; };
function mul(A, B) {
  const o = new Array(9);
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++) o[r * 3 + c] = A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c];
  return o;
}
/** Rotation by `a` about the axis (x, y, z), right-handed. */
function axisAngle([x, y, z], a) {
  const l = Math.hypot(x, y, z); x /= l; y /= l; z /= l;
  const c = Math.cos(a), s = Math.sin(a), k = 1 - c;
  return [c + x * x * k, x * y * k - z * s, x * z * k + y * s,
    y * x * k + z * s, c + y * y * k, y * z * k - x * s,
    z * x * k - y * s, z * y * k + x * s, c + z * z * k];
}

// ------------------------------------------------------------ the die
// A regular icosahedron, edge 2 in its own units. Camera space: x right,
// y down, z into the ball; the window's glass is the plane z = 0 and the
// eye sits D px in front of it, so the glass is drawn 1:1.

const PHI = (1 + Math.sqrt(5)) / 2;
const RAW = [];
for (const a of [-1, 1]) for (const b of [-1, 1]) RAW.push([0, a, b * PHI], [a, b * PHI, 0], [b * PHI, 0, a]);
const FIDX = [];
{
  const d2 = (p, q) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
  const e = (i, j) => Math.abs(d2(RAW[i], RAW[j]) - 4) < 1e-6;
  for (let i = 0; i < 12; i++) for (let j = i + 1; j < 12; j++) for (let k = j + 1; k < 12; k++)
    if (e(i, j) && e(j, k) && e(i, k)) FIDX.push([i, j, k]);
}
const centroid = (f, V) => [0, 1, 2].map((a) => (V[f[0]][a] + V[f[1]][a] + V[f[2]][a]) / 3);

// Turn the solid so that face 0 looks at the viewer, apex down.
const R0 = (() => {
  const c = centroid(FIDX[0], RAW), n = unit(c);
  const down = unit(sub(RAW[FIDX[0][0]], c));
  const right = cross(n, down);
  return [...right, ...down, -n[0], -n[1], -n[2]];
})();
const VERT = RAW.map((v) => apply(R0, v));
const FACES = FIDX.map((f) => { const c = centroid(f, VERT); return { v: f, c, n: unit(c) }; });
const FRONT = FACES.findIndex((F) => F.n[2] < -0.999);
const INR = Math.hypot(...FACES[FRONT].c);          // inradius, edge-2 units (1.5115)

// The rolls: for each of the front face's three neighbours, the rotation
// that tips it onto the glass (about an axis parallel to the shared edge),
// and the twists about the view axis that then stand it apex-down, which
// together are a symmetry of the solid. Two twists per neighbour qualify
// (+-60 degrees); the third (180) is kept for the hour.
const ROLLS = [];
{
  const A = FACES[FRONT];
  const angOf = (p) => Math.atan2(p[1], p[0]);
  const aAng = A.v.map((i) => angOf(VERT[i]));
  for (let ni = 0; ni < FACES.length; ni++) {
    const N = FACES[ni];
    if (ni === FRONT || N.v.filter((i) => A.v.includes(i)).length !== 2) continue;
    const axis = cross(N.n, A.n), angle = Math.acos(clamp(dot(N.n, A.n), -1, 1));
    const Rr = axisAngle(axis, angle);
    const v0 = apply(Rr, VERT[N.v[0]]);
    const twists = aAng.map((a) => { let p = a - angOf(v0); p = Math.atan2(Math.sin(p), Math.cos(p)); return p; })
      .sort((p, q) => Math.abs(p) - Math.abs(q));
    ROLLS.push({ face: ni, axis, angle, twists });
  }
}

// ------------------------------------------------------------ the face and its type
// Face coordinates: px on the face, origin at its centroid, x right, y down
// (as it is seen pressed to the glass). The triangle points down.

const EDGE = 86, FH = EDGE * Math.sqrt(3) / 2;       // edge and height, px
const SC = EDGE / 2;                                  // die units -> px
const APEX = (2 * FH) / 3;
const halfW = (y) => (EDGE / 2) * (APEX - y) / FH;     // half the face's width at y
const FACE_Y = 0.5 + FH / 3;                          // centroid's screen row at rest (top edge at 0.5)

// The numerals are cut on the die's own lattice. Centre-lines run on a
// triangular grid (i half-steps across, j rows down, a diagonal step is
// exactly 60 degrees, parallel to the face's edges), and they are drawn with
// a hexagonal nib, so every edge of every numeral, ends and joints included,
// is parallel to a side of the triangle or upright. `c` marks a closed loop.
const GLYPH = {
  0: [{ c: 1, p: [[1.5, 0], [3.5, 0], [5, 1.5], [5, 2.5], [3.5, 4], [1.5, 4], [0, 2.5], [0, 1.5]] }],
  1: [{ p: [[1, 1.5], [2.5, 0], [2.5, 4]] }],
  2: [{ p: [[0, 1], [1, 0], [4, 0], [5, 1], [2, 4]] }, { p: [[0.3, 4], [5, 4]] }],
  3: [{ p: [[0, 0], [5, 0], [3, 2], [4, 2], [5, 3], [4, 4], [1, 4], [0, 3]] }],
  4: [{ p: [[4, 4], [4, 0], [1, 3], [5.2, 3]] }],
  5: [{ p: [[5, 0], [0.8, 0], [0.8, 2], [4, 2], [5, 3], [4, 4], [0, 4]] }],
  6: [{ p: [[4.6, 0], [2, 0], [0, 2], [2, 4], [3, 4], [4, 4], [5, 3], [4, 2], [0.4, 2]] }],
  7: [{ p: [[0, 0], [5, 0], [1, 4]] }],
  8: [{ c: 1, p: [[1.5, 0], [3.5, 0], [4.5, 1], [3.5, 2], [1.5, 2], [0.5, 1]] },
    { c: 1, p: [[1, 2], [4, 2], [5, 3], [4, 4], [1, 4], [0, 3]] }],
};
GLYPH[9] = GLYPH[6].map((l) => ({ ...l, p: l.p.map(([i, j]) => [5 - i, 4 - j]) }));
const GW = 5, GH = 4;                                 // grid size of a numeral

// The four slots: the hour, larger, under the top edge; the minutes below.
// `a` is the nib's half-height (half the stroke), `y0..y1` the ink's extent.
const SLOTS = [];
for (const [y0, y1, a, gap, wide] of [[-22, 0, 2.05, 6, 1.5], [3, 19.5, 1.8, 4.5, 1.05]])
  for (const side of [-1, 1]) {
    const sy = (y1 - y0 - 2 * a) / GH, sx = (wide * sy) / Math.sqrt(3), R = a * 2 / Math.sqrt(3);
    SLOTS.push({ y: y0 + a, sx, sy, a, x: side < 0 ? -gap / 2 - R - GW * sx : gap / 2 + R });
  }
const ROW_SPLIT = 1.5;                                // face y between the two lines

/** Convex hull of points (monotone chain). */
function hull(pts) {
  pts = pts.slice().sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], hi = [];
  for (const p of pts) { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (const p of pts.reverse()) { while (hi.length > 1 && cr(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); }
  return lo.slice(0, -1).concat(hi.slice(0, -1));
}

/** Signed distance to a polygon (any winding), negative inside. */
function polyDist(P, x, y) {
  let d = 1e9, inside = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [xi, yi] = P[i], [xj, yj] = P[j];
    d = Math.min(d, segDist(x, y, xi, yi, xj, yj));
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside ? -d : d;
}

/** Digit `d` in slot `si` as convex polygons in face px: each stroke swept by the hexagonal nib. */
export function glyphPolys(si, d) {
  const s = SLOTS[si], R = s.a * 2 / Math.sqrt(3), polys = [];
  const nib = [[R, 0], [R / 2, s.a], [-R / 2, s.a], [-R, 0], [-R / 2, -s.a], [R / 2, -s.a]];
  for (const { p, c } of GLYPH[d]) {
    const line = (c ? [...p, p[0]] : p).map(([i, j]) => [s.x + i * s.sx, s.y + j * s.sy]);
    for (let k = 1; k < line.length; k++) {
      const pts = [];
      for (const [nx, ny] of nib) pts.push([line[k - 1][0] + nx, line[k - 1][1] + ny], [line[k][0] + nx, line[k][1] + ny]);
      polys.push(hull(pts));
    }
  }
  return polys;
}

// Each (slot, digit) is tabulated once as a distance field, 3 samples per
// px, so a numeral can be sampled anywhere on a turning face and stay crisp.
const RES = 3, TILES = new Map();
export function tile(si, d) {
  const key = si * 10 + d;
  let T = TILES.get(key);
  if (T) return T;
  const polys = glyphPolys(si, d);
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const P of polys) for (const [x, y] of P) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  x0 -= 3; y0 -= 3; x1 += 3; y1 += 3;
  const boxes = polys.map((P) => [Math.min(...P.map((q) => q[0])), Math.min(...P.map((q) => q[1])), Math.max(...P.map((q) => q[0])), Math.max(...P.map((q) => q[1]))]);
  const tw = Math.ceil((x1 - x0) * RES), th = Math.ceil((y1 - y0) * RES);
  const data = new Float32Array(tw * th);
  for (let j = 0; j < th; j++)
    for (let i = 0; i < tw; i++) {
      const px = x0 + (i + 0.5) / RES, py = y0 + (j + 0.5) / RES;
      let best = 4;
      for (let q = 0; q < polys.length; q++) {
        const b = boxes[q];
        if (px < b[0] - best || px > b[2] + best || py < b[1] - best || py > b[3] + best) continue;
        const e = polyDist(polys[q], px, py);
        if (e < best) best = e;
      }
      data[j * tw + i] = best;
    }
  T = { x0, y0, tw, th, data };
  TILES.set(key, T);
  return T;
}

/** Signed distance (px, < 0 inside) to the numeral in tile T. */
export function sampleTile(T, x, y) {
  const fx = (x - T.x0) * RES - 0.5, fy = (y - T.y0) * RES - 0.5;
  const i = Math.floor(fx), j = Math.floor(fy);
  if (i < 0 || j < 0 || i >= T.tw - 1 || j >= T.th - 1) return 9;
  const a = fx - i, b = fy - j, k = j * T.tw + i, D = T.data;
  return (D[k] * (1 - a) + D[k + 1] * a) * (1 - b) + (D[k + T.tw] * (1 - a) + D[k + T.tw + 1] * a) * b;
}

/** A face's text: the four tiles of hh:mm. */
const textOf = (f) => [tile(0, Math.floor(f.h / 10)), tile(1, f.h % 10), tile(2, Math.floor(f.m / 10)), tile(3, f.m % 10)];
const sdfText = (txt, x, y) => sampleTile(txt[(y < ROW_SPLIT ? 0 : 2) + (x < 0 ? 0 : 1)], x, y);

// ------------------------------------------------------------ the liquid

const D = 150;                 // eye to glass, px
const FRINGE = 2.0, CONTOUR = 6, DEEP = 15;                // px of liquid that dim the die to 1/e
const WIN = 57;                // the window's radius, px
const MIN_DUR = 2.6, HOUR_DUR = 4.6;
const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const smooth = (t) => t * t * (3 - 2 * t);

// Bubbles that live in the liquid all the time, rising.
const DRIFT = Array.from({ length: 5 }, (_, i) => {
  const side = i % 2 ? 1 : -1;
  return {
    x: 64 + side * (34 + noise(i, 1) * 22), sp: 3 + noise(i, 2) * 5, ph: noise(i, 3),
    r: 1.4 + noise(i, 4) * 1.2,
    z: 3 + noise(i, 5) * 8, wob: 0.6 + noise(i, 6) * 1.4, wf: 0.7 + noise(i, 7) * 1.4,
  };
});
// Bubbles shaken loose at a turn.
const BURST = Array.from({ length: 10 }, (_, i) => ({
  a: noise(i, 11) * TAU, rr: 0.35 + noise(i, 12) * 0.6, r: 1.4 + noise(i, 13) * 1.4,
  z: 1 + noise(i, 14) * 14, sp: 14 + noise(i, 15) * 22, del: noise(i, 16) * 0.35, wf: 2 + noise(i, 17) * 3,
}));

// The hour's whirlpool: bubbles dragged round the spinning die.
const VORTEX = Array.from({ length: 18 }, (_, i) => ({
  a: noise(i, 21) * TAU, rr: (i + 0.5) / 18, r: 1.4 + noise(i, 23) * 1.4,
  z: 1 + noise(i, 24) * 18, del: noise(i, 25) * 0.25, rise: 2 + noise(i, 26) * 4, arm: i % 3,
}));

const zbuf = new Float32Array(W * H);
const NX = new Float64Array(20), NY = new Float64Array(20), NZ = new Float64Array(20), KK = new Float64Array(20);

/** One bubble at screen (x, y), radius r, depth z: drawn only in the liquid in front of the die. */
function bubble(g, x, y, r, z) {
  if (r < 1.2) return;
  const x0 = Math.floor(x - r - 1), x1 = Math.ceil(x + r + 1), y0 = Math.floor(y - r - 1), y1 = Math.ceil(y + r + 1);
  for (let py = Math.max(0, y0); py < Math.min(H, y1); py++)
    for (let px = Math.max(0, x0); px < Math.min(W, x1); px++) {
      const i = py * W + px;
      if (zbuf[i] <= z) continue;
      const ddx = px + 0.5 - x, ddy = py + 0.5 - y, e = Math.hypot(ddx, ddy);
      if (Math.abs(e - r) < 0.5 || Math.hypot(ddx + r * 0.4, ddy + r * 0.4) < 0.55) g.buf[i] = 1;
      else if (e < r + 0.9) g.buf[i] = 0;
    }
}

export default {
  name: 'Eight Ball',
  blurb: 'A Magic 8-Ball: the time floats up on the die, cut in its own triangle; every minute the ball is shaken and the die rolls up the next answer.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  driver: 'full',

  frame(g, ctx) {
    const { date, fields: f, oled } = ctx;
    const T = f.h * 3600 + f.m * 60 + f.sec;           // continuous seconds of the day
    const sec = f.sec;
    const isHour = f.m === 0;
    const DUR = isHour ? HOUR_DUR : MIN_DUR;
    const turning = sec < DUR;
    const u = turning ? sec / DUR : 1;
    const key = f.minuteKey;
    const roll = ROLLS[key % 3];
    const tw = roll.twists[Math.floor(key / 3) % 2];

    // ---- the die's motion
    let M = I3, depth = 0, shx = 0, shy = 0, stir = 0, pr = 0;
    if (turning && !isHour) {
      pr = ease.inOutCubic(progress(u, 0.1, 0.72));
      const pt = ease.inOutQuad(progress(u, 0.16, 0.8));
      M = mul(rotZ(tw * pt), axisAngle(roll.axis, roll.angle * pr));
      depth = 17 * Math.sin(Math.PI * progress(u, 0, 0.82)) ** 0.8;
      const q = progress(u, 0.82, 1);
      depth += 2 * Math.abs(Math.sin(TAU * q)) * (1 - q);
      const k = progress(sec, 0, 1.1);
      shx = 5 * Math.sin(TAU * 2.4 * sec) * (1 - k) ** 2;
      shy = 2 * Math.sin(TAU * 1.7 * sec + 1) * (1 - k) ** 2;
      stir = Math.sin(Math.PI * u);
    } else if (turning) {
      // knocked deep and rolled at once, then the new face is whirled
      // round in the vortex as it rises back to the glass
      pr = ease.inOutCubic(progress(u, 0.05, 0.25));
      const pt = ease.inOutQuad(progress(u, 0.08, 0.3));
      const spin = -TAU * ease.inOutQuad(progress(u, 0.16, 0.86));
      M = mul(rotZ(spin + tw * pt), axisAngle(roll.axis, roll.angle * pr));
      depth = 21 * ease.outQuad(progress(u, 0, 0.12)) * (1 - ease.inOutQuad(progress(u, 0.3, 0.84)));
      const q = progress(u, 0.84, 1);
      depth += 2.5 * Math.abs(Math.sin(TAU * q)) * (1 - q);
      const k = progress(sec, 0, 1.6);
      shx = 8 * Math.sin(TAU * 2.2 * sec) * (1 - k) ** 2;
      shy = 3 * Math.sin(TAU * 1.5 * sec + 1) * (1 - k) ** 2;
      stir = Math.sin(Math.PI * u);
    }
    const Tturn = mul(rotZ(tw), axisAngle(roll.axis, roll.angle));
    const rock = 1 + 1.5 * stir;
    const Wb = mul(rotZ(0.055 * Math.sin(0.21 * T) + 0.02 * Math.sin(0.67 * T + 1)),
      mul(rotY(rock * (0.045 * Math.sin(0.53 * T) + 0.018 * Math.sin(1.31 * T + 1))),
        rotX(rock * (0.04 * Math.sin(0.41 * T + 2) + 0.015 * Math.sin(1.7 * T)))));
    const P = mul(Wb, M);

    const [ox, oy] = orbit(date, 2, 3);
    const cx = ox + 1.3 * Math.sin(0.23 * T) + shx;
    const cy = FACE_Y - 32 + oy + 0.8 * Math.sin(0.31 * T + 2) + shy;
    let minz = 1e9;
    for (const v of VERT) minz = Math.min(minz, apply(P, v)[2] * SC);
    const cz = depth + 0.7 + 0.7 * Math.sin(0.83 * T) - minz;
    const dox = Math.round(cx), doy = Math.round(cy);

    for (let i = 0; i < 20; i++) {
      const n = apply(P, FACES[i].n), c = apply(P, FACES[i].c);
      NX[i] = n[0]; NY[i] = n[1]; NZ[i] = n[2];
      KK[i] = (cx + c[0] * SC) * n[0] + (cy + c[1] * SC) * n[1] + (cz + c[2] * SC + D) * n[2];
    }

    // ---- the faces that carry type: the one at the glass, and during a turn the one rolling up
    const frameOf = (B) => {
      const ex = apply(P, apply(B, [1, 0, 0])), ey = apply(P, apply(B, [0, 1, 0])), c = apply(P, apply(B, FACES[FRONT].c));
      return { ex, ey, c: [cx + c[0] * SC, cy + c[1] * SC, cz + c[2] * SC] };
    };
    // The type sinks into the murk with its face: the old time is gone once
    // its face has rolled away, the new one comes up with its own.
    const typeA = { face: FRONT, fr: frameOf(I3), txt: textOf(turning ? previousMinute(date) : f), vis: 1 - progress(pr, 0.3, 0.6) };
    const typeN = turning ? { face: roll.face, fr: frameOf(transpose(Tturn)), txt: textOf(f), vis: progress(pr, 0.25, 0.55) } : null;
    const EMB = 3.2;                                  // how far the numerals stand off the face, px

    // The numerals are ridged like moulded letters: each stroke is a roof of
    // two facets, and the facets that face the lamp are lit. The lamp's
    // reflection wanders slowly round, so the light runs over the numerals.
    const la = -2.3 + 0.9 * Math.sin(0.11 * T) + 0.4 * Math.sin(0.29 * T + 1);
    const Lc = [0.8 * Math.cos(la), 0.8 * Math.sin(la), -0.6];
    for (const ty of [typeA, typeN]) if (ty) { ty.lx = dot(Lc, ty.fr.ex); ty.ly = dot(Lc, ty.fr.ey); }

    const buf = g.buf;
    for (let y = 0; y < H; y++) {
      const dy = y + 0.5 - 32;
      for (let x = 0; x < W; x++) {
        const dx = x + 0.5 - 64, idx = y * W + x;
        let best = -1e9, bi = -1, second = -1e9, exit = 1e9;
        for (let i = 0; i < 20; i++) {
          const den = dx * NX[i] + dy * NY[i] + D * NZ[i], tt = KK[i] / den;
          if (den < 0) { if (tt > best) { second = best; best = tt; bi = i; } else if (tt > second) second = tt; }
          else if (tt < exit) exit = tt;
        }
        if (bi < 0 || best > exit) { zbuf[idx] = 1e9; continue; }
        const z = (best - 1) * D;
        zbuf[idx] = z;
        const facing = -NZ[bi];
        // The liquid between die and glass shows as solid contour lines of
        // its depth: on a face lying almost flat on the glass, one or two wide
        // interference fringes that swing as it rocks; on the faces that fall
        // away, a few parallel lines CONTOUR px apart. Lines stop at a depth,
        // and since that cut-off is itself a contour, they drop out one by
        // one into the murk instead of breaking up.
        const grad = Math.hypot(NX[bi], NY[bi]) / facing;
        const lam = Math.max(FRINGE, CONTOUR * grad);
        const ph = z / lam, dd = (Math.abs(ph - Math.round(ph)) * lam) / (grad + 1e-4);
        let L = 0;
        if (dd < 0.62 && (grad < 0.2 ? z < 4 : z - depth < DEEP)) L = 1;
        const edge = Math.min((best - second) * D, (exit - best) * D * 0.6);
        if (edge < 0.75 && z - depth < DEEP + 1) L = 1;

        const ty = bi === typeA.face ? typeA : typeN && bi === typeN.face ? typeN : null;
        if (ty && ty.vis > 0 && edge >= 0.75) {
          const { ex, ey, c } = ty.fr;
          const hx = dx * best - c[0], hy = dy * best - c[1], hz = -D + D * best - c[2];
          const lx = hx * ex[0] + hy * ex[1] + hz * ex[2], ly = hx * ey[0] + hy * ey[1] + hz * ey[2];
          const dl = Math.hypot(dx, dy, D), vx = -dx / dl, vy = -dy / dl, vz = -D / dl;
          const vn = vx * NX[bi] + vy * NY[bi] + vz * NZ[bi];
          const tx = vx - vn * NX[bi], tyy = vy - vn * NY[bi], tz = vz - vn * NZ[bi];
          const k = EMB / Math.max(0.2, vn);
          const ox1 = (tx * ex[0] + tyy * ex[1] + tz * ex[2]) * k, oy1 = (tx * ey[0] + tyy * ey[1] + tz * ey[2]) * k;
          const sTop = sdfText(ty.txt, lx + ox1, ly + oy1);
          // How present the numerals are: they go with depth, with the face
          // turning away, and with the roll. They fade by thinning, not by
          // dither, so a fading numeral stays a clean shape.
          const v = clamp(1.6 * Math.exp(-Math.max(0, z) / 40), 0, 1) * clamp((facing - 0.35) / 0.3, 0, 1) * ty.vis;
          if (v > 0 && sTop < -(1 - v) * 2.3) {
            const qx = lx + ox1, qy = ly + oy1;
            const gx = sdfText(ty.txt, qx + 0.6, qy) - sdfText(ty.txt, qx - 0.6, qy);
            const gy = sdfText(ty.txt, qx, qy + 0.6) - sdfText(ty.txt, qx, qy - 0.6);
            const lit = gx * ty.lx + gy * ty.ly;
            L = lit >= -0.12 * Math.hypot(gx, gy) || v < 0.97 ? 1 : 0.6;
          } else if (sTop < 1.0 || sdfText(ty.txt, lx, ly) < 0) L = 0;
        }
        if (L >= 0.999 || (L > 0 && dither(x - dox, y - doy, L))) buf[idx] = 1;
      }
    }

    // ---- bubbles
    for (const b of DRIFT) {
      const yy = 70 - ((T * b.sp + b.ph * 84) % 84);
      const xx = b.x + b.wob * Math.sin(T * b.wf + b.ph * 9) + shx * 0.5;
      bubble(g, xx, yy, b.r, b.z);
    }
    if (turning && !isHour) {
      for (const b of BURST) {
        const age = sec - b.del * DUR * 0.4;
        if (age < 0) continue;
        const life = progress(age, 0, DUR * 0.9);
        if (life >= 1) continue;
        const bx = 64 + cx + Math.cos(b.a) * 44 * b.rr + 3 * Math.sin(age * b.wf + b.a);
        const by = 34 + Math.sin(b.a) * 22 * b.rr - age * b.sp;
        bubble(g, bx, by, b.r * (1 - 0.3 * life), b.z + depth * 0.3);
      }
    } else if (turning) {
      for (const b of VORTEX) {
        const age = sec - b.del * DUR;
        if (age < 0) continue;
        const life = progress(age, 0, DUR * (0.8 - b.del));
        if (life >= 1) continue;
        // the whirl spins up fast and winds down, drawing the ring in and up
        // three spiral arms, wound tighter towards the middle
        const ang = (b.arm * TAU) / 3 + (1 - b.rr) * 2.6 + 11 * ease.outQuad(life) + 2 * life + b.a * 0.08;
        const rad = (16 + 40 * b.rr) * (1 - 0.35 * ease.inQuad(life));
        const bx = 64 + cx + rad * Math.cos(ang);
        const by = 32 + cy * 0.3 + rad * 0.62 * Math.sin(ang) - age * b.rise;
        bubble(g, bx, by, b.r * (1 - 0.4 * life), b.z);
      }
    }

    // ---- the window: the ball's black plastic outside it, a rim, and the
    // reflection of a lamp on the glass
    const wx = 64 + ox * 1.5, wy = 31 + oy;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const e = Math.hypot(x + 0.5 - wx, (y + 0.5 - wy) * 1.0) - WIN;
        if (e > 1.5) buf[y * W + x] = 0;
        else if (e > -0.2) {
          // a 1 px rim, doubled where the lamp catches it (upper left)
          const a = Math.atan2(y + 0.5 - wy, x + 0.5 - wx);
          buf[y * W + x] = e < 0.8 || (e < 1.5 && -Math.sin(a + 0.6) > 0.6) ? 1 : 0;
        }
      }
    oled.contrast(0xcf + (0x20 - 0xcf) * ctx.night);
  },
};
