// Ferrofluid — the time written in black magnetic liquid on a backlit plate.
//
// After the Ferrolic display and Sachiko Kodama's sculptures: a glass cell
// lit from behind (a dithered plate, brightest in the middle), with an
// electromagnet wound under each digit. The liquid is a metaball field of
// charges along each digit's single stroke (the coil), the weight swelling
// on downstrokes and at the free ends like a broad nib. Under the field it
// bristles with Rosensweig spikes: thorns along both edges, leaning outward
// with the field and longest at the stroke ends, and a row of upright spikes
// along the spine, each seen from above as a glint on its lamp-side flank.
// The spikes breathe all the time (a slow wave along the stroke and a
// shiver), the colon's two drops flick their thorns out once a second, and
// liquid that is not under field is a smooth black mirror with a specular
// sheen. A lit meniscus edges everything dark.
//
// The minute: at :57.1 the electromagnet under each changing digit strains
// (the spikes grow and quiver), lets go at :57.9 and the spikes collapse;
// the smooth liquid relaxes bold, then draws up into one round puddle,
// which wobbles. At :00 the new coil is switched on: a current pulse runs
// out along it from the point nearest the puddle, leaving its track on the
// plate, and the puddle runs after it, farthest liquid first, a tendril with
// a fat head racing along the coil while the puddle drains. Where the
// liquid arrives the spikes erupt with an overshoot, and at :03 the coil
// reaches full current and every spike surges once more and settles.
//
// The hour: everything lets go at :56; each digit draws up into its own
// puddle (so it never passes for another digit), the four puddles and the
// colon slide together and merge into one pool. At :00 a spiral magnet
// spins up under it and the pool climbs it, drawn out into a five-armed
// whirlpool that turns, spikes climbing the arms from the tips to the apex;
// it winds back in, lets go at :04.2, and the pool runs out along all five
// new coils at once and erupts into the new time.
//
// Never a wrong time: before :00 only the old digits (whole, bold, or a
// puddle); after it only puddles and the new digits arriving.
//
// Everything is a function of the clock: every charge's place is closed
// form in the seconds from the turn; models and puddle maps are cached.
//
// Burn-in: the face walks kit.orbit, the plate's dither walks all 64 phases
// of its pattern (a step every 3 min), the spikes move all the time, and
// the panel runs at low contrast at night (ctx.night).

import { dither, clamp, ease, clockFields, previousMinute, orbit } from '../js/kit.js';

const W = 128, H = 64;
const DW = 24, DH = 40, TOP = 12;
const SLOT_X = [4, 30, 74, 100];
const COLON_X = 64, COLON_Y = [TOP + 13, TOP + 27];
const POOL = [64, 32];
const TAU = Math.PI * 2;

// ------------------------------------------------------------ the field
//
// The liquid is a metaball field: every charge adds w * (1 - r²/R²)² within
// radius R. A row of weight-1 charges D apart has the surface HALF px from
// its centre-line when thresholded at TH.
const R = 6, R2 = R * R;
const D = 1.5;
const HALF = 3.0;
const TH = (16 * (R2 - HALF * HALF) ** 2.5) / (15 * R2 * R2 * D);

const F = new Float32Array(W * H);   // field
const M = new Uint8Array(W * H);     // 1 = liquid (dark)

function addCharge(x, y, w) {
  const x0 = Math.max(0, Math.ceil(x - R - 0.5)), x1 = Math.min(W - 1, Math.floor(x + R - 0.5));
  const y0 = Math.max(0, Math.ceil(y - R - 0.5)), y1 = Math.min(H - 1, Math.floor(y + R - 0.5));
  for (let py = y0; py <= y1; py++) {
    const dy = py + 0.5 - y, dy2 = dy * dy, row = py * W;
    for (let px = x0; px <= x1; px++) {
      const dx = px + 0.5 - x, d2 = dx * dx + dy2;
      if (d2 < R2) { const q = 1 - d2 / R2; F[row + px] += w * q * q; }
    }
  }
}

/** The field of a charge list at a point (for building the models). */
function fieldOf(xs, ys, ws, x, y) {
  let s = 0;
  for (let i = 0; i < xs.length; i++) {
    const d2 = (x - xs[i]) ** 2 + (y - ys[i]) ** 2;
    if (d2 < R2) { const q = 1 - d2 / R2; s += ws[i] * q * q; }
  }
  return s;
}

