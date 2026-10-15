// Spiderweb — an orb-weaver's web strung across a window at dawn.
//
// The top of the window is an orb web: a hub, radials out to the frame, and
// the capture spiral strung between them. Every thread is straight runs
// between anchor knots, bowing under its own weight, and the whole web
// breathes in the draught. A bead of dew runs the window frame itself, one
// lap a minute, leaving a wetted trail behind it: the seconds.
//
// The time hangs below the banner line, spun *into* the web. Each numeral is
// a strand the spider walked, a chain of straight silk runs tied at knots
// with dew beaded on the anchors — letterforms that could not exist in any
// other material. The spider itself dangles on its own thread in the gap
// between the hours and the minutes: the colon.
//
// Every minute it hauls itself up to the banner, walks along it to the
// numeral that changes, bites through its silk and lets it fall slack, then
// walks the new numeral out, laying silk behind it and beading the anchors as
// it passes. On the hour the whole web is recycled as an orb weaver recycles
// its own: every strand slackens at once and falls, and the spider rebuilds
// from the hub out — radials, spiral, then the time itself.
//
// Burn-in: the draught and a slow drift walk the whole picture round a small
// circle, and the dew drops that let go of the web are drawn from the clock.
// From 23:00 to 07:00 the panel dims (ctx.night).

import { dither, clamp, ease, noise, clockFields } from '../js/kit.js';

const TAU = Math.PI * 2;
const H = 64;

// ------------------------------------------------------------ the draught
// Every point is displaced by this: a slow two-frequency sway (the whole web
// breathing) plus the burn-in drift, which walks the picture round a small
// circle smoothly, so no pixel is lit in the same place all day.

const ENV = { T: 0, gust: 0, ox: 0, oy: 0 };

function disp(x, y, amp = 1) {
  const { T, gust, ox, oy } = ENV;
  const a = (0.8 + 2.0 * gust) * amp;
  return [
    ox + a * (0.62 * Math.sin(T * 1.21 + y * 0.115) + 0.38 * Math.sin(T * 0.63 + x * 0.071 + 1.9)),
    oy + a * (0.55 * Math.cos(T * 0.97 + x * 0.093) + 0.45 * Math.cos(T * 0.53 + y * 0.083 + 0.7)),
  ];
}

/** Slide a whole polyline through the draught. */
const blown = (pts, amp = 1) => pts.map(([x, y]) => { const [dx, dy] = disp(x, y, amp); return [x + dx, y + dy]; });

// ------------------------------------------------------------ silk

/**
 * Sample a thread through `pts`: straight runs between anchors, each bowing
 * under its own weight. A vertical run is in tension and does not sag.
 */
function sagPts(pts, k = 0.85) {
  const out = [];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    const dx = x1 - x0, dy = y1 - y0;
    const L = Math.hypot(dx, dy) || 1e-6;
    const d = Math.min(1.5, (k * L * L * 0.012) * Math.abs(dx) / L);
    const n = Math.max(2, Math.ceil(L / 1.5));
    for (let j = (i === 1 ? 0 : 1); j <= n; j++) {
      const u = j / n;
      out.push([x0 + dx * u, y0 + dy * u + d * 4 * u * (1 - u)]);
    }
  }
  return out;
}

/** A thread one pixel wide: plotted, dithered, cheap. */
function plotPoly(g, pts, level) {
  if (level <= 0.02) return;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
    for (let k = 0; k <= n; k++) {
      const u = k / n;
      const x = Math.round(x0 + (x1 - x0) * u), y = Math.round(y0 + (y1 - y0) * u);
      if (level >= 0.999 || dither(x, y, level)) g.pixel(x, y, 1);
    }
  }
}

/**
 * A strand `w` pixels thick, faded by `level` (1 = solid). A round pen
 * walked along the polyline: a disc of ink at every pixel of the path, which
 * at this size is the same line for a fraction of the cost of a distance
 * field over the whole bounding box.
 */
