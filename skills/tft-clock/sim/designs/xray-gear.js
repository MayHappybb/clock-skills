// The objects for xray.js: everything that can go through the tunnel, as
// X-ray thickness maps.
//
// An X-ray image is not a picture of surfaces: each pixel is how much
// material the beam crossed on its way to the detector. So every object here
// is a set of strokes and fills that ADD thickness into two channels, organic
// (low Z: leather, plastic, fruit, fabric) and metal (high Z: steel, copper,
// the cells of a battery). A round section (cable, banana, rod) is thickest
// on its axis (profile 'solid'), a hollow shell is darkest at its walls
// ('tube'), a plate is even ('flat'). Overlaps simply add, which is why two
// things lying on each other go darker, as real scans do.
//
// All of it is rasterised once, at load, into byte maps (UNIT = one
// attenuation unit; 255 = nearly opaque): on the device these are tables in
// flash. Per minute, xray.js packs a bag by adding sprites; per frame it only
// looks the two channels up in a colour table.

import { hash } from '../js/kit.js';

export const BW = 160, BH = 80;                 // a bag image is the size of the glass
export const CW = 28, CH = 46;                  // a digit's packing cell
export const SW = 40, SH = 56, PX = 6, PY = 5;  // a digit's sprite and the cell's place in it
export const UNIT = 64;

// [organic, metal] attenuation per unit of thickness
const MAT = {
  leather: [1.55, 0.03], plastic: [1.25, 0], abs: [1.0, 0], foam: [1.2, 0], fabric: [1.25, 0], cloth: [0.1, 0], wood: [1.5, 0],
  banana: [1.6, 0.02], stem: [2.8, 0.04], rubber: [0.8, 0.02], bristle: [0.6, 0],
  steel: [0.04, 1.7], wire: [0.0, 1.55], alu: [0.16, 0.42], glass: [0.3, 0.36], copper: [0.0, 1.1],
  cell: [0.1, 2.0], cable: [0.62, 0.1], coin: [0.0, 1.5], chrome: [0.05, 2.4], pcb: [0.3, 0.28],
};

// ------------------------------------------------------------ geometry helpers (degrees, screen y down)

