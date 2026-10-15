// Toolkit for authoring clock faces.
//
// The whole art of this display is CGRAM: the controller only stores eight
// user-defined glyphs. Each is just bytes in RAM, so a design can rewrite them
// between frames, which is what makes animation possible. It cannot rewrite
// them within a frame: a cell holds a slot number and the display re-reads the
// slot on every refresh, so every cell already showing a slot changes with it.
// (An earlier version of this file offered `PageWriter` and `drawBitmap` to
// "page" more than eight glyphs into one frame. That cannot work on the real
// part, and they were removed.)

import { DOT_COLS, DOT_ROWS, parseRow } from './hd44780.js';
import { MODULE } from './panel.js';

/** Normalise a glyph into DOT_ROWS strings of DOT_COLS characters. */
export function rows(spec, height = DOT_ROWS) {
  const out = [];
  for (let r = 0; r < height; r++) {
    const line = spec[r] ?? '';
    out.push(line.padEnd(DOT_COLS, ' ').slice(0, DOT_COLS).replace(/ /g, '.'));
  }
  return out;
}

/** Split a 16-row (two-cell-tall) glyph into its top and bottom halves. */
export function split16(spec) {
  const all = rows(spec, 16);
  return [all.slice(0, 8), all.slice(8, 16)];
}

/** Build a glyph from a compact picture: newline-separated rows of '#' and '.'. */
export function art(text) {
  return text.trim().split('\n').map((l) => l.trim());
}

