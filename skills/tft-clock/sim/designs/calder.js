// Calder: a hanging mobile in the manner of Alexander Calder, and the time is
// what hangs from it. Each numeral is one length of black wire, bent by hand
// (calder-font.js: single strokes, hairpin turns, wrapped joints), hung on a
// little S-hook from the end of a balanced arm; flat painted discs (red,
// yellow, blue, black) hang on the other arms as counterweights, and the
// colon is two small discs on the plumb line under the main pivot.
//
// The time is never still: every second the numerals drop on their hooks
// and spring back (squash and stretch, staggered left to right, so a little
// wave runs along the mobile), a glint runs down every wire, one disc turns
// once round on its thread, and the whole thing drifts and sways on its
// pivots. Every 15 s a flourish: a breeze from the left (:15) or the right
// (:45) swings everything in turn; at :30 the main arm dips and nods.
//
// Minute turn: each changing numeral winds up (anticipation), then its wire
// coils, every bend tightening at once from the free end inwards, into a
// tight flat spiral hanging on the hook (a black disc, like the others);
// the coil takes up or pays out wire while the arms find their new balance
// (a heavier 8 tips its arm down), then it unrolls into the new numeral and
// springs into shape. Old numerals are coiled before :00; new ones unroll
// after it. Hour: a draft through the gallery: the mobile swings wide, every
// disc spins round and settles showing its other face (the colourway changes
// with the hour), and a band of light crosses the wall.
//
// Palette: Calder's own: black wire and the primaries, red #d7301f, yellow
// #f0b81c, blue #1d4fa0, black, on a warm white gallery wall that keeps the
// ground calm (the time, black on white, is the strongest contrast); the
// wall takes the skylight's colour through the day (peach morning, white
// noon, apricot afternoon, lamp-lit evening), and a spotlight up to the left
// throws a soft shadow of the whole mobile on it. At
// night the gallery lights go off in a sweep across the wall: navy wall,
// moonlit pale wire, the discs muted, and the backlight dims.
//
// Cost: the wires are turtle paths rebuilt each frame (128 table sin/cos
// each), stamped with pre-rasterised AA discs into a byte coverage buffer
// and blended in integer RGB565 (calder-wire.js); discs are kit ellipses,
// threads two-column AA lines, the wall one fill.

import { clockFields, sin, cos, progress, ease, mix, Gfx } from '../js/kit.js';
import {
  GLYPHS, N, STAMP_H, STAMP_M, STAMP_T, wirePoints, stampLine, newBox, composite,
  coilFor, coilMix, REEL, stampShadow,
} from './calder-wire.js';

const W = 160, H = 80, TAU = Math.PI * 2;

// ---------------------------------------------------------------- palettes
const DAY = {
  wall: [0xf1ebdc, 0xe4dccb], wire: 0x15161a, rod: 0x1c1d21, thread: 0x55524b, glint: 0xa8a59c,
  R: 0xd7301f, Y: 0xf0b81c, B: 0x1d4fa0, K: 0x17181c, light: 0xfffaf0, shadow: 0xe3dccc,
};
const NIGHT = {
  wall: [0x232a3d, 0x161b29], wire: 0xebe2c8, rod: 0xc8bfa6, thread: 0x6e6c78, glint: 0xffffff,
  R: 0xb5402f, Y: 0xd2a43a, B: 0x5f84d0, K: 0x0b0d13, light: 0x3a4460, shadow: 0x1a2030,
};

// the wall's colour through the day: the gallery's skylight, warm in the
// morning, white at noon, apricot late in the afternoon, lamp-lit in the evening
const WALL_KEYS = [[0, 0xe6dde4], [7, 0xf5e4cf], [10, 0xf1ebdc], [15, 0xf1ebdc], [18, 0xf4dcc5], [21, 0xe8dee2], [24, 0xe6dde4]];
function dayPalette(date) {
  const hr = date.getHours() + date.getMinutes() / 60;
  let i = 0;
  while (WALL_KEYS[i + 1][0] <= hr) i++;
  const [h0, c0] = WALL_KEYS[i], [h1, c1] = WALL_KEYS[i + 1];
  const wc = mix(c0, c1, (hr - h0) / (h1 - h0));
  return { ...DAY, wall: [wc], shadow: mix(wc, 0x7a6e5a, 0.13) };
}

