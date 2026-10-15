// Kaiten — a conveyor-belt sushi counter, and the time is on the counter.
//
// The minutes are two pieces of nigiri pressed into numerals: a slab of fish
// (the solid core) on a bed of rice (the grey rim, settled a little lower).
// The hour is the picture inside a slice of kazari-maki, a decorated roll:
// two numerals laid in fish through the rice, in a ring of nori. Behind them
// the belt runs left to right all day, crescent slats and plates, and on
// the plates ride little sushi with faces (maguro, salmon, ebi, maki,
// gunkan, a pudding) that blink and look about, under a lantern that sways.
//
// The minute is made by hand. From :56.9 the chef's right hand comes down
// through the pass, takes a fresh slice of fish off a plate as it goes by,
// and carries it over to the numeral that is about to change; the left hand
// comes down to cup it. At :00 they press: the rice squashes, a few grains
// squirt out, and the numeral is squeezed (its distance field blended) from
// the old shape into the new, then the hands lift away. Riders passing the
// gap jump. When both minute digits change, each hand takes one.
//
// The hour is rolled. The left hand wraps the slice in the bamboo mat (the
// slats, end on, a ring of little squares) and at :00 squeezes and rolls it:
// the slice rounds out and the picture inside is pressed into the new hour,
// while the right hand flattens both minutes with the rice paddle. Then the
// mat comes off, the belt races (eight plates go by in four seconds) and
// the riders cheer in a wave along it.
//
// The time is never wrong: digits only change at :00, through shapes that
// are no digit, and a hand only covers a numeral, never replaces it.
// Everything is a function of the clock (the belt's position includes one
// race per hour since the epoch, so it is continuous).
//
// Burn-in: everything orbits a 2 px square (1 px vertically), the belt and
// riders never stop, and the panel dims at night (ctx.night).

import { clamp, lerp, progress, ease, noise, smoothNoise, orbit, previousMinute, clockFields, sprite, dither, ON, OFF } from '../js/kit.js';

const W = 128, H = 32;
const D2R = Math.PI / 180;

// ------------------------------------------------------------ geometry

function arc(cx, cy, rx, ry, a0, a1, n = 8) {
  const pts = [];
  for (let k = 0; k <= n; k++) {
    const a = (a0 + ((a1 - a0) * k) / n) * D2R;
    pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return pts;
}
const line = (x0, y0, x1, y1) => [[x0, y0], [x1, y1]];

/** Distance from (x, y) to a polyline. */
let polyS = 0;
function polyDist(pts, x, y) {
  let m = 1e9, acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const ax = pts[i - 1][0], ay = pts[i - 1][1], bx = pts[i][0], by = pts[i][1];
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    const u = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0;
    const d = Math.hypot(x - ax - u * dx, y - ay - u * dy), l = Math.sqrt(l2);
    if (d < m) { m = d; polyS = acc + u * l; }
    acc += l;
  }
  return m;
}

/** Resample a polyline to n points evenly spaced along it, so any two pieces can be blended. */
function resample(pts, n = 9) {
  const L = [0];
  for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const out = [];
  for (let k = 0; k < n; k++) {
    const s = (L[L.length - 1] * k) / (n - 1);
    let i = 1;
    while (i < L.length - 1 && L[i] < s) i++;
    const u = L[i] > L[i - 1] ? (s - L[i - 1]) / (L[i] - L[i - 1]) : 0;
    out.push([lerp(pts[i - 1][0], pts[i][0], u), lerp(pts[i - 1][1], pts[i][1], u)]);
  }
  return out;
}

// ------------------------------------------------------------ the numerals
//
// Each numeral is a piece of nigiri pressed into its shape: a bed of rice
// (the pale rim) under a slab of fish laid along the same line (the solid
// core, its fat lines across it). Centre-lines in a 10 x 16 box; arcs in
// screen degrees, 0 = right, 90 = down.

