// The horses of "polo": ten numerals, each one horse in a Persian
// miniature's flying gallop, galloping LEFT. The numeral is the horse's neck
// and body, bent into the digit: a stroke that swells from a 5.4 px neck at
// the top to a 7.4 px rump at the bottom (a reed-pen contrast), keylined in
// one fine dark line. The head (polo-art.js) sits on the stroke's top-left
// end or shoulder, facing the way the herd rides; the rider sits on the top;
// four legs gallop from the bottom; the knotted tail streams from the back.
// Everything except the stroke itself stays outside the numeral.
//
// At load each digit becomes, on a 32 x 44 grid (glyph box 24 x 36 plus a
// 4 px margin):
//   SDF   Int8, signed distance to the stroke edge in 1/8 px (negative inside)
//   PIX   the inside pixels in dissolve order (a hashed rank, so a digit
//         thins evenly and never loses one part first), as packed x | y << 8
// and a few anchors in glyph units: head (where the head joins and which
// way it hangs), seat (the rider), tail (root), legs (front and hind roots).
// 1.4 KB + ~0.9 KB a digit: ~23 KB of flash for the set.

export const GW = 24, GH = 36, M = 4, SW = GW + 2 * M, SH = GH + 2 * M;

const arc = (cx, cy, rx, ry, a0, a1, n = 40) => {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + (a1 - a0) * (i / n)) * Math.PI) / 180;
    pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return pts;
};

// centre lines (angles in degrees: 0 right, 90 down)
const SKEL = {
  0: [arc(12, 18, 8.4, 14.4, 0, 360, 56)],
  1: [[[14, 1.8], [14, 34]], [[14, 2.6], [7.2, 9.6]]],
  2: [[...arc(12, 10.4, 7.7, 7.7, 196, 378), [4.6, 33.4], [20.4, 33.4]]],
  3: [[...arc(12, 9.4, 7.2, 7, 208, 440), [9.6, 17.2], ...arc(12, 25.6, 8.2, 8.4, 250, 516)]],
  4: [[[6.2, 2.4], [4.4, 22.4], [21.6, 22.4]], [[17.4, 2.4], [17.4, 34.4]]],
  5: [[[20.2, 2.4], [6.6, 2.4], [5.8, 15.4]], arc(11.6, 24, 8.2, 9.4, 233, 516)],
  6: [[...arc(18.4, 25, 14.2, 22, 256, 180, 26), ...arc(11.8, 25.4, 7.8, 8.6, 180, 540, 44)]],
  7: [[[4.2, 2.4], [20.4, 2.4], [9.6, 34]]],
  8: [arc(12, 10.2, 6.6, 7.2, 0, 360, 44), arc(12, 26.2, 8.2, 8.2, 0, 360, 48)],
  9: [arc(12.2, 11.2, 7.8, 8.8, 0, 360, 48), arc(3.8, 11.6, 16.4, 22.4, 0, 82, 24)],
};

// head: [x, y] where the head's jaw meets the neck, and its pose
// ('up' a raised head on a shoulder, 'down' a head hung from a terminal).
// seat: the top of the stroke where the rider sits.
// tail: root on the back (right) of the horse.
export const ANCHOR = {
  0: { head: [5.6, 6.6], pose: 'up', seat: [13.6, 3.6], tail: [20.4, 27] },
  1: { head: [7.6, 9.6], pose: 'down', seat: [14, 1.8], tail: [16.2, 31] },
  2: { head: [5.2, 13.2], pose: 'down', seat: [12.6, 2.7], tail: [20.4, 31.6] },
  3: { head: [6, 6.2], pose: 'up', seat: [12.6, 2.4], tail: [19.8, 28] },
  4: { head: [6.2, 2.6], pose: 'up', seat: [17.4, 2.4], tail: [19.6, 31] },
  5: { head: [6.6, 2.6], pose: 'up', seat: [14, 2.4], tail: [19.8, 27] },
  6: { head: [7.4, 8.8], pose: 'up', seat: [14.6, 3.6], tail: [19.4, 27] },
  7: { head: [4.4, 2.6], pose: 'up', seat: [12.6, 2.4], tail: [12.6, 28] },
  8: { head: [7, 5.4], pose: 'up', seat: [12.6, 3], tail: [20.2, 27] },
  9: { head: [6.4, 5], pose: 'up', seat: [12.6, 2.4], tail: [17.6, 22] },
};

const radius = (py) => 2.7 + 1.0 * Math.max(0, Math.min(1, py / GH));

function dist(px, py, lines) {
  let best = 1e9;
  for (const pl of lines)
    for (let k = 1; k < pl.length; k++) {
      const [ax, ay] = pl[k - 1], [bx, by] = pl[k];
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
      let u = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
      u = u < 0 ? 0 : u > 1 ? 1 : u;
      const ex = px - ax - u * dx, ey = py - ay - u * dy;
      const e = Math.sqrt(ex * ex + ey * ey) - radius(ay + u * dy);
      if (e < best) best = e;
    }
  return best;
}

const hash = (a, b) => {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return (h ^ (h >>> 15)) >>> 0;
};

export const SDF = [], PIX = [], LEGS = [], BOX = [], RANK = [];
for (let d = 0; d < 10; d++) {
  const f = new Int8Array(SW * SH), inside = [];
  let x0 = 99, x1 = -1, y0 = 99, y1 = -1;
  for (let j = 0; j < SH; j++)
    for (let i = 0; i < SW; i++) {
      const v = Math.round(dist(i + 0.5 - M, j + 0.5 - M, SKEL[d]) * 8);
      f[j * SW + i] = v < -127 ? -127 : v > 127 ? 127 : v;
      if (v <= 0) {
        inside.push(i | (j << 8));
        if (i < x0) x0 = i; if (i > x1) x1 = i; if (j < y0) y0 = j; if (j > y1) y1 = j;
      }
    }
  // dissolve order: a fixed hashed rank, so removal thins the whole digit evenly
  inside.sort((a, b) => hash(a, d * 31 + 7) - hash(b, d * 31 + 7));
  SDF.push(f); PIX.push(Uint16Array.from(inside)); BOX.push([x0, y0, x1, y1]);
  // the same order as a map: 0..254 for a stroke pixel's place in it, 255 off the stroke
  const rk = new Uint8Array(SW * SH).fill(255);
  inside.forEach((p, n) => { rk[(p >> 8) * SW + (p & 255)] = Math.floor((n * 255) / inside.length); });
  RANK.push(rk);
  // leg roots: the left and right ends of the lowest 3 rows of the stroke
  let lx = 99, rx = -1;
  for (const p of inside) { const i = p & 255, j = p >> 8; if (j >= y1 - 2) { if (i < lx) lx = i; if (i > rx) rx = i; } }
  let fx = lx + 2, hx = rx - 2;
  if (hx - fx < 6) { const c = (lx + rx) / 2; fx = c - 3; hx = c + 3; }
  LEGS.push({ front: fx + 0.5 - M, hind: hx + 0.5 - M, y: y1 - 1.5 - M });
}
