// Ouroboros — the time is a nest of serpents.
//
// Every numeral is one snake, drawn as a body lying along the numeral's
// stroke: a pointed tail, a zigzag back, a spade head with eyes as the
// terminal, so the letterforms are serpents, not a font with a skin painted
// on (0 and 8, the closed figures, are snakes biting their own tails). The
// tail of the 1, 2, 4 and 7 curls. All ten are drawn as tail -> head centre
// lines in an 18 x 40 box (SKELETONS) and rendered as swept bodies with a
// priority raster, so a body that crosses itself lies over and under.
//
// Layout: the left half is the ouroboros itself, a ring serpent biting its
// tail round twelve pips: its head is the seconds hand, one lap a minute,
// and as it comes round to twelve it lets go of its tail and flicks its
// tongue. Inside it the hours are two young snakes, plain and small. The
// right half is the hero: the minutes, two big adders.
//
// Always alive: open snakes ripple with a lateral wave running tail to head,
// their scutes bunch and stretch, heads sway, tongues flick; the closed ones
// slide round their own figure for ever, head chasing tail.
//
// Minute: the changed numeral's serpent lifts its head off the old stroke,
// swings across on a bridge curve to the tail end of the new numeral and
// crawls the whole of it, its tail unwinding the old shape behind it, in
// 2.6 s (follow-the-leader on one composite track: old, bridge, new).
//
// Hour: everything moults. Each serpent leaves its skin, a hollow hatched
// ghost of the pose it held, and slithers out (the hours in 3 s, the ring
// one fast lap); the skins break into 3 px flakes that drop and turn to dust
// within 5 s; the new skins are glossy and their markings grow back.
//
// Everything is a closed-form function of the clock: a slot's state comes
// from when its digit last changed (lastChange), so no history is kept.
// Burn-in: the face walks a 2 px orbit, glided over 1.5 s. 23:00-07:00 the
// panel dims (ctx.night).

import { orbit } from '../js/kit.js';

const PI = Math.PI, TAU = 2 * PI;
let W = 128, H = 64;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (a, b, v) => { const u = clamp((v - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); };
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

// ------------------------------------------------------------ geometry
// Centripetal Catmull-Rom through [x, y, z] points; a dense polyline. z (the
// height of a strand at a crossing) is interpolated linearly.
function spline(pts, closed, sub = 14) {
  const n = pts.length, out = [];
  const ext = (a, b) => [2 * a[0] - b[0], 2 * a[1] - b[1], a[2] ?? 0];
  const P = (i) => (closed ? pts[((i % n) + n) % n] : i < 0 ? ext(pts[0], pts[1]) : i >= n ? ext(pts[n - 1], pts[n - 2]) : pts[i]);
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const d = (a, b) => Math.max(1e-4, Math.hypot(b[0] - a[0], b[1] - a[1]) ** 0.5);
    const t0 = 0, t1 = t0 + d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3);
    for (let k = 0; k < sub; k++) {
      const t = t1 + ((t2 - t1) * k) / sub, pt = [0, 0, 0];
      for (let c = 0; c < 2; c++) {
        const v0 = p0[c], v1 = p1[c], v2 = p2[c], v3 = p3[c];
        const a1 = ((t1 - t) * v0 + (t - t0) * v1) / (t1 - t0);
        const a2 = ((t2 - t) * v1 + (t - t1) * v2) / (t2 - t1);
        const a3 = ((t3 - t) * v2 + (t - t2) * v3) / (t3 - t2);
        const b1 = ((t2 - t) * a1 + (t - t0) * a2) / (t2 - t0);
        const b2 = ((t3 - t) * a2 + (t - t1) * a3) / (t3 - t1);
        pt[c] = ((t2 - t) * b1 + (t - t1) * b2) / (t2 - t1);
      }
      pt[2] = (p1[2] ?? 0) + ((p2[2] ?? 0) - (p1[2] ?? 0)) * (k / sub);
      out.push(pt);
    }
  }
  if (!closed) out.push([pts[n - 1][0], pts[n - 1][1], pts[n - 1][2] ?? 0]);
  return out;
}

