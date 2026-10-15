// Dewfall: the trefoil is a clover leaf, three heart-shaped leaflets seen
// from above, and the time is written in dew beaded on it. The hour sits on
// the top leaflet, the minutes on the two below (tens left, units right).
//
// Each arc board is a bipolar lattice: rings round its two outer corners.
// On a leaflet those rings are the leaf's own lateral veins, running out
// from the midrib in a herringbone, and the drops sit in that grain. The
// lower leaflets' grain is a curved near-square grid, the top leaflet's runs
// on the bias (a diamond grid), so the minutes and the hour have two drop
// alphabets drawn for the two grains, with fat drops at the stroke ends.
//
// Water gathers in a jewel drop where the leaflets meet, swelling through
// the minute. At the turn it overflows, the changing leaflet dips and
// shivers, and its drops run along the grain (paths curve with the veins),
// stretched, into the new figure; spare drops merge into others, missing
// ones split off. Loose dew lies round the figures at dawn and burns off by
// late morning, each bead now and then running off down the leaf. On the hour a raindrop hits the middle: a splash, a ring
// runs out over the whole leaf, the leaf bobs, every bead hops and the drops
// roll into the new hour as the ring passes them. A seven-spot ladybird
// walks the notch of each leaflet and flies to the next: one lap a minute.
// The leaflets fold up for the night (clover sleeps) and the dew reflects
// the sky: peach at dawn, white by day, gold at dusk, moon blue at night.
//
// Look: opal at 2.5 mm. The leaf has to read as one surface and the beads as
// soft glowing drops; bare or smoke shows a field of packages in which the
// figures drown at real size.
//
// Stateless: per-minute plans are cached by the digits they join; all motion
// is a closed-form function of time.
import * as kit from '../js/kit.js';

// ------------------------------------------------------------ the lattice
const R0 = 5.042, DC = 81.62, STEP = 4;          // arc210's bipolar lattice (panels.js)
const PANEL = { TOP: 0, RIGHT: 1, LEFT: 2 };     // arc-trio: board 0 up, 1 lower right, 2 lower left

/** Board-local position of fractional ring coordinates (u, v), y up. */
function bip(u, v) {
  const r1 = R0 + STEP * (u - 1), r2 = R0 + STEP * (v - 1);
  const x = (r1 * r1 - r2 * r2) / (2 * DC);
  return [x, Math.sqrt(Math.max(0, r1 * r1 - (x + DC / 2) ** 2))];
}

/** Solve the affine map local -> world from three LEDs of a board. */
function fitAffine(pairs) {
  const [[p1, q1], [p2, q2], [p3, q3]] = pairs;
  const det = (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1]);
  const solve = (k) => {
    const a = ((q1[k] - q3[k]) * (p2[1] - p3[1]) - (q2[k] - q3[k]) * (p1[1] - p3[1])) / det;
    const b = ((p1[0] - p3[0]) * (q2[k] - q3[k]) - (p2[0] - p3[0]) * (q1[k] - q3[k])) / det;
    return [a, b, q3[k] - a * p3[0] - b * p3[1]];
  };
  const X = solve(0), Y = solve(1);
  return (x, y) => [X[0] * x + X[1] * y + X[2], Y[0] * x + Y[1] * y + Y[2]];
}

const geoms = new Map();
function geom(L) {
  if (geoms.has(L.key)) return geoms.get(L.key);
  const byUV = L.panels.map(() => new Map());
  for (const l of L.leds) byUV[l.panel].set(l.u * 32 + l.v, l.i);
  const maps = L.panels.map((p, k) => {
    const pick = (u, v) => L.leds[byUV[k].get(u * 32 + v)];
    return fitAffine([[20, 1], [1, 20], [20, 20]].map(([u, v]) => { const l = pick(u, v); return [bip(u, v), [l.x, l.y]]; }));
  });
  const uvw = (k, u, v) => maps[k](...bip(u, v));
  // per-LED leaf data
  const leaf = L.leds.map((l) => {
    const w = l.w, lat = w >= 20 ? 0 : (l.u - l.v) / (20 - w);
    const rr = (20 - w) / 19;                          // 0 at the leaf's centre, 1 at the notch
    const vein = l.u === l.v ? 1 : (l.u > l.v ? l.u % 3 === 0 : l.v % 3 === 0) ? 0.55 : 0;
    const rim = l.u === 20 || l.v === 20 || w === 1 ? 1 : 0;
    return { lat, rr, vein, rim, apexDist: Math.hypot(l.x - uvw(l.panel, 20, 20)[0], l.y - uvw(l.panel, 20, 20)[1]) };
  });
  // loose dew: spots well clear of the figures (one LED of leaf round every box)
  const inBox = (l) => {
    if (l.panel === PANEL.RIGHT) return l.u >= 10 && l.v >= 13;
    if (l.panel === PANEL.LEFT) return l.v >= 10 && l.u >= 13;
    const c = l.v - l.u;
    return l.w >= HOUR_W0 - 1 && l.w <= HOUR_W0 + 11 && Math.abs(c) <= 8;
  };
  const free = L.leds.filter((l) => !inBox(l) && l.w >= 4 && l.u <= 18 && l.v <= 18 && leaf[l.i].rr > 0.3);
  free.sort((a, b) => kit.hash(a.i, 91) - kit.hash(b.i, 91));
  const loose = [];
  for (const l of free) {                                   // spread out: no two closer than 14 mm
    if (loose.every((m) => Math.hypot(m.x - l.x, m.y - l.y) > 14)) loose.push(l);
    if (loose.length >= 15) break;
  }
  const g = { byUV, uvw, leaf, loose, at: (k, u, v) => byUV[k].get(u * 32 + v) ?? -1 };
  geoms.set(L.key, g);
  return g;
}

