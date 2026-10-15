// The picture printed across the puzzle: a 1930s travel poster of a
// lighthouse on a headland, 192 x 192 px. It is a living picture: the sky
// follows the time of day (dawn, day, dusk, night), clouds drift, gulls
// wheel, a sloop crosses the horizon, waves roll, the sun or moon lays a
// glitter path and at night the lantern sweeps its beam over the sky.
//
// render(P, now, date) paints it into P (Float32Array 3 * 192 * 192, linear)
// in picture coordinates; the tiles then carry their own 64 x 64 piece.
import * as kit from '../js/kit.js';

export const N = 192;
const HOR = 97;                     // horizon row
const LANT = [31, 76];              // lantern centre
const SUNX = 158;

// ------------------------------------------------------------ palette
const K = (h, o) => ({ h, ...Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'string' ? kit.hex(v) : v])) });
const NIGHT = { top: '#101e52', hor: '#30489a', seaT: '#20387c', seaB: '#0c1844', wave: '#5f80d8', disc: '#fff0c4', glow: '#7d8fd0', cloud: '#34488a', rock: 0.38, beam: 1, stars: 1, lamp: 1, sunY: 30 };
const DAWN = { top: '#28397a', hor: '#f09178', seaT: '#7a5d8c', seaB: '#1c2452', wave: '#f5b49c', disc: '#ffd890', glow: '#ff9a70', cloud: '#e8a0a0', rock: 0.6, beam: 0.25, stars: 0.15, lamp: 0.6, sunY: 78 };
const DAY = { top: '#1d58b0', hor: '#7fc0e8', seaT: '#1a7898', seaB: '#0a3762', wave: '#a4e2f2', disc: '#fff6c8', glow: '#ffe8a0', cloud: '#e9f2fa', rock: 1, beam: 0, stars: 0, lamp: 0, sunY: 26 };
const DUSK = { top: '#36205a', hor: '#ff7436', seaT: '#7c3a4c', seaB: '#18123a', wave: '#ffb070', disc: '#ffcf6a', glow: '#ff7a3a', cloud: '#c05a70', rock: 0.5, beam: 0.45, stars: 0.12, lamp: 0.85, sunY: 74 };
const KEYS = [K(0, NIGHT), K(5.2, NIGHT), K(6.6, DAWN), K(8.3, DAY), K(16.6, DAY), K(18.6, DUSK), K(20.4, NIGHT), K(24, NIGHT)];

export function palette(hour) {
  let i = 0;
  while (KEYS[i + 1].h <= hour) i++;
  const a = KEYS[i], b = KEYS[i + 1], t = kit.smoothstep(0, 1, (hour - a.h) / (b.h - a.h));
  const o = {};
  for (const k in a) o[k] = Array.isArray(a[k]) ? kit.mix(a[k], b[k], t) : kit.lerp(a[k], b[k], t);
  return o;
}

// ---------------------------------------------------- static layers
// foreground (headland + lighthouse): alpha, albedo, and the lamp-room glass
const fgA = new Float32Array(N * N), fgC = new Float32Array(3 * N * N), lampM = new Float32Array(N * N);
// the sky row param and the sea perspective row param
const cloudW = 384, cloudH = HOR, cloud = new Float32Array(cloudW * cloudH);
const stars = [];