// ---------------------------------------------------------------- the mobile (local rods about each pivot)
const TOP = { px: 70, py: 5, rod: [[-60, -1], [-46, 2], [-31, 4], [-16, 1], [0, 0], [16, 0], [30, 3], [50, 2], [72, -3]],
  hours: [-31, 4], minutes: [30, 3] };
const HRS = { drop: 4, rod: [[-34, -2], [-24, 0], [-14.5, 1], [0, 0], [14.5, 1]], hang: [[-14.5, 1], [14.5, 1]] };
const MIN = { drop: 17, rod: [[-12, 1], [0, 0], [12, 1], [24, 0], [34, -3]], hang: [[-12, 1], [12, 1]] };
const SCALE = [1.25, 1.25, 1.0, 1.0];
const HOOK = [3, 6, 4, 8];                     // S-hook length, rod to wire: each numeral hangs at its own height
// discs: on which rod, at which rod point, thread length, radius, the two faces
const DISCS = [
  { on: 'top', at: 8, thread: 6, r: 9, faces: ['R', 'K'] },
  { on: 'min', at: 4, thread: 18, r: 6.5, faces: ['Y', 'B'] },
  { on: 'hrs', at: 0, thread: 52, r: 5.5, faces: ['B', 'R'] },
  { on: 'top', at: 0, thread: 0, r: 4.5, faces: ['K', 'Y'] },
  { on: 'disc', at: 1, thread: 7, r: 4, faces: ['K', 'R'] },        // hung from the yellow one
];
const COLON = [{ y: 38, r: 2.7, faces: ['R', 'B'] }, { y: 50, r: 2.7, faces: ['K', 'R'] }];

const rot = (p, a, ox, oy) => { const c = cos(a), s = sin(a); return [ox + p[0] * c - p[1] * s, oy + p[0] * s + p[1] * c]; };

// ---------------------------------------------------------------- motion helpers
const sine = (u) => 0.5 - 0.5 * cos(Math.PI * u);
const sm = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
/** A damped ring after an impulse at t = 0: 0 before, starts at 0. */
const ring = (t, f, k) => (t <= 0 ? 0 : Math.exp(-k * t) * sin(TAU * f * t));
/** A damped settle from 1 toward 0, starting at t = 0 (cosine, so continuous). */
const settle = (t, f, k) => (t <= 0 ? 1 : Math.exp(-k * t) * cos(TAU * f * t));

// the turn's timetable, relative to the minute (tau = 0 at :00), plus each slot's delay
const T_ANT = -1.45, T_C0 = -1.15, T_C1 = -0.3, T_H1 = 0.1, T_U1 = 1.1;
const DELAY = [0.24, 0.16, 0.08, 0];           // right to left: the minutes go first

const SCRATCH = new Gfx(W, H);

export default {
  name: 'Calder',
  blurb: 'A Calder mobile: each numeral is a bent wire hung from balanced arms among painted discs; at the minute the wire coils up and unrolls into the next.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, nt = ctx.night;
    ctx.lcd.backlight(1 - 0.55 * nt);
    // the lights go off in a sweep across the wall over the night fade
    if (nt <= 0) scene(g, ctx, dayPalette(ctx.date));
    else if (nt >= 1) scene(g, ctx, NIGHT);
    else {
      scene(g, ctx, NIGHT);
      scene(SCRATCH, ctx, dayPalette(ctx.date));
      const fx = nt * (W + 40) - 20, a = g.buf, b = SCRATCH.buf;
      for (let y = 0; y < H; y++) {
        const edge = Math.round(fx + (y - 40) * 0.3), row = y * W;
        for (let x = Math.max(0, edge); x < W; x++) a[row + x] = b[row + x];
      }
      g.cost.box += W * H; g.cost.calls += SCRATCH.cost.calls; g.cost.px += SCRATCH.cost.px;
      g.cost.blend += SCRATCH.cost.blend; g.cost.edge += SCRATCH.cost.edge; g.cost.box += SCRATCH.cost.box;
      for (const k in SCRATCH.cost) SCRATCH.cost[k] = 0;
    }
  },
};

