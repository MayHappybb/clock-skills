// karesansui: everything about the garden that does not move, worked out
// once at load (on the device: const tables in flash).
//
//   - ten digit "islands": for each digit a distance field (pixels from the
//     edge of a monoline stroke, negative inside) and its unit gradient, so
//     the rake can echo the shape in concentric furrows
//   - two stones (the colon) with moss collars: distance, surface normals
//   - the background furrows: long, gently swelling parallel lines
//   - per-pixel grain
//   - the shadow of a maple canopy that overhangs the garden from above
//     the frame, in two layers that sway separately
//
// All of it is plain arrays; the face looks them up per pixel.

import { segDist, rand, noise } from '../js/kit.js';

export const W = 160, H = 80;

/** Furrow pitch, and how far the concentric echo runs before the long lines take over. */
export const P = 4;
export const RING = 10.5;

// ------------------------------------------------------------ digits

export const GW = 24, GH = 46, HW = 3.3;     // glyph box and half stroke
export const M = 14;                          // field margin round the box
export const FW = GW + 2 * M, FH = GH + 2 * M;

const arc = (cx, cy, rx, ry, a0, a1, n = 18) => {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + (a1 - a0) * (i / n)) * Math.PI) / 180;
    pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return pts;
};

// Skeletons in a unit box (y down). Several polylines per digit.
const SKEL = {
  0: [arc(0.5, 0.5, 0.5, 0.5, 0, 360, 32)],
  1: [[[0.2, 0.2], [0.58, 0], [0.58, 1]]],
  2: [[...arc(0.5, 0.26, 0.48, 0.26, 192, 395, 18), [0.02, 1], [1, 1]]],
  3: [arc(0.5, 0.25, 0.44, 0.25, 205, 450, 16), arc(0.5, 0.735, 0.5, 0.265, 270, 520, 18)],
  4: [[[0.74, 1], [0.74, 0], [0, 0.66], [1, 0.66]]],
  5: [[[0.96, 0], [0.12, 0], [0.04, 0.45]], arc(0.5, 0.68, 0.5, 0.32, 222, 520, 20)],
  6: [arc(0.56, 0.62, 0.56, 0.62, 290, 170, 16), arc(0.5, 0.705, 0.5, 0.295, 0, 360, 28)],
  7: [[[0, 0], [1, 0], [0.34, 1]]],
  8: [arc(0.5, 0.235, 0.42, 0.235, 0, 360, 26), arc(0.5, 0.725, 0.5, 0.275, 0, 360, 28)],
};
SKEL[9] = SKEL[6].map((pl) => pl.map(([x, y]) => [1 - x, 1 - y]));

/** For digit d: { u, gx, gy } over FW x FH, the field's origin M px up-left of the glyph box. */
export const GLYPH = [];
for (let d = 0; d <= 9; d++) {
  const segs = [];
  for (const pl of SKEL[d]) {
    const pts = pl.map(([x, y]) => [M + HW + x * (GW - 2 * HW), M + HW + y * (GH - 2 * HW)]);
    for (let i = 1; i < pts.length; i++) segs.push([...pts[i - 1], ...pts[i]]);
  }
  const u = new Float32Array(FW * FH);
  for (let y = 0; y < FH; y++)
    for (let x = 0; x < FW; x++) {
      let m = Infinity;
      for (const s of segs) { const e = segDist(x + 0.5, y + 0.5, s[0], s[1], s[2], s[3]); if (e < m) m = e; }
      u[y * FW + x] = m - HW;
    }
  GLYPH.push({ u, ...gradOf(u, FW, FH) });
}

function gradOf(u, w, h) {
  const gx = new Float32Array(w * h), gy = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const a = u[y * w + Math.max(0, x - 1)], b = u[y * w + Math.min(w - 1, x + 1)];
      const c = u[Math.max(0, y - 1) * w + x], e = u[Math.min(h - 1, y + 1) * w + x];
      let dx = b - a, dy = e - c;
      const l = Math.hypot(dx, dy) || 1;
      gx[y * w + x] = dx / l; gy[y * w + x] = dy / l;
    }
  return { gx, gy };
}

// ------------------------------------------------------------ the fixed garden

/** Where the four digits sit (glyph box top-left). Hours left, minutes right, stones between. */
export const DX = [7, 38, 98, 129], DY = 17;

export const STONES = [
  { cx: 80.5, cy: 30, r: 6.2, seed: 3 },
  { cx: 78.6, cy: 52.5, r: 4.4, seed: 9 },
];
export const MOSS = 1.8;

const N = W * H;
/** 0 gravel, 1 rock, 2 moss. */
export const kind = new Uint8Array(N);
/** Distance for the concentric furrows round the stones (from the moss edge), else large. */
export const stoneU = new Float32Array(N).fill(99);
export let stoneGX, stoneGY;
/** Rock surface normal (rock pixels only). */
export const rnx = new Float32Array(N), rny = new Float32Array(N), rnz = new Float32Array(N);
/** The long lines: phase coordinate and its unit gradient. */
export const lineV = new Float32Array(N), lineGX = new Float32Array(N), lineGY = new Float32Array(N);
/** Grain, in tone units. */
export const grain = new Float32Array(N);

