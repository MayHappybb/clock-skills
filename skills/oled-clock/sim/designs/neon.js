// Neon — the time as a sign in a bar window.
//
// Every digit is bent from one piece of glass. Its centre-line is a spline,
// and it is drawn as a hollow tube 4 px across: two lit walls with the dark
// bore between them, which reads as glass where a solid stroke reads as type.
// The forms are a neon bender's: a 2 with a hooked swan's head, a flat-topped
// 3, a 6 whose tail winds into a spiral, a 9 that curls back, a 0 whose ends
// overlap at the top. Where the tube passes in front of itself (the waist
// of the 8, the stem of the 4, the bar across the 7), the pass behind is cut
// back on both sides: the blockout a bender paints there. Above the time the
// day is written in a thinner tube, in script, with every letter joined. A
// martini with an olive on a pick and rising bubbles sits beside it.
//
// The minute turn: the tubes that change sputter (on, off, weak), then their
// glow shrinks back into both electrodes, and they are out by :00. Then the
// new ones strike left to right: the gas runs from one electrode to the
// other, weak behind a bright head, and once the last has lit they all
// flicker together and hold. Lighting left to right means what shows is
// always a prefix of the new time, and digits that change together flicker
// together, so no instant reads as a wrong time (no "1 :59").
//
// The "day" of the day name is bent as its own section and it is faulty: it
// buzzes in bursts and sometimes runs weak for a while. About one minute in
// four the whole sign browns out for a frame or two (global contrast, two
// bytes). On the hour the whole sign is switched off at :59 and back on in
// order: the day, the glass, the colon, the digits; then it winks twice and
// the olive leaps out of the glass. At midnight the day name strikes anew.
//
// Each frame is computed from the clock: which digits change is read from
// this minute, the last and the next; the sputter, flicker and buzz patterns
// come from noise() of the minute key or of time slots; the olive and bubbles
// step on the wall clock. Tubes are rasterised once (cached) as pixel lists
// carrying their arc length, so a frame only decides how much of each tube
// is lit.
//
// Burn-in: the tubes are outlines, so only 12% of the glass is lit. The
// sign walks a 2 px orbit and the martini a wider one of its own, out of
// step; from 23:00 to 07:00 the panel runs at low contrast.

import { dither, noise, orbit, previousMinute, clockFields } from '../js/kit.js';

// ------------------------------------------------------------ tube geometry

/** Centripetal Catmull-Rom through `pts`, sampled finely. */
function spline(pts) {
  if (pts.length < 3) return pts.map((p) => [...p]);
  const P = [[2 * pts[0][0] - pts[1][0], 2 * pts[0][1] - pts[1][1]], ...pts,
    [2 * pts.at(-1)[0] - pts.at(-2)[0], 2 * pts.at(-1)[1] - pts.at(-2)[1]]];
  const out = [];
  const tj = (a, b) => Math.max(1e-4, Math.hypot(b[0] - a[0], b[1] - a[1]) ** 0.5);
  for (let i = 1; i < P.length - 2; i++) {
    const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
    const t1 = tj(p0, p1), t2 = t1 + tj(p1, p2), t3 = t2 + tj(p2, p3);
    const n = 16;
    for (let k = 0; k < n; k++) {
      const t = t1 + ((t2 - t1) * k) / n;
      const L = (a, b, ta, tb) => [((tb - t) * a[0] + (t - ta) * b[0]) / (tb - ta), ((tb - t) * a[1] + (t - ta) * b[1]) / (tb - ta)];
      const A1 = L(p0, p1, 0, t1), A2 = L(p1, p2, t1, t2), A3 = L(p2, p3, t2, t3);
      const B1 = L(A1, A2, 0, t2), B2 = L(A2, A3, t1, t3);
      out.push(L(B1, B2, t1, t2));
    }
  }
  out.push([...pts.at(-1)]);
  return out;
}

/** An elliptical arc as points: clock angles (0 = up, clockwise), degrees. */
function ell(cx, cy, rx, ry, a0, a1, step = 15) {
  const pts = [], n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / step));
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    pts.push([cx + rx * Math.sin(a), cy - ry * Math.cos(a)]);
  }
  return pts;
}

