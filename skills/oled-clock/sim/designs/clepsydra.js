// Clepsydra — an ancient water clock, seen in section.
//
// The time is not written on the wall: it is *cut* into it. Each numeral is a
// channel carved in the stone, and water runs through the channel. What is
// lit is water. A water clock keeps its rate by holding a constant head: a
// stone launder (the constant-head trough) runs across the head of the wall,
// and notches in its lip feed the four numerals and the colon; everything the
// numerals do not drink runs down the wall into the basin at the foot, which
// brims and sheets away at the right.
//
// So the letterforms are the watercourse. A strand is a groove about five
// pixels wide, full of water: the lamp catches its upper surface and its
// underside goes into shadow, so every stroke reads as a rounded thread of
// liquid, and the water is never still — it swells and thins along the cut
// and a wave works its way down it once a second. Water enters each numeral
// at the top of its cut and finds its way to the outlet at the foot, where it
// lets go and falls into the basin with a ripple, so the basin is struck four
// times a second and the water table never holds still.
//
// The minute is the redistribution of the flow. From :58.2 the water is shut
// off from each numeral that is about to change; what is in the groove runs
// out of the bottom and the channel empties from the top down, a bright film
// clinging to the retreating edge. The stone shows its dry cut for a beat,
// and then the next surge arrives at the top and fills the *new* numeral,
// strand by strand, from the entry to the outlet — a second of water finding
// its way through a shape it has not run through before. Each changing digit
// does this in turn, ones first, so a minute turn is a right-to-left relay of
// grooves going dry and filling.
//
// The hour is the constant head giving way. The flow into the numerals stops
// and they drain to bare stone. The launder brims, overspills, and a sheet of
// water falls the whole height of the glass; the new hour is not written but
// *washed* in — the water takes the new cut as it comes down, so the numerals
// reappear top-down behind the falling sheet, and the basin surges with all
// the water the hour brought. The sheet thins to threads, threads to beads,
// and beads hang off the cuts and drop.
//
// Every frame is a closed-form function of the wall clock: a slot's surge
// phase is frac(t), the minute turn is scheduled backwards from :00, the hour
// from the same fields. `frame` remembers nothing between calls.
//
// Burn-in: the whole watercourse walks a 3 px orbit every two minutes, the
// water is always moving, and 23:00-07:00 the panel runs at low contrast
// through ctx.night.

import { dither, clamp, ease, orbit, clockFields, previousMinute, sprite } from '../js/kit.js';

const TAU = Math.PI * 2;
const W = 128, H = 64;

// ------------------------------------------------------------ the water table

const HW = 2.62;                 // half-width of a cut, px
const SLUG = 13;                 // px between the crests of the wave in a cut
const DW = 24, DH = 36;          // the cut's box
const TOP = 11;                  // top of the boxes on the glass
const SLOT_X = [3, 33, 70, 101]; // left edge of each box
const MID_X = 64;                // the colon

const LIP = 5;                   // the launder's lower lip (water spills from here)
const LSURF = 2;                 // the launder's water surface
const BASIN = 51;                // the basin's water surface at the foot

// The colon: a thread from the spout's mouth to the basin, carrying two beads
// at all times and delivering one a second — so the two beads *are* the dots.
const MOUTH = 17;
const COLON_LEN = BASIN - MOUTH;  // 1/2 px per frame: one bead a second

// Every slot's surge is on a fixed one-second cycle, arriving at the outlet at
// these instants (seconds past the turn, staggered 0.1 s left to right) so a
// minute turn is a cascade and the basin is struck on the same beat all day.
const ARRIVE = [-0.3, -0.2, -0.1, 0];
const DRAIN = 0.55;              // a cut takes this long to run dry
const GAP = 0.2;                 // dry stone between the drain and the new water

// The hour: drain everything, brim, wash the new time in, drip dry.
const H_DRAIN = [-2.4, -1.5];
const H_BRIM = [-1.5, -0.9];
const H_FALL = [-0.85, 0.45];
const H_DRIP = [0.45, 3.2];
const FALL_V = 75;               // how fast the spate comes off the lip, px/s
const POUR = 0.35;               // how long the trough goes on spilling

