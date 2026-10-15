// The board for pcb.js: layout, materials and the baked background.
//
// The layout is a small clock module seen close up: the chip U1 (a QFN) in
// the middle, its crystal Y1 under it, two LEDs over it, a header J1 at the
// right edge, two bus traces from U1 along the top edge to J1, and
// a ground pour flooding everything else. The digit slots are pour: the
// numerals carve their own moats in it, per frame (pcb.js).
//
// buildMaterials() rasterises the copper once (a material and a shade per
// pixel, colour-free); bakeBoard() colours it for one soldermask and draws
// the parts and the silkscreen on top. Both run once (materials) and once
// per mask colour, i.e. once an hour, outside the frame.

import { Gfx, segDist, roundRectDist, hex, mix, scale, R, G, B } from '../js/kit.js';
import { silk } from './pcb-glyphs.js';

export const W = 160, H = 80;

// ------------------------------------------------------------ slots
export const SLOTS = [
  { x: 7, y: 9, big: true }, { x: 36, y: 9, big: true },
  { x: 99, y: 19, big: false }, { x: 123, y: 19, big: false },
];

// ------------------------------------------------------------ parts
export const CHIP = { x: 71, y: 27, s: 18, pins: [30, 33, 36, 39, 42] };   // pins: offsets along each side
export const XTAL = { x: 74, y: 52, w: 12, h: 7 };
export const LEDS = [
  { x: 68, y: 8, c: hex('ff3a2a'), label: 'D1' },    // power: red, always on
  { x: 88, y: 8, c: hex('ffb020'), label: 'D2' },    // heartbeat: amber, 1 Hz
];
export const J1 = { x: 153, pins: [23, 32, 41, 50], r: 3.0, drill: 1.3 };

/** Mask-covered traces: polylines, half-width 1. The first three carry packets. */
export const TRACES = [
  [[80, 27], [80, 9], [85, 4], [141, 4], [146, 9], [146, 19], [150, 23], [153, 23]],
  [[83, 27], [83, 11], [87, 7], [138, 7], [143, 12], [143, 23], [149, 29], [149, 30], [151, 32], [153, 32]],
  [[89, 42], [93, 42], [93, 50], [89, 54], [87, 54]],
  // crystal to U1
  [[77, 45], [77, 51]],
  // crystal load caps
  [[74, 55], [70, 55], [69, 56]], [[86, 55], [90, 55], [91, 56]],
  // LEDs to U1 through their resistors
  [[74, 27], [74, 22], [71, 19], [71, 17]], [[86, 27], [86, 22], [89, 19], [89, 17]],
  [[71, 13], [71, 11]], [[89, 13], [89, 11]],
  // U1's left side to the test points, its right side down escape vias
  [[71, 33], [67, 33], [65, 35], [65, 40]], [[71, 39], [68, 39], [68, 44]],
  [[89, 30], [93, 30]], [[89, 36], [93, 36]], [[153, 50], [153, 56], [150, 59]],
];
/** Escape vias (open, tinned rings with a drill): [x, y]. */
export const VIAS = [[94, 30], [94, 36], [149, 60]];
/** Exposed tinned SMD pads: [x, y, w, h]. */
export const SMD = [
  // load caps C1, C2 (vertical 0603)
  [68, 56, 3, 2], [68, 60, 3, 2], [90, 56, 3, 2], [90, 60, 3, 2],
  // LED resistors R1, R2 (vertical 0603)
  [70, 14, 3, 2], [70, 18, 3, 2], [88, 14, 3, 2], [88, 18, 3, 2],
];
/** Round exposed gold: test points and fiducials [x, y, r, ringClear]. */
export const GOLD_DOTS = [[65, 42, 1.8, 1.4], [68, 46, 1.8, 1.4], [4, 4, 1.4, 1.8], [156, 76, 1.4, 1.8]];
/** Tented stitching vias in the pour. */
export const STITCH = [[66, 66], [72, 70], [88, 70], [94, 74], [64, 26], [96, 47], [64, 50], [147, 6], [104, 4], [128, 4], [116, 75], [146, 75], [24, 76], [48, 76], [24, 3], [48, 3]];
/** Ground pads: thermal reliefs (spokes into the pour). */
const THERMAL_PADS = [[153, 41]];