/**
 * A tube from its pieces: each piece is a smooth run of points; pieces meet
 * at corners (a piece starts where the last one ended). Returns samples
 * [x, y, s] at ~0.25 px spacing, s being arc length from the first electrode.
 */
function tube(pieces) {
  const raw = [];
  for (const piece of pieces) {
    const pts = spline(piece);
    for (const p of (raw.length ? pts.slice(1) : pts)) raw.push(p);
  }
  const out = [[raw[0][0], raw[0][1], 0]];
  let s = 0;
  for (let i = 1; i < raw.length; i++) {
    const [ax, ay] = raw[i - 1], [bx, by] = raw[i];
    const d = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.ceil(d / 0.25));
    for (let k = 1; k <= n; k++) { s += d / n; out.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n, s]); }
  }
  return out;
}

/**
 * Rasterise tubes once into a list of pixels: [x, y, d, tubeIndex, s], d being
 * the distance from the centre-line. Where a tube passes over another
 * pass of itself (or another tube), the pass behind is cut back either side
 * of the front one: the blockout a neon bender paints there.
 */
function rasterise(tubes, { rc, rh, gap, slant = 0, h = 32, cross = true }) {
  const T = tubes.map((t) => (Array.isArray(t) ? { pieces: t } : t)).map((t) => ({ ...t, pts: tube(t.pieces) }));
  for (const t of T) for (const p of t.pts) p[0] += slant * (h - p[1]);
  const xs = T.flatMap((t) => t.pts.map((p) => p[0])), ys = T.flatMap((t) => t.pts.map((p) => p[1]));
  const x0 = Math.floor(Math.min(...xs) - rh - 1), x1 = Math.ceil(Math.max(...xs) + rh + 1);
  const y0 = Math.floor(Math.min(...ys) - rh - 1), y1 = Math.ceil(Math.max(...ys) + rh + 1);
  const px = [];
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const cx = x + 0.5, cy = y + 0.5;
      // Nearest point on each tube, and nearest on any *other pass*.
      let best = { d: 1e9 };
      const near = [];
      T.forEach((t, ti) => {
        for (const p of t.pts) {
          const d = Math.hypot(cx - p[0], cy - p[1]);
          if (d <= rh + gap) near.push({ d, ti, s: p[2], z: t.z ?? 0 });
          if (d < best.d) best = { d, ti, s: p[2], z: t.z ?? 0 };
        }
      });
      if (best.d > rh) continue;
      // A different pass: another tube, or the same tube far along it.
      const other = near.filter((n) => n.ti !== best.ti || Math.abs(n.s - best.s) > 3 * rh + gap);
      let pick = best;
      if (cross && other.length) {
        const o = other.reduce((a, b) => (b.d < a.d ? b : a));
        const front = (o.z !== best.z ? o.z > best.z : o.s > best.s) ? o : best;
        const behind = front === o ? best : o;
        if (front === o && o.d > rc && o.d <= rc + gap) continue;   // the blockout gap
        if (front === best && best.d > rc && behind.d <= rc) continue;
        pick = front === o && o.d <= rc ? o : best;
      }
      px.push([x, y, pick.d, pick.ti, pick.s]);
    }
  const len = T.map((t) => t.pts.at(-1)[2]);
  const ends = T.map((t) => [t.pts[0], t.pts.at(-1)]);
  return { px, len, ends };
}

// ------------------------------------------------------------ the digits
// Centre-lines in a box 15 wide, 30 tall (y down), before the scale and slant.

