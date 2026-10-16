// ferriswheel: the sky behind the wheel and the midway in front of it, flat
// hard-pixel poster art, plus the hour's fireworks.

import { Gfx, hex, mix, hsv, rand, sprite, font3x5, clamp, sin as ksin } from '../js/kit.js';

// ---------------------------------------------------------------- sky

// [hour, top, middle, horizon]: the sky over the fair through the day. The
// fair is always lit; the day only tints the sky behind it.
const SKY = [
  [0, '#06071a', '#0e0e2c', '#2a1636'],
  [4.5, '#06071a', '#0e0e2c', '#2a1636'],
  [6, '#141c48', '#3a3466', '#b05a6a'],
  [8, '#16306a', '#2c5090', '#5a86bc'],
  [16, '#16306a', '#2c5090', '#5a86bc'],
  [18, '#1c1a52', '#46306e', '#e0703a'],
  [19.5, '#0e0c32', '#2a1a4c', '#7a2c50'],
  [21, '#06071a', '#0e0e2c', '#2a1636'],
  [24, '#06071a', '#0e0e2c', '#2a1636'],
].map(([h, ...c]) => [h, ...c.map(hex)]);

const STARS = Array.from({ length: 26 }, (_, i) => [rand(i, 1) * 160 | 0, rand(i, 2) * 52 | 0, rand(i, 3)]);

/** How dark the sky is (0 day, 1 night), for stars. */
function skyAt(hr) {
  let i = 0; while (i < SKY.length - 2 && hr >= SKY[i + 1][0]) i++;
  const a = SKY[i], b = SKY[i + 1], u = clamp((hr - a[0]) / (b[0] - a[0]), 0, 1);
  return [mix(a[1], b[1], u), mix(a[2], b[2], u), mix(a[3], b[3], u)];
}

export function drawSky(g, ctx) {
  const f = ctx.fields;
  const hr = f.h + f.m / 60 + f.sec / 3600;
  const [top, mid, hor] = skyAt(hr);
  g.gradient(0, 0, 160, 80, [[0, top], [0.45, mid], [0.85, hor], [1, hor]]);
  const dark = hr < 5 || hr > 20 ? 1 : hr < 6 ? 6 - hr : hr > 19 ? hr - 19 : 0;
  if (dark > 0) for (let i = 0; i < STARS.length; i++) {
    const [x, y, k] = STARS[i];
    const tw = 0.5 + 0.5 * ksin((f.m * 60 + f.sec) * (1 + k * 2) + i * 2.3);
    g.pixel(x, y, 0xd8d4ff, { a: dark * (0.25 + 0.5 * tw) * (1 - y / 70) });
  }
}

// ---------------------------------------------------------------- midway

const INK = hex('#100a1c');
const RED = hex('#d23a3a'), CREAM = hex('#f2e2c0'), TEAL = hex('#25a39a'), MUSTARD = hex('#e8b830');
const WARM = hex('#ffcf70'), WARM2 = hex('#f08a3a'), BOARD = hex('#7a1a2a');
const FAR = hex('#1c1230'), EMBER = hex('#5a2a20');

const PERSON = sprite(`
  ..##..
  .####.
  .####.
  ..##..
  .####.
  ######
  ######
  ######
  ######`, { '#': 0 });
const CHILD = sprite(`
  .##.
  ####
  .##.
  ####
  ####
  ####`, { '#': 0 });
const TEDDY = sprite(`
  #.#
  ###
  ###`, { '#': 0 });

// Walkers: [speed px/s (signed), phase, kind, tone]
const CROWD = Array.from({ length: 9 }, (_, i) => [
  (rand(i, 11) < 0.5 ? -1 : 1) * (2.2 + rand(i, 12) * 3.5), rand(i, 13) * 200, rand(i, 14) < 0.25 ? 1 : 0, rand(i, 15),
]);

/** A striped awning with a scalloped edge, from x0 to x1, top y. */
function awning(g, x0, x1, y, a, b, h = 3) {
  for (let x = x0; x < x1; x++) {
    const c = ((x - x0) >> 2) & 1 ? b : a;
    g.vline(x, y, h, c);
    const k = (x - x0) & 3;
    if (k === 1 || k === 2) g.pixel(x, y + h, c);
  }
}

