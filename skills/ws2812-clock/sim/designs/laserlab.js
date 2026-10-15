// Laser Lab: an optical bench seen from above in a hazy dark room. Each digit
// is one laser beam folded by small mirrors: the laser's aperture at one end,
// a beam dump at the other, a mirror at every corner, turned to exactly the
// angle that corner needs. Hours are a 638 nm red line, minutes 520 nm green.
// Haze makes the beams visible (glow, speckle); dust drifts through them and
// flares where it crosses. Every second each laser fires a pulse, shown in
// slow motion running its folded path; every mirror flashes as it passes.
// Minute turn: the changing digit's laser drops to alignment power and its
// mirrors glide on their stages, one after another down the beam, rotating
// as they go; the beam is never cut. Mirrors that a simpler digit didn't
// need ride stacked together and split apart.
// Hour turn: a white source fires into the prism in the middle of the bench;
// the prism turns and its spectrum sweeps the whole room, the four beams
// disperse into colour, then the light re-converges to white and shuts off.
import * as kit from '../js/kit.js';
import { GLYPHS, GW, GH, padded } from './laserlab-glyphs.js';

const W = 64, H = 64, NP = 15;
const img = new Float32Array(W * H * 3);
const dist = new Float32Array(W * H);
const PG = {};
for (let d = 0; d < 10; d++) PG[d] = padded(GLYPHS[d], NP);

const RED = kit.hex('#ff1608'), GREEN = kit.hex('#1cff38');
const WHITE = [1, 0.93, 0.86], SILVER = [0.13, 0.145, 0.16], MIRROR = [0.3, 0.33, 0.38], HOUSING = [0.075, 0.075, 0.085];
const SX = 20.4 / GW, SY = 25 / GH;
const SLOTS = [[6, 4], [37.6, 4], [6, 35], [37.6, 35]];
const PCX = 32, PCY = 32;                       // the prism
const MORPH = 1.85;                              // seconds the mirrors take

// spectrum: 0 = red (650 nm) .. 1 = violet (415 nm), linear light, max 1
const SPEC = new Float32Array(256 * 3);
for (let k = 0; k < 256; k++) {
  const wl = 650 - (k / 255) * 235;
  let r = 0, g = 0, b = 0;
  if (wl < 440) { r = (440 - wl) / 60 * 0.6; b = 1; }
  else if (wl < 490) { g = (wl - 440) / 50; b = 1; }
  else if (wl < 510) { g = 1; b = (510 - wl) / 20; }
  else if (wl < 580) { r = (wl - 510) / 70; g = 1; }
  else if (wl < 645) { r = 1; g = (645 - wl) / 65; }
  else r = 1;
  const f = wl < 425 ? 0.4 + 0.6 * (wl - 415) / 10 : 1;
  SPEC[3 * k] = (r * f) ** 2.2; SPEC[3 * k + 1] = (g * f) ** 2.2; SPEC[3 * k + 2] = (b * f) ** 2.2;
}
const specIdx = (u) => 3 * Math.min(255, Math.max(0, (u * 255) | 0));

const pad2 = (n) => String(n).padStart(2, '0');
const digitsOf = (d) => pad2(d.getHours()) + pad2(d.getMinutes());

