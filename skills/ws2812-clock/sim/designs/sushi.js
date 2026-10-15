// Kaiten: a conveyor-sushi counter the length of the banner. The time is
// served on the hinoki counter as sushi: the hours are nigiri (a salmon and
// a tuna slice, each cut into a numeral and draped over its rice, glossy
// under the counter lights), the minutes are maki rolls bent into numerals
// (nori skin, rice, a tuna or cucumber core). The chef slices between them,
// the belt runs plates past all day, and a rainbow frog at the end of the
// counter takes one now and then.
//
// Minute turn: a bamboo makisu rolls down over the changing piece, presses,
// and rolls back up off a freshly made one. Hour: a shinkansen glides out of
// the kitchen with a funamori platter, brakes in front of the chef, who
// bows, while the mats roll over the pieces in a wave; then it pulls out.
import * as kit from '../js/kit.js';
import { W, H, img, ov, clamp } from './sushi-gfx.js';
import { MAPS, PIECES, GW, GH } from './sushi-glyphs.js';
import {
  SALMON, SALMON_FAT, TUNA, RICE, NORI, CUKE, TAMAGO, BELT_V,
  drawBelt, drawGrabbed, currentGrab, drawFrogArm, drawNoren, drawChef, drawCounter, drawFrog, drawTrain, GRAB_X, FROG_X, CHEF_X,
} from './sushi-scene.js';

const Y0 = 6;
const SLOTS = [
  { x: 26, kind: 0, fish: SALMON, fat: true },
  { x: 59, kind: 0, fish: TUNA, fat: false },
  { x: 163, kind: 1 },
  { x: 196, kind: 1 },
];

// rice grain texture, fixed
const GRAIN = new Float32Array(W * H);
for (let p = 0; p < W * H; p++) GRAIN[p] = 0.72 + 0.4 * kit.hash(p, 7) * kit.hash(p, 9);

// light from the upper left, the viewer in front
const LX = -0.42, LY = -0.62, LZ = 0.66, LN = Math.hypot(LX, LY, LZ);
const lx = LX / LN, ly = LY / LN, lz = LZ / LN;
const hxv = lx, hyv = ly, hzv = lz + 1, HN = Math.hypot(hxv, hyv, hzv);
const Hx = hxv / HN, Hy = hyv / HN, Hz = hzv / HN;

/** Nigiri numeral: the slice is the digit's stroke, rice peeps out 2 px below it. */
function nigiri(sl, digit, sweep) {
  const m = MAPS[digit], D = m.d, R = 3.6;
  for (let j = 0; j < GH + 2; j++) for (let i = 0; i < GW; i++) {
    const X = sl.x + i, Y = Y0 + j;
    if (Y >= 47) continue;
    const df = j < GH ? D[j * GW + i] : 99, dr = j >= 2 && j - 2 < GH ? D[(j - 2) * GW + i] : 99;
    const fa = clamp(R + 0.5 - df), ra = clamp(R + 0.2 - dr);
    if (ra > 0 && fa < 1) {
      // rice: shaded darker right under the fish
      const under = j >= 1 && j - 1 < GH && D[(j - 1) * GW + i] < R ? 0.7 : 1.15;
      const g = GRAIN[Y * W + X] * under;
      ov(X, Y, RICE[0] * g, RICE[1] * g, RICE[2] * g, ra);
    }
    if (fa <= 0) continue;
    const q = Math.min(df / R, 1), p = j * GW + i;
    const nz = Math.sqrt(1 - q * q), nx = m.gx[p] * q, ny = m.gy[p] * q;
    const diff = Math.max(0, nx * lx + ny * ly + nz * lz);
    const nh = Math.max(0, nx * Hx + ny * Hy + nz * Hz);
    let r = sl.fish[0], g = sl.fish[1], b = sl.fish[2];
    if (sl.fat) {
      // the white fat lines of a salmon slice, curving across the cut
      const f = kit.fract((X * 0.55 - Y * 0.85 + 1.7 * Math.sin(Y * 0.23 + X * 0.06)) / 4.4);
      const k = f < 0.24 ? 0.8 * Math.sin(Math.PI * f / 0.24) : 0;
      r += (SALMON_FAT[0] - r) * k; g += (SALMON_FAT[1] - g) * k; b += (SALMON_FAT[2] - b) * k;
    } else {
      const f = kit.fract((X * 0.3 + Y * 0.7) / 6.5);        // faint sinew in the tuna
      const k = f < 0.12 ? 0.18 : 0;
      r *= 1 + k; g += 0.03 * k; b += 0.04 * k;
    }
    const lit = 0.4 + 0.75 * diff;
    // gloss: a steady highlight, and a sheen band that sweeps across now and then
    const band = Math.exp(-(((X + 0.55 * Y - sweep) / 5) ** 2));
    const spec = nh ** 22 * (0.32 + 1.1 * band) + nh ** 6 * band * 0.12;
    ov(X, Y, r * lit + spec, g * lit + spec * 0.95, b * lit + spec * 0.9, fa);
  }
}