/** An integer hash as a float in [0, 1). */
function hash(a, b, c) {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const smooth = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
// ------------------------------------------------------------ letterforms
//
// Each digit is ONE continuous stroke (the coil under the plate is wound
// along it, and on the minute the liquid runs along it): a list of smooth
// pieces that meet at corners, in a 24 x 40 box.
function ellPts(cx, cy, rx, ry, n = 18) {
  const p = [];
  for (let i = 0; i <= n; i++) { const a = (i / n) * TAU; p.push([cx + rx * Math.sin(a), cy - ry * Math.cos(a)]); }
  return p;
}
const SK = {
  0: [ellPts(12, 20, 7.6, 16.3)],
  1: [[[5, 11.5], [9.2, 8.2], [13.4, 3.6]], [[13.4, 3.6], [13.4, 36.4]]],
  2: [[[4.6, 11.5], [6.2, 6], [12, 3.6], [17.8, 5.8], [19.4, 11.5], [17.2, 18], [11, 25.5], [4.2, 36.4]], [[4.2, 36.4], [12, 36.1], [20, 36.4]]],
  3: [[[4.6, 6.5], [9, 3.8], [15, 3.8], [18.8, 7.8], [18.4, 13.6], [12.2, 18.4]],
    [[12.2, 18.4], [18.2, 21.8], [20.2, 28], [17.6, 34.4], [11.4, 36.5], [4.4, 33.2]]],
  4: [[[17, 36.4], [17, 3.6]], [[17, 3.6], [3.2, 27.6]], [[3.2, 27.6], [21, 27.6]]],
  5: [[[19.2, 3.6], [6.2, 3.6]], [[6.2, 3.6], [5.2, 17.4]],
    [[5.2, 17.4], [11, 15.2], [17.4, 17.6], [20.2, 24.6], [18.4, 32.6], [12, 36.5], [4.6, 33.4]]],
  6: [[[17.6, 6.2], [12.4, 3.6], [6.4, 6.6], [3.9, 14], [3.8, 24.5], [6, 33.4], [12, 36.5], [18, 33.6], [20.2, 27.5], [18.4, 21.2], [12.4, 18.6], [6.4, 20.8], [3.9, 25.5]]],
  7: [[[3.8, 3.6], [20.4, 3.6]], [[20.4, 3.6], [14.6, 15], [11, 26], [9.8, 36.4]]],
  8: [[[12, 19.6], [6.2, 15.8], [5.2, 9.6], [8, 4.6], [12, 3.6], [16, 4.6], [18.8, 9.6], [17.8, 15.8], [12, 19.6],
    [5.8, 23.6], [4, 29.8], [7, 35.4], [12, 36.6], [17, 35.4], [20, 29.8], [18.2, 23.6], [12, 19.6]]],
};
SK[9] = SK[6].map((pc) => pc.map(([x, y]) => [DW - x, DH - y]).reverse()).reverse();

/** Catmull-Rom through a piece (wrapping if it is closed), finely sampled. */
function smoothPiece(pts) {
  if (pts.length < 3) return pts.map((p) => [...p]);
  const closed = Math.hypot(pts[0][0] - pts.at(-1)[0], pts[0][1] - pts.at(-1)[1]) < 0.01;
  const n = pts.length - 1;
  const at = (i) => {
    if (closed) return pts[((i % n) + n) % n];
    if (i < 0) return [2 * pts[0][0] - pts[1][0], 2 * pts[0][1] - pts[1][1]];
    if (i > n) return [2 * pts[n][0] - pts[n - 1][0], 2 * pts[n][1] - pts[n - 1][1]];
    return pts[i];
  };
  const out = [];
  for (let i = 0; i < n; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    for (let k = 0; k < 12; k++) {
      const t = k / 12, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((c) => 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3)));
    }
  }
  out.push([...pts[n]]);
  return out;
}
// ------------------------------------------------------------ digit models
//
// A model is the stroke resampled every D px (one charge per sample, the
// weight swelling on the downstrokes and at the free ends, like a broad
// nib), and the spike sites: a row of upright spikes along the spine (seen
// from above, each is a glint), and thorns at the edges, leaning outward
// with the field, tallest at the free ends; inside a counter a thorn is cut
// short so the hole stays open.
const SP = 4.2;    // spine spike spacing
const SE = 3.1;    // edge thorn spacing

