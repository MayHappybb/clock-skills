// Lighthouse: Fl W 5s. A rock light in a night gale, seen from the shore. Its
// beam turns once every five seconds; seen from here the turning beam is a
// spoke of lit rain that wheels round the lantern (right, up, left, down
// behind the tower), widening as it swings towards you, until it looks
// straight at you and the whole glass goes white. The time is not on the
// scene at all: it is in your eye. Each flash burns the time onto the retina,
// and what you see between flashes is its afterimage, floating over the storm.
//
// How to read it: hours left of the tower, minutes right, the lighthouse
// itself the separator. Right after a flash they come out of the glare
// white-hot and crisp; over the next five seconds the afterimage goes through
// the "flight of colours" an afterimage really goes through (white, straw,
// amber, rose, magenta, violet, blue), softens, spreads a fringe of the next
// colour, and jumps a pixel when the eye flicks (micro-saccades). Where it
// lies over something bright (the beam swinging through it) it turns into
// the negative afterimage, a dark violet shape on the light. Then the
// beam comes round again and re-burns it. Once a minute you blink: the lids
// close over the storm and the afterimage glows brighter in the dark.
//
// The minute turns inside a flash: the flash at :00 is the one that burns
// the new minute (the old afterimage drowns in the rising glare before the
// peak, the new one emerges from the white after it), so the time is never
// wrong. On the hour a big sea breaks over the rock, the spray climbs past
// the lantern just as the light looks at you, and the flash lights the whole
// plume; lightning goes off before it and both ships answer.
//
// Around that: the storm. Clouds racing, rain slanting through the beam
// (streaks glitter warm only where the beam is), seas running in to the rock
// and bursting on it every few seconds, two ships on the horizon that answer
// the light with an Aldis lamp, sheet lightning now and then, a keeper's
// window lit at the foot of the tower.
//
// Palette: the world is cold and low (slate, ink-blue sea, wet grey rain,
// a red-and-white tower in shadow) so that the only saturated colours on the
// glass are the lamp's warm white and the afterimage's flight of colours.
// Hard pixels for the scene's small things (tower, ships, rain, spray), a
// coarse grid for sky, sea and beam scattering (soft by nature), and the
// afterimage from baked distance fields through a colour table each frame.

import { clamp, noise2, rand, hash, mix, hex, from565 } from '../js/kit.js';
import { bake, MARGIN, Q } from './lighthouse-glyphs.js';

const W = 160, H = 80;
const HY = 54;                 // horizon
const LX = 80, LY = 18.5;      // the lamp, on screen
const F = 120;                 // focal length, px
const D = 1;                   // lamp's distance from the camera
const HL = (HY - LY) / F;      // lamp height above the eye, same units
const PERIOD = 5;              // Fl W 5s
const ALPHA = 0.07;            // the beam's half-angle, rad

// The numerals, baked once.
const SCALE = 1.25;
const GL = bake(SCALE);
const DIGIT_X = [9.5, 39.5, 98, 128];
const DIGIT_Y = 7.5;

// Colours.
const C = {
  skyTop: hex('#0b111b'), skyHor: hex('#253244'),
  cloud: hex('#2f3a4b'), gap: hex('#0a0f18'),
  seaHor: hex('#142130'), seaNear: hex('#070d13'),
  foam: hex('#4d6876'),
  beam: hex('#ffe0a0'), lamp: hex('#fff6dc'), glare: hex('#fff3d8'),
  rain: hex('#5a6a7c'), rainLit: hex('#fff0c4'),
  bolt: hex('#efeaff'), sheet: hex('#8f97c4'),
  rock: hex('#070a0e'), rockEdge: hex('#1b2530'),
  white: hex('#7f8996'), red: hex('#5c2227'), whiteLit: hex('#e4e8f2'), redLit: hex('#c0424a'),
  iron: hex('#14171c'), dome: hex('#3a1517'),
  glass: hex('#a0763a'), lens: hex('#fffbea'),
  wall: hex('#262c34'), roof: hex('#170f12'), window: hex('#ffb24a'),
  hull: hex('#05080c'), mast: hex('#e8eef8'), port: hex('#ff3a2a'), stbd: hex('#2aff7a'), aldis: hex('#fff2c0'),
  spray: hex('#a9bcc8'), lid: hex('#0c0607'),
};

