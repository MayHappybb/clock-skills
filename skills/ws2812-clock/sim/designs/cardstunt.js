// Card Stunt: the 3x3 wall is one section of a stadium stand, 32 seats by
// 32 rows, every fan holding a coloured card over their face. From across
// the room the cards are one crisp mosaic: the hour top left, the minutes
// bottom right, on the home end's crimson and the away end's navy, split by
// a gold sash, with a slowly turning sunburst the crowd keeps flipping into
// place. Up close it is people: hands at the card corners, tall fans' hair
// over the top, someone fumbling a card and fishing it back up, a Mexican
// wave that tilts the cards to the floodlights and shows a row of cheering
// faces. Minute turn: the section flips its cards in a sweep, the old
// numeral away to black, then the new one in, each card turning edge-on.
// Hour: the fans who are not holding a numeral throw their cards in the air,
// catch the black side, and the stand plays fireworks round the time.
import * as kit from '../js/kit.js';
import { GLYPHS, GLYPH_W, GLYPH_H } from './cardstunt-glyphs.js';

const N = 32, C = 6, W = 192, NC = N * N;
const img = new Float32Array(W * W * 3);
const pad = (n) => String(n).padStart(2, '0');
const hhmm = (d) => pad(d.getHours()) + pad(d.getMinutes());

// ------------------------------------------------------------- palette
// card colours (linear); fireworks get 3 shades each, as a stunt has cards for
const P = [];
const addP = (c) => (P.push(c[0], c[1], c[2]), P.length / 3 - 1);
const K_INK = addP([0, 0, 0]);
const K_CREAM = addP(kit.hex('#fff0cc'));
const K_CRIM = addP(kit.hex('#a81430')), K_CRIM2 = addP(kit.hex('#5c0818'));
const K_NAVY = addP(kit.hex('#1f48b4')), K_NAVY2 = addP(kit.hex('#122a74'));
const K_GOLD = addP(kit.hex('#e09a1c')), K_GOLD2 = addP(kit.hex('#8a4c0a'));
const K_SKY = addP([0.0015, 0.002, 0.006]);
const FW = ['#ffb43a', '#ff2a3a', '#5a9cff', '#ffd8a0'].map(kit.hex);
const K_FW = FW.length ? P.length / 3 : 0;
for (const c of FW) { addP(c); addP(kit.scale(c, 0.5)); addP(kit.scale(c, 0.2)); }
const PAL = new Float32Array(P);


const SKINS = ['#e8b48a', '#c68a5e', '#8d5a3a', '#f2cba4', '#5e3a24', '#d9a07a'].map(kit.hex);
const HAIRS = ['#2a1a10', '#5a3418', '#d0a858', '#141414', '#8a3018', '#3a2a20'].map(kit.hex);

// ------------------------------------------------------------- people
// per seat, fixed: skin, hair, tall (hair shows over the card), sway
const pSkin = new Uint8Array(NC), pHair = new Uint8Array(NC), pTall = new Uint8Array(NC);
const pSw = new Float32Array(NC), pPh = new Float32Array(NC), pAmp = new Float32Array(NC);
const pDel = new Float32Array(NC), pTilt = new Float32Array(NC);
for (let c = 0; c < NC; c++) {
  pSkin[c] = Math.floor(kit.hash(c, 1) * SKINS.length);
  pHair[c] = Math.floor(kit.hash(c, 2) * HAIRS.length);
  pTall[c] = kit.hash(c, 3) > 0.7 ? 1 : 0;
  pSw[c] = 0.4 + 0.9 * kit.hash(c, 4);
  pPh[c] = kit.TAU * kit.hash(c, 5);
  pAmp[c] = kit.hash(c, 6) > 0.75 ? 0.45 : 0.12;
  pDel[c] = 0.25 * kit.hash(c, 7);
  pTilt[c] = 0.9 + 0.14 * kit.hash(c, 8);
}

