// Papercut: a backlit cut-paper pop-up book. Every layer is a sheet of
// translucent paper over a lamp, so a place is as dark as the number of
// sheets in front of it. The hours are cut as two limestone towers rising
// out of a lake (Guilin karst); the minutes are pop-up cards standing on the
// near shore; a rainbow tissue frog in round glasses lives on a lily pad.
// The view drifts, so the layers slide over each other (parallax); the sky
// behind is the time of day, with a sun or a cut-out moon glowing through
// the paper. Minute: the frog leaps onto the card that is about to change,
// its weight folds the card flat, it hops home and the new card springs up.
// Hour: the page turns. The old page lifts round the spine and the next
// spread's pop-ups stand up underneath.
import * as kit from '../js/kit.js';
import { glyphMask } from './papercut-glyphs.js';

const W = 64, H = 64, N = W * H;
const HZ = 35.5;                 // far shore: the towers stand on it
const HINGE = 58.2;              // near shore: the minute cards' fold line
const HOUR_GLYPH = { W: 17, H: 26, x: [12.5, 34.5] };
const MIN_GLYPH = { W: 11, H: 17, x: [14.5, 28.5] };
const PAD = { x: 52.5, y: 54.8 };
const FROG_S = 1.3;                          // the frog is 14 px across            // the lily pad, where the frog sits
const D = 150;                               // eye distance (px) for the folds
const TURN = 3.0;                            // the page turn, seconds
const { clamp, smoothstep, hash, lerp } = kit;
const easeIO = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const pad2 = (n) => String(n).padStart(2, '0');

// ---------------------------------------------------------------- paper
// Transmittance of each sheet (linear, per channel).
const T_CLOUD = [0.74, 0.72, 0.70];
const T_FAR = [0.34, 0.40, 0.52];
const T_MID = [0.20, 0.23, 0.30];
const T_TOWER = [0.09, 0.11, 0.16];
const T_WATER = [0.50, 0.60, 0.68];
const T_CARD = [0.07, 0.065, 0.06];
const T_PAD = [0.30, 0.55, 0.10];
const T_REFL = [0.55, 0.62, 0.72];
const LAMP = kit.hex('#ffd9a0');              // the bulb above, on cut edges

// The sky paper by hour: [hour, top sRGB, horizon sRGB].
const SKY = [
  [0, '#22367c', '#5a74b4'], [4.6, '#24387e', '#5e78b6'], [5.6, '#3c4a90', '#d07a98'],
  [6.6, '#5c82cc', '#ffb48e'], [8.2, '#3f86d6', '#9ccaf0'], [12, '#2f78d6', '#a6d2f4'],
  [16, '#4c8ada', '#ffe2b4'], [17.8, '#4e50a8', '#ff9248'], [19.0, '#30347e', '#b45c78'],
  [20.4, '#22347a', '#5a70b0'], [24, '#22367c', '#5a74b4'],
].map(([h, a, b]) => [h, kit.hex(a), kit.hex(b)]);
function skyAt(hour) {
  let k = 0;
  while (SKY[k + 1][0] < hour) k++;
  const [h0, a0, b0] = SKY[k], [h1, a1, b1] = SKY[k + 1], f = smoothstep(0, 1, (hour - h0) / (h1 - h0));
  return [kit.mix(a0, a1, f), kit.mix(b0, b1, f)];
}
/** 0 by day .. 1 in the dark: how much the stars and the moon show. */
const darkAt = (hour) => 1 - smoothstep(5.2, 6.6, hour) * (1 - smoothstep(18.6, 20.0, hour));

// ---------------------------------------------------------------- glyphs
const masks = new Map();
function mask(kind, ch) {
  const key = kind + ch;
  if (!masks.has(key)) {
    masks.set(key, kind === 'h'
      ? glyphMask(ch, HOUR_GLYPH.W, HOUR_GLYPH.H, { wv: 4.9, wh: 3.7, rough: 0.12, seed: +ch + 1, pad: 3, bush: 0.85 })
      : glyphMask(ch, MIN_GLYPH.W, MIN_GLYPH.H, { wv: 3.1, wh: 2.5 }));
  }
  return masks.get(key);
}
for (let k = 0; k < 10; k++) { mask('h', String(k)); mask('m', String(k)); }   // all twenty, once, at load

// --------------------------------------------------------------- buffers
const VA = new Float32Array(3 * N), VB = new Float32Array(3 * N), OUT = new Float32Array(3 * N);
const ridge = new Float32Array(W * 4);
const subZ = new Float32Array(H * 4), subK = new Float32Array(H * 4);
const ROWC = new Float32Array(3 * H);

// ----------------------------------------------------------- layer ops
/**
 * A sheet whose top edge is the heightfield `ridge` (per quarter column)
 * and which runs down to y = bottom. Coverage by 4 sub-columns.
 */
