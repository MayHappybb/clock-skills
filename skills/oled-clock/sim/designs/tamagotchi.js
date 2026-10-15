// Tamagotchi — a virtual pet that lives by the clock.
//
// A homage to Bandai's 1996 egg (the P1): the eight menu icons in a row
// above and below the dot-matrix screen (food, light, game, medicine;
// bathroom, meter, discipline, attention), the active one lit and the rest
// a faint half-tone, the way unlit LCD segments are half visible. The screen
// is a dot matrix of 42x14 "LCD dots", each a 2x2 block on a 3 px pitch, so
// everything on it, the pet, its food, the time, has the P1's chunky dots.
//
// The pet is Mochitchi, a round rice-cake creature with a seedling on its
// head that shows its mood: two leaves when content, a flower when happy, a
// closed bud asleep, wilted when sick. It lives the day on the real clock:
// wakes at 07:00, breakfast at 07:30, a snack mid-morning, lunch, a nap
// after lunch, snacks, dinner at 18:30; it poops some time after meals and a
// duck-shaped flush (the P1's own wave) cleans up ten minutes later; some
// days it falls ill for half an hour and gets a jab; in the evening it
// misbehaves once and is told off; at night (ctx.night) the light goes out
// and it sleeps under drifting Z's. Each event selects its icon, and the
// attention icon lights while it is calling (hungry, a mess, ill).
//
// Every minute it does a little something as the minute turns (a hop, a
// look round, a blink, a wiggle of its leaves). Every hour it calls, then
// celebrates with the P1's sparkles, its seedling in flower; three times a
// day the hour is a round of the P1's left-or-right game instead.
//
// The time is always on the screen, in a dot font drawn for it (5x9 dots,
// rounded like the pet), with a colon that blinks on the second.
//
// Item sprites are the P1 ROM's own tiles (from agg23's disassembly): the
// meal and snack in three bites, the poop with its two stink frames, the
// flush wave, the skull, the sparkles, the hearts, the game arrows and the
// Z's. The icons are pixelised from the P1 icon artwork (TamaTool's scan);
// the P1 has no syringe sprite, so the jab is drawn from the medicine icon.
//
// Everything is a pure function of the clock: the day's schedule is fixed,
// with a few minutes' jitter, and the illness, from noise seeded by the date;
// within a minute, the pet's wandering is a walk replayed from the minute's
// start.
//
// Burn-in: the whole face walks a 1 px orbit; the eight icons are
// half-tone except when selected; the pet never stops moving.

import { noise, orbit, clamp } from '../js/kit.js';

