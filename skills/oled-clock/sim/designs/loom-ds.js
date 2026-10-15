// Loom — the time woven into cloth.
//
// A warp-faced band on a small loom, head on. One fell line holds the picture
// together: above it the warp ends are bare, running up out of frame, and
// below it the same ends are woven in and only show as the ground of the
// cloth. The shuttle flies through the shed level with the fell, the threads
// part round it and close behind, and the pick it trails is beaten home.
//
// Nothing is drawn on the cloth. The cloth is a weave, and a numeral is where
// its warp is raised: so the strokes are not shapes with a texture on them,
// they are the cloth's own lattice at a different height. The hour and the
// minute are two different weaves — the hour weft-faced, a horizontal rib with
// the picks lying across it, the minute warp-faced, a diagonal twill. The two
// numerals of a pair sit at two sizes and in two weaves, and the lattice is
// fixed to the glass the way a weave is fixed to the cloth.
//
// The seconds are the loom's own beat. Every second a pick is thrown: the
// shuttle crosses, the shed opens round it and shuts behind, and the reed
// comes down and beats the weft into the fell, which brightens under the blow
// and then settles. The pick is visible for a moment as a bright thread lying
// along the top of the cloth.
//
// The minute: a changing numeral is un-woven and woven again. From :59.45 its
// rows come loose from the fell down, each one drifting and going slack before
// it thins and goes; from :00 the shuttle pays the new numeral back in, one
// pick to a row, the front running across the cloth and the rows following
// each other down, so the number arrives the way cloth arrives. A slot is
// empty or half-woven through the change, never a different time.
//
// The hour: the harness is re-dressed. The whole cloth ripples, a wave of
// lifted threads running the length of it and the weave riding out of true as
// it passes, the reed slams the full width, and the hour is woven again more
// slowly than the minute ever is.
//
// Pure function of the clock: the turns are keyed to fields.sec and to the
// digits of this minute, the minute before it and the minute after, and the
// hour to fields.m === 0. All cloth geometry is built once at load.
//
// Burn-in: the loom and cloth walk a two-pixel orbit, the dither of the warp,
// the ground, the fell and the colon walks the glass a step every minute, the
// fringe swings, the shuttle lights different pixels every second, and from
// 23:00 to 07:00 the panel runs at low contrast.

import { orbit, noise, clamp, lerp, ease, progress, dither } from '../js/kit.js';

// ------------------------------------------------------------ digit shapes
// Centre-lines in a unit box, u across, v down. Arcs are clock angles
// (0 = 12 o'clock, clockwise). These are the paths the shuttle's thread
// follows: nothing here is a shape, each is a length of thread to be laid.

function arc(cx, cy, rx, ry, a0, a1, n = 18) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    out.push([cx + rx * Math.sin(a), cy - ry * Math.cos(a)]);
  }
  return out;
}
const ring = (cx, cy, rx, ry, a0 = 0) => arc(cx, cy, rx, ry, a0, a0 + 360, 44);

const DIGITS = {
  0: [ring(0.50, 0.50, 0.32, 0.45)],
  1: [[[0.29, 0.29], [0.57, 0.06], [0.57, 0.94]], [[0.26, 0.94], [0.86, 0.94]]],
  2: [[...arc(0.50, 0.27, 0.36, 0.24, -140, 152), [0.13, 0.94], [0.90, 0.94]]],
  3: [[...arc(0.50, 0.265, 0.30, 0.235, -60, 180), ...arc(0.51, 0.735, 0.34, 0.225, 0, 236)]],
  4: [[[0.71, 0.05], [0.14, 0.61]], [[0.08, 0.61], [0.93, 0.61]], [[0.71, 0.05], [0.71, 0.95]]],
  5: [[[0.88, 0.08], [0.25, 0.08], [0.25, 0.52],
       [0.44, 0.46], [0.64, 0.47], [0.79, 0.57], [0.85, 0.71], [0.77, 0.85],
       [0.58, 0.93], [0.36, 0.91], [0.20, 0.83]]],
  6: [[[0.79, 0.11], [0.60, 0.04], [0.39, 0.10], [0.25, 0.26], [0.19, 0.46], [0.21, 0.62]],
      ring(0.52, 0.71, 0.32, 0.25)],
  7: [[[0.11, 0.08], [0.89, 0.08], [0.39, 0.95]]],
  8: [ring(0.50, 0.26, 0.29, 0.21), ring(0.50, 0.72, 0.34, 0.25)],
  9: [ring(0.50, 0.30, 0.32, 0.24),
      [[0.82, 0.36], [0.84, 0.58], [0.77, 0.77], [0.61, 0.91], [0.41, 0.95], [0.23, 0.89]]],
};

