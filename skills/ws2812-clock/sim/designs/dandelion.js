// Dandelion clock: the folk game of telling the hour by blowing a seed head.
// A bunch of four dandelions rises from one rosette at the foot of the tall
// tower; each head is a numeral, its seeds (a stalk and a glowing pappus)
// packed along the strokes. A breeze sways the stems and the seeds tremble;
// now and then one lets go and parachutes up the tower. At the minute a gust
// strips the changing head, its seeds cloud away upward, and the bare stalk
// tip blooms a yellow floret numeral that closes and fluffs into the new
// seeds. The meadow below lives through the hour (bald, yellow, clock) and
// on the hour the whole meadow lets go: a great drift fills the sky while
// every head re-flowers gold. Time of day sets the light.
import * as kit from '../js/kit.js';
import { GLYPHS } from './dandelion-glyphs.js';

const W = 64, H = 128, N = W * H;
const CORE = kit.hex('#ffe2b0'), ACH = kit.hex('#a8642a'); // the achenes: warm brown seed bodies on the receptacle
const img = new Float32Array(3 * N);
const pad = (n) => String(n).padStart(2, '0');
const digitsOf = (d) => pad(d.getHours()) + pad(d.getMinutes());

// ---------------------------------------------------------------- drawing
let CR = 0, CG = 0, CB = 0; // current colour, set before dot()/soft()
function dot(x, y, a) {
  if (x < 0 || y < 0 || x >= W - 1 || y >= H - 1) return;
  const xi = x | 0, yi = y | 0, fx = x - xi, fy = y - yi;
  let p = 3 * (yi * W + xi), w = a * (1 - fx) * (1 - fy);
  img[p] += CR * w; img[p + 1] += CG * w; img[p + 2] += CB * w;
  w = a * fx * (1 - fy); img[p + 3] += CR * w; img[p + 4] += CG * w; img[p + 5] += CB * w;
  p += 3 * W;
  w = a * (1 - fx) * fy; img[p] += CR * w; img[p + 1] += CG * w; img[p + 2] += CB * w;
  w = a * fx * fy; img[p + 3] += CR * w; img[p + 4] += CG * w; img[p + 5] += CB * w;
}
/** A soft tuft about 2 px across. */
function soft(x, y, a, r = 0.75) {
  dot(x, y, a * 0.6);
  const q = a * 0.1;
  dot(x - r, y, q); dot(x + r, y, q); dot(x, y - r, q); dot(x, y + r, q);
}
const col = (c) => { CR = c[0]; CG = c[1]; CB = c[2]; };

// ---------------------------------------------------------------- palette
const P = (top, hor, light, grass, sun) => ({ top: kit.hex(top), hor: kit.hex(hor), light: kit.hex(light), grass: kit.hex(grass), sun: kit.hex(sun) });
const KEYS = [ // hour of day -> sky
  [0, P('#000106', '#03060e', '#c8d6ff', '#020703', '#c9d4ff')],
  [5.0, P('#000106', '#03060e', '#c8d6ff', '#020703', '#c9d4ff')],
  [6.6, P('#050208', '#3a1a04', '#ffd690', '#081304', '#ffb040')],
  [9.0, P('#010614', '#0b1e3c', '#fff6e8', '#0b1a05', '#fff0c0')],
  [16.5, P('#010614', '#0b1e3c', '#fff6e8', '#0b1a05', '#fff0c0')],
  [19.0, P('#080210', '#3a0a22', '#ffc8d8', '#0a0c06', '#ff7048')],
  [20.6, P('#000106', '#03060e', '#c8d6ff', '#020703', '#c9d4ff')],
  [24, P('#000106', '#03060e', '#c8d6ff', '#020703', '#c9d4ff')],
];
function palette(hf) {
  let k = 0;
  while (KEYS[k + 1][0] <= hf) k++;
  const [h0, a] = KEYS[k], [h1, b] = KEYS[k + 1], t = kit.smoothstep(0, 1, (hf - h0) / (h1 - h0));
  const m = (f) => kit.mix(a[f], b[f], t);
  return { top: m('top'), hor: m('hor'), light: m('light'), grass: m('grass'), sun: m('sun') };
}
/** 0 at night, 1 in daylight (sun up). */
const dayness = (hf) => kit.smoothstep(5.6, 7.0, hf) * (1 - kit.smoothstep(19.2, 20.6, hf));

