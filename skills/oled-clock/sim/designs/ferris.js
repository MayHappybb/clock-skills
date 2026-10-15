// Ferris — a night fair, and the time rides the wheel.
//
// The wheel is the clock's movement: it turns once a minute, so the angle of
// anything on its rim is the second. The rim is a ring of bulbs, and a head
// runs it as the seconds pass, leaving the tail of the minute burning behind
// it. Around the rim the gondolas hang, and one of them is the clock car - a
// lit carriage, hanging upright as every gondola does, with the minutes
// lettered in its two windows. Once a minute the wheel brings it back down to
// the platform, and there - at :00, at the bottom of the wheel, where it has
// come to be loaded - the window is re-lettered: the old numeral's bulbs
// gutter out and the new one strikes up bulb by bulb.
//
// The hours are a different system: the fair's entrance arch, a stationary
// marquee of bulbs over the gate, with the hour in two big numerals lettered
// the same way. On the hour the whole fair changes - the arch's hour strikes
// up through a blaze of bulbs, a wave of light runs round the rim, every car
// on the wheel lights as the wave reaches it, and the panel lifts for a
// moment (the contrast follows it).
//
// Everything is a function of the wall clock; nothing is kept between frames,
// so any instant can be drawn on its own. Burn-in: the wheel never stops and
// its cars travel, the rim's lit arc moves, the bulbs flicker on their own
// phases, the hub's dots change places each minute, the string of bulbs on
// the arch chases, the stars drift, and from 23:00 to 07:00 the panel dims.

import { noise, orbit } from '../js/kit.js';

const W = 128;
const TAU = Math.PI * 2;
const clamp01 = (u) => (u < 0 ? 0 : u > 1 ? 1 : u);
const lerp = (a, b, u) => a + (b - a) * u;
const DAY = 0xd4, NIGHT = 0x1c;

// the scene
const GROUND = 61;
const HUB = [73, 20];          // the wheel's axle
const R = 23;                  // its radius
const CAR = [28, 17];          // the clock carriage

// ------------------------------------------------------------ letterforms
// The fair letters its signs in bulbs: a run of bulbs along a monoline
// skeleton in a 14 x 18 box, round where the sign-writer rounded the corner
// and square where he did not.

/** A rounded rectangle path, clockwise from the top-left. */
function roundedRect(x, y, w, h, r, n = 5) {
  const pts = [];
  const arc = (cx, cy, a0, a1) => {
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      pts.push([cx + r * Math.sin(a), cy - r * Math.cos(a)]);
    }
  };
  arc(x + r, y + r, Math.PI * 1.5, TAU);
  arc(x + w - r, y + r, 0, Math.PI * 0.5);
  arc(x + w - r, y + h - r, Math.PI * 0.5, Math.PI);
  arc(x + r, y + h - r, Math.PI, Math.PI * 1.5);
  return pts;
}

/** Catmull-Rom through open control points. */
function catmull(pts, n = 9) {
  if (pts.length < 3) return pts.map((p) => [...p]);
  const P = [pts[0], ...pts, pts.at(-1)];
  const out = [];
  for (let i = 1; i < P.length - 2; i++) {
    const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((j) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t
        + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2
        + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3)));
    }
  }
  out.push([...pts.at(-1)]);
  return out;
}

const GLYPH = {
  0: [roundedRect(0.7, 0.6, 12.6, 16.8, 2.9)],
  1: [[[3, 5.4], [6.6, 2.4], [8.5, 0.9]], [[8.5, 0.9], [8.5, 17.1]], [[3.4, 17.1], [13.2, 17.1]]],
  2: [[[1.2, 4.4], [2.6, 1.6], [6.2, 0.9], [10.4, 1.2], [12.8, 3.4], [13, 6.4], [10.8, 9], [6.6, 12.6], [2.8, 16], [1.2, 17.1]],
      [[1.2, 17.1], [13.4, 17.1]]],
  3: [[[1.6, 1.1], [12.8, 1.1]], [[12.8, 1.1], [7.6, 7.4], [5.8, 8.8]],
      [[5.8, 8.8], [9.6, 8.8], [12.8, 11.4], [13.2, 14.6], [10.4, 17.1], [5.6, 17.5], [1.8, 15.2]]],
  4: [[[9.7, 17.4], [9.7, 0.9]], [[9.7, 0.9], [1.2, 12.4]], [[1.2, 12.4], [13.4, 12.4]]],
  5: [[[12.9, 1.1], [2.4, 1.1], [2, 8]], [[2, 8], [6.4, 6.8], [10.8, 7.6], [13.2, 10.6], [12.8, 14.8], [9, 17.4], [4.6, 17.4], [1.4, 15.4]]],
  6: [[[11.9, 1.6], [7.4, 0.9], [3.2, 2.6], [1.2, 7.4], [1.2, 13], [3.6, 16.8], [8.4, 17.5], [12, 15], [12.6, 11.4], [9.6, 8.6], [5.4, 8.6], [2.2, 10.8]]],
  7: [[[1.2, 1.1], [13.2, 1.1]], [[13.2, 1.1], [8.6, 8.6], [5.8, 17.4]], [[3.6, 9.6], [11.4, 9.6]]],
  8: [[[7.2, 8.8], [3.4, 6.4], [2.6, 3.6], [5.4, 1], [9.6, 1], [12.2, 3.4], [11.4, 6.4], [7.2, 8.8],
       [3.6, 11.4], [2.4, 14.6], [5.4, 17.2], [9.6, 17.2], [12.4, 14.6], [11.2, 11.4], [7.2, 8.8]]],
  9: [[[2.4, 16.4], [6.8, 17.2], [11, 15.4], [12.8, 10.6], [12.8, 5], [10.4, 1.2], [5.6, 0.4], [2, 3], [1.4, 6.6], [4.4, 9.4], [8.6, 9.4], [12, 7.2]]],
};

