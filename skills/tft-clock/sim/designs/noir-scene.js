// Noir's set: the office wall, the window, the man at the window, and the
// tables that make the smoke (all built once at load: flash tables on the
// device).
import { Gfx, hash } from '../js/kit.js';

export const W = 160, H = 80, N = W * H;

// ------------------------------------------------------------ the set
// TYPE per pixel: 0 wall, 1 window glass, 2 window frame, 3 the man, 4 cigarette, 5 the desk and what is on it
export const WALL = 0, GLASS = 1, FRAME = 2, MAN = 3, CIG = 4, PROP = 5, RIM = 6;
export const WIN_X = 122;                       // the glass starts here; the frame is the two columns before it
export const EMBER_X = 128, EMBER_Y = 52;       // the cigarette's tip (pixel)
export const MOUTH_X = 135.5, MOUTH_Y = 52.5;

export const TYPE = new Uint8Array(N);
export const PH = new Uint8Array(N);    // the blinds' stripe phase on the wall, 0..255 per stripe
export const VG = new Uint8Array(N);    // how much of the window's light reaches this bit of wall
export const OUT = new Uint8Array(N);   // the night street seen through the glass: its glow
export const NEON = new Uint8Array(N);  // the neon sign's glow through the glass

{
  // the man, a silhouette against the blinds: fedora, profile to the left, trench-coat collar
  const m = new Gfx(W, H);
  const ink = 0xffffff;
  m.fillPolygon([[136.5, 41], [137.8, 32.5], [140.5, 29.6], [144.5, 31.2], [148.5, 29.6], [151.8, 32], [153.5, 41]], ink);
  m.fillPolygon([[128.6, 43.6], [130.5, 41.6], [135, 40], [155, 39.6], [160, 40.4], [160, 42.6], [154, 43.2], [138, 43.2], [132, 44.4]], ink);
  m.fillRect(137, 41, 16, 3, ink);           // hat band level, fills the gap under the crown
  m.fillPolygon([
    [137.6, 43], [137, 45.5], [135.6, 47.2], [134.2, 48.6], [135.6, 49.4], [136.4, 50.6], [135.9, 51.4], [136.6, 52.4], [136.2, 53.4],
    [137.4, 55.2], [139.5, 56.4], [143, 57.2], [145.5, 60], [146, 62], [154, 60], [154.5, 52], [153.6, 43]], ink);
  m.fillPolygon([[146, 58.5], [141, 61.5], [135, 65.5], [128, 69.5], [122.5, 74], [120.2, 80], [160, 80], [160, 56.5], [154.5, 55.5]], ink);
  // the desk in the corner: a telephone, a bottle of rye and a glass, in silhouette
  const d = new Gfx(W, H);
  d.fillRect(0, 74, 66, 6, ink);
  d.fillPolygon([[64, 74], [67, 74.6], [67.5, 80], [64, 80]], ink);
  d.fillPolygon([[5, 74.5], [8.5, 67.5], [22.5, 67.5], [26, 74.5]], ink);           // the phone's body
  d.fillEllipse(8, 65.6, 3.2, 2.2, ink); d.fillEllipse(23, 65.6, 3.2, 2.2, ink);    // the handset's ends
  d.fillRect(8, 63, 15, 2, ink);                                                    // and its grip
  d.fillRect(14, 65, 3, 3, ink);                                                    // the cradle
  d.fillRoundRect(42, 61, 8, 14, 2, ink);                                           // the bottle
  d.fillPolygon([[43, 62], [44.6, 57.5], [45, 52.5], [47, 52.5], [47.4, 57.5], [49, 62]], ink);
  d.fillRect(44.5, 51, 3, 2, ink);
  d.fillPolygon([[52.5, 67.5], [58.5, 67.5], [58, 74.5], [53, 74.5]], ink);         // the glass
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      let t = x >= WIN_X ? GLASS : x >= WIN_X - 2 ? FRAME : WALL;
      if (d.buf[i]) t = PROP;
      if (m.buf[i]) t = MAN;
      TYPE[i] = t;
    }
  // the props catch the window's light on their top and right edges; the bottle has a gleam
  for (let y = 1; y < H; y++)
    for (let x = 0; x < W - 1; x++) {
      const i = y * W + x;
      if (d.buf[i] && !m.buf[i] && y < 75 && (!d.buf[i - W] || !d.buf[i + 1])) TYPE[i] = RIM;
    }
  for (let y = 62; y < 72; y++) TYPE[y * W + 48] = RIM;
  // the cigarette: from the lips to the tip
  for (let x = EMBER_X + 1; x <= 134; x++) TYPE[EMBER_Y * W + x] = CIG;

  // stripes slant up to the right; the light falls off away from the window and in the corners
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const ph = ((y + 0.5) + 0.36 * (x + 0.5)) / 10;
      PH[i] = Math.floor((ph - Math.floor(ph)) * 256) & 255;
      const fx = 0.5 + 0.5 * (x / 120), cy = (y - 40) / 40, cx = (120 - x) / 120;
      const v = fx * (1 - 0.35 * cy * cy) * (1 - 0.25 * cx * cx * cx);
      VG[i] = TYPE[i] === WALL || TYPE[i] >= PROP ? Math.max(0, Math.min(255, Math.round(v * 255))) : 0;
      // outside: a lit street below, the neon sign high on the left of the pane, wet glass
      const sx = (x - WIN_X) / (W - WIN_X), sy = y / H;
      let o = 110 + 70 * sy + 25 * Math.sin(sx * 5 + sy * 3);
      OUT[i] = Math.max(0, Math.min(255, Math.round(o)));
      // the neon sign: a tall bar of light across the street, high up (its blink is added in the frame)
      const nd = Math.abs(x + 0.5 - 136.5);
      NEON[i] = x >= WIN_X && y < 32 ? Math.round(255 * Math.max(0, Math.min(1, (5.5 - nd) / 3)) * Math.min(1, (32 - y) / 6)) : 0;
    }
}

