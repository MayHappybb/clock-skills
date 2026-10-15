// Automaton: a clockwork frog runs a toy drop forge, and the time is its ironwork.
//
// Two presses hang under one riveted beam: a small one over the hours, a
// big one over the minutes. Every numeral is a single 2 px bar of iron,
// bent, its free ends rolled into blacksmith's scrolls (one bar per digit
// is what lets any digit be crushed and re-bent into any other).
//
// All minute the frog, in round glasses, winds the minute hammer up hand
// over hand on a ship's wheel: the wheel turns with the chain and the hammer's height is the
// seconds. It cranks in three bursts and rests between them (wipes its
// brow, pushes its glasses up, waves, looks up at the hammer, worried);
// the plan comes from noise(minuteKey). At :58.7 it lets go, rubs its
// hands, lifts a leg, and at :59.4 stomps the trip pedal. The hammer falls
// freely, meets the digits' tops and crushes them by :00 exactly: the bar,
// which cannot get shorter, folds its upright runs like an accordion. Inside the
// 3 px slab the old centre-line blends into the new one, and from +0.3 s
// the bar springs up as the next minute, unbuckling, with one overshoot,
// lifting the hammer on its back. Sparks squirt out from under the hammer;
// the stage jolts; the frog hops and its glasses jump.
//
// The hour hammer is wound up all hour by the windlass in the beam. On the
// hour both hammers fall: the beam rings span by span, sparks fountain from
// both presses, the frog is thrown in the air leaving its glasses behind
// and lands dizzy. The floor is a cutaway gear train that ticks once a
// second with a dead-beat recoil.
//
// Every frame is a function of the clock: the slam is scheduled backwards
// from :00, the frog's minute from the plan, and the hammers' heights from
// the time. Burn-in: the face walks a 1 px orbit; everything but the beam,
// columns and floor moves. 23:00-07:00 the panel dims via ctx.night.

import { ease, clamp, lerp, progress, noise, orbit, previousMinute, dither, sprite, ON, OFF } from '../js/kit.js';

const TAU = Math.PI * 2;

// ------------------------------------------------------------ the iron
//
// Every numeral is ONE bar of iron, 2 px square, bent: a single
// centre-line in a 17x23 box whose free ends are rolled into open
// blacksmith's scrolls. One bar per digit is what lets the hammer crush any
// digit and re-bend it into any other.

const BW = 17, BH = 23;
const RB = 1.0;                     // bar half-width: 2 px

/** Centre-line builder: straight runs and elliptic arcs (clock angles, degrees). */
function pathOf(build) {
  const pts = [];
  const P = {
    move(x, y) { pts.push([x, y]); return P; },
    line(x, y) {
      const [x0, y0] = pts[pts.length - 1];
      const n = Math.max(1, Math.ceil(Math.hypot(x - x0, y - y0) / 0.3));
      for (let k = 1; k <= n; k++) pts.push([x0 + ((x - x0) * k) / n, y0 + ((y - y0) * k) / n]);
      return P;
    },
    arc(cx, cy, rx, ry, a0, a1) {
      const A0 = (a0 * Math.PI) / 180, A1 = (a1 * Math.PI) / 180;
      const n = Math.max(2, Math.ceil((Math.abs(A1 - A0) * Math.max(rx, ry)) / 0.3));
      for (let k = pts.length ? 1 : 0; k <= n; k++) {
        const a = A0 + ((A1 - A0) * k) / n;
        pts.push([cx + rx * Math.sin(a), cy - ry * Math.cos(a)]);
      }
      return P;
    },
  };
  build(P);
  return pts;
}

/**
 * Roll an open scroll onto one end of a centre-line: a spiral, tangent to
 * the bar, whose radius shrinks from R0 to R1 over `turns`. `side` +1 rolls
 * clockwise on screen, -1 anticlockwise.
 */
function scroll(pts, atStart, side, R0, R1 = 2.0, turns = 0.92) {
  const n = pts.length;
  const [ax, ay] = atStart ? pts[0] : pts[n - 1];
  const [bx, by] = atStart ? pts[Math.min(4, n - 1)] : pts[Math.max(0, n - 5)];
  let th = Math.atan2(ay - by, ax - bx), x = ax, y = ay;
  const out = [], total = turns * TAU, ds = 0.3;
  for (let a = 0; a < total;) {
    const R = lerp(R0, R1, a / total), d = ds / R;
    th += side * d; a += d;
    x += Math.cos(th) * ds; y += Math.sin(th) * ds;
    out.push([x, y]);
  }
  return out;
}

/** A glyph: one bar, `ends` = [start, end] scroll as [side, R0] or null. */
function bar(build, ends = [null, null]) {
  let pts = pathOf(build);
  if (ends[0]) pts = scroll(pts, true, ...ends[0]).reverse().concat(pts);
  if (ends[1]) pts = pts.concat(scroll(pts, false, ...ends[1]));
  return pts;
}

const GLYPH = {
  // the 0 is a plain forge-welded ring: a scroll anywhere on it reads as a 6 or a G
  0: bar((p) => p.arc(8.5, 11.5, 6.5, 10, 0, 360)),
  // the 1 stays plain: any curl on its flag reads as a 9 in the small hour press
  1: bar((p) => p.move(4, 6.8).line(10, 1.5).line(10, 21.5)),
  2: bar((p) => p.arc(8.5, 7.4, 6.2, 5.9, -48, 122).line(1.8, 21.5).line(13.6, 21.5), [[-1, 3.2], [-1, 2.8]]),
  3: bar((p) => p.arc(8.3, 6.1, 5.9, 4.6, -40, 180).arc(8.3, 16.1, 6.8, 5.4, 0, 222), [[-1, 3.0], [1, 3.2]]),
  4: bar((p) => p.move(11.5, 21.5).line(11.5, 1.5).line(1.5, 15).line(14.2, 15), [null, [1, 2.2]]),
  5: bar((p) => p.move(13.4, 1.5).line(4, 1.5).line(3.4, 9.6).arc(8.6, 15.1, 6.6, 6.4, -56, 222), [[1, 2.8], [1, 3.2]]),
  7: bar((p) => p.move(2.6, 1.5).line(15.5, 1.5).line(7.6, 19.6), [[-1, 2.9], [1, 2.2]]),
  // the 8 is two loops bound at the waist by a forged collar
  8: bar((p) => p.arc(8.5, 6.1, 5.3, 4.6, 180, -180).arc(8.5, 16.2, 6.6, 5.3, 0, 360)
    .line(6.4, 10.9).line(6.4, 9.9).line(10.6, 9.9).line(10.6, 11.9).line(6.4, 11.9).line(6.4, 10.9)),
};
// the 9: a bowl, a straight stem, and a foot rolled up under the bowl; the 6 is its turn
GLYPH[9] = bar((p) => p.arc(8.5, 7.6, 6.4, 6.1, 92, 92 - 360).line(14.9, 15).arc(9.6, 15.5, 5.3, 6, 90, 180), [null, [1, 2.4]]);
GLYPH[6] = GLYPH[9].map(([x, y]) => [BW - x, BH - y]).reverse();

