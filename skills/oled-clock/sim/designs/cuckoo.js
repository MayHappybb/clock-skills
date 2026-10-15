// Cuckoo — a Black Forest chalet clock, front on, by lamplight.
//
// The black is the night and the case is dark oak: what is lit is what the
// lamp inside falls on. The time is not painted on a dial; it is CARVED —
// four numerals cut in relief into the case's front panel, with the chisel's
// marks on them: flat-cut terminals, a lit facet and a shadowed one down
// either side of every stroke, and the grain of the board running across
// them. Every minute the chains step down a hairline and the movement re-cuts
// the panel. The numeral that is changing is un-carved — it dissolves back
// into the board from the foot up, pushing shavings off the surface — and the
// next one is cut out of the wood from the foot up, its fresh face pale and
// plain for a moment before the grain closes back over it.
//
// Around it: the gable with its scalloped shingles; the little door under the
// ridge, and behind it the cuckoo; and hanging down the outside of the case,
// two chains of leaf-shaped links with a pinecone weight on the end of each.
// The chains are the minute hand: they drag down a hairline every minute
// (taking the weights with them) and are wound all the way back up on the
// hour, while the bird calls.
//
// The seconds are the pendulum under the panel: a carved oak leaf on a rod,
// one beat a second — the two pips of the colon taking that beat in turn.
//
// The hour is the bird's. From :55 the doors swing open, the cuckoo runs out
// on its perch, and it calls the hour: one bow and one puff of sound for each
// stroke, then it backs in and the doors latch.
//
// Everything is a closed-form function of the wall clock: the weights' height
// is the minute of the hour, the pendulum's angle is cos(pi*t), the doors'
// schedule counts back from :00. frame() remembers nothing between calls.
//
// Burn-in: the case walks a 3 px orbit every two minutes, the numerals are
// re-cut every minute, the pendulum and chains move always, and 23:00-07:00
// the panel is dimmed through ctx.night.

import { dither, clamp, ease, orbit, clockFields, previousMinute } from '../js/kit.js';

const TAU = Math.PI * 2;
const W = 128, H = 64;

// ------------------------------------------------------------ the case

const DW = 20, DH = 30;          // a numeral's box
const TOP = 19;                  // top of the boxes on the glass
const SLOT_X = [20, 42, 66, 88];
const HW = 2.45;                 // half-width of a cut stroke
const COLON_X = 64;

const EAVE = 13;                 // where the roof ends and the frieze begins
const DOOR = { x: 53, y: 3, w: 22, h: 10 };
const PANEL = { x: 13, y: 16, w: 102, h: 36 };
const PIVOT = { x: 64, y: 52 };
const CHAIN_X = [8, 120];
const W_TOP = 36, W_BOT = 50;    // where a weight hangs at :00 and at :59

// ------------------------------------------------------------ small maths

const clamp01 = (u) => (u < 0 ? 0 : u > 1 ? 1 : u);
const smooth = (u) => { u = clamp01(u); return u * u * (3 - 2 * u); };
const frac = (u) => ((u % 1) + 1) % 1;

const SIN = new Float32Array(1024);
for (let i = 0; i < 1024; i++) SIN[i] = Math.sin((TAU * i) / 1024);
const tsin = (turns) => SIN[((turns * 1024) | 0) & 1023];

function hash(x, y, s) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// ------------------------------------------------------------ letterforms
//
// Cut, not drawn: the strokes are chiselled to a V so each has a lit facet
// and a shadowed one, and every terminal is a flat chisel cut.

function ellD(cx, cy, rx, ry, a0, a1, n = 24) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = (((a0 + ((a1 - a0) * i) / n)) * Math.PI) / 180;
    pts.push([cx + rx * Math.sin(a), cy - ry * Math.cos(a)]);
  }
  return pts;
}

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

