// Fireworks night over the harbour. The time is a lancework set piece on a
// barge: lettering built from rows of single lances, each a sputtering spark
// that drips slag and puffs smoke, the smoke lit from below. Shells burst
// over the skyline now and then (peony, chrysanthemum, willow, palm,
// crossette: closed-form drag and gravity), and everything is mirrored in
// rippling water. A changing digit burns out lance by lance; a quickmatch
// fuse then runs along the new digit's frame and lights it. The hour is a
// finale in the new hour's colour: Catherine wheels (the colon), mines from
// the barge, a barrage overhead.
import * as kit from '../js/kit.js';
import { GLYPHS, GH } from './fireworks-glyphs.js';

const N = 128, WL = 78, DECK = 74, TOP = 26, SLANT = 0.1;
const SLOTX = [6, 33, 71, 98];
const COLX = 61.6, COLY = [38.5, 50.5];
const LS = 64;                                   // smoke grid (2 px cells)

const img = new Float32Array(N * N * 3);
const src = new Float32Array(LS * LS * 3);       // lance light, coarse
const near = new Float32Array(LS * LS * 3);      // lancework smoke light
const far = new Float32Array(LS * LS * 3);       // shell smoke light
const tex = new Float32Array(LS * LS);

const HOURCOL = ['#ff2414', '#28ff4a', '#a050ff', '#22a0ff', '#ff7a10', '#ff3c8c'].map(kit.hex);
const MINCOL = [1, 0.74, 0.42];
const GOLD = [1, 0.55, 0.16], EMBER = [1, 0.28, 0.04], WHITE = [1, 1, 1];
const SHELLCOL = ['#ff2a18', '#30ff58', '#2e8cff', '#ffd040', '#b060ff', '#ffffff'].map(kit.hex);

// ------------------------------------------------------------ drawing
function dot(x, y, r, g, b) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  for (let j = 0; j < 2; j++) {
    const yy = iy + j;
    if (yy < 0 || yy >= N) continue;
    const wy = j ? fy : 1 - fy;
    for (let i = 0; i < 2; i++) {
      const xx = ix + i;
      if (xx < 0 || xx >= N) continue;
      const w = wy * (i ? fx : 1 - fx), p = 3 * (yy * N + xx);
      img[p] += r * w; img[p + 1] += g * w; img[p + 2] += b * w;
    }
  }
}
function glow(x, y, R, r, g, b) {
  const x0 = Math.max(0, Math.ceil(x - R)), x1 = Math.min(N - 1, Math.floor(x + R));
  const y0 = Math.max(0, Math.ceil(y - R)), y1 = Math.min(N - 1, Math.floor(y + R)), R2 = R * R;
  for (let yy = y0; yy <= y1; yy++) {
    const dy = yy - y;
    for (let xx = x0; xx <= x1; xx++) {
      const dx = xx - x, w = 1 - (dx * dx + dy * dy) / R2;
      if (w <= 0) continue;
      const p = 3 * (yy * N + xx), f = w * w;
      img[p] += r * f; img[p + 1] += g * f; img[p + 2] += b * f;
    }
  }
}
/** Soft blob into a coarse grid, in pixel coordinates. */
function blob(G, x, y, R, r, g, b) {
  const cx = x / 2, cy = y / 2, Rc = R / 2;
  const x0 = Math.max(0, Math.ceil(cx - Rc)), x1 = Math.min(LS - 1, Math.floor(cx + Rc));
  const y0 = Math.max(0, Math.ceil(cy - Rc)), y1 = Math.min(LS - 1, Math.floor(cy + Rc)), R2 = Rc * Rc;
  for (let yy = y0; yy <= y1; yy++) {
    const dy = yy - cy;
    for (let xx = x0; xx <= x1; xx++) {
      const dx = xx - cx, w = 1 - (dx * dx + dy * dy) / R2;
      if (w <= 0) continue;
      const p = 3 * (yy * LS + xx), f = w * w;
      G[p] += r * f; G[p + 1] += g * f; G[p + 2] += b * f;
    }
  }
}
/** Add a coarse grid, bilinear and textured, onto rows y0..y1 of img. */
function upsample(G, y0, y1, texMix) {
  for (let y = y0; y < y1; y++) {
    const gy = Math.min(LS - 1.001, Math.max(0, (y - 0.5) / 2)), iy = Math.floor(gy), fy = gy - iy;
    for (let x = 0; x < N; x++) {
      const gx = Math.min(LS - 1.001, Math.max(0, (x - 0.5) / 2)), ix = Math.floor(gx), fx = gx - ix;
      const a = iy * LS + ix, b = a + 1, c = a + LS, d = c + 1;
      const wa = (1 - fx) * (1 - fy), wb = fx * (1 - fy), wc = (1 - fx) * fy, wd = fx * fy;
      const t = 1 - texMix + texMix * (tex[a] * wa + tex[b] * wb + tex[c] * wc + tex[d] * wd);
      const p = 3 * (y * N + x);
      for (let k = 0; k < 3; k++) img[p + k] += t * (G[3 * a + k] * wa + G[3 * b + k] * wb + G[3 * c + k] * wc + G[3 * d + k] * wd);
    }
  }
}
// ------------------------------------------------------------ skyline
const skyTop = new Int16Array(N).fill(WL);
const windows = [];
{
  let x = 0, b = 0;
  while (x < N) {
    const w = 4 + Math.floor(kit.hash(b, 1) * 8), h = 3 + Math.floor(kit.hash(b, 2) ** 1.7 * 19);
    for (let i = 0; i < w && x + i < N; i++) skyTop[x + i] = WL - h;
    if (kit.hash(b, 3) > 0.8) { const sx = x + (w >> 1); if (sx < N) skyTop[sx] = WL - h - 5; }
    for (let yy = WL - h + 2; yy < DECK; yy += 2)
      for (let xx = x + 1; xx < x + w - 1 && xx < N; xx += 2) if (kit.hash(xx, yy, 5) > 0.82) windows.push([xx, yy, kit.hash(xx, yy, 6)]);
    x += w + (kit.hash(b, 4) > 0.65 ? 1 : 0); b++;
  }
}

