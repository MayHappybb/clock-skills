// Bead Maze: the glass is a toddler's wooden bead-maze toy, and the time is
// its wires. Each numeral is one coloured steel wire bent into the digit
// (beadmaze-glyphs.js: one continuous wire per digit, no branches, two free
// ends; the 8 crosses itself at the waist), standing on a steel strut over a
// maple base, with four chunky painted beads threaded on it: a ball, a cube,
// a flat lentil and a barrel, turned along the wire as they go round bends.
//
// The time is never still. On every beat (once a second, rippling from the
// left digit to the right) each bead train is shoved along its wire with a
// little wind-up, glides, overshoots and settles; the front bead goes first
// and the others follow and clack into it, and the clack twangs the springy
// wire, so the whole numeral wobbles and settles. The trains shuttle end to
// end over the minute, alternately bunched and spread. Every 15 s a toddler
// slap: every train races to the far end of its wire and back with a big
// twang. A glint runs along each wire now and then. Below, a straight rail
// carries a dozen plain wooden beads that shuttle on the off-beat, and the
// colon is two white beads on short stubs, swinging like a metronome.
//
// Minute turn: the changing wire's beads gather in its middle, the wire
// relaxes (bending point by point, from one end to the other, along arcs)
// into a slack wave before :00, and from :00 is bent into the new numeral,
// overshooting a hair and settling; the beads spread back out and the wire
// twangs. The wire never has a free piece: only bends.
// Hour: the wire relaxes into a two-loop roller coaster instead of a wave,
// and its beads ride through both loops; then the base rail rises into a
// loop-the-loop under the colon and the whole wooden train rides one lap of
// the toy through it, out at the right side and back in at the left.
//
// Palette: a toy's: four primary wires (red, yellow, green, sky) and bright
// painted beads, all on a deep blue-teal wall so they are the strongest
// contrast on the glass; the wall is plain and carries only the
// flat offset shadows of wires and beads; the base is warm maple, darker than
// the wires. Night: the wall goes nearer black and the backlight dims; the
// wires keep their saturation so nothing turns muddy.
//
// Cost: wires are stamped into an 8-bit coverage mask with precomputed
// anti-aliased disc stamps (64 sub-pixel offsets) along 64-point paths, then
// composited with their shadows in one integer pass over the top 70 rows;
// beads are kit AA shapes. Flash: glyph paths and stamps ~11 KB. RAM: three
// byte masks (wire coverage, wire id, shadow) = 38.4 KB.

import { clockFields, sin, cos, hash, mix, to565 } from '../js/kit.js';
import { N, GW, GH, GLYPHS, WAVE, LOOP, WAVE_L, LOOP_L } from './beadmaze-glyphs.js';

const W = 160, H = 80;
const SLOT_X = [8.5, 41.5, 97.5, 130.5];   // left edge of each glyph box (centreline)
const OY = 8;                               // glyph top
const RAIL_Y = 72, BASE_Y = 75;
const COLON_X = 80, COLON_Y = [24, 40];
const YC = 77;                              // composite rows

// ------------------------------------------------------------ palette

const WIRE = [0xff4a3d, 0xffcf2e, 0x3fdc6f, 0x4cb2ff];
const BEADC = [
  [0xffe03a, 0x3d82ff, 0xf4efe2, 0x3fcf55],
  [0xff4436, 0xa45cff, 0x3fcf55, 0x3d82ff],
  [0xff8a1e, 0xff6fcf, 0x3d82ff, 0xffe03a],
  [0xffe03a, 0xff4436, 0xf4efe2, 0xff8a1e],
];
// 0 ball, 1 cube, 2 lentil, 3 barrel
const TYPES = [[0, 2, 1, 3], [1, 0, 3, 2], [2, 3, 0, 1], [3, 1, 2, 0]];
const HL = [4, 3.6, 2.5, 4.6];          // half length along the wire
const RAILC = [0xc99a62, 0xa8743f, 0xd8b07c, 0x93622f];
const KEY = 0x0b1520, STEEL = 0x8e9cad;
const DAY = { wall: 0x142a3e, dot: 0x1b3752, shadow: 0x08131f, wood: 0xb5753d, lip: 0xe3a866, grain: 0x9c6230, low: 0x8a5428 };
const NIGHT = { wall: 0x09131d, dot: 0x0d1b29, shadow: 0x03070b, wood: 0x6e4524, lip: 0x9a6a3c, grain: 0x5c381c, low: 0x4a2c16 };