/** Walk a digit's skeleton and lay bulbs along it, each with its place in the writing. */
function layBulbs(d, sp) {
  const strokes = GLYPH[d].map((pts) => (pts.length > 18 ? pts : catmull(pts)));
  const xs = [], ys = [], ss = [];
  let total = 0;
  for (const st of strokes) for (let i = 1; i < st.length; i++) total += Math.hypot(st[i][0] - st[i - 1][0], st[i][1] - st[i - 1][1]);
  let acc = 0;
  for (const st of strokes) {
    let len = 0;
    for (let i = 1; i < st.length; i++) len += Math.hypot(st[i][0] - st[i - 1][0], st[i][1] - st[i - 1][1]);
    const n = Math.max(2, Math.round(len / sp) + 1);
    for (let k = 0; k < n; k++) {
      const target = (len * k) / (n - 1);
      let seg = 1, segStart = 0;
      while (seg < st.length - 1 && segStart + Math.hypot(st[seg][0] - st[seg - 1][0], st[seg][1] - st[seg - 1][1]) < target) {
        segStart += Math.hypot(st[seg][0] - st[seg - 1][0], st[seg][1] - st[seg - 1][1]); seg++;
      }
      const a = st[seg - 1], b = st[seg], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const u = clamp01((target - segStart) / l);
      xs.push(a[0] + (b[0] - a[0]) * u); ys.push(a[1] + (b[1] - a[1]) * u);
      ss.push(total > 0 ? (acc + target) / total : 0);
    }
    acc += len;
  }
  const n = xs.length;
  const p = new Float32Array(n * 2);
  for (let i = 0; i < n * 2; i++) p[i] = noise(i * 1.71 + d * 7.3);
  return { n, x: Float32Array.from(xs), y: Float32Array.from(ys), s: Float32Array.from(ss), p };
}

const BULBS = Array.from({ length: 10 }, (_, d) => layBulbs(d, 2.5));
/**
 * A bulb: a bright one is a disc, a fading one a single point. `b` is its
 * brightness 0..1, so a sign can be struck up bulb by bulb.
 */
function bulb(g, x, y, b, r) {
  if (b <= 0.14) return;
  x = Math.round(x); y = Math.round(y);
  if (b > 0.68) g.fillCircle(x + 0.5, y + 0.5, r, 1);
  else if (b > 0.36) { g.pixel(x, y, 1); g.pixel(x - 1, y, 1); g.pixel(x + 1, y, 1); g.pixel(x, y - 1, 1); g.pixel(x, y + 1, 1); }
  else g.pixel(x, y, 1);
}

/** Draw a bulb numeral with per-bulb brightness from `f(index, bulb)`. */
function numeral(g, d, x0, y0, sc, f) {
  const st = BULBS[d];
  for (let i = 0; i < st.n; i++) {
    const b = f(i, st);
    if (b <= 0.14) continue;
    bulb(g, x0 + st.x[i] * sc, y0 + st.y[i] * sc, b, 1.3 * sc);
  }
}

// ------------------------------------------------------------ the wheel

/** The angle on the rim `sec` seconds into the minute: the bottom at :00. */
const rimAngle = (sec) => Math.PI - (sec / 60) * TAU;

