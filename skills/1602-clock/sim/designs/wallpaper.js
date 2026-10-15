// Wallpaper — the time as a woven pattern, one custom character tiled 32 times.
//
// The single 5x8 picture is a tiny BCD clock, and every cell shows it, so at
// a glance the glass is a textile: stripes and stitches repeating across it.
// Up close each cell reads as the time. The pattern changes once a minute.
//
// The code, per cell:
//
//   column  0      1      2       3      4
//           hours  hours  spine   mins   mins
//           tens   ones           tens   ones
//
//   rows 0-1  worth 8   Each digit is binary, read bottom up: a pair of
//   rows 2-3  worth 4   dots in rows 6-7 is 1, rows 4-5 is 2, rows 2-3 is 4,
//   rows 4-5  worth 2   rows 0-1 is 8. Bits are two dots tall so they read
//   rows 6-7  worth 1   as stitches; the spine is single dots on the odd
//                       rows, a lighter thread between hours and minutes.
//
//   10:09    ....#   row 0     column 0 is 1: rows 6-7
//            ..#.#   row 1     column 1 is 0: empty
//            .....   row 2     column 3 is 0: empty
//            ..#..   row 3     column 4 is 9 = 8 + 1: rows 0-1 and 6-7
//            .....   row 4
//            ..#..   row 5
//            #...#   row 6
//            #.#.#   row 7
//
// The seconds are the hardware cursor, which is not a ROM character: an
// underline on the cursor row that walks the cells two seconds at a time,
// left to right along the top row (:00-:31) and on along the bottom
// (:32-:59). A steady underline merges with the bottom bits of the pattern
// and is easy to lose, so the design switches it on for the first half of
// each second and off for the second: it ticks, and the movement finds the
// eye. Every state holds 500 ms. The controller's own blinking block would
// be bolder, but it blinks at its own rate (about 0.4 s a phase), not the
// clock's.
//
// A first draft put the bits one dot tall; tiled, the eye could not tell a
// bit from the spine. Two-dot bits and a one-dot spine keep the threads apart.
//
// A frame is one CGRAM page (8 bytes), the 32 cell codes and a cursor move.

const BITS = [8, 4, 2, 1];                       // top to bottom: rows 0-1, 2-3, 4-5, 6-7
const SPINE = [1, 3, 5, 7];                      // rows of the single-dot spine, column 2

/** The 5x8 BCD picture for HH:MM. */
function weave(fields) {
  const digits = { 0: +fields.hh[0], 1: +fields.hh[1], 3: +fields.mm[0], 4: +fields.mm[1] };
  return Array.from({ length: 8 }, (_, r) => {
    let line = '';
    for (let c = 0; c < 5; c++) {
      if (c === 2) line += SPINE.includes(r) ? '#' : '.';
      else line += digits[c] & BITS[r >> 1] ? '#' : '.';
    }
    return line;
  });
}

export default {
  name: 'Wallpaper',
  blurb: 'A 5x8 BCD clock tiled 32 times into a woven pattern; a ticking cursor walks the cells as the seconds.',
  bus: 'i2c100',
  panel: 'amber',
  fps: 4,               // 250 ms frames: the tick changes on the half second
  romFree: true,

  frame(lcd, api, { fields }) {
    lcd.defineChar(0, weave(fields));
    for (const row of [0, 1]) {
      lcd.setCursor(0, row);
      for (let c = 0; c < 16; c++) lcd.data(0);
    }
    // The underline on for the first half of each second (display on, cursor
    // on) and off for the second (display on); then park the address counter
    // on the seconds' cell, which is where the cursor shows.
    const cell = Math.floor(fields.s / 2);
    lcd.command(fields.ms < 500 ? 0x0e : 0x0c);
    lcd.setCursor(cell % 16, Math.floor(cell / 16));
  },
};
