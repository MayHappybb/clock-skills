// Turing — the time is grown, not drawn.
//
// The glass is a culture dish. Two things live in it: a coral, and the food
// that decides where the coral may grow. The food is the time. A numeral is a
// trough of feed spread along its strokes; the coral fills the troughs and
// spills a dying fringe into the open water around them. So the numerals are
// not letterforms painted on the plate — they are the places the chemistry is
// fed, and what you read is the colony, never the letter. Between the digits
// the water is almost barren: the reef's front stalls a few pixels out and
// starves, which is what gives each numeral its ragged, advancing edge and
// the black current running between them.
//
// The two pairs are two species. The hours are a small, dense *mat* of round
// cells that nearly fills its strokes; the minutes are a larger, looser
// *coral* with open water inside it and fingers at the edge. They do not sit
// on one line — hours small at the top left, minutes big at the bottom
// right, a diagonal of black water between them — so the plate reads as one
// reef with a current through it, and not as four digits in a row.
//
// The field is closed form, and deliberately so. A real Gray-Scott
// integration was built first and thrown away: on this lattice its cells come
// out about fifteen cells across at every feed that survives from a disturbed
// start, which is wider than a numeral's stroke, so a trough can never hold
// one — the colony bleeds into the open water and no digit appears. Reaching
// a two-cell cell needs du ~ 0.03, where every (F, k) collapses to the
// trivial state, and a run long enough to develop a colony is thousands of
// steps, far outside the frame budget. So the dish holds the reaction-
// diffusion *look*: two noise fields of different cell size, one cut into
// filaments, warped by two slower fields that travel in different directions —
// which is what makes a Turing pattern's fingered, labyrinthine,
// never-settling character. It is driven by the feed the numerals define,
// which is what makes it a mechanism and not a font. (The measurements are in
// the note at the foot of the file.)
//
// The minute: the changed digit's trough changes shape over about a second
// and a half. The food moves out of the old strokes and into the new ones, so
// the new numeral's colony blooms up while the old one starves and thins to
// nothing — the new shape grows out of the reef. On the hour a crest of feed
// sweeps the whole dish and the reef is scrubbed and re-seeded in one pass.
//
// Burn-in: the reef is different every second and no pixel is lit all day;
// the digits also walk kit.orbit so the dense parts move. Night dims the
// panel.

import { dither, orbit, clockFields, previousMinute, clamp } from '../js/kit.js';

// ------------------------------------------------------------ the dish
const SW = 64, SH = 32;               // the letterform lattice: 2 screen pixels per cell
const N = SW * SH;
const PX = 2;
const W = 128, H = 64;
const SC = SW * PX;                   // the stroke masks are rasterised at screen resolution

// Two species. `ink` is how much of a stroke the mat fills at the crest,
// `fine` how much of the finer finger-noise it uses, `fr` how strongly its
// fringe throws tendrils into the open water.
const HOUR = { box: [9, 13], at: [[3, 3], [13, 3]], pen: 1.35, grow: 1.3, ink: 0.55, fine: 0.10, fr: 0.44 };
const MIN = { box: [13, 19], at: [[30, 9], [46, 9]], pen: 1.5, grow: 1.5, ink: 0.30, fine: 0.75, fr: 0.44 };
const SLOTS = [
  { x: HOUR.at[0][0], y: HOUR.at[0][1], c: HOUR },
  { x: HOUR.at[1][0], y: HOUR.at[1][1], c: HOUR },
  { x: MIN.at[0][0], y: MIN.at[0][1], c: MIN },
  { x: MIN.at[1][0], y: MIN.at[1][1], c: MIN },
];

// ------------------------------------------------------------ letterforms
//
// Each numeral is a pen stroke along a centre-line in a unit box (x across,
// y down), rasterised into the feed. They are my own hand: rounded, a little
// bowed, no serifs — the 2's spine one long curve, the 6 and 9 a stroke that
// closes into a bowl, the 8 two lobes of different size, the 4 open at the
// top. A numeral is a trough of food; its colony is whatever grows in it.

