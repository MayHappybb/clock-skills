// Ants — the time is what the colony has worn into the ground.
//
// The glass is bare ground. Four pheromone trails lie on it, and the trails
// are the numerals: each digit is one continuous path the workers walk, and
// the grey of the trail is their traffic — a thread of pheromone that stays
// lit only while ants keep passing over it, and goes stale when they stop.
// Nothing about the numerals exists except as a mark of that walking, so the
// digits cannot be swapped for a font: an abandoned trail is just a smudge
// fading off the ground.
//
// The ants are the only thing that moves. They walk their paths forever,
// turning at the ends, so each trail shimmers where the traffic is and the
// ground is brightest just where an ant has passed. The nest is the hole at
// the lower left, and one worker pops out of its mouth once a second, so the
// colony has a pulse you can count.
//
// When a minute turns, the workers of the changing digit walk off the trail
// — the pheromone goes stale behind them and the numeral unwinds from its
// far end back toward the entrance — and they mill on the bare ground
// outside it. At :00 they pour in at the entrance and lay the new trail
// outward from there, running while they lay and slowing to a walk as it
// fills. The digit is not replaced, it is carried. On the hour every trail
// empties at once: the whole colony runs back to the nest, masses there, and
// floods out again, so the ground between the nest and the time is briefly
// drawn by the traffic itself.
//
// Every frame is a function of the clock alone: the trails' state, the ants'
// places and the turn all come from the current second, the previous minute
// and the next one, so a still agrees with the animation around it. Nothing
// accumulates between frames.
//
// Burn-in: the whole scene walks kit.orbit's small square, the traffic keeps
// the dithered trail moving, and the panel dims from 23:00 (ctx.night).

import { orbit, progress, clamp, lerp, noise, dither, clockFields, previousMinute } from '../js/kit.js';

const W = 128, H = 64;

// ------------------------------------------------------------------ layout
//
// Hours sit high on the left, minutes low on the right, the nest holds the
// lower left corner: the composition runs as a diagonal, and the black of
// the open ground is left at the upper right.

const SLOTS = [
  { x: 5, y: 4, w: 20, h: 27, n: 5 },   // hour tens
  { x: 31, y: 4, w: 20, h: 27, n: 5 },  // hour ones
  { x: 59, y: 28, w: 22, h: 30, n: 7 }, // minute tens
  { x: 87, y: 28, w: 22, h: 30, n: 7 }, // minute ones
];
const NEST = [19, 50];
const HOLE = 4.4;              // radius of the entrance

// ------------------------------------------------------------------ trails
//
// Each numeral is one stroke: a path a column of ants can walk from end to
// end, turning round at the tips. Control points are in a unit box, y down;
// the first point is the entrance, where the colony reaches the trail.
//
// The strokes double back on their stems (an ant walks down the stem of a 4
// and up it again on the way round), which is how a real trail is worn —
// heavier where more feet pass.

const CTRL = {
  0: { closed: true, pts: [[0.20, 0.74], [0.24, 0.30], [0.50, 0.09], [0.76, 0.30], [0.80, 0.74], [0.50, 0.93]] },
  1: { pts: [[0.52, 0.93], [0.52, 0.09], [0.29, 0.27]] },
  2: { pts: [[0.86, 0.91], [0.15, 0.91], [0.46, 0.60], [0.70, 0.34], [0.70, 0.14], [0.50, 0.05], [0.28, 0.12], [0.15, 0.32]] },
  3: { pts: [[0.16, 0.84], [0.34, 0.94], [0.66, 0.91], [0.82, 0.73], [0.66, 0.57], [0.44, 0.50], [0.62, 0.44], [0.78, 0.27], [0.62, 0.08], [0.32, 0.06], [0.15, 0.17]] },
  4: { pts: [[0.68, 0.94], [0.68, 0.07], [0.68, 0.51], [0.13, 0.51], [0.47, 0.09]] },
  5: { pts: [[0.16, 0.83], [0.38, 0.94], [0.70, 0.89], [0.84, 0.68], [0.74, 0.49], [0.52, 0.40], [0.22, 0.42], [0.28, 0.08], [0.80, 0.08]] },
  6: { pts: [[0.21, 0.62], [0.36, 0.49], [0.60, 0.48], [0.78, 0.61], [0.76, 0.80], [0.54, 0.94], [0.28, 0.89], [0.17, 0.66], [0.26, 0.39], [0.46, 0.15], [0.72, 0.07]] },
  7: { pts: [[0.42, 0.94], [0.62, 0.47], [0.86, 0.09], [0.15, 0.09]] },
  8: { closed: true, pts: [[0.50, 0.47], [0.26, 0.63], [0.24, 0.83], [0.50, 0.93], [0.76, 0.83], [0.74, 0.63], [0.50, 0.47], [0.28, 0.31], [0.30, 0.12], [0.50, 0.07], [0.70, 0.12], [0.72, 0.31]] },
  9: { pts: [[0.79, 0.38], [0.64, 0.51], [0.40, 0.52], [0.22, 0.39], [0.24, 0.20], [0.46, 0.06], [0.72, 0.11], [0.83, 0.34], [0.74, 0.61], [0.54, 0.86], [0.28, 0.93]] },
};