const DIGITS = {
  // 0: an oval whose two ends overlap at the top, the later one in front.
  0: [[ell(7, 15, 7, 15, -40, 330)]],
  // 1: a long sweeping flag.
  1: [[[[1, 10], [4.5, 6.5], [8, 3], [9.5, 0]], [[9.5, 0], [9, 30]]]],
  // 2: a swan: hooked head, long neck, a base that turns up at its tip.
  2: [[[[3.5, 7], [1, 5], [2.5, 1.5], [7, 0], [11.5, 1.5], [13.5, 6.5], [11.5, 12.5], [6, 19], [2, 24.5], [0, 29.5]], [[0, 29.5], [11, 29.5], [14, 28.5], [15, 25.5]]]],
  // 3: flat-topped, a sharp bend at the waist, the tail tucked back up.
  3: [[[[0.5, 0]], [[0.5, 0], [13.5, 0]], [[13.5, 0], [6, 11]], [[6, 11], [11, 12.5], [14, 18], [13.5, 25], [9, 30], [4, 30], [0.5, 27], [1.5, 24.5]]]],
  // 4: one piece: the diagonal, the bar, back behind itself, then the stem crossing in front.
  4: [[[[10.5, 0], [0, 21]], [[0, 21], [14.5, 21]]], { pieces: [[[10.5, 10], [10.5, 30]]], z: 1 }],
  // 5: flag curls at its right end.
  5: [[[[13, 3], [14.5, 0.5], [12, 0], [2, 0]], [[2, 0], [1, 13]], [[1, 13], [7, 11], [12, 12.5], [14.5, 19], [13, 27], [7, 30], [2, 29], [0, 26]]]],
  // 6: the tail winds in to a spiral inside the bowl.
  6: [[[[13, 2.5], [11, 0.3], [7, 0], [2, 4], [0, 13], [0, 22], [2.5, 28.5], [7, 30], [11.5, 28.5], [14, 22], [12, 15.5], [7, 13.5], [3.5, 16], [4, 21], [7, 22.5]]]],
  // 7: hooked top, crossed stem (the bar goes in front).
  7: [[[[0, 4], [0, 0]], [[0, 0], [14.5, 0]], [[14.5, 0], [10, 10], [6.5, 20], [5, 30]]], { pieces: [[[3.5, 15], [13.5, 15]]], z: 1 }],
  // 8: one closed figure, crossing at the waist.
  8: [[[[12.5, 4.5], [9.5, 0.5], [4.5, 0.5], [1.5, 4], [2, 9], [7, 14.5], [12.5, 20], [13.5, 25.5], [10, 30], [4, 30], [0.5, 25.5], [1.5, 20], [7, 14.5], [12, 10], [13.5, 7]]]],
  // 9: the tail swings out and curls back.
  9: [[[[13.5, 10], [11, 14], [6, 15], [1.5, 13.5], [0, 8], [2, 2], [7, 0], [12, 1.5], [14, 7], [14, 15], [12.5, 23], [9, 29], [4, 30], [0.5, 27.5], [2, 25], [4.5, 26]]]],
};

// The glass: a hollow tube 4 px across, two lit walls with the dark of the
// bore between them. (A bright core with a dithered halo was tried: at this
// size it reads as a thin font, where the double wall reads as glass.)
const DIGIT_SCALE = 32 / 30;
const STYLE = { rc: 2.1, rh: 2.1, gap: 1.2, slant: 0.12, h: 32 };
const LOOK = (d) => (d < 0.85 ? 0 : 1);
const scaleTube = (t, k) => {
  const sc = (pieces) => pieces.map((pc) => pc.map(([x, y]) => [x * k, y * k]));
  return Array.isArray(t) ? sc(t) : { ...t, pieces: sc(t.pieces) };
};
const glyphCache = new Map();
function glyph(d) {
  if (!glyphCache.has(d)) glyphCache.set(d, rasterise(DIGITS[d].map((t) => scaleTube(t, DIGIT_SCALE)), STYLE));
  return glyphCache.get(d);
}

/** Draw a rasterised glyph at (x, y); `level(ti, s, dx, dy)` gives brightness 0..1. */
function drawGlyph(g, G, x, y, level, look = LOOK) {
  for (const [dx, dy, d, ti, s] of G.px) {
    const v = level(ti, s, dx, dy);
    if (v <= 0) continue;
    const X = x + dx, Y = y + dy;
    const w = look(d);              // 1 = glass wall/core, fraction = halo, 0 = dark
    if (w <= 0) continue;
    if (w >= 1 ? v >= 1 || dither(X, Y, v) : dither(X, Y, v * w)) g.pixel(X, Y, 1);
  }
}

// ------------------------------------------------------------ the script
// A thinner tube, one pixel of gas with a faint glow. Baseline at y = 11,
// x-height from y = 5, ascenders from 0. Capitals are their own tubes; the
// lower case is one tube, letter joined to letter along the baseline.

