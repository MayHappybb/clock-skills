// Toaster — a chrome toaster that tells the time in toast.
//
// The minute is the slice in the front slot. The toaster brands both sides of
// it, this minute on one side and the next on the other, in a fat 1950s
// appliance-ad numeral (hand-drawn 16 x 22 bitmaps, heavy verticals, ball
// terminals). The hour is the slice already made, standing on a plate and
// leaning on the toaster like a book on a shelf, with a pat of butter on its
// ear that melts down over the hour.
//
// Real 3D: one perspective camera, a little above the counter. The toaster is
// a rounded box ray-marched once (chrome: a bright shoulder rim, a cartoon
// shine of two slanted bars, a streak down each end, the base trim) and
// z-buffered; each slice is a slab drawn by inverse mapping (every pixel's ray
// meets the face it can see; where it misses that face but hits the far one,
// it is looking at the crust wall), so a spinning slice shows its thickness
// edge-on. The numerals are sub-sampled along the face's own axes when the
// slice turns, so they never break up.
//
// Idle: the lever creeps down the side all minute (the seconds), with a
// tremble; the coils' glow crawls along the slots; steam curls off both
// slices; the butter melts.
// The minute: the lever bottoms out, the carriage sinks, the spring fires —
// the toaster jumps a pixel, crumbs fly, and the slice pops up, spins half a
// turn about its upright axis (edge-on exactly at :00, the old side before,
// the new side after) and drops back into the slot with a little hop.
// The hour: the toaster shudders, then leaps; the minute slice is fired high
// and spins one and a half turns; the hop jerks the plate and the old hour's
// slice skids off to the left, butter and all; the new hour's slice, thrown
// from the back slot, backflips over and lands on the plate rocking on its
// corner (its face is blank until :00); then a fresh pat of butter drops onto it.
//
// Burn-in: kit.orbit walks the whole scene; the toaster's chrome is outline.
// 23:00-07:00 the panel dims (ctx.night).

import { clamp, ease, progress, orbit, noise, clockFields, previousMinute } from '../js/kit.js';

const GLYPHS = `
0
.....######.....
...##########...
..############..
.######..######.
.#####....#####.
######....######
#####......#####
#####......#####
#####......#####
#####......#####
#####......#####
#####......#####
#####......#####
#####......#####
#####......#####
#####......#####
######....######
.#####....#####.
.######..######.
..############..
...##########...
.....######.....
1
.......####.....
.....######.....
...########.....
..#########.....
..###.#####.....
......#####.....
......#####.....
......#####.....
......#####.....
......#####.....
......#####.....
......#####.....
......#####.....
......#####.....
......#####.....
......#####.....
......#####.....
......#####.....
.....#######....
...###########..
...###########..
...###########..
2
....#######.....
..###########...
.#############..
.#####...######.
#####.....#####.
.###......#####.
..........#####.
.........######.
........######..
.......######...
......######....
.....######.....
....######......
...######.......
..######........
.######.........
.#####..........
#####.......##..
#####......###..
################
################
################
3
...########.....
.############...
.#############..
.####....######.
..##......#####.
..........#####.
.........#####..
.....########...
.....#######....
.....#########..
.........######.
..........######
..........######
..........######
..........######
.##.......######
####......#####.
#####....######.
.##############.
..############..
...##########...
.....######.....
4
.........#####..
........######..
.......#######..
......########..
......########..
.....#########..
.....#########..
....####.#####..
...####..#####..
..####...#####..
..####...#####..
.####....#####..
####.....#####..
################
################
################
.........#####..
.........#####..
.........#####..
.........#####..
........#######.
........#######.
5
..############..
..############..
..############..
..####..........
..####..........
..####..........
..####.####.....
..############..
..#############.
..####....######
..........######
...........#####
...........#####
...........#####
...........#####
.##........#####
####.......#####
#####.....######
.###############
..#############.
...###########..
.....#######....
6
.......#####....
.....#########..
....#####.#####.
...#####...###..
..#####.........
..#####.........
.#####.####.....
.##############.
.###############
######....######
#####......#####
#####......#####
#####......#####
#####......#####
#####......#####
#####......#####
#####......#####
######....######
.######..######.
..############..
...##########...
.....######.....
7
################
################
################
###.........####
##.........####.
..........####..
.........#####..
.........####...
........#####...
........####....
.......#####....
.......#####....
......#####.....
......#####.....
......#####.....
.....######.....
.....######.....
.....######.....
.....######.....
.....######.....
......####......
.......##.......
8
....########....
..############..
.#####....#####.
.####......####.
.####......####.
.#####....#####.
..############..
...##########...
..############..
.######..######.
#####......#####
#####......#####
#####......#####
#####......#####
#####......#####
#####......#####
######....######
.######..######.
.##############.
..############..
...##########...
.....######.....
`;