// ------------------------------------------------------------ the alphabets
// 'o' a bead, '*' a fat drop (stroke ends), '.' leaf.
// Minutes: the lower leaflets' near-square grain, 6 x 9.
const MIN_FONT = {
  0: ['..oo..', '.o..o.', 'o....o', 'o....o', 'o....o', 'o....o', 'o....o', '.o..o.', '..oo..'],
  1: ['...o..', '..oo..', '.*.o..', '...o..', '...o..', '...o..', '...o..', '...o..', '.ooooo'],
  2: ['.oooo.', '*....o', '.....o', '....o.', '...o..', '..o...', '.o....', 'o.....', 'oooooo'],
  3: ['.oooo.', '*....o', '.....o', '.....o', '..ooo.', '.....o', '.....o', '*....o', '.oooo.'],
  4: ['....o.', '...oo.', '..o.o.', '.o..o.', 'o...o.', 'oooooo', '....o.', '....o.', '....o.'],
  5: ['ooooo*', 'o.....', 'o.....', 'oooo..', '....o.', '.....o', '.....o', '*...o.', '.ooo..'],
  6: ['...oo*', '..o...', '.o....', 'o.....', 'o.ooo.', 'oo...o', 'o....o', '.o...o', '..ooo.'],
  7: ['*ooooo', '.....o', '....o.', '....o.', '...o..', '...o..', '..o...', '..o...', '..*...'],
  8: ['..oo..', '.o..o.', '.o..o.', '..oo..', '.o..o.', 'o....o', 'o....o', '.o..o.', '..oo..'],
  9: ['.ooo..', 'o...o.', 'o....o', 'o...oo', '.ooo.o', '.....o', '....o.', '...o..', '*oo...'],
};
// Hour: the top leaflet's diamond grain, 7 x 11; a dot only where x + y is even.
const HOUR_FONT = {
  0: ['..o.o..', '.o...o.', 'o.....o', '.o...o.', 'o.....o', '.o...o.', 'o.....o', '.o...o.', 'o.....o', '.o...o.', '..o.o..'],
  2: ['..o.o..', '.o...o.', '*.....o', '.....o.', '....o..', '...o...', '..o....', '.o.....', 'o......', '.o.....', 'o.o.o.o'],
  3: ['..o.o..', '.o...o.', '*.....o', '.....o.', '..o.o..', '.....o.', '......o', '.....o.', '*.....o', '.o...o.', '..o.o..'],
  4: ['....o..', '...o.o.', '..o.o..', '.o...o.', 'o...o..', '.o...o.', 'o.o.o.o', '.....o.', '....o..', '.....o.', '....*..'],
  5: ['o.o.o.*', '.o.....', 'o......', '.o.....', 'o.o.o..', '.....o.', '......o', '.....o.', '*.....o', '.o...o.', '..o.o..'],
  6: ['..o.o.*', '.o.....', 'o......', '.o.....', 'o.o.o..', '.o...o.', 'o.....o', '.o...o.', 'o.....o', '.o...o.', '..o.o..'],
  7: ['*.o.o.o', '.....o.', '....o..', '...o...', '..o....', '.o.....', '..o....', '.o.....', '..o....', '.o.....', '..*....'],
  8: ['..o.o..', '.o...o.', 'o.....o', '.o...o.', '..o.o..', '.o...o.', 'o.....o', '.o...o.', 'o.....o', '.o...o.', '..o.o..'],
  9: ['..o.o..', '.o...o.', 'o.....o', '.o...o.', 'o.....o', '.o...o.', '..o.o.o', '.....o.', '......o', '.....o.', '*.o.o..'],
};
// the hour's 1 is narrow (it has to share the leaflet with a second figure)
const HOUR_ONE = ['..o', '.o.', '*.o', '.o.', '..o', '.o.', '..o', '.o.', '..o', '.o.', '..o'];

