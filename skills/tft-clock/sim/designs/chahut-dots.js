// Chahut dots: the painter's side. Seurat's palette of pure, unmixed
// pigments (and white), the mixtures he laid them in, and the dot lattice.
//
// The dot: a 5-pixel plus (a 3 px round mark at this pitch). Plus-shaped
// dots tile the plane on the slanted lattice (2,1),(-1,2): every pixel
// belongs to exactly one dot, no ground shows, and the dots never fall into
// rows or columns, so the glass reads as dabbed, not gridded.
//
// A scene is painted as material codes (one byte a pixel, on a scratch
// canvas). A code names a MIXTURE: which pure pigments its dots are laid in,
// and in what proportion. Each dot draws one pick byte per frame; the pick
// chooses its pigment from the mixture through a 256-entry table. So a
// gradient is a change in the ratio of pure dots (blue dots giving way to
// orange towards a lamp), never a blended colour, which is the method.
//
// Flash: LUTs 2 x NCODES x 256 x 2 B (~44 KB), the pixel-to-dot map
// (12800 x 2 B = 25 KB), per-dot phase and rank (2 x ~2.7 KB).

import { hash, to565, from565 } from '../js/kit.js';

const W = 160, H = 80;

// ------------------------------------------------------------ pigments
// Seurat's prismatic set: no earths and no black (his darks are
// ultramarine laid with crimson and violet).
export const PIG = {
  W: 0xfbf6e6,   // lead white
  LM: 0xf6e47c,  // lemon (zinc yellow)
  YC: 0xf0b83a,  // chrome yellow
  OR: 0xea842c,  // orange
  VM: 0xd8452a,  // vermilion
  CR: 0xa52341,  // crimson lake
  RS: 0xef9aac,  // rose madder with white
  VI: 0x6c3d98,  // violet
  UB: 0x2d3d9e,  // ultramarine
  CB: 0x86aee6,  // cobalt with white
  EG: 0x2b8a62,  // emerald
  DK: 0x1d1946,  // ultramarine + crimson, the darkest he went
};

// ------------------------------------------------------------ mixtures
const lerpMix = (a, b, u) => {
  const m = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) m[k] = (a[k] ?? 0) * (1 - u) + (b[k] ?? 0) * u;
  return m;
};
const ramp = (a, b, n = 8) => Array.from({ length: n }, (_, i) => lerpMix(a, b, i / (n - 1)));

// day and night versions of every mixture, by code
const DAY = [], NIGHT = [];
const def = (day, night = day) => { DAY.push(day); NIGHT.push(night); return DAY.length - 1; };

// the wall behind the line: shadowed blue-violet, warming to lamp-lit orange
export const WALL = DAY.length;
{
  const d = ramp({ UB: 44, VI: 30, DK: 20, EG: 6 }, { YC: 30, OR: 34, LM: 14, VI: 12, VM: 10 });
  const n = ramp({ DK: 46, UB: 38, VI: 16 }, { OR: 34, VM: 18, VI: 32, YC: 16 });
  for (let i = 0; i < 8; i++) def(d[i], n[i]);
}
// the boards, lit by the footlights: warm, with the complementary blue in them
export const FLOOR = DAY.length;
{
  const d = ramp({ OR: 30, VI: 30, VM: 12, UB: 20, YC: 8 }, { OR: 38, YC: 24, VM: 14, VI: 16, LM: 8 });
  const n = ramp({ VI: 34, UB: 36, DK: 20, OR: 10 }, { OR: 36, VI: 30, VM: 16, YC: 18 });
  for (let i = 0; i < 8; i++) def(d[i], n[i]);
}
// Seurat's irradiation: next to a light shape the ground goes darker (the moat)
export const HALO = def({ DK: 34, UB: 46, VI: 20 }, { DK: 56, UB: 34, VI: 10 });
export const GROUND_END = DAY.length;     // codes below this are ground (halo may cover them)

