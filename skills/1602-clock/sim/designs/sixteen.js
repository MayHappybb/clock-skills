// Sixteen — four drawn 10x16 digits, which one CGRAM page cannot hold.
//
// Each digit here is a real drawn numeral, two cells wide and both rows tall,
// with curved bowls and three-dot strokes: four tiles a digit, so HH:MM wants
// up to sixteen distinct tiles. One page holds eight. (`focus` shows two such
// digits, `slab` gets four big ones by giving up the curves.) This design
// alternates two CGRAM pages, A and B, every frame, and lets the slow glass
// average them: time-division multiplexing.
//
// That does not make sixteen sharp characters. A tile resident in both pages
// is lit all the time and shows at full contrast; a tile in only one page is
// lit half the time and settles at about half contrast, rippling at the page
// rate. So the planner spends the pages carefully, per frame, from the clock:
//
//   - every distinct digit is a unit of four tiles (tiles two digits share,
//     like the bottom right of 5 and 6, are counted once)
//   - each unit is put in both pages (full), in A only, or in B only, so that
//     neither page needs more than eight tiles; all 3^n ways are scored
//   - the score is full-contrast digits first, then the ink in A against the
//     ink in B (so the glass as a whole keeps a steady brightness), then
//     neighbours in opposite pages (so the half-contrast flicker never moves
//     as a block)
//
// With three or fewer distinct digits there is room for a full one, and a
// digit that repeats is the one to promote: 10:09 shows both 0s full and the 1
// and the 9 at half; 11:11 and 10:10 are all full. Four different digits
// (12:34) are usually all half, unless some share quarters: 3, 5, 6 and 8 share
// a bottom right, so 13:58 still has room to show its 8 full. Over the day:
// all four full 128 minutes, two full 668, one full 13, none 631. Tiles in
// both pages keep the same slot in both, so a stateful driver rewrites only the
// tiles that differ between the pages.
//
// Two other plans were rendered for comparison (`scheme`): 'naive', hours in A
// and minutes in B always, so every digit is half all the time; and 'tile',
// which promotes individual tiles rather than whole digits. The tile plan has
// more dots at full contrast but splits digits into bright and dim quarters,
// which reads as broken type; whole digits read better.
//
// On the minute the turning digits dissolve: for 0.5 s the old digit is in page
// A and the new one in page B, a double exposure, if both pages have room for
// it (ones digit first). With the glass's lag the step old, both, new reads as
// a dissolve. When there is no room the digit switches cleanly: about one
// turning digit in three, e.g. the 9 of 10:09 -> 10:10, where 1 and 0 already
// fill both pages.
//
// Hardware. A full redraw is eight tiles and 32 cells, about 4.6 ms on an
// 8-bit parallel bus, so this runs at 60 frames (30 page pairs) a second: a
// ~12% peak-to-peak shimmer at 30 Hz on the half-contrast digits. On 100 kHz
// I2C the same redraw is ~42 ms, 20 fps at best: a ~33% flicker at 10 Hz, which
// is plainly visible. On real glass expect more than the simulator shows:
// half contrast is a linear average here, but liquid crystal responds through
// a steep RMS threshold set by the contrast pot, so a half-lit digit may look
// nearly off or nearly full; and page changes are not synchronised to the
// controller's own 60-85 Hz scan, so some frames tear, and a page rate near the
// scan rate can roll. See references/hardware.md, "Time-division multiplexing".
//
// The colon is two ROM beads and the seconds are ROM, both at full contrast.

import { TileAllocator } from '../js/kit.js';

const FPS = 60;
const BLEND = 0.5;                 // seconds of double exposure on the minute
const DIGIT_COLS = [0, 3, 8, 11];  // each digit is two cells wide
const COLON_COL = 6;
const SECONDS_COL = 14;            // ROM seconds, bottom row

