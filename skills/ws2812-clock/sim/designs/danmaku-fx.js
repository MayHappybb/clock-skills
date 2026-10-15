// Danmaku: the frog's ship, the boss's bullet patterns, the bomb and the
// SPELL CARD banner. All closed-form in T (seconds of the local day).
import * as kit from '../js/kit.js';
import { W, H, CX, CY, bg, orb } from './danmaku-draw.js';
import { LETTERS } from './danmaku-glyphs.js';

// ---------------------------------------------------------------- frog
// The frog, drawn procedurally at 22 x 23: a chunky body outlined in mint,
// a green head with a wide black smile, flat rainbow bands below, and two big
// white-rimmed round glasses on top.
const FW = 22, FH = 23;
const SPR = new Float32Array(FW * FH * 4);
{
  const C = {
    L: kit.scale(kit.hex('#9dffc8'), 0.55), G: kit.hex('#2fd44a'), R: kit.hex('#ff2a2a'), O: kit.hex('#ff8a1a'), Y: kit.hex('#ffe02a'),
    B: kit.hex('#2a7cff'), V: kit.hex('#a040ff'), W: [1, 1, 1], e: [0.004, 0.01, 0.02], k: [0, 0, 0], P: [1, 0.95, 0.75],
  };
  const band = (y) => (y <= 12 ? 'G' : y <= 14 ? 'R' : y <= 16 ? 'O' : y <= 18 ? 'Y' : y <= 20 ? 'B' : 'V');
  const inBody = (x, y) => Math.abs((x - 10.5) / 11) ** 3 + Math.abs((y - 15) / 7.6) ** 3 <= 1;
  const put = (x, y, ch) => { const o = 4 * (y * FW + x), c = C[ch]; SPR[o] = c[0]; SPR[o + 1] = c[1]; SPR[o + 2] = c[2]; SPR[o + 3] = 1; };
  for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
    if (inBody(x, y)) {
      const edge = !inBody(x - 1, y) || !inBody(x + 1, y) || !inBody(x, y - 1) || !inBody(x, y + 1);
      put(x, y, edge ? 'L' : band(y));
      const sm = 11.4 - 0.05 * (x - 10.5) ** 2;                    // the smile
      if (!edge && x >= 5 && x <= 16 && Math.abs(y - sm) < 0.75) put(x, y, 'k');
    }
    for (const ex of [5, 16]) {                                      // the glasses
      const d = Math.hypot(x - ex, y - 4.5);
      if (d < 4.6 && d >= 3.35) put(x, y, 'W');
      else if (d < 3.35) put(x, y, Math.hypot(x - ex - 0.5, y - 5.2) < 1.3 ? 'P' : 'e');
    }
    if (y === 4 && x >= 9 && x <= 12) put(x, y, 'W');                // bridge
  }
}

/**
 * Where the frog is. The plus has no corners, so the ship holds station in
 * one of the four gaps between the boss and a numeral, weaving, then swoops a
 * quarter turn to the next gap (tighter on the diagonal, over the boss's rim).
 */
