// ferriswheel: "Long Exposure". A giant fairground wheel, seen from the
// midway below so only its upper half fits the strip, photographed with the
// shutter open. Its 24 spokes carry strings of bulbs, and the wheel is a
// propeller clock: as each spoke sweeps round, its bulbs switch on and off so
// that the light trails they leave on the exposure spell the time. The digits
// are stored in polar form (one ring of bulbs per row, columns by angle), so
// they fan out along the arch with every stem pointing at the hub, and they
// are made of nothing but concentric streaks of light.
//
// Reading it: HH:MM across the arch. The wheel turns once a minute, so the
// gold gondola is a seconds hand: it crests the top at every minute turn.
//
// At rest each point of a digit is re-lit every 2.5 s by the next spoke, so a
// fan of white-hot fronts sweeps slowly clockwise through the numerals, each
// trail cooling to amber and red behind it. At the minute the bulbs for a
// changing digit go dark one spoke-pass before :00 (the old digit is wiped
// sector by sector) and the next spokes write the new one in.
// At the hour the bulbs run a rainbow programme, one colour per spoke, and
// fireworks go up in the corners of the sky.
//
// Palette: night sky (navy to plum, by time of day), the warm incandescent
// ramp white -> amber -> red for the light, cool violet steel, and the
// midway's flat poster colours (red/cream awnings, teal, mustard).
// Light trails are blended per pixel; structure is AA because it rotates by
// fractions of a pixel; the midway and crowd are hard flat pixel art.

import { hex, mix, hsv, rand, clockFields, previousMinute, sin as ksin, cos as kcos } from '../js/kit.js';
import { GLYPH, COLON, ROWS, COLS } from './ferriswheel-font.js';
import { drawSky, drawMidway, drawFireworks } from './ferriswheel-midway.js';

// ---------------------------------------------------------------- geometry

const CX = 80, CY = 124;           // hub, far below the bottom edge
const R0 = 76, S = 3;              // bulb ring k sits at radius R0 + k*S
const RIM_IN = 110, RIM_OUT = 116; // the truss between two rims
const SPOKES = 24, SP_DEG = 360 / SPOKES;
const PASS = 60 / SPOKES;          // seconds between two spokes passing a point
const BLANK = PASS + 0.3;          // a changing digit goes dark this long before :00
const A0 = -28, COLW = 1.4;        // first column's clock angle, degrees per column
// Columns: d0 0-6 | gap | d1 9-15 | gap | colon 19-20 | gap | d2 24-30 | gap | d3 33-39
const NCOL = 40;
const SLOT_OF = new Int8Array(NCOL).fill(-1), LOCAL = new Int8Array(NCOL);
for (const [slot, c0, w] of [[0, 0, 7], [1, 9, 7], [4, 19, 2], [2, 24, 7], [3, 33, 7]])
  for (let i = 0; i < w; i++) { SLOT_OF[c0 + i] = slot; LOCAL[c0 + i] = i; }

const D2R = Math.PI / 180;

// Per-pixel tables for the band the digits occupy, built once (in C: const
// arrays in flash). For each pixel: ring row, ring brightness, column (float)
// and clock angle.
const BAND = (() => {
  const rLo = R0 - 1.4, rHi = R0 + (ROWS - 1) * S + 1.4;
  let x0 = 160, y0 = 80, x1 = 0, y1 = 0;
  const inBand = (x, y) => {
    const dx = x + 0.5 - CX, dy = y + 0.5 - CY, r = Math.hypot(dx, dy);
    const a = Math.atan2(dx, -dy) / D2R;
    return r >= rLo && r <= rHi && a >= A0 - 1 && a <= A0 + NCOL * COLW + 1;
  };
  for (let y = 0; y < 80; y++) for (let x = 0; x < 160; x++)
    if (inBand(x, y)) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + 1); y1 = Math.max(y1, y + 1); }
  const w = x1 - x0, h = y1 - y0, n = w * h;
  const row = new Int8Array(n).fill(-1), lum = new Float32Array(n), col = new Float32Array(n), ang = new Float32Array(n), half = new Float32Array(n);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y - y0) * w + (x - x0);
    const dx = x + 0.5 - CX, dy = y + 0.5 - CY, r = Math.hypot(dx, dy);
    const a = Math.atan2(dx, -dy) / D2R;
    const u = (r - R0) / S, k = Math.round(u), d = Math.abs(u - k) * S;
    if (k < 0 || k >= ROWS) continue;
    const l = d < 0.7 ? 1 : d < 1.45 ? ((1.45 - d) / 0.75) ** 1.3 : 0;
    if (l <= 0.02) continue;
    row[i] = k; lum[i] = l; ang[i] = a;
    col[i] = (a - A0) / COLW;
    half[i] = (0.42 / r) / D2R / COLW;   // a little under half a pixel, in columns
  }
  return { x0, y0, w, h, row, lum, col, ang, half };
})();

