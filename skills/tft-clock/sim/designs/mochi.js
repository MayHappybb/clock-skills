// Mochi: the moon rabbits make the time.
//
// On the grey regolith under a black sky, with the Earth hanging over them,
// two white rabbits pound mochi. The hours are finished mochi, a sakura-pink
// and a yomogi-green numeral, set out on a hinoki offering stand (sanbo);
// the minutes are the fresh white dough in the wooden mortar (usu). The
// pounder, in an indigo happi and a red headband, stands on a boulder and
// brings the kine down once a second, on the second: the dough squashes
// and springs back, flour puffs drift away in the low gravity. Between
// blows the turner, kneeling by the mortar, reaches in and pats the dough.
//
// Minute turn: the last three blows of the minute (:57, :58, :59) pound the
// changing digit flatter and flatter into a lump; it gathers into a ball by
// :00; the blow at :00 lands on the ball, then the new digit is pulled up out
// of it, stretching and springing into shape. The same dough, never a wrong
// number: a squashed old digit is still the old digit, a ball is no digit.
// Hour: the pounder leaps (it is the moon) and slams the :59 blow; the
// ground shakes, a shock ring runs through the dust, and the hour mochi
// that are due to change are thrown high into the sky, roll up into balls
// at the top, and come down unfolding as the new hour, landing with a
// squash. The rabbits hop with the quake.
//
// Type: the numerals are drawn as dough: thick round tubes on a skeleton
// designed for this grid (mochi-dough.js), shaded as soft satin-glossy rice
// cake with a dusting of flour, AA at the edges because they squash and
// glide every second.
//
// Palette: the moon's greys (warm in the sun, blue under earthshine) and a
// deep indigo sky so that the dark is a colour, not off; the Earth is the
// one saturated blue. Against that, the three mochi colours of hanami
// dango (pink, white, green) carry the time, warm hinoki and keyaki wood
// hold it, and the rabbits are the only other whites, kept apart by a dark
// keyline and their indigo and madder coats. The day follows the clock: the
// sun from the left in the morning and the right in the evening (crater
// shadows and the mochi's highlights move), a warm low sun at dawn and
// dusk, and at night the moon side is in shadow, lit only by the full Earth:
// blue regolith, blue-white dough, the backlight dimmed.

import { Gfx, hex, mix, clamp, sin, cos, rand, ease, progress, clockFields } from '../js/kit.js';
import { glyph, material, doughJob, drawDough, setLight } from './mochi-dough.js';
import {
  W, H, MORTAR, TRAY, ROCK, EARTH, lightAt, buildBackground, drawMortarFront,
  rabbitPose, drawRabbit, drawArm, drawKine, OUTLINE, setActorLight, tint,
} from './mochi-scene.js';

// ------------------------------------------------------------ layout
const HSLOT = [{ x: 4, w: 24, h: 31, r: 4 }, { x: 29.5, w: 24, h: 31, r: 4 }];
const HBASE = TRAY.top + 1;
const MSLOT = [{ x: 83.5, w: 21, h: 27, r: 3.3 }, { x: 105.5, w: 21, h: 27, r: 3.3 }];
const MBASE = 59;
const HIT_X = 105.5;                        // where the kine lands

// the kine: hands and handle angle, struck (0) and raised (1)
const HAND0 = [127, 39], HAND1 = [136, 31];
const A0 = -2.65, A1 = -1.45, KLEN = 24;

// ------------------------------------------------------------ dough colours

const STOPS = {
  white: [[-1, '5e587e'], [-0.15, 'b0aac4'], [0.42, 'ebe5e0'], [0.82, 'fff9f0'], [0.95, 'ffffff']],
  pink: [[-1, '763456'], [-0.15, 'cf7e9a'], [0.42, 'f2adc0'], [0.82, 'ffd6df'], [0.95, 'fff4f6']],
  green: [[-1, '284a30'], [-0.15, '6a9254'], [0.42, '98c076'], [0.82, 'c6e0a2'], [0.95, 'f0fae0']],
};
function tintStops(stops, L) {
  // under the sun: as is, a little warm when low; under earthshine: blue-white
  return stops.map(([t, c]) => {
    let v = hex(c);
    v = mix(v, mix(v, 0xffd8a8, 0.5), L.warm * 0.5);
    // earthshine: a cool multiply that keeps the dough bright and its hue
    const e = L.earth;
    v = (((((v >> 16) & 255) * (1 - 0.16 * e)) | 0) << 16) | (((((v >> 8) & 255) * (1 - 0.1 * e)) | 0) << 8) | Math.min(255, ((v & 255) * (1 + 0.04 * e) + 8 * e) | 0);
    return [t, v];
  });
}

// ------------------------------------------------------------ per-minute cache

