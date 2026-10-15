// Thermal: the panel is the screen of an infrared camera looking down at a
// kitchen table. The time is written on the cold tabletop with a fingertip,
// in heat: each stroke is hottest and thinnest where the finger has just
// passed (and hottest of all where it touched down) and blooms wider and
// cooler as the heat soaks into the wood, so every digit carries the order
// it was written in. A hand comes back every ~15 s to retrace one digit and
// keep it warm, and leaves a fading print of its knuckles where it lifted.
//   Always: heat diffuses and cools; a cat sleeps in the corner, breathing,
//   ears and eyes its hottest spots; a mug of tea steams. The tea cools
//   through the hour (white at :00, purple by :59), so mug and plume are the
//   hour's hand.
//   Minute: the changing digit blooms out and dissipates while the hand
//   arrives and writes the new one stroke by stroke.
//   Hour: the hand hurries; a kettle swings in and refills the mug, the
//   camera widens its span for the hot steel, a wave of steam rolls out and
//   the cat lifts its head.
// Camera UI: iron palette, scale bar, centre crosshair with a live spot
// temperature. Pure function of the clock (passes are scheduled per minute).
import * as kit from '../js/kit.js';
import { placed, tipAt, heatMap } from './thermal-glyphs.js';
import { OSD, OSD_W } from './thermal-osd.js';

const W = 64, H = 64, N = W * H;
const LO = 19, HI = 39;                 // the camera's locked span, deg C
const AMB = 19.5;                        // tabletop

// ------------------------------------------------------------ palette
// iron / inferno: black, indigo, purple, magenta, red, orange, yellow, white
const STOPS = [[0, '#000000'], [0.1, '#12052c'], [0.26, '#3f0a6e'], [0.42, '#8e1a80'], [0.56, '#d22f3c'],
  [0.7, '#f4720e'], [0.84, '#fbb924'], [0.94, '#fdf08a'], [1, '#ffffff']];
const LUT_N = 512, LUT = new Float32Array(3 * LUT_N);
{
  const srgb = STOPS.map(([p, h]) => [p, parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255]);
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  for (let i = 0; i < LUT_N; i++) {
    const t = i / (LUT_N - 1);
    let k = 0; while (k < srgb.length - 2 && srgb[k + 1][0] < t) k++;
    const a = srgb[k], b = srgb[k + 1], u = (t - a[0]) / (b[0] - a[0]);
    for (let c = 0; c < 3; c++) LUT[3 * i + c] = lin(a[c + 1] + (b[c + 1] - a[c + 1]) * u);
  }
}

// ------------------------------------------------------------- layout
// a handwritten cascade: hours high on the left, minutes low on the right
const GW = 14, GH = 24, SLANT = 0.13;
const SLOTS = [[3, 3], [20, 3], [25, 35], [42, 35]];
const MUG = [49, 18], CAT = [14.4, 49], CROSS = [32, 31];
const SPEED = 52;                       // px of path per second, fingertip

const pad = (n) => String(n).padStart(2, '0');
const digitsAt = (sec) => { const d = new Date(sec * 1000); return pad(d.getHours()) + pad(d.getMinutes()); };

const glyphs = new Map();
function glyph(ch, slot) {
  const key = ch + slot;
  if (!glyphs.has(key)) {
    const [x, y] = SLOTS[slot], g = placed(ch, x, y, GW, GH, SLANT);
    g.map = heatMap(g, W, H, 6);
    g.dur = g.strokes.reduce((a, s) => a + s.len, 0) / SPEED + 0.45;
    glyphs.set(key, g);
  }
  return glyphs.get(key);
}

