// Snow Globe: a glass globe on a walnut base, a cabin, pines and the
// rainbow frog in a scarf inside. The time is the globe's own snow, packed
// into four numerals that float on invisible glass. Snow falls all the time
// and settles on their tops through the minute. At the minute an unseen hand
// shakes the globe: it wobbles, the changed numeral blows apart grain by
// grain, whirls in a vortex and the grains settle, bottom first, into the
// new one. At the hour: a hard shake, the drifts lift into a blizzard round
// the whole globe, and an aurora lights the glass.
import * as kit from '../js/kit.js';
import { MASKS, GW, GH } from './snowglobe-glyphs.js';

const W = 64, H = 64, N = W * H;
const CX = 31.5, CY = 30.5, RIN = 29.2, ROUT = 30.9;
const BASE_Y = 51.5;                               // top of the walnut collar
const SLOT = [[19, 7], [33, 7], [19, 25], [33, 25]];
const TURN = 2.6;                                   // grains are home by then
const EPOCH = 1.7e9;

const { clamp, smoothstep, hash, noise2 } = kit;
const easeIO = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

// ---------------------------------------------------------------- palette
const WARM = kit.blackbody(2100);
const SNOW_LIT = [0.95, 0.97, 1.0], SNOW_MID = [0.42, 0.47, 0.6], SNOW_SH = [0.08, 0.13, 0.36];
const FLAKE = [0.8, 0.86, 1.0];
const SCARF = kit.hex('#d81e1e');

// ------------------------------------------------------------ buffers
const scene = new Float32Array(3 * N);   // inside the glass, before refraction
const bg = new Float32Array(3 * N);      // static part of the inside
const glass = new Float32Array(3 * N);   // base, rim, highlight: not refracted
const occ = new Float32Array(N);         // 1 where the water shows (AA)
const img = new Float32Array(3 * N);

const groundY = (x) => 43.8 - 2.0 * Math.exp(-(((x - 31) / 13) ** 2)) + 0.45 * Math.sin(0.5 * x + 1.3);
const dropW = (x) => smoothstep(16, 22, x) * (1 - smoothstep(42, 48, x));   // where the hour blizzard takes snow from
const inWater = (x, y) => Math.hypot(x - CX, y - CY) < RIN - 0.6 && y < BASE_Y - 0.4;
const waterTop = (x) => CY - Math.sqrt(Math.max(0, RIN * RIN - (x - CX) ** 2)) + 1.5;

// ------------------------------------------------------------ glyph shading
// Light from the upper left: top edges of each snow log lit, undersides blue.
const SHADE = MASKS.map((m) => {
  const c = new Float32Array(GW * GH * 3);
  const at = (x, y) => (x < 0 || y < 0 || x >= GW || y >= GH ? 0 : m[y * GW + x]);
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    const gx = at(x + 1, y) - at(x - 1, y), gy = at(x, y + 1) - at(x, y - 1);
    const lam = clamp(0.5 + 0.6 * (gx * 0.45 + gy * 0.9), 0, 1);
    const col = lam > 0.5 ? kit.mix(SNOW_MID, SNOW_LIT, (lam - 0.5) * 2) : kit.mix(SNOW_SH, SNOW_MID, lam * 2);
    const grain = 0.82 + 0.3 * hash(x, y, 4242 + m.length * 0 + Math.round(m[y * GW + x] * 1000));
    c.set(col.map((q) => q * grain), 3 * (y * GW + x));
  }
  return c;
});
// Cap pixels: just above an upward-facing surface, where falling snow piles.
const CAPS = MASKS.map((m) => {
  const out = [];
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    const here = m[y * GW + x], below = y + 1 < GH ? m[(y + 1) * GW + x] : 0;
    let open = true;
    for (let yy = y - 1; yy >= 0; yy--) if (m[yy * GW + x] > 0.3) { open = false; break; }
    if (open && here < 0.45 && below > 0.55) {
      out.push(x, y, 1 - here, 1);
      if (y > 0 && m[(y - 1) * GW + x] < 0.2 && hash(x, y, 5) > 0.3) out.push(x, y - 1, 1, 2);
    }
  }
  return out;
});

// Icicles: under downward-facing undersides open to the ground, 1-3 px long.
const ICE = MASKS.map((m, d) => {
  const out = [];
  for (let x = 0; x < GW; x++) for (let y = 0; y < GH; y++) {
    if (m[y * GW + x] < 0.6) continue;
    const below = y + 1 < GH ? m[(y + 1) * GW + x] : 0;
    if (below > 0.3) continue;
    let open = true;
    for (let yy = y + 1; yy < GH; yy++) if (m[yy * GW + x] > 0.3) { open = false; break; }
    const h = hash(x, y, 300 + d);
    if (!open || h > 0.42) continue;
    const len = 1 + Math.floor(hash(x, y, 400 + d) * (y > 11 ? 2.2 : 3.4));
    out.push(x, y + 1 - (below > 0 ? 0 : 0), len);
  }
  return out;
});
const ICECOL = [0.16, 0.34, 0.52];
function drawIce(buf, d, ox, oy, a, T, s) {
  if (a <= 0.01) return;
  const c = ICE[d];
  for (let k = 0; k < c.length; k += 3) {
    const x = ox + c[k], y0 = oy + c[k + 1], len = oy < 20 && c[k + 1] > 11 ? Math.min(2, c[k + 2]) : c[k + 2];
    for (let j = 0; j < len; j++) put(buf, x, y0 + j, ICECOL, a * (1 - j / (len + 0.6)) * (j === 0 ? 1.2 : 1));
  }
  // now and then an icicle drips: a bead swells at the tip, lets go and falls
  const ph = T / 5.3 + s * 0.37, cyc = Math.floor(ph), f = ph - cyc, n = c.length / 3;
  if (!n) return;
  const k = 3 * Math.floor(hash(cyc, s, d + 500) * n);
  const x = ox + c[k], tip = oy + c[k + 1] + c[k + 2] - 0.4;
  if (f < 0.5) put(buf, x, Math.round(tip), [0.5, 0.75, 0.95], a * 0.6 * (f / 0.5));
  else {
    const g = (f - 0.5) / 0.5, y = tip + 9 * g * g;
    dep(buf, x, y, 0.5 * a * (1 - g), 0.75 * a * (1 - g), 0.95 * a * (1 - g));
  }
}