/** A track: a polyline resampled at uniform arclength, with tangents. */
function track(poly, step, closed) {
  const pts = closed ? [...poly, poly[0]] : poly;
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const L = cum[cum.length - 1];
  const n = closed ? Math.max(4, Math.round(L / step)) : Math.max(2, Math.round(L / step) + 1);
  const st = closed ? L / n : L / (n - 1);
  const X = new Float32Array(n), Y = new Float32Array(n), Z = new Float32Array(n);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const s = i * st;
    while (j < cum.length - 2 && cum[j + 1] < s) j++;
    const u = (s - cum[j]) / (cum[j + 1] - cum[j] || 1);
    X[i] = pts[j][0] + (pts[j + 1][0] - pts[j][0]) * u;
    Y[i] = pts[j][1] + (pts[j + 1][1] - pts[j][1]) * u;
    Z[i] = pts[j][2] + (pts[j + 1][2] - pts[j][2]) * u;
  }
  const TX = new Float32Array(n), TY = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = closed ? (i - 2 + n) % n : Math.max(0, i - 2), b = closed ? (i + 2) % n : Math.min(n - 1, i + 2);
    const dx = X[b] - X[a], dy = Y[b] - Y[a], l = Math.hypot(dx, dy) || 1;
    TX[i] = dx / l; TY[i] = dy / l;
  }
  return { X, Y, Z, TX, TY, n, L, step: st, closed };
}

/** Sample a track at arclength q (wrapping if closed) into out[x, y, z, tx, ty]. */
function at(c, q, out) {
  if (c.sample) return c.sample(q, out);
  let f = q / c.step;
  if (c.closed) f = ((f % c.n) + c.n) % c.n; else f = clamp(f, 0, c.n - 1.0001);
  const i = Math.floor(f), j = c.closed ? (i + 1) % c.n : i + 1, u = f - i;
  out[0] = c.X[i] + (c.X[j] - c.X[i]) * u;
  out[1] = c.Y[i] + (c.Y[j] - c.Y[i]) * u;
  out[2] = c.Z[i] + (c.Z[j] - c.Z[i]) * u;
  out[3] = c.TX[i] + (c.TX[j] - c.TX[i]) * u;
  out[4] = c.TY[i] + (c.TY[j] - c.TY[i]) * u;
  return out;
}

// ------------------------------------------------------------ glyphs
// Each numeral is one serpent: a single stroke from a pointed tail to the
// head, drawn as a centre line in an 18 x 40 box. Points run tail -> head.
// z lifts the strand that lies on top where the body crosses itself. 0 and
// 8 are closed: an ouroboros biting its own tail.
export const SKELETONS = {
  0: { closed: true, pts: superellipse(9, 20, 8.6, 19.6, 2.25, 18) },
  1: { pts: [[15.3, 35.6], [15.9, 38.7], [14.2, 40.2], [12.6, 38], [12.5, 30], [12.5, 18], [12.3, 7], [11, 1.5], [7.5, 3.5], [3, 9]] },
  2: { pts: [[16.6, 35.2], [18.6, 35.8], [18.6, 39.2], [15, 39.6], [11, 39.5], [4, 39.5], [1.5, 37], [3.5, 31], [10, 23.5], [15.5, 16], [17, 8.5], [14, 2], [8.5, 0], [3.5, 2.5], [1.3, 8.5]] },
  3: { pts: [[0.8, 33], [3.5, 38.5], [10, 40], [16, 37], [17.8, 29], [14.5, 22.5], [7.5, 19.5], [13.5, 16.5], [16.5, 10], [15, 3], [9.5, 0], [4, 1.5], [1.2, 6.5]] },
  4: { pts: [[15.3, 35.6], [15.9, 38.7], [14.2, 40.2], [12.6, 38], [12.5, 34], [12.5, 26, 1], [12.5, 14], [12.7, 3], [11.5, 0.8], [8, 8], [3.5, 18], [1.3, 25.5], [5, 27.8, 2], [12.5, 27.8, 2], [19, 27.8, 2]] },
  5: { pts: [[0.6, 33.5], [3.5, 38.5], [10, 40], [16, 37], [17.8, 29], [15.5, 19.5], [9, 16], [3, 18], [2.6, 9], [3, 1.3], [10, 1.3], [17.5, 1.3]] },
  6: { pts: [[4, 24.5], [9, 20.5], [15, 22], [17.6, 29], [15.5, 37], [9.5, 40], [3.8, 36.5], [1.3, 27], [1.8, 14], [5, 4], [10.5, 0.5], [16.2, 3]] },
  7: { pts: [[4.2, 35.4], [3.6, 38.6], [5.4, 40.2], [7.1, 38], [7.8, 31], [10.2, 21], [13.8, 11], [17, 2.5], [14, 1.2], [7, 1.2], [0.6, 1.2]] },
  8: { closed: true, pts: [[9, 0], [15, 3, 1], [15.4, 10, 1], [12.4, 16, 1], [9, 19.6, 1], [5.2, 24, 1], [1.4, 30], [2.3, 37], [9, 40], [15.7, 37], [16.6, 30], [12.8, 24], [9, 19.6], [5.6, 15.6], [2.8, 10], [3, 3]] },
};
SKELETONS[9] = { pts: SKELETONS[6].pts.map(([x, y, z]) => [18 - x, 40 - y, z ?? 0]) };

