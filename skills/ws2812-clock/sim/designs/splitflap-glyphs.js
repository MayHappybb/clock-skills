// Split-flap glyphs: the big "Solari" railway numerals (exact SDFs, drawn for
// a 21 x 42 pixel cell, cut by the hinge), and the 5 x 9 board letters.
//
// Big digits are designed on a 20 x 40 unit box, stroke 5: stadium bowls,
// flat-cut bars and terminals, a flat-topped 3 and a straight 7, in the
// manner of DIN 1451 / Solari station clocks. Coverage = clamp(0.5 - sdf).

const S = 5, HS = S / 2;
const abs = Math.abs, max = Math.max, min = Math.min, hypot = Math.hypot;

/** Rounded box (exact SDF). */
function box(x, y, cx, cy, hw, hh, r) {
  const qx = abs(x - cx) - hw + r, qy = abs(y - cy) - hh + r;
  return hypot(max(qx, 0), max(qy, 0)) + min(max(qx, qy), 0) - r;
}
/** A stroke following the outline of a stadium (centreline box). */
const ring = (x, y, cx, cy, hw, hh, r, w = S) => abs(box(x, y, cx, cy, hw, hh, r)) - w / 2;
/** Flat-ended bar from a to b, width w. */
function bar(x, y, ax, ay, bx, by, w = S) {
  const dx = bx - ax, dy = by - ay, L = hypot(dx, dy), ux = dx / L, uy = dy / L;
  const px = x - ax, py = y - ay;
  const u = px * ux + py * uy - L / 2, v = -px * uy + py * ux;
  const qx = abs(u) - L / 2, qy = abs(v) - w / 2;
  return hypot(max(qx, 0), max(qy, 0)) + min(max(qx, qy), 0);
}
/** Round-capped stroke (capsule). */
function cap(x, y, ax, ay, bx, by, w = S) {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
  let t = ((x - ax) * dx + (y - ay) * dy) / L2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return hypot(x - ax - t * dx, y - ay - t * dy) - w / 2;
}
/** SDF of the region {x > a, y > b} (negative inside). */
const quad = (x, y, a, b) => max(a - x, b - y);
const cut = (d, r) => max(d, -r);

function six(x, y) {
  const bowl = ring(x, y, 10, 28, 7.5, 9.5, 7.5);
  let hook = ring(x, y, 10, 20, 7.5, 17.5, 7.5);
  hook = max(hook, min(x - 10, max(y - 12, x - 16.2)));       // left side + top arc to the terminal
  hook = max(hook, y - 30);
  return min(bowl, hook);
}

const DIG = [
  (x, y) => ring(x, y, 10, 20, 7.5, 17.5, 7.5),                                   // 0
  (x, y) => min(bar(x, y, 12.5, 0, 12.5, 40), bar(x, y, 12.8, 2.2, 4.2, 10.4, 4.8)), // 1
  (x, y) => {                                                                       // 2
    let top = ring(x, y, 10, 10.5, 7.5, 8, 7.5);
    top = max(top, y - 13.5);                             // nothing of the bowl below y 13.5
    top = max(top, -max(x - 10, 9.5 - y));                // open the lower left: terminal at y 9.5
    const diag = cap(x, y, 16.2, 13.6, 3.2, 37, 5.2);
    return min(top, diag, bar(x, y, 0.5, 37.5, 19.5, 37.5));
  },
  (x, y) => {                                                                       // 3
    let bowl = ring(x, y, 10, 27.5, 7.5, 10, 7.5);
    bowl = cut(bowl, max(x - 7.4, y - 32));               // open the left above y 32
    return min(bar(x, y, 1.5, 2.5, 18.5, 2.5), cap(x, y, 16.2, 3.6, 8.6, 17.4, 5.1), bowl);
  },
  (x, y) => min(bar(x, y, 15, 0, 15, 40), cap(x, y, 14.2, 2.6, 2.6, 28, 4.8), bar(x, y, 0.5, 28.5, 19.5, 28.5)), // 4
  (x, y) => {                                                                       // 5
    let bowl = ring(x, y, 10, 28, 7.5, 9.5, 7.5);
    bowl = cut(bowl, max(x - 8, max(21 - y, y - 31.5)));  // gap between the stem and the tail
    return min(bar(x, y, 3, 2.5, 18.5, 2.5), bar(x, y, 5.5, 0, 5.5, 21.5), bowl);
  },
  six,                                                                              // 6
  (x, y) => min(bar(x, y, 0.5, 2.5, 19.5, 2.5), max(cap(x, y, 17, 3.5, 7.4, 43, 5.3), y - 40)), // 7
  (x, y) => min(ring(x, y, 10, 10.25, 6.6, 7.75, 6.6), ring(x, y, 10, 29, 7.5, 8.5, 7.5)), // 8
  (x, y) => six(20 - x, 40 - y),                                                    // 9
];

