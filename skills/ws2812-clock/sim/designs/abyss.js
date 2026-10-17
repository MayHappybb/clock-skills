// Abyss: the tower is a column of ocean, sunlit at the top, black at the
// bottom. A siphonophore - a colonial animal, the longest creature on
// Earth - hangs from its float at the surface, its glassy swimming bells
// pumping, and its stem runs down the tower budding numerals: the hour in
// the twilight zone, the minutes in the midnight zone, every numeral a
// coiled, beaded colony trailing fishing tentacles. Waves of light run down
// the whole animal. An anglerfish waits on the sea floor; each minute it
// rises and inhales the changed numeral (its belly glows with the meal), and
// the colony buds the new one from its stalk. On the hour a sperm whale
// dives the full tower, clicking, swallowing every numeral that changes;
// the anglerfish douses its lure and hides; the colony regrows behind it.
import * as kit from '../js/kit.js';
import { digitPath } from './abyss-glyphs.js';
import { drawAngler, drawWhale, SC } from './abyss-beasts.js';

const W = 64, H = 192;
const img = new Float32Array(3 * W * H);
const glow = new Float32Array(W * H);   // colony light, max-accumulated
const halo = new Float32Array(W * H);
const bud = new Float32Array(W * H);
const glass = new Float32Array(W * 40);
const SHAFT = new Float32Array(1080);  // the swimming bells    // warm zooids (gastrozooids), max-accumulated
const bgR = new Float32Array(H), bgG = new Float32Array(H), bgB = new Float32Array(H), sunY = new Float32Array(H);
for (let y = 0; y < H; y++) {
  const k = Math.exp(-y / 26);
  sunY[y] = k;
  bgR[y] = 0.006 * k; bgG[y] = 0.06 * k + 0.0012 * Math.exp(-y / 70); bgB[y] = 0.13 * k + 0.0035 * Math.exp(-y / 70);
}
const light = (y) => sunY[y < 0 ? 0 : y >= H ? H - 1 : y | 0];

// numeral slots: x, y, w, h (staggered as the stem descends)
const SLOTS = [[3, 44, 26, 42], [35, 54, 26, 42], [3, 96, 27, 45], [34, 106, 27, 45]];
const REST = [36, 174];
for (const [, , w, h] of SLOTS) for (let d = 0; d < 10; d++) digitPath(d, w, h);  // build the paths up front
const SPINE_TOP = 40, SPINE_END = 156;
const spineX = (y, t) => 32 + 1.2 * Math.sin(y * 0.045 + t * 0.55) + 0.6 * Math.sin(t * 0.31);

const pad = (n) => String(n).padStart(2, '0');
const digitsOf = (ms) => { const d = new Date(ms); return pad(d.getHours()) + pad(d.getMinutes()); };

// ------------------------------------------------------------- drawing
function maxSplat(buf, x, y, r, a) {
  const x0 = Math.max(0, Math.ceil(x - r)), x1 = Math.min(W - 1, Math.floor(x + r));
  const y0 = Math.max(0, Math.ceil(y - r)), y1 = Math.min(buf.length / W - 1, Math.floor(y + r));
  const k = 1 / (r * r);
  for (let py = y0; py <= y1; py++) {
    const ry = (py - y) * (py - y), row = py * W;
    for (let px = x0; px <= x1; px++) {
      const d2 = ((px - x) * (px - x) + ry) * k;
      if (d2 >= 1) continue;
      const v = a * (1 - d2) * (1 - d2);
      if (v > buf[row + px]) buf[row + px] = v;
    }
  }
}
function addSplat(x, y, r, cr, cg, cb) {
  const x0 = Math.max(0, Math.ceil(x - r)), x1 = Math.min(W - 1, Math.floor(x + r));
  const y0 = Math.max(0, Math.ceil(y - r)), y1 = Math.min(H - 1, Math.floor(y + r));
  const k = 1 / (r * r);
  for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
    const d2 = ((px - x) * (px - x) + (py - y) * (py - y)) * k;
    if (d2 >= 1) continue;
    const f = (1 - d2) * (1 - d2), p = 3 * (py * W + px);
    img[p] += cr * f; img[p + 1] += cg * f; img[p + 2] += cb * f;
  }
}

