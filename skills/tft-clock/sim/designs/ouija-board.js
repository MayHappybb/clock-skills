// Ouija: the board, baked once. An 1890s talking board seen from above:
// aged ochre wood with its grain, printed in a brown-black ink: the sun and
// YES, the moon and NO, two arcs of capitals, a row of figures, GOOD BYE,
// a double rule round the edge. A candle stands just off the top-left
// corner; its light is baked in (a warm pool that falls off to umber in the
// far corner and reddens as it dims), with three drops of wax it has shed.
// The flicker is applied per frame (ouija.js), not here.

import { Gfx, sprite, hex, mix, R, G, B, rgb, noise2, rand, dither565, clamp } from '../js/kit.js';

export const W = 160, H = 80;
export const CANDLE = [26, -16];            // the flame, off the glass
export const WOOD = hex('d8a659'), INK = hex('2a1309'), OXBLOOD = hex('7c2a14'), WAX = hex('f3e5c4'), TABLE = hex('120805');

// ---- the board's type: 5 x 7 capitals with Victorian habits (bracketed
// feet where a letter has room, a kicked R, a looped Q)
const P = {
  A: '..#.. ..#.. .#.#. .#.#. .###. #...# #...#', B: '####. .#..# .#..# .###. .#..# .#..# ####.',
  C: '.#### #...# #.... #.... #.... #...# .###.', D: '###.. .#.#. .#..# .#..# .#..# .#.#. ###..',
  E: '##### .#... .#... .###. .#... .#... #####', F: '##### .#... .#... .###. .#... .#... ###..',
  G: '.###. #...# #.... #..## #...# #...# .####', H: '#...# #...# #...# ##### #...# #...# #...#',
  I: '.###. ..#.. ..#.. ..#.. ..#.. ..#.. .###.', J: '..### ...#. ...#. ...#. ...#. #..#. .##..',
  K: '##.## .#.#. .##.. .##.. .#.#. .#..# ##.##', L: '###.. .#... .#... .#... .#... .#..# #####',
  M: '#...# ##.## #.#.# #.#.# #...# #...# #...#', N: '#...# ##..# #.#.# #.#.# #..## #...# #...#',
  O: '.###. #...# #...# #...# #...# #...# .###.', P: '####. .#..# .#..# .###. .#... .#... ###..',
  Q: '.###. #...# #...# #...# #.#.# #..#. .##.#', R: '####. .#..# .#..# .###. .#.#. .#..# ###.#',
  S: '.#### #.... #.... .###. ....# ....# ####.', T: '##### #.#.# ..#.. ..#.. ..#.. ..#.. .###.',
  U: '#...# #...# #...# #...# #...# #...# .###.', V: '#...# #...# #...# .#.#. .#.#. .#.#. ..#..',
  W: '#...# #...# #...# #.#.# #.#.# ##.## #...#', X: '#...# #...# .#.#. ..#.. .#.#. #...# #...#',
  Y: '#...# #...# .#.#. ..#.. ..#.. ..#.. .###.', Z: '##### #...# ...#. ..#.. .#... #...# #####',
  0: '.###. #...# #...# #...# #...# #...# .###.', 1: '..#.. .##.. ..#.. ..#.. ..#.. ..#.. .###.',
  2: '.###. #...# ....# ...#. ..#.. .#... #####', 3: '.###. #...# ....# ..##. ....# #...# .###.',
  4: '...#. ..##. .#.#. #..#. ##### ...#. ..###', 5: '##### #.... ####. ....# ....# #...# .###.',
  6: '..##. .#... #.... ####. #...# #...# .###.', 7: '##### #...# ...#. ..#.. ..#.. ..#.. ..#..',
  8: '.###. #...# #...# .###. #...# #...# .###.', 9: '.###. #...# #...# .#### ....# ...#. .##..',
};
export const LETTER = Object.fromEntries(Object.entries(P).map(([k, s]) => [k, sprite(s.split(' '), { '#': 0xffffff })]));

// ---- where everything is: the centre of each character, which is where
// the planchette's window stops to point at it
export const SPOT = {};
const arc = (s, yEnd, rise) => [...s].forEach((ch, i) => {
  const x = 14 + i * 11, u = (x - 80) / 66;
  SPOT[ch] = [x, yEnd - rise * (1 - u * u)];
});
arc('ABCDEFGHIJKLM', 26, 11);
arc('NOPQRSTUVWXYZ', 40, 11);
[...'1234567890'].forEach((ch, i) => { SPOT[ch] = [26 + i * 12, 52.5]; });
export const WORDS = { YES: [22, 10.5, 'YES'], NO: [133, 10.5, 'NO'], BYE: [80, 66.5, 'GOOD BYE'] };
for (const [k, [x, y]] of Object.entries(WORDS)) SPOT[k] = [x, y];
export const SUN = [9.5, 10.5], MOON = [148.5, 10.5];

/** Top-left pixel of a character's glyph whose centre is (x, y). */
export const glyphAt = (x, y) => [Math.round(x - 2.5), Math.round(y - 3.5)];

/** Every printed character as [ch, gx, gy, word?]: what the bake inks and what can glow. */
export const PRINT = [];
for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890') PRINT.push([ch, ...glyphAt(...SPOT[ch])]);
for (const [key, [x, y, s]] of Object.entries(WORDS)) {
  const w = s.length * 6 - 1, x0 = Math.round(x - w / 2);
  [...s].forEach((ch, i) => { if (ch !== ' ') PRINT.push([ch, x0 + i * 6, Math.round(y - 3.5), key]); });
}

