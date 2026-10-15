// Kilim numerals: drawn on the loom's own grid. One cell is one warp pair
// across (2 px) by two weft passes (2 rows), so every diagonal steps the way
// a slit-woven kilim steps it: one warp per two passes, 45 degrees. Strokes
// end in latch hooks (the terminal turns back on itself, as the hooks on an
// Anatolian lozenge do), corners are stepped, counters stay open.
//
// buildGlyph() turns a cell picture into a material sprite: the woven body,
// a one-pixel keyline round it, slits (a dark one-pixel gap) along every
// edge that runs with the warp for three pixels or more (the warp runs
// across the glass on this loom, so along horizontal edges), and a göz, a
// small weld lozenge, in every closed counter.

export const CW = 11, CH = 18;           // cells
export const GW = CW * 2, GH = CH * 2;   // pixels: 22 x 36
export const MX = 3, MY = 2;               // body offset inside the sprite
export const SW = GW + 2 * MX, SH = GH + 2 * MY;   // 28 x 40: body, a contour band, keyline or slit

export const M_BODY = 3, M_KEY = 4, M_SLIT = 5, M_EYE = 14, M_BAND = 15;

const PICS = {
  0: [
    '....###....',
    '...#####...',
    '..###.###..',
    '.###...###.',
    '###.....###',
    '###.....###',
    '###.....###',
    '###.....###',
    '###.....###',
    '###.....###',
    '###.....###',
    '###.....###',
    '###.....###',
    '###.....###',
    '.###...###.',
    '..###.###..',
    '...#####...',
    '....###....',
  ],
  1: [
    '.....###...',
    '....####...',
    '...#####...',
    '..##.###...',
    '.##..###...',
    '##...###...',
    '##...###...',
    '.....###...',
    '.....###...',
    '.....###...',
    '.....###...',
    '.....###...',
    '.....###...',
    '.....###...',
    '##...###.##',
    '##...###.##',
    '###########',
    '###########',
  ],
  2: [
    '....###....',
    '...#####...',
    '..###.###..',
    '.###...###.',
    '###.....###',
    '##......###',
    '##.....###.',
    '......###..',
    '.....###...',
    '....###....',
    '...###.....',
    '..###......',
    '.###.......',
    '###........',
    '###.....##.',
    '###.....##.',
    '###########',
    '###########',
  ],
  3: [
    '....###....',
    '...#####...',
    '..###.###..',
    '.###...###.',
    '.##....###.',
    '.##...###..',
    '.....###...',
    '...#####...',
    '......###..',
    '.......###.',
    '........###',
    '........###',
    '##......###',
    '##......###',
    '.###...###.',
    '..###.###..',
    '...#####...',
    '....###....',
  ],
  4: [
    '.......###.',
    '......####.',
    '.....#####.',
    '....######.',
    '...###.###.',
    '..###..###.',
    '.###...###.',
    '###....###.',
    '###....###.',
    '###########',
    '###########',
    '.......###.',
    '.......###.',
    '.......###.',
    '.......###.',
    '.......###.',
    '......#####',
    '......#####',
  ],
  5: [
    '###########',
    '###########',
    '###......##',
    '###......##',
    '###........',
    '###........',
    '#######....',
    '.....###...',
    '......###..',
    '.......###.',
    '........###',
    '........###',
    '##......###',
    '##......###',
    '.###...###.',
    '..###.###..',
    '...#####...',
    '....###....',
  ],
  6: [
    '......#####',
    '.....###.##',
    '....###..##',
    '...###.....',
    '..###......',
    '.###.......',
    '###........',
    '###.###....',
    '########...',
    '#####.###..',
    '###....###.',
    '###.....###',
    '###.....###',
    '###.....###',
    '.###...###.',
    '..###.###..',
    '...#####...',
    '....###....',
  ],
  7: [
    '###########',
    '###########',
    '##......###',
    '##.....###.',
    '......###..',
    '.....###...',
    '....###....',
    '...###.....',
    '...###.....',
    '...###.....',
    '...###.....',
    '...###.....',
    '...###.....',
    '...###.....',
    '...###.....',
    '...###.....',
    '..#####....',
    '..#####....',
  ],
  8: [
    '....###....',
    '...#####...',
    '..###.###..',
    '.###...###.',
    '.##.....##.',
    '.###...###.',
    '..###.###..',
    '...#####...',
    '..###.###..',
    '.###...###.',
    '###.....###',
    '###.....###',
    '###.....###',
    '###.....###',
    '.###...###.',
    '..###.###..',
    '...#####...',
    '....###....',
  ],
};
// 9 is the 6 turned half round, as a weaver would chart it
PICS[9] = PICS[6].map((r) => [...r].reverse().join('')).reverse();

