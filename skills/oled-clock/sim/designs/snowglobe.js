// Snow Globe — the time is snow, in a glass globe on a turned base.
//
// A glass sphere fills the panel (the top cropped, as in a close-up), with
// a crescent of window light on its upper left; inside, a snowy ground,
// two pines at the edges, and the time moulded from packed snow in chubby,
// round-ended digits: solid where the snow faces up, fluffed along their
// tops, a looser crust underneath, a few dark sparkle gaps. The colon is a
// snowman (two balls and a head, a hat, twig arms). The base carries a
// plate with the date. Flakes drift down through the water all the time,
// at three depths (near ones bigger, faster, swaying wider) with a lazy
// analytic swirl.
//
// The minute: a hand tips the globe back (anticipation), gives it a shake
// at :58.4 and lets go; it rocks to rest on a damped spring about the foot
// of its base, and the free snow is stirred. The changing digit's snow
// lifts off flake by flake into a vortex, a column of snow turning about a
// vertical axis above its slot, wider at the top and slowly climbing. By
// :59.7 every flake of the old digit is in the air. From :00.25 each flake
// is given a place in the new digit and falls to it with drag and flutter,
// in a random order, so the new digit is dusted in everywhere at once and
// thickens (never built up in a way that reads as another digit). Spare
// flakes fall to the ground; extra ones come in from above.
//
// The hour: the globe is picked up, tipped back and shaken hard; all four
// digits and the snow on the ground are torn up into one blizzard that
// fills the globe; it is spun round once on its base (a turntable: the
// pines and the snowman squeeze to the axis and open out again, mirrored
// and back, and the studs round the plinth slide by); the snowman's hat
// blows off and floats back; the globe is set down with a bump, and the
// whole new time settles out of the blizzard.
//
// Everything is a function of the clock. The scene is drawn in the globe's
// own frame into a raster, and the glass shows it through the inverse of
// the globe's tilt, shift and spin; a flake's path is closed-form in the
// time from the turn (lift, vortex, fall), the flakes of a turn are built
// from its minute key (cached), and a digit's snow is seeded by the minute
// it was made, so every new digit is new snow.
//
// Burn-in: the globe walks kit.orbit, the digits are new snow each time
// they change, and 23:00-07:00 the panel dims.

import { clockFields, orbit, font3x5 } from '../js/kit.js';

const W = 128, H = 64;
const TAU = Math.PI * 2;
const clamp01 = (u) => (u < 0 ? 0 : u > 1 ? 1 : u);
const smooth = (u) => { u = clamp01(u); return u * u * (3 - 2 * u); };
const bump = (t, a, b, c, d) => smooth((t - a) / (b - a)) * (1 - smooth((t - c) / (d - c)));
const inOut = (u) => { u = clamp01(u); return u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2; };