// The flight of colours, by seconds since the flash.
const FLIGHT = [
  [0.0, hex('#ffffff')], [0.35, hex('#fff6c4')], [0.9, hex('#ffd65a')], [1.6, hex('#ff9c3a')],
  [2.3, hex('#ff5c6a')], [3.0, hex('#ff4cb2')], [3.7, hex('#d070ff')], [4.4, hex('#8c88ff')],
  [5.0, hex('#5cc4ff')], [6.2, hex('#3fd8c8')],
];
function flight(a) {
  if (a <= FLIGHT[0][0]) return FLIGHT[0][1];
  for (let i = 1; i < FLIGHT.length; i++)
    if (a < FLIGHT[i][0]) {
      const [a0, c0] = FLIGHT[i - 1], [a1, c1] = FLIGHT[i];
      return mix(c0, c1, (a - a0) / (a1 - a0));
    }
  return FLIGHT[FLIGHT.length - 1][1];
}

const rgbOf = (...cs) => cs.flatMap((c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255]);
const SKY = rgbOf(C.skyTop, C.skyHor, C.gap, C.cloud);
const SEA = rgbOf(C.seaHor, C.seaNear, C.foam);
const NEG = rgbOf(hex('#1c1238'));    // the negative afterimage's colour on a bright field
// per grid row of the sea (cell 4): depth 0..1 and its square root
const SEA_V = Array.from({ length: 8 }, (_, j) => Math.min(1, (j * 4) / (H - HY)));
const SEA_SQ = SEA_V.map(Math.sqrt);

const R8 = (c) => (c >> 16) & 255, G8 = (c) => (c >> 8) & 255, B8 = (c) => c & 255;
const pack = (r, g, b) => ((r > 255 ? 255 : r < 0 ? 0 : r | 0) << 16) | ((g > 255 ? 255 : g < 0 ? 0 : g | 0) << 8) | (b > 255 ? 255 : b < 0 ? 0 : b | 0);
const smooth = (e) => e * e * (3 - 2 * e);

// ------------------------------------------------------------ the beam

function project(X, Y, Z) { return [LX + (F * X) / Z, HY - (F * Y) / Z]; }
function farPoint(gx, gy, gz) {
  let s = 8;
  if (gz < 0) s = Math.min(s, (D - 0.06) / -gz);
  return project(gx * s, HL + gy * s, D + gz * s);
}

/** The beam at turn angle phi (0 = looking at the camera) as a wedge on the glass. */
function beamGeom(phi) {
  const sn = Math.sin(phi), cs = Math.cos(phi);
  const dx = -sn, dz = -cs;
  const [qx, qy] = farPoint(dx, 0, dz);
  let ux = qx - LX, uy = qy - LY;
  const len = Math.sqrt(ux * ux + uy * uy);
  ux /= len; uy /= len;
  const ca = Math.cos(ALPHA), sa = Math.sin(ALPHA);
  const gens = [
    [-(sn * ca + cs * sa), 0, -(cs * ca - sn * sa)],
    [-(sn * ca - cs * sa), 0, -(cs * ca + sn * sa)],
    [dx * ca, sa, dz * ca],
    [dx * ca, -sa, dz * ca],
  ];
  let beta = 0;
  for (const [gx, gy, gz] of gens) {
    const [px, py] = farPoint(gx, gy, gz);
    const wx = px - LX, wy = py - LY;
    const ang = Math.abs(Math.atan2(ux * wy - uy * wx, ux * wx + uy * wy));
    if (ang > beta) beta = ang;
  }
  const fwd = (1 + cs) / 2;
  return {
    ux, uy,
    tanB: Math.tan(Math.min(beta, 1.45)),
    fade: clamp(len * 0.4, 14, 150),
    i0: 0.42 + 0.58 * fwd * fwd * fwd,
  };
}

