// Rube Goldberg: a 512 mm workshop shelf of contraption whose only output is
// the time. Every minute a marble leaves the hopper, rolls the rail across
// the hours, drops into a seesaw cup and flings the frog up into the
// pendulum boot (which ticks the seconds); the boot kicks a row of
// dominoes along the top of the minutes and the last one trips the pawl of
// the minute drum exactly on the minute. Each figure is shown by its own
// device, in signwriter's numerals painted on wood: a pop-up sign, an oak
// tile in a chute, six flipping walnut slats, a ten-card maple drum. The
// marble rides a hamster-driven belt home and a bucket lift back up. On the
// hour three marbles go, the frog surfs the domino wave to the end of the
// banner, a rope fires the boxing glove that punches the hour tile out, the
// flag goes up and confetti flies.
import * as kit from '../js/kit.js';
import { Canvas } from './rubegoldberg-draw.js';
import * as M from './rubegoldberg-mech.js';
import * as P from './rubegoldberg-parts.js';
import * as T from './rubegoldberg-time.js';

const cv = new Canvas(256, 64);
const pad = (n) => String(n).padStart(2, '0');
/** HHMM digits at minute index m of the day (any integer). */
const digitsAt = (m) => { m = ((m % 1440) + 1440) % 1440; return pad(Math.floor(m / 60)) + pad(m % 60); };
const { ease, clamp } = kit;

// ------------------------------------------------------------ dominoes
const PHI_F = (i) => (i === T.DOM.n - 1 ? 1.5 : 1.12);
const RESET = (i) => 12 + 1.3 * i;
function dominoAngle(i, rtN, rtP) {
  const tf = T.T_D0 + i * T.DOM.step;
  if (rtN >= tf) return PHI_F(i) * ease.in(clamp((rtN - tf) / T.DOM.fall));
  const k = clamp((rtP - RESET(i)) / 0.6);
  return PHI_F(i) * (1 - ease.outBack(k));
}

// ------------------------------------------------------------ the frog's day
const SIT = (th) => { const [x, y] = P.rightEnd(th); return [x - 4, y - 0.9]; };
const APEX = [140, 36];
const SHELF_A = 168, SHELF_B = 230, SY = T.DOM.shelf - 0.3;
/** Frog pose for one run, or null if it is just sitting on the seesaw. */
function frogRun(rt, hour) {
  if (rt < T.T_FROG) return null;
  const P0 = SIT(T.TH0);
  if (rt < T.T_KICK) {
    const k = (rt - T.T_FROG) / (T.T_KICK - T.T_FROG);
    return { x: kit.lerp(P0[0], APEX[0], k), y: kit.lerp(P0[1], APEX[1], ease.out(k)), legs: 1 - k * 0.5, face: 1 };
  }
  if (!hour) {
    const P1 = SIT(-T.TH0), k = (rt - T.T_KICK) / 0.5;
    if (k < 1) return { x: kit.lerp(APEX[0], P1[0], k), y: kit.lerp(APEX[1], P1[1], ease.in(k)), legs: 0.3 + 0.5 * k, face: 1 };
    const b = rt - T.T_KICK - 0.5;
    return b < 0.4 ? { ...pos(P1), squash: 0.25 * Math.sin((b / 0.4) * Math.PI), face: 1 } : null;
  }
  // the hour: onto the shelf, surf the wave, party, come home
  const S0 = T.T_D0 + 0.35;
  if (rt < S0) {
    const k = (rt - T.T_KICK) / (S0 - T.T_KICK);
    return { x: kit.lerp(APEX[0], SHELF_A, k), y: kit.lerp(APEX[1], SY, ease.inOut(k)) - 9 * Math.sin(k * Math.PI), legs: 0.6, face: 1 };
  }
  const hop = (a, b, t0, t1, n, face, h = 3.2) => {
    const k = clamp((rt - t0) / (t1 - t0)), q = k * n, j = Math.min(n - 1, Math.floor(q)), f = q - j;
    const x = kit.lerp(a, b, (j + ease.inOut(f)) / n);
    return { x, y: SY - h * Math.sin(f * Math.PI), legs: Math.sin(f * Math.PI), squash: f < 0.12 || f > 0.9 ? 0.15 : 0, face };
  };
  if (rt < 0) return hop(SHELF_A, SHELF_B, S0, 0, 4, 1);
  if (rt < 5) {
    const b = rt % 0.8 / 0.8;
    return { x: SHELF_B, y: SY - (rt < 3.2 ? 3 * Math.sin(b * Math.PI) : 0), legs: rt < 3.2 ? Math.sin(b * Math.PI) : 0, face: Math.floor(rt / 1.6) % 2 ? -1 : 1, squash: rt < 3.2 && b < 0.15 ? 0.2 : 0 };
  }
  if (rt < 8.6) return hop(SHELF_B, SHELF_A, 5, 8.6, 4, -1);
  const P1 = SIT(-T.TH0);
  if (rt < T.frogHourBack) {
    const k = (rt - 8.6) / (T.frogHourBack - 8.6);
    return { x: kit.lerp(SHELF_A, P1[0], k), y: kit.lerp(SY, P1[1], ease.in(k)) - 6 * Math.sin(k * Math.PI), legs: 0.7, face: -1 };
  }
  const b = rt - T.frogHourBack;
  return b < 0.4 ? { ...pos(SIT(-T.TH0 + 2 * T.TH0 * ease.outBack(clamp(b / 0.35)))), squash: 0.3 * Math.sin((b / 0.4) * Math.PI), face: 1 } : null;
}
const pos = ([x, y]) => ({ x, y });

