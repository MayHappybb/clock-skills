// kaleidoscope: the time is the object in the cell, and the mirrors fold it.
//
// The idea. A kaleidoscope is a tube of mirrors with a cell of loose glass
// at the far end. This face is that tube held up to the light, and the
// loose glass is the time: 28 coloured glass rods, enough for four
// seven-segment numerals, plus beads, chips, seed beads and sequins, lying
// on a frosted diffuser lit by the window (cool by morning, white at noon,
// peach at sunset, lamplight at night).
//
// Most of the minute the mirrors stand open (an opening of 360 degrees is
// no mirror at all) and you read the rods directly: HH:MM, the colon two
// cobalt beads at the very centre where the mirrors hinge. Then the
// mirrors close. A reflected wedge sweeps in, the time folds over itself,
// two images, four, eight, twelve, and the strip becomes a turning
// mandala made of nothing but the time's own glass. Inside it the drum
// turns, the rods tumble through the slice the mirrors look at, and the
// ones the new time needs come out of the heap round the rim while the
// others go back. The mirrors open and the new time is lying there.
//
// Rhythm, not beats: one big fold round every minute turn (:55.5 to
// :04), one unannounced 4-second "glance" at a seeded moment mid-minute
// (a shallower fold, two mirrors or three, the rods tumbling and settling
// back), and at the hour the three-mirror scope: a triangle of mirrors
// closes in round the centre and tiles the whole strip.
//
// The time is never wrong, and a reflection never shows a wrong numeral:
// the mirrors are gated by the rods themselves. Every rod spins on its own
// axis by one or two half-turns during a tumble, neighbouring segments by
// different counts, so a numeral is only whole in the first and last
// tenth of the tumble; the mirrors stand fully open then, and close only
// while every rod is broken out of line. Old numerals are gone before
// :00; the new ones form after it.
//
// Rendering: the cell is drawn each frame (AA glass, translucent) into a
// 184 x 184 cache; the eyepiece is one per-pixel fold of that cache
// (tables for angle and radius, a 2x2 per wedge, no trig per pixel).
// While the mirrors are open the cell is drawn straight onto the glass and
// there is no per-pixel pass at all. Light is lost at every reflection,
// so far images are dimmer and the mirror seams show faintly.
//
// Palette: the diffuser's light of the hour; deep jewel glass for the rods
// (ruby, cobalt, emerald, amethyst, teal, flame, magenta, indigo) so they
// read; pale tints for everything loose so it sits behind them.

import { Gfx, mix, scale, clamp, lerp, ease, progress, rand, sin, cos, TAU, clockFields, previousMinute } from '../js/kit.js';
import { CX, CY, rodPoses, tumbleEase, drawRod, loosePoses, drawLoose, drawColon, lightAt } from './kaleidoscope-glass.js';
import { CC, OX, OY, polar, triangle } from './kaleidoscope-mirror.js';

const cache = new Gfx(CC, CC);

const digitsOf = (f) => f.hh + f.mm;
const smooth = ease.inOutCubic;

// The tumbles, in seconds. A minute turn starts at :55.5 and the rods are
// home by about :03.9; the hour's starts at :54 and ends about :06.5; a
// glance is 4.2 s at a seeded moment between :15 and :37.
const TURN = { start: 4.5, span: 8, spread: 0.4, turns: 1 };
const HOUR = { start: 6, span: 12, spread: 0.5, turns: 2 };
const GLANCE = { span: 4, spread: 0.2, turns: 1 };

/**
 * The mirrors may only stand closed while every rod is well into its
 * tumble: then each rod lies at its own angle and no numeral is whole,
 * so no reflection can show a whole numeral mirrored (a 2 as a 5) or
 * turned (a 6 as a 9). Open while any rod is in the first or last tenth.
 */
const E0 = 0.17, E1 = 0.3;
const gate = (eMin, eMax) => smooth(progress(eMin, E0, E1)) * smooth(progress(1 - eMax, E0, E1));

/**
 * What the scope is doing at this moment: which numerals the rods go
 * from and to, how far into the drum's tumble, and which mirrors.
 */
