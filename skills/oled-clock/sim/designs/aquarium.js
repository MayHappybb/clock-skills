// Aquarium — a fish tank, where the time is the rocks.
//
// Black water, the surface a rippling line along the top, a few specks
// drifting. On the sand stands the time as four big rocks shaped like digits:
// a lit rim, a lit ledge along every top edge where the light falls, speckled
// stone inside (the speckle is fixed to the glass, not to the rock, so it
// does not burn in with the shapes). The colon is two bubbles caught between
// them. Seaweed sways on the left; on the right an air stone bubbles and a
// treasure chest lifts its lid every 17 s to burp out a few big ones.
//
// Three species swim above: an angelfish (pixel art, two tail frames), a
// striped clownfish and a school of six neon tetras. Each swims a slow
// sinusoid wider than the tank, so they usually turn round off the glass;
// depth drifts on smooth noise.
//
// The minute turn is a school of fourteen minnows per changing digit. From
// :58.5 they stream in from the right and circle the old rock in a ring; the
// rock crumbles inside the ring; each fish then settles on its own point of
// the new digit's centre-line, so for a moment the school draws the digit,
// and the new rock is laid down under them before they peel away, up and
// out to the right (gone by about :01.2). On the hour a big mottled grouper
// comes through first, jaws working, and eats the whole old time from right to left; the
// school follows it in and builds all four digits.
//
// Everything is a function of the clock: fish and plants of absolute time,
// the event of the seconds either side of the turn (tau), so any instant
// renders on its own. The rocks walk a 1-pixel orbit, the sand's dither
// shifts each minute and the chest walks with the rocks.

import { Gfx, digitSegments, strokeDigit, sprite, ease, progress, smoothNoise, noise, orbit, lerp, dither, OFF, ON } from '../js/kit.js';

const W = 128, H = 64;
const SAND = 58;
const DIG = { w: 17, h: 30, weight: 6.2 };
const DIG_Y = 27;
const DIG_X = [20, 40, 71, 91];
const COLON_X = 64;
const T0 = 58.5, SPAN = 3.0;

/** Integer hash in [0,1) for per-pixel texture. */
const hash = (x, y, s = 0) => noise(x * 0.7131 + y * 13.17 + s * 3.1, 7.7);

// ------------------------------------------------------------ rocks

/** Mask of one digit's stroke, from an offscreen canvas. */
function digitMask(d, x, y) {
  const m = new Gfx(W, H);
  strokeDigit(m, d, x, y, DIG.w, DIG.h, { weight: DIG.weight });
  return m;
}

/**
 * Draw a digit as a rock: a lit rim, a brighter top edge where the light
 * falls, speckled stone inside. `show(x, y)` hides pixels (eaten, dissolved).
 */
function drawRock(g, m, show = () => true) {
  const at = (x, y) => m.get(x, y);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!at(x, y) || !show(x, y)) continue;
      const rim = !at(x - 1, y) || !at(x + 1, y) || !at(x, y - 1) || !at(x, y + 1);
      const top = !at(x, y - 2) || !at(x - 1, y - 2);
      const lit = rim || top || hash(x, y) < 0.34;
      g.pixel(x, y, lit ? ON : OFF);
    }
}

// ------------------------------------------------------------ fish

/** Draw a fish from a local-coordinate test: 0 none, 1 lit, 2 dark inside, a number < 1 a dither level. */
function drawFish(g, test, x, y, dir, box) {
  const L = (px, py) => test((px - x) * dir, py - y);
  const [bx0, by0, bw, bh] = box;
  const x0 = Math.floor(x - bw), x1 = Math.ceil(x + bw), y0 = Math.floor(y + by0), y1 = Math.ceil(y + by0 + bh);
  // keyline
  for (let py = y0 - 1; py <= y1 + 1; py++)
    for (let px = x0 - 1; px <= x1 + 1; px++) {
      const c = (a, b) => L(a + 0.5, b + 0.5);
      if (c(px, py) || c(px - 1, py) || c(px + 1, py) || c(px, py - 1) || c(px, py + 1)) g.pixel(px, py, OFF);
    }
  for (let py = y0; py <= y1; py++)
    for (let px = x0; px <= x1; px++) {
      const v = L(px + 0.5, py + 0.5);
      if (v === 1 || v === true) g.pixel(px, py, ON);
      else if (typeof v === 'number' && v > 0 && v < 1 && dither(px, py, v)) g.pixel(px, py, ON);
    }
}

