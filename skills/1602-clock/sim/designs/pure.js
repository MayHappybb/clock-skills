// Pure — full-height block digits in the rain, and no factory character on
// the glass.
//
// The digits are the simple kit of parts from `hourglass`: top, top+middle
// and bottom bars, a solid block, a blank. With ROM out of bounds the solid
// block and the blank are slots like the bars, so four digits cost the set of
// parts they use: three to five, five for most of the day, never more.
// Nothing else gets a slot. The separator between hours and minutes is the
// controller's own underline cursor, which is not a character at all: put in
// the top row's bottom dot row it sits at the exact middle of the digits'
// height, a dash that blinks once a second, for free.
//
// The blank slot is not blank. It is the rain: two drops per cell, a row
// every 200 ms, so every empty cell on the glass, and the empty part of every
// bar, carries the same drizzle in step. Under the glass's lag a falling dot
// leaves a short streak, which is what rain looks like.
//
// On the minute, lightning: the whole glass goes negative twice, 250 ms and
// then 350 ms with a beat between. Every slot is written inverted, so the sky
// lights up and the digits stand in it as dark silhouettes, rain and all.
// ROM text can never do this; it is the one thing a design that owns every
// cell gets for nothing. As a picture the negative is a flash, not a reading:
// the digits fill thirteen of the sixteen columns, so the lit sky is mostly
// their own counters, and the unlit strokes run into the unlit cell gaps.
// It was tried as a 0.6 s single inversion first and read as a glitch; as a
// double flicker over the rain it reads as weather.

const FPS = 10;
const STEP = 0.2;                     // seconds per row of rain
// Lightning on the minute: negative, back, negative again, each long enough
// for the glass to show it.
const FLASH = [[0.1, 0.35], [0.55, 0.9]];

const BARS = {
  T: [0, 1, 2],
  M: [0, 1, 2, 5, 6, 7],
  B: [5, 6, 7],
};
const DIGITS = {
  0: ['#T#', '#B#'],
  1: ['T# ', 'B#B'],
  2: ['MM#', '#BB'],
  3: ['MM#', 'BB#'],
  4: ['#B#', '  #'],
  5: ['#MM', 'BB#'],
  6: ['#MM', '#B#'],
  7: ['TT#', '  #'],
  8: ['#M#', '#B#'],
  9: ['#M#', 'BB#'],
};
const DIGIT_COLS = [1, 4, 8, 11];
const SEP_COL = 7;

// The rain: two-dot streaks in columns 1 and 3, half a cell out of phase. A
// streak falls a row every STEP and wraps, so it reappears at the top of its
// cell, which on the glass reads as the next drop coming down.
const DROPS = [{ col: 1, phase: 0 }, { col: 3, phase: 4 }];

/** Row bytes of the rain at `step` (bit 4 = leftmost dot). */
function rain(step) {
  const rows = Array(8).fill(0);
  for (const d of DROPS) {
    rows[(step + d.phase) % 8] |= 0x10 >> d.col;          // the drop
    rows[(step + d.phase + 7) % 8] |= 0x10 >> d.col;      // and the streak above it
  }
  return rows;
}

/** A part over the rain: bars lit, the rain showing through the rest. */
function part(name, rainRows) {
  if (name === '#') return Array(8).fill(0x1f);
  const lit = name === ' ' ? [] : BARS[name];
  return rainRows.map((b, r) => (lit.includes(r) ? 0x1f : b));
}

export default {
  name: 'Pure',
  blurb: 'Block digits in the rain with no factory character on the glass; on the minute the whole screen goes negative.',
  bus: 'i2c100',
  panel: 'gray',
  fps: FPS,
  romFree: true,

  frame(lcd, api, { t, fields }) {
    const sec = fields.s + fields.ms / 1000;
    const step = Math.floor(t / STEP);
    const negative = FLASH.some(([a, b]) => sec >= a && sec < b);
    const rainRows = rain(step);

    // Slots in order of first use; the blank (rain) is always one of them.
    const slots = [];
    const slotOf = (name) => {
      let k = slots.indexOf(name);
      if (k < 0) { k = slots.length; slots.push(name); }
      return k;
    };
    const blank = slotOf(' ');
    const grid = [Array(16).fill(blank), Array(16).fill(blank)];
    [fields.hh[0], fields.hh[1], fields.mm[0], fields.mm[1]].forEach((d, k) => {
      DIGITS[d].forEach((parts, row) => [...parts].forEach((p, i) => { grid[row][DIGIT_COLS[k] + i] = slotOf(p); }));
    });

    slots.forEach((name, k) => {
      const rows = part(name, rainRows).map((b) => (negative ? b ^ 0x1f : b));
      lcd.defineChar(k, rows);
    });
    grid.forEach((row, r) => { lcd.setCursor(0, r); row.forEach((c) => lcd.data(c)); });

    // The separator: the underline cursor under the top row, lit for the
    // first half of each second.
    const on = fields.ms < 500;
    lcd.setCursor(SEP_COL, 0);
    lcd.command(on ? 0x0e : 0x0c);
  },
};
