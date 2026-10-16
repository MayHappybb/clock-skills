// synthwave-chrome.js: the hour, as an extruded chrome logo.
//
// The figures are drawn once, as outlines: a heavy, extended, italic
// "Eurostile" of 1984 (square counters, one big radius on the outer
// corners, square terminals). Each outline is a list of corners with a
// radius each; buildLogo() rounds them, rasterises the hour once at its
// resting size (4x4 supersampled coverage, the signed distance to the edge
// and its normal, how far down the letter each pixel is), and works out
// the extrusion towards the vanishing point. That map is all the frame
// needs: drawLogo() turns it into chrome every frame, because the chrome
// reflects the live scene (the sky above, a sharp horizon line, the racing
// grid below), so the time shimmers while it stands still.
//
// On a device the map is a small table built once an hour (about 80 x 45
// entries); the per-frame pass is a lookup per pixel into a colour ramp,
// charged below as a blit plus a box scan.

import { clamp } from '../js/kit.js';

/** Integer colour lerp for the per-pixel paths (no library rounding). */
export function lc(a, b, u) {
  if (u <= 0) return a;
  if (u >= 1) return b;
  const ra = (a >> 16) & 255, ga = (a >> 8) & 255, ba = a & 255;
  return (((ra + (((b >> 16) & 255) - ra) * u + 0.5) << 16) | ((ga + (((b >> 8) & 255) - ga) * u + 0.5) << 8) | (ba + ((b & 255) - ba) * u + 0.5)) >>> 0;
}


export const GH = 38;             // figure height
export const SLANT = 0.2;         // italic: x shift per pixel of height
const E = 1.5;                    // terminal corner
const RO = 10;                    // big outer radius
const RI = 3;                     // counter radius
const RM = 8;                     // bar-to-stem outer radius

// Corners [x, y, radius], clockwise, in a 30 x 38 cell (y down). Bars are
// 7 high (0-7, 15.5-22.5, 31-38), stems 8 wide.
const OUT = {
  0: [[[0, 0, RO], [30, 0, RO], [30, 38, RO], [0, 38, RO]],
      [[8, 7, RI], [22, 7, RI], [22, 31, RI], [8, 31, RI]]],
  1: [[[13, 0, E], [21, 0, E], [21, 38, E], [13, 38, E], [13, 11, 0], [5, 14, E], [5, 6.5, E]]],
  2: [[[0, 0, E], [30, 0, RO], [30, 22.5, RM], [8, 22.5, RI], [8, 31, RI], [30, 31, E], [30, 38, E], [0, 38, E],
       [0, 15.5, RM], [22, 15.5, RI], [22, 7, RI], [0, 7, E]]],
  3: [[[0, 0, E], [30, 0, RO], [30, 38, RO], [0, 38, E], [0, 31, E], [22, 31, RI], [22, 22.5, RI], [9, 22.5, E],
       [9, 15.5, E], [22, 15.5, RI], [22, 7, RI], [0, 7, E]]],
  4: [[[0, 0, E], [8, 0, E], [8, 20, RI], [22, 20, RI], [22, 0, E], [30, 0, E], [30, 38, E], [22, 38, E],
       [22, 27, RI], [0, 27, RM]]],
  5: [[[0, 0, E], [30, 0, E], [30, 7, E], [8, 7, RI], [8, 15.5, RI], [30, 15.5, RM], [30, 38, RO], [0, 38, E],
       [0, 31, E], [22, 31, RI], [22, 22.5, RI], [0, 22.5, E]]],
  6: [[[0, 0, RO], [30, 0, E], [30, 7, E], [8, 7, RI], [8, 15.5, RI], [30, 15.5, RM], [30, 38, RO], [0, 38, RO]],
      [[8, 22.5, RI], [22, 22.5, RI], [22, 31, RI], [8, 31, RI]]],
  7: [[[0, 0, E], [30, 0, RO], [30, 38, E], [22, 38, E], [22, 7, RI], [0, 7, E]]],
  8: [[[0, 0, RO], [30, 0, RO], [30, 38, RO], [0, 38, RO]],
      [[8, 7, RI], [22, 7, RI], [22, 15.5, RI], [8, 15.5, RI]],
      [[8, 22.5, RI], [22, 22.5, RI], [22, 31, RI], [8, 31, RI]]],
  9: [[[0, 0, RO], [30, 0, RO], [30, 38, RO], [0, 38, E], [0, 31, E], [22, 31, RI], [22, 22.5, RI], [0, 22.5, RM]],
      [[8, 7, RI], [22, 7, RI], [22, 15.5, RI], [8, 15.5, RI]]],
};
// Ink extent of each figure in its cell, for spacing.
const INK = { 1: [5, 21] };

