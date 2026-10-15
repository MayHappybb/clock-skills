// Snowflake: the hexagon is one sectored-plate ice crystal. Six hexagonal
// plates ring a small nucleus, and the moats between them are the crystal's
// six arms, running exactly along the lattice's three directions to the
// board's six corners. Four plates carry the time as ridges of ice (hours
// above, minutes below); the two side plates carry a little star whose form
// is the hour's own. Every digit is drawn inside the plate's hexagon from
// vertical and 30-degree needles only: 0 is the bare hexagonal prism, 8 two
// stacked plates, 3 a notched prism.
//
// Alive: frost glints run along ridges and down the dark arms, single
// crystals twinkle, and every couple of minutes a mote of diamond dust
// drifts in out of the dark and lands on the tips, which grow a needle: the
// flake's six tips grow through the hour.
//
// Minute turn: the changed digit sublimates, LED by LED, into vapour motes
// that swirl inside the plate and refreeze, needle by needle in stroke
// order, into the new digit. The old digit is gone before the new one
// starts, so the plate is only ever empty or part-drawn, never wrong.
//
// Hour: a warm thaw closes in ring by ring from the tips, the flake melts,
// and beads of water run down the six arms into a trembling droplet at the
// centre that holds the warmth; the old digits melt last, as the hour turns. The droplet
// freezes with a flash, and a hexagonal freezing front races out ring by
// ring (the board's own rings), leaving a new, different flake behind it:
// new tips, new side stars, a new tint of ice, all seeded by the hour.
//
// Look: smoke. A crystal is light on black; tinted acrylic hides the white
// packages so the moats and the dark between the tips are true black, and
// every LED stays a sharp point, which is what makes ice glitter. Opal would
// blur the 4 mm needles into soft tubes and melt the moats.
//
// Stateless: every frame is a closed function of the wall clock; the flake
// of each hour and the schedules of each minute are cached by key.
import * as kit from '../js/kit.js';

const P = 4;
const TAU = Math.PI * 2;

// Plates: (q0, H0) puts cell column c = 0, half-row h = 0 at board column q0,
// half-row H0. Cells 0-3 carry H H / M M, 4 and 5 the side stars.
const CELLS = [
  { q0: -5, H0: -17 }, { q0: 1, H0: -17 }, { q0: -5, H0: 5 }, { q0: 1, H0: 5 },
  { q0: -10, H0: -6 }, { q0: 6, H0: -6 },
];
/** The plate is a pointy-top hexagon of 29 LEDs: c 0..4, h 0..12. */
const inCell = (c, h) => c >= 0 && c <= 4 && (c + h) % 2 === 0 && h >= Math.abs(c - 2) && h <= 12 - Math.abs(c - 2);

// The digits, as needles: polylines in (c, h). Every segment is vertical or
// 30 degrees, a chain of nearest neighbours. Drawn in growth order.
const GLYPH = {
  0: [[[2, 0], [4, 2], [4, 10], [2, 12], [0, 10], [0, 2], [2, 0]]],
  1: [[[0, 2], [2, 0], [2, 12]]],
  2: [[[0, 2], [2, 0], [4, 2], [4, 4], [0, 8], [0, 10], [2, 12], [4, 10]]],
  3: [[[0, 2], [2, 0], [4, 2], [4, 4], [2, 6], [4, 8], [4, 10], [2, 12], [0, 10]]],
  4: [[[0, 2], [0, 6], [1, 7], [2, 6], [3, 7], [4, 6]], [[4, 2], [4, 10]]],
  5: [[[4, 2], [2, 0], [0, 2], [0, 4], [4, 8], [4, 10], [2, 12], [0, 10]]],
  6: [[[4, 2], [2, 0], [0, 2], [0, 10], [2, 12], [4, 10], [4, 8], [2, 6], [0, 8]]],
  7: [[[0, 2], [1, 1], [2, 2], [3, 1], [4, 2], [4, 4], [0, 8], [0, 10]]],
  8: [[[2, 6], [0, 4], [0, 2], [2, 0], [4, 2], [4, 4], [2, 6], [4, 8], [4, 10], [2, 12], [0, 10], [0, 8], [2, 6]]],
  9: [[[0, 10], [2, 12], [4, 10], [4, 2], [2, 0], [0, 2], [0, 4], [2, 6], [4, 4]]],
};
// The side stars, one chosen per hour. Each is mirror-symmetric.
const STAR = [[[2, 0], [2, 12]], [[0, 4], [4, 8]], [[0, 8], [4, 4]]];
const ORNAMENT = [
  STAR,                                                                    // stellar
  [[[2, 4], [3, 5], [3, 7], [2, 8], [1, 7], [1, 5], [2, 4]],             // sectored plate: a ring, six spokes out
    [[2, 4], [2, 0]], [[2, 8], [2, 12]], [[1, 5], [0, 4]], [[3, 7], [4, 8]], [[1, 7], [0, 8]], [[3, 5], [4, 4]]],
  [[[2, 0], [2, 12]], [[1, 5], [3, 7]], [[1, 7], [3, 5]]],               // needle: long spine, short spokes
];