/** A good integer hash as a float in [0, 1). */
function hash(a, b, c) {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// ------------------------------------------------------------ the globe
// Everything inside is laid out in the globe's own frame ("local"), at rest.

const GC = [64, 40], GR = 46;          // the glass sphere
const BASE_Y = 56;                     // where the glass meets the base
const PIVOT = [64, 64];                // the globe rocks about the foot of its base
const groundY = (x) => 48.6 - 2.4 * Math.exp(-(((x - 64) / 30) ** 2)) + 0.7 * Math.sin(x / 6.5);

// ------------------------------------------------------------ letterforms
//
// Chubby, soft digits, as if moulded from packed snow: round-ended strokes
// of even weight in a 15 x 28 box, heavy bowls, a 4 with an open top. The
// snow lies thickest on the upper faces: those are solid and fluffed at the
// edge, the undersides a looser crust.

const DW = 15, DH = 28, HW = 2.45;
function arc(cx, cy, rx, ry, a0, a1, n = 24) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + (a1 - a0) * (i / n)) * Math.PI) / 180;
    pts.push([cx + rx * Math.sin(a), cy - ry * Math.cos(a)]);
  }
  return pts;
}
function quad(a, c, b, n = 12) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, v = 1 - u;
    pts.push([v * v * a[0] + 2 * u * v * c[0] + u * u * b[0], v * v * a[1] + 2 * u * v * c[1] + u * u * b[1]]);
  }
  return pts;
}
const L = (...p) => p;
const SK = {
  0: [arc(7.5, 14, 5, 11.5, 0, 360, 36)],
  1: [L([8.6, 2.6], [8.6, 25.4]), L([8.6, 2.6], [3.6, 7])],
  2: [[...arc(7.5, 8, 5, 5.5, -80, 130, 20), [2.6, 25.4], [12.6, 25.4]]],
  3: [arc(7.2, 7.6, 4.8, 5.1, -80, 185, 20), arc(7.2, 19.3, 5.3, 6.1, -5, 245, 22)],
  4: [L([10.6, 25.4], [10.6, 2.6]), L([10.6, 2.6], [2.6, 18.6]), L([2.6, 18.6], [12.8, 18.6])],
  5: [[[12.4, 2.6], [3.6, 2.6], [3.1, 12.6], ...arc(7.4, 18.6, 5.1, 6.8, -50, 238, 22)]],
  6: [arc(7.5, 19.4, 5, 6.1, 0, 360, 30), arc(9.8, 15.4, 7.2, 12.8, -100, 38, 22)],
  7: [[[2.6, 2.6], [12.6, 2.6], ...quad([12.6, 2.6], [8.4, 12], [6.2, 25.4]).slice(1)]],
  8: [arc(7.5, 7.7, 4.3, 5.1, 0, 360, 28), arc(7.5, 19.3, 5.1, 6.2, 0, 360, 30)],
};
SK[9] = SK[6].map((p) => p.map(([x, y]) => [DW - x, DH - y]));

// Signed distance tiles, at pixel centres, with a margin.
const TM = 2, TW = DW + 2 * TM, TH = DH + 2 * TM;
const SDF = {};
for (const [d, paths] of Object.entries(SK)) {
  const segs = [];
  for (const p of paths) for (let i = 1; i < p.length; i++) segs.push([...p[i - 1], ...p[i]]);
  const f = new Float32Array(TW * TH);
  for (let j = 0; j < TH; j++)
    for (let i = 0; i < TW; i++) {
      const px = i + 0.5 - TM, py = j + 0.5 - TM;
      let best = 99;
      for (const [ax, ay, bx, by] of segs) {
        const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
        const u = l2 ? clamp01(((px - ax) * dx + (py - ay) * dy) / l2) : 0;
        const e = Math.hypot(px - ax - u * dx, py - ay - u * dy) - HW;
        if (e < best) best = e;
      }
      f[j * TW + i] = best;
    }
  SDF[d] = f;
}
const sdf = (f, i, j) => (i < 0 || j < 0 || i >= TW || j >= TH ? 9 : f[j * TW + i]);

/**
 * One digit as snow: the list of its lit pixels (tile coordinates), for a
 * seed (fresh snow every time it is made). Solid where the snow faces up,
 * a looser crust underneath, a fluffy fringe on the tops, and a few dark
 * sparkle gaps.
 */
const snowCache = new Map();
function snowOf(d, seed) {
  const key = `${d}:${seed}`;
  let v = snowCache.get(key);
  if (v) return v;
  const f = SDF[d];
  const xs = [], ys = [];
  for (let j = 0; j < TH; j++)
    for (let i = 0; i < TW; i++) {
      const e = sdf(f, i, j);
      if (e > 1) continue;
      // Outward normal from the field's gradient: ny < 0 faces up.
      const gx = sdf(f, i + 1, j) - sdf(f, i - 1, j), gy = sdf(f, i, j + 1) - sdf(f, i, j - 1);
      const ny = gy / (Math.hypot(gx, gy) || 1);
      const r = hash(i, j, seed);
      let on;
      if (e > 0) on = ny < -0.45 && r < 0.45 * (1 - e);        // fluff on top
      else if (e > -1.1) on = ny < -0.2 ? r < 0.97 : r < 0.62;  // the skin: firm on top, crusty below
      else on = r > 0.05;                                         // packed core, a few sparkle gaps
      if (on) { xs.push(i - TM); ys.push(j - TM); }
    }
  v = { n: xs.length, xs: Int8Array.from(xs), ys: Int8Array.from(ys) };
  snowCache.set(key, v);
  if (snowCache.size > 40) snowCache.delete(snowCache.keys().next().value);
  return v;
}

