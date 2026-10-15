// Metaballs — a fragment shader on a 1-bit panel.
//
// There is no GPU here, but a fragment shader is only a function of
// (x, y, time) evaluated per pixel, and that is exactly what frame() is.
// So this face is a metaball field, the classic lava-lamp: a sum of soft
// radial charges, thresholded at an iso-value. The iso-surface IS the
// digit — a bitmap font cannot stand in for it.
//
// The charge is the bounded rational kernel k(r) = 1/(r^2 + e) - 1/(R^2 + e),
// zero at r = R, so a charge only touches the pixels within R of it: the sum
// costs the area of the charges, not W*H for each of them, and the whole
// face is under a millisecond. Charges sit a fixed distance apart along the
// digit, so the same field — so the same stroke weight whatever the
// numeral's length. Between two charges the sum dips, and it is that dip
// (the surface pinches to a neck) that makes the digit a chain of orbs.
//
// The numerals are my own ten, each a bead-chain laid along a drawn
// skeleton (runs of polyline points in a 24 x 46 box). Each run gets its
// own charges, never more than STEP apart, so the short bar of a 4 is
// beaded like the long spine of an 8.
//
// The glass is shaded as light, not as chrome: a solid line where the
// iso-surface is (the edge, which is what makes it read at arm's length),
// a bright core at the heart of each orb, and a dithered corona spilling
// into the dark outside. Depth of field: the hours cluster is near, with
// fat charges and a broad halo, the minutes cluster is deep, small and
// tight, and the two wander against each other — parallax, so the four
// digits are one organism in space and not a row. A bulge rides the whole
// organism once a second, at the second.
//
// The minute: each changing digit's charges glide from the old skeleton to
// the new by arc-length fraction over 1.75 s and the surface flows between
// them — no switch. The hour: every charge in the picture falls into one
// drop at the centre, which flares, then blooms back out into the new hour.
//
// Burn-in: the field walks kit.orbit, the charges drift, contrast falls at
// night (ctx.night).

import { dither, orbit } from '../js/kit.js';

const W = 128, H = 64;

// ------------------------------------------------------------ small maths
function hash(a, b, c) {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const TAU2 = Math.PI * 2;
const clamp01 = (u) => (u < 0 ? 0 : u > 1 ? 1 : u);
const smooth = (u) => { u = clamp01(u); return u * u * (3 - 2 * u); };

// ------------------------------------------------------------ the field
const R0 = 9;            // charge radius at mid depth, px
const EK = 2;            // charge softness
const TAUV = 0.161;      // iso-value: one bead is ~6.4 px, one neck ~4.6 px wide
const STEP = 7.0;        // charge spacing along a stroke, px


// ------------------------------------------------------------ letterforms
const DW = 24, DH = 46;

function arc(cx, cy, rx, ry, a0, a1, n = 22) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + (a1 - a0) * (i / n)) * Math.PI) / 180;
    pts.push([cx + rx * Math.sin(a), cy - ry * Math.cos(a)]);
  }
  return pts;
}
const rot180 = (runs) => runs.map((p) => p.map(([x, y]) => [DW - x, DH - y]));

/** An 8: one closed line that crosses itself at the waist. */
function eight() {
  const pts = [];
  for (let i = 0; i <= 64; i++) {
    const t = (i / 64) * TAU2, c = Math.cos(t), top = c > 0;
    const y = 23 - (top ? 13.8 : 17.2) * c;
    const x = 12 + (top ? 7.0 : 7.8) * Math.sin(2 * t) * (1 + 0.20 * Math.abs(c));
    pts.push([x, y]);
  }
  return pts;
}
const SIX = [
  arc(12, 32, 8.2, 9.4, 0, 360, 40),
  [[4.6, 26], [5.6, 14], [11, 5.5]],
];
const SKELETON = {
  0: { runs: [arc(12, 23, 7.9, 18.6, 0, 360, 44)] },
  1: { runs: [[[5.6, 13], [7.6, 7.6], [12.4, 4.4], [12.4, 42]]] },
  2: { runs: [[...arc(12, 12.6, 8.1, 8.4, -72, 120, 22), [3.7, 42], [20.3, 42]]] },
  3: { runs: [[...arc(11.6, 11.8, 7.9, 8.2, -78, 178, 22), ...arc(11.6, 29.4, 8.7, 9.6, 0, 245, 24).slice(1)]] },
  4: { runs: [[[20.6, 4], [4.4, 29.6]], [[4.4, 29.6], [20.6, 29.6]], [[16.6, 4], [16.6, 42]]] },
  5: { runs: [[[20.4, 4], [4.6, 4], [4.1, 19.5], ...arc(12.4, 28.6, 8.4, 10, -52, 232, 24)]] },
  6: { runs: SIX },
  7: { runs: [[[3.6, 4], [20.6, 4], [9.4, 42]]] },
  8: { runs: [eight()] },
  9: { runs: rot180(SIX) },
};