// Box 20 x 30; the numerals stand from y 3 to y 27.
const SKEL = {
  0: [ellD(10, 15, 6.6, 12, 0, 360, 44)],
  1: [spline([[2.8, 9.8], [10, 3.6], [10, 25.4]]), spline([[4.6, 26.4], [15.4, 26.4]])],
  2: [spline([[2.4, 12], [2.8, 6.6], [7.2, 3.2], [13, 3.2], [17.2, 6.8], [17.4, 11.4], [13.6, 16.2], [7.4, 21.6], [2.8, 26], [2.4, 27.2], [7.4, 26.8], [12.6, 26.4], [17.6, 27.2]])],
  3: [spline([[2.8, 6], [6, 3.3], [11.2, 3.2], [15.8, 5.6], [16.6, 9.4], [14, 13], [9.6, 14.8], [13.8, 16.4], [17.4, 20.8], [16.4, 25.6], [11.6, 28], [5.8, 27.6], [2.6, 24.2]])],
  4: [spline([[14, 3.2], [3.4, 20.2], [17.4, 20.2]]), spline([[14, 3.2], [14, 27.2]])],
  5: [spline([[16.6, 3.4], [5.4, 3.4], [4.2, 12.6], [7.6, 11.4], [11.8, 11.8], [16.2, 15], [17.4, 19.8], [14.8, 25.4], [10.4, 28], [4.8, 27.4], [2.4, 23.8]])],
  6: [spline([[15.8, 3.4], [9.8, 4.6], [5.6, 8.4], [3.4, 14], [3.8, 20.6], [7, 26], [12, 27.8], [16.2, 25], [17, 20], [13.4, 16.4], [8.6, 17.4], [6.4, 21]])],
  7: [spline([[2.8, 3.4], [17.4, 3.4], [8, 27.2]]), spline([[7, 17.4], [13.8, 17.4]])],
  8: [ellD(10, 9, 5.4, 6, 0, 360, 28), ellD(10, 21.4, 6.2, 6.8, 0, 360, 30)],
};
SKEL[9] = SKEL[6].map((path) => path.map(([x, y]) => [DW - x, DH - y]));

const CUTS = new Map();

/**
 * A numeral as a chiselled cut: which pixels are wood, and which way the wall
 * of the cut faces, so the light falls the same way however a stroke runs.
 * The ends of strokes are square — a chisel stops flat — so a point beyond
 * the end of a stroke is not cut away however near the tip it lies.
 */
function cut(d) {
  let C = CUTS.get(d);
  if (C) return C;
  const N = DW * DH;
  const mask = new Uint8Array(N);
  const nx = new Float32Array(N);
  const ny = new Float32Array(N);
  for (let j = 0; j < DH; j++) {
    for (let i = 0; i < DW; i++) {
      const px = i + 0.5, py = j + 0.5;
      let best = 1e9, gx = 0, gy = 0;
      for (const path of SKEL[d]) {
        for (let s = 1; s < path.length; s++) {
          const ax = path[s - 1][0], ay = path[s - 1][1], bx = path[s][0], by = path[s][1];
          const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
          const u = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
          const cu = clamp01(u);
          const ex = px - ax - cu * dx, ey = py - ay - cu * dy;
          let e = Math.hypot(ex, ey);
          if (l2 > 1e-9 && (u < 0 || u > 1)) {
            const over = (u < 0 ? -1 : 1) * (ex * dx + ey * dy) / Math.sqrt(l2);
            if (over > 0.4) e = 1e9;              // past the flat chisel cut
          }
          if (e < best) { best = e; gx = ex; gy = ey; }
        }
      }
      const k = j * DW + i;
      if (best > 0.4 && best < 1e9) { nx[k] = gx / best; ny[k] = gy / best; }
      if (best <= HW) mask[k] = 1;
    }
  }
  C = { mask, nx, ny };
  CUTS.set(d, C);
  return C;
}

/**
 * Draw one numeral. `rise(x, y)` is 0 where the cut has not yet been made and
 * 1 where it is finished; `settle(x, y)` is 0 at the instant of the cut and 1
 * once the grain has closed back over it.
 */