// materials
export const M_MAT = 0, M_EDGE = 1, M_LAM = 2, M_CU = 3, M_TIN = 4, M_HOLE = 5, M_GOLD = 6;

let MAT = null, SHADE = null;
/** Rasterise the board: a material and a small shade per pixel. Once. */
export function buildMaterials() {
  if (MAT) return { mat: MAT, shade: SHADE };
  MAT = new Uint8Array(W * H); SHADE = new Float32Array(W * H);
  const segs = [];
  for (const t of TRACES) for (let i = 1; i < t.length; i++) segs.push([t[i - 1][0], t[i - 1][1], t[i][0], t[i][1]]);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const px = x + 0.5, py = y + 0.5, i = y * W + x;
      const board = roundRectDist(px, py, 0, 0, W, H, 5);
      if (board > -0.2) { MAT[i] = M_MAT; continue; }
      if (board > -1.2) { MAT[i] = M_EDGE; continue; }
      let m = board > -3 ? M_LAM : M_CU;          // the pour stops short of the edge
      // traces: copper with a clearance round it
      let dt = 1e9;
      for (const s of segs) { const e = segDist(px, py, s[0], s[1], s[2], s[3]); if (e < dt) dt = e; }
      if (dt < 1.0) m = M_CU; else if (dt < 2.2 && m === M_CU) m = M_LAM;
      // SMD pads
      for (const [rx, ry, rw, rh] of SMD) {
        const e = roundRectDist(px, py, rx, ry, rw, rh, 0.4);
        if (e < 0) m = M_TIN; else if (e < 1.3 && m !== M_TIN) m = M_LAM;
      }
      // J1: drilled pads, pin 1 square, pin 3 on thermal spokes
      J1.pins.forEach((py0, k) => {
        const dx = px - J1.x, dy = py - py0;
        const e = k === 0 ? Math.max(Math.abs(dx), Math.abs(dy)) - J1.r : Math.hypot(dx, dy) - J1.r;
        const thermal = THERMAL_PADS.some(([tx, ty]) => tx === J1.x && ty === py0);
        if (e < 0) m = Math.hypot(dx, dy) < J1.drill + 0.3 ? M_HOLE : M_TIN;
        else if (e < 1.6 && m !== M_TIN && m !== M_HOLE) m = thermal && (Math.abs(dx) < 1 || Math.abs(dy) < 1) ? M_CU : M_LAM;
      });
      for (const [gx, gy, r, ring] of GOLD_DOTS) {
        const e = Math.hypot(px - gx, py - gy) - r;
        if (e < 0) m = M_GOLD; else if (e < ring) m = M_LAM;
      }
      for (const [vx, vy] of VIAS) {
        const e = Math.hypot(px - vx, py - vy);
        if (e < 0.9) m = M_HOLE; else if (e < 2.0) m = M_TIN; else if (e < 3.1 && m !== M_TIN) m = M_LAM;
      }
      // the chip's pins (tin) and the clearance under its body
      const c = CHIP, cx0 = c.x, cy0 = c.y, cx1 = c.x + c.s, cy1 = c.y + c.s;
      if (px > cx0 - 2.5 && px < cx1 + 2.5 && py > cy0 - 2.5 && py < cy1 + 2.5) {
        if (m === M_CU && !(dt < 1.0)) m = M_LAM;
      }
      MAT[i] = m;
    }
  // tented stitching vias: a ring of copper under the mask, a dimple in the middle
  for (const [vx, vy] of STITCH)
    for (let y = vy - 2; y <= vy + 2; y++)
      for (let x = vx - 2; x <= vx + 2; x++) {
        const d = Math.hypot(x + 0.5 - vx, y + 0.5 - vy);
        if (d < 1.9) SHADE[y * W + x] = d < 0.8 ? -0.5 : 0.35;
      }
  return { mat: MAT, shade: SHADE };
}

