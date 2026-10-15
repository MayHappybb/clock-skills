// Shanshui: a window onto a blue-green landscape handscroll (青绿山水) on
// aged silk. The time is the mountains: the hour is a near massif of two
// great peaks on the left shore, the minutes a smaller pair of peaks across
// the lake, paler with distance. Each numeral is a landform (see
// shanshui-glyphs.js): a ring of cliffs round a lake, a needle peak, a
// scholar's rock with two holes...
//
// Always alive: the distant ranges drift past in parallax (rightward, as
// the scene moves when a handscroll is unrolled), mist bands slide across
// the peaks' feet, the lake's wave lines ripple, a fisherman's skiff rocks
// on its slow crossing, a line of cranes passes now and then.
//
// Minute turn: painted mist (horizontal washes of silk-white, topped with a
// gold auspicious-cloud curl) gathers round the foot of each peak about to
// change and drifts sideways; the old peak sinks into it, showing through
// its thin parts, and is gone by :00; the new one rises through it after :00
// with its gold gleaming, and the mist spreads and thins. Hour: a gold
// dragon chasing a flaming pearl swims across the sky behind the peaks, a
// skein of cranes follows, and a vermilion seal is pressed onto the silk (it
// stays for the hour).
//
// Palette: the mineral pigments of the style: azurite (石青) crests,
// malachite (石绿) slopes, ochre (赭石) feet, gold (泥金) on every ridge,
// ink contours and texture strokes, on warm aged silk; a cinnabar sun and
// seal. Evening warms the silk; night turns it to indigo ink-wash with a
// moon, the pigments go moonlit and the gold ridge lines keep the numerals;
// the far (minute) peaks are lit brighter by the moon, with a faint glow
// behind them and the ranges behind darkened, so they read when dimmed.
//
// Hard pixels for the peaks (crisp gold contours, like the painted line);
// anti-aliasing for everything that moves: mist, ranges, water, skiff,
// cranes, and the peaks while they rise or sink (sampled between rows).

import { Gfx, hex, mix, scale, R, G, B, rgb, sin, cos, clamp, rand, noise, noise2, ease, progress, lerp, clockFields } from '../js/kit.js';
import { buildShape, colourShape, PIG } from './shanshui-glyphs.js';

// ------------------------------------------------------------ layout
const W = 160, H = 80;
const HX = [3, 34], HW = 27, HH = 62, HBASE = 76;     // the near massif: hours
const MX = [92, 114], MW = 20, MH = 40, MBASE = 61;   // across the lake: minutes
const HORIZON = 61;
const SLOT = [
  { x: HX[0], w: HW, h: HH, base: HBASE, seed: 1 },
  { x: HX[1], w: HW, h: HH, base: HBASE, seed: 2 },
  { x: MX[0], w: MW, h: MH, base: MBASE, seed: 3 },
  { x: MX[1], w: MW, h: MH, base: MBASE, seed: 4 },
];
const SINK0 = 58.4, SINK1 = 59.95, RISE0 = 0.05, RISE1 = 1.9;

// ------------------------------------------------------------ the day
// hour, sky top, horizon, water, night (0 day .. 1 night)
const DAY = [
  [0, '141a36', '263258', '1a2846', 1], [4.6, '141a36', '263258', '1a2846', 1],
  [6, '4a4668', 'c48a78', '5a6a7c', 0.6], [7.2, 'd2bd94', 'f0d4ac', 'a8bca4', 0.1],
  [8.2, 'dac698', 'ecddb6', 'b2c6a8', 0], [16.4, 'dac698', 'ecddb6', 'b2c6a8', 0],
  [18, 'cc9e70', 'f2b47a', 'b0a68c', 0.15], [19.3, '584a6a', 'b07a72', '5a6278', 0.6],
  [20.6, '141a36', '263258', '1a2846', 1], [24, '141a36', '263258', '1a2846', 1],
].map(([h, a, b, c, n]) => [h, hex(a), hex(b), hex(c), n]);

function dayAt(hour) {
  let k = 1;
  while (DAY[k][0] < hour) k++;
  const a = DAY[k - 1], b = DAY[k], u = (hour - a[0]) / (b[0] - a[0]);
  return { top: mix(a[1], b[1], u), hor: mix(a[2], b[2], u), water: mix(a[3], b[3], u), night: lerp(a[4], b[4], u) };
}

const MOONLIT = hex('8a9ccc'), INDIGO = hex('141a36');
/** Pigment under the time of day's light: moonlit and cooler at night, gold kept warm. */
function toner(night, far = false) {
  const cache = new Map();
  return (c) => {
    if (night <= 0) return c;
    let v = cache.get(c);
    if (v !== undefined) return v;
    const lum = (R(c) * 0.3 + G(c) * 0.55 + B(c) * 0.15) / 255;
    const isGold = c === PIG.gold || (R(c) > 200 && G(c) > 150 && B(c) < 120);
    const moon = isGold ? hex(far ? 'fff0b8' : 'ffe6a0')
      : far ? mix(scale(c, 1.5), scale(hex('b4c6ee'), 0.95 + 0.75 * lum), 0.55)
      : mix(scale(c, 1.1), scale(MOONLIT, 0.75 + 0.8 * lum), 0.5);
    v = mix(c, moon, night);
    cache.set(c, v);
    return v;
  };
}