// ------------------------------------------------------------- shells
const TYPES = {
  peony: { n: 70, sp: 74, k: 2.3, g: 15, life: 1.5, J: 2, dt: 0.03 },
  chrys: { n: 56, sp: 76, k: 2.3, g: 15, life: 1.7, J: 7, dt: 0.035, gold: 1 },
  willow: { n: 48, sp: 46, k: 1.45, g: 10, life: 3.4, J: 13, dt: 0.07, glit: 1, gold: 1 },
  palm: { n: 8, sp: 80, k: 1.7, g: 13, life: 2.0, J: 14, dt: 0.035, big: 1, gold: 1 },
  crossette: { n: 10, sp: 56, k: 1.8, g: 12, life: 1.7, J: 3, dt: 0.03, split: 0.55 },
};
const ORDER = ['peony', 'chrys', 'willow', 'peony', 'palm', 'crossette', 'chrys', 'willow'];

function mkShell(seed, tl, col, big) {
  const h = (i) => kit.hash(seed, i, 77);
  const type = TYPES[ORDER[Math.floor(h(1) * ORDER.length)]];
  const x0 = 14 + h(2) * 100;
  return {
    seed, tl, type, x0, xb: x0 + (h(3) - 0.5) * 16, yb: (big ? 3 : 6) + h(4) * (big ? 9 : 15), tr: 0.95 + h(5) * 0.35,
    col: col ?? SHELLCOL[Math.floor(h(6) * SHELLCOL.length)], rot: h(7) * kit.TAU, size: big ? 0.9 : 0.8 + 0.3 * h(8),
  };
}
function listShells(T, night, H0, hourCol, out) {
  out.length = 0;
  const P = 1.45;
  for (let k = Math.floor((T - 7) / P); k <= Math.floor(T / P); k++) {
    if (kit.hash(k, 11) > 0.5 * (1 - 0.6 * night)) continue;
    const tl = k * P + kit.hash(k, 12) * P;
    if (tl <= T) out.push(mkShell(k, tl, null, false));
  }
  // the hour's finale: a barrage in the new hour's colour
  for (let j = 0; j < 18; j++) {
    const tl = H0 - 1.1 + j * 0.52 + kit.hash(j, H0 | 0, 3) * 0.3;
    if (tl <= T && T - tl < 7) {
      const s = mkShell(9000 + j + H0, tl, j % 4 === 3 ? WHITE : hourCol, true);
      out.push(s);
    }
  }
  return out;
}

const traj = (b, v, k, a) => b + v * (1 - Math.exp(-k * a)) / k;
const trajY = (b, v, k, g, a) => b + (v - g / k) * (1 - Math.exp(-k * a)) / k + (g * a) / k;

/** One star (with trail) from (xb, yb), velocity (vx, vy), at age a. */
function star(xb, yb, vx, vy, k, g, a, amp, col, tcol, J, dt, R) {
  const x = traj(xb, vx, k, a), y = trajY(yb, vy, k, g, a);
  dot(x, y, col[0] * amp * 0.7, col[1] * amp * 0.7, col[2] * amp * 0.7);
  dot(Math.round(x), Math.round(y), col[0] * amp * 0.7, col[1] * amp * 0.7, col[2] * amp * 0.7);
  const gr = R ? 0.3 : 0.16;
  glow(x, y, R || 1.6, col[0] * amp * gr, col[1] * amp * gr, col[2] * amp * gr);
  for (let j = 1; j <= J; j++) {
    const aj = a - j * dt;
    if (aj < 0) break;
    const f = amp * 0.55 * (1 - j / (J + 1)) ** 1.4;
    dot(traj(xb, vx, k, aj), trajY(yb, vy, k, g, aj), tcol[0] * f, tcol[1] * f, tcol[2] * f);
  }
  return [x, y];
}

