// Pop-up book artwork: the printed pages and the cut-paper scenery cards.
// Cards are baked once into small textures (colour + signed distance, so
// their cut edges anti-alias at any angle); the numeral card is procedural.
import * as kit from '../js/kit.js';
import { glyphSDF, GW, GH } from './popupbook-glyphs.js';

const C = (h) => kit.hex(h);
export const PAL = {
  paper: C('#e0d2b0'), ink: C('#3a3a6a'), text: C('#7d7a8a'),
  meadow: C('#41679a'), meadow2: C('#34558a'), path: C('#b4b0d0'), flower: C('#f2d36a'),
  pond: C('#22509a'), pond2: C('#3a70b8'), pad: C('#4f9a6a'),
  numF: C('#f4542a'), numHi: C('#ffb070'), numKey: C('#2a0c08'), grass: C('#2f6a5a'), grass2: C('#21504a'),
  back: C('#7a705e'), core: C('#fff4dc'), rim: C('#b8ac94'),
  stone: C('#5c6290'), stone2: C('#4a4f78'), roof: C('#36a6b8'), win: C('#ffd25e'), gate: C('#2a2240'),
  mill: C('#d8dce6'), mill2: C('#9aa2b8'), cap: C('#3a4a7a'), sail: C('#c9cfdc'), sailF: C('#2a3050'),
  tree: C('#245a5a'), tree2: C('#3a7a72'), trunk: C('#4a3a40'), hill: C('#2f5f6a'),
  gold: C('#f2b632'), teal: C('#2a8a8a'), moon: C('#fff1c4'),
  thread: C('#6a6458'), cloth: C('#5a1820'), block: C('#a89a80'), sky: C('#a07a9c'), sky2: C('#46508a'),
};

// ------------------------------------------------------------- SDF bits
export function sdBox(s, q, x0, y0, x1, y1) {
  const dx = Math.max(x0 - s, s - x1), dy = Math.max(y0 - q, q - y1);
  if (dx > 0 || dy > 0) return Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
  return Math.max(dx, dy);
}
export const sdCirc = (s, q, cx, cy, r) => Math.hypot(s - cx, q - cy) - r;
export function sdSeg(s, q, ax, ay, bx, by, r) { return kit.segDist(s, q, ax, ay, bx, by) - r; }
/** Convex polygon, counter-clockwise points [x, y, ...]: max of edge half-planes. */
export function sdPoly(s, q, P) {
  let m = -1e9;
  for (let i = 0; i < P.length; i += 2) {
    const ax = P[i], ay = P[i + 1], bx = P[(i + 2) % P.length], by = P[(i + 3) % P.length];
    const ex = bx - ax, ey = by - ay, l = Math.hypot(ex, ey);
    const d = ((s - ax) * ey - (q - ay) * ex) / l;   // >0 outside for CCW
    if (d > m) m = d;
  }
  return m;
}
/** Paint helper: blend `c` into o (rgb at 1..3) by the coverage of d < 0. */
function fillIf(o, d, c, aa = 0.5) { const k = kit.clamp(0.5 - d / aa); if (k > 0) { o[1] += (c[0] - o[1]) * k; o[2] += (c[1] - o[2]) * k; o[3] += (c[2] - o[3]) * k; } }