function buildModel(pieces) {
  let raw = [];
  for (const pc of pieces) { const s = smoothPiece(pc); if (raw.length) s.shift(); raw.push(...s); }
  const closed = Math.hypot(raw[0][0] - raw.at(-1)[0], raw[0][1] - raw.at(-1)[1]) < 0.01;
  const cum = [0];
  for (let i = 1; i < raw.length; i++) cum.push(cum[i - 1] + Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1]));
  const L = cum.at(-1);
  const n = closed ? Math.round(L / D) : Math.round(L / D) + 1;
  const step = closed ? L / n : L / (n - 1);
  const x = new Float32Array(n), y = new Float32Array(n), s = new Float32Array(n), w = new Float32Array(n);
  for (let k = 0, j = 0; k < n; k++) {
    const sk = k * step;
    while (j < raw.length - 2 && cum[j + 1] < sk) j++;
    const u = (sk - cum[j]) / (cum[j + 1] - cum[j] || 1);
    x[k] = raw[j][0] + (raw[j + 1][0] - raw[j][0]) * u;
    y[k] = raw[j][1] + (raw[j + 1][1] - raw[j][1]) * u;
    s[k] = sk;
  }
  const tx = new Float32Array(n), ty = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const a = closed ? (k - 1 + n) % n : Math.max(0, k - 1), b = closed ? (k + 1) % n : Math.min(n - 1, k + 1);
    const dx = x[b] - x[a], dy = y[b] - y[a], l = Math.hypot(dx, dy) || 1;
    tx[k] = dx / l; ty[k] = dy / l;
    const end = closed ? 99 : Math.min(s[k], L - s[k]);
    w[k] = (0.86 + 0.3 * Math.abs(ty[k])) * (1 + 0.25 * Math.exp(-end / 2.5));
  }
  const m = { n, x, y, s, w, tx, ty, L, closed, step };
  m.cx = x.reduce((a, b) => a + b, 0) / n; m.cy = y.reduce((a, b) => a + b, 0) / n;
  // The spine: upright spikes, seen as glints.
  m.spine = [];
  const ns = closed ? Math.round(L / SP) : Math.max(1, Math.round((L - SP) / SP) + 1);
  const ps = closed ? L / ns : (L - SP) / Math.max(1, ns - 1);
  for (let k = 0; k < ns; k++) {
    const sk = closed ? (k + 0.5) * ps : SP / 2 + k * ps;
    const i = Math.min(n - 1, Math.round(sk / step));
    m.spine.push({ x: x[i], y: y[i], s: sk, i });
  }
  m.thorns = [];
  const edge = (px, py, dx, dy) => {
    let e = 0;
    while (e < 9 && fieldOf(x, y, w, px + dx * e, py + dy * e) >= TH) e += 0.25;
    let f = e;
    while (f < e + 14 && fieldOf(x, y, w, px + dx * f, py + dy * f) < TH) f += 0.5;
    return [e, f - e];
  };
  const thorn = (px, py, dx, dy, sk, lf, seed) => {
    const a = (hash(seed, 3, 7) - 0.5) * 0.45;
    const ca = Math.cos(a), sa = Math.sin(a);
    const ux = dx * ca - dy * sa, uy = dx * sa + dy * ca;
    const [e, free] = edge(px, py, ux, uy);
    m.thorns.push({ bx: px + ux * (e - 0.9), by: py + uy * (e - 0.9), ux, uy, s: sk, i: Math.min(n - 1, Math.round(sk / step)),
      lf: lf * (0.8 + 0.45 * hash(seed, 5, 1)), max: free >= 13.5 ? 8 : Math.max(0, 0.36 * free - 0.3) });
  };
  const ne = closed ? Math.round(L / SE) : Math.max(1, Math.round(L / SE));
  const pe = L / ne;
  for (let k = closed ? 0 : 1; k < (closed ? ne : ne); k++) {
    const sk = k * pe, i = Math.min(n - 1, Math.round(sk / step));
    for (const side of [-1, 1]) thorn(x[i], y[i], -ty[i] * side, tx[i] * side, sk, 1, k * 2 + (side > 0 ? 1 : 0));
  }
  if (!closed) {
    for (const [i, sgn] of [[0, -1], [n - 1, 1]])
      for (const a of [-0.75, 0, 0.75]) {
        const dx = tx[i] * sgn, dy = ty[i] * sgn, ca = Math.cos(a), sa = Math.sin(a);
        thorn(x[i], y[i], dx * ca - dy * sa, dx * sa + dy * ca, s[i], a ? 1.25 : 1.6, 101 + i + a * 10);
      }
  }
  return m;
}
/** The colon: two small drops, each on a point magnet. Absolute coordinates. */
function buildColon() {
  const x = [], y = [], w = [];
  for (const cy of COLON_Y) {
    x.push(COLON_X); y.push(cy); w.push(0.55);
    for (let k = 0; k < 6; k++) { x.push(COLON_X + 1.3 * Math.cos((k * TAU) / 6)); y.push(cy + 1.3 * Math.sin((k * TAU) / 6)); w.push(0.42); }
  }
  const m = { n: x.length, x: Float32Array.from(x), y: Float32Array.from(y), w: Float32Array.from(w), s: new Float32Array(x.length), L: 0, closed: false, colon: true };
  m.spine = COLON_Y.map((cy) => ({ x: COLON_X, y: cy, s: 0, i: 0 }));
  m.thorns = [];
  for (const cy of COLON_Y)
    for (let k = 0; k < 9; k++) {
      const a = ((k + 0.25) * TAU) / 9, ux = Math.cos(a), uy = Math.sin(a);
      let e = 0;
      while (e < 6 && fieldOf(m.x, m.y, m.w, COLON_X + ux * e, cy + uy * e) >= TH) e += 0.25;
      m.thorns.push({ bx: COLON_X + ux * (e - 0.8), by: cy + uy * (e - 0.8), ux, uy, s: 0, i: 0, lf: 0.75 + 0.3 * hash(k, cy, 9), max: 9 });
    }
  return m;
}

const MODELS = {};
for (const d of Object.keys(SK)) MODELS[d] = buildModel(SK[d]);
const COLON = buildColon();

/** Where along a model's stroke arc length `sk` is (model coordinates). */
function pathAt(m, sk, out) {
  let u = sk / m.step;
  if (m.closed) u = ((u % m.n) + m.n) % m.n; else u = clamp(u, 0, m.n - 1);
  const i = Math.floor(u), j = m.closed ? (i + 1) % m.n : Math.min(m.n - 1, i + 1), f = u - i;
  out[0] = m.x[i] + (m.x[j] - m.x[i]) * f;
  out[1] = m.y[i] + (m.y[j] - m.y[i]) * f;
  return out;
}

/** The sample of a model nearest to a point (model coordinates). */
function nearest(m, px, py) {
  let best = Infinity, bi = 0;
  for (let i = 0; i < m.n; i++) { const d = (m.x[i] - px) ** 2 + (m.y[i] - py) ** 2; if (d < best) { best = d; bi = i; } }
  return bi;
}

/** Signed arc offset of sample i from sample e (the short way round a loop). */
function arcOff(m, i, e) {
  let d = m.s[i] - m.s[e];
  if (m.closed) { d = ((d % m.L) + m.L) % m.L; if (d > m.L / 2) d -= m.L; }
  return d;
}

const GOLD = Math.PI * (3 - Math.sqrt(5));
/**
 * A puddle: n charges spread over a disc of radius `rad` (a sunflower), each
 * charge given the disc point in the same angular order as it lies around
 * the centre, so the liquid contracts and spreads without crossing itself.
 * Returns per charge its radius and angle in the disc.
 */