/** Round each corner of a ring with a quadratic fillet; returns a dense polyline. */
function roundRing(ring) {
  const n = ring.length, out = [];
  for (let i = 0; i < n; i++) {
    const [px, py, r] = ring[i], [ax, ay] = ring[(i + n - 1) % n], [bx, by] = ring[(i + 1) % n];
    const la = Math.hypot(px - ax, py - ay), lb = Math.hypot(bx - px, by - py);
    const t = Math.min(r, la / 2, lb / 2);
    if (t <= 0.01) { out.push([px, py]); continue; }
    const p0 = [px + ((ax - px) / la) * t, py + ((ay - py) / la) * t];
    const p2 = [px + ((bx - px) / lb) * t, py + ((by - py) / lb) * t];
    const N = 8;
    for (let k = 0; k <= N; k++) {
      const u = k / N, w0 = (1 - u) * (1 - u), w1 = 2 * u * (1 - u), w2 = u * u;
      out.push([w0 * p0[0] + w1 * px + w2 * p2[0], w0 * p0[1] + w1 * py + w2 * p2[1]]);
    }
  }
  return out;
}

// ------------------------------------------------------------ glyph fields
// Each figure once, at 4 samples per pixel: an even-odd scanline fill of its
// rounded outline, then a two-pass chamfer distance (inside and outside), so
// the logo build is a few table lookups per pixel.
const SS = 4, PAD = 4;
const FW = (30 + 2 * PAD) * SS, FH = (38 + 2 * PAD) * SS;
const FIELDS = {};
function field(ch) {
  if (FIELDS[ch]) return FIELDS[ch];
  const rings = OUT[ch].map(roundRing);
  const mask = new Uint8Array(FW * FH);
  const xs = [];
  for (let j = 0; j < FH; j++) {
    const py = (j + 0.5) / SS - PAD;
    xs.length = 0;
    for (const pts of rings)
      for (let i = 0, k = pts.length - 1; i < pts.length; k = i++) {
        const [xi, yi] = pts[i], [xk, yk] = pts[k];
        if ((yi > py) !== (yk > py)) xs.push(((xk - xi) * (py - yi)) / (yk - yi) + xi);
      }
    xs.sort((u, v) => u - v);
    for (let q = 0; q + 1 < xs.length; q += 2) {
      const i0 = Math.max(0, Math.ceil((xs[q] + PAD) * SS - 0.5)), i1 = Math.min(FW - 1, Math.floor((xs[q + 1] + PAD) * SS - 0.5));
      for (let i = i0; i <= i1; i++) mask[j * FW + i] = 1;
    }
  }
  // chamfer (3-4) distance to the other side, in samples
  const dist = (inside) => {
    const d = new Float32Array(FW * FH);
    const BIG = 1e6;
    for (let k = 0; k < d.length; k++) d[k] = (mask[k] === 1) === inside ? BIG : 0;
    for (let j = 0; j < FH; j++)
      for (let i = 0; i < FW; i++) {
        const k = j * FW + i;
        if (!d[k]) continue;
        let v = d[k];
        if (i > 0) v = Math.min(v, d[k - 1] + 3);
        if (j > 0) {
          v = Math.min(v, d[k - FW] + 3);
          if (i > 0) v = Math.min(v, d[k - FW - 1] + 4);
          if (i < FW - 1) v = Math.min(v, d[k - FW + 1] + 4);
        }
        d[k] = v;
      }
    for (let j = FH - 1; j >= 0; j--)
      for (let i = FW - 1; i >= 0; i--) {
        const k = j * FW + i;
        if (!d[k]) continue;
        let v = d[k];
        if (i < FW - 1) v = Math.min(v, d[k + 1] + 3);
        if (j < FH - 1) {
          v = Math.min(v, d[k + FW] + 3);
          if (i < FW - 1) v = Math.min(v, d[k + FW + 1] + 4);
          if (i > 0) v = Math.min(v, d[k + FW - 1] + 4);
        }
        d[k] = v;
      }
    return d;
  };
  const din = dist(true), dout = dist(false);
  // signed distance in pixels: negative inside; the edge sits between samples
  const sd = new Float32Array(FW * FH);
  for (let k = 0; k < sd.length; k++) sd[k] = mask[k] ? -(din[k] / 3 - 0.5) / SS : (dout[k] / 3 - 0.5) / SS;
  return (FIELDS[ch] = { mask, sd });
}

// The ten figures are prepared when the face loads.
for (const ch of '0123456789') field(ch);

