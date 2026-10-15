// Koi: a pond seen from above. The time is pale stones on the bottom, seen
// through moving water; two koi swim their slow loops over it, shadows on
// the stones, under the lily pads. Just before the minute a cherry petal
// drops on each digit that is about to change: its rings spread, the old
// stones dissolve, and after :00 the new ones settle in as the water
// calms. The petals float off and fade over the minute.
//
// The smooth idiom, as against harbour's hard pixels: everything that moves
// is anti-aliased, so it glides by fractions of a pixel; the water is a
// coarse shader (g.coarse), evaluated on a 4-pixel grid and blended.
// The stones refract: they sway by half a pixel, which only AA can show.

import { strokeDigit, mix, scale, hex, sin, cos, clamp, rand, progress, ease, clockFields } from '../js/kit.js';

const DEEP = hex('0d3743'), SHALLOW = hex('2a7a80'), GLINT = hex('8fd4c8');
const STONE = hex('e8dcb6');
const KOI = [
  { body: hex('f6f2ea'), patch: hex('ff6420'), spots: hex('1a1a1a'), phase: 0, size: 1 },
  { body: hex('ff8a2a'), patch: hex('f6f2ea'), spots: hex('ffd0a0'), phase: 2.4, size: 0.85 },
];
const LILY = hex('3f8f4f'), LILY_DARK = hex('2b6a39'), PETAL = hex('f7b7c8');
const PADS = [[14, 12, 9, 0.7], [148, 66, 11, 2.6], [150, 9, 6, 4.1]];   // x, y, r, notch angle

const DIGIT_X = [8, 42, 90, 124], DIGIT_Y = 14, DW = 28, DH = 52;
const centre = (i) => [DIGIT_X[i] + DW / 2, DIGIT_Y + DH / 2];

/** Where koi k's head is at time t (seconds of the day): a slow Lissajous loop. */
function koiAt(k, t) {
  const p = KOI[k].phase;
  return [80 + 66 * sin(t * 0.083 + p), 40 + 30 * sin(t * 0.131 + p * 1.7)];
}

