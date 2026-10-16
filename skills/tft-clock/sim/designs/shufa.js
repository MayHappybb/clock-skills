// Shufa (书法): a brush writes the time in Chinese on a handscroll.
//
// The time is words, not digits: 十时九分, 二十三时五十九分, 十一时正.
// They are written the traditional way, in vertical columns read top to
// bottom, right to left, two characters to a column, in the faint
// vermilion column rules (朱丝栏) printed on the scroll. At :00 a brush
// comes down from the inkstone (off the top right) and writes the whole
// phrase in real stroke order, every stroke a press, a pull and a lift:
// entry presses, hooks flicked out, sweeps that taper, a 捺 that swells
// into its foot. The ink runs out as it goes, so each phrase starts glossy
// black and ends grey with flying white (飞白) streaks; the brush goes back
// to the inkstone between the hour and the minute. Wet strokes bleed into
// the paper's fibres (洇墨) for half a minute and dry from a cool gloss to a
// warm matte. Then a seal stone comes down and leaves a vermilion seal.
// At :58 the scroll is rolled on: the sheet slides off to the right (the
// written part rolls up there, as a handscroll does) and fresh paper comes
// in from the left, empty by :00. On the hour the brush first sweeps a
// pale-ink ensō (円相, the Zen circle of one breath) across the sheet,
// then dips and writes "X时正" over it.
//
// All the while the shadow of a bamboo sprig outside the window sways
// over the paper; it walks across the day with the sun, turns to faint
// moonlight at night, and the paper warms under lamplight after dusk.
//
// How it is built. A sheet is planned once a minute: the phrase, the
// strokes (control points, corner-cut, resampled every 0.6 px, each sample
// timed by a press-pull-lift speed profile) and the brush's whole path.
// From the plan, a per-pixel field: when ink arrives there (the first two
// strokes to cover it), how dense, how dry (flying white is a streak
// pattern across the stroke, so it runs along it), and for pixels just
// outside, the distance to the nearest stroke and how wet it was. Any
// frame is then a pure function of time: a pixel is ink if its stroke has
// reached it, and the bleed is a front spreading out by the stroke's age.
//
// Cost. The sheet (paper + ink + seal) is a 25.6 KB layer, refreshed at
// 10 Hz (on the device: one 1/6 of it per frame) and copied each frame;
// the stroke under the brush is shaded live per frame in a small box so
// the ink follows the brush at 60 fps. Brush, seal stone and leaf shadows
// are a few AA polygons and alpha fills. The field is 160 x 80 x ~20 bytes
// built once a minute.
//
// Palette: rice paper (#ede3cb), pine-soot ink from glossy blue-black to
// matte grey, vermilion (seal and column rules), bamboo and goat hair on
// the brush, Shoushan-stone seal. Ink and paper are anti-aliased where the
// brush leaves soft edges; the paper texture is hard per-pixel grain.

import { Gfx, hex, mix, rand, noise, clamp, lerp, to565, R, G, B, sin as ksin, cos as kcos } from '../js/kit.js';
import { GLYPHS, phrase, dateText } from './shufa-glyphs.js';

const W = 160, H = 80;
const S = 36;                       // character box, px
const SLOT = 37;                    // column pitch, px
const slotX = (k) => 157 - SLOT * (k + 1);   // left edge of column k (0 = rightmost): 120, 83, 46, 9
const rowY = (r) => 3 + r * 38;

const PAPER = hex('#ede3cb');
const INK = hex('#15120f');
const INK_GREY = hex('#6d665c');
const WET = hex('#070910');
const RULE = hex('#c8503a');
const VERMILION = hex('#c4342a');
const SHADOW = hex('#2a2418');
const BAMBOO = hex('#b8925a'), BAMBOO_HI = hex('#dcbd84'), BAMBOO_NODE = hex('#8a6a3c');
const HAIR = hex('#e4d8c0'), FERRULE = hex('#2c2420');
const STONE = hex('#a8734a'), STONE_HI = hex('#c9976a'), STONE_DK = hex('#7a5032');

const SPEED = 175;                  // brush speed on the paper, px/s (mean)
const OFF = { x: 178, y: -30, z: 16 };   // the inkstone, off the top right
const SLIDE0 = 58.2, SLIDE1 = 59.8;  // the scroll rolls on

// ------------------------------------------------------------ paper

