// String Art — digits of taut thread on nails, strung while you watch.
//
// Every numeral is built the way a string-art board is: nails hammered along
// its outline, thread pulled straight between them. Nothing on the face is a
// curve. A bowl is curve stitching along a rail of nails: a thread from each
// nail to the one K further on, so the chords' envelope draws the bowl's inner
// edge and the rail its outer one, and where the chords cross they leave a
// diamond lattice in the stroke. On an open rail the nails close up towards
// each end, the chords shorten, and the stroke tapers to a point like a pen
// lifting. Straight strokes are three parallel threads between rows of nails
// at their ends; the corners of 1, 2, 4 and 7 carry a small parabolic gusset
// (two arms, thread i joining point i/n of each). The nail heads stand 1.6 px
// outside the threads, a dotted contour round every digit. The colon is two
// knots whose turn of thread ticks between X and + with the second; along the
// bottom a zigzag hem is stitched one nail a second.
//
// The minute turn: from :59.0 the old threads of every digit about to change
// snap, last-laid first, each half whipping back to its nail and curling; then
// the nails come out. From :00 the new digits are strung one at a time, left
// to right, with the slots still to come left blank, so no mix of old and new
// digits can be read as a wrong time: a digit's nails go in (0.3 s), then the
// shuttle, a bright bead with a dark keyline, lays the thread in the order a
// stringer would (across, round the next nail, back), 1.1-1.6 s a digit, and
// the finished digit rings as it is tied off. Between turns the shuttle sews
// the hem. Twice a minute a random stroke is plucked and rings; on the hour,
// once the new time is strung, a glissando sweeps every string left to right.
//
// Every frame is computed from fields.sec and the digits of this minute, the
// last and the next: the stringing plan, each snap's time, break point and
// curl, each pluck, from noise(minuteKey). Thread geometry is built once at
// load. Nothing is remembered between frames.
//
// Burn-in: the board walks a 2-pixel orbit every 3 minutes (only 1 up, to keep
// the top nails on the glass), the colon alternates its pixels every second,
// the hem is never the same two seconds running, and from 23:00 to 07:00 the
// panel runs at low contrast.

import { orbit, noise, clamp, ease, previousMinute, clockFields } from '../js/kit.js';

// ------------------------------------------------------------ geometry

const CW = 24, CH = 52;              // a digit's thread geometry, pixels
const SLOT_X = [3, 31, 74, 102];
const TOP = 3;
const HEM_X = 4, HEM_Y = 59;          // the seconds stitch, 60 steps of 2 px
const NAIL_SP = 5.5;                // nail spacing along a curved rail
const NAIL_OUT = 1.6;                // nail heads sit this far outside the threads
const R = 11.5;                      // the round of a full-width bowl
const END_TIGHT = 0.4, END_RUN = 16; // open rails: nails close up over the last END_RUN px

/** A rail of nails: arcs (clock degrees, clockwise) and straight runs. */
function rail() {
  const pts = [];
  const api = {
    arc(cx, cy, rx, ry, a0, a1) {
      const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / 2));
      for (let i = 0; i <= n; i++) {
        const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
        pts.push([cx + rx * Math.sin(a), cy - ry * Math.cos(a)]);
      }
      return api;
    },
    to(x, y) { pts.push([x, y]); return api; },
    pts,
  };
  return api;
}

/**
 * Nails along a polyline, by arc length. On an open rail they close up
 * towards the ends (to END_TIGHT of the spacing), so the chords shorten and
 * the stroke tapers to a clean point instead of a sparse fan.
 */
function resample(pts, sp, closed) {
  const P = closed ? [...pts, pts[0]] : pts;
  const cum = [0];
  for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const L = cum[cum.length - 1];
  let ss = [];
  if (closed) {
    const n = Math.max(3, Math.round(L / sp));
    for (let i = 0; i < n; i++) ss.push((i * L) / n);
  } else {
    const f = (s) => { const e = clamp(Math.min(s, L - s) / END_RUN, 0, 1); return END_TIGHT + (1 - END_TIGHT) * e * e * (3 - 2 * e); };
    for (let s = 0; s < L; s += sp * f(s)) ss.push(s);
    const last = ss[ss.length - 1];
    if (L - last < 0.5 * sp * END_TIGHT) ss.pop();
    ss.push(L);
  }
  const out = [];
  let j = 1;
  for (const s of ss) {
    while (j < P.length - 1 && cum[j] < s) j++;
    const u = (s - cum[j - 1]) / (cum[j] - cum[j - 1] || 1);
    out.push([P[j - 1][0] + (P[j][0] - P[j - 1][0]) * u, P[j - 1][1] + (P[j][1] - P[j - 1][1]) * u]);
  }
  return out;
}

