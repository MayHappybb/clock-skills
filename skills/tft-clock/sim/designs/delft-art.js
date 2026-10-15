// Shared by delft.js and its pictures: the palette indices, the night
// remap, and the ships, skaters, gulls and tulip heads that glide (byte maps
// of palette indices, flash on the device, drawn into the face's index
// buffer; delft.js turns indices into colour in one pass).

// ------------------------------------------------------------ palette indices
export const I = {
  GROUT: 0, G0: 1,                        // G0..G3: four glazes, one per tile
  TREK: 5, WASH: 6, MID: 7, LIGHT: 8, MANG: 9,
  PLASTER: 10, PLASTER2: 11, SHADOW: 12, POUNCE: 13,
  M1: 14, M2: 15, M3: 16, L1: 17,         // mid blue at 1/4, 1/2, 3/4 coverage; light at 1/2 (gliding edges)
  P0: 18, P1: 19, NW: 20, NL: 21,         // night: powder-blue ground (two sponge tones), white reserve, pale
  NM1: 22, NM2: 23, NM3: 24, NL1: 25,
  BISCUIT: 26, WOOD: 27, FERRULE: 28, POOL: 29, BISCUIT2: 30,
};
export const NI = 32;

// Night: the same painting, as 'poederblauw' tiles: the ground sponged blue,
// the figures reserved in white glaze.
export const NIGHT_MAP = new Uint8Array(NI).map((_, i) => i);
NIGHT_MAP[I.G0] = NIGHT_MAP[I.G0 + 1] = NIGHT_MAP[I.G0 + 2] = NIGHT_MAP[I.G0 + 3] = I.P0;
NIGHT_MAP[I.MID] = I.NW; NIGHT_MAP[I.LIGHT] = I.NL; NIGHT_MAP[I.MANG] = I.NL;
NIGHT_MAP[I.M1] = I.NM1; NIGHT_MAP[I.M2] = I.NM2; NIGHT_MAP[I.M3] = I.NM3; NIGHT_MAP[I.L1] = I.NL1;

// ------------------------------------------------------------ coverage to index
/** Mid blue at coverage c (0..1), light at coverage l: the index, or -1 for glaze. */
export function covIndex(c, l = 0) {
  if (c >= 0.88) return I.MID;
  if (c >= 0.62) return I.M3;
  if (c >= 0.37) return I.M2;
  if (l >= 0.6) return I.LIGHT;
  if (c >= 0.13) return I.M1;
  if (l >= 0.25) return I.L1;
  return -1;
}

/**
 * An actor that glides along the frieze, as 8 sub-pixel phases: each phase a
 * byte map one column wider, drawn with coverage indices so it moves by
 * eighths of a pixel instead of hopping.
 */
export function glider(rows) {
  const h = rows.length, w = rows[0].length;
  const src = rows.map((r) => [...r]);
  const phases = [];
  for (let p = 0; p < 8; p++) {
    const f = p / 8, m = new Int8Array((w + 1) * h).fill(-1);
    for (let y = 0; y < h; y++)
      for (let x = 0; x <= w; x++) {
        const a = x < w ? src[y][x] : '.', b = x > 0 ? src[y][x - 1] : '.';
        const c = (a === 'm' ? 1 - f : 0) + (b === 'm' ? f : 0);
        const l = (a === 'l' ? 1 - f : 0) + (b === 'l' ? f : 0);
        const v = covIndex(c, l);
        if (v >= 0) m[y * (w + 1) + x] = v;
      }
    phases.push(m);
  }
  return { w: w + 1, h, phases };
}

export const FLUYT = glider([
  '......m.......',
  '.....lml......',
  '....llmll.....',
  '...lllmlll....',
  '..llllmllll...',
  '...lllmlll..m.',
  '......m....mm.',
  'mmmmmmmmmmmmm.',
  '.mlmlmlmlmlm..',
  '..mmmmmmmmm...',
]);
export const BARGE = glider([
  '....m...',
  '...lm...',
  '..llm...',
  '.lllm...',
  '....m...',
  'mmmmmmmm',
  '.mmmmmm.',
]);
export const SKATER_A = glider([
  '...mm..',
  '...mm..',
  '..mmm..',
  '.mmmmm.',
  'm..mmmm',
  '...mmm.',
  '...m.m.',
  '..m...m',
  '.mm...mm',
].map((r) => r.padEnd(8, '.')));
export const SKATER_B = glider([
  '..mm...',
  '..mm...',
  '.mmmm..',
  '.mmmmm.',
  '.mmmm.m',
  '..mmm..',
  '..m.m..',
  '..m..m.',
  '.mm..mm',
].map((r) => r.padEnd(8, '.')));

export const GULLS = [
  ['m...m', '.m.m.', '..m..'],
  ['.....', 'mm.mm', '..m..'],
  ['.....', '.mmm.', 'm.m.m'],
].map((rows) => glider(rows));

export const TULIP = glider([
  'm..m..m',
  'mm.m.mm',
  'mlmmmlm',
  'mlllllm',
  'mlllllm',
  '.mllll.',
  '..mmm..',
]);