/** A picture: rows of '#' and '.', as {w, h, at(x, y)}. */
function pic(s) {
  const rows = s.split('\n').map((l) => l.trim()).filter(Boolean);
  const w = Math.max(...rows.map((r) => r.length));
  return { w, h: rows.length, at: (x, y) => x >= 0 && y >= 0 && y < rows.length && rows[y][x] === '#' };
}
// ------------------------------------------------------------ the icons
// Pixelised from the P1 artwork, 9 px tall. Top: food, light, game,
// medicine. Bottom: bathroom, meter, discipline, attention.
const ICONS = [`
  #.#.#..##.
  #.#.#.###.
  #.#.#.###.
  #####.###.
  .###..###.
  ..#....##.
  ..#....##.
  .###...##.
  .###...##.
`, `
  .#...#...#.
  ....###....
  #..#...#..#
  ..#.#.#.#..
  ..#..#..#..
  #..#...#..#
  ....###....
  ....###....
  .....#.....
`, `
  .###.......
  #.#.#...###
  #.#.#..####
  .###..####.
  .....####..
  ....####...
  ..####.....
  .###.......
  .##........
`, `
  ........#..
  .........#.
  .......###.
  ......####.
  .....####..
  ....####...
  ..#.##.....
  .#.#.......
  #..........
`, `
  ..###.......
  .#...#......
  #..#.#......
  ##...#..###.
  .#...####..#
  .#.........#
  .#........#.
  ..#......#..
  ...######...
`, `
  .##########.
  #..........#
  #.#..#..#..#
  #....#.....#
  #.....#....#
  #....###...#
  .#........#.
  .#........#.
  ..########..
`, `
  ..###.....#.
  .#####..#.#.
  #####..#.#..
  ####...#.#..
  ###...#.#...
  ####...#.#..
  #####..#....
  .#####......
  ..###.......
`, `
  ..###...###..
  .#...#.#...#.
  #.#.#.#.....#
  #.....#.#.#.#
  #.#.#.#.....#
  #..#..#.###.#
  .#...#.#.#.#.
  ..###...###..
`].map(pic);
const FOOD = 0, LIGHT = 1, GAME = 2, MEDICINE = 3, BATH = 4, METER = 5, DISCIPLINE = 6, ATTENTION = 7;
// ------------------------------------------------------------ P1 ROM tiles
// 8x8 dots each (sparkles 16x8), from the ROM's graphics pages.
const rom = (rows) => pic(rows.split(' ').join('\n'));
const TILE = {
  meal: ['........ .######. #....#.# #....#.# .#..#.#. .#..#.#. .#..#.#. .######.',   // 0x1680
    '........ .#...... #.#..... #..####. .#..#.#. .#..#.#. .#..#.#. .######.',          // 0x1688
    '........ ........ ........ ........ .##..... .#.####. .#..#.#. .######.'].map(rom), // 0x1690
  snack: ['..#..... .##..... ######.. ..#.##.. ..##.#.. ..###### .....##. .....#..',  // 0x16A0
    '........ ........ .....#.. ..#.##.. ..##.#.. ..###### .....##. .....#..',          // 0x16A8
    '........ ........ ........ ........ ...#.#.. ..###### .....##. .....#..'].map(rom), // 0x16B0
  poop: ['#....... .#....#. #......# ...#..#. ...##... ..##.#.. .#.####. .######.',   // 0x16F0
    '.......# .#....#. #......# .#.#.... ...##... ..##.#.. .####.#. .######.'].map(rom), // 0x16F8
  skull: rom('........ ..#####. .####### .#..#..# .####### .###.### ..#####. ..#.#.#.'),  // 0x1710
  spark: rom('...#.... .#....#. ...##... #.#..#.. ..#..#.# ...##... .#....#. ....#...'),  // 0x1718
  ticks: rom('....##.. ....#### ...##### ...####. .....##. ........ .#...... ........'),  // 0x1720
  heart: rom('........ .##.##.. #.#####. #.#####. #######. .#####.. ..###... ...#....'),  // 0x16E0
  hollow: rom('........ .##.##.. #..#..#. #.....#. #.....#. .#...#.. ..#.#... ...#....'), // 0x16E8
  left: rom('........ ....#... ...##... ..#####. .######. ..#####. ...##... ....#...'),   // 0x1730
  right: rom('........ ...#.... ...##... .#####.. .######. .#####.. ...##... ...#....'),  // 0x1738
  bigZ: rom('........ ........ .####... ....#... ...#.... ..#..... .#...... .####...'),   // 0x17D0
  smallZ: rom('....###. ......#. .....#.. ....#... ..#.###. #....... ........ ........'), // 0x17D8
  sparkles: ['#.....#......... .#.#.#.......... ...#.......#.... .##.##....#.#... ...#.......#.... .#.#.#.......... #.....#......... ................',
    '................ .........#...#.. ...........#.... ..........#.#... ...#.......#.... ..#.#....#...#.. ...#............ ................'].map(rom), // 0x14C0, 0x14D0
};
// The game's guess: the small 3x5 arrow of the P1 clock's seconds bar (0x1550).
const ARROW = rom('#.. ##. ### ##. #..');
// The flush: a zigzag column the ROM scrolls across the screen (0xD94),
// four rows repeated down the screen.
const WAVE = ['..##.#..', '.##.#...', '##.#....', '.##.#...'];
// The jab: no syringe in the ROM, so the medicine icon's syringe, in dots.
const SYRINGE = pic(`
  ......#
  .....#.
  ....##.
  ...###.
  ..###..
  .###...
  #......
`);
// ------------------------------------------------------------ the time
// 4x9 dots, drawn for this face after the P1's own 4x7 clock digits (the
// flagged 1, the open 4, the hooked 7), stretched to nine rows and rounded.
const DIGITS = [
  ".##. #..# #..# #..# #..# #..# #..# #..# .##.",
  "..#. .##. #.#. ..#. ..#. ..#. ..#. ..#. .###",
  ".##. #..# ...# ...# ..#. .#.. #... #... ####",
  ".##. #..# ...# ...# .##. ...# ...# #..# .##.",
  "..#. .##. #.#. #.#. #.#. #### ..#. ..#. ..#.",
  "#### #... #... ###. ...# ...# ...# #..# .##.",
  ".##. #... #... ###. #..# #..# #..# #..# .##.",
  "#### #..# ...# ...# ..#. ..#. ..#. ..#. ..#.",
  ".##. #..# #..# #..# .##. #..# #..# #..# .##.",
  ".##. #..# #..# #..# .### ...# ...# ...# .##.",
].map(rom);

