// Tamago: four 8x8 tiles, four digit-chicks. Each chick's body IS its digit,
// on little orange feet, with eyes that blink and glance at the neighbours
// across the seams. Every one has its own colour and temperament: 8 jiggles
// like jelly, 1 goes up on tiptoe, 7 pecks, 3 giggles, 5 can't keep still.
//
// The minute turn is a generation: the old digit squats, lays an egg and
// leaps up out of its tile; the egg wobbles, cracks (its child's colour
// leaks through the crack), the shell lid flies off and the NEXT digit
// stretches up out of the bottom shell, blinks and shakes itself dry.
// The old digit leaves before the minute and the new one arrives after
// it, so the face is never wrong: only an egg in between.
//
// The hour: the chicks bounce with excitement, the parents leap away one
// after another, then a golden spark drops onto the first golden egg and
// hops from tile to tile across the 6 mm seams, hatching each egg as it
// lands (and bouncing off any chick that stays), bursts into glitter, and
// all four do a wave. At night they sit down, close their eyes and snore.
//
// Each tile is its own MCU: everything here is a closed-form function of
// the wall clock, so four boards running this code stay in step.
import * as kit from '../js/kit.js';
import { SPRITES } from './tamago-sprites.js';

const { clamp, smoothstep, hash, TAU } = kit;

// One colour per digit-chick: candy shades chosen to sit apart on an LED
// and to keep white eyes readable (no pale bodies).
const COLS = [
  '#ffa514', // 0 yolk
  '#29d3ff', // 1 sky
  '#ff3d7a', // 2 bubblegum
  '#7cf03a', // 3 lime
  '#b05cff', // 4 grape
  '#ff6a2a', // 5 tangerine
  '#2f7bff', // 6 blueberry
  '#ffd61f', // 7 lemon
  '#ff4f9e', // 8 strawberry
  '#22e8a8', // 9 mint
].map(kit.hex);
const FEET = kit.hex('#ff5a00');
const EYE = kit.hex('#e8f0ff');
const SHELL = kit.hex('#ffdcae');
const GOLD = kit.hex('#fff6e6');   // the hour's eggs: pearl, with a travelling glint
const BALL = kit.scale(kit.hex('#ff3fd0'), 1.6);
const SPARK = kit.hex('#fff0b0');
const ZZZ = kit.hex('#7a6cff');
const CUT = 2.2 / 255 / 0.4;
const PUPIL = [0.004, 0.003, 0.006];

const SEAM = 7 + 6.45 / 2.65;   // tile k's column 0 sits at k * SEAM in tile pixels
const AX = 3.5, AY = 7.5;        // a chick's anchor: between its feet, on the floor
const buf = new Float32Array(4 * 64 * 3);

const digitsAt = (s) => { const d = new Date(s * 1000), h = d.getHours(), m = d.getMinutes(); return [(h / 10) | 0, h % 10, (m / 10) | 0, m % 10]; };

// ------------------------------------------------------------ rasters
function tex(m, i, j) { return i < 0 || j < 0 || i > 7 || j > 7 ? 0 : m[j * 8 + i]; }
function samp(m, u, v) {
  const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j;
  const a = tex(m, i, j), b = tex(m, i + 1, j), c = tex(m, i, j + 1), d = tex(m, i + 1, j + 1);
  return (a + (b - a) * fu) * (1 - fv) + (c + (d - c) * fu) * fv;
}
function paint3(o, p, r, g, b, a) {
  const q = o + 3 * p;
  buf[q] += (r - buf[q]) * a; buf[q + 1] += (g - buf[q + 1]) * a; buf[q + 2] += (b - buf[q + 2]) * a;
}
const paint = (o, p, c, a) => paint3(o, p, c[0], c[1], c[2], a);
function glow(o, x, y, r, c, a) {
  const x0 = Math.max(0, Math.floor(x - r)), x1 = Math.min(7, Math.ceil(x + r));
  const y0 = Math.max(0, Math.floor(y - r)), y1 = Math.min(7, Math.ceil(y + r));
  for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) {
    const d2 = ((i - x) ** 2 + (j - y) ** 2) / (r * r);
    if (d2 >= 1) continue;
    const w = a * (1 - d2) * (1 - d2), q = o + 3 * (j * 8 + i);
    buf[q] += c[0] * w; buf[q + 1] += c[1] * w; buf[q + 2] += c[2] * w;
  }
}