/**
 * Material sprite SW x SH: 0 transparent (ground), M_BODY, M_SLIT (a dark
 * one-pixel gap beside every vertical edge three rows or longer: where two
 * colours meet along a warp the cloth opens a slit), M_KEY (one pixel round
 * the rest of the figure). The body sits at (MX, MY).
 */
function buildGlyph(d) {
  const pic = PICS[d], s = new Uint8Array(SW * SH);
  const B = (x, y) => {
    const cx = (x - MX) >> 1, cy = (y - MY) >> 1;
    return x >= MX && y >= MY && cx < CW && cy < CH && pic[cy][cx] === '#';
  };
  for (let y = 0; y < SH; y++)
    for (let x = 0; x < SW; x++) {
      if (B(x, y)) { s[y * SW + x] = M_BODY; continue; }
      let n = false;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) n = n || B(x + i, y + j);
      if (n) s[y * SW + x] = M_BAND;
    }
  // the walnut keyline round the contour band (4-neighbours: a stepped contour stays one pass thick)
  const isB = (x, y) => x >= 0 && y >= 0 && x < SW && y < SH && s[y * SW + x] === M_BAND;
  for (let y = 0; y < SH; y++)
    for (let x = 0; x < SW; x++)
      if (!s[y * SW + x] && (isB(x - 1, y) || isB(x + 1, y) || isB(x, y - 1) || isB(x, y + 1))) s[y * SW + x] = M_KEY;
  const R = (x, y) => x >= 0 && y >= 0 && x < SW && y < SH && (s[y * SW + x] === M_BODY || s[y * SW + x] === M_BAND);
  for (const dir of [-1, 1])
    for (let y = 0; y < SH; y++) {
      let run = 0;
      for (let x = 0; x <= SW; x++) {
        if (x < SW && s[y * SW + x] === M_KEY && R(x, y - dir)) { run++; continue; }
        if (run >= 3) for (let k = x - run; k < x; k++) s[y * SW + k] = M_SLIT;
        run = 0;
      }
    }
  // a göz (eye) in every closed counter: a small stepped lozenge, as kilim
  // weavers put one inside each closed figure
  const seen = new Uint8Array(SW * SH), stack = [];
  const flood = (x0, y0) => {
    const pts = []; stack.push(x0, y0); seen[y0 * SW + x0] = 1;
    let open = false;
    while (stack.length) {
      const y = stack.pop(), x = stack.pop(); pts.push(x, y);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= SW || ny >= SH) { open = true; continue; }
        const k = ny * SW + nx;
        if (!seen[k] && !B(nx, ny)) { seen[k] = 1; stack.push(nx, ny); }
      }
    }
    return { pts, open };
  };
  for (let y = 0; y < SH; y++)
    for (let x = 0; x < SW; x++) {
      if (seen[y * SW + x] || B(x, y)) continue;
      const { pts, open } = flood(x, y);
      if (open || pts.length < 60) continue;
      let sx = 0, sy = 0;
      for (let i = 0; i < pts.length; i += 2) { sx += pts[i]; sy += pts[i + 1]; }
      const cx = Math.round(sx / (pts.length / 2)), cy = Math.round(sy / (pts.length / 2));
      for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++)
        if (Math.abs(i) + Math.abs(j) <= 2) s[(cy + j) * SW + cx + i] = M_EYE;
    }
  return s;
}

export const GLYPHS = Array.from({ length: 10 }, (_, d) => buildGlyph(d));