function rockTop(x) { return 101 + Math.max(0, x - 40) * 0.55 + 2.2 * Math.sin(x * 0.31) + 1.2 * Math.sin(x * 0.83 + 1); }
function rockRight(y) { return 72 - (y - 104) * 0.42 + 2.5 * Math.sin(y * 0.4); }
function towerHalf(y) { return 4.4 + (y - 82) * 0.1; }   // tapering tower
function fgSample(x, y) {
  // returns [alpha, r, g, b, lamp]
  // lighthouse
  const tx = Math.abs(x - LANT[0]);
  if (y >= 82 && y <= 108 && tx <= towerHalf(y)) {
    const band = Math.floor((y - 82) / 6.5) % 2 === 0;
    const shade = 0.55 + 0.45 * kit.smoothstep(-4, 3, -(x - LANT[0]));   // lit from the left
    const c = band ? [0.95, 0.9, 0.82] : [0.75, 0.08, 0.06];
    return [1, c[0] * shade, c[1] * shade, c[2] * shade, 0];
  }
  if (y >= 80 && y < 82 && tx <= 7.5) return [1, 0.12, 0.12, 0.14, 0];            // gallery
  if (y >= 72 && y < 80 && tx <= 3.6) return [1, 0, 0, 0, 1];                      // lamp room glass
  if (y >= 72 && y < 80 && tx <= 5) return [1, 0.1, 0.1, 0.12, 0];
  if (y >= 66 && y < 72 && tx <= (y - 66) * 0.95 + 0.6) return [1, 0.5, 0.06, 0.05, 0]; // roof
  // keeper's cottage
  if (x >= 40 && x <= 54 && y >= 96 && y <= 106) {
    const win = x >= 45 && x <= 48 && y >= 100 && y <= 103;
    return win ? [1, 0, 0, 0, 0.6] : [1, 0.85, 0.82, 0.74, 0];
  }
  if (x >= 38 && x <= 56 && y >= 90 && y < 96 && Math.abs(x - 47) <= (y - 89) * 1.6) return [1, 0.2, 0.25, 0.4, 0];
  // headland
  if (y >= rockTop(x) && x <= rockRight(y) && y <= 168) {
    const n = kit.fbm(x * 0.11, y * 0.11, 3, 3);
    const grass = y < rockTop(x) + 3.5 && y < 115;
    const shade = 0.55 + 0.45 * kit.smoothstep(0.35, 0.7, n) - (y - 100) * 0.004;
    const c = grass ? [0.16, 0.42, 0.14] : [0.32, 0.22, 0.2];
    return [1, c[0] * shade, c[1] * shade, c[2] * shade, 0];
  }
  return null;
}

(function buildStatic() {
  const SS = 3;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let a = 0, r = 0, g = 0, b = 0, l = 0;
    for (let j = 0; j < SS; j++) for (let i = 0; i < SS; i++) {
      const s = fgSample(x + (i + 0.5) / SS, y + (j + 0.5) / SS);
      if (s) { a += s[0]; r += s[1]; g += s[2]; b += s[3]; l += s[4]; }
    }
    const p = y * N + x, n = SS * SS;
    fgA[p] = a / n;
    if (a > 0) { fgC[3 * p] = r / a; fgC[3 * p + 1] = g / a; fgC[3 * p + 2] = b / a; }
    lampM[p] = l / n;
  }
  // Deco streak clouds: stacked rounded bars, wrapping 384 px wide
  const bars = [];
  for (let k = 0; k < 7; k++) {
    const cx = k * 55 + 20 * kit.hash(k, 1), cy = 14 + 52 * kit.hash(k, 2);
    const len = 30 + 26 * kit.hash(k, 3);
    for (let j = 0; j < 3; j++) bars.push([cx + (kit.hash(k, j, 4) - 0.5) * 18 + j * 5, cy + j * 5, len * (1 - j * 0.22), 2.3]);
  }
  for (let y = 0; y < cloudH; y++) for (let x = 0; x < cloudW; x++) {
    let v = 0;
    for (const [cx, cy, len, r] of bars) {
      let dx = Math.abs(((x - cx) % cloudW + cloudW * 1.5) % cloudW - cloudW / 2);
      dx = Math.max(0, dx - len / 2);
      const d = Math.hypot(dx, y - cy);
      v = Math.max(v, kit.clamp(r + 0.5 - d));
    }
    cloud[y * cloudW + x] = v;
  }
  for (let k = 0; k < 70; k++) {
    const x = kit.hash(k, 11) * N, y = kit.hash(k, 12) ** 1.4 * (HOR - 12);
    stars.push([Math.floor(x), Math.floor(y), 0.3 + 0.7 * kit.hash(k, 13) ** 2, kit.hash(k, 14) * 6.28]);
  }
})();

// ---------------------------------------------------------- render
/** Draw a small anti-aliased line into P (adds colour c * a). */
function line(P, ax, ay, bx, by, w, c, a) {
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - w - 1)), x1 = Math.min(N - 1, Math.ceil(Math.max(ax, bx) + w + 1));
  const y0 = Math.max(0, Math.floor(Math.min(ay, by) - w - 1)), y1 = Math.min(N - 1, Math.ceil(Math.max(ay, by) + w + 1));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const d = kit.segDist(x + 0.5, y + 0.5, ax, ay, bx, by), k = kit.clamp(w / 2 + 0.5 - d) * a;
    if (k <= 0) continue;
    const p = 3 * (y * N + x);
    P[p] += (c[0] - P[p]) * k; P[p + 1] += (c[1] - P[p + 1]) * k; P[p + 2] += (c[2] - P[p + 2]) * k;
  }
}