/** An opaque round ball of about one pixel at sub-pixel (x, y), painted over. */
function blob(o, x, y, c) {
  const x0 = Math.max(0, Math.floor(x - 1)), x1 = Math.min(7, Math.ceil(x + 1));
  const y0 = Math.max(0, Math.floor(y - 1)), y1 = Math.min(7, Math.ceil(y + 1));
  for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) {
    const w = clamp(1.7 - 1.15 * Math.hypot(i - x, j - y));
    if (w > 0) paint(o, j * 8 + i, c, w);
  }
}

// --------------------------------------------------------------- chick
const pose = () => ({ dx: 0, dy: 0, sx: 1, sy: 1, sh: 0, fdy: 0, gaze: 0, open: 1, bright: 1 });

/** Draw digit-chick d into tile buffer o with pose P. */
function drawChick(o, d, P, alpha = 1) {
  const S = SPRITES[d], C = COLS[d], br = P.bright;
  for (let r = 0; r < 8; r++) {
    const lv = (r - AY - P.dy) / P.sy, v = AY + lv, shift = P.sh * lv * P.sy;
    for (let c = 0; c < 8; c++) {
      const m = samp(S.body, AX + (c - AX - P.dx + shift) / P.sx, v);
      const f = samp(S.feet, c - P.dx, r - P.fdy);
      const a = Math.min(1, m + f);
      if (a < 0.002) continue;
      const k = 1 / Math.max(a, 1e-6);
      paint3(o, r * 8 + c, (C[0] * m * br + FEET[0] * f * 0.6) * k, (C[1] * m * br + FEET[1] * f * 0.6) * k, (C[2] * m * br + FEET[2] * f * 0.6) * k, a * alpha);
    }
  }
  // eyes: a white pair of pixels with a dark pupil that slides across it
  // (gaze -1 left .. 1 right); shut, the pair becomes a dim lid
  const o1 = P.open, ewr = lerpc(C[0] * 0.25, EYE[0] * br, o1), ewg = lerpc(C[1] * 0.25, EYE[1] * br, o1), ewb = lerpc(C[2] * 0.25, EYE[2] * br, o1);
  const g = 0.5 + 0.5 * clamp(P.gaze, -1, 1);
  for (const [ex, ey] of S.eyes) {
    const lu = ex + 0.5 - AX, lv = ey - AY;
    const X = AX + P.dx + P.sx * lu - P.sh * lv * P.sy, Y = AY + P.dy + P.sy * lv;
    dot(o, X - 0.5, Y, ewr, ewg, ewb, alpha);
    dot(o, X + 0.5, Y, ewr, ewg, ewb, alpha);
    dot(o, X - 0.5 + g, Y, PUPIL[0], PUPIL[1], PUPIL[2], alpha * o1);
  }
}
const lerpc = (a, b, t) => a + (b - a) * t;
/** Paint a one-pixel dot at sub-pixel (X, Y), split over four pixels by area. */
function dot(o, X, Y, r, g, b, a) {
  const i0 = Math.floor(X), j0 = Math.floor(Y), fx = X - i0, fy = Y - j0;
  for (let j = j0; j <= j0 + 1; j++) for (let i = i0; i <= i0 + 1; i++) {
    if (i < 0 || j < 0 || i > 7 || j > 7) continue;
    const w = (i === i0 ? 1 - fx : fx) * (j === j0 ? 1 - fy : fy);
    if (w > 0) paint3(o, j * 8 + i, r, g, b, w * a);
  }
}

