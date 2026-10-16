// Dachshund park: the lawn seen from above, as a flat print. A 320-px loop
// of park (the dogs run one lap of it at the hour) baked at load into a byte
// map of palette slots, painted through a palette per time of day: a mown
// lawn, a flowerbed of tulips and a lime tree along the top, a pond with lily
// pads, a sand path with a bench and a lamp along the bottom.

import { rand, noise, hash, sin, cos, to565, mix, clamp } from '../js/kit.js';

export const PW = 320, PH = 80;
const W = 160, H = 80;

// palette slots
export const P = {
  LAWN: 0, CLOVER: 1, BLADE: 2, DAISY: 3, YELLOW: 4, SAND: 5, SAND_D: 6, PEBBLE: 7, SOIL: 8,
  TULIP: 9, TULIP2: 10, LEAF: 11, CAN_D: 12, CAN_M: 13, CAN_L: 14, WATER: 15, WATER_L: 16,
  PAD: 17, WOOD: 18, WOOD_D: 19, STONE: 20, LAMP: 21, KEYL: 22, EDGE: 23,
};
const NS = 24;

// ---------------------------------------------------------------- the map (flash)

export const MAP = new Uint8Array(PW * PH);
(function build() {
  const put = (x, y, k) => { if (y >= 0 && y < PH) MAP[y * PW + (((x % PW) + PW) % PW)] = k; };
  const dist2 = (x, y, cx, cy) => { let dx = Math.abs(x - cx); if (dx > PW / 2) dx = PW - dx; return dx * dx + (y - cy) * (y - cy); };
  for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
    let k = P.LAWN;
    const xp = x + 0.5, yp = y + 0.5;
    // the sand path along the bottom, gently winding
    const pathTop = 71.5 + 1.6 * Math.sin((xp / PW) * Math.PI * 4) + 0.8 * Math.sin((xp / PW) * Math.PI * 10 + 1);
    if (yp > pathTop) k = yp < pathTop + 1 ? P.SAND_D : (rand(x, y, 7) < 0.05 ? P.PEBBLE : P.SAND);
    // the flowerbed along the top-left of the loop
    const bedEnd = 112, bedBot = 5.2 + 1.2 * Math.sin(xp * 0.21);
    if (x < bedEnd && yp < bedBot) k = yp > bedBot - 1 ? P.EDGE : P.SOIL;
    // the lime tree: a canopy overhanging the top edge
    const ct = dist2(xp, yp, 150, -13);
    if (ct < 23 * 23) {
      const n = noise(xp / 4, 3) + noise(yp / 4 + 9, 4) * 0.8;
      k = ct > 22 * 22 ? P.KEYL : n > 1.05 ? P.CAN_L : n > 0.62 ? P.CAN_M : P.CAN_D;
    }
    // the pond, top right of the loop, with a stone rim
    const pdx = Math.min(Math.abs(xp - 244), PW - Math.abs(xp - 244)), pe = (pdx / 40) ** 2 + ((yp + 7) / 16) ** 2;
    if (pe < 1) k = pe > 0.8 ? P.STONE : P.WATER;
    // sparse lawn texture: clover and daisies (kept off the middle band)
    if (k === P.LAWN) {
      const r = rand(x >> 1, y >> 1, 11);
      if ((y < 12 || y > 66) && r < 0.06) k = P.CLOVER;
    }
    MAP[y * PW + x] = k;
  }
  // tulips in the bed: two-pixel heads on leaves
  for (let i = 0; i < 26; i++) {
    const x = 3 + i * 4.2 + (rand(i, 5) - 0.5) * 2, y = 1 + rand(i, 6) * 2.5;
    const xi = Math.round(x), yi = Math.round(y);
    put(xi, yi + 1, P.LEAF); put(xi + 1, yi + 1, P.LEAF);
    put(xi, yi, i % 3 ? P.TULIP : P.TULIP2); put(xi + 1, yi, i % 3 ? P.TULIP : P.TULIP2);
  }
  // lily pads and ripples
  for (const [x, y] of [[224, 2], [252, 4], [262, 1], [236, 6]]) {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -2; dx <= 2; dx++) if (dx * dx + dy * dy * 3 <= 4) put(x + dx, y + dy, P.PAD);
    put(x + 1, y, P.WATER);
  }
  for (const [x, y] of [[214, 5], [270, 4], [246, 1]]) { put(x, y, P.WATER_L); put(x + 1, y, P.WATER_L); put(x + 2, y, P.WATER_L); }
  // daisies dotted on the lawn near the edges
  for (let i = 0; i < 30; i++) {
    const x = Math.floor(rand(i, 21) * PW), y = rand(i, 22) < 0.5 ? 8 + Math.floor(rand(i, 23) * 4) : 66 + Math.floor(rand(i, 24) * 4);
    if (MAP[y * PW + x] !== P.LAWN && MAP[y * PW + x] !== P.CLOVER) continue;
    put(x, y, P.YELLOW); put(x - 1, y, P.DAISY); put(x + 1, y, P.DAISY); put(x, y - 1, P.DAISY); put(x, y + 1, P.DAISY);
  }
  // the bench on the path (top-down: slats)
  for (let y = 74; y < 80; y++) for (let x = 196; x < 222; x++) put(x, y, y === 74 || x === 196 || x === 221 ? P.WOOD_D : y % 2 ? P.WOOD : P.WOOD_D);
  // the lamp post at the path's edge (bottom-left at rest)
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (dx * dx + dy * dy <= 5) put(6 + dx, 75 + dy, dx * dx + dy * dy <= 2 ? P.LAMP : P.KEYL);
  // a second lamp half a loop on
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (dx * dx + dy * dy <= 5) put(166 + dx, 75 + dy, dx * dx + dy * dy <= 2 ? P.LAMP : P.KEYL);
})();
export const LAMPS = [[6, 75], [166, 75]];