const MIN_BOX = { top: 19, side: 19 };            // lower leaflets: rows from u (or v) = 19 down
const HOUR_W0 = 5;                                // top leaflet: first row (w), clear of the ladybird

const hourText = (d) => String(d.getHours() % 12 || 12);

/** The drops of one slot showing text s: [{ i, x, y, big }]. slot 0 hour, 1 tens, 2 units. */
const dotCache = new Map();
function slotDots(ctx, G, slot, s) {
  const key = slot + '|' + s;
  if (dotCache.has(key)) return dotCache.get(key);
  const out = [];
  const put = (i, big) => { if (i >= 0) { const l = ctx.leds[i]; out.push({ i, x: l.x, y: l.y, u: l.u, v: l.v, k: l.panel, big }); } };
  if (slot === 0) {
    // glyphs side by side on the diamond grain; c0 and w0 share parity
    const glyphs = [...s].map((ch) => (ch === '1' ? HOUR_ONE : HOUR_FONT[ch]));
    const width = glyphs.reduce((a, g) => a + g[0].length, 0) + (glyphs.length - 1);
    // centred; glyph widths are odd, so with a one half-column gap every
    // glyph starts on the right parity
    let c = Math.round(-(width - 1) / 2);
    if ((((c - HOUR_W0) % 2) + 2) % 2) c += 1;
    for (const g of glyphs) {
      g.forEach((row, y) => [...row].forEach((ch, x) => {
        if (ch === '.') return;
        const cc = c + x, w = HOUR_W0 + y;
        put(G.at(PANEL.TOP, (w + 20 - cc) / 2, (w + 20 + cc) / 2), ch === '*');
      }));
      c += g[0].length + 1;
    }
  } else {
    const g = MIN_FONT[s];
    g.forEach((row, y) => [...row].forEach((ch, x) => {
      if (ch === '.') return;
      if (slot === 2) put(G.at(PANEL.RIGHT, MIN_BOX.top - y, MIN_BOX.side - x), ch === '*');
      else put(G.at(PANEL.LEFT, MIN_BOX.side - 5 + x, MIN_BOX.top - y), ch === '*');
    }));
  }
  dotCache.set(key, out);
  return out;
}

const textsOf = (d) => { const m = d.getMinutes(); return [hourText(d), String(Math.floor(m / 10)), String(m % 10)]; };

// ------------------------------------------------------------ rolling drops
const RING_SPEED = 70;                            // mm/s, the hour's splash ring

/**
 * How the drops of one slot get from figure a to figure b. Shared drops
 * stay; the rest are matched shortest-first and roll; spare old drops merge
 * into the nearest new one; missing new ones split off the nearest old one.
 */
const planCache = new Map();
function plan(ctx, G, slot, a, b, hourly) {
  const key = `${slot}|${a}|${b}|${hourly ? 1 : 0}`;
  if (planCache.has(key)) return planCache.get(key);
  const A = slotDots(ctx, G, slot, a), B = slotDots(ctx, G, slot, b);
  const bi = new Set(B.map((d) => d.i)), ai = new Set(A.map((d) => d.i));
  const stay = B.filter((d) => ai.has(d.i)).map((d) => ({ ...d, big0: A.find((e) => e.i === d.i).big }));
  const Ao = A.filter((d) => !bi.has(d.i)), Bn = B.filter((d) => !ai.has(d.i));
  const pairs = [];
  Ao.forEach((p, j) => Bn.forEach((q, k) => pairs.push([Math.hypot(p.x - q.x, p.y - q.y), j, k])));
  pairs.sort((x, y) => x[0] - y[0]);
  const ua = new Set(), ub = new Set(), moves = [];
  for (const [, j, k] of pairs) {
    if (ua.has(j) || ub.has(k)) continue;
    ua.add(j); ub.add(k);
    moves.push({ from: Ao[j], to: Bn[k], kind: 'roll' });
  }
  const near = (p, set) => set.reduce((best, q) => (Math.hypot(p.x - q.x, p.y - q.y) < Math.hypot(p.x - best.x, p.y - best.y) ? q : best), set[0]);
  Ao.forEach((p, j) => { if (!ua.has(j) && B.length) moves.push({ from: p, to: near(p, B), kind: 'merge' }); });
  Bn.forEach((q, k) => { if (!ub.has(k) && A.length) moves.push({ from: near(q, A), to: q, kind: 'split' }); });
  // the drops of one figure move together (a figure in flux, never a mix of
  // finished old and new strokes); on the hour each leaves as the ring hits it
  const maxLen = Math.max(0, ...moves.map((m) => Math.hypot(m.to.x - m.from.x, m.to.y - m.from.y)));
  const dur = kit.clamp(0.75 + maxLen / 60, 0.9, 1.5);
  for (const m of moves) {
    const len = Math.hypot(m.to.x - m.from.x, m.to.y - m.from.y);
    const r = Math.hypot(m.from.x, m.from.y);
    m.len = len;
    m.start = hourly ? 0.05 + r / RING_SPEED * 0.5 : 0.4 + 0.004 * G.leaf[m.from.i].apexDist;
    m.dur = dur;
    // which way the drop bows as it rolls: downhill, the leaf's tilt
    const nx = -(m.to.y - m.from.y) / (len || 1), ny = (m.to.x - m.from.x) / (len || 1);
    m.bow = (ny >= 0 ? 1 : -1) * Math.min(1.5, len * 0.06);
    m.nx = nx; m.ny = ny;
  }
  const p = { stay, moves, end: Math.max(0, ...moves.map((m) => m.start + m.dur)) };
  if (planCache.size > 40) planCache.delete(planCache.keys().next().value);
  planCache.set(key, p);
  return p;
}

