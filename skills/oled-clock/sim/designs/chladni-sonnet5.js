// Monochord — the time strung as resonating wires.
//
// Every digit is built of two or three taut wires, pinned at both ends to a
// frame, routed in the exact shape of the numeral. A wire under tension does
// not sit still: a standing wave runs along its length, antinodes bulging
// sideways and nodes pinned flat, same as a struck string or a monochord
// fret pattern. What is on the glass is never a static stroke — it is a
// wire's displacement, perpendicular to its own path, sampled every frame
// from a closed-form travelling wave. The digit is legible because the
// wire's rest path already is the numeral; cymatics is what keeps it alive.
//
// Letterforms: each digit 0-9 is its own set of taut-wire paths (rounded
// centre-lines, no serifs, drawn as a family so strokes agree digit to
// digit), built once into arc-length tables. No two digits share geometry.
//
// Alive: every wire's standing wave runs continuously from clock time
// (frequency and phase keyed to the digit and the wire), so loops travel
// and breathe at 60 fps, never only at a turn. Two anchor pins (hollow
// circles) sit at each wire's ends, the one fixed point that never moves.
//
// The minute turn: the four wires whose digit changes don't cross-fade —
// each wire's control path interpolates, point by point along matched arc
// length, from the old digit's path to the new one's, 1.4 s eased, while
// its wave amplitude swells into a full-length shaking buzz at the
// midpoint (every point of the wire thrown far off its rest path, like
// plucking it hard) then calms as the new path settles — the wire visibly
// re-shapes itself into the next numeral, pins never moving, never a mixed
// unreadable frame because the interpolated path is always one continuous
// wire. The hour: every wire in the whole face is plucked at once, the
// shake growing far wider and slower (2.6 s) than any minute turn, holding
// at full chaos for half a second before every wire re-settles together
// onto the new time — a bigger, shared spectacle, not four small ones.
//
// Purity: frame() reads only ctx.date/ctx.fields. A wire's shape is
// `path(s) + normal(s) * wave(s, t)` for arc length s and time t, all
// closed form; the turn is an eased blend of two closed-form paths. No
// state, no simulated history, any instant has one answer.
//
// Burn-in: the whole face orbits a 2x3 px square every 3 minutes
// (`kit.orbit`); pins are hollow (a ring, not a filled dot) so no pixel at
// their centre is ever lit; night dims contrast via ctx.night.

import { orbit, clockFields, previousMinute, clamp, ease } from '../js/kit.js';

const W = 128, H = 64;

// ------------------------------------------------------------ layout
const CELL_X = [8, 34, 68, 94];     // left edge of each digit cell (HH : MM)
const CELL_Y = 7;                   // top of the digit box
const COLON_X = 63.5;
const BOXW = 20, BOXH = 50;         // a digit's drawing box

// ------------------------------------------------------------ letterforms
//
// Centre-lines in the BOXW x BOXH box (y down), each digit a list of
// polylines (one polyline = one wire). Rounded, no serifs; arcs in clock
// degrees. Every digit reuses the same corner roundings so the family
// agrees visually.
function arc(cx, cy, rx, ry, a0, a1, n = 18) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + (a1 - a0) * (i / n)) * Math.PI) / 180;
    pts.push([cx + rx * Math.sin(a), cy - ry * Math.cos(a)]);
  }
  return pts;
}
const PATHS = {
  0: [arc(10, 25, 7.4, 21.5, 0, 359.999, 48)],
  1: [[[5, 10], [11, 2], [11, 48]]],
  2: [[...arc(10, 11.5, 7.6, 9, -75, 115, 16), [16, 18], [2.5, 48], [17.5, 48]]],
  3: [arc(8.5, 11.5, 7.5, 9.3, -95, 125, 20), arc(8.5, 31, 8, 11.7, -95, 185, 24)],
  4: [[[13.5, 1], [13.5, 48]], [[13.5, 1], [2, 33], [18.5, 33]]],
  5: [[[16, 2], [4, 2], [3.3, 20]], arc(9, 29.5, 7.6, 11.3, -72, 228, 22)],
  6: [[...arc(9.5, 33, 8, 11.7, 180, 360, 24), ...arc(10.5, 11.5, 6.3, 9.5, 10, -140, 18).reverse()]],
  7: [[[2.5, 2], [17.5, 2], [7, 48]]],
  8: [arc(10, 13, 7, 9.3, 0, 359.999, 26), arc(10, 34, 7.6, 10.5, 0, 359.999, 26)],
  9: [[...arc(10, 13, 7.4, 9.3, 15, 375, 26), [16.7, 20.5], [15, 48]]],
};

