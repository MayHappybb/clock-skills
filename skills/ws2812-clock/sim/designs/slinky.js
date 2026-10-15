// Slinky: three HUB75 panels corner to corner are three treads of an endless
// Penrose staircase, cut in stone. A rainbow slinky walks down it for ever,
// end over end, arching over the black voids between the panels; when it
// leaves the bottom tread it is already arriving on the top one. Hours are
// carved and gilded in the top block, minutes in the bottom one. Every
// minute the slinky pours down over the changing numeral, coils round it
// and squashes it, and springs off leaving the new one standing. On the
// hour a whole parade of slinkies comes down the stairs and one of them
// re-cuts the hour.
import * as kit from '../js/kit.js';
import { MASKS, GW, GH } from './slinky-glyphs.js';
import { W, P, G, buildScene } from './slinky-scene.js';
import { frogEyes } from './slinky-frog.js';

let SCENE = null, SPR = null;
const img = new Float32Array(3 * W * W);

// ---------------------------------------------------------------- numerals
// Gilded incised letters: a sprite per digit with a dark moat (alpha) and
// gold lit on the groove's lower-right wall (light from the upper left).
const SW = GW + 4, SH = GH + 4;
const GOLD = kit.hex('#ffc766'), GOLD_LO = kit.hex('#9a5a1a');
let GLINT = -99;   // x + y of the light sweeping across the gilding
function sprites() {
  const out = [];
  for (let d = 0; d < 10; d++) {
    const m = MASKS[d], M = (x, y) => (x < 0 || y < 0 || x >= GW || y >= GH ? 0 : m[y * GW + x]);
    const rgb = new Float32Array(3 * SW * SH), a = new Float32Array(SW * SH);
    for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
      const gx = x - 2, gy = y - 2, c = M(gx, gy);
      let dil = 0;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) dil = Math.max(dil, M(gx + i, gy + j) * (i && j ? 0.7 : 1));
      const lit = kit.clamp(0.7 + 0.9 * (M(gx - 1, gy - 1) - M(gx + 1, gy + 1)));
      const col = kit.mix(GOLD_LO, GOLD, lit);
      const p = y * SW + x;
      a[p] = Math.min(1, dil * 1.1);
      rgb[3 * p] = col[0] * c; rgb[3 * p + 1] = col[1] * c; rgb[3 * p + 2] = col[2] * c;
    }
    out.push({ rgb, a });
  }
  return out;
}

/** Composite digit d into its cell at (x0, y0), squashed to s (anchored at the base). */
function drawDigit(d, x0, y0, s, alpha) {
  const S = SPR[d], yb = y0 + GH + 2, xc = x0 + GW / 2, wx = 1 + 0.28 * (1 - s);
  const top = Math.floor(yb - SH * s), yEnd = yb + 1;
  const xl = Math.floor(xc - (SW / 2) * wx) - 1, xr = Math.ceil(xc + (SW / 2) * wx) + 1;
  for (let y = Math.max(0, top); y < Math.min(W, yEnd); y++) {
    const sy = SH - (yb - (y + 0.5)) / s - 0.5;
    if (sy < -1 || sy >= SH) continue;
    const y0i = Math.floor(sy), fy = sy - y0i;
    for (let x = Math.max(0, xl); x < Math.min(W, xr); x++) {
      const sx = SW / 2 + (x + 0.5 - xc) / wx - 0.5;
      const x0i = Math.floor(sx), fx = sx - x0i;
      let A = 0, r = 0, g = 0, b = 0;
      for (let k = 0; k < 4; k++) {
        const xi = x0i + (k & 1), yi = y0i + (k >> 1);
        if (xi < 0 || yi < 0 || xi >= SW || yi >= SH) continue;
        const w = ((k & 1) ? fx : 1 - fx) * ((k >> 1) ? fy : 1 - fy), p = yi * SW + xi;
        A += S.a[p] * w; r += S.rgb[3 * p] * w; g += S.rgb[3 * p + 1] * w; b += S.rgb[3 * p + 2] * w;
      }
      if (A <= 0) continue;
      const o = 3 * (y * W + x), k = 1 - A * alpha, e = (x - y * 0.5 - GLINT) / 3;
      const gl = alpha * (1 + 0.9 * Math.exp(-e * e));
      img[o] = img[o] * k + Math.min(1, r * gl); img[o + 1] = img[o + 1] * k + Math.min(1, g * gl); img[o + 2] = img[o + 2] * k + Math.min(1, b * gl);
    }
  }
}
// ----------------------------------------------------------------- slinky
const N = 18, H = 1.05, RX = 6.2, RY = 2.1, MSPAN = 16;
/** Paint over at (x, y) with bilinear weights: a wire sample. */
function dab(x, y, c, a) {
  const xi = Math.floor(x - 0.5), yi = Math.floor(y - 0.5), fx = x - 0.5 - xi, fy = y - 0.5 - yi;
  for (let k = 0; k < 4; k++) {
    const px = xi + (k & 1), py = yi + (k >> 1);
    if (px < 0 || py < 0 || px >= W || py >= W) continue;
    const w = a * ((k & 1) ? fx : 1 - fx) * ((k >> 1) ? fy : 1 - fy), o = 3 * (py * W + px);
    img[o] += (c[0] - img[o]) * w; img[o + 1] += (c[1] - img[o + 1]) * w; img[o + 2] += (c[2] - img[o + 2]) * w;
  }
}
const bez = (a, b, c, d, t) => { const u = 1 - t; return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d; };
const dbez = (a, b, c, d, t) => { const u = 1 - t; return 3 * u * u * (b - a) + 6 * u * t * (c - b) + 3 * t * t * (d - c); };

