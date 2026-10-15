// Game & Watch: STAR POND — an original Game & Watch, playing itself in
// TIME mode.
//
// A frog in round glasses sits on one of three lily pads with a butterfly
// net. A crescent moon in the corner puffs stars into the sky; they tumble
// down one of three lanes, zig-zagging through three fixed places, and the
// frog hops pad to pad to net them. Now and then one gets away: it splashes
// into the pond, a whiskered catfish surfaces and gulps it, the frog's mouth
// drops open, and a catfish head joins MISS in the score area. Caught stars
// go in the jar on the bank, a layer every ten minutes.
//
// It is built the way the real machines were: every pose of every
// character is a fixed pre-drawn picture at a fixed place (the frog has a
// sitting, a joyful, a dismayed and two mid-air poses per pad or gap, the
// net a resting and a raised one, each star three places per lane), and
// everything moves by switching poses on a half-second tick, never by
// gliding. The unlit poses show as a faint dither, as an LCD's do; a pose
// that switches fades over 60 ms. The background (pads, water, jar, reeds,
// the moon's outline) is printed: thin lines, plainly not LCD. The time is
// in leaning G&W segment digits with AM / PM, as the machines show it.
//
// The minute: each round is planned from its minuteKey and ends with the
// minute star, caught exactly on :00 in the lane the next round starts
// from; the digits change with the catch and the frog throws its arms up.
// The hour: the moon throws a comet instead, in two places across the sky
// and then down the middle lane; the frog nets it on :00, the full jar
// bursts three stars into the air and empties, the moon winks, and the
// misses are forgiven. The time is never wrong: digits only ever change at
// :00, on the catch.
//
// Everything comes from the clock: which tick of which minute it is, and
// noise() of the minuteKey. The frog's path is planned per round so it lands
// one tick before each star (one tick after, for the one that gets away).
//
// Burn-in: the whole LCD walks a six-step loop, a pixel at a time, every
// three minutes; from 23:00 to 07:00 the panel runs at low contrast.

import { dither, noise, clamp } from '../js/kit.js';

const ALL = false;            // development: light every segment (the ACL view)

// ------------------------------------------------------------ segment art
// Every pose is a fixed picture at a fixed place, as on the LCD. '#' is ink.

