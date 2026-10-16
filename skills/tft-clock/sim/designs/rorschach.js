// Rorschach: every minute a new inkblot card is made in front of you, and
// what you see in it is the time.
//
// The minute, as a process (a monoprint, not a font):
//   :00.1  ink is poured along the crease of a blank card: five drops fall
//          (seen from above: a soft out-of-focus disc that shrinks onto its
//          shadow) and splat into the spine of the blot.
//   :00.9  drops fall onto the right wing, two or three per numeral, each
//          throwing satellite spatter; from each splat the ink RUNS along
//          the stroke (a geodesic arrival map) until the numeral is whole.
//   :03.2  the left half of the card lifts off the table and folds over in
//          perspective (front face, then its back), presses (the ink soaks
//          faintly through the back, a hand smooths it), and peels open.
//   :06.4  the card lies open: a symmetric blot. The ink that was squeezed
//          out grows into a living central body (lobes in the margins, arms
//          in the gap between the rows) that never stops morphing, always
//          mirror-symmetric. The numerals' wet sheen dries over the minute.
//   :57.4  the examiner slides the card away to the left; a blank one is
//          underneath, and the next minute's ink is poured on it.
//
// How to read it: the right wing is the original ink, solid and glossy:
// hours over minutes (HH on top, MM below). The left wing is the print the
// fold made, mirrored, lighter and grainy where the paper's tooth took the
// ink. Read the side that is solid.
//
// The ten cards: the card's palette is the real deck's, picked by the last
// digit of the minute (1 = card I ... 9 = IX, 0 = X). I and V are black;
// II and III add red; IV, VI and VII are grey and brown washes; VIII, IX
// and X are the pastel colour cards (the numerals then take a deep shade,
// and on X each numeral its own colour). Night (23-07) dims the backlight.
//
// Hard or AA: every edge is a level set of a distance or metaball field,
// so every edge is anti-aliased from the field's own value. The falling
// drops are kit AA circles.
//
// Cost (C port): ink fields are built once a minute (rorschach-ink.js);
// per frame, a 21x21 metaball grid (14 balls, mirrored), then one pass
// over the glass with table lookups and one blend or two per pixel. The
// fold pass inverse-maps columns (one divide per column).
import { clamp, progress, ease, sin as ksin } from '../js/kit.js';
import { inkFor, WW } from './rorschach-ink.js';

const W = 160, H = 80, N = W * H;
const RUN = 42;
const FOLD0 = 3.2, PRESS0 = 4.3, PRESS1 = 5.15, OPEN1 = 6.5, SLIDE0 = 57.4, SLIDE1 = 59.4;
const DCAM = 260;   // camera height over the card, px

// ------------------------------------------------------------ colour
const rgbOf = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const BLACK = 0x17131b, RED = 0xb4241e;
const CARDS = [
  null,
  { name: 'I', ink: [BLACK], body: [BLACK, BLACK, BLACK], dens: [0.96, 0.96, 0.96], mot: 0.10 },
  { name: 'II', ink: [BLACK], body: [BLACK, BLACK, RED], dens: [0.96, 0.96, 0.92], mot: 0.10 },
  { name: 'III', ink: [BLACK], body: [BLACK, RED, BLACK], dens: [0.96, 0.92, 0.96], mot: 0.10 },
  { name: 'IV', ink: [BLACK], body: [0x2e2624, 0x3a302c, 0x2e2624], dens: [0.9, 0.85, 0.9], mot: 0.38 },
  { name: 'V', ink: [BLACK], body: [BLACK, BLACK, BLACK], dens: [0.96, 0.96, 0.96], mot: 0.14 },
  { name: 'VI', ink: [BLACK], body: [0x46382e, 0x564436, 0x46382e], dens: [0.82, 0.75, 0.8], mot: 0.42 },
  { name: 'VII', ink: [BLACK], body: [0x5c5862, 0x6a6470, 0x5c5862], dens: [0.62, 0.55, 0.6], mot: 0.4 },
  { name: 'VIII', ink: [0x6a1838], body: [0xdc6f8e, 0xe88e4a, 0x6a90b8], dens: [0.9, 0.9, 0.85], mot: 0.22 },
  { name: 'IX', ink: [0x1a4836], body: [0xe2893e, 0x74aa62, 0xd8708f], dens: [0.9, 0.88, 0.88], mot: 0.24 },
  { name: 'X', ink: [0x1c3876, 0x8a1a2c, 0x20562a, 0x6a3410], body: [0xe8be3c, 0x5c96d2, 0xe47aa4], dens: [0.92, 0.9, 0.88], mot: 0.2 },
];
const CARD_RGB = CARDS.map((c) => c && { ...c, inkRGB: c.ink.map(rgbOf), bodyRGB: c.body.map(rgbOf) });
const SHEEN = rgbOf(0xa4acbe);

