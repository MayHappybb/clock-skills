// Harmonograph — the time plotted by a pendulum.
//
// A harmonograph draws with pendulums: two bobs, swinging at rates that do not
// divide into one another, drag a pen over the paper, and every line such a
// pen leaves rings. This face is that machine at work. Two bobs hang out of
// the top of the frame, one over the hours and one over the minutes; their
// swing is what troubles the ink below — the whole drawing sways with them —
// and the pen carries so much momentum that it cannot turn a corner without
// swinging past it and coming back, so every corner of every numeral carries
// the little loop of a pen that overshot.
//
// Each pen travels its own two numerals, forward over the pair and then back,
// once a minute, so the ink is always being re-wet somewhere and the light
// never sits still. The colon is a pair of plumb bobs ticking out the seconds.
//
// On the minute the changed numeral is re-tuned: its ink is reeled back up
// into the pen, swinging wider as it goes; the new numeral condenses as a pale
// guide; and the pen inks it in from its first stroke, arriving loose and
// settling. On the hour both pens work at once and the whole sheet lurches.
//
// Everything is a pure function of the clock. The rig, the drawing and the
// pens walk a 2 px orbit; 23:00-07:00 the panel dims.

import { orbit, clamp, ease, noise, previousMinute, dither } from '../js/kit.js';

const TAU = Math.PI * 2;

// ------------------------------------------------------------ geometry

const DW = 20, DH = 34;              // a numeral's box
const SLOTS = [14, 36, 72, 94];      // x of the four boxes, left to right
const DY = 23;                       // top of the boxes
const COLON_X = 64;                  // the colon ticks between the pairs

/** Points along an elliptical arc; angles in degrees, 0 = up, clockwise. */
function arcDeg(cx, cy, rx, ry, a0, a1, n = 30) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    out.push([cx + rx * Math.sin(a), cy - ry * Math.cos(a)]);
  }
  return out;
}

/** A superellipse: a squarish oval, the plotted zero. */
function oval(cx, cy, rx, ry, p, n = 52) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU, s = Math.sin(a), c = Math.cos(a);
    out.push([cx + rx * Math.sign(s) * Math.abs(s) ** (2 / p), cy - ry * Math.sign(c) * Math.abs(c) ** (2 / p)]);
  }
  return out;
}

// The ten numerals, each a list of strokes (pen-down runs), centre-lines in a
// DW x DH box. 9 is 6 turned round.
const SIX = [
  [16.6, 3.2], [11.4, 5.6], [7.0, 9.8], [3.8, 15.4], [2.6, 21.4],
  ...arcDeg(10.4, 23.4, 7.9, 8.8, 282, 642, 40),
];
const mirror = (st) => st.map(([x, y]) => [DW - x, DH - y]);

const NUMERALS = {
  0: [oval(10, 17, 7.7, 15.2, 2.5)],
  1: [[[6.2, 8.2], [10, 3.0], [10, 31.4]]],
  2: [[...arcDeg(10, 11.2, 7.5, 8.8, 248, 452, 30), [17.5, 15.5], [2.6, 31.6], [18, 31.6]]],
  3: [[...arcDeg(10, 10.6, 7.5, 8.4, 245, 460, 26),
    [17.2, 15.2], [15.4, 16.6], [11.4, 17.4],
    [15.4, 18.2], [17.5, 19.8], [18.0, 22.4],
    ...arcDeg(10, 24.4, 8.0, 9.2, 88, 248, 26)]],
  4: [
    [[14.6, 2.8], [2.4, 22.6], [17.8, 22.6]],
    [[14.6, 2.8], [14.6, 31.8]],
  ],
  5: [
    [[16.8, 2.8], [4.2, 2.8], [4.2, 14.2]],
    [[4.2, 14.2], [12.6, 14.9], [16.6, 17.0], [18.0, 20.6], [16.9, 25.0], [13.0, 28.8], [7.6, 30.4], [3.4, 29.0], [2.4, 26.0]],
  ],
  6: [SIX],
  7: [[[2.6, 2.8], [17.6, 2.8], [7.0, 31.8]]],
  8: [[...arcDeg(10, 9.6, 6.7, 6.8, 180, 540, 36), ...arcDeg(10, 24.8, 8.2, 8.4, 0, 360, 40)]],
  9: [mirror(SIX)],
};

