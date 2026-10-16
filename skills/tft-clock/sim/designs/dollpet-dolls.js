// dollpet: the two plush dolls as pixel sprites, rasterised once at load.
//
// Each doll part is a stack of signed-distance layers (negative inside),
// painted in order. A layer can fray its edge with integer-hash noise (the
// panda's long looped pile), carry a lit top edge and a shaded bottom edge
// (the puppy's tan plush), draw a seam where it overlaps a lower layer of
// the same colour (ear over head, arm over shoulder), and texture its fill
// (curly loops of pile). After the layers, every opaque pixel that borders
// transparency gets a 1-px ink keyline, as on the pet LCD.
//
// All of this runs at load; per frame the face only blits the results.

import { segDist, polygonDist, rand, noise2 } from '../js/kit.js';

// ------------------------------------------------------------ colours (sampled from the photos)
export const INK = 0x161412;
export const TAN = 0xb8781a, TAN_LIT = 0xe0a040, TAN_SH = 0x845618;
export const PUP_BLACK = 0x161412, PUP_SHEEN = 0x3a332c, PUP_RIM = 0x5e5246;
export const NOSE = 0x5a3a22, TAG = 0x9a7ad8;
export const CREAM = 0xefeadf, CREAM_SH = 0xd2cbbc;
export const PAN_BLACK = 0x141418, PAN_SHEEN = 0x34343e;
export const GLINT = 0xf4f4ec, PATCH_GLINT = 0x5a5a66;

// ------------------------------------------------------------ distance primitives
export const ell = (cx, cy, rx, ry) => (x, y) => {
  const u = (x - cx) / rx, v = (y - cy) / ry;
  return (Math.sqrt(u * u + v * v) - 1) * Math.min(rx, ry);
};
export const circ = (cx, cy, r) => (x, y) => Math.hypot(x - cx, y - cy) - r;
export const poly = (pts, round = 0) => (x, y) => polygonDist(x, y, pts) - round;
/** A capsule whose radius runs from r0 at (ax, ay) to r1 at (bx, by): a teardrop, a limb. */
export const taper = (ax, ay, r0, bx, by, r1) => (x, y) => {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let u = ((x - ax) * dx + (y - ay) * dy) / l2;
  u = u < 0 ? 0 : u > 1 ? 1 : u;
  return Math.hypot(x - ax - u * dx, y - ay - u * dy) - (r0 + (r1 - r0) * u);
};
export const seg = (ax, ay, bx, by, r) => (x, y) => segDist(x, y, ax, ay, bx, by) - r;
export const union = (...ds) => (x, y) => Math.min(...ds.map((d) => d(x, y)));
export const inter = (...ds) => (x, y) => Math.max(...ds.map((d) => d(x, y)));
export const minus = (a, b) => (x, y) => Math.max(a(x, y), -b(x, y));
/** Rotate a shape by `ang` radians about (px, py) and move it by (dx, dy). */
export const xf = (d, px, py, ang, dx = 0, dy = 0) => {
  const c = Math.cos(ang), s = Math.sin(ang);
  return (x, y) => {
    const X = x - px - dx, Y = y - py - dy;
    return d(px + c * X + s * Y, py - s * X + c * Y);
  };
};

// ------------------------------------------------------------ the rasteriser
/**
 * layers: [{ d, c, fray?, seed?, lit?, shade?, seam?, tex? }]
 *   c      colour, or (x, y) => colour
 *   fray   edge noise amplitude in px (per-pixel hash, so the edge is ragged)
 *   lit    colour for pixels whose upper neighbour is outside this layer
 *   shade  colour for pixels whose lower neighbour is outside this layer
 *   seam   colour for pixels bordering a lower opaque layer
 * opts: { outline: INK | null, keyGap }
 */