// The frog, front on, in round glasses: rim, white, pupil.
const FROG = `
  ...####........####...
  ..#....#......#....#..
  .#..##..######..##..#.
  .#..##..######..##..#.
  ###....########....###
  ######################
  ######################
  ##.################.##
  ###................###
  .####################.
  ..##################..
  ..###.##########.###..
  .###..##########..###.
  ###...##########...###
  ##....##########....##
  .###...########...###.
  ####...###..###...####
`;
// Arms up, eyes shut with joy, mouth wide: the minute is caught.
const FROG_YAY = `
  #..####........####..#
  #.#....#......#....#.#
  ##..##..######..##..##
  ##.#..#.######.#..#.##
  ###....########....###
  ######################
  .####################.
  .##.##############.##.
  .###..............###.
  ..##..............##..
  ..###............###..
  ...################...
  ...###.########.###...
  ...##..########..##...
  ..###...######...###..
  ..####..##..##..####..
`;
// Mouth an O, eyes on the water: a star got away.
const FROG_OOPS = `
  ...####........####...
  ..#....#......#....#..
  .#......######......#.
  .#..##..######..##..#.
  ###....########....###
  ######################
  ######################
  #########....#########
  #########....#########
  .####################.
  ..##################..
  ..###.##########.###..
  .###..##########..###.
  ###...##########...###
  ##....##########....##
  .###...########...###.
  ####...###..###...####
`;
// In the air between two pads, legs out.
const FROG_HOP = `
  ...####........####...
  ..#....#......#....#..
  .#..##..######..##..#.
  .#..##..######..##..#.
  ###....########....###
  ######################
  ######################
  ##.################.##
  ###................###
  .####################.
  ..##################..
  .###.############.###.
  ##...############...##
  #.....##########.....#
  .......##....##.......
  ......##......##......
  .....##........##.....
`;
// The net: resting in the frog's right hand, and pushed up to catch.
const NET_LOW = `
  .#######.
  #.#.#.#.#
  .#.#.#.#.
  ..#.#.#..
  ...#.#...
  ....#....
  ....#....
  ....#....
  ....#....
  ....#....
  ....#....
  ....#....
  ....#....
  ....#....
  ....#....
  ....#....
`;
const NET_HIGH = `
  .#######.
  #.#.#.#.#
  .#.#.#.#.
  ..#.#.#..
  ...#.#...
  ....#....
  ....#....
  ....#....
  ....#....
  ....#....
  ....#....
  ....#....
  ....#....
  ....#....
  ....#....
  ....#....
  ....#....
  ....#....
  ....#....
  ....#....
  ....#....
  ....#....
`;
const STAR = `
  ...#...
  ...#...
  #######
  .#####.
  ..###..
  .##.##.
  .#...#.
`;
// The twinkle round the net when a star lands in it.
const TWINKLE = `
  #.....#.....#
  .#.........#.
  .............
  ##.........##
  .............
  .#.........#.
  #.....#.....#
`;
// A star that missed hits the water...
const SPLASH = `
  ..#..#..#..
  .#.#...#.#.
  #...#.#...#
  ...#####...
`;
// ...and the catfish comes up for it, whiskers and all, and gulps it down.
const CAT_UP = `
  #.......###......
  .#....#######....
  ..#.##########...
  ...###.########..
  #..############..
  .####......#####.
  ..##........####.
  #.###......#####.
  .#.############..
  ....#########....
  ......#####......
`;
const CAT_GULP = `
  ......###........
  ....#######......
  ...##.######..#..
  #..##########.##.
  .#############...
  ..####..#####....
  #.############...
  .#..#########....
  .....######......
`;
// The comet the moon throws on the hour, twice on its way to the middle lane.
const COMET = `
  ....#.......##
  ....#.....##..
  ...###..##....
  #########.....
  .#######...###
  ..#####.......
  ..##.##.......
  .##...##......
`;
// Stars bursting out of the full jar on the hour, three heights.
const BURST = `
  ..#..
  .###.
  #####
  .#.#.
`;
// What is in the jar: a layer of stars for every ten minutes.
const JAR_LEVEL = `
  .#.#.#.#.
  #.#.#.#.#
`;
// The score area: MISS, and a catfish head for each miss this hour.
const MISS_WORD = `
  #...#.#..##..##
  ##.##.#.#...#..
  #.#.#.#..#...#.
  #...#.#...#...#
  #...#.#.##..##.
`;
const MISS_FISH = `
  .###...#
  ##.###.#
  #######.
  .###..##
`;
const AM = `
  .#..#...#
  #.#.##.##
  ###.#.#.#
  #.#.#...#
  #.#.#...#
`;
const PM = `
  ##..#...#
  #.#.##.##
  ##..#.#.#
  #...#...#
  #...#...#
`;
// The moon's face, in three moods.
const MOON_EYE = `
  .##.
  ####
  .##.
`;
const MOON_WINK = `
  #..#
  .##.
`;
const MOON_SMILE = `
  #..#
  .##.
`;
const MOON_BLOW = `
  .#.
  #.#
  .#.
`;

// G&W digits: narrow, leaning, segments with clipped ends.
const DIGIT = `
  .aaaaa.
  f.aaa.b
  ff...bb
  ff...bb
  ff...bb
  f.....b
  .ggggg.
  .ggggg.
  e.....c
  ee...cc
  ee...cc
  ee...cc
  e.ddd.c
  .ddddd.
`;
const DIGIT_SEGS = {
  0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg',
  5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg',
};

// ------------------------------------------------------------ the LCD

/** Rows of a picture, indentation stripped. */
const rowsOf = (pic) => pic.split('\n').filter((l) => l.trim()).map((l) => l.replace(/^\s+/, ''));

/** A picture's pixels by label ('#' for a plain pose), leaned by k px per row. */
function cell(pic, x0, y0, k = 0) {
  const rows = rowsOf(pic), h = rows.length, out = {};
  rows.forEach((row, r) => {
    const sh = Math.round((h - 1 - r) * k);
    for (let c = 0; c < row.length; c++) {
      const ch = row[c];
      if (ch === '.' || ch === ' ') continue;
      (out[ch] ??= []).push([x0 + c + sh, y0 + r]);
    }
  });
  return out;
}

