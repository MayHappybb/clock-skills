// Porthole: the octagon is a submarine's brass porthole, bolted at its eight
// corners, looking out into the deep sea; the rim glints only where the
// lure's light reaches it. The time is written by
// bioluminescent plankton: blue for the hour, aqua for the minute, every
// glowing dot one organism on the LED it rests on. A lazy anglerfish cruises
// the dark, its lure the brightest thing in the sea; dormant plankton flare
// in its wake, and marine snow drifts down.
//
// Minute: the fish lunges through the changing digit. The plankton burst
// (they glow when disturbed), are dragged into a spinning vortex in its wake
// and resettle as the new digit.
// Hour: the anglerfish flees the light, the sub surfaces. The water drains
// off the glass and the plankton become sunlit droplets clinging to it; a
// breaking wave washes the old time away and leaves the new one behind as it
// drains. Then the sub dives, water climbs the glass, bubbles stream up and
// the droplets glow back into plankton.
//
// Stateless: everything is a closed-form function of the wall clock, with
// per-minute caches for the glyph pairings and the fish's route.
import * as kit from '../js/kit.js';

const P = 4;
const cx = (c) => (c - 7.5) * P, cy = (r) => (r - 7.5) * P;
const TAU = Math.PI * 2;

// ---------------------------------------------------------------- letters
// Drawn for a 4 x 5 cell on the 4 mm grid. Bowls are little octagons, the
// porthole's own shape, so a 0 is a porthole and 8 two stacked ones.
const GLYPH = {
  0: ['.##.', '#..#', '#..#', '#..#', '.##.'],
  1: ['..#.', '.##.', '..#.', '..#.', '.###'],
  2: ['.##.', '#..#', '..#.', '.#..', '####'],
  3: ['###.', '...#', '.##.', '...#', '###.'],
  4: ['#..#', '#..#', '####', '...#', '...#'],
  5: ['####', '#...', '###.', '...#', '###.'],
  6: ['.##.', '#...', '###.', '#..#', '.##.'],
  7: ['####', '...#', '..#.', '.#..', '.#..'],
  8: ['.##.', '#..#', '.##.', '#..#', '.##.'],
  9: ['.##.', '#..#', '.###', '...#', '.##.'],
};

// hours above, minutes below; a dark cross between them is the fish's lane
const SLOTS = [[3, 2], [9, 2], [3, 9], [9, 9]].map(([c0, r0], k) => ({
  k, c0, r0, x: cx(c0 + 1.5), y: cy(r0 + 2), hour: k < 2,
}));

const C = {
  HOUR: [0.0, 0.2, 1.0],
  MIN: [0.0, 0.85, 0.6],
  FLASH: [0.25, 1.0, 0.95],
  LURE: kit.hex('#ffd774'),
  BODY: [0.7, 0.14, 0.0],
  TOOTH: [0.9, 0.9, 0.8],
  EYE: [0.55, 0.8, 0.9],
  BRASS: [1.0, 0.42, 0.0],
  SNOW: [0.35, 0.5, 0.75],
  SPARK: [0.0, 0.55, 1.0],
  WATER: [0.0, 0.03, 0.055],
  RAY: [0.015, 0.08, 0.09],
  FOAM: [0.6, 0.85, 0.9],
  SHEET: [0.03, 0.25, 0.32],
  BUBBLE: [0.5, 0.85, 1.0],
};

const pad = (n) => String(n).padStart(2, '0');
const timeStr = (sec) => { const d = new Date(sec * 1000); return pad(d.getHours()) + pad(d.getMinutes()); };
const isHourStart = (sec) => new Date(sec * 1000).getMinutes() === 0;

const homeCache = new Map();
/** Plankton homes of digit ch in slot s, sorted by angle round the slot centre. */
function homes(ch, s) {
  const key = ch + s.k;
  if (homeCache.has(key)) return homeCache.get(key);
  const pts = [];
  GLYPH[ch].forEach((row, r) => [...row].forEach((v, c) => { if (v === '#') pts.push([cx(s.c0 + c), cy(s.r0 + r)]); }));
  pts.sort((a, b) => Math.atan2(a[1] - s.y, a[0] - s.x) - Math.atan2(b[1] - s.y, b[0] - s.x));
  homeCache.set(key, pts);
  return pts;
}

