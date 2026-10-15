// Melde: the time is four steel wires, singing.
//
// Chladni's sand needs a plate; Melde's experiment needs only a wire and a
// driver. Each numeral here is one continuous wire, bent in a single pass
// (the 4 and the 8 cross themselves, as a real bend must), standing on a
// shaker rail that an electromagnet drives from below. The wires ring, so
// nothing about them is a line: a vibrating wire is a bright rail at each of
// its two extremes with a blur between, pinched to a hairline wherever a
// node falls, swollen into a lens at every antinode. The letterform IS the
// standing wave: mode number is set by the numeral, and the strobe sits a
// little off the drive, so the lobes crawl along each glyph for ever.
//
// Two systems. The minutes stand on the rail, big and singing. The hours sit
// up on the beam with a vice jaw gripping each foot, so they stay fine, quiet
// monolines in the same hand - because a clamp damps.
//
// The seconds are the sweep generator: the drive climbs the frequency scale
// once a minute, and a wire swells as the sweep passes its own resonance
// mark, so a wave of excitement crosses the bench every minute. What the
// generator is sending is the grey trace along the top, its wavelength
// shortening as the sweep climbs. The minute turn is the flyback - the drive
// slams back to the bottom of the scale, and the transient climbs each
// changing wire as a re-bending front, leaving the new numeral behind it. On
// the hour the sweep runs off the end of the scale, the jaws ride up, and all
// four wires re-bend before the vice drops back and bites.
//
// Purity: every value comes from the clock. No state survives a frame.

import { clockFields, previousMinute, orbit, dither, clamp, lerp } from '../js/kit.js';

const W = 128, H = 64;

// ------------------------------------------------------------ the wire alphabet
//
// Control points of one continuous bend, in a 22 x 40 box, y down. Smoothed
// into a wire by a Catmull-Rom spline: a bending machine has a minimum
// radius, so there are no corners anywhere in the set. `0` and `8` close on
// themselves; `4`, `8` and `9` cross.
// Every bend starts at the foot, where the wire is welded to the rail, and
// runs upwards. That matters twice: a transient really does climb a wire from
// its clamped end, and point `i` of any two numerals is at a similar height,
// so bending one into the other never passes through a chimera.
const CLOSED = { 0: true, 8: true };
const CTRL = {
  0: [[11, 37.7], [5.6, 35], [2.8, 28.4], [2.4, 20], [2.6, 12], [5.4, 5.2],
    [11, 2.3], [16.6, 5.2], [19.4, 12], [19.6, 20], [19.2, 28.4], [16.4, 35]],
  1: [[16.8, 38], [11.4, 33.8], [11.3, 25], [11.1, 13], [10.6, 2.2], [6.4, 6.8], [2.5, 11.4]],
  2: [[19.4, 37.6], [10.6, 37.9], [3.1, 37.6], [2.4, 33.6], [4.6, 27], [10, 20.6],
    [16, 15.2], [18.6, 9.6], [16.4, 4.1], [10, 2.1], [4.6, 4.4], [2.9, 10.2]],
  3: [[2.6, 31.4], [6, 36.2], [13, 37.4], [18.4, 31], [18.8, 22.2], [14.8, 17.4],
    [10, 15.3], [15.4, 12.4], [17.6, 7], [13.6, 2.6], [7, 2.3], [3, 6.6]],
  4: [[14.7, 38], [14.4, 24], [14.2, 8.4], [13.9, 3.4], [12.1, 2.1], [10.2, 4.8],
    [6.4, 13.6], [2.4, 24], [2, 27.7], [11, 27.9], [19.6, 27.6]],
  5: [[2.8, 33.8], [8.4, 37.8], [15.4, 35.6], [19, 27], [18.8, 18.4], [14.8, 13.9],
    [9, 12.6], [3.2, 13.6], [3.4, 8], [5, 2.6], [12, 2.3], [19.2, 2.6]],
  6: [[4.2, 23.6], [11, 21.3], [17.6, 24.6], [18.8, 32], [14.6, 37.2], [7.6, 36.4],
    [3, 27.6], [2.8, 19], [3.6, 10], [7, 3.4], [13.8, 1.8]],
  7: [[8.2, 37.8], [10.2, 28.6], [13.4, 19.6], [16, 11], [19.6, 2.7], [10, 2.3], [2.2, 3]],
  8: [[11, 37.8], [18.8, 32.4], [17.8, 25.4], [11.2, 19.4], [5.6, 15.4], [4.8, 7.4],
    [11, 2.2], [17.2, 7.4], [16.4, 15.4], [10.8, 20.2], [4.2, 25.4], [3.2, 32.4]],
  9: [[9.4, 38.2], [16.6, 32.6], [19, 24], [18.8, 15.4], [17.6, 6.6], [10.8, 2.2],
    [3.8, 7.8], [4.4, 15.6], [11, 19.6], [18.4, 16.4]],
};

