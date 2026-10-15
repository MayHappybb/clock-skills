// The tableau for delft.js: a landscape painted across 6 x 2 tiles (96 x 32)
// at the top right, as Delft painters did on large tile panels. Three
// pictures take turns by the hour: a polder with a windmill and a barge, a
// harbour with a fluyt and a pier light, a frozen canal with skaters. The
// static painting is a byte map of palette indices; the windmill's sails,
// the boats, skaters, gulls and clouds are drawn on it each frame.

import { rng } from '../js/kit.js';
import { I, covIndex } from './delft-art.js';

export const TW = 96, TH = 32;
export const HUB = [76.5, 11.5];      // the windmill's hub, tableau px
export const SAIL_R = 10.5, SAIL_BOX = 25, SAIL_STEPS2 = 32;

// ------------------------------------------------------------ a tiny hard-pixel painter on a byte map
function painter(a, w, h) {
  const put = (x, y, v) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < w && y < h) a[y * w + x] = v; };
  const line = (x0, y0, x1, y1, v) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let k = 0; k <= n; k++) put(x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n, v);
  };
  const poly = (pts, v) => {          // hard fill by pixel centres
    let y0 = 1e9, y1 = -1e9;
    for (const [, y] of pts) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
      const cy = y + 0.5, xs = [];
      for (let i = 0; i < pts.length; i++) {
        const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
        if ((ay <= cy && by > cy) || (by <= cy && ay > cy)) xs.push(ax + ((cy - ay) / (by - ay)) * (bx - ax));
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.ceil(xs[k] - 0.5); x < xs[k + 1] - 0.5; x++) put(x, y, v);
    }
  };
  return { put, line, poly };
}

// ------------------------------------------------------------ the pictures
function skyline(P, r, x0, x1, base) {
  let x = x0;
  while (x < x1) {
    const k = r();
    if (k < 0.35) {                              // a house with a stepped gable
      P.poly([[x, base], [x, base - 3], [x + 1.5, base - 5], [x + 3, base - 3], [x + 3, base]], I.LIGHT);
      P.put(x + 1, base - 1, I.MID);
      x += 4 + ((r() * 2) | 0);
    } else if (k < 0.6) {                        // a round tree
      P.poly([[x, base - 2], [x + 1, base - 4], [x + 3, base - 4], [x + 4, base - 2], [x + 2, base - 1]], I.LIGHT);
      P.put(x + 2, base, I.LIGHT); P.put(x + 2, base - 1, I.LIGHT);
      x += 5 + ((r() * 3) | 0);
    } else if (k < 0.72) {                       // the church
      P.poly([[x, base], [x, base - 3], [x + 5, base - 3], [x + 5, base]], I.LIGHT);
      P.line(x + 1, base - 3, x + 1, base - 7, I.MID); P.put(x + 1, base - 8, I.MID); P.put(x + 2, base - 5, I.LIGHT); P.put(x, base - 5, I.LIGHT);
      x += 7;
    } else x += 2;
  }
  P.line(x0, base + 1, x1, base + 1, I.LIGHT);
}
function water(P, x0, x1, y0, y1, r) {
  for (let y = y0; y <= y1; y += 2)
    for (let x = x0; x <= x1; x++) {
      const ph = (x + y * 7 + ((r() * 3) | 0)) % 13;
      if (ph < 4 && y % 4 === y0 % 4) P.put(x, y, I.LIGHT);
      else if (ph === 6 && y % 4 !== y0 % 4) P.put(x, y, I.LIGHT);
    }
}
function ice(P, x0, x1, y0, y1) {
  for (let y = y0 + 1; y <= y1; y += 3) {
    const off = (y * 13) % 17;
    for (let x = x0; x <= x1; x++) if ((x + off) % 26 < 13) P.put(x, y, I.LIGHT);
  }
}
function windmill(P, base) {
  const [hx, hy] = HUB;
  // the tower: a tapering octagon of light wash with a mid outline
  P.poly([[hx - 6, base], [hx - 3.5, hy + 2.5], [hx + 3.5, hy + 2.5], [hx + 6, base]], I.LIGHT);
  P.line(hx - 6, base, hx - 3.5, hy + 2.5, I.MID); P.line(hx + 6, base, hx + 3.5, hy + 2.5, I.MID);
  P.line(hx - 1, base - 1, hx - 1.5, hy + 4, I.MID);      // a facet edge
  // the cap
  P.poly([[hx - 4.5, hy + 3], [hx - 3, hy - 1.5], [hx + 3, hy - 1.5], [hx + 4.5, hy + 3]], I.MID);
  // the stage (gallery) round the waist, door, window
  P.line(hx - 8, hy + 9.5, hx + 8, hy + 9.5, I.MID); P.put(hx - 8, hy + 10.5, I.MID); P.put(hx + 8, hy + 10.5, I.MID);
  P.poly([[hx - 1.5, base], [hx - 1.5, base - 4], [hx + 1.5, base - 4], [hx + 1.5, base]], I.MID);
  P.put(hx + 1, hy + 5.5, I.MID); P.put(hx + 1, hy + 6.5, I.MID);
}
function bank(P, x0, x1, y0, slope) {
  for (let x = x0; x <= x1; x++) {
    const top = y0 + Math.max(0, (x0 + slope - x)) * 0.8;
    P.put(x, top, I.MID);
    for (let y = Math.ceil(top) + 2; y < TH; y += 2) if ((x * 5 + y * 3) % 7 < 3) P.put(x, y, I.LIGHT);
  }
}