/**
 * Curve stitching along a rail: thread from nail i to nail i+k, for every i.
 * The chords' envelope is the stroke's inner edge; the rail is its outer edge.
 * The shuttle goes as a stringer's hand does: across, round the next nail,
 * back, round the next one: 0, k, k+1, 1, 2, k+2, ...
 */
function stitch(r, k, { closed = false, sp = NAIL_SP } = {}) {
  const N = resample(r.pts, sp, closed), n = N.length;
  const at = (i) => N[closed ? ((i % n) + n) % n : i];
  const last = closed ? n - 1 : n - 1 - k;
  const run = [at(0)];
  for (let i = 0; i <= last; i += 2) {
    run.push(at(i + k));
    if (i + 1 > last) break;
    run.push(at(i + k + 1), at(i + 1));
    if (i + 2 > last) break;
    run.push(at(i + 2));
  }
  // Nail heads: outward (left of travel, since every rail runs clockwise).
  const heads = N.map((p, i) => {
    const a = N[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], b = N[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    const tx = b[0] - a[0], ty = b[1] - a[1], l = Math.hypot(tx, ty) || 1;
    return [p[0] + (NAIL_OUT * ty) / l, p[1] - (NAIL_OUT * tx) / l];
  });
  return { run, heads };
}

/**
 * Parallel threads: `m` threads from rail a0-a1 to rail b0-b1, strung in a
 * zigzag. Heads stand off the ends unless `caps` is false.
 */
function band(a0, a1, b0, b1, m, { caps = true } = {}) {
  const L = (p, q, u) => [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u];
  const A = [], B = [];
  for (let j = 0; j < m; j++) { A.push(L(a0, a1, j / (m - 1))); B.push(L(b0, b1, j / (m - 1))); }
  const run = [];
  A.forEach((_, j) => (j % 2 ? run.push(B[j], A[j]) : run.push(A[j], B[j])));
  const heads = [];
  if (caps) {
    for (let j = 0; j < m; j++) {
      const dx = B[j][0] - A[j][0], dy = B[j][1] - A[j][1], l = Math.hypot(dx, dy) || 1;
      heads.push([A[j][0] - (NAIL_OUT * dx) / l, A[j][1] - (NAIL_OUT * dy) / l]);
      heads.push([B[j][0] + (NAIL_OUT * dx) / l, B[j][1] + (NAIL_OUT * dy) / l]);
    }
  }
  return { run, heads };
}

/**
 * Classic curve stitching in a corner: arms A-C and C-B, thread i joins the
 * point i/n along the first to the point i/n along the second. The envelope
 * is the parabola from A to B with C as its control point: a gusset.
 */
function fan(A, C, B, n) {
  const L = (p, q, u) => [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u];
  const run = [];
  for (let i = 1; i < n; i++) {
    const p = L(A, C, i / n), q = L(C, B, i / n);
    i % 2 ? run.push(p, q) : run.push(q, p);
  }
  return { run, heads: [] };
}

/** A vertical band of parallel threads, x0..x0+4, from y0 to y1. */
const vband = (x0, y0, y1, o) => band([x0, y0], [x0 + 4, y0], [x0, y1], [x0 + 4, y1], 3, o);
/** A horizontal band, y0..y0+4, from x0 to x1. */
const hband = (y0, x0, x1, o) => band([x0, y0], [x0, y0 + 4], [x1, y0], [x1, y0 + 4], 3, o);

const X1 = CW - 1, Y1 = CH - 1;
const K = 4;                          // chord skip for a bowl of radius R

/** Each digit: its strokes in the order a stringer would lay them. */
const SPECS = {
  0: () => [
    stitch(rail().arc(R, R, R, R, 270, 450).to(X1, Y1 - R).arc(R, Y1 - R, R, R, 90, 270), K, { closed: true }),
    vband(0, R, Y1 - R, { caps: false }),
    vband(X1 - 4, R, Y1 - R, { caps: false }),
  ],
  1: () => [
    vband(12, 0, Y1),
    band([13, -1], [16, 2], [2, 9], [5, 12], 3),
    fan([6.8, 10.3], [12, 5.6], [12, 17], 6),
  ],
  2: () => [
    stitch(rail().arc(R, R, R, R, 258, 480).to(6, Y1 - 4), K),
    band([18, 16], [22, 20], [0, Y1 - 4], [5, Y1 - 4], 3, { caps: false }),
    hband(Y1 - 4, 0, X1),
    fan([5, 38.3], [0, Y1 - 4], [11, Y1 - 4], 6),
  ],
  3: () => [
    stitch(rail().arc(R, 12, R, 12, 290, 560), K),
    stitch(rail().arc(R, 38, R, 13, 345, 610), K),
  ],
  4: () => [
    band([13, 0], [17, 0], [0, 33], [4, 33], 3),
    hband(32, 0, X1),
    vband(15, 0, Y1),
    fan([8.8, 20.8], [4.4, 32], [14, 32], 6),
  ],
  5: () => [
    vband(2, 0, 25),
    hband(0, 2, X1),
    stitch(rail().arc(R, 36, R, 15, 305, 600), K),
  ],
  6: () => [
    stitch(rail().to(0, 37).to(0, R).arc(R, R, R, R, 270, 410), K),
    vband(0, R, 37, { caps: false }),
    stitch(rail().arc(R, 37, R, 14, 0, 360), K, { closed: true }),
  ],
  7: () => [
    hband(0, 0, X1),
    band([18, 4], [22, 4], [5, Y1], [9, Y1], 3),
    fan([7, 4], [18, 4], [14.5, 17.5], 6),
  ],
  8: () => [
    stitch(rail().arc(R, 12.5, 10, 12.5, 0, 360), K, { closed: true }),
    stitch(rail().arc(R, 38, R, 13, 0, 360), K, { closed: true }),
  ],
  9: () => [
    stitch(rail().arc(R, 14, R, 14, 0, 360), K, { closed: true }),
    vband(X1 - 4, 14, Y1 - R, { caps: false }),
    stitch(rail().to(X1, 14).to(X1, Y1 - R).arc(R, Y1 - R, R, R, 90, 230), K),
  ],
};

/**
 * A digit, ready to string: segments in order (thread or the shuttle's flight
 * between strokes) with their start and end as fractions of the whole, and
 * its nail heads in the order the stringer hammers them.
 */
function build(d) {
  const strokes = SPECS[d]();
  const segs = [];
  let w = 0, prev = null;
  strokes.forEach((s, si) => {
    if (prev) segs.push({ p: prev, q: s.run[0], fly: true, si, w0: w, w1: (w += 0.5 * dist(prev, s.run[0])) });
    for (let i = 1; i < s.run.length; i++) {
      const p = s.run[i - 1], q = s.run[i];
      segs.push({ p, q, fly: false, si, w0: w, w1: (w += dist(p, q) + 1.5) });
    }
    prev = s.run[s.run.length - 1];
  });
  for (const s of segs) { s.u0 = s.w0 / w; s.u1 = s.w1 / w; }
  const heads = strokes.flatMap((s) => s.heads);
  return { segs, heads, strokes: strokes.length };
}
const dist = (p, q) => Math.hypot(q[0] - p[0], q[1] - p[1]);
const DIGITS = Array.from({ length: 10 }, (_, d) => build(d));

// ------------------------------------------------------------ timing (seconds of the minute)

const TEAR = 59.0;                    // old threads start to snap
const SNAP_SPREAD = 0.4, RECOIL = 0.3; // snaps spread over this, each half recoils in this
const PULL = [0.5, 0.9];              // then the nails come out, between these after TEAR
const POP = 0.3;                      // a new digit's nails go in, before its thread
const GAP = 0.15;                     // the shuttle's hop to the next slot
const durFor = (n) => (n <= 1 ? 1.6 : n === 2 ? 1.35 : 1.1);   // stringing one digit
const PLUCK = 1.8;                    // a plucked stroke rings this long

/** The digits being strung this minute, left to right, with their start times. */
function schedule(now, before) {
  const slots = [0, 1, 2, 3].filter((i) => now[i] !== before[i]);
  const dur = durFor(slots.length);
  const plan = slots.map((slot, j) => ({ slot, t0: j * (POP + dur + GAP), dur }));
  const end = plan.length ? plan[plan.length - 1].t0 + POP + dur : 0;
  return { plan, end };
}

// ------------------------------------------------------------ drawing

const px = (v) => Math.round(v);

/**
 * One thread, from p to q in slot coordinates. `amp` bows it sideways (a
 * plucked string), as a few straight pieces along a half sine.
 */
function thread(g, ox, oy, p, q, amp = 0) {
  const dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy);
  if (Math.abs(amp) < 0.5 || l < 6) return g.line(px(ox + p[0]), px(oy + p[1]), px(ox + q[0]), px(oy + q[1]));
  const nx = -dy / l, ny = dx / l, n = 6;
  let a = [ox + p[0], oy + p[1]];
  for (let k = 1; k <= n; k++) {
    const u = k / n, b = Math.sin(Math.PI * u) * amp;
    const c = [ox + p[0] + dx * u + nx * b, oy + p[1] + dy * u + ny * b];
    g.line(px(a[0]), px(a[1]), px(c[0]), px(c[1]));
    a = c;
  }
}

