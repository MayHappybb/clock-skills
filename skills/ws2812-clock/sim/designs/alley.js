// Alley: a rainy Hong Kong side street on three HUB75 panels in an L. The
// hours are a vertical blade sign of outline neon up the tall arm; the
// minutes a cyan tube box sign hung over the street from out of frame (the
// missing panel). Everything shines in the wet street below, rain rippling
// the reflections. A minute turn: the tube stutters out and the new numeral
// strikes, plasma running along the glass, warming from orange. The hour:
// lightning, the power dies, and the street re-ignites in a wave along the L.
import * as kit from '../js/kit.js';
import { stamp, stampPaths } from './alley-glyphs.js';
import * as S from './alley-scene.js';
import { rain, drips, steam, flash, addB } from './alley-fx.js';

const { W, H, GROUND, BLADE, MBOX } = S;
const pad2 = (n) => String(n).padStart(2, '0');
const digitsOf = (d) => pad2(d.getHours()) + pad2(d.getMinutes());
const SLOTS = [
  { style: 'blade', ox: 21.5, oy: 11.5, col: S.PINK, ign: 0.8 },
  { style: 'blade', ox: 21.5, oy: 56.5, col: S.PINK, ign: 0.98 },
  { style: 'box', ox: 68.5, oy: 68, col: S.CYAN, ign: 1.22 },
  { style: 'box', ox: 97.5, oy: 68, col: S.CYAN, ign: 1.38 },
];
// the box sign's red border tube, and the stretch of it that is broken
const BORDER = { w: 60, h: 34, R: 0, slant: 0, core: 0.75, halo: 1.3, reach: 3 };
function borderPath() {
  const x0 = 0, y0 = 0, x1 = 60, y1 = 34, r = 2.5, pts = [];
  const corner = (cx, cy, a0) => { for (let k = 0; k <= 4; k++) { const a = (a0 + 22.5 * k) * Math.PI / 180; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } };
  corner(x0 + r, y0 + r, 180); corner(x1 - r, y0 + r, 270); corner(x1 - r, y1 - r, 0); corner(x0 + r, y1 - r, 90);
  pts.push(pts[0]);
  return [pts];
}
// marquee bulbs round the blade
const BULBS = [];
{
  const x0 = 11, x1 = 52, y0 = 4, y1 = 95;
  for (let x = x0; x < x1; x += 3) BULBS.push([x, y0]);
  for (let y = y0; y < y1; y += 3) BULBS.push([x1, y]);
  for (let x = x1; x > x0; x -= 3) BULBS.push([x, y1]);
  for (let y = y1; y > y0; y -= 3) BULBS.push([x0, y]);
}

let M = null, IDX = null, STAMPS = null, BSTAMP = null, IMG = null, E = null, RIP = null;
function init(G) {
  IDX = G.idx; M = S.buildScene(IDX);
  STAMPS = SLOTS.map((sl) => Array.from({ length: 10 }, (_, d) => stamp(sl.style, d, sl.ox, sl.oy, W, H)));
  BSTAMP = stampPaths(BORDER, borderPath(), MBOX.x0 + 0.5, MBOX.y0 + 0.5, W, H);
  IMG = new Float32Array(3 * W * H); E = new Float32Array(3 * W * H); RIP = new Float32Array(W * H);
}

