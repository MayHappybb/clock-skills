// The garden staff for topiary.js: gardeners with big shears, a stepladder,
// a rake. All anti-aliased shapes so they glide; drawn bold and simple
// (a few flat colours, a dark keyline from overlap, clear hat and face) so
// they read at 15-25 px tall.
//
// Coordinates: (x, foot) is the point between the boots on the ground (or on
// the ladder step); `s` is the scale (1 = a near gardener, ~25 px tall).

import { sin, cos } from '../js/kit.js';

const AA = { aa: true };

/** Outfits: hat, hat band, shirt, waistcoat, trousers, skin, hair/moustache. */
export const OUTFIT = [
  { hat: 0xe8c060, band: 0xb83a2a, shirt: 0xf0ead8, coat: 0xb8562e, legs: 0x5a4030, skin: 0xf0b890, hair: 0xe8e4dc, cap: false },  // head gardener: straw boater
  { hat: 0x3a5a8a, band: 0x3a5a8a, shirt: 0xd8e4f0, coat: 0x4a78b8, legs: 0x4a3a30, skin: 0xf4c4a0, hair: 0x6a4428, cap: true },   // apprentice: blue cap
  { hat: 0xd84a3a, band: 0xd84a3a, shirt: 0xf4ecd8, coat: 0x8a5ab0, legs: 0x3a3440, skin: 0xd09070, hair: 0x2a2020, cap: true },   // crew
  { hat: 0xe8c060, band: 0x2a6a9a, shirt: 0xf0e0c0, coat: 0xd8a030, legs: 0x4a3a2c, skin: 0xf0c0a0, hair: 0xb06a3a, cap: false },
];

export const STEEL = 0xd8e0e8, STEEL_D = 0x7a8694, WOOD = 0xa87a48, WOOD_D = 0x6a4a2a, BOOT = 0x2a2018, KEY = 0x1a1410;

/** An A-frame stepladder from the ground up to `topY`, opened by `open` (0 folded .. 1 standing). */
export function ladder(g, x, ground, topY, s, open, tone) {
  const hgt = ground - topY;
  if (hgt < 2) return;
  const spread = (1.2 + 2.6 * open) * s, half = 1.6 * s;
  const wood = tone(WOOD), dark = tone(WOOD_D);
  // back legs (behind, darker)
  g.thickLine(x - spread * 0.55, ground, x - half * 0.6, topY, 1.1 * s, dark, AA);
  g.thickLine(x + spread * 0.55, ground, x + half * 0.6, topY, 1.1 * s, dark, AA);
  // front rails
  g.thickLine(x - spread, ground, x - half, topY, 1.3 * s, wood, AA);
  g.thickLine(x + spread, ground, x + half, topY, 1.3 * s, wood, AA);
  // rungs
  const step = 4.2 * s;
  for (let y = ground - step; y > topY + 1; y -= step) {
    const u = (ground - y) / hgt, w = spread + (half - spread) * u;
    g.thickLine(x - w, y, x + w, y, 0.9 * s, dark, AA);
  }
  g.fillRect(Math.round(x - half - 0.5 * s), Math.round(topY - 1), Math.round(2 * half + s), Math.max(1, Math.round(1.2 * s)), wood);
}

/** The ladder folded and carried on the shoulder, level, pointing `dir`. */
function carriedLadder(g, x, y, s, dir, tone) {
  const wood = tone(WOOD), dark = tone(WOOD_D), len = 11 * s;
  const x0 = x - dir * len * 0.45, x1 = x + dir * len * 0.55;
  g.thickLine(x0, y, x1, y - 0.6 * s, 1.2 * s, wood, AA);
  g.thickLine(x0, y + 1.8 * s, x1, y + 1.2 * s, 1.1 * s, dark, AA);
  for (let k = 1; k < 4; k++) { const xx = x0 + (x1 - x0) * k / 4; g.thickLine(xx, y, xx, y + 1.6 * s, 0.8 * s, dark, AA); }
}

/**
 * Big hedge shears from the hands at (hx, hy) toward the angle `a` (radians,
 * 0 = right, screen y down), blades opened by `open` 0..1.
 */
function shears(g, hx, hy, a, open, s, tone) {
  const ca = cos(a), sa = sin(a);
  const px = hx + ca * 3.6 * s, py = hy + sa * 3.6 * s;           // pivot
  const wood = tone(WOOD), steel = tone(STEEL), dark = tone(STEEL_D);
  g.thickLine(hx - sa * 0.5 * s, hy + ca * 0.5 * s, px, py, 1.3 * s, wood, AA);   // handles
  const sp = 0.06 + 0.36 * open, L = 7.4 * s;
  for (const sg of [-1, 1]) {
    const b = a + sg * sp, tx = px + cos(b) * L, ty = py + sin(b) * L;
    g.thickLine(px, py, tx, ty, 1.15 * s, sg < 0 ? steel : dark, AA);
  }
  g.fillCircle(px, py, 0.7 * s, tone(KEY), AA);
}

/**
 * A gardener. o: { dir, walk (gait phase, radians, or null standing),
 * tipX, tipY (where the shears point, or undefined for shears held up),
 * snip 0..1, carry (ladder on the shoulder), rake (phase), lean, outfit, bob }
 */