// Parse: 16 x 22 bitmaps, 1 = toasted. The 9 is the 6 turned round.
const GW = 16, GH = 22;
const DIG = [];
{
  const lines = GLYPHS.trim().split('\n');
  for (let i = 0; i < lines.length; i += GH + 1) {
    const k = +lines[i], b = new Float32Array(GW * GH);
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) b[y * GW + x] = lines[i + 1 + y][x] === '#' ? 1 : 0;
    DIG[k] = b;
  }
  const n = new Float32Array(GW * GH);
  for (let i = 0; i < GW * GH; i++) n[i] = DIG[6][GW * GH - 1 - i];
  DIG[9] = n;
}
/** The glyph as a smooth shape: the bitmap interpolated between pixel centres, cut at half. */
function glyph(k, x, y) {
  x -= 0.5; y -= 0.5;
  if (x < -1 || y < -1 || x > GW || y > GH) return 0;
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, b = DIG[k];
  const at = (a, c) => (a >= 0 && c >= 0 && a < GW && c < GH ? b[c * GW + a] : 0);
  const v = (at(i, j) * (1 - fx) + at(i + 1, j) * fx) * (1 - fy) + (at(i, j + 1) * (1 - fx) + at(i + 1, j + 1) * fx) * fy;
  return v > 0.5 ? 1 : 0;
}

// ------------------------------------------------------------ vectors, camera
const DEG = Math.PI / 180;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; };
const rot = (axis, a, v) => { // Rodrigues: v turned by a about the unit axis
  const c = Math.cos(a), s = Math.sin(a), d = dot(axis, v);
  const cr = [axis[1] * v[2] - axis[2] * v[1], axis[2] * v[0] - axis[0] * v[2], axis[0] * v[1] - axis[1] * v[0]];
  return [v[0] * c + cr[0] * s + axis[0] * d * (1 - c), v[1] * c + cr[1] * s + axis[1] * d * (1 - c), v[2] * c + cr[2] * s + axis[2] * d * (1 - c)];
};
// World: x right, y DOWN (floor at y = 0, things stand at negative y), z away from the viewer.
// The eye looks down at the counter from PITCH above level.
const CX = 64, CY = 32, PITCH = 10 * DEG, FOC = 250;
const CF = [0, Math.sin(PITCH), Math.cos(PITCH)], CD = [0, Math.cos(PITCH), -Math.sin(PITCH)], CR = [1, 0, 0];
const TARGET = [0, -31.5, 8];
const EYE = add(TARGET, CF, -FOC);
const UP = [0, -1, 0];
function proj(p) {
  const v = sub(p, EYE), z = dot(v, CF);
  return [CX + (FOC * dot(v, CR)) / z, CY + (FOC * dot(v, CD)) / z, z];
}
const rayDir = (sx, sy) => [CF[0] * FOC + (sx - CX), CF[1] * FOC + CD[1] * (sy - CY), CF[2] * FOC + CD[2] * (sy - CY)];

