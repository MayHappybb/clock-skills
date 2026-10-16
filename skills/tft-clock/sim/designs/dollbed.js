// dollbed: "Night Night". The owner's two plush toys asleep on the owner's
// own bed: the floppy black-and-tan puppy flat on its tummy with its chin on
// its paws, and the shaggy panda propped against the pillow, slumped, legs
// stuck out. They share one pillow on the grey bedspread with the white
// diamond quilting and fruit outlines, and each dreams half of the time in a
// thought cloud: the puppy dreams the hours in bones, the panda dreams the
// minutes in bamboo.
//
// Reading it: HH is the bones in the left cloud, MM the bamboo in the right.
//
// Life at rest: both breathe (each at its own rate) and their clouds swell
// with the breath; the bones hop in a little wave every second; the canes
// sway and their leaves flutter; the panda snores z's up into its dream, nods
// off at :42 and jerks awake at :52; the puppy paddles its paws (dreaming of
// running) at :08 and :38 and flicks its ears. At :25 one of them steals the
// blanket (a fold of the bedspread) from the other, who shivers; they take
// turns minute by minute.
//
// The minute turn: the sleeping panda chews, and in its dream the changing
// bamboo digit is munched cane by cane before :00 (crumbs fall), then the new
// canes grow from the root after :00 and unfurl their leaves.
// The hour: the puppy rolls over onto its back at :55 (paws in the air, tan
// belly and lavender tag showing), its old bones pop out of the dream before
// :00, the new ones drop in and bounce after it, and at :04 it rolls back.
//
// Palette: the dolls in the colours sampled from the photos; the bed in its
// own greys and stitch white; the room a moonlit indigo, so black fur reads
// against the pale pillow and gets a cool rim where it meets the wall. The
// dolls are hard pixels with jagged "fur" outlines (short fuzz for the
// puppy, long ragged loops for the panda); the dreams are anti-aliased so
// they float by sub-pixels.

import { previousMinute, clockFields, progress, ease, clamp, sin, mix, rand, font3x5, sprite } from '../js/kit.js';
import { C, background, drawFlap, drawPuppy, drawPuppyFront, drawPanda, drawPandaFront } from './dollbed-art.js';
import { D, cloud, trail, boneDigit, bambooDigit } from './dollbed-dream.js';

const TAU = Math.PI * 2;

const HH_CLOUD = { x: 34, y: 18, puffs: [[0, 1, 13], [-14, 3, 9], [14, 3, 9], [-9, -7, 9], [6, -8, 10], [19, -2, 7], [-20, -3, 6], [-6, 11, 8], [9, 11, 8], [20, 8, 6], [-19, 9, 6]] };
const MM_CLOUD = { x: 88, y: 18, puffs: [[0, 1, 12], [-12, 3, 9], [12, 3, 9], [-8, -7, 9], [6, -8, 9], [16, -3, 6], [-17, -2, 6], [-5, 11, 8], [8, 11, 8], [15, 8, 5], [-17, 8, 5]] };
const PUP_TRAIL = [[38, 44.5, 1.0], [35.5, 40.5, 1.5]];
const PAN_TRAIL = [[111, 34.5, 0.9], [107.8, 32, 1.35]];
const STARS = [[63, 4, 0], [4, 25, 1.7], [121, 8, 3.1], [132, 3, 4.4], [3, 6, 5.2]];
const ZED = sprite(`
  zzz
  ..z
  .z.
  z..
  zzz`, { z: 1 });

const bump = (u) => (u <= 0 || u >= 1 ? 0 : sin(Math.PI * u));
const frac = (x) => x - Math.floor(x);

