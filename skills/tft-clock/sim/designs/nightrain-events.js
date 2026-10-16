// nightrain events: what the line throws at the window. Every minute turns
// behind something that hides the whole view for a moment (a tunnel, or a
// freight train coming the other way), so the valley that carries the time
// can be a new one when it clears. Every hour the train stops at a station
// whose clocks tell the time while the view is hidden. In between, a level
// crossing or a little halt may flash past.
import { hex, mix, rand, clamp, font5x7, polar } from '../js/kit.js';
import { W, H, NEAR, MID, PATCHES, HOP, lamp, splat } from './nightrain-world.js';

// ------------------------------------------------------------ which event, when

/** The minute turn in progress, if any: { kind: 'tunnel'|'freight', u } with u seconds from :00. */
export function turnAt(J, minuteKey) {
  let u, key, newMin;
  if (J.s >= 57) { u = J.s - 60; key = minuteKey + 1; newMin = (J.m + 1) % 60; }
  else if (J.s < 3) { u = J.s; key = minuteKey; newMin = J.m; }
  else return null;
  if (newMin === 0) return null;          // the hour has its station instead
  return { kind: rand(key, 1, 303) < 0.5 ? 'tunnel' : 'freight', u, key };
}

/** The hour's station, if in view: R is the distance still to run to the stop (negative once past). */
export function stationAt(J) {
  if (J.sih >= 3586) return { R: HOP - (J.X - J.h * HOP), name: (J.h + 1) % 24 };
  if (J.sih < 26) return { R: -(J.X - J.h * HOP), name: J.h };
  return null;
}

/** The small things of this minute: a level crossing and/or a halt, at the second they pass. */
export function sightsAt(minuteKey, J) {
  const out = [];
  if (J.v < 1 || J.sih < 30 || J.sih > 3560) return out;
  if (rand(minuteKey, 22, 303) < 0.55) out.push({ kind: 'crossing', at: 12 + 18 * rand(minuteKey, 21, 303) });
  if (rand(minuteKey, 24, 303) < 0.45) out.push({ kind: 'halt', at: 38 + 12 * rand(minuteKey, 23, 303) });
  return out.filter((e) => Math.abs(e.at - J.s) < 1.2);
}

// ------------------------------------------------------------ tunnel

const U_IN = -1.75, U_OUT = 1.05;

/** The screen span the tunnel covers at u: [a, b], or null. */
export function tunnelSpan(u) {
  const e = W - NEAR * (u - U_IN), x = W - NEAR * (u - U_OUT);
  const a = Math.max(0, e), b = Math.min(W, x);
  return b > a ? [a, b, e, x] : null;
}

export function drawTunnel(g, span, T) {
  const [a, b, e, x] = span;
  const ia = Math.floor(a), ib = Math.ceil(b);
  g.clip(ia, 0, ib - ia, H);
  g.fillRect(0, 0, W, H, 0x040405);
  const off = T * NEAR;
  // Our windows' light on the wall rushing past: soot streaks, cables, refuges.
  for (const [px, pw] of PATCHES) {
    g.clip(px, 16, pw, 60);
    for (let y = 16; y < 76; y++) {
      const edge = Math.min(y - 16, 75 - y);
      const lit = Math.min(1, edge / 5) * (0.55 + 0.45 * rand(y, 5, 9));
      g.fillRect(px, y, pw, 1, mix(0x060504, 0x3a2a18, lit));
    }
    for (const cy of [48, 51, 54]) g.fillRect(px, cy, pw, 1, 0x5a4630);
    // Refuges in the wall every so often: dark recesses.
    const per = 230, k0 = Math.floor((off + px) / per);
    for (let k = k0; k <= k0 + 1; k++) {
      const rx = k * per - off;
      g.fillRect(rx, 22, 12, 50, 0x050405, { a: 0.85 });
    }
    g.unclip();
  }
  // Tunnel lamps, each a short orange streak.
  const lp = 190, k0 = Math.floor(off / lp);
  for (let k = k0; k <= k0 + 2; k++) {
    const lx = k * lp - off + 30;
    g.fillRect(lx - 6, 30, 14, 2, 0xffb04a, { a: 0.9 });
    g.fillRect(lx - 9, 28, 20, 6, 0xff9a30, { a: 0.18 });
  }
  g.unclip();
  // The portal faces: stone lit by our windows, flicking by.
  for (const [px0, px1] of [[e - 10, e], [x, x + 10]]) {
    if (px1 < 0 || px0 > W) continue;
    g.fillRect(px0, 0, 10, H, 0x2c2622);
    g.fillRect(px0, 0, 10, 12, 0x3a322a);
    for (let y = 14; y < H; y += 9) g.fillRect(px0, y, 10, 1, 0x16120f);
  }
}