// ------------------------------------------------------------ small maths

const SIN = new Float32Array(1024);
for (let i = 0; i < 1024; i++) SIN[i] = Math.sin((TAU * i) / 1024);
/** sin of a phase in turns, from a table: the washes are per-pixel. */
const tsin = (turns) => SIN[((turns * 1024) | 0) & 1023];

const clamp01 = (u) => (u < 0 ? 0 : u > 1 ? 1 : u);
const smooth = (u) => { u = clamp01(u); return u * u * (3 - 2 * u); };
const frac = (u) => ((u % 1) + 1) % 1;

/** A good integer hash, as a float in [0,1). */
function hash(x, y, s) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// ------------------------------------------------------------ letterforms
//
// Each numeral is a set of centre-lines in a DW x DH box: the cuts a mason
// would chase, with gouged round ends and a swell through the bends. Every one
// is drawn with the flow in mind — water enters at the top of the cut and
// finds its way down to the outlet at the foot.

/** Elliptical arc as points, clock angles in degrees (0 = up, clockwise). */
function ellD(cx, cy, rx, ry, a0, a1, n = 24) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = (((a0 + ((a1 - a0) * i) / n)) * Math.PI) / 180;
    pts.push([cx + rx * Math.sin(a), cy - ry * Math.cos(a)]);
  }
  return pts;
}

/** Catmull-Rom through control points: a hand-chased curve, not a polygon. */
function spline(pts, n = 7) {
  if (pts.length < 3) return pts.map((p) => p.slice());
  const P = [pts[0], ...pts, pts[pts.length - 1]];
  const out = [];
  for (let i = 1; i < P.length - 2; i++) {
    const p0 = P[i - 1], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2];
    for (let k = 0; k < n; k++) {
      const u = k / n, u2 = u * u, u3 = u2 * u;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * u + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * u2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * u3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * u + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * u2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * u3),
      ]);
    }
  }
  out.push(pts[pts.length - 1].slice());
  return out;
}

const SKEL = {
  0: [ellD(12, 18, 8.6, 14.4, 0, 360, 44)],
  1: [spline([[4.2, 11.6], [11.6, 4.2], [11.6, 30.6]]), spline([[5.4, 31.6], [18.6, 31.6]])],
  2: [spline([[3.2, 15], [3.6, 8.4], [8.8, 3.9], [15.6, 3.9], [20.6, 8.4], [20.9, 14], [16.4, 20], [9, 26.4], [3.8, 31], [3.1, 32.6], [9, 32.1], [15, 31.6], [20.9, 32.4]])],
  3: [spline([[3.4, 7.2], [7, 3.9], [13.2, 3.8], [18.6, 6.6], [19.6, 11], [16.6, 15.4], [11.4, 17.5], [16.4, 19.4], [20.6, 24.6], [19.4, 30.6], [13.8, 33.4], [6.8, 33], [3.2, 29]])],
  4: [spline([[16.8, 3.8], [4, 24], [20.8, 24]]), spline([[16.8, 3.8], [16.8, 32.4]])],
  5: [spline([[19.8, 4], [6.4, 4], [5, 15], [9, 13.6], [14, 14.1], [19.2, 18], [20.6, 23.6], [17.6, 30], [12.4, 33.2], [5.8, 32.6], [3, 28.4]])],
  6: [spline([[7.3, 20], [3.8, 13.4], [7.4, 6.6], [13.8, 4.4], [18.8, 7.6]]), ellD(12.5, 25.2, 7.4, 7.4, 0, 360, 30)],
  7: [spline([[3.4, 4], [20.8, 4], [9.6, 32.4]]), spline([[8.4, 20.4], [16.6, 20.4]])],
  8: [ellD(12, 10.4, 6.4, 7, 0, 360, 26), ellD(12, 25.4, 7.4, 8.2, 0, 360, 30)],
};
SKEL[9] = SKEL[6].map((path) => path.map(([x, y]) => [DW - x, DH - y]));

