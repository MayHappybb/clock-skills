// rubegoldberg: the printed page (paper, Ben-Day wall tint, floor, fixed
// fittings) as one prebuilt canvas, plus the small drawing helpers every
// moving part uses: ink-outlined planks, balls, polygons, sprites.
import { Gfx, sprite } from '../js/kit.js';

export const INK = 0x1c1814;
export const PAPER = 0xf1e4c3;
export const DOT = 0xbccbd2;        // the wall's Ben-Day tint
export const SHADE = 0x93a9b8;      // the cards' cast shadow, denser dots
export const WOOD = 0xc98f52, WOOD_LT = 0xe4b47c;
export const FLOOR = 0xc0885a, FLOOR_DK = 0x9a663c;
export const RED = 0xd2412e, YELLOW = 0xf0c53a, ORANGE = 0xe8822e, BLUE = 0x3f78b5, BLUE_LT = 0x8fb4dc;
export const IRON = 0x58524c, STEEL = 0xa8a8a0, SMOKE = 0x9a948a, CREAM = 0xfbf5e4;

// ------------------------------------------------------------ geometry

export const FLOOR_Y = 75;                       // top of the floorboards
export const HOUR_X = 35, MIN_X = 84, CARD_Y = 19;
export const railL = (x) => 7 + (4 * x) / 76;     // top surface of the top-left rail
export const railR = (x) => 8 + (4 * (x - 85)) / 43;
export const PULLEY_T = [80, 3];                  // the bucket's pulley
export const PULLEY_W = [154, 22];                // the weight's pulley
export const NAIL = [131, 20];
export const STRING_Y = 20;

// ------------------------------------------------------------ helpers

export function plank(g, x0, y0, x1, y1, w, c) {
  g.thickLine(x0, y0, x1, y1, w + 2, INK);
  g.thickLine(x0, y0, x1, y1, w, c);
}

export function ball(g, cx, cy, r, c, spin = 0, hi = 0xffffff) {
  g.fillCircle(cx, cy, r + 1, INK);
  g.fillCircle(cx, cy, r, c);
  g.pixel(cx - r * 0.45, cy - r * 0.45, hi);
  if (r >= 2.5) g.pixel(cx + Math.cos(spin) * r * 0.55, cy + Math.sin(spin) * r * 0.55, INK);
}

export function poly(g, pts, c) {
  g.fillPolygon(pts, c);
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    g.line(Math.floor(a[0]), Math.floor(a[1]), Math.floor(b[0]), Math.floor(b[1]), INK);
  }
}

export const rot = (x, y, cx, cy, a) => {
  const c = Math.cos(a), s = Math.sin(a);
  return [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c];
};

// ------------------------------------------------------------ sprites

const BIRD_PAL = { i: INK, y: YELLOW, w: 0xd99a1c, o: ORANGE, k: INK };
export const BIRD_UP = sprite(`
  .....ii..
  ....iwwi.
  ..iiiwwi.
  .ikyyyyyi
  oiyyyyyii
  ..iiiii..`, BIRD_PAL);
export const BIRD_DOWN = sprite(`
  .........
  ..iiiii..
  .ikyyyyyi
  oiyyyyyyi
  ..iiwwwi.
  ....iwi..`, BIRD_PAL);
export const BIRD_SIT = sprite(`
  ..iii..
  .iyyyi.
  oikyyi.
  .iyyyyi
  .iywwyi
  ..iiyyi
  ...i.i.`, BIRD_PAL);
export const BIRD_PECK = sprite(`
  .......
  ..iii..
  .iyyyi.
  oikyyyi
  .iywwyi
  ..iiyyi
  ...i.i.`, BIRD_PAL);

export const NOTE = sprite(`
  .##
  .#.
  ##.`, { '#': INK });

// ------------------------------------------------------------ the page

