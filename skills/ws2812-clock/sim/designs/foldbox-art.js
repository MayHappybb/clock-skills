// Foldbox artwork: corrugated kraft board, spray-stencilled numerals, and the
// black cat who lives in the box. Everything here is drawn once into 64x64
// texel maps (cached) except the cat, which is redrawn every frame.
import * as kit from '../js/kit.js';

export const T = 64;                       // texels per face = LEDs per panel
const KRAFT = kit.hex('#c69a68'), LINER = kit.hex('#b99263');
export const INK = { red: [0.6, 0.035, 0.025], black: [0.05, 0.043, 0.04] };

// ---------------------------------------------------------------- SDF bits
function sdBox(x, y, x0, y0, x1, y1) {
  const dx = Math.max(x0 - x, x - x1), dy = Math.max(y0 - y, y - y1);
  const ox = dx > 0 ? dx : 0, oy = dy > 0 ? dy : 0;
  return Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(dx, dy), 0);
}
/** A flat-ended stroke from a to b, width w (stencil strokes are butt-cut). */
function sdSlab(x, y, ax, ay, bx, by, w) {
  const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L;
  const px = x - ax, py = y - ay, al = px * ux + py * uy, ac = -px * uy + py * ux;
  return sdBox(al, ac, 0, -w / 2, L, w / 2);
}
/**
 * An elliptical stroke round (cx, cy) with radii a, b (centre line), thick
 * ts at the sides and tt at top and bottom (the stress of a broad pen), from
 * angle a0 to a1 in degrees (screen: 0 right, 90 down), or whole if a0 == a1.
 */
function sdArc(x, y, cx, cy, a, b, ts, tt, a0 = 0, a1 = 0) {
  const qx = (x - cx) / a, qy = (y - cy) / b, r = Math.hypot(qx, qy) || 1e-6;
  const g = Math.hypot(qx / a, qy / b) / r;
  const c = Math.abs(qx / r);
  const th = tt + (ts - tt) * c;
  let d = Math.abs((r - 1) / g) - th / 2;
  if (a0 !== a1) {
    const phi = Math.atan2(qy, qx) * 180 / Math.PI;
    const span = a1 - a0, rel = ((phi - a0) % 360 + 360) % 360;
    if (rel > span) {
      const R = Math.hypot(x - cx, y - cy);
      const over = Math.min(rel - span, 360 - rel) * Math.PI / 180;
      d = Math.max(d, R * Math.sin(Math.min(over, Math.PI / 2)));
    }
  }
  return d;
}
const cut = (d, x, y, x0, y0, x1, y1) => Math.max(d, -sdBox(x, y, x0, y0, x1, y1));
const U = Math.min;

