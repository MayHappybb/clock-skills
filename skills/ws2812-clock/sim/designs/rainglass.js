// Rain Glass: the leaning tower is a tall steamed-up window at night, four
// panes in a frame. Behind it a city: a neon sign high up, lit windows,
// sodium street lamps, cars. Through the fog it is only a dim smear.
//
// The time is written by water. A drop running through condensation clears a
// trail, and through that clear glass the city shows sharp and bright, so the
// digits glow with whatever is behind them: neon magenta in the hours up top,
// sodium amber and passing headlights in the minutes at street level. Each
// digit is the path one or two drops take, drawn on the board's own rhombic
// lattice: uprights run along the 61-degree columns (the rain's slant), bars
// along the rows. Drops run fast downhill and slow when the wind pushes them
// up or across.
//
// Always: small drops bead, grow and suddenly run down a column, stopping on
// the mullion of their pane and leaving a trail that fogs over again.
// Minute: the changed digit's film breaks and drips away down the slant while
// it fogs over; then a fat drop writes the new digit.
// Hour: lightning (and in its flashes, a tree frog on the window ledge), a
// downpour that streams down the glass and washes the changed digits off,
// drops rewriting them in the rain, then clearing.
//
// Stateless: everything is a closed-form function of the wall clock; glyph
// fields are cached per layout.
import * as kit from '../js/kit.js';

// ------------------------------------------------------------ geometry
// LED (a, b): a = column 0..15 (same across the tower, the boards are offset
// exactly one slant), b = 8.564 * pane + row: continuous along the column,
// with the mullion leaving a 1.56-row gap.
const P = 2.55, ANG = (61 * Math.PI) / 180;
const U = [P, 0], V = [-P * Math.cos(ANG), P * Math.sin(ANG)];
const K = 19.1 / V[1];               // rows per pane step
const BC = 1.5 * K + 3.5;            // b of the tower's centre
const world = (a, b) => [(a - 7.5) * U[0] + (b - BC) * V[0], (b - BC) * V[1]];
const T = K + 7, M = 7;              // glyph height (two panes), middle bar on pane's last row
// ------------------------------------------------------------ the digits
// Each digit is one or two drop paths, in lattice units (a 0..5, b 0..T).
// Chamfers are one lattice step, so they come out as the lattice's own
// 30- and 60-degree diagonals.
const GLYPHS = {
  0: [[[4, 0], [1, 0], [0, 1], [0, T - 1], [1, T], [4, T], [5, T - 1], [5, 1], [4, 0]]],
  1: [[[1, 2], [3, 0], [3, T]]],
  2: [[[0, 1.5], [1, 0], [4, 0], [5, 1], [5, 5], [0, T - 1], [0, T], [5, T]]],
  3: [[[0, 1], [1, 0], [4, 0], [5, 1], [5, M - 1], [4, M], [1.5, M]], [[1.5, M], [4, M], [5, M + 1], [5, T - 1], [4, T], [1, T], [0, T - 1]]],
  4: [[[4, 0], [0, 10], [5, 10]], [[4, 0], [4, T]]],
  5: [[[5, 0], [0, 0], [0, M], [4, M], [5, M + 1], [5, T - 1], [4, T], [0, T]]],
  6: [[[5, 1.5], [4, 0], [1, 0], [0, 1], [0, T - 1], [1, T], [4, T], [5, T - 1], [5, M + 1], [4, M], [0, M]]],
  7: [[[0, 0], [5, 0], [2, T]]],
  // drawn so that no part-traced 8 is another digit: upper loop, then the lower one leftwards
  8: [[[1, M], [0, M - 1], [0, 1], [1, 0], [4, 0], [5, 1], [5, M - 1], [4, M], [1, M], [0, M + 1], [0, T - 1], [1, T], [4, T], [5, T - 1], [5, M + 1], [4, M]]],
  9: [[[4, M], [1, M], [0, M - 1], [0, 1], [1, 0], [4, 0], [5, 1], [5, T - 1], [4, T], [0, T]]],
};
// digit slots: origin (a, b) of each digit's box
const SLOTS = [[1, 0], [9, 0], [1, 2 * K], [9, 2 * K]];

const STROKE_IN = 0.8, STROKE_OUT = 2.3;           // mm: full inside, gone outside
const strokeMask = (d) => kit.smoothstep(STROKE_OUT, STROKE_IN, d);