/** A coil's place on a flight from p0 to p3 (lift above both), at q 0..1. Returns [x, y, tx, ty]. */
function fly(p0x, p0y, p3x, p3y, lift, q) {
  const dx = p3x - p0x;
  const p1x = p0x + 0.12 * dx, p1y = p0y - lift, p2x = p3x - 0.12 * dx, p2y = p3y - lift * 0.85;
  const x = bez(p0x, p1x, p2x, p3x, q), y = bez(p0y, p1y, p2y, p3y, q);
  let tx = dbez(p0x, p1x, p2x, p3x, q), ty = dbez(p0y, p1y, p2y, p3y, q);
  if (Math.hypot(tx, ty) < 1e-3) { tx = 0; ty = -1; }
  return [x, y, tx, ty];
}
const coilQ = (f, r) => kit.smoothstep(0, 1, (f * (N - 1 + MSPAN) - r) / MSPAN);

/** Colour of coil i for a slinky style. */
const STYLES = [
  (i) => kit.hsv(i / N * 0.83, 0.85, 1),                              // the rainbow plastic one
  (i) => kit.mix(kit.hex('#ffd27a'), kit.hex('#c07a2a'), (i & 1) * 0.6),  // brass
  (i) => kit.hsv(0.33 + 0.08 * Math.sin(i), 0.8, 0.95),               // frog green
  (i) => kit.mix(kit.hex('#e8eef8'), kit.hex('#8fa3c0'), (i & 1) * 0.6),  // steel
  (i) => kit.hsv(0.9 - i / N * 0.25, 0.75, 1),                        // sunset
  (i) => kit.hsv(0.5 + i / N * 0.15, 0.8, 1),                         // sea
];

/** A soft shadow on the tread under a pile, weight w (0..1 of the coils). */
function shadow(x, y, w) {
  if (w <= 0.02) return;
  for (let py = Math.floor(y - 4); py <= y + 3; py++) for (let px = Math.floor(x - 10); px <= x + 10; px++) {
    if (px < 0 || py < 0 || px >= W || py >= W) continue;
    const dx = (px + 0.5 - x - 1.5) / 9, dy = (py + 0.5 - y) / 3.2, d = dx * dx + dy * dy;
    if (d >= 1) continue;
    const k = 1 - 0.75 * w * (1 - d), o = 3 * (py * W + px);
    img[o] *= k; img[o + 1] *= k; img[o + 2] *= k;
  }
}
/** A normal step: the pile at A turns end over end onto B, at phase f 0..1. */
function walk(ax, ay, bx, by, f, style, flip) {
  const lift = 12 + 0.28 * Math.hypot(bx - ax, by - ay);
  let inA = 0, inB = 0;
  for (let r = 0; r < N; r++) { const q = coilQ(f, r); inA += q < 0.02 ? 1 : 0; inB += q > 0.98 ? 1 : 0; }
  shadow(ax, ay, inA / N); shadow(bx, by, inB / N);
  for (let r = N - 1; r >= 0; r--) {
    const q = coilQ(f, r), i = N - 1 - r;           // i: the coil's slot in pile A, from the bottom
    const [x, y, tx, ty] = fly(ax, ay - i * H, bx, by - r * H, lift, q);
    coilPart(x, y, tx, ty, RX, STYLES[style](flip ? r : i), 0);
  }
}
/** The digit's squash during a wrap, at phase p 0..1 (p = 2/3 is the minute). */
function squash(p) {
  if (p < 0.22) return 1;
  if (p < 0.58) return 1 - 0.7 * kit.ease.inOut((p - 0.22) / 0.36);
  if (p < 0.72) return 0.3 + 0.025 * Math.sin((p - 0.58) * 90);
  return 0.3 + 0.7 * kit.ease.outElastic(kit.clamp((p - 0.72) / 0.28 * 1.25));
}
/**
 * The turn: the pile at A pours down the front of the block and coils round
 * the numerals spanning x0..x1 (top y0, 34 px tall), squeezes them, then
 * springs off onto B. part 1 draws the back halves of the rings, part 2 the
 * front halves (the numeral goes between).
 */
