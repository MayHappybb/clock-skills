// Trainset scene: the track loop round the frame, the static layout painted
// once (ground, station, road, pond, houses), the mountain that the tunnel
// runs through (a foreground layer, so it hides the train), and sprites.
import { Canvas, flipX, inPoly } from './trainset-paint.js';
import { hash, hex as kitHex, noise2 } from '../js/kit.js';

// Palette colours with any channel under 8/255 dropped to 0: the dim end of
// a 3-panel HUB75 chain is out of proportion, so stray low channels would
// show as hue shifts.
export const hex = (s) => kitHex(s).map((v) => (v < 0.032 ? 0 : v));

export const W = 192, H = 192;
export const inHole = (x, y) => x >= 64 && x < 128 && y >= 64 && y < 128;

// ------------------------------------------------------------- the loop
// Track centre line: a rounded square inset in the frame. s runs clockwise
// from the start of the top straight.
const TL = 14, TR = 177, TT = 50, TB = 180, RC = 8;
const QA = (Math.PI * RC) / 2;
const SEG = [
  { k: 'L', x: TL + RC, y: TT, dx: 1, dy: 0, len: TR - TL - 2 * RC },
  { k: 'A', cx: TR - RC, cy: TT + RC, a0: -Math.PI / 2, len: QA },
  { k: 'L', x: TR, y: TT + RC, dx: 0, dy: 1, len: TB - TT - 2 * RC },
  { k: 'A', cx: TR - RC, cy: TB - RC, a0: 0, len: QA },
  { k: 'L', x: TR - RC, y: TB, dx: -1, dy: 0, len: TR - TL - 2 * RC },
  { k: 'A', cx: TL + RC, cy: TB - RC, a0: Math.PI / 2, len: QA },
  { k: 'L', x: TL, y: TB - RC, dx: 0, dy: -1, len: TB - TT - 2 * RC },
  { k: 'A', cx: TL + RC, cy: TT + RC, a0: Math.PI, len: QA },
];
let acc = 0;
for (const g of SEG) { g.s0 = acc; acc += g.len; }
export const LOOP = acc;

/** Point on the loop at arc length s: [x, y, hx, hy] (hx, hy the heading). */
export function pathAt(s, out = [0, 0, 0, 0]) {
  s = ((s % LOOP) + LOOP) % LOOP;
  let g = SEG[SEG.length - 1];
  for (const q of SEG) if (s < q.s0 + q.len) { g = q; break; }
  const u = s - g.s0;
  if (g.k === 'L') { out[0] = g.x + g.dx * u; out[1] = g.y + g.dy * u; out[2] = g.dx; out[3] = g.dy; }
  else {
    const a = g.a0 + u / RC;
    out[0] = g.cx + RC * Math.cos(a); out[1] = g.cy + RC * Math.sin(a);
    out[2] = -Math.sin(a); out[3] = Math.cos(a);
  }
  return out;
}
/** Arc length of the loop point nearest (x, y), and the distance to it. */
function nearest(x, y) {
  let best = 1e9, bs = 0;
  for (const g of SEG) {
    let s, d;
    if (g.k === 'L') {
      const u = Math.max(0, Math.min(g.len, (x - g.x) * g.dx + (y - g.y) * g.dy));
      d = Math.hypot(x - (g.x + g.dx * u), y - (g.y + g.dy * u)); s = g.s0 + u;
    } else {
      let a = Math.atan2(y - g.cy, x - g.cx) - g.a0;
      a = ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      if (a > Math.PI / 2) a = a > Math.PI * 1.25 ? 0 : Math.PI / 2;
      const px = g.cx + RC * Math.cos(g.a0 + a), py = g.cy + RC * Math.sin(g.a0 + a);
      d = Math.hypot(x - px, y - py); s = g.s0 + a * RC;
    }
    if (d < best) { best = d; bs = s; }
  }
  return [bs, best];
}

