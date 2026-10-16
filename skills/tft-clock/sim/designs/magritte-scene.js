// magritte: the painting. A day sky over a night street (L'Empire des
// lumières): the sky is a pale afternoon blue with slow white cumulus; below
// the roofline it is night, a dark house with lit windows, black trees, one
// streetlamp, its light in the canal.
//
// Everything that never moves is painted once, at load: the sky's gradient
// (a canvas, copied each frame) and the street (a sprite with the sky left
// transparent). Per frame only the clouds, the lamp's glow, a window or two
// and the water are drawn.

import { Gfx, hex, mix, scale, clamp, noise2, rand, rng, sin, sprite } from '../js/kit.js';

export const P = {
  skyTop: hex('4f84c0'), skyMid: hex('86b0da'), skyLow: hex('c4d9e8'), skyHaze: hex('dfe7e6'),
  cloud: hex('fbfcfd'), cloudShade: hex('c9d3e1'), cloudDeep: hex('a7b3c8'),
  nightTop: hex('050a1c'), nightLow: hex('18244a'),
  star: hex('fff6dc'), moon: hex('f4ebc8'),
  tree: hex('090f0c'), treeLit: hex('26341a'),
  roof: hex('121216'), house: hex('1f2027'), houseLit: hex('6a5038'),
  win: hex('f3bd62'), winCore: hex('ffe7a8'), winDark: hex('0b0d12'), sash: hex('5a3f22'),
  lamp: hex('fff4d0'), glow: hex('ffc45a'), iron: hex('07080a'),
  pave: hex('17171c'), paveLit: hex('5c4630'), kerb: hex('2c2c33'),
  water: hex('05080f'), crack: hex('2a3d63'), crackNight: hex('8f9cc0'), glass: hex('ffffff'),
};

/** The same street in sunlight, for the hours when the painting turns over. */
export const PD = {
  tree: hex('2d5232'), treeLit: hex('6f9a4e'),
  roof: hex('7a3e33'), house: hex('e3d6b8'), houseLit: hex('fff3d6'),
  win: hex('36506e'), winDark: hex('2a3e58'), sash: hex('f4ecdc'), door: hex('5a3a2a'),
  lamp: hex('cfd8dc'), iron: hex('1c2226'),
  pave: hex('a49c8c'), paveLit: hex('c9c0ac'), kerb: hex('6c665c'),
  water: hex('2f5f70'), chimney: hex('8a4a3c'),
};

export const W = 160, H = 80;
export const WATER = 73;                 // first row of the canal
export const LAMP = [118.5, 55.5];       // the lantern's centre

// ------------------------------------------------------------ the sky

/** The sky's gradient, painted once (dithered), copied every frame. */
export const SKY_BG = (() => {
  const c = new Gfx(W, H);
  c.gradient(0, 0, W, H, [[0, P.skyTop], [0.42, P.skyMid], [0.68, P.skyLow], [1, P.skyHaze]]);
  return c;
})();

/**
 * The night behind the day: a navy gradient painted once, and a list of
 * stars the frame scatters over it, drifting sideways (wrapping round) and
 * twinkling.
 */
export const NIGHT_BG = (() => {
  const c = new Gfx(W, H);
  c.gradient(0, 0, W, H, [[0, P.nightTop], [0.6, P.nightLow], [1, hex('2a2f52')]]);
  return c;
})();
export const STARS = (() => {
  const r = rng(777), out = [];
  for (let i = 0; i < 120; i++) out.push({ x: Math.floor(r() * W), y: Math.floor(r() * 62), b: 0.25 + 0.75 * r() ** 2, ph: r() * 6.28, f: 0.6 + r() * 1.6 });
  return out;
})();

/** The crescent, as a small sprite (lit side to the right). */
export const MOON = (() => {
  const n = 15, data = new Int32Array(n * n).fill(-1);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const dx = x + 0.5 - 7.5, dy = y + 0.5 - 7.5;
      if (dx * dx + dy * dy < 44 && (dx + 2.7) * (dx + 2.7) + (dy + 1.6) * (dy + 1.6) > 34)
        data[y * n + x] = dx > 3.5 ? mix(P.moon, hex('d8c89c'), 0.5) : P.moon;
    }
  return { w: n, h: n, data };
})();

