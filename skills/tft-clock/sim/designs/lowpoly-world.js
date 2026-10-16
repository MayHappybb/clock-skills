// The 3D world of lowpoly.js: the camera, the sea, the islands, the sky.
//
// World axes: x right, y up, z forward (the way the camera looks when the
// time reads). Units are arbitrary; the camera sits 10 units from the
// pivot, the middle of the cloud of pieces.

import { sin, cos, clamp, R, G, B, rand } from '../js/kit.js';
import * as gl from './lowpoly-raster.js';
import { mix, rsqrt } from './lowpoly-raster.js';

export const F = 100, CX = 80, CY = 40;    // focal length (px) and screen centre
export const NEAR = 0.6;

// ------------------------------------------------------------ vectors
export const v3 = (x, y, z) => [x, y, z];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a) => { const d = dot(a, a); return d * rsqrt(d); };
export const unit = (a) => { const d = dot(a, a); return d > 0 ? mul(a, rsqrt(d)) : a; };
/** Horizontal distance between two points. */
export const hdist = (x, z) => { const d = x * x + z * z; return d * rsqrt(d); };

// ------------------------------------------------------------ camera

/** A camera at `e` looking at `target`, rolled by `roll` radians. */
export function lookAt(e, target, roll = 0) {
  const f = unit(sub(target, e));
  const r0 = unit([f[2], 0, -f[0]]);
  const u0 = cross(f, r0);
  const cr = cos(roll), sr = sin(roll);
  const r = add(mul(r0, cr), mul(u0, sr)), u = sub(mul(u0, cr), mul(r0, sr));
  return { e, f, r, u };
}

let cost = null;
export function begin(g) { cost = g.cost; }

/** Screen position [x, y, depth] of a world point, or null in front of the near plane. */
export function project(cam, p) {
  cost.box += 35;                          // fixed point, as the PS1's GTE did it: 9 MULs, a DIV (~100 cycles)
  const dx = p[0] - cam.e[0], dy = p[1] - cam.e[1], dz = p[2] - cam.e[2];
  const zc = dx * cam.f[0] + dy * cam.f[1] + dz * cam.f[2];
  if (zc < NEAR) return null;
  const xc = dx * cam.r[0] + dy * cam.r[1] + dz * cam.r[2];
  const yc = dx * cam.u[0] + dy * cam.u[1] + dz * cam.u[2];
  return [CX + F * xc / zc, CY - F * yc / zc, zc];
}

/** The world point on the ray through screen (sx, sy) at depth d, for camera `cam`. */
export function unproject(cam, sx, sy, d) {
  const xn = (sx - CX) / F * d, yn = -(sy - CY) / F * d;
  return [cam.e[0] + cam.r[0] * xn + cam.u[0] * yn + cam.f[0] * d,
    cam.e[1] + cam.r[1] * xn + cam.u[1] * yn + cam.f[1] * d,
    cam.e[2] + cam.r[2] * xn + cam.u[2] * yn + cam.f[2] * d];
}

/** Off-screen test for a projected triangle. */
export function offscreen(a, b, c) {
  return (a[0] < 0 && b[0] < 0 && c[0] < 0) || (a[0] > 160 && b[0] > 160 && c[0] > 160) ||
    (a[1] < 0 && b[1] < 0 && c[1] < 0) || (a[1] > 80 && b[1] > 80 && c[1] > 80);
}

// ------------------------------------------------------------ the sea

export const SEA_Y = -8.5;
// A radial grid round the pivot, rings further apart with distance: the
// triangles stay about the same size on screen wherever the camera orbits.
const RINGS = [1.5, 3.5, 6, 9, 12.5, 16.5, 21, 26.5, 33, 41, 51, 63, 78, 96, 125, 170, 240];
const SPOKES = 40;
// the grid's plan positions round the pivot, a table in flash
const GRID = new Float32Array(RINGS.length * SPOKES * 2);
RINGS.forEach((rr, i) => {
  for (let j = 0; j < SPOKES; j++) {
    const a = ((j + (i & 1) * 0.5) / SPOKES) * Math.PI * 2;
    GRID[(i * SPOKES + j) * 2] = rr * Math.cos(a); GRID[(i * SPOKES + j) * 2 + 1] = rr * Math.sin(a);
  }
});

/** Height of the sea surface at (x, z), time ts (seconds). */
export function seaHeight(x, z, ts) {
  return SEA_Y + 0.34 * sin(0.42 * x + 0.21 * z + 1.1 * ts) + 0.26 * sin(0.33 * z - 0.17 * x - 0.8 * ts)
    + 0.14 * sin(0.9 * x + 0.7 * z + 2.3 * ts);
}

/**
 * Push the sea's triangles into the ordering table `ot`. `pal` holds the
 * colours, `light` the sun or moon direction (unit, pointing at it).
 */