const SEGS = [], SEG = {};
function add(id, px) { SEG[id] = SEGS.length; SEGS.push({ id, px }); }
function pose(id, pic, x, y) { add(id, cell(pic, x, y)['#']); }

// Three lily pads; the lane each one's net reaches; the stars' three heights.
const PAD_X = [26, 59, 92], FROG_Y = 43;
const LX = PAD_X.map((x) => x + 21);
const STEP_Y = [13, 18, 24];
const ZIG = [-4, 3, -3];
for (let l = 0; l < 3; l++) {
  const x0 = PAD_X[l];
  for (let s = 0; s < 3; s++) pose(`star${l}${s}`, STAR, LX[l] - 3 + ZIG[s], STEP_Y[s]);
  pose(`frog${l}`, FROG, x0, FROG_Y);
  pose(`yay${l}`, FROG_YAY, x0, FROG_Y + 1);
  pose(`oops${l}`, FROG_OOPS, x0, FROG_Y);
  pose(`low${l}`, NET_LOW, x0 + 17, FROG_Y - 4);
  pose(`high${l}`, NET_HIGH, x0 + 17, FROG_Y - 10);
  pose(`twinkle${l}`, TWINKLE, LX[l] - 6, FROG_Y - 13);
  pose(`splash${l}`, SPLASH, x0 + 6, 56);
  pose(`catup${l}`, CAT_UP, x0 + 2, 48);
  pose(`catgulp${l}`, CAT_GULP, x0 + 3, 51);
}
for (let l = 0; l < 2; l++) {
  const x0 = (PAD_X[l] + PAD_X[l + 1]) / 2;
  pose(`hop${l}`, FROG_HOP, x0, FROG_Y - 7);
  pose(`hopnet${l}`, NET_LOW, x0 + 17, FROG_Y - 11);
}
pose('comet0', COMET, 92, 6);
pose('comet1', COMET, 78, 10);
for (let j = 0; j < 5; j++) pose(`jar${j}`, JAR_LEVEL, 6, 55 - 3 * j);
for (let j = 0; j < 3; j++) pose(`burst${j}`, BURST, [8, 13, 6][j], 33 - 6 * j);
pose('missword', MISS_WORD, 62, 1);
for (let j = 0; j < 3; j++) pose(`miss${j}`, MISS_FISH, 79 + 9 * j, 1);
pose('am', AM, 1, 1);
pose('pm', PM, 1, 8);
pose('eye', MOON_EYE, 120, 4);
pose('wink', MOON_WINK, 120, 5);
pose('smile', MOON_SMILE, 119, 10);
pose('blow', MOON_BLOW, 120, 10);

const DIG_X = [14, 24, 37, 47];
for (let i = 0; i < 4; i++) for (const [n, px] of Object.entries(cell(DIGIT, DIG_X[i], 0, 0.16))) add(`d${i}${n}`, px);
add('colon', [[34, 4], [35, 4], [34, 5], [35, 5], [33, 9], [34, 9], [33, 10], [34, 10]]);

export const _debug = { SEGS, SEG };

// ------------------------------------------------------------ print
// What a Game & Watch prints behind its LCD (the pond, the bank, the moon)
// is drawn here as dotted lines: lit, but plainly not part of the game.

function printDots(g, pts, ox, oy) {
  for (const [x, y] of pts) g.pixel(x + ox, y + oy);
}
const PRINT = (() => {
  const pts = [], P = (x, y) => pts.push([Math.round(x), Math.round(y)]);
  // lily pads, each with its notch
  for (const x0 of PAD_X) {
    const cx = x0 + 11, cy = 60.5;
    for (let a = 0; a < 360; a += 4) {
      const r = (a * Math.PI) / 180;
      if (a > 75 && a < 105) continue;
      P(cx + 13 * Math.sin(r), cy - 2.2 * Math.cos(r));
    }
  }
  // water: little wave dashes between and below
  for (let x = 0; x < 128; x += 7) { P(x, 62); P(x + 1, 62); P(x + 2, 61); }
  // the jar on the bank, and the bank
  for (let y = 40; y <= 58; y++) { P(4, y); P(16, y); }
  for (let x = 4; x <= 16; x++) P(x, 59);
  for (let x = 3; x <= 17; x++) P(x, 38);
  P(5, 39); P(15, 39);
  // reeds on the right bank
  for (let y = 36; y <= 60; y++) { P(124 + (y < 44 ? 1 : 0), y); P(127, y + 3); }
  // the crescent moon: the edge of (inside one disc, outside another)
  const inMoon = (x, y) => Math.hypot(x - 117, y - 7.5) <= 9.5 && Math.hypot(x - 111, y - 4) > 8.5;
  for (let y = 0; y < 20; y++)
    for (let x = 100; x < 128; x++) {
      const c = x + 0.5, d = y + 0.5;
      if (inMoon(c, d) && !(inMoon(c - 1, d) && inMoon(c + 1, d) && inMoon(c, d - 1) && inMoon(c, d + 1))) P(x, y);
    }
  // dedupe
  const seen = new Set();
  return pts.filter(([x, y]) => { const k = x * 64 + y; if (seen.has(k)) return false; seen.add(k); return true; });
})();