/** How far a thread of stroke `si` in slot `slot` is bowed at `sec`, from the plucks this minute. */
function bow(plucks, slot, si, k, sec) {
  let a = 0;
  for (const pl of plucks) {
    if (pl.slot !== slot || (pl.si !== -1 && pl.si !== si)) continue;
    const tau = sec - pl.t0 - (pl.lag ? pl.lag(si) : 0);
    if (tau < 0 || tau > PLUCK) continue;
    a += pl.amp * Math.exp(-tau / 0.5) * Math.sin(2 * Math.PI * 2.4 * tau + k * 0.7);
  }
  return a;
}

/** A finished digit, perhaps ringing. */
function drawDigit(g, d, ox, oy, slot, plucks, sec) {
  const D = DIGITS[d];
  D.segs.forEach((s, k) => { if (!s.fly) thread(g, ox, oy, s.p, s.q, bow(plucks, slot, s.si, k, sec)); });
  for (const h of D.heads) g.pixel(px(ox + h[0]), px(oy + h[1]));
}

/** A digit being strung: its nails go in, then the shuttle lays the thread. */
function drawStringing(g, d, ox, oy, tau, dur) {
  const D = DIGITS[d];
  const nh = D.heads.length;
  const shown = tau < POP ? Math.floor((tau / POP) * nh) + 1 : nh;
  for (let i = 0; i < Math.min(nh, shown); i++) g.pixel(px(ox + D.heads[i][0]), px(oy + D.heads[i][1]));
  if (tau < POP) return;
  const u = ease.inOutQuad(clamp((tau - POP) / dur, 0, 1)) * 0.98 + 0.02 * clamp((tau - POP) / dur, 0, 1);
  let at = null;
  for (const s of D.segs) {
    if (s.u0 >= u) break;
    if (s.u1 <= u) { if (!s.fly) thread(g, ox, oy, s.p, s.q); continue; }
    const v = (u - s.u0) / (s.u1 - s.u0);
    at = [s.p[0] + (s.q[0] - s.p[0]) * v, s.p[1] + (s.q[1] - s.p[1]) * v];
    if (!s.fly) thread(g, ox, oy, s.p, at);
  }
  if (at) shuttle(g, ox + at[0], oy + at[1]);
}