/**
 * A digit as a bead-chain: charges spread along it, run by run, never more
 * than STEP apart, so a short run (the bar of a 4) still gets its own beads
 * and no stroke stretches thin. A run whose ends meet is a loop: its
 * charges close the ring. Each charge carries its arc fraction, for the
 * drift and the morph, and a weight ∝ its local spacing, so the stroke
 * weighs the same everywhere.
 */
function build(d) {
  let len = 0;
  const runs = d.runs.map((run) => {
    const pts = run.map((p) => p.slice());
    let l = 0;
    for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const loop = Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 0.6;
    const r = { pts, len: l, s0: len, loop };
    len += l;
    return r;
  });
  const homes = [], fracs = [], wts = [];
  for (const r of runs) {
    let n = Math.max(2, Math.round(r.len / STEP));
    if (r.loop) n = Math.max(6, n);
    while (n > 2 && r.len / (r.loop ? n : n - 1) > STEP) n++;
    const step = r.loop ? r.len / n : r.len / (n - 1);
    const sub = [];
    let acc = 0;
    for (let i = 1; i < r.pts.length; i++) {
      const [ax, ay] = r.pts[i - 1], [bx, by] = r.pts[i];
      const l = Math.hypot(bx - ax, by - ay);
      sub.push([ax, ay, bx, by, acc, l]);
      acc += l;
    }
    for (let j = 0; j < n; j++) {
      const s = (r.loop ? (j + 0.5) / n : j / (n - 1)) * r.len;
      let g = sub[0];
      for (const q of sub) if (s <= q[4] + q[5]) { g = q; break; }
      const u = clamp01((s - g[4]) / g[5]);
      homes.push([g[0] + (g[2] - g[0]) * u, g[1] + (g[3] - g[1]) * u]);
      fracs.push(len ? (r.s0 + s) / len : 0);
      wts.push(step / STEP);
    }
  }
  return { n: homes.length, homes, fracs, wts };
}
const D = {};
for (const k of Object.keys(SKELETON)) D[k] = build(SKELETON[k]);

// Which charge of the old digit becomes which charge of the new one. The
// lists differ in length, so several travelling charges may share a start
// (each carrying its share of the weight) and split apart on the way: at
// both ends of the morph the field is exactly the old, then the new digit.
const PAIR = new Map();
function pair(a, b) {
  const key = a + b;
  let p = PAIR.get(key);
  if (p) return p;
  const A = D[a], B = D[b], K = Math.max(A.n, B.n);
  const src = new Int32Array(K), tgt = new Int32Array(K);
  const sw = new Float32Array(K), tw = new Float32Array(K);
  const sc = new Int32Array(A.n), tc = new Int32Array(B.n);
  for (let j = 0; j < K; j++) {
    src[j] = Math.round((j * (A.n - 1)) / (K - 1));
    tgt[j] = Math.round((j * (B.n - 1)) / (K - 1));
    sc[src[j]]++; tc[tgt[j]]++;
  }
  for (let j = 0; j < K; j++) { sw[j] = A.wts[src[j]] / sc[src[j]]; tw[j] = B.wts[tgt[j]] / tc[tgt[j]]; }
  p = { K, src, tgt, sw, tw, A, B };
  PAIR.set(key, p);
  return p;
}

// ------------------------------------------------------------ layout
//
// Two clusters, not a row: the hours near (fat charges, broad halo), the
// minutes deep (small, tight). TOP puts the digit box on the glass.
const TOP = 9;
const SLOT = [
  { x: 6, y: 1, s: 1.02, z: 0.76 },
  { x: 33, y: 1, s: 1.02, z: 0.68 },
  { x: 70, y: -5, s: 0.88, z: 0.32 },
  { x: 97, y: -5, s: 0.88, z: 0.24 },
];
const COLON_X = 63.5, COLON_Y = 30;

// ------------------------------------------------------------ the turn
//
// tau is seconds from :00, negative before it. A minute turn starts a
// little before :00 and is over inside the new minute, so the old digits
// break up and the new ones gather — never a numeral that is not the time.
const M_T0 = -0.85, M_T1 = 0.90;
const H_IN0 = -1.25, H_IN1 = -0.42, H_OUT0 = -0.30, H_OUT1 = 1.30;
const DROP_X = 64, DROP_Y = 32;

