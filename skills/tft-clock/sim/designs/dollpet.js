// DollPet: the owner's two plush dolls, kept as virtual pets on a 1990s
// egg keychain.
//
// The camera is close on a lavender egg lying on its side: the fat end is
// cropped, the narrow end carries the three buttons and the ball-chain
// ring, the eight care icons are printed on the shell above and below the
// screen. On the egg's little reflective LCD (pale sage, every ink pixel
// casting a faint shadow onto the reflector one pixel down and right) live
// the floppy black-and-tan puppy, lying flat with its head on its paws, and
// the shaggy panda, sitting slumped with its legs out.
//
// Reading the time: the pet's own dot-matrix clock, HH:MM in chunky 5x7
// LCD dots (2-px dots on a 3-px pitch, unlit dots faintly printed), top
// left of the screen. The colon blinks every second, as on the toy.
//
// The minute turn is the puppy's job. A few seconds before :00 it inches
// over (a beanbag can't walk) under the leftmost digit about to change,
// squashes, hops and bonks the clock from below. The changing digits'
// dots shake loose, rain down, bounce off the puppy and settle in little
// heaps of LCD dots on the floor; the slot stays empty. At :00 an unseen owner presses B on the egg and the loose dots
// hop back up off the floor into the new digits. Old digits are gone
// before :00 and nothing new is placed before it, so the time is never
// wrong, only missing for a moment. On the hour both pets celebrate.
//
// Between turns they are pets: the owner pages through the icons with A and
// picks one with B. FOOD (a bone for the puppy, bamboo for the panda),
// GAME (a ball bounced between them) or PRAISE (hearts and a happy wiggle)
// come round in turn. From 23:00 to 07:00 the light icon is on: the
// screen goes to its blue night light, both sleep, Zzz drift up, and the
// dots of a changing digit come loose by themselves, with no bonk.
//
// Style: flat pixel art in a small palette. Doll colours are the colours
// sampled from the photos; everything else is shell lavender, LCD sage and
// ink. Hard pixels throughout (it is a pet LCD); the only soft things are
// the glare that slides across the screen's window now and then, and the
// ink's shadow on the reflector.

import { Gfx, sprite, rand, hex, mix, clamp, lerp, progress, ease, clockFields, sin } from '../js/kit.js';
import { pandaBody, pandaHead, puppyBody, puppyHead, PANDA_HEAD_AT, INK } from './dollpet-dolls.js';

// ------------------------------------------------------------ layout
const LX = 9, LY = 12, LW = 108, LH = 56;            // the pet LCD, canvas coordinates
const FLOOR = 53;                                    // LCD y of the floor line
const DOT_REST = FLOOR - 2;                          // a loose dot lying on the floor
const DIGX = [1, 17, 37, 53], DIGY = 3, COLX = 33;   // clock cells, LCD coordinates
const PANDA_X = 71, PANDA_Y = FLOOR - 28;            // panda body sprite, LCD coordinates
const PUP_Y = FLOOR - 26, PUP_HOME = 33;             // puppy sprite top; home = sprite centre x
const BTN = [[133, 24], [140, 40], [133, 56]];       // A, B, C on the shell
const ICON_X = [13, 40, 67, 94];                     // icon centres, LCD x
const BONK = 57.4;                                   // the puppy's head meets the clock

// ------------------------------------------------------------ palette
const SHELL = hex('#b8a3ea'), SHELL_LIT = hex('#d6c9f6'), SHELL_SH = hex('#9a84d6'), SHELL_PRINT = hex('#5d4898');
const BEZEL = hex('#6c58aa'), BEZEL_DK = hex('#4a3a80');
const DESK = hex('#2a2236'), DESK_2 = hex('#3a3048');
const PEARL = hex('#f3eef9'), PEARL_SH = hex('#cbbfe6'), PEARL_DN = hex('#d9d0ee');
const METAL = hex('#c8c8d0'), METAL_DK = hex('#7c7c88');
const LCD_DAY = hex('#b6c39e'), LCD_NIGHT = hex('#53607c');
const GHOST_K = 0.955, SHADOW_K = 0.8;                 // unlit dots and ink shadow, as fractions of the ground
const CORAL = hex('#e8506a'), STAR = hex('#f6d24a'), BONE = hex('#f4efe4'), BONE_SH = hex('#cfc6b4');
const BAMBOO = hex('#5f9e3c'), BAMBOO_LIT = hex('#8cc75a'), BAMBOO_DK = hex('#3c6e26');
const BALL = hex('#e8506a'), BALL_2 = hex('#f6f0e6');

