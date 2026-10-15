// The paper-cuts for papercut.js, rasterised once at load (on the device:
// const tables in flash): the one-hue ramp, the carp, the four rims of the
// round window flower (tuanhua), and the outlines of the rim's petals for
// when they are snipped off.

import { ell, spl, leaf, prep, leafSD } from './papercut-glyphs.js';

// ------------------------------------------------------------ the ramp
// Cinnabar, hue 355: every colour on the glass is one of these 64 RGB565
// values (picked from the 565 grid to stay on hue), from an oxblood almost
// black through the cinnabar of the paper to the pink-white of light through
// rice paper. Values in the face are 10-bit (0..1023) and dithered between
// neighbouring entries.
const STOPS = [[0, 14, 3], [0.1, 40, 5], [0.22, 86, 9], [0.36, 146, 14], [0.5, 200, 24], [0.6, 222, 52],
  [0.7, 236, 100], [0.8, 245, 150], [0.89, 250, 196], [1, 255, 236]];
const HUE = 355;
function hueOf(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), ch = mx - mn;
  if (!ch) return [0, 0];
  let h;
  if (mx === r) h = ((g - b) / ch) % 6; else if (mx === g) h = (b - r) / ch + 2; else h = (r - g) / ch + 4;
  return [((h * 60) + 360) % 360, ch];
}
export const RAMP = new Uint16Array(64);
export const RAMP_RGB = new Int32Array(64);
for (let i = 0; i < 64; i++) {
  const v = i / 63;
  let k = 1;
  while (STOPS[k][0] < v) k++;
  const a = STOPS[k - 1], b = STOPS[k], f = (v - a[0]) / (b[0] - a[0]);
  const r = a[1] + (b[1] - a[1]) * f, g = a[2] + (b[2] - a[2]) * f, bl = g + ((r - g) * (360 - HUE)) / 60;
  // the 565 neighbour closest in value with the hue kept within a few degrees
  let best = 0, bc = 1e9;
  for (let dr = -1; dr <= 1; dr++) for (let dg = -2; dg <= 2; dg++) for (let db = -2; db <= 2; db++) {
    const R5 = Math.max(0, Math.min(31, Math.round(r / 8.226) + dr)), G6 = Math.max(0, Math.min(63, Math.round(g / 4.048) + dg)), B5 = Math.max(0, Math.min(31, Math.round(bl / 8.226) + db));
    const rr = (R5 << 3) | (R5 >> 2), gg = (G6 << 2) | (G6 >> 4), bb = (B5 << 3) | (B5 >> 2);
    const [h, ch] = hueOf(rr, gg, bb);
    const dh = ch < 24 ? 0 : Math.min(Math.abs(h - HUE), 360 - Math.abs(h - HUE));
    const cost = (rr - r) ** 2 + (gg - g) ** 2 * 2 + (bb - bl) ** 2 + (dh > 6 ? 1e5 : dh * dh * 4);
    if (cost < bc) { bc = cost; best = (R5 << 11) | (G6 << 5) | B5; RAMP_RGB[i] = (rr << 16) | (gg << 8) | bb; }
  }
  RAMP[i] = best;
}
/** The ramp colour for a 10-bit value, as 0xRRGGBB (for kit shapes drawn on top). */
export const shade = (v) => RAMP_RGB[Math.max(0, Math.min(63, (v + 8) >> 4))];

// ------------------------------------------------------------ supersampled masks
/** Rasterise inside(x, y) over a box at 3 x 3 samples a pixel into 0..255 coverage. */
function raster(x0, y0, w, h, inside) {
  const m = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let n = 0;
      for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) if (inside(x0 + x + (a + 0.5) / 3, y0 + y + (b + 0.5) / 3)) n++;
      m[y * w + x] = Math.round((n * 255) / 9);
    }
  return m;
}
const tmp = { d: 0, u: 0 };
const L1 = (l) => prep(l, 1, 0, 0);
const inLeaf = (L, x, y) => leafSD(L, x, y, tmp).d < 0;
function inPoly(px, py, pts) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