/**
 * The wheel: a rim of bulbs, twelve spokes, the hub, and the legs down to
 * the ground. The bulbs are dead until the head of the turn passes, then
 * burn down behind it - so the rim is a minute dial, and the seconds are
 * read off it.
 */
function wheel(g, ox, oy, T, sec, show, burst) {
  const hx = HUB[0] + ox, hy = HUB[1] + oy;
  const head = rimAngle(sec);
  g.circle(hx, hy, R, 1);
  for (let k = 0; k < RIM_N; k++) {
    const a = (k / RIM_N) * TAU;
    const x = hx + R * Math.sin(a), y = hy - R * Math.cos(a);
    const d = (((head - a) % TAU) + TAU) % TAU;
    const b = Math.exp(-((d / TAU) * 60) / 2.6) * (0.9 + 0.1 * Math.sin(T * 6 + k)) + 0.28 * show + 0.55 * burst;
    if (b > 0.62) g.fillCircle(x, y, 1.3, 1);
    else if (b > 0.28) { g.pixel(x, y, 1); g.pixel(x - 1, y, 1); g.pixel(x + 1, y, 1); }
    // the rim line is already there for the dead ones
  }
  // the spokes, the hub, and the legs
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU + 0.13;
    for (let r = 4; r < R - 1; r++) if ((k + Math.round(r * 1.3)) % 3) g.pixel(hx + r * Math.sin(a), hy - r * Math.cos(a), 1);
  }
  g.circle(hx, hy, 3.4, 1);
  const ph = Math.floor(T / 60);
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++)
    if (dx * dx + dy * dy <= 5 && (dx * 3 + dy * 5 + ph) % 3) g.pixel(hx + dx, hy + dy, 1);
  for (const s of [-1, 1]) {
    const fx = hx + s * 24, fy = GROUND + oy - 1;
    const ax = hx + s * 1.2, ay = hy + 3;
    for (let u = 0; u <= 1.0001; u += 0.02) {
      g.pixel(lerp(ax, fx, u), lerp(ay, fy, u), 1);
    }
    for (let u = 0.12; u < 0.95; u += 0.2) {
      const x0 = lerp(ax, fx, u), y0 = lerp(ay, fy, u);
      const x1 = lerp(ax, fx, u + 0.1), y1 = lerp(ay, fy, u + 0.1);
      g.line(x0 - s * 2.5, y0, x1 + s * 2.5, y1);
    }
  }
  // the platform under the lowest point of the rim
  for (let x = 58; x <= 86; x++) if (x % 3) g.pixel(x + ox, GROUND + oy - 2, 1);
}

const RIM_N = 32;

/** Where a car hangs at rim angle `a`: its hook, and how far it has swung. */
function carAt(a, ox, oy, T, k) {
  const hx = HUB[0] + ox, hy = HUB[1] + oy;
  const sw = 0.05 * Math.sin(T * 0.8 + k * 2.1) * (0.35 + 0.65 * Math.abs(Math.sin(a)));
  return [hx + R * Math.sin(a), hy - R * Math.cos(a), sw];
}

/** A small gondola hanging from the rim: a hanger, a body, two dim bulbs. */
function gondola(g, a, ox, oy, T, k, bright) {
  const [hx, hy, sw] = carAt(a, ox, oy, T, k);
  const cx = hx + Math.sin(sw) * 6, cy = hy + Math.cos(sw) * 6;
  g.line(hx, hy, cx, cy);
  const w = 5, h = 3;
  g.hline(cx - w, cy - h, 2 * w + 1, 1);
  g.hline(cx - w, cy + h, 2 * w + 1, 1);
  g.vline(cx - w, cy - h + 1, 2 * h - 1, 1);
  g.vline(cx + w, cy - h + 1, 2 * h - 1, 1);
  const b = bright * (0.7 + 0.3 * Math.sin(T * (2.4 + k * 0.3) + k));
  bulb(g, cx - 2.4, cy, b, 1.0);
  bulb(g, cx + 2.4, cy, b, 1.0);
}

// ------------------------------------------------------------ the clock car

/**
 * The lit carriage: a canopy with a row of bulbs, a body, and two windows in
 * which the minutes are lettered. It rides the wheel and comes down to the
 * platform at the turn, where it is re-lettered.
 */