// ------------------------------------------------------- the schedule
/** Every pass of the fingertip in minute M (seconds since epoch / 60). */
const schedCache = new Map();
function schedule(M) {
  if (schedCache.has(M)) return schedCache.get(M);
  const cur = digitsAt(M * 60), prev = digitsAt(M * 60 - 60), T0 = M * 60;
  const passes = [];
  // at the hour three or four digits change: the hand hurries (a flourish)
  let nch = 0; for (let k = 0; k < 4; k++) if (cur[k] !== prev[k]) nch++;
  const fast = nch >= 3 ? 2 : 1;
  let t = T0 + (fast > 1 ? 0.6 : 0.75);
  const same = [];
  for (let k = 0; k < 4; k++) {
    if (cur[k] !== prev[k]) { const g = glyph(cur[k], k), dur = g.dur / fast; passes.push({ slot: k, g, start: t, dur }); t += dur + 0.3 / fast; }
    else same.push(k);
  }
  // retrace the unchanged digits, one every 15 s, starting order rotating
  for (let j = 0; j < same.length; j++) {
    const k = same[(j + M) % same.length];
    const g = glyph(cur[k], k);
    passes.push({ slot: k, g, start: T0 + [10, 24, 40][j], dur: g.dur });
  }
  const out = { cur, prev, passes };
  if (schedCache.size > 8) schedCache.clear();
  schedCache.set(M, out);
  return out;
}

// --------------------------------------------------------------- static
const BG = new Float32Array(N), FUR = new Float32Array(N), PH = new Float32Array(N), FQ = new Float32Array(N);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const p = y * W + x;
  // the tabletop: a draught from the left, and the grain of the wood
  BG[p] = AMB - 0.9 * (1 - x / W) + 0.5 * kit.fbm(x * 0.08, y * 0.5, 3, 3) + 0.35 * (kit.noise2(x * 0.05, y * 0.05) - 0.5);
  FUR[p] = kit.fbm(x * 0.45, y * 0.45, 7, 3);
  PH[p] = kit.hash(x, y, 1) * kit.TAU; FQ[p] = 3 + 4 * kit.hash(x, y, 2);
}

const T = new Float32Array(N);
const cov = (d) => (d <= -0.5 ? 1 : d >= 0.5 ? 0 : 0.5 - d);   // signed distance px -> coverage

function capsule(px, py, ax, ay, bx, by, ra, rb) {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
  const t = L2 ? kit.clamp(((px - ax) * dx + (py - ay) * dy) / L2) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy) - (ra + (rb - ra) * t);
}

// ------------------------------------------------------------ the ink
const S0 = 0.8, KD = 0.006;            // fresh line variance px^2, diffusion px^2/s
function inkHeat(age, d2) {
  if (age < 0) return 0;
  const s2 = S0 + KD * age;
  return 20 * Math.sqrt(S0 / s2) * (0.6 + 0.4 * Math.exp(-age / 12)) * Math.exp(-d2 / (2 * s2));
}

/** Add the heat of slot k's glyph to T, given its pass history. */
function drawDigit(g, starts, now, fade, extraAge) {
  const m = g.map, n = m.pix.length;
  for (let j = 0; j < n; j++) {
    let best = 0;
    for (let c = 0; c < 2; c++) {
      const f = c ? m.f2[j] : m.f1[j];
      if (f < 0) continue;
      const d2 = c ? m.d2[j] : m.d1[j], w = c ? m.w2[j] : m.w1[j];
      // the most recent pass that has already reached this point
      let a = -1;
      for (let q = starts.length - 2; q >= 0; q -= 2) { const tp = starts[q] + f * starts[q + 1]; if (tp <= now) { a = now - tp; break; } }
      if (a < 0) continue;
      const h = w * inkHeat(a + extraAge, d2);
      if (h > best) best = h;
    }
    T[m.pix[j]] += best * fade;
  }
}

