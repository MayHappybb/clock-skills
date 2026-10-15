// Card-stunt numerals: an athletic block face drawn on the stand's own grid,
// one character per seat (8 seats wide, 14 rows tall). Each seat holds one
// card; a card is a whole colour ('#') or printed diagonally in two halves,
// so the chamfers run at a clean 45 degrees across the rows:
//   r  keeps the lower-right half  (like ◢)     l  keeps the lower-left (◣)
//   R  keeps the upper-right half  (like ◥)     L  keeps the upper-left (◤)
// Outer corners are chamfered by two cards, counters by one, so every
// counter stays open and wide (4 seats) and no two digits share a skeleton.
//
// A card is 4 x 3 pixels with a 1-pixel row of crowd under it (the gap
// between rows), so a seat is a 4 x 4 cell. MASK[ch] is the 12-bit pixel
// mask of a card (bit j * 4 + i, i across, j down) for each character.

export const GW = 8, GH = 14;

const GLYPHS = {
  0: [
    '.r####l.',
    'r######l',
    '##L..R##',
    '##....##',
    '##....##',
    '##....##',
    '##....##',
    '##....##',
    '##....##',
    '##....##',
    '##....##',
    '##l..r##',
    'R######L',
    '.R####L.'],
  1: [
    '...r##..',
    '..r###..',
    '.r####..',
    'r#L.##..',
    '....##..',
    '....##..',
    '....##..',
    '....##..',
    '....##..',
    '....##..',
    '....##..',
    '....##..',
    '.######.',
    '.######.'],
  2: [
    '.r####l.',
    'r######l',
    '##L..R##',
    'RL...r##',
    '....r##L',
    '...r##L.',
    '..r##L..',
    '.r##L...',
    'r##L....',
    '##L.....',
    '##......',
    '##l.....',
    '########',
    '########'],
  3: [
    '.r####l.',
    'r######l',
    '##L..R##',
    'RL....##',
    '......##',
    '.....r#L',
    '..r####.',
    '..R####.',
    '.....R#l',
    '......##',
    'rl....##',
    '##l..r##',
    'R######L',
    '.R####L.'],
  4: [
    '....r##.',
    '...r###.',
    '..r####.',
    '.r##L##.',
    'r##L.##.',
    '##L..##.',
    '##...##.',
    '##...##.',
    '########',
    '########',
    '.....##.',
    '.....##.',
    '.....##.',
    '.....##.'],
  5: [
    '########',
    '########',
    '##......',
    '##......',
    '##......',
    '######l.',
    '#######l',
    '.....R##',
    '......##',
    '......##',
    'rl....##',
    '##l..r##',
    'R######L',
    '.R####L.'],
  6: [
    '.r####l.',
    'r######L',
    '##L.....',
    '##......',
    '##......',
    '######l.',
    '#######l',
    '##L..R##',
    '##....##',
    '##....##',
    '##....##',
    '##l..r##',
    'R######L',
    '.R####L.'],
  7: [
    '########',
    '########',
    '.....r##',
    '....r##L',
    '...r##L.',
    '..r##L..',
    '..##L...',
    '..##....',
    '..##....',
    '..##....',
    '..##....',
    '..##....',
    '..##....',
    '..##....'],
  8: [
    '.r####l.',
    'r######l',
    '##L..R##',
    '##....##',
    '##l..r##',
    'R######L',
    'r######l',
    '##L..R##',
    '##....##',
    '##....##',
    '##....##',
    '##l..r##',
    'R######L',
    '.R####L.'],
  9: [
    '.r####l.',
    'r######l',
    '##L..R##',
    '##....##',
    '##....##',
    '##....##',
    '##l..r##',
    'R#######',
    '.R######',
    '......##',
    '......##',
    '.....r##',
    'r######L',
    '.R####L.'],
};

/** 12-bit card masks: bit j * 4 + i for pixel (i, j) of the 4 x 3 card. */
export const MASK = { '.': 0, '#': 0xfff };
function maskOf(test) {
  let m = 0;
  for (let j = 0; j < 3; j++) for (let i = 0; i < 4; i++) if (test(i, j)) m |= 1 << (j * 4 + i);
  return m;
}
MASK.r = maskOf((i, j) => i + j >= 3);   // lower right
MASK.l = maskOf((i, j) => i <= j);       // lower left
MASK.R = maskOf((i, j) => i >= j);       // upper right
MASK.L = maskOf((i, j) => i + j <= 3);   // upper left

/**
 * Each digit as card masks on an (8 + 1) x (14 + 1) grid: the face cards
 * and, one seat down and right, the navy drop-shadow cards (a flat cast
 * shadow, the athletic way). `face[k]` / `shadow[k]` are 12-bit masks for
 * seat k = row * 9 + col; shadow excludes what the face covers. `rank[k]`
 * (0..1) orders the seats that carry anything, ranked once by a hash, so a
 * digit leaves or arrives evenly through all its cards.
 */
export const SW = GW + 1, SH = GH + 1;
export const DIGITS = [];
for (let d = 0; d < 10; d++) {
  const rows = GLYPHS[d];
  if (rows.length !== GH || rows.some((r) => r.length !== GW)) throw new Error(`cardstunt glyph ${d} is not ${GW}x${GH}`);
  const face = new Uint16Array(SW * SH), shadow = new Uint16Array(SW * SH), rank = new Float32Array(SW * SH);
  for (let r = 0; r < GH; r++)
    for (let c = 0; c < GW; c++) {
      const m = MASK[rows[r][c]];
      face[r * SW + c] |= m;
      shadow[(r + 1) * SW + c + 1] |= m;
    }
  const used = [];
  for (let k = 0; k < SW * SH; k++) {
    shadow[k] &= ~face[k] & 0xfff;
    if (face[k] || shadow[k]) used.push(k);
  }
  // ranked once: a fixed shuffle per digit
  const keyed = used.map((k) => [k, hashRank(d, k)]).sort((a, b) => a[1] - b[1]);
  keyed.forEach(([k], n) => { rank[k] = keyed.length > 1 ? n / (keyed.length - 1) : 0; });
  DIGITS.push({ face, shadow, rank });
}

function hashRank(d, k) {
  let h = Math.imul(d + 17, 0x27d4eb2d) ^ Math.imul(k + 3, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return (h ^ (h >>> 15)) >>> 0;
}