function clockCar(g, sec, ox, oy, T, tens, units, brT, brU) {
  const [hx, hy, sw] = carAt(rimAngle(sec), ox, oy, T, 0);
  const dist = CAR[1] / 2 + 3;
  const cx = hx + Math.sin(sw) * dist, cy = hy + Math.cos(sw) * dist;
  const [w, h] = CAR;
  const x0 = Math.round(cx - w / 2), y0 = Math.round(cy - h / 2);
  g.line(hx, hy, cx, y0 - 4);
  for (let i = 0; i <= w; i++) g.pixel(x0 + i, y0 - 4 - Math.round(2.2 * Math.sin((i / w) * Math.PI)), 1);
  for (let i = 2; i < w; i += 4) bulb(g, x0 + i, y0 - 6 - Math.round(2.2 * Math.sin((i / w) * Math.PI)), 0.55 + 0.45 * Math.sin(T * 6 + i * 0.6), 1.0);
  g.roundRect(x0 - 2, y0 - 2, w + 4, h + 4, 5, 0);
  g.fillRect(x0 + 1, y0 + 1, w - 1, h - 1, 0);
  g.roundRect(x0 - 0.5, y0 - 0.5, w + 2, h + 2, 3, 1);
  numeral(g, tens, x0 + 1.6, y0 + 0.7, 0.86, brT);
  numeral(g, units, x0 + 15, y0 + 0.7, 0.86, brU);
}

// ------------------------------------------------------------ the entrance arch

/**
 * The fair's gate: two posts and a marquee arch, with the hour lettered in
 * bulbs under it. `br` gives each bulb its brightness, so the sign can be
 * struck up and guttered out.
 */
function arch(g, T, ox, oy, hh, br, blaze) {
  const L = 4 + ox, Rt = 44 + ox, top = 26 + oy, bot = GROUND + oy;
  const bx = (u) => lerp(L, Rt, u), by = (u) => top - 5 * Math.sin(u * Math.PI);
  for (const px of [L, Rt]) for (let y = top; y < bot; y++) if ((y * 2 + px) % 5) g.pixel(px, y, 1);
  // the arch: the wire, and the bulbs hung on it
  for (let k = 0; k <= 44; k++) if (k % 2) g.pixel(bx(k / 44), by(k / 44) - 1, 1);
  for (let k = 0; k <= 11; k++) {
    const u = k / 11;
    bulb(g, bx(u), by(u), (0.55 + 0.45 * Math.sin(T * 3.6 + u * 8)) * (0.72 + 0.28 * blaze), 1.25);
  }
  // a scalloped fringe below the arch
  for (let k = 0; k <= 9; k++) {
    const u = (k + 0.5) / 10;
    bulb(g, bx(u), top + 3, (0.45 + 0.55 * Math.sin(T * 2.9 - u * 6)) * (0.72 + 0.28 * blaze), 1.15);
  }
  // the hour, lettered under it
  const sc = 1.06, dw = 14 * sc, gap = 5;
  const x0 = (L + Rt) / 2 - dw - gap / 2;
  numeral(g, (hh / 10) | 0, x0 + 2, 34 + oy, sc, br((hh / 10) | 0));
  numeral(g, hh % 10, x0 + dw + gap + 2, 34 + oy, sc, br(hh % 10));
}

// ------------------------------------------------------------ the fair

/** The ground, a striped tent, a stall, and a string of lights. */
function fair(g, T, ox, oy) {
  const y = GROUND + oy;
  for (let x = 0; x < W; x++) if (x % 3 !== 2) g.pixel(x, y, 1);
  // the big tent, right of the wheel: a striped canopy over a dark booth
  const bx = 99 + ox, bw = 28, bt = 43 + oy;
  const top = (i) => bt + Math.round((i < bw / 2 ? i : bw - i) * 0.85);
  for (let i = 0; i <= bw; i++) g.pixel(bx + i, top(i), 1);
  for (let i = 0; i <= bw; i++) if (i % 3 === 0) g.pixel(bx + i, top(i) + 1, 1);
  for (const px of [bx, bx + bw]) g.vline(px, top(0) + 2, y - top(0) - 2, 1);
  for (let i = 3; i < bw - 1; i += 4) g.vline(bx + i, top(i) + 3, y - top(i) - 3, 1);
  for (let i = 0; i < 3; i++) bulb(g, bx + 9 + i * 5, top(9) + 2, 0.6 + 0.4 * Math.sin(T * 4.2 + i), 1.1);
  // a little stall at the far left, under the arch's foot
  for (let i = 0; i < 10; i++) g.pixel(1 + i + ox, 50 + oy - Math.round(i * 0.4), 1);
  for (let i = 3; i < 10; i += 3) g.pixel(1 + i + ox, 51 + oy, 1);
}