const RAD = Math.PI / 180;
function arc(cx, cy, rx, ry, a0, a1, r0, r1 = r0, n = 0) {
  n = n || Math.max(8, Math.ceil(Math.abs(a1 - a0) / 7));
  const out = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, a = (a0 + (a1 - a0) * u) * RAD;
    out.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a), typeof r0 === 'function' ? r0(u) : r0 + (r1 - r0) * u]);
  }
  return out;
}
function bez(p0, p1, p2, r0, r1 = r0, n = 14) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u;
    out.push([a * p0[0] + b * p1[0] + c * p2[0], a * p0[1] + b * p1[1] + c * p2[1], r0 + (r1 - r0) * u]);
  }
  return out;
}
function ellipse(cx, cy, rx, ry, n = 36) {
  const out = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * 2 * Math.PI; out.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]); }
  return out;
}
function rrect(x, y, w, h, r, n = 4) {
  const out = [];
  for (const [cx, cy, a0] of [[x + w - r, y + r, -90], [x + w - r, y + h - r, 0], [x + r, y + h - r, 90], [x + r, y + r, 180]])
    for (let i = 0; i <= n; i++) { const a = (a0 + (90 * i) / n) * RAD; out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return out;
}
const line = (x0, y0, x1, y1, r0, r1 = r0) => [[x0, y0, r0], [x1, y1, r1]];

// primitive builders: a list of { k, pts, mat, prof, closed, depth }
const S = (L, pts, mat, prof = 'solid', closed = false) => L.push({ k: 'S', pts, mat: MAT[mat] ?? mat, prof, closed });
const F = (L, pts, mat, prof = 'flat', depth = 1) => L.push({ k: 'F', pts, mat: MAT[mat] ?? mat, prof, depth });
const dot = (L, x, y, r, mat, prof = 'solid') => S(L, [[x, y, r], [x + 0.01, y, r]], mat, prof);
const neg = (m, k = 1) => { const v = MAT[m] ?? m; return [-v[0] * k, -v[1] * k]; };

// ------------------------------------------------------------ the rasteriser (load time only)

const SS = 3;
function prof(p, e) {
  if (p === 'flat') return 1;
  if (p === 'solid') return Math.sqrt(1 - e * e);
  if (p === 'tube') return 1.5 * (Math.sqrt(1 - e * e) - (e < 0.72 ? Math.sqrt(0.5184 - e * e) : 0)) + 0.18;
  if (p === 'strap') return 0.8 + 0.45 * e ** 6;
  return 1;
}

class Layer {
  constructor(w, h) { this.w = w; this.h = h; this.o = new Float32Array(w * h); this.m = new Float32Array(w * h); }
}

function rasterStroke(L, P) {
  const pts = P.pts, n = pts.length, segs = P.closed ? n : n - 1;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [x, y, r] of pts) { x0 = Math.min(x0, x - r); y0 = Math.min(y0, y - r); x1 = Math.max(x1, x + r); y1 = Math.max(y1, y + r); }
  const ix0 = Math.max(0, Math.floor(x0)), iy0 = Math.max(0, Math.floor(y0)), ix1 = Math.min(L.w - 1, Math.ceil(x1)), iy1 = Math.min(L.h - 1, Math.ceil(y1));
  for (let py = iy0; py <= iy1; py++)
    for (let px = ix0; px <= ix1; px++) {
      let acc = 0;
      for (let sy = 0; sy < SS; sy++)
        for (let sx = 0; sx < SS; sx++) {
          const X = px + (sx + 0.5) / SS, Y = py + (sy + 0.5) / SS;
          let best = 2;
          for (let s = 0; s < segs; s++) {
            const a = pts[s], b = pts[(s + 1) % n];
            const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
            let u = l2 ? ((X - a[0]) * dx + (Y - a[1]) * dy) / l2 : 0;
            u = u < 0 ? 0 : u > 1 ? 1 : u;
            const ex = X - a[0] - u * dx, ey = Y - a[1] - u * dy, r = a[2] + (b[2] - a[2]) * u;
            const e = Math.sqrt(ex * ex + ey * ey) / r;
            if (e < best) best = e;
          }
          if (best < 1) acc += prof(P.prof, best);
        }
      if (acc) { const i = py * L.w + px, k = acc / (SS * SS); L.o[i] += P.mat[0] * k; L.m[i] += P.mat[1] * k; }
    }
}

function rasterFill(L, P) {
  const pts = P.pts, n = pts.length;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const ix0 = Math.max(0, Math.floor(x0)), iy0 = Math.max(0, Math.floor(y0)), ix1 = Math.min(L.w - 1, Math.ceil(x1)), iy1 = Math.min(L.h - 1, Math.ceil(y1));
  for (let py = iy0; py <= iy1; py++)
    for (let px = ix0; px <= ix1; px++) {
      let acc = 0;
      for (let sy = 0; sy < SS; sy++)
        for (let sx = 0; sx < SS; sx++) {
          const X = px + (sx + 0.5) / SS, Y = py + (sy + 0.5) / SS;
          let inside = false, d = 1e9;
          for (let i = 0, j = n - 1; i < n; j = i++) {
            const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
            if ((yi > Y) !== (yj > Y) && X < ((xj - xi) * (Y - yi)) / (yj - yi) + xi) inside = !inside;
            if (P.prof !== 'flat') {
              const dx = xi - xj, dy = yi - yj, l2 = dx * dx + dy * dy;
              let u = l2 ? ((X - xj) * dx + (Y - yj) * dy) / l2 : 0;
              u = u < 0 ? 0 : u > 1 ? 1 : u;
              const ex = X - xj - u * dx, ey = Y - yj - u * dy;
              d = Math.min(d, Math.sqrt(ex * ex + ey * ey));
            }
          }
          if (inside) acc += P.prof === 'flat' ? 1 : Math.min(1, d / P.depth) ** 0.6;
        }
      if (acc) { const i = py * L.w + px, k = acc / (SS * SS); L.o[i] += P.mat[0] * k; L.m[i] += P.mat[1] * k; }
    }
}

/** Rotate a primitive list by `tilt` degrees about (cx, cy), then move it by (ox, oy). */
function place(list, tilt, cx, cy, ox, oy) {
  const c = Math.cos(tilt * RAD), s = Math.sin(tilt * RAD);
  return list.map((P) => ({ ...P, pts: P.pts.map(([x, y, r]) => [cx + (x - cx) * c - (y - cy) * s + ox, cy + (x - cx) * s + (y - cy) * c + oy, r]) }));
}

