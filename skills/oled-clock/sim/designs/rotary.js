// Rotary — the time dialled on a mid-century telephone.
//
// The hero is a rotary dial in real 3D: a disc rocking on the phone's sloped
// face, projected in perspective. Every pixel of the dial is taken back
// through the projection to the dial's own plane (ray/plane intersection),
// where the bezel, the opaque finger wheel with its ten holes, the wheel's
// side wall, the holes' inner walls and the chrome finger stop are simple
// distance tests. The plate numerals sit under the wheel and show only
// through its holes, as on a real bakelite dial, so they vanish behind the
// wheel while it turns.
//
// The minutes are on the number card in the centre of the dial. Each minute
// an unseen finger (only its fingertip shows, filling a hole) dials the new
// minute's last digit: it winds the wheel round to the finger stop, eased,
// and lets go; the wheel runs home on its spring at the governor's steady
// 10 pulses a second (linear, 30 degrees a pulse, so a 0 takes 1.1 s and a
// 1 a fifth of that), with a small settle. The wheel is the spool of the
// card's numerals: winding up reels the old digit's stroke in from its end,
// running home lets the new digit out along its writing order. A tens digit
// that changes rides the same dial.
//
// The hour is the coiled handset cord, curled into the two numerals of a
// 24 h hour, on the left: a helix drawn as a thick stroke with slanted gaps
// between its turns, whose turns bunch and spread in slow waves running
// along it. The lead and the slack between the numerals hang behind as a
// thin cord.
//
// The hour: the phone rings. The dial buzzes on its bell hammers, the cord
// whips and leaps from the old hour into the new one, and the minute 00 is
// dialled through the ringing.
//
// Idle: the phone rocks (yaw and pitch, sub-pixel), a sheen slides round
// the chrome bezel and along the finger stop, the cord sways and its coils
// breathe. Burn-in: kit.orbit plus the rock. 23:00-07:00 it dims (ctx.night).

import { clamp, ease, progress, previousMinute, orbit } from '../js/kit.js';

const TAU = Math.PI * 2, DEG = Math.PI / 180;
const W = 128, H = 64;

// ------------------------------------------------------------ the numerals
//
// One single-stroke skeleton per digit, in a 10 x 16 design box, written in
// the order a pen (or a spool) would lay it down. Mid-century telephone
// hand: geometric bowls, a flat-topped 3, an open-flag 1, a curved-stem 6.

