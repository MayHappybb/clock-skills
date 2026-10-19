// The fairground round the wheel: dusk sky, a big-top and a helter-skelter
// in the bottom corners, the A-frame, the loading deck (prerendered once),
// plus the people (queue, riders, the crowd) drawn each frame.
// The rim (R = 70 round a hub hidden in the missing centre panel) lies
// wholly in the ring of panels; the spokes run into the hole.
import * as kit from '../js/kit.js';
import { W, H, rect, line, disc } from './ferriswheel-paint.js';

export const CX = 96, CY = 70, R = 70, RI = 64;   // hub (hidden in the hole), rim, inner rim
export const FLOOR = 190;                          // where people stand
const sc = (h, k) => kit.scale(kit.hex(h), k);

export const PAL = {
  steel: sc('#8a9ac8', 0.24),
  steelHi: sc('#c4d0f2', 0.5),
  rose: kit.hex('#ff3d7f'),
  teal: kit.hex('#2de0d0'),
  amber: kit.hex('#ffb347'),
};

function skyAt(y) {
  // dusk: ink-blue overhead, violet, a low ember band on the horizon
  const stops = [
    [0, [0.0004, 0.0005, 0.0030]], [80, [0.0010, 0.0010, 0.0050]], [130, [0.0030, 0.0014, 0.0070]],
    [160, [0.0080, 0.0022, 0.0070]], [176, [0.0160, 0.0045, 0.0040]], [181, [0.0190, 0.0055, 0.0030]],
  ];
  for (let i = 1; i < stops.length; i++) {
    if (y <= stops[i][0]) {
      const [y0, a] = stops[i - 1], [y1, b] = stops[i], t = (y - y0) / (y1 - y0);
      return kit.mix(a, b, t * t * (3 - 2 * t));
    }
  }
  return stops[stops.length - 1][1];
}

const setPx = (img, x, y, c) => { const p = 3 * (y * W + x); img[p] = c[0]; img[p + 1] = c[1]; img[p + 2] = c[2]; };

export function buildBackground() {
  const img = new Float32Array(3 * W * H);
  for (let y = 0; y < H; y++) { const c = skyAt(y + 0.5); for (let x = 0; x < W; x++) setPx(img, x, y, c); }
  const roseD = sc('#e8406a', 0.25), creamD = sc('#ffe0b0', 0.16), tealD = sc('#2aa59a', 0.18);

  // big-top tent, bottom-left corner
  const TX = 12;
  for (let y = 146; y < 181; y++) for (let x = 0; x < 30; x++) {
    const px = x + 0.5, py = y + 0.5;
    let hw, stripe;
    if (py < 166) { hw = ((py - 146) / 20) * 17; stripe = Math.floor(((px - TX) / Math.max(hw, 1) + 1) * 2.5) & 1; }
    else { hw = 17; stripe = Math.floor((px + 1) / 4) & 1; }
    if (Math.abs(px - TX) > hw) continue;
    setPx(img, x, y, kit.scale(stripe ? roseD : creamD, py < 166 ? 0.7 + 0.3 * (py - 146) / 20 : 0.55));
  }
  for (let k = 0; k < 9; k++) disc(img, -4 + k * 4 + 2, 166.2, 1.8, k & 1 ? creamD : roseD);
  rect(img, 8, 171, 8, 10, [0.12, 0.055, 0.015]);                 // lit doorway
  rect(img, 9.5, 172.5, 5, 8.5, [0.20, 0.095, 0.028]);
  line(img, TX + 0.5, 146, TX + 0.5, 139, 1, PAL.steelHi);
  rect(img, TX + 1, 139, 4, 2.5, sc('#ff3d7f', 0.16));            // pennant

  // helter-skelter, bottom-right corner
  const HX = 181;
  for (let y = 128; y < 181; y++) for (let x = 166; x < W; x++) {
    const px = x + 0.5, py = y + 0.5;
    if (py < 140) {
      const hw = ((py - 128) / 12) * 9;
      if (Math.abs(px - HX) > hw) continue;
      setPx(img, x, y, kit.scale(roseD, 0.75 + 0.45 * (px - HX) / 9));
      continue;
    }
    const hw = 5 + (py - 140) * 0.04;
    if (Math.abs(px - HX) > hw + 2.4) continue;
    const lip = Math.abs(px - HX) > hw;
    const band = (((py + (px - HX) * 1.3) % 10) + 10) % 10 < 4;
    setPx(img, x, y, lip ? (band ? creamD : [0.006, 0.004, 0.006]) : band ? creamD : tealD);
  }
  line(img, HX + 0.5, 128, HX + 0.5, 121, 1, PAL.steelHi);
  rect(img, HX + 1, 121, 4, 2.5, sc('#2de0d0', 0.16));

  // the ground: warm under the deck lights
  for (let y = 181; y < H; y++) for (let x = 0; x < W; x++) {
    const warm = Math.exp(-(((x - 96) / 60) ** 2));
    setPx(img, x, y, [0.002 + 0.010 * warm, 0.0015 + 0.005 * warm, 0.002 + 0.002 * warm]);
  }

  // A-frame: two trussed legs from the hidden hub to the ground
  for (const side of [-1, 1]) {
    const fx = CX + side * 46, fy = 189;
    for (const o of [-2.2, 2.2]) line(img, CX, CY, fx + o, fy, 1.2, PAL.steel);
    for (let k = 0; k < 24; k++) {
      const t0 = 0.4 + k * 0.025, t1 = t0 + 0.025;
      const ax = CX + (fx - CX) * t0, ay = CY + (fy - CY) * t0, bx = CX + (fx - CX) * t1, by = CY + (fy - CY) * t1;
      const o = (2.2 * (t0 * 1.0)) * (k & 1 ? 1 : -1);
      line(img, ax - o, ay, bx + o, by, 0.7, kit.scale(PAL.steel, 0.6));
    }
  }
  // loading deck with steps
  rect(img, 66, 189, 60, 3, [0.12, 0.06, 0.03]);
  rect(img, 66, 189, 60, 1, [0.3, 0.16, 0.07]);
  return img;
}

