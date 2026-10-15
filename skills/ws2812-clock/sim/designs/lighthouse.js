// Lighthouse: the HUB75 panel is a night sea seen from the top of the
// tower; the ESP32-S3-Matrix beside it is the lantern itself, seen from
// above: a lamp in a rotating Fresnel lens with two bullseye panels. Their
// beams leave the tile, cross the gap and sweep the sea like a radar,
// lighting the haze and the water. The time lies in the sea as sandbars
// (lighthouse-font.js): faint by moonlight, ringed by surf that breaks with
// every swell, gold and casting short shadows when the beam passes. The
// colon is a pair of channel buoys, red and green, blinking the seconds;
// the moon's broken reflection winks in the open water top right, and a
// seal lies at the tip of every bar (eye-shine when the beam finds it).
// Minute: the current churns the changed bar into a shapeless cloud of
// suspended sand under a whirl of foam, which settles as the new digit;
// its seal slips off, swims out round the cloud with a V of wake and hauls
// out on the new bar. Several bars turn one after another (minutes first).
// Hour: once the sand has settled the lamp flashes the hour count (1-12),
// each flash lighting the whole sea and sending a foghorn ripple out from
// the tower, while the beams burn at full power.
import * as kit from '../js/kit.js';
import { coverage, CELL } from './lighthouse-font.js';

const W = 64, N = W * W;
const LAMP_MM = [84.5, 51.5];                       // the s3m64 tile's centre
const LX = (LAMP_MM[0] + 63) / 2, LY = (LAMP_MM[1] + 63) / 2;   // in panel pixels (73.75, 57.25)
const ROT = 20, BEAMS = 2;                          // seconds a turn, bullseye panels
const SIG = 5 * Math.PI / 180;                      // beam half-width
const TURN0 = 0.25, TURN = 2.4;                     // minute turn: start, length (s)
// the current reaches the bars one after another, minutes first, so even
// at midnight (all four turn) some sand is always on the bed
const STAG = [1.05, 0.7, 0.35, 0];

// palette, linear light
const BEAM = kit.hex('#ffd59a');
const SAND_MOON = [0.235, 0.240, 0.275], SAND_LIT = [1.0, 0.70, 0.34];
const FOAM_MOON = [0.170, 0.205, 0.270], FOAM_LIT = [1.0, 0.92, 0.78];
const MOON = [0.022, 0.040, 0.080];
const RED = [1.0, 0.05, 0.02], GREEN = [0.06, 1.0, 0.22];

// where the four bars lie: [x, y, scale] of each 12 x 20 cell
const SLOTS = [[3, 3, 1.15], [18, 3, 1.15], [27, 36, 1.08], [42, 36, 1.08]];
const BUOYS = [[37.5, 17.5], [22, 40]];

// ---------------------------------------------------------------- statics
function periodicNoise(seed) {
  const T = new Float32Array(N);
  const vn = (x, y, p) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const h = (i, j) => kit.hash(((i % p) + p) % p, ((j % p) + p) % p, seed + p);
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    T[y * W + x] = 0.6 * vn(x / 8, y / 8, 8) + 0.4 * vn(x / 4, y / 4, 16);
  }
  return T;
}
/** Bilinear, wrapping sample of a 64 x 64 texture. */
function tex(T, x, y) {
  x -= Math.floor(x / W) * W; y -= Math.floor(y / W) * W;
  const xi = x | 0, yi = y | 0, xf = x - xi, yf = y - yi;
  const x1 = (xi + 1) & 63, y1 = (yi + 1) & 63;
  const a = T[yi * W + xi], b = T[yi * W + x1], c = T[y1 * W + xi], d = T[y1 * W + x1];
  return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
}

