// Frogger: the four strips are the arcade playfield, one lane per strip, and
// the seams are the lane edges. Top: the home bank, five bays in a hedge.
// Then the river: the HOUR floats by as straight logs (logs can't bend, so
// the hour is square lumber), the MINUTE swims the other way as a flotilla
// of baby turtles (turtles can make curves). Bottom: the road.
//
// The owner's avatar, a rainbow frog in round blue glasses with pink lips,
// is the second hand. Each minute a new frog peeks over the kerb, waits for
// a gap in the traffic, hops onto a pair of big turtles, rides, jumps onto
// a log, rides, and leaps into the next empty bay just before the minute
// turns. Then the baby turtles of the old minute dive (ripples), and the
// ones the new minute needs surface. The bays fill one per minute; every
// five minutes the five frogs leave and the level starts again.
//
// The hour: the fifth frog lands, all five do a wave, a snake slithers
// along the kerb, and the hour's logs are caught in a whirlpool that spins
// them round and sets them down as the new hour.
//
// Stateless: every position is a closed-form function of the wall clock;
// the frog's route is planned once per minute from the lanes' positions.
import * as kit from '../js/kit.js';

const N = 32;
const P = 22;                         // marquee period: HH (11) + gap + carrier
const CARRIER = 16;                   // carrier centre in the pattern
const VH = 0.7, VM = 0.6;             // logs drift right, turtles swim left (cols/s)
const VA = 3.2, PA = 27, LA = 8;      // road lane A: trucks to the right
const VB = 4.6, PB = 16, LB = 3;      // road lane B: cars to the left
const HOP = 0.42, STAY = 0.6;
const Y_BAY = 1, Y_LOG = 8, Y_TUR = 16, Y_ROAD = 24, Y_PEEK = 29.6;

const C = kit.hex;
const WATER = [0, 0, 0.085], GLINT = [0, 0.3, 0.5];
const HEDGE = [0, 0.07, 0], PAD = [0.03, 0.22, 0.035];
const KERB = [0.075, 0, 0.13], MEDIAN = [0.06, 0, 0.1], DASH = [0.07, 0.07, 0.07];
const BARK = [C('#f08a28'), C('#c8601c')], CUT = C('#ffdc96');
const SHELL = [C('#3ee05a'), C('#a4e83a')], DEEP = C('#0a5a6a'), RIPPLE = C('#5ab8ff');
const BIGSHELL = C('#1e9a3a'), FLIPPER = C('#86d040');
const CROC = C('#1f7a3c'), SCUTE = C('#3f9a2a'), CROCEYE = C('#ffe040');
const TRAILER = C('#a8a090'), CAB = C('#ff3a2a'), CARS = [C('#ff3a8a'), C('#ffc82a'), C('#2ad0ff')];
const HEAD = C('#fff2c0'), TAIL = C('#ff1a10');
const SNAKE = C('#3ac040'), BAND = C('#e8e030'), TONGUE = C('#ff2030');
const FROGC = {
  b: C('#2f6bff'), w: [1, 1, 1], r: C('#ff2a1a'), o: C('#ff7a10'), y: C('#ffd820'),
  g: C('#40e060'), c: C('#22c8b0'), v: C('#a050ff'), p: C('#ff2a9a'), f: C('#ff5a10'),
};
const FROG = [
  '.b.b.',
  'bwbwb',
  'rbgbv',
  'roygv',
  'roppv',
  '.oyc.',
  'ff.ff',
];

// The hour in logs: straight pieces only, [x0, y0, x1, y1] in a 5x7 cell.
const LOGS = {
  0: [[0, 0, 0, 6], [4, 0, 4, 6], [1, 0, 3, 0], [1, 6, 3, 6]],
  1: [[2, 0, 2, 6], [0, 2, 1, 1]],
  2: [[0, 0, 4, 0], [4, 1, 4, 2], [0, 3, 4, 3], [0, 4, 0, 5], [0, 6, 4, 6]],
  3: [[0, 0, 3, 0], [4, 0, 4, 6], [1, 3, 3, 3], [0, 6, 3, 6]],
  4: [[0, 0, 0, 4], [3, 0, 3, 6], [1, 4, 4, 4]],
  5: [[0, 0, 4, 0], [0, 1, 0, 3], [1, 3, 4, 3], [4, 4, 4, 5], [0, 6, 4, 6]],
  6: [[0, 0, 0, 6], [1, 0, 4, 0], [1, 3, 4, 3], [4, 4, 4, 6], [1, 6, 3, 6]],
  7: [[0, 0, 4, 0], [4, 1, 1, 6]],
  8: [[0, 0, 0, 6], [4, 0, 4, 6], [1, 0, 3, 0], [1, 3, 3, 3], [1, 6, 3, 6]],
  9: [[0, 0, 0, 3], [4, 0, 4, 6], [1, 0, 3, 0], [1, 3, 3, 3], [0, 6, 3, 6]],
};