const CAPS = {
  M: { adv: 11, tubes: [[[[0, 11], [1.5, 5], [2.5, 0]], [[2.5, 0], [5, 8]], [[5, 8], [7.5, 0]], [[7.5, 0], [8.5, 8], [9.5, 11], [11, 11]]]] },
  T: { adv: 8, tubes: [[[[0, 2.5], [0.5, 0.5], [2, 0], [9, 0]]], [[[5, 0], [4.5, 8], [5, 11], [7, 11]]]] },
  W: { adv: 12, tubes: [[[[0, 0], [2.5, 11]], [[2.5, 11], [5.5, 3]], [[5.5, 3], [8, 11]], [[8, 11], [10, 2], [11.5, 0]]]] },
  F: { adv: 8, tubes: [[[[0, 2.5], [0.5, 0.5], [2, 0], [9, 0]]], [[[4.5, 0], [3.5, 11], [1, 11]]], [[[2.5, 5], [7, 5]]]] },
  S: { adv: 8, tubes: [[[[8, 1], [5, 0], [2, 0.5], [1.5, 3.5], [4.5, 5.5], [7, 8], [6, 10.5], [3, 11], [0, 9.5]]]] },
};
const LOWER = {
  o: { adv: 7, pts: [[[0, 11], [0.5, 8], [2, 5.5], [4, 5], [5.5, 6.5], [5, 9.5], [3, 11], [1.5, 9.5], [2.5, 6.5], [5, 5.5], [7, 6], [7.5, 9], [8, 11]]] },
  n: { adv: 7, pts: [[[0, 11], [1, 8], [1, 5]], [[1, 5], [1, 11]], [[1, 11], [1.5, 7], [3.5, 5], [5, 6], [5, 9.5], [6, 11], [7, 11]]] },
  d: { adv: 7, pts: [[[0, 11], [1.5, 9], [5, 6]], [[5, 6], [3, 5], [1, 6.5], [0.5, 9.5], [2, 11], [4, 10], [5, 7.5]], [[5, 7.5], [5.5, 0]], [[5.5, 0], [5, 9], [5.5, 11], [7, 11]]] },
  a: { adv: 7, pts: [[[0, 11], [1.5, 9], [5, 6]], [[5, 6], [3, 5], [1, 6.5], [0.5, 9.5], [2, 11], [4, 10], [5, 7.5]], [[5, 7.5], [5.2, 5]], [[5.2, 5], [5, 9], [5.5, 11], [7, 11]]] },
  y: { adv: 7, pts: [[[0, 11], [0.5, 8], [1, 5]], [[1, 5], [1, 9], [2.5, 11], [4.5, 10], [5.5, 5]], [[5.5, 5], [5, 13], [3.5, 15.5], [1.5, 15], [1.5, 13], [4, 11.5], [7, 10]]] },
  u: { adv: 7, pts: [[[0, 11], [0.5, 8], [1, 5]], [[1, 5], [1, 9], [2.5, 11], [4.5, 10], [5.5, 5]], [[5.5, 5], [5.2, 9], [5.7, 11], [7, 11]]] },
  e: { adv: 6, pts: [[[0, 11], [1, 9], [4.5, 7.5], [5, 5.5], [3, 5], [1, 6.5], [0.7, 9.5], [2.5, 11], [4.5, 11], [6, 10]]] },
  s: { adv: 6, pts: [[[0, 11], [1.5, 8], [3.5, 5]], [[3.5, 5], [4, 7], [5, 9], [4, 11], [2, 11], [1, 10]], [[1, 10], [3, 10.5], [6, 11]]] },
  h: { adv: 7, pts: [[[0, 11], [1.5, 5], [2.5, 1], [2, 0], [1, 1], [1, 5]], [[1, 5], [0.8, 11]], [[0.8, 11], [1.5, 7], [3.5, 5], [5, 6], [5, 9.5], [6, 11], [7, 11]]] },
  // r ends high on its shoulder; the join to the next letter is blocked out.
  r: { adv: 6, pts: [[[0, 11], [1, 8], [1.5, 5]], [[1.5, 5], [1.2, 11]], [[1.2, 11], [2, 7.5], [3.5, 5.3], [5.5, 5], [6, 6.5]]], breakAfter: true },
  i: { adv: 4, pts: [[[0, 11], [1, 8], [1.5, 5]], [[1.5, 5], [1.3, 9.5], [2, 11], [4, 11]]], dot: [1.8, 2.5] },
  t: { adv: 5, pts: [[[0, 11], [1, 7], [2, 1.5]], [[2, 1.5], [1.5, 9], [2.5, 11], [5, 11]]], bar: [[0, 4.5], [4.5, 4.5]] },
};
const DAY_NAMES = { SUN: 'Sunday', MON: 'Monday', TUE: 'Tuesday', WED: 'Wednesday', THU: 'Thursday', FRI: 'Friday', SAT: 'Saturday' };