// ---------------------------------------------------------------- people
const SHIRTS = ['#d83a4a', '#2f7fc0', '#8a4cc0', '#2fa868', '#e0782a', '#e04a9a', '#22a8a0', '#c8c040'].map((h) => sc(h, 0.8));
const SKINS = ['#f2c29a', '#d79a6a', '#a8704a', '#7e5238'].map((h) => sc(h, 0.8));
const HAIRS = ['#2a1a10', '#5a3418', '#b07030', '#181818', '#d8c070'].map((h) => sc(h, 0.5));
const LEGS = ['#34407a', '#404040', '#6a4a30'].map((h) => sc(h, 0.45));

/** The look of person `seed`: colours, height, whether a child. */
export function personLook(seed) {
  const h = (k) => kit.hash(seed, k, 77);
  const kid = h(5) < 0.22;
  return {
    shirt: SHIRTS[Math.floor(h(1) * SHIRTS.length)], skin: SKINS[Math.floor(h(2) * SKINS.length)],
    hair: HAIRS[Math.floor(h(3) * HAIRS.length)], legs: LEGS[Math.floor(h(4) * LEGS.length)],
    kid, tall: kid ? 12 : 16 + h(6) * 3,
  };
}

/** A person standing at (x, foot): stride -1..1 walks the legs, arms 0 (down) .. 1 (up), faded by a. */
export function person(img, x, foot, look, stride, arms, a) {
  if (a <= 0.01) return;
  const T = look.tall, hw = look.kid ? 2 : 2.7;
  const legH = T * 0.38, torso = T * 0.37, s = stride * 0.9;
  rect(img, x - hw + 0.3 + s, foot - legH, 1.7, legH, look.legs, a);
  rect(img, x + hw - 2.0 - s, foot - legH, 1.7, legH, look.legs, a);
  rect(img, x - hw, foot - legH - torso, 2 * hw, torso, look.shirt, a);
  if (arms > 0.05) {
    const up = arms * (T * 0.38);
    rect(img, x - hw - 1.3, foot - legH - torso - up + 0.5, 1.3, torso * 0.6 + up * 0.3, look.shirt, a);
    rect(img, x + hw, foot - legH - torso - up + 0.5, 1, torso * 0.6 + up * 0.3, look.shirt, a);
  }
  const hy = foot - T;
  disc(img, x, hy + 2.2, 2.2, look.skin, a);
  rect(img, x - 2.2, hy, 4.4, 1.4, look.hair, a);
}