// ------------------------------------------------------------ layout

const SLOT_X = [26, 43, 70, 87];
const TOP = 18;

// ------------------------------------------------------------ the scene raster
// The inside of the globe and its base, drawn in the globe's own frame;
// the glass then shows it rocked, shifted and spun.

const SCN = new Uint8Array(W * H);
const sset = (x, y, v = 1) => { if (x >= 0 && y >= 0 && x < W && y < H) SCN[y * W + x] = v; };
function sdisc(cx, cy, r, v = 1) {
  for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++)
    for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++)
      if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) sset(x, y, v);
}
function sline(x0, y0, x1, y1, v = 1) {
  const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))) || 1;
  for (let i = 0; i <= n; i++) sset(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), v);
}

/** The snowy ground: a lit crest line over a sparse speckle of snow. */
const GROUND = (() => {
  const px = [];
  for (let x = 16; x < 112; x++) {
    const y0 = groundY(x + 0.5), top = Math.round(y0);
    px.push(x, top);
    for (let y = top + 1; y < BASE_Y; y++) {
      const d = y - top;
      if (hash(x, y, 3) < (d === 1 ? 0.5 : d === 2 ? 0.22 : 0.07)) px.push(x, y);
    }
  }
  return px;
})();

const PINE = [
  '...#...',
  '..###..',
  '.#.#.#.',
  '..###..',
  '.##.##.',
  '#.###.#',
  '.#####.',
  '#.#.#.#',
  '...#...',
].map((r) => [...r].map((c) => c === '#'));

function drawPine(cx, by) {
  const h = PINE.length, w = PINE[0].length;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (PINE[j][i]) sset(cx - (w >> 1) + i, by - h + j);
}

/** The snowman: he is the colon. Three balls, a hat, twig arms, coal eyes. */
function drawSnowman(cx, by, hatLift) {
  const b0 = [cx, by - 4.4, 4.4], b1 = [cx, by - 11.2, 3.2], b2 = [cx, by - 16.6, 2.5];
  sdisc(b0[0], b0[1], b0[2]);
  sdisc(b1[0], b1[1], b1[2] + 0.8, 0); sdisc(b1[0], b1[1], b1[2]);
  sdisc(b2[0], b2[1], b2[2] + 0.8, 0); sdisc(b2[0], b2[1], b2[2]);
  const hx = Math.round(cx - 0.5), hy = Math.round(b2[1] - 0.5);
  // Eyes, carrot, buttons.
  sset(hx - 1, hy - 1, 0); sset(hx + 1, hy - 1, 0);
  sset(hx + 1, hy, 0); sset(hx + 3, hy, 1); sset(hx + 4, hy, 1);
  sset(hx, hy + 5, 0); sset(hx, hy + 7, 0);
  // Arms.
  sline(hx - 3, hy + 6, hx - 7, hy + 3); sset(hx - 7, hy + 2); sset(hx - 8, hy + 3);
  sline(hx + 3, hy + 6, hx + 7, hy + 3); sset(hx + 7, hy + 2); sset(hx + 8, hy + 3);
  // The hat: a brim and a crown, in outline.
  const ty = Math.round(hy - 3 - hatLift);
  for (let x = hx - 3; x <= hx + 3; x++) sset(x, ty);
  for (let y = ty - 3; y < ty; y++) { sset(hx - 2, y); sset(hx + 2, y); }
  for (let x = hx - 2; x <= hx + 2; x++) sset(x, ty - 3);
}

