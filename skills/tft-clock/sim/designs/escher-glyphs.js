// The numerals for escher.js: clean masks, one signed distance table per
// digit and size (built once at load; on the device a const int8 table in
// flash, 1/8 px steps).
//
// Bold geometric numerals in the spirit of the lettering Escher cut into
// Metamorphosis: thick even strokes, round bowls, flat cuts, and counters
// kept wide open, because inside the mask the plane's creatures turn into
// dark fish and outside it they stay light birds; the mask, not the tiles,
// decides the silhouette, so a 0 can never close into an 8.

export const GM = 6;                                       // margin kept round each glyph (keyline, moat, morph)
const DW = 32, DH = 62, R = 5.5;                          // the shapes are drawn on a 32 x 62 box, stroke 11

function seg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let u = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  u = u < 0 ? 0 : u > 1 ? 1 : u;
  const ex = px - ax - u * dx, ey = py - ay - u * dy;
  return Math.sqrt(ex * ex + ey * ey);
}
const cap = (ax, ay, bx, by, r = R) => (px, py) => seg(px, py, ax, ay, bx, by) - r;
/** An arc of radius rr round (cx, cy) from angle a0 to a1 (degrees, screen: 0 right, 90 down), stroke r. */
const arc = (cx, cy, rr, a0, a1, r = R) => {
  const A0 = (a0 * Math.PI) / 180, A1 = (a1 * Math.PI) / 180;
  const e0 = [cx + rr * Math.cos(A0), cy + rr * Math.sin(A0)], e1 = [cx + rr * Math.cos(A1), cy + rr * Math.sin(A1)];
  return (px, py) => {
    let a = Math.atan2(py - cy, px - cx);
    while (a < A0) a += 2 * Math.PI;
    while (a > A0 + 2 * Math.PI) a -= 2 * Math.PI;
    if (a <= A1) return Math.abs(Math.hypot(px - cx, py - cy) - rr) - r;
    return Math.min(Math.hypot(px - e0[0], py - e0[1]), Math.hypot(px - e1[0], py - e1[1])) - r;
  };
};
function rr(px, py, x, y, w, h, r) {
  const qx = Math.abs(px - (x + w / 2)) - (w / 2 - r), qy = Math.abs(py - (y + h / 2)) - (h / 2 - r);
  const ox = Math.max(qx, 0), oy = Math.max(qy, 0);
  return Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(qx, qy), 0) - r;
}
/** A rounded-rectangle ring: outer box minus inner box. */
const loop = (o, i) => (px, py) => Math.max(rr(px, py, ...o), -rr(px, py, ...i));
const box = (x, y, w, h, r) => (px, py) => rr(px, py, x, y, w, h, r);
const union = (...fs) => (px, py) => { let d = Infinity; for (const f of fs) d = Math.min(d, f(px, py)); return d; };

// 6 is a bowl with an open, swept stem; 9 is the 6 turned round. 8 is two
// stacked bowls, the top one narrower, so it never reads as 0 or B.
const SIX = union(loop([0, 25, 32, 37, 15], [11, 36, 10, 15, 5]), cap(7.5, 38, 21.5, 5.5));
const SHAPES = [
  loop([0, 0, 32, 62, 15], [11, 11, 10, 40, 5]),
  union(cap(18, 5.5, 18, 56.5), cap(18, 6, 7, 15.5), box(5, 51, 26, 11, 1.5)),
  union(arc(16, 16.5, 10.5, 180, 395), cap(24.6, 22.5, 6, 54), cap(5.5, 56.5, 26.5, 56.5)),
  union(arc(15.5, 16, 10.5, 200, 450), arc(15.5, 44.5, 12, 270, 520), cap(10, 32.5, 15.5, 32.5)),
  union(cap(22, 5.5, 22, 56.5), cap(5.5, 42.5, 27.5, 42.5), cap(21, 6.5, 5.5, 42.5)),
  union(cap(7, 5.5, 26.5, 5.5), cap(7, 5.5, 7, 35), arc(14.5, 44.5, 12, 231.3, 505)),
  SIX,
  union(cap(5.5, 5.5, 26.5, 5.5), cap(26.5, 5.5, 11.5, 56.5)),
  union(loop([2.5, 0, 27, 29, 12.5], [12.5, 10.5, 7, 8.5, 3.5]), loop([0, 25, 32, 37, 15], [11, 36, 10, 15, 5])),
  (px, py) => SIX(DW - px, DH - py),
];

/**
 * A size of numeral: w x h px, `thin` px taken off each side of the stroke.
 * sd[d] is a Float32Array(tw * th) of signed distances (px, negative
 * inside) at the pixel centres of the box padded by GM, clamped to +-8.
 */
function size(w, h, thin) {
  const tw = w + 2 * GM, th = h + 2 * GM, k = (w / DW + h / DH) / 2;
  const sd = SHAPES.map((f) => {
    const t = new Float32Array(tw * th);
    for (let y = 0; y < th; y++)
      for (let x = 0; x < tw; x++) {
        const v = f(((x - GM + 0.5) * DW) / w, ((y - GM + 0.5) * DH) / h) * k + thin;
        t[y * tw + x] = Math.round(Math.max(-8, Math.min(8, v)) * 8) / 8;   // what an int8 table holds
      }
    return t;
  });
  return { w, h, tw, th, sd };
}
export const HOUR = size(36, 70, 0), MIN = size(28, 52, 0.7);
/** Digit slots: top-left corner and size. Hours tall at the left, minutes smaller, set lower right. */
export const SLOTS = [{ x: 4, y: 5, S: HOUR }, { x: 44, y: 5, S: HOUR }, { x: 90, y: 24, S: MIN }, { x: 126, y: 24, S: MIN }];
export const FLASH_BYTES = 10 * (HOUR.tw * HOUR.th + MIN.tw * MIN.th);
