// Scissors: the time is cut out of paper by a pair of scissors in 3D.
//
// Every numeral is one polygon of straight snips, the path the blades take;
// counters are reached by a slit, the way a child cuts a paper 0. At rest the
// pieces lie on a black cutting mat (hour small at the left, minutes big), their
// corners lifting in a draught, while the scissors hover and snip the air once
// a second. On the minute the old numeral is scrunched into a ball and tossed;
// a fresh sheet slides up printed with the new numeral as a dashed cut-here
// line; the scissors cut it out snip by snip (closing blade slides the cut
// along, the lower blade passes under the sheet) and the scrap is peeled away.
// On the hour a folded strip gets three snips and the scissors pull it open
// into a chain of paper dolls that dances across the top and is hauled away.
import { noise, smoothNoise, dither, ease, clamp, lerp, progress, orbit, previousMinute } from '../js/kit.js';

const W = 128, H = 64;

// ------------------------------------------------------------ the numerals
// Each numeral is ONE polygon, the exact path a pair of scissors cuts: an
// outline of straight snips; a counter (the hole of 0 4 6 8 9) is reached by a
// slit cut in from the outside, the way a child cuts a paper 0. Units: a 10 x 16
// box, strokes ~2.8 wide.

const OUT = {
  0: [[3, 0], [7, 0], [10, 3], [10, 13], [7, 16], [3, 16], [0, 13], [0, 3]],
  1: [[5.4, 0], [8.2, 0], [8.2, 13.2], [9.9, 13.2], [9.9, 16], [2.4, 16], [2.4, 13.2], [5.4, 13.2], [5.4, 4.6], [3.2, 6.6], [1.6, 4.4]],
  2: [[3.4, 0], [7, 0], [10, 3], [10, 6.6], [4.7, 13.2], [10, 13.2], [10, 16], [0, 16], [0, 13.4], [7.2, 5.6], [7.2, 3.8], [6.2, 2.8], [3.9, 2.8], [2.8, 4.3], [0.1, 3.4]],
  3: [[0.6, 0], [9.6, 0], [9.6, 2.5], [6.1, 6.0], [7.1, 6.0], [10, 9], [10, 13], [7, 16], [3, 16], [0, 13], [0, 12.4], [2.8, 11.7], [3.8, 13.2], [6.2, 13.2], [7.2, 12.2], [7.2, 9.8], [6.2, 8.8], [2.4, 8.8], [2.4, 6.3], [5.6, 2.8], [0.6, 2.8]],
  4: [[5.3, 0], [8.6, 0], [8.6, 9.9], [10, 9.9], [10, 12.7], [8.6, 12.7], [8.6, 16], [5.8, 16], [5.8, 12.7], [0, 12.7], [0, 10.2]],
  5: [[1, 0], [9.6, 0], [9.6, 2.8], [3.7, 2.8], [3.5, 5.8], [7, 5.8], [10, 8.8], [10, 13], [7, 16], [3, 16], [0, 13], [0, 12], [2.8, 11.3], [3.8, 13.2], [6.2, 13.2], [7.2, 12.2], [7.2, 9.6], [6.2, 8.6], [0.7, 8.6]],
  6: [[5.6, 0], [8.9, 0], [5.1, 5.8], [7, 5.8], [10, 8.8], [10, 13], [7, 16], [3, 16], [0, 13], [0, 9.3]],
  7: [[0, 0], [10, 0], [10, 2.6], [5.3, 16], [2.2, 16], [6.6, 2.8], [0, 2.8]],
  8: [[3, 0], [7, 0], [9.6, 2.6], [9.6, 5.6], [8.0, 7.3], [10, 9.3], [10, 13], [7, 16], [3, 16], [0, 13], [0, 9.3], [2.0, 7.3], [0.4, 5.6], [0.4, 2.6]],
};
// Counters: [polygon, outer vertex the slit starts at, counter vertex it ends at].
const CTR = {
  0: [[[3.8, 2.8], [6.2, 2.8], [7.2, 3.8], [7.2, 12.2], [6.2, 13.2], [3.8, 13.2], [2.8, 12.2], [2.8, 3.8]], [3, 16], [3.8, 13.2]],
  4: [[[5.8, 3.3], [5.8, 9.9], [2.9, 9.9]], [0, 10.2], [2.9, 9.9]],
  6: [[[3.8, 8.6], [6.2, 8.6], [7.2, 9.6], [7.2, 12.2], [6.2, 13.2], [3.8, 13.2], [2.8, 12.2], [2.8, 9.6]], [3, 16], [3.8, 13.2]],
  8: [[[3.8, 2.7], [6.2, 2.7], [6.9, 3.4], [6.9, 5.0], [6.1, 5.8], [3.9, 5.8], [3.1, 5.0], [3.1, 3.4]], [0.4, 2.6], [3.1, 3.4]],
  88: [[[3.8, 8.8], [6.2, 8.8], [7.2, 9.8], [7.2, 12.4], [6.2, 13.4], [3.8, 13.4], [2.8, 12.4], [2.8, 9.8]], [10, 13], [7.2, 12.4]],
};

