// Beanstalk: a magic vine climbs a 64 x 192 tower from a clay pot to the
// clouds, and the time is four tendrils it puts out, each curling into a
// numeral (thick at the stalk, thin and spiralled at the tips, leaves along
// it). The stalk sways as one springy body and the tendrils ride it.
// Minute turn: the old tendril browns and pulls back into the stalk, its
// leaves fall down the tower; a new shoot grows out and curls into the new
// digit, leaves unfurling behind the tip.
import * as kit from '../js/kit.js';
import { W, H, img, stamp, flush, leaf, glow, disc } from './beanstalk-draw.js';
import { GLYPHS } from './beanstalk-glyphs.js';
import { frog, butterfly, flower, PINK, PEACH } from './beanstalk-frog.js';

const EPOCH = 1.7e9;
const SLOTS = [
  { x0: 2, y0: 13, side: 0 },   // H1, stalk on its right
  { x0: 36, y0: 43, side: 1 },  // H2
  { x0: 2, y0: 91, side: 0 },   // M1
  { x0: 36, y0: 121, side: 1 }, // M2
];
const POT_Y = 176, TOP_Y = 4;
const WITHER = 1.0, GROW0 = 0.9, GROW = 1.8;

const C = {
  stalkD: kit.hex('#05200a'), stalkL: kit.hex('#4a9424'),
  hourD: kit.hex('#1a8a4a'), hourL: kit.hex('#c8ffd0'),
  minD: kit.hex('#5a9a12'), minL: kit.hex('#f4ffb0'),
  leafD: kit.hex('#0d4a14'), leafL: kit.hex('#5fb030'),
  brown: kit.hex('#9a5a1c'), bud: kit.hex('#fff7b0'),
  autumnD: kit.hex('#6a2a08'), autumnL: kit.hex('#e09a30'),
  potD: kit.hex('#2a0c04'), potL: kit.hex('#c0582a'),
};

// ------------------------------------------------------------------ sky
const SKY = [
  [0, [0.002, 0.002, 0.010], [0.004, 0.004, 0.018]],
  [4.6, [0.002, 0.002, 0.010], [0.004, 0.004, 0.018]],
  [6.0, [0.010, 0.010, 0.050], [0.160, 0.050, 0.025]],
  [7.5, [0.012, 0.035, 0.120], [0.070, 0.090, 0.120]],
  [12, [0.010, 0.045, 0.160], [0.055, 0.100, 0.160]],
  [16.5, [0.012, 0.035, 0.120], [0.070, 0.090, 0.120]],
  [18.6, [0.020, 0.010, 0.060], [0.180, 0.050, 0.020]],
  [20.2, [0.002, 0.002, 0.010], [0.004, 0.004, 0.018]],
  [24, [0.002, 0.002, 0.010], [0.004, 0.004, 0.018]],
];
function skyAt(h) {
  let k = 0;
  while (SKY[k + 1][0] < h) k++;
  const a = SKY[k], b = SKY[k + 1], t = kit.smoothstep(a[0], b[0], h);
  return [kit.mix(a[1], b[1], t), kit.mix(a[2], b[2], t)];
}
const STARS = Array.from({ length: 46 }, (_, i) => ({
  x: Math.floor(kit.hash(i, 1) * W), y: Math.floor(kit.hash(i, 2) * 165), b: 0.3 + 0.7 * kit.hash(i, 3), ph: kit.hash(i, 4) * 6.28,
}));

// ---------------------------------------------------------------- stalk
let SW = 0, T = 0, SAP_Y = -99; // sway phase inputs for this frame
function sway(y) {
  const h = Math.max(0, (POT_Y - y) / (POT_Y - TOP_Y));
  return Math.pow(h, 1.4) * SW;
}
const stalkX = (y) => 32 + 1.6 * Math.sin(y * 0.075 + 0.6) + sway(y);
const stalkR = (y) => 1.5 + 1.4 * (y - TOP_Y) / (POT_Y - TOP_Y);