// ----------------------------------------------------------------- egg
const ERX = 2.55, EYC = 2.75, ERY_LO = 2.75, ERY_HI = 3.45;   // egg: half-width, belly height, radii
const crackY = (x) => EYC + 0.55 + 0.75 * (Math.abs(((x * 0.8 + 10.5) % 2) - 1) - 0.5);
function eggCov(x, y) {
  const ry = y > EYC ? ERY_HI : ERY_LO, d = Math.hypot(x / ERX, (y - EYC) / ry);
  return clamp((1 - d) * 2.6 + 0.5);
}
const SPECKS = [[-0.9, 4.3], [1.0, 2.1], [-1.3, 1.3], [0.6, 5.3]];

/**
 * E: { cx, tilt, s, crack, glowC, gold, hatch (false or { tx, ty, rt, ta, drop, ba }) }
 */
function drawEgg(o, E, rel) {
  const cs = Math.cos(E.tilt), sn = Math.sin(E.tilt), base = E.gold ? GOLD : SHELL;
  const H = E.hatch;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const px = c - E.cx, py = AY - r;
    const x = (px * cs + py * sn) / E.s, y = (-px * sn + py * cs) / E.s;
    let cov, sx = x, sy = y, crackLine = 0;
    if (!H) {
      cov = eggCov(x, y);
      if (cov <= 0) continue;
      if (E.crack > 0) {
        const dk = Math.abs(y - crackY(x));
        crackLine = (1 - smoothstep(0.15, 0.65, dk)) * (1 - smoothstep(E.crack * 3.2 - 0.4, E.crack * 3.2 + 0.2, Math.abs(x + 0.3)));
      }
    } else {
      // bottom half, sinking by `drop`
      const yb = y + H.drop;
      const cb = eggCov(x, yb) * (1 - smoothstep(-0.25, 0.25, yb - crackY(x))) * H.ba;
      // top half (the lid), flown to (tx, ty) and turned by rt about the crack
      const qx = x - H.tx, qy = y - H.ty - EYC;
      const ct = Math.cos(-H.rt), st = Math.sin(-H.rt);
      const ux = qx * ct - qy * st, uy = qx * st + qy * ct + EYC;
      const ctp = eggCov(ux, uy) * smoothstep(-0.25, 0.25, uy - crackY(ux)) * H.ta;
      cov = Math.max(cb, ctp);
      if (cov <= 0) continue;
      if (ctp > cb) { sx = ux; sy = uy; } else { sy = yb; }
    }
    // shade: lit from the upper left, darker at the rim
    const nx = sx / ERX, ny = (sy - EYC) / (sy > EYC ? ERY_HI : ERY_LO);
    let sh = clamp(0.55 - 0.3 * nx + 0.3 * ny, 0.15, 1) * (0.55 + 0.45 * clamp(1 - (nx * nx + ny * ny) ** 2));
    for (const [qx, qy] of SPECKS) {
      const w = 1 - Math.hypot(sx - qx, sy - qy) / 0.8;
      if (w > 0) sh *= 1 - 0.5 * w;
    }
    if (E.gold) { const gl = Math.max(0, Math.sin(sx * 1.1 - sy * 0.8 + rel * 6)) ** 6; sh = sh * 0.85 + 0.9 * gl; }
    else sh *= 0.8;
    const g = E.glowC, k = crackLine;
    paint3(o, r * 8 + c, base[0] * sh * (1 - k) + g[0] * k, base[1] * sh * (1 - k) + g[1] * k, base[2] * sh * (1 - k) + g[2] * k, cov);
  }
}

