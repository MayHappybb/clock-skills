// Frog — the rainbow frog, catching the minute.
//
// The frog from the owner's avatar sits on the left: a round body whose
// rainbow is drawn as a sweep of dither, dense on the warm side, round
// glasses with lashes above and below, pink lips (solid, with a dark keyline
// so they stay a shape on the textured body) and four splayed three-toed legs.
//
// A fly wanders over the pond to the right of it all minute, and the frog's
// eyes follow it. At :58 the tongue shoots out, takes the fly, and the frog
// squints happily as it swallows; the minute turns; a new fly arrives at :01.
// On the hour it hops. Everything is worked out from the clock, so any
// instant renders on its own.
//
// Burn-in: the time block walks a small orbit every few minutes, the frog
// breathes and blinks, and from 23:00 to 07:00 the panel runs at low
// contrast (two bytes, once), which is also kinder in a dark bedroom.

import { strokeText, font3x5, sprite, ease, progress, smoothNoise, noise, orbit, polar, OFF, ON } from '../js/kit.js';

// Body and features, in canvas coordinates (pixel centres at +0.5).
const BODY = { cx: 28, cy: 38, rx: 23, ry: 18.5 };
const LENSES = [{ cx: 26.5, cy: 21 }, { cx: 41.5, cy: 21 }];
const LENS_R = 6.5;
const LIPS = { x: 42, y: 39 };       // centre of the lips
const DIGIT = { w: 13, h: 26, weight: 3.6, gap: 3 };
const TIME_X = 57, TIME_Y = 6;
const POND_Y = 58;

const CATCH = 58.0, REACH = 0.16, HOLD = 0.08, PULL = 0.3, SWALLOW = 1.2, ARRIVE = 1.0;

/** Where the fly is at second `sec` of the minute keyed `key`, or null. */
function flyAt(sec, key) {
  if (sec < ARRIVE) return null;
  // It flies in from the right edge over the first two seconds.
  const enter = ease.outCubic(progress(sec, ARRIVE, ARRIVE + 2));
  const wx = 88 + 30 * (smoothNoise(sec * 0.45, key) - 0.5) * 2 + 8 * Math.sin(sec * 2.1 + key);
  const wy = 48 + 5 * (smoothNoise(sec * 0.6, key + 7) - 0.5) * 2 + 2 * Math.sin(sec * 5.3);
  return { x: 132 + (wx - 132) * enter, y: 44 + (wy - 44) * enter };
}

/** The legs: hip, knee, foot, as fractions of the stance; `stretch` straightens them for a hop. */
function drawLegs(g, dy, stretch) {
  const legs = [
    { hip: [11, 49], foot: [5, 59], toesTo: -1 },
    { hip: [20, 54], foot: [17, 61], toesTo: -1 },
    { hip: [36, 54], foot: [39, 61], toesTo: 1 },
    { hip: [45, 49], foot: [51, 59], toesTo: 1 },
  ];
  for (const { hip, foot, toesTo } of legs) {
    const fx = foot[0] + toesTo * stretch * -2, fy = foot[1] + stretch * 3;
    g.thickLine(hip[0], hip[1] + dy, fx, fy + dy * 0.2, 3);
    // Three toes, splayed.
    for (const a of [-0.55, 0, 0.55]) {
      const ang = Math.PI + a + toesTo * 0.25;
      const [tx, ty] = polar(fx, fy + dy * 0.2, 2.6, ang + Math.PI / 2 * -toesTo * 0.9);
      g.line(fx, fy + dy * 0.2, tx, ty);
    }
  }
}