const ellIn = (x, y, rx, ry) => (x / rx) ** 2 + (y / ry) ** 2 <= 1;

/** Clownfish: striped body, fan tail. */
function clown(wag) {
  return (lx, ly) => {
    const body = ellIn(lx, ly, 4.8, 2.7);
    const tl = -4.2 - lx, tailY = ly - wag * tl * 0.3;
    const tail = lx < -3.8 && lx > -7.2 && Math.abs(tailY) <= 0.5 + tl * 0.8;
    if (!body && !tail) return 0;
    if (tail) return 1;
    if (Math.abs(lx - 3.2) < 0.6 && Math.abs(ly + 0.7) < 0.6) return 2;
    const rim = !ellIn(lx, ly, 3.8, 1.8);
    if (rim) return 1;
    if (Math.abs(lx - 1.6) < 0.7 || Math.abs(lx + 1.2) < 0.7 || Math.abs(lx + 3.4) < 0.5) return 1;
    return 2;
  };
}

// Angelfish, facing right: a disc of a body with two bars and an eye, tall
// fins swept back, a fan tail. Two frames, for the tail beat.
const ANGEL = [sprite(`
  ..##.........
  ..###........
  ...###.......
  ...####......
  ....####.....
  ......####...
  #....#.#.##..
  ##..##.#.#.#.
  ######.#.####
  ##..##.#.###.
  #....#.#.##..
  ......####...
  ....####.....
  ...####......
  ...###.......
  ..###........
  ..##.........
`), sprite(`
  ...##........
  ..###........
  ..###........
  ...####......
  ....####.....
  ......####...
  .....#.#.##..
  .#..##.#.#.#.
  ######.#.####
  .#..##.#.###.
  .....#.#.##..
  ......####...
  ....####.....
  ...####......
  ..###........
  ..###........
  ...##........
`)];

/** A sprite fish centred on (x, y), with a dark keyline so it reads over anything. */
function blitFish(g, spr, x, y, dir) {
  const x0 = Math.round(x - spr.w / 2), y0 = Math.round(y - spr.h / 2);
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) g.blit(spr, x0 + dx, y0 + dy, { c: OFF, flipX: dir < 0 });
  g.blit(spr, x0, y0, { flipX: dir < 0 });
}

const TETRA = [sprite(`
  #.###.
  .#####
  #.###.
`), sprite(`
  ..###.
  ######
  ..###.
`)];

/** Where a back-and-forth swimmer is: x swings past the tank ends, so most turns happen off-glass. */
function swimmer(T, { period, amp, cx = 64, y, yAmp, seed }) {
  const ph = (2 * Math.PI * T) / period + seed;
  const x = cx + amp * Math.sin(ph);
  const dir = Math.cos(ph) >= 0 ? 1 : -1;
  const yy = y + yAmp * (smoothNoise(T / 7 + seed * 10, seed) - 0.5) * 2 + 0.6 * Math.sin(T * 1.7 + seed);
  return { x, y: yy, dir, speed: Math.abs(Math.cos(ph)) };
}

// ------------------------------------------------------------ scenery

/** Specks drifting in the water, for depth: a few single pixels, slowly. */
function drawMotes(g, T) {
  for (let i = 0; i < 9; i++) {
    const x = (noise(i, 21) * 140 + T * (0.6 + noise(i, 22))) % 140 - 6;
    const y = 6 + noise(i, 23) * 44 + Math.sin(T * 0.4 + i) * 3;
    if (Math.floor(T * 0.5 + i * 0.37) % 7 !== 0) g.pixel(x, y);
  }
}