// ------------------------------------------------------------ constant tables (start-up)
// The forty landform shapes (ten digits x four slots, each slot its own
// crags), and the silk's texture: brightness and browning per pixel.
const SHAPES = SLOT.map((S) => Array.from({ length: 10 }, (_, d) => buildShape(d, S.w, S.h, S.seed)));
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v * 16 + 8);   // 0..255
const SILK_K = new Uint16Array(W * H), SILK_WARM = new Uint8Array(W * H);
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    let k = 1 + (rand(x, y, 9) - 0.5) * 0.05 + ((y % 3) === 0 ? -0.018 : 0) + ((x % 4) === 0 ? -0.012 : 0);
    const stain = noise2(x * 0.06, y * 0.09, 4);
    k -= stain > 0.72 ? (stain - 0.72) * 0.35 : 0;
    const edge = clamp(Math.min(Math.min(x, W - 1 - x) / 22, Math.min(y, H - 1 - y) / 12), 0, 1);
    k *= 0.86 + 0.14 * edge;
    SILK_K[y * W + x] = Math.round(k * 256);
    SILK_WARM[y * W + x] = Math.round((1 - edge) * 0.1 * 255);
  }
// the near shore's rocks, as pigment indices into SHORE_PAL
const SHORE_W = 72, SHORE_H = 7, SHORE_PAL = [PIG.gold, PIG.och, mix(PIG.och, PIG.ochD, 0.5), PIG.ochD, PIG.ink, PIG.maD];
const SHORE = new Uint8Array(SHORE_W * SHORE_H);
for (let x = 0; x < SHORE_W; x++) {
  const t0 = Math.round(1.2 + 2.2 * noise(x * 0.18, 3) + (x > 58 ? (x - 58) * 0.4 : 0));
  for (let y = t0; y < SHORE_H; y++) {
    let k = y === t0 ? 1 : 2 + Math.min(2, (y - t0 - 1) >> 1);
    if (y > t0 && rand(x, y, 31) > 0.82) k = 5;
    if (y === t0 + 1 && rand(x, 0, 41) > 0.7) k = 6;
    SHORE[y * SHORE_W + x] = k;
  }
}

// ------------------------------------------------------------ per-minute caches
const GLYPHS = new Map();
function glyph(d, slot, minuteKey, tone) {
  const key = d * 4 + slot;
  let gl = GLYPHS.get(key);
  if (!gl || gl.mk !== minuteKey) {
    gl = colourShape(SHAPES[slot][d], tone);
    gl.mk = minuteKey;
    GLYPHS.set(key, gl);
  }
  return gl;
}

/** The silk, its sky, the sun or moon, the still water and the near shore: one canvas a minute. */
let BG = { key: -1, canvas: null, shore: null, day: null };
function background(minuteKey, hour) {
  if (BG.key === minuteKey) return BG;
  const day = dayAt(hour), tone = toner(day.night), toneFar = toner(day.night, true);
  // the silk: a colour per row (sky, then lake) times the texture table,
  // browned toward the edges by day. Integer work, once a minute.
  const c = new Gfx(W, H), brown = hex('8a5a2a'), warmK = 1 - day.night;
  for (let y = 0; y < H; y++) {
    const row = y < HORIZON
      ? (y < HORIZON * 0.75 ? mix(day.top, mix(day.top, day.hor, 0.7), y / (HORIZON * 0.75)) : mix(mix(day.top, day.hor, 0.7), day.hor, (y - HORIZON * 0.75) / (HORIZON * 0.25)))
      : mix(mix(day.water, day.hor, 0.35), scale(day.water, 0.86), (y - HORIZON) / (H - HORIZON));
    const r0 = R(row), g0 = G(row), b0 = B(row);
    for (let x = 0; x < W; x++) {
      const i = y * W + x, k = SILK_K[i], w = (SILK_WARM[i] * warmK) | 0;
      let r = (r0 * k) >> 8, gg = (g0 * k) >> 8, b = (b0 * k) >> 8;
      if (r > 255) r = 255; if (gg > 255) gg = 255; if (b > 255) b = 255;
      r += ((((R(brown) * k) >> 8) - r) * w) >> 8; gg += ((((G(brown) * k) >> 8) - gg) * w) >> 8; b += ((((B(brown) * k) >> 8) - b) * w) >> 8;
      // ordered dither into RGB565, integers only
      const t = BAYER[((y & 3) << 2) | (x & 3)];
      const r5 = (r * 7967 + t * 255) >> 16, g6 = (gg * 16191 + t * 255) >> 16, b5 = (b * 7967 + t * 255) >> 16;
      c.buf[i] = (r5 << 11) | (g6 << 5) | b5;
    }
  }
  // the sun (cinnabar) by day, the moon by night, on an arc over the lake
  let glint = null;
  const sunU = (hour - 6) / 12.5, moonU = ((hour + 24 - 18.5) % 24) / 11;
  if (sunU > 0 && sunU < 1) {
    const x = 70 + 82 * sunU, y = 22 - 14 * Math.sin(sunU * Math.PI);
    c.fillCircle(x, y, 7, mix(day.hor, hex('f6e0b0'), 0.6), { aa: true, a: 0.35 * (1 - day.night) });
    c.fillCircle(x, y, 4.2, mix(hex('d84a2a'), day.hor, 0.15 + 0.5 * day.night), { aa: true });
    glint = [x, mix(hex('f8c070'), hex('fff0d0'), 0.4), 0.7 * (1 - day.night)];
  }
  if (moonU > 0 && moonU < 1 && day.night > 0.3) {
    const x = 70 + 82 * moonU, y = 20 - 12 * Math.sin(moonU * Math.PI);
    for (const [r, a] of [[13, 0.08], [10, 0.1], [7.5, 0.14]]) c.fillCircle(x, y, r, hex('c8d0e8'), { aa: true, a: a * day.night, dither: true });
    c.fillCircle(x, y, 4.2, hex('f2ead0'), { aa: true, a: day.night });
    glint = [x, hex('e8ecf4'), 0.6 * day.night];
    c.fillCircle(x + 1.6, y - 0.8, 3.6, mix(day.top, hex('c8d0e8'), 0.2), { aa: true, a: 0.25 * day.night });
  }
  const sp = SHORE_PAL.map(tone), data = new Int32Array(SHORE_W * SHORE_H);
  for (let i = 0; i < data.length; i++) data[i] = SHORE[i] ? sp[SHORE[i] - 1] : -1;
  BG = { key: minuteKey, canvas: c, shore: { w: SHORE_W, h: SHORE_H, data }, day, tone, toneFar, glint };
  return BG;
}