const BIG = {
  0: `...####...|.########.|.###..###.|###....###|###....###|###....###|###....###|###....###|
      ###....###|###....###|###....###|###....###|###....###|.###..###.|.########.|...####...`,
  1: `.....###..|....####..|...#####..|..##.###..|.....###..|.....###..|.....###..|.....###..|
      .....###..|.....###..|.....###..|.....###..|.....###..|.....###..|..########|..########`,
  2: `..######..|.########.|###....###|###....###|.......###|......###.|.....###..|....###...|
      ...###....|..###.....|.###......|###.......|###.......|###.......|##########|##########`,
  3: `..######..|.########.|###....###|.......###|.......###|......###.|...#####..|...######.|
      .......###|.......###|.......###|.......###|###....###|###....###|.########.|..######..`,
  4: `......###.|.....####.|....#####.|...##.###.|..##..###.|.##...###.|##....###.|##########|
      ##########|......###.|......###.|......###.|......###.|......###.|......###.|......###.`,
  5: `##########|##########|###.......|###.......|###.......|#######...|#########.|.......###|
      .......###|.......###|.......###|.......###|###....###|###....###|.########.|..######..`,
  6: `...#####..|..######..|.###......|###.......|###.......|###.......|########..|#########.|
      ###....###|###....###|###....###|###....###|###....###|###....###|.########.|..######..`,
  7: `##########|##########|.......###|......###.|......###.|.....###..|.....###..|....###...|
      ....###...|...###....|...###....|...###....|..###.....|..###.....|..###.....|..###.....`,
  8: `..######..|.########.|###....###|###....###|###....###|.###..###.|..######..|.########.|
      ###....###|###....###|###....###|###....###|###....###|###....###|.########.|..######..`,
  9: `..######..|.########.|###....###|###....###|###....###|###....###|###....###|.#########|
      ..########|.......###|.......###|.......###|.......###|......###.|..######..|..#####...`,
};

/** A digit's four tiles, in cell order: TL TR BL BR. */
const QUADS = Object.fromEntries(Object.entries(BIG).map(([d, spec]) => {
  const rows = spec.split('|').map((r) => r.trim());
  const q = (r0, c0) => rows.slice(r0, r0 + 8).map((r) => r.slice(c0, c0 + 5));
  return [d, [q(0, 0), q(0, 5), q(8, 0), q(8, 5)]];
}));
const key = (tile) => tile.join('/');
const ink = (tile) => tile.join('').split('#').length - 1;
/** Glass cell (col, row) of quarter q of the digit at position p. */
const cellOf = (p, q) => [DIGIT_COLS[p] + (q & 1), q >> 1];

// ------------------------------------------------------------------ planning

/**
 * Which page or pages each digit cell is shown in. Returns, per position and
 * quarter, 'F' (both pages), 'A' or 'B'. `digits` is the four characters.
 */
export function plan(digits, scheme) {
  const tilesOf = (d) => QUADS[d].map(key);
  if (scheme === 'naive') return digits.map((_, p) => Array(4).fill(p < 2 ? 'A' : 'B'));

  if (scheme === 'tile') {
    // Promote individual tiles: the most used and inkiest first.
    const use = new Map();
    digits.forEach((d) => QUADS[d].forEach((t) => {
      const k = key(t);
      use.set(k, (use.get(k) ?? 0) + 1);
    }));
    const order = [...use.keys()].sort((a, b) => use.get(b) - use.get(a) || ink(b.split('/')) - ink(a.split('/')) || (a < b ? -1 : 1));
    const shared = Math.max(0, Math.min(order.length, 16 - order.length));
    const cls = new Map();
    let a = 0, b = 0;
    order.forEach((k, i) => {
      if (i < shared) cls.set(k, 'F');
      else if (a <= b) { cls.set(k, 'A'); a++; } else { cls.set(k, 'B'); b++; }
    });
    return digits.map((d) => tilesOf(d).map((k) => cls.get(k)));
  }

  // Whole digits: try every assignment of the distinct digits to F, A, B.
  const values = [...new Set(digits)];
  let best = null;
  for (let code = 0; code < 3 ** values.length; code++) {
    const cls = {};
    let c = code;
    for (const v of values) { cls[v] = 'FAB'[c % 3]; c = Math.floor(c / 3); }
    const page = (which) => new Set(values.filter((v) => cls[v] === 'F' || cls[v] === which).flatMap(tilesOf));
    if (page('A').size > 8 || page('B').size > 8) continue;
    let score = 0, inkA = 0, inkB = 0;
    digits.forEach((d, p) => {
      if (cls[d] === 'F') score += 1000;
      const w = QUADS[d].reduce((s, t) => s + ink(t), 0);
      if (cls[d] === 'A') inkA += w;
      if (cls[d] === 'B') inkB += w;
      if (p > 0 && cls[d] !== 'F' && cls[digits[p - 1]] !== 'F' && cls[d] !== cls[digits[p - 1]]) score += 5;
    });
    score -= Math.abs(inkA - inkB) / 4;
    if (!best || score > best.score) best = { score, cls };
  }
  return digits.map((d) => Array(4).fill(best.cls[d]));
}