/**
 * One cut maki piece, cut face up: nori skin, rice, a coloured core, a glint
 * on the rim. sq squashes it (landing), a fades it.
 */
const CORES = [TUNA, kit.scale(CUKE, 0.85), kit.scale(TAMAGO, 0.9), SALMON];
const PR = 3.75;
function piece(cx, cy, core, sq = 1, a = 1, spin = 0) {
  const ry = PR * sq, x0 = Math.floor(cx - PR - 1), y0 = Math.floor(cy - ry - 1);
  const gx = cx + 2.2 * Math.cos(spin - 2.3), gy = cy + 2.2 * sq * Math.sin(spin - 2.3);
  for (let y = y0; y <= y0 + 2 * ry + 2; y++) for (let x = x0; x <= x0 + 2 * PR + 2; x++) {
    const u = x - cx, v = (y - cy) / sq, d = Math.sqrt(u * u + v * v);
    const cov = clamp(PR + 0.5 - d) * a;
    if (cov <= 0 || x < 0 || y < 0 || x >= W || y >= H) continue;
    const gr = GRAIN[y * W + x];
    let r = RICE[0] * gr, g = RICE[1] * gr, b = RICE[2] * gr;
    const c = clamp(2.5 - d);
    if (c > 0) { r += (core[0] - r) * c; g += (core[1] - g) * c; b += (core[2] - b) * c; }
    const n = clamp((d - 2.75) / 0.5);
    if (n > 0) {
      const gl = Math.exp(-((x - gx) ** 2 + (y - gy) ** 2) / 1.6) * 0.35;
      r += (NORI[0] * 1.5 + gl - r) * n; g += (NORI[1] * 1.6 + gl - g) * n; b += (NORI[2] * 1.4 + gl * 1.1 - b) * n;
    }
    ov(x, y, r, g, b, cov);
  }
}
const coreOf = (k, i) => CORES[Math.floor(kit.hash(k, i, 5) * CORES.length)];

/**
 * The makisu: a bamboo mat that rolls down over a digit (u 0 -> 1) and back
 * up (1 -> 0). A cylinder whose slats turn as it travels, laying a flat mat
 * behind it.
 */
const MAT_TOP = 3, MAT_BOT = 44.6;
function makisu(x0, u) {
  if (u <= 0) return;
  const R = kit.lerp(5.2, 3, u), c = kit.lerp(-6, MAT_BOT, u);
  const xa = x0 - 1, xb = x0 + GW + 1, ties = [x0 + 7, x0 + GW - 8];
  const y1 = Math.min(H - 1, Math.ceil(c + R + 1));
  for (let y = MAT_TOP; y <= y1; y++) {
    let cov = 0, ph = 0, sh = 1;
    if (y <= c - R * 0.2) { // laid flat
      cov = clamp(c - y + 0.5);
      ph = (y - MAT_TOP) / 2;
      sh = 0.78 + 0.1 * (y === MAT_TOP ? -1 : 0);
    }
    const s = (y - c) / R;
    if (Math.abs(s) < 1.15) { // the roll, in front
      const rc = clamp(R + 0.5 - Math.abs(y - c));
      if (rc > 0) {
        const sc = clamp(s, -0.999, 0.999), z = Math.sqrt(1 - sc * sc);
        cov = Math.max(cov, rc);
        ph = (R * Math.asin(sc) - c) / 2;
        sh = 0.35 + 0.95 * z + 0.3 * -sc * z;
      }
    }
    if (cov <= 0) continue;
    const f = kit.fract(ph), si = Math.floor(ph), slat = f < 0.55 ? 0.8 + 0.35 * kit.hash(si, 3) : 0.1;
    for (let x = xa; x < xb; x++) {
      const tie = x === ties[0] || x === ties[1];
      const end = x === xa || x === xb - 1 ? 0.6 : 1;
      const node = 0.9 + 0.1 * Math.sin(x * 0.9 + si * 2.1);
      const k = sh * end * (tie ? (f < 0.55 ? 1 : 0.5) : slat * node);
      const col = tie ? [0.42, 0.38, 0.28] : [0.36, 0.43, 0.11];
      ov(x, y, col[0] * k, col[1] * k, col[2] * k, cov);
    }
  }
}