function thickPoly(g, pts, w, level) {
  if (level <= 0.03) return;
  const r = w / 2, r2 = r * r;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    const dx = x1 - x0, dy = y1 - y0;
    const n = Math.max(1, Math.ceil(Math.hypot(dx, dy)));
    for (let k = 0; k <= n; k++) {
      const u = k / n, x = x0 + dx * u, y = y0 + dy * u;
      for (let py = Math.floor(y - r); py <= Math.floor(y + r); py++)
        for (let px = Math.floor(x - r); px <= Math.floor(x + r); px++) {
          const ox = px + 0.5 - x, oy = py + 0.5 - y;
          if (ox * ox + oy * oy <= r2 && (level >= 0.999 || dither(px, py, level))) g.pixel(px, py, 1);
        }
    }
  }
}

/** A lump: where two runs are tied, the silk thickens a little. */
function knot(g, x, y) { g.fillCircle(x, y, 1.3, 1); }

/** A free end: the strand is wrapped round its anchor pin, a small eyelet. */
function tieOff(g, x, y) { g.circle(x, y, 1.4, 1).pixel(x, y, 0); }

/** A bead of dew: a droplet, wider at the bottom. */
function bead(g, x, y) {
  g.fillWhere((px, py) => ((px - x) / 1.35) ** 2 + ((py - (y + 1.3)) / 1.7) ** 2 <= 1, 1, [x - 3, y - 1, 6, 6]);
}

// ------------------------------------------------------------ letterforms
// Every numeral is silk the spider walked: strokes are chains of anchor
// vertices in a 16 x 28 box. Corners are knots, free ends are eyelets.

const DW = 16, DH = 28;
const GLYPH = {
  0: [[[4, 0.5], [11.5, 0.5], [15, 7.5], [15, 20.5], [11.5, 27.5], [4, 27.5], [0.5, 20.5], [0.5, 7.5], [4, 0.5]]],
  1: [[[1.8, 7.5], [7.5, 0.8], [7.5, 27.5]], [[1.8, 27.5], [13.8, 27.5]]],
  2: [[[0.8, 5], [2.2, 1.5], [7.5, 0], [12.5, 1.6], [14.2, 6.4], [11.5, 12], [6.5, 17.5], [2, 22.5], [0.4, 26], [0.4, 27.5], [14.8, 27.5]]],
  3: [[[0.8, 0.8], [13.5, 0.8], [7, 11.5], [11.5, 12.5], [14.6, 18], [12.6, 24.5], [7.5, 27.6], [2.2, 25.8], [0.4, 21.5]]],
  4: [[[11, 27.5], [11, 0.6], [0.4, 17.5], [15.2, 17.5]]],
  5: [[[14, 0.8], [2, 0.8], [1.2, 11.5], [7, 8.6], [12.6, 11.2], [14.6, 17.2], [12.2, 24.2], [5.8, 27.6], [0.4, 23.4]]],
  6: [[[12, 1.6], [8, 0], [3, 2.2], [0.5, 9], [0.2, 18], [3.2, 25], [8.8, 27.6], [13.8, 24.2], [13.8, 17], [9.4, 13.2], [3.6, 15.2], [0.6, 20]]],
  7: [[[0.5, 1.8], [1.8, 0], [14.6, 0], [9.6, 10.5], [6.8, 20], [5.8, 27.6]], [[2.4, 15.5], [14, 15.5]]],
  8: [[[4.5, 0], [11, 0], [13.6, 4.2], [11.8, 8.8], [7.8, 11.6], [3.8, 8.8], [2.4, 4.2], [4.5, 0]],
    [[7.8, 11.6], [13.2, 15], [14.4, 21], [11.4, 26], [6, 27.6], [1.6, 24], [0.6, 18], [3.4, 13.6], [7.8, 11.6]]],
  9: [[[3.5, 1.6], [7.8, 0], [12.8, 2.2], [15.2, 9], [15.5, 18], [12.6, 25], [7, 27.6], [2, 24.2], [2, 17], [6.4, 13.2], [12.2, 15.2], [15.2, 20]]],
};

/** Which anchors carry a bead of dew. */
const BEADED = { 0: [0, 2, 4, 6], 1: [1], 2: [0, 3, 6], 3: [1, 4, 7], 4: [1, 3], 5: [0, 2, 5, 8], 6: [2, 5, 8], 7: [2, 5], 8: [0, 2, 5, 7], 9: [2, 6, 9] };

