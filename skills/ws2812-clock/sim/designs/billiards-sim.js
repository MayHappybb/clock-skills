// Billiards physics: one trick shot per minute, solved deterministically.
// 49 balls (4 numerals x 12 + the cue ball) on a 118 x 54 px bed. The cue
// ball is struck so it reaches the minute digit exactly on the minute; the
// struck numeral breaks like a rack (the impulse runs through the formation),
// balls collide elastically, bounce off the cushions and roll with friction;
// then each ball is steered, by an arrive force riding on the same physics,
// to its spot in the new numeral. Collisions stay on the whole time, so
// converging balls still jostle. A last tiny correction (< 1 px typically)
// lands them exactly, and their spin is blended to the new rest pose.
import { GLYPHS, N } from './billiards-glyphs.js';

export const R = 2.5, X0 = 4.5, X1 = 122.5, Y0 = 4.5, Y1 = 58.5;
export const SLOT_X = [15, 39, 70, 94];
export const ORIGIN_Y = 10.5;
export const NB = 4 * N + 1, CUE = 4 * N;

const fract = (x) => x - Math.floor(x);
export function hash(a, b = 0, c = 0) {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const sst = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ------------------------------------------------------------- quaternions
export function qmul(a, b) {
  return [a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
    a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
    a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
    a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0]];
}
const qconj = (q) => [q[0], -q[1], -q[2], -q[3]];
export function qnorm(q) { const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1; return [q[0] / l, q[1] / l, q[2] / l, q[3] / l]; }
/** nlerp from identity toward c by w (shortest way). */
export function qtoward(c, w) {
  const s = c[0] < 0 ? -1 : 1;
  return qnorm([1 - w + w * c[0] * s, w * c[1] * s, w * c[2] * s, w * c[3] * s]);
}
function qrand(a, b, c) {
  const u1 = hash(a, b, c), u2 = hash(a, b, c + 1), u3 = hash(a, b, c + 2);
  const s1 = Math.sqrt(1 - u1), s2 = Math.sqrt(u1);
  return [s1 * Math.sin(2 * Math.PI * u2), s1 * Math.cos(2 * Math.PI * u2), s2 * Math.sin(2 * Math.PI * u3), s2 * Math.cos(2 * Math.PI * u3)];
}

// ------------------------------------------------------------- the time
export function digits(m) {
  const d = new Date(m * 60000), h = d.getHours(), mi = d.getMinutes();
  return [(h / 10) | 0, h % 10, (mi / 10) | 0, mi % 10];
}
export const spot = (slot, d, k) => [SLOT_X[slot] + 2.5 + GLYPHS[d][k][0], ORIGIN_Y + GLYPHS[d][k][1]];
/** The rest pose of ball k of a numeral: a fixed function of slot, digit and k. */
export const restQ = (slot, d, k) => qrand(slot * 10 + d, k, 7);
export const cueQ = (m) => qrand(m, 99, 3);

// ------------------------------------------------------------- the shot
// Frog path: just outside the left, bottom and right edges of the board.
export const FROG_L = -0.5, FROG_B = 62.5, FROG_R = 128.5, FROG_TOP = 18;
const shots = new Map();
/**
 * The shot that opens minute m+1, set up during minute m: where the cue ball
 * rests (C), which ball of the minute digit it aims at, the direction, and
 * where the frog must stand (F, on the frog path behind the cue ball).
 */
