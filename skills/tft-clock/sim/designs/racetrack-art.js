// Art for racetrack.js: the board (grass, pit lane, grandstand), the light
// of the day, the slot cars and the giant hand.

import { hex, R, G, B, to565, from565, sin, cos, rand, clamp } from '../js/kit.js';

export const W = 160, H = 80;
export const PIT_Y = 72.5;                // pit lane centre line
export const STAND = { x: 88, y: 0, w: 72, h: 18 };

// ------------------------------------------------------------ light
// A coarse light map (one node every 4 px): ambient by the time of day plus
// floodlight pools after dusk. Multipliers in 1/256.
export const LGW = 41, LGH = 21;
export const LR = new Int32Array(LGW * LGH), LG = new Int32Array(LGW * LGH), LB = new Int32Array(LGW * LGH);
const DAY = [ // hour, ambient r g b, floodlights
  [0, 0.24, 0.36, 0.72, 1], [5.4, 0.24, 0.36, 0.72, 1], [6.4, 0.7, 0.64, 0.8, 0.4], [7.4, 1, 1, 1, 0],
  [17.2, 1, 1, 1, 0], [18.2, 1.06, 0.9, 0.74, 0.1], [19.4, 0.56, 0.54, 0.82, 0.7], [20.4, 0.24, 0.36, 0.72, 1], [24, 0.24, 0.36, 0.72, 1],
];
const POOLS = [[20, 32, 30], [60, 30, 30], [102, 44, 28], [134, 40, 28], [80, 82, 26], [124, 4, 22]];
let lightKey = -1;
export let LIGHT = { flood: 0, amb: [1, 1, 1], track: 0xffffff };
export function buildLight(hour) {
  const key = Math.round(hour * 60);
  if (key === lightKey) return LIGHT;
  lightKey = key;
  let k = 1;
  while (DAY[k][0] < hour) k++;
  const a = DAY[k - 1], b = DAY[k], u = (hour - a[0]) / (b[0] - a[0]);
  const amb = [1, 2, 3].map((c) => a[c] + (b[c] - a[c]) * u), flood = a[4] + (b[4] - a[4]) * u;
  for (let j = 0; j < LGH; j++)
    for (let i = 0; i < LGW; i++) {
      const x = i * 4, y = j * 4;
      let p = 0;
      for (const [px, py, r] of POOLS) { const d2 = ((x - px) ** 2 + (y - py) ** 2) / (r * r); p += Math.max(0, 1 - d2) ** 2; }
      p = Math.min(1, p) * flood;
      const vig = 1 - 0.18 * flood * Math.min(1, ((x - 80) / 80) ** 2 + ((y - 40) / 40) ** 2);
      const q = j * LGW + i;
      LR[q] = Math.round(Math.min(1.12, (amb[0] + p * 1.0) * vig) * 256);
      LG[q] = Math.round(Math.min(1.1, (amb[1] + p * 0.82) * vig) * 256);
      LB[q] = Math.round(Math.min(1.1, (amb[2] + p * 0.42) * vig) * 256);
    }
  const tl = [0.96, 0.93, 0.86], tk = flood * 0.8;
  const tr = amb.map((v, c) => v + (tl[c] - v) * tk);
  const c8 = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));
  LIGHT = { flood, amb, track: (c8(tr[0]) << 16) | (c8(tr[1]) << 8) | c8(tr[2]) };
  return LIGHT;
}

/** A colour lit at (x, y): nearest light node, integer maths. */
export function lit(c, x, y) {
  const i = clamp((x + 2) >> 2, 0, LGW - 1), j = clamp((y + 2) >> 2, 0, LGH - 1), q = j * LGW + i;
  let r = (R(c) * LR[q]) >> 8, g = (G(c) * LG[q]) >> 8, b = (B(c) * LB[q]) >> 8;
  if (r > 255) r = 255; if (g > 255) g = 255; if (b > 255) b = 255;
  return (r << 16) | (g << 8) | b;
}

