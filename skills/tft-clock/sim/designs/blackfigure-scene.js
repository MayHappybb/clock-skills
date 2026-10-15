// Black-figure: the vase's own furniture, as code maps built once at load.
//   SCENE   the panel at rest: the shoulder meander, the groundline, the
//           subsidiary band's lines, Athena's owl between hours and minutes
//   HANDLE  what passes under the handle when the vase turns: a big
//           palmette with volutes and lotus buds (160 px of frieze)
//   HORSE   eight frames of a galloping horseman for the lower band
// Codes: 0 clay, 1..16 slip coverage, INC / RED / WHT (raster.js).

import { raster, INC, RED, WHT } from './blackfigure-raster.js';

export const W = 160, H = 80, N = W * H;
export const STREAK = 22;          // a burnishing line in the clay
export const GROUND = 58;          // the figures' groundline (2 px)
export const BAND_Y = 63, BAND_G = 77;   // the horsemen's band: top, groundline

const L = (p, w, m = 'k') => ({ t: 'L', p, w, m });
const P = (p, m = 'k', ax) => ({ t: 'P', p, m, ax });
const E = (c, r, m = 'k', ax) => ({ t: 'E', c, r, m, ax });
const I = (p) => L(p, 1, 'i');

/** Copy a raster's codes into a W-wide map at (x, y) (overlay wins, else the larger coverage). */
export function put(map, mw, mh, gl, x, y) {
  for (let j = 0; j < gl.h; j++) {
    const yy = y + j;
    if (yy < 0 || yy >= mh) continue;
    for (let i = 0; i < gl.w; i++) {
      const xx = x + i;
      if (xx < 0 || xx >= mw) continue;
      const k = j * gl.w + i, o = gl.o[k], v = gl.k[k], q = yy * mw + xx;
      if (o) map[q] = o;
      else if (v > map[q] || map[q] > 16) { if (v) map[q] = v; }
    }
  }
}

// ------------------------------------------------------------ bands

// the shoulder meander: a key hooked off the lower line, 8 px period
const KEY = [
  '########',
  '........',
  '.#####..',
  '.#...#..',
  '.#.#.#..',
  '.#.###..',
  '########',
];
export const KEY_Y = 0;
function bands(map, mw, off = 0) {
  for (let x = 0; x < mw; x++) {
    for (let r = 0; r < KEY.length; r++) if (KEY[r][(x + off) & 7] === '#') map[(KEY_Y + r) * mw + x] = 16;
    map[GROUND * mw + x] = 16; map[(GROUND + 1) * mw + x] = 16;
    map[BAND_G * mw + x] = 16; map[(BAND_G + 1) * mw + x] = 16;
    // a row of added-red dots on the lower band's line, every 4 px
    if (((x + off) & 3) === 1) map[(BAND_G + 1) * mw + x] = RED;
  }
}

// ------------------------------------------------------------ the owl

export const OWL_X = 72, OWL_Y = 34;    // its 16 x 23 box (feet on the groundline)
const owlParts = [
  // olive sprig over its shoulder
  L([[1, 4.6], [5.4, 1]], 0.9),
  E([2.2, 2.2], [1.6, 0.8], 'k', [1, 0]), E([4.8, 3.6], [1.6, 0.8], 'k', [1, 0]),
  // body, head, tufts
  P([[3.4, 9], [12.6, 9], [14.6, 14], [14, 19.6], [11, 22.6], [5, 22.6], [2, 19.6], [1.4, 14]], 'k', [0, 1]),
  E([8, 6.4], [6.6, 5.4]),
  P([[2.2, 3.4], [2.4, 0.8], [4.8, 1.6]]), P([[13.8, 3.4], [13.6, 0.8], [11.2, 1.6]]),
  P([[6, 22.4], [7.4, 22.4], [7.4, 23.2], [5.4, 23.2]]), P([[8.6, 22.4], [10, 22.4], [10.6, 23.2], [8.6, 23.2]]),
  // wing feathers, breast
  I([[2.6, 13.2], [4.4, 18.4], [6, 21]]), I([[13.4, 13.2], [11.6, 18.4], [10, 21]]),
  I([[7, 14], [7, 14]]), I([[9, 14], [9, 14]]), I([[8, 16.6], [8, 16.6]]), I([[6.2, 18.6], [6.2, 18.6]]), I([[9.8, 18.6], [9.8, 18.6]]),
  // eyes (white discs) and beak
  E([5.2, 6.4], [2.2, 2.2], 'w'), E([10.8, 6.4], [2.2, 2.2], 'w'),
  P([[7.4, 8.4], [8.6, 8.4], [8, 10.4]], 'r'),
  P([[5.2, 21.6], [10.8, 21.6], [10.8, 22.6], [5.2, 22.6]], 'r'),
];
export const OWL = raster(owlParts, 17, 25, 0.5, 1);
/** Eye centres in the owl's map, and its eye pixels (for the blink and the gaze). */
export const OWL_EYES = [[5.2 + 0.5, 6.4 + 1], [10.8 + 0.5, 6.4 + 1]];
export const OWL_EYE_PX = [];
for (let i = 0; i < OWL.w * OWL.h; i++) if (OWL.o[i] === WHT) OWL_EYE_PX.push(i);