function drawCut(g, d, x0, y0, rise, settle) {
  const C = cut(d);
  const { mask, nx, ny } = C;
  for (let j = 0; j < DH; j++) {
    const y = y0 + j;
    if (y < 0 || y >= H) continue;
    for (let i = 0; i < DW; i++) {
      const k = j * DW + i;
      if (!mask[k]) continue;
      const x = x0 + i;
      if (x < 0 || x >= W) continue;
      if (rise(x, y) <= 0) continue;
      // The cut is a V: the facet towards the lamp is lit and the one away
      // from it is a hairline of shadow down the far wall, with the ridge
      // between them solid — a chisel leaves an edge you can see.
      const up = -ny[k] - nx[k];
      const inside = i > 0 && i < DW - 1 && j > 0 && j < DH - 1
        && mask[k - 1] && mask[k + 1] && mask[k - DW] && mask[k + DW];
      let lv = 0.95;
      if (up > 0.62) lv = 1;
      else if (up < -0.5 && inside) lv = 0.15;
      // The board's grain runs across the cut; fresh-cut wood is plain until
      // the grain closes back over it.
      const st = settle(x, y);
      if (st > 0.4 && (((y % 5) + 5) % 5) === 0) lv = 0.8 * st + (1 - st) * lv;
      if (dither(x, y, clamp01(lv))) g.pixel(x, y, 1);
    }
  }
}

// ------------------------------------------------------------ the case

/** A row of scalloped shingles across the roof. */
function shingleRow(g, y, xL, xR, ox, oy, inHole, t) {
  const step = 6;
  for (let x = Math.ceil(xL) + step / 2; x <= xR; x += step) {
    for (let k = -3; k <= 3; k++) {
      const dx = k / 3;
      const yy = y + Math.round(2.4 * Math.sqrt(Math.max(0, 1 - dx * dx)));
      const px = x + k;
      if (px < xL || px > xR || inHole(px, yy + oy)) continue;
      const flick = 0.8 + 0.3 * tsin(t * 0.41 + px * 0.05);
      if (dither(px - ox, yy, 0.72 * flick)) g.pixel(px, yy + oy);
    }
  }
}

/** The gable: a shingled roof with the ridge at the top and lit barges. */
function drawRoof(g, ox, oy, t) {
  const half = (y) => 5 + (y * (W / 2 - 5)) / EAVE;
  // The doorway is cut through the shingles: a dark hole with a stone rim.
  const hx0 = DOOR.x + ox - 2, hx1 = DOOR.x + DOOR.w + ox + 2;
  const hy0 = DOOR.y + oy - 1, hy1 = DOOR.y + DOOR.h + oy + 2;
  const inHole = (x, y) => x >= hx0 && x <= hx1 && y >= hy0 && y <= hy1;
  for (let j = 0; j <= EAVE; j++) {
    const y = j + oy;
    if (y < 0 || y >= H) continue;
    const h2 = half(j);
    for (let x = Math.ceil(64 - h2) + ox; x <= 64 + h2 + ox; x++) {
      if (inHole(x, y)) continue;
      // The boards are dark oak. The lamp inside flickers, so the light that
      // reaches the roof breathes — and no board is lit the same all day.
      const flick = 0.86 + 0.34 * tsin(t * 0.31 + x * 0.011) * tsin(t * 0.19 + j * 0.13 + 0.6);
      if (dither(x - ox, y - oy, (0.19 + 0.13 * (j / EAVE) ** 1.5) * flick)) g.pixel(x, y);
    }
  }
  for (let j = 3; j <= EAVE; j += 5) shingleRow(g, EAVE - j, 64 - half(j) + 1 + ox, 64 + half(j) - 1 + ox, ox, oy, inHole, t);
  // The ridge, and the barges catching the moon.
  for (let j = 0; j <= EAVE; j++) {
    const h2 = half(j);
    g.pixel(Math.round(64 - h2) + ox, j + oy);
    g.pixel(Math.round(64 + h2) + ox, j + oy);
  }
  g.hline(64 - half(0) - 1 + ox, oy, 2 * half(0) + 3);
}

