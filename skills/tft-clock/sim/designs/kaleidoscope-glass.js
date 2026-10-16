// kaleidoscope: the object cell. Everything that lies loose between the two
// discs of frosted glass at the end of the tube: 28 glass rods (four
// seven-segment numerals' worth, plus the ones not in use, which lie in a
// heap round the rim, outside the 160 x 80 the eyepiece shows when the
// mirrors are open) and a scatter of beads, chips and seed beads.
//
// The cell is a disc of radius 90 round the screen centre (80, 40), so it
// covers the glass to its corners (89.4) and a lot more above and below.
// All coordinates here are screen coordinates; `ox, oy` shift them onto
// whatever canvas the cell is drawn into.

import { hex, mix, scale, clamp, lerp, ease, progress, rand, noise, TAU, sin, cos } from '../js/kit.js';

export const CX = 80, CY = 40, CELL_R = 90;

// Rod glass: deep, saturated, dark enough to read against the lit diffuser.
const ROD_GLASS = ['#b3122e', '#1d4bb8', '#127a45', '#6c2a9e', '#0b7f8f', '#c2410f', '#9c1460', '#2a3f9a'].map(hex);
// Loose glass: lighter tints, so it sits behind the rods.
const LOOSE_GLASS = ['#f2b21b', '#e8556d', '#53b6e8', '#8fd14f', '#f07f2a', '#b78ce8', '#ffd84a', '#3fc9b0', '#ff8fb0', '#e8556d'].map(hex);

// ------------------------------------------------------------ rods and numerals

export const DIGIT_X = [8, 40, 92, 124];
export const DIGIT_Y = 13, DIGIT_W = 28, DIGIT_H = 54;
const SEGS = {
  0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc',
  5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg',
};
const SEG_ORDER = 'abcdefg';

/** The pose of segment `s` of a numeral at x: centre, half-length, angle. */
function segPose(x, s) {
  const y = DIGIT_Y, w = DIGIT_W, h = DIGIT_H, m = h / 2;
  const H = (cx, cy) => ({ x: cx, y: cy, a: 0 });
  const V = (cx, cy) => ({ x: cx, y: cy, a: Math.PI / 2 });
  switch (s) {
    case 'a': return H(x + w / 2, y + 3);
    case 'g': return H(x + w / 2, y + m);
    case 'd': return H(x + w / 2, y + h - 3);
    case 'b': return V(x + w - 3, y + m / 2 + 1);
    case 'c': return V(x + w - 3, y + m + m / 2 - 1);
    case 'e': return V(x + 3, y + m + m / 2 - 1);
    case 'f': return V(x + 3, y + m / 2 + 1);
  }
}

export const ROD_HALF = 9.2, ROD_W = 6;

/** 28 rods: id = digit * 7 + segment. Each has a home in a numeral and a parking place in the heap. */
export const RODS = [];
{
  // Parking places: rows above and below the screen, inside the cell.
  const spots = [];
  for (const [dy, side] of [[-48, -1], [-60, -1], [-72, -1], [48, 1], [60, 1], [72, 1]]) {
    const half = Math.sqrt(84 * 84 - dy * dy) - 10;
    const n = Math.max(1, Math.floor((2 * half) / 15) + 1);
    for (let k = 0; k < n; k++) {
      const x = CX - half + (n === 1 ? half : (2 * half * k) / (n - 1));
      spots.push({ x, y: CY + dy, side, used: false });
    }
  }
  for (let i = 0; i < 4; i++)
    for (const s of SEG_ORDER) {
      const home = segPose(DIGIT_X[i], s);
      const id = RODS.length;
      const side = home.y < CY ? -1 : 1;
      // nearest free spot on the same side
      let best = null, bd = Infinity;
      for (const sp of spots) {
        if (sp.used || sp.side !== side) continue;
        const d = (sp.x - home.x) ** 2 + (sp.y - home.y) ** 2 * 0.3;
        if (d < bd) { bd = d; best = sp; }
      }
      best.used = true;
      const park = {
        x: best.x + (rand(id, 1) - 0.5) * 5,
        y: best.y + (rand(id, 2) - 0.5) * 3,
        a: (rand(id, 3) - 0.5) * 0.9,
      };
      RODS.push({ id, digit: i, seg: s, home, park, col: ROD_GLASS[(id * 5 + i * 3) % ROD_GLASS.length] });
    }
}

/** Is rod `r` part of the numeral string `ds` (four characters)? */
export const lit = (r, ds) => SEGS[ds[r.digit]].includes(r.seg);
export const poseFor = (r, ds) => (lit(r, ds) ? r.home : r.park);

/** Rotate point (x, y) round the cell centre by `a`. */
function spin(x, y, a) {
  const c = cos(a), s = sin(a), dx = x - CX, dy = y - CY;
  return [CX + dx * c - dy * s, CY + dx * s + dy * c];
}

/**
 * Tumble ease: a short smooth start, a steady middle, a short smooth stop.
 * (A cubic ease dwells too long near the ends, where the numerals are
 * still intact; this leaves them quickly.)
 */