function beamAt(b, px, py) {
  const rx = px - LX, ry = py - LY;
  const along = rx * b.ux + ry * b.uy;
  if (along < -1) return 0;
  const al = along > 0 ? along : 0;
  const across = Math.abs(rx * b.uy - ry * b.ux);
  const q = across / (al * b.tanB + 1.8);
  if (q >= 1) return 0;
  return b.i0 * smooth(1 - q) * (1 / (1 + al / b.fade));
}

// ------------------------------------------------------------ timeline

/** Lightning: [strength 0..1, strike x, bolt?] at absolute seconds T. */
function lightning(T, hourTau) {
  let best = [0, 0, false, 0];
  const k = Math.floor(T / PERIOD);
  const strikes = [];
  for (let kk = k - 1; kk <= k; kk++) if (rand(kk, 31) < 0.13) strikes.push([kk, kk * PERIOD + 1.6 + rand(kk, 32) * 1.8]);
  if (hourTau !== null) strikes.push([Math.floor(T - hourTau), T - hourTau - 2.3]);   // before the hour's flash
  for (const [kk, at] of strikes) {
    const u = T - at;
    if (u < 0 || u > 0.7) continue;
    // three pulses, the last the longest
    const p = Math.max(Math.exp(-(((u - 0.0) / 0.03) ** 2)), 0.7 * Math.exp(-(((u - 0.09) / 0.03) ** 2)),
      u > 0.18 ? Math.exp(-(u - 0.18) / 0.16) : Math.exp(-(((u - 0.18) / 0.03) ** 2)));
    if (p > best[0]) best = [p, 12 + rand(kk, 33) * 136, rand(kk, 34) < 0.6 || hourTau !== null, kk];
  }
  return best;
}

function drawBolt(g, x0, seed, s) {
  let x = x0, y = 0;
  const pts = [[x, y]];
  const r = (i) => rand(seed, i, 77);
  for (let i = 0; y < HY - 1; i++) {
    y = Math.min(HY - 1, y + 3 + r(i) * 4);
    x += (r(i + 100) - 0.5) * 7;
    pts.push([x, y]);
  }
  const col = C.bolt;
  for (let i = 1; i < pts.length; i++) {
    g.line(pts[i - 1][0] + 1, pts[i - 1][1], pts[i][0] + 1, pts[i][1], C.sheet, { a: 0.35 * s });
    g.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], col, { a: s });
  }
  // a branch
  const bi = 2 + Math.floor(r(500) * 3);
  if (bi < pts.length) {
    let [bx, by] = pts[bi];
    const dir = r(501) < 0.5 ? -1 : 1;
    for (let i = 0; i < 4; i++) {
      const nx = bx + dir * (2 + r(510 + i) * 4), ny = by + 2 + r(520 + i) * 3;
      g.line(bx, by, nx, ny, col, { a: 0.7 * s });
      bx = nx; by = ny;
    }
  }
}

// ------------------------------------------------------------ the scene