/** The static painting of a tableau, glaze per tile from `glazeOf(tileIndex 0..11)`. */
export function paintTableau(kind, glazeOf) {
  const a = new Uint8Array(TW * TH);
  for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) a[y * TW + x] = glazeOf((y >> 4) * 6 + (x >> 4));
  const P = painter(a, TW, TH), r = rng(kind.length * 31 + 5);
  if (kind === 'polder') {
    skyline(P, r, 1, 54, 18);
    water(P, 0, 60, 21, 31, r);
    bank(P, 56, 95, 26, 6);
    windmill(P, 29);
    // a fence of posts along the bank
    for (let x = 88; x < 96; x += 3) P.line(x, 27, x, 29, I.MID);
  } else if (kind === 'harbour') {
    skyline(P, r, 2, 40, 17);
    water(P, 0, 95, 20, 31, r);
    // the pier and its light on the right
    P.poly([[70, 31], [70, 25], [96, 23], [96, 31]], I.LIGHT);
    P.line(70, 25, 96, 23, I.MID);
    for (let x = 72; x < 96; x += 4) P.line(x, 26, x, 31, I.MID);
    P.poly([[84, 23.5], [85.5, 8], [88.5, 8], [90, 23]], I.LIGHT);
    P.line(84, 23.5, 85.5, 8, I.MID); P.line(90, 23, 88.5, 8, I.MID);
    P.poly([[84.5, 8], [87, 4], [89.5, 8]], I.MID);
    P.line(85, 13, 89, 13, I.MID); P.line(84.5, 18, 89.5, 18, I.MID);
    P.put(87, 6, I.G0); P.put(86, 6, I.G0);
  } else {                                     // winter: a frozen canal
    skyline(P, r, 1, 54, 18);
    ice(P, 0, 62, 21, 31);
    bank(P, 56, 95, 26, 6);
    windmill(P, 29);
    // a koek-en-zopie tent on the ice
    P.poly([[16, 27], [19.5, 22], [23, 27]], I.LIGHT);
    P.line(16, 27, 19.5, 22, I.MID); P.line(23, 27, 19.5, 22, I.MID); P.line(19.5, 22, 19.5, 20, I.MID); P.put(20, 20, I.MID);
  }
  return a;
}

// ------------------------------------------------------------ the big sails: 32 angles per quarter turn
export const SAILS2 = [];
{
  const N = SAIL_BOX, c0 = (N - 1) / 2 + 0.5;
  for (let k = 0; k < SAIL_STEPS2; k++) {
    const a0 = (k / SAIL_STEPS2) * (Math.PI / 2) + 0.35;
    const m = new Int8Array(N * N).fill(-1);
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        let cm = 0, cl = 0;
        for (let sy = 0; sy < 4; sy++)
          for (let sx = 0; sx < 4; sx++) {
            const px = x + (sx + 0.5) / 4 - c0, py = y + (sy + 0.5) / 4 - c0;
            let mid = false, lt = false;
            for (let q = 0; q < 4; q++) {
              const ang = a0 + (q * Math.PI) / 2, ux = Math.cos(ang), uy = Math.sin(ang);
              const al = px * ux + py * uy, ac = -px * uy + py * ux;     // along the arm, across it
              if (al > -0.5 && al < SAIL_R && Math.abs(ac) < 0.6) mid = true;
              else if (al > 3 && al < SAIL_R - 0.3 && ac > 0.6 && ac < 3.9) {
                // the sail: a lattice of laths, its outer edge a line
                if (ac > 3.1 || al > SAIL_R - 1.1 || ((al - 3) % 2.6) < 0.7) mid = true; else lt = true;
              }
            }
            if (Math.hypot(px, py) < 1.3) mid = true;
            if (mid) cm += 1 / 16; else if (lt) cl += 1 / 16;
          }
        const v = covIndex(cm, cl);
        if (v >= 0) m[y * N + x] = v;
      }
    SAILS2.push(m);
  }
}

