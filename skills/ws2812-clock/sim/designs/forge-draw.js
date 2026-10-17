// Forge drawing: a float RGB raster (linear light), blackbody heat, a
// square-bar renderer (hot glow, fire-lit bevels, twists, collars), the
// static smithy (anvil, stump, hearth, rail) and the fire.
import * as kit from '../js/kit.js';

export class Raster {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.img = new Float32Array(3 * w * h);
    this.dmin = new Float32Array(w * h);
    this.useg = new Float32Array(w * h);
    this.tseg = new Float32Array(w * h);
    this.seg = new Int32Array(w * h);
    this.stamp = new Int32Array(w * h);
    this.touched = new Int32Array(w * h);
    this.gen = 1;
  }
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
  /** A point of light at a sub-pixel position, bilinear: glides, never hops. */
  dot(x, y, r, g, b) {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const a = (1 - fx) * (1 - fy), c = fx * (1 - fy), d = (1 - fx) * fy, e = fx * fy;
    this.add(xi, yi, r * a, g * a, b * a); this.add(xi + 1, yi, r * c, g * c, b * c);
    this.add(xi, yi + 1, r * d, g * d, b * d); this.add(xi + 1, yi + 1, r * e, g * e, b * e);
  }
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
  /** Opaque AA capsule painted over. */
  capsule(ax, ay, bx, by, rad, r, g, b, a = 1) {
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - rad - 1)), x1 = Math.min(this.w - 1, Math.ceil(Math.max(ax, bx) + rad + 1));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by) - rad - 1)), y1 = Math.min(this.h - 1, Math.ceil(Math.max(ay, by) + rad + 1));
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-9;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      let t = ((x - ax) * dx + (y - ay) * dy) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const c = rad + 0.5 - Math.hypot(x - ax - t * dx, y - ay - t * dy);
      if (c > 0) this.over(x, y, r, g, b, a * (c > 1 ? 1 : c));
    }
  }
}

// ---------------------------------------------------------------- heat
// Blackbody colour times visible radiance, 400..2000 K: steep, as real
// iron is (a bar at 900 K is a dull red whisper beside 1600 K).
const T0 = 400, T1 = 2000, TS = 5, NT = (T1 - T0) / TS + 1;
const LUT = new Float32Array(3 * NT);
for (let i = 0; i < NT; i++) {
  // colour on a smith's scale: 1700 K reads white-yellow, 1100 cherry
  const T = T0 + i * TS, c = kit.blackbody(T > 900 ? 900 + (T - 900) * 2.1 + Math.max(0, T - 1500) * 4 : 900);
  const e = Math.min(1.25, Math.max(0, (T - 640) / 1060) ** 1.25);
  LUT[3 * i] = c[0] * e; LUT[3 * i + 1] = c[1] * e; LUT[3 * i + 2] = c[2] * e;
}
export function heatAt(T, out, k) {
  let i = Math.round((T - T0) / TS); i = i < 0 ? 0 : i >= NT ? NT - 1 : i;
  out[k] = LUT[3 * i]; out[k + 1] = LUT[3 * i + 1]; out[k + 2] = LUT[3 * i + 2];
}
const TMP = new Float32Array(3);
export function heatRGB(T) { heatAt(T, TMP, 0); return TMP; }

/**
 * Iron cooling in air after `age` s: white-yellow, orange, cherry, blood red,
 * black heat. Thin parts (taper t < 1) lose heat faster.
 */
export function cool(age, t = 1, T0 = 1700) {
  if (age <= 0) return T0;
  const s = 0.45 + 0.55 * t;
  return 600 + (T0 - 600) * (0.85 * Math.exp(-age / (34 * s)) + 0.15 * Math.exp(-age / (240 * s)));
}

export const FIRE = kit.hex('#ff6a1e'), STEEL = kit.hex('#9fb3d6');
const HEAT = new Float32Array(3 * 512);

/**
 * Draw bar path P (from forge-glyphs) with half-width hw.
 * o (one shape, reused): T  per-point temperature (Float32Array)
 *   fire   0..2, the fire's light on the bar; dir +1 = fire below, -1 = above
 *   sheen  cool skylight on the steel; shimmer per-row x offsets or null
 *   alpha  per-point presence (pours) or null; clipY rows >= clipY not drawn
 *   k      scale (twist pitch)
 */