// ------------------------------------------------------------ the board
const GRASS = [hex('3b7436'), hex('437f3c')], GRASS_EDGE = hex('2f5e2e');
const PIT = hex('5e6168'), PIT_LINE = hex('c8c4b8'), PIT_WALL = hex('e8e6e0'), WALL_RED = hex('d23a2a');
const GARAGE = [hex('2d3138'), hex('3a3f47')];
const TEAM = [hex('e8262a'), hex('ffcf1a'), hex('2a7bff'), hex('f4f4f4')];
const SEAT = hex('2c3a58'), ROOF = [hex('f2f0ea'), hex('d23a2a')], HOARD = hex('1f5fbf');

/** The board without track, unlit, into a 160 x 80 canvas (once a minute). */
export function paintBoard(c) {
  const buf = c.buf;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      // mowing stripes: broad diagonal bands
      let col = GRASS[((x * 2 + y * 3) >> 5) & 1];
      if (y > 60 || x < 3) col = mixInt(col, GRASS_EDGE, 0.35);
      buf[y * W + x] = to565(col);
    }
  // pit wall and pit lane
  for (let x = 0; x < W; x++) {
    buf[67 * W + x] = to565(((x >> 2) & 1) ? PIT_WALL : WALL_RED);
    buf[68 * W + x] = to565(mixInt(PIT_WALL, 0x000000, 0.25));
    for (let y = 69; y < 77; y++) buf[y * W + x] = to565(PIT);
    if (((x >> 2) & 3) === 0) buf[76 * W + x] = to565(PIT_LINE);
    for (let y = 77; y < 80; y++) buf[y * W + x] = to565(GARAGE[((x / 20) | 0) & 1]);
  }
  // garage doors, team colours, and pit-box lines
  for (let k = 0; k < 8; k++) {
    const x0 = k * 20 + 3, team = TEAM[k & 3];
    for (let x = x0; x < x0 + 14; x++) buf[79 * W + x] = to565(mixInt(team, 0x000000, 0.35));
    for (let x = x0; x < x0 + 14; x++) buf[78 * W + x] = to565(mixInt(team, 0x000000, 0.6));
    for (let y = 69; y < 76; y++) buf[y * W + k * 20] = to565(PIT_LINE);
  }
  // the grandstand, top right: a striped roof edge, seats, a hoarding
  const S = STAND;
  for (let y = S.y; y < S.y + S.h; y++)
    for (let x = S.x; x < S.x + S.w; x++) {
      let col;
      if (y < 2) col = ROOF[((x - S.x) >> 2) & 1];
      else if (y === 2) col = 0x1a1e26;
      else if (y < 14) col = ((y - 3) % 3 === 2) ? mixInt(SEAT, 0x000000, 0.4) : SEAT;
      else if (y < 16) col = HOARD;
      else col = mixInt(GRASS_EDGE, 0x000000, 0.2);
      buf[y * W + x] = to565(col);
    }
  // hoarding lettering: white dashes
  for (let x = S.x + 3; x < S.x + S.w - 2; x++) if ((x % 7) < 4) buf[14 * W + x] = to565(0xf2f2f2);
  // the stand's side wall
  for (let y = 0; y < 17; y++) { buf[y * W + S.x] = to565(0x1a1e26); buf[y * W + S.x + 1] = to565(0x4a5468); }
}