/** Light waves rolling down the colony; c is the "colony depth" in px. */
function pulse(c, t) {
  let v = 0;
  for (let k = 0; k < 2; k++) {
    const p = ((t * 62 + k * 210) % 420) - 30;
    const d = (c - p) / 7;
    v += Math.exp(-d * d);
  }
  return v;
}

// per-numeral modes
const REST_M = 0, EAT = 1, GROW = 2;
/**
 * Numeral d in slot j. mode EAT: samples stream into (tx, ty), each after
 * its own delay (q = progress 0..1 per sample, from `tau` and `speed`);
 * mode GROW: buds outward from the attachment, g = 0..1.
 * Returns the attachment point in att[2j], att[2j+1].
 */
const att = new Float32Array(8);
function drawNumeral(j, d, mode, g, tx, ty, tau, a, t, eatY) {
  const [sx, sy, w, h] = SLOTS[j];
  const P = digitPath(d, w, h);
  const core = j < 2 ? 2.2 : 2.35;
  const n = P.n, top = P.top;
  const span = P.closed ? n / 2 : Math.max(top, n - 1 - top);
  for (let i = 0; i < n; i++) {
    let X = sx + P.x[i], Y = sy + P.y[i];
    // the colony drifts in the current
    X += 0.6 * Math.sin(t * 0.7 + Y * 0.07 + j);
    Y += 0.35 * Math.sin(t * 0.5 + X * 0.1 + j);
    let di = Math.abs(i - top);
    if (P.closed && di > n / 2) di = n - di;
    const arc = di * 0.5;
    if (i === top) { att[2 * j] = X; att[2 * j + 1] = Y; }
    let amp = a, r = core;
    if (mode === GROW) {
      const front = g * (span + 6);
      if (di > front) continue;
      const tip = front - di;                     // px behind the growing tip
      if (tip < 6) { r = core * (0.5 + 0.5 * tip / 6); amp *= 1 + 1.4 * (1 - tip / 6); }
      if (tip < 1 && g < 1) maxSplat(bud, X, Y, 2.6, a * 0.9);
    } else if (mode === EAT) {
      // when this sample is taken: nearest the mouth first (or as the whale passes)
      const dl = eatY >= 0 ? (Y - eatY) / WHALE_V : Math.hypot(X - tx, Y - ty) * 0.016;
      const q = kit.clamp((tau - dl) / 0.42);
      if (q >= 1) continue;
      if (q > 0) {
        const e = q * q;
        // spiral in toward the mouth
        const ox = X - tx, oy = Y - ty, sw = 1.6 * e;
        const cs = Math.cos(sw), sn = Math.sin(sw), k = 1 - e;
        X = tx + k * (cs * ox - sn * oy); Y = ty + k * (sn * ox + cs * oy);
        r = core * (1 - 0.6 * q); amp *= 1 + 0.8 * q;
      }
    }
    const c = sy + arc;                             // colony depth for the light waves
    // zooids: beads on the stem, creeping slowly outward from the stalk
    const ph = arc / 3.6 - t * 0.35, cell = Math.floor(ph), fr = ph - cell;
    const bd = Math.cos((fr - 0.5) * Math.PI), bead = bd * bd * bd;
    const pv = pulse(c, t);
    maxSplat(glow, X, Y, r * (0.42 + 0.68 * bead), amp * ((0.2 + 0.62 * bead) + 0.7 * pv));
    // every few zooids a warm feeding polyp
    if (mode !== EAT && ((cell + j * 3) & 3) === 0 && Math.abs(fr - 0.5) < 0.18) maxSplat(bud, X, Y, 1.5, amp * 0.5 * (1 - Math.abs(fr - 0.5) / 0.18));
    if ((i & 3) === 0) maxSplat(halo, X, Y, 4.5, amp * 0.1 * (1 + 1.5 * pv));
    // fishing tentacles hanging from the stem, every few px
    if (mode !== EAT && i % 14 === 7) {
      const len = 5 + 6 * kit.hash(i, d, j), sw = 1.4 + kit.hash(i, j);
      let tX = X, tY = Y;
      for (let k = 1; k <= 8; k++) {
        const u = k / 8;
        tX = X + sw * u * Math.sin(t * 0.9 + i * 0.7 + u * 2.5); tY = Y + 2 + u * len;
        maxSplat(glow, tX, tY, 0.7, amp * (0.13 - 0.05 * u) * (1 + pv));
      }
      maxSplat(bud, tX, tY, 1.0, amp * 0.3);   // the stinging knob at the tip
    }
    // a warm zooid at each free end of the stem
    if (!P.closed && (i === 0 || i === n - 1) && mode !== EAT) maxSplat(bud, X, Y, 2.3, amp * 0.55 * (0.8 + 0.2 * Math.sin(t * 2 + i)));
  }
}