// ------------------------------------------------------------ raster helpers
function addPx(x, y, r, g, b) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const p = 3 * (y * W + x);
  img[p] += r; img[p + 1] += g; img[p + 2] += b;
}
/** Soft round dot, sub-pixel placed. */
function splat(cx, cy, rad, c, a) {
  const x0 = Math.max(0, Math.floor(cx - rad)), x1 = Math.min(W - 1, Math.ceil(cx + rad));
  const y0 = Math.max(0, Math.floor(cy - rad)), y1 = Math.min(H - 1, Math.ceil(cy + rad));
  const ir2 = 1 / (rad * rad);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const q = ((x - cx) ** 2 + (y - cy) ** 2) * ir2;
    if (q >= 1) continue;
    const f = a * (1 - q) * (1 - q), p = 3 * (y * W + x);
    img[p] += c[0] * f; img[p + 1] += c[1] * f; img[p + 2] += c[2] * f;
  }
}
/** Anti-aliased solid line of width w (coverage by distance). */
function line(ax, ay, bx, by, w, c, a) {
  const hw = w / 2 + 0.5;
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - hw)), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + hw));
  const y0 = Math.max(0, Math.floor(Math.min(ay, by) - hw)), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by) + hw));
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-9;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    let t = ((x - ax) * dx + (y - ay) * dy) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const d = Math.hypot(x - ax - t * dx, y - ay - t * dy);
    const cov = hw - d; if (cov <= 0) continue;
    const f = a * (cov > 1 ? 1 : cov), p = 3 * (y * W + x);
    img[p] += c[0] * f; img[p + 1] += c[1] * f; img[p + 2] += c[2] * f;
  }
}

// --------------------------------------------------------------- the beam
const SIG = 0.44, REACH = 4.2;
let beamT = 0, beamTint = 0, beamPhase = 0;
/**
 * One beam through points xs/ys (n of them): a hot core with speckle and a
 * glow in the haze, drawn once per pixel by its distance to the whole path.
 */
function beam(xs, ys, n, col, P) {
  if (P <= 0.001) return;
  let bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9;
  for (let k = 0; k < n; k++) {
    if (xs[k] < bx0) bx0 = xs[k]; if (xs[k] > bx1) bx1 = xs[k];
    if (ys[k] < by0) by0 = ys[k]; if (ys[k] > by1) by1 = ys[k];
  }
  const X0 = Math.max(0, Math.floor(bx0 - REACH)), X1 = Math.min(W - 1, Math.ceil(bx1 + REACH));
  const Y0 = Math.max(0, Math.floor(by0 - REACH)), Y1 = Math.min(H - 1, Math.ceil(by1 + REACH));
  for (let y = Y0; y <= Y1; y++) dist.fill(1e9, y * W + X0, y * W + X1 + 1);
  const R2 = REACH * REACH;
  for (let k = 0; k + 1 < n; k++) {
    const ax = xs[k], ay = ys[k], dx = xs[k + 1] - ax, dy = ys[k + 1] - ay, L2 = dx * dx + dy * dy;
    if (L2 < 1e-6) continue;
    const sx0 = Math.max(X0, Math.floor(Math.min(ax, ax + dx) - REACH)), sx1 = Math.min(X1, Math.ceil(Math.max(ax, ax + dx) + REACH));
    const sy0 = Math.max(Y0, Math.floor(Math.min(ay, ay + dy) - REACH)), sy1 = Math.min(Y1, Math.ceil(Math.max(ay, ay + dy) + REACH));
    const iL = 1 / L2;
    for (let y = sy0; y <= sy1; y++) {
      const py = y - ay, row = y * W;
      for (let x = sx0; x <= sx1; x++) {
        const px = x - ax;
        let t = (px * dx + py * dy) * iL; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = px - t * dx, ey = py - t * dy, d2 = ex * ex + ey * ey;
        if (d2 < R2 && d2 < dist[row + x]) dist[row + x] = d2;
      }
    }
  }
  const kS = Math.floor(beamT * 7), fS = kit.smoothstep(0, 1, beamT * 7 - kS);
  const iS = 1 / (2 * SIG * SIG);
  for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) {
    const q = y * W + x, d2 = dist[q];
    if (d2 >= R2) continue;
    const d = Math.sqrt(d2);
    const core = Math.exp(-d2 * iS);
    const halo = Math.exp(-d / 1.3) * (1 - d / REACH);
    const sp = kit.lerp(kit.hash(q, kS, 7), kit.hash(q, kS + 1, 7), fS);          // speckle
    const hz = 0.55 + 0.9 * kit.noise3(x * 0.14, y * 0.14, beamT * 0.18);        // haze drift
    let r = col[0], g = col[1], b = col[2];
    if (beamTint > 0) {                                                           // dispersed (hour)
      const s = specIdx(kit.fract(x * 0.021 + y * 0.016 + beamPhase));
      r += (SPEC[s] - r) * beamTint; g += (SPEC[s + 1] - g) * beamTint; b += (SPEC[s + 2] - b) * beamTint;
    }
    const I = P * (core * (0.62 + 0.3 * sp) + 0.075 * halo * hz * (0.6 + 0.8 * sp));
    const c2 = core * core, hot = P * c2 * c2 * 0.12;                                           // white-hot centre
    const p = 3 * q;
    img[p] += r * I + hot; img[p + 1] += g * I + hot; img[p + 2] += b * I + hot;
  }
}