function scene(g, ctx, P) {
  const f = ctx.fields, s = f.sec;
  const T = (ctx.date.getTime() / 1000) % 3600;           // seconds into the hour, for the slow drift
  g.clear(P.wall[0]);

  // ---- which numerals, and where in the turn
  const tau = s >= 30 ? s - 60 : s;
  const A = s >= 30 ? f : clockFields(new Date(ctx.date.getTime() - 60000));
  const B = s >= 30 ? clockFields(new Date(ctx.date.getTime() + 60000)) : f;
  const da = A.hh + A.mm, db = B.hh + B.mm;
  const hourTurn = A.h !== B.h && tau > -2 && tau < 13;
  const hourT = hourTurn ? tau + 0.6 : -1;               // the draft arrives just before the minute

  // the length of wire each slot carries (its weight), through the turn
  const Lw = [0, 0, 0, 0], ch = [false, false, false, false];
  for (let k = 0; k < 4; k++) {
    const LA = GLYPHS[+da[k]].L * SCALE[k], LB = GLYPHS[+db[k]].L * SCALE[k];
    ch[k] = da[k] !== db[k];
    Lw[k] = LA + (LB - LA) * sm(progress(tau, T_C1 + DELAY[k], T_H1 + DELAY[k]));
  }

  // ---- the beam angles: drift, flourishes, the draft, and balance
  const q = Math.floor(s / 15), qt = s - q * 15;            // flourish at :15 / :30 / :45
  const breeze = q === 1 ? 1 : q === 3 ? -1 : 0, nod = q === 2 ? 1 : 0;
  const draft = hourT > 0 ? Math.exp(-0.35 * hourT) * sm(hourT / 0.8) : 0;
  const bal = (a, b, k) => k * (b - a) / (a + b);
  const balH0 = bal(GLYPHS[+da[0]].L, GLYPHS[+da[1]].L, 0.5), balH1 = bal(GLYPHS[+db[0]].L, GLYPHS[+db[1]].L, 0.5);
  const balM0 = bal(GLYPHS[+da[2]].L, GLYPHS[+da[3]].L, 0.5), balM1 = bal(GLYPHS[+db[2]].L, GLYPHS[+db[3]].L, 0.5);
  const th0 = T_C1 + DELAY[1], tm0 = T_C1 + DELAY[3];
  const balH = balH1 + (balH0 - balH1) * settle(tau - th0, 0.55, 1.3);
  const balM = balM1 + (balM0 - balM1) * settle(tau - tm0, 0.6, 1.3);
  const thT = 0.022 * sin(TAU * T / 9.1) + 0.012 * sin(TAU * T / 5.3 + 1)
    + nod * 0.075 * ring(qt, 0.42, 0.7) + breeze * 0.03 * ring(qt - 0.4, 0.5, 0.9)
    + 0.09 * draft * sin(TAU * hourT / 3.2);
  const thH = 0.04 * sin(TAU * T / 6.7 + 2) + balH - nod * 0.06 * ring(qt - 0.25, 0.5, 0.8)
    + breeze * 0.08 * ring(qt - (breeze > 0 ? 0 : 0.9), 0.55, 0.9) + 0.14 * draft * sin(TAU * hourT / 2.6 + 0.8);
  const thM = 0.045 * sin(TAU * T / 7.9 + 4) + balM - nod * 0.06 * ring(qt - 0.35, 0.5, 0.8)
    + breeze * 0.08 * ring(qt - (breeze > 0 ? 0.9 : 0), 0.55, 0.9) + 0.14 * draft * sin(TAU * hourT / 2.9 + 2);

  // ---- positions
  const top = TOP.rod.map((p) => rot(p, thT, TOP.px, TOP.py));
  const hp = rot(TOP.hours, thT, TOP.px, TOP.py), mp = rot(TOP.minutes, thT, TOP.px, TOP.py);
  const hpx = hp[0], hpy = hp[1] + HRS.drop, mpx = mp[0], mpy = mp[1] + MIN.drop;
  const hrs = HRS.rod.map((p) => rot(p, thH, hpx, hpy)), min = MIN.rod.map((p) => rot(p, thM, mpx, mpy));
  const hooks = [rot(HRS.hang[0], thH, hpx, hpy), rot(HRS.hang[1], thH, hpx, hpy), rot(MIN.hang[0], thM, mpx, mpy), rot(MIN.hang[1], thM, mpx, mpy)];

  // ---- discs: where each hangs, how it is turned
  const rods = { top, hrs, min };
  let work = 0;
  const odd = (h) => h & 1;
  const faceA = odd(A.h), faceB = odd(B.h);
  const sec = Math.floor(s), bt1 = s - sec;
  const discs = [];
  for (let i = 0; i < DISCS.length + COLON.length; i++) {
    const colon = i >= DISCS.length, d = colon ? COLON[i - DISCS.length] : DISCS[i];
    let cx, cy, ax = 0, ay = 0, tx = 0, ty = 0, yaw = 0;
    if (colon) { cx = TOP.px + 0.5 * sin(TAU * T / 3.3 + i); cy = d.y + 0.4 * sin(TAU * T / 2.7 + i); }
    else {
      if (d.on === 'disc') { const p = discs[d.at]; ax = p.cx; ay = p.cy + p.r; } else [ax, ay] = rods[d.on][d.at];
      if (d.thread > 0) {
        const swing = 0.05 * sin(TAU * T / (2.4 + i * 0.37) + i * 2) + breeze * 0.12 * ring(qt - i * 0.2, 0.6, 1) + 0.2 * draft * sin(TAU * hourT / 1.9 + i);
        const len = d.thread + d.r;
        cx = ax + len * sin(swing); cy = ay + len * cos(swing);
        tx = cx - d.r * sin(swing); ty = cy - d.r * cos(swing);
      } else { cx = ax; cy = ay; }
    }
    // yaw: the colon ticks a half turn every second; the other discs take turns to spin once round
    if (colon) yaw = (sec + (i - DISCS.length)) * Math.PI + ease.inOutCubic(progress(bt1, 0.0, 0.45)) * Math.PI;
    else if (sec % DISCS.length === i) yaw = ease.inOutCubic(progress(bt1, 0.05, 0.9)) * TAU;
    if (nod && qt < 4 && !colon) yaw += ease.inOutQuad(progress(qt, 0.3 + i * 0.25, 1.5 + i * 0.25)) * TAU;
    let face = s >= 30 ? faceA : faceB;
    if (hourTurn && !colon) { yaw = ease.outCubic(progress(hourT, 0.2 + i * 0.15, 5.5 + i * 0.15)) * (3 * TAU + Math.PI); face = faceA; }
    if (!colon) yaw += face * Math.PI;
    const cw = cos(yaw);
    discs.push({ cx, cy, ax, ay, tx, ty, r: d.r, rx: Math.max(0.6, d.r * Math.abs(cw)), col: P[d.faces[cw >= 0 ? 0 : 1]], hung: !colon && d.thread > 0 });
  }

  // ---- the numerals: where each wire lies this frame
  const wireBox = [];
  for (let k = 0; k < 4; k++) {
    const sc = SCALE[k], [hkx, hky] = hooks[k], dl = DELAY[k];
    let d = +f.hh.concat(f.mm)[k], w = 0, coil = null, coilL = 0;
    let dy = 0, sy = 1, sx = 1, rot0 = 0;
    // the beat: a drop on the hook and a spring back, staggered along the mobile
    const bt = s - sec - 0.07 * k;
    const bnc = ring(bt < 0 ? bt + 1 : bt, 2.1, 4.2);
    let beat = 1;
    // ... and a kick to the side, alternating each beat and between neighbours, like a dancer's sway
    const kick = ((sec + k) & 1 ? 1 : -1) * 0.05 * ring((bt < 0 ? bt + 1 : bt) - 0.04, 1.3, 2.6);
    rot0 = kick + 0.04 * sin(TAU * T / 2.3 + k * 1.3) + breeze * 0.12 * ring(qt - (breeze > 0 ? k : 3 - k) * 0.18, 0.62, 1.0)
      + 0.1 * draft * sin(TAU * hourT / 1.7 + k * 0.9) - nod * 0.04 * ring(qt - 0.3, 0.5, 0.8);
    if (ch[k] && tau > T_ANT - 0.5 + dl && tau < T_U1 + 2 + dl) {
      const t0 = tau - dl;
      const La = GLYPHS[+da[k]].L * REEL, Lb = GLYPHS[+db[k]].L * REEL;
      if (t0 < T_C1) { d = +da[k]; w = sine(progress(t0, T_C0, T_C1)); coilL = La; coil = coilFor(La, 0); }
      else if (t0 < T_H1) {
        d = +db[k]; w = 1;
        const u = sm(progress(t0, T_C1, T_H1));
        coil = coilMix(La, Lb, u); coilL = La + (Lb - La) * u;
      } else { d = +db[k]; w = 1 - sine(progress(t0, T_H1, T_U1)); coilL = Lb; coil = coilFor(Lb, 1); }
      // anticipation: the wire draws up on its hook before it winds
      const ant = sm(progress(t0, T_ANT, T_C0)) * (1 - sm(progress(t0, T_C0, T_C0 + 0.35)));
      dy -= 1.6 * ant; sy *= 1 - 0.04 * ant;
      // the reel hangs heavier, then the new numeral springs into shape
      dy += 1.4 * sin(Math.PI * progress(t0, T_C1 - 0.2, T_H1 + 0.2));
      const sp = t0 - T_U1 + 0.15;
      sy *= 1 + 0.05 * ring(sp, 1.6, 2.6); sx *= 1 - 0.025 * ring(sp, 1.6, 2.6);
      rot0 += 0.06 * sin(Math.PI * progress(t0, T_C0, T_U1)) + 0.04 * ring(t0 - T_U1, 0.8, 1.8);
      beat = t0 < T_ANT || t0 > T_U1 + 0.6 ? 1 : 0;
    }
    dy += 2.1 * bnc * beat; sy *= 1 + 0.04 * bnc * beat;
    const G = GLYPHS[d];
    const x0 = (G.x0 - 10) * (1 - w), y0 = G.y0 * (1 - w) + 1.5 * w;
    const wx = hkx + x0 * sc, wy = hky + HOOK[k] + y0 * sc + dy;
    WIRES[k].hook = [hkx, hky, wx, wy];
    work += wirePoints(WIRES[k].pts, d, w, coil, coilL, wx, wy, rot0, sc * sx, sc * sy);
    WIRES[k].beat = beat;
  }

  // ---- the hour: the draft is a door opening, and its light crosses the wall
  if (hourTurn) {
    const u = sine(progress(hourT, 0.3, 3.6));
    if (u > 0 && u < 1) {
      const x = -60 + 260 * u, a = 0.55 * sin(Math.PI * u);
      g.fillPolygon([[x, 0], [x + 26, 0], [x + 4, 80], [x - 22, 80]], P.light, { aa: true, a });
      g.fillPolygon([[x + 32, 0], [x + 38, 0], [x + 16, 80], [x + 10, 80]], P.light, { aa: true, a: a * 0.7 });
    }
  }

  // ---- shadows on the wall, from a spotlight up and to the left
  if (P.shadow !== undefined) {
    const box = newBox(), SL = [80, -40, 0.035, 1, 2];
    for (const r of [top, hrs, min]) work += stampShadow(flatten(r), r.length - 1, STAMP_T, box, ...SL) * 12;
    for (let k = 0; k < 4; k++) work += stampShadow(WIRES[k].pts, N, k < 2 ? STAMP_H : STAMP_M, box, ...SL) * 12;
    const c = composite(g.buf, box, P.shadow); g.cost.px += c[0]; g.cost.blend += c[1]; g.cost.box += c[2];
    for (const d of discs) {
      const sx = d.cx + (d.cx - SL[0]) * SL[2] + SL[3], sy = d.cy + (d.cy - SL[1]) * SL[2] + SL[4];
      g.fillEllipse(sx, sy, d.rx * 1.05, d.r * 1.05, P.shadow, { aa: true });
    }
  }

  // ---- threads (vertical: gravity), rods, discs, hooks and wires
  thread(g, TOP.px, -1, TOP.py, P.thread);
  thread(g, hp[0], hp[1], hpy, P.thread);
  thread(g, mp[0], mp[1], mpy, P.thread);
  thread(g, TOP.px, TOP.py, COLON[1].y, P.thread);
  for (const d of discs) if (d.hung) threadTo(g, d.ax, d.ay, d.tx, d.ty, P.thread);
  {
    const box = newBox();
    for (const r of [top, hrs, min]) work += stampLine(flatten(r), r.length - 1, STAMP_T, box) * 12;
    for (let k = 0; k < 4; k++) { const [a0, b0, a1, b1] = WIRES[k].hook; HOOKP[0] = a0; HOOKP[1] = b0; HOOKP[2] = a1; HOOKP[3] = b1; work += stampLine(HOOKP, 1, STAMP_T, box) * 12; }
    const c = composite(g.buf, box, P.rod); g.cost.px += c[0]; g.cost.blend += c[1]; g.cost.box += c[2];
  }
  for (const d of discs) g.fillEllipse(d.cx, d.cy, d.rx, d.r, d.col, { aa: true });
  for (let k = 0; k < 4; k++) {
    const box = newBox();
    work += stampLine(WIRES[k].pts, N, k < 2 ? STAMP_H : STAMP_M, box) * 12;
    const c = composite(g.buf, box, P.wire); g.cost.px += c[0]; g.cost.blend += c[1]; g.cost.box += c[2];
    // the glint runs down the wire after each beat
    const gt = progress(s - sec - 0.07 * k, 0.08, 0.7);
    if (WIRES[k].beat && gt > 0 && gt < 1) glint(g, WIRES[k].pts, gt, P.glint);
  }
  g.cost.box += work * 2;
}