// ------------------------------------------------------------ the flower vase: 2 x 3 tiles (32 x 48)
// The Delft tile picture everyone knows: a baluster vase of tulips. The vase,
// leaves and stems are painted; the tulip heads are drawn each frame so they
// can nod, a slow wave of wind passing through them.
export const VW = 32, VH = 48;
const VASES = [
  // [lip half-width, neck, shoulder, belly, foot] half-widths, and the band pattern
  { lip: 6, neck: 3.5, sh: 8, belly: 9.5, foot: 5, band: 'dots' },
  { lip: 7, neck: 4, sh: 10, belly: 9, foot: 6, band: 'zig' },
  { lip: 5.5, neck: 3, sh: 7, belly: 10, foot: 4.5, band: 'dots' },
];
export function paintVase(kind, glazeOf) {
  const a = new Uint8Array(VW * VH);
  for (let y = 0; y < VH; y++) for (let x = 0; x < VW; x++) a[y * VW + x] = glazeOf((y >> 4) * 2 + (x >> 4));
  const P = painter(a, VW, VH), V = VASES[kind], cx = 15.5;
  // the vase's profile, top to bottom: lip 26, neck 29, shoulder 33, belly 39, foot 45..46
  const prof = [[26, V.lip], [27, V.lip - 1], [29, V.neck], [31, V.neck + 1.5], [33, V.sh], [37, V.belly], [41, V.belly - 0.5], [43, V.sh - 2], [44.5, V.foot - 1.5], [45.5, V.foot], [46.5, V.foot]];
  const half = (y) => {
    for (let k = 1; k < prof.length; k++) if (y <= prof[k][0]) { const [y0, w0] = prof[k - 1], [y1, w1] = prof[k]; return w0 + ((w1 - w0) * (y - y0)) / (y1 - y0); }
    return prof[prof.length - 1][1];
  };
  const left = [], right = [];
  for (let y = 26; y <= 46.5; y += 0.5) { left.push([cx - half(y), y]); right.unshift([cx + half(y), y]); }
  // stems and leaves first, the vase over their feet
  const heads = [];
  const tips = [[3.5, 11], [9.5, 5], [15.5, 0.5], [21.5, 5], [27.5, 11]];
  tips.forEach(([tx, ty], i) => {
    const bx = cx + (i - 2) * 1.2;
    for (let k = 0; k <= 16; k++) {
      const u = k / 16, x = bx + (tx - bx) * (u * u * 0.6 + u * 0.4), y = 26 + (ty + 6 - 26) * u;
      P.put(x, y, I.MID);
    }
    heads.push([tx - 3, ty]);
  });
  // leaves: long blades curving out from the neck
  for (const [sx, dir, len, lift] of [[cx - 2, -1, 13, 6], [cx + 2, 1, 13, 7], [cx - 1, -1, 8, 13], [cx + 1, 1, 8, 14]]) {
    const pts = [];
    for (let k = 0; k <= 10; k++) { const u = k / 10; pts.push([sx + dir * len * u, 26 - lift * Math.sin(u * 2.4) * 0.8 - u * 2]); }
    const up = pts.map(([x, y], k) => [x, y - 2.4 * Math.sin((k / 10) * Math.PI)]);
    P.poly(up.concat(pts.slice().reverse()), I.LIGHT);
    for (const [x, y] of pts) P.put(x, y, I.MID);
  }
  P.poly(left.concat(right), I.LIGHT);
  for (const [x, y] of left) P.put(x, y, I.MID);
  for (const [x, y] of right) P.put(x - 1, y, I.MID);
  P.line(cx - V.lip, 26, cx + V.lip - 1, 26, I.MID);
  P.line(cx - V.foot, 46, cx + V.foot - 1, 46, I.MID);
  // the vase's painted bands: a line at the shoulder, a pattern round the belly
  P.line(cx - half(33) + 1, 33, cx + half(33) - 2, 33, I.MID);
  for (let x = Math.ceil(cx - half(38)) + 1; x < cx + half(38) - 1; x++) {
    if (V.band === 'dots') { if ((x & 1) === 0) P.put(x, 37, I.MID); if ((x % 4) === 1) P.put(x, 39, I.MANG); }
    else { P.put(x, 37 + ((x >> 1) & 1) * 2, I.MID); P.put(x, 38, ((x >> 1) & 1) ? I.MANG : I.LIGHT); }
  }
  P.line(cx - half(42) + 1, 42, cx + half(42) - 2, 42, I.MID);
  return { img: a, heads };
}