// ------------------------------------------------------------ freight

const U_F = -1.6, F_SPEED = 520, F_LEN = 1520;
const BOXES = ['#7a3324', '#2c4a6e', '#5a6168', '#2f5a3a', '#8a6a2a', '#5a2a4a', '#3a3a40'].map(hex);
const BRANDS = ['NORDLINE', 'KESTREL', 'TRANSIT', 'OSTRAVA', 'MERIDIAN', 'ALBATROSS'];

export function freightSpan(u) {
  const f = W - F_SPEED * (u - U_F);
  const a = Math.max(0, f), b = Math.min(W, f + F_LEN);
  return b > a ? [a, b, f] : null;
}

/** Draw a box lit dimly, brighter where our windows' light falls on it. */
function litBox(g, x, y, w, h, c) {
  g.fillRect(x, y, w, h, mix(c, 0x000000, 0.72));
  for (const [px, pw] of PATCHES) {
    const x0 = Math.max(x, px), x1 = Math.min(x + w, px + pw);
    if (x1 > x0) g.fillRect(x0, Math.max(y, 14), x1 - x0, Math.min(y + h, 74) - Math.max(y, 14), mix(c, 0xffd8a0, 0.12), { a: 0.85 });
  }
}

export function drawFreight(g, span, key) {
  const [, , f] = span;
  // The locomotive: red, a yellow nose, a lit cab, headlights blazing.
  const lx = Math.round(f);
  if (lx < W && lx + 74 > 0) {
    litBox(g, lx, 6, 74, 60, 0x9a2a1e);
    g.fillRect(lx, 6, 8, 60, 0xd8b030);
    g.fillRect(lx + 10, 13, 18, 11, 0x2a3a30);
    g.fillRect(lx + 11, 14, 16, 4, 0x6a8a70, { a: 0.6 });
    g.fillRect(lx, 64, 74, 10, 0x0a0a0b);
    for (const hy of [56, 61]) {
      lamp(g, lx + 2, hy, 0xffffff, 1, 0.6);
      g.fillRect(lx - 12, hy - 4, 14, 9, 0xfff6e0, { a: 0.25 });
    }
  }
  // Wagons: each a flat with one or two boxes, a gap and a coupling.
  for (let j = 0; j < 14; j++) {
    const wx = f + 78 + j * 104;
    if (wx > W || wx + 104 < 0) continue;
    const ix = Math.round(wx);
    const two = rand(key, j, 51) < 0.45;
    const boxes = two ? [[0, 46], [50, 46]] : [[0, 96]];
    for (let b = 0; b < boxes.length; b++) {
      const [bo, bw] = boxes[b];
      const c = BOXES[Math.floor(rand(key, j * 3 + b, 52) * BOXES.length)];
      const top = 10 + Math.floor(rand(key, j * 3 + b, 53) * 3);
      litBox(g, ix + bo, top, bw, 62 - top, c);
      g.fillRect(ix + bo, top, bw, 1, mix(c, 0xffffff, 0.3));
      g.fillRect(ix + bo, 60, bw, 2, mix(c, 0x000000, 0.5));
      if (bw > 60 && rand(key, j, 54) < 0.6) {
        const name = BRANDS[Math.floor(rand(key, j, 55) * BRANDS.length)];
        g.text(name, ix + bo + 8, top + 18, { font: font5x7, c: 0xd8d4c8, a: 0.55 });
      }
    }
    // Underframe and bogies, smeared.
    g.fillRect(ix, 62, 96, 3, 0x141416);
    g.fillRect(ix + 6, 65, 20, 8, 0x0c0c0d);
    g.fillRect(ix + 70, 65, 20, 8, 0x0c0c0d);
    g.fillRect(ix + 96, 60, 8, 2, 0x101012);
  }
}