// ---------------------------------------------------------------- numerals
// A stencil face drawn for a 64-LED panel: 34 x 46 LEDs, broad-pen contrast
// (9 LED sides, 6.5 LED tops), every counter held by a 2.4 LED tie.
const TS = 9, TT = 6.5, G = 1.2;
const GLYPH = [
  (x, y) => { let d = sdArc(x, y, 0, 0, 12.5, 19.75, TS + 0.5, TT);                       // 0
    d = cut(d, x, y, -G, -30, G, -11); return cut(d, x, y, -G, 11, G, 30); },
  (x, y) => U(sdBox(x, y, -3.5, -23, 5.5, 16.5), sdBox(x, y, -10, 19, 13, 23),            // 1
    sdSlab(x, y, -5.2, -19.6, -13.5, -12, 6.2)),
  (x, y) => { let d = U(sdArc(x, y, 0, -9.5, 12, 10.25, TS, TT, 165, 395),                // 2
    sdSlab(x, y, 10.2, -4.5, -13.2, 17.5, 8.6), sdBox(x, y, -17, 17, 17, 23));
    d = cut(d, x, y, -G, -30, G, -15); return cut(d, x, y, -17, 17, -9, 14.6) },
  (x, y) => { let d = U(sdArc(x, y, 0, -10.4, 11, 9.4, TS, TT, 195, 455),                 // 3
    sdArc(x, y, 0, 9.4, 12.5, 10.4, TS, TT, 265, 525));
    d = cut(d, x, y, -G, -30, G, -15); return cut(d, x, y, -G, 15, G, 30); },
  (x, y) => U(sdBox(x, y, 4.5, -23, 13.5, 23), sdBox(x, y, -17, 5, 17, 11),               // 4
    sdSlab(x, y, -2.6, -24, -17.4, 6, 7.8)),
  (x, y) => { let d = U(sdBox(x, y, -2.5, -23, 15, -16.5), sdBox(x, y, -13, -23, -4.8, 2), // 5
    sdArc(x, y, 0, 8.5, 12.5, 11.25, TS, TT, 214, 510));
    return cut(d, x, y, -G, 15, G, 30); },
  (x, y) => { let d = U(sdArc(x, y, 0, 8.5, 12.5, 11.25, TS, TT),                         // 6
    sdArc(x, y, 4.5, 8.5, 17, 28.5, TS, TT, 180, 292));
    return cut(d, x, y, -G, 15, G, 30); },
  (x, y) => U(sdBox(x, y, -16, -23, 17, -16.5), sdSlab(x, y, 13.6, -13.2, -3.2, 23.5, 9.6)), // 7
  (x, y) => { let d = U(sdArc(x, y, 0, -10.9, 10.2, 8.85, TS - 0.5, TT), sdArc(x, y, 0, 8.9, 12.6, 10.85, TS, TT));
    d = cut(d, x, y, -G, -30, G, -15); return cut(d, x, y, -G, 15, G, 30); },          // 8
  null,                                                                                    // 9 = 6 turned
];
GLYPH[9] = (x, y) => GLYPH[6](-x, -y);
// Two carton icons for the walls that carry no hour: FRAGILE's wine glass
// (cracked) and THIS WAY UP's twin arrows over a bar.
const ICON = {
  glass(x, y) {
    let d = Math.max(sdEll(x, y, 0, -12.5, 11.5, 10.5), -18.5 - y);              // bowl, flat rim
    d = Math.min(d, sdBox(x, y, -1.6, -4, 1.6, 15.5), sdEll(x, y, 0, 18.5, 10.5, 3)); // stem, foot
    const c = Math.min(segD(x, y, -11, -15, -3, -11), segD(x, y, -3, -11, -6, -6), segD(x, y, -6, -6, 3, -9));
    return Math.max(d, 1 - c);                                                      // the crack
  },
  up(x, y) {
    let d = sdBox(x, y, -17, 19, 17, 23);
    for (const c of [-8.5, 8.5]) {
      d = Math.min(d, sdBox(x, y, c - 2.6, -9, c + 2.6, 15.5));
      d = Math.min(d, Math.max(y + 8, (Math.abs(x - c) - (y + 23) * 0.5333) / 1.133));
    }
    return d;
  },
};
/** Signed distance (LEDs) to digit n (or an icon name), in glyph coordinates (0,0 = centre, y down). */
export function digitSDF(n, x, y) {
  const d = typeof n === 'string' ? ICON[n](x, y) : GLYPH[n](x, y);
  return Math.max(d, sdBox(x, y, -17.5, -23, 17.5, 23));
}