/** Resample a centre-line to N points evenly along its length. */
function resample(pts, N) {
  const L = [0];
  for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const tot = L[L.length - 1], out = [];
  let j = 0;
  for (let k = 0; k < N; k++) {
    const s = (tot * k) / (N - 1);
    while (j < pts.length - 2 && L[j + 1] < s) j++;
    const u = L[j + 1] > L[j] ? (s - L[j]) / (L[j + 1] - L[j]) : 0;
    out.push([lerp(pts[j][0], pts[j + 1][0], u), lerp(pts[j][1], pts[j + 1][1], u)]);
  }
  return out;
}

const NS = 200;                         // points per bar, so a bar can buckle anywhere
const RES = {};
for (let d = 0; d < 10; d++) RES[d] = resample(GLYPH[d], NS);
export { RES, BW, BH };

/** Draw a bar: a 2 px square-ish stroke stamped along its centre-line. */
export function stampBar(g, pts, ox = 0, oy = 0, c = ON, thin = false) {
  let lx = 1e9, ly = 1e9;
  if (thin) {
    // crumpled: the bar seen edge-on, a 1 px wire, so its kinks stay open
    for (const [x, y] of pts) g.pixel(Math.floor(ox + x), Math.floor(oy + y), c);
    return;
  }
  for (const [x, y] of pts) {
    // a 2x2 stamp centred on the line point covers a 2 px bar exactly
    const X = Math.round(ox + x - 1), Y = Math.round(oy + y - 1);
    if (X === lx && Y === ly) continue;
    lx = X; ly = Y;
    g.pixel(X, Y, c); g.pixel(X + 1, Y, c); g.pixel(X, Y + 1, c); g.pixel(X + 1, Y + 1, c);
  }
}

/** For review (out/automaton-digits.png): the ten bars and the colon bolts. */
export function drawDigitSheet(g) {
  for (let d = 0; d < 10; d++) stampBar(g, RES[d], 3 + d * 21, 3);
}

// ------------------------------------------------------------ the stage
//
// Two presses under one beam: a small one for the hours, the big one for
// the minutes, the frog's handwheel at the right. Stage coordinates,
// before the burn-in orbit and the shake of a blow.

const BED = 55;                     // top face of the anvils
const FLOOR = 59;
const GTOP = 0.5, GBOT = 22.5;      // a glyph's stroke extents, box units
const BAY = [
  // hours: digits at 0.75 scale, a light ram wound up by clockwork all hour
  { x0: 2, x1: 31, dx: [3.5, 17], S: 0.75, RH: 6, topB: 17, chain: 16 },
  // minutes: digits at 1.25 scale, the frog's heavy ram
  { x0: 35, x1: 82, dx: [36.8, 59.4], S: 1.25, RH: 7, topB: 16.5, chain: 58 },
];
for (const b of BAY) { b.H = (GBOT - GTOP) * b.S; b.rest = BED - b.H; }
const WHEEL = [95.5, 38], WR = 7, KNOB = 9.2;     // the handwheel; six knobs round it
const HUBR = 1.5;                               // the chain winds on its hub
const PED = [100, 58], PEDL = 7.6;              // the trip pedal: pivot and length
const FROG = 116;                               // the frog's feet

const SMIN = 0.36;                  // crushed: a crumpled heap a third of the digit's height

/**
 * A bar squashed to `s` of its height on the anvil. Iron cannot get
 * shorter, so the upright runs of the bar fold into a zigzag, accordion
 * style, with just enough swing to keep their length; runs that lie
 * across the digit only sink. So a crushed 9 is still a flattened bowl
 * on a folded stem. Folds are pitched by the digit's own height (3-4 per
 * upright), phased per turn by `ph`; `bk` fades the folding out as the
 * bar springs back. Writes stage coordinates into `out`.
 */
const PITCH = 6.5;                  // fold pitch, glyph units
function crushed(pts, b, ox, s, ph, out, bk = 1) {
  const S = b.S, n = pts.length, sc = Math.min(1, s);
  const amp = bk * (PITCH * S / 4) * Math.sqrt(Math.max(0, 1 - sc * sc));
  const wx = s < 1 ? 1 + 0.18 * (1 - s) : 1 / Math.sqrt(s);
  for (let i = 0; i < n; i++) {
    const [x, y] = pts[i];
    const p0 = pts[Math.max(0, i - 2)], p1 = pts[Math.min(n - 1, i + 2)];
    const dx = p1[0] - p0[0], dy = p1[1] - p0[1];
    const v = Math.abs(dy) / (Math.hypot(dx, dy) || 1);            // how upright this bit of bar is
    const z = (2 / Math.PI) * Math.asin(Math.sin((y / PITCH) * TAU + ph));   // triangle wave: sharp folds
    out[i][0] = clamp(ox + (8.5 + (x - 8.5) * wx) * S + amp * v * v * z, b.x0 + 1.5, b.x1 - 1.5);
    out[i][1] = BED - (GBOT - y) * S * s;
  }
  return out;
}

// ------------------------------------------------------------ the minute
//
// The frog cranks the minute ram up in three bursts, resting (and
// fidgeting) between them, then waits at the trip lever. The plan comes
// from noise(minuteKey), so every minute is a little different.

const FIDGETS = ['wipe', 'glasses', 'wave', 'lookup'];

