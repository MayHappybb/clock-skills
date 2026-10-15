// Knitting: the cloth, the yarns and the charted numerals (flash tables).
//
// The fabric is a stockinette grid of 4 x 4 px stitches, 42 columns by 22
// rows (one column and two rows hang outside the glass so the cloth can be
// pulled and swung without running out). Every fabric pixel is baked once
// into three maps: which stitch owns it (S0), which neighbour stitch a stray
// fibre of the fuzzy halo may borrow its colour from (S1, with a boil phase),
// and its shade inside the knitted V (0 gap, 1 tip, 2 right leg, 3 left leg).
// A frame then only has to say which yarn each stitch is (the chart) and
// where the cloth is (a warp), and every pixel is three table lookups.

import { hash, rand, to565 } from '../js/kit.js';

export const CC = 42, CR = 22;           // chart columns, rows
export const FW = CC * 4, FH = CR * 4;   // fabric pixels: 168 x 88
export const OX = 4;                     // fabric x = screen x + OX (chart col 0 is off the left edge)

// ------------------------------------------------------------ the stitch
// One knit stitch, a V of two legs. The top-centre pair is the tip of the
// stitch above dipping into this one (owned by row r - 1): that overlap is
// what makes the columns interlock like real stockinette.
const TILE = [
  [3, 1, 1, 2],
  [3, 3, 2, 2],
  [0, 3, 2, 0],
  [0, 3, 2, 0],
];

export const S0 = new Uint16Array(FW * FH);
export const S1 = new Uint16Array(FW * FH);
export const PS = new Uint8Array(FW * FH);   // shade | boil phase << 2 (phase 0..7)

{
  const cl = (v, hi) => (v < 0 ? 0 : v > hi ? hi : v);
  for (let fy = 0; fy < FH; fy++) {
    for (let fx = 0; fx < FW; fx++) {
      const c = fx >> 2, r = fy >> 2, tx = fx & 3, ty = fy & 3, p = fy * FW + fx;
      const tip = ty === 0 && (tx === 1 || tx === 2);
      const sr = tip ? cl(r - 1, CR - 1) : r;
      const h = hash(c, sr, 7);
      let sh = TILE[ty][tx];
      // tension: some stitches pulled tighter or looser than their neighbours
      if (!tip && tx === 1 && ty >= 1 && (h & 7) === 0) sh = 2;              // a duller left leg
      if (!tip && tx === 2 && ty === 1 && ((h >> 3) & 7) === 0) sh = 3;      // a right leg catching light
      if (sh === 0 && ((h >> 6) & 7) < 2) sh = 1;                            // a fuller stitch, less gap
      if (tip && ((h >> 9) & 3) === 0) sh = 0;                               // a deep tip
      const own = sr * CC + c;
      let alt = own;
      // the fuzzy halo: fibres of the neighbour stitch straying over the edge
      const q = rand(fx, fy, 11);
      if (tx === 0 && q < 0.34) alt = sr * CC + cl(c - 1, CC - 1);
      else if (tx === 3 && q < 0.34) alt = sr * CC + cl(c + 1, CC - 1);
      else if (tip && q < 0.3) alt = r * CC + c;
      else if (ty === 3 && q < 0.22) alt = cl(r + 1, CR - 1) * CC + c;
      S0[p] = own; S1[p] = alt;
      PS[p] = sh | ((hash(fx, fy, 13) & 7) << 2);
    }
  }
}

// ------------------------------------------------------------ yarns and colourways
// Fair Isle: a handful of yarns per jumper, never more than two in a row.
// Seven yarn roles per colourway; each yarn has four shades (gap, tip, leg,
// lit leg), and a 'fresh' variant (just knitted, the fibre still lifted).
export const G1 = 0, G2 = 1, M1 = 2, M2 = 3, PB = 4, PF = 5, A1 = 6;
export const NY = 7;

