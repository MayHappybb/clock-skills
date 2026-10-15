// Glide — a sweep second, on a display that only knows whole dots.
//
// Everything else on this glass moves a dot at a time. Here the slow glass is
// used as an integrator: a shape that should sit between two dots is drawn on
// one of them in some frames and on the other in the rest, and the liquid
// crystal, too slow to follow, settles at the in-between brightness. Run fast
// enough, that is anti-aliasing in time, and the shape glides.
//
// The dial (cells 0-2, both rows, six tiles) is a sweep-seconds face: twelve
// crisp marks and a long seconds hand with a counterweight tail, drawn in
// millimetres at the real dot centres as `dial` does. The hand is not
// snapped to dots. Each frame, every dot's coverage by it is measured (4x4
// samples over its pitch cell), and the dot is lit in that fraction of four
// consecutive frames, by a 2x2 ordered-dither rank so that neighbouring grey
// dots take turns rather than flashing together. The hand keeps a straight,
// soft-edged line at every angle and moves continuously, where `dial`'s
// hands staircase and their kinks jump about as they turn. The time itself
// is ROM text beside it, at full contrast, never dithered.
//
// Two more uses of the same trick cost no CGRAM at all, because a cell can be
// pointed at a different ROM code from one frame to the next:
//   - the colon breathes, lit in 0-4 of every four frames along a sine;
//   - on the minute the changing digits cross-fade over 1.2 s, old and new
//     shown 3:1, 1:1, 1:3 across the four frames, instead of switching.
//
// Budget: six tiles per frame, rewritten every frame (each frame is its own
// page; trap #1 cannot bite, every tile is written before the cells). About
// 90 bytes a frame: 3.9 ms on an 8-bit parallel bus, so it is declared at
// `parallel8` and 60 fps, four phases at 15 Hz. On 100 kHz I2C a frame is
// 35 ms, so the bus allows about 28 fps; with four phases that is a 7 Hz
// cycle and the greys visibly pulse. `makeGlide({ phases: 2, fps: 25 })` is
// the I2C setting: half-dot steps, a 12.5 Hz cycle, about 28% ripple on a
// half-lit dot.
//
// How this looks on real glass is the uncertain part, and the simulator is
// optimistic about it (references/hardware.md, "Time-division multiplexing"):
//   - The greys are a linear average here. Liquid crystal answers the RMS
//     drive through a steep curve set by the contrast pot, so a dot lit one
//     frame in four may read as nearly off and three in four as nearly on.
//     The glide then gets steppier, though never worse than whole dots. Turn
//     the contrast pot until the colon's breathing looks even.
//   - At 60 fps with the controller refreshing at roughly 60-85 Hz, the two
//     beat; expect a slow shimmer in the grey dots, and the occasional torn
//     dot row when a page lands mid-scan. Moving to 50 or 40 fps changes the
//     beat, not the average.
//   - With a 15 Hz cycle on 150 ms glass, a dot lit one frame in four
//     ripples between about 17% and 35% of full contrast, a half-lit dot
//     between 44% and 56%. Fine at arm's length, a shimmer close up.
//
// Tried and dropped: hour and minute hands, anti-aliased, with an orbiting
// seconds bead. At 15x16 their roots merged into a solid blob at the hub
// (the lesson `dial` learnt with whole dots), so the dial is seconds only.
// Anti-aliasing the marks too: static greys only flicker and never move, so
// the marks are snapped and stay at full contrast; only what moves is grey.
// A 0.5 mm hand was mostly grey and faint; at 0.7 mm it keeps a solid core.
// `makeGlide({ phases: 1 })` is the same sweep in whole dots, drawn the way
// `dial` draws hands; out/glide-compare.png has the two side by side.

import { TileAllocator } from '../js/kit.js';
import { MODULE } from '../js/panel.js';

const TEXT_COL = 4;
const DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
const FADE = 1.2;                      // seconds for a digit to cross-fade on the minute