function superellipse(cx, cy, rx, ry, n, k) {
  const pts = [];
  for (let i = 0; i < k; i++) {
    const a = -PI / 2 + (i / k) * TAU, c = Math.cos(a), s = Math.sin(a);
    pts.push([cx + rx * Math.sign(c) * Math.abs(c) ** (2 / n), cy + ry * Math.sign(s) * Math.abs(s) ** (2 / n), 0]);
  }
  return pts;
}

/** Sizes: skeleton box scale and body radius. */
export const SIZES = {
  min: { sx: 1.1, sy: 1.3, r: 3.6 },
  hour: { sx: 0.7, sy: 0.6, r: 2.5 },
};

const glyphCache = new Map();
/** The track a numeral's serpent lies on, tail -> head (or a closed ring). */
export function glyph(digit, size) {
  const key = `${digit}${size}`;
  let c = glyphCache.get(key);
  if (!c) {
    const S = SIZES[size], sk = SKELETONS[digit];
    c = track(spline(sk.pts.map(([x, y, z]) => [x * S.sx, y * S.sy, z ?? 0]), !!sk.closed), 0.5, !!sk.closed);
    glyphCache.set(key, c);
  }
  return c;
}

// ------------------------------------------------------------ raster
// Every body sample writes the pixels across it with a priority key: height
// first, then nearness to its centre line, so crossings lie over and under
// and each pixel takes the look of the strand it belongs to.
let KEY = new Float32Array(W * H), VAL = new Uint8Array(W * H);
/** Previews only: a bigger canvas. */
export function rasterSize(w, h) { W = w; H = h; KEY = new Float32Array(W * H); VAL = new Uint8Array(W * H); }
export function beginRaster() { KEY.fill(-1e9); }
// A second raster to draw a shed skin into before it is broken up.
const K2 = new Float32Array(128 * 64), V2 = new Uint8Array(128 * 64);
function intoScratch(fn) {
  const k = KEY, v = VAL; KEY = K2; VAL = V2; K2.fill(-1e9);
  try { fn(); } finally { KEY = k; VAL = v; }
}
export function endRaster(g) { for (let i = 0; i < W * H; i++) if (KEY[i] > -1e8) g.buf[i] = VAL[i]; }
function pset(x, y, z, v = 1) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y | 0) * W + (x | 0);
  if (z * 100 > KEY[i]) { KEY[i] = z * 100; VAL[i] = v; }
}

