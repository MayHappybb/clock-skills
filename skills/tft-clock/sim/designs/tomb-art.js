// The wall of "tomb": pigments, the painted frame (Nut arching over the
// register, the dado, the column of signs) and the small painted things.
// Everything here is built once at load: two 160 x 80 RGB565 walls (day and
// night, 51 KB of flash on the device) and a few sprites.

import { Gfx, sprite, to565, rand, noise2 } from '../js/kit.js';

export const W = 160, H = 80;

// ------------------------------------------------------------ pigments
// The tomb painter's whole box: gypsum white, carbon black, red and yellow
// ochre, Egyptian blue (frit), malachite green, and the mud brick under the
// plaster where it has flaked.
export const P = {
  plaster: 0xe9dab6, plaster2: 0xdfcda5, mud: 0x8c6a48, mudD: 0x6a4e34,
  ink: 0x221c18, red: 0xb63c26, redL: 0xd06a4a, ochre: 0xdea53a, ochreL: 0xf0cf7c, ochreD: 0xa8742a,
  blue: 0x2c5ca8, blueD: 0x1c3a74, blueL: 0x6f98d4, green: 0x3a8a56, greenL: 0x8cc47e, greenD: 0x24603a,
  white: 0xf6f0e0, sketch: 0xc4573a, grid: 0xdcb496,
};
// by night the plaster is in the lamp's shadow: a darker warm buff, so the
// keyline still reads and the pigments still sit lighter than the wall
export const PN = { plaster: 0x9c825a, plaster2: 0x927852, mud: 0x5e4630, mudD: 0x45331f };

// ------------------------------------------------------------ geometry of the wall
export const BAND_Y1 = 10;            // Nut's body: rows 0..9, its keyline row 10
export const ARM_X1 = 7;              // her arms: columns 0..6, keyline 7
export const LEG_X0 = 152;            // her legs: keyline 152, columns 153..159
export const GROUND = 72;             // the register's ground line
export const SUB_Y = 58;              // the minutes' sub-register line
export const NILE = { x0: 93, x1: LEG_X0, y0: 59, y1: GROUND };
export const COL = { x0: 81, x1: 91 };   // the column of signs between hours and minutes

// ------------------------------------------------------------ sprites
export const STAR = sprite(`
  ..y..
  .yyy.
  yyyyy
  .y.y.`, { y: P.ochreL });

const NUT_HEAD = sprite(`
  kkkkk....
  kkkkkk...
  kkkkyyy..
  kkkkyyyy.
  kkkyykyyy
  kkkyyyyy.
  kkkkyyyr.
  kkkkyyy..
  kkkkky...
  kkkk.....
  kkk......`, { k: P.ink, y: P.ochre, r: P.red });

const HAND = sprite(`
  bbbbbb..
  bbbbbbbb
  bbbbbbbb`, { b: P.blue });
const FOOT = sprite(`
  ...bbbbb
  .bbbbbbb
  bbbbbbbb`, { b: P.blue });

export const ANKH = sprite(`
  ..bbb..
  .b...b.
  .b...b.
  ..b.b..
  bbbbbbb
  ...b...
  ...b...
  ...b...
  ...b...`, { b: P.blueL });

export const FISH = sprite(`
  ...rrrr..r
  .rrwrrrrrr
  rkrrrrrrr.
  .rrrrrrrrr
  ...rrrr..r`, { r: P.redL, w: P.white, k: P.ink });

export const LOTUS = sprite(`
  w.w.w
  .www.
  ..g..
  ..g..`, { w: P.blueL, g: P.green });

/** The solar barque: a papyrus boat with the red disk of Ra, 24 x 9. */
export const BARQUE = sprite(`
  ..........rrrr..........
  .........rrrrrr.........
  ........rrrrrrrr........
  ........rrrrrrrr........
  .........rrrrrr.........
  y.........rrrr.........y
  yy...kkkkkkkkkkkkkk...yy
  .yyyyyyyyyyyyyyyyyyyyyy.
  ..kkkkkkkkkkkkkkkkkkkk..`, { r: P.red, y: P.ochreL, k: P.ink });

// the grey heron of the marsh, facing left: standing, striking, with its catch
const HP = { k: P.ink, w: P.white, y: P.ochre, g: 0xb8bcc0, r: P.redL };
export const HERON = [sprite(`
  .....kk.....
  ....kwwk....
  yyyywkwk....
  ....kwwk....
  .....kwk....
  .....kwk....
  ....kwwwkk..
  ...kwggggwk.
  ...kwwgggggk
  ....kkkkkkk.
  ......k.k...
  ......k.k...`, HP), sprite(`
  ............
  ............
  ............
  ............
  ......kkk...
  .....kwwwk..
  ....kwwwwkk.
  ...kwwgggwk.
  ..kwwwgggggk
  .kwkkkkkkkk.
  kwk...k.k...
  yk....k.k...`, HP), sprite(`
  .....kk.....
  ....kwwk....
  yyyywkwk....
  rrr.kwwk....
  .....kwk....
  .....kwk....
  ....kwwwkk..
  ...kwggggwk.
  ...kwwgggggk
  ....kkkkkkk.
  ......k.k...
  ......k.k...`, HP)];