const pairCache = new Map();
/** Old motes paired with new ones; spares fade in or out along the way. */
function pairs(a, b, s) {
  const key = a + b + s.k;
  if (pairCache.has(key)) return pairCache.get(key);
  const A = homes(a, s), B = homes(b, s), n = Math.max(A.length, B.length), out = [];
  for (let j = 0; j < n; j++) {
    const ia = Math.floor((j * A.length) / n), ib = Math.floor((j * B.length) / n);
    const dupA = j > 0 && ia === Math.floor(((j - 1) * A.length) / n);
    const dupB = j > 0 && ib === Math.floor(((j - 1) * B.length) / n);
    const [ax, ay] = A[ia], [bx, by] = B[ib];
    const ta = Math.atan2(ay - s.y, ax - s.x), tb = Math.atan2(by - s.y, bx - s.x);
    const dt = ((tb - ta + Math.PI) % TAU + TAU) % TAU - Math.PI;
    out.push({ ax, ay, bx, by, ta, dt, ra: Math.hypot(ax - s.x, ay - s.y), rb: Math.hypot(bx - s.x, by - s.y),
      a0: dupA ? 0 : 1, a1: dupB ? 0 : 1, ph: kit.hash(j, s.k, 7) });
  }
  pairCache.set(key, out);
  return out;
}

// ------------------------------------------------------------ the LEDs
let GRID = null;
/** LED index by (col, row), -1 where the octagon is cut away. */
function grid(ctx) {
  if (GRID?.L === ctx.layout) return GRID.g;
  const g = new Int16Array(256).fill(-1);
  for (const l of ctx.leds) g[l.col * 16 + l.row] = l.i;
  GRID = { L: ctx.layout, g };
  return g;
}

/**
 * One organism (or droplet) of light at (x, y) mm, shared bilinearly by its
 * four nearest LEDs so it glides instead of hopping. k is how much it hides
 * what is behind it: 0 adds (glow in water), 1 covers (a drop on the glass).
 */
function mote(ctx, g, x, y, c, a, k = 0) {
  const fx = x / P + 7.5, fy = y / P + 7.5, c0 = Math.floor(fx), r0 = Math.floor(fy);
  const wx = fx - c0, wy = fy - r0, o = ctx.out;
  for (let dc = 0; dc < 2; dc++) for (let dr = 0; dr < 2; dr++) {
    const cc = c0 + dc, rr = r0 + dr;
    if (cc < 0 || cc > 15 || rr < 0 || rr > 15) continue;
    const i = g[cc * 16 + rr];
    if (i < 0) continue;
    const w = (dc ? wx : 1 - wx) * (dr ? wy : 1 - wy) * a;
    if (w <= 0) continue;
    const j = 3 * i, h = 1 - k * Math.min(1, w);
    o[j] = o[j] * h + c[0] * w; o[j + 1] = o[j + 1] * h + c[1] * w; o[j + 2] = o[j + 2] * h + c[2] * w;
  }
}

// the porthole's rim: every LED on the octagon's edge; bolts at its eight corners
const BOLTS = [[0, 5], [0, 10], [5, 0], [10, 0], [15, 5], [15, 10], [5, 15], [10, 15]];
let RIM = null;
function rim(ctx, g) {
  if (RIM?.L === ctx.layout) return RIM.list;
  const has = (c, r) => c >= 0 && c < 16 && r >= 0 && r < 16 && g[c * 16 + r] >= 0;
  const bolt = new Set(BOLTS.map(([c, r]) => g[c * 16 + r]));
  const list = ctx.leds.filter((l) => !(has(l.col - 1, l.row) && has(l.col + 1, l.row) && has(l.col, l.row - 1) && has(l.col, l.row + 1)))
    .map((l) => [l.i, bolt.has(l.i)]);
  RIM = { L: ctx.layout, list };
  return list;
}

// ------------------------------------------------------------ the fish
const V = 46;                    // lunge speed, mm/s
const ROW_MIN = cy(11);          // centre line of the minute row
/** When the lunging fish passes slot k's centre, relative to the minute turn. */
function passTime(B, k) {
  const o = timeStr(B - 60), n = timeStr(B);
  return k === 2 ? -0.15 : -0.15 - (o[2] !== n[2] ? 24 / V : 0);
}

const keyCache = new Map();
/**
 * The anglerfish's minute, as keyframes [tau, x, y, facing, linear] around
 * the turn at B. facing: 1 right, -1 left, 0 looking in through the glass.
 * It enters from the left, stops at the porthole's centre to stare in,
 * leaves, comes back from the right, notices the time, backs off and
 * lunges through the minute row. Before an hour it flees into the deep.
 */