const RAMP = 0.15, VMAX = 1 / (1 - RAMP);
export function tumbleEase(x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  if (x < RAMP) return (VMAX * x * x) / (2 * RAMP);
  if (x > 1 - RAMP) return 1 - (VMAX * (1 - x) * (1 - x)) / (2 * RAMP);
  return VMAX * (x - RAMP / 2);
}

/**
 * Where each rod is. `from`/`to` are the numerals before and after a turn
 * of the drum; `tt` seconds since the tumble began; each rod tumbles for
 * `span` seconds, starting up to `spread` seconds late. `turns` is how
 * many times the drum goes round (whole turns: the rods come back to
 * rest exactly), `seed` this turn's randomness, `tsec` the idle drift.
 *
 * Every rod also spins on its own axis by one or two half-turns, and
 * neighbouring segments of a numeral never share a count,
 * so a numeral is only intact near the very start and end of its tumble.
 * Returns the poses and the least and most advanced rods' progress
 * (`eMin`, `eMax`): the mirrors use them to stay open whenever a numeral
 * could be whole.
 */
export function rodPoses(from, to, tt, span, spread, turns, seed, tsec) {
  const out = [];
  let eMin = 1, eMax = 0;
  for (const r of RODS) {
    const A = poseFor(r, from), Bp = poseFor(r, to);
    // each numeral's rods start together (so within a numeral the rods'
    // angles differ by exactly e half-turns), the numerals a little apart
    const d0 = spread * rand(r.digit, seed, 7);
    const e = tumbleEase((tt - d0) / span);
    if (e < eMin) eMin = e;
    if (e > eMax) eMax = e;
    // slide from the old place to the new one through the middle of the turn
    const u = ease.inOutQuad(progress(e, 0.25, 0.75));
    let x = lerp(A.x, Bp.x, u), y = lerp(A.y, Bp.y, u);
    // the drum turns: whole turns, so where it ends is where u put it
    const dir = turns >= 0 ? 1 : -1;
    const lag = TAU * Math.abs(turns) * e * dir;
    // and the rods fall towards the middle as they tumble
    const squeeze = 1 - 0.3 * sin(Math.PI * e);
    x = CX + (x - CX) * squeeze; y = CY + (y - CY) * squeeze;
    [x, y] = spin(x, y, lag);
    // each rod's own tumble: whole half-turns, so it lands the right way.
    // One or two, alternating along the segments a..g: every numeral has
    // two neighbouring segments, so it always holds rods that differ by
    // exactly one half-turn, which line up again only at the very ends.
    // (Counts two apart would line up halfway, and a numeral made of
    // only those would come back whole mid-tumble.) Neither alternate
    // set alone (a c e g, or b d f) contains any numeral.
    const flips = 1 + ((r.id + seed) % 2);
    let a = lerp(A.a, Bp.a, u) + lag + Math.PI * flips * e * dir;
    // idle: the cell is filled with a little oil; everything sways
    const w = 0.45;
    x += w * (noise(tsec * 0.35 + r.id * 3.1, 11) - 0.5) * 2;
    y += w * (noise(tsec * 0.31 + r.id * 5.7, 12) - 0.5) * 2;
    a += 0.035 * (noise(tsec * 0.27 + r.id * 1.9, 13) - 0.5) * 2;
    out.push({ r, x, y, a });
  }
  return { poses: out, eMin, eMax };
}

/** A glass rod: a translucent body, a bright streak where the light comes through, a dark band of refraction. */
export function drawRod(g, ox, oy, rp, tone) {
  const { r, x, y, a } = rp;
  const c = cos(a) * ROD_HALF, s = sin(a) * ROD_HALF;
  const x0 = x - c + ox, y0 = y - s + oy, x1 = x + c + ox, y1 = y + s + oy;
  const col = tone(r.col);
  g.thickLine(x0, y0, x1, y1, ROD_W, col, { aa: true, a: 0.9 });
  // light from the upper left, in screen terms: the streak sits on the side facing it
  const nx = -sin(a), ny = cos(a);
  const side = nx + ny > 0 ? -1 : 1;
  const sx = nx * side * 1.2, sy = ny * side * 1.2;
  g.thickLine(x0 + sx, y0 + sy, x1 + sx, y1 + sy, 1.6, mix(col, 0xffffff, 0.55), { aa: true, a: 0.85 });
  g.thickLine(x0 - sx * 1.1, y0 - sy * 1.1, x1 - sx * 1.1, y1 - sy * 1.1, 1.2, scale(col, 0.55), { aa: true, a: 0.7 });
  g.fillCircle(x0 + sx + c * 0.12, y0 + sy + s * 0.12, 0.9, 0xffffff, { aa: true, a: 0.9 });
}

// ------------------------------------------------------------ loose glass

// Periods that divide a day, so the drift has no seam at midnight.
const PERIODS = [60, 72, 80, 90, 96, 120, 144, 160, 180, 240, 300];

