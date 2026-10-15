// Triadic: Oskar Schlemmer's Triadisches Ballett (Bauhaus, 1922), danced by
// the time. Each numeral is a costumed dancer whose padded tubes, spheres,
// hoops and cones make the digit's shape (triadic-cast.js): the hoop lady is
// a 0, the Goldkugel a 1, the disc dancer an 8. They stand in two couples on
// a stage, hours and minutes, and dance all the time, a mechanical
// marionette ballet on the clock's own beat: one pose a second, eased and
// sprung, a 4-beat phrase per couple that changes every minute, partners
// mirrored, the striped costumes spinning as they go, the follow spots
// tracking them. Below, in the pit between the couples, the conductor beats
// the bar in 4/4 (down, left, right, up), one beat a second: the clock.
//
// Minute turn: from :56 each dancer whose digit is about to change bows,
// then steps sideways into the wings (the inner dancer of a couple passes
// upstage, smaller and in shadow, behind its partner); it is off the glass
// before :00. After :00 a spot opens at the wing, the new dancer steps in,
// takes its place and strikes its pose, costume spinning up.
//
// Hour: a new act. All four bow together (the curtain call), raise their
// arms in a tableau, and the gauze traveller sweeps shut with the next act's
// title card: a red square, a yellow disc, a blue triangle and the act's
// name in geometric lowercase. Behind the gauze (the dancers stay faintly
// visible through it) the changing dancers fade out before :00 and the new
// ones in after it, the cyclorama turns to the new act's colour, and the
// curtain opens on a group figure: a held tableau, a wave of hops along
// the line, a jump in unison, the spots in coloured
// gels.
//
// Palette: the acts are Schlemmer's series, yellow, pink and black, plus a
// Bauhaus blue: deep saturated cycloramas, darkest at the top, so the light
// costumes (ivory, white, cream, silver, gold, with red, blue and black
// stripes: the Bauhaus triad) stand off them inside a ring of dark keyline.
// The black act plays at night (23-7) as a deep violet-black with warm spot
// pools; the backlight dims to 35 %, and the spots keep each dancer in a
// pool of light, which is what makes the night face read.
//
// Hard or AA: everything that moves is anti-aliased (the costumes are their
// own AA rasteriser, the limbs too); the valance and floor lines are hard.
//
// Cost: the costume rasteriser charges itself to the estimate (see
// triadic-tube.js). The cyclorama and floor are two g.coarse passes with the
// spot pools in them. No sprites or tables beyond two small lookup tables
// (sqrt and sphere z, about 5 KB as float32, 2.5 KB as 16-bit fixed point).

import { sin, clamp, progress, ease, lerp, mix, hash, clockFields } from '../js/kit.js';
import { dancer, drawLimbs, drawCostume } from './triadic-cast.js';
import { ACTS, actOf, blendAct, SPOTS, drawStage, drawValance, drawCurtain, drawBeams, drawApron, drawConductor } from './triadic-stage.js';

const SLOT = [19, 51, 109, 141];
const WING = [-24, -24, 184, 184];
const FY = 74.5;          // the floor line the dancers stand on
const BASE = 1.08;      // costume scale downstage
const DS = [dancer(), dancer(), dancer(), dancer()];
const ACT = { ...ACTS[0] };
const GELS = [0xff4030, 0xffd040, 0x3070ff, 0xffffff];

// ------------------------------------------------------------ poses
// [tilt, aL0, aL1, aR0, aR1, liftL, liftR, rise, nod, look]
const P_T = [0, 1.55, 0.15, 1.55, 0.15, 0, 0, 0, 0, 0];
const P_RU = [-0.06, 0.55, 0.35, 2.75, -0.35, 1, 0, 1, 0, 1];
const P_V = [0, 2.45, 0.35, 2.45, 0.35, 0, 0, 2.2, -0.4, 0];
const P_HIP = [0, 1.15, -1.9, 1.15, -1.9, 0, 0, 0, 0.6, 0];
const P_CR = [0.08, 0.7, 0.3, 2.0, 0.45, 0, 1, 0.6, 0, 1];
const P_BELL = [0.04, 0.35, 0.1, 0.35, 0.1, 0, 0, 0, 0.3, -0.5];
const P_HOLD = [0.04, 2.5, 0.3, 1.2, -0.9, 0, 0, 0.4, 0, 1];
const P_HOLD2 = [0.07, 1.6, 0.2, 1.2, -0.9, 1, 0, 0.8, 0, 1];
const mirror = (p) => [-p[0], p[3], p[4], p[1], p[2], p[6], p[5], p[7], p[8], -p[9]];
const P_LU = mirror(P_RU), P_CL = mirror(P_CR);
const PHRASES = [
  [P_T, P_RU, P_V, P_LU],
  [P_HIP, P_CR, P_HIP, P_CL],
  [P_V, P_T, P_BELL, P_T],
  [P_RU, P_LU, P_RU, P_V],
  [P_T, P_CR, P_T, P_CL],
  [P_HOLD, P_HOLD2, P_HOLD, P_V],
  [P_T, P_HOLD, P_HOLD2, P_HOLD],
];
const POSE = new Float32Array(10);