function wrap(ax, ay, x0, x1, y0, bx, by, p, style, flip, part) {
  const xc = (x0 + x1) / 2, rxw = (x1 - x0) / 2 + 3, yb = y0 + GH + 1.5, s = squash(p);
  const fa = kit.clamp(p / 0.24), fc = kit.clamp((p - 0.72) / 0.28);
  for (let r = N - 1; r >= 0; r--) {
    const i = N - 1 - r, rank2 = N - 1 - r;
    // the coil's slot on the helix round the numeral: the first coil off the pile goes lowest
    const wob = p > 0.22 && p < 0.8 ? 0.6 * Math.sin(p * 40 + r * 0.9) * (1 - Math.abs(p - 0.5) * 2) : 0;
    const hy = yb - 1 - (r / (N - 1)) * (GH + 1) * s + wob;
    let x, y, tx, ty, rx;
    if (p < 0.72) {
      const q = coilQ(fa, r);
      [x, y, tx, ty] = fly(ax, ay - i * H, xc, hy, 8, q);
      rx = kit.lerp(RX, rxw, kit.smoothstep(0.6, 1, q));
    } else {
      const q = coilQ(fc, rank2);
      [x, y, tx, ty] = fly(xc, hy, bx, by - rank2 * H, 14, q);
      rx = kit.lerp(rxw, RX, kit.smoothstep(0, 0.35, q));
    }
    const ry = kit.lerp(RY, 1.0, (rx - RX) / (rxw - RX));
    coilPart(x, y, tx, ty, rx, STYLES[style](flip ? r : i), part, ry);
  }
  return s;
}
function coilPart(cx, cy, tx, ty, rx, col, part, ry = RY) {
  const L = Math.hypot(tx, ty) || 1, vx = -tx / L, vy = -ty / L, ux = -vy, uy = vx;
  const per = kit.TAU * Math.sqrt((rx * rx + ry * ry) / 2), n = Math.ceil(per / 0.6), ds = Math.min(1, (per / n) * 1.25);
  for (let k = 0; k < n; k++) {
    const th = (k / n) * kit.TAU, c = Math.cos(th), s = Math.sin(th), front = s > 0;
    if (part && (part === 2) !== front) continue;
    const sh = front ? 0.75 + 0.25 * Math.max(0, -c) + 0.5 * Math.max(0, -c) ** 6 : 0.38;
    dab(cx + ux * rx * c + vx * ry * s, cy + uy * rx * c + vy * ry * s, [col[0] * sh, col[1] * sh, col[2] * sh], (front ? (part ? 0.6 : 0.95) : part ? 0.22 : 0.6) * ds);
  }
}

// --------------------------------------------------------------- schedule
// A cycle runs from :58 to :58. Step 0 (3 s) is the turn; then 47 steps of
// T s each walk the slinky through the other five stations and round again.
const STEPS = 48, T = 57 / 47;
const station = (s) => { const k = s >> 1, o = s & 1 ? G.D : G.U; return [k * P + o[0], k * P + o[1]]; };
const pad = (n) => String(n).padStart(2, '0');
const hhmm = (sec) => { const d = new Date(sec * 1000); return pad(d.getHours()) + pad(d.getMinutes()); };
/** Every slinky on the stairs now: [{ from, f, style, flip, copies }] (copies: which Penrose halves). */
function slinkies(C, n, f, parade) {
  const G0 = C * STEPS + n, out = [];
  for (let j = 0; j < 6; j++) {
    if (j && parade === null) continue;
    const from = (((4 + n - j) % 6) + 6) % 6;
    let copies = 3;                                   // 1: the leaving half, 2: the arriving half
    if (j) {
      // a parade slinky comes in through the Penrose step and later leaves by it
      const g = G0 - parade, firstIn = (k) => k + ((((j + 1 - k) % 6) + 6) % 6);
      const gin = firstIn(-14), gout = firstIn(14);
      if (g < gin || g > gout) continue;
      if (g === gin) copies = 2; else if (g === gout) copies = 1;
    }
    out.push({ j, from, f, style: j, flip: G0 & 1, copies });
  }
  return out;
}

