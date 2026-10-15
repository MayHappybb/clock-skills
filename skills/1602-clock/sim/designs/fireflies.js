// Fireflies — a summer meadow at dusk, and a frog in glasses who is hungry.
//
//          +              +            (o)   (o)       lenses: the frog's eyes
//   ılı_ılı ılı__ılı_ılı ılı_         [ frog body ] ılı_   tufts, bare ground
//
// Not a clock: a desk ornament. Seven fireflies wander the glass and flash
// as real ones do, about every five and a half seconds. Only the flashes are
// seen, so each is held still where it starts, and the glass does the rest:
// a flash is one dot for 200 ms, a five-dot glow for 400 ms, one dot for
// 200 ms, and the liquid crystal's 150 ms lag turns those steps into a soft
// swell and fade, which is what a firefly looks like. The panel is negative
// blue, so they are points of light on a dark field.
//
// One evening is four minutes, worked out from the time of day alone:
//
//   0:00  the meadow is dark; a firefly comes out every nine seconds
//   0:48  their flashes begin to drift into step (each one's phase offset
//         is eased to zero, so it speeds up or slows down a little)
//   ~1:10 the first hunt: one firefly is steered over the frog's head. It
//         watches, cross-eyed, then its tongue goes up. Half the evenings
//         it misses, the firefly flashes off to the left, and it blinks
//   2:00  in step: the whole meadow flashes together, in bursts of three,
//         as synchronous fireflies do
//   ~2:40 the second hunt, on one of those bursts, always catches: gulp,
//         eyes shut happy, then a hiccup, and the firefly comes back out
//         of its mouth and floats off, none the worse
//   3:17  they drift out of step again, and the evening starts over
//
// Between hunts the frog watches whichever firefly flashed last, and blinks.
//
// Budget. The frog is five tiles: three for its body along the bottom row
// and its two lenses, which sit in the top row with a sky cell between them.
// The lenses are the same tile whenever both pupils look the same way, so
// it usually costs four. One tile of grass tufts is repeated along the
// meadow, alternating with ROM underscores at the same height; it sways
// between two poses, all at once, so it stays one tile. That leaves three or
// four slots for fireflies, and a flash costs its cell a private tile. To
// let the whole meadow light at once, every flash sits on a coarse lattice
// inside its cell while they are in step (middle of the cell, high or low,
// or just above a tuft), so any number of them are three tiles. Out of step
// few are lit at once and they get four positions per cell. A flash that
// would need a ninth slot stays dark, brightest first, so the faintest go.
// The tongue runs straight up from the middle of the mouth into the sky cell
// between the lenses, so a hunt costs one extra tile.
//
// Tried and dropped: an outline frog front-on, two cells wide, read as an
// owl or as the letters "pg"; a profile frog read as a person. Fifteen dots
// wide, eyes on top with a dip between them and legs splayed, it reads as a
// frog. ROM grass (v, w, V, W) read as text. Two fireflies stacked in one
// cell merged into a dagger, so it is one to a cell. A low glow touching a
// blade tip merged into the grass, so the tufts are short and a glow low in
// the grass has no bottom arm.
//
// 8 tiles at most; ~42 ms a frame on 100 kHz I2C, at 10 fps.

import { Stage, noise, smoothNoise, clamp } from '../js/kit.js';
import { parseRow } from '../js/hd44780.js';

const FPS = 10;
const N = 7;                  // fireflies in the meadow
const P = 5.5;                // seconds between one firefly's flashes
const EP = 240;               // one evening: scattered, synchronising, in step, apart