function drawTower(g, phi, lit) {
  const hw = (y) => 3.4 + ((y - 25) / 30) * 1.7;
  const bands = [[25, 31, 1], [31, 37, 0], [37, 43, 1], [43, 49, 0], [49, 56, 1]];
  for (const [y0, y1, red] of bands) {
    const base = red ? mix(C.red, C.redLit, lit) : mix(C.white, C.whiteLit, lit);
    g.fillPolygon([[LX - hw(y0), y0], [LX + hw(y0), y0], [LX + hw(y1), y1], [LX - hw(y1), y1]], base);
    // the side away from the lamp-lit sky is a shade darker
    g.fillPolygon([[LX + hw(y0) - 1.6, y0], [LX + hw(y0), y0], [LX + hw(y1), y1], [LX + hw(y1) - 1.8, y1]], mix(base, 0x000000, 0.35));
  }
  g.fillRect(79, 51, 2, 4, C.iron);          // door
  g.pixel(80, 34, C.iron); g.pixel(80, 45, C.iron);
  // gallery and lantern
  g.fillRect(73, 23, 14, 2, C.iron);
  g.hline(74, 21, 12, C.iron, { a: 0.8 });
  g.vline(74, 21, 2, C.iron); g.vline(85, 21, 2, C.iron);
  const fwd = Math.cos(phi);
  g.fillRect(76, 15, 8, 7, mix(C.glass, C.lamp, 0.25 + 0.45 * Math.max(0, fwd)));
  // the lens panel, the bright bull's-eye, crossing the lantern as it turns
  const sx = LX - 3.4 * Math.sin(phi);
  if (fwd > -0.2) g.fillRect(Math.round(sx - 1), 15, 2 + (fwd > 0.85 ? 2 : 0), 7, C.lens, { a: clamp(0.35 + fwd, 0, 1) });
  g.line(76, 21, 83, 15, C.iron, { a: 0.55 });
  g.line(76, 16, 81, 21, C.iron, { a: 0.4 });
  g.fillPolygon([[75, 15], [85, 15], [83.5, 12.5], [80, 11], [76.5, 12.5]], C.dome);
  g.fillRect(79, 9, 2, 2, C.iron);
  g.vline(80, 6, 3, C.iron);
}

function drawIslet(g, lit) {
  g.fillPolygon([[56, 61], [61, 56], [66, 53], [71, 52.2], [77, 52.6], [86, 51.6], [93, 52.8], [99, 55.5], [105, 61]], C.rock);
  g.hline(66, 53, 5, mix(C.rockEdge, C.sheet, lit), { a: 0.9 });
  g.hline(88, 52, 5, mix(C.rockEdge, C.sheet, lit), { a: 0.9 });
  // keeper's cottage
  g.fillRect(87, 48, 8, 5, mix(C.wall, C.white, lit * 0.6));
  g.fillPolygon([[86, 48.5], [91, 45], [96, 48.5]], C.roof);
  g.fillRect(89, 50, 1, 1, C.window); g.fillRect(92, 50, 1, 1, C.window, { a: 0.8 });
}

function drawShips(g, T, a, k, lit, hour) {
  const ships = [
    { x: ((8 + T * 0.21) % 200) - 20, dir: 1, seed: 1 },
    { x: 180 - (((40 + T * 0.13) % 200)), dir: -1, seed: 2 },
  ];
  ships.forEach((s, i) => {
    if (s.x > 54 && s.x < 106) return;       // behind the rock
    const x = Math.round(s.x), bob = Math.sin(T * 1.7 + i * 2) > 0.3 ? 1 : 0, y = HY - 2 + bob;
    g.fillRect(x - 3, y, 7, 2, C.hull);
    g.fillRect(x + (s.dir > 0 ? -2 : 0), y - 2, 3, 2, C.hull);
    g.vline(x, y - 4, 2, C.hull);
    g.pixel(x, y - 4, C.mast, { a: 0.9 });
    g.pixel(x + (s.dir > 0 ? 3 : -3), y, s.dir > 0 ? C.stbd : C.port, { a: 0.9 });
    // the answer: two flashes of an Aldis lamp from the bridge after the light passes
    const mine = hour || (k + i) % 2 === 0;
    const u = a - 0.95 - i * 0.25 * (hour ? 1 : 0);
    const on = mine && ((u > 0 && u < 0.18) || (u > 0.32 && u < 0.5) || (hour && u > 0.64 && u < 0.82));
    if (on) {
      const ax = x + (s.dir > 0 ? -1 : 1), ay = y - 2;
      g.pixel(ax, ay, C.aldis);
      g.pixel(ax - 1, ay, C.aldis, { a: 0.5 }); g.pixel(ax + 1, ay, C.aldis, { a: 0.5 });
      g.pixel(ax, ay - 1, C.aldis, { a: 0.4 }); g.pixel(ax - 2, ay, C.aldis, { a: 0.2 }); g.pixel(ax + 2, ay, C.aldis, { a: 0.2 });
    }
  });
}

