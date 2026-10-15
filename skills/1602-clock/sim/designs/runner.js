// Runner — the offline dinosaur game, across the whole glass.
//
// The bottom row is the desert floor. A little dinosaur runs on the spot at
// the left while the ground scrolls under it and cacti come in from the
// right edge; it jumps each one, high into the top row and down again. The
// time is the game's score, top right, in ROM. As in the game, the score
// flashes at each milestone: here, every minute, when a bird swoops in level
// with the dinosaur's head and it ducks under it. On the hour it misses a
// jump: GAME OVER across the top row, the world freezes, and it starts
// again with the screen cleared.
//
// The budget. The ground is one tile, shown in all sixteen cells: a line on
// dot row 6 and a speck below it whose phase moves one dot a frame, so the
// whole floor scrolls for the price of one slot (as `tide` moves water
// through every digit at once). The dinosaur stays in one cell column and
// is two tiles. Cacti and the bird are inked over the ground or the sky
// (`Stage`), at most two cells each, and the schedule keeps at most two of
// them on the glass at a time: seven slots at worst, checked on every frame
// of a day, not just the budget tool's samples.
//
// Everything is worked out from the wall clock. Each minute's cacti are
// placed by deterministic noise, spaced so that no two jumps overlap and no
// cactus is near the minute, and each jump is centred on the moment its
// cactus passes the dinosaur and long enough for that cactus's height. The
// schedule and the pose are exported so that a check can prove the dinosaur
// never touches anything except the cactus on the hour.
//
// Tried and dropped: the eight tiles as a fixed 8x1 strip, the game inside
// it and ROM ground outside. Cacti popped into being at the strip's edge,
// mid-floor. A shared ground tile lets the world span all sixteen cells.
// Sprites are placed in dot columns, five a cell, not glass columns: a
// 3-wide cactus losing its trunk to a cell gap was two loose dots.
//
// The world scrolls one dot a frame at 7 fps, 143 ms a step: about the
// glass's switching time, so it reads as motion, not smear.

import { Stage, noise, clamp } from '../js/kit.js';

const FPS = 7;
const V = 7;                       // ground speed, dot columns per second
const VB = 10;                     // the pterodactyl flies a little faster
const RUN_X = 5;                   // the dinosaur's left dot column: cell 1
const RUN_C = RUN_X + 2;           // its centre column
const RIGHT = 80;                  // dot columns: 16 cells of 5
const FOOT = 13;                   // dot row the feet stand on (ground is 14)
const LIFT = 7;                    // jump height: the head reaches dot row 0
const DUCK = 1.0;                  // seconds either side of the bird
const FREEZE = 2.6;                // GAME OVER, on the hour

// ------------------------------------------------------------------ sprites

// The dinosaur is five dots wide so it stays in one cell column, and seven
// tall, so standing it reaches into the top row: two tiles. Its head has an
// eye in it, which is what makes it read as a face and not a blob.
const DINO = {
  run: [
    ['..###', '..#.#', '..###', '#.##.', '####.', '.###.', '.#..#'],
    ['..###', '..#.#', '..###', '#.##.', '####.', '.###.', '..##.'],
  ],
  air: ['..###', '..#.#', '..###', '#.##.', '####.', '.###.', '.#.#.'],
  duck: ['...##', '.####', '##.#.'],
  dead: ['..###', '..#.#', '..#..', '#.###', '####.', '.###.', '.#.#.'],
};
// Cacti with `jump`: seconds in the air, long enough for the feet to be
// above the cactus for the whole time they overlap it (checked over a day).
export const CACTUS = [
  { art: ['.#..', '.#.#', '##.#', '.##.', '.#..'], jump: 2.0 },
  { art: ['.#..', '##..', '##.#', '.###', '.#..', '.#..'], jump: 2.7 },
];
// The bird flies in the top row, level with the dinosaur's head. It flaps
// between a v and a caret every 300 ms. A pterodactyl drawn with a beak and
// a swept wing was tried first: at five dots wide it read as a plus sign.
export const BIRD = [
  ['#...#', '.#.#.', '..#..'],       // wings up
  ['.....', '.###.', '#...#'],       // wings down
];
export const BIRD_FOOT = 7;
export const GEOM = { RUN_X, FOOT, FPS };

// The world is laid out in dot columns, five per cell: a sprite crossing a
// cell gap is stretched by it for a step rather than losing a column to it.
const glassX = (x) => Math.floor(x / 5) * 6 + (((x % 5) + 5) % 5);

/** Ink a sprite whose bottom row sits on dot row `bottom`. */
function ink(st, sprite, x, bottom) {
  const top = bottom - sprite.length + 1;
  sprite.forEach((line, r) => [...line].forEach((ch, i) => { if (ch === '#') st.dot(glassX(x + i), top + r); }));
}

// ----------------------------------------------------------------- schedule

const minuteOf = (key) => new Date(key * 60000);
const isHour = (key) => minuteOf(key).getMinutes() === 0;