function drawStalk() {
  for (let y = POT_Y + 2; y >= TOP_Y; y -= 0.6) stamp(stalkX(y), y, stalkR(y), Math.exp(-(((y - SAP_Y) / 7) ** 2)));
  flush(C.stalkD, C.stalkL, C.bud, 1);
  // a thin twining vine round the stalk: only its front turns show over it
  for (let y = POT_Y; y >= TOP_Y + 6; y -= 0.5) {
    const ph = y * 0.32 + 1.0;
    if (Math.cos(ph) < 0) continue;
    stamp(stalkX(y) + (stalkR(y) + 0.3) * Math.sin(ph), y, 0.55, 0);
  }
  flush(C.leafD, kit.hex('#6aa830'), C.bud);
}

// -------------------------------------------------------------- tendrils
const tmpX = new Float32Array(64), tmpY = new Float32Array(64), tmpD = new Float32Array(64);
/** Draw one digit tendril. F = growth front (distance from the stalk), mode 0 steady, 1 growing, 2 withering. */
function drawTendril(slot, dg, F, mode, wither, hour) {
  const S = SLOTS[slot], G = GLYPHS[S.side][dg], sd = S.side === 0 ? 1 : -1;
  const ox = S.x0 + sway(S.y0 + G.jy) + 0.45 * Math.sin(T * 1.3 + slot * 1.9), oy = S.y0 + 0.35 * Math.sin(T * 1.05 + slot * 2.7);
  const jx = ox + G.jx, jy = oy + G.jy, ry = jy + (G.tin[1] < -0.5 ? 12 : 4), rx = stalkX(ry);
  // the branch from the stalk: a cubic that flows into the tendril
  const dist = Math.hypot(jx - rx, jy - ry), k = 0.45 * dist;
  const c1x = rx - sd * 0.85 * k, c1y = ry - 0.5 * k, c2x = jx - G.tin[0] * k, c2y = jy - G.tin[1] * k;
  const n = Math.min(63, Math.max(4, Math.ceil(dist / 0.5)));
  let L = 0;
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    tmpX[i] = u * u * u * rx + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * jx;
    tmpY[i] = u * u * u * ry + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * jy;
    if (i) L += Math.hypot(tmpX[i] - tmpX[i - 1], tmpY[i] - tmpY[i - 1]);
    tmpD[i] = L;
  }
  const Fx = mode === 2 ? F * (L + G.dmax) : F;
  const tip = (D) => (mode === 1 ? kit.clamp(0.3 + (Fx - D) / 5) : 1);
  const att = (D) => (mode === 1 ? kit.clamp(1 - (Fx - D) / 4) : mode === 2 ? wither : 0);
  for (let i = 0; i <= n; i++) {
    const D = tmpD[i];
    if (D > Fx) break;
    stamp(tmpX[i], tmpY[i], (2.0 - 0.3 * i / n) * tip(D), att(D));
  }
  flush(C.stalkD, C.stalkL, mode === 2 ? C.brown : C.bud, mode === 1 ? 1 : 0);
  for (let i = 0; i < G.N; i++) {
    const D = L + G.ds[i];
    if (D > Fx) continue;
    // a withering tendril wilts: the far end sags as it browns and pulls back
    const sag = mode === 2 ? 8 * (1 - F) * Math.pow(D / (L + G.dmax), 1.4) : 0;
    stamp(ox + G.xs[i] + sag * 0.25 * sd, oy + G.ys[i] + sag, G.rs[i] * tip(D) * (mode === 2 ? 1 - 0.3 * (1 - F) : 1), att(D));
  }
  const D0 = hour ? C.hourD : C.minD, L0 = hour ? C.hourL : C.minL;
  if (mode === 2) flush(D0, L0, C.brown, 0);
  else flush(D0, L0, C.bud, mode === 1 ? 1 : 0);
  // leaves along the tendril
  for (const lf of G.leaves) {
    const D = L + lf.d;
    let s = 1;
    if (mode === 1) s = kit.ease.outBack(kit.clamp((Fx - D - 1) / 6));
    if (mode === 2) continue; // withering leaves have already fallen
    if (s <= 0) continue;
    const fl = 0.22 * Math.sin(T * 2.3 + lf.ph) * (0.6 + 0.4 * Math.sin(T * 0.7 + slot));
    leaf(ox + lf.x, oy + lf.y, lf.ang + fl, 6.5 * s, 2.3 * s, C.leafD, C.leafL);
  }
  return { ox, oy, L };
}

