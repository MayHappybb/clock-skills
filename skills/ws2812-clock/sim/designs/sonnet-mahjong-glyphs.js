// Carved glyphs for mahjong characters-suit tiles: a numeral character
// (一..九) carved in black ink, the 萬 character carved in red beneath it,
// as on a real character tile -- and a 白板 (blank tile, blue rectangular
// frame) for zero. Box is GW wide x GH tall (y down); NUM_Y/WAN_Y give each
// character's own sub-box so strokes can be laid out independently. Each
// glyph is a list of thick strokes [x0, y0, x1, y1, w] in box units.
export const GW = 20, GH = 36;
export const NUM_BOX = { y0: 1, y1: 17 };   // the numeral's sub-box
export const WAN_BOX = { y0: 19, y1: 35 };  // the 萬 character's sub-box

const N = {}; // numerals 一..九, black ink
const WAN = {}; // 萬, red ink, same for every digit 1-9

// 一
N['1'] = [[2.5, 9, 17.5, 9, 3]];
// 二
N['2'] = [[4, 5, 16, 5, 2.6], [2.5, 13, 17.5, 13, 3]];
// 三
N['3'] = [[4.5, 2.5, 15.5, 2.5, 2.3], [3.5, 9, 16.5, 9, 2.5], [2.5, 15.5, 17.5, 15.5, 2.8]];
// 四 (bordered box with inner X, reads as a distinct block vs the blank)
N['4'] = [
  [3, 1.5, 17, 1.5, 2.2], [3, 1.5, 3, 16.5, 2.2], [17, 1.5, 17, 16.5, 2.2], [3, 16.5, 17, 16.5, 2.2],
  [4.6, 3.5, 15.4, 14.5, 1.7], [15.4, 3.5, 4.6, 14.5, 1.7],
];
// 五: top bar, centre post, mid bar, wide foot -- a stable cross-brace glyph
N['5'] = [[3.5, 2.5, 16.5, 2.5, 2.4], [10, 2.5, 10, 16, 2], [5.5, 8.5, 14.5, 8.5, 2], [2.5, 16, 17.5, 16, 2.8]];
// 六: two short strokes over a splayed base, like the real character's roof + legs
N['6'] = [
  [7, 1.5, 7, 6, 2], [13, 1.5, 13, 6, 2],
  [2.5, 8, 17.5, 8, 2.4],
  [6, 8.5, 3, 16.5, 2.2], [14, 8.5, 17, 16.5, 2.2],
];
// 七: a horizontal shoulder with a hooked vertical falling through and
// kicking left at the foot (the real 七 hook)
N['7'] = [
  [3, 6, 17, 6, 2.6], [12, 6, 9.5, 16.5, 2.6], [9.5, 15.5, 6, 17, 2.2],
];
// 八: two strokes splaying outward from a near-touch at the top
N['8'] = [[9.5, 2, 3, 16.5, 2.6], [10.5, 2, 17, 16.5, 2.6]];
// 九: simplified to two bold, well-separated strokes so it reads at tiny
// size -- a near-vertical stroke hooking left at the foot (the long bending
// stroke + hook of the real character), crossed by a single diagonal from
// upper-left to the hook's shoulder (the "crossing stroke"); together they
// are unmistakably two strokes meeting, not one caret/V shape.
N['9'] = [
  [12.5, 2, 12.5, 14, 2.8], [12.5, 14, 7, 17, 2.8],
  [3.5, 6, 12.5, 9.5, 2.6],
];

// 萬, simplified: a crown of three short strokes over a wide grid body --
// a consistent bold red glyph that reads as "the character under the
// numeral" rather than a specific stroke-accurate 萬 at this resolution.
// Coordinates live in WAN_BOX (y 19..35), below the numeral's own box.
WAN.base = [
  [6, 20, 6, 22.5, 1.6], [10, 19.5, 10, 22.5, 1.8], [14, 20, 14, 22.5, 1.6],
  [2.5, 24, 17.5, 24, 2],
  [2.5, 24, 2.5, 34.5, 1.8], [17.5, 24, 17.5, 34.5, 1.8],
  [2.5, 29, 17.5, 29, 1.8],
  [2.5, 34.5, 17.5, 34.5, 2.2],
  [10, 24, 10, 34.5, 1.6],
];

export const GLYPHS = N;
export const WAN_GLYPH = WAN.base;

// 0: the white dragon 白板 -- a blank tile, a plain blue rectangular frame
// inset from the tile's own edge, no ink inside. Returned as its own kind
// so the renderer knows not to look for a numeral/wan pair.
export const BLANK_FRAME = [
  [2, 2.5, 18, 2.5, 1.6], [2, 2.5, 2, 33.5, 1.6], [18, 2.5, 18, 33.5, 1.6], [2, 33.5, 18, 33.5, 1.6],
];
