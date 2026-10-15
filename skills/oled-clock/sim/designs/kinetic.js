// Kinetic — a field of tiny clocks whose idle hands are a pendulum wave.
//
// After Humans Since 1982's "A Million Times": the face is 17 x 9 small
// clocks with two equal hands each and no dials. The time is drawn by the
// clocks that lock their hands along its strokes, hours high on the left,
// minutes low on the right. A clock has only two hands, each pointing at one
// of its eight neighbours, and that is the typeface: corners are cut by
// diagonal hands (a hexagonal 0, a 3 of two arcs), and no stroke can branch,
// so where a third would meet the glyphs break like a stencil (the 8 is an S
// whose ends reach for the waist and stop short). Locked hands are tapered
// and stop a pixel short of their neighbour's, so strokes read as hands
// meeting tip to tip. A digit's other clocks fold their hands away to a dot,
// so the counters stay clear. Every ten seconds a spark runs through the
// time, digit by digit in stroke order: each clock scissors its hands once
// round. Idle clocks touching a stroke never stretch, so ribbons stop short.
//
// Every clock outside the digits holds its hands as one rod through the hub
// and swings it like a pendulum, and the
// field is a pendulum wave: column i swings 30 + i times a minute, so the
// columns drift into travelling waves, standing waves and apparent chaos,
// and fall back into unison exactly once a minute. That is the seconds: the
// field visibly re-gathers as :00 approaches. Idle hands are drawn short and
// stretch as they swing through the bottom, so bands of long hands drift
// across the field and all reach out together at :00; hands grow to full
// length as they engage.
//
// The minute: from :58 a whirlpool opens on the changing digit; its hands,
// and the pendulums round it, turn tangent to the flow and wheel round; two
// changing digits turn as counter-rotating gears. After :00 the whirlpool
// lays the new digit down from its centre outwards, each clock catching its
// pose with an overshoot, and lets the pendulums go. The digits beside it
// shiver as it closes.
//
// The hour: all four digits let go, the whole field winds into one vortex,
// settles as one giant clock (concentric dial, a long minute hand at 12,
// the hour hand, a real clock at the hub) and unwinds into the new time.
//
// Everything is a closed-form function of the wall clock: the pendulum
// phase of column i is 2 pi (30 + i) s / 60, and every blend starts from a
// value that is itself computed in closed form at a fixed instant.
// Burn-in: the field walks a 2 px orbit, one step a minute, slid during
// the turn. From 23:00 to 07:00 the panel dims (ctx.night).

import { clamp, clockFields, orbit } from '../js/kit.js';

const PI = Math.PI, TAU = 2 * PI;

// ------------------------------------------------------------ the field
const COLS = 17, ROWS = 9, DX = 8, DY = 7, X0 = 0, Y0 = 4;
const L = 4, SHORT = 1.8;                         // hand length, px: engaged, idle
const SLOTS = [[1, 0], [5, 0], [9, 4], [13, 4]];  // top-left clock of each digit
const PARK = 1.25 * PI;                           // 7:30

// ------------------------------------------------------------ glyphs
// Each digit is a few paths over a 3 x 5 grid of clocks; a step between
// neighbours is drawn by both clocks pointing at each other. Nodes that end
// a path can turn their second hand into a 4 px stub (`stubs`): hooks and
// stencil bars. Every node has at most two hands, by construction.
// A step to a neighbour (dc, dr), as a clock angle on the real pitch: the
// diagonals are 49 degrees, and both clocks point exactly at each other.
const stepAngle = (dc, dr) => Math.atan2(dc * DX, -dr * DY);
const STEP = { N: [0, -1], NE: [1, -1], E: [1, 0], SE: [1, 1], S: [0, 1], SW: [-1, 1], W: [-1, 0], NW: [-1, -1] };