function sky(g, T, ox, oy) {
  for (let i = 0; i < 26; i++) {
    const x = (noise(i, 1) * 128 + T * (0.18 + 0.22 * noise(i, 2))) % 128;
    const y = 1 + noise(i, 3) ** 1.7 * 26;
    if (noise(i, 5) > 0.5) continue;
    if (noise(Math.floor(T * 2.1) + i * 31, 8) < 0.28) continue;
    g.pixel(x + ox, y + oy, 1);
  }
  const mx = 14 + ox, my = 8 + oy;
  g.fillWhere((px, py) => {
    const d1 = Math.hypot(px - mx, py - my), d2 = Math.hypot(px - mx + 2.6, py - my + 0.7);
    return d1 <= 3.7 && d2 > 3.4;
  }, 1, [mx - 5, my - 5, 11, 11]);
}

// ------------------------------------------------------------ the turn

const OUT_AT = 59.42, OUT_LEN = 0.42;   // the last of the old minute
const IN_AT = 0.02, IN_LEN = 0.5;      // the strike-up of the new one
const H_IN_AT = 0.03, H_IN_LEN = 0.85;

/**
 * The brightness of bulb `i` of a numeral: full when the numeral is not
 * changing, guttering out bulb by bulb as the old minute dies, striking up
 * bulb by bulb as the next begins. The changed numeral is only ever the old
 * one, dark, or the new one - never a numeral that is not the time.
 */
function lifeOf(sec, s, changing) {
  const b = 0.84 + 0.16 * Math.sin(sec * 6 + s * 9);
  if (!changing) return b;
  const out = clamp01((sec - (OUT_AT + (1 - s) * OUT_LEN)) / 0.11);
  if (out >= 1) return 0;
  const inn = clamp01((sec - (IN_AT + s * IN_LEN)) / 0.13);
  return b * (1 - out) * inn;
}

/** The hour's lettering: slower, and it starts the moment the hour strikes. */
function hourOf(sec, m, s) {
  const b = 0.84 + 0.16 * Math.sin(sec * 7 + s * 11);
  const out = m === 59 ? clamp01((sec - (OUT_AT + (1 - s) * 0.5)) / 0.12) : 0;
  if (out >= 1) return 0;
  const inn = m === 0 ? clamp01((sec - (H_IN_AT + s * H_IN_LEN)) / 0.16) : 1;
  return b * (1 - out) * inn;
}

// ------------------------------------------------------------ face

export default {
  name: 'Ferris',
  blurb: 'A night fair: the wheel turns once a minute and its lit carriage carries the minutes, re-lettered in bulbs each time it comes down to the platform; the hour burns in bulbs over the gate.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  driver: 'full',

  frame(g, { date, fields: f, oled, night }) {
    const T = date.getTime() / 1000;
    const sec = f.sec;
    const [ox, oy] = orbit(date, 2, 3);
    const key = f.minuteKey;

    sky(g, T, ox, oy);
    wheel(g, ox, oy, T, sec, f.m === 0 ? clamp01(1 - sec / 5) : 0, f.m === 0 ? clamp01(1 - sec / 1.6) : 0);
    const head = rimAngle(sec);
    const blaze = f.m === 0 ? clamp01(1 - sec / 5) : 0;
    const burst = f.m === 0 ? clamp01(1 - sec / 1.6) : 0;
    for (let k = 1; k < 8; k++) {
      const a = head + (k / 8) * TAU;
      const chase = (((head - a) % TAU) + TAU) % TAU;
      gondola(g, a, ox, oy, T, k, 0.24 + 1.0 * blaze * Math.exp(-chase / 1.1) + 0.6 * burst);
    }

    // --- the minutes, on the carriage
    const nm = (f.m + 1) % 60;
    const tensChanges = Math.floor(nm / 10) !== Math.floor(f.m / 10);
    const unitChanges = nm % 10 !== f.m % 10;
    // it comes alight as it swings down to the platform
    const low = clamp01((Math.cos(head - Math.PI) + 1) / 2);
    const high = 0.62 + 0.38 * low * low;
    clockCar(g, sec, ox, oy, T, (f.m / 10) | 0, f.m % 10,
      (i, st) => high * lifeOf(sec, st.s[i], tensChanges),
      (i, st) => high * lifeOf(sec, st.s[i], unitChanges));

    // --- the hours, on the arch
    const nh = (f.h + 1) % 24;
    arch(g, T, ox, oy, f.h, (d) => (i, st) => hourOf(sec, f.m, st.s[i]), blaze);

    fair(g, T, ox, oy);

    const strike = f.m === 0 ? clamp01(1 - sec / 0.6) : 0;
    oled.contrast(Math.min(255, (DAY + (NIGHT - DAY) * night) * (1 + 0.16 * blaze + 0.3 * strike)));
  },
};