// ------------------------------------------------------------- palette
export const PAL = {
  grass: hex('#2a9a2a'), grass2: hex('#78b030'), sleeper: hex('#9a6430'), rail: hex('#c8c8d0'),
  slab: hex('#7a746a'), edge: hex('#f0c800'), roof: hex('#c03822'), valance: hex('#f0e4c8'),
  iron: hex('#2f8a5a'), timber: hex('#b07a40'), water: hex('#1060b0'), water2: hex('#3a9ae0'),
  road: hex('#606060'), mark: hex('#e8e8e0'), wall: hex('#f0dcb0'), wall2: hex('#e8c890'),
  tile: hex('#d04a28'), tile2: hex('#8a5ab0'), window: hex('#ffc050'), leaf: hex('#3aa040'), leaf2: hex('#8ad050'),
  trunk: hex('#9a6030'), rock: hex('#8a7c6e'), rock2: hex('#c8b8a0'), snow: hex('#f4f8ff'), pine: hex('#1e7a3a'),
  red: hex('#ff2a18'), brass: hex('#ffc848'), black: [0, 0, 0], grey: hex('#909098'), cream: hex('#fff0d0'),
};

// The mountain: an L-shaped massif in the bottom-left corner. The train is
// hidden under it; its two portals are at x = 111 on the bottom straight
// and y = 96 on the left leg.
export const MOUNTAIN = [
  [0, 70], [27, 70], [31, 67.5], [36, 65.5], [41, 64.4], [45, 65.6], [50, 64.6], [55, 66.5], [59, 66], [63, 69], [63, 128],
  [66, 129], [72, 133], [79, 130], [86, 133], [93, 131], [99, 136], [105, 141], [111, 149], [111, 191], [0, 191],
];
export const PORTAL_X = 111, PORTAL_Y = 70;

const POND = { cx: 142, cy: 166, rx: 28, ry: 17 };
export const inPond = (x, y) => ((x - POND.cx) / POND.rx) ** 2 + ((y - POND.cy) / POND.ry) ** 2 <= 1;
export const ROAD = { y0: 87, y1: 98, laneE: 96, laneW: 91 };