export function sea(cam, pivot, ts, pal, light, fog, ot) {
  const nr = RINGS.length;
  const P = new Array(nr * SPOKES), Wd = new Array(nr * SPOKES);
  for (let i = 0; i < nr; i++) {
    for (let j = 0; j < SPOKES; j++) {
      const x = pivot[0] + GRID[(i * SPOKES + j) * 2], z = pivot[2] + GRID[(i * SPOKES + j) * 2 + 1];
      const w = [x, seaHeight(x, z, ts), z];
      Wd[i * SPOKES + j] = w;
      P[i * SPOKES + j] = project(cam, w);
    }
  }
  // view-independent half vector for glints: towards the camera from the pivot
  const toCam = unit(sub(cam.e, pivot));
  const hv = unit(add(light, toCam));
  const tri = (ia, ib, ic) => {
    const a = P[ia], b = P[ib], c = P[ic];
    if (!a || !b || !c || offscreen(a, b, c)) return;
    // back-facing from above never happens for a sea seen from above, but a
    // wave can fold edge-on; skip degenerate ones in the rasteriser
    const wa = Wd[ia], wb = Wd[ib], wc = Wd[ic];
    let n = unit(cross(sub(wb, wa), sub(wc, wa)));
    if (n[1] < 0) n = mul(n, -1);
    cost.box += 60;                        // normal, two dots, a power, fog, fixed point (~180 cycles)
    const tilt = clamp(0.5 + 3.2 * (n[0] * light[0] + n[2] * light[2]), 0, 1);
    let col = mix(pal.deep, pal.lit, tilt);
    const sp0 = dot(n, hv), sp = sp0 > 0 ? sp0 : 0;
    const gl2 = sp * sp, gl4 = gl2 * gl2, gl16 = gl4 * gl4 * gl4 * gl4, gl48 = gl16 * gl16 * gl16;
    col = mix(col, pal.glint, clamp(gl48 * 1.2 * pal.gk, 0, 0.85));
    const cxw = (wa[0] + wb[0] + wc[0]) / 3, czw = (wa[2] + wb[2] + wc[2]) / 3;
    const dist = hdist(cxw - cam.e[0], czw - cam.e[2]);
    col = mix(col, pal.seaFog, fog(dist));
    ot.push({ z: (a[2] + b[2] + c[2]) / 3, draw: () => gl.tri(a[0], a[1], b[0], b[1], c[0], c[1], gl.patternOf(col)) });
  };
  for (let i = 0; i < nr - 1; i++)
    for (let j = 0; j < SPOKES; j++) {
      const j1 = (j + 1) % SPOKES;
      const a = i * SPOKES + j, b = i * SPOKES + j1, c = (i + 1) * SPOKES + j, d = (i + 1) * SPOKES + j1;
      if (i & 1) { tri(a, b, d); tri(a, d, c); } else { tri(a, b, c); tri(b, d, c); }
    }
}

// ------------------------------------------------------------ islands

/** Low-poly islands round the horizon: [azimuth, distance, radius, height, seed]. */
const ISLES = [[-0.42, 74, 9, 6.5, 1], [-0.12, 92, 14, 4.2, 2], [0.3, 70, 7, 8.5, 3], [0.55, 88, 11, 3.6, 4],
  [1.6, 80, 12, 7, 5], [2.4, 75, 10, 5, 6], [3.1, 90, 16, 6, 7], [3.9, 72, 8, 9, 8], [4.7, 84, 12, 4.5, 9], [5.5, 78, 9, 6, 10]];

const ISLE_MESH = ISLES.map(([az, d, rad, h, seed]) => {
  const cx = Math.sin(az) * d, cz = Math.cos(az) * d + 10;
  const n = 7, ring = [], mid = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + rand(seed, k) * 0.5;
    const rr = rad * (0.8 + 0.4 * rand(seed, k, 1));
    ring.push([cx + Math.cos(a) * rr, SEA_Y - 0.6, cz + Math.sin(a) * rr]);
    const rm = rr * (0.45 + 0.2 * rand(seed, k, 2));
    mid.push([cx + Math.cos(a + 0.3) * rm, SEA_Y + h * (0.45 + 0.25 * rand(seed, k, 3)), cz + Math.sin(a + 0.3) * rm]);
  }
  const peak = [cx + rad * 0.15 * (rand(seed, 9) - 0.5), SEA_Y + h, cz + rad * 0.15 * (rand(seed, 8) - 0.5)];
  const tris = [];
  for (let k = 0; k < n; k++) {
    const k1 = (k + 1) % n;
    tris.push([ring[k], ring[k1], mid[k]], [ring[k1], mid[k1], mid[k]], [mid[k], mid[k1], peak]);
  }
  return tris;
});

export function islands(cam, pal, light, fog, ot) {
  for (const tris of ISLE_MESH)
    for (const [wa, wb, wc] of tris) {
      const a = project(cam, wa), b = project(cam, wb), c = project(cam, wc);
      if (!a || !b || !c || offscreen(a, b, c)) continue;
      let n = unit(cross(sub(wb, wa), sub(wc, wa)));
      if (n[1] < 0) n = mul(n, -1);
      cost.box += 60;
      const nk = dot(n, pal.key), k = clamp(0.35 + 0.65 * (nk > 0 ? nk : 0), 0, 1);
      let col = mix(pal.land0, pal.land1, k);
      const dist = hdist((wa[0] + wb[0] + wc[0]) / 3 - cam.e[0], (wa[2] + wb[2] + wc[2]) / 3 - cam.e[2]);
      col = mix(col, pal.fog, fog(dist) * 0.92);
      ot.push({ z: (a[2] + b[2] + c[2]) / 3, draw: () => gl.tri(a[0], a[1], b[0], b[1], c[0], c[1], gl.patternOf(col)) });
    }
}

/** Where a direction (unit, at infinity) lands on screen, or null behind. */
export function projectDir(cam, d) {
  const zc = dot(d, cam.f);
  if (zc < 0.05) return null;
  return [CX + F * dot(d, cam.r) / zc, CY - F * dot(d, cam.u) / zc];
}

/** Mix helper for float channels. */
export const rgbOf = (c) => [R(c), G(c), B(c)];