function rasterise(list, w, h) {
  const L = new Layer(w, h);
  for (const P of list) (P.k === 'S' ? rasterStroke : rasterFill)(L, P);
  const o = new Uint8Array(w * h), m = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    o[i] = Math.max(0, Math.min(255, Math.round(L.o[i] * UNIT)));
    m[i] = Math.max(0, Math.min(255, Math.round(L.m[i] * UNIT)));
  }
  return { w, h, o, m };
}

// ------------------------------------------------------------ the ten digit packings (cell 28 x 46)

function d0() {   // a leather belt, coiled once and a bit, its steel buckle at the top
  const L = [];
  const turns = 360 + 120;
  const coil = arc(14, 23.5, 11.3, 19.6, -90, -90 + turns, 2.55, 2.55, 70).map((p, i, a) => {
    const u = i / (a.length - 1);                          // the coil tightens as it goes in
    return [14 + (p[0] - 14) * (1 - 0.34 * u), 23.5 + (p[1] - 23.5) * (1 - 0.17 * u), p[2]];
  });
  S(L, coil, 'leather', 'strap');
  for (let i = 2; i < coil.length - 3; i += 2) dot(L, coil[i][0], coil[i][1], 0.45, 'stem', 'flat');   // stitching down the middle
  for (const i of [60, 64, 68]) dot(L, coil[i][0], coil[i][1], 0.8, neg('leather', 1.1), 'flat');   // holes in the tail
  // buckle: a steel frame and its prong, at the strap's end
  S(L, rrect(4.5, 0.6, 9.5, 6.4, 1.6).map(([x, y]) => [x, y, 0.95]), 'steel', 'solid', true);
  S(L, line(5.5, 3.8, 13.5, 3.8, 0.55), 'steel');
  S(L, line(13.5, 1.2, 13.5, 6.4, 0.9), 'steel');
  return L;
}

function d1() {   // a folded umbrella: a straight furled sleeve, the crook a small flag to the upper left
  const L = [];
  // the crook: up out of the shaft, over and down to the left, like a 1's flag
  S(L, [[16.1, 10, 1.9], [16.0, 6.2, 1.9], [15.0, 4.4, 1.85], [13.2, 4.0, 1.8], [11.6, 5.0, 1.75], [10.6, 6.8, 1.7], [10.4, 8.0, 1.6]], 'wood');
  dot(L, 10.4, 8.3, 0.9, 'stem');                                                  // the end cap
  // the furled canopy: a tapered sleeve, its seams and steel ribs showing through
  const sleeve = [[13.0, 10.2], [19.2, 10.2], [19.6, 14], [18.9, 30], [17.4, 40.5], [14.8, 40.5], [13.3, 30], [12.6, 14]];
  F(L, sleeve, [1.7, 0], 'pillow', 1.8);
  for (const [x0, x1] of [[13.9, 15.4], [18.3, 16.8]]) S(L, line(x0, 12, x1, 39, 0.4), [0, 0.42]);   // ribs
  S(L, line(13.3, 13, 15.4, 39.5, 0.5), 'fabric');                                // a fold
  S(L, line(12.8, 22, 19.3, 21.4, 1.0), 'fabric');                                // the strap
  dot(L, 18.4, 21.5, 0.95, 'steel');                                              // its snap
  F(L, rrect(14.2, 9.6, 3.8, 2.6, 0.8), 'steel');                                 // the runner
  // shaft, ferrule
  S(L, line(16.1, 9, 16.1, 41, 0.6), [0, 1.1]);
  S(L, line(16.1, 40, 16.1, 44.8, 1.1, 0.7), 'chrome');
  return L;
}