/**
 * The tiles each page shows in each digit cell, or null for blank: a list of
 * 16 entries per page, in position-major, quarter-minor order.
 */
function pages(digits, vis) {
  const out = { A: [], B: [] };
  digits.forEach((d, p) => QUADS[d].forEach((t, q) => {
    out.A.push(vis[p][q] === 'B' ? null : t);
    out.B.push(vis[p][q] === 'A' ? null : t);
  }));
  return out;
}

const fits = (list) => new Set(list.filter(Boolean).map(key)).size <= 8;

// ------------------------------------------------------------------- design

export default {
  name: 'Sixteen',
  blurb: 'Four drawn 10x16 digits, sixteen tiles, by alternating two CGRAM pages: repeated digits full, the rest at half contrast.',
  bus: 'parallel8',
  panel: 'blue',
  fps: FPS,
  /** 'digit' (shipped), 'naive' or 'tile': see the header. */
  scheme: 'digit',

  frame(lcd, api, { t, fields, date, kit }) {
    const fps = this.fps ?? FPS;
    const page = Math.floor(t * fps + 1e-6) % 2 === 0 ? 'A' : 'B';
    const sec = fields.s + fields.ms / 1000;
    const digits = [...(fields.hh + fields.mm)];
    const vis = plan(digits, this.scheme ?? 'digit');
    const shown = pages(digits, vis);

    // The dissolve: old digit in page A, new in page B, where both pages fit.
    if (sec < BLEND) {
      const was = kit.clockFields(new Date(date.getTime() - 60000));
      const old = [...(was.hh + was.mm)];
      for (let p = 3; p >= 0; p--) {
        if (old[p] === digits[p]) continue;
        const A = shown.A.slice(), B = shown.B.slice();
        for (let q = 0; q < 4; q++) { A[p * 4 + q] = QUADS[old[p]][q]; B[p * 4 + q] = QUADS[digits[p]][q]; }
        if (fits(A) && fits(B)) { shown.A = A; shown.B = B; }
      }
    }

    // Tiles in both pages first, in a fixed order, so they keep their slots.
    const mine = shown[page], other = shown[page === 'A' ? 'B' : 'A'];
    const both = new Set(other.filter(Boolean).map(key));
    const alloc = new TileAllocator(lcd, 0);
    for (const tile of mine) if (tile && both.has(key(tile))) alloc.add(tile);
    const codes = mine.map((tile) => (tile ? alloc.add(tile) : null));
    alloc.flush();

    const grid = [Array(16).fill(0x20), Array(16).fill(0x20)];
    codes.forEach((code, i) => {
      const [c, r] = cellOf(Math.floor(i / 4), i % 4);
      grid[r][c] = code ?? 0x20;
    });
    // The colon, two ROM beads, lit for the first half of each second.
    if (fields.ms < 500) { grid[0][COLON_COL] = 0xa5; grid[1][COLON_COL] = 0xa5; }
    [...fields.ss].forEach((ch, i) => { grid[1][SECONDS_COL + i] = ch.charCodeAt(0); });

    grid.forEach((row, r) => { lcd.setCursor(0, r); row.forEach((c) => lcd.data(c)); });
  },
};
