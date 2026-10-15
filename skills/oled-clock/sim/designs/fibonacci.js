// Fibonacci — Philippe Chrétien's Fibonacci Clock (2015), hung as a Mondrian.
//
// Five squares of sides 1, 1, 2, 3 and 5 tile a 5 x 8 rectangle. The rules
// are the original's (github.com/pchretien/fibo): a square in the hour
// colour counts towards the hour, one in the minute colour towards the
// minutes (in fives), one in the "both" colour towards both, and an empty
// square towards neither. Add up the squares' sides. The original's LEDs are
// red, green and blue; on a 1-bit panel the three colours are three
// textures: HOURS solid, MINUTES diagonal hatch, BOTH fine dots, and an empty
// square is a bare outline. The black between the squares is the painting's
// grid. Hours run 1..12 (12 lights every square: the original shows nothing
// at 12, which is also its "0"), minutes are floored to fives as on the
// original, and the remaining 0-4 minutes are four pips in the legend
// column, so the reading is exact.
//
// Most times have several paintings (10:20 has 22). A new one is chosen
// every minute, deterministically from the minute: within each five-minute
// block the choices walk a seeded permutation of every valid painting, so
// two neighbouring minutes never show the same one, and a still at any
// instant agrees with the animation around it.
//
// The seconds: the golden spiral, a quarter circle through each square in
// Fibonacci order, draws itself over the minute at constant speed, so it
// spends 5 s in each 1-square, 10 s in the 2, 15 s in the 3 and 25 s in the 5
// (five seconds per unit of side). At the minute a bright comet runs the
// whole spiral from its eye outward in 0.6 s, wiping it, and each square
// whose colour changes turns over as the comet enters it. Every flip
// overlaps every other (the sweep is shorter than one flip), so the
// painting is never part old and part new while settled.
//
// The hour: a grand recomposition. Each hour the painting hangs in one of
// its four mirror images (the 5-square to the right or left, the 3 below or
// above). On the hour every square lifts off the wall, glides to its place
// in the new composition in Fibonacci order (1, 1, 2, 3, 5), turning over in
// flight, and they all set down together with a thump and a one-frame
// inverse flash: for that instant the panel is a real Mondrian, black lines
// on white.
//
// Burn-in: the painting and the legend walk their own 2-pixel orbits, the
// legend's rows take turns at the top hour by hour, and the painting
// changes every minute and mirrors every hour.

import { orbit, clockFields, ease, clamp, OFF, ON, sprite } from '../js/kit.js';

const U = 12;                 // pixels per unit of side
const PW = 8 * U, PH = 5 * U; // the painting: 96 x 60
const GAP = 1;                // each square is inset this much on every side (black grid = 2 px)
const DAY = 0xcf, NIGHT = 0x18;

// Squares in spiral order (eye outward), base composition: x, y, side in units.
const SQUARES = [
  { v: 1, x: 2, y: 1 },
  { v: 1, x: 2, y: 0 },
  { v: 2, x: 0, y: 0 },
  { v: 3, x: 0, y: 2 },
  { v: 5, x: 3, y: 0 },
];
// The golden spiral's quarter arcs, one per square: centre, radius, start and end angle (screen, y down).
const ARCS = [
  [2, 1, 1, Math.PI / 2, 0],
  [2, 1, 1, 0, -Math.PI / 2],
  [2, 2, 2, -Math.PI / 2, -Math.PI],
  [3, 2, 3, -Math.PI, -1.5 * Math.PI],
  [3, 0, 5, -1.5 * Math.PI, -2 * Math.PI],
];
const VALUES = SQUARES.map((s) => s.v);

// ------------------------------------------------------------ compositions

/** Composition `k` (0..3): bit 0 mirrors left-right, bit 1 top-bottom. */
const variantOf = (hour) => hour % 4;
const mapPt = (k, x, y) => [k & 1 ? 8 - x : x, k & 2 ? 5 - y : y];

/** Pixel rects of the squares (before the orbit offset) in composition k. */
const RECTS = [0, 1, 2, 3].map((k) => SQUARES.map((s) => {
  const x = k & 1 ? 8 - s.x - s.v : s.x, y = k & 2 ? 5 - s.y - s.v : s.y;
  return { x: x * U + GAP, y: y * U + GAP, w: s.v * U - 2 * GAP, h: s.v * U - 2 * GAP };
}));

