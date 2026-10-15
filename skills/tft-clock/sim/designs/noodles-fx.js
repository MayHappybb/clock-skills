// The flourishes of "noodles": steam, shichimi, chili oil, and the chef's
// hand-pulled dough at the hour (1, 2, 4, 8 strands). All closed form in the second of the
// minute; nothing is simulated.

import { sin, hash, rand, ease, progress } from '../js/kit.js';
import { C, W, H, bedToScreen } from './noodles-bowl.js';

const sm = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

function blend565(d, s, a) {
  const dr = d >> 11, dg = (d >> 5) & 63, db = d & 31, sr = s >> 11, sg = (s >> 5) & 63, sb = s & 31;
  return ((((dr * (16 - a) + sr * a) >> 4) << 11) | (((dg * (16 - a) + sg * a) >> 4) << 5) | ((db * (16 - a) + sb * a) >> 4));
}

// ------------------------------------------------------------ steam

/** Three wisps rising off the broth across the top of the bowl: flat menu-print steam marks. */
export function steam(g, PAL, T, strength) {
  for (let k = 0; k < 3; k++) {
    const per = 4.2, ph = T / per + k / 3, cyc = Math.floor(ph), u = ph - cyc;
    const x0 = 22 + ((hash(cyc, k, 13) % 100) / 100) * 116 + k * 7;
    const y0 = 24 - u * 30;
    const a = 0.3 * strength * sm(u / 0.25) * (1 - sm((u - 0.6) / 0.4));
    if (a < 0.02) continue;
    let px = x0 + 2.2 * sin(y0 * 0.32 + T * 1.7 + k), py = y0;
    for (let j = 1; j <= 5; j++) {
      const y = y0 - j * 3, x = x0 + 2.2 * sin(y * 0.32 + T * 1.7 + k);
      if (y < 20 && py > -3) g.thickLine(px, py, x, y, 1.3, PAL[C.STEAM], { aa: true, a });
      px = x; py = y;
    }
  }
}

// ------------------------------------------------------------ :30 shichimi

const SPECKS = 24;
/** A shake of shichimi togarashi rains in at :30 and floats round with the broth, thinning out. */
export function shichimi(g, PAL, s, theta, thetaAt) {
  if (s < 30 || s > 46) return;
  const cols = [C.CHILI, C.CHILI2, C.CHILI, C.SESAME];
  for (let k = 0; k < SPECKS; k++) {
    const tl = 30 + 0.9 * rand(k, 31);
    if (s < tl) continue;
    if (s > 38 + 8 * rand(k, 32)) continue;            // sunk
    // where it landed, then carried by the broth from there
    const lx = 30 + 100 * rand(k, 33), ly = 4 + 20 * rand(k, 34);
    const th0 = thetaAt(tl);
    const c0 = Math.cos(th0), s0 = Math.sin(th0);
    const dx = lx - 80, dy = ly - 40;
    const u = c0 * dx + s0 * dy + 128, v = -s0 * dx + c0 * dy + 128;
    const [x, y] = bedToScreen(u, v, theta);
    if (x < 0 || x >= W || y < 0 || y >= H) continue;
    const t = s - tl;
    if (t < 0.25) g.circle(x, y, 1 + t * 8, PAL[C.RIP1]);
    g.fillRect(Math.round(x), Math.round(y), 1 + (k & 1), 1 + ((k >> 1) & 1 ? 1 : 0), PAL[cols[k & 3]]);
  }
}

// ------------------------------------------------------------ :45 chili oil

const RAYU_SPOTS = [[118, 14], [30, 12], [100, 22], [140, 8]];
/** A drop of rayu lands at :45 and blooms into a ring of red oil that breaks into beads. */
export function rayu(g, PAL, s, mk) {
  if (s < 45 || s > 53) return;
  const t = s - 45, [x, y] = RAYU_SPOTS[hash(mk, 45) % RAYU_SPOTS.length];
  const a = 1 - sm((t - 5) / 3);
  if (t < 0.3) { g.fillCircle(x, y, 1.6, PAL[C.RAYU], { aa: true }); return; }
  const r = 2 + 9 * ease.outCubic(progress(t, 0.3, 3)), w = 2.4 - 1.2 * progress(t, 0.3, 3);
  g.ring(x, y, r - w / 2, r + w / 2, PAL[C.RAYU], { aa: true, a: 0.85 * a });
  g.fillCircle(x, y, 1.6 * (1 - progress(t, 0.3, 1.5)), PAL[C.RAYU], { aa: true, a });
  for (let k = 0; k < 6; k++) {
    const an = (k / 6) * Math.PI * 2 + 0.4, q = r + 1.5 + 4 * progress(t, 1.2, 5);
    g.fillCircle(x + Math.cos(an) * q, y + Math.sin(an) * q * 0.9, 1.1 * a, PAL[C.RAYU], { aa: true, a: a * progress(t, 1, 1.6) });
  }
}

// ------------------------------------------------------------ the hour: the chef's pull