/** Catmull-Rom through the control points, densely sampled. */
function spline(pts, closed, per = 14) {
  const p = closed ? [...pts, pts[0], pts[1], pts[2]] : [pts[0], ...pts, pts[pts.length - 1]];
  const out = [];
  const n = closed ? pts.length : pts.length - 1;
  const cr = (a, b, c, d, t) => {
    const t2 = t * t, t3 = t2 * t;
    return [
      0.5 * (2 * b[0] + (c[0] - a[0]) * t + (2 * a[0] - 5 * b[0] + 4 * c[0] - d[0]) * t2 + (3 * b[0] - a[0] - 3 * c[0] + d[0]) * t3),
      0.5 * (2 * b[1] + (c[1] - a[1]) * t + (2 * a[1] - 5 * b[1] + 4 * c[1] - d[1]) * t2 + (3 * b[1] - a[1] - 3 * c[1] + d[1]) * t3),
    ];
  };
  for (let i = 0; i < n; i++)
    for (let k = 0; k < per; k++) out.push(cr(p[i], p[i + 1], p[i + 2], p[i + 3], k / per));
  out.push(closed ? out[0] : pts[pts.length - 1]);
  return out;
}

/** Even arc-length resample: points about `step` apart, each with its fraction of the way. */
function even(path, step) {
  const out = [];
  const seg = [];
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const d = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
    seg.push(d); total += d;
  }
  let acc = 0, want = 0;
  for (let k = 0; k < path.length - 1; k++) {
    const d = seg[k];
    if (d < 1e-6) continue;
    while (want <= acc + d) {
      const t = (want - acc) / d;
      out.push([lerp(path[k][0], path[k + 1][0], t), lerp(path[k][1], path[k + 1][1], t), want / total]);
      want += step;
    }
    acc += d;
  }
  const last = path[path.length - 1];
  if (!out.length || out[out.length - 1][2] < 1) out.push([last[0], last[1], 1]);
  return { pts: out, len: total };
}

const TRAIL = new Map();
function trailFor(d, w, h) {
  const key = `${d}:${w}x${h}`;
  if (TRAIL.has(key)) return TRAIL.get(key);
  const c = CTRL[d];
  const dense = spline(c.pts, !!c.closed, 16).map(([x, y]) => [x * w, y * h]);
  const t = even(dense, 0.7);
  TRAIL.set(key, t);
  return t;
}

/** Slot-local point on a trail at arc fraction s. */
function onTrail(trail, s) {
  const pts = trail.pts;
  const x = clamp(s, 0, 1) * (pts.length - 1);
  const i = Math.min(pts.length - 2, Math.max(0, Math.floor(x)));
  const u = x - i;
  return [lerp(pts[i][0], pts[i + 1][0], u), lerp(pts[i][1], pts[i + 1][1], u)];
}

// ------------------------------------------------------------------ the field
//
// Everything lit is a pheromone level 0..1 in one float buffer, dithered to
// pixels at the end. A trail's body comes from a cached shape field; each
// ant's own passage is stamped on top of it, so the brightness of the ground
// is literally the traffic that has crossed it.

const field = new Float32Array(W * H);
function put(i, v) { if (v > field[i]) field[i] = v; }

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const u = l2 ? clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1) : 0;
  return Math.hypot(px - ax - u * dx, py - ay - u * dy);
}