/** The thin stem: a quadratic from (ax, ay) via (cx, cy) to (bx, by). */
function drawStem(ax, ay, cx, cy, bx, by, a, t, c0, w) {
  const len = Math.hypot(bx - ax, by - ay) + Math.hypot(cx - ax, cy - ay) * 0.3;
  const n = Math.max(6, Math.ceil(len * 1.8));
  for (let i = 0; i <= n; i++) {
    const u = i / n, m = 1 - u;
    const X = m * m * ax + 2 * m * u * cx + u * u * bx, Y = m * m * ay + 2 * m * u * cy + u * u * by;
    const v = a * (w + 0.6 * pulse(c0 + u * len, t));
    maxSplat(glow, X, Y, 1.05, v);
  }
}

// --------------------------------------------------------------- timing
/** The anglerfish's pose u seconds from a minute boundary (mouth to tx, ty). */
const TILT = 0.7;
function strikePose(tx, ty) {
  const c = Math.cos(TILT), s = Math.sin(TILT), mx = -13 * SC, my = 2 * SC;
  return [tx - (c * mx - s * my), ty - (s * mx + c * my)];
}
function anglerPose(A, u, tx, ty, hour, t) {
  A.t = t; A.eye = 0;
  const rx = REST[0] + 1.5 * Math.sin(t * 0.21), ry = REST[1] + 0.5 * Math.sin(t * 1.1);
  const restJaw = 0.62 + 0.08 * Math.sin(t * 1.1);
  A.x = rx; A.y = ry; A.tilt = 0.05 * Math.sin(t * 0.6); A.jaw = restJaw; A.lure = 0.8;
  if (hour) {
    // the whale passes: douse the lure, sink, eyes wide; relight after
    const hide = kit.smoothstep(0.6, 1.6, u) * (1 - kit.smoothstep(4.2, 5.6, u));
    A.lure = 0.8 * (1 - hide);
    A.y = ry + 3 * hide; A.jaw = restJaw * (1 - hide); A.eye = hide;
    return;
  }
  const [Sx, Sy] = strikePose(tx, ty);
  const Px = Sx + 5, Py = Sy + 12;                   // poised below
  if (u < -2.2 || u > 3.4) return;
  if (u < -0.3) {
    const e = kit.ease.inOut(kit.clamp((u + 2.2) / 1.9));
    A.x = kit.lerp(rx, Px, e); A.y = kit.lerp(ry, Py, e) - 2 * Math.sin(Math.PI * e);
    A.tilt = TILT * 0.7 * e; A.jaw = kit.lerp(restJaw, 0.35, e); A.lure = 0.8 + 0.2 * e;
  } else if (u < 0.05) {
    const e = kit.ease.inOut(kit.clamp((u + 0.3) / 0.35));
    A.x = kit.lerp(Px, Sx, e); A.y = kit.lerp(Py, Sy, e);
    A.tilt = TILT * (0.7 + 0.3 * e); A.jaw = kit.lerp(0.35, 1.05, e); A.lure = 1;
  } else if (u < 1.05) {
    // jaws wide, inhaling; snap shut at the end, a gulp
    const e = kit.ease.out(kit.clamp((u - 0.85) / 0.12));
    A.x = Sx + 0.5 * Math.sin(u * 23) * (u - 0.05); A.y = Sy; A.tilt = TILT;
    A.jaw = 1.05 * (1 - e) + 0.03 * e; A.lure = 1;
    A.eye = kit.smoothstep(0.85, 0.95, u);
  } else {
    const e = kit.ease.inOut(kit.clamp((u - 1.05) / 2.3));
    A.x = kit.lerp(Sx, rx, e); A.y = kit.lerp(Sy, ry, e) + 1.5 * Math.sin(Math.PI * e);
    A.tilt = TILT * (1 - e); A.jaw = kit.lerp(0.03, restJaw, e); A.lure = 1 - 0.2 * e;
    A.eye = 1 - kit.smoothstep(1.05, 1.6, u);
  }
}
/** Where the mouth bites for a boundary: the changed minute numeral(s). */
function target(o, n) {
  if (o[2] !== n[2]) return [32, 136];
  const s = SLOTS[3];
  return [s[0] + s[2] / 2, s[1] + s[3] / 2 + 2];
}
/** The whale's head, u s after the hour: [x, y]. */
const WHALE_V = 72;
const whaleHead = (u) => { const y = 34 + WHALE_V * u; return [16 + 26 * (y / H), y]; };

