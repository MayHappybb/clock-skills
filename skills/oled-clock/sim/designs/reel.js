// Reel — the 128x32's hidden half, used as the next card.
//
// A 128x32 module still has the controller's full 64 rows of RAM; only 32
// are on the glass. So the next minute is drawn, in advance, into the half
// nobody can see. At :59.4 the display start line (one command byte, 0x40|n)
// walks 32 rows and the whole face rolls up like a slot-machine reel, landing
// with a bounce exactly at :00. The roll moves no pixel data at all: each
// frame of it costs one byte on the bus, and it cannot tear.
//
// Which half is showing alternates with the minute, so the frame is still a
// function of the clock alone. The dirty-rectangle driver keeps the rest cheap:
// the seconds bar costs a byte or two a frame, and the hidden half is
// rewritten once a minute, out of sight.

import { strokeText, ease, progress } from '../js/kit.js';

const DIGIT = { w: 21, h: 25, weight: 4.4, gap: 4 };
const ROLL_START = 59.4;

/** One face: HH:MM, centred, with the seconds bar along the bottom. */
function face(g, top, f, sec) {
  const text = `${f.hh}:${f.mm}`;
  const width = 4 * DIGIT.w + 4 * DIGIT.gap + 5;
  strokeText(g, text, Math.round((128 - width) / 2), top + 1, { ...DIGIT, colonW: 5 });
  // Seconds: a bar that fills along the bottom edge, one pixel tall, with a
  // tick every 15 s so the quarter-minutes can be read at a glance.
  const fill = Math.floor((sec / 60) * 128);
  g.hline(0, top + 30, fill);
  for (let x = 0; x < 128; x += 32) g.pixel(x, top + 31);
  g.pixel(127, top + 31);
}

export default {
  name: 'Reel',
  blurb: '128x32: the next minute waits in the hidden half of RAM, then the face rolls up to it.',
  module: '091-128x32',
  colour: 'white',
  bus: 'i2c400',
  fps: 50,
  driver: 'dirty',
  ramPages: 8,          // draws all 64 rows of RAM, not just the 32 on the glass

  frame(g, { fields: f, date, kit, oled }) {
    const half = f.minuteKey % 2;           // which RAM half is showing this minute
    const next = kit.clockFields(new Date(date.getTime() + 60000));
    face(g, half * 32, f, f.sec);
    face(g, (1 - half) * 32, next, 0);

    const u = ease.outBounce(progress(f.sec, ROLL_START, 60));
    oled.startLine(half * 32 + Math.round(u * 32));
  },
};
