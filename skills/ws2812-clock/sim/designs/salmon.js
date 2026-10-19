// The Salmon Run: a two-step waterfall down the 64 x 192 tower at dusk. The
// time is held IN the falls by spawning sockeye, each fish bent into a
// numeral (crimson body, olive head, tail fin as the foot), resting against
// the current with its body rippling. A brown bear stands at the lip on top.
// At each minute the fish whose digit is retiring swims out of its numeral
// (the stroke un-draws from tail to head), leaps up the falls and is slurped
// by the bear; a fresh salmon leaps from the plunge pool and swims INTO the
// new numeral, drawing it with its body. On the hour a giant king salmon
// leaps the whole tower, the bear catches it, gulps it and roars, and every
// fish in the pool jumps at once. Always: white water streams down, mist
// rolls off the pools, silver salmon leap from the plunge pool, the bear
// watches them, blinks and shifts its paws.
import * as kit from '../js/kit.js';
import { STEP, glyphPoly, makeRoute, bezier } from './salmon-glyphs.js';

const W = 64, H = 192, N = W * H;
const img = new Float32Array(3 * N);
const pad = (n) => String(n).padStart(2, '0');
const digitsOf = (ms) => { const d = new Date(ms); return pad(d.getHours()) + pad(d.getMinutes()); };
const sst = kit.smoothstep, clamp = kit.clamp, hash = kit.hash;

// ------------------------------------------------------------ palette (linear)
const C = {
  crimson: kit.hex('#e3241b'), head: kit.hex('#1f3414'), fin: kit.hex('#9a1c14'), eye: kit.hex('#ffffff'),
  silver: kit.hex('#c9d6e0'), pink: kit.hex('#f0a0a8'), king: kit.hex('#c45a2a'), kingBack: kit.hex('#4a5a2a'),
  fur: kit.hex('#7e4824'), furLit: kit.hex('#b0703c'), muzzle: kit.hex('#d0a070'), nose: [0.006, 0.004, 0.003],
  mouth: kit.hex('#6a0c12'), teeth: kit.hex('#e8e0c8'), claw: kit.hex('#e0d0b0'),
};

// ------------------------------------------------------------ the scene's geometry
const LIP1 = 38, POOL1 = 92, LIP2 = 100, POOL2 = 164, MOUTH = [32, 24.5];
const SLOTS = [   // x, y, w, h, R (fish half-width), lean
  [4, 47, 21, 41, 3.35, 0.03], [38, 50, 21, 41, 3.35, -0.02],
  [5, 110, 19, 37, 3.05, 0.02], [39, 114, 19, 37, 3.05, -0.03],
];
const MOAT = 2.2;
// each numeral rests in a slack eddy: the falling water there is calmer and dimmer
const WGAIN = new Float32Array(64 * 192).fill(1);
for (const [sx, sy, sw, sh] of SLOTS) for (let y = 0; y < 192; y++) for (let x = 0; x < 64; x++) {
  const e = Math.hypot((x - sx - sw / 2) / (sw * 0.5 + 3), (y - sy - sh / 2) / (sh * 0.5 + 3));
  WGAIN[y * 64 + x] = Math.min(WGAIN[y * 64 + x], 0.3 + 0.7 * kit.smoothstep(0.75, 1.15, e));
}

