// Labyrinth — a wooden tilt maze whose walls are the time.
//
// A Labyrinth board seen in real 3D perspective, tilting on its gimbal.
// Its raised rails are the numerals: the hour, small, at the back left, the
// minute, big, at the front right, each digit a run of straight rails with
// 45-degree joints, the way a maze is built. Every rail is a box in 3D,
// projected each frame with its top lit, its sides shaded by facing, painted
// far to near, so rails in front hide the ball.
//
// A ghost player steers a steel ball through the corridors between the
// numerals: a real simulation (rolling under the board's tilt, drag, rattling
// off rails, tipping over hole rims) with a player that tilts the board to
// chase a point along a path it plans round the walls. The board's tilt is
// the player's hands, so the board sways exactly as the ball needs. The
// whole minute is simulated from its start (memoised per minute), so a
// frame is still a pure function of the clock.
//
// Some minutes the player fumbles and the ball drops into a trap hole; it is
// spat back out of the return hole a moment later. At the end of each minute
// the ball circles the goal hole, waiting, and drops in just before :59; the
// rails of the old digit sink into the board, and the rails of the new one
// rise. Rails the two digits share stay up.
//
// The hour: the player swirls the board steeply; the ball races laps round
// the rim, the old rails sinking in its wake on the first lap and the new
// ones rising behind it on the second, then it runs into the goal.

import { dither, clamp, ease, progress, clockFields, smoothNoise, orbit } from '../js/kit.js';

const W = 128, H = 64;
const TAU = Math.PI * 2;

// ------------------------------------------------------------ the board (board units, y toward the viewer)

const BX = 58, BY = 34;          // inner half extents
const RT = 3, RH = 7;            // rim thickness, height
const BR = 3.7;                  // ball radius
const HR = 5.0;                  // hole radius
const KG = 760;                  // downhill acceleration per unit sin(tilt) (u/s^2)

const START = [36, -20];
const GOAL = [-42, 17];
const TRAPS = [[-16, 12], [-6, -20]];
const HOLES = [START, GOAL, ...TRAPS];   // index 0 start, 1 goal, 2.. traps

// ------------------------------------------------------------ the camera

const E = 0.8, CE = Math.cos(E), SE = Math.sin(E);
const D = 175;
const CAM = [0, D * CE, D * SE];
const LIGHT = (() => { const v = [-0.5, 0.45, 0.75]; const l = Math.hypot(...v); return v.map((c) => c / l); })();
let F = 1, CY0 = 32;
{
  // Fit the untilted board to the glass.
  const pr = (x, y, z) => { const Z = D - y * CE - z * SE; return [x / Z, (y * SE - z * CE) / Z]; };
  const fx = 62 / pr(BX + RT, BY + RT, 0)[0];
  const top = pr(0, -BY - RT, RH)[1], bot = pr(0, BY + RT, 0)[1];
  const fy = 61 / (bot - top);
  F = Math.min(fx, fy);
  CY0 = 32 - (F * (top + bot)) / 2;
}

// ------------------------------------------------------------ letterforms
// Rails on a 4 x 6 grid, every corner a 45-degree joint, the way a maze is
// glued up. Centre-lines; each polyline is cut into unit rails so a turn
// keeps the rails two digits share.

const DIG = {
  0: [[[1, 0], [3, 0], [4, 1], [4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0]]],
  1: [[[0.8, 1.2], [2, 0], [2, 6]], [[0.8, 6], [3.2, 6]]],
  2: [[[0, 1], [1, 0], [3, 0], [4, 1], [4, 2], [3, 3], [1, 3], [0, 4], [0, 6], [4, 6]]],
  3: [[[0, 0], [3, 0], [4, 1], [4, 2], [3, 3], [4, 4], [4, 5], [3, 6], [0, 6]], [[1.4, 3], [3, 3]]],
  4: [[[0, 0], [0, 3], [1, 4], [4, 4]], [[3, 1.6], [3, 6]]],
  5: [[[4, 0], [0, 0], [0, 3], [3, 3], [4, 4], [4, 5], [3, 6], [0, 6]]],
  6: [[[3.6, 0], [1, 0], [0, 1], [0, 5], [1, 6], [3, 6], [4, 5], [4, 4], [3, 3], [0, 3]]],
  7: [[[0, 0], [4, 0], [4, 1.5], [2, 3.5], [2, 6]]],
  8: [[[1, 0], [3, 0], [4, 1], [4, 2], [3, 3], [1, 3], [0, 2], [0, 1], [1, 0]],
      [[1, 3], [3, 3], [4, 4], [4, 5], [3, 6], [1, 6], [0, 5], [0, 4], [1, 3]]],
  9: [[[0.4, 6], [3, 6], [4, 5], [4, 1], [3, 0], [1, 0], [0, 1], [0, 2], [1, 3], [4, 3]]],
};

/** Unit rails of a digit, in grid units: [ax, ay, bx, by, key]. */
function rails(d) {
  const out = [], seen = new Set();
  for (const pl of DIG[d])
    for (let i = 1; i < pl.length; i++) {
      const [ax, ay] = pl[i - 1], [bx, by] = pl[i];
      const n = Math.max(1, Math.round(Math.max(Math.abs(bx - ax), Math.abs(by - ay))));
      for (let k = 0; k < n; k++) {
        const x0 = ax + ((bx - ax) * k) / n, y0 = ay + ((by - ay) * k) / n;
        const x1 = ax + ((bx - ax) * (k + 1)) / n, y1 = ay + ((by - ay) * (k + 1)) / n;
        const p = [x0, y0, x1, y1].map((v) => Math.round(v * 10) / 10);
        const key = p[0] < p[2] || (p[0] === p[2] && p[1] < p[3]) ? p.join(',') : [p[2], p[3], p[0], p[1]].join(',');
        if (seen.has(key)) continue;
        seen.add(key);
        out.push([x0, y0, x1, y1, key]);
      }
    }
  return out;
}
const RAILS = Array.from({ length: 10 }, (_, d) => rails(d));