/** The base: a turned plinth, its ornament (which turns with the globe) and a plate with the date. */
function drawBase(phi, label) {
  const y0 = BASE_Y, y1 = 63;
  const xl = (y) => 21 - ((y - y0) / (y1 - y0)) * 6, xr = (y) => 107 + ((y - y0) / (y1 - y0)) * 6;
  for (let y = y0; y <= y1; y++) { sset(Math.round(xl(y)), y); sset(Math.round(xr(y)), y); }
  for (let x = Math.round(xl(y1)); x <= Math.round(xr(y1)); x++) sset(x, y1);
  for (let x = 21; x <= 107; x++) sset(x, y0);
  // Studs round the plinth, seen as it turns.
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * TAU + phi;
    if (Math.cos(a) < 0.15) continue;
    sset(Math.round(64 + 46 * Math.sin(a)), y0 + 4);
  }
  // The plate.
  const w = font3x5.measure(label);
  const x0 = Math.round(64 - w / 2);
  // The base is only 6 rows tall (y0..63), so the 5-row label sits at y0+1 to keep its bottom row on the glass.
  for (let y = y0 + 1; y <= y1; y++) for (let x = x0 - 3; x <= x0 + w + 2; x++) sset(x, y, 0);
  textInto(label, x0, y0 + 1);
  for (let y = y0; y <= y1; y++) { sset(x0 - 3, y); sset(x0 + w + 2, y); }
}

function textInto(str, x, y) {
  for (const ch of str) {
    const gl = font3x5.glyph(ch);
    if (gl) for (let j = 0; j < gl.h; j++) for (let i = 0; i < gl.w; i++) if (gl.data[j * gl.w + i]) sset(x + i, y + j);
    x += (gl?.w ?? 3) + 1;
  }
}

// ------------------------------------------------------------ the turns

const fieldsCache = new Map();
function fieldsOf(key) {
  let f = fieldsCache.get(key);
  if (!f) {
    f = clockFields(new Date(key * 60000));
    fieldsCache.set(key, f);
    if (fieldsCache.size > 8) fieldsCache.delete(fieldsCache.keys().next().value);
  }
  return f;
}
const digitsOf = (f) => `${f.hh}${f.mm}`;

function turnOf(f) {
  const late = f.sec >= 40;
  const key = f.minuteKey + (late ? 1 : 0);
  const tau = late ? f.sec - 60 : f.sec;
  const a = digitsOf(fieldsOf(key - 1)), b = digitsOf(fieldsOf(key));
  const hour = fieldsOf(key).m === 0;
  const changed = hour ? [0, 1, 2, 3] : [0, 1, 2, 3].filter((k) => a[k] !== b[k]);
  return { key, tau, hour, changed, a, b };
}

/** The seed of the snow in slot k when it was last made: the turn that made it. */
function seedOf(k, key) {
  const f = fieldsOf(key);
  const m = k === 3 ? f.m : k === 2 ? f.m - (f.m % 10) : 0;
  return ((f.year * 400 + f.day * 13 + f.h) * 60 + m) * 4 + k;
}
function madeAt(k, key) {
  // The minute key at which slot k's current digit was last made.
  const f = fieldsOf(key);
  const back = k === 3 ? 0 : k === 2 ? f.m % 10 : f.m;
  return key - back;
}

/**
 * How the globe moves: tilt (radians, about the foot of the base), shift,
 * and its spin on its base (the hour), as functions of the time from the
 * turn. The minute: a hand tips it back, gives it a shake and lets go; it
 * rocks to rest on a damped spring. The hour: it is lifted, shaken hard,
 * spun round once, and set down with a bump.
 */
