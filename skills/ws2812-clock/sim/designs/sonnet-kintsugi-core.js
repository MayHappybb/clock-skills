// Kintsugi geometry: the bowl, the chip the cracks run from, where each
// digit sits, and turning a digit's clean centre-line (sonnet-kintsugi-
// glyphs.js) into a jagged, tapering, deterministic fracture polyline with
// occasional dead-end branch spurs. Pure data/geometry; sonnet-kintsugi.js
// does the lighting and animation.
import * as kit from '../js/kit.js';
import { GLYPHS, BOX } from './sonnet-kintsugi-glyphs.js';

const W = 64, N = W * W;

// ------------------------------------------------------------- palette
const GLAZE_DEEP = kit.hex('#141b30');     // deep glaze, blue-black - this is linear-light output
                                            // straight to 8 bits, no sRGB gamma lift, so true darkness
                                            // is reserved for the shadow side; the window pool carries
                                            // the dim-end floor instead of flattening the whole bowl
const GLAZE_LIT = kit.hex('#5a70ac');      // where the window catches it: a real, bright highlight
const FOOT = kit.hex('#283048');           // speckled foot ring, dim but not crushed
const GOLD = kit.hex('#e8a63c');           // lacquer, mid
const GOLD_HOT = kit.hex('#fff2c8');       // meniscus / glint hot core
const GOLD_DARK = kit.hex('#6b4312');      // lacquer in shadow
const WINDOW = kit.blackbody(5600);

// ------------------------------------------------------------- geometry
const CX = 32, CY = 34, R_BOWL = 30.5;              // the bowl, slightly off-centre
const CHIP = [32, 8];                               // the old chip the cracks run from, top of the rim

// Where each digit slot sits: centre (grid cells), scale (1 = the glyph's
// native 12 x 22 box) and rotation (radians). HH on the top row, MM on the
// bottom row - the way a clock is actually read - tens to the left of ones
// in each row, while the cracks of all four still climb back toward the
// shared chip at top centre, each row leaning slightly off it like real
// fault lines off one point.
const SLOTS = [
  { cx: 15, cy: 21, s: 1.0, rot: -0.07 },   // H tens: top row, left
  { cx: 49, cy: 21, s: 1.0, rot: 0.07 },    // H ones: top row, right
  { cx: 15, cy: 46, s: 1.0, rot: -0.03 },   // M tens: bottom row, left
  { cx: 49, cy: 46, s: 1.0, rot: 0.03 },    // M ones: bottom row, right
];

const pad = (n) => String(n).padStart(2, '0');
const digitsOf = (d) => (pad(d.getHours()) + pad(d.getMinutes())).split('').map(Number);

// --------------------------------------------------------- crack shaping
/** Resample a polyline to ~even steps, returning [[x,y,s],...] with s = arc length so far. */
function resample(pts, step) {
  const out = [[pts[0][0], pts[0][1], 0]];
  let acc = 0;
  for (let k = 0; k + 1 < pts.length; k++) {
    const [ax, ay] = pts[k], [bx, by] = pts[k + 1];
    const segLen = Math.hypot(bx - ax, by - ay);
    if (segLen < 1e-6) continue;
    let t = step - (acc % step || step);
    if (t > segLen) { acc += segLen; continue; }
    for (; t <= segLen; t += step) {
      const u = t / segLen;
      out.push([ax + (bx - ax) * u, ay + (by - ay) * u, acc + t]);
    }
    acc += segLen;
  }
  const last = pts[pts.length - 1];
  out.push([last[0], last[1], acc]);
  return out;
}

/**
 * Build a jagged fracture polyline from a digit's clean paths: resample
 * fine, offset each point sideways by a hash-driven staircase (held between
 * jumps, not smooth, so it reads as micro-fault steps) that tapers to zero
 * at both ends of each stroke, plus occasional short dead-end branch spurs.
 * Deterministic per (digit, pathIndex) - cached once.
 */
const crackCache = new Map();
function crackFor(d, pi, path) {
  const key = d * 8 + pi;
  if (crackCache.has(key)) return crackCache.get(key);
  const base = resample(path.pts, 0.55);
  const total = base[base.length - 1][2];
  const pts = [];
  let stepOff = 0, nextJump = 0;
  const branches = [];
  for (let k = 0; k < base.length; k++) {
    const [x, y, s] = base[k];
    if (s >= nextJump) {
      stepOff = (kit.hash(d, pi, k) - 0.5) * 0.42;
      nextJump = s + 1.8 + kit.hash(d, pi, k, 7) * 1.6;
    }
    // tangent direction for a perpendicular offset
    const k0 = Math.max(0, k - 1), k1 = Math.min(base.length - 1, k + 1);
    const tx = base[k1][0] - base[k0][0], ty = base[k1][1] - base[k0][1];
    const tl = Math.hypot(tx, ty) || 1;
    const nx = -ty / tl, ny = tx / tl;
    const taper = Math.min(1, s / 1.1) * Math.min(1, (total - s) / 1.1);
    const jag = (kit.hash(d, pi, k, 13) - 0.5) * 0.1; // fine grain roughness
    const off = (stepOff + jag) * taper;
    pts.push([x + nx * off, y + ny * off, s]);
    // rare short branch spur off a mid-path point: a dead-end hairline, as
    // real fired clay throws off a side crack where it broke
    if (taper > 0.6 && kit.hash(d, pi, k, 31) > 0.975) {
      const len = 0.8 + kit.hash(d, pi, k, 37) * 0.8;
      const dir = (kit.hash(d, pi, k, 41) > 0.5 ? 1 : -1);
      branches.push([[x, y], [x + nx * len * dir + tx / tl * 0.4, y + ny * len * dir + ty / tl * 0.4]]);
    }
  }
  const v = { pts, total, branches };
  crackCache.set(key, v);
  return v;
}