function sheetHF(V, top, bottom, T, rimA) {
  const y0 = Math.max(0, Math.floor(top)), y1 = Math.min(H, Math.ceil(bottom));
  const t0 = 1 - T[0], t1 = 1 - T[1], t2 = 1 - T[2];
  for (let y = y0; y < y1; y++) {
    const lo = y, hi = Math.min(y + 1, bottom);
    for (let x = 0; x < W; x++) {
      let c = 0, rim = 0;
      for (let s = 0; s < 4; s++) {
        const r = ridge[x * 4 + s];
        const a = hi - (r > lo ? r : lo);
        if (a > 0) c += a;
        const e = y + 0.5 - r;                       // the cut edge catches the lamp
        if (e > -0.5 && e < 1.6) rim += 1 - Math.abs(e - 0.55) / 1.05;
      }
      if (c <= 0) continue;
      c *= 0.25;
      const p = 3 * (y * W + x);
      V[p] *= 1 - c * t0; V[p + 1] *= 1 - c * t1; V[p + 2] *= 1 - c * t2;
      if (rimA && rim > 0) {
        const k = rimA * rim * 0.25;
        V[p] += LAMP[0] * k; V[p + 1] += LAMP[1] * k; V[p + 2] += LAMP[2] * k;
      }
    }
  }
}

/**
 * A cut-paper glyph standing on a hinge at y = hb (the bottom of its ink
 * box), its left ink edge at gx, folded back by phi (radians; negative
 * leans toward the viewer). 4 x 4 samples a pixel through the perspective.
 */
function sheetMask(V, M, gx, hb, phi, T, rimA, faceA = 0) {
  const cp = Math.cos(phi), sp = Math.sin(phi);
  if (cp <= 0.02) return 0;
  const Hh = M.H, cx = gx + M.W / 2;
  const kTop = D / (D + Hh * sp);
  const topY = hb - Hh * cp * kTop - 1;
  const y0 = Math.max(0, Math.floor(Math.min(topY, hb - Hh - M.pad))), y1 = Math.min(H, Math.ceil(hb + 0.5));
  // per sub-row: source row in the mask and the perspective scale
  for (let j = y0 * 4; j < y1 * 4; j++) {
    const sy = (j + 0.5) / 4, hp = hb - sy;
    const den = D * cp - hp * sp;
    if (den <= 0) { subZ[j] = -1; continue; }
    const z = (hp * D) / den;
    subZ[j] = z; subK[j] = 1 / (D / (D + z * sp));
  }
  const kMax = Math.max(1, kTop);
  const half = (M.W / 2 + M.pad) * kMax + 1;
  const x0 = Math.max(0, Math.floor(cx - half)), x1 = Math.min(W, Math.ceil(cx + half));
  const t0 = 1 - T[0], t1 = 1 - T[1], t2 = 1 - T[2], mw = M.mw, mh = M.mh, data = M.data, pad = M.pad;
  const face = faceA * sp;                         // the face turns up into the lamp light
  let any = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      let c = 0, rim = 0;
      for (let jj = 0; jj < 4; jj++) {
        const j = y * 4 + jj, z = subZ[j];
        if (z < 0 || z > Hh + pad) continue;
        const row = Math.floor((pad + Hh - z) * 4);
        if (row < 0 || row >= mh) continue;
        const ik = subK[j], base = row * mw;
        for (let ii = 0; ii < 4; ii++) {
          const sx = x + (ii + 0.5) / 4;
          const col = Math.floor((pad + (sx - cx) * ik + M.W / 2) * 4);
          if (col < 0 || col >= mw) continue;
          const v = data[base + col];
          if (v) { c++; if (v === 2) rim++; }
        }
      }
      if (!c) continue;
      any = 1;
      const a = c / 16, p = 3 * (y * W + x);
      V[p] *= 1 - a * t0; V[p + 1] *= 1 - a * t1; V[p + 2] *= 1 - a * t2;
      const k = (rimA * rim) / 16 + face * a;
      if (k > 0) { V[p] += LAMP[0] * k; V[p + 1] += LAMP[1] * k; V[p + 2] += LAMP[2] * k; }
    }
  }
  return any;
}