function drawSurface(g, T) {
  for (let x = 0; x < W; x++) {
    const y = 1 + Math.round(Math.sin(x * 0.21 + T * 1.3) * 0.7 + Math.sin(x * 0.07 - T * 0.6) * 0.5);
    g.pixel(x, y);
  }
}

function sandTop(x) {
  return SAND + Math.round(Math.sin(x * 0.11 + 1) * 0.9 + Math.sin(x * 0.31) * 0.5);
}

function drawSand(g, shift) {
  for (let x = 0; x < W; x++) {
    const top = sandTop(x);
    for (let y = top; y < H; y++) {
      if (y === top) { g.pixel(x, y); continue; }
      const lvl = 0.12 + (y - top) * 0.05;
      g.pixel(x, y, dither(x + shift, y, lvl) ? ON : OFF);
    }
  }
}

/** A strand of seaweed: a swaying stem with blades in pairs, thinning to the tip. */
function drawWeed(g, T, base, height, seed) {
  const pts = [];
  for (let i = 0; i <= height; i++) {
    const u = i / height;
    const sway = Math.sin(T * 0.9 + seed - i * 0.16) * 2.6 * u ** 1.4 + Math.sin(T * 0.37 + seed * 3) * u * 1.2;
    pts.push([base + sway, SAND + 0.5 - i]);
  }
  for (let i = 1; i < pts.length; i++) {
    const u = i / pts.length;
    g.thickLine(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], u < 0.5 ? 1.8 : 1.2);
  }
  for (let i = 4; i < pts.length - 2; i += 4) {
    const s = (i / 4) % 2 ? 1 : -1, [x, y] = pts[i];
    const lean = pts[Math.min(i + 3, pts.length - 1)][0] - x;
    const len = 4.5 * (1 - (i / pts.length) * 0.5);
    g.thickLine(x, y, x + s * len * 0.8 + lean * 0.6, y - len * 0.7, 1.3);
  }
}

// The treasure chest: a box with a strap and lock, and a lid that lifts.
const CHEST = sprite(`
  ############
  #....##....#
  #....##....#
  #..........#
  ############
`);
const LID = sprite(`
  ..########..
  .#........#.
  ############
`);
const CHEST_EVERY = 17, CHEST_OPEN = 1.6;

/** How far the lid is up, 0..1, at time T: it burps every CHEST_EVERY seconds. */
function lidAt(T) {
  const u = (T % CHEST_EVERY) / CHEST_OPEN;
  return u >= 1 ? 0 : Math.sin(Math.PI * u) ** 0.5;
}

function drawChest(g, x, y, open) {
  const dy = Math.round(open * 3);
  g.fillRect(x - 1, y - 1 - dy, 14, 10 + dy, OFF);
  g.blit(CHEST, x, y + 3);
  if (dy > 0) {
    // Gold inside: a row of glints in the gap.
    for (let i = 0; i < 5; i++) g.pixel(x + 2 + i * 2, y + 2 - ((i % 2) ? 1 : 0));
  }
  g.blit(LID, x, y - dy);
}

function bubble(g, x, y, r) {
  if (r < 1) { g.pixel(x, y); return; }
  if (r < 1.5) {
    g.pixel(x - 1, y).pixel(x + 1, y).pixel(x, y - 1).pixel(x, y + 1);
    return;
  }
  g.fillCircle(x + 0.5, y + 0.5, r + 0.6, OFF);
  g.circle(x, y, r);
  g.pixel(x - 1, y - 1);
}

// ------------------------------------------------------------ the school event