function discMap(xs, ys, cx, cy, rad) {
  const n = xs.length;
  const ang = (i) => Math.atan2(ys[i] - cy, xs[i] - cx);
  const ord = Array.from({ length: n }, (_, i) => i).sort((a, b) => ang(a) - ang(b));
  const pts = Array.from({ length: n }, (_, k) => {
    let th = (k * GOLD) % TAU; if (th > Math.PI) th -= TAU;
    return [rad * Math.sqrt((k + 0.5) / n), th];
  }).sort((a, b) => a[1] - b[1]);
  const rr = new Float32Array(n), th = new Float32Array(n);
  ord.forEach((i, k) => { rr[i] = pts[k][0]; th[i] = pts[k][1]; });
  return { rr, th };
}
// ------------------------------------------------------------ choreography
//
// Times are seconds from the :00 of the turn.
const SURGE0 = -2.9, OFF = -2.1, COLL = 0.35;                 // minute: surge, then the magnet lets go
const BOLD0 = -1.85, BOLD = 0.5;                             // the liquid relaxes, swelling bold
const SLUMP0 = -1.35, SLUMP_LAG = 0.15, SLUMP_DUR = 0.6;     // then draws up into a puddle
const CRAWL0 = 0.3, LEAVE = 0.85, V1 = 40, V2 = 24;          // and runs out along the new coil
const RISE = 0.55, FULL0 = 3.0, MIN_END = 4.0;
const PUD = [12, 21], PUD_R = 6.0, PUD_M = 19;                // the puddle, in slot coordinates

const H_SURGE0 = -4.7, H_OFF = -4.0, H_BOLD0 = -3.75, H_SLUMP0 = -3.25, H_SDUR = 0.6, H_MERGE0 = -2.5, H_MDUR = 1.9;
const H_SPIN = 4.2, H_CRAWL0 = 4.55, H_LEAVE = 0.9, H_V1 = 75;
const H_FULL0 = 7.6, H_END = 8.8;
const RP = 16, POOL_M = 95;                                  // the hour's pool
const SPIN_W = TAU * 0.95;                                     // peak spin, rad/s

const MAXC = 900;
const CX = new Float32Array(MAXC), CY = new Float32Array(MAXC), CW = new Float32Array(MAXC);
const ARR = new Float32Array(MAXC);   // when each charge reaches its place, in a crawl
let NC = 0;
const push = (x, y, w) => { CX[NC] = x; CY[NC] = y; CW[NC] = w; NC++; };

/** Spike height through a release: a strain, a quiver, then a collapse. */
function surge(tau, t0, off, T) {
  if (tau < t0) return 1;
  if (tau < off) { const u = (tau - t0) / (off - t0); return 1 + 0.6 * u * u + 0.14 * u * Math.sin(T * 57); }
  const u = (tau - off) / COLL;
  return u >= 1 ? 0 : 1.6 * (1 - u) * (1 - u);
}
/** A spike erupting: up with a strong overshoot, then settling. */
function rise(u) {
  if (u <= 0) return 0;
  if (u >= 1.6) return 1;
  if (u < 1) { const t = u - 1; return 1 + 6 * t * t * t + 5 * t * t; }
  return 1 + 0.06 * Math.sin((u - 1) * 16) * (1.6 - u);
}
/** The coil reaching full current, once the liquid is in place. */
const full = (tau, t0) => 1 + 0.5 * Math.sin(Math.PI * clamp((tau - t0) / 0.8, 0, 1)) ** 2;
/** Spikes at rest breathe: a slow wave along the stroke and a faint shiver. */
const breathe = (T, s, k) => 0.8 + 0.14 * Math.sin((TAU * T) / 2.8 - s * 0.33 + k * 1.7) + 0.07 * Math.sin((TAU * T) / 0.9 + s * 1.1);

const P = [0, 0], Q = [0, 0];
/** A charge's place in a puddle, which can wobble (mode 3) and turn (faster inside). */
function discPt(map, i, cx, cy, rad, wobA, wobP, rot, rotD, out) {
  const r = map.rr[i], th = map.th[i] + rot + rotD * (1 - r / rad);
  const rr = r * (1 + wobA * Math.sin(3 * th + wobP));
  out[0] = cx + rr * Math.cos(th); out[1] = cy + rr * Math.sin(th);
  return out;
}

const cache = new Map();
function cached(key, make) {
  let v = cache.get(key);
  if (!v) { if (cache.size > 40) cache.clear(); v = make(); cache.set(key, v); }
  return v;
}
/** A digit's own puddle under its slot. */
const pudMap = (d) => cached(`p${d}`, () => {
  const m = MODELS[d];
  const map = discMap(m.x, m.y, PUD[0], PUD[1], PUD_R);
  map.rad = Float32Array.from(m.x, (x, i) => Math.hypot(x - PUD[0], m.y[i] - PUD[1]));
  map.rmax = Math.max(...map.rad);
  map.e = nearest(m, PUD[0], PUD[1]);
  return map;
});
/** The four digits and the colon as placed models, for the hour. */
function placed(digits) {
  const out = [...digits].map((d, k) => ({ m: MODELS[d], x0: SLOT_X[k], y0: TOP, k }));
  out.push({ m: COLON, x0: 0, y0: 0, k: 4 });
  return out;
}
/** All of the time's liquid gathered into one pool at the centre. */
const poolMap = (digits) => cached(`P${digits}`, () => {
  const pl = placed(digits), xs = [], ys = [];
  for (const { m, x0, y0 } of pl) for (let i = 0; i < m.n; i++) { xs.push(x0 + m.x[i]); ys.push(y0 + m.y[i]); }
  const map = discMap(xs, ys, POOL[0], POOL[1], RP);
  map.pl = pl;
  map.dist = Float32Array.from(xs, (x, i) => Math.hypot(x - POOL[0], ys[i] - POOL[1]));
  map.dmax = Math.max(...map.dist);
  map.entry = pl.map(({ m, x0, y0 }) => (m.colon ? 0 : nearest(m, POOL[0] - x0, POOL[1] - y0)));
  return map;
});