export function shot(m) {
  if (shots.has(m)) return shots.get(m);
  const dg = digits(m), balls = [];
  for (let s = 0; s < 4; s++) for (let k = 0; k < N; k++) balls.push(spot(s, dg[s], k));
  let res = null; const ok8 = [];
  for (let i = 0; i < 40; i++) {
    const C = [80 + 34 * hash(m, i, 11), 44 + 3.5 * hash(m, i, 12)];
    if (i >= 30) { C[0] = 88 + 24 * hash(m, i, 13); C[1] = 46; }
    let ak = -1, best = 1e9;
    for (let k = 0; k < N; k++) { const b = balls[3 * N + k], d = Math.hypot(b[0] - C[0], b[1] - C[1]); if (d < best) { best = d; ak = k; } }
    const A = balls[3 * N + ak], dx = A[0] - C[0], dy = A[1] - C[1], L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L;
    let ok = L > 7;
    for (let j = 0; j < balls.length && ok; j++) {
      if (j === 3 * N + ak) continue;
      const b = balls[j], t = Math.max(0, Math.min(L - 2 * R, (b[0] - C[0]) * ux + (b[1] - C[1]) * uy));
      if (Math.hypot(C[0] + ux * t - b[0], C[1] + uy * t - b[1]) < 2 * R + 0.3) ok = false;
    }
    if (!ok) continue;
    // frog: back along the cue line to the frog path
    const bx = -ux, by = -uy; let lam = 1e9;
    if (by > 1e-6) lam = Math.min(lam, (FROG_B - C[1]) / by);
    if (bx > 1e-6) lam = Math.min(lam, (FROG_R - C[0]) / bx);
    if (bx < -1e-6) lam = Math.min(lam, (FROG_L - C[0]) / bx);
    const F = [C[0] + bx * lam, C[1] + by * lam];
    if (lam < 21.5 || lam > 60 || F[1] < FROG_TOP + 4) continue;
    const cand = { C, ak, A, dir: [ux, uy], F, dist: L - 2 * R };
    if (!res || cand.dist > res.dist) res = cand;
    if (cand.dist >= 8) ok8.push(cand);
  }
  if (ok8.length) res = ok8[Math.floor(hash(m, 77) * ok8.length)];
  if (!res) {   // straight up from below the lowest ball: always clear
    let ak = 0; for (let k = 1; k < N; k++) if (balls[3 * N + k][1] > balls[3 * N + ak][1]) ak = k;
    const A = balls[3 * N + ak], C = [A[0], 46];
    res = { C, ak, A, dir: [0, -1], F: [A[0], FROG_B], dist: C[1] - A[1] - 2 * R };
  }
  res.hour = digits(m + 1)[3] === 0 && digits(m + 1)[2] === 0;
  res.v0 = res.hour ? 230 : 150;
  res.travel = res.dist / res.v0;
  shots.set(m, res);
  if (shots.size > 8) shots.delete(shots.keys().next().value);
  return res;
}


// ------------------------------------------------------------- the positional shot
// After the break the cue ball comes to rest at P. Mid-minute the frog plays
// a soft one-cushion shot along the open band below the numerals: P, off the
// end cushion at B, to C, where the next break is played from. Constant
// deceleration, rolling without slipping: closed form.
const qaxis = (ux, uy, ang) => { const h = ang / 2, sn = Math.sin(h); return [Math.cos(h), uy * sn, -ux * sn, 0]; };
const pshots = new Map();
/**
 * The positional shot of minute m: waypoints P, cushion contacts..., C.
 * Normally one cushion. In the first minute of an hour it is the hour count:
 * the cue ball runs the band end to end, banking off the end cushions once
 * per hour (1..12) before it stops at C.
 */