// The minute in baby turtles: one turtle per LED, so it can curve.
const TURTLES = {
  0: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  1: ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  2: ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  3: ['.###.', '#...#', '....#', '..##.', '....#', '#...#', '.###.'],
  4: ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  5: ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  6: ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  7: ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  8: ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  9: ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
};
const turtleCells = {};
for (const [d, rows] of Object.entries(TURTLES)) {
  turtleCells[d] = [];
  rows.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === '#') turtleCells[d].push([c, r]); }));
}

const mod = (a, b) => ((a % b) + b) % b;

// The river's swell: everything afloat rides it, the logs one way, the
// turtles the other. A fraction of a row, so it reads as water, not jitter.
let NOW = 0;
const swellH = (x) => 0.2 * Math.sin(NOW * 1.7 - x * 0.45);
const swellM = (x) => 0.2 * Math.sin(NOW * 2.1 + x * 0.5);
const pad = (n) => String(n).padStart(2, '0');

// ---------------------------------------------------------------- canvas
// A 32x32 grid (x = column, y = strip * 8 + row). Objects are drawn as dots
// splatted bilinearly into a layer, so they glide between LEDs; a layer is
// then composited over what is below.
const buf = new Float32Array(N * N * 3), acc = new Float32Array(N * N * 3), cov = new Float32Array(N * N);
function put(x, y, w, c) {
  if (w <= 0 || x < 0 || x >= N || y < 0 || y >= N) return;
  const k = y * N + x;
  cov[k] += w; acc[3 * k] += c[0] * w; acc[3 * k + 1] += c[1] * w; acc[3 * k + 2] += c[2] * w;
}
function dot(x, y, c, a = 1) {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  put(x0, y0, (1 - fx) * (1 - fy) * a, c); put(x0 + 1, y0, fx * (1 - fy) * a, c);
  put(x0, y0 + 1, (1 - fx) * fy * a, c); put(x0 + 1, y0 + 1, fx * fy * a, c);
}
function flush() {
  for (let k = 0; k < N * N; k++) {
    const a = cov[k];
    if (!a) continue;
    const o = Math.min(a, 1), s = a > 1 ? 1 / a : 1;
    for (let j = 0; j < 3; j++) buf[3 * k + j] = buf[3 * k + j] * (1 - o) + acc[3 * k + j] * s;
    cov[k] = 0; acc[3 * k] = acc[3 * k + 1] = acc[3 * k + 2] = 0;
  }
}
const glow = (x, y, c, a) => { if (x >= 0 && x < N && y >= 0 && y < N) { const k = 3 * (y * N + x); buf[k] += c[0] * a; buf[k + 1] += c[1] * a; buf[k + 2] += c[2] * a; } };

// ----------------------------------------------------------------- lanes
/** A copy of the time cut by the screen edge is a ghost; the whole copy is lit. */
const ghost = (x) => 1 - 0.7 * kit.smoothstep(0, 2.5, Math.max(0, -x) + Math.max(0, x + 11 - N));
/** Copies of a lane's repeating pattern on screen: [{ x, n }], x the origin. */
function copies(v, p, now, w) {
  const s = v * now, n0 = Math.floor(s / p), x0 = s - n0 * p, out = [];
  for (let j = -2; j <= 2; j++) {
    const x = x0 + j * p;
    if (x + w > -1 && x < N + 1) out.push({ x, n: n0 - j });
  }
  return out;
}
/** Is the road clear of traffic over columns [a, b] during [t0, t1] (epoch s)? */
function roadClear(a, b, t0, t1) {
  for (let t = t0; t <= t1; t += 0.05) {
    for (const c of copies(VA, PA, t, LA)) if (c.x < b && c.x + LA > a) return false;
    for (const c of copies(-VB, PB, t, LB)) if (c.x < b && c.x + LB > a) return false;
  }
  return true;
}
/** Carrier centres of a lane at epoch time T. */
const carriers = (v, T) => { const x0 = mod(v * T, P); return [-2, -1, 0, 1, 2].map((j) => x0 + j * P + CARRIER); };
const onScreen = (x) => x >= 2.5 && x <= 28.5;
const nearest = (xs, target) => xs.filter(onScreen).sort((a, b) => Math.abs(a - target) - Math.abs(b - target))[0];

