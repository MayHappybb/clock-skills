// Moon — the clock shows the sky, and the sky shows tonight's moon.
//
// The left four cells are one 20x16-dot canvas holding the real Moon at its
// true phase for the date: the sunlit limb solid, the terminator an ellipse
// with the semi-axis the phase angle gives it, the night side faint with
// earthshine, and stars scattered round it. It is drawn in millimetres off the
// module's real dot pitch, the way `dial` is, so it comes out round rather than
// a tall oval with a kink at each cell seam.
//
// The phase is computed from the Julian date against a known new moon, so it
// is right for any day it is switched on, not just the one it was written on.
// A waning gibbous like tonight's is not a picture anyone draws by hand.
//
// The whole canvas is redrawn every frame, which is what lets the stars
// twinkle. Only the cells with something in them take a CGRAM slot, so the
// empty corners of the canvas are free.

import { TileAllocator, smoothNoise } from '../js/kit.js';
import { MODULE } from '../js/panel.js';

const CANVAS_COLS = 4;                 // cells the canvas spans, left of the text
const REF_NEW = 2451550.2597;          // Julian date of the new moon of 2000-01-06 18:14 UTC
const SYNODIC = 29.530588853;          // mean synodic month, days

/** Phase 0..1 (0 new, 0.5 full) for a moment. */
function moonPhase(date) {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const p = ((jd - REF_NEW) / SYNODIC) % 1;
  return p < 0 ? p + 1 : p;
}

const PHASE_NAME = (p) => {
  if (p < 0.03 || p > 0.97) return 'NEW';
  if (p < 0.25) return 'WAXING';
  if (p < 0.5) return 'WAXING';
  if (p < 0.53) return 'FULL';
  if (p < 0.75) return 'WANING';
  return 'WANING';
};

// Real centre of every dot of the canvas, in mm, gaps included.
const DOTS = [];
for (let row = 0; row < 2; row++)
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < CANVAS_COLS; c++)
      for (let i = 0; i < 5; i++)
        DOTS.push({
          c, row, i, r,
          x: c * MODULE.charPitchX + i * MODULE.dotPitchX,
          y: row * MODULE.charPitchY + r * MODULE.dotPitchY,
        });

// Put the centre on a real dot, near the middle of the canvas.
const CANVAS_CX = (MODULE.charPitchX * (CANVAS_COLS - 1) + MODULE.dotPitchX * 4) / 2;
const CANVAS_CY = (MODULE.charPitchY + MODULE.dotPitchY * 7) / 2;
const CENTRE = DOTS.reduce((best, d) =>
  Math.hypot(d.x - CANVAS_CX, d.y - CANVAS_CY) < Math.hypot(best.x - CANVAS_CX, best.y - CANVAS_CY) ? d : best);
const R = 4.9;                          // the Moon's radius, in mm

/** The stars: fixed dots clear of the Moon, each with its own twinkle. */
const STARS = DOTS
  .map((d, idx) => ({ d, idx, dist: Math.hypot(d.x - CENTRE.x, d.y - CENTRE.y) }))
  .filter(({ d, dist }) => dist > R + 0.6 && smoothNoise(d.x * 3.1 + d.y * 5.7, 7) < 0.15)
  .map(({ d, idx }) => ({ ...d, phase: smoothNoise(idx, 2) * 12, period: 2.2 + smoothNoise(idx, 9) * 3 }));

/**
 * Is dot `d` lit at phase `p`? Inside the disc the terminator is the ellipse
 * whose horizontal semi-axis is R times the cosine of the phase angle, and the
 * lit side is the right one while the Moon waxes, the left one while it wanes.
 * The dark side is a checkerboard: it reads as a soft grey, and it is what
 * makes the whole circle visible on a night when only a limb is lit.
 */
function litDot(d, k, waxing) {
  const X = (d.x - CENTRE.x) / R, Y = (d.y - CENTRE.y) / R;
  if (X * X + Y * Y > 1) return false;
  const term = (1 - 2 * k) * Math.sqrt(Math.max(0, 1 - Y * Y));
  if (waxing ? X >= term : X <= -term) return true;
  return (d.i + d.r + d.c * 5 + d.row * 8) % 2 === 0;
}

export default {
  name: 'Moon',
  blurb: 'Tonight\'s real Moon, drawn at its true phase with a terminator ellipse, stars twinkling and earthshine on the dark limb.',
  bus: 'i2c100',
  panel: 'blue',
  fps: 10,

  frame(lcd, api, { t, fields, date }) {
    const p = moonPhase(date);
    const k = (1 - Math.cos(2 * Math.PI * p)) / 2;
    const waxing = p < 0.5;
    const on = new Set(STARS
      .filter((s) => smoothNoise(t / s.period + s.phase, 11) > 0.45)
      .map((s) => `${s.c},${s.row},${s.i},${s.r}`));

    const alloc = new TileAllocator(lcd, 0);
    const codes = [];
    for (let row = 0; row < 2; row++)
      for (let c = 0; c < CANVAS_COLS; c++) {
        const tile = Array.from({ length: 8 }, () => Array(5).fill('.'));
        for (const d of DOTS) {
          if (d.c !== c || d.row !== row) continue;
          if (litDot(d, k, waxing) || on.has(`${d.c},${d.row},${d.i},${d.r}`)) tile[d.r][d.i] = '#';
        }
        const rows = tile.map((l) => l.join(''));
        codes.push(rows.every((l) => l === '.....') ? 0x20 : alloc.add(rows));
      }
    alloc.flush();

    const grid = [Array(16).fill(0x20), Array(16).fill(0x20)];
    codes.forEach((code, n) => {
      grid[Math.floor(n / CANVAS_COLS)][n % CANVAS_COLS] = code ?? 0x20;
    });
    const write = (row, text, col) =>
      [...text].forEach((ch, i) => { grid[row][col + i] = ch.charCodeAt(0) & 0xff; });
    write(0, `${fields.hh}:${fields.mm}:${fields.ss}`, 5);
    write(1, `${fields.dd}${fields.month}`, 4);
    write(1, PHASE_NAME(p), 10);

    // Stars out in the text, free ROM beads, a few of them alight at a time.
    for (const [row, col, seed] of [[0, 4, 4], [0, 13, 1], [0, 14, 2], [0, 15, 5]]) {
      if (smoothNoise(t / 3.5 + seed * 2.3, 13) > 0.4) grid[row][col] = 0xa5;
    }

    grid.forEach((row, r) => { lcd.setCursor(0, r); row.forEach((c) => lcd.data(c)); });
  },
};
