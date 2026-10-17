// The hour: two wyrms, each coiled into the shape of its numeral. Every
// numeral is ONE continuous body, tail first, head last: the 1 is a serpent
// rearing with its head bent forward as the flag, the 0 and the 8 are
// ouroboroi biting their own tails, the 4 is a single coil (up the stem,
// down the diagonal, out along the bar, head at the end of the bar).
//
// Paths are centre lines in a 30 x 60 cell. Bodies are stamped as discs
// along the path into a nearest-surface buffer (signed distance, arc
// position, surface normal), then shaded as a scaly cylinder.
import { W, H, img } from './rpgbattle-gfx.js';

const CW = 30, CH = 60;
// Each numeral: a list of strokes; strokes join at sharp corners, points in
// a stroke are joined by a Catmull-Rom spline. 'ring' = closed ellipse.
const DEF = {
  0: { ring: [15, 30, 10.5, 24.5] },
  1: [[[28, 56.5], [22, 56], [18, 51], [18, 34], [18, 13], [15.5, 7], [11, 8.5]]],
  2: [[[27, 55.5], [5, 55.5]], [[5, 55.5], [13, 45], [21, 35], [25, 24], [23, 12], [15.5, 6], [8.5, 8], [5, 14.5]]],
  3: [[[4.5, 46], [8.5, 53], [16, 55.5], [23, 51.5], [25.5, 43], [22.5, 35], [14, 31]],
      [[14, 31], [21.5, 26.5], [24, 18], [21, 9.5], [14.5, 6], [8.5, 7.5], [5, 13]]],
  4: [[[21, 56], [21, 30], [21, 5.5]], [[21, 5.5], [13, 22], [5, 39.5]], [[5, 39.5], [15, 39.5], [24, 39.5]]],
  5: [[[4.5, 48], [10, 54.5], [17, 55.5], [23.5, 51], [25.5, 42], [22.5, 33.5], [15.5, 30.5], [9, 31], [6, 33]],
      [[6, 33], [6.5, 20], [7, 6]], [[7, 6], [16, 6], [24, 6]]],
  6: [[[7.5, 44], [9, 52], [16, 55.5], [23, 51.5], [25.5, 42.5], [22.5, 33.5], [15.5, 29.5], [8.5, 32], [5.5, 40], [5, 29], [7, 17], [12, 8.5], [18.5, 5.5], [24.5, 7.5]]],
  7: [[[11, 56], [14.5, 41], [19.5, 24], [25, 6.5]], [[25, 6.5], [15, 6.5], [5.5, 6.5]]],
  8: [[[18, 6.5], [23, 11.5], [22, 21], [15, 28.5], [7, 34.5], [4.8, 44.5], [9, 53], [15, 55.5], [21, 53], [25.2, 44.5], [23, 34.5], [15, 28.5], [8, 21], [7, 11.5], [11.5, 6.6]]],
  9: [[[22.5, 16], [20, 8], [14.5, 5.5], [8, 8.5], [5, 17], [8, 25.5], [15, 29.5], [21.5, 27], [25, 18], [25, 32], [22.5, 45], [16, 53.5], [8, 55.5]]],
};

const STEP = 0.5;
/** Dense samples of a numeral's centre line: { n, x, y, tx, ty, L }. */
function build(d) {
  const pts = [];
  if (d.ring) {
    // ouroboros: from just right of the top, clockwise round to just left of it
    const [cx, cy, rx, ry] = d.ring;
    const a0 = -Math.PI / 2 + 0.36, a1 = a0 + 2 * Math.PI - 0.62;
    for (let k = 0; k <= 400; k++) { const a = a0 + (a1 - a0) * (k / 400); pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]); }
  } else {
    for (const st of d) {
      const P = [st[0], ...st, st[st.length - 1]];
      for (let i = 1; i < P.length - 2; i++) {
        const p0 = P[i - 1], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2];
        for (let k = pts.length && i === 1 ? 1 : 0; k < 24; k++) {
          const t = k / 24, t2 = t * t, t3 = t2 * t;
          const f = (a, b, c, e) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - e) * t2 + (-a + 3 * b - 3 * c + e) * t3);
          pts.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
        }
      }
      pts.push(st[st.length - 1]);
    }
  }
  // resample by arc length
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const L = cum[cum.length - 1], n = Math.floor(L / STEP) + 1;
  const x = new Float32Array(n), y = new Float32Array(n), tx = new Float32Array(n), ty = new Float32Array(n);
  let j = 0;
  for (let k = 0; k < n; k++) {
    const s = Math.min(L, k * STEP);
    while (j < cum.length - 2 && cum[j + 1] < s) j++;
    const f = (s - cum[j]) / (cum[j + 1] - cum[j] || 1);
    x[k] = pts[j][0] + (pts[j + 1][0] - pts[j][0]) * f;
    y[k] = pts[j][1] + (pts[j + 1][1] - pts[j][1]) * f;
  }
  for (let k = 0; k < n; k++) {
    const a = Math.max(0, k - 2), b = Math.min(n - 1, k + 2);
    const dx = x[b] - x[a], dy = y[b] - y[a], l = Math.hypot(dx, dy) || 1;
    tx[k] = dx / l; ty[k] = dy / l;
  }
  return { n, x, y, tx, ty, L };
}
export const PATHS = {};
for (const k in DEF) PATHS[k] = build(DEF[k]);