/** A tent roof: a flat triangle from (x0..x1) at base y up to a peak. */
function roof(g, x0, x1, y, peak, a, b) {
  const mx = (x0 + x1) / 2;
  for (let x = x0; x < x1; x++) {
    const top = Math.round(peak + (y - peak) * Math.abs(x + 0.5 - mx) / ((x1 - x0) / 2));
    g.vline(x, top, y - top, ((x - x0) >> 2) & 1 ? b : a);
  }
}

// The stalls never change: drawn once into a 160x20 strip (6.4 KB) that each
// frame copies in, with a key colour for the sky showing through.
const KEY = 0xff00ff, Y0 = 60;
const STALLS = (() => {
  const g = new Gfx(160, 20);
  g.clear(KEY);
  const L = {
    fillRect: (x, y, w, h, c) => g.fillRect(x, y - Y0, w, h, c),
    vline: (x, y, h, c) => g.vline(x, y - Y0, h, c),
    pixel: (x, y, c) => g.pixel(x, y - Y0, c),
    blit: (s, x, y, op) => g.blit(s, x, y - Y0, op),
  };
  // Far tents and the fair's haze.
  L.fillRect(0, 66, 160, 14, FAR);
  for (const [x, w, h] of [[8, 14, 6], [30, 10, 5], [100, 12, 6], [126, 16, 7], [148, 10, 5]])
    for (let i = 0; i < w; i++) {
      const top = 66 - Math.round(h * (1 - Math.abs(i + 0.5 - w / 2) / (w / 2)));
      L.vline(x + i, top, 66 - top, FAR);
    }
  // Left stall: hoopla, red and cream, teddies on the shelf.
  roof(L, 2, 46, 68, 62, RED, CREAM);
  awning(L, 2, 46, 68, RED, CREAM);
  L.fillRect(3, 71, 42, 9, WARM2);
  L.fillRect(5, 72, 38, 5, WARM);
  for (let i = 0; i < 6; i++) L.blit(TEDDY, 7 + i * 6, 72, { c: hex('#8a4a2a') });
  L.fillRect(2, 77, 44, 3, BOARD);
  // Centre: the ticket booth.
  L.fillRect(60, 63, 40, 17, INK);
  L.fillRect(61, 64, 38, 8, BOARD);
  L.fillRect(68, 73, 24, 5, WARM);
  L.fillRect(70, 74, 3, 4, hex('#3a2030'));
  L.fillRect(64, 72, 32, 1, TEAL);
  // Right stall: coconut shy, teal and cream.
  roof(L, 114, 158, 68, 62, TEAL, CREAM);
  awning(L, 114, 158, 68, TEAL, CREAM);
  L.fillRect(115, 71, 42, 9, WARM2);
  L.fillRect(117, 72, 38, 5, WARM);
  for (let i = 0; i < 6; i++) L.vline(120 + i * 6 + 1, 74, 3, hex('#8a4a2a'));
  L.fillRect(114, 77, 44, 3, BOARD);
  return g;
})();