// ------------------------------------------------------------ Mochitchi
// A daifuku of a pet: a soft dome 12x9 dots, two feet, and a seedling on
// its head (3 rows) that shows its mood. The face is drawn over the body.
const R = (...rows) => rom(rows.join(" "));
const BODY = R("....####....", "..##....##..", ".#........#.", "#..........#", "#..........#", "#..........#", "#..........#", ".#........#.", "..########..");
const FEET = [R("...##..##..."), R("..##...##..."), R("...##...##..")];   // stand, step, step
const SPROUT = {
  leaves: R(".......##...", "....#.###...", ".....##....."),
  flower: R("...#.#.#....", "....###.....", ".....#......"),
  bud: R("............", ".....#......", ".....#......"),
  wilt: R("............", "...##.......", "....###....."),
};
const E = "............";
const FACE = {
  open: R(E, E, E, "...#....#...", "...#....#...", E, "....####...."),
  blink: R(E, E, E, E, "..##....##..", E, "....####...."),
  happy: R(E, E, E, "...#....#...", "..#.#..#.#..", "....#..#....", ".....##....."),
  eat: R(E, E, E, "...#....#...", "...#....#...", ".....##.....", "....#..#....", ".....##....."),
  chew: R(E, E, E, E, "..##....##..", E, ".....##....."),
  sleep: R(E, E, E, E, "..##....##..", E, "......#....."),
  sick: R(E, E, E, "..#.#..#.#..", "...#....#...", "..#.#..#.#..", "....#.#.#..."),
  sad: R(E, E, E, "..#......#..", "...#....#...", E, ".....##.....", "....#..#...."),
  left: R(E, E, E, "..#....#....", "..#....#....", E, "...###......"),
  right: R(E, E, E, "....#....#..", "....#....#..", E, "......###..."),
};
// The body's silhouette, cleared before the outline so the pet is opaque.
const SOLID = Array.from({ length: BODY.h }, (_, j) => {
  let a = -1, b = -1;
  for (let i = 0; i < BODY.w; i++) if (BODY.at(i, j)) { if (a < 0) a = i; b = i; }
  return [a, b];
});

// ------------------------------------------------------------ the day

const at = (h, m) => h * 60 + m;
const GAME_HOURS = [10, 15, 20];
const dayMemo = new Map();
/** The day's schedule, fixed but for a few minutes' jitter, seeded by the date. */
function dayPlan(seed) {
  if (dayMemo.has(seed)) return dayMemo.get(seed);
  const j = (k, r = 3) => Math.round((noise(seed, k) * 2 - 1) * r);
  const meals = [
    { m: at(7, 30) + j(1), kind: 'meal' }, { m: at(10, 30) + j(2), kind: 'snack' },
    { m: at(12, 10) + j(3), kind: 'meal' }, { m: at(15, 30) + j(4), kind: 'snack' },
    { m: at(18, 30) + j(5), kind: 'meal' },
  ];
  // It poops 35-55 minutes after a meal, and the mess is cleaned 8-15 minutes later.
  const poops = meals.filter((q) => q.kind === 'meal').map((q, i) => {
    const m = q.m + 35 + Math.floor(noise(seed, 10 + i) * 20);
    return { m, flush: m + 8 + Math.floor(noise(seed, 20 + i) * 8) };
  });
  // About one day in four it falls ill for twenty minutes, cured by a jab.
  const sickAt = [9, 11, 14, 16, 19][Math.floor(noise(seed, 31) * 5)];
  const sick = noise(seed, 30) < 0.27 ? { from: at(sickAt, 32), to: at(sickAt, 52) } : null;
  const P = {
    meals, poops, sick,
    nap: { from: at(13, 30) + j(6), to: at(14, 5) + j(7) },
    meter: at(17, 20) + j(8), scold: at(21, 15) + j(9),
    hearts: [0, 1].map((k) => 2 + Math.floor(noise(seed, 40 + k) * 3)),
  };
  if (dayMemo.size > 4) dayMemo.delete(dayMemo.keys().next().value);
  dayMemo.set(seed, P);
  return P;
}

