// Skywriter plane: a 13 px biplane drawn as a little 3D object by coverage.
// Local frame: u forward from the smoke nozzle at the tail, v up, w along
// the span. The plane rolls about u: a point (u, v, w) lands at
// v' = v cos(phi) - w sin(phi), so in a roll the wings swing open into their
// planform and the wheels separate, instead of the sprite just flipping.
// The pilot is a green frog in round goggles.

const W = 64, H = 64;
export const TEAM = {
  hero: { body: [0.8, 0.05, 0.03], wing: [0.9, 0.78, 0.55], trim: [0.9, 0.78, 0.55] },
  rose: { body: [0.82, 0.8, 0.76], wing: [0.9, 0.08, 0.16], trim: [0.9, 0.08, 0.16] },
  gold: { body: [0.04, 0.12, 0.55], wing: [0.95, 0.55, 0.03], trim: [0.95, 0.55, 0.03] },
};
const FROG = [0.12, 0.6, 0.08], GLASS = [0.75, 0.95, 1], DARK = [0.03, 0.03, 0.035], METAL = [0.22, 0.2, 0.2], PROP = [0.7, 0.7, 0.68], TYRE = [0.012, 0.012, 0.012];

// signed distance from (u, v) to a segment of radius r
function cap(u, v, au, av, bu, bv, r) {
  const du = bu - au, dv = bv - av, L2 = du * du + dv * dv;
  let t = L2 ? ((u - au) * du + (v - av) * dv) / L2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const x = u - au - t * du, y = v - av - t * dv;
  return Math.sqrt(x * x + y * y) - r;
}
// rounded box centred (cu, cv), half sizes hu, hv, corner r
function box(u, v, cu, cv, hu, hv, r) {
  const qu = Math.abs(u - cu) - hu + r, qv = Math.abs(v - cv) - hv + r;
  const ou = qu > 0 ? qu : 0, ov = qv > 0 ? qv : 0;
  return Math.sqrt(ou * ou + ov * ov) + Math.min(Math.max(qu, qv), 0) - r;
}
let pr = 0, pg = 0, pb = 0, pL = 1;
function paint(d, c, a) { const k = cv(d) * a; if (k > 0) { pr += (c[0] * pL - pr) * k; pg += (c[1] * pL - pg) * k; pb += (c[2] * pL - pb) * k; } }
const cv = (d) => (d <= -0.5 ? 1 : d >= 0.5 ? 0 : 0.5 - d);

/**
 * Draw a plane into img with its tail (smoke nozzle) at (x, y), heading
 * (dx, dy) (unit, screen y down), roll rho in [-1, 1] (1 = upright side
 * view, -1 inverted, 0 seen from above). light: 0..1 scene light, nav: 0..1
 * navigation lights, T: seconds (propeller, strobe).
 */