// ---------------------------------------------------------- behaviour
// What each chick does when it's idle, and how often.
const TEMPER = [
  { act: 0.45, moves: ['sway', 'hop', 'wiggle'] },          // 0 roly-poly
  { act: 0.40, moves: ['tiptoe', 'look', 'tiptoe'] },       // 1 shy, tall
  { act: 0.45, moves: ['sway', 'look', 'hop'] },            // 2 swan
  { act: 0.60, moves: ['shimmy', 'hop2', 'hop'] },          // 3 giggly
  { act: 0.45, moves: ['puff', 'puff', 'hop'] },            // 4 proud
  { act: 0.75, moves: ['hop', 'hop2', 'shimmy'] },          // 5 can't keep still
  { act: 0.30, moves: ['sway', 'tiptoe'] },                 // 6 dozy
  { act: 0.55, moves: ['peck', 'peck', 'look'] },           // 7 bird
  { act: 0.55, moves: ['wiggle', 'wiggle', 'hop'] },        // 8 jelly
  { act: 0.50, moves: ['look', 'look', 'tiptoe'] },         // 9 nosy
];
const DUR = { hop: 0.6, hop2: 1.0, wiggle: 1.2, sway: 1.4, peck: 0.8, tiptoe: 1.4, puff: 1.2, look: 1.4, shimmy: 0.9 };
const bump = (p) => (p <= 0 || p >= 1 ? 0 : Math.sin(Math.PI * p));
const env = (p, a = 0.2) => smoothstep(0, a, p) * (1 - smoothstep(1 - a, 1, p));

/** A hop of height h over progress p (0..1): anticipation, air, landing. */
function hop(P, p, h) {
  if (p <= 0 || p >= 1) return;
  if (p < 0.2) { const s = bump(p / 0.2); P.sy *= 1 - 0.14 * s; P.sx *= 1 + 0.08 * s; return; }
  if (p < 0.8) { const q = (p - 0.2) / 0.6, y = -h * Math.sin(Math.PI * q); P.dy += y; P.fdy += y; P.sy *= 1 + 0.1 * bump(q); P.sx *= 1 - 0.05 * bump(q); return; }
  const s = bump((p - 0.8) / 0.2); P.sy *= 1 - 0.12 * s; P.sx *= 1 + 0.08 * s;
}

const lerp = kit.lerp;
function idle(P, k, d, t) {
  // where the eyes rest: they wander between the neighbours, a new look every few seconds
  {
    const GL = 2.7 + 0.31 * k, n = Math.floor((t + 0.9 * k) / GL), lt = t + 0.9 * k - n * GL;
    const side = (m) => { const h = hash(m, k, 41); return k === 0 ? (h < 0.8 ? 1 : -1) : k === 3 ? (h < 0.8 ? -1 : 1) : h < 0.5 ? -1 : 1; };
    P.gaze = lerp(side(n - 1), side(n), smoothstep(0, 0.22, lt));
  }
  const SL = 1.9 + 0.37 * k, n = Math.floor((t + 0.61 * k) / SL), lt = t + 0.61 * k - n * SL;
  const T = TEMPER[d];
  if (hash(n, k, 11) < T.act) {
    const mv = T.moves[Math.floor(hash(n, k, 12) * T.moves.length)];
    const p = (lt - hash(n, k, 13) * 0.3) / DUR[mv];
    const dir = k === 0 ? 1 : k === 3 ? -1 : hash(n, k, 14) < 0.5 ? -1 : 1;
    if (p > 0 && p < 1) {
      switch (mv) {
        case 'hop': hop(P, p, 2.2); break;
        case 'hop2': hop(P, p * 2, 1.3); hop(P, p * 2 - 1, 1.3); break;
        case 'wiggle': { const w = 0.13 * bump(p) * Math.sin(TAU * 4 * p); P.sx *= 1 + w; P.sy *= 1 - w; break; }
        case 'sway': P.sh += 0.16 * Math.sin(TAU * p) * bump(p); break;
        case 'peck': P.sh += -dir * 0.32 * (bump(p * 2) ** 2 + bump(p * 2 - 1) ** 2); P.gaze = lerp(P.gaze, dir, env(p)); break;
        case 'tiptoe': { const e = env(p, 0.25); P.dy -= e; P.sy *= 1 + 0.03 * e; break; }
        case 'puff': { const e = env(p, 0.3); P.sx *= 1 + 0.15 * e; P.sy *= 1 + 0.04 * e; break; }
        case 'look': { const e = env(p, 0.2); P.gaze = lerp(P.gaze, -P.gaze || dir, e); P.sh -= dir * 0.07 * e; break; }
        case 'shimmy': P.dx += 0.55 * Math.sin(TAU * 5 * p) * bump(p); break;
      }
    }
  }
  // neighbours chatting: a pair turns to face each other across the seam
  const n2 = Math.floor(t / 5.3), l2 = t - n2 * 5.3;
  if (hash(n2, 99) < 0.75) {
    const a = Math.floor(hash(n2, 98) * 3);
    if (k === a || k === a + 1) {
      const e = env((l2 - 0.4) / 2.2, 0.15), dir = k === a ? 1 : -1;
      P.gaze = lerp(P.gaze, dir, e); P.sh -= dir * 0.05 * e;
    }
  }
}

