// Swash — the sea writes the time in foam on the wet sand, and washes it away.
//
// The face is a stretch of shore seen from the air, the sea along the top of
// the glass and the beach below it. Nothing here is type: the time is a film of
// foam left stranded where the backwash drained, caught in the grooves the
// water has just cut. Foam is a material, so it behaves like one at every
// scale — the strokes are a churned mass with open water showing through in
// blobs, their edges break up into spray thrown down the beach, and the whole
// figure rides the swell: each stroke is lifted and dropped by the wave
// travelling along it, which is the motion you see every second.
//
// The minute is the tide's own gesture. The swell shoals, the waterline creeps
// up the sand, and at :00 the wave runs right over the glass: everything goes
// under a churning sheet of white, the old time is churned off the beach, and
// then the backwash drains. Draining is what writes. The water leaves last from
// the high ground, so the foam is stranded in the grooves the new time is cut
// into, and the digits surface at the receding edge — growing from the bottom
// of the glass up — until the water is back at the waterline and the time sits
// there fizzing in the sand.
//
// The hour is a spring tide: the whole glass floods and holds, the backwash
// drags out further and in deeper rills, and afterwards the waterline sits
// lower than it did — the tide has gone out — and creeps back over the next
// minutes.
//
// Between turns the sea keeps working: swells cross the water and break at the
// shore, the waterline lifts and drops with each one, and the foam of the time
// keeps popping and settling. The sand the time rests on is still wet and
// glistening for a second or two after the water has left it.
//
// Burn-in: the time walks a small orbit, the digits are new foam every minute
// (the hour digits every hour), the whole figure bobs on the swell, and the
// panel dims from 23:00 to 07:00.

import { clockFields, previousMinute, orbit, clamp, dither } from '../js/kit.js';

const W = 128, H = 32;

// Layout: four digits and a colon, sitting low enough to leave the sea above
// them and a little dry sand below.
const DW = 19, DH = 20;          // one digit's box
const TOP = 7;                   // its top row (before the burn-in orbit)
const GAP = 4, CW = 7;           // between digits, and the colon's width
const LEFT = 14;
const SLOT = [LEFT, LEFT + DW + GAP, LEFT + 2 * (DW + GAP) + CW, LEFT + 3 * (DW + GAP) + CW];
const COLON_X = LEFT + 2 * (DW + GAP);
const H2 = 3.0;                  // half a stroke's width, in the design box
const TAPER = 6;                 // a stroke thins to half over this many px at a free end
const GW = 21, GH = 23;          // the box the letterforms below were drawn in

// The shore. DEEP is where the deep water's edge sits between waves; a wave
// standing on the sand has to reach past the bottom of the glass to cover it,
// so a flood is measured in "cover": 0 at rest, 1 = the whole face under water.
const DEEP = 4.2;
const COVER_BOTTOM = H + 3;

// ------------------------------------------------------------ noise

/** Integer hash -> [0,1): the same input always gives the same foam. */
function hash(x, y, s) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/**
 * Smooth 2-D value noise in [0,1) — the tool every foam texture here is built
 * from. The hash is inlined: this runs a few thousand times a frame, and the
 * call overhead costs more than the arithmetic.
 */
function vn(x, y, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  let h = Math.imul(xi, 374761393) ^ Math.imul(yi, 668265263) ^ Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  const a = (h >>> 0) / 4294967296;
  h = Math.imul(xi + 1, 374761393) ^ Math.imul(yi, 668265263) ^ Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  const b = (h >>> 0) / 4294967296;
  h = Math.imul(xi, 374761393) ^ Math.imul(yi + 1, 668265263) ^ Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  const c = (h >>> 0) / 4294967296;
  h = Math.imul(xi + 1, 374761393) ^ Math.imul(yi + 1, 668265263) ^ Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  const d = (h >>> 0) / 4294967296;
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

const smoothstep = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

/**
 * Interleaved gradient noise, mixed with a little white: at a low level this
 * scatters evenly without the grid an ordered dither prints, which is what a
 * surface of loose grains wants.
 */
function grain(x, y, s) {
  const i = (52.9829189 * ((0.06711056 * x + 0.00583715 * y) % 1)) % 1;
  return i * 0.7 + 0.3 * hash(x, y, s);
}

// ------------------------------------------------------------ letterforms
//
// Each digit is a network of centre-lines in a DW x DH box, drawn thick and
// round like something worn by water. Arcs use clock angles in degrees (0 = up,
// clockwise). The centre-lines are kept 2.25 px inside the box, so the ink
// fills it once half a stroke is added; free ends taper away to half width, as
// a lick of foam does where the water stopped.

function arc(cx, cy, rx, ry, a0, a1, n = 16) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    pts.push([cx + rx * Math.sin(a), cy - ry * Math.cos(a)]);
  }
  return pts;
}