export function drawBar(R, P, hw, o) {
  const n = P.n, W = R.w, H = R.h;
  const gen = ++R.gen, dmin = R.dmin, useg = R.useg, tseg = R.tseg, seg = R.seg, stamp = R.stamp, touched = R.touched;
  const T = o.T, AL = o.alpha, sh = o.shimmer, clipY = o.clipY;
  let nt = 0, hot = 0;
  for (let i = 0; i < n; i++) { heatAt(T[i], HEAT, 3 * i); if (HEAT[3 * i] > hot) hot = HEAT[3 * i]; }
  const reachX = hot > 0.05 ? 2.2 : 1;
  for (let i = 0; i < n - 1; i++) {
    if (AL && AL[i] <= 0.01) continue;
    const ax = P.x[i], ay = P.y[i], bx = P.x[i + 1], by = P.y[i + 1];
    const w = hw * Math.max(P.t[i], P.t[i + 1]), reach = w + reachX;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - reach - 1)), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + reach + 1));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by) - reach)), y1 = Math.min(Math.min(H, clipY) - 1, Math.ceil(Math.max(ay, by) + reach));
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-9, iL = 1 / Math.sqrt(L2);
    const wa = hw * P.t[i], wb = hw * P.t[i + 1];
    for (let y = y0; y <= y1; y++) {
      const off = sh ? sh[y] : 0;
      for (let x = x0; x <= x1; x++) {
        const px = x + off - ax, py = y - ay;
        let t = (px * dx + py * dy) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = px - t * dx, ey = py - t * dy;
        const wt = wa + (wb - wa) * t;
        const d = Math.sqrt(ex * ex + ey * ey) - wt;
        if (d > reachX) continue;
        const p = y * W + x;
        if (stamp[p] !== gen) { stamp[p] = gen; touched[nt++] = p; dmin[p] = 1e9; }
        if (d < dmin[p]) { dmin[p] = d; seg[p] = i; tseg[p] = t; useg[p] = ((-dy * px + dx * py) * iL) / wt; }
      }
    }
  }
  const I = R.img, F = o.fire, dir = o.dir, sheen = o.sheen, k = o.k;
  for (let q = 0; q < nt; q++) {
    const p = touched[q], i = seg[p], d = dmin[p];
    const a = AL ? AL[i] : 1;
    if (a <= 0.01) continue;
    const c = 3 * p, hk = 3 * i;
    if (d > 0.5) {
      const g = a * 0.13 * Math.exp(-(d - 0.5) / 0.8);
      I[c] += HEAT[hk] * g; I[c + 1] += HEAT[hk + 1] * g; I[c + 2] += HEAT[hk + 2] * g;
      continue;
    }
    const cov = (d < -0.5 ? 1 : 0.5 - d) * a;
    const u = useg[p], au = u < 0 ? -u : u;
    // which way this edge of the bar faces (screen y of its normal)
    const j = i + 1 < n ? i + 1 : i;
    const tx = P.x[j] - P.x[i], ty = P.y[j] - P.y[i], il = 1 / (Math.hypot(tx, ty) || 1);
    const ny = (u < 0 ? -1 : 1) * tx * il;
    const toward = dir * ny > 0 ? dir * ny : 0;          // faces the fire
    const away = dir * ny < 0 ? -dir * ny : 0;
    let bev = au < 0.3 ? 0 : au > 0.85 ? 1 : (au - 0.3) / 0.55;
    let face = 1 - bev;
    const tw = P.w[i];
    if (tw === 1) {
      // a twisted bar: the faces spiral, so lit bands run diagonally across
      const s = (i + tseg[p]) * 0.7 * k + u * 1.1;
      const band = 0.5 + 0.5 * Math.cos(s * 2.3);
      bev = Math.max(bev, band * band); face = 1 - bev;
    } else if (tw === 2) {
      face *= 0.6; bev = Math.min(1, bev + 0.25);      // collar: a ridged band
    }
    const lw = F * (0.16 * face + bev * (0.12 + 1.1 * toward));
    const lc = sheen * (0.09 * face + bev * (0.06 + 0.45 * away));
    const core = 0.8 + 0.2 * (1 - au * au);
    const r = HEAT[hk] * core + FIRE[0] * lw + STEEL[0] * lc;
    const g = HEAT[hk + 1] * core + FIRE[1] * lw + STEEL[1] * lc;
    const b = HEAT[hk + 2] * core + FIRE[2] * lw + STEEL[2] * lc;
    I[c] += (r - I[c]) * cov; I[c + 1] += (g - I[c + 1]) * cov; I[c + 2] += (b - I[c + 2]) * cov;
  }
}