// ------------------------------------------------------------ the game
// One tick is half a second, as a Game & Watch beeps along. Each minute is
// a round planned from its minuteKey: when stars fall and down which lane,
// which one gets away; the frog plays it out hopping just in time. The
// round ends on the minute star, caught exactly on :00 in the lane the next
// round starts from, so rounds join up.

const TICK = 0.5, TICKS = 120;
const hourStart = (key) => new Date(key * 60000).getMinutes() === 0;
/** The lane of the star caught at the start of minute `key`. */
const startLane = (key) => (hourStart(key) ? 1 : Math.floor(noise(key, 1) * 3));

const planCache = new Map();
function plan(key) {
  if (planCache.has(key)) return planCache.get(key);
  const stars = [];
  let a = 10 + Math.floor(noise(key, 2) * 4), lane = startLane(key), missed = false;
  // About one round in thirty, a star gets away (never the minute's).
  const wantMiss = noise(key, 61) < 0.035, missAt = Math.floor(noise(key, 62) * 8);
  for (let i = 0; a <= 108; i++) {
    let l = Math.floor(noise(key, 30 + i) * 3);
    const miss = !missed && l !== lane && wantMiss && i >= missAt;
    if (miss) missed = true;
    stars.push({ lane: l, a, miss });
    lane = l;
    a += 5 + Math.floor(noise(key, 10 + i) * 5);
  }
  const next = startLane(key + 1);
  stars.push({ lane: next, a: TICKS, miss: false, minute: true, comet: hourStart(key + 1) });
  // The frog: where it is at every tick of the round.
  const at = new Int8Array(TICKS + 1).fill(-1);    // pad, or -1-hop index while in the air
  let p = startLane(key), t = 0;
  for (const st of stars) {
    const land = st.miss ? st.a + 1 : st.a - 1, dist = Math.abs(st.lane - p), dir = Math.sign(st.lane - p);
    const depart = land - 2 * dist + 1;
    for (; t < depart && t <= TICKS; t++) at[t] = p;
    for (let j = 0; j < dist; j++) {
      if (t <= TICKS) at[t++] = -1 - Math.min(p, p + dir);           // hop over the gap
      p += dir;
      if (t <= TICKS) at[t++] = p;
    }
  }
  for (; t <= TICKS; t++) at[t] = p;
  const r = { stars, at };
  planCache.set(key, r);
  if (planCache.size > 8) planCache.delete(planCache.keys().next().value);
  return r;
}

/** Misses so far this hour, up to tick k of minute `key`. */
function missCount(key, k) {
  const h0 = key - new Date(key * 60000).getMinutes();
  let n = 0;
  for (let q = h0; q <= key; q++)
    for (const st of plan(q).stars) if (st.miss && (q < key || st.a + 1 <= k)) n++;
  return n;
}

