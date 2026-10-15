// Popcorn — the time is popcorn.
//
// A popcorn kettle hangs on a wall bracket at the top left of a dark
// cabinet. The hour is the popcorn rising out of it, heaped into numerals,
// held between the kettle's two lid flaps; the minutes are two big heaps of
// popcorn on the cabinet floor, and under the kettle lies the spill. Every
// numeral is made of puffs, and every puff is drawn as what it is: a little
// body with four or five bumps burst out of it, outlined in black so a puff
// laid over another shows the crease between them, the heap's puffs growing
// towards its foot.
//
// Always alive: kernels are still popping under the heaps, so every second
// puffs jump up with a crack and drop back; the flaps rattle on the pressure
// in the kettle; and every couple of seconds a puff pops over the rim and
// lands on the spill, or flies across, bounces off a minute heap and drops
// off the front of the floor.
//
// The minute: the kettle tips towards the floor and the flaps lift. The
// floor goes hot under the digit that is changing and its puffs hop: those
// the new numeral can use hop to their new places, the spare ones jump off
// the front of the floor, and fresh kernels shoot from the kettle's lip,
// burst into puffs in the air and land, from the foot up, where the new
// numeral still needs them. Then the kettle rocks back upright.
//
// The hour: the pressure builds, the kettle shakes and chatters, and with a
// bang the flaps are thrown flat open. The hour's puffs erupt and rain back
// into the new hour within a second, a storm of fresh popcorn bursts over
// the whole cabinet and lays the new minutes, the spill is re-dealt, and the
// flaps swing back on their hinges.
//
// Everything is a function of the clock: the puff layouts and the old->new
// matching are cached per numeral, and every hop and flight is closed-form
// in the seconds from the turn.

import { clockFields, orbit, ease } from '../js/kit.js';

const W = 128, H = 64;
const TAU = Math.PI * 2;

function hash(x, y, s) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const clamp01 = (u) => (u < 0 ? 0 : u > 1 ? 1 : u);
const lerp = (a, b, u) => a + (b - a) * u;

// ------------------------------------------------------------ one puff

function puffLobes(s, rot, seed) {
  // a small body with four or five round bumps burst out of it
  const n = 4 + (hash(seed, 1, 5) < 0.45 ? 1 : 0);
  const L = [[0, 0, 0.5 * s]];
  for (let k = 0; k < n; k++) {
    const a = rot + (k * TAU) / n + (hash(seed, k, 7) - 0.5) * 0.7;
    const d = s * (0.56 + 0.14 * hash(seed, k, 8));
    L.push([Math.cos(a) * d, Math.sin(a) * d, s * (0.36 + 0.16 * hash(seed, k, 9))]);
  }
  return L;
}

// A puff's raster, cached: +1 lit, -1 cleared (its black outline), 0 untouched.
// The seam of the bumps above the body is a dark nick that makes them bumps.
const MASKS = new Map();
const ROTQ = 24;
function puffMask(s, rotq, seed) {
  const sq = Math.round(s * 10);
  const key = sq * 1e6 + rotq * 1e4 + (seed % 10000);
  let m = MASKS.get(key);
  if (m) return m;
  s = sq / 10;
  const L = puffLobes(s, (rotq / ROTQ) * TAU, seed);
  const R = Math.ceil(s * 1.25 + 2), N = 2 * R + 1;
  const cells = new Int8Array(N * N);
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const fx = i - R + 0.5, fy = j - R + 0.5;
      let d1 = Infinity, i1 = -1, d2 = Infinity, i2 = -1;
      for (let k = 0; k < L.length; k++) {
        const d = Math.hypot(fx - L[k][0], fy - L[k][1]) - L[k][2];
        if (d < d1) { d2 = d1; i2 = i1; d1 = d; i1 = k; } else if (d < d2) { d2 = d; i2 = k; }
      }
      let v = 0;
      if (d1 < 0) {
        v = 1;
        if (s >= 4.6 && d2 < 0.2 && d1 - d2 > -0.9 && (i1 === 0 || i2 === 0)) {
          const b = L[i1 === 0 ? i2 : i1];
          if (b[1] < -0.15 * s && Math.hypot(fx, fy) < s * 0.62) v = -1;
        }
      } else if (d1 < 1) v = -1;
      cells[j * N + i] = v;
    }
  m = { R, N, cells };
  MASKS.set(key, m);
  return m;
}

function drawPuff(g, x, y, s, rot, seed) {
  const rq = ((Math.round((rot / TAU) * ROTQ) % ROTQ) + ROTQ) % ROTQ;
  const { R, N, cells } = puffMask(s, rq, seed);
  const x0 = Math.round(x) - R, y0 = Math.round(y) - R;
  const buf = g.buf, gw = g.width, gh = g.height;
  for (let j = 0; j < N; j++) {
    const py = y0 + j;
    if (py < 0 || py >= gh) continue;
    for (let i = 0; i < N; i++) {
      const v = cells[j * N + i];
      if (!v) continue;
      const px = x0 + i;
      if (px < 0 || px >= gw) continue;
      buf[py * gw + px] = v > 0 ? 1 : 0;
    }
  }
}