/**
 * Coverage texture (Float32Array w*h) of a card printed with string `str`
 * (digits only), each digit k-scaled from 20x40 and placed at xs[i], y0.
 */
export function bigCardTex(str, w, h, xs, y0, k) {
  const t = new Float32Array(w * h);
  for (let i = 0; i < str.length; i++) {
    const f = DIG[+str[i]], ox = xs[i];
    for (let y = 0; y < h; y++) {
      const v = (y + 0.5 - y0) / k;
      if (v < -2 || v > 42) continue;
      for (let x = 0; x < w; x++) {
        const u = (x + 0.5 - ox) / k;
        if (u < -2 || u > 22) continue;
        const d = f(u, v) * k;
        const c = 0.5 - d;
        if (c > 0) t[y * w + x] = Math.max(t[y * w + x], c > 1 ? 1 : c);
      }
    }
  }
  return t;
}

// ------------------------------------------------------- 5 x 9 board font
const F = {
  ' ': [], ':': ['.....', '.....', '..#..', '..#..', '.....', '.....', '..#..', '..#..', '.....'],
  '-': ['.....', '.....', '.....', '.....', '.###.', '.....', '.....', '.....', '.....'],
  A: ['.###.', '#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '#...#', '####.', '#...#', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '#....', '####.', '#....', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '#....', '####.', '#....', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#....', '#.###', '#...#', '#...#', '#...#', '.###.'],
  H: ['#...#', '#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#', '#...#'],
  I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  J: ['....#', '....#', '....#', '....#', '....#', '....#', '#...#', '#...#', '.###.'],
  K: ['#...#', '#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#', '#...#', '#...#'],
  N: ['#...#', '#...#', '##..#', '#.#.#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '#...#', '####.', '#....', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#', '#...#'],
  S: ['.###.', '#...#', '#....', '#....', '.###.', '....#', '....#', '#...#', '.###.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '.#.#.', '..#..', '..#..'],
  W: ['#...#', '#...#', '#...#', '#...#', '#.#.#', '#.#.#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '#...#', '.#.#.', '.#.#.', '..#..', '.#.#.', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '.#.#.', '..#..', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '...#.', '..#..', '.#...', '.#...', '#....', '#####'],
  0: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  1: ['..#..', '.##..', '#.#..', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  2: ['.###.', '#...#', '....#', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  3: ['#####', '....#', '...#.', '..#..', '.###.', '....#', '....#', '#...#', '.###.'],
  4: ['...#.', '..##.', '.#.#.', '#..#.', '#..#.', '#####', '...#.', '...#.', '...#.'],
  5: ['#####', '#....', '#....', '####.', '....#', '....#', '....#', '#...#', '.###.'],
  6: ['..##.', '.#...', '#....', '#....', '####.', '#...#', '#...#', '#...#', '.###.'],
  7: ['#####', '....#', '....#', '...#.', '...#.', '..#..', '..#..', '..#..', '..#..'],
  8: ['.###.', '#...#', '#...#', '#...#', '.###.', '#...#', '#...#', '#...#', '.###.'],
  9: ['.###.', '#...#', '#...#', '#...#', '.####', '....#', '....#', '...#.', '.##..'],
};

/** The letter drum, in flap order (a real Solari drum: blank, letters, digits, signs). */
export const DRUM = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:-';

/** Coverage texture (w*h) of a small flap printed with ch, glyph at (gx, gy). */
export function smallTex(ch, w, h, gx, gy) {
  const t = new Float32Array(w * h), g = F[ch] || [];
  g.forEach((row, j) => {
    for (let i = 0; i < 5; i++) if (row[i] === '#') t[(gy + j) * w + gx + i] = 1;
  });
  return t;
}