function plan(key) {
  const r1 = 4.5 + 3 * noise(key, 1), r2 = 4.5 + 3 * noise(key, 2);
  const start = TEND, end = 50 + 2 * noise(key, 3);
  const work = end - start - r1 - r2;
  const w = [1 + noise(key, 4), 1 + noise(key, 5), 1 + noise(key, 6)];
  const ws = w[0] + w[1] + w[2];
  const b = w.map((v) => (v / ws) * work);
  const bursts = [[start, start + b[0]]];
  bursts.push([bursts[0][1] + r1, bursts[0][1] + r1 + b[1]]);
  bursts.push([bursts[1][1] + r2, bursts[1][1] + r2 + b[2]]);
  const f1 = FIDGETS[Math.floor(noise(key, 7) * 4)];
  let f2 = FIDGETS[Math.floor(noise(key, 8) * 4)];
  if (f2 === f1) f2 = FIDGETS[(FIDGETS.indexOf(f1) + 1) % 4];
  return { bursts, fidgets: [f1, f2], share: b.map((v) => v / work) };
}

const smooth = (u) => u * u * (3 - 2 * u);

/** 0..1: how far the frog has cranked the ram up by `sec`. */
function cranked(P, sec) {
  let p = 0;
  for (let i = 0; i < 3; i++) {
    const [a, b] = P.bursts[i];
    // each burst starts and ends gently (ease in-out), cranks steadily between
    const u = progress(sec, a, b);
    const A = 0.15, k = 1 / (2 * A * (1 - A));
    const e = u < A ? u * u * k : u > 1 - A ? 1 - (1 - u) ** 2 * k : (u - A / 2) / (1 - A);
    p += P.share[i] * clamp(e, 0, 1);
  }
  return clamp(p, 0, 1);
}

/** What phase of the minute the frog is in, with local time. */
function phase(P, sec) {
  const [b1, b2, b3] = P.bursts;
  if (sec < 0.9) return ['blow', sec];
  if (sec < TEND) return ['admire', sec - 0.9];
  if (sec < b1[1]) return ['crank', sec];
  if (sec < b2[0]) return ['rest', sec - b1[1], b2[0] - b1[1], P.fidgets[0]];
  if (sec < b2[1]) return ['crank', sec];
  if (sec < b3[0]) return ['rest', sec - b2[1], b3[0] - b2[1], P.fidgets[1]];
  if (sec < b3[1]) return ['crank', sec];
  if (sec < 58.7) return ['wait', sec - b3[1], 58.7 - b3[1]];
  if (sec < 60 + TR - 0.07) return ['ready', sec - 58.7];
  return ['trip', sec - 60 - TR + 0.07];
}

// ------------------------------------------------------------ the blow
//
// One timeline for a slam, in seconds `u` from the turn: the pedal trips
// the ram at -0.55, it falls freely and meets the digits' tops at -0.30,
// then crushes them, buckling, flat by exactly :00. Flat, the bar is
// re-bent (the two centre-lines blend inside a 3 px slab, which reads as
// nothing but crumpled iron); from +0.30 it springs up as the new digit,
// unbuckling, with one overshoot, and lifts the ram with it.

const TR = -0.62, TC = -0.45, TS = 0.22, TEND = 3.0;
const WN = 3.6, ZETA = 0.4, WD = WN * Math.sqrt(1 - ZETA * ZETA);
const TPEAK = Math.PI / WD;                               // the spring's first overshoot
const SPEAK = 1 + (1 - SMIN) * Math.exp(-ZETA * WN * TPEAK);

function spring(tau) {
  if (tau <= 0) return 0;
  const e = Math.exp(-ZETA * WN * tau);
  return 1 - e * (Math.cos(WD * tau) + ((ZETA * WN) / WD) * Math.sin(WD * tau));
}

/** Where a ram ends up after a slam: caught by its pawl at the top of the rebound. */
const caught = (b) => BED - b.H * SPEAK;

/** {s, m, ramB} for bay `b` during a slam: squash, old->new blend, ram bottom. */
function slam(u, b) {
  const G = (2 * (b.rest - b.topB)) / (TC - TR) ** 2, VC = G * (TC - TR);
  if (u < TC) { const d = Math.max(0, u - TR); return { s: 1, m: 0, ramB: b.topB + 0.5 * G * d * d }; }
  if (u < 0) {
    // Hermite from contact speed to rest: the iron gives, buckles, then stops the ram
    const k = (u - TC) / -TC, d0 = (VC * TC) / b.H;
    const s = (2 * k ** 3 - 3 * k ** 2 + 1) + (k ** 3 - 2 * k ** 2 + k) * d0 + (-2 * k ** 3 + 3 * k ** 2) * SMIN;
    return { s, m: 0, ramB: BED - b.H * s, bk: 1 };
  }
  if (u < TS) return { s: SMIN, m: smooth(u / TS), ramB: BED - b.H * SMIN, bk: 1 };
  const s = SMIN + (1 - SMIN) * spring(u - TS);
  // the ram rides the springing bar up, and its pawl catches it at the top
  // and it straightens out as it rises: the kinks are gone by the overshoot
  return { s, m: 1, ramB: u - TS < TPEAK ? BED - b.H * s : caught(b), bk: 1 - smooth(progress(u - TS, 0, TPEAK * 0.85)) };
}

/** The minute ram (and its digits) at `sec`. */
function minuteRam(P, sec) {
  const b = BAY[1];
  if (sec >= 60 + TR) return slam(sec - 60, b);
  if (sec < TEND) return slam(sec, b);
  return { ramB: lerp(caught(b), b.topB, cranked(P, sec)), s: 1, m: 1 };
}

/** The hour ram: wound up slowly all hour by the clockwork in the beam. */
function hourRam(m, sec) {
  const b = BAY[0];
  if (m === 59 && sec >= 60 + TR) return slam(sec - 60, b);
  if (m === 0 && sec < TEND) return slam(sec, b);
  // from where the pawl caught it, the slow climb all hour
  const T = m * 60 + sec;
  return { ramB: lerp(caught(b), b.topB, smooth(progress(T, TEND, 59 * 60 + 40))), s: 1, m: 1 };
}

// ------------------------------------------------------------ machinery