// ------------------------------------------------------------ drawing helpers

/**
 * A glyph whose top is at fractional `top`, clipped above `base`, so a rising
 * or sinking peak glides: the sprite one row down at full strength, then the
 * sprite at the upper row over it at 1 - f. Top edges get the right partial
 * coverage and the body cross-fades between the two rows; only undersides
 * (the bottoms of counters) step by whole pixels. Two blits, no per-pixel code.
 */
function glide(g, gl, x0, top, base) {
  const y0 = Math.floor(top), f = top - y0;
  g.clip(0, 0, W, base);
  if (f < 0.02) g.blit(gl, x0, y0);
  else {
    g.blit(gl, x0, y0 + 1);
    if (f < 0.98) g.blit(gl, x0, y0, { a: 1 - f });
  }
  g.unclip();
}

/** A long soft mist band of overlapping ellipses. */
function mistBand(g, cx, cy, len, thick, a, col, t, seed) {
  if (a <= 0.01) return;
  const n = Math.max(2, Math.round(len / 14));
  for (let k = 0; k < n; k++) {
    const u = k / (n - 1) - 0.5;
    const wob = sin(t * 0.7 + k * 1.9 + seed);
    const x = cx + u * len + 2 * wob, y = cy + 0.8 * cos(t * 0.5 + k * 2.3 + seed);
    const rx = len / n * 0.95 + 3, ry = thick * (0.7 + 0.3 * rand(k, seed, 5)) + 0.5 * wob;
    g.fillEllipse(x, y, rx, Math.max(1, ry), col, { aa: true, a: a * (0.55 + 0.45 * rand(k, seed, 6)) });
  }
}

/**
 * Painted mist (the scroll's own: horizontal bands of silk-white wash, not a
 * cumulus). Three bands stacked above `base`, each a soft lens that fades to
 * nothing at its ends and edges, laid as 2-pixel runs of blended, dithered
 * colour, so the mountain behind shows through every thin part. `a` is the
 * density 0..1; `spread` widens it as it thins. Brush streaks run along the
 * rows. Returns the top band's centre line, where the curls sit.
 */
const MIST_SEG = 2;
function mistBank(g, cx, base, wid, hgt, a, spread, col, t, seed) {
  if (a <= 0.01) return base - hgt;
  let topY = base;
  for (let b = 0; b < 3; b++) {
    const by = base - hgt * (0.08 + 0.3 * b) - hgt * 0.1 * a;
    const th = hgt * (0.24 - 0.05 * b) * (0.7 + 0.3 * a) + 0.6;
    const half = wid * spread * (0.5 - 0.08 * b) + 1;
    const bx = cx + (b - 1) * wid * 0.1 + 1.6 * sin(t * 0.37 + b * 2.1 + seed);
    const sb = a * (b === 0 ? 0.9 : b === 1 ? 0.66 : 0.46);
    if (b === 2) topY = by - th * 0.4;
    const y0 = Math.floor(by - th), y1 = Math.ceil(by + th);
    for (let y = y0; y <= y1; y++) {
      const vy = (y + 0.5 - by) / th, py = 1 - vy * vy;
      if (py <= 0) continue;
      const streak = 0.88 + 0.12 * sin(y * 1.1 + seed + b);
      const wob = 0.14 * sin(y * 0.9 + seed + t * 0.3);
      const x0 = Math.floor((bx - half) / MIST_SEG) * MIST_SEG, x1 = bx + half;
      for (let x = x0; x < x1; x += MIST_SEG) {
        const u = (x + MIST_SEG * 0.5 - bx) / half + wob, px = 1 - u * u;
        if (px <= 0) continue;
        const v = py * px;
        g.fillRect(x, y, MIST_SEG, 1, col, { a: Math.min(0.92, sb * streak * v * (2 - v)), dither: true });
      }
    }
  }
  return topY;
}

/**
 * An auspicious-cloud curl (祥云): a fine spiral wound inward, its outer end
 * sweeping off into a tail along the mist, `dir` 1 or -1 for which way it
 * faces. A pale head behind it, the line in gold or ink.
 */
function curl(g, x, y, R, dir, a, line, fill) {
  if (a <= 0.02 || R < 0.8) return;
  g.fillEllipse(x, y + 0.3 * R, R * 1.1, R * 0.8, fill, { aa: true, a: 0.45 * a });
  const N = 8, TH = 1.6 * Math.PI;
  let px = x, py = y;
  for (let k = 0; k <= N; k++) {
    const th = (k / N) * TH, r = R * (0.3 + 0.7 * (k / N));
    const qx = x + dir * r * sin(th), qy = y - r * cos(th);
    if (k) g.thickLine(px, py, qx, qy, 0.8, line, { aa: true, a });
    px = qx; py = qy;
  }
  // the tail: from the outer end, out and down along the mist
  g.thickLine(px, py, px + dir * R * 1.6, py + R * 0.75, 0.75, line, { aa: true, a: 0.85 * a });
  g.thickLine(px + dir * R * 1.6, py + R * 0.75, px + dir * R * 2.8, py + R * 0.7, 0.7, line, { aa: true, a: 0.6 * a });
}