// keepy-uppy: now and then two neighbours head a ball back and forth over
// the seam between them. Never near a minute turn.
const RALLY = 19, PASS = 0.72, NPASS = 5;
function rallyAt(t) {
  const n = Math.floor(t / RALLY), lt = t - n * RALLY - 3;
  if (hash(n, 61) > 0.7 || lt < 0 || lt > PASS * NPASS) return null;
  const sec = ((n * RALLY + 3) % 60 + 60) % 60;
  if (sec > 50 || sec < 5) return null;
  return { a: Math.floor(hash(n, 62) * 3), lt };
}
/** Ball position in global tile pixels, or null; the pass index tells who heads it. */
function ballAt(t) {
  const R = rallyAt(t);
  if (!R) return null;
  const m = Math.floor(R.lt / PASS), p = R.lt / PASS - m;
  const from = R.a + (m % 2), to = R.a + 1 - (m % 2);
  const x0 = from * SEAM + (from === R.a ? 4.6 : 2.4), x1 = to * SEAM + (to === R.a ? 4.6 : 2.4);
  const y0 = m === 0 ? -7 : 1.2, y1 = m === NPASS - 1 ? 9 : 1.2;
  const yy = m === NPASS - 1 ? y0 + (y1 - y0) * p * p - 3 * p : y0 + (y1 - y0) * p - 1.4 * 4 * p * (1 - p);
  return [x0 + (x1 - x0) * p, yy];
}
function header(P, k, t) {
  const R = rallyAt(t);
  if (!R || (k !== R.a && k !== R.a + 1)) return;
  const me = k - R.a;   // 0 heads at the start of even passes' ends ... receives odd/even
  for (let m = 0; m < NPASS - 1; m++) {
    const recv = m % 2 === 0 ? 1 : 0;
    if (recv !== me) continue;
    hop(P, (R.lt - (m + 1) * PASS + 0.3) / 0.5, 1.0);
  }
  const e = env(R.lt / (PASS * NPASS), 0.08);
  P.gaze = lerp(P.gaze, me === 0 ? 1 : -1, e);
}

function blink(k, t) {
  const BP = 3.3 + 0.5 * k, n = Math.floor((t + 1.3 * k) / BP), lt = t + 1.3 * k - n * BP;
  const tb = 0.2 + hash(n, k, 21) * (BP - 0.8);
  let o = 1 - bump((lt - tb) / 0.18);
  if (hash(n, k, 22) < 0.3) o = Math.min(o, 1 - bump((lt - tb - 0.3) / 0.18));
  return o;
}

// ------------------------------------------------------------ the show
/** The schedule of the turn at boundary B (s): per tile, when the parent leaves and the egg hatches. */
function schedule(B) {
  const prev = digitsAt(B - 60), next = digitsAt(B), hourTurn = new Date(B * 1000).getMinutes() === 0;
  const tiles = [];
  let order = 0;
  for (let k = 3; k >= 0; k--) {
    const changed = prev[k] !== next[k];
    let start, hatch;
    if (hourTurn) { start = -2.1 + 0.42 * k; hatch = 0.15 + 0.5 * k; }
    else { start = -0.75 - 0.3 * order; hatch = start + 1.6; }
    if (changed) order++;
    tiles[k] = { changed, start, hatch, from: prev[k], to: next[k] };
  }
  return { prev, next, hourTurn, tiles };
}