// Every dot of the 15x16 dial, with its centre in mm, gaps included.
const DOTS = [];
for (let row = 0; row < 2; row++)
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 3; c++)
      for (let i = 0; i < 5; i++)
        DOTS.push({
          c, row, i, r,
          gx: c * 5 + i, gy: row * 8 + r,     // dot grid position, for the dither rank
          x: c * MODULE.charPitchX + i * MODULE.dotPitchX,
          y: row * MODULE.charPitchY + r * MODULE.dotPitchY,
        });

// The centre sits on a real dot (middle of the middle cell, last row of the
// top cell), so a hand at 12, 3, 6 or 9 has a straight line of dots.
const CENTRE = DOTS.find((d) => d.c === 1 && d.i === 2 && d.row === 0 && d.r === 7);
const MARK_R = 4.45;                   // the twelve marks, snapped to dots
const HAND = { from: 0.9, to: 4.0, tail: 1.3, width: 0.7 };   // mm

const polar = (a, rad) => [CENTRE.x + Math.sin(a) * rad, CENTRE.y - Math.cos(a) * rad];
const nearest = (x, y) => DOTS.reduce((b, d) => ((d.x - x) ** 2 + (d.y - y) ** 2 < (b.x - x) ** 2 + (b.y - y) ** 2 ? d : b));
const MARKS = new Set(Array.from({ length: 12 }, (_, k) => nearest(...polar((k * Math.PI) / 6, MARK_R))));

/** Is (px, py) on the sweep hand at angle a: a bar from the tail to the tip, minus the hub? */
function onHand(px, py, a) {
  const ux = Math.sin(a), uy = -Math.cos(a);
  const x = px - CENTRE.x, y = py - CENTRE.y;
  const along = x * ux + y * uy, across = Math.abs(y * ux - x * uy);
  const inBar = along >= -HAND.tail && along <= HAND.to && across <= HAND.width / 2;
  return inBar && Math.abs(along) >= (along > 0 ? HAND.from : 0.7);
}

// 4x4 sample offsets over a dot's pitch cell.
const SAMPLES = [];
for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++)
  SAMPLES.push([((k + 0.5) / 4 - 0.5) * MODULE.dotPitchX, ((j + 0.5) / 4 - 0.5) * MODULE.dotPitchY]);

/** How much of each dot the sweep hand covers, 0..1, at this instant. */
function coverage(fields) {
  const a = ((fields.s + fields.ms / 1000) / 60) * 2 * Math.PI;
  return DOTS.map((d) => {
    if (Math.hypot(d.x - CENTRE.x, d.y - CENTRE.y) > HAND.to + 0.6) return 0;
    let n = 0;
    for (const [ox, oy] of SAMPLES) if (onHand(d.x + ox, d.y + oy, a)) n++;
    return n / SAMPLES.length;
  });
}

/**
 * The hand as the best whole-dot drawing can do it, as `dial` draws hands:
 * the nearest dot to each point along its centre line, so it never breaks.
 */
function snapped(fields) {
  const a = ((fields.s + fields.ms / 1000) / 60) * 2 * Math.PI;
  const on = new Set();
  for (let s = -HAND.tail; s <= HAND.to; s += 0.08) {
    if (Math.abs(s) < (s > 0 ? HAND.from : 0.7)) continue;
    on.add(nearest(...polar(a, s)));
  }
  return DOTS.map((d) => (on.has(d) ? 1 : 0));
}

// 2x2 ordered dither: neighbouring dots are lit in different frames.
const BAYER = [0, 2, 3, 1];
const rankOf = (gx, gy, phase, n) => (phase + BAYER[(gx & 1) + 2 * (gy & 1)]) % n;

/**
 * The design, with `phases` frames to a cycle. One phase is the same motion
 * snapped to whole dots, for comparison.
 */
