// Teletext weather: a level-1 teletext decoder and a page encoder.
//
// The glass is a teletext page of 40 x 13 character cells, 4 x 6 px each
// (one cell = 2 x 3 sixels of 2 x 2 px). Every frame the scene is drawn as
// colour sixels, ENCODED into page bytes the way a teletext editor must
// (each row starts in alpha white; a colour change costs a whole cell for its
// control code, shown as a space), then DECODED to pixels like an SAA5050.
// So the medium's own accidents are real here: one foreground colour per
// cell, black gaps where colours meet, colour runs along a row.
//
// Control codes used (set-at / set-after as in ETS 300 706):
//   0x01-0x07 alpha colour (after)   0x11-0x17 mosaic colour (after)
//   0x08 flash (after)  0x09 steady (at)   0x1C black bg (at)  0x1D new bg (at)
//   0x19 contiguous (at)  0x1A separated (at)

import { to565 } from '../js/kit.js';

export const COLS = 40, ROWS = 13, CW = 4, CH = 6;
export const SW = COLS * 2, SH = ROWS * 3;              // the sixel grid: 80 x 39

/** The eight teletext colours: black red green yellow blue magenta cyan white. */
export const TT = [0x000000, 0xff2a1a, 0x18e83a, 0xfff02a, 0x2a44ff, 0xff36e8, 0x2af2ff, 0xffffff];
const T565 = TT.map(to565);

// ------------------------------------------------------------ the character set (3 x 5 in a 4 x 6 cell)

const FONT_SRC = {
  A: '.X.X.XXXXX.XX.X', B: 'XX.X.XXX.X.XXX.', C: '.XXX..X..X...XX', D: 'XX.X.XX.XX.XXX.', E: 'XXXX..XX.X..XXX',
  F: 'XXXX..XX.X..X..', G: '.XXX..X.XX.X.XX', H: 'X.XX.XXXXX.XX.X', I: 'XXX.X..X..X.XXX', J: '..X..X..XX.X.X.',
  K: 'X.XX.XXX.X.XX.X', L: 'X..X..X..X..XXX', M: 'X.XXXXXXXX.XX.X', N: 'XX.X.XX.XX.XX.X', O: '.X.X.XX.XX.X.X.',
  P: 'XX.X.XXX.X..X..', Q: '.X.X.XX.XXX..XX', R: 'XX.X.XXX.X.XX.X', S: '.XXX...X...XXX.', T: 'XXX.X..X..X..X.',
  U: 'X.XX.XX.XX.XXXX', V: 'X.XX.XX.XX.X.X.', W: 'X.XX.XXXXXXXX.X', X: 'X.XX.X.X.X.XX.X', Y: 'X.XX.X.X..X..X.',
  Z: 'XXX..X.X.X..XXX',
  0: 'XXXX.XX.XX.XXXX', 1: '.X.XX..X..X.XXX', 2: 'XX...X.X.X..XXX', 3: 'XX...X.X...XXX.', 4: 'X.XX.XXXX..X..X',
  5: 'XXXX..XX...XXX.', 6: '.XXX..XXXX.XXXX', 7: 'XXX..X.X..X..X.', 8: 'XXXX.XXXXX.XXXX', 9: 'XXXX.XXXX..XXX.',
  '/': '..X..X.X.X..X..', ':': '....X.....X....', '-': '......XXX......', '.': '.............X.', ' ': '...............',
};
/** 5 rows of 3 bits per character code. */
const FONT = new Uint8Array(128 * 5);
for (const [ch, src] of Object.entries(FONT_SRC))
  for (let r = 0; r < 5; r++) {
    let v = 0;
    for (let c = 0; c < 3; c++) if (src[r * 3 + c] === 'X') v |= 4 >> c;
    FONT[ch.charCodeAt(0) * 5 + r] = v;
  }

/** Text as page bytes: control codes as numbers, text as strings. */
export function bytes(...parts) {
  const out = [];
  for (const p of parts) {
    if (typeof p === 'number') out.push(p);
    else for (const ch of p) out.push(ch.charCodeAt(0));
  }
  return out;
}

// ------------------------------------------------------------ the decoder

/**
 * Draw a page into an RGB565 buffer (160 wide): rows [r0, r1) of `page`.
 * `flashOn` is the flash phase. Returns pixels written.
 */
