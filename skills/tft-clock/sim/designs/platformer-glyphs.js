// Platformer: the numerals, the bodies of the boss golems, drawn on a grid
// of 4 x 4 pixel units (half an 8 x 8 tile), the grid the game's tile artist
// would cut stone on. Each
// unit is full ('#') or a 45-degree cut ('a' top-left, 'b' top-right,
// 'c' bottom-left, 'd' bottom-right corner removed), so curves are tile-art
// stair steps, never anti-aliased. Strokes are two units (8 px), every
// counter at least 8 x 8 px of sky.
//
// Two sizes, one design: the hours are big golems (8 x 12 units, 32 x 48),
// the minutes smaller ones (6 x 10 units, 24 x 40).

export const U = 4;

const HH = {
  0: ['.a####b.', 'a######b', '##....##', '##....##', '##....##', '##....##', '##....##', '##....##', '##....##', '##....##', 'c######d', '.c####d.'],
  1: ['..a###..', '.a####..', 'a#.###..', '....##..', '....##..', '....##..', '....##..', '....##..', '....##..', '....##..', '..######', '..######'],
  2: ['.a####b.', 'a######b', '##....##', '......##', '.....a#d', '....a#d.', '...a#d..', '..a#d...', '.a#d....', 'a#d.....', '########', '########'],
  3: ['.a####b.', 'a######b', '##....##', '......##', '......##', '...####d', '...####b', '......##', '......##', '##....##', 'c######d', '.c####d.'],
  4: ['##....##', '##....##', '##....##', '##....##', '##....##', '##....##', '########', 'c#######', '......##', '......##', '......##', '......##'],
  5: ['########', '########', '##......', '##......', '######b.', '#######b', '......##', '......##', '......##', '......##', '#######d', '######d.'],
  6: ['.a######', 'a#######', '##......', '##......', '##......', '######b.', '#######b', '##....##', '##....##', '##....##', 'c######d', '.c####d.'],
  7: ['########', '########', '......##', '.....a#d', '....a#d.', '...a#d..', '...##...', '...##...', '...##...', '...##...', '...##...', '...##...'],
  8: ['.a####b.', 'a######b', '##....##', '##....##', 'c#....#d', '.c####d.', '.a####b.', 'a#....#b', '##....##', '##....##', 'c######d', '.c####d.'],
  9: ['.a####b.', 'a######b', '##....##', '##....##', '##....##', 'c#######', '.c######', '......##', '......##', '......##', '#######d', '######d.'],
};

const MM = {
  0: ['.a##b.', 'a####b', '##..##', '##..##', '##..##', '##..##', '##..##', '##..##', 'c####d', '.c##d.'],
  1: ['.a##..', 'a###..', '..##..', '..##..', '..##..', '..##..', '..##..', '..##..', '.####.', '.####.'],
  2: ['.a##b.', 'a####b', '##..##', '....##', '...a#d', '..a#d.', '.a#d..', 'a#d...', '######', '######'],
  3: ['.a##b.', 'a####b', '##..##', '....##', '..###d', '..###b', '....##', '##..##', 'c####d', '.c##d.'],
  4: ['##..##', '##..##', '##..##', '##..##', '######', 'c#####', '....##', '....##', '....##', '....##'],
  5: ['######', '######', '##....', '##....', '####b.', '#####b', '....##', '....##', '#####d', '####d.'],
  6: ['.a####', 'a#####', '##....', '##....', '####b.', '#####b', '##..##', '##..##', 'c####d', '.c##d.'],
  7: ['######', '######', '....##', '...a#d', '..a#d.', '..##..', '..##..', '..##..', '..##..', '..##..'],
  8: ['.a##b.', 'a####b', '##..##', 'c#..#d', '.c##d.', '.a##b.', 'a#..#b', '##..##', 'c####d', '.c##d.'],
  9: ['.a##b.', 'a####b', '##..##', '##..##', 'c#####', '.c####', '....##', '....##', '#####d', '####d.'],
};

/** Is pixel (i, j) of a 4 x 4 unit of kind k filled? Cuts remove a 6-pixel corner triangle. */
function unitPx(k, i, j) {
  if (k === '#') return true;
  if (k === 'a') return i + j >= 3;
  if (k === 'b') return (3 - i) + j >= 3;
  if (k === 'c') return i + (3 - j) >= 3;
  if (k === 'd') return (3 - i) + (3 - j) >= 3;
  return false;
}

