// Koi: the ribbon is a koi pond seen from above. Its slanted left end is a
// waterfall lip; the current runs left to right along the lattice's straight
// rows, carrying streaks of light and lily pads.
//
// The time is written by schools of koi swimming nose to tail along each
// numeral's stroke: they rise out of the deep at the stroke's start, follow
// its curves, and dive at its end, so the digits are always moving and never
// redrawn. Hours are golden koi (ogon, kigoi, orenji), minutes red-and-white
// (kohaku, tancho, benigoi). The colon is a frog sitting on a lily pad; its
// two eyes are the dots.
//
// Minute: the frog leaps onto the changed digits. Plop: ripples, the fish
// scatter, then wheel round and fall in along the new numeral while the frog
// paddles home. Hour: a golden koi climbs the waterfall in three leaps and,
// at the top, becomes a dragon (the Dragon Gate legend). The dragon chases
// its pearl through the numerals, scattering the old hour, then glides back
// along the bottom of the pond and climbs the falls out of sight.
//
// Stateless: every fish is a closed-form function of the wall clock; the
// transitions are cached per minute.
import * as kit from '../js/kit.js';

const { lerp, clamp, smoothstep, TAU } = kit;
const RS = 2 * Math.sqrt(3);                    // row step (mm): 15 straight rows
const ROW0 = -7 * RS;                           // y of row 0 (row 7 is y = 0)
const T = 5 * RS;                               // digit half-height: rows 2..12
const SLOTS = [14, 40, 92, 118];                // digit centres, x mm
const SEAT = [64, 0], PADC = [65.5, 0];         // the frog and its pad: the colon
const FL = 14, SP = 18, V = 5, NB = 7;          // fish length, spacing, swim speed (mm/s), body points
const mod = (a, b) => ((a % b) + b) % b;
const lerp2 = (a, b, e) => [lerp(a[0], b[0], e), lerp(a[1], b[1], e)];

// ------------------------------------------------------------- the pond
const rowOf = (y) => (y - ROW0) / RS;
const xLeft = (y) => -2 * rowOf(y), xRight = (y) => 128 + 2 * rowOf(y);
function inWater(p, m = 3) {
  const y = clamp(p[1], ROW0 + 1.5, -ROW0 - 1.5);
  return [clamp(p[0], xLeft(y) + m, xRight(y) - m), y];
}

// -------------------------------------------------------------- strokes
/** Catmull-Rom through pts, densely sampled. */
function cr(pts, closed) {
  const n = pts.length, P = (i) => (closed ? pts[mod(i, n)] : pts[clamp(i, 0, n - 1)]);
  const out = [];
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const a = P(i - 1), b = P(i), c = P(i + 1), d = P(i + 2);
    for (let k = 0; k < 16; k++) {
      const t = k / 16, t2 = t * t, t3 = t2 * t;
      const f = (q) => 0.5 * (2 * b[q] + (c[q] - a[q]) * t + (2 * a[q] - 5 * b[q] + 4 * c[q] - d[q]) * t2 + (3 * b[q] - a[q] - 3 * c[q] + d[q]) * t3);
      out.push([f(0), f(1)]);
    }
  }
  out.push(closed ? pts[0] : pts[n - 1]);
  return out;
}
/** Uniform resampling (step ~0.5 mm) so a point at arclength s is O(1). */
function resample(raw) {
  const cum = [0];
  for (let i = 1; i < raw.length; i++) cum.push(cum[i - 1] + Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1]));
  const len = cum[cum.length - 1], n = Math.max(1, Math.round(len / 0.5)), st = len / n;
  const xs = new Float64Array(n + 1), ys = new Float64Array(n + 1);
  let j = 0;
  for (let k = 0; k <= n; k++) {
    const s = k * st;
    while (j < raw.length - 2 && cum[j + 1] < s) j++;
    const f = cum[j + 1] > cum[j] ? clamp((s - cum[j]) / (cum[j + 1] - cum[j])) : 0;
    xs[k] = lerp(raw[j][0], raw[j + 1][0], f); ys[k] = lerp(raw[j][1], raw[j + 1][1], f);
  }
  return { xs, ys, len, st, n };
}
function along(p, s, closed) {
  s = closed ? mod(s, p.len) : clamp(s, 0, p.len);
  const u = s / p.st, i = Math.min(p.n - 1, Math.floor(u)), f = u - i;
  return [p.xs[i] + (p.xs[i + 1] - p.xs[i]) * f, p.ys[i] + (p.ys[i + 1] - p.ys[i]) * f];
}

