// The paint box of "flamingos": three transparent pigments on warm white
// paper, mixed the way watercolour mixes (each layer filters the light the
// paper sends back), plus the paper's own grain.
//
// Every pixel of the face is a pigment code: rose | coral << 4 | teal << 8,
// each 0..15 (how much of that pigment lies on the paper there). One table
// (LUT, 4096 x RGB565 = 8 KB of flash) turns codes into colours through a
// Beer-Lambert filter per channel, so a pale rose glaze over teal goes mauve
// and three dense pigments make the near-black of the flight feathers
// without any black paint, as a watercolourist would.
//
// GRAIN (160 x 80 thresholds 0..15, 12.8 KB of flash) is cold-press paper,
// drawn bolder than real (clumps of ~2 px so it survives at true size). It is
// fixed to the glass: fractional amounts of pigment are rounded up where the
// paper has a valley, so washes granulate, and dry-brush strokes skip where
// the paper has a peak.

import { rand, noise2, hash } from '../js/kit.js';
import { to565 } from '../js/kit.js';

export const W = 160, H = 80, N = W * H;
export const HORIZON = 40;

const PAPER = [247, 241, 230];
const K = { r: [0.010, 0.085, 0.045], o: [0.004, 0.06, 0.10], t: [0.13, 0.05, 0.035] };
const den = (n) => n * (1 + n / 12);

export const code = (r, o, t) => (r > 15 ? 15 : r < 0 ? 0 : r) | ((o > 15 ? 15 : o < 0 ? 0 : o) << 4) | ((t > 15 ? 15 : t < 0 ? 0 : t) << 8);

export const LUT = new Uint16Array(4096);
for (let t = 0; t < 16; t++)
  for (let o = 0; o < 16; o++)
    for (let r = 0; r < 16; r++) {
      const c = PAPER.map((p, ch) => Math.round(p * Math.exp(-(K.r[ch] * den(r) + K.o[ch] * den(o) + K.t[ch] * den(t)))));
      LUT[r | (o << 4) | (t << 8)] = to565((c[0] << 16) | (c[1] << 8) | c[2]);
    }

// Night: the nocturne's reserved paper (the sliver round each bird, the
// moon, the stars) gets a thin glaze of teal so it glows softly instead of
// shining white; everything painted keeps its colour.
export const LUT_NIGHT = new Uint16Array(4096);

// ------------------------------------------------------------ paper grain

export const GRAIN = new Uint8Array(N);
{
  const v = new Float32Array(N);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      v[y * W + x] = 0.55 * noise2(x / 2.1, y / 2.1, 11) + 0.3 * noise2(x / 1.2, y / 1.2, 12) + 0.15 * rand(x, y, 13);
  // rank them: an even spread of thresholds, clumped like paper tooth
  const idx = Array.from({ length: N }, (_, i) => i).sort((a, b) => v[a] - v[b]);
  idx.forEach((i, k) => { GRAIN[i] = Math.floor((k * 16) / N); });
}

// ------------------------------------------------------------ helpers on codes

/** Add pigment to a code, each channel saturating at 15. */
export function addCode(c, r, o, t) {
  let a = (c & 15) + r, b = ((c >> 4) & 15) + o, d = (c >> 8) + t;
  return (a > 15 ? 15 : a < 0 ? 0 : a) | ((b > 15 ? 15 : b < 0 ? 0 : b) << 4) | ((d > 15 ? 15 : d < 0 ? 0 : d) << 8);
}
for (let c = 0; c < 4096; c++) LUT_NIGHT[c] = LUT[c === 0 ? code(1, 0, 2) : c];

/** Where a wash dried against a reserve: its pigment pooled, about half again as dense. */
export const POOL = new Uint16Array(4096);
for (let c = 0; c < 4096; c++) {
  const r = c & 15, o = (c >> 4) & 15, t = c >> 8;
  POOL[c] = code(r + ((r + 1) >> 1), o + ((o + 1) >> 1), t + ((t + 1) >> 1));
}

// ------------------------------------------------------------ the skies, one per part of the day