const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
function d565(r, g, b, x, y) {
  const t = (BAY[((y & 3) << 2) | (x & 3)] + 0.5) / 16;
  let R5 = (r * 0.12157 + t) | 0, G6 = (g * 0.24706 + t) | 0, B5 = (b * 0.12157 + t) | 0;
  R5 = R5 < 0 ? 0 : R5 > 31 ? 31 : R5; G6 = G6 < 0 ? 0 : G6 > 63 ? 63 : G6; B5 = B5 < 0 ? 0 : B5 > 31 ? 31 : B5;
  return (R5 << 11) | (G6 << 5) | B5;
}

// ------------------------------------------------------------ static textures (built once)
function h32(x, y, s) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(s | 0, 0x1b873593);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d); h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}
function vnoise(x, y, s) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = h32(ix, iy, s), b = h32(ix + 1, iy, s), c = h32(ix, iy + 1, s), d = h32(ix + 1, iy + 1, s);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
const PR = new Float32Array(N), PG = new Float32Array(N), PB = new Float32Array(N);
const GRAIN = new Float32Array(N), TOOTH = new Float32Array(N), MOT = new Float32Array(N);
const TABLE = new Float32Array(N * 3);
(function textures() {
  const base = rgbOf(0xefe8d8);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const fib = (vnoise(x * 0.8, y * 0.22, 3) - 0.5) * 5 + (h32(x, y, 9) - 0.5) * 4;
      const vx = (x - 80) / 80, vy = (y - 40) / 40;
      const vig = 1 - 0.055 * (vx * vx + vy * vy) - 0.025 * (x / 160 + y / 80);
      PR[i] = base[0] * vig + fib; PG[i] = base[1] * vig + fib; PB[i] = base[2] * vig + fib * 0.9;
      GRAIN[i] = vnoise(x * 0.9, y * 0.9, 17) * 0.7 + h32(x, y, 23) * 0.3;
      TOOTH[i] = vnoise(x * 1.3, y * 1.3, 41) * 0.55 + h32(x, y, 43) * 0.45;
      MOT[i] = vnoise(x * 0.16, y * 0.16, 51) * 0.6 + vnoise(x * 0.45, y * 0.45, 52) * 0.4;
      // walnut desk under the card
      const gr = vnoise(x * 0.04, y * 0.55, 61) * 0.7 + vnoise(x * 0.2, y * 1.6, 62) * 0.3;
      const k = 0.72 + 0.5 * gr;
      TABLE[i * 3] = 0x3a * k; TABLE[i * 3 + 1] = 0x27 * k; TABLE[i * 3 + 2] = 0x1b * k;
    }
})();

// scratch
const FLAT = new Uint16Array(N);
const GX = 21, GY = 21, CELL = 4;
const F0 = new Float32Array(GX * GY), F1 = new Float32Array(GX * GY), F2 = new Float32Array(GX * GY);

/** Card number for a minute: its last digit, 0 = X. */
const cardOf = (m) => (m % 10) || 10;

function ballState(b, sec, T) {
  // radius now, and position
  let r = 0;
  const A = progress(sec, 5.6, 10);
  if (b.kind === 'spine') {
    if (sec >= b.land) r = b.r0 * ease.outCubic(progress(sec, b.land, b.land + 0.25));
    if (sec >= PRESS0) r = b.r1;
  } else if (sec >= PRESS0) r = b.r1;
  if (r <= 0) return null;
  const TAU = 6.283185;
  const u = b.u + A * b.au * ksin(TAU * T / b.pu + b.phu);
  const y = b.y + A * b.ay * ksin(TAU * T / b.py + b.phy);
  r *= 1 + 0.14 * A * ksin(TAU * T / (b.pu * 1.37) + b.phy);
  return [u < 0 ? -u : u, y, r * r, b.grp];
}