/** The rides for a frog leaving the log at T4 from x4: cross the road near
 *  :08, swap lanes near :33, short sideways leaps, never under a wheel. */
function route(M, T4, x4, peek0) {
  let best = null;
  for (let rideL = Math.max(1, Math.min(26, (x4 - 2) / VH)); rideL >= 1; rideL -= 1) {
    const T3 = T4 - rideL - HOP, x3 = x4 - VH * rideL;
    for (const x3t of carriers(-VM, M + T3).filter(onScreen)) {
      if (Math.abs(x3t - x3) > 9) continue;
      for (let R = Math.min(40, (28.5 - x3t) / VM); R >= 1.5; R -= 0.5) {
        const xt = x3t + VM * R, T2 = T3 - R - HOP, T1 = T2 - STAY - HOP;
        if (T1 < peek0 + 3) continue;
        const score = Math.abs(T1 - 8) + 0.5 * Math.abs(T3 - 33) + 0.4 * Math.abs(x3t - x3);
        if (best && score >= best.score) continue;
        for (const dx of [0, 2, -2, 4, -4]) {
          const xr = xt + dx;
          if (xr < 2.5 || xr > 28.5) continue;
          if (roadClear(xr - 3, xr + 3, M + T1 + 0.15, M + T2 + 0.25)) { best = { score: score + 0.3 * Math.abs(dx), T1, T2, T3, xr, xt, x3t, x3 }; break; }
        }
      }
    }
  }
  return best;
}

// The frog's route through the minute starting at epoch second M.
const plans = new Map();
function plan(M) {
  if (plans.has(M)) return plans.get(M);
  const minute = new Date(M * 1000).getMinutes();
  // the bays already filled this level (the frog of each earlier minute chose one)
  const used = minute % 5 ? [...plan(M - 60).used, plan(M - 60).bay] : [];
  const peek0 = minute === 0 ? 6.6 : 1.4;
  // like a player: aim for whichever empty bay a log will carry the frog
  // closest to, leaving the log between :50 and :57.5
  const aims = [];
  for (let b = 0; b < 5; b++) {
    if (used.includes(b)) continue;
    let aim = null;
    for (let t = 57.5; t >= 50; t -= 0.25) {
      const x = nearest(carriers(VH, M + t), 6 * b + 3), miss = Math.abs(x - 6 * b - 3) + (57.5 - t) * 0.05;
      if (!aim || miss < aim.miss) aim = { miss, bay: b, xb: 6 * b + 3, T4: t, x4: x };
    }
    aims.push(aim);
  }
  aims.sort((p, q) => p.miss - q.miss);
  let best = null, aim = aims[0];
  for (const a of aims) { best = route(M, a.T4, a.x4, peek0); if (best) { aim = a; break; } }
  best ??= { T1: 40, T2: 41, T3: 50, xr: 20, xt: 20, x3t: 14.6, x3: aim.x4 - VH * (aim.T4 - 50 - HOP) };   // keeps the frog moving
  const { bay, xb, T4, x4 } = aim;
  const p = { minute, used, bay, xb, peek0, T4, x4, ...best };
  if (plans.size > 16) plans.delete(plans.keys().next().value);
  plans.set(M, p);
  return p;
}