function plan(f, date) {
  const cur = digitsOf(f);
  const nxt = clockFields(new Date(date.getTime() + 60000));
  const sec = f.sec;
  const T = (B) => (B.m === 0 ? HOUR : TURN);
  let turn = null;
  if (sec >= 60 - T(nxt).start) turn = { A: f, B: nxt, tt: sec - (60 - T(nxt).start) };
  else {
    const Tc = T(f);
    if (sec < Tc.span + Tc.spread - Tc.start) turn = { A: previousMinute(date), B: f, tt: sec + Tc.start };
  }
  if (turn) {
    const { A, B, tt } = turn, cfg = T(B), hour = B.m === 0, seed = B.minuteKey;
    const dir = rand(seed, 9) < 0.5 ? 1 : -1;
    const q = tt / (cfg.span + cfg.spread);
    const psi0 = rand(seed, 10) * TAU;
    return {
      from: digitsOf(A), to: digitsOf(B), tt, cfg, turns: cfg.turns * dir, seed, q,
      fold: hour ? { kind: 'tri', hmin: 23, rho: psi0 + (TAU / 3) * smooth(q) * dir }
        : { kind: 'polar', n: [8, 10, 12, 12, 14][Math.floor(rand(seed, 11) * 5)], psi: psi0 + 1.3 * Math.PI * smooth(q) * dir },
    };
  }
  // the glance: once a minute, at a moment of its own; the drum gives a
  // short tumble and the rods settle back where they were
  const seed = f.minuteKey;
  const gs = 15 + 22 * rand(seed, 20), glen = GLANCE.span + GLANCE.spread;
  if (sec >= gs && sec < gs + glen) {
    const tt = sec - gs, q = tt / glen, dir = rand(seed, 22) < 0.5 ? 1 : -1;
    const k = rand(seed, 21);
    return {
      from: cur, to: cur, tt, cfg: GLANCE, turns: dir, seed, q,
      fold: k < 0.25 ? { kind: 'tri', hmin: 44, rho: rand(seed, 23) * TAU + 0.9 * smooth(q) * dir }
        : { kind: 'polar', n: [4, 6, 6, 8][Math.floor(rand(seed, 24) * 4)], psi: rand(seed, 23) * TAU + 0.8 * Math.PI * smooth(q) * dir },
    };
  }
  return { from: cur, to: cur, tt: 0, cfg: TURN, turns: 0, seed, q: 0, fold: null };
}

function drawCell(c, ox, oy, light, rods, loose, tone, tsec) {
  c.clear(light);
  for (const lp of loose) drawLoose(c, ox, oy, lp, tone);
  drawColon(c, ox, oy, tone, tsec);
  for (const rp of rods) drawRod(c, ox, oy, rp, tone);
}

export default {
  name: 'Kaleidoscope',
  blurb: 'The time is glass rods in the cell of a kaleidoscope; at every minute the mirrors close, fold it into a mandala, and open on the new time.',
  fps: 30,

  frame(g, ctx) {
    const f = ctx.fields, date = ctx.date, night = ctx.night;
    ctx.lcd.backlight(1 - 0.62 * night);
    const tday = f.h * 3600 + f.m * 60 + f.sec;
    const light = lightAt(tday / 3600);
    const tone = night > 0 ? (c) => mix(c, scale(c, 0.8), night) : (c) => c;

    const st = plan(f, date);
    const { cfg } = st;
    const R = rodPoses(st.from, st.to, st.tt, cfg.span, cfg.spread, st.turns, st.seed & 1023, tday);
    const rods = R.poses;
    // the loose glass goes round with the drum
    const loose = loosePoses(tday, st.fold ? tumbleEase(st.q) : 0, st.turns, tday);

    const fold = st.fold;
    const depth = fold ? gate(R.eMin, R.eMax) : 0;
    if (depth < 1e-4) {
      drawCell(g, 0, 0, light, rods, loose, tone, tday);
      return;
    }
    // The cache is drawn every frame: its work is this frame's work too.
    for (const k in cache.cost) cache.cost[k] = 0;
    drawCell(cache, OX, OY, light, rods, loose, tone, tday);
    for (const k in cache.cost) g.cost[k] = (g.cost[k] ?? 0) + cache.cost[k];
    const d = depth;
    if (fold.kind === 'polar') {
      const alpha = TAU * (1 - d * (1 - 1 / fold.n));
      polar(g, cache, { psi: fold.psi, alpha, depth: d, sin, cos });
    } else {
      const H0 = 320, h = H0 / (1 + (H0 / fold.hmin - 1) * d);
      triangle(g, cache, { h, rho: fold.rho, depth: d, sin, cos });
    }
  },
};

/** For tools: the plan, the rods and the mirrors' depth at a moment (no drawing). */
export function debugAt(date) {
  const f = clockFields(date), tday = f.h * 3600 + f.m * 60 + f.sec;
  const st = plan(f, date);
  const R = rodPoses(st.from, st.to, st.tt, st.cfg.span, st.cfg.spread, st.turns, st.seed & 1023, tday);
  return { st, R, depth: st.fold ? gate(R.eMin, R.eMax) : 0 };
}