// ------------------------------------------------------------ deposit helpers
function dep(buf, x, y, r, g, b) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  if (xi < -1 || yi < -1 || xi >= W || yi >= H) return;
  const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
  if (yi >= 0) {
    if (xi >= 0) { const p = 3 * (yi * W + xi); buf[p] += r * w00; buf[p + 1] += g * w00; buf[p + 2] += b * w00; }
    if (xi + 1 < W) { const p = 3 * (yi * W + xi + 1); buf[p] += r * w10; buf[p + 1] += g * w10; buf[p + 2] += b * w10; }
  }
  if (yi + 1 < H) {
    if (xi >= 0) { const p = 3 * ((yi + 1) * W + xi); buf[p] += r * w01; buf[p + 1] += g * w01; buf[p + 2] += b * w01; }
    if (xi + 1 < W) { const p = 3 * ((yi + 1) * W + xi + 1); buf[p] += r * w11; buf[p + 1] += g * w11; buf[p + 2] += b * w11; }
  }
}
function soft(buf, x, y, rad, r, g, b) {
  const x0 = Math.ceil(x - rad), x1 = Math.floor(x + rad), y0 = Math.ceil(y - rad), y1 = Math.floor(y + rad);
  const k = 1 / (rad * rad);
  for (let py = y0; py <= y1; py++) {
    if (py < 0 || py >= H) continue;
    const wy = 1 - Math.abs(py - y) / rad;
    if (wy <= 0) continue;
    for (let px = x0; px <= x1; px++) {
      if (px < 0 || px >= W) continue;
      const w = wy * (1 - Math.abs(px - x) / rad) * k;
      if (w <= 0) continue;
      const p = 3 * (py * W + px);
      buf[p] += r * w; buf[p + 1] += g * w; buf[p + 2] += b * w;
    }
  }
}
function put(buf, x, y, c, a = 1) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const p = 3 * (y * W + x);
  buf[p] += c[0] * a; buf[p + 1] += c[1] * a; buf[p + 2] += c[2] * a;
}
// ------------------------------------------------------------ the still parts
function pine(buf, cx, base, h, k) {
  // tiers of boughs, each a little triangle, snow on the upper-left edges
  const tiers = 3, NEEDLE = [0.003, 0.03, 0.012], SNOWED = [0.07, 0.08, 0.12];
  for (let y = Math.floor(base - h); y <= base; y++) {
    const f = (y - (base - h)) / h;                       // 0 top .. 1 base
    const tier = Math.min(tiers - 1, Math.floor(f * tiers)), tf = f * tiers - tier;
    const hw = (0.25 + tier * 0.55 + tf * 1.15) * (h / 9) * 1.3;
    if (y > base - 1.5) { put(buf, Math.round(cx - 0.5), y, [0.03, 0.012, 0.004]); continue; }   // trunk
    for (let x = Math.floor(cx - hw - 1); x <= Math.ceil(cx + hw + 1); x++) {
      const d = Math.abs(x - cx + 0.5) - hw;
      const cov = clamp(0.5 - d);
      if (cov <= 0) continue;
      const snow = (tf < 0.35 || x < cx - hw + 0.8) && hash(x, y, k) > 0.35 ? 1 : 0;
      put(buf, x, y, snow ? SNOWED : NEEDLE, cov);
    }
  }
}
const CABIN = [
  '......^......',
  '.....^^^.....',
  '....^^^^^c...',
  '...^^^^^^^...',
  '..^^^^^^^^^..',
  '.^^^^^^^^^^^.',
  '..iLLLLLLLi..',
  '..LLLLLLLLL..',
  '..LwwLLLddL..',
  '..LwwLLLddL..',
  '..LLLLLLddL..',
  '..LLLLLLddL..',
];
const CAB_X = 4, CAB_Y = 32;
const CABCOL = {
  '^': [0.09, 0.10, 0.15], c: [0.08, 0.012, 0.004], L: [0.07, 0.022, 0.006],
  i: [0.12, 0.14, 0.22], d: [0.012, 0.003, 0.001], w: [0, 0, 0],
};
function buildStatic() {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const r = Math.hypot(x - CX, y - CY), u = r / RIN, p = 3 * (y * W + x);
    // water: deep blue-black, a touch lighter in the middle and low down
    const v = 1 - 0.55 * Math.min(1, u * u);
    bg[p] = 0.0002 * v; bg[p + 1] = 0.0009 * v; bg[p + 2] = 0.0045 * v;
    occ[y * W + x] = clamp(RIN - r + 0.5) * clamp(BASE_Y - y + 0.5);
  }
  // log stripes: alternate wall rows a little lighter
  pine(bg, 17.5, 44, 12, 1); pine(bg, 45.5, 43, 10, 2); pine(bg, 25, 44, 7, 3); pine(bg, 39, 44, 8, 4);
  CABIN.forEach((row, j) => {
    for (let k = 0; k < row.length; k++) {
      const ch = row[k];
      if (ch === '.') continue;
      const x = CAB_X + k, y = CAB_Y + j, p = 3 * (y * W + x);
      bg[p] = bg[p + 1] = bg[p + 2] = 0;
      const c = CABCOL[ch];
      const shade = ch === 'L' ? (j % 2 ? 0.7 : 1.15) * (1 - 0.04 * k) : ch === '^' ? 1.1 - 0.06 * j - 0.03 * k : 1;
      put(bg, x, y, c, shade);
    }
  });
  // the walnut base, a brass band and a blank brass plate
  for (let y = 51; y < H; y++) {
    const yc = y;                                       // pixel centre
    const hw = yc < 54.5 ? 21.6 + (yc - 51.5) * 0.35 : 23.6 + (yc - 54.5) * 0.36;
    const vy = clamp(yc + 0.5 - BASE_Y);
    for (let x = 0; x < W; x++) {
      const cov = clamp(hw - Math.abs(x - CX) + 0.5) * vy;
      if (cov <= 0) continue;
      const p = 3 * (y * W + x);
      const grain = 0.6 + 0.55 * noise2(x * 0.16 + 3, y * 1.4 + 0.5 * noise2(x * 0.3, y));
      const side = 1.25 - 0.55 * ((x - CX) / hw + 1) / 2;         // light from the left
      let c = [0.024 * grain * side, 0.008 * grain * side, 0.0025 * grain * side];
      if (y === 52) c = c.map((q) => q * 1.9);                      // the collar's rounded lip
      if (y === 54) c = c.map((q) => q * 0.35);                     // shadow under the collar
      if (y === 55) { const s = 0.4 + 0.6 * Math.exp(-(((x - 20) / 6) ** 2)); c = [0.16 * s, 0.085 * s, 0.02 * s]; }
      if (y === 63) c = c.map((q) => q * 0.5);
      const plate = x >= 25 && x <= 38 && y >= 58 && y <= 61;
      if (plate) {
        const edge = x === 25 || x === 38 || y === 58 || y === 61;
        c = edge ? [0.07, 0.038, 0.01] : [0.012, 0.006, 0.002];
      }
      glass[p] += c[0] * cov; glass[p + 1] += c[1] * cov; glass[p + 2] += c[2] * cov;
    }
  }
  // the glass: a faint rim, a bright window highlight upper left, a dim one lower right
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = x - CX, dy = y - CY, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
    if (y > BASE_Y + 0.5) continue;
    const p = 3 * (y * W + x);
    const ring = clamp(ROUT - r + 0.5) * clamp(r - RIN + 0.5);
    const fres = 0.5 + 0.5 * Math.cos(a + 2.4) ** 2;
    let s = ring * 0.022 * fres;
    // highlight: an arc band hugging the upper-left glass
    const da = Math.atan2(Math.sin(a + 2.35), Math.cos(a + 2.35));
    const band = Math.exp(-(((r - (RIN - 2.6)) / 0.8) ** 2)) * Math.exp(-((da / 0.3) ** 4));
    s += 0.38 * band;
    const da2 = Math.atan2(Math.sin(a - 0.75), Math.cos(a - 0.75));
    s += 0.10 * Math.exp(-(((r - (RIN - 1.4)) / 0.8) ** 2)) * Math.exp(-((da2 / 0.3) ** 4));
    const dot = Math.exp(-(((x - 13.5) ** 2 + (y - 18.5) ** 2) / 0.9));
    s += 0.35 * dot;
    glass[p] += 0.85 * s; glass[p + 1] += 0.92 * s; glass[p + 2] += 1.0 * s;
  }
}
buildStatic();
// ------------------------------------------------------------ halos
// One pixel of dark water round each numeral, so the snow never sits on snow.
const HALO = MASKS.map((m) => {
  const h = new Float32Array((GW + 2) * (GH + 2));
  for (let y = -1; y <= GH; y++) for (let x = -1; x <= GW; x++) {
    let v = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const xx = x + i, yy = y + j;
      if (xx >= 0 && yy >= 0 && xx < GW && yy < GH) v = Math.max(v, m[yy * GW + xx] * (i && j ? 0.7 : 1));
    }
    h[(y + 1) * (GW + 2) + x + 1] = v;
  }
  return h;
});
const haloBuf = new Float32Array(N);

