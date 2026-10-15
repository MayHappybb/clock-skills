// Volcano: the big triangle is a volcano at night, and the time is its lava.
//
// The lattice here has straight horizontal rows and straight 60-degree
// lines, the same angle as the mountain's own flanks; verticals can only
// meander. So the numerals are lava channels drawn for that: flat crusts,
// 60-degree chutes, meandering verticals. Every digit is a little drainage
// network: lava enters at its top and runs down through it, always moving.
//
// The plumbing is one system: the crater at the apex feeds a lava tube that
// splits into a Λ parallel to the flanks; each leg feeds an hour digit, which
// drains out of its foot into the minute digit below it.
//
// Minute turn: a rumble, a hot surge leaves the crater, runs down the tube,
// flushes visibly through the hour digit and pours into the minute digit
// whose value changed: the old channel crusts over and goes black while fresh
// lava runs down the new one. Hour: a strombolian eruption: the crater blows,
// a fan of glowing bombs rains down the cone, lava overflows the rim and races
// down both flanks, outlining the mountain. Those flows then cool through the
// hour, from molten to a few glowing cracks by :59. Between turns hot pulses
// run down through every digit, crust rafts drift, the crater lake churns,
// and now and then a hot rock tumbles down a flank.
//
// Look: smoke. Lava seen at night is points of fire on black; the acrylic
// hides the board so the cone exists only where it glows. Opal at any useful
// gap smeared the 1-LED channels into mush.
//
// Stateless: everything is a closed-form function of the wall clock.
import * as kit from '../js/kit.js';

const RH = 2 * Math.sqrt(3);          // row step, mm
const UNIT = 4;                       // mm between lattice neighbours
const EPOCH = 1.7e9;                  // keeps noise arguments small

// ------------------------------------------------------------------ font
// 9 rows; per row the u (half-pitch) positions, 0..8. Even rows use even u,
// odd rows odd u: flats are rows, chutes are 60-degree lines, and a
// vertical has to meander.
const FONT = {
  0: [[2, 4, 6], [1, 7], [0, 8], [1, 7], [0, 8], [1, 7], [0, 8], [1, 7], [2, 4, 6]],
  1: [[4], [3], [2, 4], [3], [4], [3], [4], [3], [2, 4, 6]],
  2: [[2, 4, 6], [1, 7], [8], [7], [6], [5], [4], [3], [0, 2, 4, 6, 8]],
  3: [[2, 4, 6], [1, 7], [8], [7], [4, 6], [7], [8], [1, 7], [2, 4, 6]],
  4: [[6], [5, 7], [4, 6], [3, 7], [2, 6], [1, 7], [0, 2, 4, 6, 8], [7], [6]],
  5: [[0, 2, 4, 6, 8], [1], [0], [1, 3, 5], [6], [7], [8], [1, 7], [2, 4, 6]],
  6: [[4, 6], [3], [2], [1], [0, 2, 4, 6], [1, 7], [0, 8], [1, 7], [2, 4, 6]],
  7: [[0, 2, 4, 6, 8], [7], [6], [5], [4], [3], [4], [3], [4]],
  8: [[2, 4, 6], [1, 7], [0, 8], [1, 7], [2, 4, 6], [1, 7], [0, 8], [1, 7], [2, 4, 6]],
  9: [[2, 4, 6], [1, 7], [0, 8], [1, 7], [2, 4, 6, 8], [7], [6], [5], [4]],
};

// Digit boxes: top-left lattice cell (q, r). Hours hang from the Λ's feet;
// minutes sit under them on the wide part of the cone.
const SLOTS = [[-11, 11], [3, 11], [-13, 21], [3, 21]];

const VP = 70;                        // a surge in the tubes, mm/s
const VF = 34;                        // a fresh lava front in a digit, mm/s
const VT = 8;                         // the steady flow, mm/s

const pad = (n) => String(n).padStart(2, '0');
const digitsAt = (sec) => { const d = new Date(sec * 1000); return pad(d.getHours()) + pad(d.getMinutes()); };