const TX = [periodicNoise(11), periodicNoise(23), periodicNoise(37)];
const R = new Float32Array(N), PHI = new Float32Array(N), UX = new Float32Array(N), UY = new Float32Array(N);
const LAND = new Float32Array(N), SHORE = new Float32Array(N), MOONG = new Float32Array(N), GLIT = new Float32Array(N);
for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
  const p = y * W + x, dx = x - LX, dy = y - LY, r = Math.hypot(dx, dy);
  R[p] = r; PHI[p] = Math.atan2(dy, dx); UX[p] = -dx / r; UY[p] = -dy / r;
  // the headland the tower stands on: a rocky strip down the right edge
  // swelling into a point at the bottom right
  const shore = 61.2 - 7.5 * Math.exp(-(((y - 60) / 9) ** 2)) - 1.6 * (tex(TX[2], 3, y * 0.9) - 0.5) * 2;
  LAND[p] = kit.clamp(x - shore + 0.5);
  MOONG[p] = 0.55 + 0.45 * kit.clamp(1 - Math.hypot(x, y) / 80);
  // the moon's broken reflection, in the open water above the minutes
  GLIT[p] = Math.exp(-(((x - 49) / 5.5) ** 2) - (((y - 15) / 12) ** 2));
}
for (let p = 0; p < N; p++) {           // surf zone: within ~2.5 px of the land
  const x = p % W, y = (p / W) | 0;
  let m = 0;
  for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) {
    const xx = x + i, yy = y + j;
    if (xx < 0 || yy < 0 || xx >= W || yy >= W) continue;
    const v = LAND[yy * W + xx] * (1 - Math.hypot(i, j) / 4.2);
    if (v > m) m = v;
  }
  SHORE[p] = m * (1 - LAND[p]);
}

const rough = (x, y) => 0.55 * (tex(TX[2], x * 1.7, y * 1.7) - 0.5);
const glyphCache = new Map();
function glyph(slot, d) {
  const k = slot * 10 + d;
  if (!glyphCache.has(k)) { const [ox, oy, s] = SLOTS[slot]; glyphCache.set(k, coverage(d, ox, oy, s, W, W, rough)); }
  return glyphCache.get(k);
}
/** Sand grains for the turn old -> new in a slot: matched by angle round the cell centre. */
const grainCache = new Map();
function grains(slot, d0, d1) {
  const key = `${slot}${d0}${d1}`;
  if (grainCache.has(key)) return grainCache.get(key);
  const [ox, oy, s] = SLOTS[slot], cx = ox + CELL.w * s / 2, cy = oy + CELL.h * s / 2;
  const pts = (g) => {
    const out = [];
    for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) {
      const c = g.c[j * g.w + i];
      if (c > 0.03) { const x = g.x0 + i, y = g.y0 + j; out.push([x, y, c, Math.atan2(y - cy, x - cx)]); }
    }
    return out.sort((a, b) => a[3] - b[3]);
  };
  const A = pts(glyph(slot, d0)), B = pts(glyph(slot, d1)), n = Math.max(A.length, B.length);
  const g = new Float32Array(n * 7);
  for (let k = 0; k < n; k++) {
    const a = A[Math.floor((k * A.length) / n)], b = B[Math.floor((k * B.length) / n)];
    g.set([a[0], a[1], a[2] * A.length / n, b[0], b[1], b[2] * B.length / n, kit.hash(k, slot, 7)], k * 7);
  }
  const res = { g, n, cx, cy };
  grainCache.set(key, res);
  return res;
}

for (let s = 0; s < 4; s++) for (let d = 0; d < 10; d++) glyph(s, d);   // build every bar once, at load
// every turn a slot can make, matched once at load (no hitch at the minute)
for (const [slot, pairs] of [[0, [[0, 1], [1, 2], [2, 0]]], [1, [...Array(9)].map((_, d) => [d, d + 1]).concat([[9, 0], [3, 0]])],
  [2, [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0]]], [3, [...Array(9)].map((_, d) => [d, d + 1]).concat([[9, 0]])]]) {
  for (const [a, b] of pairs) grains(slot, a, b);
}
const S = new Float32Array(N), T1 = new Float32Array(N), SB = new Float32Array(N);