// ---------------------------------------------------------------- scene
// four heads: box origin, scale, stem control, swing phase
const SLOTS = [
  { ox: 5.5, oy: 21, s: 1.06, cx: 30.5, cy: 72, ph: 0.0 },
  { ox: 37.2, oy: 25, s: 1.06, cx: 33.5, cy: 76, ph: 1.7 },
  { ox: 8.6, oy: 70, s: 0.9, cx: 26, cy: 116, ph: 3.1 },
  { ox: 37.6, oy: 73, s: 0.9, cx: 38, cy: 116, ph: 4.6 },
];
const ROOT_X = 32, ROOT_Y = 125;
// meadow clocks in the grass: x, head y, radius, hour offset (min)
const PUFFS = [
  [4, 111, 2.6, 2], [12.5, 106, 3.0, 9], [21, 117, 2.4, 5], [44, 117, 2.5, 11],
  [52.5, 107, 3.0, 0], [60, 113, 2.6, 7],
];
const PUFF_SEEDS = 18;

function wind(t) { return 0.55 * (kit.noise2(t * 0.23, 3.1) - 0.5) + 0.35 * (kit.noise2(t * 0.61, 8.7) - 0.5); }
/** The minute's gust, 0..1 envelope over the first seconds of the minute. */
function gust(age, hour) {
  const g = age < 0 ? 0 : age < 0.35 ? kit.smoothstep(0, 0.35, age) : Math.exp(-(age - 0.35) / (hour ? 1.6 : 0.8));
  return (hour ? 1.6 : 1) * g;
}
/** Head pose at absolute time t: offset dx, dy and rotation about the stem tip. */
function pose(s, t, g) {
  const S = SLOTS[s], w = wind(t - s * 0.15);
  const amp = s < 2 ? 1.6 : 1.0;
  const dx = amp * (w * 2.2 + 0.25 * Math.sin(t * 1.3 + S.ph)) + g * (s < 2 ? 2.4 : 1.6);
  const rot = 0.035 * (w * 2 + 0.3 * Math.sin(t * 1.1 + S.ph)) + g * 0.05;
  return [dx, Math.abs(dx) * 0.08, rot];
}

// static ground: rosette of toothed leaves, made once (intensity mask 0..1)
const leaf = new Float32Array(N);
(() => {
  const leaves = [[-2.75, 22], [-2.35, 17], [-0.6, 21], [-0.35, 16], [-2.0, 13], [-1.05, 14]];
  for (const [a, L] of leaves) {
    for (let u = 0; u <= 1; u += 0.02) {
      const tooth = 0.55 + 0.45 * kit.fract(u * 5.5);
      const wd = L * 0.2 * Math.sin(Math.PI * Math.min(1, u * 1.15)) * tooth;
      const bx = ROOT_X + Math.cos(a) * L * u, by = ROOT_Y + 1 + Math.sin(a) * L * u * 0.55;
      for (let v = -1; v <= 1; v += 0.15) {
        const x = Math.round(bx - Math.sin(a) * wd * v * 0.55), y = Math.round(by + Math.cos(a) * wd * v);
        if (x >= 0 && x < W && y >= 0 && y < H) leaf[y * W + x] = Math.max(leaf[y * W + x], 0.55 + 0.45 * (1 - Math.abs(v)) * (Math.abs(v) < 0.2 ? 1.4 : 1));
      }
    }
  }
})();
// grass blades: base x, height, phase
const BLADES = Array.from({ length: 46 }, (_, i) => [kit.hash(i, 1) * 66 - 1, 4 + kit.hash(i, 2) * 10, kit.hash(i, 3) * 6.28]);