// ------------------------------------------------------------- geometry
/** A polyline in mm with arc length. */
function poly(pts) {
  const cum = [0];
  for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
  return {
    pts, cum, len: cum[cum.length - 1],
    at(s) {
      let k = 1;
      while (k < pts.length - 1 && cum[k] < s) k++;
      const u = kit.clamp((s - cum[k - 1]) / (cum[k] - cum[k - 1] || 1));
      return [kit.lerp(pts[k - 1][0], pts[k][0], u), kit.lerp(pts[k - 1][1], pts[k][1], u)];
    },
  };
}

/** LEDs along a polyline (within R mm): [{ i, s, w }], s = arc length at the LED. */
function tubeCells(ctx, P, R = 2.2) {
  const best = new Map();
  for (let k = 1; k < P.pts.length; k++) {
    const [ax, ay] = P.pts[k - 1], [bx, by] = P.pts[k];
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
    for (const i of ctx.layout.index.near((ax + bx) / 2, (ay + by) / 2, Math.sqrt(L2) / 2 + R)) {
      const l = ctx.leds[i], u = kit.clamp(((l.x - ax) * dx + (l.y - ay) * dy) / L2);
      const d = Math.hypot(l.x - ax - u * dx, l.y - ay - u * dy);
      if (d <= R && !(best.get(i)?.d <= d)) best.set(i, { i, d, s: P.cum[k - 1] + u * Math.sqrt(L2), w: 1 - (d / R) ** 2 });
    }
  }
  return [...best.values()];
}

const geo = new Map();
function geometry(ctx) {
  const L = ctx.layout;
  if (geo.has(L.key)) return geo.get(L.key);
  const yA = Math.min(...L.leds.map((l) => l.y));
  const cell = new Map(), row = [];
  for (const l of L.leds) {
    const r = Math.round((l.y - yA) / RH), q = Math.round(l.x / 2);
    cell.set(q * 1000 + r, l.i);
    row[l.i] = r;
  }
  const pos = (q, r) => [2 * q, yA + r * RH];
  const at = (q, r) => cell.get(q * 1000 + r) ?? -1;
  // the outermost LED of every row on each side: the flanks
  const rows = [];
  for (const l of L.leds) (rows[row[l.i]] ??= []).push(l);
  const flank = [0, 1].map((side) => {
    const e = rows.map((r) => r.reduce((b, l) => ((side ? l.x > b.x : l.x < b.x) ? l : b)));
    let s = 0;
    return e.map((l, k) => { if (k) s += Math.hypot(l.x - e[k - 1].x, l.y - e[k - 1].y); return { i: l.i, x: l.x, y: l.y, s }; });
  });
  const inlet = [pos(-6, 10), pos(6, 10), pos(SLOTS[2][0] + 4, SLOTS[2][1] - 1), pos(SLOTS[3][0] + 4, SLOTS[3][1] - 1)];
  const g = {
    yA, row, pos, at, flank, inlet, glyphs: new Map(), conns: new Map(),
    crater: L.leds.filter((l) => row[l.i] <= 3).map((l) => l.i),
    sky: L.leds.filter((l) => row[l.i] <= 10).map((l) => l.i),
    T: new Float32Array(L.n),
  };
  // the tube: crater down to the split, then a Λ leg to each hour digit
  // the flows down the flanks: hugging the edge past the hours, then
  // wandering out onto the apron and splitting into two toes
  g.rivers = [0, 1].map((side) => {
    const sg = side ? -1 : 1, F = flank[side];
    const inset = (r) => (r < 15 ? 0.3 : 0.3 + 2.2 * (1 - Math.cos((r - 15) * 0.5)));
    const main = poly(F.slice(2).map((l, k) => [l.x + sg * inset(k + 2), l.y]));
    main.cells = tubeCells(ctx, main, 2.1);
    return [main];
  });
  g.legs = [0, 1].map((k) => { const P = poly([pos(0, 1), pos(0, 4), inlet[k]]); P.cells = tubeCells(ctx, P); return P; });
  geo.set(L.key, g);
  return g;
}