/** Periodic value noise (period px in x), so the paper tile wraps at 160. */
function pnoise(x, y, cell, seed) {
  const P = Math.round(W / cell);
  const fx = x / cell, fy = y / cell, ix = Math.floor(fx), iy = Math.floor(fy);
  const ux = fx - ix, uy = fy - iy, sx = ux * ux * (3 - 2 * ux), sy = uy * uy * (3 - 2 * uy);
  const m = (i) => ((i % P) + P) % P;
  const a = rand(m(ix), iy, seed), b = rand(m(ix + 1), iy, seed), c = rand(m(ix), iy + 1, seed), d = rand(m(ix + 1), iy + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** Raw paper (0xRRGGBB per pixel): mottling, grain, long fibres, the column rules. */
const PAPER_RAW = (() => {
  const px = new Float32Array(W * H * 3);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      const m = (pnoise(x, y, 10, 3) - 0.5) * 9 + (pnoise(x, y, 4, 5) - 0.5) * 4 + (rand(x, y, 9) - 0.5) * 3;
      px[i] = R(PAPER) + m; px[i + 1] = G(PAPER) + m; px[i + 2] = B(PAPER) + m * 1.2;
    }
  // fibres: short random walks, lighter or darker, wrapping in x
  for (let f = 0; f < 70; f++) {
    let x = rand(f, 1, 77) * W, y = rand(f, 2, 77) * H, a = rand(f, 3, 77) * Math.PI * 2;
    const len = 6 + rand(f, 4, 77) * 22, k = rand(f, 5, 77) < 0.6 ? 7 : -6;
    for (let s = 0; s < len; s++) {
      a += (rand(f, s, 78) - 0.5) * 0.5;
      x += Math.cos(a) * 0.8; y += Math.sin(a) * 0.8;
      const xi = ((Math.floor(x) % W) + W) % W, yi = Math.floor(y);
      if (yi < 0 || yi >= H) continue;
      const i = (yi * W + xi) * 3;
      px[i] += k; px[i + 1] += k; px[i + 2] += k * 0.8;
    }
  }
  // 朱丝栏: faint vermilion column rules at the slot edges, a little broken
  for (const xr of [157, 120, 83, 46, 9])
    for (let y = 0; y < H; y++) {
      const v = 0.22 + 0.08 * (rand(xr, y, 31) - 0.5) - (rand(xr >> 1, y >> 2, 32) < 0.08 ? 0.12 : 0);
      const i = (y * W + xr) * 3;
      px[i] = lerp(px[i], R(RULE), v); px[i + 1] = lerp(px[i + 1], G(RULE), v); px[i + 2] = lerp(px[i + 2], B(RULE), v);
    }
  return px;
})();

// ------------------------------------------------------------ light by time of day

const LIGHT = [
  [0, '#f8dcb4', 0.0], [5, '#f8dcb4', 0.0], [6, '#e9e6f4', 0.4], [8, '#ffffff', 1], [15.5, '#ffffff', 1],
  [17.5, '#ffe2b4', 0.9], [18.7, '#fad2a0', 0.35], [19.5, '#f8dcb4', 0.0], [24, '#f8dcb4', 0.0],
].map(([h, c, sun]) => [h, hex(c), sun]);

function lightAt(hf) {
  let k = 1;
  while (LIGHT[k][0] < hf) k++;
  const a = LIGHT[k - 1], b = LIGHT[k], u = (hf - a[0]) / (b[0] - a[0]);
  return { tint: mix(a[1], b[1], u), sun: lerp(a[2], b[2], u) };
}

/** Integer channel mix (what the device does), a towards b by u. */
function mixi(a, b, u) {
  if (u <= 0) return a;
  if (u >= 1) return b;
  const k = (u * 256) | 0;
  const r = R(a) + (((R(b) - R(a)) * k) >> 8), g = G(a) + (((G(b) - G(a)) * k) >> 8), bb = B(a) + (((B(b) - B(a)) * k) >> 8);
  return ((r << 16) | (g << 8) | bb) >>> 0;
}
const SEAL_A = [0.92, 0, 0.25, 0.7, 0, 0, 0.35];

const mul = (c, t) => ((((R(c) * R(t)) / 255) << 16) | (((G(c) * G(t)) / 255) << 8) | ((B(c) * B(t)) / 255)) >>> 0;

const tintCache = { key: -1, paper: null, canvas: null, ink: 0, grey: 0, wet: 0 };
/** The paper under this light: a colour array and a canvas (cached per tint). */
function tinted(tint, night) {
  const key = tint * 32 + Math.round(night * 20);
  if (tintCache.key === key) return tintCache;
  const paper = new Uint32Array(W * H), c = new Gfx(W, H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x, j = i * 3;
      // lamplight falls off to the corners at night
      const vx = (x - 70) / 90, vy = (y - 30) / 70, vig = 1 - night * 0.22 * (vx * vx + vy * vy);
      const r = clamp(PAPER_RAW[j] * vig, 0, 255), gg = clamp(PAPER_RAW[j + 1] * vig, 0, 255), b = clamp(PAPER_RAW[j + 2] * vig, 0, 255);
      const v = mul(((r << 16) | (gg << 8) | b) >>> 0, tint);
      paper[i] = v;
      c.buf[i] = to565(v);
    }
  Object.assign(tintCache, { key, paper, canvas: c, ink: mul(INK, tint), grey: mul(INK_GREY, tint), wet: mul(WET, tint), red: mul(VERMILION, tint) });
  return tintCache;
}

// ------------------------------------------------------------ strokes

function chaikin(pts, n = 2) {
  for (let k = 0; k < n; k++) {
    const out = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      out.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1], 0.75 * a[2] + 0.25 * b[2]]);
      out.push([0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1], 0.25 * a[2] + 0.75 * b[2]]);
    }
    out.push(pts[pts.length - 1]);
    pts = out;
  }
  return pts;
}

