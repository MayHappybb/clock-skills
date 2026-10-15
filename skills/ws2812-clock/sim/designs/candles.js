// Birthday: a close-up of a chocolate cake in a dark room, lit only by its
// candles. The time is four moulded numeral candles: hours on the top tier,
// minutes on the lower tier in front. Each flame is a little simulation
// (flicker, draught, sway) and the only light in the room: it lights the wax
// from inside, the glossy glaze, the gold board, the wood and the wall.
// Wax drips grow while a candle burns, so the minute candle's drips are a
// second hand.
//
// Minute turn: the frog leans in from the right, puffs its cheeks and blows
// the changing candles out (they bend, gutter, smoke); a hand plucks each one
// out and pushes the new numeral in; a match strikes, flares and relights it.
// Hour: all candles flare, the lights come up for the party (bunting, confetti,
// the frog back in a party hat with a blower), then the room goes dark again.
import * as kit from '../js/kit.js';
import { FIELDS, WICK, WICK_Y, TOPV, GW, GH, dist } from './candles-font.js';
import { W, H, SA, CA, CY, UP, LOW, sx, sy, buildScene } from './candles-scene.js';
import { lightScene, lightAt, drawFlame, glow, smoke, dot, FLAME_LIGHT } from './candles-fx.js';
import { drawFrog, drawBlower } from './candles-frog.js';
import { drawArm, drawMatch, drawBunting, drawConfetti } from './candles-party.js';

const SLOTS = [
  { X: -11.5, Z: -12, Y: UP.Y1, s: 0.95, side: -1, tau: 9000 },
  { X: 11.5, Z: -12, Y: UP.Y1, s: 0.95, side: 1, tau: 1500 },
  { X: -12.5, Z: 50, Y: LOW.Y1, s: 1.0, side: -1, tau: 260 },
  { X: 12.5, Z: 50, Y: LOW.Y1, s: 1.0, side: 1, tau: 30 },
];
const WAX = kit.hex('#f7a6c8'), TOP = kit.hex('#ffd0e2'), DRIP = kit.hex('#ff8cbc');
const WICKC = [0.015, 0.01, 0.008], GLINT = [1, 0.85, 0.55], SMOKE = [0.42, 0.4, 0.38], BREATH = [0.3, 0.42, 0.55];
const SLEEVES = ['#7a3a8c', '#2f6f6a', '#8a4a2a', '#34508c'].map(kit.hex);
const FROG_SIDE = 1, FROG_IN = 112, FROG_OUT = 146, FROG_Y = 43;
const pad = (n) => String(n).padStart(2, '0');
const digitsOf = (d) => pad(d.getHours()) + pad(d.getMinutes());
const sst = kit.smoothstep;

let S = null;
const img = new Float32Array(3 * W * H);
const lights = new Float32Array(6 * 12);
const tmp = [0, 0, 0], bounce = [0, 0, 0];

/** Wick tip on screen. */
function wickTip(sl, dg, ox, oy, lean) {
  const bx = sx(sl.X) + ox, by = sy(sl.Y, sl.Z) + oy;
  const u = (WICK[dg] - GW / 2) * sl.s, v = (WICK_Y[dg] - GH) * sl.s - 2.4;
  const c = Math.cos(lean), s = Math.sin(lean);
  return [bx + u * c - v * s, by + u * s + v * c];
}
/** Glyph point (u, v) to screen. */
function toScreen(sl, ox, oy, lean, u, v) {
  const U = (u - GW / 2) * sl.s, V = (v - GH) * sl.s, c = Math.cos(lean), s = Math.sin(lean);
  return [sx(sl.X) + ox + U * c - V * s, sy(sl.Y, sl.Z) + oy + U * s + V * c];
}

/**
 * One numeral candle: extruded wax (front face + the top faces seen from
 * above), bevelled, lit by every flame, glowing from inside near its own
 * flame, glitter, and wax drips of length `drip` (0..1).
 */