// ------------------------------------------------------------- numerals
// Each numeral is ONE swim route (mm, centred, y down, rows 2..12), the way
// a school would follow it: fish surface at the first point and dive at the
// last. 0 and 8 are closed loops the fish circle forever. Runs meet at
// corners; inside a run the route is a smooth curve. Bars sit on the
// lattice's straight rows (2, 7, 9, 12); the 4's diagonal is a 60 degree
// lattice line.
const B9 = 2 * RS;
const GLYPH_DEFS = {
  0: { closed: [[0, -T], [8, -T + 4.5], [10, 0], [8, T - 4.5], [0, T], [-8, T - 4.5], [-10, 0], [-8, -T + 4.5]] },
  1: { runs: [[[-7.5, -T + 7.5], [-2.5, -T + 3], [2, -T]], [[2, -T], [2, T]]] },
  2: { runs: [[[-9, -T + 6], [-5, -T + 1], [1, -T], [7.5, -T + 3.5], [9, -T + 10], [5, -1], [-2, 6.5], [-9.5, T]], [[-9.5, T], [10, T]]] },
  3: { runs: [[[-9, -T + 4], [-3, -T], [4, -T + 0.5], [8.5, -T + 5.5], [6, -3], [-1, -0.5]], [[-1, -0.5], [7, 2.5], [9.5, 9], [6, T - 1], [-2, T], [-9.5, T - 4]]] },
  4: { runs: [[[5, T], [5, -T]], [[5, -T], [-9, B9]], [[-9, B9], [10.5, B9]]] },
  5: { runs: [[[9.5, -T], [-7, -T]], [[-7, -T], [-8, -1.5]], [[-8, -1.5], [-1, -4.5], [6, -2.5], [9.5, 4], [8, T - 3], [1, T], [-5, T - 0.5], [-9.5, T - 4.5]]] },
  6: { runs: [[[8, -T + 3], [3, -T], [-4, -T + 2.5], [-9, -6], [-10, 4], [-7, T - 2.5], [0, T], [7, T - 3], [9.5, 6], [7, -1.5], [0, -3], [-6, -0.5], [-9.5, 5]]] },
  7: { runs: [[[-10, -T], [10, -T]], [[10, -T], [5, -5], [0, 6], [-2.5, T]]] },
  8: { closed: [[0, -1], [7, -5], [8, -11.5], [3.5, -T], [-3.5, -T], [-8, -11.5], [-7, -5], [0, -1], [7.5, 4], [9.5, 10.5], [5, T], [-5, T], [-9.5, 10.5], [-7.5, 4]] },
  9: { runs: [[[-8, T - 3], [-3, T], [4, T - 2.5], [9, 6], [10, -4], [7, -T + 2.5], [0, -T], [-7, -T + 3], [-9.5, -6], [-7, 1], [0, 3], [6, 0.5], [9.5, -5]]] },
};
const GL = {};
for (const [d, def] of Object.entries(GLYPH_DEFS)) {
  let raw = [];
  if (def.closed) raw = cr(def.closed, true);
  else def.runs.forEach((run, i) => { const r = cr(run, false); if (i) r.shift(); raw.push(...r); });
  const p = resample(raw), closed = !!def.closed;
  const P = closed ? p.len : p.len + FL * 0.6;   // open routes: one dives as the next surfaces
  GL[d] = { p, closed, len: p.len, P, n: Math.max(1, Math.round(P / SP)) };
}

// ----------------------------------------------------------------- fish
/** Arclength of fish j's head on glyph g in slot k at time t. */
const sOf = (g, j, t, k) => mod(V * t + (j * g.P) / g.n + k * 7.3, g.P);
/** How surfaced it is: rising at the route's start, diving at its end. */
const aOf = (g, s) => (g.closed ? 1 : smoothstep(0, FL * 0.55, s) * (1 - smoothstep(g.len, g.len + FL * 0.55, s)));
const ptOn = (g, s, cx) => { const q = along(g.p, s, g.closed); return [q[0] + cx, q[1]]; };
function bodyOn(g, s, cx) {
  const b = [];
  for (let k = 0; k < NB; k++) b.push(ptOn(g, s - (k / (NB - 1)) * FL, cx));
  return b;
}
/**
 * The body as the head's own wake: walk F (time -> head position) back in
 * time until FL mm of path, then resample at NB equal steps. Bodies bend
 * exactly the way the fish turned.
 */
function trail(F, t, len = FL, n = NB) {
  const pts = [F(t)], cum = [0];
  let acc = 0, dt = 0.02, tau = t, prev = pts[0], guard = 0;
  while (acc < len && guard++ < 200 && tau > t - 5) {
    const q = F(tau - dt), d = Math.hypot(q[0] - prev[0], q[1] - prev[1]);
    if (d > 2.5 && dt > 0.004) { dt /= 2; continue; }
    if (d > 6) break;                               // a jump: it was elsewhere (resurfaced)
    tau -= dt; acc += d; pts.push(q); cum.push(acc); prev = q;
    if (d < 0.6) dt = Math.min(dt * 1.6, 0.3);
  }
  const out = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const s = (k / (n - 1)) * len;
    if (s >= acc) { out.push(pts[pts.length - 1]); continue; }
    while (cum[j + 1] < s) j++;
    out.push(lerp2(pts[j], pts[j + 1], (s - cum[j]) / (cum[j + 1] - cum[j] || 1)));
  }
  return out;
}