// ------------------------------------------------------------ the frog
const FROG = [
  '.RRR...RRR.',
  'RwKwR.RwKwR',
  '.RRRgggRRR.',
  'ggggggggggg',
  'g0ggggggg0g',
  '.g0000000g.',
  '.SSSSSSSSS.',
  'gg.bbbbbSgg',
  'gg.g...gSgg',
];
const FROG_X = 46, FROG_Y = 35;
const FROGCOL = FROG.map((row) => [...row].map((ch, k) => {
  if (ch === '.') return null;
  if (ch === 'g') return kit.hsv(0.13 + (k / 10) * 0.42, 0.75, 0.55);
  if (ch === 'b') return kit.hsv(0.13 + (k / 10) * 0.42, 0.35, 0.62);
  if (ch === 'R') return [0.62, 0.52, 0.30];
  if (ch === 'w') return [0.40, 0.40, 0.36];
  if (ch === 'S') return SCARF.map((c) => c * 0.75);
  return [0, 0, 0];                                   // K pupils, 0 mouth: dark
}));
function overPx(buf, x, y, c, a) {
  if (x < 0 || y < 0 || x >= W || y >= H || a <= 0) return;
  const p = 3 * (y * W + x);
  buf[p] += (c[0] - buf[p]) * a; buf[p + 1] += (c[1] - buf[p + 1]) * a; buf[p + 2] += (c[2] - buf[p + 2]) * a;
}
function drawFrog(buf, T, hop, blink, look, up) {
  const fy = FROG_Y + hop, yi = Math.floor(fy), f = fy - yi;
  for (let j = FROG.length - 1; j >= 0; j--) {
    const row = FROGCOL[j];
    for (let k = 0; k < row.length; k++) {
      let c = row[k];
      if (!c) continue;
      if (j === 1 && FROG[j][k] !== 'R') {
        // eyes: the pupil slides to look at what it watches; lids shut to blink
        const e = k < 5 ? k - 1 : k - 7;                 // 0..2 inside each lens
        c = blink ? FROGCOL[0][1] : e === 1 + look ? [0, 0, 0] : FROGCOL[1][1];
        if (up && !blink) c = e === 1 ? [0.03, 0.03, 0.03] : FROGCOL[1][1];
      }
      if (up && j === 0 && (k === 2 || k === 8)) c = [0, 0, 0];      // pupils raised to the sky
      overPx(buf, FROG_X + k, yi + j, c, 1 - f);
      overPx(buf, FROG_X + k, yi + j + 1, c, f);
    }
  }
  // the scarf's loose end drifts in the water
  const sw = Math.sin(T * 1.3) * 0.8 + Math.sin(T * 2.9) * 0.3;
  dep(buf, FROG_X + 8.6 + sw * 0.6, fy + 9.2, SCARF[0] * 0.6, SCARF[1] * 0.6, SCARF[2] * 0.6);
  dep(buf, FROG_X + 9.1 + sw, fy + 9.9, SCARF[0] * 0.4, SCARF[1] * 0.4, SCARF[2] * 0.4);
}