/** The shuttle: a bright bead with a dark keyline, so it reads over the threads. */
function shuttle(g, x, y) {
  const cx = px(x), cy = px(y);
  for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) if (Math.abs(i) + Math.abs(j) <= 3) g.pixel(cx + i, cy + j, 0);
  g.fillRect(cx - 1, cy - 1, 3, 3, 1);
}

/**
 * The old digit's threads snapping: each breaks at a point along it and the
 * two halves whip back to their nails, curling; then the nails come out.
 */
function drawSnapping(g, d, ox, oy, slot, key, sec) {
  const D = DIGITS[d];
  const t = sec - TEAR;
  D.segs.forEach((s, k) => {
    if (s.fly) return;
    const r = (j) => noise(k * 7.1 + slot * 131 + j, key);
    // Last laid, first to go, with some scatter: it unwinds rather than vanishes.
    const ts = SNAP_SPREAD * (0.6 * (1 - s.u0) + 0.4 * r(1));
    const e = (t - ts) / RECOIL;
    if (e < 0) {
      // Taking up the strain just before it goes.
      const amp = t > ts - 0.12 ? 0.7 : 0;
      return thread(g, ox, oy, s.p, s.q, amp);
    }
    if (e >= 1) return;
    const w = ease.outCubic(e), b = 0.3 + 0.4 * r(2);
    const curl = (r(3) - 0.5) * 3 * w;
    for (const [from, to, f] of [[s.p, s.q, b], [s.q, s.p, 1 - b]]) {
      const dx = to[0] - from[0], dy = to[1] - from[1];
      const len = Math.hypot(dx, dy) * f * (1 - w);
      if (len < 1) continue;
      const a = Math.atan2(dy, dx) + curl;
      g.line(px(ox + from[0]), px(oy + from[1]), px(ox + from[0] + Math.cos(a) * len), px(oy + from[1] + Math.sin(a) * len));
    }
  });
  D.heads.forEach((h, k) => {
    const out = PULL[0] + (PULL[1] - PULL[0]) * noise(k * 3.3 + slot * 17, key + 5);
    if (t < out) g.pixel(px(ox + h[0]), px(oy + h[1]));
  });
}