/**
 * The liquid running out of a puddle along a model's coil. Charges leave the
 * puddle farthest-first, flow to the entry point (the stroke nearest the
 * puddle), then run along the stroke to their place, decelerating, so a
 * tendril with a fat head races along the coil and the puddle drains behind
 * it. Records when each charge arrives (ARR), for the eruption.
 */
function crawl(m, x0, y0, map, off, cx, cy, rad, wd, e, t0, span, v1, tau, wob, rot, rotD) {
  const base = NC;
  const ex = x0 + m.x[e], ey = y0 + m.y[e];
  const dmax = m.colon ? 1 : m.closed ? m.L / 2 : Math.max(m.s[e], m.L - m.s[e]);
  for (let i = 0; i < m.n; i++) {
    const a = m.colon ? 0 : arcOff(m, i, e), d = Math.abs(a);
    discPt(map, off + i, cx, cy, rad, wob[0], wob[1], rot, rotD, P);
    const leave = t0 + span * (1 - d / dmax);
    const tx = m.colon ? x0 + m.x[i] : ex, ty = m.colon ? y0 + m.y[i] : ey;
    const dur1 = 0.1 + Math.hypot(tx - P[0], ty - P[1]) / v1, dur2 = m.colon ? 0 : 0.12 + d / V2;
    ARR[base + i] = leave + dur1 + dur2;
    const t = tau - leave;
    if (t <= 0) push(P[0], P[1], wd);
    else if (t < dur1) {
      const u = smooth(t / dur1);
      push(P[0] + (tx - P[0]) * u, P[1] + (ty - P[1]) * u, wd + (m.w[i] - wd) * u);
    } else {
      const u = dur2 ? Math.min(1, (t - dur1) / dur2) : 1;
      pathAt(m, m.s[e] + a * ease.outCubic(u), Q);
      push(x0 + Q[0], y0 + Q[1], m.w[i]);
    }
  }
  return base;
}

function rest(m, x0, y0) {
  for (let i = 0; i < m.n; i++) push(x0 + m.x[i], y0 + m.y[i], m.w[i]);
}

/** One slot through a minute turn. */
function minuteSlot(k, dA, dB, tau, T, S) {
  const x0 = SLOT_X[k], y0 = TOP;
  if (dA === dB || tau < SURGE0 || tau >= MIN_END) {
    const m = MODELS[tau < 0 ? dA : dB];
    rest(m, x0, y0);
    S.spikes.push({ m, x0, y0, h: (p) => breathe(T, p.s, k) });
    return;
  }
  const cx = x0 + PUD[0], cy = y0 + PUD[1];
  const wob = [0.22 * Math.exp(-(((tau + 0.4) / 0.75) ** 2)), 8 * tau + k];
  if (tau < 0) {
    const m = MODELS[dA], map = pudMap(dA), wd = PUD_M / m.n;
    const hF = surge(tau, SURGE0, OFF, T);
    const bold = 1 + 0.8 * smooth((tau - BOLD0) / BOLD);
    for (let i = 0; i < m.n; i++) {
      const e = ease.inOutCubic(clamp((tau - SLUMP0 - SLUMP_LAG * (1 - map.rad[i] / map.rmax)) / SLUMP_DUR, 0, 1));
      discPt(map, i, cx, cy, PUD_R, wob[0], wob[1], 0.6 * e, 0, P);
      push(x0 + m.x[i] + (P[0] - x0 - m.x[i]) * e, y0 + m.y[i] + (P[1] - y0 - m.y[i]) * e, m.w[i] * bold + (wd - m.w[i] * bold) * e);
    }
    if (hF > 0) S.spikes.push({ m, x0, y0, h: (p) => breathe(T, p.s, k) * hF });
    S.gloss.push([x0 - 3, y0 - 3, x0 + DW + 3, y0 + DH + 3, 1 - Math.min(1, hF)]);
    return;
  }
  const m = MODELS[dB], map = pudMap(dB);
  const base = crawl(m, x0, y0, map, 0, cx, cy, PUD_R, PUD_M / m.n, map.e, CRAWL0, LEAVE, V1, tau, wob, 0.6, 0);
  S.spikes.push({ m, x0, y0, h: (p) => breathe(T, p.s, k) * rise((tau - ARR[base + p.i] - 0.05) / RISE) * full(tau, FULL0) });
  S.gloss.push([x0 - 3, y0 - 3, x0 + DW + 3, y0 + DH + 3, 1 - smooth((tau - 1.2) / 1.4)]);
  if (tau < 2.8) S.coils.push({ m, x0, y0, e: map.e, t: tau, base });
}
/** The colon's drops beat once a second: their thorns flick out and relax. */
const beat = (T) => 0.45 + 0.8 * Math.exp(-(((T % 1) + 1) % 1) / 0.2);

/** The spin of the hour's spiral magnet: up to speed and back down, rad. */
function spinAngle(tau) {
  const t = clamp(tau, 0, H_SPIN);
  return SPIN_W * (t / 2 - (H_SPIN / (4 * Math.PI)) * Math.sin((2 * Math.PI * t) / H_SPIN));
}

/**
 * The hour's spiral magnet spins under the pool and the liquid climbs it:
 * the pool is drawn out into three arms of a logarithmic spiral (stretched
 * to the wide glass), turning, and winds back in before it lets go.
 */