// ------------------------------------------------------------ the toaster: chrome, ray-cast once
// A loaf-shaped rounded box, turned a little so its right end (with the lever) shows.
const TY = 0;                        // yaw
const TC = [27, -13, 16];                   // centre (its feet put the body 2 above the counter)
const TB = [29, 12, 10], TRAD = 8;          // half extents, rounding
const TAX = [Math.cos(TY), 0, -Math.sin(TY)], TAZ = [Math.sin(TY), 0, Math.cos(TY)]; // its length and depth axes
const toLocal = (p) => { const r = sub(p, TC); return [dot(r, TAX), r[1], dot(r, TAZ)]; };
const toWorld = (x, y, z) => add(add(add(TC, TAX, x), [0, 1, 0], y), TAZ, z);
function sdToaster(x, y, z) {
  const qx = Math.abs(x) - (TB[0] - TRAD), qy = Math.abs(y) - (TB[1] - TRAD), qz = Math.abs(z) - (TB[2] - TRAD);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - TRAD;
}
const SLOT_Z = [-3.2, 3.2], SLOT_HALF = [25.5, 1.4]; // two slots in the top, along its length

// Chrome, the way it reads at this size: the outline, a bright rim where the top rounds
// over to the front, two diagonal glints on the front, a streak down the lit end.
function chrome(l, n) {
  const fy = l[1] + TB[1];                                     // height down from the top
  if (n[2] < -0.985) {                                         // the flat front
    const k = l[0] + 0.7 * fy;                                            // a cartoon shine: two slanted bars, up on the left
    if (fy > 4 && fy < 16 && ((k > -16 && k < -12.6) || (k > -10.8 && k < -9.4))) return true;
    if (Math.abs(fy - 20) < 0.55) return true;                            // the base trim
    return false;
  }
  if (n[2] < -0.2 && n[1] < -0.45 && n[1] > -0.75) return true; // the top shoulder, catching the window
  if (n[2] < -0.2 && Math.abs(n[0]) > 0.55 && Math.abs(n[0]) < 0.8 && fy > 8 && fy < 18) return true; // a streak down each end
  return false;
}

let TOASTER = null; // { lit, cls, z } for the toaster at rest, 128 x 64
function toasterImage() {
  if (TOASTER) return TOASTER;
  const lit = new Uint8Array(128 * 64), cls = new Uint8Array(128 * 64), zb = new Float32Array(128 * 64).fill(Infinity);
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 128; x++) {
      let hits = 0, slot = 0, bright = 0, zs = 0;
      for (let s = 0; s < 4; s++) {
        const d = norm(rayDir(x + 0.25 + 0.5 * (s & 1), y + 0.25 + 0.5 * (s >> 1)));
        let t = 150, hit = false, p;
        for (let k = 0; k < 64; k++) {
          p = add(EYE, d, t);
          const l = toLocal(p), sd = sdToaster(l[0], l[1], l[2]);
          if (sd < 0.02) { hit = true; break; }
          t += sd;
          if (t > 400) break;
        }
        if (!hit) continue;
        hits++;
        const l = toLocal(p), e = 0.01;
        const nl = norm([
          sdToaster(l[0] + e, l[1], l[2]) - sdToaster(l[0] - e, l[1], l[2]),
          sdToaster(l[0], l[1] + e, l[2]) - sdToaster(l[0], l[1] - e, l[2]),
          sdToaster(l[0], l[1], l[2] + e) - sdToaster(l[0], l[1], l[2] - e)]);
        if (nl[1] < -0.97 && Math.abs(l[0]) < SLOT_HALF[0] && SLOT_Z.some((sz) => Math.abs(l[2] - sz) < SLOT_HALF[1])) { slot++; continue; }
        bright += chrome(l, nl) ? 1 : 0;
        zs += dot(sub(p, EYE), CF);
      }
      const i = y * 128 + x;
      if (hits >= 2) {
        cls[i] = slot >= 2 ? 2 : 1;
        lit[i] = cls[i] === 1 && bright * 2 >= hits - slot ? 1 : 0;
        if (cls[i] === 1) zb[i] = zs / Math.max(1, hits - slot);
      }
    }
  // outlines: the silhouette and the slots' lips
  const out = new Uint8Array(lit);
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 128; x++) {
      const i = y * 128 + x;
      if (cls[i] !== 1) continue;
      const nb = (a, b) => (a < 0 || b < 0 || a > 127 || b > 63 ? 0 : cls[b * 128 + a]);
      if (nb(x - 1, y) !== 1 || nb(x + 1, y) !== 1 || nb(x, y - 1) !== 1 || nb(x, y + 1) !== 1) out[i] = 1;
    }
  TOASTER = { lit: out, cls, z: zb };
  return TOASTER;
}