const same = (a, b) => Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;
const SLIT = 0.42; // slit width in units: about a pixel at minute size

/** Splice a counter into an outline through a slit of width SLIT. */
function splice(outer, [ctr, a, b]) {
  const ia = outer.findIndex((p) => same(p, a));
  const ib = ctr.findIndex((p) => same(p, b));
  const A = outer[ia], B = ctr[ib];
  const dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy);
  const nx = (-dy / L) * SLIT / 2, ny = (dx / L) * SLIT / 2;
  // The side of the slit nearer the vertex before A comes first.
  const prev = outer[(ia - 1 + outer.length) % outer.length];
  let s = 1;
  if (Math.hypot(A[0] + nx - prev[0], A[1] + ny - prev[1]) > Math.hypot(A[0] - nx - prev[0], A[1] - ny - prev[1])) s = -1;
  const A1 = [A[0] + s * nx, A[1] + s * ny], B1 = [B[0] + s * nx, B[1] + s * ny];
  const A2 = [A[0] - s * nx, A[1] - s * ny], B2 = [B[0] - s * nx, B[1] - s * ny];
  // Walk the counter the other way round, from B back to B.
  const ring = [];
  for (let k = 1; k < ctr.length; k++) ring.push(ctr[(ib - k + ctr.length * 2) % ctr.length]);
  return [...outer.slice(0, ia), A1, B1, ...ring, B2, A2, ...outer.slice(ia + 1)];
}

const DIGITS = [];
for (let d = 0; d <= 9; d++) {
  let poly;
  if (d === 9) poly = DIGITS[6].map(([x, y]) => [10 - x, 16 - y]);
  else {
    poly = OUT[d].map((p) => p.slice());
    if (CTR[d]) poly = splice(poly, CTR[d]);
    if (d === 8) poly = splice(poly, CTR[88]);
  }
  DIGITS[d] = poly;
}
// A hand-cut wobble, the same for every copy of a digit.
const HAND = DIGITS.map((poly, d) => poly.map(([x, y]) => [
  x + (noise(x * 3.1 + y * 7.7, d) - 0.5) * 0.22,
  y + (noise(x * 5.3 + y * 2.9, d + 11) - 0.5) * 0.22,
]));

/** Split edges so no piece is longer than `step` (units): bends follow warps. */
function subdivide(poly, step) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let k = 0; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  return out;
}
const FINE = HAND.map((p) => subdivide(p, 1.1));

/**
 * The digit's cut path in screen space: scale s px/unit, rotated by rot about
 * the box centre. warp(u, v) (px in the box) returns a [dx, dy] lift offset.
 */
export function digitPoly(d, x, y, s, rot = 0, warp = null) {
  const c = Math.cos(rot), si = Math.sin(rot), cx = 5 * s, cy = 8 * s;
  return (warp ? FINE : HAND)[d].map(([u, v]) => {
    let px = u * s, py = v * s;
    if (warp) { const [wx, wy] = warp(px, py); px += wx; py += wy; }
    px -= cx; py -= cy;
    return [x + cx + px * c - py * si, y + cy + px * si + py * c];
  });
}

// ------------------------------------------------------------ raster layer
// Pieces of paper are filled into a mask (even-odd within one call, OR across
// calls), then composited with a one-pixel black moat so paper on paper reads.