// ------------------------------------------------------------------ frog
// Rainbow tissue, 11 px wide: absorbance (1 - T) by height, feet to eyes.
const RAINBOW = [];
for (let k = 0; k < 48; k++) {
  const c = kit.hsv(0.0 + (k / 47) * 0.8, 0.75, 0.95);   // blue feet .. red .. green head
  RAINBOW.push(1 - c[0] * 0.85, 1 - c[1] * 0.85, 1 - c[2] * 0.85);
}
/** Frog paper at local (lx, ly), feet at 0, up negative: 0 none, 1 paper, 2 cut (lens, smile). */
function frogTex(lx, ly, legs, blink, look) {
  const ax = lx < 0 ? -lx : lx, side = lx < 0 ? -1 : 1;
  const ex = ax - 2.85, ey = ly + 9.35, e2 = ex * ex + ey * ey;
  if (e2 < 5.5) {                                     // eye bump with a round lens cut in it
    if (blink || e2 > 2.5) return 1;
    const px = lx - side * 2.85 - look * 0.55, py = ey - 0.1;
    return px * px + py * py < 0.62 ? 1 : 2;
  }
  const hy = ly + 7.0;
  if (lx * lx / 26 + hy * hy / 9.6 < 1) {
    const my = -6.25 + 0.75 * (1 - (lx / 3.2) ** 2);
    return ax < 3.2 && Math.abs(ly - my) < 0.3 ? 2 : 1;
  }
  const by = ly + 3.6;
  if (lx * lx / 16 + by * by / 12 < 1) return 1;                 // body, a waist under the head
  const hx = ax - 4.6, hh = ly + 1.5;
  if (hx * hx / 5.3 + hh * hh / 2.6 < 1) return 1;               // folded back legs, splayed
  const fx = ax - 1.9, fy = ly + 0.45;
  if (fx * fx / 1.4 + fy * fy / 0.45 < 1) return 1;              // front feet
  const tx = ax - 2.4, ty = ly + 2.0;
  if (Math.abs(tx + ty * 0.25) < 0.55 && ty < 0.5 && ty > -2.6) return 1;   // front legs
  if (legs > 0.05) {                                  // back legs kicked out in a leap
    const bx = 4.6 + 1.3 * legs, byy = -2.0 + 5.5 * legs;
    const qx = ax - 4.3, qy = ly + 2.2, dx = bx - 4.3, dy = byy + 2.2;
    const t = clamp((qx * dx + qy * dy) / (dx * dx + dy * dy));
    const rx = qx - t * dx, ry = qy - t * dy;
    if (rx * rx + ry * ry < 0.75) return 1;
  }
  return 0;
}
function sheetFrog(V, F, rimA) {
  const { x: fx, y: fy, legs, blink, look } = F, ssx = F.sx * FROG_S, ssy = F.sy * FROG_S;
  const x0 = Math.max(0, Math.floor(fx - 7.5 * ssx)), x1 = Math.min(W, Math.ceil(fx + 7.5 * ssx));
  const y0 = Math.max(0, Math.floor(fy - 12.2 * ssy)), y1 = Math.min(H, Math.ceil(fy + 1 + 4 * legs));
  const isx = 1 / ssx, isy = 1 / ssy;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    let a0 = 0, a1 = 0, a2 = 0, n = 0, top = 0;
    for (let jj = 0; jj < 4; jj++) {
      const ly = (y + (jj + 0.5) / 4 - fy) * isy;
      for (let ii = 0; ii < 4; ii++) {
        const lx = (x + (ii + 0.5) / 4 - fx) * isx;
        const rb = 3 * clamp(Math.floor(((lx + 6.5) / 13) * 47), 0, 47);
        const v = frogTex(lx, ly, legs, blink, look);
        if (v !== 1) continue;
        n++;
        // the tissue sits in a frame of black card, like every cut-paper figure
        const o = 0.75;
        if (frogTex(lx + o, ly, legs, blink, look) !== 1 || frogTex(lx - o, ly, legs, blink, look) !== 1 ||
            frogTex(lx, ly + o, legs, blink, look) !== 1 || frogTex(lx, ly - o, legs, blink, look) !== 1) { a0 += 0.94; a1 += 0.94; a2 += 0.94; }
        else { a0 += RAINBOW[rb]; a1 += RAINBOW[rb + 1]; a2 += RAINBOW[rb + 2]; }
        if (jj === 0 && frogTex(lx, ly - 0.7 * isy, legs, blink, look) !== 1) top++;
      }
    }
    if (!n) continue;
    const p = 3 * (y * W + x);
    V[p] *= 1 - a0 / 16; V[p + 1] *= 1 - a1 / 16; V[p + 2] *= 1 - a2 / 16;
    if (top) { const k = (rimA * top) / 4; V[p] += LAMP[0] * k; V[p + 1] += LAMP[1] * k; V[p + 2] += LAMP[2] * k; }
  }
}