/** The frieze under the eaves: a scalloped board with its edge lit. */
function drawFrieze(g, ox, oy, t) {
  for (let x = -3; x < W + 3; x++) {
    const s = Math.round(1.4 * tsin(x * 0.21));
    const flick = 0.8 + 0.35 * tsin(t * 0.37 + x * 0.07);
    if (dither(x - ox, EAVE + 1 + s, 0.9 * flick)) g.pixel(x, EAVE + oy + 1 + s);
    if (dither(x - ox, EAVE + 2 + s, 0.55 * flick)) g.pixel(x, EAVE + oy + 2 + s);
  }
  const [px, py] = [64 + ox, EAVE + 3 + oy];
  for (let k = -2; k <= 2; k++) { g.pixel(px + k * 3, py + 1); g.pixel(px + k * 3, py + 2); }
}

/** A chain of leaf-shaped links, `phase` px down from the top. */
function drawChain(g, x, yTop, yBot, phase, oy) {
  const pitch = 7;
  for (let y = yTop; y < yBot; y++) {
    const q = frac((y - yTop + phase) / pitch);
    const u = Math.abs(q - 0.5) * 2;
    const w = 1.7 * Math.sqrt(Math.max(0, 1 - u * u));
    for (let i = -2; i <= 2; i++) {
      const a = Math.abs(i);
      const lv = a <= w ? (a > w - 1 ? 0.95 : 0.4) : 0;
      if (lv > 0 && dither(x + i, y + oy, lv)) g.pixel(x + i, y + oy);
    }
    if (u < 0.12) g.pixel(x, y + oy);
  }
}

/** A pinecone: a lit outline and rows of scales, the way one is carved. */
function drawPinecone(g, cx, cy) {
  const x = Math.round(cx), y = Math.round(cy);
  const rx = 4.0, ry = 5.4;
  for (let a = 0; a < TAU; a += 0.11) {
    g.pixel(x + rx * Math.sin(a), y - ry * Math.cos(a));
  }
  // the scales: rows of chevrons, opening downwards as they go
  for (let r = -2; r <= 2; r++) {
    const hw = rx * Math.sqrt(Math.max(0, 1 - (r / 3.1) ** 2)) - 0.6;
    for (let i = -Math.round(hw); i <= Math.round(hw); i++) {
      g.pixel(x + i, Math.round(y + r * 2 + Math.abs(i) * 0.42));
    }
  }
  g.pixel(x, y - 6); g.pixel(x, y - 7);
}

// ------------------------------------------------------------ the bird

// The cuckoo, hand-drawn: a crest, a head, a bill, a plump body, a long tail.
const BIRD = [
  '.....##......',
  '....####.....',
  '...######....',
  '.#.#######...',
  '.#..######...',
  '.##########..',
  '###########..',
  '.##########..',
  '..########...',
  '...######....',
  '....####.....',
];
const BIRD_SPR = { w: 13, h: 11, data: new Uint8Array(BIRD.join('').split('').map((c) => (c === '#' ? 1 : 0))) };

/**
 * The cuckoo on its perch. `lean` tips it into a bow and `beak` opens its
 * bill; both are drawn, not swapped between frames.
 */
function drawBird(g, cx, top, lean, beak) {
  const x = Math.round(cx) - 6;
  const y = Math.round(top) + Math.round(lean * 2.2);
  // the tail, sloping down behind it
  for (let k = 0; k < 3; k++) g.line(x + 11, y + 5 + k, x + 15 + k, y + 10 + 2 * k + Math.round(lean * 3));
  g.blit(BIRD_SPR, x, y, { opaque: true });
  if (beak > 0.15) {
    // the bill opens: the lower mandible swings down away from the upper
    g.fillRect(x + 1, y + 4, 3, 2, 0);
    const d = Math.round(beak * 2.4);
    for (let k = 0; k < 3; k++) g.pixel(x + 2 - k, y + 5 + d + Math.round(k * 0.3));
    g.pixel(x + 3, y + 4);
  }
}