function motion(turn) {
  const t = turn.tau;
  let th = 0, dx = 0, dy = 0, phi = 0, stir = 0;
  if (!turn.hour) {
    th = -0.045 * smooth((t + 3) / 1.1) * (1 - smooth((t + 1.75) / 0.15));
    if (t > -1.6) {
      const u = t + 1.6, env = Math.exp(-u / 0.75);
      th += 0.11 * env * Math.sin(TAU * 2.1 * u);
      dx = 2.6 * env * Math.sin(TAU * 2.1 * u + 0.7);
      stir = env;
    }
  } else {
    dy = -3.2 * bump(t, -4.4, -3.5, 0.3, 0.72);
    if (t > 0.72) dy += -1.6 * Math.exp(-(t - 0.72) * 7) * Math.abs(Math.sin(16 * (t - 0.72)));
    th = -0.07 * smooth((t + 4.2) / 1.0) * (1 - smooth((t + 3.15) / 0.15));
    if (t > -3) {
      const u = t + 3, env = Math.exp(-u / 1.1);
      th += 0.2 * env * Math.sin(TAU * 2.4 * u);
      dx = 4 * env * Math.sin(TAU * 2.4 * u + 0.7);
      stir = Math.min(1.4, 1.6 * env + bump(t, -3, -2, 0, 2));
    }
    phi = TAU * inOut((t + 2.2) / 2.8);
  }
  return { th, dx, dy, phi, stir };
}

// ------------------------------------------------------------ the flakes of a turn
//
// The changing digit's snow lifts, flake by flake, into a vortex in the
// water; at :00 each flake is given a place in the new digit and falls to
// it with drag and flutter, landing in a random order so the digit is
// dusted in everywhere at once. Old flakes beyond the new digit's count
// fall to the ground; extra new ones come in from above.

const flakesCache = new Map();
function flakesOf(turn) {
  const ck = turn.key;
  let fl = flakesCache.get(ck);
  if (fl) return fl;
  const out = [];
  const hour = turn.hour;
  const L0 = hour ? -2.7 : -1.5, LS = hour ? 1.3 : 0.5;
  const T0 = hour ? 0.75 : 0.25, TS = hour ? 3.1 : 2.4;
  for (const k of turn.changed) {
    const A = snowOf(turn.a[k], seedOf(k, madeAt(k, turn.key - 1)));
    const B = snowOf(turn.b[k], seedOf(k, turn.key));
    const n = Math.max(A.n, B.n);
    const cx = SLOT_X[k] + DW / 2;
    for (let i = 0; i < n; i++) {
      const h = (s) => hash(i, k * 31 + s, turn.key);
      const hasA = i < A.n, hasB = i < B.n;
      out.push({
        sx: hasA ? SLOT_X[k] + A.xs[i] + 0.5 : cx + (h(1) - 0.5) * 40, sy: hasA ? TOP + A.ys[i] + 0.5 : -6 - 6 * h(2),
        gx: hasB ? SLOT_X[k] + B.xs[i] + 0.5 : SLOT_X[k] + h(3) * DW, gy: hasB ? TOP + B.ys[i] + 0.5 : groundY(SLOT_X[k] + h(3) * DW),
        hasA, hasB,
        li: L0 + LS * h(4) - (hasA ? 0 : 0.3),
        hy: hour ? 8 + 42 * h(11) : TOP + 2 + 24 * h(11),
        r0: 0,
        a0: TAU * h(6), w: (hour ? 4.5 : 5.5) * (0.7 + 0.6 * h(7)),
        ti: T0 + TS * h(8), fd: 0.8 + 0.5 * h(9), fl: TAU * h(10),
        cx: hour ? 64 : cx, cy: hour ? 30 : TOP + 9,
      });
    }
  }
  // The hour stirs the ground snow up too, and it falls back.
  if (hour)
    for (let i = 0; i < 260; i++) {
      const h = (s) => hash(i, 900 + s, turn.key);
      const x0 = 20 + 88 * h(1), x1 = 20 + 88 * h(2);
      out.push({
        sx: x0, sy: groundY(x0), gx: x1, gy: groundY(x1), hasA: false, hasB: false, ground: true,
        li: -2.9 + 1.4 * h(4), hy: 8 + 42 * h(11), r0: 0, a0: TAU * h(6), w: 4.5 * (0.7 + 0.6 * h(7)),
        ti: 0.5 + 3.6 * h(8), fd: 0.8 + 0.6 * h(9), fl: TAU * h(10), cx: 64, cy: 30,
      });
    }
  for (const p of out) {
    const h5 = hash(p.a0 * 1000, 5, turn.key);
    p.r0 = hour ? 4 + 38 * Math.sqrt(h5) : (3 + 9 * (1 - (p.hy - TOP) / 26)) * (0.3 + 0.7 * h5);
  }
  fl = out;
  flakesCache.set(ck, fl);
  if (flakesCache.size > 3) flakesCache.delete(flakesCache.keys().next().value);
  return fl;
}