// ------------------------------------------------------------ flakes
const NF = 70;
const FL = Array.from({ length: NF }, (_, k) => {
  const x0 = CX + (hash(k, 1) - 0.5) * 2 * (RIN - 3);
  const near = k < 18;
  const yTop = waterTop(x0), yEnd = groundY(x0) - (near ? 0 : 1.5 * hash(k, 9));
  const v = (near ? 2.4 : 1.4) + 1.6 * hash(k, 2);
  return {
    x0, yTop, yEnd, v, L: (yEnd - yTop) / v + 1.2, sa: 0.5 + 1.5 * hash(k, 3), sf: 0.35 + 0.7 * hash(k, 4),
    ph: hash(k, 5), near, b: near ? 0.22 + 0.2 * hash(k, 6) : 0.035 + 0.06 * hash(k, 6),
  };
});
// the swirl the shake gives everything loose in the water
let swPhi = 0, swS = 0, swOn = false;
const SW_VX = CX, SW_VY = CY + 2;
function swirl(x, y) {
  if (!swOn) { SX = x; SY = y; return; }
  const dx = x - SW_VX, dy = y - SW_VY, r = Math.hypot(dx, dy);
  const w = Math.sin(Math.PI * swS);
  const a = Math.atan2(dy, dx) + swPhi + 1.1 * w * (1 - r / RIN);
  const rr = r * (1 - 0.18 * w);
  SX = SW_VX + rr * Math.cos(a); SY = SW_VY + rr * Math.sin(a);
}
let SX = 0, SY = 0;

// ------------------------------------------------------------ grains
// A grain path: from (sx, sy) to (ex, ey), round a vortex at (vx, vy):
// whole turns, so it starts and ends exactly where it should.
let OX = 0, OY = 0, TX = 0, TY = 0;
function orbit(s, sx, sy, ex, ey, vx, vy, rho, turns, seed, T) {
  const e = easeIO(s), w = Math.sin(Math.PI * s);
  const a0 = Math.atan2(sy - vy, sx - vx), a1 = Math.atan2(ey - vy, ex - vx);
  let da = a1 - a0;
  if (da > Math.PI) da -= 2 * Math.PI; else if (da < -Math.PI) da += 2 * Math.PI;
  const ang = a0 + (da + 2 * Math.PI * turns) * e;
  const r0 = Math.hypot(sx - vx, sy - vy), r1 = Math.hypot(ex - vx, ey - vy);
  const r = (r0 + (r1 - r0) * e) * (1 - w) + rho * w;
  let x = vx + r * Math.cos(ang) + 1.8 * w * (noise2(seed * 0.71, T * 0.9) - 0.5);
  let y = vy + r * Math.sin(ang) + 1.8 * w * (noise2(seed * 0.71 + 40, T * 0.9) - 0.5);
  const dx = x - CX, dy = y - CY, rr = Math.hypot(dx, dy), lim = RIN - 1.6;
  if (rr > lim) { x = CX + (dx * lim) / rr; y = CY + (dy * lim) / rr; }
  if (y > BASE_Y - 2) y = BASE_Y - 2;
  OX = x; OY = y;
}

const pad = (n) => String(n).padStart(2, '0');
const digitsOf = (d) => pad(d.getHours()) + pad(d.getMinutes());