// periodic value noise for the textures
function pnoise(x, y, p, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const m = (k) => ((k % p) + p) % p;
  const a = hash(m(xi), m(yi), seed), b = hash(m(xi + 1), m(yi), seed), c = hash(m(xi), m(yi + 1), seed), d = hash(m(xi + 1), m(yi + 1), seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
// foam / mist texture, 64 x 64, tiles
const FOAM = new Float32Array(64 * 64);
for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
  FOAM[y * 64 + x] = 0.55 * pnoise(x / 8, y / 8, 8, 3) + 0.3 * pnoise(x / 4, y / 4, 16, 4) + 0.15 * pnoise(x / 2, y / 2, 32, 5);
}
function foamAt(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const x0 = xi & 63, y0 = yi & 63, x1 = (xi + 1) & 63, y1 = (yi + 1) & 63;
  const a = FOAM[y0 * 64 + x0], b = FOAM[y0 * 64 + x1], c = FOAM[y1 * 64 + x0], d = FOAM[y1 * 64 + x1];
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
// falling-water streaks: per column, random dashes in a 256-long loop, blurred sideways
const TEX = new Float32Array(W * 256);
{
  const raw = new Float32Array(W * 256);
  for (let x = 0; x < W; x++) for (let j = 0; j < 12; j++) {
    const s0 = Math.floor(hash(x, j, 1) * 256), len = 8 + Math.floor(36 * hash(x, j, 2)), a = 0.3 + 0.7 * hash(x, j, 3) ** 2;
    for (let k = 0; k < len; k++) raw[x * 256 + ((s0 + k) & 255)] += a * Math.sin(Math.PI * k / len);
  }
  for (let x = 0; x < W; x++) for (let k = 0; k < 256; k++) {
    const l = raw[Math.max(0, x - 1) * 256 + k], c = raw[x * 256 + k], r = raw[Math.min(W - 1, x + 1) * 256 + k];
    TEX[x * 256 + k] = Math.min(1.3, 0.25 * l + 0.5 * c + 0.25 * r);
  }
}
// per row: which zone, and the "time to fall here" that makes streaks accelerate
const ZONE = new Uint8Array(H), TY = new Float32Array(H), AER = new Float32Array(H);
for (let y = 0; y < H; y++) {
  let z, d = 0;
  if (y < 27) z = 0; else if (y < LIP1) z = 1; else if (y < LIP1 + 3) z = 2;
  else if (y < POOL1) { z = 3; d = y - LIP1 - 3; } else if (y < LIP2) z = 4; else if (y < LIP2 + 3) z = 2;
  else if (y < POOL2) { z = 3; d = y - LIP2 - 3; } else if (y < 176) z = 5; else z = 6;
  ZONE[y] = z;
  const v0 = 30, a = 3.2;
  TY[y] = Math.log(1 + a * d / v0) / a + (y > LIP2 ? 3.7 : 0);
  AER[y] = 0.35 + 0.65 * clamp(d / 34);
}
// rock walls at the sides, static colour; pines on the skyline
const ROCK = new Float32Array(3 * N), ROCKA = new Float32Array(N), PINE = new Float32Array(W);
for (let x = 0; x < W; x++) {
  const tree = Math.abs(((x + 2.5 * hash(Math.floor(x / 6), 7)) % 6) - 3);
  PINE[x] = 13 + 6 * pnoise(x / 9, 0, 8, 11) + tree * 2.2;
}
for (let y = 27; y < H; y++) {
  const edge = (side) => {
    let w = 1.2 + 2.6 * pnoise(y / 7, side * 5, 64, 21) + 1.5 * pnoise(y / 2.5, side * 3, 128, 22);
    if (y > POOL1 - 4 && y < LIP2 + 4) w += 3.5 * sst(POOL1 - 4, POOL1 + 2, y) * (1 - sst(LIP2, LIP2 + 4, y));
    if (y > POOL2 - 6) w += 4 + 3 * pnoise(y / 5, side, 64, 23);
    if (y < LIP1 + 2) w += 2.5;
    return w;
  };
  const wl = edge(0), wr = edge(1);
  for (let x = 0; x < W; x++) {
    const e = Math.min(wl - x, x - (W - 1 - wr));
    const a = clamp(e + 0.5);
    const p = y * W + x;
    ROCKA[p] = a;
    if (a <= 0) continue;
    const tx = pnoise(x / 3, y / 3, 64, 31), wet = pnoise(x / 1.5, y / 1.5, 128, 32);
    const k = (0.06 + 0.09 * tx + 0.12 * wet ** 4) * (0.7 + 0.6 * clamp(1.6 - e)), moss = 0.02 * pnoise(x / 4, y / 6, 64, 33) * sst(0.4, 0.9, tx);
    ROCK[3 * p] = k * 1.1; ROCK[3 * p + 1] = k + moss; ROCK[3 * p + 2] = k * 0.95;
  }
}
// rock teeth that break the second lip
const TEETH = [[13, 2.5], [31, 2], [51, 3]];
for (const [tx, tw] of TEETH) for (let y = LIP2 - 5; y < LIP2 + 6; y++) for (let x = 0; x < W; x++) {
  const e = (1 - Math.hypot((x - tx) / (tw + 1.2), (y - LIP2 - 1) / 3.6)) * 3;
  const a = clamp(e + 0.3 * (pnoise(x / 1.5, y / 1.5, 128, 34) - 0.5)), p = y * W + x;
  if (a <= ROCKA[p]) continue;
  const top = clamp((LIP2 + 1 - y) / 4);
  const k = 0.05 + 0.09 * top * pnoise(x / 2, y / 2, 64, 35) + 0.05 * top;
  ROCKA[p] = a; ROCK[3 * p] = k * 1.1; ROCK[3 * p + 1] = k; ROCK[3 * p + 2] = k * 0.9;
}

// ------------------------------------------------------------ fish rendering
// A fish is a centreline (head first, STEP apart) stamped as discs of
// varying radius into a signed-distance buffer; the winning stamp gives
// the distance from the head (h), from the tail (q) and the surface normal.
const SDF = new Float32Array(N).fill(1e9), SH = new Float32Array(N), SQ = new Float32Array(N);
const SDX = new Float32Array(N), SDY = new Float32Array(N);
const TOUCH = new Int32Array(N);
let nT = 0;
const FX = new Float32Array(2048), FY = new Float32Array(2048), FNX = new Float32Array(2048), FNY = new Float32Array(2048);

/** Fill the centreline buffer from a route between tailU and headU; returns the count. */
function fromRoute(R, tailU, headU) {
  const lo = Math.max(0, tailU), hi = Math.min(R.L, headU);
  if (hi <= lo) return 0;
  const n = Math.min(2047, Math.floor((headU - lo) / STEP) + 1);
  let k = 0;
  for (; k < n; k++) {
    const u = headU - k * STEP;
    if (u > hi) { FX[k] = NaN; continue; }   // beyond the route's end (inside the bear): not drawn
    if (u < lo) break;
    const f = u / STEP, i = Math.min(R.n - 2, Math.floor(f)), w = f - i;
    FX[k] = R.x[i] + (R.x[i + 1] - R.x[i]) * w; FY[k] = R.y[i] + (R.y[i + 1] - R.y[i]) * w;
    FNX[k] = R.nx[i] + (R.nx[i + 1] - R.nx[i]) * w; FNY[k] = R.ny[i] + (R.ny[i + 1] - R.ny[i]) * w;
  }
  return k;
}

function radius(h, q) {
  let r = 1;
  if (h < 2.5) r = 0.62 + 0.53 * Math.sqrt(h / 2.5);
  else if (h < 7) r = 1.15 - 0.15 * sst(4.5, 7, h);      // the big hooked head of a spawner
  if (q < 14) r *= 0.5 + 0.5 * sst(2, 14, q);       // the tail narrows to the wrist; the fork is stamped apart
  return r;
}

/** One disc of a fish into the distance buffer. */
function disc(cx, cy, r, h, q) {
  const reach = r + MOAT, re2 = reach * reach, ir = 1 / r;
  const x0 = Math.max(0, Math.ceil(cx - reach)), x1 = Math.min(W - 1, Math.floor(cx + reach));
  const y0 = Math.max(0, Math.ceil(cy - reach)), y1 = Math.min(H - 1, Math.floor(cy + reach));
  for (let py = y0; py <= y1; py++) {
    const dy = py - cy, dy2 = dy * dy, row = py * W;
    for (let px = x0; px <= x1; px++) {
      const dx = px - cx, d2 = dx * dx + dy2;
      if (d2 > re2) continue;
      const d = Math.sqrt(d2) - r, p = row + px;
      if (d < SDF[p]) {
        if (SDF[p] > 1e8) TOUCH[nT++] = p;
        SDF[p] = d; SH[p] = h; SQ[p] = q; SDX[p] = dx * ir; SDY[p] = dy * ir;
      }
    }
  }
}

/** Stamp the centreline buffer (count points, head first); a forked tail if the tail is in it. */
function stamp(count, len, R, amp, wavePh, ox, oy) {
  EOX = ox; EOY = oy;
  let lx = 0, ly = 0, px = 0, py = 0;
  for (let k = 0; k < count; k++) {
    const cx0 = FX[k];
    if (cx0 !== cx0) continue;
    const h = k * STEP, q = len - h;
    const env = Math.min(1, h / (len * 0.75 + 1));
    const wv = amp * env * env * Math.sin(h * 0.3 - wavePh);
    const cx = cx0 + FNX[k] * wv + ox, cy = FY[k] + FNY[k] * wv + oy;
    disc(cx, cy, R * radius(h, q), h, q);
    if (k === 5) { EOX = cx - cx0; EOY = cy - FY[k]; }
    // the spawning hump: a dorsal fin on one flank, mid-body
    if (R > 2.5 && Math.abs(h - len * 0.42) < 2.6) disc(cx + FNX[k] * R * 0.75, cy + FNY[k] * R * 0.75, R * 0.55 * (1 - Math.abs(h - len * 0.42) / 2.6) + 0.3, -1, q);
    px = lx; py = ly; lx = cx; ly = cy;
    if (k === count - 4) { px = cx; py = cy; }
  }
  if (count > 6 && len - (count - 1) * STEP < STEP * 1.5) {
    // the caudal fin: two lobes swept back from the tail tip, flicking
    const k0 = count - 4;
    let bx = lx - (FX[k0] + ox), by = ly - (FY[k0] + oy);
    const bl = Math.hypot(bx, by) || 1; bx /= bl; by /= bl;
    const fl = 0.25 * Math.sin(wavePh * 1.3);
    for (const s of [-1, 1]) {
      const a = s * 0.62 + fl, ca = Math.cos(a), sa = Math.sin(a);
      const dx = bx * ca - by * sa, dy = bx * sa + by * ca;
      for (let j = 1; j <= 3; j++) disc(lx + dx * R * 0.55 * j, ly + dy * R * 0.55 * j, R * (0.5 - 0.08 * j), len, 0);
    }
  }
}

/** Composite the stamped fish into img. kind 0 sockeye, 1 silver, 2 king. */
function composite(kind, alpha, glint) {
  for (let j = 0; j < nT; j++) {
    const p = TOUCH[j], d = SDF[p];
    SDF[p] = 1e9;
    const o = 3 * p;
    if (d > 0) { const m = d / MOAT, k = 1 - alpha * (1 - (0.1 + 0.9 * m * m)); img[o] *= k; img[o + 1] *= k; img[o + 2] *= k; }
    const cov = clamp(0.5 - d) * alpha;
    if (cov <= 0) continue;
    const h = SH[p], q = SQ[p], sx = SDX[p], sy = SDY[p];
    const lit = -(0.55 * sx + 0.8 * sy);                  // light from the upper left
    const shade = clamp(0.62 + 0.5 * lit, 0.22, 1.15);
    const spec = Math.max(0, 1 - Math.abs(lit - 0.55) * 3.5);
    let r, g, b;
    if (kind === 1) {
      const pk = Math.max(0, 1 - Math.abs(lit + 0.1) * 3) * 0.6;   // pink lateral line
      r = C.silver[0] * shade + C.pink[0] * pk; g = C.silver[1] * shade + C.pink[1] * pk * 0.5; b = C.silver[2] * shade + C.pink[2] * pk * 0.5;
      const s = spec * (0.3 + 0.9 * glint); r += s; g += s; b += s;
      if (h < 4) { r *= 0.6; g *= 0.7; b *= 0.75; }
    } else {
      const hm = h < 0 ? 0 : 1 - sst(kind === 2 ? 8 : 4.5, kind === 2 ? 10 : 5.8, h), fm = h < 0 ? 0.8 : 1 - sst(2.2, 3.6, q);
      const body = kind === 2 ? C.king : C.crimson;
      r = body[0] + (C.head[0] - body[0]) * hm; g = body[1] + (C.head[1] - body[1]) * hm; b = body[2] + (C.head[2] - body[2]) * hm;
      r += (C.fin[0] - r) * fm; g += (C.fin[1] - g) * fm; b += (C.fin[2] - b) * fm;
      if (kind === 2) {                                   // dark back, spotted
        const back = sst(0.1, 0.7, lit) * (1 - hm);
        r += (C.kingBack[0] - r) * back; g += (C.kingBack[1] - g) * back; b += (C.kingBack[2] - b) * back;
        if (hash(Math.floor(h * 0.7), Math.floor(lit * 4 + 4), 5) > 0.82) { r *= 0.35; g *= 0.35; b *= 0.35; }
      }
      const scl = 0.88 + 0.12 * Math.sin(h * 2.1 + lit * 5);
      if (kind === 0 && h > 4.4 && h < 5.4) { r *= 0.3; g *= 0.3; b *= 0.3; }              // gill slit                                  // scale rows
      r *= shade * scl; g *= shade * scl; b *= shade * scl;
      const s = spec * 0.32; r += s; g += s * 0.8; b += s * 0.7;
    }
    img[o] += (r - img[o]) * cov; img[o + 1] += (g - img[o + 1]) * cov; img[o + 2] += (b - img[o + 2]) * cov;
  }
  nT = 0;
}

/** A soft dot painted over img (coverage disc). */
function dot(x, y, r, c, a) {
  const x0 = Math.max(0, Math.ceil(x - r - 1)), x1 = Math.min(W - 1, Math.floor(x + r + 1));
  const y0 = Math.max(0, Math.ceil(y - r - 1)), y1 = Math.min(H - 1, Math.floor(y + r + 1));
  for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
    const cov = clamp(r + 0.5 - Math.hypot(px - x, py - y)) * a;
    if (cov <= 0) continue;
    const o = 3 * (py * W + px);
    img[o] += (c[0] - img[o]) * cov; img[o + 1] += (c[1] - img[o + 1]) * cov; img[o + 2] += (c[2] - img[o + 2]) * cov;
  }
}
function addDot(x, y, r, cr, cg, cb) {
  const x0 = Math.max(0, Math.ceil(x - r)), x1 = Math.min(W - 1, Math.floor(x + r));
  const y0 = Math.max(0, Math.ceil(y - r)), y1 = Math.min(H - 1, Math.floor(y + r));
  for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
    const d2 = ((px - x) ** 2 + (py - y) ** 2) / (r * r);
    if (d2 >= 1) continue;
    const f = (1 - d2) * (1 - d2), o = 3 * (py * W + px);
    img[o] += cr * f; img[o + 1] += cg * f; img[o + 2] += cb * f;
  }
}