/** A glyph in a slot as world segments, with the drop's timing along it. */
const geoms = new Map();
function geom(digit, slot) {
  const key = digit * 4 + slot;
  if (geoms.has(key)) return geoms.get(key);
  const [a0, b0] = SLOTS[slot];
  const segs = [];
  let tc = 0;
  for (const path of GLYPHS[digit]) {
    tc += segs.length ? 0.35 : 0;                  // a second drop has to bead first
    for (let k = 0; k + 1 < path.length; k++) {
      const [ax, ay] = world(a0 + path[k][0], b0 + path[k][1]);
      const [bx, by] = world(a0 + path[k + 1][0], b0 + path[k + 1][1]);
      const len = Math.hypot(bx - ax, by - ay);
      // gravity: downhill quick, sideways steady, uphill slow (the wind pushing)
      const down = (by - ay) / len;
      const speed = 22 * (1 + 1.4 * Math.max(0, down) - 0.55 * Math.max(0, -down));
      segs.push({ ax, ay, bx, by, len, t0: tc, dt: len / speed, first: k === 0, last: k + 2 === path.length });
      tc += len / speed;
    }
  }
  // water left on the cleared trail beads up here and there along its edges
  const wet = [];
  for (let k = 0; k < 4; k++) {
    const sg = segs[Math.floor(kit.hash(digit, slot, k) * segs.length)], u = 0.15 + 0.7 * kit.hash(digit, slot, k + 9);
    const nx = -(sg.by - sg.ay) / sg.len, ny = (sg.bx - sg.ax) / sg.len, side = kit.hash(digit, k, 4) < 0.5 ? -1 : 1;
    wet.push([sg.ax + u * (sg.bx - sg.ax) + side * 0.9 * nx, sg.ay + u * (sg.by - sg.ay) + side * 0.9 * ny, sg.t0 + u * sg.dt, k]);
  }
  const g = { segs, total: tc, slot, digit, wet };
  geoms.set(key, g);
  return g;
}

/** Per-LED field of a glyph: distance to the path and when the drop passes. */
const fields = new Map();
function field(ctx, digit, slot) {
  const key = `${ctx.layout.key}/${digit}/${slot}`;
  if (fields.has(key)) return fields.get(key);
  const g = geom(digit, slot), n = ctx.n;
  const d = new Float32Array(n).fill(99), s = new Float32Array(n).fill(1e9), idx = [];
  for (const l of ctx.leds) {
    for (const sg of g.segs) {
      const dx = sg.bx - sg.ax, dy = sg.by - sg.ay;
      const u = kit.clamp(((l.x - sg.ax) * dx + (l.y - sg.ay) * dy) / (sg.len * sg.len));
      const dd = Math.hypot(l.x - sg.ax - u * dx, l.y - sg.ay - u * dy);
      if (dd < d[l.i]) d[l.i] = dd;
      if (dd < STROKE_OUT) s[l.i] = Math.min(s[l.i], sg.t0 + u * sg.dt);
    }
    if (d[l.i] < STROKE_OUT) idx.push(l.i);
  }
  const f = { d, s, idx, g };
  fields.set(key, f);
  return f;
}

/** Where the writing drop is after tau seconds of its path, and if it is moving. */
function dropAt(g, tau) {
  for (const sg of g.segs) {
    if (tau < sg.t0) return null;                 // between drops: the next one is beading
    if (tau <= sg.t0 + sg.dt) {
      const u = (tau - sg.t0) / sg.dt;
      return [sg.ax + u * (sg.bx - sg.ax), sg.ay + u * (sg.by - sg.ay)];
    }
  }
  return null;
}
/** Stroke ends, where drops come to rest as fat beads. */
function beadsOf(g) {
  const out = [];
  for (const sg of g.segs) if (sg.last) out.push([sg.bx, sg.by, sg.t0 + sg.dt]);
  for (const w of g.wet) out.push([w[0], w[1], w[2] + 0.3, 0.45]);
  return out;
}
// ------------------------------------------------------------ the city
const NEON = kit.hex('#ff1f8f'), CYAN = kit.hex('#19d6ff'), SODIUM = kit.hex('#ff8a1c');
const HEAD = kit.hex('#fff0d0'), TAIL = kit.hex('#ff1408'), WINDOW = kit.blackbody(2900);
const SIGNAL = [kit.hex('#20ff70'), kit.hex('#ffb000'), kit.hex('#ff2010')];
// what the clear glass shows away from any light: the sky lit by the neon up
// top, the wet street's sodium glow below
const HOURS_GLOW = kit.hex('#b04cff'), MINUTES_GLOW = kit.hex('#ff9a30');
const WATER = kit.hex('#d8ecff'), FLASH = kit.hex('#c8d8ff'), EYESHINE = kit.hex('#b8ff3a'), RAIN = kit.hex('#9fb8ff');