/** A turn's mist with its curls. τ: seconds from the turn (negative before), for the drift. */
function turnMist(g, cx, base, wid, hgt, m, τ, col, line, fill, t, seed) {
  if (m <= 0.01) return;
  const spread = 0.75 + 0.25 * m + (τ > 0 ? 0.4 * progress(τ, 1.6, 4.6) : 0);
  const x = cx + 1.4 * τ;   // drifting sideways as it grows and thins
  const top = mistBank(g, x, base, wid, hgt, m, spread, col, t, seed);
  const R = hgt * 0.14 * (0.6 + 0.4 * m);
  curl(g, x - wid * 0.22 * spread, top + 0.6 * sin(t * 0.8 + seed), R, seed & 1 ? 1 : -1, m, line, fill);
}

/** A crane in flight, facing left: white body, black flight feathers, red crown. */
function crane(g, x, y, ph, k, tone) {
  const up = sin(ph), white = tone(hex('f6f2e6')), black = tone(PIG.ink);
  g.thickLine(x + 2.2 * k, y, x + 5.4 * k, y + 0.5 * k, 0.7 * k, black, { aa: true });           // legs trailing
  g.thickLine(x - 1.8 * k, y - 0.2 * k, x - 4.4 * k, y - 0.7 * k, 0.8 * k, white, { aa: true });  // neck
  g.fillCircle(x - 4.7 * k, y - 0.8 * k, 0.75 * k, black, { aa: true });                            // head
  g.fillCircle(x - 4.6 * k, y - 1.3 * k, 0.45 * k, tone(hex('e03a24')), { aa: true });              // crown
  g.fillEllipse(x, y, 2.6 * k, 1 * k, white, { aa: true });
  const tipX = x + 0.6 * k, tipY = y - up * 4.2 * k;
  g.fillPolygon([[x - 1.4 * k, y - 0.2 * k], [x + 1.6 * k, y - 0.2 * k], [tipX + 1.4 * k, tipY], [tipX - 0.6 * k, tipY]], white, { aa: true });
  g.thickLine(tipX - 0.4 * k, tipY, tipX + 1.6 * k, tipY + up * 0.6 * k, 1.1 * k, black, { aa: true });
}

/** The fisherman's skiff at (x, y), rocking by `rock`. */
function skiff(g, x, y, rock, t, tone) {
  const P = (dx, dy) => [x + dx, y + dy + rock * dx / 7];
  const hull = tone(hex('4a2e22')), hat = tone(hex('d2a550')), cloak = tone(hex('3a4a72'));
  // reflection
  g.fillPolygon([P(-6, 1.6), P(6, 1.4), P(4, 3.4), P(-4, 3.6)], hull, { aa: true, a: 0.2 });
  g.fillPolygon([P(-7.5, -1.2), P(7, -1.6), P(5, 1.4), P(-5.5, 1.6)], hull, { aa: true });
  g.fillEllipse(...P(1, -3.2), 1.8, 2.2, cloak, { aa: true });
  g.fillPolygon([P(-2, -5.2), P(4, -5.4), P(1, -7.8)], hat, { aa: true });
  // rod and line, the line swaying a little
  const tip = P(10.5, -9.5);
  g.thickLine(...P(2.5, -3.5), ...tip, 0.6, tone(PIG.ink), { aa: true });
  const sway = 0.6 * sin(t * 0.9);
  g.thickLine(...tip, tip[0] + sway, y + 1.6, 0.45, tone(hex('e8e0c8')), { aa: true, a: 0.6 });
  // ripples where the line meets the water, every 4 s
  const age = (t % 4) / 4;
  g.ring(tip[0] + sway, y + 2, 1 + 4 * age, 1.6 + 4 * age, tone(hex('eef2e2')), { aa: true, a: 0.45 * (1 - age) });
}