const lerp = (a, b, u) => a + (b - a) * u;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
/** A shove: eased in and out, with a hint of wind-up before and of run-on after. */
function shove(x) {
  x = clamp01(x);
  return smooth(x) - 0.08 * sin(x * Math.PI * 2);
}
/** Reaches 1.04 at 80 % and settles to 1. */
function settle(x) {
  x = clamp01(x);
  return x < 0.8 ? 1.04 * smooth(x / 0.8) : 1.04 - 0.04 * smooth((x - 0.8) / 0.2);
}

// ------------------------------------------------------------ stamps (flash)

const RW = 1.6;                                  // wire radius: a 3.2 px wire
const STAMP = new Uint8Array(64 * 25), SSTAMP = new Uint8Array(64 * 81);
for (let fy = 0; fy < 8; fy++) for (let fx = 0; fx < 8; fx++) {
  const px = (fx + 0.5) / 8, py = (fy + 0.5) / 8, t = fy * 8 + fx;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const d = Math.hypot(dx + 0.5 - px, dy + 0.5 - py);
    STAMP[t * 25 + (dy + 2) * 5 + dx + 2] = Math.round(255 * clamp01(RW + 0.5 - d));
  }
  for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
    const d = Math.hypot(dx + 0.5 - px, dy + 0.5 - py);
    SSTAMP[t * 81 + (dy + 4) * 9 + dx + 4] = Math.round(255 * clamp01(3.6 + 0.5 - d));
  }
}

const WMASK = new Uint8Array(W * H), WID = new Uint8Array(W * H), SMASK = new Uint8Array(W * H);
let stamps = 0;

function stampWire(x, y, id) {
  if (x < 2 || y < 2 || x > W - 3 || y > H - 3) return;
  const ix = x | 0, iy = y | 0, t = ((((y - iy) * 8) | 0) * 8 + (((x - ix) * 8) | 0)) * 25;
  stamps++;
  for (let dy = 0; dy < 5; dy++) {
    const row = (iy + dy - 2) * W + ix - 2, o = t + dy * 5;
    for (let dx = 0; dx < 5; dx++) {
      const v = STAMP[o + dx];
      if (v > WMASK[row + dx]) { WMASK[row + dx] = v; WID[row + dx] = id; }
    }
  }
}
function stampShadow(x, y) {
  if (x < 4 || y < 4 || x > W - 5 || y > H - 5) return;
  const ix = x | 0, iy = y | 0, t = ((((y - iy) * 8) | 0) * 8 + (((x - ix) * 8) | 0)) * 81;
  stamps += 3;
  for (let dy = 0; dy < 9; dy++) {
    const row = (iy + dy - 4) * W + ix - 4, o = t + dy * 9;
    for (let dx = 0; dx < 9; dx++) { const v = SSTAMP[o + dx]; if (v > SMASK[row + dx]) SMASK[row + dx] = v; }
  }
}
/** Stamp a polyline (flat x,y array of n points) into the wire mask. */
function stampPath(P, n, id) {
  for (let k = 0; k < n - 1; k++) {
    const x0 = P[2 * k], y0 = P[2 * k + 1], dx = P[2 * k + 2] - x0, dy = P[2 * k + 3] - y0;
    const steps = Math.max(1, Math.ceil((Math.abs(dx) + Math.abs(dy)) / 0.8));
    for (let j = 0; j < steps; j++) stampWire(x0 + dx * j / steps, y0 + dy * j / steps, id);
  }
  stampWire(P[2 * n - 2], P[2 * n - 1], id);
}