// ------------------------------------------------------------ the panel at rest

// BANDS: the vase's ground (it scrolls when the vase turns); PINNED: the owl,
// which stays on the glass with the numerals
export const BANDS = new Uint8Array(N);
// the wheel left faint burnishing lines in the clay: a few broken rows, dithered
for (const y of [17, 31, 44]) for (let x = 0; x < W; x++) if (((x * 7 + y * 3) & 15) < 11 && ((x >> 3) + y) % 5 !== 0) BANDS[y * W + x] = STREAK;
bands(BANDS, W);
export const PINNED = new Uint8Array(N);
put(PINNED, W, H, OWL, OWL_X, OWL_Y);

// ------------------------------------------------------------ under the handle

const handleParts = [];
{
  // the central palmette: a heart, eleven petals fanned upward, alternate ones red
  const cx = 80, cy = 50;
  const n = 11;
  for (let i = 0; i < n; i++) {
    const a = -1.25 + (2.5 * i) / (n - 1);          // radians from vertical
    const len = 25 - Math.abs(i - (n - 1) / 2) * 1.6;
    const ex = cx + Math.sin(a) * len, ey = cy - Math.cos(a) * len;
    handleParts.push(L([[cx + Math.sin(a) * 5, cy - Math.cos(a) * 5], [ex, ey]], [1.6, 4.4]));
  }
  handleParts.push(E([cx, cy + 1], [6, 4.4]));
  // volutes: two spirals springing from the heart, out to lotus buds
  for (const s of [-1, 1]) {
    const pts = [];
    for (let k = 0; k <= 40; k++) {
      const u = k / 40, r = 15 - 11 * u, a = Math.PI * (0.15 + 2.1 * u);
      pts.push([cx + s * (16 + r * Math.cos(a)), cy + 3 + r * Math.sin(a) * 0.62]);
    }
    handleParts.push(L([[cx + s * 4, cy + 4], [cx + s * 10, cy + 7]], 2.2));
    handleParts.push(L(pts, [2.6, 1.6]));
    // a lotus bud on a long stem, and a small palmette at the far end
    const bx = cx + s * 46;
    handleParts.push(L([[cx + s * 30, cy + 4], [bx, cy + 2], [bx + s * 6, cy - 10]], 1.6));
    handleParts.push(P([[bx + s * 3, cy - 10], [bx + s * 6, cy - 26], [bx + s * 10, cy - 10]]));
    for (let i = 0; i < 7; i++) {
      const a = -1.2 + (2.4 * i) / 6, px = cx + s * 64;
      handleParts.push(L([[px, cy + 6], [px + Math.sin(a) * 14, cy + 6 - Math.cos(a) * 14]], [1.2, 3]));
    }
    handleParts.push(E([cx + s * 64, cy + 7], [4, 3]));
  }
  // red on alternate petals: painted over the slip
  for (let i = 1; i < n; i += 2) {
    const a = -1.25 + (2.5 * i) / (n - 1), len = 25 - Math.abs(i - (n - 1) / 2) * 1.6;
    handleParts.push(L([[cx + Math.sin(a) * 9, cy - Math.cos(a) * 9], [cx + Math.sin(a) * (len - 2), cy - Math.cos(a) * (len - 2)]], 1.6, 'r'));
  }
  handleParts.push(E([cx, cy + 1], [3, 2], 'r'));
}
const HANDLE_ART = raster(handleParts, W, H, 0, 0);
export const HANDLE = new Uint8Array(N);
for (const y of [17, 31, 44]) for (let x = 0; x < W; x++) if (((x * 7 + y * 3) & 15) < 11 && ((x >> 3) + y) % 5 !== 0) HANDLE[y * W + x] = STREAK;
bands(HANDLE, W, W & 7);
put(HANDLE, W, H, HANDLE_ART, 0, 0);