/** Where each numeral hangs from the banner: its topmost anchor, and its furthest. */
const HANG = {};
for (const [d, strokes] of Object.entries(GLYPH)) {
  const vs = strokes.flat();
  const top = vs.reduce((a, b) => (b[1] < a[1] ? b : a));
  const wide = vs.filter((v) => v[1] < DH * 0.5 && Math.abs(v[0] - top[0]) > 6);
  HANG[d] = wide.length ? [top, wide.reduce((a, b) => (Math.abs(b[0] - top[0]) > Math.abs(a[0] - top[0]) ? b : a))] : [top];
}

/** The polyline of one stroke, up to arc-length fraction `f` (1 = all of it). */
function partialStroke(st, f) {
  if (f >= 1) return st;
  const L = [];
  let total = 0;
  for (let i = 1; i < st.length; i++) { const d = Math.hypot(st[i][0] - st[i - 1][0], st[i][1] - st[i - 1][1]); L.push(d); total += d; }
  const want = total * f, out = [st[0]];
  let acc = 0;
  for (let i = 1; i < st.length; i++) {
    if (acc + L[i - 1] <= want) { out.push(st[i]); acc += L[i - 1]; continue; }
    const u = (want - acc) / (L[i - 1] || 1e-6);
    out.push([st[i - 1][0] + (st[i][0] - st[i - 1][0]) * u, st[i - 1][1] + (st[i][1] - st[i - 1][1]) * u]);
    break;
  }
  return out;
}
const strokeLen = (st) => st.reduce((a, p, i) => (i ? a + Math.hypot(p[0] - st[i - 1][0], p[1] - st[i - 1][1]) : 0), 0);

// ------------------------------------------------------------ layout
// The banner crosses the window; the numerals hang under it; the web is
// strung in the band above it, out to the head and the jambs.

const SLOT = [16, 36, 76, 96];
const bannerY = (x) => 27.5 + 2.0 * Math.sin((Math.PI * (x - 6)) / 116);
const timeY = (i) => bannerY(SLOT[i] + DW / 2) + 1.3;
const slotXY = (i) => [SLOT[i], timeY(i)];

const WEB = { l: 4, r: 124, t: 2.2, b: bannerY(64) - 0.5 };
const HUB = [64, 14];
const NRAY = 12, NRING = 7, R0 = 8, RGAP = 7;
const COLON = [64, 44];

/** A ray's direction (unit), evenly spaced so no thread is dead vertical. */
const U = Array.from({ length: NRAY }, (_, i) => {
  const a = (i + 0.5) * (TAU / NRAY) + 0.3;
  return [Math.sin(a), -Math.cos(a)];
});

const RAYS = U.map(([dx, dy]) => [HUB[0] + dx * 90, HUB[1] + dy * 90]);

/** Clip a segment to the window band, or null. */
function clipSeg(a, b, R) {
  let t0 = 0, t1 = 1;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const p = [-dx, dx, -dy, dy], q = [a[0] - R.l, R.r - a[0], a[1] - R.t, R.b - a[1]];
  for (let i = 0; i < 4; i++) {
    if (!p[i]) { if (q[i] < 0) return null; continue; }
    const r = q[i] / p[i];
    if (p[i] < 0) { if (r > t1) return null; if (r > t0) t0 = r; }
    else { if (r < t0) return null; if (r < t1) t1 = r; }
  }
  return [[a[0] + dx * t0, a[1] + dy * t0], [a[0] + dx * t1, a[1] + dy * t1]];
}

/** The capture spiral: a true orb of concentric rings round the hub, clipped
 *  by the window band, so it reads as a round web strung in a wide frame. */
const SPIRAL = (() => {
  const chords = [];
  const V = [];
  for (let k = 0; k < NRING; k++)
    for (let j = 0; j < NRAY; j++) {
      const r = R0 + k * RGAP;
      V.push([HUB[0] + r * U[j][0], HUB[1] + r * U[j][1]]);
    }
  for (let i = 0; i < V.length - 1; i++) chords.push({ a: V[i], b: V[i + 1], i, ring: Math.floor(i / NRAY) });
  return chords;
})();