/** Resample a polyline [x, y, w] every `step` px: { x, y, w, s } arrays and the length. */
function resample(pts, step = 0.6) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) { const dx = pts[i][0] - pts[i - 1][0], dy = pts[i][1] - pts[i - 1][1]; cum.push(cum[i - 1] + Math.sqrt(dx * dx + dy * dy)); }
  const L = cum[cum.length - 1], n = Math.max(2, Math.ceil(L / step) + 1);
  const xs = new Float32Array(n), ys = new Float32Array(n), ws = new Float32Array(n), ss = new Float32Array(n);
  let j = 0;
  for (let k = 0; k < n; k++) {
    const s = (k / (n - 1)) * L;
    while (j < pts.length - 2 && cum[j + 1] < s) j++;
    const seg = cum[j + 1] - cum[j], u = seg > 0 ? clamp((s - cum[j]) / seg, 0, 1) : 0;
    xs[k] = lerp(pts[j][0], pts[j + 1][0], u); ys[k] = lerp(pts[j][1], pts[j + 1][1], u);
    ws[k] = lerp(pts[j][2], pts[j + 1][2], u); ss[k] = s;
  }
  return { xs, ys, ws, ss, n, L };
}

// The brush's speed profile through a stroke: slow at the press and the
// lift, fast through the body. f maps time fraction to arc fraction.
const PROF = 0.6;
const fProf = (x) => x - (PROF / (Math.PI * 2)) * ksin(Math.PI * 2 * x);
function fInv(u) {
  let x = u;
  for (let k = 0; k < 4; k++) x -= (fProf(x) - u) / (1 - PROF * kcos(Math.PI * 2 * x));
  return clamp(x, 0, 1);
}

/** A stroke in screen px from glyph control points in a box at (bx, by) of size sz. */
function makeStroke(ctrl, bx, by, sz, wmul = 1, seed = 0) {
  const k = sz / 100;
  // no two sheets alike: the hand wanders a little, stroke by stroke
  const jw = 0.9 + 0.2 * rand(seed, 7), jx = (rand(seed, 8) - 0.5) * 2.4, jy = (rand(seed, 9) - 0.5) * 2.4;
  const pts = chaikin(ctrl.map(([x, y, w], q) => [
    bx + (x + jx + (rand(seed, q, 10) - 0.5) * 2.2) * k,
    by + (y + jy + (rand(seed, q, 11) - 0.5) * 2.2) * k,
    Math.max(0.35, w * k * wmul * jw * (0.92 + 0.16 * rand(seed, q, 12))),
  ]), 3);
  const r = resample(pts);
  return { ...r, D: 0.07 + r.L / SPEED };
}

// ------------------------------------------------------------ the plan for a minute

const hashSeed = (a, b, c) => (Math.imul(a, 73856093) ^ Math.imul(b + 1, 19349663) ^ Math.imul(c + 1, 83492791)) | 0;

function charBoxes(n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push({ x: slotX(i >> 1) + 0.5, y: rowY(i & 1) });
  return out;
}

const SMALL = 10.5;                  // inscription character size, px

/** The inscription column (款) and the seal, after the last column of the phrase. */
function tail(n, nDate) {
  const cols = Math.ceil(n / 2);
  if (cols >= 4) return { ins: null, seal: { x: 0, y: 60, s: 8 } };
  const ix = slotX(cols) + 23, iy = 4;
  const end = iy + nDate * SMALL;
  const seal = end + 14 <= 79 ? { x: Math.round(ix - 0.5), y: Math.round(end) + 2, s: 12 } : { x: Math.round(ix - 14), y: 66, s: 12 };
  return { ins: { x: ix, y: iy }, seal };
}

