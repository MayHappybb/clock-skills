// snowglobe: the room, its light through the day, and the water lens.
//
// Two snow globes stand on a deep window sill. Behind them a window looks out
// over snowy roofs. The room is painted once per minute into a canvas (its
// light follows the clock), and so is what each globe shows of it: a sphere
// of water is a strong lens, so the room behind it appears small and upside
// down inside, the sky at the bottom and the sill at the top, darkening
// towards the rim where the glass starts to mirror.

import { Gfx, hex, mix, rand, clamp } from '../js/kit.js';

export const W = 160, H = 80;
export const KEY = 0xff00ff;

// ------------------------------------------------------------------ the globes
// cx, cy, r: the glass sphere. floor: local y of the snow floor (the numerals
// stand on it). dw/dh/wt/gap: the glass numerals. base: the turned plinth, as
// local y of its top (the collar) and bottom, and its widths.
export const GLOBES = [
  { key: 'h', cx: 40, cy: 36, r: 24, floor: 15, dw: 15, dh: 22, wt: 4, gap: 3,
    collar: [17, 21, 13.5], plinth: [21, 33, 15, 19], band: [25, 27],
    wood: hex('#2f4a3c'), woodLit: hex('#557a5f'), trim: hex('#c9ccd2') },
  { key: 'm', cx: 106, cy: 31, r: 30, floor: 18, dw: 20, dh: 30, wt: 5, gap: 4,
    collar: [24, 28, 16.5], plinth: [28, 46, 20, 25], band: [33, 35],
    wood: hex('#6a2229'), woodLit: hex('#9c3e3f'), trim: hex('#d6ac52') },
];

// ------------------------------------------------------------------ light through the day
// Keyframes by hour. Colours are mixed between neighbours; `glow` is how much
// the globes' bases light up from inside (night lights), `amb` the daylight.
const K = (h, o) => ({ h, ...o });
const NIGHT = {
  skyTop: '#070c22', skyLow: '#1a2650', roofs: '#0c1024', roofSnow: '#56607e', frame: '#2a2a3a', frameShade: '#1a1a28',
  wall: '#191826', wallTop: '#100f1a', sillBack: '#3a2c2c', sillFront: '#1e1618', water: '#0b1a36',
  snowLit: '#fff2d8', snowBody: '#e8d6b8', snowShade: '#9a8c8e', rim: '#8ea0c8', glow: 1, amb: 0.25, stars: 1, litWin: 1,
};
const DAY = {
  skyTop: '#5e9fd8', skyLow: '#cfe6f6', roofs: '#6a7c92', roofSnow: '#f2f6fa', frame: '#e8e2d6', frameShade: '#b8ae9e',
  wall: '#c4b6a0', wallTop: '#a89a86', sillBack: '#c09468', sillFront: '#8a6244', water: '#24587c',
  snowLit: '#ffffff', snowBody: '#e6eef6', snowShade: '#93a8c0', rim: '#e8f6ff', glow: 0, amb: 1, stars: 0, litWin: 0,
};
const KEYS = [
  K(0, NIGHT),
  K(5.2, NIGHT),
  K(6.6, { ...NIGHT, skyTop: '#2c3270', skyLow: '#e49a78', roofs: '#2a2440', roofSnow: '#c8a8b8', frame: '#6e6070', frameShade: '#4a4054',
    wall: '#4e4254', wallTop: '#3a3044', sillBack: '#7a5448', sillFront: '#40302e', water: '#1e3058',
    snowLit: '#fff0f0', snowBody: '#e8dce6', snowShade: '#9a8ca8', rim: '#ffc8b0', glow: 0.35, amb: 0.55, stars: 0.2, litWin: 0.5 }),
  K(8.2, DAY),
  K(15.8, DAY),
  K(17.6, { ...DAY, skyTop: '#5a70b8', skyLow: '#f6b46a', roofs: '#5a5470', roofSnow: '#ffd8b0', frame: '#d8b898', frameShade: '#a07c64',
    wall: '#b08470', wallTop: '#8a6656', sillBack: '#b47a4e', sillFront: '#6a4028', water: '#2c3e6a',
    snowLit: '#fff4e4', snowBody: '#f4e2d4', snowShade: '#a88c98', rim: '#ffd8a0', glow: 0.1, amb: 0.85, stars: 0, litWin: 0.3 }),
  K(19.2, { ...NIGHT, skyTop: '#141a4a', skyLow: '#7a4c78', roofs: '#1a1630', roofSnow: '#7a6a8e', frame: '#40384c', frameShade: '#2a2436',
    wall: '#2e2838', wallTop: '#201c2a', sillBack: '#4a3434', sillFront: '#281c1e', water: '#142450',
    snowLit: '#fff0dc', snowBody: '#e6d4c4', snowShade: '#948498', rim: '#c8a8e0', glow: 0.8, amb: 0.4, stars: 0.6, litWin: 1 }),
  K(21, NIGHT),
  K(24, NIGHT),
];
const NUM = new Set(['glow', 'amb', 'stars', 'litWin']);
const PARSED = KEYS.map((k) => Object.fromEntries(Object.entries(k).map(([n, v]) => [n, NUM.has(n) || n === 'h' ? v : hex(v)])));