// ------------------------------------------------------------ the dragon
// At the hour a gold dragon swims across the sky behind the peaks, right to
// left, T seconds from the turn. It swims: a wave runs back along its body
// faster than it moves forward, so the S-curve undulates rather than sliding
// along a fixed track. Body: a chain of discs with an ink outline, scale
// bands, a pale belly, a red dorsal spine row, two pairs of clawed legs and a
// flame-tipped tail; the head is bigger than the body, with antlers, a mane,
// an open jaw and long whiskers. It chases a flaming pearl.
const D_T0 = -3.4, D_T1 = 5.0, D_N = 38, D_SP = 1.1, D_K = 0.26, D_OM = 7.5;
const DP = new Float32Array(D_N * 2), DR = new Float32Array(D_N);
for (let j = 0; j < D_N; j++) DR[j] = j < 3 ? 2.2 : j < 7 ? 2.6 : 2.6 * (1 - (j - 7) / (D_N - 7)) + 0.9;
function dragonHead(T) {
  const u = (T - D_T0) / (D_T1 - D_T0);
  return [lerp(W + 8, -58, u), 29 + 5 * sin(T * 0.7 + 0.4)];
}
function dragon(g, T, tone, t) {
  if (T < D_T0 || T > D_T1) return;
  const [hx, hy] = dragonHead(T);
  for (let j = 0; j < D_N; j++) {
    const A = 4.6 * (0.3 + 0.7 * Math.min(1, j / 9));
    DP[j * 2] = hx + j * D_SP;
    DP[j * 2 + 1] = hy + A * sin(D_K * j - D_OM * T) - 1.4 * sin(-D_OM * T);
  }
  const ink = tone(PIG.ink), gold = tone(hex('f2be4a')), dark = tone(hex('b0702a')), red = tone(hex('d63c1e')),
    flame = tone(hex('f4882a')), belly = tone(hex('fbeec4')), white = tone(hex('fffaf0'));
  // forward (toward the head) and down-normal at segment j
  const frame = (j) => {
    const a = Math.max(0, j - 1), b = Math.min(D_N - 1, j + 1);
    const dx = DP[a * 2] - DP[b * 2], dy = DP[a * 2 + 1] - DP[b * 2 + 1], l = Math.hypot(dx, dy) || 1;
    return [dx / l, dy / l, dy / l, -dx / l];
  };
  const X = (j) => DP[j * 2], Y = (j) => DP[j * 2 + 1];

  // the flaming pearl it chases
  const qx = hx - 10, qy = hy + 1 + 2.5 * sin(T * 2.6);
  g.fillCircle(qx, qy, 3.6, flame, { aa: true, a: 0.3 + 0.12 * sin(t * 11) });
  g.fillCircle(qx, qy, 2, white, { aa: true });
  g.thickLine(qx + 1.5, qy - 1, qx + 4 + sin(t * 9), qy - 3, 0.8, flame, { aa: true, a: 0.8 });

  // a leg: hip on the body's underside, knee, foot, three claws
  const leg = (j, near) => {
    const [ux, uy, nx, ny] = frame(j), r = DR[j], sw = sin(D_OM * T * 0.5 + j * 0.4);
    const k0 = near ? 1 : -0.4;
    const hx0 = X(j) + nx * r * 0.5 + ux * k0, hy0 = Y(j) + ny * r * 0.5 + uy * k0;
    const kx = hx0 + nx * 2.6 + ux * (1.4 + 1.2 * sw), ky = hy0 + ny * 2.6 + uy * (1.4 + 1.2 * sw);
    const fx = kx + ux * 2 + nx * 0.6, fy = ky + uy * 2 + ny * 0.6;
    const c = near ? gold : dark;
    g.thickLine(hx0, hy0, kx, ky, 1.7, ink, { aa: true });
    g.thickLine(kx, ky, fx, fy, 1.5, ink, { aa: true });
    g.thickLine(hx0, hy0, kx, ky, 0.9, c, { aa: true });
    g.thickLine(kx, ky, fx, fy, 0.8, c, { aa: true });
    for (const [cu, cn] of [[1.3, -0.3], [1, 0.8], [0.2, 1.3]]) g.thickLine(fx, fy, fx + ux * cu + nx * cn, fy + uy * cu + ny * cn, 0.5, ink, { aa: true });
  };
  leg(9, false); leg(26, false);

  // dorsal spine row on the back, raked toward the tail
  for (let j = 3; j < D_N - 4; j += 2) {
    const [ux, uy, nx, ny] = frame(j), r = DR[j] + 0.4, h = 1.2 + 0.9 * (DR[j] / 2.6);
    const bx0 = X(j) - nx * r, by0 = Y(j) - ny * r;
    g.fillPolygon([[bx0 + ux * 0.9, by0 + uy * 0.9], [bx0 - nx * h - ux * 1.4, by0 - ny * h - uy * 1.4], [bx0 - ux * 1.1, by0 - uy * 1.1]], red, { aa: true });
  }
  // the tail's flame
  {
    const j = D_N - 1, [ux, uy, nx, ny] = frame(j), x = X(j), y = Y(j), fl = sin(t * 9);
    for (const [len, off, c] of [[7, -2.6 + fl, red], [8.5, 0.3, flame], [6.5, 2.6 - fl, red]])
      g.fillPolygon([[x - nx * 1.2, y - ny * 1.2], [x - ux * len + nx * off, y - uy * len + ny * off], [x + nx * 1.2, y + ny * 1.2]], c, { aa: true });
  }
  // the body: ink outline, then gold, then the belly, then scale bands
  for (let j = D_N - 1; j >= 0; j--) g.fillCircle(X(j), Y(j), DR[j] + 0.75, ink, { aa: true });
  for (let j = D_N - 1; j >= 0; j--) g.fillCircle(X(j), Y(j), DR[j], gold, { aa: true });
  for (let j = D_N - 1; j >= 2; j--) {
    const [, , nx, ny] = frame(j), r = DR[j];
    g.fillCircle(X(j) + nx * r * 0.5, Y(j) + ny * r * 0.5, r * 0.5, belly, { aa: true });
  }
  for (let j = 4; j < D_N - 1; j += 2) {
    const [ux, uy, nx, ny] = frame(j), r = DR[j];
    g.thickLine(X(j) - nx * r * 0.9 - ux * 0.3, Y(j) - ny * r * 0.9 - uy * 0.3, X(j) + nx * r * 0.1 + ux * 0.4, Y(j) + ny * r * 0.1 + uy * 0.4, 0.6, dark, { aa: true });
  }
  leg(9, true); leg(26, true);

  // the head, in its own frame: lu forward, ln down
  const [ux, uy, nx, ny] = frame(0), S = 1.15, op = 0.6 + 0.6 * (0.5 + 0.5 * sin(t * 3));
  const at = (lu, ln) => [hx + (ux * lu + nx * ln) * S, hy + (uy * lu + ny * ln) * S];
  const poly = (pts, c) => g.fillPolygon(pts.map(([a, b]) => at(a, b)), c, { aa: true });
  const grow = (pts, k) => pts.map(([a, b]) => [1.8 + (a - 1.8) * k, (b - 0.2) * k + 0.2]);
  // mane, streaming back
  for (const [ln, len] of [[-1.8, 5.5], [0.2, 6.5], [2, 5]]) {
    const wv = 0.9 * sin(t * 7 + ln);
    poly([[-1, ln - 1], [-1 - len, ln + wv], [-1, ln + 1]], red);
  }
  // antlers: the far one darker, the near one forked
  const ant = (o, c, w) => {
    const [a0, b0] = at(0.4 + o, -2.4), [a1, b1] = at(-3.6 + o, -6.6), [a2, b2] = at(-1.6 + o, -4.4), [a3, b3] = at(-0.4 + o, -6.8);
    g.thickLine(a0, b0, a1, b1, w, c, { aa: true });
    g.thickLine(a2, b2, a3, b3, w * 0.85, c, { aa: true });
  };
  ant(1, dark, 1.1); ant(0, ink, 1.6); ant(0, gold, 0.8);
  const UP = [[-2, -2.4], [1.4, -3], [3.6, -2.3], [7, -1.1], [7.4, 0.2], [3, 0.6], [-2, 1.2]];
  const LO = [[-1.5, 0.9], [3, 1.1], [6.4, 1.6 + op], [5.8, 2.6 + op], [1, 2.8], [-1.5, 2.3]];
  poly(grow(LO, 1.2), ink); poly(grow(UP, 1.16), ink);
  poly([[1, 0.6], [7, 0.3], [6.4, 1.6 + op], [1, 1.5]], red);   // the open mouth
  poly(LO, dark); poly(UP, gold);
  poly([[6.6, 0.1], [6.2, 1], [5.6, 0.3]], white);                // a fang
  // eye
  { const [ex, ey] = at(2.4, -1.4); g.fillCircle(ex, ey, 1.15, white, { aa: true }); g.fillCircle(ex + ux * 0.3, ey + uy * 0.3, 0.6, ink, { aa: true }); }
  // whiskers: long, waving back past the head
  for (const [lu, ln, ph] of [[6.6, -0.8, 0], [5.6, 2.2 + op, 1.7]]) {
    let [px, py] = at(lu, ln);
    for (let k = 1; k <= 5; k++) {
      const [qx2, qy2] = at(lu - k * 2.3, ln + (ln < 0 ? -1 : 1) * (k * 0.5 + 1.1 * sin(t * 5 + k * 0.9 + ph)));
      g.thickLine(px, py, qx2, qy2, 0.55, ink, { aa: true, a: 1 - k * 0.12 });
      px = qx2; py = qy2;
    }
  }
}
/** Where the body is, for the mist that trails it. */
function dragonPoint(T, j) {
  const [hx, hy] = dragonHead(T);
  const A = 4.6 * (0.3 + 0.7 * Math.min(1, j / 9));
  return [hx + j * D_SP, hy + A * sin(D_K * j - D_OM * T) - 1.4 * sin(-D_OM * T)];
}