const hhmm = (sec) => { const d = new Date(sec * 1000); return String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0'); };
// hours: when each mat starts rolling down / back up, seconds from the minute
const COVER = [-0.85, -1.0], UNCOVER = [0.55, 0.4];
// minutes: old pieces hop onto the belt, new ones are tossed by the chef
const HOP0 = -1.3, HOP = 0.45, LAND_Y = 52.5, FLY = 0.65, TOSS0 = [0, 0, 0.32, 0.05];
const HAND = [CHEF_X + 12, 37];

export default {
  name: 'Kaiten',
  blurb: 'conveyor sushi: nigiri hours under a makisu, maki-piece minutes tossed by the chef; a shinkansen brings the hour',
  layouts: ['hub-x4'], look: 'smoke', fps: 60, brightness: 0.32, dither: false,
  frame(ctx) {
    const now = ctx.date.getTime() / 1000, t = now;
    const M = Math.floor(now / 60) * 60, sec = now - M;
    const B = sec >= 30 ? M + 60 : M, T = now - B;
    const oldS = hhmm(B - 60), newS = hhmm(B);
    const hourTurn = newS[2] === '0' && newS[3] === '0';
    img.fill(0);

    // ---- the hour train: glide in, stop before the chef, pull out
    let xF = -999, speed = 0, bow = 0;
    if (hourTurn && T > -5.4 && T < 5) {
      const STOP = CHEF_X + 96;
      if (T < -2.2) { const k = clamp((T + 5.4) / 3.2); xF = kit.lerp(-8, STOP, kit.ease.out(k)); speed = (3 * (STOP + 8) / 3.2) * (1 - k) ** 2; }
      else if (T < 1.4) xF = STOP;
      else { const k = clamp((T - 1.4) / 3.0); xF = kit.lerp(STOP, 420, kit.ease.in(k)); speed = (420 - STOP) / 3 * 3 * k * k; }
      bow = kit.ease.inOut(clamp((T + 2.1) / 0.5)) * (1 - kit.ease.inOut(clamp((T + 1.0) / 0.55)));
    }
    const wind = clamp(speed / 220) * clamp(1 - (xF - 120) / 120) * (xF > -8 ? 1 : 0);

    // ---- hours: mats; minutes: pieces leaving, landing
    const us = [0, 0], shown = T < 0 ? oldS : newS;
    let look = 0, lookW = 0, toss = 0;
    for (let k = 0; k < 2; k++) {
      if (oldS[k] === newS[k]) continue;
      us[k] = T < 0 ? kit.ease.inOut(clamp((T - COVER[k]) / 0.85)) : 1 - kit.ease.inOut(clamp((T - UNCOVER[k]) / 1.0));
      if (us[k] > 0) { look -= us[k]; lookW += us[k]; }
    }
    const home = [], flying = [], riding = [];
    for (let k = 2; k < 4; k++) {
      const sl = SLOTS[k], od = +oldS[k], nd = +newS[k], changed = od !== nd;
      if (!changed) { for (let i = 0; i < PIECES[nd].length; i++) home.push([sl.x + PIECES[nd][i][0], Y0 + PIECES[nd][i][1], coreOf(nd * 4 + k, i), 1]); continue; }
      const op = PIECES[od], dto = 1.0 / op.length;
      for (let i = 0; i < op.length; i++) {
        const hx = sl.x + op[i][0], hy = Y0 + op[i][1], c = coreOf(od * 4 + k, i), h0 = HOP0 + i * dto;
        if (T < h0) { home.push([hx, hy, c, 1]); continue; }
        const u = (T - h0) / HOP, lx = hx + 7;
        if (u < 1) flying.push([kit.lerp(hx, lx, u), kit.lerp(hy, LAND_Y, u * u) - 5 * Math.sin(Math.PI * u) * (1 - u), c, 1, u * 4]);
        else {
          const x = lx + BELT_V * (T - h0 - HOP), sq = 1 - 0.25 * Math.sin(Math.PI * clamp((u - 1) * HOP / 0.2));
          if (x < W + 6) riding.push([x, LAND_Y + (1 - sq) * 3, c, sq]);
        }
      }
      if (T < 0) continue;
      const np = PIECES[nd], dtn = 1.45 / np.length;
      for (let i = 0; i < np.length; i++) {
        const tx = sl.x + np[i][0], ty = Y0 + np[i][1], c = coreOf(nd * 4 + k, i), tl = TOSS0[k] + i * dtn;
        if (T < tl) continue;
        const u = (T - tl) / FLY;
        if (T - tl < 0.22) toss = Math.max(toss, Math.sin(Math.PI * (T - tl) / 0.22));
        if (u < 1) {
          const hgt = 14 + 0.12 * Math.abs(tx - HAND[0]);
          flying.push([kit.lerp(HAND[0], tx, u), kit.lerp(HAND[1], ty, u) - hgt * 4 * u * (1 - u), c, 1, u * 9]);
          look += 1; lookW += 1;
        } else home.push([tx, ty, c, 1 - 0.2 * Math.sin(Math.PI * clamp((u - 1) * FLY / 0.25))]);
      }
    }

    drawNoren(t, wind);
    drawChef(t, lookW ? look / lookW : 0.25 * Math.sin(t * 0.21), bow, ctx.night, toss);
    // the sheen sweeps across the nigiri every 9 s
    const swH = ((t % 9) / 1.8) * 150 + 6;
    for (let k = 0; k < 2; k++) { nigiri(SLOTS[k], +shown[k], swH); makisu(SLOTS[k].x, us[k]); }
    for (const p of home) piece(p[0], p[1], p[2], p[3]);
    drawFrogAndBelt(t, xF);
    for (const p of riding) piece(p[0], p[1], p[2], p[3]);
    if (xF > -999) drawTrain(xF, t, speed);
    for (const p of flying) piece(p[0], p[1], p[2], 1, 1, p[4]);

    kit.blitGrid(ctx, img, 1 - 0.5 * ctx.night);
  },
};

/** The frog watches plates come, takes one, chews; then counter and belt in front of it. */
function drawFrogAndBelt(t, xF) {
  const gr = currentGrab(t);
  let gaze, chew = 0, arm = null;
  if (gr) {
    const a = gr.age;
    if (a < 1.3) {
      const up = kit.ease.inOut(clamp(a / 0.7)), toM = kit.ease.inOut(clamp((a - 0.7) / 0.6));
      arm = [GRAB_X + 8 + 6 * up + 2 * toM, 54 - 9 * up - 4 * toM];
      gaze = [-0.3, 0.9 - 0.6 * toM];
      chew = toM > 0.6 ? (toM - 0.6) * 1.5 : 0;
    } else {
      gaze = [-0.2, 0.1];
      chew = Math.abs(Math.sin((a - 1.3) * 9)) * clamp(1 - (a - 1.3) / 1.3);
    }
  } else gaze = [-0.8 + 0.3 * Math.sin(t * 0.4), 0.4 + 0.2 * Math.sin(t * 0.7)];
  if (xF > -999) gaze = [clamp((xF - 40 - FROG_X) / 60, -1, 1), 0.9];
  drawFrog(t, gaze, chew);
  drawCounter();
  drawBelt(t);
  if (gr) { drawGrabbed(gr); if (arm) drawFrogArm(arm); }
}