/** A spur gear: teeth, rim, hub and `spokes` spokes, turned to `ang` (rad). */
function gear(g, cx, cy, r, teeth, ang, spokes = 0) {
  const n = spokes ? TAU / spokes : 0;
  g.fillWhere((px, py) => {
    const dx = px - cx, dy = py - cy, d = Math.hypot(dx, dy);
    if (d > r + 1.25) return false;
    const a = Math.atan2(dx, -dy) - ang;
    if (d > r) return Math.cos(teeth * a) > 0.1;
    if (d > r - 1.2 || d < 1.5) return true;
    if (spokes) {
      const f = ((a % n) + n) % n;
      return d * Math.abs(Math.sin(Math.min(f, n - f))) < 0.62;
    }
    return false;
  }, ON, [cx - r - 2, cy - r - 2, 2 * r + 4, 2 * r + 4]);
}

/** A pulley sheave: a rim and one spoke. */
function sheave(g, cx, cy, r, ang) {
  g.fillWhere((px, py) => {
    const dx = px - cx, dy = py - cy, d = Math.hypot(dx, dy);
    if (d > r + 0.5) return false;
    if (d > r - 0.7 || d < 0.9) return true;
    const a = Math.atan2(dx, -dy) - ang;
    return d * Math.abs(Math.sin(a)) < 0.55;
  }, ON, [cx - r - 1, cy - r - 1, 2 * r + 2, 2 * r + 2]);
}

/** Chain: alternating round and edge-on links, `ph` px along its length. */
function chainV(g, x, y0, y1, ph) {
  for (let y = Math.round(y0); y <= Math.round(y1); y++) {
    const k = (((y + Math.round(ph)) % 4) + 4) % 4;
    if (k === 1) { g.pixel(x - 1, y); g.pixel(x + 1, y); } else g.pixel(x, y);
  }
}
function chainH(g, x0, x1, y0, ph, wob) {
  for (let x = Math.round(x0); x <= Math.round(x1); x++) {
    const y = y0 + Math.round(wob(x));
    const k = (((x + Math.round(ph)) % 4) + 4) % 4;
    if (k === 1) { g.pixel(x, y - 1); g.pixel(x, y + 1); } else g.pixel(x, y);
  }
}

/** A drop-forge ram: a riveted iron block with a solid striking face. */
function ram(g, b, yb) {
  const { x0, x1, RH } = b, y = Math.round(yb) - RH, w = x1 - x0;
  g.fillRect(x0, y, w, RH, OFF);
  g.rect(x0, y, w, RH);
  g.fillRect(x0 + 1, y + RH - 3, w - 2, 2);
  for (let rx = x0 + 2; rx < x1 - 1; rx += 4) g.pixel(rx, y + 2);
  g.pixel(x0 - 1, y + 1); g.pixel(x0 - 1, y + 2); g.pixel(x1, y + 1); g.pixel(x1, y + 2);   // guide shoes
  return y;   // where the chain hooks on
}

/** An anvil block under a bay. */
function anvil(g, x0, x1) {
  g.fillRect(x0 - 1, BED, x1 - x0 + 2, FLOOR - BED, OFF);
  g.hline(x0 - 1, BED, x1 - x0 + 2);
  g.pixel(x0 - 1, BED + 1); g.pixel(x1, BED + 1);
  g.hline(x0, BED + 1, 1); g.hline(x1 - 1, BED + 1, 1);
  g.pixel(x0 + 2, BED + 2); g.pixel(x1 - 3, BED + 2);
  g.hline(x0 + 1, FLOOR - 1, x1 - x0 - 2);
}

/**
 * Sparks squeezed out from under a ram: closed-form ballistic arcs with
 * one bounce on the floor, seeded per turn. u = seconds since impact.
 */
function sparks(g, u, x0, x1, key, count, power, wallL = -99, wallR = 999) {
  if (u < 0 || u > 1.8) return;
  const GRAV = 300;
  for (let i = 0; i < count; i++) {
    const side = i & 1 ? 1 : -1;
    const n1 = noise(key, 31 + i), n2 = noise(key, 77 + i), n3 = noise(key, 123 + i);
    const life = (0.35 + 0.6 * n3) * (0.8 + 0.2 * power);
    const t = u - 0.02 * noise(key, 200 + i);
    if (t < 0 || t > life) continue;
    const x0s = side > 0 ? x1 + 0.5 : x0 - 0.5, y0s = BED - 2 - 2 * noise(key, 300 + i);
    const vx = side * (35 + 110 * n1) * power, vy = -(45 + 120 * n2) * Math.sqrt(power);
    const at = (tt) => {
      // first contact with the floor, then a dull bounce
      const yF = FLOOR - 1 - y0s;
      const t1 = (-vy + Math.sqrt(vy * vy + 2 * GRAV * yF)) / GRAV;
      if (tt < t1) return [x0s + vx * tt, y0s + vy * tt + 0.5 * GRAV * tt * tt];
      const vb = -0.32 * (vy + GRAV * t1), tb = tt - t1;
      return [x0s + vx * t1 + 0.55 * vx * tb, FLOOR - 1 + Math.min(0, vb * tb + 0.5 * GRAV * tb * tb)];
    };
    if (t > life * 0.7 && noise(i, Math.floor(u * 30)) < 0.4) continue;   // flicker out
    const wall = (q) => { const [px, py] = at(q); return [px < wallL ? 2 * wallL - px : px > wallR ? 2 * wallR - px : px, py]; };
    const [x, y] = wall(t), [xp, yp] = wall(Math.max(0, t - 0.035));
    g.line(xp, yp, x, y);
    if (t < life * 0.6) g.fillRect(Math.round(x - 0.5), Math.round(y - 0.5), 2, 2);   // a hot 2 px head
  }
}

/** The gantry: a riveted beam, three guide columns, the windlass box, the colon. */
function gantry(g, wob) {
  for (let x = 0; x < 101; x++) {
    const d = Math.round(wob(x));
    g.pixel(x, 1 + d); g.pixel(x, 3 + d);
    if (x % 4 === 2) g.pixel(x, 2 + d);
  }
  for (const x of [1, 33, 84]) {
    g.pixel(x - 1, 4); g.pixel(x + 1, 4); g.pixel(x + 1, 5); g.pixel(x - 1, 5);
    if (x === 33) { g.vline(x, 4, 36); g.vline(x, 45, 3); g.vline(x, 52, BED - 52); }
    else g.vline(x, 4, BED - 4);
  }
  // the colon: two big bolts through the centre column
  g.fillCircle(33.5, 42.5, 1.9);
  g.fillCircle(33.5, 49.5, 1.9);
  // the windlass housing in the beam that winds the hour ram
  const d = Math.round(wob(16));
  g.fillRect(11, 3 + d, 11, 5, OFF);
  g.rect(11, 3 + d, 11, 5);
}