// Each is painted wet-in-wet as rows of amount (x16 fixed point) for rose,
// coral, teal, a sun or moon, the far shore and the lagoon's own rows.
// A loose sky leaves most of the paper bare: a wash dragged across the top
// whose lower edge bled out raggedly into the damp paper, and a glow laid in
// along the horizon from below. top/low: [rose, coral, teal] in levels and
// the edge's mean height in px. Night is one full wash.
const RAG = new Float32Array(W);
for (let x = 0; x < W; x++) RAG[x] = 4.5 * (noise2(x / 13, 1.5, 24) - 0.5) * 2 + 1.6 * (noise2(x / 4, 2.5, 25) - 0.5) * 2;
const wash = (top, low, topY, lowY) => (x, y) => {
  const r = RAG[x];
  const a = Math.min(1, Math.max(0, (topY + r - y) / 5)), b = Math.min(1, Math.max(0, (y - (lowY - r * 0.8)) / 7));
  return [0, 1, 2].map((c) => 16 * (top[c] * a + low[c] * b));
};
export const PHASES = {
  dawn: {
    sky: wash([0.8, 0, 2.8], [1.0, 2.2, 0], 8, 25),
    sun: { x: 79, y: 31, r: 6, core: [0, 0, 0], glow: [16, 40, 0] },
    shore: [48, 20, 64], water: (u) => [16 * (1.8 * (1 - u)), 16 * (2.4 * (1 - u) ** 2), 16 * (2.6 + 3.4 * u)],
  },
  day: {
    sky: wash([0.3, 0, 3.4], [0.4, 0.8, 0.6], 11, 30),
    sun: { x: 79, y: 9, r: 5, core: [0, 0, 0], glow: [0, 8, -20] },
    shore: [40, 6, 72], water: (u) => [16 * 0.5, 0, 16 * (2.8 + 3.4 * u)],
  },
  dusk: {
    sky: wash([2.6, 0.3, 4.4], [1.2, 2.4, 0], 12, 26),
    sun: { x: 79, y: 29, r: 6.5, core: [40, 112, 0], glow: [10, 24, 0] },
    shore: [80, 30, 80], water: (u) => [16 * (1 + 2.4 * (1 - u)), 16 * (3 * (1 - u) ** 2), 16 * (2.6 + 3.4 * u)],
  },
  night: {
    sky: (x, y) => { const v = y / HORIZON; return [16 * (4.6 - 1.4 * v), 0, 16 * (9.6 - 2.6 * v)]; },
    sun: { x: 79, y: 14, r: 4.5, core: [0, 0, 0], glow: [-24, 0, -40] },
    shore: [100, 8, 176], water: (u) => [16 * 4.2, 0, 16 * (9.4 + 2.2 * u)],
    stars: true,
  },
};
export function phaseOf(h) {
  if (h >= 5 && h < 8) return 'dawn';
  if (h >= 8 && h < 17) return 'day';
  if (h >= 17 && h < 20) return 'dusk';
  return 'night';
}

// far shore: a low line of mangrove, its top painted on dry paper (a hard edge)
export const SHORE_TOP = new Uint8Array(W);
for (let x = 0; x < W; x++) {
  const n = noise2(x / 7, 0.5, 21), m = noise2(x / 2.6, 3.5, 22);
  SHORE_TOP[x] = Math.round(35.4 + 2.6 * (n - 0.5) * 2 - 1.6 * (m > 0.62 ? 1 : 0) + (x > 66 && x < 92 ? 1.6 : 0));
}

// wet-in-wet mottling of the sky, and the backruns (cauliflower blooms) it dried with
const MOTTLE = new Int8Array(W * HORIZON);
for (let y = 0; y < HORIZON; y++)
  for (let x = 0; x < W; x++)
    MOTTLE[y * W + x] = Math.round(20 * (noise2(x / 11, y / 7, 31) - 0.5) + 10 * (noise2(x / 4.5, y / 3.5, 32) - 0.5));
/** The backruns this hour's sky dried with: three or four, placed by the hour. */
function skyBlooms(seed) {
  const out = [];
  for (let k = 0; k < 4; k++) {
    const h = hash(seed, k, 34);
    const x = 8 + (h % 144), y = 4 + ((h >>> 8) % 22);
    if (x > 64 && x < 94 && y > 8) continue;            // keep the sun clear
    out.push([x, y, 4.5 + ((h >>> 16) % 4), (h >>> 20) % 10]);
  }
  return out;
}