/** A word as tubes: the capital's own, one joined tube for the rest, the dots and bars. */
function wordTubes(word) {
  const cap = CAPS[word[0]];
  const tubes = [];
  for (const t of cap.tubes) tubes.push(t);
  let x = cap.adv + 0.5;
  let run = [];
  const extras = [], runs = [run];
  let broken = false;
  // "day" is bent as its own section, with its own electrodes: it is the
  // one that buzzes.
  const tail = word.length - 3;
  [...word.slice(1)].forEach((ch, k) => {
    const L = LOWER[ch];
    const pieces = L.pts.map((pc) => pc.map(([px, py]) => [px + x, py]));
    if (k + 1 === tail && run.length) broken = true;
    if (broken) { run = []; runs.push(run); broken = false; }
    if (L.breakAfter) broken = true;
    if (run.length) {
      // Join to the last piece: the previous exit is this letter's entry.
      const prev = run.at(-1);
      prev.push(...pieces[0].slice(1).map((p) => p));
      run.push(...pieces.slice(1));
    } else run.push(...pieces);
    if (L.dot) extras.push([[[L.dot[0] + x, L.dot[1]], [L.dot[0] + x + 0.4, L.dot[1] - 0.6]]]);
    if (L.bar) extras.push([L.bar.map(([px, py]) => [px + x, py])]);
    x += L.adv;
  });
  tubes.push(...runs, ...extras);
  return { tubes, w: x, faulty: cap.tubes.length + runs.length - 1 };
}

const SCRIPT = { rc: 0.6, rh: 0.6, gap: 0, slant: 0.2, cross: false };
const SCRIPT_SCALE = 1.3;
const SCRIPT_LOOK = () => 1;
const wordCache = new Map();
function word(w) {
  if (!wordCache.has(w)) {
    const { tubes, faulty } = wordTubes(w);
    const G = rasterise(tubes.map((t) => scaleTube(t, SCRIPT_SCALE)), { ...SCRIPT, h: 11 * SCRIPT_SCALE });
    wordCache.set(w, { ...G, faulty });
  }
  return wordCache.get(w);
}

// ------------------------------------------------------------ colon and martini

// The colon: two glass beads, short hollow tubes, set on the digits' slant.
const COLON = rasterise([[[[1.9, 10], [1.9, 11.5]]], [[[0.4, 22], [0.4, 23.5]]]], STYLE);

// The martini, in the thin tube: the bowl (one tube round the triangle), the
// drink's surface, stem and foot. The olive on its pick and the bubbles are
// separate small tubes, lit in turn the way animated signs are wired.
const ICON = { rc: 0.6, rh: 0.6, gap: 0, slant: 0, cross: false };
// Coordinates sit on pixel centres (+0.5) so the one-pixel tube stays one pixel.
const GLASS = rasterise([
  [[[0.5, 4.5], [20.5, 4.5]], [[20.5, 4.5], [10.5, 13.5]], [[10.5, 13.5], [0.5, 4.5]]],
  [[[10.5, 13.5], [10.5, 20.5]]],
  [[[5.5, 20.5], [15.5, 20.5]]],
], ICON);
/** The olive on its pick, dunked `k` px into the drink (negative: lifted out). */
const OLIVE_K0 = -5;
const OLIVES = [-5, -4, -3, -2, -1, 0, 1, 2].map((k) => rasterise([
  [ell(9.5, 7.5 + k, 2, 2, 0, 360, 20)],
  [[[11, 6 + k], [16.5, 0.5 + k]]],
], ICON));
const BUBBLES = [[11.5, 11.5], [13.5, 10.5], [14.5, 8.5]].map(([x, y]) => rasterise([[[[x, y], [x, y]]]], ICON));