// ------------------------------------------------------------ the weave
//
// One cloth, fixed to the glass. kind 0 (warp-faced, the minutes) is a twill:
// the light runs down the warp in diagonal cords, a gap every fourth. kind 1
// (weft-faced, the hour) is a rib: a dark pick every third row, the weft lying
// across the figure. Same loom, two structures, and the eye reads them as
// two kinds of cloth.

const MOD = (v, m) => ((v % m) + m) % m;
const weave = (x, y, kind) => (kind === 0 ? MOD(x - y, 4) !== 0 : MOD(y, 3) !== 0);

/**
 * One thread at a dither level: 1 is a thread lying on the surface, below
 * that a thread the weft has buried part way, which the eye reads as dimmer.
 * (g.pixel takes a colour, so the dither has to happen here.)
 */
const dot = (g, x, y, level, ph = 0) => {
  if (level >= 1) g.pixel(x, y, 1);
  else if (level > 0 && dither(Math.floor(x) + ph, Math.floor(y), level)) g.pixel(x, y, 1);
};

/**
 * One numeral as a height map: for every pixel of its box, the distance to the
 * nearest thread centre-line. Built once at load so frame() only looks things
 * up and never walks the strokes.
 */
function buildDigit(d, w, h, sw) {
  const pad = Math.ceil(sw / 2) + 1;
  const W = Math.ceil(w) + 2 * pad, H = Math.ceil(h) + 2 * pad;
  const dist = new Float32Array(W * H).fill(99);
  const segs = [];
  for (const st of DIGITS[d]) {
    const pts = st.map(([u, v]) => [pad + u * w, pad + v * h]);
    for (let i = 1; i < pts.length; i++) segs.push([pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]]);
  }
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const px = x + 0.5, py = y + 0.5;
      let best = 1e9;
      for (const [ax, ay, bx, by] of segs) {
        const dx = bx - ax, dy = by - ay;
        const l2 = dx * dx + dy * dy;
        const u = l2 ? clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1) : 0;
        const dd = (px - ax - u * dx) ** 2 + (py - ay - u * dy) ** 2;
        if (dd < best) best = dd;
      }
      dist[y * W + x] = Math.sqrt(best);
    }
  return { W, H, pad, dist };
}

// Two sizes. The minute is the hero; the hour is a smaller woven label beside
// it, so the two systems read as two bands of the same cloth, not a row of
// four equal digits.
const SIZES = {
  min: { w: 27, h: 37, sw: 5.4 },
  hour: { w: 20, h: 29, sw: 4.4 },
};
const MAPS = {};
for (const [k, s] of Object.entries(SIZES))
  MAPS[k] = Array.from({ length: 10 }, (_, d) => buildDigit(d, s.w, s.h, s.sw));

/**
 * Lay one numeral into the cloth. `warp(gx, gy, v, u, level)` is the
 * transition: it may return [x, y, level] to move and re-light a thread, or
 * null to leave it out of the cloth entirely — that is how a numeral is
 * un-woven and woven again.
 */
function drawDigit(g, d, x, y, size, kind, warp) {
  const { W, H, pad, dist } = MAPS[size][d];
  const sw = SIZES[size].sw, core = Math.max(0, sw / 2 - 1.25);
  const X = Math.round(x - pad), Y = Math.round(y - pad);
  for (let pass = 0; pass < 2; pass++)
    for (let j = 0; j < H; j++) {
      const gy = Y + j;
      for (let i = 0; i < W; i++) {
        const e = dist[j * W + i];
        if (e > sw / 2) continue;
        const gx = X + i;
        if (pass === 0) { g.pixel(gx, gy, 0); continue; }     // the ground, cut back
        if (e > core && !weave(gx, gy, kind)) continue;
        const level = e <= core ? 1 : 0.55;
        if (warp) {
          const r = warp(gx, gy, j - pad, i - pad, level);
          if (r) dot(g, r[0], r[1], r[2]);
        } else dot(g, gx, gy, level);
      }
    }
}

