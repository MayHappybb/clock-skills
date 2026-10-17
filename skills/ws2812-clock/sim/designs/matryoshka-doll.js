// Draws one matryoshka (or one piece of one) into a linear RGB raster.
//
// The doll is a solid of revolution: a head sphere smoothly joined to an egg
// body with a flat foot, as an SDF in units of its height (y 0 top, 1 foot).
// Every pixel inside is mapped back onto the surface: its view longitude
// asin(x / halfWidth(y)) gives the lacquer shading and the glossy streak,
// and longitude minus the doll's yaw gives the painted pattern. So the
// painting wraps round the body: when a doll turns, her face and apron slide
// round the side and the back comes into view; when her head is unscrewed,
// the scarf's dots slide sideways against the body's.
//
// Paint is defined "front-on" (sx = halfWidth * sin(lonRel), y): face, eyes,
// cheeks, scarf, the black lacquer apron and the Khokhloma
// numerals (sampled from matryoshka-glyphs masks).
import { MASKS, levelFor, sample, GW, GH } from './matryoshka-glyphs.js';

export const SEAM = 0.445, LIP = 0.03;
const HEAD_Y = 0.235, HEAD_R = 0.228, BODY_Y = 0.70, BODY_RY = 0.36, SMOOTH = 0.05;

function sdDoll(x, y, rx) {
  const dh = Math.sqrt(x * x + (y - HEAD_Y) * (y - HEAD_Y)) - HEAD_R;
  const ex = x / rx, ey = (y - BODY_Y) / BODY_RY;
  const k0 = Math.sqrt(ex * ex + ey * ey), k1 = Math.sqrt(ex * ex / (rx * rx) + ey * ey / (BODY_RY * BODY_RY)) || 1e-6;
  const db = (k0 * (k0 - 1)) / k1;
  let h = 0.5 + (0.5 * (db - dh)) / SMOOTH;
  h = h < 0 ? 0 : h > 1 ? 1 : h;
  const d = db + (dh - db) * h - SMOOTH * h * (1 - h);
  return d > y - 1 ? d : y - 1;
}

const shapes = new Map();
/** A body shape: half-width table by height for the surface mapping. */
export function shape(rx, apronRx) {
  const key = rx + ':' + apronRx;
  if (shapes.has(key)) return shapes.get(key);
  const hw = new Float32Array(257);
  for (let k = 0; k <= 256; k++) {
    const y = k / 256;
    let a = 0, b = 0.7;
    if (sdDoll(0, y, rx) > 0) { hw[k] = 0; continue; }
    for (let it = 0; it < 30; it++) { const m = (a + b) / 2; if (sdDoll(m, y, rx) < 0) a = m; else b = m; }
    hw[k] = a;
  }
  const s = { rx, arx: apronRx, hw, hwSeam: hw[Math.round(SEAM * 256)] };
  shapes.set(key, s);
  return s;
}

/** A painted colour scheme (linear RGB). */
export function palette(o) {
  return { body: o.body, scarf: o.scarf, dots: o.dots, trim: o.trim, nDots: o.nDots ?? 9, flower: o.flower ?? [0.78, 0.36, 0.04] };
}

const GOLD_D = [0.78, 0.36, 0.04], GOLD_L = [1.0, 0.80, 0.36], BERRY = [0.80, 0.025, 0.015];
const SKIN = [0.86, 0.50, 0.30], HAIR = [0.09, 0.03, 0.012], CHEEK = [0.95, 0.16, 0.12], MOUTH = [0.75, 0.03, 0.03];
const INSIDE_FAR = [0.16, 0.012, 0.006], INSIDE_NEAR = [0.035, 0.003, 0.002];
const smp = new Float32Array(3);

/**
 * Item fields (keep them all set, same order: hot objects stay monomorphic):
 *   shape, pal, H (px), x, y (screen anchor), anchor (local y of the anchor),
 *   rot, sx, sy (scale), part (0 whole, 1 head piece, 2 body cup, 3 cup inside),
 *   yaw, blink (0..1), d0, d1 (apron digits or -1), z, glint (x of the light sweep)
 */
