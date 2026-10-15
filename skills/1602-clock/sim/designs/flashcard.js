// Flashcard — one custom character, shown 32 times, and nothing else.
//
// Every cell on the glass holds code 0, so the whole display is thirty-two
// copies of a single 5x8 picture. The time is told as a deck of flash cards,
// one card at a time: the glass fills with the first hour digit, then the
// second, then a colon, then the two minute digits, then a field of dots
// that says "start again". A digit repeated across 32 cells reads from the
// far side of a room.
//
//   0.0-0.9 s  hours, tens        3.1-4.0 s  minutes, tens
//   1.1-2.0 s  hours, ones        4.2-5.1 s  minutes, ones
//   2.2-2.9 s  the colon          5.1-6.0 s  rest: one dot per cell
//
// Minute cards are underlined on the eighth dot row (the cursor line, which
// no ROM glyph can light), so 12 and 12 are never the same card: the glass
// shows ruled lines under every minute digit. Between cards the glass goes
// dark for 200 ms, so a repeated digit (11:11) is seen as two cards. Each card
// holds 700-900 ms, five or six times the glass's 150 ms switching time.
// The deck is six seconds long and starts on a multiple of six, so it never
// straddles a minute.
//
// No factory character appears, not even the space: the dark gaps are the
// same slot redrawn blank. The digits are the squared 5x7 face of `slab`'s
// seconds, two-dot verticals, which is the boldest a 5-wide digit gets.
//
// A frame is one CGRAM page write (8 bytes) and the 32 cell codes.

import { SECONDS } from '../js/blockface.js';

const DECK = 6;                                       // seconds per pass through the cards
const BLANK = Array(8).fill('.....');
const COLON = ['.....', '.###.', '.###.', '.....', '.....', '.###.', '.###.', '.....'];
const REST = ['.....', '.....', '.....', '..#..', '.....', '.....', '.....', '.....'];
const UNDERLINE = '#####';

/** The card on show at second `u` of the deck, for the time in `fields`. */
function card(u, fields) {
  const digit = (d, underlined) => {
    const rows = [...SECONDS[d]];
    if (underlined) rows[7] = UNDERLINE;
    return rows;
  };
  const steps = [
    [0.9, () => digit(fields.hh[0], false)],
    [1.1, () => BLANK],
    [2.0, () => digit(fields.hh[1], false)],
    [2.2, () => BLANK],
    [2.9, () => COLON],
    [3.1, () => BLANK],
    [4.0, () => digit(fields.mm[0], true)],
    [4.2, () => BLANK],
    [5.1, () => digit(fields.mm[1], true)],
    [DECK, () => REST],
  ];
  return steps.find(([end]) => u < end)[1]();
}

export default {
  name: 'Flashcard',
  blurb: 'One custom character, 32 copies: the glass flashes each digit of the time in turn, minutes underlined.',
  bus: 'i2c100',
  panel: 'blue',
  fps: 10,
  romFree: true,

  frame(lcd, api, { fields }) {
    const sec = fields.s + fields.ms / 1000;
    lcd.defineChar(0, card(sec % DECK, fields));
    for (const row of [0, 1]) {
      lcd.setCursor(0, row);
      for (let c = 0; c < 16; c++) lcd.data(0);
    }
  },
};