/** The outer ring, as much of it as the band shows: the spider's rebuilding run. */
const RIM = (() => {
  const poly = [];
  for (const c of SPIRAL) {
    if (c.ring !== NRING - 1) continue;
    const s = clipSeg(c.a, c.b, WEB);
    if (s) poly.push(s[0], s[1]);
  }
  const cum = [0];
  let tot = 0;
  for (let i = 1; i < poly.length; i++) { tot += Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]); cum.push(tot); }
  return { poly, cum, total: tot };
})();

/** The bead of dew runs the window frame: one lap a minute, at 6 px/s. */
const FRAME_PATH = (() => {
  const pts = [[64, 2], [125, 2], [125, 62], [3, 62], [3, 2], [64, 2]];
  const cum = [0];
  let tot = 0;
  for (let i = 1; i < pts.length; i++) { tot += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); cum.push(tot); }
  return { pts, cum, total: tot };
})();

/** The point at fraction u along a path with a cumulative-length table. */
function atFrac(poly, cum, u, total) {
  const want = ((u % 1) + 1) % 1 * total;
  let i = 1;
  while (i < cum.length - 1 && cum[i] < want) i++;
  const c0 = cum[i - 1], c1 = cum[i];
  const k = c1 > c0 ? (want - c0) / (c1 - c0) : 0;
  return [poly[i - 1][0] + (poly[i][0] - poly[i - 1][0]) * k, poly[i - 1][1] + (poly[i][1] - poly[i - 1][1]) * k];
}

// ------------------------------------------------------------ the spider
// Drawn by hand, not from a sprite: eight jointed legs and a body in two
// lobes — which is what stands where the colon stands. It taps its front
// legs, one after the other, all the while.

/** [base y, knee x, knee y, foot x, foot y] — legs arch up and come down. */
const LEGS = [
  [-1.7, 3.2, -3.2, 2.4, 2.2],
  [-0.5, 3.9, -3.4, 2.6, 2.8],
  [0.7, 3.9, -2.6, 2.6, 2.6],
  [1.9, 3.0, -1.6, 2.2, 2.2],
];

/** A spider centred on (x, y), its legs walking in place. */
function drawSpider(g, x, y, t) {
  for (const s of [1, -1]) {
    LEGS.forEach(([by, kdx, kdy, fdx, fdy], k) => {
      const tap = 0.5 * Math.sin(t * 1.9 + k * 1.25 + (s > 0 ? 0 : 1.1));
      const bx = x + s * 1.1, by2 = y + by;
      const kx = x + s * (1.1 + kdx), ky = by2 + kdy - tap;
      const fx = kx + s * fdx, fy = ky + fdy + tap;
      plotPoly(g, [[bx, by2], [kx, ky], [fx, fy]], 1);
    });
  }
  g.fillCircle(x, y + 2.2, 2.4, 1);
  g.fillCircle(x, y - 2.0, 1.7, 1);
  plotPoly(g, [[x, y - 0.6], [x, y + 0.6]], 1);
  g.pixel(x - 0.7, y - 2.4, 0);
  g.pixel(x + 0.7, y - 2.4, 0);
}

// ------------------------------------------------------------ the schedule

// Minute turn, seconds relative to the boundary.
const M_CUT = -1.35, M_FALL = 1.5, M_GROW = 0.02, M_SPIN = 1.15;
// Hour turn: collapse, rebuild the web, then walk the four numerals out.
const H_CUT = -2.0, H_FALL = 1.2, H_SPIN1 = 1.45, H_DIGIT = 1.30, H_DIG_D = 0.40, H_DIG_STAG = 0.78;

/**
 * What is happening to a strand. Before `cut` it hangs; then it slackens and
 * falls for `fall`; then it is absent; then the spider walks it out over `grow`.
 */
function life(tau, cut, fall, grow, growD) {
  if (tau < cut) return { mode: 'show' };
  if (tau < cut + fall) return { mode: 'fall', f: (tau - cut) / fall };
  if (tau < grow) return { mode: 'hide' };
  if (tau < grow + growD) return { mode: 'grow', f: (tau - grow) / growD };
  return { mode: 'show' };
}