// ------------------------------------------------------------- the plan
// where the numerals sit (seat column, row of the glyph's top-left)
const SLOTS = [[2, 2], [12, 2], [11, 17], [21, 17]];
const slotMask = new Uint8Array(NC);
SLOTS.forEach(([gx, gy], s) => {
  for (let r = -1; r <= GLYPH_H; r++) for (let k = -1; k <= GLYPH_W; k++) slotMask[(gy + r) * N + gx + k] |= 1 << s;
});
// card types: 0 pattern, 1 cream, 2 black keyline, 3..6 split cards a b c d
const typeCache = new Map();
function types(str) {
  let T = typeCache.get(str);
  if (T) return T;
  T = new Uint8Array(NC);
  for (let s = 0; s < 4; s++) {
    const g = GLYPHS[str[s]], [gx, gy] = SLOTS[s];
    for (let r = 0; r < GLYPH_H; r++) for (let k = 0; k < GLYPH_W; k++) {
      const ch = g[r][k];
      if (ch !== '.') T[(gy + r) * N + gx + k] = ch === '#' ? 1 : 3 + 'abcd'.indexOf(ch);
    }
  }
  const lit = T.slice();
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (lit[y * N + x]) continue;
    let near = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const X = x + dx, Y = y + dy;
      if (X >= 0 && Y >= 0 && X < N && Y < N && lit[Y * N + X]) near = 1;
    }
    if (near) T[y * N + x] = 2;
  }
  if (typeCache.size > 6) typeCache.clear();
  typeCache.set(str, T);
  return T;
}

// --------------------------------------------------------- the pattern
// Background: the team flag, waving. Horizontal bands (crimson, a gold
// pinstripe, navy, a gold pinstripe) ripple across the stand; every band edge
// that moves is a row of fans flipping their cards, so the flag only waves
// because a thousand people keep turning cards in time. Each card knows its
// last flip: (pA -> pB, progress pP), solved from the wave in closed form.
const FLIP = 0.42, BAND = 1.6, WA = 2.2, WK = 0.16, WW = 0.9;
const BANDS = [K_CRIM, K_CRIM, K_CRIM, K_CRIM, K_CRIM, K_GOLD, K_NAVY, K_NAVY, K_NAVY, K_NAVY, K_NAVY, K_GOLD];
const NB = BANDS.length;
let pA = 0, pB = 0, pP = 1;
function pattern(cx, cy, now) {
  const ph = WK * cx - WW * now + 0.35 * Math.sin(0.11 * cy + 0.4 * now);
  const v = (cy + WA * Math.sin(ph) + 0.5 * now) / BAND;
  const dv = (0.5 - WA * WW * Math.cos(ph)) / BAND;
  const k = Math.floor(v), f = v - k;
  pB = BANDS[((k % NB) + NB) % NB];
  let since, prev;
  if (dv > 0) { since = f / dv; prev = k - 1; } else { since = (1 - f) / -dv; prev = k + 1; }
  pA = BANDS[((prev % NB) + NB) % NB];
  pP = since / FLIP;
  if (pA === pB) pP = 1;
}

// ---------------------------------------------------------- fireworks
// played by the crowd on the black side of their cards: rockets climb, burst
// into rings, and fade in three card shades. Times are seconds into the hour.
const BURSTS = [
  [24, 8, 5.0, 0, 10], [8, 23, 5.5, 2, 9], [16, 13, 6.1, 1, 13], [27, 25, 6.6, 3, 9],
  [6, 6, 7.1, 0, 9], [18, 23, 7.6, 2, 11], [25, 13, 8.1, 1, 9], [9, 15, 8.6, 3, 10],
  [16, 6, 9.1, 0, 12], [22, 27, 9.5, 1, 8],
];
const SPOKES = 12;
function fireworks(cx, cy, t) {
  let best = 0, bc = 0;
  for (let b = 0; b < BURSTS.length; b++) {
    const B = BURSTS[b], bx = B[0], by = B[1], col = B[3], R = B[4];
    const dt = t - B[2];
    if (dt < -0.8 || dt > 2.2) continue;
    let v = 0;
    if (dt < 0) { // the rocket: one card climbing, a short trail under it
      const y = by + (34 - by) * (-dt / 0.8) ** 1.3;
      if (Math.abs(cx - bx) < 0.75 && cy >= y - 0.5) v = Math.max(0, 1 - (cy - y) / 5);
      if (v > best) { best = v; bc = 3; }
      continue;
    }
    // a peony: a ring of sparks flies out (cards on the ring flip to colour,
    // with a dimmer streak inside), then droops and fades
    const r = R * (1 - Math.exp(-3.0 * dt)), fall = 0.9 * dt * dt;
    const ddx = cx - bx, ddy = cy - by - fall, d = Math.sqrt(ddx * ddx + ddy * ddy);
    if (d > r + 1.5) continue;
    const fade = Math.exp(-0.8 * dt);
    const ang = Math.atan2(ddy, ddx) * SPOKES / kit.TAU + b * 0.37;
    const spoke = 1 - 2 * Math.abs(ang - Math.round(ang));
    const back = r - d, len = 1.2 + 3.5 * Math.exp(-1.5 * dt);
    v = back < -1.1 ? 0 : back < 0.6 ? 1 : back < len ? 0.5 * (1 - (back - 0.6) / len) : 0;
    v *= fade * (0.6 + 0.4 * spoke);
    if (d < r - 1 && kit.hash(cx, cy, Math.floor(t * 8) + b) > 0.9) v = Math.max(v, 0.3 * fade);
    if (dt < 0.15 && d < 2.5) v = 1;
    if (v > best) { best = v; bc = col; }
  }
  if (best > 0.5) return K_FW + bc * 3;
  if (best > 0.25) return K_FW + bc * 3 + 1;
  if (best > 0.08) return K_FW + bc * 3 + 2;
  return K_SKY;
}