/** Resample a polyline to even arc-length steps; returns {pts, len, tangent[]}. */
function buildWire(poly) {
  const cum = [0];
  for (let i = 1; i < poly.length; i++) cum.push(cum[i - 1] + Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]));
  const len = cum[cum.length - 1] || 1;
  const N = Math.max(8, Math.round(len / 1.1));
  const pts = [], tan = [];
  for (let k = 0; k <= N; k++) {
    const s = (k / N) * len;
    let i = 1;
    while (i < cum.length - 1 && cum[i] < s) i++;
    const a = poly[i - 1], b = poly[i], segLen = cum[i] - cum[i - 1] || 1;
    const u = (s - cum[i - 1]) / segLen;
    pts.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]);
    const tl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    tan.push([(b[0] - a[0]) / tl, (b[1] - a[1]) / tl]);
  }
  return { pts, tan, len, N };
}
const WIRES = {};
for (const [d, paths] of Object.entries(PATHS)) WIRES[d] = paths.map(buildWire);

// ------------------------------------------------------------ the standing wave
//
// A wire's lateral displacement at normalised arc position u in [0,1],
// time t: a sum of its fundamental and a touch of its 3rd harmonic (real
// strings are never a pure sine), pinned to zero at both ends (u=0, u=1)
// since the pins never move. `shake` (0..1) is how hard the wire is being
// plucked right now: 0 is a calm idle shimmer, 1 is maximum disturbance.
const IDLE_AMP = 0.55;      // px, calm shimmer
const SHAKE_AMP = 7.5;      // px, full pluck

function wireWave(u, t, seed, shake) {
  const pin = Math.sin(Math.PI * u);                 // zero at both ends, one belly
  const pin3 = Math.sin(3 * Math.PI * u);
  const f1 = 1.0 + 0.07 * seed, f3 = 2.6 + 0.1 * seed;
  const w1 = Math.sin(2 * Math.PI * f1 * t + seed * 2.1);
  const w3 = Math.sin(2 * Math.PI * f3 * t + seed * 3.7);
  const idle = IDLE_AMP * (0.8 * pin * w1 + 0.2 * pin3 * w3);
  if (shake <= 0.004) return idle;
  // Plucked: higher modes, bigger amplitude, still pinned at both ends.
  const buzz = Math.sin(5 * Math.PI * u) * Math.sin(2 * Math.PI * 7.3 * t + seed * 5.3)
    + Math.sin(7 * Math.PI * u) * Math.sin(2 * Math.PI * 11.1 * t + seed * 1.3);
  return idle * (1 - shake) + shake * SHAKE_AMP * pin * (0.6 * w1 + 0.4 * buzz);
}

/** Interpolate two wire tables (matched by arc-length fraction) by u in [0,1]. */
function lerpWire(a, b, u) {
  if (!a) return b; if (!b) return a;
  const N = Math.max(a.N, b.N);
  const pts = [], tan = [];
  for (let k = 0; k <= N; k++) {
    const fa = (k / N) * a.N, ia = Math.min(a.N - 1, Math.floor(fa)), ua = fa - ia;
    const fb = (k / N) * b.N, ib = Math.min(b.N - 1, Math.floor(fb)), ub = fb - ib;
    const pa = [a.pts[ia][0] + (a.pts[ia + 1][0] - a.pts[ia][0]) * ua, a.pts[ia][1] + (a.pts[ia + 1][1] - a.pts[ia][1]) * ua];
    const pb = [b.pts[ib][0] + (b.pts[ib + 1][0] - b.pts[ib][0]) * ub, b.pts[ib][1] + (b.pts[ib + 1][1] - b.pts[ib][1]) * ub];
    const ta = a.tan[ia], tb = b.tan[ib];
    pts.push([pa[0] + (pb[0] - pa[0]) * u, pa[1] + (pb[1] - pa[1]) * u]);
    const tx = ta[0] + (tb[0] - ta[0]) * u, ty = ta[1] + (tb[1] - ta[1]) * u, tl = Math.hypot(tx, ty) || 1;
    tan.push([tx / tl, ty / tl]);
  }
  return { pts, tan, N };
}

// ------------------------------------------------------------ turn timing
const SLEW = 1.4;                                      // minute: morph duration, s
const HOUR_IN = 1.1, HOUR_HOLD = 0.5, HOUR_OUT = 1.6;   // hour: phases, s

function diffMask(a, b) { return [0, 1, 2, 3].map((k) => a[k] !== b[k]); }
const shakeCurve = (u) => Math.sin(Math.PI * clamp(u, 0, 1));   // 0 at ends, 1 at the midpoint

// ------------------------------------------------------------ drawing

/** One wire: its rest path displaced by the standing wave, drawn as a dim thread with bright antinode beads. */
function drawWire(g, wire, originX, originY, t, seed, shake, ox, oy) {
  const { pts, tan, N } = wire;
  let prevX = null, prevY = null;
  for (let k = 0; k <= N; k++) {
    const u = k / N;
    const d = wireWave(u, t, seed, shake);
    const [px, py] = pts[k], [tx, ty] = tan[k];
    const nx = -ty, ny = tx;
    const x = originX + px + nx * d, y = originY + py + ny * d;
    const xi = Math.round(x + ox), yi = Math.round(y + oy);
    g.pixel(xi, yi);
    if (prevX !== null) {
      const dx = xi - prevX, dy = yi - prevY;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) g.line(prevX, prevY, xi, yi);
    }
    // A bright bead at a belly (anti-node): where |d| is a sizeable swing.
    if (Math.abs(d) > IDLE_AMP * 1.25) { g.pixel(xi, yi); g.pixel(xi + 1, yi); g.pixel(xi, yi + 1); }
    prevX = xi; prevY = yi;
  }
  // Pins at both ends: hollow rings, the one point that never moves.
  for (const [px, py] of [pts[0], pts[N]]) {
    const cx = Math.round(originX + px + ox), cy = Math.round(originY + py + oy);
    g.pixel(cx - 1, cy); g.pixel(cx + 1, cy); g.pixel(cx, cy - 1); g.pixel(cx, cy + 1);
    g.pixel(cx, cy, 0);
  }
}