/** Where the travelling frog is at s seconds into the minute: [x centre, y top, hop 0..1] or null. */
function frogAt(p, s) {
  const hop = (s0, xa, ya, xb, yb) => {
    const u = kit.clamp((s - s0) / HOP), e = kit.ease.inOut(u);
    return [kit.lerp(xa, xb, e), kit.lerp(ya, yb, e), Math.sin(Math.PI * u)];
  };
  if (s < p.peek0) return null;
  if (s < p.peek0 + 0.7) { const e = kit.ease.out((s - p.peek0) / 0.7); return [p.xr, kit.lerp(32.5, Y_PEEK, e), 0]; }
  if (s < p.T1) return [p.xr, Y_PEEK + 0.35 * Math.sin(s * 2.2) * kit.clamp((p.T1 - s) / 0.5), 0];
  if (s < p.T1 + HOP) return hop(p.T1, p.xr, Y_PEEK, p.xr, Y_ROAD);
  if (s < p.T2) return [p.xr, Y_ROAD, 0];
  if (s < p.T2 + HOP) return hop(p.T2, p.xr, Y_ROAD, p.xt, Y_TUR + swellM(p.xt));
  // a little hop on the spot now and then, never near a real hop
  const bob = (a, b) => -0.6 * Math.max(0, Math.sin(s * 1.9)) ** 12 * kit.clamp((s - a) / 0.6) * kit.clamp((b - s) / 0.6);
  if (s < p.T3) return [p.x3t + VM * (p.T3 - s), Y_TUR + bob(p.T2 + HOP, p.T3) + swellM(p.x3t + VM * (p.T3 - s)), 0];
  if (s < p.T3 + HOP) return hop(p.T3, p.x3t, Y_TUR + swellM(p.x3t), p.x3, Y_LOG + swellH(p.x3));
  if (s < p.T4) return [p.x4 - VH * (p.T4 - s), Y_LOG + bob(p.T3 + HOP, p.T4) + swellH(p.x4 - VH * (p.T4 - s)), 0];
  if (s < p.T4 + HOP) return hop(p.T4, p.x4, Y_LOG + swellH(p.x4), p.xb, Y_BAY);
  return [p.xb, Y_BAY, 0];
}

// ----------------------------------------------------------- the ground
function background(now) {
  for (let y = 0; y < N; y++) {
    const strip = y >> 3, r = y & 7;
    for (let x = 0; x < N; x++) {
      let c;
      if (strip === 0) {
        const bay = x <= 29 && x % 6 !== 0 && r > 0;
        if (!bay) c = kit.scale(HEDGE, 0.85 + 0.5 * kit.noise2(x * 0.7, y * 0.7 + now * 0.04));
        else c = kit.scale(WATER, 0.75 + 0.3 * kit.noise2(x * 0.5 + now * 0.2, y * 0.6));
      } else if (strip < 3) {
        if (strip === 2 && r === 7) c = MEDIAN;
        else {
          const v = strip === 1 ? VH : -VM;
          const n = kit.noise2((x - v * now) * 0.45, y * 0.9 + now * 0.12);
          const g = kit.smoothstep(0.8, 0.97, kit.noise2((x - v * now * 1.3) * 0.8 + 40, y * 1.4 - now * 0.35));
          c = [WATER[0] * (0.7 + 0.6 * n) + GLINT[0] * g * 0.3, WATER[1] * (0.7 + 0.6 * n) + GLINT[1] * g * 0.3, WATER[2] * (0.7 + 0.6 * n) + GLINT[2] * g * 0.3];
        }
      } else if (r === 2) c = x % 4 < 2 ? DASH : null;
      else if (r >= 6) c = kit.scale(KERB, x % 3 === 0 ? 0.8 : 1);
      else c = null;
      const k = 3 * (y * N + x);
      buf[k] = c ? c[0] : 0; buf[k + 1] = c ? c[1] : 0; buf[k + 2] = c ? c[2] : 0;
    }
  }
  // a lily pad in every bay
  const PADS = ['.#.', '###', '##.'];
  for (let b = 0; b < 5; b++) PADS.forEach((row, r) => [...row].forEach((ch, c) => {
    if (ch === '#') { const k = 3 * ((3 + r) * N + 6 * b + 2 + c); buf[k] = PAD[0]; buf[k + 1] = PAD[1]; buf[k + 2] = PAD[2]; }
  }));
}

function road(now) {
  for (const c of copies(VA, PA, now, LA)) {
    for (let u = 0; u < LA; u++) for (let r = 0; r < 2; r++) {
      const col = u >= LA - 2 ? (u === LA - 1 ? kit.mix(CAB, HEAD, 0.35) : CAB) : kit.scale(TRAILER, 0.8 + 0.2 * (u % 2));
      dot(c.x + u, Y_ROAD + r, col);
    }
  }
  for (const c of copies(-VB, PB, now, LB)) {
    const body = CARS[mod(c.n, 3)];
    for (let u = 0; u < LB; u++) for (let r = 0; r < 2; r++) {
      dot(c.x + u, Y_ROAD + 3 + r, u === 0 ? kit.mix(body, HEAD, 0.55) : u === LB - 1 ? kit.mix(body, TAIL, 0.5) : body);
    }
  }
}