/** The spiral as points every ~0.5 px with cumulative length, per composition. */
const SPIRAL = [0, 1, 2, 3].map((k) => {
  const pts = [];
  let len = 0;
  const starts = [];
  for (const [cx, cy, r, a0, a1] of ARCS) {
    starts.push(len);
    const n = Math.ceil(Math.abs(a1 - a0) * r * U * 2);
    for (let i = pts.length ? 1 : 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      const [x, y] = mapPt(k, cx + r * Math.cos(a), cy + r * Math.sin(a));
      const p = [x * U, y * U];
      if (pts.length) { const q = pts[pts.length - 1]; len += Math.hypot(p[0] - q[0], p[1] - q[1]); }
      pts.push([p[0], p[1], len]);
    }
  }
  return { pts, len, starts };
});

// ------------------------------------------------------------ paintings

/** Every subset of the five squares (bit i = square i) whose sides add up to v. */
const SUBSETS = [];
for (let v = 0; v <= 12; v++) {
  SUBSETS[v] = [];
  for (let m = 0; m < 32; m++) {
    let s = 0;
    for (let i = 0; i < 5; i++) if (m & (1 << i)) s += VALUES[i];
    if (s === v) SUBSETS[v].push(m);
  }
}

function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

const PAINTINGS = new Map();
/** The painting shown during minute-since-epoch `K`: per-square state 0 empty, 1 hours, 2 minutes, 3 both. */
export function paintingAt(K) {
  if (PAINTINGS.has(K)) return PAINTINGS.get(K);
  const f = clockFields(new Date(K * 60000));
  const H = f.h12, M5 = Math.floor(f.m / 5);
  const opts = [];
  for (const hm of SUBSETS[H]) for (const mm of SUBSETS[M5]) opts.push([hm, mm]);
  // A seeded permutation of the options, fixed for this five-minute block;
  // consecutive minutes take consecutive entries, so they always differ.
  const block = Math.floor(K / 5);
  const rand = rng(block * 2654435761 + H * 97 + M5);
  const perm = opts.map((_, i) => i);
  for (let i = perm.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  const [hm, mm] = opts[perm[(K % 5 + Math.floor(rand() * 5)) % opts.length]];
  const p = {
    state: VALUES.map((_, i) => ((hm >> i) & 1) | (((mm >> i) & 1) << 1)),
    variant: variantOf(f.h),
    rem: f.m % 5,
    pm: f.pm,
    hour: f.m === 0,
  };
  if (PAINTINGS.size > 64) PAINTINGS.clear();
  PAINTINGS.set(K, p);
  return p;
}

// ------------------------------------------------------------ textures

/** Is texel (lx, ly) of a square in `state` lit? Coordinates are local to the square. */
function texel(state, lx, ly, w, h) {
  const d = Math.min(lx, ly, w - 1 - lx, h - 1 - ly);            // distance in from the square's edge
  if (d === 0) return true;                                       // every square is framed
  if (d === 1 || state === 0) return false;                       // a black gutter; empty squares stay empty
  if (state === 1) return true;                                   // hours: solid
  if (state === 2) return ((lx + ly) & 3) < 2;                    // minutes: diagonal hatch
  return (lx & 1) === 0 && (ly & 1) === 0;                        // both: fine dots
}

/**
 * Draw one square: rect r (pixels, canvas), in `state`, scaled about its
 * centre by (sx, sy) and moved by (dx, dy). The texture is anchored to the
 * square's corner, so it travels with the square. `key` clears a one-pixel
 * black keyline round it.
 */
function drawSquare(g, r, state, { sx = 1, sy = 1, dx = 0, dy = 0, key = false } = {}) {
  const cx = r.x + r.w / 2 + dx, cy = r.y + r.h / 2 + dy;
  const hw = (r.w * Math.abs(sx)) / 2, hh = (r.h * Math.abs(sy)) / 2;
  const x0 = Math.round(cx - hw), x1 = Math.round(cx + hw), y0 = Math.round(cy - hh), y1 = Math.round(cy + hh);
  if (key) g.fillRect(x0 - 1, y0 - 1, x1 - x0 + 2, y1 - y0 + 2, OFF);
  if (x1 <= x0 || y1 <= y0) return;
  const W = x1 - x0, Hh = y1 - y0;
  // The frame follows the scaled outline; the texture keeps its pitch
  // (a 2-pixel dot grid cannot be squeezed without aliasing into stripes).
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++)
      if (texel(state, x - x0, y - y0, W, Hh)) g.pixel(x, y, ON);
}

// ------------------------------------------------------------ the spiral