export default {
  name: 'Slinky',
  blurb: 'Penrose stairs in carved stone; a slinky walks down for ever and re-cuts the numerals it lands on',
  layouts: ['hub-steps'], look: 'smoke', fps: 60, brightness: 0.35, dither: true,
  frame(ctx) {
    if (!SCENE) { SCENE = buildScene(); SPR = sprites(); }
    const now = ctx.date.getTime() / 1000;
    const u = (((now - 58) % 60) + 60) % 60, C = Math.floor((now - 58) / 60), tNew = now - u + 2;
    let n, f;
    if (u < 3) { n = 0; f = u / 3; } else { const k = (u - 3) / T; n = 1 + Math.floor(k); f = k - Math.floor(k); }
    if (n >= STEPS) { n = STEPS - 1; f = 1; }
    const cur = hhmm(now), was = hhmm(tNew - 60), will = hhmm(tNew);
    // the parade: around the hour, keyed by the step count of the hour's turn
    const thisHour = will.slice(2) === '00', nextHour = hhmm(tNew + 60).slice(2) === '00';
    const parade = thisHour ? C * STEPS : nextHour && n > STEPS - 16 ? (C + 1) * STEPS : null;

    img.set(SCENE.img);
    GLINT = ((now / 11) % 1) * 360 - 120;
    const list = slinkies(C, n, f, parade);
    // which numerals are being wrapped this turn
    const wraps = [];
    if (n === 0) for (const sl of list) {
      const blk = sl.from === 4 ? 2 : sl.from === 0 ? 0 : -1;
      if (blk < 0) continue;
      const o = blk ? 2 : 0, ch = [0, 1].filter((k) => was[o + k] !== will[o + k]);
      if (!ch.length) continue;
      const c0 = G.cells[ch[0]], c1 = G.cells[ch[ch.length - 1]], off = blk * P;
      wraps.push({ sl, blk, ch, x0: off + c0[0], x1: off + c1[0] + GW, y0: off + c0[1] });
      sl.wrapped = true;
    }
    const sq = [1, 1, 1, 1];
    for (const w of wraps) {
      const [ax, ay] = station(w.sl.from), [bx, by] = station(w.sl.from + 1);
      const s = wrap(ax, ay, w.x0, w.x1, w.y0, bx, by, f, w.sl.style, w.sl.flip, 1);
      for (const k of w.ch) sq[w.blk + k] = s;      // blk 0 -> slots 0,1; blk 2 -> slots 2,3
    }
    for (let k = 0; k < 4; k++) {
      const blk = k < 2 ? 0 : 2, c = G.cells[k & 1];
      drawDigit(+cur[k], blk * P + c[0], blk * P + c[1], sq[k], sq[k] < 0.5 ? 0.55 + 0.9 * (sq[k] - 0.3) : 1);
    }
    for (const w of wraps) {
      const [ax, ay] = station(w.sl.from), [bx, by] = station(w.sl.from + 1);
      wrap(ax, ay, w.x0, w.x1, w.y0, bx, by, f, w.sl.style, w.sl.flip, 2);
    }
    for (const sl of list) {
      if (sl.wrapped) continue;
      const [ax, ay] = station(sl.from), [bx, by] = station((sl.from + 1) % 6);
      if (sl.from !== 5) { walk(ax, ay, bx, by, f, sl.style, sl.flip); continue; }
      // the Penrose step: off the bottom tread and onto the top one at once
      if (sl.copies & 1) walk(ax, ay, bx + W, by + W, f, sl.style, sl.flip);
      if (sl.copies & 2) walk(ax - W, ay - W, bx, by, f, sl.style, sl.flip);
    }
    // the frog watches the rainbow slinky (its stack top, roughly)
    const m0 = list[0], [sx, sy] = station(m0.from), [ex, ey] = station((m0.from + 1) % 6);
    const k = kit.smoothstep(0.2, 0.8, f), wx = m0.from === 5 ? (k < 0.5 ? sx + 20 : ex - 20) : kit.lerp(sx, ex, k);
    const wy = (m0.from === 5 ? (k < 0.5 ? sy + 20 : ey - 20) : kit.lerp(sy, ey, k)) - 10;
    const bt = now % 4.7, blink = bt < 0.22 ? Math.sin((bt / 0.22) * Math.PI) : 0;
    frogEyes(img, W, P, P, wx, wy, blink);
    kit.blitGrid(ctx, img, 1 - 0.6 * ctx.night);
  },
};