const SKEL = {
  0: [arc(5, 8, 3.3, 6.1, 0, 360, 28)],
  1: [[[2.4, 4.4], [5.8, 1.9], [5.8, 14.1]]],
  2: [[...arc(5, 5.1, 3.25, 3.2, 175, 385, 14), [1.7, 14.1], [8.5, 14.1]]],
  3: [arc(4.9, 4.9, 3.1, 3.0, 200, 450, 14), arc(4.9, 11.0, 3.4, 3.1, 270, 520, 14)],
  4: [[[6.7, 14.1], [6.7, 1.9], [1.5, 10.5], [8.7, 10.5]]],
  5: [[[8.1, 1.9], [2.7, 1.9], [2.4, 7.5], ...arc(5, 10.4, 3.5, 3.7, 228, 512, 16)]],
  6: [[...arc(5.8, 9.4, 4.1, 7.5, 292, 180, 10), ...arc(5, 10.5, 3.4, 3.6, 180, 540, 24)]],
  7: [[[1.5, 1.9], [8.5, 1.9], [4.3, 14.1]]],
  8: [arc(5, 4.9, 2.95, 3.0, 0, 360, 20), arc(5, 11.1, 3.5, 3.1, 0, 360, 22)],
};
SKEL[9] = SKEL[6].map((st) => st.map(([x, y]) => [10 - x, 16 - y]).reverse());

const NG = { w: 17, h: 24 };              // a minute numeral's box
const FISH = 1.75, SEAM = 2.75, RICE = 3.7, SETTLE = 1.0;

/** The numeral's strokes scaled into a box. */
function strokes(d, x, y, w, h) {
  return SKEL[d].map((st) => st.map(([u, v]) => [x + (u * w) / 10, y + (v * h) / 16]));
}

function strokeDist(sts, x, y) {
  let m = 1e9;
  for (const st of sts) {
    const d = polyDist(st, x, y);
    if (d < m) m = d;
  }
  return m;
}

// Distance fields are computed once per numeral and size, on a grid of pixel
// centres round the box, and sampled (bilinearly) from then on: a press or a
// morph is then only lookups.
const PAD = 7;
const FIELDS = new Map();
function digitField(d, w, h) {
  const key = d + '/' + w + '/' + h;
  let F = FIELDS.get(key);
  if (!F) {
    const gw = Math.ceil(w) + 2 * PAD, gh = Math.ceil(h) + 2 * PAD;
    const sts = strokes(d, 0, 0, w, h), grid = new Float32Array(gw * gh);
    for (let j = 0; j < gh; j++)
      for (let i = 0; i < gw; i++) grid[j * gw + i] = strokeDist(sts, i + 0.5 - PAD, j + 0.5 - PAD);
    F = { grid, gw, gh };
    FIELDS.set(key, F);
  }
  return F;
}

/** The field at local (box) coordinates, bilinear; far outside it is just "far". */
function sample(F, lx, ly) {
  const fx = lx + PAD - 0.5, fy = ly + PAD - 0.5;
  const i = Math.floor(fx), j = Math.floor(fy);
  if (i < 0 || j < 0 || i >= F.gw - 1 || j >= F.gh - 1) return 99;
  const u = fx - i, v = fy - j, G = F.grid, k = j * F.gw + i;
  return (G[k] * (1 - u) + G[k + 1] * u) * (1 - v) + (G[k + F.gw] * (1 - u) + G[k + F.gw + 1] * u) * v;
}

/**
 * A nigiri numeral in a box (x, y, w, h), between digit a and digit b by u
 * (the rice is blended as a distance field, so it squeezes rather than cuts).
 * `squash` presses it down onto its bed.
 */