const digitsOf = (f) => [...`${f.hh}${f.mm}`].map(Number);

export default {
  name: 'String Art',
  blurb: 'Digits of taut thread on nails; curves are envelopes of straight lines. A shuttle strings each new minute.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,

  frame(g, { fields: f, date, oled, night }) {
    const key = f.minuteKey, sec = f.sec;
    const now = digitsOf(f);
    const before = digitsOf(previousMinute(date));
    const next = digitsOf(clockFields(new Date(date.getTime() + 60000)));
    const { plan, end } = schedule(now, before);
    // Burn-in: the whole board walks a 2-pixel orbit, one step every 3 minutes
    // (vertically only 1 up, so the top row of nails stays on the glass).
    const [ox, oy0] = orbit(date, 2, 3), oy = Math.max(-1, oy0);

    // Plucks: each digit rings as its last thread is tied off; two idle
    // plucks a minute on a random stroke; on the hour a glissando sweeps
    // every string from left to right.
    const plucks = plan.map((p) => ({ slot: p.slot, si: -1, t0: p.t0 + POP + p.dur, amp: 1.2 }));
    for (const [base, j] of [[16, 1], [38, 2]]) {
      const slot = Math.floor(noise(key, 10 + j) * 4);
      plucks.push({ slot, si: Math.floor(noise(key, 20 + j) * DIGITS[now[slot]].strokes), t0: base + 8 * noise(key, 30 + j), amp: 1.8 });
    }
    if (f.m === 0) {
      for (let slot = 0; slot < 4; slot++)
        plucks.push({ slot, si: -1, t0: end + 0.5 + slot * 0.3, lag: (si) => si * 0.08, amp: 1.6 });
    }

    for (let i = 0; i < 4; i++) {
      const x = SLOT_X[i] + ox, y = TOP + oy;
      const p = plan.find((q) => q.slot === i);
      if (sec >= TEAR && next[i] !== now[i]) drawSnapping(g, now[i], x, y, i, key, sec);
      else if (p && sec < p.t0) { /* waiting its turn: blank */ }
      else if (p && sec < p.t0 + POP + p.dur) drawStringing(g, now[i], x, y, sec - p.t0, p.dur);
      else drawDigit(g, now[i], x, y, i, plucks, sec);
    }

    // The colon: two knots, each a nail with a thread wound round it; the
    // turn of the thread ticks with the second (an X, then a +).
    for (const cy of [18, 34]) {
      const cx = 64 + ox, yy = TOP + cy + oy;
      if (f.s % 2) g.line(cx - 2, yy - 2, cx + 2, yy + 2).line(cx + 2, yy - 2, cx - 2, yy + 2);
      else g.line(cx, yy - 2, cx, yy + 2).line(cx - 2, yy, cx + 2, yy);
    }

    // The hem: a zigzag stitch along the bottom, one nail every second; the
    // shuttle sews it when it is not busy above. Nails ahead stand ready.
    const hy = HEM_Y + oy, hx = HEM_X + ox;
    const vx = (i) => hx + 2 * i, vy = (i) => hy + (i % 2 ? 2 : 0);
    const reach = sec >= TEAR ? 59 : sec;            // the last second's stitch waits for the turn
    const whole = Math.floor(reach);
    for (let i = whole + 1; i <= 60; i++) g.pixel(vx(i), vy(i));
    for (let i = 0; i < whole; i++) g.line(vx(i), vy(i), vx(i + 1), vy(i + 1));
    const fr = reach - whole;
    const ex = vx(whole) + 2 * fr, ey = vy(whole) + (vy(whole + 1) - vy(whole)) * fr;
    g.line(vx(whole), vy(whole), px(ex), px(ey));
    const busy = plan.some((p) => sec >= p.t0 && sec < p.t0 + POP + p.dur);
    if (!busy) shuttle(g, ex, ey);

    oled.contrast(0xcf + (0x18 - 0xcf) * night);  // night dimming, 23:00-07:00 (ctx.night)
  },
};
