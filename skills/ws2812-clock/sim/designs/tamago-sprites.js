// Tamago sprites: ten digit-chicks drawn for one 8x8 ESP32-S3-Matrix tile.
// Each body is 6 x 7 (tile columns 1..6, rows 0..6); row 7 is for feet.
// '#' full, '+' half, ':' quarter coverage (hand-placed anti-aliasing).
// eyes: the left pixel of each two-pixel googly eye, in tile pixels
// (pixel centres are integers); the pupil slides across the pair.

const D = {
  0: { rows: [
    '.####.',
    '##..##',
    '##..##',
    '##..##',
    '##..##',
    '##..##',
    '.####.'], feet: [2, 5], eyes: [[1, 1], [5, 1]] },
  1: { rows: [
    '..##..',
    '.###..',
    '+.##..',
    '..##..',
    '..##..',
    '..##..',
    '.####.'], feet: [2, 5], eyes: [[3, 1]] },
  2: { rows: [
    '.####.',
    '##..##',
    '....##',
    '..###+',
    '.##+..',
    '##....',
    '######'], feet: [2, 5], eyes: [[1, 1], [5, 1]] },
  3: { rows: [
    '.####.',
    '##..##',
    '....##',
    '..###.',
    '....##',
    '##..##',
    '.####.'], feet: [2, 5], eyes: [[1, 1], [5, 1]] },
  4: { rows: [
    '##..##',
    '##..##',
    '##..##',
    '######',
    '....##',
    '....##',
    '....##'], feet: [5, 6], eyes: [[1, 1], [5, 1]] },
  5: { rows: [
    '######',
    '##....',
    '#####.',
    '....##',
    '....##',
    '##..##',
    '.####.'], feet: [2, 5], eyes: [[1, 0], [4, 0]] },
  6: { rows: [
    '..###.',
    '.##...',
    '##....',
    '#####.',
    '##..##',
    '##..##',
    '.####.'], feet: [2, 5], eyes: [[1, 4], [5, 4]] },
  7: { rows: [
    '######',
    '....##',
    '...##+',
    '..##..',
    '.+##..',
    '.##...',
    '.##...'], feet: [2, 3], eyes: [[5, 1]] },
  8: { rows: [
    '.####.',
    '##..##',
    '##..##',
    '.####.',
    '##..##',
    '##..##',
    '.####.'], feet: [2, 5], eyes: [[1, 1], [5, 1]] },
  9: { rows: [
    '.####.',
    '##..##',
    '##..##',
    '.#####',
    '....##',
    '...##+',
    '.###..'], feet: [2, 4], eyes: [[1, 1], [5, 1]] },
};

const LEVEL = { '#': 1, '+': 0.5, ':': 0.25 };

/** For each digit: body mask (8x8), feet mask (8x8), eyes [[x, y]]. */
export const SPRITES = Array.from({ length: 10 }, (_, d) => {
  const s = D[d], body = new Float32Array(64), feet = new Float32Array(64);
  s.rows.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) body[r * 8 + c + 1] = LEVEL[row[c]] ?? 0;
  });
  for (const x of s.feet) feet[7 * 8 + x] = 1;
  return { body, feet, eyes: s.eyes };
});