// ------------------------------------------------------------- the page
// Each hour is a new page of the book: its own hills, reeds, clouds, slits.
const pages = new Map();
function page(hi) {
  if (pages.has(hi)) return pages.get(hi);
  const r = (k) => hash(hi, k, 77);
  const humps = [
    [-3 + 8 * r(1), 17 + 4 * r(2), 7 + 2 * r(3)], [58 + 8 * r(4), 16 + 5 * r(5), 7 + 3 * r(6)],
    [8 + 6 * r(7), 24 + 3 * r(8), 5 + 2 * r(9)], [50 + 6 * r(10), 23 + 4 * r(11), 5 + 2 * r(12)],
    [24 + 16 * r(13), 27 + 2 * r(14), 9 + 3 * r(15)],
  ];
  const reeds = [];
  for (let k = 0; k < 9; k++) reeds.push([0.6 + 10.5 * r(20 + k) ** 1.3, 4 + 11 * r(40 + k), 0.55 + 0.25 * r(60 + k), r(80 + k) * 6]);
  for (let k = 0; k < 6; k++) reeds.push([63.4 - 7 * r(100 + k) ** 1.3, 3 + 9 * r(120 + k), 0.55 + 0.25 * r(140 + k), r(160 + k) * 6]);
  for (let k = 0; k < 7; k++) reeds.push([40 + 9 * r(180 + k), 1 + 2.2 * r(200 + k), 0.5, r(220 + k) * 6]);
  const slits = [];
  for (let k = 0; k < 30; k++) {
    const u = (k + 0.5) / 30, y = Math.floor(HZ + 1 + 20.5 * u ** 1.5);
    slits.push([y, r(300 + k) * (W + 24), 1.6 + 7 * u * (0.5 + r(330 + k)), (r(360 + k) < 0.5 ? -1 : 1) * (0.12 + 0.3 * u), r(390 + k) * 6]);
  }
  const clouds = [];
  for (let k = 0; k < 3; k++) clouds.push([r(400 + k) * 94, 4.5 + 4.6 * k + 1.5 * r(410 + k), 0.75 + 0.45 * r(420 + k), 0.12 + 0.12 * r(430 + k)]);
  const mids = [[2 + 5 * r(500), 12 + 5 * r(501), 4.2 + r(502)], [60 - 4 * r(503), 13 + 6 * r(504), 4 + r(505)], [-4 + 3 * r(506), 22 + 4 * r(507), 4]];
  const pg = { humps, mids, reeds, slits, clouds, seed: r(0) * 6 };
  pages.set(hi, pg);
  if (pages.size > 4) pages.delete(pages.keys().next().value);
  return pg;
}

const CLOUD = [[-5, 0, 2.6], [-1.5, -1.7, 3.4], [2.5, -0.9, 3.0], [5.6, 0.3, 2.1]];
function sheetClouds(V, pg, now, off, pop, rimA) {
  if (pop <= 0) return;
  for (const [x0, cy, s, v] of pg.clouds) {
    const cx = ((x0 + now * v + off) % 94 + 94) % 94 - 15, bot = cy + 1.8 * s;
    const ya = Math.max(0, Math.floor(cy - 5.5 * s)), yb = Math.min(H, Math.ceil(bot + 1));
    const xa = Math.max(0, Math.floor(cx - 8.5 * s)), xb = Math.min(W, Math.ceil(cx + 8.5 * s));
    for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++) {
      const px = x + 0.5, py = y + 0.5;
      let d = py - bot;
      let dc = 1e9, up = 0;
      for (const [ox, oy, rr] of CLOUD) {
        const e = Math.hypot(px - cx - ox * s, py - cy - oy * s) - rr * s;
        if (e < dc) { dc = e; up = py < cy + oy * s ? 1 : 0; }
      }
      d = Math.max(d, dc);
      const c = clamp(0.5 - d) * pop;
      if (c <= 0) continue;
      const p = 3 * (y * W + x);
      V[p] *= 1 - c * (1 - T_CLOUD[0]); V[p + 1] *= 1 - c * (1 - T_CLOUD[1]); V[p + 2] *= 1 - c * (1 - T_CLOUD[2]);
      const k = rimA * up * clamp(1 - Math.abs(d + 0.6) / 0.8) * pop;
      if (k > 0) { V[p] += LAMP[0] * k; V[p + 1] += LAMP[1] * k; V[p + 2] += LAMP[2] * k; }
    }
  }
}

const HOLE = new Float32Array(N);
function sheetWater(V, pg, now, off, refl) {
  const ya = Math.floor(HZ);
  HOLE.fill(0, ya * W);
  for (const [y, x0, len, v, ph] of pg.slits) {
    const cx = ((x0 + now * v + off) % (W + 24) + W + 24) % (W + 24) - 12;
    const half = 0.5 * len * (0.7 + 0.3 * Math.sin(now * 0.8 + ph));
    const a = cx - half, b = cx + half;
    for (let x = Math.max(0, Math.floor(a)); x < Math.min(W, Math.ceil(b)); x++) {
      const ov = Math.min(x + 1, b) - Math.max(x, a);
      if (ov > 0) HOLE[y * W + x] += 0.85 * ov;
    }
  }
  for (let y = ya; y < H; y++) {
    const rc = clamp(y + 1 - HZ);
    for (let x = 0; x < W; x++) {
      const open = 1 - Math.min(1, HOLE[y * W + x]), c = rc * open;
      const p = 3 * (y * W + x);
      V[p] *= 1 - c * (1 - T_WATER[0]); V[p + 1] *= 1 - c * (1 - T_WATER[1]); V[p + 2] *= 1 - c * (1 - T_WATER[2]);
      if (refl && y < HZ + REFL_H + 1) {
        const a = open * reflAt(refl, x, y, now);
        if (a > 0) { V[p] *= 1 - a * (1 - T_REFL[0]); V[p + 1] *= 1 - a * (1 - T_REFL[1]); V[p + 2] *= 1 - a * (1 - T_REFL[2]); }
      }
    }
  }
}