/** The puffs of the call, spreading out from the bill. */
function drawCall(g, cx, cy, puffs) {
  for (const age of puffs) {
    const r = 4 + age * 22;
    const a = 1 - age;
    if (a <= 0) continue;
    for (const k of [-1, 1]) {
      for (let u = -1; u <= 1; u += 0.1) {
        const px = Math.round(cx - 5 - r * 0.3 + k * r * 0.32);
        const py = Math.round(cy + 1 + u * r * 0.42);
        if (py < 0 || py >= H || px < 0 || px >= W) continue;
        if (dither(px, py, a * 0.8)) g.pixel(px, py);
      }
    }
  }
}

/** The doors: two arched leaves, hinged at the sides, that swing inward. */
function drawDoor(g, open, ox, oy) {
  const { x: dx, y, w, h } = DOOR;
  const x = dx + ox;
  const yy = y + oy;
  const cxm = x + w / 2;
  const arch = (py) => (py < 4 ? Math.sqrt(Math.max(0, 1 - ((py - 4) / 4.3) ** 2)) : 1);
  // The doorway: an arched opening with its stone lit and the loft dark behind.
  for (let py = 0; py <= h; py++) {
    const hw = (w / 2 + 1) * arch(py);
    g.pixel(cxm - hw, yy + py);
    g.pixel(cxm + hw, yy + py);
  }
  g.hline(cxm - w / 2 - 2, yy, w + 4, 0);
  // Two oak leaves, hinged at the sides: their faces are in shadow and only
  // the edges of the planks catch the lamp, so a shut door is dark wood with
  // a lit frame — and the cuckoo comes out of the dark.
  for (const s of [-1, 1]) {
    const hinge = cxm + s * (w / 2 - 0.5);
    const wid = (w / 2 - 0.9) * Math.cos(open * 1.42);
    for (let d = 0; d < wid; d++) {
      const px = Math.round(hinge - s * (d + 0.5));
      for (let py = 0; py <= h; py++) {
        if (d + 0.5 > wid * arch(py)) continue;
        if (Math.round(d) % 4 === 2) continue;            // the groove between planks
        if (dither(d * 3, py, 0.22)) g.pixel(px, yy + py);
      }
    }
    // the meeting stile and the plank's edge, lit
    if (wid > 1.2) for (let py = 0; py <= h; py++) {
      if ((wid - 0.5) <= wid * arch(py)) g.pixel(Math.round(hinge - s * wid), yy + py);
    }
  }
}

// ------------------------------------------------------------ the pendulum

function drawPendulum(g, t, ox, oy) {
  const a = 0.27 * Math.cos(Math.PI * t);          // at the extremes on the beat
  const x = PIVOT.x + ox, y = PIVOT.y + oy;
  const bx = x + 11 * Math.sin(a), by = y + 11 * Math.cos(a);
  g.line(x, y, bx, by);
  g.line(x + 1, y, bx + 1, by);
  // the bob: a carved oak leaf, its rim and midrib lit
  const ca = Math.cos(-a), sa = Math.sin(-a);
  const lw = 4.6, lh = 3.0;
  for (let q = 0; q < TAU; q += 0.14) {
    const lx = lw * Math.cos(q), ly = lh * Math.sin(q);
    g.pixel(bx + lx * ca - ly * sa, by + lx * sa + ly * ca);
  }
  for (let u = -1; u <= 1; u += 0.25) g.pixel(bx + u * lw * ca, by + u * lw * sa);
  // the pivot boss it swings from
  g.fillCircle(x, y - 1, 1.5, 1);
  g.pixel(x, y - 3);
}

// ------------------------------------------------------------ the minute

const SINK = [-2.1, -1.4];       // the old relief dissolves back into the board
const RISE = [-1.25, 0.05];      // the new one is cut out of it (done by :00)
const STAGGER = 0.06;

/**
 * What a numeral is doing at `tau` seconds from :00. A cut that is not
 * changing just stands there, grain settled.
 */