function arc(cx, cy, rx, ry, a0, a1, n = 24) {
  const p = [];
  for (let i = 0; i <= n; i++) {
    const a = (a0 + (a1 - a0) * (i / n)) * DEG;
    p.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return p;
}
const cat = (...parts) => parts.flat();

const SKEL = [
  /* 0 */ arc(5, 8, 5, 8, -90, -450, 48),
  /* 1 */ [[2, 3.6], [5.6, 0], [5.6, 16]],
  /* 2 */ cat(arc(5, 5, 4.8, 5, 200, 360, 20), arc(5, 5, 4.8, 5, 0, 30, 6).slice(1), [[0, 16], [10, 16]]),
  /* 3 */ cat([[0.6, 0], [9.4, 0], [4.4, 6.2]], arc(4.8, 11, 5, 5, -95, 150, 30).slice(1)),
  /* 4 */ [[7.2, 16], [7.2, 0], [0, 11], [10, 11]],
  /* 5 */ cat([[9.4, 0], [1.2, 0], [0.7, 7]], arc(4.8, 10.9, 5, 5, 228, 448, 30).slice(1)),
  /* 6 */ cat([[8.4, 0.2], [1.4, 8.6]], arc(5, 11, 5, 5, 205, -155, 44).slice(1)),
  /* 7 */ [[0, 0], [10, 0], [3.4, 16]],
  /* 8 */ cat(arc(5, 3.9, 4, 3.9, 90, -270, 32), arc(5, 11.6, 4.8, 4.4, -90, 270, 36).slice(1)),
  /* 9 */ cat(arc(5, 5, 5, 5, 25, -335, 44), [[8.6, 7.4]], [[1.6, 16]]),
];

/** Resample a polyline at a fixed step: { x, y, n } arrays, n points. */
function resample(pts, step) {
  const xs = [pts[0][0]], ys = [pts[0][1]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    const L = Math.hypot(bx - ax, by - ay);
    let s = step - carry;
    while (s <= L) { const u = s / L; xs.push(ax + (bx - ax) * u); ys.push(ay + (by - ay) * u); s += step; }
    carry = L - (s - step);
  }
  const last = pts[pts.length - 1];
  xs.push(last[0]); ys.push(last[1]);
  return { x: xs, y: ys, n: xs.length };
}
const CARD_GLYPH = SKEL.map((p) => resample(p, 0.45));

// The plate numerals under the holes: hand-drawn 5x7 in the same hand.
const PLATE = [
  ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  ['..#..', '.##..', '#.#..', '..#..', '..#..', '..#..', '..#..'],
  ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  ['#####', '...#.', '..#..', '.###.', '....#', '#...#', '.###.'],
  ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  ['#####', '....#', '...#.', '..#..', '..#..', '.#...', '.#...'],
  ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
].map((rows) => rows.map((r) => [...r].map((c) => c === '#')));

// ------------------------------------------------------------ the dial

const RB = 31;    // chrome bezel
const RW = 28.8;  // finger wheel rim
const RH = 22.6;  // hole circle
const HR = 4.7;   // hole radius
const RC = 16;    // number-card ring
const THICK = 2.4; // wheel above the plate
const A1 = 60;    // hole '1' at rest, clock degrees (0 = 12 o'clock, clockwise)
const STOP_A = 128, STOP_HOLE = 114; // finger stop, and where a hole's centre meets it
const holeRest = (k) => A1 - (k - 1) * 30; // k = 1..10, 10 is '0'
const travel = (k) => ((STOP_HOLE - holeRest(k)) % 360 + 360) % 360;
const CAM = 170;  // eye distance, in pixels

// The dialling of digit d, from the turn: where the wheel is (degrees) and
// how far the old/new numeral strokes are spooled.
function dialState(d, ts) {
  const k = d === 0 ? 10 : d, T = travel(k);
  const tIn = 0.22, tw = 0.24 + 0.0022 * T, tHold = 0.07, tr = T / 300;
  const t1 = tIn, t2 = t1 + tw, t3 = t2 + tHold, t4 = t3 + tr, t5 = t4 + 0.28;
  let w = 0, tip = 0, wound = 0, drawn = 0;
  if (ts < t1) { tip = ease.outQuad(ts / tIn); }
  else if (ts < t2) { const u = ease.inOutCubic((ts - t1) / tw); w = T * u; tip = 1; wound = u; }
  else if (ts < t3) { w = T; tip = 1 - (ts - t2) / tHold; wound = 1; }
  else if (ts < t4) {
    // governor: steady speed, a short take-up at the start
    const e = ts - t3, ramp = 0.05;
    const dist = e < ramp ? 300 * e * e / (2 * ramp) : 300 * (e - ramp / 2);
    w = Math.max(0, T - dist); wound = 1; drawn = 1 - w / T;
  } else if (ts < t5) {
    const u = (ts - t4) / 0.28;
    w = -2.2 * Math.sin(u * Math.PI) * (1 - u); wound = 1; drawn = 1;
  } else { wound = 1; drawn = 1; }
  if (ts >= t4) drawn = 1;
  return { k, w, tip: clamp(tip, 0, 1), wound, drawn, end: t5 };
}

// ------------------------------------------------------------ the cord

const CORD_SC = 2.0, CORD_Y = 14, CORD_X = [4, 31], CORD_N = 420, FLOOR = 61;

// The cord numerals: the same skeletons, laid so the cord enters each at its
// left end and leaves at its right, and the closed ones (0, 8) at the bottom.
const rev = (p) => p.slice().reverse();
const CORD_SKEL = [
  arc(5, 8, 5, 8, 0, 360, 48),
  SKEL[1], SKEL[2], SKEL[3], SKEL[4], rev(SKEL[5]), rev(SKEL[6]), SKEL[7],
  cat(arc(5, 11.6, 4.8, 4.4, 90, 270, 18), arc(5, 3.6, 4, 3.6, 90, -270, 32).slice(1), arc(5, 11.6, 4.8, 4.4, 270, 450, 18).slice(1)),
  rev(SKEL[9]),
];
const isLow = ([, y]) => y > 12; // design units: an end near the baseline

/** Where the cord meets the dial's bezel at height y (it runs into the phone). */
const bezelX = (y) => 95 - Math.sqrt(Math.max(0, 31 * 31 - (y - 32) * (y - 32))) + 1;

/** The cord laid out for an hour: points + a front flag (1 = numeral, 0 = slack). */
function cordPath(hh) {
  const seg = [];
  const add = (pts, front) => seg.push({ pts, front });
  const glyph = (d, ox) => CORD_SKEL[d].map(([x, y]) => [ox + x * CORD_SC, CORD_Y + y * CORD_SC]);
  const k1 = +hh[0], k2 = +hh[1];
  const g1 = glyph(k1, CORD_X[0]), g2 = glyph(k2, CORD_X[1]);
  const S = (k, i) => CORD_SKEL[k][i < 0 ? CORD_SKEL[k].length - 1 : i];
  const s1 = g1[0], e1 = g1[g1.length - 1], s2 = g2[0], e2 = g2[g2.length - 1];
  // the slack between the numerals runs behind them (hidden); the cord
  // leaves the last numeral in a sagging curve into the phone
  add([[s1[0] - 2, s1[1] + 3], s1], -1);
  add(g1, 1);
  add([e1, [(e1[0] + s2[0]) / 2, 40], s2], -1);
  add(g2, 1);
  // low ends drop the cord off the bottom of the glass and it comes back
  // up into the phone; ends at the side run across in a shallow sag
  const low = e2[1] > 40, ey = low ? 57 : clamp(e2[1] + 3, 26, 56), ex = bezelX(ey);
  const sag = low ? 84 : Math.max(e2[1], ey) + 5, mx = low ? e2[0] + 4 : (e2[0] + ex) / 2;
  const tail = [];
  for (let i = 1; i <= 20; i++) {
    const u = i / 20;
    tail.push([(1 - u) ** 2 * e2[0] + 2 * u * (1 - u) * mx + u * u * ex, (1 - u) ** 2 * e2[1] + 2 * u * (1 - u) * sag + u * u * ey]);
  }
  add([e2, ...tail], 0);
  const P = [];
  for (const s of seg) for (let i = 0; i < s.pts.length; i++) {
    if (P.length && i === 0) continue;
    P.push([s.pts[i][0], s.pts[i][1], s.front]);
  }
  let L = 0; const cum = [0];
  for (let i = 1; i < P.length; i++) { L += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); cum.push(L); }
  const out = new Float32Array(CORD_N * 3);
  let j = 1;
  for (let i = 0; i < CORD_N; i++) {
    const s = (L * i) / (CORD_N - 1);
    while (j < P.length - 1 && cum[j] < s) j++;
    const u = (s - cum[j - 1]) / Math.max(1e-6, cum[j] - cum[j - 1]);
    out[i * 3] = P[j - 1][0] + (P[j][0] - P[j - 1][0]) * u;
    out[i * 3 + 1] = P[j - 1][1] + (P[j][1] - P[j - 1][1]) * u;
    out[i * 3 + 2] = P[j][2];
  }
  return out;
}
const cordCache = new Map();
const cordFor = (hh) => { let c = cordCache.get(hh); if (!c) cordCache.set(hh, (c = cordPath(hh))); return c; };