/** The eye: on the upper side of the head. */
let EOX = 0, EOY = 0;
function eyeOf(len, R, big) {
  const k = Math.round((big ? 4.2 : 3.0) / STEP);
  if (k >= len || FX[k] !== FX[k]) return;
  let nx = FNX[k], ny = FNY[k];
  if (ny > 0) { nx = -nx; ny = -ny; }
  const ex = FX[k] + nx * R * 0.3 + EOX, ey = FY[k] + ny * R * 0.3 + EOY;
  dot(ex, ey, big ? 1.7 : 1.25, C.eye, 1);
  dot(ex + 0.15, ey + 0.1, big ? 0.85 : 0.55, [0, 0, 0], 1);
}

// ------------------------------------------------------------ routes (cached per minute)
const routes = new Map();
function route(key, make) {
  let r = routes.get(key);
  if (!r) { if (routes.size > 400) routes.clear(); r = make(); routes.set(key, r); }
  return r;
}
const polyOf = (slot, d) => { const [x, y, w, h, , lean] = SLOTS[slot]; return glyphPoly(d, x, y, w, h, lean); };
const restRoute = (slot, d) => route(`r${slot}${d}`, () => makeRoute([polyOf(slot, d)]));
function enterRoute(slot, d, key) {
  return route(`e${slot}${d}${key}`, () => {
    const p = polyOf(slot, d), a = p[0], b = p[3];
    const tx = b[0] - a[0], ty = b[1] - a[1], l = Math.hypot(tx, ty) || 1;
    const sx = 8 + 48 * hash(key, slot, 41), back = slot < 2 ? 34 : 26;
    const inC = bezier([sx, 198], [sx + (a[0] - sx) * 0.2, 150], [a[0] - (tx / l) * back, a[1] - (ty / l) * back], a);
    return makeRoute([inC, p]);
  });
}
function leaveRoute(slot, d) {
  return route(`l${slot}${d}`, () => {
    const p = polyOf(slot, d), z = p[p.length - 1], y = p[p.length - 4];
    const tx = z[0] - y[0], ty = z[1] - y[1], l = Math.hypot(tx, ty) || 1;
    const side = slot % 2 ? 1 : -1;
    const out = bezier(z, [z[0] + (tx / l) * 14, z[1] + (ty / l) * 14], [MOUTH[0] + side * 6, MOUTH[1] + 30], MOUTH);
    return makeRoute([p, out]);
  });
}
const giantRoute = makeRoute([bezier([32, 236], [33.5, 160], [30.5, 90], MOUTH, 120)]);   // straight up the gap between the numerals