export default {
  name: 'Rorschach',
  blurb: 'Each minute ink is dropped on a card, folded and pressed; the symmetric blot that opens is the time (right wing original, left the mirrored print).',
  fps: 60,

  frame(g, ctx) {
    const f = ctx.fields, sec = f.sec;
    const T = (f.h * 3600 + f.m * 60 + sec) % 86400;
    ctx.lcd.backlight(1 - 0.62 * ctx.night);
    const card = CARD_RGB[cardOf(f.m)];
    const ink = inkFor(f.hh + f.mm, f.minuteKey);
    const { SDW, SDP, ARR, LIT } = ink;
    if (ink.fresh) g.cost.box += ink.work;   // the once-a-minute merge
    const pressed = sec >= PRESS0;
    const wet = pressed ? 1 - progress(sec, 8, 45) : 1;
    const buf = g.buf;
    let blends = 0, shaded = 0;

    // ---- body field on a coarse grid (wing coords; mirrored balls)
    const balls = [];
    for (const b of ink.balls) { const s = ballState(b, sec, T); if (s) balls.push(s); }
    F0.fill(0); F1.fill(0); F2.fill(0);
    if (balls.length) {
      for (let j = 0; j < GY; j++)
        for (let i = 0; i < GX; i++) {
          const U = i * CELL, Y = j * CELL;
          let a0 = 0, a1 = 0, a2 = 0;
          for (const [bu, by, r2, gp] of balls) {
            const dy = Y - by, d1 = U - bu, d2 = U + bu;
            const v = r2 / (d1 * d1 + dy * dy + 1) + r2 / (d2 * d2 + dy * dy + 1);
            if (gp === 0) a0 += v; else if (gp === 1) a1 += v; else a2 += v;
          }
          const k = j * GX + i;
          F0[k] = a0; F1[k] = a1; F2[k] = a2;
        }
      shaded += GX * GY * Math.ceil(balls.length / 3);
    }

    // ---- the flat card: right wing original, left wing print, shared body
    const iR = card.inkRGB, bR = card.bodyRGB, bD = card.dens, mot = card.mot;
    for (let y = 0; y < H; y++) {
      const fy = (y + 0.5) / CELL, j0 = fy | 0, vy = fy - j0, j1 = j0 + 1 < GY ? j0 + 1 : j0;
      for (let u = 0; u < WW; u++) {
        const wi = y * WW + u;
        // body (same on both wings)
        const fx = (u + 0.5) / CELL, i0 = fx | 0, vx = fx - i0;
        const k00 = j0 * GX + i0, k10 = k00 + 1, k01 = j1 * GX + i0, k11 = k01 + 1;
        const w00 = (1 - vx) * (1 - vy), w10 = vx * (1 - vy), w01 = (1 - vx) * vy, w11 = vx * vy;
        const g0 = F0[k00] * w00 + F0[k10] * w10 + F0[k01] * w01 + F0[k11] * w11;
        const g1 = F1[k00] * w00 + F1[k10] * w10 + F1[k01] * w01 + F1[k11] * w11;
        const g2 = F2[k00] * w00 + F2[k10] * w10 + F2[k01] * w01 + F2[k11] * w11;
        const sdp = SDP[wi];
        let clr = (sdp - 1.2) * 0.4; clr = clr < 0 ? 0 : clr > 1 ? 1 : clr;
        const ft = (g0 + g1 + g2) * clr;
        const xr = 80 + u, xl = 79 - u;
        const gi = y * W + xr;
        const thr = 1 + 0.5 * (GRAIN[gi] - 0.5);
        let bc = (ft - thr) * 2.5 + 0.5; bc = bc < 0 ? 0 : bc > 1 ? 1 : bc;
        let br = 0, bg = 0, bb = 0, ba = 0;
        if (bc > 0) {
          const q0 = g0 * g0, q1 = g1 * g1, q2 = g2 * g2, qs = q0 + q1 + q2 || 1;
          br = (bR[0][0] * q0 + bR[1][0] * q1 + bR[2][0] * q2) / qs;
          bg = (bR[0][1] * q0 + bR[1][1] * q1 + bR[2][1] * q2) / qs;
          bb = (bR[0][2] * q0 + bR[1][2] * q1 + bR[2][2] * q2) / qs;
          const dn = (bD[0] * q0 + bD[1] * q1 + bD[2] * q2) / qs;
          let rim = 1 - (ft - thr) * 1.3; rim = rim < 0 ? 0 : rim;
          ba = bc * (dn * (1 - mot * MOT[gi]) + 0.1 * rim);
          if (ba > 1) ba = 1;
        }
        // numerals
        const slot = (y >= 40 ? 2 : 0) + (u >= 40 ? 1 : 0);
        const ic = iR.length > 1 ? iR[slot] : iR[0];
        let dc;
        if (pressed) { dc = 0.5 - sdp; dc = dc < 0 ? 0 : dc > 1 ? 1 : dc; }
        else {
          dc = 0.5 - SDW[wi]; dc = dc < 0 ? 0 : dc > 1 ? 1 : dc;
          if (dc > 0) { let gt = (sec - ARR[wi]) * RUN + 0.5; gt = gt < 0 ? 0 : gt > 1 ? 1 : gt; dc *= gt; }
        }
        // right pixel
        {
          let r = PR[gi], gg = PG[gi], b = PB[gi];
          if (ba > 0) { r += (br - r) * ba; gg += (bg - gg) * ba; b += (bb - b) * ba; blends++; }
          if (dc > 0) {
            const sd = pressed ? sdp : SDW[wi];
            let rim = 1 + sd * 0.6; rim = rim < 0 ? 0 : rim;
            let a = dc * (0.95 - 0.12 * MOT[gi] + 0.06 * rim); if (a > 1) a = 1;
            r += (ic[0] - r) * a; gg += (ic[1] - gg) * a; b += (ic[2] - b) * a;
            const sh = LIT[wi] * wet * 0.55 * dc;
            if (sh > 0) { r += (SHEEN[0] - r) * sh; gg += (SHEEN[1] - gg) * sh; b += (SHEEN[2] - b) * sh; }
            blends++;
          }
          buf[gi] = d565(r, gg, b, xr, y);
        }
        // left pixel: the print
        {
          const li = y * W + xl;
          let r = PR[li], gg = PG[li], b = PB[li];
          if (ba > 0) { r += (br - r) * ba; gg += (bg - gg) * ba; b += (bb - b) * ba; blends++; }
          if (pressed) {
            let pc = 0.5 - sdp; pc = pc < 0 ? 0 : pc > 1 ? 1 : pc;
            if (pc > 0) {
              const tt = TOOTH[li];
              const a = pc * (tt > 0.62 ? 0.2 : 0.5 + 0.18 * tt) * (1 - 0.15 * MOT[li]);
              r += (ic[0] - r) * a; gg += (ic[1] - gg) * a; b += (ic[2] - b) * a;
              blends++;
            }
          }
          buf[li] = d565(r, gg, b, xl, y);
        }
      }
    }
    g.cost.px += N; g.cost.dither += N; g.cost.box += N * 8;

    // ---- the fold
    let theta = 0;
    if (sec >= FOLD0 && sec < PRESS0) theta = Math.PI * ease.inOutCubic(progress(sec, FOLD0, PRESS0));
    else if (sec >= PRESS0 && sec < PRESS1) theta = Math.PI;
    else if (sec >= PRESS1 && sec < OPEN1) theta = Math.PI * (1 - ease.inOutCubic(progress(sec, PRESS1, OPEN1)));
    if (theta > 0.001) blends += fold(g, theta, sec);

    // ---- falling drops
    if (sec < 3.0) drawDrops(g, ink, card, sec);

    // ---- the card slides away
    if (sec >= SLIDE0) blends += slide(g, sec);

    g.cost.blend += blends; g.cost.shade += shaded;
  },
};