// ------------------------------------------------------------- the logs
/** One log from (x0, y0) to (x1, y1), LED centres, as a distance field. */
function log(x0, y0, x1, y1, tone, a, seed) {
  const L = Math.hypot(x1 - x0, y1 - y0);
  const bark = kit.mix(BARK[0], BARK[1], tone);
  for (let cy = Math.floor(Math.min(y0, y1) - 1); cy <= Math.ceil(Math.max(y0, y1) + 1); cy++) {
    for (let cx = Math.floor(Math.min(x0, x1) - 1); cx <= Math.ceil(Math.max(x0, x1) + 1); cx++) {
      const dx = x1 - x0, dy = y1 - y0;
      const t = L ? kit.clamp(((cx - x0) * dx + (cy - y0) * dy) / (L * L)) : 0;
      const d = Math.hypot(cx - x0 - t * dx, cy - y0 - t * dy);
      const w = kit.clamp(1.2 - 1.4 * d);
      if (w <= 0) continue;
      const along = t * L, end = L >= 1.5 ? Math.max(0, 1 - Math.min(along, L - along) / 0.8) : 0.5;
      const grain = 0.86 + 0.14 * Math.sin(along * 2.7 + seed);
      put(cx, cy, w * a, kit.scale(kit.mix(bark, CUT, 0.55 * end), grain));
    }
  }
}

/** The crocodile the frog rides in the log lane: swimming right, jaws snapping slowly. */
function croc(x, y, now, n) {
  const open = Math.max(0, Math.sin(now * 1.3 + n * 2.1)) ** 3;       // 0 shut .. 1 wide
  const sway = 0.25 * Math.sin(now * 2.2 + n);
  // tail (u 0-1, wagging), body (u 2-4), head (u 5-6)
  dot(x, y + 3 + sway, kit.scale(CROC, 0.5)); dot(x + 1, y + 3 + sway * 0.5, kit.scale(CROC, 0.75));
  for (let u = 2; u <= 4; u++) {
    dot(x + u, y + 3, CROC); dot(x + u, y + 4, kit.scale(CROC, 0.55));
    dot(x + u, y + 2, kit.scale(SCUTE, u === 3 ? 0.9 : 0.6));
  }
  dot(x + 5, y + 3, CROC); dot(x + 5, y + 4, kit.scale(CROC, 0.55));
  dot(x + 5, y + 2, CROCEYE);                                          // the eye, on top of the head
  dot(x + 6, y + 3 - 0.8 * open, kit.scale(CROC, 0.9));                // upper jaw lifts
  dot(x + 6, y + 4, kit.scale(CROC, 0.6));
  dot(x + 6, y + 3.6, kit.scale(TONGUE, 0.5), open);                   // the mouth, pink when open
}

const whirls = new Map();
/** Log movers turning digit a into digit b: matched in order round the digit's centre. */
function whirl(a, b) {
  const key = a + b;
  if (whirls.has(key)) return whirls.get(key);
  const SQ = 0.6, pol = (s) => {
    const cx = (s[0] + s[2]) / 2, cy = (s[1] + s[3]) / 2;
    return { r: Math.hypot(cx - 2, (cy - 3) / SQ), phi: Math.atan2((cy - 3) / SQ, cx - 2), len: Math.hypot(s[2] - s[0], s[3] - s[1]), th: Math.atan2(s[3] - s[1], s[2] - s[0]) };
  };
  const tag = (d) => (s, j) => ({ ...pol(s), tone: kit.hash(j, +d), seed: j });
  const A = LOGS[a].map(tag(a)).sort((p, q) => p.phi - q.phi), B = LOGS[b].map(tag(b)).sort((p, q) => p.phi - q.phi);
  const movers = [];
  const used = new Set();
  if (A.length >= B.length) {
    B.forEach((q, j) => { const i = Math.floor((j * A.length) / B.length); used.add(i); movers.push([A[i], q, 0]); });
    A.forEach((p, i) => { if (!used.has(i)) movers.push([p, { ...p, r: 0, phi: p.phi + 2, len: 0 }, -1]); });
  } else {
    A.forEach((p, i) => { const j = Math.floor((i * B.length) / A.length); used.add(j); movers.push([p, B[j], 0]); });
    B.forEach((q, j) => { if (!used.has(j)) movers.push([{ ...q, r: 0, phi: q.phi - 2, len: 0 }, q, 1]); });
  }
  whirls.set(key, movers);
  return movers;
}