/**
 * The sky and far shore of a phase as codes, rows 0..HORIZON-1 (160 x 40;
 * built into a 12.8 KB RAM cache once an hour, ~4,800 px of work each).
 */
export function paintSky(name, out, seed = 0) {
  const P = PHASES[name], SKY_BLOOMS = skyBlooms(seed);
  let work = 0;
  for (let y = 0; y < HORIZON; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      let [r, o, t] = P.sky(x, y);
      // mottling: the dominant pigment of the row pools and thins
      const m = MOTTLE[i];
      if (t >= r && t >= o) { if (t > 8) t += m; } else if (o >= r) { if (o > 8) o += m; } else if (r > 8) r += m;
      // backruns: lighter hearts with a darker crinkled rim
      for (const [bx, by, br, s] of SKY_BLOOMS) {
        const dx = x + 0.5 - bx, dy = (y + 0.5 - by) * 1.3, d2 = dx * dx + dy * dy;
        if (d2 > (br + 2) * (br + 2)) continue;
        const a = Math.atan2(dy, dx), R = br + 0.8 * Math.sin(a * 6 + s) + 0.5 * Math.sin(a * 11 + s * 2);
        const d = Math.sqrt(d2);
        if (d < R - 1) { r *= 0.62; o *= 0.62; t *= 0.62; } else if (d < R) { r *= 1.35; o *= 1.35; t *= 1.35; }
      }
      // the sun (or moon): reserved paper, or a painted disc, with a wet glow
      const S = P.sun, dx = x + 0.5 - S.x, dy = y + 0.5 - S.y, d = Math.sqrt(dx * dx + dy * dy);
      if (d < S.r) { r = S.core[0]; o = S.core[1]; t = S.core[2]; if (d > S.r - 1 && (r || o)) { r *= 1.4; o *= 1.3; } }
      else if (d < S.r + 9) { const k = 1 - (d - S.r) / 9; r += S.glow[0] * k; o += S.glow[1] * k; t += S.glow[2] * k; }
      if (P.stars && y < 30 && hash(x, y, 41) % 97 === 0 && d > S.r + 4) { r = 0; o = 0; t = 0; }
      // far shore
      const top = SHORE_TOP[x];
      if (y >= top) {
        const [sr, so, st] = P.shore, k = y === top ? 1.4 : 1 + 0.25 * (noise2(x / 3, y, 33) - 0.5);
        r = sr * k; o = so * k; t = st * k;
      }
      const gr = GRAIN[i];
      out[i] = code((r + gr) >> 4, (o + gr) >> 4, (t + gr) >> 4);
      work++;
    }
  }
  return work;
}

// ------------------------------------------------------------ the lagoon

// Dry-brush strokes across the water, per row, on a 256 px loop that drifts
// left: +1 a darker drag of teal, 2 a skip where the brush left paper.
export const WROWS = H - HORIZON, WLOOP = 256;
export const STREAK = new Uint8Array(WROWS * WLOOP);
for (let y = 0; y < WROWS; y++) {
  const u = y / WROWS;
  const n = 3 + (hash(y, 51) % 4);
  for (let k = 0; k < n; k++) {
    const h = hash(y, k, 52);
    const x0 = h % WLOOP, len = 8 + ((h >>> 9) % (10 + Math.round(30 * u)));
    const kind = (h >>> 20) % 3 === 0 ? 1 : 2;
    for (let j = 0; j < len; j++) STREAK[y * WLOOP + ((x0 + j) % WLOOP)] = kind;
  }
}
// rows in pairs move as one brush drag: each row's drift speed (px/s) and sway
export const W_SPEED = Float32Array.from({ length: WROWS }, (_, y) => 2.2 + 7 * (y / WROWS) ** 1.3);
export const W_PHASE = Float32Array.from({ length: WROWS }, (_, y) => rand(y >> 1, 0, 53) * 6.28);
export const WATER_BASE = {};
for (const [name, P] of Object.entries(PHASES)) {
  const rows = new Int16Array(WROWS * 3);
  for (let y = 0; y < WROWS; y++) {
    const [r, o, t] = P.water(y / WROWS);
    rows[y * 3] = r; rows[y * 3 + 1] = o; rows[y * 3 + 2] = t;
  }
  WATER_BASE[name] = rows;
}
