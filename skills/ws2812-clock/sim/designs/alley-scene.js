// Alley scene: the static street (albedo + where each light spills) and the
// frog under a clear umbrella. Raster 128 x 128, top-right panel missing.
import * as kit from '../js/kit.js';

export const W = 128, H = 128, GROUND = 104;
export const BLADE = { x0: 9, x1: 54, y0: 2, y1: 97 };    // vertical blade sign (hours)
export const MBOX = { x0: 65, x1: 126, y0: 64, y1: 99 };  // box sign hung from above (minutes)
export const PINK = kit.hex('#ff2468'), CYAN = kit.hex('#1fe2ff'), AMBER = kit.hex('#ff9a3a');
export const WARM = kit.hex('#ffb070'), ORANGE = kit.hex('#ff6a10'), RED = kit.hex('#ff3040');
export const AMB = [0.045, 0.055, 0.11], FLASH = [0.75, 0.85, 1];

const rectDist = (x, y, r) => Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.y0 - y, 0, y - r.y1));
const inRect = (x, y, r) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;

// windows on the two strips of facade beside the blade: kind, amplitude
const KINDS = { L: ['warm', 'off', 'tv', 'warm', 'off', 'warm', 'off'], R: ['off', 'warm', 'ac', 'tube', 'off', 'warm', 'off'] };
export const WINDOWS = [];
for (const side of ['L', 'R']) {
  KINDS[side].forEach((kind, k) => { if (kind !== 'ac') WINDOWS.push({ x: side === 'L' ? 2 : 57, y: 6 + 14 * k, w: 5, h: 8, kind, k }); });
}
export const AC = { x0: 55, x1: 62, y0: 36, y1: 41 };

/** Static maps: albedo A (rgb), light spill maps of blade, box, shopfronts, flash, and street wetness. */
export function buildScene(idx) {
  const N = W * H, A = new Float32Array(3 * N), mB = new Float32Array(N), mM = new Float32Array(N);
  const mD = new Float32Array(N), mF = new Float32Array(N), wet = new Float32Array(N);
  const put = (p, c, k = 1) => { A[3 * p] = c[0] * k; A[3 * p + 1] = c[1] * k; A[3 * p + 2] = c[2] * k; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = y * W + x;
    if (idx[p] < 0) continue;
    const grain = 0.75 + 0.5 * kit.fbm(x * 0.21, y * 0.13, 3, 3);
    if (y >= GROUND) {
      const kerb = y < GROUND + 2;
      put(p, kerb ? [0.3, 0.29, 0.31] : [0.07, 0.07, 0.08], kerb ? 1 : grain);
      const pud = kit.smoothstep(0.5, 0.6, kit.fbm(x / 15, y / 4.5, 7.7, 3));
      wet[p] = kerb ? 0.15 : 0.15 + 0.85 * pud;
    } else if (inRect(x, y, BLADE)) {
      const rim = x === BLADE.x0 || x === BLADE.x1 || y === BLADE.y0 || y === BLADE.y1;
      put(p, rim ? [0.5, 0.42, 0.45] : [0.07, 0.05, 0.06]);
    } else if (inRect(x, y, MBOX)) {
      const rim = x === MBOX.x0 || x === MBOX.x1 || y === MBOX.y1;
      put(p, rim ? [0.4, 0.45, 0.5] : [0.04, 0.05, 0.07]);
    } else if ((y >= 98 && x < 64) || (y >= 100 && x >= 64)) {
      put(p, [0.3, 0.24, 0.2], grain);                          // shopfront fascia
    } else if (inRect(x, y, AC)) {
      put(p, (y === AC.y0 || x === AC.x0) ? [0.6, 0.6, 0.62] : (x + y) % 2 ? [0.3, 0.3, 0.32] : [0.15, 0.15, 0.17]);
    } else {
      const ledge = y % 14 === 3;
      put(p, ledge ? [0.32, 0.29, 0.28] : [0.08, 0.075, 0.075], ledge ? 1 : 0.85 + 0.3 * (grain - 0.75) / 0.5);
    }
    const ground = y >= GROUND ? 0.8 : 1;
    const db = rectDist(x, y, BLADE), dm = rectDist(x, y, MBOX);
    mB[p] = ground / (1 + (db / 9) ** 2) * (db === 0 ? 0.5 : 1);
    mM[p] = ground / (1 + (dm / 9) ** 2) * (dm === 0 ? 0.5 : 1);
    // shop light spills out onto the pavement in front of the windows
    if (y >= GROUND) mD[p] = (x < 64 ? 0.9 : 0.7) / (1 + ((y - GROUND + 1) / 7) ** 2);
    mF[p] = (0.55 + 0.45 * x / W) * (y >= GROUND ? 0.7 : 1);
  }
  for (const w of WINDOWS) for (let y = w.y; y < w.y + w.h; y++) for (let x = w.x; x < w.x + w.w; x++) {
    const frame = y === w.y || x === w.x || x === w.x + w.w - 1 || y === w.y + w.h - 1;
    put(y * W + x, frame ? [0.45, 0.42, 0.4] : [0.05, 0.06, 0.08]);
  }
  return { A, mB, mM, mD, mF, wet };
}

