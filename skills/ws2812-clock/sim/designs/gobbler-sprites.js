// Gobbler, the cast, as pixel art drawn at sub-pixel positions (each art
// pixel is spread over the 2x2 LEDs under it by coverage, so a sprite
// glides between LEDs instead of hopping).
import * as kit from '../js/kit.js';

const C = kit.hex;
export const N = 64;

// The owner's frog: rainbow from red at the back to violet at the lips,
// round blue glasses with white eyes, pink lips, orange feet. Faces right.
const FROG_SIT = [
  'BBB..BBB',
  'BwB..BwB',
  'BBBxxBBB',
  '.xxxxxx.',
  'xxxxxxxx',
  'xxxxxPPx',
  '.xxxxxx.',
  'LL....LL',
];
const FROG_LEAP = [
  'BBB..BBB',
  'BwB..BwB',
  'BBBxxBBB',
  '.xxxxxx.',
  'xxxxxxxx',
  'xxxxxPPx',
  'Lxxxxxx.',
  'L......L',
];
const GLASS = C('#3a78ff'), EYE = [1, 1, 1], LIPS = C('#ff2a9a'), FEET = C('#ff6a14');
const RAINBOW = [C('#ff2418'), C('#ff7a10'), C('#ffd820'), C('#7ae030'), C('#20c8a0'), C('#3a7aff'), C('#a050ff')];
/** Red (0) .. violet (1); past 1 it wraps back through magenta to red, so a running rainbow has no seam. */
function rainbow(f) {
  const n = RAINBOW.length, x = kit.fract(f / 1.17) * n, i = Math.floor(x) % n;
  return kit.mix(RAINBOW[i], RAINBOW[(i + 1) % n], x - Math.floor(x));
}

export const BEETLE_COLORS = [C('#ff2a2a'), C('#ff5ad8'), C('#2ee0ff'), C('#ffa020')];
// ghost-like beetles: a dome shell, two big eyes, six scuttling legs
const BEETLE = [
  '.a..a.',
  '.SSSS.',
  'SWWSWW',
  'SWkSWk',
  'SSSSSS',
  'SShSSS',
];
const LEGS = ['S.SS.S', '.S..S.'];
const SCARED = [
  '.a..a.',
  '.SSSS.',
  'SSSSSS',
  'SWSSWS',
  'SSSSSS',
  'MSMSMS',
];

// Six bonus fruits, one per hour (by hour mod 6).
export const FRUITS = [
  { rows: ['....g..', '...g.g.', '..g...g', '.rr..g.', 'rrwr.rr', 'rrrrrwr', '.rr.rrr', '.....r.'],
    pal: { g: C('#40c040'), r: C('#ff1a1a'), w: [1, 0.8, 0.8] } },                        // cherries
  { rows: ['..ggg..', '.rgggr.', 'rrwrrrr', 'rrrrwrr', 'rwrrrrr', '.rrrwr.', '..rrr..', '...r...'],
    pal: { g: C('#40c040'), r: C('#ff2030'), w: C('#ffe080') } },                          // strawberry
  { rows: ['...g...', '..ooo..', '.ooooo.', 'oowoooo', 'ooooooo', 'ooooooo', '.ooooo.', '..ooo..'],
    pal: { g: C('#40c040'), o: C('#ff8a10'), w: [1, 0.9, 0.6] } },                          // orange
  { rows: ['...b...', '.rrbrr.', 'rrwrrrr', 'rwrrrrr', 'rrrrrrr', 'rrrrrrr', '.rrrrr.', '..r.r..'],
    pal: { b: C('#a06020'), r: C('#ff2020'), w: [1, 0.85, 0.85] } },                        // apple
  { rows: ['...g...', '..ggg..', '.gGgGg.', 'gGgGgGg', 'gGgGgGg', '.gGgGg.', '..ggg..', '.......'],
    pal: { g: C('#30c030'), G: C('#c0ff70') } },                                             // melon
  { rows: ['...g...', '..vvv..', '.vwvvv.', '.vvvwv.', '..vwv..', '..vvv..', '...v...', '.......'],
    pal: { g: C('#40c040'), v: C('#b040ff'), w: C('#f0c0ff') } },                           // grapes
];

