// Cat — a black cat asleep beside the clock, who gets up on the hour.
//
// All hour it sleeps, curled in the three cells at the left: a loaf of a
// body, its face turned to us, the tail wrapped round in front. It breathes
// (the top of its back rises and falls every two seconds), an ear twitches
// now and then, the tip of its tail flicks, and z and Z drift up beside it in
// ROM. At :05, :25 and :45 past, a mouse creeps in along the bottom row; one
// eye opens and follows it until it thinks better of it and runs.
//
// On the hour it wakes: eyes open, head up, a yawn, it gets up and stretches
// (rump up, front legs out along the floor), walks to the clock, sits, looks
// at the time, bats the first digit twice so it jiggles, and meows the hour,
// twelve-hour style, counting on the bottom row. Then it turns round, goes
// back, circles once and curls up again.
//
// The anatomy is laid out on the cells, not across them: the head is always
// exactly one cell (5 dots wide), so the gap between cells is the line of the
// neck rather than a cut through the face, and a 5x7 face has room for ears,
// slit eyes and a chin. The cat is drawn dot by dot through `Stage`, so only
// the cells it covers take slots: six asleep, at most seven while it bats a
// digit (the digit's cell is a jiggled copy of its ROM glyph). The mouse
// takes the last two while the cat sleeps. The clock and the date are ROM.
//
// Tried and dropped: a cat drawn freely across the cells (a 15-dot curl with
// the head straddling a gap) read as a blob, and an outline cat was too thin
// to read at 1:1. A filled black-cat silhouette with the anatomy on the
// cell grid reads at a glance. Every pose holds 400 ms or more.

import { Stage, noise, clamp } from '../js/kit.js';

const FPS = 10;
const TIME_COL = 10;                      // "HH:MM" on the top row, at the right
const DATE_COL = 10;

// ------------------------------------------------------------------ the art
// Sprites are in dot columns (5 per cell). 'o' is a dot forced dark, '#' lit.

const FACE = {
  sleep: ['#...#', '##.##', '#####', '#####', '#o#o#', '#####', 'o###o'],
  awake: ['#...#', '##.##', '#####', '#o#o#', '#o#o#', '#####', 'o###o'],
  wink:  ['#...#', '##.##', '#####', '###o#', '#o#o#', '#####', 'o###o'],
  right: ['#...#', '##.##', '#####', '##o#o', '##o#o', '#####', 'o###o'],
  yawn:  ['#...#', '##.##', '#####', '#o#o#', '#####', '#ooo#', 'o#o#o'],
  meow:  ['#...#', '##.##', '#####', '#o#o#', '#o#o#', '##o##', 'o#o#o'],
};
const SLEEP_BODY = [
  '...####...',
  '.#######..',
  '#########.',
  '##########',
  '##########',
  '##########',
  '##########',
  '..........',
  '.#########',
];
const STAND = [
  '#..............',
  '#.........#...#',
  '.#........##.##',
  '.#........#####',
  '.#........#o#o#',
  '.#........#o#o#',
  '.#........#####',
  '.#########.###.',
  '##############.',
  '.#############.',
  '.############..',
  '.##.......##...',
  '.##.......##...',
  '.##.......##...',
  '.#.#......#.#..',
];
// The same with the legs mid-stride, for walking.
const STRIDE = [...STAND.slice(0, 11), '.##........##..', '.#.#.......#.#.', '#...#.....#...#', '#...#.....#...#'];
const STAND_LOW = [                       // just up, tail still down
  '...............',
  '..........#...#',
  '..........##.##',
  '..........#####',
  '..........#o#o#',
  '..........#o#o#',
  '..........#####',
  '..########.###.',
  '.#############.',
  '#.############.',
  '#.###########..',
  '#.##.......##..',
  '.###.......##..',
  '..##.......##..',
  '..#.#......#.#.',
];
const BOW = [
  '#',
  '#',
  '.#',
  '.#####',
  '#########',
  '.#########',
  '.##..#####',
  '.##.....###...#',
  '.##......###.##',
  '.##.......#####',
  '.##.......#o#o#',
  '.##.......#####',
  '.##.......#ooo#',
  '.##........#.#',
  '.##.....###########.',
  '.#.#....##########.#',
];
const SIT = [
  '......#...#',
  '......##.##',
  '......#####',
  '......#o#o#',
  '......#o#o#',
  '......#####',
  '......o###o',
  '......#####',
  '......#####',
  '.....######',
  '....#######',
  '#..########',
  '#..########',
  '#..##.#.#.#',
  '.#########.',
];
const PAW_UP = ['##', '##', '#.', '#.'];
const PAW_OUT = ['####', '#...'];
// The mouse, facing left: ears, a round back, a pointed nose, a tail along
// the floor. Six dots wide, so it never covers more than two cells.
const MOUSE = ['..##..', '.####.', '#####.'];
const MOUSE_FEET = ['.#..##', '#.#.##'];