// ------------------------------------------------------------ layout and timing

const SLOT_X = [3, 28, 72, 97];
const TIME_Y = 27;
const COLON_X = 58;
const WORD_X = 3, WORD_Y = 2;
const ICON_X = 102, ICON_Y = 2;

const DIE_AT = 59.0;      // changing tubes start to sputter out
const SPUTTER = 0.45, RETREAT = 0.4;
const TRAVEL = 0.4, FLICKER = 0.35;
const DIM = 0.45;         // a tube running weak: every other wall pixel
// The hour: everything strikes in turn from 0.1 s to about 2.6 s, then the
// sign winks off twice and the olive leaps out of the glass.
const BLINKS = [[3.0, 3.2], [3.45, 3.65]];
const HOP_AT = 3.9, HOP = [-2, -4, -5, -5, -4, -2, 0, 2, 1, 0];

/**
 * A tube going out, `tau` s after it starts to: it sputters (on, off, weak,
 * by the 20th of a second), then the glow shrinks back into both electrodes.
 */
function dying(tau, s, L, seed) {
  if (tau < 0) return 1;
  if (tau < SPUTTER) {
    const r = noise(Math.floor(tau * 20) + 1, seed);
    return r < 0.3 ? 0 : r < 0.55 ? DIM : 1;
  }
  const u = (tau - SPUTTER) / RETREAT;
  if (u >= 1) return 0;
  return Math.min(s, L - s) < (1 - u) * L * 0.3 ? DIM : 0;
}

/**
 * A tube striking, `tau` s after power reaches it: the gas lights from the
 * first electrode to the second, weak behind a bright head, then it
 * flickers once or twice and holds.
 */
function striking(tau, s, L, seed, travel = TRAVEL, hold = travel) {
  if (tau < 0) return 0;
  if (tau < travel) {
    const front = L * (0.15 + 0.85 * (tau / travel));
    return s > front ? 0 : front - s < 5 ? 1 : DIM;
  }
  if (tau < hold) return 1;
  if (tau < hold + FLICKER) {
    const k = Math.floor((tau - hold) * 20);
    const pat = noise(seed, 3) < 0.5 ? [0, 1, 1, 0, DIM, 1, 1] : [1, 0, DIM, 1, 1, 0, 1];
    return pat[k % pat.length];
  }
  return 1;
}

/** The faulty "day": now and then a burst of buzzing, sometimes a weak spell. */
function faulty(t) {
  const k = Math.floor(t / 1.3);
  if (noise(k, 41) < 0.16) {
    const r = noise(Math.floor(t * 20), 42);
    return r < 0.45 ? 0 : r < 0.6 ? DIM : 1;
  }
  if (noise(Math.floor(t / 9), 43) < 0.12) return noise(Math.floor(t * 6), 44) < 0.2 ? 0 : DIM;
  return 1;
}

const digitsOf = (f) => [...`${f.hh}${f.mm}`].map(Number);

/**
 * How a sign element should be lit now. `out` and `in` say whether it goes
 * out at the end of this minute and strikes at the start of it; `at` is its
 * strike time in seconds after :00, `seed` varies its sputter and flicker.
 * `hold` (seconds after `at`) delays the flicker: digits that change
 * together flicker together, once the last has lit, so a flicker never
 * blanks one digit while its neighbours show (10:59 must not read 1 :59).
 */
function element({ sec, out, inn, at, seed, travel, hold = travel }) {
  return (ti, s, L) => {
    let v = 1;
    if (inn && sec < at + hold + FLICKER + 0.01) v = striking(sec - at, s, L, seed, travel, hold);
    if (out && sec >= DIE_AT) v = Math.min(v, dying(sec - DIE_AT, s, L, seed));
    return v;
  };
}

function drawEl(g, G, x, y, fn, look) {
  drawGlyph(g, G, x, y, (ti, s) => fn(ti, s, G.len[ti]), look);
}