const FROG = 11;              // frog's left column: body in 11-13 below, lenses at 11 and 13 above
const HEAD = FROG + 1;        // the sky cell between its lenses
const frac = (v) => v - Math.floor(v);
const smooth = (a, b, v) => { const u = clamp((v - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); };

// ------------------------------------------------------------ fireflies

/** How in step the meadow is, 0-1, at second `e` of the evening. */
function sync(e) {
  const u = e / EP;
  return smooth(0.2, 0.5, u) * (1 - smooth(0.82, 0.98, u));
}

/** Seconds since firefly i's flash started (0 to P). */
function sinceFlash(i, T, s) {
  const own = noise(i, 3) + 0.25 * smoothNoise(T / 37, i + 20);
  return frac(T / P + (1 - s) * own) * P;
}

/** Where firefly i is wandering, in glass columns and dot rows, clear of the frog. */
function wander(i, T) {
  let x = 1 + 70 * (0.75 * smoothNoise(T / 21 + i * 13.7, i) + 0.25 * smoothNoise(T / 6 + i * 3.1, i + 40));
  if (x > 62) x += 24;
  const y = clamp(-2 + 15 * (0.7 * smoothNoise(T / 15 + i * 5.3, i + 60) + 0.3 * smoothNoise(T / 5 + i, i + 80)), 1, 11);
  return { x: Math.min(x, 94), y };
}

/** Brightness `a` seconds into a flash: 0 dark, 1 a spark, 2 a glow. */
function flash(a) {
  if (a < 0) return 0;
  if (a < 0.2) return 1;
  if (a < 0.6) return 2;
  if (a < 0.8) return 1;
  return 0;
}

/**
 * In step, the meadow flashes as synchronous fireflies do: a burst of three,
 * together, then dark. Returns the brightness and how long ago this flash
 * of the burst began, which is where it is seen.
 */
const BURST = 3, BEAT = 0.8;
function burst(a) {
  const n = Math.floor(a / BEAT), sub = a - n * BEAT;
  if (n >= BURST) return { level: 0, sub };
  return { level: sub < 0.2 ? 1 : sub < 0.5 ? 2 : 0, sub };
}

/**
 * Seat a flash on a cell, so a glow never straddles two. While the meadow is
 * out of step few are lit at once, and a glow sits on one of four places in
 * its cell. In step they all light together, so each sits in the middle of
 * its cell, high or low, or just above a tuft: every flash is then one of
 * three tiles, and the whole meadow can light at once for three slots.
 */
function seat(p, coarse) {
  const col = clamp(Math.floor(p.x / 6), 0, 15);
  const row = p.y < 8 ? 0 : 1;
  if (coarse) {
    // Low over a tuft, or high or low in the sky; over bare ground it rises.
    if (row && MEADOW[col] === 'T') return { x: col * 6 + 2, y: 9 };
    return { x: col * 6 + 2, y: p.y < 4 ? 2 : 5 };
  }
  const dx = p.x - col * 6 < 2.5 ? 1 : 3;
  const dy = row === 0 ? (p.y < 3.5 ? 2 : 5) : 1;
  return { x: col * 6 + dx, y: row * 8 + dy };
}

/** Seat a flash; one being steered to the frog keeps its exact place. */
function w8(p, steered, coarse) {
  if (steered && Math.abs(p.x - PREY.x) < 3 && Math.abs(p.y - PREY.y) < 1) return { x: PREY.x, y: PREY.y };
  return seat(p, coarse);
}

function glow(st, c, level) {
  st.dot(c.x, c.y);
  if (level < 2) return;
  st.dot(c.x - 1, c.y).dot(c.x + 1, c.y).dot(c.x, c.y - 1);
  if (c.y !== 9) st.dot(c.x, c.y + 1);      // low in the grass, its bottom is hidden
}

// ----------------------------------------------------------------- frog

// A lens of its glasses, one cell, sitting on the top of its head. The
// pupil is 2x2 in a 3x3 ring, so it can only look one way or the other;
// `look` is [right, down], each 0 or 1.
function lens(eye, look = [0, 1]) {
  const r = ['.....', '.....', '.....', '.###.', '#...#', '#...#', '#...#', '.###.'].map((x) => x.split(''));
  if (eye === 'open') for (const dy of [0, 1]) for (const dx of [0, 1]) r[4 + look[1] + dy][1 + look[0] + dx] = '#';
  else if (eye === 'shut') r[5] = '#####'.split('');
  else if (eye === 'happy') { r[4][2] = '#'; r[5][1] = '#'; r[5][3] = '#'; }
  return r.map((x) => x.join(''));
}

// Its body, three cells: the top of its head, a wide mouth (open for a
// hiccup), legs splayed.
function body(open) {
  const rows = [
    '.#############.',
    '###############',
    '#.............#',
    open ? '#.............#' : '###############',
    '.#############.',
    '.#############.',
    '##.#########.##',
    '#..##.....##..#',
  ];
  return [0, 1, 2].map((c) => rows.map((r) => r.slice(c * 5, c * 5 + 5)));
}

// The tongue goes straight up out of the middle of its mouth, through the
// sky cell between its lenses, which is where a firefly gets caught.
const TONGUE_X = HEAD * 6 + 2, MOUTH_Y = 10, PREY = { x: TONGUE_X, y: 3 };

/**
 * The evening's two hunts. Each steers one firefly to hover above the
 * frog's head and flash there at `Ts`. The first is early, while the meadow
 * is still out of step, and can miss; the second comes on a flash of the
 * whole meadow in step, and catches.
 */
function hunts(k) {
  const j1 = Math.floor(noise(k, 5) * N), j2 = (j1 + 1 + Math.floor(noise(k, 6) * (N - 1))) % N;
  const base = k * EP;
  return [
    { j: j1, Ts: base + 62 + 25 * noise(k, 1), miss: noise(k, 4) < 0.5 },
    { j: j2, Ts: P * Math.ceil((base + 150 + 20 * noise(k, 2)) / P), miss: false },
  ];
}

/** How far a hunted firefly has been steered over the frog, 0-1. */
function hunted(h, T) {
  const w = clamp((T - (h.Ts - 12)) / 8, 0, 1) * (1 - clamp((T - (h.Ts + 4)) / 8, 0, 1));
  return w;
}

// --------------------------------------------------------------- meadow

const TUFT = [
  ['.....', '.....', '.....', '#.#..', '#.#.#', '.###.', '#####', '.....'],
  ['.....', '.....', '.....', '.#.#.', '#.##.', '.###.', '#####', '.....'],
];
// Tufts, bare ground (ROM underscore, level with the tufts' soil), the frog.
const MEADOW = 'T_TT__T_TT_...T_';

/** Distinct tiles the stage would need, without drawing it. */
function tilesNeeded(st) {
  const keys = new Set();
  for (let row = 0; row < 2; row++) for (let col = 0; col < 16; col++) {
    const what = st.cells[row][col], ink = st.ink.get(row * 16 + col);
    if (ink) keys.add(st.base(col, row).map((b, r) => (b | ink[r]) & 0x1f).join());
    else if (Array.isArray(what)) keys.add(what.map(parseRow).join());
  }
  return keys.size;
}

export default {
  name: 'Fireflies',
  blurb: 'Dusk in a meadow: fireflies drift, fall into step, and a frog in glasses waits.',
  bus: 'i2c100',
  panel: 'blue',
  fps: FPS,

  frame(lcd, api, { fields }) {
    const T = fields.h * 3600 + fields.m * 60 + fields.s + fields.ms / 1000;
    const e = ((T % EP) + EP) % EP;
    const s = sync(e);
    const st = new Stage(lcd);

    const tuft = TUFT[Math.floor(T / 1.6 + smoothNoise(T / 9, 7)) & 1];
    [...MEADOW].forEach((m, c) => { if (m !== '.') st.put(c, 1, m === 'T' ? tuft : 0x5f); });

    const k = Math.floor(T / EP);
    const hs = [...hunts(k - 1), ...hunts(k)];
    const hunt = hs.find((h) => T > h.Ts - 14 && T < h.Ts + 14);
    const ha = hunt ? T - hunt.Ts : null;          // seconds since the snap flash

    // Fireflies that are lit now, brightest first. A firefly comes out
    // every few seconds at the start of the evening.
    const lit = [];
    let latest = null;
    for (let i = 0; i < N; i++) {
      if (e < 4 + i * 9) continue;
      let a = sinceFlash(i, T, s), level;
      if (s > 0.95) ({ level, sub: a } = burst(a));
      else level = flash(a);
      let p = wander(i, T - a);
      if (hunt && hunt.j === i) {
        const w = hunted(hunt, T - a);
        p = { x: p.x + (PREY.x - p.x) * w, y: p.y + (PREY.y - p.y) * w };
        const t0 = T - a - hunt.Ts;
        if (t0 > -1 && t0 < (hunt.miss ? 2 : 7)) continue;   // the hunt's own flashes, below
      }
      const c = w8(p, hunt && hunt.j === i, s > 0.3);
      if (!latest || a < latest.a) latest = { a, c };
      if (level) lit.push({ i, level, c });
    }
    lit.sort((p, q) => q.level - p.level);

    // The frog: watching the last flash, blinking now and then.
    let look = latest ? [latest.c.x < TONGUE_X ? 0 : 1, latest.c.y < 8 ? 0 : 1] : [0, 1];
    let eyes = frac(T / 7.3) < 0.028 ? ['shut', 'shut'] : ['open', 'open'];
    let looks = [look, look], open = false, tongue = 0;
    const prey = [];                                // [x, y, level] drawn by the hunt
    if (hunt) {
      if (ha > -6 && ha < 0.9) looks = [[1, 0], [0, 0]];          // cross-eyed at the firefly overhead
      if (ha >= 0 && ha < 0.2) prey.push([PREY.x, PREY.y, 1]);
      if (ha >= 0.2 && ha < (hunt.miss ? 0.45 : 0.7)) prey.push([PREY.x, PREY.y, 2]);
      if (ha >= 0.3 && ha < 0.5) tongue = 7;                       // up out of the mouth
      if (ha >= 0.5 && ha < 0.7) tongue = PREY.y + 1;              // at the firefly
      if (ha >= 0.7 && ha < 0.9) tongue = 7;                       // reeling in
      if (hunt.miss) {
        // It ducks out of the way and flashes off to the left: missed.
        const dodge = { x: (HEAD - 3) * 6 + 3, y: 2 };
        if (ha >= 1.0 && ha < 1.8) prey.push([dodge.x, dodge.y, ha < 1.2 || ha >= 1.6 ? 1 : 2]);
        if (ha >= 0.9 && ha < 3) looks = [[0, 0], [0, 0]];
        if (ha >= 2.2 && ha < 2.4) eyes = ['shut', 'shut'];
      } else {
        if (ha >= 0.7 && ha < 0.9) prey.push([TONGUE_X, 6, 2]);   // on the tongue
        if (ha >= 0.9 && ha < 1.2) eyes = ['shut', 'shut'];        // gulp
        else if (ha >= 1.2 && ha < 3.6) eyes = ['happy', 'happy'];
        // A hiccup, and out it comes, none the worse.
        if (ha >= 4.6 && ha < 5.0) { eyes = ['shut', 'shut']; open = true; }
        if (ha >= 4.8 && ha < 5.0) prey.push([TONGUE_X, MOUTH_Y, 1]);
        if (ha >= 5.0 && ha < 5.8) prey.push([TONGUE_X, 5, 2]);
        if (ha >= 5.8 && ha < 6.0) prey.push([TONGUE_X, 4, 1]);
        if (ha >= 5.0 && ha < 7) looks = [[1, 0], [0, 0]];
        if (ha >= 7.4 && ha < 7.6) eyes = ['shut', 'shut'];
      }
    }
    st.put(FROG, 0, lens(eyes[0], looks[0])).put(FROG + 2, 0, lens(eyes[1], looks[1]));
    body(open).forEach((t, n) => st.put(FROG + n, 1, t));
    for (let y = MOUTH_Y; tongue && y >= tongue; y--) st.dot(TONGUE_X, y);
    for (const [x, y, level] of prey) glow(st, { x, y }, level);

    for (const f of lit) {
      const cell = (f.c.y >> 3) * 16 + Math.floor(f.c.x / 6);
      if (st.ink.has(cell)) continue;   // one to a cell
      const ink = new Map([...st.ink].map(([key, v]) => [key, [...v]]));
      glow(st, f.c, f.level);
      if (tilesNeeded(st) > 8) st.ink = ink;   // no slot: this one stays dark
    }
    st.draw();
  },
};