// Where each cut opens and closes: the water enters at the top of the stone
// (a flared mouth, where the trickle falls in) and leaves at the foot (a
// pinched lip, where the bead hangs before it drops).
const YTOP = 3.8, YBOT = 33.4;
const widthAt = (y) => HW
  * clamp(1 + 0.10 * smooth((YTOP + 5 - y) / 5) - 0.34 * smooth((y - (YBOT - 7)) / 7), 0.6, 1.2);

const CHANNELS = new Map();

/**
 * A numeral as a carved channel: which pixels are cut, the geodesic distance
 * from the entry at the top (so a surge travels the cut the way water does),
 * the distance from the cut's centre (0 middle, 1 wall), the meniscus, and the
 * outlet — the far end, where the water leaves it.
 */
function channel(d) {
  let C = CHANNELS.get(d);
  if (C) return C;
  const N = DW * DH;
  const mask = new Uint8Array(N);       // the whole cut in the stone
  const rad = new Float32Array(N);      // how far the pixel is from the cut's line
  const nx = new Float32Array(N);       // which way the cut's wall faces, so the
  const ny = new Float32Array(N);       // water's light does not depend on a stroke
  const wref = new Float32Array(N);     // the cut's half-width there
  const dep = new Float32Array(N).fill(1e9);
  let minY = DH, maxY = 0;

  for (let j = 0; j < DH; j++) {
    for (let i = 0; i < DW; i++) {
      const px = i + 0.5, py = j + 0.5;
      let best = 1e9, gx = 0, gy = 0;
      for (const path of SKEL[d]) {
        for (let s = 1; s < path.length; s++) {
          const ax = path[s - 1][0], ay = path[s - 1][1], bx = path[s][0], by = path[s][1];
          const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
          const u = l2 ? clamp01(((px - ax) * dx + (py - ay) * dy) / l2) : 0;
          const ex = px - ax - u * dx, ey = py - ay - u * dy;
          const e = Math.hypot(ex, ey);
          if (e < best) { best = e; gx = ex; gy = ey; }
        }
      }
      const k = j * DW + i;
      rad[k] = best;
      if (best > 0.4) { nx[k] = gx / best; ny[k] = gy / best; }
      wref[k] = widthAt(py);
      if (best <= wref[k]) { mask[k] = 1; if (j < minY) minY = j; if (j > maxY) maxY = j; }
    }
  }

  // The rim of the cut: a pixel on its edge.
  const edge = new Uint8Array(N);
  for (let j = 0; j < DH; j++)
    for (let i = 0; i < DW; i++) {
      const k = j * DW + i;
      if (!mask[k]) continue;
      if (i === 0 || j === 0 || i === DW - 1 || j === DH - 1
        || !mask[k - 1] || !mask[k + 1] || !mask[k - DW] || !mask[k + DW]) edge[k] = 1;
    }

  // Distance from the entry (the top row of the cut), chamfered through it.
  for (let i = 0; i < DW; i++) if (mask[minY * DW + i]) dep[minY * DW + i] = 0;
  const put = (k, kk, w) => { if (mask[k] && dep[kk] + w < dep[k]) dep[k] = dep[kk] + w; };
  for (let j = minY + 1; j <= maxY; j++)
    for (let i = 0; i < DW; i++) {
      const k = j * DW + i;
      if (!mask[k]) continue;
      put(k, k - DW, 1);
      if (i > 0) { put(k, k - DW - 1, 1.414); put(k, k - 1, 1); }
      if (i < DW - 1) put(k, k - DW + 1, 1.414);
    }
  for (let j = maxY - 1; j >= minY; j--)
    for (let i = DW - 1; i >= 0; i--) {
      const k = j * DW + i;
      if (!mask[k]) continue;
      put(k, k + DW, 1);
      if (i < DW - 1) { put(k, k + DW + 1, 1.414); put(k, k + 1, 1); }
      if (i > 0) put(k, k + DW - 1, 1.414);
    }

  let max = 0, exit = minY * DW;
  for (let k = 0; k < N; k++) if (mask[k] && dep[k] > max && dep[k] < 1e9) { max = dep[k]; exit = k; }
  for (let k = 0; k < N; k++) if (mask[k] && dep[k] >= 1e9) dep[k] = max;

  let entryX = 0;
  for (let i = 0; i < DW; i++) if (mask[minY * DW + i]) { entryX = i; break; }

  C = { mask, rad, nx, ny, wref, edge, dep, max, entryX, exitX: exit % DW, exitY: (exit / DW) | 0, minY };
  CHANNELS.set(d, C);
  return C;
}