/** Power of a lamp through the hour: cut with a stutter, dark, then flickers back on at ti. */
function power(age, ti, seed, now) {
  if (age < 0.04) return 1;
  if (age < 0.36) { const k = (age - 0.04) / 0.32; return kit.hash(Math.floor(now * 30), seed) > 0.25 + 0.75 * k ? 1 - 0.5 * k : 0.04; }
  if (age < ti) return 0;
  const k = (age - ti) / 0.35;
  return k >= 1 ? 1 : kit.hash(Math.floor(now * 32), seed + 7) < 0.3 + 0.7 * k ? 1 : 0.12;
}
/** A tube striking t seconds ago: the plasma front runs along the glass, the colour warms from orange. */
function strike(t, now, seed) {
  const front = kit.ease.inOut(kit.clamp(t / 0.7)), warm = kit.ease.out(kit.clamp((t - 0.1) / 1.6));
  const flick = t < 0.45 && kit.hash(Math.floor(now * 40), seed + 11) < 0.3 ? 0.35 : 1;
  return { lit: (0.5 + 0.5 * warm) * flick, front, warm, head: t < 0.9 ? 1 - t / 0.9 : 0 };
}
/** What slot i shows now: a list of { d, lit, front, warm, head }. */
function slotDraws(i, age, prev, cur, hour, now) {
  const a = +prev[i], b = +cur[i], steady = { lit: 1, front: 1, warm: 1, head: 0 };
  if (hour) {
    if (age < 0.36) return [{ d: a, ...steady, lit: power(age, 9, 0, now) }];   // one mains: all digits die together
    return age < SLOTS[i].ign ? [] : [{ d: b, ...strike(age - SLOTS[i].ign, now, i) }];
  }
  if (a === b) return [{ d: b, ...steady }];
  if (age < 0.65) {
    const k = age / 0.65, on = kit.hash(Math.floor(now * 28), i >> 1) > 0.2 + 0.65 * k;   // one sign, one supply: its digits stutter together
    return [{ d: a, ...steady, lit: on ? 1 - 0.55 * k : 0.05 }];
  }
  return age < 0.85 ? [] : [{ d: b, ...strike(age - 0.85, now, i) }];
}

/** Add one neon stamp to E. */
function neon(st, col, lit, front, warm, head, now, buzz = null) {
  if (lit <= 0) return 0;
  const c = warm >= 1 ? col : kit.mix(S.ORANGE, col, warm), cc = kit.mix(c, [1, 0.95, 0.95], 0.45);
  for (let k = 0; k < st.n; k++) {
    const s = st.s[k];
    let f = front >= 1 ? 1 : kit.clamp((front * 1.05 - s) / 0.05);
    if (f <= 0) continue;
    if (buzz && s > buzz[0] && s < buzz[1]) f *= buzz[2];
    const I = lit * f * (0.9 + 0.1 * Math.sin(s * 41 - now * 2.6)), co = st.core[k] * I, ha = st.halo[k] * I * 0.5, p = 3 * st.p[k];
    E[p] += cc[0] * co + c[0] * ha; E[p + 1] += cc[1] * co + c[1] * ha; E[p + 2] += cc[2] * co + c[2] * ha;
    if (head > 0) {
      const hd = head * Math.exp(-(((s - front) / 0.035) ** 2)) * (st.core[k] + 0.4 * st.halo[k]);
      E[p] += 0.9 * hd; E[p + 1] += 0.75 * hd; E[p + 2] += 0.95 * hd;
    }
  }
  return lit * front;
}

// the frog's evening: walk in, stop under the hour sign, under the minute sign, walk off
const ROUTE = [[0, -20], [15, 33], [26, 33], [41, 95], [50, 95], [64, 150], [84, 150]], LOOP = 84;
function frogAt(now) {
  const t = now % LOOP;
  for (let k = 0; k + 1 < ROUTE.length; k++) {
    const [t0, x0] = ROUTE[k], [t1, x1] = ROUTE[k + 1];
    if (t < t0 || t >= t1) continue;
    const q = (t - t0) / (t1 - t0), e = x0 === x1 ? 0 : 0.5 - 0.5 * Math.cos(Math.PI * q);
    return { x: x0 + (x1 - x0) * e, walking: x0 !== x1 && q > 0.02 && q < 0.98 };
  }
  return { x: 150, walking: false };
}

function lamp(E, x, y, c, a) {
  const p = 3 * (y * W + x);
  E[p] += c[0] * a; E[p + 1] += c[1] * a; E[p + 2] += c[2] * a;
}
const TV = [0.3, 0.45, 0.95], TUBE = [0.7, 0.95, 0.85], GLASS = [0.55, 0.5, 0.5];