function tree(cv, x, y, r) {
  cv.line(x, y, x, y - r * 0.9, Math.max(1.2, r * 0.35), PAL.trunk);
  cv.circle(x, y - r * 1.4, r, PAL.leaf);
  cv.circle(x - r * 0.3, y - r * 1.7, r * 0.55, PAL.leaf2);
}
function pine(cv, x, y, h) {
  cv.poly([[x, y - h], [x + h * 0.38, y], [x - h * 0.38, y]], PAL.pine);
  cv.poly([[x, y - h], [x - h * 0.38, y], [x - h * 0.05, y]], hex('#40a050'));
}
function house(cv, x, y, w, h, roof, night) {
  // walls x..x+w, eaves at y, roof above; door and two windows
  cv.rect(x, y, x + w, y + h, PAL.wall);
  cv.rect(x + w * 0.62, y, x + w, y + h, PAL.wall2);
  cv.poly([[x - 1.5, y + 0.5], [x + w / 2, y - h * 0.75], [x + w + 1.5, y + 0.5]], roof);
  cv.rect(x + w * 0.42, y + h * 0.45, x + w * 0.58, y + h, hex('#7a3a18'));
  const win = (wx) => { cv.rect(wx, y + h * 0.25, wx + 2.5, y + h * 0.25 + 2.5, hex('#40507a')); night.rect(wx, y + h * 0.25, wx + 2.5, y + h * 0.25 + 2.5, PAL.window); };
  win(x + w * 0.12); win(x + w * 0.72);
  night.rect(x + w * 0.42, y + h * 0.45, x + w * 0.58, y + h * 0.6, scale3(PAL.window, 0.5));
}
const scale3 = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** The static layout: { day, night, fg } (day, night RGB; fg premultiplied RGBA). */
export function buildScene() {
  const bg = new Canvas(W, H, 2), night = new Canvas(W, H, 2), fg = new Canvas(W, H, 2);
  // felt ground: sparse tufts, black between (the GOB face is the table)
  bg.rect(0, 0, W, H, (x, y) => {
    const X = Math.floor(x), Y = Math.floor(y), h = hash(X, Y, 7), n = noise2(X * 0.09, Y * 0.09);
    const dens = Math.max(0, n - 0.42) * 0.55;
    if (h < dens) return h < dens * 0.2 ? PAL.grass2 : scale3(PAL.grass, 0.5 + 0.5 * hash(X, Y, 3));
    return PAL.black;
  });
  // ----- top band: station
  bg.rect(0, 55, 63, 64, (x, y) => (Math.floor(x) % 7 === 0 ? scale3(PAL.slab, 0.45) : PAL.slab));
  bg.rect(0, 55, 63, 56, PAL.edge);
  bg.rect(0, 0, 66, 7, PAL.roof);
  bg.rect(0, 0, 66, 7, (x) => (Math.floor(x) % 4 === 0 ? scale3(PAL.roof, 0.6) : null));
  for (let x = 0; x < 66; x += 4) bg.circle(x + 2, 7.2, 1.9, PAL.valance);
  for (const px of [3, 33, 63]) bg.rect(px - 0.8, 8, px + 0.8, 46, PAL.iron);
  for (const lx of [17, 47]) { bg.line(lx, 8, lx, 10.5, 0.8, PAL.iron); bg.circle(lx, 11.5, 1.4, PAL.cream); night.circle(lx, 11.5, 1.6, PAL.window); }
  // goods yard over the void: nothing but the rails on a trestle
  // ----- the right band: water tower, road, crossing, houses
  bg.rect(138, 72, 139.4, 86, PAL.timber); bg.rect(152.6, 72, 154, 86, PAL.timber);
  bg.line(138.7, 74, 153.3, 84, 0.9, PAL.timber); bg.line(153.3, 74, 138.7, 84, 0.9, PAL.timber);
  bg.rrect(135, 61, 157, 73, 2, hex('#a06a38'));
  bg.rect(135, 61, 157, 73, (x) => (Math.floor(x) % 3 === 0 ? hex('#7a4a22') : null));
  bg.ellipse(146, 61.5, 11, 1.6, hex('#c88a50'));
  for (const hy of [64, 70]) bg.rect(135, hy, 157, hy + 0.9, hex('#9098a8'));
  bg.line(156, 67, 163, 63, 1.4, hex('#9098a8'));
  bg.rect(128, ROAD.y0, W, ROAD.y1, PAL.black);
  bg.rect(128, ROAD.y0, W, ROAD.y0 + 0.7, PAL.road); bg.rect(128, ROAD.y1 - 0.7, W, ROAD.y1, PAL.road);
  bg.rect(128, 92.2, W, 92.9, (x) => (Math.floor(x) % 6 < 3 ? PAL.mark : null));
  tree(bg, 132, 84, 3.4); tree(bg, 166, 84, 3);
  house(bg, 133, 108, 14, 9, PAL.tile, night); house(bg, 152, 112, 12, 8, PAL.tile2, night);
  tree(bg, 168, 126, 3.6); tree(bg, 133, 127, 3);
  // ----- the left band, above the mountain
  house(bg, 150, 133, 12, 8, PAL.tile2, night);
  // ----- the pond with its bridge
  bg.ellipse(POND.cx, POND.cy, POND.rx + 1.5, POND.ry + 1.5, hex('#a09060'));
  bg.ellipse(POND.cx, POND.cy, POND.rx, POND.ry, PAL.water);
  for (let k = 0; k < 9; k++) { const a = 2.1 + k * 0.17, x = POND.cx + (POND.rx + 1) * Math.cos(a), y = POND.cy + (POND.ry + 1) * Math.sin(a); bg.line(x, y, x - 0.6, y - 4 - 2 * hash(k), 0.8, PAL.leaf2); }
  bg.circle(122, 160, 2, PAL.leaf); bg.circle(126, 171, 1.6, PAL.leaf);
  tree(bg, 182, 150, 3.2); tree(bg, 167, 140, 3.2); tree(bg, 120, 145, 2.6); tree(bg, 137, 141, 2.6);
  // ----- the track: sleepers, rails; trestle and bridge decks under it
  bg.shape(0, 0, W, H, (x, y) => {
    const [, d] = nearest(x, y);
    return d < 4.7;
  }, (x, y) => {
    const [s, d] = nearest(x, y);
    if (d > 2.0 && d < 3.1) return PAL.rail;
    if (((s / 3.3) % 1 + 1) % 1 < 0.5) return PAL.sleeper;
    if (inPond(x, y) || (x > 112 && x < 172 && y > 175)) return hex('#505058');
    return PAL.black;
  });
  // bridge girders over the pond
  for (const gy of [175.2, 184.8]) bg.rect(112, gy - 0.6, 172, gy + 0.6, hex('#b0b8c0'));
  for (let x = 113; x < 172; x += 6) { bg.line(x, 175.2, x + 3, 184.8, 0.7, hex('#8890a0')); bg.line(x + 3, 184.8, x + 6, 175.2, 0.7, hex('#8890a0')); }
  // crossing boards between the rails
  bg.rect(173.5, ROAD.y0, 180.5, ROAD.y1, hex('#8a8a80'));
  bg.rect(174.5, ROAD.y0, 175.2, ROAD.y1, PAL.rail); bg.rect(178.8, ROAD.y0, 179.5, ROAD.y1, PAL.rail);
  // signal post behind the track at the top-right corner
  bg.rect(185.2, 16, 186.6, 46, PAL.grey); bg.rect(183.5, 45, 188.5, 47, PAL.grey);
  // crossing posts
  for (const [px, py] of [[166, 86], [188, 100]]) { bg.rect(px - 0.7, py - 8, px + 0.7, py, PAL.grey); bg.circle(px, py - 8, 1.2, hex('#402020')); }
  // ----- foreground: the trestle over the void, the mountain
  fg.rect(62, 54, 130, 55.4, PAL.timber);
  for (let x = 62; x <= 130; x += 11) {
    fg.rect(x, 54, x + 1.4, 64, PAL.timber);
    if (x + 11 <= 131) { fg.line(x + 1, 55, x + 11, 64, 0.9, scale3(PAL.timber, 0.75)); fg.line(x + 11, 55, x + 1, 64, 0.9, scale3(PAL.timber, 0.75)); }
  }
  paintMountain(fg);
  // flatten
  const d = bg.sprite(), n = night.sprite(), f = fg.sprite();
  const day = new Float32Array(3 * W * H), nightAdd = new Float32Array(3 * W * H);
  for (let p = 0; p < W * H; p++) for (let c = 0; c < 3; c++) { day[3 * p + c] = d.px[4 * p + c]; nightAdd[3 * p + c] = n.px[4 * p + c]; }
  return { day, night: nightAdd, fg: f };
}

