// Aurora — the time sits still while a heart monitor sweeps beneath it.
//
// Row one is stock ROM and never costs a CGRAM slot, which leaves all eight
// slots free for the bottom row. Eight tiles is exactly one 40x8 dot canvas, so
// the whole strip can be redrawn from scratch on every frame: it is a tiny
// framebuffer, not a set of characters.
//
// The trace is drawn the way a real monitor draws it: a write head sweeps left
// to right, leaving the waveform behind it, and erases a few columns just
// ahead. An earlier version scrolled the whole trace at 40 columns a second,
// which moves every dot every 25 ms. The glass takes 150 ms to switch, so on
// the real part that was a grey smear. Sweeping, each column changes once per
// pass and then holds, which the glass shows crisply.
//
// The beat is locked to the wall clock: one beat a second, the spike just
// after each second turns, two beats across the strip.

import { TileAllocator } from '../js/kit.js';

const W = 40;            // dot columns in the strip
const H = 8;
const SPEED = 20;        // columns per second: one sweep every two seconds
const ERASE = 3;         // blank columns ahead of the write head
const STRIP_COL = 4;     // leftmost cell of the strip

/** Trace height in dots (0 = bottom) for a beat phase in seconds, 0..1. */
function waveform(phase) {
  const u = phase * 40;
  const gauss = (centre, width) => Math.exp(-((u - centre) ** 2) / width);
  return 0.7 + 6.2 * gauss(4, 1.6) - 1.0 * gauss(1.8, 1.0) + 1.3 * gauss(12, 8);
}

/** Is dot (x, r) lit, with the head at `head` columns and wall-clock second `sec`? */
function lit(x, r, head, sec) {
  const behind = (head - x + W) % W;           // columns since the head passed x
  if (behind > W - ERASE) return false;        // just ahead of the head: erased
  const written = sec - behind / SPEED;        // when column x was drawn
  const phase = ((written % 1) + 1) % 1;
  const depth = H - 1 - r;
  // The trace is a line, not a filled area: light the dots between this
  // column's height and its neighbour's, so steep edges stay joined.
  const y = Math.round(waveform(phase));
  const yPrev = Math.round(waveform((((written - 1 / SPEED) % 1) + 1) % 1));
  return depth >= Math.min(y, yPrev) && depth <= Math.max(y, yPrev);
}

export default {
  name: 'Aurora',
  blurb: 'Stock-ROM time over a heart-monitor sweep, one beat a second, redrawn every frame from one CGRAM page.',
  bus: 'i2c100',
  panel: 'blue',
  fps: 20,

  frame(lcd, api, { fields }) {
    lcd.textAt(4, 0, `${fields.hh}:${fields.mm}:${fields.ss}`);

    const sec = fields.s + fields.ms / 1000;
    const head = (sec * SPEED) % W;
    const alloc = new TileAllocator(lcd, 0);
    const codes = [];
    for (let c = 0; c < 8; c++) {
      const tile = [];
      for (let r = 0; r < H; r++) {
        let line = '';
        for (let i = 0; i < 5; i++) line += lit(c * 5 + i, r, head, sec) ? '#' : '.';
        tile.push(line);
      }
      codes.push(alloc.add(tile));
    }
    alloc.flush();

    for (let c = 0; c < 8; c++) {
      lcd.setCursor(STRIP_COL + c, 1);
      lcd.data(codes[c] ?? 0x20);
    }
  },
};