/**
 * Where flake `p` is at time t (from the turn), in the globe's frame, or
 * null if it is lying in a digit (old or new) or melted into the ground.
 * Returns 1 if it lies in the new digit (landed), 2 in the old one.
 */
function flakeAt(p, t, out, hour) {
  if (t < p.li) return p.hasA ? 2 : p.ground ? 0 : 0;
  if (t >= p.ti) return p.hasB ? 1 : 0;
  // The vortex: a column of snow turning about a vertical axis, seen from
  // the side, so each flake runs round a flat ellipse at its own height;
  // the column is wider at the top, and slowly climbs.
  const u = t - p.li;
  const rise = hour ? 3 * Math.sin(0.9 * u) : 5 * smooth(u / 1.4);
  const hgt = p.hy - rise;
  const r = p.r0 * (0.75 + 0.25 * Math.sin(1.3 * t + p.fl));
  const a = p.a0 + p.w * u / (1 + r / (hour ? 22 : 8));
  const vx = p.cx + r * Math.cos(a), vy = hgt + r * Math.sin(a) * 0.28;
  const m1 = smooth(u / 0.7);
  let x = p.sx + (vx - p.sx) * m1, y = p.sy + (vy - p.sy) * m1;
  const t2 = t - (p.ti - p.fd);
  if (t2 > 0) {
    const m2 = t2 / p.fd, e = inOut(m2);
    x += (p.gx - x) * e + 1.8 * Math.sin(10 * t + p.fl) * Math.sin(Math.PI * m2);
    y += (p.gy - y) * e;
  }
  out[0] = x; out[1] = y;
  return 3;
}

// ------------------------------------------------------------ free snow
// Flakes drifting down through the water all the time, at three depths
// (near ones bigger, faster and swaying wider), with a lazy analytic swirl,
// stirred hard by a shake.

const FREE = Array.from({ length: 46 }, (_, i) => ({
  x: 18 + 92 * hash(i, 1, 77), y: 64 * hash(i, 2, 77), z: hash(i, 3, 77),
  ph: TAU * hash(i, 4, 77), w: 0.5 + 0.7 * hash(i, 5, 77),
}));

// ------------------------------------------------------------ the face

const OUT = [0, 0];