function d2() {   // a power bank and its cable: the cable is the hook and the diagonal
  const L = [];
  F(L, rrect(1.5, 36.5, 25.5, 9, 2), 'abs');
  S(L, rrect(1.5, 36.5, 25.5, 9, 2).map(([x, y]) => [x, y, 0.7]), 'plastic', 'solid', true);
  S(L, line(4.6, 41, 13.2, 41, 2.9), 'cell');
  S(L, line(15.2, 41, 23.8, 41, 2.9), 'cell');
  F(L, rrect(24.6, 38.5, 1.6, 5, 0.5), 'pcb');
  // the cable, with a copper core
  const path = [...arc(13.8, 13.8, 10.1, 10, 180, 360 + 22, 1.95, 1.95, 30), [5, 35.5, 1.95], [3.6, 37.4, 1.95]];
  S(L, path.map(([x, y]) => [x, y, 2.1]), [1.35, 0.02], 'tube');      // the rubber jacket
  S(L, path.map(([x, y]) => [x, y, 0.55]), [0, 0.85]);                // the copper core
  // the plug, hanging off the free end
  S(L, line(3.7, 13.5, 3.7, 18.5, 2.3, 2.0), 'plastic');
  S(L, line(3.7, 18.5, 3.7, 21.6, 1.25), 'steel', 'tube');
  return L;
}

function d3() {   // a hand of two bananas: stalks joined at the crown in the middle, tips out
  const L = [];
  const taper = (a, b, c) => (u) => u < 0.5 ? a + (b - a) * Math.sin(Math.PI * u) ** 0.6 : c + (b - c) * Math.sin(Math.PI * u) ** 0.6;
  const top = arc(12.4, 13.0, 10.8, 9.6, 102, -160, taper(1.5, 3.4, 0.7), 0, 30);   // from the crown, up round, to its tip
  const bot = arc(12.6, 33.4, 12.4, 11.3, -102, 160, taper(1.6, 3.9, 0.7), 0, 32);
  for (const b of [top, bot]) {
    S(L, b, 'banana');
    S(L, b.slice(5, -5).map(([x, y, r]) => [x, y, r * 0.2]), neg('banana', 0.45), 'flat');   // the ridge down its back
    const t = b[b.length - 1];
    dot(L, t[0], t[1], 1.0, 'stem');                                         // the black tip
  }
  // the crown: both stalks into one woody knob
  S(L, [[11.4, 21.4, 1.6], [8.5, 22.6, 2.2], [6.2, 23.2, 1.9]], 'stem');
  return L;
}

function d4() {   // a rubber-coated wire hanger, hook on top; a skirt clip hangs from its corner
  const L = [];
  const tri = [[20.5, 5.5], [2.4, 30.5], [20.5, 30.5]];
  const coat = (pts, closed) => {
    S(L, pts.map(([x, y]) => [x, y, 2.3]), [1.45, 0.02], 'tube', closed);         // the orange sleeve
    S(L, pts.map(([x, y]) => [x, y, 0.65]), [0, 0.8], 'solid', closed);          // the wire inside it
  };
  coat(tri, true);
  // the neck, twisted, and the hook over it
  S(L, line(19.6, 6.2, 21.4, 2.6, 0.6), 'wire');
  S(L, line(21.4, 6.2, 19.6, 2.6, 0.6), 'wire');
  S(L, [[20.5, 3.0, 0.7], ...arc(22.9, 1.0, 2.4, 2.6, 180, 405, 0.7, 0.7, 10)], 'wire');
  // the skirt clip: a steel strap down from the corner, a sprung clip at its foot
  S(L, line(20.5, 31, 20.5, 39, 0.95), 'steel');
  F(L, rrect(17.4, 38.6, 6.2, 6.4, 1.2), 'plastic', 'pillow', 1.4);
  S(L, line(18.4, 41.8, 22.6, 41.8, 0.5), 'steel');
  dot(L, 20.5, 39.6, 0.8, 'chrome');
  return L;
}

function d5() {   // a toothbrush on top, a travel neck pillow bent into the bowl
  const L = [];
  S(L, [[3.2, 4.6, 2.1], [12, 4.4, 2.4], [19, 4.6, 1.9], [26.6, 4.8, 2.1]], 'plastic');
  for (let x = 19.6; x <= 26.2; x += 1.6) {
    S(L, line(x, 5.5, x, 9.4, 0.55), 'bristle');
    dot(L, x, 5.4, 0.45, 'steel');
  }
  const pillow = [[6.6, 6.5, 2.4], [6.4, 13, 3.1], ...arc(14.2, 30.2, 12.1, 11.6, -128, 142, 3.4, 3.0, 30)];
  S(L, pillow, 'foam');
  for (let i = 3; i < pillow.length - 1; i += 2) dot(L, pillow[i][0], pillow[i][1], 0.5, 'steel');   // the zip down its spine
  dot(L, pillow[pillow.length - 1][0] + 0.6, pillow[pillow.length - 1][1] + 1.6, 1.2, 'steel');
  return L;
}