// --------------------------------------------------------------- dragon
// Its route: out of the waterfall's lip, a fast weave through the numerals
// chasing the pearl, round the outflow, slowly back along the bottom of the
// pond, and up the falls to the sky.
const LD = 78, ND = 26;
const DR = (() => {
  const way = [[2, -23], [5, -13], [9, -3]];
  for (let x = 15; x <= 134; x += 6.5) way.push([x, 9 * Math.sin(((x - 9) / 52) * TAU)]);
  const turn = way.length;
  way.push([141, 6], [145, 14], [140, 21.5], [128, 22.6]);
  for (let x = 114, q = 0; x >= -8; x -= 13, q++) way.push([x, q % 2 ? 20.8 : 23.6]);
  const falls = way.length;
  way.push([-18, 19], [-16, 9], [-10.5, -1], [-5, -11], [0, -20], [4, -30], [8, -60]);
  const p = resample(cr(way, false));
  // arclength of the turn and the falls, from the nearest resampled points
  const sNear = (q) => { let b = 0, bd = 1e9; for (let k = 0; k <= p.n; k++) { const d = (p.xs[k] - q[0]) ** 2 + (p.ys[k] - q[1]) ** 2; if (d < bd) { bd = d; b = k; } } return b * p.st; };
  const s1 = sNear(way[turn]), s2 = sNear(way[falls]);
  const v = (s) => lerp(lerp(108, 46, smoothstep(s1 - 10, s1 + 25, s)), 62, smoothstep(s2 - 10, s2 + 20, s));
  const tau = new Float64Array(p.n + 1);
  for (let k = 1; k <= p.n; k++) tau[k] = tau[k - 1] + p.st / v(k * p.st);
  const sAt = (t) => {
    if (t <= 0) return 0;
    if (t >= tau[p.n]) return p.len + (t - tau[p.n]) * 62;
    let lo = 0, hi = p.n;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (tau[m] <= t) lo = m; else hi = m; }
    return (lo + (t - tau[lo]) / (tau[hi] - tau[lo])) * p.st;
  };
  const reach = (x) => { for (let k = 0; k <= p.n && k * p.st < s1; k++) if (p.xs[k] >= x) return tau[k]; return tau[p.n]; };
  return { p, sAt, reach, end: tau[p.n] + LD / 62 };
})();
const KOI_LEAD = 2.7;                           // the golden koi starts this long before the dragon

// --------------------------------------------------------------- events
const pad2 = (n) => String(n).padStart(2, '0');
const digitsAt = (sec) => { const d = new Date(sec * 1000); return pad2(d.getHours()) + pad2(d.getMinutes()); };
const events = new Map();
/** What happens at the minute starting at epoch second M. */
function eventOf(M) {
  if (events.has(M)) return events.get(M);
  const a = digitsAt(M - 60), b = digitsAt(M);
  const changed = [0, 1, 2, 3].filter((k) => a[k] !== b[k]);
  const hour = new Date(M * 1000).getMinutes() === 0;
  const ev = { M, a, b, hour, slots: {}, cache: {} };
  if (hour) {
    // the dragon reaches the last changed numeral just before the minute
    ev.B = M - DR.reach(SLOTS[changed[changed.length - 1]]) - 0.1;
    for (const k of changed) {
      // a quicker scramble than the minute's, so the time is back within a second
      const T0 = ev.B + DR.reach(SLOTS[k]) - 0.04, T1 = Math.max(T0 + 0.35, M);
      ev.slots[k] = { T0, Td: T0 + 0.35, T1, T2: T1 + 0.9, origin: along(DR.p, DR.sAt(T0 - ev.B), false) };
    }
  } else {
    ev.O = [changed.reduce((s, k) => s + SLOTS[k], 0) / changed.length, 0];
    for (const k of changed) ev.slots[k] = { T0: M, Td: M + 0.45, T1: M + 0.55, T2: M + 1.95, origin: ev.O };
  }
  if (events.size > 8) events.delete(events.keys().next().value);
  events.set(M, ev);
  return ev;
}