export function makeGlide({ phases = 4, fps = 60, bus = 'parallel8' } = {}) {
  // Frames are handed out in bit-reversed order (0, 2, 1, 3), so a weight of
  // one half is lit on alternate frames, not two running: on 150 ms glass at
  // 60 fps that ripples 44-56% instead of 38-62%.
  const order = phases === 4 ? [0, 2, 1, 3] : Array.from({ length: phases }, (_, i) => i);
  /** Is something of weight w (0..1) shown in this phase, for this rank? */
  const shown = (w, rank) => (phases === 1 ? w >= 0.5 : Math.round(w * phases) > order[rank % phases]);

  return {
    name: phases === 1 ? 'Glide (whole dots)' : 'Glide',
    blurb: 'A sweep-seconds hand that glides between dots: the slow glass averages four alternating frames into sub-dot positions.',
    bus,
    panel: 'gray',
    fps,

    frame(lcd, api, { t, fields, date, kit }) {
      const k = Math.round(t * fps);
      const phase = ((k % phases) + phases) % phases;

      // The dial: crisp marks and hub, the hand dithered across phases.
      const cov = phases === 1 ? snapped(fields) : coverage(fields);
      const lit = DOTS.map((d, n) => MARKS.has(d) || d === CENTRE
        || cov[n] >= 1 || (cov[n] > 0 && shown(cov[n], rankOf(d.gx, d.gy, phase, phases))));

      const alloc = new TileAllocator(lcd, 0);
      const codes = [];
      for (let row = 0; row < 2; row++)
        for (let c = 0; c < 3; c++) {
          const tile = Array.from({ length: 8 }, () => Array(5).fill('.'));
          DOTS.forEach((d, n) => { if (lit[n] && d.row === row && d.c === c) tile[d.r][d.i] = '#'; });
          const rows = tile.map((l) => l.join(''));
          codes.push(rows.every((l) => l === '.....') ? 0x20 : alloc.add(rows));
        }
      alloc.flush();

      const grid = [Array(16).fill(0x20), Array(16).fill(0x20)];
      codes.forEach((code, n) => { grid[Math.floor(n / 3)][n % 3] = code ?? 0x20; });

      // The time, in ROM. On the minute the changing digits show the old code
      // in some frames and the new in the rest, the new weighted 1/4, 1/2,
      // 3/4 across the fade. Every digit shares one rank, so each frame is
      // the whole old time or the whole new one: per-digit ranks were tried,
      // and single frames showed times that never happen (10:00 between
      // 10:09 and 10:10).
      const sec = fields.s + fields.ms / 1000;
      const now = `${fields.hh}:${fields.mm}`;
      const old = kit.clockFields(new Date(date.getTime() - 60000));
      const was = `${old.hh}:${old.mm}`;
      [...now].forEach((ch, i) => {
        let show = ch;
        if (i !== 2 && was[i] !== ch && sec < FADE) {
          const w = phases === 1 ? (sec < FADE / 2 ? 0 : 1) : Math.floor((sec / FADE) * phases) / phases;
          show = shown(w, phase) ? ch : was[i];
        }
        grid[0][TEXT_COL + i] = show.charCodeAt(0);
      });
      // The colon breathes: lit in 0-4 frames of every four, along a sine
      // with a 2 s period, full on even seconds and out on odd ones.
      const breath = 0.5 + 0.5 * Math.cos(Math.PI * (sec % 2));
      if (!shown(breath, phase)) grid[0][TEXT_COL + 2] = 0x20;

      const day = DAYS.find((d) => d.startsWith(fields.dow));
      const dateText = `${day.slice(0, 3)} ${fields.dd} ${fields.month}`;
      [...dateText].forEach((ch, i) => { grid[1][TEXT_COL + i] = ch.charCodeAt(0); });

      grid.forEach((codesRow, row) => { lcd.setCursor(0, row); codesRow.forEach((c) => lcd.data(c)); });
    },
  };
}

export default makeGlide();