function d6() {   // a paddle hairbrush with steel pins; the handle is the 6's rise
  const L = [];
  F(L, ellipse(14, 31.6, 8.3, 9.6), 'rubber', 'flat');
  S(L, ellipse(14, 31.6, 10.3, 11.6).map(([x, y]) => [x, y, 2.4]), 'plastic', 'solid', true);
  for (let j = -2; j <= 2; j++)
    for (let i = -2; i <= 2; i++) {
      const x = 14 + i * 3.1 + (j & 1) * 1.5, y = 31.6 + j * 3.6;
      if (((x - 14) / 7) ** 2 + ((y - 31.6) / 8.2) ** 2 > 1) continue;
      dot(L, x, y, 0.55, 'steel');
    }
  S(L, bez([5.0, 26.5], [4.4, 9], [21.5, 3.2], 2.7, 2.1), 'plastic');
  dot(L, 18.6, 4.2, 0.9, neg('plastic', 1.2), 'flat');
  return L;
}

function d7() {   // a hair dryer: the barrel is the bar, the handle the stroke down
  const L = [];
  S(L, line(4, 8, 23.5, 8, 4.5), 'abs', 'tube');
  S(L, line(0.6, 8, 4, 8, 3.1, 3.4), 'abs', 'tube');
  S(L, line(25.2, 4.5, 25.2, 11.5, 0.8), 'plastic');
  S(L, line(19.6, 8, 22.4, 8, 2.7), [0.2, 1.5]);           // motor
  dot(L, 21, 8, 0.8, 'chrome');
  const coil = [];
  for (let i = 0; i <= 12; i++) coil.push([5.6 + i * 1.0, i & 1 ? 5.2 : 10.8, 0.42]);
  S(L, coil, 'wire');
  S(L, [[20.2, 11.5, 3.1], [15.5, 27, 3.0], [10.6, 42.5, 2.9]], 'abs', 'tube');
  S(L, line(17.8, 18.8, 17, 22, 0.9), 'steel');
  S(L, [[10.6, 43.5, 1.2], [9.8, 46.5, 1.2], [7.2, 49.5, 1.2]], 'cable');
  S(L, [[10.6, 43.5, 0.4], [9.8, 46.5, 0.4], [7.2, 49.5, 0.4]], 'copper');
  return L;
}

function d8() {   // sunglasses, lying on their side: two lenses stacked
  const L = [];
  F(L, ellipse(14, 12, 7.6, 7.0), 'glass');
  F(L, ellipse(14, 32.6, 9.0, 9.1), 'glass');
  S(L, ellipse(14, 12, 9.4, 8.7).map(([x, y]) => [x, y, 1.9]), 'plastic', 'solid', true);
  S(L, ellipse(14, 32.6, 10.8, 10.9).map(([x, y]) => [x, y, 2.0]), 'plastic', 'solid', true);
  S(L, line(14, 19.5, 14, 22.8, 1.25), 'steel');
  dot(L, 10.6, 22, 1.05, 'rubber'); dot(L, 17.4, 22, 1.05, 'rubber');
  S(L, line(10.6, 22, 13, 21, 0.4), 'wire'); S(L, line(17.4, 22, 15, 21, 0.4), 'wire');
  dot(L, 5.6, 8.6, 1.1, 'steel'); dot(L, 22.4, 8.6, 1.1, 'steel');   // hinges
  return L;
}

function d9() {   // a door key on a split ring
  const L = [];
  S(L, ellipse(12.6, 13.2, 9.6, 9.9).map(([x, y]) => [x, y, 2.9]), 'steel', 'flat', true);
  S(L, [[21.4, 15, 2.8], [21.6, 41, 2.8], [20.6, 44.6, 1.6]], 'steel', 'flat');
  for (const y of [25, 29.5, 34, 38.5]) dot(L, 18.9, y, 1.05, neg('steel', 0.95), 'solid');
  S(L, line(22.2, 21, 22.2, 40, 0.55), neg('steel', 0.45), 'flat');
  S(L, ellipse(4.6, 4.4, 4.2, 4.2).map(([x, y]) => [x, y, 0.75]), 'chrome', 'solid', true);
  return L;
}