/** A kernel: what is in the air before it bursts. */
function drawKernel(g, x, y, rot) {
  const c = Math.cos(rot), s = Math.sin(rot);
  for (const [a, b] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1]]) {
    g.pixel(Math.round(x + a * c - b * s), Math.round(y + a * s + b * c), 1);
  }
}

/** The crack of a pop: short rays out of where a kernel burst. */
function drawCrack(g, x, y, r, u, seed) {
  const n = 5;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * TAU + hash(seed, k, 3) * 0.8;
    const r0 = r + u * 3, r1 = r0 + 2 - u;
    for (let q = r0; q <= r1; q += 0.7) g.pixel(Math.round(x + Math.cos(a) * q), Math.round(y + Math.sin(a) * q), 1);
  }
}

// ------------------------------------------------------------ numerals
//
// Each numeral is a run of puffs laid along a centre-line drawn in a 30x40
// box, then stretched to the size it is shown at. The puffs grow towards the
// foot, as in any heap, and where a stroke stands on the floor it settles
// into a mound of two big puffs.
const BW = 30, BH = 40;
function arc(cx, cy, rx, ry, a0, a1, n = 24) {
  const p = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + (a1 - a0) * (i / n)) * Math.PI) / 180;
    p.push([cx + rx * Math.sin(a), cy - ry * Math.cos(a)]);
  }
  return p;
}
const rot180 = (paths) => paths.map((p) => p.map(([x, y]) => [BW - x, BH - y]));
const PATHS = {
  0: [arc(15, 20, 10.5, 15.5, 0, 360, 40)],
  1: [[[8, 10], [15, 4]], [[15, 4], [15, 36]]],
  2: [[...arc(15, 13, 9.5, 9, -80, 120, 18), [5, 36], [25.5, 36]]],
  3: [arc(14, 12, 9, 8, -75, 180, 18), arc(14, 27.5, 10.5, 8.8, 0, 245, 20)],
  4: [[[20, 36], [20, 4], [4, 27], [27, 27]]],
  5: [[[25, 4], [7, 4], [6.5, 19], ...arc(14.5, 26, 10.5, 10, -50, 225, 20).slice(1)]],
  7: [[[4, 4], [26, 4], [12, 36]]],
  8: [arc(15, 11.5, 8.5, 7.5, 180, 540, 24), arc(15, 27, 10.5, 9, 0, 360, 28)],
  9: [[...arc(15, 14, 10, 10, 90, 450, 28), ...arc(5, 14, 20, 22, 90, 165, 10).slice(1)]],
};
PATHS[6] = rot180(PATHS[9]);
const FEET = { 1: [[10.5, 36.5], [19.5, 36.5]], 4: [[15.5, 36.5], [24.5, 36.5]], 7: [[7.5, 36.5], [16.5, 36.5]] };

// The two sizes: big heaps on the floor, a smaller heap in the kettle.
const MIN = { kx: 1.15, ky: 1.4, s: 4.9, sp: 8.0, w: 30 * 1.15 };
const HR = { kx: 0.62, ky: 0.86, s: 4.1, sp: 6.2, w: 22.5 };

const SITE_CACHE = new Map();
/** The puffs of numeral d at size `sz`: [{x, y, s, rot, seed}] in its box. */
function sites(d, sz) {
  const key = `${d}/${sz.s}`;
  if (SITE_CACHE.has(key)) return SITE_CACHE.get(key);
  const { kx, ky, s, sp } = sz;
  const out = [];
  const add = (x, y, big) => {
    for (const o of out) if (Math.hypot(o.x - x * kx, o.y - y * ky) < sp * 0.7) return;
    const i = out.length;
    const heap = 0.92 + 0.14 * (y / BH);            // bigger towards the foot
    out.push({
      x: x * kx, y: y * ky,
      s: s * (big ? 1.12 : heap * (0.92 + 0.16 * hash(d, i, 3))),
      rot: hash(d, i, 4) * TAU, seed: d * 100 + i,
    });
  };
  for (const p of PATHS[d]) {
    let L = 0; const seg = [];
    for (let i = 1; i < p.length; i++) { const l = Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); seg.push(l); L += l; }
    const n = Math.max(1, Math.round((L * (kx + ky)) / 2 / sp));
    for (let j = 0; j <= n; j++) {
      let u = (j / n) * L, i = 0;
      while (i < seg.length - 1 && u > seg[i]) { u -= seg[i]; i++; }
      const f = seg[i] ? Math.min(1, u / seg[i]) : 0;
      add(p[i][0] + (p[i + 1][0] - p[i][0]) * f, p[i][1] + (p[i + 1][1] - p[i][1]) * f, false);
    }
  }
  for (const [x, y] of FEET[d] ?? []) add(x, y, true);
  SITE_CACHE.set(key, out);
  return out;
}