/** A whole digit cell: every wire of the chosen table(s), optionally mid-morph. */
function drawDigit(g, cellX, wiresA, wiresB, u, shake, t, seedBase, ox, oy) {
  const n = Math.max(wiresA?.length ?? 0, wiresB?.length ?? 0);
  for (let i = 0; i < n; i++) {
    const a = wiresA?.[i], b = wiresB?.[i];
    const wire = u <= 0 ? a : u >= 1 ? b : lerpWire(a, b, u);
    if (!wire) continue;
    drawWire(g, wire, cellX, CELL_Y, t, seedBase + i * 1.9, shake, ox, oy);
  }
}

/** The colon: two beads on their own short wires, pinching with the second. */
function drawColon(g, t, sec, ox, oy) {
  const ph = sec - Math.floor(sec);
  const pulse = Math.exp(-ph * 4) * Math.sin(Math.PI * Math.min(1, ph * 3));
  for (const cy of [23, 41]) {
    const d = IDLE_AMP * 0.6 * Math.sin(2 * Math.PI * 1.3 * t) + 1.6 * pulse;
    g.fillCircle(COLON_X + ox, cy + oy + d * 0.15, 1.3, 1);
  }
}

/** The frame: a thin rule top and bottom, so the wires read as strung on something. */
function drawFrame(g, ox, oy) {
  for (let x = 1; x <= W - 2; x += 3) { g.pixel(x + ox, 1 + oy); g.pixel(x + ox, H - 2 + oy); }
}

export default {
  name: 'Monochord',
  blurb: 'The time strung as taut wires in the exact shape of the digits; a standing wave runs along every wire, and the minute turn plucks and re-shapes the four that change into the next numeral.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  driver: 'full',

  frame(g, { fields: f, date, oled, night }) {
    const [ox, oy] = orbit(date, 2, 3);
    const t = date.getTime() / 1000;
    const sec = f.sec;
    const cur = `${f.hh}${f.mm}`;
    const prev = `${previousMinute(date).hh}${previousMinute(date).mm}`;
    const next = `${clockFields(new Date(date.getTime() + 60000)).hh}${clockFields(new Date(date.getTime() + 60000)).mm}`;
    const isHour = f.m === 0;

    const inSlew = sec < SLEW, outSlew = sec > 60 - SLEW;
    const uIn = inSlew ? ease.inOutCubic(sec / SLEW) : 0;
    const uOut = outSlew ? ease.inOutCubic((sec - (60 - SLEW)) / SLEW) : 0;
    const shakeIn = inSlew ? shakeCurve(sec / SLEW) : 0;
    const shakeOut = outSlew ? shakeCurve((sec - (60 - SLEW)) / SLEW) : 0;
    const changedIn = diffMask(prev, cur), changedOut = diffMask(cur, next);

    // Hour: every wire in the face morphs and plucks together, bigger and
    // slower than any single minute turn.
    let hourU = 0, hourShake = 0, inHour = false;
    if (isHour && sec < HOUR_IN + HOUR_HOLD + HOUR_OUT) {
      inHour = true;
      if (sec < HOUR_IN) { hourU = ease.inOutCubic(sec / HOUR_IN); hourShake = shakeCurve(sec / HOUR_IN); }
      else if (sec < HOUR_IN + HOUR_HOLD) { hourU = 1; hourShake = 1; }
      else { const q = (sec - HOUR_IN - HOUR_HOLD) / HOUR_OUT; hourU = 1; hourShake = shakeCurve(1 - q); }
    }

    drawFrame(g, ox, oy);

    for (let k = 0; k < 4; k++) {
      let wiresA, wiresB, u, shake;
      if (inHour) {
        wiresA = WIRES[prev[k]]; wiresB = WIRES[cur[k]]; u = hourU; shake = hourShake;
      } else if (inSlew && changedIn[k]) {
        wiresA = WIRES[prev[k]]; wiresB = WIRES[cur[k]]; u = uIn; shake = shakeIn;
      } else if (outSlew && changedOut[k]) {
        wiresA = WIRES[cur[k]]; wiresB = WIRES[next[k]]; u = uOut; shake = shakeOut;
      } else {
        wiresA = wiresB = WIRES[cur[k]]; u = 0; shake = 0;
      }
      drawDigit(g, CELL_X[k], wiresA, wiresB, u, shake, t, k * 7 + 1, ox, oy);
    }

    drawColon(g, t, sec, ox, oy);

    oled.contrast(0xcf + (0x18 - 0xcf) * night);
  },
};