/**
 * The logo for a string of figures, laid out with its top at `top`, centred
 * on `cx`, extruded towards (vx, vy) to `back` of its size.
 */
export function buildLogo(str, { cx = 80, top = 3, gap = 5, vx = 80, vy = 48, back = 0.84 } = {}) {
  const parts = [];
  let x = 0;
  for (const ch of str) {
    const [i0, i1] = INK[ch] ?? [0, 30];
    parts.push({ f: field(ch), dx: x - i0, x0: x, x1: x + i1 - i0 });
    x += i1 - i0 + gap;
  }
  const inkW = x - gap;
  const ox = cx - (inkW + GH * SLANT) / 2;
  const x0 = Math.floor(ox) - 1, y0 = top - 1;
  const w = Math.ceil(inkW + GH * SLANT) + 3, h = GH + 3;
  const n = w * h;
  const cov = new Float32Array(n), sd = new Float32Array(n).fill(9), nx = new Float32Array(n), ny = new Float32Array(n);
  // the field sample under a screen point: the figure whose cell it is in
  const at = (sx, sy) => {
    const gy = sy - top, gx = sx - ox - (GH - gy) * SLANT;
    let p = parts[0];
    for (const q of parts) if (gx >= q.x0 - gap / 2) p = q;
    const i = ((gx - p.dx + PAD) * SS) | 0, j = ((gy + PAD) * SS) | 0;
    if (i < 0 || j < 0 || i >= FW || j >= FH) return -1;
    return [p.f, j * FW + i];
  };
  const sdAt = (sx, sy) => { const r = at(sx, sy); return r === -1 ? 9 : r[0].sd[r[1]]; };
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const k = j * w + i, sx = x0 + i + 0.5, sy = y0 + j + 0.5;
      const d = sdAt(sx, sy);
      sd[k] = d;
      if (d > 1.5) continue;
      let c = 0;
      for (let a = 0; a < SS; a++)
        for (let b = 0; b < SS; b++) {
          const r = at(x0 + i + (a + 0.5) / SS, y0 + j + (b + 0.5) / SS);
          if (r !== -1 && r[0].mask[r[1]]) c++;
        }
      cov[k] = c / (SS * SS);
      if (c && d > -3.5) {
        const gx = sdAt(sx + 0.75, sy) - sdAt(sx - 0.75, sy), gy = sdAt(sx, sy + 0.75) - sdAt(sx, sy - 0.75);
        const l = Math.sqrt(gx * gx + gy * gy) || 1;
        nx[k] = gx / l; ny[k] = gy / l;
      }
    }
  // Extrusion: the deepest-first layer that covers each pixel, as 0 (front) .. 1 (back).
  const ext = new Float32Array(n).fill(-1);
  const L = 14;
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const k = j * w + i;
      if (cov[k] >= 1) continue;
      const sx = x0 + i + 0.5, sy = y0 + j + 0.5;
      for (let l = 1; l <= L; l++) {
        const lam = 1 - (1 - back) * (l / L);
        const qx = vx + (sx - vx) / lam, qy = vy + (sy - vy) / lam;
        const qi = (qx - x0 + 4096 | 0) - 4096, qj = (qy - y0 + 4096 | 0) - 4096;
        if (qi < 0 || qj < 0 || qi >= w || qj >= h) continue;
        if (cov[qj * w + qi] >= 0.5) { ext[k] = l / L; break; }
      }
    }
  return { str, x0, y0, w, h, top, cov, sd, nx, ny, ext, vx, vy, back };
}

/**
 * Chrome colour for a face pixel. `v` is how far down the letter (0..1),
 * `di` the depth inside the edge, (nx, ny) the outward normal, `env` the
 * stage's chrome ramps, `phase` the distance driven (the reflected grid).
 */
export function chromeAt(env, v, di, nx, ny, phase, sx, sy) {
  const BW = 2.4;
  let r = v, lit = 1;
  if (di < BW) {
    const f = 1 - di / BW;
    r = v + ny * 0.55 * f;
    lit = 1 - 0.35 * nx * f;
  }
  let c;
  if (r < env.hz) {
    // sky: zenith to the bright band above the horizon line
    const u = clamp(r / env.hz, 0, 1);
    c = ramp(env.sky, u);
  } else {
    const u = clamp((r - env.hz) / (1 - env.hz), 0, 1);
    c = ramp(env.ground, u);
    // the reflected grid: lines crowd at the horizon line and open downwards
    if (u > 0.06) {
      const z = 1.6 / (u + 0.02) + phase;
      const f = z - (z | 0);
      const wdt = 0.08 + 0.5 * u;
      if (f < wdt) c = lc(c, env.line, 0.85 * (1 - f / wdt));
    }
  }
  if (lit !== 1) c = lit > 1 ? lc(c, 0xffffff, (lit - 1) * 1.2) : lc(0, c, lit);
  if (di < 0.9) c = lc(c, env.rim, 0.55 * (1 - di / 0.9));
  return c;
}