function addGlyph(slot, d, k = 1) {
  const g = glyph(slot, d);
  for (let j = 0; j < g.h; j++) {
    const row = (g.y0 + j) * W + g.x0;
    for (let i = 0; i < g.w; i++) S[row + i] += g.c[j * g.w + i] * k;
  }
}
function splatGrain(A, x, y, w) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  if (xi < 0 || yi < 0 || xi >= W - 1 || yi >= W - 1) return;
  const p = yi * W + xi;
  A[p] += w * (1 - fx) * (1 - fy); A[p + 1] += w * fx * (1 - fy);
  A[p + W] += w * (1 - fx) * fy; A[p + W + 1] += w * fx * fy;
}
function blur(src, dst) {           // 5-tap binomial, separable, edges clamped
  for (let y = 0; y < W; y++) {
    const r = y * W;
    for (let x = 0; x < W; x++) {
      const a = r + (x > 1 ? x - 2 : 0), b = r + (x > 0 ? x - 1 : 0), c = r + (x < 63 ? x + 1 : 63), d = r + (x < 62 ? x + 2 : 63);
      T1[r + x] = (src[a] + 4 * src[b] + 6 * src[r + x] + 4 * src[c] + src[d]) * 0.0625;
    }
  }
  for (let y = 0; y < W; y++) {
    const a = (y > 1 ? y - 2 : 0) * W, b = (y > 0 ? y - 1 : 0) * W, c = (y < 63 ? y + 1 : 63) * W, d = (y < 62 ? y + 2 : 63) * W, r = y * W;
    for (let x = 0; x < W; x++) dst[r + x] = (T1[a + x] + 4 * T1[b + x] + 6 * T1[r + x] + 4 * T1[c + x] + T1[d + x]) * 0.0625;
  }
}
const wrapPi = (a) => a - Math.round(a / kit.TAU) * kit.TAU;
const pad = (n) => String(n).padStart(2, '0');
const digitsOf = (d) => (pad(d.getHours()) + pad(d.getMinutes())).split('').map(Number);
const HOUR0 = 3.2, HOUR1 = 12.5;     // hour show: first flash, end (s)
const HL = 3.2;                      // lamp height: a bar's shadow runs r / HL px
const churn = [];                    // per frame: [cx, cy, amount] of slots in turmoil

/** Hour show: lamp flash level and foghorn ripples, from seconds into the hour. */
function hourShow(hs, count) {
  let F = 0, ring = [];
  for (let k = 0; k < count; k++) {
    const tk = HOUR0 + 0.62 * k, a = hs - tk;
    F += a >= 0 ? Math.exp(-a / 0.17) : Math.exp(-((a / 0.035) ** 2));
    if (a > 0 && a < 3) ring.push(46 * a, Math.exp(-a / 1.1));
  }
  return { F: Math.min(1.2, F), ring };
}

/** The moon's reflection: single glints winking on and off, each pixel its own facet of swell. */
const GPH = new Float32Array(N).map((_, p) => kit.hash(p, 5) * kit.TAU), GRT = new Float32Array(N).map((_, p) => 1.5 + 2.5 * kit.hash(p, 9));
function glitter(p, now) {
  const s = Math.sin((now * GRT[p]) % kit.TAU + GPH[p]);
  if (s < 0.8) return 0.4;
  const k = (s - 0.8) * 5;
  return 0.4 + 7 * k * k;
}

