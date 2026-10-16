// rubegoldberg: the sign-painter's numerals on the flip-chart cards, and the
// cards themselves.
//
// The numerals are drawn for the cartoon: fat, round-ended pen strokes in the
// 1930s newspaper-lettering manner (a big-bellied 5, a flagged 1 on a foot, an
// open-armed 4), each with a red drop shadow offset down-right like a
// hand-painted show card. They are drawn once, at load, as masks; a card is a
// 42 x 42 canvas built the first time its number is needed.
import { Gfx } from '../js/kit.js';

export const GW = 15, GH = 28;          // one numeral
export const CW = 42, CH = 42;          // one card

// Clock-angle arc points: a = 0 is up, clockwise.
function arc(cx, cy, rx, ry, a0, a1, n = 14) {
  const p = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    p.push([cx + rx * Math.sin(a), cy - ry * Math.cos(a)]);
  }
  return p;
}
const PI = Math.PI;

// Centre-line polylines in a 15 x 28 box; drawn 4 px wide with round ends.
const STROKES = {
  0: [arc(7.5, 14, 5.4, 11.4, 0, 2 * PI, 28)],
  1: [[[3.2, 7.2], [8.6, 2.4], [8.6, 25.6]], [[3.6, 25.6], [13.2, 25.6]]],
  2: [[...arc(7.5, 8.2, 5.4, 5.8, -1.45, 2.05, 12), [2.2, 25.4], [13.4, 25.4]]],
  3: [[...arc(7.2, 7.6, 5.2, 5.2, -1.35, PI, 12)], [...arc(7.2, 19.4, 6, 6.2, 0, PI + 1.35, 14)]],
  4: [[[10.6, 2.4], [2.2, 19], [13.6, 19]], [[10.6, 2.4], [10.6, 25.6]]],
  5: [[[12.6, 2.4], [4.2, 2.4], [3.6, 12.6]], [...arc(7.4, 18.2, 5.8, 7.4, -0.95, PI + 1.25, 16)]],
  6: [[[12, 3.2], [8.4, 3.2], [5.2, 5.6], [3.2, 9.6], [2.2, 14.6], [2.1, 18.6]], arc(7.5, 18.8, 5.4, 6.8, 0, 2 * PI, 24)],
  7: [[[2, 2.4], [13.2, 2.4], [9.8, 10.6], [7.6, 17.6], [6.8, 25.6]]],
  8: [arc(7.5, 7.4, 4.6, 5, 0, 2 * PI, 20), arc(7.5, 19.2, 5.8, 6.4, 0, 2 * PI, 24)],
  9: [arc(7.5, 9.2, 5.4, 6.8, 0, 2 * PI, 24), [[12.9, 9.4], [12.8, 14.4], [11.8, 19.4], [9.8, 23.2], [6.6, 25.2], [3, 24.8]]],
};

/** Each numeral as a 0/1 mask, GW x GH. */
export const MASKS = {};
for (const d of Object.keys(STROKES)) {
  const c = new Gfx(GW, GH);
  for (const line of STROKES[d]) c.stroke(line, 4, 0xffffff);
  const m = new Uint8Array(GW * GH);
  for (let i = 0; i < m.length; i++) m[i] = c.buf[i] ? 1 : 0;
  MASKS[d] = m;
}

export const CARD = 0xfbf5e4, CARD_EDGE = 0xd9cba6, INK = 0x1c1814, SHADOW = 0xd2412e;

function stamp(c, mask, x0, y0, col) {
  for (let y = 0; y < GH; y++)
    for (let x = 0; x < GW; x++) if (mask[y * GW + x]) c.pixel(x0 + x, y0 + y, col);
}

const cards = new Map();
/** The front of the card painted with the two-character string `s`. */
export function cardFace(s) {
  let c = cards.get(s);
  if (c) return c;
  c = new Gfx(CW, CH);
  c.clear(CARD);
  // shading down the right and along the bottom: the card's thickness
  c.fillRect(CW - 3, 2, 2, CH - 3, CARD_EDGE);
  c.fillRect(2, CH - 3, CW - 3, 2, CARD_EDGE);
  c.rect(0, 0, CW, CH, INK);
  // punched holes for the rings
  c.fillRect(9, 2, 3, 2, INK); c.fillRect(30, 2, 3, 2, INK);
  const xs = [4, 22], y0 = 9;
  for (let i = 0; i < 2; i++) stamp(c, MASKS[s[i]], xs[i] + 2, y0 + 1, SHADOW);
  for (let i = 0; i < 2; i++) stamp(c, MASKS[s[i]], xs[i], y0, INK);
  cards.set(s, c);
  return c;
}

let back;
/** The back of a card: plain board with a little hatching. */
export function cardBack() {
  if (back) return back;
  back = new Gfx(CW, CH);
  back.clear(0xe9dcb8);
  for (let k = -CH; k < CW; k += 5) back.line(k, CH - 1, k + CH - 1, 0, 0xcdbb8e);
  back.rect(0, 0, CW, CH, INK);
  return back;
}