// ------------------------------------------------------------ the galloping horseman

/** Frame `i` of 8 of the flying gallop, facing left; box 26 x 17, hooves at row 15. */
function horseman(i) {
  const ph = (i / 8) * Math.PI * 2;
  const bob = Math.sin(ph * 2) * 0.45;
  const s = 0.6, ox = 0.6, oy = 4.4;
  const T = ([x, y]) => [ox + x * s, oy + (y + bob) * s];
  const parts = [];
  const leg = (hx, hy, a, b) => {
    // upper and lower leg: a, b are swing angles from vertical (+ is forward, to the left)
    const kx = hx - Math.sin(a) * 5, ky = hy + Math.cos(a) * 5;
    const fx = kx - Math.sin(b) * 5.2, fy = ky + Math.cos(b) * 5.2;
    parts.push(L([T([hx, hy]), T([kx, ky]), T([fx, fy])], [2.6 * s, 1.5 * s]));
  };
  // far legs first (they are behind), then the near ones
  const sw = Math.sin(ph), sw2 = Math.sin(ph + 0.9);
  leg(7.4, 9.4, 0.5 + 0.55 * sw2, 0.2 + 0.9 * Math.max(0, sw2));
  leg(20.6, 9.4, -0.3 - 0.55 * sw2, -0.9 + 0.5 * sw2);
  parts.push(E(T([14, 7.6]), [7.6 * s, 3.4 * s], 'k', [1, 0]));
  parts.push(L([T([8.6, 6.6]), T([5.2, 2]), T([4.2, 0.6])], [4.6 * s, 3 * s]));
  parts.push(P([T([5.4, -0.6]), T([1.8, 1.6]), T([0.2, 3.6]), T([1.4, 4.6]), T([4.6, 3.4]), T([6.4, 1.8])]));
  parts.push(L([T([21, 6]), T([24.6, 7.6]), T([26.4, 11.4])], [2.2 * s, 1.2 * s]));
  leg(8.2, 9.6, 0.4 + 0.6 * sw, 0.1 + 1.0 * Math.max(0, sw));
  leg(19.8, 9.6, -0.4 - 0.6 * sw, -0.8 + 0.6 * sw);
  // the rider: torso, head, a short spear
  parts.push(L([T([13.4, 5]), T([12.6, -2.4])], [3.2 * s, 2.6 * s]));
  parts.push(E(T([12.2, -4.4]), [2.1 * s, 2.3 * s]));
  parts.push(L([T([15.2, 6.4]), T([16.4, 9.4]), T([14.6, 11.4])], [2.2 * s, 1.6 * s]));
  parts.push(L([T([20, -1]), T([1.6, -6.4])], 0.8));
  // incised mane line and the rider's red cloak flying back
  parts.push(I([T([6, 3]), T([8.6, 6])]));
  parts.push(L([T([13.4, -1]), T([17.6, -0.6]), T([19.4, 1.6])], 1.4, 'r'));
  return raster(parts, 18, 17, 0, 0, { iw: 0.5 });
}
export const HORSE = Array.from({ length: 8 }, (_, i) => horseman(i));
export const HORSE_DY = BAND_G - 16;     // sprite top so the hooves land on the band's line
