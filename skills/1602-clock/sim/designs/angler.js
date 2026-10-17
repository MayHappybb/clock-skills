// Angler — fishing off a pier for the time.
//
// The bottom row is under the water. The time is two fish holding station
// there, nose to the current, tails fluttering: a big one carrying the hour
// on its flank and a smaller one carrying the minutes. The fishing line comes
// down between them, bobber on the surface and hook below it, so the line is
// the colon. On the pier above, an angler sits on the end with his legs over the
// edge and his rod out, his catch crate behind him; gulls cross the sky by day, stars
// twinkle by night, and bubbles rise in the open water to the right.
//
// The minute fish noses at the hook through the last seconds of the minute
// while the bobber twitches and the angler leans in. Four seconds before the
// minute it bites: the bobber goes under, he strikes, it fights, and he lifts
// it into the air, flapping on the line. Then he either tosses it over his
// shoulder into the crate (plop, a tail flips out) or, on odd minutes, flings
// it back far out across the sky; either way it is gone as the minute turns.
// He recasts, and the new minute fish swims in from the open water.
//
// On the hour something huge comes instead: a pike as long as five cells,
// solid black, glides in from the right and swallows the whole time, minute
// fish, hook and hour fish, a mouthful at a time, and the line yanks the
// angler off the pier into the water. The new time swims in behind it as
// a school, the hour fish leading, and a few seconds later the angler comes
// back across the surface water-skiing on his boots, crashes onto the pier
// and sits there dripping before he recasts.
//
// Every fish in the old time leaves before any of the new time arrives, so
// the glass shows the old time, a gap, or the new time, never a mix.
//
// Tiles: the four digit bodies first (a digit shown twice shares a tile),
// then the shared fish head and tail, the angler, and the line/bobber cell.
// That is eight at rest. In every transition something gives its slot up
// before something else needs one: the bobber leaves when the fish is lifted
// (its hooked head takes the cell), the old fish's bodies leave before the
// new ones arrive, and during the hour the line is ROM. Rod, hook, crate,
// gulls, stars, bubbles, splashes and the pike's body are ROM.

import { TileAllocator } from '../js/kit.js';

const STEP = 0.2;                       // one cell of swimming, flying, skiing
const HOUR_COL = 2, HOOK = 6, MIN_COL = 7;
const MAN_COL = HOOK - 2, CRATE_COL = HOOK - 3, ROD_COL = HOOK - 1;
const ROD = 0x2f, HOOK_J = 0xc9, CRATE = 0xdb, LINE = 0x7c, BLOCK = 0xff;
const BUBBLE_LO = 0xa1, BUBBLE_HI = 0xdf, STAR = [0x2e, 0x2b, 0x2a], GULL = [0x76, 0x5e];

// The digits are markings cut out of the fish's flank: 3x6 holes in a solid
// 5x8 body cell, so the body reads as one fish across the cell seam and the
// numerals stay open and legible at arm's length.
const NEG = {
  0: ['###', '#.#', '#.#', '#.#', '#.#', '###'],
  1: ['.#.', '##.', '.#.', '.#.', '.#.', '###'],
  2: ['###', '..#', '###', '#..', '#..', '###'],
  3: ['###', '..#', '###', '..#', '..#', '###'],
  4: ['#.#', '#.#', '###', '..#', '..#', '..#'],
  5: ['###', '#..', '###', '..#', '..#', '###'],
  6: ['###', '#..', '###', '#.#', '#.#', '###'],
  7: ['###', '..#', '..#', '.#.', '.#.', '.#.'],
  8: ['###', '#.#', '###', '#.#', '#.#', '###'],
  9: ['###', '#.#', '###', '..#', '..#', '###'],
};
const D = Object.fromEntries(Object.entries(NEG).map(([d, rows]) => [d,
  ['#####', ...rows.map((r) => '#' + [...r].map((c) => (c === '#' ? '.' : '#')).join('') + '#'), '#####']]));
