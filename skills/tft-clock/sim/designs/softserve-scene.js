// Soft Serve: the parlour around the numerals. The wall (pinstripes and the
// cold fog that rolls off the freezer), the chrome machine along the top with
// a star spout over each numeral, the waffle cones in the counter's holder
// (hours), the glass banana-split boat (minutes), the cherry-red counter.
// Everything is flat colour; the effects are one light sweep over chrome and
// glass, the fog, a lamp per spout and a drip on each cone.

import { to565, from565, hash, rand, noise2, sin } from '../js/kit.js';

export const W = 160, H = 80;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

// ------------------------------------------------------------ colour helpers (integer, no kit calls)
export const rgb = (r, g, b) => (r << 16) | (g << 8) | b;
export function mixc(a, b, u) {
  const k = (u * 256) | 0, j = 256 - k;
  return ((((a >> 16) & 255) * j + ((b >> 16) & 255) * k) >> 8) << 16 |
    ((((a >> 8) & 255) * j + ((b >> 8) & 255) * k) >> 8) << 8 |
    (((a & 255) * j + (b & 255) * k) >> 8);
}

// ------------------------------------------------------------ the wall (flash: two 8-step ramps, a fog tile)
// Deep parlour teal: calm, cool, and the complement of the warm pastels, so
// the soft serve is the brightest, warmest thing on the glass.
const WALL_DAY = [0x0c3a44, 0x0f414c, 0x124955, 0x16525e, 0x1a5b67, 0x1f6571, 0x256f7b, 0x2b7884];
const WALL_NIGHT = [0x061b21, 0x071f26, 0x09242b, 0x0b2931, 0x0d2e37, 0x10343d, 0x133a44, 0x16404a];
const WD565 = Uint16Array.from(WALL_DAY, to565), WN565 = Uint16Array.from(WALL_NIGHT, to565);
const FOG = new Uint8Array(64 * 32);
for (let y = 0; y < 32; y++) for (let x = 0; x < 64; x++) {
  // tileable: sample noise on a torus-ish by blending wrapped copies
  const a = noise2(x / 9, y / 6, 7), b = noise2((x - 64) / 9, y / 6, 7), c = noise2(x / 9, (y - 32) / 6, 7), d = noise2((x - 64) / 9, (y - 32) / 6, 7);
  const u = x / 64, v = y / 32;
  const n = (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  FOG[y * 64 + x] = Math.max(0, Math.min(255, Math.round((n - 0.32) * 520)));
}
// fog density by row: thick under the machine, thinning to nothing by the counter
const FOG_ROW = Uint16Array.from({ length: H }, (_, y) => Math.round(255 * Math.max(0, Math.min(1, (66 - y) / 52)) ** 1.2));

/** The wall and its fog, one integer pass over the glass. */
export function wall(g, t, night) {
  const buf = g.buf, ox = (t * 4) | 0, oy = (t * 2.5) | 0;   // the fog drifts right and rolls down
  const ox2 = (t * 2.2 + 17) | 0;
  for (let y = 0; y < H; y++) {
    const fr = FOG_ROW[y], row = y * W;
    const fy = (((y - oy) >> 1) & 31) * 64, fy2 = (((y + 9 - (oy >> 1)) >> 1) & 31) * 64;
    for (let x = 0; x < W; x++) {
      const b = BAYER[((y & 3) << 2) | (x & 3)];
      // pinstripes: a slightly lighter 2 px stripe every 10 px
      const stripe = (x + 3) % 10 < 2 ? 1 : 0;
      const f = (FOG[fy + (((x - ox) >> 1) & 63)] + FOG[fy2 + (((x + ox2) >> 1) & 63)]) >> 1;
      let lv = stripe + (((((f * fr) >> 8) * 5) + b * 16) >> 8);
      if (lv > 7) lv = 7;
      buf[row + x] = (night > b / 16 + 0.03 ? WN565 : WD565)[lv];
    }
  }
  g.cost.px += W * H; g.cost.box += W * H * 5;
}

// ------------------------------------------------------------ the machine
export const SPOUT_Y = 10.5;        // the tip of each spout, where soft serve leaves it
const MACH_DAY = [0x7b919c, 0xeaf3f7, 0xcbdae1, 0xaec0c8, 0x8fa3ad, 0xc8344a, 0x8a1d31];
const MACH_NIGHT = MACH_DAY.map((c) => mixc(c, 0x0a1418, 0.55));

/** The chrome underside of the machine, its spouts and lamps. `sweep` = x of the light sweep (or -99). */
export function machine(g, spouts, lamps, night, sweep) {
  for (let y = 0; y < 7; y++) g.fillRect(0, y, W, 1, mixc(MACH_DAY[y], MACH_NIGHT[y], night));
  const chrome = mixc(0xd6e2e8, 0x5a6870, night), dark = mixc(0x6d828d, 0x2a353b, night), lite = mixc(0xf6fbfd, 0x8a989f, night);
  for (let i = 0; i < spouts.length; i++) {
    const cx = spouts[i];
    // a star spout: a stepped chrome collar, fluted, narrowing to the tip
    g.fillRect(cx - 5, 7, 10, 1, dark);
    g.fillRect(cx - 4, 8, 8, 1, chrome);
    g.fillRect(cx - 3, 9, 6, 2, chrome);
    g.fillRect(cx - 3, 8, 1, 3, lite);
    g.fillRect(cx, 9, 1, 2, dark); g.fillRect(cx + 2, 9, 1, 2, dark);
    // the lamp over the spout: dark until it dispenses, then a warm glow
    const L = lamps[i];
    g.fillRect(cx - 1, 2, 3, 2, mixc(mixc(0x3a1a20, 0x1c0d10, night), 0xffd36a, L));
    if (L > 0.05) g.fillCircle(cx + 0.5, 3, 3.2, 0xffd36a, { a: 0.35 * L, aa: true });
  }
  if (sweep > -20 && sweep < W + 20) {
    // the light sweep over the chrome: a slanted bright bar
    for (let y = 0; y < 7; y++) g.fillRect(Math.round(sweep - y), y, 3, 1, 0xffffff, { a: 0.55 * (1 - night * 0.6) });
  }
}

// ------------------------------------------------------------ cones (hours)
// A waffle cone standing in the counter's holder: rolled rim, diamond lattice.
const CONE_W = 30, CONE_H = 17;     // rim from y 54, body to y 70
function coneSprite(night) {
  const T = -1, out = new Int32Array(CONE_W * CONE_H).fill(T);
  const waf = mixc(0xe3a95b, 0x5a3a1c, night), lat = mixc(0xb06f2c, 0x3a220e, night), rim = mixc(0xf2c27a, 0x6a4a26, night);
  const rimD = mixc(0xc2833e, 0x452a12, night), edge = mixc(0x8a5320, 0x2a1808, night);
  for (let y = 0; y < CONE_H; y++) for (let x = 0; x < CONE_W; x++) {
    const px = x + 0.5 - CONE_W / 2;
    let c = T;
    if (y < 4) {
      // the rolled rim, rounded ends
      const hw = y === 0 || y === 3 ? 13.5 : 14.5;
      if (Math.abs(px) < hw) c = y === 3 ? rimD : (x + y * 3) % 6 === 0 ? rimD : rim;
    } else {
      const hw = 13 - (y - 4) * 0.52;
      if (Math.abs(px) < hw) {
        const gx = x + 40, gy = y;
        c = (gx + gy) % 5 === 0 || (gx - gy + 100) % 5 === 0 ? lat : waf;
        if (Math.abs(px) > hw - 1) c = edge;
      }
    }
    out[y * CONE_W + x] = c;
  }
  return out;
}
const CONES = [coneSprite(0), coneSprite(1)];
export const CONE_TOP = 54;

export function cone(g, cx, night) {
  const a = CONES[0], b = CONES[1], x0 = Math.round(cx - CONE_W / 2), buf = g.buf;
  let n = 0;
  for (let y = 0; y < CONE_H; y++) for (let x = 0; x < CONE_W; x++) {
    const bb = BAYER[(((y + CONE_TOP) & 3) << 2) | ((x + x0) & 3)];
    const v = (night > bb / 16 + 0.03 ? b : a)[y * CONE_W + x];
    if (v < 0) continue;
    const X = x0 + x;
    if (X < 0 || X >= W) continue;
    buf[(CONE_TOP + y) * W + X] = to565(v); n++;
  }
  g.cost.blit += n;
}

/** A drip of melt running down the outside of a cone; `u` 0..1 through its life. */
export function coneDrip(g, cx, side, u, col) {
  if (u <= 0 || u >= 1) return;
  const x = cx + side * 8;
  // it gathers at the rim, runs down the waffle in lurches, then runs out
  const grow = Math.min(1, u / 0.75), bot = 58 + 11 * grow * grow * (3 - 2 * grow);
  const topY = 57 + Math.max(0, (u - 0.75) / 0.25) * (bot - 57);
  const w = 2.2;
  g.fillRoundRect(x - w / 2, topY, w, Math.max(1, bot - topY), 1, col, { aa: true });
  g.fillCircle(x, bot, 1.6, col, { aa: true });
}

// ------------------------------------------------------------ the boat (minutes)
export const BOAT = { x0: 80, x1: 152, rim: 52, bottom: 62.5 };
const BOAT_POLY = [[77, 48.5], [80, 52], [152, 52], [155, 48.5], [153.5, 52.5], [149, 59], [139, 62.5], [93, 62.5], [83, 59], [78.5, 52.5]];
const FOOT = [[110, 62], [122, 62], [120, 66], [130, 67.5], [130, 70], [102, 70], [102, 67.5], [112, 66]];

/** The back rim of the dish, behind the scoops. */
export function boatBack(g, night) {
  g.fillRect(81, 49, 71, 1, mixc(0x9ed6e2, 0x2a4a52, night), { a: 0.55 });
}

/** The glass front of the dish, over the scoops: tint, rim, glints, the sweep. */
export function boatFront(g, night, sweep) {
  const tint = mixc(0xc4ecf4, 0x5a8a96, night), rim = mixc(0xf2ffff, 0x9ab8c0, night), edge = mixc(0x86c8d6, 0x3a6a76, night);
  g.fillPolygon(BOAT_POLY, tint, { a: 0.3 });
  g.fillPolygon(FOOT, tint, { a: 0.4 });
  g.fillRect(80, 52, 72, 1, rim, { a: 0.85 });
  g.thickLine(77.5, 48.8, 80.5, 52.2, 1.2, rim, { aa: true, a: 0.85 });
  g.thickLine(154.5, 48.8, 151.5, 52.2, 1.2, rim, { aa: true, a: 0.85 });
  g.stroke([[79, 53], [83.5, 59], [93, 62.1], [139, 62.1], [148.5, 59], [153, 53]], 1, edge, { aa: true, a: 0.8 });
  g.fillRect(102, 69, 28, 1, edge, { a: 0.8 });
  g.fillRect(103, 67, 26, 1, rim, { a: 0.6 });
  // fixed glints, cut glass
  g.thickLine(86, 54, 89, 59.5, 1.2, 0xffffff, { aa: true, a: 0.45 * (1 - 0.5 * night) });
  g.thickLine(90.5, 54, 92, 57, 1, 0xffffff, { aa: true, a: 0.3 * (1 - 0.5 * night) });
  if (sweep > 89 && sweep < 152) {
    const x = sweep;
    g.fillPolygon([[x - 3, 52.5], [x, 52.5], [x - 5, 62], [x - 8, 62]], 0xffffff, { a: 0.4 * (1 - 0.5 * night) });
  }
}

// ------------------------------------------------------------ the counter
export function counter(g, night, sweep) {
  const rows = [0xe6eff3, 0x98abb4, 0xb8243c, 0xb8243c, 0xd84a62, 0xb8243c, 0xb8243c, 0xa01c33, 0x8a162b, 0x6e1022];
  for (let i = 0; i < rows.length; i++) g.fillRect(0, 70 + i, W, 1, mixc(rows[i], mixc(rows[i], 0x08060a, 0.7), night));
  // the holder's cups, where the cones go in
  for (const cx of [20, 51]) {
    g.fillRect(cx - 8, 70, 16, 1, mixc(0x5d707a, 0x1e262a, night));
  }
  if (sweep > -10 && sweep < W + 10) g.fillRect(Math.round(sweep) - 2, 70, 5, 1, 0xffffff, { a: 0.7 * (1 - night * 0.6) });
}