// --------------------------------------------------- the surface buffer
const SD = new Float32Array(W * H), SS = new Float32Array(W * H), NX = new Float32Array(W * H), NY = new Float32Array(W * H);
const VV = new Float32Array(W * H), OWN = new Int8Array(W * H), PR = new Int8Array(W * H);
let bx0 = W, bx1 = -1, by0 = H, by1 = -1;
export function clear() {
  for (let y = Math.max(0, by0); y <= Math.min(H - 1, by1); y++) for (let x = Math.max(0, bx0); x <= Math.min(W - 1, bx1); x++) { SD[y * W + x] = 99; OWN[y * W + x] = -1; PR[y * W + x] = 0; }
  bx0 = W; bx1 = -1; by0 = H; by1 = -1;
}
SD.fill(99); OWN.fill(-1);

/** Stamp one disc: centre, radius, arc tag s, tangent (for the across sign), owner. */
function stamp(cx, cy, r, s, tx, ty, own, pr) {
  const R = r + 2;
  const x0 = Math.max(0, Math.floor(cx - R)), x1 = Math.min(W - 1, Math.ceil(cx + R));
  const y0 = Math.max(0, Math.floor(cy - R)), y1 = Math.min(H - 1, Math.ceil(cy + R));
  if (x0 < bx0) bx0 = x0; if (x1 > bx1) bx1 = x1; if (y0 < by0) by0 = y0; if (y1 > by1) by1 = y1;
  const ir = 1 / r;
  for (let y = y0; y <= y1; y++) {
    const dy = y - cy;
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx, d = Math.sqrt(dx * dx + dy * dy) - r, p = y * W + x;
      if ((d < SD[p] && pr >= PR[p]) || (pr > PR[p] && d < 0.5)) {
        PR[p] = pr; SD[p] = d; SS[p] = s; NX[p] = dx * ir; NY[p] = dy * ir; VV[p] = (tx * dy - ty * dx) * ir; OWN[p] = own;
      }
    }
  }
}

const R0 = 4.6;            // body radius
/**
 * Lay one wyrm into the buffer.
 * o: { ox, oy, digit, head (0..1 of the path emerged), t, sway, own }
 * Returns the head pose { x, y, fx, fy } (snout direction) or null.
 */
export function lay(o) {
  const P = PATHS[o.digit], L = P.L, n = P.n;
  const hp = o.head * L;                     // path position of the head
  if (hp <= 0.5) return null;
  const off = L - hp;                        // body arc s sits at path q = s - off
  const t = o.t, breath = 1 + 0.035 * Math.sin(t * 2.1 + (o.own & 1) * 2);
  const k0 = Math.max(0, Math.ceil(off / STEP));
  for (let k = 0; k < n; k++) {
    const q = k * STEP, s = q + off;          // q path position, s arc on the body
    if (q > hp) break;
    const kk = Math.min(n - 1, k);
    // radius: tapered tail, slight neck
    const tail = s < 16 ? 0.25 + 0.75 * Math.sin((s / 16) * Math.PI / 2) : 1;
    const neck = L - s < 6 ? 0.9 + 0.1 * ((L - s) / 6) : 1;
    const r = R0 * breath * tail * neck;
    // slither: a small travelling wave across the body, fading at both ends
    const w = Math.sin(s * 0.42 - t * 3.1) * 0.55 * Math.min(1, s / 20) * Math.min(1, (L - s) / 10);
    stamp(o.ox + P.x[kk] - P.ty[kk] * w, o.oy + P.y[kk] + P.tx[kk] * w, r, s, P.tx[kk], P.ty[kk], o.own, o.pr | 0);
  }
  void k0;
  // head: continue past the path end along its tangent, turned by `sway`
  const ke = Math.min(n - 1, Math.round(hp / STEP));
  let fx = P.tx[ke], fy = P.ty[ke];
  const cs = Math.cos(o.sway), sn = Math.sin(o.sway);
  [fx, fy] = [fx * cs - fy * sn, fx * sn + fy * cs];
  const hx = o.ox + P.x[ke], hy = o.oy + P.y[ke];
  for (let u = 0; u <= 6.5; u += 0.5) {
    const r = u < 1.5 ? R0 * (0.92 + 0.28 * (u / 1.5)) : R0 * (1.2 - 0.5 * ((u - 1.5) / 5) ** 1.4);
    stamp(hx + fx * u, hy + fy * u, r * breath, L + u, fx, fy, o.own, o.pr | 0);
  }
  return { x: hx, y: hy, fx, fy };
}