/** All cracks of digit d (array of {pts,total,branches}), cached. */
const digitCache = new Map();
function digitCracks(d) {
  if (digitCache.has(d)) return digitCache.get(d);
  const v = GLYPHS[d].map((path, pi) => crackFor(d, pi, path));
  digitCache.set(d, v);
  return v;
}

/** Transform a glyph-space point into grid space for a slot. */
function toGrid(slot, x, y) {
  const ox = x - BOX.w / 2, oy = y - BOX.h / 2;
  const c = Math.cos(slot.rot), s = Math.sin(slot.rot);
  return [slot.cx + (ox * c - oy * s) * slot.s, slot.cy + (ox * s + oy * c) * slot.s];
}

/**
 * Flatten a digit's cracks into world segments at a slot, each tagged with
 * cumulative arc-length fraction 0..1 across the WHOLE digit (so a reveal
 * can race across every stroke together) and whether it's a branch spur
 * (spurs appear only once the main line nearby has revealed).
 */
const segCache = new Map();
function slotSegs(d, slot, slotIdx) {
  const key = slotIdx * 10 + d;
  if (segCache.has(key)) return segCache.get(key);
  const cracks = digitCracks(d);
  let totalLen = 0; for (const c of cracks) totalLen += c.total;
  const segs = [];
  let base = 0;
  for (const c of cracks) {
    for (let k = 0; k + 1 < c.pts.length; k++) {
      const a = c.pts[k], b = c.pts[k + 1];
      const [ax, ay] = toGrid(slot, a[0], a[1]), [bx, by] = toGrid(slot, b[0], b[1]);
      const f0 = (base + a[2]) / totalLen, f1 = (base + b[2]) / totalLen;
      segs.push({ ax, ay, bx, by, f0, f1, branch: false });
    }
    for (const br of c.branches) {
      const [ax, ay] = toGrid(slot, br[0][0], br[0][1]), [bx, by] = toGrid(slot, br[1][0], br[1][1]);
      segs.push({ ax, ay, bx, by, f0: 0.5, f1: 0.5, branch: true });
    }
    base += c.total;
  }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of segs) { x0 = Math.min(x0, s.ax, s.bx); y0 = Math.min(y0, s.ay, s.by); x1 = Math.max(x1, s.ax, s.bx); y1 = Math.max(y1, s.ay, s.by); }
  const v = { segs, bbox: [Math.floor(x0 - 2), Math.floor(y0 - 2), Math.ceil(x1 + 2), Math.ceil(y1 + 2)] };
  segCache.set(key, v);
  return v;
}

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
  let t = L2 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return [Math.hypot(px - ax - t * dx, py - ay - t * dy), t];
}

/**
 * Which end of a digit's flattened segment list (f near 0, or f near 1) is
 * closer to the chip, so a reveal/pour animation can start there. Returns
 * true if f=1 is the near end (the fraction should be read as 1 - f).
 */
const flipCache = new Map();
function nearEndIsOne(d, slot, slotIdx) {
  const key = slotIdx * 10 + d;
  if (flipCache.has(key)) return flipCache.get(key);
  const { segs } = slotSegs(d, slot, slotIdx);
  let d0 = Infinity, d1 = Infinity;
  for (const s of segs) {
    if (s.branch) continue;
    const da = Math.hypot(s.ax - CHIP[0], s.ay - CHIP[1]), db = Math.hypot(s.bx - CHIP[0], s.by - CHIP[1]);
    if (s.f0 < 0.08) d0 = Math.min(d0, da);
    if (s.f1 < 0.08) d0 = Math.min(d0, db);
    if (s.f0 > 0.92) d1 = Math.min(d1, da);
    if (s.f1 > 0.92) d1 = Math.min(d1, db);
  }
  const v = d1 < d0;
  flipCache.set(key, v);
  return v;
}

export { W, N, CX, CY, R_BOWL, CHIP, SLOTS, digitsOf, slotSegs, segDist, nearEndIsOne,
  GLAZE_DEEP, GLAZE_LIT, FOOT, GOLD, GOLD_HOT, GOLD_DARK, WINDOW };