// what a screener would look at on each (cell coordinates): the loupe's stops
const LOOK = [[[9, 3.8]], [[16, 42], [11, 6]], [[14, 41], [3.7, 19]], [[9, 22]], [[21.5, 2], [20.5, 41]], [[23, 7]], [[14, 31], [12, 9]], [[11, 8], [21, 8]], [[14, 21]], [[19, 32], [5, 4]]];
const DIGITS = [d0, d1, d2, d3, d4, d5, d6, d7, d8, d9];
// how each object lies in a bag (degrees): part of the packing, not random
// two ways each can lie, so no two bags are packed quite alike
const TILT = [[-3, 4], [4, -3], [-2, 3], [3, -3], [-4, 3], [2, -4], [-3, 4], [3, -2], [-2, 4], [5, -3]];

/** The digit sprites, two lies of each: DIGIT[d][v] = { w, h, o, m } byte maps, SW x SH, cell at (PX, PY). */
export const DIGIT = DIGITS.map((fn, d) => TILT[d].map((t) => rasterise(place(fn(), t, CW / 2, CH / 2, PX, PY), SW, SH)));

// ------------------------------------------------------------ small things

function sprite(fn, w, h) { const L = []; fn(L); return rasterise(L, w, h); }

export const COIN = sprite((L) => {
  F(L, ellipse(4.5, 4.5, 3.2, 3.2), 'coin');
  S(L, ellipse(4.5, 4.5, 3.0, 3.0).map(([x, y]) => [x, y, 0.5]), 'coin', 'solid', true);
}, 9, 9);

/** Loose things that ride in the margins: [sprite, width, height]. */
export const FILLER = [
  sprite((L) => { S(L, line(2, 3.5, 11, 3.5, 2.1), 'cell'); S(L, line(11, 3.5, 12.6, 3.5, 0.9), 'steel'); }, 15, 7),                 // AA battery
  sprite((L) => { S(L, line(1.5, 3, 19, 3, 1.4), 'plastic'); S(L, line(4, 3, 15, 3, 0.4), 'wire'); S(L, line(19, 3, 21, 3, 0.8, 0.3), 'steel'); S(L, line(3, 1.4, 9, 1.4, 0.5), 'steel'); }, 23, 6),   // pen
  sprite((L) => { S(L, rrect(1.5, 1.5, 10, 4, 2).map(([x, y]) => [x, y, 0.5]), 'wire', 'solid', true); S(L, rrect(3, 2.5, 7, 2.2, 1.1).map(([x, y]) => [x, y, 0.5]), 'wire', 'solid', true); }, 14, 7), // paperclip
  sprite((L) => { S(L, line(2.5, 3.5, 11, 3.5, 2.4), 'plastic', 'tube'); F(L, rrect(11, 1.4, 5, 4.2, 0.8), 'steel'); F(L, rrect(4, 2.2, 5, 2.6, 0.5), 'pcb'); }, 18, 7),  // USB stick
  sprite((L) => { S(L, line(2.5, 3.5, 10, 3.5, 2.6), 'plastic', 'tube'); S(L, line(3, 3.5, 7, 3.5, 1.7), 'stem'); }, 13, 7),         // lip balm
  sprite((L) => { F(L, rrect(1, 1, 12, 6, 3), 'plastic', 'pillow', 1.2); dot(L, 4.6, 4, 1.0, 'steel'); dot(L, 9.4, 4, 1.0, 'steel'); S(L, line(4, 1.6, 10, 1.6, 0.4), 'wire'); }, 14, 8), // earbud case
];

// folded clothes: big, faint, the bag's padding
export const GARMENT = [
  sprite((L) => { F(L, rrect(1, 1, 44, 30, 6), 'cloth', 'pillow', 7); S(L, line(3, 16, 43, 15, 0.8), 'cloth'); for (let y = 6; y < 28; y += 6) dot(L, 23, y, 0.9, 'plastic'); }, 46, 32),  // a shirt
  sprite((L) => { F(L, rrect(1, 1, 36, 26, 8), 'cloth', 'pillow', 7); S(L, [[3, 9, 0.7], [20, 11, 0.7], [35, 8, 0.7]], 'cloth'); S(L, [[3, 19, 0.7], [18, 17, 0.7], [35, 20, 0.7]], 'cloth'); }, 38, 28),  // a jumper
  sprite((L) => { F(L, rrect(1, 1, 28, 20, 8), 'cloth', 'pillow', 6); S(L, line(4, 10, 26, 11, 0.6), 'cloth'); }, 30, 22),   // socks
];

