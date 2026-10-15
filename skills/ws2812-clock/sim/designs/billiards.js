// Trick Shot: the 128 x 64 board is a pool table seen from above, lit by a
// low three-shade lamp. The time is racked in pool balls: every numeral is
// the same twelve balls (hours solids, minutes stripes) packed into a shape.
// Each minute the frog lines up a shot; the cue ball reaches the minute digit
// exactly on the minute, the rack breaks, balls collide and bank off the
// cushions and roll to rest as the new numeral, spinning in 3D as they go.
// On the hour the break is a power break: every changing numeral goes, the
// lamp gets knocked swinging, and the frog does a little victory hop.
import * as kit from '../js/kit.js';
import { N } from './billiards-glyphs.js';
import { R, X0, X1, Y0, Y1, NB, CUE, digits, spot, restQ, cueQ, shot, posShot, rollAt, rolled, simulate, sample } from './billiards-sim.js';
import { frogState } from './billiards-frog.js';

const W = 128, H = 64;
const img = new Float32Array(W * H * 3);
const light = new Float32Array(W * H);      // lamp light on the bed, x shadows
const state = new Float32Array(NB * 6);

// ------------------------------------------------------------- palette
const SOLID = ['#f6c000', '#4a7cff', '#ff3a26', '#ac6cff', '#ff8420', '#2ed06a', '#e8505a'].map(kit.hex);
const FELT = [0.004, 0.06, 0.024], WOOD = [0.16, 0.06, 0.02], PEARL = [0.5, 0.46, 0.38];
const IVORY = [0.82, 0.78, 0.68], CUEWHITE = [0.9, 0.88, 0.82], DOT = kit.hex('#e01818');
const kind = new Int8Array(NB), colr = [];
for (let s = 0; s < 4; s++) for (let k = 0; k < N; k++) {
  const i = s * N + k;
  kind[i] = s < 2 ? 0 : 1;                         // 0 solid, 1 stripe
  colr[i] = SOLID[(k * 3 + s * 2) % 7];
}
kind[CUE] = 2; colr[CUE] = CUEWHITE;

// ------------------------------------------------------------- the table (static)
const MAT = new Uint8Array(W * H);   // 0 felt, 1 cushion, 2 wood, 3 pocket
const ALB = new Float32Array(W * H * 3);
const POCKETS = [[X0, Y0, 3.7], [X1, Y0, 3.7], [X0, Y1, 3.7], [X1, Y1, 3.7], [63.5, Y0 - 0.6, 3.2], [63.5, Y1 + 0.6, 3.2]];
const DIAMONDS = [];
for (let k = 1; k <= 3; k++) {
  for (const y of [1.6, 61.4]) { DIAMONDS.push([X0 + (63.5 - X0) * k / 4, y], [63.5 + (X1 - 63.5) * k / 4, y]); }
  for (const x of [1.6, 125.4]) DIAMONDS.push([x, Y0 + (Y1 - Y0) * k / 4]);
}
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const p = y * W + x;
  let m = x >= 5 && x <= 122 && y >= 5 && y <= 58 ? 0 : x >= 4 && x <= 123 && y >= 4 && y <= 59 ? 1 : 2;
  let c;
  if (m === 2) {
    const along = x < 4 || x > 123 ? y : x, across = x < 4 || x > 123 ? x : y;
    const g = 0.72 + 0.5 * kit.noise2(along * 0.18, across * 1.7) + 0.12 * Math.sin(along * 0.9 + across * 2.1);
    const bevel = (x === 3 || x === 124 || y === 3 || y === 60) ? 1.35 : 1;
    c = kit.scale(WOOD, g * bevel);
  } else if (m === 1) c = kit.scale(FELT, 1.5);
  else c = kit.scale(FELT, 0.9 + 0.2 * kit.noise2(x * 0.9, y * 0.9));
  for (const [px, py, pr] of POCKETS) {
    const d = Math.hypot(x - px, y - py);
    if (d < pr) { m = 3; c = [0, 0, 0]; } else if (d < pr + 1) { c = kit.mix(c, [0.03, 0.015, 0.006], 0.85); m = 2; }
  }
  MAT[p] = m; ALB[3 * p] = c[0]; ALB[3 * p + 1] = c[1]; ALB[3 * p + 2] = c[2];
}
for (const [dx, dy] of DIAMONDS) for (let y = Math.floor(dy) - 1; y <= Math.ceil(dy) + 1; y++) for (let x = Math.floor(dx) - 1; x <= Math.ceil(dx) + 1; x++) {
  if (x < 0 || y < 0 || x >= W || y >= H) continue;
  const a = Math.max(0, 1 - Math.hypot(x - dx, y - dy) / 1.25), p = y * W + x;
  for (let c = 0; c < 3; c++) ALB[3 * p + c] += (PEARL[c] - ALB[3 * p + c]) * a;
}