function buildPlan(h, m, key) {
  const ph = phrase(h, m);
  const chars = ph.all, n = chars.length, boxes = charBoxes(n);
  const strokes = [];
  const hourShow = m === 0;

  // the ensō: one pale sweep round the written block, counter-clockwise from the top
  if (hourShow) {
    const cols = Math.ceil(n / 2);
    const cx = (slotX(cols - 1) + 157) / 2, cy = 40, rx = Math.min(36, cols * 18 + 4), ry = 35;
    const ctrl = [], N = 28, a0 = -1.0 + (rand(key, 1) - 0.5) * 0.4;
    for (let i = 0; i <= N; i++) {
      const u = i / N, a = a0 - u * (Math.PI * 2 - 0.25);
      const w = 3 + 5.5 * Math.sin(Math.PI * Math.min(1, u * 1.05 + 0.08)) * (0.85 + 0.3 * noise(u * 5, key));
      ctrl.push([cx + rx * Math.cos(a) * (1 + 0.04 * Math.sin(u * 9)), cy + ry * Math.sin(a), u > 0.92 ? w * (1 - (u - 0.92) / 0.1) + 0.6 : w]);
    }
    const st = resample(chaikin(ctrl, 2));
    strokes.push({ ...st, D: 0.25 + st.L / 210, group: 0, pale: true, ci: -1 });
  }

  // the phrase: the hour part on one dip, the minute part on another
  const hourN = ph.hour.length;
  chars.forEach((ch, ci) => {
    const ox = (rand(key, ci, 20) - 0.5) * 1.6, oy = (rand(key, ci, 21) - 0.5) * 1.6;
    GLYPHS[ch].forEach((ctrl, si) => strokes.push({ ...makeStroke(ctrl, boxes[ci].x + ox, boxes[ci].y + oy, S, 1, hashSeed(key, ci, si)), group: ci < hourN ? 1 : 2, ci }));
  });

  // the inscription: the date in small script, then the seal below it
  const dt = new Date(key * 60000), dchars = dateText(dt.getMonth() + 1, dt.getDate());
  const tl = tail(n, dchars.length);
  if (tl.ins) dchars.forEach((ch, k) => {
    GLYPHS[ch].forEach((ctrl, si) => strokes.push({ ...makeStroke(ctrl, tl.ins.x, tl.ins.y + k * SMALL, SMALL, 1.9, hashSeed(key, 100 + k, si)), group: 2, ci: 100 + k, small: true }));
  });

  // ink load: each dip starts full and runs down with the length written
  const total = {};
  for (const s of strokes) total[s.group] = (total[s.group] ?? 0) + s.L;
  const used = {};
  for (const s of strokes) {
    const u0 = (used[s.group] ?? 0) / total[s.group];
    used[s.group] = (used[s.group] ?? 0) + s.L;
    const load = s.pale ? 0.55 : 1 - 0.55 * u0;
    s.load = load;
    s.level = s.pale ? 0.9 : (1 - load) * 0.7;           // 0 = black, 1 = grey
    s.density = s.pale ? 0.55 : 0.96;
    s.dry = s.pale ? 0.75 : clamp((0.78 - load) / 0.33, 0, 1) * 0.85;
    s.wet = (s.pale ? 0.5 : 0.35 + 0.65 * load * load) * (s.small ? 0.45 : 1);
    s.seed = key * 31 + strokes.indexOf(s);
  }

  // the brush's path
  const segs = [];
  let cur = 0, last = { ...OFF };
  const move = (to, dur, arc = 0) => { segs.push({ type: 'move', t0: cur, t1: cur + dur, from: last, to, arc }); cur += dur; last = to; };
  strokes.forEach((s, i) => {
    const start = { x: s.xs[0], y: s.ys[0], z: 0 };
    const prev = strokes[i - 1];
    if (!prev) move(start, 0.55);
    else if (prev.group !== s.group) { move({ ...OFF }, 0.32); move(start, 0.42); }   // back to the inkstone
    else {
      const d = Math.hypot(start.x - last.x, start.y - last.y);
      move(start, 0.05 + d / 520 + (prev.ci !== s.ci ? 0.08 : 0), 1.5 + d * 0.12);
    }
    s.t0 = cur; s.t1 = cur + s.D;
    s.ts = new Float32Array(s.n); s.gap = new Float32Array(s.n);
    for (let k = 0; k < s.n; k++) { s.ts[k] = s.t0 + s.D * fInv(s.ss[k] / s.L); s.gap[k] = 0.55 + 0.9 * noise(s.ss[k] * 0.22, s.seed); }
    segs.push({ type: 'stroke', s, t0: s.t0, t1: s.t1 });
    cur = s.t1;
    last = { x: s.xs[s.n - 1], y: s.ys[s.n - 1], z: 0 };
  });
  move({ ...OFF }, 0.45, 4);
  const seal = { ...tl.seal, t0: cur + 0.1 };
  seal.press = seal.t0 + 0.38;
  seal.t1 = seal.press + 0.62;

  const plan = { key, chars, strokes, segs, seal, tEnd: seal.t1, hourShow };
  plan.field = buildField(plan);
  return plan;
}

// ------------------------------------------------------------ the field

// Tables for the field build, so it is plain arithmetic on the device:
// sqrt of a squared distance in 1/16 px^2, and -ln(1 - q) for the bleed.
const SQRT16 = Float32Array.from({ length: 1600 }, (_, k) => Math.sqrt(k / 16));
const NLOG = Float32Array.from({ length: 257 }, (_, k) => -Math.log(1 - Math.min(0.97, k / 256)));
// the fibre jitter of the bleed front, per pixel: blotchy plus fibre streaks
const FJN = (() => {
  const a = new Float32Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      a[y * W + x] = (pnoise(x, y, 3, 11) - 0.5) * 1.6 + (rand(x, y >> 1, 12) < 0.12 ? 1.1 : 0) + (rand(x >> 1, y, 13) < 0.08 ? 0.9 : 0);
  return a;
})();

/**
 * The per-pixel field for a sheet. Each stroke is a chain of brush discs
 * (one per 0.6 px sample); a pixel takes the nearest disc's edge distance,
 * time, position along the stroke and side of the centreline. About 200k
 * multiply-adds and table lookups a minute, no transcendental maths.
 */