// ------------------------------------------------------------ the slice
// Local units are pixels: u across (-25..25), v up from the bottom crust (0..43.5).
const SW = 24, ST = 41, THICK = 1.6, CRUST = 2.2;
function bread(u, v) {
  const qx = Math.abs(u) - 18.5, qy = Math.abs(v - 15) - 12; // the body: 43 x 30, corners r 3
  const box = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - 3;
  const lobe = Math.hypot(Math.abs(u) - 11.5, v - 29) - 12;  // the crown: two ears
  return Math.min(box, lobe);
}
const DIGIT_TOP = 6 + GH; // v of the numerals' cap line; their baseline is v = 6
function mark(str, u, v) {
  if (!str) return 0;
  const gy = DIGIT_TOP - v;
  if (str.length === 1) return glyph(+str, u + GW / 2, gy);
  return u < 0 ? glyph(+str[0], u + 17, gy) : glyph(+str[1], u - 1, gy);
}

/** A slice's axes in the world from an upright slice facing the viewer: tumble (end over end), lean (top away), spin (about the vertical), yaw. */
function sliceBasis({ tumble = 0, lean = 0, spin = 0, roll = 0 } = {}) {
  let ru = [1, 0, 0], rv = [0, -1, 0], rw = [0, 0, 1];
  const turn = (ax, a) => { if (a) { ru = rot(ax, a, ru); rv = rot(ax, a, rv); rw = rot(ax, a, rw); } };
  turn(ru, tumble);
  turn([1, 0, 0], lean);
  turn([0, 0, 1], roll);
  turn(UP, spin);
  return { ru, rv, rw };
}

/**
 * Draw one slice: s = { o (bottom-centre, world), b (axes), front, back, zt (test against the toaster), dx, dy }.
 * Hidden where the toaster is nearer. Inside the bread is black: the slice is opaque.
 */