/** A superellipse: a circle that has been left out in the sun. */
function oval(cx, cy, rx, ry, pow = 2.8, n = 40) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
    pts.push([
      cx + rx * Math.sign(c) * Math.abs(c) ** (2 / pow),
      cy + ry * Math.sign(s) * Math.abs(s) ** (2 / pow),
    ]);
  }
  return pts;
}

const L = (...p) => p;

const SKELETON = {
  0: [oval(10.5, 11.5, 8.25, 9.25, 3.0)],
  1: [L([5.4, 8.6], [11.8, 2.6]), L([11.8, 2.6], [11.8, 20.7]), L([8.0, 20.7], [15.4, 20.7])],
  2: [[...arc(10.2, 8.6, 6.2, 5.8, 245, 115, 20), [4.8, 20.7], [17.7, 20.7]]],
  3: [arc(10.2, 7.7, 6.3, 5.5, 235, 510, 22), arc(10.7, 15.4, 6.6, 5.0, 30, 240, 22)],
  4: [L([15.4, 2.6], [15.4, 20.7]), L([15.4, 2.6], [4.2, 13.8], [18.2, 13.8])],
  5: [[[18.0, 3.1], [5.4, 3.1], [5.4, 9.6]], arc(10.6, 14.9, 6.8, 5.6, 314, 596, 26)],
  7: [L([4.2, 3.1], [17.8, 3.1], [9.4, 20.7])],
  8: [oval(10.5, 7.4, 6.0, 5.0, 2.9), oval(10.5, 15.8, 6.8, 4.9, 2.9)],
  9: [oval(10.5, 9.4, 6.8, 6.6, 2.8), [[17.0, 8.6], [16.9, 12.6], ...arc(10.5, 15.8, 6.5, 4.9, 74, 196, 14)]],
  6: null,                                  // the 9 turned half a turn
  ':': [L([3.5, 8.4], [3.5, 8.5]), L([3.5, 16.4], [3.5, 16.5])],
};
const BOX = { ':': [CW, DH] };
const rot180 = (paths, bw, bh) => paths.map((p) => p.map(([x, y]) => [bw - x, bh - y]));
SKELETON[6] = rot180(SKELETON[9], DW, DH);
for (const k of Object.keys(SKELETON)) if (!BOX[k]) BOX[k] = [DW, DH];

/**
 * Bake one glyph: for every pixel of its box, how deep it lies inside the ink,
 * as e = 1 - distance / (local half-width). e = 1 on a centre-line, 0 at the
 * ink's edge, negative outside it. The half-width carries the stroke's taper
 * and a slow wobble, so the edge is hand-cut rather than machined; because it
 * is baked, the foam's own noise at run time can stay free to move.
 */