export function mixInt(a, b, u) {
  const r = R(a) + (R(b) - R(a)) * u, g = G(a) + (G(b) - G(a)) * u, bl = B(a) + (B(b) - B(a)) * u;
  return ((r + 0.5) << 16) | ((g + 0.5) << 8) | (bl + 0.5);
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
/** Light a whole canvas in place (once a minute, with the background): bilinear light, dithered. */
export function lightCanvas(c) {
  const buf = c.buf;
  for (let y = 0; y < H; y++) {
    const fy = y / 4, j = fy | 0, v = fy - j, j1 = j + 1 < LGH ? j + 1 : j;
    for (let x = 0; x < W; x++) {
      const fx = x / 4, i = fx | 0, u = fx - i, i1 = i + 1 < LGW ? i + 1 : i;
      const q00 = j * LGW + i, q10 = j * LGW + i1, q01 = j1 * LGW + i, q11 = j1 * LGW + i1;
      const w00 = (1 - u) * (1 - v), w10 = u * (1 - v), w01 = (1 - u) * v, w11 = u * v;
      const lr = LR[q00] * w00 + LR[q10] * w10 + LR[q01] * w01 + LR[q11] * w11;
      const lg = LG[q00] * w00 + LG[q10] * w10 + LG[q01] * w01 + LG[q11] * w11;
      const lb = LB[q00] * w00 + LB[q10] * w10 + LB[q01] * w01 + LB[q11] * w11;
      const k = y * W + x, col = from565(buf[k]);
      const t = BAYER[((y & 3) << 2) | (x & 3)];
      let r = ((R(col) * lr) * (31 / 65280) + t) | 0, g = ((G(col) * lg) * (63 / 65280) + t) | 0, b = ((B(col) * lb) * (31 / 65280) + t) | 0;
      if (r > 31) r = 31; if (g > 63) g = 63; if (b > 31) b = 31;
      buf[k] = (r << 11) | (g << 5) | b;
    }
  }
}

// ------------------------------------------------------------ the crowd
const SHIRTS = ['e84a3a', 'f2d23a', '3a8ae8', 'f4f4f4', 'e87ab8', '6ad06a', 'f08a2a', 'b0b8c8'].map(hex);
/** The crowd in the stand: a head per seat, bobbing; jumping and flashing at the hour. */
export function drawCrowd(g, tod, excite, night) {
  const S = STAND;
  for (let row = 0; row < 4; row++) {
    const y0 = S.y + 3 + row * 3;
    for (let x = S.x + 3 + (row & 1); x < S.x + S.w - 2; x += 2) {
      const h = rand(x, row, 9);
      if (h < 0.18) continue;
      const shirt = SHIRTS[(h * 97 | 0) & 7];
      const jump = excite * Math.max(0, sin(tod * 9 + h * 40));
      const bob = (sin(tod * (1.3 + h) + h * 30) > 0.92 ? 1 : 0) | (jump > 0.5 ? 1 : 0);
      const y = y0 - bob;
      g.fillRect(x, y + 1, 1, 1, lit(shirt, x, y));
      g.fillRect(x, y, 1, 1, lit(h > 0.6 ? 0xe8b890 : 0xa8745a, x, y));
      if (night > 0.3 && rand(x, row, Math.floor(tod * 8)) < 0.004 + excite * 0.02) g.fillRect(x, y, 1, 1, 0xffffff);
    }
  }
}

// ------------------------------------------------------------ cars
export { TEAM };
const WHEEL = hex('15161a'), GLASS = hex('1c2433'), LAMP = hex('fff6c8'), BRAKE = hex('ff3020');

/**
 * A slot car, top down: 8.4 long, 4.6 wide, nose along `yaw`. `lift` raises
 * it off the board (bigger, shadow further away); `lights` the headlight
 * beams (0..1), `brake` the tail lights.
 */
export function drawCar(g, x, y, yaw, team, { lift = 0, lights = 0, brake = 0, tint = 0xffffff } = {}) {
  const s = (1 + lift * 0.35) * 1.1, ux = cos(yaw) * s, uy = sin(yaw) * s;
  const P = (a, b, ox = 0, oy = 0) => [x + ox + ux * a - uy * b, y + oy + uy * a + ux * b];
  const body = TEAM[team], k = (c) => mulTint(c, tint);
  const so = 0.8 + lift * 4, so2 = 1.1 + lift * 5;
  if (lights > 0.02) {
    g.fillPolygon([P(3.8, -1.2), P(3.8, 1.2), P(15, 5), P(17, 0), P(15, -5)], 0xfff0b0, { aa: true, a: 0.26 * lights });
    g.fillPolygon([P(3.8, -1), P(3.8, 1), P(9, 2.6), P(10, 0), P(9, -2.6)], 0xfff4c8, { aa: true, a: 0.32 * lights });
  }
  g.fillPolygon([P(4.4, -1.4, so, so2), P(4.4, 1.4, so, so2), P(-4.3, 2.4, so, so2), P(-4.3, -2.4, so, so2)], 0x000000, { aa: true, a: 0.38 - lift * 0.15 });
  for (const ax of [2.5, -2.6])
    for (const sd of [-1, 1]) g.thickLine(...P(ax - 0.9, sd * 2.05), ...P(ax + 0.9, sd * 2.05), 1.2, k(WHEEL), { aa: true });
  g.fillPolygon([P(4.4, -1.2), P(4.4, 1.2), P(2.6, 2.05), P(-3.7, 2.05), P(-4.3, 1.6), P(-4.3, -1.6), P(-3.7, -2.05), P(2.6, -2.05)], k(body), { aa: true });
  const stripe = team === 3 ? 0x1c2a6a : 0xf6f6f2;
  g.fillPolygon([P(4.3, -0.55), P(4.3, 0.55), P(-4.2, 0.55), P(-4.2, -0.55)], k(stripe), { aa: true, a: 0.9 });
  g.fillPolygon([P(1.5, -1.3), P(1.5, 1.3), P(-0.7, 1.1), P(-0.7, -1.1)], k(GLASS), { aa: true });
  g.fillRect(...P(-3.95, 0).map(Math.floor), 1, 1, k(0x202028), { a: 0.5 });
  g.thickLine(...P(-4.0, -2.1), ...P(-4.0, 2.1), 0.9, k(mixInt(body, 0x000000, 0.45)), { aa: true });
  g.fillCircle(...P(4.1, -1.15), 0.5, LAMP, { aa: true });
  g.fillCircle(...P(4.1, 1.15), 0.5, LAMP, { aa: true });
  if (brake > 0.05) {
    g.fillCircle(...P(-4.3, -1.5), 0.55 + brake * 0.4, BRAKE, { aa: true, a: Math.min(1, brake) });
    g.fillCircle(...P(-4.3, 1.5), 0.55 + brake * 0.4, BRAKE, { aa: true, a: Math.min(1, brake) });
  }
}

export function mulTint(c, t) {
  if (t === 0xffffff) return c;
  let r = (R(c) * R(t)) >> 8, g = (G(c) * G(t)) >> 8, b = (B(c) * B(t)) >> 8;
  if (r > 255) r = 255; if (g > 255) g = 255; if (b > 255) b = 255;
  return (r << 16) | (g << 8) | b;
}

// ------------------------------------------------------------ the hand
const SKIN = hex('ecb48c'), SKIN_D = hex('b97c58'), SLEEVE = hex('f06a1c'), SLEEVE_D = hex('b84a10'), CUFF = hex('f4efe6');

/**
 * A giant hand reaching onto the board, pinching at (gx, gy). The arm comes
 * from direction `dir` (radians, screen; -PI/2 = from the top edge). `s`
 * scale (closer to the eye when lifting), `open` 0 pinched .. 1 open, `lift`
 * its height (shadow offset), `tint` the light.
 */
export function drawHand(g, gx, gy, { s = 1, open = 0, lift = 0, tint = 0xffffff, dir = -Math.PI / 2 } = {}) {
  const k = (c) => mulTint(c, tint);
  const o = open * 1.8;
  // local frame: geometry is drawn for an arm from the top, then turned
  const ca = cos(dir + Math.PI / 2), sa = sin(dir + Math.PI / 2);
  const X = (dx, dy) => gx + (ca * dx - sa * dy) * s;
  const Y = (dx, dy) => gy + (sa * dx + ca * dy) * s;
  const sx = 3 + lift * 6, sy = 4 + lift * 7;
  const line = (ax, ay, bx, by, w, c, a = 1, ox = 0, oy = 0) => g.thickLine(X(ax, ay) + ox, Y(ax, ay) + oy, X(bx, by) + ox, Y(bx, by) + oy, w * s, c, { aa: true, a });
  const disc = (x, y, r, c, ox = 0, oy = 0) => g.fillCircle(X(x, y) + ox, Y(x, y) + oy, r * s, c, { aa: true });
  const L = 70 / s;
  // shadow on the board
  line(9, -L, 5.5, -15, 9, 0x000000, 0.22, sx, sy);
  g.fillCircle(X(3, -8) + sx, Y(3, -8) + sy, 6 * s, 0x000000, { aa: true, a: 0.22 });
  // arm in a marshal's orange sleeve, a white cuff
  line(9, -L, 5.5, -15, 9.5, k(SLEEVE_D));
  line(8.2, -L, 4.7, -15, 7.5, k(SLEEVE));
  line(5.1, -16, 5.8, -14.4, 8.6, k(CUFF));
  // back of the hand
  disc(3.2, -8.2, 5.9, k(SKIN_D));
  disc(2.8, -8.6, 5.1, k(SKIN));
  // curled fingers: knuckles down one side
  for (let q = 0; q < 3; q++) {
    const fx = 7.2 + q * 0.4, fy = -(3.6 + q * 2.6);
    disc(fx, fy, 1.7, k(SKIN_D));
    disc(fx - 0.3, fy - 0.2, 1.35, k(SKIN));
  }
  // thumb and index finger pinch at the grip point
  line(-3, -10, -(0.9 + o), -0.4, 3.1, k(SKIN_D));
  line(-3, -10, -(1.1 + o), -0.8, 2.3, k(SKIN));
  line(5, -5, 1.3 + o, 0.2, 2.9, k(SKIN_D));
  line(5, -5.4, 1.2 + o, -0.2, 2.1, k(SKIN));
  // nails
  disc(-(1.0 + o), -1.2, 0.7, k(0xf8dcc8));
  disc(1.5 + o, -0.6, 0.7, k(0xf8dcc8));
}
// ------------------------------------------------------------ the marshal
const FLAG = { yellow: hex('ffd21a'), green: hex('2ec44a') };
/** The marshal's post by the track, top centre: a flag on a pole, waving when `wave` > 0. */
export function drawMarshal(g, x, y, kind, wave, tod, tint) {
  const k = (c) => mulTint(c, tint);
  g.fillRect(x - 3, y - 2, 7, 6, k(0xe8e6e0));
  g.fillRect(x - 3, y + 4, 7, 1, k(0x8a8880));
  g.fillCircle(x + 0.5, y + 1, 1.8, k(SLEEVE), { aa: true });   // the marshal, from above
  g.fillCircle(x + 0.5, y + 1, 1.0, k(0xf4f4f4), { aa: true }); // helmet
  if (!kind) return;
  // the flag: a waving quad on a pole from the marshal's hand
  const px = x + 2.5, py = y + 2;
  const big = kind === 'chequered' ? 1.6 : 1;
  const sw = wave * sin(tod * 11), L = 7 * big;
  const ex = px + L * cos(-0.6 + sw * 0.7), ey = py + L * sin(-0.6 + sw * 0.7);
  const fl = (q) => [px + (ex - px) * q, py + (ey - py) * q];
  const nx = -(ey - py) / L, ny = (ex - px) / L, rip = 0.8 * sin(tod * 17);
  const fw = 5 * big, quad = [fl(0.35), fl(1), [ex + nx * fw + rip, ey + ny * fw - rip], [fl(0.35)[0] + nx * fw, fl(0.35)[1] + ny * fw]];
  g.thickLine(px, py, ex, ey, 0.7, k(0x303030), { aa: true });
  if (kind === 'chequered') {
    g.fillPolygon(quad, k(0xf6f6f6), { aa: true });
    // checks: the four sub-quads alternate
    const lerp2 = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++) {
        if ((i + j) & 1) continue;
        const A = lerp2(lerp2(quad[0], quad[1], i / 3), lerp2(quad[3], quad[2], i / 3), j / 3);
        const Bq = lerp2(lerp2(quad[0], quad[1], (i + 1) / 3), lerp2(quad[3], quad[2], (i + 1) / 3), j / 3);
        const C = lerp2(lerp2(quad[0], quad[1], (i + 1) / 3), lerp2(quad[3], quad[2], (i + 1) / 3), (j + 1) / 3);
        const D = lerp2(lerp2(quad[0], quad[1], i / 3), lerp2(quad[3], quad[2], i / 3), (j + 1) / 3);
        g.fillPolygon([A, Bq, C, D], k(0x18181c), { aa: true });
      }
  } else g.fillPolygon(quad, k(FLAG[kind]), { aa: true });
}