/** The grains of one numeral changing: old pixels fly, new pixels land. */
function buildTurn(slot, dOld, dNew, seed, hour) {
  const [ox, oy] = SLOT[slot];
  const A = [], B = [];
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    const q = y * GW + x;
    if (MASKS[dOld][q] > 0.05) A.push([x, y, MASKS[dOld][q], q, hash(q, seed, 11)]);
    if (MASKS[dNew][q] > 0.05) B.push([x, y, MASKS[dNew][q], q, y + 1.6 * hash(q, seed, 12)]);
  }
  A.sort((a, b) => a[4] - b[4]);                          // a random pairing
  B.sort((a, b) => b[4] - a[4]);                          // land from the bottom up
  const n = Math.max(A.length, B.length);
  const g = {
    n, sx: new Float32Array(n), sy: new Float32Array(n), sv: new Float32Array(n), ex: new Float32Array(n),
    ey: new Float32Array(n), ev: new Float32Array(n), td: new Float32Array(n), ta: new Float32Array(n),
    rho: new Float32Array(n), sc: new Float32Array(3 * n), ec: new Float32Array(3 * n), toGround: new Uint8Array(n),
    vx: ox + 5, vy: oy + 2, turns: hour ? 2 : 1,
  };
  const GC = [0.34, 0.37, 0.46];
  for (let i = 0; i < n; i++) {
    const h1 = hash(i, seed, 21), h2 = hash(i, seed, 22), h3 = hash(i, seed, 23);
    if (i < A.length) {
      const a = A[i];
      g.sx[i] = ox + a[0]; g.sy[i] = oy + a[1]; g.sv[i] = a[2]; g.td[i] = 0.05 + 0.42 * (i / A.length);
      g.sc.set(SHADE[dOld].subarray(3 * a[3], 3 * a[3] + 3), 3 * i);
    } else {
      const x = ox + 5 + (h1 - 0.5) * 16;
      g.sx[i] = x; g.sy[i] = groundY(x) + 0.6; g.sv[i] = 0.0; g.td[i] = 0.15 + 0.5 * h2;
      g.sc.set(GC, 3 * i);
    }
    if (i < B.length) {
      const b = B[i];
      g.ex[i] = ox + b[0]; g.ey[i] = oy + b[1]; g.ev[i] = b[2]; g.ta[i] = 0.72 + 1.25 * (i / B.length);
      g.ec.set(SHADE[dNew].subarray(3 * b[3], 3 * b[3] + 3), 3 * i);
    } else {
      const x = ox + 5 + (h2 - 0.5) * 16;
      g.ex[i] = x; g.ey[i] = groundY(x) + 0.6; g.ev[i] = 0.0; g.ta[i] = 1.2 + 1.0 * h3; g.toGround[i] = 1;
      g.ec.set(GC, 3 * i);
    }
    if (g.ta[i] < g.td[i] + 0.5) g.ta[i] = g.td[i] + 0.5;
    g.rho[i] = (hour ? 9 : 7) + (hour ? 13 : 10) * Math.sqrt(h3);
  }
  return g;
}
const turnCache = { key: -1, slots: null };
function turnsFor(M, prev, next, hour) {
  if (turnCache.key !== M) {
    turnCache.key = M;
    const sl = [0, 1, 2, 3].map((s) => (prev[s] !== next[s] ? buildTurn(s, +prev[s], +next[s], (M / 60) % 100000 + s * 7, hour) : null));
    // one vortex for the whole shake, centred over the numerals that change
    let vx = 0, vy = 0, n = 0;
    sl.forEach((g) => { if (g) { vx += g.vx; vy += g.vy; n++; } });
    if (hour) { vx = CX * n; vy = (CY - 6) * n; }
    sl.forEach((g) => { if (g) { g.vx = vx / n; g.vy = Math.max(15, vy / n - 3); } });
    turnCache.slots = sl;
  }
  return turnCache.slots;
}

// The hour's blizzard (and the minute's small puff): ground snow thrown up
// round the whole globe and laid back down elsewhere on the ground.
const NB = 95;
const BZ = Array.from({ length: NB }, (_, i) => {
  const xs = 9 + 46 * hash(i, 31), xe = 9 + 46 * hash(i, 32);
  return {
    sx: xs, sy: groundY(xs) + 0.5 + 1.5 * hash(i, 33), ex: xe, ey: groundY(xe) + 0.5 + 1.5 * hash(i, 34),
    td: 0.5 + 1.3 * hash(i, 35), dur: 3.6 + 2.8 * hash(i, 36), rho: 7 + 19 * hash(i, 37),
    turns: 1 + Math.floor(hash(i, 38) * 2.2), b: 0.10 + 0.30 * hash(i, 39) ** 2,
  };
});
function drawAurora(buf, T, k) {
  // curtains hanging in the top of the glass: a bright green hem, rays above, violet tops
  for (let x = 4; x < 60; x++) {
    const hem = 15 + 2.6 * Math.sin(0.17 * x + 0.55 * T) + 1.6 * Math.sin(0.061 * x - 0.31 * T + 1.0);
    const ray = 0.55 + 0.45 * Math.sin(0.85 * x + 2.2 * Math.sin(0.23 * T + 0.07 * x));
    const sway = 0.7 + 0.3 * Math.sin(0.11 * x - 0.8 * T);
    for (let y = 2; y < 27; y++) {
      const d = hem - y;                               // >0 above the hem
      if (d < -3) continue;
      const a = d >= 0 ? Math.exp(-d / 5.5) * ray : Math.exp(-(d * d) / 1.5);
      const vio = clamp(d / 11);
      const s = 1.9 * a * sway * k;
      if (s < 0.004) continue;
      const p = 3 * (y * W + x);
      buf[p] += s * (0.02 + 0.22 * vio); buf[p + 1] += s * 0.42 * (1 - vio * 0.85); buf[p + 2] += s * (0.12 + 0.30 * vio);
    }
  }
}