function drawCandle(sl, dg, ox, oy, lean, nl, amb, fl, t, seed, drip) {
  const f = FIELDS[dg], s = sl.s, is = 1 / s, TOPS = 1.1 * is, still = ox === 0 && oy === 0;
  const bx = sx(sl.X) + ox, by = sy(sl.Y, sl.Z) + oy;
  const c = Math.cos(lean), sn = Math.sin(lean);
  const x0 = Math.max(0, Math.floor(bx - 13 * s)), x1 = Math.min(W - 1, Math.ceil(bx + 13 * s));
  const y0 = Math.max(0, Math.floor(by - (GH + 4) * s)), y1 = Math.min(H - 1, Math.ceil(by + 2));
  if (y0 > y1) return;
  const vmax = GH - 1.4;
  // drips: two or three rivulets from the top edge near the wick
  const nd = 2 + (kit.hash(seed, 1) > 0.5 ? 1 : 0), DU = [], DV = [], DL = [];
  for (let q = 0; q < nd; q++) {
    let u = Math.floor(2 + kit.hash(seed, q, 2) * (GW - 4));
    for (let tries = 0; tries < 8 && (TOPV[dg][u] < 0 || TOPV[dg][u] > 12); tries++) u = (u + 5) % GW;
    if (TOPV[dg][u] < 0 || TOPV[dg][u] > 12) continue;
    DU.push(u + 0.5); DV.push(TOPV[dg][u] - 0.6); DL.push(drip * (3 + 7 * kit.hash(seed, q, 3)));
  }
  for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) {
    const dx = xx + 0.5 - bx, dy = yy + 0.5 - by;
    const u = (dx * c + dy * sn) * is + GW / 2, v = (-dx * sn + dy * c) * is + GH;
    if (v > vmax + 0.6) continue;
    const o = 3 * (yy * W + xx);
    let dF = dist(f, u, v) * s, dT = dist(f, u, v + TOPS) * s;
    const clip = (v - vmax) * s;                    // the icing hides the foot
    if (clip > dF) dF = clip;
    if (clip > dT) dT = clip;
    const d = Math.min(dF, dT);
    if (d > 0) {                                    // a dark moat round the wax
      if (d < 2.4 && still) { const k = 0.06 + 0.94 * (d / 2.4) ** 1.5; img[o] *= k; img[o + 1] *= k; img[o + 2] *= k; }
      if (d >= 0.5) continue;
    }
    const cov = d < -0.5 ? 1 : 0.5 - d;
    let nx, ny, nz, alb = WAX, front = dF <= dT + 0.25;
    if (front) {
      const gx = dist(f, u + 0.5, v) - dist(f, u - 0.5, v), gy = dist(f, u, v + 0.5) - dist(f, u, v - 0.5);
      const gl = Math.hypot(gx, gy) || 1, hgt = -dF, tt = hgt >= 1.8 ? 0 : hgt <= 0 ? 1 : 1 - hgt / 1.8;
      nx = (gx / gl) * tt * 0.8; ny = (-gy / gl) * tt * 0.8; nz = Math.sqrt(Math.max(0.05, 1 - nx * nx - ny * ny));
    } else { nx = 0; ny = 0.92; nz = 0.4; alb = TOP; }
    const Px = xx + 0.5 - 64, Py = sl.Y + (by - oy - (yy + 0.5)) / CA, Pz = sl.Z + 1.2;
    lightAt(tmp, Px, Py, Pz, nx, ny, nz, lights, nl, 0.75, amb);
    let r = tmp[0] + bounce[0], g = tmp[1] + bounce[1], b = tmp[2] + bounce[2];
    if (fl && fl[2] > 0) {                          // light through the wax from its own flame
      const ddx = xx + 0.5 - fl[0], ddy = yy + 0.5 - fl[1];
      const sss = fl[2] * 0.36 * Math.exp(-Math.sqrt(ddx * ddx + ddy * ddy) / 13);
      r += FLAME_LIGHT[0] * sss; g += FLAME_LIGHT[1] * sss; b += FLAME_LIGHT[2] * sss;
    }
    if (front) for (let q = 0; q < DU.length; q++) {
      const du = Math.abs(u - DU[q]), dv = v - DV[q], L = DL[q];
      if (dv < 0 || dv > L + 1.6) continue;
      const bead = dv > L - 0.4 ? 1.5 : 1.0;          // the bead at the drip's end is fatter
      if (du < 0.85 * bead) { alb = DRIP; r *= 1.3; g *= 1.3; b *= 1.3; break; }
    }
    r *= alb[0] * 0.6; g *= alb[1] * 0.6; b *= alb[2] * 0.6;
    // glitter: tiny flakes that catch the flame as it moves
    const cu = Math.floor(u * 1.5), cv = Math.floor(v * 1.5), hh = kit.hash(cu, cv, seed);
    if (hh < 0.12) {
      let sp = Math.sin(t * (1.1 + 2.4 * kit.hash(cu, cv, 9)) + 6.28 * kit.hash(cu, cv, 4));
      if (sp > 0) {
        sp *= sp; sp *= sp; sp *= sp;
        const a = sp * (tmp[0] + tmp[1]) * 0.9;
        r += GLINT[0] * a; g += GLINT[1] * a; b += GLINT[2] * a;
      }
    }
    img[o] += (r - img[o]) * cov; img[o + 1] += (g - img[o + 1]) * cov; img[o + 2] += (b - img[o + 2]) * cov;
  }
}