const WIRES = [0, 1, 2, 3].map(() => ({ pts: new Float32Array(2 * (N + 1)), hook: null, beat: 1 }));
const HOOKP = new Float32Array(4);
const FLAT = new Float32Array(32);
function flatten(pts) {
  for (let i = 0; i < pts.length; i++) { FLAT[2 * i] = pts[i][0]; FLAT[2 * i + 1] = pts[i][1]; }
  return FLAT;
}

/** A vertical thread, anti-aliased over two columns. */
function thread(g, x, y0, y1, c) {
  const xi = Math.floor(x - 0.5), fr = x - 0.5 - xi;
  const ya = Math.round(Math.min(y0, y1)), h = Math.round(Math.abs(y1 - y0));
  if (h <= 0) return;
  g.fillRect(xi, ya, 1, h, c, { a: 1 - fr });
  g.fillRect(xi + 1, ya, 1, h, c, { a: fr });
}
function threadTo(g, x0, y0, x1, y1, c) { g.thickLine(x0, y0, x1, y1, 1, c, { aa: true }); }
function glint(g, pts, u, c) {
  const i0 = Math.floor(u * (N + 12)) - 12;
  for (let i = Math.max(0, i0); i < Math.min(N, i0 + 12); i++) {
    const a = 0.75 * sin(Math.PI * (i - i0) / 12);
    g.pixel(pts[2 * i] - 0.5, pts[2 * i + 1] - 0.5, c, { a });
  }
}