function relief(k, tau, changing) {
  if (!changing) return { hold: true };
  const a0 = SINK[0] + STAGGER * (3 - k), a1 = SINK[1] + STAGGER * (3 - k);
  const b0 = RISE[0] + STAGGER * k, b1 = RISE[1] + STAGGER * k;
  if (tau < a0) return { hold: true };
  if (tau < a1) return { sink: (tau - a0) / (a1 - a0) };
  if (tau < b0) return { p1: 0, empty: true };
  if (tau < b1) return { p1: (tau - b0) / (b1 - b0) };
  return { hold: true, settled: clamp01((tau - b1) / 1.6) };
}

// ------------------------------------------------------------ the design

export default {
  name: 'Cuckoo',
  blurb: 'A Black Forest chalet by lamplight: the time is carved in relief into the case and re-cut every minute, the chains drag down a hairline a minute, and on the hour the doors fly open and the cuckoo calls.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  driver: 'full',

  frame(g, { fields: f, date, oled, night }) {
    const t = date.getTime() / 1000;
    const [ox, oy] = orbit(date, 3, 2);
    const late = f.sec >= 46;
    const A = late ? f : previousMinute(date);
    const B = late ? clockFields(new Date(date.getTime() + 60000)) : f;
    const tau = late ? f.sec - 60 : f.sec;
    const hour = B.m === 0;
    const a = [...`${A.hh}${A.mm}`].map(Number), b = [...`${B.hh}${B.mm}`].map(Number);

    // ---- the case
    drawRoof(g, ox, oy, t);
    drawFrieze(g, ox, oy, t);
    // The panel the time is cut into: a moulding round it, its top edge
    // catching the light and its foot in shadow.
    g.hline(PANEL.x + ox, PANEL.y + oy, PANEL.w);
    g.hline(PANEL.x + 1 + ox, PANEL.y + PANEL.h + oy - 1, PANEL.w - 2);
    for (let y = PANEL.y + 1; y < PANEL.y + PANEL.h - 1; y++) {
      g.pixel(PANEL.x + ox, y + oy);
      if (((y + ox) % 3) < 2) g.pixel(PANEL.x + PANEL.w - 1 + ox, y + oy);
    }
    for (const c of [0, 1]) {
      const cx = PANEL.x + (c ? PANEL.w - 1 : 0) + ox, cy = PANEL.y + (c ? PANEL.h - 1 : 0) + oy;
      g.fillCircle(cx, cy, 1.6, 1);
    }

    // ---- the chains. It is a *step*, not a creep: at the top of each minute
    // the chain gives and the weight drops a hairline, then holds — and on the
    // hour, while the bird calls, both are wound all the way back up.
    const step = f.m + ease.inOutQuad(clamp01(f.sec / 0.6));
    const wY = hour
      ? W_BOT - (W_BOT - W_TOP) * smooth((tau + 4.2) / 2.6)
      : W_TOP + (W_BOT - W_TOP) * (step / 60);
    for (let s = 0; s < 2; s++) {
      const cx = CHAIN_X[s];
      drawChain(g, cx + ox, EAVE + 4, wY + 7, wY - W_TOP + s * 3.5, oy);
      drawPinecone(g, cx + ox, wY + 15);
    }

    // ---- the carved time
    for (let k = 0; k < 4; k++) {
      const r = relief(k, tau, a[k] !== b[k]);
      const x0 = SLOT_X[k] + ox, y0 = TOP + oy;
      if (r.hold) {
        drawCut(g, tau < RISE[0] ? a[k] : b[k], x0, y0, () => 1, () => (r.settled ?? 1));
      } else if (r.sink !== undefined) {
        // Un-carving: the board closes over the old numeral from the foot up.
        const q = ease.inOutQuad(r.sink);
        drawCut(g, a[k], x0, y0,
          (x, y) => (dither(x, y + 3, clamp01(1 - q * (1.15 + 0.9 * ((y - y0) / DH)))) ? 1 : 0),
          () => 1);
        shavings(g, k, x0, y0, tau, oy);
      } else if (r.empty) {
        shavings(g, k, x0, y0, tau, oy);
      } else {
        // Carving: the chisel works from the foot of the numeral upwards, and
        // what it has cut is plain wood until the grain settles over it.
        const q = r.p1;
        const front = y0 + DH * (1 - q);
        drawCut(g, b[k], x0, y0, (x, y) => (y >= front ? 1 : 0),
          (x, y) => clamp01((tau - (RISE[0] + (1 - (y - y0) / DH) * (RISE[1] - RISE[0]))) / 1.4));
        shavings(g, k, x0, y0, tau, oy);
      }
    }

    // ---- the colon: two carved pips taking the beat in turn
    for (let n = 0; n < 2; n++) {
      const cy = 31 + n * 11 + oy;
      const y = cy - ((Math.floor(t) + n) % 2 === 0 && frac(t) < 0.2 ? 1 : 0);
      g.fillCircle(COLON_X + ox, y, 1.7, 1);
      g.pixel(COLON_X + ox - 2, y, 0); g.pixel(COLON_X + ox + 2, y, 0);
    }

    // ---- the door and the cuckoo's hour
    const hourShow = cuckooShow(f, tau, hour);
    drawDoor(g, hourShow.open, ox, oy);
    if (hourShow.open > 0.2) {
      drawBird(g, 64 + ox, 2 + hourShow.out * 3, hourShow.lean, hourShow.beak);
      drawCall(g, 56 + ox, 7 + hourShow.out * 3, hourShow.puffs);
    }

    drawPendulum(g, t, ox, oy);

    oled.contrast(0xcf + (0x1c - 0xcf) * night);
  },
};