const P = new Float32Array(5), Q = new Float32Array(5);
/**
 * Draw one serpent lying on track `c` between track positions `tail` and
 * `head`, offset by (ox, oy), body radius r.
 * opt: pattern (zigzag back), crawl (scutes bunch in waves), t (s),
 *      wave (px of lateral undulation), sway (head offset, px), outward
 *      (push a biting head to the outside of its curve, px), tongue (0..1),
 *      bite (head closed on a tail: no tongue), taper (px of tail),
 *      spots (0..1 size of the markings), skin (a hollow shed skin), z (lift)
 */
export function drawSerpent(c, tail, head, ox, oy, r, opt = {}) {
  const len = head - tail, step = opt.skin ? 0.5 : 0.35, zb = opt.z ?? 0, t = opt.t ?? 0;
  const crawl = opt.crawl ?? 0;
  let sway = opt.sway ?? 0;
  if (opt.outward) {
    // a head biting its tail rides the outside of the curve, so a ring stays a ring
    at(c, head, P); at(c, head - 7, Q);
    const cr = Q[3] * P[4] - Q[4] * P[3];
    sway -= Math.sign(cr) * opt.outward * smooth(0.02, 0.12, Math.abs(cr));
  }
  const HL = r * 3.6, TT = Math.min(len * 0.32, opt.taper ?? 12);
  const neck = HL * 1.6, bodyEnd = len - HL * 0.45;
  for (let b = 0; b <= bodyEnd; b += step) {
    at(c, tail + b, P);
    const fh = len - b;
    // rectilinear crawl: the scutes bunch and stretch in waves to the head
    const wv = crawl ? Math.sin(TAU * (b / 15 - t / 1.7)) : 0;
    let rr = r;
    if (b < TT) rr *= 0.42 + 0.58 * smooth(0, TT, b) ** 0.8;
    if (fh < neck) rr *= 1 - 0.14 * smooth(neck, HL * 0.7, fh);
    const nx = -P[4], ny = P[3];
    // serpentine undulation: a lateral wave running from the tail to the head
    const und = (opt.wave ?? 0) * Math.sin(TAU * (b / 13 - t / 1.9)) * smooth(0, 10, b) * smooth(HL * 0.6, HL * 2, fh);
    const so = sway * smooth(neck * 1.6, HL * 0.5, fh) + und;
    const cx = P[0] + ox + nx * so, cy = P[1] + oy + ny * so, z = P[2] + zb;
    const bp = b - 1.6 * wv * crawl;
    for (let n = -rr; n <= rr + 1e-6; n += 0.5) {
      const x = cx + n * nx, y = cy + n * ny;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const i = (y | 0) * W + (x | 0), an = Math.abs(n);
      const key = z * 100 - an;
      if (key <= KEY[i]) continue;
      KEY[i] = key;
      let v = an <= rr - 0.95 ? 1 : 0;
      if (opt.skin) v = v && (an > rr - 2 || ((x | 0) + (y | 0)) % 3 === 0) ? 1 : 0;
      else if (v && opt.pattern && b > 4 && fh > HL * 1.25) {
        // the adder's zigzag down the back; it shrinks away on a fresh skin
        const pz = bp / 5.5, zz = (Math.abs(pz - Math.floor(pz) - 0.5) * 4 - 1) * rr * 0.42;
        if (Math.abs(n - zz) < 0.5 * (opt.spots ?? 1) && an < rr - 1.4) v = 0;
      }
      VAL[i] = v;
    }
  }
  // the head, aimed along the chord of its last stretch
  at(c, head, P); at(c, head - HL, Q);
  let ax = P[0] - Q[0], ay = P[1] - Q[1];
  const al = Math.hypot(ax, ay) || 1; ax /= al; ay /= al;
  const hx = P[0] + ox - ay * sway, hy = P[1] + oy + ax * sway, hz = P[2] + zb + 0.6;
  drawHead(hx, hy, ax, ay, r, hz, opt.skin);
  const tg = opt.bite ? 0 : opt.tongue ?? 0;
  if (tg > 0.05) {
    const L = 0.6 + tg * 3.2, nx = -ay, ny = ax;
    for (let k = 0.6; k <= L; k += 0.4) pset(hx + ax * k, hy + ay * k, hz + 2);
    for (const sd of [-1, 1]) pset(hx + ax * (L + 0.9) + nx * sd * 0.9, hy + ay * (L + 0.9) + ny * sd * 0.9, hz + 2);
  }
}