export function posShot(m) {
  if (pshots.has(m)) return pshots.get(m);
  const C = shot(m).C, dg = digits(m), hourMin = dg[2] === 0 && dg[3] === 0;
  const H = ((dg[0] * 10 + dg[1]) % 12) || 12, nb = hourMin ? H : 1;
  const XR = X1 - R, XL = X0 + R;
  let res = null;
  for (let i = 0; i < 30 && !res; i++) {
    const right = hash(m, i, 21) < 0.5;           // first cushion on the right: frog on the left
    const P = [right ? 24 + 70 * hash(m, i, 22) : 34 + 72 * hash(m, i, 22), 43.8 + (hourMin ? 2.5 : 11) * hash(m, i, 23)];
    if (Math.hypot(P[0] - C[0], P[1] - C[1]) < 2 * R + 2) continue;
    const pts = [P];
    for (let k = 0; k < nb; k++) {
      const side = (k % 2 === 0) === right ? XR : XL;
      // the last contact lies on the straight line (mirrored) to C
      let y;
      if (k === nb - 1) {
        const A = pts[pts.length - 1], Cm = [2 * side - C[0], C[1]];
        y = A[1] + (Cm[1] - A[1]) * (side - A[0]) / (Cm[0] - A[0]);
      } else y = P[1] + (C[1] - P[1]) * (k + 1) / (nb + 1) + (hourMin ? 0 : (k % 2 ? 3 : -3) * (hash(m, k, 24) * 0.6 + 0.4));
      pts.push([side, Math.min(hourMin ? 47 : Y1 - R - 0.5, Math.max(43.5, y))]);
    }
    pts.push(C);
    const u1 = [pts[1][0] - P[0], pts[1][1] - P[1]], l1 = Math.hypot(u1[0], u1[1]);
    u1[0] /= l1; u1[1] /= l1;
    const fx = right ? FROG_L : FROG_R, lam = (fx - P[0]) / -u1[0], F = [fx, P[1] - u1[1] * lam];
    if (lam < 21.5 || F[1] < FROG_TOP + 4 || F[1] > FROG_B - 2) continue;
    res = { P, C, pts, F, dir: u1 };
  }
  if (!res) {   // no bank: roll straight along the band
    const P = [C[0] - 30, 50], d = Math.hypot(C[0] - P[0], C[1] - P[1]), u = [(C[0] - P[0]) / d, (C[1] - P[1]) / d];
    res = { P, C, pts: [P, C], F: [FROG_L, 50 - u[1] / u[0] * (P[0] - FROG_L)], dir: u };
  }
  // segments
  res.seg = [];
  let L = 0;
  for (let k = 1; k < res.pts.length; k++) {
    const a = res.pts[k - 1], b = res.pts[k], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    res.seg.push({ a, ux: (b[0] - a[0]) / l, uy: (b[1] - a[1]) / l, l, at: L });
    L += l;
  }
  res.L = L; res.hourMin = hourMin; res.nb = nb;
  res.T = hourMin ? 3 + L / 190 : 1.7 + L / 110;
  res.q0 = cueQ(m);
  res.qEnd = rollAt(res, 1e9)[2];
  pshots.set(m, res);
  if (pshots.size > 8) pshots.delete(pshots.keys().next().value);
  return res;
}
/** Distance rolled tau seconds after the stroke (constant deceleration). */
export const rolled = (ps, tau) => { const k = Math.min(1, Math.max(0, tau / ps.T)); return ps.L * (1 - (1 - k) * (1 - k)); };
/** The cue ball on its positional roll, tau seconds after the stroke: [x, y, q]. */
export function rollAt(ps, tau) {
  const d = rolled(ps, tau);
  let q = ps.q0, x = ps.P[0], y = ps.P[1];
  for (const g of ps.seg) {
    const dd = Math.min(g.l, d - g.at);
    if (dd <= 0) break;
    q = qmul(qaxis(g.ux, g.uy, dd / R), q);
    x = g.a[0] + g.ux * dd; y = g.a[1] + g.uy * dd;
  }
  return [x, y, qnorm(q)];
}

// ------------------------------------------------------------- simulation
const DT = 1 / 360, REC = 3, RDT = DT * REC;
const sims = new Map();

