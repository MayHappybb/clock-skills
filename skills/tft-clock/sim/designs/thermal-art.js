// The heat maps for thermal.js: everything here is rasterised once, at load,
// into tables (flash on the device).
//
// A thermal image is not a picture of surfaces lit by light: each pixel is a
// temperature. So every object is painted as temperatures, painter's order
// (a later part covers an earlier one: the camera sees the nearest surface),
// in a 30 x 60 design box, then the heat that bleeds into the air and the
// table round it is a blur of that, outside the object's own outline. The
// result is stored as "excess over room temperature" in field units
// (UNIT_PER_C a degree), which thermal.js adds into the frame's field.
//
// Each digit also gets an order map (0..255): how far each pixel is, along
// the object, from its heat source (the flame, the bulb, the soleplate).
// Warming runs outward along it, cooling runs back in.

export const T_MIN = 16, T_MAX = 46;                 // the camera's span, °C
export const UNITS = 1024;                           // field units over the span
export const UNIT_PER_C = UNITS / (T_MAX - T_MIN);
export const AMB = 20.3;                             // the room
const BOX_W = 30, BOX_H = 60;

// ------------------------------------------------------------ geometry (design box, degrees, y down)

const RAD = Math.PI / 180;
/** Points round an ellipse arc; r and T may be functions of u (0..1 along). */
function arc(cx, cy, rx, ry, a0, a1, r, T, n = 0) {
  n = n || Math.max(10, Math.ceil(Math.abs(a1 - a0) / 6));
  const out = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, a = (a0 + (a1 - a0) * u) * RAD;
    out.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a), typeof r === 'function' ? r(u) : r, typeof T === 'function' ? T(u) : T]);
  }
  return out;
}
function bez(p0, p1, p2, r, T, n = 16) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u;
    out.push([a * p0[0] + b * p1[0] + c * p2[0], a * p0[1] + b * p1[1] + c * p2[1], typeof r === 'function' ? r(u) : r, typeof T === 'function' ? T(u) : T]);
  }
  return out;
}
const seg = (x0, y0, x1, y1, r0, T0, r1 = r0, T1 = T0) => [[x0, y0, r0, T0], [x1, y1, r1, T1]];

// ------------------------------------------------------------ the painter