/** Points along an ellipse arc: a0..a1 radians, 0 = right, y down. */
function arc(cx, cy, rx, ry, a0, a1, n = 16) {
  const p = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    p.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return p;
}
const TAU = 2 * Math.PI;
const GLYPHS = {
  0: [arc(0.5, 0.5, 0.32, 0.42, 0, TAU, 32)],
  1: [[[0.30, 0.24], [0.50, 0.07], [0.50, 0.93]], [[0.26, 0.93], [0.75, 0.93]]],
  2: [[...arc(0.5, 0.32, 0.32, 0.25, Math.PI, 0, 14), [0.15, 0.93], [0.86, 0.93]]],
  3: [[[0.20, 0.19], ...arc(0.44, 0.28, 0.30, 0.21, -0.5, 1.9, 12).slice(1),
    ...arc(0.44, 0.70, 0.32, 0.24, -1.9, 0.8, 14).slice(1), [0.20, 0.83]]],
  4: [[[0.68, 0.06], [0.14, 0.63], [0.90, 0.63]], [[0.71, 0.06], [0.71, 0.94]]],
  5: [[[0.82, 0.08], [0.24, 0.08], [0.20, 0.42],
    ...arc(0.50, 0.66, 0.31, 0.28, -1.25, 1.35, 20).slice(1)]],
  6: [[[0.72, 0.07], [0.36, 0.20], [0.20, 0.56], ...arc(0.50, 0.68, 0.30, 0.25, Math.PI, 3 * Math.PI, 26)]],
  7: [[[0.14, 0.08], [0.86, 0.08], ...arc(0.50, 0.09, 0.36, 0.13, 0, 1.05, 6).slice(1), [0.40, 0.94]]],
  8: [[...arc(0.50, 0.28, 0.25, 0.21, 0, TAU, 22)],
    [...arc(0.50, 0.71, 0.30, 0.23, 0, TAU, 24)]],
  9: [[[0.28, 0.93], [0.64, 0.80], [0.80, 0.44], ...arc(0.50, 0.32, 0.30, 0.25, 0, TAU, 26)]],
};

/** Distance from (px,py) to a polyline, in the same units. */
function polyDist(pts, px, py) {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const ax = pts[i - 1][0], ay = pts[i - 1][1], bx = pts[i][0], by = pts[i][1];
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    let u = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    u = u < 0 ? 0 : u > 1 ? 1 : u;
    const qx = ax + u * dx - px, qy = ay + u * dy - py;
    const d = qx * qx + qy * qy;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

/**
 * The soft feed trough of one digit in one slot, rasterised at screen
 * resolution (the pen is measured in cells, so it is doubled here). `grow`
 * extra cells give the wider, weaker fringe mask.
 */
function trough(slot, digit, grow) {
  const [bw, bh] = slot.c.box, pen = (slot.c.pen + grow) * PX;
  const out = new Float32Array(SC * H);
  const paths = GLYPHS[digit].map((p) => p.map(([x, y]) => [(slot.x + x * bw) * PX, (slot.y + y * bh) * PX]));
  const x0 = Math.max(0, Math.floor((slot.x - grow - 3) * PX)), x1 = Math.min(SC, Math.ceil((slot.x + bw + grow + 3) * PX));
  const y0 = Math.max(0, Math.floor((slot.y - grow - 3) * PX)), y1 = Math.min(H, Math.ceil((slot.y + bh + grow + 3) * PX));
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      let d = Infinity;
      for (const p of paths) { const q = polyDist(p, x + 0.5, y + 0.5); if (q < d) d = q; }
      const m = clamp((pen + 1.6 - d) / 2.0, 0, 1);      // solid to pen - 0.4, gone at pen + 1.6
      out[y * SC + x] = m * m * (3 - 2 * m);
    }
  return out;
}
// 4 slots x 10 digits, the stroke and its fringe, built once.
const D10 = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const TROUGH = SLOTS.map((s) => D10.map((d) => trough(s, d, 0)));
const FRINGE = SLOTS.map((s) => D10.map((d) => trough(s, d, s.c.grow)));

// ------------------------------------------------------------ the culture

function h2(x, y, s) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** Smooth 2D value noise in [0,1]. */
function vn(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = h2(xi, yi, s), b = h2(xi + 1, yi, s), c = h2(xi, yi + 1, s), d = h2(xi + 1, yi + 1, s);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}