function buildField(plan) {
  const N = W * H;
  const f = {
    t1: new Float32Array(N).fill(Infinity), a1: new Float32Array(N), l1: new Float32Array(N),
    t2: new Float32Array(N).fill(Infinity), a2: new Float32Array(N), l2: new Float32Array(N),
    hd: new Float32Array(N).fill(Infinity), ht: new Float32Array(N), hw: new Float32Array(N),
    fj: new Float32Array(N), seal: new Uint8Array(N), sealOn: new Uint8Array(N), mask: new Uint8Array(N),
  };
  const HALO = 4.5;
  for (const s of plan.strokes) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, wm = 0;
    for (let k = 0; k < s.n; k++) {
      if (s.xs[k] < x0) x0 = s.xs[k]; if (s.xs[k] > x1) x1 = s.xs[k];
      if (s.ys[k] < y0) y0 = s.ys[k]; if (s.ys[k] > y1) y1 = s.ys[k];
      if (s.ws[k] > wm) wm = s.ws[k];
    }
    const pad = wm / 2 + HALO + 1;
    s.box = [clamp((x0 - pad) | 0, 0, W), clamp((y0 - pad) | 0, 0, H), clamp(((x1 + pad) | 0) + 1, 0, W), clamp(((y1 + pad) | 0) + 1, 0, H)];
    const nst = Math.max(3, (wm * 1.2 + 0.5) | 0);
    const bw = s.box[2] - s.box[0], bh = s.box[3] - s.box[1];
    const BD = new Float32Array(bw * bh).fill(1e9), BK = new Int32Array(bw * bh), BV = new Float32Array(bw * bh);
    for (let k = 0; k < s.n; k++) {
      const cx = s.xs[k], cy = s.ys[k], hw = s.ws[k] / 2, R = hw + HALO + 0.5;
      const ka = k > 0 ? k - 1 : 0, kb = k < s.n - 1 ? k + 1 : s.n - 1;
      let txx = s.xs[kb] - s.xs[ka], tyy = s.ys[kb] - s.ys[ka];
      const tl = SQRT16[Math.min(1599, ((txx * txx + tyy * tyy) * 16) | 0)] || 1; txx /= tl; tyy /= tl;
      const sx0 = clamp((cx - R) | 0, s.box[0], s.box[2]), sx1 = clamp(((cx + R) | 0) + 1, s.box[0], s.box[2]);
      const sy0 = clamp((cy - R) | 0, s.box[1], s.box[3]), sy1 = clamp(((cy + R) | 0) + 1, s.box[1], s.box[3]);
      for (let y = sy0; y < sy1; y++)
        for (let x = sx0; x < sx1; x++) {
          const ex = x + 0.5 - cx, ey = y + 0.5 - cy, d2 = ex * ex + ey * ey;
          if (d2 >= 99.9) continue;
          const d = SQRT16[(d2 * 16) | 0] - hw;
          const j = (y - s.box[1]) * bw + (x - s.box[0]);
          if (d < BD[j]) { BD[j] = d; BK[j] = k; BV[j] = (txx * ey - tyy * ex) / (hw > 0.3 ? hw : 0.3); }
        }
    }
    for (let y = s.box[1]; y < s.box[3]; y++)
      for (let x = s.box[0]; x < s.box[2]; x++) {
        const j = (y - s.box[1]) * bw + (x - s.box[0]);
        const best = BD[j], k = BK[j], bv = BV[j];
        if (best > HALO) continue;
        const i = y * W + x;
        f.mask[i] = 1;
        const arc = s.ss[k] / s.L, bt = s.ts[k];
        if (best < 0.5) {
          const cov = clamp(0.5 - best, 0, 1);
          // flying white: streaks across the stroke, running along it, in its dry latter part
          const streak = ((clamp(bv, -1, 0.999) * 0.5 + 0.5) * nst) | 0;
          const local = s.dry * clamp((arc - 0.25) / 0.5, 0, 1) * s.gap[k];
          const fw = rand(streak, s.seed, 5) < local - 0.1 ? 0.75 : rand(streak, s.seed, 6) < local ? 0.35 : 0;
          const a = s.density * cov * (1 - fw);
          if (bt < f.t1[i]) { f.t2[i] = f.t1[i]; f.a2[i] = f.a1[i]; f.l2[i] = f.l1[i]; f.t1[i] = bt; f.a1[i] = a; f.l1[i] = s.level; }
          else if (bt < f.t2[i]) { f.t2[i] = bt; f.a2[i] = a; f.l2[i] = s.level; }
        }
        if (best > -0.5 && best < f.hd[i]) { f.hd[i] = best > 0 ? best : 0; f.ht[i] = bt; f.hw[i] = s.wet; }
      }
  }
  // the bleed: each pixel near a stroke gets the moment the spreading front
  // reaches it (r(age) = w (0.35 + 2.3 (1 - e^(-age/3.2))) + fibre jitter)
  // and the wash it then takes on, darker at the rim (the tide line)
  for (let i = 0; i < N; i++) {
    if (!f.mask[i] || f.hd[i] > HALO) { f.ht[i] = Infinity; continue; }
    const w = f.hw[i], d = f.hd[i], fj = FJN[i];
    const rmax = w * (2.65 + fj);
    const q = (d / w - fj - 0.35) / 2.3;
    if (q >= 0.97 || d >= rmax) { f.ht[i] = Infinity; continue; }
    f.ht[i] += q <= 0 ? 0 : 3.2 * NLOG[(q * 256) | 0];
    const k = d / (rmax + 0.01);
    f.fj[i] = clamp((0.34 * (1 - k * 0.7) + (k > 0.8 ? 0.1 : 0)) * w, 0, 0.6);
  }
  // the seal impression: white strokes cut into red, the paste a little uneven
  const sl = plan.seal, pat = sl.s === 12 ? SEAL12 : SEAL8;
  for (let j = 0; j < sl.s; j++)
    for (let i = 0; i < sl.s; i++) {
      const x = sl.x + i, y = sl.y + j, k = y * W + x;
      if (x < 0 || x >= W || y < 0 || y >= H) continue;
      const red = pat[j][i] === '#';
      const r = rand(x, y, plan.key);
      f.sealOn[k] = 1; f.mask[k] = 1;
      f.seal[k] = red ? (r < 0.1 ? 6 : r < 0.25 ? 3 : 0) : (r < 0.15 ? 2 : 1);
    }
  return f;
}