const SCHED = new Map();
function scheduleFor(B) {
  let s = SCHED.get(B);
  if (!s) { if (SCHED.size > 8) SCHED.clear(); s = schedule(B); SCHED.set(B, s); }
  return s;
}

/** The golden spark at the hour, in global tile pixels: [gx, gy] or null. */
function sparkAt(S, rel) {
  const target = (k) => [k * SEAM + 3.5, S.tiles[k].changed ? 2.6 : -0.3];
  const t0 = S.tiles[0].hatch - 0.05;
  if (rel < t0 - 0.45) return null;
  if (rel < t0) { const p = (rel - (t0 - 0.45)) / 0.45, [x, y] = target(0); return [x - 1.5 * (1 - p), y - 9 * (1 - p) ** 2]; }
  for (let k = 0; k < 3; k++) {
    const a = S.tiles[k].hatch - 0.05, b = S.tiles[k + 1].hatch - 0.05;
    if (rel < b) {
      const p = (rel - a) / (b - a), [x0, y0] = target(k), [x1, y1] = target(k + 1);
      return [x0 + (x1 - x0) * p, y0 + (y1 - y0) * p - 4.2 * 4 * p * (1 - p)];
    }
  }
  const a = S.tiles[3].hatch - 0.05, p = (rel - a) / 0.5, [x, y] = target(3);
  if (p > 1) return null;
  return [x + 4 * p, y - 9 * p * (2 - p)];
}