export function frogPos(T) {
  const u = T / 11, n = Math.floor(u), f = u - n;
  const th = (Math.PI / 2) * (n + kit.smoothstep(0.68, 1, f)) + Math.PI / 2 + 0.11 * Math.sin((kit.TAU * T) / 3.7);
  const s2 = Math.abs(Math.sin(2 * th));
  const R = 36 - 6.5 * s2 - 2.5 * Math.sin(th) ** 2 - 1.2 * (1 + Math.sin((kit.TAU * T) / 2.9));
  return [CX + R * Math.cos(th), CY + R * Math.sin(th), th];
}
/** Paint the frog with bilinear coverage at (fx, fy) (its centre), over the ground. */
export function drawFrog(fx, fy, T, dim) {
  const ox = fx - FW / 2 + 0.5, oy = fy - FH / 2 + 0.5;
  // dark keyline: push the ground down round the ship
  for (let py = Math.floor(oy - 2); py <= oy + FH + 1; py++) {
    if (py < 0 || py >= H) continue;
    for (let px = Math.floor(ox - 2); px <= ox + FW + 1; px++) {
      if (px < 0 || px >= W) continue;
      const u = (px - fx) / (FW / 2 + 1.5), v = (py - fy) / (FH / 2 + 1.5), k = kit.clamp(1.6 - Math.sqrt(u * u + v * v) * 1.4);
      const o = 3 * (py * W + px);
      bg[o] *= 1 - 0.85 * k; bg[o + 1] *= 1 - 0.85 * k; bg[o + 2] *= 1 - 0.85 * k;
    }
  }
  for (let py = Math.floor(oy); py <= oy + FH; py++) {
    if (py < 0 || py >= H) continue;
    const sy = py - oy, jy = Math.floor(sy), fy2 = sy - jy;
    for (let px = Math.floor(ox); px <= ox + FW; px++) {
      if (px < 0 || px >= W) continue;
      const sx = px - ox, jx = Math.floor(sx), fx2 = sx - jx;
      let r = 0, g = 0, b = 0, a = 0;
      for (let q = 0; q < 4; q++) {
        const xx = jx + (q & 1), yy = jy + (q >> 1);
        if (xx < 0 || yy < 0 || xx >= FW || yy >= FH) continue;
        const w = ((q & 1) ? fx2 : 1 - fx2) * ((q >> 1) ? fy2 : 1 - fy2), o = 4 * (yy * FW + xx);
        r += SPR[o] * w; g += SPR[o + 1] * w; b += SPR[o + 2] * w; a += SPR[o + 3] * w;
      }
      if (a <= 0) continue;
      const o = 3 * (py * W + px);
      bg[o] = bg[o] * (1 - a) + r * dim; bg[o + 1] = bg[o + 1] * (1 - a) + g * dim; bg[o + 2] = bg[o + 2] * (1 - a) + b * dim;
    }
  }
  // twin engine flames under the ship
  const fl = 0.6 + 0.4 * Math.sin(T * 37) * Math.sin(T * 23);
  orb(bg, fx - 5, fy + FH / 2 + 1.2, 1.1, kit.hex('#4ad8ff'), 0.6 * fl * dim, 0.5, 0.6);
  orb(bg, fx + 5, fy + FH / 2 + 1.2, 1.1, kit.hex('#4ad8ff'), 0.6 * fl * dim, 0.5, 0.6);
}