// ---------------------------------------------------------------- the minute's events
// Flights: seeds that leave. Stored flat in typed arrays per minute.
const F = 14; // x0 y0 dx dy len rel gust h1 h2 h3 kind
function makeMinute(M) {
  const prev = digitsOf(new Date((M - 1) * 60000)), next = digitsOf(new Date(M * 60000));
  const hour = next.slice(2) === '00';
  const fl = [];
  const slots = [];
  const T0 = M * 60;
  for (let s = 0; s < 4; s++) {
    const S = SLOTS[s], change = hour || prev[s] !== next[s];
    const strip = change ? (hour ? 0.12 + 0.1 * (s & 1) + (s < 2 ? 0.12 : 0) : 0.1 + 0.18 * (s & 1)) : -1;
    const grow = change ? strip + (hour ? 0.75 : 0.7) : -1;
    const gNew = GLYPHS[+next[s]], gOld = GLYPHS[+prev[s]];
    const rel = new Float32Array(gNew.n).fill(1e9);
    const push = (g, k, r, gk, kind, lift = 0) => {
      const tt = T0 + r, [dx, dy, rot] = pose(s, tt, gust(r, hour));
      const c = Math.cos(rot), sn = Math.sin(rot);
      // receptacle point and direction, rotated about the stem tip
      const ux = (g.rx[k] - g.ax) * S.s, uy = (g.ry[k] - g.ay) * S.s;
      const bx = S.ox + g.ax * S.s + ux * c - uy * sn + dx, by = S.oy + g.ay * S.s + ux * sn + uy * c + dy;
      const ddx = g.dx[k] * c - g.dy[k] * sn, ddy = g.dx[k] * sn + g.dy[k] * c, L = g.len[k] * S.s;
      fl.push(bx + ddx * L, by + ddy * L, ddx, ddy, L, r, gk, g.h1[k], g.h2[k], g.h3[k], kind, lift, 0, 0);
    };
    if (change) {
      for (let k = 0; k < gOld.n; k++) {
        const tipx = S.ox + gOld.rx[k] * S.s;
        push(gOld, k, strip + 0.4 * (tipx / W) + 0.2 * gOld.h1[k], hour ? 0.32 : 1, 0, hour ? 18 + 50 * gOld.h3[k] : 0);
      }
    } else {
      for (let k = 0; k < gNew.n; k++) {
        if (kit.hash(M, s * 977 + k, 7) < 0.05) { rel[k] = 0.15 + 0.3 * ((S.ox + gNew.rx[k] * S.s) / W) + 0.1 * gNew.h2[k]; push(gNew, k, rel[k], 0.6, 0); }
      }
    }
    // the trickle: a few seeds let go during the minute
    for (let j = 0; j < 4; j++) {
      const k = Math.floor(kit.hash(M, s, 40 + j) * gNew.n), r = 5 + 35 * kit.hash(M, s, 50 + j);
      if (rel[k] < 1e8 || (change && r < grow + 4)) continue;
      rel[k] = r; push(gNew, k, r, 0, 0);
    }
    slots.push({ change, strip, grow, old: gOld, cur: gNew, rel, hour });
  }
  // meadow clocks
  const mm = new Date(M * 60000).getMinutes();
  const puffRel = [];
  PUFFS.forEach(([x, y, r, off], p) => {
    const rr = new Float32Array(PUFF_SEEDS).fill(1e9);
    const full = hour || puffStage(mm, off).puff >= 1;
    for (let k = 0; k < PUFF_SEEDS; k++) {
      const a = (k / PUFF_SEEDS) * kit.TAU + p, dx = Math.cos(a), dy = Math.sin(a) * 0.9 - 0.1;
      let t = 1e9;
      if (hour) t = 0.25 + 0.6 * (x / W) + 0.5 * kit.hash(p, k, 3);
      else if (full && kit.hash(M, p * 50 + k, 9) < 0.1) t = 2 + 55 * kit.hash(M, p * 50 + k, 10);
      if (t > 1e8) continue;
      rr[k] = t;
      fl.push(x + dx * r, y + dy * r, dx, dy, r * 0.9, t, hour ? 0.3 : 0.05, kit.hash(p, k, 4), kit.hash(p, k, 5), kit.hash(p, k, 6), 1, hour ? 30 + 60 * kit.hash(p, k, 7) : 0, 0, 0);
    }
    puffRel.push(rr);
  });
  // the great drift: seeds from the meadow beyond the board
  if (hour) {
    for (let k = 0; k < 230; k++) {
      const h1 = kit.hash(M, k, 21), h2 = kit.hash(M, k, 22), h3 = kit.hash(M, k, 23);
      const fromLeft = k % 3 !== 0;
      const x0 = fromLeft ? -3 - 4 * h1 : 6 + 58 * h1, y0 = fromLeft ? 20 + 108 * h2 : 131 + 3 * h2;
      fl.push(x0, y0, 1, -0.3, 2 + 1.4 * h3, 0.2 + 7.5 * kit.hash(M, k, 24) ** 1.3, 0, h1, h2, h3, 2, fromLeft ? 0 : 20 + 30 * h1, 0, 0);
    }
  }
  return { M, slots, puffRel, hour, mm, fl: Float32Array.from(fl), nf: fl.length / F };
}
const minutes = new Map();
function minute(M) {
  let m = minutes.get(M);
  if (!m) {
    m = makeMinute(M); minutes.set(M, m);
    for (const k of minutes.keys()) if (k < M - 2 || k > M + 2) minutes.delete(k);
  }
  return m;
}