/**
 * The beam's ring after a blow: each span between columns bends in its
 * own half-sine, alternate spans opposite, decaying. Only the hour's double
 * blow is hard enough to see.
 */
function beamWobble(u, amp) {
  if (u < 0 || u > 2.5 || amp <= 0) return () => 0;
  const a = amp * Math.exp(-2.2 * u) * Math.sin(u * 21);
  return (x) => {
    if (x < 2) return 0;
    if (x < 33) return a * Math.sin((Math.PI * (x - 1)) / 32);
    if (x < 84) return -a * Math.sin((Math.PI * (x - 33)) / 51);
    return a * 0.6 * ((x - 84) / 17);
  };
}

// ------------------------------------------------------------ the frog
//
// A frog in round glasses: a solid lit body with its features cut out in
// black (a wide mouth, the gap round each lens, the belly's edge). Arms and
// legs are two-bone limbs drawn behind the body.

/** Two-bone limb from S towards T (bones of length L), joint bent to `bend` side. */
function limb(S, T, L, bend) {
  let dx = T[0] - S[0], dy = T[1] - S[1];
  let d = Math.hypot(dx, dy);
  if (d > 2 * L - 0.01) { const k = (2 * L - 0.01) / d; dx *= k; dy *= k; d = 2 * L - 0.01; }
  const h = Math.sqrt(Math.max(0, L * L - (d / 2) ** 2)), q = d || 1;
  return { j: [S[0] + dx / 2 - (bend * h * dy) / q, S[1] + dy / 2 + (bend * h * dx) / q], e: [S[0] + dx, S[1] + dy] };
}

function drawArm(g, S, H, bend) {
  const { j, e } = limb(S, H, 6.3, bend);
  g.thickLine(j[0], j[1], e[0], e[1], 3.2, OFF); g.fillCircle(e[0], e[1], 2.4, OFF);
  g.thickLine(S[0], S[1], j[0], j[1], 2); g.thickLine(j[0], j[1], e[0], e[1], 1.8);
  g.fillCircle(e[0], e[1], 1.75);
}

function drawLeg(g, S, F, bend) {
  const { j, e } = limb(S, F, 4.4, bend);
  g.thickLine(S[0], S[1], j[0], j[1], 1.9); g.thickLine(j[0], j[1], e[0], e[1], 1.6);
  const dir = bend < 0 ? -1 : 1;   // webbed feet point outwards
  g.thickLine(e[0], e[1], e[0] + 2.6 * dir, e[1] + 0.1, 1.3);
  g.thickLine(e[0], e[1], e[0] - 1.2 * dir, e[1] + 0.1, 1.3);
}

function drawFrog(g, P, t) {
  const fx = FROG + P.bx, fy = FLOOR + P.by, sq = P.sq;
  const hx = fx + P.lean, hy = fy - 18.5 * sq;
  const by = fy - 8.8 * sq;
  const eyes = [[hx - 5.1, hy - 4.4], [hx + 5.1, hy - 4.4]];
  const box = [fx - 14, fy - 33, 29, 34];
  const rx = 7.6 / Math.sqrt(sq), ry = 6.4 * sq;
  // glasses that jump far leave the bare eyes behind
  const far = Math.abs(P.glassY) > 2.2, eg = far ? 0 : P.glassY, er = far ? 12 : 17.6;
  const inside = (x, y) =>
    ((x - fx) / rx) ** 2 + ((y - by) / ry) ** 2 <= 1 ||
    ((x - hx) / 10) ** 2 + ((y - hy) / 5.2) ** 2 <= 1 ||
    (x - eyes[0][0]) ** 2 + (y - eyes[0][1] - eg) ** 2 <= er ||
    (x - eyes[1][0]) ** 2 + (y - eyes[1][1] - eg) ** 2 <= er;
  // a black keyline round the whole frog, so it reads against the wheel
  g.fillWhere((x, y) => inside(x, y) || inside(x - 1, y) || inside(x + 1, y) || inside(x, y - 1) || inside(x, y + 1), OFF, box);
  // limbs behind the body: arms from the shoulders, froggy legs, knees out
  drawLeg(g, [fx - 4, fy - 4.5 * sq], P.footL ?? FOOT_L, -1);
  drawLeg(g, [fx + 4, fy - 4.5 * sq], P.footR ?? FOOT_R, 1);
  drawArm(g, [fx - 5.5, fy - 13 * sq], P.hands[0], 1);
  drawArm(g, [fx + 5.5, fy - 13 * sq], P.hands[1], -1);
  g.fillWhere(inside, ON, box);
  // the pale belly's edge
  g.fillWhere((x, y) => { const q = ((x - fx) / 4.6) ** 2 + ((y - by - 1.2) / 4.4) ** 2; return q >= 0.78 && q <= 1.05 && y > by - 1; }, OFF, box);
  // glasses: the eyes' lit rims, a black gap where they sit on the face,
  // dark lenses with the eyes inside; they jump with a blow
  const gy = P.glassY;
  const feature = (k, ex, ey, c) => {
    const px = Math.round(ex + P.look[0] * 0.8 - 1.5), py = Math.round(ey + P.look[1] * 0.8 - 1.5);
    if (P.eyes === 'open') { g.fillRect(px, py, 3, 3, c); g.pixel(px, py, c === ON ? OFF : ON); }   // a pupil with a shine
    else if (P.eyes === 'wide') g.pixel(px + 1, py + 1, c);
    else if (P.eyes === 'shut') g.hline(Math.round(ex - 1.5), Math.round(ey), 3, c);
    else if (P.eyes === 'happy') g.blit(HAPPY, Math.round(ex - 1.5), Math.round(ey - 1), { c });
    else if (P.eyes === 'dizzy') g.blit(DIZZY, Math.round(ex - 1.5), Math.round(ey - 1.5), { c });
    else g.blit(k ? SQUEEZE_R : SQUEEZE_L, Math.round(ex - 1.5), Math.round(ey - 1.5), { c });
  };
  for (let k = 0; k < 2; k++) {
    const ex = eyes[k][0], ey = eyes[k][1] + gy;
    if (far) feature(k, ex, eyes[k][1], OFF);
    g.fillCircle(ex, ey, 5.05, OFF);
    g.ring(ex, ey, 3.05, 4.25);
    g.fillCircle(ex, ey, 3.05, OFF);
    if (!far) feature(k, ex, ey, ON);
  }
  g.hline(Math.round(eyes[0][0] + 4), Math.round(eyes[0][1] + gy - 1), Math.round(eyes[1][0] - eyes[0][0] - 8));
  // a wide frog mouth, cut out of the face, corners turned up
  const mx = hx, my = hy + 2.2, wide = 8.2;
  const curve = P.mouth === 'flat' ? 0.4 : P.mouth === 'o' ? 0 : 1.8;
  for (let x = Math.round(mx - wide); x <= Math.round(mx + wide); x++) {
    const u = (x + 0.5 - mx) / wide, y = Math.round(my - curve + curve * (1 - u * u) * 1.1);
    g.pixel(x, y, OFF);
    if (P.mouth === 'grin' && Math.abs(u) < 0.62) g.pixel(x, y - 1, OFF);
  }
  if (P.mouth === 'o') g.fillEllipse(mx, my + 1, 1.8, 1.6, OFF);
  // stars round a dizzy head
  if (P.stars > 0) for (let k = 0; k < 3; k++) {
    const a = t * 7 + (k * TAU) / 3, sx = Math.round(hx + 8.5 * Math.cos(a)), sy = Math.round(hy - 13 + 2 * Math.sin(a));
    g.pixel(sx, sy); g.pixel(sx - 1, sy); g.pixel(sx + 1, sy); g.pixel(sx, sy - 1); g.pixel(sx, sy + 1);
  }
}