// ------------------------------------------------------------ timing
const LC = [22, 22, 19, 19];         // a free salmon's length (hour fish are bigger)
const RFREE = [3.9, 3.9, 3.6, 3.6];
const DR = 0.5;                      // the numeral un-draws in this long
const SLURP = 0.32;
/** Changed slots for a turn, in leaving order (minute units first). */
function changed(a, b) { const s = []; for (const k of [3, 2, 1, 0]) if (a[k] !== b[k]) s.push(k); return s; }
const leaveT0 = (n, order) => -0.6 - 0.17 * (n - 1) + 0.17 * order;
const enterT0 = (order) => 0.12 + 0.22 * order;
const enterDur = (slot) => (slot < 2 ? 1.75 : 1.45);

// ------------------------------------------------------------ the bear
function drawBear(t, st) {
  const bx = 32 + 0.6 * Math.sin(t * 0.41) + st.lean, by = 16 + 0.35 * Math.sin(t * 1.9) + st.dip - st.rise;
  const open = st.open, blink = st.blink;
  const lookX = clamp(st.look, -1, 1) * 1.1;
  const x0 = 8, x1 = 56, y0 = 0, y1 = LIP1 + 1;
  for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
    const o = 3 * (py * W + px);
    let cov, r = img[o], g = img[o + 1], b = img[o + 2];
    const paint = (c, a) => { if (a > 0) { r += (c[0] - r) * a; g += (c[1] - g) * a; b += (c[2] - b) * a; } };
    const ell = (cx, cy, rx, ry) => (1 - Math.hypot((px - cx) / rx, (py - cy) / ry)) * Math.min(rx, ry) + 0.5;
    if (st.mode === 0) {
      // body and shoulders (behind the head), sunk into the river at the lip
      const bodyY = by + 17;
      cov = clamp(ell(bx, bodyY, 16, 12)) * (1 - sst(LIP1 - 2, LIP1 + 0.5, py));
      if (cov > 0) {
        const fl = 0.75 + 0.35 * clamp((bodyY - py) / 12) + 0.1 * pnoise(px / 2, py / 2, 64, 51);
        paint([C.fur[0] * fl, C.fur[1] * fl, C.fur[2] * fl], cov);
      }
      // paws on the lip, claws over the edge
      for (const s of [-1, 1]) {
        const lift = s < 0 ? st.pawL : st.pawR;
        const pxc = bx + s * 10.5, pyc = LIP1 - 1.5 - lift;
        cov = clamp(ell(pxc, pyc, 4.6, 2.8));
        if (cov > 0) paint(C.furLit, cov * 0.95);
        for (let c = -1; c <= 1; c++) {
          const cl = clamp(1 - Math.hypot(px - (pxc + c * 1.8), py - (pyc + 2.2)) * 1.2);
          if (cl > 0) paint(C.claw, cl * 0.9);
        }
      }
    } else {
      // head
      cov = clamp(ell(bx, by, 10.5, 9.2));
      // ears
      const eL = clamp(ell(bx - 8.2, by - 7.2 - st.earL, 3.4, 3.4)), eR = clamp(ell(bx + 8.2, by - 7.2 - st.earR, 3.4, 3.4));
      if (eL > 0) { paint(C.fur, eL); paint(C.mouth, clamp(ell(bx - 8.2, by - 7.0 - st.earL, 1.6, 1.6)) * 0.7); }
      if (eR > 0) { paint(C.fur, eR); paint(C.mouth, clamp(ell(bx + 8.2, by - 7.0 - st.earR, 1.6, 1.6)) * 0.7); }
      if (cov > 0) {
        const fl = 0.8 + 0.45 * clamp((by - py) / 9 + 0.3) + 0.12 * pnoise(px / 2, py / 2, 64, 52);
        paint([C.fur[0] * fl, C.fur[1] * fl, C.fur[2] * fl], cov);
      }
      // muzzle, mouth, nose
      const mo = clamp(open);
      const mz = clamp(ell(bx, by + 4.2 + 0.8 * mo, 5.4, 3.9 + 0.9 * mo));
      if (mz > 0) paint(C.muzzle, mz);
      if (mo > 0.05) {
        const my = by + 6.3 + 1.4 * mo, mry = 0.6 + 2.6 * mo, mrx = 2.4 + 1.8 * mo;
        const m = clamp(ell(bx, my, mrx, mry));
        if (m > 0) {
          paint(C.mouth, m);
          if (py < my - mry + 1.6 && Math.abs(Math.abs(px - bx) - mrx * 0.55) < 0.8 && mo > 0.35) paint(C.teeth, m);
        }
      }
      paint(C.nose, clamp(ell(bx, by + 2.4, 2.1, 1.4)));
      // eyes: dark with a bright glint that looks around; blink
      for (const s of [-1, 1]) {
        const ex = bx + s * 4.4, ey = by - 1.6;
        const e = clamp(ell(ex, ey, 1.6, 1.6 * (1 - 0.85 * blink)));
        if (e > 0) paint([0.004, 0.003, 0.002], e);
        if (blink < 0.5) {
          const gl = clamp(1.2 - Math.hypot(px - (ex + lookX * 0.6 - 0.3), py - (ey - 0.4)) * 1.6);
          if (gl > 0) paint([0.85, 0.85, 0.8], gl * (1 - 2 * blink));
        }
      }
    }
    img[o] = r; img[o + 1] = g; img[o + 2] = b;
  }
}