function drawNigiri(g, a, b, u, x, y, { w = NG.w, h = NG.h, squash = 0 } = {}) {
  const A = digitField(a, w, h), B = u > 0 && b !== a ? digitField(b, w, h) : null;
  const sxk = 1 / (1 + 0.16 * squash), syk = 1 / (1 - 0.2 * squash);
  const field = (px, py) => {
    // Local coordinates, un-squashed about the bottom centre of the box.
    const lx = w / 2 + (px - x - w / 2) * sxk, ly = h - (y + h - py) * syk;
    const da = sample(A, lx, ly);
    return B ? lerp(da, sample(B, lx, ly), u) : da;
  };
  const bottom = y + h;
  for (let py = Math.floor(y - 5); py < bottom + 6; py++)
    for (let px = Math.floor(x - 5); px < x + w + 5; px++) {
      const f = field(px + 0.5, py + 0.5);
      if (f > RICE + SETTLE + 1) continue;
      let lit = false;
      if (f <= FISH) lit = true;                       // the fish
      else if (f > SEAM && field(px + 0.5, py + 0.5 - SETTLE) <= RICE)
        lit = dither(px - x, py - y, 0.5);             // the rice under it, settled
      g.pixel(px, py, lit ? ON : OFF);
    }
}

// ------------------------------------------------------------ the hour: a slice of kazari-maki
//
// The hour is the picture inside a slice of decorated roll: the numerals are
// laid in fish through the rice, wrapped in nori. A rounded, mat-pressed
// slice; `sq` squeezes it in the mat.

const HR = { x: 20, y: 15.5, a: 16.5, b: 15, n: 2.8 };
const HD = { w: 10.5, h: 18, gap: 1.6, fish: 1.4 };

/** Depth inside the slice's skin in px (negative outside), for a slice squeezed by sq. */
function sliceDepth(px, py, cx, cy, sq) {
  const a = HR.a * (1 - 0.07 * sq), b = HR.b * (1 + 0.035 * sq), n = HR.n - 0.6 * sq;
  const q = (Math.abs((px - cx) / a) ** n + Math.abs((py - cy) / b) ** n) ** (1 / n);
  return (1 - q) * Math.min(a, b);
}

function drawHourSlice(g, ha, hb, u, cx, cy, sq) {
  const digs = (hh) => [Math.floor(hh / 10), hh % 10];
  const [a0, a1] = digs(ha), [b0, b1] = digs(hb);
  const x0 = cx - HD.gap / 2 - HD.w, x1 = cx + HD.gap / 2, y0 = cy - HD.h / 2;
  // The squeeze presses the picture with the slice.
  const k = 1 - 0.07 * sq, kv = 1 + 0.035 * sq;
  const parts = [[a0, b0, x0], [a1, b1, x1]].map(([p, q, x]) => {
    const xs = cx + (x - cx) * k, w = HD.w * k, h = HD.h * kv, y = cy - h / 2;
    return { x: xs, y, k: w / HD.w, kv: h / HD.h, A: digitField(p, HD.w, HD.h), B: p !== q && u > 0 ? digitField(q, HD.w, HD.h) : null };
  });
  const fishAt = (px, py) => {
    let m = 1e9;
    for (const P of parts) {
      const lx = (px - P.x) / P.k, ly = (py - P.y) / P.kv;
      const da = sample(P.A, lx, ly);
      const d = P.B ? lerp(da, sample(P.B, lx, ly), u) : da;
      if (d < m) m = d;
    }
    return m;
  };
  const X0 = Math.floor(cx - HR.a - 2), X1 = Math.ceil(cx + HR.a + 2);
  const Y0 = Math.floor(cy - HR.b * 1.05 - 2), Y1 = Math.ceil(cy + HR.b * 1.05 + 2);
  for (let py = Y0; py < Y1; py++)
    for (let px = X0; px < X1; px++) {
      const dep = sliceDepth(px + 0.5, py + 0.5, cx, cy, sq);
      if (dep < -1) continue;
      let lit = false;
      if (dep < 0) lit = false;                       // a dark keyline round it
      else if (dep < 1.05) lit = true;                 // the nori's sheen
      else if (dep < 3.0) lit = false;                 // nori
      else {
        const f = fishAt(px + 0.5, py + 0.5);
        if (f <= HD.fish) lit = true;                  // fish
        else if (f <= HD.fish + 1.0) lit = false;      // its seam
        else lit = dither(px - Math.round(cx), py - Math.round(cy), 0.32);   // rice
      }
      g.pixel(px, py, lit ? ON : OFF);
    }
}