function fishKeys(B) {
  if (keyCache.has(B)) return keyCache.get(B);
  const K = [[-57, -60, 2, 1], [-49, -12, 0, 1], [-43, -6, 1, 1], [-39, 0, 0, 1], [-36, 0, -0.5, 0],
    [-31, 0.5, -0.3, 0], [-28, 2, 0, 1], [-22, 60, 0, 1], [-17, 60, -2, -1], [-11, 9, 0, -1]];
  if (isHourStart(B)) K.push([-8.5, 10, 0.5, 0], [-7.3, 8, 3, -0.4], [-4.5, 1, 62, -0.2]);
  else {
    const t3 = passTime(B, 3);
    K.push([-7.5, 11, 0.5, -1], [-5.6, 10, 0, 0], [-4.4, 12, 0, 1], [-3, 60, 2, 1],
      [t3 - 50 / V, 62, ROW_MIN, -1, 1], [t3 + 74 / V, -62, ROW_MIN, -1]);
  }
  K.push([3, -60, 2, 1]);
  if (keyCache.size > 8) keyCache.delete(keyCache.keys().next().value);
  keyCache.set(B, K);
  return K;
}

/** Fish centre and facing at epoch second t. */
function fishAt(t) {
  const B = Math.floor((t + 57) / 60) * 60, K = fishKeys(B), tau = t - B;
  let j = 0;
  while (j < K.length - 2 && tau >= K[j + 1][0]) j++;
  const a = K[j], b = K[j + 1], u = kit.clamp((tau - a[0]) / (b[0] - a[0]));
  const e = a[4] ? u : u * u * (3 - 2 * u);
  return [kit.lerp(a[1], b[1], e), kit.lerp(a[2], b[2], e) + 0.7 * Math.sin(t * 1.3), kit.lerp(a[3], b[3], e)];
}
const lureOf = (f, t) => {
  const a = kit.lerp(7.2, 6.6, Math.abs(f[2]));
  const af = Math.abs(f[2]);
  return [f[0] + f[2] * (a + 2.2) + 0.5 * Math.sin(t * 2.6), f[1] - kit.lerp(5.6, 2.2, af) + 0.6 * Math.sin(t * 1.9)];
};

/** The anglerfish: a dark body lit only by its own lure, eye, teeth, tail. */
function drawFish(ctx, f, lure, t, dim) {
  const [x, y, ff] = f, af = Math.abs(ff), a = kit.lerp(7.2, 6.6, af), b = 3.7;
  for (const i of ctx.layout.index.near(x, y, a + 3)) {
    const l = ctx.leds[i], dx = l.x - x, dy = l.y - y;
    const bb = b * (1 - 0.35 * af * kit.clamp((-ff * dx) / a));      // big head, tapering to the tail
    const cov = 1 - kit.smoothstep(0.45, 1.3, (dx / a) ** 2 + (dy / bb) ** 2);
    if (cov <= 0) continue;
    const lit = Math.exp(-((l.x - lure[0]) ** 2 + (l.y - lure[1]) ** 2) / 50);
    kit.over(ctx, i, kit.scale(C.BODY, (0.1 + 0.45 * lit) * dim), 0.95 * cov);
  }
  const wag = Math.sin(t * 7);
  kit.splat(ctx, x - ff * (a + 2.4), y + 1.3 * wag, 3.2, C.BODY, 0.25 * af * dim);
  // stalk, from the forehead to the lure
  kit.splat(ctx, (x + ff * a * 0.4 + lure[0]) / 2, (y - b + lure[1]) / 2 + 0.6, 2.2, C.BODY, 0.3 * dim);
  // eyes: one in profile, two when it looks in
  const ey = y - kit.lerp(2, 1.4, af), sep = 4.2 * (1 - af);
  kit.splat(ctx, x + ff * a * 0.4 - sep, ey, 2.3, C.EYE, 0.55 * dim);
  if (af < 0.9) kit.splat(ctx, x + ff * a * 0.4 + sep, ey, 2.3, C.EYE, 0.55 * (1 - af) * dim);
  // teeth: the underbite in profile, a grin from the front
  kit.splat(ctx, x + ff * (a - 0.4), y + 1.5, 2.4, C.TOOTH, 0.45 * af * dim);
  for (const s of [-2.4, 0, 2.4]) kit.splat(ctx, x + s, y + 2.2 - Math.abs(s) * 0.15, 2.0, C.TOOTH, 0.22 * (1 - af) * dim);
  // the lure: the brightest thing in the sea
  const pulse = 0.85 + 0.15 * Math.sin(t * 3.1);
  kit.splat(ctx, lure[0], lure[1], 3.4, C.LURE, 1.2 * pulse * dim);
}