// ------------------------------------------------------------- the lamp
const LAMP_X = [30, 63.5, 97], LAMP_H = 34, LAMP_S2 = 16 * 16;
function lampAt(now) {
  // a gentle sway, and on the hour a knock that swings it hard
  const M = Math.floor(now / 60), dg = digits(M), th = (M - (dg[2] * 10 + dg[3])) * 60, dt = now - th;
  let ax = 0.7, ay = 0.35, ph = (now / 3.4) * kit.TAU;
  if (dt >= 0 && dt < 40) { const k = Math.exp(-dt / 5); ax += 7 * k * kit.smoothstep(0, 0.35, dt); ay += 1.6 * k * kit.smoothstep(0, 0.35, dt); }
  return [ax * Math.sin(ph), ay * Math.sin(ph + 1.3)];
}

// ------------------------------------------------------------- balls
const LX = new Float64Array(3), LY = new Float64Array(3), LZ = new Float64Array(3), LI = new Float64Array(3);
const HX = new Float64Array(3), HY = new Float64Array(3), HZ = new Float64Array(3);
const SUB = 3, SO = []; for (let i = 0; i < SUB; i++) SO.push((i + 0.5) / SUB - 0.5);
function drawBall(i, x, y, q0, q1, q2, q3, lamps, lampI) {
  // body axes in world (columns of the rotation matrix)
  const e1x = 1 - 2 * (q2 * q2 + q3 * q3), e1y = 2 * (q1 * q2 + q0 * q3), e1z = 2 * (q1 * q3 - q0 * q2);
  const e2x = 2 * (q1 * q2 - q0 * q3), e2y = 1 - 2 * (q1 * q1 + q3 * q3), e2z = 2 * (q2 * q3 + q0 * q1);
  const e3x = 2 * (q1 * q3 + q0 * q2), e3y = 2 * (q2 * q3 - q0 * q1), e3z = 1 - 2 * (q1 * q1 + q2 * q2);
  for (let l = 0; l < 3; l++) {
    const dx = lamps[l][0] - x, dy = lamps[l][1] - y, dz = -LAMP_H + R, n = Math.hypot(dx, dy, dz);
    LX[l] = dx / n; LY[l] = dy / n; LZ[l] = dz / n;
    LI[l] = 1.6 * lampI / (1 + (dx * dx + dy * dy) / (2 * LAMP_S2)) ** 2;
    const hx = LX[l], hy = LY[l], hz = LZ[l] - 1, hn = Math.hypot(hx, hy, hz);
    HX[l] = hx / hn; HY[l] = hy / hn; HZ[l] = hz / hn;
  }
  const K = kind[i], c = colr[i];
  const x0 = Math.max(0, Math.floor(x - R - 0.5)), x1 = Math.min(W - 1, Math.ceil(x + R + 0.5));
  const y0 = Math.max(0, Math.floor(y - R - 0.5)), y1 = Math.min(H - 1, Math.ceil(y + R + 0.5));
  for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
    let cov = 0, sr = 0, sg = 0, sb = 0;
    for (const oy of SO) for (const ox of SO) {
      const nx = (px + ox - x) / R, ny = (py + oy - y) / R, r2 = nx * nx + ny * ny;
      if (r2 >= 1) continue;
      cov++;
      const nz = -Math.sqrt(1 - r2);
      const b1 = nx * e1x + ny * e1y + nz * e1z, b3 = nx * e3x + ny * e3y + nz * e3z;
      let ar, ag, ab;
      if (K === 2) {
        const b2 = nx * e2x + ny * e2y + nz * e2z;
        if (Math.abs(b1) > 0.93 || Math.abs(b2) > 0.93 || Math.abs(b3) > 0.93) { ar = DOT[0]; ag = DOT[1]; ab = DOT[2]; }
        else { ar = c[0]; ag = c[1]; ab = c[2]; }
      } else {
        const band = K === 0 || Math.abs(b3) < 0.5;
        if (Math.abs(b1) > 0.955) { ar = ag = ab = 0.02; }                 // the number
        else if (Math.abs(b1) > 0.8) { ar = IVORY[0]; ag = IVORY[1]; ab = IVORY[2]; }
        else if (band) { ar = c[0]; ag = c[1]; ab = c[2]; }
        else { ar = IVORY[0]; ag = IVORY[1]; ab = IVORY[2]; }
      }
      let dif = 0.07, sp = 0;
      for (let l = 0; l < 3; l++) {
        const d = nx * LX[l] + ny * LY[l] + nz * LZ[l];
        if (d > 0) dif += d * LI[l];
        const h = nx * HX[l] + ny * HY[l] + nz * HZ[l];
        if (h > 0.9) { const h2 = h * h, h4 = h2 * h2, h8 = h4 * h4, h16 = h8 * h8; sp += h16 * h16 * h16 * LI[l]; }
      }
      // felt bounce on the lower rim
      const rim = 0.06 * (1 + nz) * lampI;
      sr += ar * dif + sp * 0.9 + rim * FELT[0] * 4;
      sg += ag * dif + sp * 0.9 + rim * FELT[1] * 4;
      sb += ab * dif + sp * 0.85 + rim * FELT[2] * 4;
    }
    if (!cov) continue;
    const p = 3 * (py * W + px), a = cov / (SUB * SUB), inv = 1 / (SUB * SUB);
    img[p] = img[p] * (1 - a) + sr * inv; img[p + 1] = img[p + 1] * (1 - a) + sg * inv; img[p + 2] = img[p + 2] * (1 - a) + sb * inv;
  }
}
function shadow(x, y, lamps) {
  // soft contact shadow, thrown away from the nearest shade
  let lx = lamps[0][0], ly = lamps[0][1], bd = 1e9;
  for (const L of lamps) { const d = (L[0] - x) ** 2 + (L[1] - y) ** 2; if (d < bd) { bd = d; lx = L[0]; ly = L[1]; } }
  const sx = x + (x - lx) * 0.09, sy = y + (y - ly) * 0.09 + 0.25, rr = R * 1.25;
  const x0 = Math.max(0, Math.floor(sx - rr - 1)), x1 = Math.min(W - 1, Math.ceil(sx + rr + 1));
  const y0 = Math.max(0, Math.floor(sy - rr - 1)), y1 = Math.min(H - 1, Math.ceil(sy + rr + 1));
  for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
    const d = Math.hypot(px - sx, py - sy), a = 1 - kit.smoothstep(rr - 1.4, rr + 0.6, d);
    if (a > 0) light[py * W + px] *= 1 - 0.8 * a;
  }
}