// ---------------------------------------------------------------- bake
function bake(w, h, res, fn) {
  const nx = Math.ceil(w * res) + 1, ny = Math.ceil(h * res) + 1;
  const d = new Float32Array(nx * ny), c = new Float32Array(3 * nx * ny), o = [0, 0, 0, 0];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    o[0] = 9; o[1] = o[2] = o[3] = 0;
    fn(i / res, j / res, o);
    const k = j * nx + i; d[k] = o[0]; c[3 * k] = o[1]; c[3 * k + 1] = o[2]; c[3 * k + 2] = o[3];
  }
  return { w, h, res, nx, ny, d, c };
}
export function texSDF(T, s, q) {
  const fx = s * T.res, fy = q * T.res;
  if (fx < 0 || fy < 0 || fx >= T.nx - 1 || fy >= T.ny - 1) return 3;
  const i = fx | 0, j = fy | 0, u = fx - i, v = fy - j, k = j * T.nx + i, g = T.d;
  const a = g[k], b = g[k + 1], c = g[k + T.nx], e = g[k + T.nx + 1];
  return a + (b - a) * u + (c - a) * v + (a - b - c + e) * u * v;
}
export function texRGB(T, s, q, out) {
  const fx = kit.clamp(s * T.res, 0, T.nx - 1.001), fy = kit.clamp(q * T.res, 0, T.ny - 1.001);
  const i = fx | 0, j = fy | 0, u = fx - i, v = fy - j, k = 3 * (j * T.nx + i), K = 3 * T.nx, g = T.c;
  for (let ch = 0; ch < 3; ch++) {
    const a = g[k + ch], b = g[k + 3 + ch], c = g[k + K + ch], e = g[k + K + 3 + ch];
    out[ch] = a + (b - a) * u + (c - a) * v + (a - b - c + e) * u * v;
  }
}
export function scaled(def, k) {
  return { w: def.w * k, h: def.h * k, ownEdge: def.ownEdge, sdf: (s, q, i) => def.sdf(s / k, q / k, i) * k, paint: (s, q, i, w, o) => def.paint(s / k, q / k, i, w / k, o) };
}
const baked = (T, ownEdge = false) => ({ ownEdge, w: T.w, h: T.h, tex: T, sdf: (s, q) => texSDF(T, s, q), paint: (s, q, inst, w, out) => texRGB(T, s, q, out) });

// ---------------------------------------------------------------- frog
const BANDS = ['#e8402a', '#f58a22', '#f5cf2a', '#4fb848', '#2f86d8', '#8a4fc8'].map(C);
const FROG_T = bake(24, 19.5, 3, (s, q, o) => {
  s -= 1;
  const body = (Math.hypot((s - 11) / 10.2, (q - 6.2) / 6.4) - 1) * 6.4;
  const head = (Math.hypot((s - 11) / 7.6, (q - 10) / 5.4) - 1) * 5.4;
  const eyeL = sdCirc(s, q, 6.1, 14.4, 3.7), eyeR = sdCirc(s, q, 15.9, 14.4, 3.7);
  const feet = Math.min((Math.hypot((s - 3.6) / 3.4, (q - 1.1) / 1.4) - 1) * 1.4, (Math.hypot((s - 18.4) / 3.4, (q - 1.1) / 1.4) - 1) * 1.4);
  const sil = Math.max(Math.min(body, head, eyeL, eyeR, feet), -q + 0.2);
  // cut out with a margin of bare paper round it, like a sticker
  o[0] = Math.max(sil - 1.1, -q + 0.2);
  o[1] = PAL.rim[0]; o[2] = PAL.rim[1]; o[3] = PAL.rim[2];
  fillIf(o, sil, PAL.numKey, 0.35);
  const band = BANDS[kit.clamp(Math.floor((16.5 - q) / 2.6), 0, 5)];
  fillIf(o, sil + 0.75, band, 0.35);
  for (const ex of [6.1, 15.9]) {
    const r = Math.hypot(s - ex, q - 14.4);
    fillIf(o, r - 3.0, [1, 1, 1], 0.3);
    fillIf(o, r - 2.0, C('#1c2448'), 0.3);
    fillIf(o, Math.hypot(s - ex - 0.2, q - 14.1) - 1.15, [1, 1, 1], 0.3);
    fillIf(o, Math.hypot(s - ex - 0.2, q - 14.1) - 0.6, PAL.numKey, 0.3);
  }
  fillIf(o, sdSeg(s, q, 9.1, 14.6, 12.9, 14.6, 0.45), [1, 1, 1], 0.3);   // bridge of the glasses
  const sm = Math.abs(Math.hypot(s - 11, q - 11.2) - 4.6) - 0.75;          // a wide smile
  if (q < 9.6) fillIf(o, sm, PAL.numKey, 0.3);
  fillIf(o, Math.min(sdCirc(s, q, 4.6, 8.4, 1.0), sdCirc(s, q, 17.4, 8.4, 1.0)), C('#ff8aa0'), 0.3);
});
export const FROG = baked(FROG_T, true);

