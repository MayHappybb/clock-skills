// Orrery: camera, projection and the light model shared by the plate pass
// and the sphere pass. World units: the chapter ring's middle is radius 1.
// X right, Y away from the viewer (12 o'clock), Z up. Angles on the dial run
// clockwise from 12: a point at clock angle q is (sin q, cos q).
export const W = 128, H = 128;
export const D = 3.3;              // camera distance from the dial centre
export const E0 = 1.1;             // camera elevation (rad), ~63 deg: the dial tilts ~27 deg
export const HS = 0.4, RS = 0.11;  // sun height and radius
export const SIDE = 0.09;          // depth of the rim's outer band

// the camera (mutable, set once per frame)
export const cam = { Cx: 0, Cy: 0, Cz: 0, fx: 0, fy: 0, fz: 0, rx: 0, ry: 0, ux: 0, uy: 0, uz: 0, F: 1, ox: 0, oy: 0 };

export function setCam(yaw, elev) {
  const ce = Math.cos(elev), se = Math.sin(elev), cy = Math.cos(yaw), sy = Math.sin(yaw);
  // unrotated: C = (0, -D ce, D se), f = (0, ce, -se), u = (0, se, ce), r = (1, 0, 0)
  const rot = (x, y) => [x * cy - y * sy, x * sy + y * cy];
  [cam.Cx, cam.Cy] = rot(0, -D * ce); cam.Cz = D * se;
  [cam.fx, cam.fy] = rot(0, ce); cam.fz = -se;
  [cam.ux, cam.uy] = rot(0, se); cam.uz = ce;
  [cam.rx, cam.ry] = rot(1, 0);
}

/** World point -> screen [sx, sy, depth] written into o. */
export function project(X, Y, Z, o = [0, 0, 0]) {
  const vx = X - cam.Cx, vy = Y - cam.Cy, vz = Z - cam.Cz;
  const xc = vx * cam.rx + vy * cam.ry, yc = vx * cam.ux + vy * cam.uy + vz * cam.uz;
  const zc = vx * cam.fx + vy * cam.fy + vz * cam.fz;
  o[0] = cam.ox + cam.F * xc / zc; o[1] = cam.oy - cam.F * yc / zc; o[2] = zc;
  return o;
}

// Fit the machine into the square once, at the rest pose.
(function fit() {
  setCam(0, E0);
  cam.F = 1; cam.ox = 0; cam.oy = 0;
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  const p = [0, 0, 0];
  const take = () => { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); };
  for (let k = 0; k < 360; k++) {
    const q = k * Math.PI / 180;
    project(1.08 * Math.sin(q), 1.08 * Math.cos(q), 0, p); take();
    project(1.08 * Math.sin(q), 1.08 * Math.cos(q), -SIDE, p); take();
  }
  project(0, 0, HS + RS * 2.2, p); take();
  const F = Math.min((W - 6) / (x1 - x0), (H - 5) / (y1 - y0));
  cam.F = F; cam.ox = (W - 1) / 2 - F * (x0 + x1) / 2; cam.oy = (H - 1) / 2 - F * (y0 + y1) / 2 + 0.5;
})();

// ------------------------------------------------------------- light
// The sun is a point light at (0, 0, HS); a dim cool fill from front-left
// keeps the night sides of things readable.
const FL = (() => { const v = [-0.45, -0.55, 0.7], n = Math.hypot(...v); return v.map((c) => c / n); })();
export const light = { sun: 1, fill: 0.18, dif: 0, spe: 0, sunDif: 0 };

/**
 * Diffuse and specular at point P with unit normal N, seen from the camera.
 * Results in light.dif / light.spe / light.sunDif. `shin` is the Blinn exponent.
 */
export function shade(px, py, pz, nx, ny, nz, shin) {
  let lx = -px, ly = -py, lz = HS - pz;
  const d2 = lx * lx + ly * ly + lz * lz, il = 1 / Math.sqrt(d2);
  lx *= il; ly *= il; lz *= il;
  let vx = cam.Cx - px, vy = cam.Cy - py, vz = cam.Cz - pz;
  const iv = 1 / Math.sqrt(vx * vx + vy * vy + vz * vz);
  vx *= iv; vy *= iv; vz *= iv;
  const fall = light.sun / (0.45 + d2);
  const ndl = nx * lx + ny * ly + nz * lz;
  const sd = ndl > 0 ? ndl * fall : 0;
  const ndf = nx * FL[0] + ny * FL[1] + nz * FL[2];
  light.sunDif = sd;
  light.dif = sd + (ndf > 0 ? ndf * light.fill : 0) + 0.025;
  // Blinn half vectors
  let hx = lx + vx, hy = ly + vy, hz = lz + vz;
  let ih = 1 / Math.sqrt(hx * hx + hy * hy + hz * hz);
  const nh = (nx * hx + ny * hy + nz * hz) * ih;
  hx = FL[0] + vx; hy = FL[1] + vy; hz = FL[2] + vz;
  ih = 1 / Math.sqrt(hx * hx + hy * hy + hz * hz);
  const nf = (nx * hx + ny * hy + nz * hz) * ih;
  light.spe = (nh > 0 && ndl > 0 ? Math.pow(nh, shin) * fall * 2.2 : 0) + (nf > 0 ? Math.pow(nf, shin) * light.fill * 0.9 : 0);
}

/** Closest distance from point c to segment p->q (all 3D). */
export function segPointDist(px, py, pz, qx, qy, qz, cx, cy, cz) {
  const dx = qx - px, dy = qy - py, dz = qz - pz;
  let t = ((cx - px) * dx + (cy - py) * dy + (cz - pz) * dz) / (dx * dx + dy * dy + dz * dz);
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const ex = px + t * dx - cx, ey = py + t * dy - cy, ez = pz + t * dz - cz;
  return Math.sqrt(ex * ex + ey * ey + ez * ez);
}