// ------------------------------------------------------------ the hour's station

const BRICK = hex('#6a3e2c'), MORTAR = hex('#4a2c20'), CREAM = hex('#d8ccb0'), GLOBE = hex('#fff2d0');
const WIN = hex('#ffd27a'), SLAB = hex('#46423e'), NAVY = hex('#1a2a5a');
const NAMES = ['MIDNIGHT', 'HOLLOW', 'STILLWATER', 'NOCTON', 'ASHFORD', 'GREYMOOR', 'LUMLEY', 'DAWNHAM',
  'ELMSTEAD', 'KIRKBY', 'MARSDEN', 'NOONAN', 'OAKHURST', 'ROOKWOOD', 'SALTBURN', 'THORNE',
  'UPWEY', 'VALE', 'WESTBURY', 'YARROW', 'BRAMLEY', 'CALDER', 'DUNMORE', 'EVENWOOD'];

/** A railway clock, the Swiss kind: the second hand sweeps 58.5 s, waits, and the minute hand jumps. */
function drawClock(g, cx, cy, r, date) {
  const h = date.getHours() % 12, m = date.getMinutes(), s = date.getSeconds() + date.getMilliseconds() / 1000;
  g.fillRect(Math.round(cx), cy - r - 6, 1, 6, 0x101010);
  g.fillCircle(cx, cy, r + 1.5, 0x1a1a1c, { aa: true });
  g.fillCircle(cx, cy, r, 0xf4f2ea, { aa: true });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const [x0, y0] = polar(cx, cy, r - 1.2, a), [x1, y1] = polar(cx, cy, r - (i % 3 ? 3 : 4.2), a);
    g.thickLine(x0, y0, x1, y1, i % 3 ? 1 : 1.6, 0x101010, { aa: true });
  }
  const am = (m / 60) * Math.PI * 2;
  const ah = ((h + m / 60) / 12) * Math.PI * 2;
  const as = (Math.min(s, 58.5) / 58.5) * Math.PI * 2;
  const hand = (a, len, back, w, c) => {
    const [x0, y0] = polar(cx, cy, -back, a), [x1, y1] = polar(cx, cy, len, a);
    g.thickLine(x0, y0, x1, y1, w, c, { aa: true });
  };
  hand(ah, r * 0.55, 2, 2.4, 0x101010);
  hand(am, r * 0.86, 2, 1.8, 0x101010);
  hand(as, r * 0.62, 3, 0.9, 0xd01c1c);
  const [dx, dy] = polar(cx, cy, r * 0.62, as);
  g.fillCircle(dx, dy, 1.6, 0xd01c1c, { aa: true });
}