// Four slots: hours small at the back left, minutes big at the front right.
const SLOTS = [
  { x: -50.5, y: -27, sx: 3.1, sy: 3.1, t: 2.8, h: 4 },
  { x: -32, y: -27, sx: 3.1, sy: 3.1, t: 2.8, h: 4 },
  { x: -4, y: -6, sx: 5.6, sy: 5.0, t: 3.2, h: 7 },
  { x: 24.5, y: -6, sx: 5.6, sy: 5.0, t: 3.2, h: 7 },
];
for (const s of SLOTS) { s.cx = s.x + 2 * s.sx; s.cy = s.y + 3 * s.sy; }

/** Board-space rail pieces of `digits` (4 chars): {ax, ay, bx, by, t, h, slot, key}. */
function piecesOf(digits) {
  const out = [];
  for (let k = 0; k < 4; k++) {
    const s = SLOTS[k];
    for (const [ax, ay, bx, by, key] of RAILS[+digits[k]])
      out.push({ ax: s.x + ax * s.sx, ay: s.y + ay * s.sy, bx: s.x + bx * s.sx, by: s.y + by * s.sy, t: s.t, h: s.h, slot: k, key: k + ':' + key });
  }
  return out;
}

const RIM = [
  [-BX - RT / 2, -BY - RT / 2, BX + RT / 2, -BY - RT / 2],   // back
  [-BX - RT / 2, -BY - RT / 2, -BX - RT / 2, BY + RT / 2],   // left
  [BX + RT / 2, -BY - RT / 2, BX + RT / 2, BY + RT / 2],     // right
  [-BX - RT / 2, BY + RT / 2, BX + RT / 2, BY + RT / 2],     // front
].map(([ax, ay, bx, by]) => ({ ax, ay, bx, by, t: RT, h: RH, rim: true }));

// ------------------------------------------------------------ small helpers

function segClosest(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  const u = l2 ? clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1) : 0;
  return [ax + u * dx, ay + u * dy];
}
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const smooth = (u) => u * u * (3 - 2 * u);

// ------------------------------------------------------------ the hour lap
// A rounded rectangle just inside the rim, run anticlockwise on the glass
// (leftwards along the back first).