export default {
  name: 'Night Night',
  blurb: 'The owner\'s puppy and panda asleep on their own quilted bed: the puppy dreams the hour in bones, the panda the minutes in bamboo; they steal the blanket, snore, munch and roll over.',
  fps: 60,

  frame(g, ctx) {
    const f = ctx.fields, sec = f.sec, m = f.m;
    ctx.lcd.backlight(1 - 0.65 * ctx.night);
    const prev = previousMinute(ctx.date), next = clockFields(new Date(ctx.date.getTime() + 60000));

    g.draw(background(), 0, 0);
    for (const [x, y, ph] of STARS) {
      const k = 0.45 + 0.55 * bump(frac(sec / 4 + ph / TAU));
      const c = mix(C.wallTop, C.star, k);
      g.pixel(x, y, c); g.pixel(x - 1, y, mix(C.wallTop, c, 0.5)); g.pixel(x + 1, y, mix(C.wallTop, c, 0.5));
      g.pixel(x, y - 1, mix(C.wallTop, c, 0.5)); g.pixel(x, y + 1, mix(C.wallTop, c, 0.5));
    }

    // ---------------------------------------------------------- the story
    const pBreath = sin((TAU * sec) / 3.75), qBreath = sin((TAU * sec) / 5);

    // the blanket: who has it at the start of this minute, stolen at :25
    const owner = m % 2 === 0 ? 'panda' : 'puppy';
    const tu = ease.inOutCubic(progress(sec, 25, 27.2));
    const pos = owner === 'puppy' ? tu : 1 - tu;          // 0 on the puppy, 1 on the panda
    const victim = owner;                                  // whoever had it at the start
    const shiverK = sec > 27.2 ? clamp(1 - (sec - 27.2) / 3.3, 0, 1) : 0;
    const shiver = 0.7 * shiverK * sin(TAU * 13 * sec);

    // the hour: the puppy rolls onto its back and back again
    let roll = 0, lift = 0;
    if (m === 59 && sec >= 55.5) {
      const u = progress(sec, 55.5, 56.9);
      roll = Math.PI * ease.inOutCubic(u); lift = -3 * bump(u);
    } else if (m === 0 && sec < 6) {
      const u = progress(sec, 4.6, 6);
      roll = Math.PI * (1 + ease.inOutCubic(u)) + 0.1 * sin(sec * 7) * (1 - u); lift = -3 * bump(u);
    }
    const bellyUp = roll > 0.1 && roll < TAU - 0.1;

    const paddle = Math.max(bump(progress(sec, 8, 10.5)), bump(progress(sec, 38, 40.5))) * (bellyUp ? 0 : 1);
    let earSwing = 0;
    for (const t0 of [14, 33, 47]) { const a = sec - t0; if (a > 0 && a < 1) earSwing += 0.28 * (1 - a) ** 2 * sin(a * 22); }
    if (shiverK > 0 && victim === 'puppy') earSwing += 0.05 * sin(TAU * 13 * sec);
    if (bellyUp) earSwing += 0.15 * sin(sec * 5);

    const pup = {
      x: 40 + (victim === 'puppy' ? shiver : 0), y: 57, roll, lift, t: sec, paddle, earSwing,
      breath: pBreath, glint: shiverK > 0 && victim === 'puppy' ? 1 : 0.5,
    };

    // panda: slumped, nodding off at :42, jerking up at :52, chewing in its sleep at the turn
    const nod = progress(sec, 42, 51.5) * (1 - progress(sec, 51.5, 51.8));
    const nodE = ease.inOutQuad(nod);
    const snap = sec > 51.8 && sec < 53 ? 0.6 * (1 - (sec - 51.8) / 1.2) * sin((sec - 51.8) * 18) : 0;
    const munching = sec >= 58.3 && next.mm !== f.mm;
    const chew = munching ? 0.55 * sin(TAU * 5 * sec) : 0;
    const pan = {
      x: 128 + (victim === 'panda' ? shiver : 0), y: 33, breath: qBreath,
      hx: -1.2 * nodE, hy: -0.6 * qBreath + 2.6 * nodE + chew - snap, tilt: -0.07 + 0.17 * nodE + 0.05 * snap,
      hug: ease.inOutQuad(clamp((pos - 0.55) / 0.45, 0, 1)), shiver: 0, eye: mix(C.pblk, 0x5a5a72, 0.6),
    };

    // ---------------------------------------------------------- draw the bed scene
    drawPuppy(g, pup);
    drawPanda(g, pan);
    const cx = 44 + (128 - 44) * pos, hw = 34 + (27 - 34) * pos;
    const top = 43 + (53.5 - 43) * pos + 15 * bump(pos);
    const flat = 0.35 + 0.5 * pos;
    drawFlap(g, cx, hw, top, flat, 1 + 1.6 * bump(pos), pos * 9 + sec * 0.6, Math.round(cx - 44));
    drawPuppyFront(g, pup);
    drawPandaFront(g, pan);

    // ---------------------------------------------------------- the dreams
    trail(g, PUP_TRAIL, (TAU * sec) / 3.75);
    trail(g, PAN_TRAIL, (TAU * sec) / 5);
    cloud(g, HH_CLOUD.x, HH_CLOUD.y + 0.9 * pBreath, HH_CLOUD.puffs, pBreath, sec);
    cloud(g, MM_CLOUD.x, MM_CLOUD.y + 0.9 * qBreath, MM_CLOUD.puffs, qBreath, sec);

    // hours in bones
    const hb = 0.9 * pBreath;
    let kg = 0;
    for (let i = 0; i < 2; i++) {
      const goes = sec >= 57.9 && next.hh[i] !== f.hh[i];
      const came = sec < 2.6 && prev.hh[i] !== f.hh[i];
      const base = kg;
      const st = (k, n) => {
        const kk = base + k;
        if (goes) {
          const tk = 57.9 + (n - 1 - k) * 0.28 + i * 0.12, a = sec - tk;
          if (a >= 0) {
            if (a >= 0.6) return null;
            const vx = (k & 1 ? 1 : -1) * (9 + 9 * rand(k, i, 5));
            return { dx: vx * a, dy: hb - 24 * a + 90 * a * a, rot: (k & 1 ? 7 : -7) * a, a: 1 - a / 0.6 };
          }
        }
        if (came) {
          const tk = 0.1 + k * 0.32 + i * 0.15, u = progress(sec, tk, tk + 0.55);
          if (sec < tk) return null;
          return { dx: 0, dy: hb - 24 * (1 - ease.outBounce(u)), rot: (rand(k, i, 6) - 0.5) * 1.6 * (1 - u), a: clamp(u * 5, 0, 1) };
        }
        // rest: a hop runs through the bones once a second
        const tb = frac(sec - kk * 0.09);
        const h = bump(clamp(tb / 0.28, 0, 1));
        return { dx: 0, dy: hb - 1.8 * h, rot: 0.16 * h * (kk & 1 ? 1 : -1), a: 1 };
      };
      kg += 8;
      boneDigit(g, +f.hh[i], 18.5 + i * 18, 8, 13, 20, st);
    }

    // minutes in bamboo
    const mb = 0.9 * qBreath;
    for (let i = 0; i < 2; i++) {
      const goes = sec >= 58.3 && next.mm[i] !== f.mm[i];
      const came = sec < 1.7 && prev.mm[i] !== f.mm[i];
      let leafK = 1;
      const st = (k, n) => {
        if (goes) {
          const step = n > 1 ? 1.0 / (n - 1) : 0, s0 = 58.3 + (n - 1 - k) * step * (1.45 - 0.42) + i * 0.05;
          const u = progress(sec, s0, s0 + 0.42);
          if (u >= 1) return null;
          if (u <= 0) return { f0: 0, f1: 1 };
          return { f0: 0, f1: 1 - u, eat: u, dur: 0.42 };
        }
        if (came) {
          const step = n > 1 ? 0.85 / (n - 1) : 0, s0 = 0.05 + k * step + i * 0.08;
          const u = progress(sec, s0, s0 + 0.4);
          if (u <= 0) return null;
          return { f0: 0, f1: ease.outCubic(u) };
        }
        return { f0: 0, f1: 1 };
      };
      if (goes) leafK = 1 - progress(sec, 58.3, 58.6);
      if (came) leafK = ease.outBack(progress(sec, 1.15, 1.6));
      const sway = 1.5 * sin(TAU * (sec / 3) + i * 0.9) + 0.5 * sin(TAU * sec * 0.9 + i);
      bambooDigit(g, +f.mm[i], 74 + i * 17, 8 + mb, 12, 20, st, sway, sec, leafK);
    }

    // the panda snores z's up into its dream
    for (const off of [0, 5]) {
      const k = Math.floor((sec - 2.5 - off) / 10);
      const age = sec - 2.5 - off - k * 10;
      if (age < 0 || age > 2.6 || nod > 0.4) continue;
      const zx = 146 + 3.2 * age + 0.8 * sin(age * 5), zy = 24 - 7.5 * age;
      const a = clamp(age * 3, 0, 1) * clamp((2.6 - age) / 0.8, 0, 1);
      g.blit(ZED, zx, zy, { c: mix(C.wallBot, D.z, a) });
    }
  },
};