/** A meadow clock's life through the hour (minutes since the hour, its offset). */
function puffStage(mm, off) {
  const m = mm - off * 0.5;
  return {
    bud: kit.smoothstep(3, 7, m) * (1 - kit.smoothstep(34, 40, m)),
    flower: kit.smoothstep(7, 11, m) * (1 - kit.smoothstep(28, 33, m)),
    puff: kit.smoothstep(36, 44, m),
  };
}

// ---------------------------------------------------------------- flight
function drawFlights(m, age, tint, gain, nowAbs) {
  const fl = m.fl;
  for (let f = 0; f < m.nf; f++) {
    const o = f * F, a = age - fl[o + 5];
    if (a <= 0 || a > 30) continue;
    const h1 = fl[o + 7], h2 = fl[o + 8], h3 = fl[o + 9], gk = fl[o + 6], kind = fl[o + 10];
    const e1 = 1 - Math.exp(-a / 0.35), e2 = 1 - Math.exp(-a / 0.6);
    let x = fl[o] + fl[o + 2] * 1.4 * e1, y = fl[o + 1] + fl[o + 3] * 1.4 * e1;
    // gust push, then the slow float: drift with the breeze, rise and fall
    // the gust: a hard shove up and downwind, spread so the cloud opens out
    // on the hour the updraft swirls: some seeds are thrown back upwind
    const side = fl[o + 11] > 0 && h3 < 0.42 ? -0.75 : 1;
    x += gk * ((44 + 52 * h2) * e2 * side + (h1 - 0.5) * 12 * e1);
    y -= gk * ((1 + 9 * h3) * e2 + (h2 - 0.45) * 7 * e1);
    // a slow lift (the hour's updraft), and the flock's steady crossing
    y -= fl[o + 11] * (1 - Math.exp(-a / 2.5));
    if (kind === 2) x += (5 + 9 * h3) * a;
    const ph1 = 6.28 * h3, ph2 = 6.28 * h2;
    x += (1.2 + 2.4 * h2) * a + 2.4 * (Math.sin(0.8 * a * (0.7 + 0.6 * h1) + ph1) - Math.sin(ph1)) + 1.5 * wind(nowAbs) * Math.min(a, 3);
    y -= (2.0 + 4.0 * h1) * (a - 1.5 * gk * (1 - Math.exp(-a / 1.5))) + 2.2 * (Math.sin(1.25 * a * (0.8 + 0.5 * h3) + ph2) - Math.sin(ph2));
    if (x < -4 || x > W + 4 || y < -4 || y > H + 4) continue;
    // the stalk turns to hang below its parachute, tumbling a little
    const th0 = Math.atan2(-fl[o + 3], -fl[o + 2]);
    let dth = Math.PI / 2 - th0; dth -= kit.TAU * Math.round(dth / kit.TAU);
    const th = th0 + dth * (1 - Math.exp(-a / 0.7)) + 0.55 * Math.sin(2.3 * a + 6.28 * h1) * Math.min(1, a);
    const L = fl[o + 4], sx = Math.cos(th), sy = Math.sin(th);
    const fade = Math.min(1, a * 4) * (1 - kit.smoothstep(24, 30, a));
    const glint = 0.7 + 0.45 * Math.max(0, Math.sin(1.7 * a + 6.28 * h2));
    const v = gain * fade * glint * (kind === 2 ? 0.6 + 0.4 * h1 : (gk < 0.5 && gk > 0.1 ? 0.55 : 0.6 + 0.4 * Math.min(1, a / 3)));
    if (kind === 2) { // far seeds: smaller, hazier, no visible stalk
      CR = tint[0] * 0.8; CG = tint[1] * 0.85; CB = tint[2]; dot(x, y, 0.42 * v);
      continue;
    }
    col(tint); soft(x, y, 0.85 * v);
    CR = tint[0] * 0.5; CG = tint[1] * 0.45; CB = tint[2] * 0.4;
    dot(x + sx * L * 0.5, y + sy * L * 0.5, 0.16 * v);
    CR = 0.5; CG = 0.3; CB = 0.12;
    dot(x + sx * L, y + sy * L, 0.22 * v);
  }
}