/** Digit d in slot k: cells [{ i, x, s }] with s the flow distance (mm) from the slot's inlet. */
function glyph(ctx, g, k, d) {
  const key = k * 10 + d;
  if (g.glyphs.has(key)) return g.glyphs.get(key);
  const [q0, r0] = SLOTS[k];
  const cells = [];
  FONT[d].forEach((us, v) => us.forEach((u) => {
    const i = g.at(q0 + u, r0 + v);
    if (i >= 0) cells.push({ i, u, v, x: ctx.leds[i].x, y: ctx.leds[i].y, s: Infinity });
  }));
  const near = ([x, y]) => cells.reduce((b, c) => (Math.hypot(c.x - x, c.y - y) < Math.hypot(b.x - x, b.y - y) ? c : b));
  const [sx, sy] = g.inlet[k], src = near(g.inlet[k]);
  src.s = Math.hypot(src.x - sx, src.y - sy);
  // the lava spreads from the source through neighbouring cells
  const queue = [src];
  while (queue.length) {
    queue.sort((a, b) => a.s - b.s);
    const c = queue.shift();
    for (const n of cells) {
      const dd = Math.hypot(n.x - c.x, n.y - c.y);
      if (dd < UNIT * 1.2 && c.s + dd < n.s) { n.s = c.s + dd; queue.push(n); }
    }
  }
  const exit = near(g.pos(q0 + 4, r0 + 8));
  const out = { cells, exit };
  g.glyphs.set(key, out);
  return out;
}

/** The short tube from hour digit d's foot (side 0|1) to the minute digit below. */
function connector(ctx, g, side, d) {
  const key = side * 10 + d;
  if (g.conns.has(key)) return g.conns.get(key);
  const ex = glyph(ctx, g, side, d).exit;
  const P = poly([[ex.x, ex.y], g.inlet[2 + side]]);
  P.cells = tubeCells(ctx, P).filter((c) => c.s > 1);
  g.conns.set(key, P);
  return P;
}

// --------------------------------------------------------------- events
/**
 * The turn at epoch second B: which digits change, and for each a surge that
 * leaves the crater so as to reach that digit's inlet just after B.
 */
const events = new Map();
function event(ctx, g, B) {
  if (events.has(B)) return events.get(B);
  const prev = digitsAt(B - 60), next = digitsAt(B);
  const E = { B, prev, next, hour: new Date(B * 1000).getMinutes() === 0, surges: [] };
  E.changed = [0, 1, 2, 3].map((k) => prev[k] !== next[k]);
  for (let k = 0; k < 4; k++) {
    if (!E.changed[k]) continue;
    const side = k % 2, leg = g.legs[side];
    const arr = B + 0.12 + (side ? 0 : 0.35);
    let total = leg.len, flush = null, conn = null;
    if (k >= 2) {
      flush = glyph(ctx, g, side, +prev[side]);
      conn = connector(ctx, g, side, +prev[side]);
      total += flush.exit.s + conn.len;
    }
    E.surges.push({ k, side, arr, dep: arr - total / VP, leg, flush, conn, total });
  }
  E.arr = [0, 1, 2, 3].map((k) => E.surges.find((s) => s.k === k)?.arr ?? B);
  if (events.size > 8) events.delete(events.keys().next().value);
  events.set(B, E);
  return E;
}

// ---------------------------------------------------------------- colour
const LUT = [];
for (let k = 0; k <= 300; k++) LUT.push(kit.blackbody(600 + k * 10));
/** Lava at temperature T (K): black-body colour, brightness rising steeply with heat. */
function lava(T) {
  const c = LUT[Math.max(0, Math.min(300, Math.round((T - 600) / 10)))];
  const b = kit.clamp((T - 760) / 1040) ** 1.6;
  return [c[0] * b, c[1] * b, c[2] * b];
}