/** A strand falling: it slackens, swings, drops and fades. */
function fallTransform(pts, f, dir) {
  const t = clamp(f, 0, 1);
  const cx = pts[0][0], cy = pts[0][1];
  const ang = dir * 0.5 * ease.inQuad(t) * t;
  const drop = 44 * t * t;
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const out = pts.map(([x, y]) => {
    const dx = x - cx, dy = y - cy;
    return [cx + dx * ca - dy * sa, cy + dx * sa + dy * ca + drop];
  });
  const level = t < 0.72 ? 1 : clamp((1 - t) / 0.28, 0, 1);
  return { pts: out, level };
}

/** The life of each stroke of the numeral in slot `i` on the current event. */
function digitLives(kind, tau, i, strokes) {
  const lens = strokes.map(strokeLen);
  const total = lens.reduce((a, b) => a + b, 0) || 1;
  let cum = 0;
  return strokes.map((st, k) => {
    const off = cum / total;
    cum += lens[k];
    if (kind === 'hour') return life(tau, H_CUT + k * 0.06, H_FALL, H_DIGIT + i * H_DIG_STAG + off * H_DIG_D * 0.5, H_DIG_D);
    return life(tau, M_CUT + k * 0.10, M_FALL, M_GROW + off * M_SPIN * 0.55, M_SPIN * 0.7);
  });
}

// ------------------------------------------------------------ drawing

/** One strand of a numeral, in whatever state of its life it is in. */
function drawStrand(g, st, x0, y0, lf) {
  if (lf.mode === 'hide') return;
  if (lf.mode === 'fall') {
    const dir = (Math.floor(x0) % 2 ? 1 : -1);
    const r = fallTransform(blown(sagPts(st.map(([x, y]) => [x0 + x, y0 + y])), 0.45), lf.f, dir);
    thickPoly(g, r.pts, 2.8, r.level);
    return;
  }
  const part = lf.mode === 'grow' ? partialStroke(st, lf.f) : st;
  if (part.length < 2) return;
  thickPoly(g, blown(sagPts(part.map(([x, y]) => [x0 + x, y0 + y])), 0.45), 2.8, 1);
}

/** Knots and beads on a numeral, appearing behind the spider as it walks. */
function drawMarks(g, d, x0, y0, lives) {
  const strokes = GLYPH[d];
  const beaded = new Set(BEADED[d] ?? []);
  strokes.forEach((st, si) => {
    const lf = lives[si];
    if (lf.mode !== 'show' && lf.mode !== 'grow') return;
    const seen = lf.mode === 'show' ? 1 : lf.f;
    const L = strokeLen(st) || 1;
    const closed = st.length > 2 && st[0][0] === st.at(-1)[0] && st[0][1] === st.at(-1)[1];
    let acc = 0;
    for (let i = 0; i < st.length; i++) {
      if (i) acc += Math.hypot(st[i][0] - st[i - 1][0], st[i][1] - st[i - 1][1]);
      const here = i === 0 ? 0 : acc / L;
      if (lf.mode === 'grow' && here > seen + 0.06) continue;
      const [x, y] = blown([[x0 + st[i][0], y0 + st[i][1]]], 0.45)[0];
      if (!closed && (i === 0 || i === st.length - 1)) tieOff(g, x, y);
      else knot(g, x, y);
    }
    if (si === 0) for (const idx of beaded) {
      if (lf.mode === 'grow' && idx / (st.length - 1) > seen) continue;
      const [vx, vy] = st[Math.min(idx, st.length - 1)];
      const [x, y] = blown([[x0 + vx, y0 + vy]], 0.45)[0];
      bead(g, x, y);
    }
  });
}

/** A strand of the web: hung, falling, hidden or being walked out. */
function webStrand(g, pts, level, lf, dir) {
  if (lf.mode === 'hide') return;
  if (lf.mode === 'fall') { plotPoly(g, fallTransform(blown(pts), lf.f, dir).pts, level * 0.6); return; }
  if (lf.mode === 'grow') {
    const f = lf.f;
    const n = Math.max(2, Math.ceil(pts.length * f));
    plotPoly(g, blown(pts.slice(0, n)), level);
    return;
  }
  plotPoly(g, blown(pts), level);
}