export default {
  name: 'Neon',
  blurb: 'A bar-window neon sign: bent-glass digits that sputter out and strike on the minute.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,

  frame(g, { fields: f, date, oled, night }) {
    const sec = f.sec, t = date.getTime() / 1000;
    const prev = previousMinute(date), next = clockFields(new Date(date.getTime() + 60000));
    const now = digitsOf(f), was = digitsOf(prev), will = digitsOf(next);
    const hourOut = next.m === 0, hourIn = f.m === 0;
    const key = f.minuteKey % 9973;
    const [ox, oy] = orbit(date, 2, 3);

    // Brightness: a dim sign through the night; now and then a brownout
    // dips the whole sign for a frame or two (global contrast, two bytes).
    const base = 0xcf + (0x30 - 0xcf) * night;  // night dimming, 23:00-07:00 (ctx.night)
    let c = base;
    if (!hourIn && noise(key, 51) < 0.25) {
      const t0 = 12 + 36 * noise(key, 52);
      if (sec >= t0 && sec < t0 + 0.1) c = base * 0.35;
      else if (sec >= t0 + 0.2 && sec < t0 + 0.25) c = base * 0.6;
    }
    oled.contrast(c);
    // On the hour, relit, the whole sign winks twice: "we're open".
    if (hourIn && BLINKS.some(([a, b]) => sec >= a && sec < b)) return;

    // When each element strikes after :00. A minute turn lights only the
    // changed digits, left to right, so what shows is always a prefix of
    // the new time; on the hour the whole sign is switched off at :59 and
    // back on in order.
    const changed = [0, 1, 2, 3].filter((i) => hourIn || now[i] !== was[i]);
    const at = (i) => (hourIn ? 0.9 : 0.05) + 0.3 * changed.indexOf(i);
    const lastAt = at(changed.at(-1) ?? 0);
    const plain = { sec, travel: TRAVEL };

    // The day, in script; its "day" is the faulty section.
    const W = word(DAY_NAMES[f.dow]);
    const wordFn = element({ ...plain, out: hourOut, inn: hourIn, at: 0.1, seed: 11, travel: 0.6 });
    drawEl(g, W, WORD_X + ox, WORD_Y + oy, (ti, s, L) => wordFn(ti, s, L) * (ti === W.faulty ? faulty(t) : 1), SCRIPT_LOOK);

    // The martini: olive dunks now and then, bubbles rise in turn.
    // The glass walks its own, wider orbit, out of step with the time.
    const [qx, qy] = orbit(new Date(date.getTime() + 11 * 60000), 3, 4);
    const mx = qx - 1, my = Math.max(-2, Math.min(2, qy));
    const iconFn = element({ ...plain, out: hourOut, inn: hourIn, at: 0.45, seed: 23 });
    drawEl(g, GLASS, ICON_X + mx, ICON_Y + my, iconFn, SCRIPT_LOOK);
    // Three wired positions, stepped like an animated sign: up, half, dunked.
    const dunkT = t % 7.3;
    let dunk = dunkT < 0.3 ? 1 : dunkT < 0.6 ? 2 : dunkT < 0.9 ? 1 : 0;
    // On the hour, once the sign is back on, the olive leaps out and plops back.
    if (hourIn && sec >= HOP_AT && sec < HOP_AT + HOP.length * 0.1) dunk = HOP[Math.floor((sec - HOP_AT) * 10)];
    drawEl(g, OLIVES[dunk - OLIVE_K0], ICON_X + mx, ICON_Y + my, iconFn, SCRIPT_LOOK);
    const b = Math.floor(t * 2.5) % 4;
    if (b < 3) drawEl(g, BUBBLES[b], ICON_X + mx, ICON_Y + my, iconFn, SCRIPT_LOOK);

    // The time.
    const colonFn = element({ ...plain, out: hourOut, inn: hourIn, at: 0.7, seed: 31, travel: 0.15 });
    drawEl(g, COLON, COLON_X + ox, TIME_Y + oy, colonFn);
    for (let i = 0; i < 4; i++) {
      const fn = element({
        ...plain, seed: key,
        out: hourOut || now[i] !== will[i],
        inn: changed.includes(i), at: at(i), hold: lastAt - at(i) + TRAVEL,
      });
      drawEl(g, glyph(now[i]), SLOT_X[i] + ox, TIME_Y + oy, fn);
    }
  },
};
