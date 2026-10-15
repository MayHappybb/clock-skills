// Tattoo Flash art: the palette, the sprites (coil machine, swallow, star,
// ink caps), the banner lettering, and the sheet itself (paper, tape, banner),
// which is painted once a day into a 25.6 KB background buffer.
import { sprite, to565, Gfx } from '../js/kit.js';

// ------------------------------------------------------------ palette
// American traditional: black, red, green, yellow, skin, a white highlight,
// on yellowed paper; the stencil's purple only while a design is transferred.
export const PAL = {
  paper: 0xe9d9a9, edge: 0xd9c38c, fox: 0xcdb27c, tape: 0xf2e9c6, tapeEdge: 0xd8cba0,
  black: 0x1c1714, red: 0xc8281f, green: 0x2e8a3c, yellow: 0xf2bf3a, skin: 0xebb58c, white: 0xf7f1e1,
  stencil: 0x5a46aa,
};
// by night the sheet is lit by one lamp: the paper drops to a warm mid tone so the backlight can stay up
export const PAL_NIGHT = { ...PAL, paper: 0xb9a578, edge: 0xa8936a, fox: 0xa48c62, tape: 0xc4b48c, tapeEdge: 0xa89870, white: 0xe6dcc0 };

const K = PAL.black;
const SP = (pic, extra = {}) => sprite(pic, { k: K, r: PAL.red, g: PAL.green, y: PAL.yellow, w: PAL.white, s: PAL.skin, p: PAL.paper, ...extra });

// ------------------------------------------------------------ the coil machine (needle tip at TIP)
export const MACHINE = SP(`
  .......kkk.......
  ......kyyyk......
  .kkkkkkkkkkkkkkk.
  .kwwwwwwwwwwwwwk.
  .kkkkkkkkkkkkkkk.
  ..kkk.kkrrkkrrk..
  ..kyk.krkrkrkrk..
  ..kyk.kkrrkkrrk..
  ..kyk.krkrkrkrk..
  ..kyk.kkrrkkrrk..
  .kkkkkkkkkkkkkkk.
  .kyyyyyyyyyyyyyk.
  .kkkkkkkkkkkkkkk.
  .kkkkk...........
  .kwkwk...........
  .kkkkk...........
  .kwkwk...........
  .kkkkk...........
  ..kwk............
  ..kwk............
  ..kwk............
  ...k.............`);
export const TIP = [3, 21];

// ------------------------------------------------------------ the swallow, from above, flying right (two wing beats)
export const SWALLOW = [SP(`
  ...kk................
  ...kwk...............
  ....kwk..............
  .....kwk.............
  ......kwk............
  .......kwk.....kkk...
  kk......kkk..kkkkk...
  .kkk...kkkkkkkkwkkkkk
  ..kkkkkkkkkkkkkrrk...
  .kk..kkwwwwwwwwrrk...
  kk.....kkwwwwwkkk....
  ..........kkkk.......
  .....................
  .....................
  .....................`), SP(`
  .....................
  .....................
  .....................
  .....................
  .....................
  ...............kkk...
  kk...........kkkkk...
  .kkk...kkkkkkkkwkkkkk
  ..kkkkkkkkkkkkkrrk...
  .kk..kkkwkwwwwwrrk...
  kk....kwk.kkwwwkk....
  .....kwk....kkkk.....
  ....kwk..............
  ...kwk...............
  ...kk................`)];

// ------------------------------------------------------------ the colon: two stars
export const STAR = [SP(`
  ....k....
  ...krk...
  ...krk...
  kkkkrkkkk
  .krrrrrk.
  ..krrrk..
  .krrkrrk.
  .krk.krk.
  .kk...kk.`), SP(`
  ....k....
  ...kyk...
  ...kyk...
  kkkkykkkk
  .kyyyyyk.
  ..kyyyk..
  .kyykyyk.
  .kyk.kyk.
  .kk...kk.`)];

// ------------------------------------------------------------ banner lettering: block caps with a red drop shadow
const LET = {
  M: '#...#/##.##/#.#.#/#.#.#/#...#/#...#/#...#', O: '.###./#...#/#...#/#...#/#...#/#...#/.###.',
  N: '#...#/##..#/#.#.#/#..##/#...#/#...#/#...#', D: '####./#...#/#...#/#...#/#...#/#...#/####.',
  A: '.###./#...#/#...#/#####/#...#/#...#/#...#', Y: '#...#/#...#/.#.#./..#../..#../..#../..#..',
  T: '#####/..#../..#../..#../..#../..#../..#..', U: '#...#/#...#/#...#/#...#/#...#/#...#/.###.',
  E: '#####/#..../#..../####./#..../#..../#####', S: '.####/#..../#..../.###./....#/....#/####.',
  W: '#...#/#...#/#...#/#.#.#/#.#.#/##.##/#...#', H: '#...#/#...#/#...#/#####/#...#/#...#/#...#',
  R: '####./#...#/#...#/####./#.#../#..#./#...#', I: '###/.#./.#./.#./.#./.#./###',
  F: '#####/#..../#..../####./#..../#..../#....',
};
const DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