// --------------------------------------------------------------- material
/** Kraft board albedo at sheet texel (gx, gy) (global, so flutes run on). */
function board(gx, gy, liner, o, k) {
  const c = liner ? LINER : KRAFT;
  const fib = 0.9 + 0.1 * kit.fbm(gx * 0.21, gy * 0.07, liner ? 3 : 0, 3);
  const flute = 1 + (liner ? 0.07 : 0.035) * Math.cos(gx * Math.PI / 2 + 0.6);
  const sp = kit.hash(gx | 0, gy | 0, 7) < 0.012 ? 0.86 : 1;            // a fleck
  const v = fib * flute * sp;
  o[k] = c[0] * v; o[k + 1] = c[1] * v; o[k + 2] = c[2] * v;
}
/** Overspray and patchy density of a spray stencil, for SDF d at texel. */
function inkAlpha(d, gx, gy) {
  let a = kit.clamp(0.5 - d * 0.85);
  if (a > 0) a *= 0.8 + 0.2 * kit.noise2(gx * 0.35, gy * 0.35);
  if (d > 0 && d < 3.5 && kit.hash(gx, gy, 31) < 0.3 * (1 - d / 3.5)) a = Math.max(a, 0.28);
  return a;
}
const tint = (o, k, ink, a) => {
  o[k] *= 1 + (ink[0] - 1) * a; o[k + 1] *= 1 + (ink[1] - 1) * a; o[k + 2] *= 1 + (ink[2] - 1) * a;
};

// Box marks, in face texels: 'this way up' arrows and the maker's round
// certificate stamp a real carton carries on its bottom.
function sdArrow(x, y, cx, cy, dx, dy) {
  // a 6-wide arrow 12 long pointing (dx, dy) from (cx, cy) (its middle)
  const al = (x - cx) * dx + (y - cy) * dy, ac = -(x - cx) * dy + (y - cy) * dx;
  const shaft = sdBox(al, ac, -6, -1, 1.5, 1);
  const head = Math.max(-al + 0.5, (al - 6 + Math.abs(ac) * 1.15) * 0.66, Math.abs(ac) - 3.4);
  return Math.min(shaft, head);
}
function sdStamp(x, y, cx, cy) {
  const r = Math.hypot(x - cx, y - cy);
  let d = Math.min(Math.abs(r - 8.6) - 0.55, Math.abs(r - 5.4) - 0.45);
  // 'lettering' between the rings: short dashes round the band
  const ang = Math.atan2(y - cy, x - cx), seg = kit.fract(ang / kit.TAU * 22);
  if (r > 6.3 && r < 7.7 && seg < 0.55 && kit.hash(Math.floor(ang / kit.TAU * 22 + 22), 4) > 0.2) d = Math.min(d, Math.abs(r - 7) - 0.45);
  if (Math.abs(x - cx) < 3 && Math.abs(y - cy) < 2.2) d = Math.min(d, Math.abs(y - cy) - 0.4 - (kit.hash(Math.floor(x), 3) < 0.3 ? 9 : 0));
  return d;
}

/**
 * A face texture. ox, oy: the face's top-left texel on the flat sheet (for
 * continuous grain). glyph: { n, ink, map(u, v) -> [X, Y] }, or { label: [h, h, m, m], map }, or null.
 * crease: which edges are fold lines ('t','b','l','r'); cut: which are cut edges.
 * marks: 'up:dx,dy' arrows toward (dx, dy), or 'stamp'.
 */