const SQUEEZE_L = sprite(`
  #..
  .##
  #..`);
const SQUEEZE_R = sprite(`
  ..#
  ##.
  ..#`);
const DIZZY = sprite(`
  #.#
  .#.
  #.#`);
const HAPPY = sprite(`
  .#.
  #.#`);

// ------------------------------------------------------------ the frog's minute

const knob = (a) => [WHEEL[0] + KNOB * Math.sin(a), WHEEL[1] - KNOB * Math.cos(a)];
const A0 = (35 * Math.PI) / 180, SPAN = (2 * Math.PI) / 3, HOLD = 0.68;

/**
 * Hand over hand: each hand holds a knob from 35 deg (upper right) while
 * the frog pulls it down, lets go at the bottom of its reach, and reaches
 * back up for the next knob but one. Pure function of the wheel angle.
 */
function handOnWheel(w, which) {
  const off = which ? Math.PI / 3 : 0;
  const c = ((((w + off - A0) % SPAN) + SPAN) % SPAN) / SPAN;
  if (c < HOLD) return { p: knob(A0 + c * SPAN), c };
  const u = smooth((c - HOLD) / (1 - HOLD));
  const from = knob(A0 + HOLD * SPAN), to = knob(A0 + c * SPAN - SPAN);
  const bulge = 2.4 * Math.sin(Math.PI * u);
  return { p: [lerp(from[0], to[0], u) + bulge, lerp(from[1], to[1], u)], c };
}

function base(w) {
  const a = handOnWheel(w, 0), b = handOnWheel(w, 1);
  const heave = Math.cos(a.c * TAU * 1.5);
  return { bx: 0, by: -0.4 + 0.4 * heave, sq: 1 + 0.025 * heave, lean: -1 - 0.6 * heave,
    hands: [a.p, b.p], footL: null, footR: null,
    look: [-1, -0.3], eyes: 'open', glassY: 0, mouth: 'flat', key: 0 };
}

const FOOT_L = [FROG - 6.5, FLOOR - 0.5], FOOT_R = [FROG + 6.5, FLOOR - 0.5];

function mix(a, b, w) {
  if (w <= 0) return a;
  if (w >= 1) return b;
  const o = { ...(w < 0.5 ? a : b) };
  for (const k of ['bx', 'by', 'sq', 'lean', 'glassY']) o[k] = lerp(a[k], b[k], w);
  const L = (p, q) => [lerp(p[0], q[0], w), lerp(p[1], q[1], w)];
  o.look = L(a.look, b.look);
  o.hands = [L(a.hands[0], b.hands[0]), L(a.hands[1], b.hands[1])];
  o.footL = L(a.footL ?? FOOT_L, b.footL ?? FOOT_L);
  o.footR = L(a.footR ?? FOOT_R, b.footR ?? FOOT_R);
  return o;
}

/** The trip pedal's tip, pressed by `k` (0..1). */
const pedalTip = (k) => [PED[0] + PEDL * 0.97, PED[1] - 2.3 + 2.4 * k];

/** A fidget at local time `u` of a rest lasting `D`, from the wheel and back. */
function fidget(kind, u, D, w) {
  const c = base(w), fx = FROG, hy = FLOOR - 20.5;
  const k = smooth(progress(u, 0, 0.45)) * (1 - smooth(progress(u, D - 0.5, D)));
  const f = { ...c, mouth: 'smile', look: [0, 0], by: 0, sq: 1, lean: 0 };
  if (kind === 'wipe') {
    // phew: wipe the brow, flick the sweat away
    f.hands = [c.hands[0], [fx + 2 + 2.6 * Math.sin(u * 8), hy - 7.5]];
    f.eyes = 'shut'; f.mouth = 'o'; f.lean = 0.6;
  } else if (kind === 'glasses') {
    // push the glasses back up the nose, then a satisfied blink
    const q = progress(u, 0.6, 1.2);
    f.hands = [c.hands[0], [fx - 1, hy - 2.5 - 2 * smooth(q)]];
    f.glassY = 1.2 - 1.6 * smooth(q);
    f.eyes = (u > 1.5 && u < 1.65) ? 'shut' : 'open';
  } else if (kind === 'wave') {
    // a wave to you
    f.hands = [c.hands[0], [fx + 9 + 1.6 * Math.sin(u * 10), hy - 6 + 0.8 * Math.abs(Math.cos(u * 10))]];
    f.mouth = 'grin'; f.look = [0.2, 0];
  } else {
    // look up at the hammer, worried, blink twice
    f.look = [-0.7, -1]; f.mouth = 'o'; f.lean = -1.5;
    f.eyes = (u > 1.0 && u < 1.12) || (u > 1.4 && u < 1.52) ? 'shut' : 'open';
  }
  return mix(c, f, k);
}

