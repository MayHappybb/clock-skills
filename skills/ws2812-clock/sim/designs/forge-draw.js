// Forge drawing: a float RGB raster (linear light), a square-bar renderer
// with blackbody heat and fire-lit steel, and small AA primitives.
import * as kit from '../js/kit.js';

export class Raster {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.img = new Float32Array(3 * w * h);
    // scratch for bars: nearest segment per pixel
    this.dmin = new Float32Array(w * h);
    this.useg = new Float32Array(w * h);
    this.seg = new Int32Array(w * h);
    this.stamp = new Int32Array(w * h);
    this.gen = 1;
    this.touched = new Int32Array(w * h);
  }
  clear() { this.img.fill(0); }
  add(x, y, r, g, b) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const k = 3 * (y * this.w + x), I = this.img;
    I[k] += r; I[k + 1] += g; I[k + 2] += b;
  }
  over(x, y, r, g, b, a) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || a <= 0) return;
    const k = 3 * (y * this.w + x), I = this.img;
    I[k] += (r - I[k]) * a; I[k + 1] += (g - I[k + 1]) * a; I[k + 2] += (b - I[k + 2]) * a;
  }
  /** A dot of light at a sub-pixel position, bilinear (glides, never hops). */
  dot(x, y, r, g, b) {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    this.add(xi, yi, r * (1 - fx) * (1 - fy), g * (1 - fx) * (1 - fy), b * (1 - fx) * (1 - fy));
    this.add(xi + 1, yi, r * fx * (1 - fy), g * fx * (1 - fy), b * fx * (1 - fy));
    this.add(xi, yi + 1, r * (1 - fx) * fy, g * (1 - fx) * fy, b * (1 - fx) * fy);
    this.add(xi + 1, yi + 1, r * fx * fy, g * fx * fy, b * fx * fy);
  }
  /** Soft round blob of light (adds). */
  glow(cx, cy, rad, r, g, b) {
    const x0 = Math.max(0, Math.floor(cx - rad)), x1 = Math.min(this.w - 1, Math.ceil(cx + rad));
    const y0 = Math.max(0, Math.floor(cy - rad)), y1 = Math.min(this.h - 1, Math.ceil(cy + rad));
    const ir2 = 1 / (rad * rad);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const q = ((x - cx) ** 2 + (y - cy) ** 2) * ir2;
      if (q >= 1) continue;
      const f = (1 - q) * (1 - q);
      this.add(x, y, r * f, g * f, b * f);
    }
  }
  /** Opaque AA capsule (a thick line) painted over: tongs, handles. */
  capsule(ax, ay, bx, by, rad, r, g, b, a = 1) {
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - rad - 1)), x1 = Math.min(this.w - 1, Math.ceil(Math.max(ax, bx) + rad + 1));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by) - rad - 1)), y1 = Math.min(this.h - 1, Math.ceil(Math.max(ay, by) + rad + 1));
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-9;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      let t = ((x - ax) * dx + (y - ay) * dy) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const d = Math.hypot(x - ax - t * dx, y - ay - t * dy);
      const c = rad + 0.5 - d;
      if (c > 0) this.over(x, y, r, g, b, a * (c > 1 ? 1 : c));
    }
  }
}

// ---------------------------------------------------------------- heat
// Blackbody emission LUT, 400..1900 K in 5 K steps: colour times visible
// radiance (steep: a bar at 900 K is a dull red whisper beside 1600 K).
const T0 = 400, T1 = 1900, TS = 5, NT = (T1 - T0) / TS + 1;
const LUT = new Float32Array(3 * NT);
for (let i = 0; i < NT; i++) {
  const T = T0 + i * TS, c = kit.blackbody(Math.max(T, 800));
  const e = kit.clamp((T - 640) / 1000) ** 1.7;
  LUT[3 * i] = c[0] * e; LUT[3 * i + 1] = c[1] * e; LUT[3 * i + 2] = c[2] * e;
}
export function heatAt(T, out, k) {
  let i = Math.round((T - T0) / TS); i = i < 0 ? 0 : i >= NT ? NT - 1 : i;
  out[k] = LUT[3 * i]; out[k + 1] = LUT[3 * i + 1]; out[k + 2] = LUT[3 * i + 2];
}

/** Bar temperature after `age` s of cooling; thin parts (taper t) lose heat faster. */
export function tempOf(age, t, tau, Tstart = 1720) {
  const amb = 520;
  return amb + (Tstart - amb) * Math.exp(-Math.max(0, age) / (tau * (0.35 + 0.65 * t)));
}