/** The lights behind the glass at time `now`: point or tube sources. */
function city(now) {
  const S = [];
  const add = (x, y, c, i, r, x2, y2, mist = 1) => S.push({ x, y, x2: x2 ?? x, y2: y2 ?? y, c, i, r, mist });
  // the neon blade sign high up, and a cyan shop sign; the blade buzzes sometimes
  const burst = kit.fract(now / 23) < 0.06;
  const buzz = burst && kit.hash(Math.floor(now * 18)) < 0.5 ? 0.25 : 1;
  add(23, -40, NEON, 0.95 * buzz, 2.6, 21, -15);
  add(-4, -27, CYAN, 0.55, 2.4, 9, -27);
  // distant lit windows, switching on and off over minutes
  for (let k = 0; k < 9; k++) {
    const on = kit.hash(k, Math.floor(now / 47 + k * 0.37)) > 0.35;
    if (on) add(-28 + 60 * kit.hash(k, 7), -12 + 11 * kit.hash(k, 9), WINDOW, 0.32, 1.8);
  }
  // sodium street lamps
  add(-24, 6, SODIUM, 0.9, 4); add(1, 3, SODIUM, 0.8, 4); add(25, 9, SODIUM, 0.9, 4);
  // a traffic signal: green, amber, red
  const ph = (now % 30) / 30, sig = ph < 0.55 ? 0 : ph < 0.65 ? 1 : 2;
  add(-31, 17, SIGNAL[sig], 0.6, 2.4);
  // traffic: headlights to the right on the near lane, taillights to the left
  for (let k = 0; k < 3; k++) {
    const x = -70 + ((now * 21 + 150 * kit.hash(k, 3) + 47 * k) % 150);
    add(x, 25, HEAD, 0.8, 2.4, x, 25, 0.35); add(x - 7, 25.5, HEAD, 0.8, 2.4, x - 7, 25.5, 0.35);
    const x2 = 70 - ((now * 15 + 150 * kit.hash(k, 5) + 61 * k) % 150);
    add(x2, 32, TAIL, 0.7, 2.2, x2, 32, 0.6); add(x2 + 7, 32, TAIL, 0.7, 2.2, x2 + 7, 32, 0.6);
  }
  return S;
}

/** Light reaching (x, y): sharp through clear glass, blurred through fog. */
function sample(S, x, y, sharp, fog) {
  sharp[0] = sharp[1] = sharp[2] = fog[0] = fog[1] = fog[2] = 0;
  for (const s of S) {
    let dx, dy;
    if (s.x2 === s.x && s.y2 === s.y) { dx = x - s.x; dy = y - s.y; }
    else {
      const ex = s.x2 - s.x, ey = s.y2 - s.y, u = kit.clamp(((x - s.x) * ex + (y - s.y) * ey) / (ex * ex + ey * ey));
      dx = x - s.x - u * ex; dy = y - s.y - u * ey;
    }
    const d2 = dx * dx + dy * dy;
    const rf = s.r + 11, qf = 1 - d2 / (rf * rf);
    if (qf <= 0) continue;
    const f = qf * qf * s.i * s.mist;
    fog[0] += s.c[0] * f; fog[1] += s.c[1] * f; fog[2] += s.c[2] * f;
    const qs = 1 - d2 / (s.r * s.r);
    if (qs > 0) { const g = Math.min(1, 2.2 * qs) * s.i; sharp[0] += s.c[0] * g; sharp[1] += s.c[1] * g; sharp[2] += s.c[2] * g; }
  }
}
// ------------------------------------------------------------ the drops
// Condensation drops: each slot repeats a cycle. A bead appears and grows
// where it is, then runs down its column with gravity (ease-in) until the
// mullion stops it, then soaks into the sill. Rain slots only join in a
// downpour, and run from the top of their pane.
const CALM = 14, STORM = 34;