// ------------------------------------------------------------ background
function background(lt, roar) {
  const tA = lt;
  for (let y = 0; y < H; y++) {
    const z = ZONE[y], row = y * W;
    for (let x = 0; x < W; x++) {
      const p = row + x, o = 3 * p;
      let r, g, b;
      if (z === 0) {                              // dusk sky, pines on the skyline
        const k = y / 27;
        r = 0.004 + 0.32 * k ** 3.2; g = 0.006 + 0.075 * k ** 3.5; b = 0.03 * (1 - k) + 0.012;
        if (y >= PINE[x]) { const rim = Math.max(0, 1 - (y - PINE[x])) * 0.25; r = 0.004 + r * rim; g = 0.006 + g * rim; b = 0.005 + b * rim; }
        else if (y < 14 && hash(x, y, 61) > 0.975) { const tw = 0.5 + 0.5 * Math.sin(tA * (1 + 2 * hash(x, y, 62)) + 9 * hash(x, y, 63)); r += 0.05 * tw; g += 0.05 * tw; b += 0.06 * tw; }
      } else if (z === 1) {                       // the river above the falls, flowing toward us
        const k = (y - 27) / 11;
        const rip = Math.sin(y * 1.6 - tA * 6.5 + 1.4 * Math.sin(x * 0.33 + tA * 0.6) + 0.8 * Math.sin(x * 0.11 - y * 0.4));
        const hi = Math.max(0, rip - 0.55) * 2.2;
        r = 0.012 + (0.16 * (1 - k) + 0.02) * hi; g = 0.02 + (0.05 * (1 - k) + 0.07 * k) * hi; b = 0.04 + 0.1 * k * hi;
      } else if (z === 2) {                       // a lip: glassy water bending over the edge
        const lipY = y < LIP2 ? LIP1 : LIP2, dy = y - lipY;
        const gl = 0.6 + 0.4 * Math.sin(x * 0.7 + tA * 2.6 + y) * Math.sin(x * 0.23 - tA * 1.1);
        const k = (dy === 1 ? 1 : 0.6) * gl;
        r = 0.2 * k + 0.02; g = 0.32 * k + 0.035; b = 0.4 * k + 0.05;
      } else if (z === 3) {                       // falling water: accelerating streaks
        const tc = (TY[y] - tA * 0.55) * 60 + (y > LIP2 ? 100 : 0);
        const f = tc - Math.floor(tc / 256) * 256, i0 = Math.floor(f), w = f - i0;
        const base = x * 256;
        let v = 1.35 * (TEX[base + i0] + (TEX[base + ((i0 + 1) & 255)] - TEX[base + i0]) * w);
        const aer = AER[y];
        if (y > LIP2) for (const [tx, tw] of TEETH) { const gap = clamp(tw + 0.5 - Math.abs(x - tx)) * (1 - sst(0, 14, y - LIP2)); v *= 1 - 0.8 * gap; }
        v *= aer * WGAIN[p];
        const v2 = v * v;
        const w3 = v2 * v2; r = 0.003 + 0.03 * v + 0.9 * w3; g = 0.012 + 0.07 * v + 0.95 * w3; b = 0.03 + 0.12 * v + 1.0 * w3;
      } else if (z === 4 || z === 5) {            // churning foam where the falls land
        const top = z === 4 ? POOL1 : POOL2, span = z === 4 ? LIP2 - POOL1 : 176 - POOL2;
        const k = (y - top) / span;
        const fo = foamAt(x * 0.9 + 3 * Math.sin(tA * 0.7), y * 1.2 + tA * 9) * 0.6 + foamAt(x * 1.7 - tA * 4, y * 1.5 - tA * 3) * 0.4;
        const prof = Math.sin(Math.PI * clamp(k * 1.1 + 0.05)) * (z === 5 ? 1 : 0.85);
        const v = (0.25 + 0.75 * sst(0.3, 0.8, fo)) * prof;
        r = 0.01 + 0.55 * v * v + 0.15 * v; g = 0.025 + 0.6 * v * v + 0.17 * v; b = 0.05 + 0.62 * v * v + 0.2 * v;
      } else {                                    // the plunge pool, dark, ripples and foam rafts
        const k = (y - 176) / 16;
        const fo = foamAt(x * 0.8 - tA * 1.5, y * 1.6 + tA * 2.2);
        const rip = Math.max(0, Math.sin(y * 1.3 - tA * 2.5 + 2 * Math.sin(x * 0.2 + tA * 0.3)) - 0.6) * 1.5;
        const v = 0.5 * sst(0.55, 0.9, fo) * (1 - 0.5 * k) + 0.25 * rip;
        r = 0.003 + 0.08 * v; g = 0.014 + 0.13 * v; b = 0.03 + 0.16 * v;
      }
      // mist rolling off the pools
      if (y > 70 && y < 112 || y > 138) {
        const zc = y < 112 ? Math.exp(-(((y - 96) / 9) ** 2)) * 0.7 : Math.exp(-(((y - 168) / 20) ** 2));
        if (zc > 0.03) {
          const m = foamAt(x * 0.35 + tA * 1.3, y * 0.3 + tA * 2.1);
          const mv = zc * sst(0.45, 0.85, m) * 0.09;
          r += mv; g += mv * 1.08; b += mv * 1.18;
        }
      }
      // roar ripples
      if (roar > 0) {
        const dd = Math.hypot(x - MOUTH[0], (y - MOUTH[1]) * 0.8);
        for (let ri = 0; ri < 3; ri++) {
          const rr = (roar - ri * 0.28) * 150;
          if (rr <= 0) continue;
          const band = Math.max(0, 1 - Math.abs(dd - rr) / 2.5) * Math.max(0, 1 - rr / 200) * 0.22;
          r += band; g += band * 0.75; b += band * 0.5;
        }
      }
      const ra = ROCKA[p];
      if (ra > 0) { r += (ROCK[o] - r) * ra; g += (ROCK[o + 1] - g) * ra; b += (ROCK[o + 2] - b) * ra; }
      img[o] = r; img[o + 1] = g; img[o + 2] = b;
    }
  }
}