// ------------------------------------------------------------ the loom
//
// One fell line holds the whole picture together: the warp above it, the
// cloth below it, the shuttle flying through the shed level with it.

const FX0 = 5, FX1 = 123;         // selvedge to selvedge
const FELL = 16;                  // the fell: picks are beaten in here
const SHED_Y = 9;                 // the shuttle's flight line
const WARP_N = 11;
const TOPX = 0.55;                 // how far the warp gathers into the harness
const FBOT = 55;                  // the numerals sit on this line
const SLOTS = [
  { size: 'hour', x: 7, y: FBOT - SIZES.hour.h },
  { size: 'hour', x: 29, y: FBOT - SIZES.hour.h },
  { size: 'min', x: 60, y: FBOT - SIZES.min.h },
  { size: 'min', x: 90, y: FBOT - SIZES.min.h },
];
const COLON_X = 54, CUT = 57;     // the colon's beads, and the cut edge
const FRAY0 = 59.45;              // the weave comes apart over the last half second
const DAY = 0xcf, NIGHT = 0x20;

/** The seconds: the shuttle's run, the shed opening round it, the beat. */
function shedState(f) {
  const p = f.sec % 1;
  const dir = f.s % 2 === 0 ? 1 : -1;
  const x0 = dir > 0 ? FX0 - 4 : FX1 + 4, x1 = dir > 0 ? FX1 + 4 : FX0 - 4;
  return {
    sx: lerp(x0, x1, ease.inOutQuad(clamp(p / 0.66, 0, 1))),
    x0, x1, dir,
    open: ease.inOutQuad(clamp(p / 0.20, 0, 1)) * (1 - ease.inOutQuad(clamp((p - 0.70) / 0.20, 0, 1))),
    beat: ease.outQuad(progress(p, 0.66, 0.86)),
    fade: 1 - progress(p, 0.88, 1),
    p,
  };
}

/**
 * The warp: bare ends stretched from the heddle rod down to the fell, each one
 * leaning a little out of true, parted by the shed as the shuttle comes.
 */
function drawWarp(g, s, ph, ox, oy) {
  const y0 = 1;
  const wx = (xf, xt, y) => Math.round(xt + (xf - xt) * ((y - y0) / (FELL - y0)));
  for (let i = 0; i < WARP_N; i++) {
    const xf = FX0 + ((FX1 - FX0) * i) / (WARP_N - 1);
    const xt = 64 + (xf - 64) * TOPX + (i % 3 - 1) * 1.6;
    const gap = 12.5 * s.open * Math.exp(-(((xf - s.sx) / 24) ** 2));
    const hy = Math.max(y0, Math.floor(SHED_Y - gap)), ly = Math.min(FELL, Math.ceil(SHED_Y + gap));
    // the ends run unbroken from the harness to the fell, but for the shed;
    // they thin out as they leave the cloth, so the black above stays black
    const run = (ya, yb) => {
      for (let y = ya; y <= yb; y++) {
        const u = progress(y + (i % 3) - 1, y0, FELL - 1);
        dot(g, wx(xf, xt, y) + ox, y + oy, 0.12 + 0.86 * u, ph);
      }
    };
    if (hy >= y0) run(y0, hy);
    if (ly <= FELL) run(Math.max(ly, y0), FELL);
    // below the fell the same ends are woven in, packed, and only show as the
    // ground of the cloth: one end in three, the weft covering the rest
    for (let y = FELL; y <= CUT; y++)
      if (((y + i) & 1) === 0) dot(g, xf + ox, y + oy, 0.34, ph);
  }
}

/** A shuttle: a pointed boat with the bobbin slot dark down its middle. */
function drawShuttle(g, x, y) {
  const cx = x, cy = y + 0.5;
  g.fillPolygon([[cx - 8, cy], [cx - 4.2, cy - 3], [cx + 4.2, cy - 3], [cx + 8, cy],
    [cx + 4.2, cy + 3], [cx - 4.2, cy + 3]], 1);
  g.fillRect(cx - 3.4, cy - 1, 6.8, 2, 0);
}

/**
 * The colon: two short woven bars of weft, beaten in a second at a time. The
 * one that is not being beaten sits a shade back in the cloth, so the pair
 * ticks with the seconds without ever reading as part of a numeral.
 */
