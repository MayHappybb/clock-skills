// desktop-ui.js: the tiny 1995 window system the 'desktop' face runs on.
// Palette, the two typefaces (a proportional system font and a Fixedsys-like
// editor font), the cursors and icons, and the widgets: bevels, buttons,
// windows, menus, dialogs, the taskbar and the Start menu. Everything is hard
// pixels from the 16-colour VGA palette, as the real thing was.

import { makeFont, sprite } from '../js/kit.js';

// ------------------------------------------------------------ palette (VGA 16)

export const C = {
  black: 0x000000, navy: 0x000080, green: 0x008000, teal: 0x008080,
  maroon: 0x800000, purple: 0x800080, olive: 0x808000, silver: 0xc0c0c0,
  grey: 0x808080, blue: 0x0000ff, lime: 0x00ff00, cyan: 0x00ffff,
  red: 0xff0000, magenta: 0xff00ff, yellow: 0xffff00, white: 0xffffff,
  // text-mode (BIOS) palette, for the blue screen and the boot text
  tblue: 0x0000aa, tgrey: 0xaaaaaa,
};

// ------------------------------------------------------------ the system font

const T = (s) => s.split(' ');
// Caps are 6 rows (0-5), lowercase x-height 4 (rows 2-5), one descender row.
export const UI = makeFont({
  name: 'desk-ui', height: 7, spacing: 1, fallback: '?',
  glyphs: {
    A: T('.##. #..# #..# #### #..# #..#'), B: T('###. #..# ###. #..# #..# ###.'),
    C: T('.##. #..# #... #... #..# .##.'), D: T('###. #..# #..# #..# #..# ###.'),
    E: T('#### #... ###. #... #... ####'), F: T('#### #... ###. #... #... #...'),
    G: T('.##. #..# #... #.## #..# .###'), H: T('#..# #..# #### #..# #..# #..#'),
    I: T('# # # # # #'), J: T('..# ..# ..# ..# #.# .#.'),
    K: T('#..# #.#. ##.. #.#. #..# #..#'), L: T('#.. #.. #.. #.. #.. ###'),
    M: T('#...# ##.## #.#.# #.#.# #...# #...#'), N: T('#..# ##.# #.## #..# #..# #..#'),
    O: T('.##. #..# #..# #..# #..# .##.'), P: T('###. #..# #..# ###. #... #...'),
    Q: T('.##. #..# #..# #..# #.#. .#.#'), R: T('###. #..# #..# ###. #.#. #..#'),
    S: T('.### #... .##. ...# ...# ###.'), T: T('### .#. .#. .#. .#. .#.'),
    U: T('#..# #..# #..# #..# #..# .##.'), V: T('#...# #...# .#.#. .#.#. ..#.. ..#..'),
    W: T('#...# #...# #.#.# #.#.# ##.## #...#'), X: T('#..# #..# .##. .##. #..# #..#'),
    Y: T('#...# .#.#. ..#.. ..#.. ..#.. ..#..'), Z: T('#### ...# ..#. .#.. #... ####'),
    a: T('... ... .## #.# #.# .##'), b: T('#.. #.. ##. #.# #.# ##.'),
    c: T('... ... .## #.. #.. .##'), d: T('..# ..# .## #.# #.# .##'),
    e: T('... ... .#. ### #.. .##'), f: T('.# #. ## #. #. #.'),
    g: T('... ... .## #.# .## ..# ##.'), h: T('#.. #.. ##. #.# #.# #.#'),
    i: T('# . # # # #'), j: T('.# .. .# .# .# .# #.'),
    k: T('#.. #.. #.# ##. ##. #.#'), l: T('# # # # # #'),
    m: T('..... ..... ####. #.#.# #.#.# #.#.#'), n: T('... ... ##. #.# #.# #.#'),
    o: T('... ... .#. #.# #.# .#.'), p: T('... ... ##. #.# #.# ##. #..'),
    q: T('... ... .## #.# #.# .## ..#'), r: T('... ... #.# ##. #.. #..'),
    s: T('... ... .## #.. ..# ##.'), t: T('.#. .#. ### .#. .#. ..#'),
    u: T('... ... #.# #.# #.# .##'), v: T('... ... #.# #.# #.# .#.'),
    w: T('..... ..... #...# #.#.# #.#.# .#.#.'), x: T('... ... #.# .#. .#. #.#'),
    y: T('... ... #.# #.# .## ..# ##.'), z: T('... ... ### .#. #.. ###'),
    0: T('.#. #.# #.# #.# #.# .#.'), 1: T('.#. ##. .#. .#. .#. ###'),
    2: T('##. ..# ..# .#. #.. ###'), 3: T('##. ..# .#. ..# ..# ##.'),
    4: T('#.# #.# #.# ### ..# ..#'), 5: T('### #.. ##. ..# ..# ##.'),
    6: T('.## #.. ##. #.# #.# .#.'), 7: T('### ..# ..# .#. .#. .#.'),
    8: T('.#. #.# .#. #.# #.# .#.'), 9: T('.#. #.# #.# .## ..# ##.'),
    '.': T('. . . . . #'), ',': T('. . . . . # #'), ':': T('. . # . . #'),
    '-': T('.. .. .. ## .. ..'), "'": T('# # . . . .'),
    '>': T('... #.. .#. ..# .#. #..'), '<': T('... ..# .#. #.. .#. ..#'),
    '(': T('.# #. #. #. #. #. .#'), ')': T('#. .# .# .# .# .# #.'),
    '!': T('# # # # . #'), '?': T('##. ..# .#. .#. ... .#.'),
    '_': T('.... .... .... .... .... .... ####'), '*': T('... #.# .#. #.# ... ...'),
    '/': T('..# ..# .#. .#. #.. #..'), ' ': T('.. .. .. .. .. .. ..'),
  },
});