// ------------------------------------------------------------ smoke textures

// periodic value noise on a lattice wrapped at (px, py)
function pnoise(x, y, px, py, seed) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const r = (a, b) => hash(((a % px) + px) % px, ((b % py) + py) % py, seed) / 4294967296;
  const a = r(ix, iy), b = r(ix + 1, iy), c = r(ix, iy + 1), d = r(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

/** Filaments: 64 px along the ribbon by 16 half-px across, streaky along. */
export const TA = new Uint8Array(64 * 16);
/** Billows: 32 x 32 px in screen space, drifted upwards (smoke rises). */
export const TB = new Uint8Array(32 * 32);
/** Film grain, 64 x 64 cells of 2 x 2 px, signed. */
export const GRAIN = new Int8Array(64 * 64);
/** A rank per pixel (tile 32 x 32), for thinning the smoke evenly when it is blown away. */
export const RANK = new Uint8Array(32 * 32);
/** The puff's front along a ribbon: index = front - u (px), 0..127. */
export const PULSE = new Uint8Array(128);

for (let y = 0; y < 16; y++)
  for (let x = 0; x < 64; x++) {
    const v = 0.6 * pnoise(x / 16, y / 4, 4, 4, 11) + 0.4 * pnoise(x / 8, y / 2, 8, 8, 12);
    TA[y * 64 + x] = Math.round(Math.max(0, Math.min(1, (v - 0.5) * 1.8 + 0.5)) * 255);
  }
for (let y = 0; y < 32; y++)
  for (let x = 0; x < 32; x++) {
    const v = 0.65 * pnoise(x / 8, y / 8, 4, 4, 21) + 0.35 * pnoise(x / 4, y / 4, 8, 8, 22);
    TB[y * 32 + x] = Math.round(Math.max(0, Math.min(1, (v - 0.5) * 1.8 + 0.5)) * 255);
  }
for (let i = 0; i < 64 * 64; i++) {
  const a = hash(i, 1, 31) / 4294967296, b = hash(i, 2, 31) / 4294967296;
  GRAIN[i] = Math.round((a + b - 1) * 127);
}
{
  const order = Array.from({ length: 1024 }, (_, i) => i).sort((a, b) => hash(a, 0, 41) - hash(b, 0, 41));
  order.forEach((p, k) => { RANK[p] = Math.floor((k * 256) / 1024); });
}
for (let k = 0; k < 128; k++) {
  const rise = Math.min(1, k / 4), fall = Math.max(0, 1 - k / 46);
  PULSE[k] = Math.round(255 * rise * fall * fall);
}
PULSE[127] = 0;

// ------------------------------------------------------------ the cigarette's own thread of smoke
// a path from the tip, up past the brim, then lazily left above the minutes
export const THREAD = [];
{
  const P0 = [EMBER_X - 0.5, EMBER_Y - 0.5], P1 = [121, 6], P2 = [74, 14];
  let px = P0[0], py = P0[1], s = 0;
  for (let i = 0; i <= 400; i++) {
    const t = i / 400, u = 1 - t;
    const x = u * u * P0[0] + 2 * u * t * P1[0] + t * t * P2[0], y = u * u * P0[1] + 2 * u * t * P1[1] + t * t * P2[1];
    s += Math.hypot(x - px, y - py); px = x; py = y;
    if (s >= THREAD.length) {
      const tx = 2 * u * (P1[0] - P0[0]) + 2 * t * (P2[0] - P1[0]), ty = 2 * u * (P1[1] - P0[1]) + 2 * t * (P2[1] - P1[1]);
      const l = Math.hypot(tx, ty) || 1;
      THREAD.push({ x, y, nx: -ty / l, ny: tx / l });
    }
  }
}
