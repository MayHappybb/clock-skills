// Dachshund coats and heads: ten dogs, ten coats, as flat print colours.
//
// A coat is a small texture in the dog's own body coordinates (v along the
// body from the nose, lane across it), baked at load into palette indices,
// so spots, saddles and brindle stripes travel with a dog that walks.
// Heads, ears and paws are drawn as small anti-aliased polygons on top of
// the body, posed per frame (they turn, sniff, flap).

import { rand, noise, sin, cos, mix } from '../js/kit.js';

export const KEY = 0x1c130d;     // the keyline, a warm near-black
export const NOSE = 0x140d0a;
export const LANES = 8, VMAX = 160;

// palette slots: 0 key, 1 base, 2 dark marking, 3 light/points, 4 collar, 5 sun rim, 6 ear, 7 muzzle
const C = (base, dark, light, collar, rim, ear, muzzle) => [KEY, base, dark, light, collar, rim, ear, muzzle];
export const DOGS = [
  { name: 'red',            pal: C(0xd2612c, 0xa8461f, 0xec8a4c, 0x2f6fe0, 0xf4a466, 0x9a3d18, 0xc5592a) },
  { name: 'black and tan',  pal: C(0x2b2320, 0x1a1412, 0xd48a3c, 0xe8443a, 0xeeb070, 0x1e1715, 0xd48a3c) },
  { name: 'cream',          pal: C(0xf0d49c, 0xd9ad6c, 0xfff0cc, 0xd8396e, 0xfff8e4, 0xcf9e5c, 0xe9c88c) },
  { name: 'chocolate',      pal: C(0x74401f, 0x4e2914, 0xdc9c54, 0xf4c62e, 0xf2b874, 0x55301a, 0xdc9c54) },
  { name: 'red dapple',     pal: C(0xc95a2a, 0x8e3a18, 0xf3d8b0, 0x2a9ed8, 0xee905a, 0x8e3a18, 0xc95a2a) },
  { name: 'wire-haired',    pal: C(0x8e7658, 0x52432f, 0xc3ab84, 0xe8483a, 0xb39a74, 0x5e4c36, 0xc3ab84) },
  { name: 'piebald',        pal: C(0xf5eee2, 0xb35a26, 0xffffff, 0x3a6fe8, 0xffffff, 0xb35a26, 0xf5eee2) },
  { name: 'brindle',        pal: C(0xbc6a30, 0x4c2c18, 0xe0995a, 0xf4c43a, 0xdc8c50, 0x5a3420, 0xbc6a30) },
  { name: 'long-haired',    pal: C(0xc85c22, 0x99401a, 0xf0a060, 0x2f80ee, 0xf4b070, 0xa4461a, 0xc85c22) },
  { name: 'blue and tan',   pal: C(0x5d6a82, 0x434c60, 0xd8a058, 0xf05a6a, 0xf0bc78, 0x4a5468, 0xd8a058) },
];

/** Coat texture: palette slot per (v, lane), v from the nose. */
function texture(d) {
  const T = new Uint8Array(VMAX * LANES);
  for (let v = 0; v < VMAX; v++) for (let l = 0; l < LANES; l++) {
    let k = 1;
    const rim = l <= 1 || l >= LANES - 2, edge = rim;
    switch (d) {
      case 1: case 3: case 9: // saddle dogs: dark back, tan sides
        k = edge && v > 13 ? 3 : 1;
        break;
      case 4: { // dapple: pale blotches
        const n = rand(v >> 2, l >> 1, 41) + 0.6 * rand((v + 2) >> 2, (l + 1) >> 1, 42);
        k = n > 1.15 && v > 13 ? 3 : 1;
        break;
      }
      case 5: { // wire: salt and pepper grizzle, lighter belly fringe
        const n = rand(v, l, 51);
        k = n < 0.28 ? 2 : n > 0.8 ? 3 : 1;
        break;
      }
      case 6: { // piebald: big brown patches
        const n = noise(v / 9, 61) + 0.25 * (l / LANES - 0.5);
        k = n > 0.55 && v > 12 ? 2 : 1;
        break;
      }
      case 7: // brindle: slanted dark stripes
        k = ((v + l * 0.7) % 5) < 1.4 && v > 12 ? 2 : 1;
        break;
      case 8: // long hair: a light feathered fringe
        k = edge && ((v + (l > 3 ? 2 : 0)) % 4) < 3 ? 3 : 1;
        break;
      case 0: case 2: default:
        k = 1;
    }
    if (v >= 10 && v < 12) k = 4;               // the collar
    T[v * LANES + l] = rim ? k | 0x80 : k;      // 0x80: an edge lane, may take the sun rim
  }
  return T;
}
export const COATS = DOGS.map((_, d) => texture(d));