/** The hour as one heap of puffs, centred on x = 0, foot at y = 0 (kettle frame). */
const HOUR_CACHE = new Map();
function hourSites(h) {
  if (HOUR_CACHE.has(h)) return HOUR_CACHE.get(h);
  const ds = String(h).split('').map(Number);
  const out = [];
  const y0 = -36 * HR.ky;
  // set like type: each numeral as wide as its puffs, a small gap between
  const ext = ds.map((d) => {
    let a = Infinity, b = -Infinity;
    for (const p of sites(d, HR)) { a = Math.min(a, p.x - p.s); b = Math.max(b, p.x + p.s); }
    return [a, b];
  });
  const GAP = 1.5;
  const total = ext.reduce((t, [a, b]) => t + b - a, 0) + GAP * (ds.length - 1);
  let cur = -total / 2;
  ds.forEach((d, k) => {
    const x0 = cur - ext[k][0];
    cur += ext[k][1] - ext[k][0] + GAP;
    for (const p of sites(d, HR)) out.push({ ...p, x: x0 + p.x, y: y0 + p.y, seed: p.seed + 1000 * (k + 1) });
  });
  HOUR_CACHE.set(h, out);
  return out;
}

/**
 * Which old puffs go where: greedy nearest pairs within `maxD`. Returns
 * { moves: [[a, b]], spare: [a], fresh: [b] } (indices).
 */
const MATCH_CACHE = new Map();
function match(key, A, B, maxD) {
  if (MATCH_CACHE.has(key)) return MATCH_CACHE.get(key);
  const pairs = [];
  for (let i = 0; i < A.length; i++)
    for (let j = 0; j < B.length; j++) {
      const d = Math.hypot(A[i].x - B[j].x, A[i].y - B[j].y);
      if (d < maxD) pairs.push([d, i, j]);
    }
  pairs.sort((p, q) => p[0] - q[0]);
  const ua = new Uint8Array(A.length), ub = new Uint8Array(B.length), moves = [];
  for (const [, i, j] of pairs) if (!ua[i] && !ub[j]) { ua[i] = ub[j] = 1; moves.push([i, j]); }
  const spare = [], fresh = [];
  for (let i = 0; i < A.length; i++) if (!ua[i]) spare.push(i);
  for (let j = 0; j < B.length; j++) if (!ub[j]) fresh.push(j);
  const r = { moves, spare, fresh };
  MATCH_CACHE.set(key, r);
  return r;
}

// ------------------------------------------------------------ the scene

const MIN_X = [56, 92], MIN_Y = 3;     // the minute heaps' boxes
const SHELF = 62;                       // the cabinet floor
const PIV = [23, 43];                   // the kettle's pivot, on its wall bracket
const TILT = 0.26;                      // how far it tips to pour (rad)
const HEAP_DY = -2;                     // the hour heap's foot, in the kettle frame
const GRAV = 120;                       // px/s², for everything in the air

/** Kettle frame -> screen, tipped by `th` (clockwise). */
function kettleToScreen(x, y, th, ox, oy) {
  const c = Math.cos(th), s = Math.sin(th);
  return [PIV[0] + ox + x * c - y * s, PIV[1] + oy + x * s + y * c];
}

/** The kettle's tip angle at `rel` seconds from a minute turn. */
function tiltAt(rel) {
  if (rel < -1.2 || rel > 3) return 0;
  if (rel < -0.3) return TILT * ease.inOutCubic((rel + 1.2) / 0.9);
  if (rel < 1.5) return TILT + 0.025 * Math.sin((rel + 0.3) * 13) * (1 - (rel + 0.3) / 1.8);
  const u = (rel - 1.5) / 1.5;
  return TILT * (1 - ease.inOutCubic(u)) - 0.07 * Math.sin(u * Math.PI) * (1 - u);   // rocks back past upright
}

/** How far the lid is pushed up at `rel` seconds from a minute turn (px). */
function liftAt(rel) {
  if (rel < -0.6 || rel > 2.4) return 0;
  if (rel < -0.15) return 6 * ease.outCubic((rel + 0.6) / 0.45);
  if (rel < 1.7) return 6 + 1.2 * Math.sin((rel + 0.15) * 31) * Math.min(1, 1.7 - rel);
  const u = (rel - 1.7) / 0.7;
  return 6 * (1 - ease.outBounce(u));
}

/** Point on a ballistic flight from p0 to p1 taking T seconds, at time t. */
function flight(p0, p1, T, t) {
  const vx = (p1[0] - p0[0]) / T;
  const vy = (p1[1] - p0[1] - 0.5 * GRAV * T * T) / T;
  return [p0[0] + vx * t, p0[1] + vy * t + 0.5 * GRAV * t * t];
}