function paintMountain(fg) {
  const inside = (x, y) => inPoly(MOUNTAIN, x, y);
  // skyline per column
  const sky = new Float32Array(113);
  for (let x = 0; x <= 112; x++) { let y = 60; while (y < 191 && !inside(x + 0.5, y)) y += 0.25; sky[x] = y; }
  const skyAt = (x) => { const i = Math.max(0, Math.min(111, Math.floor(x))), f = x - i; return sky[i] * (1 - f) + sky[i + 1] * f; };
  const slope = (x) => (skyAt(x + 3) - skyAt(x - 3)) / 6;
  fg.shape(0, 70, 112, 191, inside, (x, y) => {
    const depth = y - skyAt(x), X = Math.floor(x), Y = Math.floor(y);
    // faces turned to the left catch the light; gullies run down the slope
    const sl = slope(x), lit = 0.62 + 0.38 * Math.tanh(-sl * 1.6);
    const gully = 0.55 + 0.45 * noise2(x * 0.42 + y * 0.12 * sl, y * 0.06);
    if (depth < 1.2) return scale3(PAL.rock2, 0.85);
    // rocky crags in patches, forest everywhere else
    const crag = noise2(x * 0.08 + 3, y * 0.08) * (1 - smooth(4, 30, depth)) + 0.35 * noise2(x * 0.1, y * 0.1 + 9) - 0.15;
    const forest = 1 - smooth(0.35, 0.5, crag);
    const rk = scale3(hash(X, Y, 11) < 0.5 ? PAL.rock : PAL.rock2, (0.22 + 0.4 * lit * gully));
    if (forest <= 0) return rk;
    // forest: sparse lit needles on black, like the felt
    const f = hash(X, Y, 13) < 0.07 + 0.08 * lit ? scale3(PAL.pine, 0.7 + 0.6 * lit * hash(X, Y, 5)) : [0, 0, 0];
    return [rk[0] + (f[0] - rk[0]) * forest, rk[1] + (f[1] - rk[1]) * forest, rk[2] + (f[2] - rk[2]) * forest];
  });
  // pines on the lower slopes
  const pines = [[52, 104], [58, 112], [46, 118], [60, 124], [12, 96], [22, 104], [50, 86], [58, 94], [8, 116], [20, 122], [70, 145], [80, 150], [92, 147], [100, 156], [86, 162], [74, 160], [104, 168], [50, 132], [10, 140], [22, 150], [16, 165], [30, 172], [46, 160], [58, 176], [8, 184], [44, 186], [72, 180], [90, 184], [24, 128], [62, 160], [80, 168]];
  pines.sort((a, b) => a[1] - b[1]);
  for (const [x, y] of pines) pine(fg, x, y, 8 + 3 * hash(x, y));
  // the east portal, seen nearly edge-on: a stone facade with a tall dark arch
  fg.poly([[103, 158], [112, 163], [112, 191], [103, 191]], hex('#b0a894'));
  fg.shape(103, 158, 112, 191, (x, y) => inPoly([[103, 158], [112, 163], [112, 191], [103, 191]], x, y) && (Math.floor(y) % 4 === 0 || (Math.floor(x) + Math.floor(y / 4) * 2) % 5 === 0), hex('#6a6458'));
  fg.ellipse(108.6, 191, 2.8, 24, PAL.black);
  // pines along the ridge, poking above the skyline
  for (let x = 30; x < 63; x += 4.5) pine(fg, x + 1.5 * hash(x | 0, 1), skyAt(x) + 4, 6 + 3 * hash(x | 0, 2));
  for (let x = 66; x < 104; x += 5) pine(fg, x + 2 * hash(x | 0, 3), skyAt(x) + 4, 6 + 3 * hash(x | 0, 4));
  fg.shape(1, 66, 27, 71, (x, y) => (x - 14) ** 2 / 156 + (y - 71) ** 2 / 25 <= 1, hex('#a8a090'));
  fg.shape(1, 66, 27, 71, (x, y) => (x - 14) ** 2 / 100 + (y - 71.5) ** 2 / 12 <= 1, PAL.black);
}