// ------------------------------------------------------------ fold
function fold(g, theta, sec) {
  const buf = g.buf;
  FLAT.set(buf);
  const st = Math.sin(theta), ct = Math.cos(theta);
  let n = 0;
  // desk under the lifted half, darker near the crease (occlusion)
  for (let y = 0; y < H; y++)
    for (let x = 0; x < 80; x++) {
      const i = y * W + x;
      let k = 0.45 + 0.55 * (80 - x) / 40; k = k > 1 ? 1 : k;
      k *= 0.55 + 0.45 * (1 - st * 0.5);
      buf[i] = d565(TABLE[i * 3] * k, TABLE[i * 3 + 1] * k, TABLE[i * 3 + 2] * k, x, y);
    }
  // contact shadow on the right wing, just beyond the flap's projected edge
  const xsh = 80 - 80 * ct + 12 * st;
  if (xsh > 80) {
    for (let y = 0; y < H; y++)
      for (let x = 80; x < W && x < xsh + 4; x++) {
        let k = (xsh - x) / 4; k = k < 0 ? 0 : k > 1 ? 1 : k;
        const s = 1 - 0.34 * k;
        const i = y * W + x, c = FLAT[i];
        buf[i] = shade565(c, s);
        n++;
      }
  }
  // the flap: inverse-map each column to a distance d from the crease
  const front = ct > 0;
  // light from the front, a little right: a lifting flap turns its face to it then away
  const lit = front ? (0.3 * st + 0.93 * ct) / 0.93 : (-0.3 * st - 0.93 * ct) / 0.93;
  const shadeF = clamp(0.25 + 0.75 * lit, 0.4, 1);
  const ghost = sec >= PRESS0 ? 0.24 * progress(sec, PRESS0, PRESS1 - 0.2) : 0;
  const rubX = sec >= PRESS0 && sec < PRESS1 ? 80 + 96 * progress(sec, PRESS0 + 0.05, PRESS1 - 0.05) - 8 : -99;
  const back = rgbOf(0xd8cfba);
  for (let sx = 0; sx < W; sx++) {
    const q = sx + 0.5 - 80;
    const den = q * st - DCAM * ct;
    if (den > -1e-6 && den < 1e-6) continue;
    const d = (q * DCAM) / den;
    if (!(d >= 0 && d < 80)) continue;
    const s = DCAM / (DCAM - d * st);
    const di = d | 0;
    // outer edge: a thin darker lip so the paper has a thickness
    const lip = d > 78.8 ? 0.82 : 1;
    for (let sy = 0; sy < H; sy++) {
      const yy = 40 + (sy + 0.5 - 40) / s;
      if (yy < 0 || yy >= 80) continue;
      const iy = yy | 0;
      const elip = yy < 0.8 || yy > 79.2 ? 0.85 : 1;
      const o = sy * W + sx;
      if (front) {
        buf[o] = shade565(FLAT[iy * W + (79 - di)], shadeF * lip * elip);
      } else {
        // back of the card, the press soaking through (that ink sits at x = 80 + d)
        let r = back[0], gg = back[1], b = back[2];
        const fib = (PR[iy * W + 79 - di] - 0xef) * 0.8;
        r += fib; gg += fib; b += fib;
        if (ghost > 0) {
          const c = FLAT[iy * W + 80 + di];
          const cr = ((c >> 11) & 31) * 8.2, cg = ((c >> 5) & 63) * 4.05, cb = (c & 31) * 8.2;
          r += (cr - r) * ghost; gg += (cg - gg) * ghost; b += (cb - b) * ghost;
        }
        let k = shadeF * lip * elip;
        if (rubX > -50) { const e = (sx - rubX) / 9; if (e > -1 && e < 1) k *= 1 + 0.07 * (1 - e * e); }
        buf[o] = d565(r * k, gg * k, b * k, sx, sy);
      }
      n++;
    }
  }
  g.cost.box += N * 2;
  return n;
}