// ------------------------------------------------------------- the smithy
function polyCover(w, h, pts) {
  const m = new Float32Array(w * h), S = 4;
  const n = pts.length;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let c = 0;
    for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
      const px = x - 0.5 + (sx + 0.5) / S, py = y - 0.5 + (sy + 0.5) / S;
      let ins = false;
      for (let a = 0, b = n - 1; a < n; b = a++) {
        const [xa, ya] = pts[a], [xb, yb] = pts[b];
        if ((ya > py) !== (yb > py) && px < ((xb - xa) * (py - ya)) / (yb - ya) + xa) ins = !ins;
      }
      if (ins) c++;
    }
    m[y * w + x] = c / (S * S);
  }
  return m;
}

export const ANVIL_FACE = 89.5;
/**
 * The still parts of the smithy as two layers: L0 constant, L1 scaled each
 * frame by the fire's breath (firelight). Black is left black.
 */
export function buildStatic(w, h) {
  const L0 = new Float32Array(3 * w * h), L1 = new Float32Array(3 * w * h);
  const put = (L, p, c, a) => { L[3 * p] += c[0] * a; L[3 * p + 1] += c[1] * a; L[3 * p + 2] += c[2] * a; };
  const paint = (L, p, c, a) => { for (let q = 0; q < 3; q++) L[3 * p + q] += (c[q] - L[3 * p + q]) * a; };
  const F = 89.5;
  // the anvil: London pattern, horn to the left, heel to the right
  const anvil = polyCover(w, h, [
    [-0.5, 90.6], [3, 89.9], [7, F], [61.8, F], [61.8, 93.2], [52, 93.6], [46.5, 95.2], [44.5, 100.5],
    [49, 104.5], [55, 106.2], [55, 108.6], [9, 108.6], [9, 106.2], [15, 104.5], [19.5, 100.5],
    [17.5, 95.6], [13, 94.6], [7.5, 93.2], [3, 91.9],
  ]);
  // the stump it stands on, and the hearth's brick lip above
  const stump = polyCover(w, h, [[14, 108.4], [50, 108.4], [51.5, 128], [12.5, 128]]);
  const WOOD = kit.hex('#6b3a1c'), BRICK = kit.hex('#7a2c18'), MORTAR = kit.hex('#2a1610');
  const DARK = kit.hex('#1b2230');
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x;
    // stump: end grain in the firelight, two iron hoops, a lit rim
    const s = stump[p];
    if (s > 0) {
      const ring = 0.6 + 0.4 * Math.sin(x * 0.9 + kit.noise2(x * 0.3, y * 0.15) * 4);
      const hoop = (y === 113 || y === 123) ? 1 : 0;
      const side = Math.max(0, s - (stump[p - 1] ?? 0), s - (stump[p + 1] ?? 0));
      const fall = 1 - (y - 108) / 24;
      paint(L0, p, hoop ? DARK : WOOD, s * (hoop ? 0.05 : 0.012));
      put(L1, p, hoop ? FIRE : WOOD, s * (hoop ? 0.07 : 0.06 * ring) * fall + side * 0.12 * fall);
    }
    const a = anvil[p];
    if (a > 0) {
      // the face plate catches the fire straight on; the body only on its
      // upward edges (the horn's top, the waist's shoulders); a cool sheen
      const up = Math.max(0, a - (y > 0 ? anvil[p - w] : 0));
      const side = Math.max(0, a - anvil[p - 1], a - anvil[p + 1]);
      const top = y < 91.6;
      const shade = kit.clamp(1 - (y - F) / 19);
      for (let q = 0; q < 3; q++) { L0[3 * p + q] *= 1 - a; L1[3 * p + q] *= 1 - a; }
      put(L0, p, DARK, a * (top ? 0.12 : 0.03 + 0.03 * shade) + side * 0.1);
      put(L1, p, FIRE, a * (top ? 0.2 : 0.012 + 0.03 * shade) + (top ? 0 : up * 0.35 + side * 0.06 * shade));
    }
    // hearth lip: one course of brick under the coals
    if (y >= 45 && y <= 47) {
      const mortar = y === 47 || (x + (y === 46 ? 3 : 0)) % 7 === 0;
      put(L1, p, mortar ? MORTAR : BRICK, mortar ? 0.02 : 0.06 * (y === 45 ? 1.4 : 1));
    }
    // the rail the finished work hangs from
    if (y === 0) put(L0, p, DARK, 0.06);
  }
  // the bellows' pipe, up the left wall to the fire
  for (let y = 46; y <= 109; y++) { const p = y * w + 1; put(L0, p, DARK, 0.04); put(L1, p, FIRE, 0.03 * (1 - (y - 46) / 80)); }
  return { L0, L1, anvil };
}