export default {
  name: 'Neon Alley',
  blurb: 'rainy Hong Kong side street: hours on an outline-neon blade sign, minutes on a box sign, all of it rippling in the puddles; lightning re-ignites the street on the hour',
  layouts: ['hub-stair'], look: 'smoke', fps: 60, brightness: 0.36, dither: true, warmup: 0,
  frame(ctx) {
    const G = kit.grid(ctx);
    if (!M) init(G);
    const now = ctx.date.getTime() / 1000, M0 = Math.floor(now / 60) * 60, age = now - M0;
    const cur = digitsOf(ctx.date), prev = digitsOf(new Date((M0 - 60) * 1000));
    const hour = ctx.date.getMinutes() === 0 && age < 6, night = ctx.night;
    const sk = 1 - 0.3 * night;
    E.fill(0);

    // ---- the signs
    const hic = kit.hash(Math.floor(now * 2), 51) < 0.03 && kit.hash(Math.floor(now * 30), 52) < 0.5 ? 0.55 : 1;
    let lb = 0, lm = 0;
    for (let i = 0; i < 4; i++) {
      for (const d of slotDraws(i, age, prev, cur, hour, now)) {
        const v = neon(STAMPS[i][d.d], SLOTS[i].col, d.lit * sk * (i < 2 ? hic : 1), d.front, d.warm, d.head, now);
        if (i < 2) lb += v / 2; else lm += v / 2;
      }
    }
    const burst = kit.hash(Math.floor(now * 2.5), 31) < 0.3 ? (kit.hash(Math.floor(now * 24), 32) > 0.45 ? 0.9 : 0.06) : 1;
    const pB = hour ? power(age, 1.12, 21, now) : 1;
    neon(BSTAMP, S.RED, 0.75 * pB * sk, 1, 1, 0, now, [0.33, 0.47, burst]);
    lm = 0.85 * lm + 0.15 * pB;
    let pbs = 0;
    BULBS.forEach(([x, y], k) => {
      const pw = hour ? power(age, 0.5 + 0.42 * (y / 95), 40 + k, now) : 1;
      const b = pw * sk * (0.1 + 0.9 * (0.5 + 0.5 * Math.cos(kit.TAU * (now * 1.3 - k / 4))) ** 3);
      pbs += pw;
      lamp(E, x, y, S.AMBER, 0.9 * b);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) lamp(E, x + dx, y + dy, S.AMBER, 0.06 * b);
    });
    lb = 0.85 * lb + 0.15 * pbs / BULBS.length;

    // ---- windows and shopfronts
    for (const w of S.WINDOWS) {
      if (w.kind === 'off' || kit.hash(w.k, w.x, 61) < night * 0.75) continue;
      let c = S.WARM, a = 0.2;
      if (w.kind === 'tv') { c = TV; a = 0.16 * (0.5 + 0.5 * kit.noise2(now * 2.3, w.k)); }
      if (w.kind === 'tube') { c = TUBE; a = kit.hash(Math.floor(now * 1.3), 71) < 0.15 && kit.hash(Math.floor(now * 20), 72) < 0.5 ? 0.03 : 0.17; }
      if (hour) a *= power(age, 1.6 + 0.9 * kit.hash(w.k, w.x), 80 + w.k + w.x, now);
      for (let y = w.y + 1; y < w.y + w.h - 1; y++) for (let x = w.x + 1; x < w.x + w.w - 1; x++) lamp(E, x, y, c, a * (x >= w.x + w.w - 2 ? 0.45 : 1));
    }
    const pS1 = hour ? power(age, 1.05, 91, now) : 1, pS2 = hour ? power(age, 1.5, 92, now) : 1;
    for (let x = 11; x <= 52; x++) {
      const mull = (x - 11) % 8 === 0;
      for (let y = 99; y < 104; y++) lamp(E, x, y, S.WARM, mull ? 0.02 : 0.2 * pS1);
      const sway = Math.sin(now * 1.1 + x * 0.4) > -0.6 || (x % 4) ? 1 : 0;   // noren curtain, slit and swaying
      if (!mull && sway) lamp(E, x, 99, S.RED, 0.3 * pS1);
    }
    for (let x = 67; x <= 124; x++) for (let y = 101; y < 104; y++) lamp(E, x, y, S.WARM, (x - 67) % 10 === 0 ? 0.02 : 0.17 * pS2);
    const ld = 0.5 * (pS1 + pS2);

    // ---- light the street above the ground line
    const F = flash(now), L = { b: lb, m: lm, f: F, d: ld };
    const amb = 1 - 0.4 * night, A = M.A;
    const lr0 = S.AMB[0] * amb, lg0 = S.AMB[1] * amb, lb0 = S.AMB[2] * amb;
    const kb = 0.3 * lb, km = 0.3 * lm;
    const br = kb * S.PINK[0], bg = kb * S.PINK[1], bb = kb * S.PINK[2], mr = km * S.CYAN[0], mg = km * S.CYAN[1], mbb = km * S.CYAN[2];
    const dr = 0.6 * ld * S.WARM[0], dg = 0.6 * ld * S.WARM[1], db = 0.6 * ld * S.WARM[2];
    const fr = 3.2 * F * S.FLASH[0], fg = 3.2 * F * S.FLASH[1], fb = 3.2 * F * S.FLASH[2];   // the flash shows the whole alley for an instant
    for (let p = 0; p < W * H; p++) {
      if (IDX[p] < 0) continue;
      const B = M.mB[p], Mm = M.mM[p], D = M.mD[p], Fl = M.mF[p], q = 3 * p;
      IMG[q] = A[q] * (lr0 + br * B + mr * Mm + dr * D + fr * Fl) + E[q];
      IMG[q + 1] = A[q + 1] * (lg0 + bg * B + mg * Mm + dg * D + fg * Fl) + E[q + 1];
      IMG[q + 2] = A[q + 2] * (lb0 + bb * B + mbb * Mm + db * D + fb * Fl) + E[q + 2];
    }
    steam(IMG, IDX, M, L, now, 1 - 0.3 * night);

    // ---- the wet street: reflections, bent by the ripples
    RIP.fill(0, GROUND * W);
    rain(IMG, IDX, RIP, M, L, now, 1, false);
    drips(IMG, IDX, RIP, M, L, now, 1, false);
    for (let y = GROUND; y < H; y++) {
      const ys0 = GROUND - 0.5 - (y - GROUND + 0.5) * 1.75, fres = 0.85 - 0.3 * (y - GROUND) / (H - GROUND);
      for (let x = 0; x < W; x++) {
        const p = y * W + x, r = RIP[p];
        const xs = kit.clamp(x + 2.2 * r + 0.45 * Math.sin(y * 1.7 + now * 2.1 + x * 0.06), 0, W - 1.001);
        const ys = Math.max(ys0 + 1.2 * r, x >= 64 ? 64 : 0), k = M.wet[p] * fres * (1 + 1.2 * r) * 0.5;
        const x0 = Math.floor(xs), fx = xs - x0;
        for (const yy of [ys, ys - 1.7]) {
          const y0 = Math.floor(yy), fy = yy - y0, a = 3 * (y0 * W + x0), b = a + 3 * W;
          for (let c = 0; c < 3; c++) {
            const top = IMG[a + c] + (IMG[a + 3 + c] - IMG[a + c]) * fx, bot = IMG[b + c] + (IMG[b + 3 + c] - IMG[b + c]) * fx;
            IMG[3 * p + c] += (top + (bot - top) * fy) * k;
          }
        }
      }
    }

    // ---- the frog, then rain and drips over everything
    const fg0 = frogAt(now);
    if (fg0.x > -20 && fg0.x < 145) {
      const hop = hour && age < 0.75 ? 5 * Math.sin(Math.PI * age / 0.75) : 0;
      const look = hour && age < 2 ? [0, -1.2] : fg0.walking ? [1, 0.2] : [0, -1.1];
      const lt = [lr0 + F * 0.5 + 0.25 * ld, lg0 + F * 0.5 + 0.18 * ld, lb0 + F * 0.6 + 0.12 * ld];
      S.drawFrog(IMG, IDX, fg0.x, 126.2 - hop, fg0.x / 3.3, look, 0.85 * (1 - 0.3 * night), lt);
    }
    rain(IMG, IDX, RIP, M, L, now, 1 - 0.3 * night, true);
    drips(IMG, IDX, RIP, M, L, now, 1 - 0.3 * night, true);
    kit.blitGrid(ctx, IMG, 1 - 0.25 * night);
  },
};