function drawSlice(g, s) {
  const { o, b: { ru, rv, rw } } = s, sx = s.sx ?? 0, sy = s.sy ?? 0;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const u of [-SW, SW]) for (const v of [0, ST]) for (const w of [-THICK, THICK]) {
    let [px, py] = proj(add(add(add(o, ru, u), rv, v), rw, w));
    px += sx; py += sy;
    x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
  }
  x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0));
  x1 = Math.min(127, Math.ceil(x1)); y1 = Math.min(63, Math.ceil(y1));
  const qf = sub(add(o, rw, -THICK), EYE), qb = sub(add(o, rw, THICK), EYE), oe = sub(o, EYE);
  const nf = dot(rw, qf), nb = dot(rw, qb);
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const X = x - sx, Y = y - sy;
      const d = rayDir(X + 0.5, Y + 0.5);
      const den = dot(rw, d);
      if (Math.abs(den) < 1e-3) continue;
      const fv = den > 0; // the front (-w) face looks at the eye
      let t = (fv ? nf : nb) / den;
      let r = [d[0] * t - oe[0], d[1] * t - oe[1], d[2] * t - oe[2]];
      let u = dot(r, ru), v = dot(r, rv);
      let sd = bread(u, v), wall = false;
      if (sd >= 0) {
        t = (fv ? nb : nf) / den;
        r = [d[0] * t - oe[0], d[1] * t - oe[1], d[2] * t - oe[2]];
        if (bread(dot(r, ru), dot(r, rv)) >= 0) continue;
        wall = true;
      }
      if (s.zt) { // behind the chrome?
        const tx = x - s.tx, ty = y - s.ty;
        if (tx >= 0 && ty >= 0 && tx < 128 && ty < 64 && TOASTER.z[ty * 128 + tx] < t * dot(d, CF)) continue;
      }
      if (wall || sd > -CRUST) { g.pixel(x, y, 1); continue; }
      const str = fv ? s.front : s.back, su = fv ? u : -u;
      let lit = 0;
      if (str) { // four sub-samples, stepped along the face's own axes
        const d2 = rayDir(X + 1.5, Y + 0.5), d3 = rayDir(X + 0.5, Y + 1.5);
        const t2 = (fv ? nf : nb) / dot(rw, d2), t3 = (fv ? nf : nb) / dot(rw, d3);
        const r2 = [d2[0] * t2 - oe[0], d2[1] * t2 - oe[1], d2[2] * t2 - oe[2]], r3 = [d3[0] * t3 - oe[0], d3[1] * t3 - oe[1], d3[2] * t3 - oe[2]];
        const sg = fv ? 1 : -1;
        const ux = (dot(r2, ru) - u) * sg, vx = dot(r2, rv) - v, uy = (dot(r3, ru) - u) * sg, vy = dot(r3, rv) - v;
        for (const [a, c] of [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]])
          lit += mark(str, su + a * ux + c * uy, v + a * vx + c * vy);
      }
      g.pixel(x, y, lit >= 2 ? 1 : 0);
    }
}

// ------------------------------------------------------------ the scene's places
const SLOT_TOP = -TB[1];                       // local y of the toaster's top
const minuteHome = (sink = 0) => toWorld(0, SLOT_TOP + 4 + sink, SLOT_Z[0]); // bottom-centre, 4 deep in the front slot
const HOUR_LEAN = PITCH;
const HOUR_FOOT = [-36, -1.5, 4];                 // where the hour slice stands on the plate

const PLATE_RX = 31;
/** A plate side-on: a flat lens with a 2 px rim on top and a foot ring under it. */
function drawPlate(g, cx, cy) {
  g.fillWhere((px, py) => {
    const k = (px - cx) / PLATE_RX;
    if (Math.abs(k) > 1) return false;
    const bot = cy + 1 + 2.6 * (1 - k * k);
    if (py < cy - 0.5 || py > bot + 0.5) return Math.abs(px - cx) < 13 && py > bot + 0.5 && py < bot + 2.5;
    return py < cy + 1.5 || py > bot - 0.5 || Math.abs(k) > 0.96 ? 1 : 0;
  }, 1, [cx - PLATE_RX - 1, cy - 1, 2 * PLATE_RX + 3, 9]);
}

/** The browning knob on the front, turned by the hour: a dial with a pointer. */
function drawKnob(g, tx, ty) {
  const [x, y] = proj(toWorld(TB[0] - 9, -TB[1] + 15.5, -TB[2]));
  g.fillCircle(x + tx, y + ty, 3.2, 0);
  g.circle(Math.round(x + tx - 0.5), Math.round(y + ty - 0.5), 3);
  g.fillRect(Math.round(x + tx - 0.5), Math.round(y + ty - 0.5) - 2, 1, 3);
}

/** The lever, out of the right end; `at` 0 up .. 1 down. */
function drawLever(g, at, dx, dy) {
  const [x, y] = proj(toWorld(TB[0], -TB[1] + 7 + at * 13, -2));
  const lx = Math.round(x + dx), ly = Math.round(y + dy);
  g.fillRoundRect(lx, ly, 7, 3, 1);
}

// ------------------------------------------------------------ choreography
// tau: seconds from the nearest minute boundary (negative before it).
const M_LAUNCH = -0.5, M_LAND = 0.7, M_APEX = 6;      // a minute: a small pop
const H_LAUNCH = -0.6, H_LAND = 0.85, H_APEX = 22;     // the hour: the big one
const HOUR_ROLL = 6 * DEG;