function drawShell(S, T) {
  const ty = S.type, h = (i, j = 0) => kit.hash(S.seed * 131 + i, j, 5);
  const u = (T - S.tl) / S.tr;
  if (u < 1) {                                         // the rising comet
    const e = kit.ease.out(u);
    for (let j = 0; j < 7; j++) {
      const uj = u - j * 0.025;
      if (uj < 0) break;
      const ej = kit.ease.out(uj), f = (j ? 0.25 : 0.7) * (1 - j / 7) * (0.7 + 0.6 * kit.hash(S.seed, j, Math.floor(T * 30)));
      dot(kit.lerp(S.x0, S.xb, ej), kit.lerp(WL, S.yb, ej), GOLD[0] * f, GOLD[1] * f, GOLD[2] * f);
    }
    return;
  }
  const a = T - S.tl - S.tr, sz = S.size;
  if (a < 0.2) { const f = 0.3 * Math.exp(-a * 22) * sz; glow(S.xb, S.yb, 6 * sz, S.col[0] * f, S.col[1] * f, S.col[2] * f); }
  const sp = ty.sp * sz, n = ty.n;
  for (let i = 0; i < n; i++) {
    const z = 1 - (2 * (i + 0.5)) / n, r = Math.sqrt(1 - z * z), ph = i * 2.39996 + S.rot;
    const s = sp * (0.9 + 0.15 * h(i)), vx = s * r * Math.cos(ph), vy = s * r * Math.sin(ph);
    const life = ty.life * (0.85 + 0.3 * h(i, 1));
    if (a > life) continue;
    let amp = a < life * 0.65 ? 1 : 1 - (a - life * 0.65) / (life * 0.35);
    amp *= 0.6 + 0.4 * Math.abs(z) ** 0.5;
    if (ty.glit) amp *= kit.hash(S.seed * 97 + i, Math.floor(T * 22)) > 0.45 ? 1.3 : 0.25;
    const hot = kit.smoothstep(0, 0.3, a), col = ty.gold && !ty.big ? (ty.glit ? GOLD : S.col) : S.col;
    const c = [kit.lerp(1, col[0], hot), kit.lerp(1, col[1], hot), kit.lerp(1, col[2], hot)];
    const tcol = ty.gold ? GOLD : col;
    if (ty.split && a > ty.split) {
      const ts = ty.split, x1 = traj(S.xb, vx, ty.k, ts), y1 = trajY(S.yb, vy, ty.k, ty.g, ts);
      const e = Math.exp(-ty.k * ts), wx = vx * e, wy = vy * e + (ty.g / ty.k) * (1 - e), a2 = a - ts;
      if (a2 < 0.08) glow(x1, y1, 2.5, 0.8, 0.8, 0.8);
      for (let m = 0; m < 4; m++) {
        const q = ph + Math.PI / 4 + (m * Math.PI) / 2;
        star(x1, y1, wx + 26 * Math.cos(q), wy + 26 * Math.sin(q), ty.k, ty.g, a2, amp * 0.9, c, tcol, 4, 0.03, 0);
      }
    } else {
      star(S.xb, S.yb, vx, vy, ty.k, ty.g, a, amp * (ty.big ? 1.2 : 0.95), c, tcol, ty.J, ty.dt, ty.big ? 1.8 : 0);
    }
  }
}
// ------------------------------------------------------------ lancework
const FUSE = 1.5;                                   // seconds for the quickmatch to run a digit
const px = (slot, gx, gy) => SLOTX[slot] + gx + (GH - gy) * SLANT;
const py = (gy) => TOP + gy;
/** Burn-out time of a lance (seconds before the minute) from its place on the path. */
const tauOut = (s, L) => -1.3 + 0.95 * (s / L);
/** Ignition age of a lance, from the eased fuse run. */
const uIgn = (s, L) => Math.acos(kit.clamp(1 - 2 * (s / L), -1, 1)) / Math.PI;

function fuseAt(G, s) {
  const d = G.dense;
  let i = Math.min(d.length - 1, Math.max(0, Math.round(s / 0.5)));
  while (i > 0 && d[i][2] > s) i--;
  while (i < d.length - 1 && d[i + 1][2] <= s) i++;
  return d[i];
}

