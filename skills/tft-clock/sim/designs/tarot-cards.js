// tarot: the cards themselves. Palette, an inked pen, the Roman numerals,
// the blank face and the back (both drawn once), the four suits' pips, and
// drawFace(), which lays one whole card face onto the canvas.
//
// The look is the Tarot de Marseille: black woodblock lines over flat
// stencil colours (red, blue, sky, yellow, flesh, green) on cream paper.

import { Gfx, font3x5, rand, cos, sprite } from '../js/kit.js';
import { ART, FOOL_ART } from './tarot-art.js';
import { INK, PAPER, PAPER2, RED, BLUE, SKY, YEL, FLESH, GREEN, WHITE, CW, CH, PX, PY, PW, PH, pen } from './tarot-ink.js';
export { INK, PAPER, RED, BLUE, SKY, YEL, FLESH, GREEN, WHITE, CW, CH, pen };

// ------------------------------------------------------------ Roman numerals
// Woodcut capitals 9 px tall: a thick left stroke, a thin right one, serifs.

const GLYPH = {
  I: sprite(`
    ####
    .##.
    .##.
    .##.
    .##.
    .##.
    .##.
    .##.
    ####`),
  V: sprite(`
    ###..##
    .##...#
    .##...#
    ..##.#.
    ..##.#.
    ..##.#.
    ...###.
    ...##..
    ...#...`),
  X: sprite(`
    ###.###
    .##..#.
    ..##.#.
    ...##..
    ...##..
    ..#.##.
    ..#..##
    .#...##
    ###.###`),
  O: sprite(`
    .####.
    ##..##
    ##..##
    ##..##
    ##..##
    ##..##
    ##..##
    ##..##
    .####.`),
};
export function romanWidth(s) {
  let w = 0;
  for (const ch of s) w += GLYPH[ch].w + 1;
  return w - 1;
}
export function roman(g, s, cx, y, c = INK) {
  let x = Math.round(cx - romanWidth(s) / 2);
  for (const ch of s) { g.blit(GLYPH[ch], x, y, { c }); x += GLYPH[ch].w + 1; }
}
const ROMAN = ['O', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
export const romanOf = (n) => ROMAN[n];

// ------------------------------------------------------------ blank face and back, drawn once

const KEY = 0xff00ff;
function cardShape(c, fill) {
  c.clear(KEY);
  c.fillRect(0, 0, CW, CH, INK);
  c.fillRect(1, 1, CW - 2, CH - 2, fill);
  for (const [x, y] of [[0, 0], [CW - 1, 0], [0, CH - 1], [CW - 1, CH - 1]]) c.pixel(x, y, KEY);
  for (const [x, y] of [[1, 1], [CW - 2, 1], [1, CH - 2], [CW - 2, CH - 2]]) c.pixel(x, y, INK);
}

export const BLANK = new Gfx(CW, CH);
cardShape(BLANK, PAPER);
for (let y = 1; y < CH - 1; y++)                       // the paper's grain
  for (let x = 1; x < CW - 1; x++) if (rand(x, y, 7) < 0.07) BLANK.pixel(x, y, PAPER2);
BLANK.rect(2, 2, CW - 4, CH - 4, INK);                 // the printed frame
BLANK.fillRect(2, 14, CW - 4, 1, INK);                 // under the number
BLANK.fillRect(2, 53, CW - 4, 1, INK);                 // over the title

export const BACK = new Gfx(CW, CH);
{
  cardShape(BACK, PAPER);
  const DB = 0x203f86;
  BACK.fillRect(3, 3, CW - 6, CH - 6, DB);
  BACK.rect(2, 2, CW - 4, CH - 4, INK);
  for (let y = 3; y < CH - 3; y++)
    for (let x = 3; x < CW - 3; x++) {
      const a = (x + y) % 8, b = (x - y + 64) % 8;
      if (a === 0 || b === 0) BACK.pixel(x, y, RED);
      else if (a === 4 && b === 4) BACK.pixel(x, y, YEL);
    }
  BACK.fillEllipse(CW / 2, CH / 2, 9, 13, INK);
  BACK.fillEllipse(CW / 2, CH / 2, 8, 12, PAPER);
  BACK.fillEllipse(CW / 2, CH / 2, 5, 8, RED);
  BACK.fillEllipse(CW / 2, CH / 2, 2, 4, YEL);
}
export const BACK_KEY = KEY;

// ------------------------------------------------------------ pips

const PAL = { k: INK, y: YEL, r: RED, b: SKY, B: BLUE, w: WHITE, g: GREEN, p: PAPER };
export const PIPS = {
  CUPS: sprite(`
    kkkkkkkkk
    kyrrrrryk
    kyyyyyyyk
    .kyyyyyk.
    ..kkykk..
    ...kyk...
    ...kyk...
    ..kyyyk..
    .kkkkkkk.`, PAL),
  SWORDS: sprite(`
    ....k....
    ...kwk...
    ...kbk...
    ...kbk...
    .kkkbkkk.
    kyyyyyyyk
    .kkkrkkk.
    ...krk...
    ...kyk...`, PAL),
  WANDS: sprite(`
    ......kkk
    .....kggk
    ....kryk.
    ...kryk..
    ..kryk...
    .kryk....
    kggk.....
    kgk......
    kk.......`, PAL),
};

/** A coin face-on (k = 1) or turned (k -> 0): its width is the spin. */
function coin(g, cx, cy, k) {
  const rx = Math.max(0.6, 4.5 * Math.abs(k));
  g.fillEllipse(cx, cy, rx, 4.5, INK);
  if (rx > 1.3) g.fillEllipse(cx, cy, rx - 1, 3.5, YEL);
  if (rx > 2.6) {
    g.fillEllipse(cx, cy, rx * 0.45, 1.7, RED);
    g.fillEllipse(cx, cy, 0.6, 0.6, INK);
  }
}

// Dice-face layouts on a 3x3 grid: readable at a glance, like a die.
const LAYOUT = {
  1: [[1, 1]], 2: [[1, 0], [1, 2]], 3: [[1, 0], [1, 1], [1, 2]],
  4: [[0, 0], [2, 0], [0, 2], [2, 2]], 5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
  6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]],
  7: [[0, 0], [2, 0], [0, 1], [1, 1], [2, 1], [0, 2], [2, 2]],
  8: [[0, 0], [1, 0], [2, 0], [0, 1], [2, 1], [0, 2], [1, 2], [2, 2]],
  9: [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [0, 2], [1, 2], [2, 2]],
};
const GX = [7, 16, 25], GY = [7, 19, 31];