// The light's colour by age (0 just lit .. 1 about to be re-lit), and its brightness.
const AGE_N = 64;
const AGE_C = new Int32Array(AGE_N), AGE_A = new Float32Array(AGE_N);
{
  const st = [[0, hex('#fffbea')], [0.15, hex('#ffe08a')], [0.5, hex('#ffb03a')], [1, hex('#ff7a2a')]];
  for (let i = 0; i < AGE_N; i++) {
    const u = i / (AGE_N - 1);
    let j = 0; while (j < st.length - 2 && u > st[j + 1][0]) j++;
    AGE_C[i] = mix(st[j][1], st[j + 1][1], (u - st[j][0]) / (st[j + 1][0] - st[j][0]));
    AGE_A[i] = 0.62 + 0.38 * (1 - u) ** 1.5;
  }
}

const AGE_K = (AGE_N - 1) / PASS;
// The hour's programme: each spoke its own colour, still white-hot at the head.
const RAINBOW = new Int32Array(SPOKES * AGE_N);
for (let sp = 0; sp < SPOKES; sp++) for (let i = 0; i < AGE_N; i++)
  RAINBOW[sp * AGE_N + i] = mix(hsv(sp * 47, 0.85, 1), 0xffffff, Math.max(0, 0.6 - (i / AGE_N) * 3));

/** d blended towards c by a (0..1): integer channels, as the C does it. */
function blend(d, c, a) {
  const dr = (d >> 16) & 255, dg = (d >> 8) & 255, db = d & 255;
  return (((dr + (((c >> 16) & 255) - dr) * a) | 0) << 16) | (((dg + (((c >> 8) & 255) - dg) * a) | 0) << 8) | ((db + ((c & 255) - db) * a) | 0);
}

const STEEL = hex('#4b4170'), STEEL_LIT = hex('#7a6a9c'), SPOKE = hex('#2e2a4c');
const BULB_OFF = hex('#5a2c3a'), BULB_ON = hex('#fffdf0');
const CANOPY = [hex('#e8423c'), hex('#2ab3a6'), hex('#f2c230'), hex('#4a6ee8'), hex('#e85aa0'), hex('#7ac943')];
const GOLD = hex('#ffc93a');

const mod = (a, n) => ((a % n) + n) % n;

/** Clock angle (degrees) -> canvas point at radius r. */
const at = (r, deg) => [CX + r * ksin(deg * D2R), CY - r * kcos(deg * D2R)];