/** Leaves of a withering tendril let go as the retreat passes them, and flutter down the tower. */
function fallingLeaves(slot, dg, age) {
  const S = SLOTS[slot], G = GLYPHS[S.side][dg];
  const ox = S.x0 + sway(S.y0 + G.jy), oy = S.y0, Lc = 10, Dm = Lc + G.dmax;
  for (const lf of G.leaves) {
    // retreat front F = Dm (1 - smoothstep(age / WITHER)) reaches the leaf at t0
    const yv = kit.clamp(1 - (Lc + lf.d) / Dm);
    const t0 = WITHER * (0.5 - Math.sin(Math.asin(1 - 2 * yv) / 3));
    const tau = age - t0;
    if (tau < 0) continue;
    const fall = 13 * (tau - 0.9 * (1 - Math.exp(-tau / 0.9)));
    const y = oy + lf.y + fall;
    if (y > POT_Y + 4) continue;
    const sw = 4.5 * Math.sin(1.7 * tau + lf.ph) * kit.clamp(tau);
    const x = ox + lf.x + sw + 3 * Math.sin(lf.ph * 3) * kit.clamp(tau / 3);
    const a = 1 - kit.smoothstep(6, 8, tau);
    const brown = kit.clamp(tau / 0.8);
    leaf(x, y, lf.ang + 1.4 * Math.sin(2.1 * tau + lf.ph), 6.5, 2.3, kit.mix(C.leafD, C.autumnD, brown), kit.mix(C.leafL, C.autumnL, brown), a);
  }
}

// ------------------------------------------------------------ the scene
function drawSky(hr, night) {
  const [top, bot] = skyAt(hr);
  for (let y = 0; y < H; y++) {
    const t = Math.pow(y / (H - 1), 1.3), r = top[0] + (bot[0] - top[0]) * t, g = top[1] + (bot[1] - top[1]) * t, b = top[2] + (bot[2] - top[2]) * t;
    for (let x = 0, q = 3 * y * W; x < W; x++, q += 3) { img[q] = r; img[q + 1] = g; img[q + 2] = b; }
  }
  const starA = kit.smoothstep(19.2, 20.5, hr) + 1 - kit.smoothstep(4.8, 6, hr);
  if (starA > 0) for (const s of STARS) {
    const tw = 0.55 + 0.45 * Math.sin(T * (1.3 + s.b) + s.ph);
    const q = 3 * (s.y * W + s.x), v = 0.07 * s.b * tw * Math.min(1, starA);
    img[q] += v; img[q + 1] += v; img[q + 2] += v * 1.2;
  }
  // the sun climbs the tower by day, the moon by night
  const sp = (hr - 6) / 12.6;
  if (sp > -0.03 && sp < 1.03) {
    const alt = Math.sin(Math.PI * kit.clamp(sp)), x = 8 + 48 * sp, y = 186 - alt * 172;
    const warm = kit.blackbody(1900 + 3400 * alt);
    glow(x, y, 20, kit.scale(warm, 0.07), 1);
    disc(x, y, 3.2, kit.scale(warm, 0.32));
  }
  let mp = (hr < 12 ? hr + 24 : hr) - 19;
  mp /= 10.5;
  if (mp > -0.03 && mp < 1.03) {
    const alt = Math.sin(Math.PI * kit.clamp(mp)), x = 56 - 48 * mp, y = 186 - alt * 168;
    glow(x, y, 12, [0.02, 0.025, 0.04], 1);
    disc(x, y, 3.4, [0.30, 0.30, 0.26]);
    disc(x + 1.8, y - 1.0, 2.9, kit.mix(skyAt(hr)[0], skyAt(hr)[1], y / H)); // crescent
  }
}