function glyph(paths, stubs = {}) {
  const nodes = new Map();   // "c,r" -> { a: [angles], order }
  let order = 0;
  const add = (c, r, a) => {
    const k = `${c},${r}`;
    if (!nodes.has(k)) nodes.set(k, { c, r, a: [], order: order++ });
    nodes.get(k).a.push(a);
  };
  for (const p of paths) {
    // expand corner points into unit steps (straight or diagonal)
    const pts = [p[0]];
    for (let i = 1; i < p.length; i++) {
      let [c, r] = pts.at(-1);
      const [c1, r1] = p[i];
      while (c !== c1 || r !== r1) { c += Math.sign(c1 - c); r += Math.sign(r1 - r); pts.push([c, r]); }
    }
    for (let i = 0; i + 1 < pts.length; i++) {
      const [c, r] = pts[i], [c1, r1] = pts[i + 1];
      add(c, r, stepAngle(c1 - c, r1 - r)); add(c1, r1, stepAngle(c - c1, r - r1));
    }
  }
  for (const [k, ds] of Object.entries(stubs)) {
    const [c, r] = k.split(',').map(Number);
    for (const d of ds) add(c, r, stepAngle(...STEP[d]));
  }
  const out = [];
  for (const n of nodes.values()) {
    if (n.a.length > 2) throw new Error(`kinetic glyph: node ${n.c},${n.r} has ${n.a.length} hands`);
    out.push({ c: n.c, r: n.r, a: [n.a[0], n.a[1] ?? n.a[0]], order: n.order });
  }
  // stroke order: path order (the order nodes were first met)
  out.sort((p, q) => p.order - q.order);
  out.forEach((n, i) => { n.order = i / Math.max(1, out.length - 1); });
  return out;
}

// Corners are cut by diagonal hands, so bowls come out round-ish: a narrow
// hexagon 0, a 3 of two arcs meeting at the waist, an 8 that is an S whose
// ends reach for the waist and stop short (the stencil break).
export const GLYPHS = [
  glyph([[[1, 0], [2, 1], [2, 3], [1, 4], [0, 3], [0, 1], [1, 0]]]),
  glyph([[[0, 1], [1, 0], [1, 4]]], { '0,4': ['E'], '2,4': ['W'] }),
  glyph([[[0, 1], [1, 0], [2, 1], [0, 3], [0, 4], [2, 4]]]),
  glyph([[[0, 1], [1, 0], [2, 1], [1, 2], [2, 3], [1, 4], [0, 3]]]),
  glyph([[[2, 4], [2, 0], [0, 2], [0, 3], [1, 3]]], { '1,3': ['E'] }),
  glyph([[[2, 0], [0, 0], [0, 2], [1, 2], [2, 3], [1, 4], [0, 3]]]),
  glyph([[[2, 0], [1, 0], [0, 1], [0, 3], [1, 4], [2, 3], [1, 2]]], { '1,2': ['W'] }),
  glyph([[[0, 0], [2, 0], [1, 2], [1, 4]]]),
  glyph([[[0, 1], [1, 0], [2, 1], [0, 3], [1, 4], [2, 3]]], { '0,1': ['SE'], '2,3': ['NW'] }),
  glyph([[[0, 4], [1, 4], [2, 3], [2, 1], [1, 0], [0, 1], [1, 2]]], { '1,2': ['E'] }),
];

// ------------------------------------------------------------ motion
const K = 30;                 // column i swings K + i times a minute
const AMP = 0.85;             // pendulum amplitude, rad

/** A free clock's hand h at seconds-into-minute tm: a rod through the hub, swinging like a pendulum. */
const pend = (i, h, tm) => (h ? 0 : PI) + AMP * Math.sin((TAU * (K + i) * tm) / 60);

/** Underdamped step response, 0 -> 1, zero velocity at the start. */
function spring(x, w = 10, z = 0.48) {
  if (x <= 0) return 0;
  const wd = w * Math.sqrt(1 - z * z);
  return 1 - Math.exp(-z * w * x) * (Math.cos(wd * x) + ((z * w) / wd) * Math.sin(wd * x));
}
const smoother = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * u * (u * (u * 6 - 15) + 10));
/** Nearest copy of angle a to angle ref. */
const near = (a, ref) => a + TAU * Math.round((ref - a) / TAU);
const angDist = (a, b) => Math.abs(near(a, b) - b);