const bg = new Gfx(W, H);
let bgKey = NaN;
const MAT = { white: null, pink: null, green: null };

function ensureScene(ctx, g) {
  // rebuilt at :30 of each minute, when nothing else is going on
  const key = Math.floor((ctx.date.getTime() - 30000) / 60000);
  if (key === bgKey) return;
  bgKey = key;
  const d = new Date(key * 60000 + 30000);
  const L = lightAt(d.getHours() + d.getMinutes() / 60);
  buildBackground(bg, L, g.cost);
  const shade = mix(hex('3e3030'), hex('141a3a'), L.earth);   // warm grey keyline by day, indigo under earthshine
  for (const k of ['white', 'pink', 'green']) MAT[k] = material(tintStops(STOPS[k], L), mix(0xffffff, 0x9ab0ff, L.earth * 0.5), shade);
  MAT.L = L;
  setActorLight(L);
  COATS.p = tint(POUNDER_COAT); COATS.t = tint(TURNER_COAT); COATS.band = tint(BAND); FLOUR = tint(0xffffff);
}

// ------------------------------------------------------------ motion helpers

const wob = (b, k = 7, w = 17) => (b < 0 ? 0 : Math.exp(-k * b) * cos(w * b));

/** The kine's raise, 0 struck .. 1 overhead, over one beat b (0..1, struck at 0). */
function raise(b) {
  if (b < 0.07) return 0.05 * sin((b / 0.07) * Math.PI);
  if (b < 0.5) return ease.inOutQuad((b - 0.07) / 0.43);
  if (b < 0.8) return 1 + 0.05 * sin(((b - 0.5) / 0.3) * Math.PI);
  return 1 - ease.inQuad((b - 0.8) / 0.2);
}

const job = doughJob();
const pounder = rabbitPose(), turner = rabbitPose();
const POUNDER_COAT = hex('3a5cb8'), TURNER_COAT = hex('c4463e'), BAND = hex('e8463a');
const COATS = { p: 0, t: 0, band: 0 };
let FLOUR = 0xffffff;

// ------------------------------------------------------------ flour

// A burst of flour from a blow: a few bright grains thrown up off the dough
// that fall back in the low gravity and are gone in ~1.3 s.
const PUFF_LIFE = 1.3;
function puff(g, ax, ay, age, seed, n, spread, up, grav) {
  if (age < 0 || age > PUFF_LIFE) return;
  for (let k = 0; k < n; k++) {
    const r1 = rand(seed, k, 1), r2 = rand(seed, k, 2), r3 = rand(seed, k, 3);
    const life = PUFF_LIFE * (0.6 + 0.4 * r3);
    if (age > life) continue;
    const vx = (r1 - 0.5) * 2 * spread, vy = -up * (0.55 + 0.45 * r2);
    const x = ax + (r3 - 0.5) * 12 + vx * age, y = ay + vy * age + 0.5 * grav * age * age;
    if (y > 78) continue;
    const u = age / life, a = u < 0.7 ? 1 : 1 - (u - 0.7) / 0.3;
    g.fillCircle(x, y, 0.65 + 0.3 * r2, FLOUR, { aa: true, a });
  }
}

// ------------------------------------------------------------ the face