// ------------------------------------------------------------ drawing a cut

/**
 * Draw a numeral's channel. `wet(rel, x, y)` is 0..1: how much water is at a
 * point `rel` of the way from the entry to the outlet, at glass (x, y).
 * `u` is the surge's position along that same path, or -1 for none.
 */
function drawCut(g, d, x0, y0, wet, u, t, k, edgeRel) {
  const C = channel(d);
  const { mask, rad, nx, ny, wref, edge, dep, max } = C;
  for (let j = 0; j < DH; j++) {
    const y = y0 + j;
    if (y < 0 || y >= H) continue;
    for (let i = 0; i < DW; i++) {
      const k = j * DW + i;
      if (!mask[k]) continue;
      const x = x0 + i;
      if (x < 0 || x >= W) continue;
      const rel = dep[k] / max;
      const wv = wet(rel, x, y);
      if (wv <= 0) continue;
      // Water will not run evenly down a cut: it gathers into a body that
      // bulges where it is deepest, and the bulge travels the whole channel in
      // a second, so a wave of water is always working its way from the mouth
      // to the lip. Between the bulges the thread runs thin.
      const su = frac(rel - (t - ARRIVE[k]));
      const swell = (1.10 - 0.30 * rel) * (1 + 0.36 * Math.exp(-(((su - 0.5) / 0.16) ** 2)));
      if (rad[k] > wref[k] * swell) continue;
      // Water lying in a cut is a ridge of liquid: the light falls on its
      // upper surface and the underside goes to shadow, so the strand reads as
      // round however the stroke runs across the wall.
      let lv = 0.9;
      const up = -ny[k];
      if (up > 0.45) lv = 1;
      else if (up < -0.45) lv = 0.46;
      if (edgeRel >= 0 && Math.abs(rel - edgeRel) < 0.05) lv = 0.95;  // a retreating film
      if (dither(x, y, clamp01(lv) * wv)) g.pixel(x, y, 1);
    }
  }
}

/** Where a cut's outlet is on the glass, for the drip below it. */
const outletX = (d, x0) => x0 + channel(d).exitX + 0.5;

// ------------------------------------------------------------ the water table

/** The launder: a trough cut across the head of the wall, holding a steady flow. */
function drawLaunder(g, t, brim, oy) {
  // It brims on the hour: the head of water rises, and spills over the lip.
  const lip = LIP + oy;
  for (let x = 0; x < W; x++) {
    const surf = Math.round(LSURF + oy - brim * 2.4
      + 0.5 * tsin(x / 16 - t * 1.3) + 0.3 * tsin(x / 6.1 + t * 2.2));
    // A stream running along the head of the wall: a bright surface, the water
    // under it, and now and then a crest that breaks the line as it passes.
    const crest = frac((x - t * 34) / 23);
    g.pixel(x, surf + 1);
    if (crest < 0.9) g.pixel(x, surf);
    // The stone it runs over: a notched lip, where the water leaves it. As the
    // trough brims on the hour the water goes over the whole lip at once and
    // hangs off it in a swelling roll before it lets go.
    if (x % 4 < 3) g.pixel(x, lip);
    else if (x % 4 === 3) g.pixel(x, lip + 1);
    if (brim > 0.05) {
      const b2 = Math.round(brim * 2.2);
      for (let d = 1; d <= b2; d++) if (dither(x, lip + d, 0.85 - d * 0.2)) g.pixel(x, lip + d);
    }
  }
}