// ------------------------------------------------------------- drawing
/** A card (or any rectangle) with sub-pixel edges; shape 1..4 is a split card. */
function rect(x0, y0, w, h, r, g, b, shape) {
  if (w <= 0.02 || h <= 0.02) return;
  const x1 = x0 + w, y1 = y0 + h;
  let ya = Math.floor(y0), yb = Math.ceil(y1), xa = Math.floor(x0), xb = Math.ceil(x1);
  if (ya < 0) ya = 0; if (yb > W) yb = W; if (xa < 0) xa = 0; if (xb > W) xb = W;
  const diag = Math.min(w, h) * 0.7071;
  for (let py = ya; py < yb; py++) {
    const cy = Math.min(py + 1, y1) - Math.max(py, y0);
    if (cy <= 0) continue;
    const v = (py + 0.5 - y0) / h;
    for (let px = xa; px < xb; px++) {
      const cx = Math.min(px + 1, x1) - Math.max(px, x0);
      if (cx <= 0) continue;
      let f = 1;
      if (shape) {
        const u = (px + 0.5 - x0) / w;
        const sd = shape === 1 ? 1 - u - v : shape === 2 ? u - v : shape === 3 ? v - u : u + v - 1;
        f = sd * diag + 0.5; f = f < 0 ? 0 : f > 1 ? 1 : f;
      }
      const a = cx * cy, o = 3 * (py * W + px);
      img[o] += (r * f - img[o]) * a; img[o + 1] += (g * f - img[o + 1]) * a; img[o + 2] += (b * f - img[o + 2]) * a;
    }
  }
}
const dot = (x, y, c, k) => rect(x, y, 1, 1, c[0] * k, c[1] * k, c[2] * k, 0);

// per-seat state for this frame (filled by the planner, read by the painter)
const sA = new Uint8Array(NC), sB = new Uint8Array(NC), sShA = new Uint8Array(NC), sShB = new Uint8Array(NC);
const sP = new Float32Array(NC), sLift = new Float32Array(NC), sCheer = new Float32Array(NC);
const sDy = new Float32Array(NC), sFly = new Float32Array(NC), sDrop = new Float32Array(NC);
const sDigit = new Uint8Array(NC), sDark = new Uint8Array(NC);

/** Card colour index + shape for a type, at rest (pattern resolved to its current card). */
function cardOf(t) {
  if (t === 1) return K_CREAM;
  if (t === 2) return K_INK;
  if (t >= 3) return K_CREAM;
  return -1;
}