export function drawItem(img, W, Hc, it, dim) {
  const sh = it.shape, pal = it.pal, H = it.H;
  const ux = H * it.sx, uy = H * it.sy, pxu = ux < uy ? ux : uy;
  if (pxu < 2) return;
  const c = Math.cos(it.rot), s = Math.sin(it.rot);
  // bounding box of the local box [-0.5, 0.5] x [0, 1]
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (let k = 0; k < 4; k++) {
    const lx = (k & 1 ? 0.5 : -0.5) * ux, ly = ((k >> 1 ? 1.02 : -0.02) - it.anchor) * uy;
    const X = it.x + c * lx - s * ly, Y = it.y + s * lx + c * ly;
    if (X < x0) x0 = X; if (X > x1) x1 = X; if (Y < y0) y0 = Y; if (Y > y1) y1 = Y;
  }
  x0 = Math.max(0, Math.floor(x0)); x1 = Math.min(W - 1, Math.ceil(x1));
  y0 = Math.max(0, Math.floor(y0)); y1 = Math.min(Hc - 1, Math.ceil(y1));
  if (x0 > x1 || y0 > y1) return;

  const part = it.part, rx = sh.rx, hwT = sh.hw, hwS = sh.hwSeam, yaw = it.yaw;
  const arx = sh.arx, ary = 0.275, acy = 0.705;
  // digits on the apron: two side by side (or none)
  const hD = 0.39, gw = (hD * GW) / GH, gap = 0.03;
  const dx0 = -(2 * gw + gap) / 2, dy0 = acy - hD / 2, gs = GH / hD;
  const lev = levelFor(GH / (hD * pxu));
  const m0 = it.d0 >= 0 ? MASKS[lev][it.d0] : null, m1 = it.d1 >= 0 ? MASKS[lev][it.d1] : null;
  const nD = pal.nDots, small = pxu < 22, tiny = pxu < 14;
  const eyeR = Math.max(0.024, 0.75 / pxu), blink = it.blink;

  for (let py = y0; py <= y1; py++) {
    const ddy = py - it.y;
    for (let px = x0; px <= x1; px++) {
      const ddx = px - it.x;
      const lx = (c * ddx + s * ddy) / ux, ly = it.anchor + (-s * ddx + c * ddy) / uy;
      if (ly < -0.02 || ly > 1.02 || lx > 0.5 || lx < -0.5) continue;
      let r, g, b, cov;
      const hw = hwT[(ly < 0 ? 0 : ly > 1 ? 1 : ly) * 256 | 0] || 1e-3;
      const q = lx / hw, sinv = q > 1 ? 1 : q < -1 ? -1 : q;
      const lip = SEAM + LIP * Math.sqrt(Math.max(0, 1 - (lx / hwS) * (lx / hwS)));
      if (part === 3) {
        // the open cup: the lacquered inside, far wall lit, near wall dark
        const ex = lx / hwS, ey = (ly - SEAM) / LIP, k0 = Math.sqrt(ex * ex + ey * ey);
        cov = 0.5 - (k0 - 1) * LIP * pxu;
        if (cov <= 0) continue;
        const f = ey < 0 ? 1 : 0.15;
        r = INSIDE_NEAR[0] + (INSIDE_FAR[0] - INSIDE_NEAR[0]) * f;
        g = INSIDE_NEAR[1] + (INSIDE_FAR[1] - INSIDE_NEAR[1]) * f;
        b = INSIDE_NEAR[2] + (INSIDE_FAR[2] - INSIDE_NEAR[2]) * f;
      } else {
        const d = sdDoll(lx, ly, rx);
        cov = 0.5 - d * pxu;
        if (cov <= 0) continue;
        if (part === 1) { const e = (lip - ly) * pxu + 0.5; cov = cov < e ? cov : e; }
        else if (part === 2) { const e = (ly - lip) * pxu + 0.5; cov = cov < e ? cov : e; }
        if (cov <= 0) continue;
        const lonV = Math.asin(sinv), cosV = Math.sqrt(1 - sinv * sinv);
        const lonR = lonV - (ly < lip ? it.yawTop : yaw);
        const cR = Math.cos(lonR), sR = Math.sin(lonR);
        const sx = hw * sR;            // front-on x of the paint
        const front = cR > 0;
        let gold = 0, apr = 0;         // gilded share (takes the glint); apron share
        if (ly < lip) {
          // ---- head piece: face in a scarf
          const fx = sx / 0.165, fy = (ly - 0.262) / 0.15, fr = Math.sqrt(fx * fx + fy * fy);
          const inFace = front ? Math.min(1, Math.max(0, (1 - fr) * 0.15 * pxu * cR + 0.5)) : 0;
          // scarf with dots
          r = pal.scarf[0]; g = pal.scarf[1]; b = pal.scarf[2];
          if (!small) {
            const u = (lonR * nD) / 6.2832, ui = Math.floor(u), row = ly / 0.085 + (ui & 1) * 0.5;
            const du = (u - ui - 0.5) * (6.2832 / nD) * hw * cosV * pxu, dv = (row - Math.floor(row) - 0.5) * 0.085 * pxu;
            const dot = Math.min(1, Math.max(0, 1.25 - Math.sqrt(du * du + dv * dv)));
            if (dot > 0) { r += (pal.dots[0] - r) * dot; g += (pal.dots[1] - g) * dot; b += (pal.dots[2] - b) * dot; }
          }
          // gilded hem of the scarf along the seam
          const hem = Math.min(1, Math.max(0, ((ly - (lip - 0.045)) * pxu) + 0.5));
          if (hem > 0) { r += (pal.trim[0] - r) * hem; g += (pal.trim[1] - g) * hem; b += (pal.trim[2] - b) * hem; gold = hem; }
          if (inFace > 0) {
            let fr2 = SKIN[0], fg = SKIN[1], fb = SKIN[2];
            // hair, parted in the middle
            const hl = 0.168 + 0.07 * Math.abs(fx) ** 0.9;
            const hair = Math.min(1, Math.max(0, (hl - ly) * pxu + 0.5));
            if (!tiny) {
              // cheeks
              for (let k = -1; k <= 1; k += 2) {
                const cx = sx - k * 0.093, cy = ly - 0.31, cd = Math.sqrt(cx * cx + cy * cy) * pxu;
                const ch = Math.min(1, Math.max(0, (0.036 * pxu - cd) * 0.6 + 0.5)) * 0.8;
                fr2 += (CHEEK[0] - fr2) * ch; fg += (CHEEK[1] - fg) * ch; fb += (CHEEK[2] - fb) * ch;
              }
              // eyes (black: unlit LEDs in the lit face), with eyelids
              for (let k = -1; k <= 1; k += 2) {
                const ex = (sx - k * 0.063) / eyeR, eyy = ly - 0.27;
                const open = 1 - blink;
                let e;
                if (open > 0.25) {
                  const ey = eyy / (eyeR * 1.25 * open), er = Math.sqrt(ex * ex + ey * ey);
                  e = Math.min(1, Math.max(0, (1 - er) * eyeR * pxu + 0.6));
                } else {
                  // closed: a lash curve
                  const ly2 = eyy - 0.006 * (1 - ex * ex);
                  e = Math.abs(ex) < 1.2 ? Math.min(1, Math.max(0, 1.0 - Math.abs(ly2) * pxu * 1.6)) : 0;
                }
                fr2 *= 1 - e; fg *= 1 - e; fb *= 1 - e;
              }
              // mouth
              const mx = sx / 0.024, my = (ly - 0.338) / 0.013, md = Math.sqrt(mx * mx + my * my);
              const mo = Math.min(1, Math.max(0, (1 - md) * 0.013 * pxu + 0.5));
              fr2 += (MOUTH[0] - fr2) * mo; fg += (MOUTH[1] - fg) * mo; fb += (MOUTH[2] - fb) * mo;
            }
            fr2 += (HAIR[0] - fr2) * hair; fg += (HAIR[1] - fg) * hair; fb += (HAIR[2] - fb) * hair;
            r += (fr2 - r) * inFace; g += (fg - g) * inFace; b += (fb - b) * inFace;
          }
        } else {
          // ---- body: red sarafan, gold flowers, black lacquer apron
          r = pal.body[0]; g = pal.body[1]; b = pal.body[2];
          if (!small) {
            const u = (lonR * 7) / 6.2832 + 0.5, ui = Math.floor(u), row = (ly - 0.5) / 0.16 + (ui & 1) * 0.5;
            const du = (u - ui - 0.5) * (6.2832 / 7) * hw * cosV * pxu, dv = (row - Math.floor(row) - 0.5) * 0.16 * pxu;
            const dd = Math.sqrt(du * du + dv * dv), ang = Math.atan2(dv, du);
            const petal = (1.0 + 0.7 * Math.cos(5 * ang)) * (0.6 + 0.4 * cosV);
            const fl = Math.min(1, Math.max(0, petal - dd)) * 0.85;
            if (fl > 0) { const F = pal.flower; r += (F[0] - r) * fl; g += (F[1] - g) * fl; b += (F[2] - b) * fl; gold = fl * F[1] * 2; }
          }
          const hem = Math.min(1, Math.max(0, (ly - 0.955) * pxu + 0.5));
          if (hem > 0) { r += (pal.trim[0] - r) * hem; g += (pal.trim[1] - g) * hem; b += (pal.trim[2] - b) * hem; gold = hem; }
          if (front && !small) {
            const ex = sx / arx, ey = (ly - acy) / ary, k0 = Math.sqrt(ex * ex + ey * ey);
            const ed = (k0 - 1) * (arx < ary ? arx : ary) * pxu;          // px from the apron edge (+ outside)
            const inA = Math.min(1, Math.max(0, 0.5 - (ed + 0.2) * 1.0 / Math.max(0.35, cR)));
            if (inA > 0) {
              // black lacquer, gold rim, numerals
              let ar = 0, ag = 0, ab = 0, ag_ = 0;
              // no gilded rim (a numeral-sized ring would read as a 0): a dark-red keyline instead
              const rim = Math.min(1, Math.max(0, 1.0 - Math.abs(ed + 0.9) * 1.2)) * 0.5;
              ar = pal.body[0] * 0.35 * rim; ag = pal.body[1] * 0.35 * rim; ab = pal.body[2] * 0.35 * rim;
              if (m0 || m1) {
                const v = (ly - dy0) * gs;
                const m = sx < 0 ? m0 : m1;
                if (m) {
                  const u = (sx - (sx < 0 ? dx0 : dx0 + gw + gap)) * gs;
                  sample(m, u, v, smp);
                  const gg = smp[0], gc = smp[1], rr = smp[2];
                  ar += GOLD_D[0] * gg + (GOLD_L[0] - GOLD_D[0]) * gc + BERRY[0] * rr;
                  ag += GOLD_D[1] * gg + (GOLD_L[1] - GOLD_D[1]) * gc + BERRY[1] * rr;
                  ab += GOLD_D[2] * gg + (GOLD_L[2] - GOLD_D[2]) * gc + BERRY[2] * rr;
                  ag_ += gg;
                }
              } else if (!tiny) {
                // a baby's apron: three rowan berries on a gold sprig
                const ax = sx / 0.2, ay = (ly - acy) / 0.2;
                for (let k = 0; k < 3; k++) {
                  const bx = ax - (k - 1) * 0.6, by = ay + 0.05 - (k === 1 ? 0.3 : 0);
                  const bd = Math.sqrt(bx * bx + by * by) * 0.2 * pxu;
                  const bb = Math.min(1, Math.max(0, 0.05 * pxu - bd + 0.5));
                  ar += BERRY[0] * bb; ag += BERRY[1] * bb; ab += BERRY[2] * bb;
                }
                const lf = Math.min(1, Math.max(0, 0.9 - Math.abs(ay - 0.55 - 0.25 * ax * ax) * 0.2 * pxu)) * (Math.abs(ax) < 0.9 ? 1 : 0);
                ar += GOLD_D[0] * lf; ag += GOLD_D[1] * lf; ab += GOLD_D[2] * lf; ag_ += lf;
              }
              r += (ar - r) * inA; g += (ag - g) * inA; b += (ab - b) * inA; apr = inA;
              gold = gold * (1 - inA) + ag_ * inA;
            }
          }
        }
        // lacquer: soft light from the upper left, a glossy streak, a dark limb
        const lam = 0.62 + 0.38 * Math.max(0, Math.cos(lonV + 0.55));
        const shade = lam * (0.72 + 0.28 * cosV);
        const gl = 1 + 0.9 * Math.exp(-(((px - 0.5 * py - it.glint) / 9) ** 2));
        const gm = 1 + (gl - 1) * gold;
        const goldLift = 0.55 + 0.45 * gold;     // gilding reflects more evenly than paint
        const sh2 = shade + (1 - shade) * gold * 0.55;
        r *= sh2 * gm; g *= sh2 * gm; b *= sh2 * gm;
        const w = lonV + 0.62, sp = Math.exp(-w * w * 60) * 0.28 * goldLift * (1 - 0.8 * apr);
        r += sp * 0.9; g += sp * 0.8; b += sp * 0.7;
        // the seam between the halves when closed
        if (part === 0) {
          const sd2 = Math.abs(ly - lip) * pxu;
          if (sd2 < 0.9) { const k = 0.35 + 0.65 * sd2 / 0.9; r *= k; g *= k; b *= k; }
        }
      }
      cov = cov > 1 ? 1 : cov;
      const o = 3 * (py * W + px);
      img[o] += (r * dim - img[o]) * cov; img[o + 1] += (g * dim - img[o + 1]) * cov; img[o + 2] += (b * dim - img[o + 2]) * cov;
    }
  }
}