/** Which segments are lit at tick k of minute `key` (fields f describe that minute). */
function displayState(key, k, f) {
  const on = new Uint8Array(SEGS.length);
  const lite = (id) => { const i = SEG[id]; if (i !== undefined) on[i] = 1; };
  const { stars, at } = plan(key);
  const prev = plan(key - 1).stars.at(-1);          // the star caught on :00
  // stars falling, caught, missed
  const all = [{ ...prev, a: 0 }, ...stars];
  let net = 'low', mood = 'frog';
  for (const st of all) {
    const d = st.a - k;
    if (st.comet) {
      if (d === 4) lite('comet0');
      if (d === 3) lite('comet1');
      if (d === 2 || d === 1) lite(`star${st.lane}${3 - d}`);
    } else if (d >= 1 && d <= 3) lite(`star${st.lane}${3 - d}`);
    if (!st.miss) {
      if (d === 1 || d === 0) net = 'high';
      if (d === 0) lite(`twinkle${st.lane}`);
      if (st.minute || st === all[0]) { if (d >= -4 && d <= -1) mood = 'yay'; }
    } else {
      if (d === 0) lite(`splash${st.lane}`);
      if (d === -1 || d === -2) lite(`catup${st.lane}`);
      if (d === -3) lite(`catgulp${st.lane}`);
      if (d === -4) lite(`splash${st.lane}`);
      if (d <= -1 && d >= -5) mood = 'oops';
    }
    if (st.miss || st.minute || st === all[0]) {
      // the moon puffs as it lets a star go
      if (d === 4 || d === 3) lite('blow');
    } else if (d === 3) lite('blow');
  }
  const pos = at[k];
  if (pos >= 0) {
    lite(`${mood}${pos}`);
    lite(`${net}${pos}`);
  } else {
    lite(`hop${-1 - pos}`); lite(`hopnet${-1 - pos}`);
  }
  // the moon: an eye that blinks now and then, a wink and a grin on the hour
  const hour = f.m === 0 && k < 12;
  if (hour || (noise(key, 200 + k) < 0.04)) lite('wink'); else lite('eye');
  if (!on[SEG.blow]) lite('smile');
  // the jar fills a layer every ten minutes, and bursts on the hour
  const level = f.m === 0 && k < 4 ? 5 : Math.floor(f.m / 10);
  for (let j = 0; j < level; j++) lite(`jar${j}`);
  if (f.m === 0 && k >= 1 && k <= 3) lite(`burst${k - 1}`);
  // score area: the time, AM/PM, the misses this hour
  const n = Math.min(3, missCount(key, k));
  if (n) lite('missword');
  for (let j = 0; j < n; j++) lite(`miss${j}`);
  lite(f.pm ? 'pm' : 'am');
  const h = f.h12;
  const digits = [h >= 10 ? 1 : null, h % 10, Math.floor(f.m / 10), f.m % 10];
  digits.forEach((d, i) => { if (d !== null) for (const n2 of DIGIT_SEGS[d]) lite(`d${i}${n2}`); });
  lite('colon');
  return on;
}

// ------------------------------------------------------------ design

const DAY = 255, NIGHT = 40;
const GHOST = 0.1;
const FADE = 0.06;            // the LCD's response, seconds
const WALK = [[0, 0], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];
function walk(date) {
  const k = Math.floor((date.getTime() - 30000) / 180000);
  return WALK[((k % WALK.length) + WALK.length) % WALK.length];
}

export default {
  name: 'Game & Watch',
  blurb: 'Star Pond, an original Game & Watch: a frog in glasses nets falling stars on fixed LCD poses with ghost segments; the minute star lands on :00, a comet on the hour.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,

  frame(g, ctx) {
    const { date, oled, kit } = ctx;
    const f = ctx.fields;
    oled.contrast(DAY + (NIGHT - DAY) * ctx.night);
    const [ox, oy] = walk(date);
    const key = f.minuteKey, k = Math.floor(f.sec / TICK);
    const now = displayState(key, k, f);
    const pk = k > 0 ? key : key - 1, pt = k > 0 ? k - 1 : TICKS - 1;
    const before = displayState(pk, pt, k > 0 ? f : kit.previousMinute(date));
    const u = clamp((f.sec - k * TICK) / FADE, 0, 1);
    printDots(g, PRINT, ox, oy);
    for (let i = 0; i < SEGS.length; i++) {
      let v = now[i] ? (before[i] ? 1 : u) : (before[i] ? 1 - u : 0);
      if (ALL) v = 1;
      v = GHOST + (1 - GHOST) * v;
      for (const [x, y] of SEGS[i].px) if (dither(x - ox, y - oy, v)) g.pixel(x + ox, y + oy);
    }
  },
};