const ARMS = 5, ARM_K = 1.9, ARM_R0 = 3, ARM_L = 21;
const spiralAmt = (tau) => smooth((tau - 0.25) / 1.1) * (1 - smooth((tau - (H_SPIN - 1.0)) / 0.9));
function armPt(arm, r, d, cx, cy, ang, out) {
  const th = (arm * TAU) / ARMS + ARM_K * Math.log(r / ARM_R0) + ang + d / r;
  out[0] = cx + 1.3 * r * Math.cos(th); out[1] = cy + r * Math.sin(th);
  return out;
}
function spiralPt(map, i, cx, cy, ang, out) {
  const u = ((map.th[i] + Math.PI) / TAU) * ARMS, arm = Math.min(ARMS - 1, Math.floor(u)), f = u - arm;
  const t = (map.rr[i] / RP) ** 2;
  return armPt(arm, ARM_R0 + ARM_L * t ** 1.1, (f - 0.5) * 3.4 * (1 - 0.4 * t), cx, cy, ang, out);
}

/** The hour: everything drains into one pool, which climbs a spinning spiral. */
function hourTurn(A, B, tau, T, S) {
  const [cx, cy] = POOL;
  if (tau < 0) {
    const map = poolMap(A), wd = POOL_M / map.rr.length;
    const hF = surge(tau, H_SURGE0, H_OFF, T);
    const wob = [0.12 * Math.exp(-(((tau + 0.5) / 0.6) ** 2)), 7 * tau];
    let gi = 0;
    // Each digit first draws up into its own puddle (so it never passes for
    // another digit), then the puddles slide together and merge.
    const slide = ease.inOutCubic(clamp((tau - H_MERGE0) / (H_MDUR * 0.75), 0, 1));
    const e2 = ease.inOutCubic(clamp((tau - H_MERGE0 - H_MDUR * 0.45) / (H_MDUR * 0.55), 0, 1));
    const bold = 1 + 0.8 * smooth((tau - H_BOLD0) / BOLD);
    for (const { m, x0, y0, k } of map.pl) {
      const pm = m.colon ? null : pudMap(A[k]);
      const wp = m.colon ? 0 : PUD_M / m.n;
      for (let i = 0; i < m.n; i++, gi++) {
        let px = x0 + m.x[i], py = y0 + m.y[i], w = m.w[i] * (m.colon ? 1 : bold);
        if (pm) {
          const e1 = ease.inOutCubic(clamp((tau - H_SLUMP0 - SLUMP_LAG * (1 - pm.rad[i] / pm.rmax)) / H_SDUR, 0, 1));
          discPt(pm, i, x0 + PUD[0], y0 + PUD[1], PUD_R, 0.15 * e1 * (1 - e2), 9 * tau + k, 0.6 * e1, 0, Q);
          px += (Q[0] - px) * e1; py += (Q[1] - py) * e1; w += (wp - w) * e1;
        }
        // The puddle slides whole towards the pool, then runs into it.
        if (pm) { px += (cx - x0 - PUD[0]) * 0.8 * slide; py += (cy - y0 - PUD[1]) * 0.8 * slide; }
        discPt(map, gi, cx, cy, RP, wob[0], wob[1], 0, 0, P);
        push(px + (P[0] - px) * e2, py + (P[1] - py) * e2, w + (wd - w) * e2);
      }
      if (hF > 0) S.spikes.push({ m, x0, y0, h: m.colon ? () => beat(T) * hF : (p) => breathe(T, p.s, k) * hF });
    }
    S.gloss.push([0, 0, W, H, 1 - Math.min(1, hF)]);
    return;
  }
  const map = poolMap(B), wd = POOL_M / map.rr.length;
  const ang = spinAngle(tau);
  const env = tau < H_SPIN ? smooth((tau - 0.2) / 0.9) : Math.max(0, 1 - (tau - H_SPIN) / COLL) ** 2;
  const wob = [0.12 * Math.exp(-(((tau + 0.5) / 0.6) ** 2)) + 0.09 * env, 7 * tau];
  const sp = spiralAmt(tau);
  let gi = 0;
  map.pl.forEach(({ m, x0, y0, k }, j) => {
    if (tau < H_CRAWL0) {
      for (let i = 0; i < m.n; i++) {
        discPt(map, gi + i, cx, cy, RP, wob[0], wob[1], ang, 0.8 * ang, P);
        if (sp > 0) { spiralPt(map, gi + i, cx, cy, ang, Q); P[0] += (Q[0] - P[0]) * sp; P[1] += (Q[1] - P[1]) * sp; }
        push(P[0], P[1], wd * (1 + 1.1 * sp));
      }
    } else {
      const base = crawl(m, x0, y0, map, gi, cx, cy, RP, wd, map.entry[j], H_CRAWL0, H_LEAVE, H_V1, tau, wob, ang, 0.8 * ang);
      S.spikes.push({ m, x0, y0, h: (p) => (m.colon ? beat(T) : breathe(T, p.s, k)) * rise((tau - ARR[base + p.i] - 0.05) / RISE) * full(tau, H_FULL0) });
      if (!m.colon && tau < H_CRAWL0 + 2.6) S.coils.push({ m, x0, y0, e: map.entry[j], t: tau - H_CRAWL0 + CRAWL0, base });
    }
    gi += m.n;
  });
  S.gloss.push([0, 0, W, H, tau < 0.6 ? 1 - env : tau < H_CRAWL0 ? 0 : 1 - smooth((tau - H_CRAWL0 - 1.2) / 1.6)]);
  if (env > 0) S.pool = { ang, env, tau, sp };
}
// ------------------------------------------------------------ drawing