// RGB565 integer blend, a in 0..255
function blend(c, d, a) {
  const r = c >> 11, gg = (c >> 5) & 63, b = c & 31;
  return ((r + ((((d >> 11) - r) * a + 128) >> 8)) << 11) | ((gg + (((((d >> 5) & 63) - gg) * a + 128) >> 8)) << 5) | (b + ((((d & 31) - b) * a + 128) >> 8));
}

// ------------------------------------------------------------ bead trains

const BEATLAG = [0, 0.08, 0.16, 0.24];          // the beat ripples left to right
const MOVE = 0.8, LAG = 0.05;
const GAPS = TYPES.map((ty) => [0, 1, 2].map((i) => HL[ty[i]] + HL[ty[i + 1]] + 0.8));
const SPAN = GAPS.map((g) => g[0] + g[1] + g[2]);

/** Beats of a minute that move the trains (the slaps at 15, 30, 45 hold them for three). */
function eff(j) {
  return j - Math.min(3, Math.max(0, j - 15)) - Math.min(3, Math.max(0, j - 30)) - Math.min(3, Math.max(0, j - 45));
}
function station(K, slot) {
  const p = ((K + slot * 5) % 12 + 12) % 12;
  return { v: p <= 6 ? p / 6 : (12 - p) / 6, spread: (K & 1) ? 3.2 : 0 };
}

/**
 * Rest positions (arc length along the wire, px) of the four beads on a
 * wire of length L at absolute time T (s): out[0..3], rank order.
 */
function restBeads(slot, T, L, out) {
  const ty = TYPES[slot], gp = GAPS[slot];
  const m0 = HL[ty[0]] + 1.6, m1 = HL[ty[3]] + 1.6;
  const free = Math.max(0, L - SPAN[slot] - 3 * 3.2 - m0 - m1);
  const Tb = T - BEATLAG[slot], k = Math.floor(Tb), tau = Tb - k;
  const mk = Math.floor(k / 60), j = k - mk * 60;
  const K0 = mk * 51 + eff(j), K1 = (j === 59 ? (mk + 1) * 51 : mk * 51 + eff(j + 1));
  const a = station(K0, slot), b = station(K1, slot);
  const dir = K1 === K0 ? 0 : b.v >= a.v ? 1 : -1;
  // the slap: race to the far end and back
  let slap = 0, far = 0;
  if (j >= 15 && j <= 17 && (Tb - mk * 60) < 17.6 || j >= 30 && j <= 32 && (Tb - mk * 60) < 32.6 || j >= 45 && j <= 47 && (Tb - mk * 60) < 47.6) {
    const j0 = j >= 45 ? 45 : j >= 30 ? 30 : 15;
    const x = (Tb - mk * 60 - j0) / 2.6;
    slap = (1 - cos(x * Math.PI * 2)) / 2;
    far = a.v < 0.5 ? 1 : 0;
  }
  let off = 0;
  for (let i = 0; i < 4; i++) {
    const lag = dir > 0 ? (3 - i) * LAG : i * LAG;
    const e = dir === 0 ? 0 : shove((tau - lag) / MOVE);
    let v = lerp(a.v, b.v, e), sp = lerp(a.spread, b.spread, e);
    if (slap) v = lerp(v, far, slap), sp = lerp(sp, far ? 0 : 3.2, slap);
    out[i] = m0 + off + i * sp + v * free;
    if (i < 3) off += gp[i];
  }
  // beads never pass through each other: the ones behind stop where they touch (the clack)
  if (dir >= 0) for (let i = 2; i >= 0; i--) out[i] = Math.min(out[i], out[i + 1] - gp[i]);
  else for (let i = 1; i < 4; i++) out[i] = Math.max(out[i], out[i - 1] + gp[i - 1]);
  return { k, tau, dir, slap: slap > 0 ? (Tb - mk * 60) - (j >= 45 ? 45 : j >= 30 ? 30 : 15) : -1 };
}

