// Orrery: the per-pixel pass over everything flat. Each pixel's ray hits the
// dial plane (enamel, brass chapter ring, gears), the rim's outer band, and
// the two arm planes above it. Sun shadows of the planets and arms fall on it.
import { W, H, HS, RS, SIDE, cam, shade, light, segPointDist } from './orrery-cam.js';

const TAU = Math.PI * 2, T60 = TAU / 60, T12 = TAU / 12;
const BR = [0.3, 0.165, 0.04], BS = [1.0, 0.74, 0.36];       // brass diffuse / specular
const GILT = [0.26, 0.13, 0.03];
const EN = [0.0, 0.006, 0.085];                               // enamel
const LUME = [1.0, 0.82, 0.52], LIT = [1.0, 0.7, 0.3], CHIME = [1.0, 0.85, 0.6];
const sm = (a, b, x) => { const t = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a); return t * t * (3 - 2 * t); };
const cl = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
let R = 0, G = 0, B = 0;
const brass = (D, spec, k) => { R = D[0] * light.dif + BS[0] * light.spe * k; G = D[1] * light.dif + BS[1] * light.spe * k; B = D[2] * light.dif + BS[2] * light.spe * k; };
const wrapA = (a) => a - TAU * Math.round(a / TAU);

/** Signed distance (world) of the arm shape at (along, across), and its tilt. */
function armSD(A, al, ac) {
  const aac = ac < 0 ? -ac : ac;
  let sd = 1e9;
  if (al > -0.16 && al < A.R) sd = aac - (al > 0 ? 0.027 - 0.01 * al / A.R : 0.02);
  sd = Math.min(sd, Math.hypot(al + 0.16, ac) - 0.046, Math.hypot(al - A.R, ac) - 0.037, Math.hypot(al, ac) - 0.06);
  if (al > A.R && al < A.Rp - 0.04) sd = Math.min(sd, aac - (A.Rp > 1 ? 0.016 : 0.011));
  const tip = A.Rp - 0.035;
  sd = Math.min(sd, ((al > tip ? al - tip : tip - al) / 0.05 + aac / 0.026 - 1) * 0.022);
  return sd;
}