// ------------------------------------------------------------- design
export default {
  name: 'Tamago',
  blurb: 'four digit-chicks, one per tile; each minute a chick lays an egg and the next number hatches',
  layouts: ['s3m-x4'], look: 'bare', fps: 60, brightness: 0.4, dither: true,
  frame(ctx) {
    const L = ctx.layout;
    if (!ctx.state.map || ctx.state.key !== L.key) {
      ctx.state.key = L.key;
      ctx.state.map = Int32Array.from(L.leds, (l) => l.panel * 64 + l.row * 8 + l.col);
    }
    buf.fill(0);
    const now = ctx.date.getTime() / 1000, t = now;
    let B = Math.floor(now / 60) * 60, rel = now - B;
    if (rel > 55) { B += 60; rel -= 60; }
    const S = scheduleFor(B);
    const night = ctx.night;

    let firstStart = 9, lastHatch = -9;
    for (const T of S.tiles) if (T.changed) { firstStart = Math.min(firstStart, T.start); lastHatch = Math.max(lastHatch, T.hatch); }

    for (let k = 0; k < 4; k++) {
      const o = k * 192, T = S.tiles[k];
      // awake: by day, or when something is happening to you
      const busy = S.hourTurn ? env((rel + 4.6) / 10, 0.08) : T.changed ? env((rel - T.start + 0.6) / (T.hatch - T.start + 2.6), 0.15) : 0;
      const sleep = night * (1 - busy);
      const breath = Math.sin(TAU * t / (3.1 + 1.8 * sleep) + k * 1.7);
      const brightBase = (0.9 + 0.1 * breath) * (1 - 0.2 * sleep * (0.5 + 0.5 * breath));

      const idlePose = (d) => {
        const P = pose();
        if (sleep < 0.98) { idle(P, k, d, t); header(P, k, t); }
        // relax the motion toward sleep and sit down
        P.dx *= 1 - sleep; P.dy = P.dy * (1 - sleep) + sleep; P.fdy = P.fdy * (1 - sleep) + sleep;
        P.sx = 1 + (P.sx - 1) * (1 - sleep); P.sy = 1 + (P.sy - 1) * (1 - sleep); P.sh *= 1 - sleep;
        P.open = blink(k, t) * (1 - smoothstep(0.2, 0.7, sleep));
        P.bright = brightBase;
        return P;
      };

      // the rest of the face watches whoever is busy
      const watch = (P) => {
        if (S.hourTurn || T.changed) return;
        if (rel < firstStart - 0.4 || rel > lastHatch + 1.6) return;
        let tgt = -1, best = 9;
        for (let j = 0; j < 4; j++) if (S.tiles[j].changed && Math.abs(j - k) < best) { best = Math.abs(j - k); tgt = j; }
        if (tgt < 0) return;
        const e = env((rel - firstStart + 0.4) / (lastHatch - firstStart + 2), 0.12) * (1 - sleep);
        const dir = tgt > k ? 1 : -1;
        P.gaze = lerp(P.gaze, dir, e); P.sh = P.sh * (1 - e) - dir * 0.08 * e;
      };

      // hour extras for every chick: excited bouncing before, a cheer when the
      // spark passes over, a wave at the end
      const hourMoves = (P) => {
        if (!S.hourTurn) return;
        if (rel > -4.4 && rel < -2.0) {
          const e = env((rel + 4.4) / 2.4, 0.15), ph = (rel + 4.4) * 2.6;
          hop(P, kit.fract(ph), 1.2 * e);
        }
        if (!T.changed) hop(P, (rel - T.hatch + 0.25) / 0.6, 2.4);
        const tw = 3.1 + 0.16 * k;
        hop(P, (rel - tw) / 0.65, 2.6);
      };

      const sh = rel - T.start;   // time since this tile's parent began to leave
      if (!T.changed || rel < T.start) {
        const d = T.changed ? T.from : T.to, P = idlePose(d);
        watch(P); hourMoves(P);
        drawChick(o, d, P);
        continue;
      }

      // ---- a changing tile: parent leaves, egg, hatch, new chick
      const q = rel - T.hatch;    // time since the hatch began
      // the new chick, behind the shell
      if (q > 0.28) {
        const P = idlePose(T.to);
        if (q < 1.6) {
          // ignore idle moves while hatching
          Object.assign(P, { dx: 0, dy: 0, fdy: 0, sx: 1, sy: 1, sh: 0, gaze: 0 });
          const e = clamp((q - 0.28) / 0.5);
          P.dy = 5.5 * (1 - kit.ease.outBack(e)); P.fdy = P.dy;
          P.sy = 1 + 0.16 * bump(e);
          P.sx = 1 - 0.06 * bump(e);
          P.open = smoothstep(0.82, 0.95, q) * (1 - 0.8 * sleep * smoothstep(1.3, 1.6, q));
          if (q > 0.95) { const w = 0.1 * bump((q - 0.95) / 0.6) * Math.sin(TAU * 5 * (q - 0.95)); P.sx *= 1 + w; P.sh += w * 0.6; }
          // settle into sleep posture at night
          const z = sleep * smoothstep(1.2, 1.6, q);
          P.dy += z; P.fdy += z;
        } else { hourMoves(P); }
        drawChick(o, T.to, P);
      }
      // the egg
      if (sh > 0.3 && q < 1.5) {
        const laid = clamp((sh - 0.3) / 0.35);
        const toHatch = clamp((rel - T.start - 0.75) / Math.max(0.3, T.hatch - T.start - 0.75));
        const amp = (0.06 + 0.2 * toHatch * toHatch) * (S.hourTurn ? 1.4 : 1);
        const jerk = 0.35 + 0.65 * Math.sin(TAU * 0.8 * rel + k) ** 2;
        const E = {
          cx: 3.5, s: 0.6 + 0.4 * kit.ease.outBack(laid), gold: S.hourTurn, glowC: COLS[T.to],
          tilt: q < 0 ? amp * jerk * Math.sin(TAU * 2.4 * rel) * smoothstep(0.6, 1, sh) : 0,
          crack: smoothstep(T.hatch - 0.6, T.hatch - 0.05, rel),
          hatch: false,
        };
        if (q >= 0) {
          const dir = k < 2 ? -1 : 1, tq = clamp(q / 0.45);
          E.hatch = {
            tx: 2.2 * dir * tq, ty: 7 * kit.ease.out(tq), rt: 1.0 * dir * tq, ta: 1 - smoothstep(0.18, 0.42, q),
            drop: 3.5 * kit.ease.in(clamp((q - 0.75) / 0.6)), ba: 1 - smoothstep(0.95, 1.4, q),
          };
        }
        drawEgg(o, E, rel);
        // light leaking out of the crack, and a puff when it opens
        if (E.crack > 0 && q < 0.4) glow(o, 3.2, AY - crackY(0) * E.s, 1.6, COLS[T.to], 0.35 * E.crack * (q < 0 ? 0.7 + 0.3 * Math.sin(TAU * 5 * rel) : 1 - q / 0.4));
      }
      // the parent: squat, then leap up and away
      if (sh < 0.75) {
        const P = idlePose(T.from);
        Object.assign(P, { dx: 0, dy: 0, fdy: 0, sx: 1, sy: 1, sh: 0, gaze: 0 });
        if (sh < 0.3) { const e = bump(sh / 0.6); P.sy = 1 - 0.2 * e; P.sx = 1 + 0.1 * e; P.open = 1 - smoothstep(0.05, 0.2, sh); }
        else { const p = (sh - 0.3) / 0.45; P.dy = -(2 * p + 11 * p * p); P.fdy = P.dy; P.sy = 1.25 - 0.1 * p; P.sx = 0.9; P.open = 1; }
        drawChick(o, T.from, P);
      }
    }

    // the rally ball
    if (night < 0.5) {
      const b = ballAt(t);
      if (b) for (let k = 0; k < 4; k++) {
        const lx = b[0] - k * SEAM;
        if (lx > -2 && lx < 9) blob(k * 192, lx, b[1], BALL);
      }
    }
    // the hour's golden spark, its trail, and the glitter afterwards
    if (S.hourTurn) {
      for (let s = 0; s < 6; s++) {
        const p = sparkAt(S, rel - s * 0.03);
        if (!p) continue;
        for (let k = 0; k < 4; k++) {
          const lx = p[0] - k * SEAM;
          if (lx > -2 && lx < 9) glow(k * 192, lx, p[1], 1.7 - 0.15 * s, SPARK, s ? 0.9 / (s + 1) : 1.8);
        }
      }
      if (rel > 1.9 && rel < 5.2) {
        for (let n = 0; n < 16; n++) {
          const t0 = 1.9 + hash(n, 31) * 1.2, a = (rel - t0) / 1.9;
          if (a <= 0 || a >= 1) continue;
          const gx = hash(n, 32) * (3 * SEAM + 8) - 0.5 + 0.8 * Math.sin(TAU * (a * 1.3 + hash(n, 33)));
          const gy = -1 + 9.5 * a;
          const k = Math.floor((gx + 1) / SEAM), lx = gx - k * SEAM;
          const tw = 0.5 + 0.5 * Math.sin(TAU * (6 * a + hash(n, 34)));
          if (k >= 0 && k < 4) glow(k * 192, lx, gy, 1.05, n % 3 ? SPARK : GOLD, 0.55 * tw * (1 - a));
        }
      }
    }

    // night: z-bubbles drift up from the sleepers
    if (night > 0) {
      for (let k = 0; k < 4; k++) {
        const per = 3.4 + 0.3 * k, n = Math.floor((t + k * 1.1) / per), a = (t + k * 1.1 - n * per) / 2.6;
        if (a <= 0 || a >= 1) continue;
        const x = 5.6 + 1.6 * a + 0.35 * Math.sin(TAU * a * 1.5), y = 1.2 - 2.4 * a;
        glow(k * 192, x, y, 0.9 + 0.4 * a, ZZZ, 0.45 * night * bump(a));
      }
    }

    const dim = 1 - 0.72 * night, map = ctx.state.map, out = ctx.out;
    for (let i = 0; i < map.length; i++) {
      const q = 3 * map[i];
      // channel residues under ~2/255 (after brightness) only tint: drop them
      for (let c = 0; c < 3; c++) { const v = buf[q + c] * dim; out[3 * i + c] = v < CUT ? 0 : v; }
    }
  },
};