/** Height of a thrown slice above its seat: a parabola from launch to landing, then a hop. */
function flight(tau, t0, t1, apex) {
  if (tau <= t0 || tau >= t1 + 0.4) return 0;
  if (tau < t1) { const u = (tau - t0) / (t1 - t0); return apex * 4 * u * (1 - u); }
  return 2.2 * Math.sin(Math.PI * (tau - t1) / 0.4);
}

/** The minute slice: { o, b, sink } */
function minutePose(tau, oldKey, hourTurn) {
  const t0 = hourTurn ? H_LAUNCH : M_LAUNCH, t1 = hourTurn ? H_LAND : M_LAND;
  // the carriage creeps down with the lever, then the spring fires
  const sink = 2 * ease.inOutQuad(progress(tau, t0 - 0.7, t0)) * (1 - progress(tau, t0, t0 + 0.08));
  const lift = flight(tau, t0, t1, hourTurn ? H_APEX : M_APEX);
  const turns = hourTurn ? 3 : 1, s0 = hourTurn ? -0.5 : -0.42, s1 = hourTurn ? 0.75 : 0.42;
  let spin = Math.PI * (oldKey & 1) + Math.PI * turns * ease.inOutCubic(progress(tau, s0, s1));
  const env = Math.sin(Math.PI * progress(tau, t0, t1));
  const roll = 0.1 * env * Math.sin(tau * 8);
  const o = add(minuteHome(sink), [0, -lift, 0]);
  return { o, b: sliceBasis({ lean: PITCH * (1 - env), roll, spin }) };
}

const hourRestBasis = (roll = HOUR_ROLL) => sliceBasis({ lean: PITCH, roll });
const centreOf = (o, b) => add(o, b.rv, 20);

/** The new hour's slice, thrown from the back slot onto the plate. */
function newHourPose(tau) {
  const t0 = H_LAUNCH + 0.05, t1 = 0.4;
  const rest = hourRestBasis();
  if (tau >= t1) { // landed: rocks on its foot and settles
    const k = tau - t1;
    const wob = k < 1 ? 7 * DEG * Math.exp(-k * 5) * Math.sin(k * 18) : 0;
    const b = hourRestBasis(HOUR_ROLL + wob);
    const foot = add(HOUR_FOOT, rest.ru, SW);        // rocks about the corner it stands on
    return { o: add(foot, b.ru, -SW), b };
  }
  const u = progress(tau, t0, t1), e = ease.inOutQuad(u);
  const start = centreOf(toWorld(0, SLOT_TOP + 4, SLOT_Z[1]), sliceBasis({ lean: PITCH }));
  const end = centreOf(HOUR_FOOT, rest);
  const c = [start[0] + (end[0] - start[0]) * u, start[1] + (end[1] - start[1]) * u - 27 * 4 * u * (1 - u), start[2] + (end[2] - start[2]) * u + 30 * Math.sin(Math.PI * u)];
  const b = sliceBasis({ tumble: -2 * Math.PI * ease.outCubic(u), lean: PITCH, roll: HOUR_ROLL * e });
  return { o: add(c, b.rv, -20), b };
}

/** The old hour's slice: the toaster's hop jerks the plate and it skids off to the left, tipping. */
function oldHourPose(tau, hourTurn) {
  const rest = hourRestBasis();
  if (!hourTurn || tau < -0.3) return { o: HOUR_FOOT, b: rest };
  const p = ease.inQuad(progress(tau, -0.3, 0.35));
  const b = hourRestBasis(HOUR_ROLL - 25 * DEG * p);
  const foot = add(HOUR_FOOT, rest.ru, SW);
  return { o: add(add(foot, b.ru, -SW), [-70 * p, -6 * Math.sin(Math.PI * p), 0]), b };
}