/** Resample a polyline every `step` px, carrying the arclength at each point. */
function densePath(skel, step = 0.5) {
  const out = [{ x: skel[0][0], y: skel[0][1], s: 0 }];
  let s = 0;
  for (let i = 1; i < skel.length; i++) {
    const ax = skel[i - 1][0], ay = skel[i - 1][1], bx = skel[i][0], by = skel[i][1];
    const len = Math.hypot(bx - ax, by - ay);
    if (len < 1e-6) continue;
    const n = Math.max(1, Math.ceil(len / step));
    for (let k = 1; k <= n; k++) {
      const f = k / n;
      out.push({ x: ax + (bx - ax) * f, y: ay + (by - ay) * f, s: s + len * f });
    }
    s += len;
  }
  return out;
}

/** Point and unit tangent at arclength S along a dense path. */
function atS(P, S) {
  S = clamp(S, 0, P[P.length - 1].s);
  let lo = 0, hi = P.length - 1;
  while (lo < hi - 1) { const mid = (lo + hi) >> 1; if (P[mid].s <= S) lo = mid; else hi = mid; }
  const a = P[lo], b = P[hi];
  const f = b.s > a.s ? (S - a.s) / (b.s - a.s) : 0;
  const dx = b.x - a.x, dy = b.y - a.y, m = Math.hypot(dx, dy) || 1;
  return [a.x + dx * f, a.y + dy * f, dx / m, dy / m];
}

// Per-numeral tables: each stroke's length, its share of the numeral and where
// it starts in the numeral's drawing order (so a numeral can be inked in
// progress); its dense path and the arclength fractions of its corners, where
// the pen's momentum carries it past the turn; and a fixed phase and cycle
// count, so a settled numeral rings the same way every minute.
const LEN = {}, FRAC = {}, START = {}, DENSE = {}, CORNER = {}, PHASE = {}, CYC = {};
for (let d = 0; d < 10; d++) {
  LEN[d] = NUMERALS[d].map((st) => {
    let L = 0;
    for (let i = 1; i < st.length; i++) L += Math.hypot(st[i][0] - st[i - 1][0], st[i][1] - st[i - 1][1]);
    return L;
  });
  const tot = LEN[d].reduce((a, b) => a + b, 0) || 1;
  let acc = 0;
  FRAC[d] = LEN[d].map((L) => L / tot);
  START[d] = LEN[d].map((L) => { const s = acc / tot; acc += L; return s; });
  DENSE[d] = NUMERALS[d].map((st) => densePath(st));
  CORNER[d] = NUMERALS[d].map((st, si) => {
    const P = DENSE[d][si];
    // a stroke's ends get a lighter kick than its interior turns
    const us = [{ u: 0, k: 0.55 }, { u: 1, k: 0.55 }];
    let s = 0;
    for (let i = 1; i < st.length - 1; i++) {
      s += Math.hypot(st[i][0] - st[i - 1][0], st[i][1] - st[i - 1][1]);
      us.push({ u: s / (P[P.length - 1].s || 1), k: 1 });
    }
    return us;
  });
  PHASE[d] = NUMERALS[d].map((_, i) => noise(d * 3.7 + i * 5.1, 11) * TAU);
  CYC[d] = NUMERALS[d].map((_, i) => 1 + noise(d * 1.9 + i * 7.3, 5) * 1.6);
}

// ------------------------------------------------------------ ink

const KICK_PX = 4.4;      // how far along the path a corner's kick reaches

// The whole face is laid down a disc at a time along the pen's path, so the
// plotter writes the buffer directly: a general shape test per pixel costs
// more than the frame has.
function disc(g, cx, cy, r) {
  const W = g.width, buf = g.buf, [qx, qy, qw, qh] = g.clipRect;
  const x1 = Math.max(qx, Math.floor(cx - r)), x2 = Math.min(qx + qw - 1, Math.ceil(cx + r));
  const y1 = Math.max(qy, Math.floor(cy - r)), y2 = Math.min(qy + qh - 1, Math.ceil(cy + r));
  const r2 = r * r;
  for (let y = y1; y <= y2; y++) {
    const dy = y + 0.5 - cy, row = y * W;
    for (let x = x1; x <= x2; x++) {
      const dx = x + 0.5 - cx;
      if (dx * dx + dy * dy <= r2) buf[row + x] = 1;
    }
  }
}