export function draw(img, x, y, dx, dy, rho, team, light, nav, T, gain, SC = 1.22) {
  const nx = dy, ny = -dx;                       // screen direction of local +v
  const iS = 1 / SC, R = 9 * SC;                 // 13 px long at SC = 1
  const s = Math.sqrt(Math.max(0, 1 - rho * rho));
  const cxw = x + dx * 6.3 * SC, cyw = y + dy * 6.3 * SC;  // centre of the bbox
  const xa = Math.max(0, Math.floor(cxw - R)), xb = Math.min(W - 1, Math.ceil(cxw + R));
  const ya = Math.max(0, Math.floor(cyw - R)), yb = Math.min(H - 1, Math.ceil(cyw + R));
  const C = TEAM[team], L = light * gain;
  const uw = 3.7 * rho, lw = -1.45 * rho;       // wing heights after roll
  const span = 4.8 * s, tspan = 2.2 * s;
  const prop = 0.35 + 0.25 * Math.sin(T * 61) * Math.sin(T * 23);
  for (let py = ya; py <= yb; py++) for (let px = xa; px <= xb; px++) {
    const ox = (px - x) * iS, oy = (py - y) * iS, u = ox * dx + oy * dy, v = ox * nx + oy * ny;
    if (u < -1.5 || u > 14) continue;
    const q = 3 * (py * W + px);
    pr = img[q]; pg = img[q + 1]; pb = img[q + 2]; pL = L;
    // a dark rim round the silhouette, so the plane stands off the sky and the smoke
    {
      const dsil = Math.min(cap(u, v, 0.6, 0.6 * rho, 11.8, 0.3 * rho, 1.3), box(u, v, 7.9, uw, 2.3 - 0.6 * s, Math.max(0.55, span), 0.5),
        box(u, v, 8.1, lw, 1.8, Math.max(0.5, span), 0.45), cap(u, v, 0.7, 0.3 * rho, 1.5, 2.8 * rho, 0.55));
      const k = cv(dsil - 1.1 * iS) * 0.8;
      pr *= 1 - k; pg *= 1 - k; pb *= 1 - k;
    }
    // the far wing / wheel first, then the body, then the near side
    if (s < 0.75) paint(box(u, v, 8.1, lw, 1.8, Math.max(0.5, span), 0.45), C.wing, 1); // lower wing (hidden under the upper in planform)
    paint(cap(u, v, 8.6, lw, 9.0, -3.1 * rho - 1.2 * s, 0.3), DARK, 1);             // gear leg
    paint(cap(u, v, 9.1, -3.3 * rho - 1.4 * s, 9.1, -3.3 * rho - 1.4 * s, 0.85), TYRE, 1);
    paint(box(u, v, 1.4, 0.1 * rho, 1.25, Math.max(0.42, tspan), 0.4), C.wing, 1);  // tailplane
    paint(cap(u, v, 0.7, 0.3 * rho, 1.5, 2.8 * rho, 0.55), C.body, 1);              // fin
    paint(cap(u, v, 2.8, 0.6 * rho, 1.5, 2.8 * rho, 0.4), C.body, 1);
    // fuselage: tapered capsule tail -> nose
    {
      let t = (u - 0.5) / 10.6; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const dv = v - (0.15 + 0.15 * t) * rho, du = u - (0.5 + 10.6 * t);
      paint(Math.sqrt(du * du + dv * dv) - (0.5 + 0.95 * t), C.body, 1);
    }
    paint(cap(u, v, 3.6, 0.55 * rho, 9.8, 0.75 * rho, 0.32), C.trim, 0.8);          // cheat line
    paint(cap(u, v, 10.9, 0.3 * rho, 11.7, 0.3 * rho, 1.25), METAL, 1);            // cowling
    paint(cap(u, v, 6.0, 1.75 * rho, 6.0, 1.75 * rho, 0.95), FROG, 1);             // frog pilot
    paint(cap(u, v, 6.55, 1.95 * rho, 6.55, 1.95 * rho, 0.42), GLASS, 1);           // goggles
    paint(cap(u, v, 7.1, lw, 7.4, uw, 0.22), DARK, 0.9);                           // struts
    paint(cap(u, v, 9.3, lw, 9.6, uw, 0.22), DARK, 0.9);
    paint(box(u, v, 7.9, uw, 2.3 - 0.6 * s, Math.max(0.55, span), 0.5), C.wing, 1);          // upper wing
    paint(cap(u, v, 12.4, -2.7, 12.4, 3.0, 0.3), PROP, prop);           // propeller disc
    img[q] = pr; img[q + 1] = pg; img[q + 2] = pb;
  }
  if (nav > 0.01) {
    // red / green wingtips, white tail light, and a strobe
    const tipU = 8.4, red = uw + span, grn = uw - span;
    light1(img, x + (dx * tipU + nx * red) * SC, y + (dy * tipU + ny * red) * SC, [1, 0.04, 0.02], 0.9 * nav * gain);
    light1(img, x + (dx * tipU + nx * grn) * SC, y + (dy * tipU + ny * grn) * SC, [0.02, 1, 0.12], 0.9 * nav * gain);
    const st = (T % 1.3) < 0.09 ? 1 : 0.35;
    light1(img, x + (dx * 1.4 + nx * 2.9 * rho) * SC, y + (dy * 1.4 + ny * 2.9 * rho) * SC, [1, 1, 0.95], st * nav * gain);
  }
}
function light1(img, x, y, c, a) {
  for (let py = Math.max(0, Math.floor(y - 1.6)); py <= Math.min(H - 1, Math.ceil(y + 1.6)); py++)
    for (let px = Math.max(0, Math.floor(x - 1.6)); px <= Math.min(W - 1, Math.ceil(x + 1.6)); px++) {
      const d2 = (px - x) ** 2 + (py - y) ** 2;
      if (d2 > 2.56) continue;
      const k = a * (1 - d2 / 2.56) ** 2, q = 3 * (py * W + px);
      img[q] += c[0] * k; img[q + 1] += c[1] * k; img[q + 2] += c[2] * k;
    }
}