/** A trickle from a notch in the launder's lip down into the top of a cut. */
function drawTrickle(g, x, y0, y1, t, k) {
  for (let y = y0; y <= y1; y++) {
    const wob = Math.round(0.5 * tsin(y / 6 - t * 1.4 + k * 0.3));
    const wide = y > y1 - 2;
    for (let dx = wide ? -1 : 0; dx <= (wide ? 1 : 0); dx++) {
      const lv = dx === 0 ? 0.9 : 0.4;
      if (dither(Math.round(x) + dx + wob, y, lv)) g.pixel(Math.round(x) + dx + wob, y);
    }
  }
}

/** A bead in flight, round at the head: the colon's dots are these, falling. */
const BEAD = sprite(`
  .##.
  ####
  ####
  .##.
`);

/**
 * The water leaving a cut's lip: a bead gathers at the stone for most of the
 * second, then lets go and falls to the basin. `ph` is the fraction of the
 * second since the last one fell, so the drop is a clock as well.
 */
function drawDrop(g, x, yLip, ph, surf) {
  const yl = Math.round(yLip);
  if (ph < 0.26) {
    const y = yl + 1 + 0.5 * 900 * ph * ph;
    if (y >= surf - 0.5) { if (y < surf + 6) g.fillCircle(Math.round(x), Math.round(y), 1.6, 1); return; }
    g.fillCircle(Math.round(x), Math.round(y), 1.7, 1);
    if (ph < 0.15) g.pixel(x, y - 3);          // the thread it stretched from
    return;
  }
  const k = clamp((ph - 0.3) / 0.7);
  const r = 1.0 + 1.6 * k;
  g.fillCircle(Math.round(x), Math.round(yl + 1 + r), r, 1);
  const neck = Math.round(3 - 2.6 * k);        // the neck it will break at
  if (neck > 0) g.vline(Math.round(x), yl + 1, neck, 1);
}

// ------------------------------------------------------------ the basin

/**
 * The basin at the foot: everything the cuts and the colon have passed. The
 * surface is a bright meniscus; under it the water fades down into the dark,
 * so the pool reads as deep and the glass stays black. Landing beads ripple it.
 */
function drawBasin(g, t, surf) {
  const ys = Math.round(surf);
  const wobble = (x) => 0.5 * tsin(x / 21 - t * 0.5) + 0.6 * tsin(x / 7.3 + t * 1.3);
  // What stands above the water lies in it: the digits are reflected, ripple
  // by ripple, and fade with depth a few pixels down.
  for (let x = 0; x < W; x++) {
    const dx = Math.round(1.7 * tsin(x / 11 - t * 0.9) + 1.0 * tsin(x / 4.3 + t * 1.7));
    for (let d = 1; d < 7; d++) {
      const y = ys + 1 + d;
      if (y >= H) break;
      if (g.get(x + dx, ys - d) && dither(x, y, 0.9 - 0.11 * d)) g.pixel(x, y);
    }
  }
  // The meniscus itself: a line of light, dipping where the crests run through.
  for (let x = 0; x < W; x++) {
    const y = ys + Math.round(wobble(x) + 0.9 * (frac((x - t * 20) / 17) - 0.5));
    g.pixel(x, y);
    if (frac((x - t * 20) / 17) > 0.6) g.pixel(x, y + 1);
  }
  // The overflow at the right edge: the trough keeps its head by spilling away
  // in a thin broken fall, which never lights the same glass twice.
  for (let y = ys - 1; y < H; y++) {
    const ph = (y + t * 34) % 9;
    if (ph < 3 + (hash(127, y, 5) > 0.6 ? 2 : 0)) { g.pixel(126, y); g.pixel(127 - (ph < 1.6 ? 1 : 0), y); }
  }
}

