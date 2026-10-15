// The frog: seen from above, leaning over the rail, cue in hand. Walks
// (hops) round the three open sides of the table, chalks up, lines up the
// minute's trick shot and strikes it. Everything is a pure function of time.
import { shot, posShot, FROG_L, FROG_B, FROG_R, FROG_TOP, R } from './billiards-sim.js';

const RC = 7;   // corner radius of the frog path
const segs = (() => {
  const a = FROG_B - RC - FROG_TOP, b = FROG_R - FROG_L - 2 * RC, c = Math.PI * RC / 2;
  return { a, b, c, len: 2 * a + b + 2 * c };
})();
export const PATH_LEN = segs.len;
/** Point on the frog path at arc length u: position and inward normal. */
export function pathAt(u) {
  const { a, b, c } = segs;
  u = Math.max(0, Math.min(segs.len, u));
  if (u < a) return [FROG_L, FROG_TOP + u, 1, 0];
  u -= a;
  if (u < c) { const t = u / RC; return [FROG_L + RC - RC * Math.cos(t), FROG_B - RC + RC * Math.sin(t), Math.cos(t), -Math.sin(t)]; }
  u -= c;
  if (u < b) return [FROG_L + RC + u, FROG_B, 0, -1];
  u -= b;
  if (u < c) { const t = u / RC; return [FROG_R - RC + RC * Math.sin(t), FROG_B - RC + RC * Math.cos(t), -Math.sin(t), -Math.cos(t)]; }
  u -= c;
  return [FROG_R, FROG_B - RC - u, -1, 0];
}
const PT = []; for (let u = 0; u <= segs.len; u += 0.5) PT.push([u, ...pathAt(u)]);
export function projU(x, y) {
  let best = 1e9, bu = 0;
  for (const p of PT) { const d = (p[1] - x) ** 2 + (p[2] - y) ** 2; if (d < best) { best = d; bu = p[0]; } }
  return bu;
}
const sst = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const HOP = 0.42, HOPLEN = 7;
function hop(u0, u1, t0, t) {
  const n = Math.max(1, Math.ceil(Math.abs(u1 - u0) / HOPLEN)), tau = t - t0;
  if (tau <= 0) return [u0, 0];
  if (tau >= n * HOP) return [u1, 0];
  const i = Math.floor(tau / HOP), p = tau / HOP - i, e = p * p * (3 - 2 * p);
  return [u0 + (u1 - u0) * (i + e) / n, Math.sin(Math.PI * p)];
}
export const hopTime = (u0, u1) => Math.max(1, Math.ceil(Math.abs(u1 - u0) / HOPLEN)) * HOP;

const lerpAng = (a, b, t) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * t; };

/**
 * The frog and cue at second s of minute m (s in [0, 60)).
 * Returns { x, y, ang, lift, lean, cue: { on, tip, dir, lower } | null, chalk, look }.
 */
export function frogState(m, s) {
  const prev = shot(m - 1), ps = posShot(m), next = shot(m);
  const uA = projU(prev.F[0], prev.F[1]), uP = projU(ps.F[0], ps.F[1]), uC = projU(next.F[0], next.F[1]);
  const tAP = 4 + hopTime(uA, uP), sp = Math.max(12, tAP + 2.2);
  const tPC = Math.max(sp + Math.max(6.5, ps.T + 1), 48.5 - hopTime(ps.hourMin ? projU(64, FROG_B) : uP, uC));
  let u, lift;
  // on the hour count the frog steps back from the cushion to watch from the side
  const uW = ps.hourMin ? projU(64, FROG_B) : uP, tW = sp + 1.3;
  if (s < tW) [u, lift] = hop(uA, uP, 4, s);
  else if (s < tPC) [u, lift] = hop(uP, uW, tW, s);
  else [u, lift] = hop(uW, uC, tPC, s);
  const [px, py, nx, ny] = pathAt(u);
  let x = px, y = py, ang = Math.atan2(ny, nx);
  const strike = 60 - next.travel;
  let cue = null, lean = 0;
  const aim = (sh, C, k) => { ang = lerpAng(ang, Math.atan2(sh.dir[1], sh.dir[0]), k); x += (sh.F[0] - x) * k; y += (sh.F[1] - y) * k; };
  const cueAt = (C, dir, g, lower) => ({ tip: [C[0] - dir[0] * (R + g), C[1] - dir[1] * (R + g)], dir, lower });
  if (s < 4) {   // follow-through of the break, then stand up
    aim(prev, prev.C, 1 - sst(2.6, 4, s));
    cue = cueAt(prev.C, prev.dir, -3 + 5 * sst(0.4, 2.2, s), 1 - sst(2.2, 3.4, s));
    lean = 1 - sst(0.3, 1.5, s);
  } else if (s > sp - 2.4 && s < sp + 2.4) {   // the soft positional shot
    aim(ps, ps.P, sst(sp - 2.4, sp - 1.4, s) * (1 - sst(sp + 1.4, sp + 2.4, s)));
    let g;
    if (s < sp - 0.7) g = 4 + 1.5 * Math.sin(Math.PI * Math.max(0, s - sp + 1.6) / 0.9) ** 2;
    else if (s < sp - 0.1) g = 4 + 1.5 * sst(sp - 0.7, sp - 0.2, s);
    else if (s < sp) g = 5.5 * (sp - s) / 0.1;
    else g = -1.5 * sst(sp, sp + 0.1, s);
    cue = cueAt(ps.P, ps.dir, g, sst(sp - 2.2, sp - 1.3, s) * (1 - sst(sp + 1, sp + 2, s)));
  } else if (s > 49) {   // line up the break, practice strokes, strike
    aim(next, next.C, sst(49, 50.5, s));
    let g;
    const back = next.hour ? 10 : 7;
    if (s < strike - 1.0) g = 4.5 + 2.2 * Math.sin(Math.PI * Math.max(0, s - 51.6) / 1.15) ** 2;
    else if (s < strike - 0.13) g = 4.5 + (back - 4.5) * sst(strike - 1.0, strike - 0.25, s);
    else if (s < strike) g = back * (1 - (s - strike + 0.13) / 0.13);
    else g = -3 * sst(strike, strike + 0.08, s);
    cue = cueAt(next.C, next.dir, g, sst(50, 51.5, s));
    lean = sst(strike - 1, strike - 0.1, s) * 1.2;
  }
  // victory bounce after the hour's break
  if (prev.hour && s > 2.6 && s < 4.4) lift = Math.max(lift, Math.abs(Math.sin((s - 2.6) * Math.PI / 0.6)) * 0.9);
  const chalk = s > sp + 2.8 && s < sp + 6.3 ? Math.sin(Math.PI * (s - sp - 2.8) / 3.5) : 0;
  return { x, y, ang, lift, lean, cue, chalk, sp, ps };
}