function ramp(stops, u) {
  const n = stops.length - 1, f = u * n, i = f >= n ? n - 1 : f | 0;
  return lc(stops[i], stops[i + 1], f - i);
}

/**
 * Draw the logo at perspective scale `s` about its vanishing point (1 = at
 * rest). `depth` is the extrusion's depth as a fraction of the distance at
 * rest, so the back face is at scale s * z / (z + d). `a` fades it.
 */
export function drawLogo(g, L, s, env, phase, { shine = -99, a = 1, clipTop = 0 } = {}) {
  const { x0, y0, w, h, cov, sd, nx, ny, ext, vx, vy, top } = L;
  const W = g.width, H = g.height;
  const rest = Math.abs(s - 1) < 1e-6;
  // screen box of the front face and of the back face
  const fx0 = vx + (x0 - vx) * s, fy0 = vy + (y0 - vy) * s, fx1 = vx + (x0 + w - vx) * s, fy1 = vy + (y0 + h - vy) * s;
  const zr = 1 / s;                                   // distance in units of the rest distance
  const backS = s * zr / (zr + (1 / L.back - 1));     // scale of the back face
  const bx0 = vx + (x0 - vx) * backS, by0 = vy + (y0 - vy) * backS, bx1 = vx + (x0 + w - vx) * backS, by1 = vy + (y0 + h - vy) * backS;
  const X0 = Math.max(0, Math.floor(Math.min(fx0, bx0))), Y0 = Math.max(clipTop, Math.floor(Math.min(fy0, by0)));
  const X1 = Math.min(W, Math.ceil(Math.max(fx1, bx1))), Y1 = Math.min(H, Math.ceil(Math.max(fy1, by1)));
  if (X1 <= X0 || Y1 <= Y0) return;
  const LAYERS = rest ? 0 : Math.min(10, 3 + Math.ceil((s - backS) * 12));
  let scanned = 0, faces = 0;
  for (let y = Y0; y < Y1; y++)
    for (let x = X0; x < X1; x++) {
      scanned++;
      const px = x + 0.5, py = y + 0.5;
      // front face sample (nearest map pixel)
      const qx = vx + (px - vx) / s, qy = vy + (py - vy) / s;
      const i = (qx - x0 + 4096 | 0) - 4096, j = (qy - y0 + 4096 | 0) - 4096;
      let k = -1, c = 0;
      if (i >= 0 && j >= 0 && i < w && j < h) k = j * w + i;
      const fc = k >= 0 ? cov[k] : 0;
      let base = -1;   // the extrusion colour under the face, if any
      if (fc < 1) {
        let e = -1;
        if (rest) e = k >= 0 ? ext[k] : -1;
        else {
          for (let l = 1; l <= LAYERS; l++) {
            const lam = s + (backS - s) * (l / LAYERS);
            const rx = vx + (px - vx) / lam, ry = vy + (py - vy) / lam;
            const ii = (rx - x0 + 4096 | 0) - 4096, jj = (ry - y0 + 4096 | 0) - 4096;
            if (ii < 0 || jj < 0 || ii >= w || jj >= h) continue;
            if (cov[jj * w + ii] >= 0.5) { e = l / LAYERS; break; }
          }
        }
        if (e >= 0) base = ramp(env.ext, e);
      }
      if (fc <= 0 && base < 0) continue;
      if (fc > 0) {
        faces++;
        const v = (qy - top) / GH;
        c = chromeAt(env, v, -sd[k], nx[k], ny[k], phase, px, py);
        if (shine > -50) {
          const dd = (qx + (qy - top) * 0.6) - shine;
          if (dd > -3 && dd < 3) c = lc(c, 0xffffff, 0.75 * (1 - Math.abs(dd) / 3));
        }
        if (fc < 1) {
          const under = base >= 0 ? base : g.get(x, y);
          c = lc(under, c, fc);
        }
      } else c = base;
      if (a < 1) c = lc(g.get(x, y), c, a);
      g.pixel(x, y, c);
    }
  // price it as a C port would run it: a box scan, plus a lookup per extrusion layer
  g.cost.box += scanned * (1 + LAYERS);
  g.cost.shade += faces;   // the chrome shading is per-pixel code of ours
}
