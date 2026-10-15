// Aquarium — two fish swimming round the whole glass, through the clock.
//
// The eight tiles are not a fixed screen here: they follow the fish. Each
// fish is drawn dot by dot (`Stage`) wherever it is, and only the cells it
// covers take a slot, as private copies of whatever ROM text is under it.
// A fish at most eight dots long covers at most two cells across and two
// rows down, so two fish never need more than eight.
//
// Everything else is free ROM: the time, seaweed that sways ( ) ( ),
// and bubbles that rise from the bottom, an o and then a smaller dot.
//
// The big fish does the clock's work. At :00 it swims along the top row and
// each digit of the time changes as its nose goes past. The rest of the
// minute it does laps, lower down and back; the little one darts about at
// random. Both wag their tails every 300 ms, so the tail holds long enough
// for the glass to show it.
//
// A fish crossing a cell gap loses a dot column to it, the way a fish in a
// tank goes behind the glazing bars. Moving, it still reads as a fish.

import { Stage, smoothNoise, clamp } from '../js/kit.js';

const FPS = 12;
const BIG = [
  ['#..####.', '.##.##.#', '..######', '.##.####', '#..####.'],
  ['.#.####.', '.##.##.#', '#.######', '.##.####', '.#.####.'],
];
const SMALL = [
  ['#.###', '.###.', '#.###'],
  ['..###', '####.', '..###'],
];

/** Draw a sprite into the stage at glass column x, dot row y, facing right or left. */
function draw(st, sprite, x, y, right) {
  sprite.forEach((line, r) => [...line].forEach((ch, i) => {
    if (ch === '#') st.dot(Math.round(x) + (right ? i : line.length - 1 - i), Math.round(y) + r);
  }));
}

// The big fish's laps, as [start s, end s, x from, x to, y from, y to].
// It starts each minute off the left edge for the run along the top.
const LAPS = [
  [0, 4.2, -10, 98, 1, 1],
  [22, 31, 98, -10, 10, 9],
  [38, 47, -10, 98, 5, 7],
  [50, 58, 98, -10, 3, 2],
];
const TIME_COL = 5;                  // "HH:MM:SS" from here, top row

function bigFishAt(sec) {
  for (const [t0, t1, x0, x1, y0, y1] of LAPS) {
    if (sec >= t0 && sec < t1) {
      const u = (sec - t0) / (t1 - t0);
      return { x: x0 + (x1 - x0) * u, y: y0 + (y1 - y0) * u + Math.sin(u * 6) * 0.8, right: x1 > x0 };
    }
  }
  return null;
}

/** The little fish: a smooth random wander over the whole glass. */
function smallFishAt(T) {
  const x = 4 + smoothNoise(T / 5, 3) * 84, y = 1 + smoothNoise(T / 4, 8) * 11;
  const ahead = smoothNoise((T + 0.2) / 5, 3) * 84 + 4;
  return { x, y, right: ahead >= x };
}

export default {
  name: 'Aquarium',
  blurb: 'Two fish swim round the whole glass, through the clock; the big one changes each digit as it swims past at :00.',
  bus: 'i2c100',
  panel: 'blue',
  fps: FPS,

  frame(lcd, api, { fields, date, kit }) {
    const sec = fields.s + fields.ms / 1000;
    const T = date.getTime() / 1000;
    const st = new Stage(lcd);

    // The time. During the run along the top, a digit still shows the old
    // value until the fish's nose has passed it.
    const big = bigFishAt(sec);
    const old = kit.clockFields(new Date(date.getTime() - 60000));
    const now = `${fields.hh}:${fields.mm}`, was = `${old.hh}:${old.mm}`;
    const nose = big && sec < LAPS[0][1] ? big.x + 8 : Infinity;
    [...now].forEach((ch, i) => {
      const col = TIME_COL + i;
      st.put(col, 0, (nose < col * 6 ? was[i] : ch).charCodeAt(0));
    });
    st.text(TIME_COL + 5, 0, `:${fields.ss}`);

    // Seaweed, two fronds swaying out of step, and a third on the right.
    const sway = (phase) => (Math.floor(T / 0.8 + phase) % 2 ? 0x28 : 0x29);
    st.put(1, 0, sway(0)).put(1, 1, sway(1)).put(2, 1, sway(0.5)).put(15, 1, sway(0.3)).put(15, 0, sway(1.3));
    st.put(0, 1, 0x5f).put(12, 1, 0x5f).put(13, 1, 0x5f);   // a little sand

    // Bubbles from the bottom: an o low down, then a smaller dot up top.
    // (Not the degree sign: next to the seconds it reads as a temperature.)
    const b = (T % 1.6) / 1.6;
    if (b < 0.4) st.put(14, 1, 0x6f); else if (b < 0.75) st.put(14, 0, 0xa5);
    const b2 = ((T + 0.8) % 2.3) / 2.3;
    if (b2 < 0.35) st.put(3, 1, 0x6f); else if (b2 < 0.65) st.put(3, 0, 0xa5);

    const wag = Math.floor(T / 0.3) % 2;
    if (big) draw(st, BIG[wag], big.x, big.y, big.right);
    const small = smallFishAt(T);
    draw(st, SMALL[wag], small.x, clamp(small.y, 0, 13), small.right);

    st.draw();
  },
};