export const LOOSE = [];
{
  const N = 46;
  for (let i = 0; i < N; i++) {
    const k = rand(i, 101);
    const type = k < 0.42 ? 'bead' : k < 0.78 ? 'chip' : k < 0.92 ? 'seed' : 'sequin';
    // spread evenly over the disc's area, keeping out of the very centre
    const r0 = 14 + 72 * Math.sqrt(rand(i, 102));
    const th0 = rand(i, 103) * TAU;
    const size = type === 'bead' ? 2.2 + 2.6 * rand(i, 104) : type === 'chip' ? 3.5 + 4 * rand(i, 104) : type === 'seed' ? 1.8 : 3.2;
    const verts = [];
    const nv = 3 + Math.floor(rand(i, 105) * 2);
    for (let v = 0; v < nv; v++) {
      const aa = (v / nv) * TAU + (rand(i, 106 + v) - 0.5) * 1.1;
      verts.push([aa, 0.6 + 0.5 * rand(i, 120 + v)]);
    }
    LOOSE.push({
      i, type, r0, th0, size, verts,
      col: LOOSE_GLASS[Math.floor(rand(i, 107) * LOOSE_GLASS.length)],
      period: PERIODS[i % PERIODS.length] * (rand(i, 108) < 0.5 ? 1 : -1),
      spin: (1 + Math.floor(rand(i, 109) * 3)) * (rand(i, 110) < 0.5 ? 1 : -1),
      a: (rand(i, 111) - 0.5) * 0.18,
    });
  }
}

/**
 * Where the loose glass is: a slow orbit (seconds of the day), plus `e`
 * (0..1) of a drum turn of `turns` revolutions. Each piece goes round a
 * whole number of times and spins a whole number of times, so a turn
 * ends exactly where it started.
 */
export function loosePoses(tday, e, turns, tsec) {
  return LOOSE.map((b) => {
    const nb = 1 + (b.i % 2);
    const th = b.th0 + TAU * (tday / b.period) + TAU * e * turns * nb;
    const r = clamp(b.r0 + 4 * (noise(tsec * 0.07 + b.i * 2.3, 31) - 0.5), 4, 86);
    return { b, x: CX + r * cos(th), y: CY + r * sin(th), rot: TAU * (tday / Math.abs(b.period)) * b.spin + TAU * e * b.spin };
  });
}

export function drawLoose(g, ox, oy, lp, tone) {
  const { b, x, y, rot } = lp;
  const X = x + ox, Y = y + oy, col = tone(b.col);
  if (b.type === 'bead') {
    g.fillCircle(X, Y, b.size, col, { aa: true, a: 0.62 });
    g.fillCircle(X - b.size * 0.35, Y - b.size * 0.35, b.size * 0.38, 0xffffff, { aa: true, a: 0.75 });
  } else if (b.type === 'chip') {
    const pts = b.verts.map(([a, k]) => [X + cos(a + rot) * b.size * k, Y + sin(a + rot) * b.size * k]);
    g.fillPolygon(pts, col, { aa: true, a: 0.55 });
  } else if (b.type === 'seed') {
    g.ring(X, Y, 0.8, b.size, col, { aa: true, a: 0.8 });
  } else {
    // a sequin: a flat foil disc, edge-on as it turns, glinting when flat
    const f = Math.abs(cos(rot));
    g.fillEllipse(X, Y, b.size, Math.max(0.6, b.size * f), mix(col, 0xffffff, 0.25), { aa: true, a: 0.85 });
    if (f > 0.93) g.fillCircle(X, Y, 1.1, 0xffffff, { aa: true });
  }
}

// ------------------------------------------------------------ the colon

/** Two cobalt beads at the centre of everything: the mirrors' vertex sits between them. */
export function drawColon(g, ox, oy, tone, tsec) {
  for (const [k, yy] of [[0, 30], [1, 50]]) {
    const x = CX + ox + 0.4 * (noise(tsec * 0.3 + k * 9, 41) - 0.5);
    const y = yy + oy;
    g.fillCircle(x, y, 3.6, tone(hex('#1d3fa8')), { aa: true, a: 0.9 });
    g.fillCircle(x - 1.2, y - 1.2, 1.3, 0xffffff, { aa: true, a: 0.85 });
  }
}

// ------------------------------------------------------------ the light behind the cell

// The kaleidoscope is held up to the window by day and to a lamp at night.
const LIGHT = [
  [0, '#e2b06c'], [5, '#e6c08e'], [6.5, '#e9e4dc'], [8, '#eef2f2'], [12, '#f8f4e8'],
  [16, '#f8eedb'], [18.5, '#f6d9b6'], [20, '#f0c296'], [21.5, '#e6b47c'], [24, '#e2b06c'],
].map(([h, c]) => [h, hex(c)]);

export function lightAt(hours) {
  for (let i = 1; i < LIGHT.length; i++)
    if (hours <= LIGHT[i][0]) {
      const [h0, c0] = LIGHT[i - 1], [h1, c1] = LIGHT[i];
      return mix(c0, c1, (hours - h0) / (h1 - h0));
    }
  return LIGHT[0][1];
}