/** Light the spiral of composition k from length a to b, with a black keyline either side. */
function drawSpiral(g, k, a, b, ox, oy) {
  if (b <= a) return;
  const { pts } = SPIRAL[k];
  const on = [];
  for (const p of pts) if (p[2] >= a && p[2] <= b) on.push([Math.floor(ox + Math.min(p[0], PW - 0.5)), Math.floor(oy + Math.min(p[1], PH - 0.5))]);
  for (const [x, y] of on) { g.pixel(x - 1, y, OFF); g.pixel(x + 1, y, OFF); g.pixel(x, y - 1, OFF); g.pixel(x, y + 1, OFF); }
  for (const [x, y] of on) g.pixel(x, y, ON);
}

/** The point at length `s` along composition k's spiral. */
function spiralAt(k, s) {
  const { pts } = SPIRAL[k];
  let lo = 0, hi = pts.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (pts[m][2] < s) lo = m; else hi = m; }
  return [Math.min(pts[hi][0], PW - 0.5), Math.min(pts[hi][1], PH - 0.5)];
}

/** A bright head: a 3x3 plus with a keyline. */
function head(g, x, y, big = false) {
  x = Math.floor(x); y = Math.floor(y);
  const r = big ? 2 : 1;
  g.fillRect(x - r - 1, y - r - 1, 2 * r + 3, 2 * r + 3, OFF);
  g.fillRect(x - r, y, 2 * r + 1, 1); g.fillRect(x, y - r, 1, 2 * r + 1);
  if (big) g.fillRect(x - 1, y - 1, 3, 3);
}

// ------------------------------------------------------------ legend

const GLYPH = {
  H: sprite(['#.#', '#.#', '###', '#.#', '#.#']),
  M: sprite(['#...#', '##.##', '#.#.#', '#...#', '#...#']),
  '+': sprite(['...', '.#.', '###', '.#.', '...']),
  x: sprite(['...', '#.#', '.#.', '#.#', '...']),
  5: sprite(['###', '#..', '##.', '..#', '##.']),
  A: sprite(['.#.', '#.#', '###', '#.#', '#.#']),
  P: sprite(['##.', '#.#', '##.', '#..', '#..']),
  1: sprite(['.#', '##', '.#', '.#', '.#']),
};
function word(g, s, x, y) {
  for (const ch of s) { const gl = GLYPH[ch]; g.blit(gl, x, y); x += gl.w + 1; }
  return x;
}

/** One legend swatch: a small square in `state`, the same texture as the painting's. */
function swatch(g, x, y, state) {
  drawSquare(g, { x, y, w: 10, h: 10 }, state);
}

// ------------------------------------------------------------ timing

const COMET = 0.7;          // the comet runs the spiral, seconds
const FLIP = 0.75;          // one square turning over
const LIFT = 0.3, GLIDE = 1.1, GSTEP = 0.18, SETTLE = 0.35; // the hour
const LANDED = LIFT + 4 * GSTEP + GLIDE;                    // every square is over its new place
const HOUR_END = LANDED + SETTLE;
const PIP_T = 0.9;