/** The wire's springy wobble at absolute time T: px of sideways shift at the top. */
function twang(slot, T, slapT, extra) {
  const Tb = T - BEATLAG[slot], k = Math.floor(Tb);
  let v = 0.7 * sin(T * 1.9 + slot * 1.7);
  for (let q = k - 1; q <= k; q++) {
    const dt = Tb - q - 0.42;
    if (dt > 0) v += ((hash(q, slot, 7) & 1) ? 1 : -1) * 1.8 * sin(dt * Math.PI * 6) * Math.exp(-dt / 0.28);
  }
  if (slapT >= 0) v += 1.6 * sin(slapT * Math.PI * 5) * Math.exp(-slapT / 0.9);
  if (extra) v += extra;
  return v;
}

/** The vertical bob of a numeral on its strut after each clack, px. */
function bounce(slot, T) {
  const Tb = T - BEATLAG[slot], k = Math.floor(Tb), dt = Tb - k - 0.5;
  return dt > 0 ? 1.6 * sin(dt * Math.PI * 4) * Math.exp(-dt / 0.3) : 0;
}

// ------------------------------------------------------------ the rail (hour loop-the-loop)

const LOOP_A = 3.6, LOOP_B = 9, LOOP_X = 80;
const LX0 = LOOP_X - Math.PI * LOOP_A, LX1 = LOOP_X + Math.PI * LOOP_A;
const RAIL_L0 = -12, RAIL_L1 = 172;
// arc length table of the full loop (b = LOOP_B)
const LT = new Float32Array(257);
for (let i = 1; i <= 256; i++) {
  const t0 = (i - 1) / 256 * Math.PI * 2, t1 = i / 256 * Math.PI * 2;
  const p = (t) => [LOOP_A * t - LOOP_B * Math.sin(t), -LOOP_B * (1 - Math.cos(t))];
  const [a0, b0] = p(t0), [a1, b1] = p(t1);
  LT[i] = LT[i - 1] + Math.hypot(a1 - a0, b1 - b0);
}
const LOOP_LEN = LT[256], EXTRA = LOOP_LEN - (LX1 - LX0);
const CIRC = (RAIL_L1 - RAIL_L0) + EXTRA + 24;
function loopPoint(theta, b, out) {
  out[0] = LX0 + LOOP_A * theta - b * sin(theta);
  out[1] = RAIL_Y - b * (1 - cos(theta));
}
const RB = 12;                                   // rail beads, two groups of six
const RZ = [[5, 62], [98, 155]];

function railRest(R, out) {
  const k = Math.floor(R + 0.5), tau = R + 0.5 - k;
  for (let gI = 0; gI < 2; gI++) {
    const [z0, z1] = RZ[gI], span = 5 * 6.6, free = z1 - z0 - span - 6;
    const st = (K) => { const p = ((K + gI * 3) % 8 + 8) % 8; return p <= 4 ? p / 4 : (8 - p) / 4; };
    const a = st(k), b = st(k + 1), dir = b >= a ? 1 : -1;
    for (let i = 0; i < 6; i++) {
      const lag = dir > 0 ? (5 - i) * 0.05 : i * 0.05;
      out[gI * 6 + i] = z0 + 3 + i * 5.8 + lerp(a, b, shove((tau - lag) / 0.8)) * free;
    }
    if (dir > 0) for (let i = 4; i >= 0; i--) out[gI * 6 + i] = Math.min(out[gI * 6 + i], out[gI * 6 + i + 1] - 5.8);
    else for (let i = 1; i < 6; i++) out[gI * 6 + i] = Math.max(out[gI * 6 + i], out[gI * 6 + i - 1] + 5.8);
  }
}

// ------------------------------------------------------------ bead drawing