const LX = BX - BR - 0.9, LY = BY - BR - 0.9, LRC = 9;
const LOOP = (() => {
  const pts = [];
  // back edge, right to left
  pts.push([LX - LRC, -LY]);
  // back-left corner: centre (-LX+LRC, -LY+LRC), from angle -90deg to -180deg
  for (let k = 0; k <= 8; k++) { const a = -Math.PI / 2 - (k / 8) * (Math.PI / 2); pts.push([-LX + LRC + LRC * Math.cos(a), -LY + LRC + LRC * Math.sin(a)]); }
  // front-left corner: centre (-LX+LRC, LY-LRC), from 180deg to 90deg
  for (let k = 0; k <= 8; k++) { const a = Math.PI - (k / 8) * (Math.PI / 2); pts.push([-LX + LRC + LRC * Math.cos(a), LY - LRC + LRC * Math.sin(a)]); }
  // front-right corner: centre (LX-LRC, LY-LRC), from 90deg to 0
  for (let k = 0; k <= 8; k++) { const a = Math.PI / 2 - (k / 8) * (Math.PI / 2); pts.push([LX - LRC + LRC * Math.cos(a), LY - LRC + LRC * Math.sin(a)]); }
  // back-right corner: centre (LX-LRC, -LY+LRC), from 0 to -90deg
  for (let k = 0; k <= 8; k++) { const a = -(k / 8) * (Math.PI / 2); pts.push([LX - LRC + LRC * Math.cos(a), -LY + LRC + LRC * Math.sin(a)]); }
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, cum, P: cum[cum.length - 1] };
})();
function loopAt(s) {
  const { pts, cum, P } = LOOP;
  s = ((s % P) + P) % P;
  let i = 1;
  while (i < cum.length - 1 && cum[i] < s) i++;
  const u = (s - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
  const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
  const l = Math.hypot(bx - ax, by - ay) || 1;
  return [ax + (bx - ax) * u, ay + (by - ay) * u, (bx - ax) / l, (by - ay) / l];
}
function loopNearest(x, y) {
  let best = 1e9, bs = 0;
  for (let s = 0; s < LOOP.P; s += 0.5) { const [lx, ly] = loopAt(s); const d = (lx - x) ** 2 + (ly - y) ** 2; if (d < best) { best = d; bs = s; } }
  return bs;
}

// u = seconds from the hour turn. The ball joins the loop at LAP0 and leaves at LAP1.
const LAP0 = -3.0, LAP1 = 2.8, VMAX = 135;
const ENTRY_S = 6;                    // where on the loop it joins (just left of the back-right corner)
const lapSpeed = (u) => {
  if (u < -1.6) return 16 + (VMAX - 16) * ease.inQuad(progress(u, LAP0, -1.6));
  if (u < 1.7) return VMAX;
  return VMAX + (30 - VMAX) * ease.outQuad(progress(u, 1.7, LAP1));
};
const LAP_DT = 0.01;
const LAP_SIGMA = (() => {
  const n = Math.round((LAP1 - LAP0) / LAP_DT) + 1, a = new Float64Array(n);
  a[0] = ENTRY_S;
  for (let i = 1; i < n; i++) { const u = LAP0 + (i - 0.5) * LAP_DT; a[i] = a[i - 1] + lapSpeed(u) * LAP_DT; }
  return a;
})();
function lapSigma(u) {
  const f = clamp((u - LAP0) / LAP_DT, 0, LAP_SIGMA.length - 1.001), i = Math.floor(f);
  return LAP_SIGMA[i] + (LAP_SIGMA[i + 1] - LAP_SIGMA[i]) * (f - i);
}
/** Downhill pull (tilt) the player holds during the lap: the low point leads the ball. */
function lapPull(u) {
  const [, , tx, ty] = loopAt(lapSigma(u));
  const m = 165 * ease.inOutQuad(progress(u, LAP0, -1.8)) * (1 - ease.inOutQuad(progress(u, 1.2, LAP1)));
  // Lean a little outward too, so the board visibly swirls.
  return [tx * m - ty * m * 0.35, ty * m + tx * m * 0.35];
}
/** When the ball (on the loop) passes the point of the loop nearest a slot, in [u0, u1]. */
function passTime(slot, u0, u1) {
  const s0 = loopNearest(SLOTS[slot].cx, SLOTS[slot].cy), P = LOOP.P;
  for (let u = u0; u <= u1; u += 0.01) {
    const a = lapSigma(u), b = lapSigma(u + 0.01);
    const k = Math.ceil((a - s0) / P);
    if (s0 + k * P <= b) return u;
  }
  return null;
}
// Each rail sinks just behind the ball on the lap before :00 and rises behind
// it on the lap after, squeezed so no digit is missing for much over a second.
const SINK_AT = [0, 1, 2, 3].map((k) => { const u = passTime(k, -1.6, -0.5); return u === null ? -0.6 : Math.max(-1.0, u + 0.05); });
const RISE_AT = [0, 1, 2, 3].map((k) => { const u = passTime(k, 0.0, 1.0); return u === null ? 0.1 : Math.min(0.6, u + 0.05); });

// ------------------------------------------------------------ the ghost player and the ball

const DT = 1 / 120, NSTEP = 7200, STRIDE = 6;   // x, y, z, hole, gx, gy
const CELL = 2, NX = (2 * BX) / CELL, NY = (2 * BY) / CELL;
const POP_AT = 1.35, DROP_AT = 57.3, ARRIVE = 55.6;

function wallClear(x, y, walls) {
  let best = 1e9;
  for (let k = 0; k < walls.length; k++) {
    const w = walls[k], dx = w.bx - w.ax, dy = w.by - w.ay;
    const u = clamp(((x - w.ax) * dx + (y - w.ay) * dy) / (dx * dx + dy * dy || 1), 0, 1);
    const ex = x - w.ax - u * dx, ey = y - w.ay - u * dy;
    const d = Math.sqrt(ex * ex + ey * ey) - w.t / 2;
    if (d < best) best = d;
  }
  return best;
}

// Collision buckets: walls near each 8 x 8 patch of the board.
const BK = 8, BNX = Math.ceil((2 * BX + 8) / BK), BNY = Math.ceil((2 * BY + 8) / BK);
const bucketOf = (x, y) => clamp(Math.floor((y + BY + 4) / BK), 0, BNY - 1) * BNX + clamp(Math.floor((x + BX + 4) / BK), 0, BNX - 1);

function buildWorld(digits) {
  const walls = [...piecesOf(digits), ...RIM];
  const buckets = Array.from({ length: BNX * BNY }, () => []);
  for (const w of walls) {
    const m = 9;   // generous, so clearances under 8 are exact from a bucket
    const i0 = Math.floor((Math.min(w.ax, w.bx) - m + BX + 4) / BK), i1 = Math.floor((Math.max(w.ax, w.bx) + m + BX + 4) / BK);
    const j0 = Math.floor((Math.min(w.ay, w.by) - m + BY + 4) / BK), j1 = Math.floor((Math.max(w.ay, w.by) + m + BY + 4) / BK);
    for (let j = Math.max(0, j0); j <= Math.min(BNY - 1, j1); j++)
      for (let i = Math.max(0, i0); i <= Math.min(BNX - 1, i1); i++) buckets[j * BNX + i].push(w);
  }
  const clear = new Float32Array(NX * NY);
  for (let j = 0; j < NY; j++)
    for (let i = 0; i < NX; i++) {
      const x = -BX + (i + 0.5) * CELL, y = -BY + (j + 0.5) * CELL;
      clear[j * NX + i] = Math.min(8, wallClear(x, y, buckets[bucketOf(x, y)]));
    }
  return { walls, clear, buckets };
}
// The player keeps the ball well clear of holes it does not mean to use.
const HOLE_KEEP = HR + 3.2;
function holeFree(x, y, allow) {
  for (let h = 0; h < HOLES.length; h++) {
    if (h === allow || allow === -3) continue;
    const dx = x - HOLES[h][0], dy = y - HOLES[h][1];
    if (dx * dx + dy * dy < HOLE_KEEP * HOLE_KEEP) return false;
  }
  return true;
}
/** Wall clearance at any point, bilinear from the grid. */
function clearAt(world, x, y) {
  const fx = clamp((x + BX) / CELL - 0.5, 0, NX - 1.001), fy = clamp((y + BY) / CELL - 0.5, 0, NY - 1.001);
  const i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j, c = world.clear, k = j * NX + i;
  return (c[k] * (1 - u) + c[k + 1] * u) * (1 - v) + (c[k + NX] * (1 - u) + c[k + NX + 1] * u) * v;
}
const okAt = (world, x, y, allow) => clearAt(world, x, y) >= BR + 1.0 && holeFree(x, y, allow);
const cellFree = (world, i, j, allow) => i >= 0 && j >= 0 && i < NX && j < NY && world.clear[j * NX + i] >= BR + 1.0 &&
  holeFree(-BX + (i + 0.5) * CELL, -BY + (j + 0.5) * CELL, allow);
function nearestFreeCell(world, x, y, allow) {
  let best = -1, bd = 1e9;
  for (let j = 0; j < NY; j++)
    for (let i = 0; i < NX; i++) {
      const d = (-BX + (i + 0.5) * CELL - x) ** 2 + (-BY + (j + 0.5) * CELL - y) ** 2;
      if (d < bd && cellFree(world, i, j, allow)) { bd = d; best = j * NX + i; }
    }
  return best;
}
/** A polyline from `a` to `b` round the walls (allow: a hole index the path may enter). */
function planPath(world, a, b, allow) {
  const s = nearestFreeCell(world, a[0], a[1], allow), e = nearestFreeCell(world, b[0], b[1], allow);
  const prev = new Int32Array(NX * NY).fill(-2);
  const q = [s]; prev[s] = -1;
  for (let qi = 0; qi < q.length; qi++) {
    const c = q[qi];
    if (c === e) break;
    const ci = c % NX, cj = (c / NX) | 0;
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = ci + di, nj = cj + dj, n = nj * NX + ni;
        if (!cellFree(world, ni, nj, allow) || prev[n] !== -2) continue;
        if (di && dj && (!cellFree(world, ci + di, cj, allow) || !cellFree(world, ci, cj + dj, allow))) continue;
        prev[n] = c; q.push(n);
      }
  }
  if (prev[e] === -2 && allow !== -3) return planPath(world, a, b, -3);   // boxed in: ignore the holes
  const cells = [];
  if (prev[e] !== -2) for (let c = e; c !== -1; c = prev[c]) cells.push([-BX + ((c % NX) + 0.5) * CELL, -BY + (((c / NX) | 0) + 0.5) * CELL]);
  cells.reverse();
  const raw = [a, ...cells, b];
  // Pull the string: keep only the corners the ball cannot see past.
  const sees = (p, r) => {
    const n = Math.ceil(Math.hypot(r[0] - p[0], r[1] - p[1]) / 0.8);
    for (let k = 1; k < n; k++) { const u = k / n; if (!okAt(world, p[0] + (r[0] - p[0]) * u, p[1] + (r[1] - p[1]) * u, allow)) return false; }
    return true;
  };
  const out = [raw[0]];
  let i = 0;
  while (i < raw.length - 1) {
    let j = Math.min(raw.length - 1, i + 40);
    while (j > i + 1 && !sees(raw[i], raw[j])) j--;
    out.push(raw[j]); i = j;
  }
  const cum = [0];
  for (let k = 1; k < out.length; k++) cum.push(cum[k - 1] + Math.hypot(out[k][0] - out[k - 1][0], out[k][1] - out[k - 1][1]));
  return { pts: out, cum, len: cum[cum.length - 1] };
}
/** How fast the ball may go at arc length `s`: slow enough to make the next corner. */
function cornerSpeed(path, s) {
  const { pts, cum } = path;
  let i = 1;
  while (i < cum.length - 1 && cum[i] <= s) i++;
  if (i >= pts.length - 1) return Math.sqrt(2 * 45 * Math.max(0, path.len - s)) + 4;
  const ax = pts[i][0] - pts[i - 1][0], ay = pts[i][1] - pts[i - 1][1], bx = pts[i + 1][0] - pts[i][0], by = pts[i + 1][1] - pts[i][1];
  const c = (ax * bx + ay * by) / ((Math.hypot(ax, ay) * Math.hypot(bx, by)) || 1);
  const vt = 7 + 20 * Math.max(0, c);
  return Math.sqrt(vt * vt + 2 * 45 * Math.max(0, cum[i] - s));
}
function pathAt(path, s) {
  const { pts, cum } = path;
  if (pts.length < 2) return [pts[0][0], pts[0][1], 0, 0];
  s = clamp(s, 0, path.len);
  let i = 1;
  while (i < cum.length - 1 && cum[i] < s) i++;
  const l = cum[i] - cum[i - 1] || 1, u = (s - cum[i - 1]) / l;
  return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * u, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * u, (pts[i][0] - pts[i - 1][0]) / l, (pts[i][1] - pts[i - 1][1]) / l];
}

