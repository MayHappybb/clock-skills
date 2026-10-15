// Kit-Cat — the cat wall clock, ticking on an OLED.
//
// The Kit-Cat Klock is a black Art Deco cat whose eyes roll side to side
// while its tail swings below like a pendulum. Here it stands in the middle
// of the panel at full height, with the hours on its left and the minutes on
// its right, so its eyes read the time back and forth as they roll.
//
// A black cat on a black screen is drawn the way the real one reads on a
// wall: by its outline and its white parts. The head, ears and body are a
// one-pixel lit rim with nothing inside; the white features (eyes, muzzle,
// bow tie, feet) are solid, each with a dark keyline so they stay separate
// shapes. The muzzle is pixel art. The belly carries an analog dial with
// real hour and minute hands.
//
// The swing is cos(pi * sec): one beat a second, at rest for an instant at
// each end exactly on the whole second, fastest through the middle, as a
// pendulum does. The tail and the eyes are on one lever, so the pupils roll
// the opposite way to the tail tip.
//
// On the minute: the new digit drops in from above with a little overshoot,
// the cat gives a slow wink and its left ear twitches. On the hour it yawns
// instead: ears back, eyes squeezed to > <, the muzzle drops open on a dark
// mouth with a tongue and two fangs. Now and then it blinks. All of it is
// worked out from the clock fields, so any instant renders on its own.
//
// Burn-in: the cat walks a 2-pixel orbit sideways (it fills the height, so
// only a pixel down), the digits a 1-pixel orbit of their own, and the eyes
// and tail never stop.

import { strokeDigit, font3x5, sprite, ease, progress, noise, orbit, polar, clamp, OFF, ON } from '../js/kit.js';

const CX = 64;
const D = { w: 16, h: 34, weight: 4.6, gap: 3 };
const DY = 9;

/** A black shape on black: only its 1-pixel rim is lit. */
function outline(g, inside, box) {
  g.fillWhere((x, y) => inside(x, y) && !(inside(x - 1, y) && inside(x + 1, y) && inside(x, y - 1) && inside(x, y + 1)), ON, box);
}

/** Clear a 1-pixel keyline round a shape, so a lit feature stays its own shape. */
function keyline(g, inside, box) {
  g.fillWhere((x, y) => inside(x, y) || inside(x - 1, y) || inside(x + 1, y) || inside(x, y - 1) || inside(x, y + 1), OFF, box);
}

