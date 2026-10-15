// The sheet of "seachart": the materials every pixel is made of, their
// day and night colours, and the engraved chart under the serpents: aged
// rag paper with its stains and foxing, the colourist's sea wash laid in
// uneven pools (darker where the wash dried at its edge), a graduated
// neat-line, rhumb lines radiating from a compass rose in the top right
// corner, and the sea engraved as rows of little wave crests that drift
// downwind.
//
// Everything static is one byte map (flash 12.8 KB); the wave crests are a
// 24 x 6 tile scrolled per row band.

import { noise2, rand } from '../js/kit.js';

export const W = 160, H = 80, N = W * H;

let n = 0;
/** Material ids. Everything below INK is ground: a serpent's moat may clear it. */
export const M = {
  PAPER: n++, STAIN: n++, FOX: n++, SEA: n++, RIM: n++, WAVE: n++, FAINT: n++, RHUMB: n++, GOLD: n++, ROSE: n++,
  KRAK: n++, KRAK_SH: n++, KRAK_INK: n++, DEEP: n++,
  INK: n++, INK_H: n++, WASH_H: n++, SHADE_H: n++, WASH_M: n++, SHADE_M: n++, EYE: n++, MOUTH: n++,
  SAIL: n++, HULL: n++, FLAG: n++, SMOKE: n++, SPRAY: n++, FIRE: n++,
};
export const NMAT = n;

const C = (o) => { const a = new Array(NMAT).fill(0xff00ff); for (const k in o) a[M[k]] = o[k]; return a; };
// Day: the colourist's box. Rag paper, iron-gall ink, a pale sea-green wash,
// verdigris (hour serpents) and vermilion (minute serpents), gold for the rose.
export const DAY = C({
  PAPER: 0xeadcb4, STAIN: 0xe0cd9c, FOX: 0xcfb27e, SEA: 0xcbd7bd, RIM: 0xb2c2a4, WAVE: 0xa6aa90, FAINT: 0x8e7f63, RHUMB: 0xb19f80,
  GOLD: 0xc8952f, ROSE: 0xb54638,
  KRAK: 0x9a6a84, KRAK_SH: 0xc8a6b6, KRAK_INK: 0x4a2e40, DEEP: 0x9fb09a,
  INK: 0x2a1f17, INK_H: 0x3b2c20, WASH_H: 0x4f9a6c, SHADE_H: 0x3b7353, WASH_M: 0xc9573b, SHADE_M: 0x96402c,
  EYE: 0xf8f0d8, MOUTH: 0x7c1d18,
  SAIL: 0xf4ecd4, HULL: 0x6a4a2c, FLAG: 0xc23a2a, SMOKE: 0xd9d1c2, SPRAY: 0x6f8f8a, FIRE: 0xf0b030,
});
// Night: the chart by a guttering candle. The sheet sinks to umber, the
// engraving glints faintly, and the serpents keep their washes, lifted, so
// they are the brightest things on the glass.
export const NIGHT = C({
  PAPER: 0x2a2017, STAIN: 0x2f2419, FOX: 0x241a12, SEA: 0x232b25, RIM: 0x2c372d, WAVE: 0x3e4134, FAINT: 0x5e4d35, RHUMB: 0x3f3324,
  GOLD: 0x8c6828, ROSE: 0x6e2e25,
  KRAK: 0x553c4c, KRAK_SH: 0x7a5c6c, KRAK_INK: 0x2a1a24, DEEP: 0x1d231e,
  INK: 0x120c08, INK_H: 0x1a120c, WASH_H: 0x63b886, SHADE_H: 0x3f7d5a, WASH_M: 0xe0704c, SHADE_M: 0xa04a32,
  EYE: 0xf0e4c0, MOUTH: 0x5a1612,
  SAIL: 0xb8ad90, HULL: 0x4a3420, FLAG: 0xa23224, SMOKE: 0x6a6050, SPRAY: 0x4a6460, FIRE: 0xe0a030,
});

// ------------------------------------------------------------ the static sheet

export const ROSE_X = 147.5, ROSE_Y = 15.5;
export const BG = new Uint8Array(N);

function inTri(px, py, a, b, c) {
  const d = (p, q, r) => (p[0] - r[0]) * (q[1] - r[1]) - (q[0] - r[0]) * (p[1] - r[1]);
  const d1 = d([px, py], a, b), d2 = d([px, py], b, c), d3 = d([px, py], c, a);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}