/** Ripples: thin rings lying flat on the basin, from each bead that lands. */
function drawRipples(g, impacts, surf) {
  const cy = surf + 1.2;
  for (const im of impacts) {
    const life = 0.85;
    if (im.age > life) continue;
    const r = im.age * 19, a = 1 - im.age / life;
    if (r < 1.4) continue;
    const off = Math.round(im.x) & 1;
    for (let px = Math.ceil(im.x - r); px <= im.x + r; px++) {
      const dx = px - im.x, e = 1 - (dx * dx) / (r * r);
      if (e <= 0) continue;
      const dy = 0.4 * r * Math.sqrt(e);
      if (a < 0.55 && ((px + off) & 1)) continue;   // the last of it breaks up
      const y0 = cy - dy, y1 = cy + dy;
      if (y0 >= surf - 1) g.pixel(px, y0);
      if (y1 <= H - 1) g.pixel(px, y1);
    }
  }
}

// ------------------------------------------------------------ the water's turn

const digitsOf = (fl) => [...`${fl.hh}${fl.mm}`].map(Number);

/**
 * One slot's minute: which digit it is showing, how wet the cut is, and where
 * its surge has got to. `changed` when this digit is not the one it was.
 */
function slot(k, changed, tau, t, a, b, hour, front, gate) {
  const arrive = ARRIVE[k];
  const u = frac(t - arrive);
  if (hour) {
    if (tau < H_DRAIN[0]) return { d: a[k], wet: () => 1, u, edgeRel: -1 };
    if (tau < H_FALL[0]) {
      const k2 = ease.inOutQuad(clamp01((tau - H_DRAIN[0]) / (H_DRAIN[1] - H_DRAIN[0])));
      return { d: a[k], wet: drain(k2), u: -1, edgeRel: k2 };
    }
    if (tau < H_DRIP[1]) {
      // The sheet is the water arriving: it wets everything it has passed.
      return { d: b[k], wet: (rel, x, y) => (y < front ? 1 : 0), u: -1, edgeRel: -1 };
    }
    return { d: b[k], wet: () => 1, u, edgeRel: -1 };
  }
  if (!changed) return { d: b[k], wet: () => 1, u, edgeRel: -1 };
  // When two digits turn over together (09 -> 10) neither may be filled while
  // the other still shows what it was: every cut that is changing runs dry
  // first, and the new water is let in only once they all have.
  const start = Math.max(arrive - 1, gate + GAP);
  const end = start + 1;
  const dFrom = start - GAP - DRAIN;
  if (tau < dFrom) return { d: a[k], wet: () => 1, u, edgeRel: -1 };
  if (tau < start - GAP) {
    const k2 = ease.inOutQuad((tau - dFrom) / DRAIN);
    return { d: a[k], wet: drain(k2), u: -1, edgeRel: k2 - 0.03, pour: k2 };
  }
  if (tau < end) {
    const fu = clamp01((tau - start) / (end - start));
    return { d: b[k], wet: (rel) => smooth((fu - rel) / 0.1), u: fu, edgeRel: -1 };
  }
  return { d: b[k], wet: () => 1, u, edgeRel: -1 };
}

/**
 * The water running out of a cut. The supply is cut off, so what is in the
 * groove keeps going: the channel shows dry stone from the mouth down, the
 * water that is left sliding out of the lip — and thinning as it goes, so a
 * groove half-emptied reads as moving water, not as another numeral.
 */
function drain(k) {
  const back = k * 1.06 - 0.03;
  const thin = 1 - 0.45 * k;
  return (rel) => smooth((rel - back) / 0.13) * thin;
}

// ------------------------------------------------------------ the hour: a spate

/** How far down the glass the falling sheet has reached. */
const sheetFront = (tau) => LIP + Math.max(0, tau - H_FALL[0]) * FALL_V;
/** The tail of the spate: the last water the trough let go. */
const sheetTail = (tau) => LIP + Math.max(0, tau - H_FALL[0] - POUR) * FALL_V;