export default {
  name: 'Card Stunt',
  blurb: 'a stadium section of 1024 fans holding up cards: together they are the time; flips sweep the minute, the hour throws them in the air',
  layouts: ['hub-3x3'], look: 'smoke', fps: 60, brightness: 0.36, dither: false,
  frame(ctx) {
    const now = ctx.date.getTime() / 1000, M = Math.floor(now / 60) * 60, age = now - M;
    const prevS = hhmm(new Date((M - 60) * 1000)), nextS = hhmm(ctx.date);
    const TO = types(prevS), TN = types(nextS);
    let changed = 0;
    for (let s = 0; s < 4; s++) if (prevS[s] !== nextS[s]) changed |= 1 << s;
    const hourShow = new Date(M * 1000).getMinutes() === 0 && age < 12.8;
    const sec = age;

    // Mexican wave, twice a minute, alternating direction
    let wx = -99, wdir = 1;
    if (sec > 14 && sec < 20) { wx = -8 + (sec - 14) / 5 * 48; wdir = 1; }
    else if (sec > 38 && sec < 44) { wx = 40 - (sec - 38) / 5 * 48; wdir = -1; }

    // a fumbled card: one fan every 6 s, away from the turn and the waves
    const dk = Math.floor(now / 6), dtau = now - dk * 6;
    let dropSeat = -1;
    if (!(sec < 3.2 || (sec > 12.5 && sec < 21) || (sec > 36.5 && sec < 45) || hourShow)) {
      const cand = Math.floor(kit.hash(dk, 77) * NC);
      if (TN[cand] === 0 && TO[cand] === 0 && dtau > 0.3 && dtau < 3.3) dropSeat = cand;
    }

    // the classic card-stunt goof: one fan in a numeral flips to the wrong
    // colour, holds it proudly, notices, and flips back (every 10 s, between turns)
    const gk = Math.floor(now / 10), gt = now - gk * 10 - 1.5;
    let goofSeat = -1;
    if (gt > 0 && gt < 4 && sec > 4 && !hourShow) {
      let c0 = Math.floor(kit.hash(gk, 91) * NC);
      for (let n = 0; n < NC; n++, c0 = (c0 + 37) % NC) if (TN[c0] === 1 && TO[c0] === 1) { goofSeat = c0; break; }
    }

    // ------------------------------------------------ plan every seat
    for (let cy = 0; cy < N; cy++) for (let cx = 0; cx < N; cx++) {
      const c = cy * N + cx;
      let tA = TN[c], tB = TN[c], p = 1;
      if (age < 2.8 && (slotMask[c] & changed) && (TO[c] || TN[c])) {
        // each numeral sweeps on its own diagonal: old cards out, new cards in,
        // the in-front 0.5 s behind the out-front, slots a beat apart
        const m = slotMask[c] & changed, sl = m & 1 ? 0 : m & 2 ? 1 : m & 4 ? 2 : 3;
        const d = (cx - SLOTS[sl][0] + cy - SLOTS[sl][1] + 1) / (GLYPH_W + GLYPH_H);
        const T1 = 0.1 + 0.12 * sl + d * 0.55, T2 = T1 + 0.5;
        if (age < T2) { tA = TO[c]; tB = 0; p = (age - T1) / FLIP; }
        else { tA = 0; tB = TN[c]; p = (age - T2) / FLIP; }
        if (tA === tB) p = 1;
      }
      sDigit[c] = tB !== 0 || tA !== 0 ? 1 : 0;
      sDark[c] = 0; sFly[c] = -1; sDrop[c] = 0; sCheer[c] = 0; sLift[c] = 0; sDy[c] = 0;
      // resolve type 0 to the pattern (or the fireworks)
      let a, b, pp = p;
      if (tA === 0 || tB === 0) pattern(cx, cy, now);
      let mode = 0; // 1 fireworks, 2 flipping back from them
      if (hourShow && TN[c] === 0 && age > 2.4) {
        // throw: launch, tumble, catch on the black side; then fireworks; then back
        const t0 = 2.6 + 0.7 * kit.hash(c, 11), D = 1.5 + 0.7 * kit.hash(c, 12);
        const back = 10.6 + (cx + cy) / 62 * 1.3;
        if (age < t0 + D) {
          if (age >= t0) { sFly[c] = (age - t0) / D; sCheer[c] = 1; }
        } else if (age < back) mode = 1;
        else { pA = fireworks(cx, cy, back); pp = (age - back) / FLIP; mode = 2; }
      }
      if (mode === 1) { a = b = fireworks(cx, cy, age); pp = 1; sDark[c] = 1; }
      else if (mode === 2) { a = pA; b = pB; }
      else if (tA === 0 && tB === 0) {
        a = pA; b = pB; pp = pP;
        // the turn's flash: a gold front sweeps the whole stand with the new digits
        if (age < 3.2 && changed) {
          const e = age - (1.15 + (cx + cy) / 62 * 0.9) + 0.5 * pDel[c];
          if (e > 0 && e < 2 * FLIP + 0.25) {
            if (e < FLIP + 0.25) { a = pB; b = K_GOLD; pp = e / FLIP; } else { a = K_GOLD; b = pB; pp = (e - FLIP - 0.25) / FLIP; }
          }
        }
      }
      else { a = tA === 0 ? pB : cardOf(tA); b = tB === 0 ? pB : cardOf(tB); }
      sA[c] = a; sB[c] = b; sP[c] = pp > 1 ? 1 : pp < 0 ? 0 : pp;
      sShA[c] = tA >= 3 ? tA - 2 : 0; sShB[c] = tB >= 3 ? tB - 2 : 0;
      // wave
      if (wx > -90) {
        const d = (cx - wx) * wdir + pDel[c] * 6;
        const w = Math.exp(-d * d / 5);
        sLift[c] = w; sCheer[c] = Math.max(sCheer[c], w);
      }
      if (c === dropSeat) sDrop[c] = dtau - 0.3;
      if (c === goofSeat) {
        const wrong = kit.hash(gk, 92) > 0.5 ? K_NAVY : K_CRIM;
        if (gt < 2.9) { sA[c] = K_CREAM; sB[c] = wrong; sP[c] = kit.clamp(gt / FLIP); }
        else { sA[c] = wrong; sB[c] = K_CREAM; sP[c] = kit.clamp((gt - 2.9) / FLIP); }
        sCheer[c] = gt > 0.6 && gt < 2.6 ? 1 : 0;
      }
    }

    // ------------------------------------------------ paint
    img.fill(0);
    const dim = 1 - 0.62 * ctx.night;
    // pass 1: people, then the background cards, row by row (front rows occlude)
    for (let pass = 0; pass < 2; pass++) {
      for (let cy = 0; cy < N; cy++) {
        if (pass === 0) for (let cx = 0; cx < N; cx++) person(cy * N + cx, cx, cy, now);
        for (let cx = 0; cx < N; cx++) {
          const c = cy * N + cx;
          if ((sDigit[c] === 1) === (pass === 1)) card(c, cx, cy, now);
        }
      }
      if (pass === 0) for (let c = 0; c < NC; c++) if (sFly[c] >= 0) flyer(c, now);
    }
    kit.blitGrid(ctx, img, dim);
  },
};