export default {
  name: 'Snow Globe',
  blurb: 'the time is packed from the globe\'s own snow; each minute a shake whirls the changed numeral apart and it settles into the next; the hour is a blizzard under an aurora',
  layouts: ['hub'], look: 'smoke', fps: 60, brightness: 0.4, dither: true,
  frame(ctx) {
    const now = ctx.date.getTime() / 1000, T = now - EPOCH;
    const M = Math.floor(now / 60) * 60, age = now - M;
    const prev = digitsOf(new Date((M - 60) * 1000)), next = digitsOf(ctx.date);
    const hour = ctx.date.getMinutes() === 0;
    const turns = turnsFor(M, prev, next, hour);

    // the shake: wobble of the whole globe, and the swirl of the water
    const SA = hour ? 1.6 : 1.0, SF = hour ? 1.8 : 2.4, ST = hour ? 0.85 : 0.38, SD = hour ? 5.5 : 2.6;
    const env = Math.exp(-age / ST);
    const wx = age < 6 ? SA * Math.sin(2 * Math.PI * SF * age) * env : 0;
    const wy = age < 6 ? 0.3 * SA * Math.sin(4 * Math.PI * SF * age) * env : 0;
    swOn = age < SD; swS = age / SD; swPhi = 2 * Math.PI * (hour ? 2 : 1) * easeIO(swS);

    scene.set(bg);

    // the drifts; at the hour the blizzard takes snow off them for a while
    const drop = hour ? 1.7 * smoothstep(0.6, 2.2, age) * (1 - smoothstep(4.4, 8.0, age)) : 0;
    for (let x = 0; x < W; x++) {
      const yg = groundY(x) + drop * dropW(x);
      for (let y = Math.floor(yg); y < 52; y++) {
        const cov = clamp(y + 0.5 - yg), dpt = y - yg;
        if (cov <= 0) continue;
        const k = clamp(dpt / 7), p = 3 * (y * W + x);
        const top = dpt < 1.2 ? 1 : 0;
        const tex = 0.75 + 0.5 * hash(x, y, 77);
        const r = (top ? 0.05 : 0.012 * (1 - k)) * tex, g = (top ? 0.06 : 0.016 * (1 - k) + 0.001 * k) * tex, b = (top ? 0.10 : 0.04 * (1 - k) + 0.007 * k) * tex;
        scene[p] = scene[p] * (1 - cov) + r * cov; scene[p + 1] = scene[p + 1] * (1 - cov) + g * cov; scene[p + 2] = scene[p + 2] * (1 - cov) + b * cov;
      }
    }
    // the cabin window: firelight, and its spill on the snow
    const fire = 0.75 + 0.15 * noise2(T * 3.1, 1) + 0.1 * noise2(T * 7.3, 5);
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) put(scene, CAB_X + 3 + i, CAB_Y + 8 + j, WARM, 0.55 * fire * (j ? 0.85 : 1));
    soft(scene, CAB_X + 4, 45.5, 3.2, WARM[0] * 0.5 * fire, WARM[1] * 0.5 * fire, WARM[2] * 0.5 * fire);
    // chimney smoke
    for (let k = 0; k < 5; k++) {
      const tau = kit.fract(T / 5.5 + k / 5);
      swirl(CAB_X + 9.5 + 3.5 * tau + 0.8 * Math.sin(T * 0.9 + k), CAB_Y + 1 - 13 * tau);
      const a = 0.06 * Math.sin(Math.PI * tau);
      soft(scene, SX, SY, 1.1 + 2.0 * tau, a * 0.6, a * 0.65, a * 0.8);
    }
    if (hour) {
      const k = smoothstep(0.6, 3.0, age) * (1 - smoothstep(9, 15, age));
      if (k > 0) drawAurora(scene, T, k);
    }
    // far flakes, behind the snow numerals
    for (let k = 18; k < NF; k++) drawFlake(scene, FL[k], T, age);

    // a dark margin round each numeral
    haloBuf.fill(0);
    for (let s = 0; s < 4; s++) {
      const [ox, oy] = SLOT[s], g = turns[s];
      const stamp = (d, a) => {
        const h = HALO[d];
        for (let y = 0; y < GH + 2; y++) for (let x = 0; x < GW + 2; x++) {
          const v = h[y * (GW + 2) + x] * a, q = (oy - 1 + y) * W + ox - 1 + x;
          if (v > haloBuf[q]) haloBuf[q] = v;
        }
      };
      if (g && age < TURN) { stamp(+prev[s], 1 - smoothstep(0.1, 0.5, age)); stamp(+next[s], smoothstep(0.7, 2.0, age)); }
      else stamp(+next[s], 1);
    }
    for (let q = 0; q < N; q++) {
      const v = 1 - 0.92 * haloBuf[q];
      if (v < 1) { scene[3 * q] *= v; scene[3 * q + 1] *= v; scene[3 * q + 2] *= v; }
    }

    // the numerals
    const capOf = (a) => 1.0 * smoothstep(3, 36, a) + 0.8 * smoothstep(32, 59, a);
    const cap = age < 0.45 ? capOf(60) * (1 - age / 0.45) : capOf(age);
    for (let s = 0; s < 4; s++) {
      const [ox, oy] = SLOT[s], g = turns[s];
      if (g && age < TURN) {
        drawGrains(scene, g, age, T, s);
        if (age < 0.45) drawCap(scene, +prev[s], ox, oy, cap);
        drawIce(scene, +prev[s], ox, oy, 1 - smoothstep(0, 0.35, age), T, s);       // shaken off
        drawIce(scene, +next[s], ox, oy, smoothstep(2.0, 2.6, age), T, s);          // and grown again
        continue;
      }
      const d = +next[s], m = MASKS[d], c = SHADE[d];
      for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
        const q = y * GW + x, v = m[q];
        if (v <= 0) continue;
        const pp = 3 * ((oy + y) * W + ox + x); scene[pp] += c[3 * q] * v; scene[pp + 1] += c[3 * q + 1] * v; scene[pp + 2] += c[3 * q + 2] * v;
      }
      drawCap(scene, age < 0.45 ? +prev[s] : d, ox, oy, cap);
      drawIce(scene, d, ox, oy, 1, T, s);
      // ice glints
      for (let k = 0; k < 2; k++) {
        const ph = T / 1.9 + (k + s * 2) / 8, cyc = Math.floor(ph), f = ph - cyc;
        const q = Math.floor(hash(cyc, s, k + 50) * GW * GH);
        if (m[q] > 0.85) put(scene, ox + (q % GW), oy + Math.floor(q / GW), [0.5, 0.55, 0.6], Math.sin(Math.PI * f) ** 3);
      }
    }

    // the frog: hops when the globe jerks, blinks, watches the snow
    const hopT = hour ? 0.95 : 0.7, hopA = hour ? 3.2 : 2.0;
    const hop = age < hopT ? -hopA * Math.sin((Math.PI * age) / hopT) : 0;
    const bph = kit.fract(T / 4.3);
    const C = catchState(T, age);
    const lookUp = hour && age > 2.5 && age < 14;
    drawFrog(scene, T, hop, bph < 0.035 && !C.tongue, C.look, lookUp);
    if (C.fx > 0) soft(scene, C.fx, C.fy, 1.3, 0.55, 0.6, 0.68);
    if (C.tongue > 0) {
      // the tongue: a pink line from the mouth up to the flake
      const mx = FROG_X + 5, my = FROG_Y + 4.6 + hop;
      for (let k = 0; k <= 8; k++) {
        const f = (k / 8) * C.tongue;
        dep(scene, mx + (C.tx - mx) * f, my + (C.ty - my) * f, 0.42, 0.06, 0.09);
      }
    }

    for (let k = 0; k < 18; k++) drawFlake(scene, FL[k], T, age);
    drawLanders(scene, T, age, next);
    if (age < 8.4) drawBlizzard(scene, age, T, hour);

    // compose: wobble, refraction near the rim, the glass and the base
    const dim = 1 - 0.6 * ctx.night;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const qx = x - wx, qy = y - wy, p = 3 * (y * W + x);
      const o = sample1(occ, qx, qy);
      let r = 0, g = 0, b = 0;
      if (o > 0) {
        const dx = qx - CX, dy = qy - CY, rr = Math.hypot(dx, dy), u = rr / RIN;
        let sx = qx, sy = qy;
        if (u > 0.8) { const k = (u + 3.2 * (u - 0.8) ** 2) / u; sx = CX + dx * k; sy = CY + dy * k; }
        sample3(scene, sx, sy);
        r = S3[0] * o; g = S3[1] * o; b = S3[2] * o;
      }
      sample3(glass, qx, qy);
      img[p] = (r + S3[0]) * dim; img[p + 1] = (g + S3[1]) * dim; img[p + 2] = (b + S3[2]) * dim;
    }
    kit.blitGrid(ctx, img);
  },
};