export function decode(buf, page, flashOn, r0 = 0, r1 = ROWS, sepMask = null) {
  for (let r = r0; r < r1; r++) {
    let fg = 7, bg = 0, mosaic = false, flash = false, sep = false;
    const y0 = r * CH;
    for (let c = 0; c < COLS; c++) {
      const b = page[r * COLS + c];
      const x0 = c * CW;
      let mask = 0, glyph = -1;
      if (b < 0x20) {
        // set-at codes act on this cell, then it shows as a space
        if (b === 0x09) flash = false;
        else if (b === 0x19) sep = false;
        else if (b === 0x1a) sep = true;
        else if (b === 0x1c) bg = 0;
        else if (b === 0x1d) bg = fg;
      } else if (mosaic && (b & 0x20)) mask = (b & 0x1f) | ((b & 0x40) >> 1);
      else glyph = b;
      const show = !flash || flashOn;
      const F = T565[fg], Bk = T565[bg];
      if (mask && show) {
        // six sixels of 2 x 2 px; separated keeps only the top-left pixel of each
        for (let sy = 0; sy < 3; sy++)
          for (let py = 0; py < 2; py++) {
            const i = (y0 + sy * 2 + py) * 160 + x0;
            const l = (mask >> (sy * 2)) & 1, rr = (mask >> (sy * 2 + 1)) & 1;
            if (sep) {
              buf[i] = l && py === 0 ? F : Bk; buf[i + 1] = Bk;
              buf[i + 2] = rr && py === 0 ? F : Bk; buf[i + 3] = Bk;
            } else {
              buf[i] = buf[i + 1] = l ? F : Bk;
              buf[i + 2] = buf[i + 3] = rr ? F : Bk;
            }
          }
      } else if (glyph >= 0 && show) {
        for (let py = 0; py < CH; py++) {
          const v = py < 5 ? FONT[glyph * 5 + py] : 0, i = (y0 + py) * 160 + x0;
          buf[i] = v & 4 ? F : Bk; buf[i + 1] = v & 2 ? F : Bk; buf[i + 2] = v & 1 ? F : Bk; buf[i + 3] = Bk;
        }
      } else {
        for (let py = 0; py < CH; py++) { const i = (y0 + py) * 160 + x0; buf[i] = buf[i + 1] = buf[i + 2] = buf[i + 3] = Bk; }
      }
      // set-after codes take effect from the next cell
      if (b < 0x20) {
        if (b >= 0x01 && b <= 0x07) { fg = b; mosaic = false; }
        else if (b >= 0x11 && b <= 0x17) { fg = b - 0x10; mosaic = true; }
        else if (b === 0x08) flash = true;
      }
    }
  }
  return (r1 - r0) * COLS * CW * CH;
}

// ------------------------------------------------------------ the encoder

// what a sixel layer value means: colour, and how hard it fights for its cell
// 0 empty; 1 land; 2 rain; 3 vapour; 4 wind; 5 sun; 6 bolt; 7 cloud (the time); 8 struck cloud;
// 9 warm front (red), 10 cold front (blue)
export const L_LAND = 1, L_RAIN = 2, L_VAPOUR = 3, L_WIND = 4, L_SUN = 5, L_BOLT = 6, L_CLOUD = 7, L_STRUCK = 8;
export const L_WARM = 9, L_COLD = 10;
const NL = 11;
const COLOUR = [0, 2, 4, 6, 6, 3, 3, 7, 3, 1, 4];
const BONUS = [0, 0, 6, 6, 6, 6, 8, 99, 99, 9, 9];
const K_EMPTY = 0, K_GFX = 1, K_TIME = 2, K_CTRL = 3, K_FIXED = 4;

const cnt = new Int16Array(NL);

/**
 * Encode rows [r0, r1) of a sixel layer (SW x SH bytes) into page bytes.
 * `fixed` holds pre-set bytes per cell (-1 free): text, with its own codes.
 * Cells holding any part of the time keep only the time's sixels, and are
 * never given up to a control code; everything else competes for its cell.
 */
export function encode(page, layer, fixed, r0, r1) {
  for (let r = r0; r < r1; r++) {
    let fg = 7, mosaic = false, prev = K_EMPTY;
    const o = r * COLS;
    for (let c = 0; c < COLS; c++) {
      const fx = fixed[o + c];
      if (fx >= 0) {
        page[o + c] = fx; prev = K_FIXED;
        if (fx >= 0x01 && fx <= 0x07) { fg = fx; mosaic = false; } else if (fx >= 0x11 && fx <= 0x17) { fg = fx - 0x10; mosaic = true; }
        continue;
      }
      // the cell's six sixels
      const s0 = r * 3 * SW + c * 2;
      let best = 0, bestScore = 0, any = 0;
      for (let k = 0; k < 6; k++) {
        const v = layer[s0 + (k >> 1) * SW + (k & 1)];
        if (v) { any = 1; cnt[v]++; }
      }
      if (any) {
        for (let v = 1; v < NL; v++) if (cnt[v]) { const sc = cnt[v] + BONUS[v]; if (sc > bestScore) { bestScore = sc; best = v; } }
      }
      let mask = 0;
      if (best) {
        const col = COLOUR[best], time = best === L_CLOUD || best === L_STRUCK;
        for (let k = 0; k < 6; k++) {
          const v = layer[s0 + (k >> 1) * SW + (k & 1)];
          // a cell of the time shows only the time; elsewhere, everything of the winning colour
          if (time ? v === best : v && v !== L_CLOUD && v !== L_STRUCK && COLOUR[v] === col) mask |= 1 << k;
        }
      }
      for (let v = 1; v < NL; v++) cnt[v] = 0;
      if (!mask) { page[o + c] = 0x20; if (prev !== K_FIXED) prev = K_EMPTY; else prev = K_EMPTY; continue; }
      const col = COLOUR[best], kind = best === L_CLOUD || best === L_STRUCK ? K_TIME : K_GFX;
      const code = 0x20 | (mask & 0x1f) | ((mask & 0x20) << 1);
      if (mosaic && fg === col) { page[o + c] = code; prev = kind; continue; }
      if (c > 0 && (prev === K_EMPTY || prev === K_GFX || prev === K_CTRL)) {
        page[o + c - 1] = 0x10 + col; fg = col; mosaic = true;
        page[o + c] = code; prev = kind;
      } else {
        // no cell to spare before it: this cell becomes the code (never a cell of the time, by layout)
        page[o + c] = 0x10 + col; fg = col; mosaic = true; prev = K_CTRL;
      }
    }
  }
}