const GROUND = 1.0, INK = [0, 0, 0], MOUTH = [0.3, 0.02, 0.03];
/** A fan: hair, then eyes peeking over the card; the whole face when the card goes up. */
function person(c, cx, cy, now) {
  const X = cx * C, Y = cy * C;
  const lift = sLift[c], cheer = sCheer[c], drop = sDrop[c];
  const sk = SKINS[pSkin[c]], hr = HAIRS[pHair[c]];
  const big = sDigit[c] ? 0.25 : sDark[c] ? 0.12 : 1; // numeral holders sit lower, their hair barely shows
  let hy = Y - 0.5 * pTall[c] * big;
  if (drop > 1.0 && drop < 2.2) hy += 6 * Math.sin((drop - 1.0) / 1.2 * Math.PI); // ducks to fish it out
  const sx = X + 0.5 + Math.sin(now * pSw[c] + pPh[c]) * pAmp[c];
  const up = Math.max(cheer, lift), kh = (0.35 + 0.4 * up) * big, ks = (0.14 + 0.66 * up) * big;
  rect(sx + 0.5, hy, 3, 1, hr[0] * kh, hr[1] * kh, hr[2] * kh, 0);
  rect(sx, hy + 1, 4, 2, sk[0] * ks, sk[1] * ks, sk[2] * ks, 0);
    // eyes: look along the wave, or down at a dropped card
  const look = drop > 0 && drop < 1.0 ? 0.6 : cheer > 0.2 ? 0 : 0.35 * Math.sin(now * 0.3 + pPh[c] * 3);
  dot(sx + 0.5 + look, hy + 1, INK, 1); dot(sx + 2.5 + look, hy + 1, INK, 1);
  const open = cheer > 0.4 || (drop > 0 && drop < 1.2);
  if (open) rect(sx + 1, hy + 2, 2, 1, MOUTH[0], MOUTH[1], MOUTH[2], 0);
  if (cheer > 0.3) { // arms up
    const k = 0.5 * Math.min(1, (cheer - 0.3) * 2), ay = hy + 2.5 - 3 * cheer;
    rect(sx - 1, ay, 1, 2.5, sk[0] * k, sk[1] * k, sk[2] * k, 0);
    rect(sx + 4, ay, 1, 2.5, sk[0] * k, sk[1] * k, sk[2] * k, 0);
  }
}