export function platePass(S, img, mask) {
  const { Cx, Cy, Cz, fx, fy, fz, rx, ry, ux, uy, uz, F, ox, oy } = cam;
  const sunI = light.sun;
  const cas = S.casters, arms = S.arms, gears = S.gears, strikes = S.strikes;
  for (let y = 0; y < H; y++) {
    const b = (oy - y) / F;
    for (let x = 0; x < W; x++) {
      const a = (x - ox) / F, p = y * W + x;
      const dx = fx + rx * a + ux * b, dy = fy + ry * a + uy * b, dz = fz + uz * b;
      img[3 * p] = img[3 * p + 1] = img[3 * p + 2] = 0; mask[p] = 0;
      if (dz >= 0) continue;
      const t = -Cz / dz, X = Cx + t * dx, Y = Cy + t * dy;
      const fp = (t / F) / Math.sqrt(-dz / Math.sqrt(dx * dx + dy * dy + dz * dz));
      const rho = Math.sqrt(X * X + Y * Y);
      let cov = 1;
      if (rho > 1.08) {
        // the rim's outer band: a cylinder r = 1.1 from Z = 0 down to -SIDE
        const qa = dx * dx + dy * dy, qb = 2 * (Cx * dx + Cy * dy), qc = Cx * Cx + Cy * Cy - 1.08 * 1.08;
        const disc = qb * qb - 4 * qa * qc;
        if (disc < 0) continue;
        const t1 = (-qb - Math.sqrt(disc)) / (2 * qa), Z = Cz + t1 * dz;
        if (Z > 0.004 || Z < -SIDE - 2 * fp) continue;
        const Xs = Cx + t1 * dx, Ys = Cy + t1 * dy;
        cov = cl((Z + SIDE) / fp + 0.5) * cl((0.004 - Z) / fp + 0.5);
        const up = Z > -0.018 ? 0.9 : Z < -SIDE + 0.016 ? -0.5 : 0;   // rolled lip, foot
        const nn = 1 / Math.sqrt(1 + up * up);
        light.sun = sunI; shade(Xs, Ys, Z, Xs / 1.08 * nn, Ys / 1.08 * nn, up * nn, 30);
        brass(GILT, 0, 0.8);
        const groove = Math.abs(Z + SIDE * 0.55) < 0.008 ? 0.45 : 1;
        img[3 * p] = R * cov * groove; img[3 * p + 1] = G * cov * groove; img[3 * p + 2] = B * cov * groove;
        mask[p] = 1;
        continue;
      }
      // ---- sun shadows on the plane: planets (spheres) and arms
      let sh = 1;
      for (let k = 0; k < cas.length; k++) {
        const c = cas[k], ex = X - c.sx, ey = Y - c.sy;
        if (ex * ex + ey * ey > c.reach2) continue;
        const dd = segPointDist(X, Y, 0, 0, 0, HS, c.x, c.y, c.z);
        const pen = c.r * 0.15 + RS * c.pen;
        sh *= 1 - 0.88 * (1 - sm(c.r - pen, c.r + pen, dd));
      }
      for (let k = 0; k < arms.length; k++) {
        const A = arms[k], s = A.shs;
        const al = (X * A.s + Y * A.c) / s, ac = (X * A.c - Y * A.s) / s;
        if (al < -0.25 || al > A.Rp + 0.05 || Math.abs(ac) > 0.09) continue;
        sh *= 1 - 0.75 * cl(-armSD(A, al, ac) / (fp * 2.2) + 0.5);
      }
      light.sun = sunI * sh;
      mask[p] = 1;
      let r = 0, g = 0, bb = 0;
      const q = Math.atan2(X, Y);
      const uh = q / T12, ih = ((Math.round(uh) % 12) + 12) % 12, ah = Math.abs(uh - Math.round(uh)) * T12 * rho;
      if (rho < 0.95) {
        // enamel, glossy, with the engraved orbit tracks
        shade(X, Y, 0, 0, 0, 1, 400);
        r = EN[0] * light.dif + 0.05 * light.spe; g = EN[1] * light.dif + 0.045 * light.spe; bb = EN[2] * light.dif + 0.04 * light.spe;
        for (let k = 0; k < arms.length; k++) {
          const tr = cl(1 - Math.abs(rho - arms[k].R) / (fp * 0.7)) * 0.5;
          if (tr > 0) { r += BR[0] * tr * light.dif * 0.5; g += BR[1] * tr * light.dif * 0.5; bb += BR[2] * tr * light.dif * 0.5; }
        }
        // the gear train
        for (let k = 0; k < gears.length; k++) {
          const gr = gears[k], ex = X - gr.x, ey = Y - gr.y, r2 = ex * ex + ey * ey, lim = gr.R + 0.03;
          if (r2 > lim * lim) continue;
          const rr = Math.sqrt(r2), ph = Math.atan2(ex, ey) - gr.rot;
          const tooth = Math.max(-1, Math.min(1, 1.7 * Math.cos(gr.n * ph) + 0.25));
          const edge = gr.R + 0.012 * tooth;
          let gc = cl((edge - rr) / fp + 0.5);
          if (rr > 0.3 * gr.R && rr < 0.74 * gr.R) {
            const u = ph * gr.sp / TAU, fs = Math.abs(u - Math.round(u)) * TAU / gr.sp * rr;
            gc *= cl((0.024 - fs) / fp + 0.5) + cl((rr - 0.74 * gr.R + 0.02) / fp) + cl((0.3 * gr.R + 0.02 - rr) / fp);
          }
          gc *= cl((rr - 0.022) / fp + 0.5);                  // arbor hole
          if (gc <= 0) continue;
          gc = cl(gc);
          const tilt = rr > edge - 0.022 ? 1.1 : rr < 0.3 * gr.R ? 0.35 : 0;
          const inv = 1 / (rr + 1e-6), nz = 1 / Math.sqrt(1 + tilt * tilt);
          shade(X, Y, 0.012, ex * inv * tilt * nz, ey * inv * tilt * nz, nz, 26);
          brass(gr.col, 0, 1);
          r += (R - r) * gc; g += (G - g) * gc; bb += (B - bb) * gc;
        }
        // the twelve hour batons, lume lit from within; 3/6/9 wider, 12 doubled
        if (rho > 0.79 && rho < 0.94) {
          let hc;
          if (ih === 0) hc = cl((0.017 - Math.abs(ah - 0.032)) / fp + 0.5);
          else hc = cl(((ih % 3 === 0 ? 0.04 : 0.027) - ah) / fp + 0.5);
          hc *= cl((rho - (ih % 3 === 0 ? 0.785 : 0.82)) / fp + 0.5) * cl((0.93 - rho) / fp + 0.5);
          if (hc > 0) {
            const lum = (0.62 + 0.75 * S.lit[ih]) * hc;
            r = r * (1 - hc) + LUME[0] * lum; g = g * (1 - hc) + LUME[1] * lum; bb = bb * (1 - hc) + LUME[2] * lum;
          }
          const lg = S.lit[ih] * Math.exp(-(ah * ah) / 0.004) * Math.exp(-((rho - 0.86) ** 2) / 0.008) * 0.22;
          r += LUME[0] * lg; g += LUME[1] * lg * 0.8; bb += LUME[2] * lg * 0.5;
        }
      } else if (rho < 1.035) {
        // the minute track: blackened steel with brass minute and five-minute marks
        shade(X, Y, 0, 0, 0, 1, 60);
        r = 0.01 * light.dif + 0.06 * light.spe; g = 0.01 * light.dif + 0.05 * light.spe; bb = 0.014 * light.dif + 0.04 * light.spe;
        const um = q / T60, im = ((Math.round(um) % 60) + 60) % 60, am = Math.abs(um - Math.round(um)) * T60 * rho;
        const five = im % 5 === 0;
        let tc = cl(((five ? 0.011 : 0.0055) - am) / fp + 0.5) * cl((rho - (five ? 0.955 : 0.985)) / fp + 0.5) * cl((1.028 - rho) / fp + 0.5);
        if (tc > 0) {
          shade(X, Y, 0, 0, 0, 1, 22);
          const k = five ? 1.6 : 1.0;
          const tr = (BR[0] * light.dif + BS[0] * light.spe) * k + (five ? 0.16 : 0.05), tg = (BR[1] * light.dif + BS[1] * light.spe) * k + (five ? 0.11 : 0.035), tb = (BR[2] * light.dif + BS[2] * light.spe) * k + (five ? 0.04 : 0.012);
          r += (tr - r) * tc; g += (tg - g) * tc; bb += (tb - bb) * tc;
        }
        // the lit minute engraving(s)
        for (let k = 0; k < S.ticks.length; k++) {
          const tk = S.ticks[k];
          if (tk.amp <= 0) continue;
          const ad = Math.abs(wrapA(q - tk.q)) * rho;
          if (ad > 0.08) continue;
          const core = cl((0.012 - ad) / fp + 0.5) * cl((rho - 0.955) / fp + 0.5) * cl((1.03 - rho) / fp + 0.5);
          const glow = Math.exp(-(ad * ad) / 0.0012) * Math.exp(-((rho - 0.99) ** 2) / 0.003) * 0.25;
          const v = tk.amp * (core + glow);
          r += LIT[0] * v; g += LIT[1] * v; bb += LIT[2] * v;
        }
      } else {
        // the brass bezel, bevelled outward
        const tilt = rho > 1.06 ? 0.9 : 0.25, nz = 1 / Math.sqrt(1 + tilt * tilt);
        shade(X, Y, 0, X / rho * tilt * nz, Y / rho * tilt * nz, nz, 22);
        brass(BR, 0, 1);
        if (rho < 1.042) { R *= 0.5; G *= 0.5; B *= 0.5; }
        r = R; g = G; bb = B;
      }
      // chime rings rolling out over the plate
      for (let k = 0; k < strikes.length; k++) {
        const s = strikes[k], e = (rho - s.rc) / 0.05, v = s.amp * Math.exp(-e * e);
        r += CHIME[0] * v; g += CHIME[1] * v; bb += CHIME[2] * v;
      }
      // ---- the two arms, each in its own plane above the dial
      for (let k = 0; k < arms.length; k++) {
        const A = arms[k];
        if (x < A.bx0 || x > A.bx1 || y < A.by0 || y > A.by1) continue;
        const ta = (A.z - Cz) / dz, Xa = Cx + ta * dx, Ya = Cy + ta * dy;
        const al = Xa * A.s + Ya * A.c, ac = Xa * A.c - Ya * A.s;
        const ac2 = cl(-armSD(A, al, ac) / fp + 0.5);
        if (ac2 <= 0) continue;
        const nt = Math.max(-1, Math.min(1, ac / 0.027)) * 0.75, nz = 1 / Math.sqrt(1 + nt * nt);
        light.sun = sunI * (A.shadowed ? 0.4 : 1);
        shade(Xa, Ya, A.z, A.c * nt * nz, -A.s * nt * nz, nz, 34);
        brass(A.col, 0, 1.1);
        for (let j = 0; j < strikes.length; j++) {
          const s = strikes[j], e = (al - s.rc) / 0.05, v = s.amp * 1.6 * Math.exp(-e * e);
          R += CHIME[0] * v; G += CHIME[1] * v; B += CHIME[2] * v;
        }
        if (A.tip) { const v = A.tip[3] * sm(A.Rp - 0.1, A.Rp - 0.04, al); R += A.tip[0] * v; G += A.tip[1] * v; B += A.tip[2] * v; }
        if (A.glint > 0) { const e = (al - A.gpos) / 0.07, v = A.glint * Math.exp(-e * e); R += v; G += 0.8 * v; B += 0.5 * v; }
        r += (R - r) * ac2; g += (G - g) * ac2; bb += (B - bb) * ac2;
      }
      img[3 * p] = r; img[3 * p + 1] = g; img[3 * p + 2] = bb;
    }
  }
  light.sun = sunI;
}