const scaleC = (c, k) => mix(0, c, k);

// ------------------------------------------------------------ the clock font: 5 x 7 LCD dots, drawn heavy
const GLYPHS = {
  0: ['.###.', '##.##', '##.##', '##.##', '##.##', '##.##', '.###.'],
  1: ['..##.', '.###.', '..##.', '..##.', '..##.', '..##.', '.####'],
  2: ['.###.', '##.##', '...##', '..##.', '.##..', '##...', '#####'],
  3: ['.###.', '##.##', '...##', '..##.', '...##', '##.##', '.###.'],
  4: ['...##', '..###', '.#.##', '#..##', '#####', '...##', '...##'],
  5: ['#####', '##...', '####.', '...##', '...##', '##.##', '.###.'],
  6: ['..##.', '.##..', '##...', '####.', '##.##', '##.##', '.###.'],
  7: ['#####', '...##', '...##', '..##.', '..##.', '.##..', '.##..'],
  8: ['.###.', '##.##', '##.##', '.###.', '##.##', '##.##', '.###.'],
  9: ['.###.', '##.##', '##.##', '.####', '...##', '..##.', '.##..'],
};
const DOTS = {};
for (const d in GLYPHS) {
  DOTS[d] = [];
  GLYPHS[d].forEach((row, r) => [...row].forEach((ch, c) => { if (ch === '#') DOTS[d].push([c, r]); }));
}
const dotXY = (i, c, r) => [DIGX[i] + 3 * c, DIGY + 3 * r];

// ------------------------------------------------------------ the dolls, every pose rasterised once
const P_TILTS = [-0.15, -0.075, 0, 0.075, 0.15];
const P_HEAD = P_TILTS.map((t) => ({ open: pandaHead(t, 'open'), blink: pandaHead(t, 'blink') }));
const P_SLEEP = pandaHead(0.24, 'sleep');
const P_BODY = { down: pandaBody('down'), up: pandaBody('up'), hold: pandaBody('hold') };
const U_TILTS = [-0.13, 0, 0.13];
const U_EYES = ['open', 'blink', 'happy', 'sleep'];
const U_HEAD = U_TILTS.map((t) => Object.fromEntries(U_EYES.map((e) => [e, puppyHead(t, e, 0)])));
const U_HEAD_FLOP = Object.fromEntries(U_EYES.map((e) => [e, puppyHead(0, e, 2.2)]));
const U_BODY = { flat: puppyBody('flat'), squash: puppyBody('squash'), air: puppyBody('air') };