/** A card: 5x4 held at the chin, numeral cards 5x5 held up over the eyes. */
function card(c, cx, cy, now) {
  const X = cx * C, Y = cy * C;
  if (sFly[c] >= 0) return; // in the air
  const lift = sLift[c], drop = sDrop[c], sk = SKINS[pSkin[c]], num = sDigit[c];
  const sw = Math.sin(now * pSw[c] + pPh[c]);
  let dx = sw * pAmp[c] * (num ? 0.25 : 1);
  let dy = -(num ? 1.2 : 5.2) * lift, hk = 1 - (num ? 0 : 0.35) * lift;
  let glint = 0;
  if (drop > 0) {
    if (drop < 0.9) { const k = kit.ease.in(drop / 0.9); dy += 10 * k; hk *= Math.abs(Math.cos(k * 2.6)); dx += 1.5 * k; }
    else if (drop < 2.0) return; // under the seat in front
    else if (drop < 2.9) { const k = kit.ease.outBack((drop - 2.0) / 0.9); dy += 9 * (1 - k); }
  }
  const p = sP[c];
  const th = p * Math.PI, wf = Math.abs(Math.cos(th));
  const idx = p < 0.5 ? sA[c] : sB[c], shape = p < 0.5 ? sShA[c] : sShB[c];
  // a turning card catches the floodlights once, near 40 deg
  if (p > 0 && p < 1) glint += 0.35 * Math.exp(-((((th % Math.PI) - 0.75) / 0.25) ** 2));
  const br = pTilt[c] * (1 + 0.05 * sw) * (num ? 1 : GROUND);
  let r = PAL[3 * idx] * br, g = PAL[3 * idx + 1] * br, b = PAL[3 * idx + 2] * br;
  r += glint * 0.5; g += glint * 0.46; b += glint * 0.38;
  const dark = sDark[c], H = num || dark ? 5 : 4, top = num || dark ? 1 : 2;
  const CW = dark ? 5.6 : 5, w = Math.max(CW * wf, p > 0 && p < 1 ? 0.45 : 0), h = (dark ? 5.6 : H) * hk;
  if (wf < 0.12 && p > 0 && p < 1) { r = 0.3; g = 0.28; b = 0.25; } // the card's white edge
  rect(X + dx + (dark ? 2.8 : 2.5) - w / 2, Y + top + dy + (H - h) * 0.3, w, h, r, g, b, shape);
  // fingers at the card's lower corners
  if (hk > 0.4 && !num) { const k = 0.3; dot(X + dx - 0.7, Y + top + dy + h - 1.5, sk, k); dot(X + dx + 4.7, Y + top + dy + h - 1.5, sk, k); }
}

function flyer(c, now) {
  const cx = c % N, cy = (c - cx) / N, f = sFly[c];
  const X = cx * C, Y = cy * C;
  const H = 14 + 30 * kit.hash(c, 13), drift = 8 * (kit.hash(c, 14) - 0.5);
  const y = Y + 2 - 4 * H * f * (1 - f), x = X + drift * Math.sin(f * Math.PI);
  const spin = f * (5 + 6 * kit.hash(c, 15)) * Math.PI;
  const cs = Math.cos(spin), wf = Math.abs(Math.cos(spin * 0.6));
  const idx = cs > 0 ? sA[c] : K_INK;
  const k = 0.6 + 0.6 * Math.abs(Math.sin(spin));
  const w = 5 * wf + 0.4, h = 4 * Math.abs(cs) + 0.4;
  rect(x + 2.5 - w / 2, y + 2 - h / 2, w, h, PAL[3 * idx] * k, PAL[3 * idx + 1] * k, PAL[3 * idx + 2] * k, 0);
}
