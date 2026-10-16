// dollclaw: the claw machine.
//
// We look through the front glass of a pink UFO-catcher cabinet. The prizes
// in the pit are plush felt numerals (the time), and the two stars are the
// owner's own toys: the shaggy panda sits slumped in the middle of the pit
// between the hours and the minutes, and the floppy rottweiler puppy rides
// the claw, draped over its hub like it droops over a hand, ears swinging.
//
// Each minute the claw works the pit: before :00 it picks up every numeral
// that is about to change (two changing neighbours in one wide scoop) and
// bins it: hours down the prize chute (left), minutes back into the prize
// heap (right). After :00 it fishes the new minutes out of the heap and sets
// them down; on the hour the new hour tumbles in through a refill hatch in
// the ceiling. In between it hovers beside the panda so the two can say
// hello. On the hour it goes for the star prize: grabs the panda by the
// head, lifts her, jiggles... and lets her slip, as claw machines do.
// The numeral being carried is always the right one for the moment
// (old before :00, new after), and a slot waiting for its new prize is empty.
//
// Palette: the dolls' sampled colours (black, cream, tan, felt brown, tag
// lavender), a hot-pink cabinet interior lit from above, chrome claw and
// rail, five felt colours for the numerals. Hard pixels throughout (flat
// felt, crisp toys); the only blends are the glass sheen and the lamp
// gradient on the back wall. Restrained effects: marquee bulbs chasing to
// the attract-mode beat, a sheen sliding across the glass, a ripple of
// squash through the plush numerals on the beat, the coin slot glowing.

import { mix, sin, clamp, font3x5, sprite, rand, hex } from '../js/kit.js';
import { plushSprite, FELT, DW, DH } from './dollclaw-glyphs.js';
import { drawPanda, drawPuppy, P } from './dollclaw-dolls.js';
import { planFor, clawAt, SX, PANDA_X, HOME_X, HOME_Y, PGRAB_Y, PAIR_HALF, HATCH_TOP, HATCH_G, DY_REST } from './dollclaw-plan.js';

const DY = DY_REST;                  // top of a numeral at rest
const PANDA_Y = 79;
const WALL_TOP = hex('#f478b2'), WALL_BOT = hex('#c24488'), PLUM = hex('#3c1440'), PLUM2 = hex('#5a1e58');
const CHROME = 0xd8d4e6, CHROME_D = 0x6a6080;
const BALLS = [0xf6a8cc, 0xfcd6e6, 0xd884c0, 0xb46ad0, 0xe85a9a, 0xf090c0];

const HEART = sprite(`
  ##.##
  #####
  .###.
  ..#..`, { '#': mix(WALL_TOP, 0xffffff, 0.22) });

// Floor pile and corner heap of little plush balls: fixed, from a seed.
const PILE = [];
for (let i = 0; i < 26; i++) PILE.push([24 + i * 4.6 + rand(i, 1) * 2, 77.5 + rand(i, 2) * 2.5, 2.6 + rand(i, 3) * 1.1, BALLS[(rand(i, 4) * BALLS.length) | 0]]);
const HEAP = [];
const heapTop = (x) => 57 - (x - 139) * 0.3;
for (let j = 0; j < 6; j++)
  for (let i = 0; i < 5; i++) {
    const x = 139.5 + i * 5.2 + (j % 2) * 2.6 + (rand(i, j, 5) - 0.5) * 2;
    const y = heapTop(x) + 2 + j * 4.6 + (rand(i, j, 6) - 0.5) * 2;
    HEAP.push([x, y, 3.3 + rand(i, j, 7) * 1.2, BALLS[(rand(i, j, 8) * BALLS.length) | 0]]);
  }
HEAP.sort((a, b) => a[1] - b[1]);
const STAR = sprite(`
  ..#..
  .###.
  #####
  .#.#.`, { '#': 0xfff4fa });

function ball(g, x, y, r, c) {
  g.fillCircle(x, y, r, mix(c, 0x401030, 0.25));
  g.fillCircle(x - 0.4, y - 0.4, r - 0.8, c);
  g.pixel(Math.floor(x - r * 0.45), Math.floor(y - r * 0.45), mix(c, 0xffffff, 0.6));
}