// ------------------------------------------------------------ props and icons
const pal = { p: 0x141418, k: INK, w: BONE, s: BONE_SH, g: BAMBOO, l: BAMBOO_LIT, d: BAMBOO_DK, r: CORAL, y: STAR, b: BALL, o: BALL_2 };
const SPR = {
  bone: [sprite(`
    .kk.....kk.
    kwwk...kwwk
    kwwwkkkkwsk
    .kwwwwwwwk.
    kwwskkkkwwk
    kwsk...kssk
    .kk.....kk.`, pal), sprite(`
    .......kk.
    k.....kwwk
    kkkkkkkwsk
    wwwwwwwwk.
    kkkkkkkwwk
    k.....kssk
    .......kk.`, pal), sprite(`
    ....kk.
    ...kwwk
    .kkkwsk
    kwwwwk.
    .kkkwwk
    ...kssk
    ....kk.`, pal)],
  // bamboo held up to the panda's mouth in a shaggy black paw; eaten from the top
  bamboo: [`
    .kk.......
    kllk.kk...
    .kllkllk..
    ..kgllkk..
    ..kglgk...
    ..kdddk...
    ..kglgk...
    ..kglgk...
    ..kglgk...
    ..kdddk...
    .kpppppk..
    kpppppppk.
    kpppppppk.
    .kpppppk..
    ..kkkkk...`, `
    ..........
    ..........
    ..........
    ..........
    ..kkkkk...
    ..kdddk...
    ..kglgk...
    ..kglgk...
    ..kglgk...
    ..kdddk...
    .kpppppk..
    kpppppppk.
    kpppppppk.
    .kpppppk..
    ..kkkkk...`, `
    ..........
    ..........
    ..........
    ..........
    ..........
    ..........
    ..........
    ..........
    ..kkkkk...
    ..kdddk...
    .kpppppk..
    kpppppppk.
    kpppppppk.
    .kpppppk..
    ..kkkkk...`].map((p) => sprite(p, pal)),
  ball: sprite(`
    .kkk.
    kbbok
    kbobk
    kobbk
    .kkk.`, pal),
  heart: sprite(`
    .k.k.
    krkrk
    krrrk
    .krk.
    ..k..`, pal),
  star: sprite(`
    ...k...
    ..kyk..
    kkkykkk
    .kyyyk.
    .kykyk.
    .k...k.`, pal),
  note: sprite(`
    ..kkk
    ..k.k
    ..k.k
    kkk.k
    kkk..`, pal),
  z: sprite(`
    kkkk
    ..k.
    .k..
    kkkk`, pal),
};
const ICONS = [
  ['#.#..#.', '#.#.##.', '###.##.', '.#..##.', '.#...#.', '.#...#.', '.#...#.'],  // food
  ['..###..', '.#...#.', '.#...#.', '.#...#.', '..#.#..', '..###..', '..###..'],  // light
  ['..###..', '.#.#.#.', '#..#..#', '#######', '#..#..#', '.#.#.#.', '..###..'],  // game
  ['.##....', '#.##...', '.###...', '..###.#', '.######', '.#####.', '..###..'],  // bath
  ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...', '.......'],  // meter
  ['..###..', '..#.#..', '###.###', '#.....#', '###.###', '..#.#..', '..###..'],  // medicine
  ['..####.', '..#..#.', '..#..#.', '..#..#.', '###.###', '###.###', '.#...#.'],  // praise
  ['...#...', '..###..', '.#####.', '.#####.', '.#####.', '#######', '...#...'],  // attention
].map((rows) => sprite(rows));
const I_FOOD = 0, I_LIGHT = 1, I_GAME = 2, I_PRAISE = 6, I_CALL = 7;

const TINYG = {
  A: sprite(['.#.', '#.#', '###', '#.#', '#.#']),
  B: sprite(['##.', '#.#', '##.', '#.#', '##.']),
  C: sprite(['.##', '#..', '#..', '#..', '.##']),
};
const TINY = { height: 5, width: 3, spacing: 1, glyph: (ch) => TINYG[ch] };

// ------------------------------------------------------------ the shell, drawn once
const BG = new Gfx(160, 80);
{
  const g = BG;
  g.gradient(0, 0, 160, 80, [DESK_2, DESK], { angle: 90 });
  // the egg lies on its side, narrowing to the right
  const egg = (x, y) => {
    const u = (x - 70) / 86, ry = 50 * (1 - 0.16 * u);
    const v = (y - 40) / ry;
    return (Math.sqrt(u * u + v * v) - 1) * 40;
  };
  g.fillWhere((x, y) => egg(x, y) < 0, SHELL);
  // flat bands: a lit rim along the top, a darker one along the bottom
  g.fillWhere((x, y) => egg(x, y) < 0 && egg(x, y + 3) >= 0, SHELL_SH);
  g.fillWhere((x, y) => egg(x, y) < 0 && egg(x, y - 3) >= 0, SHELL_LIT);
  // printed sparkles on the plastic
  const spark = sprite(['.#.', '###', '.#.']);
  for (let i = 0; i < 40; i++) {
    const x = 2 + Math.floor(rand(i, 1, 9) * 156), y = 1 + Math.floor(rand(i, 2, 9) * 77);
    const inLcd = x > LX - 6 && x < LX + LW + 5 && y > LY - 12 && y < LY + LH + 12;
    const nearBtn = x > 122;
    if (inLcd || nearBtn || egg(x - 1, y - 1) > -2 || egg(x + 2, y + 2) > -2) continue;
    g.blit(spark, x - 1, y - 1, { c: SHELL_LIT });
  }
  // the screen window: a recessed bezel
  g.fillRoundRect(LX - 4, LY - 4, LW + 8, LH + 8, 5, BEZEL);
  g.fillRoundRect(LX - 4, LY - 4, LW + 8, 2, 1, BEZEL_DK);
  g.fillRect(LX - 1, LY - 1, LW + 2, LH + 2, BEZEL_DK);
  // eight care icons printed above and below the screen
  for (let k = 0; k < 8; k++) {
    const x = LX + ICON_X[k % 4] - 3, y = k < 4 ? 1 : LY + LH + 5;
    g.blit(ICONS[k], x, y, { c: SHELL_PRINT });
  }
  // button wells and letters
  BTN.forEach(([x, y], k) => {
    g.fillCircle(x, y, 7.2, BEZEL);
    g.fillCircle(x + 0.3, y - 0.6, 6.6, BEZEL_DK);
    g.text('ABC'[k], x - 13, y - 2, { font: TINY, c: SHELL_PRINT });
  });
  // the ball-chain ring at the tip
  g.circle(156, 40, 4, METAL_DK);
  g.circle(156, 40, 3, METAL);
  for (let k = 0; k < 6; k++) g.fillCircle(158.5 + k * 2.6, 36 - k * 3.2, 1.1, k % 2 ? METAL_DK : METAL);
}