export default {
  name: 'Long Exposure',
  blurb: 'A fairground wheel shot with the shutter open: its spokes are a propeller clock, and the bulbs\' light trails write the time across the arch.',
  fps: 60,

  frame(g, ctx) {
    const f = ctx.fields, sec = f.sec;
    ctx.lcd.backlight(1 - 0.65 * ctx.night);
    const theta = 6 * sec;                       // the wheel's turn, degrees
    const prev = previousMinute(ctx.date), next = clockFields(new Date(ctx.date.getTime() + 60000));
    const dig = (fl) => [+fl.hh[0], +fl.hh[1], +fl.mm[0], +fl.mm[1]];
    const P = dig(prev), C = dig(f), N = dig(next);
    const chPrev = P.map((d, i) => d !== C[i]), chCur = C.map((d, i) => d !== N[i]);
    // The hour show: rainbow bulbs for the first 20 s of an hour.
    const show = f.m === 0 && sec < 20 ? sec : -1;

    drawSky(g, ctx);
    if (show >= 0) drawFireworks(g, show);

    // Spokes, faint: the steel is barely lit; the light is the picture.
    for (let i = 0; i < SPOKES; i++) {
      const phi = mod(theta + i * SP_DEG + 180, 360) - 180;
      if (Math.abs(phi) > 60) continue;
      const [x0, y0] = at(42, phi), [x1, y1] = at(RIM_IN, phi);
      g.thickLine(x0, y0, x1, y1, 1, SPOKE, { aa: true });
    }

    // Is bulb `row` lit in column `c` on a pass made `age` seconds ago?
    const lit = (c, row, age) => {
      if (c < 0 || c >= NCOL) return 0;
      const ci = c | 0;
      const slot = SLOT_OF[ci];
      if (slot < 0) return 0;
      const lc = LOCAL[ci];
      if (slot === 4) return COLON[row * 2 + lc];
      const sp = sec - age;
      if (sp >= 0) {
        if (sp >= 60 - BLANK && chCur[slot]) return 0;
        return GLYPH[C[slot]][row * COLS + lc];
      }
      if (chPrev[slot]) return 0;
      return GLYPH[P[slot]][row * COLS + lc];
    };

    // The exposure: every band pixel shows the trail of the last spoke that passed it.
    const B = BAND;
    g.paint((px, py, x, y) => {
      const i = (y - B.y0) * B.w + (x - B.x0);
      const row = B.row[i];
      if (row < 0) return -1;
      const ageDeg = mod(B.ang[i] - theta, SP_DEG), age = ageDeg / 6;
      const c = B.col[i], h = B.half[i];
      const cov = (lit(c - h, row, age) + lit(c + h, row, age)) * 0.5;
      if (cov <= 0) return -1;
      let ai = (age * AGE_K) | 0;
      if (ai > AGE_N - 1) ai = AGE_N - 1;
      let col = AGE_C[ai];
      if (show >= 0 && sec - age >= 0 && sec - age < 20) {
        const spoke = (mod(B.ang[i] - theta, 360) / SP_DEG) | 0;
        col = RAINBOW[spoke * AGE_N + ai];
      }
      return blend(g.get(x, y), col, B.lum[i] * cov * AGE_A[ai]);
    }, [B.x0, B.y0, B.w, B.h]);

    // The bulbs on each spoke right now: the pen tips.
    for (let i = 0; i < SPOKES; i++) {
      const phi = mod(theta + i * SP_DEG + 180, 360) - 180;
      if (Math.abs(phi) > 60) continue;
      const c = (phi - A0) / COLW;
      for (let k = 0; k < ROWS; k++) {
        const [bx, by] = at(R0 + k * S, phi);
        if (by > 82) continue;
        if (lit(c, k, 0)) {
          // A lit bulb: a hot point at the head of its own trail.
          g.fillCircle(bx, by, 0.75, show >= 0 ? mix(hsv(i * 47, 0.6, 1), 0xffffff, 0.5) : BULB_ON, { aa: true });
        } else g.fillCircle(bx, by, 0.55, BULB_OFF, { aa: true, a: 0.8 });
      }
    }

    // The rim: two steel rings with a zig-zag truss that turns with the wheel.
    g.ring(CX, CY, RIM_IN - 0.5, RIM_IN + 0.5, STEEL, { aa: true });
    g.ring(CX, CY, RIM_OUT - 0.6, RIM_OUT + 0.6, STEEL_LIT, { aa: true });
    for (let i = 0; i < SPOKES * 2; i++) {
      const phi = mod(theta + i * SP_DEG / 2 + 180, 360) - 180;
      if (Math.abs(phi) > 52) continue;
      const [x0, y0] = at(RIM_IN, phi), [x1, y1] = at(RIM_OUT, phi + (i & 1 ? -SP_DEG / 2 : SP_DEG / 2));
      g.thickLine(x0, y0, x1, y1, 0.8, STEEL, { aa: true });
    }
    // Rim bulbs streak in the exposure: a bright head and a cooling tail behind it.
    const RB = 96;
    for (let i = 0; i < RB; i++) {
      const phi = mod(theta + i * (360 / RB) + 3.75 + 180, 360) - 180;
      if (Math.abs(phi) > 50) continue;
      const on = ((i + ((sec * 2) | 0)) % 3) !== 0;   // a slow three-phase chase
      if (!on) continue;
      for (let k = 0; k < 6; k++) {
        const [x, y] = at((RIM_IN + RIM_OUT) / 2, phi - k * 0.5);
        g.pixel(x, y, k === 0 ? 0xfff2c0 : AGE_C[Math.min(AGE_N - 1, k * 11)], { a: 1 - k * 0.15 });
      }
    }

    // Gondolas hang from every other spoke end; car 0 is gold and crests at :00.
    for (let j = 0; j < 16; j++) {
      const phi = mod(theta + j * 22.5 + 180, 360) - 180;
      if (Math.abs(phi) > 56) continue;
      const [px, py] = at(RIM_OUT, phi);
      if (py > 84) continue;
      // A gentle swing, larger as the car moves sideways (it lags the turn).
      const sw = 0.12 * ksin(phi * D2R) * kcos(sec * 1.7 + j);
      // Riders change at the bottom, hidden behind the stalls: car j is lowest at sec (180 - 22.5j) / 6.
      const low = mod((180 - 22.5 * j) / 6, 60);
      drawGondola(g, px, py, sw, j === 0 ? GOLD : CANOPY[j % CANOPY.length], j === 0, j, f.minuteKey + (sec >= low ? 1 : 0));
      // The gold car's flash as it crests the top at the minute.
      if (j === 0 && sec < 0.8) g.fillCircle(px, py + 6, 2 + 5 * sec, 0xfff6d0, { aa: true, a: 0.55 * (1 - sec / 0.8) });
    }

    drawMidway(g, ctx);
  },
};