// ------------------------------------------------------------ the carp (minutes)
// A carp swimming right, cut as one piece: body, forked tail, sawtooth
// dorsal fin, two belly fins; cut into it a crescent gill, a crescent eye
// round a held pupil, a mouth, fin rays, tail rays and fishscale crescents
// on the rear body. The middle of the body is left solid: the minutes are
// cut there.
export const FISH = { x: 74, y: 2, w: 86, h: 77 };
export const MIN_SLOTS = [[101, 27], [118, 27]];          // top-left of the two minute digits (15 x 29)
const zig = (pts, amp, step) => {
  // resample a contour every `step` px and push alternate points outward (a sawtooth edge)
  const out = [];
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i], l = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.round(l / step));
    const nx = (by - ay) / l, ny = -(bx - ax) / l;
    for (let k = 0; k < n; k++) { const f = k / n, o = (out.length & 1) ? amp : 0; out.push([ax + (bx - ax) * f + nx * o, ay + (by - ay) * f + ny * o]); }
  }
  out.push(pts[pts.length - 1]);
  return out;
};
const DORSAL = [[97, 27], [103, 19], ...zig([[104, 18.5], [114, 14], [124, 10.6], [131, 9]], 1.6, 1.8), [135, 12.5], [138, 20], [139.5, 26]];
const PELVIC = [[131, 59], ...zig([[127, 63.5], [114, 71.5]], 1.3, 1.8), [117.5, 65.5], [121, 59]];
const ANAL = [[107.5, 56], ...zig([[103.5, 60.5], [93, 66]], 1.3, 1.8), [96.5, 60], [99, 56]];
const PEDUNCLE = [[86, 38], [91, 34.5], [91, 49.5], [86, 46]];
// the forked tail: a fan from the peduncle to two tips, its trailing edges toothed
const TAIL = [[89, 37.5], [85.5, 26.5], [80.5, 17], [76.4, 13.2], ...zig([[76.4, 13.2], [79.6, 42]], 1.1, 2.2), ...zig([[79.6, 42], [76.4, 70.8]], 1.1, 2.2), [76.4, 70.8], [80.5, 67], [85.5, 57.5], [89, 46.5]];
const RED = [
  
  L1(leaf(spl([[154.4, 47.6], [157.6, 52], [156.2, 56.6], [152.8, 58.4]]), 0.85)),        // a barbel
];
const HOLES = [
  L1(leaf(ell(160, 42, 18, 18, 151, 178), 1.25, 3, 1)), L1(leaf(ell(160, 42, 18, 18, 182, 209), 1.25, 3, 1)),   // gill, in two, toothed on the head side
  L1(leaf(spl([[156.4, 45.8], [153, 47.3], [150.2, 46.9]]), 0.85)),                      // mouth
  ...[[111, 22.5, 105.5, 17.5], [119, 21.5, 114, 14.8], [127, 21.5, 122.5, 12.4]].map(([a, b, c, d]) => L1(leaf([[a, b], [c, d]], 0.7))),
  ...[[[86.4, 37], [82.6, 27.5], [79.2, 19]], [[84.6, 39.6], [81.6, 34.5], [79.8, 29.5]]].flatMap((p) => [L1(leaf(spl(p), 0.72)), L1(leaf(spl(p.map(([x, y]) => [x, 84 - y])), 0.72))]),
  ...[[92.5, 37.5], [92.5, 42], [92.5, 46.5], [96, 35], [96, 49]].map(([cx, cy]) => L1(leaf(ell(cx, cy, 2.4, 2.4, 110, 250, 12), 0.7))),
];
const EYE = [149.6, 36.4];
function inEye(x, y) {
  const dx = x - EYE[0], dy = y - EYE[1], r2 = dx * dx + dy * dy;
  return r2 < 2.8 * 2.8 && r2 > 1.3 * 1.3 && !(dy > 0 && Math.abs(dx) < 0.6);   // a ring, its pupil held by a bridge
}
function inBody(x, y) {
  const u = (x - 87) / 68;
  if (u <= 0 || u >= 1) return false;
  const f = u > 0.55 ? Math.sqrt(1 - ((u - 0.55) / 0.45) ** 2) : Math.pow(Math.sin((Math.PI / 2) * (u / 0.55)), 0.3);
  return y > 42 - 21 * f && y < 42 + 22 * f;
}
export const FISH_MAP = raster(FISH.x, FISH.y, FISH.w, FISH.h, (x, y) => {
  let red = inBody(x, y) || inPoly(x, y, DORSAL) || inPoly(x, y, PELVIC) || inPoly(x, y, ANAL) || inPoly(x, y, PEDUNCLE) || inPoly(x, y, TAIL);
  if (!red) for (const L of RED) if (inLeaf(L, x, y)) { red = true; break; }
  if (!red || inEye(x, y)) return false;
  for (const L of HOLES) if (inLeaf(L, x, y)) return false;
  return true;
});
/** How much of a column of the carp is tail (0 at the body, 1 at the tail's tips): the tail flicks. */
export const TAIL_W = new Float32Array(FISH.w);
for (let x = 0; x < FISH.w; x++) { const X = FISH.x + x, u = (90 - X) / 14; TAIL_W[x] = u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u); }