// ------------------------------------------------------------ motion
//
// A travelling wave along the digit: neighbouring charges move together, so
// the chain undulates and stretches without ever tearing open.
function drift(f, t, ph) {
  const u = f * 0.62 - t * 0.135 + ph;
  return [
    0.58 * Math.sin(TAU2 * u) + 0.20 * Math.sin(TAU2 * (1.3 * f + t * 0.21) + ph * 2.1),
    0.50 * Math.cos(TAU2 * u + 0.7) + 0.18 * Math.sin(TAU2 * (1.1 * f - t * 0.17) + ph * 1.6),
  ];
}
const hhmm = (minute) => {
  const d = new Date(minute * 60000);
  return String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0');
};
const DIG = new Map();
const digitsOf = (minute) => {
  let v = DIG.get(minute);
  if (!v) { v = hhmm(minute); if (DIG.size > 8) DIG.clear(); DIG.set(minute, v); }
  return v;
};

// ------------------------------------------------------------ drawing
const field = new Float32Array(W * H);
const inside = new Uint8Array(W * H);
const cores = [];

/** Add one charge. */
function splat(x, y, w, R) {
  if (w <= 0.002) return;
  const R2 = R * R, invR = 1 / (R2 + EK), x0 = Math.max(0, Math.floor(x - R)), x1 = Math.min(W - 1, Math.ceil(x + R));
  const y0 = Math.max(0, Math.floor(y - R)), y1 = Math.min(H - 1, Math.ceil(y + R));
  for (let py = y0; py <= y1; py++) {
    const dy = py + 0.5 - y, dy2 = dy * dy;
    if (dy2 >= R2) continue;
    const row = py * W;
    for (let px = x0; px <= x1; px++) {
      const dx = px + 0.5 - x, r2 = dx * dx + dy2;
      if (r2 < R2) field[row + px] += w * (1 / (r2 + EK) - invR);
    }
  }
}

/** Charges of one cluster slot at time t, morphing from digit a to b. */
function charges(k, a, b, tau, t, sec, hour, put) {
  const sl = SLOT[k], P = pair(a, b);
  const ph = sl.z * 6.283 + k * 1.37;
  // The organism breathes on the glass: a slow two-way wander, the near
  // cluster wider than the far one, so the two slide against each other.
  const sway = [
    2.0 * Math.sin(TAU2 * (t * 0.023 + sl.z * 0.5)) + 0.7 * Math.sin(TAU2 * (t * 0.061 + sl.z)),
    1.8 * Math.sin(TAU2 * (t * 0.017 + sl.z * 0.31)) + 0.6 * Math.sin(TAU2 * (t * 0.053 + sl.z * 1.7)),
  ];
  const wave = clamp01((sec % 1) / 0.62);
  for (let j = 0; j < P.K; j++) {
    const i = P.src[j], m = P.tgt[j];
    const st = 0.30 * hash(j, k, 3);
    // The blend: a minute morph is one straight glide (q = r), rippling
    // along the chain; the hour falls into the drop and blooms back out of
    // it, charge by charge.
    const q = hour ? smooth((tau - H_IN0 - st) / (H_IN1 - H_IN0))
      : smooth((tau - M_T0 - 0.022 * j) / (M_T1 - M_T0 - 0.022 * P.K));
    const r = hour ? smooth((tau - H_OUT0 - st) / (H_OUT1 - H_OUT0)) : q;
    const f = P.A.fracs[i] + (P.B.fracs[m] - P.A.fracs[i]) * r;
    const [gx, gy] = drift(f, t, ph);
    const jx = 0.24 * Math.sin(t * 0.7 + j * 2.399), jy = 0.24 * Math.cos(t * 0.83 + j * 1.717);
    const A = P.A.homes[i], B = P.B.homes[m];
    const ax = sl.x + 12 + sl.s * (A[0] + gx + jx - 12) + sway[0];
    const ay = TOP + sl.y + 23 + sl.s * (A[1] + gy + jy - 23) + sway[1];
    const bx = sl.x + 12 + sl.s * (B[0] + gx + jx - 12) + sway[0];
    const by = TOP + sl.y + 23 + sl.s * (B[1] + gy + jy - 23) + sway[1];
    const x = ax + (DROP_X - ax) * q + (bx - DROP_X) * r;
    const y = ay + (DROP_Y - ay) * q + (by - DROP_Y) * r;
    // A bulge rides the whole organism once a second, at the second.
    const wf = (k + f) / 4;
    const bump = Math.exp(-(((wf - wave) * 2.4) ** 2));
    const swell = hour ? 1 + 1.3 * Math.exp(-(((tau + 0.30) / 0.36) ** 2)) : 1;
    const w = (P.sw[j] + (P.tw[j] - P.sw[j]) * r) * swell
      * (1 + 0.24 * Math.sin(TAU2 * (2 * f - t * 0.19) + ph * 3.3)) * (1 + 0.8 * bump);
    const z = sl.z + 0.10 * Math.sin(t * 0.23 + j * 1.13);
    cores.push(x, y, w);
    put(x, y, w, R0 * (0.82 + 0.34 * z));
  }
}