// ---------------------------------------------------------------- heads
function drawHead(s, sl, age, t, gu, pal, gain, light) {
  const S = SLOTS[s], [dx, dy, rot] = pose(s, t, gu), c = Math.cos(rot), sn = Math.sin(rot);
  const hour = sl.hour, T = light;
  // phases of a changing slot
  let oldOn = 0, wither = 0, reveal = 1, bloom = 0, fluff = 1;
  if (sl.change && age < 8) {
    oldOn = age < sl.strip + 1.0 ? 1 : 0;
    wither = kit.clamp((age - sl.strip - 0.3) / 0.45);
    const gs = sl.grow;
    reveal = kit.clamp((age - gs) / 0.7);
    const hold = hour ? 3.2 : 0.3;
    bloom = kit.smoothstep(gs, gs + 0.35, age) * (1 - kit.smoothstep(gs + 0.7 + hold, gs + 1.5 + hold, age));
    fluff = kit.ease.inOut(kit.clamp((age - gs - 0.5 - hold) / (hour ? 1.4 : 0.95)));
  }
  const draw = (g, mode) => {
    // mode 0: current digit; 1: old digit (stripping)
    const ax = S.ox + g.ax * S.s, ay = S.oy + g.ay * S.s;
    const pivX = ax + dx, pivY = ay + dy;
    // receptacle: a faint stalk-tip line
    const recA = mode === 1 ? (1 - wither) : reveal;
    if (recA > 0) {
      for (let k = 0; k < g.spine.length; k += 2) {
        const ux = (g.spine[k] - g.ax) * S.s, uy = (g.spine[k + 1] - g.ay) * S.s;
        const d = Math.hypot(ux, uy) / (36 * S.s);
        const vis = mode === 1 ? kit.clamp((1 - wither) * 1.6 - d * 0.6) : kit.clamp(reveal * 1.5 - d);
        if (vis <= 0) continue;
        const x = pivX + ux * c - uy * sn, y = pivY + ux * sn + uy * c;
        // the receptacle packed with achenes: a warm, crisp core line
        const core = mode === 1 ? 0.06 : 0.06 + 0.3 * fluff;
        CR = CORE[0]; CG = CORE[1]; CB = CORE[2]; dot(x, y, core * vis * gain);
        if (mode === 0 && bloom > 0) {
          // florets: a yellow numeral
          const f = bloom * kit.clamp(reveal * 1.5 - d) * (0.8 + 0.2 * Math.sin(t * 3 + k));
          CR = 1; CG = 0.45; CB = 0.02; soft(x, y, 0.45 * f * gain, 0.8);
          CR = 1; CG = 0.4; CB = 0.0; dot(x, y, 0.1 * f * gain);
        }
      }
    }
    if (mode === 1) return; // old seeds are drawn by their own release-aware loop
    for (let k = 0; k < g.n; k++) {
      let a = 1;
      const r = sl.rel[k];
      if (age >= r) a = kit.smoothstep(r + 10, r + 22, age);
      if (sl.change && age < 8) {
        const ux = (g.rx[k] - g.ax) * S.s, uy = (g.ry[k] - g.ay) * S.s;
        const d = Math.hypot(ux, uy) / (36 * S.s);
        // the flower: yellow ligules open along each seed's direction, then close
        const pet = bloom * kit.clamp(reveal * 1.5 - d);
        if (pet > 0.01) {
          const bx = pivX + ux * c - uy * sn, by = pivY + ux * sn + uy * c;
          const ddx = g.dx[k] * c - g.dy[k] * sn, ddy = g.dx[k] * sn + g.dy[k] * c;
          const pl = Math.min(g.len[k] * S.s, 2.6) * (0.35 + 0.65 * pet);
          const sh = gain * pet * (0.7 + 0.3 * g.h2[k]);
          CR = 1; CG = 0.5; CB = 0.02; dot(bx + ddx * pl * 0.45, by + ddy * pl * 0.45, 0.32 * sh);
          CR = 1; CG = 0.78; CB = 0.12; dot(bx + ddx * pl, by + ddy * pl, 0.42 * sh);
        }
        a *= kit.clamp(fluff * 1.6 - d * 0.6);
      }
      if (a <= 0.01) continue;
      const h1 = g.h1[k], h2 = g.h2[k];
      const ux = (g.rx[k] - g.ax) * S.s, uy = (g.ry[k] - g.ay) * S.s;
      const bx = pivX + ux * c - uy * sn, by = pivY + ux * sn + uy * c;
      const ddx = g.dx[k] * c - g.dy[k] * sn, ddy = g.dx[k] * sn + g.dy[k] * c;
      const grow = mode === 0 && sl.change ? 0.35 + 0.65 * a : 1;
      const L = g.len[k] * S.s * grow;
      // tremble in the breeze
      const tr = (0.22 + 0.5 * gu) * Math.sin(t * (5 + 4 * h1) + 6.28 * h2);
      const tx = bx + ddx * L - ddy * tr, ty = by + ddy * L + ddx * tr;
      const lit = 0.6 + 0.9 * Math.max(0, ddx * T[0] + ddy * T[1]) ** 1.5;
      const v = gain * a * lit * (0.45 + 1.0 * h1 * h1) * (0.8 + 0.4 * Math.sin(t * (2 + 3 * h2) + 9 * h1) ** 3);
      CR = ACH[0]; CG = ACH[1]; CB = ACH[2];
      dot(bx + (tx - bx) * 0.12, by + (ty - by) * 0.12, 0.22 * gain * a);
      CR = pal.light[0] * 0.3; CG = pal.light[1] * 0.3; CB = pal.light[2] * 0.3;
      dot(bx + (tx - bx) * 0.4, by + (ty - by) * 0.4, 0.1 * v);
      dot(bx + (tx - bx) * 0.7, by + (ty - by) * 0.7, 0.16 * v);
      const yel = mode === 0 && sl.change ? 1 - a : 0;
      CR = pal.light[0]; CG = pal.light[1] * (1 - 0.35 * yel); CB = pal.light[2] * (1 - 0.9 * yel);
      dot(tx, ty, 0.68 * v);
      dot(tx - ddy * 0.9, ty + ddx * 0.9, 0.12 * v); dot(tx + ddy * 0.9, ty - ddx * 0.9, 0.12 * v);
    }
  };
  if (sl.change && oldOn && age < sl.strip + 1.0) {
    // old seeds still attached until their release
    const g = sl.old;
    const ax = S.ox + g.ax * S.s, ay = S.oy + g.ay * S.s;
    for (let k = 0; k < g.n; k++) {
      const r = sl.strip + 0.4 * ((S.ox + g.rx[k] * S.s) / W) + 0.2 * g.h1[k];
      if (age >= r) continue;
      const ux = (g.rx[k] - g.ax) * S.s, uy = (g.ry[k] - g.ay) * S.s;
      const bx = ax + dx + ux * c - uy * sn, by = ay + dy + ux * sn + uy * c;
      const ddx = g.dx[k] * c - g.dy[k] * sn, ddy = g.dx[k] * sn + g.dy[k] * c, L = g.len[k] * S.s;
      const lit = 0.6 + 0.9 * Math.max(0, ddx * T[0] + ddy * T[1]) ** 1.5;
      const v = gain * lit * (0.45 + 0.9 * g.h1[k] * g.h1[k]);
      CR = ACH[0]; CG = ACH[1]; CB = ACH[2];
      dot(bx + ddx * L * 0.12, by + ddy * L * 0.12, 0.22 * gain);
      CR = pal.light[0] * 0.3; CG = pal.light[1] * 0.3; CB = pal.light[2] * 0.3;
      dot(bx + ddx * L * 0.4, by + ddy * L * 0.4, 0.1 * v);
      dot(bx + ddx * L * 0.7, by + ddy * L * 0.7, 0.16 * v);
      const tx = bx + ddx * L, ty = by + ddy * L;
      col(pal.light); dot(tx, ty, 0.68 * v);
      dot(tx - ddy * 0.9, ty + ddx * 0.9, 0.12 * v); dot(tx + ddy * 0.9, ty - ddx * 0.9, 0.12 * v);
    }
    draw(sl.old, 1);
  }
  if (!sl.change || age >= sl.grow) draw(sl.cur, 0);
  return [S.ox + sl.cur.ax * S.s + dx, S.oy + sl.cur.ay * S.s + dy, S.ox + sl.old.ax * S.s + dx];
}