const lin = (h) => { const n = parseInt(h.slice(1), 16), f = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return [f(n >> 16), f((n >> 8) & 255), f(n & 255)]; };
export const COL = {
  dark: lin('#06301c'), body: lin('#44f088'), lite: lin('#8dff9a'), gem: lin('#d8f040'),
  belly: lin('#0f7a46'), burn: lin('#ff6a1a'), ember: lin('#ffd070'), white: [1, 1, 1],
};
const LX = -0.55, LY = -0.75;   // light from the upper left

/**
 * Shade the buffer into img. st[own] = { flash, burn, glint, L }:
 * flash 0..1 white hit-flash, burn 0..1 dissolve progress, glint arc position.
 */
export function shadeAll(st) {
  for (let y = Math.max(0, by0); y <= Math.min(H - 1, by1); y++) {
    for (let x = Math.max(0, bx0); x <= Math.min(W - 1, bx1); x++) {
      const p = y * W + x, d = SD[p];
      if (d > 2.2) continue;
      const s = st[OWN[p]];
      let keep = 1;
      if (s.burn > 0) {
        // dissolve: each pixel has its moment, swept from the head end down
        const h = hashP(x, y) * 0.55 + 0.45 * (1 - SS[p] / (s.L + 7));
        keep = h > s.burn ? 1 : 0;
        if (!keep) continue;
      }
      // dark moat round the body so it stands on any ground
      const o = 3 * p;
      if (d > -0.5) {
        const m = d < 0.6 ? 1 : 1 - (d - 0.6) / 1.6;
        const k = 1 - 0.92 * m;
        img[o] *= k; img[o + 1] *= k; img[o + 2] *= k;
      }
      if (d >= 0.5) continue;
      const cov = d < -0.5 ? 1 : 0.5 - d;
      const nx = NX[p], ny = NY[p], q = nx * nx + ny * ny, nz = Math.sqrt(q < 1 ? 1 - q : 0);
      const lam = 0.55 + 0.6 * Math.max(0, 0.62 * nz - (nx * LX + ny * LY) * 0.75);
      const v = VV[p], sa = SS[p], head = sa > s.L;
      // scales: a chain of diamonds down the spine, rows of scales elsewhere
      const ph = sa / 5.4 - Math.floor(sa / 5.4);
      const dia = !head && Math.abs(v) < 0.5 * (1 - Math.abs(ph - 0.5) * 2) + 0.06;
      const sc = 0.82 + 0.18 * Math.cos(sa * 2.3 + Math.abs(v) * 4.5);
      let r, g, b;
      if (dia) { r = COL.gem[0]; g = COL.gem[1]; b = COL.gem[2]; }
      else { r = COL.body[0] * sc; g = COL.body[1] * sc; b = COL.body[2] * sc; }
      // rim of the cylinder darkens into the outline
      const rim = Math.abs(v) > 0.82 ? 0.55 : 1;
      r *= lam * rim; g *= lam * rim; b *= lam * rim;
      // specular sheen, plus a glint that runs from tail to head
      const spec = Math.max(0, 0.5 * nz - (nx * LX + ny * LY) * 0.85 - 0.35);
      const gd = sa - s.glint, gl = Math.exp(-gd * gd * 0.04) * 0.55;
      r += (spec * 0.6 + gl) * COL.lite[0]; g += (spec * 0.6 + gl) * COL.lite[1]; b += (spec * 0.6 + gl) * COL.lite[2];
      if (s.flash > 0) { r += (1 - r) * s.flash; g += (1 - g) * s.flash; b += (1 - b) * s.flash; }
      if (s.burn > 0) {
        // the edge of the dissolve glows like embers
        const h = hashP(x, y) * 0.55 + 0.45 * (1 - SS[p] / (s.L + 7)), e = Math.max(0, 1 - (h - s.burn) / 0.18);
        const f = Math.min(1, s.burn * 3);
        r = r * (1 - f) + COL.burn[0] * f * 0.6 + e * COL.ember[0];
        g = g * (1 - f) + COL.burn[1] * f * 0.6 + e * COL.ember[1];
        b = b * (1 - f) + COL.burn[2] * f * 0.6 + e * COL.ember[2];
      }
      img[o] += (r - img[o]) * cov; img[o + 1] += (g - img[o + 1]) * cov; img[o + 2] += (b - img[o + 2]) * cov;
    }
  }
}
function hashP(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export { CW, CH };