// ---- the light: candle pool, warm, reddening as it falls off
export function lightAt(x, y) {
  const d = Math.hypot(x - CANDLE[0], y - CANDLE[1]);
  return 0.27 + 0.95 * Math.exp(-((d / 104) ** 2));
}
/** A surface colour under the candle at (x, y). */
export function lit(c, x, y, k = 1) {
  const L = lightAt(x, y) * k;
  return rgb(R(c) * L * 1.04, G(c) * L ** 1.18, B(c) * L ** 1.6);
}

// ---- the bake
function build() {
  // albedo first, in a float buffer, then light it
  const alb = new Uint32Array(W * H);
  const inBoard = (x, y) => {
    // the board: rounded corners, a step in from the glass edge
    const r = 6, x0 = 1, y0 = 1, x1 = 159, y1 = 79;
    const qx = Math.max(x0 + r - x, x - (x1 - r), 0), qy = Math.max(y0 + r - y, y - (y1 - r), 0);
    return x >= x0 && x <= x1 && y >= y0 && y <= y1 && qx * qx + qy * qy <= r * r;
  };
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const px = x + 0.5, py = y + 0.5;
      if (!inBoard(px, py)) { alb[y * W + x] = TABLE; continue; }
      // grain: long horizontal figure, wavering, with a few darker growth lines
      const warp = noise2(px * 0.03, py * 0.06, 3) * 6;
      const g1 = noise2(px * 0.025, (py + warp) * 0.55, 7);
      const line = Math.max(0, 1 - Math.abs(((py + warp * 1.4) * 0.21) % 1 - 0.5) * 9);
      const speck = rand(x, y, 11);
      let k = 0.9 + 0.16 * g1 - 0.07 * line * noise2(px * 0.08, py * 0.2, 5) + (speck - 0.5) * 0.05;
      // burnished, handled edge
      const e = Math.min(px - 1, 159 - px, py - 1, 79 - py);
      if (e < 3) k *= 0.82 + 0.06 * e;
      alb[y * W + x] = rgb(R(WOOD) * k, G(WOOD) * k, B(WOOD) * k);
    }

  // ink goes onto an overlay canvas so the shapes can use the kit
  const ink = new Gfx(W, H);
  const KEY = 0xff00ff;
  ink.clear(KEY);
  // double rule
  ink.roundRect(4, 4, 152, 72, 4, INK, { t: 1 });
  ink.roundRect(6, 6, 148, 68, 3, INK, { t: 1 });
  // sun: a face with rays
  const [sx, sy] = SUN;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2, r0 = 4.6, r1 = i % 2 ? 6.2 : 7.4;
    ink.thickLine(sx + r0 * Math.sin(a), sy - r0 * Math.cos(a), sx + r1 * Math.sin(a), sy - r1 * Math.cos(a), 1, INK);
  }
  ink.fillCircle(sx, sy, 4, INK);
  ink.fillCircle(sx, sy, 3, OXBLOOD);
  ink.pixel(sx - 1.5, sy - 1, INK); ink.pixel(sx + 1, sy - 1, INK);
  ink.hline(Math.floor(sx - 1), Math.floor(sy + 1.2), 3, INK);
  // moon: a crescent with a face on its inner edge
  const [mx, my] = MOON;
  ink.fillCircle(mx, my, 5.2, INK);
  ink.fillCircle(mx + 2.6, my - 1.2, 4.4, KEY);
  ink.fillCircle(mx - 0.6, my, 4.0, OXBLOOD);
  ink.fillCircle(mx + 2.6, my - 1.2, 4.4, KEY);
  ink.pixel(mx - 2.4, my - 1.6, INK);
  // little stars in the four rule corners
  for (const [x, y] of [[11, 70], [149, 70]]) {
    ink.thickLine(x - 2.5, y + 0.5, x + 3.5, y + 0.5, 1, INK);
    ink.thickLine(x + 0.5, y - 2.5, x + 0.5, y + 3.5, 1, INK);
    ink.pixel(x - 1, y - 1, INK); ink.pixel(x + 2, y - 1, INK); ink.pixel(x - 1, y + 2, INK); ink.pixel(x + 2, y + 2, INK);
  }
  // flourishes either side of GOOD BYE
  for (const side of [-1, 1]) {
    const x0 = 80 + side * 30;
    ink.stroke([[x0, 66.5], [x0 + side * 6, 64.5], [x0 + side * 12, 66.5], [x0 + side * 18, 68.5], [x0 + side * 22, 66.5]], 1, INK);
    ink.fillCircle(x0 + side * 23, 66, 1.2, INK);
  }
  // the letters
  for (const [ch, gx, gy] of PRINT) ink.blit(LETTER[ch], gx, gy, { c: INK });

  // light it all
  const out = new Gfx(W, H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x, inked = ink.get(x, y);
      let c = alb[i];
      if (inked !== KEY) c = mix(c, inked, 0.92);
      if (c === TABLE) { out.buf[i] = dither565(R(c), G(c), B(c), x, y); continue; }
      const L = lightAt(x + 0.5, y + 0.5);
      out.buf[i] = dither565(clamp(R(c) * L * 1.04, 0, 255), clamp(G(c) * L ** 1.18, 0, 255), clamp(B(c) * L ** 1.6, 0, 255), x, y);
    }
  // wax the candle shed onto the board, lit hot (it is right under the flame)
  for (const [x, y, r] of [[38, 4.5, 2.2], [44.5, 3, 1.4], [33, 8, 1.1], [16, 22, 1.3]]) {
    out.fillCircle(x + 0.6, y + 0.8, r, hex('5a3418'), { aa: true, a: 0.6 });
    out.fillCircle(x, y, r, lit(WAX, x, y), { aa: true });
    out.fillCircle(x - r * 0.35, y - r * 0.35, Math.max(0.6, r * 0.35), 0xfffbf0, { aa: true, a: 0.85 });
  }
  return out;
}

export const BOARD = build();