/** A polyline in (c, h) to its lattice points, in order. */
function expand(poly) {
  const out = [];
  for (let k = 0; k + 1 < poly.length; k++) {
    const [a, b] = poly[k], [c, d] = poly[k + 1], dc = c - a, dh = d - b;
    let n, sc, sh;
    if (dc === 0) { n = Math.abs(dh) / 2; sc = 0; sh = Math.sign(dh) * 2; }
    else if (Math.abs(dc) === Math.abs(dh)) { n = Math.abs(dc); sc = Math.sign(dc); sh = Math.sign(dh); }
    else throw new Error('snowflake: not a lattice needle ' + JSON.stringify([poly[k], poly[k + 1]]));
    for (let s = 0; s < n; s++) out.push([a + sc * s, b + sh * s]);
  }
  out.push(poly[poly.length - 1]);
  return out;
}

// Axial directions of the six arms (q, r): up, upper right, lower right,
// down, lower left, upper left. y = P * (r + q / 2), so hr = 2r + q.
const DIRS = [[0, -1], [1, -1], [1, 0], [0, 1], [-1, 1], [-1, 0]];

// Colours, linear.
const DEEP = [0, 0.035, 0.095];                 // the plates' ice, lit from behind
const WATER = kit.hex('#2a8cff');
const AMBER = kit.hex('#ff8a2a');
const WHITE = [1, 1, 1];
const VAPOUR = [0.55, 0.8, 1];
const PLATE = 0.0;                             // the plates' own ice, behind the ridges
const ARM = 0.28;                               // the arms' level, under the digits' 1

// Timing, seconds.
const SUB = [0.05, 0.5], SUB_FADE = 0.28;      // minute turn: old LEDs sublimate in this window
const REFREEZE = [0.85, 2.2], FREEZE_FADE = 0.2; // new LEDs freeze in stroke order in this window
const PRE = 5;                                   // hour: the melt starts this long before the hour
const NUCLEATE = 0.15;                           // hour: the droplet freezes this long after it
const RING_T = 0.15;                             // hour: freezing front, seconds per ring
const POST = NUCLEATE + 0.05 + 10.5 * RING_T + 0.6;

