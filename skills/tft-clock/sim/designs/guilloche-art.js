// Guilloche: the note's fixed engraving, as 1-bit tables (flash).
//
//   SIN      a 1024-step sine in Q12 integers: the lathe's cams
//   strip    a 3 x 4 microprint alphabet and the legend strip it sets
//   LIGHT    the lighthouse, a line engraving
//   DISC     the vignette's pixels: which are inside the oval

export const W = 160, H = 80;

// ------------------------------------------------------------ the cams
export const SIN = new Int16Array(1024);
for (let i = 0; i < 1024; i++) SIN[i] = Math.round(Math.sin((i / 1024) * Math.PI * 2) * 4096);
export const COS_OFF = 256;

// ------------------------------------------------------------ microprint
// 3 x 4 caps, read as a fine dotted rule from arm's length, as microprint does
const GLYPHS = {
  A: ['.#.', '#.#', '###', '#.#'], B: ['##.', '###', '#.#', '##.'], D: ['##.', '#.#', '#.#', '##.'],
  E: ['###', '##.', '#..', '###'], F: ['###', '#..', '##.', '#..'], H: ['#.#', '###', '#.#', '#.#'],
  I: ['###', '.#.', '.#.', '###'], K: ['#.#', '##.', '##.', '#.#'], L: ['#..', '#..', '#..', '###'],
  M: ['###', '###', '#.#', '#.#'], N: ['##.', '#.#', '#.#', '#.#'], O: ['###', '#.#', '#.#', '###'],
  P: ['###', '#.#', '###', '#..'], R: ['##.', '#.#', '##.', '#.#'], S: ['.##', '#..', '..#', '##.'],
  T: ['###', '.#.', '.#.', '.#.'], U: ['#.#', '#.#', '#.#', '###'], Y: ['#.#', '#.#', '.#.', '.#.'],
  '*': ['...', '.#.', '###', '.#.'], ' ': ['...', '...', '...', '...'],
};
/** A legend as a 4-row strip, one byte per pixel (1 ink), columns left to right. */
export function strip(text) {
  const cols = text.length * 4, s = new Uint8Array(cols * 4);
  for (let k = 0; k < text.length; k++) {
    const gph = GLYPHS[text[k]] ?? GLYPHS[' '];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) if (gph[r][c] === '#') s[r * cols + k * 4 + c] = 1;
  }
  return { s, cols };
}

// ------------------------------------------------------------ the vignette
export const VX = 88, VY = 40;           // its centre
export const OX = 14.5, OY = 26.5;       // the oval of the engraved picture
/** Disc pixels of the picture: index and local coordinates. */
export const DISC = (() => {
  const idx = [], u = [], v = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const dx = (x + 0.5 - VX) / OX, dy = (y + 0.5 - VY) / OY;
      if (dx * dx + dy * dy >= 1) continue;
      idx.push(y * W + x); u.push(x - VX); v.push(y - VY);
    }
  return { idx: Int16Array.from(idx), u: Int8Array.from(u), v: Int8Array.from(v), n: idx.length };
})();

// The lighthouse, drawn for this disc: '#' ink, 'o' paper kept clear of the
// ruled sky, 'L' the lamp. A white tower shaded on its right, two dark bands,
// a gallery, the lantern and its dome.
const LIGHT_ART = [
  '......o#o......',
  '.....o###o.....',
  '....o#####o....',
  '....o#ooo#o....',
  '....o#oLo#o....',
  '....o#ooo#o....',
  '...o#######o...',
  '...o#o#o#o#o...',
  '...o#######o...',
  '....o#oo##o....',
  '....o#oo##o....',
  '....o#oo##o....',
  '....o#####o....',
  '....o#####o....',
  '....o#oo##o....',
  '...o#ooo###o...',
  '...o#ooo###o...',
  '...o#ooo###o...',
  '...o#######o...',
  '...o#######o...',
  '...o#ooo###o...',
  '..o#oooo####o..',
  '..o#oooo####o..',
  '..o#oooo####o..',
  '..o##########o.',
  '.o#oooooo####o.',
  '.o#oooooo####o.',
];
export const LIGHT = (() => {
  const h = LIGHT_ART.length, w = LIGHT_ART[0].length, px = new Int8Array(w * h).fill(-1);
  let lx = 0, ly = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = LIGHT_ART[y][x];
      if (c === '#') px[y * w + x] = 1; else if (c === 'o') px[y * w + x] = 0;
      else if (c === 'L') { px[y * w + x] = 0; lx = x; ly = y; }
    }
  return { w, h, px, lx, ly };
})();
