// Pop-up Book: the numerals, die-cut from card.
//
// Each digit is one piece of thick card, 26 x 44 at the cut line, with
// strokes 8 px wide (bars 7): a chunky children's-book cut, round where a
// die would round it (r 12 outer, 5 inner), flat where it stands on the page.
// Every counter is at least 8 x 8 inside its keyline. Around the cut a 1 px
// printed keyline in ink (what makes a children's pop-up read across a
// room); along every top and left edge the white core of the card shows
// (the cut edge catching the lamp). Under each digit, where it meets the
// page, glue tabs go down into slots.
//
// The shapes are signed-distance unions evaluated once at load into byte
// sprites (flash), hard pixels: card has a crisp die-cut edge.
//
// Sprite codes: 0 empty, 1 keyline, 2 face, 3 cut edge (lit core), 4 face
// shade (the last px along the bottom and right edges, the card's own
// thickness turned away from the lamp).

export const GW = 26, GH = 44;           // the cut shape
export const SW = GW + 2, SH = GH + 2;   // with the keyline

const len = (x, y) => Math.sqrt(x * x + y * y);
function rrect(px, py, x, y, w, h, r) {
  const qx = Math.abs(px - (x + w / 2)) - (w / 2 - r), qy = Math.abs(py - (y + h / 2)) - (h / 2 - r);
  return len(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}
const rect = (px, py, x, y, w, h) => rrect(px, py, x, y, w, h, 0.01);
const ring = (px, py, cx, cy, ro, ri) => Math.max(len(px - cx, py - cy) - ro, ri - len(px - cx, py - cy));
function seg(px, py, ax, ay, bx, by, r) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let u = ((px - ax) * dx + (py - ay) * dy) / l2;
  u = u < 0 ? 0 : u > 1 ? 1 : u;
  return len(px - ax - u * dx, py - ay - u * dy) - r;
}
function poly(px, py, pts) {
  let d = Infinity, inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    const e = seg(px, py, xj, yj, xi, yi, 0);
    if (e < d) d = e;
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside ? -d : d;
}
const U = Math.min, X = Math.max;          // union, intersection
const cut = (d, keep) => (keep ? d : 1);    // keep a part only in a region

// Each digit: is (px, py) inside the card?
const SHAPES = [
  // 0: a tall rounded ring
  (x, y) => X(rrect(x, y, 0, 0, 26, 44, 12), -rrect(x, y, 8, 7, 10, 30, 5)),
  // 1: stem, a cut flag, a foot to stand on
  (x, y) => U(rect(x, y, 10, 0, 8, 44), poly(x, y, [[3, 7], [12, 0], [12, 8], [3, 15]]), rrect(x, y, 3, 37, 21, 7, 1.5)),
  // 2: bowl, diagonal, base bar
  (x, y) => U(
    cut(ring(x, y, 13, 13, 13, 5), y < 13 || x > 13),
    seg(x, y, 20.5, 19.5, 4.5, 38, 4.2),
    rect(x, y, 0, 37, 26, 7)),
  // 3: two bowls open to the left, joined by a short middle arm
  (x, y) => U(
    cut(ring(x, y, 12.5, 11.5, 11.5, 4), x > 12.5 || y < 11),
    cut(ring(x, y, 13, 31, 13, 5), x > 13 || y > 32),
    rect(x, y, 8, 18.5, 7, 7)),
  // 4: open top, upright arm, bar, full stem
  (x, y) => U(rect(x, y, 16, 0, 8, 44), rrect(x, y, 1, 0, 8, 30, 1), rect(x, y, 1, 23, 25, 7)),
  // 5: flag bar, stem, open bowl
  (x, y) => U(
    rect(x, y, 3, 0, 22, 7), rect(x, y, 3, 0, 8, 24),
    cut(ring(x, y, 13, 30.5, 13, 5), !(x < 12 && y > 22 && y < 36))),
  // 6: a closed bowl under a hooked ascender
  (x, y) => U(
    ring(x, y, 13, 30.5, 13, 5),
    rect(x, y, 0, 13, 8, 18),
    cut(ring(x, y, 14, 14, 14, 6), x < 14 && y < 14),
    rrect(x, y, 13, 0, 11, 8, 2)),
  // 7: bar and a slanting stem
  (x, y) => U(rect(x, y, 1, 0, 25, 7), poly(x, y, [[17, 4], [26, 4], [15, 44], [6, 44]])),
  // 8: a narrow ring on a wider one
  (x, y) => U(ring(x, y, 13, 11.5, 11.5, 4), ring(x, y, 13, 31, 13, 5)),
  null, // 9 = 6 turned
];

function rasterise(d) {
  const f = d === 9 ? (x, y) => SHAPES[6](26 - x, 44 - y) : SHAPES[d];
  const m = new Uint8Array(SW * SH);
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) if (f(x + 0.5, y + 0.5) <= 0) m[(y + 1) * SW + x + 1] = 2;
  const inside = (x, y) => x >= 0 && y >= 0 && x < SW && y < SH && m[y * SW + x] >= 2;
  const out = Uint8Array.from(m);
  for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
    const i = y * SW + x;
    if (m[i]) {
      if (!inside(x, y - 1) || !inside(x - 1, y)) out[i] = 3;
      else if (!inside(x, y + 1) || !inside(x + 1, y)) out[i] = 4;
    } else {
      let k = false;
      for (let dy = -1; dy <= 1 && !k; dy++) for (let dx = -1; dx <= 1; dx++) if (inside(x + dx, y + dy)) { k = true; break; }
      if (k) out[i] = 1;
    }
  }
  return out;
}

/** GLYPH[d]: SW x SH byte sprite. */
export const GLYPH = Array.from({ length: 10 }, (_, d) => rasterise(d));

/** Where each digit touches the page: [x0, x1) runs of its bottom cut row, for the glue tabs. */
export const FEET = GLYPH.map((m) => {
  const runs = [];
  for (let yy = SH - 2; yy >= SH - 4 && !runs.length; yy--) {
    let a = -1;
    for (let x = 0; x <= SW; x++) {
      const on = x < SW && m[yy * SW + x] >= 2;
      if (on && a < 0) a = x;
      if (!on && a >= 0) { if (x - a >= 4) runs.push([a, x]); a = -1; }
    }
  }
  return runs;
});