/** A drop of light at (x, y): weights normalised, so it keeps its brightness as it glides. */
function bead(ctx, x, y, c, a, r = 4.3) {
  const idx = ctx.layout.index.near(x, y, r);
  let sum = 0;
  const ws = idx.map((i) => { const l = ctx.leds[i], d2 = ((l.x - x) ** 2 + (l.y - y) ** 2) / (r * r), f = (1 - d2) ** 2; sum += f; return f; });
  if (sum <= 0) return;
  idx.forEach((i, k) => kit.add(ctx, i, c, (a * ws[k]) / Math.max(sum, 0.6)));
}

// ------------------------------------------------------------ the sky in the dew
const SKY = [
  [0, kit.hex('#6f8cff')], [4.5, kit.hex('#6f8cff')], [6, kit.hex('#ffb3a0')], [8.5, kit.hex('#e6f2ff')],
  [16.5, kit.hex('#e6f2ff')], [19, kit.hex('#ffc46a')], [21, kit.hex('#6f8cff')], [24, kit.hex('#6f8cff')],
];
function skyAt(h) {
  for (let k = 1; k < SKY.length; k++) if (h <= SKY[k][0]) {
    const [h0, c0] = SKY[k - 1], [h1, c1] = SKY[k];
    return kit.mix(c0, c1, kit.smoothstep(0, 1, (h - h0) / (h1 - h0)));
  }
  return SKY[0][1];
}
/** How much loose dew lies on the leaf (0..1). */
function dewiness(h) {
  if (h < 8) return 1;
  if (h < 11.5) return 1 - kit.smoothstep(8, 11.5, h);
  if (h < 20) return 0;
  return kit.smoothstep(20, 23.5, h);
}
/** How open the leaflets are: clover folds its leaflets at night. */
function openness(h) {
  if (h < 5.5 || h >= 21.5) return 0;
  if (h < 8) return kit.smoothstep(5.5, 8, h);
  if (h > 19) return 1 - kit.smoothstep(19, 21.5, h);
  return 1;
}

// ------------------------------------------------------------ the ladybird
const BUG_RED = kit.hex('#ff2206'), BUG_CHEEK = [0.55, 0.55, 0.5], WING = [0.3, 0.36, 0.42];
const SPOTS = [[2.0, 4.4, 2.9], [2.0, -4.4, 2.9], [-5.6, 3.6, 2.7], [-5.6, -3.6, 2.7]];
const RIM_W = 2.4;                                // the notch path, in rows from the leaf's edge
const LEAF_ORDER = [PANEL.TOP, PANEL.RIGHT, PANEL.LEFT];   // clockwise

function rimPoint(G, k, p) {
  const u = kit.lerp(17.6, RIM_W + 2.4, p), v = RIM_W + 20 - u;
  return G.uvw(k, u, v);
}

