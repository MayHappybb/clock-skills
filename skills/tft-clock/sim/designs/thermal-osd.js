// The camera's on-screen display type for thermal.js: a squared 4 x 6
// instrument face (I, T and the dot narrower, M and W wider), drawn for this
// grid, white on a one-pixel dark outline the way imagers draw their
// overlay so it reads on any palette. Hard pixels: it is burned in, it does
// not glide.

const G = {
  '0': ['.##.', '#..#', '#.##', '##.#', '#..#', '.##.'],
  '1': ['.#.', '##.', '.#.', '.#.', '.#.', '###'],
  '2': ['.##.', '#..#', '..#.', '.#..', '#...', '####'],
  '3': ['###.', '...#', '.##.', '...#', '...#', '###.'],
  '4': ['..#.', '.##.', '#.#.', '####', '..#.', '..#.'],
  '5': ['####', '#...', '###.', '...#', '...#', '###.'],
  '6': ['.##.', '#...', '###.', '#..#', '#..#', '.##.'],
  '7': ['####', '...#', '..#.', '.#..', '.#..', '.#..'],
  '8': ['.##.', '#..#', '.##.', '#..#', '#..#', '.##.'],
  '9': ['.##.', '#..#', '#..#', '.###', '...#', '.##.'],
  '.': ['.', '.', '.', '.', '.', '#'],
  '-': ['...', '...', '###', '...', '...', '...'],
  '°': ['###', '#.#', '###', '...', '...', '...'],
  ' ': ['..', '..', '..', '..', '..', '..'],
  A: ['.##.', '#..#', '#..#', '####', '#..#', '#..#'],
  B: ['###.', '#..#', '###.', '#..#', '#..#', '###.'],
  C: ['.###', '#...', '#...', '#...', '#...', '.###'],
  E: ['####', '#...', '###.', '#...', '#...', '####'],
  H: ['#..#', '#..#', '####', '#..#', '#..#', '#..#'],
  I: ['###', '.#.', '.#.', '.#.', '.#.', '###'],
  K: ['#..#', '#.#.', '##..', '#.#.', '#..#', '#..#'],
  L: ['#...', '#...', '#...', '#...', '#...', '####'],
  N: ['#..#', '##.#', '#.##', '#..#', '#..#', '#..#'],
  O: ['.##.', '#..#', '#..#', '#..#', '#..#', '.##.'],
  P: ['###.', '#..#', '###.', '#...', '#...', '#...'],
  R: ['###.', '#..#', '###.', '#.#.', '#..#', '#..#'],
  S: ['.###', '#...', '.##.', '...#', '...#', '###.'],
  T: ['###', '.#.', '.#.', '.#.', '.#.', '.#.'],
  V: ['#..#', '#..#', '#..#', '#..#', '.##.', '.##.'],
  W: ['#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  X: ['#..#', '#..#', '.##.', '.##.', '#..#', '#..#'],
};

// glyphs as lists of lit pixels (on the device: a byte per row)
const GLYPH = {};
for (const [ch, rows] of Object.entries(G)) {
  const px = [];
  rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) if (r[x] === '#') px.push(x, y); });
  GLYPH[ch] = { w: rows[0].length, px };
}

export function osdWidth(str) {
  let w = 0;
  for (const ch of str) w += (GLYPH[ch]?.w ?? 3) + 1;
  return w - 1;
}

/** Draw `str` at (x, y) top-left: an outline pass in `edge`, then the face in `c`. */
export function osd(g, str, x, y, c = 0xf6f4ee, edge = 0x0a0612, a = 1) {
  const buf = g.buf, W = g.width, H = g.height;
  for (let pass = 0; pass < 2; pass++) {
    let cx = Math.round(x);
    const y0 = Math.round(y);
    for (const ch of str) {
      const gl = GLYPH[ch];
      if (!gl) { cx += 4; continue; }
      const p = gl.px;
      for (let k = 0; k < p.length; k += 2) {
        const px = cx + p[k], py = y0 + p[k + 1];
        if (pass === 0) {
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const qx = px + dx, qy = py + dy;
            if (qx >= 0 && qy >= 0 && qx < W && qy < H) g.pixel(qx, qy, edge, { a });
          }
        } else if (px >= 0 && py >= 0 && px < W && py < H) g.pixel(px, py, c, { a });
      }
      cx += gl.w + 1;
    }
  }
}