// ---------------------------------------------------------------- heads

function ellipsePts(cx, cy, ra, rb, fx, fy, rot, n = 12) {
  // an ellipse in head space (a forward, b left), rotated by rot, mapped to the screen
  const cr = cos(rot), sr = sin(rot), out = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const a0 = ra * cos(t), b0 = rb * sin(t);
    const a = cx + a0 * cr - b0 * sr, b = cy + a0 * sr + b0 * cr;
    out.push([a, b]);
  }
  return out;
}
function toScreen(pts, x, y, fx, fy) {
  // forward (fx, fy), left = (fy, -fx)
  return pts.map(([a, b]) => [x + a * fx + b * fy, y + a * fy - b * fx]);
}
const SNOUT = [[1.0, 2.9], [3.8, 2.2], [6.0, 1.6], [7.1, 0.9], [7.4, 0], [7.1, -0.9], [6.0, -1.6], [3.8, -2.2], [1.0, -2.9]];
const SNOUT_K = [[0.6, 3.8], [3.8, 3.1], [6.3, 2.5], [7.8, 1.7], [8.3, 0], [7.8, -1.7], [6.3, -2.5], [3.8, -3.1], [0.6, -3.8]];

/**
 * A dog's head from above. (x, y) skull centre, (fx, fy) unit facing,
 * pose: { ear: flap angle (rad, + = out), earL, earR overrides, sniff: 0..1
 * nose dip, blink: bool, sleep: bool, tongue: bool, a: alpha }
 */
export function head(g, d, x, y, fx0, fy0, pose, pal) {
  const k = pose.k ?? 1;
  if (k < 0.15) return;
  const fx = fx0 * k, fy = fy0 * k;
  const o = { aa: true, a: pose.a ?? 1 };
  const eL = pose.earL ?? pose.ear ?? 0, eR = pose.earR ?? pose.ear ?? 0;
  const sn = pose.sniff ?? 0;
  const long = d === 8 ? 1 : 0;
  // ears: flaps hanging back along the sides of the skull
  for (const [side, flap] of [[1, eL], [-1, eR]]) {
    const rot = -side * (0.32 + flap);
    const ea = -1.6 - long * 0.5, eb = side * (3.9 + 0.7 * flap);
    g.fillPolygon(toScreen(ellipsePts(ea, eb, 4.3 + long, 2.8, fx, fy, rot), x, y, fx, fy), KEY, o);
    g.fillPolygon(toScreen(ellipsePts(ea, eb, 3.4 + long, 1.85, fx, fy, rot), x, y, fx, fy), pal[6], o);
  }
  // skull and snout: keyline, then fill
  const sx = sn * 0.8;
  g.fillPolygon(toScreen(ellipsePts(-0.4, 0, 4.7, 4.5, fx, fy, 0), x, y, fx, fy), KEY, o);
  g.fillPolygon(toScreen(SNOUT_K.map(([a, b]) => [a + sx, b]), x, y, fx, fy), KEY, o);
  g.fillPolygon(toScreen(ellipsePts(-0.4, 0, 3.7, 3.5, fx, fy, 0), x, y, fx, fy), pal[1], o);
  g.fillPolygon(toScreen(SNOUT.map(([a, b]) => [a + sx, b]), x, y, fx, fy), pal[7], o);
  // a light stripe down the forehead for the dapple and piebald, brows for saddle dogs
  // nose
  const nx = x + (6.6 + sx) * fx, ny = y + (6.6 + sx) * fy;
  g.fillCircle(nx, ny, 1.45 * k, NOSE, o);
  // eyes (or closed lids)
  for (const side of [1, -1]) {
    const ex = x + 1.6 * fx + side * 2.1 * fy, ey = y + 1.6 * fy - side * 2.1 * fx;
    if (k < 0.6) continue;
    if (pose.blink || pose.sleep) g.fillRect(Math.floor(ex), Math.floor(ey), 1, 1, KEY);
    else { g.fillCircle(ex, ey, 0.95, KEY, o); }
  }
  if (pose.tongue) {
    const tx = x + 4.6 * fx - 2.6 * fy, ty = y + 4.6 * fy + 2.6 * fx;
    g.fillCircle(tx, ty, 1.2, 0xf07080, o);
  }
}

/** A paw: a keyline pad and its fill. */
export function paw(g, x, y, c) {
  g.fillCircle(x, y, 2.0, KEY, { aa: true });
  g.fillCircle(x, y, 1.15, c, { aa: true });
}

/** Darken an RGB565 value to about 5/8 (a flat cast shadow on the lawn). */
export const shade565 = (c) => ((c >> 1) & 0x7bef) + ((c >> 3) & 0x18e3);
export { mix };