function pips(g, ox, oy, suit, n, t, seed) {
  // A glint runs across the pips every few seconds; coins spin in a wave.
  const cyc = 6.5, ph = ((t + seed * 1.7) % cyc) / cyc;           // 0..1 through the cycle
  for (const [i, j] of LAYOUT[n]) {
    const cx = ox + GX[i], cy = oy + GY[j];
    const sweep = ph * 1.6 - (i + j) * 0.12;                       // diagonal wave front
    if (suit === 'COINS') {
      const u = sweep > 0 && sweep < 0.35 ? sweep / 0.35 : 0;
      coin(g, cx, cy, cos(u * Math.PI * 2));
    } else {
      g.blit(PIPS[suit], cx - 4, cy - 4);
      if (sweep > 0.05 && sweep < 0.25) { g.pixel(cx - 2, cy - 2, WHITE); g.pixel(cx - 1, cy - 3, WHITE); }
    }
  }
}

// ------------------------------------------------------------ one whole face

export const TITLES = ['FOOL', 'MAGICIAN', 'PAPESSE', 'EMPRESS', 'EMPEROR', 'THE POPE', 'LOVERS',
  'CHARIOT', 'JUSTICE', 'HERMIT', 'FORTUNE', 'STRENGTH', 'HANGED'];

/**
 * Lay a card face with its top-left at (x, y).
 * card: { kind: 'major', n: 1..12 } | { kind: 'pip', suit, n: 1..9 } | { kind: 'fool' }
 * t: animation seconds; sec: wall-clock seconds in the minute (the wheel turns with them).
 */
export function drawFace(g, x, y, card, t, sec) {
  g.draw(BLANK, x, y, { key: KEY });
  const num = card.kind === 'major' ? ROMAN[card.n] : card.kind === 'pip' ? ROMAN[card.n] : 'O';
  roman(g, num, x + CW / 2, y + 4);
  const title = card.kind === 'pip' ? card.suit : card.kind === 'fool' ? 'FOOL' : TITLES[card.n];
  let tw = -1;
  for (const ch of title) tw += (ch === ' ' ? 2 : 3) + 1;
  g.text(title, x + Math.round((CW - tw) / 2), y + 55, { font: font3x5, c: INK });
  const ox = x + PX, oy = y + PY;
  g.clip(ox, oy, PW, PH);
  if (card.kind === 'pip') pips(g, ox, oy, card.suit, card.n, t, card.seed ?? 0);
  else (card.kind === 'fool' ? FOOL_ART : ART[card.n])(pen(g, ox, oy), t, sec);
  g.unclip();
}