/** Next/previous point at least eps away from point k (index), or -1. */
function distinct(xs, ys, n, k, step) {
  for (let j = k + step; j >= 0 && j < n; j += step) if (Math.abs(xs[j] - xs[k]) + Math.abs(ys[j] - ys[k]) > 0.05) return j;
  return -1;
}

/** The hardware on one beam: laser body, mirrors on mounts, beam dump. */
function hardware(xs, ys, n, col, P, T, seed) {
  // laser head: a long housing behind the aperture, a status LED at the back
  const j1 = distinct(xs, ys, n, 0, 1);
  if (j1 > 0) {
    let dx = xs[j1] - xs[0], dy = ys[j1] - ys[0]; const L = Math.hypot(dx, dy); dx /= L; dy /= L;
    const x0 = xs[0], y0 = ys[0];
    line(x0 - dx * 1.2, y0 - dy * 1.2, x0 - dx * 6.2, y0 - dy * 6.2, 2.0, HOUSING, 1);
    line(x0 - dx * 1.0, y0 - dy * 1.0, x0 - dx * 1.0, y0 - dy * 1.0, 2.2, SILVER, 0.9);   // front bezel
    splat(x0 - dx * 5.2, y0 - dy * 5.2, 1.0, col, 0.35);                                  // status LED
    splat(x0, y0, 1.5, col, 0.8 * P);                                                     // aperture
  }
  // beam dump past the end: a block with the spot glowing hot on it
  const jn = distinct(xs, ys, n, n - 1, -1);
  if (jn >= 0) {
    let dx = xs[n - 1] - xs[jn], dy = ys[n - 1] - ys[jn]; const L = Math.hypot(dx, dy); dx /= L; dy /= L;
    const ex = xs[n - 1], ey = ys[n - 1];
    line(ex + dx * 1.3, ey + dy * 1.3, ex + dx * 2.6, ey + dy * 2.6, 2.6, HOUSING, 1.4);
    line(ex + dx * 0.9 - dy * 1.6, ey + dy * 0.9 + dx * 1.6, ex + dx * 0.9 + dy * 1.6, ey + dy * 0.9 - dx * 1.6, 0.4, SILVER, 0.8);
    splat(ex + dx * 0.5, ey + dy * 0.5, 1.4, [col[0] * 0.5 + 0.35, col[1] * 0.5 + 0.12, col[2] * 0.5 + 0.02], 0.8 * P);
  }
  // mirrors: a silver face set behind the turn, on a round mount
  let lx = 1e9, ly = 1e9;
  for (let k = 1; k < n - 1; k++) {
    const x = xs[k], y = ys[k];
    if (Math.abs(x - lx) + Math.abs(y - ly) < 0.35) continue;
    lx = x; ly = y;
    const a = distinct(xs, ys, n, k, -1), b = distinct(xs, ys, n, k, 1);
    if (a < 0 || b < 0) continue;
    let ix = x - xs[a], iy = y - ys[a], ox = xs[b] - x, oy = ys[b] - y;
    const li = Math.hypot(ix, iy), lo = Math.hypot(ox, oy); ix /= li; iy /= li; ox /= lo; oy /= lo;
    let nx = ox - ix, ny = oy - iy, ln = Math.hypot(nx, ny);
    if (ln < 1e-3) { nx = -iy; ny = ix; ln = 1; }
    nx /= ln; ny /= ln;
    // a grazing turn needs only a sliver of mirror; a sharp one a full face
    const c = Math.abs(ix * nx + iy * ny), hl = 0.6 + 1.7 * c, off = 0.8 + 0.4 * c;
    const tx = -ny, ty = nx, mx = x - nx * off, my = y - ny * off;
    line(mx - tx * hl, my - ty * hl, mx + tx * hl, my + ty * hl, 0.2, MIRROR, 0.6 + 0.4 * c);
    const tw = 0.6 + 0.4 * Math.sin(T * 2.3 + k * 1.9 + seed * 3.1);
    splat(x - nx * 0.4, y - ny * 0.4, 1.2, [0.85, 0.85, 0.85], (0.15 + 0.45 * c) * P * tw);
  }
}