// ------------------------------------------------------------ the window flower (hours)
// A tuanhua: a round flower cut from paper folded into 16. A solid disc
// holds the hours; the rim is the folded pattern, one of four, a new one
// each hour (petals with teeth, a star, cloud scallops, a sawtooth sun).
export const MED = { x: 0, y: 1, w: 78, h: 78, cx: 38.5, cy: 40 };
export const HOUR_SLOTS = [[17, 20], [40, 20]];            // top-left of the two hour digits (20 x 40)
export const DISC_R = 29.6;
const S = Math.PI / 8;                                      // one fold's sector
const tri = (v) => { const f = v - Math.floor(v); return f < 0.5 ? f * 2 : 2 - f * 2; };
const sq = (v) => Math.sqrt(Math.max(0, v));
/** Rim patterns: is (r, phi) paper? phi is the angle from the sector's centre line, 0..S/2; t = phi / (S/2). */
const RIMS = [
  (r, phi, t) => {                                          // petals with teeth, crescent ring, willow-leaf holes
    const out = 34.3 + 3.3 * Math.pow(Math.cos((t * Math.PI) / 2), 0.7) - 0.85 * tri((r * phi) / 2.1);
    if (r > out) return false;
    if (Math.abs(r - 31.1) < 0.95 * sq(1 - (t / 0.8) ** 2)) return false;
    const u = (r - 32.9) / 4.0;
    if (u > 0 && u < 1 && Math.abs(r * phi) < 1.15 * Math.sqrt(Math.sin(Math.PI * u))) return false;
    return true;
  },
  (r, phi, t) => {                                          // a sixteen-point star, dots and teardrops
    if (r > 33.6 + 4.2 * (1 - t) ** 1.2) return false;
    if ((r - 31.2) ** 2 + (r * phi) ** 2 < 1.25 ** 2) return false;
    if ((r - 31.4) ** 2 + (r * (S / 2 - phi)) ** 2 < 0.95 ** 2) return false;
    const u = (r - 33.0) / 3.6;
    if (u > 0 && u < 1 && Math.abs(r * phi) < 1.05 * Math.sqrt(Math.sin(Math.PI * u ** 0.7))) return false;
    return true;
  },
  (r, phi, t) => {                                          // cloud scallops, two to a fold
    if (r > 35 + 2.4 * Math.pow(Math.abs(Math.cos(t * Math.PI)), 0.5)) return false;
    if (Math.abs(r - 33.5) < 0.9 * sq(1 - (t / 0.3) ** 2) || Math.abs(r - 33.5) < 0.9 * sq(1 - ((1 - t) / 0.3) ** 2)) return false;
    if (Math.abs(r - 31) < 0.85 * sq(1 - ((t - 0.5) / 0.38) ** 2)) return false;
    return true;
  },
  (r, phi, t) => {                                          // a sawtooth sun with long rays
    if (r > 37 - 2.2 * tri((r * phi) / 2.6 + 0.5)) return false;
    let u = (r - 30.6) / 5.2;
    if (u > 0 && u < 1 && Math.abs(r * phi) < 1.2 * Math.sqrt(Math.sin(Math.PI * u))) return false;
    u = (r - 31.4) / 3.4;
    if (u > 0 && u < 1 && Math.abs(r * (S / 2 - phi)) < 0.9 * Math.sqrt(Math.sin(Math.PI * u))) return false;
    return true;
  },
];
function polar(x, y) {
  const dx = x - MED.cx, dy = y - MED.cy, r = Math.hypot(dx, dy);
  let a = Math.atan2(dx, -dy);                              // clock angle: 0 at the top, clockwise
  if (a < 0) a += 2 * Math.PI;
  const k = Math.floor(a / S + 0.5), phi = Math.abs(a - k * S);
  return [r, a, phi];
}
export const MED_MAP = RIMS.map((rim) => raster(MED.x, MED.y, MED.w, MED.h, (x, y) => {
  const [r, , phi] = polar(x, y);
  if (r < DISC_R) return true;
  if (r > 40) return false;
  return rim(r, phi, phi / (S / 2));
}));
/** Per pixel of the flower's box: clock angle (0..4095) and radius x 4. */
export const MED_ANG = new Uint16Array(MED.w * MED.h), MED_RAD = new Uint8Array(MED.w * MED.h);
for (let y = 0; y < MED.h; y++)
  for (let x = 0; x < MED.w; x++) {
    const [r, a] = polar(MED.x + x + 0.5, MED.y + y + 0.5);
    MED_ANG[y * MED.w + x] = Math.round((a / (2 * Math.PI)) * 4096) & 4095;
    MED_RAD[y * MED.w + x] = Math.min(255, Math.round(r * 4));
  }