// ------------------------------------------------------------ drawing
/** A locked hand: tapered from the hub to a fine tip, so strokes read as chains. */
function taperHand(g, x, y, a, r0 = 1.45, r1 = 0.55, len = L) {
  const sx = Math.sin(a), sy = -Math.cos(a);
  g.fillWhere((px, py) => {
    const dx = px - x, dy = py - y;
    const u = clamp((dx * sx + dy * sy) / len, 0, 1);
    const ex = dx - u * len * sx, ey = dy - u * len * sy;
    return ex * ex + ey * ey <= (r0 + (r1 - r0) * u) ** 2;
  }, 1, [x - len - 2, y - len - 2, 2 * len + 4, 2 * len + 4]);
}

/** One clock: tapered hands with a hub if locked, hairlines if not. */
export function drawClock(g, x, y, a1, a2, locked, ext = 1) {
  if (locked) {
    // each hand stops a pixel short of its neighbour's, so a stroke reads as
    // hands meeting tip to tip
    const reach = (a) => (Math.abs(Math.sin(a)) * DX + Math.abs(Math.cos(a)) * DY - 1.3) / 2;
    taperHand(g, x, y, a1, 1.45, 0.55, reach(a1)); taperHand(g, x, y, a2, 1.45, 0.55, reach(a2));
    g.fillCircle(x, y, 1.4);
    return;
  }
  // idle hands are drawn short, and reach out to full length as they engage
  const len = ext >= 0 ? SHORT + (L - SHORT) * ext : SHORT * (1 + 0.75 * ext);   // parked: folded to a dot
  x += 0.5; y += 0.5;
  g.thickLine(x, y, x + len * Math.sin(a1), y - len * Math.cos(a1), 1);
  g.thickLine(x, y, x + len * Math.sin(a2), y - len * Math.cos(a2), 1);
}

const fieldsCache = new Map();
function fieldsOf(key) {
  let f = fieldsCache.get(key);
  if (!f) {
    f = clockFields(new Date(key * 60000));
    fieldsCache.set(key, f);
    if (fieldsCache.size > 8) fieldsCache.delete(fieldsCache.keys().next().value);
  }
  return f;
}
const digitsOf = (f) => [...`${f.hh}${f.mm}`].map(Number);
/**
 * Every clock a set of digits uses: Map index -> { a, w, slot }. `w` is 1
 * for a clock drawing a stroke, 0 for one parked at 7:30 inside the digit.
 */
function poseMap(digits) {
  const m = new Map();
  digits.forEach((d, k) => {
    const [c0, r0] = SLOTS[k];
    for (let r = 0; r < 5; r++)
      for (let c = 0; c < 3; c++) {
        const n = GLYPHS[d].find((q) => q.c === c && q.r === r);
        m.set((r0 + r) * COLS + c0 + c, n ? { a: n.a, w: 1, slot: k, order: n.order } : { a: [PARK, PARK], w: 0, slot: k, order: 0 });
      }
  });
  return m;
}
const poseCache = new Map();
function posesFor(key) {
  let p = poseCache.get(key);
  if (!p) {
    p = poseMap(digitsOf(fieldsOf(key)));
    // the idle clocks touching a stroke: they never stretch, so a ribbon
    // stops one clock short of a glyph instead of growing it a stem
    p.near = new Set();
    for (const [idx, n] of p) {
      if (!n.w) continue;
      const i = idx % COLS, j = Math.floor(idx / COLS);
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          const k = (j + dj) * COLS + i + di;
          if (i + di >= 0 && i + di < COLS && j + dj >= 0 && j + dj < ROWS && !p.has(k)) p.near.add(k);
        }
    }
    poseCache.set(key, p);
    if (poseCache.size > 6) poseCache.delete(poseCache.keys().next().value);
  }
  return p;
}
const offsetFor = (key) => { const [x, y] = orbit(new Date(key * 60000 + 30000), 2, 1); return [x, clamp(y, -1, 1)]; };
const slotCentre = (k) => [X0 + DX * (SLOTS[k][0] + 1), Y0 + DY * (SLOTS[k][1] + 2)];