// How the field becomes light: the rim solid, the deep field solid, the
// shallows dithered, and the tail outside as a corona.
const DIM = 0.60;      // density inside the surface, at the ties between orbs
const CORE = 3.0;      // u at which that has risen to solid: an orb's heart
const EDGE = 0.90;     // u of the outer face of the rim line
const HALO = 0.34;     // density of the corona against the rim; it dies as v^1.5

function draw(g) {
  for (let i = 0; i < W * H; i++) inside[i] = field[i] >= TAUV ? 1 : 0;
  for (let y = 0; y < H; y++) {
    const row = y * W;
    for (let x = 0; x < W; x++) {
      const i = row + x, F = field[i];
      if (F <= 0.012) continue;
      const u = F / TAUV;
      if (u >= 1) {
        const lv = DIM + (1 - DIM) * Math.min(1, (u - 1) / (CORE - 1));
        if (lv >= 1 || dither(x, y, lv)) g.pixel(x, y, 1);
        // The surface itself: a solid line, the digit's edge.
        if (inside[i - 1] < 1 || inside[i + 1] < 1 || inside[i - W] < 1 || inside[i + W] < 1) g.pixel(x, y, 1);
      } else if (u > EDGE) {
        g.pixel(x, y, 1);
      } else {
        const v = u / EDGE;
        const lv = HALO * v * Math.sqrt(v);
        if (lv > 0.016 && dither(x, y, lv)) g.pixel(x, y, 1);
      }
    }
  }
  // A solid heart in every charge: the orbs of the chain, so the digit is a
  // row of lights and not a tube.
  for (let c = 0; c < cores.length; c += 3) {
    const x = cores[c], y = cores[c + 1], rr = 2.2 * Math.sqrt(cores[c + 2]);
    const cx = Math.round(x), cy = Math.round(y);
    if (cx < 0 || cy < 0 || cx >= W || cy >= H || !inside[cy * W + cx]) continue;
    const r2 = rr * rr, x0 = Math.max(0, cx - 3), x1 = Math.min(W - 1, cx + 3);
    const y0 = Math.max(0, cy - 3), y1 = Math.min(H - 1, cy + 3);
    for (let py = y0; py <= y1; py++)
      for (let px = x0; px <= x1; px++) {
        const dx = px - cx, dy = py - cy;
        if (dx * dx + dy * dy <= r2 && inside[py * W + px]) g.pixel(px, py, 1);
      }
  }
}

// ------------------------------------------------------------ the face

export default {
  name: 'Lumen',
  blurb: 'The time as a living ball field: glowing charges bead along each digit and the iso-surface is the numeral — they undulate, merge, and flow from one minute into the next.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  driver: 'full',

  frame(g, { fields: f, date, oled, night }) {
    const T = date.getTime() / 1000;
    const [ox, oy] = orbit(date, 2, 3);
    const sec = f.sec;
    const K = Math.floor(date.getTime() / 60000);
    const late = sec >= 30;
    const from = digitsOf(late ? K : K - 1);
    const to = digitsOf(late ? K + 1 : K);
    const tau = late ? sec - 60 : sec;
    const hour = to.slice(2) === '00';

    field.fill(0);
    cores.length = 0;
    for (let k = 0; k < 4; k++)
      charges(k, from[k], to[k], tau, T, sec, hour, (x, y, w, R) => splat(x + ox, y + oy, w, R));

    // The colon: two drops that reach for each other every second, thin to a
    // neck and spring apart. It is the bridge between the two clusters.
    const frac = sec - Math.floor(sec);
    const reach = 3.1 * Math.sin(Math.PI * clamp01(frac / 0.55)) ** 2;
    const cw = R0 * 0.99;
    // The pair wanders slowly as well, so no colon pixel is lit all day.
    const cxc = COLON_X + 2.6 * Math.sin(T * 0.11), cyc = COLON_Y + 2.3 * Math.sin(T * 0.083 + 1.1);
    splat(cxc + ox, cyc - 5.9 + reach + oy, 1.5, cw);
    splat(cxc + ox, cyc + 5.9 - reach + oy, 1.5, cw);
    if (reach > 1.7) splat(cxc + ox, cyc + oy, 0.4 * (reach - 1.7), cw * 0.9);

    draw(g);
    // Night dimming, 23:00-07:00 (ctx.night); the drop at the hour flares.
    const flare = hour ? 0.5 * Math.exp(-(((tau + 0.15) / 0.5) ** 2)) : 0;
    oled.contrast(Math.min(255, 0xcf + (0x20 - 0xcf) * night + flare * 0x2a));
  },
};