/** The room's colours at a time of day (hours, fractional). */
export function paletteAt(hour) {
  let i = 0;
  while (i < PARSED.length - 2 && PARSED[i + 1].h <= hour) i++;
  const a = PARSED[i], b = PARSED[i + 1];
  const u = clamp((hour - a.h) / (b.h - a.h || 1), 0, 1);
  const s = u * u * (3 - 2 * u);
  const p = {};
  for (const n of Object.keys(a)) if (n !== 'h') p[n] = NUM.has(n) ? a[n] + (b[n] - a[n]) * s : mix(a[n], b[n], s);
  p.glowCol = hex('#ffc070');
  return p;
}

// ------------------------------------------------------------------ the room, once a minute

const WIN = { x0: 58, x1: 153, y1: 56, mull: [104, 108], transom: [22, 25] };
export const SILL_Y = 56;
/** The four panes, [x0, y0, x1, y1]. */
export const PANES = [[WIN.x0 + 1, 0, WIN.mull[0], WIN.transom[0]], [WIN.mull[1], 0, WIN.x1 - 1, WIN.transom[0]],
  [WIN.x0 + 1, WIN.transom[1], WIN.mull[0], WIN.y1 - 4], [WIN.mull[1], WIN.transom[1], WIN.x1 - 1, WIN.y1 - 4]];

const OUT = Array.from({ length: 30 }, (_, k) => ({ x: WIN.x0 + rand(k, 41) * (WIN.x1 - WIN.x0), v: 3 + 4 * rand(k, 42), y: rand(k, 43) * 60, ph: rand(k, 44) * 6.28 }));
/** Real snow falling outside, slow and small: the weather the globes copy. */
export function drawOutsideSnow(g, P, T, sin) {
  const c = mix(P.skyLow, 0xffffff, 0.75), a = 0.45 + 0.35 * P.amb;
  for (const f of OUT) {
    const y = Math.floor((f.y + T * f.v) % 62) - 4, x = Math.floor(f.x + 2.5 * sin(T * 0.6 + f.ph));
    for (const [x0, y0, x1, y1] of PANES)
      if (x >= x0 && x < x1 && y >= y0 && y < y1) { g.pixel(x, y, c, { a }); break; }
  }
}

// a row of roofs seen over the bottom of the window: [x0, x1, eave y, ridge y]
const ROOFS = [[54, 74, 46, 39], [72, 88, 49, 43], [86, 104, 45, 37], [102, 120, 48, 41], [118, 136, 44, 35], [134, 158, 47, 40]];
const STARS = Array.from({ length: 22 }, (_, i) => [WIN.x0 + 3 + Math.floor(rand(i, 1) * (WIN.x1 - WIN.x0 - 6)), Math.floor(rand(i, 2) * 30), rand(i, 3)]);