/** The station, `R` seconds of travel from the stop (screen x of an offset o is 80 + o + NEAR * R). */
export function drawStation(g, st, date, T) {
  const sx = (o) => 80 + o + NEAR * st.R;
  if (sx(-470) > W || sx(470) < 0) return;
  // Platform: wet slabs, the yellow line, the coping, lamps reflected in puddles.
  const p0 = Math.max(0, sx(-460)), p1 = Math.min(W, sx(460));
  if (p1 > p0) {
    g.fillRect(p0, 63, p1 - p0, H - 63, SLAB);
    g.fillRect(p0, 63, p1 - p0, 1, mix(SLAB, 0x000000, 0.4));
    g.fillRect(p0, 73, p1 - p0, 1, 0xd8b030);
    g.fillRect(p0, 76, p1 - p0, 4, 0x8a8478);
    for (let o = -440; o <= 440; o += 40) {
      const x = sx(o);
      if (x < -4 || x > W + 4) continue;
      g.fillRect(x, 63, 1, 13, mix(SLAB, 0x000000, 0.3));
    }
  }
  // The building and its canopy.
  const b0 = sx(-270), b1 = sx(270);
  const c0 = Math.max(0, b0), c1 = Math.min(W, b1);
  if (c1 > c0) {
    g.fillRect(c0, 0, c1 - c0, 63, BRICK);
    for (let y = 16; y < 63; y += 4) g.fillRect(c0, y, c1 - c0, 1, MORTAR);
    // Arched windows and doors, lit from inside, in bays between the clocks.
    for (let c = -360; c < 270; c += 120)
      for (const [dx, door] of [[20, 0], [52, 1], [84, 0]]) {
        const x = sx(c + dx);
        if (x > W || x + 16 < 0 || c + dx < -270 || c + dx > 254) continue;
        const top = door ? 40 : 38, bot = door ? 63 : 56;
        g.fillRect(x, top, 16, bot - top, WIN);
        g.fillCircle(x + 8, top, 8, WIN);
        g.fillRect(x + 7, top - 6, 2, bot - top + 6, mix(WIN, BRICK, 0.6));
        if (!door) g.fillRect(x, 46, 16, 1, mix(WIN, BRICK, 0.6));
        g.fillRect(x - 1, bot, 18, 2, CREAM);
        // Their light on the wet platform.
        g.fillRect(x + 2, 64, 12, 9, WIN, { a: 0.16 });
      }
    // Canopy: dark underside, the fretted valance.
    g.fillRect(c0, 0, c1 - c0, 12, 0x14100c);
    g.fillRect(c0, 11, c1 - c0, 2, CREAM);
    for (let o = -270; o < 270; o += 6) {
      const x = sx(o);
      if (x < -6 || x > W) continue;
      g.fillPolygon([[x, 13], [x + 6, 13], [x + 3, 17]], CREAM);
    }
    for (let o = -240; o < 270; o += 60) {
      const x = sx(o);
      if (x < -10 || x > W + 10) continue;
      g.fillCircle(x, 8, 2.2, GLOBE, { aa: true });
      g.fillCircle(x, 8, 6, GLOBE, { a: 0.18 });
      g.fillRect(x - 3, 64, 6, 12, GLOBE, { a: 0.14 });
    }
    // Name boards and clocks.
    const name = NAMES[st.name % 24];
    for (const o of [-60, 60]) {
      const x = sx(o) - 30;
      if (x > W || x + 60 < 0) continue;
      g.fillRect(x, 18, 60, 11, NAVY);
      g.rect(x, 18, 60, 11, 0xe8e8e8);
      const tw = name.length * 6 - 1;
      g.text(name, x + 30 - tw / 2, 20, { font: font5x7, c: 0xf2f2f2 });
    }
    for (const o of [-240, -120, 0, 120, 240]) {
      const x = sx(o);
      if (x < -16 || x > W + 16) continue;
      drawClock(g, x, 31, 12, date);
    }
  }
  // Open platform beyond the building: lamp posts.
  for (const o of [-430, -370, -310, 310, 370, 430]) {
    const x = sx(o);
    if (x < -8 || x > W + 8) continue;
    g.fillRect(x, 20, 2, 43, 0x16161a);
    g.fillRect(x - 3, 19, 8, 2, 0x16161a);
    lamp(g, x + 1, 22, 0xffc070, 1, 0.5);
    g.fillRect(x - 6, 22, 14, 41, 0xffc070, { a: 0.06 });
    g.fillRect(x - 3, 64, 8, 12, 0xffc070, { a: 0.18 });
  }
  // Ramps at the platform ends.
  for (const [o, dir] of [[-460, -1], [460, 1]]) {
    const x = sx(o);
    if (x < -20 || x > W + 20) continue;
    g.fillPolygon([[x, 63], [x + dir * 16, 76], [x, 76]], SLAB);
  }
  // Rain falling through the lamplight while we stand.
  if (Math.abs(st.R) < 0.4) {
    for (let i = 0; i < 26; i++) {
      const per = 0.5 + 0.3 * rand(i, 1, 66);
      const ph = ((T / per + rand(i, 2, 66)) % 1);
      const x = Math.floor(rand(i, 3, 66) * W + ph * 3), y = Math.floor(ph * 84) - 4;
      g.fillRect(x, y, 1, 4, 0xc8d0e0, { a: 0.28 });
    }
  }
}