/** System text; returns the x past the last glyph. Bold is the face drawn twice. */
export function uiText(g, str, x, y, c, bold = false) {
  if (!bold) return g.text(str, x, y, { font: UI, c });
  g.text(str, x, y, { font: UI, c, spacing: 2 });
  return g.text(str, x + 1, y, { font: UI, c, spacing: 2 });
}
export const uiWidth = (str, bold = false) => (bold ? UI.measure(str, 1, 2) + 1 : UI.measure(str));

/** System text running up the screen (the Start menu's banner), baseline at x. */
export function uiTextUp(g, str, x, yBottom, c, bold = false) {
  let y = yBottom;
  for (const ch of str) {
    const gl = UI.glyph(ch);
    if (!gl) continue;
    for (let j = 0; j < gl.h; j++)
      for (let i = 0; i < gl.w; i++)
        if (gl.data[j * gl.w + i] >= 0) {
          g.pixel(x + j, y - i, c);
          if (bold) g.pixel(x + j, y - i - 1, c);
        }
    y -= gl.w + (bold ? 2 : 1);
  }
}

// ------------------------------------------------------------ the editor font
// Fixedsys-like: 2-pixel stems, 1-pixel bars, a 6 x 9 cell. Drawn at x3.

const BIG_GLYPHS = {
  0: ['.####.', '##..##', '##..##', '##.###', '###.##', '##..##', '##..##', '##..##', '.####.'],
  1: ['..##..', '.###..', '####..', '..##..', '..##..', '..##..', '..##..', '..##..', '######'],
  2: ['.####.', '##..##', '....##', '....##', '...##.', '..##..', '.##...', '##....', '######'],
  3: ['.####.', '##..##', '....##', '....##', '..###.', '....##', '....##', '##..##', '.####.'],
  4: ['...##.', '..###.', '.####.', '##.##.', '##.##.', '######', '...##.', '...##.', '...##.'],
  5: ['######', '##....', '##....', '#####.', '....##', '....##', '....##', '##..##', '.####.'],
  6: ['..###.', '.##...', '##....', '#####.', '##..##', '##..##', '##..##', '##..##', '.####.'],
  7: ['######', '....##', '....##', '...##.', '..##..', '..##..', '.##...', '.##...', '.##...'],
  8: ['.####.', '##..##', '##..##', '##..##', '.####.', '##..##', '##..##', '##..##', '.####.'],
  9: ['.####.', '##..##', '##..##', '##..##', '.#####', '....##', '....##', '...##.', '.###..'],
  ':': ['..', '..', '##', '##', '..', '..', '##', '##', '..'],
};
export const BIG = Object.fromEntries(Object.entries(BIG_GLYPHS).map(([k, v]) => [k, sprite(v)]));
export const BIG_H = 9;
/** Advance of a big character at `scale`. */
export const bigAdv = (ch, scale) => (BIG[ch].w + 1) * scale;
export function bigWidth(str, scale) {
  let w = 0;
  for (const ch of str) w += bigAdv(ch, scale);
  return w - scale;
}
/** x offsets of each character of `str`, plus the end, at `scale`. */
export function bigStops(str, scale) {
  const xs = [0];
  for (const ch of str) xs.push(xs[xs.length - 1] + bigAdv(ch, scale));
  return xs;
}