function stem(x0, y0, cx, cy, x1, y1, a, c) {
  col(c);
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 1.6);
  for (let k = 0; k <= n; k++) {
    const t = k / n, u = 1 - t;
    dot(u * u * x0 + 2 * u * t * cx + t * t * x1, u * u * y0 + 2 * u * t * cy + t * t * y1, a);
  }
}

// ---------------------------------------------------------------- frame
export default {
  name: 'Dandelion',
  blurb: 'four seed-head numerals on one rosette; gusts strip a digit, it re-flowers gold and fluffs; the meadow lets go on the hour',
  layouts: ['hub-tall'], look: 'smoke', fps: 60, brightness: 0.35, dither: true,
  frame(ctx) {
    const G = kit.grid(ctx);
    if (!G || G.w !== W || G.h !== H) { ctx.out.fill(0); return; }
    const now = ctx.date.getTime() / 1000, M = Math.floor(now / 60), age = now - M * 60;
    const t = now % 86400;
    const d = ctx.date, hf = d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
    const pal = palette(hf), day = dayness(hf), dim = 1 - 0.55 * ctx.night;
    const m = minute(M), mp = minute(M - 1);
    const g = gust(age, m.hour);

    // sky
    for (let y = 0; y < H; y++) {
      const k = kit.smoothstep(0, 118, y) ** 1.6;
      const r = (pal.top[0] + (pal.hor[0] - pal.top[0]) * k) * dim, gg = (pal.top[1] + (pal.hor[1] - pal.top[1]) * k) * dim, b = (pal.top[2] + (pal.hor[2] - pal.top[2]) * k) * dim;
      for (let x = 0, p = 3 * y * W; x < W; x++, p += 3) { img[p] = r; img[p + 1] = gg; img[p + 2] = b; }
    }
    // sun by day, moon by night: a small disc moving across the top
    const arc = day > 0.5 ? kit.clamp((hf - 6) / 14) : kit.fract((hf - 20) / 10 + 1);
    const sx = 6 + 52 * arc, sy = 13 - 7 * Math.sin(Math.PI * arc);
    const isSun = day > 0.5;
    for (let y = Math.max(0, Math.floor(sy - 9)); y < Math.min(H, sy + 9); y++) {
      for (let x = Math.max(0, Math.floor(sx - 9)); x < Math.min(W, sx + 9); x++) {
        const r = Math.hypot(x - sx, y - sy);
        let v = (1 - kit.smoothstep(2.2, 3.2, r)) * 0.55 + 0.05 * Math.exp(-r / 3);
        if (!isSun) v *= kit.smoothstep(1.2, 2.4, Math.hypot(x - sx - 1.4, y - sy + 0.8)) * 0.9 + 0.1 * (r < 3 ? 0 : 1);
        const p = 3 * (y * W + x);
        img[p] += pal.sun[0] * v * dim; img[p + 1] += pal.sun[1] * v * dim; img[p + 2] += pal.sun[2] * v * dim;
      }
    }
    // the light direction on the seeds (towards the sun or moon)
    const LX = sx - 32, LY = sy - 64, LL = Math.hypot(LX, LY), light = [LX / LL, LY / LL];
    const gain = dim * (0.9 + 0.1 * day);
    const tint = pal.light;

    // far flights (behind the heads): kind 2 drift and the previous minute
    drawFlights(mp, age + 60, tint, gain * 0.8, now);

    // stems
    const stemC = kit.scale(kit.mix(pal.grass, [0.05, 0.12, 0.02], 0.6), 0.9 * dim);
    const tips = [];
    for (let s = 0; s < 4; s++) {
      const S = SLOTS[s], sl = m.slots[s], [dx, dy] = pose(s, t, g);
      let ax = S.ox + sl.cur.ax * S.s, ay = S.oy + sl.cur.ay * S.s;
      if (sl.change && age < sl.grow + 1) {
        const k = kit.ease.inOut(kit.clamp((age - sl.strip) / (sl.grow - sl.strip + 0.6)));
        ax = kit.lerp(S.ox + sl.old.ax * S.s, ax, k); ay = kit.lerp(S.oy + sl.old.ay * S.s, ay, k);
      }
      tips.push([ax + dx, ay + dy]);
      stem(ROOT_X, ROOT_Y, S.cx + dx * 0.4, S.cy, ax + dx, ay + dy + 0.5, 0.7, stemC);
    }
    // heads
    for (let s = 0; s < 4; s++) drawHead(s, m.slots[s], age, t, g, pal, gain, light);

    // ground: grass and rosette
    const gc = kit.scale(pal.grass, dim);
    for (const [bx, h, ph] of BLADES) {
      const sway = (wind(t - bx * 0.02) * 3 + 0.4 * Math.sin(t * 1.7 + ph) + g * 3) * h / 12;
      CR = gc[0] * 1.6; CG = gc[1] * 1.6; CB = gc[2] * 1.6;
      for (let k = 0; k <= h * 1.5; k++) {
        const u = k / (h * 1.5);
        dot(bx + sway * u * u, H - 1.2 - h * u, 0.9 * (1 - 0.5 * u));
      }
    }
    for (let p = 0; p < N; p++) {
      const l = leaf[p];
      if (l > 0) { img[3 * p] += gc[0] * 1.8 * l; img[3 * p + 1] += gc[1] * 1.8 * l; img[3 * p + 2] += gc[2] * 1.8 * l; }
    }
    // meadow clocks
    PUFFS.forEach(([x0, y0, r, off], p) => {
      const st = puffStage(m.mm, off), rr = m.puffRel[p];
      const sw = wind(t - x0 * 0.02) * 2.5 + g * 2;
      const x = x0 + sw, y = y0;
      stem(x0 - sw * 0.2, H + 1, x0, (y0 + H) / 2, x, y + 0.5, 0.7, stemC);
      if (st.bud > 0) { CR = gc[0] * 3; CG = gc[1] * 3; CB = gc[2] * 3; soft(x, y + 0.5, 0.9 * st.bud * (1 - st.flower)); }
      if (st.flower > 0) {
        CR = 1; CG = 0.55; CB = 0.03;
        for (let k = 0; k < 7; k++) { const a = k * 0.9 + t * 0.2; soft(x + Math.cos(a) * 1.3 * st.flower, y + Math.sin(a) * 1.0 * st.flower, 0.22 * st.flower * gain); }
      }
      const puff = m.hour ? 1 : st.puff;
      if (puff > 0) {
        for (let k = 0; k < PUFF_SEEDS; k++) {
          let a = puff;
          if (age >= rr[k]) a = m.hour ? 0 : a * kit.smoothstep(rr[k] + 8, rr[k] + 20, age);
          if (a <= 0) continue;
          const an = (k / PUFF_SEEDS) * kit.TAU + p, tr = 0.15 * Math.sin(t * 6 + k);
          const ex = x + Math.cos(an + tr) * r * puff, ey = y + Math.sin(an + tr) * r * 0.9 * puff;
          CR = tint[0] * 0.2; CG = tint[1] * 0.2; CB = tint[2] * 0.2; dot((x + ex) / 2, (y + ey) / 2, 0.15 * a * gain);
          col(tint); soft(ex, ey, 0.22 * a * gain);
        }
      }
    });

    // insects: a bumbling bee by day, fireflies at night
    if (day > 0.01) {
      const bt = t * 0.35;
      const bxp = 32 + 24 * Math.sin(bt) * Math.cos(bt * 0.37), byp = 100 + 9 * Math.sin(bt * 1.9) + 1.2 * Math.sin(t * 9);
      CR = 1; CG = 0.6; CB = 0.02; dot(bxp, byp, 0.5 * day * gain); dot(bxp - 0.8, byp, 0.35 * day * gain);
      CR = 0.6; CG = 0.7; CB = 0.8; dot(bxp - 0.3, byp - 1.0 - 0.3 * Math.sin(t * 60), 0.25 * day * gain);
    }
    if (day < 0.99) {
      for (let k = 0; k < 5; k++) {
        const ft = t * (0.11 + 0.03 * k) + k * 2.1;
        const fx = 32 + 28 * Math.sin(ft * 1.3 + k) , fy = 90 + 26 * Math.sin(ft * 0.9 + k * 1.7);
        const blink = kit.smoothstep(0.55, 0.95, Math.sin(t * (0.8 + 0.13 * k) + k * 1.3));
        CR = 0.5; CG = 0.9; CB = 0.1; soft(fx, fy, 0.5 * blink * (1 - day) * gain);
      }
    }

    // this minute's seeds in flight (in front)
    drawFlights(m, age, tint, gain, now);

    // tone: soft shoulder so dense seed heads keep their texture
    for (let p = 0; p < 3 * N; p++) { const v = img[p]; img[p] = v < 0.05 ? v : 1 - Math.exp(-v); }
    kit.blitGrid(ctx, img);
  },
};