function drawColon(g, ox, oy, f) {
  const phase = f.sec % 1;
  for (const [k, y] of [[0, 26], [1, 38]]) {
    const hit = Math.max(0, 1 - Math.abs(((phase + (k ? 0.5 : 0)) % 1) - 0.10) * 6);
    for (let j = 0; j < 5; j++)
      for (let i = 0; i < 4; i++) {
        const gx = COLON_X - 2 + i + ox, gy = y + j + oy;
        if (!weave(gx, gy, 0)) continue;
        const lv = j === 0 || j === 4 ? 0.45 : k === 0 || hit > 0.3 ? 1 : 0.7;
        dot(g, gx, gy, lv, (f.minuteKey & 7));
      }
  }
}

export default {
  name: 'Loom',
  blurb: 'The time woven into cloth: a shuttle throws a pick a second, and every minute a numeral frays out of the weave and is woven back as the next one.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  driver: 'full',

  frame(g, { fields: f, date, oled, night }) {
    const t = date.getTime() / 1000;
    const [ox, oy] = orbit(date, 2, 3);
    // the minute this is becoming, and the one it came from, both exact
    const nm = (f.m + 1) % 60, nh = nm === 0 ? (f.h + 1) % 24 : f.h;
    const pm = (f.m + 59) % 60, ph2 = f.m === 0 ? (f.h + 23) % 24 : f.h;
    const now = [f.h / 10 | 0, f.h % 10, f.m / 10 | 0, f.m % 10];
    const next = [nh / 10 | 0, nh % 10, nm / 10 | 0, nm % 10];
    const was = [ph2 / 10 | 0, ph2 % 10, pm / 10 | 0, pm % 10];
    const frayT = f.sec >= FRAY0 ? f.sec - FRAY0 : -1;
    const hourTurn = f.m === 0 && f.sec < 3.3;            // the harness re-dress
    const weaveEnd = hourTurn ? 2.9 : 2.4;                // when the last pick is in
    const s = shedState(f);
    const ph = f.minuteKey & 7;      // the dither walks the glass each minute
    // the hour: the harness is re-dressed, and a ripple runs down the whole
    // cloth, the weave lifting as the wave passes and settling behind it
    const ripple = hourTurn
      ? (y) => {
        const g0 = progress(f.sec, 0.06 + (y - FELL) * 0.032, 0.06 + (y - FELL) * 0.032 + 0.34);
        return g0 <= 0 || g0 >= 1 ? 0 : 3.2 * Math.sin(g0 * Math.PI);
      }
      : null;

    // ---- the cloth the numerals hang in: selvedge, cut edge, fringe
    for (let y = FELL; y <= CUT; y++) {
      if (((y + (f.m & 1)) & 1) === 0) { g.pixel(FX0 + ox, y + oy, 1); g.pixel(FX1 + ox, y + oy, 1); }
    }
    // the cut edge, and the warp ends hanging free below it, swinging together
    const swing = Math.sin(t * 1.25);
    for (let x = FX0; x <= FX1; x++) {
      const cy = CUT + Math.round(1.3 * Math.sin(x * 0.19 + 1.1) + 0.8 * Math.sin(x * 0.07));
      if (((x + (f.m & 1)) & 1) === 0) g.pixel(x + ox, cy + oy, 1);
      if ((x - FX0) % 5) continue;
      const len = 2 + Math.round(1.6 * noise(x, 3) + 1.6 * swing);
      const tip = Math.round(swing * 1.4);
      for (let y = cy + 2; y <= cy + 1 + len; y++) g.pixel(x + tip + ox, y + oy, 1);
    }
    // one loose thread lying on the cloth, new every minute
    const k = f.minuteKey % 9973;
    const ly0 = 51 + Math.round(3 * noise(k, 11)), lx0 = 10 + Math.round(24 * noise(k, 12));
    for (let i = 0; i < 22; i++) {
      const gx = lx0 + i + ox, gy = ly0 + Math.round(2 * Math.sin(i * 0.30 + k)) + oy;
      if (i % 3 !== 0) dot(g, gx, gy, 0.8);
    }

    if (ripple)
      for (let y = FELL + 1; y <= CUT; y++) {
        const dx = ripple(y), a = Math.abs(dx);
        if (a < 2.1) continue;
        // the crest of the wave: one line of threads lifted off the cloth
        const lv = 0.40 + 0.55 * (a - 2.1);
        for (let x = FX0; x <= FX1; x++)
          if ((x & 1) === 0) dot(g, x + Math.round(dx) + ox, y + oy, lv);
      }

    // ---- the numerals
    for (let i = 0; i < 4; i++) {
      const sl = SLOTS[i];
      const H = SIZES[sl.size].h;
      let d = now[i], warp = null;
      if (frayT >= 0 && now[i] !== next[i]) {
        // un-woven: the rows come loose from the fell down, each sliding out
        const sgn = i < 2 ? -1 : 1, seed = k + i * 31;
        const rows = [];                       // the row's throw, computed once
        warp = (gx, gy, v, u, level) => {
          const p = progress(frayT, (v / H) * 0.20, (v / H) * 0.20 + 0.31);
          if (p <= 0) return [gx, gy, level];
          if (p >= 1) return null;
          // the row comes loose and swings: it drops, drifts and goes slack
          const r = rows[v] || (rows[v] = [sgn * (4 + 8 * noise(v, seed)), 11 + 6 * noise(v, seed + 5)]);
          const dx = p * r[0] + 2.6 * p * Math.sin(gx * 0.34 + v * 0.5 + seed);
          const dy = p * p * r[1];
          const X = gx + dx, Y = gy + dy;
          return dither(X, Y, 1.15 - p * 1.2) ? [X, Y, 1] : null;
        };
      } else if (f.sec < weaveEnd && now[i] !== was[i]) {
        // woven again: a pick a row, sweeping the cloth, the front left of the
        // row it has passed, rows following each other down from the fell
        const sl2 = hourTurn ? 1.5 : 0.55;
        warp = (gx, gy, v, u, level) => {
          const at = (v / H) * sl2 + ((gx - FX0) / (FX1 - FX0)) * 0.55;
          if (f.sec < at) return null;
          return [gx, gy, f.sec < at + 0.09 ? 1 : level];
        };
      }
      if (ripple) {
        const inner = warp;
        warp = (gx2, gy2, v2, u2, lv2) => {
          const r = inner ? inner(gx2, gy2, v2, u2, lv2) : [gx2, gy2, lv2];
          return r && [Math.round(r[0] + ripple(r[1])), r[1], r[2]];
        };
      }
      drawDigit(g, d, sl.x + ox, sl.y + oy, sl.size, sl.size === 'hour' ? 1 : 0, warp);
    }
    drawColon(g, ox, oy, f);

    // ---- the fell: the line every pick is beaten into, and the bare warp
    // above it stops there. It brightens as the reed comes down, and on the
    // hour the reed slams the full width and knocks the edge out of true.
    const slam = hourTurn ? Math.max(0, 1 - f.sec / 0.55) : 0;
    const fellLv = Math.max(0.55 + 0.45 * s.beat * s.fade, slam);
    const fellY = FELL + (ripple ? Math.round(ripple(FELL)) : 0);
    for (let x = FX0; x <= FX1; x++) dot(g, x + ox, fellY + oy, fellLv, ph);

    // ---- the weft: the thread the shuttle trails, then the pick beaten home
    const flying = s.p < 0.66;
    if (flying) {
      const tip = Math.round(s.sx), end = Math.round(s.x0), fresh = Math.round(s.sx - s.dir * 11);
      for (let x = Math.min(end, tip); x <= Math.max(end, tip); x++) {
        if (dither(x, SHED_Y, 0.55)) g.pixel(x + ox, SHED_Y + oy, 1);
        if (x >= Math.min(fresh, tip) && x <= Math.max(fresh, tip)) g.pixel(x + ox, SHED_Y + oy, 1);
      }
    } else {
      const py = Math.round(lerp(SHED_Y, FELL, s.beat));
      for (let x = FX0; x <= FX1; x++) if (dither(x, py, s.fade * 0.9)) g.pixel(x + ox, py + oy, 1);
    }

    // ---- the warp ends, and the shuttle in the shed
    drawWarp(g, s, ph, ox, oy);
    drawShuttle(g, s.sx + ox, SHED_Y + oy);

    oled.contrast(DAY + (NIGHT - DAY) * night);
  },
};