class Heat {
  constructor(w, h, s, m) {
    this.w = w; this.h = h; this.s = s; this.m = m;
    this.core = new Float32Array(w * h);   // °C over the room
    this.cov = new Float32Array(w * h);    // how much of the pixel is object
  }
  X(x) { return this.m + x * this.s; }
  Y(y) { return this.m + y * this.s; }
  /** A polyline [[x, y, r, T], ...] with round ends; tex(T, q, u) may vary T across (q = 0 axis .. 1 edge) and along. */
  stroke(pts, tex = null, minR = 0.7) {
    const P = pts.map(([x, y, r, T]) => [this.X(x), this.Y(y), Math.max(minR, r * this.s), T]);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y, r] of P) { x0 = Math.min(x0, x - r); y0 = Math.min(y0, y - r); x1 = Math.max(x1, x + r); y1 = Math.max(y1, y + r); }
    // cumulative length for u
    const L = [0];
    for (let i = 1; i < P.length; i++) L.push(L[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
    const LT = L[L.length - 1] || 1;
    for (let y = Math.max(0, Math.floor(y0 - 1)); y < Math.min(this.h, Math.ceil(y1 + 1)); y++)
      for (let x = Math.max(0, Math.floor(x0 - 1)); x < Math.min(this.w, Math.ceil(x1 + 1)); x++) {
        const px = x + 0.5, py = y + 0.5;
        let best = Infinity, bq = 0, bu = 0, bT = 0;
        for (let i = 1; i < P.length; i++) {
          const a = P[i - 1], b = P[i], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
          let t = l2 ? ((px - a[0]) * dx + (py - a[1]) * dy) / l2 : 0;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const ex = px - a[0] - t * dx, ey = py - a[1] - t * dy, dist = Math.sqrt(ex * ex + ey * ey);
          const r = a[2] + (b[2] - a[2]) * t, d = dist - r;
          if (d < best) { best = d; bq = dist / r; bu = (L[i - 1] + t * (L[i] - L[i - 1])) / LT; bT = a[3] + (b[3] - a[3]) * t; }
        }
        const c = 0.5 - best;
        if (c <= 0) continue;
        const cv = c > 1 ? 1 : c, T = (tex ? tex(bT, bq, bu, x, y) : bT) - AMB, i = y * this.w + x;
        this.core[i] = this.core[i] * (1 - cv) + T * cv;
        if (cv > this.cov[i]) this.cov[i] = cv;
      }
  }
  /** A filled polygon [[x, y], ...] at temperature T. */
  poly(pts, T) {
    const P = pts.map(([x, y]) => [this.X(x), this.Y(y)]);
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        let cv = 0;
        for (let sy = 0; sy < 3; sy++) for (let sx = 0; sx < 3; sx++) {
          const px = x + (sx + 0.5) / 3, py = y + (sy + 0.5) / 3;
          let inside = false;
          for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
            const [xi, yi] = P[i], [xj, yj] = P[j];
            if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
          }
          if (inside) cv += 1 / 9;
        }
        if (cv <= 0) continue;
        const i = y * this.w + x;
        this.core[i] = this.core[i] * (1 - cv) + (T - AMB) * cv;
        if (cv > this.cov[i]) this.cov[i] = cv;
      }
  }
  dot(x, y, r, T) { this.stroke([[x, y, r, T], [x + 0.01, y, r, T]]); }
  /**
   * Bake: the heat that bleeds out of the object (a blur, outside its
   * outline), to field units; and the order map from the source.
   */
  bake(src, halo = 0.62) {
    const { w, h } = this, n = w * h;
    let a = Float32Array.from(this.core, (v, i) => (v > 0 ? v * this.cov[i] : 0)), b = new Float32Array(n);
    for (let pass = 0; pass < 3; pass++) {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let s = 0; for (let k = -2; k <= 2; k++) { const xx = x + k; if (xx >= 0 && xx < w) s += a[y * w + xx]; }
        b[y * w + x] = s / 5;
      }
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let s = 0; for (let k = -2; k <= 2; k++) { const yy = y + k; if (yy >= 0 && yy < h) s += b[yy * w + x]; }
        a[y * w + x] = s / 5;
      }
    }
    const heat = new Int16Array(n);
    for (let i = 0; i < n; i++) {
      const c = this.cov[i], v = c * this.core[i] + (1 - c) * a[i] * halo;
      heat[i] = Math.round(Math.max(-600, Math.min(2000, v * UNIT_PER_C)));
    }
    // order: shortest path from the source, cheap inside the object, dear through air
    const dist = new Float32Array(n).fill(1e9);
    let sx = Math.round(this.X(src[0])), sy = Math.round(this.Y(src[1]));
    dist[sy * w + sx] = 0;
    const step = (i, j, cst) => { const v = dist[j] + cst * (this.cov[i] > 0.4 ? 1 : 3.5); if (v < dist[i]) { dist[i] = v; return true; } return false; };
    for (let it = 0, ch = true; ch && it < 40; it++) {
      ch = false;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (x > 0) ch = step(i, i - 1, 1) || ch;
        if (y > 0) { ch = step(i, i - w, 1) || ch; if (x > 0) ch = step(i, i - w - 1, 1.41) || ch; if (x < w - 1) ch = step(i, i - w + 1, 1.41) || ch; }
      }
      for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
        const i = y * w + x;
        if (x < w - 1) ch = step(i, i + 1, 1) || ch;
        if (y < h - 1) { ch = step(i, i + w, 1) || ch; if (x < w - 1) ch = step(i, i + w + 1, 1.41) || ch; if (x > 0) ch = step(i, i + w - 1, 1.41) || ch; }
      }
    }
    let mx = 0;
    for (let i = 0; i < n; i++) if (this.cov[i] > 0.4 && dist[i] > mx) mx = dist[i];
    const ord = new Uint8Array(n);
    for (let i = 0; i < n; i++) ord[i] = Math.min(255, Math.round((dist[i] / (mx || 1)) * 230));
    return { w, h, heat, ord };
  }
}