// ------------------------------------------------------------ bag shells (the whole glass)

function hardCase(L) {
  F(L, rrect(1.5, 1.5, 157, 77, 9), [0.1, 0], 'flat');
  S(L, rrect(1.5, 1.5, 157, 77, 9).map(([x, y]) => [x, y, 1.6]), 'abs', 'solid', true);
  // zip round the edge
  const z = rrect(4.6, 4.6, 150.8, 70.8, 6, 6);
  for (let i = 0; i < z.length; i++) {
    const a = z[i], b = z[(i + 1) % z.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let t = 0; t < len; t += 1.9) dot(L, a[0] + ((b[0] - a[0]) * t) / len, a[1] + ((b[1] - a[1]) * t) / len, 0.48, 'steel');
  }
  F(L, rrect(8, 2.6, 6, 3.4, 1), 'steel');                 // zip pull
  // telescopic trolley: two aluminium tubes and the grip
  S(L, line(8, 8.6, 146, 8.6, 1.7), 'alu', 'tube');
  S(L, line(8, 71.4, 146, 71.4, 1.7), 'alu', 'tube');
  S(L, line(6.2, 7, 6.2, 73, 2.6), 'plastic', 'tube');
  S(L, line(146, 8.6, 150, 8.6, 2.3), 'plastic');
  S(L, line(146, 71.4, 150, 71.4, 2.3), 'plastic');
  // wheels at the far end
  for (const y of [8.6, 71.4]) { F(L, ellipse(153.2, y, 3.6, 3.2), 'rubber', 'pillow', 1.5); dot(L, 153.2, y, 1.1, 'chrome'); }
}

function duffel(L) {
  const body = [];
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * 2 * Math.PI, c = Math.cos(a), s = Math.sin(a);
    body.push([80 + 78 * Math.sign(c) * Math.abs(c) ** 0.35, 40 + 38 * Math.sign(s) * Math.abs(s) ** 0.5]);
  }
  F(L, body, [0.14, 0], 'pillow', 3);
  S(L, body.map(([x, y]) => [x, y, 1.3]), 'fabric', 'solid', true);
  // a zip along the top, two handles' D-rings and the shoulder strap's hooks
  for (let x = 14; x < 146; x += 1.9) dot(L, x, 5.8 + 0.6 * Math.sin(x * 0.05), 0.48, 'steel');
  F(L, rrect(144, 4, 7, 3.6, 1), 'steel');
  for (const x of [40, 120]) for (const y of [3.6, 76.4]) S(L, arc(x, y, 3.2, 2.4, 180, 360, 0.7), 'steel', 'solid', true);
  S(L, line(14, 75.2, 146, 75.2, 1.5), 'fabric', 'strap');
  for (const x of [12, 148]) { S(L, rrect(x - 3, 72.6, 6, 5, 1.6).map(([a, b]) => [a, b, 0.8]), 'steel', 'solid', true); }
  S(L, line(4, 40, 156, 40, 0.01), 'fabric');
}

export const SHELL = [sprite(hardCase, BW, BH), sprite(duffel, BW, BH)];

// ------------------------------------------------------------ the tray between bags: a laptop, out of its bag

export const TRAY_W = 140;
export const TRAY = sprite((L) => {
  F(L, rrect(2, 4, 136, 72, 6), [0.12, 0], 'flat');
  S(L, rrect(2, 4, 136, 72, 6).map(([x, y]) => [x, y, 1.5]), 'abs', 'solid', true);
  F(L, rrect(12, 10, 116, 60, 4), 'alu', 'flat');                          // the chassis
  S(L, line(14, 11.5, 126, 11.5, 1.3), 'steel');                           // hinge
  for (let j = 0; j < 4; j++)                                              // keyboard
    for (let i = 0; i < 13; i++) F(L, rrect(17 + i * 6.2 + (j === 3 && i > 3 && i < 9 ? 0 : 0), 15 + j * 5.6, 5, 4.4, 0.8), [0.35, 0.05]);
  F(L, rrect(52, 39, 34, 12, 1.5), [0.2, 0.05]);                            // trackpad
  for (let i = 0; i < 4; i++) F(L, rrect(18 + i * 26, 53, 24, 14, 1.5), 'cell');   // battery pack
  F(L, rrect(98, 14, 26, 36, 1), 'pcb');                                   // board
  for (const [x, y] of [[101, 17], [110, 17], [101, 27], [112, 29]]) F(L, rrect(x, y, 7, 7, 0.5), 'steel');
  S(L, ellipse(117, 41, 6, 6).map(([x, y]) => [x, y, 0.9]), 'steel', 'solid', true);   // fan
  for (let k = 0; k < 7; k++) { const a = (k / 7) * 2 * Math.PI; S(L, line(117, 41, 117 + 5 * Math.cos(a), 41 + 5 * Math.sin(a), 0.5), 'alu'); }
  S(L, [[104, 22, 0.9], [110, 30, 0.9], [113, 38, 0.9]], 'copper');         // heat pipe
}, TRAY_W, BH);