// ------------------------------------------------------------ the hand
const U = [0.5, 0.866], V = [-0.866, 0.5];      // toward the wrist; the thumb side
const HAND = [   // [a0, b0, r0, a1, b1, r1, temp0, temp1]: capsules in hand space
  [24, -3.5, 6.2, 90, -8, 7.5, 24.5, 24.5],    // sleeve
  [22, -3.5, 5.4, 26, -3.6, 5.6, 32.6, 32.6],  // wrist
  [15.5, -3.2, 6.6, 19.5, -3.6, 6.4, 33.6, 33.4], // palm
  [11.5, -7.2, 2.2, 14, -7.4, 2.4, 31.4, 32.4],   // curled little finger
  [10.8, -4.8, 2.5, 13.5, -5, 2.7, 31.8, 32.6],   // ring
  [10.2, -2.2, 2.6, 13, -2.4, 2.8, 32, 32.8],     // middle
  [17, 4.4, 2.7, 9.6, 4.6, 2.0, 33, 31.2],        // thumb
  [0, 0, 1.55, 10, -0.2, 2.25, 30.4, 32.4],       // index finger, tip at the origin
];
function drawHand(tx, ty) {
  // world capsules
  const caps = HAND.map(([a0, b0, r0, a1, b1, r1, t0, t1]) =>
    [tx + a0 * U[0] + b0 * V[0], ty + a0 * U[1] + b0 * V[1], tx + a1 * U[0] + b1 * V[0], ty + a1 * U[1] + b1 * V[1], r0, r1, t0, t1]);
  const x0 = Math.max(0, Math.floor(tx - 12)), y0 = Math.max(0, Math.floor(ty - 6));
  if (x0 >= W || y0 >= H) return;
  for (let y = y0; y < H; y++) for (let x = x0; x < W; x++) {
    const p = y * W + x;
    let t = T[p];
    for (const [ax, ay, bx, by, ra, rb, ta, tb] of caps) {
      const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
      const u = kit.clamp(((x - ax) * dx + (y - ay) * dy) / L2);
      const d = Math.hypot(x - ax - u * dx, y - ay - u * dy) - (ra + (rb - ra) * u);
      if (d >= 0.5) continue;
      const c = cov(d);
      // limb darkening: skin seen edge-on reads cooler, which parts the fingers
      t += (ta + (tb - ta) * u - 2.6 * kit.smoothstep(-2.2, 0.4, d) - t) * c;
    }
    T[p] = t;
  }
}

/** The warm print the hand leaves where it lifted off: [x, y, age] or null. */
function lastLift(passes, now) {
  for (let i = passes.length - 1; i >= 0; i--) {
    const P = passes[i], e = P.start + P.dur, next = passes[i + 1];
    if (next && next.start < e + 1.2) continue;
    if (e <= now && now - e < 16) return [...tipAt(P.g, 1), now - e];
  }
  return null;
}
function drawPrint(tx, ty, age) {
  const a = 4.2 * Math.exp(-age / 3.6), blur = 1 + 0.25 * age;
  if (a < 0.05) return;
  const caps = HAND.slice(2, 6).map(([a0, b0, r0, a1, b1, r1]) =>
    [tx + a0 * U[0] + b0 * V[0], ty + a0 * U[1] + b0 * V[1], tx + a1 * U[0] + b1 * V[0], ty + a1 * U[1] + b1 * V[1], r0 * 0.8, r1 * 0.8]);
  const x0 = Math.max(0, Math.floor(tx - 12)), y0 = Math.max(0, Math.floor(ty));
  const x1 = Math.min(W, Math.ceil(tx + 22)), y1 = Math.min(H, Math.ceil(ty + 30));
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    let d = 1e9;
    for (const c of caps) d = Math.min(d, capsule(x, y, c[0], c[1], c[2], c[3], c[4], c[5]));
    if (d > 3 * blur) continue;
    const dd = d > 0 ? d / blur : 0;
    T[y * W + x] += a * Math.exp(-dd * dd) * (0.7 + 0.3 * FUR[y * W + x]);
  }
}

/** Where the fingertip is at `now`, or null when the hand is out of view. */
const OFF = [44, 70];
function handAt(passes, now) {
  const hops = [];
  for (const P of passes) hops.push([P.start, P.start + P.dur, P.g]);
  for (let i = 0; i < hops.length; i++) {
    const [s, e, g] = hops[i];
    if (now >= s && now <= e) return tipAt(g, (now - s) / (e - s));
    const prevEnd = i > 0 ? hops[i - 1][1] : -1e9;
    if (now < s) {
      const a = tipAt(g, 0);
      if (prevEnd > s - 1.2 && now >= prevEnd) {           // glide from the last stroke
        const b = tipAt(hops[i - 1][2], 1), u = kit.ease.inOut((now - prevEnd) / (s - prevEnd));
        return [b[0] + (a[0] - b[0]) * u, b[1] + (a[1] - b[1]) * u];
      }
      if (now > s - 0.65) {                                 // arrive from off screen
        const u = kit.ease.out((now - (s - 0.65)) / 0.65);
        return [OFF[0] + a[0] * 0.3 + (a[0] - OFF[0] - a[0] * 0.3) * u, OFF[1] + (a[1] - OFF[1]) * u];
      }
      return null;
    }
    const next = hops[i + 1];
    if (now > e && (!next || next[0] > e + 1.2) && now < e + 0.8) {   // leave
      const b = tipAt(g, 1), u = kit.ease.inOut((now - e) / 0.8);
      return [b[0] + (OFF[0] + b[0] * 0.3 - b[0]) * u, b[1] + (OFF[1] - b[1]) * u];
    }
  }
  return null;
}