/** A wick: a dark thread, with an ember at the tip. */
function drawWick(x0, y0, x1, y1, ember) {
  for (let k = 0; k <= 5; k++) {
    const x = x0 + (x1 - x0) * k / 5, y = y0 + (y1 - y0) * k / 5;
    const xi = Math.floor(x), yi = Math.floor(y);
    if (xi < 0 || yi < 0 || xi >= W || yi >= H) continue;
    const o = 3 * (yi * W + xi);
    img[o] = img[o] * 0.25 + WICKC[0]; img[o + 1] = img[o + 1] * 0.25 + WICKC[1]; img[o + 2] = img[o + 2] * 0.25 + WICKC[2];
  }
  if (ember > 0.01) dot(img, x1, y1, 1.3, 0.9 * ember, 0.18 * ember, 0.03 * ember);
}

/** The draught: how a flame sways, flickers and stretches at time t. */
function flameState(k, t, X) {
  const seed = k * 7.3 + 1.1;
  const gust = (kit.noise2(t * 0.3 - X * 0.012, 3.7) - 0.5) * 2;
  const sway = 2.4 * gust + 0.5 * Math.sin(t * 1.7 + seed) + 0.25 * Math.sin(t * 4.3 + seed * 2);
  const fl = 0.88 + 0.14 * kit.noise2(t * 5.1 + seed, 1.3) + 0.07 * kit.noise2(t * 13 + seed, 2.9);
  const hk = 0.88 + 0.16 * kit.noise2(t * 3.3 + seed, 5.1) - 0.12 * Math.abs(gust);
  return { sway, fl, hk, seed };
}

/** Path for the match tip between two wicks: up first, or across first. */
function matchPath(A, B, q) {
  const e = kit.ease.inOut(q);
  if (B[1] < A[1] - 3) return [kit.lerp(A[0], B[0], sst(0.35, 1, q)), kit.lerp(A[1], B[1], sst(0, 0.65, q))];
  if (B[1] > A[1] + 3) return [kit.lerp(A[0], B[0], sst(0, 0.65, q)), kit.lerp(A[1], B[1], sst(0.35, 1, q))];
  return [kit.lerp(A[0], B[0], e), kit.lerp(A[1], B[1], e) - 3 * Math.sin(Math.PI * q)];
}

