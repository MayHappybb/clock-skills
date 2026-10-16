// saulbass: every minute is the opening titles of a 1950s film, cut from
// paper in the manner of Saul Bass. The title is the time.
//
// Five shots, cut together on a jazz beat (120 bpm, so every move lands on
// a half second), each a different piece of kinetic type with its own
// colour field:
//
//   :00-:13  VERTIGO       orange; a red spiral turns and dolly-zooms; the
//                          numerals spin out of its eye (at :00 of the hour
//                          the hour comes out alone, huge, first)
//   :13-:25  PSYCHO        black; grey bars race; tall condensed type sliced
//                          into six strips that slide in and jolt on the beat
//   :25-:38  NORTH BY NW   green facade grid in steep perspective; the
//                          numerals lie on it and ride its lines in like lifts
//   :38-:50  ANATOMY       paper and an orange block; each numeral cut in
//                          three by scissors, the pieces fly in and slap down
//   :50-:60  GOLDEN ARM    black with four white bars; the numerals are
//                          windows onto racing coloured stripes; they shut
//                          like shutters before :00, so the old minute is
//                          gone when the next film starts
//
// Shots change by a hard-edged wipe with a bar of the next shot's accent
// colour on the edge. The time is on the glass in every shot except the
// half second around :00.
//
// Palette: the Bass posters' few flat inks: orange-red, red, warm black,
// cream paper, mustard, a North by Northwest green and navy, two greys.
// Everything is hard-edged flat fills (cut card); the type is AA only on its
// horizontal span ends so it can slide by fractions of a pixel. The type is
// an own cut-card face (saulbass-type.js), set with a span filler.

import { ease } from '../js/kit.js';
import { P, spiral, slices, grid, pieces, windows } from './saulbass-shots.js';

const SHOTS = [
  { t0: 0, t1: 13, fn: spiral },
  { t0: 13, t1: 25, fn: slices, wipe: 'lr', bar: P.paper },
  { t0: 25, t1: 38, fn: grid, wipe: 'tb', bar: P.navy },
  { t0: 38, t1: 50, fn: pieces, wipe: 'rl', bar: P.orange },
  { t0: 50, t1: 60, fn: windows, wipe: 'bt', bar: P.mustard },
];
const WIPE = 0.4;

export default {
  name: 'Saul Bass',
  blurb: 'Every minute is the opening titles of a 1950s film: cut-paper kinetic type in five shots (Vertigo, Psycho, North by Northwest, Anatomy of a Murder, The Man with the Golden Arm), cut on a jazz beat.',
  fps: 60,

  frame(g, ctx) {
    const f = ctx.fields;
    ctx.lcd.backlight(1 - 0.7 * ctx.night);
    const F = { hh: f.hh, mm: f.mm, h: f.h, m: f.m, key: f.minuteKey };
    const sec = f.sec;
    let i = SHOTS.length - 1;
    while (i > 0 && sec < SHOTS[i].t0) i--;
    const sh = SHOTS[i], lt = sec - sh.t0;
    if (!sh.wipe || lt >= WIPE) { sh.fn(g, lt, F); return; }

    // A wipe: the old shot keeps running on the side not yet reached.
    const prev = SHOTS[i - 1], u = ease.inOutCubic(lt / WIPE);
    let newBox, oldBox, bar;
    if (sh.wipe === 'lr') { const e = Math.round(160 * u); newBox = [0, 0, e, 80]; oldBox = [e, 0, 160 - e, 80]; bar = [e - 2, 0, 4, 80]; }
    if (sh.wipe === 'rl') { const e = Math.round(160 * (1 - u)); newBox = [e, 0, 160 - e, 80]; oldBox = [0, 0, e, 80]; bar = [e - 2, 0, 4, 80]; }
    if (sh.wipe === 'tb') { const e = Math.round(80 * u); newBox = [0, 0, 160, e]; oldBox = [0, e, 160, 80 - e]; bar = [0, e - 2, 160, 4]; }
    if (sh.wipe === 'bt') { const e = Math.round(80 * (1 - u)); newBox = [0, e, 160, 80 - e]; oldBox = [0, 0, 160, e]; bar = [0, e - 2, 160, 4]; }
    if (oldBox[2] > 0 && oldBox[3] > 0) { g.clip(...oldBox); prev.fn(g, sec - prev.t0, F); g.unclip(); }
    if (newBox[2] > 0 && newBox[3] > 0) { g.clip(...newBox); sh.fn(g, lt, F); g.unclip(); }
    g.fillRect(...bar, sh.bar);
  },
};