// The towers' reflection: their mirrored feet, squashed and rippled, cut
// from a paler sheet laid on the water.
const REFL_H = 6;
function reflAt(refl, x, y, now) {
  const z = (y + 0.5 - HZ) / 0.23;                 // height up the tower
  if (z < 0) return 0;
  const wob = 0.7 * Math.sin(y * 1.9 - now * 1.6) + 0.3 * Math.sin(y * 3.3 + now * 2.3);
  let n = 0;
  for (const [M, gx, phi] of refl) {
    const zz = z / Math.max(0.05, Math.cos(phi));
    if (zz > M.H + M.pad) continue;
    const row = Math.floor((M.pad + M.H - zz) * 4);
    if (row < 0 || row >= M.mh) continue;
    for (let ii = 0; ii < 4; ii++) {
      const col = Math.floor((M.pad + x + (ii + 0.5) / 4 - gx + wob) * 4);
      if (col >= 0 && col < M.mw && M.data[row * M.mw + col]) n++;
    }
  }
  return Math.min(1, n / 4) * (1 - smoothstep(0, REFL_H, y + 0.5 - HZ) * 0.6);
}

function sheetPad(V, cx, cy, pop) {
  if (pop <= 0) return;
  const rx = 9, ry = 1.7 * pop;
  for (let y = Math.max(0, Math.floor(cy - ry - 1)); y < Math.min(H, Math.ceil(cy + ry + 1)); y++)
    for (let x = Math.max(0, Math.floor(cx - rx - 1)); x < Math.min(W, Math.ceil(cx + rx + 1)); x++) {
      let n = 0;
      for (let jj = 0; jj < 4; jj++) for (let ii = 0; ii < 4; ii++) {
        const dx = x + (ii + 0.5) / 4 - cx, dy = y + (jj + 0.5) / 4 - cy;
        if ((dx / rx) ** 2 + (dy / ry) ** 2 < 1 && !(dx > 1 && Math.abs(dy + 0.3) < (dx - 1) * 0.3)) n++;
      }
      if (!n) continue;
      const a = n / 16, p = 3 * (y * W + x);
      V[p] *= 1 - a * (1 - T_PAD[0]); V[p + 1] *= 1 - a * (1 - T_PAD[1]); V[p + 2] *= 1 - a * (1 - T_PAD[2]);
    }
}

// ------------------------------------------------------------ the lamp
// The sky paper lit from behind: gradient, a sun or a cut-out moon that
// glows through every sheet in front of it, pinhole stars, and the lake.
const SUN = kit.hex('#fff0c8'), MOON = [0.80, 0.88, 1.0];
const STARS = Array.from({ length: 46 }, (_, k) => [Math.floor(hash(k, 1, 9) * W), Math.floor(hash(k, 2, 9) ** 1.4 * (HZ - 6)), hash(k, 3, 9)]);
function backlight(V, hour, dark, now) {
  const [top, hor] = skyAt(hour);
  for (let y = 0; y < H; y++) {
    let c;
    if (y + 0.5 < HZ) c = kit.mix(top, hor, ((y + 0.5) / HZ) ** 1.5);
    else c = kit.scale(kit.mix(hor, top, 0.2 + 0.6 * ((y + 0.5 - HZ) / (H - HZ))), 0.9);
    ROWC[3 * y] = c[0]; ROWC[3 * y + 1] = c[1]; ROWC[3 * y + 2] = c[2];
    for (let x = 0; x < W; x++) { const p = 3 * (y * W + x); V[p] = c[0]; V[p + 1] = c[1]; V[p + 2] = c[2]; }
  }
  // the light in the sky: a sun by day, a crescent by night, on one arc
  const day = hour >= 6 && hour < 18;
  const a = (((day ? hour - 6 : (hour + 6) % 24)) / 12) * Math.PI;
  const bx = 32 - 27 * Math.cos(a), by = 34 - 26 * Math.sin(a);
  const vis = smoothstep(0, 0.35, Math.min(a, Math.PI - a));
  const col = day ? SUN : MOON, glow = day ? 0.32 : 0.10, disc = day ? 1.3 : 0.75;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = 3 * (y * W + x), dx = x + 0.5 - bx, dy = y + 0.5 - by, d2 = dx * dx + dy * dy;
    let k = 0;
    if (y + 0.5 < HZ) {
      k = glow * Math.exp(-d2 / 70);
      let inD = clamp(3.4 - Math.sqrt(d2) + 0.5);
      if (!day && inD > 0) { const ex = dx - 1.6, ey = dy + 1.1; inD *= 1 - clamp(2.9 - Math.sqrt(ex * ex + ey * ey) + 0.5); }
      k += disc * inD;
    } else {
      // its column of light on the water, for the slits to catch
      const ddx = (x + 0.5 - bx) / (1.6 + 0.12 * (y - HZ));
      k = (day ? 0.55 : 0.3) * Math.exp(-ddx * ddx) * (1 - 0.6 * (y - HZ) / (H - HZ)) * smoothstep(-10, 20, by);
    }
    k *= vis;
    if (k > 0.002) { V[p] += col[0] * k; V[p + 1] += col[1] * k; V[p + 2] += col[2] * k; }
  }
  if (dark > 0.02) for (const [sx, sy, h] of STARS) {
    const tw = 0.55 + 0.45 * Math.sin(now * (1.1 + 2.3 * h) + 40 * h);
    const k = dark * (0.12 + 0.35 * h) * tw, p = 3 * (sy * W + sx);
    V[p] += 0.85 * k; V[p + 1] += 0.9 * k; V[p + 2] += k;
  }
}