// ------------------------------------------------------------ sprites
const RB = [hex('#ff2a2a'), hex('#ff8a10'), hex('#ffe020'), hex('#30d040'), hex('#2a7aff'), hex('#a050ff')];

/** The frog driver: 22 x 19, bold rainbow bands, two big white-rimmed glasses, a smile. */
export function frogSprite({ blink = false, pull = false, look = 0 } = {}) {
  const cv = new Canvas(26, 22, 6), X = 13;
  const sil = (c, g, col) => {
    c.circle(X - 5.4, 5.4, 4.9 + g, col); c.circle(X + 5.4, 5.4, 4.9 + g, col);
    c.ellipse(X, 11, 11.2 + g, 6.6 + g, col);
    c.ellipse(X, 17, 9 + g, 5.5 + g, col);
  };
  sil(cv, 1.0, PAL.black);
  const band = (x, y) => RB[Math.max(0, Math.min(5, Math.floor((y - 0.5) / 3.6)))];
  sil(cv, 0, band);
  if (pull) { cv.line(X + 9, 16, X + 12, 3, 3.6, PAL.black); cv.line(X + 9, 16, X + 12, 3, 2.3, band(0, 15)); }
  // glasses: white rims round dark lenses, a bright eye in each
  for (const ex of [X - 5.4, X + 5.4]) {
    cv.circle(ex, 5.4, 3.9, PAL.cream);
    cv.circle(ex, 5.4, 2.75, hex('#101028'));
    if (blink) cv.rect(ex - 2.75, 4.7, ex + 2.75, 6.1, band(0, 5));
    else cv.circle(ex + look * 0.9 + 0.3, 5.0, 1.0, [1, 1, 1]);
  }
  // a wide smile
  for (let k = 0; k < 12; k++) {
    const a = (18 + k * 12) * Math.PI / 180, b = (18 + (k + 1) * 12) * Math.PI / 180;
    cv.line(X + 6.4 * Math.cos(a), 10.6 + 3.6 * Math.sin(a), X + 6.4 * Math.cos(b), 10.6 + 3.6 * Math.sin(b), 1.8, [0, 0, 0]);
  }
  return cv.sprite();
}