/** The same, thinned to an ordered dither of `level`: pale ink. */
function ditherDisc(g, cx, cy, r, level) {
  const W = g.width, buf = g.buf, [qx, qy, qw, qh] = g.clipRect;
  const x1 = Math.max(qx, Math.floor(cx - r)), x2 = Math.min(qx + qw - 1, Math.ceil(cx + r));
  const y1 = Math.max(qy, Math.floor(cy - r)), y2 = Math.min(qy + qh - 1, Math.ceil(cy + r));
  const r2 = r * r;
  for (let y = y1; y <= y2; y++) {
    const dy = y + 0.5 - cy, row = y * W;
    for (let x = x1; x <= x2; x++) {
      const dx = x + 0.5 - cx;
      if (dx * dx + dy * dy <= r2 && dither(x, y, level)) buf[row + x] = 1;
    }
  }
}

// One scratch buffer for the pen's path, refilled per stroke: a frame lays down
// thousands of points and allocating them all would leave the collector to
// stutter the animation. Points are (x, y, u) triples.
let SCRATCH = new Float64Array(3 * 4096);

/**
 * The pen's path over one stroke of numeral `d`: the centre-line, with the pen
 * swinging past every corner along its own direction (`swing`) and a little
 * across it (`loop`), the two together opening a small loop at each turn, and
 * a live tremor on top. Writes (x, y, u) triples into SCRATCH; returns how
 * many, so the caller can read them out.
 */
function inkPoints(d, si, ox, oy, o) {
  const P = DENSE[d][si];
  const L = P[P.length - 1].s;
  if (!L) return 0;
  const cover = o.cover ?? 1;
  const swing = o.swing ?? 3.2, loop = o.loop ?? 1.7;
  const live = o.live ?? 0, t = o.t ?? 0, seed = o.seed ?? 0;
  const phase = o.phase ?? 0, cyc = o.cyc ?? 1.4;
  const corners = CORNER[d][si];
  const n = Math.max(2, Math.ceil((L * cover) / 0.9));
  if (3 * (n + 1) > SCRATCH.length) SCRATCH = new Float64Array(3 * (n + 1));
  let m = 0;
  for (let k = 0; k <= n; k++) {
    const u = (k / n) * cover;
    let e = 0;
    for (const c of corners) {
      const g = c.k * Math.exp(-((((u - c.u) * L) / KICK_PX) ** 2));
      if (g > e) e = g;
    }
    const ph = TAU * cyc * u + phase;
    const dl = swing * e * Math.sin(ph);
    const dp = loop * e * Math.sin(ph + 1.3)
      + live * Math.sin(TAU * 0.13 * t + u * 4.4 + seed);
    const [x, y, tx, ty] = atS(P, clamp(u * L + dl, 0, L));
    SCRATCH[m++] = ox + x - ty * dp;
    SCRATCH[m++] = oy + y + tx * dp;
    SCRATCH[m++] = u;
  }
  return (m / 3) | 0;
}

/**
 * The same path, laid down as ink. `fresh(u)` fattens its still-wet part;
 * `alpha` under 1 thins the whole line to a dither, so ink can dissolve.
 */
function plotInk(g, d, si, ox, oy, o) {
  const n = inkPoints(d, si, ox, oy, o);
  const w = o.w ?? 2.2, fresh = o.fresh ?? null, alpha = o.alpha ?? 1;
  for (let i = 0; i < n; i++) {
    const r = (w + (fresh ? fresh(SCRATCH[i * 3 + 2]) * 0.9 : 0)) / 2;
    if (alpha >= 1) disc(g, SCRATCH[i * 3], SCRATCH[i * 3 + 1], r);
    else ditherDisc(g, SCRATCH[i * 3], SCRATCH[i * 3 + 1], r, alpha);
  }
}