const angler = { x: 0, y: 0, tilt: 0, jaw: 0, lure: 0, t: 0, eye: 0 };
const EAT0 = 0.05, GROW0 = 1.0, GROWS = 1.5;

// marine snow
const NS = 130, snowX = new Float32Array(NS), snowY = new Float32Array(NS), snowV = new Float32Array(NS);
for (let i = 0; i < NS; i++) { snowX[i] = kit.hash(i, 1) * 66 - 1; snowY[i] = kit.hash(i, 2) * 200; snowV[i] = 1.4 + 2.4 * kit.hash(i, 3); }

export default {
  name: 'Abyss',
  blurb: 'a glowing siphonophore hangs through the tower budding the time; an anglerfish inhales each minute, a sperm whale dives on the hour',
  layouts: ['hub-tall3'], look: 'smoke', fps: 60, brightness: 0.35, dither: true,
  frame(ctx) {
    const G = kit.grid(ctx);
    if (!G || G.w !== W || G.h !== H) return;
    const ms = ctx.date.getTime(), now = ms / 1000;
    const lt = now - 1.75e9;                       // continuous phase for life motion
    const M = Math.floor(now / 60) * 60, age = now - M;
    const cur = digitsOf(ms), prev = digitsOf((M - 60) * 1000), next = digitsOf((M + 60) * 1000);
    const dim = 1 - 0.7 * ctx.night;
    const hourNow = cur.slice(2) === '00', hourNext = next.slice(2) === '00';

    // ---- water: depth gradient, light shafts (a table along the slant), the surface ceiling
    for (let q = 0; q < SHAFT.length; q++) {
      const xs = q / 10;
      const s1 = 0.5 + 0.5 * Math.sin(xs * 0.23 + lt * 0.45), s2 = 0.5 + 0.5 * Math.sin(xs * 0.11 - lt * 0.27 + 1.7);
      const sh = s1 * s2; SHAFT[q] = sh * sh;
    }
    for (let y = 0; y < H; y++) {
      const r0 = bgR[y], g0 = bgG[y], b0 = bgB[y], k = sunY[y], row = y * W;
      for (let x = 0; x < W; x++) {
        const p = 3 * (row + x);
        let r = r0, g = g0, b = b0;
        if (y < 100) {
          const ray = SHAFT[((x + y * 0.42) * 10) | 0] * k;
          r += 0.02 * ray; g += 0.14 * ray; b += 0.2 * ray;
        }
        if (y < 3) {
          const rip = 0.5 + 0.5 * Math.sin(x * 0.55 + lt * 1.3) * Math.sin(x * 0.21 - lt * 0.8 + y);
          const a = (3 - y) / 3;
          r += 0.12 * rip * a; g += 0.34 * rip * a; b += 0.44 * rip * a;
        }
        img[p] = r * dim; img[p + 1] = g * dim; img[p + 2] = b * dim;
        glow[row + x] = 0; halo[row + x] = 0; bud[row + x] = 0;
      }
    }
    // the sea floor: dim silt mounds
    for (let x = 0; x < W; x++) {
      const top = 186 + 1.5 * Math.sin(x * 0.2) + Math.sin(x * 0.53);
      for (let y = Math.ceil(top); y < H; y++) {
        const p = 3 * (y * W + x), n = (kit.hash(x, y) * 0.5 + 0.5) * dim;
        img[p] += 0.014 * n; img[p + 1] += 0.010 * n; img[p + 2] += 0.008 * n;
      }
    }

    // ---- the hour: where is the whale?
    const uh = hourNow ? age : hourNext ? age - 60 : 99;
    const whaleOn = uh > -1.8 && uh < 5;

    // ---- the colony's numerals
    for (let j = 0; j < 4; j++) {
      const changed = cur[j] !== prev[j];
      const a = dim;
      if (!changed || age > 3.3) {
        drawNumeral(j, +cur[j], REST_M, 1, 0, 0, 0, a, lt, -1);
        continue;
      }
      if (hourNow) {
        // the whale swallows the old numeral as its head passes, it regrows behind the flukes
        const [hx, hy] = whaleHead(age);
        // regrows as soon as the great head has passed its slot
        const sy = SLOTS[j][1], tail = (sy + SLOTS[j][3] - 34) / WHALE_V;
        if (age < tail) drawNumeral(j, +prev[j], EAT, 0, hx, hy, age - (sy - 34) / WHALE_V + 0.15, a, lt, sy);
        else drawNumeral(j, +cur[j], GROW, kit.ease.inOut(kit.clamp((age - tail) / 0.9)), 0, 0, 0, a, lt, -1);
      } else {
        const [tx, ty] = target(prev, cur);
        if (j < 2 || age < GROW0) {
          // hours never change off the hour; the minutes go into the angler's mouth
          if (age < GROW0) drawNumeral(j, +prev[j], EAT, 0, tx, ty, age - EAT0, a, lt, -1);
        }
        if (age >= GROW0) drawNumeral(j, +cur[j], GROW, kit.ease.inOut(kit.clamp((age - GROW0) / GROWS)), 0, 0, 0, a, lt, -1);
      }
    }
    // the stem: from the swimming bells down the spine, a stalk to each numeral
    const fx = 32 + 0.8 * Math.sin(lt * 0.5 + 0.4), bob = 0.6 * Math.sin(lt * 1.6), fy = 6 + bob;
    let py = SPINE_TOP + bob, pxx = spineX(py, lt);
    drawStem(fx, fy + 3, fx, fy + 20, pxx, py, dim, lt, 0, 0.12);
    for (let k = 1; k <= 13; k++) {
      const y = SPINE_TOP + bob + ((SPINE_END - SPINE_TOP) * k) / 13, x = spineX(y, lt);
      drawStem(pxx, py, (pxx + x) / 2, (py + y) / 2, x, y, dim, lt, py, 0.05 * (1 - 0.5 * (k / 13)));
      pxx = x; py = y;
    }
    for (let j = 0; j < 4; j++) {
      const ax = att[2 * j], ay = att[2 * j + 1], sy = ay - 9, sx = spineX(sy, lt);
      drawStem(sx, sy, (sx + ax) / 2, sy - 1, ax, ay, dim, lt, sy, 0.16);
    }

    // the float and the swimming bells (nectophores): a stack of glassy bells
    // under the surface, pumping in a travelling wave; this is the colony's engine
    addSplat(fx, fy, 3.2, 0.6 * dim, 0.14 * dim, 0.04 * dim);
    addSplat(fx - 0.8, fy - 1, 1.3, 0.5 * dim, 0.4 * dim, 0.3 * dim);
    for (let b = 0; b < 5; b++) {
      const ph = lt * 2.6 - b * 0.9, pump = Math.max(0, Math.sin(ph)) ** 2;
      const side = b % 2 ? 1 : -1;
      const bx = fx + side * (4.2 - 0.5 * pump) + 0.4 * Math.sin(lt * 0.5 + b), by = fy + 9 + b * 5.4;
      const rx = 5.2 - 1.2 * pump, ry = 3.4 + 0.5 * pump;
      for (let q = 0; q < 26; q++) {
        const an = (q / 26) * kit.TAU, cs = Math.cos(an), sn = Math.sin(an);
        const oa = side > 0 ? an : Math.abs(an - Math.PI);
        const open = (side > 0 ? Math.min(an, kit.TAU - an) : oa) < 0.55 ? 0.15 : 1;  // the mouth faces out
        const lit = 0.55 + 0.45 * Math.max(0, -sn);
        maxSplat(glass, bx + rx * cs, by + ry * sn, 1.15, open * lit * dim * (0.75 + 0.5 * pump));
      }
      // the inner canal, and a puff of water out of the bell on each pump
      maxSplat(glass, bx - side * 1.2, by - 0.4, 1.8, 0.35 * dim);
      if (pump > 0.2) addSplat(bx + side * (rx + 2 + 3 * pump), by, 1.6, 0.01 * pump * dim, 0.04 * pump * dim, 0.06 * pump * dim);
    }
    for (let q = 0; q < W * 40; q++) {
      const v = glass[q];
      if (v <= 0.002) continue;
      const p = 3 * q;
      img[p] += 0.12 * v; img[p + 1] += 0.26 * v; img[p + 2] += 0.3 * v;
      glass[q] = 0;
    }

    // the angler's belly glows with what it ate
    let mealGlow = 0;
    if (!hourNow && cur !== prev) mealGlow = kit.smoothstep(0.4, 1.1, age) * (1 - kit.smoothstep(4, 14, age));

    // ---- light the colony into the image (blue-green light, warm zooids)
    for (let q = 0; q < W * H; q++) {
      const v = glow[q], hv = halo[q], bv = bud[q];
      if (v <= 0.002 && hv <= 0.002 && bv <= 0.002) continue;
      const p = 3 * q, hot = v > 0.62 ? (v - 0.62) * (v - 0.62) * 1.6 : 0;
      img[p] += v * 0.03 + hot * 0.7 + hv * 0.02 + bv * 0.95;
      img[p + 1] += v * 0.5 + hot * 0.6 + hv * 0.16 + bv * 0.32;
      img[p + 2] += v * 0.95 + hot * 0.25 + hv * 0.34 + bv * 0.06;
    }

    // ---- marine snow, sunlit near the top and lit by the colony below
    for (let i = 0; i < NS; i++) {
      const y = ((snowY[i] + lt * snowV[i]) % 200 + 200) % 200 - 4;
      const x = snowX[i] + 1.4 * Math.sin(lt * 0.35 + i * 1.7);
      const yi = Math.floor(y), xi = Math.floor(x);
      if (yi < 0 || yi >= H - 1 || xi < 0 || xi >= W - 1) continue;
      const near = halo[yi * W + xi] * 2.5 + glow[yi * W + xi] * 0.3;
      const a = (0.025 + 0.45 * sunY[yi] + near) * dim * (0.6 + 0.4 * kit.hash(i, 9));
      const fx2 = x - xi, fy2 = y - yi;
      const w00 = (1 - fx2) * (1 - fy2), w10 = fx2 * (1 - fy2), w01 = (1 - fx2) * fy2, w11 = fx2 * fy2;
      const P0 = 3 * (yi * W + xi), P1 = P0 + 3 * W;
      const cr = 0.5 * a, cg = 0.75 * a, cb = 0.85 * a;
      img[P0] += cr * w00; img[P0 + 1] += cg * w00; img[P0 + 2] += cb * w00;
      img[P0 + 3] += cr * w10; img[P0 + 4] += cg * w10; img[P0 + 5] += cb * w10;
      img[P1] += cr * w01; img[P1 + 1] += cg * w01; img[P1 + 2] += cb * w01;
      img[P1 + 3] += cr * w11; img[P1 + 4] += cg * w11; img[P1 + 5] += cb * w11;
    }

    // ---- the anglerfish
    let u, tg, hr;
    if (age > 57) { u = age - 60; tg = target(cur, next); hr = hourNext; }
    else { u = age; tg = target(prev, cur); hr = hourNow; }
    anglerPose(angler, u, tg[0], tg[1], hr, lt);
    angler.meal = mealGlow * dim;
    drawAngler(img, W, H, angler, dim);

    // ---- the sperm whale, over everything
    if (whaleOn) {
      const [hx, hy] = whaleHead(uh), [hx2, hy2] = whaleHead(uh + 0.1);
      const ux = hx2 - hx, uy = hy2 - hy, l = Math.hypot(ux, uy);
      drawWhale(img, W, H, hx, hy, ux / l, uy / l, lt, light, dim);
      // clicks: thin rings of sound ahead of the head
      for (let k = 0; k < 8; k++) {
        const tc = uh - (-1.6 + k * 0.6);
        if (tc < 0 || tc > 0.6) continue;
        const [cx0, cy0] = whaleHead(uh - tc);
        const rad = 3 + tc * 70, a = 0.07 * (1 - tc / 0.6) * dim;
        const y0 = Math.max(0, Math.floor(cy0 - rad - 2)), y1 = Math.min(H - 1, Math.ceil(cy0 + rad + 2));
        for (let y = y0; y <= y1; y++) for (let x = 0; x < W; x++) {
          const dd = Math.abs(Math.hypot(x - cx0, y - cy0) - rad);
          if (dd > 1.4 || y < cy0) continue;
          const f = (1 - dd / 1.4) * a, p = 3 * (y * W + x);
          img[p] += 0.5 * f; img[p + 1] += 0.9 * f; img[p + 2] += f;
        }
      }
    }

    kit.blitGrid(ctx, img);
  },
};