// ------------------------------------------------------------ marbles
/** Where marble k of a run is at rt (relative to the run's minute), or null if queued. */
function marblePos(rt, k, hour, th, slotX) {
  const m = T.marbleTimes(T.relTime(k), k, hour);
  if (rt < m.r || rt >= m.home) return null;
  if (rt < m.r + T.TR) {
    const a = rt - m.r, s = 0.5 * (T.VR / T.TR) * a * a;
    const R = T.RAIL, cs = (R.x1 - R.x0) / Math.hypot(R.x1 - R.x0, R.y1 - R.y0);
    const x = T.SLOT(0) + s * cs;
    return [x, T.ballY(x)];
  }
  if (rt < m.land) {
    const a = rt - m.r - T.TR, R = T.RAIL, L = Math.hypot(R.x1 - R.x0, R.y1 - R.y0);
    return [R.x1 + T.VR * ((R.x1 - R.x0) / L) * a, T.ballY(R.x1) + T.VR * ((R.y1 - R.y0) / L) * a + (T.G / 2) * a * a];
  }
  if (rt < m.out) { const [x, y] = T.cupPos(th); return [x + 0.4 * k, y - 4.4 * k]; }
  const by = T.BELT.y - 1 - T.MR;
  if (rt < m.belt) {
    const [x, y] = T.cupPos(th), f = (rt - m.out) / (m.belt - m.out);
    return [kit.lerp(x, m.x0, f), kit.lerp(y - 4.4 * k, by, ease.in(f))];
  }
  const lx = T.LIFT.x + T.LIFT.r + 1.4;
  if (rt < m.atLift) return [m.x0 - T.BELT.v * (rt - m.belt), by];
  if (rt < m.lift) return [lx, by];
  if (rt < m.top) return [lx, T.LIFT.yb - T.LIFT_V * (rt - m.lift) - T.MR + 0.3];
  const f = ease.inOut((rt - m.top) / (m.home - m.top));
  return [kit.lerp(lx, slotX, f), kit.lerp(T.LIFT.yt - T.MR - 0.5, T.ballY(slotX), f) - 2 * Math.sin(f * Math.PI)];
}