function shade565(c, s) {
  const r = (((c >> 11) & 31) * s + 0.5) | 0, gg = (((c >> 5) & 63) * s + 0.5) | 0, b = ((c & 31) * s + 0.5) | 0;
  return ((r > 31 ? 31 : r) << 11) | ((gg > 63 ? 63 : gg) << 5) | (b > 31 ? 31 : b);
}

// ------------------------------------------------------------ drops
function drawDrops(g, ink, card, sec) {
  const FALL = 0.42;
  for (const d of ink.drops) {
    if (sec < d.land - FALL || sec >= d.land + 0.06) continue;
    const x = 80 + d.u, y = d.y;
    const col = d.slot < 0 ? card.body[0] : card.ink.length > 1 ? card.ink[d.slot] : card.ink[0];
    if (sec >= d.land) {
      // the splash ring, a few frames
      const p = (sec - d.land) / 0.06;
      g.ring(x, y, 2 + 4 * p, 2.6 + 4 * p, col, { aa: true, a: 0.5 * (1 - p) });
      continue;
    }
    const h = (d.land - sec) / FALL;           // 1 high, 0 landing
    const hh = h * h;
    g.fillCircle(x + 7 * h, y + 5 * h, 1.5 + 1.6 * h, 0x2a2018, { aa: true, a: 0.16 + 0.14 * (1 - h) });
    const px = x + (x - 80) * 0.35 * hh, py = y + (y - 40) * 0.35 * hh;
    const r = (1.3 + 4.2 * hh) * d.size;
    g.fillCircle(px, py, r, col, { aa: true, a: 0.95 - 0.55 * hh });
    if (h < 0.75) g.fillCircle(px - r * 0.35, py - r * 0.35, r * 0.3, 0xd8dde8, { aa: true, a: 0.5 * (1 - h) });
  }
}

// ------------------------------------------------------------ slide
function slide(g, sec) {
  const buf = g.buf;
  const p = progress(sec, SLIDE0, SLIDE1);
  const off = Math.round(172 * (p * p * (1.2 - 0.2 * p)));
  if (off <= 0) return 0;
  const edge = W - off;   // old card's right edge
  let n = 0;
  for (let y = 0; y < H; y++) {
    const row = y * W;
    for (let x = 0; x < W; x++) {
      const o = row + x;
      if (x < edge) buf[o] = buf[o + off];
      else {
        let k = 1;
        const e = x - edge;
        if (e < 7 && edge > -2) k = 0.7 + 0.3 * (e / 7);
        buf[o] = d565(PR[o] * k, PG[o] * k, PB[o] * k, x, y);
        n++;
      }
    }
  }
  g.cost.px += N;
  return n;
}