export function raster(w, h, layers, { outline = INK } = {}) {
  const top = new Int16Array(w * h).fill(-1);
  const inside = (L, x, y) => {
    let d = L.d(x + 0.5, y + 0.5);
    if (L.fray) d += (rand(x * 7 + 3, y * 13 + 1, L.seed ?? 5) - 0.5) * 2 * L.fray;
    return d < 0;
  };
  const masks = layers.map((L) => {
    const m = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (inside(L, x, y)) m[y * w + x] = 1;
    return m;
  });
  for (let k = 0; k < layers.length; k++) for (let i = 0; i < w * h; i++) if (masks[k][i]) top[i] = k;
  const data = new Int32Array(w * h).fill(-1);
  const at = (m, x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : m[y * w + x]);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const k = top[y * w + x];
      if (k < 0) continue;
      const L = layers[k], m = masks[k];
      let c = typeof L.c === 'function' ? L.c(x, y) : L.c;
      if (L.seam != null) {
        for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const X = x + ox, Y = y + oy;
          if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
          const kk = top[Y * w + X];
          if (kk >= 0 && kk < k) { c = L.seam; break; }
        }
      }
      if (L.shade != null && !at(m, x, y + 1)) c = L.shade;
      if (L.lit != null && !at(m, x, y - 1)) c = L.lit;
      data[y * w + x] = c;
    }
  // fill pinholes the fray left inside a shape with a neighbour's colour
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (data[i] >= 0) continue;
      const n = [data[i - 1], data[i + 1], data[i - w], data[i + w]].filter((v) => v >= 0);
      if (n.length >= 3) data[i] = n[0];
    }
  if (outline != null) {
    const add = [];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (data[y * w + x] >= 0) continue;
        for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const X = x + ox, Y = y + oy;
          if (X >= 0 && Y >= 0 && X < w && Y < h && data[Y * w + X] >= 0) { add.push(y * w + x); break; }
        }
      }
    for (const i of add) data[i] = outline;
  }
  return { w, h, data };
}

/** Curly looped pile: contour bands of smooth noise make little loops and squiggles. */
const loops = (base, dark, seed, scale = 2.1, band = 0.055) => (x, y) => {
  const n = noise2(x / scale, y / scale, seed);
  return Math.abs(n - 0.5) < band || Math.abs(n - 0.25) < band * 0.7 ? dark : base;
};
/** Short plush: a sparse speckle. */
const fuzz = (base, alt, seed, p = 0.12) => (x, y) => (rand(x, y, seed) < p ? alt : base);

// ------------------------------------------------------------ the panda (sits upright, legs forward)
// Sprite 38 x 46. Body and head are separate sprites so the head can tilt,
// nod and sleep on its own; HEAD_AT is where the head sprite sits on the body.
export const PANDA_W = 38, PANDA_BODY_H = 26, PANDA_HEAD_H = 26;
export const PANDA_HEAD_AT = [0, -18];   // head sprite offset relative to body sprite

const P_CREAM = loops(CREAM, CREAM_SH, 11);
const P_BLACK = fuzz(PAN_BLACK, PAN_SHEEN, 12, 0.05);

/** arms: 'down' (hanging at its sides), 'up' (cheering), 'hold' (one paw raised to its mouth). */
export function pandaBody(arms = 'down') {
  const cx = 19;
  const L = [];
  // the body: cream underneath, the shoulder shawl and arms over it
  L.push({ d: ell(cx, 13, 13.2, 10), c: P_CREAM, fray: 1.2, seed: 21 });
  // shoulder band with a V dip at the centre: the top of the heart belly
  const band = inter(ell(cx, 13, 13.2, 10), (x, y) => y - (9 + 3.2 * Math.max(0, 1 - Math.abs(x - cx) / 4.5)));
  L.push({ d: band, c: P_BLACK, fray: 1.0, seed: 22 });
  // heart belly lobes are the cream left between the band and the arms
  if (arms === 'down' || arms === 'hold') L.push({ d: taper(7, 5.5, 3.3, 6, 15.5, 2.8), c: P_BLACK, fray: 1.1, seed: 23, seam: PAN_SHEEN });
  if (arms === 'down') L.push({ d: taper(31, 5.5, 3.3, 32, 15.5, 2.8), c: P_BLACK, fray: 1.1, seed: 24, seam: PAN_SHEEN });
  if (arms === 'hold') L.push({ d: taper(31.5, 6, 3.6, 25, 0.5, 3.2), c: P_BLACK, fray: 1.0, seed: 24, seam: PAN_SHEEN });
  if (arms === 'up') {
    L.push({ d: taper(7, 6, 3.6, 2.5, -1, 3.2), c: P_BLACK, fray: 1.0, seed: 23, seam: PAN_SHEEN });
    L.push({ d: taper(31, 6, 3.6, 35.5, -1, 3.2), c: P_BLACK, fray: 1.0, seed: 24, seam: PAN_SHEEN });
  }
  // legs straight out towards us: big round black feet
  L.push({ d: circ(9.5, 20, 5.4), c: P_BLACK, fray: 0.9, seed: 25, seam: PAN_SHEEN, lit: PAN_SHEEN });
  L.push({ d: circ(28.5, 20, 5.4), c: P_BLACK, fray: 0.9, seed: 26, seam: PAN_SHEEN, lit: PAN_SHEEN });
  // the sprite is shifted down by 3 so raised arms fit above the shoulders
  const shifted = L.map((l) => ({ ...l, d: ((d) => (x, y) => d(x, y - 3))(l.d), c: typeof l.c === 'function' ? ((c) => (x, y) => c(x, y - 3))(l.c) : l.c }));
  return raster(PANDA_W, PANDA_BODY_H + 3, shifted);
}