function drops(now, rain) {
  const out = [];
  for (let d = 0; d < CALM + STORM; d++) {
    const storm = d >= CALM;
    if (storm && kit.hash(d, 77) > rain) continue;
    const Pd = storm ? 0.9 + 0.8 * kit.hash(d, 1) : 4.5 + 5 * kit.hash(d, 1);
    const tt = now + Pd * kit.hash(d, 2), c = Math.floor(tt / Pd), tau = tt - c * Pd;
    const a = Math.floor(kit.hash(d, c, 11) * 16), pane = Math.floor(kit.hash(d, c, 12) * 4);
    const j0 = storm ? -0.5 : Math.floor(kit.hash(d, c, 13) * 4);
    const grow = storm ? 0.05 : (0.3 + 0.25 * kit.hash(d, c, 14)) * Pd;
    const run = storm ? 0.22 + 0.15 * kit.hash(d, c, 15) : 0.55 + 0.5 * kit.hash(d, c, 15);
    out.push({ a, pane, j0, grow, run, tau, storm, end: Pd, stop: 7 });
  }
  return out;
}
/** Row of drop dr at cycle time tau (continuous). */
const dropRow = (dr, tau) => dr.j0 + (dr.stop - dr.j0) * kit.ease.in(kit.clamp((tau - dr.grow) / dr.run));
/** When the running drop passed row j (cycle time), or Infinity. */
function passTime(dr, j) {
  if (j < dr.j0) return Infinity;
  if (j > dr.stop) return Infinity;
  return dr.grow + dr.run * Math.cbrt((j - dr.j0) / (dr.stop - dr.j0));
}

// ------------------------------------------------------------ per layout
const lay = new Map();
function setup(ctx) {
  if (lay.has(ctx.layout.key)) return lay.get(ctx.layout.key);
  const grid = Array.from({ length: 16 }, () => Array.from({ length: 4 }, () => new Int32Array(8).fill(-1)));
  const ab = new Float32Array(ctx.n * 2);
  for (const l of ctx.leds) {
    grid[l.col][l.panel][l.row] = l.i;
    ab[2 * l.i] = l.col; ab[2 * l.i + 1] = l.panel * K + l.row;
  }
  const s = { grid, ab, sharp: new Float32Array(ctx.n * 3), fog: new Float32Array(ctx.n * 3), clear: new Float32Array(ctx.n), wet: new Float32Array(ctx.n) };
  lay.set(ctx.layout.key, s);
  return s;
}
// ------------------------------------------------------------ timeline
const pad = (n) => String(n).padStart(2, '0');
const digitsOf = (d) => pad(d.getHours()) + pad(d.getMinutes());
// minute turn (s): the old film drips off, beads condense on the new path,
// then the fat drop runs it
const MELT = 0.8, BEAD = 0.4, TRACE_AT = 1.1, TRACE = 1.6;
const H_MELT0 = 0.25, H_MELT = 1.0, H_TRACE_AT = 1.45, H_STEP = 0.25, H_TRACE = 2.0;
const SHOW = 9;                                                 // hour show length

// ------------------------------------------------------------ the frog
// A tree frog on the outside of the glass, seen from inside: belly, splayed
// legs, toe pads. It is only ever seen against lightning. Each hour it sits
// somewhere else on a mullion; by the strike's last flash it has climbed.
const FROG_PARTS = (() => {
  const P = [];
  const leg = (pts, pad) => { for (let k = 0; k + 1 < pts.length; k++) P.push(['s', ...pts[k], ...pts[k + 1], 1.3]); P.push(['c', ...pad, 1.8]); };
  for (const s of [-1, 1]) {
    leg([[s * 3, -2.5], [s * 7, -4.5], [s * 8.5, -8.5]], [s * 9, -9.5]);       // arms up
    leg([[s * 3.5, 3.5], [s * 9, 3.5], [s * 8, 8.5]], [s * 9.5, 9.5]);         // knees out, feet down
    P.push(['c', s * 2.8, -8, 2.1]);                                            // eyes
  }
  P.push(['e', 0, 1, 5, 6.2]);                                              // belly
  P.push(['c', 0, -5, 4.2]);                                                    // head
  return P;
})();
const FROG_S = 0.85;                                             // size: the frog spans most of a pane
function frogCover(x, y) {
  x /= FROG_S; y /= FROG_S;
  let d = 99;
  for (const p of FROG_PARTS) {
    let q;
    if (p[0] === 'c') q = Math.hypot(x - p[1], y - p[2]) - p[3];
    else if (p[0] === 'e') q = (Math.hypot((x - p[1]) / p[3], (y - p[2]) / p[4]) - 1) * Math.min(p[3], p[4]);
    else q = kit.segDist(x, y, p[1], p[2], p[3], p[4]) - p[5];
    if (q < d) d = q;
  }
  return kit.smoothstep(1.2, -0.6, d);
}
/** Where the frog is at this hour's strike: on the ledge, then after its climb. */
function frogAt(H, age) {
  const ledge = 2 + Math.floor(kit.hash(H, 31) * 2);             // which mullion: 2 or 3
  const side = kit.hash(H, 33) < 0.5 ? -1 : 1;
  const a = 7.5 - side * (1.5 + 2.5 * kit.hash(H, 32));
  const [x0, y0] = world(a, ledge * K - 0.8);
  // between the second and third flash it hops along the ledge
  const hop = kit.clamp((age - 0.3) / 0.18), e = kit.ease.inOut(hop);
  return [x0 + side * 9 * e, y0 - FROG_S * 5 - 5 * Math.sin(Math.PI * hop)];
}