// ------------------------------------------------------------ the seal
const SEAL = [
  '.rrrrrrrrr.',
  'rrrrrwrrrrr',
  'rrrrrwrrrrr',
  'rwrrrwrrrwr',
  'rwrrrwrrrwr',
  'rwrrrwrrrwr',
  'rwrrrwrrrwr',
  'rwwwwwwwwwr',
  'rrrrrrrrrrr',
  'rrrrrrrrrr.',
];
const SEAL_X = 146, SEAL_Y = 66;
function seal(g, a, tone, mk) {
  if (a <= 0) return;
  const red = tone(hex('c8321e'));
  for (let j = 0; j < SEAL.length; j++)
    for (let i = 0; i < SEAL[j].length; i++) {
      const ch = SEAL[j][i];
      if (ch !== 'r') continue;
      const ink = 0.7 + 0.3 * rand(i, j, mk);   // uneven ink of a hand-pressed seal
      g.pixel(SEAL_X + i, SEAL_Y + j, red, { a: a * ink });
    }
}

// ------------------------------------------------------------ the face
export default {
  name: 'Shanshui',
  blurb: 'A blue-green landscape scroll whose peaks are the numerals; old peaks sink into the mist and new ones rise.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, mk = f.minuteKey;
    const tod = f.h * 3600 + f.m * 60 + s, hour = tod / 3600;
    ctx.lcd.backlight(1 - 0.55 * ctx.night);
    const bg = background(mk, f.h + f.m / 60), day = bg.day, tone = bg.tone;

    const nxt = clockFields(new Date(ctx.date.getTime() + 60000));
    const prv = clockFields(new Date(ctx.date.getTime() - 60000));
    const cur = f.hh + f.mm, nxS = nxt.hh + nxt.mm, pvS = prv.hh + prv.mm;
    const hourNext = nxt.h !== f.h, hourPrev = prv.h !== f.h;

    g.draw(bg.canvas, 0, 0);

    // ---- distant ranges, drifting right in parallax
    const far1 = mix(mix(day.hor, tone(PIG.azL), 0.28), day.top, 0.45 * day.night), far2 = mix(mix(day.hor, tone(PIG.az), 0.42), day.top, 0.55 * day.night);
    for (const [col, speed, base, amp, freq, seed] of [[far1, 1.8, 50, 13, 0.035, 1], [far2, 4, 56, 9, 0.06, 2]]) {
      const off = tod * speed, pts = [[-2, HORIZON + 1]];
      for (let x = -4; x <= W + 4; x += 4) {
        const wx = (x - off) * freq;
        const n = noise(wx, seed) * 0.65 + noise(wx * 2.7, seed + 9) * 0.35;
        const ridge = 1 - Math.abs(2 * n - 1);
        pts.push([x + (off % 4 + 4) % 4 - 4, base - amp * ridge * ridge]);
      }
      pts.push([W + 2, HORIZON + 1]);
      g.fillPolygon(pts, col, { aa: true });
    }
    const mist = mix(hex('fffcf4'), hex('c8d0ec'), day.night), mistA = 1 - 0.15 * day.night, curlC = mix(hex('b8862e'), hex('ecd290'), day.night);

    // a high wisp behind the minute peaks
    const wx0 = ((tod * 3.1) % 240) - 40;
    mistBand(g, wx0, 40, 46, 2.2, 0.32, mist, tod, 3);

    // ---- the hour: the dragon, wrapped in its own cloud, swims behind the peaks
    let T = 99;
    if (hourNext && s > 50) T = s - 60;
    if (hourPrev && s < 10) T = s;
    if (T < D_T1) {
      // wisps of mist it swims through (behind it), with a curl or two
      for (let k = 0; k < 3; k++) {
        const [x, y] = dragonPoint(T, 8 + k * 13);
        if (x < -20 || x > W + 20) continue;
        const a = 0.5 * progress(T, D_T0, D_T0 + 1) * (1 - progress(T, D_T1 - 1.2, D_T1));
        const top = mistBank(g, x + 3, y + 9, 20, 8, a, 1, mist, tod, 40 + k);
        if (k !== 1) curl(g, x + 6 - 4 * k, top + 1, 1.6, k ? 1 : -1, a * 1.4, curlC, mist);
      }
      dragon(g, T, tone, tod);
    }

    // ---- the minute peaks across the lake, and their reflections
    const jobs = [];
    for (let i = 0; i < 4; i++) {
      const S = SLOT[i];
      let top = S.base - S.h, show = cur[i], m = 0;
      if (cur[i] !== nxS[i] && s >= SINK0) top += S.h * ease.inCubic(progress(s, SINK0, SINK1));
      if (cur[i] !== nxS[i]) m = Math.max(m, ease.inOutQuad(progress(s, 56.6, 58.9)));
      if (cur[i] !== pvS[i] && s < RISE1) top += S.h * (1 - ease.outCubic(progress(s, RISE0, RISE1)));
      if (cur[i] !== pvS[i]) m = Math.max(m, 1 - ease.inOutQuad(progress(s, 1.8, 4.6)));
      if (cur[i] !== nxS[i] && s >= SINK1) top = S.base;   // gone before :00
      const gleam = cur[i] !== pvS[i] ? 1 - progress(s, RISE1 - 0.6, RISE1 + 1.6) : 0;
      const tau = cur[i] !== pvS[i] && s < 30 ? s : s - 60;
      jobs.push({ S, d: +show, top, m, gleam, tau });
    }
    const fallC = tone(hex('f4f8f0')), gleamC = tone(hex('fff8e0'));
    const drawPeak = (i) => {
      const J = jobs[i];
      if (J.top >= J.S.base) return;
      const gl = glyph(J.d, i, mk, i >= 2 ? bg.toneFar : tone);
      if (J.top === J.S.base - J.S.h) g.blit(gl, J.S.x, J.top);
      else glide(g, gl, J.S.x, J.top, J.S.base);
      // a new peak's gold is fresh: it gleams as it rises and dulls to the painted gold
      if (J.gleam > 0) {
        const G2 = gl.gold, yt = Math.round(J.top);
        for (let k = 0; k < G2.length; k += 2) {
          const y = yt + G2[k + 1];
          if (y < J.S.base) g.pixel(J.S.x + G2[k], y, gleamC, { a: J.gleam * (0.6 + 0.4 * sin(tod * 6 + G2[k] * 0.7)) });
        }
      }
      // the ring of cliffs feeds its lake: a waterfall down the inner wall
      if (J.d === 0) {
        const big = J.S.h > 50, head = big ? 3 : 2;
        const x = J.S.x + J.S.w * 0.5, y0 = J.top + head + (4.8 / 24) * (J.S.h - head), y1 = J.top + J.S.h * 0.55 + 0.5;
        g.clip(0, 0, W, J.S.base);
        g.thickLine(x, y0, x + 0.3, y1, big ? 1.6 : 1.1, fallC, { aa: true, a: 0.55 });
        const len = y1 - y0;
        for (let k = 0; k < 3; k++) {
          const u = ((tod * (big ? 0.9 : 1.1) + k / 3) % 1), y = y0 + u * len;
          g.thickLine(x, y, x + 0.1, Math.min(y1, y + 3), big ? 1 : 0.7, fallC, { aa: true, a: 0.9 * (1 - u * 0.4) });
        }
        const sp = 0.5 + 0.5 * sin(tod * 9 + i);
        g.fillEllipse(x + 0.2, y1, (big ? 2.4 : 1.7) + 0.4 * sp, 0.9, fallC, { aa: true, a: 0.5 + 0.2 * sp });
        g.unclip();
      }
    };
    if (day.night > 0.3) {
      const glow = hex('8090c8');
      for (let i = 2; i < 4; i++) {
        const J = jobs[i];
        if (J.top >= J.S.base) continue;
        const cy = (J.top + J.S.base) / 2;
        for (const k of [1, 0.75]) g.fillEllipse(J.S.x + J.S.w / 2, cy, J.S.w * 0.72 * k, (J.S.base - J.top) * 0.6 * k, glow, { aa: true, a: 0.08 * day.night, dither: true });
      }
    }
    drawPeak(2); drawPeak(3);
    g.clip(0, HORIZON, W, H - HORIZON);
    for (let i = 2; i < 4; i++) {
      const J = jobs[i];
      if (J.top >= J.S.base) continue;
      const gl = glyph(J.d, i, mk, i >= 2 ? bg.toneFar : tone);
      g.blit(gl, J.S.x, 2 * J.S.base - J.top - gl.h, { flipY: true, a: 0.22 });
    }
    g.unclip();

    // ---- the sun's (or moon's) glitter path on the lake
    if (bg.glint) {
      const [gx, gc, ga] = bg.glint;
      for (let r = 0; r < 7; r++) {
        const y = HORIZON + 1.5 + r * 2.4, wdt = 2 + r * 0.9;
        for (let k = 0; k < 2; k++) {
          const fl = sin(tod * (2.3 + r * 0.4) + k * 2.5 + r * 1.7);
          if (fl < 0) continue;
          const x = gx + (k ? 1 : -1) * wdt * 0.5 * (0.4 + 0.6 * sin(tod * 0.7 + r + k)) - 1.5;
          g.thickLine(x, y, x + 3 + r * 0.3, y, 0.9, gc, { aa: true, a: ga * fl });
        }
      }
    }

    // ---- the lake's wave lines
    const waveC = mix(day.water, hex('f4f6ea'), 0.55);
    for (let r = 0; r < 7; r++) {
      const y = HORIZON + 2.2 + r * 2.5 + r * r * 0.1;
      const spd = 1.4 + r * 0.5, len = 4 + r * 1.2;
      for (let k = 0; k < 4; k++) {
        const x = ((k * 47 + r * 29 + tod * spd) % 190) - 15;
        if (x < 58 && y > 70) continue;
        const bob = 0.4 * sin(tod * 1.1 + k + r);
        g.thickLine(x, y + bob, x + len, y + bob - 0.5, 0.7, waveC, { aa: true, a: 0.55 });
      }
    }

    // mist along the far shore, always; thicker round a peak about to change
    const mx = ((tod * 2.4) % 200) - 20;
    mistBand(g, mx, HORIZON - 1.5, 56, 1.4, 0.4, mist, tod, 7);
    mistBand(g, mx - 100, HORIZON - 0.5, 44, 1.2, 0.35, mist, tod, 8);
    for (let i = 2; i < 4; i++) {
      const J = jobs[i];
      turnMist(g, J.S.x + J.S.w / 2, J.S.base + 2, J.S.w * 1.5, 22, J.m * mistA, J.tau, mist, curlC, mist, tod, 11 + i);
    }

    // ---- the skiff, on its slow crossing
    const bx = 74 + 58 * (0.5 - 0.5 * cos(tod * Math.PI * 2 / 900)), by = 71;
    skiff(g, bx, by, 0.6 * sin(tod * 1.3), tod, tone);

    // ---- the near massif: the hours, then the shore they stand on
    drawPeak(0); drawPeak(1);
    g.blit(bg.shore, 0, H - bg.shore.h);
    mistBand(g, ((tod * 1.8 + 60) % 200) - 30, 52, 40, 1.6, 0.28, mist, tod, 9);
    for (let i = 0; i < 2; i++) {
      const J = jobs[i];
      turnMist(g, J.S.x + J.S.w / 2, J.S.base + 1, J.S.w * 1.5, 34, J.m * mistA, J.tau, mist, curlC, mist, tod, 21 + i);
    }

    // ---- cranes: a pair now and then; a skein at the hour
    const flock = [];
    const cs = 12 + 22 * rand(mk, 77);
    if (rand(mk, 78) < 0.6 && s > cs && s < cs + 14) flock.push({ u: (s - cs) / 14, n: 2, y: 9 + 8 * rand(mk, 79) });
    if (hourPrev && s > 4 && s < 18) flock.push({ u: (s - 4) / 14, n: 6, y: 13 });
    for (const F of flock) {
      for (let k = 0; k < F.n; k++) {
        const x = lerp(W + 10, -20, F.u) + k * 8, y = F.y - 1.5 * Math.abs(k - (F.n - 1) / 2) + 0.5 * sin(tod * 0.8 + k) ;
        crane(g, x, y, tod * 7 + k * 0.9, 0.9, tone);
      }
    }

    // ---- the seal: stamped after the hour turns, stays for the hour
    let sa = 1;
    if (hourNext) sa = 1 - progress(s, 56, 59.5);
    if (hourPrev && s < 4) {
      const press = progress(s, 2.6, 3.4);
      if (press < 1) {
        const k = ease.inCubic(press), sz = lerp(22, 12, k);
        g.fillRoundRect(SEAL_X + 5.5 - sz / 2 + 2 * (1 - k), SEAL_Y + 5 - sz / 2 + 2 * (1 - k), sz, sz, 1.5, tone(PIG.ink), { aa: true, a: 0.1 + 0.35 * k });
        sa = 0;
      } else sa = 1;
    }
    seal(g, sa, tone, f.h);

  },
};