// The clouds: Magritte's cumulus, round-topped and nearly flat underneath,
// white with a cool grey belly. Each is a cluster of puffs, seeded once.
const LOOP = 330;                        // they drift round a loop this wide, px
export const WIND = 2.1;                 // px per second
const CLOUDS = (() => {
  const r = rng(4242), out = [];
  const spec = [[0, 10, 1.0], [52, 30, 0.8], [96, 16, 1.15], [150, 34, 0.7], [196, 8, 0.9], [248, 24, 1.05], [292, 40, 0.75]];
  for (const [x0, y, s] of spec) {
    const n = 4 + Math.floor(r() * 3), puffs = [];
    const w = (16 + r() * 14) * s;
    for (let i = 0; i < n; i++) {
      const u = n === 1 ? 0.5 : i / (n - 1);
      const rr = (3.2 + 3.4 * Math.sin(u * Math.PI) + r() * 1.6) * s;
      puffs.push([(u - 0.5) * w, -rr * 0.55 + (r() - 0.5) * 1.5 * s, rr]);
    }
    out.push({ x0, y, puffs, w: w + 16 * s });
  }
  return out;
})();

/** Where cloud i's centre is at time T (seconds). */
export function cloudX(i, T) {
  const c = CLOUDS[i];
  return ((c.x0 + WIND * T) % LOOP + LOOP) % LOOP - 50;
}

/** Paint the moving clouds onto `c` (the sky canvas). */
export function drawClouds(c, T) {
  CLOUDS.forEach((cl, i) => {
    const x = cloudX(i, T);
    if (x < -cl.w / 2 - 2 || x > W + cl.w / 2 + 2) return;
    // a slow breathing of each puff, so a cloud is never quite still
    for (const [dx, dy, r] of cl.puffs) c.fillCircle(x + dx, cl.y + dy + 1.7, r, P.cloudShade, { aa: true });
    for (const [dx, dy, r] of cl.puffs) {
      const b = 0.35 * sin(T * 0.21 + dx * 0.3 + i);
      c.fillCircle(x + dx - 0.4, cl.y + dy - 0.5, r - 0.9 + b, P.cloud, { aa: true });
    }
  });
}

// ------------------------------------------------------------ the street

const lampFall = (x, y) => {
  const d = Math.hypot(x - LAMP[0], (y - LAMP[1]) * 1.15);
  return clamp(1 - d / 30, 0, 1) ** 2;
};

/** Leafy silhouette: the first puff the point is in (with a ragged edge), or null. */
function leafy(puffs, x, y) {
  for (const pf of puffs) {
    const [cx, cy, r] = pf;
    const d = Math.hypot(x - cx, y - cy);
    const rag = (noise2(x * 0.45, y * 0.45, 5) - 0.5) * 2.6 + (noise2(x * 1.3, y * 1.3, 6) - 0.5) * 1.2;
    if (d < r + rag) return pf;
  }
  return null;
}

const LEFT_TREE = [[3, 12, 7], [10, 19, 7], [2, 24, 8], [12, 29, 7], [4, 35, 8], [14, 38, 6], [6, 44, 9], [17, 46, 6]];
const LEFT_BUSH = [[24, 54, 7], [33, 57, 7], [42, 60, 6], [50, 63, 5], [14, 52, 8]];
const RIGHT_POPLAR = [[154, 8, 4], [153, 14, 6], [155, 21, 6.5], [153, 28, 7], [155, 35, 7], [152, 42, 7.5]];
const RIGHT_TREE = [[132, 52, 8], [143, 49, 8], [122, 54, 6], [147, 56, 8], [110, 57, 5], [158, 50, 6], [114, 52, 4]];

// the house: a hipped roof, two storeys, windows [x, y, w, h, lit]
const HOUSE = { x0: 55, x1: 104, eave: 53, ridge: 46, foot: 70 };
export const WINDOWS = [
  [59, 56, 4, 5, 0], [69, 56, 4, 5, 1], [85, 56, 4, 5, 0], [95, 56, 4, 5, 1],
  [59, 63, 4, 5, 1], [69, 63, 4, 5, 0], [95, 63, 4, 5, 1],
];
const DOOR = [79, 62, 5, 8];

// the sun, for the day street: up and to the left
const sunFall = (x, y) => clamp(1 - (x * 0.4 + y) / 110, 0, 1);