// ---------------------------------------------------------------- palettes

const DAY = {
  LAWN: 0x3f7a33, CLOVER: 0x356b2b, BLADE: 0x5b9a44, DAISY: 0xf4f1e4, YELLOW: 0xf2c838, SAND: 0xd9bf8a, SAND_D: 0xb39a68,
  PEBBLE: 0xbfa676, SOIL: 0x5a3b24, TULIP: 0xe8343c, TULIP2: 0xf49a2a, LEAF: 0x2f6a2c, CAN_D: 0x1f4a22, CAN_M: 0x2c6430,
  CAN_L: 0x46843c, WATER: 0x3f8fc0, WATER_L: 0x9ad4ee, PAD: 0x5aa83a, WOOD: 0xa86a38, WOOD_D: 0x6e4224, STONE: 0x9a9a8e,
  LAMP: 0x3a3a3a, KEYL: 0x1c2a14, EDGE: 0x3a2818,
};
const GOLD = { ...DAY, LAWN: 0x4a7a2e, CLOVER: 0x3e6a26, BLADE: 0x6e9c40, SAND: 0xe2b880, SAND_D: 0xb88e5c, PEBBLE: 0xc89c6c, WATER: 0x5a8ab0, WATER_L: 0xf0c890, CAN_L: 0x6a8a38 };
const NIGHT = {
  LAWN: 0x15302a, CLOVER: 0x112822, BLADE: 0x214238, DAISY: 0x8a96a4, YELLOW: 0x7a7448, SAND: 0x4a4a52, SAND_D: 0x383a44,
  PEBBLE: 0x55555e, SOIL: 0x1c1816, TULIP: 0x5a2238, TULIP2: 0x5a3a2a, LEAF: 0x12281e, CAN_D: 0x0c1c16, CAN_M: 0x12261e,
  CAN_L: 0x1a3226, WATER: 0x14284a, WATER_L: 0x5a7aa8, PAD: 0x1e3a24, WOOD: 0x3e3028, WOOD_D: 0x2a201c, STONE: 0x3a3e44,
  LAMP: 0xfff0b8, KEYL: 0x0a140e, EDGE: 0x120e0c,
};
const NAMES = Object.keys(P);
const arr = (o) => NAMES.map((n) => o[n]);
const PAL_DAY = arr(DAY), PAL_GOLD = arr(GOLD), PAL_NIGHT = arr(NIGHT);

/** How golden the light is at hour h (fractional): mornings a little, evenings fully. */
export function goldAt(hf) {
  if (hf < 5 || hf > 21) return 0;
  if (hf < 8) return 0.5 * (1 - Math.abs(hf - 6.5) / 1.5);
  if (hf > 17) return clamp(1 - Math.abs(hf - 19) / 2, 0, 1);
  return 0;
}

export const PAL565 = new Uint16Array(NS);
export const PALRGB = new Array(NS);
/** Set the park palette for this frame. night 0..1, gold 0..1. */
export function setPalette(night, gold) {
  for (let i = 0; i < NS; i++) {
    let c = gold > 0 ? mix(PAL_DAY[i], PAL_GOLD[i], gold) : PAL_DAY[i];
    if (night > 0) c = mix(c, PAL_NIGHT[i], night);
    PALRGB[i] = c; PAL565[i] = to565(c);
  }
}

/** The park at scroll offset `sx` (px along the loop). */
export function park(g, sx) {
  const buf = g.buf, o = ((Math.round(sx) % PW) + PW) % PW;
  for (let y = 0, i = 0; y < H; y++) {
    const row = y * PW;
    for (let x = 0; x < W; x++, i++) { let u = x + o; if (u >= PW) u -= PW; buf[i] = PAL565[MAP[row + u]]; }
  }
  g.cost.px += W * H; g.cost.box += W * H * 2;
}

// ---------------------------------------------------------------- live things in the park