/** The player's idle hands: a slow sway of the board, from absolute time. */
function idlePull(T) {
  return [(smoothNoise(T * 0.31, 11) - 0.5) * 34 + (smoothNoise(T * 1.3, 12) - 0.5) * 6,
    (smoothNoise(T * 0.27, 13) - 0.5) * 26 + (smoothNoise(T * 1.1, 14) - 0.5) * 5];
}

/**
 * Simulate minute `key` (minutes since the epoch) for the four `digits`.
 * kind: 'normal' | 'prehour' (mm 59, ends on the loop) | 'hour' (mm 00, starts off the loop).
 */
function simulate(key, digits, kind) {
  const world = buildWorld(digits);
  const R = rng(key * 2654435761);
  const T0 = (key % 100000) * 60;
  const out = new Float32Array((NSTEP + 1) * STRIDE);

  // Waypoints: open places, far from one another.
  // Only places the ball can reach from the return hole (not inside a closed 0 or 8).
  const reach = new Uint8Array(NX * NY);
  {
    const s0 = nearestFreeCell(world, START[0] - 9, START[1], -1), q = [s0];
    reach[s0] = 1;
    for (let qi = 0; qi < q.length; qi++) {
      const c = q[qi], ci = c % NX, cj = (c / NX) | 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = (cj + dj) * NX + ci + di;
        if (cellFree(world, ci + di, cj + dj, -1) && !reach[n]) { reach[n] = 1; q.push(n); }
      }
    }
  }
  const cand = [];
  for (let j = 1; j < NY - 1; j++)
    for (let i = 1; i < NX - 1; i++) {
      const x = -BX + (i + 0.5) * CELL, y = -BY + (j + 0.5) * CELL;
      if (reach[j * NX + i] && world.clear[j * NX + i] >= BR + 2.6 && holeFree(x, y, -1) && Math.hypot(x - GOAL[0], y - GOAL[1]) > 14) cand.push([x, y]);
    }
  const legs = [];
  let last = kind === 'hour' ? GOAL : START;
  if (kind === 'hour') legs.push({ to: GOAL, type: 'drop', hole: 1 });
  const nWay = kind === 'normal' ? 6 : 5;
  const fumble = kind === 'normal' && R() < 0.22;
  let budget = kind === 'hour' ? 330 : 470;
  for (let k = 0; k < nWay && cand.length; k++) {
    let p = null;
    for (let tries = 0; tries < 40; tries++) {
      const c = cand[Math.floor(R() * cand.length)];
      const d = Math.hypot(c[0] - last[0], c[1] - last[1]);
      if (d > 30 && d < 75) { p = c; break; }
      p = c;
    }
    budget -= Math.hypot(p[0] - last[0], p[1] - last[1]) * 1.3;
    if (budget < 0 && k >= 2) break;
    legs.push({ to: p, type: 'way' });
    last = p;
    if (fumble && k === 2) {
      let th = 2, bd = 1e9;
      for (let h = 2; h < HOLES.length; h++) { const d = Math.hypot(HOLES[h][0] - p[0], HOLES[h][1] - p[1]); if (d < bd) { bd = d; th = h; } }
      legs.push({ to: HOLES[th], type: 'drop', hole: th });
      last = START;
    }
  }
  if (kind === 'prehour') { const [ex, ey] = loopAt(ENTRY_S); legs.push({ to: [ex, ey], type: 'hold' }); }
  else {
    // Wait beside the goal on the side the ball arrives from.
    const a = Math.atan2(last[1] - GOAL[1], last[0] - GOAL[0]);
    legs.push({ to: [GOAL[0] + Math.cos(a) * (HR + BR + 2.8), GOAL[1] + Math.sin(a) * (HR + BR + 2.8)], type: 'goal', a });
  }
  const futureLen = (from) => {
    let s = 0, p = legs[from - 1] ? legs[from - 1].to : START;
    for (let k = from; k < legs.length; k++) { s += Math.hypot(legs[k].to[0] - p[0], legs[k].to[1] - p[1]) * 1.3; p = legs[k].type === 'drop' ? START : legs[k].to; if (legs[k].type === 'drop') s += 30; }
    return s;
  };

  // State.
  let phase = 'absent', px = START[0], py = START[1], vx = 0, vy = 0, pz = -2.4 * BR, hole = 0;
  let gx, gy, popAt = POP_AT, t0 = 0, f0x = 0, f0y = 0, f0z = 0, popDir = [0, 1];
  let leg = 0, path = null, sig = 0, arrivedAt = -1, stuck = 0;
  const startStep = kind === 'hour' ? Math.round(LAP1 / DT) : 0;
  if (kind === 'hour') {
    const [lx, ly, tx, ty] = loopAt(lapSigma(LAP1));
    px = lx; py = ly; vx = tx * lapSpeed(LAP1); vy = ty * lapSpeed(LAP1); pz = 0; phase = 'roll';
    [gx, gy] = lapPull(LAP1);
    path = planPath(world, [px, py], GOAL, 1); sig = 0;
  } else [gx, gy] = idlePull(T0);

  const beginLeg = () => {
    const L = legs[leg];
    if (!L) { path = null; return; }
    path = planPath(world, [px, py], L.to, L.type === 'drop' ? L.hole : -1);
    sig = 0;
  };
  const relax = 1 - Math.exp(-DT / 0.11);

  // Stepped lazily, only as far as a frame asks, so the cost spreads over the minute.
  let done = -1;
  const advance = (upto) => { for (let n = done + 1; n <= upto; n++) {
    const s = n * DT;
    if (n >= startStep) {
      let dgx, dgy;
      const [ix, iy] = idlePull(T0 + s);
      if (phase === 'absent' && s >= popAt && s < 59) {
        // Spat out of the return hole: a hop towards the next leg.
        phase = 'hop'; t0 = s; hole = 0;
        if (s > 44) leg = legs.length - 1;   // late: straight for the goal
        const L = legs[leg] || { to: GOAL };
        const a = Math.atan2(L.to[1] - START[1], L.to[0] - START[0]);
        popDir = [Math.cos(a), Math.sin(a)];
      }
      if (phase === 'hop') {
        const u = (s - t0) / 0.42;
        const reach = HR + BR + 1.2;
        px = START[0] + popDir[0] * reach * u; py = START[1] + popDir[1] * reach * u;
        // A parabola: out of the hole (z from below) to a landing past the rim.
        pz = -2.4 * BR + (2.4 * BR) * u + 22 * u * (1 - u);
        if (u >= 1) { phase = 'roll'; pz = 0; vx = popDir[0] * 16; vy = popDir[1] * 16; beginLeg(); }
        dgx = ix; dgy = iy;
      } else if (phase === 'roll') {
        if (!path) beginLeg();
        if (s >= 56.8 && legs[leg] && legs[leg].type !== "goal" && legs[leg].type !== "hold") { leg = legs.length - 1; beginLeg(); }
        const L = legs[leg];
        // Pace: arrive at the goal (or the loop) on time.
        let remain = (path ? path.len - sig : 0) + futureLen(leg + 1);
        const tl = Math.max(0.6, (kind === 'prehour' ? ARRIVE + 0.8 : ARRIVE) - s);
        let vc = clamp(remain / tl, 9, 34);
        if (L && L.type === 'drop' && kind === 'hour' && leg === 0) vc = 30;
        let cx, cy, tvx = 0, tvy = 0;
        if (path) {
          const [ax, ay] = pathAt(path, sig);
          const lag = Math.hypot(ax - px, ay - py);
          // Knocked off the line (or pinned against a rail): plan again from here.
          stuck = lag > 5 && Math.hypot(vx, vy) < 4 ? stuck + DT : 0;
          if ((lag > 11 || stuck > 0.5) && sig < path.len - 0.5) { stuck = 0; beginLeg(); }
          vc = Math.min(vc, cornerSpeed(path, sig));
          sig = Math.min(path.len, sig + vc * DT * clamp(1.7 - lag / 6, 0, 1));
          const [qx, qy, tx, ty] = pathAt(path, sig);
          cx = qx; cy = qy;
          if (sig < path.len) { tvx = tx * vc; tvy = ty * vc; }
          if (sig >= path.len && L) {
            if (L.type === 'way' && Math.hypot(px - cx, py - cy) < 4.5) { leg++; beginLeg(); }
            else if (L.type === 'goal') {
              if (arrivedAt < 0 && Math.hypot(px - cx, py - cy) < 3) arrivedAt = s;
              if (s >= DROP_AT) {
                // In it goes: aim through the hole, not at its centre.
                const dx = GOAL[0] - px, dy = GOAL[1] - py, d = Math.hypot(dx, dy) || 1;
                cx = GOAL[0] + (dx / d) * 4; cy = GOAL[1] + (dy / d) * 4;
              }
              else if (arrivedAt >= 0) {
                // Circle the goal, teasing.
                const r = HR + BR + 2.8, w = 2.2, a = L.a + w * (s - arrivedAt) * (Math.sin(s * 0.7) > -0.2 ? 1 : 0.6);
                cx = GOAL[0] + Math.cos(a) * r; cy = GOAL[1] + Math.sin(a) * r;
                tvx = -Math.sin(a) * r * w; tvy = Math.cos(a) * r * w;
              }
            }
          }
        } else { cx = px; cy = py; }
        let ax = 7.5 * (cx - px) + 4.2 * (tvx - vx), ay = 7.5 * (cy - py) + 4.2 * (tvy - vy);
        // The player's eye on the holes it does not want: steer round them.
        const want = L && L.type === 'drop' ? L.hole : L && L.type === 'goal' && s >= DROP_AT ? 1 : -1;
        for (let h = 0; h < HOLES.length; h++) {
          if (h === want) continue;
          const dx = px - HOLES[h][0], dy = py - HOLES[h][1], d = Math.hypot(dx, dy) || 1;
          if (d < 11) {
            const k = 26 * (11 - d), vr = (vx * dx + vy * dy) / d;
            ax += (dx / d) * k - (vr < 0 ? (dx / d) * vr * 3 : 0); ay += (dy / d) * k - (vr < 0 ? (dy / d) * vr * 3 : 0);
          }
        }
        const am = Math.hypot(ax, ay), AM = 70;
        if (am > AM) { ax *= AM / am; ay *= AM / am; }
        dgx = ax + 0.7 * vx + (ix - 0) * 0.25; dgy = ay + 0.7 * vy + iy * 0.25;
      } else { dgx = ix; dgy = iy; }

      gx += (dgx - gx) * relax; gy += (dgy - gy) * relax;

      if (phase === 'roll') {
        // Rolling under the tilt.
        let axx = gx - 0.7 * vx, ayy = gy - 0.7 * vy;
        // Hole rims: past the rim the ball tips in.
        pz = 0;
        let fell = -1;
        for (let h = 0; h < HOLES.length; h++) {
          const dx = HOLES[h][0] - px, dy = HOLES[h][1] - py, d = Math.hypot(dx, dy);
          if (d < HR) {
            const over = HR - d;
            pz = -(BR - Math.sqrt(Math.max(0, BR * BR - over * over)));
            axx += (dx / (d || 1)) * 520 * (over / BR);
            ayy += (dy / (d || 1)) * 520 * (over / BR);
            if (over > 0.55 * BR) fell = h;
          }
        }
        vx += axx * DT; vy += ayy * DT;
        px += vx * DT; py += vy * DT;
        const bucket = world.buckets[bucketOf(px, py)];
        for (let k = 0; k < bucket.length; k++) {
          const w = bucket[k], wx = w.bx - w.ax, wy = w.by - w.ay;
          const uu = clamp(((px - w.ax) * wx + (py - w.ay) * wy) / (wx * wx + wy * wy || 1), 0, 1);
          const dx = px - w.ax - uu * wx, dy = py - w.ay - uu * wy, d = Math.hypot(dx, dy), lim = BR + w.t / 2;
          if (d < lim && d > 1e-6) {
            const nx = dx / d, ny = dy / d;
            px += nx * (lim - d); py += ny * (lim - d);
            const vn = vx * nx + vy * ny;
            if (vn < 0) { vx -= 1.45 * vn * nx; vy -= 1.45 * vn * ny; vx *= 0.97; vy *= 0.97; }
          }
        }
        if (fell >= 0) {
          phase = 'fall'; t0 = s; hole = fell; f0x = px; f0y = py; f0z = pz;
        }
      } else if (phase === 'fall') {
        const u = Math.min(1, (s - t0) / 0.3);
        const [hx, hy] = HOLES[hole];
        px = f0x + (hx - f0x) * ease.outQuad(u); py = f0y + (hy - f0y) * ease.outQuad(u);
        pz = f0z - 2.4 * BR * u * u;
        if (u >= 1) {
          phase = 'absent';
          const L = legs[leg];
          if (s > 54 && kind !== 'prehour') { leg = legs.length; popAt = 1e9; }   // too late to try again
          else if (L && L.type === 'drop') { leg++; path = null; popAt = s + (kind === 'hour' ? 0.9 : 1.1); }
          else if (L && L.type === 'goal' && hole === 1 && s > 56.5) { leg = legs.length; popAt = 1e9; }
          else { path = null; popAt = s + 1.1; arrivedAt = -1; }   // a slip: try the same leg again
        }
      }
    } else { [gx, gy] = lapPull(s); }
    const o = n * STRIDE;
    const vis = phase !== 'absent' && n >= startStep;
    out[o] = px; out[o + 1] = py; out[o + 2] = vis ? pz : -99; out[o + 3] = hole; out[o + 4] = gx; out[o + 5] = gy;
  } done = Math.max(done, upto); };
  return { out, advance, get done() { return done; } };
}