/** Catmull-Rom through the control points: the wire between the bends. */
function spline(ctrl, closed) {
  const n = ctrl.length, out = [];
  const P = (i) => ctrl[closed ? ((i % n) + n) % n : Math.max(0, Math.min(n - 1, i))];
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const steps = Math.max(3, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) * 2.5));
    for (let j = 0; j < steps; j++) {
      const t = j / steps, t2 = t * t, t3 = t2 * t;
      const c = (a, b, c2, d) => 0.5 * (2 * b + (-a + c2) * t + (2 * a - 5 * b + 4 * c2 - d) * t2 + (-a + 3 * b - 3 * c2 + d) * t3);
      out.push([c(p0[0], p1[0], p2[0], p3[0]), c(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  if (!closed) out.push(ctrl[n - 1].slice());
  return out;
}

// Every glyph is resampled to the same number of points, equally spaced by
// arc length, so one numeral can be bent into another point by point.
const NS = 96;
function byArcLength(poly, closed) {
  const pts = closed ? [...poly, poly[0]] : poly;
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const L = cum[cum.length - 1], out = new Float32Array(2 * NS);
  let j = 0;
  for (let k = 0; k < NS; k++) {
    const s = (L * k) / (NS - 1);
    while (j < cum.length - 2 && cum[j + 1] < s) j++;
    const u = (s - cum[j]) / (cum[j + 1] - cum[j] || 1);
    out[2 * k] = pts[j][0] + (pts[j + 1][0] - pts[j][0]) * u;
    out[2 * k + 1] = pts[j][1] + (pts[j + 1][1] - pts[j][1]) * u;
  }
  return { P: out, L, closed };
}
const GLYPH = {};
for (const d of Object.keys(CTRL)) GLYPH[d] = byArcLength(spline(CTRL[d], !!CLOSED[d]), !!CLOSED[d]);

// Each numeral rings in its own mode: the lobe count along its wire.
const MODE = { 0: 6, 1: 3, 2: 4, 3: 5, 4: 4, 5: 5, 6: 5, 7: 3, 8: 7, 9: 5 };

// ------------------------------------------------------------ drawing a ringing wire
//
// A wire swinging through amplitude `a` is not a line. It is solid where the
// metal actually is - a band of thickness 2w at each of its two turning
// points, where it lingers - and a thinning blur between them, because it
// crosses the middle fast. So each cross-section is stamped: two bright
// rails and a dither that fades inwards. At a node a = 0, the two rails
// merge and the wire is a crisp hairline again.
// A small swing keeps the wire solid and merely swells it, so the numeral in
// its resting mode is a crisp stroke that is fat at the antinodes and pinched
// to a hairline at every node. Only a hard drive opens the middle up.
function stamp(g, px, py, nx, ny, a, w) {
  const R = a + w, steps = Math.ceil(R / 0.48), inner = a - w;
  const soft = inner > 0.35 ? smooth((inner - 0.35) / 1.2) : 0;
  for (let q = -steps; q <= steps; q++) {
    const o = (q * R) / steps, r = o < 0 ? -o : o;
    const x = px + nx * o, y = py + ny * o;
    if (r >= inner || soft === 0) { g.pixel(x, y); continue; }
    const lv = 1 - soft * (0.85 - 0.46 * (r / inner) ** 1.7);
    if (dither(Math.floor(x), Math.floor(y), lv)) g.pixel(x, y);
  }
}

/** Draw a placed wire (2*NS screen coordinates); `hOf(i)` is its amplitude. */
function drawWire(g, S, hOf, w) {
  const nx = new Float32Array(NS), ny = new Float32Array(NS);
  for (let i = 0; i < NS; i++) {
    const p = Math.max(0, i - 1), n = Math.min(NS - 1, i + 1);
    const dx = S[2 * n] - S[2 * p], dy = S[2 * n + 1] - S[2 * p + 1], l = Math.hypot(dx, dy) || 1;
    nx[i] = -dy / l; ny[i] = dx / l;
  }
  for (let i = 0; i < NS - 1; i++) {
    const j = i + 1;
    const ax = S[2 * i], ay = S[2 * i + 1];
    const dx = S[2 * j] - ax, dy = S[2 * j + 1] - ay;
    const len = Math.hypot(dx, dy), steps = Math.max(1, Math.ceil(len / 0.42));
    const a0 = hOf(i), a1 = hOf(j);
    for (let q = 0; q < steps; q++) {
      const u = q / steps;
      stamp(g, ax + dx * u, ay + dy * u, nx[i] + (nx[j] - nx[i]) * u, ny[i] + (ny[j] - ny[i]) * u, a0 + (a1 - a0) * u, w);
    }
  }
}

const smooth = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
const smoother = (u) => { u = clamp(u, 0, 1); return u * u * u * (u * (u * 6 - 15) + 10); };

// How much of the wire the re-bending front works on at once, as a fraction
// of its length. Short enough to see the bend travel, long enough to glide.
// Short on purpose. A long front holds a third of the wire halfway between
// two numerals, and halfway between a 5 and a 0 is a shape of its own; a
// short one keeps nearly all of the metal in a settled numeral and puts a
// bright travelling knot at the only place that is moving.
const FRONT = 0.2;

const SW = 0.95, DS = 1.15;   // px of swell, and of lean, per unit of drive

/**
 * One numeral. Glyph `A`, bent towards `B` behind a re-bending front at `fr`
 * (0 = all old, 1 + FRONT = all new), placed in its 22 x 40 box at
 * tr = [x, y, sx, sy] and ringing in mode `k` under drive `d`.
 *
 * The mode shape e(s) = sin(pi (k s + phase)) does both visible jobs, because
 * they are one phenomenon: the wire leans along its own normal by e * osc
 * (where the strobe has caught it this instant), and the stroke swells by
 * |e| (where the strobe has not quite caught it). Both die at the foot,
 * which is welded to the rail and cannot move.
 */
function numeral(g, A, B, fr, tr, { d = 1, k = 4, phase = 0, osc = 0, w = 1.02, whip = 0, col = 0 }) {
  const [tx, ty, sx, sy = sx] = tr;
  const bx = new Float32Array(NS), by = new Float32Array(NS), e = new Float32Array(NS);
  const wf = new Float32Array(NS);
  const cb = 4 * col * (1 - col);
  for (let i = 0; i < NS; i++) {
    let px = A.P[2 * i], py = A.P[2 * i + 1];
    if (B) {
      // A changing wire is pulled taut first and let out again second, so it
      // is never half of one numeral and half of another - halfway between a
      // 9 and a 0 is a shape of its own, and a shape of its own is the one
      // thing a clock must not show. Instead: the old bend collapses into a
      // spindle, then the new bend unfurls out of it from the foot up.
      const qx = B.P[2 * i], qy = B.P[2 * i + 1];
      px += (11 + ((px + qx) / 2 - 11) * 0.1 - px) * col;
      py += ((py + qy) / 2 - py) * col;
      const u = smoother((fr - i / (NS - 1)) / FRONT);
      px += (qx - px) * u; py += (qy - py) * u;
      // Whatever is moving is also ringing, so it blurs: the unfurling front,
      // and the whole wire while it is being pulled in.
      // ... and a wire pulled taut over a shaking rail never sits still, so
      // the spindle shimmers for as long as it is a spindle. It has to: a
      // crisp vertical stroke is itself a numeral.
      wf[i] = Math.max(4 * u * (1 - u), 0.8 * cb, 0.6 * col * (1 - smooth(fr)));
    }
    bx[i] = px; by[i] = py;
    e[i] = Math.sin(Math.PI * (k * (i / (NS - 1)) + phase)) * smooth((37.9 - py) / 7);
  }
  const S = new Float32Array(2 * NS), a = new Float32Array(NS);
  for (let i = 0; i < NS; i++) {
    const p = Math.max(0, i - 1), n = Math.min(NS - 1, i + 1);
    const dx = bx[n] - bx[p], dy = by[n] - by[p], l = Math.hypot(dx, dy) || 1;
    const off = DS * d * e[i] * osc;
    S[2 * i] = tx + (bx[i] - (dy / l) * off) * sx;
    S[2 * i + 1] = ty + (by[i] + (dx / l) * off) * sy;
    a[i] = SW * d * Math.abs(e[i]) + whip * wf[i];
  }
  drawWire(g, S, (i) => a[i], w);
}

export const _debug = { GLYPH, MODE, numeral, NS };

// ------------------------------------------------------------ the bench
//
// Left to right, the way the bench is built: the frame post, the hour pair
// clamped to its bracket, the exciter coil, and the rail with the minute
// pair standing on it. The frequency scale runs along the front.
const RAIL_Y = 53, RAIL_X0 = 5, RAIL_X1 = 126;
const SX0 = 6, SX1 = 120, BASE = 61;        // the scale
const COIL_X = 46, COIL_TOP = 38;           // hung off the end of the beam
// A wire is taller than it is wide, so the minute numerals are condensed:
// the letterform is the shape of the thing that makes it.
const MIN_TR = [[64, 7, 0.9, 1.15], [94, 7, 0.9, 1.15]];
const HR_TR = [[7, 10, 0.64], [21, 10, 0.64]];
const PLATE_Y = 36;
// Where each wire's own resonance falls on the scale: under the wire itself.
const MARK = [...HR_TR, ...MIN_TR].map(([tx, , sc]) => (tx + 11 * sc - SX0) / (SX1 - SX0));
const resp = (p, pm) => 1 / (1 + ((p - pm) / 0.072) ** 2);

/** The rail is a beam in a standing wave of its own: nodes fixed, belly moving. */
const railDy = (x, amp, osc) => amp * Math.sin((2 * Math.PI * (x - RAIL_X0)) / 47 - 0.43) * osc;

function drawRail(g, amp, osc, ox, oy) {
  for (let x = RAIL_X0; x <= RAIL_X1; x++) {
    const y = RAIL_Y + railDy(x, amp, osc) + oy, xx = x + ox;
    g.pixel(xx, y);
    if (dither(xx, Math.floor(y) + 1, 0.62)) g.pixel(xx, Math.floor(y) + 1);
    if (dither(xx, Math.floor(y) + 2, 0.3)) g.pixel(xx, Math.floor(y) + 2);
  }
}

/**
 * The exciter: a solenoid hung under the hour bracket, its pole piece facing
 * the rail across a working gap. Four turns, seen a little from above.
 */
function drawCoil(g, pull, ox, oy) {
  const top = COIL_TOP + oy, x0 = COIL_X + ox;
  g.vline(x0 - 1, top, 10); g.vline(x0, top, 10); g.vline(x0 + 1, top, 10);
  // Four turns of a helix: the front of each turn bright, the back behind the
  // core, so it reads as wound and not as a stack of bars.
  for (let k = 0; k < 4; k++) {
    const cy = top + 1.4 + k * 2.55;
    for (let dx = -9; dx <= 9; dx++) {
      const q = 1 - (dx / 9.6) ** 2;
      if (q <= 0) continue;
      const h = 1.55 * Math.sqrt(q);
      g.pixel(x0 + dx, cy + h);
      const by = Math.floor(cy - h);
      if (dither(x0 + dx, by, 0.42)) g.pixel(x0 + dx, by);
    }
  }
  // The pole piece, and the field in the gap: more pips as the pull rises.
  g.fillRect(x0 - 5, Math.floor(top) + 10, 11, 2);
  const gy = Math.floor(top) + 12;
  for (let k = 0; k < 4; k++)
    if (pull > 0.16 + k * 0.22) { g.pixel(x0 - 3 * k, gy); g.pixel(x0 + 3 * k, gy); }
}

/**
 * The ironwork: the post at the left, the beam that carries the hour station
 * and reaches out over the rail to hold the exciter, and the far end post.
 */
function drawFrame(g, ox, oy) {
  g.vline(2 + ox, 13 + oy, BASE - 13 - oy);                 // post
  for (let y = 14 + oy; y < BASE; y += 2) g.pixel(3 + ox, y);
  g.fillRect(2 + ox, PLATE_Y + oy, 54, 2);                  // the beam
  g.line(4 + ox, PLATE_Y + 10 + oy, 13 + ox, PLATE_Y + 2 + oy);   // the gusset:
  g.line(4 + ox, PLATE_Y + 6 + oy, 9 + ox, PLATE_Y + 2 + oy);     // two ribs
  g.vline(123 + ox, 44 + oy, BASE - 44 - oy);               // far end post
  for (let y = 45 + oy; y < BASE; y += 2) g.pixel(124 + ox, y);
}

/**
 * The vice: two jaws, one outside each hour wire, each reaching a lip over
 * its foot. Raised `h` px they ride up the outside of the numerals rather
 * than across them, and carry a dark halo so they read as being in front.
 */
function drawClamp(g, h, ox, oy) {
  const y = Math.round(PLATE_Y - 4 - h) + oy;
  for (const [x, dir] of [[1, 1], [36, -1]]) {
    const bx = x + ox, lx = bx + (dir > 0 ? 5 : -3);
    if (h > 0.4) { g.fillRect(bx - 1, y - 1, 7, 6, 0); g.fillRect(lx - 1, y + 1, 5, 4, 0); }
    g.fillRect(bx, y, 5, 4);                       // the jaw
    g.pixel(bx + 1 + (dir > 0 ? 0 : 2), y + 1, 0); // its screw slot
    g.pixel(bx + 2, y + 1, 0);
    g.hline(lx, y + 2, 3);                         // the lip over the foot
    g.pixel(lx + (dir > 0 ? 0 : 2), y + 3);
  }
}

/**
 * What the generator is actually sending: a grey trace across the top of the
 * bench, its wavelength shortening as the sweep climbs, thrown into a flutter
 * by the flyback. Dim on purpose - it is the background, not the subject.
 */
function drawTrace(g, p, kick, t, ox, oy) {
  const lam = lerp(23, 9.5, p), amp = 1.7 * (1 + 0.8 * kick);
  const ph = 2 * Math.PI * 0.3 * t;
  const at = (x) => 4 + amp * Math.sin((2 * Math.PI * x) / lam - ph);
  // One pixel per column: the trace stays a single hairline, and breaks into
  // dashes where it is steepest, the way a fast sweep looks on a tube.
  for (let x = 4; x <= 123; x++) g.pixel(x + ox, Math.round(at(x)) + oy);
}

/**
 * The sweep generator's frequency scale, with the cursor at `p` and a pip
 * under each wire's own resonance. The cursor is the seconds.
 */
function drawScale(g, p, exc, ox, oy) {
  const sw = SX1 - SX0;
  g.hline(SX0 - 3 + ox, BASE + oy, sw + 7);
  for (let s = 0; s <= 12; s++) {
    const x = Math.round(SX0 + (sw * s) / 12) + ox;
    g.vline(x, BASE - (s % 3 === 0 ? 3 : 1) + oy, s % 3 === 0 ? 3 : 1);
  }
  // Each wire's own resonance, marked under it; the mark opens as it answers.
  for (let i = 0; i < 4; i++) {
    const x = Math.round(SX0 + sw * MARK[i]) + ox, y = BASE - 5 + oy;
    g.pixel(x, y); g.pixel(x - 1, y - 1); g.pixel(x + 1, y - 1);
    if (exc[i] > 0.5) { g.pixel(x - 2, y - 2); g.pixel(x + 2, y - 2); }
  }
  const cx = SX0 + sw * p + ox, cy = BASE - 1 + oy;
  g.fillPolygon([[cx - 2.6, cy + 0.9], [cx + 2.6, cy + 0.9], [cx, cy - 3.4]], 0);
  g.fillPolygon([[cx - 2.2, cy + 0.6], [cx + 2.2, cy + 0.6], [cx, cy - 3]]);
}

// ------------------------------------------------------------ the schedule
const FB = 0.72;        // flyback: the sweep slams back over the last of the minute
const PULL = 0.4;       // a changing wire being pulled taut
const TURN = 1.1;       // the new bend unfurling up a minute wire
const PULL_H = 0.45;    // ... and the same two, on an hour wire during the show
const TURN_H = 1.15;
const HSHOW = 3.4;      // how long the clamps stay off
const LIFT = 9;         // how far they lift

export default {
  name: 'Melde',
  blurb: 'Four wires bent into numerals, singing on a shaker rail.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  driver: 'full',
  frame(g, ctx) {
    const f = clockFields(ctx.date);
    const prev = previousMinute(ctx.date);
    const [ox, oy] = orbit(ctx.date, 2, 5);
    const t = (ctx.date.getTime() % 3600000) / 1000;   // continuous, wraps hourly
    const sec = f.sec;

    // -- the sweep generator. The drive climbs the scale, then flies back.
    // On the hour it runs off the top of the scale and sits there a moment.
    const pre = f.m === 59, isHour = f.m === 0;
    const topAt = 60 - FB - (pre ? 0.4 : 0);
    const p = sec < topAt ? sec / topAt
      : sec < 60 - FB ? 1 : 1 - smoother((sec - (60 - FB)) / FB);

    // -- the flyback transient: everything on the bench feels it.
    const kick = clamp(1 - sec / 1.3, 0, 1) ** 1.5;

    // -- the clamps. They let go just before the hour and drop back after.
    let lift = 0;
    if (pre && sec > 59.3) lift = LIFT * smoother((sec - 59.3) / 0.7);
    else if (isHour) {
      const hv = sec / HSHOW;
      lift = LIFT * (1 - smoother((hv - 0.56) / 0.26));
      if (hv > 0.82 && hv < 1.6) lift += 1.3 * Math.exp(-(hv - 0.82) * 24) * Math.sin((hv - 0.82) * 105);
    }
    const dl = clamp(lift / LIFT, 0, 1);

    // -- excitation: each wire answers only near its own mark on the scale.
    const exc = [resp(p, MARK[0]), resp(p, MARK[1]), resp(p, MARK[2]), resp(p, MARK[3])];

    // -- the strobe. Slightly off the drive, so the lobes crawl for ever;
    // it breaks into a flutter while the transient is running.
    const osc = Math.sin(2 * Math.PI * 2.35 * t) * (1 - 0.5 * kick)
      + Math.sin(2 * Math.PI * 9.6 * t) * 0.5 * kick;
    const ph = 0.045 * t;

    // -- the re-bending fronts
    const mCol = smoother((sec - 0.04) / PULL);
    // The foot starts letting the new bend out while the top is still being
    // pulled in, so there is no moment of four motionless stems.
    const mFr = smooth((sec - 0.3) / TURN) * (1 + FRONT);
    const hCol = smoother((sec - 0.5) / PULL_H);
    const hFr = smooth((sec - 0.79) / TURN_H) * (1 + FRONT);

    const hNew = [f.h12 / 10 | 0, f.h12 % 10], hOld = [prev.h12 / 10 | 0, prev.h12 % 10];
    const mNew = [f.m / 10 | 0, f.m % 10], mOld = [prev.m / 10 | 0, prev.m % 10];

    const railAmp = 0.45 + 1.5 * Math.max(kick, 0.7 * Math.max(exc[2], exc[3]));

    // ---- the bench
    drawTrace(g, p, kick, t, ox, oy);
    drawFrame(g, ox, oy);
    drawCoil(g, Math.max(kick, exc[2], exc[3], dl * 0.8), ox, oy);
    drawRail(g, railAmp, osc, ox, oy);

    // ---- the hours: crisp monolines, because a clamp damps. Unless it is off.
    for (let i = 0; i < 2; i++) {
      const A = GLYPH[hOld[i]], B = hNew[i] === hOld[i] ? null : GLYPH[hNew[i]];
      const k = lerp(MODE[hOld[i]], MODE[hNew[i]], isHour ? clamp(hFr, 0, 1) : 1);
      const d = Math.min(1.5, 0.06 + 0.2 * exc[i] + dl * (0.9 + 0.5 * kick));
      numeral(g, A, isHour ? B : null, hFr, HR_TR[i], {
        d, k, phase: ph + 0.37 * i + 0.11, osc, w: 0.68, whip: 1.4, col: hCol,
      });
    }
    drawClamp(g, lift, ox, oy);

    // ---- the minutes: standing on the rail, singing, feet riding the beam
    for (let i = 0; i < 2; i++) {
      const A = GLYPH[mOld[i]], B = mNew[i] === mOld[i] ? null : GLYPH[mNew[i]];
      const bend = clamp(mFr, 0, 1);
      const k = lerp(MODE[mOld[i]], MODE[mNew[i]], bend) + 0.7 * kick;
      const [tx, ty, sx, sy] = MIN_TR[i];
      const d = Math.min(1.85, 0.6 + 0.85 * exc[2 + i] + kick * (B ? 1.15 : 0.4));
      numeral(g, A, B, mFr, [tx + ox, ty + oy + railDy(tx + 11 * sx, railAmp, osc) * 0.85, sx, sy], {
        d, k, phase: ph + 0.23 * i, osc, w: 0.66, whip: 2.7, col: mCol,
      });
    }

    drawScale(g, p, [exc[0] + dl, exc[1] + dl, exc[2], exc[3]], ox, oy);

    if (ctx.oled && ctx.night > 0) ctx.oled.contrast(Math.round(255 * (1 - 0.7 * ctx.night)));
  },
};