// the hands at the ends of the sun's rays (Amarna style), 3 x 2
export const RAYHAND = sprite(`
  rrr
  r.r`, { r: P.red });

// ------------------------------------------------------------ the wall
function buildWall(pal) {
  const g = new Gfx(W, H);
  // plaster: two near tones, mottled the way a hand-floated gypsum coat is
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const n = noise2(x / 5, y / 4, 7) * 0.7 + noise2(x / 1.7, y / 1.7, 9) * 0.3;
      g.buf[y * W + x] = to565(n > 0.74 ? pal.plaster2 : pal.plaster);
    }
  // flaked patches: mud brick showing through, ragged edges (kept off the numerals)
  for (const [cx, cy, rx, ry, sd] of [[11, 74, 5, 2.4, 1], [96, 13, 4, 1.6, 2], [146, 13, 4, 2, 3], [79, 74, 4, 2, 4], [88, 64, 1.8, 3.6, 5]]) {
    for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++)
      for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, d = dx * dx + dy * dy + (rand(x, y, sd) - 0.5) * 0.7;
        if (d < 1) g.buf[y * W + x] = to565(d > 0.55 ? pal.mudD : pal.mud);
      }
  }
  // the dado below the ground line: register stripes
  const rows = [[GROUND, P.ink], [GROUND + 1, P.ochre], [GROUND + 2, P.ochre], [GROUND + 3, P.red], [GROUND + 4, P.ink], [GROUND + 5, P.blue], [GROUND + 6, P.blue], [GROUND + 7, P.ink]];
  for (const [y, c] of rows) g.fillRect(0, y, W, 1, c);
  // re-flake one patch over the dado (the paint is old)
  for (let x = 6; x < 17; x++) for (let y = GROUND + 1; y < H - 1; y++) {
    const dx = (x + 0.5 - 11) / 5, dy = (y + 0.5 - 75.5) / 2.2, d = dx * dx + dy * dy + (rand(x, y, 11) - 0.5) * 0.6;
    if (d < 1) g.buf[y * W + x] = to565(d > 0.5 ? pal.mudD : pal.mud);
  }
  // the minutes' sub-register line and the Nile's frame
  g.fillRect(COL.x1 + 1, SUB_Y, LEG_X0 - COL.x1 - 1, 1, P.ink);
  // the column of signs: two thin blue rules
  g.fillRect(COL.x0, BAND_Y1 + 1, 1, GROUND - BAND_Y1 - 1, P.blueL);
  g.fillRect(COL.x1, BAND_Y1 + 1, 1, GROUND - BAND_Y1 - 1, P.blueL);
  g.blit(ANKH, COL.x0 + 2, 14);
  g.blit(ANKH, COL.x0 + 2, 59);

  // ---- Nut, the sky, arching over the register: body along the top, arms down
  // the left to the earth, legs down the right
  g.fillRect(0, 0, W, BAND_Y1, P.blue);
  g.fillRect(0, 0, ARM_X1, GROUND - 3, P.blue);
  g.fillRect(LEG_X0 + 1, 0, W - LEG_X0 - 1, GROUND - 3, P.blue);
  g.fillRect(ARM_X1, BAND_Y1, LEG_X0 - ARM_X1 + 1, 1, P.ink);
  g.fillRect(ARM_X1, BAND_Y1, 1, GROUND - 3 - BAND_Y1, P.ink);
  g.fillRect(LEG_X0, BAND_Y1, 1, GROUND - 3 - BAND_Y1, P.ink);
  // the inner corners rounded a little
  for (const [x, y] of [[ARM_X1 + 1, BAND_Y1 + 1], [LEG_X0 - 1, BAND_Y1 + 1]]) g.pixel(x, y, P.ink);
  // hands and feet on the ground line
  g.blit(HAND, 0, GROUND - 3);
  g.fillRect(ARM_X1 + 1, GROUND - 3, 1, 1, P.ink);
  g.blit(FOOT, LEG_X0 - 2, GROUND - 3);
  // her head hangs at the left end, facing into the register
  g.blit(NUT_HEAD, 0, BAND_Y1 - 1);
  return g.buf;
}

export const WALL = buildWall(P), WALL_N = buildWall({ ...P, ...PN });

// the stars on her body (fixed places; a few twinkle in the frame)
export const STARS = [];
for (let x = 4, k = 0; x < W - 4; x += 9, k++) STARS.push([x + (k & 1 ? 2 : 0), k & 1 ? 1 : 5]);
for (let y = 18, k = 0; y < GROUND - 6; y += 9, k++) { STARS.push([1 + (k & 1), y]); STARS.push([LEG_X0 + 2 + (k & 1), y + 4]); }