// the petticoats: the numerals
export const SKW = def({ W: 56, LM: 24, CB: 12, RS: 8 }, { W: 50, CB: 32, LM: 18 });
export const SKP = def({ RS: 50, W: 30, LM: 10, CB: 10 }, { CB: 38, RS: 30, W: 32 });
export const RIM = def({ W: 80, LM: 14, CB: 6 }, { W: 76, CB: 24 });
export const LIN = def({ VM: 38, RS: 34, OR: 18, W: 10 }, { RS: 40, VM: 30, CB: 20, W: 10 });
// the dancers
export const STK = def({ DK: 56, VI: 26, UB: 14, CR: 4 }, { DK: 64, VI: 24, UB: 12 });
export const SHOE = def({ DK: 62, CR: 38 }, { DK: 70, CR: 30 });
export const BLOOM = def({ W: 60, RS: 22, CB: 18 }, { W: 56, CB: 30, RS: 14 });
export const SKIN = def({ RS: 34, W: 30, LM: 20, OR: 16 }, { RS: 40, W: 30, CB: 30 });
export const HAIR = def({ OR: 46, VM: 36, YC: 18 }, { OR: 44, VM: 40, CR: 16 });
export const FLOWER = def({ CR: 50, VM: 40, RS: 10 }, { CR: 60, VM: 40 });
export const EYE = def({ DK: 100 });
export const RIB = def({ DK: 76, VI: 24 });
// the gas globes (the colon) and their glass
export const LAMPC = def({ W: 62, LM: 38 }, { LM: 60, W: 40 });
export const LAMPG = def({ LM: 48, YC: 40, W: 12 }, { YC: 50, OR: 34, LM: 16 });
// thrown flowers at the finale
export const CONF = def({ RS: 26, LM: 24, CB: 20, VM: 16, EG: 14 }, { RS: 30, CB: 30, LM: 20, VM: 20 });

export const NCODES = DAY.length;
/** Codes at or above this twinkle fast (the cast); below, slow (the room). */
export const FAST = SKW;

function lut(mixes) {
  const t = new Uint16Array(NCODES * 256);
  mixes.forEach((m, c) => {
    const keys = Object.keys(m).filter((k) => m[k] > 0);
    const tot = keys.reduce((s, k) => s + m[k], 0);
    // spread the 256 picks over the pigments by weight (largest remainder)
    let acc = 0, j = 0;
    for (const k of keys) {
      acc += (m[k] / tot) * 256;
      const end = k === keys[keys.length - 1] ? 256 : Math.round(acc);
      for (; j < end; j++) t[c * 256 + j] = to565(PIG[k]);
    }
  });
  // shuffle each row by a fixed permutation so neighbouring picks are not neighbouring pigments
  const perm = Array.from({ length: 256 }, (_, i) => i).sort((a, b) => hash(a, 71) - hash(b, 71));
  const out = new Uint16Array(t.length);
  for (let c = 0; c < NCODES; c++) for (let j = 0; j < 256; j++) out[c * 256 + j] = t[c * 256 + perm[j]];
  return out;
}
export const LUT_DAY = lut(DAY), LUT_NIGHT = lut(NIGHT);

// ------------------------------------------------------------ the dot lattice
// pixel (x, y) belongs to the plus centred where (x + 2y) % 5 == 0
const PW = W + 2;
const centreIdx = new Map();
/** DOT[i]: the compact id of the dot that pixel i belongs to. */
export const DOT = new Uint16Array(W * H);
const CX = [], CY = [];
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const k = (x + 2 * y) % 5;
  let cx = x, cy = y;
  if (k === 1) cx = x - 1; else if (k === 4) cx = x + 1; else if (k === 2) cy = y - 1; else if (k === 3) cy = y + 1;
  const key = (cy + 1) * PW + (cx + 1);
  let id = centreIdx.get(key);
  if (id === undefined) { id = CX.length; centreIdx.set(key, id); CX.push(cx); CY.push(cy); }
  DOT[y * W + x] = id;
}
export const NDOTS = CX.length;
/** Per dot: the centre, a phase (0..255) for its twinkle, and a rank for even dissolves. */
export const DX = Uint8Array.from(CX, (v) => Math.max(0, Math.min(255, v)));
export const DY = Uint8Array.from(CY, (v) => Math.max(0, v));
export const PH = Uint8Array.from(CX, (_, i) => hash(i, 11) & 255);
export const RK = Uint8Array.from(CX, (_, i) => hash(i, 23) & 255);
export const NM = Uint8Array.from(CX, (_, i) => hash(i, 37) & 255);
/** A table of pick bytes, indexed by a dot's own counter. */
export const RND = Uint8Array.from({ length: 8192 }, (_, i) => hash(i, 5) & 255);

/** A material code as the colour that stores it in an RGB565 canvas (so kit shapes paint codes). */
export const enc = (k) => from565(k);