const MASK = new Uint8Array(W * H);
let bx0, by0, bx1, by1;
function begin() { bx0 = W; by0 = H; bx1 = -1; by1 = -1; }
function add(polys) {
  let miny = 1e9, maxy = -1e9;
  for (const p of polys) for (const q of p) { if (q[1] < miny) miny = q[1]; if (q[1] > maxy) maxy = q[1]; }
  const y0 = Math.max(0, Math.floor(miny)), y1 = Math.min(H - 1, Math.ceil(maxy));
  const xs = [];
  for (let y = y0; y <= y1; y++) {
    const cy = y + 0.5; xs.length = 0;
    for (const p of polys) for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      const yi = p[i][1], yj = p[j][1];
      if ((yi > cy) !== (yj > cy)) xs.push(p[i][0] + ((cy - yi) * (p[j][0] - p[i][0])) / (yj - yi));
    }
    if (xs.length < 2) continue;
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const a = Math.max(0, Math.ceil(xs[k] - 0.5)), b = Math.min(W - 1, Math.ceil(xs[k + 1] - 0.5) - 1);
      if (b < a) continue;
      const row = y * W;
      for (let x = a; x <= b; x++) MASK[row + x] ^= 1;
      if (a < bx0) bx0 = a; if (b > bx1) bx1 = b; if (y < by0) by0 = y; if (y > by1) by1 = y;
    }
  }
}
// OR semantics across calls: XOR inside one call gives even-odd; commit()
// folds the call into bit 1 so the next call starts clean.
function commit() {
  if (bx1 < 0) return;
  for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) {
    const i = y * W + x; if (MASK[i] & 1) MASK[i] = 2; else if (MASK[i] !== 2) MASK[i] = 0;
  }
}
function fill(polys) { add(polys); commit(); }
/** Composite the mask: moat, then light (level(x,y) -> 0..1 dither, default solid). */
function flush(g, level = null, moat = 1, dx = 0, dy = 0) {
  if (bx1 < 0) return;
  const buf = g.buf;
  const x0 = Math.max(0, bx0 - 1), x1 = Math.min(W - 1, bx1 + 1), y0 = Math.max(0, by0 - 1), y1 = Math.min(H - 1, by1 + 1);
  if (moat) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = y * W + x;
    if (MASK[i]) continue;
    if ((x > 0 && MASK[i - 1]) || (x < W - 1 && MASK[i + 1]) || (y > 0 && MASK[i - W]) || (y < H - 1 && MASK[i + W])) buf[i] = 0;
  }
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = y * W + x;
    if (!MASK[i]) continue;
    MASK[i] = 0;
    if (level === 'xor') buf[i] ^= 1;
    else if (!level) buf[i] = 1;
    else { const v = typeof level === 'number' ? level : level(x + 0.5, y + 0.5); buf[i] = v >= 1 || dither(x - dx, y - dy, v) ? 1 : 0; }
  }
}
function piece(g, polys, level, moat = 1) { begin(); fill(polys); flush(g, level, moat); }


// ------------------------------------------------------------ geometry helpers
const rotP = ([x, y], cx, cy, a) => {
  const c = Math.cos(a), s = Math.sin(a), dx = x - cx, dy = y - cy;
  return [cx + dx * c - dy * s, cy + dx * s + dy * c];
};
const ellipse = (cx, cy, rx, ry, n = 12) => Array.from({ length: n }, (_, k) => [cx + rx * Math.cos((k / n) * 2 * Math.PI), cy + ry * Math.sin((k / n) * 2 * Math.PI)]);
const rect = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
const angLerp = (a, b, u) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * u; };

function mkPath(pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, cum, len: cum[cum.length - 1] };
}
/** Point at arc length s, extrapolating straight past either end. */
function at(P, s) {
  const { pts, cum, len } = P, n = pts.length;
  let i;
  if (s <= 0) i = 1;
  else if (s >= len) i = n - 1;
  else { i = 1; while (cum[i] < s) i++; }
  const a = pts[i - 1], b = pts[i], d = cum[i] - cum[i - 1] || 1, u = (s - cum[i - 1]) / d;
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
}