function addSrc(x, y, r, g, b) {
  const cx = x / 2 - 0.25, cy = y / 2 - 0.25, ix = Math.floor(cx), iy = Math.floor(cy);
  if (ix < 0 || iy < 0 || ix >= LS - 1 || iy >= LS - 1) return;
  const fx = cx - ix, fy = cy - iy;
  const w = [(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy], o = [0, 1, LS, LS + 1];
  for (let q = 0; q < 4; q++) { const p = 3 * (iy * LS + ix + o[q]); src[p] += r * w[q]; src[p + 1] += g * w[q]; src[p + 2] += b * w[q]; }
}

function lance(x, y, I, white, col, id, T) {
  const sway = 0.35 * Math.sin(T * 7.3 + id * 1.7);
  // x, y are whole pixels: a lance is one hard white-hot point
  const cw = 0.3 + 0.7 * white, a = I * 1.15;
  dot(x, y, kit.lerp(col[0], 1, cw) * a, kit.lerp(col[1], 1, cw) * a, kit.lerp(col[2], 1, cw) * a);
  // the spark's spray: a cross of its colour round the white point
  const s = I * 0.32;
  dot(x - 1, y, col[0] * s, col[1] * s, col[2] * s); dot(x + 1, y, col[0] * s, col[1] * s, col[2] * s);
  dot(x, y + 1, col[0] * s * 0.6, col[1] * s * 0.6, col[2] * s * 0.6);
  glow(x, y - 0.5, 2.6, col[0] * I * 0.05, col[1] * I * 0.05, col[2] * I * 0.05);
  // the flame: a flickering tongue licking up from the lance, leaning downwind
  const fl = 0.7 + 0.6 * kit.noise2(id * 5.7, T * 17), f = I * 0.5 * fl;
  dot(x + sway * 0.5, y - 1, col[0] * f, col[1] * f, col[2] * f);
  dot(x + sway + 0.25, y - 2 - 0.6 * fl, col[0] * f * 0.35, col[1] * f * 0.3, col[2] * f * 0.3);
  addSrc(x, y, col[0] * I, col[1] * I, col[2] * I);
}

// lit lances are queued so the dark halo of the frame can be cut before any is drawn
const Q = new Float32Array(9 * 800), QC = [];
let qn = 0;
function queue(x, y, I, white, col, id, steady) {
  if (qn >= 800) return;
  const o = 9 * qn++;
  Q[o] = x; Q[o + 1] = y; Q[o + 2] = I; Q[o + 3] = white; Q[o + 4] = col[0]; Q[o + 5] = col[1]; Q[o + 6] = col[2]; Q[o + 7] = id; Q[o + 8] = steady;
}
/** The lath behind each burning lance hides the far sky: a dark margin round the lettering. */
function halos() {
  for (let q = 0; q < qn; q++) {
    const x = Q[9 * q], y = Q[9 * q + 1], k = 1 - 0.85 * Math.min(1, Q[9 * q + 2]);
    for (let yy = y - 3; yy <= y + 1; yy++) {
      if (yy < 0 || yy >= N) continue;
      for (let xx = x - 1; xx <= x + 1; xx++) {
        if (xx < 0 || xx >= N) continue;
        const p = 3 * (yy * N + xx);
        img[p] *= k; img[p + 1] *= k; img[p + 2] *= k;
      }
    }
  }
}
function drawQueue(T, wind) {
  for (let q = 0; q < qn; q++) {
    const o = 9 * q, x = Q[o], y = Q[o + 1], I = Q[o + 2], id = Q[o + 7];
    const col = [Q[o + 4], Q[o + 5], Q[o + 6]];
    lance(x, y, I, Q[o + 3], col, id, T);
    // each lance breathes out puffs of smoke that rise, spread and drift, lit by its flame
    const P = 1.5, off = kit.hash(id, 21) * P;
    for (let m = 0; m < 2; m++) {
      const a = ((T + off) % P) + m * P, e = Math.exp(-a * 1.1), d = kit.smoothstep(0, 0.25, a) * Math.exp(-a / 1.6);
      const xx = x + wind * a * 1.1 + 1.2 * Math.sin(a * 2.3 + id), yy = y - 2 - 5.5 * a;
      const lit = 0.045 * I * e;
      blob(near, xx, yy, 2 + 3.2 * a, (col[0] * lit + 0.0015) * d, (col[1] * lit + 0.0015) * d, (col[2] * lit + 0.002) * d);
    }
  }
}

function spark(x0, y0, vx, vy, k, g, a, amp, c0, c1) {
  const x = traj(x0, vx, k, a), y = trajY(y0, vy, k, g, a);
  dot(x, y, kit.lerp(c0[0], c1[0], 1 - amp) * amp, kit.lerp(c0[1], c1[1], 1 - amp) * amp, kit.lerp(c0[2], c1[2], 1 - amp) * amp);
}

/** Draw one slot's digit: steady, burning out (rel < 0) or igniting (u >= 0). */
function drawDigit(slot, digit, col, mode, t, T) {
  const G = GLYPHS[digit], L = G.len, ls = G.lances;
  for (let i = 0; i < ls.length; i++) {
    const [gx, gy, s] = ls[i], x = Math.round(px(slot, gx, gy)), y = Math.round(py(gy)), id = slot * 97 + digit * 1013 + i;
    let I = 0.82 + 0.18 * kit.noise2(id * 3.1, T * 11), white = 0, c = col;
    const pop = kit.hash(id, Math.floor(T * 8)) > 0.978;
    if (mode === 1) {                                       // burning out, t = seconds to the minute (< 0)
      const a = t - tauOut(s, L);
      if (a > 0) {
        if (a < 0.11) { I = 1.9; white = 0.8; }
        else { const e = 0.4 * Math.exp(-(a - 0.11) * 7) * (1 - kit.smoothstep(-0.25, 0, t)); if (e < 0.012) continue; dot(x, y, EMBER[0] * e, EMBER[1] * e, EMBER[2] * e); addSrc(x, y, e, e * 0.3, 0); continue; }
      }
    } else if (mode === 2) {                                // igniting, t = fuse progress 0..1+
      const ui = uIgn(s, L);
      if (t < ui) continue;
      const a = (t - ui) * FUSE;
      I *= 1 + 1.4 * Math.exp(-a * 7); white = Math.exp(-a * 5);
    }
    if (pop) {
      I *= 1.5; white = Math.max(white, 0.6);
      const a = T * 8 - Math.floor(T * 8), q = kit.hash(id, Math.floor(T * 8), 2);
      spark(x, y, (q - 0.5) * 30, -12 - 14 * q, 3, 45, a / 8 * 2.2, 0.7 * (1 - a), WHITE, GOLD);
    }
    queue(x, y, I, white, c, id, mode === 0 ? 1 : 0);
    // a drip of slag now and then
    const P = 3.1, off = kit.hash(id, 3) * P, q = Math.floor((T + off) / P);
    if (mode === 0 && kit.hash(id, q, 4) < 0.06) {
      const a = T + off - q * P - kit.hash(id, q, 5) * 1.6;
      if (a > 0 && a < 1.1) {
        const yy = y + 1 + 0.5 * 55 * a * a, f = 0.5 * (1 - a / 1.1);
        if (yy < DECK - 0.5) { dot(x, yy, EMBER[0] * f, EMBER[1] * f, EMBER[2] * f); dot(x, yy - 1.2, EMBER[0] * f * 0.3, EMBER[1] * f * 0.3, 0); }
      }
    }
  }
  if (mode === 2 && t >= 0 && t <= 1) {                     // the quickmatch fuse head and its sputter
    const tf = t * FUSE, d = fuseAt(G, L * (1 - Math.cos(Math.PI * t)) / 2);
    const x = px(slot, d[0], d[1]), y = py(d[1]);
    glow(x, y, 3.4, 0.35, 0.28, 0.14);
    dot(x, y, 1.4, 1.3, 1.1);
    addSrc(x, y, 2, 1.6, 1);
    const dtE = 0.016;
    for (let j = 0; j < 20; j++) {
      const te = Math.floor(tf / dtE) * dtE - j * dtE;
      if (te < 0) break;
      const a = tf - te, hq = kit.hash(Math.round(te / dtE), slot, 9), life = 0.18 + 0.2 * hq;
      if (a > life) continue;
      const ut = te / FUSE, dd = fuseAt(G, L * (1 - Math.cos(Math.PI * ut)) / 2);
      const ang = -Math.PI / 2 + (hq - 0.5) * 3.4, spd = 18 + 26 * kit.hash(j, Math.round(te / dtE), 4);
      spark(px(slot, dd[0], dd[1]), py(dd[1]), spd * Math.cos(ang), spd * Math.sin(ang), 4, 50, a, 0.8 * (1 - a / life) ** 1.5, WHITE, GOLD);
    }
  }
}

/** Smoke puffs from a digit's burnt-out lances, rel = seconds since the minute (from -1.6). */
function puffs(slot, digit, col, rel, wind) {
  const G = GLYPHS[digit], L = G.len;
  for (const [gx, gy, s] of G.lances) {
    const a = rel - tauOut(s, L);
    if (a < 0 || a > 3.2) continue;
    const x = px(slot, gx, gy) + wind * a, y = py(gy) - 5 * a - 1.5 * a * a, d = Math.exp(-a / 1.3) * kit.smoothstep(0, 0.15, a);
    const lit = 0.1 * Math.exp(-a * 2.5);
    blob(near, x, y, 2.5 + 4.5 * a, (col[0] * lit + 0.012) * d, (col[1] * lit * 0.8 + 0.011) * d, (col[2] * lit * 0.6 + 0.012) * d);
  }
}

// ------------------------------------------- Catherine wheels and mines
function wheel(cx, cy, T, fin, col, dir) {
  const om = 5.6 * dir, nj = 3, v0 = 9 + 11 * fin, life = 0.38 + 0.4 * fin, rw = 1.5 + 0.8 * fin, dtE = 0.018, kd = 3.2 - 1.6 * fin;
  const J = Math.ceil(life / dtE), c0 = WHITE, c1 = fin > 0 ? [kit.lerp(GOLD[0], col[0], fin), kit.lerp(GOLD[1], col[1], fin), kit.lerp(GOLD[2], col[2], fin)] : GOLD;
  glow(cx, cy, 2 + 2 * fin, 0.05 + 0.15 * fin, 0.03 + 0.1 * fin, 0.01);
  for (let jet = 0; jet < nj; jet++) {
    const th = om * T + (jet * kit.TAU) / nj;
    const ja = jet < 3 ? 1 : fin;
    dot(cx + rw * Math.cos(th), cy + rw * Math.sin(th), 0.9 * ja, 0.8 * ja, 0.55 * ja);
    for (let j = 0; j < J; j++) {
      const te = Math.floor(T / dtE) * dtE - j * dtE, a = T - te;
      if (a > life) continue;
      const q = kit.hash(Math.round(te / dtE), jet, cy | 0), t2 = om * te + (jet * kit.TAU) / nj;
      const ex = cx + rw * Math.cos(t2), ey = cy + rw * Math.sin(t2);
      const tx = -Math.sin(t2) * dir, ty = Math.cos(t2) * dir, v = v0 * (0.75 + 0.5 * q);
      const amp = ja * 0.6 * (1 - a / life) ** 1.4;
      spark(ex, ey, -tx * v + Math.cos(t2) * v * 0.2, -ty * v + Math.sin(t2) * v * 0.2, kd, 16 - 10 * fin, a, amp, c0, c1);
    }
  }
  addSrc(cx, cy, 0.6 + fin, 0.45 + fin * 0.6, 0.2);
}

const MINES = [[0.25, 3], [1.4, 125], [3.2, 3], [4.6, 125], [6.4, 3], [7.6, 125]];
function mines(aH, col) {
  for (const [tm, xm] of MINES) {
    const a = aH - tm;
    if (a < 0 || a > 2.8) continue;
    if (a < 0.3) { const f = 0.8 * Math.exp(-a * 10); glow(xm, DECK - 1, 6, f, f * 0.7, f * 0.35); }
    for (let i = 0; i < 46; i++) {
      const h1 = kit.hash(i, tm * 10, 1), h2 = kit.hash(i, tm * 10, 2), h3 = kit.hash(i, tm * 10, 3);
      const vx = (xm < 64 ? 1 : -1) * (h1 * 26 - 3), vy = -(64 + 40 * h2), life = 1.0 + 0.7 * h3;
      if (a < life) {
        const c = [kit.lerp(GOLD[0], col[0], h3), kit.lerp(GOLD[1], col[1], h3), kit.lerp(GOLD[2], col[2], h3)];
        star(xm, DECK - 1, vx, vy, 1.3, 40, a, 0.8, c, GOLD, 4, 0.03, 0);
      } else if (a < life + 0.09) {                         // crackle
        const x = traj(xm, vx, 1.3, life), y = trajY(DECK - 1, vy, 1.3, 40, life), f = 1.2 * (1 - (a - life) / 0.09);
        glow(x, y, 1.9, f, f, f * 0.9);
      }
    }
  }
}
// ------------------------------------------- the pyrotechnician: a frog
// Rainbow frog in round glasses, 9 x 8, holding a portfire. He hops along the
// deck to the digit that is about to change, touches the leader, and the
// spark runs up to the new digit's fuse.
const FROG = [
  '..ooo...ooo..',
  '.oeeeo.oeeeo.',
  '.oeeeo-oeeeo.',
  '.oeeeo.oeeeo.',
  '..ooo...ooo..',
  'BBBBBBBBBBBBB',
  'BBmBBBBBBBmBB',
  'BBBmmmmmmmBBB',
  '.BBBBBBBBBBB.',
  '.BB.BBBBB.BB.',
  'FFF.......FFF',
];
const FW = 13, FH = 11;
const FROGCOL = FROG.map((row, j) => [...row].map((ch, i) => {
  if (ch === 'o' || ch === '-') return [0.3, 0.3, 0.34];
  if (ch === 'e') return [0.1, 0.1, 0.09];
  if (ch === 'm') return [0.004, 0.002, 0.002];
  if (ch === 'B') return kit.scale(kit.hsv((i + j * 0.7) / 17, 0.95, 1), 0.13);
  if (ch === 'F') return [0.03, 0.08, 0.02];
  return null;
}));
/** Hop from a to b in the window [t0, t1]: returns [x, lift, dir]. */
function hops(a, b, t0, t1, t) {
  const d = b - a, n = Math.max(1, Math.ceil(Math.abs(d) / 7)), W = (t1 - t0) / n, dir = Math.sign(d) || 1;
  if (Math.abs(d) < 0.5 || t <= t0) return [a, 0, dir];
  if (t >= t1) return [b, 0, dir];
  const k = Math.min(n - 1, Math.floor((t - t0) / W)), u = kit.clamp((t - t0 - k * W) / 0.42);
  return [a + d * ((k + kit.ease.inOut(u)) / n), 3.2 * Math.sin(Math.PI * u), dir];
}
/** Where the frog stands to light slot s's digit g: the portfire tip under the fuse start. */
function fuseStart(s, g) { const p = GLYPHS[g].dense[0]; return [px(s, p[0], p[1]), py(p[1])]; }
/** Digits that change between a and b: all of the hour's when the hour (and so its colour) changes. */
const changed = (a, b, s) => a[s] !== b[s] || (s < 2 && a.slice(0, 2) !== b.slice(0, 2));
const firstChanged = (a, b) => { for (let s = 0; s < 4; s++) if (changed(a, b, s)) return s; return 3; };

function drawFrog(fx, fy, dir, raise, look, T, flick) {
  const ox = dir > 0 ? fx : fx;
  for (let j = 0; j < FH; j++) for (let i = 0; i < FW; i++) {
    const c = FROGCOL[j][dir > 0 ? i : FW - 1 - i];
    if (!c) continue;
    const x = ox + i, y = fy + j, p = 3 * (Math.round(y) * N + Math.round(x));
    if (p >= 0 && p < img.length) { img[p] *= 0.2; img[p + 1] *= 0.2; img[p + 2] *= 0.2; }
    dot(x, y, c[0], c[1], c[2]);
  }
  // pupils (look up at the bursts, or at the fuse) and a glint on the lenses
  for (const ex of [3, 9]) {
    const gx = ox + (dir > 0 ? ex : FW - 1 - ex);
    const pq = 3 * (Math.round(fy + 2 + look[1]) * N + Math.round(gx + look[0])); if (pq >= 0 && pq < img.length) img[pq] = img[pq + 1] = img[pq + 2] = 0;
    if (flick > 0.3) dot(gx - 1, fy + 1, 0.25 * flick, 0.25 * flick, 0.3 * flick);
  }
  // the portfire: a short stick with a fierce red flame on its tip
  const hx = ox + (dir > 0 ? FW - 1 : 0), hy = fy + 7;
  const tx = hx + dir * (2 + raise), ty = hy - 3 - 3 * raise;
  for (let q = 0; q <= 3; q++) dot(kit.lerp(hx, tx, q / 3), kit.lerp(hy, ty, q / 3), 0.035, 0.018, 0.008);
  const f = 0.75 + 0.35 * kit.noise2(T * 23, 7.7);
  dot(tx, ty - 0.6, f, 0.12 * f, 0.04 * f);
  glow(tx, ty - 0.8, 3, 0.12 * f, 0.015 * f, 0.008 * f);
  for (let j = 0; j < 6; j++) {                         // sparks dribbling off it
    const te = Math.floor(T / 0.07) * 0.07 - j * 0.07, a = T - te, q = kit.hash(Math.round(te / 0.07), 33);
    if (a > 0.4) continue;
    spark(tx, ty, (q - 0.5) * 16, -6 - 8 * q, 2, 50, a, 0.5 * (1 - a / 0.4), [1, 0.6, 0.3], [1, 0.1, 0.02]);
  }
  addSrc(tx, ty, 0.6, 0.08, 0.03);
  return [tx, ty];
}

// --------------------------------------------------------------- frame
const pad = (n) => String(n).padStart(2, '0');
const hhmm = (d) => pad(d.getHours()) + pad(d.getMinutes());
const shellList = [];
const POLES = [17, 44, 82, 109];

export default {
  name: 'Fireworks',
  blurb: 'harbour night: the time is a lancework set piece that burns out and is re-lit by a running fuse; shells, smoke, reflections; hour finale',
  layouts: ['hub-2x2'], look: 'smoke', fps: 60, brightness: 0.45, dither: true,
  frame(ctx) {
    const d = ctx.date, ms = d.getTime();
    const T = d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds() + d.getMilliseconds() / 1000;
    const age = T % 60, aH = T % 3600, H0 = T - aH;
    const cur = hhmm(d), prev = hhmm(new Date(ms - 60000)), next = hhmm(new Date(ms + 60000));
    const hourCol = HOURCOL[d.getHours() % 6], prevHourCol = HOURCOL[new Date(ms - 60000).getHours() % 6];
    const fin = aH < 13 ? kit.smoothstep(0, 0.8, aH) * (1 - kit.smoothstep(9, 13, aH)) : 0;
    const wind = 2.2 + 1.2 * Math.sin(T * 0.05);
    qn = 0; img.fill(0); src.fill(0); near.fill(0); far.fill(0);

    // shells and the light of their bursts
    listShells(T, ctx.night, H0, hourCol, shellList);
    let fr = 0, fg = 0, fb = 0;
    for (const S of shellList) {
      const a = T - S.tl - S.tr;
      if (a < 0 || a > 1.2) continue;
      const f = 0.018 * Math.exp(-a * 5) * S.size;
      fr += S.col[0] * f; fg += S.col[1] * f; fb += S.col[2] * f;
    }
    // sky: a deep blue that warms to the city's glow at the horizon
    for (let y = 0; y < WL; y++) {
      const v = y / WL, k = 0.4 + 0.6 * v;
      const hz = kit.smoothstep(0.45, 1, v) ** 2, r = 0.022 * hz + fr * k, g = 0.008 * hz + fg * k, b = 0.0015 + 0.016 * hz + fb * k;
      for (let x = 0; x < N; x++) { const p = 3 * (y * N + x); img[p] = r; img[p + 1] = g; img[p + 2] = b; }
    }
    // shell smoke clouds, lit by their own stars and every flash
    for (const S of shellList) {
      const a = T - S.tl - S.tr;
      if (a < 0) continue;
      const dens = 0.8 * Math.exp(-a / 5) * kit.smoothstep(0, 0.5, a), own = 0.05 * Math.exp(-a * 2) + 0.012 * Math.max(0, 1 - a / S.type.life);
      const R = (10 + 3.5 * a) * S.size;
      blob(far, S.xb + wind * a, S.yb + 4 - 0.5 * a, R, (S.col[0] * own + fr * 3 + 0.001) * dens, (S.col[1] * own + fg * 3 + 0.001) * dens, (S.col[2] * own + fb * 3 + 0.002) * dens);
    }
    for (let cy = 0; cy < LS; cy++) for (let cx = 0; cx < LS; cx++) {
      const n = 0.65 * kit.noise2(cx * 0.16 + T * 0.1, cy * 0.16 + T * 0.32) + 0.35 * kit.noise2(cx * 0.37 - T * 0.05, cy * 0.37 + T * 0.6);
      tex[cy * LS + cx] = 3.2 * n * n * n;
    }
    upsample(far, 0, WL, 0.9);
    for (const S of shellList) drawShell(S, T);

    // the far shore: black blocks against the glow, a few lit windows, rims caught by the flashes
    for (let x = 0; x < N; x++) {
      for (let y = skyTop[x]; y < WL; y++) { const p = 3 * (y * N + x); img[p] = img[p + 1] = img[p + 2] = 0; }
      const p = 3 * (skyTop[x] * N + x);
      img[p] += fr * 2.5; img[p + 1] += fg * 2.5; img[p + 2] += fb * 2.5;
    }
    for (const [x, y, h] of windows) { const p = 3 * (y * N + x), f = 0.6 + 0.4 * h; img[p] += 0.05 * f; img[p + 1] += 0.028 * f; img[p + 2] += 0.01 * f; }

    // the lancework
    const chN = (s) => changed(prev, cur, s), chX = (s) => changed(cur, next, s);
    for (let s = 0; s < 4; s++) {
      const col = s < 2 ? hourCol : MINCOL, dg = +cur[s];
      if (age < 3.4 && chN(s)) {
        puffs(s, +prev[s], s < 2 ? prevHourCol : MINCOL, age, wind);
        let r = 0; for (let k = s + 1; k < 4; k++) if (chN(k)) r++;
        const u = (age - 0.05 - 0.1 * r) / FUSE;
        drawDigit(s, dg, col, 2, u, T);
      } else if (age > 58.3 && chX(s)) {
        puffs(s, dg, col, age - 60, wind);
        drawDigit(s, dg, col, 1, age - 60, T);
      } else drawDigit(s, dg, col, 0, 0, T);
    }
    halos();
    drawQueue(T, wind);
    wheel(COLX + (GH - (COLY[0] - TOP)) * SLANT, COLY[0], T, fin, hourCol, 1);
    wheel(COLX + (GH - (COLY[1] - TOP)) * SLANT, COLY[1], T + 0.3, fin, hourCol, -1);

    // the lancework's own smoke: light from the lances carried up and downwind
    for (let cy = 0; cy < LS; cy++) for (let cx = 0; cx < LS; cx++) {
      let r = 0, g = 0, b = 0, w = 0.06;
      for (let k = 1; k <= 4; k++) {
        const sy = cy + k, sx = cx - Math.round(k * wind * 0.2);
        if (sy >= LS) break;
        if (sx >= 0) { const p = 3 * (sy * LS + sx); r += src[p] * w; g += src[p + 1] * w; b += src[p + 2] * w; }
        w *= 0.9;
      }
      const p = 3 * (cy * LS + cx);
      near[p] += r; near[p + 1] += g; near[p + 2] += b;
    }
    upsample(near, 0, DECK, 1);

    // frame rail, poles, the barge
    for (let x = 3; x < N - 3; x++) {
      const lr = src[3 * (33 * LS + (x >> 1))], lg = src[3 * (33 * LS + (x >> 1)) + 1];
      const wood = 0.006 + 0.05 * (lr + lg);
            const e = x < 6 ? x - 2 : x > N - 7 ? N - 3 - x : 4;     // bow and stern
      const dk = 3 * (DECK * N + x); img[dk] += wood * 1.4; img[dk + 1] += wood * 0.8; img[dk + 2] += wood * 0.4;
      for (let y = DECK + 1; y < WL; y++) if (y - DECK <= e) { const h = 3 * (y * N + x); img[h] = img[h + 1] = img[h + 2] = 0; }
    }
    for (const x of POLES) for (let y = 62; y < DECK; y++) {
      const l = src[3 * (34 * LS + (x >> 1))] + src[3 * (34 * LS + (x >> 1)) + 1], wood = 0.005 + 0.04 * l, q = 3 * (y * N + x);
      img[q] += wood * 0.9; img[q + 1] += wood * 0.5; img[q + 2] += wood * 0.25;
    }
    // the slow match: a cord along the foot of the set piece that takes exactly a minute
    // to burn from the frog's end to the leader at the far end, which fires the new digits
    const C0 = 4, C1 = N - 4, CY = 63, ex = kit.lerp(C0, C1, kit.clamp(age / 59.4));
    for (let x = C0; x <= C1; x++) {
      const p = 3 * (CY * N + x), lit = src[3 * (31 * LS + (x >> 1))] + src[3 * (31 * LS + (x >> 1)) + 1];
      if (x > ex) { const w = 0.035 + 0.04 * lit; img[p] += w; img[p + 1] += w * 0.62; img[p + 2] += w * 0.35; }  // unburnt cord
      else { const e = 0.3 * Math.exp(-(ex - x) * 0.3) * (0.6 + 0.4 * kit.noise2(x * 0.7, T * 6)); img[p] += e; img[p + 1] += e * 0.22; img[p + 2] += e * 0.04; }  // ash still glowing
    }
    if (age < 59.4) {
      const f = 0.85 + 0.3 * kit.noise2(T * 19, 3.3);
      dot(ex, CY, 1.3 * f, 0.85 * f, 0.4 * f); glow(ex, CY - 0.5, 3.2, 0.3 * f, 0.15 * f, 0.04 * f);
      addSrc(ex, CY, 0.8, 0.5, 0.2);
      for (let q = 0; q < 8; q++) {                        // it spits as it crawls
        const te = Math.floor(T / 0.05) * 0.05 - q * 0.05, a = T - te, h = kit.hash(Math.round(te / 0.05), 61);
        if (a > 0.35) continue;
        spark(kit.lerp(C0, C1, kit.clamp((age - a) / 59.4)), CY, (h - 0.5) * 22, -10 - 16 * h, 3, 55, a, 0.6 * (1 - a / 0.35), WHITE, GOLD);
      }
      blob(near, ex + wind * 0.8, CY - 5, 5, 0.006, 0.0045, 0.003);
    }
    // the frog: lights each new slow match at :00, follows it a while, wanders back
    {
      const mI = Math.floor(T / 60), standL = C0 + 3;
      const home = 18 + kit.hash(mI, 41) * 22, home2 = 6 + kit.hash(mI, 42) * 40;
      let fx, lift = 0, dir, raise = 0;
      if (age < 1.5) { fx = standL; dir = -1; raise = 1 - kit.smoothstep(0.3, 1.2, age); }
      else if (age < 26) [fx, lift, dir] = hops(standL, home, 3, 9, age);
      else if (age < 50) [fx, lift, dir] = hops(home, home2, 30, 34, age);
      else if (age < 58.4) [fx, lift, dir] = hops(home2, standL, 50, 57.5, age);
      else { fx = standL; dir = -1; raise = kit.smoothstep(58.6, 59.4, age); }
      if (age >= 3 && age < 26 && fx === home) dir = 1;     // watch the match crawl away
      const flash = fr + fg + fb, look = raise > 0.2 ? [-1, 1] : flash > 0.004 || fin > 0 ? [0, -1] : [dir, 0];
      drawFrog(fx, DECK - FH - lift, dir, raise, look, T, kit.clamp(flash * 60 + fin));
    }
    if (age > 59.4) {                                      // the match climbs the leader to the new digit's fuse
      const [xx, xy] = fuseStart(3, +next[3]);
      const u = kit.ease.in((age - 59.4) / 0.6), sx = kit.lerp(C1, xx, u), sy = kit.lerp(CY, xy, u);
      glow(sx, sy, 2.6, 0.3, 0.24, 0.12); dot(sx, sy, 1.2, 1.1, 0.9);
      for (let q = 1; q < 5; q++) { const v = u - q * 0.03; if (v > 0) dot(kit.lerp(C1, xx, v), kit.lerp(CY, xy, v), 0.35 / q, 0.25 / q, 0.1 / q); }
    }
    if (fin > 0) mines(aH, hourCol);

    // the water: the whole scene mirrored, broken by ripples
    for (let y = WL; y < N; y++) {
      const dy = y - WL, A = 0.4 + 0.07 * dy, mir = 2 * WL - 1 - y;
      for (let x = 0; x < N; x++) {
        const n1 = kit.noise2(x * 0.07, y * 0.42 - T * 0.9), n2 = kit.noise2(x * 0.025 + T * 0.08, y * 0.8 - T * 1.3);
        const sx = Math.min(N - 1.001, Math.max(0, x + (n1 - 0.5) * 2 * A)), sy = Math.min(WL - 1.001, Math.max(0, mir + (n2 - 0.5) * 0.9 * (1 + dy * 0.05)));
        const ix = Math.floor(sx), iy = Math.floor(sy), fx = sx - ix, fy = sy - iy;
        const R = 0.5 * (0.55 + 0.9 * n2 * n2) * (1 - dy / 90);
        const a = 3 * (iy * N + ix), b = a + 3, c = a + 3 * N, e = c + 3, q = 3 * (y * N + x);
        for (let k = 0; k < 3; k++)
          img[q + k] = R * ((img[a + k] * (1 - fx) + img[b + k] * fx) * (1 - fy) + (img[c + k] * (1 - fx) + img[e + k] * fx) * fy) + (k === 2 ? 0.004 : 0.0015);
      }
    }
    // a black floor: the faintest haze goes to true black, so the light glows on the GOB face
    const G = kit.grid(ctx), idx = G.idx, o = ctx.out, dim = 1 - 0.6 * ctx.night;
    for (let p = 0; p < idx.length; p++) {
      const i = idx[p];
      if (i < 0) continue;
      const r = img[3 * p] - 0.002, g = img[3 * p + 1] - 0.002, b = img[3 * p + 2] - 0.002;
      o[3 * i] = r > 0 ? r * dim : 0; o[3 * i + 1] = g > 0 ? g * dim : 0; o[3 * i + 2] = b > 0 ? b * dim : 0;
    }
  },
};