export default {
  name: 'Rube Goldberg',
  blurb: 'a 512 mm chain-reaction machine whose only output is the time: marble, seesaw, frog, boot, dominoes, drum',
  layouts: ['hub-x4'], look: 'smoke', fps: 60, brightness: 0.4, dither: true,
  frame(ctx) {
    cv.clear();
    const d = ctx.date;
    const tday = d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds() + d.getMilliseconds() / 1000;
    const mIdx = Math.floor(tday / 60), Mb = mIdx * 60;
    const rtP = tday - Mb, rtN = rtP - 60;                 // since the last turn, to the next
    const hourP = mIdx % 60 === 0, hourN = (mIdx + 1) % 60 === 0;
    const nP = T.runCount(hourP), nN = T.runCount(hourN);
    const prev = digitsAt(mIdx - 1), cur = digitsAt(mIdx), next = digitsAt(mIdx + 1);
    // each slot: the last change, or the coming one if it starts early
    const slot = (k) => (rtN > -0.25 && cur[k] !== next[k] ? [+cur[k], +next[k], rtN] : [+prev[k], +cur[k], rtP]);

    // ---- states
    let th = T.seesawRun(rtN, hourN);
    if (th === null) th = T.seesawRun(rtP, hourP) ?? T.TH0;
    const kick = (rt) => (rt > T.T_KICK ? 0.32 * Math.exp(-(rt - T.T_KICK) / 2.5) * Math.sin(Math.PI * (rt - T.T_KICK)) : 0);
    const bootTh = 0.045 * Math.cos(Math.PI * tday) + kick(rtN) + kick(rtP);
    const R14 = RESET(T.DOM.n - 1);
    const leverA = rtN >= -0.06 ? 0.42 * ease.out(clamp((rtN + 0.06) / 0.1)) : 0.42 * (1 - ease.inOut(clamp((rtP - R14) / 0.4)));
    const punch = hourP ? (rtP < 0.12 ? ease.out(rtP / 0.12) : rtP < 0.5 ? 1 : 1 - ease.inOut(clamp((rtP - 0.5) / 0.8))) : 0;
    const ropeShift = hourP ? -6 * (rtP < 0.1 ? ease.out(rtP / 0.1) : 1 - ease.inOut(clamp((rtP - 0.1) / 2))) : 0;
    const flagH = hourP ? (rtP < 50 ? ease.outBack(clamp((rtP - 0.2) / 1.4)) : 1 - ease.inOut(clamp((rtP - 50) / 5))) : 0;
    // hamster wheel: steady trot, a sprint around the hour
    const w0 = 1.6, hb = Math.floor((tday + 8) / 3600), u = tday - hb * 3600;
    const I = u < 4 ? ((u + 8) - (12 / (2 * Math.PI)) * Math.sin((2 * Math.PI * (u + 8)) / 12)) / 2 : 6;
    const wAng = w0 * tday + 2 * w0 * (6 * hb + I);

    // ---- draw, back to front
    const [lex, ley] = [242.5, 19.5 - 4.5 * Math.sin(leverA)];
    P.rope(cv, lex, ley, ropeShift);
    P.lift(cv, tday);
    P.gears(cv, tday);
    P.lamp(cv, tday);
    P.rail(cv);
    P.belt(cv, tday);
    const s0 = slot(0), s1 = slot(1), s2 = slot(2), s3 = slot(3);
    M.drawSign(cv, s0[0], s0[1], s0[2], tday);
    M.drawSlats(cv, s2[0], s2[1], s2[2]);
    M.drawDrum(cv, M.drumAngle(s3[0], s3[1], s3[2], s3[1] === 0));
    P.shelf(cv);
    for (let i = 0; i < T.DOM.n; i++) P.domino(cv, i, dominoAngle(i, rtN, rtP));
    P.lever(cv, leverA);
    P.hamsterWheel(cv, wAng, wAng * 1.6, tday);
    P.seesaw(cv, th);
    P.boot(cv, bootTh);

    // marbles: queue in the hopper, the last run on its way home, the next run
    const base = 4 - nP;
    let nrel = 0, gate = 0;
    for (let k = 0; k < nN; k++) {
      nrel += ease.inOut(clamp((rtN - T.relTime(k)) / 0.4));
      gate = Math.max(gate, clamp(1 - Math.abs(rtN - T.relTime(k) - 0.1) / 0.35));
    }
    for (let q = 0; q < 4; q++) {
      if (q < nN && rtN >= T.relTime(q)) continue;
      const home = q < base || rtP >= T.marbleTimes(T.relTime(q - base), q - base, hourP).home;
      if (home) P.marble(cv, T.SLOT(q - nrel), T.ballY(T.SLOT(q - nrel)));
    }
    for (let k = 0; k < nP; k++) { const p = marblePos(rtP, k, hourP, th, T.SLOT(base + k)); if (p) P.marble(cv, p[0], p[1]); }
    for (let k = 0; k < nN; k++) { const p = marblePos(rtN, k, hourN, th, 0); if (p) P.marble(cv, p[0], p[1]); }
    P.gate(cv, ease.inOut(gate));

    M.drawTile(cv, s1[0], s1[1], s1[2]);
    M.drawGlove(cv, punch, tday);
    // the frog
    let f = frogRun(rtN, hourN) ?? frogRun(rtP, hourP);
    if (!f) f = { ...pos(SIT(th)), squash: 0.04 * Math.sin(tday * 2.2), face: 1 };
    const blink = kit.fract(tday / 4.3) < 0.04 ? 1 : 0;
    P.frog(cv, f.x, f.y, { squash: f.squash ?? 0, legs: f.legs ?? 0, face: f.face ?? 1, blink, look: 0.3 * Math.sin(tday * 0.7) });
    P.flag(cv, flagH, tday);
    if (hourP) P.confetti(cv, rtP);

    kit.blitGrid(ctx, cv.px, 1 - 0.6 * ctx.night);
  },
};