export function drawRoom(g, P) {
  // wall, darker towards the ceiling
  g.gradient(0, 0, W, SILL_Y, [P.wallTop, P.wall]);
  // window: frame, then sky, roofs, stars, moon
  g.fillRect(WIN.x0 - 3, 0, WIN.x1 - WIN.x0 + 6, WIN.y1, P.frameShade);
  g.fillRect(WIN.x0 - 2, 0, WIN.x1 - WIN.x0 + 4, WIN.y1 - 1, P.frame);
  const panes = [[WIN.x0 + 1, WIN.mull[0]], [WIN.mull[1], WIN.x1 - 1]];
  for (const [x0, x1] of panes)
    for (const [y0, y1] of [[0, WIN.transom[0]], [WIN.transom[1], WIN.y1 - 4]]) {
      g.clip(x0, y0, x1 - x0, y1 - y0);
      g.gradient(x0, 0, x1 - x0, WIN.y1 - 4, [P.skyTop, P.skyLow]);
      if (P.stars > 0.05)
        for (const [sx, sy, b] of STARS) g.pixel(sx, sy, mix(P.skyTop, 0xfff4dc, P.stars * (0.35 + 0.6 * b)));
      if (P.stars > 0.3) g.fillCircle(142, 8, 3.2, mix(P.skyTop, 0xfff0d0, P.stars), { aa: true });
      for (const [rx0, rx1, eave, ridge] of ROOFS) {
        const mid = (rx0 + rx1) / 2;
        g.fillPolygon([[rx0, eave], [mid, ridge], [rx1, eave], [rx1, 60], [rx0, 60]], P.roofs);
        g.stroke([[rx0, eave], [mid, ridge], [rx1, eave]], 1.2, P.roofSnow, { aa: true });
        if (P.litWin > 0.05)
          for (let k = 0; k < 2; k++) {
            const wx = Math.round(rx0 + 4 + k * (rx1 - rx0 - 9)), wy = eave + 2;
            if (rand(rx0, k) < 0.7) g.fillRect(wx, wy, 2, 2, mix(P.roofs, 0xffc060, P.litWin * 0.9));
          }
      }
      g.unclip();
    }
  // the sill: deep, lit near the window, grain running across
  g.gradient(0, SILL_Y, W, H - SILL_Y, [P.sillBack, P.sillFront]);
  g.hline(0, SILL_Y, W, mix(P.sillBack, 0xffffff, 0.25 * P.amb));
  for (let k = 0; k < 7; k++) {
    const y = SILL_Y + 3 + k * 3 + (k > 3 ? 1 : 0), x = Math.floor(rand(k, 7) * 120);
    g.hline(x, y, 20 + Math.floor(rand(k, 8) * 30), mix(P.sillBack, P.sillFront, 0.5 + k / 14), { a: 0.5 });
  }
  // night lights: warm pools on the wall and sill around each globe
  if (P.glow > 0.02) for (const G of GLOBES) glowPool(g, G, P);
}

function glowPool(g, G, P) {
  // stacked soft ellipses: a falloff from kit shapes, no per-pixel code
  const R = G.r * 1.8;
  for (let k = 0; k < 7; k++) {
    const u = 1 - k / 7;
    g.fillEllipse(G.cx, G.cy + G.r * 0.6, R * u, R * 0.8 * u, P.glowCol, { a: 0.055 * P.glow, aa: true, dither: true });
  }
}

// ------------------------------------------------------------------ the water lens, once a minute

/**
 * What one globe shows of the room: the room inverted and shrunk through the
 * water, tinted, darker at the rim, warmed from below by the night light.
 * Drawn into `s`, a (2r+2)-square canvas, with KEY outside the sphere.
 */
export function drawLens(s, room, G, P) {
  const r = G.r, o = r + 1;
  s.clear(KEY);
  s.coarse((px, py) => {
    const lx = px - o, ly = py - o;
    const q = Math.sqrt(lx * lx + ly * ly) / r;
    const k = q > 1 ? 1 : q;
    const m = 1.5 * (1 + 0.55 * k * k);
    const sx = clamp(G.cx - lx * m, 0, W - 1), sy = clamp(G.cy - ly * m, 0, H - 1);
    let c = mix(room.get(sx, sy), P.water, 0.52 + 0.4 * k * k * k * k);
    const lift = clamp(0.5 + ly / r, 0, 1);
    if (P.glow > 0) c = mix(c, P.glowCol, P.glow * 0.38 * lift * lift * (1 - 0.5 * k));
    return c;
  }, { cell: 2, box: [0, 0, 2 * o, 2 * o] });
  s.ring(o, o, r, o * 1.5, KEY);
}