/** Draw digit d of the hour at (x, y); if `to` is given, part way (e 0..1) through the whirlpool. */
function hourDigit(x, y, d, to, u, seedBase, fade = 1) {
  if (to === undefined || to === d) {
    LOGS[d].forEach((s, j) => { const w = swellH(x + (s[0] + s[2]) / 2); log(x + s[0], y + s[1] + w, x + s[2], y + s[3] + w, kit.hash(j, +d), fade, seedBase + j); });
    return;
  }
  const SQ = 0.6, TURN = 2 * Math.PI;
  whirl(d, to).forEach(([p, q, kind], j) => {
    const e = kit.ease.inOut(kit.clamp(u * 1.15 - j * 0.025));
    const dphi = TURN + Math.atan2(Math.sin(q.phi - p.phi), Math.cos(q.phi - p.phi));
    const phi = p.phi + dphi * e, r = kit.lerp(p.r, q.r, e) * (1 - 0.3 * Math.sin(Math.PI * e));
    const thT = p.th + dphi, th1 = q.th + Math.PI * Math.round((thT - q.th) / Math.PI);
    const th = kit.lerp(p.th, th1, e), len = kit.lerp(p.len, q.len, e) / 2;
    const cx = x + 2 + r * Math.cos(phi), cy = y + 3 + r * Math.sin(phi) * SQ;
    const a = fade * (kind < 0 ? 1 - e : kind > 0 ? e : 1);
    const w = swellH(cx);
    log(cx - len * Math.cos(th), cy - len * Math.sin(th) + w, cx + len * Math.cos(th), cy + len * Math.sin(th) + w,
      kit.lerp(p.tone, q.tone, e), a, seedBase + kit.lerp(p.seed, q.seed, e));
  });
}

// ---------------------------------------------------------- the turtles
function ripple(x, y, age, a) {
  if (age < 0 || age > 1) return;
  const R = 0.4 + 2 * age, k = a * (1 - age) ** 1.5;
  for (let cy = Math.floor(y - R - 1); cy <= Math.ceil(y + R + 1); cy++) {
    for (let cx = Math.floor(x - R - 1); cx <= Math.ceil(x + R + 1); cx++) {
      const ring = 1 - Math.abs(Math.hypot(cx - x, (cy - y) * 1.15) - R) / 0.75;
      if (ring > 0) glow(cx, cy, RIPPLE, 0.2 * k * ring);
    }
  }
}

/** One minute digit at (x, y): d now; `from` the digit it was (turn in progress, rel s after the turn). */
function minuteDigit(x, y, d, from, rel, now, slot, fade = 1) {
  const have = new Set(turtleCells[d].map(([c, r]) => c * 8 + r));
  const had = from === undefined ? have : new Set(turtleCells[from].map(([c, r]) => c * 8 + r));
  for (const key of new Set([...have, ...had])) {
    const c = key >> 3, r = key & 7, h = kit.hash(c, r, slot);
    const shell = kit.mix(SHELL[0], SHELL[1], h);
    const paddle = 0.8 + 0.2 * Math.sin(now * 3.1 + h * 40);
    let a = 1, col = shell, splash = 0;
    if (from === undefined && rel > 3 && rel < 57) {
      // at rest, now and then one baby turtle ducks under, as Frogger's turtles do
      const k = Math.floor(now / 4.3), u = now / 4.3 - k, cells = turtleCells[d];
      const [dc, dr] = cells[Math.floor(kit.hash(k, slot, 5) * cells.length)];
      if (dc === c && dr === r && u > 0.15 && u < 0.75) {
        const depth = Math.sin(Math.PI * (u - 0.15) / 0.6);
        a = 1 - 0.8 * depth; col = kit.mix(shell, DEEP, depth);
        ripple(x + c, y + r, (u - 0.15) / 0.55, 0.8);
      }
    } else if (!have.has(key)) {                // dives
      const p = kit.clamp((rel - 0.05 - 0.08 * c - 0.025 * r) / 0.7);
      a = 1 - p * p; col = kit.mix(shell, DEEP, p);
      ripple(x + c, y + r, (rel - 0.4 - 0.08 * c - 0.025 * r) / 1.1, 1);
    } else if (!had.has(key)) {                 // surfaces
      const t0 = 0.75 + 0.08 * c + 0.025 * r, p = kit.clamp((rel - t0) / 0.6);
      a = kit.ease.out(p); col = kit.mix(DEEP, shell, p); splash = Math.sin(Math.PI * p);
      ripple(x + c, y + r, (rel - t0 + 0.15) / 1.1, 1);
    }
    if (a <= 0.002) continue;
    const w = swellM(x + c);
    dot(x + c, y + r + w, kit.mix(kit.scale(col, paddle), [0.8, 1, 1], 0.45 * splash), a * fade);
    // swimming left: a turtle with open water ahead shows its head
    if (!have.has(key - 8) && !had.has(key - 8)) dot(x + c - 1, y + r + w, kit.scale(SHELL[1], 0.3 + 0.1 * paddle), a * fade * 0.5);
  }
}