/** The same path, as a pale dithered hairline: ink the pen has not laid yet. */
function plotGuide(g, d, si, ox, oy, o, level, from) {
  if (level <= 0.02) return;
  const n = inkPoints(d, si, ox, oy, o);
  for (let i = 0; i < n; i++)
    if (SCRATCH[i * 3 + 2] >= from) ditherDisc(g, SCRATCH[i * 3], SCRATCH[i * 3 + 1], 1.15, level);
}

/**
 * A numeral as the pen leaves it: the line it settled on, laid over the two
 * fainter, wilder lines of the passes before it. `cover` inks it in progress;
 * `wild` scales how far from settled those earlier passes still are.
 */
function plotNumeral(g, d, X, Y, o) {
  const cover = o.cover ?? 1, k = o.wild ?? 1;
  const n = NUMERALS[d].length;
  for (let si = 0; si < n; si++) {
    const c = clamp((cover - START[d][si]) / FRAC[d][si], 0, 1);
    if (c <= 0) continue;
    plotInk(g, d, si, X, Y, {
      phase: PHASE[d][si], cyc: CYC[d][si], w: o.w, cover: c,
      swing: 3.2 * k, loop: 1.7 * k, live: o.live, t: o.t, seed: (o.seed ?? 0) + si,
      fresh: o.fresh ? o.fresh(si) : null,
    });
  }
}

// ------------------------------------------------------------ the pens' tours

/**
 * The visits a pen makes over its pair each minute: forward over both
 * numerals' strokes, then back, so the tour closes on itself in space and the
 * pen picks up where it left off. The unit digit comes first.
 */
function tourOf(now, slots) {
  const order = [slots[1], slots[0]];
  const visits = [];
  let s = 0;
  const add = (slot, si, rev) => {
    const len = LEN[now[slot]][si];
    visits.push({ slot, si, rev, s0: s, len, x: SLOTS[slot] });
    s += len;
  };
  for (const slot of order) for (let si = 0; si < NUMERALS[now[slot]].length; si++) add(slot, si, false);
  for (let k = order.length - 1; k >= 0; k--) {
    const slot = order[k];
    for (let si = NUMERALS[now[slot]].length - 1; si >= 0; si--) add(slot, si, true);
  }
  return { visits, total: s };
}

/** A point at fraction u of a stroke's arclength. */
function strokePoint(st, u) {
  let L = 0;
  for (let i = 1; i < st.length; i++) L += Math.hypot(st[i][0] - st[i - 1][0], st[i][1] - st[i - 1][1]);
  const target = u * L;
  let acc = 0;
  for (let i = 1; i < st.length; i++) {
    const len = Math.hypot(st[i][0] - st[i - 1][0], st[i][1] - st[i - 1][1]);
    if (acc + len >= target || i === st.length - 1) {
      const f = len ? (target - acc) / len : 0;
      return [st[i - 1][0] + (st[i][0] - st[i - 1][0]) * f, st[i - 1][1] + (st[i][1] - st[i - 1][1]) * f];
    }
    acc += len;
  }
  return st[st.length - 1];
}

/** The pen's position at tour distance s, in canvas coordinates. */
function penAt(now, tour, s, dx, dy) {
  s = clamp(s, 0, tour.total);
  for (let i = 0; i < tour.visits.length; i++) {
    const v = tour.visits[i];
    if (s <= v.s0 + v.len || i === tour.visits.length - 1) {
      const u = clamp((s - v.s0) / v.len, 0, 1);
      const p = strokePoint(NUMERALS[now[v.slot]][v.si], v.rev ? 1 - u : u);
      return [v.x + dx + p[0], DY + dy + p[1]];
    }
  }
  return [0, 0];
}

// ------------------------------------------------------------ the rig

// The rig: two rods out of the top of the frame, one hanging over the hours
// and one over the minutes, each with a bob on the end. Their rates do not
// divide into one another — that is the whole trick of a harmonograph — and
// the angle of each rod is what sways the numerals beneath it.
const RIG = [
  { px: 35, py: 2, rod: 14 },           // over the hours
  { px: 93, py: 2, rod: 14 },           // over the minutes
];

/** The two rod angles; re-excited at the hour, then running down. */
function swing(t, hourFrac) {
  const kick = 1 + 0.6 * Math.exp(-hourFrac * 7);
  const a = 0.34 * kick * (0.78 + 0.22 * Math.sin(TAU * t / 97));
  const b = 0.30 * kick * (0.78 + 0.22 * Math.sin(TAU * t / 131 + 1.7));
  return [a * Math.sin(TAU * t / 5.3 + 0.4), b * Math.sin(TAU * t / 3.9 + 2.1)];
}