function drawFlake(buf, f, T, age) {
  const tau = kit.fract(T / f.L + f.ph) * f.L, fall = f.L - 1.2;
  const y = f.yTop + (f.yEnd - f.yTop) * Math.min(1, tau / fall);
  const x = f.x0 + f.sa * Math.sin(f.sf * T + f.ph * 6.28) * (tau < fall ? 1 : 0.0) + (tau >= fall ? f.sa * Math.sin(f.sf * (T - tau + fall) + f.ph * 6.28) : 0);
  const a = smoothstep(0, 0.8, tau) * (1 - smoothstep(fall, f.L, tau));
  if (a <= 0) return;
  swirl(x, y);
  if (!inWater(SX, SY)) return;
  const b = f.b * a;
  if (f.near) soft(buf, SX, SY, 1.35, b * FLAKE[0] * 1.6, b * FLAKE[1] * 1.6, b * FLAKE[2] * 1.6);
  else dep(buf, SX, SY, b * FLAKE[0], b * FLAKE[1], b * FLAKE[2]);
}

// One flake every 8 s drifts down to the frog, who watches it and eats it.
const CATCH_P = 8;
function catchState(T, age) {
  const ph = T / CATCH_P, cyc = Math.floor(ph), f = (ph - cyc) * CATCH_P;
  const tx = FROG_X + 5 + (hash(cyc, 71) - 0.5) * 3, ty = FROG_Y - 3.2;
  const out = { fx: -1, fy: 0, tongue: 0, tx, ty, look: 0 };
  const wall = age - f;                                 // the minute-second at which this cycle began
  if (hash(cyc, 72) < 0.25 || wall < 3.5 || wall + CATCH_P > 58) return out;   // not while the globe is shaken
  const FALL = 6.2, x0 = tx + (hash(cyc, 73) - 0.5) * 14;
  if (f < FALL) {
    const u = f / FALL, y0 = waterTop(x0);
    out.fx = x0 + (tx - x0) * u + 1.3 * Math.sin(f * 1.1 + cyc) * (1 - u);
    out.fy = y0 + (ty - y0) * u;
    if (!inWater(out.fx, out.fy)) out.fx = -1;
    const rel = (out.fx - (FROG_X + 5)) / 4;
    out.look = f > 1.5 ? (rel < -0.4 ? -1 : rel > 0.4 ? 1 : 0) : 0;
  } else if (f < FALL + 0.4) {
    const g = (f - FALL) / 0.4;
    out.tongue = g < 0.3 ? g / 0.3 : 1 - (g - 0.3) / 0.7;
    if (g < 0.3) { out.fx = tx; out.fy = ty; }
    out.ty = ty + 0.3;
  }
  return out;
}

// Flakes that come down onto the numerals' tops: the cap they build is the seconds.
function drawLanders(buf, T, age, digits) {
  const live = smoothstep(4, 5.5, age) * (1 - smoothstep(58.2, 59.6, age));
  if (live <= 0) return;
  for (let k = 0; k < 9; k++) {
    const L = 7 + 3 * hash(k, 61), ph = T / L + hash(k, 62), cyc = Math.floor(ph), f = ph - cyc;
    const s = Math.floor(hash(cyc, k, 63) * 4), d = +digits[s], c = CAPS[d];
    const q = 4 * Math.floor(hash(cyc, k, 64) * (c.length / 4));
    const tx = SLOT[s][0] + c[q], ty = SLOT[s][1] + c[q + 1] - 0.3;
    const y0 = waterTop(tx), fall = 0.86, u = Math.min(1, f / fall);
    const y = y0 + (ty - y0) * u, x = tx + 1.2 * Math.sin(T * 0.8 + k * 2) * (1 - u) ** 1.5;
    const a = live * smoothstep(0, 0.08, f) * (f < fall ? 1 : 1 - (f - fall) / (1 - fall)) * 0.4;
    if (a > 0.004) soft(buf, x, y, 1.25, a * FLAKE[0] * 1.6, a * FLAKE[1] * 1.6, a * FLAKE[2] * 1.6);
  }
}