function drawPanel(ctx, now, th, boost, dim, F, ring) {
  const o = ctx.out;
  const ph1 = (now * 1.3) % kit.TAU;
  const nr = ring.length;
  for (let p = 0; p < N; p++) {
    const x = p & 63, y = p >> 6, r = R[p], land = LAND[p];
    // the beams
    let B = 0;
    for (let k = 0; k < BEAMS; k++) {
      const d = wrapPi(PHI[p] - th - (k * kit.TAU) / BEAMS);
      if (d > -0.45 && d < 0.45) B += Math.exp(-((d / SIG) ** 2)) + 0.07 * Math.exp(-((d / (2.6 * SIG)) ** 2));
    }
    B *= boost;
    const hz = tex(TX[0], x * 0.5 - now * 1.6, y * 0.5 + now * 0.35);
    let haze = B * (0.03 + 0.26 * hz * hz) / (1 + r / 40);
    let surf = B * kit.smoothstep(3, 20, r) / (1 + (r / 120) ** 2) + F * 0.55 / (1 + r / 45);
    haze += F * 0.04;
    // foghorn ripples
    let rip = 0;
    for (let k = 0; k < nr; k += 2) { const q = (r - ring[k]) / 1.8; if (q > -3 && q < 3) rip += Math.exp(-q * q) * ring[k + 1]; }

    const s = S[p], hp = SB[p];
    let mk = 0;
    // shadows: march toward the lamp; a bar higher than the ray hides this
    // spot, and the beam's haze behind it, so every bar throws a long
    // radial shadow across the lit sea
    if (B > 0.03) {
      let sh = 0;
      const ux = UX[p], uy = UY[p], kd = HL / r;
      for (let d = 1; d <= 22; d++) {
        const qx = (x + ux * d + 0.5) | 0, qy = (y + uy * d + 0.5) | 0;
        if (qx >= W || qy >= W) break;
        const v = (SB[qy * W + qx] - hp - d * kd) * 3;
        if (v > sh) { sh = v; if (sh >= 1) { sh = 1; break; } }
      }
      surf *= 1 - sh;
      haze *= 1 - 0.85 * sh;
    }
    // water: moonlit swell and glitter, and what the beam finds on it
    const ph = 0.8 * x + 0.3 * y + 5.0 * tex(TX[1], x * 0.35, y * 0.35) - ph1;
    const sw = Math.sin(ph), sw2 = sw > 0 ? sw * sw : 0, glint = sw2 * sw2 * sw2 * tex(TX[2], x * 0.7 - now * 0.3, y * 0.7);
    let sp = tex(TX[0], x * 1.3 + now * 0.7, y * 1.3) * tex(TX[1], x * 1.1 - now * 0.5, y * 1.2 + now * 0.3) - 0.43;
    sp = sp > 0 ? sp * 7 : 0;
    const mg = MOONG[p];
    const gm = GLIT[p], wm = mg * (0.12 * glint + 0.6 * sp) + (gm > 0.02 ? gm * glitter(p, now) : 0) + rip * 3.2, wl = surf * (0.025 + 0.12 * glint + 0.5 * sp);
    // the sandbar: lit by the moon, gold where the beam strikes its weather side
    let gx = 0, gy = 0;
    if (s > 0.01 || hp > 0.01) {
      gx = SB[p + (x < 63 ? 1 : 0)] - SB[p - (x > 0 ? 1 : 0)];
      gy = SB[p + (y < 63 ? W : 0)] - SB[p - (y > 0 ? W : 0)];
    }
    const facing = -(gx * UX[p] + gy * UY[p]);
    const shade = kit.clamp(0.6 + 3 * facing, 0.2, 1.7);
    // surf: a ring round each bar and along the shore, bursting as each swell crest passes
    const ring2 = kit.smoothstep(0.03, 0.12, hp) * (1 - kit.smoothstep(0.22, 0.4, hp)) * (1 - s) * (1 - s);
    const crest = Math.exp(-4 * kit.fract(ph / kit.TAU + 0.25));
    let fo = (ring2 * 0.8 + SHORE[p] * 1.8) * (0.12 + 0.88 * crest) * (0.5 + 0.7 * tex(TX[2], x * 0.9 + now * 0.4, y * 0.9 - now * 0.2));
    for (let c = 0; c < churn.length; c += 3) {
      const dx = (x - churn[c]) / 7, dy = (y - churn[c + 1]) / 10, q = dx * dx + dy * dy;
      if (q < 4) {        // a whirl of foam strands over the churning bar
        const arm = 0.5 + 0.5 * Math.sin(3 * Math.atan2(dy, dx) - Math.sqrt(q) * 5 + now * 6);
        fo += churn[c + 2] * Math.exp(-q) * arm * arm * arm * 0.7;
        // the lifted sand: a shapeless cloud in the water
        mk += churn[c + 2] * Math.exp(-q * 1.3) * (0.25 + 0.5 * tex(TX[0], x * 0.9 + now * 2, y * 0.9 - now));
      }
    }
    fo += rip * 0.5;
    const ws = 1 - s, ln = 1 - land;
    const rock = (0.012 + 0.045 * kit.smoothstep(0.35, 0.8, tex(TX[1], x * 1.6, y * 1.6))) * mg;
    for (let c = 0; c < 3; c++) {
      const water = MOON[c] * wm + BEAM[c] * wl + (SAND_MOON[c] * mg * 0.8 + SAND_LIT[c] * surf * 0.6) * mk;
      const sand = SAND_MOON[c] * mg + SAND_LIT[c] * surf * shade * 1.2;
      const foam = (FOAM_MOON[c] * mg + FOAM_LIT[c] * surf * 0.85) * fo;
      o[3 * p + c] = dim * (ln * (water * ws + sand * s + foam) + land * (rock + BEAM[c] * surf * 0.05) + BEAM[c] * haze);
    }
  }
}