// ------------------------------------------------------------ the design

export default {
  name: 'Spiderweb',
  blurb: 'The time spun into an orb web at dawn: silk numerals tied at knots and beaded with dew, a spider dangling as the colon, the seconds running the rim as a bead of dew.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  driver: 'full',

  frame(g, ctx) {
    const { date, fields: f, oled, night } = ctx;
    const ms = date.getTime();
    const T = ms / 1000;
    const mins = ms / 60000;

    // Burn-in: the whole picture walks a small circle, smoothly.
    ENV.ox = 3.2 * Math.sin((TAU * mins) / 17);
    ENV.oy = 3.2 * Math.sin((TAU * mins) / 23 + 1.1);

    const turnT = Math.round(ms / 60000) * 60000;
    const tau = (ms - turnT) / 1000;
    const newF = clockFields(new Date(turnT));
    const oldF = clockFields(new Date(turnT - 60000));
    const HOUR = newF.m === 0 && tau > -2.6 && tau < 6.6;
    const kind = HOUR ? 'hour' : (tau > -2.1 && tau < 2.4) ? 'minute' : 'none';
    ENV.T = T;
    ENV.gust = kind === 'hour' ? Math.exp(-(((tau - 0.6) / 1.7) ** 2))
      : kind === 'minute' ? 0.26 * Math.exp(-(((tau + 0.5) / 0.85) ** 2)) : 0;

    const oldKey = `${oldF.hh}${oldF.mm}`, newKey = `${newF.hh}${newF.mm}`;

    // -- the window frame: it is also the dial the seconds run ---------
    for (const x of [3, 125])
      for (let y = 3; y < 61; y++) if (dither(y, 3, 0.55)) g.pixel(x + ENV.ox, y, 1);
    for (let x = 3; x <= 125; x++) if (dither(x, 2, 0.5)) g.pixel(x, 2 + ENV.oy, 1);
    for (const y of [61, 62]) for (let x = 2; x <= 125; x++) if (dither(x, y, 0.8)) g.pixel(x, y + ENV.oy, 1);

    // -- the web: radials out to the frame, and the spiral between them -
    RAYS.forEach((a, i) => {
      const s = clipSeg([HUB[0], HUB[1]], a, WEB);
      if (!s) return;
      const lf = HOUR ? life(tau, H_CUT + i * 0.02, H_FALL, 0.1 + i * 0.045, 0.5) : { mode: 'show' };
      if (lf.mode === 'grow') {
        const p = [HUB[0] + (s[1][0] - HUB[0]) * lf.f, HUB[1] + (s[1][1] - HUB[1]) * lf.f];
        webStrand(g, sagPts([[HUB[0], HUB[1]], p], 0.25), 0.6, { mode: 'show' }, 0);
        return;
      }
      webStrand(g, sagPts([[HUB[0], HUB[1]], s[1]], 0.25), 0.58, lf, i % 2 ? 1 : -1);
    });
    for (const c of SPIRAL) {
      const s = clipSeg(c.a, c.b, WEB);
      if (!s) continue;
      const u = c.i / SPIRAL.length;
      const lf = HOUR ? life(tau, H_CUT + 0.3 + u * 0.5, H_FALL, 0.6 + u * 0.9, 0.16) : { mode: 'show' };
      webStrand(g, sagPts(s, 0.7), 0.7 - 0.2 * (c.ring / (NRING - 1)), lf, c.i % 2 ? 1 : -1);
    }

    g.fillWhere((px, py) => ((px - HUB[0] - ENV.ox) ** 2 + (py - HUB[1] - ENV.oy) ** 2 <= 9) ? 0.62 : false, 1,
      [HUB[0] - 4 + ENV.ox, HUB[1] - 4 + ENV.oy, 9, 9]);
    g.fillWhere((px, py) => ((px - HUB[0] - ENV.ox) ** 2 + (py - HUB[1] - ENV.oy) ** 2 <= 1.4) ? true : false, 1,
      [HUB[0] - 3 + ENV.ox, HUB[1] - 3 + ENV.oy, 6, 6]);

    // -- dew on the web ------------------------------------------------
    for (const c of SPIRAL) {
      if (c.b[0] < WEB.l || c.b[0] > WEB.r || c.b[1] < WEB.t || c.b[1] > WEB.b) continue;
      if (!dither(c.i * 7, c.i * 3, 0.15)) continue;
      const lf = HOUR ? life(tau, H_CUT, H_FALL, 1.4 + (c.i / SPIRAL.length) * 1.3, 0.06) : { mode: 'show' };
      if (lf.mode !== 'show') continue;
      const [dx, dy] = disp(c.b[0], c.b[1], 1);
      bead(g, c.b[0] + dx, c.b[1] + dy);
    }

    // -- the banner the time hangs from --------------------------------
    const banner = sagPts([[2.5, bannerY(0)], [64, bannerY(64)], [124.5, bannerY(128)]], 1.3);
    webStrand(g, banner, 0.8, { mode: 'show' }, 0);

    // -- the time ------------------------------------------------------
    for (let i = 0; i < 4; i++) {
      const changing = HOUR || oldKey[i] !== newKey[i];
      const [x0, y0] = slotXY(i);
      const shownD = +((changing && tau < 0) ? oldKey[i] : newKey[i]);
      const strokes = GLYPH[shownD];
      const lives = changing ? digitLives(kind, tau, i, strokes) : strokes.map(() => ({ mode: 'show' }));
      strokes.forEach((st, k) => drawStrand(g, st, x0, y0, lives[k]));
      const hl = lives[0];
      if (hl.mode !== 'hide' && !(hl.mode === 'grow' && hl.f < 0.03)) {
        for (const v of HANG[shownD]) {
          const seg = blown([[x0 + v[0], bannerY(x0 + v[0])], [x0 + v[0], y0 + v[1]]], 0.45);
          if (hl.mode === 'fall') { const r = fallTransform(seg, hl.f, 1); plotPoly(g, r.pts, 0.85 * r.level); }
          else plotPoly(g, seg, 0.85);
        }
      }
      drawMarks(g, shownD, x0, y0, lives);
    }

    // -- the seconds: a bead of dew runs the window frame ---------------
    if (kind !== 'hour') {
      const u = f.sec / 60;
      for (let k = 26; k >= 1; k--) {
        const lv = k < 9 ? 1 : Math.exp(-(k - 9) / 7);
        if (lv < 0.2) continue;
        const [px, py] = atFrac(FRAME_PATH.pts, FRAME_PATH.cum, u - k * 0.0022, FRAME_PATH.total);
        const [ex, ey] = disp(px, py, 1);
        if (dither(k * 5, 0, lv)) g.pixel(px + ex, py + ey, 1);
      }
      const [rx, ry] = atFrac(FRAME_PATH.pts, FRAME_PATH.cum, u, FRAME_PATH.total);
      const [bdx, bdy] = disp(rx, ry, 1);
      const [cx0, cy0] = [rx + bdx, ry + bdy];
      // It hangs on the inside of the frame, where it can be seen.
      const ix = 64 - rx, iy = 32 - ry, il = Math.hypot(ix, iy) || 1;
      bead(g, cx0 + (ix / il) * 1.5, cy0 + (iy / il) * 1.5 - 0.4);
      g.fillCircle(cx0 + (ix / il) * 1.5, cy0 + (iy / il) * 1.5 - 0.9, 1.1, 1);
    }

    // -- a drop lets go of the web every few seconds --------------------
    const dropF = (f.sec % 7) / 7;
    if (dropF < 0.8) {
      const dk = Math.floor(T / 7);
      const slot = Math.floor(noise(dk, 5) * 4) % 4;
      const [x0, y0] = slotXY(slot);
      const strokes = GLYPH[+newKey[slot]];
      const stroke = strokes[Math.floor(noise(dk, 6) * strokes.length) % strokes.length];
      const [vx, vy] = stroke[0];
      const fall = 46 * dropF * dropF;
      const x = x0 + vx, y = y0 + vy + fall;
      if (y < H + 3) bead(g, x + ENV.ox, y + ENV.oy);
      plotPoly(g, blown([[x0 + vx, y0 + vy], [x, y]], 0.3), 0.5);
    }

    // -- the spider ----------------------------------------------------
    const sp = spiderAt(kind, tau, oldKey, newKey);
    const [sdx, sdy] = disp(sp[0], sp[1], 0.45);
    const hang = kind === 'none' || sp[2] !== 'free';
    if (hang) {
      // Its own thread, paid out from the banner.
      plotPoly(g, blown([[sp[0], bannerY(sp[0])], [sp[0], sp[1] - 4.2]], 0.45), 1);
    }
    drawSpider(g, sp[0] + sdx, sp[1] + sdy, T);

    oled.contrast(0xd4 + (0x2a - 0xd4) * night);
  },
};