// ---------------------------------------------------------------- boat
// A folded paper boat on the pond, rocking on its hidden wheel.
const BOAT_T = bake(24, 17, 3, (s, q, o) => {
  s -= 1;
  const hull = sdPoly(s, q, [3.2, 0.4, 18.8, 0.4, 22, 5.6, 0, 5.6]);
  const sail = sdPoly(s, q, [4.6, 5.2, 17.4, 5.2, 11, 15.6]);
  const sil = Math.min(hull, sail);
  o[0] = Math.max(sil - 1.0, -q);
  o[1] = PAL.core[0]; o[2] = PAL.core[1]; o[3] = PAL.core[2];
  fillIf(o, sil, PAL.numKey, 0.35);
  fillIf(o, hull + 0.6, s < 11 ? C('#e9edf6') : C('#b9c4dc'), 0.35);
  fillIf(o, sail + 0.6, s < 11 ? C('#f6f2e4') : C('#c7cbd8'), 0.35);
  fillIf(o, Math.abs(s - 11) - 0.3 + Math.max(0, 5.4 - q) * 9, PAL.numKey, 0.3);   // the centre fold
});
export const BOAT = baked(BOAT_T, true);

// --------------------------------------------- moon pendulum and its gallows
// The moon hangs on a thread from a brass wire arm standing at the spine;
// it swings a beat a second, the colon of the clock.
export const PIVOT = [5, 39];
const MOON_T = bake(10, 40, 3, (s, q, o) => {
  const m = Math.max(sdCirc(s, q, 5, 13.5, 5.6), -sdCirc(s, q, 8.2, 15.2, 4.6));
  const th = sdSeg(s, q, 5, 39, 5, 18.6, 0.2);
  o[0] = Math.min(m, th);
  const c = m < th ? PAL.moon : PAL.thread; o[1] = c[0]; o[2] = c[1]; o[3] = c[2];
  fillIf(o, sdCirc(s, q, 2.2, 14.6, 0.55), PAL.numKey, 0.3);
  fillIf(o, Math.max(Math.abs(Math.hypot(s - 2.6, q - 12.2) - 1.3) - 0.3, q - 11.8), PAL.numKey, 0.3);
});
export const MOON = baked(MOON_T, true);
const POST_T = bake(10, 42, 3, (s, q, o) => {
  const post = sdSeg(s, q, 1.4, 0, 1.4, 37, 0.55), arm = Math.abs(Math.hypot(s - 5.2, q - 37) - 3.8) - 0.42;
  const armC = Math.max(arm, 37 - q);
  const knob = sdCirc(s, q, 1.4, 0.6, 1.2);
  o[0] = Math.min(post, armC, knob, sdCirc(s, q, 9, 37, 0.6));
  o[1] = PAL.gold[0]; o[2] = PAL.gold[1]; o[3] = PAL.gold[2];
});
export const POST = baked(POST_T, true);