/** Crumbs from a pop: little squares on ballistic paths, seeded by the minute. */
function drawCrumbs(g, tau, t0, key, n, ox, oy) {
  const t = tau - t0;
  if (t < 0 || t > 1.2) return;
  const [cx, cy] = proj(toWorld(0, SLOT_TOP, SLOT_Z[0]));
  for (let i = 0; i < n; i++) {
    const r1 = noise(key + i * 7.1, 3), r2 = noise(key + i * 3.3, 5), r3 = noise(key + i * 1.7, 9);
    const x = cx + (r1 - 0.5) * 50 + (r1 - 0.5) * 70 * t;
    const y = cy - 2 - (30 + 50 * r2) * t + 0.5 * 160 * t * t;
    if (y > 62) continue;
    g.fillRect(Math.round(x + ox), Math.round(y + oy), 2, 2);
  }
}

/** A wisp of steam: an S-curl that rises, stretches and thins out, on a 4 s cycle. */
function wisp(g, x, y, T, k, rise = 16) {
  const ph = (T / 4 + k * 0.37) % 1;
  const head = ph * (rise + 10), tail = Math.max(0, ph * (rise + 10) - 4 - 9 * Math.sin(Math.PI * ph));
  let px = null, py = null;
  for (let h = tail; h <= head; h += 1) {
    const yy = y - h;
    if (yy < 0) break;
    const xx = x + 2.4 * Math.sin(h * 0.32 - T * 1.1 + k * 2) * Math.min(1, h / 8);
    const ix = Math.round(xx), iy = Math.round(yy);
    if (px !== null) g.line(px, py, ix, iy); else g.pixel(ix, iy);
    px = ix; py = iy;
  }
}

/** The pat of butter on the hour slice: dropped at the hour, then melting all hour. */
function drawButter(g, pose, melt, drop, ox, oy) {
  const top = add(add(pose.o, pose.b.ru, 12.5), pose.b.rv, 40.6);
  let [x, y] = proj(top);
  x += ox; y += oy;
  const fall = 1 - drop;
  const w = Math.round(9 + 4 * melt), h = Math.round(5 - 2.4 * melt);
  const bx = Math.round(x - w / 2), by = Math.round(y - h + 0.5 - fall * fall * 60);
  if (by + h < 0) return;
  g.fillRect(bx - 1, by - 1, w + 2, h + 1, 0);       // a black moat off the crust
  g.fillRoundRect(bx, by, w, h, 1, 0);
  g.roundRect(bx, by, w, h, 1);                       // the block
  if (h >= 4) g.hline(bx + 2, by + 1, w - 4);          // its top face catching the light
}