const HEAT = new Float32Array(3 * 400);
const FIRE = kit.hex('#ff7a2a'), COOL = kit.hex('#8fa6c8');

/**
 * Draw one bar path P with half-width hw (times P.t per point).
 * o: { T: Float32Array per point temperature, fire (0..1.5 light from below),
 *      fireY (0..1, how near the fire), shimmer: Float32Array(h) or null,
 *      alpha: Float32Array per point (metal present) or null, halo: 0..1 }
 */
export function drawBar(R, P, hw, o) {
  const n = P.n, W = R.w, H = R.h;
  const gen = ++R.gen, dmin = R.dmin, useg = R.useg, seg = R.seg, stamp = R.stamp, touched = R.touched;
  let nt = 0;
  const halo = o.halo, reachX = halo > 0.02 ? 3.2 : 1.2;
  const sh = o.shimmer;
  const AL = o.alpha;
  for (let i = 0; i < n - 1; i++) {
    if (AL && AL[i] <= 0.01 && AL[i + 1] <= 0.01) continue;
    const ax = P.x[i], ay = P.y[i], bx = P.x[i + 1], by = P.y[i + 1];
    const w = hw * P.t[i], reach = w + reachX;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - reach - 1)), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + reach + 1));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by) - reach)), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by) + reach));
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-9, iL = 1 / Math.sqrt(L2);
    for (let y = y0; y <= y1; y++) {
      const off = sh ? sh[y] : 0;
      for (let x = x0; x <= x1; x++) {
        const px = x + off - ax, py = y - ay;
        let t = (px * dx + py * dy) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = px - t * dx, ey = py - t * dy;
        const d = Math.sqrt(ex * ex + ey * ey) - w;   // signed distance to the bar's edge
        if (d > reachX) continue;
        const p = y * W + x;
        if (stamp[p] !== gen) { stamp[p] = gen; touched[nt++] = p; dmin[p] = 1e9; }
        if (d < dmin[p]) { dmin[p] = d; seg[p] = i; useg[p] = ((-dy * px + dx * py) * iL) / w; }
      }
    }
  }
  // per-point heat colour
  const T = o.T;
  for (let i = 0; i < n; i++) heatAt(T[i], HEAT, 3 * i);
  const I = R.img, fire = o.fire;
  for (let q = 0; q < nt; q++) {
    const p = touched[q], i = seg[p], d = dmin[p];
    const a = AL ? AL[i] : 1;
    if (a <= 0.01) continue;
    const k = 3 * p, hk = 3 * i;
    const fy = (p / W | 0) / H;          // 0 top .. 1 bottom (the fire)
    const F = fire * (0.45 + 0.55 * fy);
    if (d > 0.5) {
      if (halo > 0.02) {
        const g = halo * a * 0.22 * Math.exp(-(d - 0.5) / 1.2);
        I[k] += HEAT[hk] * g; I[k + 1] += HEAT[hk + 1] * g; I[k + 2] += HEAT[hk + 2] * g;
      }
      continue;
    }
    const cov = (d < -0.5 ? 1 : 0.5 - d) * a;
    // facets of a square bar: flat top face, bevelled edges facing up / down
    const u = useg[p], au = u < 0 ? -u : u;
    const bev = au < 0.35 ? 0 : au > 0.85 ? 1 : (au - 0.35) / 0.5;
    const ax = P.x[i + 1 < n ? i + 1 : i] - P.x[i], ay = P.y[i + 1 < n ? i + 1 : i] - P.y[i];
    const il = 1 / (Math.hypot(ax, ay) || 1);
    const ny = (u < 0 ? -1 : 1) * ax * il;   // y of the bevel's outward normal
    const down = ny > 0 ? ny : 0, up = ny < 0 ? -ny : 0;
    const lw = F * (0.05 * (1 - bev) + bev * (0.03 + 0.5 * down));
    const lc = 0.016 + bev * 0.10 * up + (1 - bev) * 0.012;
    const core = 0.82 + 0.18 * (1 - au * au);
    const r = HEAT[hk] * core + FIRE[0] * lw + COOL[0] * lc;
    const g = HEAT[hk + 1] * core + FIRE[1] * lw + COOL[1] * lc;
    const b = HEAT[hk + 2] * core + FIRE[2] * lw + COOL[2] * lc;
    I[k] += (r - I[k]) * cov; I[k + 1] += (g - I[k + 1]) * cov; I[k + 2] += (b - I[k + 2]) * cov;
  }
}