const smooth = (x, seed) => {
  const i = Math.floor(x), u = x - i, e = u * u * (3 - 2 * u);
  return noise(i, seed) * (1 - e) + noise(i + 1, seed) * e;
};
const FLUSH_AT = 11, FLUSH_FOR = 2.5;            // the wave crosses the pet's half in 2.5 s
const PET_COLS = 20;                            // the pet's half of the matrix
const waveCol = (s) => PET_COLS - ((s - FLUSH_AT) / FLUSH_FOR) * (PET_COLS + 8);
/**
 * What the pet is doing at this instant: its place and pose, the items on
 * the screen, the selected icon and the attention light. Pure in (f, night).
 */
function scene(f, date, night) {
  const M = f.h * 60 + f.m, s = f.sec, mk = f.minuteKey;
  const P = dayPlan(date.getFullYear() * 400 + date.getMonth() * 32 + date.getDate());
  const S = { x: 2, y: 1, face: 'open', sprout: 'leaves', feet: 0, flip: false, items: [], icon: -1, attention: false, pet: true, wave: null, zs: false };
  const item = (tile, c, r, flip = false) => S.items.push({ tile, c, r, flip });

  // Asleep: at night with the light off, or napping after lunch.
  const nap = M >= P.nap.from && M < P.nap.to;
  if (night >= 0.5 || nap) {
    Object.assign(S, { x: 0, face: 'sleep', sprout: 'bud', zs: true });
    if (!nap && M === at(23, 0)) S.icon = LIGHT;       // lights out
    if (nap && M === P.nap.to - 1 && s > 50) Object.assign(S, { face: 'blink', sprout: 'leaves', zs: false });
    return S;
  }

  // Standing state: a mess on the floor, or feeling ill.
  const poop = P.poops.find((p) => (M > p.m || (M === p.m && s >= 20)) && (M < p.flush || (M === p.flush && s < FLUSH_AT + 0.7)));
  const cure = P.sick && M === P.sick.to - 1;
  const ill = P.sick && M >= P.sick.from && M < P.sick.to && !(cure && s >= 20);

  // Wandering: a step every 0.8 s, a smooth random walk on the wall clock,
  // so it carries on across minutes. A mess pins it to the left.
  const xmax = poop ? 0 : 8, n = Math.floor((mk * 60 + s) / 0.8);
  const wx = (k) => Math.round(xmax * smooth(k * 0.17, 5));
  const x = wx(n), x0 = wx(n - 1);
  S.x = ill ? 0 : x;
  if (!ill && x !== x0) { S.face = x > x0 ? 'right' : 'left'; S.feet = 1 + (n % 2); }
  if (((mk * 60 + s) % 3.7) < 0.16) S.face = 'blink';
  if (poop) {
    item(TILE.poop[Math.floor(s) % 2], 12, 6);
    if (M > poop.m + 1) S.attention = true;
  }
  if (ill) {
    Object.assign(S, { face: 'sick', sprout: 'wilt', attention: true });
    item(TILE.skull, 12, 0);
  }
  if (P.meals.some((q) => M === q.m - 1) && s > 30) { S.attention = true; S.face = s % 4 < 2 ? 'sad' : S.face; }
  if (f.m === 59 && s >= 54) S.attention = true;   // calling for the hour
  // Meals: the food icon, the dish drops in, three bites, a happy hop.
  const meal = P.meals.find((q) => q.m === M);
  if (meal && s >= 6 && s < 20) {
    S.icon = FOOD;
    if (s >= 8 && s < 18) {
      Object.assign(S, { x: 7, face: 'open', feet: 0 });
      const stage = s < 10.5 ? 0 : s < 12.5 ? 1 : s < 14.5 ? 2 : -1;
      if (stage >= 0) item(TILE[meal.kind][stage], 0, s < 8.5 ? 6 - (8.5 - s) * 24 : 6);
      if (s >= 9 && s < 14.5) S.face = Math.floor(s * 3) % 2 ? 'eat' : 'chew';
      if (s >= 14.5) Object.assign(S, { face: 'happy', sprout: 'flower', y: s < 15.4 ? 0 : 1 });
    }
  }
  // The flush: the bathroom icon, and the P1's wave sweeps the floor clean.
  if (poop?.flush === M || P.poops.some((p) => p.flush === M)) {
    if (s >= 8 && s < 18) S.icon = BATH;
    if (s >= FLUSH_AT && s < FLUSH_AT + FLUSH_FOR) S.wave = waveCol(s);
    if (s >= FLUSH_AT + 1 && s < 16) Object.assign(S, { face: 'happy', sprout: 'flower' });
  }
  // The meter: hungry and happy hearts, instead of the pet, for a few seconds.
  if (M === P.meter && s >= 10 && s < 18) {
    S.icon = METER; S.pet = false;
    for (let row = 0; row < 2; row++)
      for (let k = 0; k < 2; k++) item(k < P.hearts[row] - 2 || k === 0 ? TILE.heart : TILE.hollow, 2 + 8 * k, 7 * row);
  }
  // Discipline: it turns its back and sulks, is told off, and makes up.
  if (M === P.scold) {
    if (s >= 5 && s < 12) { Object.assign(S, { face: 'left', attention: true }); item(TILE.ticks, 9, -1); }
    if (s >= 12 && s < 16) Object.assign(S, { icon: DISCIPLINE, face: 'sad' });
    if (s >= 16 && s < 19) S.face = 'happy';
  }
  // The cure: the medicine icon, the jab, sparkles.
  if (cure && s >= 15 && s < 25) {
    S.icon = MEDICINE;
    if (s >= 16 && s < 20) item(SYRINGE, Math.round(clamp(13 - (s - 16) * 3, 9, 13)), 3);
    if (s >= 20) { Object.assign(S, { face: 'happy', sprout: 'leaves' }); item(TILE.spark, 12, 1); }
  }
  // The hour: a call, then a party, or three rounds of left-or-right.
  if (f.m === 0 && !ill) {
    if (f.h === 7 && s < 3) S.icon = LIGHT;           // good morning
    if (GAME_HOURS.includes(f.h) && s < 12) {
      S.icon = GAME;
      const k = Math.floor(s / 4), u = s - 4 * k;
      const look = noise(mk, 50 + k) < 0.5 ? 'left' : 'right', guess = noise(mk, 60 + k) < 0.55 ? look : look === 'left' ? 'right' : 'left';
      Object.assign(S, { x: 4, feet: 0, face: 'open' });
      if (u >= 0.6) item(ARROW, guess === 'left' ? 0 : 17, 5, guess === 'left');
      if (u >= 1.4) S.face = look;
      if (u >= 2.4) {
        if (look === guess) { Object.assign(S, { face: 'happy', sprout: 'flower', y: u < 2.8 ? 0 : 1 }); item(TILE.spark, look === 'left' ? -2 : 15, 0); }
        else { S.face = 'sad'; item(TILE.ticks, 12, 0); }
      }
    } else if (s < 4.5) {
      if (s < 1.6) S.icon = Math.floor(s / 0.2) % 8;   // the icons light in turn, all round the egg
      Object.assign(S, { face: 'happy', sprout: 'flower', feet: 0, y: 1 - Math.round(Math.abs(Math.sin(Math.PI * s * 1.2))) });
      S.x = 4; const ph = Math.floor(s * 3) % 2; item(TILE.spark, ph ? -2 : 15, ph ? 1 : 0); item(TILE.spark, ph ? 15 : -2, ph ? 5 : 6);
    }
  } else if (s < 1.6 && !ill && !poop) {
    // Every minute, a little something as it turns.
    const kind = Math.floor(noise(mk, 3) * 5);
    if (kind === 0) S.y = s < 0.4 ? 0 : 1;                                  // hop
    else if (kind === 1) S.face = s < 0.8 ? 'left' : 'right';                 // look round
    else if (kind === 2) S.face = s < 0.3 || (s > 0.6 && s < 0.9) ? 'blink' : 'open';  // double blink
    else if (kind === 3) S.sprout = Math.floor(s * 5) % 2 ? 'flower' : 'leaves';      // leaves flutter
    else { S.face = 'happy'; S.y = s < 0.5 ? 0 : 1; }                        // a happy bounce
  }
  return S;
}
// ------------------------------------------------------------ drawing