export const PULL_T0 = 1.6, PULL_END = 11.6;
const FOLD_T = [3.2, 4.9, 6.6];      // each fold doubles the strands: 1, 2, 4, 8
const DROP_T = 9.0;

/**
 * The hank at second `s` after the hour: { n strands, y centres, width,
 * dy (bounce), fall (0..1) } or null. Strands span the whole glass.
 */
function hank(s) {
  if (s < PULL_T0 || s > DROP_T + 1.2) return null;
  let k = 0;
  while (k < FOLD_T.length && s >= FOLD_T[k]) k++;
  // k folds done; the last one may still be splitting
  const split = k > 0 ? ease.outCubic(progress(s, FOLD_T[k - 1], FOLD_T[k - 1] + 0.45)) : 1;
  const n = 1 << k;
  const band = [0, 6, 11, 16][k], bandPrev = [0, 0, 6, 11][k];
  const H0 = bandPrev + (band - bandPrev) * split;
  const wid = [5, 3.2, 2.2, 1.5][k], widPrev = [5, 5, 3.2, 2.2][k];
  const w = widPrev + (wid - widPrev) * split;
  // the slap: each fold is thrown down and caught
  let dy = 0;
  for (const tf of FOLD_T) { const q = s - tf + 0.35; if (q > 0 && q < 0.9) dy += 4 * sin(q * Math.PI / 0.45) * (1 - q / 0.9); }
  const enter = ease.outBack(progress(s, PULL_T0, PULL_T0 + 0.9));
  const fall = ease.inQuad(progress(s, DROP_T, DROP_T + 1.0));
  return { n, H0, w, dy: dy - 18 * (1 - enter) + 80 * fall, split, k, fall };
}

/**
 * Draw the hank: n strands of pale dough across the top of the bowl,
 * swinging in a travelling wave. `under`: draw only the falling hank
 * (under the noodles) or only the held one (over them).
 */
export function pull(g, PAL565, s, under) {
  const hk = hank(s);
  if (!hk) return;
  const falling = hk.fall > 0;
  if (falling !== under) return;
  const buf = g.buf, YC = 9.5 + hk.dy;
  const dough = PAL565[C.DOUGH], key = PAL565[C.KEY], bed = PAL565[C.BED2];
  const col = falling ? blend565(dough, bed, (hk.fall * 14) | 0) : dough;
  let px = 0, bl = 0;
  for (let i = 0; i < hk.n; i++) {
    // strand i of n: after a fold, strand pairs part from where their parent was
    const parent = i >> 1, np = hk.n >> 1;
    const yNew = hk.n === 1 ? 0 : (i / (hk.n - 1) - 0.5) * hk.H0;
    const yPar = np <= 1 ? 0 : (parent / (np - 1) - 0.5) * hk.H0;
    const yi = hk.k === 0 ? 0 : yPar + (yNew - yPar) * hk.split;
    const amp = 2.6, ph = i * 0.12;
    const hw = hk.w / 2, keyed = !falling;
    for (let x = 0; x < W; x++) {
      const yc = YC + yi + amp * sin(x * 0.06 - s * 5 + ph) + 1.2 * sin(x * 0.17 + s * 3 + ph);
      const top = yc - hw - (keyed ? 1 : 0), bot = yc + hw + (keyed ? 1 : 0);
      let y0 = Math.ceil(top - 0.5), y1 = Math.floor(bot - 0.5);
      if (!under && y1 > 18) y1 = 18;                 // held above the bowl: never over the time
      for (let y = y0; y <= y1; y++) {
        if (y < 0 || y >= H) continue;
        const yy = y + 0.5;
        const inFill = yy > yc - hw && yy < yc + hw;
        buf[y * W + x] = inFill || !keyed ? col : key; px++;
      }
      // soft ends of the span
      const ft = top - (y0 - 0.5), fb = (y1 + 1.5) - bot;
      if (y0 - 1 >= 0 && y0 - 1 < H && ft > 0) { const a = 16 - ((ft * 16) | 0); if (a > 0 && a < 16) { buf[(y0 - 1) * W + x] = blend565(buf[(y0 - 1) * W + x], keyed ? key : col, a); bl++; } }
      if (y1 + 1 >= 0 && y1 + 1 < H && (under || y1 + 1 <= 18) && fb > 0) { const a = 16 - ((fb * 16) | 0); if (a > 0 && a < 16) { buf[(y1 + 1) * W + x] = blend565(buf[(y1 + 1) * W + x], keyed ? key : col, a); bl++; } }
    }
  }
  g.cost.px += px; g.cost.blend += bl; g.cost.box += hk.n * W * 6;
}

/** Is the chef's pull on (the chopsticks keep out of it)? */
export const pulling = (s) => s >= PULL_T0 - 0.6 && s < PULL_END;
/** The splash when the hank lands: seconds since, or -1. */
export const landed = (s) => (s >= DROP_T + 0.8 && s < DROP_T + 4 ? s - DROP_T - 0.8 : -1);