/** Paint the weekday onto a canvas, centred on cx, top y, with the red drop shadow. */
function letter(g, word, cx, y, c, shadow) {
  const rows = [...word].map((ch) => LET[ch].split('/'));
  const wid = rows.reduce((a, r) => a + r[0].length + 1, -1);
  let x = Math.round(cx - wid / 2);
  for (const r of rows) {
    for (let j = 0; j < 7; j++) for (let i = 0; i < r[j].length; i++) if (r[j][i] === '#') {
      g.pixel(x + i + 1, y + j + 1, shadow);
    }
    x += r[0].length + 1;
  }
  x = Math.round(cx - wid / 2);
  for (const r of rows) {
    for (let j = 0; j < 7; j++) for (let i = 0; i < r[j].length; i++) if (r[j][i] === '#') g.pixel(x + i, y + j, c);
    x += r[0].length + 1;
  }
}

// ------------------------------------------------------------ the sheet

export const CAPS = [[28, PAL.black], [38, PAL.red], [48, PAL.green], [58, PAL.yellow]];
export const CAP_Y = 71;
export const BANNER = { x0: 88, x1: 154, y0: 4, y1: 16 };

/** The day's sheet: paper, aged edge, tape, foxing, the weekday banner, the ink caps. */
export function paintSheet(wday, P) {
  const g = new Gfx(160, 80);
  g.clear(P.paper);
  // the aged edge, the paper browned where it was handled
  g.rect(0, 0, 160, 80, P.edge); g.rect(1, 1, 158, 78, P.edge);
  // foxing
  for (const [x, y, w, h] of [[77, 6, 2, 2], [80, 9, 1, 1], [151, 20, 2, 1], [44, 60, 1, 1], [6, 58, 2, 2], [82, 70, 2, 1]]) g.fillRect(x, y, w, h, P.fox);
  // tape over two corners
  g.fillPolygon([[0, 0], [11, 0], [0, 11]], P.tape); g.thickLine(11, 0, 0, 11, 1, P.tapeEdge);
  g.fillPolygon([[160, 80], [149, 80], [160, 69]], P.tape); g.thickLine(149, 80, 160, 69, 1, P.tapeEdge);
  // the banner: a blank scroll, its tails folded behind
  const { x0, x1, y0, y1 } = BANNER;
  for (const [s, xe] of [[-1, x0], [1, x1]]) {
    const xa = xe + s * 3, xb = xe + s * 13, top = y0 + 5, bot = y1 + 5;
    const pts = [[xa, top], [xb, top], [xb - s * 4, (top + bot) / 2], [xb, bot], [xa, bot]];
    g.fillPolygon(pts, P.black);
    g.fillPolygon([[xa, top + 1.5], [xb - s * 2, top + 1.5], [xb - s * 5.5, (top + bot) / 2], [xb - s * 2, bot - 1.5], [xa, bot - 1.5]], P.red);
    g.fillPolygon([[xe - s * 1, y1 - 0.5], [xe + s * 4, y1 - 0.5], [xe + s * 4, y1 + 5.5]], P.black);   // the fold
  }
  g.fillRect(x0, y0, x1 - x0, y1 - y0 + 1, P.black);
  g.fillRect(x0 + 1, y0 + 1, x1 - x0 - 2, y1 - y0 - 1, P.white);
  letter(g, DAYS[wday], (x0 + x1) / 2, y0 + 3, P.black, P.red);
  // the ink caps on the bench: little cones, each full to the brim
  for (const [x, c] of CAPS) {
    g.fillPolygon([[x - 0.5, CAP_Y], [x + 7.5, CAP_Y], [x + 6.5, CAP_Y + 6], [x + 0.5, CAP_Y + 6]], P.black);
    g.fillRect(x + 1, CAP_Y + 2, 6, 3, P.white);
    g.fillRect(x, CAP_Y - 1, 8, 2, P.black);
    g.fillRect(x + 1, CAP_Y - 1, 6, 1, c === P.black ? 0x3a3430 : c);
  }
  return Uint16Array.from(g.buf);
}

// ink caps, bottom left: black, red, green, yellow

export const C565 = (c) => to565(c);
