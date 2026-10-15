// Typewriter type for the 2 mm grid: a pica-sized slab-serif, 10 x 15 on a
// 12 px advance (monospace: the colon gets a whole cell, as on the machine).
// '#' full ink, '+' half (the edge of a stroke where the slug only kissed the
// paper), '-' a trace. Ink bleed into the fibres is added on top.
import * as kit from '../js/kit.js';

export const GW = 10, GH = 15, MH = 18, ADV = 12;

const ART = {
  '0': [
    '...####...',
    '.+##..##+.',
    '.##....##.',
    '+#+....+#+',
    '##......##',
    '##......##',
    '##......##',
    '##......##',
    '##......##',
    '##......##',
    '##......##',
    '+#+....+#+',
    '.##....##.',
    '.+##..##+.',
    '...####...',
  ],
  '1': [
    '....##....',
    '..+###....',
    '.##+##....',
    '.+..##....',
    '....##....',
    '....##....',
    '....##....',
    '....##....',
    '....##....',
    '....##....',
    '....##....',
    '....##....',
    '....##....',
    '.########.',
    '.########.',
  ],
  '2': [
    '..+####+..',
    '.##+..+##.',
    '##+....+##',
    '+#......##',
    '........##',
    '.......+#+',
    '......+##.',
    '.....+##..',
    '....+##...',
    '...+##....',
    '..+##.....',
    '.+##......',
    '+##.....##',
    '##########',
    '##########',
  ],
  '3': [
    '..+####+..',
    '.##+..+##.',
    '+#+....+##',
    '........##',
    '........##',
    '.......+#+',
    '...+####+.',
    '...+#####+',
    '.......+##',
    '........##',
    '........##',
    '+#......##',
    '##+....+##',
    '.+##..##+.',
    '...####...',
  ],
  '4': [
    '......##..',
    '.....###..',
    '....####..',
    '...##.##..',
    '..+#+.##..',
    '..##..##..',
    '.-#+..##..',
    '-#+...##..',
    '##....##..',
    '##########',
    '##########',
    '......##..',
    '......##..',
    '....######',
    '....######',
  ],
  '5': [
    '.#########',
    '.##.....+#',
    '.##.......',
    '.##.......',
    '.##+###+..',
    '.###+.+##.',
    '.+#....+##',
    '........##',
    '........##',
    '........##',
    '........##',
    '+#......##',
    '##+....+##',
    '.+##..##+.',
    '...####...',
  ],
  '6': [
    '....+####.',
    '..+##+....',
    '.+#+......',
    '.##.......',
    '+#+.......',
    '##.+####+.',
    '####+..+##',
    '##+.....##',
    '##......##',
    '##......##',
    '##......##',
    '##......##',
    '+#+....+#+',
    '.##+..+##.',
    '..+####+..',
  ],
  '7': [
    '##########',
    '##########',
    '##......##',
    '#+.....+#+',
    '.......##.',
    '......+#+.',
    '......##..',
    '.....+#+..',
    '.....##...',
    '....+#+...',
    '....##....',
    '...+##....',
    '...##.....',
    '...##.....',
    '...##.....',
  ],
  '8': [
    '..+####+..',
    '.##+..+##.',
    '.##....##.',
    '.##....##.',
    '.+#+..+#+.',
    '..+####+..',
    '.+##..##+.',
    '+#+....+#+',
    '##......##',
    '##......##',
    '##......##',
    '##......##',
    '+#+....+#+',
    '.+##..##+.',
    '..+####+..',
  ],
  '9': [
    '..+####+..',
    '.##+..+##.',
    '+#+....+#+',
    '##......##',
    '##......##',
    '##......##',
    '##......##',
    '##.....+##',
    '.##+..+###',
    '.+####+.##',
    '.......+#+',
    '.......##.',
    '......+#+.',
    '....+##+..',
    '.####+....',
  ],
  ':': [
    '..........', '..........', '..........', '..........',
    '...+##+...', '...+##+...',
    '..........', '..........', '..........', '..........', '..........',
    '...+##+...', '...+##+...',
    '..........', '..........',
  ],
  '_': [],
};
// the underscore sits two rows under the baseline
ART['_'] = Array.from({ length: MH }, (_, r) => (r === 16 ? '##########' : '..........'));

const LV = { '#': 1, '+': 0.55, '-': 0.25 };
/** Base ink masks, MH rows x GW, with fibre bleed round the strokes. */
export const MASK = {};
for (const [ch, rows] of Object.entries(ART)) {
  const m = new Float32Array(GW * MH);
  rows.forEach((row, y) => { for (let x = 0; x < GW && x < row.length; x++) m[y * GW + x] = LV[row[x]] || 0; });
  const out = new Float32Array(m);
  for (let y = 0; y < MH; y++) for (let x = 0; x < GW; x++) {
    let n = 0;
    if (x > 0) n = Math.max(n, m[y * GW + x - 1]);
    if (x < GW - 1) n = Math.max(n, m[y * GW + x + 1]);
    if (y > 0) n = Math.max(n, m[(y - 1) * GW + x]);
    if (y < MH - 1) n = Math.max(n, m[(y + 1) * GW + x]);
    out[y * GW + x] = Math.min(1, m[y * GW + x] + 0.26 * n * (1 - m[y * GW + x]));
  }
  MASK[ch] = out;
}

/** This machine's quirks: its 7 bar is bent (sits a pixel high), its 4 slug is worn on the right. */
const QUIRK = { '7': { dy: -1 }, '4': { wear: 0.35 } };

const cache = new Map();
/**
 * The ink of one impression: the base mask times this strike's weight, the
 * ribbon's weave where it hit, and the slug's tilt. Deterministic per seed.
 */
export function impression(ch, seed) {
  const key = ch + seed;
  let m = cache.get(key);
  if (m) return m;
  if (cache.size > 400) cache.clear();
  const base = MASK[ch] || MASK['_'];
  // each slug lands a hair off the baseline; the 7 is bent and always sits high
  m = { a: new Float32Array(GW * MH), dy: (QUIRK[ch]?.dy || 0) + (kit.hash(seed, 4) - 0.5) * 0.6, dx: (kit.hash(seed, 5) - 0.5) * 0.5 };
  const heavy = 0.76 + 0.24 * kit.hash(seed, 1);              // how hard the key was hit
  const tilt = (kit.hash(seed, 2) - 0.5) * 0.55;            // slug landing a touch off-square:
  const tiltY = (kit.hash(seed, 3) - 0.5) * 0.45;           // one side, top or foot, prints lighter
  const wear = QUIRK[ch]?.wear || 0;
  for (let y = 0; y < MH; y++) for (let x = 0; x < GW; x++) {
    const p = y * GW + x, b = base[p];
    if (!b) continue;
    const weave = 0.66 + 0.34 * kit.hash(x + seed * 13, y * 7 + seed, 5); // ribbon fabric
    const side = 1 - tilt * ((x - 4.5) / 4.5) - tiltY * ((y - 7) / 7) - wear * kit.smoothstep(4, 9, x) * kit.smoothstep(2, 8, y);
    m.a[p] = kit.clamp(b * heavy * weave * side);
  }
  cache.set(key, m);
  return m;
}