/** Lightning: three strokes of a strike, and a far one later. */
function flashAt(age) {
  let f = 0;
  for (const [t0, k, w] of [[0.04, 1, 0.07], [0.2, 0.55, 0.05], [0.5, 0.85, 0.09], [4.6, 0.3, 0.12]]) {
    const x = age - t0;
    if (x > -0.02 && x < 6 * w) f = Math.max(f, k * (x < 0 ? 1 + x / 0.02 : Math.exp(-x / w)));
  }
  return f;
}
const rainAt = (age) => kit.smoothstep(0.2, 1.3, age) * (1 - kit.smoothstep(4.5, SHOW, age));

/** Distance from (x, y) to a glyph's path. */
function pathDist(g, x, y) {
  let best = 99;
  for (const sg of g.segs) best = Math.min(best, kit.segDist(x, y, sg.ax, sg.ay, sg.bx, sg.by));
  return best;
}

const sh = [0, 0, 0], fg = [0, 0, 0];

export default {
  name: 'Rain Glass',
  blurb: 'a steamed window at night: drops write the time, the city shines through the clear trails',
  layouts: ['para-tower'], look: { look: 'opal', gap: 2.0 }, fps: 60, brightness: 0.7, dither: true,
  frame(ctx) {
    const { leds, n } = ctx;
    const L = setup(ctx);
    const now = ctx.date.getTime() / 1000, M0 = Math.floor(now / 60) * 60, age = now - M0;
    const hour = new Date(M0 * 1000).getMinutes() === 0 && age < SHOW + 1;
    const prev = digitsOf(new Date((M0 - 60) * 1000)), next = digitsOf(new Date(M0 * 1000));
    const dim = 1 - 0.7 * ctx.night;
    const rain = hour ? rainAt(age) : 0, flash = hour ? flashAt(age) : 0;

    // 1. the city, sharp and fogged, at every LED (rain makes the view swim)
    const S = city(now);
    for (const l of leds) {
      let x = l.x, y = l.y;
      if (rain > 0) { x += rain * 1.8 * Math.sin(y * 0.45 + now * 7); y += rain * 1.2 * Math.sin(x * 0.3 - now * 5); }
      sample(S, x, y, sh, fg);
      L.sharp.set(sh, 3 * l.i); L.fog.set(fg, 3 * l.i);
    }
    L.clear.fill(0); L.wet.fill(0);

    // 2. the digits: clear glass where a drop has been
    let order = 0;
    const beads = [];
    for (let slot = 0; slot < 4; slot++) {
      const dn = +next[slot], dp = +prev[slot];
      const fN = field(ctx, dn, slot);
      if (dn === dp || age > SHOW + 1) {
        for (const i of fN.idx) L.clear[i] = Math.max(L.clear[i], strokeMask(fN.d[i]));
        for (const b of beadsOf(fN.g)) beads.push([b[0], b[1], b[3] ?? 1]);
        continue;
      }
      // old: the film breaks, drips down the slant and fogs over
      const m0 = hour ? H_MELT0 : 0, md = hour ? H_MELT : MELT;
      const pm = kit.clamp((age - m0) / md);
      if (pm < 1) {
        const fO = field(ctx, dp, slot), gO = fO.g;
        const fade = 1 - kit.smoothstep(0.2, 1, pm);
        if (pm <= 0) for (const i of fO.idx) L.clear[i] = Math.max(L.clear[i], strokeMask(fO.d[i]));
        else {
          const [a0, b0] = SLOTS[slot];
          for (const l of leds) {
            const a = L.ab[2 * l.i], b = L.ab[2 * l.i + 1];
            if (a < a0 - 1 || a > a0 + 6.5 || b < b0 - 1 || b > b0 + T + 6) continue;
            // each column's water slides its own way down; the film it leaves thins
            const run = (hour ? 9 : 6) * kit.ease.in(pm) * (0.3 + 1.4 * kit.hash(a, slot, M0));
            let v = 0;
            for (const q of [0, 0.33, 0.66, 1]) {
              const s = run * q;
              v = Math.max(v, strokeMask(pathDist(gO, l.x - s * V[0], l.y - s * V[1])) * kit.lerp(1 - pm, 1, q) * (0.5 + 0.5 * q));
            }
            if (v > 0) L.clear[l.i] = Math.max(L.clear[l.i], v * fade);
          }
        }
        if (pm <= 0) for (const b of beadsOf(gO)) beads.push([b[0], b[1], b[3] ?? 1]);
      }
      // new: beads condense along its path, then a fat drop runs it, gathering them
      const ts = hour ? H_TRACE_AT + H_STEP * order++ : TRACE_AT, D = hour ? H_TRACE : TRACE;
      const pb = age - (ts - BEAD);
      if (pb <= 0) continue;
      const p = kit.clamp((age - ts) / D);
      const g = fN.g, tau = g.total * (0.35 * p + 0.65 * kit.ease.inOut(p));
      for (const i of fN.idx) {
        const m = strokeMask(fN.d[i]);
        const since = p > 0 ? tau - fN.s[i] : -1;
        // condensing beads: a dotted ghost of the whole new digit
        const bh = kit.hash(i, dn, 5);
        const cond = (0.25 + 0.15 * bh) * kit.smoothstep(bh * 0.2, bh * 0.2 + 0.2, pb) * (0.8 + 0.2 * Math.sin(now * 6 + bh * 40));
        const rv = kit.clamp(since / 0.05 + 1);
        L.clear[i] = Math.max(L.clear[i], m * Math.max(rv, cond));
        if (rv > 0) L.wet[i] = Math.max(L.wet[i], m * Math.exp(-Math.max(0, since) / 0.35) * rv);
      }
      if (p <= 0) continue;
      if (p < 1) {
        // the writing drop, heavy: a bright head and the swollen neck behind it
        const at = dropAt(g, tau), back = dropAt(g, tau - 0.06);
        if (at) beads.push([at[0], at[1], 2]);
        if (at && back) beads.push([(at[0] + back[0]) / 2, (at[1] + back[1]) / 2, 0.7]);
      }
      for (const b of beadsOf(g)) if (tau >= b[2]) beads.push([b[0], b[1], (b[3] ?? 1) * kit.clamp((tau - b[2]) / 0.2 + 0.0001)]);
    }

    // 3. the condensation drops and their trails
    // A drop that runs into a digit stops there and joins its film: a ripple
    // of light runs out along the stroke from where it merged.
    const DR = drops(now, rain).filter((dr) => {
      if (dr.storm) return true;
      const j0 = Math.floor(dr.j0);
      if (L.clear[L.grid[dr.a][dr.pane][j0]] > 0.3) return false;      // would start inside a stroke
      for (let j = j0 + 1; j <= 7; j++) {
        if (L.clear[L.grid[dr.a][dr.pane][j]] > 0.6) {
          dr.stop = j - 0.55;
          dr.merge = world(dr.a, dr.pane * K + j);
          break;
        }
      }
      return true;
    });
    for (const dr of DR) {
      if (dr.tau < dr.grow) continue;
      const jn = dropRow(dr, dr.tau);
      for (let j = Math.max(0, Math.ceil(dr.j0)); j <= Math.min(7, Math.floor(jn)); j++) {
        const i = L.grid[dr.a][dr.pane][j];
        if (i < 0) continue;
        const ago = dr.tau - passTime(dr, j);
        const tr = (dr.storm ? 0.1 : 0.2) * Math.exp(-ago / (dr.storm ? 0.4 : 1.8));
        if (tr > L.clear[i]) L.clear[i] = tr;
      }
    }

    // 4. compose: fog glow everywhere, the city through the clear glass
    const fogK = 0.03 + 0.02 * rain, flashFog = 0.16 * flash, flashClear = 0.3 * flash;
    const o = ctx.out;
    const frog = flash > 0.01 ? frogAt(Math.floor(M0 / 3600), age) : null;
    const eyes = hour && age > 0.45 && age < 3 ? frogAt(Math.floor(M0 / 3600), age) : null;
    for (let i = 0; i < n; i++) {
      const c = L.clear[i], { x, y } = leds[i];
      const tint = y < -1 ? HOURS_GLOW : MINUTES_GLOW;
      // the water film is uneven and creeps downhill: light pools and thins along it
      const film = c > 0 ? 0.72 + 0.4 * kit.noise2(x * 0.32 + 0.2 * y, y * 0.3 - now * 0.35) : 1;
      const cover = frog ? frogCover(x - frog[0], y - frog[1]) * kit.smoothstep(0.01, 0.15, flash) : 0;
      for (let ch = 0; ch < 3; ch++) {
        const f = L.fog[3 * i + ch], s = L.sharp[3 * i + ch];
        const glass = (0.2 * tint[ch] + 0.6 * f + 1.0 * s) * film;
        const mist = Math.max(0, fogK * f - 0.01);
        const v = (1 - c) * (mist + flashFog * FLASH[ch]) + c * (glass + flashClear * FLASH[ch]) + L.wet[i] * 0.35 * WATER[ch];
        o[3 * i + ch] = v * (1 - 0.96 * cover);
      }
    }

    // 5. beads of water catch light: highlights, tinted by what is behind
    const bead = (x, y, r, a) => {
      sample(S, x, y, sh, fg);
      const c = [WATER[0] * 0.25 + sh[0] * 0.6 + fg[0], WATER[1] * 0.25 + sh[1] * 0.6 + fg[1], WATER[2] * 0.25 + sh[2] * 0.6 + fg[2]];
      kit.splat(ctx, x, y, r, c, a);
    };
    for (const [x, y, kind] of beads) {
      if (kind === 2) bead(x, y, 2.9, 0.85);
      else bead(x, y, 2.3, 0.42 * kind * (0.75 + 0.25 * Math.sin(now * 1.3 + x * 0.7 + y)));
    }
    for (const dr of DR) {
      if (dr.storm) {                       // rain streaming down: a short comet along the column
        if (dr.tau < dr.grow || dr.tau > dr.grow + dr.run + 0.1) continue;
        for (let k = 0; k < 3; k++) {
          const [x, y] = world(dr.a, dr.pane * K + dropRow(dr, dr.tau - k * 0.035));
          kit.splat(ctx, x, y, 1.9, RAIN, 0.13 * (1 - k * 0.3) * (0.4 + 0.6 * rain));
        }
        continue;
      }
      const grown = kit.clamp(dr.tau / Math.max(dr.grow, 0.01));
      const jn = dropRow(dr, dr.tau);
      const [x, y] = world(dr.a, dr.pane * K + jn);
      const soak = 1 - kit.smoothstep(dr.grow + dr.run, dr.end, dr.tau);
      const moving = dr.tau > dr.grow && dr.tau < dr.grow + dr.run;
      bead(x, y, moving ? 2.8 : 1.6 + 1.0 * grown, (moving ? 0.8 : 0.3 * grown) * soak);
    }

    for (const dr of DR) {
      const since = dr.tau - dr.grow - dr.run;
      if (!dr.merge || since < 0 || since > 1.2) continue;
      const [mx, my] = dr.merge;
      for (const i of ctx.layout.index.near(mx, my, 16)) {
        if (L.clear[i] < 0.5) continue;
        const d = Math.hypot(leds[i].x - mx, leds[i].y - my), w = (d - 24 * since) / 3;
        kit.add(ctx, i, WATER, 0.5 * L.clear[i] * Math.exp(-w * w) * Math.exp(-since / 0.45));
      }
    }

    // after the strike, the frog's eyes keep the light a moment longer
    if (eyes) {
      const e = kit.smoothstep(0.45, 0.6, age) * (1 - kit.smoothstep(1.2, 3, age)) * (Math.sin(age * 9) > -0.9 ? 1 : 0.2);
      for (const sx of [-1, 1]) kit.splat(ctx, eyes[0] + sx * 2.8 * FROG_S, eyes[1] - 8 * FROG_S, 2.2, EYESHINE, 0.35 * e);
    }

    for (let i = 0; i < 3 * n; i++) o[i] *= dim;
  },
};