/** The sheet of water falling the whole face, with spray in front of it. */
function drawSheet(g, front, tau) {
  const env = smooth((tau - H_FALL[0]) / 0.22) * (1 - smooth((tau - (H_FALL[1] + 0.15)) / 0.7));
  if (env <= 0) return;
  const tail = sheetTail(tau);
  for (let x = 0; x < W; x++) {
    // A curtain of falling threads: each one hangs a little lower than the
    // last, so the band has a ragged top and a bright ragged head below.
    const h = hash(x, 1, 9);
    const y1 = Math.min(H, front + 3 * h);
    const y0 = Math.max(0, tail - 5 * (1 - h));
    for (let y = Math.floor(y0); y < y1; y++) {
      const u = (y - y0) / Math.max(1, front - y0);       // 0 head of the column, 1 its tail
      const lv = env * (0.9 - 0.45 * u) * (0.6 + 0.55 * hash(x, y, 5));
      if (dither(x, y + ((y >> 2) & 3), clamp01(lv))) g.pixel(x, y);
    }
    // The head: the brightest edge of the falling water, and spray below it.
    const yh = Math.round(Math.min(H - 1, front + 3 * h));
    if (hash(x, 8, 11) > 0.15) g.pixel(x, yh);
    for (let k = 1; k <= 3; k++) {
      const ty = yh + k * k + 1;
      if (ty < H && hash(x, 100 + k, 13) > 0.5 + k * 0.13) g.pixel(x, ty);
    }
  }
}

/** Beads shaken off the cuts once the sheet has gone: the face dripping dry. */
function drawAfterDrips(g, tau, surf, ox, oy) {
  if (tau < H_DRIP[0] || tau > H_DRIP[1]) return;
  for (let k = 0; k < 4; k++) {
    const C = channel(0);
    for (let n = 0; n < 4; n++) {
      const t0 = H_DRIP[0] + 0.12 * k + 0.62 * n + hash(k, n, 21) * 1.1;
      const age = tau - t0;
      if (age < 0 || age > 0.75) continue;
      const x = SLOT_X[k] + ox + 3 + hash(k, n, 22) * (DW - 6);
      const y = TOP + oy + C.minY + 3 + hash(k, n, 23) * (DH - 10) + 0.5 * 620 * age * age;
      if (y < surf + 1) g.pixel(x, y);
    }
  }
}

// ------------------------------------------------------------ the design