// 阴文 seal: a seal-script 日寸 (时) cut white into red.
const SEAL12 = [
  '############',
  '#....###.###',
  '#.##.###.###',
  '#.##.#......',
  '#.##.###.###',
  '#....#.#.###',
  '#.##.#.#.###',
  '#.##.###.###',
  '#.##.###.###',
  '#....#...###',
  '############',
  '############',
].map((r) => (r + '#').slice(0, 12));
const SEAL8 = [
  '########',
  '#..##.##',
  '#..#...#',
  '#..##.##',
  '#..#.#.#',
  '#..##.##',
  '#..#..##',
  '########',
];

// ------------------------------------------------------------ one pixel of the sheet

function sheetPixel(f, i, t, L, plan) {
  let c = L.paper[i];
  if (f.sealOn[i]) {
    if (t >= plan.seal.press) {
      const v = f.seal[i];
      // 0 red, 3 thin red, 6 paper fleck; 1 white cut, 2 cut with a red speck
      const red = L.red;
      c = mixi(c, red, SEAL_A[v]);
    }
    return c;
  }
  if (t >= f.ht[i]) c = mixi(c, L.grey, f.fj[i]);
  if (t >= f.t1[i]) c = mixi(c, inkAt(L, f.l1[i], t - f.t1[i]), f.a1[i]);
  if (t >= f.t2[i]) c = mixi(c, inkAt(L, f.l2[i], t - f.t2[i]), f.a2[i]);
  return c;
}

function inkAt(L, level, age) {
  const c = mixi(L.ink, L.grey, level);
  return age < 2.5 ? mixi(c, L.wet, (1 - age / 2.5) * 0.6 * (1 - level)) : c;
}

// ------------------------------------------------------------ caches (pure functions of their keys)

const planCache = new Map();
function planFor(date) {
  const key = Math.floor(date.getTime() / 60000);
  let p = planCache.get(key);
  if (!p) {
    const d0 = new Date(key * 60000);
    p = buildPlan(d0.getHours(), d0.getMinutes(), key);
    planCache.set(key, p);
    if (planCache.size > 3) planCache.delete(planCache.keys().next().value);
  }
  return p;
}

const sheet = { canvas: new Gfx(W, H), key: '' };
function sheetAt(plan, L, tq) {
  const key = `${plan.key}|${L.key}|${tq}`;
  if (sheet.key === key) return sheet.canvas;
  const f = plan.field, buf = sheet.canvas.buf;
  buf.set(L.canvas.buf);
  for (let i = 0; i < W * H; i++) if (f.mask[i]) buf[i] = to565(sheetPixel(f, i, tq, L, plan));
  sheet.key = key;
  return sheet.canvas;
}

// ------------------------------------------------------------ the brush

function brushAt(plan, sec) {
  for (const sg of plan.segs) {
    if (sec < sg.t0 || sec >= sg.t1) continue;
    const p = (sec - sg.t0) / (sg.t1 - sg.t0);
    if (sg.type === 'move') {
      const e = p * p * (3 - 2 * p);
      const x = lerp(sg.from.x, sg.to.x, e), y = lerp(sg.from.y, sg.to.y, e);
      const z = lerp(sg.from.z, sg.to.z, e) + Math.sin(Math.PI * p) * sg.arc;
      return { x, y, z, w: 1, dx: sg.to.x - sg.from.x, dy: sg.to.y - sg.from.y };
    }
    const s = sg.s, a = fProf(p) * s.L;
    let k = Math.min(s.n - 2, Math.floor(a / (s.L / (s.n - 1))));
    const u = clamp((a - s.ss[k]) / (s.ss[k + 1] - s.ss[k] || 1), 0, 1);
    return {
      x: lerp(s.xs[k], s.xs[k + 1], u), y: lerp(s.ys[k], s.ys[k + 1], u), z: 0,
      w: lerp(s.ws[k], s.ws[k + 1], u), dx: s.xs[k + 1] - s.xs[k], dy: s.ys[k + 1] - s.ys[k], stroke: s,
    };
  }
  return null;
}