// ------------------------------------------------------------ silver leapers
const LP = 0.42;
function leaper(k, lt, burst) {
  // a leap: from the pool at (x0, y0), ballistic, length L
  let t0, dur, x0, vx, hgt, len;
  if (burst < 0) {
    if (hash(k, 1, 71) > 0.8) return;
    t0 = k * LP + hash(k, 2, 71) * LP; dur = 0.7 + 0.35 * hash(k, 3, 71);
    x0 = 7 + 50 * hash(k, 4, 71); hgt = 9 + 20 * hash(k, 6, 71) ** 1.5; len = 9 + 4 * hash(k, 7, 71);
    vx = (hash(k, 5, 71) > 0.5 ? 1 : -1) * (10 + 16 * hash(k, 8, 71));
  } else {
    t0 = burst + 0.45 * hash(k, 2, 72); dur = 0.85 + 0.4 * hash(k, 3, 72);
    x0 = 5 + 54 * hash(k, 4, 72); hgt = 18 + 26 * hash(k, 6, 72); len = 10 + 4 * hash(k, 7, 72);
    vx = (hash(k, 5, 72) > 0.5 ? 1 : -1) * (12 + 18 * hash(k, 8, 72));
  }
  const y0 = 181, tau = lt - t0;
  const g = 8 * hgt / (dur * dur), vy0 = 4 * hgt / dur;
  // splashes at launch and landing
  for (const [ts, sx] of [[0, x0], [dur, x0 + vx * dur]]) {
    const ta = tau - ts;
    if (ta < 0 || ta > 0.45) continue;
    for (let s = 0; s < 6; s++) {
      const dvx = (hash(k, s, 73 + ts) - 0.5) * 30, dvy = 20 + 25 * hash(k, s, 75 + ts);
      const dx = sx + dvx * ta, dy = y0 - 2 - dvy * ta + 0.5 * 160 * ta * ta;
      const a = (1 - ta / 0.45) * 0.3;
      addDot(dx, dy, 1.1, a, a * 1.1, a * 1.2);
    }
  }
  if (tau < 0 || tau > dur) return;
  // the body trails along the arc itself: point i is where the head was a moment ago
  const n = Math.floor(len / STEP);
  let tt = tau;
  for (let i = 0; i < n; i++) {
    const vyy = -(vy0 - g * tt), sp = Math.hypot(vx, vyy) || 1;
    FX[i] = x0 + vx * tt; FY[i] = y0 - (vy0 * tt - 0.5 * g * tt * tt);
    FNX[i] = -vyy / sp; FNY[i] = vx / sp;
    tt -= STEP / sp;
  }
  const fade = Math.min(1, tau / 0.08, (dur - tau) / 0.08);
  stamp(n, len, 1.9, 0.9, lt * 30 + k, 0, 0);
  const glint = Math.max(0, Math.sin(tau * 9 + k)) ** 6;
  composite(1, fade, glint);
  eyeOf(n, 1.9, false);
}