export default {
  name: 'Birthday',
  blurb: 'numeral candles on a cake in the dark: the frog blows the minute out, a hand swaps it, a match relights it',
  layouts: ['hub-2x2'], look: 'smoke', fps: 60, brightness: 0.45, dither: true,
  frame(ctx) {
    if (!S) S = buildScene();
    const D = ctx.date, sec = kit.secOf(D);
    const t = D.getHours() * 3600 + D.getMinutes() * 60 + sec;
    const base = Math.floor(D.getTime() / 60000) * 60000;
    let a = sec, turnMs = base;
    if (sec >= 55) { a = sec - 60; turnMs = base + 60000; }
    const newD = digitsOf(new Date(turnMs)), oldD = digitsOf(new Date(turnMs - 60000));
    const active = a < 12.5;
    const changing = [];
    if (active) for (const k of [3, 1, 0, 2]) if (newD[k] !== oldD[k]) changing.push(k);
    const nch = changing.length, hour = active && newD.slice(2) === '00';
    // the party: the lights come up the moment the candles are blown out, and
    // go down again once the new hour's candles are burning
    const P = hour ? a + 1.7 : -99;
    const up = hour ? sst(0, 0.7, P) * (1 - sst(7.6, 9.6, P)) : 0;
    const amb = [0.42 * up, 0.32 * up, 0.22 * up];
    const lastL = 1.55 + 0.45 * Math.max(0, nch - 1);
    const flare = hour && a > lastL ? Math.exp(-(a - lastL) * 1.1) * sst(lastL, lastL + 0.15, a) : 0;
    const blowK = nch ? sst(-2.75, -2.45, a) * (1 - sst(-1.85, -1.5, a)) : 0;

    // ---- per candle state
    const C = [];
    for (let k = 0; k < 4; k++) {
      const sl = SLOTS[k], j = changing.indexOf(k);
      let d = +(a < 0 ? oldD[k] : newD[k]), ox = 0, oy = 0, lit = 1, push = 0, gut = 1, ember = 0, wob = 0;
      let hand = null, smk = null, flr = 0;
      if (j < 0) push = -2.4 * blowK;
      else if (a < 0) {
        const out = -1.85 + 0.05 * j, bk = sst(-2.7, out, a);
        push = -9 * Math.sin(Math.min(1, bk * 1.15) * Math.PI / 2);
        gut = 0.65 + 0.35 * kit.noise2(t * 22 + k, 4);
        lit = a < out ? (1 - bk * bk) * (bk > 0.05 ? gut : 1) : 0;
        if (a >= out) { ember = 0.55 * Math.exp(-(a - out) * 2.5); smk = [out, -0.8]; }
        const reach = sst(-1.2, -0.78, a), lift = sst(-0.76 + 0.03 * j, -0.08, a);
        // lifted a little, then carried out sideways (never across the other candles)
        oy = -12 * kit.ease.inOut(sst(0, 0.35, lift)); ox = sl.side * 85 * kit.ease.in(sst(0.2, 1, lift));
        if (reach > 0) hand = { reach: kit.ease.out(reach), pinch: sst(-0.86, -0.76, a) };
      } else {
        const t0 = 0.05 + 0.12 * j, ins = sst(t0, t0 + 1.0, a), L = 1.55 + 0.45 * j;
        ox = sl.side * 85 * (1 - kit.ease.out(sst(0, 0.65, ins))); oy = -12 * (1 - kit.ease.inOut(sst(0.55, 1, ins)));
        wob = a > t0 + 1.0 ? 0.06 * Math.exp(-(a - t0 - 1.0) * 4) * Math.sin((a - t0 - 1.0) * 17) : 0;
        lit = sst(L, L + 0.55, a);
        flr = a > L ? Math.exp(-(a - L) * 6) * sst(L, L + 0.06, a) : 0;
        const leave = sst(t0 + 1.0, t0 + 1.55, a);
        if (leave < 1) hand = { reach: 1 - kit.ease.in(leave), pinch: 1 - sst(t0 + 0.98, t0 + 1.12, a) };
      }
      const lean = (kit.hash(k, d, 3) - 0.5) * 0.08 + wob;
      const [wx, wy] = wickTip(sl, d, ox, oy, lean);
      const st = flameState(k, t, sl.X);
      const h = 13.5 * sl.s * st.hk * (1 + 0.55 * flare + 0.4 * flr) * (0.35 + 0.65 * Math.min(1, lit * 1.4));
      // drips: grow while this candle has burned since its digit last changed
      const since = k === 3 ? sec : k === 2 ? (D.getMinutes() % 10) * 60 + sec : k === 1 ? D.getMinutes() * 60 + sec : (D.getHours() % 10) * 3600 + D.getMinutes() * 60 + sec;
      const dripK = 1 - Math.exp(-Math.max(0, since - 2) / sl.tau);
      C.push({ k, sl, d, ox, oy, lean, wx, wy, h, st, lit, push, ember, hand, smk, flr, drip: dripK });
    }

    // ---- lights: the flames (and the match, below)
    let nl = 0;
    const addLight = (x, y, Z, I) => {
      const Y = (CY + Z * SA - y) / CA;
      lights[6 * nl] = x - 64; lights[6 * nl + 1] = Y; lights[6 * nl + 2] = Z;
      lights[6 * nl + 3] = FLAME_LIGHT[0] * I; lights[6 * nl + 4] = FLAME_LIGHT[1] * I; lights[6 * nl + 5] = FLAME_LIGHT[2] * I;
      nl++;
    };
    for (const c of C) {
      const I = 1.3 * c.st.fl * c.lit * (1 + 0.6 * flare + 1.5 * c.flr);
      if (I > 0.01) addLight(c.wx + (c.st.sway + c.push) * 0.35, c.wy - c.h * 0.45, c.sl.Z, I);
    }
    // the match: strikes at 1.05 s, lights the changing candles in turn
    let match = null;
    if (nch && a > 0.85) {
      const Lt = changing.map((_, j) => 1.55 + 0.45 * j), last = Lt[nch - 1];
      if (a < last + 1.0) {
        const tgt = changing.map((k) => { const c = C[k]; return [c.wx + 1.8 * c.sl.side, c.wy + 0.8, c.sl.side]; });
        const enter = [tgt[0][0] + 46 * tgt[0][2], tgt[0][1] - 10, tgt[0][2]];
        let p, sd;
        if (a < Lt[0]) {
          const q = kit.ease.out(sst(0.85, Lt[0] - 0.05, a));
          p = [kit.lerp(enter[0], tgt[0][0], q), kit.lerp(enter[1], tgt[0][1], q)]; sd = tgt[0][2];
        } else if (a >= last) {
          const q = kit.ease.in(sst(last + 0.3, last + 1.0, a)), T = tgt[nch - 1];
          p = [kit.lerp(T[0], T[0] + 50 * T[2], q), kit.lerp(T[1], T[1] - 10, q)]; sd = T[2];
        } else {
          let j = 0; while (j + 1 < nch && a >= Lt[j + 1]) j++;
          const q = sst(Lt[j] + 0.12, Lt[j + 1] - 0.04, a);
          p = matchPath(tgt[j], tgt[j + 1], q); sd = kit.lerp(tgt[j][2], tgt[j + 1][2], kit.ease.inOut(q));
        }
        const flameOn = sst(1.05, 1.12, a) * (1 - sst(last + 0.45, last + 0.6, a));
        const strike = a > 1.05 ? Math.exp(-(a - 1.05) * 9) : 0;
        match = { p, sd, flameOn, strike, last };
        if (flameOn > 0.01 || strike > 0.01) addLight(p[0], p[1] - 3, 30, 1.4 * flameOn + 5 * strike);
      }
    }

    // ---- the room (and the light bounced off it, which keeps even an unlit candle readable)
    let sumI = 0;
    for (let q = 0; q < nl; q++) sumI += lights[6 * q + 3];
    bounce[0] = 0.05 * sumI + 0.03; bounce[1] = 0.04 * sumI + 0.022; bounce[2] = 0.03 * sumI + 0.018;
    lightScene(img, S, lights, nl, amb);
    if (hour) drawBunting(img, t, kit.ease.outBack(sst(0.1, 1.3, P)) * (1 - kit.ease.in(sst(8.4, 9.8, P))), 0.12 + 0.5 * up);

    // ---- the frog, at the turn and again for the party
    const fIn = nch ? kit.ease.out(sst(-3.9, -3.2, a)) - kit.ease.in(hour ? sst(8.6, 9.6, P) : sst(-1.6, -0.95, a)) : 0;
    const hat = hour ? kit.ease.outBack(sst(-1.5, -1.1, a)) : 0;
    const fk = fIn;
    let mouth = null;
    if (fk > 0.001) {
      const cx = kit.lerp(FROG_OUT, FROG_IN, fk), cy = FROG_Y + 1.2 * Math.sin(t * 2.2);
      const puff = nch ? sst(-3.2, -2.75, a) * (1 - sst(-2.6, -1.75, a)) : 0;
      const blow = nch ? sst(-2.8, -2.65, a) * (1 - sst(-1.8, -1.55, a)) : 0;
      drawFrog(img, cx, cy, FROG_SIDE, Math.min(1, puff), blow, hat, 0.42 + 0.35 * up);
      mouth = [cx - FROG_SIDE * 13.5, cy + 4.2];
      if (hour && P > 1.4 && P < 8.4) {
        const ph = kit.fract((P - 1.4) / 1.3), un = ph < 0.6 ? Math.sin(Math.PI * ph / 0.6) : 0;
        drawBlower(img, cx, cy, FROG_SIDE, un, 0.55 + 0.4 * up, dot);
      }
      // the breath: pale streaks running from the mouth across the flames
      if (blowK > 0.01) {
        let tx = 0, ty = 0;
        for (const k of changing) { tx += C[k].wx; ty += C[k].wy - 4; }
        tx /= nch; ty /= nch;
        for (let q = 0; q < 14; q++) {
          const ph = kit.fract(a * 1.8 + q / 14), wy = (kit.hash(q, 5) - 0.5) * 10 * ph;
          const x = kit.lerp(mouth[0], tx - 14, ph), y = kit.lerp(mouth[1], ty, ph) + wy;
          const al = blowK * Math.sin(Math.PI * ph) * 0.9;
          for (let r = 0; r < 3; r++) dot(img, x + r * 1.4, y, 1.0, BREATH[0] * al, BREATH[1] * al, BREATH[2] * al);
        }
      }
    }

    // ---- candles, back row first, then wicks
    for (const c of C) {
      drawCandle(c.sl, c.d, c.ox, c.oy, c.lean, nl, amb, [c.wx, c.wy + 2.5, c.st.fl * c.lit * (1 + c.flr)], t, c.k * 13 + c.d, c.drip);
      const [bx0, by0] = toScreen(c.sl, c.ox, c.oy, c.lean, WICK[c.d], WICK_Y[c.d] + 0.3);
      drawWick(bx0, by0, c.wx, c.wy, c.ember);
    }

    // ---- hands swapping candles
    for (const c of C) {
      if (!c.hand) continue;
      // hands come in from the side, low, so they never cover the other candles
      const sd = c.sl.side, [gx, gy] = toScreen(c.sl, c.ox, c.oy, c.lean, GW / 2 + sd * 9.5, 12);
      const hx = gx + (1 - c.hand.reach) * sd * 60, hy = gy - (1 - c.hand.reach) * 10;
      drawArm(img, hx + sd * 46, hy - 16, hx, hy, 2.2 + 2.0 * (1 - c.hand.pinch), 0.3 + 0.3 * up, SLEEVES[c.k]);
    }

    // ---- flames, then glow, then smoke
    for (const c of C) {
      if (c.lit > 0.003) {
        drawFlame(img, c.wx, c.wy, c.h, 3.5 * c.sl.s, c.st.sway + c.push, c.st.fl * c.lit * (1 + 0.5 * c.flr), t, c.st.seed);
        glow(img, c.wx + (c.st.sway + c.push) * 0.3, c.wy - c.h * 0.4, 19 + 6 * flare, FLAME_LIGHT, 0.12 * c.st.fl * c.lit * (1 + flare));
        glow(img, c.wx + (c.st.sway + c.push) * 0.3, c.wy - c.h * 0.32, 8, [1, 0.62, 0.25], 0.16 * c.st.fl * c.lit);
        if (c.flr > 0.01) glow(img, c.wx, c.wy - 3, 9, [1, 0.8, 0.5], 0.5 * c.flr);
      }
      if (c.smk) {
        const [wx0, wy0] = wickTip(c.sl, c.d, 0, 0, c.lean);
        smoke(img, wx0, wy0, a, c.smk[0], c.smk[1], 0.75, c.k * 3.1, 10, SMOKE);
      }
    }
    if (match) {
      const { p, sd } = match;
      const bx = p[0] + sd * 9, by = p[1] - 9;
      drawArm(img, bx + sd * 46, by - 10, bx + sd * 1.5, by - 1, 1.2, 0.3 + 0.3 * up);
      drawMatch(img, bx, by, p[0], p[1], 0.5 + 0.5 * up, a > match.last + 0.6);
      const st = flameState(9, t, p[0]);
      if (match.flameOn > 0.01) {
        const shake = a > match.last + 0.3 ? 3 * Math.sin(a * 40) : 0;
        drawFlame(img, p[0], p[1] - 0.5, 6.5, 1.8, -1.2 * sd + st.sway * 0.4 + shake, match.flameOn * st.fl, t, 9);
      }
      if (match.strike > 0.01) { glow(img, p[0], p[1], 20, [1, 0.8, 0.5], 0.7 * match.strike); glow(img, p[0], p[1], 5, [1, 1, 0.9], 2.5 * match.strike); }
      if (a > match.last + 0.5) smoke(img, p[0], p[1] - 1, a, match.last + 0.5, match.last + 1.0, 0.35, 5, 8, SMOKE);
    }
    if (hour) drawConfetti(img, P - 0.3, 1 - sst(8.0, 9.8, P), 0.4 + 0.5 * up);

    // a hue-keeping shoulder: bright wax and flame cores roll off instead of clipping to white
    for (let p = 0; p < 3 * W * H; p += 3) {
      const m = Math.max(img[p], img[p + 1], img[p + 2]);
      if (m > 0.6) { const k = (0.6 + 0.4 * (1 - Math.exp(-(m - 0.6) / 0.4))) / m; img[p] *= k; img[p + 1] *= k; img[p + 2] *= k; }
    }
    kit.blitGrid(ctx, img, 1 - 0.55 * ctx.night);
  },
};