const body = (d) => D[d];

// Fish face left: head, body, body, tail.
const HEAD = {
  shut: ['...##', '.####', '#####', '#.###', '#####', '#####', '.####', '...##'],
  gulp: ['...##', '.####', '#####', '#.###', '..###', '#####', '.####', '...##'],
};
const TAIL = {
  a: ['#....', '##..#', '###.#', '.####', '.####', '###.#', '##..#', '#....'],
  b: ['.....', '#...#', '##..#', '#####', '#####', '##..#', '#...#', '.....'],
};
const FLAP = 0x3c;                      // ROM '<': a tail curled mid-flap
// The head of a fish hanging from the line, which comes down from the rod tip.
const HOOKED = ['..#..', '..###', '.####', '#.###', '..###', '#####', '.####', '...##'];

// The pike: a toothy head on three solid ROM blocks and the shared tail.
const PIKE = {
  shut: ['...##', '.####', '##.##', '#####', '#####', '.####', '..###', '....#'],
  open: ['...##', '.####', '##.##', '..###', '.#.##', '#.###', '.####', '...##'],
};

// The rod tip, the line and the bobber, over the hook. The ROM '/' rod in
// the next cell to the left ends on row 1.
const TIP = {
  ride:  ['###..', '...#.', '...#.', '...#.', '...#.', '..###', '..###', '.#...'],
  low:   ['###..', '...#.', '...#.', '...#.', '...#.', '...#.', '..###', '#####'],
  under: ['###..', '...#.', '...#.', '...#.', '...#.', '...#.', '...#.', '##.##'],
  plop:  ['###..', '...#.', '#.#.#', '...#.', '.#.#.', '..###', '..###', '#...#'],
};

// The angler, facing right, sitting on the end of the pier with his legs
// over the edge. Hands at row 4, x4, where the ROM rod starts.
const MAN = {
  sit:    ['.###.', '#####', '..##.', '.###.', '.####', '.##..', '.####', '...#.'],
  look:   ['..###', '.####', '...##', '.###.', '.####', '.##..', '.####', '...#.'],
  doze:   ['.....', '.###.', '#####', '.###.', '.####', '.##..', '.####', '...#.'],
  alert:  ['..###', '.####', '...##', '..###', '..###', '.##..', '.####', '....#'],
  strike: ['.###.', '#####', '..###', '.##.#', '.##..', '.##..', '####.', '#....'],
  reel:   ['.###.', '#####', '..##.', '.####', '.##.#', '.##..', '.####', '...#.'],
  lift:   ['.###.', '#####', '..###', '.##.#', '.##..', '.##..', '####.', '#....'],
  throw:  ['#.###', '.####', '..##.', '.###.', '.##..', '.##..', '.####', '...#.'],
  cast:   ['.###.', '#####', '..##.', '.####', '.##..', '.##..', '.####', '...#.'],
  yank:   ['...##', '..###', '...##', '..###', '.####', '.##.#', '#....', '.....'],
  fly:    ['.....', '.##..', '#####', '..###', '#####', '.#...', '.....', '.....'],
  ski:    ['.###.', '#####', '..##.', '.###.', '.##.#', '.##..', '.#.#.', '#####'],
  wet:    ['##...', '####.', '..##.', '.###.', '.####', '.##..', '.####', '#..#.'],
  wet2:   ['.###.', '#####', '#.##.', '.###.', '.####', '.##..', '.####', '...##'],
};
const SPLASH_CRATE = ['.#.#.', '#...#', '#####', '#...#', '#...#', '#...#', '#####', '.....'];
const TAIL_CRATE = ['..#.#', '...#.', '#####', '#...#', '#...#', '#...#', '#####', '.....'];


const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

// --------------------------------------------------------------- the plan

/**
 * Everything on the glass at time T (seconds since midnight): a 2x16 grid
 * of ROM codes or { tile, prio }. `at(b)` gives clock fields at second b.
 */