// ------------------------------------------------------- mug and steam
function teaTemp(now, hourS) {
  const m = hourS / 60;                         // minutes since the hour: the tea goes cold
  const cool = (mm) => 22.5 + 24 * Math.exp(-mm / 24);
  if (hourS < 8) return cool(59.9) + (48 - cool(59.9)) * kit.smoothstep(1.8, 6.5, hourS);
  return Math.min(48, cool(m - 8 / 60) + 2);
}

function drawMug(now, tea, pour) {
  const [mx, my] = MUG, ex = tea - AMB;
  for (let y = Math.max(0, my - 10); y < my + 11; y++) for (let x = mx - 11; x < Math.min(W, mx + 13); x++) {
    const p = y * W + x, dx = x - mx, dy = y - my, r = Math.hypot(dx, dy);
    let t = T[p];
    t += ex * 0.06 * Math.exp(-((r - 6.5) ** 2) / 8);        // warm table round the mug
    // handle
    const hd = Math.abs(Math.hypot(x - (mx + 7.6), y - my) - 2.3) - 0.75;
    if (dx > 5) t += (AMB + ex * 0.3 - t) * cov(hd);
    // rim and tea
    t += (AMB + ex * 0.55 - t) * cov(r - 6.6);
    if (r < 6) {
      const sw = kit.noise2(dx * 0.5 + now * 0.4, dy * 0.5 - now * 0.3);
      const ripple = pour * 3 * Math.sin(r * 1.6 - now * 9) * Math.exp(-r * 0.25);
      t += (tea - 1.5 + 3 * sw + ripple - t) * cov(r - 5.1);
    }
    T[p] = t;
  }
}

// three curling filaments rising off the tea, drifting up and to the left;
// puffs travel up them. Stronger the hotter the tea, and billowing at the hour.
const FIL = [[-2.2, 0, 1], [0.6, 2.1, 0.8], [2.6, 4.2, 0.65]];
function drawSteam(now, tea, billow) {
  const [mx, my] = MUG, k = Math.min(15, Math.max(0, tea - 22) * 0.7) * (1 + 0.3 * billow);
  if (k <= 0.05) return;
  for (let y = 0; y < my; y++) {
    const dy = my - y;
    const fade = Math.exp(-dy / (17 + 12 * billow)) * kit.smoothstep(1, 6, dy);
    for (const [ox, ph, a] of FIL) {
      const sp = 1 + 1.6 * billow;
      const cx = mx + ox * (1 + 0.04 * dy) * sp - (0.3 + 0.1 * billow) * dy
        + (1 + 0.16 * dy) * Math.sin(dy * 0.36 - now * 1.9 + ph) + 0.6 * Math.sin(dy * 0.9 - now * 3.1 + 2 * ph);
      const w = 0.8 + 0.09 * dy + 2.5 * billow;
      const puff = 0.55 + 0.45 * Math.sin(dy * 0.55 - now * 4.2 + 3 * ph);
      const amp = 1.4 * k * a * fade * puff;
      const xa = Math.max(0, Math.floor(cx - 3 * w)), xb = Math.min(W, Math.ceil(cx + 3 * w));
      for (let x = Math.max(xa, 36); x < xb; x++) { const l = (x - cx) / w; T[y * W + x] += amp * Math.exp(-l * l) * kit.smoothstep(36, 42, x); }
    }
  }
}

