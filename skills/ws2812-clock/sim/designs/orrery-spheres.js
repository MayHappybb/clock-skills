// Orrery: the round things, raytraced per pixel in their screen boxes, far
// to near: the sun (emissive, granulated, flickering corona), the world (hour)
// with its moon (second), and the ringed giant (minute). Phases come from the
// sun's real direction; the moon and world eclipse each other once a minute.
import { W, H, HS, RS, cam, project, shade, light, segPointDist } from './orrery-cam.js';
import { noise3, noise2 } from '../js/kit.js';

const cl = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const sm = (a, b, x) => { const t = cl((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const P = [0, 0, 0];
let R = 0, G = 0, B = 0;

/** Sun visibility from point h, blocked by sphere o (soft). */
function occl(hx, hy, hz, o) {
  if (!o) return 1;
  const d = segPointDist(hx, hy, hz, 0, 0, HS, o.x, o.y, o.z);
  return sm(o.r * 0.7, o.r * 1.25, d) * 0.92 + 0.08;
}

function surface(o, hx, hy, hz, nx, ny, nz, mu, T) {
  if (o.kind === 'sun') {
    const g = noise3(nx * 7 + 3, ny * 7 + nz * 3, T * 0.35) * 0.6 + noise3(nx * 15, nz * 15 + ny * 4, T * 0.7) * 0.4;
    const k = light.sun * (0.62 + 0.38 * Math.sqrt(mu)) * (0.78 + 0.4 * g);
    R = 1.0 * k; G = (0.52 + 0.33 * mu) * k; B = (0.12 + 0.3 * mu * mu) * k;
    return;
  }
  // body coordinates: spin about the body's axis
  const ax = o.axis, cs = Math.cos(o.spin), sn = Math.sin(o.spin);
  const lat = nx * ax[0] + ny * ax[1] + nz * ax[2];
  const bx = nx * cs - ny * sn, by = nx * sn + ny * cs;
  const sun0 = light.sun;
  light.sun = sun0 * occl(hx, hy, hz, o.blocker);
  shade(hx, hy, hz, nx, ny, nz, o.kind === 'world' ? 24 : 12);
  const day = light.sunDif, dif = light.dif + 0.07 + 0.25 * Math.max(0, mu - 0.2);
  let cr, cg, cb;
  if (o.kind === 'world') {
    const land = noise3(bx * 2.3 + 7, by * 2.3, nz * 2.3 + 1);
    const cloud = noise3(bx * 3.1 - o.spin * 0.3, by * 3.1 + 2, nz * 4);
    if (Math.abs(lat) > 0.86) { cr = 0.7; cg = 0.75; cb = 0.8; }
    else if (land > 0.56) { const dsr = noise2(bx * 6, by * 6 + nz * 3); cr = 0.1 + 0.25 * dsr; cg = 0.26; cb = 0.05; }
    else { cr = 0.015; cg = 0.09; cb = 0.38; }
    const cw = sm(0.58, 0.72, cloud) * 0.8;
    cr += (0.85 - cr) * cw; cg += (0.88 - cg) * cw; cb += (0.92 - cb) * cw;
    R = cr * dif; G = cg * dif; B = cb * dif;
    const sp = land > 0.56 || cw > 0.2 ? 0 : 0.5;
    R += sp * light.spe * 0.8; G += sp * light.spe * 0.9; B += sp * light.spe;
    const rim = (1 - mu) ** 3 * (0.1 + day);      // atmosphere
    R += 0.05 * rim; G += 0.16 * rim; B += 0.5 * rim;
    if (land > 0.6 && day < 0.08) { const city = noise2(bx * 22 + 1, by * 22 + nz * 9); if (city > 0.7) { const c = (city - 0.7) * 2.2 * (1 - day / 0.08); R += 0.6 * c; G += 0.35 * c; B += 0.08 * c; } }
  } else if (o.kind === 'moon') {
    const cr0 = 0.45 + 0.25 * noise3(bx * 4, by * 4, nz * 4);
    R = cr0 * dif * 1.05; G = cr0 * dif; B = cr0 * dif * 0.92;
    // the world's shadow tints an eclipsed moon copper
    const ec = 1 - occl(hx, hy, hz, o.blocker);
    R += ec * 0.05; G += ec * 0.012;
  } else {
    const band = Math.sin(lat * 15 + 2.2 * noise2(bx * 1.5 + lat * 4, by * 1.5)) * 0.5 + 0.5;
    cr = 0.62 + 0.25 * band; cg = 0.42 + 0.18 * band; cb = 0.16 + 0.06 * band;
    const st = (bx - 0.75) ** 2 + (lat + 0.3) ** 2 * 3 + (by > 0 ? 9 : 0);
    if (st < 0.04) { cr = 0.75; cg = 0.3; cb = 0.08; }
    R = cr * dif; G = cg * dif; B = cb * dif;
    const rim = (1 - mu) ** 3 * (0.08 + day);
    R += 0.12 * rim; G += 0.08 * rim; B += 0.03 * rim;
  }
  light.sun = sun0;
}

export function spherePass(S, img, mask, T) {
  const { Cx, Cy, Cz, fx, fy, fz, rx, ry, ux, uy, uz, F, ox, oy } = cam;
  const list = S.spheres;
  for (const o of list) { project(o.x, o.y, o.z, P); o.sx = P[0]; o.sy = P[1]; o.depth = P[2]; }
  list.sort((a, b) => b.depth - a.depth);
  for (const o of list) {
    const rpx = o.r * F / o.depth, ext = rpx * (o.ring ? 2.4 : 1) + 2;
    const x0 = Math.max(0, Math.floor(o.sx - ext)), x1 = Math.min(W - 1, Math.ceil(o.sx + ext));
    const y0 = Math.max(0, Math.floor(o.sy - ext)), y1 = Math.min(H - 1, Math.ceil(o.sy + ext));
    const vx = o.x - Cx, vy = o.y - Cy, vz = o.z - Cz, vv = vx * vx + vy * vy + vz * vz;
    const nR = o.ring ? o.axis : null;
    for (let y = y0; y <= y1; y++) {
      const b = (oy - y) / F;
      for (let x = x0; x <= x1; x++) {
        const a = (x - ox) / F;
        let dx = fx + rx * a + ux * b, dy = fy + ry * a + uy * b, dz = fz + uz * b;
        const il = 1 / Math.sqrt(dx * dx + dy * dy + dz * dz);
        dx *= il; dy *= il; dz *= il;
        const tc = vx * dx + vy * dy + vz * dz, d2 = vv - tc * tc, pw = tc / F;
        const dist = Math.sqrt(d2 > 0 ? d2 : 0);
        const cov = cl((o.r - dist) / pw + 0.5);
        const p = y * W + x;
        let sr = 0, sg = 0, sb = 0, th = 1e9;
        if (cov > 0) {
          th = dist < o.r ? tc - Math.sqrt(o.r * o.r - d2) : tc;
          const hx = Cx + th * dx, hy = Cy + th * dy, hz = Cz + th * dz;
          let nx = hx - o.x, ny = hy - o.y, nz = hz - o.z;
          const inn = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
          nx *= inn; ny *= inn; nz *= inn;
          const mu = cl(-(nx * dx + ny * dy + nz * dz));
          surface(o, hx, hy, hz, nx, ny, nz, mu, T);
          sr = R; sg = G; sb = B;
        }
        let rc = 0, rr = 0, rg = 0, rb = 0, tr = 1e9;
        if (nR) {
          const den = dx * nR[0] + dy * nR[1] + dz * nR[2];
          if (Math.abs(den) > 1e-4) {
            tr = (vx * nR[0] + vy * nR[1] + vz * nR[2]) / den;
            const qx = Cx + tr * dx - o.x, qy = Cy + tr * dy - o.y, qz = Cz + tr * dz - o.z;
            const q = Math.sqrt(qx * qx + qy * qy + qz * qz) / o.r, qpw = pw / o.r / Math.max(0.25, Math.abs(den));
            rc = cl((q - 1.45) / qpw + 0.5) * cl((2.15 - q) / qpw + 0.5);
            if (rc > 0) {
              const dens = (q < 1.65 ? 0.45 : 0.8) * (1 - 0.9 * sm(0.03, 0, Math.abs(q - 1.88) - 0.02));
              rc *= dens;
              const gx = o.x + qx, gy = o.y + qy, gz = o.z + qz;
              const vis = sm(o.r * 0.85, o.r * 1.1, segPointDist(gx, gy, gz, 0, 0, HS, o.x, o.y, o.z));
              const sun0 = light.sun; light.sun = sun0 * vis;
              shade(gx, gy, gz, 0, 0, 1, 8);
              light.sun = sun0;
              const lv = light.sunDif * 1.4 + light.dif * 0.5;
              rr = 0.95 * lv; rg = 0.7 * lv; rb = 0.38 * lv;
            }
          }
        }
        if (cov <= 0 && rc <= 0) continue;
        let r = img[3 * p], g = img[3 * p + 1], bl = img[3 * p + 2];
        const ringFirst = tr > th;   // the ring is behind the ball here
        if (rc > 0 && ringFirst) { r += (rr - r) * rc; g += (rg - g) * rc; bl += (rb - bl) * rc; }
        if (cov > 0) { r += (sr - r) * cov; g += (sg - g) * cov; bl += (sb - bl) * cov; }
        if (rc > 0 && !ringFirst) { r += (rr - r) * rc; g += (rg - g) * rc; bl += (rb - bl) * rc; }
        img[3 * p] = r; img[3 * p + 1] = g; img[3 * p + 2] = bl; mask[p] = 1;
      }
    }
    if (o.kind === 'sun') corona(o, rpx, img, mask, T, S.flare);
  }
}

function corona(o, rpx, img, mask, T, flare) {
  const ext = rpx * (2.6 + 1.6 * flare);
  const x0 = Math.max(0, Math.floor(o.sx - ext)), x1 = Math.min(W - 1, Math.ceil(o.sx + ext));
  const y0 = Math.max(0, Math.floor(o.sy - ext)), y1 = Math.min(H - 1, Math.ceil(o.sy + ext));
  const k0 = light.sun * 1.1;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const ex = x - o.sx, ey = y - o.sy, dd = Math.sqrt(ex * ex + ey * ey), u = dd / rpx;
    if (u < 0.9 || u > 2.6 + 1.6 * flare) continue;
    const ca = ex / dd, sa = ey / dd;
    const n = noise3(ca * 2.6 + 9, sa * 2.6 + 4, T * 0.45 - u * 0.25);
    const n2 = noise3(ca * 6 + 1, sa * 6, T * 1.3 - u * 0.6);
    const reach = 1 + flare * 1.2;
    const v = k0 * (0.1 + 1.6 * n * n * n + 0.5 * n2 * n2) * Math.pow(1 / u, 5 / reach) * (1 - sm(1.4 * reach, 2.6 + 1.6 * flare, u)) * cl((u - 0.9) * 8);
    const p = y * W + x;
    img[3 * p] += v; img[3 * p + 1] += v * 0.48; img[3 * p + 2] += v * 0.12;
    mask[p] = 1;
  }
}