/** A soft segment of pheromone: an ant's passage. */
function stampSeg(ax, ay, bx, by, r, level) {
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - r)), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + r));
  const y0 = Math.max(0, Math.floor(Math.min(ay, by) - r)), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by) + r));
  const core = r * 0.42, span = r - core + 0.001;
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const d = segDist(x + 0.5, y + 0.5, ax, ay, bx, by);
      if (d >= r) continue;
      put(y * W + x, level * (d <= core ? 1 : 1 - (d - core) / span));
    }
}

/** The shape of one trail: how far every pixel in the slot box (plus a small
 *  margin) lies from the stroke, and the arc fraction of the nearest point of
 *  it. Distance rather than density, because the trail has to thin as the
 *  ants give it up, and a solid core cannot thin. */
const GEOM = new Map();
const R_TRAIL = 3.1;           // half-width of a trail at full strength
function geomFor(d, w, h) {
  const key = `${d}:${w}x${h}`;
  if (GEOM.has(key)) return GEOM.get(key);
  const trail = trailFor(d, w, h);
  const M = 4;
  const gw = Math.ceil(w + 2 * M), gh = Math.ceil(h + 2 * M);
  const dist = new Float32Array(gw * gh).fill(99), smap = new Float32Array(gw * gh);
  for (const [px, py, s] of trail.pts) {
    const cx = px + M, cy = py + M;
    const ax = Math.max(0, Math.floor(cx - R_TRAIL)), bx = Math.min(gw - 1, Math.ceil(cx + R_TRAIL));
    const ay = Math.max(0, Math.floor(cy - R_TRAIL)), by = Math.min(gh - 1, Math.ceil(cy + R_TRAIL));
    for (let y = ay; y <= by; y++)
      for (let x = ax; x <= bx; x++) {
        const dd = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        if (dd >= R_TRAIL) continue;
        const i = y * gw + x;
        if (dd < dist[i]) { dist[i] = dd; smap[i] = s; }
      }
  }
  const g = { gw, gh, M, dist, smap };
  GEOM.set(key, g);
  return g;
}

// ------------------------------------------------------------------ the ants

/** One worker, from primitives, so it turns smoothly and its legs swing with
 *  the ground it has covered. On a lit trail it is drawn dark, the way an ant
 *  on a worn path reads — a black speck with legs; on bare ground it is lit,
 *  or a black ant on black glass would not be there at all. */
function drawAnt(g, x, y, ang, gait, sc, dark) {
  const bc = dark ? 0 : 1, lc = 1;
  const cs = Math.cos(ang), sn = Math.sin(ang);
  const P = (f, r) => [x + f * cs - r * sn, y + f * sn + r * cs];
  const S = 0.78 + 0.3 * sc;     // a mild size difference between workers
  for (let i = 0; i < 3; i++) {
    const f = (-1.25 + i * 1.25) * S;
    for (const sd of [-1, 1]) {
      const sw = 1.0 * Math.sin(gait + i * 2.0 + (sd > 0 ? 0.9 : 0));
      const [kx, ky] = P(f + sw * 0.5, sd * 1.35 * S);
      g.line(...P(f, sd * 0.55 * S), kx, ky, lc);
      g.line(kx, ky, ...P(f + sw, sd * 2.5 * S), lc);
    }
  }
  const [hx, hy] = P(2.0 * S, 0);
  g.line(hx, hy, ...P(3.3 * S, -1.5 * S), lc);
  g.line(hx, hy, ...P(3.3 * S, 1.5 * S), lc);
  // only the body is bitten out of a lit trail: legs drawn dark would take
  // the whole width of the path with them and break the numeral up
  g.fillCircle(...P(-1.9 * S, 0), 1.1 * S, bc);
  g.fillCircle(...P(-0.15 * S, 0), 0.72 * S, bc);
  g.fillCircle(...P(1.5 * S, 0), 0.95 * S, bc);
}

// ------------------------------------------------------------------ motion
//
// A worker's place on its trail is a folded distance: it walks, turns at the
// end, comes back. So traffic runs both ways and the tips are worn heaviest.

function tri(x) { const q = ((x % 2) + 2) % 2; return q < 1 ? q : 2 - q; }
const IDLE_V = 0.16;           // trail-fractions per second, about 24 px/s
const SPRINT = 34;             // px of extra push as they pour onto a new trail