/** tilt: radians (+ leans to the viewer's right); eyes: 'open' | 'blink' | 'sleep'. */
export function pandaHead(tilt = 0, eyes = 'open') {
  const cx = 19, px = cx, py = 22; // pivot at the neck
  const R = (d) => xf(d, px, py, tilt);
  const L = [];
  L.push({ d: R(circ(cx - 11.3, 5.6, 4.3)), c: P_BLACK, fray: 1.0, seed: 31 });
  L.push({ d: R(circ(cx + 11.3, 5.6, 4.3)), c: P_BLACK, fray: 1.0, seed: 32 });
  L.push({ d: R(ell(cx, 13.8, 13.4, 10.2)), c: P_CREAM, fray: 1.3, seed: 33 });
  // the eye patches: big teardrops drooping outward and down from the bridge of the nose
  L.push({ d: R(taper(cx - 2.6, 10.4, 1.4, cx - 7.6, 15.6, 3.0)), c: PAN_BLACK, fray: 0.45, seed: 34 });
  L.push({ d: R(taper(cx + 2.6, 10.4, 1.4, cx + 7.6, 15.6, 3.0)), c: PAN_BLACK, fray: 0.45, seed: 35 });
  // the nose: small, rounded, low in the face
  L.push({ d: R(ell(cx, 19, 2.1, 1.4)), c: PAN_BLACK });
  const spr = raster(PANDA_W, PANDA_HEAD_H, L);
  // eyes lost in the patches: only a dull bead glint shows, and it blinks
  if (eyes === 'open') {
    for (const [ex, ey] of [[cx - 4.6, 12.2], [cx + 3.6, 12.2]]) {
      const c = Math.cos(tilt), s = Math.sin(tilt);
      const X = ex - px, Y = ey - py;
      const x = Math.floor(px + c * X - s * Y), y = Math.floor(py + s * X + c * Y);
      if (spr.data[y * spr.w + x] === PAN_BLACK) spr.data[y * spr.w + x] = PATCH_GLINT;
    }
  }
  return spr;
}

// ------------------------------------------------------------ the puppy (lies flat, head on its paws)
export const PUP_W = 46, PUP_H = 28;

const P_TAN = fuzz(TAN, 0xa86c16, 41, 0.1);
const P_PBLK = fuzz(PUP_BLACK, 0x24201c, 42, 0.14);

/** pose: 'flat' | 'squash' | 'air' (legs dangling). */
export function puppyBody(pose = 'flat') {
  const cx = 23;
  const L = [];
  const sq = pose === 'squash' ? 1 : 0, air = pose === 'air' ? 1 : 0;
  // the black back, a low beanbag mound behind the head
  L.push({ d: ell(cx, 11 + sq * 1.5 + air * 1, 16 + sq * 2 - air * 2, 5 - sq * 1 + air * 0.5), c: P_PBLK, fray: 0.45, seed: 51, lit: PUP_SHEEN });
  // hind legs splayed out sideways, tan mitten paws at the ends
  const hy = air ? 21 : 20 + sq * 0.5, hx = air ? 5 : 2 - sq;
  L.push({ d: taper(13, 13 + sq, 3.6, hx + 3, hy, 2.8), c: P_PBLK, fray: 0.4, seed: 52, seam: PUP_SHEEN, lit: PUP_SHEEN });
  L.push({ d: taper(33, 13 + sq, 3.6, 43 - hx, hy, 2.8), c: P_PBLK, fray: 0.4, seed: 53, seam: PUP_SHEEN, lit: PUP_SHEEN });
  L.push({ d: ell(hx + 1.5, hy + 1.5, 3.6, 2.5), c: P_TAN, lit: TAN_LIT, shade: TAN_SH, seed: 54 });
  L.push({ d: ell(44.5 - hx, hy + 1.5, 3.6, 2.5), c: P_TAN, lit: TAN_LIT, shade: TAN_SH, seed: 55 });
  // front mitten paws, stuck out under the chin
  const fy = air ? 26 : 23.4 + sq * 0.6;
  L.push({ d: ell(cx - 4.6, fy, 3.9, 2.7), c: P_TAN, lit: TAN_LIT, shade: TAN_SH });
  L.push({ d: ell(cx + 4.6, fy, 3.9, 2.7), c: P_TAN, lit: TAN_LIT, shade: TAN_SH });
  const spr = raster(PUP_W, PUP_H + 2, L);
  // the lavender sewn-in tag, peeking from the right front paw
  const tx = cx + 7, ty = Math.floor(fy);
  for (const [x, y] of [[tx, ty], [tx + 1, ty], [tx, ty + 1]]) if (spr.data[y * spr.w + x] >= 0) spr.data[y * spr.w + x] = TAG;
  return spr;
}