/** Paint a box: fn(x, y) at pixel centres returns 1 lit, 0 cleared, -1 untouched. */
function paint(g, x0, y0, w, h, fn) {
  const xa = Math.max(0, Math.floor(x0)), ya = Math.max(0, Math.floor(y0));
  const xb = Math.min(g.width, Math.ceil(x0 + w)), yb = Math.min(g.height, Math.ceil(y0 + h));
  for (let y = ya; y < yb; y++)
    for (let x = xa; x < xb; x++) {
      const v = fn(x + 0.5, y + 0.5);
      if (v >= 0) g.buf[y * g.width + x] = v;
    }
}

/** The kettle: a rim with a pouring lip, straight sides, a round bottom, a shine. */
function drawKettle(g, th, ox, oy) {
  const c = Math.cos(th), s = Math.sin(th);
  const cx = PIV[0] + ox, cy = PIV[1] + oy;
  const RX = 19.5, SIDE = 2, RY = 7;
  // signed "how far inside" the pot, in px: positive inside, the wall is its outer 1.3 px
  const inside = (x, y) => {
    if (y < -2.6) return -1;
    if (y < SIDE) return RX - Math.abs(x);
    return (1 - Math.hypot(x / RX, (y - SIDE) / RY)) * Math.min(RX, RY);
  };
  paint(g, cx - 28, cy - 28, 56, 56, (px, py) => {
    const dx = px - cx, dy = py - cy;
    const x = dx * c + dy * s, y = -dx * s + dy * c;   // into the kettle frame
    if (y >= -5.6 && y < -2.6 && x > -21.5 && x < 21.5) return 1;   // the rim
    if (x >= 21 && x < 25.5 && y >= -6.6 - (x - 21) * 0.4 && y < -4 + (x - 21) * 0.2) return 1;   // the lip
    const d = inside(x, y);
    if (d < 0) return -1;
    if (d < 1.3 + (y > SIDE + 3 ? 0.5 : 0)) return 1;               // the wall, heavier underneath
    if (x < -12 && x > -14.5 && y > -1 && y < SIDE + 3) return 1;    // the shine
    if (y > -1.2 && y < -0.2 && Math.abs(x) < 18) return 1;          // the band under the rim
    return 0;
  });
}

/** The wall bracket the kettle swings on: an arm from the cabinet wall and a hub. */
function drawBracket(g, ox, oy) {
  const x = PIV[0] + ox, y = PIV[1] + oy;
  g.fillRect(0, y - 1, x, 1, 1);
  g.fillRect(0, y + 1, x - 2, 1, 1);
  g.fillRect(0, y, x, 1, 0);
  g.fillRect(1 + ox, y - 4, 2, 9, 1);
}
function drawHub(g, ox, oy) {
  const x = PIV[0] + ox, y = PIV[1] + oy;
  g.fillCircle(x + 0.5, y + 0.5, 2.6, 0);
  g.ring(x + 0.5, y + 0.5, 1, 2, 1);
}

/**
 * The lid: two flaps hinged at the ends of the rim, standing open at `open`
 * radians from shut (the right one swings `skew` more than the left).
 */
function drawFlaps(g, th, ox, oy, open, skew) {
  const LEN = 12;
  for (const side of [-1, 1]) {
    const phi = open + side * skew;
    const h = kettleToScreen(side * 20.5, -5.6, th, ox, oy);
    // shut, a flap lies inwards along the rim; it opens upwards about its hinge
    const a = th + (side < 0 ? -phi : Math.PI + phi);
    const tip = [h[0] + Math.cos(a) * LEN, h[1] + Math.sin(a) * LEN];
    g.thickLine(h[0], h[1], tip[0], tip[1], 4, 0);
    g.thickLine(h[0], h[1], tip[0], tip[1], 2, 1);
    g.fillCircle(h[0], h[1], 1.6, 1);
  }
}

/** The cabinet floor: a perforated sheet, lit as dashes. */
function drawShelf(g, ox, oy) {
  for (let x = 0; x < W; x++) if ((x + ox) % 4 !== 3) g.pixel(x, SHELF + oy, 1);
}

/**
 * The spill under the kettle: loose popcorn on the floor, a low mound. Which
 * puffs lie where is re-dealt every hour (the storm re-lays it).
 */
function pileSites(seed) {
  const out = [];
  const rows = [[59.5, 4, 48, 7.3, 4]];
  let i = 0;
  for (const [y, x0, x1, step, s] of rows)
    for (let x = x0; x <= x1; x += step, i++)
      out.push({ x: x + (hash(seed, i, 71) - 0.5) * 2.5, y: y + (hash(seed, i, 72) - 0.5) * 1.5, s: s * (0.9 + 0.2 * hash(seed, i, 73)), rot: hash(seed, i, 74) * TAU, seed: 5000 + ((seed * 31 + i) % 4000) });
  return out;
}