/**
 * The cacti of minute `key`, as { at, kind }: `at` is the second (absolute)
 * when the cactus's centre passes the dinosaur's. Spaced 7-9.5 s apart, none
 * in the last ten seconds (the bird's) or the first six. In the minute before
 * the hour they stop earlier, to leave room for the cactus that ends the game;
 * after GAME OVER the world restarts empty.
 */
function cacti(key) {
  const out = [];
  const start = isHour(key) ? 15 : 6.5;
  const end = isHour(key + 1) ? 46 : 49.5;
  let a = start + noise(key, 1) * 2;
  for (let i = 0; a <= end; i++) {
    out.push({ at: key * 60 + a, kind: noise(key * 17 + i, 2) > 0.55 ? 1 : 0 });
    a += 7.5 + noise(key * 31 + i, 3) * 2.5;
  }
  return out;
}

/** Everything in the world at absolute second `T`. */
export function world(T) {
  const key = Math.floor(T / 60);
  const things = [];
  for (const k of [key - 1, key, key + 1]) {
    for (const c of cacti(k)) {
      const x = Math.round(RUN_C - Math.floor(CACTUS[c.kind].art[0].length / 2) + V * (c.at - T));
      things.push({ type: 'cactus', x, kind: c.kind, at: c.at });
    }
    // The minute's bird, or on the hour the cactus it does not clear: it
    // arrives touching the dinosaur's nose exactly on the hour.
    const mark = k * 60;
    if (isHour(k)) things.push({ type: 'cactus', x: Math.round(RUN_X + 4 + V * (mark - T)), kind: 1, fatal: true });
    else things.push({ type: 'bird', x: Math.round(RUN_C - 2 + VB * (mark + 0.4 - T)), at: mark + 0.4 });
  }
  return things.filter((s) => s.x > -6 && s.x < RIGHT);
}

/** The dinosaur's pose and lift at `T`: up for a cactus, down for the bird. */
export function dinosaur(T, things, dead) {
  if (dead) return { pose: DINO.dead, lift: 0 };
  let pose = DINO.run[Math.floor((T * FPS) / 2) % 2], lift = 0;
  for (const s of things) {
    if (s.type === 'cactus' && !s.fatal) {
      const jump = CACTUS[s.kind].jump;
      if (Math.abs(T - s.at) < jump / 2) {
        const u = (T - (s.at - jump / 2)) / jump;
        lift = clamp(Math.round(LIFT * 4 * u * (1 - u)), 0, LIFT);
        pose = DINO.air;
      }
    }
    if (s.type === 'bird' && Math.abs(T - s.at) < DUCK) pose = DINO.duck;
  }
  return { pose, lift };
}

// ------------------------------------------------------------------- ground

/** The ground tile at scroll position `d` (dot columns travelled). */
function ground(d) {
  const rows = Array(8).fill('.....');
  rows[6] = '#####';
  // One speck per cell on row 7, moving left a dot a step.
  const p = (((2 - d) % 5) + 5) % 5;
  rows[7] = [...'.....'].map((_, i) => (i === p ? '#' : '.')).join('');
  return rows;
}

// ------------------------------------------------------------------- design

export default {
  name: 'Runner',
  blurb: 'The offline dinosaur game across the glass: cacti to jump, a pterodactyl to duck each minute, GAME OVER on the hour.',
  bus: 'i2c100',
  panel: 'gray',
  fps: FPS,

  frame(lcd, api, { fields, date }) {
    const sec = fields.s + fields.ms / 1000;
    const real = Math.floor((date.getTime() / 1000) * FPS + 1e-6) / FPS;
    const dead = fields.m === 0 && sec < FREEZE;
    // While the game is over the world holds still at the moment of impact.
    const T = dead ? real - sec : real;

    const st = new Stage(lcd);
    const floor = ground(Math.round(T * V));
    for (let c = 0; c < 16; c++) st.put(c, 1, floor);

    // The score: the time, top right, flashing at the minute.
    const flash = sec < 1.5 && !dead && Math.floor(sec / 0.25) % 2 === 1;
    if (dead) st.text(0, 0, 'G A M E  O V E R');
    else {
      st.text(8, 0, flash ? '  ' : fields.hh).text(10, 0, flash ? ' ' : ':').text(11, 0, flash ? '  ' : fields.mm);
      st.text(13, 0, `:${fields.ss}`);
      // Two clouds drifting slowly over the sky, a cell every 1.6 s, kept
      // two cells clear of the time: beside it a dash read as a minus sign.
      for (const off of [0, 3]) {
        const col = 6 - ((Math.floor(T / 1.6) + off) % 7);
        if (col >= 2) st.put(col, 0, 0xb0);
      }
    }

    const things = world(T);
    for (const s of things) {
      if (s.type === 'cactus') ink(st, CACTUS[s.kind].art, s.x, FOOT);
      else ink(st, BIRD[Math.floor(T / 0.3) % 2], s.x, BIRD_FOOT);
    }

    const { pose, lift } = dinosaur(T, things, dead);
    ink(st, pose, RUN_X, FOOT - lift);

    st.draw();
  },
};