// ------------------------------------------------------------- patterns
const VIO = kit.hex('#b070ff'), AMB = kit.hex('#ffa040'), MINT = kit.hex('#40ffc0'), PINK = kit.hex('#b8ff50'), SUN = kit.hex('#ffd060');
// Each pattern: emission interval dt, bullets per emission n, speed, colour, angle(te, k, tau)
const P = [
  { dt: 0.055, n: 6, v: 24, c: VIO, r: 1.3, ang: (te, k, tau) => (k * kit.TAU) / 6 + (kit.TAU * te) / 3 },
  { dt: 0.6, n: 50, v: 22, c: PINK, r: 1.3, ang: (te, k, tau) => (k * kit.TAU) / 50 + (kit.TAU * te) / 60 + 0.12 * tau, sp: (k) => 1 + 0.22 * Math.cos(5 * (k * kit.TAU) / 50) },
  { dt: 0.3, n: 12, v: 20, c: MINT, r: 1.2, ang: (te, k, tau) => (k * kit.TAU) / 12 + 0.55 * tau + (kit.TAU * te) / 20 },
  { dt: 0.5, n: 56, v: 21, c: AMB, r: 1.3, ang: (te, k, tau) => (k * kit.TAU) / 56 + ((Math.round(te / 0.5) & 1) ? 0.22 : -0.22) * tau },
];
const SPELL = { dt: 0.07, n: 16, v: 26, c: SUN, r: 1.4, ang: (te, k, tau) => (k * kit.TAU) / 14 + (kit.TAU * te) / 4 + 0.4 * Math.sin(tau * 2.2 + k) };
const LIFE = 4.6;
/** Which pattern an emission at te belongs to, or -1 for a pause. 4 is the hour's spell. */
function which(te) {
  const hs = te - Math.round(te / 3600) * 3600;
  if (hs > -0.6 && hs < 9) return 4;
  const c = te / 10, f = c - Math.floor(c);
  return f < 0.82 ? ((Math.floor(c) % 4) + 4) % 4 : -1;
}
/** All bullets alive at T; bomb = { x, y, t0, r } clears what it touches. Returns bullets near the frog (grazes). */
export function bullets(T, fx, fy, bomb, dim) {
  let graze = 0;
  for (let pi = 0; pi < 5; pi++) {
    const p = pi < 4 ? P[pi] : SPELL;
    const e1 = Math.floor(T / p.dt), e0 = Math.ceil((T - LIFE) / p.dt);
    for (let e = e0; e <= e1; e++) {
      const te = e * p.dt;
      if (which(te) !== pi) continue;
      const tau = T - te;
      const fade = kit.clamp(tau * 4) * dim;
      for (let k = 0; k < p.n; k++) {
        const a = p.ang(te, k, tau), r = 6 + p.v * tau * (p.sp ? p.sp(k) : 1);
        const x = CX + r * Math.cos(a), y = CY + r * Math.sin(a);
        if (x < -3 || y < -3 || x > W + 2 || y > H + 2) continue;
        if (bomb && te < bomb.t0 && Math.hypot(x - bomb.x, y - bomb.y) < bomb.r) continue;
        const gd = Math.hypot(x - fx, y - fy);
        if (gd < 10 && gd > 4) { graze++; orb(bg, x, y, 0.6, [1, 1, 1], 0.5 * dim, 1, 0.8); }
        const far = kit.smoothstep(34, 62, r);
        orb(bg, x, y, p.r * (1 - 0.3 * far), p.c, 0.42 * fade * (1 - 0.55 * far), 0.55 * (1 - 0.6 * far), 0.5);
      }
    }
  }
  return graze;
}

/** The bomb: a rainbow ring blooming from the frog. */
export function drawBomb(b, dim) {
  const n = Math.max(24, Math.floor(b.r * 1.6));
  for (let k = 0; k < n; k++) {
    const a = (k * kit.TAU) / n, x = b.x + b.r * Math.cos(a), y = b.y + b.r * Math.sin(a);
    if (x < -4 || y < -4 || x > W + 3 || y > H + 3) continue;
    orb(bg, x, y, 2.2, kit.hsv(k / n + b.r / 90, 0.75, 1), 0.85 * b.fade * dim, 0.8, 0.8);
  }
}

/** The SPELL CARD ribbon sliding across the horizontal band (y 64..73). */
export function banner(T, a, dim) {
  const text = 'SPELL CARD', x0 = W + 4 - a * 58, al = kit.clamp(Math.min(a + 1.4, 5.2 - a) * 2) * dim;
  if (al <= 0) return;
  for (let px = 0; px < W; px++) {
    for (let py = 63; py <= 74; py++) {
      const o = 3 * (py * W + px), k = 0.85 * al;
      bg[o] *= 1 - k; bg[o + 1] *= 1 - k; bg[o + 2] *= 1 - k;
    }
    const sh = 0.5 + 0.5 * Math.sin(px * 0.2 - T * 6);
    for (const py of [63, 74]) { const o = 3 * (py * W + px); bg[o] += 0.5 * al * sh; bg[o + 1] += 0.22 * al * sh; }
  }
  [...text].forEach((ch, i) => {
    const L = LETTERS[ch], gx = x0 + i * 7;
    for (let y = 0; y < 7; y++) for (let x = 0; x < 5; x++) {
      if (L[y][x] !== '#') continue;
      const px = gx + x, ix = Math.floor(px), f = px - ix;
      for (const [xx, w] of [[ix, 1 - f], [ix + 1, f]]) {
        if (xx < 0 || xx >= W) continue;
        const o = 3 * ((65 + y) * W + xx);
        bg[o] += 1.0 * w * al; bg[o + 1] += 0.78 * w * al; bg[o + 2] += 0.3 * w * al;
      }
    }
  });
}