// The two travelling warp fields that stir the culture, on the coarse
// lattice. They move in different directions, so the reef boils in place
// instead of sliding across the glass.
const warps = [new Float32Array(N), new Float32Array(N)];
function stir(tt) {
  const [a, b] = warps;
  for (let y = 0; y < SH; y++) {
    const ro = y * SW;
    for (let x = 0; x < SW; x++) {
      a[ro + x] = vn(x * 0.13 + tt * 0.50, y * 0.13 - tt * 0.33, 11);
      b[ro + x] = vn(x * 0.13 - tt * 0.27, y * 0.13 + tt * 0.44, 23);
    }
  }
}

// ------------------------------------------------------------ face

// The feed, this frame. core and fringe are kept at screen resolution so the
// edge of a numeral is crisp; the species is a property of the slot alone, so
// it is kept on the coarse lattice.
const core = new Float32Array(SC * H);   // the stroke of a numeral
const frin = new Float32Array(SC * H);   // its fringe
const inkA = new Float32Array(N);        // the species' fill, finger mix and fringe weight
const finA = new Float32Array(N);
const frA = new Float32Array(N);

const digitsOf = (c) => [+c.hh[0], +c.hh[1], +c.mm[0], +c.mm[1]];
const sm = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };

export default {
  name: 'Turing',
  blurb: 'The time as a reef: each numeral is a trough of feed and the coral that grows in it is the time — the minute digit re-seeds and blooms.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  driver: 'full',

  frame(g, { fields: f, date, oled, night }) {
    const [ox, oy] = orbit(date, 6, 3);
    const ocx = Math.round(ox / PX), ocy = Math.round(oy / PX);   // walk in cells

    // The turn: what was showing, what comes next, how far into it we are.
    const ahead = f.sec >= 30;
    const to = ahead ? clockFields(new Date(date.getTime() + 60000)) : f;
    const from = ahead ? f : previousMinute(date);
    const tau = ahead ? f.sec - 60 : f.sec;
    const hourTurn = to.m === 0;
    // e eases 0 -> 1 across the turn, so the same blend shows the old digits
    // until :00 and the new ones from then on, with the change spread across
    // the turn: the food moves, and the colony follows it.
    const e = hourTurn ? sm((tau + 0.4) / 2.4) : sm((tau + 0.15) / 1.5);
    const dOld = digitsOf(from), dNew = digitsOf(to);

    // Lay the feed. The strokes of the numerals are the only well-fed water.
    core.fill(0); frin.fill(0); inkA.fill(0); finA.fill(0); frA.fill(0);
    const dx = ocx * PX, dy = ocy * PX;                 // the burn-in walk, in pixels
    for (let s = 0; s < 4; s++) {
      const A = TROUGH[s][dOld[s]], B = TROUGH[s][dNew[s]];
      const FA = FRINGE[s][dOld[s]], FB = FRINGE[s][dNew[s]];
      const sp = s < 2 ? HOUR : MIN;
      for (let y = 0; y < H; y++) {
        const sy = y - dy;
        if (sy < 0 || sy >= H) continue;
        const ro = y * SC, so = sy * SC;
        for (let x = 0; x < SC; x++) {
          const sx = x - dx;
          if (sx < 0 || sx >= SC) continue;
          const i = ro + x, j = so + sx;
          const a = A[j], b = B[j];
          const fa = FA[j], fb = FB[j];
          if (a === 0 && b === 0 && fa === 0 && fb === 0) continue;
          const c = a + (b - a) * e;
          if (c > core[i]) core[i] = c;
          const q = fa + (fb - fa) * e;
          if (q > frin[i]) frin[i] = q;
        }
      }
      // The species is a property of the slot's own box, orbit included.
      const sx0 = SLOTS[s].x;
      const bx0 = Math.max(0, Math.floor(sx0 - 3) + ocx), bx1 = Math.min(SW, Math.ceil(sx0 + SLOTS[s].c.box[0] + 3) + ocx);
      const by0 = Math.max(0, Math.floor(SLOTS[s].y - 3) + ocy), by1 = Math.min(SH, Math.ceil(SLOTS[s].y + SLOTS[s].c.box[1] + 3) + ocy);
      for (let y = by0; y < by1; y++)
        for (let x = bx0; x < bx1; x++) { const i = y * SW + x; inkA[i] = sp.ink; finA[i] = sp.fine; frA[i] = sp.fr; }
    }

    // The hour: a crest of feed sweeps the dish and re-seeds it.
    const wave = hourTurn && tau > -1.6 && tau < 3.4 ? 1 - sm((tau + 1.6) / 2.0) : 0;
    const front = (tau + 1.6) * 26;
    // The minute: a bloom that peaks half way through the change.
    const bloom = !hourTurn && tau > -1.7 && tau < 2.9 ? e * (1 - e) : 0;

    // Stir the culture, then paint it at screen resolution.
    const tt = f.sec;
    stir(tt);
    const [wa, wb] = warps;
    const WAMP = 1.5;                     // cells the warp may push the coral
    const F1 = 0.30, F2 = 0.42;           // the two species' cell sizes
    for (let py = 0; py < H; py++) {
      const wro = (py >> 1) * SW, gy = py * 0.5;
      for (let px = 0; px < W; px++) {
        const ci = py * SC + px, si = wro + (px >> 1), gx = px * 0.5;
        const wx = WAMP * (wa[si] - 0.5), wy = WAMP * (wb[si] - 0.5);
        const c1 = vn((gx + wx) * F1 + tt * 0.10, (gy + wy) * F1 - tt * 0.07, 37);
        const c2 = vn((gx + wx * 1.6) * F2 - tt * 0.13, (gy + wy * 1.6) * F2 + tt * 0.09, 53);
        const ridge = 1 - Math.abs(2 * c2 - 1);
        const fin = finA[si];
        // A hard edge: each colony is cells of about five pixels with dark
        // pores between them. A soft grey only reads as a wash at this size,
        // so there is no dithering inside the strokes — the cells are cells.
        const qh = (c1 - 0.40) * 5.5; const ch = qh < 0 ? 0 : qh > 1 ? 1 : qh;
        const qm = (c2 - 0.42) * 5.5; const cm = qm < 0 ? 0 : qm > 1 ? 1 : qm;
        const cell = ch + (cm - ch) * fin;
        const ink = inkA[si];
        // A few deep pores, where the medium is thinnest, so the mat is
        // eaten through in places and the coral reads as a web.
        const hole = (0.20 - c2) * 9;
        const h = hole < 0 ? 0 : hole > 1 ? 1 : hole;
        let d = core[ci] * (ink + (1 - ink) * cell) * (1 - 0.55 * h)
          + frin[ci] * frA[si] * (cell > 0.5 ? cm : cell);
        // Plankton: a few motes adrift in the open water, so the black is
        // never dead glass — but sparse, or it greys the whole dish.
        const mote = ridge - 0.90;
        if (mote > 0) { const bg = mote * 0.9; if (bg > d) d = bg; }
        if (wave > 0) {
          // A crest crossing the dish: a faint smooth front in the water, and
          // a hard flush of growth where it passes over a colony.
          const qw = px * 0.35 + py * 0.5;
          const g = Math.exp(-((qw - front) ** 2) / 45);
          const cover = core[ci] + 0.4 * frin[ci];
          d += wave * g * (0.62 + 0.6 * cover * cell);
        }
        if (bloom > 0) d += 0.6 * bloom * core[ci] * cell;
        if (d > 1) d = 1;
        const v = d * 1.25 - 0.03;
        if (v > 0.02) { const lv = v > 1 ? 1 : v; if (lv >= 1 || dither(px, py, lv)) g.pixel(px, py, 1); }
      }
    }

    oled.contrast(0xcf + (0x28 - 0xcf) * night);
  },
};

// ---------------------------------------------------------------------------
// The Gray-Scott measurements this design was steered by.
//
// Gray-Scott's cell size on a lattice is set by the PDE, not the grid: with
// the 9-point rule that is stable at dt = 1, the pattern comes out about
// ten to twenty cells across at F = 0.038 / k = 0.0605, at F = 0.0545 /
// k = 0.0625 and at F = 0.03 / k = 0.062 alike. On this lattice that is thirty screen
// pixels — ten times a numeral's stroke — so a trough can never hold one.
// Stepping seeded troughs 96 times leaves v flat at about 0.11 across the
// whole dish, with no digit in the picture: the colony bleeds out and the
// open water fills instead. A finer cell needs a smaller du, and du is not
// free: at du = 0.10 and 0.05 every (F, k) tried collapses to the trivial
// state (mean |v| under 0.002 after 6000 steps). A run that both develops and
// stays inside the frame budget would be tens of thousands of steps each
// frame. The closed-form field above keeps what matters — the fingered,
// labyrinthine, never-settling character of a Turing pattern, moved by
// travelling warp fields — and is driven by the feed the numerals define.