const SIMS = new Map();
function simFor(key, digits, kind) {
  const k = key + kind + digits;
  let s = SIMS.get(k);
  if (!s) {
    s = simulate(key, digits, kind);
    SIMS.set(k, s);
    if (SIMS.size > 4) SIMS.delete(SIMS.keys().next().value);
  }
  return s;
}
function sample(run, s) {
  const f = clamp(s / DT, 0, NSTEP - 1e-6), i = Math.floor(f), u = f - i;
  if (run.done < i + 1) run.advance(i + 1);
  const sim = run.out;
  const a = i * STRIDE, b = a + STRIDE;
  const za = sim[a + 2], zb = sim[b + 2];
  const vis = za > -50 && zb > -50;
  const L = (k) => sim[a + k] + (sim[b + k] - sim[a + k]) * u;
  return { x: L(0), y: L(1), z: vis ? L(2) : -99, hole: sim[a + 3], gx: L(4), gy: L(5) };
}

// ------------------------------------------------------------ the renderer

let R00, R02, R10, R11, R12, R20, R21, R22, CX, CY;
function setPose(gx, gy, ox, oy) {
  const b = Math.asin(clamp(gx / KG, -0.6, 0.6)), a = -Math.asin(clamp(gy / KG, -0.6, 0.6));
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
  R00 = cb; R02 = sb;
  R10 = sa * sb; R11 = ca; R12 = -sa * cb;
  R20 = -ca * sb; R21 = sa; R22 = ca * cb;
  CX = 64 + ox; CY = CY0 + oy;
}
const PT = new Float64Array(6);   // sx, sy, depth, wx, wy, wz
function proj(x, y, z) {
  const wx = R00 * x + R02 * z, wy = R10 * x + R11 * y + R12 * z, wz = R20 * x + R21 * y + R22 * z;
  const Z = D - wy * CE - wz * SE;
  PT[0] = CX + (F * wx) / Z; PT[1] = CY + (F * (wy * SE - wz * CE)) / Z; PT[2] = Z;
  PT[3] = wx; PT[4] = wy; PT[5] = wz;
  return PT;
}
const rotN = (x, y, z) => [R00 * x + R02 * z, R10 * x + R11 * y + R12 * z, R20 * x + R21 * y + R22 * z];