// The hub's sideways swing under the carriage: a damped pendulum driven by
// the carriage's acceleration, integrated over the last 2.5 s on a fixed
// 1/60 s grid (so any frame can be rebuilt from cold).
function swingAt(ms) {
  const dt = 1 / 60, n = 150;
  const k0 = Math.floor(ms / 1000 / dt);
  const xAt = (k) => { const s = k * dt; const mk = Math.floor(s / 60); return clawAt(mk, s - mk * 60).x; };
  let d = 0, v = 0, xm2 = xAt(k0 - n - 2), xm1 = xAt(k0 - n - 1);
  const w2 = (2 * Math.PI * 0.85) ** 2, damp = 2.6;
  for (let k = k0 - n; k <= k0; k++) {
    const x = xAt(k);
    const acc = (x - 2 * xm1 + xm2) / (dt * dt);
    v += (-w2 * d - damp * v - acc) * dt;
    d += v * dt;
    xm2 = xm1; xm1 = x;
  }
  return { d: clamp(d, -6, 6), v };
}

const bump = (u) => (u <= 0 || u >= 1 ? 0 : sin(u * Math.PI));

export default {
  name: 'Claw Machine',
  blurb: 'The puppy rides the claw, swapping plush numerals in the pit around the panda; on the hour it grabs the panda and lets her slip.',
  fps: 60,

  frame(g, ctx) {
    const f = ctx.fields, ms = ctx.date.getTime(), night = ctx.night;
    const mk = f.minuteKey, s = f.sec, T = ms / 1000;
    const plan = planFor(mk);
    ctx.lcd.backlight(1 - 0.6 * night);
    const beat = T * 2;                                    // 120 bpm attract-mode jingle
    const dim = 0.45 * night;

    // ---------------------------------------------------------- cabinet
    g.gradient(0, 0, 160, 80, [mix(WALL_TOP, PLUM, dim), mix(WALL_BOT, PLUM, dim + 0.1)]);
    for (let y = 12; y < 50; y += 11)
      for (let x = (y % 22 ? 30 : 36); x < 140; x += 13) g.blit(HEART, x, y, { a: 1 - night * 0.6 });

    // top frame with marquee bulbs, the rail
    g.fillRect(0, 0, 160, 3, PLUM);
    const lit = Math.floor(beat) % 3;
    for (let i = 0; i < 27; i++) {
      const on = night < 0.5 && (i % 3 === lit || (plan.hour && s < 40 && (i + Math.floor(beat * 2)) % 2 === 0));
      const c = on ? (plan.hour && s < 40 ? [0xff7ab8, 0xffe070, 0x8ad8ff][i % 3] : 0xfff0c0) : 0x8a4a62;
      g.fillRect(2 + i * 6, 1, 2, 1, c);
    }
    g.fillRect(0, 3, 160, 2, CHROME_D);
    g.hline(0, 3, 160, CHROME);

    // ---------------------------------------------------------- the claw's state
    const cs = clawAt(mk, s);
    const sw = swingAt(ms);
    const sway = sin(T * 1.7) * 0.35;
    const hx = cs.x + sw.d + sway, hy = cs.y;
    const pl = plan.slots;

    // ---------------------------------------------------------- the prizes in their places
    for (let i = 0; i < 4; i++) {
      const sl = pl[i];
      const shown = (sl.inN ? s >= sl.inAt : true) && (sl.outN ? s < sl.outAt : true);
      if (!shown) continue;
      // squash: a ripple on every other bar of the jingle, and the landing bounce
      const r = bump(((T + 0.8) % 4 - i * 0.14) / 0.32) * (night > 0.5 ? 0 : 1);
      const land = sl.inN ? (s - sl.inAt) : 9;
      const lb = land >= 0 && land < 0.5 ? sin(land / 0.5 * Math.PI) * (1 - land / 0.5) * 3.2 : 0;
      const h = Math.round(DH - r * 1.6 - lb), w = Math.round(DW + r * 0.9 + lb * 0.5);
      g.blit(plushSprite(sl.d, FELT[sl.d], w, h), SX[i] - w / 2, DY + DH - h);
    }

    // floor pile in front of the numerals' feet
    for (const [x, y, r, c] of PILE) ball(g, x, y, r, c);

    // ---------------------------------------------------------- the panda
    const show = plan.show;
    let pandaY = PANDA_Y, pandaX = PANDA_X, lift = 0, squash = 0;
    if (plan.hour && show.grab !== undefined && s >= show.grab) {
      if (s < show.slip) { pandaY = PANDA_Y + (hy - PGRAB_Y); pandaX = hx; lift = clamp((PGRAB_Y - hy) / 6, 0, 1); }
      else {
        const u = s - show.slip, fall = PGRAB_Y - 9;   // drops back the height she was lifted
        const tf = Math.sqrt((2 * fall) / 420);
        if (u < tf) { pandaY = PANDA_Y - fall + 210 * u * u; pandaX = hx + (PANDA_X - hx) * (u / tf); lift = 1 - u / tf; }
        else { const v = u - tf; squash = v < 0.6 ? sin(v / 0.6 * Math.PI) * (1 - v / 0.6) * 1.4 : 0; }
      }
    }
    const visiting = plan.visit.t0 !== undefined && s >= plan.visit.t0 - 0.6 && s < plan.visit.t1 + 0.3;
    const wave = visiting ? bump((s - plan.visit.t0 + 0.3) / 3.6) : 0;
    const near = clamp(1 - Math.abs(hx - PANDA_X) / 30, 0, 1);
    drawPanda(g, pandaX, pandaY, {
      look: clamp((hx - PANDA_X) / 38, -1, 1) * (1 - night),
      up: near * clamp((40 - hy) / 20 + 0.5, 0, 1),
      breathe: 0.5 + 0.5 * sin(T * 1.8),
      lift, squash, wave: Math.min(1, wave * 1.6) * (0.85 + 0.15 * sin(T * 14)),
      doze: night,
    });

    // ---------------------------------------------------------- the prize chute (left)
    g.fillRect(0, 44, 23, 18, mix(0x8a2a66, PLUM, dim));          // looking down the chute
    g.fillRect(0, 44, 23, 2, 0xffc6e0);                           // acrylic rim
    // numerals falling down the chute (a squeezed pair falls side by side)
    for (const j of plan.jobs) {
      if (j.drop === undefined || s < j.drop) continue;
      const u = s - j.drop, y = HOME_Y + 12 + 0.5 * HATCH_G * u * u;
      if (y >= 80) continue;
      j.digits.forEach((d, n) => {
        const off = j.pair ? (n ? 1 : -1) * PAIR_HALF * j.dropW : 0;
        g.blit(plushSprite(d, FELT[d]), Math.round(HOME_X + off - DW / 2), Math.round(y));
      });
    }

    // ---------------------------------------------------------- the claw and what it holds
    let held = null;
    for (const j of plan.jobs) {
      if (j.type === 'in' && s >= j.fish && s < j.release) held = j;
      if (j.type === 'out' && s >= j.grab && s < (j.drop ?? j.bury)) held = j;
    }
    const o = cs.o, spread = cs.w * PAIR_HALF;
    // back prong
    g.thickLine(hx, hy + 3, hx, hy + 19, 2, CHROME_D);
    if (held) held.digits.forEach((d, n) => {
      const off = held.pair ? (n ? 1 : -1) * spread : 0;
      g.blit(plushSprite(d, FELT[d]), Math.round(hx + off - DW / 2), Math.round(hy + 12));
    });
    // side prongs: root, elbow, tip and a little inward hook; spread wide for a pair
    for (const sd of [-1, 1]) {
      const ex = hx + sd * (9 + 5 * o + spread), tx = hx + sd * (6.5 + 7 * o + spread);
      g.stroke([[hx + sd * 3, hy + 3], [ex, hy + 12], [tx, hy + 21], [tx - sd * 1.8, hy + 22.5]], 2.2, CHROME_D);
      g.stroke([[hx + sd * 3, hy + 2.6], [ex - sd * 0.4, hy + 11.8], [tx - sd * 0.4, hy + 20.6]], 0.9, CHROME);
    }

    // the heap of prizes in the corner (covers the claw when it digs in)
    g.fillPolygon([[138, 80], [138, heapTop(138) + 3], [160, heapTop(160) + 3], [160, 80]], 0xd884c0);
    for (const [x, y, r, c] of HEAP) ball(g, x, y, r, c);
    g.blit(STAR, 147, 50); g.blit(STAR, 154, 61);

    // the chute's front panel: prize flap and the coin slot
    g.fillRect(0, 62, 23, 18, PLUM2);
    g.vline(23, 44, 36, 0xffc6e0);
    g.fillRect(3, 70, 17, 8, PLUM);
    g.rect(3, 70, 17, 8, 0x8a3a7a);
    g.text('PUSH', 4, 72, { font: font3x5, c: 0xff9ac8 });
    const coin = s < 0.6 ? 1 : 0.35 + 0.25 * sin(T * 3);
    g.fillRect(9, 64, 5, 1, mix(0x401020, 0xffb040, coin * (1 - night * 0.5)));
    g.fillRect(0, 44, 23, 18, 0xffffff, { a: 0.1 });               // acrylic front of the chute

    // the refill hatch in the ceiling rail: on the hour the new hour numerals
    // tumble in through it (they exist only from :00, emerging below the rail)
    for (const h of plan.hatch) {
      const open = clamp(s / 0.12, 0, 1) * clamp((h.land + 0.5 - s) / 0.3, 0, 1);
      if (open <= 0) continue;
      const x0 = SX[h.slot] - 10;
      if (s >= h.t0 && s < h.land) {
        const u = s - h.t0, y = HATCH_TOP - DH + 0.5 * HATCH_G * u * u;
        g.clip(0, HATCH_TOP, 160, 80 - HATCH_TOP);
        g.blit(plushSprite(h.d, FELT[h.d]), SX[h.slot] - DW / 2, Math.round(y));
        g.unclip();
      }
      g.fillRect(x0, 3, 20, 2, PLUM);
      const th = open * 1.35;
      for (const sd of [-1, 1]) {
        const hx0 = sd < 0 ? x0 : x0 + 20;
        g.thickLine(hx0, 5, hx0 - sd * 9 * Math.cos(th), 5 + 9 * Math.sin(th), 1.6, CHROME);
      }
    }

    // cable and carriage
    g.fillRect(Math.round(cs.x) - 5, 2, 10, 4, CHROME);
    g.hline(Math.round(cs.x) - 5, 5, 10, CHROME_D);
    g.line(Math.round(cs.x), 6, Math.round(hx), Math.round(hy - 4), 0x3a2a40);

    // the puppy, riding the hub
    const visitBob = visiting ? sin((s - plan.visit.t0) * 6) * 0.6 : 0;
    const digging = clamp((hy - 40) / 12, 0, 1);
    drawPuppy(g, hx, Math.round(hy + visitBob), {
      ear: clamp(-sw.v * 0.12, -1.2, 1.2),
      flap: clamp(Math.abs(sw.v) * 0.04, 0, 1),
      look: clamp((PANDA_X - hx) / 50, -1, 1) * 0.6,
      down: held !== null || digging > 0 ? 1 : 0,
      kick: visiting || (plan.sniff.t0 !== undefined && s >= plan.sniff.t0 && s < plan.sniff.t1) ? 0.5 + 0.5 * sin(T * 12) : (rand(Math.floor(T / 7), 3) < 0.5 ? bump((T % 7) / 0.8) * (0.5 + 0.5 * sin(T * 14)) : 0),
      sleep: night > 0.5 && Math.abs(hx - HOME_X) < 2 ? 1 : 0,
    });
    if (night > 0.5 && Math.abs(hx - HOME_X) < 2) {
      for (let k = 0; k < 2; k++) {
        const u = (T * 0.4 + k * 0.5) % 1;
        g.text('z', Math.round(hx + 9 + u * 6), Math.round(hy - 4 - u * 10), { font: font3x5, c: 0xfff0f8, a: 1 - u });
      }
    }

    // ---------------------------------------------------------- the front glass
    const gl = ((T / 11) % 1) * 260 - 50;
    g.fillPolygon([[gl, 6], [gl + 9, 6], [gl - 21, 80], [gl - 30, 80]], 0xffffff, { a: 0.1 * (1 - night * 0.6) });
    g.fillPolygon([[gl + 13, 6], [gl + 15, 6], [gl - 15, 80], [gl - 17, 80]], 0xffffff, { a: 0.08 * (1 - night * 0.6) });
  },
};