function triTest(a, b, c) {
  return (x, y) => {
    const s = (p, q) => (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0]);
    const d1 = s(a, b), d2 = s(b, c), d3 = s(c, a);
    return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
  };
}
const ell = (cx, cy, rx, ry) => (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
const sup = (cx, cy, rx, ry, p) => (x, y) => Math.abs((x - cx) / rx) ** p + Math.abs((y - cy) / ry) ** p <= 1;

const MUZZLE = sprite(`
  .######....######.
  ########..########
  ########..########
  #######.##.#######
  ###.##.####.##.###
  ####..######..####
  .################.
  ...############...
`);

// Squeezed shut, for the yawn: > and <.
const SQUEEZE = sprite(`
  ##.....
  .###...
  ...###.
  .###...
  ##.....
`);

const BOW = sprite(`
  ##...........##
  ####.......####
  #####.###.#####
  #####.###.#####
  #####.###.#####
  ####.......####
  ##...........##
`);

function drawCat(g, cx, { swing, lidL, lidR, earL: eL = [0, 0], earR: eR = [0, 0], yawn = 0 }) {
  const head = sup(cx, 14, 19, 11, 3);
  const earL = triTest([cx - 18.5, 9], [cx - 15.5 - eL[0], 0 + eL[1]], [cx - 7.5, 6]);
  const earR = triTest([cx + 18.5, 9], [cx + 15.5 + eR[0], 0 + eR[1]], [cx + 7.5, 6]);
  const body = sup(cx, 38, 12.5, 12.5, 2.6);
  // Tail, behind the body: a tapered pendulum.
  const a = 0.40 * swing;
  const [tx, ty] = polar(cx, 44, 18, Math.PI + a);
  const tail = (x, y) => {
    const dx = tx - cx, dy = ty - 44, L2 = dx * dx + dy * dy;
    const u = clamp(((x - cx) * dx + (y - 44) * dy) / L2, 0, 1);
    const d = Math.hypot(x - cx - u * dx, y - 44 - u * dy);
    return d <= 1.9 - 0.5 * u || Math.hypot(x - tx, y - ty) <= 2.1;
  };
  g.fillWhere(tail, ON, [cx - 14, 40, 28, 24]);
  outline(g, (x, y) => head(x, y) || earL(x, y) || earR(x, y) || body(x, y), [cx - 20, 0, 40, 52]);

  // Eyes: big whites with a keyline, pupils that roll with the tail.
  for (const [ex, lid] of [[cx - 8, lidL], [cx + 8, lidR]]) {
    const ey = 10.5, rx = 6.5, ry = 6;
    const eye = ell(ex, ey, rx, ry);
    const box = [ex - 8, ey - 8, 16, 16];
    keyline(g, eye, box);
    const top = ey - ry + 1.6 + lid * 2 * ry;
    g.fillWhere((x, y) => eye(x, y) && y >= top, ON, box);
    const px = ex + 2.4 * swing;
    g.fillWhere((x, y) => eye(x, y) && y >= top && ell(px, ey + 0.8, 2.6, 4.4)(x, y), OFF, box);
    // Glint, riding on the pupil.
    if (lid < 0.45) g.pixel(Math.floor(px) - 1, Math.max(Math.ceil(top), ey - 2), ON);
    // Shut: the line of the lid, curved like a smile.
    if (lid >= 0.85) {
      if (yawn > 0) g.blit(SQUEEZE, Math.round(ex) - 3, ey - 2, { flipX: ex > cx });
      else for (let i = -5; i <= 5; i++) g.pixel(Math.floor(ex + i), Math.round(ey + 2 - 0.08 * (25 - i * i)), ON);
    }
  }
  // Muzzle: pixel art, then the yawn opens it.
  if (yawn <= 0) {
    keyline(g, (x, y) => x >= cx - 9 && x < cx + 9 && y >= 16 && y < 24, [cx - 11, 14, 22, 12]);
    g.blit(MUZZLE, cx - 9, 16);
  } else {
    // Yawning: the muzzle drops open round a dark mouth, tongue and two fangs.
    const mry = 1 + 3.6 * yawn, my = 18.6 + mry * 0.6, mrx = 2.6 + 2.4 * yawn;
    const shape = (x, y) => ell(cx - 4, 19.8, 5, 3.8)(x, y) || ell(cx + 4, 19.8, 5, 3.8)(x, y) || ell(cx, my, mrx + 2, mry + 2)(x, y);
    keyline(g, shape, [cx - 11, 13, 22, 18]);
    g.fillWhere(shape, ON, [cx - 11, 13, 22, 18]);
    g.fillEllipse(cx, my, mrx, mry, OFF);
    g.fillWhere((x, y) => ell(cx, my, mrx, mry)(x, y) && ell(cx, my + mry, mrx * 0.7, mry * 0.55)(x, y), ON, [cx - 8, 13, 16, 18]);
    if (yawn > 0.5) g.pixel(cx - 3, Math.round(my - mry + 1)).pixel(cx + 2, Math.round(my - mry + 1));
    g.fillRect(cx - 2, 16, 4, 1, OFF);
    g.fillRect(cx - 1, 17, 2, 1, OFF);
  }
  // Whiskers, outside the head.
  for (const s of [-1, 1]) {
    for (const [y0, y1] of [[17, 15], [19.5, 19.5], [22, 24]]) g.line(cx + s * 19 - (s < 0 ? 1 : 0), y0, cx + s * 24 - (s < 0 ? 1 : 0), y1);
  }
  // Bow tie
  keyline(g, (x, y) => x >= cx - 7 && x < cx + 8 && y >= 26 && y < 33, [cx - 9, 24, 18, 11]);
  g.blit(BOW, cx - 7, 26);
  // Clock face
  keyline(g, ell(cx, 39, 8.5, 8.5), [cx - 11, 28, 22, 22]);
  g.ring(cx, 39, 7.3, 8.5);
  // Feet
  for (const s of [-1, 1]) {
    keyline(g, ell(cx + s * 6, 50.5, 4, 2.2), [cx + s * 6 - 6, 46, 12, 8]);
    g.fillEllipse(cx + s * 6, 50.5, 4, 2.2);
  }
}

export default {
  name: 'Kit-Cat',
  blurb: 'The Kit-Cat Klock: eyes and tail tick side to side once a second.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,

  frame(g, { fields: f, date, kit }) {
    const sec = f.sec;
    const swing = Math.cos(Math.PI * sec);
    const key = f.minuteKey;
    const hourTurn = f.m === 0;

    // Lids: a slow wink on the minute, a yawn on the hour, a blink now and then.
    let lidL = 0, lidR = 0, yawn = 0, earL = [0, 0], earR = [0, 0];
    const bump = (a, b, c, d) => (sec < a || sec > d ? 0 : sec < b ? ease.inOutQuad(progress(sec, a, b)) : sec < c ? 1 : 1 - ease.inOutQuad(progress(sec, c, d)));
    if (hourTurn) {
      yawn = bump(0.2, 1.0, 2.4, 3.2);
      lidL = lidR = Math.min(1, yawn * 1.4);
      earL = earR = [1.2 * yawn, 1 * yawn];
    } else {
      lidR = bump(0.05, 0.35, 0.9, 1.3);
      const tw = progress(sec, 0.1, 0.7);
      if (tw > 0 && tw < 1) earL = [Math.sin(tw * Math.PI * 4) * 1.5 * (1 - tw), Math.abs(Math.sin(tw * Math.PI * 4)) * 1.2];
    }
    const slot = Math.floor(sec / 4.3), into = sec - slot * 4.3;
    if (sec > 3 && sec < 57 && noise(slot, key % 9973) < 0.5 && into < 0.18) lidL = lidR = 1;

    const [cx2, cy2] = orbit(date, 2, 2);
    drawCat(g, CX, { swing, lidL, lidR, earL, earR, yawn });
    const hc = [CX, 39];
    const ha = ((f.h % 12) + f.m / 60) / 12 * 2 * Math.PI, ma = (f.m + sec / 60) / 60 * 2 * Math.PI;
    for (let i = 0; i < 12; i += 3) { const [x, y] = polar(hc[0], hc[1], 5.6, i / 12 * 2 * Math.PI); g.pixel(x, y); }
    const [hx, hy] = polar(hc[0], hc[1], 3.6, ha);
    const [mx, my] = polar(hc[0], hc[1], 5.4, ma);
    g.thickLine(hc[0], hc[1], hx, hy, 1.8);
    g.thickLine(hc[0], hc[1], mx, my, 1.2);
    // The cat fills the height, so it only walks down a pixel, never up.
    g.shift(cx2, cy2 > 0 ? 1 : 0);
    const [ox, oy] = orbit(date, 1, 3);

    // The time either side of the cat: hours on its left, minutes on its right,
    // so its eyes read them alternately. A changed digit drops in from above.
    const prev = kit.previousMinute(date);
    const drop = progress(sec, 0, 0.45);
    const digit = (now, was, x) => {
      g.clip(x - 1, DY - 1 + oy, D.w + 2, D.h + 6);
      if (now === was || drop >= 1) strokeDigit(g, now, x, DY + oy, D.w, D.h, { weight: D.weight });
      else {
        const u = ease.outBack(drop);
        strokeDigit(g, was, x, DY + oy + u * (D.h + 4), D.w, D.h, { weight: D.weight });
        strokeDigit(g, now, x, DY + oy + (u - 1) * (D.h + 4), D.w, D.h, { weight: D.weight });
      }
      g.unclip();
    };
    const XS = [2 + ox, 2 + D.w + D.gap + ox, 91 + ox, 91 + D.w + D.gap + ox];
    const now = f.hh + f.mm, was = prev.hh + prev.mm;
    for (let i = 0; i < 4; i++) digit(now[i], was[i], XS[i]);
    const left = f.dow, right = `${f.day} ${f.month}`;
    g.text(left, XS[0] + Math.round((2 * D.w + D.gap - font3x5.measure(left)) / 2), DY + D.h + 6 + oy, { font: font3x5 });
    g.text(right, XS[2] + Math.round((2 * D.w + D.gap - font3x5.measure(right)) / 2), DY + D.h + 6 + oy, { font: font3x5 });

  },
};