export const ease = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => t * (2 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  outCubic: (t) => 1 - (1 - t) ** 3,
  inOutCubic: (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2),
  outBack: (t) => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2,
  outElastic: (t) => (t === 0 || t === 1 ? t : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
};

/** Deterministic 1D value noise in [0,1); handy for organic motion. */
export function noise(x, seed = 0) {
  const s = Math.sin(x * 12.9898 + seed * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

export function smoothNoise(x, seed = 0) {
  const i = Math.floor(x), f = x - i;
  const u = f * f * (3 - 2 * f);
  return noise(i, seed) * (1 - u) + noise(i + 1, seed) * u;
}

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Wall-clock fields for a timestamp, in local time. */
const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

export function clockFields(date = new Date()) {
  const h = date.getHours(), m = date.getMinutes(), s = date.getSeconds();
  return {
    h, m, s,
    ms: date.getMilliseconds(),
    hh: String(h).padStart(2, '0'),
    mm: String(m).padStart(2, '0'),
    ss: String(s).padStart(2, '0'),
    dow: WEEKDAYS[date.getDay()],
    month: MONTHS[date.getMonth()],
    day: date.getDate(),
    year: date.getFullYear(),
    dd: String(date.getDate()).padStart(2, '0'),
  };
}

/**
 * Allocates 5x8 tiles into the controller's eight CGRAM slots, deduplicating
 * identical tiles and reporting when a frame wants more than the hardware can
 * hold. Designs should build every tile a frame needs, then `flush()` and write
 * the returned codes -- see trap #1 in references/gotchas.md.
 */
export class TileAllocator {
  constructor(lcd, firstSlot = 0) {
    this.lcd = lcd;
    this.firstSlot = firstSlot;
    this.capacity = 8 - firstSlot;
    this.tiles = [];
    this.index = new Map();
    /** Set when a distinct tile had to be dropped for lack of a slot. */
    this.overflow = false;
  }

  /** @returns {number|null} CGRAM code for this tile, or null if slots ran out. */
  add(tile) {
    const key = tile.join('/');
    if (this.index.has(key)) return this.index.get(key);
    if (this.tiles.length >= this.capacity) { this.overflow = true; return null; }
    const code = this.firstSlot + this.tiles.length;
    this.tiles.push(tile);
    this.index.set(key, code);
    return code;
  }

  /** Write every allocated tile into CGRAM. Call once per frame, before drawing. */
  flush() {
    this.tiles.forEach((tile, i) => this.lcd.defineChar(this.firstSlot + i, tile));
    return this.tiles.length;
  }

  get used() { return this.tiles.length; }
}

// --------------------------------------------------------------------- stage

/**
 * The 16x2 grid as a picture: each cell holds a ROM code or a 5x8 tile, and
 * sprites are inked over it dot by dot. `draw` turns every cell into a code,
 * spending a CGRAM slot only on cells that are a tile or carry ink, so a ROM
 * cell under a sprite becomes a private copy of its ROM glyph with the sprite
 * in it. Plain tiles are allocated before inked ones: the face wins over the
 * sprites when slots run out, and an inked cell that does not fit falls back
 * to what was under it.
 *
 * Sprite x is in glass columns: six per cell, the sixth being the gap between
 * cells, where ink is dropped. That is how the glass places dots, so a sprite
 * moving across a cell boundary skips the gap instead of bunching up.
 */
export class Stage {
  constructor(lcd) {
    this.lcd = lcd;
    this.cells = [Array(16).fill(0x20), Array(16).fill(0x20)];
    this.ink = new Map();
    this.fallback = new Map();
  }

  /**
   * Put a ROM code or a tile (8 rows) in a cell. `fallback` is the ROM code
   * to show if the tile does not get a slot (default: blank).
   */
  put(col, row, what, fallback) {
    if (col >= 0 && col < 16 && row >= 0 && row < 2) {
      this.cells[row][col] = what;
      if (fallback === undefined) this.fallback.delete(row * 16 + col);
      else this.fallback.set(row * 16 + col, fallback);
    }
    return this;
  }

  /** ROM text from a cell onwards. */
  text(col, row, str) {
    [...str].forEach((ch, i) => this.put(col + i, row, ch.charCodeAt(0) & 0xff));
    return this;
  }

  /** Ink one dot at glass column x (6 per cell), dot row y (0-15). */
  dot(x, y) {
    const col = Math.floor(x / 6), dx = x - col * 6;
    if (dx < 0 || dx > 4 || col < 0 || col > 15 || y < 0 || y > 15) return this;
    const row = y >> 3, key = row * 16 + col;
    const rows = this.ink.get(key) ?? Array(8).fill(0);
    rows[y & 7] |= 0x10 >> dx;
    this.ink.set(key, rows);
    return this;
  }

  /** Ink one dot by module cell and dot: column, row, dot column i (0-4), dot row r (0-7). */
  dotAt(col, row, i, r) {
    if (col < 0 || col > 15 || row < 0 || row > 1 || i < 0 || i > 4 || r < 0 || r > 7) return this;
    const key = row * 16 + col;
    const rows = this.ink.get(key) ?? Array(8).fill(0);
    rows[r] |= 0x10 >> i;
    this.ink.set(key, rows);
    return this;
  }

  /** The 5x8 picture under a cell, as row bytes. */
  base(col, row) {
    const what = this.cells[row][col];
    if (Array.isArray(what)) return what.map(parseRow);
    return this.lcd.glyph(what);
  }

  /** Allocate, flush and write the whole grid. Returns the allocator. */
  draw(alloc = new TileAllocator(this.lcd, 0)) {
    const out = [Array(16).fill(0x20), Array(16).fill(0x20)];
    const inked = [];
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 16; col++) {
        const what = this.cells[row][col];
        if (this.ink.has(row * 16 + col)) inked.push([col, row]);
        else if (Array.isArray(what)) out[row][col] = alloc.add(what.map(parseRow)) ?? this.fallback.get(row * 16 + col) ?? 0x20;
        else out[row][col] = what;
      }
    }
    for (const [col, row] of inked) {
      const ink = this.ink.get(row * 16 + col);
      const tile = this.base(col, row).map((b, r) => (b | ink[r]) & 0x1f);
      const code = alloc.add(tile);
      const what = this.cells[row][col];
      out[row][col] = code ?? (Array.isArray(what)
        ? alloc.add(what.map(parseRow)) ?? this.fallback.get(row * 16 + col) ?? 0x20 : what);
    }
    alloc.flush();
    out.forEach((codes, row) => { this.lcd.setCursor(0, row); codes.forEach((c) => this.lcd.data(c)); });
    return alloc;
  }
}

// ------------------------------------------------------------------ portrait

/**
 * The module turned a quarter turn clockwise, for a design with `rotate: 90`.
 * The glass is then 16 dots wide and 80 tall. Viewer coordinates: x 0-15 left
 * to right, y 0-79 top to bottom. A viewer cell is 8 dots wide and 5 tall;
 * there are two across and sixteen down.
 *
 *   viewer x 0-7  is module row 1 (the bottom row), x 8-15 is module row 0
 *   viewer y      is the module dot column: cell y/5, dot y%5
 *
 * The gap between the two viewer columns is 0.40 mm, under half a dot, so a
 * shape spanning both reads as one piece. Between viewer rows of cells the gap
 * is a whole missing dot, so a vertical stroke always shows a seam every five
 * dots. ROM text written along a module row reads top to bottom, lying on its
 * side like the title on a book's spine (module row 0 is the right column).
 */
export const PORTRAIT = { W: 16, H: 80 };

/** Module cell and dot for viewer dot (x, y). */
export function portraitToModule(x, y) {
  const R = 15 - x;
  return { col: Math.floor(y / 5), row: R >> 3, i: y % 5, r: R & 7 };
}

/** Centre of viewer dot (x, y) in mm from the top-left dot, gaps included. */
export function portraitMM(x, y) {
  const R = 15 - x, top = MODULE.charPitchY + 7 * MODULE.dotPitchY;
  return {
    x: top - ((R >> 3) * MODULE.charPitchY + (R & 7) * MODULE.dotPitchY),
    y: Math.floor(y / 5) * MODULE.charPitchX + (y % 5) * MODULE.dotPitchX,
  };
}

/**
 * A tile drawn the way it is seen in portrait (5 rows of 8, '#' lit), as the
 * 8 rows of 5 the controller stores.
 */
export function portraitTile(view) {
  return Array.from({ length: 8 }, (_, r) =>
    Array.from({ length: 5 }, (_, i) => ((view[i] ?? '')[7 - r] === '#' ? '#' : '.')).join(''));
}

/**
 * `Stage` in viewer coordinates. `pdot` inks a viewer dot, `pput` places a
 * ROM code or a portrait-drawn tile (see `portraitTile`) in viewer cell
 * (vc 0-1, vr 0-15), and `ptext` writes ROM text down a viewer column, on
 * its side. `draw()` is Stage's.
 */
export class PortraitStage extends Stage {
  pdot(x, y) {
    if (x < 0 || x > 15 || y < 0 || y > 79) return this;
    const m = portraitToModule(x, y);
    return this.dotAt(m.col, m.row, m.i, m.r);
  }

  pput(vc, vr, what) {
    return this.put(vr, 1 - vc, Array.isArray(what) && what.length === 5 ? portraitTile(what) : what);
  }

  ptext(vc, vr, str) {
    return this.text(vr, 1 - vc, str);
  }
}

// ---------------------------------------------------------------- font install

/**
 * Write a font into CGRAM, up to the eight slots available.
 * Characters beyond the eighth are dropped and listed in `missing`; `code()`
 * falls back to the ROM character for them. There is no way to show more than
 * eight custom glyphs in one frame (trap #1).
 */
export function installFont(lcd, font, firstSlot = 0) {
  const entries = Object.entries(font).slice(0, 8 - firstSlot);
  entries.forEach(([, spec], i) => lcd.defineChar(firstSlot + i, rows(spec)));
  const map = new Map(entries.map(([ch], i) => [ch, firstSlot + i]));
  const missing = Object.keys(font).slice(8 - firstSlot);
  return {
    code: (ch) => (map.has(ch) ? map.get(ch) : ch.charCodeAt(0)),
    has: (ch) => map.has(ch),
    missing,
    slots: entries.length,
  };
}

// ------------------------------------------------------------- designed fonts

/** A tall, thin, elegant digit set: 5 wide x 16 tall (two stacked cells). */
export const DIGITS_TALL = {
  0: art(`
    .###.
    #...#
    #...#
    #...#
    #...#
    #...#
    #...#
    #...#
    #...#
    #...#
    #...#
    #...#
    #...#
    #...#
    #...#
    .###.`),
  1: art(`
    ..#..
    .##..
    ..#..
    ..#..
    ..#..
    ..#..
    ..#..
    ..#..
    ..#..
    ..#..
    ..#..
    ..#..
    ..#..
    ..#..
    ..#..
    .###.`),
  2: art(`
    .###.
    #...#
    ....#
    ....#
    ....#
    ...#.
    ..#..
    .#...
    #....
    #....
    #....
    #....
    #....
    #....
    #....
    #####`),
  3: art(`
    .###.
    #...#
    ....#
    ....#
    ....#
    ...#.
    ..##.
    ....#
    ....#
    ....#
    ....#
    ....#
    ....#
    #...#
    #...#
    .###.`),
  4: art(`
    ....#
    ...##
    ..#.#
    .#..#
    #...#
    #...#
    #...#
    #####
    ....#
    ....#
    ....#
    ....#
    ....#
    ....#
    ....#
    ....#`),
  5: art(`
    #####
    #....
    #....
    #....
    #....
    ####.
    ....#
    ....#
    ....#
    ....#
    ....#
    ....#
    ....#
    #...#
    #...#
    .###.`),
  6: art(`
    ..##.
    .#...
    #....
    #....
    #....
    #....
    ####.
    #...#
    #...#
    #...#
    #...#
    #...#
    #...#
    #...#
    #...#
    .###.`),
  7: art(`
    #####
    ....#
    ....#
    ...#.
    ...#.
    ..#..
    ..#..
    .#...
    .#...
    .#...
    #....
    #....
    #....
    #....
    #....
    #....`),
  8: art(`
    .###.
    #...#
    #...#
    #...#
    #...#
    #...#
    .###.
    #...#
    #...#
    #...#
    #...#
    #...#
    #...#
    #...#
    #...#
    .###.`),
  9: art(`
    .###.
    #...#
    #...#
    #...#
    #...#
    #...#
    #...#
    .####
    ....#
    ....#
    ....#
    ....#
    ....#
    ....#
    ...#.
    .##..`),
};

/** A compact 5x8 set that fits one cell: crisp and geometric. */
export const DIGITS_COMPACT = {
  0: art(`
    .###.
    #...#
    #..##
    #.#.#
    ##..#
    #...#
    #...#
    .###.`),
  1: art(`
    ..#..
    .##..
    ..#..
    ..#..
    ..#..
    ..#..
    ..#..
    .###.`),
  2: art(`
    .###.
    #...#
    ....#
    ...#.
    ..#..
    .#...
    #....
    #####`),
  3: art(`
    ####.
    ....#
    ....#
    .###.
    ....#
    ....#
    #...#
    .###.`),
  4: art(`
    ...#.
    ..##.
    .#.#.
    #..#.
    #####
    ...#.
    ...#.
    ...#.`),
  5: art(`
    #####
    #....
    ####.
    ....#
    ....#
    ....#
    #...#
    .###.`),
  6: art(`
    ..##.
    .#...
    #....
    ####.
    #...#
    #...#
    #...#
    .###.`),
  7: art(`
    #####
    ....#
    ...#.
    ..#..
    .#...
    .#...
    #....
    #....`),
  8: art(`
    .###.
    #...#
    #...#
    .###.
    #...#
    #...#
    #...#
    .###.`),
  9: art(`
    .###.
    #...#
    #...#
    #...#
    .####
    ....#
    ...#.
    .##..`),
};

/** Punctuation and letters used by clock faces, in the same 5x8 cell. */
export const PUNCTUATION = {
  ':': art(`
    .....
    .....
    ..#..
    .....
    .....
    ..#..
    .....
    .....`),
  '.': art(`
    .....
    .....
    .....
    .....
    .....
    .....
    .##..
    .##..`),
  ' ': art(`
    .....
    .....
    .....
    .....
    .....
    .....
    .....
    .....`),
  '-': art(`
    .....
    .....
    .....
    #####
    .....
    .....
    .....
    .....`),
  '/': art(`
    ....#
    ....#
    ...#.
    ..#..
    .#...
    #....
    #....
    #....`),
  C: art(`
    .###.
    #...#
    #....
    #....
    #....
    #....
    #...#
    .###.`),
  F: art(`
    #####
    #....
    #....
    ####.
    #....
    #....
    #....
    #....`),
  A: art(`
    .###.
    #...#
    #...#
    #####
    #...#
    #...#
    #...#
    #...#
    `),
  M: art(`
    #...#
    ##.##
    #.#.#
    #...#
    #...#
    #...#
    #...#
    #...#
    `),
  P: art(`
    ####.
    #...#
    #...#
    ####.
    #....
    #....
    #....
    #....`),
};