const OUT = [];
for (let i = 0; i < 18; i++) OUT.push([0, 0]);
// unit superellipse outlines per bead type (flash): cos/sin bent towards a square for the cube and barrel
const BA = [4, 3.6, 2.5, 4.6], BB = [4, 3.6, 4.7, 3.7], BN = [16, 16, 12, 16];
const UNIT = BN.map((n, type) => {
  const pw = type === 1 ? 0.45 : type === 3 ? 0.7 : 1, t = new Float32Array(2 * n);
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2, c = Math.cos(ang), s = Math.sin(ang);
    t[2 * i] = Math.sign(c) * Math.abs(c) ** pw; t[2 * i + 1] = Math.sign(s) * Math.abs(s) ** pw;
  }
  return t;
});
function outline(type, x, y, tx, ty, grow) {
  // in the wire's frame: a along the tangent, b across it
  const a = BA[type] + grow, b = BB[type] + grow, n = BN[type], U = UNIT[type];
  for (let i = 0; i < n; i++) {
    const u = a * U[2 * i], v = b * U[2 * i + 1];
    OUT[i][0] = x + u * tx - v * ty;
    OUT[i][1] = y + u * ty + v * tx;
  }
  return OUT.slice(0, n);
}
function drawBead(g, type, x, y, tx, ty, col, lit) {
  if (type === 0) {
    g.fillCircle(x, y, 4.9, KEY, { aa: true });
    g.fillCircle(x - 0.5, y - 0.5, 4, lit, { aa: true });
    g.fillCircle(x + 0.35, y + 0.35, 3.55, col, { aa: true });
    return;
  }
  g.fillPolygon(outline(type, x, y, tx, ty, 0.9), KEY, { aa: true });
  g.fillPolygon(outline(type, x - 0.5, y - 0.5, tx, ty, 0), lit, { aa: true });
  g.fillPolygon(outline(type, x + 0.35, y + 0.35, tx, ty, -0.45), col, { aa: true });
}

// ------------------------------------------------------------ geometry per frame

const PATH = [0, 1, 2, 3].map(() => new Float32Array(2 * N));
const CUM = [0, 1, 2, 3].map(() => new Float32Array(N));
const BS = [0, 1, 2, 3].map(() => new Float32Array(4));
const PT = [0, 0, 0, 0];
/** Where everything was drawn in the last frame (read by out/beadmaze-speed.mjs to prove the motion is smooth). */
export const TRACE = { path: PATH, beads: new Float32Array(4 * 4 * 2), rail: new Float32Array(RB * 2), colon: new Float32Array(4), strut: new Float32Array(8) };

/** Point and unit tangent at arc length s along PATH[slot]. */
function along(slot, s) {
  const P = PATH[slot], C = CUM[slot];
  let k = 1;
  while (k < N - 1 && C[k] < s) k++;
  const seg = Math.max(1e-4, C[k] - C[k - 1]), u = Math.max(0, Math.min(1, (s - C[k - 1]) / seg));
  const dx = P[2 * k] - P[2 * k - 2], dy = P[2 * k + 1] - P[2 * k - 1];
  PT[0] = P[2 * k - 2] + dx * u; PT[1] = P[2 * k - 1] + dy * u;
  PT[2] = dx / seg; PT[3] = dy / seg;
  return PT;
}

const digitsOf = (f) => [+f.hh[0], +f.hh[1], +f.mm[0], +f.mm[1]];