export default {
  name: 'Clepsydra',
  blurb: 'An ancient water clock in section: the numerals are channels cut in stone, and the time is the water running through them — a bead a second out of every cut, a spout dripping the colon, and at the hour a sheet that washes the new time down the wall.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  driver: 'full',

  frame(g, { fields: f, date, oled, night }) {
    const t = date.getTime() / 1000;
    const [ox, oy] = orbit(date, 3, 2);
    const late = f.sec >= 47;
    const A = late ? f : previousMinute(date);
    const B = late ? clockFields(new Date(date.getTime() + 60000)) : f;
    const tau = late ? f.sec - 60 : f.sec;
    const hour = B.m === 0;
    const a = digitsOf(A), b = digitsOf(B);

    // The spate: the basin takes the hour's water, brims and gives it back.
    const tide = hour ? clamp01(smooth((tau - H_BRIM[0]) / 1.6) * (1 - smooth((tau - (H_FALL[1] + 2.2)) / 3.4))) : 0;
    const brim = hour ? smooth((tau - H_BRIM[0]) / 1.1) * (1 - smooth((tau - H_FALL[0] - 0.2) / 0.5)) : 0;
    const surf = BASIN + oy - 3.6 * tide;
    const front = sheetFront(tau);

    drawLaunder(g, t, brim, oy);

    // ---- the four cuts. `gate` is the instant every cut that is changing has
    // finished running dry: no new water is let in before it.
    let gate = -1e9;
    for (let k = 0; k < 4; k++) if (a[k] !== b[k]) gate = Math.max(gate, ARRIVE[k] - 1 - GAP);
    const sts = [0, 1, 2, 3].map((k) => slot(k, a[k] !== b[k], tau, t, a, b, hour, front, gate));
    for (let k = 0; k < 4; k++) {
      const st = sts[k];
      const x0 = SLOT_X[k] + ox, y0 = TOP + oy;
      drawCut(g, st.d, x0, y0, st.wet, st.u, t, k, st.edgeRel);
      // The trickle from the launder into the top of the cut, while it runs.
      const C = channel(st.d);
      const dry = hour && tau >= H_DRAIN[0] && tau < H_FALL[0];
      if (!dry && !(hour && tau >= H_FALL[0] && tau < H_FALL[1])) {
        drawTrickle(g, x0 + C.entryX + 0.5, LIP + oy + 1, y0 + C.minY + 1, t, k);
      }
    }

    // ---- the colon: the spout's thread, two beads falling as the two dots
    const cx = MID_X + ox;
    {
      const x = Math.round(cx);
      for (let y = MOUTH + oy; y < surf + 1; y++) if (dither(x, y, 0.6)) g.pixel(x, y);
      for (let m = 0; m < 2; m++) {
        const y = MOUTH + oy + frac(t + m * 0.5) * COLON_LEN;
        if (y < surf + 1) g.blit(BEAD, x - 2, Math.round(y) - 2, {});
      }
    }

    // ---- the basin, its ripples, and the beads still in the air above it
    const impacts = [];
    if (!hour || tau >= H_DRIP[0]) {
      for (let k = 0; k < 4; k++) {
        const d = hour ? b[k] : tau < 0 ? a[k] : b[k];
        impacts.push({ x: outletX(d, SLOT_X[k] + ox), age: frac(t - ARRIVE[k]), r0: 0 });
      }
    }
    impacts.push({ x: cx, age: frac(t), r0: 0 });
    if (hour && tau > H_FALL[0] && tau < H_DRIP[1]) {
      for (let k = 0; k < 4; k++) impacts.push({ x: SLOT_X[k] + ox + DW / 2, age: frac(t + k * 0.17), r0: 0 });
    }
    // A cut that is running out pours instead of dripping: the whole channel
    // empties into the basin in a stream, so the pool is struck while it goes.
    const falling = [];
    if (!hour) {
      for (let k = 0; k < 4; k++) {
        const C = channel(sts[k].d);
        const x = outletX(sts[k].d, SLOT_X[k] + ox), yTop = TOP + oy + C.exitY;
        if (sts[k].pour !== undefined) {
          falling.push({ k, x, yTop, w: Math.max(1, Math.round(3.2 * (1 - sts[k].pour))) });
          impacts.push({ x, age: 0.3 + 0.55 * sts[k].pour, r0: 0 });
        }
      }
    }
    drawBasin(g, t, surf);
    drawRipples(g, impacts, surf);
    if (!hour) {
      for (let k = 0; k < 4; k++) {
        const f2 = falling.find((v) => v.k === k);
        const x = outletX(sts[k].d, SLOT_X[k] + ox), yTop = TOP + oy + channel(sts[k].d).exitY;
        if (f2) {
          for (let y = yTop + 1; y < surf; y++) {
            const sway = Math.round(1.1 * tsin((y - yTop) / 19 - t * 1.1 + k));
            for (let dx = -f2.w; dx <= f2.w; dx++) {
              const lv = dx === 0 ? 1 : 0.55;
              if (dither(y * 3 + dx * 5, k, lv)) g.pixel(x + sway + dx, y);
            }
          }
        } else {
          drawDrop(g, x, yTop, frac(t - ARRIVE[k]), surf);
        }
      }
    }

    // ---- the spate, over everything
    if (hour && tau >= H_FALL[0]) drawSheet(g, front, tau);
    if (hour) drawAfterDrips(g, tau, surf, ox, oy);

    oled.contrast(0xcf + (0x1c - 0xcf) * night);
  },
};