/** The beat pose of slot j at absolute second B. */
function beatPose(j, B, keyAtB) {
  const ph = PHRASES[hash(keyAtB, j >> 1) % PHRASES.length];
  const p = ph[(B + (j >> 1)) & 3];
  return (j & 1) ? mirror(p) : p;
}

function setPose(D, p) {
  D.tilt = p[0]; D.aL0 = p[1]; D.aL1 = p[2]; D.aR0 = p[3]; D.aR1 = p[4];
  D.liftL = p[5]; D.liftR = p[6]; D.rise = p[7]; D.nod = p[8]; D.look = p[9];
}
function blendPose(D, p, w) {
  if (w <= 0) return;
  D.tilt = lerp(D.tilt, p[0], w); D.aL0 = lerp(D.aL0, p[1], w); D.aL1 = lerp(D.aL1, p[2], w);
  D.aR0 = lerp(D.aR0, p[3], w); D.aR1 = lerp(D.aR1, p[4], w); D.liftL = lerp(D.liftL, p[5], w);
  D.liftR = lerp(D.liftR, p[6], w); D.rise = lerp(D.rise, p[7], w); D.nod = lerp(D.nod, p[8], w); D.look = lerp(D.look, p[9], w);
}

/** The ordinary dance: one pose a second, sprung, with a sway and a bob on the beat. */
function dance(D, j, f, s, tod) {
  const b = Math.floor(s), u = s - b;
  const key0 = f.minuteKey, key1 = b + 1 >= 60 ? key0 + 1 : key0;
  const pa = beatPose(j, b, key0), pb = beatPose(j, b + 1, key1);
  const e = ease.outBack(progress(u, 0, 0.62));
  for (let i = 0; i < 10; i++) POSE[i] = pa[i] + (pb[i] - pa[i]) * e;
  setPose(D, POSE);
  D.tilt += 0.03 * sin(tod * 1.5708 + j * 1.3);
  D.rise += 0.7 * (0.5 - 0.5 * sin(6.2832 * u + 1.5708));
}

/** Travelling sideways: stepping, arms swinging, leaning into it. */
const TP = new Float32Array(10);
function travel(D, dist, dir, lean, w) {
  const st = sin(Math.PI * dist / 4.6);
  TP[0] = dir * 0.07 * lean; TP[1] = 1.0 + 0.45 * st; TP[2] = 0.3; TP[3] = 1.0 - 0.45 * st; TP[4] = 0.3;
  TP[5] = st > 0 ? st * 0.9 : 0; TP[6] = st < 0 ? -st * 0.9 : 0; TP[7] = 1.1 * (st > 0 ? st : -st);
  TP[8] = 0; TP[9] = dir * clamp(lean * 2.5, 0, 1);
  blendPose(D, TP, w);
}

function bow(D, amt) {
  D.sy = 1 - 0.1 * amt; D.nod = 2.4 * amt; D.tilt = 0; D.rise = 0;
  D.aL0 = 1.0 - 0.45 * amt; D.aR0 = 1.0 - 0.45 * amt; D.aL1 = 0.3; D.aR1 = 0.3; D.liftL = 0; D.liftR = 0; D.look = 0;
}

const smooth = (v) => v * v * (3 - 2 * v);

// ------------------------------------------------------------ the frame