/** Where a rod's bob is. */
function bobAt(i, th) {
  const { px, py, rod } = RIG[i];
  return [px + rod * Math.sin(th[i]), py + rod * Math.cos(th[i])];
}

function drawRig(g, ox, oy, th) {
  const X = (v) => Math.round(v + ox), Y = (v) => Math.round(v + oy);
  for (let i = 0; i < 2; i++) {
    const { px, py } = RIG[i];
    const [bx, by] = bobAt(i, th);
    g.hline(X(px - 3), Y(1), 7, 1);           // the mount, at the frame's edge
    g.pixel(X(px - 3), Y(2), 1); g.pixel(X(px + 3), Y(2), 1);
    g.pixel(X(px), Y(py), 1);
    const n = Math.ceil(Math.hypot(bx - px, by - py));
    for (let k = 1; k <= n; k++) {
      const f = k / n;
      g.pixel(X(px + (bx - px) * f), Y(py + (by - py) * f), 1);
    }
    if (i === 0) {                            // the hours bob is solid brass
      g.fillCircle(bx + ox, by + oy, 3.2, 1);
      g.pixel(X(bx - 1), Y(by - 1), 0);       // with a glint
    } else {                                  // the minutes one is a ring
      g.fillWhere((qx, qy) => {
        const d = Math.hypot(qx - (bx + ox), qy - (by + oy));
        return d >= 2.0 && d <= 3.7;
      }, 1, [bx + ox - 5, by + oy - 5, 10, 10]);
    }
  }
}

// ------------------------------------------------------------ timing

const REW = 0.32;      // how long the old ink takes to reel back and thin out
const DRAW = 0.92;     // how long the pen takes over one numeral
const INK_W = [3.0, 2.6];   // the hours stroke a shade heavier than the minutes