// ------------------------------------------------------------ sprites

const K = C.black, Wh = C.white, S = C.silver, G = C.grey;
export const ARROW = sprite(`
  K.......
  KK......
  KWK.....
  KWWK....
  KWWWK...
  KWWWWK..
  KWWWWWK.
  KWWWWWWK
  KWWWKKKK
  KWKWWK..
  KK.KWK..
  K...KWK.
  ....KK..`, { K, W: Wh });
export const HOURGLASS = sprite(`
  KKKKKKK
  KWWWWWK
  .KSSSK.
  .KWSWK.
  ..KSK..
  ..KWK..
  .KWWWK.
  .KWSWK.
  KSSSSSK
  KWWWWWK
  KKKKKKK`, { K, W: Wh, S: K });
export const MINIGLASS = sprite(`
  KKKKK
  KWWWK
  .KKK.
  ..K..
  .KWK.
  KKKKK
  KKKKK`, { K, W: Wh });
export const IBEAM = sprite(`
  ##.##
  ..#..
  ..#..
  ..#..
  ..#..
  ..#..
  ..#..
  ..#..
  ..#..
  ..#..
  ##.##`);

export const ICON_COMPUTER = sprite(`
  .KKKKKKKKKK..
  .KWWWWWWWWSK.
  .KWNNNNNNKSK.
  .KWNCNNNNKSK.
  .KWNNNNNNKSK.
  .KWNNNNNNKSK.
  .KWKKKKKKKSK.
  .KSSSSSSSSGK.
  .KKKKKKKKKKK.
  ...KSSSSGK...
  KKKKKKKKKKKKK
  KWWWWWWWWWWSK
  KSGSGSGSGSGSK
  KKKKKKKKKKKKK`, { K, W: Wh, S, G, N: C.navy, C: C.cyan });
export const ICON_BIN = sprite(`
  ..KKKKKKKK..
  .KWWWWWWWWK.
  KWSSSSSSSSGK
  .KKKKKKKKKK.
  .KWSGWSGWSK.
  .KWSGWSGWSK.
  ..KSGWSGWK..
  ..KSGWSGWK..
  ..KSGWSGWK..
  ..KWSGWSGK..
  ...KKKKKK...`, { K, W: Wh, S, G });
export const ICON_PAD = sprite(`
  KKKKKKK
  KWWWWWK
  KWNNNWK
  KWWWWWK
  KWNNNWK
  KWWWWWK
  KKKKKKK`, { K, W: Wh, N: C.navy });