// ----------------------------------------------------------------- fire
const TF = new Float32Array(3);
/** The coal bed (rows ~38..45) and its flames. b = breath 0.4..1.6. */
export function drawFire(R, now, b, lift) {
  const W = R.w, I = R.img;
  for (let x = 0; x < W; x++) {
    const top = 37.6 + 2.4 * kit.noise2(x * 0.28, 3.7);
    for (let y = 22; y < 45; y++) {
      const c = 3 * (y * W + x);
      if (y >= top) {
        // coals: rounded lumps (nearest of jittered centres), dark crusts,
        // glowing in the cracks between them; the glow crawls with the air
        const cx = x / 4.2, cy = y / 3.4, ix = Math.floor(cx), iy = Math.floor(cy);
        let d1 = 9, d2 = 9;
        for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
          const qx = ix + ox + kit.hash(ix + ox, iy + oy, 1), qy = iy + oy + kit.hash(ix + ox, iy + oy, 2);
          const dd = (cx - qx) ** 2 + (cy - qy) ** 2;
          if (dd < d1) { d2 = d1; d1 = dd; } else if (dd < d2) d2 = dd;
        }
        const crack = 1 - kit.smoothstep(0.0, 0.28, Math.sqrt(d2) - Math.sqrt(d1));
        const g = kit.noise3(x * 0.3, y * 0.4 + now * 0.1, now * 0.28);
        const depth = kit.clamp((y - top) / 4);
        const air = (0.35 + 0.65 * kit.smoothstep(0.25, 0.75, g)) * b;
        const hot = air * (0.22 + 0.5 * depth + 0.75 * crack);
        heatAt(900 + 600 * Math.min(1.3, hot), TF, 0);
        const e = 0.25 + 0.85 * hot;
        I[c] += TF[0] * e; I[c + 1] += TF[1] * e; I[c + 2] += TF[2] * e;
      } else {
        // flames lick up from the bed; taller on a breath
        const hgt = (top - y) / (3.5 + 5.5 * b + lift);
        if (hgt > 1.2) continue;
        const f = kit.noise3(x * 0.33, y * 0.28 + now * 3.2, now * 0.7);
        const fl = kit.clamp(f * 1.7 - hgt * 1.25 - 0.28);
        if (fl <= 0) continue;
        heatAt(900 + 650 * fl, TF, 0);
        const e = 1.2 * fl;
        I[c] += TF[0] * e; I[c + 1] += TF[1] * e * 0.9; I[c + 2] += TF[2] * e * 0.7;
      }
    }
  }
}

/** Light that would clip keeps its hue and bleeds toward white instead. */
export function toneMap(I) {
  for (let k = 0; k < I.length; k += 3) {
    const r = I[k], g = I[k + 1], b = I[k + 2], m = r > g ? (r > b ? r : b) : g > b ? g : b;
    if (m <= 0.85) continue;
    const t = 0.85 + 0.15 * (1 - Math.exp(-(m - 0.85) / 0.15));
    const s = t / m, w = Math.min(0.5, (m - 0.85) * 0.35);
    I[k] = (r * s) * (1 - w) + t * w; I[k + 1] = (g * s) * (1 - w) + t * w; I[k + 2] = (b * s) * (1 - w) + t * w;
  }
}