export default {
  name: 'Harmonograph',
  blurb: 'A pendulum plotter: two bobs drag their pens over the page and the time is what they leave, ringing; each minute the changed numeral is reeled back into the pen and inked anew.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  driver: 'full',

  frame(g, ctx) {
    const { fields: f, date, oled, night } = ctx;
    const t = date.getTime() / 1000;
    const [ox, oy] = orbit(date, 2, 3);
    const was = previousMinute(date);
    const now = [...`${f.hh}${f.mm}`].map(Number);
    const prev = [...`${was.hh}${was.mm}`].map(Number);
    const th = swing(t, (f.m * 60 + f.sec) / 3600);

    for (let p = 0; p < 2; p++) {
      const slots = [p * 2, p * 2 + 1];
      const vals = [now[slots[0]], now[slots[1]]];
      const oldVals = [prev[slots[0]], prev[slots[1]]];
      const changed = [0, 1].filter((k) => vals[k] !== oldVals[k]);
      const w = INK_W[p];

      // this pair's ink sways with its own bob; the page breathes with both,
      // and the whole sheet lurches when the hour sets both pens going at once
      const surge = f.m === 0 ? 1 + 2.4 * Math.exp(-f.sec * 1.4) : 1;
      const dx = surge * ((p === 0 ? 3.0 * th[0] : 3.0 * th[1]) + 0.5 * (th[0] + th[1])) + ox;
      const dy = surge * 0.6 * (p === 0 ? th[1] : th[0]) + oy;
      const guideLevel = 0.55 * clamp((f.sec - 0.02) / 0.2, 0, 1);

      // where this pen is on its tour, and so how wet the ink is: the ink the
      // pen has just been over catches the light for a moment
      const tour = tourOf(now, slots);
      const tourS = (f.sec / 60) * tour.total;
      // the pen's own stroke appears once going out and once coming back: the
      // two places on it that are wet right now, as fractions of its length
      const freshOf = (si) => {
        let m0 = 0, k0 = 0, m1 = 0, k1 = 0, n = 0;
        for (const v of tour.visits) {
          if (v.si !== si) continue;
          const f = (tourS - v.s0) / v.len;
          const m = v.rev ? 1 - f : f, k = v.len / 15;
          if (n === 0) { m0 = m; k0 = k; } else { m1 = m; k1 = k; }
          n++;
        }
        if (!n) return null;
        if (n === 1) return (u) => Math.exp(-Math.abs(u - m0) * k0);
        return (u) => Math.max(Math.exp(-Math.abs(u - m0) * k0), Math.exp(-Math.abs(u - m1) * k1));
      };

      for (let k = 0; k < 2; k++) {
        const slot = slots[k], v = vals[k], X = SLOTS[slot] + dx, Y = DY + dy;
        const st = NUMERALS[v];

        if (changed.includes(k) && f.sec < REW) {
          // the old numeral reels back into the pen, swinging wider as it goes
          // and thinning out as it comes: it is gone well before the new one lands
          const q = ease.outCubic(f.sec / REW);
          const ov = oldVals[k];
          for (let si = 0; si < NUMERALS[ov].length; si++)
            plotInk(g, ov, si, X, Y, {
              swing: 3.0 + 8 * q, loop: 1.5 + 2.5 * q, cover: 1 - 0.4 * q, alpha: 1 - q,
              phase: PHASE[ov][si], cyc: CYC[ov][si], w,
            });
        }

        if (changed.includes(k)) {
          // the unit digit is written first, the tens after it
          const done = changed.length - 1 - changed.indexOf(k);
          const cover = f.sec < REW + DRAW * done ? 0
            : clamp((f.sec - REW - DRAW * done) / DRAW, 0, 1);
          if (guideLevel > 0.02)
            for (let si = 0; si < st.length; si++)
              plotGuide(g, v, si, X, Y,
                { swing: 3.0, loop: 1.5, phase: PHASE[v][si], cyc: CYC[v][si] },
                guideLevel, clamp((cover - START[v][si]) / FRAC[v][si], 0, 1));
          if (cover > 0) {
            const q = ease.outCubic(cover);
            plotNumeral(g, v, X, Y, { w, cover, wild: 1 + 2.6 * (1 - q), live: 0.6, t, seed: slot });
          }
        } else {
          // settled: the ink stands, with a faint live tremor
          plotNumeral(g, v, X, Y, { w, live: 0.45, t, seed: slot * 3.1, fresh: freshOf });
        }
      }

      // the pen: on the numeral it is writing, else riding its tour
      let pt = penAt(now, tour, tourS, dx, dy);
      if (changed.length && f.sec >= REW && f.sec < REW + DRAW * changed.length) {
        const k = changed[0];
        const q = clamp((f.sec - REW - DRAW * (changed.length - 1)) / DRAW, 0, 1);
        const st = NUMERALS[vals[k]];
        const si = Math.min(st.length - 1, Math.floor(q * st.length));
        const local = clamp((q - START[vals[k]][si]) / FRAC[vals[k]][si], 0, 1);
        const p2 = strokePoint(st[si], local);
        pt = [SLOTS[slots[k]] + dx + p2[0], DY + dy + p2[1]];
      }
      g.fillCircle(pt[0], pt[1], 1.4, 1);
      g.fillWhere((qx, qy) => {
        const dd = Math.hypot(qx - pt[0], qy - pt[1]);
        return dd > 1.4 && dd <= 3.2 ? clamp(0.85 - dd / 4.4, 0, 0.6) : false;
      }, 1, [pt[0] - 4, pt[1] - 4, 8, 8]);
    }

    // the colon: a pair of plumb bobs ticking out the seconds between the pairs
    for (let i = 0; i < 2; i++) {
      const cx = COLON_X + ox, cy = (i ? 45 : 31) + oy;
      const a = 0.42 * Math.sin(TAU * t / 1.1 + i * 2.4);
      const bx = cx + 6 * Math.sin(a), by = cy - 4 + 6 * Math.cos(a);
      g.pixel(cx, cy - 4, 1);
      for (let k = 1; k <= 6; k++) {
        const f = k / 6;
        g.pixel(cx + (bx - cx) * f, cy - 4 + (by - (cy - 4)) * f, 1);
      }
      g.fillCircle(bx, by, 1.7, 1);
    }

    drawRig(g, ox, oy, th);
    oled.contrast(0xcf + (0x20 - 0xcf) * night);
  },
};