// ------------------------------------------------------------ soldermasks
// lam: laminate under mask (no copper: the moats), cu: copper under mask
// (the pour and the traces), silk: silkscreen on that mask
export const MASKS = {
  green: { lam: hex('0b3a20'), cu: hex('2a7a3c'), silk: hex('eef2e8') },
  blue: { lam: hex('0a1f48'), cu: hex('22508e'), silk: hex('eef0f4') },
  red: { lam: hex('420c10'), cu: hex('8e2a26'), silk: hex('f4ece8') },
  purple: { lam: hex('26103e'), cu: hex('5a3086'), silk: hex('f0ecf4') },
  black: { lam: hex('0e0f11'), cu: hex('2a2c30'), silk: hex('e4e6e8') },
  navy: { lam: hex('08142a'), cu: hex('1c3058'), silk: hex('dfe4ee') },
};
const DAY_MASKS = ['green', 'blue', 'red', 'purple'];
const NIGHT_MASKS = ['black', 'navy'];
/** The mask colour for an hour: four colours by day, black and navy by night (23:00 to 07:00). */
export function maskFor(h) {
  return h >= 23 || h < 7 ? NIGHT_MASKS[h % 2] : DAY_MASKS[h % 4];
}

const MATC = hex('1c262c'), EDGE = hex('b9a878'), TIN = hex('c9ced2'), TIN_D = hex('8c9296'), HOLE = hex('0c1214');
export const GOLD = hex('dca63e');

const to565i = (r, g, b) => {
  r = r < 0 ? 0 : r > 255 ? 255 : r; g = g < 0 ? 0 : g > 255 ? 255 : g; b = b < 0 ? 0 : b > 255 ? 255 : b;
  return ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3);
};

const BAKED = new Map();
/**
 * The board in one mask colour: { bg: Gfx (everything static), lam:
 * Uint16Array (the laminate colour per pixel, what a moat shows), mask }.
 */
export function bakeBoard(name) {
  let b = BAKED.get(name);
  if (b) return b;
  const { mat, shade } = buildMaterials();
  const mk = MASKS[name];
  const bg = new Gfx(W, H), lam = new Uint16Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      // a macro lens: brighter in the middle, falling off to the corners
      const dx = (x - 80) / 80, dy = (y - 40) / 40;
      const vig = 1.06 - 0.2 * (dx * dx * 0.7 + dy * dy * 0.5);
      // the glass weave shows through the mask where there is no copper
      const weave = (((x >> 1) + (y >> 1)) & 1 ? 3 : -3) + ((Math.imul(x * 131 + y * 71, 0x2c1b3c6d) >>> 28) - 7) * 0.5;
      const lr = R(mk.lam) * vig + weave, lg = G(mk.lam) * vig + weave, lb = B(mk.lam) * vig + weave;
      lam[i] = to565i(lr | 0, lg | 0, lb | 0);
      let c;
      switch (mat[i]) {
        case M_MAT: c = to565i(R(MATC), G(MATC), B(MATC)); break;
        case M_EDGE: c = to565i(R(EDGE) * vig, G(EDGE) * vig, B(EDGE) * vig); break;
        case M_LAM: c = lam[i]; break;
        case M_CU: {
          const k = vig * (1 + shade[i]);
          c = to565i(R(mk.cu) * k | 0, G(mk.cu) * k | 0, B(mk.cu) * k | 0);
          break;
        }
        case M_TIN: c = to565i(R(TIN) * vig, G(TIN) * vig, B(TIN) * vig); break;
        case M_HOLE: c = to565i(R(HOLE), G(HOLE), B(HOLE)); break;
        case M_GOLD: c = to565i(R(GOLD) * vig, G(GOLD) * vig, B(GOLD) * vig); break;
      }
      bg.buf[i] = c;
    }
  drawParts(bg, mk);
  b = { bg, lam, mask: mk, name };
  BAKED.set(name, b);
  return b;
}