// stamp buffers: distance, along-cord, across-cord, radius
const px = new Float32Array(CORD_N), py = new Float32Array(CORD_N), fr = new Float32Array(CORD_N);
const MASK = new Uint8Array(W * H), PR = [0, 0, 0];
const dB = new Float32Array(W * H), sB = new Float32Array(W * H), nB = new Float32Array(W * H), rB = new Float32Array(W * H);

function drawCord(buf, oldC, newC, u, t, ring, ox, oy, leap = 0) {
  dB.fill(99);
  for (let i = 0; i < CORD_N; i++) {
    const a = i * 3;
    // a whip: mid-morph the cord bulges and kicks perpendicular to its run
    let x = oldC[a] + (newC[a] - oldC[a]) * u, y = oldC[a + 1] + (newC[a + 1] - oldC[a + 1]) * u;
    const f = oldC[a + 2] + (newC[a + 2] - oldC[a + 2]) * u;
    const slack = 1 - f;
    x += (0.35 + 1.2 * slack) * Math.sin(t * 1.1 + i * 0.031);
    y += (0.45 + 1.6 * slack) * Math.sin(t * 0.83 + i * 0.022 + 1.3);
    // the leap: the cord jumps off the desk and lands in the new hour
    y -= leap * (1 - 0.5 * slack);
    px[i] = x + ox; py[i] = y + oy; fr[i] = f;
  }
  let s = 0;
  for (let i = 0; i < CORD_N; i++) {
    const i0 = Math.max(0, i - 2), i1 = Math.min(CORD_N - 1, i + 2);
    let tx = px[i1] - px[i0], ty = py[i1] - py[i0];
    const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    if (i) s += Math.hypot(px[i] - px[i - 1], py[i] - py[i - 1]);
    if (fr[i] < -0.5) continue; // slack behind the numerals
    const r = 0.75 + 2.6 * Math.max(0, fr[i]);
    const x0 = Math.max(0, Math.floor(px[i] - r)), x1 = Math.min(W - 1, Math.ceil(px[i] + r));
    const y0 = Math.max(0, Math.floor(py[i] - r)), y1 = Math.min(H - 1, Math.ceil(py[i] + r));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - px[i], dy = y + 0.5 - py[i];
      const d = Math.hypot(dx, dy);
      const q = y * W + x;
      if (d < r && d / r < dB[q]) { dB[q] = d / r; sB[q] = s + dx * tx + dy * ty; nB[q] = (dx * ty - dy * tx) / r; rB[q] = r; }
    }
  }
  // coil: each turn a slanted bar, gaps between them; the turns bunch in
  // waves running along the cord
  const wave = 0.3 + 0.5 * ring;
  for (let q = 0; q < W * H; q++) {
    if (dB[q] >= 1) continue;
    const r = rB[q];
    if (r < 1.6) { buf[q] = 1; continue; } // slack: a plain thin cord
    const n = nB[q], sv = sB[q];
    if (Math.abs(n) > 0.72) { buf[q] = 1; continue; } // the coil's solid flanks
    const ph = (sv + 0.45 * n * r) / 3.2 + wave * Math.sin(sv * 0.07 - t * (2.1 + 14 * ring));
    if (ph - Math.floor(ph) > 0.3) buf[q] = 1;
  }
}

