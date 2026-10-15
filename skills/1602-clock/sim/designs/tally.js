// Tally — the hours and minutes scratched on a cell wall, four slots, no ROM.
//
//   正正正正下 . . . . . . . . . .      hours: 23 = four groups of five and three
//   正正正正正正正正正正正止 . . .      minutes: 59 = eleven groups and four
//
// Every cell is a CGRAM slot, the empty wall included, so the whole glass is
// four pictures: the wall, a finished group of five, the hours' unfinished
// group and the minutes'. That is the most a tally face can need: everything
// else repeats.
//
// The group is 正, the Chinese tally mark, written in its five strokes:
// top bar, the centre stroke down, the short bar to its right, the short left
// stroke, the bottom bar. It was meant to be the prison tally of four strokes
// and a diagonal, but that needs seven dot columns to keep its strokes apart
// and a cell has five; 正 fits the cell exactly and is a real tally, still
// used for counting in China. The same strokes partly done are the familiar
// part-marks: 一, 丅, 下, 止.
//
// Each new mark is scratched in when its minute (or hour) begins, a dot every
// 200 ms in stroke order, so it is drawn rather than appearing. When the count
// starts over, at the top of the hour for the minutes and at midnight for the
// hours, the wall is scrubbed clean from the newest mark back, a group every
// 200 ms. The bare wall carries two pits per cell, so the glass reads as
// stone; a cell with a mark in it is scratched smooth.

const FPS = 10;
const STEP = 0.2;                     // seconds per dot of a stroke, or per group wiped
const START = 0.3;                    // the scratching starts this far into the minute
const LEFT = 2;                       // first group's column, both rows

// The five strokes of 正, as [row, col] dots in the order they are scratched.
const STROKES = [
  [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]],                 // 一 top bar
  [[1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2]],         // 丨 centre, down
  [[3, 3], [3, 4]],                                         // short bar to the right
  [[4, 0], [5, 0], [6, 0]],                                 // short left stroke
  [[7, 0], [7, 1], [7, 2], [7, 3], [7, 4]],                 // 一 bottom bar
];
const PITS = [[2, 1], [5, 3]];        // the bare stone's pits

/** A tile with `n` whole strokes and the first `dots` dots of stroke n. */
function group(n, dots = 0) {
  const rows = Array(8).fill(0);
  const set = ([r, c]) => { rows[r] |= 0x10 >> c; };
  // Bare wall shows its pits. A scratched group does not: put in among the
  // strokes, the pits joined them up and the mark stopped reading as 正.
  if (n === 0 && dots === 0) PITS.forEach(set);
  STROKES.slice(0, n).forEach((s) => s.forEach(set));
  if (n < 5) STROKES[n].slice(0, dots).forEach(set);
  return rows;
}
const WALL = group(0), FULL = group(5);

/**
 * The tiles of one row, as a list of cell pictures from LEFT, for a count of
 * `now` strokes that was `before` a moment ago, `t` seconds into the minute.
 */
function row(now, before, t) {
  const cells = [];
  if (now > before) {
    // One more stroke: the old count whole, the new stroke scratching in.
    const k = now - 1, g = Math.floor(k / 5), s = k % 5;
    const dots = Math.max(0, Math.floor((t - START) / STEP) + 1);
    for (let i = 0; i < g; i++) cells.push(FULL);
    cells.push(dots >= STROKES[s].length && s === 4 ? FULL : group(s, Math.min(dots, STROKES[s].length)));
    return cells;
  }
  const n = now < before ? before : now;
  for (let i = 0; i < Math.floor(n / 5); i++) cells.push(FULL);
  if (n % 5) cells.push(group(n % 5));
  if (now < before) {
    // Starting over: scrub the groups away from the newest back.
    const gone = Math.max(0, Math.floor((t - START) / STEP) + 1);
    return cells.slice(0, Math.max(0, cells.length - gone));
  }
  return cells;
}

export default {
  name: 'Tally',
  blurb: 'Hours and minutes scratched on a stone wall in 正 tally marks, four slots and no factory character; each new mark is scratched in.',
  bus: 'i2c100',
  panel: 'gray',
  fps: FPS,
  romFree: true,

  frame(lcd, api, { fields, date, kit }) {
    const t = fields.s + fields.ms / 1000;
    const was = kit.clockFields(new Date(date.getTime() - 60000));
    // Only the first seconds of a minute move; after that the counts stand.
    const settled = t > 3;
    const rows = [
      row(fields.h, settled ? fields.h : was.h, t),
      row(fields.m, settled ? fields.m : was.m, t),
    ];

    // Slots: the wall, a full group, then whatever partial groups are up.
    const tiles = [WALL, FULL];
    const slot = (tile) => {
      const key = tile.join(',');
      let k = tiles.findIndex((x) => x.join(',') === key);
      if (k < 0) { k = tiles.length; tiles.push(tile); }
      return k;
    };
    const grid = rows.map((cells) => {
      const out = Array(16).fill(0);
      cells.forEach((tile, i) => { out[LEFT + i] = slot(tile); });
      return out;
    });
    tiles.forEach((tile, k) => lcd.defineChar(k, tile));
    grid.forEach((codes, r) => { lcd.setCursor(0, r); codes.forEach((c) => lcd.data(c)); });
  },
};