function drawPot() {
  for (let y = POT_Y; y < H; y++) {
    const rim = y < POT_Y + 4;
    const half = rim ? 15.2 : 13.2 - 4 * (y - POT_Y - 4) / (H - POT_Y - 4);
    for (let x = 0; x < W; x++) {
      const u = (x - 32) / half;
      const c = kit.clamp((1 - Math.abs(u)) * half + 0.5);
      if (c <= 0) continue;
      const k = kit.clamp(0.75 - 0.6 * u - (rim ? 0 : 0.15) - (y === POT_Y + 4 ? 0.4 : 0));
      const q = 3 * (y * W + x);
      for (let ch = 0; ch < 3; ch++) img[q + ch] += (C.potD[ch] + (C.potL[ch] - C.potD[ch]) * k * k - img[q + ch]) * c;
    }
  }
}

const CLOUD = [[6, 10, 4.2], [16, 7.5, 5.8], [29, 6.5, 7], [42, 7.5, 6.2], [54, 9.5, 4.6], [22, 12, 4.8], [36, 12.5, 5.2], [48, 13, 3.8], [11, 13, 3.6]];
function drawCloud(hr) {
  const day = kit.smoothstep(5.5, 7.5, hr) * (1 - kit.smoothstep(18, 19.8, hr));
  const dawn = Math.min(1, Math.exp(-(((hr - 6.3) / 0.9) ** 2)) + Math.exp(-(((hr - 18.6) / 0.9) ** 2)));
  const body = kit.mix([0.010, 0.012, 0.024], [0.10, 0.11, 0.16], day);
  const rim = kit.mix(kit.mix([0.05, 0.05, 0.06], [0.42, 0.42, 0.44], day), [0.50, 0.20, 0.12], dawn);
  const dx = 2.2 * Math.sin(T * 0.07);
  for (let y = 0; y < 20; y++) for (let x = 0; x < W; x++) {
    let m = -9, top = 0;
    for (const [cx, cy, r] of CLOUD) {
      const ex = x - cx - dx - 0.6 * Math.sin(T * 0.3 + cy), ey = (y - cy) * 1.3;
      const d = r - Math.hypot(ex, ey);
      if (d > m) { m = d; top = -ey / r; }
    }
    const c = kit.clamp(m + 0.5);
    if (c <= 0) continue;
    // puffs lit from above: a bright crown on each, shadowed underneath
    const lit = kit.clamp(0.45 + 0.7 * top) * kit.clamp(1.4 - 0.18 * m);
    const q = 3 * (y * W + x);
    for (let ch = 0; ch < 3; ch++) img[q + ch] += (body[ch] + (rim[ch] - body[ch]) * lit * lit - img[q + ch]) * c;
  }
}

// dew: drops gather on the stalk, slide down it, drop off and catch the light
function drawDew() {
  for (let i = 0; i < 4; i++) {
    const P = 7 + 1.7 * i, n = Math.floor((T + i * 3.1) / P), t = (T + i * 3.1) - n * P;
    const y0 = 30 + 120 * kit.hash(n, i, 7), sd = kit.hash(n, i, 9) > 0.5 ? 1 : -1;
    let y = y0, x, a = 1;
    if (t < 1) { a = t; x = stalkX(y) + sd * stalkR(y); }
    else if (t < 3.5) { y = y0 + 1.8 * (t - 1) ** 2; x = stalkX(y) + sd * stalkR(y); }
    else { const f = t - 3.5; y = y0 + 11.25 + 6 * f + 40 * f * f; x = stalkX(y0 + 11.25) + sd * (stalkR(y0) + 1.5 * f); a = 1 - kit.clamp(f / 0.7); }
    if (y > POT_Y) continue;
    const tw = 0.6 + 0.4 * Math.sin(T * 9 + i * 2);
    glow(x, y, 1.7, [0.30, 0.42, 0.45], a * tw);
  }
}