/** Everything about the turn nearest wall time T. */
function turnInfo(T) {
  const key = Math.floor(T / 60), s = T - key * 60;
  const turn = s >= 50 ? key + 1 : key;
  const oldD = digitsOf(fieldsOf(turn - 1)), newD = digitsOf(fieldsOf(turn));
  const hour = fieldsOf(turn).m === 0;
  const changed = oldD.map((d, k) => hour || d !== newD[k]);
  // one whirlpool per changing digit; neighbours turn opposite ways, like gears
  const pools = [];
  changed.forEach((ch, k) => { if (ch) pools.push({ k, c: slotCentre(k), dir: (k % 2 ? -1 : 1) * (turn % 2 ? 1 : -1) }); });
  return {
    turn, tau: T - turn * 60, hour, changed, pools,
    oldP: posesFor(turn - 1), newP: posesFor(turn),
    dir: turn % 2 ? 1 : -1,
    h12: fieldsOf(turn).h12,
  };
}

const CX = 64, CY = 32;

/** The giant clock's pose for one clock (the hour show): two angles, and 1 if it is a hand. */
function facePose(i, j, h12) {
  const x = X0 + DX * i - CX, y = Y0 + DY * j - CY;
  const r = Math.hypot(x, y);
  const al = Math.atan2(x, -y);                    // clock angle of the position
  const ha = (h12 % 12) * (TAU / 12);
  if (r < 1) return [0, ha, 1];                     // the hub: a real clock at HH:00
  for (const [a, len] of [[0, 30], [ha, 21]]) {
    const u = x * Math.sin(a) - y * Math.cos(a), p = x * Math.cos(a) + y * Math.sin(a);
    if (Math.abs(p) < 4 && u > 0 && u < len) return [a, a + PI, 1];
  }
  return [al + PI / 2, al - PI / 2, 0];            // the dial: concentric rings
}
/** Order a pose's two angles to match a pair of hands, so neither crosses. */
const pairTo = (pose, f0, f1) =>
  angDist(pose[0], f0) + angDist(pose[1], f1) <= angDist(pose[1], f0) + angDist(pose[0], f1) ? pose : [pose[1], pose[0]];

/**
 * Both hand angles of clock (i, j) at wall time T, and how much it is part
 * of a stroke (0 hairline .. 1 tapered and locked).
 */
function clockAt(i, j, T, I) {
  const idx = j * COLS + i, x = X0 + DX * i, y = Y0 + DY * j;
  const tau = T - I.turn * 60, T0 = I.turn * 60;
  const free = (h, tt) => pend(i, h, ((tt % 60) + 60) % 60);
  const po = I.oldP.get(idx), pn = I.newP.get(idx);
  const out = [0, 0, 0, 0];   // angle, angle, stroke weight, reach
  let pool = null, pr = 1e9;
  for (const p of I.pools) {
    const r = Math.hypot(x - p.c[0], y - p.c[1]);
    if (r < pr) { pr = r; pool = p; }
  }

  if (po && !I.changed[po.slot]) {
    // locked in an unchanged digit: shiver as the whirlpool closes
    const u = tau - 0.2 - pr / 80;
    const sh = u > 0 && pool ? 0.28 * pool.dir * Math.sin(20 * u) * (1 - Math.exp(-((u / 0.06) ** 2))) * Math.exp(-u / 0.35) : 0;
    out[0] = pn.a[0] + sh; out[1] = pn.a[1] + sh; out[2] = pn.w; out[3] = pn.w ? 1 : -1;
    if (pn.w) { const f = tick(T, tau, pn); out[0] += f; out[1] -= f; }
    return out;
  }
  I.hour ? hourChain(i, j, x, y, T, I, po, pn, free, out) : minuteChain(x, y, T, I, po, pn, free, pool, pr, out);
  if (pn?.w) { const f = tick(T, tau, pn); out[0] += f; out[1] -= f; }
  return out;
}

/**
 * Every ten seconds a spark runs through the time: digit by digit, in
 * stroke order, each locked clock whirls its hands once round in opposite
 * directions, like scissors, so the strokes
 * are seen to be hands. One or two clocks are open at any moment.
 */
function tick(T, tau, p) {
  if (tau < 8 || tau > 52) return 0;
  const u = (tau % 10) - 0.3 - 1.9 * p.slot - 1.5 * p.order;
  return u > 0 && u < 1 ? TAU * smoother(u / 0.32) : 0;   // both hands once round, opposite ways
}