function drawFoam(g, T, glow) {
  for (let j = 0; j < 7; j++) {
    const y = HY + 1 + Math.round(Math.pow(j, 1.5) * 1.72);
    const n = 3 + j, len = 2 + j * 1.6, sp = 2.5 + j * 2.2;
    for (let i = 0; i < n; i++) {
      const x0 = ((rand(i, j, 5) * 200 - T * sp) % 200 + 200) % 200 - 20;
      const life = (T * (0.35 + rand(i, j, 6) * 0.3) + rand(i, j, 7)) % 1;
      const a = Math.sin(life * Math.PI) * (0.35 + j * 0.06);
      const near = Math.exp(-(((x0 - LX) / 30) ** 2)) * glow;
      g.hline(Math.round(x0), y, Math.round(len * (0.6 + 0.4 * Math.sin(life * Math.PI))), mix(C.foam, C.beam, clamp(near, 0, 1)), { a });
    }
  }
  // the seas working round the foot of the rock
  for (let i = 0; i < 14; i++) {
    const x = 57 + i * 3.5 + Math.sin(T * 2 + i) * 1.5, ph = (T * 0.9 + rand(i, 9)) % 1;
    g.hline(Math.round(x), 58 + (i % 2), 2 + (ph < 0.5 ? 1 : 0), C.foam, { a: 0.4 + 0.4 * Math.sin(ph * Math.PI) });
  }
}

/** Spray bursts from seas hitting the rock; `big` is the hour's green sea. */
function drawSpray(g, T, b, glare, hourStart) {
  const events = [];
  const P = 3.7, k = Math.floor(T / P);
  for (let kk = k - 1; kk <= k; kk++) events.push({ t0: kk * P + rand(kk, 41) * 1.2, seed: kk, n: 26 + Math.floor(rand(kk, 42) * 20), hmax: 10 + rand(kk, 43) * 18, side: rand(kk, 44) });
  if (hourStart !== null) events.push({ t0: hourStart, seed: 99991, n: 240, hmax: 66, side: 0.5, big: true });
  const grav = 70;
  for (const e of events) {
    const age = T - e.t0;
    if (age < 0 || age > 3.2) continue;
    for (let j = 0; j < e.n; j++) {
      const r1 = rand(e.seed, j, 1), r2 = rand(e.seed, j, 2), r3 = rand(e.seed, j, 3);
      const delay = r3 * (e.big ? 0.6 : 0.25);
      const u = age - delay;
      if (u <= 0) continue;
      const h = e.hmax * (0.35 + 0.65 * r2);
      const vy = Math.sqrt(2 * grav * h);
      const x0 = e.big ? 62 + r1 * 36 : (e.side < 0.5 ? 60 + r1 * 16 : 84 + r1 * 16);
      const vx = (r1 - 0.5) * (e.big ? 26 : 16) - 5;
      const y = 56 - vy * u + 0.5 * grav * u * u;
      const life = (2 * vy) / grav * 0.85;
      if (u > life || y > 58) continue;
      const x = x0 + vx * u - 6 * u * u;          // the gale takes it left
      const fade = 1 - u / life;
      const lit = clamp(beamAt(b, x, y) * 1.4 + glare, 0, 1);
      const col = mix(C.spray, C.rainLit, lit);
      const al = clamp(fade * (0.55 + 0.45 * lit), 0, 1);
      if (e.big && r2 > 0.35) g.fillRect(Math.round(x), Math.round(y), 2, 2, col, { a: al * 0.85 });
      else g.pixel(x, y, col, { a: al });
      if (r2 > 0.8) g.pixel(x, y + 1, col, { a: fade * 0.35 });
    }
    if (e.big) {
      // the body of the sea going up the rock, then hanging as mist
      for (let j = 0; j < 9; j++) {
        const r1 = rand(e.seed, j, 11), r2 = rand(e.seed, j, 12);
        const u = age - r1 * 0.5;
        if (u <= 0) continue;
        const h = 18 + r2 * 40, vy = Math.sqrt(2 * grav * h), up = Math.min(u, vy / grav);
        const y = 56 - vy * up + 0.5 * grav * up * up + Math.max(0, u - vy / grav) * 6;
        const x = 66 + r1 * 28 - 9 * u;
        const rad = 4 + u * 5 + r2 * 3;
        const lit = clamp(beamAt(b, x, y) * 1.2 + glare, 0, 1);
        g.fillCircle(x, y, rad, mix(C.spray, C.rainLit, lit), { a: clamp(0.3 * (1 - u / 3.2) * (0.6 + 0.6 * lit), 0, 1) });
      }
    }
  }
}