/** Loco, side view facing right: { body, wall, w, h, ax, ay, cab, chimney, whistle, wheels }. */
export function locoSide() {
  const w = 46, h = 30, cv = new Canvas(w, h, 4), wall = new Canvas(w, h, 4);
  const RED = hex('#e8281c'), DARK = hex('#3a3a44'), MID = hex('#7a7a88');
  // frame and running board
  cv.rect(1, 21, 45, 24, DARK); cv.rect(1, 21, 45, 21.8, MID);
  // boiler
  cv.rrect(19, 9, 41, 21.5, 3, RED);
  cv.rect(19, 9.5, 41, 11, hex('#ff7a60'));
  for (const bx of [25, 32]) cv.rect(bx, 9, bx + 1.2, 21.5, PAL.brass);
  // smokebox and chimney
  cv.rrect(38.5, 8, 44.5, 22, 2, DARK); cv.rect(38.5, 8.6, 44.5, 9.8, MID);
  cv.rect(38.6, 1.5, 42.4, 9, DARK); cv.rect(37.6, 0, 43.4, 2.2, PAL.brass);
  cv.rect(39, 2.2, 39.9, 9, MID);
  // dome, sandbox, whistle
  cv.ellipse(29, 8.6, 3, 2.6, PAL.brass);
  cv.rect(19, 2.5, 20.4, 6.5, PAL.brass);
  // headlamp and buffer beam
  cv.rect(42, 4.5, 45, 7.5, PAL.cream); cv.rect(43.6, 21, 46, 25, RED);
  // cab: roof on posts, open sides
  cv.rect(18, 8, 19.6, 18, RED);
  // the cab's lower wall goes in front of the frog
  wall.rect(0, 16, 20, 23, RED); wall.rect(0, 16, 20, 17.2, PAL.brass);
  wall.rect(3, 18.5, 17, 21.5, hex('#b01810'));
  return {
    body: cv.sprite(), wall: wall.sprite(), w, h, ax: 23, ay: 30,
    cab: [0, 0], chimney: [40.5, 0.5], whistle: [19.7, 2.5],
    wheels: [[27, 25.6, 4.2], [37, 25.6, 4.2], [10, 26.8, 3.0]], rod: [[27, 37]],
  };
}
/** Loco front view (heading down, coming at you) and back view (heading up). */
export function locoEnds() {
  const w = 24, h = 30, RED = hex('#e8281c'), DARK = hex('#3a3a44'), MID = hex('#7a7a88');
  const f = new Canvas(w, h, 4);
  f.rrect(1, 22, 23, 26, 1, RED);
  f.circle(4, 24, 1.6, MID); f.circle(20, 24, 1.6, MID);
  f.circle(12, 15, 8, DARK); f.ring(12, 15, 7, 8, MID);
  f.circle(12, 15, 2.6, MID);
  f.rect(9.5, 2, 14.5, 8, DARK); f.rect(8.5, 0.5, 15.5, 2.5, PAL.brass);
  f.circle(12, 9.8, 1.8, PAL.cream);
  f.rect(3, 26, 6, 30, RED); f.rect(18, 26, 21, 30, RED);
  const b = new Canvas(w, h, 4);
  b.rrect(1, 2, 23, 5, 1, DARK);
  b.rect(2, 5, 22, 24, RED); b.rect(2, 16, 22, 17, PAL.brass);
  b.rect(4.5, 6.5, 19.5, 15, hex('#20202a'));
  b.rect(1, 23, 23, 26, DARK);
  b.rect(3, 26, 6, 30, RED); b.rect(18, 26, 21, 30, RED);
  return { front: f.sprite(), back: b.sprite(), w, h, ax: 12, ay: 30 };
}

