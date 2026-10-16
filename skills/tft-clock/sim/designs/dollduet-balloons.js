// dollduet: foil number balloons, the time's letterforms.
//
// Each numeral is a party foil balloon: one fat puffy stroke with round ends,
// a dark crimped seam all round, and the foil's flat tones: a lit band on the
// upper-left side of every stroke, a shaded rim on the lower right, a white
// glint. The skeletons are drawn here for the purpose (open 4, flagged 1,
// round-bellied 2 3 5 6 9), sized so the counters stay open with a 6 px
// stroke. They are built once into small palette sprites (flash on the
// device, about 20 x 27 px each) and blitted; a sheen band can be swept
// across them (sheen()).
import { hex } from '../js/kit.js';

export const FOIL = {
  // the puppy's balloons: the lavender of its sewn-in tag
  lav: { seam: hex('#3c2a78'), shade: hex('#7d62cc'), base: hex('#a58ae8'), lit: hex('#d2c2fa'), glint: hex('#ffffff') },
  // the panda's: gold foil
  gold: { seam: hex('#6a4410'), shade: hex('#c4861c'), base: hex('#f0bc34'), lit: hex('#fde68a'), glint: hex('#ffffff') },
};

const R = 3.1;          // stroke radius (a 6.2 px stroke)
const SW = 11.5, SH = 18.4; // skeleton box

// Points along an ellipse arc, clock angles (0 = top, clockwise).
function arc(cx, cy, rx, ry, a0, a1, n = 18) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push([cx + rx * Math.sin(a), cy - ry * Math.cos(a)]);
  }
  return out;
}
const PI = Math.PI;

// Each digit: a list of polylines in the skeleton box.
const SKEL = {
  0: [arc(5.75, 9.2, 5.75, 9.2, 0, 2 * PI, 32)],
  1: [[[2.2, 4.2], [6.6, 0], [6.6, SH]]],
  2: [[...arc(5.75, 5.3, 5.75, 5.3, -1.35, 2.05, 16), [0.3, SH], [SW, SH]]],
  3: [arc(5.5, 4.6, 5.3, 4.6, -1.45, PI, 16), arc(5.6, 13.6, 5.9, 4.8, 0, 4.55, 18)],
  4: [[[2.6, 0], [0.2, 12.2], [SW, 12.2]], [[8.6, 5.2], [8.6, SH]]],
  5: [[[SW - 0.4, 0], [1.4, 0], [0.8, 8.0]], arc(5.6, 12.6, 5.9, 5.8, -1.05, 4.15, 18)],
  6: [arc(5.75, 12.6, 5.75, 5.8, 0, 2 * PI, 24), [[9.8, 0.4], [6.2, 0.1], [2.6, 2.2], [0.5, 6.4], [0.0, 12.6]]],
  7: [[[0.2, 0], [SW, 0], [3.6, SH]]],
  8: [arc(5.75, 4.5, 4.7, 4.5, 0, 2 * PI, 22), arc(5.75, 13.4, 5.75, 5.0, 0, 2 * PI, 24)],
  9: [arc(5.75, 5.8, 5.75, 5.8, 0, 2 * PI, 24), [[SW, 5.8], [11.0, 11.4], [9.0, 16.2], [5.6, 18.3], [1.7, 18.0]]],
};

function segNear(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
  let u = L2 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0;
  u = u < 0 ? 0 : u > 1 ? 1 : u;
  const qx = ax + u * dx, qy = ay + u * dy;
  return [Math.hypot(px - qx, py - qy), qx, qy];
}

// Light from the upper left.
const LX = -0.6, LY = -0.8;
const PAD = R + 1.5;

/**
 * Build one balloon sprite: { w, h, data (colour or -1), cls (0 none, 1 seam,
 * 2 shade, 3 base, 4 lit, 5 glint), tail: [x, y] the valve at the bottom }.
 */
function build(d, pal) {
  const w = Math.ceil(SW + 2 * PAD), h = Math.ceil(SH + 2 * PAD);
  const data = new Int32Array(w * h).fill(-1), cls = new Uint8Array(w * h);
  let glint = null, best = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const px = x + 0.5 - PAD, py = y + 0.5 - PAD;
      let dm = 1e9, qx = 0, qy = 0;
      for (const line of SKEL[d])
        for (let i = 1; i < line.length; i++) {
          const [e, ex, ey] = segNear(px, py, line[i - 1][0], line[i - 1][1], line[i][0], line[i][1]);
          if (e < dm) { dm = e; qx = ex; qy = ey; }
        }
      const sd = dm - R;
      let k = 0;
      if (sd > 1.0) continue;
      if (sd > 0) k = 1;
      else {
        const nx = (px - qx) / (dm || 1), ny = (py - qy) / (dm || 1);
        const dot = nx * LX + ny * LY, depth = -sd;
        k = 3;
        if (dot > 0.45 && depth > 0.7 && depth < 2.3) k = 4;
        else if (dot < -0.5 && depth < 1.4) k = 2;
        if (k === 4 && dot > best && py < SH * 0.45) { best = dot; glint = [x, y]; }
      }
      cls[y * w + x] = k;
    }
  if (glint) {
    const [gx, gy] = glint;
    cls[gy * w + gx] = 5;
    if (gx + 1 < w && cls[gy * w + gx + 1] >= 3) cls[gy * w + gx + 1] = 5;
  }
  const col = [-1, pal.seam, pal.shade, pal.base, pal.lit, pal.glint];
  for (let i = 0; i < w * h; i++) data[i] = cls[i] ? col[cls[i]] : -1;
  // valve: the lowest opaque pixel nearest the middle
  let tail = [Math.floor(w / 2), h - 1];
  outer: for (let y = h - 1; y >= 0; y--) {
    let bestX = -1;
    for (let x = 0; x < w; x++) if (cls[y * w + x] && (bestX < 0 || Math.abs(x - w / 2) < Math.abs(bestX - w / 2))) bestX = x;
    if (bestX >= 0) { tail = [bestX, y + 1]; break outer; }
  }
  return { w, h, data, cls, tail };
}

export const BALLOONS = {
  lav: Array.from({ length: 10 }, (_, d) => build(d, FOIL.lav)),
  gold: Array.from({ length: 10 }, (_, d) => build(d, FOIL.gold)),
};
export const BW = BALLOONS.lav[0].w, BH = BALLOONS.lav[0].h;

/**
 * Draw balloon digit `d` of `kind` with its top-left at (x, y). `sheenAt` (or
 * null): position of a light band sweeping along x + y across the foil.
 * Returns the valve point (canvas) where the string starts.
 */
export function drawBalloon(g, kind, d, x, y, sheenAt = null) {
  const s = BALLOONS[kind][d], pal = FOIL[kind];
  x = Math.round(x); y = Math.round(y);
  g.blit(s, x, y);
  if (sheenAt !== null) {
    for (let j = 0; j < s.h; j++)
      for (let i = 0; i < s.w; i++) {
        const k = s.cls[j * s.w + i];
        if (k < 2 || k > 4) continue;
        const u = i + j * 0.6 - sheenAt;
        if (u >= 0 && u < 2.2) g.pixel(x + i, y + j, k === 2 ? pal.base : pal.lit);
      }
  }
  // the valve strip and its crimp
  const tx = x + s.tail[0], ty = y + s.tail[1];
  g.fillRect(tx - 1, ty - 1, 2, 2, pal.seam);
  g.pixel(tx, ty + 1, pal.seam);
  return [tx + 0.5, ty + 2];
}