// ------------------------------------------------------------- the frog
// Six resting places up the tower; the frog climbs one every ten minutes
// (so its height is the hour's progress), sits on the cloud from :50, and at
// the hour floats back down to the pot under a flower.
const STATIONS = [[19, 168], [15, 149], [49, 108], [15, 79], [49, 32], [36, 11]];
const FROG_S = 1.3;
const SEAT = [null, -1, 1, -1, 1, null]; // big leaves under stations 1..4 (side of the stalk)
const CLIMB0 = 3, CLIMB = 4.5, CHUTE0 = 2.4, CHUTE = 10;

function frogState(m, age) {
  const k = Math.floor(m / 10);
  if (m === 0 && age < CHUTE0) return { pose: 0, x: STATIONS[5][0], y: STATIONS[5][1], st: 5 };
  if (m === 0 && age < CHUTE0 + CHUTE) {
    const p = (age - CHUTE0) / CHUTE, tau = age - CHUTE0;
    const env = Math.sqrt(Math.sin(Math.PI * p));
    const y = kit.lerp(STATIONS[5][1] + 1, STATIONS[0][1], kit.smoothstep(0, 1, p) * 0.35 + 0.65 * p);
    const x = kit.lerp(STATIONS[5][0], STATIONS[0][0], kit.smoothstep(0.1, 1, p)) + 10 * Math.sin(1.25 * tau) * env;
    return { pose: 2, x, y, rot: -0.32 * Math.cos(1.25 * tau) * env, canopy: kit.smoothstep(0, 0.1, p) * (1 - kit.smoothstep(0.92, 1, p)), st: -1 };
  }
  if (m % 10 === 0 && m > 0 && age >= CLIMB0 && age < CLIMB0 + CLIMB) {
    // off the leaf, up the stalk, onto the next leaf: one path, eased
    const A = STATIONS[k - 1], B = STATIONS[k], ya = A[1] + 1, yb = B[1] + 1;
    const pa = [stalkX(ya), ya], pb = [stalkX(yb), yb];
    const l1 = Math.hypot(pa[0] - A[0], pa[1] - A[1]), l2 = ya - yb, l3 = Math.hypot(B[0] - pb[0], B[1] - pb[1]);
    const u = kit.ease.inOut((age - CLIMB0) / CLIMB) * (l1 + l2 + l3);
    let x, y;
    if (u < l1) { const t = u / l1; x = kit.lerp(A[0], pa[0], t); y = kit.lerp(A[1], pa[1], t) - 2.5 * Math.sin(Math.PI * t); }
    else if (u < l1 + l2) { y = ya - (u - l1); x = stalkX(y); }
    else { const t = (u - l1 - l2) / l3; x = kit.lerp(pb[0], B[0], t); y = kit.lerp(pb[1], B[1], t) - 2.5 * Math.sin(Math.PI * t); }
    return { pose: 1, x, y, ph: u * 0.55, st: -1 };
  }
  const st = m % 10 === 0 && m > 0 && age < CLIMB0 ? k - 1 : k;
  return { pose: 0, x: STATIONS[st][0], y: STATIONS[st][1], st };
}

function seatLeaves(fs) {
  for (let k = 1; k <= 4; k++) {
    const y = STATIONS[k][1] + 8.6, x = stalkX(y), sd = SEAT[k];
    const load = fs.st === k ? 0.07 : 0;
    const ang = (sd < 0 ? Math.PI + 0.18 : -0.18) + sd * load + 0.06 * Math.sin(T * 1.7 + k);
    leaf(x + sd * 1.5, y, ang, 16, 3.6, C.leafD, C.leafL);
  }
}