// ------------------------------------------------------------ the lap counter
// A slot-car lap counter's LCD: seven bars per digit, 4 x 7 px, drawn here.
const BARS = [0x3f, 0x06, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 0x07, 0x7f, 0x6f];
function lcdDigit(g, d, x, y, on, off) {
  const b = BARS[d];
  const seg = [[1, 0, 2, 1], [3, 1, 1, 2], [3, 4, 1, 2], [1, 6, 2, 1], [0, 4, 1, 2], [0, 1, 1, 2], [1, 3, 2, 1]];
  for (let k = 0; k < 7; k++) { const [sx, sy, w, h] = seg[k]; g.fillRect(x + sx, y + sy, w, h, (b >> k) & 1 ? on : off); }
}
// "LAP", 3 x 5, drawn for the counter's printed label
const LAPS = [['100', '100', '100', '100', '111'], ['010', '101', '111', '101', '101'], ['110', '101', '110', '100', '100']];
/** The lap counter on the pit wall: the leader's laps this hour (the hour is the race), in the leader's colour tab. */
export function drawLapCounter(g, laps, leader, tint) {
  const k = (c) => mulTint(c, tint);
  g.fillRect(1, 69, 32, 8, k(0x16181c));
  g.fillRect(1, 69, 32, 1, k(0x34383f));
  const ink = k(TEAM[leader]);
  for (let c = 0; c < 3; c++) {
    const rows = LAPS[c];
    for (let y = 0; y < 5; y++) for (let x = 0; x < 3; x++) if (rows[y][x] === '1') g.fillRect(3 + c * 4 + x, 71 + y, 1, 1, ink);
  }
  let n = laps % 1000;
  const on = k(0xe8a028), off = k(0x2c2418);
  for (let d = 2; d >= 0; d--) { lcdDigit(g, n % 10, 16 + d * 5, 70, on, off); n = Math.floor(n / 10); }
}

// ------------------------------------------------------------ the pit crew
const SUIT = 0x2a2e36;
/** Three mechanics round a car in its box: out of the garage as it stops, back as it leaves (k 0..1). */
export function drawCrew(g, x, team, k, tod, tint) {
  if (k <= 0) return;
  const m = (c) => mulTint(c, tint);
  const spots = [[-7, 72.5], [7, 72.5], [0, 76.2]];
  for (let q = 0; q < 3; q++) {
    const [dx, dy] = spots[q], gxp = x + dx * 0.6, gyp = 78.5;
    const px = gxp + (x + dx - gxp) * k + (k >= 1 ? 0.3 * sin(tod * 20 + q * 2) : 0), py = gyp + (dy - gyp) * k;
    g.fillEllipse(px, py, 1.7, 1.1, m(SUIT), { aa: true });
    g.fillCircle(px, py, 0.9, m(TEAM[team]), { aa: true });
  }
}