/** A digit cell's temperature in the steady flow: crust plates drift down the channel, seams glow. */
function flowT(c, k, t) {
  const plate = kit.noise2((c.s - VT * t) / 6.5, c.x * 0.09 + k * 7.1);
  const seam = 1 - kit.smoothstep(0.02, 0.11, Math.abs(plate - 0.5));
  const crust = kit.smoothstep(0.5, 0.78, plate);
  // and every few seconds a hotter pulse runs down through every branch at once
  const ph = (t + k * 1.37) / 3.6, sp = (ph - Math.floor(ph)) * 3.6 * 16 - 6;
  const pulse = Math.exp(-(((c.s - sp) / 5) ** 2));
  return 1200 + 300 * seam - 200 * crust + 400 * pulse + 60 * (kit.noise2(t * 0.8, c.i * 0.71) - 0.5);
}

/** A glowing body at (x, y) with a short trail behind it (prev positions given by fn). */
function streak(ctx, fn, T, a, r = 3.2, n = 4) {
  for (let j = 0; j < n; j++) {
    const p = fn(j * 0.03);
    if (!p) return;
    kit.splat(ctx, p[0], p[1], r * (1 - 0.5 * j / n), lava(T - 500 * j / n), a * (1 - 0.8 * j / n));
  }
}