// ------------------------------------------------------------- a scene
/** Horizontal drift of the eye, px at the nearest layer. */
const view = (now) => 2.4 * Math.sin((kit.TAU * now) / 57) + 0.9 * Math.sin((kit.TAU * now) / 21 + 1.3);

function farRidge(pg, off, pop) {
  const s0 = pg.seed;
  for (let k = 0; k < W * 4; k++) {
    const xs = (k + 0.5) / 4 - off;
    let r = 31.6 + 1.5 * Math.sin(xs * 0.21 + s0) + 0.9 * Math.sin(xs * 0.53 + 2 * s0);
    for (const [hx, ht, hw] of pg.humps) {
      const u = Math.abs(xs - hx) / hw;
      if (u < 1) { const y = ht + (HZ - ht) * u ** 4; if (y < r) r = y; }
    }
    ridge[k] = HZ - (HZ - r) * pop;
  }
}
function midRidge(pg, off, pop) {
  for (let k = 0; k < W * 4; k++) {
    const xs = (k + 0.5) / 4 - off;
    let r = 99;
    for (const [hx, ht, hw] of pg.mids) {
      const u = Math.abs(xs - hx) / hw;
      if (u < 1) { const y = ht + (HZ + 0.5 - ht) * u ** 2.4 + 0.6 * Math.sin(xs * 2.1 + hx); if (y < r) r = y; }
    }
    ridge[k] = HZ - (HZ - Math.min(r, HZ + 1)) * pop;
  }
}
const SWAY = new Float32Array(64);
function fgRidge(pg, off, now, pop) {
  const s0 = pg.seed, R = pg.reeds;
  for (let j = 0; j < R.length; j++) SWAY[j] = R[j][0] + 0.5 * Math.sin(now * 0.9 + R[j][3]) * (R[j][1] / 12);
  for (let k = 0; k < W * 4; k++) {
    const xs = (k + 0.5) / 4 - off;
    let r = 59.4 + 0.7 * Math.sin(xs * 0.31 + s0) + 0.5 * Math.sin(xs * 0.9 + s0 * 3);
    for (let j = 0; j < R.length; j++) {
      const rh = R[j][1], rw = R[j][2];
      const u = Math.abs(xs - SWAY[j]) / rw;
      if (u < 1) { const y = 59.6 - rh * (1 - u) ** 0.8; if (y < r) r = y; }
    }
    ridge[k] = H - (H - r) * pop;
  }
}

/**
 * Draw one page into V. S: { pg, hh, cards: [[ch, phi], [ch, phi]], frog, pop, hour, dark, now, lampK }.
 * pop: how far each pop-up layer stands (1 = up, 0 = flat on the page).
 */
function scene(V, S) {
  const { pg, now, pop, lampK } = S, v = view(now);
  backlight(V, S.hour, S.dark, now);
  sheetClouds(V, pg, now, v * 0.12, pop.far, 0.05 * lampK);
  farRidge(pg, v * 0.3, pop.far);
  sheetHF(V, 10, HZ, T_FAR, 0.05 * lampK);
  midRidge(pg, v * 0.36, pop.far);
  sheetHF(V, 8, HZ, T_MID, 0.06 * lampK);
  const tphi = (1 - pop.tower) * Math.PI / 2;
  for (let k = 0; k < 2; k++)
    sheetMask(V, mask('h', S.hh[k]), HOUR_GLYPH.x[k] + v * 0.42, HZ, tphi, T_TOWER, 0.14 * lampK, 0.06 * lampK);
  const refl = [0, 1].map((k) => [mask('h', S.hh[k]), HOUR_GLYPH.x[k] + v * 0.42, tphi]);
  sheetWater(V, pg, now, v * 0.6, refl);
  const bob = 0.25 * Math.sin(now * 1.3 + pg.seed);
  sheetPad(V, PAD.x + v * 0.85, PAD.y + bob, pop.frog);
  for (let k = 0; k < 2; k++) {
    const [ch, phi] = S.cards[k];
    if (ch == null) continue;
    const ph = phi + (1 - pop.card) * Math.PI / 2;
    sheetMask(V, mask('m', ch), MIN_GLYPH.x[k] + v * 0.85, HINGE, ph, T_CARD, 0.14 * lampK, 0.08 * lampK);
  }
  if (pop.frog > 0) {
    const F = { ...S.frog };
    F.x += v * 0.85;
    if (F.onPad) F.y += bob;
    F.sy *= pop.frog;
    sheetFrog(V, F, 0.12 * lampK);
  }
  fgRidge(pg, v, now, pop.fg);
  sheetHF(V, 40, H, [0, 0, 0], 0.09 * lampK);
}