/** Curls of wood flicked off a numeral while it is being un-cut or cut. */
function shavings(g, k, x0, y0, tau, oy) {
  const t0 = SINK[0] + STAGGER * (3 - k);
  const t1 = RISE[1] + STAGGER * k;
  if (tau < t0 - 0.25 || tau > t1 + 0.6) return;
  for (let n = 0; n < 6; n++) {
    const start = t0 + (t1 - t0) * hash(k, n, 31) * 0.9;
    const age = tau - start;
    if (age < 0 || age > 0.9) continue;
    const cx = x0 + 2 + hash(k, n, 32) * (DW - 4);
    const cy = y0 + 3 + hash(k, n, 33) * (DH - 6);
    const x = cx + 7 * age;
    const y = y0 + 26 * age * age + 5 * age + (cy - y0);
    for (let q = 0; q < 3.8; q += 0.45) {
      const ang = q + age * 11 + n;
      g.pixel(x + 1.7 * Math.cos(ang), y + 1.1 * Math.sin(ang));
    }
  }
}

// ------------------------------------------------------------ the bird's hour

const OUT_AT = -4.8, OUT_T = 1.2, CALL = 0.62, CALL_T = 0.5, IN_T = 1.1;

/** What the bird is doing: `tau` seconds from :00, on the hour. */
function cuckooShow(f, tau, hour) {
  if (!hour) return { open: 0, out: 0, lean: 0, beak: 0, puffs: [] };
  const n = f.h12;
  const out = smooth((tau - OUT_AT) / OUT_T);
  const done = OUT_AT + OUT_T + n * CALL + 0.15;
  const back = 1 - smooth((tau - done) / IN_T);
  const out01 = clamp01(out * back);
  let lean = 0, beak = 0;
  const puffs = [];
  for (let k = 0; k < n; k++) {
    const u = tau - k * CALL;                    // seconds from this call
    if (u < -0.3 || u > 0.75) continue;
    lean += 0.5 * Math.max(0, 1 - Math.abs(u) / 0.34);
    if (u > -0.06 && u < 0.4) beak = Math.max(beak, 0.9);
    if (u > 0) puffs.push(clamp01(u / 0.7));
  }
  return { open: out01, out: out01, lean: clamp(lean, 0, 1), beak, puffs };
}