export default {
  name: 'Snow Globe',
  blurb: 'The time moulded from snow in a glass globe, a snowman for a colon: a shake lifts the changing digit into a swirling column and it resettles as the new one; a spin and a blizzard on the hour.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,

  frame(g, { date, fields: f, oled, night }) {
    const E = date.getTime() / 1000, T = E - 1.7e9;
    const [ox, oy] = orbit(date, 2, 3);
    const turn = turnOf(f);
    const t = turn.tau;
    const mo = motion(turn);
    const live = turn.changed.length && t > -6 && t < 6;
    const flakes = live ? flakesOf(turn) : null;

    // --- the scene, in the globe's frame
    SCN.fill(0);
    for (let i = 0; i < GROUND.length; i += 2) SCN[GROUND[i + 1] * W + GROUND[i]] = 1;
    drawPine(22, Math.round(groundY(22)) + 1);
    drawPine(106, Math.round(groundY(106)) + 1);
    const hatLift = turn.hour ? 9 * bump(t, -2.4, -1.6, 0.6, 1.6) : 0;
    drawSnowman(64.5, Math.round(groundY(64)) + 1, hatLift);
    const digits = digitsOf(f);
    for (let k = 0; k < 4; k++) {
      if (live && turn.changed.includes(k)) continue;
      const sn = snowOf(digits[k], seedOf(k, madeAt(k, f.minuteKey)));
      for (let i = 0; i < sn.n; i++) sset(SLOT_X[k] + sn.xs[i], TOP + sn.ys[i]);
    }
    const flying = [];
    if (flakes)
      for (const p of flakes) {
        const st = flakeAt(p, t, OUT, turn.hour);
        if (st === 1) sset(Math.floor(p.gx), Math.floor(p.gy));
        else if (st === 2) sset(Math.floor(p.sx), Math.floor(p.sy));
        else if (st === 3) flying.push(OUT[0], OUT[1]);
      }
    drawBase(mo.phi, `${f.dow} ${f.day}`);

    // --- the glass shows it, rocked and shifted
    const c = Math.cos(mo.th), s = Math.sin(mo.th);
    const offx = ox + mo.dx, offy = oy + mo.dy;
    const cphi = Math.cos(mo.phi);
    const toScreen = (x, y) => {
      const lx = x - PIVOT[0], ly = y - PIVOT[1];
      OUT[0] = PIVOT[0] + c * lx - s * ly + offx; OUT[1] = PIVOT[1] + s * lx + c * ly + offy;
    };
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const qx = x + 0.5 - PIVOT[0] - offx, qy = y + 0.5 - PIVOT[1] - offy;
        const u = PIVOT[0] + c * qx + s * qy, v = PIVOT[1] - s * qx + c * qy;
        if (v >= BASE_Y) {
          const iu = Math.floor(u), iv = Math.floor(v);
          if (iv < H && iu >= 0 && iu < W && SCN[iv * W + iu]) g.pixel(x, y, 1);
          continue;
        }
        const dr = Math.hypot(u - GC[0], v - GC[1]) - GR;
        if (dr > 0.6) continue;
        if (dr > -0.6) { g.pixel(x, y, 1); continue; }
        // The highlight: a crescent of window light on the upper left of the glass.
        if (dr > -5.6 && dr < -3.4) {
          const a = Math.atan2(u - GC[0], GC[1] - v);
          const m = bump(a, -1.25, -1.05, -0.62, -0.45);
          if (m > 0 && hash(x - Math.round(offx), y - Math.round(offy), 5) < m * 0.9) { g.pixel(x, y, 1); continue; }
        }
        // The scene; on the hour it turns on the base (a turntable: the
        // picture squeezes to its axis and opens out mirrored).
        let su = u;
        if (cphi !== 1) { if (Math.abs(cphi) < 0.04) continue; su = 64 + (u - 64) / cphi; }
        const iu = Math.floor(su), iv = Math.floor(v);
        if (iu >= 0 && iu < W && iv >= 0 && SCN[iv * W + iu]) g.pixel(x, y, 1);
      }
    // Is a point (globe frame) inside the glass?
    const inside = (x, y) => y < BASE_Y && (x - GC[0]) ** 2 + (y - GC[1]) ** 2 < (GR - 1.2) ** 2;

    // --- snow in the water
    for (let i = 0; i < flying.length; i += 2) {
      if (!inside(flying[i], flying[i + 1])) continue;
      toScreen(flying[i], flying[i + 1]);
      g.pixel(Math.floor(OUT[0]), Math.floor(OUT[1]), 1);
    }
    for (const q of FREE) {
      const sp = 2.5 + 5 * q.z;
      let y = ((q.y + sp * T) % 66 + 66) % 66 - 4;
      let x = q.x + (1.5 + 3 * q.z) * Math.sin(q.w * T + q.ph) + 2 * Math.sin(0.13 * T + q.ph * 3);
      if (mo.stir > 0) {
        x += mo.stir * 9 * Math.sin(y / 9 + 4 * t + q.ph);
        y += mo.stir * 7 * Math.cos(x / 11 + 3 * t + q.ph);
      }
      if (y > groundY(x) - 0.5 || !inside(x, y)) continue;
      toScreen(x, y);
      g.pixel(Math.floor(OUT[0]), Math.floor(OUT[1]), 1);
      if (q.z > 0.72) g.pixel(Math.floor(OUT[0]) + 1, Math.floor(OUT[1]), 1);
    }

    oled.contrast(Math.round(0xcf + (0x18 - 0xcf) * night));
  },
};