const BOARDS = new Map();
const LBL = { s: 0.56, dx: 11.2, dy: 14.6 };
export function faceTex({ ox, oy, liner = false, glyph = null, crease = '', cut = '', arrows = null, stamp = false }) {
  const key = `${ox},${oy},${liner},${crease},${cut}`;
  let base = BOARDS.get(key);
  if (!base) {
    base = new Float32Array(T * T * 3);
    for (let v = 0; v < T; v++) for (let u = 0; u < T; u++) {
      const k = 3 * (v * T + u), gx = ox + u, gy = oy + v;
      board(gx, gy, liner, base, k);
      let s = 1;
      // a score line is a dark groove with a lit shoulder beside it
      const ed = { t: v, b: T - 1 - v, l: u, r: T - 1 - u };
      for (const e of crease) s *= ed[e] === 0 ? 0.62 : ed[e] === 1 ? 1.08 : 1;
      // a cut edge shows the board's crushed flutes: darker, and ragged
      for (const e of cut) s *= ed[e] === 0 ? 0.55 + 0.15 * kit.hash(gx, gy, 2) : 1;
      base[k] *= s; base[k + 1] *= s; base[k + 2] *= s;
    }
    BOARDS.set(key, base);
  }
  const o = new Float32Array(base);
  for (let v = 0; v < T; v++) for (let u = 0; u < T; u++) {
    const k = 3 * (v * T + u), gx = ox + u, gy = oy + v;
    if (glyph) {
      const [X, Y] = glyph.map(u + 0.5, v + 0.5);
      if (glyph.label) {
        // a shipping label: HH over MM, small stencil, hours red, minutes black
        for (let q = 0; q < 4; q++) {
          const cx = q & 1 ? LBL.dx : -LBL.dx, cy = q & 2 ? LBL.dy : -LBL.dy;
          const lx = (X - cx) / LBL.s, ly = (Y - cy) / LBL.s;
          if (lx < -22 || lx > 22 || ly < -27 || ly > 27) continue;
          const a = inkAlpha(digitSDF(glyph.label[q], lx, ly) * LBL.s, gx, gy);
          if (a > 0) tint(o, k, q < 2 ? INK.red : INK.black, a);
        }
      } else {
        const a = inkAlpha(digitSDF(glyph.n, X, Y), gx, gy);
        if (a > 0) tint(o, k, glyph.ink, a);
      }
    }
    if (arrows) {
      const [ax, ay, dx, dy] = arrows, px = -dy * 4, py = dx * 4;
      const d = Math.min(sdArrow(u + 0.5, v + 0.5, ax + px, ay + py, dx, dy), sdArrow(u + 0.5, v + 0.5, ax - px, ay - py, dx, dy));
      const a = kit.clamp(0.5 - d) * 0.85;
      if (a > 0) tint(o, k, INK.black, a);
    }
    if (stamp) {
      const a = kit.clamp(0.5 - sdStamp(u + 0.5, v + 0.5, 13, 13)) * (0.6 + 0.3 * kit.noise2(u * 0.5, v * 0.5));
      if (a > 0) tint(o, k, INK.black, a);
    }
  }
  return o;
}

// -------------------------------------------------------------------- cat
// A black cat sitting, front view, in a 64x64 RGBA sprite: fur is near-black
// so the cat reads as a silhouette against the board, with a cool rim of
// lamp-light on the lit side and two lamp-yellow eyes.
const FUR = [0.010, 0.010, 0.013], RIM = kit.hex('#5d6a88'), EYE = kit.hex('#d8e85a'), NOSE = kit.hex('#a8565c');
function sdEll(x, y, cx, cy, rx, ry) {
  const qx = (x - cx) / rx, qy = (y - cy) / ry, r = Math.sqrt(qx * qx + qy * qy) || 1e-6;
  const gx = qx / rx, gy = qy / ry;
  return (r - 1) * r / Math.sqrt(gx * gx + gy * gy);
}
function smin(a, b, k) { const h = kit.clamp(0.5 + 0.5 * (b - a) / k); return b + (a - b) * h - k * h * (1 - h); }
function segD(x, y, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let t = ((x - ax) * dx + (y - ay) * dy) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
  const ex = x - ax - t * dx, ey = y - ay - t * dy;
  return Math.sqrt(ex * ex + ey * ey);
}