// ------------------------------------------------------- the minute turn
const CARD_TOP = HINGE - MIN_GLYPH.H;
const PAD_FEET = PAD.y - 0.6;
const cardTopY = (phi) => HINGE - MIN_GLYPH.H * Math.cos(phi) * D / (D + MIN_GLYPH.H * Math.sin(phi));
/** Where the frog lands to fold the slots that change from a to b. */
function landX(a, b) {
  const both = a[0] !== b[0];
  return both ? (MIN_GLYPH.x[0] + MIN_GLYPH.x[1] + MIN_GLYPH.W) / 2 : MIN_GLYPH.x[1] + MIN_GLYPH.W / 2;
}
const oldPhi = (r) => (Math.PI / 2) * clamp((r - 0.05) / 0.7) ** 2;          // falls under the frog
const newPhi = (r) => (Math.PI / 2) * (1 - kit.ease.outBack(clamp((r - 1.05) / 0.9)));   // springs up
function idleFrog(now) {
  const blink = kit.fract(now / 4.3 + 0.37) < 0.04 || kit.fract(now / 7.9) < 0.03;
  return { x: PAD.x, y: PAD_FEET, sx: 1, sy: 1 + 0.035 * Math.sin(now * 3.1), legs: 0, blink, look: Math.sin(now * 0.37) * 0.8, onPad: true };
}
function hop(F, ax, ay, bx, by, u, high) {
  F.x = lerp(ax, bx, u); F.y = lerp(ay, by, u) - high * 4 * u * (1 - u);
  F.sx = 0.92; F.sy = 1.12; F.legs = (1 - u) ** 1.5; F.onPad = false;
}
/** Cards and frog on the current page, r seconds into the minute. */
function minuteState(now, r, prev, cur, next) {
  const cards = [[cur[2], 0], [cur[3], 0]], F = idleFrog(now);
  if (r < 1.95 && prev[2] + prev[3] !== cur[2] + cur[3] && cur.slice(2) !== '00') {
    for (let k = 0; k < 2; k++) {
      if (prev[2 + k] === cur[2 + k]) continue;
      cards[k] = r < 1.0 ? [prev[2 + k], oldPhi(r)] : [cur[2 + k], newPhi(r)];
      if (r < 1.05 && r >= 0.75) cards[k][0] = null;
    }
    const lx = landX(prev.slice(2), cur.slice(2));
    if (r < 0.75) {
      F.x = lx; F.y = cardTopY(oldPhi(r)) - 0.2; F.onPad = false; F.look = 0;
      const sq = 1 - 0.18 * Math.exp(-r * 12); F.sy = sq; F.sx = 2 - sq;
    } else if (r < 0.9) {
      F.x = lx; F.y = HINGE - 0.6; F.sy = 0.82; F.sx = 1.1; F.onPad = false;
    } else if (r < 1.45) {
      hop(F, lx, HINGE - 0.6, PAD.x, PAD_FEET, (r - 0.9) / 0.55, 6);
    } else if (r < 1.7) {
      const sq = 1 - 0.18 * Math.exp(-(r - 1.45) * 14); F.sy = sq; F.sx = 2 - sq;
    }
  }
  if (r >= 59.0 && next.slice(2) !== '00') {
    const lx = landX(cur.slice(2), next.slice(2));
    F.look = -1;
    if (r < 59.4) { const c = smoothstep(59.0, 59.3, r); F.sy = 1 - 0.18 * c; F.sx = 1 + 0.1 * c; }
    else hop(F, PAD.x, PAD_FEET, lx, CARD_TOP - 0.2, (r - 59.4) / 0.6, 7);
  }
  return { cards, frog: F };
}