const FIELD = new Map();
function fieldOf(ch, bw, bh) {
  const key = `${ch}@${bw}x${bh}`;
  let f = FIELD.get(key);
  if (f) return f;
  // The ink of a digit drawn in a GW x GH box reaches H2*(1+wobble) beyond its
  // centre-lines; map that whole extent onto the box it is rendered in, less
  // half a pixel of margin for the spray to spill into.
  const M = 1.2 * H2, PAD = 0.5;
  const sx = (GW - 2 * 2.25 + 2 * M) / (bw - 2 * PAD);
  const sy = (GH - 2 * 2.25 + 2 * M) / (bh - 2 * PAD);
  const ox0 = 2.25 - M - PAD * sx, oy0 = 2.25 - M - PAD * sy;
  const hw0 = H2 / ((sx + sy) / 2);              // half a stroke's width, in box pixels
  const segs = [];
  for (const path of SKELETON[ch]) {
    let L2 = 0;
    const lens = [];
    for (let i = 1; i < path.length; i++) {
      const l = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
      lens.push(l); L2 += l;
    }
    const open = Math.hypot(path[0][0] - path[path.length - 1][0], path[0][1] - path[path.length - 1][1]) > 1.2;
    let s = 0;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i], l = lens[i - 1], s0 = s;
      s += l;
      segs.push([a[0], a[1], b[0], b[1], (u) => {
        const p = s0 + u * l;
        const edge = Math.min(p, L2 - p);
        const taper = open ? 0.46 + 0.54 * smoothstep(edge / TAPER) : 1;
        const wob = 0.86 + 0.28 * vn(p * 0.55 + 3, 1.7, 5);
        return hw0 * taper * wob;
      }]);
    }
  }
  const q = new Uint8Array(bw * bh);
  for (let y = 0; y < bh; y++)
    for (let x = 0; x < bw; x++) {
      const px = ox0 + (x + 0.5) * sx, py = oy0 + (y + 0.5) * sy;   // into the design box
      let best = -9;
      for (const [ax, ay, bx, by, wf] of segs) {
        const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
        const u = l2 ? clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1) : 0;
        const ex = px - (ax + u * dx), ey = py - (ay + u * dy);
        const e = 1 - Math.sqrt(ex * ex + ey * ey) / wf(u);
        if (e > best) best = e;
      }
      q[y * bw + x] = clamp(Math.round(((best + 0.5) / 1.5) * 255), 0, 255);
    }
  // The rows each column of the box actually needs: anywhere the ink or its
  // spray can reach. Most of a letter's box is empty, and skipping it is what
  // keeps the face inside its frame budget.
  const colY = [];
  for (let x = 0; x < bw; x++) {
    let lo = bh, hi = -1;
    for (let y = 0; y < bh; y++) if (q[y * bw + x] > 14) { if (y < lo) lo = y; hi = y; }
    colY.push([lo, hi]);
  }
  f = { q, bw, bh, colY };
  FIELD.set(key, f);
  return f;
}