/** The two big turtles the frog rides, swimming left (heads at the front). */
function bigTurtles(x, y, now, n) {
  for (const ox of [1, 5]) {
    const ph = Math.sin(now * 3.4 + ox + n), a = 0.5 + 0.5 * ph, b = 1 - a;
    dot(x + ox, y + 3, kit.scale(FLIPPER, 0.55)); dot(x + ox, y + 4, kit.scale(FLIPPER, 0.4));
    for (let u = 0; u < 2; u++) for (let r = 0; r < 2; r++) dot(x + ox + 1 + u, y + 3 + r, kit.scale(BIGSHELL, u === r ? 1.2 : 0.8));
    // flippers paddle in pairs, front and back
    dot(x + ox + 1, y + 2, kit.scale(FLIPPER, 0.35 * a)); dot(x + ox + 2, y + 5, kit.scale(FLIPPER, 0.35 * a));
    dot(x + ox + 2, y + 2, kit.scale(FLIPPER, 0.35 * b)); dot(x + ox + 1, y + 5, kit.scale(FLIPPER, 0.35 * b));
  }
}

/** The whirlpool's spiral arms in the water round (x, y). */
function swirl(x, y, now, env) {
  if (env <= 0) return;
  for (let cy = Y_LOG; cy <= Y_LOG + 7; cy++) for (let cx = Math.floor(x - 6); cx <= Math.ceil(x + 6); cx++) {
    const dx = cx - x, dy = (cy - y) / 0.6, r = Math.hypot(dx, dy);
    if (r > 6.5) continue;
    const arm = 0.5 + 0.5 * Math.cos(2 * Math.atan2(dy, dx) - 1.6 * r + now * 9);
    glow(cx, cy, GLINT, 0.5 * env * arm ** 3 * (1 - r / 6.5));
  }
}

// ------------------------------------------------------------- the frog
/** The avatar at centre x, top y. hop 0..1 stretches the legs; id seeds the blinks. */
function frog(x, y, now, { hop = 0, a = 1, id = 0, joy = 0 } = {}) {
  const x0 = x - 2;
  const blink = kit.fract(now / 3.9 + kit.hash(id) * 7) < 0.035;
  const breathe = 0.9 + 0.1 * Math.sin(now * 2.3 + id);
  const lift = 1 + 0.3 * hop + 0.25 * joy;
  FROG.forEach((row, r) => [...row].forEach((ch, c) => {
    if (ch === '.') return;
    let col = FROGC[ch], k = lift;
    if (ch === 'w') col = blink ? kit.scale(FROGC.b, 0.6) : col;
    else if ('roygcv'.includes(ch)) {
      k *= breathe;
      if (joy > 0) {                                  // victory: the rainbow runs round the body
        const RB = 'roygcv', f = RB.indexOf(ch) + now * 7 + id, i0 = Math.floor(f);
        col = kit.mix(col, kit.mix(FROGC[RB[mod(i0, 6)]], FROGC[RB[mod(i0 + 1, 6)]], f - i0), joy);
      }
    }
    dot(x0 + c, y + r + (r === 6 ? 0.9 * hop : 0), kit.scale(col, k), a);
  }));
  // a glint runs across the glasses now and then
  const g = kit.fract(now / 5.3 + kit.hash(id, 3));
  if (g < 0.12) dot(x0 + g / 0.12 * 5, y + 0.6, [0.9, 0.95, 1], 0.5 * Math.sin(Math.PI * g / 0.12) * a);
}

function snake(rel) {
  const head = 34 - (rel - 0.6) * 8.5;
  if (head > 36 || head < -16) return;
  for (let i = 13; i >= 0; i--) {
    const x = head + i * 0.85, y = 30.35 + 0.7 * Math.sin(i * 0.75 - rel * 7);
    const c = i === 0 ? kit.scale(SNAKE, 1.4) : i % 3 === 1 ? BAND : kit.scale(SNAKE, 1 - i * 0.03);
    dot(x, y, c, i === 13 ? 0.5 : 1);
  }
  const yh = 30.35 + 0.7 * Math.sin(-rel * 7);
  if (Math.sin(rel * 19) > 0.2) dot(head - 1, yh, TONGUE, 0.8);
}