// ------------------------------------------------------------ the scissors
// Real 3D: two rigid halves (blade + shank + finger ring) turn about the
// pivot screw in the scissors' own plane; the plane is rolled about the
// blade axis and the whole thing is projected obliquely (height lifts it up
// the screen). When cutting, the lower blade is under the sheet.
const BL = 24;             // pivot to tip
const D0 = 2;              // where the blades cross when fully open
const SMAX = BL - 3 - D0;  // the longest single snip
const AMAX = 0.30;         // half-opening, radians
const BLADE = [[-3, -0.4], [BL, -0.3], [BL - 4, 2.2], [10, 4.4], [1, 4.6], [-3, 3.0]];
const SHANK = [[-0.5, 2.0], [-2.2, -1.8], [-8.6, -5.2], [-9.4, -1.8]];
const RING_O = ellipse(-14.2, -4.8, 6.4, 4.8, 16), RING_I = ellipse(-14.4, -4.8, 3.6, 2.2, 12);
const ZK = 0.75;           // screen rise per unit of height

function scissorsParts(pose) {
  const { x, y, z, psi, roll, alpha } = pose;
  const f = [Math.cos(psi), Math.sin(psi), 0];
  const l = [-Math.sin(psi) * Math.cos(roll), Math.cos(psi) * Math.cos(roll), Math.sin(roll)];
  const half = (side) => {
    const a = side * alpha, ca = Math.cos(a), sa = Math.sin(a);
    const xf = ([u, v]) => {
      v *= side;
      const u2 = u * ca - v * sa, v2 = u * sa + v * ca;
      const X = x + f[0] * u2 + l[0] * v2, Y = y + f[1] * u2 + l[1] * v2, Z = z + l[2] * v2;
      return [X, Y - ZK * Z, Z];
    };
    const mz = (poly) => poly.reduce((acc, q) => acc + xf(q)[2], 0) / poly.length;
    return {
      blade: { polys: [BLADE.map(xf)], z: mz(BLADE) },
      ring: { polys: [[...SHANK.map(xf)]], ring: [RING_O.map(xf), RING_I.map(xf)], z: mz(RING_O) },
    };
  };
  const A = half(1), B = half(-1);
  const parts = [A.blade, A.ring, B.blade, B.ring];
  const lo = parts.filter((p) => p.z < z), hi = parts.filter((p) => p.z >= z);
  return { lo, hi, pivot: [x, y - ZK * z] };
}
function drawGroup(g, group, level, moat = 1) {
  if (!group.length) return;
  begin();
  for (const p of group) { for (const q of p.polys) fill([q]); if (p.ring) fill(p.ring); }
  flush(g, level, moat);
}
const idlePose = (T) => ({
  x: 29 + 2.5 * Math.sin(T * 0.7), y: 10 + 1.4 * Math.sin(T * 0.53 + 1), z: 5 + 1.2 * Math.sin(T * 0.9),
  psi: -0.14 + 0.07 * Math.sin(T * 0.37), roll: -0.25 + 0.15 * Math.sin(T * 0.29), alpha: 0.22,
});
const lerpPose = (a, b, u, hop = 0) => ({
  x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u), z: lerp(a.z, b.z, u) + hop * 4 * u * (1 - u),
  psi: angLerp(a.psi, b.psi, u), roll: lerp(a.roll, b.roll, u), alpha: lerp(a.alpha, b.alpha, u),
});

// ------------------------------------------------------------ the scene
const MS = 3, HS = 1.9;                     // px per unit: minutes, hours
const SLOTS = [
  { x: 5, y: 29, s: HS, rot: -0.07, grp: 0 }, // hour tens
  { x: 26, y: 26.5, s: HS, rot: -0.07, grp: 0 }, // hour units
  { x: 58, y: 13, s: MS, rot: 0, grp: 1 },
  { x: 93, y: 13, s: MS, rot: 0, grp: 1 },
];
const digitsOf = (f) => [Math.floor(f.h / 10), f.h % 10, Math.floor(f.m / 10), f.m % 10];
const restRot = (k, d) => SLOTS[k].rot + (noise(k * 13 + d * 3.7, 5) - 0.5) * 0.09;

/** A corner of the paper lifting in the draught: [warp, level] for one piece. */
function flutter(k, T) {
  const sl = SLOTS[k], w = 10 * sl.s, h = 16 * sl.s;
  const gust = smoothNoise(T * 0.45 + k * 7.3, 3 + k);
  const A = (sl.s === MS ? 7 : 4) * clamp((gust - 0.35) / 0.5, 0, 1) ** 1.5 + 0.6 * Math.sin(T * 2.1 + k);
  const right = k % 2 === 1;
  const lift = (u, v) => {
    const q = clamp(((right ? u / w : 1 - u / w) + (1 - v / h)) - 1.25, 0, 0.75) / 0.75;
    return A * q * q;
  };
  const warp = (u, v) => { const z = lift(u, v); return [(right ? 0.25 : -0.25) * z, -ZK * z]; };
  return { warp, lift, A };
}