/** The trick shot that turns minute m-1 into minute m. t = 0 is the cue strike. */
export function simulate(m) {
  if (sims.has(m)) return sims.get(m);
  const dO = digits(m - 1), dN = digits(m), sh = shot(m - 1), hour = sh.hour;
  const px = new Float64Array(NB), py = new Float64Array(NB), vx = new Float64Array(NB), vy = new Float64Array(NB);
  const tx = new Float64Array(NB), ty = new Float64Array(NB), q = [], qT = [];
  const slotOf = new Int8Array(NB), changed = dO.map((d, s) => d !== dN[s]);
  for (let s = 0; s < 4; s++) for (let k = 0; k < N; k++) {
    const i = s * N + k, a = spot(s, dO[s], k), b = spot(s, dN[s], k);
    px[i] = a[0]; py[i] = a[1]; tx[i] = b[0]; ty[i] = b[1]; slotOf[i] = s;
    q[i] = restQ(s, dO[s], k); qT[i] = restQ(s, dN[s], k);
  }
  const C1 = posShot(m).P;
  px[CUE] = sh.C[0]; py[CUE] = sh.C[1]; tx[CUE] = C1[0]; ty[CUE] = C1[1]; slotOf[CUE] = -1;
  q[CUE] = posShot(m - 1).qEnd; qT[CUE] = cueQ(m);
  vx[CUE] = sh.dir[0] * sh.v0; vy[CUE] = sh.dir[1] * sh.v0;

  const trig = [-1, -1, -1, -1];
  let hit = -1;
  const strength = hour ? 150 : 92, settle = hour ? 3.2 : 2.5;
  const explode = (s, hx, hy, t, ix, iy) => {
    trig[s] = t; if (hit < 0) hit = t;
    for (let k = 0; k < N; k++) {
      const i = s * N + k;
      let dx = px[i] - hx, dy = py[i] - hy; const d = Math.hypot(dx, dy) || 1;
      dx /= d; dy /= d;
      // the blow travels on through the rack: mostly along the incoming line
      dx += ix * 0.9; dy += iy * 0.9;
      const a = (hash(m, i, 5) - 0.5) * 0.9, c = Math.cos(a), sn = Math.sin(a), l = Math.hypot(dx, dy) || 1;
      const ex = (dx * c - dy * sn) / l, ey = (dx * sn + dy * c) / l;
      const sp = strength * (0.5 + 0.5 * hash(m, i, 6)) * (1.15 - Math.min(d, 26) / 40);
      vx[i] += ex * sp; vy[i] += ey * sp;
    }
  };
  const moved = new Uint8Array(NB), G = new Float64Array(NB);
  moved[CUE] = 1;
  const frames = [];
  let T = 4.5, t = 0;
  for (let step = 0; t <= T + 1e-9; step++, t = step * DT) {
    if (step % REC === 0) {
      const f = new Float32Array(NB * 6);
      for (let i = 0; i < NB; i++) { f[6 * i] = px[i]; f[6 * i + 1] = py[i]; f[6 * i + 2] = q[i][0]; f[6 * i + 3] = q[i][1]; f[6 * i + 4] = q[i][2]; f[6 * i + 5] = q[i][3]; }
      frames.push(f);
    }
    // fallback triggers: a broken rack shakes its neighbours loose
    if (hit >= 0) for (let s = 3; s >= 0; s--) if (changed[s] && trig[s] < 0 && t > hit + 0.1 * (3 - s) + 0.06) {
      const c = spot(s, dN[s], 0);
      explode(s, SLOT_X[s] + 22, ORIGIN_Y + 14 + (hash(m, s) - 0.5) * 10, t, -0.7, 0);
    }
    for (let i = 0; i < NB; i++) {
      const s = slotOf[i];
      let g;
      if (i === CUE) g = hit < 0 ? 0 : sst(hit + 0.45, hit + 1.2, t);
      else if (changed[s]) g = trig[s] < 0 ? 0 : sst(trig[s] + 0.3, trig[s] + 1.05, t);
      else g = moved[i] ? 1 : 0;
      G[i] = i === CUE || changed[s] ? g : 0;
      let ux = vx[i], uy = vy[i];
      const sp = Math.hypot(ux, uy);
      if (sp > 0) {   // rolling resistance
        const ns = Math.max(0, sp - 22 * DT) * (1 - 0.55 * DT);
        ux *= ns / sp; uy *= ns / sp;
      }
      if (g > 0) {
        let dx = (tx[i] - px[i]) * 4.2, dy = (ty[i] - py[i]) * 4.2;
        const dl = Math.hypot(dx, dy); if (dl > 140) { dx *= 140 / dl; dy *= 140 / dl; }
        ux += (dx - ux) * g * 7 * DT; uy += (dy - uy) * g * 7 * DT;
      }
      vx[i] = ux; vy[i] = uy;
      if (ux === 0 && uy === 0) continue;
      moved[i] = 1;
      px[i] += ux * DT; py[i] += uy * DT;
      // rolling without slipping: w = (vy, -vx, 0) / R (z into the table)
      const wx = uy / R, wy = -ux / R, w = Math.hypot(wx, wy);
      if (w > 1e-9) {
        const h = w * DT / 2, sn = Math.sin(h) / w;
        q[i] = qmul([Math.cos(h), wx * sn, wy * sn, 0], q[i]);
        if (step % 48 === 0) q[i] = qnorm(q[i]);
      }
      // cushions
      if (px[i] < X0 + R) { px[i] = X0 + R; vx[i] = -vx[i] * 0.8; }
      if (px[i] > X1 - R) { px[i] = X1 - R; vx[i] = -vx[i] * 0.8; }
      if (py[i] < Y0 + R) { py[i] = Y0 + R; vy[i] = -vy[i] * 0.8; }
      if (py[i] > Y1 - R) { py[i] = Y1 - R; vy[i] = -vy[i] * 0.8; }
    }
    // collisions
    const D = 2 * R, D2 = D * D;
    for (let i = 0; i < NB; i++) for (let j = i + 1; j < NB; j++) {
      const dx = px[j] - px[i]; if (dx > D || dx < -D) continue;
      const dy = py[j] - py[i]; if (dy > D || dy < -D) continue;
      const d2 = dx * dx + dy * dy; if (d2 >= D2) continue;
      if (!moved[i] && !moved[j]) continue;
      const d = Math.sqrt(d2) || 1e-3, nx = dx / d, ny = dy / d;
      const rel = (vx[i] - vx[j]) * nx + (vy[i] - vy[j]) * ny;
      // late in the settle, steered balls squeeze past each other instead of jamming
      const soft = 1 - Math.max(G[i], G[j]) ** 2;
      if (rel > 0) {
        const im = 0.5 * (1 + 0.94) * rel * soft;
        vx[i] -= im * nx; vy[i] -= im * ny; vx[j] += im * nx; vy[j] += im * ny;
      }
      const o = (D - d) * 0.5 * soft; px[i] -= nx * o; py[i] -= ny * o; px[j] += nx * o; py[j] += ny * o;
      moved[i] = moved[j] = 1;
      // a moving ball striking an unbroken changing numeral breaks it
      for (const [a, b] of [[i, j], [j, i]]) {
        const s = slotOf[b];
        if (s >= 0 && changed[s] && trig[s] < 0 && slotOf[a] !== s && rel > 15) {
          const sp = Math.hypot(vx[a], vy[a]) + 1e-6;
          explode(s, px[a] + nx * (a === i ? R : -R), py[a] + ny * (a === i ? R : -R), t, (a === i ? nx : -nx), (a === i ? ny : -ny));
        }
      }
    }
    if (hit >= 0 && T === 4.5) T = hit + settle;
  }
  const n = frames.length, last = frames[n - 1];
  const res = new Float32Array(NB * 2), corr = [], gs = new Float32Array(NB);
  for (let i = 0; i < NB; i++) {
    res[2 * i] = tx[i] - last[6 * i]; res[2 * i + 1] = ty[i] - last[6 * i + 1];
    const qe = [last[6 * i + 2], last[6 * i + 3], last[6 * i + 4], last[6 * i + 5]];
    corr[i] = qnorm(qmul(qT[i], qconj(qe)));
    gs[i] = i === CUE ? hit + 0.45 : changed[slotOf[i]] ? (trig[slotOf[i]] >= 0 ? trig[slotOf[i]] + 0.3 : hit) : hit;
  }
  const out = { m, frames, n, T, hit, res, corr, gs, moved, hour, t0: m * 60 - sh.travel, sh };
  sims.set(m, out);
  if (sims.size > 4) sims.delete(sims.keys().next().value);
  return out;
}