// ------------------------------------------------------------ geometry
let GEO = null;
function geo(ctx) {
  if (GEO && GEO.L === ctx.layout) return GEO;
  const leds = ctx.leds, n = leds.length, map = new Map();
  for (const l of leds) map.set(l.col * 1000 + l.hr, l.i);
  const idq = (q, hr) => map.get(q * 1000 + hr) ?? -1;
  const idc = (k, c, h) => {
    if (!inCell(c, h)) throw new Error(`snowflake: needle leaves the plate at ${c},${h}`);
    return idq(CELLS[k].q0 + c, CELLS[k].H0 + h);
  };
  const cellOf = new Int8Array(n).fill(-1);
  const cells = CELLS.map((C, k) => {
    const a = [];
    for (let c = 0; c <= 4; c++) for (let h = 0; h <= 12; h++) if (inCell(c, h)) { const i = idc(k, c, h); a.push(i); cellOf[i] = k; }
    return a;
  });
  const shape = (k, polys) => {
    const paths = polys.map((poly) => expand(poly).map(([c, h]) => idc(k, c, h)));
    return { paths, leds: [...new Set(paths.flat())] };
  };
  const glyphs = [0, 1, 2, 3].map((k) => Object.keys(GLYPH).map((d) => shape(k, GLYPH[d])));
  const orns = [4, 5].map((k) => ORNAMENT.map((o) => shape(k, o)));
  const keep = new Uint8Array(n);
  for (const cell of cells) for (const i of cell) for (const j of ctx.layout.index.near(leds[i].x, leds[i].y, P * 1.05)) keep[j] = 1;
  const nucleus = leds.filter((l) => l.ring <= 2).map((l) => l.i);
  // the six arms: the dark moats, centre to corner
  const arms = DIRS.map(([dq, dr]) => { const a = []; for (let s = 1; s <= 10; s++) a.push(idq(s * dq, 2 * s * dr + s * dq)); return a; });
  const unit = DIRS.map(([dq, dr]) => { const x = dq * P * Math.sqrt(3) / 2, y = P * (dr + dq / 2), m = Math.hypot(x, y); return [x / m, y / m]; });
  const centre = cells.map((cell) => [cell.reduce((s, i) => s + leds[i].x, 0) / cell.length, cell.reduce((s, i) => s + leds[i].y, 0) / cell.length]);
  // per-LED jitter, and when each LED melts / refreezes in the hour show
  const melt = new Float32Array(n), freeze = new Float32Array(n);
  for (const l of leds) {
    melt[l.i] = -PRE + (10 - l.ring) * 0.36 + 0.25 * kit.hash(l.i, 1);
    freeze[l.i] = NUCLEATE + 0.05 + RING_T * l.ring + 0.05 * kit.hash(l.i, 2);
  }
  GEO = { L: ctx.layout, n, idq, cells, cellOf, glyphs, orns, keep, nucleus, arms, unit, centre, melt, freeze };
  return GEO;
}

// --------------------------------------------------------------- flakes
// One flake per hour: its tips (which needles grow off the six arms, and
// when), its side star, its tint. Six-fold: every arm gets the same branches.
const flakes = new Map();
function flake(G, ctx, key) {
  if (flakes.has(key)) return flakes.get(key);
  const rnd = (a) => kit.hash(key, a, 77);
  const branch = [0];
  for (let s = 1; s <= 10; s++) branch.push(rnd(s) < 0.45 ? 0 : 1 + Math.floor(rnd(s + 20) * Math.min(2, 11 - s)));
  const tips = new Map();
  const put = (q, r, g) => {
    const i = G.idq(q, 2 * r + q);
    if (i < 0 || G.keep[i] || ctx.leds[i].ring <= 4) return;
    if (!(tips.get(i) <= g)) tips.set(i, g);
  };
  DIRS.forEach(([dq, dr], k) => {
    for (let s = 1; s <= 10; s++) {
      put(s * dq, s * dr, s);
      for (const side of [1, 5]) {
        const [bq, br] = DIRS[(k + side) % 6];
        for (let m = 1; m <= branch[s]; m++) put(s * dq + m * bq, s * dr + m * br, s + 0.8 * m);
      }
    }
  });
  // the inner part of each tip is there from birth; the rest grows through the hour
  const list = [...tips].map(([i, g]) => ({ i, g: g + 0.3 * kit.hash(i, key) })).sort((a, b) => a.g - b.g);
  const born = Math.ceil(list.length * 0.4);
  list.forEach((tp, r) => {
    tp.at = r < born ? -1 : 150 + (3300 - 150) * (r - born) / Math.max(1, list.length - born);
    const a = rnd(200 + r) * TAU;
    tp.from = [Math.cos(a), Math.sin(a)];
  });
  const tint = rnd(98);
  const F = {
    key, tips: list,
    orn: Math.floor(rnd(99) * ORNAMENT.length),
    ice: kit.scale(kit.mix(kit.hex('#a8e6ff'), kit.hex('#d2dcff'), tint), 0.82),
    frost: kit.mix(kit.hex('#2fb4ff'), kit.hex('#6f8cff'), tint),
  };
  if (flakes.size > 4) flakes.delete(flakes.keys().next().value);
  flakes.set(key, F);
  return F;
}