export function drawMidway(g, ctx) {
  const f = ctx.fields, sec = f.sec, t = f.h * 3600 + f.m * 60 + sec; // seconds into the day
  g.draw(STALLS, 0, Y0, { key: KEY });

  // Festoon lights, sagging between three poles.
  const poles = [-6, 52, 108, 166];
  for (let p = 1; p < 3; p++) g.vline(poles[p], 60, 20, INK);
  const fest = [hex('#ff4a3a'), hex('#ffc23a'), hex('#5ae06a'), hex('#4aa8ff'), hex('#ff6ad0')];
  for (let p = 0; p < 3; p++) {
    const xa = poles[p], xb = poles[p + 1];
    for (let x = xa; x <= xb; x++) {
      const u = (x - xa) / (xb - xa), y = 61 + Math.round(4 * 4 * u * (1 - u));
      if (x < 0 || x >= 160) continue;
      g.pixel(x, y, INK);
      if ((x - xa) % 5 === 2) {
        const n = (x - xa) / 5 | 0, ci = (n + p) % fest.length;
        const tw = ((Math.floor(sec * 3) + n + p) % 7) === 0 ? 0.35 : 1;
        g.pixel(x, y + 1, fest[ci], { a: tw });
      }
    }
  }

  // The booth's marquee: the date in bulbs, its border chasing.
  const date = `${f.dow} ${f.dd}`;
  const tw = (sec * 4) & 1;
  g.text(date, 80 - ((date.length * 4 - 1) >> 1), 65, { font: font3x5, c: MUSTARD });
  for (let x = 62; x < 99; x += 3) {
    const on = (((x / 3) | 0) + tw) & 1;
    g.pixel(x, 64, on ? WARM : EMBER);
    g.pixel(x, 71, on ? EMBER : WARM);
  }
  // Coconuts on their posts; one wobbles when a ball hits it, now and then.
  for (let i = 0; i < 6; i++) {
    const x = 120 + i * 6;
    const hit = (((t / 4) | 0) + i) % 6 === 0 ? ksin(t * 14) * 0.8 : 0;
    g.fillRect(x + Math.round(hit), 72, 3, 2, hex('#5a3418'));
  }

  // The crowd, walking both ways in front of everything.
  for (let i = 0; i < CROWD.length; i++) {
    const [v, ph, kind, tone] = CROWD[i];
    const x = ((ph + t * v) % 200 + 200) % 200 - 20;
    const bob = (Math.floor((t * Math.abs(v) + ph) / 2.5) & 1);
    const c = mix(INK, hex('#2a1a3a'), tone * 0.6);
    if (kind) {
      g.blit(CHILD, x, 75 - bob, { c });
      // a balloon on a string
      const bx = x + 3 + ksin(t * 1.3 + i) * 1.2, by = 64 + ksin(t * 0.9 + i);
      g.line(Math.round(x + 3), 75 - bob, Math.round(bx), Math.round(by + 3), hex('#a090b0'));
      g.fillEllipse(bx, by, 2, 2.5, [hex('#ff4a5a'), hex('#4ad0ff'), hex('#ffd23a')][i % 3], { aa: true });
    } else g.blit(PERSON, x, 72 - bob, { c });
  }
}

// ---------------------------------------------------------------- fireworks

const BURSTS = [
  [0.8, 16, 14, 0], [2.6, 146, 12, 50], [4.6, 24, 26, 200], [6.2, 138, 26, 300],
  [8.4, 12, 10, 120], [10.0, 150, 18, 30], [12.2, 20, 18, 270], [13.8, 140, 10, 180], [16.0, 80, 4, 50],
];

/** The hour's fireworks, `t` seconds after the hour; drawn behind the wheel. */
export function drawFireworks(g, t) {
  for (let b = 0; b < BURSTS.length; b++) {
    const [t0, cx, cy, hue] = BURSTS[b];
    const dt = t - t0;
    if (dt < -0.7 || dt > 2.2) continue;
    if (dt < 0) {           // the shell climbing
      const u = 1 + dt / 0.7;
      g.fillRect(cx, Math.round(66 - (66 - cy) * u), 1, 2, 0xffe8b0);
      continue;
    }
    const u = dt / 2.2, rad = 12 * (1 - (1 - Math.min(1, dt / 0.9)) ** 3);
    const fall = 5 * u * u, a = (1 - u) ** 1.3;
    const c = hsv(hue, 0.75, 1), core = mix(c, 0xffffff, 0.6 * (1 - u));
    for (let k = 0; k < 16; k++) {
      const ang = (k / 16) * Math.PI * 2 + b;
      const x = cx + Math.cos(ang) * rad, y = cy + Math.sin(ang) * rad * 0.9 + fall;
      g.pixel(x, y, core, { a });
      g.pixel(cx + Math.cos(ang) * rad * 0.7, cy + Math.sin(ang) * rad * 0.63 + fall * 0.8, c, { a: a * 0.5 });
    }
    if (dt < 0.25) g.fillCircle(cx, cy, 2.5, 0xffffff, { aa: true, a: 1 - dt / 0.25 });
  }
}