// -------------------------------------------------------------- dragon
// The chapter opener: a paper dragon V-folded at the spine, wings on two
// hinges that flap, neck and head on a centre card.
const DRAGON = C('#2f9a6a'), DRAGON2 = C('#1f7a56'), BELLY = C('#f0c24a'), BONE = C('#f4d78a');
function wing(s, q, o) {
  let m = sdPoly(s, q, [0, 0, 9, 0.5, 18, 3.5, 26, 9.5, 33, 23, 30.5, 24.5, 16, 18.5, 0, 11]);
  for (const [cx, cy, r] of [[4.6, -2.6, 3.3], [13.6, -1.2, 3.8], [22, 2.8, 4.0], [29.4, 13, 4.2]]) m = Math.max(m, -sdCirc(s, q, cx, cy, r));
  const bones = Math.min(sdSeg(s, q, 0, 11, 16, 18.5, 0.75), sdSeg(s, q, 16, 18.5, 33, 23.5, 0.6), sdSeg(s, q, 16, 18.5, 9, 0.6, 0.45),
    sdSeg(s, q, 16, 18.5, 18, 3.4, 0.45), sdSeg(s, q, 16, 18.5, 26, 9.4, 0.45));
  o[0] = Math.min(m, bones);
  const c = kit.mix(DRAGON, DRAGON2, kit.clamp(0.5 + 0.5 * Math.sin(Math.hypot(s - 16, q - 18.5) * 1.1))); o[1] = c[0]; o[2] = c[1]; o[3] = c[2];
  fillIf(o, bones, BONE, 0.35);
}
const WING_R_T = bake(34, 25, 2, (s, q, o) => wing(s, q, o));
const WING_L_T = bake(34, 25, 2, (s, q, o) => wing(34 - s, q, o));
export const WING_R = baked(WING_R_T), WING_L = baked(WING_L_T);
const BODY_T = bake(24, 40, 2.5, (s, q, o) => {
  const belly = (Math.hypot((s - 11) / 7.5, (q - 6) / 6) - 1) * 6;
  const neck = Math.min(sdSeg(s, q, 10, 8, 7.5, 18, 3.6), sdSeg(s, q, 7.5, 18, 9, 27, 3.0), sdSeg(s, q, 9, 27, 12, 32, 2.6));
  const head = Math.min((Math.hypot((s - 13) / 5.2, (q - 33) / 3.8) - 1) * 3.8, sdPoly(s, q, [13, 30, 22.5, 31, 22.5, 33.6, 13, 36]));
  const jaw = sdPoly(s, q, [13, 29, 21.5, 28.4, 21, 30.2, 13, 31.5]);
  const horns = Math.min(sdSeg(s, q, 10.5, 35.5, 7, 39.4, 0.7), sdSeg(s, q, 13, 36.2, 11.4, 39.6, 0.6));
  let spikes = 9;
  for (const [x, y] of [[4.2, 13], [3.6, 19], [4.6, 25], [7, 30]]) spikes = Math.min(spikes, sdPoly(s, q, [x + 1.4, y - 1.6, x + 1.4, y + 1.6, x - 2.4, y + 0.4]));
  const tail = Math.max(Math.abs(Math.hypot(s - 3.4, q - 6) - 3.2) - 0.9, q - 6.5);
  const mouth = Math.max(sdPoly(s, q, [16, 31, 23, 30.6, 23, 31.6, 16, 31.6]), -q + 30.8);
  o[0] = Math.max(Math.min(belly, neck, head, jaw, horns, spikes, tail), -mouth);
  o[1] = DRAGON[0]; o[2] = DRAGON[1]; o[3] = DRAGON[2];
  // gold belly plates down the front of the neck
  const front = Math.min(sdSeg(s, q, 12.6, 6, 10.6, 18, 1.4), sdSeg(s, q, 10.6, 18, 11.6, 27, 1.2), (Math.hypot((s - 12) / 4.5, (q - 5) / 4) - 1) * 4);
  if (front < 0 && kit.fract(q / 1.6) > 0.25) fillIf(o, front, BELLY, 0.4);
  fillIf(o, Math.min(spikes, horns), BELLY, 0.4);
  fillIf(o, sdCirc(s, q, 14.2, 34.2, 1.45), [1, 1, 1], 0.3);
  fillIf(o, sdCirc(s, q, 14.7, 34.1, 0.7), PAL.numKey, 0.3);
  fillIf(o, sdCirc(s, q, 21.2, 33.2, 0.4), PAL.numKey, 0.3);
});
export const BODY = baked(BODY_T);
/** Paper flame: tongues that flicker, drawn live. */
export const FLAME = {
  w: 22, h: 42, ownEdge: false,
  sdf(s, q, inst) {
    const k = inst.k; if (k <= 0.02 || q < 22) return 5;
    let m = 9;
    for (let i = 0; i < 3; i++) {
      const len = k * (16 + 4 * Math.sin(inst.t * 9 + i * 2.1)), ang = (i - 1) * 0.22 + 0.06 * Math.sin(inst.t * 13 + i);
      const ex = 1 + len * Math.cos(ang), ey = 31 + len * Math.sin(ang);
      m = Math.min(m, sdSeg(s, q, 1, 31, ex, ey, 0.4) - kit.clamp((s - 1) / len) * (1 - kit.clamp((s - 1) / len)) * 3.2 * k);
    }
    return m;
  },
  paint(s, q, inst, w, out) {
    const c = kit.mix(C('#ffe27a'), C('#ff7a1a'), kit.clamp((s - 2) / 16)); out[0] = c[0]; out[1] = c[1]; out[2] = c[2];
  },
};