// The turn, in seconds either side of the minute boundary; the two together
// are inside the window a minute turn is allowed.
// How long before :00 the last worker is off a trail. An hour trail's
// workers have a longer errand — back to the nest and out again — so they
// leave their own ground sooner.
const SLACK = 0.26, SLACK_HOUR = 0.66;
const LAY0 = 0.02, LAY1 = 0.95; // a new trail fills between these
const RUN_V = 76;              // px per second, the colony's scramble
const IDLE_UNTIL = 1.9;        // tau past which nothing but walking happens
const WEAR = 0.85;             // the density of a trail that is being kept up

// Scouts cross the open ground outside the trails, never settling: a dozen
// seconds of wandering and they are somewhere else. Incommensurate sine
// terms, so the path does not repeat on any timescale a viewer would notice.
const FORAGERS = [
  { cx: 92, cy: 13, ax: 27, ay: 6, w: 0.27, wy: 0.31, ph: 0.0 },
  { cx: 84, cy: 14, ax: 31, ay: 7, w: 0.19, wy: 0.25, ph: 2.4 },
];
function forageAt(k, t) {
  const F = FORAGERS[k];
  return [
    F.cx + F.ax * Math.sin(F.w * t + F.ph) + 5 * Math.sin(F.w * 2.7 * t + F.ph * 2),
    F.cy + F.ay * Math.sin(F.wy * t + F.ph + 1.3) + 2 * Math.sin(F.wy * 3.1 * t + F.ph),
  ];
}

// Roads: workers shuttling between the nest and the two nearest trails. They
// loiter at each end, so the ground between the nest and the time carries a
// worn line that is not a digit and never stops moving.
const ROADS = [
  { a: [NEST[0] + 5, NEST[1] - 7], b: [SLOTS[1].x + 11, SLOTS[1].y + SLOTS[1].h - 2], T: 8.5, ph: 0.1 },
  { a: [NEST[0] + 7, NEST[1] + 5], b: [SLOTS[2].x + 9, SLOTS[2].y + SLOTS[2].h - 1], T: 11, ph: 0.55 },
];
function roadAt(k, t) {
  const R = ROADS[k];
  const u = tri(t / R.T + R.ph);
  const v = u * u * (3 - 2 * u);
  return [lerp(R.a[0], R.b[0], v), lerp(R.a[1], R.b[1], v)];
}

/**
 * How much of an old trail is left at arc s. The workers leave in a body
 * from the far end and run back to the entrance, so the last foot to pass a
 * point is the one that started furthest out; behind it the pheromone goes
 * stale. `len/RUN_V` is how long the sweep takes to walk the whole trail.
 */
function leaving(s, tau, len, slack) {
  const K = len / RUN_V;
  const last = -(slack + K) + (1 - s) * K;
  return tau < last ? 1 : Math.exp(-(tau - last) / 0.15);
}
/** How much of a new trail is laid at arc s: it fills from the entrance out. */
function laying(s, tau) {
  const F = progress(tau, LAY0, LAY1) * 1.36;
  return clamp((F - s) / 0.32, 0, 1);
}