/** A gondola hanging from (px, py), swung by `sw` radians. */
function drawGondola(g, px, py, sw, canopy, gold, j, mk) {
  const s = ksin(sw), c = kcos(sw);
  const P = (dx, dy) => [px + dx * c - dy * s, py + dx * s + dy * c];
  g.fillCircle(px, py, 1.1, STEEL_LIT, { aa: true });
  const [hx, hy] = P(0, 3);
  g.thickLine(px, py, hx, hy, 0.9, STEEL_LIT, { aa: true });
  // canopy: a striped dome
  const dome = [P(-4.2, 4.6), P(-2.5, 2.8), P(0, 2.3), P(2.5, 2.8), P(4.2, 4.6)];
  g.fillPolygon(dome, canopy, { aa: true });
  // posts and tub
  const [ax, ay] = P(-3, 4.6), [bx, by] = P(-3, 7), [cx2, cy2] = P(3, 4.6), [dx2, dy2] = P(3, 7);
  g.thickLine(ax, ay, bx, by, 0.7, 0x2a2440, { aa: true });
  g.thickLine(cx2, cy2, dx2, dy2, 0.7, 0x2a2440, { aa: true });
  // riders: heads in the cabin, lit by the wheel
  const riders = 1 + (rand(j, mk) * 2.2 | 0);
  for (let r = 0; r < riders; r++) {
    const [rx, ry] = P(-1.5 + r * 2.4 - (riders === 1 ? -1 : 0), 6.1);
    g.fillCircle(rx, ry, 0.95, 0x1a1428, { aa: true });
  }
  const tub = [P(-3.8, 7), P(3.8, 7), P(3.2, 10), P(-3.2, 10)];
  g.fillPolygon(tub, gold ? 0xffe9a0 : 0xf2e6cc, { aa: true });
  const [lx, ly] = P(-3.4, 7.6), [rx2, ry2] = P(3.4, 7.6);
  g.thickLine(lx, ly, rx2, ry2, 0.8, canopy, { aa: true });
  if (gold) g.fillCircle(px, py, 1.6, 0xfff2b0, { aa: true, a: 0.8 });
}