/** lift: px the head is raised off the paws (moves the face up in its sprite);
 *  tilt: radians; eyes: 'open' | 'blink' | 'sleep' | 'happy'. */
export function puppyHead(tilt = 0, eyes = 'open', ears = 0) {
  const cx = 23, px = cx, py = 18;
  const R = (d) => xf(d, px, py, tilt);
  const L = [];
  // head: wide and a little flat, black on top
  L.push({ d: R(ell(cx, 12.5, 11.8, 9)), c: P_PBLK, fray: 0.35, seed: 63, lit: PUP_RIM });
  // ears: long, soft, rounded flaps lying against the sides of the face, hanging below the jaw;
  // `ears` swings them out
  L.push({ d: R(taper(cx - 9.6, 7.5, 2.9, cx - 12.6 - ears, 19.6, 4.2)), c: P_PBLK, fray: 0.3, seed: 61, lit: PUP_RIM, seam: PUP_RIM });
  L.push({ d: R(taper(cx + 9.6, 7.5, 2.9, cx + 12.6 + ears, 19.6, 4.2)), c: P_PBLK, fray: 0.3, seed: 62, lit: PUP_RIM, seam: PUP_RIM });
  // the muzzle: wide, puffy tan, two round cheeks, a fat crescent
  const muz = minus(union(circ(cx - 4, 17.6, 4.7), circ(cx + 4, 17.6, 4.7), ell(cx, 18.4, 6.4, 4.2)), ell(cx, 10.6, 3.2, 3.6));
  L.push({ d: R(muz), c: P_TAN, lit: TAN_LIT, shade: TAN_SH });
  // nose: a small rounded triangle of matte brown felt in the middle of the tan
  L.push({ d: R(poly([[cx - 2.1, 15.3], [cx + 2.1, 15.3], [cx, 17.7]], 0.55)), c: NOSE });
  const spr = raster(PUP_W, PUP_H, L);
  const put = (x, y, c) => {
    const C = Math.cos(tilt), S = Math.sin(tilt), X = x - px, Y = y - py;
    const xx = Math.floor(px + C * X - S * Y), yy = Math.floor(py + S * X + C * Y);
    if (xx >= 0 && yy >= 0 && xx < spr.w && yy < spr.h) spr.data[yy * spr.w + xx] = c;
  };
  // tan eyebrow dots, then the bead eyes close together just above the muzzle
  put(cx - 3.5, 9.5, TAN_LIT); put(cx + 2.5, 9.5, TAN_LIT);
  if (eyes === 'open') { put(cx - 3.5, 11.5, GLINT); put(cx + 2.5, 11.5, GLINT); }
  if (eyes === 'happy') { put(cx - 4.5, 11.5, PUP_SHEEN); put(cx - 3.5, 10.5, TAN_SH); put(cx - 2.5, 11.5, PUP_SHEEN); put(cx + 1.5, 11.5, PUP_SHEEN); put(cx + 2.5, 10.5, TAN_SH); put(cx + 3.5, 11.5, PUP_SHEEN); }
  if (eyes === 'sleep') { put(cx - 4.5, 12.5, PUP_SHEEN); put(cx - 3.5, 12.5, PUP_SHEEN); put(cx + 2.5, 12.5, PUP_SHEEN); put(cx + 3.5, 12.5, PUP_SHEEN); }
  return spr;
}