/**
 * The seconds: once a second the laser fires a pulse, shown in slow motion
 * running the whole folded path to the dump; each mirror flashes as it passes.
 */
function pulse(xs, ys, n, col, P, ph) {
  let tot = 0;
  for (let k = 0; k + 1 < n; k++) tot += Math.hypot(xs[k + 1] - xs[k], ys[k + 1] - ys[k]);
  const h = kit.ease.out(ph) * (tot + 8) - 2;
  if (h < -1 || h > tot + 6) return;
  const fade = 1 - kit.smoothstep(tot - 2, tot + 6, h);
  const hc = [col[0] * 0.6 + 0.4, col[1] * 0.6 + 0.4, col[2] * 0.6 + 0.4];
  let acc = 0;
  for (let k = 0; k + 1 < n; k++) {
    const L = Math.hypot(xs[k + 1] - xs[k], ys[k + 1] - ys[k]);
    if (L < 1e-3) continue;
    // head and a short tail on this segment
    for (let j = 0; j < 7; j++) {
      const u = h - j * 0.9 - acc;
      if (u < 0 || u > L) continue;
      const w = (1 - j / 7) ** 1.5;
      splat(xs[k] + (xs[k + 1] - xs[k]) * u / L, ys[k] + (ys[k + 1] - ys[k]) * u / L, j ? 1.6 : 2.2, j ? col : hc, P * fade * (j ? 0.8 * w : 1.6));
    }
    acc += L;
    // the mirror at the end of this segment flashes as the pulse leaves it
    const since = h - acc;
    if (k + 2 < n && since > -0.5 && since < 6) splat(xs[k + 1], ys[k + 1], 2.6, hc, P * fade * 1.1 * Math.exp(-Math.max(0, since) / 1.6));
  }
}

// ------------------------------------------------------------ hour: prism
let fanS = 0, fanSp = 0, fanA = 0;
// ------------------------------------------------------------------ frame
const XS = new Float32Array(NP), YS = new Float32Array(NP);