function drawButton(g, k, down) {
  const [x, y] = BTN[k];
  if (down) {
    g.fillCircle(x, y + 0.6, 5.6, INK);
    g.fillCircle(x, y + 0.6, 4.7, PEARL_DN);
  } else {
    g.fillCircle(x, y, 5.6, INK);
    g.fillCircle(x, y, 4.7, PEARL_SH);
    g.fillCircle(x - 0.5, y - 0.7, 4.0, PEARL);
    g.fillRect(x - 3, y - 3, 2, 1, 0xffffff);
  }
}

// ------------------------------------------------------------ helpers
const step = (t, period) => Math.floor(t / period);
const frac = (v) => v - Math.floor(v);
const digitsOf = (f) => [f.hh[0], f.hh[1], f.mm[0], f.mm[1]];

/** A dot shaken loose: where it is `tau` seconds after the bonk (LCD coords). It
 *  pops up, drifts sideways and bounces down onto its place in a little heap. */
function fallPos(d, tau) {
  const u = Math.min(tau / 1.1, 1);
  const x = d.x + (d.rx - d.x) * (1 - (1 - u) * (1 - u));
  const G = 320;
  let t = tau, y = d.y, v = -(12 + rand(d.sd, 2) * 34);
  for (let b = 0; b < 3; b++) {
    const th = (-v + Math.sqrt(v * v + 2 * G * (d.ry - y))) / G;
    if (t < th) return [x, y + v * t + 0.5 * G * t * t];
    t -= th; y = d.ry; v = -(v + G * th) * 0.36;
  }
  return [x, d.ry];
}

/** The loose dots of one turn, from the digits that change between `a` and `b`,
 *  each with its resting place. Dots settle on the LCD's own 3-px grid, roll
 *  off the puppy to either side of it, and heap up like sand. */
function looseDots(a, b, key, night) {
  const out = [], level = new Int8Array(36);
  const px = night ? PUP_HOME : bonkTarget(a, b);
  const lo = Math.floor((px - 24) / 3), hi = Math.ceil((px + 23) / 3);   // cells the puppy lies on
  for (let i = 0; i < 4; i++) {
    if (a[i] === b[i]) continue;
    DOTS[a[i]].forEach(([c, r], j) => {
      const [x, y] = dotXY(i, c, r);
      const sd = key * 131 + i * 37 + j;
      let cell = clamp(Math.round((x + (rand(sd, 1) - 0.5) * 30) / 3), 0, 35);
      if (cell >= lo && cell <= hi) {
        // it bounces off the puppy and rolls away to somewhere free on the floor
        const free = 35 - (hi - Math.max(lo, 0) + 1);
        let n = Math.floor(rand(sd, 3) * free);
        cell = n < lo ? n : n + (hi - Math.max(lo, 0) + 1);
      }
      // sand: roll down while a neighbour is lower
      for (let k = 0; k < 30; k++) {
        const ok = (n) => n >= 0 && n <= 35 && !(n >= lo && n <= hi);
        const l = ok(cell - 1) ? level[cell - 1] : 99, r2 = ok(cell + 1) ? level[cell + 1] : 99;
        const m = Math.min(l, r2);
        if (m < level[cell]) cell += (l === m ? (r2 === m ? (rand(sd, k) < 0.5 ? -1 : 1) : -1) : 1); else break;
      }
      const lv = level[cell]++;
      out.push({ i, x, y, sd, rx: cell * 3, ry: DOT_REST - 3 * lv });
    });
  }
  return out;
}

/** The plan of the puppy's bonk, before minute `cur` turns into `nxt`. */
function bonkTarget(cur, nxt) {
  for (let i = 0; i < 4; i++) if (cur[i] !== nxt[i]) return clamp(DIGX[i] + 7, 24, 50);
  return PUP_HOME;
}