function drawBrush(g, b, L) {
  const tx = b.x + 0.3 * b.z, ty = b.y - 0.8 * b.z;
  const dl = Math.hypot(b.dx, b.dy) || 1, mx = b.dx / dl, my = b.dy / dl;
  const press = b.z > 0 ? 0 : clamp(b.w / 4, 0.3, 1.3);
  // shadow on the paper (light from the upper left): a long thin wedge to the lower right
  const sx = b.x + 0.9 * b.z, sy = b.y + 0.35 * b.z, sa = 0.17 * clamp(1 - b.z / 40, 0.3, 1);
  g.fillPolygon([[sx, sy], [sx + 9, sy + 1.5], [sx + 70, sy + 30], [sx + 68, sy + 33], [sx + 8, sy + 4.5]], SHADOW, { a: sa, aa: true });
  // hair: belly dragged behind the motion when pressed, base at the ferrule
  const bx = tx + 2.2, by = ty - 10.5;
  const ex = tx + 0.9 - mx * press * 1.6, ey = ty - 4.2 - my * press * 1.2;
  const tipW = 0.7 + press * 1.4;
  const side = (ax, ay, cx, cy, w) => { const l = Math.hypot(cx - ax, cy - ay) || 1; return [(-(cy - ay) / l) * w, ((cx - ax) / l) * w]; };
  const [n1x, n1y] = side(tx, ty, ex, ey, tipW / 2), [n2x, n2y] = side(tx, ty, bx, by, 2.3), [n3x, n3y] = side(ex, ey, bx, by, 1.8);
  g.fillPolygon([[tx + n1x, ty + n1y], [ex + n2x, ey + n2y], [bx + n3x, by + n3y], [bx - n3x, by - n3y], [ex - n2x, ey - n2y], [tx - n1x, ty - n1y]], HAIR, { aa: true });
  // the inked lower half of the hair
  const qx = lerp(ex, bx, 0.25), qy = lerp(ey, by, 0.25);
  g.fillPolygon([[tx + n1x, ty + n1y], [ex + n2x, ey + n2y], [qx + n2x * 0.95, qy + n2y * 0.95], [qx - n2x * 0.95, qy - n2y * 0.95], [ex - n2x, ey - n2y], [tx - n1x, ty - n1y]], L.ink, { aa: true });
  g.fillCircle(tx, ty, tipW / 2 + 0.2, L.ink, { aa: true });
  // ferrule and bamboo shaft, leaning a little to the right, off the top
  const fx = bx + 0.5, fy = by - 2.6;
  g.thickLine(bx, by, fx, fy, 3.8, FERRULE, { aa: true });
  const topx = fx + 0.24 * (fy + 6), topy = -6;
  g.thickLine(fx, fy, topx, topy, 3.2, BAMBOO, { aa: true });
  g.thickLine(fx - 0.9, fy, topx - 0.9, topy, 0.9, BAMBOO_HI, { a: 0.8, aa: true });
  for (let k = 1; k < 4; k++) {
    const u = (k * 20) / (fy - topy);
    if (u >= 1) break;
    const nx = lerp(fx, topx, u), ny = lerp(fy, topy, u);
    g.thickLine(nx - 1.8, ny + 0.4, nx + 1.8, ny - 0.4, 0.9, BAMBOO_NODE, { aa: true });
  }
}

function drawStone(g, plan, sec) {
  const sl = plan.seal;
  if (sec < sl.t0 || sec >= sl.t1) return;
  let z;
  if (sec < sl.press) { const p = (sec - sl.t0) / (sl.press - sl.t0); z = 22 * (1 - p * p * (3 - 2 * p)); }
  else if (sec < sl.press + 0.2) z = 0;
  else { const p = (sec - sl.press - 0.2) / (sl.t1 - sl.press - 0.2); z = 26 * p * p; }
  const sz = sl.s + 2, cx = sl.x + sl.s / 2 + (sec > sl.press ? z * 0.6 : 0), cy = sl.y + sl.s / 2;
  const k = 1 + z * 0.03, half = (sz * k) / 2;
  const shx = cx + 0.9 * z + 1.2, shy = cy + 0.35 * z + 1.2;
  g.fillRoundRect(shx - sz / 2, shy - sz / 2, sz, sz, 2, SHADOW, { a: 0.28, aa: true });
  const x = cx + 0.3 * z, y = cy - 0.8 * z;
  g.fillRoundRect(x - half, y - half, half * 2, half * 2, 2.2, STONE, { aa: true });
  g.fillRoundRect(x - half + 1, y - half + 1, half * 2 - 3, half * 2 - 3, 1.6, STONE_HI, { a: 0.55, aa: true });
  // a crouching beast carved on top (纽), seen from above
  g.fillEllipse(x + 0.3, y + 0.4, half * 0.55, half * 0.42, STONE_DK, { aa: true });
  g.fillCircle(x - half * 0.35, y - half * 0.2, half * 0.22, STONE_DK, { aa: true });
}

// ------------------------------------------------------------ bamboo shadow