// A snake's head from above, snout at (sx, sy) pointing along (ax, ay): a
// blunt spade broad at the jaw, pinched at the neck, a dark rim where it
// lies over its own coils, and an eye on each side.
export function headWidth(r, u) { // u: px back from the snout
  const HL = r * 3.6, HW = r * 1.35 + 0.4, wn = r * 0.8, uj = HL * 0.58;
  if (u < 0 || u > HL) return -1;
  if (u < uj) return HW * Math.max(0, 1 - ((uj - u) / uj) ** 1.7) ** 0.5;
  return HW - (HW - wn) * smooth(uj, HL, u) ** 0.75;
}
const SS = [0.125, 0.375, 0.625, 0.875];
function drawHead(sx, sy, ax, ay, r, z, skin) {
  const HL = r * 3.6, HW = r * 1.35 + 0.4;
  const eu = HL * 0.38, er = Math.max(0.75, r * 0.25), ev = headWidth(r, eu) - 2.0;
  // classify a point: 0 outside, 1 dark (rim, eye, skin hollow), 2 lit
  const cls = (px, py) => {
    const dx = px - sx, dy = py - sy;
    const u = -(dx * ax + dy * ay), v = Math.abs(-dx * ay + dy * ax);
    const w = headWidth(r, u);
    if (w < 0 || v > w) return 0;
    if (v > w - 0.6 || u > HL - 0.7) return 1;
    if ((u - eu) ** 2 + (v - ev) ** 2 < er * er) return 1;
    if (skin && v < w - 2 && u > 1.6 && u < HL - 2) return 1;
    return 2;
  };
  // only the box round the head's own extent
  const mx = sx - ax * HL * 0.5, my = sy - ay * HL * 0.5, R = HL * 0.5 + 1.5;
  const x0 = Math.max(0, Math.floor(mx - R)), x1 = Math.min(W - 1, Math.ceil(mx + R));
  const y0 = Math.max(0, Math.floor(my - R)), y1 = Math.min(H - 1, Math.ceil(my + R));
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - sx, dy = y + 0.5 - sy;
      const u = -(dx * ax + dy * ay), v = Math.abs(-dx * ay + dy * ax);
      if (u < -1 || u > HL + 1 || v > HW + 1) continue;
      // 4 x 4 samples where the pixel straddles an edge; one where it does not
      let inside = 0, lit = 0;
      const w = headWidth(r, clamp(u, 0, HL));
      const far = Math.abs(v - w) > 1.2 && Math.abs(v - w + 0.6) > 1.2 && u > 1.2 && u < HL - 1.9 &&
        Math.abs(Math.hypot(u - eu, v - ev) - er) > 1.2 && !(skin && Math.abs(v - w + 2) < 1.2);
      if (far) { const c = cls(x + 0.5, y + 0.5); inside = c ? 16 : 0; lit = c === 2 ? 16 : 0; }
      else for (const fy of SS) for (const fx of SS) { const c = cls(x + fx, y + fy); if (c) inside++; if (c === 2) lit++; }
      if (inside < 6) continue;
      const i = y * W + x, key = z * 100 + 5 - (16 - inside) / 16;
      if (key <= KEY[i]) continue;
      KEY[i] = key;
      VAL[i] = lit >= 7 ? 1 : 0;
    }
}