/** Grass tufts that lean as a gust runs across the lawn. */
const TUFTS = [];
for (let i = 0; i < 40; i++) TUFTS.push([Math.floor(rand(i, 31) * PW), 10 + Math.floor(rand(i, 32) * 58), rand(i, 33)]);
export function tufts(g, sx, T, night) {
  const c = PAL565[P.BLADE], d = PAL565[P.CLOVER], buf = g.buf;
  for (const [px, y, ph] of TUFTS) {
    let x = px - Math.round(sx); x = ((x % PW) + PW) % PW; if (x >= W - 1 || x < 1) continue;
    // a gust front sweeps left to right every 6 s
    const gust = sin((T * 0.17 - x / 400) * Math.PI * 2) > 0.6 ? 1 : 0;
    const lean = gust + (sin(T * 2.2 + ph * 6) > 0.3 ? 1 : 0);
    const i = y * W + x;
    buf[i] = d; buf[i - W + lean - 1] = c; buf[i - W + lean + 1] = c; buf[i - 2 * W + lean] = c;
  }
  g.cost.px += 160;
}

/** A butterfly: flutter (wings open and shut) along a closed-form path. */
export function butterfly(g, x, y, T, col) {
  const open = sin(T * 40) > 0;
  const xi = Math.round(x), yi = Math.round(y);
  if (open) { g.fillRect(xi - 2, yi - 1, 2, 2, col); g.fillRect(xi + 1, yi - 1, 2, 2, col); }
  else { g.fillRect(xi - 1, yi - 1, 1, 2, col); g.fillRect(xi + 1, yi - 1, 1, 2, col); }
  g.fillRect(xi, yi - 1, 1, 3, 0x2a1a10);
}

/** A squirrel from above, running (x, y nose), facing dir (+1 right, -1 left). */
export function squirrel(g, x, y, dir, T, night) {
  const fur = night ? 0x4a3a34 : 0xa0582c, belly = night ? 0x6a5a50 : 0xd89a5c, k = 0x24160c;
  const b = Math.round(sin(T * 30) * 0.8);
  const xi = Math.round(x), yi = Math.round(y);
  // tail: a big bushy plume behind
  g.fillEllipse(xi - dir * 9, yi - 1 + b, 4.2, 3.2, k, { aa: true });
  g.fillEllipse(xi - dir * 9, yi - 1 + b, 3.2, 2.2, belly, { aa: true });
  g.fillEllipse(xi - dir * 3.5, yi, 4, 2.6, k, { aa: true });
  g.fillEllipse(xi - dir * 3.5, yi, 3.1, 1.7, fur, { aa: true });
  g.fillCircle(xi, yi, 2.1, k, { aa: true });
  g.fillCircle(xi, yi, 1.4, fur, { aa: true });
  g.pixel(xi - dir, yi - 2, k); g.pixel(xi - dir, yi + 2, k);
}

/** A tennis ball from above, with its seam turning. */
export function ball(g, x, y, r, spin, night, a = 1) {
  const fz = night ? 0x7a8640 : 0xd8e848, seam = night ? 0xb0b0a0 : 0xffffff;
  g.fillCircle(x, y, r + 0.9, 0x1c2410, { aa: true, a });
  g.fillCircle(x, y, r, fz, { aa: true, a });
  const c = cos(spin), s = sin(spin);
  const pts = [];
  for (let i = -3; i <= 3; i++) {
    const u = i / 3, px = u * r * 0.85, py = (u * u - 0.5) * r * 0.75;
    pts.push([x + px * c - py * s, y + px * s + py * c]);
  }
  g.stroke(pts, 0.9, seam, { aa: true, a });
}

/** Fireflies drifting over the lawn at night. */
export function fireflies(g, T, n) {
  for (let i = 0; i < 7; i++) {
    const x = 8 + ((rand(i, 71) * 144 + 6 * sin(T * 0.31 + i) + T * (0.8 + rand(i, 72))) % 144);
    const y = 6 + rand(i, 73) * 68 + 5 * sin(T * 0.43 + i * 2.1);
    const b = 0.5 + 0.5 * sin(T * (1.1 + rand(i, 74)) + i * 1.7);
    if (b < 0.2) continue;
    g.fillCircle(x, y, 2.2, 0xc8f060, { aa: true, a: 0.3 * b * n });
    g.fillCircle(x, y, 0.9, 0xf4ffb0, { aa: true, a: Math.min(1, b * 1.4) * n });
  }
}

/** Lamp light pools at night (only the lamps on screen). */
export function lampGlow(g, sx, n) {
  for (const [lx, ly] of LAMPS) {
    let x = lx - Math.round(sx); x = ((x % PW) + PW) % PW; if (x > W + 20) x -= PW;
    if (x < -20 || x > W + 20) continue;
    g.fillCircle(x + 0.5, ly + 0.5, 20, 0xffd88a, { a: 0.10 * n });
    g.fillCircle(x + 0.5, ly + 0.5, 13, 0xffd88a, { a: 0.10 * n });
    g.fillCircle(x + 0.5, ly + 0.5, 7, 0xffe0a0, { a: 0.14 * n });
  }
}
export { hash };