/** The bamboo mat round the slice: slats end-on, a ring of little squares. */
function drawMat(g, cx, cy, sq, wrap, phase) {
  const NS = 24;
  for (let i = 0; i < NS; i++) {
    const t = i / NS;
    if (t > wrap) continue;
    const ang = (t + phase) * Math.PI * 2;
    const a = HR.a * (1 - 0.07 * sq) + 2.6, b = HR.b * (1 + 0.035 * sq) + 2.6;
    const c = Math.cos(ang), s = Math.sin(ang);
    const n = HR.n - 0.6 * sq;
    const r = 1 / ((Math.abs(c / a) ** n + Math.abs(s / b) ** n) ** (1 / n));
    const x = Math.round(cx + r * c - 1), y = Math.round(cy + r * s - 1);
    g.fillRect(x - 1, y - 1, 5, 5, OFF);
    g.fillRect(x, y, 3, 3, ON);
    g.pixel(x + 1, y + 1, OFF);   // a hollow bamboo, end on
  }
}

// ------------------------------------------------------------ the belt and its riders
//
// Behind the counter the belt runs left to right, crescent slats and all,
// with a plate every SP pixels. Most plates carry a little sushi with a face;
// they come out from behind the roll, cross the gap, and go behind the
// minutes. Eyes are holes cut in the lit body.

const BELT_Y = 22;           // the belt's top edge
const BELT_V = 9;            // px a second
const SP = 32;               // plate pitch
const SLAT = 7;

const PLATE_SPR = sprite(`
  ###############
  .#############.
  .....#####.....
`);

// Each rider: a body sprite drawn above the plate, its eye holes (x, y) and
// mouth, so it can blink and look. `lit` riders are outlines with lit eyes.
const RICE_BODY = `
      .#############.
      ###############
      ###############
      ###############
      .#############.`;
const RIDERS = [
  { name: 'maguro', spr: sprite(`
      ...#########...
      .#############.
      ###############
      ...............` + RICE_BODY), eyes: [[3, 6], [11, 6]], mouth: [[7, 7]] },
  { name: 'sake', spr: sprite(`
      ...###.###.#...
      .####.###.####.
      ###.###.###.###
      ...............` + RICE_BODY), eyes: [[3, 6], [11, 6]], mouth: [[7, 7]] },
  { name: 'purin', spr: sprite(`
      ....#####....
      ...#######...
      .............
      ...#######...
      ..#########..
      ..#########..
      .###########.
      .###########.
      #############
    `), eyes: [[4, 5], [8, 5]], mouth: [[6, 6]] },
  { name: 'maki', spr: sprite(`
      ...#######...
      .##.......##.
      #....###....#
      #...#####...#
      .##.......##.
      #############
      #############
      #############
      #############
      .###########.
    `), eyes: [[3, 6], [9, 6]], mouth: [[6, 7]] },
  { name: 'ikura', spr: sprite(`
      ..#.#.#.#.#..
      .#.#.#.#.#.#.
      #.#.#.#.#.#.#
      .###########.
      .#.........#.
      .#.........#.
      .#.........#.
      .#.........#.
      .###########.
    `), eyes: [[4, 5], [8, 5]], mouth: [[6, 6]], lit: true },
  { name: 'ebi', spr: sprite(`
      #..............
      ###............
      .###...........
      ..#############
      .##.##.##.##.##
      .##############
      ...............` + RICE_BODY), eyes: [[3, 9], [11, 9]], mouth: [] },
];