export function gardener(g, x, foot, s, o, tone) {
  const F = OUTFIT[o.outfit ?? 0], dir = o.dir ?? 1;
  const T = (c) => tone(c);
  const bob = o.bob ?? 0;
  const walking = o.walk !== null && o.walk !== undefined;
  const sw = walking ? sin(o.walk) : 0, lift = walking ? Math.abs(cos(o.walk)) * 0.7 * s : 0;
  const hipY = foot - 9.4 * s - lift * 0.4 + bob, hipX = x;
  const lean = (o.lean ?? 0) * s;
  const shX = x + lean + 0.4 * dir * s, shY = foot - 16.8 * s - lift * 0.4 + bob;
  // legs
  const legs = T(F.legs), boot = T(BOOT);
  const fA = x + sw * 2.4 * s, fB = x - sw * 2.4 * s;
  for (const [fx, up] of [[fB, 0], [fA, lift]]) {
    g.thickLine(hipX + (fx - x) * 0.15, hipY, fx, foot - 1.4 * s - up, 2.5 * s, legs, AA);
    g.fillEllipse(fx + dir * 0.6 * s, foot - 0.9 * s - up, 1.9 * s, 1.05 * s, boot, AA);
  }
  // the back arm (behind the body), for rake and carry
  const coat = T(F.coat), shirt = T(F.shirt), skin = T(F.skin);
  // body: shirt, then the waistcoat over it, a bit of a belly
  g.fillEllipse((hipX + shX) / 2 + 0.3 * dir * s, (hipY + shY) / 2 + 0.3 * s, 3.3 * s, 4.7 * s, shirt, AA);
  g.fillPolygon([[hipX - 3.1 * s, hipY + 0.6 * s], [hipX + 3.1 * s, hipY + 0.6 * s], [shX + 2.7 * s, shY + 0.6 * s], [shX - 2.7 * s, shY + 0.6 * s]], coat, AA);
  g.thickLine(shX + dir * 0.9 * s, shY + 0.8 * s, hipX + dir * 1.4 * s, hipY - 0.6 * s, 0.9 * s, shirt, AA);  // shirt front
  // head
  const hx = shX + dir * 0.5 * s + lean * 0.3, hy = shY - 3.3 * s;
  g.fillCircle(hx, hy, 2.9 * s, skin, AA);
  g.fillCircle(hx + dir * 2.6 * s, hy + 0.4 * s, 0.9 * s, T(0xe89a7a), AA);   // nose
  g.fillCircle(hx + dir * 1.1 * s, hy - 0.5 * s, 0.55 * s, T(KEY), AA);        // eye
  g.thickLine(hx + dir * 0.9 * s, hy + 1.4 * s, hx + dir * 2.6 * s, hy + 1.6 * s, 1.0 * s, T(F.hair), AA);  // moustache / mouth
  // hat
  if (F.cap) {
    g.fillEllipse(hx - dir * 0.2 * s, hy - 2.1 * s, 3.1 * s, 1.9 * s, T(F.hat), AA);
    g.thickLine(hx, hy - 1.2 * s, hx + dir * 4.2 * s, hy - 0.9 * s, 1.0 * s, T(F.hat), AA);   // peak
  } else {
    g.fillEllipse(hx, hy - 2.1 * s, 5.4 * s, 1.15 * s, T(F.hat), AA);                    // brim
    g.fillRoundRect(hx - 2.8 * s, hy - 4.9 * s, 5.6 * s, 2.9 * s, 1.0 * s, T(F.hat), AA);   // crown
    g.fillRect(Math.round(hx - 2.8 * s), Math.round(hy - 2.9 * s), Math.round(5.6 * s), Math.max(1, Math.round(0.9 * s)), T(F.band));
  }
  // arms and tools
  const arm = (ax, ay) => {
    g.thickLine(shX, shY + 0.6 * s, ax, ay, 1.9 * s, shirt, AA);
    g.fillCircle(ax, ay, 1.05 * s, skin, AA);
  };
  if (o.carry) {
    carriedLadder(g, shX - dir * 0.5 * s, shY - 0.6 * s, s, dir, tone);
    arm(shX + dir * 1.5 * s, shY - 1.6 * s);
  } else if (o.rake !== undefined) {
    const r = o.rake, hx2 = shX + dir * (2.4 + 1.6 * sin(r)) * s, hy2 = shY + 3.4 * s;
    const ex = hx2 + dir * (8 + 3 * sin(r)) * s, ey = foot - 0.2 * s;
    g.thickLine(hx2 - dir * 2 * s, hy2 - 2.4 * s, ex, ey, 0.9 * s, T(WOOD), AA);
    g.thickLine(ex - 2.2 * s, ey, ex + 2.2 * s, ey, 1.1 * s, T(STEEL_D), AA);
    arm(hx2, hy2);
  } else {
    let a, hxx, hyy;
    if (o.tipX !== undefined) {
      a = Math.atan2(o.tipY - shY, o.tipX - shX);
      const reach = Math.min(5.2 * s, Math.max(2.5 * s, Math.hypot(o.tipX - shX, o.tipY - shY) - 11 * s));
      hxx = shX + cos(a) * reach; hyy = shY + sin(a) * reach;
    } else {
      a = dir > 0 ? -1.15 : -Math.PI + 1.15;   // shears held up, resting
      hxx = shX + dir * 2.2 * s; hyy = shY - 0.6 * s;
    }
    shears(g, hxx, hyy, a, o.snip ?? 0, s, tone);
    arm(hxx, hyy);
  }
}