/** The fish of slot k during event ev: [{ body(t) -> points, A(t) -> alpha, j }]. */
function moversOf(ev, k) {
  if (ev.cache[k]) return ev.cache[k];
  const { T0, Td, T1, T2, origin: O } = ev.slots[k];
  const cx = SLOTS[k], ga = GL[ev.a[k]], gb = GL[ev.b[k]], out = [];
  for (let j = 0; j < Math.max(ga.n, gb.n); j++) {
    const h1 = kit.hash(ev.M, k * 31 + j, 1), h2 = kit.hash(ev.M, k * 31 + j, 2);
    const sA = j < ga.n ? sOf(ga, j, T0, k) : 0, aA = j < ga.n ? aOf(ga, sA) : 0;
    const hasOld = aA > 0.05, hasNew = j < gb.n;
    const oldAt = (tau) => ptOn(ga, sA - V * (T0 - tau), cx);
    const newS = (tau) => sOf(gb, j, tau, k), newAt = (tau) => ptOn(gb, newS(tau), cx);
    let S0, dir;
    if (hasOld) {
      S0 = oldAt(T0);
      const dx = S0[0] - O[0], dy = S0[1] - O[1], dn = Math.hypot(dx, dy);
      const a = dn > 1 ? Math.atan2(dy, dx) + (h1 - 0.5) * 0.8 : h1 * TAU;
      dir = [Math.cos(a), Math.sin(a)];
    } else {
      const a = h1 * TAU;
      dir = [Math.cos(a), Math.sin(a)];
      S0 = inWater([newAt(T1)[0] + dir[0] * 10, newAt(T1)[1] + dir[1] * 10]);
    }
    const D = 9 + 7 * h2, S1 = inWater([S0[0] + dir[0] * D, S0[1] + dir[1] * D]);
    const hov = (tau) => [S1[0] + dir[0] * 1.5 * (tau - Td), S1[1] + dir[1] * 1.5 * (tau - Td)];
    const A = hasOld ? hov(T1) : S0;
    const C = hasOld ? [A[0] + dir[0] * 6, A[1] + dir[1] * 6] : A;
    const F = (tau) => {
      if (hasOld && tau < T0) return oldAt(tau);
      if (hasOld && tau < Td) return lerp2(S0, S1, kit.ease.out((tau - T0) / (Td - T0)));
      if (tau < T1 || !hasNew) return hasOld ? hov(tau) : S0;
      if (tau < T2) {
        const e = kit.ease.inOut((tau - T1) / (T2 - T1)), Bp = newAt(tau), m = 1 - e;
        return [m * m * A[0] + 2 * m * e * C[0] + e * e * Bp[0], m * m * A[1] + 2 * m * e * C[1] + e * e * Bp[1]];
      }
      return newAt(tau);
    };
    const Al = (tau) => {
      if (hasOld && tau < T0) return aOf(ga, sA - V * (T0 - tau));
      if (!hasNew) return hasOld ? lerp(aA, 1, smoothstep(T0, Td, tau)) * (1 - smoothstep(Td, T1 + 0.4, tau)) : 0;
      if (tau < T1) return hasOld ? lerp(aA, 1, smoothstep(T0, Td, tau)) : 0;
      if (tau < T2) return lerp(hasOld ? 1 : 0, aOf(gb, newS(tau)), smoothstep(T1, T2, tau));
      return aOf(gb, newS(tau));
    };
    // arriving fish settle their whole body onto the route, not just the head
    const W = (tau) => (hasNew ? smoothstep(T1 + 0.25, T2, tau) : 0);
    const body = (tau) => {
      const tb = trail(F, tau), w = W(tau);
      if (w <= 0) return tb;
      const pb = bodyOn(gb, newS(tau), cx);
      return tb.map((q, i) => lerp2(q, pb[i], w));
    };
    out.push({ body, A: Al, j });
  }
  ev.cache[k] = out;
  return out;
}

// --------------------------------------------------------------- colour
const WATER = [0, 0, 0], CAUS = [0.0, 0.055, 0.07], RIPPLE = [0.2, 0.42, 0.48];
const FOAM = [0.13, 0.2, 0.25];
const WHITE = [1, 0.84, 0.7], VERM = kit.hex('#ff3a0c'), GOLD = kit.hex('#ffa81e');
const YEL = kit.hex('#ffd040'), ORNG = kit.hex('#ff6c0e'), PLAT = [1, 0.9, 0.7];
const LEAF = [0.012, 0.05, 0.004], LEAF2 = [0.03, 0.09, 0.008], LOTUS = kit.hex('#ff7aa0');
const FROG = [0.05, 0.5, 0.03], FROG2 = [0.02, 0.22, 0.01], EYE = [1, 0.8, 0.3];
const PEARL = [0.75, 0.85, 1];

/** A koi's colour at u (0 head .. 1 tail) by variety; gold varieties for hours. */
function koiColour(hourFish, kind, u, seed) {
  if (hourFish) {
    if (kind === 0) return u < 0.14 ? PLAT : GOLD;                         // platinum-headed ogon
    if (kind === 1) return YEL;                                            // kigoi
    if (kind === 2) return u < 0.5 && Math.sin(u * 11 + seed * 9) > 0.3 ? GOLD : ORNG;   // orenji
    return GOLD;                                                           // ogon
  }
  if (kind === 0) return u > 0.06 && u < 0.76 && Math.sin(u * 10 + seed * 13) > -0.15 ? VERM : WHITE;  // kohaku
  if (kind === 1) return u > 0.04 && u < 0.2 ? VERM : WHITE;               // tancho
  if (kind === 2) return VERM;                                             // benigoi
  return u < 0.3 || (u > 0.5 && u < 0.7) ? VERM : WHITE;                   // kohaku, two steps
}
const fishR = (u) => (u < 0.12 ? 2 + 8 * u : u < 0.4 ? 2.95 : u < 0.8 ? lerp(2.95, 0.8, (u - 0.4) / 0.4) : lerp(0.8, 1.9, (u - 0.8) / 0.2));