// ------------------------------------------------------------ motion

/**
 * The idle pop under a resting puff: does puff `id` jump at absolute time
 * T, and how high is it? Returns [dy, spin, crack 0..1 or -1].
 */
function idleHop(id, T, p) {
  const k0 = Math.floor(T);
  for (let k = k0; k >= k0 - 1; k--) {
    if (hash(id, k, 21) >= p) continue;
    const st = k + hash(id, k, 22) * 0.55, dur = 0.36 + 0.12 * hash(id, k, 24);
    const u = (T - st) / dur;
    if (u < 0 || u > 1) continue;
    const h = 2 + 3.2 * hash(id, k, 23);
    return [-h * 4 * u * (1 - u), (hash(id, k, 25) < 0.5 ? -1 : 1) * u * 2, u < 0.3 ? u / 0.3 : -1];
  }
  return null;
}

/** Kettle pops that rattle the lid: lift in px at absolute time T. */
function lidLift(T, pressure) {
  const step = lerp(0.5, 0.16, pressure);
  const n0 = Math.floor(T / step);
  let lift = 0;
  for (let n = n0; n >= n0 - 2; n--) {
    if (hash(n, 2, 11 + (pressure > 0 ? 1 : 0)) > 0.7 + 0.3 * pressure) continue;
    const tn = n * step + hash(n, 1, 11) * step * 0.8;
    const u = (T - tn) / 0.16;
    if (u >= 0 && u < 1) lift = Math.max(lift, (1.6 + 2.4 * pressure) * Math.sin(u * Math.PI));
  }
  return lift;
}

