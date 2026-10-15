// Topo glyphs: the ten numerals as mountain ridges. Each digit is the crest
// line of a massif, drawn as an arete: straight runs meeting at sharp
// corners (a ridge breaks, it does not curve), counters wide open so the
// basins inside a 0, 6, 8 or 9 stay paper.
//
// For each digit and size the module rasterises, once at load, two byte maps
// over the digit's box plus a margin as wide as the mountain's flanks:
//   D  distance to the crest, in 1/8 px (255 = beyond the flanks)
//   S  arc length along the crest of the nearest crest point, in px
// The face derives everything from them each frame (height, rock, scree),
// so these are flash tables.

// Crest lines on a 100 x 180 design grid (x right, y down), one array of
// points per stroke.
const SKEL = {
  0: [[[50, 0], [84, 14], [100, 52], [100, 128], [84, 166], [50, 180], [16, 166], [0, 128], [0, 52], [16, 14], [50, 0]]],
  1: [[[18, 34], [58, 0], [58, 180]]],
  2: [[[2, 36], [20, 8], [52, 0], [84, 10], [100, 42], [90, 78], [0, 180], [100, 180]]],
  3: [[[4, 18], [40, 0], [80, 4], [98, 32], [90, 66], [46, 86]],
      [[46, 86], [90, 104], [100, 140], [86, 170], [48, 180], [2, 164]]],
  4: [[[72, 180], [72, 0], [0, 122], [100, 122]]],
  5: [[[94, 0], [12, 0], [4, 80], [48, 68], [84, 80], [100, 114], [96, 148], [78, 174], [44, 180], [2, 164]]],
  6: [[[88, 10], [52, 0], [18, 14], [2, 56], [0, 126], [14, 168], [50, 180], [86, 168], [100, 132], [88, 96], [50, 84], [14, 96], [1, 124]]],
  7: [[[0, 0], [100, 0], [56, 92], [40, 180]]],
  8: [[[50, 84], [16, 70], [6, 40], [18, 10], [50, 0], [82, 10], [94, 40], [84, 70], [50, 84],
       [92, 102], [100, 140], [86, 172], [50, 180], [14, 172], [0, 140], [8, 102], [50, 84]]],
  9: [[[12, 170], [48, 180], [82, 166], [98, 124], [100, 54], [86, 12], [50, 0], [14, 12], [0, 48], [12, 84], [50, 96], [86, 84], [99, 56]]],
};

function segNearest(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let u = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  u = u < 0 ? 0 : u > 1 ? 1 : u;
  const ex = px - ax - u * dx, ey = py - ay - u * dy;
  return [Math.sqrt(ex * ex + ey * ey), u];
}

/**
 * Rasterise one size: crest box `sw` x `sh` px (between stroke centres),
 * flanks `R` px. Returns { w, h, ox, oy, glyphs: [{ D, S, len }] } where
 * (ox, oy) is the offset of the crest box's top-left inside the field box.
 */
export function buildSize(sw, sh, R) {
  const M = Math.ceil(R) + 1, w = Math.ceil(sw) + 2 * M + 1, h = Math.ceil(sh) + 2 * M + 1;
  const glyphs = [];
  for (let d = 0; d <= 9; d++) {
    const strokes = SKEL[d].map((st) => st.map(([x, y]) => [M + 0.5 + (x / 100) * sw, M + 0.5 + (y / 180) * sh]));
    // arc length at each vertex, continuing across strokes
    const segs = [];
    let acc = 0;
    for (const st of strokes)
      for (let i = 1; i < st.length; i++) {
        const [ax, ay] = st[i - 1], [bx, by] = st[i];
        const L = Math.hypot(bx - ax, by - ay);
        segs.push([ax, ay, bx, by, acc, L]);
        acc += L;
      }
    const D = new Uint8Array(w * h), S = new Uint8Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let best = 1e9, bs = 0;
        for (const [ax, ay, bx, by, a0, L] of segs) {
          const [e, u] = segNearest(x + 0.5, y + 0.5, ax, ay, bx, by);
          if (e < best) { best = e; bs = a0 + u * L; }
        }
        D[y * w + x] = best >= R ? 255 : Math.min(254, Math.round(best * 8));
        S[y * w + x] = Math.round(bs) & 255;
      }
    glyphs.push({ D, S, len: acc });
  }
  return { w, h, ox: M, oy: M, sw, sh, R, glyphs };
}