const LX = -0.6, LY = -0.8;             // the lamp, upper left: where a spike's glint sits
const HV = (() => { const h = [-0.45, -0.55, 1.7], l = Math.hypot(...h); return h.map((c) => c / l); })();
const KN = 1.1 / TH;                    // field gradient -> surface slope
const LEVEL = new Float32Array(W * H);  // the backlit plate: brightest in the middle
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    const u = (x + 0.5 - 64) / 64, v = (y + 0.5 - 32) / 32;
    LEVEL[y * W + x] = 0.72 - 0.12 * u * u - 0.14 * v * v;
  }
const C = new Uint8Array(W * H);        // the coil's track, where it shows
const COIL_V = 120;                     // the current pulse, px/s

/** A thorn into the mask: a concave cone from its base, leaning out along u. */
function thornMask(bx, by, ux, uy, len, bw) {
  const tx = bx + ux * len, ty = by + uy * len;
  const x0 = Math.max(0, Math.floor(Math.min(bx, tx) - bw - 1)), x1 = Math.min(W - 1, Math.ceil(Math.max(bx, tx) + bw + 1));
  const y0 = Math.max(0, Math.floor(Math.min(by, ty) - bw - 1)), y1 = Math.min(H - 1, Math.ceil(Math.max(by, ty) + bw + 1));
  for (let py = y0; py <= y1; py++)
    for (let px = x0; px <= x1; px++) {
      const dx = px + 0.5 - bx, dy = py + 0.5 - by;
      const a = dx * ux + dy * uy;
      if (a < -1 || a > len) continue;
      const c = Math.abs(dy * ux - dx * uy);
      if (c <= (a < 0 ? bw : bw * (1 - a / len) ** 1.3)) M[py * W + px] = 1;
    }
}

/** Where the liquid's edge is from (cx, cy) in direction (ux, uy). */
function edgeAt(cx, cy, ux, uy) {
  let r = 2;
  for (; r < 30; r += 0.5) {
    const x = Math.floor(cx + ux * r), y = Math.floor(cy + uy * r);
    if (x < 0 || y < 0 || x >= W || y >= H || F[y * W + x] < TH) break;
  }
  return r;
}

/**
 * The hour's pool on the spinning spiral: a crown of thorns round the rim,
 * with as many great thorns as the hour that is striking, and spikes
 * climbing three spiral arms to the apex in the middle.
 */