// butterflies by day, fireflies by night
const FLY = [kit.hex('#3a8cff'), kit.hex('#ff8a1a')];
function bugPos(i) {
  const x = 32 + 24 * Math.sin(T * 0.11 + i * 2.4) + 4 * Math.sin(T * 0.53 + i);
  const y = 96 + 70 * Math.sin(T * 0.047 + i * 3.1) + 8 * Math.sin(T * 0.31 + i * 1.7);
  return [x, y];
}
function drawBugs(hr) {
  const day = kit.smoothstep(6.2, 7.2, hr) * (1 - kit.smoothstep(18.8, 19.6, hr));
  for (let i = 0; i < 2; i++) {
    const [x, y] = bugPos(i);
    if (day > 0) butterfly(x, y, Math.abs(Math.sin(T * 7.5 + i * 2)), FLY[i], day);
    if (day < 1) for (let j = 0; j < 3; j++) {
      const fx = x + 9 * Math.sin(T * 0.37 + j * 2.1), fy = y + 22 * Math.sin(T * 0.23 + j * 1.3 + i);
      const pulse = Math.max(0, Math.sin(T * 0.9 + j * 1.9 + i * 0.7)) ** 3;
      glow(fx, fy, 3.2, [0.30, 0.45, 0.04], pulse * (1 - day));
    }
  }
}

// ---------------------------------------------------------- the hour show
// Sap rushes up the stalk, flowers open in a wave from the pot to the cloud,
// burst into petals, and every third one lets go a butterfly.
const NODES = Array.from({ length: 13 }, (_, k) => ({ y: 166 - k * 12.6, sd: k % 2 ? 1 : -1, pink: k % 3 !== 1, t: 0.3 + 1.85 * k / 12 }));
const SAP = 2.2;
function drawBlossoms(age) {
  for (let k = 0; k < NODES.length; k++) {
    const N = NODES[k], x = stalkX(N.y) + N.sd * 4.2, y = N.y;
    const ta = age - N.t;
    if (ta < 0) continue;
    if (k === 12 && age > CHUTE0) continue; // the frog took this one
    const burst = 1.5;
    if (ta < burst) { flower(x, y, kit.ease.outBack(kit.clamp(ta / 0.5)), ta * 0.4 + k, N.pink); continue; }
    const tau = ta - burst;
    if (tau > 6) continue;
    for (let p = 0; p < 5; p++) {
      const a = k + p * 1.2566 + tau * 0.4, out = 8 * (1 - Math.exp(-tau / 0.6));
      const fall = 9 * (tau - 1 * (1 - Math.exp(-tau)));
      const px = x + Math.cos(a) * (2 + out) + 3 * Math.sin(tau * 2 + p);
      const py = y + Math.sin(a) * (2 + out) * 0.7 + fall;
      leaf(px, py, a + 1.5 * Math.sin(tau * 2.5 + p), 2.6, 1.3, kit.scale(N.pink ? PINK : PEACH, 0.6), N.pink ? PINK : PEACH, 1 - kit.smoothstep(3.5, 6, tau));
    }
    if (k % 3 === 2) {
      const bx = x + 9 * Math.sin(tau * 1.6 + k) * kit.clamp(tau), by = y - 14 * tau - 3 * Math.sin(tau * 3);
      if (by > -4) butterfly(bx, by, Math.abs(Math.sin(tau * 11 + k)), FLY[k % 2], 1);
    }
  }
}

const pad = (n) => String(n).padStart(2, '0');
const digitsOf = (d) => pad(d.getHours()) + pad(d.getMinutes());