// ------------------------------------------------------------ layout
const RING = { cx: 31.5, cy: 32, R: 27.4, r: 3.3 };
let ringTrack;
function ring() {
  if (!ringTrack) {
    const pts = [];
    for (let i = 0; i < 64; i++) { const a = (i / 64) * TAU; pts.push([RING.cx + RING.R * Math.sin(a), RING.cy - RING.R * Math.cos(a), 0]); }
    ringTrack = track(spline(pts, true), 0.5, true);
  }
  return ringTrack;
}
export const SLOTS = [
  { size: 'hour', x: 15.6, y: 20 }, { size: 'hour', x: 34.6, y: 20 },
  { size: 'min', x: 69, y: 6 }, { size: 'min', x: 100, y: 6 },
];
const GAP = -1.5; // the tail tip tucked under the snout // ouroboros: px between snout and tail tip

const TD = { min: 2.6, hour: 3.0 };
const SHED = 5.5; // s: the hour's moult, from the stroke of the hour   // s: a numeral's slither from old to new
const SPEED = { min: 3.2, hour: 2.2 }; // px/s: a ring numeral sliding round itself

/** The value of digit slot k (0..3: h tens, h units, m tens, m units) at ms. */
function digitAt(ms, k) {
  const d = new Date(ms), v = k < 2 ? d.getHours() : d.getMinutes();
  return k % 2 === 0 ? Math.floor(v / 10) : v % 10;
}
/** When slot k last changed, at or before ms. */
function lastChange(ms, k) {
  const d = new Date(ms); d.setSeconds(0, 0);
  if (k === 2) d.setMinutes(Math.floor(d.getMinutes() / 10) * 10);
  if (k <= 1) d.setMinutes(0);
  if (k === 0) { const h = d.getHours(); d.setHours(h < 10 ? 0 : h < 20 ? 10 : 20); }
  return d.getTime();
}

let OX = 0, OY = 0; // burn-in orbit of the whole face, this frame
export function idle(digit, sl0, k, t, since, o = {}) {
  const sl = { ...sl0, x: sl0.x + OX, y: sl0.y + OY };
  const c = glyph(digit, sl.size), S = SIZES[sl.size], big = sl.size === 'min';
  const lf = { ...life(c, big, t, k, o.skin), ...o };
  if (c.closed) {
    const tl = ((t - since) * SPEED[sl.size]) % c.L;
    drawSerpent(c, tl, tl + c.L - GAP, sl.x, sl.y, S.r, lf);
  } else drawSerpent(c, 0, c.L, sl.x, sl.y, S.r, lf);
}

/**
 * How a resting serpent lives: a ring slides round itself biting its tail,
 * head riding the outside; an open one stays put and ripples, its head
 * swaying and its tongue flicking.
 */
function life(c, big, t, k, still) {
  const o = { pattern: big, crawl: 1, t: t + k * 0.4, wave: 0, sway: 0, outward: 0, tongue: 0, bite: false, taper: big ? 11 : 7 };
  if (c.closed) Object.assign(o, { wave: big ? 0.5 : 0.3, outward: big ? 1.2 : 1.0, bite: true, taper: 6 });
  else Object.assign(o, { wave: big ? 1.0 : 0.55, sway: Math.sin(TAU * (t / 4.3 + k * 0.31)) * (big ? 0.9 : 0.6), tongue: tongueAt(t + k * 1.3) });
  if (still) Object.assign(o, { wave: 0, sway: 0, tongue: 0 });
  return o;
}

/**
 * A shed skin: the hollow of the pose drawn by `pose`, lying where it was
 * left, then breaking up from 0.8 s: each flake lets go at its own moment,
 * drops and turns to dust.
 */
/** A newly shed serpent is glossy: its markings fade and come back. */
function freshSpots(tau) { return tau >= SHED ? 1 : 1 - 0.9 * smooth(0.2, 1.4, tau) * (1 - smooth(2.6, SHED, tau)); }

