// The block face from the reference photograph (an amber module showing
// 00:50 with small seconds), read off the photo dot by dot.
//
// Each digit is three cells wide and both rows tall, and every digit is built
// from the same few parts, so the face's CGRAM cost depends on which parts the
// four digits need, not on their size:
//
//   left column    full 5-dot cells: ROM 0xff, free
//   centre column  5 dots wide
//   right column   only 3 dots wide (cell columns 0-2). The two dark columns
//                  after it are the space before the next digit, which is
//                  why the face reads as separate numerals with no blank cell
//                  between them.
//   top, bottom    bars 3 dots thick (rows 0-2 of the top cell, rows 5-7 of
//                  the bottom cell)
//   middle bar     2 dots thick, on rows 6-7 of the top cell, so the lower
//                  counter is the taller one
//
//   colon          ROM 0x3a in both rows: four 2x2 beads
//   seconds        a squared 5x7 face, two-dot verticals and one-dot
//                  horizontals, top-aligned in the bottom row. Where a
//                  right-hand stroke meets a bar the corner dot is dropped
//                  (the photo's 2 and 5); 0, 6, 8 and 9 are rounded on the left
//                  too, or the 0 reads as a D.
//
// Only 0 and 5 appear in the photo; the other digits follow the same
// seven-segment logic. The seconds font likewise extends the photo's 2 and 5.

import { art } from './kit.js';

const W5 = '#####', W3 = '###..', NO = '.....';
const tile = (wide, rowsLit) => Array.from({ length: 8 }, (_, r) => (rowsLit.includes(r) ? wide : NO));

/** The parts, as 5x8 tiles. `F` (solid) and ` ` (blank) are ROM and not listed. */
export const PARTS = {
  T: tile(W5, [0, 1, 2]),             // top bar
  M: tile(W5, [0, 1, 2, 6, 7]),       // top + middle bars
  G: tile(W5, [6, 7]),                // middle bar alone (the 4)
  B: tile(W5, [5, 6, 7]),             // bottom bar
  R: tile(W3, [0, 1, 2, 3, 4, 5, 6, 7]), // right stroke, 3 dots wide
  M3: tile(W3, [0, 1, 2, 6, 7]),      // top + middle bars, right column (5, 6)
  B3: tile(W3, [5, 6, 7]),            // bottom bar, right column (2)
};

/** Each digit as [top row, bottom row], each [left, centre, right] part names. */
export const DIGITS = {
  0: [['F', 'T', 'R'], ['F', 'B', 'R']],
  1: [[' ', ' ', 'R'], [' ', ' ', 'R']],
  2: [['M', 'M', 'R'], ['F', 'B', 'B3']],
  3: [['M', 'M', 'R'], ['B', 'B', 'R']],
  4: [['F', 'G', 'R'], [' ', ' ', 'R']],
  5: [['F', 'M', 'M3'], ['B', 'B', 'R']],
  6: [['F', 'M', 'M3'], ['F', 'B', 'R']],
  7: [['T', 'T', 'R'], [' ', ' ', 'R']],
  8: [['F', 'M', 'R'], ['F', 'B', 'R']],
  9: [['F', 'M', 'R'], ['B', 'B', 'R']],
};

/** Cells a face occupies: digits at these offsets from its left edge, colon at 6. */
export const DIGIT_OFFSETS = [0, 3, 7, 10];
export const COLON_OFFSET = 6;
export const FACE_WIDTH = 13;

export const SOLID = art(`
  #####
  #####
  #####
  #####
  #####
  #####
  #####
  #####`);
export const BLANK = Array(8).fill(NO);

/** The 5x8 picture of a part name, including the ROM ones. */
export const partTile = (name) => (name === 'F' ? SOLID : name === ' ' ? BLANK : PARTS[name]);

/**
 * Allocate a part through `alloc` and return the character code to write.
 * Solid and blank never take a slot. Returns null if CGRAM is full.
 */
export function partCode(alloc, name) {
  if (name === 'F') return 0xff;
  if (name === ' ') return 0x20;
  return alloc.add(PARTS[name]);
}

/** The squared seconds face: 5x7, top-aligned in a 5x8 cell. */
export const SECONDS = {
  0: art(`
    .###.
    ##.##
    ##.##
    ##.##
    ##.##
    ##.##
    .###.
    .....`),
  1: art(`
    ###..
    .##..
    .##..
    .##..
    .##..
    .##..
    ####.
    .....`),
  2: art(`
    ####.
    ...##
    ...##
    .###.
    ##...
    ##...
    #####
    .....`),
  3: art(`
    ####.
    ...##
    ...##
    .###.
    ...##
    ...##
    ####.
    .....`),
  4: art(`
    ##.##
    ##.##
    ##.##
    #####
    ...##
    ...##
    ...##
    .....`),
  5: art(`
    #####
    ##...
    ##...
    ####.
    ...##
    ...##
    ####.
    .....`),
  6: art(`
    .####
    ##...
    ##...
    ####.
    ##.##
    ##.##
    .###.
    .....`),
  7: art(`
    ####.
    ...##
    ...##
    ...##
    ...##
    ...##
    ...##
    .....`),
  8: art(`
    .###.
    ##.##
    ##.##
    .###.
    ##.##
    ##.##
    .###.
    .....`),
  9: art(`
    .###.
    ##.##
    ##.##
    .####
    ...##
    ...##
    ####.
    .....`),
};