function poolSpikes(pool, ox, oy, glints) {
  const cx = POOL[0] + ox, cy = POOL[1] + oy;
  const { ang, env, tau, sp } = pool;
  // While it is still a disc: a crown of thorns round the rim, rippling round.
  const rim = env * (1 - sp);
  if (rim > 0.02) {
    const NR = 30;
    for (let k = 0; k < NR; k++) {
      const th = (k * TAU) / NR + ang * 0.9, ux = Math.cos(th), uy = Math.sin(th);
      const h = rim * (0.55 + 0.45 * Math.sin(3 * th - 5 * tau));
      const r = edgeAt(cx, cy, ux, uy);
      thornMask(cx + ux * (r - 1), cy + uy * (r - 1), ux, uy, (0.6 + 3.2 * h) * (0.85 + 0.3 * hash(k, 1, 1)), 1.4);
    }
  }
  // On the arms: thorns down both flanks and glints along the crest, the
  // spikes climbing from the tips to the apex in the middle.
  const A = [0, 0], B2 = [0, 0];
  for (let arm = 0; arm < ARMS; arm++)
    for (let r = ARM_R0 + 1.5, k = 0; r < ARM_R0 + ARM_L - 1; r += 2.6, k++) {
      const climb = smooth((tau * 8 - (ARM_R0 + ARM_L + 6 - r)) / 6);
      armPt(arm, r, 0, cx, cy, ang, A); armPt(arm, r + 0.6, 0, cx, cy, ang, B2);
      const ia = Math.floor(A[1]) * W + Math.floor(A[0]);
      if (sp < 0.6 || A[0] < 0 || A[1] < 0 || A[0] >= W || A[1] >= H || F[ia] < TH) continue;
      glints.push([A[0], A[1], env * (0.35 + 0.8 * climb)]);
      let tx = B2[0] - A[0], ty = B2[1] - A[1];
      const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      for (const sg of [-1, 1]) {
        const ux = -ty * sg, uy = tx * sg;
        let e = 0.5;
        while (e < 9) { const x = Math.floor(A[0] + ux * e), y = Math.floor(A[1] + uy * e); if (x < 0 || y < 0 || x >= W || y >= H || F[y * W + x] < TH) break; e += 0.5; }
        const len = env * sp * (0.8 + 4 * climb * (1 - 0.4 * (r - ARM_R0) / ARM_L)) * (0.8 + 0.4 * hash(k, arm, sg + 3));
        if (len > 0.4) thornMask(A[0] + ux * (e - 1), A[1] + uy * (e - 1), ux, uy, len, 1.5);
      }
    }
}
function render(g, S, ox, oy, pb) {
  F.fill(0); M.fill(0); C.fill(0);
  for (let c = 0; c < NC; c++) addCharge(CX[c] + ox, CY[c] + oy, CW[c]);
  for (let i = 0; i < W * H; i++) M[i] = F[i] >= TH ? 1 : 0;
  const glints = [];
  for (const sp of S.spikes) {
    const bx = sp.x0 + ox, by = sp.y0 + oy;
    for (const t of sp.m.thorns) {
      const h = sp.h(t);
      if (h <= 0.02) continue;
      const len = Math.min(t.max, (0.5 + 3.2 * h) * t.lf);
      if (len > 0.4) thornMask(bx + t.bx, by + t.by, t.ux, t.uy, len, 1.5);
    }
    for (const p of sp.m.spine) { const h = sp.h(p); if (h > 0.12) glints.push([bx + p.x, by + p.y, h]); }
  }
  if (S.pool) poolSpikes(S.pool, ox, oy, glints);

  // The coil under the plate: its track appears behind a current pulse that
  // runs out from the entry point, and the liquid follows it.
  const pulses = [];
  for (const c of S.coils) {
    const { m, e, t } = c;
    const bx = c.x0 + ox, by = c.y0 + oy;
    const a = t * COIL_V, dmax = m.closed ? m.L / 2 : Math.max(m.s[e], m.L - m.s[e]);
    for (let i = 0; i < m.n; i++) {
      if (Math.abs(arcOff(m, i, e)) > a) continue;
      const x = Math.floor(bx + m.x[i]), y = Math.floor(by + m.y[i]);
      if (x >= 0 && y >= 0 && x < W && y < H && !M[y * W + x]) C[y * W + x] = 1;
    }
    if (a < dmax + 4)
      for (const sg of [-1, 1])
        for (let j = 0; j < 4; j++) {
          const r = a - j * 0.7;
          if (r < 0 || r > (m.closed ? m.L / 2 : sg < 0 ? m.s[e] : m.L - m.s[e])) continue;
          pathAt(m, m.s[e] + sg * r, Q);
          pulses.push([bx + Q[0], by + Q[1]]);
        }
  }

  // The plate, lit from behind, and a lit meniscus round everything dark.
  const buf = g.buf;
  for (let y = 0, i = 0; y < H; y++)
    for (let x = 0; x < W; x++, i++) {
      if (M[i] || C[i]) continue;
      const nb = (x > 0 && (M[i - 1] | C[i - 1])) || (x < W - 1 && (M[i + 1] | C[i + 1])) ||
        (y > 0 && (M[i - W] | C[i - W])) || (y < H - 1 && (M[i + W] | C[i + W]));
      if (nb || dither(x + pb[0], y + pb[1], LEVEL[i])) buf[i] = 1;
    }
  for (const [x, y] of pulses) { const i = Math.floor(y) * W + Math.floor(x); if (i >= 0 && i < W * H && !M[i]) buf[i] = 1; }

  // Smooth liquid is a mirror: a specular sheen where its surface faces the lamp.
  for (const [x0, y0, x1, y1, s] of S.gloss) {
    if (s < 0.04) continue;
    for (let y = Math.max(1, y0); y < Math.min(H - 1, y1); y++)
      for (let x = Math.max(1, x0); x < Math.min(W - 1, x1); x++) {
        const i = y * W + x;
        if (F[i] < TH) continue;
        const nx = -(F[i + 1] - F[i - 1]) * KN, ny = -(F[i + W] - F[i - W]) * KN;
        const dot = (nx * HV[0] + ny * HV[1] + HV[2]) / Math.hypot(nx, ny, 1);
        const lv = ((dot - 0.95) / 0.035) * s;
        if (lv > 0 && dither(x, y, lv)) buf[i] = 1;
      }
  }
  // Each spike's glint, on its lit flank.
  for (const [x, y, h] of glints) {
    const d = 0.5 + 0.9 * h;
    for (const dd of h > 0.65 ? [d, d - 1] : [d]) {
      const px = Math.floor(x + LX * dd), py = Math.floor(y + LY * dd);
      if (px >= 0 && py >= 0 && px < W && py < H && M[py * W + px]) buf[py * W + px] = 1;
    }
  }
}
// ------------------------------------------------------------ the face

const DAY = 0xa0, NIGHT_C = 0x16;

/** The plate's dither walks all 64 phases of its 8x8 pattern, a step every 3 min (burn-in). */
function plateShift(date) {
  const k = Math.floor((date.getTime() - 30000) / 180000);
  const j = ((k % 64) + 64) % 64;
  return [j & 7, ((j >> 3) * 3) & 7];
}

export default {
  name: 'Ferrofluid',
  blurb: 'The time in black magnetic liquid on a backlit plate, bristling with spikes; on the minute the magnet lets go, the digit slumps into a puddle and runs along the next coil, and on the hour all of it climbs a spinning spiral.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,

  frame(g, { fields: f, date, oled, night }) {
    const T = (date.getTime() / 1000) % 86400;
    const [ox, oy] = orbit(date, 2, 3);
    const late = f.sec >= 40;
    const from = late ? f : previousMinute(date);
    const to = late ? clockFields(new Date(date.getTime() + 60000)) : f;
    const tau = late ? f.sec - 60 : f.sec;
    const A = `${from.hh}${from.mm}`, B = `${to.hh}${to.mm}`;
    const S = { spikes: [], coils: [], gloss: [], pool: null };
    NC = 0;
    if (to.m === 0 && tau >= H_SURGE0 && tau < H_END) hourTurn(A, B, tau, T, S);
    else {
      for (let k = 0; k < 4; k++) minuteSlot(k, A[k], B[k], tau, T, S);
      rest(COLON, 0, 0);
      S.spikes.push({ m: COLON, x0: 0, y0: 0, h: () => beat(T) });
    }
    render(g, S, ox, oy, plateShift(date));
    oled.contrast(DAY + (NIGHT_C - DAY) * night);
  },
};