/** One fold of each rim as an outline, centred on the top (for the petal that falls when it is snipped off). */
export const PETAL = RIMS.map((rim) => {
  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const phiS = -S / 2 + (S * i) / 12, phi = Math.abs(phiS);
    let r = 40;
    while (r > DISC_R && !rim(r, phi, phi / (S / 2))) r -= 0.25;
    pts.push([r * Math.sin(phiS), -r * Math.cos(phiS)]);
  }
  for (let i = 4; i >= 0; i--) { const phiS = -S / 2 + (S * i) / 4; pts.push([DISC_R * Math.sin(phiS), -DISC_R * Math.cos(phiS)]); }
  return pts;
});
export const SECTOR = S;
export const ART_BYTES = FISH.w * FISH.h + 4 * MED.w * MED.h + MED.w * MED.h * 3 + 64 * 2 + FISH.w * 4;

// ------------------------------------------------------------ outside the window
// A plum branch in blossom outside, its soft shadow on the paper by day
// (blurred silhouette, 0..255), swaying from its base off the top edge.
export const BRANCH = { x: 62, y: 0, w: 66, h: 34, bx: 120, by: -3 };
export const BRANCH_MAP = (() => {
  const twigs = [
    [[[121, -3], [108, 3.5], [96, 9.5], [86, 16], [79, 24.5]], 1.9],
    [[[108, 3.5], [102, -2]], 1.0], [[[96, 9.5], [91.5, 3.5], [89, 0.5]], 0.9], [[[86, 16], [80, 13.5], [73, 14.5]], 0.85], [[[113, 1], [117, 7], [116, 12]], 0.8],
  ].map(([pts, w]) => [prep(leaf(spl(pts), w), 1, 0, 0), w]);
  const flowers = [[102, -1.5, 2.6], [89.5, 1.5, 2.4], [79, 25, 2.8], [73.5, 14.5, 2.4], [116, 12.5, 2.3], [92.5, 12.5, 1.7], [84, 20.5, 1.6], [110, 7.5, 1.5]];
  const m = new Float32Array(BRANCH.w * BRANCH.h);
  for (let y = 0; y < BRANCH.h; y++)
    for (let x = 0; x < BRANCH.w; x++) {
      const X = BRANCH.x + x + 0.5, Y = BRANCH.y + y + 0.5;
      let v = 0;
      for (const [L, w] of twigs) {
        // a twig is a line that tapers from its base: distance to the centre line against a slowly narrowing width
        leafSD(L, X, Y, tmp);
        const d = tmp.d + L.w * Math.sqrt(Math.sin(Math.PI * Math.min(1, Math.max(0, tmp.u)))) - w * (1 - 0.5 * tmp.u);
        if (d < 0.5) v = Math.max(v, Math.min(1, 0.5 - d));
      }
      for (const [fx, fy, r] of flowers) {
        const a = Math.atan2(Y - fy, X - fx), rr = r * (0.82 + 0.18 * Math.cos(5 * a));   // five petals
        const d = Math.hypot(X - fx, Y - fy) - rr;
        if (d < 0.5) v = Math.max(v, Math.min(1, 0.5 - d));
      }
      m[y * BRANCH.w + x] = v;
    }
  // soften: it is a shadow on paper
  const out = new Uint8Array(BRANCH.w * BRANCH.h);
  for (let y = 0; y < BRANCH.h; y++)
    for (let x = 0; x < BRANCH.w; x++) {
      let s = 0, n = 0;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const xx = x + i, yy = y + j;
        if (xx >= 0 && yy >= 0 && xx < BRANCH.w && yy < BRANCH.h) { s += m[yy * BRANCH.w + xx] * (i || j ? 1 : 2); n += i || j ? 1 : 2; }
      }
      out[y * BRANCH.w + x] = Math.round((255 * s) / n);
    }
  return out;
})();