// ------------------------------------------------------------ the frame
const ST = { mode: 0, open: 0, dip: 0, rise: 0, lean: 0, blink: 0, look: 0, pawL: 0, pawR: 0, earL: 0, earR: 0 };
function bump(x, a, b, c) { return x <= a || x >= c ? 0 : x < b ? sst(a, b, x) : 1 - sst(b, c, x); }

export default {
  name: 'Salmon Run',
  blurb: 'spawning sockeye bent into numerals hold in a waterfall; each minute one swims out to the bear and a new one leaps up and swims into its digit; on the hour a giant king salmon, a gulp and a roar',
  layouts: ['hub-tall3'], look: 'smoke', fps: 60, brightness: 0.4, dither: true,
  frame(ctx) {
    const G = kit.grid(ctx);
    if (!G || G.w !== W || G.h !== H) return;
    const ms = ctx.date.getTime(), now = ms / 1000, lt = now - 1.75e9;
    const M = Math.floor(now / 60) * 60, age = now - M, mkey = Math.floor(M / 60) % 100000;
    const prev = digitsOf((M - 60) * 1000), cur = digitsOf(ms), next = digitsOf((M + 60) * 1000);
    const dim = 1 - 0.62 * ctx.night;

    // ---- the turns in play: the one that just happened (prev -> cur) and the coming one (cur -> next)
    const chA = changed(prev, cur), chB = changed(cur, next);
    const hourA = chA.includes(1) || chA.includes(0);          // the hour digits changed at M
    const gT = hourA ? age - 2.3 : -99;                        // the giant's clock
    const roar = gT > 3.3 && gT < 5.6 ? (gT - 3.3) / 1.2 : 0;

    // bear state: mouth opens for each fish arriving, chews after
    let open = 0, dip = 0;
    const catchAt = (tc, tt) => {
      const x = tt - tc;
      open = Math.max(open, x < 0 ? sst(-0.45, -0.05, x) : x < 0.1 ? 1 - x / 0.1 : x < 0.9 ? 0.35 * Math.abs(Math.sin((x - 0.1) * 9)) * (1 - (x - 0.1) / 0.8) : 0);
      dip = Math.max(dip, bump(x, -0.6, 0, 0.6) * 1.6);
    };
    const leavers = [];
    for (const [ch, from, base, mk] of [[chA, prev, age, mkey - 1], [chB, cur, age - 60, mkey]]) {
      ch.forEach((slot, order) => {
        const T0 = leaveT0(ch.length, order), tau = base - T0;
        const R = leaveRoute(slot, from[slot]), Lp = R.marks[0], Lout = R.L - Lp;
        const Dl = DR * Math.sqrt(Lout / LC[slot]);
        catchAt(T0 + Dl, base);
        if (tau > 0 && tau < Dl + SLURP) leavers.push([slot, R, tau, Dl, Lp, mk]);
      });
    }
    let rise = 0;
    if (gT > -1) {
      catchAt(1.25, gT);
      if (gT > 1.25 && gT < 3.2) open = Math.max(open, 0.75 + 0.1 * Math.sin(gT * 11));
      if (gT > 3.0 && gT < 3.4) open = Math.max(open, 1 - (gT - 3.0) / 0.4 * 0.7);
      const ro = bump(gT, 3.3, 3.6, 5.4);
      open = Math.max(open, 1.45 * ro); rise = 2.5 * ro;
    }
    ST.open = open; ST.dip = dip; ST.rise = rise;
    ST.lean = 0.8 * Math.sin(lt * 0.23);
    const bk = lt % 4.7; ST.blink = roar > 0 ? 0.6 : bump(bk, 0, 0.07, 0.16);
    ST.look = Math.sin(lt * 0.31) * Math.sin(lt * 0.17 + 1);
    const pw = lt % 13; ST.pawL = 2.2 * bump(pw, 5, 5.4, 6.3); ST.pawR = 2.2 * bump(pw, 10.5, 10.9, 11.6) + 1.5 * bump(gT, 3.3, 3.6, 5.4);
    ST.earL = 1.2 * bump(lt % 6.1, 2, 2.08, 2.25); ST.earR = 1.2 * bump(lt % 7.3, 4, 4.08, 4.25);

    // ---- water, rock, mist
    background(lt, roar);

    // ---- silver salmon leaping from the plunge pool (and all at once after the roar)
    const K = Math.floor(lt / LP);
    for (let k = K - 3; k <= K; k++) leaper(k, lt, -1);
    if (gT > 3.3 && gT < 6) for (let k = 0; k < 11; k++) leaper(k, gT, 3.45);

    // ---- the school waiting in the plunge pool: dark backs breaking the surface, swimming in place
    for (let k = 0; k < 4; k++) {
      const cx = 10 + 14.5 * k + 3 * Math.sin(lt * 0.37 + k * 2.1), cy = 184 + 2.2 * Math.sin(lt * 0.53 + k * 1.3);
      const dirx = k % 2 ? 1 : -1, n = 22;
      for (let i = 0; i < n; i++) {
        const s0 = i * STEP;
        FX[i] = cx + dirx * (5 - s0); FY[i] = cy + 0.9 * Math.sin(s0 * 0.35 - lt * 7 - k);
        FNX[i] = 0; FNY[i] = 1;
      }
      stamp(n, n * STEP, 2.0, 0.6, lt * 9 + k, 0, 0);
      composite(1, 0.28, 0);
    }

    // ---- the bear's body
    ST.mode = 0; drawBear(lt, ST);

    // ---- fish in flight: leaving to the bear, the giant
    for (const [slot, R, tau, Dl, Lp] of leavers) {
      const Lc = LC[slot];
      const head = Lp + (R.L - Lp) * Math.min(1, (tau / Dl) ** 2);
      let tail = tau < DR ? Lp * kit.ease.inOut(tau / DR) : Math.max(Lp, head - Lc);
      if (tau > Dl) tail = R.L - Lc * (1 - (tau - Dl) / SLURP);
      const len = head - tail, kk = clamp((len - Lc) / (Lp - Lc));
      const Rr = kit.lerp(RFREE[slot], SLOTS[slot][4], kk);
      const cnt = fromRoute(R, tail, head);
      if (!cnt) continue;
      stamp(cnt, len, Rr, kit.lerp(1.4, 0.5, kk), lt * kit.lerp(26, 13, kk), 0, 0);
      composite(0, 1, 0); eyeOf(cnt, Rr, false);
    }
    if (gT > 0 && gT < 3.5) {
      const Lg = 44, Lr = giantRoute.L;
      const head = Lr * Math.min(1, 1 - (1 - Math.min(1, gT / 1.25)) ** 2);
      let tail = head - Lg, ampG = 1.6, ph = lt * 20;
      if (gT > 1.25) { ampG = 3.2; ph = lt * 14; }                         // flopping in the jaws
      if (gT > 3.0) tail = Lr - Lg * (1 - (gT - 3.0) / 0.45);             // gulp
      const cnt = fromRoute(giantRoute, tail, head);
      if (cnt) { stamp(cnt, head - tail, 6.2, ampG, ph, 0, 0); composite(2, 1, 0); eyeOf(cnt, 6.2, true); }
    }

    // ---- the bear's head
    ST.mode = 1; drawBear(lt, ST);

    // ---- the numerals: resting sockeye, or a new one leaping in
    const shiver = roar > 0 ? 1 + 2.5 * (1 - roar) : 1;
    for (let slot = 0; slot < 4; slot++) {
      const d = cur[slot], R0 = SLOTS[slot][4];
      const ox = 0.35 * Math.sin(lt * 0.9 + slot * 1.7), oy = 0.45 * Math.sin(lt * 1.3 + slot * 2.3);
      const ord = chA.indexOf(slot);
      if (ord >= 0) {
        const tau = age - enterT0(ord), D = enterDur(slot);
        if (tau < 0) continue;                        // the slot is empty: the old fish left, the new one is on its way
        if (tau < D) {
          const R = enterRoute(slot, d, mkey), Lin = R.marks[0], Lp = R.L - Lin, Lc = LC[slot];
          const head = R.L * (1 - (1 - tau / D) ** 2);
          const len = Lc + (Lp - Lc) * clamp((head - Lin) / Lp), tail = head - len;
          const kk = clamp((len - Lc) / (Lp - Lc)), e = sst(0, 1, tau / 0.4);
          const Rr = kit.lerp(RFREE[slot], R0, kk);
          const cnt = fromRoute(R, tail, head);
          if (cnt) { stamp(cnt, len, Rr, kit.lerp(1.4, 0.5, kk), lt * kit.lerp(26, 13, kk), ox * e, oy * e); composite(0, 1, 0); eyeOf(cnt, Rr, false); }
          continue;
        }
      }
      if (chB.includes(slot) && age - 60 > leaveT0(chB.length, chB.indexOf(slot))) continue;  // it is swimming out
      const R = restRoute(slot, d);
      const cnt = fromRoute(R, 0, R.L);
      stamp(cnt, R.L, R0, 0.5 * shiver, lt * 13 * shiver + slot, ox, oy);
      composite(0, 1, 0); eyeOf(cnt, R0, false);
    }

    kit.blitGrid(ctx, img, dim);
  },
};