/** The frog's pose at `sec`, given the wheel angle and the pedal. */
function pose(P, sec, w, ped, hourly, t) {
  const ph = phase(P, sec);
  const fx = FROG, hy = FLOOR - 20.5;
  const stand = { ...base(w), by: 0, sq: 1, lean: 0, look: [0, 0], mouth: 'grin',
    hands: [[fx - 4, hy + 8.5], [fx + 3, hy + 8.5]] };
  let o;
  if (ph[0] === 'crank') {
    o = base(w);
    if (Math.sin(sec * 0.8 + P.bursts[0][1]) > 0.94) o.look = [0, 0];          // a glance at you
    else if (Math.sin(sec * 0.55 + 1) > 0.9) o.look = [-0.8, -1];               // and up at the hammer
  } else if (ph[0] === 'rest') {
    o = fidget(ph[3], ph[1], ph[2], w);
  } else if (ph[0] === 'wait') {
    // let go of the wheel, rub hands, tap a toe, look at you
    const [, u] = ph;
    const rub = Math.sin(u * 14) * 0.9;
    const s = { ...stand, hands: [[fx - 3.5 + rub, hy + 8], [fx + 2.5 + rub, hy + 8.6]],
      footR: [FOOT_R[0], FLOOR - 0.5 - 1.6 * Math.max(0, Math.sin(u * 6.5))], look: u % 3.2 < 2 ? [0, 0] : [-0.8, -1] };
    o = mix(base(w), s, smooth(progress(u, 0, 0.6)));
  } else if (ph[0] === 'ready') {
    // anticipation: up on one leg, arms out, a squint at the hammer
    const u = ph[1], k = smooth(progress(u, 0, 0.55));
    const r = { ...stand, sq: 1.05, by: -0.6, lean: 0.8, look: [-0.8, -1], mouth: 'grin',
      hands: [[fx - 11, hy + 1], [fx + 10, hy + 0.5]], footL: [fx - 8.5, FLOOR - 7] };
    o = mix({ ...stand, hands: [[fx - 3.5, hy + 8], [fx + 2.5, hy + 8.6]] }, r, k);
    if (u > 0.65) o.eyes = 'squeeze';
  } else if (ph[0] === 'trip') {
    // STOMP, then hands over the ears
    const u = ph[1], k = smooth(progress(u, 0, 0.07)), e = smooth(progress(u, 0.1, 0.3));
    const tip = pedalTip(ped);
    const st = { ...stand, sq: lerp(1.05, 0.9, k), by: lerp(-0.6, 0, k), lean: 0.8, look: [-0.8, -1], eyes: 'squeeze', mouth: 'flat',
      hands: [[fx - 11, hy + 1 + 3 * k], [fx + 10, hy + 0.5 + 3 * k]], footL: [lerp(fx - 8.5, tip[0], k), lerp(FLOOR - 7, tip[1] - 0.6, k)] };
    const ears = { ...st, sq: 0.95, hands: [[fx - 10.5, hy - 1], [fx + 9.5, hy - 1]], footL: [tip[0], tip[1] - 0.6] };
    o = mix(st, ears, e);
  } else if (ph[0] === 'blow') {
    const u = ph[1], big = hourly ? 4.4 : 1;
    const T = hourly ? 0.8 : 0.42;
    const hop = Math.max(0, Math.sin(Math.PI * Math.min(1, u / T)));
    o = { ...stand, sq: 0.95 + 0.08 * hop, by: -3.4 * big * hop, lean: 0, look: [0, -0.5], eyes: u < 0.3 ? 'squeeze' : 'wide', mouth: 'o',
      hands: [[fx - 10.5, hy - 1 - 2 * hop], [fx + 9.5, hy - 1 - 2 * hop]],
      footL: [lerp(pedalTip(1)[0], FOOT_L[0], smooth(progress(u, 0, T))), FLOOR - 0.5 - 3.4 * big * hop],
      footR: [FOOT_R[0], FLOOR - 0.5 - 3.4 * big * hop],
      glassY: -4 * big * Math.sin(Math.PI * Math.min(1, u / (T + (hourly ? 0.05 : 0.15)))) };
    if (hourly && u > T) { o.eyes = 'shut'; o.stars = 1; }
    o = mix(o, { ...o, hands: [[fx - 8, hy + 5], [fx + 5, hy + 5]] }, smooth(progress(u, 0.5, 0.9)));
  } else {
    // admire the fresh iron: clap twice, then back to the wheel
    const u = ph[1];
    const clap = Math.abs(Math.sin(Math.PI * clamp((u - 0.1) / 0.5, 0, 2)));
    const cheer = { ...stand, hands: [[fx - 8 + 2.6 * clap, hy + 5], [fx + 5 - 2.6 * clap, hy + 5]],
      look: [-1, 0.6], eyes: u < 1.1 ? 'happy' : 'open', mouth: 'grin' };
    if (hourly && u < 0.8) { cheer.eyes = 'shut'; cheer.mouth = 'o'; cheer.stars = 1; cheer.lean = 1.6 * Math.sin(u * 14) * (1 - u / 0.8); }
    o = mix(cheer, base(w), smooth(progress(u, 1.05, 1.5)));
  }
  o.key = t * 1.4;
  return o;
}

/** The handwheel: rim, six spokes running out to knobs, hub. */
function handwheel(g, w) {
  g.ring(WHEEL[0], WHEEL[1], WR - 0.95, WR);
  for (let k = 0; k < 6; k++) {
    const a = w + (k * Math.PI) / 3;
    const [x1, y1] = knob(a);
    g.line(WHEEL[0] - 0.5, WHEEL[1] - 0.5, x1 - 0.5, y1 - 0.5);
    g.fillRect(Math.round(x1 - 1), Math.round(y1 - 1), 2, 2);
  }
  g.fillCircle(WHEEL[0], WHEEL[1], 1.7);
}