const rowSea = new Float32Array(N), rowSky = new Float32Array(N);
for (let y = 0; y < N; y++) { rowSky[y] = (y / HOR) ** 1.5; rowSea[y] = y < HOR ? 0 : Math.sqrt((y - HOR) / (N - HOR)); }

export function render(P, now, date, pal, gain) {
  const hourF = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
  const sx = SUNX, sy = pal.sunY, isMoon = pal.stars > 0.5;
  const cOff = (now * 0.3) % cloudW;
  const ci = Math.floor(cOff), cf = cOff - ci;
  // lighthouse beam: a slow 3D sweep (period 9 s) seen side-on
  const th = now * kit.TAU / 9, bc = Math.cos(th), bs = Math.sin(th);
  const beamLen = 230 * Math.abs(bc) + 8, beamDir = bc >= 0 ? 1 : -1, beamA = pal.beam * (0.35 + 0.65 * Math.abs(bc));
  const flash = pal.beam * Math.max(0, bs) ** 24;
  for (let y = 0; y < N; y++) {
    const sky = y < HOR;
    const rt = rowSky[y], rs = rowSea[y];
    for (let x = 0; x < N; x++) {
      const p = y * N + x, q = 3 * p;
      let r, g, b;
      if (sky) {
        r = pal.top[0] + (pal.hor[0] - pal.top[0]) * rt; g = pal.top[1] + (pal.hor[1] - pal.top[1]) * rt; b = pal.top[2] + (pal.hor[2] - pal.top[2]) * rt;
        // sun / moon disc and glow
        const dx = x + 0.5 - sx, dy = y + 0.5 - sy, d = Math.sqrt(dx * dx + dy * dy);
        const glow = Math.exp(-d / 26) * 0.45;
        r += pal.glow[0] * glow; g += pal.glow[1] * glow; b += pal.glow[2] * glow;
        let disc = kit.clamp(13.5 - d);
        if (isMoon) { const ex = dx + 6, ey = dy - 3; disc *= kit.clamp(Math.sqrt(ex * ex + ey * ey) - 11.5); } // crescent
        if (disc > 0) { r += (pal.disc[0] - r) * disc; g += (pal.disc[1] - g) * disc; b += (pal.disc[2] - b) * disc; }
        // clouds
        const cx = x + ci, c0 = cloud[y * cloudW + (cx % cloudW)], c1 = cloud[y * cloudW + ((cx + 1) % cloudW)];
        const cv = c0 + (c1 - c0) * cf;
        if (cv > 0) { r += (pal.cloud[0] - r) * cv * 0.85; g += (pal.cloud[1] - g) * cv * 0.85; b += (pal.cloud[2] - b) * cv * 0.85; }
        // beam
        if (beamA > 0.01) {
          const bx = (x + 0.5 - LANT[0]) * beamDir, by = y + 0.5 - LANT[1] + bx * 0.05;
          if (bx > 0 && bx < beamLen) {
            const w = 1.5 + bx * 0.13, k = kit.clamp(1 - Math.abs(by) / w) ** 1.5 * (1 - bx / beamLen) * beamA * 0.8;
            r += 0.9 * k; g += 0.85 * k; b += 0.6 * k;
          }
        }
      } else {
        r = pal.seaT[0] + (pal.seaB[0] - pal.seaT[0]) * rs; g = pal.seaT[1] + (pal.seaB[1] - pal.seaT[1]) * rs; b = pal.seaT[2] + (pal.seaB[2] - pal.seaT[2]) * rs;
        // Deco wave lines: rows spread out toward the viewer, each wobbling
        const u = rs * 11, row = Math.floor(u), fu = u - row;
        const wob = Math.sin(x * (0.09 - rs * 0.04) + now * 0.9 + row * 1.7) * 0.5 + 0.5;
        const crest = kit.clamp(1 - Math.abs(fu - 0.25 - 0.4 * wob) * (6 - rs * 3)) * (0.35 + 0.4 * rs);
        r += (pal.wave[0] - r) * crest; g += (pal.wave[1] - g) * crest; b += (pal.wave[2] - b) * crest;
        // glitter path under the sun / moon
        const gx = Math.abs(x + 0.5 - sx) / (6 + rs * 26);
        if (gx < 1) {
          const tw = kit.hash(x, y, Math.floor(now * 7 + kit.hash(x, y) * 7));
          const k = (1 - gx) * (tw > 0.82 ? 1 : 0) * 0.55 * (1 - rs) * (1 - rs);
          r += pal.disc[0] * k; g += pal.disc[1] * k; b += pal.disc[2] * k;
        }
      }
      const a = fgA[p];
      if (a > 0) {
        const lit = pal.rock;
        const fr = fgC[q] * lit, fg = fgC[q + 1] * lit, fb = fgC[q + 2] * lit;
        r += (fr - r) * a; g += (fg - g) * a; b += (fb - b) * a;
        const lm = lampM[p];
        if (lm > 0) { const e = (0.08 + 0.9 * pal.lamp + flash) * lm; r += e; g += e * 0.82; b += e * 0.45; }
      }
      P[q] = r * gain; P[q + 1] = g * gain; P[q + 2] = b * gain;
    }
  }
  // stars (sky only, never on the foreground)
  if (pal.stars > 0.02) {
    for (const [x, y, m, ph] of stars) {
      const p = y * N + x;
      if (fgA[p] > 0 || cloud[y * cloudW + ((x + ci) % cloudW)] > 0.2) continue;
      if (Math.hypot(x - sx, y - sy) < 16) continue;
      const k = pal.stars * m * (0.55 + 0.45 * Math.sin(now * 2.1 + ph)) * 0.5 * gain;
      P[3 * p] += k * 0.9; P[3 * p + 1] += k * 0.9; P[3 * p + 2] += k;
    }
  }
  // lantern halo
  const halo = (0.25 * pal.lamp + flash * 0.8) * gain;
  if (halo > 0.01) {
    for (let y = LANT[1] - 14; y <= LANT[1] + 14; y++) for (let x = LANT[0] - 14; x <= LANT[0] + 14; x++) {
      const d = Math.hypot(x + 0.5 - LANT[0], y + 0.5 - LANT[1]) / 14;
      if (d >= 1) continue;
      const k = halo * (1 - d) ** 2, q = 3 * (y * N + x);
      P[q] += k; P[q + 1] += k * 0.8; P[q + 2] += k * 0.45;
    }
  }
  // the sloop: crosses the horizon once every 15 minutes, bobbing
  const ink = kit.scale(pal.seaB, 0.6 * gain), sail = kit.scale(kit.mix(pal.disc, [1, 1, 1], 0.4), (0.25 + 0.6 * pal.rock) * gain);
  const bxp = ((now / 900) % 1) * 250 - 30, byp = HOR + 1 + 0.5 * Math.sin(now * 1.3), tilt = 0.6 * Math.sin(now * 1.3 + 1);
  if (bxp > -15 && bxp < N + 15) {
    line(P, bxp - 6, byp, bxp + 6, byp, 2.2, ink, 1);
    line(P, bxp - 0.5, byp - 1, bxp + tilt, byp - 13, 1, ink, 1);
    for (let k = 0; k < 7; k++) line(P, bxp + 0.5 + tilt * k / 7, byp - 2 - k * 1.5, bxp + 0.5 + (7 - k) * 0.95, byp - 2.2, 1.2, sail, 1);
  }
  // gulls: wheel over the sea, wings flapping
  const gull = kit.scale(kit.mix(pal.disc, [1, 1, 1], 0.5), 0.85 * gain), gullA = kit.smoothstep(0.45, 0.8, pal.rock);   // gulls roost at night
  for (let k = 0; k < 2 && gullA > 0; k++) {
    const gx = 118 + 34 * Math.sin(now * 0.11 + k * 2.4), gy = 50 + 14 * Math.sin(now * 0.17 + k * 1.1) + k * 8;
    const flap = Math.sin(now * 5.2 + k * 2), sp = 4.2, up = 2.2 * flap;
    line(P, gx - sp, gy - up, gx, gy + 0.8, 1.3, gull, gullA);
    line(P, gx, gy + 0.8, gx + sp, gy - up, 1.3, gull, gullA);
  }
  return hourF;
}