const LEAVES = [
  // [attach u along the twig, angle, length, width, phase]
  [0.05, 1.25, 20, 4.6, 0.0], [0.22, 0.95, 23, 5.0, 1.3], [0.38, 1.45, 18, 4.2, 2.1],
  [0.55, 0.7, 22, 4.8, 3.0], [0.7, 1.15, 19, 4.4, 4.2], [0.86, 0.5, 17, 4.0, 5.1], [1.0, 0.95, 21, 4.6, 0.7],
];

function leafShadow(g, ax, ay, ang, len, wid, a) {
  const c = Math.cos(ang), s = Math.sin(ang);
  const P = (u, v) => [ax + c * u - s * v, ay + s * u + c * v];
  const shape = (k) => [P(-1 * k, 0), P(len * 0.22, wid * 0.5 * k), P(len * 0.6, wid * 0.42 * k), P(len + k, 0), P(len * 0.6, -wid * 0.42 * k), P(len * 0.22, -wid * 0.5 * k)];
  g.fillPolygon(shape(1.45), SHADOW, { a: a * 0.5, aa: true });
  g.fillPolygon(shape(1), SHADOW, { a: a * 0.75, aa: true });
}

function drawBamboo(g, T, hf, sun, night) {
  const a = 0.13 * sun + 0.07 * night * (1 - sun);
  if (a < 0.01) return;
  // the sun walks the sprig across the morning; moonlight leaves it at the left
  const drift = sun > 0 ? (hf - 12) * 2.2 : -10;
  const gust = (noise(T * 0.31, 41) - 0.5) * 2;
  const ax0 = 8 + drift, ay0 = -6, ax1 = 46 + drift, ay1 = 12 + gust * 1.5;
  g.thickLine(ax0 - 20, ay0 - 6, ax1, ay1, 1.4, SHADOW, { a: a * 0.9, aa: true });
  for (const [u, ang, len, wid, ph] of LEAVES) {
    const sway = 0.07 * Math.sin(T * 1.7 + ph * 1.9) + 0.05 * Math.sin(T * 0.63 + ph) + 0.16 * gust * (0.6 + 0.4 * Math.sin(ph));
    leafShadow(g, lerp(ax0, ax1, u), lerp(ay0, ay1, u), ang + sway, len, wid, a);
  }
  // a second sprig, further from the glass and softer, top right
  const bx = 150 + drift * 0.5, by = -4;
  for (let k = 0; k < 3; k++) {
    const sway = 0.09 * Math.sin(T * 1.3 + k * 2.4) + 0.12 * gust;
    leafShadow(g, bx - k * 5, by + k * 2, 1.9 + k * 0.32 + sway, 16 + k * 2, 4, a * 0.6);
  }
}

// ------------------------------------------------------------ the frame

export default {
  name: 'Shufa',
  blurb: 'A brush writes the time in Chinese characters down the columns of a handscroll, stroke by stroke in real order; the ink bleeds into the rice paper, a seal is stamped, and each minute the scroll rolls on.',
  fps: 60,

  frame(g, ctx) {
    const { date, fields: f, night } = ctx;
    ctx.lcd.backlight(1 - 0.65 * night);
    const sec = f.sec;
    const hf = f.h + f.m / 60 + sec / 3600;
    const { tint, sun } = lightAt(f.h + f.m / 60);
    const L = tinted(tint, night);
    const plan = planFor(date);

    // the scroll: at rest, or rolling on to the right with fresh paper behind
    const slide = clamp((sec - SLIDE0) / (SLIDE1 - SLIDE0), 0, 1);
    const off = Math.round((slide * slide * (3 - 2 * slide)) * 162);
    const tq = Math.floor(sec * 10) / 10;
    g.draw(sheetAt(plan, L, tq), off, 0);
    if (off > 0) {
      g.draw(L.canvas, off - 160, 0);
      g.vline(off - 1, 0, H, SHADOW, { a: 0.18 });   // the joint between sheets
      g.vline(off, 0, H, 0xffffff, { a: 0.2 });
    }

    // the stroke under the brush, shaded live so the ink keeps up with it
    const b = off === 0 ? brushAt(plan, sec) : null;
    let bx0 = W, by0 = H, bx1 = 0, by1 = 0;
    for (const s of plan.strokes)
      if (s.t0 <= sec && s.t1 + 0.12 >= tq) {
        bx0 = Math.min(bx0, s.box[0]); by0 = Math.min(by0, s.box[1]); bx1 = Math.max(bx1, s.box[2]); by1 = Math.max(by1, s.box[3]);
      }
    if (bx1 > bx0 && off === 0) {
      const fd = plan.field;
      g.paint((px, py, x, y) => { const i = y * W + x; return fd.mask[i] ? sheetPixel(fd, i, sec, L, plan) : -1; }, [bx0, by0, bx1 - bx0, by1 - by0]);
    }

    // the rolls at either edge
    for (let k = 0; k < 3; k++) {
      g.vline(k, 0, H, SHADOW, { a: 0.16 - k * 0.05 });
      g.vline(W - 1 - k, 0, H, SHADOW, { a: 0.16 - k * 0.05 });
    }

    if (off === 0) drawStone(g, plan, sec);
    if (b) drawBrush(g, b, L);

    drawBamboo(g, date.getTime() / 1000 % 3600, hf, sun, night);
  },
};