export default {
  name: 'Volcano',
  blurb: 'the cone is a volcano; the time is lava channels fed from the crater, rewritten by surges, the hour by an eruption',
  layouts: ['tri-mountain'], look: 'smoke', fps: 60, brightness: 0.85, dither: true,
  frame(ctx) {
    const g = geometry(ctx), T = g.T;
    const now = ctx.date.getTime() / 1000, t = now - EPOCH;
    const M = Math.floor(now / 60) * 60, age = now - M;
    const dim = 1 - 0.75 * ctx.night;
    T.fill(0);
    const heat = (i, k) => { if (k > T[i]) T[i] = k; };
    const E0 = event(ctx, g, M), E1 = event(ctx, g, M + 60), evs = [E0, E1];

    // rumble before each turn, much longer and stronger before an hour
    let rumble = 0, erupt = 0;
    for (const E of evs) {
      const d = now - E.B;
      const r = kit.smoothstep(E.hour ? -6 : -2.6, -0.2, d) * (1 - kit.smoothstep(0.3, E.hour ? 5 : 1.6, d));
      rumble = Math.max(rumble, r * (E.hour ? 1 : 0.5));
      if (E.hour) erupt = Math.max(erupt, kit.smoothstep(-0.4, 0.15, d) * (1 - kit.smoothstep(2, 6, d)));
    }
    const shake = rumble * (kit.noise2(t * 13, 3.3) - 0.5) * 2;

    // ---- the digits
    for (let k = 0; k < 4; k++) {
      const Gn = glyph(ctx, g, k, +E0.next[k]);
      if (E0.changed[k] && age < 6) {
        // the old channel crusts over: fast at first, its cracks last
        for (const c of glyph(ctx, g, k, +E0.prev[k]).cells) {
          const slow = kit.hash(c.i, M) < 0.3 ? 2.4 : 1;
          const u = kit.ease.out(kit.clamp(age / (0.85 * slow)));
          heat(c.i, kit.lerp(flowT(c, k, t), 700, u));
        }
        // the fresh lava runs down the new one, hottest just behind its front
        const f = (now - E0.arr[k]) * VF;
        for (const c of Gn.cells) {
          const a = kit.clamp((f - c.s) / 4 + 0.5);
          if (a <= 0) continue;
          const fresh = 520 * Math.exp(-Math.max(0, f - c.s) / (VF * 1.3));
          heat(c.i, kit.lerp(700, flowT(c, k, t) + fresh + 60 * shake, a));
        }
      } else {
        for (const c of Gn.cells) heat(c.i, flowT(c, k, t) + 60 * shake);
      }
    }

    // ---- the tubes: crusted over, a slow trickle glimpsed through skylights
    const tube = (P, phase) => {
      for (const c of P.cells) {
        const b = 0.5 + 0.5 * Math.sin((c.s - 13 * t) / 3.2 + phase);
        heat(c.i, 800 + (140 * b ** 4 + 60 * rumble) * c.w);
      }
    };
    tube(g.legs[0], 0); tube(g.legs[1], 1.7);
    tube(connector(ctx, g, 0, +E0.next[0]), 0.6); tube(connector(ctx, g, 1, +E0.next[1]), 2.3);

    // ---- surges: a hot slug racing down from the crater
    for (const E of evs) {
      for (const S of E.surges) {
        const p = (now - S.dep) * VP;
        if (p < 0 || p > S.total + 30) continue;
        const slug = (cs) => 1650 * Math.exp(-(((cs - p) / 5) ** 2)) + (cs < p ? 1250 * Math.exp(-(p - cs) / 14) : 0);
        for (const c of S.leg.cells) heat(c.i, Math.max(800, slug(c.s)) * (0.6 + 0.4 * c.w));
        if (!S.flush) continue;
        // through the hour digit without changing it, then down the connector
        const q = p - S.leg.len;
        if (q > -6 && q < S.flush.exit.s + 20) {
          const Gh = glyph(ctx, g, S.side, +(now < E.B ? E.prev : E.next)[S.side]);
          for (const c of Gh.cells) if (T[c.i] > 1000) T[c.i] += 520 * Math.exp(-(((c.s - q) / 6) ** 2));
        }
        const r = q - S.flush.exit.s;
        if (r > -6) for (const c of S.conn.cells) heat(c.i, Math.max(800, 1650 * Math.exp(-(((c.s - r) / 5) ** 2)) + (c.s < r ? 1150 * Math.exp(-(r - c.s) / 12) : 0)) * (0.6 + 0.4 * c.w));
      }
    }

    // ---- the crater: a churning lava lake, swelling before a turn
    for (const i of g.crater) {
      const l = ctx.leds[i];
      // crust rafts drift on the lake; the vent at the very top boils
      const n = kit.fbm(l.x * 0.3 + t * 0.25, l.y * 0.3 - t * 0.15, t * 0.5, 2);
      const vent = 1 - g.row[i] / 4;
      const spat = kit.hash(Math.floor(t * 6 + i * 0.3), i) > 0.93 ? 260 : 0;
      heat(i, 1050 + 520 * kit.smoothstep(0.3, 0.7, n) + 220 * vent + spat + 380 * rumble + 650 * erupt);
    }

    // ---- the hour: lava overflows the rim and races down both flanks
    // The flows stay on the flanks and cool through the hour: molten at :00,
    // a few glowing seams by :59.
    const hourAge = now - (M - ctx.date.getMinutes() * 60);
    for (const side of [0, 1]) {
      for (const [b, P] of g.rivers[side].entries()) for (const c of P.cells) {
        const cs = c.s + (P.s0 ?? 0);
        const ca = hourAge - 0.3 - cs / 28 - b * 0.6;
        const seamAt = (a) => 1 - kit.smoothstep(0.03, 0.13, Math.abs(kit.noise2((cs - 1.5 * t) / 6, side * 9 + b * 4 + Math.floor(a / 3600) * 3) - 0.5));
        const river = (a) => {
          // the body crusts over within half an hour; its cracks glow on
          const cool = (a / 3600) ** 0.4;
          return 1180 + 640 * Math.exp(-a / 1.4) - 430 * Math.min(1, 1.3 * cool) + (220 - 90 * cool) * seamAt(a);
        };
        let Tr = river(ca + 3600);
        if (ca > -0.15) Tr = Math.max(Tr, kit.lerp(700, river(Math.max(0, ca)), kit.clamp(ca / 0.15 + 1)));
        heat(c.i, 700 + (Tr - 700) * (0.55 + 0.45 * c.w));
      }
    }
    if (E0.hour && age < 70) {
      // ash over the summit, lit from the crater below
      const ash = kit.smoothstep(0.6, 3, age) * (1 - kit.smoothstep(9, 26, age));
      if (ash > 0) for (const i of g.sky) {
        const l = ctx.leds[i];
        const n = kit.fbm(l.x * 0.07, l.y * 0.07 + age * 0.25, t * 0.15, 3);
        heat(i, 760 + 260 * ash * kit.smoothstep(0.35, 0.8, n) * (1 - g.row[i] / 14));
      }
    }

    // temperature to light
    const o = ctx.out;
    for (let i = 0; i < ctx.n; i++) {
      if (T[i] <= 760) continue;
      const c = lava(T[i]);
      o[3 * i] += c[0] * dim; o[3 * i + 1] += c[1] * dim; o[3 * i + 2] += c[2] * dim;
    }

    // ---- bombs: a fan of incandescent rock raining down the cone
    const y0 = g.yA + 2;
    for (const E of evs) {
      const n = E.hour ? 26 : 3;
      for (let j = 0; j < n; j++) {
        const h = (s) => kit.hash(E.B, j, s);
        const t0 = E.hour ? E.B - 0.3 + 3.4 * h(1) ** 1.4 : E.B - 1.15 + 0.5 * h(1);
        const life = 0.9 + 0.9 * h(2), tau = now - t0;
        if (tau < 0 || tau > life) continue;
        const th = (h(3) < 0.5 ? -1 : 1) * (0.43 + 0.08 * h(6)), v0 = (E.hour ? 55 : 40) + 70 * h(4);
        const vx = v0 * Math.sin(th), vy = v0 * Math.cos(th) - 20 * h(5);
        const at = (back) => {
          const s = tau - back;
          if (s < 0) return null;
          return [vx * s, y0 + vy * s + 10 * s * s];
        };
        const fade = kit.smoothstep(0, 0.08, tau) * (1 - kit.smoothstep(life * 0.7, life, tau));
        streak(ctx, at, 2100 - 600 * tau / life, fade * dim * (E.hour ? 1.2 : 1), 4.4, 6);
      }
    }

    // ---- now and then a hot rock breaks off the summit and tumbles down a flank
    for (let n = Math.floor(t / 9) - 1; n <= Math.floor(t / 9); n++) {
      const t0 = n * 9 + 3 * kit.hash(n, 1), tau = t - t0;
      if (tau < 0 || tau > 3.6) continue;
      const side = kit.hash(n, 2) < 0.5 ? 0 : 1, F = g.flank[side], end = F[F.length - 1].s;
      const at = (back) => {
        const s = tau - back;
        if (s < 0) return null;
        const d = 8 + 4 * s + 8 * s * s;
        if (d > end) return null;
        let k = 1;
        while (k < F.length - 1 && F[k].s < d) k++;
        const u = (d - F[k - 1].s) / (F[k].s - F[k - 1].s || 1);
        const x = kit.lerp(F[k - 1].x, F[k].x, u), y = kit.lerp(F[k - 1].y, F[k].y, u);
        const hop = 2.6 * Math.abs(Math.sin(s * 5.5 + n));     // bouncing off the slope
        return [x + (side ? -1 : 1) * (1.5 + 0.5 * hop), y - hop];
      };
      streak(ctx, at, 1750 - 180 * tau, dim * (1 - kit.smoothstep(2.6, 3.6, tau)), 2.8);
    }

    // ---- embers lifting off the lava
    for (let j = 0; j < 5; j++) {
      const P = 4.3 + j * 0.37, n = Math.floor((t + j * 1.1) / P), tau = (t + j * 1.1) - n * P;
      const G = glyph(ctx, g, j % 4, +E0.next[j % 4]).cells;
      const c = G[Math.floor(kit.hash(n, j) * G.length)];
      const x = c.x + 3 * Math.sin(tau * 1.7 + j), y = c.y - 5.5 * tau;
      kit.splat(ctx, x, y, 2.4, lava(1650), 0.22 * dim * Math.sin(Math.PI * tau / P) ** 2);
    }
  },
};