(function sheet() {
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let m = M.PAPER;
      const st = noise2(x * 0.09, y * 0.13, 11);
      if (st > 0.66) m = M.STAIN;
      // the sea wash, laid in pools; its dried edge is darker
      const w = noise2(x * 0.045, y * 0.075, 5) * 0.75 + noise2(x * 0.16, y * 0.2, 6) * 0.25;
      if (w > 0.33) m = w < 0.355 ? M.RIM : M.SEA;
      BG[y * W + x] = m;
    }
  // foxing: a few brown spots
  for (let k = 0; k < 9; k++) {
    const fx = Math.floor(rand(k, 1, 3) * W), fy = Math.floor(rand(k, 2, 3) * H), r = 0.6 + rand(k, 3, 3) * 1.1;
    for (let y = Math.floor(fy - 2); y <= fy + 2; y++) for (let x = Math.floor(fx - 2); x <= fx + 2; x++)
      if (x >= 0 && y >= 0 && x < W && y < H && (x - fx) ** 2 + (y - fy) ** 2 <= r * r) BG[y * W + x] = M.FOX;
  }
  // rhumb lines: sixteen winds from the rose, to the edge of the sheet
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2, dx = Math.cos(a), dy = Math.sin(a);
    for (let t = 11; t < 220; t += 0.5) {
      const x = Math.floor(ROSE_X + dx * t), y = Math.floor(ROSE_Y + dy * t);
      if (x < 0 || y < 0 || x >= W || y >= H) break;
      if (((x + y) & 1) === 0) BG[y * W + x] = M.RHUMB;     // a fine dotted line
    }
  }
  // the rose: eight points, each split light and dark, round a gold ring
  for (let y = 0; y < 28; y++)
    for (let x = 132; x < W; x++) {
      const px = x + 0.5, py = y + 0.5, dx = px - ROSE_X, dy = py - ROSE_Y, d = Math.hypot(dx, dy);
      if (d > 11) continue;
      let m = -1;
      if (d > 6.4 && d < 7.6) m = M.FAINT;
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 - Math.PI / 2, R = k % 2 ? 6.5 : 11, wdt = k % 2 ? 1.6 : 2.4;
        const tip = [ROSE_X + Math.cos(a) * R, ROSE_Y + Math.sin(a) * R];
        const l = [ROSE_X + Math.cos(a - Math.PI / 2) * wdt, ROSE_Y + Math.sin(a - Math.PI / 2) * wdt];
        const r = [ROSE_X + Math.cos(a + Math.PI / 2) * wdt, ROSE_Y + Math.sin(a + Math.PI / 2) * wdt];
        if (inTri(px, py, tip, l, [ROSE_X, ROSE_Y])) m = k % 2 ? M.FAINT : k === 0 ? M.ROSE : M.GOLD;
        else if (inTri(px, py, tip, r, [ROSE_X, ROSE_Y])) m = k % 2 ? M.RHUMB : M.INK;
      }
      if (d < 1.2) m = M.GOLD;
      if (m >= 0) BG[y * W + x] = m;
    }
  // the neat-line: a fine double rule with a graduated scale between
  for (let x = 0; x < W; x++) {
    BG[x] = M.FAINT; BG[2 * W + x] = M.FAINT; BG[(H - 1) * W + x] = M.FAINT; BG[(H - 3) * W + x] = M.FAINT;
    if (Math.floor(x / 5) & 1) { BG[W + x] = M.FAINT; BG[(H - 2) * W + x] = M.FAINT; }
    else { BG[W + x] = M.PAPER; BG[(H - 2) * W + x] = M.PAPER; }
  }
  for (let y = 0; y < H; y++) {
    BG[y * W] = M.FAINT; BG[y * W + 2] = M.FAINT; BG[y * W + W - 1] = M.FAINT; BG[y * W + W - 3] = M.FAINT;
    const g = Math.floor(y / 5) & 1 ? M.FAINT : M.PAPER;
    if (y > 2 && y < H - 3) { BG[y * W + 1] = g; BG[y * W + W - 2] = g; }
  }
})();

// ------------------------------------------------------------ the engraved sea

// a 24 x 6 tile of wave crests, two to a tile, staggered
const TW = 24, TH = 6;
const CREST = ['.###.', '#...#'];
export const TILE = new Uint8Array(TW * TH);
for (const [cx, cy] of [[2, 1], [14, 4]])
  for (let j = 0; j < 2; j++) for (let i = 0; i < 5; i++)
    if (CREST[j][i] === '#') TILE[((cy + j) % TH) * TW + ((cx + i) % TW)] = 1;

/**
 * Lay the sheet into `map` and engrave the sea's crests over it, each row band
 * drifting downwind at its own pace. `t` seconds; `swell` 0..1 lifts the
 * crests a pixel on the beat. Returns pixels touched.
 */
export function laySheet(map, t, lift, front = -999) {
  map.set(BG);
  let k = 0;
  for (let y = 3; y < H - 3; y++) {
    const band = Math.floor(y / TH), ty = y % TH;
    const off = Math.floor(t * (1.2 + (band % 3) * 0.45) + band * 7) % TW;
    const yy = band & 1 ? y : y - lift;
    if (yy < 3) continue;
    const row = ty * TW, out = yy * W;
    for (let x = 3; x < W - 3; x++) {
      if (TILE[row + ((x + off) % TW)]) {
        const dx = x - front;
        if (dx > -10 && dx < 10) {
          // the great swell: crests heave up and darken as its front passes
          const up = dx > -5 && dx < 5 ? 2 : 1, y2 = yy - up;
          if (y2 >= 3) { const p = y2 * W + x; if (map[p] < M.WAVE) map[p] = M.FAINT; }
          continue;
        }
        const p = out + x, b = map[p];
        if (b < M.WAVE) map[p] = M.WAVE;
      }
    }
    // the swell's front itself: a broken engraved line
    if (front > -20) {
      const fx = Math.round(front + ((y * 7) % 5) - 2 - (y - 40) * (y - 40) * 0.004);
      if (fx >= 3 && fx < W - 3 && (y % 4) !== 3) { const p = y * W + fx; if (map[p] < M.WAVE) map[p] = M.FAINT; }
    }
    k += W;
  }
  return N + k;
}