// ------------------------------------------------------------ the face

const digitsOf = (f) => [Math.floor(f.h / 10), f.h % 10, Math.floor(f.m / 10), f.m % 10];
const SCR = Array.from({ length: NS }, () => [0, 0, 0, 0, 0]);
const MIX = Array.from({ length: NS }, () => [0, 0]);

/** One digit in bay `b`: the old bar blending into the new by m, crushed to s. */
function drawDigit(g, b, ox, dOld, dNew, s, m, ph, bk = 1) {
  let src = RES[dNew];
  if (dOld !== dNew && m < 1) {
    const p = RES[dOld], q = RES[dNew];
    for (let i = 0; i < NS; i++) { MIX[i][0] = lerp(p[i][0], q[i][0], m); MIX[i][1] = lerp(p[i][1], q[i][1], m); }
    src = MIX;
  }
  if (s > 0.999 && s < 1.001) {
    // at rest: no buckling, just the bar at its bay's scale
    for (let i = 0; i < NS; i++) { SCR[i][0] = ox + src[i][0] * b.S; SCR[i][1] = BED - (GBOT - src[i][1]) * b.S; }
    stampBar(g, SCR);
  } else stampBar(g, crushed(src, b, ox, s, ph, SCR, bk), 0, 0, ON, s < 0.62);
}

/** Seconds ticking through the stage floor: a gear train with a dead-beat escapement. */
function plinth(g, f) {
  const T = (f.m * 60 + f.s) % 600, fr = f.ms / 1000;
  const a = (T + (fr < 0.16 ? ease.outBack(fr / 0.16) : 1)) * (TAU / 12);
  for (let i = 0; i < 12; i++) gear(g, 4 + i * 11, FLOOR + 6.2, 4.4, 10, (i & 1 ? -a : a) * 1.2 + (i & 1) * (TAU / 20), 3);
  g.hline(0, FLOOR, 128);
}

export default {
  name: 'Automaton',
  blurb: 'A clockwork frog in round glasses runs a drop forge: all minute it winds the hammer up hand over hand, then stomps the pedal; the iron minute buckles flat and springs up re-bent as the next. On the hour both hammers fall.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  driver: 'full',

  frame(g, ctx) {
    const { date, oled } = ctx;
    const f = ctx.fields, sec = f.sec;
    const t = (date.getTime() / 1000) % 3600;
    const P = plan(f.minuteKey);
    const post = sec < TEND, pre = sec >= 60 + TR;
    const cur = digitsOf(f), old = post ? digitsOf(previousMinute(date)) : cur;
    const hourly = (pre && f.m === 59) || (post && f.m === 0);
    const mr = minuteRam(P, sec), hr = hourRam(f.m, sec);
    const [BH0, BM] = BAY;
    const lift = BM.rest - mr.ramB, liftH = BH0.rest - hr.ramB;
    const w = lift / HUBR;                                   // the handwheel turns with the chain
    const ped = pre ? smooth(progress(sec - 60 - TR, -0.06, 0)) : 1 - smooth(progress(sec, 1.0, 1.4));

    // the gantry, which rings after the hour's double blow
    const wob = beamWobble(post ? sec : -1, hourly ? 3.5 : 0);
    gantry(g, wob);
    const wH = Math.round(wob(16)), wM = Math.round(wob(60)), wR = Math.round(wob(94));
    // hour ram on its chain from the windlass; minute ram over two sheaves to the wheel
    sheave(g, 16.5, 5.5 + wH, 1.6, liftH / 1.5);
    chainV(g, 16, 8 + wH, ram(g, BH0, hr.ramB) - 1, liftH);
    chainV(g, 58, 7 + wM, ram(g, BM, mr.ramB) - 1, lift);
    chainH(g, 61, 94, 4, -lift, wob);
    chainV(g, 97, 7 + wR, WHEEL[1], -lift);
    sheave(g, 60.5, 7 + wM, 2.5, lift / 2.5);
    sheave(g, 94.5, 7 + wR, 2.5, lift / 2.5);

    // the iron: hours under the hour ram, minutes under the minute ram
    const ph = noise(f.minuteKey, 9) * TAU;
    for (let k = 0; k < 4; k++) {
      const b = BAY[k >> 1], R = k < 2 ? hr : mr;
      drawDigit(g, b, b.dx[k & 1], old[k], cur[k], R.s, R.m, ph + k * 1.7, R.bk ?? 0);
    }
    anvil(g, BH0.x0, BH0.x1);
    anvil(g, BM.x0, BM.x1);
    plinth(g, f);

    // the winch: a handwheel on an A-frame, and the trip pedal at its foot
    for (const [dx, x2] of [[-0.62, -6], [0.45, 4.5]]) g.thickLine(WHEEL[0] + dx * WR, WHEEL[1] + WR * 0.8, WHEEL[0] + x2, FLOOR - 0.5, 1.2);
    handwheel(g, w);
    const tip = pedalTip(ped);
    g.thickLine(PED[0], PED[1], tip[0], tip[1], 1.6);
    g.fillRect(PED[0] - 1, PED[1] - 1, 3, 2);

    // sparks squeezed out at the blow
    if (post) {
      const pw = hourly ? 1.5 : 1;
      sparks(g, sec, BM.x0, BM.x1, f.minuteKey, hourly ? 30 : 26, pw, 34.5);
      if (hourly) sparks(g, sec, BH0.x0, BH0.x1, f.minuteKey + 7, 22, pw, 2.5, 32);
    }

    drawFrog(g, pose(P, sec, w, ped, hourly, t), t);

    // the blow shakes the stage; the whole face walks a small orbit for burn-in
    const [ox, oy] = orbit(date, 1, 4);
    const amp = hourly ? 3 : 1.3;
    const shake = post ? Math.round(amp * Math.exp(-sec * 9) * Math.sin(sec * 60)) : 0;
    if (ox || oy || shake) g.shift(ox, oy + shake);
    oled.contrast(0xcf + (0x20 - 0xcf) * ctx.night);
  },
};