export default {
  name: 'Toaster',
  blurb: 'A chrome toaster: the minute is branded on both sides of the slice, so each minute it pops, flips in mid-air and drops back showing the new one; on the hour the toaster leaps, the old hour skids off its plate and a fresh slice is thrown on, then buttered.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  frame(g, { date, fields: f, oled, night }) {
    const T = date.getTime() / 1000, sec = f.sec;
    const late = sec >= 30;
    const from = late ? f : previousMinute(date);
    const to = late ? clockFields(new Date(date.getTime() + 60000)) : f;
    const tau = late ? sec - 60 : sec;
    const after = tau >= 0;
    const hourTurn = to.m === 0;
    const oldKey = late ? f.minuteKey : f.minuteKey - 1;
    const [ox, oy0] = orbit(date, 2, 3);
    const oy = clamp(oy0, -1, 1);

    // the toaster: shudders before the hour, hops at the pop
    let tx = 0, ty = 0;
    if (hourTurn) {
      const sh = progress(tau, -2.2, -0.7) * (tau < H_LAUNCH ? 1 : 0);
      tx = Math.round(1.3 * sh * Math.sin(T * 47));
      ty = -Math.round(5 * Math.sin(Math.PI * progress(tau, H_LAUNCH, H_LAUNCH + 0.32)));
    } else {
      ty = -Math.round(1.4 * Math.sin(Math.PI * progress(tau, M_LAUNCH, M_LAUNCH + 0.16)));
    }
    tx += ox; ty += oy;

    const tz = toasterImage();
    // the old hour's slice, its plate, the new hour's slice
    const [hx, hy] = proj(HOUR_FOOT);
    const pcx = Math.round(hx) + 2 + ox, pcy = Math.round(hy) + oy;
    const oldH = oldHourPose(tau, hourTurn);
    if (!(hourTurn && tau > 0.35)) drawSlice(g, { ...oldH, front: String(hourTurn ? from.h : f.h), sx: ox, sy: oy });
    drawPlate(g, pcx, pcy);
    const flying = hourTurn && tau > H_LAUNCH;
    const newH = flying ? newHourPose(tau) : null;
    const behind = flying && tau < H_LAUNCH + 0.25; // still in the back slot, behind the chrome
    if (behind) drawSlice(g, { ...newH, front: null, zt: true, sx: ox + tx - ox, sy: ty, tx, ty });

    // the toaster, its coils glowing in the slots
    const glowLen = Math.round(clamp(2.5 + 1.5 * Math.sin(T * 1.3) + (tau > -1 && tau < 0.5 ? 3 : 0), 0, 6));
    for (let i = 0; i < 128 * 64; i++) {
      const x = (i & 127) + tx, y = (i >> 7) + ty;
      if (tz.lit[i]) g.pixel(x, y, 1);
      else if (tz.cls[i] === 2 && ((i & 127) + Math.floor(T * 10)) % 6 < glowLen) g.pixel(x, y, 1); // the coils, red hot
    }
    const lever = sec < 59.4 ? progress(sec, 0.6, 59.4) : 1 - progress(sec, 59.4, 59.5);
    drawKnob(g, tx, ty);
    drawLever(g, lever + 0.08 * Math.sin(T * 41) * Math.sin(T * 3.3), tx, ty);

    // the minute slice
    const mp = minutePose(tau, oldKey, hourTurn);
    const seated = Math.abs(tau - (hourTurn ? H_LAUNCH : M_LAUNCH)) < 0.25 || mp.o[1] > minuteHome()[1] - 1;
    const oldFront = (oldKey & 1) === 0;
    const mOld = after ? null : from.mm, mNew = after ? to.mm : null;
    drawSlice(g, { ...mp, front: oldFront ? mOld : mNew, back: oldFront ? mNew : mOld, zt: true,
      sx: seated ? tx : ox, sy: seated ? ty : oy, tx, ty });

    if (flying && !behind) drawSlice(g, { ...newH, front: after ? String(to.h) : null, sx: ox, sy: oy });

    // butter: dropped onto the new hour, melting until the next
    if (hourTurn && tau < 0.35) drawButter(g, oldH, 1, 1, ox, oy);
    else if (!hourTurn || tau > 0.75) {
      const drop = hourTurn ? ease.inQuad(progress(tau, 0.75, 1.1)) : 1;
      const melt = hourTurn && !after ? 1 : (f.m * 60 + sec) / 3600;
      drawButter(g, hourTurn && tau > 0 ? newHourPose(tau) : oldH, hourTurn && tau < 1.2 ? 0 : melt, drop, ox, oy);
    }

    // crumbs and steam
    drawCrumbs(g, tau, hourTurn ? H_LAUNCH : M_LAUNCH, oldKey, hourTurn ? 7 : 4, tx, ty);
    const [cx, cy] = proj(toWorld(0, SLOT_TOP, SLOT_Z[0]));
    wisp(g, cx + 31 + tx, cy - 2 + ty, T, 0, 22);
    const hp = hourTurn && tau > 0 ? newHourPose(tau) : oldH;
    const [wx, wy] = proj(add(add(hp.o, hp.b.ru, -11), hp.b.rv, 41));
    if (!hourTurn || tau > 2) wisp(g, wx + ox, wy + oy - 2, T, 2, 16);
    oled.contrast(0xcf + (0x20 - 0xcf) * night);
  },
};