function scene(T, at) {
  const B = Math.floor(T / 60) * 60;
  const b = T - B < 30 ? B : B + 60;               // the turn that matters now
  const s = T - b;                                  // < 0: before it
  const was = at(b - 60), now = at(b);
  const hour = now.mm === '00';
  const shown = s < 0 ? was : now;                  // what is true right now
  const night = shown.h < 6 || shown.h >= 20;

  const g = [Array(16).fill(0x20), Array(16).fill(0x20)];
  const put = (c, r, what, prio = 5) => {
    if (c >= 0 && c < 16 && r >= 0 && r < 2) g[r][c] = typeof what === 'number' ? what : { tile: what, prio };
  };
  const tail = TAIL[Math.floor(T / 0.5) % 2 ? 'a' : 'b'];
  const head = HEAD[(T % 3.1) < 0.45 ? 'gulp' : 'shut'];

  // ---- sky
  if (night) {
    for (let c = HOOK + 1; c < 16; c++) {
      if (Math.abs(c - 13) < 2 || hash(c * 1.37 + 0.5) > 0.6) continue;
      const tw = Math.floor(T / 0.9 + hash(c * 7) * 9) % 5;
      put(c, 0, STAR[tw === 0 ? 2 : tw === 1 ? 1 : 0]);
    }
    put(13, 0, 0x29);                               // a crescent moon
  } else {
    put(14, 0, BUBBLE_HI);                          // a small sun, high up
    const lap = 22, k = Math.floor(T / lap), p = (T % lap) / lap;
    const c = Math.round(16 - p * 13);              // a gull drifting left
    if (hash(k) < 0.7 && c > HOOK && c < 16 && c !== 14) put(c, 0, GULL[Math.floor(T / 0.7) % 2]);
  }

  // ---- open water: a bubble every few seconds
  for (let k = Math.floor(T / 2.3) - 1; k <= Math.floor(T / 2.3); k++) {
    const age = T - k * 2.3, c = MIN_COL + 4 + Math.floor(hash(k * 3.3) * (12 - MIN_COL));
    if (age >= 0 && age < 0.8) put(c, 1, BUBBLE_LO);
    else if (age >= 0.8 && age < 1.6) put(c, 1, BUBBLE_HI);
  }

  // ---- defaults: the angler idling, rod out, bobber riding
  put(CRATE_COL, 0, CRATE);
  for (let c = 0; c < CRATE_COL; c++) put(c, 0, 0x5f);   // the pier deck
  let man = night ? 'doze' : 'sit';
  if (!night && T % 7 < 1.4 && hash(Math.floor(T / 7)) < 0.5) man = 'look';
  if (night && T % 11 < 1.2) man = 'sit';           // stirs now and then
  let manCol = MAN_COL, rod = true, hook = true, lineRom = false, pike = null;
  let tip = TIP[Math.floor(T / 0.8) % 2 ? 'ride' : 'low'];
  const minFish = { digits: shown.mm, col: MIN_COL, row: 1, show: true, o: {} };
  const hourFish = { digits: shown.hh, col: HOUR_COL, row: 1, show: true, o: {} };

  if (!hour) {
    // ---------------------------------------------------- an ordinary minute
    const toss = now.m % 2 === 0;                  // even: into the crate; odd: flung back
    for (const n of [-11, -7.5, -5]) {            // nosing at the bait
      if (s >= n - 1 && s < n + 1) man = 'alert';
      if (s >= n && s < n + 0.4) { minFish.col = HOOK; tip = TIP.low; }
    }
    if (s >= -3.8 && s < -2.2) {                  // the bite, the strike, the fight
      minFish.col = HOOK; tip = TIP.under;
      man = s < -3.4 ? 'alert' : Math.floor((s + 3.4) / 0.2) % 2 ? 'reel' : 'strike';
      minFish.o.flap = s >= -3.0 && Math.floor(s / 0.2) % 2 === 0;
    }
    if (s >= -2.2 && s < -1.0) {                  // lifted, flapping on the line
      Object.assign(minFish, { row: 0, col: HOOK });
      minFish.o = { head: HOOKED, flap: Math.floor(s / 0.2) % 2 === 1 };
      tip = null; hook = false; man = 'lift';
    }
    // gone before the minute turns: over his shoulder, or flung back
    if (s >= -1.0 && s < 0.2) {
      minFish.show = false; tip = null; hook = false;
      man = s < -0.6 ? 'throw' : 'cast';
      if (toss) {
        if (s < -0.8) put(ROD_COL, 0, 0x27);       // whoosh, over his shoulder
        if (s >= -0.6) put(CRATE_COL, 0, Math.floor((s + 0.6) / 0.2) % 2 ? TAIL_CRATE : SPLASH_CRATE, 6);
      } else {
        const k = Math.floor((s + 1.0) / STEP), c = HOOK + 1 + 2 * k;   // two cells a step
        if (c < 16) {
          Object.assign(minFish, { show: true, row: 0, col: c });
          minFish.o = { flap: k % 2 === 0 };
        }
      }
    }
    if (!toss && s >= 0 && s < 0.6) { put(15, 0, s < 0.3 ? 0x2a : 0xde); put(14, 0, 0x2e); }   // splash, far out
    if (s >= 0.2 && s < 0.6) tip = TIP.plop;      // recast
    if (s >= 0) {                                  // the new fish swims in from the open water
      const c = Math.max(MIN_COL, 16 - Math.floor(s / STEP));
      Object.assign(minFish, { show: c < 16, digits: now.mm, row: 1, col: c });
      minFish.o = {};
    }
  } else {
    // ------------------------------------------------------------ the hour
    const t0 = -3.15;                               // the pike's head reaches column 15
    for (const n of [-14, -11]) {
      if (s >= n - 1 && s < n + 1) man = 'alert';
      if (s >= n && s < n + 0.4) { minFish.col = HOOK; tip = TIP.low; }
    }
    if (s >= -8 && s < 0.2) {                      // something big has the bait
      lineRom = true; tip = null;
      man = s >= t0 + (15 - HOOK) * STEP ? 'yank' : Math.floor(s / 0.6) % 2 ? 'alert' : 'reel';
      hourFish.o.tail = minFish.o.tail = TAIL.a;    // frozen with fright
      for (const [c, a] of [[15, -7.6], [13, -6.4], [14, -5.2]]) {
        if (s >= a && s < a + 0.6) put(c, 1, BUBBLE_LO);
        else if (s >= a + 0.6 && s < a + 1.2) put(c, 1, BUBBLE_HI);
      }
    }
    if (s >= t0) {
      const ph = 15 - Math.floor((s - t0) / STEP);
      if (ph <= MIN_COL + 2) minFish.show = false;  // swallowed
      if (ph <= HOUR_COL + 2) hourFish.show = false;
      if (ph <= HOOK) hook = false;
      if (ph + 4 >= 0) pike = ph;
    }
    if (s >= 0.2 && s < 0.4) { man = 'fly'; manCol = ROD_COL; rod = false; lineRom = false; }
    if (s >= 0.4 && s < 5.8) { man = 'seat'; rod = false; }
    if (s >= 0.4 && s < 1.0) { put(ROD_COL, 0, s < 0.7 ? 0x2a : 0xde); put(HOOK, 0, s < 0.7 ? 0xde : 0x2e); }
    if (s >= 0) {                                    // the new time, a school behind the pike
      const c = Math.max(HOUR_COL, 16 - Math.floor(s / STEP));
      Object.assign(hourFish, { show: true, digits: now.hh, col: c, row: 1, o: {} });
      Object.assign(minFish, { show: true, digits: now.mm, col: c + MIN_COL - HOUR_COL, row: 1, o: {} });
    }
    const ski0 = 3.4;                               // back across the water, skiing on his boots
    if (s >= ski0 && s < 5.8) {
      const c = Math.max(ROD_COL, 15 - Math.floor((s - ski0) / STEP));
      put(c, 0, MAN.ski, 4);
      put(c + 1, 0, Math.floor(s / 0.2) % 2 ? 0x2c : 0xde);
      put(c + 2, 0, 0x2e);
    }
    if (s >= 5.8 && s < 6.4) { man = 'yank'; rod = false; if (s < 6.1) put(ROD_COL, 0, 0x2a); }
    if (s >= 6.4 && s < 14) man = Math.floor(s / 0.6) % 2 ? 'wet' : 'wet2';
    if (s >= 0 && s < 7.0) { tip = null; hook = false; }
    if (s >= 6.4 && s < 7.0) man = 'cast';
    if (s >= 7.0 && s < 7.4) tip = TIP.plop;
  }

  // ---- compose: fish, the pike over them, then the tackle in what is left
  const fish = (f) => {
    if (!f.show) return;
    const { col: c, row: r, digits, o } = f;
    put(c, r, o.head ?? head, 2);
    // half on the glass, a fish is a dark shape: its markings show once both
    // are in view, so an edge never shows one digit of a time on its own
    const whole = c >= 0 && c + 2 <= 15;
    put(c + 1, r, whole ? body(+digits[0]) : BLOCK, 1);
    put(c + 2, r, whole ? body(+digits[1]) : BLOCK, 1);
    put(c + 3, r, o.flap ? FLAP : (o.tail ?? tail), 3);
  };
  fish(hourFish); fish(minFish);
  if (pike !== null) {
    put(pike, 1, PIKE[Math.floor(T / 0.4) % 2 ? 'open' : 'shut'], 2);
    for (let i = 1; i <= 3; i++) put(pike + i, 1, BLOCK);
    put(pike + 4, 1, TAIL.a, 3);
  }
  const free = (c, r) => g[r][c] === 0x20;
  if (hook && free(HOOK, 1)) put(HOOK, 1, HOOK_J);
  if (rod && free(ROD_COL, 0)) put(ROD_COL, 0, ROD);
  if (tip && free(HOOK, 0)) put(HOOK, 0, tip, 5);
  if (lineRom && free(HOOK, 0)) put(HOOK, 0, LINE);
  if (man !== 'seat') put(manCol, 0, MAN[man], 4);
  return g;
}