// ------------------------------------------------------------ packing a bag

/** Where the time goes in a bag: cell top-left x per slot, and the coins' centre. */
export const SLOT_X = [11, 43, 86, 119], SLOT_Y = 17, COLON_X = 77.5;

function add(dstO, dstM, spr, x, y) {
  let ops = 0;
  for (let j = 0; j < spr.h; j++) {
    const yy = y + j;
    if (yy < 0 || yy >= BH) continue;
    for (let i = 0; i < spr.w; i++) {
      const xx = x + i;
      if (xx < 0 || xx >= BW) continue;
      const k = j * spr.w + i, d = yy * BW + xx;
      const o = dstO[d] + spr.o[k], m = dstM[d] + spr.m[k];
      dstO[d] = o > 255 ? 255 : o; dstM[d] = m > 255 ? 255 : m;
      ops++;
    }
  }
  return ops;
}

/**
 * Pack the bag for one minute: shell, clothes, loose things, the four
 * digits and the two coins. Deterministic from (key, digits). Returns the
 * maps, the places worth a look (loupe targets) and the hour box.
 */
export function packBag(key, digits) {
  const o = new Uint8Array(BW * BH), m = new Uint8Array(BW * BH);
  const r = (k) => hash(key, k, 77) / 4294967296;
  const shell = SHELL[hash(key, 1, 5) % 3 === 2 ? 1 : 0];
  o.set(shell.o); m.set(shell.m);
  let ops = BW * BH;
  for (let k = 0; k < 2; k++) {
    const gm = GARMENT[(hash(key, 10 + k) % GARMENT.length)];
    ops += add(o, m, gm, Math.round(10 + r(20 + k) * 40 + k * 60), Math.round(14 + r(30 + k) * (52 - gm.h)));
  }
  const targets = [];
  const pos = [];
  for (let i = 0; i < 4; i++) {
    const dx = Math.round(r(40 + i) * 2 - 1), dy = Math.round(r(50 + i) * 4 - 2);
    const x = SLOT_X[i] + dx - PX, y = SLOT_Y + dy - PY;
    pos.push([x + PX, y + PY]);
    ops += add(o, m, DIGIT[+digits[i]][hash(key, 200 + i) & 1], x, y);
    for (const [lx, ly] of LOOK[+digits[i]]) targets.push([x + PX + lx, y + PY + ly]);
  }
  ops += add(o, m, COIN, Math.round(COLON_X - 4.5), 26);
  ops += add(o, m, COIN, Math.round(COLON_X - 4.5 + (r(80) > 0.5 ? 1 : 0)), 46);
  // loose things in the margins, two above the time and two below
  for (let k = 0; k < 4; k++) {
    const fl = FILLER[hash(key, 90 + k) % FILLER.length];
    const top = k < 2, x = Math.round(14 + (k & 1) * 66 + r(100 + k) * (60 - fl.w)), y = top ? 10 : 70 - fl.h;
    ops += add(o, m, fl, x, Math.round(y + (top ? 0 : 0)));
    targets.push([x + fl.w / 2, y + fl.h / 2]);
  }
  // the hour box: round the two hour digits
  const box = [pos[0][0] - 2, Math.min(pos[0][1], pos[1][1]) - 2, pos[1][0] + CW + 2 - (pos[0][0] - 2), CH + 4 + Math.abs(pos[0][1] - pos[1][1])];
  return { key, w: BW, h: BH, o, m, targets, box, ops };
}