const hashU = (a, b) => { let h = Math.imul(a + 7, 0x27d4eb2d) ^ Math.imul(b + 3, 0x165667b1); h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d); return (h ^ (h >>> 13)) >>> 0; };

/**
 * A glyph, precomputed (flash):
 *   w, h     size in pixels
 *   m        mask, 1 = stone
 *   tex      shade per pixel (-1 sky): keyline 3, stone 2, lit lip 1, joints 3
 *   unit     per pixel, the index of its 4 x 4 unit
 *   units    [{ ux, uy, rank }]: rank 0..1, the order the stones leave in
 *   eyes     [[x, y], [x, y]]: where the two eye sockets sit (top stroke)
 *   feet     [x, ...]: left edges of the feet under the bottom stroke
 */
function glyphOf(rows, d) {
  const cw = rows[0].length, w = cw * U, h = rows.length * U, m = new Uint8Array(w * h);
  rows.forEach((r, uy) => {
    for (let ux = 0; ux < r.length; ux++)
      for (let j = 0; j < U; j++) for (let i = 0; i < U; i++)
        if (unitPx(r[ux], i, j)) m[(uy * U + j) * w + ux * U + i] = 1;
  });
  const at = (x, y) => (x >= 0 && y >= 0 && x < w && y < h ? m[y * w + x] : 0);
  const tex = new Int8Array(w * h).fill(-1), unit = new Int16Array(w * h).fill(-1);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!at(x, y)) continue;
      const edge = !at(x - 1, y) || !at(x + 1, y) || !at(x, y - 1) || !at(x, y + 1);
      let v = 2;
      if (edge) v = 3;
      else if (!at(x, y - 2)) v = 1;                         // the lit lip under every top surface
      else {
        // ashlar: a dashed bed joint every 8 rows, a lit nick at each stone's corner
        const c = (y + 4) >> 3, ry = (y + 4) & 7, rx = (x + (c & 1) * 5) % 10;
        if (ry === 0 && rx > 2 && rx < 7) v = 3;
        else if (ry === 1 && rx === 2) v = 1;
      }
      tex[y * w + x] = v;
    }
  const units = [];
  const idx = new Map();
  for (let uy = 0; uy < rows.length; uy++)
    for (let ux = 0; ux < cw; ux++) if (rows[uy][ux] !== '.') { idx.set(uy * cw + ux, units.length); units.push({ ux, uy, rank: 0 }); }
  units.map((u, k) => [hashU(u.ux * 31 + u.uy, d), k]).sort((a, b) => a[0] - b[0]).forEach(([, k], r) => { units[k].rank = r / Math.max(1, units.length - 1); });
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (m[y * w + x]) unit[y * w + x] = idx.get((y >> 2) * cw + (x >> 2));
  // eyes: in the second unit row, one in each of two separate runs, or a pair in one wide run
  const runs = [], r1 = rows[1];
  for (let ux = 0; ux < cw;) { if (r1[ux] === '.') { ux++; continue; } let e = ux; while (e < cw && r1[e] !== '.') e++; runs.push([ux, e]); ux = e; }
  let eyes;
  if (runs.length >= 2) eyes = [runs[0], runs[runs.length - 1]].map(([a, b]) => [Math.round(((a + b) * U) / 2) - 2.5, 1]);
  else { const [a, b] = runs[0], c = ((a + b) * U) / 2, sp = Math.min(5, ((b - a) * U) / 4); eyes = [[Math.round(c - sp - 2.5), 1], [Math.round(c + sp - 2.5), 1]]; }
  eyes = eyes.map(([x, y]) => [x | 0, y + 1]);
  // feet: under the first and last stone run of the bottom row
  const rb = rows[rows.length - 1], bruns = [];
  for (let ux = 0; ux < cw;) { if (rb[ux] === '.') { ux++; continue; } let e = ux; while (e < cw && rb[e] !== '.') e++; bruns.push([ux * U, e * U]); ux = e; }
  const L = bruns[0], R = bruns[bruns.length - 1];
  let feet;
  if (R[1] - L[0] >= 16) feet = [L[0] + 1, R[1] - 8];
  else { const c = (L[0] + R[1]) / 2; feet = [Math.round(c - 7), Math.round(c)]; }
  return { w, h, m, tex, unit, units, eyes, feet };
}

export const GLYPH_HH = Array.from({ length: 10 }, (_, d) => glyphOf(HH[d], d));
export const GLYPH_MM = Array.from({ length: 10 }, (_, d) => glyphOf(MM[d], d + 10));