export default {
  name: 'Koi',
  blurb: 'Koi circle over stone digits in a pond; a falling petal dissolves each changing digit.',
  fps: 30,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec;
    const tod = f.h * 3600 + f.m * 60 + s;
    const night = ctx.night;
    ctx.lcd.backlight(1 - 0.65 * night);
    const tone = (c) => mix(c, scale(c, 0.45), night);   // the pond darkens at night

    // ---- the water: a coarse shader
    const deep = tone(DEEP), shallow = tone(SHALLOW), glint = tone(GLINT);
    g.coarse((x, y) => {
      const w1 = sin(x * 0.13 + tod * 0.9 + 2 * sin(y * 0.11 - tod * 0.5));
      const w2 = sin(y * 0.17 - tod * 0.7 + 2 * sin(x * 0.07 + tod * 0.3));
      const v = 0.5 + 0.25 * (w1 + w2);
      const edge = Math.min(x, 160 - x, y * 2, (80 - y) * 2) / 40;
      return mix(mix(deep, shallow, clamp(edge, 0, 1) * 0.8), glint, v * v * v * 0.55);
    }, { cell: 4 });

    // ---- the stones: this minute's digits, dissolving and settling at the turn
    const cur = f.hh + f.mm;
    const next = clockFields(new Date(ctx.date.getTime() + 60000)), nxt = next.hh + next.mm;
    const prevF = clockFields(new Date(ctx.date.getTime() - 60000)), prv = prevF.hh + prevF.mm;
    const DROP = 58.8;
    for (let i = 0; i < 4; i++) {
      let a = 1;
      if (cur[i] !== nxt[i] && s > DROP) a = 1 - ease.inQuad(progress(s, DROP + 0.15, 59.9));   // gone before :00
      if (cur[i] !== prv[i]) a = Math.min(a, ease.outQuad(progress(s, 0.3, 1.6)));             // settles after it
      if (a <= 0) continue;
      const sway = 0.5 * sin(tod * 1.7 + i * 1.3);
      strokeDigit(g, cur[i], DIGIT_X[i] + sway, DIGIT_Y, DW, DH, { weight: 6, c: tone(STONE), a: 0.62 * a, aa: true });
    }

    // ---- koi: shadow first, then the fish, each a chain of discs along its own path
    for (let k = 0; k < KOI.length; k++) {
      const K = KOI[k], n = 7, lag = 0.55;
      const pts = Array.from({ length: n }, (_, j) => koiAt(k, tod - j * lag));
      const rad = (j) => K.size * (j === 0 ? 3.2 : 3.9 - j * 0.5);
      for (let j = n - 1; j >= 0; j--) g.fillCircle(pts[j][0] + 3, pts[j][1] + 3, rad(j), 0x000000, { a: 0.18, aa: true });
      // tail fin: a fan behind the last disc, beating
      const [tx, ty] = pts[n - 1], [px, py] = pts[n - 2];
      const dx = tx - px, dy = ty - py, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
      const beat = 0.6 * sin(tod * 6 + k);
      const fx = tx + ux * 5 * K.size, fy = ty + uy * 5 * K.size;
      g.fillPolygon([[tx, ty], [fx - uy * (3 + beat) * K.size, fy + ux * (3 + beat) * K.size], [fx + uy * (3 - beat) * K.size, fy - ux * (3 - beat) * K.size]],
        tone(K.body), { aa: true, a: 0.85 });
      for (let j = n - 1; j >= 0; j--) g.fillCircle(pts[j][0], pts[j][1], rad(j), tone(j === 1 || j === 3 ? K.patch : K.body), { aa: true });
      // pectoral fins at the second disc
      const [hx, hy] = pts[0], [bx, by] = pts[1];
      const ex = hx - bx, ey = hy - by, el = Math.hypot(ex, ey) || 1, vx = ex / el, vy = ey / el;
      for (const side of [-1, 1]) g.fillEllipse(bx - vy * side * 4.2 * K.size, by + vx * side * 4.2 * K.size, 1.6, 1.6, tone(K.body), { aa: true, a: 0.7 });
      g.fillCircle(pts[2][0] + 0.8, pts[2][1] - 0.6, 0.9 * K.size, tone(K.spots), { aa: true });
      // eyes
      for (const side of [-1, 1]) g.fillCircle(hx + vx * 1.5 - vy * side * 1.6, hy + vy * 1.5 + vx * side * 1.6, 0.55, 0x101010, { aa: true });
    }

    // ---- lily pads float on top
    for (const [x, y, r, notch] of PADS) {
      const bob = 0.4 * sin(tod * 0.8 + x);
      g.fillCircle(x + 1.5, y + 1.5, r, 0x000000, { a: 0.2, aa: true });
      g.arc(x, y + bob, 0, r, notch + 0.35, notch + 2 * Math.PI - 0.35, tone(LILY), { aa: true });
      g.arc(x, y + bob, r - 1.2, r, notch + 0.35, notch + 2 * Math.PI - 0.35, tone(LILY_DARK), { aa: true, a: 0.8 });
    }

    // ---- petals and their rings: one per digit that changed at the last turn or will at the next
    const drops = [];
    for (let i = 0; i < 4; i++) {
      if (cur[i] !== nxt[i]) drops.push({ i, age: s - DROP, seed: f.minuteKey });
      if (cur[i] !== prv[i]) drops.push({ i, age: s + 60 - DROP, seed: f.minuteKey - 1 });
    }
    for (const d of drops) {
      if (d.age < 0) continue;
      const [cx0, cy0] = centre(d.i);
      // rings: three, spreading and fading over the first 2.5 s
      for (let r = 0; r < 3; r++) {
        const age = d.age - r * 0.35;
        if (age <= 0 || age > 2.5) continue;
        const rr = 2 + age * 16;
        g.ring(cx0, cy0, rr - 0.7, rr + 0.7, tone(GLINT), { aa: true, a: 0.55 * (1 - age / 2.5) });
      }
      // the petal: falls in (a shadow closing in), then drifts with the water
      const fall = clamp(d.age / 0.25, 0, 1);
      const drift = Math.max(0, d.age - 0.25);
      const ang = rand(d.seed, d.i) * 6.283;
      const px = cx0 + cos(ang) * drift * 1.1 + 2 * sin(drift * 0.4), py = cy0 + sin(ang) * drift * 0.6;
      const fade = 1 - progress(d.age, 30, 45);
      if (fade <= 0) continue;
      const rot = ang + drift * 0.15;
      const sx = cos(rot), sy = sin(rot);
      g.fillEllipse(px + 2 + (1 - fall) * 5, py + 2 + (1 - fall) * 5, 2.3, 2.3, 0x000000, { a: 0.2 * fade, aa: true });
      if (fall >= 1) {
        g.fillPolygon([[px - sx * 3, py - sy * 3], [px - sy * 1.8, py + sx * 1.8], [px + sx * 3, py + sy * 3], [px + sy * 1.8, py - sx * 1.8]], tone(PETAL), { aa: true, a: fade });
        g.thickLine(px - sx * 1.5, py - sy * 1.5, px + sx * 1.5, py + sy * 1.5, 0.6, tone(hex('ffe4ea')), { aa: true, a: 0.7 * fade });
      }
    }
  },
};