// ------------------------------------------------------------- numerals
export const NUM_W = 44, NUM_H = 34, NUM_BASE = 3.2;
const GX = [2.2, 23.8];
const GRASS = new Float32Array(NUM_W * 8 + 2);
for (let i = 0; i < GRASS.length; i++) { const s = i / 8; GRASS[i] = 2.4 + 0.9 * Math.abs(Math.sin(s * 0.62)) + 0.5 * Math.sin(s * 1.7); }
function grassTop(s) { const f = s * 8; return f <= 0 ? GRASS[0] : f >= GRASS.length - 1 ? GRASS[GRASS.length - 1] : GRASS[f | 0]; }
export const NUM = {
  w: NUM_W, h: NUM_H, ownEdge: true,
  sdf(s, q, inst) {
    const gy = NUM_BASE + GH - q;
    const a = glyphSDF(inst.d0, s - GX[0], gy), b = glyphSDF(inst.d1, s - GX[1], gy);
    const g = Math.max(q - grassTop(s), -q, Math.abs(s - NUM_W / 2) - NUM_W / 2 + 0.5);
    return Math.min(a, b, g);
  },
  paint(s, q, inst, w, out) {
    const gy = NUM_BASE + GH - q;
    const a = glyphSDF(inst.d0, s - GX[0], gy), b = glyphSDF(inst.d1, s - GX[1], gy), d = Math.min(a, b);
    const gt = q - grassTop(s);
    if (d < 0.6 || gt > 0) {
      // keyline then vermilion, with a soft inner highlight band toward the lamp (upper left)
      const hiBand = kit.clamp(0.5 - (d + 1.5) / w) * (1 - kit.clamp(0.5 - (d + 2.6) / w));
      let dx = 0, dy = 0;
      if (hiBand > 0) {
        dx = Math.min(glyphSDF(inst.d0, s + 0.5 - GX[0], gy), glyphSDF(inst.d1, s + 0.5 - GX[1], gy)) - d;
        dy = Math.min(glyphSDF(inst.d0, s - GX[0], gy - 0.5), glyphSDF(inst.d1, s - GX[1], gy - 0.5)) - d;
      }
      const k = kit.clamp(0.5 - (d + 0.75) / w);                      // inside the keyline
      const facing = kit.clamp((-dx * 0.7 + -dy * 0.7) * 2.2);        // gradient pointing up-left -> lit edge
      for (let c = 0; c < 3; c++) {
        let v = PAL.numF[c];
        v += (PAL.numHi[c] - v) * hiBand * facing * 0.8;
        out[c] = PAL.numKey[c] + (v - PAL.numKey[c]) * k;
      }
      if (gt < 0 && d > 0) { const m = kit.clamp(0.5 + d / w); for (let c = 0; c < 3; c++) out[c] += (PAL.grass[c] - out[c]) * m; }
    } else {
      const blade = kit.fract(s * 0.9) < 0.3;
      const c = blade ? PAL.grass2 : PAL.grass; out[0] = c[0]; out[1] = c[1]; out[2] = c[2];
    }
  },
};