// ------------------------------------------------------------- frog & cue
const RAINBOW = ['#7a3cff', '#2f6bff', '#18c44a', '#ffd21a', '#ff8a1a', '#ff2e2e'].map(kit.hex);
const OUTLINE = [0.004, 0.012, 0.004], RIM = [0.95, 0.95, 0.9], LENS = [0.03, 0.05, 0.04];
function ell(l, f, cl, cf, a, b) { const u = (l - cl) / a, v = (f - cf) / b; return (Math.sqrt(u * u + v * v) - 1) * Math.min(a, b); }
function put(p, c, a) { img[p] += (c[0] - img[p]) * a; img[p + 1] += (c[1] - img[p + 1]) * a; img[p + 2] += (c[2] - img[p + 2]) * a; }
function drawFrog(F, look, lit) {
  const fx = Math.cos(F.ang), fy = Math.sin(F.ang), sc = 1.12 + 0.14 * F.lift, lean = F.lean;
  const x0 = Math.max(0, Math.floor(F.x - 16)), x1 = Math.min(W - 1, Math.ceil(F.x + 16));
  const y0 = Math.max(0, Math.floor(F.y - 16)), y1 = Math.min(H - 1, Math.ceil(F.y + 16));
  // pupils look at `look` (screen direction, in the frog's frame)
  const lx = look[0] - F.x, ly = look[1] - F.y, lf = (lx * fx + ly * fy), ll = (-lx * fy + ly * fx), ln = Math.hypot(lf, ll) || 1;
  const pl = 0.9 * ll / ln, pf = 0.9 * lf / ln;
  for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
    const dx = px - F.x, dy = py - F.y;
    const f = (dx * fx + dy * fy) / sc - lean, l = (-dx * fy + dy * fx) / sc;
    const dh = ell(l, f, 0, 6.2, 8.8, 6.4), db = ell(l, f, 0, -3, 7.4, 8);
    const al = Math.abs(l), dl = ell(al, f, 7.6, -5.5, 2.7, 6.2);   // folded hind legs
    const hl = ell(al, f, 6.4, 10.8, 2.2, 2.2);                     // front feet on the rail
    const d = Math.min(dh, db, dl);
    if (d > 0.7) continue;
    const p = 3 * (py * W + px);
    let c;
    if (d > -0.9) c = OUTLINE;
    else {
      // rainbow bands across the frog, violet tail to red snout
      const band = Math.min(5, Math.max(0, Math.floor((f + 11 + 0.025 * l * l) / 3.85)));
      c = RAINBOW[band];
      if ((dl < 0 && db > -0.6 && dh > 0) || (hl < 0 && dh > -0.6)) c = kit.scale(RAINBOW[Math.max(0, band - 1)], 0.8);
      // glasses
      for (const s of [-1, 1]) {
        const gd = Math.hypot(l - s * 4.3, f - 5.9);
        if (gd < 3.3) {
          if (gd > 2.25) c = RIM;
          else {
            const pd = Math.hypot(l - s * 4.3 - pl, f - 5.9 - pf);
            c = pd < 0.75 ? [0.0, 0.0, 0.0] : pd < 1.55 ? RIM : LENS;
          }
        }
      }
      if (al < 1.4 && Math.abs(f - 6.2) < 0.55) c = RIM;   // bridge
      // smile
      const sf = 10.9 - 0.06 * l * l;
      if (al < 4.6 && Math.abs(f - sf) < 0.6 && dh < -0.5) c = OUTLINE;
    }
    const a = Math.min(1, 0.7 - d) ;
    put(p, kit.scale(c, lit), Math.min(1, a));
  }
}
const SHAFT = [0.42, 0.26, 0.1], FERRULE = [0.8, 0.8, 0.74], CHALK = kit.hex('#2f86ff');
function drawCue(cue, F, lit) {
  // lower = 1 lying along the shot; 0 held upright (seen end-on: a dot)
  const L = 48 * cue.lower + 0.01, dx = cue.dir[0], dy = cue.dir[1];
  const hx = F.x + Math.cos(F.ang) * 13.6, hy = F.y + Math.sin(F.ang) * 13.6;
  const tx = hx + (cue.tip[0] - hx) * cue.lower, ty = hy + (cue.tip[1] - hy) * cue.lower;
  const bx = tx - dx * L, by = ty - dy * L;
  const x0 = Math.max(0, Math.floor(Math.min(tx, bx) - 2)), x1 = Math.min(W - 1, Math.ceil(Math.max(tx, bx) + 2));
  const y0 = Math.max(0, Math.floor(Math.min(ty, by) - 2)), y1 = Math.min(H - 1, Math.ceil(Math.max(ty, by) + 2));
  for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
    const vx = px - tx, vy = py - ty, t = -(vx * dx + vy * dy);
    if (t < -0.8 || t > L) continue;
    const dd = Math.abs(vx * dy - vy * dx), w = 0.55 + 0.012 * Math.max(0, t);
    const a = 1 - kit.smoothstep(w - 0.5, w + 0.6, dd);
    if (a <= 0) continue;
    const c = t < 0.9 ? CHALK : t < 2.2 ? FERRULE : t > 34 ? [0.12, 0.03, 0.02] : SHAFT;
    put(3 * (py * W + px), kit.scale(c, lit), a);
  }
}