/**
 * Paint a body given as points head..tail (equal arclength). prof(u) is the
 * radius in mm, paint(u, d/r, led) its colour. Coverage of a distance field,
 * so the body sits anywhere between LEDs.
 */
function drawBody(ctx, pts, prof, paint, alpha, soft = 1.15) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const p of pts) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
  const n = pts.length, R = Math.hypot(x1 - x0, y1 - y0) / 2 + 4.5;
  for (const i of ctx.layout.index.near((x0 + x1) / 2, (y0 + y1) / 2, R)) {
    const l = ctx.leds[i];
    let bd = 1e9, bu = 0;
    for (let k = 0; k + 1 < n; k++) {
      const [ax, ay] = pts[k], [bx, by] = pts[k + 1], dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
      const t = L2 ? clamp(((l.x - ax) * dx + (l.y - ay) * dy) / L2) : 0;
      const d = Math.hypot(l.x - ax - t * dx, l.y - ay - t * dy);
      if (d < bd) { bd = d; bu = (k + t) / (n - 1); }
    }
    const r = prof(bu), cov = 1 - smoothstep(r - soft, r + soft, bd);
    if (cov <= 0.01) continue;
    kit.over(ctx, i, paint(bu, bd / r, l), cov * alpha);
  }
}
/** Swim: a travelling wave down the body, growing toward the tail. */
function undulate(pts, t, amp, ph, hz = 2.2) {
  const n = pts.length;
  return pts.map((p, k) => {
    const a = pts[Math.max(0, k - 1)], b = pts[Math.min(n - 1, k + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1];
    const tn = Math.hypot(tx, ty) || 1; tx /= tn; ty /= tn;
    const u = k / (n - 1), w = amp * (0.2 + u * u) * Math.sin(TAU * hz * t - 4.2 * u + ph);
    return [p[0] - ty * w, p[1] + tx * w];
  });
}

function drawKoi(ctx, pts, a, k, j, t, dim, glint = 1, kindOf = -1) {
  const hourFish = k < 2, seed = kit.hash(k, j, 9);
  const kind = kindOf >= 0 ? kindOf : Math.floor(kit.hash(k, j, 7) * 4);
  const body = undulate(pts, t, 1.1, seed * TAU);
  // the fish is deeper (tinted by the water) while it surfaces or dives
  const deep = 1 - a;
  drawBody(ctx, body, fishR, (u, dn, l) => {
    let c = koiColour(hourFish, kind, u, seed);
    const fin = u > 0.8, head = u < 0.14;
    let b = (fin ? 0.22 : lerp(0.85, 0.4, u)) * (1 - 0.45 * dn * dn);
    // sunlight through the ripples catches the scales
    const sc = 0.45 * ctx.state.caus[l.i] * glint;
    c = kit.mix(c, [0.25, 0.55, 0.6], 0.6 * deep);
    return kit.scale(kit.mix(c, [1, 1, 1], fin ? 0.15 : 0.5 * sc), b * (1 + 1.2 * sc) * dim);
  }, Math.min(1, a * 1.15));
}

// ------------------------------------------------------- golden koi leap
const LEAP = [[-21, 19.5], [-15, 8], [-8.5, -4.5], [2, -23]];
const LEAP_T = (i) => -1.95 + i * 0.6;          // hop i starts (s before the dragon's birth)
function koiLeap(tr) {                          // head position, tr = time - birth
  if (tr < LEAP_T(0)) return lerp2([-4, 21.5], LEAP[0], kit.ease.inOut(clamp((tr + KOI_LEAD) / (KOI_LEAD + LEAP_T(0)))));
  for (let i = 0; i < 3; i++) {
    const s = LEAP_T(i);
    if (tr < s + 0.48) return lerp2(LEAP[i], LEAP[i + 1], kit.ease.inOut(clamp((tr - s) / 0.48)));
    if (i < 2 && tr < LEAP_T(i + 1)) { const p = (tr - s - 0.48) / 0.12; return [LEAP[i + 1][0] - 0.6 * p, LEAP[i + 1][1] + 1.2 * p]; }
  }
  return LEAP[3];
}
const hopHeight = (tr) => { for (let i = 0; i < 3; i++) { const p = (tr - LEAP_T(i)) / 0.48; if (p > 0 && p < 1) return Math.sin(Math.PI * p); } return 0; };

// ----------------------------------------------------------------- frog
/** Where the frog is: on its pad, or leaping to the changed minute, or paddling home. */
function frogAt(now, evC, evN) {
  const f = { x: SEAT[0], y: SEAT[1], hd: 0, sc: 1, a: 1, under: false, ext: 0 };
  if (!evN.hour) {
    const u = now - evN.M, O = evN.O;
    if (u > -0.8 && u < -0.55) f.sc = 1 - 0.12 * smoothstep(-0.8, -0.6, u);
    else if (u >= -0.55) {
      const p = (u + 0.55) / 0.55, e = 0.75 * p + 0.25 * smoothstep(0, 1, p), h = Math.sin(Math.PI * p);
      Object.assign(f, { x: lerp(SEAT[0], O[0], e), y: lerp(SEAT[1], O[1], e) - 3 * h, sc: 1 + 0.5 * h, ext: 1 });
    }
  }
  if (!evC.hour) {
    const u = now - evC.M, O = evC.O, R = [77, 3.5];
    if (u < 0.4) Object.assign(f, { x: O[0], y: O[1], a: lerp(1, 0.3, u / 0.4), under: true, ext: 0.6 });
    else if (u < 2.5) {
      const p = (u - 0.4) / 2.1, e = clamp(kit.ease.inOut(p) + 0.035 * Math.sin(TAU * 4 * p) * (1 - p));
      Object.assign(f, { x: lerp(O[0], R[0], e), y: lerp(O[1], R[1], e) + 1.5 * Math.sin(TAU * p), hd: Math.PI, a: 0.3, under: true, ext: 0.5 + 0.5 * Math.sin(TAU * 4 * p) });
    } else if (u < 3.1) {
      const p = (u - 2.5) / 0.6, e = kit.ease.inOut(p);
      Object.assign(f, { x: lerp(R[0], SEAT[0], e), y: lerp(R[1], SEAT[1], e), hd: Math.PI * (1 + e), a: lerp(0.3, 1, e), under: p < 0.35, sc: 1 + 0.12 * Math.sin(Math.PI * p) });
    }
  }
  return f;
}
function drawFrog(ctx, f, now, t, dim) {
  const c = Math.cos(f.hd), s = Math.sin(f.hd), S = f.sc;
  const P = (fx, fy) => [f.x + (fx * c - fy * s) * S, f.y + (fx * s + fy * c) * S];
  const tint = f.under ? kit.mix(FROG, [0.05, 0.3, 0.35], 0.5) : FROG;
  const a = f.a * dim, breathe = 0.92 + 0.08 * Math.sin(TAU * t);
  const sp = (fx, fy, r, col, k) => { const [x, y] = P(fx, fy); kit.splat(ctx, x, y, r * S, col, a * k); };
  // back legs folded at the sides, or kicked out behind
  for (const side of [-1, 1]) {
    sp(lerp(-4.5, -9, f.ext), side * lerp(6.2, 2.8, f.ext), 2.2, FROG2, 1.1);
    sp(3, side * 5.6, 1.5, FROG2, 0.6);
  }
  sp(-0.5, 0, 3.8, tint, 0.5 * breathe);
  sp(3.8, 0, 2.9, tint, 0.35);
  // the eyes are the colon: they blink now and then
  const bl = kit.fract(now / 5.3 + 0.37) < 0.035 ? 0.15 : 1;
  for (const side of [-1, 1]) sp(4, side * RS, 2.3, f.under ? kit.mix(EYE, FROG, 0.6) : EYE, 0.85 * bl);
}

// ---------------------------------------------------------------- pads
const PADS = [[0, -22.6, 4.2, 0], [64, -22.6, 3.6, 1], [118, -22.6, 4.4, 0], [30, 22.6, 4.0, 0], [100, 22.6, 3.8, 2]];
function drawPads(ctx, now, t, dim) {
  for (const [x0, y, r, kind] of PADS) {
    const x = mod(x0 + 1.4 * now, 200) - 34, rot = 0.3 * now + x0;
    for (const i of ctx.layout.index.near(x, y, r + 1)) {
      const l = ctx.leds[i], d = Math.hypot(l.x - x, l.y - y), ang = mod(Math.atan2(l.y - y, l.x - x) - rot, TAU);
      if (ang < 0.5 && d > r * 0.25) continue;                         // the notch
      kit.over(ctx, i, d > r - 1.4 ? LEAF2 : LEAF, dim * (1 - smoothstep(r - 0.6, r + 1, d)));
    }
    if (kind === 1) kit.splat(ctx, x + 0.5, y, 2.6, LOTUS, 0.22 * dim * (0.85 + 0.15 * Math.sin(t * 0.7)));
    if (kind === 2) kit.splat(ctx, x - 1, y + 0.5, 2.2, [1, 0.9, 0.8], 0.12 * dim);
  }
  // the frog's own pad, bobbing a little
  const bx = PADC[0] + 0.5 * Math.sin(t * 0.6), by = PADC[1] + 0.4 * Math.sin(t * 0.47);
  for (const i of ctx.layout.index.near(bx, by, 10.5)) {
    const l = ctx.leds[i], d = Math.hypot(l.x - bx, l.y - by), ang = Math.atan2(l.y - by, l.x - bx);
    if (Math.abs(ang - 2.4) < 0.3 && d > 2) continue;
    kit.over(ctx, i, d > 7.5 ? LEAF2 : LEAF, dim * (1 - smoothstep(8.6, 10.2, d)));
  }
}

// --------------------------------------------------------------- dragon
const dragonR = (u) => (u < 0.05 ? 3.4 : u < 0.1 ? lerp(3.4, 2.1, (u - 0.05) / 0.05) : u < 0.2 ? lerp(2.1, 2.6, (u - 0.1) / 0.1) : u < 0.62 ? 2.6 : u < 0.93 ? lerp(2.6, 0.8, (u - 0.62) / 0.31) : lerp(0.8, 2.4, (u - 0.93) / 0.07));
function drawDragon(ctx, ev, now, t, dim) {
  const tr = now - ev.B;
  if (tr < 0 || tr > DR.end) return;
  const sh = DR.sAt(tr);
  let pts = [];
  for (let k = 0; k < ND; k++) pts.push(along(DR.p, sh - (k / (ND - 1)) * LD, false));
  pts = undulate(pts, t, 2.2, 0, 1.4);
  const grow = smoothstep(0, 0.35, tr);
  // claws: four little paddling feet
  for (const [u, ph] of [[0.2, 0], [0.5, Math.PI]]) {
    const k = Math.round(u * (ND - 1)), a = pts[k], b = pts[k + 1], tx = b[0] - a[0], ty = b[1] - a[1], tn = Math.hypot(tx, ty) || 1;
    for (const side of [-1, 1]) {
      const sw = 1.5 * Math.sin(t * 9 + ph + side);
      kit.splat(ctx, a[0] - (ty / tn) * side * 3.6 + (tx / tn) * sw, a[1] + (tx / tn) * side * 3.6 + (ty / tn) * sw, 1.7, VERM, 0.4 * dim * grow);
    }
  }
  drawBody(ctx, pts, dragonR, (u, dn, l) => {
    if (u < 0.06) return kit.scale(kit.mix(PLAT, [1, 1, 1], 0.3), 0.85 * dim);
    if (u > 0.93) return kit.scale(VERM, 0.6 * dim);
    const scale = 0.5 + 0.5 * Math.sin(u * LD * 1.5 - t * 16);
    const c = dn > 0.7 ? VERM : kit.mix(GOLD, PLAT, 0.45 * scale * (1 - dn));
    return kit.scale(c, (0.5 + 0.35 * scale + 0.4 * ctx.state.caus[l.i]) * dim);
  }, grow);
  // whiskers, streaming back from the snout
  const h = pts[0], n1 = pts[2], tx = h[0] - n1[0], ty = h[1] - n1[1], tn = Math.hypot(tx, ty) || 1;
  for (const side of [-1, 1]) for (let q = 1; q <= 4; q++) {
    const back = q * 2.6, lat = side * (2 + q * 1.1 + 0.9 * Math.sin(t * 7 - q + side));
    kit.splat(ctx, h[0] - (tx / tn) * back - (ty / tn) * lat, h[1] - (ty / tn) * back + (tx / tn) * lat, 1.3, VERM, 0.35 * dim * grow * (1 - q / 5));
  }
  // the pearl it chases
  const pe = along(DR.p, sh + 9 + 2 * Math.sin(t * 3), false);
  kit.splat(ctx, pe[0], pe[1], 3.2, PEARL, (0.5 + 0.15 * Math.sin(t * 11)) * dim * grow);
}

// ---------------------------------------------------------------- frame
export default {
  name: 'Koi', blurb: 'the time swum by schools of koi, a frog for a colon; at the hour a golden koi climbs the falls and becomes a dragon',
  layouts: ['tri-ribbon'], look: { look: 'opal', gap: 2.0 }, fps: 60, brightness: 0.6, dither: true,
  frame(ctx) {
    const { t, leds } = ctx, now = ctx.date.getTime() / 1000;
    const Mc = Math.floor(now / 60) * 60, evC = eventOf(Mc), evN = eventOf(Mc + 60);
    const dim = 1 - 0.7 * ctx.night, st = ctx.state;
    if (!st.caus) st.caus = new Float32Array(ctx.n);

    // ripples: the frog's plop, the golden koi's landings, the dragon's birth
    const rip = [];
    if (!evC.hour) rip.push([evC.O[0], evC.O[1], evC.M, 1]);
    for (const ev of [evC, evN]) if (ev.hour) {
      for (let i = 0; i < 3; i++) rip.push([LEAP[i + 1][0], LEAP[i + 1][1], ev.B + LEAP_T(i) + 0.48, 0.5]);
      rip.push([LEAP[3][0], LEAP[3][1], ev.B, 1]);
    }
    const live = rip.filter((r) => now - r[2] > 0 && now - r[2] < 2.4);

    // water: caustics drifting with the current, foam at the falls' lip
    for (const l of leds) {
      // the current: faint streaks running along the lattice's straight rows
      const row = Math.round(rowOf(l.y));
      let c = smoothstep(0.62, 0.95, kit.noise2((l.x - 7 * t - row * 13) * 0.045, row * 1.7 + t * 0.04));
      const slot = Math.floor(t * 3 + kit.hash(l.i, 5) * 40), g = kit.hash(l.i, slot, 11);
      if (g > 0.993) c += 1.4 * Math.sin(Math.PI * kit.fract(t * 3 + kit.hash(l.i, 5) * 40));
      let w = 0;
      for (const [x, y, t0, amp] of live) {
        const age = now - t0, R = 3 + 30 * age, rho = Math.hypot(l.x - x, l.y - y);
        const k = amp * (1 - age / 2.4) ** 2 * (14 / (14 + R));
        w += k * (Math.exp(-(((rho - R) / 1.7) ** 2)) + 0.5 * Math.exp(-(((rho - R + 8) / 1.7) ** 2)));
      }
      // the falls: white water streaming down the slanted lip, spray spilling into the pool
      const e = l.x - xLeft(l.y);
      const f = Math.exp(-e / 2.2) * (0.04 + 0.9 * smoothstep(0.5, 0.92, kit.noise2(e * 0.5, l.y * 0.18 - t * 2.6)))
        + Math.exp(-e / 6) * 0.35 * smoothstep(0.7, 0.95, kit.noise2(l.y * 0.3, e * 0.25 - t * 1.6));
      st.caus[l.i] = c + 0.8 * w;
      const o = 3 * l.i;
      ctx.out[o] = (WATER[0] + c * CAUS[0] + w * RIPPLE[0] + f * FOAM[0]) * dim;
      ctx.out[o + 1] = (WATER[1] + c * CAUS[1] + w * RIPPLE[1] + f * FOAM[1]) * dim;
      ctx.out[o + 2] = (WATER[2] + c * CAUS[2] + w * RIPPLE[2] + f * FOAM[2]) * dim;
    }
    drawPads(ctx, now, t, dim);
    const frog = frogAt(now, evC, evN);
    if (frog.under) drawFrog(ctx, frog, now, t, dim);

    // the numerals: schools swimming their routes, or regrouping
    for (let k = 0; k < 4; k++) {
      let ev = null;
      if (evN.slots[k] && now >= evN.slots[k].T0) ev = evN;
      else if (evC.slots[k] && now < evC.slots[k].T2) ev = evC;
      if (ev) {
        for (const m of moversOf(ev, k)) {
          const a = m.A(now);
          if (a > 0.02) drawKoi(ctx, m.body(now), a, k, m.j, t, dim);
        }
      } else {
        const g = GL[evC.b[k]];
        for (let j = 0; j < g.n; j++) {
          const s = sOf(g, j, now, k), a = aOf(g, s);
          if (a > 0.02) drawKoi(ctx, bodyOn(g, s, SLOTS[k]), a, k, j, t, dim);
        }
      }
    }

    // the hour: golden koi up the falls, then the dragon
    for (const ev of [evC, evN]) {
      if (!ev.hour) continue;
      const tr = now - ev.B;
      if (tr > -KOI_LEAD && tr < 0) {
        const a = smoothstep(-KOI_LEAD, -KOI_LEAD + 0.6, tr) * (1 - smoothstep(-0.12, 0, tr));
        const hop = hopHeight(tr), body = trail((tau) => koiLeap(tau - ev.B), now, 19);
        kit.splat(ctx, body[1][0], body[1][1], 6 + 3 * hop, GOLD, 0.12 * a * dim * (1 + hop));
        drawKoi(ctx, body.map((q) => [q[0], q[1]]), a, 0, 0, t, dim * (1.15 + 0.8 * hop), 2, 3);
      }
      if (tr >= 0 && tr < 0.6) kit.splat(ctx, LEAP[3][0], LEAP[3][1], 3 + 16 * tr, PLAT, 0.9 * (1 - tr / 0.6) ** 2 * dim);
      drawDragon(ctx, ev, now, t, dim);
    }

    if (!frog.under) drawFrog(ctx, frog, now, t, dim);
    // the plop
    const age = now - evC.M;
    if (!evC.hour && age < 0.6) {
      const [ox, oy] = evC.O;
      kit.splat(ctx, ox, oy, 3 + 8 * age, [0.8, 0.95, 1], 0.6 * (1 - age / 0.6) ** 2 * dim);
      for (let i = 0; i < 6; i++) {
        const an = (i / 6) * TAU + kit.hash(evC.M, i) * 0.8, r = 3 + 16 * kit.ease.out(age / 0.6);
        kit.splat(ctx, ox + Math.cos(an) * r, oy + Math.sin(an) * r, 1.8, [0.7, 0.9, 1], 0.5 * (1 - age / 0.6) * dim);
      }
    }
    // black is black: drop the faint fringes a WS2812B-V5 would not show anyway
    const o = ctx.out, cut = 3 / 255 / 0.6;
    for (let i = 0; i < o.length; i += 3) if (o[i] < cut && o[i + 1] < cut && o[i + 2] < cut) o[i] = o[i + 1] = o[i + 2] = 0;
  },
};