function hash(n, s = 0) {
  let h = (n * 374761393 + s * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** What rides plate n: a rider index, or -1 for an empty plate. */
const riderOf = (n) => (hash(n, 3) < 0.12 ? -1 : Math.floor(hash(n, 4) * RIDERS.length));

/**
 * Draws one rider with its plate, plate's top-left at (x, BELT_Y - 3).
 * look: -1..1 eye shift; blink: eyes shut; hop: px raised.
 */
function drawRider(g, k, x, look, blink, hop, gasp) {
  x = Math.round(x);
  g.blit(PLATE_SPR, x, BELT_Y - 3);
  if (k < 0) return;
  const R = RIDERS[k];
  const bx = x + Math.floor((15 - R.spr.w) / 2), by = BELT_Y - 3 - R.spr.h - Math.round(hop);
  g.blit(R.spr, bx, by);
  const lx = look > 0.3 ? 1 : look < -0.3 ? -1 : 0;
  for (const [ex, ey] of R.eyes) {
    const c = R.lit ? ON : OFF;
    if (blink) { g.pixel(bx + ex + lx, by + ey, c); g.pixel(bx + ex + lx + (ex < R.spr.w / 2 ? -1 : 1), by + ey, c); }
    else g.pixel(bx + ex + lx, by + ey, c);
  }
  for (const [mx, my] of R.mouth) g.pixel(bx + mx + lx, by + my + (gasp ? 0 : 0), R.lit ? ON : OFF);
  if (gasp) for (const [mx, my] of R.mouth) g.pixel(bx + mx + lx, by + my + 1, R.lit ? ON : OFF);
}

/** The belt itself: a run of crescent slats, each with its own lip, moving. */
function drawBelt(g, pos, ox, oy) {
  const ph = (pos % SLAT + SLAT) % SLAT;
  for (let x = -SLAT + ph; x < W; x += SLAT) {
    const xi = Math.round(x) + ox, y = BELT_Y + oy;
    g.hline(xi, y, SLAT - 1);                  // the slat's lip
    g.hline(xi + 1, y + 2, SLAT - 3);          // its crescent, below
    g.pixel(xi, y + 1).pixel(xi + SLAT - 2, y + 1);
  }
}

/** A paper lantern over the pass, swinging a little on its cord. */
const LANTERN = sprite(`
  ..###..
  .#...#.
  #######
  #.....#
  #######
  .#...#.
  ..###..
`);
function drawLantern(g, T, ox, oy) {
  const sw = Math.sin(T * 1.1) * 0.8 + Math.sin(T * 0.37) * 0.5;   // radians-ish, small
  const cx = 56.5 + ox, cord = 2 + oy;
  const lx = cx + sw * 0.9;
  g.vline(Math.round(cx), 0, cord);
  g.blit(LANTERN, Math.round(lx - 3.5), cord);
  g.pixel(Math.round(lx + sw * 0.6), cord + 7);   // its tassel
}

/** Grains of rice squeezed out by a press, flying in arcs from (cx, cy). */
function drawGrains(g, cx, cy, age, seed) {
  if (age < 0 || age > 1.2) return;
  for (let k = 0; k < 7; k++) {
    const vx = (hash(seed, k) - 0.5) * 34, vy = -10 - hash(seed, k + 9) * 16;
    const x = cx + vx * age, y = cy + vy * age + 40 * age * age;
    if (y > 30) continue;
    g.pixel(Math.round(x), Math.round(y));
    if (hash(seed, k + 20) < 0.5) g.pixel(Math.round(x) + 1, Math.round(y));
  }
}

// ------------------------------------------------------------ the chef's hands
//
// They come down from above the glass, in white sleeves, to press the rice.

// A hand seen from the back, fingers down, the thumb tucked to one side.
const HAND = sprite(`
  ..#######..
  .#########.
  ###########
  ###########
  ###########
  ###########
  #.##.##.##.
  #.##.##.##.
  ..#..#..#..
`);
const HAND_W = 11, HAND_H = 9, SLEEVE_W = 9;

/** A hand whose bottom is at (x, yb) (x = its left), sleeve up to the top edge. */
function drawHand(g, x, yb, flip = false) {
  x = Math.round(x); yb = Math.round(yb);
  const top = yb - HAND_H;
  const sx = x + 1;
  g.fillRect(x - 1, top - 1, HAND_W + 2, HAND_H + 2, OFF);
  if (top > 0) {
    // The white sleeve of the chef's jacket, folded back at a cuff.
    g.fillRect(sx - 1, 0, SLEEVE_W + 2, top, OFF);
    g.fillRect(sx, 0, SLEEVE_W, top - 1);
    g.hline(sx + 1, top - 3, SLEEVE_W - 2, OFF);
  }
  g.blit(HAND, x, top, { flipX: flip });
}

// ------------------------------------------------------------ the scene

const MX = [76, 98], MY = 2;            // the minute numerals' boxes
const GETA_Y = 29;
const TURN = { down: [58.7, 59.7], press: [0, 1.7], up: [1.7, 2.7] };
// Before the turn, the right hand takes a fresh slice of fish off a plate on
// the belt and carries it to the numeral it will press.
const FETCH = { down: [56.9, 57.7], grab: [57.7, 58.2], carry: [58.2, 59.3], lay: [59.75, 60] };
const PICK_X = 50;           // where the fish's plate is, about, when it is taken
const NETA = sprite(`
  ..###.###.#..
  .###.###.###.
  ###.###.###.#
  .###########.
`);

// On the hour the belt races: RACE px extra, run off between RACE_T[0] and
// RACE_T[1] seconds into the hour, and kept ever after, so the belt's
// position is a pure function of the time.
const RACE = SP * 8, RACE_T = [2.0, 6.5];
function beltPos(T, tz) {
  const L = T + tz, hi = Math.floor(L / 3600), into = L - hi * 3600;
  return T * BELT_V + RACE * (hi + ease.inOutCubic(progress(into, RACE_T[0], RACE_T[1])));
}

/** Which plate carries the fish for the minute that starts at m0 (seconds). */
const netaPlate = (m0, tz) => Math.round((beltPos(m0 + FETCH.grab[0], tz) - 20 - PICK_X) / SP);

const HOUR = { come: [55.8, 57.0], wrap: [57.0, 59.2], unwrap: [2.0, 3.0], go: [3.0, 4.0], wave: [2.2, 5.2] };

/** The rice paddle the right hand flattens both minutes with on the hour. */
function drawPaddle(g, x0, x1, y) {
  x0 = Math.round(x0); x1 = Math.round(x1); y = Math.round(y);
  g.fillRect(x0 - 1, y - 1, x1 - x0 + 2, 5, OFF);
  g.rect(x0, y, x1 - x0, 3);
  for (let x = x0 + 3; x < x1 - 2; x += 4) g.pixel(x, y + 1);   // the grain of the wood
}

function pressAt(sec) {
  // 0 out of sight .. 1 on the rice; and the squash of the press.
  if (sec >= TURN.down[0]) return { reach: ease.outCubic(progress(sec, TURN.down[0], TURN.down[1])), sq: 0 };
  if (sec < TURN.press[1]) {
    const p = progress(sec, TURN.press[0], TURN.press[1]);
    return { reach: 1, sq: Math.sin(Math.PI * Math.min(1, p * 2)) ** 2 * 0.9 + Math.sin(Math.PI * Math.max(0, p * 2 - 1)) ** 2 * 0.6 };
  }
  if (sec < TURN.up[1]) return { reach: 1 - ease.inCubic(progress(sec, TURN.up[0], TURN.up[1])), sq: 0 };
  return { reach: 0, sq: 0 };
}

// ------------------------------------------------------------ digit sheet

export const digitSheetSize = { w: 222, h: 64 };
/** Every numeral both ways it is served: as nigiri (minutes) and in the roll (hours). */
export function drawDigitSheet(g) {
  for (let d = 0; d < 10; d++) drawNigiri(g, d, d, 0, 4 + d * 22, 3);
  for (let h = 0; h < 6; h++) drawHourSlice(g, [0, 7, 12, 18, 23, 9][h], [0, 7, 12, 18, 23, 9][h], 0, 19 + h * 37, 47, 0);
}

export default {
  name: 'Kaiten',
  blurb: 'A sushi counter: the minutes are nigiri pressed into numerals, the hour a slice of decorated roll; the chef takes fresh fish off the belt and presses the next minute, and on the hour rolls a new slice in the mat while the belt races.',
  module: '091-128x32',
  colour: 'white',
  bus: 'i2c400',
  fps: 50,
  driver: 'full',

  frame(g, { fields: f, date, oled, night }) {
    oled.contrast(0xcf + (0x20 - 0xcf) * night);
    const T = date.getTime() / 1000, sec = f.sec;
    const [ox] = orbit(date, 2, 3);
    const oy = orbit(new Date(date.getTime() + 7 * 60000), 1, 4)[1];

    // What the minute turn is doing: from :58.7 the hands come for the next
    // minute's change; until :02.7 they are finishing this one's.
    const before = sec >= 55.5;
    const cur = f, prev = previousMinute(date), next = clockFields(new Date(date.getTime() + 60000));
    const from = before ? cur : prev, to = before ? next : cur;
    const { reach, sq } = pressAt(sec);
    const u = before ? 0 : ease.inOutCubic(progress(sec, 0.15, 1.5));
    const hourTurn = to.m === 0 && from.h !== to.h;
    const md = [Math.floor(from.m / 10), from.m % 10], nd = [Math.floor(to.m / 10), to.m % 10];
    const moving = [md[0] !== nd[0], md[1] !== nd[1]];

    // ---- the pass behind: a lantern, and the belt
    const tz = -date.getTimezoneOffset() * 60;
    const pos = beltPos(T, tz);
    drawLantern(g, T, ox, oy);
    drawBelt(g, pos, ox, oy);
    const n0 = Math.floor(pos / SP);
    const m0 = T - sec;
    const nNow = netaPlate(m0, tz), nPrev = netaPlate(m0 - 60, tz);
    const fetching = !(next.m === 0);    // on the hour the paddle is used instead
    const fetchedNow = sec >= FETCH.grab[0] + 0.3;
    for (let n = n0 - 6; n <= n0 + 1; n++) {
      const x = pos - n * SP;              // plate n's left edge, moving right
      const x0 = x - 20;
      if (x0 < -14 || x0 > W) continue;
      let k = riderOf(n);
      if (n === nNow || n === nPrev) k = -1;
      const blink = (T + hash(n, 7) * 5) % 4.3 < 0.15;
      const look = sec > 58.5 || sec < 3 ? 1 : Math.round(smoothNoise(T / 2.5 + n * 3.1, 5) * 2.4 - 1.2);
      const startled = !before && sec < 2.2 && x0 > 36 && x0 < 74;
      let hop = startled ? 3 * Math.abs(Math.sin(sec * Math.PI * 1.4)) : 0;
      if (hourTurn && !before) {
        // On the hour the whole belt cheers, a wave running along it.
        const w = progress(sec, HOUR.wave[0] + x0 / 60, HOUR.wave[0] + x0 / 60 + 0.7);
        hop = Math.max(hop, 4 * Math.sin(Math.PI * w));
      }
      drawRider(g, k, x0 + ox, look, blink, hop, startled);
      if (n === nNow && fetching && !fetchedNow) g.blit(NETA, x0 + ox + 1, BELT_Y - 7);
    }

    // ---- the hour slice: on the hour the left hand rolls it in the mat
    const hourNear = hourTurn && (before ? sec >= HOUR.come[0] : sec < HOUR.go[1]);
    const hs = hourTurn && !before ? sq : 0;
    const hu = hourTurn && !before ? u : 0;
    const hx = HR.x + ox, hy = HR.y + oy;
    drawHourSlice(g, from.h, hourTurn ? to.h : from.h, hu, hx, hy, hs);
    if (hourNear) {
      const wrap = before ? ease.inOutQuad(progress(sec, HOUR.wrap[0], HOUR.wrap[1])) : 1 - ease.inOutQuad(progress(sec, HOUR.unwrap[0], HOUR.unwrap[1]));
      const roll = before ? 0 : 0.12 * Math.sin(Math.PI * 2 * progress(sec, 0, 1.9)) * (1 - progress(sec, 1.5, 1.9));
      if (wrap > 0) drawMat(g, hx, hy, hs, wrap, 0.75 - wrap * 0.5 + roll);
      const reachL = before ? ease.outCubic(progress(sec, HOUR.come[0], HOUR.come[1])) : 1 - ease.inCubic(progress(sec, HOUR.go[0], HOUR.go[1]));
      const yb = -1 + reachL * (7 + oy) + hs * 3;
      drawHand(g, hx - 6 + roll * 40, yb, true);
    }

    // ---- the minutes, on their board
    for (let i = 0; i < 2; i++) {
      const s2 = moving[i] ? sq : 0;
      drawNigiri(g, md[i], nd[i], moving[i] ? u : 0, MX[i] + ox, MY + oy, { squash: s2 });
    }
    if (!before) for (let i = 0; i < 2; i++)
      if (moving[i]) {
        drawGrains(g, MX[i] + ox + 2, MY + 14 + oy, sec - 0.35, f.minuteKey * 2 + i);
        drawGrains(g, MX[i] + ox + NG.w - 2, MY + 14 + oy, sec - 1.05, f.minuteKey * 2 + i + 7);
      }
    g.hline(MX[0] - 3 + ox, GETA_Y + oy, MX[1] + NG.w - MX[0] + 6);
    g.fillRect(MX[0] + ox, GETA_Y + 1 + oy, 2, 3).fillRect(MX[1] + NG.w - 2 + ox, GETA_Y + 1 + oy, 2, 3);

    // ---- the hands
    if (hourTurn) {
      if (reach <= 0) return;
      const yp = -4 + reach * (MY + 3 + oy) + sq * 4;
      drawPaddle(g, MX[0] - 2 + ox, MX[1] + NG.w + 2 + ox, yp);
      drawHand(g, (MX[0] + MX[1] + NG.w) / 2 - 5 + ox, yp, false);
      return;
    }
    const both = moving[0] && moving[1], tgt = moving[1] ? 1 : 0;
    const pressY = MY + 7 + oy + sq * 3, inn = sq * 1.5;
    // Where each hand presses: both numerals one hand each, or one numeral cupped by both.
    const leftAt = both ? MX[0] + ox + 3 : MX[tgt] + ox - 5 + inn;
    const rightAt = both ? MX[1] + ox + 3 : MX[tgt] + ox + NG.w - 6 - inn;
    if (reach > 0) drawHand(g, leftAt, -1 + reach * (pressY + 1), true);
    // The right hand: off to the belt for the fish, then to the press.
    let rx = null, ry = 0, carry = false;
    if (!before) {
      if (reach > 0) { rx = rightAt; ry = -1 + reach * (pressY + 1); }
    } else if (sec >= FETCH.down[0]) {
      const plateX = (t) => beltPos(m0 + t, tz) - nNow * SP - 20 + ox + 2;
      const grabY = BELT_Y - 7 + oy;
      if (sec < FETCH.grab[0]) {
        rx = plateX(sec); ry = lerp(-1, grabY, ease.outCubic(progress(sec, FETCH.down[0], FETCH.down[1])));
      } else if (sec < FETCH.carry[0]) {
        rx = plateX(sec); carry = sec >= FETCH.grab[0] + 0.3;
        ry = grabY - 3 * ease.inOutQuad(progress(sec, FETCH.grab[0] + 0.3, FETCH.carry[0]));
      } else {
        carry = true;
        const p = ease.inOutCubic(progress(sec, FETCH.carry[0], FETCH.carry[1]));
        const x0 = plateX(FETCH.carry[0]), hoverY = pressY - 3;
        rx = lerp(x0, rightAt, p);
        ry = lerp(grabY - 3, hoverY + 3, p) - 2 * Math.sin(Math.PI * p);
        ry += 3 * ease.inOutQuad(progress(sec, FETCH.lay[0], FETCH.lay[1]));
      }
    }
    if (rx !== null) {
      if (carry) {
        g.fillRect(Math.round(rx) - 2, Math.round(ry) - 3, 15, 6, OFF);
        g.blit(NETA, Math.round(rx) - 1, Math.round(ry) - 2);
      }
      drawHand(g, rx, ry - (carry ? 2 : 0), false);
    }
  },
};