/** Fill a convex screen polygon (flat [x0,y0,x1,y1,...]) opaquely with dither `level`. */
function fillPoly(buf, P, level, dox = 0, doy = 0) {
  const n = P.length >> 1;
  let y0 = 1e9, y1 = -1e9;
  for (let i = 0; i < n; i++) { const y = P[2 * i + 1]; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const ya = Math.max(0, Math.ceil(y0 - 0.5)), yb = Math.min(H - 1, Math.floor(y1 - 0.5));
  for (let y = ya; y <= yb; y++) {
    const yc = y + 0.5;
    let xl = 1e9, xr = -1e9;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const yi = P[2 * i + 1], yj = P[2 * j + 1];
      if ((yi > yc) !== (yj > yc)) {
        const x = P[2 * i] + ((P[2 * j] - P[2 * i]) * (yc - yi)) / (yj - yi);
        if (x < xl) xl = x; if (x > xr) xr = x;
      }
    }
    const xa = Math.max(0, Math.ceil(xl - 0.5)), xb = Math.min(W - 1, Math.floor(xr - 0.5));
    const row = y * W;
    for (let x = xa; x <= xb; x++) buf[row + x] = level >= 1 ? 1 : level <= 0 ? 0 : dither(x - dox, y - doy, level) ? 1 : 0;
  }
}
function inConvex(P, x, y) {
  const n = P.length >> 1;
  let sign = 0;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const c = (P[2 * i] - P[2 * j]) * (y - P[2 * j + 1]) - (P[2 * i + 1] - P[2 * j + 1]) * (x - P[2 * j]);
    if (c !== 0) { if (sign === 0) sign = Math.sign(c); else if (Math.sign(c) !== sign) return false; }
  }
  return true;
}