function shedSkin(pose, tau, seed) {
  intoScratch(pose);
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 128; x++) {
      const i = y * 128 + x;
      if (K2[i] < -1e8 || !V2[i]) continue;
      // flakes are 3 x 3 px pieces of skin that let go together
      const fx = Math.floor(x / 3), fy = Math.floor(y / 3);
      const h = hash(fx * 131.7 + fy * 17.3 + seed), h2 = hash(fx * 7.1 + fy * 113.9 + seed * 3);
      const tr = 0.8 + 1.5 * h + 0.012 * (63 - y), dt = tau - tr;
      if (dt > 0.5 + 1.1 * h2) continue;            // gone to dust
      let px = x, py = y;
      if (dt > 0) { py += 34 * dt * dt + 4 * dt; px += Math.sin(h2 * 40 + dt * 6) * 1.6 * dt; }
      pset(px, py, -5);
    }
}
function tongueAt(t) {
  const p = (((t % 3.1) + 3.1) % 3.1) / 3.1;
  return p < 0.12 ? Math.sin((p / 0.12) * PI * 2) ** 2 : 0;
}

const A0 = new Float32Array(5), B0 = new Float32Array(5);
/**
 * The track of a slither: the old numeral (from where its tail lies), a
 * bridge the head swings across, and the new numeral from its tail end.
 */
function slither(A, tlA, LAo, B, LBo) {
  at(A, tlA + LAo, A0); at(B, 0, B0);
  const p0x = A0[0], p0y = A0[1], p1x = B0[0], p1y = B0[1];
  const dist = Math.hypot(p1x - p0x, p1y - p0y), m = clamp(dist * 1.4, 14, 44);
  const t0x = A0[3] * m, t0y = A0[4] * m, t1x = B0[3] * m, t1y = B0[4] * m;
  const NB = 40, bx = new Float32Array(NB + 1), by = new Float32Array(NB + 1), bl = new Float32Array(NB + 1);
  for (let i = 0; i <= NB; i++) {
    const u = i / NB, u2 = u * u, u3 = u2 * u;
    const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
    bx[i] = h00 * p0x + h10 * t0x + h01 * p1x + h11 * t1x;
    by[i] = h00 * p0y + h10 * t0y + h01 * p1y + h11 * t1y;
    bl[i] = i ? bl[i - 1] + Math.hypot(bx[i] - bx[i - 1], by[i] - by[i - 1]) : 0;
  }
  const Lbr = bl[NB];
  return {
    LAo, Lbr, LBo, L: LAo + Lbr + LBo,
    sample(q, out) {
      if (q < LAo) return at(A, tlA + q, out);
      if (q >= LAo + Lbr) { at(B, q - LAo - Lbr, out); out[2] += 4; return out; }
      const s = q - LAo;
      let i = 0; while (i < NB - 1 && bl[i + 1] < s) i++;
      const u = (s - bl[i]) / (bl[i + 1] - bl[i] || 1);
      out[0] = bx[i] + (bx[i + 1] - bx[i]) * u; out[1] = by[i] + (by[i + 1] - by[i]) * u; out[2] = 3;
      const dx = bx[i + 1] - bx[i], dy = by[i + 1] - by[i], l = Math.hypot(dx, dy) || 1;
      out[3] = dx / l; out[4] = dy / l;
      return out;
    },
  };
}