// a tiny deterministic scatter for textures (salt, sugar, grill marks)
const hsh = (a, b) => { let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1); h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d); return ((h ^ (h >>> 13)) >>> 0) / 4294967296; };

// ------------------------------------------------------------ the ten objects
// Each returns { src: heat source [x, y], hot: spot-meter targets, fx: emitters }.

const OBJ = [
  // 0: a cat asleep, curled nose to tail, seen from above; ears up, eyes shut
  (H) => {
    H.stroke(arc(15, 36, 11.4, 20.2, 0, 360, 3.5, 34.5, 64));
    H.stroke(arc(15, 36, 15.2, 24.2, 15, 118, (u) => 2.5 - u * 0.9, (u) => 33 - u * 1.5), null);      // tail round the outside
    H.poly([[7.5, 15.5], [8.5, 5.5], [14, 12]], 31.5);                                                // ears
    H.poly([[16, 12], [21.5, 5.5], [22.5, 15.5]], 31.5);
    H.stroke(arc(15, 17.5, 8.2, 5.4, 0, 360, 2.8, 35, 40));                                           // the head
    H.poly(arc(15, 17.5, 8.2, 5.4, 0, 360, 0, 0, 30).map(([x, y]) => [x, y]), 35);
    H.stroke(seg(10, 17, 12.6, 18, 0.75, 38.5));                                                      // shut eyes, the hottest
    H.stroke(seg(17.4, 18, 20, 17, 0.75, 38.5));
    H.dot(15, 20.6, 0.9, 37.5);
    return { src: [15, 18], hot: [[11, 17.5], [15, 50]], fx: [{ k: 'breath' }] };
  },
  // 1: a candle on a saucer; the flame, blown left by the draught, is the flag
  (H) => {
    H.stroke(seg(3.5, 57.5, 27, 57.5, 1.8, 29));                                                        // saucer
    H.stroke(seg(9, 56, 22, 56, 2.2, 31));
    H.stroke(seg(15.5, 55, 15.5, 17, 3.5, 32, 3.5, 37));                                               // the wax
    H.stroke(seg(18.6, 18, 18.8, 27, 0.8, 39, 0.6, 35));                                               // a run of melted wax
    H.stroke(seg(12.6, 16.6, 18.4, 16.6, 1.2, 43));                                                    // the molten pool
    H.dot(15.3, 14.6, 0.9, 30);                                                                         // the wick, cooler
    H.stroke([[15, 13.2, 1.1, 62], [12.4, 10.6, 2.9, 80], [8.4, 8.6, 2.3, 80], [4, 8, 0.7, 60]]);      // the flame, bent by the draught
    return { src: [14, 12], hot: [[10, 11], [15.5, 30]], fx: [{ k: 'flame', x: 7, y: 10.5 }, { k: 'plume', x: 4, y: 9, a: 1 }] };
  },
  // 2: a gooseneck desk lamp: the bulb at the hook's tip, the transformer in the base
  (H) => {
    H.stroke(seg(3.5, 57, 27, 57, 2.6, 38));                                                           // base
    H.stroke([[5.5, 55, 2.5, 36], [24.5, 26, 2.5, 36]]);                                               // the arm, then the gooseneck
    H.stroke(arc(15, 19.5, 10, 10, 38, -172, 2.4, (u) => 36 + u * 3.5));
    H.poly([[3.6, 14.5], [7.8, 14.5], [11, 24.5], [0.4, 24.5]], 44);                                   // shade
    H.dot(5.7, 24.2, 2.6, 80);                                                                          // bulb
    return { src: [5.7, 23], hot: [[5.7, 24], [15, 56]], fx: [{ k: 'plume', x: 5.7, y: 13, a: 0.8 }, { k: 'glow', x: 5.7, y: 27 }] };
  },
  // 3: two croissants, fresh from the oven, stacked
  (H) => {
    const ridge = (T, q, u) => T - (Math.abs(((u * 6) % 1) - 0.5) < 0.09 ? 4.5 : 0);
    H.stroke(arc(14, 19.6, 11, 10, -152, 96, (u) => 1.3 + 3.4 * Math.sin(Math.PI * u) ** 0.6, 39), ridge);
    H.stroke(arc(13.4, 42, 13.2, 13.2, -96, 152, (u) => 1.4 + 4.0 * Math.sin(Math.PI * u) ** 0.6, 39.5), ridge);
    return { src: [24, 20], hot: [[25, 20], [26, 43]], fx: [{ k: 'steam', x: 17, y: 8 }, { k: 'steam', x: 22, y: 31 }] };
  },
  // 4: a clothes iron on its soleplate, nose left; the handle is the slope, the cord hangs from the heel
  (H) => {
    H.stroke(seg(22, 44, 22, 59, 2.2, 34, 2.0, 31));                                                   // cord
    H.stroke(seg(22, 41, 22, 5, 2.8, 41, 2.8, 35));                                                    // heel
    H.stroke(seg(21.5, 5.5, 4, 37.5, 2.8, 35, 2.8, 42));                                               // handle
    H.poly([[3, 40], [11, 34.5], [28.5, 34.5], [28.5, 41]], 47);                                       // the body over the plate
    H.stroke([[1, 41.5, 1.2, 80], [6, 41, 2.2, 80], [28.5, 41, 2.4, 80]]);                            // the soleplate
    H.dot(22, 15, 1.3, 31);                                                                             // the dial
    for (let k = 0; k < 4; k++) H.dot(10 + k * 5, 42.2, 0.6, 52);                                       // steam holes
    return { src: [15, 41], hot: [[10, 41.5], [22, 22]], fx: [{ k: 'puff', x: 2, y: 40 }] };
  },
  // 5: three grilled sausages, linked
  (H) => {
    const grill = (n) => (T, q, u) => T + (Math.abs(((u * n) % 1) - 0.5) < 0.11 && q < 0.85 ? 5 : 0);
    H.stroke(seg(9.6, 8, 26.5, 8, 3.1, 39.5), grill(3));                                                    // the bar
    H.stroke(seg(8.2, 12, 8.2, 26.5, 3.2, 39.5), grill(3));                                                 // the stem
    H.stroke(arc(14, 40.5, 12, 13.6, -132, 136, 3.4, 39.5), grill(7));                                      // the bowl
    H.dot(8.4, 9.4, 1.6, 33);                                                                           // twists in the casing
    H.dot(7.2, 29.4, 1.6, 33);
    return { src: [20, 40], hot: [[25, 40], [18, 8]], fx: [{ k: 'steam', x: 22, y: 26 }, { k: 'steam', x: 16, y: 3 }] };
  },
  // 6: a churro bent into a loop, ridged
  (H) => {
    const ridges = (T, q) => T - (q > 0.42 && q < 0.68 ? 5 : 0);
    H.stroke(bez([24.5, 8.5], [6.5, 9.5], [4.4, 41], 3.2, 39), ridges);
    H.stroke(arc(15, 42, 10.8, 12.4, -180, 180, 3.3, 39, 50), ridges);
    return { src: [15, 54], hot: [[15, 54.5], [12, 11]], fx: [{ k: 'steam', x: 15, y: 27 }] };
  },
  // 7: a hair dryer, running: the barrel is the bar, the handle the stroke; the hot jet blows left
  (H) => {
    H.stroke(seg(22.5, 14, 11, 57, 3.3, 34, 3.0, 31));                                                 // handle
    H.stroke(seg(5, 10.5, 26, 10.5, 4.4, 41));                                                         // barrel
    H.stroke(seg(0.8, 10.5, 5, 10.5, 2.8, 62, 3.4, 52));                                               // the nozzle
    for (let k = 0; k < 3; k++) H.stroke(seg(26.5, 7 + k * 3.2, 29.3, 7 + k * 3.2, 0.7, 26));          // the grille at the back
    H.dot(20, 21, 1.1, 27);                                                                             // the switch
    return { src: [2, 10.5], hot: [[2, 10.5], [15, 38]], fx: [{ k: 'jet', x: 0, y: 10.5 }] };
  },
  // 8: a soft pretzel, salted, with its twist at the waist
  (H) => {
    const salt = (T, q, u, x, y) => T - (hsh(x >> 1, (y >> 1) * 7) < 0.13 && q < 0.8 ? 7 : 0);
    H.stroke(arc(15, 18.5, 9, 9.6, 90, 450, 3.3, 38.5, 48), salt);
    H.stroke(arc(15, 41.5, 11.6, 12.8, -90, 270, 3.6, 39, 56), salt);
    H.stroke(seg(11, 26, 19, 32, 1.0, 36.5));                                                          // the twist
    return { src: [15, 29], hot: [[5, 41], [15, 9]], fx: [{ k: 'steam', x: 15, y: 6 }] };
  },
  // 9: a hot frying pan with a cold egg cracked into it; the handle is the tail
  (H) => {
    H.stroke([[25.6, 26, 2.8, 44], [25.4, 44, 2.6, 42.5], [20, 58, 2.4, 39]]);                           // handle
    H.poly(arc(14, 20.5, 12, 13.2, 0, 360, 0, 0, 40).map(([x, y]) => [x, y]), 40.5);                     // oil
    H.stroke(arc(14, 20.5, 12, 13.2, 0, 360, 2.6, 43.5, 56));                                            // the rim
    H.poly([[6, 14], [10, 9.5], [17, 10.5], [21.5, 15], [21, 25], [17, 30], [10, 30], [6.5, 25]], 22); // the white
    H.poly([[7.5, 15], [10.5, 11], [16.5, 12], [20, 15.5], [19.5, 24], [16, 28.5], [10.5, 28.5], [7.8, 24]], 9);
    H.dot(15.5, 17.5, 3.6, 7);                                                                          // yolk
    return { src: [25.4, 40], hot: [[14, 7.5], [25.5, 40]], fx: [{ k: 'spit', x: 14, y: 20.5, rx: 12, ry: 13.2 }, { k: 'steam', x: 8, y: 6 }] };
  },
];