// Per-frame pose geometry, computed once, read by catSDF for every texel.
const TAIL = new Float64Array(8 * 2);
const CP = { by: 0, brx: 0, bry: 0, hx: 0, hy: 0, c: 1, s: 0 };
function triPrep(o, ax, ay, bx, by, cx, cy) {
  const P = [ax, ay, bx, by, cx, cy];
  for (let e = 0; e < 3; e++) {
    const px = P[2 * e], py = P[2 * e + 1], qx = P[(2 * e + 2) % 6], qy = P[(2 * e + 3) % 6];
    const dx = qx - px, dy = qy - py, L = Math.sqrt(dx * dx + dy * dy);
    o[3 * e] = px; o[3 * e + 1] = py; o[3 * e + 2] = 0;
    o[9 + 3 * e] = dy / L; o[9 + 3 * e + 1] = -dx / L; o[9 + 3 * e + 2] = 0;
  }
}
const EAR_L = new Float64Array(18), EAR_R = new Float64Array(18);
function sdTriP(x, y, o) {
  let m = -1e9;
  for (let e = 0; e < 3; e++) { const d = (x - o[3 * e]) * o[9 + 3 * e] + (y - o[3 * e + 1]) * o[10 + 3 * e]; if (d > m) m = d; }
  return m;
}
function prep(p) {
  CP.by = 47 - p.breathe * 0.4; CP.brx = 14.5 + p.breathe * 0.35; CP.bry = 13.5 + p.breathe * 0.5;
  const hx = CP.hx = 32 + p.hx, hy = CP.hy = 27.5 + p.hy;
  CP.c = Math.cos(p.tilt); CP.s = Math.sin(p.tilt);
  const el = p.earL, er = p.earR;
  triPrep(EAR_L, hx - 12.5, hy - 2, hx - 10.5 - el, hy - 16 + Math.abs(el) * 0.5, hx - 3.5, hy - 7.5);
  triPrep(EAR_R, hx + 3.5, hy - 7.5, hx + 10.5 - er, hy - 16 + Math.abs(er) * 0.5, hx + 12.5, hy - 2);
  let px = 44, py = 57; TAIL[0] = px; TAIL[1] = py;
  for (let k = 1; k <= 7; k++) {
    const s = k / 7, ang = -0.25 - s * (1.5 + 0.55 * p.tail) + 0.4 * Math.sin(p.tailPh - s * 2.2) * s;
    px += Math.cos(ang) * 3.4; py += Math.sin(ang) * 3.4; TAIL[2 * k] = px; TAIL[2 * k + 1] = py;
  }
}
/** Cat silhouette distance at sprite (x, y), for the pose last prepared. */
function catSDF(x, y) {
  let d = sdEll(x, y, 32, CP.by, CP.brx, CP.bry);                                    // body
  // the head and ears may tilt: evaluate them in the head's own turned frame
  const ox = x - CP.hx, oy = y - CP.hy - 2, hX = CP.hx + ox * CP.c + oy * CP.s, hY = CP.hy + 2 - ox * CP.s + oy * CP.c;
  d = smin(d, sdEll(hX, hY, CP.hx, CP.hy, 12.6, 10.6), 3);                            // head
  d = smin(d, sdEll(x, y, 27, 58.5, 4.6, 3), 1.2);                                    // paws
  d = smin(d, sdEll(x, y, 37, 58.5, 4.6, 3), 1.2);
  d = smin(d, sdTriP(hX, hY, EAR_L), 1.5);                                            // ears
  d = smin(d, sdTriP(hX, hY, EAR_R), 1.5);
  let td = 1e9;                                                                       // tail
  if (x > 36) for (let k = 0; k < 7; k++) {
    const q = segD(x, y, TAIL[2 * k], TAIL[2 * k + 1], TAIL[2 * k + 2], TAIL[2 * k + 3]) - (2.6 - 0.9 * (k + 1) / 7);
    if (q < td) td = q;
  }
  return smin(d, td, 1.5);
}

const DF = new Float32Array(64 * 64);
function dAt(x, y) {      // the distance field, bilinear, outside = far
  x -= 0.5; y -= 0.5;
  if (x < 0 || y < 0 || x >= 63 || y >= 63) return 9;
  const xi = x | 0, yi = y | 0, fx = x - xi, fy = y - yi, k = yi * 64 + xi;
  return (DF[k] * (1 - fx) + DF[k + 1] * fx) * (1 - fy) + (DF[k + 64] * (1 - fx) + DF[k + 65] * fx) * fy;
}

/**
 * Draw the cat into rgba (Float32Array 64*64*4, premultiplied) for pose p.
 * p.shadow 0..1: its soft shadow on the board, cast away from the lamp (lx, ly).
 */