// --------------------------------------------------------------- the cat
// asleep in profile in the bottom-left corner, head to the left, tail wrapped
// round the front; it breathes, its ear twitches, and at the hour it looks up
function drawCat(now, wake) {
  const [cx, cy] = CAT;                       // body centre
  const br = Math.sin(now * kit.TAU / 3.6);   // breathing
  const lift = wake, hx = cx - 9.4, hy = cy - 2.6 - 2.6 * lift;
  const flick = Math.max(0, Math.sin(now * 0.53 + 1)) ** 14;
  const tw = Math.max(0, Math.sin(now * 0.9)) ** 6 * Math.sin(now * 7) * 1.6;
  const GROUND = 56.5;
  for (let y = 33; y < 60; y++) for (let x = 0; x < 29; x++) {
    const p = y * W + x;
    let t = T[p];
    // warm patch on the table and warm air rising round the cat
    const ex = (x - cx) / 11, ey = (y - cy - 3) / 8, er = ex * ex + ey * ey;
    t += 2.8 * Math.exp(-er * 1.6);
    // tail, lying along the front of the body, tip lifting
    let td = capsule(x, y, cx + 6, cy + 6.8, cx + 8.9, cy + 3.8, 1.5, 1.4);
    td = Math.min(td, capsule(x, y, cx + 8.9, cy + 3.8, cx + 9.4, cy - 1.2, 1.4, 1.2));
    td = Math.min(td, capsule(x, y, cx + 9.4, cy - 1.2, cx + 8 + 1.2 * tw, cy - 4 - 0.4 * Math.abs(tw), 1.2, 1.0));
    // body: a loaf, rising with each breath
    const bx = (x - cx - 0.5) / 8.4, by = (y - cy - 3.5) / (8.2 + 0.7 * br);
    const bd = (Math.sqrt(bx * bx + by * by) - 1) * 7.6;
    t += (26.4 + 2.4 * FUR[p] + 1.4 * kit.smoothstep(1, -0.6, by) - 3.4 * kit.smoothstep(-2.5, 0.4, bd) - t) * cov(Math.max(bd, y - GROUND));
    t += (27.4 + FUR[p] - 1.2 * kit.smoothstep(-1.2, 0.3, td) - t) * cov(Math.max(td, y - GROUND));
    // ears (thin skin: the hottest outline), then the head
    const e1 = capsule(x, y, hx - 2.4, hy - 2.4, hx - 3.3, hy - 6.6 - 0.8 * lift, 1.9, 0.45);
    const e2 = capsule(x, y, hx + 1.9, hy - 2.8, hx + 2.6 + 0.9 * flick, hy - 7 - 0.8 * lift + 0.8 * flick, 1.9, 0.45);
    t += (35.5 - t) * cov(Math.min(e1, e2));
    const hd = Math.hypot((x - hx) / 1.12, y - hy) - 4.3;
    t += (32 + 1.2 * FUR[p] - 3.6 * kit.smoothstep(-2.2, 0.4, hd) - t) * cov(hd);
    // muzzle, eyes (closed: warm slits; open: hot), paws
    t += (34 - t) * cov(Math.hypot(x - hx + 3.4, y - hy - 1.7) - 1.5);
    const ey2 = capsule(x, y, hx - 2.9, hy - 0.5, hx - 0.9, hy - 0.2 + 0.4 * (1 - lift), 0.45 + 0.4 * lift, 0.45 + 0.4 * lift);
    t += (36.5 + 3 * lift - t) * cov(ey2);
    t += (29.5 - t) * cov(capsule(x, y, hx - 2.5, hy + 4.6, hx + 2.5, hy + 5, 1.4, 1.5));
    T[p] = t;
  }
}