/** A soft round light on the panel at (x, y) px. */
function glow(o, x, y, rad, c, a) {
  const x0 = Math.max(0, Math.floor(x - rad)), x1 = Math.min(63, Math.ceil(x + rad));
  const y0 = Math.max(0, Math.floor(y - rad)), y1 = Math.min(63, Math.ceil(y + rad));
  for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) {
    const d2 = ((xx - x) ** 2 + (yy - y) ** 2) / (rad * rad);
    if (d2 >= 1) continue;
    const f = (1 - d2) * (1 - d2) * a, p = 3 * (yy * W + xx);
    o[p] += c[0] * f; o[p + 1] += c[1] * f; o[p + 2] += c[2] * f;
  }
}

// the lantern on the 8x8, seen from above
const TILE_K = 0.95;                 // heat: the tile's whole budget is about 1 W of light
const WARM = kit.blackbody(3300), CORE = kit.blackbody(4200);
function drawLantern(ctx, now, th, boost, dim, F) {
  const o = ctx.out;
  for (let i = W * W; i < ctx.n; i++) {
    const l = ctx.leds[i], dx = l.x - LAMP_MM[0], dy = l.y - LAMP_MM[1];
    const r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
    let v = 0.015 * kit.smoothstep(12, 6, r);                // glass glow inside the gallery
    const core = 1.0 * Math.exp(-((r / 2.3) ** 2));        // the lamp
    let pr = 0, pg = 0, pb = 0;
    for (let k = 0; k < BEAMS; k++) {
      const d = wrapPi(a - th - (k * kit.TAU) / BEAMS);
      v += boost * 0.9 * Math.exp(-((d / 0.3) ** 2)) * kit.smoothstep(1.5, 9, r);
    }
    // prism rings: sixteen ribs turning with the lens catch the lamp
    const rib = 0.5 + 0.5 * Math.cos(16 * (a - th)), ring = Math.exp(-(((r - 5.5) / 1.6) ** 2));
    const gl = rib ** 14 * ring * 0.5, hue = kit.fract((a - th) / kit.TAU * 2 + 0.1);
    const pc = kit.hsv(hue, 0.55, 1);
    pr = pc[0] * gl; pg = pc[1] * gl; pb = pc[2] * gl;
    v += F * 0.85 * kit.smoothstep(12, 4, r);
    const k = TILE_K * dim;
    o[3 * i] = k * (WARM[0] * v + CORE[0] * core + pr); o[3 * i + 1] = k * (WARM[1] * v + CORE[1] * core + pg); o[3 * i + 2] = k * (WARM[2] * v + CORE[2] * core + pb);
  }
}

// ------------------------------------------------------------------ seals
// One grey seal hauled out on every bar, lying along its stroke: a dark
// silhouette on the pale sand by moonlight, wet fur and eye-shine in the
// beam. Now and then one lifts its head. When its bar is churned away it
// slips into the water and swims round the whirl to haul out on the new one.
// spot per digit: [x, y in the 12 x 20 cell, heading in degrees]
const SPOT = [[6.0, 18.2, 0], [6.8, 17.4, 90], [9.6, 18.4, 0], [2.8, 17.4, 145], [10.0, 13.1, 0],
  [2.8, 17.6, 155], [8.6, 1.8, -25], [5.1, 17.4, 95], [6.0, 19.2, 0], [4.2, 18.9, 180]];