export default {
  name: 'Beanstalk',
  blurb: 'a magic vine climbs the tower; its tendrils curl into the time, wither and regrow each minute',
  layouts: ['hub-tall3'], look: 'smoke', fps: 60, brightness: 0.35, dither: true,
  frame(ctx) {
    const now = ctx.date.getTime() / 1000;
    T = now - EPOCH;
    const M = Math.floor(now / 60) * 60, age = now - M;
    const cur = digitsOf(ctx.date), prev = digitsOf(new Date((M - 60) * 1000));
    const hr = ctx.date.getHours() + ctx.date.getMinutes() / 60 + ctx.date.getSeconds() / 3600;
    const gust = 0.5 + 0.5 * kit.noise2(T * 0.11, 3.7);
    SW = (0.9 + 1.1 * gust) * (0.72 * Math.sin(T * 0.95) + 0.28 * Math.sin(T * 2.3 + 1.3));

    const m = ctx.date.getMinutes(), fs = frogState(m, age), show = m === 0 && age < 12;
    SAP_Y = show && age < SAP + 0.5 ? POT_Y - (age / SAP) * (POT_Y - TOP_Y) : -99;

    drawSky(hr, ctx.night);
    drawStalk();
    seatLeaves(fs);
    // changing digits turn in a ripple from the right-most, so never all blank at once
    const delay = [0, 0, 0, 0];
    for (let s = 3, r = 0; s >= 0; s--) if (cur[s] !== prev[s]) delay[s] = 0.4 * r++;
    for (let s = 0; s < 4; s++) {
      const a = +cur[s], b = +prev[s], hour = s < 2, ag = age - delay[s];
      if (a === b || ag >= GROW0 + GROW) { drawTendril(s, a, Infinity, 0, 0, hour); continue; }
      if (ag < 0) { drawTendril(s, b, Infinity, 0, 0, hour); continue; }
      if (ag < WITHER) drawTendril(s, b, 1 - kit.smoothstep(0, 1, ag / WITHER), 2, kit.clamp(ag / 0.45), hour);
      if (ag >= GROW0) {
        const g = kit.ease.inOut(kit.clamp((ag - GROW0) / GROW));
        const G = GLYPHS[SLOTS[s].side][a];
        drawTendril(s, a, g * (14 + G.dmax), 1, 0, hour);
      }
    }
    drawDew();
    drawPot();
    drawCloud(hr);
    if (show) drawBlossoms(age);
    for (let s = 0; s < 4; s++) if (cur[s] !== prev[s] && age < 11) fallingLeaves(s, +prev[s], age - delay[s]);
    drawBugs(hr);
    // the frog: blinks, breathes, watches the nearest butterfly; sleeps at night
    const [bx, by] = bugPos(Math.abs(bugPos(0)[1] - fs.y) < Math.abs(bugPos(1)[1] - fs.y) ? 0 : 1);
    const ld = Math.hypot(bx - fs.x, by - fs.y) || 1;
    const blink = ctx.night > 0.5 || kit.fract(T / 4.3) < 0.035 ? 1 : 0;
    const look = fs.pose === 1 ? [0, -0.8] : fs.pose === 2 ? [0, 0.8] : [0.8 * (bx - fs.x) / ld, 0.7 * (by - fs.y) / ld];
    const tw = kit.fract(T / 7.3), near = ld < 22 && fs.pose === 0 && ctx.night < 0.5;
    const tongue = near && tw < 0.05 ? Math.sin(Math.PI * tw / 0.05) * Math.min(ld / FROG_S - 2, 14) : 0;
    frog(fs.x, fs.y + (fs.pose === 0 && fs.st >= 1 && fs.st <= 4 ? 0.4 * Math.sin(T * 1.7 + fs.st) : 0), {
      pose: fs.pose, ph: fs.ph || 0, blink, lx: look[0], ly: look[1], rot: fs.rot || 0, canopy: fs.canopy ?? 1, breath: 0.25 * Math.sin(T * 2.4), s: FROG_S, tongue, tx: (bx - fs.x) / ld, ty: (by - fs.y) / ld,
    });

    kit.blitGrid(ctx, img, 1 - 0.6 * ctx.night);
  },
};