const mirror = (art) => { const w = Math.max(...art.map((l) => l.length)); return art.map((l) => [...l.padEnd(w, '.')].reverse().join('')); };

/** A 16-row picture of dots, as a Set of "x,y" keys, built up by stamping. */
class Pic {
  constructor() { this.on = new Set(); }
  stamp(art, x0, y0) {
    art.forEach((l, r) => [...l].forEach((ch, i) => {
      const k = `${x0 + i},${y0 + r}`;
      if (ch === '#') this.on.add(k); else if (ch === 'o') this.on.delete(k);
    }));
    return this;
  }
  set(x, y, v = true) { const k = `${x},${y}`; if (v) this.on.add(k); else this.on.delete(k); return this; }
  ink(st) {
    for (const k of this.on) {
      const [x, y] = k.split(',').map(Number);
      if (x >= 0 && x < 80 && y >= 0 && y < 16) st.dot(Math.floor(x / 5) * 6 + (x % 5), y);
    }
  }
}

// ------------------------------------------------------------------ poses

/** Lying curled. `up` raises the head (0-2 rows), with a chest under it. */
function lying(pic, face, { up = 0, breath = 1, ear = false, tail = false } = {}) {
  pic.stamp(breath ? SLEEP_BODY : ['..........', '..######..', ...SLEEP_BODY.slice(2)], 0, 7);
  pic.stamp(FACE[face], 10, 7 - up);
  if (up) pic.stamp(['.###.', '.####', '.####'].slice(0, up + 1), 10, 14 - up);
  pic.stamp(['....#', '####.'], 10, 14);
  if (ear) pic.set(14, 7 - up, false).set(13, 7 - up);               // the right ear flicks down
  if (tail) pic.set(14, 14, false).set(14, 13, false).set(13, 13);   // tail tip curls in
}

const stand = (pic, x, art = STAND, flip = false) => pic.stamp(flip ? mirror(art) : art, x, 16 - art.length);
// Where it sits to look at the clock: head in cell 8, paw reaching into cell
// 9, against the first digit in cell 10. Every pose keeps the head on a cell.
const SIT_X = 34;
const WALK = [5, 10, 15, 20, 25];         // standing positions on the way

// ------------------------------------------------------------------ the hour

/**
 * The wake-up, as [seconds, step]. Each step draws a pose. Meows are added
 * per hour; the rest of the sequence is fixed.
 */
function script(calls) {
  const steps = [
    [0.5, (p) => lying(p, 'sleep', { ear: true })],
    [0.7, (p) => lying(p, 'wink')],
    [0.6, (p) => lying(p, 'awake')],
    [0.8, (p) => lying(p, 'awake', { up: 2 })],
    [1.4, (p) => lying(p, 'yawn', { up: 2 }), { text: 'yaaawn' }],
    [0.5, (p) => stand(p, 0, STAND_LOW)],
    [0.5, (p) => stand(p, 0)],
    [1.8, (p) => p.stamp(BOW, 0, 0), { text: 'mmmrrp' }],
    [0.5, (p) => stand(p, 0)],
    ...WALK.map((x, k) => [0.4, (p) => stand(p, x, k % 2 ? STAND : STRIDE)]),
    [0.6, (p) => p.stamp(SIT, SIT_X, 1)],
    [0.8, (p) => p.stamp(SIT, SIT_X, 1).stamp(FACE.right, SIT_X + 6, 1)],
  ];
  const sit = (face) => (p) => p.stamp(SIT, SIT_X, 1).stamp(FACE[face], SIT_X + 6, 1);
  for (let k = 0; k < 2; k++) {
    steps.push([0.4, (p) => sit('right')(p).stamp(PAW_UP, SIT_X + 11, 3)]);
    steps.push([0.4, (p) => sit('right')(p).stamp(PAW_OUT, SIT_X + 11, 4), { bat: true }]);
  }
  steps.push([0.5, sit('right')]);
  for (let n = 1; n <= calls; n++) {
    steps.push([0.45, sit('meow'), { meow: n }]);
    steps.push([0.35, sit('awake'), { meow: n }]);
  }
  steps.push(
    [0.6, sit('awake'), { meow: calls }],
    ...[...WALK].reverse().map((x, k) => [0.4, (p) => stand(p, x, k % 2 ? STRIDE : STAND, true)]),
    [0.45, (p) => stand(p, 0, STAND, true)],
    [0.45, (p) => stand(p, 0)],                       // round once, as cats do
    [0.45, (p) => stand(p, 0, STAND, true)],
    [0.45, (p) => stand(p, 0, STAND_LOW)],
    [0.6, (p) => lying(p, 'awake', { up: 2 })],
    [0.6, (p) => lying(p, 'awake')],
    [0.6, (p) => lying(p, 'wink')],
  );
  return steps;
}