// --------------------------------------------------------------- kettle
// seen from above: a white-hot steel body, the lid seam and a plastic knob
// (cooler, so they show dark in the glare), the handle arching over it, and
// the spout reaching over the mug
function drawKettle(hs) {
  if (hs > 10 || hs < 0) return;
  const inn = kit.ease.out(kit.smoothstep(0, 1.5, hs)), out = kit.ease.in(kit.smoothstep(7.6, 9.6, hs));
  const tilt = kit.smoothstep(1.1, 2, hs) * (1 - kit.smoothstep(6.4, 7.4, hs));
  const kx = 76 - 21 * inn + 21 * out, ky = -16 + 22 * inn - 22 * out;
  const ang = Math.atan2(MUG[1] - ky, MUG[0] - kx), ux = Math.cos(ang), uy = Math.sin(ang);
  const sl = 10 + 3.4 * tilt, R = 8;
  const y1 = Math.min(H, Math.ceil(ky + 22)), x0 = Math.max(0, Math.floor(kx - 22));
  for (let y = 0; y < y1; y++) for (let x = x0; x < W; x++) {
    const p = y * W + x, dx = x - kx, dy = y - ky, r = Math.hypot(dx, dy);
    let t = T[p];
    t += 2.5 * Math.exp(-((r - R) ** 2) / 8);                                            // hot air round it
    t += (44 - t) * cov(capsule(x, y, kx + ux * 7, ky + uy * 7, kx + ux * sl, ky + uy * sl, 2.3, 1.1));  // spout
    t += (31 + 20 * Math.sqrt(Math.max(0, 1 - (r / R) ** 2)) - t) * cov(r - R);                                 // domed body
    t += (31 - t) * cov(Math.abs(r - 4.6) - 0.75);                                         // lid seam
    t += (27.5 - t) * cov(r - 1.7);                                                         // knob
    // handle: a plastic bar arching across the body, away from the spout
    const hx0 = kx - uy * 6.4 - ux * 2.4, hy0 = ky + ux * 6.4 - uy * 2.4, hx1 = kx + uy * 6.4 - ux * 2.4, hy1 = ky - ux * 6.4 - uy * 2.4;
    t += (32.5 - t) * cov(capsule(x, y, hx0, hy0, hx1, hy1, 1.2, 1.2));
    T[p] = t;
  }
}

/** The hour's steam: a cloud rolling out of the mug across the top of the scene. */
function drawBillow(now, hs) {
  if (hs < 1.6 || hs > 30) return;
  const amp = 10 * kit.smoothstep(1.6, 3.5, hs) * (1 - kit.smoothstep(9, 28, hs));
  const R = 6 + 7.5 * (hs - 1.6), [mx, my] = MUG;
  for (let y = 0; y < 44; y++) for (let x = 0; x < W; x++) {
    const dx = x - mx, dy = (y - my) * 1.5, d = Math.hypot(dx, dy);
    // a travelling wave of hot vapour: a band round the front, thinning behind it
    const front = kit.smoothstep(R + 4, R - 3, d) * (0.25 + 0.75 * kit.smoothstep(R - 16, R - 4, d));
    if (front <= 0) continue;
    const n = kit.noise2(x * 0.11 + now * 0.55, y * 0.13 - now * 0.35) * 0.65 + kit.noise2(x * 0.27 - now * 0.9, y * 0.3 + now * 0.4) * 0.35;
    const c = kit.smoothstep(0.3, 0.8, n) * front * Math.exp(-d / 40);
    T[y * W + x] += amp * c;
  }
}

// ------------------------------------------------------------------ OSD
function text(out, s, x, y, c, dim) {
  for (const ch of s) {
    const g = OSD[ch];
    if (!g) { x += 2; continue; }
    g.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] !== '.') put(out, x + i, y + j, c, dim); });
    x += (OSD_W[ch] ?? 3) + 1;
  }
}
function put(out, x, y, c, a) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const p = 3 * (y * W + x);
  out[p] += (c[0] * a - out[p]) * 0.85; out[p + 1] += (c[1] * a - out[p + 1]) * 0.85; out[p + 2] += (c[2] * a - out[p + 2]) * 0.85;
}

const IMG = new Float32Array(3 * N);
const UI = [0.62, 0.66, 0.7];