/** N points spaced evenly along a digit's centre-line. */
function samplePoints(d, x, y, n) {
  const segs = digitSegments(String(d), x, y, DIG.w, DIG.h, DIG.weight);
  const lens = segs.map((s) => Math.hypot(s[2] - s[0], s[3] - s[1]));
  const total = lens.reduce((a, b) => a + b, 0);
  const out = [];
  for (let k = 0; k < n; k++) {
    let at = (total * (k + 0.5)) / n, i = 0;
    while (i < segs.length - 1 && at > lens[i]) { at -= lens[i]; i++; }
    const u = lens[i] ? at / lens[i] : 0, s = segs[i];
    out.push([s[0] + (s[2] - s[0]) * u, s[1] + (s[3] - s[1]) * u]);
  }
  return out;
}

const N_FISH = 14;
const RING = { rx: 12.5, ry: 18 };

/**
 * School fish i (of N_FISH) building digit k, at transition time tau:
 * streams in from the right, circles the old rock as a ring, then each fish
 * settles on its own point of the new digit's centre-line, then peels away.
 */
function schoolFish(i, k, tau, to, centre, spin, hour) {
  const lag = i * 0.025 + k * 0.08;
  const ring = (tt) => {
    const a = (2 * Math.PI * i) / N_FISH + spin * tt * 3.6;
    return [centre[0] + RING.rx * Math.cos(a), centre[1] + RING.ry * Math.sin(a)];
  };
  const start = [138 + i * 3 + k * 6, 6 + ((i * 7) % 12)];
  let p;
  if (hour) {
    // On the hour they follow the big fish in and go straight to the digit.
    const u = ease.inOutCubic(progress(tau, 0.9 + lag, 1.9 + lag));
    p = [lerp(start[0], to[0], u), lerp(start[1], to[1], u) + Math.sin(u * Math.PI) * 6];
  } else if (tau < 1.25) {
    const u = ease.outCubic(progress(tau, lag, 0.75 + lag));
    const r = ring(tau);
    p = [lerp(start[0], r[0], u), lerp(start[1], r[1], u)];
  } else {
    const u = ease.inOutCubic(progress(tau, 1.25 + lag * 0.5, 1.85 + lag * 0.5));
    const r = ring(tau);
    p = [lerp(r[0], to[0], u), lerp(r[1], to[1], u)];
  }
  // Peel away up and out to the right, one after another, clear of the other digits.
  const out = ease.inQuad(progress(tau, 2.1 + i * 0.02, 2.6 + i * 0.02));
  return [p[0] + out * (40 + 30 * noise(i, 8)), p[1] - out * (45 + 10 * noise(i, 9))];
}

/** A minnow pointing along `angle` (radians, 0 = right). */
function minnow(g, x, y, angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  const test = (px, py) => {
    const dx = px - x, dy = py - y;
    const lx = c * dx + s * dy, ly = -s * dx + c * dy;
    if ((lx / 2.1) ** 2 + (ly / 1.05) ** 2 <= 1) return true;
    const tl = -1.6 - lx;
    return tl > 0 && tl < 1.9 && Math.abs(ly) <= 0.25 + tl * 0.6;
  };
  const box = [x - 5, y - 5, 10, 10];
  g.fillWhere((px, py) => test(px, py) || test(px - 1, py) || test(px + 1, py) || test(px, py - 1) || test(px, py + 1), OFF, box);
  g.fillWhere(test, ON, box);
}