/** The baked coverage at box position (bx, by), interpolated so it can move. */
function covAt(f, bx, by) {
  bx = clamp(bx - 0.5, 0, f.bw - 1.001);
  by = clamp(by - 0.5, 0, f.bh - 1.001);
  const x0 = Math.floor(bx), y0 = Math.floor(by);
  const fx = bx - x0, fy = by - y0;
  const q = f.q, x1 = Math.min(x0 + 1, f.bw - 1), y1 = Math.min(y0 + 1, f.bh - 1);
  const a = q[y0 * f.bw + x0], b = q[y0 * f.bw + x1], c = q[y1 * f.bw + x0], d = q[y1 * f.bw + x1];
  return (((a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy) / 255) * 1.5 - 0.5;
}

// ------------------------------------------------------------ foam
//
// The material. `e` is the depth into the ink from covAt(). The heart of a foam
// line is solid water-white with big bubbles opening in it; the outer third
// breaks up; past the ink it is spray, thrown down the beach and thinning as it
// goes. A slow wave of popping runs through all of it, so it is never still.

function foamLevel(e, px, sy, seed, T) {
  if (e <= -0.40) return 0;
  if (e >= -0.06) {
    // Inside the ink: one solid mass, with bubbles opening in it — a few in the
    // heart of the foam, many more towards its edge, as water drains through.
    const t = clamp(1 - e / 0.62, 0, 1);
    if (vn(px * 0.40, sy * 0.40, seed + 5)
      > 0.945 - 0.44 * t * t + 0.03 * Math.sin(T * 1.1 + px * 0.05 + sy * 0.04)) return 0;
    if (e < 0.14) {                                // the last sliver breaks into spray
      const k = clamp((e + 0.06) / 0.2, 0, 1);
      return 0.35 + 0.65 * k * k * (0.6 + 0.8 * vn(px * 0.5, sy * 0.5, seed + 2));
    }
    return 1;
  }
  const t = (e + 0.40) / 0.34;
  return 0.42 * t * t * (0.2 + 1.0 * vn(px * 0.62, sy * 0.62, seed + 4));
}

/**
 * One glyph, its box at (x0, y0) on the glass. `show(px, py)` says whether the
 * sand here is out of the water; the foam is sampled in the swell's own frame
 * (py - bob), so shape and texture ride the wave together.
 */
function drawGlyph(g, ch, x0, y0, seed, T, bobArr, show) {
  const [bw, bh] = BOX[ch];
  const f = fieldOf(ch, bw, bh);
  for (let ix = 0; ix < bw; ix++) {
    const [lo, hi] = f.colY[ix];
    const px = x0 + ix;
    if (hi < lo || px < 0 || px >= W) continue;
    for (let iy = Math.max(0, lo - 2); iy <= Math.min(bh - 1, hi + 2); iy++) {
      const py = y0 + iy;
      if (py < 0 || py >= H) continue;
      if (!show(px, py)) continue;
      const b = bobArr[px];
      const e = covAt(f, ix + 0.5, iy + 0.5 - b);
      const lvl = foamLevel(e, px, py - b, seed, T);
      // Ordered dither would print as a grid, so the foam's own holes come from
      // smooth blobs; the dither only sets the raggedness of the thin edges. It
      // is offset by the swell, so the grain of the foam travels with it.
      if (lvl <= 0 || !dither(px, Math.round(py - b), lvl)) continue;
      g.pixel(px, py);
    }
  }
}

// ------------------------------------------------------------ water and shore

/** How far the water has run up the beach: 0 at rest, 1 covering the glass. */
function coverAt(tau, hour) {
  const FLOOD = hour ? 1.0 : 0.78, HOLD = hour ? 0.34 : 0.16, DRAIN = hour ? 2.2 : 1.45;
  const PRE = hour ? 2.6 : 1.2;
  if (tau < -PRE) return 0;
  if (tau < 0) return 0.07 * smoothstep((tau + PRE) / PRE);      // the swell shoals
  if (tau < FLOOD) return 0.07 + 0.93 * smoothstep(tau / FLOOD);
  if (tau < FLOOD + HOLD) return 1;
  const d = FLOOD + HOLD + DRAIN;
  if (tau < d) return 1 - smoothstep((tau - FLOOD - HOLD) / DRAIN);
  // The tide has gone out a little, and creeps back.
  const k = clamp((tau - d) / (hour ? 9 : 3.5), 0, 1);
  return -(hour ? 0.14 : 0.04) * (1 - smoothstep(k));
}

/**
 * A swash: the run of water one wave makes up the beach. A single pulse
 * travels the length of the shore, returning 0 in the trough and a few pixels
 * at its crest, so a wave is always arriving somewhere along the glass.
 */
function swashAt(x, T) {
  const ph = ((x / 128 - T / 9.5) % 1 + 1) % 1;
  return 2.4 * Math.exp(-(((ph - 0.46) / 0.17) ** 2))
    + 0.4 * Math.sin((x / 19 + T / 2.7) * Math.PI * 2) + 0.75;
}

/**
 * The deep water's edge: the row at or above which everything is under water
 * and nothing on the beach can be seen. At rest it sits just above the time;
 * while the wave runs it sweeps down over the glass.
 */
function deepAt(x, tau, T, cover) {
  const amp = 0.4 + 2.8 * clamp(cover, 0, 1);
  const rag = amp * (2 * (0.65 * vn(x * 0.075, tau * 0.9 + 4) + 0.35 * vn(x * 0.22, tau * 1.6)) - 1);
  return DEEP + 0.45 * swashAt(x, T) + rag + cover * (COVER_BOTTOM - DEEP);
}

/**
 * Everything between the deep water and the swash's leading edge is a hand's
 * breadth of water lying on the sand — thin enough at the edge to let the
 * beach show through it. The wave runs it up the beach and drains it back.
 */
function sheetAt(x, tau, T, cover) {
  const dw = deepAt(x, tau, T, cover);
  return dw + (1 - smoothstep(cover * 1.5)) * (0.5 + 1.15 * swashAt(x, T));
}

/**
 * The sea, from the deep water's edge up to the top of the glass: black water,
 * swells crossing it as broad arcs, and — while the wave is running — a
 * churning white sheet at its leading edge. Below the edge, the shallow water
 * on the sand is drawn as a fine film with foam standing along its rim.
 */
function drawWater(g, deep, sheet, cover, T) {
  for (let x = 0; x < W; x++) {
    const dw = deep[x], sh = sheet[x];
    const sw = clamp(swashAt(x, T) / 2.6, 0, 1);
    // Water lying on the sand: a film, thinnest at the deep water's edge and
    // piling up towards the shore.
    for (let y = Math.floor(dw); y < Math.min(H, Math.ceil(sh) + 1); y++) {
      const t = clamp((y + 0.5 - dw) / Math.max(0.6, sh - dw), 0, 1);
      const lvl = (0.05 + 0.24 * t * t) * (0.35 + 1.4 * vn(x * 0.42 + T * 0.5, (y + 0.5) * 0.42 - T * 0.9, 31));
      if (lvl > 0 && grain(x + Math.round(T * 0.4), y, 31) < lvl) g.pixel(x, y);
    }
    // Foam standing along the leading edge: a solid rope of it where the water
    // is running, barely a seam where it has drained back.
    const edge = 0.55 + 0.5 * vn(x * 0.07 - T * 0.4, 3.3, 11) + 0.8 * sw;
    for (let y = Math.max(0, Math.ceil(sh - 1.7)); y < Math.min(H, Math.ceil(sh + 1.7)); y++) {
      const d = (y + 0.5 - sh) / edge;
      const lvl = (d < 0 ? 0.95 + 0.4 * d : 0.95 - 0.5 * d * d) * (0.5 + 0.5 * sw);
      if (lvl <= 0) continue;
      // A rope of foam along the edge, not a dotted line: one mass, opened by
      // bubbles, going solid where the water is actually running.
      if (vn(x * 0.24 + T * 0.7, (y + 0.5) * 0.55 - T * 0.5, 47) < lvl) g.pixel(x, y);
    }
    // The deep water: black between waves. While the wave is running, a
    // churning mass of foam — solid at its leading edge, boiling the whole way
    // back, and everywhere opened by blobs of dark water.
    if (cover > 0.02) {
      for (let y = 0; y < Math.ceil(dw); y++) {
        const d = dw - (y + 0.5);
        if (d < 0) continue;
        const lvl = clamp(cover * (0.66 + 0.5 * clamp(1 - Math.max(0, d - 1) / 11, 0, 1)), 0, 1);
        if (lvl <= 0) continue;
        const m = vn(x * 0.21 + T * 1.5, y * 0.21 - T * 2.1, 17) * 0.45
          + vn(x * 0.5 - T * 0.9, y * 0.5, 21) * 0.35
          + vn(x * 0.95 + T * 1.2, y * 0.95, 24) * 0.2;
        if (m > lvl) continue;
        g.pixel(x, y);
      }
    }
  }
}

/**
 * Swells crossing the deep water. Seen from above a swell is not a straight
 * line but a broad arc leading with its crest; the arcs travel down the glass,
 * flattening and picking up foam as the water shoals under them.
 */
function drawSwells(g, deep, cover, T) {
  if (cover > 0.2) return;
  for (let i = 0; i < 3; i++) {
    const span = 26 + 6 * i;
    const apex = ((T * (1.6 + 0.4 * i) + i * 11.3) % span) - 9;
    const cx = (i * 47 + 20 + 22 * Math.sin(T * 0.045 + i * 2.1)) % 128;
    const curv = 0.0035 + 0.0025 * i, halfw = 32 + 13 * i;
    for (let x = Math.max(0, Math.floor(cx - halfw)); x < Math.min(W, Math.ceil(cx + halfw)); x++) {
      const dx = (x - cx) / halfw;
      const y = apex + curv * (x - cx) * (x - cx);
      if (y >= deep[x] - 1.0 || y < -1) continue;          // it has broken, or is off the glass
      const k = clamp(1 - (deep[x] - y) / 12, 0, 1);       // how shoal the water is here
      const across = Math.cos(dx * Math.PI * 0.5) * (0.4 + 0.75 * vn(x * 0.07 + i * 31, i * 3.3, 57));
      const yy = Math.round(y);
      if (across <= 0.06) continue;
      if (vn(x * 0.32 + i * 13, yy * 0.5, 51) * 0.55 + 0.45 * hash(x, yy, 55 + i)
        > across * (0.25 + 0.85 * k)) continue;
      g.pixel(x, yy);
      if (k > 0.8) g.pixel(x, yy + 1);
    }
  }
}

/**
 * Wet sand: for a second or two after the backwash leaves it, the beach still
 * glistens — brightest at the water's edge, drying up the slope.
 */
function drawSheen(g, sheet, glow, tau) {
  const reach = 4.0;
  for (let x = 0; x < W; x++) {
    const fr = sheet[x];
    for (let y = Math.ceil(fr + 0.5); y < Math.min(H, fr + reach); y++) {
      const k = 1 - (y + 0.5 - fr) / reach;
      const lvl = (0.09 + 0.34 * glow) * k * k * (0.35 + 1.3 * vn(x * 0.5, y * 0.5 - tau * 1.4, 61));
      if (lvl > 0 && dither(x, y, lvl)) g.pixel(x, y);
    }
  }
}

/**
 * The sand: grains lying where the water has left them, in loose ripples that
 * drift slowly along the shore, thinning as the beach dries out up the glass.
 */
function drawSand(g, deep, ox, T) {
  // Dry sand catches the light: the beach rises out of the black as a field of
  // grains, starting along a ragged edge up the shore and thickening towards
  // the bottom of the glass. The grain is ordered, so it reads as a surface
  // rather than as noise, and it drifts, so no grain burns in.
  for (let x = 0; x < W; x++) {
    const dw = Math.max(0, Math.ceil(deep[x]));
    for (let y = dw; y < H; y++) {
      const up = clamp((y + 0.5 - deep[x]) / 7, 0, 1);       // further up the beach
      const clump = clamp((hash((x + Math.round(T * 0.2)) >> 4, y >> 2, 83) - 0.42) / 0.3, 0, 1);
      const lvl = 0.06 * clump * (0.25 + 0.75 * up);
      if (lvl > 0 && grain(x + ox, y, 91) < lvl) g.pixel(x + ox, y);
    }
  }
}

// ------------------------------------------------------------ the face

/** The swell: how far the foam at column x is lifted right now. */
function bobAt(x, T) {
  return 1.0 * Math.sin((x / 34 - T / 3.6) * Math.PI * 2)
    + 0.3 * Math.sin((x / 13.5 + T / 2.05) * Math.PI * 2);
}

const digitsOf = (c) => `${c.hh}${c.mm}`;

export default {
  name: 'Swash',
  blurb: 'The tide writes the time in foam on the wet sand and the backwash washes it away; the hour is a spring tide that floods the whole glass.',
  module: '091-128x32',
  colour: 'white',
  bus: 'i2c400',
  fps: 50,
  driver: 'full',

  frame(g, { fields: f, date, oled, night }) {
    const T = date.getTime() / 1000;
    const s = f.sec;
    const tau = s < 30 ? s : s - 60;                       // seconds from the turn
    const turn = tau < 0 ? f : previousMinute(date);       // the time being washed away
    const next = tau < 0 ? clockFields(new Date(date.getTime() + (60 - s) * 1000)) : f;
    const hour = (tau < 0 ? next : f).m === 0;             // the turn into a new hour

    const [ox, oy] = orbit(date, 2, 3);
    const dy = Math.max(-1, Math.min(0, oy));
    const x0 = ox, y0 = TOP + dy;

    const cover = coverAt(tau, hour);
    const deep = new Float64Array(W), sheet = new Float64Array(W);
    for (let x = 0; x < W; x++) {
      deep[x] = deepAt(x, tau, T, cover);
      sheet[x] = sheetAt(x, tau, T, cover);
    }

    // Which time is on the sand: the old one until the wave has passed over the
    // glass, the new one while the backwash is draining and after it.
    const FLOOD = hour ? 1.0 : 0.78, HOLD = hour ? 0.34 : 0.16;
    const passed = tau > FLOOD + HOLD * 0.6;
    const cur = digitsOf(passed ? next : turn);
    const seed = (passed ? next.minuteKey : turn.minuteKey) % 977;

    const bob = new Float64Array(W);
    for (let x = 0; x < W; x++) bob[x] = bobAt(x - x0, T);

    const drawn = new Uint8Array(W * H);
    const put = (px, py) => { drawn[py * W + px] = 1; };
    // The time is on the sand wherever the deep water has not closed over it.
    const show = (px, py) => {
      if (py + 0.5 <= deep[px] || drawn[py * W + px]) return false;
      put(px, py);
      return true;
    };

    // The sand, then the shallow water on it, then the time in foam, then the
    // sea over the top of everything.
    const glow = tau <= 0 ? 0 : Math.max(0, 1 - (tau - FLOOD - HOLD) / (hour ? 3 : 2.2));
    drawSand(g, deep, x0, T);
    drawSheen(g, sheet, glow, tau);

    for (let i = 0; i < 4; i++) drawGlyph(g, cur[i], SLOT[i] + x0, y0, seed + i * 17, T, bob, show);
    drawGlyph(g, ':', COLON_X + x0, y0, seed + 71, T, bob, show);

    drawSwells(g, deep, cover, T);
    drawWater(g, deep, sheet, cover, T);

    oled.contrast(0xcf + (0x18 - 0xcf) * night);
  },
};