function buildPage() {
  const g = new Gfx(160, 80);
  g.clear(PAPER);
  // wall: a pale blue Ben-Day tint, dots on a 45-degree 4 px grid
  for (let y = 1; y < FLOOR_Y; y++)
    for (let x = 1; x < 159; x++)
      if ((y % 4 === 0 && x % 4 === 0) || (y % 4 === 2 && x % 4 === 2)) g.pixel(x, y, DOT);
  // the cards' cast shadows: the same dots, doubled up
  const shade = (x0, y0, w, h) => {
    for (let y = y0; y < y0 + h; y++)
      for (let x = x0; x < x0 + w; x++) if ((x + y) % 2 === 0) g.pixel(x, y, SHADE);
  };
  shade(HOUR_X + 2, CARD_Y + 2, 42, 42);
  shade(MIN_X + 2, CARD_Y + 2, 42, 42);
  shade(80, 22, 5, 26);
  // floorboards
  g.fillRect(1, FLOOR_Y, 158, 4, FLOOR);
  g.hline(1, FLOOR_Y, 158, INK);
  for (let x = 9; x < 159; x += 23) g.vline(x, FLOOR_Y + 1, 3, FLOOR_DK);
  for (let x = 2; x < 159; x += 3) g.pixel(x, FLOOR_Y + 2 + (x % 2), FLOOR_DK);
  // beam the cards hang from, on two iron brackets
  plank(g, 33, 16, 127, 16, 2, WOOD);
  for (const bx of [36, 124]) poly(g, [[bx - 2, 18], [bx + 2, 18], [bx, 22]], IRON);
  // colon tag
  g.fillRect(78, 20, 5, 26, CREAM); g.rect(78, 20, 5, 26, INK);
  g.fillRect(79, 28, 3, 3, INK); g.fillRect(79, 37, 3, 3, INK);
  // top-left rail (hung from two struts) and the tack under it
  g.vline(26, 0, 8, INK); g.vline(56, 0, 9, INK);
  plank(g, 2, railL(2) + 1, 76, railL(76) + 1, 1, WOOD);
  g.vline(22, 10, 3, INK); g.hline(21, 10, 3, INK);
  // right rail
  g.vline(100, 0, 9, INK); g.vline(119, 0, 10, INK);
  plank(g, 85, railR(85) + 1, 128, railR(128) + 1, 1, WOOD);
  // the bucket's pulley
  g.vline(80, 0, 2, INK);
  ball(g, PULLEY_T[0], PULLEY_T[1], 1.6, STEEL);
  // seesaw fulcrum on a wall shelf
  poly(g, [[139, 14], [136, 18], [142, 18]], WOOD_LT);
  g.hline(134, 18, 11, INK);
  // funnel and pipe that take the marble away behind the minute card
  poly(g, [[126, 15], [132, 15], [130, 18], [128, 18]], STEEL);
  g.fillRect(126, 18, 4, 3, STEEL); g.hline(124, 18, 4, INK); g.hline(124, 21, 6, INK); g.vline(130, 18, 4, INK);
  // nail, the weight's pulley
  g.fillRect(NAIL[0] - 1, NAIL[1] - 1, 2, 2, INK);
  g.line(PULLEY_W[0], 15, PULLEY_W[0], 20, INK);
  ball(g, PULLEY_W[0], PULLEY_W[1], 2, STEEL);
  // the candle lever's stand
  poly(g, [[141, 38], [138, 42], [144, 42]], WOOD_LT);
  g.hline(136, 42, 11, INK);
  // springboard fulcrum
  poly(g, [[142, 71], [138, 75], [146, 75]], WOOD_LT);
  // gas cylinder, bottom left
  g.fillRoundRect(2, 61, 7, 14, 2, INK);
  g.fillRoundRect(3, 62, 5, 12, 1.5, 0x6f9a78);
  g.fillRect(4, 58, 3, 3, INK); g.pixel(5, 59, STEEL);
  g.pixel(4, 66, CREAM); g.pixel(5, 66, CREAM); g.pixel(6, 66, CREAM);
  // the balloon's peg
  g.fillRect(15, 72, 3, 3, INK);
  // panel border
  g.rect(0, 0, 160, 80, INK);
  return g;
}

export const PAGE = buildPage();