/** Draw slot k as it is at ms: resting, or slithering into a new numeral. */
function drawSlot(k, ms, hourTau) {
  const sl = SLOTS[k], size = sl.size, S = SIZES[size], big = size === 'min', td = TD[size];
  const T0 = lastChange(ms, k), tau = (ms - T0) / 1000, t = ms / 1000, nd = digitAt(ms, k);
  const shed = hourTau < SHED;
  if (shed) {
    // the skin of the pose this serpent held as the hour struck
    const H0 = ms - hourTau * 1000, od = digitAt(H0 - 1, k), P0 = lastChange(H0 - 1, k);
    shedSkin(() => idle(od, sl, k, H0 / 1000, P0 / 1000 + td, { skin: true, z: -5 }), hourTau, k * 17 + 3);
  }
  const spots = freshSpots(hourTau);
  if (tau >= td) return idle(nd, sl, k, t, T0 / 1000 + td, { spots });
  const od = digitAt(T0 - 1, k), A = glyph(od, size), B = glyph(nd, size);
  let tlA = 0, LAo = A.L;
  if (A.closed) { tlA = ((T0 / 1000 - (lastChange(T0 - 1, k) / 1000 + td)) * SPEED[size]) % A.L; LAo = A.L - GAP; }
  const tr = slither(A, tlA, LAo, B, B.closed ? B.L - GAP : B.L);
  const x = tau / td, u = x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
  const tail = u * (tr.LAo + tr.Lbr), head = tr.LAo + u * (tr.Lbr + tr.LBo);
  // the slither blends the old pose's life into the new one's, writhing hard between
  const la = life(A, big, t, k), lb = life(B, big, t, k), m = (a, b) => a + (b - a) * x, hump = Math.sin(PI * x);
  drawSerpent(tr, tail, head, sl.x + OX, sl.y + OY, S.r, {
    pattern: big, crawl: 1, t: t + k * 0.4, spots, taper: m(la.taper, lb.taper),
    wave: m(la.wave, lb.wave) + (big ? 1.4 : 0.8) * hump, sway: m(la.sway, lb.sway), outward: m(la.outward, lb.outward),
    tongue: Math.max(m(la.tongue, lb.tongue), hump * Math.sin(tau * 19) ** 2), bite: B.closed && x > 0.985,
  });
}

export default {
  name: 'Ouroboros',
  blurb: 'Every numeral is a living serpent: an ouroboros dial whose head sweeps the seconds round the hour, two adders coiled into the minutes; each minute the changed one slithers into the next, and on the hour they all shed their skins.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  driver: 'full',
  frame(g, ctx) {
    const f = ctx.fields, ms = ctx.date.getTime();
    ctx.oled.contrast(Math.round(0xcf + (0x24 - 0xcf) * ctx.night));
    // burn-in: the face walks a 2 px square, a step every 3 minutes at :30,
    // glided over 1.5 s
    const stepT = ms - (((ms - 30000) % 60000) + 60000) % 60000;
    const [x1, y1] = orbit(new Date(ms)), [x0, y0] = orbit(new Date(stepT - 1));
    const gu = smooth(0, 1500, ms - stepT);
    OX = x0 + (x1 - x0) * gu; OY = y0 + (y1 - y0) * gu;
    beginRaster();
    const hourTau = (ms - lastChange(ms, 1)) / 1000;
    const rg = ring();
    let hd = (f.sec / 60) * rg.L, spots = 1;
    if (hourTau < SHED) {
      // the ouroboros slips out of its skin: one extra lap, eased
      shedSkin(() => drawSerpent(rg, GAP - rg.L, 0, OX, OY, RING.r, { skin: true, z: -5, bite: true, taper: 6 }), hourTau, 99);
      const x = clamp(hourTau / 3.2, 0, 1);
      hd += rg.L * (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2);
      spots = freshSpots(hourTau);
    }
    // twelve pips inside the ring: the ouroboros is a dial, its head the seconds
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU, px = RING.cx + OX + 21.6 * Math.sin(a), py = RING.cy + OY - 21.6 * Math.cos(a);
      pset(px, py, -20);
      if (i % 3 === 0) { pset(px + 1, py, -20); pset(px, py + 1, -20); pset(px + 1, py + 1, -20); }
    }
    // as the head comes round to twelve it lets go of its tail and tastes the air
    const near = f.sec > 58.6 ? (f.sec - 58.6) / 1.4 : f.sec < 0.9 ? 1 - f.sec / 0.9 : 0;
    const open = hourTau < SHED ? 0 : Math.sin(PI * Math.min(1, near)) ;
    drawSerpent(rg, hd - rg.L + GAP + open * 3, hd, OX, OY, RING.r, { pattern: true, bite: open < 0.2, tongue: Math.sin(f.sec * 23) ** 2, taper: 6, spots, outward: 1.2 });
    for (let k = 0; k < 4; k++) drawSlot(k, ms, hourTau);
    endRaster(g);
  },
};