export default {
  name: 'Popcorn',
  blurb: 'The time is popcorn: the hour heaped up out of a hanging kettle between its rattling lid flaps, the minutes in big heaps on the floor; kernels keep popping under them, each minute the kettle tips and fresh kernels burst in the air and land as the new numeral, and on the hour the lid bangs open in a storm of popcorn.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  driver: 'full',

  frame(g, ctx) {
    const ms = ctx.date.getTime();
    const T = ms / 1000;
    const [ox, oy0] = orbit(ctx.date, 2);
    const oy = Math.round((oy0 - 2) / 2);   // the floor never leaves the glass: up to 2 px up, never down
    ctx.oled.contrast(Math.round(0xcf + (0x14 - 0xcf) * ctx.night));

    // The turn this frame belongs to: the coming one from :57, else the last.
    const sec = ctx.fields.sec;
    const turnMs = (sec >= 57 ? Math.ceil(ms / 60000) : Math.floor(ms / 60000)) * 60000;
    const rel = (ms - turnMs) / 1000;
    const A = clockFields(new Date(turnMs - 60000)), B = clockFields(new Date(turnMs));
    const hourTurn = B.m === 0 && A.h !== B.h;
    const live = rel > -3 && rel < 5;

    // the kettle's attitude
    let th = 0, kx = 0, ky = 0, pressure = 0;
    const lift = live && !hourTurn ? liftAt(rel) * 0.5 : 0;   // the flaps forced open by the pour
    if (live && !hourTurn) th = tiltAt(rel);
    if (live && !hourTurn && rel > -0.2 && rel < 0.1) ky = -1.5 * Math.sin(((rel + 0.2) / 0.3) * Math.PI);
    if (live && hourTurn) {
      pressure = rel < 0 ? clamp01((rel + 2.6) / 2.6) : clamp01(1 - rel / 0.3);
      const shake = rel < 0 ? pressure : Math.max(0, 1 - rel / 1.2);
      th = 0.05 * shake * Math.sin(rel * 47);
      kx = shake * 0.9 * Math.sin(rel * 61);
      ky = rel > 0 && rel < 0.25 ? 2 * Math.sin((rel / 0.25) * Math.PI) : 0;
    }
    const K = (x, y) => kettleToScreen(x, y + HEAP_DY, th, ox + kx, oy + ky);

    // The lid rests on the two highest puffs under it, and tips to suit them.
    const lidOn = (L) => {
      let l = 0, r = 0;
      for (const p of L) {
        if (p.x > -15 && p.x < -3) l = Math.min(l, p.y - p.s * 1.05);
        if (p.x > 3 && p.x < 15) r = Math.min(r, p.y - p.s * 1.05);
      }
      if (!l) l = r; if (!r) r = l;
      const a = Math.max(-0.3, Math.min(0.3, Math.atan2(r - l, 20)));
      return [Math.min(l, r) + Math.abs(r - l) * 0.5, a];
    };
    const HA = hourSites(A.h), HB = hourSites(B.h);
    const topA = lidOn(HA), topB = lidOn(HB);
    const mouth = (i) => K(-12 + 24 * hash(i, 9, 41), topA[0] - 2);
    const back = [], mid = [], front = [], cracks = [], kernels = [];
    const put = (L, x, y, s, rot, seed) => L.push([x, y, s, rot, seed]);

    // ---- the minute heaps
    for (let i = 0; i < 2; i++) {
      const a = i ? A.m % 10 : Math.floor(A.m / 10), b = i ? B.m % 10 : Math.floor(B.m / 10);
      const X = MIN_X[i] + ox, Y = MIN_Y + oy;
      const SB = sites(b, MIN);
      const turning = live && a !== b && rel > -0.8;
      if (!turning) {
        const shown = rel < 0 ? sites(a, MIN) : SB, d = rel < 0 ? a : b;
        shown.forEach((p, j) => {
          const id = (i + 1) * 1000 + d * 50 + j;
          const hop = idleHop(id, T, 0.05);
          let x = X + p.x, y = Y + p.y, rot = p.rot;
          if (hop) { y += hop[0]; rot += hop[1]; if (hop[2] >= 0) cracks.push([x, Y + p.y + p.s * 0.6, p.s * 0.7, hop[2], id]); }
          put(back, x, y, p.s, rot, p.seed);
        });
        continue;
      }
      const SA = sites(a, MIN);
      const M = match(`m${a}${b}`, SA, SB, 6);
      // the floor goes hot: the puffs the new numeral can use hop over to it
      for (const [ia, ib] of M.moves) {
        const pa = SA[ia], pb = SB[ib];
        const st = 0.02 + 0.5 * hash(ia, ib, 31), dur = 0.42 + 0.02 * Math.hypot(pb.x - pa.x, pb.y - pa.y);
        const u = (rel - st) / dur;
        if (u <= 0) { put(back, X + pa.x, Y + pa.y, pa.s, pa.rot, pa.seed); continue; }
        if (u >= 1) {
          const sq = u < 1.4 ? Math.sin(((u - 1) / 0.4) * Math.PI) * 1.2 : 0;   // a little bounce on landing
          put(back, X + pb.x, Y + pb.y - sq, pb.s, pb.rot, pb.seed);
          continue;
        }
        const e = ease.inOutQuad(u);
        const x = X + lerp(pa.x, pb.x, e), y = Y + lerp(pa.y, pb.y, e) - (5 + 0.25 * Math.hypot(pb.x - pa.x, pb.y - pa.y)) * 4 * u * (1 - u);
        if (u < 0.25) cracks.push([X + pa.x, Y + pa.y + pa.s * 0.6, pa.s * 0.7, u / 0.25, ia * 7 + ib]);
        put(back, x, y, lerp(pa.s, pb.s, e), lerp(pa.rot, pb.rot, e) + u * TAU * 0.5, u < 0.5 ? pa.seed : pb.seed);
      }
      // the spare ones jump off the front of the floor
      for (const ia of M.spare) {
        const pa = SA[ia];
        const st = 0.0 + 0.35 * hash(ia, a, 33);
        const t = rel - st;
        if (t <= 0) { put(back, X + pa.x, Y + pa.y, pa.s, pa.rot, pa.seed); continue; }
        const dir = pa.x < MIN.w / 2 ? -1 : 1;
        const x = X + pa.x + dir * (14 + 14 * hash(ia, a, 34)) * t, y = Y + pa.y - (34 + 12 * hash(ia, a, 35)) * t + 0.5 * GRAV * 1.4 * t * t;
        if (y < H + 12) put(front, x, y, pa.s * (1 + 0.25 * t), pa.rot + dir * t * 9, pa.seed);
        if (t < 0.12) cracks.push([X + pa.x, Y + pa.y + pa.s * 0.6, pa.s * 0.7, t / 0.12, ia]);
      }
      // fresh kernels from the kettle burst in the air and land where they are still wanted
      const fresh = M.fresh.slice().sort((p, q) => SB[q].y - SB[p].y);
      fresh.forEach((ib, r) => {
        const pb = SB[ib];
        const land = (hourTurn ? 0.5 : 0.08) + (hourTurn ? 1.5 : 1.35) * (fresh.length > 1 ? r / (fresh.length - 1) : 0) + 0.08 * hash(ib, b, 36);
        const Tf = hourTurn ? 1.15 : 0.72;
        const t0 = land - Tf, t = rel - t0;
        const dest = [X + pb.x, Y + pb.y];
        if (t >= Tf) {
          const sq = t < Tf + 0.22 ? Math.sin(((t - Tf) / 0.22) * Math.PI) * 1.5 : 0;
          put(back, dest[0], dest[1] - sq, pb.s, pb.rot, pb.seed);
          return;
        }
        if (t < 0) return;
        const from = hourTurn ? mouth(ib + 17 * b) : kettleToScreen(24, -7.5, tiltAt(t0), ox, oy);
        const [x, y] = flight(from, dest, Tf, t);
        const burst = Tf * 0.2;
        if (t < burst) kernels.push([x, y, t * 20]);
        else {
          const u = clamp01((t - burst) / 0.1);
          put(front, x, y, pb.s * (0.55 + 0.45 * u), pb.rot + (Tf - t) * 7, pb.seed);
          if (t < burst + 0.12) cracks.push([x, y, pb.s * 0.8, (t - burst) / 0.12, ib * 3 + b]);
        }
      });
    }

    // ---- the spill on the floor, and the puffs that pop over the rim onto it
    const pile = pileSites(Math.floor(ms / 3600000));
    pile.forEach((p, j) => {
      const hop = idleHop(7000 + j, T, 0.02);
      put(back, p.x + ox, p.y + oy + (hop ? hop[0] * 0.6 : 0), p.s, p.rot + (hop ? hop[1] : 0), p.seed);
    });
    {
      // every couple of seconds a puff pops out over the rim: onto the spill, or
      // across onto a minute heap, where it bounces off and drops off the floor
      const step = 1.7, n0 = Math.floor(T / step);
      for (let n = n0; n >= n0 - 2; n--) {
        const t = T - n * step - hash(n, 1, 81) * 0.6;
        if (t < 0 || t > 2.4 || (live && Math.abs(rel) < 3.5)) continue;
        const H0 = rel < 0 ? topA : topB;
        const far = hash(n, 5, 81) < 0.55;
        const side = far ? 1 : hash(n, 2, 81) < 0.5 ? -1 : 1;
        const from = K(side * (4 + 6 * hash(n, 3, 81)), H0[0] + 2);
        if (t < 0.1) cracks.push([from[0], from[1], 3, t / 0.1, n]);
        const spin = (hash(n, 6, 81) < 0.5 ? -1 : 1) * 9;
        if (!far) {
          const land = pile[Math.floor(hash(n, 4, 81) * pile.length)];
          const to = [land.x + ox, land.y + oy - land.s * 0.8], Tf = 0.9;
          if (t >= Tf) continue;   // landed: it is one of the spill now
          const [x, y] = flight(from, to, Tf, t);
          put(front, x, y, 4.2, t * spin, 6000 + (n % 500));
          continue;
        }
        // onto the top of a minute heap
        const slot = hash(n, 7, 81) < 0.5 ? 0 : 1;
        const d = slot ? Math.floor((rel < 0 ? A : B).m % 10) : Math.floor((rel < 0 ? A : B).m / 10);
        const SS = sites(d, MIN);
        let top = SS[0];
        for (const p of SS) if (p.y - p.x * 0.05 * (hash(n, 8, 81) - 0.5) < top.y) top = p;
        const hit = [MIN_X[slot] + ox + top.x + (hash(n, 9, 81) - 0.5) * 6, MIN_Y + oy + top.y - top.s - 2];
        const Tf = 0.75 + 0.2 * slot;
        if (t < Tf) {
          const [x, y] = flight(from, hit, Tf, t);
          put(front, x, y, 4.2, t * spin, 6000 + (n % 500));
          continue;
        }
        // it bounces off and falls past the heap, off the front of the floor
        const tb = t - Tf, dir = hash(n, 10, 81) < 0.5 ? -1 : 1;
        const x = hit[0] + dir * 22 * tb, y = hit[1] - 38 * tb + 0.5 * GRAV * 1.3 * tb * tb;
        if (tb < 0.1) cracks.push([hit[0], hit[1] + 3, 3.5, tb / 0.1, n + 7]);
        if (y < H + 8) put(front, x, y, 4.2 * (1 + 0.3 * tb), (Tf + tb) * spin, 6000 + (n % 500));
      }
    }

    // ---- the hour heap, in the kettle
    const hourLive = live && hourTurn && rel > -0.05;
    const hourIdle = (L, h) => L.forEach((p, j) => {
      const id = 9000 + h * 60 + j;
      const hop = idleHop(id, T, lerp(0.05, 0.28, pressure));
      let [x, y] = K(p.x, p.y), rot = p.rot + th;
      if (hop) { y += hop[0] * (1 + 0.4 * pressure); rot += hop[1]; }
      put(mid, x, y, p.s, rot, p.seed);
    });
    if (!hourLive) hourIdle(rel < 0 || !hourTurn ? (rel < 0 ? HA : HB) : HB, rel < 0 ? A.h : B.h);
    else {
      const HM = match(`h${A.h}-${B.h}`, HA, HB, 12);
      for (const [ia, ib] of HM.moves) {
        const pa = HA[ia], pb = HB[ib];
        const d = Math.hypot(pb.x - pa.x, pb.y - pa.y);
        // near ones just hop; the rest erupt and rain back down into place
        const st = d < 2 ? 0.1 + 0.5 * hash(ia, 5, 51) : 0.2 * hash(ia, 6, 51);
        const Tf = d < 2 ? 0.4 : 0.45 + 0.2 * hash(ib, 7, 51);
        const t = rel - st;
        const A0 = K(pa.x, pa.y), B0 = K(pb.x, pb.y);
        if (t <= 0) { put(mid, A0[0], A0[1], pa.s, pa.rot, pa.seed); continue; }
        if (t >= Tf) { put(mid, B0[0], B0[1], pb.s, pb.rot, pb.seed); continue; }
        const [x, y] = d < 2 ? [B0[0], B0[1] - 3.5 * 4 * (t / Tf) * (1 - t / Tf)] : flight(A0, B0, Tf, t);
        put(mid, x, y, pb.s, pb.rot + t * 10, t < Tf / 2 ? pa.seed : pb.seed);
      }
      for (const ia of HM.spare) {
        const pa = HA[ia], t = rel - 0.12 * hash(ia, 8, 51);
        const A0 = K(pa.x, pa.y);
        if (t <= 0) { put(mid, A0[0], A0[1], pa.s, pa.rot, pa.seed); continue; }
        const x = A0[0] + (hash(ia, 9, 51) - 0.4) * 70 * t, y = A0[1] - 130 * t + 0.5 * GRAV * t * t;
        if (y < H + 10) put(front, x, y, pa.s * 1.2, pa.rot + t * 12, pa.seed);
      }
      HM.fresh.forEach((ib) => {
        const pb = HB[ib], st = 0.1 + 0.35 * hash(ib, 10, 51), Tf = 0.45;
        const t = rel - st, B0 = K(pb.x, pb.y);
        if (t >= Tf) { put(mid, B0[0], B0[1], pb.s, pb.rot, pb.seed); return; }
        if (t < 0) return;
        const [x, y] = flight(mouth(ib), B0, Tf, t);
        put(mid, x, y, pb.s * clamp01(0.5 + t * 4), pb.rot + t * 10, pb.seed);
      });
    }

    // ---- the storm on the hour: popcorn over the whole cabinet
    if (live && hourTurn && rel > 0) {
      for (let i = 0; i < 46; i++) {
        const st = 1.7 * hash(i, 1, 61) ** 1.6, t = rel - st;
        if (t < 0) continue;
        const [x0, y0] = mouth(i + 300);
        const vx = -15 + 105 * hash(i, 2, 61), vy = -(60 + 65 * hash(i, 3, 61));
        const x = x0 + vx * t, y = y0 + vy * t + 0.5 * GRAV * t * t;
        if (y > H + 10 || x > W + 10) continue;
        if (t < 0.06) kernels.push([x, y, t * 30]);
        else {
          const s = 3.4 + 1.8 * hash(i, 4, 61);
          put(front, x, y, s, t * (hash(i, 5, 61) < 0.5 ? 8 : -8), 4000 + i);
          if (t < 0.16) cracks.push([x, y, s * 0.8, (t - 0.06) / 0.1, i]);
        }
      }
    }

    // ---- the two lid flaps, hinged on the rim, held open by the popcorn
    const REST = 1.92;
    let flap = REST + 0.09 * lidLift(T, pressure) + 0.35 * (lift / 3);
    if (live && hourTurn && rel > 0) {
      const t = rel;
      // the bang: thrown flat open, then swinging back on their hinges
      flap = REST + (Math.PI - REST + 0.1) * Math.exp(-1.5 * t) * Math.cos(5.5 * t) * clamp01(t / 0.05);
    }

    // ---- draw, back to front
    drawShelf(g, ox, oy);
    back.sort((p, q) => p[1] - q[1]);
    for (const p of back) drawPuff(g, ...p);
    mid.sort((p, q) => p[1] - q[1]);
    for (const p of mid) drawPuff(g, ...p);
    drawBracket(g, ox, oy);
    drawKettle(g, th, ox + kx, oy + ky);
    drawHub(g, ox, oy);
    drawFlaps(g, th, ox + kx, oy + ky, flap, live && hourTurn && rel > 0 ? 0.25 * Math.sin(rel * 3) * Math.exp(-rel) : 0);
    for (const p of front) drawPuff(g, ...p);
    for (const [x, y, r] of kernels) drawKernel(g, x, y, r);
    for (const [x, y, r, u, seed] of cracks) drawCrack(g, x, y, r, u, seed);
  },
};

// ------------------------------------------------------------ review sheet
export function drawDigitSheet(g) {
  for (let d = 0; d < 10; d++) for (const p of sites(d, MIN)) drawPuff(g, 4 + d * 40 + p.x, 4 + p.y, p.s, p.rot, p.seed);
  for (let h = 0; h < 24; h++) {
    const L = hourSites(h);
    for (const p of L.slice().sort((a, b) => a.y - b.y)) drawPuff(g, 24 + (h % 12) * 34 + p.x, 96 + Math.floor(h / 12) * 34 + p.y, p.s, p.rot, p.seed);
  }
}