// ------------------------------------------------------------ the doll chain
const DS = 0.62, PW = 16 * DS, PH = 26 * DS, NP = 11, GY = -1;
const DOLL = [
  ellipse(8, 4.2, 3.4, 3.7, 12),
  rect(6.8, 6.5, 2.4, 3),
  rect(0, 8.8, 16, 3),
  [[5.4, 9], [10.6, 9], [14, 20], [2, 20]],
  rect(4.4, 19, 3, 7), rect(8.6, 19, 3, 7),
].map((p) => p.map(([u, v]) => [u * DS, v * DS]));
function garlandEnd(G) {
  const gam = G.o * (Math.PI - 0.32);
  let x = 0, z = 0, mn = 0, mx = 0;
  for (let i = 0; i < NP; i++) { const phi = i % 2 ? Math.PI - gam : 0; x += PW * Math.cos(phi); z += PW * Math.sin(phi); mn = Math.min(mn, x); mx = Math.max(mx, x); }
  const shift = 64 - (mn + mx) / 2, run = 150 * ease.inQuad(G.exit);
  return [shift + run + x, GY - (1 - G.slide) * 24 + 10 * DS - 0.35 * z];
}
function drawGarland(g, G, T) {
  // panel 0 faces the front; odd panels fold back behind it (a concertina)
  const gam = G.o * (Math.PI - 0.32);
  const hinge = [[0, 0]];
  for (let i = 0; i < NP; i++) {
    const phi = i % 2 ? Math.PI - gam : 0;
    hinge.push([hinge[i][0] + PW * Math.cos(phi), hinge[i][1] + PW * Math.sin(phi)]);
  }
  let mn = 1e9, mx = -1e9;
  for (const h of hinge) { mn = Math.min(mn, h[0]); mx = Math.max(mx, h[0]); }
  const shift = 64 - (mn + mx) / 2;
  const panels = [];
  for (let i = 0; i < NP; i++) {
    const phi = i % 2 ? Math.PI - gam : 0, c = Math.cos(phi), s = Math.sin(phi);
    const bob = 2.2 * Math.max(0, Math.sin(G.dance * 18 - i * 0.9)) * Math.sin(Math.PI * G.dance);
    const run = 150 * ease.inQuad(G.exit);
    const top = GY - (1 - G.slide) * 24 + bob;
    const xf = ([u, v]) => {
      const X = shift + run + hinge[i][0] + u * c, Z = hinge[i][1] + u * s;
      return [X, top + v - 0.35 * Z];
    };
    const polys = DOLL.map((p) => p.map(xf));
    if (G.vcut < PH) polys.push(rect(0, G.vcut, PW, PH - G.vcut).map(xf));
    panels.push({ i, polys, z: hinge[i][1] + (PW / 2) * s });
  }
  panels.sort((a, b) => a.z - b.z);
  for (const p of panels) {
    begin();
    for (const q of p.polys) fill([q]);
    flush(g, null, 1);
  }
}