/** The minute: a whirlpool on the changing digit takes the old one and lays down the new. */
function minuteChain(x, y, T, I, po, pn, free, pool, r, out) {
  const tau = T - I.turn * 60, T0 = I.turn * 60;
  const wr = po ? 1 : pool ? 1 - smoother((r - 16) / 13) : 0;
  if (wr <= 0) { out[0] = free(0, T); out[1] = free(1, T); return out; }
  const al = Math.atan2(x - pool.c[0], -(y - pool.c[1]));
  const v0 = (h, tt) => (po ? po.a[h] : free(h, tt));
  const t1 = -2.0 + r / 40, t1a = T0 + t1;
  // the whirlpool's hands: tangent to the flow, wheeling round, twisted into arms
  const swap = po && angDist(po.a[0], al + PI / 2) + angDist(po.a[1], al - PI / 2) > angDist(po.a[1], al + PI / 2) + angDist(po.a[0], al - PI / 2) ? 1 : 0;
  const vort = (h, tt) => al + PI / 2 + (h ^ swap) * PI + pool.dir * (TAU * 1.75 * smoother((tt - T0 + 1.7) / 3.0) + 0.04 * r);
  const vA = (h, tt) => {
    const b = v0(h, tt);
    const rv = near(vort(h, t1a), v0(h, t1a)) - vort(h, t1a);
    return b + (vort(h, tt) + rv - b) * wr * smoother((tt - t1a) / 0.9);
  };
  if (po) {
    // lay the new digit down from the centre outwards
    const tc = 0.15 + r / 32, tca = T0 + tc;
    const tgt = pairTo(pn.a, vA(0, tca), vA(1, tca));
    const kc = spring(tau - tc, 9, 0.45);
    for (let h = 0; h < 2; h++) {
      const a = vA(h, T);
      out[h] = a + (near(tgt[h], vA(h, tca)) - a) * kc;
    }
    out[2] = Math.max(po.w * (1 - smoother((tau - t1) / 0.5)), pn.w * kc);
    const pv = smoother((tau - t1) / 0.9), ro = po.w ? 1 : -1, rn = pn.w ? 1 : -1;
    out[3] = clamp(ro + (1 - ro) * pv + (rn - (ro + (1 - ro) * pv)) * kc, -1, 1);
    return out;
  }
  // and let the pendulums go
  const tb = 0.35 + r / 35, tba = T0 + tb;
  const kb = spring(tau - tb, 6, 0.5);
  for (let h = 0; h < 2; h++) {
    const a = vA(h, T), fb = near(free(h, tba), vA(h, tba)) - free(h, tba);
    out[h] = a + (free(h, T) + fb - a) * kb;
  }
  out[3] = clamp(wr * smoother((tau - t1) / 0.9) * (1 - kb), 0, 1);
  return out;
}
/** The hour: release, one vortex, the giant clock, release, the new time. */
function hourChain(i, j, x, y, T, I, po, pn, free, out) {
  const tau = T - I.turn * 60, T0 = I.turn * 60;
  const r = Math.hypot(x - CX, y - CY), al = Math.atan2(x - CX, -(y - CY));
  const vortex = (h, tt) => al + PI / 2 + h * PI + I.dir * TAU * smoother((tt - T0 - 0.3 - r / 60) / 2.0);
  const face = facePose(i, j, I.h12);
  const tr = -2.1 + r / 120, tV = r / 200, tF = 2.5, tB = 4.9 + r / 110, tc = 5.3 + r / 90;
  const pOld = po && pairTo(po.a, free(0, T0 + tr), free(1, T0 + tr));
  const pNew = pn && pairTo(pn.a, free(0, T0 + tc), free(1, T0 + tc));
  const kr = spring(tau - tr, 7, 0.4);
  let lock = po ? po.w * (1 - kr) : 0;
  for (let h = 0; h < 2; h++) {
    let v = free(h, T);
    if (po) {
      const ref = near(pOld[h], free(h, T0 + tr));
      v = tau < tr ? pOld[h] : ref + (v - ref) * kr;
    }
    // free -> vortex -> face -> free
    const rv = near(vortex(h, T0 + tV), free(h, T0 + tV)) - vortex(h, T0 + tV);
    v += (vortex(h, T) + rv - v) * smoother((tau - tV) / 0.8);
    const fa = near(face[h], vortex(h, T0 + tF) + rv);
    const kf = spring(tau - tF, 8, 0.5), kb = spring(tau - tB, 7, 0.45);
    v += (fa - v) * kf;
    const fb = near(free(h, T0 + tB), fa) - free(h, T0 + tB);
    v += (free(h, T) + fb - v) * kb;
    if (face[2]) lock = Math.max(lock, kf * (1 - kb));
    if (pn) {
      const kc = spring(tau - tc);
      v += (near(pNew[h], free(h, T0 + tc) + fb) - v) * kc;
      lock = Math.max(lock, pn.w * kc);
    }
    out[h] = v;
  }
  out[2] = lock;
  const ro = po ? (po.w ? 1 : -1) * (1 - clamp(kr, 0, 1)) : 0;
  const rs = Math.max(ro, smoother((tau - tV) / 0.8) * (1 - spring(tau - tB, 7, 0.45)));
  const kc = pn ? clamp(spring(tau - tc), 0, 1) : 0;
  out[3] = clamp(rs + ((pn?.w ? 1 : -1) - rs) * kc, -1, 1);
  return out;
}