/** Where the ladybird is, at second s of the minute: [x, y, heading, scale, open, flap]. */
function bugAt(G, s) {
  const seg = Math.floor(s / 20) % 3, q = s - seg * 20, k = LEAF_ORDER[seg];
  if (q < 17.5) {
    let p;
    if (q < 1) p = 0;
    else if (q < 8) p = 0.5 * kit.smoothstep(1, 8, q);
    else if (q < 9.6) p = 0.5;
    else if (q < 16) p = 0.5 + 0.5 * kit.smoothstep(9.6, 16, q);
    else p = 1;
    const [x, y] = rimPoint(G, k, p);
    const [x2, y2] = rimPoint(G, k, Math.min(1, p + 0.01)), [x0, y0] = rimPoint(G, k, Math.max(0, p - 0.01));
    let hd = Math.atan2(y2 - y0, x2 - x0);
    const walking = (q > 1 && q < 8) || (q > 9.6 && q < 16);
    if (!walking) hd += 0.35 * Math.sin(q * 2.1) * kit.smoothstep(0, 0.5, Math.min(Math.abs(q - 8), Math.abs(q - 9.6), Math.abs(q - 16), Math.abs(q - 1), 1));
    const gait = walking ? Math.sin(q * 38) : 0;
    const nx = -Math.sin(hd), ny = Math.cos(hd);
    // turning towards the next leaflet before take-off
    if (q > 16) {
      const [fx, fy] = rimPoint(G, LEAF_ORDER[(seg + 1) % 3], 0);
      const target = Math.atan2(fy - y, fx - x);
      let dh = target - hd; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      hd += dh * kit.smoothstep(16, 17.3, q);
    }
    const open = q > 17.2 ? kit.smoothstep(17.2, 17.5, q) : q < 0.5 ? 1 - kit.smoothstep(0, 0.5, q) : 0;
    return [x + nx * 0.35 * gait, y + ny * 0.35 * gait, hd + 0.05 * gait, 1, open, open];
  }
  // flight to the next leaflet, over the middle of the leaf
  const f = (q - 17.5) / 2.5, e = kit.ease.inOut(f);
  const P0 = rimPoint(G, k, 1), P2 = rimPoint(G, LEAF_ORDER[(seg + 1) % 3], 0);
  const C = [0.2 * (P0[0] + P2[0]), 0.2 * (P0[1] + P2[1])];
  const bz = (t) => [(1 - t) ** 2 * P0[0] + 2 * (1 - t) * t * C[0] + t * t * P2[0], (1 - t) ** 2 * P0[1] + 2 * (1 - t) * t * C[1] + t * t * P2[1]];
  const [x, y] = bz(e), [xa, ya] = bz(Math.min(1, e + 0.02)), [xb, yb] = bz(Math.max(0, e - 0.02));
  return [x, y, Math.atan2(ya - yb, xa - xb), 1 + 0.3 * Math.sin(Math.PI * f), 1, 1];
}

function drawBug(ctx, bx, by, hd, sc, open, flap, now, dim, shadowOnly = false) {
  const ch = Math.cos(hd), sh = Math.sin(hd);
  const flick = 0.5 + 0.5 * Math.sin(now * 95);
  for (const i of ctx.layout.index.near(bx, by, 15 * sc)) {
    const l = ctx.leds[i];
    const dx = (l.x - bx) / sc, dy = (l.y - by) / sc;
    const fx = dx * ch + dy * sh, fy = -dx * sh + dy * ch;      // fx forward, fy to the right
    const o = ctx.out;
    let px0 = [o[3 * i], o[3 * i + 1], o[3 * i + 2]];
    const paint = (c, a) => { if (a > 0) px0 = kit.mix(px0, kit.scale(c, dim), kit.clamp(a)); };
    // its shadow on the leaf, so the black parts read against the green
    // (drawn under the dew: the shadow falls on the leaf, not on the beads)
    if (shadowOnly) {
      const se = Math.sqrt(((fx - 1) / (13.5 + 4 * open)) ** 2 + (fy / (10.5 + 6 * open)) ** 2);
      if (se < 1) paint([0, 0, 0], 0.85 * kit.clamp((1 - se) * 4));
      o[3 * i] = px0[0]; o[3 * i + 1] = px0[1]; o[3 * i + 2] = px0[2];
      continue;
    }
    // wings, behind the shell when it opens
    if (open > 0) {
      for (const side of [-1, 1]) {
        const wx = fx + 1, wy = fy - side * (5 + 6 * open);
        const e = Math.sqrt((wx / 10) ** 2 + (wy / 5) ** 2) - 1;
        paint(WING, kit.clamp(0.5 - e * 3) * open * (0.08 + 0.3 * flap * flick * flick));
      }
    }
    // the shell: two elytra that swing apart in flight
    for (const side of [-1, 1]) {
      const ang = side * 0.55 * open, ca = Math.cos(ang), sa = Math.sin(ang);
      const px = fx - 6, py = fy;                               // pivot at the pronotum
      const ex = px * ca + py * sa + 6, ey = -px * sa + py * ca;
      if (side * ey < -0.4 * (1 - open)) continue;               // each elytron is its half
      const e = Math.sqrt(((ex + 1) / 10) ** 2 + (ey / 7.9) ** 2) - 1;
      const ea = kit.clamp(0.5 - e * 5);
      if (ea <= 0) continue;
      let c = BUG_RED;
      for (const [sx, sy, sr] of SPOTS) {
        const sd = Math.hypot(ex - sx, ey - sy) - sr;
        if (sd < 1.2) c = kit.scale(c, kit.clamp(0.02 + sd / 1.4));
      }
      if (Math.abs(ey) < 1.1 && open < 0.2) c = kit.scale(c, 0.4);
      paint(c, ea);
    }
    // head and pronotum: black, with the two white cheeks
    const hdist = Math.hypot((fx - 9.6) / 4, fy / 5.6) - 1;
    if (hdist < 0.25) {
      let c = [0, 0, 0];
      const cheek = Math.min(Math.hypot(fx - 10.6, fy - 3.4), Math.hypot(fx - 10.6, fy + 3.4));
      if (cheek < 2.4) c = kit.scale(BUG_CHEEK, kit.clamp(1.3 - cheek / 2.4));
      paint(c, 0.5 - hdist * 4);
    }
    o[3 * i] = px0[0]; o[3 * i + 1] = px0[1]; o[3 * i + 2] = px0[2];
  }
}

