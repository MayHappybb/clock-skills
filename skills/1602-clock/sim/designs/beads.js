// Beads — an abacus of two wires, made of two custom characters.
//
// Every cell is one of two pictures: a bead, or bare wire. Nothing else is on
// the glass, not even a factory space. Each row is a wire with beads on it,
// pushed to the left to count, and the run of bare wire between the two
// groups is what makes the count readable.
//
//   top wire     12 beads, a gap of 4: the beads left of the gap are the
//                hour, 1-12. The gap is a window that walks right through
//                the day, like an hour hand.
//   bottom wire  11 beads, a gap of 5: the beads left of the gap count the
//                five minutes past the hour (0-11). The cursor, an underline
//                that is not a ROM character, sits under the gap's cell for
//                the minutes in between (0-4), so it walks across the gap,
//                and when it reaches the far side a bead follows it over.
//
//   10:37   ●●●●●●●●●●────●●       ten beads left of the gap
//           ●●●●●●●─────●●●●       seven fives, and the cursor 2 along: 37
//
// The seconds: the wire is one tile shared by every bare cell, so it can be
// plucked. For the first half of each second it bows, a dot up in the middle
// of each cell, all along both wires at once, and then it is straight again.
//
// A binary layout was the first plan and was dropped on paper: with two
// pictures and no factory space there is no separator, so every cell is a
// bit and no group can be told from its neighbour. Counting beads needs no
// separator; the bare wire between the groups is the separator.
//
// When a count changes, the bead (or, at the hour's wrap, the whole group)
// slides along the wire a cell at a time, 200 ms a cell. Every moving bead
// travels the same distance in the same direction, so they never cross.
//
// A frame is two CGRAM pages (16 bytes), the 32 cell codes and a cursor move.

const BEAD = ['.....', '.###.', '#####', '#####', '#####', '#####', '.###.', '.....'];
const WIRE = ['.....', '.....', '.....', '#####', '.....', '.....', '.....', '.....'];
const PLUCKED = ['.....', '.....', '..#..', '##.##', '.....', '.....', '.....', '.....'];
const BEAD_SLOT = 0, WIRE_SLOT = 1;

const WIRES = [
  { beads: 12, gap: 4 },                        // hours, 1-12
  { beads: 11, gap: 5 },                        // fives of minutes, 0-11
];
const STEP = 0.2;                               // seconds a sliding bead takes per cell

/** Cells holding a bead when `count` beads are pushed left. */
function rest(count, { beads, gap }) {
  return Array.from({ length: beads }, (_, k) => (k < count ? k : k + gap));
}

/** Bead cells part way from `from` to `to`, after `t` seconds of sliding. */
function sliding(from, to, wire, t) {
  const a = rest(from, wire), b = rest(to, wire);
  const moved = Math.floor(t / STEP);
  return a.map((x, k) => x + Math.sign(b[k] - x) * Math.min(Math.abs(b[k] - x), moved));
}

export default {
  name: 'Beads',
  blurb: 'Two wires of beads, two custom characters: the hour and the fives of minutes, the cursor for the rest.',
  bus: 'i2c100',
  panel: 'gray',
  fps: 10,
  romFree: true,

  frame(lcd, api, { fields, date, kit }) {
    const sec = fields.s + fields.ms / 1000;
    const was = kit.clockFields(new Date(date.getTime() - 60000));
    const h12 = (h) => h % 12 || 12;

    // Each wire slides only in the first seconds of the minute its count changed.
    const counts = [
      [h12(was.h), h12(fields.h)],
      [Math.floor(was.m / 5), Math.floor(fields.m / 5)],
    ];
    const cells = counts.map(([from, to], i) => new Set(
      from === to ? rest(to, WIRES[i]) : sliding(from, to, WIRES[i], sec)));

    lcd.defineChar(BEAD_SLOT, BEAD);
    lcd.defineChar(WIRE_SLOT, sec % 1 < 0.5 ? PLUCKED : WIRE);
    cells.forEach((beads, row) => {
      lcd.setCursor(0, row);
      for (let c = 0; c < 16; c++) lcd.data(beads.has(c) ? BEAD_SLOT : WIRE_SLOT);
    });

    // The minutes past the five: an underline cursor in the bottom gap.
    lcd.command(0x0e);
    lcd.setCursor(counts[1][1] + (fields.m % 5), 1);
  },
};
