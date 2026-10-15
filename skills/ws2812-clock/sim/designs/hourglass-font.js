// The Hourglass font: ten digits on 3 x 7 grains, and every one of them is
// made of exactly GRAINS grains of gold. The tile never gains or loses sand:
// when a 1 becomes an 8 the same twelve grains move. So the letterforms are
// designed for conservation of mass: sparse figures (1, 7) carry their spare
// grains as a heavier foot or brow, dense ones (0, 8) are opened up.

export const GRAINS = 12;

export const DIGITS = {
  '0': ['.#.', '#.#', '#.#', '#.#', '#.#', '#.#', '.#.'],
  '1': ['.#.', '##.', '.#.', '.#.', '.#.', '###', '###'],
  '2': ['###', '#.#', '..#', '.#.', '#..', '#..', '###'],
  '3': ['###', '..#', '..#', '.##', '..#', '..#', '###'],
  '4': ['#.#', '#.#', '#.#', '###', '..#', '..#', '..#'],
  '5': ['###', '#..', '#..', '###', '..#', '#.#', '.#.'],
  '6': ['.##', '#..', '#..', '###', '#.#', '#.#', '.#.'],
  '7': ['###', '..#', '.##', '.##', '.##', '.#.', '.#.'],
  '8': ['.#.', '#.#', '.#.', '###', '#.#', '#.#', '.#.'],
  '9': ['.#.', '#.#', '#.#', '###', '..#', '..#', '##.'],
};

/** Cells (col, row) of a digit, as [c, r] pairs. */
export function cells(d) {
  const out = [];
  DIGITS[d].forEach((row, r) => { for (let c = 0; c < 3; c++) if (row[c] === '#') out.push([c, r]); });
  return out;
}

for (const d of Object.keys(DIGITS)) {
  const n = cells(d).length;
  if (n !== GRAINS) throw new Error(`hourglass font: digit ${d} has ${n} grains, not ${GRAINS}`);
}