export default {
  name: 'Bead Maze',
  blurb: 'A toddler\'s bead-maze toy: each numeral is a bent coloured wire with chunky beads that clack along it on the beat; each minute the wire relaxes and is bent into the next digit.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, sec = f.sec, mk = f.minuteKey, T = mk * 60 + sec;
    const nt = ctx.night;
    ctx.lcd.backlight(1 - 0.55 * nt);
    stamps = 0;
    const P = nt > 0 ? Object.fromEntries(Object.keys(DAY).map((k) => [k, mix(DAY[k], NIGHT[k], nt)])) : DAY;

    // ---- which digits, and where in a turn
    const cur = digitsOf(f);
    const prevF = clockFields(new Date(ctx.date.getTime() - 60000));
    let oldD = cur, newD = cur, tt = 99, hourTurn = false;
    if (sec >= 57) {
      const nx = clockFields(new Date(ctx.date.getTime() + 60000));
      newD = digitsOf(nx); tt = sec - 60; hourTurn = nx.h !== f.h;
    } else if (sec < 3) {
      oldD = digitsOf(prevF); tt = sec; hourTurn = prevF.h !== f.h;
    }
    const hourShow = prevF.h !== f.h ? sec : -1;

    // ---- the wall, the base, the struts
    g.clear(P.wall);
    g.fillRect(0, BASE_Y, W, H - BASE_Y, P.wood);
    g.fillRect(0, BASE_Y, W, 1, P.lip);
    g.fillRect(0, H - 2, W, 2, P.low);
    for (let i = 0; i < 4; i++) {
      const y = BASE_Y + 2, x = (i * 41) % 150;
      g.fillRect(x, y, 18 + (i * 11) % 22, 1, P.grain);
    }

    WMASK.fill(0); SMASK.fill(0);
    g.cost.box += (W * H * 2) / 4;

    // ---- the four wires
    const tmp = new Float32Array(4);
    for (let sl = 0; sl < 4; sl++) {
      const ox = SLOT_X[sl], Pp = PATH[sl];
      const changing = oldD[sl] !== newD[sl];
      const A = GLYPHS[oldD[sl]].pts, B = GLYPHS[newD[sl]].pts, NEU = hourTurn ? LOOP : WAVE;
      let huddle = 0, landing = 0;
      // shape, before the wobble
      if (!changing || tt === 99) {
        Pp.set(A);
      } else {
        const from = tt < 0 ? A : NEU, to = tt < 0 ? NEU : B, t0 = tt < 0 ? -0.8 : 0;
        for (let k = 0; k < N; k++) {
          const x = (tt - t0 - 0.14 * k / (N - 1)) / 0.6;
          const e = tt < 0 ? smooth(x) : settle(x);
          const ax = from[2 * k], ay = from[2 * k + 1], dx = to[2 * k] - ax, dy = to[2 * k + 1] - ay;
          const bend = 0.16 * sin(Math.PI * clamp01(x));        // travel on an arc, not a straight line
          Pp[2 * k] = ax + dx * e - dy * bend;
          Pp[2 * k + 1] = ay + dy * e + dx * bend;
        }
        huddle = tt < -0.9 ? smooth((tt + 1.9) / 1.0) : tt < 0.72 ? 1 : 1 - smooth((tt - 0.72) / 1.0);
        if (tt > 0.68) landing = 1.4 * sin((tt - 0.68) * Math.PI * 5) * Math.exp(-(tt - 0.68) / 0.35);
      }
      // length along the wire
      const C = CUM[sl];
      C[0] = 0;
      for (let k = 1; k < N; k++) C[k] = C[k - 1] + Math.hypot(Pp[2 * k] - Pp[2 * k - 2], Pp[2 * k + 1] - Pp[2 * k - 1]);
      const L = C[N - 1];
      // beads
      const bs = BS[sl];
      const info = restBeads(sl, T, L, bs);
      if (huddle > 0) {
        // huddled beads hold on to points of the wire itself (by point index), so they ride the bend
        const Lmin = Math.min(GLYPHS[oldD[sl]].L, GLYPHS[newD[sl]].L, hourTurn ? LOOP_L : WAVE_L);
        const per = (N - 1) / Lmin;                      // index units per px at the shortest
        let c = (N - 1) / 2;
        if (hourTurn) c = (N - 1) * lerp(0.3, 0.7, smooth((tt + 0.6) / 1.2));   // the beads ride through the loops
        const gp = GAPS[sl];
        let off = -SPAN[sl] / 2;
        for (let i = 0; i < 4; i++) {
          const q = Math.max(0, Math.min(N - 1.001, c + off * per)), qi = q | 0;
          tmp[i] = C[qi] + (C[qi + 1] - C[qi]) * (q - qi);
          if (i < 3) off += gp[i];
        }
        for (let i = 0; i < 4; i++) bs[i] = lerp(bs[i], tmp[i], huddle);
      }
      // the wobble: a shear growing with height above the base
      const calm = 1 - 0.7 * (huddle > 0 && Math.abs(tt) < 1 ? 1 : 0);
      const tw = twang(sl, T, info.slap, landing) * calm;
      const bob = bounce(sl, T) * calm;                 // the strut is springy too: the clack bobs the numeral
      for (let k = 0; k < N; k++) {
        const y = Pp[2 * k + 1], h = (GH + 12 - y) / (GH + 12);
        Pp[2 * k] = ox + Pp[2 * k] + tw * h;
        Pp[2 * k + 1] = OY + y + bob * (1 - 0.6 * h);
      }
      g.cost.box += N * 12;
      stampPath(Pp, N, sl + 1);
      // strut: from the lowest point of the settled glyph down to the rail
      // (it slides and telescopes with the bend: the middle of the wave or loop when relaxed)
      let gsx = GLYPHS[oldD[sl]].sx, gsy = GLYPHS[oldD[sl]].sy;
      if (changing && tt !== 99) {
        const nsy = hourTurn ? 31 : 33, e = tt < 0 ? smooth((tt + 0.8) / 0.74) : 1 - smooth(tt / 0.74);
        const gl = GLYPHS[tt < 0 ? oldD[sl] : newD[sl]];
        gsx = lerp(gl.sx, 10.5, e); gsy = lerp(gl.sy, nsy, e);
      }
      const sTop = OY + gsy + 1;
      TRACE.strut[2 * sl] = ox + gsx; TRACE.strut[2 * sl + 1] = sTop;
      g.fillRect(ox + gsx - 1, sTop, 2, RAIL_Y - sTop, mix(STEEL, P.wall, 0.35));
      // bead shadows
      for (let i = 0; i < 4; i++) { const p = along(sl, bs[i]); stampShadow(p[0] + 2, p[1] + 2); }
    }

    // ---- the rail and its beads
    const hourIdx = Math.round((T - f.m * 60 - sec) / 3600);
    const hourT = T - f.m * 60 - sec;
    const R = hourIdx * (3600 - 11) + Math.max(0, T - hourT - 11);
    const rx = new Float32Array(RB);
    railRest(R, rx);
    let lb = 0, lap = 0;
    if (hourShow >= 0 && hourShow < 11) {
      lb = hourShow < 8.6 ? LOOP_B * smooth((hourShow - 1) / 1.5) : LOOP_B * (1 - smooth((hourShow - 8.6) / 1.4));
      lap = smooth((hourShow - 2.6) / 6.0);
    }
    const railPts = [];
    if (lb > 0.05) {
      const pts = new Float32Array(2 * 49), q = [0, 0];
      for (let i = 0; i <= 48; i++) { loopPoint(i / 48 * Math.PI * 2, lb, q); pts[2 * i] = q[0]; pts[2 * i + 1] = q[1]; }
      stampPath(pts, 49, 5);
      g.cost.box += 49 * 8;
      g.fillRect(0, RAIL_Y - 1, Math.floor(LX0), 2, STEEL);
      g.fillRect(Math.ceil(LX1), RAIL_Y - 1, W - Math.ceil(LX1), 2, STEEL);
    } else g.fillRect(0, RAIL_Y - 1, W, 2, STEEL);
    for (let i = 0; i < RB; i++) {
      let x = rx[i], y = RAIL_Y;
      if (lap > 0) {
        let s = (x - RAIL_L0) + (x > LX1 ? EXTRA : 0);
        s = (s + CIRC * lap) % CIRC;
        if (s > RAIL_L1 - RAIL_L0 + EXTRA) { x = -99; }
        else {
          const sx0 = LX0 - RAIL_L0;
          if (s < sx0) x = RAIL_L0 + s;
          else if (s > sx0 + LOOP_LEN) x = RAIL_L0 + s - EXTRA;
          else {
            const ls = s - sx0;
            let lo = 0, hi = 256;
            while (hi - lo > 1) { const m = (lo + hi) >> 1; if (LT[m] < ls) lo = m; else hi = m; }
            const th = (lo + (ls - LT[lo]) / Math.max(1e-4, LT[hi] - LT[lo])) / 256 * Math.PI * 2;
            const q = [0, 0]; loopPoint(th, LOOP_B, q); x = q[0]; y = q[1];
          }
        }
      }
      railPts.push([x, y]);
      TRACE.rail[2 * i] = x; TRACE.rail[2 * i + 1] = y;
      if (x > -6) stampShadow(x + 2, y + 2);
    }
    // the colon: two white beads on stubs, swinging like a metronome
    const cb = [];
    {
      const k = Math.floor(T), tau = T - k, side = (k & 1) ? 1 : -1;
      const sw = lerp(-side, side, shove(tau / 0.55)) * 2.6;
      for (let i = 0; i < 2; i++) {
        const x = COLON_X + (i ? -sw : sw), y = COLON_Y[i];
        cb.push([x, y]);
        TRACE.colon[2 * i] = x; TRACE.colon[2 * i + 1] = y;
        stampShadow(x + 2, y + 2);
      }
    }

    // ---- composite: wall shadow, then wires
    const buf = g.buf, sh565 = to565(P.shadow), shA = Math.round(255 * 0.62);
    const wc = [0, ...WIRE, STEEL].map(to565);
    let blends = 0;
    for (let y = 0; y < YC; y++) {
      const row = y * W;
      for (let x = 0; x < W; x++) {
        const i = row + x;
        let s = SMASK[i];
        if (y >= 2 && x >= 2) { const w2 = WMASK[i - 2 * W - 2]; if (w2 > s) s = w2; }
        const cv = WMASK[i];
        if (!s && !cv) continue;
        let c = buf[i];
        if (s) { c = blend(c, sh565, (s * shA) >> 8); blends++; }
        if (cv) { c = cv === 255 ? wc[WID[i]] : blend(c, wc[WID[i]], cv); blends++; }
        buf[i] = c;
      }
    }
    g.cost.box += W * YC * 2 + stamps * 25; g.cost.blend += blends;

    // ---- colon stubs
    for (let i = 0; i < 2; i++) g.fillRect(COLON_X - 6, COLON_Y[i], 12, 1, mix(STEEL, P.wall, 0.3));

    // ---- glints running along the wires
    for (let sl = 0; sl < 4; sl++) {
      const L = CUM[sl][N - 1], u = ((T * 0.3 + sl * 0.37) % 1.6) - 0.3;
      if (u < 0 || u > 1) continue;
      const p = along(sl, u * L);
      g.fillCircle(p[0] - 0.3, p[1] - 0.3, 1.1, 0xffffff, { aa: true, a: 0.75 * sin(Math.PI * u) });
    }

    // ---- beads
    for (let i = 0; i < RB; i++) {
      const [x, y] = railPts[i];
      if (x < -6 || x > W + 6) continue;
      const col = RAILC[(i * 3) % 4];
      g.fillCircle(x, y, 3.3, KEY, { aa: true });
      g.fillCircle(x - 0.4, y - 0.4, 2.5, mix(col, 0xffffff, 0.3), { aa: true });
      g.fillCircle(x + 0.3, y + 0.3, 2.2, col, { aa: true });
    }
    for (const [x, y] of cb) {
      g.fillCircle(x, y, 4.1, KEY, { aa: true });
      g.fillCircle(x - 0.4, y - 0.4, 3.3, 0xffffff, { aa: true });
      g.fillCircle(x + 0.3, y + 0.3, 2.95, 0xe8e2d4, { aa: true });
    }
    for (let sl = 0; sl < 4; sl++) {
      for (let i = 0; i < 4; i++) {
        const p = along(sl, BS[sl][i]);
        TRACE.beads[(sl * 4 + i) * 2] = p[0]; TRACE.beads[(sl * 4 + i) * 2 + 1] = p[1];
        const col = BEADC[sl][i];
        drawBead(g, TYPES[sl][i], p[0], p[1], p[2], p[3], col, mix(col, 0xffffff, 0.45));
      }
    }
  },
};