/** The grouper that comes through on the hour: big, mottled, jaws working. */
function grouper(chomp) {
  const gape = 0.3 + 3.2 * chomp;
  const shape = (lx, ly) => {
    const body = ellIn(lx, ly, 14, 8);
    const tl = -12.5 - lx;
    const tail = lx < -11 && lx > -19 && Math.abs(ly) <= 1.2 + tl * 0.95 && !(lx < -17 && Math.abs(ly) < 2.5);
    const dorsal = ly < -5 && ly > -11 && lx > -9 && lx < 4 && ly > -11 + Math.abs(lx + 3) * 0.5;
    const pelvic = ly > 5 && ly < 10 && lx > -3 && lx < 2 && ly < 10 - Math.abs(lx + 0.5) * 1.2;
    if (!body && !tail && !dorsal && !pelvic) return false;
    return true;
  };
  // Jaws: a dark wedge at the front that opens and shuts, with lit lips.
  const mouth = (lx, ly) => lx > 5 && Math.abs(ly - 1.5) < (lx - 5) * gape / 9;
  return (lx, ly) => {
    if (!shape(lx, ly)) return 0;
    if (mouth(lx, ly)) return ellIn(lx, ly, 13, 7) ? 2 : 0;
    if (mouth(lx - 1, ly) || mouth(lx + 1, ly) || mouth(lx, ly - 1) || mouth(lx, ly + 1)) return 1;
    const ed = Math.hypot(lx - 7, ly + 3);
    if (ed < 1.1) return 2;
    if (ed < 2.4) return 1;
    if (ed < 3.2) return 2;
    if (!(shape(lx - 1, ly) && shape(lx + 1, ly) && shape(lx, ly - 1) && shape(lx, ly + 1))) return 1;
    if (Math.abs(lx - 2.5) < 0.5 && Math.abs(ly) < 5.5) return 1; // gill line
    if (Math.abs(lx - 3.5) < 0.6 && Math.abs(ly) < 5.5) return 2;
    // Mottling: dark blotches on a lit body, sparser on the belly.
    const bx = Math.floor((lx + 20) / 3), by = Math.floor((ly + 12) / 3);
    const cxs = bx * 3 - 20 + 1.5 + (noise(bx * 7 + by, 12) - 0.5) * 1.5, cys = by * 3 - 12 + 1.5 + (noise(bx + by * 5, 13) - 0.5) * 1.5;
    if (ly < 4 && noise(bx * 7 + by * 31, 11) < 0.55 && Math.hypot(lx - cxs, ly - cys) < 1.0) return 2;
    return 1;
  };
}