/** Ball i of a sim at time t: writes x, y and quaternion into o (offset 6i). */
export function sample(S, t, o) {
  const f = Math.min(S.n - 1.001, Math.max(0, t / RDT)), k = Math.floor(f), a = f - k;
  const A = S.frames[k], B = S.frames[k + 1];
  const w = sst(S.T - 0.7, S.T, t);
  for (let i = 0; i < NB; i++) {
    const j = 6 * i;
    o[j] = A[j] + (B[j] - A[j]) * a + S.res[2 * i] * w;
    o[j + 1] = A[j + 1] + (B[j + 1] - A[j + 1]) * a + S.res[2 * i + 1] * w;
    let q0 = A[j + 2], q1 = A[j + 3], q2 = A[j + 4], q3 = A[j + 5];
    const sg = q0 * B[j + 2] + q1 * B[j + 3] + q2 * B[j + 4] + q3 * B[j + 5] < 0 ? -1 : 1;
    q0 += (B[j + 2] * sg - q0) * a; q1 += (B[j + 3] * sg - q1) * a; q2 += (B[j + 4] * sg - q2) * a; q3 += (B[j + 5] * sg - q3) * a;
    const qq = qmul(qtoward(S.corr[i], sst(S.gs[i], S.T, t)), [q0, q1, q2, q3]);
    const l = Math.hypot(qq[0], qq[1], qq[2], qq[3]);
    o[j + 2] = qq[0] / l; o[j + 3] = qq[1] / l; o[j + 4] = qq[2] / l; o[j + 5] = qq[3] / l;
  }
}