{
  const rockH = new Float32Array(N);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x, px = x + 0.5, py = y + 0.5;
      let best = 99;
      for (const s of STONES) {
        const dx = px - s.cx, dy = py - s.cy, rho = Math.hypot(dx, dy);
        const th = Math.atan2(dy, dx);
        // a lumpy outline: low-order wobble
        const rr = s.r * (1 + 0.16 * Math.sin(2 * th + s.seed) + 0.09 * Math.sin(3 * th + 2 * s.seed) + 0.05 * Math.sin(5 * th + s.seed * 7));
        const d = (rho - rr) * 0.92;
        if (d < 0) {
          kind[i] = 1;
          const q = 1 - (rho / rr) ** 2;
          rockH[i] = Math.max(rockH[i], s.r * 0.9 * Math.sqrt(Math.max(0, q)) + 0.5 * noise(th * 3 + s.seed, s.seed) + 0.3 * rand(x, y, 77));
        } else if (d < MOSS && kind[i] === 0) kind[i] = 2;
        if (d - MOSS < best) best = d - MOSS;
      }
      stoneU[i] = best;
      // long lines: a slow swell, as if the rake drifted a little on each pass
      lineV[i] = py + 1.1 * Math.sin(px * 0.075 + py * 0.06) + 0.6 * Math.sin(px * 0.031 - 1.3);
      grain[i] = (rand(x, y, 5) - 0.5) * 0.09 + (rand(x >> 1, y >> 1, 6) - 0.5) * 0.05;
    }
  ({ gx: stoneGX, gy: stoneGY } = gradOf(stoneU, W, H));
  const lg = gradOf(lineV, W, H);
  lineGX.set(lg.gx); lineGY.set(lg.gy);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (kind[i] !== 1) continue;
      const hx = (rockH[y * W + Math.min(W - 1, x + 1)] - rockH[y * W + Math.max(0, x - 1)]) / 2;
      const hy = (rockH[Math.min(H - 1, y + 1) * W + x] - rockH[Math.max(0, y - 1) * W + x]) / 2;
      const l = Math.hypot(hx, hy, 1);
      rnx[i] = -hx / l; rny[i] = -hy / l; rnz[i] = 1 / l;
    }
}

// ------------------------------------------------------------ canopy shadow

/** Two shadow layers, TW x TH, values 0..1; sampled with an offset that sways. */
export const TW = 220, TH = 120, TOX = 30, TOY = 20;
export const shadeA = new Float32Array(TW * TH), shadeB = new Float32Array(TW * TH);

/** A maple leaf as a polygon: five lobes, a notch between each, radius 1. */
export function maple(cx, cy, r, rot) {
  const pts = [];
  const lobes = [1, 0.95, 0.72, 0.72, 0.95];
  for (let k = 0; k < 5; k++) {
    const a = rot + (k / 5) * Math.PI * 2 - Math.PI / 2;
    const L = lobes[k];
    for (const [da, rr] of [[-0.42, 0.42], [-0.2, 0.75 * L], [0, L], [0.2, 0.75 * L]]) {
      pts.push([cx + r * rr * Math.cos(a + da), cy + r * rr * Math.sin(a + da)]);
    }
  }
  return pts;
}

function inPoly(px, py, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

{
  const stamp = (buf, pts, v = 1) => {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(TH, Math.ceil(y1)); y++)
      for (let x = Math.max(0, Math.floor(x0)); x < Math.min(TW, Math.ceil(x1)); x++)
        if (inPoly(x + 0.5, y + 0.5, pts)) buf[y * TW + x] = Math.max(buf[y * TW + x], v);
  };
  const line = (buf, ax, ay, bx, by, w) => {
    for (let y = 0; y < TH; y++)
      for (let x = 0; x < TW; x++)
        if (segDist(x + 0.5, y + 0.5, ax, ay, bx, by) < w) buf[y * TW + x] = 1;
  };
  // Branches reach in from beyond the top-left and top-right of the frame.
  const branches = [
    { buf: shadeA, pts: [[-10, 4], [22, 14], [50, 19], [70, 16]], n: 26, seed: 1 },
    { buf: shadeB, pts: [[0, 30], [26, 24], [44, 34]], n: 12, seed: 2 },
    { buf: shadeA, pts: [[196, -2], [170, 10], [148, 14]], n: 13, seed: 3 },
  ];
  for (const br of branches) {
    const p = br.pts.map(([x, y]) => [x + TOX, y + TOY - 8]);
    for (let i = 1; i < p.length; i++) line(br.buf, ...p[i - 1], ...p[i], 0.9 - i * 0.2);
    for (let k = 0; k < br.n; k++) {
      const u = rand(k, br.seed, 1) * (p.length - 1), i = Math.min(p.length - 2, Math.floor(u)), f = u - i;
      const bx = p[i][0] + (p[i + 1][0] - p[i][0]) * f, by = p[i][1] + (p[i + 1][1] - p[i][1]) * f;
      const a = rand(k, br.seed, 2) * Math.PI * 2, d = 3 + rand(k, br.seed, 3) * 9;
      const cx = bx + Math.cos(a) * d, cy = by + Math.abs(Math.sin(a)) * d * 0.9 - 2;
      line(br.buf, bx, by, cx, cy, 0.5);
      stamp(br.buf, maple(cx, cy, 4.5 + rand(k, br.seed, 4) * 3.5, rand(k, br.seed, 5) * 6));
    }
  }
  // soften: two passes of a 3x3 box blur (a penumbra about a pixel wide)
  for (const buf of [shadeA, shadeB])
    for (let pass = 0; pass < 2; pass++) {
      const src = buf.slice();
      for (let y = 1; y < TH - 1; y++)
        for (let x = 1; x < TW - 1; x++) {
          let s = 0;
          for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) s += src[(y + j) * TW + x + i];
          buf[y * TW + x] = s / 9;
        }
    }
}