/** Where the spider is: hanging at the colon, or out walking the numeral. */
function spiderAt(kind, tau, oldKey, newKey) {
  if (kind === 'none') return [COLON[0] + 1.4 * Math.sin(ENV.T * 1.15), COLON[1] + 0.8 * Math.cos(ENV.T * 1.7)];
  if (kind === 'hour') {
    if (tau < 0) return [COLON[0], COLON[1]];
    if (tau < H_SPIN1) {
      const [px, py] = atFrac(RIM.poly, RIM.cum, tau / H_SPIN1, RIM.total);
      return [px, py, 'free'];
    }
    for (let i = 0; i < 4; i++) {
      const lives = digitLives('hour', tau, i, GLYPH[+newKey[i]]);
      const k = lives.findIndex((l) => l.mode === 'grow');
      const [x0, y0] = slotXY(i);
      if (k >= 0) { const p = partialStroke(GLYPH[+newKey[i]][k], lives[k].f).at(-1); return [x0 + p[0], y0 + p[1] - 2, 'free']; }
      if (lives.some((l) => l.mode === 'show')) continue;
      const bl = H_DIGIT + i * H_DIG_STAG;
      if (tau < bl) {
        const k2 = ease.inOutQuad(clamp((tau - H_SPIN1) / (bl - H_SPIN1), 0, 1));
        return [64 + (x0 - 6 - 64) * k2, WEB.b + (y0 - 4 - WEB.b) * k2, 'free'];
      }
    }
    const [x0] = slotXY(3);
    const last = GLYPH[+newKey[3]].at(-1);
    const k = ease.inOutQuad(clamp((tau - (H_DIGIT + 3 * H_DIG_STAG + H_DIG_D)) / 1.1, 0, 1));
    return [x0 + last[0] + (COLON[0] - x0 - last[0]) * k, slotXY(3)[1] + last[1] + (COLON[1] - slotXY(3)[1] - last[1]) * k];
  }
  // minute turn: up the thread, along the banner, work, and back
  const step = newKey[3] !== oldKey[3] ? 3 : 2;
  const [x0, y0] = slotXY(step);
  const d = +((tau < 0) ? oldKey[step] : newKey[step]);
  const [hx, hy] = HANG[d][0];
  const ax = x0 + hx, ay = bannerY(ax);
  if (tau < -2.0) return [COLON[0], COLON[1]];
  if (tau < 0) {
    const k = clamp((tau + 2.0) / 1.45, 0, 1);
    if (k < 0.34) {
      const kk = ease.inOutQuad(k / 0.34);
      return [COLON[0], COLON[1] + (ay - 2 - COLON[1]) * kk];
    }
    const kk = ease.inOutQuad((k - 0.34) / 0.66);
    return [64 + (ax - 64) * kk, ay - 2, 'free'];
  }
  const lives = digitLives('minute', tau, step, GLYPH[d]);
  const k = lives.findIndex((l) => l.mode === 'grow');
  if (k >= 0) { const p = partialStroke(GLYPH[d][k], lives[k].f).at(-1); return [x0 + p[0], y0 + p[1] - 2, 'free']; }
  if (!lives.some((l) => l.mode === 'show')) return [ax, ay - 2, 'free'];
  const back = ease.inOutQuad(clamp((tau - (M_GROW + M_SPIN)) / 1.0, 0, 1));
  if (back < 0.34) return [ax + (64 - ax) * (back / 0.34), ay - 2, 'free'];
  const kk = (back - 0.34) / 0.66;
  return [COLON[0], (ay - 2) + (COLON[1] - (ay - 2)) * kk];
}