// ----------------------------------------------------------- minute turn
const pad = (n) => String(n).padStart(2, '0');
const digitsOf = (d) => pad(d.getHours()) + pad(d.getMinutes());

const turns = new Map();
/** Minute M, slot k, digit a -> b: when each old LED sublimates, each new one freezes, and the motes between. */
function turn(G, M, k, a, b) {
  const key = M * 8 + k;
  if (turns.has(key)) return turns.get(key);
  const old = G.glyphs[k][a].leds, neu = G.glyphs[k][b].leds;
  const tOld = old.map((_, u) => SUB[0] + (SUB[1] - SUB[0]) * kit.hash(u, k, M));
  const tNew = neu.map((_, j) => REFREEZE[0] + (REFREEZE[1] - REFREEZE[0]) * j / Math.max(1, neu.length - 1));
  const motes = [];
  for (let p = 0; p < Math.max(old.length, neu.length); p++) {
    const u = p % old.length, t0 = tOld[u] + 0.06;
    motes.push({ src: old[u], dst: p < neu.length ? neu[p] : -1, t0, t1: p < neu.length ? tNew[p] : t0 + 1.3, a: kit.hash(p, k, M + 1) * TAU });
  }
  const T = { old, neu, tOld, tNew, motes };
  if (turns.size > 16) turns.delete(turns.keys().next().value);
  turns.set(key, T);
  return T;
}

/** A vapour mote between its old LED and its new one: swirls, rises a little, lands. */
function motePos(leds, m, age) {
  const u = kit.clamp((age - m.t0) / (m.t1 - m.t0));
  const A = leds[m.src];
  const bx = m.dst >= 0 ? leds[m.dst].x : A.x + 7 * Math.cos(m.a), by = m.dst >= 0 ? leds[m.dst].y : A.y - 10;
  const e = kit.ease.inOut(u), sw = Math.sin(Math.PI * u), th = m.a + 4.5 * u;
  return [kit.lerp(A.x, bx, e) + 5 * sw * Math.cos(th), kit.lerp(A.y, by, e) + 4 * sw * Math.sin(th) - 3 * sw, u];
}

/** A crystal catching the light now and then. */
function twinkle(i, now) {
  const ph = now * 0.8 + kit.hash(i, 5) * 97, c = Math.floor(ph);
  return kit.hash(i, c, 13) > 0.9 ? Math.sin(Math.PI * (ph - c)) ** 3 : 0;
}

/** A mote of ice catching the light as it tumbles: smooth flicker, 0..1. */
const sparkle = (seed, now) => Math.max(0, Math.sin(now * 9.7 + seed * 7) * Math.sin(now * 6.1 + seed * 3));

const GLINT_SPEED = 15;
const SWEEP = 6.5;                               // seconds between highlight sweeps                          // LEDs a second

