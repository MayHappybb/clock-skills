// Tape — a measuring tape of the day, read under a hairline.
//
// The bottom half of the 128x32 bar is a ruler of the whole day: a tick
// every minute, taller ones every five and at the hour, standing on a common
// foot like a rule's graduations, and a label under every fifth minute:
// "10:05" in the 3x5, the hours "11:00" in the larger 5x7, the way a tape
// sets its feet apart from its inches. The ruler slides right to left past a
// fixed hairline at the centre, continuously: its offset is the time of day
// in minutes, seconds as the fraction, times PPM (6) pixels per minute, so it
// creeps one pixel every ten seconds. The graduation under the hairline is
// the time; at 10:09:40 the hairline stands two thirds of the way from the
// 10:09 tick to the 10:10 one.
//
// Above it, the big readout, for reading across the room. The hairline drops
// from the readout's colon, so the colon's lower dot is the head of the
// cursor pin: the reading and the instrument are one shape. The day and date
// sit at the left, the seconds at the right. The digits are counter wheels:
// the ones about to change roll up in the last half second of the minute and
// land on :00; the seconds roll in the last quarter of each second.
//
// Everything is derived from the clock: the tape from h*60 + m + sec/60, each
// label from the minute its tick stands for (wrapping at midnight), the rolls
// from fields.sec and fields.ms against the next minute's fields.
//
// Burn-in: the colon and the hairline would be lit all day, so the whole face
// walks an orbit (2 pixels across, 1 down); the ruler is drawn relative to
// the hairline, so the reading stays exact wherever it is. From 23:00 to
// 07:00 (ctx.night) the panel dims through oled.contrast(), faded over a minute.
//
// The hardware scroll is not used: it moves pixels at a rate set by the
// panel's oscillator (not by the clock), wraps the band as a 128-pixel ring
// (a day-long ruler is not periodic) and forbids RAM writes while it runs, so
// the readout could not change. Drawn in software the ruler costs a page of
// bytes once every ten seconds with the dirty driver.

import { strokeText, font3x5, font5x7, orbit, sprite, clamp, OFF } from '../js/kit.js';

// The 5x7 is the HD44780 ROM, whose zero is slashed; a plain oval zero
// suits an instrument dial better, so swap that one glyph.
const ZERO = sprite(`
  .###.
  #...#
  #...#
  #...#
  #...#
  #...#
  .###.
`);
const font5 = { ...font5x7, glyph: (ch) => (ch === '0' ? ZERO : font5x7.glyph(ch)) };

const PPM = 6;                 // tape pixels per minute
const HAIR = 63;               // hairline column, before the orbit
const DIGIT = { w: 12, h: 15, weight: 2.8, gap: 3, colonW: 3 };
const TAPE_Y = 17;             // top of the tape (tick roots), before the orbit

const DAY_CONTRAST = 0x8f, NIGHT_CONTRAST = 0x0c;


const two = (n) => String(n).padStart(2, '0');

function drawTape(g, hair, ty, now) {
  // Minutes on screen: whatever lands within the canvas.
  const first = Math.floor(now - (hair + 20) / PPM), last = Math.ceil(now + (128 - hair + 20) / PPM);
  for (let v = first; v <= last; v++) {
    const x = Math.floor(hair + 0.5 + (v - now) * PPM);
    const mins = ((v % 1440) + 1440) % 1440;
    const h = Math.floor(mins / 60), m = mins % 60;
    const len = m === 0 ? 6 : m % 5 === 0 ? 4 : 2;
    g.vline(x, ty + 6 - len, len);
    if (m % 5 === 0) {
      // Hours in the 5x7, the five minutes in the 3x5: the hierarchy a real
      // tape has between its feet and its inches.
      const label = `${two(h)}:${two(m)}`;
      const font = m === 0 ? font5 : font3x5;
      const w = font.measure(label);
      g.text(label, x - Math.floor(w / 2), ty + (m === 0 ? 7 : 8), { font });
    }
  }
}

/**
 * A string drawn as counter wheels: each character of `now` that differs
 * from `was` rolls up, the old one leaving through the top of its cell
 * while the new one rises from below; `u` 0 shows `was`, 1 shows `now`. `draw(ch, x, y)` draws one character; `cells` gives
 * each character's [x, width]; the cells are `h` tall from `y`.
 */
function rollText(g, now, was, u, y, h, cells, draw) {
  if (u <= 0) now = was;
  for (let i = 0; i < now.length; i++) {
    const [x, w] = cells[i];
    if (now[i] === was[i] || u >= 1) { draw(now[i], x, y); continue; }
    const k = Math.round((h + 2) * u);
    g.clip(x - 1, y, w + 2, h);
    draw(was[i], x, y - k);
    draw(now[i], x, y + h + 2 - k);
    g.unclip();
  }
}

/** Cell positions of "HH:MM" in the stroke digits, from x0. */
function readoutCells(x0) {
  const { w, gap, colonW } = DIGIT, cells = [];
  let x = x0;
  for (const ch of 'HH:MM') {
    const cw = ch === ':' ? colonW : w;
    cells.push([x, cw]);
    x += cw + gap;
  }
  return cells;
}

const easeInOut = (u) => (u < 0.5 ? 4 * u ** 3 : 1 - (-2 * u + 2) ** 3 / 2);

export default {
  name: 'Tape',
  blurb: '128x32: a ruler of the whole day slides under a hairline that drops from the colon.',
  module: '091-128x32',
  colour: 'white',
  bus: 'i2c400',
  fps: 50,
  driver: 'dirty',

  frame(g, { fields: f, date, kit, oled, night }) {
    const ox = orbit(date, 2, 3)[0], oy = orbit(date, 1, 4)[1];
    const hair = HAIR + ox, top = 1 + oy;
    const now = f.h * 60 + f.m + f.sec / 60;

    const ty = TAPE_Y + oy;
    drawTape(g, hair, ty, now);

    // Readout, centred so the colon sits on the hairline. Before the minute
    // the digits that are about to change roll like a counter's wheels,
    // landing exactly on :00.
    const next = kit.clockFields(new Date(date.getTime() + 60000));
    const x0 = hair - (2 * DIGIT.w + 2 * DIGIT.gap + 1);
    rollText(g, `${next.hh}:${next.mm}`, `${f.hh}:${f.mm}`, easeInOut(clamp((f.sec - 59.5) / 0.5, 0, 1)),
      top, DIGIT.h, readoutCells(x0),
      (ch, x, y) => strokeText(g, ch, x, y, DIGIT));

    // Day and date at the left; seconds at the right, a smaller counter
    // whose wheels roll every second.
    g.text(f.dow, 2 + ox, top, { font: font5 });
    g.text(f.dd, 2 + ox, top + 8, { font: font5 });
    const nextS = String((f.s + 1) % 60).padStart(2, '0');
    rollText(g, nextS, f.ss, easeInOut(clamp((f.ms - 750) / 250, 0, 1)), top + 8, 7,
      [[115 + ox, 5], [121 + ox, 5]], (ch, x, y) => g.text(ch, x, y, { font: font5 }));

    // The hairline, from just under the colon down through the ticks, on
    // dark keylines so the ticks it crosses do not merge with it. It stops
    // above the labels, so the one under it stays readable.
    const hy = top + 12, hl = ty + 7 - hy;
    g.fillRect(hair - 1, hy, 3, hl, OFF);
    g.vline(hair, hy, hl);
    oled.contrast(DAY_CONTRAST + (NIGHT_CONTRAST - DAY_CONTRAST) * night);
  },
};