/** Screen geometry of one rail box. */
function boxGeom(w, h) {
  const dx = w.bx - w.ax, dy = w.by - w.ay, l = Math.hypot(dx, dy) || 1;
  const ux = dx / l, uy = dy / l, nx = -uy, ny = ux, e = w.t / 2;
  const cs = [
    [w.ax - ux * e + nx * e, w.ay - uy * e + ny * e],
    [w.bx + ux * e + nx * e, w.by + uy * e + ny * e],
    [w.bx + ux * e - nx * e, w.by + uy * e - ny * e],
    [w.ax - ux * e - nx * e, w.ay - uy * e - ny * e],
  ];
  const bot = [], top = [];
  for (const [x, y] of cs) { proj(x, y, 0); bot.push(PT[0], PT[1]); proj(x, y, h); top.push(PT[0], PT[1]); }
  const mx = (w.ax + w.bx) / 2, my = (w.ay + w.by) / 2;
  proj(mx, my, h / 2);
  const depth = PT[2], wcx = PT[3], wcy = PT[4], wcz = PT[5];
  // Side normals (outward, local): for the edge cs[i] -> cs[i+1].
  const sides = [];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    const ex = cs[j][0] - cs[i][0], ey = cs[j][1] - cs[i][1], el = Math.hypot(ex, ey) || 1;
    let snx = ey / el, sny = -ex / el;
    // Make it point away from the box centre.
    const fx = (cs[i][0] + cs[j][0]) / 2 - mx, fy = (cs[i][1] + cs[j][1]) / 2 - my;
    if (snx * fx + sny * fy < 0) { snx = -snx; sny = -sny; }
    const [wnx, wny, wnz] = rotN(snx, sny, 0);
    if (wnx * (CAM[0] - wcx) + wny * (CAM[1] - wcy) + wnz * (CAM[2] - wcz) <= 0) continue;
    const lit = wnx * LIGHT[0] + wny * LIGHT[1] + wnz * LIGHT[2];
    sides.push({ poly: [bot[2 * i], bot[2 * i + 1], bot[2 * j], bot[2 * j + 1], top[2 * j], top[2 * j + 1], top[2 * i], top[2 * i + 1]], level: w.rim ? 0 : lit > 0.3 ? 0.5 : 0 });
  }
  return { top, sides, depth, h, rim: !!w.rim };
}

function drawBoxes(buf, boxes, dox, doy) {
  for (const b of boxes) for (const s of b.sides) {
    fillPoly(buf, s.poly, s.level, dox, doy);
  }
  const tops = boxes.slice().sort((a, b) => a.h - b.h);
  for (const b of tops) fillPoly(buf, b.top, 1);
}

function holePolys(hx, hy) {
  const top = [], bot = [];
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * TAU, x = hx + HR * Math.cos(a), y = hy + HR * Math.sin(a);
    proj(x, y, 0); top.push(PT[0], PT[1]);
    proj(x, y, -3.2); bot.push(PT[0], PT[1]);
  }
  return { top, bot };
}
function bbox(P) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (let i = 0; i < P.length; i += 2) { x0 = Math.min(x0, P[i]); x1 = Math.max(x1, P[i]); y0 = Math.min(y0, P[i + 1]); y1 = Math.max(y1, P[i + 1]); }
  return [Math.max(0, Math.floor(x0)), Math.max(0, Math.floor(y0)), Math.min(W - 1, Math.ceil(x1)), Math.min(H - 1, Math.ceil(y1))];
}
function drawHole(buf, h, kind) {
  // A hole is a dark pit: only its far inner wall catches the light, a
  // crescent, so it never reads as a ball or a letter O. The goal also has a
  // brass ring round it.
  const [x0, y0, x1, y1] = bbox(h.top);
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const px = x + 0.5, py = y + 0.5;
      if (inConvex(h.top, px, py) && !inConvex(h.bot, px, py)) buf[y * W + x] = 1;
    }
  if (kind === 'goal') {
    const [hx, hy] = GOAL;
    let lx = null, ly = null;
    for (let k = 0; k <= 24; k++) {
      const a = (k / 24) * TAU;
      proj(hx + (HR + 2.2) * Math.cos(a), hy + (HR + 2.2) * Math.sin(a), 0);
      const x = Math.round(PT[0] - 0.5), y = Math.round(PT[1] - 0.5);
      if (lx !== null) line(buf, lx, ly, x, y);
      lx = x; ly = y;
    }
  }
}
function line(buf, x0, y0, x1, y1) {
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let e = dx + dy;
  for (;;) {
    if (x0 >= 0 && y0 >= 0 && x0 < W && y0 < H) buf[y0 * W + x0] = 1;
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * e;
    if (e2 >= dy) { e += dy; x0 += sx; }
    if (e2 <= dx) { e += dx; y0 += sy; }
  }
}