// ------------------------------------------------------------ the hour
// tau is seconds from the hour. -6.5..-1 the sub climbs (the water lightens,
// sun rays), -1..-0.1 the sea drains off the glass top to bottom, 0..0.9 a
// wave breaks across it and leaves the new time as drops, 4.8..6.2 the sea
// climbs back over the glass, then the deep goes dark again.
function airAt(x, y, tau) {
  if (tau < -1 || tau >= 6.2) return 0;
  if (tau < -0.1) {
    const yl = -36 + (72 * (tau + 1)) / 0.9 + 2.5 * Math.sin(x * 0.18 + tau * 7);
    return kit.smoothstep(yl + 1.5, yl - 1.5, y);
  }
  if (tau < 4.8) return 1;
  const yr = 36 - (72 * (tau - 4.8)) / 1.4 + 2.5 * Math.sin(x * 0.2 - tau * 6);
  return kit.smoothstep(yr + 1.5, yr - 1.5, y);
}
const depthLight = (tau) => (tau < -0.5 ? kit.smoothstep(-6.5, -0.5, tau) : 1 - kit.smoothstep(5, 8.5, tau));
/** When the breaking wave's front passes (x, y). */
const frontAt = (x, y) => ((x + 0.3 * y + 2.5 * Math.sin(y * 0.25) + 46) * 0.9) / 100;
/** When the sea climbing back over the glass passes height y. */
const diveAt = (y) => 4.8 + ((36 - y) * 1.4) / 72;
/** Horizon, outside, as the surfaced sub rolls. */
const horizon = (x, tau) => 1.2 * Math.sin(tau * 1.6) + x * 0.1 * Math.sin(tau * 1.1 + 1);

const SKY = {
  day: { top: [0.0, 0.008, 0.07], low: [0.012, 0.06, 0.2], sun: kit.hex('#ffd9a0'), sea: [0.0, 0.018, 0.035], drop: kit.hex('#fff1d6') },
  night: { top: [0.0, 0.002, 0.02], low: [0.004, 0.015, 0.06], sun: kit.hex('#c8d4ff'), sea: [0.0, 0.006, 0.014], drop: kit.hex('#b9c9ff') },
};
// ------------------------------------------------------------ plankton
/**
 * One organism of a digit. Hour plankton are siphonophore chains: a steady
 * glow with a pulse running round the letter. Minute plankton are
 * dinoflagellates and twinkle. Both flare in the lure's light and when
 * stirred; on the glass after surfacing (drop = 1) they are water drops.
 */
function organism(ctx, g, x, y, s, j, n, t, lure, stir, a, drop, sky, dim) {
  if (a <= 0.002) return;
  let b = s.hour ? 0.38 + 0.5 * Math.max(0, Math.cos((TAU * j) / n - t * 1.4)) ** 6
    : 0.32 + 0.36 * kit.noise2(t * 1.8 + j * 7.1, s.k * 3.3);
  b += 1.1 * Math.exp(-((x - lure[0]) ** 2 + (y - lure[1]) ** 2) / 110) + 1.3 * stir;
  let c = kit.scale(kit.mix(s.hour ? C.HOUR : C.MIN, C.FLASH, kit.clamp(0.25 * (b - 1) + 0.6 * stir, 0, 0.75)), b);
  if (drop > 0) {
    const glint = Math.max(0, Math.sin((x - y) * 0.12 - t * 2.5)) ** 12;
    c = kit.mix(c, kit.scale(sky.drop, 0.85 + 0.6 * glint), drop);
  }
  const w = 0;
  mote(ctx, g, x + w * Math.sin(t * 1.3 + j * 2.1 + s.k), y + w * Math.cos(t * 1.1 + j * 1.7), c, a * dim, drop);
}

const AIR = new Float32Array(256);

