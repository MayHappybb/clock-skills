// Pinscreen light: a lattice of steel pins, each with a height Z (1 = a
// digit's full relief), seen almost head-on from slightly below-left and lit
// by one low lamp that swings round the lower left.
//
// What the eye sees on a real pin-art toy, and what this draws:
// - every pin head: a tiny dome, a dim dot with a glint on its lamp side;
// - a raised pin's head is displaced (parallax), uncovering its SHAFT: a
//   short streak of polished steel, lit where no neighbour shades it;
// - the shadow a raised group throws across the pins behind it.
// Shadows are a per-pin "shadow height": points on the pin below it are in
// the shade of some pin nearer the lamp. Heads are painted lowest first, so
// raised pins cover the ones they lean over.
import * as kit from '../js/kit.js';

export function makeLight(N, PITCH, ORG) {
  const NP = N * N;
  const SHH = new Float32Array(NP), ORD = new Uint16Array(NP);
  for (let p = 0; p < NP; p++) ORD[p] = p;
  const px = (p) => ORG + (p % N) * PITCH, py = (p) => ORG + ((p / N) | 0) * PITCH;

  /**
   * Z: heights; img/zb: RGB float raster W x W and its depth; o: options
   *   ZPX  px of travel per unit Z, SV [x, y] px of head shift per unit Z,
   *   az, el lamp azimuth (screen angle, y down) and elevation,
   *   key, fill colours, tint(p) optional per-pin colour multiplier
   */
  function paint(Z, img, zb, W, o) {
    const { ZPX, SV, az, el, key, fill, ground = 0.11, headR = 0.62, beamLo = 0.08, beamZ0 = 0.08, beamZ1 = 0.55, sheenExp = 5 } = o;
    const ce = Math.cos(el), Lx = Math.cos(az) * ce, Ly = Math.sin(az) * ce, Lz = Math.sin(el);
    const tanEl = Math.tan(el);
    // the eye looks at the shafts from the side opposite the head shift
    const vlen = Math.hypot(SV[0], SV[1]), Vx = -SV[0] / vlen, Vy = -SV[1] / vlen;
    const shaftLit = Math.max(0, Lx * Vx + Ly * Vy) / ce;      // how squarely the lamp hits the side we see
    // a head's glint sits on its lamp-facing rim, half way toward the eye
    const gx = Lx * 0.55 + Vx * 0.12, gy = Ly * 0.55 + Vy * 0.12;

    // the eye, tilted off the normal by the parallax, and the half vector
    const tilt = Math.atan(vlen / ZPX), Ex = Vx * Math.sin(tilt), Ey = Vy * Math.sin(tilt), Ez = Math.cos(tilt);
    let Hx = Lx + Ex, Hy = Ly + Ey, Hz = Lz + Ez;
    { const h = Math.hypot(Hx, Hy, Hz); Hx /= h; Hy /= h; Hz /= h; }

    // 1. shadow heights: march toward the lamp
    const sdx = Lx / ce, sdy = Ly / ce, drop = PITCH * tanEl;
    for (let p = 0; p < NP; p++) {
      const i = p % N, j = (p / N) | 0;
      let best = -1e9;
      for (let k = 1; k <= 14; k++) {
        const fi = i + sdx * k, fj = j + sdy * k;
        if (fi < 0 || fj < 0 || fi > N - 1 || fj > N - 1) break;
        const ii = fi | 0, jj = fj | 0, ax = fi - ii, ay = fj - jj;
        const i1 = ii + 1 < N ? ii + 1 : ii, j1 = jj + 1 < N ? jj + 1 : jj;
        const zz = (Z[jj * N + ii] * (1 - ax) + Z[jj * N + i1] * ax) * (1 - ay) + (Z[j1 * N + ii] * (1 - ax) + Z[j1 * N + i1] * ax) * ay;
        const h = zz * ZPX - k * drop;
        if (h > best) best = h;
      }
      SHH[p] = best;
    }

    // 2. painter's order (insertion sort: it barely changes frame to frame)
    for (let k = 1; k < NP; k++) {
      const p = ORD[k], z = Z[p];
      let j = k - 1;
      while (j >= 0 && Z[ORD[j]] > z) { ORD[j + 1] = ORD[j]; j--; }
      ORD[j + 1] = p;
    }

    for (let n = 0; n < NP; n++) {
      const p = ORD[n], zp = Math.max(0, Z[p]) * ZPX, bx = px(p), by = py(p);
      const hx = bx + SV[0] * Z[p], hy = by + SV[1] * Z[p];
      const tint = o.tint ? o.tint(p) : null;
      const kr = tint ? key[0] * tint[0] : key[0], kg = tint ? key[1] * tint[1] : key[1], kb = tint ? key[2] * tint[2] : key[2];
      // shaft: base to head, lit above the shadow height
      if (zp > 0.5) {
        const len = Math.hypot(hx - bx, hy - by), m = Math.ceil(len * 2.2);
        for (let k = 0; k < m; k++) {
          const f = (k + 0.5) / m, sz = zp * f;
          const lit = kit.smoothstep(-0.6, 0.6, sz - SHH[p]) * (beamLo + (1 - beamLo) * kit.smoothstep(beamZ0, beamZ1, sz / ZPX));
          // polished: brighter toward the head (the bevel), a hint of sky in the shade
          const a = shaftLit * lit * (0.12 + 0.3 * f * f);
          dot(img, zb, W, bx + (hx - bx) * f, by + (hy - by) * f, sz, kr * a + fill[0] * 0.03, kg * a + fill[1] * 0.03, kb * a + fill[2] * 0.03, 0.5);
        }
      }
      // head. The pins sit recessed in the frame, so its lip keeps the low
      // lamp off the resting field: only pins pushed out rise into the beam.
      const beam = beamLo + (1 - beamLo) * kit.smoothstep(beamZ0, beamZ1, Z[p]);
      // a pin that stands above the one toward the lamp shows its whole lit dome
      const expo = kit.smoothstep(1.1, 3.5, zp - SHH[p]);
      const sun = kit.smoothstep(-0.8, 0.8, zp - SHH[p]) * beam;
      // the relief's own surface, sampled by this pin: lambert + a steel sheen
      const i = p % N, j = (p / N) | 0;
      const zl = Z[i > 0 ? p - 1 : p], zr = Z[i < N - 1 ? p + 1 : p], zu = Z[j > 0 ? p - N : p], zd = Z[j < N - 1 ? p + N : p];
      const gxs = (zr - zl) * ZPX / (2 * PITCH), gys = (zd - zu) * ZPX / (2 * PITCH), nn = 1 / Math.sqrt(1 + gxs * gxs + gys * gys);
      const Nx = -gxs * nn, Ny = -gys * nn, Nz = nn;
      const lamb = Math.max(0, Nx * Lx + Ny * Ly + Nz * Lz);
      const sheen = Math.max(0, Nx * Hx + Ny * Hy + Nz * Hz) ** sheenExp;
      const surf = sun * (0.03 + 0.55 * lamb + 1.6 * sheen) + 0.2 * expo * sun;
      const hr = headR * (1 + 0.04 * zp);
      const x0 = Math.floor(hx - hr), x1 = Math.ceil(hx + hr), y0 = Math.floor(hy - hr), y1 = Math.ceil(hy + hr);
      for (let y = y0; y <= y1; y++) {
        if (y < 0 || y >= W) continue;
        for (let x = x0; x <= x1; x++) {
          if (x < 0 || x >= W) continue;
          const dx = (x - hx) / hr, dy = (y - hy) / hr, d = Math.sqrt(dx * dx + dy * dy);
          const cov = kit.clamp((1.25 - d) * hr * 1.4);
          if (cov <= 0) continue;
          const c = y * W + x;
          if (zb[c] > zp + 0.4) continue;
          const nz = Math.sqrt(Math.max(0, 1 - Math.min(1, d * d)));
          const diff = Math.max(0, dx * Lx + dy * Ly + nz * Lz);
          const gd = (dx - gx) * (dx - gx) + (dy - gy) * (dy - gy);
          const glint = Math.exp(-gd * 7);
          const k = surf * (0.3 * nz + 0.25 * diff + 0.7 * glint) + sun * ground * glint;
          const f = 0.035 + 0.03 * nz;
          const q = 3 * c;
          img[q] += (kr * k + fill[0] * f - img[q]) * cov;
          img[q + 1] += (kg * k + fill[1] * f - img[q + 1]) * cov;
          img[q + 2] += (kb * k + fill[2] * f - img[q + 2]) * cov;
          if (cov > 0.6) zb[c] = zp;
        }
      }
    }
  }
  return { paint, SHH };
}

/** Paint a soft sub-pixel dot (bilinear over the 2x2 pixels round it) over what is behind. */
function dot(img, zb, W, x, y, z, r, g, b, a0) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  for (let yy = y0; yy <= y0 + 1; yy++) {
    if (yy < 0 || yy >= W) continue;
    const wy = 1 - Math.abs(yy - y);
    for (let xx = x0; xx <= x0 + 1; xx++) {
      if (xx < 0 || xx >= W) continue;
      const c = yy * W + xx;
      if (zb[c] > z + 0.4) continue;
      const a = Math.min(1, (1 - Math.abs(xx - x)) * wy * 2 * a0 + 0.0), q = 3 * c;
      img[q] += (r - img[q]) * a; img[q + 1] += (g - img[q + 1]) * a; img[q + 2] += (b - img[q + 2]) * a;
      if (a > 0.5) zb[c] = z;
    }
  }
}