export function drawCat(rgba, p) {
  rgba.fill(0);
  prep(p);
  const hx = CP.hx, hy = CP.hy;
  DF.fill(9);
  for (let y = 2; y < 64; y++) for (let x = 6; x < 62; x++) DF[y * 64 + x] = catSDF(x + 0.5, y + 0.5);
  const blinkOn = p.blink > 0.08;
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const x0 = x + 0.5, y0 = y + 0.5, k = 4 * (y * 64 + x);
    const d = DF[y * 64 + x];
    // face features live in the head's turned frame
    const ox = x0 - hx, oy = y0 - hy - 2, X = hx + ox * CP.c + oy * CP.s, Y = hy + 2 - ox * CP.s + oy * CP.c;
    let a = kit.clamp(0.5 - d);
    let r = 0, g = 0, b = 0;
    if (a > 0) {
      // rim light: inside, near the edge, on the lamp side
      const dl = dAt(x0 + p.lx * 1.6, y0 + p.ly * 1.6);
      const rim = d < 0 && dl > -0.2 ? kit.clamp((dl + 0.2) / 1.4) * kit.clamp(-d * 1.2 + 0.4) : 0;
      const rk = rim * 0.55 * p.rimK;
      r = FUR[0] + RIM[0] * rk; g = FUR[1] + RIM[1] * rk; b = FUR[2] + RIM[2] * rk;
      // eyes and nose
      if (blinkOn && Y > hy - 6 && Y < hy + 6) for (let s = -1; s <= 1; s += 2) {
        const ex = hx + s * 5.4 + p.lookX * 0.6, ey = hy - 0.5;
        const ea = kit.clamp(0.5 - sdEll(X, Y, ex, ey, 3.5, 3.7 * p.blink + 0.05));
        if (ea > 0) {
          const pa = kit.clamp(0.5 - sdEll(X, Y, ex + p.lookX * 1.5, ey + p.lookY * 0.8, 0.85 + 0.9 * p.pupil, 3.2 * p.blink));
          const glow = 1 - pa * 0.95;
          r += (EYE[0] * p.eyeK * glow - r) * ea; g += (EYE[1] * p.eyeK * glow - g) * ea; b += (EYE[2] * p.eyeK * glow - b) * ea;
        }
      }
      if (Math.abs(Y - hy - 4.4) < 2 && Math.abs(X - hx) < 2.5) {
        const na = kit.clamp(0.5 - sdEll(X, Y, hx, hy + 4.4, 1.3, 0.9));
        if (na > 0) { r += (NOSE[0] * 0.5 - r) * na; g += (NOSE[1] * 0.5 - g) * na; b += (NOSE[2] * 0.5 - b) * na; }
      }
    }
    // whiskers reach past the head: pale, thin, drawn over cat and board
    let wa = 0;
    if (Math.abs(Y - hy - 4.5) < 4.5 && Math.abs(X - hx) > 4 && Math.abs(X - hx) < 16) {
      const s = X > hx ? 1 : -1;
      for (let j = -1; j <= 1; j++) {
        const ax = hx + s * 4.5, ay = hy + 4.6, bx = hx + s * 15, by = hy + 3 + j * 2.6 + p.whisk * s * 0.4;
        const w = kit.clamp(0.9 - segD(X, Y, ax, ay, bx, by)) * 0.33;
        if (w > wa) wa = w;
      }
    }
    if (wa > 0) { r += (0.42 - r) * wa; g += (0.42 - g) * wa; b += (0.40 - b) * wa; a = Math.max(a, wa); }
    // shadow on the board, cast away from the lamp
    let sa = 0;
    if (p.shadow > 0 && a < 1) sa = kit.clamp(0.5 - dAt(x0 + p.lx * 3.2, y0 + p.ly * 3.2) / 2.2) * 0.42 * p.shadow;
    const A = a + sa * (1 - a);
    rgba[k] = r * a; rgba[k + 1] = g * a; rgba[k + 2] = b * a; rgba[k + 3] = A;
  }
  return rgba;
}