export default {
  name: 'Snowflake',
  blurb: 'a sectored-plate ice crystal; the time is frozen into four of its six plates, and every hour it melts and grows anew',
  layouts: ['hex'], look: 'smoke', fps: 60, brightness: 0.6, dither: true,
  frame(ctx) {
    const G = geo(ctx), { leds, date } = ctx;
    const now = date.getTime() / 1000, local = now - date.getTimezoneOffset() * 60;
    const hk = Math.floor(local / 3600), intoH = local - hk * 3600;
    const hA = intoH >= 3600 - PRE ? intoH - 3600 : intoH < POST ? intoH : null;
    const oldKey = hA !== null && hA < 0 ? hk : hk - 1;
    const F = flake(G, ctx, hA === null ? hk : hA < NUCLEATE ? oldKey : oldKey + 1);
    const tH = local - F.key * 3600;
    const dim = 1 - 0.8 * ctx.night;
    // the flake turning in the light: a soft highlight sweeps across it
    const phi = now * 0.07 + 1.3 * Math.sin(now * 0.031), cx = Math.cos(phi), cy = Math.sin(phi);
    const sweep = ((now / SWEEP) % 1) * 120 - 60;
    const decor = 1 - 0.4 * ctx.night;             // at night the flake recedes behind the time
    const M = Math.floor(now / 60) * 60, age = now - M;
    const cur = digitsOf(date), prev = digitsOf(new Date((M - 60) * 1000));
    const vis = (i) => hA === null ? 1 : hA < NUCLEATE ? 1 - kit.smoothstep(G.melt[i], G.melt[i] + 0.7, hA) : kit.smoothstep(G.freeze[i], G.freeze[i] + 0.22, hA);
    const ridge = (i, a, col) => {
      if (a <= 0) return;
      const l = leds[i], d = (l.x * cx + l.y * cy - sweep) / 7;
      const hi = 0.5 * Math.exp(-d * d) + 0.5 * twinkle(i, now);
      kit.add(ctx, i, col, a * dim);
      if (hi > 0.01) kit.add(ctx, i, WHITE, hi * a * dim);
    };

    // the thaw: a warm ring closing in, ring by ring, as each ring melts
    if (hA !== null && hA < NUCLEATE) {
      for (const l of leds) {
        const mu = G.melt[l.i], w = kit.smoothstep(mu, mu + 0.35, hA) * (1 - kit.smoothstep(mu + 0.45, mu + 1.2, hA));
        if (w > 0.01) kit.add(ctx, l.i, AMBER, 0.32 * w * dim);
      }
    }

    // the six plates: dim ice, light moving slowly through it
    for (const cell of G.cells) for (const i of cell) {
      const l = leds[i], sh = 0.7 + 0.6 * kit.noise2(l.x * 0.11 + now * 0.13, l.y * 0.11 - now * 0.09);
      kit.add(ctx, i, DEEP, PLATE * sh * vis(i) * dim);
    }

    // the side stars
    for (const o of G.orns) for (const i of o[F.orn].leds) ridge(i, 0.42 * vis(i) * decor, F.frost);

    // the time
    const moving = [false, false, false, false];
    for (let k = 0; k < 4; k++) {
      if (hA !== null && hA < NUCLEATE) {
        // melting: wet, rippling, then gone at the turn of the hour
        const d = hA < 0 ? cur[k] : prev[k], wet = kit.smoothstep(-3.2, -1.4, hA);
        const col = kit.mix(F.ice, WATER, 0.55 * wet);
        for (const i of G.glyphs[k][d].leds) {
          const tau = -0.45 + 0.3 * kit.hash(i, 9);
          const rip = 1 - 0.3 * wet * (0.5 + 0.5 * Math.sin(now * 6 + leds[i].y * 0.6));
          ridge(i, (1 - kit.smoothstep(tau, tau + 0.25, hA)) * rip, col);
        }
        moving[k] = true;
      } else if (hA !== null && hA < POST) {
        for (const i of G.glyphs[k][cur[k]].leds) ridge(i, vis(i), F.ice);
        moving[k] = true;
      } else if (prev[k] !== cur[k] && age < REFREEZE[1] + FREEZE_FADE + 0.3) {
        const T = turn(G, M, k, prev[k], cur[k]);
        T.old.forEach((i, u) => {
          const p = (age - T.tOld[u]) / SUB_FADE;
          if (p < 0) ridge(i, 1, F.ice);
          else if (p < 1) { ridge(i, 1 - kit.ease.out(p), F.ice); kit.add(ctx, i, WHITE, 0.5 * Math.sin(Math.PI * p) * dim); }
        });
        T.neu.forEach((i, j) => {
          const p = (age - T.tNew[j]) / FREEZE_FADE;
          if (p > 0) ridge(i, kit.ease.out(Math.min(1, p)), F.ice);
          kit.add(ctx, i, WHITE, 0.8 * Math.exp(-(((age - T.tNew[j]) / 0.12) ** 2)) * dim);
        });
        for (const m of T.motes) {
          if (age < m.t0 || age > m.t1) continue;
          const [x, y, u] = motePos(leds, m, age);
          const a = kit.smoothstep(0, 0.12, u) * (m.dst < 0 ? 1 - u : 1);
          kit.splat(ctx, x, y, 3.2, VAPOUR, 0.45 * a * dim);
          kit.splat(ctx, x, y, 3.2, WHITE, 0.5 * a * sparkle(m.a, now) * dim);
        }
        moving[k] = true;
      } else {
        for (const i of G.glyphs[k][cur[k]].leds) ridge(i, 1, F.ice);
      }
    }

    // the nucleus
    for (const i of G.nucleus) {
      const r = leds[i].ring;
      const a = hA === null ? 1 : hA < NUCLEATE ? 1 - kit.smoothstep(-4.9, -4.4, hA) : vis(i);
      if (r === 0) ridge(i, 0.9 * a, F.ice);
      else if (r === 1) kit.add(ctx, i, DEEP, 1.4 * a * dim);
      else ridge(i, 0.5 * a, F.frost);
    }

    // the six arms, nucleus to corner, between the plates
    for (const arm of G.arms) for (let s = 2; s < arm.length; s++) ridge(arm[s], ARM * vis(arm[s]) * decor, F.frost);

    // the six tips, growing through the hour as diamond dust lands on them
    for (const tp of F.tips) {
      const l = leds[tp.i];
      const grow = tp.at < 0 ? 1 : kit.smoothstep(tp.at, tp.at + 1.2, tH);
      ridge(tp.i, grow * vis(tp.i) * Math.max(0.3, 0.75 - 0.05 * (tp.g - 6)) * decor, F.frost);
      if (tp.at < 0 || hA !== null) continue;
      const since = tH - tp.at;
      if (since > 0 && since < 0.8) kit.add(ctx, tp.i, WHITE, 0.8 * (1 - since / 0.8) ** 2 * dim);
      if (since > -7 && since < 0) {
        const u = 1 + since / 7, e = kit.ease.out(u), w = 3 * (1 - u) * Math.sin(now * 1.7 + tp.g * 3);
        const x = l.x + tp.from[0] * 24 * (1 - e) - tp.from[1] * w, y = l.y + tp.from[1] * 24 * (1 - e) + tp.from[0] * w;
        const a = kit.smoothstep(0, 0.2, u) * dim;
        kit.splat(ctx, x, y, 3.2, VAPOUR, 0.3 * a);
        kit.splat(ctx, x, y, 3.2, WHITE, 0.45 * a * sparkle(tp.g, now));
      }
    }

    if (hA === null) {
      // frost glints, running along ridges and down the dark arms
      const pool = [];
      for (let k = 0; k < 4; k++) if (!moving[k]) for (const p of G.glyphs[k][cur[k]].paths) pool.push([p, 0.6]);
      for (const o of G.orns) for (const p of o[F.orn].paths) pool.push([p, 0.5]);
      for (const p of G.arms) pool.push([p, 0.45], [p, 0.45]);
      for (let ln = 0; ln < 4; ln++) {
        const T = 2.1 + 0.73 * ln, ph = now + 5.3 * ln, c = Math.floor(ph / T);
        const [path, amp] = pool[Math.floor(kit.hash(ln, c, 31) * pool.length)];
        const s = (ph - c * T) * GLINT_SPEED - 1, env = 1 - kit.smoothstep(path.length - 1, path.length + 2.5, s);
        if (env <= 0) continue;
        path.forEach((i, p) => {
          const d = s - p, f = d < 0 ? Math.exp(-d * d / 0.3) : Math.exp(-d / 1.5);
          if (f > 0.01) kit.add(ctx, i, WHITE, amp * f * env * dim);
        });
      }
    }

    if (hA === null) return;

    // the melt: beads of water run down the six arms into the centre
    const R = 3 + 5 * kit.smoothstep(-4.6, -0.3, hA);
    if (hA < NUCLEATE) {
      for (let k = 0; k < 6; k++) for (let j = 0; j < 7; j++) {
        const s = -PRE + 0.3 + 0.6 * j + 0.11 * k, u = (hA - s) / 1.5;
        if (u <= 0 || u >= 1) continue;
        const rho = 40 * (1 - kit.ease.in(u));
        if (rho < R) continue;
        const [ux, uy] = G.unit[k];
        kit.splat(ctx, ux * rho, uy * rho, 3.2, WATER, 0.5 * kit.smoothstep(0, 0.1, u) * dim);
        kit.splat(ctx, ux * rho, uy * rho, 2.2, VAPOUR, 0.2 * dim);
      }
      for (let k = 0; k < 4; k++) {
        const u = (hA + 0.3) / 0.75;
        if (u <= 0 || u >= 1) continue;
        const [cx, cy] = G.centre[k], e = kit.ease.in(u);
        if (Math.hypot(cx, cy) * (1 - e) < R) continue;
        kit.splat(ctx, cx * (1 - e), cy * (1 - e), 3.2, WATER, 0.5 * dim);
      }
    }

    // the droplet: trembles, then freezes with a flash
    if (hA > -4.9 && hA < NUCLEATE + 0.45) {
      const amp = hA < NUCLEATE ? 0.05 + 0.13 * kit.smoothstep(-3, -0.2, hA) : 0;
      const body = kit.smoothstep(-4.9, -4.4, hA) * (1 - kit.smoothstep(NUCLEATE, NUCLEATE + 0.15, hA));
      const flash = hA < NUCLEATE ? 0 : kit.clamp((hA - NUCLEATE) / 0.06) * (1 - kit.smoothstep(NUCLEATE + 0.08, NUCLEATE + 0.45, hA));
      const hx = -0.35 * R + 0.8 * Math.sin(now * 2.3), hy = -0.4 * R;
      for (const i of ctx.layout.index.near(0, 0, R + 3)) {
        const l = leds[i], rho = Math.hypot(l.x, l.y), th = Math.atan2(l.y, l.x);
        const e = R * (1 + amp * (0.6 * Math.sin(3 * th + now * 11) + 0.4 * Math.sin(2 * th - now * 7.3)) + 0.04 * Math.sin(now * 17));
        const inside = kit.smoothstep(e + 1.2, e - 1.6, rho), rim = Math.exp(-(((rho - e) / 1.4) ** 2));
        const core = Math.exp(-(rho * rho) / (0.5 * R * R));
        kit.add(ctx, i, AMBER, 0.42 * core * inside * body * dim);
        kit.add(ctx, i, WATER, 0.4 * (1 - core) * inside * body * dim);
        kit.add(ctx, i, VAPOUR, 0.35 * rim * body * dim);
        kit.add(ctx, i, WHITE, 0.4 * Math.exp(-((l.x - hx) ** 2 + (l.y - hy) ** 2) / 6) * inside * body * dim);
        kit.add(ctx, i, WHITE, 0.9 * flash * Math.max(inside, 0.5 * rim) * dim);
      }
    }

    // the freezing front: a hexagon of light running out ring by ring
    if (hA >= NUCLEATE) {
      for (const l of leds) {
        const b = Math.exp(-(((hA - G.freeze[l.i]) / 0.07) ** 2));
        if (b > 0.01) kit.add(ctx, l.i, VAPOUR, 0.75 * b * dim);
      }
    }
  },
};