// ---------------------------------------------------------------- pages
/** The printed page at spread point (X, Y). page.type 'L' | 'R' | 'T' (text). */
function pagePrintRaw(page, X, Y, out) {
  const P = PAL;
  let c = P.paper;
  const u = Math.abs(X);
  const x0 = -1, x1 = 62.4, y0 = 1.6, y1 = 99;
  const inPanel = u > x0 && u < x1 && Y > y0 && Y < y1;
  if (page.type === 'T') {
    const line = kit.fract(Y / 3.2) < 0.32 && u > 6 && u < 58 && Y > 8 && Y < 86 && kit.hash(Math.floor(Y / 3.2), Math.floor(u / 4.5)) > 0.18;
    out[0] = c[0]; out[1] = c[1]; out[2] = c[2];
    if (line) for (let k = 0; k < 3; k++) out[k] = kit.lerp(out[k], P.text[k], 0.55);
    return;
  }
  if (inPanel) {
    const hz = 58 + 3 * Math.sin(X * 0.11 + 1) + 2 * Math.sin(X * 0.27);
    if (Y > hz) {
      // the printed night sky beyond the hills: navy with gold stars
      c = kit.mix(P.sky, P.sky2, kit.clamp((Y - hz) / 22) ** 0.7);
      const sx = Math.floor(X / 4.2), sy = Math.floor(Y / 4.2), hsh = kit.hash(sx, sy, 3);
      if (hsh > 0.7 && Math.hypot(kit.fract(X / 4.2) - 0.3 - 0.4 * kit.hash(sx, sy, 4), kit.fract(Y / 4.2) - 0.5) < 0.16) c = P.flower;
    } else if (page.type === 'L') {
      const n = kit.noise2(X * 0.25, Y * 0.25);
      c = kit.mix(P.meadow, P.meadow2, n);
      const pc = -31 + 7 * Math.sin(Y * 0.09 + 0.6), pw = 5 - Y * 0.05;
      if (Math.abs(X - pc) < pw) c = P.path;
      const fx = Math.floor(X / 3.3), fy = Math.floor(Y / 3.3);
      if (kit.hash(fx, fy, 7) > 0.88 && Math.hypot(kit.fract(X / 3.3) - 0.5, kit.fract(Y / 3.3) - 0.5) < 0.22) c = P.flower;
      if (Math.abs(Y - 3.5) < 0.45 && X < -9 && X > -54) c = P.gate;   // the pull-tab slot
    } else {
      const n = kit.noise2(X * 0.2, Y * 0.2);
      c = kit.mix(P.meadow, P.meadow2, n);
      const pe = Math.hypot((X - 34) / 25, (Y - 17) / 12);
      if (pe < 1) {
        c = kit.mix(P.pond, P.pond2, 0.5 + 0.5 * Math.sin(pe * 14));
        for (const [px, py, r] of [[16, 20, 3.0], [52, 22, 2.6], [47, 9, 2.2]]) if (Math.hypot(X - px, (Y - py) * 1.2) < r) c = P.pad;
      }
    }
  }
  if (inPanel && (x1 - u < 0.5 || Y - y0 < 0.5)) c = P.ink;
  out[0] = c[0]; out[1] = c[1]; out[2] = c[2];
}

// the prints are static: bake each page type once at 3 samples a unit
const PRES = 3, PNX = 64 * PRES + 1, PNY = 92 * PRES + 1, PRINTS = {};
for (const type of ['L', 'R', 'T']) {
  const img = new Float32Array(3 * PNX * PNY), o = [0, 0, 0], pg = { type };
  for (let j = 0; j < PNY; j++) for (let i = 0; i < PNX; i++) {
    pagePrintRaw(pg, (type === 'L' ? -1 : 1) * (i / PRES), j / PRES, o);
    const k = 3 * (j * PNX + i); img[k] = o[0]; img[k + 1] = o[1]; img[k + 2] = o[2];
  }
  PRINTS[type] = img;
}
/** The printed page at spread point (X, Y), bilinear from the bake. */
export function pagePrint(page, X, Y, w, sec, out) {
  const img = PRINTS[page.type];
  const fx = kit.clamp(Math.abs(X) * PRES, 0, PNX - 1.001), fy = kit.clamp(Y * PRES, 0, PNY - 1.001);
  const i = fx | 0, j = fy | 0, u = fx - i, v = fy - j, k = 3 * (j * PNX + i), K = 3 * PNX;
  for (let c = 0; c < 3; c++) {
    const a = img[k + c], b = img[k + 3 + c], e = img[k + K + c], f = img[k + K + 3 + c];
    out[c] = a + (b - a) * u + (e - a) * v + (a - b - e + f) * u * v;
  }
}