export default {
  name: 'Laser Lab',
  blurb: 'each digit one laser beam folded by mirrors on a hazy optical bench; mirrors glide to re-route it, a prism throws a spectrum at the hour',
  layouts: ['hub'], look: 'smoke', fps: 60, brightness: 0.4, dither: true,
  frame(ctx) {
    img.fill(0);
    const d = ctx.date, ms = d.getTime();
    const T = d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds() + d.getMilliseconds() / 1000;
    const M = Math.floor(ms / 60000) * 60000, age = (ms - M) / 1000;
    const cur = digitsOf(d), prev = digitsOf(new Date(M - 1)), next = digitsOf(new Date(M + 60000));
    const minute = d.getMinutes();
    const tH = minute === 0 ? age : minute === 59 ? age - 60 : 99;
    beamT = T;

    // hour show state
    fanS = kit.smoothstep(-1.4, -0.9, tH) * (1 - kit.smoothstep(4.4, 5.2, tH));
    fanSp = 0.03 + 0.95 * kit.smoothstep(-0.8, 0.5, tH) * (1 - kit.smoothstep(3.0, 4.3, tH));
    fanA = kit.TAU * kit.ease.inOut(kit.clamp((tH + 0.6) / 4.6));
    beamTint = 0.85 * kit.smoothstep(-0.3, 0.9, tH) * (1 - kit.smoothstep(3.6, 4.8, tH));
    beamPhase = -tH * 0.35;

    for (let s = 0; s < 4; s++) {
      const [ox, oy] = SLOTS[s];
      const col = s < 2 ? RED : GREEN;
      const NEW = PG[cur[s]], OLD = PG[prev[s]];
      const turning = prev[s] !== cur[s] && age < MORPH;
      let P = 1;
      if (turning) P = age < 0.8 ? 0.6                                                     // gathering
        : 0.6 - 0.32 * kit.smoothstep(0.8, 1.0, age) + 0.72 * kit.smoothstep(MORPH - 0.45, MORPH, age);  // star, then unfolding
      else if (prev[s] !== cur[s] && age < MORPH + 0.3) P = 1;
      else if (next[s] !== cur[s] && age > 59.3) P = 1 - 0.4 * kit.smoothstep(59.3, 59.95, age);   // to alignment power
      for (let k = 0; k < NP; k++) {
        let gx = NEW[k][0], gy = NEW[k][1];
        if (turning) {
          // the stages huddle: every mirror (and the laser and dump) gathers
          // to the middle of the cell, the beam folds into a spinning
          // seven-pointed star, then the stages unfold into the new digit.
          const st = k * 0.012, a = kit.TAU * k / (NP - 1) + age * 1.6 + s, rad = k % 2 ? 4.2 : 9.6;
          const sx = GW / 2 + rad * Math.cos(a) / SX, sy = GH / 2 + rad * Math.sin(a) / SY;
          if (age < 0.8) {
            const e = kit.ease.inOut(kit.clamp((age - st) / 0.6));
            gx = OLD[k][0] + (sx - OLD[k][0]) * e; gy = OLD[k][1] + (sy - OLD[k][1]) * e;
          } else {
            const e = kit.ease.inOut(kit.clamp((age - 0.86 - st) / (MORPH - 0.86 - 0.18)));
            gx = sx + (NEW[k][0] - sx) * e; gy = sy + (NEW[k][1] - sy) * e;
          }
        }
        // air turbulence: the rig shivers a tenth of a pixel
        XS[k] = ox + gx * SX + 0.1 * Math.sin(T * 1.7 + gx * 0.9 + gy * 0.4 + s * 1.3);
        YS[k] = oy + gy * SY + 0.1 * Math.cos(T * 1.3 + gx * 0.5 + gy * 0.8 + s * 0.7);
      }
      beam(XS, YS, NP, col, P);
      hardware(XS, YS, NP, col, P, T, s);
      if (!turning) pulse(XS, YS, NP, col, P, age % 1);
    }

    // white source on the left edge, aimed at the prism
    line(0, PCY, 3.2, PCY, 2.4, HOUSING, 1.2);
    splat(3.6, PCY, 1.2, [0.6, 0.3, 0.05], 0.15 + 0.6 * fanS);
    if (fanS > 0.001) {
      XS[0] = 4; YS[0] = PCY; XS[1] = PCX - 2.2; YS[1] = PCY;
      beam(XS, YS, 2, WHITE, 0.8 * fanS);
      // the prism splits it into its spectral lines: seven beams that fan
      // out and sweep the whole room as the prism turns
      const tint = beamTint; beamTint = 0;
      const wb = 1 - kit.smoothstep(0.05, 0.45, fanSp);
      for (let j = 0; j < 7; j++) {
        const ang = fanA + (j / 6 - 0.5) * fanSp, c = Math.cos(ang), sn = Math.sin(ang), q = specIdx(j / 6);
        XS[0] = PCX + 3 * c; YS[0] = PCY + 3 * sn; XS[1] = PCX + 64 * c; YS[1] = PCY + 64 * sn;
        beam(XS, YS, 2, [kit.lerp(SPEC[q], WHITE[0], wb), kit.lerp(SPEC[q + 1], WHITE[1], wb), kit.lerp(SPEC[q + 2], WHITE[2], wb)],
          fanS * (0.35 + 0.35 * (1 - wb)) * (0.9 + 0.1 * Math.sin(T * 9 + j)));
      }
      beamTint = tint;
    }
    // the prism, turning with the sweep
    const phi = -Math.PI / 2 + fanA * 0.5, pr = 3.9, glass = 0.5 + 2.5 * fanS;
    for (let k = 0; k < 3; k++) {
      const a0 = phi + k * kit.TAU / 3, a1 = a0 + kit.TAU / 3;
      line(PCX + pr * Math.cos(a0), PCY + pr * Math.sin(a0), PCX + pr * Math.cos(a1), PCY + pr * Math.sin(a1), 0.7,
        [0.06 * glass, 0.09 * glass, 0.1 * glass], 1);
    }
    if (fanS > 0.001) splat(PCX, PCY, 2.6, WHITE, 0.5 * fanS);

    // the breadboard: its tapped holes catch the stray light near the beams
    for (let hy = 2; hy < H; hy += 5) for (let hx = 2; hx < W; hx += 5) {
      let sum = 0;
      for (let y = Math.max(0, hy - 4); y <= Math.min(H - 1, hy + 4); y++)
        for (let x = Math.max(0, hx - 4); x <= Math.min(W - 1, hx + 4); x++) { const p = 3 * (y * W + x); sum += img[p] + img[p + 1] + img[p + 2]; }
      const p = 3 * (hy * W + hx), e = Math.min(0.06, sum * 0.004) - (img[p] + img[p + 1] + img[p + 2]) * 0.2;
      if (e > 0) { img[p] += e * 0.9; img[p + 1] += e * 0.95; img[p + 2] += e; }
    }

    // dust drifting through the haze: it only shows where light hits it
    for (let j = 0; j < 56; j++) {
      const vx = (kit.hash(j, 3) - 0.5) * 1.6, vy = (kit.hash(j, 4) - 0.5) * 1.2;
      const x = ((kit.hash(j, 1) * 64 + vx * T + 1.8 * Math.sin(T * 0.37 + j)) % 64 + 64) % 64;
      const y = ((kit.hash(j, 2) * 64 + vy * T + 1.8 * Math.cos(T * 0.29 + j * 1.7)) % 64 + 64) % 64;
      const xi = Math.floor(x), yi = Math.floor(y);
      if (xi >= W - 1 || yi >= H - 1) continue;
      const p = 3 * (yi * W + xi);
      const r = img[p], g = img[p + 1], b = img[p + 2];
      const gain = 1.6 + 1.2 * kit.hash(j, 5);
      const fx = x - xi, fy = y - yi;
      const w00 = (1 - fx) * (1 - fy) * gain, w10 = fx * (1 - fy) * gain, w01 = (1 - fx) * fy * gain, w11 = fx * fy * gain;
      addPx(xi, yi, r * w00, g * w00, b * w00); addPx(xi + 1, yi, r * w10, g * w10, b * w10);
      addPx(xi, yi + 1, r * w01, g * w01, b * w01); addPx(xi + 1, yi + 1, r * w11, g * w11, b * w11);
    }

    kit.blitGrid(ctx, img, 1 - 0.7 * ctx.night);
  },
};