// ------------------------------------------------------------ the frame
export default {
  name: 'DollPet',
  blurb: 'The two plush dolls as virtual pets on an egg keychain: the floppy puppy bonks the dot-matrix clock and the loose dots hop back as the new minute.',
  fps: 60,

  frame(g, ctx) {
    const f = ctx.fields, s = f.sec;
    const t = (ctx.date.getTime() % 86400000) / 1000;   // wall-clock seconds: every motion is a function of the clock
    const night = ctx.night, asleep = night > 0.5;
    ctx.lcd.backlight(1 - 0.55 * night);

    const cur = digitsOf(f);
    const nf = clockFields(new Date(ctx.date.getTime() + 60000));
    const pf = clockFields(new Date(ctx.date.getTime() - 60000));
    const nxt = digitsOf(nf), prv = digitsOf(pf);
    const hourShow = f.m === 0 && s < 12 && !asleep;

    g.draw(BG, 0, 0);

    // ---------------- the owner's thumb on the buttons, and the icon cursor
    const presses = [];      // [button, time]
    let cursor = -1;
    let event = null;
    if (!asleep) {
      const kind = ['feed', 'game', 'praise'][f.minuteKey % 3];
      const icon = { feed: I_FOOD, game: I_GAME, praise: I_PRAISE }[kind];
      const steps = icon + 1;                                // A pages round the icons, one press each
      const t0 = 14;
      for (let k = 0; k < steps; k++) presses.push([0, t0 + k * 0.45]);
      const tb = t0 + steps * 0.45 + 0.2;
      presses.push([1, tb]);
      const E0 = tb + 0.3, E1 = E0 + 12;
      presses.push([2, E1 + 0.4]);
      if (s >= t0 && s < E1 + 0.4) {
        const k = Math.min(steps - 1, Math.floor((s - t0) / 0.45));
        cursor = k;
      }
      if (s >= E0 && s < E1) event = { kind, u: s - E0 };
      presses.push([2, 55.9]);
      if (s >= 55.9 && s < 58.5) cursor = I_CALL;
      presses.push([1, 0.0]);
      if (s < 1.6) cursor = -1;
    } else {
      cursor = I_LIGHT;
    }
    const pressed = [false, false, false];
    for (const [b, at] of presses) if (s >= at && s < at + 0.18) pressed[b] = true;
    for (let k = 0; k < 3; k++) drawButton(g, k, pressed[k]);

    // ---------------- the LCD
    const ground = mix(LCD_DAY, LCD_NIGHT, night);
    const ghost = scaleC(ground, GHOST_K), shadow = scaleC(ground, SHADOW_K);
    g.fillRect(LX, LY, LW, LH, ground);
    g.clip(LX, LY, LW, LH);
    const X = (x) => LX + x, Y = (y) => LY + y;

    // unlit dots of the clock, printed faintly, and the floor
    for (let i = 0; i < 4; i++)
      for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) g.fillRect(X(DIGX[i] + 3 * c), Y(DIGY + 3 * r), 2, 2, ghost);
    for (const r of [2, 4]) g.fillRect(X(COLX), Y(DIGY + 3 * r), 2, 2, ghost);
    for (let x = 0; x < LW; x += 2) g.fillRect(X(x), Y(FLOOR + 1), 1, 1, shadow);

    // the cursor: an LCD arrow beside the printed icon
    if (cursor >= 0) {
      const cx = X(ICON_X[cursor % 4]);
      if (cursor < 4) { g.fillRect(cx - 2, Y(0), 5, 1, INK); g.fillRect(cx - 1, Y(1), 3, 1, INK); g.pixel(cx, Y(2), INK); }
      else { g.fillRect(cx - 2, Y(LH - 1), 5, 1, INK); g.fillRect(cx - 1, Y(LH - 2), 3, 1, INK); g.pixel(cx, Y(LH - 3), INK); }
    }

    // ink with its shadow on the reflector
    // (queued, so every shadow lands on the reflector under all the ink, never on other ink)
    const queue = [];
    const inkRect = (x, y, w, h) => queue.push([0, x, y, w, h]);
    const inkSpr = (spr, x, y) => queue.push([1, spr, x, y]);

    // ---------------- the clock
    const shake = !asleep && s >= BONK && s < BONK + 0.18 ? -1 : 0;
    const preTurn = s >= BONK;               // changing digits have shaken loose
    const postTurn = s < 1.9;                // the loose dots are climbing back
    for (let i = 0; i < 4; i++) {
      if (preTurn && cur[i] !== nxt[i]) continue;
      if (postTurn && cur[i] !== prv[i]) continue;
      const dy = shake * (i % 2 ? 1 : 1);
      for (const [c, r] of DOTS[cur[i]]) { const [x, y] = dotXY(i, c, r); inkRect(X(x), Y(y + dy), 2, 2); }
    }
    if (frac(s) < 0.5) for (const r of [2, 4]) inkRect(X(COLX), Y(DIGY + 3 * r + shake), 2, 2);

    // loose dots: falling (before the turn) or climbing back into the new digits (after it)
    const loose = [];        // drawn after the dolls: the dots land in front of them
    const looseRect = (x, y) => loose.push([X(Math.round(x)), Y(Math.round(y))]);
    if (preTurn) {
      for (const d of looseDots(cur, nxt, f.minuteKey, asleep)) {
        const [x, y] = fallPos(d, s - BONK);
        looseRect(x, y);
      }
    }
    if (postTurn) {
      const back = looseDots(prv, cur, f.minuteKey - 1, asleep);
      let base = 0;
      for (let i = 0; i < 4; i++) {
        if (cur[i] === prv[i]) continue;
        const src = back.filter((d) => d.i === i);
        const dst = DOTS[cur[i]];
        dst.forEach(([c, r], k) => {
          const from = src[k % src.length];
          const [fx, fy] = fallPos(from, 9);
          const [tx, ty] = dotXY(i, c, r);
          const t0 = 0.08 + (base + k) * 0.022;
          const u = progress(s, t0, t0 + 0.42);
          if (u <= 0 && k >= src.length) return;      // a new dot is not there before its turn
          const e = ease.inOutQuad(u);
          const x = lerp(fx, tx, e), y = lerp(fy, ty, e) - 14 * 4 * u * (1 - u);
          if (u >= 1) inkRect(X(tx), Y(ty), 2, 2); else looseRect(x, y);
        });
        // dots the new digit does not need blink out on the floor
        for (let k = dst.length; k < src.length; k++) {
          if (s > 0.5 || frac(s * 8) < 0.5) continue;
          const [fx, fy] = fallPos(src[k], 9);
          looseRect(fx, fy);
        }
        base += dst.length;
      }
    }

    // ---------------- the panda
    const beat = step(s, 1) % 2;           // the pet LCD's one-second beat
    let pArms = 'down', pTilt = 2, pEyes = 'open', pDy = 0, bambooStage = -1;
    {
      pTilt = [2, 2, 3, 3, 2, 2, 1, 1][step(t, 0.8) % 8];
      pDy = beat;
      const bl = frac(t / 4.7 + 0.3);
      if (bl < 0.035) pEyes = 'blink';
      if (!asleep && s >= BONK && s < BONK + 0.8) { pArms = 'up'; pTilt = 0; pDy = -1; }
      if (!asleep && s >= 1.0 && s < 2.4) { pArms = 'up'; pDy = step(s, 0.2) % 2 ? -1 : 0; }
    }

    // ---------------- the puppy
    let uX = PUP_HOME, uDy = 0, uBody = 'flat', uEyes = 'open', uTilt = 1, uLift = 0, uFlop = false;
    {
      const bl = frac(t / 3.9 + 0.65);
      if (bl < 0.04) uEyes = 'blink';
      uDy = 0; uLift = beat ? 0 : 1;
      if (step(t, 6) % 4 === 1) uTilt = 0; else if (step(t, 6) % 4 === 3) uTilt = 2;
      if (!asleep) {
        const target = bonkTarget(cur, nxt);
        // after the turn, inch back home from where it hopped
        const prevTarget = bonkTarget(prv, cur);
        if (s < 6) {
          const u = progress(s, 2.5, 5.5);
          uX = Math.round(lerp(prevTarget, PUP_HOME, u));
          if (u > 0 && u < 1) uBody = step(s, 0.25) % 2 ? 'squash' : 'flat';
          if (s < 2.5) { uLift = 2; uEyes = s > 1.2 ? 'happy' : 'open'; uTilt = 1; }
        }
        if (s >= 51) {
          const u = progress(s, 51.5, 55.5);
          uX = Math.round(lerp(PUP_HOME, target, ease.inOutQuad(u)));
          if (u > 0 && u < 1) uBody = step(s, 0.25) % 2 ? 'squash' : 'flat';
          if (s >= 55.5) { uLift = 2; uTilt = 1; }            // looks up at the clock
          if (s >= 56.7 && s < 57.05) { uBody = 'squash'; uDy = 1; uLift = 0; }
          if (s >= 57.05 && s < 57.85) {
            // the hop: up 7 px to the clock by BONK, then down
            const k = (s - 57.05) / 0.8, peak = (BONK - 57.05) / 0.8;
            const hgt = k < peak ? 1 - ((peak - k) / peak) ** 2 : 1 - ((k - peak) / (1 - peak)) ** 2;
            uDy = -Math.round(7 * hgt); uBody = 'air'; uLift = 1; uEyes = s < BONK ? 'open' : 'blink'; uFlop = true;
          }
          if (s >= 57.85 && s < 58.1) { uBody = 'squash'; uDy = 1; uFlop = true; }
          if (s >= 58.1) { uTilt = step(s, 0.6) % 2 ? 0 : 2; uLift = 0; }  // looks at the dots on the floor
        }
      } else {
        uEyes = 'sleep'; uLift = 0; uTilt = 1; pEyes = 'sleep';
      }
    }

    // ---------------- events: food, game, praise
    let boneStage = -1, boneX = 0, boneY = 0, ball = null;
    const hearts = [];
    if (event) {
      const u = event.u;
      if (event.kind === 'feed') {
        // the bone drops in front of the puppy; bamboo appears in the panda's paw
        boneX = uX; boneY = Math.min(FLOOR - 5, -8 + 120 * u * u);
        boneStage = u < 4 ? 0 : u < 7 ? 1 : u < 9.5 ? 2 : -1;
        if (u > 1 && u < 9.5) { uLift = step(u, 0.35) % 2 ? 0 : 1; uEyes = step(u, 0.7) % 2 ? 'blink' : 'open'; uTilt = 1; }
        bambooStage = u < 0.6 ? -1 : u < 4.5 ? 0 : u < 7.5 ? 1 : u < 9.8 ? 2 : -1;
        if (bambooStage >= 0) { pArms = 'hold'; pTilt = 2; pDy = step(u, 0.4) % 2; }
        if (u >= 9.8) { hearts.push([uX + 25, 1, u - 9.8], [PANDA_X + 19, 2, u - 10.1]); uEyes = 'happy'; }
      } else if (event.kind === 'game') {
        // a ball bounced between them: four volleys, then it rolls out of the screen
        const L = 1.5, n = 5;
        const k = Math.floor(u / L), v = frac(u / L);
        const pupX = uX + 2, panX = PANDA_X + 10;
        if (k < n) {
          const a = k % 2 ? pupX : panX, b = k % 2 ? panX : pupX;
          ball = [lerp(a, b, v), 37 - 11 * 4 * v * (1 - v)];
          const atPup = (k % 2 === 0 && v > 0.85) || (k % 2 === 1 && v < 0.15);
          const atPan = (k % 2 === 1 && v > 0.85) || (k % 2 === 0 && v < 0.15);
          if (atPup) { uLift = 2; uTilt = 1; uEyes = 'happy'; }
          if (atPan) { pArms = 'up'; pDy = -1; }
          uTilt = ball[0] < uX - 6 ? 0 : ball[0] > uX + 6 ? 2 : 1;
          pTilt = ball[0] < PANDA_X + 4 ? 1 : 2;
        } else {
          const w = u - n * L;
          if (w < 2.5) ball = [panX - 4 - 50 * w, FLOOR - 5 - Math.abs(sin(w * 9)) * 6 * (1 - w / 2.5)];
          uTilt = 0; uEyes = w > 1 ? 'happy' : 'open';
        }
      } else {
        // praise: hearts, a happy wiggle, the panda claps its paws up
        uEyes = 'happy'; uLift = 2;
        uX += step(u, 0.3) % 2 ? 1 : -1;
        uBody = step(u, 0.3) % 2 ? 'squash' : 'flat';
        if (step(u, 0.5) % 2) { pArms = 'up'; pDy = -1; }
        pTilt = step(u, 0.5) % 2 ? 1 : 3;
        for (let h = 0; h < 6; h++) hearts.push([h % 2 ? PANDA_X + 19 : h % 4 ? uX + 25 : uX - 24, h, u - h * 1.6]);
      }
    }
    if (hourShow) {
      // on the hour: both bounce in time and notes rise
      if (s >= 2.4) {
        pArms = step(s, 0.4) % 2 ? 'up' : 'down'; pDy = step(s, 0.4) % 2 ? -2 : 0;
        uEyes = 'happy'; uBody = step(s, 0.4) % 2 ? 'air' : 'squash'; uDy = step(s, 0.4) % 2 ? -3 : 1;
        for (let h = 0; h < 8; h++) hearts.push([h % 2 ? PANDA_X + 6 + 26 * ((h >> 1) % 2) : (h >> 1) % 2 ? uX + 25 : uX - 24, 10 + h, s - 2.4 - h * 0.9, true]);
      }
    }

    // draw the panda
    {
      const bx = X(PANDA_X), by = Y(PANDA_Y + pDy) - 3;
      const body = P_BODY[pArms];
      const head = pEyes === 'sleep' ? P_SLEEP : P_HEAD[pTilt][pEyes === 'blink' ? 'blink' : 'open'];
      inkSpr(body, bx, by);
      const hy = by + 3 + PANDA_HEAD_AT[1];
      inkSpr(head, bx + PANDA_HEAD_AT[0], hy);
      if (bambooStage >= 0) inkSpr(SPR.bamboo[bambooStage], bx + 20, hy + 13 + pDy);
    }
    // draw the puppy
    {
      const sx = X(uX - 23), sy = Y(PUP_Y + uDy);
      const bodyY = uBody === 'air' ? sy - 1 : sy;
      inkSpr(U_BODY[uBody], sx, bodyY);
      const head = uFlop ? U_HEAD_FLOP[uEyes] : U_HEAD[uTilt][uEyes];
      inkSpr(head, sx, sy - uLift);
    }
    // the bone, held between the front paws
    if (boneStage >= 0) inkSpr(SPR.bone[boneStage], X(boneX - 5), Y(Math.round(boneY)));
    for (const [x, y] of loose) inkRect(x, y, 2, 2);
    if (ball) inkSpr(SPR.ball, X(Math.round(ball[0]) - 2), Y(Math.round(ball[1]) - 2));

    // the bonk: a star where the head met the clock
    if (!asleep && s >= BONK && s < BONK + 0.5) {
      const tx = bonkTarget(cur, nxt);
      inkSpr(SPR.star, X(tx - 3 + (step(s, 0.1) % 2)), Y(DIGY + 19 - Math.round((s - BONK) * 8)));
    }
    // hearts and notes rising
    for (const [hx, seed, age, isNote] of hearts) {
      if (age < 0 || age > 2.2) continue;
      const x = hx + Math.round(sin(age * 5 + seed) * 2) - 2;
      const y = x < 66 ? 38 - age * 6 : 24 - age * 9;    // over the puppy they stop short of the clock
      if (y < (x < 66 ? 26 : 1)) continue;
      inkSpr(isNote ? SPR.note : SPR.heart, X(Math.round(x)), Y(Math.round(y)));
    }
    // Zzz
    if (asleep) {
      for (let k = 0; k < 3; k++) {
        const age = frac(t / 4.5 + k / 3) * 4.5;
        const who = k % 2;
        // the puppy's drift off sideways under the clock, the panda's rise past its ear
        const x = who ? PANDA_X + 30 + Math.round(age * 1.5 + sin(age * 3) * 1.5) : uX + 14 + Math.round(age * 3);
        const y = who ? 12 - Math.round(age * 3.2) : 33 - Math.round(age * 2);
        if (y > 0 && age < 3.6) inkSpr(SPR.z, X(x), Y(y));
      }
    }

    for (const q of queue) q[0] ? g.blit(q[1], q[2] + 1, q[3] + 1, { c: shadow }) : g.fillRect(q[1] + 1, q[2] + 1, q[3], q[4], shadow);
    for (const q of queue) q[0] ? g.blit(q[1], q[2], q[3]) : g.fillRect(q[1], q[2], q[3], q[4], INK);

    // the glare on the screen's window: a pale band that slides across now and then
    {
      const gp = frac(t / 13 + 0.2);
      if (gp < 0.25) {
        const gx = lerp(-30, LW + 30, gp / 0.25);
        g.fillPolygon([[X(gx), Y(0)], [X(gx + 10), Y(0)], [X(gx - 18), Y(LH)], [X(gx - 28), Y(LH)]], 0xffffff, { a: 0.10 });
      }
    }
    g.unclip();
  },
};