// ----------------------------------------------------------------- frog
const BANDS = ['#ff2a2a', '#ff8a14', '#ffe024', '#36d046', '#2a78ff', '#9446ff'].map(kit.hex);
const RIMG = kit.hex('#2fae3a');
function sdEllipse(dx, dy, rx, ry) {
  const q = Math.sqrt((dx / rx) ** 2 + (dy / ry) ** 2) || 1e-6;
  const g = Math.sqrt((dx / (rx * rx)) ** 2 + (dy / (ry * ry)) ** 2) / q || 1 / Math.min(rx, ry);
  return (q - 1) / g;
}
const cov = (d) => (d < -0.5 ? 1 : d > 0.5 ? 0 : 0.5 - d);
function over(img, p, c, a) {
  if (a <= 0) return;
  img[3 * p] += (c[0] - img[3 * p]) * a; img[3 * p + 1] += (c[1] - img[3 * p + 1]) * a; img[3 * p + 2] += (c[2] - img[3 * p + 2]) * a;
}

/**
 * The rainbow frog in round glasses, under a clear vinyl umbrella. (cx, fy):
 * centre and feet line, fractional. gait: step phase (radians), look: [x, y]
 * pupil direction, k: brightness, tint: the light where it stands.
 */
export function drawFrog(img, idx, cx, fy, gait, look, k, tint) {
  const lift1 = Math.max(0, Math.sin(gait)) * 1.4, lift2 = Math.max(0, -Math.sin(gait)) * 1.4;
  const by = fy - 7.5 - 0.5 * Math.abs(Math.cos(gait)), ux = cx + 4, uy = fy - 21;
  const lit = (c, a = 1) => [(c[0] * (0.75 + tint[0])) * k * a, (c[1] * (0.75 + tint[1])) * k * a, (c[2] * (0.75 + tint[2])) * k * a];
  const band = BANDS.map((c) => lit(c)), rim = lit(RIMG), white = lit([1, 1, 1]), lens = [0.01, 0.015, 0.02], eye = lit([0.7, 0.7, 0.65]);
  const canopy = [0.006, 0.008, 0.02], edge = lit([0.75, 0.85, 1], 0.9), shaft = lit([0.5, 0.5, 0.55]);
  for (let y = Math.floor(fy - 31); y <= Math.ceil(fy + 0.5); y++) {
    if (y < 0 || y >= H) continue;
    for (let x = Math.floor(cx - 13); x <= Math.ceil(cx + 21); x++) {
      if (x < 0 || x >= W) continue;
      const p = y * W + x;
      if (idx[p] < 0) continue;
      // umbrella: dome with scalloped hem, ribs, shaft
      const ddx = x - ux, ddy = y - uy;
      if (ddy < 1.5 && Math.abs(ddx) < 16) {
        const hem = -1.3 * Math.abs(Math.sin((Math.PI * (ddx + 15)) / 7.5));
        const d = Math.max(sdEllipse(ddx, ddy, 15, 8.5), ddy - hem);
        if (d < 0.5) {
          over(img, p, canopy, 0.92 * cov(d));                   // dark dome against the lit shop windows
          const top = ddy < -1.5 ? 1 : 0.35;                     // wet rim light, strongest on top
          over(img, p, edge, top * 0.9 * Math.max(0, 1 - Math.abs(d + 0.45) / 0.8));
          for (const tx of [-7.5, 7.5]) {
            const sd = kit.segDist(x, y, ux, uy - 8.5, ux + tx, uy - 1.2);
            over(img, p, edge, 0.3 * Math.max(0, 1 - sd / 0.6) * cov(d + 0.8));
          }
        }
      }
      const sx = cx + 10.5;
      over(img, p, shaft, 0.8 * Math.max(0, 1 - kit.segDist(x, y, sx, uy + 1, sx, fy - 6) / 0.6));
      over(img, p, shaft, 0.8 * Math.max(0, 1 - Math.abs(Math.hypot(x - (sx - 1.3), y - (fy - 6)) - 1.3) / 0.6) * (y > fy - 6 ? 1 : 0));
      // feet, then body in rainbow bands with a green rim, arm, smile
      over(img, p, rim, cov(sdEllipse(x - (cx - 4.5), y - (fy - 1.2 - lift1), 3, 1.5)));
      over(img, p, rim, cov(sdEllipse(x - (cx + 4.5), y - (fy - 1.2 - lift2), 3, 1.5)));
      over(img, p, rim, Math.max(0, 1 - kit.segDist(x, y, cx + 7, by + 1, sx - 0.5, fy - 7) / 1.1));
      const db = sdEllipse(x - cx, y - by, 9, 6.6);
      if (db < 0.5) {
        const bi = Math.min(5, Math.max(0, Math.floor(((y - (by - 6.6)) / 13.2) * 6)));
        over(img, p, db > -1.2 ? rim : band[bi], cov(db));
        const my = by - 0.6 + 0.075 * (x - cx) ** 2;
        if (Math.abs(x - cx) < 5.5) over(img, p, [0, 0, 0], kit.clamp(1.4 - Math.abs(y - my) / 0.75));
      }
      // glasses: two big white rims on top of the head, lenses, pupils
      const gy = by - 7.6;
      for (const ex of [cx - 4.7, cx + 4.7]) {
        const r = Math.hypot(x - ex, y - gy);
        if (r < 5) {
          over(img, p, lens, cov(r - 3.6));
          over(img, p, eye, cov(Math.hypot(x - ex - look[0], y - gy - look[1]) - 1.25));
          over(img, p, white, Math.max(0, 1 - Math.abs(r - 3.9) / 0.8));
        }
      }
    }
  }
}
