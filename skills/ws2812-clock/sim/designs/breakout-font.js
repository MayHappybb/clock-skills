// Breakout's brick font. Each numeral is drawn on a half-brick grid (8 units
// wide, 11 courses tall) and then LAID in running bond: even courses start
// their bricks on even units, odd courses on odd units, and a run that does
// not fit whole bricks is closed with a half brick, the way a bricklayer
// finishes a pier. So the curves are corbelled (each course steps out half a
// brick), the verticals are toothed piers, and the same numeral is made of
// different bricks than its neighbour wherever its edges differ. A minute
// turn then knocks out exactly the bricks the old numeral has and the new one
// lacks.
//
// One unit is 3 px, one course 4 px, so a whole brick is 6 x 4 px of which
// 5 x 3 is lit (1 px of mortar), a half brick 3 x 4 (2 x 3 lit).

export const UNIT = 3, COURSE = 4, GW = 8, GH = 11;

const G = {
  0: [
    '..####..',
    '.##..##.',
    '##....##',
    '##....##',
    '##....##',
    '##....##',
    '##....##',
    '##....##',
    '##....##',
    '.##..##.',
    '..####..'],
  1: [
    '...##...',
    '..###...',
    '.####...',
    '...##...',
    '...##...',
    '...##...',
    '...##...',
    '...##...',
    '...##...',
    '...##...',
    '.######.'],
  2: [
    '..####..',
    '.##..##.',
    '##....##',
    '......##',
    '.....##.',
    '....##..',
    '...##...',
    '..##....',
    '.##.....',
    '##......',
    '########'],
  3: [
    '.#####..',
    '##...##.',
    '......##',
    '......##',
    '.....##.',
    '..####..',
    '.....##.',
    '......##',
    '##....##',
    '.##..##.',
    '..####..'],
  4: [
    '....###.',
    '...####.',
    '..##.##.',
    '.##..##.',
    '##...##.',
    '##...##.',
    '########',
    '.....##.',
    '.....##.',
    '.....##.',
    '.....##.'],
  5: [
    '########',
    '##......',
    '##......',
    '##......',
    '######..',
    '.....##.',
    '......##',
    '......##',
    '##....##',
    '.##..##.',
    '..####..'],
  6: [
    '...###..',
    '..##....',
    '.##.....',
    '##......',
    '######..',
    '##...##.',
    '##....##',
    '##....##',
    '##....##',
    '.##..##.',
    '..####..'],
  7: [
    '########',
    '......##',
    '.....##.',
    '.....##.',
    '....##..',
    '....##..',
    '...##...',
    '...##...',
    '..##....',
    '..##....',
    '..##....'],
  8: [
    '..####..',
    '.##..##.',
    '##....##',
    '.##..##.',
    '..####..',
    '.##..##.',
    '##....##',
    '##....##',
    '##....##',
    '.##..##.',
    '..####..'],
  9: [
    '..####..',
    '.##..##.',
    '##....##',
    '##....##',
    '##....##',
    '.##...##',
    '..######',
    '......##',
    '.....##.',
    '....##..',
    '..###...'],
};

const cache = new Map();
/** The bricks of numeral ch: [{ r, u, len, key }] in course r, starting at unit u, len 1 (half) or 2 (whole). */
export function bricksOf(ch) {
  if (cache.has(ch)) return cache.get(ch);
  const rows = G[ch], out = [];
  rows.forEach((row, r) => {
    const p = r & 1;
    let u = 0;
    while (u < GW) {
      if (row[u] !== '#') { u++; continue; }
      let b = u;
      while (b < GW && row[b] === '#') b++;
      let k = u;
      if (((k - p) & 1) !== 0) { out.push({ r, u: k, len: 1 }); k++; }
      while (k + 2 <= b) { out.push({ r, u: k, len: 2 }); k += 2; }
      if (k < b) out.push({ r, u: k, len: 1 });
      u = b;
    }
  });
  for (const b of out) b.key = b.r * 100 + b.u * 10 + b.len;
  cache.set(ch, out);
  return out;
}