function drawRain(g, T, b, flashLit, bolt) {
  const N = 150;
  for (let i = 0; i < N; i++) {
    const near = rand(i, 1) < 0.25;
    const v = (near ? 150 : 95) + rand(i, 2) * 45;
    const len = near ? 6 : 3 + Math.floor(rand(i, 3) * 2);
    const span = H + 16;
    const yt = T * v + rand(i, 4) * span * 7;
    const y = (yt % span) - 8;
    const x = ((((rand(i, 5) * 190 - 0.38 * yt) % 190) + 190) % 190) - 15;
    const lit = clamp(beamAt(b, x, y) * 1.7 + flashLit, 0, 1);
    const col = lit > 0 ? mix(C.rain, C.rainLit, lit) : C.rain;
    const a = clamp((near ? 0.42 : 0.26) + lit * 0.6 + bolt * 0.4, 0, 1);
    g.line(Math.round(x), Math.round(y), Math.round(x + 0.38 * len), Math.round(y - len), bolt > 0.3 ? C.sheet : col, { a });
  }
}

// ------------------------------------------------------------ the afterimage

const LUT_N = 96;
const lutA = new Float32Array(LUT_N), lutC = new Int32Array(LUT_N);

function drawAfterimage(g, digits, age, strength, ox, oy) {
  if (strength <= 0.01) return;
  const core = flight(age), fringe = flight(age + 1.1);
  const wc = 1.25 + 0.2 * age, soft = 0.55 + 0.32 * age;     // the image softens
  const hr = 3.2 + 0.75 * age, hk = 0.42;                      // and spreads
  let dmax = 0;
  for (let i = 0; i < LUT_N; i++) {
    const d = i / Q;
    const cc = clamp((wc - d) / soft + 0.5, 0, 1);
    const hv = d < hr ? hk * (1 - d / hr) * (1 - d / hr) : 0;
    const a = (cc + hv * (1 - cc)) * strength;
    lutA[i] = a > 1 ? 1 : a;
    lutC[i] = cc + hv > 0 ? mix(fringe, core, cc / (cc + hv * 0.8 + 1e-6)) : core;
    if (a > 0.02) dmax = i + 1;
  }
  let scanned = 0, drawn = 0;
  // fresh, the image is positive (bright); the negative appears as it ages
  const negK = clamp((age - 0.4) / 0.8, 0, 1);
  digits.forEach((dg, k) => {
    const gl = GL[dg], x0 = Math.round(DIGIT_X[k]) - MARGIN + ox, y0 = Math.round(DIGIT_Y) - MARGIN + oy;
    const f = gl.f;
    for (let y = 0; y < gl.h; y++) {
      const Y = y0 + y;
      if (Y < 0 || Y >= H) continue;
      for (let x = 0; x < gl.w; x++) {
        scanned++;
        const d = f[y * gl.w + x];
        if (d >= dmax) continue;
        const a = lutA[d];
        if (a <= 0.02) continue;
        const X = x0 + x;
        if (X < 0 || X >= W) continue;
        drawn++;
        // over a bright field (the beam, the glare) an afterimage reads dark: the negative image
        const bg = from565(g.buf[Y * W + X]);
        const lb = 0.3 * ((bg >> 16) & 255) + 0.55 * ((bg >> 8) & 255) + 0.15 * (bg & 255);
        let c = lutC[d];
        if (lb > 80 && negK > 0) {
          const sN = (lb > 170 ? 1 : (lb - 80) / 90) * negK;
          c = pack(R8(c) + (NEG[0] - R8(c)) * sN, G8(c) + (NEG[1] - G8(c)) * sN, B8(c) + (NEG[2] - B8(c)) * sN);
        }
        g.pixel(X, Y, c, { a });
      }
    }
  });
  g.cost.box += scanned * 2 + drawn * 6;    // a byte load and a compare per pixel; a luma test per drawn pixel; writes billed as blends
}