export const ICON_ERROR = sprite(`
  ...RRRRR...
  ..RRRRRRR..
  .RRWRRRWRR.
  RRRWWRWWRRR
  RRRRWWWRRRR
  RRRRRWRRRRR
  RRRRWWWRRRR
  RRRWWRWWRRR
  .RRWRRRWRR.
  ..RRRRRRR..
  ...RRRRR...`, { R: C.red, W: Wh });
export const FLAG = sprite(`
  RRR.GGG
  RRR.GGG
  RRR.GGG
  .......
  BBB.YYY
  BBB.YYY`, { R: C.red, G: C.lime, B: C.blue, Y: C.yellow });
export const ICON_FOLDER = sprite(`
  .YYY....
  YWWWYYYY
  YWYYYYYO
  YYYYYYYO
  YYYYYYYO
  OOOOOOOO`, { Y: C.yellow, W: Wh, O: C.olive });
export const ICON_DOC = sprite(`
  KKKKK.
  KWWWKK
  KWNNWK
  KWWWWK
  KWNNWK
  KKKKKK`, { K, W: Wh, N: C.navy });
const GLYPH = (pic) => sprite(pic);
export const G_CLOSE = GLYPH(['#...#', '.#.#.', '..#..', '.#.#.', '#...#']);
export const G_MIN = GLYPH(['....', '....', '....', '###.', '###.']);
export const G_MAX = GLYPH(['#####', '#####', '#...#', '#...#', '#####']);
export const G_RESTORE = GLYPH(['.####', '.#..#', '####.', '#..#.', '####.']);
export const G_UP = GLYPH(['..#..', '.###.', '#####']);
export const G_DOWN = GLYPH(['#####', '.###.', '..#..']);
export const G_RIGHT = GLYPH(['#..', '##.', '###', '##.', '#..']);
export const G_SPEAKER = GLYPH(['..#..', '.##.#', '###..', '.##.#', '..#..']);

// ------------------------------------------------------------ widgets

/** Two-colour 1-pixel edge: top/left in `tl`, bottom/right in `br`. */
export function edge(g, x, y, w, h, tl, br) {
  g.fillRect(x, y, w - 1, 1, tl); g.fillRect(x, y, 1, h - 1, tl);
  g.fillRect(x, y + h - 1, w, 1, br); g.fillRect(x + w - 1, y, 1, h, br);
}
export function raised(g, x, y, w, h, fill = C.silver) {
  g.fillRect(x, y, w, h, fill);
  edge(g, x, y, w, h, C.white, C.black);
  edge(g, x + 1, y + 1, w - 2, h - 2, fill, C.grey);
}
export function pressed(g, x, y, w, h, fill = C.silver) {
  g.fillRect(x, y, w, h, fill);
  edge(g, x, y, w, h, C.black, C.white);
  edge(g, x + 1, y + 1, w - 2, h - 2, C.grey, fill);
}
export function sunken(g, x, y, w, h, fill = C.white) {
  g.fillRect(x, y, w, h, fill);
  edge(g, x, y, w, h, C.grey, C.white);
  edge(g, x + 1, y + 1, w - 2, h - 2, C.black, C.silver);
}
/** The 50 % white-on-silver checker of scrollbar tracks and held buttons. */
export function checker(g, x, y, w, h) {
  g.fillRect(x, y, w, h, C.silver);
  for (let j = 0; j < h; j++) for (let i = (j + x + y) & 1; i < w; i += 2) g.pixel(x + i, y + j, C.white);
}

/** A push button with a label; `down` draws it held, `def` the default frame. */
export function button(g, x, y, w, h, label, { down = false, def = false } = {}) {
  if (def) { g.rect(x - 1, y - 1, w + 2, h + 2, C.black); }
  (down ? pressed : raised)(g, x, y, w, h);
  const tw = uiWidth(label);
  const o = down ? 1 : 0;
  uiText(g, label, x + ((w - tw) >> 1) + o, y + ((h - 7) >> 1) + 1 + o, C.black);
}