export default {
  name: 'Mochi',
  blurb: 'Moon rabbits pound the minutes into mochi, a blow each second; the hour mochi fly up in the low gravity and land as the new hour.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, t = ctx.date.getTime() / 1000;
    ctx.lcd.backlight(1 - 0.55 * ctx.night);
    ensureScene(ctx, g);
    const L = MAT.L;
    setLight(-0.55 * L.side * L.sun + -0.25 * (1 - L.sun), -0.62, 0.62);

    const next = clockFields(new Date(ctx.date.getTime() + 60000));
    const prev = clockFields(new Date(ctx.date.getTime() - 60000));
    const cur = f.hh + f.mm, nxt = next.hh + next.mm, prv = prev.hh + prev.mm;
    const hourTurnOut = next.h !== f.h;      // this minute ends with an hour toss
    const hourTurnIn = prev.h !== f.h;       // this minute began with one
    const sec = Math.floor(s), b = s - sec;

    g.draw(bg, 0, 0);

    // ---- stars that twinkle
    for (let k = 0; k < 9; k++) {
      const x = (rand(k, 4) * 150 + 5) | 0, y = (rand(k, 5) * 40 + 2) | 0;
      const tw = 0.5 + 0.5 * sin(t * (1.3 + rand(k, 6)) + k * 2.1);
      g.pixel(x, y, 0xfff4e0, { a: tw * tw * (0.35 + 0.5 * L.earth) });
    }

    // ---- the quake at the hour slam (s 59..60.6), from the mortar
    const qAge = hourTurnOut ? s - 59 : hourTurnIn ? s + 1 : -1;
    if (qAge >= 0 && qAge < 1.4) {
      const rx = 6 + qAge * 70, a = 0.5 * (1 - qAge / 1.4);
      // a ring of dust kicked up along the ground, running outwards
      for (let k = 0; k < 18; k++) {
        const ang = (k / 18) * 6.2832 + 0.17, px = MORTAR.cx + cos(ang) * rx, py = 75 + sin(ang) * rx * 0.13;
        if (px < -3 || px > 163) continue;
        const up = 2.5 * sin(Math.min(1, qAge * 1.6) * Math.PI) * (0.6 + 0.4 * rand(k, 31));
        g.fillCircle(px, py - up, 1.2 + qAge * 1.4, 0xf0ecf4, { aa: true, a });
      }
    }

    // beat wobble of the dough, shared
    const wv = wob(b);

    // ---- the hours on the sanbo
    for (let i = 0; i < 2; i++) {
      const S = HSLOT[i];
      let dy = 0, sx = 1 - 0.0 * wv, sy = 1 - 0.035 * wv, shrink = 1, ball = 0, digit = +f.hh[i];
      const changes = (hourTurnOut && f.hh[i] !== next.hh[i]) || (hourTurnIn && f.hh[i] !== prev.hh[i]);
      // toss time: 0 at the slam (:59 of the old hour)
      const tt = hourTurnOut && s >= 58.8 ? s - 59 : hourTurnIn && s < 3 ? s + 1 : -9;
      if (tt > -0.2 && tt < 3) {
        if (changes) {
          if (tt < 0) sy = 1 - 0.12 * ease.inQuad((tt + 0.2) / 0.2);          // pressed by the quake
          else if (tt < 2) {
            dy = 25 * (1 - (tt - 1) * (tt - 1));
            const st = tt < 0.4 ? 0.12 * sin((tt / 0.4) * Math.PI) : 0;
            sy = 1 + st; sx = 1 - st * 0.5;
            if (tt >= 0.3 && tt < 1) { const q = ease.inOutQuad(progress(tt, 0.3, 0.72)); shrink = 1 - 0.85 * q; ball = q; }
            if (tt >= 1) { const p = progress(tt, 1.0, 1.42); shrink = 0.15 + 0.85 * ease.outBack(p); ball = 1 - ease.inQuad(clamp(p * 1.3, 0, 1)); }
          } else {
            const w2 = wob(tt - 2, 5, 13);
            sy = 1 - 0.2 * w2; sx = 1 + 0.13 * w2;
          }
        } else if (tt >= 0 && tt < 0.7) dy = 3.5 * sin((tt / 0.7) * Math.PI);
      }
      if (hourTurnIn && changes) digit = +f.hh[i];
      // contact shadow on the tray, smaller as it flies
      const fly = clamp(dy / 25, 0, 1);
      g.fillEllipse(S.x + S.w / 2, HBASE - 0.5, S.w * 0.5 * (1 - 0.5 * fly) * sx, 1.6, hex('5a4028'), { aa: true, a: 0.6 * (1 - fly * 0.7) });
      job.gl = shrink > 0.16 ? glyph(digit, S.w, S.h, S.r) : null;
      job.ox = S.x; job.oy = HBASE - S.h - dy; job.w = S.w; job.h = S.h; job.r = S.r * (shrink < 1 ? 0.75 + 0.25 * shrink : 1);
      job.sx = sx * shrink; job.sy = sy * shrink; job.lean = 0; job.ball = ball; job.brx = 10.5; job.bry = 9.5; job.flat = 1;
      job.mat = i === 0 ? MAT.pink : MAT.green; job.seed = 11 + i; job.a = 1;
      // a ball flies centred on the digit, not on its base
      if (shrink < 1) job.oy -= (1 - shrink) * S.h * 0.5;   // it rolls up about its middle
      drawDough(g, job);
    }

    // ---- the turner: kneels by the mortar and pats the dough between blows
    const reach = b > 0.2 && b < 0.68 ? sin(((b - 0.2) / 0.48) * Math.PI) : 0;
    const hop = qAge >= 0 && qAge < 0.9 ? 7 * sin((qAge / 0.9) * Math.PI) : 0;
    Object.assign(turner, { x: 68, y: 72.5 - hop, k: 1.05, dir: 1, lean: 0.06 + 0.2 * reach, earA: -0.1 * reach + 0.12 * wv, earB: 0.05 * reach + 0.08 * wv - (hop > 0 ? 0.2 : 0), crouch: 0.25, blink: (t % 4.7) < 0.13 ? 1 : 0, band: -1, look: 0.4 });
    turner.hx = 75 + 6.5 * reach; turner.hy = 64 - 12 * reach - hop;
    drawRabbit(g, turner, COATS.t);

    // ---- the pounder on its boulder, and the kine: behind the dough, so the
    // mallet never covers part of a numeral (it sinks into the dough's top)
    let r = raise(b), jump = 0;
    if (hourTurnOut && s >= 58 && s < 59) {
      // the big one: crouch, leap, slam
      const u = s - 58;
      if (u < 0.3) r = Math.max(raise(b), 0);
      jump = u < 0.25 ? -1.5 * sin((u / 0.25) * Math.PI) : u < 1 ? 7 * sin(((u - 0.25) / 0.75) * Math.PI) : 0;
      if (u >= 0.25) r = u < 0.78 ? 1 + 0.25 * ease.outQuad((u - 0.25) / 0.53) : 1.25 * (1 - ease.inQuad((u - 0.78) / 0.22));
    }
    const press = b < 0.12 ? Math.max(0, wv) * 0.13 : 0;
    const a = A0 + (A1 - A0) * r - press;
    const hx = HAND0[0] + (HAND1[0] - HAND0[0]) * Math.min(r, 1), hy = HAND0[1] + (HAND1[1] - HAND0[1]) * Math.min(r, 1) - jump;
    const lagR = raise(((b - 0.1) % 1 + 1) % 1);
    Object.assign(pounder, { x: ROCK.cx, y: ROCK.top + 0.5 - jump, k: 1.15, dir: -1, lean: 0.2 - 0.3 * r, earA: -0.25 + 0.35 * lagR, earB: -0.1 + 0.3 * lagR, crouch: 0, blink: b < 0.06 ? 1 : 0, band: COATS.band, tie: 0.35 * sin(t * 7) + 0.3 * r, look: 0 });
    pounder.hx = hx; pounder.hy = hy;
    drawRabbit(g, pounder, COATS.p);
    drawKine(g, hx, hy, a, KLEN);
    drawArm(g, pounder, COATS.p);

    // ---- the minutes: the dough in the mortar
    for (let i = 0; i < 2; i++) {
      const S = MSLOT[i];
      let sx = 1 + 0.08 * wv, sy = 1 - 0.13 * wv, ball = 0, flat = 1, rr = 1, show = true;
      const outgoing = cur[2 + i] !== nxt[2 + i];
      const incoming = cur[2 + i] !== prv[2 + i];
      if (outgoing && s >= 57) {
        // three blows flatten it, then it gathers into a ball
        let Lv = 0;
        for (const k of [57, 58, 59]) Lv += ease.outQuad(progress(s, k, k + 0.22)) / 3;
        sy *= 1 - 0.7 * Lv; sx *= 1 + 0.3 * Lv; rr = 1 + 0.75 * Lv * Lv; flat = 1 - 0.3 * Lv;
        ball = ease.inOutQuad(progress(Lv, 0.25, 1)) * 0.85;
        if (s >= 59.3) {
          const q = ease.inOutQuad(progress(s, 59.3, 59.8));
          sy *= 1 - q; sx *= 1 - 0.6 * q; ball = 0.85 + 0.15 * q;
          if (q >= 1) show = false;
        }
      }
      if (incoming && s < 1.6) {
        if (s < 0.25) { show = false; ball = 1; }
        else {
          const p = progress(s, 0.25, 1.35);
          sy *= 0.12 + 0.88 * ease.outBack(p); sx *= 1.35 - 0.35 * ease.outCubic(p);
          ball = 1 - ease.inOutQuad(clamp(p * 1.5, 0, 1));
          flat = 0.75 + 0.25 * p;
        }
      }
      const poke = i === 0 ? 0.8 * reach : 0;
      job.gl = show ? glyph(+cur[2 + i], S.w, S.h, S.r) : null;
      job.ox = S.x; job.oy = MBASE - S.h; job.w = S.w; job.h = S.h; job.r = S.r * rr;
      job.sx = sx; job.sy = sy; job.lean = poke; job.ball = ball; job.brx = 10.5 * (1 + 0.1 * wv); job.bry = 8.5 * (1 - 0.15 * wv); job.flat = flat;
      job.mat = MAT.white; job.seed = 21 + i; job.a = 1;
      drawDough(g, job);
    }
    drawMortarFront(g);

    // the turner's arm reaches over the rim
    drawArm(g, turner, COATS.t);

    // ---- flour: a puff from every blow, drifting in the low gravity
    const abs = f.minuteKey * 60 + sec;
    for (let j = 0; j < 2; j++) puff(g, HIT_X, 33, b + j, abs - j, 8, 13, 15, 22);
    if (qAge >= 0) puff(g, MORTAR.cx, 58, qAge, 77 + f.minuteKey, 16, 30, 22, 20);
  },
};