// ------------------------------------------------------------ frame

export default {
  name: 'Lighthouse',
  blurb: 'Fl W 5s: a rock light in a gale; each time its beam looks at you the flash burns the time into your eye, and its afterimage floats over the storm through the flight of colours until the next one.',
  fps: 60,

  frame(g, ctx) {
    const f = ctx.fields;
    ctx.lcd.backlight(1 - 0.55 * ctx.night);
    const T = f.h * 3600 + f.m * 60 + f.sec;            // seconds since midnight
    const k = Math.floor(T / PERIOD);
    const a = T - k * PERIOD;                           // since the last flash
    const tau = a < PERIOD / 2 ? a : a - PERIOD;        // to the nearest flash, signed
    const phi = (a / PERIOD) * Math.PI * 2;
    const hourTau = f.m === 0 && f.sec < 3.5 ? f.sec : f.m === 59 && f.sec > 56 ? f.sec - 60 : null;
    const hour = hourTau !== null;

    // glare: the in-beam flash (white-out) and the scatter that builds before it
    const white = tau < 0 ? Math.exp(-((tau / 0.065) ** 2)) : Math.exp(-tau / 0.12);
    const scatter = tau < 0 ? Math.exp(tau / 0.45) : Math.exp(-tau / 0.22);
    const b = beamGeom(phi);
    const [Lg, Lx, hasBolt, Lseed] = lightning(T, hour ? hourTau : null);

    // sky (float maths only per grid point: no rounding, no library calls but the noise)
    const drift = T * 5.5;
    const halo0 = 0.22 + 1.6 * scatter, halo1 = 30 + 900 * scatter;
    g.coarse((px, py) => {
      const v = py / HY, v2 = v * v;
      let n = noise2((px + drift) / 30, py / 9, 3) * 0.65 + noise2((px + drift * 1.6) / 12, py / 5, 4) * 0.35;
      n = n < 0.35 ? 0 : n > 0.8 ? 1 : (n - 0.35) * 2.2;
      const gp = 0.35 * (1 - v), cw = n * (0.5 + 0.5 * v);
      // base sky, darkened toward the gaps, then the cloud colour
      let r = SKY[0] + (SKY[3] - SKY[0]) * v2, gg = SKY[1] + (SKY[4] - SKY[1]) * v2, bb = SKY[2] + (SKY[5] - SKY[2]) * v2;
      r += (SKY[6] - r) * gp; gg += (SKY[7] - gg) * gp; bb += (SKY[8] - bb) * gp;
      r += (SKY[9] - r) * cw; gg += (SKY[10] - gg) * cw; bb += (SKY[11] - bb) * cw;
      const bm = beamAt(b, px, py) * (0.8 + 1.2 * n);
      const dx = px - LX, dy = py - LY;
      const halo = halo0 / (1 + (dx * dx + dy * dy) / halo1);
      const ax = px > Lx ? px - Lx : Lx - px;
      const li = Lg > 0 ? Lg * (0.25 + 0.9 * n) / (1 + ax / 70) : 0;
      r += 255 * bm + 255 * halo + 143 * li * 1.4;
      gg += 224 * bm + 238 * halo + 151 * li * 1.4;
      bb += 160 * bm + 200 * halo + 196 * li * 1.6;
      return pack(r, gg, bb);
    }, { cell: 4, box: [0, 0, W, HY] });

    // sea
    const wpath = 5 + 30 * scatter + 40 * white, pathK = 0.12 * b.i0 + 0.9 * scatter;
    g.coarse((px, py) => {
      const row = (py - HY) >> 2, v = SEA_V[row], z = 0.22 + v, sv = SEA_SQ[row];
      const sw = noise2(px * (0.07 / z) + T * 0.35, (py - HY) * (0.5 / z) - T * 0.6, 8);
      let r = SEA[0] + (SEA[3] - SEA[0]) * sv, gg = SEA[1] + (SEA[4] - SEA[1]) * sv, bb = SEA[2] + (SEA[5] - SEA[2]) * sv;
      const fo = sw < 0.62 ? 0 : sw > 0.91 ? 0.35 : (sw - 0.62) * 1.2;
      r += (SEA[6] - r) * fo; gg += (SEA[7] - gg) * fo; bb += (SEA[8] - bb) * fo;
      const q = (px - LX) / wpath;
      const path = (pathK * (0.3 + sw)) / (1 + q * q * (1 + q * q * 0.5));
      r += 255 * path + 70 * Lg * sw; gg += 225 * path + 76 * Lg * sw; bb += 170 * path + 110 * Lg * sw;
      return pack(r, gg, bb);
    }, { cell: 4, box: [0, HY, W, H - HY] });

    if (Lg > 0.15 && hasBolt) drawBolt(g, Lx, Lseed, clamp(Lg * 1.2, 0, 1));
    drawShips(g, T, a, k, Lg, hour && f.m === 0);
    drawFoam(g, T, scatter + white);
    drawIslet(g, Lg * 0.8);
    drawTower(g, phi, clamp(Lg * 0.9 + scatter * 0.25, 0, 1));
    drawSpray(g, T, b, white + scatter * 0.3, hour ? T - hourTau - 1.55 : null);
    drawRain(g, T, b, scatter * 0.25 + white, Lg);

    // the flash itself: the whole glass goes white
    if (white > 0.004) g.fillRect(0, 0, W, H, C.glare, { a: clamp(white, 0, 1) });

    // a blink, once a minute
    const bk = (hash(f.minuteKey, 61) % 8) + 2, ba = 2.1 + rand(f.minuteKey, 62) * 1.4;
    let lid = 0;
    const kInMin = Math.floor(f.sec / PERIOD);
    if (kInMin === bk && !hour) {
      const u = a - ba;
      lid = u < 0 ? 0 : u < 0.09 ? smooth(u / 0.09) : u < 0.2 ? 1 : u < 0.36 ? 1 - smooth((u - 0.2) / 0.16) : 0;
    }
    if (lid > 0) {
      for (let x = 0; x < W; x++) {
        const s = (x + 0.5 - W / 2) / (W / 2), arch = 1 - s * s;
        const top = lid * (41 + 5 * arch) - (1 - lid) * 4 * (1 - arch);
        const bot = H - lid * (40 + 2 * arch);
        if (top > 0) g.fillRect(x, 0, 1, Math.round(top), C.lid);
        if (bot < H) g.fillRect(x, Math.round(bot), 1, H - Math.round(bot), C.lid);
      }
    }

    // the afterimage: burned at the last flash, so it always shows this minute
    let ox = 0, oy = 0;
    for (const [j, at] of [[0, 1.2], [1, 2.35], [2, 3.4], [3, 4.25]]) {
      if (a < at || rand(k, j, 70) < 0.25) continue;
      ox += Math.floor(rand(k, j, 71) * 3) - 1;
      oy += Math.floor(rand(k, j, 72) * 3) - 1;
    }
    ox = clamp(ox, -2, 2); oy = clamp(oy, -2, 2);
    const flicker = 0.93 + 0.07 * Math.sin(T * 7.3) * Math.sin(T * 2.9);
    let strength = (0.62 + 0.38 * Math.exp(-a / 2.5)) * flicker * (hour && f.m === 0 ? 1.12 : 1);
    if (tau < 0) strength *= (1 - white) * (1 - 0.6 * scatter * scatter * scatter);  // the old image drowns in the glare
    strength *= 1 + 0.5 * lid;
    const digits = [f.hh[0], f.hh[1], f.mm[0], f.mm[1]].map(Number);
    drawAfterimage(g, digits, a, clamp(strength, 0, 1), ox, oy);
  },
};