const C = (s) => parseInt(s.replace('#', ''), 16);
// ground: which of the 12 band rows use G2; motif: how the numeral's yarns are laid;
// top / bot: the peerie bands above and below the band
export const COLOURWAYS = [
  { name: 'Shetland', y: ['#2e2119', '#4b2a1d', '#f1e6cc', '#efc561', '#86402a', '#d0a35a', '#5d6b47'], ground: '001111111100', motif: 'rows', top: 1, bot: 0 },
  { name: 'Selbu', y: ['#6c1219', '#86191f', '#f6f0e4', '#f6f0e4', '#9c2a2a', '#dccab4', '#9c3a32'], ground: '011111111110', motif: 'solid', top: 2, bot: 2 },
  { name: 'Fjord', y: ['#151e38', '#1e2f52', '#f2ead6', '#a6d2e6', '#2f4f80', '#c4d6e0', '#b8372c'], ground: '000111111000', motif: 'check', top: 0, bot: 1 },
  { name: 'Spruce', y: ['#163022', '#21412e', '#f1e7d0', '#ebbb48', '#7e2b26', '#e3c48a', '#a33a2c'], ground: '001111111100', motif: 'stripe', top: 1, bot: 2 },
  { name: 'Heather', y: ['#2d1b34', '#432649', '#f4e8e2', '#f2b0bc', '#3d7d78', '#e7c069', '#6f4a78'], ground: '000011110000', motif: 'rows', top: 2, bot: 1 },
  { name: 'Lopi', y: ['#242427', '#35353b', '#f3eee3', '#dcc69c', '#857c70', '#e6dfcf', '#b78b3d'], ground: '011111111110', motif: 'check', top: 0, bot: 0 },
  { name: 'Night', y: ['#111829', '#172138', '#ded6c0', '#cdb67c', '#22314f', '#73819c', '#2a3858'], ground: '001111111100', motif: 'rows', top: 2, bot: 0 },
  { name: 'Night moss', y: ['#0f1a17', '#15261f', '#dcd5bf', '#a9c6b2', '#203a31', '#6f8c80', '#2a4238'], ground: '011111111110', motif: 'check', top: 1, bot: 2 },
].map((w) => ({ ...w, y: w.y.map(C) }));
export const NCW = COLOURWAYS.length;
export const NIGHT_CW = 6;

/** The colourway of an hour: two night jumpers in turn from 23:00 to 07:00, else one of six. */
export const cwOf = (h) => (h >= 23 || h < 7 ? NIGHT_CW + (h & 1) : h % 6);

const ch = (v, k) => (v >> k) & 255;
function mixw(c, w, a) {
  const f = (k) => Math.round(ch(c, k) + (ch(w, k) - ch(c, k)) * a);
  return (f(16) << 16) | (f(8) << 8) | f(0);
}
function shades(c) {
  return [mixw(c, 0x000000, 0.5), mixw(c, 0x000000, 0.24), c, mixw(c, 0xffffff, 0.15)];
}
/** RGB565 for (colourway + NCW * fresh, yarn, shade) at ((pal * NY + yarn) * 4 + shade). */
export const PAL = new Uint16Array(NCW * 2 * NY * 4);
/** The same in 0xRRGGBB, for the overlay shapes. */
export const RGB = new Int32Array(NCW * 2 * NY * 4);
for (let fresh = 0; fresh < 2; fresh++)
  for (let k = 0; k < NCW; k++)
    for (let y = 0; y < NY; y++) {
      const base = COLOURWAYS[k].y[y];
      const sh = shades(fresh ? mixw(base, 0xffffff, y === G1 || y === G2 ? 0.16 : 0.35) : base);
      for (let s = 0; s < 4; s++) {
        const i = (((k + fresh * NCW) * NY) + y) * 4 + s;
        RGB[i] = sh[s]; PAL[i] = to565(sh[s]);
      }
    }

// ------------------------------------------------------------ the chart
export const BAND0 = 4;                         // first row of the numerals' band (12 rows)
export const SLOT_C = [4, 12, 23, 31];          // chart column of each numeral's left edge
export const BAND_C = [20, 21];                 // the cardigan's button band, knitted in the peerie ground
export const BUTTON_Y = [32, 48];               // the two buttons on it are the colon (px, centre)