export default {
  name: 'Scissors',
  blurb: 'A pair of scissors in 3D cuts the time out of paper: each minute the old numeral is scrunched up and tossed, the new one cut snip by snip along its dashed line; on the hour a chain of paper dolls.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,

  frame(g, ctx) {
    const { date, fields: f, oled, night } = ctx;
    oled.contrast(0xcf + (0x20 - 0xcf) * night);
    const T = (date.getTime() / 1000) % 86400;
    const [ox, oy] = orbit(date, 2, 3);
    const sec = f.sec;
    const cur = digitsOf(f), prev = digitsOf(previousMinute(date));
    const changed = [0, 1, 2, 3].filter((k) => cur[k] !== prev[k]);
    const hourTurn = f.m === 0;

    // ---- the cutting episode, planned from the start of the minute
    const tSheet0 = 0.15, tSheet1 = 0.6, tCut = 0.62;
    const sheets = [0, 1].map((grp) => {
      const ks = changed.filter((k) => SLOTS[k].grp === grp);
      if (!ks.length) return null;
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (const k of ks) { const sl = SLOTS[k]; x0 = Math.min(x0, sl.x); x1 = Math.max(x1, sl.x + 10 * sl.s); y0 = Math.min(y0, sl.y); y1 = Math.max(y1, sl.y + 16 * sl.s); }
      return { ks, x: x0 - 3 + ox, y: y0 - 3 + oy, w: x1 - x0 + 6, h: y1 - y0 + 6 };
    });
    const cuts = changed.map((k) => {
      const sl = SLOTS[k], d = cur[k], sh = sheets[sl.grp];
      const poly = digitPoly(d, sl.x + ox, sl.y + oy, sl.s, restRot(k, d));
      let st = 0;
      for (let i = 1; i < poly.length; i++) if (poly[i][1] > poly[st][1] + 0.3 || (Math.abs(poly[i][1] - poly[st][1]) <= 0.3 && Math.abs(poly[i][0] - sl.x - 5 * sl.s) < Math.abs(poly[st][0] - sl.x - 5 * sl.s))) st = i;
      const ring = [...poly.slice(st), ...poly.slice(0, st + 1)];
      const entry = [ring[0][0], sh.y + sh.h + 1];
      const path = mkPath([entry, ...ring]);
      return { k, d, poly, path, entryLen: path.cum[1], n: Math.ceil(path.len / SMAX) };
    });
    const FLY = 0.16, budget = hourTurn ? 3.4 : 1.9;
    const N = cuts.reduce((a, c) => a + c.n, 0);
    const tau = N ? Math.min(0.12, (budget - FLY * (cuts.length - 1)) / N) : 0;
    let tt = tCut;
    for (let i = 0; i < cuts.length; i++) { if (i) tt += FLY; cuts[i].t0 = tt; tt += cuts[i].n * tau; cuts[i].t1 = tt; }
    const tEnd = tt, tPeel = 0.5, tHome = 0.4;
    const g0 = tEnd + tPeel;
    const episode = changed.length ? (hourTurn ? g0 + 5.0 : g0 + 0.1) : 0;
    const inEp = sec < episode;
    const t = sec;

    // cut state of one item at time t: { c, p, alpha }
    const cutState = (cu) => {
      if (t <= cu.t0) return { c: 0, p: -D0, alpha: AMAX };
      if (t >= cu.t1) return { c: cu.path.len, p: cu.path.len - D0, alpha: AMAX, done: true };
      const sl = cu.path.len / cu.n, lt = (t - cu.t0) / tau, k = Math.floor(lt), ph = lt - k;
      let c, d;
      if (ph < 0.62) { const e = ease.inOutQuad(ph / 0.62); c = k * sl + sl * e; d = D0 + sl * e; }
      else { const e = ease.outCubic((ph - 0.62) / 0.38); c = (k + 1) * sl; d = D0 + sl * (1 - e); }
      return { c, p: c - d, alpha: AMAX * (1 - (d - D0) / SMAX) };
    };
    const cutPose = (cu, st) => {
      const pv = at(cu.path, st.p), a = at(cu.path, st.p - 3), b = at(cu.path, st.c + 1.5);
      return { x: pv[0], y: pv[1], z: 0, psi: Math.atan2(b[1] - a[1], b[0] - a[0]), roll: -0.4, alpha: st.alpha };
    };

    // ---- the scissors' pose
    let pose = idlePose(T), cutting = false;
    // the idle habit: a snip in the air every second
    {
      const ph = sec % 1;
      if (ph < 0.16) pose.alpha = lerp(0.22, 0.02, ease.inQuad(ph / 0.16));
      else if (ph < 0.42) pose.alpha = lerp(0.02, 0.22, ease.outCubic((ph - 0.16) / 0.26));
    }
    if (inEp && cuts.length) {
      const first = cuts[0], last = cuts[cuts.length - 1];
      if (t >= 0.3 && t < first.t0) pose = lerpPose(pose, cutPose(first, cutState(first)), ease.inOutCubic(progress(t, 0.3, first.t0)), 8);
      else if (t >= first.t0 && t < tEnd) {
        cutting = true;
        let i = cuts.findIndex((c) => t < c.t1);
        const cu = cuts[i];
        if (t < cu.t0) { const pr = cuts[i - 1]; pose = lerpPose(cutPose(pr, cutState(pr)), cutPose(cu, cutState(cu)), ease.inOutQuad(progress(t, pr.t1, cu.t0)), 7); }
        else pose = cutPose(cu, cutState(cu));
      } else if (t >= tEnd && t < tEnd + tHome) pose = lerpPose(cutPose(last, cutState(last)), pose, ease.inOutCubic(progress(t, tEnd, tEnd + tHome)), 8);
    }

    // ---- the hour show: a folded strip, three snips, a chain of paper dolls
    let garland = null;
    if (hourTurn && inEp && t >= g0) {
      const vcut = PH * ease.inOutQuad(progress(t, g0 + 0.4, g0 + 1.0));
      const o = ease.outBack(progress(t, g0 + 1.3, g0 + 2.2));
      garland = { slide: ease.outCubic(progress(t, g0, g0 + 0.35)), vcut, o,
        dance: progress(t, g0 + 1.6, g0 + 3.4), exit: progress(t, g0 + 3.2, g0 + 4.1) };
      if (t >= g0 + 0.2 && t < g0 + 1.45) {
        const sx = 64 + PW / 2 + 1, top = GY - (1 - garland.slide) * 24;
        const snipAt = (vv) => ({ x: sx - 2, y: top + vv, z: 0, psi: Math.PI / 2 + 0.25, roll: -0.7,
          alpha: AMAX * (0.5 + 0.5 * Math.cos(((t - g0 - 0.4) / 0.2) * 2 * Math.PI)) });
        const sp = snipAt(clamp(vcut, 0, PH));
        if (t < g0 + 0.4) pose = lerpPose(pose, snipAt(0), ease.inOutCubic(progress(t, g0 + 0.2, g0 + 0.4)), 6);
        else if (t < g0 + 1.05) pose = sp;
      }
      // then the scissors take the last doll by the hand and pull the chain open, and away
      const grip = () => { const [ex, ey] = garlandEnd(garland); return { x: ex + 3, y: ey, z: 2, psi: Math.PI + 0.1, roll: -0.35, alpha: 0.03 }; };
      if (t >= g0 + 1.05 && t < g0 + 1.3) pose = lerpPose(pose, grip(), ease.inOutQuad(progress(t, g0 + 1.05, g0 + 1.3)), 4);
      else if (t >= g0 + 1.3 && t < g0 + 4.1) pose = grip();
    }

    // ---- background: the cutting mat's ruler
    for (let x = 2; x < W; x += 4) g.pixel(x + ox, H - 1);

    // ---- pieces at rest (unchanged, or cut and freed)
    const freed = !inEp || t >= tEnd;
    for (let k = 0; k < 4; k++) {
      if (inEp && changed.includes(k) && !freed) continue;
      const sl = SLOTS[k], d = cur[k], fl = flutter(k, T), rot = restRot(k, d);
      const w = 10 * sl.s, h = 16 * sl.s, c = Math.cos(-rot), s = Math.sin(-rot);
      const bx = sl.x + ox, by = sl.y + oy;
      const level = (px, py) => {
        // back to box coordinates; shade the lifted corner by its slope
        const dx = px - bx - w / 2, dy = py - by - h / 2;
        const u = w / 2 + dx * c - dy * s, v = h / 2 + dx * s + dy * c;
        const sl2 = fl.lift(u + 1, v) - fl.lift(u - 1, v) + fl.lift(u, v - 1) - fl.lift(u, v + 1);
        return 1 - clamp(Math.abs(sl2) * 0.35, 0, 0.55);
      };
      piece(g, [digitPoly(d, bx, by, sl.s, rot, fl.warp)], null);
    }

    if (hourTurn && t >= g0 + 4.1 && t < g0 + 5.0) {
      const u = ease.outCubic(progress(t, g0 + 4.1, g0 + 5.0));
      pose = { ...pose, x: lerp(-30, pose.x, u), psi: pose.psi + (1 - u) * 0.3 };
    }
    const sc = scissorsParts(pose);
    if (cutting) drawGroup(g, sc.lo, null);

    // ---- sheets: slide in, carry the dashed guide, take the cut, peel away
    if (inEp) for (const sh of sheets) {
      if (!sh) continue;
      const myCuts = cuts.filter((c) => sh.ks.includes(c.k));
      const slide = ease.outCubic(progress(t, tSheet0, tSheet1));
      const peel = ease.inCubic(progress(t, tEnd, tEnd + tPeel));
      if (slide <= 0 || peel >= 1) continue;
      const cx = sh.x, cy = sh.y + sh.h;
      const xf = (p) => {
        let q = [p[0], p[1] + (1 - slide) * 70];
        q = rotP(q, cx + sh.w, cy + (1 - slide) * 70, (1 - slide) * 0.18 - peel * 0.22);
        return [q[0] + peel * 6, q[1] + peel * 72];
      };
      const box = rect(sh.x, sh.y, sh.w, sh.h).map(xf);
      begin();
      if (peel > 0) add([box, ...myCuts.map((c) => c.poly.map(xf))]); else add([box]);
      commit();
      flush(g, null);
      // guide and cut lines
      for (const cu of myCuts) {
        const st = cutState(cu);
        for (let s = 0; s < cu.path.len; s += 0.6) {
          const inCut = s <= st.c;
          if (!inCut && (s < cu.entryLen || (s % 4) > 1.8)) continue;
          if (peel > 0 && s > cu.entryLen) continue;
          const q = xf(at(cu.path, s)), X = Math.floor(q[0]), Y = Math.floor(q[1]);
          if (X >= 0 && X < W && Y >= 0 && Y < H) g.buf[Y * W + X] = 0;
        }
      }
    }

    if (garland) drawGarland(g, garland, T);
    if (cutting) drawGroup(g, sc.hi, null);
    else drawGroup(g, [...sc.lo, ...sc.hi], null);
    { const X = Math.floor(sc.pivot[0]), Y = Math.floor(sc.pivot[1]); if (X >= 0 && X < W && Y >= 0 && Y < H) g.buf[Y * W + X] = 0; }

    // ---- the old numerals: crumpled and tossed
    if (inEp) for (const k of changed) {
      const sl = SLOTS[k], d = prev[k];
      const cr = ease.inOutQuad(progress(t, 0, 0.45)), fly = progress(t, 0.32, 1.15);
      if (fly >= 1) continue;
      const poly = digitPoly(d, sl.x + ox, sl.y + oy, sl.s, restRot(k, d), () => [0, 0]);
      const c0 = [sl.x + ox + 5 * sl.s, sl.y + oy + 8 * sl.s];
      const R = sl.s === MS ? 8.5 : 6, seed = f.minuteKey + k;
      const left = noise(seed, 9) < 0.6;
      const tgt = left ? [-18, 8] : [W + 16, 6];
      const e = ease.inQuad(fly);
      const z = 34 * 4 * fly * (1 - fly) * (sl.s === MS ? 1 : 0.6);
      const sc2 = 1 + z / 70;
      const cx = lerp(c0[0], tgt[0], e), cy = lerp(c0[1], tgt[1], e) - ZK * z;
      const spin = fly * 9 * (left ? -1 : 1) + cr * 0.8;
      begin();
      if (cr < 0.75) {
        // the numeral scrunches: shrinks, twists and buckles toward its middle
        const q = cr / 0.75, sz = lerp(1, 0.3, ease.inQuad(q));
        fill([poly.map(([x, y]) => {
          const dx = x - c0[0], dy = y - c0[1];
          const n1 = smoothNoise(x * 0.25 + 3, seed) - 0.5, n2 = smoothNoise(y * 0.25 + 9, seed + 1) - 0.5;
          const p2 = rotP([c0[0] + dx * sz + n1 * 8 * q, c0[1] + dy * sz + n2 * 8 * q], c0[0], c0[1], q * 0.9 * (left ? -1 : 1));
          return p2;
        })]);
      }
      const rb = R * clamp((cr - 0.35) / 0.5, 0, 1) * sc2;
      const ball = [];
      if (rb > 0.5) {
        for (let i = 0; i < 11; i++) {
          const a = (i / 11) * 2 * Math.PI + spin, r = rb * (0.78 + 0.32 * noise(i * 1.37, seed));
          ball.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
        }
        fill([ball]);
      }
      flush(g, null);
      // creases on the ball
      if (rb > 4.5) for (let j = 0; j < 2; j++) {
        const a = spin + j * 3.0 + noise(j, seed) * 1.5, r1 = rb * 0.75, r0 = rb * 0.1;
        g.line(Math.round(cx + r0 * Math.cos(a + 1)), Math.round(cy + r0 * Math.sin(a + 1)), Math.round(cx + r1 * Math.cos(a)), Math.round(cy + r1 * Math.sin(a)), 0);
      }
    }
  },
};