export default {
  name: 'Ants',
  blurb: 'The time worn into the ground: pheromone trails the colony walks, and when a minute turns the workers carry the trail to the next numeral.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  driver: 'full',

  frame(g, ctx) {
    const f = ctx.fields, date = ctx.date, sec = f.sec;
    const tAbs = date.getTime() / 1000;
    const mStart = Math.floor(date.getTime() / 60000) * 60;
    const [ox, oy] = orbit(date, 2, 3);
    ctx.oled.contrast(0xcf + (0x22 - 0xcf) * ctx.night);

    const dig = (c) => [Number(c.hh[0]), Number(c.hh[1]), Number(c.mm[0]), Number(c.mm[1])];
    const nowD = dig(f), prevD = dig(previousMinute(date));
    const nextD = dig(clockFields(new Date(date.getTime() + 60000)));
    const changedNow = [0, 1, 2, 3].map((i) => nowD[i] !== prevD[i]);
    const changedNext = [0, 1, 2, 3].map((i) => nextD[i] !== nowD[i]);

    const EN = [0, 1, 2, 3].map((i) => {
      const t = trailFor(nowD[i], SLOTS[i].w, SLOTS[i].h);
      const e = onTrail(t, 0);
      const cx = SLOTS[i].w / 2, cy = SLOTS[i].h / 2;
      const dx = e[0] - cx, dy = e[1] - cy, m = Math.hypot(dx, dy) || 1;
      return { e, out: [dx / m, dy / m], trail: t, len: t.len };
    });

    // Where the turn is: negative in the tail of the minute, positive in the
    // head of the next, null when no digit is changing this instant.
    let tau = null;
    const away = SLACK_HOUR + Math.max(...EN.map((e) => e.len)) / RUN_V;
    if (sec >= 60 - away) tau = sec - 60;
    else if (sec <= IDLE_UNTIL) tau = sec;
    // On an hour turn the whole colony runs its errand to the nest, so the
    // milling ground is the nest itself rather than the patch by the digit.
    const bigTurn = tau !== null && tau < 0
      ? changedNext[0] || changedNext[1]
      : changedNow[0] || changedNow[1];
    const slackOf = (i) => (bigTurn && i < 2 ? SLACK_HOUR : SLACK);

    const eOf = (i, j) => 0.04 + j * 0.075 + noise(j, i * 17 + 3) * 0.03;
    // A worker with a minute to spare waits on the ground outside its own
    // trail. On an hour turn the hour trails' workers run the whole errand
    // back to the nest, so the nest visibly fills before the hour is laid.
    const millSpot = (i, j) => {
      if (bigTurn && i < 2) {
        const a = noise(j * 5.1, i * 13 + 7) * Math.PI * 2, r = 2.5 + noise(j * 2.3, i + 31) * 5.5;
        return [NEST[0] + Math.cos(a) * r, NEST[1] + Math.sin(a) * r * 0.7];
      }
      const en = EN[i];
      return [SLOTS[i].x + en.e[0] + en.out[0] * 6.5, SLOTS[i].y + en.e[1] + en.out[1] * 6.5];
    };

    // One worker's place at time t. Everything else in the frame is a call
    // to this: the traffic on a trail is just where its ants have been.
    const place = (i, j, t) => {
      const s = SLOTS[i], en = EN[i];
      const eAbs = mStart + eOf(i, j);
      let arc, dist;
      const walked = (u) => {
        const D = IDLE_V * u + (SPRINT * (1 - Math.exp(-u / 0.62))) / en.len;
        return { arc: tri(D), dist: D * en.len };
      };
      const idle = (t2) => {
        const D = 0.34 + j * 0.137 + noise(j * 7.1, i * 11 + 5) * 0.55 + IDLE_V * t2;
        return { arc: tri(D), dist: D * en.len };
      };
      if (changedNow[i] && t < eAbs) {
        // not on the trail yet: waiting outside the entrance, then running in
        const ms = millSpot(i, j);
        const md = Math.hypot(ms[0] - (s.x + en.e[0]), ms[1] - (s.y + en.e[1]));
        const tOut = eAbs - Math.max(0.13, md / RUN_V);
        if (t < tOut) {
          const w = t * 3.1 + j * 2.1;
          return { x: ms[0] + Math.sin(w) * 1.6, y: ms[1] + Math.cos(w * 0.83) * 1.2, on: null };
        }
        const u = progress(t, tOut, eAbs);
        return { x: lerp(ms[0], s.x + en.e[0], u), y: lerp(ms[1], s.y + en.e[1], u), on: null };
      }
      ({ arc, dist } = changedNow[i] ? walked(t - eAbs) : idle(t));
      // Walking off: from the tail of the minute the workers run back along
      // the trail to the entrance and out onto the bare ground. Each leaves
      // early enough that the column sweeps the trail exactly once, as one
      // body, at the moment `leaving` says the pheromone there goes stale.
      if (tau !== null && tau < 0 && changedNext[i]) {
        const K = en.len / RUN_V;
        const t0 = mStart + 60 - (slackOf(i) + K);
        const a0 = (changedNow[i] ? walked(t0 - eAbs) : idle(t0)).arc;
        const dAbs = t0 + (1 - a0) * K;
        if (t > dAbs) {
          const st = changedNow[i] ? walked(dAbs - eAbs) : idle(dAbs);
          const back = (t - dAbs) * RUN_V;
          const along = st.arc * en.len;
          if (back < along) {
            const sb = st.arc - back / en.len;
            const p = onTrail(en.trail, sb);
            return { x: s.x + p[0], y: s.y + p[1], on: en.trail, dist: sb * en.len, s: sb };
          }
          const ms = millSpot(i, j);
          const u = clamp((back - along) / 9, 0, 1);
          return { x: lerp(s.x + en.e[0], ms[0], u), y: lerp(s.y + en.e[1], ms[1], u), on: null };
        }
      }
      const p = onTrail(en.trail, arc);
      return { x: s.x + p[0], y: s.y + p[1], on: en.trail, dist, s: arc };
    };

    // ---- the trails, worn and carried -------------------------------------
    field.fill(0);
    for (let i = 0; i < 4; i++) {
      const slot = SLOTS[i];
      const wearingOff = tau !== null && tau < 0 && changedNext[i];
      const growing = tau !== null && tau >= 0 && changedNow[i];
      const gm = geomFor(nowD[i], slot.w, slot.h);
      const tlen = trailFor(nowD[i], slot.w, slot.h).len;
      const sx = slot.x + ox - gm.M, sy = slot.y + oy - gm.M;
      for (let y = 0; y < gm.gh; y++) {
        const py = sy + y;
        if (py < 0 || py >= H) continue;
        for (let x = 0; x < gm.gw; x++) {
          const dd = gm.dist[y * gm.gw + x];
          if (dd > R_TRAIL) continue;
          const px = sx + x;
          if (px < 0 || px >= W) continue;
          let a = 1;
          if (wearingOff || growing) {
            const s = gm.smap[y * gm.gw + x];
            a = wearingOff ? leaving(s, tau, tlen, slackOf(i)) : laying(s, tau);
          }
          // the width is the trail's strength: giving it up thins it to a
          // thread from the outside in, rather than dimming it evenly
          const wdt = R_TRAIL * (0.16 + 0.84 * a);
          if (dd > wdt) continue;
          const v = clamp((wdt - dd) / (wdt * 0.55), 0, 1);
          put(py * W + px, v * WEAR * clamp(a * 2.6, 0, 1));
        }
      }
    }

    // ---- the nest: a mouth under a raised lip, ringed with pushed-out soil -
    const nx = NEST[0] + ox, ny = NEST[1] + oy;
    for (let y = -13; y <= 13; y++)
      for (let x = -13; x <= 13; x++) {
        const px = nx + x, py = ny + y;
        if (px < 0 || px >= W || py < 0 || py >= H) continue;
        const d = Math.hypot(x, y * 1.3);
        const ang = Math.atan2(y, x);
        const inner = HOLE * (1 + 0.16 * Math.sin(ang * 3 + 1.2) + 0.1 * Math.sin(ang * 5 - 0.7));
        const r = d - inner;
        if (r < 0) continue;
        let lvl;
        // the lip of the mouth, and the bank of soil the colony has carried
        // out and shouldered up on its uphill side
        const bank = x * 0.55 + y * 0.84 < 0;
        if (r < 1.5) lvl = 1;
        else if (bank && r < 3.1) lvl = 0.95;
        else if (r < 4.6) lvl = (0.66 * (1 - (r - 1.5) / 3.1)) * (0.7 + 0.58 * noise(px * 0.83, py * 0.71));
        else continue;
        if (lvl > 0.2) put(py * W + px, lvl);
      }

    // ---- the workers: the comet each drags, then the bodies --------------
    const bodies = [];
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < SLOTS[i].n; j++) {
        const b = place(i, j, tAbs);
        const b2 = place(i, j, tAbs - 0.07);
        b.ang = Math.atan2(b.y - b2.y, b.x - b2.x) || 0;
        b.jit = noise(j * 3.3 + 0.5, i * 7 + 2);
        b.slot = i; b.len = EN[i].len;
        bodies.push(b);
        if (!b.on) continue;
        // an ant on a trail that is being given up must not repaint it: the
        // passage it drags is worth only what the trail there is still worth
        const fading = tau !== null && tau < 0 && changedNext[i];
        const tlen = EN[i].len;
        let px = b.x, py = b.y;
        for (let k = 1; k <= 6; k++) {
          const q = place(i, j, tAbs - k * 0.05);
          if (!q.on) break;
          let lvl = 0.42 + 0.5 * (1 - k / 7);
          if (fading) lvl *= leaving(q.s, tau, tlen, slackOf(i));
          if (lvl > 0.03) stampSeg(px + ox, py + oy, q.x + ox, q.y + oy, 2.8, lvl);
          px = q.x; py = q.y;
        }
      }

    // The scouts, two wanderers on the open ground, leave a faint thread
    // behind them that the next minute's traffic has already forgotten.
    for (let k = 0; k < FORAGERS.length; k++) {
      const [fx, fy] = forageAt(k, tAbs);
      let px = fx, py = fy;
      for (let m = 1; m <= 12; m++) {
        const [qx, qy] = forageAt(k, tAbs - m * 0.55);
        stampSeg(px + ox, py + oy, qx + ox, qy + oy, 2.4, 0.46 * (1 - m / 15));
        px = qx; py = qy;
      }
      bodies.push({ x: fx, y: fy, ang: Math.atan2(fy - py, fx - px), dist: tAbs * 30 * k, sc: 0.8, dark: false });
    }

    // and the two roads, worked back and forth
    for (let k = 0; k < ROADS.length; k++) {
      const [rx, ry] = roadAt(k, tAbs);
      let px = rx, py = ry;
      for (let m = 1; m <= 8; m++) {
        const [qx, qy] = roadAt(k, tAbs - m * 0.1);
        stampSeg(px + ox, py + oy, qx + ox, qy + oy, 2.4, 0.46 * (1 - m / 11));
        px = qx; py = qy;
      }
      bodies.push({ x: rx, y: ry, ang: Math.atan2(ry - py, rx - px), dist: tAbs * 26, sc: 0.72 + 0.2 * k, dark: false });
    }

    // On the hour the nest itself empties: a party runs out into the ground
    // and back, so the highways between the nest and the time are drawn by
    // the traffic that uses them and by nothing else.
    if (bigTurn && tau !== null) {
      for (let k = 0; k < 5; k++) {
        const t0 = -0.55 + k * 0.1;
        if (tau < t0) continue;
        const dir = -0.75 + k * 0.5, D = 20 + noise(k * 3.1, 7) * 30;
        const ep = (t) => {
          const uu = Math.sin(Math.PI * clamp((t - t0) / 1.5, 0, 1));
          return [NEST[0] + Math.sin(dir) * (4 + D * uu), NEST[1] - Math.cos(dir) * (4 + D * uu)];
        };
        const [ex, ey] = ep(tau);
        let px = ex, py = ey;
        for (let m = 1; m <= 5; m++) {
          const [qx, qy] = ep(tau - m * 0.055);
          stampSeg(px + ox, py + oy, qx + ox, qy + oy, 2.6, 0.5 - m * 0.06);
          px = qx; py = qy;
        }
        const [bx, by] = ep(tau - 0.05);
        bodies.push({ x: ex, y: ey, ang: Math.atan2(ey - by, ex - bx), dist: (tau - t0) * 240, sc: 0.8, dark: false });
      }
    }

    // ---- the field becomes pixels -----------------------------------------
    g.fillWhere((px, py, x, y) => dither(x, y, field[y * W + x]), 1, [0, 0, W, H]);

    for (const b of bodies) {
      // dark on a lit trail, lit on bare ground — so an ant still walking a
      // stretch the colony has already given up is lit, as if on open ground
      const lit = b.on && (tau !== null && tau < 0 && changedNext[b.slot]
        ? leaving(b.s, tau, b.len, slackOf(b.slot)) < 0.4 : false);
      drawAnt(g, b.x + ox, b.y + oy, b.ang, b.dist ? b.dist * 0.5 : tAbs * 9,
        b.sc ?? 0.85 + 0.18 * b.jit, !!b.on && !lit);
    }

    // the colony's pulse: one worker out of the entrance every second
    const beat = sec % 1;
    if (beat < 0.6) {
      const u = Math.sin(Math.PI * (beat / 0.6));
      const a = 3.5, rr = 1.4 + u * 7;
      drawAnt(g, nx + 1 + Math.sin(a) * rr, ny + 1.4 - Math.cos(a) * rr, a + Math.PI / 2, sec * 7, 0.75);
    }
  },
};