/** A tea-light from above: the colon. */
function tealight(H) {
  H.stroke(arc(5, 5, 3.6, 3.6, 0, 360, 1.1, 31, 24));
  H.dot(5, 5, 1.6, 80);
  return { src: [5, 5], hot: [[5, 5]], fx: [{ k: 'flame', x: 5, y: 5 }, { k: 'plume', x: 5, y: 3, a: 0.55 }] };
}

function build(fn, s, m, bw = BOX_W, bh = BOX_H) {
  const w = Math.ceil(bw * s) + 2 * m, h = Math.ceil(bh * s) + 2 * m;
  const H = new Heat(w, h, s, m);
  const meta = fn(H);
  const baked = H.bake(meta.src);
  const tr = ([x, y]) => [m + x * s, m + y * s];
  return {
    ...baked, m, s,
    src: tr(meta.src),
    hot: meta.hot.map(tr),
    fx: meta.fx.map((f) => ({ ...f, x: f.x !== undefined ? m + f.x * s : 0, y: f.y !== undefined ? m + f.y * s : 0, rx: (f.rx ?? 0) * s, ry: (f.ry ?? 0) * s, sc: s })),
  };
}

export const SCALE_H = 1, SCALE_M = 0.76, MARGIN = 7;
export const DIGIT_H = OBJ.map((fn) => build(fn, SCALE_H, MARGIN));
export const DIGIT_M = OBJ.map((fn) => build(fn, SCALE_M, MARGIN));
export const TEA = build(tealight, 1, 6, 10, 10);
