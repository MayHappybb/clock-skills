// Soroban — the time set on a Japanese abacus, the beads sliding as it turns.
//
// Four rods, hours and minutes, in a frame. Each rod has one heaven bead
// above the beam, worth five when it is down against it, and four earth beads
// below, worth one each when pushed up. So a 7 is the heaven bead down and two
// earth beads up. When a digit changes, its beads slide to their new places,
// one dot row per 150 ms step, all of them together.
//
// Each rod is a 5x16 picture, two tiles, so four rods are eight at most;
// digits that repeat share them. The beam is on dot row 3 so that between the
// hour and minute rods it continues as ROM 0xb0, the long-vowel mark, which
// is a full-width bar on that same row. The frame ends are ROM blocks. The
// label (ソロバン, in the ROM's katakana) and the time beside it are free.

import { clamp } from '../js/kit.js';

const RODS = [2, 3, 5, 6];            // cells; 4 is the gap between hours and minutes
const FRAME = [1, 7], GAP = 4, LABEL = 9;
const STEP = 0.15;                    // seconds per dot row of travel

// Rows on the 16-row rod. A bead is two rows: wide on top, narrower below,
// so a stack of them still reads as separate beads.
const BEAD = ['#####', '.###.'];
const ROD = '..#..', BEAM = '#####';
const BEAM_ROW = 3;
const HEAVEN = { up: 0, down: 1 };    // top row of the heaven bead
/** Top row of earth bead k (0 nearest the beam) for a digit's earth count. */
const earthTop = (k, n) => (k < n ? 4 + 2 * k : 8 + 2 * k);

/** Bead top rows for a digit: [heaven, earth0..earth3]. */
function beads(d) {
  const n = d % 5;
  return [d >= 5 ? HEAVEN.down : HEAVEN.up, ...[0, 1, 2, 3].map((k) => earthTop(k, n))];
}

/** The rod as 16 rows, with beads at the given top rows. */
function rod(tops) {
  const rows = Array(16).fill(ROD);
  rows[BEAM_ROW] = BEAM;
  for (const top of tops) { rows[top] = BEAD[0]; rows[top + 1] = BEAD[1]; }
  return [rows.slice(0, 8), rows.slice(8)];
}

/** Bead positions part way through a change from `a` to `b`: whole rows, all moving together. */
function sliding(a, b, t) {
  const from = beads(a), to = beads(b);
  const rowsMoved = Math.floor(t / STEP);
  return from.map((y, i) => {
    const dist = to[i] - y;
    return y + Math.sign(dist) * Math.min(Math.abs(dist), rowsMoved);
  });
}

export default {
  name: 'Soroban',
  blurb: 'The time set on a soroban, a heaven bead and four earth beads per rod, sliding when the minute turns.',
  bus: 'i2c100',
  panel: 'amber',
  fps: 12,

  frame(lcd, api, { fields, date, kit }) {
    const sec = fields.s + fields.ms / 1000;
    const was = kit.clockFields(new Date(date.getTime() - 60000));
    const now = fields.hh + fields.mm, before = was.hh + was.mm;

    // Settle the rods first so repeated digits share tiles, then allocate.
    const alloc = new kit.TileAllocator(lcd, 0);
    const codes = [...now].map((d, i) => {
      const tops = sliding(Number(before[i]), Number(d), clamp(sec, 0, 10));
      return rod(tops).map((half) => alloc.add(half));
    });
    alloc.flush();

    const top = Array(16).fill(0x20), bottom = Array(16).fill(0x20);
    for (const c of FRAME) { top[c] = 0xff; bottom[c] = 0xff; }
    top[GAP] = 0xb0;
    RODS.forEach((c, i) => { top[c] = codes[i][0]; bottom[c] = codes[i][1]; });

    // The label, in the ROM's katakana: ソ ロ ハ ゛ ン, and the time it shows.
    [0xbf, 0xdb, 0xca, 0xde, 0xdd].forEach((code, i) => { top[LABEL + i] = code; });
    [...`${fields.hh}:${fields.mm}`].forEach((ch, i) => { bottom[LABEL + i] = ch.charCodeAt(0); });

    lcd.setCursor(0, 0); top.forEach((c) => lcd.data(c));
    lcd.setCursor(0, 1); bottom.forEach((c) => lcd.data(c));
  },
};