export default {
  name: 'Angler',
  blurb: 'The time is two fish under a pier, the line between them the colon: each minute the angler lands the minute fish and a new one swims in; on the hour a pike eats the lot.',
  bus: 'i2c100',
  panel: 'green',
  fps: 10,

  frame(lcd, api, { date, kit }) {
    const midnight = new Date(date); midnight.setHours(0, 0, 0, 0);
    const day0 = midnight.getTime();
    const T = (date.getTime() - day0) / 1000;
    const at = (b) => kit.clockFields(new Date(day0 + b * 1000));
    const g = scene(T, at);

    // Allocate by priority: digits, head, tail, angler, tip, the rest.
    const alloc = new TileAllocator(lcd, 0);
    const cells = [];
    g.forEach((row, r) => row.forEach((what, c) => { if (typeof what === 'object') cells.push({ c, r, what }); }));
    cells.sort((a, b) => a.what.prio - b.what.prio);
    const code = new Map();
    for (const { c, r, what } of cells) code.set(r * 16 + c, alloc.add(what.tile));
    alloc.flush();
    for (let r = 0; r < 2; r++) {
      lcd.setCursor(0, r);
      for (let c = 0; c < 16; c++) {
        const what = g[r][c];
        lcd.data(typeof what === 'number' ? what : code.get(r * 16 + c) ?? 0x20);
      }
    }
  },
};
// For out/angler-sweep.mjs, the dense turn/hour sweep.
export { scene, D, HOUR_COL, MIN_COL };