function spot(slot, d) {
  const [ox, oy, s] = SLOTS[slot], [x, y, a] = SPOT[d], h = a * Math.PI / 180;
  return [ox + x * s, oy + y * s, Math.cos(h), Math.sin(h)];
}
function beamAt(x, y, th, boost) {
  const ph = Math.atan2(y - LY, x - LX);
  let B = 0;
  for (let k = 0; k < BEAMS; k++) { const d = wrapPi(ph - th - (k * kit.TAU) / BEAMS); B += Math.exp(-((d / SIG) ** 2)); }
  return B * boost;
}
const SEAL = [0.034, 0.036, 0.044], FUR = [0.60, 0.48, 0.36], EYE = [1.0, 0.85, 0.45];
/** Paint a capsule (a..b, radius rad) over the panel: dark body, fur lit by `lit`. */
function capsule(o, ax, ay, bx, by, rad, cov, lit) {
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - rad - 1)), x1 = Math.min(63, Math.ceil(Math.max(ax, bx) + rad + 1));
  const y0 = Math.max(0, Math.floor(Math.min(ay, by) - rad - 1)), y1 = Math.min(63, Math.ceil(Math.max(ay, by) + rad + 1));
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-6;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    let t = ((x - ax) * dx + (y - ay) * dy) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const d = Math.hypot(x - ax - t * dx, y - ay - t * dy);
    const a = kit.clamp(rad - d + 0.5) * cov;
    if (a <= 0) continue;
    const p = 3 * (y * W + x), sheen = lit * (0.35 + 0.65 * kit.clamp(1 - d / rad));
    for (let c = 0; c < 3; c++) o[p + c] += (SEAL[c] + FUR[c] * sheen - o[p + c]) * a;
  }
}
function drawSeal(ctx, now, th, boost, dim, slot, x, y, hx, hy, out, lit0) {
  const o = ctx.out, B = beamAt(x, y, th, boost);
  const lit = (B * 0.5 + lit0) * dim;
  const lift = Math.max(0, Math.sin(now * 0.7 + slot * 2.3)) ** 6;      // head up now and then
  const k = 1 - out;                                                    // 0 = in the water
  // body: tail at the back, a rounder chest, then the head
  if (k > 0.02) {
    capsule(o, x - hx * 2.8, y - hy * 2.8, x + hx * 0.8, y + hy * 0.8, 1.3, k, lit);
    const hl = 2.5 + 1.0 * lift;
    capsule(o, x + hx * 1.2, y + hy * 1.2, x + hx * hl, y + hy * hl, 0.95, k, lit * 1.2);
  }
  // swimming: only the head shows, with a V of wake behind it
  if (out > 0.02) {
    capsule(o, x, y, x, y, 0.9, out, lit);
    for (const sgn of [-1, 1]) {
      const wx = -hx - sgn * hy * 0.7, wy = -hy + sgn * hx * 0.7;
      for (let j = 1; j <= 4; j++) glow(o, x + wx * j * 1.1, y + wy * j * 1.1, 1.0, FOAM_MOON, out * dim * (0.9 - j * 0.18) * (1 + 4 * lit));
    }
  }
  // eye-shine: the beam finds the seal's eyes
  const ex = x + hx * (2.8 + 1.0 * lift * k), ey = y + hy * (2.8 + 1.0 * lift * k);
  glow(o, ex, ey, 0.9, EYE, dim * 0.9 * kit.smoothstep(0.25, 0.9, B + lit0));
}

