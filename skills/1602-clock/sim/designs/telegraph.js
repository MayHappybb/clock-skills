// Telegraph — the clock sends itself the time in Morse, and prints it.
//
//   ▬▬▬ · ▬▬▬ ▬▬▬    ·  ■     the tape, and the key lamp at the right end
//   10:09 WED 01 OCT          the receiver's print-out
//
// At :00 the key sends the minutes (the hour too, on the hour), at :30 the
// date. The marks are inked at
// the right end of the paper tape and scroll off to the left, one Morse unit
// per cell, a dit one cell and a dah three, at standard spacing. The lamp in
// the last cell lights while the key is down. Underneath, each character is
// printed into place the moment its last element has been received. When a
// message starts, the field it will fill is cleared to underscores, so the
// print-out is never a mix of old and new: 10:09 becomes 10:__, 10:1_, 10:10,
// never 10:19.
//
// One unit lasts 200 ms (6 words a minute): the tape and the lamp change no
// faster than the glass can show. The minutes take 6-8 s to send, a whole
// time about 17 s, the date about 21 s.
//
// Two tiles: a dah cell is a bar the full width of the cell, so three of them
// join into one long mark across the cell gaps; a dit is a short one. The
// print-out and the lamp are ROM.

const UNIT = 0.2;
const TAPE = 15;                         // tape cells, 0..14; the lamp is cell 15
const LAMP_ON = 0xff, LAMP_OFF = 0xdb;   // solid block, hollow box

const DIT = ['.....', '.....', '.....', '.###.', '.###.', '.....', '.....', '.....'];
const DAH = ['.....', '.....', '.....', '#####', '#####', '.....', '.....', '.....'];
const DIT_SLOT = 0, DAH_SLOT = 1;

const MORSE = {
  0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-', 5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.',
  A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---', K: '-.-',
  L: '.-..', M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-',
  W: '.--', X: '-..-', Y: '-.--', Z: '--..',
};

/**
 * A message as Morse units. `text` is what is sent and `cols` where each
 * character prints; a space is a word gap. Returns the units (0 = gap,
 * 'dit', or 'dah') and when each character is complete.
 */
function encode(text, cols) {
  const units = [], printed = [];
  [...text].forEach((ch, k) => {
    if (ch === ' ') { units.push(0, 0, 0, 0, 0, 0, 0); return; } // a word gap: 7 units
    if (k > 0 && text[k - 1] !== ' ') units.push(0, 0, 0);       // a letter gap: 3 units
    [...MORSE[ch]].forEach((el, i) => {
      if (i > 0) units.push(0);
      if (el === '.') units.push('dit'); else units.push('dah', 'dah', 'dah');
    });
    printed.push({ ch, col: cols[k], at: units.length });
  });
  return { units, printed };
}

/** The print-out: time, then date, exactly 16 characters. */
const printout = (f) => `${f.hh}:${f.mm} ${f.dow} ${f.dd} ${f.month}`;

/** The two transmissions of a minute, and where each character prints. */
function messages(f) {
  const time = f.m === 0
    ? encode(`${f.hh} ${f.mm}`, [0, 1, null, 3, 4])
    : encode(f.mm, [3, 4]);
  return [
    { start: 0.4, ...time },
    { start: 30.4, ...encode(`${f.dow} ${f.dd} ${f.month}`, [6, 7, 8, null, 10, 11, null, 13, 14, 15]) },
  ];
}

export default {
  name: 'Telegraph',
  blurb: 'Sends itself the time in Morse at :00 and the date at :30, on a scrolling paper tape, and prints what it receives.',
  bus: 'i2c100',
  panel: 'amber',
  fps: 10,

  frame(lcd, api, { fields, date, kit }) {
    const sec = fields.s + fields.ms / 1000;
    lcd.defineChar(DIT_SLOT, DIT);
    lcd.defineChar(DAH_SLOT, DAH);

    // The print-out starts as last minute left it: its time and its date.
    const line = [...printout(kit.clockFields(new Date(date.getTime() - 60000)))];

    const tape = Array(TAPE).fill(0x20);
    let lamp = LAMP_OFF;
    for (const msg of messages(fields)) {
      const t = sec - msg.start;
      if (t < 0) continue;
      const u = Math.floor(t / UNIT);                 // units sent so far
      for (const p of msg.printed) if (p.col !== null) line[p.col] = u >= p.at ? p.ch : '_';
      // The tape: the newest unit at the right end, older ones to the left,
      // until the message has run off the end.
      for (let c = 0; c < TAPE; c++) {
        const k = u - (TAPE - 1 - c);
        const el = k >= 0 && k < msg.units.length ? msg.units[k] : 0;
        if (el === 'dit') tape[c] = DIT_SLOT;
        else if (el === 'dah') tape[c] = DAH_SLOT;
      }
      if (msg.units[u]) lamp = LAMP_ON;
    }

    lcd.setCursor(0, 0);
    tape.forEach((c) => lcd.data(c));
    lcd.data(lamp);
    lcd.textAt(0, 1, line.join(''));
  },
};