export default {
  name: 'Fibonacci',
  blurb: 'Chrétien\'s Fibonacci clock as a Mondrian: hours solid, minutes hatched, both dotted; it repaints every minute and rehangs mirrored every hour.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,

  frame(g, { fields: f, date, oled, night }) {
    oled.contrast(Math.round(DAY + (NIGHT - DAY) * night));
    const K = f.minuteKey, tau = f.sec;
    const cur = paintingAt(K), prev = paintingAt(K - 1);
    const [ox, oy] = orbit(date, 2, 3);
    const PX = 2 + ox, PY = 2 + oy;
    const at = (r) => ({ x: r.x + PX, y: r.y + PY, w: r.w, h: r.h });
    const sp = SPIRAL[cur.variant];

    if (cur.hour && tau < HOUR_END) {
      // ---- the hour: lift, glide in Fibonacci order turning over, set down together.
      const lift = tau < LIFT ? 1 - 0.22 * ease.outQuad(tau / LIFT)
        : tau < LANDED ? 0.78 : 0.78 + 0.22 * ease.outBack(clamp((tau - LANDED) / SETTLE, 0, 1));
      const order = [4, 3, 2, 1, 0]; // biggest first, so the small ones fly over
      for (const i of order) {
        const from = at(RECTS[prev.variant][i]), to = at(RECTS[cur.variant][i]);
        const u = clamp((tau - LIFT - GSTEP * i) / GLIDE, 0, 1), e = ease.inOutCubic(u);
        const r = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, w: from.w, h: from.h };
        const turn = Math.cos(Math.PI * u);
        const state = u < 0.5 ? prev.state[i] : cur.state[i];
        drawSquare(g, r, state, { sx: lift * Math.max(0.08, Math.abs(turn)), sy: lift, key: true });
      }
      // The thump: one beat of inverse, a Mondrian proper.
      if (tau >= LANDED + 0.06 && tau < LANDED + 0.1) oled.invert(true);
    } else {
      // ---- a minute: squares whose colour changes turn over as the comet enters them.
      const flipping = tau < COMET + FLIP;
      for (let i = 0; i < 5; i++) {
        const r = at(RECTS[cur.variant][i]);
        if (!flipping || cur.hour) { drawSquare(g, r, cur.state[i]); continue; }
        const t0 = (COMET * sp.starts[i]) / sp.len;
        const u = clamp((tau - t0) / FLIP, 0, 1);
        if (prev.state[i] === cur.state[i]) {
          // Unchanged: it only nods as the comet goes by.
          const nod = 1 - 0.12 * Math.sin(Math.PI * u);
          drawSquare(g, r, cur.state[i], { sx: nod, sy: nod });
          continue;
        }
        const turn = Math.max(0.06, Math.abs(Math.cos(Math.PI * ease.inOutQuad(u))));
        const state = u < 0.5 ? prev.state[i] : cur.state[i];
        const lift = 1 - 0.12 * Math.sin(Math.PI * u);
        drawSquare(g, r, state, i & 1 ? { sx: lift, sy: turn * lift } : { sx: turn * lift, sy: lift });
      }
    }

    // ---- the seconds: the spiral draws itself, 5 s per unit of side.
    const hourBusy = cur.hour && tau < HOUR_END;
    if (!hourBusy) {
      const s = (sp.len * tau) / 60;
      if (tau < COMET && !cur.hour) {
        const c = sp.len * ease.inQuad(tau / COMET) ** 0.8;
        drawSpiral(g, prev.variant, c, sp.len, PX, PY);
        const [hx, hy] = spiralAt(prev.variant, c);
        head(g, PX + hx, PY + hy, true);
      }
      drawSpiral(g, cur.variant, 0, s, PX, PY);
      const [hx, hy] = spiralAt(cur.variant, s);
      head(g, PX + hx, PY + hy);
    }

    // ---- the legend column.
    const [lx, ly] = orbit(date, 2, 4);
    const LX = 102 + Math.min(lx, 1), LY = 2 + ly;
    // Two blocks, swatches and pips, that swap ends every hour; and the
    // swatch rows take turns at the top. Both spread the wear of the legend.
    // On the hour they glide to their new places with the painting.
    const lay = (h) => ({ sw: h & 1 ? 20 : 0, pip: h & 1 ? 0 : 44, rot: h % 3 });
    const now = lay(f.h), was = lay((f.h + 23) % 24);
    const e = cur.hour ? ease.inOutCubic(clamp((tau - LIFT) / (LANDED - LIFT), 0, 1)) : 1;
    const mix = (a, b) => Math.round(a + (b - a) * e);
    const PIP = LY + mix(was.pip, now.pip);
    [[1, 'H'], [2, 'Mx5'], [3, 'H+M']].forEach(([st, label], i) => {
      const y = LY + mix(was.sw + 12 * ((i + was.rot) % 3), now.sw + 12 * ((i + now.rot) % 3));
      if (e < 1) g.fillRect(LX - 1, y - 1, 26, 12, OFF); // keyline while the rows pass each other
      swatch(g, LX, y, st); word(g, label, LX + 12, y + 3);
    });
    // The remaining minutes: four pips, each one minute.
    if (e < 1) g.fillRect(LX - 1, PIP - 1, 26, 15, OFF);
    const pt = tau < PIP_T ? ease.outBack(tau / PIP_T) : 1;
    for (let k = 0; k < 4; k++) {
      const x = LX + k * 6, y = PIP;
      let size = 0;
      if (k < cur.rem) size = k === cur.rem - 1 && prev.rem === k ? pt : 1;
      else if (k < prev.rem && tau < PIP_T) size = 1 - ease.inQuad(tau / PIP_T);
      if (size > 0.15) {
        const sz = Math.max(1, Math.round(5 * Math.min(size, 1.15)));
        g.fillRect(x + Math.floor((5 - sz) / 2), y + Math.floor((5 - sz) / 2), sz, sz);
      } else { g.pixel(x, y); g.pixel(x + 4, y); g.pixel(x, y + 4); g.pixel(x + 4, y + 4); } // an empty socket: its corners
    }
    word(g, '+1', LX, PIP + 8);
    word(g, cur.pm ? 'P' : 'A', LX + 14, PIP + 8);
    word(g, 'M', LX + 18, PIP + 8);
  },
};