// ------------------------------------------------------------- frame
export default {
  name: 'Trick Shot',
  blurb: 'pool table from above: the time racked in pool balls; the frog breaks the minute and the balls roll to rest as the new numeral',
  layouts: ['hub-x2'], look: 'smoke', fps: 60, brightness: 0.4, dither: true,
  frame(ctx) {
    const now = ctx.date.getTime() / 1000, M = Math.floor(now / 60), s = now - M * 60;
    const dim = 1 - 0.6 * ctx.night, lampI = 1.25 * dim;
    const [sx, sy] = lampAt(now);
    const lamps = LAMP_X.map((x) => [x + sx, 31.5 + sy]);

    const F = frogState(M, s);
    // balls: in a sim (the shot that opened this minute, or the one about to open the next) or at rest
    let S = null, t = 0;
    const nx = shot(M);
    if (now >= (M + 1) * 60 - nx.travel) { S = simulate(M + 1); t = now - S.t0; }
    else if (s < 4.5) { S = simulate(M); t = now - S.t0; if (t > S.T) S = null; }
    else if (s > 30) simulate(M + 1);   // solve the next shot early, off the turn
    if (S) sample(S, t, state);
    else {
      const dg = digits(M);
      for (let sl = 0; sl < 4; sl++) for (let k = 0; k < N; k++) {
        const i = sl * N + k, p = spot(sl, dg[sl], k), q = restQ(sl, dg[sl], k);
        state[6 * i] = p[0]; state[6 * i + 1] = p[1]; state.set(q, 6 * i + 2);
      }
      const [x, y, q] = rollAt(F.ps, s - F.sp);   // at P, rolling, or at C
      state[6 * CUE] = x; state[6 * CUE + 1] = y; state.set(q, 6 * CUE + 2);
    }

    // the bed: lamp light, ball shadows
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let I = 0.025 * dim;
      for (let l = 0; l < 3; l++) { const dx = x - lamps[l][0], dy = y - lamps[l][1]; I += lampI / (1 + (dx * dx + dy * dy) / LAMP_S2) ** 2; }
      light[y * W + x] = I;
    }
    for (let i = 0; i < NB; i++) shadow(state[6 * i], state[6 * i + 1], lamps);
    for (let p = 0; p < W * H; p++) { const L = MAT[p] === 2 ? Math.max(light[p], 0.32 * dim) : light[p]; img[3 * p] = ALB[3 * p] * L; img[3 * p + 1] = ALB[3 * p + 1] * L; img[3 * p + 2] = ALB[3 * p + 2] * L; }
    for (let i = 0; i < NB; i++) drawBall(i, state[6 * i], state[6 * i + 1], state[6 * i + 2], state[6 * i + 3], state[6 * i + 4], state[6 * i + 5], lamps, lampI);

    // the hour count: every cushion the cue ball banks off rings out
    if (F.ps.hourMin && s > F.sp) {
      const d = rolled(F.ps, s - F.sp), v0 = 2 * F.ps.L / F.ps.T;
      for (let k = 1; k < F.ps.seg.length; k++) {
        const g = F.ps.seg[k]; if (d < g.at) break;
        // time since contact: invert d = v0 t - v0 t^2 / (2T)
        const tc = F.ps.T * (1 - Math.sqrt(Math.max(0, 1 - g.at / F.ps.L)));
        const age = s - F.sp - tc, a = Math.exp(-age / 0.35);
        if (a < 0.02) continue;
        const cx = g.a[0] + (g.a[0] > 64 ? R + 0.6 : -R - 0.6);
        for (let py = Math.max(0, Math.floor(g.a[1] - 4)); py <= Math.min(H - 1, g.a[1] + 4); py++)
          for (let px = Math.max(0, Math.floor(cx - 3)); px <= Math.min(W - 1, cx + 3); px++) {
            const f = Math.max(0, 1 - Math.hypot((px - cx) * 1.6, py - g.a[1]) / 4);
            const p3 = 3 * (py * W + px);
            img[p3] += 1.6 * a * f * dim; img[p3 + 1] += 1.3 * a * f * dim; img[p3 + 2] += 0.7 * a * f * dim;
          }
      }
    }
    // the frog, the cue, the chalk
    const look = F.cue || S || (s > F.sp && s < F.sp + F.ps.T) ? [state[6 * CUE], state[6 * CUE + 1]] : [F.x + Math.cos(F.ang) * 30 + 20 * Math.sin(now * 0.4), F.y + Math.sin(F.ang) * 30];
    const lit = 0.55 * dim + 0.1;
    if (F.cue) drawCue(F.cue, F, lit);
    drawFrog(F, look, lit);
    if (F.chalk > 0) {
      const hx = F.x + Math.cos(F.ang) * 10.5 - Math.sin(F.ang) * 5, hy = F.y + Math.sin(F.ang) * 10.5 + Math.cos(F.ang) * 5;
      const wob = Math.sin(now * 14) * 0.8;
      for (let py = Math.floor(hy - 3); py <= hy + 3; py++) for (let px = Math.floor(hx - 3); px <= hx + 3; px++) {
        if (px < 0 || py < 0 || px >= W || py >= H) continue;
        const d = Math.max(Math.abs(px - hx - wob), Math.abs(py - hy + wob * 0.5));
        const a = (1 - kit.smoothstep(0.6, 1.6, d)) * F.chalk;
        if (a > 0) put(3 * (py * W + px), kit.scale(CHALK, lit * 1.2), a);
      }
    }
    kit.blitGrid(ctx, img);
  },
};