const PEERIE_TOP = [['#.', '.#'], ['##..', '..##'], ['#...', '..#.']];
const PEERIE_BOT = [['.#..', '###.', '.#..'], ['#...', '.#.#', '..#.'], ['.#..', '#.#.', '.#..']];

/** The jumper's pattern without the time: one yarn per stitch, per colourway. */
export const BASE = COLOURWAYS.map((w, k) => {
  const B = new Uint8Array(CC * CR);
  for (let r = 0; r < CR; r++)
    for (let c = 0; c < CC; c++) {
      let y;
      if (r === 0) y = PB;
      else if (r <= 2) { const p = PEERIE_TOP[w.top][r - 1]; y = p[(c + 1) % p.length] === '#' ? PF : PB; }
      else if (r === 3 || r === 16) y = G1;
      else if (r < 16) y = w.ground[r - BAND0] === '1' ? G2 : G1;
      else { const p = PEERIE_BOT[w.bot][(r - 17) % 3]; y = p[(c + 1) % p.length] === '#' ? PF : PB; }
      B[r * CC + c] = y;
    }
  // the button band runs the full height between the two fronts, its edge stitches a shade darker (the rib turning)
  for (let r = 1; r < CR; r++) for (const c of BAND_C) B[r * CC + c] = PB;
  return B;
});

/** Which yarn knits the numeral's stitch (gx, gy) in colourway k. */
export function motifYarn(k, gx, gy) {
  switch (COLOURWAYS[k].motif) {
    case 'rows': return gy >= 3 && gy <= 8 ? M2 : M1;
    case 'check': return (gx + gy) & 1 ? M2 : M1;
    case 'stripe': return gy & 1 ? M2 : M1;
    default: return M1;
  }
}

// ------------------------------------------------------------ the numerals
// Charted for this grid: 7 stitches by 12 rows, strokes two stitches thick,
// corners cut by one stitch, counters at least 3 x 3 stitches (12 x 12 px),
// the 4 closed on a two-stitch diagonal, the 6 and 9 with open hooks.
const ART = {
  0: ['.#####.', '#######', '##...##', '##...##', '##...##', '##...##', '##...##', '##...##', '##...##', '##...##', '#######', '.#####.'],
  1: ['...##..', '..###..', '.####..', '##.##..', '...##..', '...##..', '...##..', '...##..', '...##..', '...##..', '.######', '.######'],
  2: ['.#####.', '#######', '##...##', '.....##', '.....##', '....###', '...###.', '..###..', '.###...', '###....', '#######', '#######'],
  3: ['.#####.', '#######', '##...##', '.....##', '.....##', '..####.', '..####.', '.....##', '.....##', '##...##', '#######', '.#####.'],
  4: ['....##.', '...###.', '..####.', '.##.##.', '##..##.', '##..##.', '#######', '#######', '....##.', '....##.', '....##.', '....##.'],
  5: ['#######', '#######', '##.....', '##.....', '######.', '#######', '.....##', '.....##', '.....##', '##...##', '#######', '.#####.'],
  6: ['..####.', '.#####.', '##.....', '##.....', '######.', '#######', '##...##', '##...##', '##...##', '##...##', '#######', '.#####.'],
  7: ['#######', '#######', '.....##', '....###', '....##.', '...###.', '...##..', '..###..', '..##...', '..##...', '..##...', '..##...'],
  8: ['.#####.', '#######', '##...##', '##...##', '##...##', '.#####.', '.#####.', '##...##', '##...##', '##...##', '#######', '.#####.'],
  9: ['.#####.', '#######', '##...##', '##...##', '##...##', '##...##', '#######', '.######', '.....##', '.....##', '.#####.', '.####..'],
};
/** Per digit: the stitches it is knitted with, as [gx, gy] pairs. */
export const GLYPH = Array.from({ length: 10 }, (_, d) => {
  const cells = [];
  ART[d].forEach((row, gy) => [...row].forEach((ch2, gx) => { if (ch2 === '#') cells.push([gx, gy]); }));
  return cells;
});