// ------------------------------------------------------------ the frame
let grid = null, gridKey = null;
function gridOf(L) {
  if (gridKey === L.key) return grid;
  grid = new Int32Array(N * N).fill(-1);
  for (const l of L.leds) grid[(l.panel * 8 + l.row) * N + l.col] = l.i;
  gridKey = L.key;
  return grid;
}

export default {
  name: 'Frogger',
  blurb: 'the hour floats by as logs, the minute swims as baby turtles; the rainbow frog crosses once a minute',
  layouts: ['strip-x4'], look: { look: 'opal', gap: 1.5 }, fps: 60, brightness: 0.55, dither: true,
  frame(ctx) {
    const d = ctx.date, now = d.getTime() / 1000;
    NOW = now;
    const M = Math.floor(now / 60) * 60, s = now - M;
    const minute = d.getMinutes(), secH = minute * 60 + s;

    background(now);
    road(now);
    flush();

    // the hour, in logs (whirlpool from 0.6 s before the hour to 2 s after)
    const hrel = secH >= 3600 - 0.6 ? secH - 3600 : secH < 2 ? secH : null;
    const hb = hrel === null ? now : now - hrel;
    const newH = pad(new Date(hb * 1000).getHours()), oldH = hrel === null ? newH : pad(new Date((hb - 1) * 1000).getHours());
    const hu = hrel === null ? 1 : (hrel + 0.6) / 2.6;
    for (const c of copies(VH, P, now, P)) {
      for (let k = 0; k < 2; k++) hourDigit(c.x + 6 * k, Y_LOG, oldH[k], newH[k], hu, c.n * 3 + k * 11, ghost(c.x));
      croc(c.x + 13, Y_LOG + swellH(c.x + 16), now, c.n);
      if (hrel !== null) {
        const env = Math.sin(Math.PI * kit.clamp(hu));
        for (let k = 0; k < 2; k++) if (oldH[k] !== newH[k]) swirl(c.x + 6 * k + 2, Y_LOG + 3, now, env);
      }
    }
    flush();

    // the minute, in turtles (dive and surface over 2.5 s after the turn)
    const oldM = pad(new Date((M - 1) * 1000).getMinutes()), newM = pad(minute);
    for (const c of copies(-VM, P, now, P)) {
      for (let k = 0; k < 2; k++) minuteDigit(c.x + 6 * k, Y_TUR, newM[k], s < 2.6 ? oldM[k] : undefined, s, now, k, ghost(c.x));
      bigTurtles(c.x + 12, Y_TUR + swellM(c.x + 16), now, c.n);
    }
    flush();

    if (minute === 0) { snake(s); flush(); }

    // the frogs at home: one per minute since the level began
    const P0 = plan(M);
    if (minute % 5 === 0) {
      for (let b = 0; b < 5; b++) {
        const dance = minute === 0 ? 4.2 : 0;
        const t0 = dance + 0.35 + 0.16 * b, p = kit.clamp((s - t0) / 0.5);
        if (p >= 1) continue;
        const bob = s < dance ? 2.2 * Math.abs(Math.sin(Math.PI * (s * 1.4 - b * 0.2))) : 0;
        frog(6 * b + 3, Y_BAY - bob - 10 * kit.ease.in(p), now, { id: b, a: 0.9, hop: kit.clamp(p * 4), joy: kit.clamp((dance - s) / 0.6) * kit.clamp(s / 0.4) });
      }
    } else for (const b of P0.used) frog(6 * b + 3, Y_BAY, now, { id: b, a: 0.85 });

    // the crossing frog
    const f = frogAt(P0, s);
    if (f) frog(f[0], f[1], now, { hop: f[2], id: 9 });
    flush();

    const dim = 1 - 0.75 * ctx.night, map = gridOf(ctx.layout), out = ctx.out;
    for (let k = 0; k < N * N; k++) {
      const i = map[k];
      if (i < 0) continue;
      out[3 * i] = buf[3 * k] * dim; out[3 * i + 1] = buf[3 * k + 1] * dim; out[3 * i + 2] = buf[3 * k + 2] * dim;
    }
  },
};