/** A filled sector of a hand's sweep between angles a0 and a1, dithered. */
function sweep(g, cx, cy, a0, a1, level) {
  if (a1 < a0) [a0, a1] = [a1, a0];
  const span = Math.min(a1 - a0, TAU), R = L + 0.6;
  g.fillWhere((px, py) => {
    const dx = px - cx, dy = py - cy, d2 = dx * dx + dy * dy;
    if (d2 > R * R) return false;
    const rel = (((Math.atan2(dx, -dy) - a0) % TAU) + TAU) % TAU;
    return rel <= span ? level : false;
  }, 1, [cx - R - 1, cy - R - 1, 2 * R + 2, 2 * R + 2]);
}

const SHUTTER = 1 / 40;

export default {
  name: 'Kinetic',
  blurb: 'A field of 153 tiny clocks: locked hands draw the time, idle hands swing as a pendulum wave that falls into unison at :00, when a whirlpool lays down the new minute.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  driver: 'full',

  frame(g, { date, oled, night }) {
    const T = date.getTime() / 1000;
    const I = turnInfo(T), tm = ((T % 60) + 60) % 60;
    // burn-in orbit, slid during the turn
    const [ax, ay] = offsetFor(I.turn - 1), [bx, by] = offsetFor(I.turn);
    const sl = smoother((I.tau - (I.hour ? 3 : 0.6)) / 1.2);
    const ox = ax + (bx - ax) * sl, oy = ay + (by - ay) * sl;
    for (let j = 0; j < ROWS; j++)
      for (let i = 0; i < COLS; i++) {
        const a = clockAt(i, j, T, I);
        const x = X0 + DX * i + ox, y = Y0 + DY * j + oy;
        const locked = a[2] > 0.5;
        // motion blur: what each hand swept during the shutter
        const b = clockAt(i, j, T - SHUTTER, I);
        for (let h = 0; h < 2; h++) {
          const ah = near(a[h], b[h]), sw = Math.abs(ah - b[h]);
          if (sw > 0.4) sweep(g, x + (locked ? 0 : 0.5), y + (locked ? 0 : 0.5), b[h], ah, clamp(0.7 / sw, 0.12, 0.5));
        }
        // idle hands stretch as they swing through the bottom: bands of long
        // hands drift across the field and all reach out together at :00
        const c = Math.cos((TAU * (K + i) * tm) / 60);
        const idx = j * COLS + i;
        const hush = Math.max(I.oldP.near.has(idx) ? 1 - smoother(I.tau + 0.5) : 0, I.newP.near.has(idx) ? smoother(I.tau - 0.5) : 0);
        const c2 = c * c, wave = c2 * c2 * c2 * (1 - hush);
        const reach = a[3] + Math.max(0, wave - a[3]) * clamp(a[3] + 1, 0, 1);
        drawClock(g, x, y, a[0], a[1], locked, reach);
      }
    oled.contrast(0xcf + (0x20 - 0xcf) * night);
  },
};

export { clockAt, turnInfo };