export default {
  name: 'Lighthouse',
  blurb: 'the 8x8 is the lantern; its beams sweep a night sea where the time lies as sandbars',
  layouts: ['hub-s3m'], look: 'smoke', fps: 60, brightness: 0.4, dither: true,
  frame(ctx) {
    const now = ctx.date.getTime() / 1000, M = Math.floor(now / 60) * 60, age = now - M;
    const cur = digitsOf(ctx.date), prev = digitsOf(new Date((M - 60) * 1000));
    const dim = 1 - 0.6 * ctx.night;
    const th = ((now % ROT) / ROT) * kit.TAU;

    // the hour: count flashes, ripples, full-power beams
    let F = 0, ring = [], boost = 1;
    if (ctx.date.getMinutes() === 0 && age < HOUR1) {
      const h = ctx.date.getHours() % 12 || 12;
      ({ F, ring } = hourShow(age, h));
      boost = 1 + 0.8 * Math.sin(Math.PI * Math.min(1, age / HOUR1)) ** 2;
    }

    // the sand
    S.fill(0); churn.length = 0;
    const uOf = (s) => (age - TURN0 - STAG[s]) / TURN;
    for (let s = 0; s < 4; s++) {
      const u = uOf(s);
      if (prev[s] === cur[s] || u >= 1) { addGlyph(s, cur[s]); continue; }
      if (u <= 0) { addGlyph(s, prev[s]); continue; }
      const e = kit.ease.inOut(u), b = Math.sin(Math.PI * u) ** 2;
      const { g, n, cx, cy } = grains(s, prev[s], cur[s]);
      const sw = 1.7 * b, ex = 1 + 0.3 * b;
      for (let k = 0; k < n; k++) {
        const q = k * 7;
        const px = g[q] + (g[q + 3] - g[q]) * e - cx, py = g[q + 1] + (g[q + 4] - g[q + 1]) * e - cy;
        const rr = Math.hypot(px, py), ang = sw * (1.5 - rr / 10);
        const ca = Math.cos(ang), sa = Math.sin(ang), h = g[q + 6];
        const x = cx + (px * ca - py * sa) * ex + 2.2 * b + (h - 0.5) * 7 * b;
        const y = cy + (px * sa + py * ca) * ex + 0.6 * b + (kit.fract(h * 7.3) - 0.5) * 7 * b;
        // a grain lifted off the bed is murk in the water, not bar: the bar thins as the cloud grows
        const w = g[q + 2] + (g[q + 5] - g[q + 2]) * e;
        splatGrain(S, x, y, w * (1 - b) * (1 - b));
      }
      churn.push(cx, cy, b);
    }
    for (let p = 0; p < N; p++) if (S[p] > 1) S[p] = 1;
    blur(S, SB);

    drawPanel(ctx, now, th, boost, dim, F, ring);

    // the colon: two channel buoys, red and green, blinking the seconds
    const sec = age % 1;
    for (let k = 0; k < 2; k++) {
      const [bx0, by0] = BUOYS[k];
      const bx = bx0 + 0.35 * Math.sin(now * 1.7 + k * 2), by = by0 + 0.3 * Math.cos(now * 1.3 + k);
      const env = Math.exp(-5 * kit.fract(sec + k * 0.5));
      const c = k ? GREEN : RED;
      glow(ctx.out, bx, by, 1.6, c, dim * (0.12 + 0.8 * env));
      glow(ctx.out, bx, by, 4.5, c, dim * 0.05 * (0.3 + env));
    }

    // the seals
    for (let s = 0; s < 4; s++) {
      const fl = F * 0.5, u = uOf(s);
      if (prev[s] === cur[s] || u >= 1 || u <= 0) {
        const [x, y, hx, hy] = spot(s, u <= 0 ? prev[s] : cur[s]);
        drawSeal(ctx, now, th, boost, dim, s, x, y, hx, hy, 0, fl);
        continue;
      }
      // slip off, swim round the whirl, haul out
      const A = spot(s, prev[s]), Bp = spot(s, cur[s]);
      const v = kit.smoothstep(0.08, 0.92, u), e = kit.ease.inOut(v);
      let x = A[0] + (Bp[0] - A[0]) * e, y = A[1] + (Bp[1] - A[1]) * e;
      const rx = -1, ry = -0.25, rl = Math.hypot(rx, ry), bul = 6 * Math.sin(Math.PI * v);   // out to the open sea
      x += (rx / rl) * bul; y += (ry / rl) * bul;
      // heading: along the path while swimming, blending from the old pose to the new one
      const dx = Bp[0] - A[0] + (rx / rl) * 7 * Math.PI * Math.cos(Math.PI * v), dy = Bp[1] - A[1] + (ry / rl) * 7 * Math.PI * Math.cos(Math.PI * v);
      const dl = Math.hypot(dx, dy) || 1;
      const sw = kit.smoothstep(0, 0.12, u) * (1 - kit.smoothstep(0.88, 1, u));
      let hx = kit.lerp(v < 0.5 ? A[2] : Bp[2], dx / dl, sw), hy = kit.lerp(v < 0.5 ? A[3] : Bp[3], dy / dl, sw);
      const hn = Math.hypot(hx, hy) || 1;
      drawSeal(ctx, now, th, boost, dim, s, x, y, hx / hn, hy / hn, sw, fl);
    }

    drawLantern(ctx, now, th, boost, dim, F);
  },
};