const MX = 1, MY = 11, COLS = 42, ROWS = 14;      // the dot matrix: 2x2 dots, 3 px pitch
const ICON_X = [16, 48, 80, 112], ICON_TOP = 1, ICON_BOTTOM = 54;
const TIME_COLS = [21, 26, 33, 38], TIME_ROW = 2, COLON_COL = 31;
const DAY = 0xcf, NIGHT = 0x18;

export default {
  name: 'Tamagotchi',
  blurb: 'Mochitchi, a rice-cake pet on a P1-style dot matrix, lives the real day: meals, naps, poops and a flush, a jab when ill, lights out at night.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,

  frame(g, { fields: f, date, oled, night }) {
    oled.contrast(DAY + (NIGHT - DAY) * night);  // night dimming, 23:00-07:00 (ctx.night)
    const [ox, oy] = orbit(date, 1, 4);
    const dot = (c, r, on = 1) => {
      if (c >= 0 && c < COLS && r >= 0 && r < ROWS) g.fillRect(MX + ox + 3 * Math.round(c), MY + oy + 3 * Math.round(r), 2, 2, on);
    };
    const draw = (p, c, r, flip = false, maxCol = COLS) => {
      for (let j = 0; j < p.h; j++)
        for (let i = 0; i < p.w; i++)
          if (p.at(flip ? p.w - 1 - i : i, j) && c + i < maxCol) dot(c + i, r + j);
    };
    const S = scene(f, date, night);

    // The icons: the selected one (and the attention light, when calling)
    // stands out of a lit tab, the rest are plain line art.
    // The icon rows drift a pixel every two minutes, 6 px to and fro.
    const dk = Math.floor(f.minuteKey / 2) % 12, drift = (dk <= 6 ? dk : 12 - dk) - 3;
    ICONS.forEach((ic, k) => {
      const lit = k === S.icon || (k === ATTENTION && S.attention);
      const x0 = ICON_X[k % 4] - Math.floor(ic.w / 2) + ox + drift, y0 = (k < 4 ? ICON_TOP : ICON_BOTTOM) + oy;
      if (lit) g.fillRoundRect(x0 - 3, y0 - 2 + (k < 4 ? 0 : 1), ic.w + 6, ic.h + 3, 2);
      // At night the unlit icons are a half-tone, as if the light were off.
      for (let j = 0; j < ic.h; j++)
        for (let i = 0; i < ic.w; i++) if (ic.at(i, j) && (lit || night < 0.5 || (i + j) % 2 === 0)) g.pixel(x0 + i, y0 + j, lit ? 0 : 1);
    });

    // The time, H:MM or HH:MM, the colon blinking on the second.
    const dg = [Math.floor(f.h / 10), f.h % 10, Math.floor(f.m / 10), f.m % 10];
    dg.forEach((d, k) => { if (k > 0 || d > 0) draw(DIGITS[d], TIME_COLS[k], TIME_ROW); });
    if (f.sec % 1 < 0.5) { dot(COLON_COL, TIME_ROW + 2); dot(COLON_COL, TIME_ROW + 6); }

    // The pet's half: items, then the pet, then the flush over both.
    for (const it of S.items) draw(it.tile, it.c, it.r, it.flip, PET_COLS);
    if (S.pet) {
      for (let j = 0; j < BODY.h; j++) for (let i = SOLID[j][0]; i <= SOLID[j][1]; i++) dot(S.x + i, S.y + 3 + j, 0);
      draw(SPROUT[S.sprout], S.x, S.y);
      draw(BODY, S.x, S.y + 3);
      draw(FACE[S.face], S.x, S.y + 3);
      draw(FEET[S.feet], S.x, S.y + 12);
    }
    if (S.zs) {
      const u = f.sec % 2;
      draw(u < 1 ? TILE.smallZ : TILE.bigZ, 12, u < 1 ? 1 : -1);
    }
    if (S.wave !== null) {
      const c0 = Math.round(S.wave);
      for (let r = 0; r < ROWS; r++)
        for (let i = 0; i < 8; i++) {
          const c = c0 + i;
          if (c < 0 || c >= PET_COLS) continue;
          dot(c, r, 0);
          if (WAVE[r % 4][i] === '#') dot(c, r, 1);
        }
    }
  },
};