function drawBody(g, dy, breathe) {
  const { cx, rx } = BODY, cy = BODY.cy + dy, ry = BODY.ry + breathe;
  const inside = (px, py) => ((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2;
  // The rainbow, as a sweep of dither: dense on the warm left, thin on the
  // cool right, the way the avatar's colours fall off in brightness.
  g.fillWhere((px, py) => {
    const d = inside(px, py);
    if (d > 1) return false;
    if (d > 0.8) return true;   // the outline, about two pixels
    const u = (px - (cx - rx)) / (2 * rx);
    return 0.3 - 0.26 * u;
  }, ON, [cx - rx - 1, cy - ry - 1, 2 * rx + 2, 2 * ry + 2]);
}

function drawLens(g, { cx, cy }, look, state) {
  // Lit rim, a dark gap, a lit white of the eye with a dark pupil in it:
  // the avatar's white eyes, which a lit pupil on black would lose.
  g.fillCircle(cx, cy, LENS_R + 1, OFF);       // keyline round the glasses
  g.ring(cx, cy, LENS_R - 1.6, LENS_R, ON);
  if (state === 'open') {
    g.fillCircle(cx, cy, LENS_R - 2.6, ON);
    g.fillCircle(cx + look[0], cy + look[1], 1.7, OFF);
  } else if (state === 'shut') {
    g.hline(cx - 3, cy, 7);
  } else {
    // Happy squint: ^
    g.line(cx - 3, cy + 1, cx, cy - 2).line(cx, cy - 2, cx + 3, cy + 1);
  }
}

function drawLashes(g, dy) {
  const [l, r] = LENSES;
  for (const [lens, side] of [[l, -1], [r, 1]]) {
    const cy = lens.cy + dy;
    // Three above, fanning outwards; two short ones below the outer edge.
    // Curled outwards, on the upper outer quarter, so they read as lashes
    // and not as an owl's ear tufts.
    for (const [a, len] of [[-0.45, 2.2], [0, 2.6], [0.45, 2.2]]) {
      const ang = a + side * 0.75;
      const [x0, y0] = polar(lens.cx, cy, LENS_R + 0.5, ang);
      const [x1, y1] = polar(lens.cx, cy, LENS_R + len, ang + side * 0.25);
      g.line(x0, y0, x1, y1);
    }
    for (const a of [Math.PI + side * 0.75, Math.PI + side * 1.05]) {
      const [x0, y0] = polar(lens.cx, cy, LENS_R + 1, a);
      const [x1, y1] = polar(lens.cx, cy, LENS_R + 2.5, a);
      g.line(x0, y0, x1, y1);
    }
  }
  // Bridge between the lenses.
  g.fillRect(l.cx + LENS_R - 1, l.cy + dy - 1, r.cx - l.cx - 2 * LENS_R + 2, 2);
}

// Lips as pixel art: at this size a drawn sprite beats any formula.
const LIPS_SHUT = sprite(`
  .###...###.
  #####.#####
  ###########
  #.........#
  .#########.
  ..#######..
`);
const LIPS_OPEN = sprite(`
  .###...###.
  #####.#####
  ###.....###
  ##.......##
  .##.....##.
  ..#######..
`);

function drawLips(g, dy, open) {
  const x = LIPS.x - 5, y = Math.round(LIPS.y + dy) - 3;
  // The mouth line runs through the lips and back across the face, on a
  // band cleared out of the texture so it reads as a line.
  g.fillRect(x - 12, y + 2, 26, 3, OFF);
  g.hline(x - 10, y + 3, 24);
  // A dark keyline round the lips, then the lips.
  for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) g.blit(LIPS_SHUT, x + ox, y + oy, { c: OFF });
  g.blit(open ? LIPS_OPEN : LIPS_SHUT, x, y);
  if (open) g.fillRect(x + 3, y + 2, 5, 3, OFF);
}

function drawFly(g, x, y, sec) {
  const up = Math.floor(sec * 18) % 2 === 0;
  g.fillRect(x, y, 2, 2);
  if (up) g.pixel(x - 1, y - 1).pixel(x + 2, y - 1);
  else g.pixel(x - 1, y).pixel(x + 2, y);
}

export default {
  name: 'Frog',
  blurb: 'The rainbow frog in glasses watches a fly all minute, and catches it at :58.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,

  frame(g, { fields: f, date, oled, night }) {
    const sec = f.sec, key = f.minuteKey % 997;
    oled.contrast(0xcf + (0x18 - 0xcf) * night);  // night dimming, 23:00-07:00 (ctx.night)

    // Hop on the hour, in the first 1.4 s.
    const hopU = f.m === 0 ? progress(sec, 0.1, 1.5) : 1;
    const hop = hopU < 1 ? Math.sin(Math.PI * hopU) : 0;
    const dy = -11 * hop;
    const breathe = 0.7 * Math.sin((date.getTime() / 1000) * 2 * Math.PI / 3.2);

    // The catch.
    const fly = flyAt(sec, key);
    const caught = fly && sec >= CATCH;
    const tongueOut = sec >= CATCH && sec < CATCH + REACH + HOLD + PULL;
    const swallowing = sec >= CATCH + REACH && sec < CATCH + REACH + HOLD + PULL + SWALLOW;

    drawLegs(g, dy, hop);
    drawBody(g, dy, breathe);
    drawLips(g, dy, tongueOut);

    // Eyes: follow the fly, blink now and then, squint while swallowing.
    let state = 'open';
    const blinkSlot = Math.floor(date.getTime() / 3700);
    if (noise(blinkSlot, 3) < 0.6 && (date.getTime() % 3700) < 160) state = 'shut';
    if (swallowing) state = 'happy';
    const target = fly ? [fly.x, fly.y] : [70, 30];  // eyes aim from the unshifted frog; 2 px makes no visible difference
    for (const lens of LENSES) {
      const c = { cx: lens.cx, cy: lens.cy + dy };
      const vx = target[0] - c.cx, vy = target[1] - c.cy, d = Math.hypot(vx, vy) || 1;
      drawLens(g, c, [(vx / d) * 1.4, (vy / d) * 1.4], state);
    }
    drawLashes(g, dy);
    // The frog walks its own slow orbit, out of step with the time's.
    const [fx, fy] = orbit(new Date(date.getTime() + 7 * 60000), 2, 5);
    g.shift(fx, fy);

    // Tongue and fly.
    const lipsAt = [LIPS.x + 5 + fx, LIPS.y + dy + 0.5 + fy];
    if (fly && !caught) drawFly(g, Math.round(fly.x), Math.round(fly.y), sec);
    if (tongueOut) {
      const grab = flyAt(CATCH, key);
      const u = sec < CATCH + REACH ? ease.outCubic(progress(sec, CATCH, CATCH + REACH))
        : sec < CATCH + REACH + HOLD ? 1 : 1 - ease.inCubic(progress(sec, CATCH + REACH + HOLD, CATCH + REACH + HOLD + PULL));
      const tip = [lipsAt[0] + (grab.x - lipsAt[0]) * u, lipsAt[1] + (grab.y - lipsAt[1]) * u];
      g.thickLine(lipsAt[0], lipsAt[1], tip[0], tip[1], 1.6);
      g.fillCircle(tip[0], tip[1], 1.8);
      if (sec >= CATCH + REACH) drawFly(g, Math.round(tip[0]) - 1, Math.round(tip[1]) - 1, sec);
    }

    // The time, walking a small orbit against burn-in.
    const [ox, oy] = orbit(date, 2, 3);
    strokeText(g, `${f.hh}:${f.mm}`, TIME_X + ox, TIME_Y + oy, { w: DIGIT.w, h: DIGIT.h, weight: DIGIT.weight, gap: DIGIT.gap, colonW: 3 });
    const date3 = `${f.dow} ${f.day} ${f.month}`;
    g.text(date3, TIME_X + ox + Math.round((68 - font3x5.measure(date3)) / 2), TIME_Y + oy + DIGIT.h + 4, { font: font3x5 });

    // The pond: a ripple line that drifts, broken where the seconds have got to.
    for (let x = 60; x < 128; x++) {
      const wave = Math.round(Math.sin(x * 0.45 + date.getTime() / 600) * 0.8);
      if ((x - 60) / 68 <= sec / 60) g.pixel(x, POND_Y + wave);
      else if (x % 3 === 0) g.pixel(x, POND_Y + wave);
    }
  },
};