/** The step of the wake-up at `sec`, or null once it is back asleep. */
function wakeStep(fields) {
  if (fields.m !== 0) return null;
  const sec = fields.s + fields.ms / 1000;
  let t = 0;
  for (const step of script(fields.h % 12 || 12)) {
    t += step[0];
    if (sec < t) return step;
  }
  return null;
}

// ----------------------------------------------------------------- the mouse

const MOUSE_MINUTES = [5, 25, 45];
const MOUSE_IN = 20, MOUSE_STOP = 24, MOUSE_FLEE = 29, MOUSE_GONE = 31;
const MOUSE_NEAR = 21, MOUSE_FAR = 80;        // dot column of its nose

/** The mouse's nose column, which way it faces, and whether the cat sees it. */
function mouseAt(fields) {
  if (!MOUSE_MINUTES.includes(fields.m)) return null;
  const sec = fields.s + fields.ms / 1000;
  if (sec < MOUSE_IN || sec >= MOUSE_GONE) return null;
  if (sec < MOUSE_STOP) {
    // Creeping in, in little dashes: a dot every 160 ms, pausing every five.
    const steps = Math.floor((sec - MOUSE_IN) / 0.16);
    const moved = steps - Math.floor(steps / 6);
    return { x: Math.max(MOUSE_NEAR, MOUSE_FAR - moved * 2), left: true, seen: sec > MOUSE_STOP - 1.2 };
  }
  if (sec < MOUSE_FLEE) return { x: MOUSE_NEAR, left: true, seen: true, still: true };
  const u = clamp((sec - MOUSE_FLEE) / (MOUSE_GONE - MOUSE_FLEE), 0, 1);
  return { x: Math.round(MOUSE_NEAR + (MOUSE_FAR - MOUSE_NEAR) * u), left: false, seen: true };
}

// ------------------------------------------------------------------- design

export default {
  name: 'Cat',
  blurb: 'A black cat asleep beside the clock: it breathes, twitches, watches a mouse, and on the hour wakes, stretches and meows the hour.',
  bus: 'i2c100',
  panel: 'gray',
  fps: FPS,

  frame(lcd, api, { fields, date }) {
    const sec = fields.s + fields.ms / 1000;
    const T = date.getTime() / 1000;
    const st = new Stage(lcd);
    const pic = new Pic();

    const step = wakeStep(fields);
    const extra = step?.[2] ?? {};
    const mouse = step ? null : mouseAt(fields);

    if (step) {
      step[1](pic);
    } else {
      // Asleep. Breathing in for two seconds, out for two; an ear twitch and a
      // tail flick on their own slow, uneven clocks.
      const breath = Math.floor(T / 2) % 2;
      const w = Math.floor(T / 5.3), ear = noise(w, 4) > 0.55 && T - w * 5.3 < 0.4;
      const v = Math.floor(T / 3.1), tail = noise(v, 5) > 0.6 && T - v * 3.1 < 0.5;
      lying(pic, mouse?.seen ? 'wink' : 'sleep', { breath, ear, tail });
    }

    if (mouse) {
      // Its feet patter while it moves.
      const feet = MOUSE_FEET[mouse.still ? 0 : Math.floor(T / 0.16) % 2];
      const art = [...MOUSE, feet];
      pic.stamp(mouse.left ? art : mirror(art), mouse.x, 12);
    }
    pic.ink(st);

    // The clock, and the date or whatever the cat is saying.
    st.text(TIME_COL, 0, `${fields.hh}:${fields.mm}`);
    if (extra.bat) {
      // The paw lands on the first digit and knocks it up and to the right.
      const rom = lcd.glyph(fields.hh.charCodeAt(0));
      const glyph = [...rom.slice(1), 0].map((b) => b >> 1);
      st.put(TIME_COL, 0, glyph, fields.hh.charCodeAt(0));
    }
    if (extra.meow) st.text(DATE_COL, 1, `MEOW${String(extra.meow).padStart(2, ' ')}`);
    else if (extra.text) st.text(DATE_COL, 1, extra.text);
    else st.text(DATE_COL, 1, `${fields.dd} ${fields.month}`);

    // z, z, Z drifting up from its head while it sleeps.
    if (!step && !mouse?.seen) {
      const z = Math.floor(T / 0.9) % 4;
      if (z === 0) st.put(3, 1, 0x7a);
      if (z === 1) st.put(3, 0, 0x7a);
      if (z === 2) st.put(4, 0, 0x5a);
    }

    st.draw();
  },
};