/** Paint one art pixel of colour c with coverage a at float (x, y) top-left, over. */
function dab(img, x, y, c, a) {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const W = [(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy];
  for (let q = 0; q < 4; q++) {
    const px = x0 + (q & 1), py = y0 + (q >> 1);
    if (px < 0 || py < 0 || px >= N || py >= N) continue;
    const w = W[q] * a;
    if (w <= 0) continue;
    const p = 3 * (py * N + px);
    img[p] += (c[0] - img[p]) * w; img[p + 1] += (c[1] - img[p + 1]) * w; img[p + 2] += (c[2] - img[p + 2]) * w;
  }
}
/** Add a soft point of light (for flies, glows), bilinear. */
export function glow(img, x, y, c, a) {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const W = [(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy];
  for (let q = 0; q < 4; q++) {
    const px = x0 + (q & 1), py = y0 + (q >> 1);
    if (px < 0 || py < 0 || px >= N || py >= N) continue;
    const p = 3 * (py * N + px), w = W[q] * a;
    img[p] += c[0] * w; img[p + 1] += c[1] * w; img[p + 2] += c[2] * w;
  }
}
/** A disc of light radius r (soft edge), added. */
export function disc(img, x, y, r, c, a) {
  const x0 = Math.max(0, Math.floor(x - r - 1)), x1 = Math.min(N - 1, Math.ceil(x + r + 1));
  const y0 = Math.max(0, Math.floor(y - r - 1)), y1 = Math.min(N - 1, Math.ceil(y + r + 1));
  for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
    const d = Math.hypot(px - x, py - y), k = kit.clamp(r + 0.5 - d) * a;
    if (k <= 0) continue;
    const p = 3 * (py * N + px);
    img[p] += c[0] * k; img[p + 1] += c[1] * k; img[p + 2] += c[2] * k;
  }
}
/** An anti-aliased line (the tongue), painted over. */
export function line(img, ax, ay, bx, by, c, a, w = 0.9) {
  const L = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.ceil(L * 2));
  for (let k = 0; k <= n; k++) { const f = k / n; dab(img, ax + (bx - ax) * f, ay + (by - ay) * f, c, a * w * 0.6); }
}

/**
 * The frog centred at (cx, cy). face 1 = right, -1 = left. leap 0/1,
 * blink, hue = rainbow shift (0 normally; animated when powered up).
 */
export function frog(img, cx, cy, face, { leap = false, blink = false, hue = 0, a = 1 } = {}) {
  const rows = leap ? FROG_LEAP : FROG_SIT, w = 8, h = 8;
  const x0 = cx - w / 2 + 0.5, y0 = cy - h / 2 + 0.5;
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
    const ch = rows[r][c];
    if (ch === '.') continue;
    let col;
    const along = c / (w - 1);   // 0 back .. 1 front, in art space (faces right)
    if (ch === 'x') {   // shaded like a ball: bright in the middle, dimmer at the rim
      const dx = (c - 3.5) / 4, dy = (r - 4.5) / 3.5;
      col = kit.scale(rainbow(along * 0.95 + r * 0.03 + hue), 0.95 - 0.5 * Math.min(1, dx * dx + dy * dy));
    }
    else if (ch === 'B') col = GLASS;
    else if (ch === 'w') col = blink ? GLASS : EYE;
        else if (ch === 'P') col = LIPS;
    else col = FEET;
    const xx = face > 0 ? x0 + c : x0 + (w - 1 - c);
    dab(img, xx, y0 + r, col, a);
  }
}
/** Where the frog's lips are. */
export const mouth = (cx, cy, face) => [cx + face * 2.5, cy + 0.5];

/** A beetle centred at (cx, cy). mode: 0 normal, 1 scared, 2 scared+white. */
export function beetle(img, cx, cy, id, face, step, mode = 0, a = 1) {
  const rows = mode ? SCARED : BEETLE, w = 6, h = 7;
  const x0 = cx - w / 2 + 0.5, y0 = cy - h / 2 + 0.5;
  const shell = mode === 2 ? [0.9, 0.9, 1] : mode ? C('#3a48ff') : BEETLE_COLORS[id];
  const pal = {
    a: kit.scale(shell, 0.55), S: shell, h: kit.mix(shell, [1, 1, 1], 0.45), W: mode ? [1, 0.85, 0.75] : [1, 1, 1],
    k: C('#1030a0'), M: mode === 2 ? [1, 0.1, 0.1] : [1, 0.7, 0.6], L: kit.scale(shell, 0.7),
  };
  const all = [...rows, LEGS[step & 1]];
  for (let r = 0; r < all.length; r++) for (let c = 0; c < w; c++) {
    const ch = all[r][c];
    if (ch === '.') continue;
    const xx = face > 0 ? x0 + c : x0 + (w - 1 - c);
    dab(img, xx, y0 + r, pal[ch], a);
  }
}

export function fruit(img, cx, cy, k, a = 1) {
  const F = FRUITS[k % FRUITS.length];
  for (let r = 0; r < F.rows.length; r++) for (let c = 0; c < 7; c++) {
    const ch = F.rows[r][c];
    if (ch !== '.') dab(img, cx - 3.5 + c + 0.5, cy - 4 + r + 0.5, F.pal[ch], a);
  }
}