export default {
  name: 'Thermal', blurb: 'an infrared camera on a kitchen table: the time is finger-written in heat, blooming as it cools; a cat sleeps, the tea goes cold through the hour',
  layouts: ['hub'], look: 'smoke', fps: 60, brightness: 0.42, dither: true,
  init() { for (let k = 0; k < 4; k++) for (let d = 0; d < 10; d++) glyph(String(d), k); },   // all 40 heat maps up front
  frame(ctx) {
    const now = ctx.date.getTime() / 1000, M = Math.floor(now / 60), s = now - M * 60;
    const S = schedule(M), P = schedule(M - 1);
    const hourS = now - Math.floor(now / 3600) * 3600;
    const hs = new Date(M * 60000).getMinutes() === 0 ? s : 99;

    T.set(BG);
    // the ink: each digit with the passes that wrote or retraced it
    for (let k = 0; k < 4; k++) {
      const ch = S.cur[k];
      const starts = [];
      if (S.prev[k] === ch) for (const q of P.passes) if (q.slot === k) starts.push(q.start, q.dur);
      for (const q of S.passes) if (q.slot === k) starts.push(q.start, q.dur);
      drawDigit(glyph(ch, k), starts, now, 1, 0);
      if (S.prev[k] !== ch && s < 1.1) {
        // the old digit blooms out and dissipates
        const old = S.prev[k], PP = schedule(M - 2), st = [];
        if (PP.cur[k] === old && PP.prev[k] === old) for (const q of PP.passes) if (q.slot === k) st.push(q.start, q.dur);
        for (const q of P.passes) if (q.slot === k) st.push(q.start, q.dur);
        const e = kit.smoothstep(0, 1.05, s);
        drawDigit(glyph(old, k), st, now, (1 - e) ** 1.6, 160 * e * e);
      }
    }
    const tea = teaTemp(now, hourS);
    const pour = hs < 10 ? kit.smoothstep(1.4, 2.4, hs) * (1 - kit.smoothstep(6, 7.2, hs)) : 0;
    const billow = hs < 30 ? kit.smoothstep(1.5, 4, hs) * (1 - kit.smoothstep(6, 26, hs)) : 0;
    drawCat(now, hs < 12 ? kit.smoothstep(1, 2.4, hs) * (1 - kit.smoothstep(8, 11, hs)) : 0);
    drawMug(now, tea, pour);
    drawSteam(now, tea, billow);
    drawBillow(now, hs);
    drawKettle(hs);
    const lift = lastLift(S.passes, now);
    if (lift) drawPrint(lift[0], lift[1], lift[2]);
    const tip = handAt(S.passes, now);
    if (tip) drawHand(tip[0], tip[1]);

    // spot meter at the crosshair (before sensor grain)
    let spot = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) spot += T[(CROSS[1] + j) * W + CROSS[0] + i];
    spot /= 9;

    // palette, with a little sensor grain shimmering
    const dim = 1 - 0.72 * ctx.night;
    // auto-span: with the kettle in view the camera widens its range, so the
    // steel shows its dome and everything cooler sinks a little
    const agc = hs < 12 ? kit.smoothstep(0.4, 2.2, hs) * (1 - kit.smoothstep(8.5, 11.5, hs)) : 0;
    const span = 1 / (HI + 7 * agc - LO);
    for (let p = 0; p < N; p++) {
      const t = T[p] + 0.18 * Math.sin(now * FQ[p] + PH[p]);
      let u = (t - LO) * span;
      u = u < 0 ? 0 : u > 1 ? 1 : u;
      const li = 3 * Math.round(u * (LUT_N - 1));
      IMG[3 * p] = LUT[li] * dim; IMG[3 * p + 1] = LUT[li + 1] * dim; IMG[3 * p + 2] = LUT[li + 2] * dim;
    }
    // camera UI: scale bar, crosshair, spot readout
    for (let y = 9; y <= 54; y++) {
      const u = 1 - (y - 9) / 45, li = 3 * Math.round(u * (LUT_N - 1));
      for (let x = 62; x < 64; x++) { const p = 3 * (y * W + x); IMG[p] = LUT[li] * dim; IMG[p + 1] = LUT[li + 1] * dim; IMG[p + 2] = LUT[li + 2] * dim; }
    }
    const ua = 0.5 * dim;
    for (let d = 2; d <= 4; d++) {
      put(IMG, CROSS[0] + d, CROSS[1], UI, ua); put(IMG, CROSS[0] - d, CROSS[1], UI, ua);
      put(IMG, CROSS[0], CROSS[1] + d, UI, ua); put(IMG, CROSS[0], CROSS[1] - d, UI, ua);
    }
    text(IMG, spot.toFixed(1) + '°', 2, 58, UI, 0.42 * dim);
    kit.blitGrid(ctx, IMG);
  },
};