function drawParts(c, mk) {
  const S = mk.silk;
  // ---- U1: a QFN, black epoxy, tinned pins round the edge, pin-1 dimple
  const { x, y, s } = CHIP;
  c.rect(x - 2, y - 2, s + 4, s + 4, S);
  c.pixel(x - 4, y - 4, S); c.pixel(x - 3, y - 4, S); c.pixel(x - 4, y - 3, S);
  for (let k = 0; k < 5; k++) {
    const o = 3 + k * 3;
    c.fillRect(x - 1, y + o, 2, 1, TIN); c.fillRect(x + s - 1, y + o, 2, 1, TIN);
    c.fillRect(x + o, y - 1, 1, 2, TIN); c.fillRect(x + o, y + s - 1, 1, 2, TIN);
  }
  c.fillRect(x, y, s, s, hex('17181b'));
  c.gradient(x, y, s, s, [hex('2a2c31'), hex('17181b'), hex('101114')], { angle: 45 });
  c.fillCircle(x + 3.5, y + 3.5, 1.4, hex('0b0c0e'), { aa: true });
  silk(c, 'RTC', x + 4, y + 7, hex('5c6066'));
  silk(c, '32K', x + 4, y + 13 - 0, hex('44474c'));
  // ---- Y1: a 3225 crystal, a brushed metal lid on a ceramic base
  const X = XTAL;
  c.fillRect(X.x - 1, X.y, X.w + 2, X.h, hex('cdbb96'));
  c.fillRect(X.x - 1, X.y, 2, 2, TIN); c.fillRect(X.x + X.w - 1, X.y, 2, 2, TIN);
  c.fillRect(X.x - 1, X.y + X.h - 2, 2, 2, TIN); c.fillRect(X.x + X.w - 1, X.y + X.h - 2, 2, 2, TIN);
  c.gradient(X.x + 1, X.y + 1, X.w - 2, X.h - 2, [hex('e4e8ec'), hex('a4aab0'), hex('d2d6da'), hex('8e949a')], { angle: 20 });
  c.rect(X.x + 1, X.y + 1, X.w - 2, X.h - 2, hex('7c8288'));
  silk(c, 'Y1', X.x - 10, X.y + 1, S);
  // ---- caps C1 C2 (tan ceramic between their tinned ends), resistors R1 R2 (black)
  for (const [px, py, body] of [[68, 56, hex('b89a6a')], [90, 56, hex('b89a6a')], [70, 14, hex('1a1a1c')], [88, 14, hex('1a1a1c')]]) {
    c.fillRect(px, py + 2, 3, 2, body);
    c.fillRect(px, py, 3, 1, mix(TIN, hex('ffffff'), 0.3));
  }
  // ---- LEDs: a clear lens over a die, tinned ends (lit per frame)
  for (const L of LEDS) {
    c.fillRect(L.x, L.y, 1, 3, TIN); c.fillRect(L.x + 5, L.y, 1, 3, TIN);
    c.fillRect(L.x + 1, L.y, 4, 3, mix(hex('e8e2cc'), L.c, 0.25));
    c.fillRect(L.x + 2, L.y + 1, 2, 1, mix(hex('8a8070'), L.c, 0.4));
    silk(c, L.label, L.x - 1, L.y - 6 < 1 ? L.y + 4 : L.y - 6, S);
  }
  // ---- silkscreen
  c.rect(149, 18, 9, 37, S);
  silk(c, 'J1', 150, 12, S);
  silk(c, 'U1', 63, 20, S);
  silk(c, 'RTC-960 REV A', 97, 73, S);
  silk(c, 'TP', 61, 46, S, { a: 0 });
}

/** The bench under the board, seen when it flips: an anti-static mat. */
let MAT_CANVAS = null;
export function matCanvas() {
  if (MAT_CANVAS) return MAT_CANVAS;
  const c = new Gfx(W, H);
  c.gradient(0, 0, W, H, [hex('2a3a44'), hex('18242c')], { angle: 90 });
  for (let x = 4; x < W; x += 10) c.fillRect(x, 0, 1, H, hex('22323c'));
  for (let y = 5; y < H; y += 10) c.fillRect(0, y, W, 1, hex('22323c'));
  MAT_CANVAS = c;
  return c;
}