// ------------------------------------------------------------ the face
// leaf tones in linear light, as raw levels: green alone for the blade, a
// little red (never below 8/255) for the yellower veins and the heart
const LEAF = [0, 1, 0], VEIN = [0.032, 0.07, 0], HEART = [0.07, 0.1, 0];
const GLINT = [1, 1, 1], LENS = [0.04, 1, 0.06];

export default {
  name: 'Dewfall',
  blurb: 'a clover leaf; the time is dew on its three leaflets, rolling into each new minute; a ladybird laps it, a raindrop brings the hour',
  layouts: ['arc-trio'], look: { look: 'opal', gap: 2.5 }, fps: 60, brightness: 1, dither: true,
  frame(ctx) {
    const L = ctx.layout, G = geom(L), { leds } = ctx;
    const now = ctx.date.getTime() / 1000, M = Math.floor(now / 60) * 60, age = now - M;
    const hourly = ctx.date.getMinutes() === 0;
    const hr = ctx.date.getHours() + ctx.date.getMinutes() / 60 + ctx.date.getSeconds() / 3600;
    const night = ctx.night, dim = 1 - 0.72 * night;
    const open = openness(hr);
    const prevT = textsOf(new Date((M - 60) * 1000)), nextT = textsOf(ctx.date);
    const changing = [0, 1, 2].map((s) => prevT[s] !== nextT[s]);
    const leafOfSlot = [PANEL.TOP, PANEL.LEFT, PANEL.RIGHT];
    const shiver = [false, false, false];
    for (let s = 0; s < 3; s++) if (changing[s]) shiver[leafOfSlot[s]] = true;

    // splash timing (hour turn)
    const ht = hourly ? age : 99;
    const bob = ht < 3 ? Math.exp(-2.2 * ht) * Math.cos(ht * 8.5) : 0;

    // the leaf
    const t = ctx.t;
    for (const l of leds) {
      const f = G.leaf[l.i];
      const shade = 0.55 + 0.45 * (1 - f.lat * f.lat);                       // the leaflet's curve
      const fold = 1 - (1 - open) * 0.75 * Math.abs(f.lat) ** 1.3;            // folded at night
      const dapple = 0.6 + 0.8 * kit.noise2(l.x * 0.035 + now * 0.06, l.y * 0.035 - now * 0.04);
      // green only, and kept at 8/255 or above by day so it doesn't step
      let k = (0.024 + 0.02 * shade * dapple) * fold * (1 + 0.5 * bob);
      // the leaflet shivers at the minute: a band runs out from the centre
      // and dips under the water's weight, rocking back (light across its length)
      if (shiver[l.panel] && age < 3) {
        const R = age * 75;
        if (age < 1.6) k *= 1 + 1.4 * Math.exp(-(((f.apexDist - R) / 7) ** 2)) * (1 - age / 1.6);
        k *= 1 + 0.7 * Math.exp(-1.6 * age) * Math.sin(age * 6) * (f.apexDist - 35) / 35;
      }
      let c = kit.scale(LEAF, k);
      if (f.vein) c = kit.mix(c, kit.scale(VEIN, (0.75 + 0.25 * dapple) * fold * (1 - 0.4 * f.rr)), f.vein * 0.8);
      if (f.rim) c = kit.mix(c, kit.scale(VEIN, (0.6 + 0.3 * dapple) * fold), 0.6);
      if (f.rr < 0.12) c = kit.mix(c, HEART, 1 - f.rr / 0.12);
      kit.set(ctx, l.i, c, dim);
    }

    // the splash ring
    if (ht < 1.6) {
      const R = ht * RING_SPEED;
      for (const l of leds) {
        const r = Math.hypot(l.x, l.y);
        // the spray catches the sun: a faint spectrum, violet inside, red out
        const o = r - R;
        if (Math.abs(o) > 9) continue;
        const band = Math.exp(-((o / 6) ** 2)) * (1 - ht / 1.6);
        const hue = 0.78 * (1 - kit.clamp((o + 7) / 14));
        kit.add(ctx, l.i, kit.hsv(hue, 0.85, 1), 0.15 * band * dim * (1 - 0.7 * night));
      }
    }

    // the ladybird's shadow, on the leaf under the dew
    let [bx, by, hd, sc, op, fl] = bugAt(G, kit.secOf(ctx.date));
    if (ht < 1.8) { const startle = Math.sin(Math.PI * ht / 1.8); op = Math.max(op, 0.6 * startle); fl = Math.max(fl, startle); }
    drawBug(ctx, bx, by, hd, sc, op, fl, now, 1, true);

    // the dew
    const sky = kit.mix(skyAt(hr), [0.75, 0.9, 1], 0.25);

    // the jewel: water gathers where the leaflets meet, swelling through the
    // minute; at the turn it overflows and runs out to the changing figures
    {
      const sec = kit.secOf(ctx.date);
      const full = 5.6, empty = 1.6;
      let R = sec < 0.5 ? kit.lerp(full, empty, kit.ease.out(sec / 0.5)) : kit.lerp(empty, full, kit.smoothstep(0.5, 59.5, sec) ** 0.8);
      R *= 1 + 0.05 * Math.sin(now * 6.3) * Math.sin(now * 1.7);
      const hx = -0.4 * R + 0.5 * Math.sin(now * 0.9), hy = -0.4 * R + 0.5 * Math.cos(now * 0.7);
      for (const i of L.index.near(0, 0, R + 1.5)) {
        const l = leds[i], d = Math.hypot(l.x, l.y);
        const inside = kit.clamp((R + 1 - d) / 2);
        kit.add(ctx, i, LENS, (0.06 + 0.12 * R / full) * inside * dim);
        kit.add(ctx, i, sky, 0.06 * inside * dim);
      }
      bead(ctx, hx * 0.6, hy * 0.6, GLINT, (0.15 + 0.3 * R / full) * dim);
    }
    const base = 0.42 * (1 - 0.35 * night);
    const sparkle = (i) => {
      const per = 4.5 + 5 * kit.hash(i, 7), ph = kit.hash(i, 11) * per;
      const q = ((now + ph) % per) / 0.32;
      return q < 1 ? Math.sin(Math.PI * q) ** 2 : 0;
    };
    const hop = (x, y) => (ht < 2 ? Math.exp(-(((ht - Math.hypot(x, y) / RING_SPEED) / 0.09) ** 2)) : 0);
    const drawDrop = (x, y, big, i, a) => {
      const jig = 0.35;
      const jx = jig * (kit.noise2(i * 3.1, now * 0.7) - 0.5), jy = jig * (kit.noise2(i * 1.7 + 50, now * 0.7) - 0.5);
      const gl = sparkle(i), hp = hop(x, y);
      const sz = big ? 1.35 : 0.8 + 0.35 * kit.hash(i, 5);                  // no two beads alike
      const lum = base * sz * (0.85 + 0.3 * kit.noise2(x * 0.05 - now * 0.15, y * 0.05)) * (1 + 1.3 * hp);
      bead(ctx, x + jx, y + jy, sky, lum * a * dim);
      // a bead is a lens: the leaf glows through it, round its highlight
      kit.splat(ctx, x, y, big ? 7.5 : 6, LENS, (big ? 0.11 : 0.06) * sz * a * dim);
      if (big) kit.splat(ctx, x, y, 6.2, sky, 0.1 * a * dim);
      if (gl > 0) bead(ctx, x, y, GLINT, 0.55 * gl * a * dim);
    };
    // loose dew round the figures: thick at dawn, burnt off by late morning,
    // back after dark. Each bead sits, now and then runs off down the leaf
    // along its grain, and condenses again where it was.
    {
      const n = 3 + 12 * dewiness(hr);
      G.loose.forEach((l, k) => {
        const vis = kit.clamp(n - k);
        if (vis <= 0) return;
        const P = 24 + 22 * kit.hash(k, 17), q = ((now / P + kit.hash(k, 19)) % 1);
        let u = l.u, v = l.v, a = vis;
        if (q > 0.72) {
          const r = kit.ease.in(kit.clamp((q - 0.72) / 0.22));
          const run = Math.min(l.u + l.v - 21.5, 6);           // down to the notch
          u -= run * r / 2; v -= run * r / 2;
          a *= 1 - kit.smoothstep(0.75, 1, r);
          if (q > 0.94) { u = l.u; v = l.v; a = vis * kit.smoothstep(0.94, 1, q); }
        }
        if (a <= 0.01) return;
        const [x, y] = q > 0.72 && q <= 0.94 ? G.uvw(l.panel, u, v) : [l.x, l.y];
        bead(ctx, x, y, sky, base * 0.55 * a * dim);
        kit.splat(ctx, x, y, 5.5, LENS, 0.04 * a * dim);
        const gl = sparkle(l.i + 999);
        if (gl > 0) bead(ctx, x, y, GLINT, 0.4 * gl * a * dim);
      });
    }

    for (let s = 0; s < 3; s++) {
      if (!changing[s]) {
        for (const d of slotDots(ctx, G, s, nextT[s])) drawDrop(d.x, d.y, d.big, d.i, 1);
        continue;
      }
      const P = plan(ctx, G, s, prevT[s], nextT[s], hourly);
      for (const d of P.stay) drawDrop(d.x, d.y, d.big, d.i, 1);
      const arrived = new Map();                        // merge flashes on the target drop
      for (const m of P.moves) {
        const raw = (age - m.start) / m.dur, p = kit.ease.inOut(kit.clamp(raw));
        // drops run along the leaf's grain: interpolated in ring coordinates,
        // so their paths curve with the veins
        const along = (q) => {
          const [gx, gy] = G.uvw(m.from.k, kit.lerp(m.from.u, m.to.u, q), kit.lerp(m.from.v, m.to.v, q));
          const b = m.bow * Math.sin(Math.PI * q);
          return [gx + m.nx * b, gy + m.ny * b];
        };
        const [x, y] = along(p);
        if (m.kind === 'merge' && raw >= 1) { arrived.set(m.to.i, Math.max(arrived.get(m.to.i) ?? 0, 1 - kit.clamp((raw - 1) * m.dur / 0.35))); continue; }
        const a = m.kind === 'split' ? kit.smoothstep(0, 0.4, p) : 1;
        const big = p < 0.5 ? m.from.big : m.to.big;
        if (raw > 0 && raw < 1) {
          // rolling: stretched along its path, a wet glint ahead
          const [xt, yt] = along(kit.ease.inOut(kit.clamp(raw - 0.09)));
          bead(ctx, x, y, sky, base * 0.8 * a * dim);
          bead(ctx, xt, yt, sky, base * 0.4 * a * dim);
        } else if (m.kind !== 'merge' || raw < 1) {
          // waiting (or arrived): a resting drop at the leaf's grain
          const at = raw <= 0 ? m.from : m.to;
          if (m.kind === 'split' && raw <= 0) continue;
          drawDrop(at.x, at.y, at.big, at.i, 1);
        }
      }
      for (const [i, fl] of arrived) if (fl > 0) bead(ctx, leds[i].x, leds[i].y, GLINT, 0.4 * fl * dim);
    }

    // the raindrop, the splash and its crown
    const falling = ctx.date.getMinutes() === 59 && age > 59.2;
    if (hourly || falling) {
      const tf = hourly ? age : age - 60;                  // seconds from impact
      if (tf < 0) {
        // falling towards the leaf: its shadow first, then the drop, growing
        const g = 1 + tf / 0.8;
        for (const i of L.index.near(0, 0, 16)) {
          const d = Math.hypot(leds[i].x, leds[i].y);
          if (d < 4 + 10 * (1 - g)) ctx.out[3 * i] *= 0.5, ctx.out[3 * i + 1] *= 0.5, ctx.out[3 * i + 2] *= 0.5;
        }
        kit.splat(ctx, 0, 0, 3 + 9 * g * g, sky, 0.35 * g * g * g * dim);
      } else if (tf < 1.2) {
        kit.splat(ctx, 0, 0, 10, GLINT, 0.9 * Math.exp(-tf * 9) * dim);
        for (let j = 0; j < 14; j++) {
          const ang = (j / 14) * kit.TAU + 0.4 * kit.hash(j, 3), reach = 30 + 45 * kit.hash(j, 5);
          const r = reach * (1 - Math.exp(-tf * 4.5)) / (1 - Math.exp(-4.5 * 1.2));
          const fade = 1 - tf / 1.2;
          bead(ctx, r * Math.cos(ang), r * Math.sin(ang), sky, 0.5 * fade * dim);
        }
      }
    }

    // the ladybird
    drawBug(ctx, bx, by, hd, sc, op, fl, now, dim * (1 - 0.3 * night));

    // the faint tails of halos would only flicker as 1/255: drop them
    const o = ctx.out;
    for (let j = 0; j < o.length; j++) if (o[j] < 0.006) o[j] = 0;
  },
};