/** Flat wagon, side view (26 x 9) and end view (12 x 9); hopper wagons have a split deck. */
export function wagonSprites() {
  const make = (hopper) => {
    const cv = new Canvas(26, 9, 4), GREEN = hex('#1c8a4a'), PLANK = hex('#d09050');
    if (hopper) { cv.rect(1, 0, 7.5, 2, PLANK); cv.rect(18.5, 0, 25, 2, PLANK); }
    else cv.rect(1, 0, 25, 2, PLANK);
    cv.rect(1, 2, 25, 5, GREEN); cv.rect(1, 2, 25, 2.7, hex('#60c080'));
    if (hopper) cv.poly([[8, 2], [18, 2], [16, 5.6], [10, 5.6]], hex('#14663a'));
    cv.rect(0, 3, 1.2, 4.6, PAL.grey); cv.rect(24.8, 3, 26, 4.6, PAL.grey);
    return cv.sprite();
  };
  const e = new Canvas(12, 9, 4), GREEN = hex('#1c8a4a');
  e.rect(1, 0, 11, 2, hex('#d09050')); e.rect(1, 2, 11, 5.5, GREEN); e.rect(1, 2, 11, 2.7, hex('#60c080'));
  e.circle(2.5, 4, 1.1, PAL.grey); e.circle(9.5, 4, 1.1, PAL.grey);
  e.rect(1.5, 5.5, 3.5, 9, hex('#c0c0c8')); e.rect(8.5, 5.5, 10.5, 9, hex('#c0c0c8'));
  return { flat: make(false), hopper: make(true), end: e.sprite(), w: 26, h: 9, ax: 13, ay: 9, ew: 12, eax: 6 };
}

/** Passengers: 5 x 11 figures, a few coats and hats. */
export function peopleSprites() {
  const coats = ['#e04040', '#3a70e0', '#e0a020', '#9a50d0', '#30a070'];
  return coats.map((c, i) => {
    const cv = new Canvas(5, 11, 6);
    cv.rect(1, 8, 2.1, 11, hex('#8a8a9a')); cv.rect(2.9, 8, 4, 11, hex('#8a8a9a'));
    cv.rrect(0.4, 3.8, 4.6, 8.8, 1, hex(c));
    cv.circle(2.5, 2.4, 1.7, hex('#f4b888'));
    if (i % 2 === 0) { cv.rect(0.6, 0, 4.4, 1.4, hex('#505060')); cv.rect(0, 1.2, 5, 1.8, hex('#505060')); }
    else cv.rect(0.8, 0.4, 4.2, 1.6, hex(['#ffe060', '#ff80a0', '#ffffff'][i % 3]));
    return cv.sprite();
  });
}

/** Cars, side view facing right (12 x 7); flip for the other lane. */
export function carSprites() {
  const cols = ['#ff3a30', '#3a8aff', '#ffd040', '#40c070', '#f0f0f0'];
  return cols.map((c) => {
    const cv = new Canvas(12, 7, 4);
    cv.rrect(0, 2.4, 12, 5.8, 1.2, hex(c));
    cv.rrect(2.6, 0, 8.6, 3, 1, hex(c)); cv.rect(3.4, 0.7, 5.4, 2.6, hex('#a0d0ff')); cv.rect(6, 0.7, 8, 2.6, hex('#a0d0ff'));
    cv.circle(3, 5.8, 1.3, hex('#202020')); cv.circle(9, 5.8, 1.3, hex('#202020'));
    cv.circle(3, 5.8, 0.6, PAL.grey); cv.circle(9, 5.8, 0.6, PAL.grey);
    cv.rect(11, 3, 12, 4, PAL.cream);
    const s = cv.sprite();
    return { r: s, l: flipX(s) };
  });
}

/** A duck facing right (8 x 6) and asleep. */
export function duckSprites() {
  const mk = (sleep) => {
    const cv = new Canvas(8, 6, 6), WHITE = hex('#fff4e0');
    cv.ellipse(3.6, 4, 3.4, 1.8, WHITE); cv.poly([[0, 3], [1.4, 2.4], [1.4, 4]], WHITE);
    if (sleep) cv.circle(4.6, 2.8, 1.4, WHITE);
    else { cv.circle(5.8, 1.6, 1.4, WHITE); cv.rect(6.8, 1.4, 8, 2.3, hex('#ff8a10')); cv.circle(6.2, 1.3, 0.4, [0, 0, 0]); }
    return cv.sprite();
  };
  const a = mk(false), s = mk(true);
  return { r: a, l: flipX(a), sr: s, sl: flipX(s) };
}