export default {
  name: 'Aquarium',
  blurb: 'A fish tank: the time is rocks on the sand, and at the minute a school swirls and rebuilds it.',
  module: '096-128x64',
  colour: 'blue',
  bus: 'spi10',
  fps: 60,

  frame(g, { fields: f, date, kit }) {
    const T = date.getTime() / 1000;
    const sec = f.sec;
    const [ox, oy] = orbit(date, 1, 3);

    // The transition window straddles the minute.
    const tau = sec >= T0 ? sec - T0 : sec < SPAN - (60 - T0) ? sec + 60 - T0 : null;
    const oldF = tau === null ? f : sec >= T0 ? f : kit.previousMinute(date);
    const newF = tau === null ? f : sec >= T0 ? kit.clockFields(new Date(date.getTime() + 60000)) : f;
    const oldS = oldF.hh + oldF.mm, newS = newF.hh + newF.mm;
    const hour = tau !== null && newF.m === 0;

    drawMotes(g, T);
    drawSurface(g, T);
    drawWeed(g, T, 5, 36, 0.0);
    drawWeed(g, T, 11, 25, 1.3);
    drawWeed(g, T, 16, 15, 2.6);
    drawWeed(g, T, 124, 33, 2.1);
    drawWeed(g, T, 113, 20, 3.4);

    // Rocks. A changing digit crumbles inside the ring of fish; the new
    // one is laid down where they settle. On the hour the grouper eats the
    // old time as its jaws pass over it.
    const gxAt = hour && tau !== null ? 160 - 230 * progress(tau, 0, 2.0) - 13 : -1e9;
    for (let k = 0; k < 4; k++) {
      const x = DIG_X[k] + ox, y = DIG_Y + oy;
      const changing = tau !== null && (hour || oldS[k] !== newS[k]);
      if (!changing) { drawRock(g, digitMask(newS[k], x, y)); continue; }
      if (hour) {
        if (tau < 2.0) drawRock(g, digitMask(oldS[k], x, y), (px) => px < gxAt);
      } else if (tau < 1.4) {
        const u = progress(tau, 0.75, 1.35);
        drawRock(g, digitMask(oldS[k], x, y), (px, py) => hash(px, py, 2) >= u);
      }
      const r0 = hour ? 1.8 + k * 0.08 : 1.6;
      if (tau > r0) {
        const u = progress(tau, r0, r0 + 0.45);
        drawRock(g, digitMask(newS[k], x, y), (px, py) => hash(px, py, 3) < u);
      }
    }
    // The colon: two bubbles caught under the rocks' arch, bobbing.
    for (const [i, yy] of [[0, 35], [1, 47]]) bubble(g, COLON_X + ox, yy + oy + Math.round(Math.sin(T * 2 + i * 2) * 0.8), 2);

    drawSand(g, (f.minuteKey % 8));
    const chestX = ox;
    drawChest(g, 113 + chestX, 52, lidAt(T));

    // Fish.
    const cl = swimmer(T, { period: 31, amp: 70, y: 14, yAmp: 6, seed: 1.1 });
    drawFish(g, clown(Math.sin(T * 9)), cl.x, cl.y, cl.dir, [0, -4, 9, 8]);
    const an = swimmer(T, { period: 47, amp: 52, y: 15, yAmp: 4, seed: 4.2 });
    blitFish(g, ANGEL[Math.floor(T * 3) % 2], an.x, an.y, an.dir);
    const lead = swimmer(T, { period: 23, amp: 74, y: 8, yAmp: 3, seed: 2.7 });
    for (let i = 0; i < 6; i++) {
      const fx = lead.x - lead.dir * (i % 3) * 7 - lead.dir * Math.floor(i / 3) * 3 + 2 * Math.sin(T * 1.3 + i);
      const fy = lead.y + (Math.floor(i / 3) * 4 - 2) + Math.sin(T * 2 + i * 1.7);
      const spr = TETRA[Math.floor(T * 6 + i) % 2];
      g.blit(spr, fx - 3, fy - 1, { flipX: lead.dir < 0 });
    }

    // Bubbles: a steady stream from an air stone behind the chest, and a
    // burst of big ones each time the lid lifts.
    for (let i = 0; i < 6; i++) {
      const age = (T + i * 1.7) % 10.2;
      const y = 49 - age * 5;
      if (y < 3) continue;
      bubble(g, Math.round(123 + Math.sin(age * 3 + i) * 1.2), Math.round(y), age < 1.2 ? 0.5 : age < 4 ? 1 : 2);
    }
    const burst = T % CHEST_EVERY;
    for (let i = 0; i < 3; i++) {
      const age = burst - 0.5 - i * 0.3;
      if (age < 0) continue;
      const y = 50 - age * (9 + i * 2) - age * age * 1.5;
      if (y < 3) continue;
      bubble(g, Math.round(118 + chestX + i * 1.5 + Math.sin(age * 4 + i * 2) * 1.5), Math.round(y), age < 0.3 ? 1 : 2);
    }

    // The school, and on the hour the grouper ahead of it.
    if (hour && tau !== null && tau < 2.2) {
      const gx = 160 - 230 * progress(tau, 0, 2.0);
      const chomp = Math.abs(Math.sin(tau * 9));
      drawFish(g, grouper(chomp), gx, 41 + oy + Math.sin(tau * 3) * 2, -1, [0, -12, 21, 24]);
    }
    if (tau !== null && tau < 3) {
      for (let k = 0; k < 4; k++) {
        if (!hour && oldS[k] === newS[k]) continue;
        const x = DIG_X[k] + ox, y = DIG_Y + oy;
        const B = samplePoints(newS[k], x, y, N_FISH);
        const c = [x + DIG.w / 2, y + DIG.h / 2];
        for (let i = 0; i < N_FISH; i++) {
          const p = schoolFish(i, k, tau, B[i], c, -1, hour);
          const q = schoolFish(i, k, tau - 0.04, B[i], c, -1, hour);
          if (Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.02 && tau > 1.5 && tau < 2.2) {
            minnow(g, p[0], p[1], Math.PI + 0.3 * Math.sin(tau * 12 + i));
          } else minnow(g, p[0], p[1], Math.atan2(p[1] - q[1], p[0] - q[0]));
        }
      }
    }
  },
};