// ------------------------------------------------------------ level crossing, halt

const RED = hex('#ff2a18');

/** A level crossing at second `at`; returns how much red light it throws (0..1). */
export function drawCrossing(g, at, J) {
  const dt = at - J.s;                     // seconds until it's centred
  const nx = 80 + NEAR * dt, mx = 80 + MID * dt, fx = 80 + MID * 0.25 * dt;
  if (nx < -80 || nx > W + 80) return 0;
  // The road, running away from us to the horizon.
  g.fillPolygon([[nx - 30, H], [nx + 30, H], [mx + 8, 61], [fx + 1, 50], [fx - 1, 50], [mx - 8, 61]], 0x1e1c1c);
  g.thickLine(nx, H, mx, 61, 1.5, 0xc8c0a0, { a: 0.5 });
  // Road lamps going away, and a car waiting at the far barrier.
  for (let i = 1; i <= 3; i++) {
    const u = i / 4;
    lamp(g, mx + (fx - mx) * u + 6 * (1 - u), 61 - 11 * u - 3, 0xffad4a, 0.9, 0.25);
  }
  for (const s of [-3, 3]) lamp(g, mx + s, 60, 0xffffff, 1, 0.5);
  g.fillRect(Math.round(mx) - 12, 57, 24, 7, 0xfff4e0, { a: 0.12 });
  // Barriers down, red and white.
  for (let x = Math.round(nx - 24); x < nx + 24; x += 4) g.fillRect(x, 64, 2, 2, (x >> 2) & 1 ? 0xf0f0f0 : 0xd02018);
  // The signal post: a white cross, two red lamps flashing in turn.
  const px = Math.round(nx + 30);
  g.fillRect(px, 44, 2, 22, 0x1a1a1c);
  g.thickLine(px - 5, 38, px + 7, 46, 2, 0xe8e8e8);
  g.thickLine(px - 5, 46, px + 7, 38, 2, 0xe8e8e8);
  g.fillRect(px - 6, 49, 14, 5, 0x0c0c0e);
  const ph = (J.s * 2) % 1 < 0.5;
  lamp(g, px - 3, 51, RED, ph ? 1 : 0.15, ph ? 0.7 : 0);
  lamp(g, px + 5, 51, RED, ph ? 0.15 : 1, ph ? 0 : 0.7);
  return clamp(1 - Math.abs(nx - 80) / 150, 0, 1);
}

/** A halt flashing past: low platform, lamp posts, a shelter; returns the sodium wash (0..1). */
export function drawHalt(g, at, J) {
  const dt = at - J.s;
  const sx = (o) => 80 + o + NEAR * dt;
  if (sx(-260) > W || sx(260) < 0) return 0;
  const p0 = Math.max(0, sx(-250)), p1 = Math.min(W, sx(250));
  if (p1 > p0) {
    g.fillRect(p0, 64, p1 - p0, H - 64, 0x3a3834);
    g.fillRect(p0, 73, p1 - p0, 1, 0xd8b030);
    g.fillRect(p0, 76, p1 - p0, 4, 0x7a766c);
  }
  const x = sx(-20);
  if (x < W && x + 40 > 0) {
    g.fillRect(x, 42, 40, 22, 0x12141a);
    g.fillRect(x + 3, 45, 34, 12, 0x6a8090, { a: 0.6 });
    g.fillRect(x - 2, 40, 44, 3, 0x20242a);
  }
  for (let o = -240; o <= 240; o += 48) {
    const lx = sx(o);
    if (lx < -10 || lx > W + 10) continue;
    g.fillRect(lx, 24, 2, 40, 0x18181c);
    g.fillRect(lx - 6, 21, 14, 6, 0xfff0d0, { a: 0.3 });
    g.fillRect(lx - 3, 23, 8, 2, 0xfff6e8);
    g.fillRect(lx - 4, 64, 10, 12, 0xffe0b0, { a: 0.2 });
  }
  return clamp(1 - Math.abs(sx(0) - 80) / 260, 0, 1);
}