export default {
  name: 'Triadic',
  blurb: "Schlemmer's Triadic Ballet: the digits are costumed dancers; changing ones bow and exit, the hour is a new act.",
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, tod = f.h * 3600 + f.m * 60 + s;
    ctx.lcd.backlight(1 - 0.65 * ctx.night);
    const nf = clockFields(new Date(ctx.date.getTime() + 60000)), pf = clockFields(new Date(ctx.date.getTime() - 60000));
    const cur = f.hh + f.mm, nxt = nf.hh + nf.mm, prv = pf.hh + pf.mm;
    const hourEnd = nf.h !== f.h, hourStart = pf.h !== f.h;

    // ---- the act: its colours cross-fade behind the closed curtain
    if (hourEnd) blendAct(ACT, ACTS[actOf(f.h)], ACTS[actOf(nf.h)], progress(s, 59.4, 60.6));
    else if (hourStart) blendAct(ACT, ACTS[actOf(pf.h)], ACTS[actOf(f.h)], progress(s + 60, 59.4, 60.6));
    else blendAct(ACT, ACTS[actOf(f.h)], ACTS[actOf(f.h)], 0);
    let curtain = 0;
    if (hourEnd) curtain = ease.inOutCubic(progress(s, 58.5, 59.5));
    if (hourStart) curtain = 1 - ease.inOutCubic(progress(s, 0.4, 1.4));
    const gelW = hourStart ? Math.max(0, sin(Math.PI * progress(s, 1.4, 6.6))) : 0;

    // ---- the dancers' poses, and their spots
    SPOTS.n = 0;
    for (let j = 0; j < 4; j++) {
      const D = DS[j];
      D.d = +cur[j]; D.t = tod; D.x = SLOT[j]; D.fy = FY; D.s = BASE; D.k = 1; D.sy = 1;
      D.light = 1; D.alpha = 1; D.spin = 0; D.wave = 1; D.dep = 0;
      let spotI = 1;
      const dir = j < 2 ? -1 : 1, inner = j === 1 || j === 2;
      dance(D, j, f, s, tod);

      if (hourEnd) {
        // curtain call, a tableau, then the curtain
        const bw = smooth(progress(s, 55.6, 56.1));
        if (bw > 0) {
          const amt = sin(Math.PI * progress(s, 56.1, 57.2));
          const save = [D.tilt, D.aL0, D.aL1, D.aR0, D.aR1, D.liftL, D.liftR, D.rise, D.nod, D.look];
          bow(D, amt);
          const bowP = [D.tilt, D.aL0, D.aL1, D.aR0, D.aR1, D.liftL, D.liftR, D.rise, D.nod, D.look];
          setPose(D, save); blendPose(D, bowP, bw);
          D.sy = 1 - 0.1 * amt * bw;
          const tw = ease.outBack(progress(s, 57.2, 57.8));
          if (tw > 0) { blendPose(D, P_V, tw); D.spin = 2 * ease.outCubic(progress(s, 57.2, 59)); D.sy = 1; }
        }
        if (cur[j] !== nxt[j]) D.alpha = 1 - progress(s, 59.5, 59.95);
      } else if (hourStart) {
        if (cur[j] !== prv[j]) D.alpha = progress(s, 0.05, 0.5);
        // the group figure: tableau, a wave of hops, a jump, then back to the dance
        const back = smooth(progress(s, 6.0, 6.8));
        const hold = 1 - back;
        blendPose(D, P_V, hold);
        // a wave along the line: each in turn drops its arms, hops and throws them up again
        // (no turns: a narrowed or mirrored costume could read as another digit)
        const tu = progress(s, 2.2 + 0.4 * j, 3.2 + 0.4 * j);
        if (tu > 0 && tu < 1) { const y = sin(Math.PI * tu); blendPose(D, P_T, y); D.rise += 3.2 * y * y; }
        const cr = sin(Math.PI * progress(s, 4.9, 5.25));
        D.sy -= 0.08 * cr; D.rise -= 1.6 * cr;
        D.rise += 5 * sin(Math.PI * progress(s, 5.25, 5.75));
        D.spin = 2 * ease.outCubic(progress(s, 1.6, 5.8));
      } else {
        if (cur[j] !== nxt[j]) {
          // the exit: bow, then step sideways into the wing
          const bw = smooth(progress(s, 56.5, 56.9));
          const amt = sin(Math.PI * progress(s, 56.9, 57.9));
          if (bw > 0 && s < 57.9) {
            const save = [D.tilt, D.aL0, D.aL1, D.aR0, D.aR1, D.liftL, D.liftR, D.rise, D.nod, D.look];
            bow(D, amt);
            const bowP = [D.tilt, D.aL0, D.aL1, D.aR0, D.aR1, D.liftL, D.liftR, D.rise, D.nod, D.look];
            setPose(D, save); blendPose(D, bowP, bw); D.sy = 1 - 0.1 * amt;
          }
          if (s >= 57.9) {
            const u = progress(s, 57.9, 59.65);
            const xp = ease.inOutQuad(progress(u, 0.12, 1));
            const dep = inner ? smooth(progress(u, 0, 0.3)) : 0;
            D.x = lerp(SLOT[j], WING[j], xp); D.dep = dep;
            travel(D, Math.abs(D.x - SLOT[j]) + dep * 8, dir, sin(Math.PI * xp), 1);
            spotI = 1 - progress(u, 0.8, 1);
            if (u >= 1) D.alpha = 0;
          }
        }
        if (cur[j] !== prv[j]) {
          // the entrance: a spot opens at the wing, the dancer steps in and strikes its pose
          const outerWait = !inner && cur[j ^ 1] !== prv[j ^ 1] ? 0.35 : 0;
          const t0 = 0.12 + outerWait, t1 = t0 + 1.75;
          const u = progress(s, t0, t1);
          const xp = ease.inOutQuad(progress(u, 0, 0.85));
          const dep = inner ? 1 - smooth(progress(u, 0.7, 1)) : 0;
          if (u < 1) {
            D.x = lerp(WING[j], SLOT[j], xp); D.dep = dep;
            travel(D, Math.abs(D.x - WING[j]) + (1 - dep) * 8, -dir, sin(Math.PI * xp), 1 - smooth(progress(u, 0.82, 1)));
          }
          const sw = ease.outBack(progress(s, t1 - 0.05, t1 + 0.45)) * (1 - smooth(progress(s, t1 + 0.7, t1 + 1.4)));
          if (sw > 0) { blendPose(D, P_V, sw); D.rise += 1.2 * sw; }
          D.spin = 2 * ease.outCubic(progress(s, t1 - 0.3, t1 + 1.6));
          spotI = progress(s, t0 - 0.12, t0 + 0.3);
        }
      }
      // depth: upstage is smaller, higher, out of the light
      if (D.dep > 0) { D.s = BASE * (1 - 0.2 * D.dep); D.fy = FY - 6 * D.dep; D.light = 1 - 0.5 * D.dep; spotI *= 1 - 0.6 * D.dep; }
      if (D.alpha > 0 && spotI > 0) {
        const k = SPOTS.n++;
        const pc = gelW > 0 ? mix(ACT.pool, GELS[j], gelW * 0.75) : ACT.pool;
        SPOTS.x[k] = clamp(D.x, 4, 156); SPOTS.y[k] = 40 - 3 * D.dep; SPOTS.fy[k] = D.fy; SPOTS.r[k] = 21 * D.s / BASE;
        SPOTS.i[k] = spotI * D.alpha * (curtain > 0 ? 1 - 0.5 * curtain : 1);
        SPOTS.cr[k] = (pc >> 16) & 255; SPOTS.cg[k] = (pc >> 8) & 255; SPOTS.cb[k] = pc & 255;
      }
    }

    // ---- the stage
    drawStage(g, ACT);
    drawBeams(g);
    for (let j = 0; j < 4; j++) {
      const D = DS[j];
      if (D.alpha <= 0) continue;
      g.fillEllipse(D.x, D.fy + 0.4, 8.5 * D.s, 1.7 * D.s, 0x000000, { aa: true, a: 0.42 * D.alpha });
    }

    // ---- the dancers: upstage first; within a depth, all limbs before any costume
    for (let pass = 0; pass < 2; pass++) {
      for (let j = 0; j < 4; j++) { const D = DS[j]; if (D.alpha > 0 && (D.dep > 0.5) === (pass === 0)) drawLimbs(g, D); }
      for (let j = 0; j < 4; j++) { const D = DS[j]; if (D.alpha > 0 && (D.dep > 0.5) === (pass === 0)) drawCostume(g, D); }
    }

    drawValance(g, ACT);
    drawCurtain(g, curtain, ACT, ACTS[actOf(hourEnd ? nf.h : f.h)].name, sin);
    drawApron(g, ACT);
    const big = hourEnd ? smooth(progress(s, 57.0, 57.8)) : hourStart ? 1 - smooth(progress(s, 5.6, 6.6)) : 0;
    drawConductor(g, ACT, tod, big);
  },
};