export function smallButton(g, x, y, glyph, down = false) {
  (down ? pressed : raised)(g, x, y, 9, 7);
  g.blit(glyph, x + 2 + (down ? 1 : 0), y + 1 + (down ? 1 : 0), { c: C.black });
}

/** Window frame and caption. Returns the client box below the caption. */
export function frame(g, x, y, w, h, title, { active = true, icon = ICON_PAD, buttons = 'mmc', maxed = false, down = '' } = {}) {
  g.fillRect(x, y, w, h, C.silver);
  edge(g, x, y, w, h, C.silver, C.black);
  edge(g, x + 1, y + 1, w - 2, h - 2, C.white, C.grey);
  const tx = x + 3, ty = y + 3, tw = w - 6;
  g.fillRect(tx, ty, tw, 9, active ? C.navy : C.grey);
  let lx = tx + 1;
  if (icon) { g.blit(icon, tx + 1, ty + 1); lx = tx + 10; }
  let bx = tx + tw - 10;
  const btns = [];
  if (buttons.includes('c')) { btns.push(['c', bx]); bx -= 11; }
  if (buttons.includes('m')) { btns.push(['x', bx]); bx -= 9; btns.push(['n', bx]); bx -= 2; }
  g.clip(lx, ty, bx - lx, 9);
  uiText(g, title, lx, ty + 1, active ? C.white : C.silver, true);
  g.unclip();
  for (const [k, px] of btns)
    smallButton(g, px, ty + 1, k === 'c' ? G_CLOSE : k === 'x' ? (maxed ? G_RESTORE : G_MAX) : G_MIN, down === k);
  return { x: x + 3, y: ty + 9, w: w - 6, h: h - 12 - 3 };
}

/** Positions of a window's caption buttons (for the cursor to aim at). */
export function captionButtons(x, y, w) {
  const tx = x + 3, ty = y + 3, tw = w - 6;
  const close = tx + tw - 10, max = close - 11, min = max - 9;
  return { close: [close + 4, ty + 4], max: [max + 4, ty + 4], min: [min + 4, ty + 4] };
}

/** A drop-down or pop-up menu. items: strings, '-' for a rule; `hi` the lit row. */
export function menu(g, x, y, items, hi = -1, { w, arrows = [] } = {}) {
  const width = w ?? Math.max(...items.map((s) => (s === '-' ? 0 : uiWidth(s)))) + 16;
  let h = 4;
  for (const s of items) h += s === '-' ? 4 : 8;
  raised(g, x, y, width, h);
  let yy = y + 2;
  items.forEach((s, i) => {
    if (s === '-') { g.fillRect(x + 3, yy + 1, width - 6, 1, C.grey); g.fillRect(x + 3, yy + 2, width - 6, 1, C.white); yy += 4; return; }
    const lit = i === hi;
    if (lit) g.fillRect(x + 2, yy, width - 4, 8, C.navy);
    uiText(g, s, x + 8, yy + 1, lit ? C.white : C.black);
    if (arrows.includes(i)) g.blit(G_RIGHT, x + width - 7, yy + 1, { c: lit ? C.white : C.black });
    yy += 8;
  });
  return { w: width, h };
}
/** The y of the middle of menu row `i`. */
export function menuRowY(y, items, i) {
  let yy = y + 2;
  for (let k = 0; k < i; k++) yy += items[k] === '-' ? 4 : 8;
  return yy + 4;
}
/** Which row of a menu is under y (or -1). */
export function menuRowAt(y, items, py) {
  let yy = y + 2;
  for (let k = 0; k < items.length; k++) {
    const hh = items[k] === '-' ? 4 : 8;
    if (py >= yy && py < yy + hh) return items[k] === '-' ? -1 : k;
    yy += hh;
  }
  return -1;
}