/** The steel ball: a black halo, a lit body with a dark lower band, and a highlight. */
function drawBall(buf, ball, clipPoly) {
  proj(ball.x, ball.y, ball.z + BR);
  const cx = PT[0], cy = PT[1], pr = (F * BR) / PT[2];
  const x0 = Math.max(0, Math.floor(cx - pr - 2)), x1 = Math.min(W - 1, Math.ceil(cx + pr + 2));
  const y0 = Math.max(0, Math.floor(cy - pr - 2)), y1 = Math.min(H - 1, Math.ceil(cy + pr + 2));
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const dx = (x + 0.5 - cx) / pr, dy = (y + 0.5 - cy) / pr, r2 = dx * dx + dy * dy;
      if (r2 > (1 + 1.6 / pr) ** 2) continue;
      if (clipPoly && !inConvex(clipPoly, x + 0.5, y + 0.5)) continue;
      // Polished steel at 1x: a solid bright ball in a black halo, so it
      // never merges with a rail; one dark pixel off the window highlight
      // when it is big enough to carry it.
      let v = r2 <= 1 ? 1 : 0;
      if (v && pr > 2.4 && Math.abs(dx + 0.3) < 0.5 / pr + 0.05 && Math.abs(dy + 0.3) < 0.5 / pr + 0.05) v = 0;
      buf[y * W + x] = v;
    }
}

// ------------------------------------------------------------ the face

const DAY = 0xcf, NIGHT_C = 0x20;

export default {
  name: 'Labyrinth',
  blurb: 'A wooden tilt maze whose rails are the time: a ghost player steers a steel ball round the numerals, sinks it at the minute, and the rails of the old digit sink as the new ones rise.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,

  frame(g, { date, fields: f, oled, night }) {
    const s = f.sec, mm = f.m;
    const cur = f.hh + f.mm;
    const prevF = clockFields(new Date(date.getTime() - 60000));
    const nextF = clockFields(new Date(date.getTime() + 60000));
    const prev = prevF.hh + prevF.mm, next = nextF.hh + nextF.mm;
    const kind = mm === 0 ? 'hour' : mm === 59 ? 'prehour' : 'normal';
    const sim = simFor(f.minuteKey, cur, kind);

    // The ball and the board's tilt.
    let ball, gx, gy;
    const lapU = kind === 'prehour' && s >= 60 + LAP0 ? s - 60 : kind === 'hour' && s < LAP1 ? s : null;
    if (lapU !== null) {
      const [lx, ly] = loopAt(lapSigma(lapU));
      const [px, py] = lapPull(lapU);
      if (kind === 'prehour') {
        const w = smooth(progress(lapU, LAP0, LAP0 + 0.6)), sm = sample(sim, s);
        ball = { x: sm.x + (lx - sm.x) * w, y: sm.y + (ly - sm.y) * w, z: 0, hole: -1 };
        gx = sm.gx + (px - sm.gx) * w; gy = sm.gy + (py - sm.gy) * w;
      } else { ball = { x: lx, y: ly, z: 0, hole: -1 }; gx = px; gy = py; }
    } else {
      const sm = sample(sim, s);
      ball = sm; gx = sm.gx; gy = sm.gy;
    }
    const [ox, oy] = orbit(date, 2, 3);
    setPose(gx, gy, ox, oy);

    // Rails, with the ones that are changing at their current height.
    const heights = new Map();
    const pieces = piecesOf(cur);
    const nextKeys = new Set(piecesOf(next).map((p) => p.key));
    const prevKeys = new Set(piecesOf(prev).map((p) => p.key));
    for (const p of pieces) {
      let k = 1;
      if (kind === 'prehour') {
        if (!nextKeys.has(p.key)) { const a = SINK_AT[p.slot]; k = 1 - ease.inOutQuad(progress(s - 60, a, Math.min(a + 0.5, -0.03))); }
      } else if (s >= 59.2 && !nextKeys.has(p.key)) k = 1 - ease.inOutQuad(progress(s, 59.2, 59.9));
      if (kind === 'hour') {
        if (!prevKeys.has(p.key)) { const a = RISE_AT[p.slot]; k = ease.outBack(progress(s, a, a + 0.7)); }
      } else if (s < 1.1 && !prevKeys.has(p.key)) k = ease.outBack(progress(s, 0.1, 0.95));
      heights.set(p, k);
    }

    const buf = g.buf;
    // Holes first: they are in the board.
    const hp = HOLES.map(([x, y]) => holePolys(x, y));
    for (let h = 0; h < HOLES.length; h++) drawHole(buf, hp[h], h === 1 ? 'goal' : h === 0 ? 'start' : 'trap');

    proj(ball.x, ball.y, BR);
    const ballDepth = PT[2];
    const behind = [], front = [];
    // Merge runs of collinear rails at one height into single boards.
    const runs = [];
    for (const p of pieces) {
      const k = heights.get(p);
      if (k <= 0.02) continue;
      const r = runs[runs.length - 1];
      if (r && r.slot === p.slot && r.k === k && Math.abs(r.bx - p.ax) < 0.01 && Math.abs(r.by - p.ay) < 0.01) {
        const c = (r.bx - r.ax) * (p.by - p.ay) - (r.by - r.ay) * (p.bx - p.ax), d = (r.bx - r.ax) * (p.bx - p.ax) + (r.by - r.ay) * (p.by - p.ay);
        if (Math.abs(c) < 0.01 && d > 0) { r.bx = p.bx; r.by = p.by; continue; }
      }
      runs.push({ ...p, k });
    }
    for (const p of runs) {
      const k = p.k;
      const b = boxGeom(p, p.h * k);
      (b.depth > ballDepth ? behind : front).push(b);
    }
    behind.sort((a, b) => b.depth - a.depth);
    front.sort((a, b) => b.depth - a.depth);
    const rim = RIM.map((w) => boxGeom(w, w.h));
    drawBoxes(buf, [rim[0], rim[1], rim[2]], ox, oy);
    drawBoxes(buf, behind, ox, oy);
    if (ball.z > -50) drawBall(buf, ball, ball.z < -0.6 ? hp[ball.hole | 0].top : null);
    drawBoxes(buf, front, ox, oy);
    drawBoxes(buf, [rim[3]], ox, oy);

    oled.contrast(Math.round(DAY + (NIGHT_C - DAY) * night));
  },
};