// --------------------------------------------------------- the hour turn
/** The old page A lifts round the spine (x = 0) and B shows underneath. */
function turnPage(O, A, B, p) {
  const th = 1.68 * Math.min(1, (p / 0.62) ** 2.2), ct = Math.cos(th), st = Math.sin(th), cx = W / 2, cy = H / 2, Dp = 150;
  const uAt = (xs) => { const den = Dp * ct + (xs - cx) * st; return den > 0 ? (Dp * xs) / den : 1e9; };
  const xe = cx + (W * ct - cx) * Dp / (Dp - W * st);
  for (let x = 0; x < W; x++) {
    const u = uAt(x + 0.5), u0 = uAt(x), u1 = uAt(x + 1);
    const fa = u0 >= W ? 0 : u1 <= W ? 1 : clamp((W - u0) / (u1 - u0));
    const k = Dp / (Dp - Math.min(u, W) * st), dv = 1 / k;
    const shadow = x + 0.5 > xe ? 1 - 0.55 * st * Math.exp(-(x + 0.5 - xe) / 6) : 1;
    const shade = 1 - 0.5 * st + 0.25 * st * smoothstep(W - 3, W, u);
    const uu = clamp(u - 0.5, 0, W - 1.001), ui = Math.floor(uu), uf = uu - ui;
    for (let y = 0; y < H; y++) {
      const p3 = 3 * (y * W + x);
      let a = 0;
      let r0 = 0, r1 = 0, r2 = 0;
      if (fa > 0) {
        const v = cy + (y + 0.5 - cy) / k;
        a = fa * clamp((Math.min(v + dv / 2, H) - Math.max(v - dv / 2, 0)) / dv);
        if (a > 0) {
          const vv = clamp(v - 0.5, 0, H - 1.001), vi = Math.floor(vv), vf = vv - vi;
          const q00 = 3 * (vi * W + ui), q10 = q00 + 3, q01 = q00 + 3 * W, q11 = q01 + 3;
          const w00 = (1 - uf) * (1 - vf), w10 = uf * (1 - vf), w01 = (1 - uf) * vf, w11 = uf * vf;
          r0 = (A[q00] * w00 + A[q10] * w10 + A[q01] * w01 + A[q11] * w11) * shade;
          r1 = (A[q00 + 1] * w00 + A[q10 + 1] * w10 + A[q01 + 1] * w01 + A[q11 + 1] * w11) * shade;
          r2 = (A[q00 + 2] * w00 + A[q10 + 2] * w10 + A[q01 + 2] * w01 + A[q11 + 2] * w11) * shade;
        }
      }
      const b = (1 - a) * shadow;
      O[p3] = r0 * a + B[p3] * b; O[p3 + 1] = r1 * a + B[p3 + 1] * b; O[p3 + 2] = r2 * a + B[p3 + 2] * b;
    }
  }
}
const rise = (p, at) => kit.ease.outBack(clamp((p - at) / 0.3));

// ---------------------------------------------------------------- face
const UP = { far: 1, tower: 1, card: 1, frog: 1, fg: 1 };
export default {
  name: 'Papercut',
  blurb: 'backlit pop-up book: hours are karst towers in a lake, minutes are cards a rainbow frog folds flat; the hour turns the page',
  layouts: ['hub'], look: 'smoke', fps: 60, brightness: 0.45, dither: true,
  frame(ctx) {
    const d = ctx.date, now = d.getTime() / 1000;
    const hour = d.getHours() + d.getMinutes() / 60 + kit.secOf(d) / 3600;
    const dark = darkAt(hour), lampK = 0.55 + 0.45 * (1 - dark);
    const M = Math.floor(now / 60) * 60, r = now - M;
    const fmt = (t) => { const e = new Date(t * 1000); return pad2(e.getHours()) + pad2(e.getMinutes()); };
    const prev = fmt(M - 60), cur = fmt(M), next = fmt(M + 60);
    const inHour = d.getMinutes() * 60 + kit.secOf(d);
    const hi = Math.floor((now - inHour) / 3600 + 0.5);
    const base = { now, hour, dark, lampK };
    let V;
    if (inHour < TURN) {
      const p = inHour / TURN;
      scene(VA, { ...base, pg: page(hi - 1), hh: prev, cards: [[prev[2], 0], [prev[3], 0]], frog: idleFrog(now), pop: UP });
      // the next spread lies flat under the lifting page; its pop-ups spring
      // up once the old page has gone, so old and new are never seen together
      const pop = { far: rise(p, 0.5), tower: rise(p, 0.55), card: rise(p, 0.6), frog: rise(p, 0.68), fg: rise(p, 0.46) };
      scene(VB, { ...base, pg: page(hi), hh: cur, cards: [[cur[2], 0], [cur[3], 0]], frog: idleFrog(now), pop });
      turnPage(OUT, VA, VB, p);
      V = OUT;
    } else {
      const st = minuteState(now, r, prev, cur, next);
      scene(VA, { ...base, pg: page(hi), hh: cur, cards: st.cards, frog: st.frog, pop: UP });
      V = VA;
    }
    const dim = 1 - 0.4 * ctx.night;
    kit.blitGrid(ctx, V, dim);
  },
};