export default {
  name: 'Porthole',
  blurb: 'deep-sea porthole: plankton spell the time, an anglerfish stirs them anew each minute, the sub surfaces on the hour',
  layouts: ['oct'], look: 'smoke', fps: 60, brightness: 0.7, dither: true,
  frame(ctx) {
    const g = grid(ctx), leds = ctx.leds, near = (x, y, r) => ctx.layout.index.near(x, y, r);
    const t = ctx.date.getTime() / 1000;
    const Bn = Math.round(t / 60) * 60, tau = t - Bn;
    const old = timeStr(Bn - 60), nw = timeStr(Bn);
    const show = isHourStart(Bn) && tau > -7 && tau < 9;
    const dim = 1 - 0.7 * ctx.night;
    const hNew = new Date(Bn * 1000).getHours();
    const sky = SKY[hNew >= 19 || hNew < 7 ? 'night' : 'day'];
    const trail = [];
    for (let k = 0; k <= 10; k++) trail.push(fishAt(t - 0.11 * k));
    const fish = trail[0], lure = lureOf(fish, t);
    const water = (i) => (show ? 1 - AIR[i] : 1);

    // the sea (and, surfaced, the sky)
    if (show) {
      const L = depthLight(tau), L15 = L ** 1.5;
      for (const l of leds) {
        const a = (AIR[l.i] = airAt(l.x, l.y, tau)), up = kit.clamp((26 - l.y) / 56);
        let r = 0, gg = 0, bb = 0;
        if (a < 1) {
          const ray = kit.smoothstep(0.55, 0.85, kit.noise2((l.x + 0.45 * l.y) * 0.09 + t * 0.12, 3.7)) * up;
          const wk = (0.3 + 0.7 * up) * L15, rk = ray * L * 0.7;
          r = C.WATER[0] * wk + C.RAY[0] * rk; gg = C.WATER[1] * wk + C.RAY[1] * rk; bb = C.WATER[2] * wk + C.RAY[2] * rk;
        }
        if (a > 0) {
          const hy = horizon(l.x, tau);
          let c;
          if (l.y < hy) {
            c = kit.mix(sky.low, sky.top, kit.clamp((hy - l.y) / 28));
            if (sky === SKY.night && kit.hash(l.i, 5) > 0.92) c = kit.mix(c, sky.sun, 0.12 * (0.6 + 0.4 * Math.sin(t * 3 + l.i)));
          } else {
            c = kit.scale(sky.sea, 1 - 0.5 * kit.clamp((l.y - hy) / 30));
            if (Math.abs(l.x) < 3 + (l.y - hy) * 0.2 && kit.hash(l.i, Math.floor(t * 7)) > 0.82) c = kit.mix(c, sky.sun, 0.3);
          }
          const sd = l.x * l.x + (l.y - horizon(0, tau) + 2.5) ** 2;
          const sun = (Math.exp(-sd / 8) + 0.25 * Math.exp(-sd / 45)) * kit.smoothstep(hy + 1.5, hy - 1, l.y);
          c = kit.mix(c, sky.sun, kit.clamp(sun));
          r = r * (1 - a) + c[0] * a; gg = gg * (1 - a) + c[1] * a; bb = bb * (1 - a) + c[2] * a;
        }
        kit.set(ctx, l.i, [r, gg, bb], dim);
      }
    }

    // marine snow; it streams down past the glass as the sub climbs, up as it dives
    const lift = show ? 40 * kit.smoothstep(-6.5, -1, tau) - 40 * kit.smoothstep(4.8, 7.5, tau) : 0;
    for (let k = 0; k < 5; k++) {
      const y = ((((t * (1.5 + 1.5 * kit.hash(k, 1)) + lift + kit.hash(k, 2) * 80) % 80) + 80) % 80) - 40;
      const x = (kit.hash(k, 3) - 0.5) * 60 + 3 * Math.sin(t * 0.25 + k * 2);
      const nl = Math.exp(-((x - lure[0]) ** 2 + (y - lure[1]) ** 2) / 120);
      mote(ctx, g, x, y, C.SNOW, (0.035 + 0.25 * nl) * (show ? 1 - airAt(x, y, tau) : 1) * dim);
    }

    // dormant plankton spark in the fish's wake, as much as it moves
    for (let k = 1; k <= 10; k++) {
      const p = trail[k], q = trail[k - 1], mv = kit.clamp(Math.hypot(p[0] - q[0], p[1] - q[1]) / 1.2);
      if (mv < 0.02) continue;
      for (const i of near(p[0], p[1], 5.5)) {
        if (kit.hash(i, 3) > 0.45) continue;
        const l = leds[i], d = Math.hypot(l.x - p[0], l.y - p[1]) / 5.5;
        kit.add(ctx, i, C.SPARK, 0.55 * mv * (1 - k / 11) ** 2 * (1 - d) * (0.6 + 0.4 * Math.sin(t * 23 + i)) * water(i) * dim);
      }
    }

    // the porthole's brass rim glints where the lure's light reaches it; the bolts more
    for (const [i, bolt] of rim(ctx, g)) {
      const l = leds[i], lit = Math.max(0, Math.exp(-((l.x - lure[0]) ** 2 + (l.y - lure[1]) ** 2) / 400) - 0.08) / 0.92;
      kit.add(ctx, i, C.BRASS, ((bolt ? 0.06 : 0) + (bolt ? 0.6 : 0.3) * lit + (show ? (bolt ? 0.3 : 0.06) * AIR[i] : 0)) * dim);
    }

    // the breaking wave: a foam front, then a sheet of water draining away
    if (show && tau > -0.3 && tau < 3) {
      for (const l of leds) {
        const d = tau - frontAt(l.x, l.y);
        if (d < -0.25) continue;
        const foam = Math.exp(-((d / 0.08) ** 2)) * (0.65 + 0.35 * kit.noise2(l.y * 0.35, tau * 6));
        kit.add(ctx, l.i, C.FOAM, 0.7 * foam * dim);
        if (d > 0) kit.add(ctx, l.i, C.SHEET, 0.4 * Math.exp(-d * 2.2) * dim);
      }
    }

    // the time, in plankton
    const speed = Math.hypot(fish[0] - trail[1][0], fish[1] - trail[1][1]) / 0.11;
    const stirAt = (x, y) => kit.clamp(speed / 40) * Math.exp(-((x - fish[0]) ** 2 + (y - fish[1]) ** 2) / 30);
    for (const s of SLOTS) {
      const o = old[s.k], n = nw[s.k];
      if (show) {
        if (tau < -0.1) {
          homes(o, s).forEach(([x, y], j, A) => organism(ctx, g, x, y, s, j, A.length, t, lure, 0, 1 - airAt(x, y, tau), 0, sky, dim));
        } else if (tau >= 0) {
          homes(n, s).forEach(([x, y], j, A) => {
            const a = kit.smoothstep(0, 0.35, tau - frontAt(x, y)), td = diveAt(y);
            organism(ctx, g, x, y, s, j, A.length, t, lure, 0, a, 1 - kit.smoothstep(td, td + 0.7, tau), sky, dim);
          });
        }
        continue;
      }
      const u = o !== n ? (tau - passTime(Bn, s.k)) / 2.4 : 2;
      if (u <= 0 || u >= 1) {
        homes(u <= 0 ? o : n, s).forEach(([x, y], j, A) => organism(ctx, g, x, y, s, j, A.length, t, lure, stirAt(x, y), 1, 0, sky, dim));
        continue;
      }
      // stirred: burst outward, whirl once round in the wake, settle as the new digit
      const e = kit.ease.out(u), burst = (1 - Math.exp(-u * 14)) * (1 - u) ** 2, pr = pairs(o, n, s);
      pr.forEach((p, j) => {
        const th = p.ta + (p.dt + TAU) * e, r = kit.lerp(p.ra, p.rb, e) + 4.5 * (0.6 + 0.8 * p.ph) * burst;
        const x = s.x + r * Math.cos(th) - 3 * burst, y = s.y + r * Math.sin(th);
        organism(ctx, g, x, y, s, j, pr.length, t, lure, Math.max(stirAt(x, y), Math.exp(-u * 4)), kit.lerp(p.a0, p.a1, e), 0, sky, dim);
      });
    }

    // bubbles stream up as the sub dives
    if (show && tau > 4.6) {
      for (let k = 0; k < 12; k++) {
        const y = 36 - (tau - 4.6 - kit.hash(k, 12) * 1.6) * 34;
        if (y > 36 || y < -36) continue;
        const x = (kit.hash(k, 11) - 0.5) * 56 + 1.5 * Math.sin(t * 4 + k);
        mote(ctx, g, x, y, C.BUBBLE, 0.4 * (1 - airAt(x, y, tau)) * (1 - kit.smoothstep(7, 9, tau)) * dim);
      }
    }

    drawFish(ctx, fish, lure, t, dim);
  },
};