function streetAt(x, y, day) {
  const Q = day ? PD : P;
  const L = day ? 0 : lampFall(x, y);
  const leaf = (pf) => {
    // painted clumps: each puff is a rounded mass lit from one side, in three tones
    let lit;
    if (pf) {
      const [cx, cy, r] = pf;
      const lx = day ? -0.7 : LAMP[0] - cx, ly = day ? -0.7 : LAMP[1] - cy, ll = Math.hypot(lx, ly) || 1;
      lit = ((x - cx) * lx / ll + (y - cy) * ly / ll) / r + (noise2(x * 0.3, y * 0.3, 9) - 0.5) * 0.5;
    } else lit = (noise2(x * 0.16, y * 0.22, 9) - 0.62) * 2;
    if (day) return lit > 0.3 ? PD.treeLit : lit > -0.3 ? mix(PD.tree, PD.treeLit, 0.45) : PD.tree;
    const k = clamp(L * 1.5, 0, 1) * (lit > 0.25 ? 1 : lit > -0.3 ? 0.55 : 0.2);
    return mix(P.tree, P.treeLit, k);
  };
  // the canal and the pavement
  if (y >= WATER) return Q.water;
  if (y >= 70) return y === 72 ? mix(Q.kerb, Q.paveLit, day ? 0.2 : L * 0.8) : mix(Q.pave, Q.paveLit, day ? (y === 70 ? 0.5 : 0) : L);
  // the lamp: post, arm and lantern
  const lx = Math.floor(LAMP[0]);
  const ly = Math.floor(LAMP[1]) - 4;
  if (x >= lx - 2 && x <= lx + 2 && y >= ly && y <= ly + 6) {
    if (y === ly && Math.abs(x - lx) <= 1) return Q.iron;
    if (y >= ly + 1 && y <= ly + 5 && Math.abs(x - lx) <= 1) return day ? PD.lamp : y === ly + 1 ? P.win : P.lamp;
    if (y >= ly + 1 && y <= ly + 5 && Math.abs(x - lx) === 2) return Q.iron;
    if (y === ly + 6 && Math.abs(x - lx) <= 1) return Q.iron;
  }
  if (x === lx && y > ly + 6 && y < 70) return Q.iron;
  if (y >= 68 && y < 70 && Math.abs(x - lx) <= 1) return Q.iron;
  // the house
  const H0 = HOUSE;
  if (x >= H0.x0 && x < H0.x1 && y >= H0.eave && y < H0.foot) {
    for (const [wx, wy, ww, wh, lit] of WINDOWS)
      if (x >= wx && x < wx + ww && y >= wy && y < wy + wh) {
        if (day) return x === wx + 2 || y === wy + 2 ? PD.sash : (x + y) % 5 === 0 ? mix(PD.win, PD.sash, 0.35) : PD.win;
        if (!lit) return P.winDark;
        if (x === wx + 2 || y === wy + 2) return P.sash;
        return P.win;
      }
    const [dx, dy, dw, dh] = DOOR;
    if (x >= dx && x < dx + dw && y >= dy && y < dy + dh) {
      if (day) return x === dx || x === dx + dw - 1 ? scale(PD.door, 0.7) : PD.door;
      return y === dy ? P.win : x === dx || x === dx + dw - 1 ? P.roof : hex('2a1f1a');
    }
    if (y === H0.eave) return day ? scale(PD.house, 0.62) : P.roof;
    if (day) {
      // the eaves' shadow, and the right end of the house turned from the sun
      const c = y === 61 ? scale(PD.house, 0.86) : y <= H0.eave + 2 ? scale(PD.house, 0.8) : PD.house;
      return x >= H0.x1 - 4 ? scale(c, 0.88) : c;
    }
    const c = y === 61 ? scale(P.house, 0.7) : P.house;
    return mix(c, P.houseLit, L * 0.9);
  }
  const inRoof = y >= H0.ridge && y < H0.eave;
  if (inRoof) {
    const k = (y - H0.ridge) / (H0.eave - H0.ridge);
    const a = 63 - k * (63 - (H0.x0 - 1)), b = 96 + k * ((H0.x1 + 1) - 96);
    if (x >= a && x < b) {
      if (day) return x < a + 6 * k + 1 ? mix(PD.roof, PD.houseLit, 0.25) : x > b - 6 * k - 1 ? scale(PD.roof, 0.75) : PD.roof;
      return mix(P.roof, P.houseLit, L * 0.35);
    }
  }
  if (x >= 66 && x < 69 && y >= 41 && y < 47) return day ? (y === 41 ? PD.house : PD.chimney) : y === 41 ? P.house : P.roof;
  if (x >= 89 && x < 91 && y >= 43 && y < 47) return day ? PD.chimney : P.roof;
  // trees and hedges
  const pf = leafy(LEFT_TREE, x, y) || leafy(RIGHT_POPLAR, x, y) || leafy(RIGHT_TREE, x, y) || leafy(LEFT_BUSH, x, y);
  if (pf) return leaf(pf);
  if (y >= 54) return leaf(null);        // the garden below the treeline
  return -1;
}

/** The street as a sprite (colour per pixel, -1 where the sky shows). */
const street = (day) => {
  const data = new Int32Array(W * H).fill(-1);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) data[y * W + x] = streetAt(x, y, day);
  return { w: W, h: H, data };
};
export const STREET = street(false), STREET_DAY = street(true);

/** Rows of the street sprite where it starts (top opaque row per column). */
export const SKYLINE = (() => {
  const top = new Int16Array(W).fill(H);
  for (let x = 0; x < W; x++)
    for (let y = 0; y < H; y++) if (STREET.data[y * W + x] >= 0) { top[x] = y; break; }
  return top;
})();

export { lampFall, rand, sprite };