// ------------------------------------------------------------ the face

export default {
  name: 'Rotary',
  blurb: 'A rotary telephone dial in 3D: each minute an unseen finger dials it, the wheel winds to the stop and whirrs home at governor speed, spooling the new numeral onto the card; the hour is the coiled cord, which leaps into the next hour when the phone rings.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,

  frame(g, ctx) {
    const { fields: f, date, t, oled } = ctx;
    const buf = g.buf;
    const [ox, oy] = orbit(date, 2, 3);
    const ts = f.sec;
    const prev = previousMinute(date);
    const tsec = date.getTime() / 1000; // continuous time for idle motion

    // ---- the dial in progress
    const mm = f.mm, pm = prev.mm;
    const ds = dialState(f.m % 10, ts);
    const turning = ts < ds.end;
    const hourTurn = f.m === 0 && ts < 4;
    const ring = hourTurn ? (ts < 2.8 ? Math.min(1, ts / 0.12) * (1 - progress(ts, 2.3, 2.8)) * (0.75 + 0.25 * Math.sin(ts * 40)) : 0) : 0;

    // ---- the cord (hour)
    const oldC = cordFor(hourTurn ? prev.hh : f.hh), newC = cordFor(f.hh);
    const lu = hourTurn ? progress(ts, 0.15, 1.25) : 1;
    const um = ease.inOutCubic(lu);
    // a hop with every bell stroke, a big leap carrying the cord across
    const hop = ring * 1.6 * Math.abs(Math.sin(ts * Math.PI * 5));
    const leap = 9 * Math.sin(Math.PI * lu) + hop;
    drawCord(buf, oldC, newC, um, tsec, ring, ox, oy, leap);

    // ---- pose: rock, plus the bell buzz while ringing
    const CX = 95 + ox + ring * 0.7 * Math.sin(ts * 113), CY = 31 + oy + ring * 0.5 * Math.sin(ts * 89 + 1) - ring * 2.2 * Math.abs(Math.sin(ts * Math.PI * 5));
    const pitch = -0.30 + 0.05 * Math.sin(tsec * TAU / 6.3) + ring * 0.02 * Math.sin(ts * 97);
    const yaw = 0.09 * Math.sin(tsec * TAU / 8.7 + 0.6) + ring * 0.025 * Math.sin(ts * 131);
    const cp = Math.cos(pitch), sp = Math.sin(pitch), cy = Math.cos(yaw), sy = Math.sin(yaw);
    // basis: pitch about x, then yaw about y
    const e1x = cy, e1y = 0, e1z = -sy;
    const e2x = sp * sy, e2y = cp, e2z = sp * cy;
    const nx = cp * sy, ny = -sp, nz = cp * cy;
    const project = (u, v, o = 0) => {
      const X = u * e1x + v * e2x + o * nx, Y = u * e1y + v * e2y + o * ny, Z = u * e1z + v * e2z + o * nz;
      const k = CAM / (CAM + Z);
      PR[0] = CX + X * k; PR[1] = CY + Y * k; PR[2] = k;
      return PR;
    };

    const wAng = (ds.w + ring * 3 * Math.sin(ts * 77)) * DEG; // wheel rotation, clockwise
    const sheen = ((tsec / 5) % 1) * 360 - 40; // chrome glint, clock degrees
    const stopU0 = Math.sin(STOP_A * DEG), stopV0 = -Math.cos(STOP_A * DEG);
    const mask = MASK; mask.fill(0);
    const bx0 = Math.max(0, Math.floor(CX - RB - 4)), bx1 = Math.min(W, Math.ceil(CX + RB + 4));
    const by0 = Math.max(0, Math.floor(CY - RB - 4)), by1 = Math.min(H, Math.ceil(CY + RB + 4));
    for (let y = by0; y < by1; y++) for (let x = bx0; x < bx1; x++) {
      const X = x + 0.5 - CX, Y = y + 0.5 - CY;
      const den = nx * X + ny * Y + nz * CAM;
      // top face of the wheel (plane through the centre)
      const t0 = (CAM * nz) / den;
      const Qx = t0 * X, Qy = t0 * Y, Qz = -CAM + t0 * CAM;
      const u = Qx * e1x + Qy * e1y + Qz * e1z, v = Qx * e2x + Qy * e2y + Qz * e2z;
      // the plate, THICK behind
      const t1 = (THICK + CAM * nz) / den;
      const Px = t1 * X, Py = t1 * Y, Pz = -CAM + t1 * CAM;
      const u2 = Px * e1x + Py * e1y + Pz * e1z, v2 = Px * e2x + Py * e2y + Pz * e2z;
      const r = Math.hypot(u, v), r2 = Math.hypot(u2, v2);
      const q = y * W + x;
      // finger stop: a chrome tongue from the bezel over the wheel, with a moat
      const sd = segD(u, v, stopU0 * (RB + 1.5), stopV0 * (RB + 1.5), stopU0 * 25.2, stopV0 * 25.2);
      if (sd < 1.75) {
        const along = (u * stopU0 + v * stopV0);
        const glint = Math.abs(((tsec * 0.9) % 2.4) * 14 + 18 - along) < 1.1;
        buf[q] = glint && sd < 0.7 ? 0 : 1;
        continue;
      }
      if (sd < 2.8) { buf[q] = 0; continue; }
      let lit = 0;
      if (r < RW + 0.55) {
        if (r > RW - 0.6) lit = 1;
        else if (Math.abs(r - RC) < 0.6) lit = 1;
        else if (r > RH - HR - 1 && r < RH + HR + 1) {
          const th = Math.atan2(u, -v) / DEG;
          const rel = (A1 + ds.w + ring * 3 * Math.sin(ts * 77) - th) / 30;
          let m = Math.round(rel); m = ((m % 12) + 12) % 12;
          if (m <= 9) {
            const ha = (holeRest(m + 1) * DEG) + wAng;
            const hu = RH * Math.sin(ha), hv = -RH * Math.cos(ha);
            const dh = Math.hypot(u - hu, v - hv);
            if (Math.abs(dh - HR) < 0.55) lit = 1;
            else if (dh < HR) {
              // inside the hole: the inner wall shows where the plate point is outside
              const dh2 = Math.hypot(u2 - hu, v2 - hv);
              if (dh2 <= HR - 0.2) mask[q] = m + 1; // else: the hole's inner wall, dark
            }
          }
        }
      } else if (r < RB + 0.7) {
        if (r2 < RW + 0.3) lit = r2 > RW - 0.75 ? 1 : 0; // the wheel's side wall: its lower edge
        else {
          const th = Math.atan2(u, -v) / DEG;
          let da = ((th - sheen) % 360 + 540) % 360 - 180;
          const half = Math.abs(da) < 26 ? 1.3 : 0.6;
          if (Math.abs(r - RB) < half) lit = 1;
        }
      }
      buf[q] = lit;
    }

    // ---- plate numerals, seen only through the holes
    for (let k = 1; k <= 10; k++) {
      const a = holeRest(k) * DEG;
      const [hx, hy] = project(RH * Math.sin(a), -RH * Math.cos(a), THICK);
      const spr = PLATE[k % 10];
      const sx = Math.round(hx - 2.5), sy = Math.round(hy - 3.5);
      for (let j = 0; j < 7; j++) for (let i = 0; i < 5; i++) {
        if (!spr[j][i]) continue;
        const x = sx + i, y = sy + j;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        if (mask[y * W + x]) buf[y * W + x] = 1;
      }
    }

    // ---- the fingertip in the hole being dialled
    if (turning && ds.tip > 0) {
      const a = holeRest(ds.k) * DEG + wAng;
      const [hx, hy, k] = project(RH * Math.sin(a), -RH * Math.cos(a), -1.5);
      const rr = (HR - 0.9) * k * ds.tip;
      // the nail faces out of the dial, toward the hand
      const ex = hx - CX, ey = hy - CY, el = Math.hypot(ex, ey) || 1;
      const nxu = ex / el, nyu = ey / el;
      for (let y = Math.floor(hy - rr - 1); y <= hy + rr + 1; y++) for (let x = Math.floor(hx - rr - 1); x <= hx + rr + 1; x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const dx = x + 0.5 - hx, dy = y + 0.5 - hy;
        const d = Math.hypot(dx, dy);
        if (d > rr + 0.9) continue;
        if (d > rr) { buf[y * W + x] = 0; continue; }
        // nail: a dark crescent line across the outer part of the pad
        const along = dx * nxu + dy * nyu;
        const nail = rr > 2.5 && Math.abs(Math.hypot(dx - nxu * rr * 1.1, dy - nyu * rr * 1.1) - rr * 0.95) < 0.55;
        buf[y * W + x] = nail ? 0 : 1;
      }
    }

    // ---- the bells: the chrome bezel rings like a bell (a second rim
    // shivering outside it) and shake marks fly off the dial's flank
    if (ring > 0.05) {
      const amp = ring * (1.6 + 0.9 * Math.sin(ts * 2 * TAU * 20));
      for (let a = 0; a < 360; a += 0.7) {
        const [px, py] = project((RB + amp) * Math.sin(a * DEG), -(RB + amp) * Math.cos(a * DEG));
        const x = Math.floor(px), y = Math.floor(py);
        if (x >= 0 && y >= 0 && x < W && y < H) buf[y * W + x] = 1;
      }
      // ring marks: three arcs flung off the dial, top left and bottom right,
      // fresh with each bell stroke
      const beat = (ts * 5) % 1; // five strokes a second
      for (const [a0, a1] of [[292, 338], [112, 158]]) for (let j = 0; j < 3; j++) {
        const rr = 33 + j * 3.2 + beat * 1.5;
        if (beat > 0.75 + j * 0.08) continue;
        for (let a = a0 + j * 4; a <= a1 - j * 4; a += 0.5) {
          for (const dr of [0, 0.9]) {
            const x = Math.floor(CX + (rr + dr) * Math.sin(a * DEG)), y = Math.floor(CY - (rr + dr) * Math.cos(a * DEG));
            if (x >= 57 && y >= 0 && x < W && y < H) buf[y * W + x] = 1;
          }
        }
      }
    }

    // ---- the number card: minutes, spooled by the wheel
    const tensChanges = mm[0] !== pm[0];
    const digits = [
      { d: +mm[0], old: +pm[0], ch: tensChanges, u0: -6.1 },
      { d: +mm[1], old: +pm[1], ch: true, u0: 6.1 },
    ];
    const SC = 0.9, R0 = 1.45;
    for (const dg of digits) {
      let glyph = CARD_GLYPH[dg.d], frac = 1;
      if (turning && dg.ch) {
        if (ds.drawn > 0) frac = ds.drawn;
        else { glyph = CARD_GLYPH[dg.old]; frac = 1 - ds.wound; }
      }
      const nDraw = Math.floor(frac * (glyph.n - 1) + 1e-6) + 1;
      if (frac <= 0.001) continue;
      for (let i = 0; i < nDraw; i++) {
        const gu = dg.u0 + (glyph.x[i] - 5) * SC, gv = (glyph.y[i] - 8) * SC;
        const [sx, sy, k] = project(gu, gv, 0);
        stamp(buf, sx, sy, R0 * k);
      }
      // the thread: while the wheel spools, the live end of a changing
      // numeral is tied to the dialled hole by a taut thread, reeled in on
      // the wind-up and paid out on the run home
      if (turning && dg.ch && frac > 0.001 && frac < 0.999 && ds.wound > 0.02) {
        const i = nDraw - 1;
        const [ex, ey] = project(dg.u0 + (glyph.x[i] - 5) * SC, (glyph.y[i] - 8) * SC, 0);
        const ax = ex, ay = ey;
        const ha = holeRest(ds.k) * DEG + wAng;
        const [hx, hy] = project((RH - HR + 1) * Math.sin(ha), -(RH - HR + 1) * Math.cos(ha), 0);
        const L = Math.hypot(hx - ax, hy - ay), n = Math.ceil(L * 1.5);
        for (let j = 0; j <= n; j++) {
          const x = Math.floor(ax + (hx - ax) * (j / n)), y = Math.floor(ay + (hy - ay) * (j / n));
          if (x >= 0 && y >= 0 && x < W && y < H) buf[y * W + x] = 1;
        }
      }
    }

    oled.contrast(0xcf + (0x18 - 0xcf) * ctx.night);
  },
};

function segD(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const u = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - ax - u * dx, py - ay - u * dy);
}

function stamp(buf, cx, cy, r) {
  const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(W - 1, Math.floor(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(H - 1, Math.floor(cy + r));
  const r2 = r * r;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
    if (dx * dx + dy * dy <= r2) buf[y * W + x] = 1;
  }
}

/** Specimen frames (out/rotary-digits.png): card + plate numerals, then cord hours. */
export function specimen() {
  const frames = [];
  const b = new Uint8Array(W * H);
  for (let d = 0; d < 10; d++) {
    const gl = CARD_GLYPH[d];
    for (let i = 0; i < gl.n; i++) stamp(b, 4 + d * 12.4 + gl.x[i] * 0.9, 4 + gl.y[i] * 0.9, 1.45);
    const spr = PLATE[d];
    for (let j = 0; j < 7; j++) for (let i = 0; i < 5; i++) if (spr[j][i]) b[(30 + j) * W + 6 + d * 12 + i] = 1;
  }
  frames.push(b);
  for (const hh of ['01', '23', '45', '67', '89']) {
    const c = new Uint8Array(W * H), C = cordPath(hh);
    drawCord(c, C, C, 1, 0, 0, 0, 0);
    frames.push(c);
  }
  return frames;
}