function drawCap(buf, d, ox, oy, cap) {
  if (cap <= 0.01) return;
  // cap: [0..1] for the first row of new snow, [1..2] the fluff above it
  const c = CAPS[d], c1 = Math.min(1, cap), c2 = clamp(cap - 1) * 0.6;
  for (let k = 0; k < c.length; k += 4) {
    const a = (c[k + 3] === 1 ? c1 : c2) * c[k + 2] * (0.7 + 0.3 * hash(c[k], c[k + 1], d));
    if (a > 0.003) put(buf, ox + c[k], oy + c[k + 1], SNOW_LIT, a * 0.85);
  }
}

function drawGrains(buf, g, age, T, slot) {
  for (let i = 0; i < g.n; i++) {
    const s = (age - g.td[i]) / (g.ta[i] - g.td[i]);
    let x, y, v, r, gg, b;
    if (s <= 0) { x = g.sx[i]; y = g.sy[i]; v = g.sv[i]; r = g.sc[3 * i]; gg = g.sc[3 * i + 1]; b = g.sc[3 * i + 2]; }
    else if (s >= 1) {
      if (g.toGround[i]) continue;
      x = g.ex[i]; y = g.ey[i]; v = g.ev[i]; r = g.ec[3 * i]; gg = g.ec[3 * i + 1]; b = g.ec[3 * i + 2];
    } else {
      // a short trail, one sixtieth of a second behind
      const s0 = s - 1 / (60 * (g.ta[i] - g.td[i]));
      if (s0 > 0) {
        orbit(s0, g.sx[i], g.sy[i], g.ex[i], g.ey[i], g.vx, g.vy, g.rho[i], g.turns, i + slot * 300, T - 1 / 60);
        TX = OX; TY = OY;
      } else { TX = -99; }
      orbit(s, g.sx[i], g.sy[i], g.ex[i], g.ey[i], g.vx, g.vy, g.rho[i], g.turns, i + slot * 300, T);
      x = OX; y = OY;
      const e = easeIO(s), w = Math.sin(Math.PI * s);
      v = g.sv[i] + (g.ev[i] - g.sv[i]) * e;
      if (g.sv[i] === 0) v = Math.max(v, 0.55 * w);        // kicked up from the drift
      if (g.toGround[i]) v = Math.max(v, 0.55 * w) * (1 - smoothstep(0.8, 1, s));
      const sp = 0.25 * w;                                   // flying grains catch the light
      r = (g.sc[3 * i] + (g.ec[3 * i] - g.sc[3 * i]) * e) * (1 - sp) + sp;
      gg = (g.sc[3 * i + 1] + (g.ec[3 * i + 1] - g.sc[3 * i + 1]) * e) * (1 - sp) + sp;
      b = (g.sc[3 * i + 2] + (g.ec[3 * i + 2] - g.sc[3 * i + 2]) * e) * (1 - sp) + sp;
    }
    if (v <= 0) continue;
    if (s > 0 && s < 1) {
      // most grains melt into the water on the way: only some fly as flakes
      if (hash(i, slot, 91) > (g.turns > 1 ? 0.22 : 0.3)) v *= 1 - smoothstep(0, 0.07, s) * (1 - smoothstep(0.88, 1, s));
      else v = Math.max(v, 0.5) * (1 - 0.25 * Math.sin(Math.PI * s));
      if (v < 0.01) continue;
      if (TX > -50) { const mx = (x + TX) / 2, my = (y + TY) / 2; dep(buf, mx, my, r * v * 0.35, gg * v * 0.35, b * v * 0.35); v *= 0.75; }
    }
    dep(buf, x, y, r * v, gg * v, b * v);
  }
}

function drawBlizzard(buf, age, T, hour) {
  const n = hour ? NB : 36, sc = hour ? 1 : 0.3;
  for (let i = 0; i < n; i++) {
    const z = BZ[i], td = z.td * sc, dur = z.dur * (hour ? 1 : 0.5);
    const s = (age - td) / dur;
    if (s <= 0 || s >= 1) continue;
    const w = Math.sin(Math.PI * s), a = z.b * Math.min(1, 2.2 * w) * (hour ? 1 : 0.8);
    // a streak: the grain now, and fainter where it was 1/60 and 2/60 s ago
    for (let k = 0; k < 3; k++) {
      const sk = s - (k * 1.6) / (60 * dur);
      if (sk <= 0) break;
      orbit(sk, z.sx, z.sy, z.ex, z.ey, CX, CY + 2, z.rho * (hour ? 1 : 0.55), hour ? z.turns : 1, i + 999, T - k / 40);
      const ak = a * (k === 0 ? 1 : k === 1 ? 0.5 : 0.25);
      dep(buf, OX, OY, ak * 0.82, ak * 0.88, ak);
    }
  }
}

const S3 = new Float32Array(3);
function sample3(buf, x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  S3[0] = S3[1] = S3[2] = 0;
  for (let j = 0; j < 2; j++) {
    const yy = yi + j;
    if (yy < 0 || yy >= H) continue;
    const wy = j ? fy : 1 - fy;
    for (let i = 0; i < 2; i++) {
      const xx = xi + i;
      if (xx < 0 || xx >= W) continue;
      const w = wy * (i ? fx : 1 - fx);
      if (w === 0) continue;
      const p = 3 * (yy * W + xx);
      S3[0] += buf[p] * w; S3[1] += buf[p + 1] * w; S3[2] += buf[p + 2] * w;
    }
  }
}
function sample1(buf, x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  let s = 0;
  for (let j = 0; j < 2; j++) {
    const yy = yi + j;
    if (yy < 0 || yy >= H) continue;
    const wy = j ? fy : 1 - fy;
    for (let i = 0; i < 2; i++) {
      const xx = xi + i;
      if (xx < 0 || xx >= W) continue;
      s += buf[yy * W + xx] * wy * (i ? fx : 1 - fx);
    }
  }
  return s;
}
