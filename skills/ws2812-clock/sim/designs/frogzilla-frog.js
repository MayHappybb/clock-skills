// The kaiju: a rainbow frog in round glasses, about 40 LEDs wide and 26 tall
// above the bay, drawn as signed-distance shapes with coverage so every part
// glides between LEDs. paintFrog() composites it over the RGB raster `img`.
import * as kit from '../js/kit.js';

const W = 64;
export const BAY = 30.5;          // the frog stands in the bay: nothing of it below this row

// rainbow skin LUT (linear), 256 hues
const LUT = new Float32Array(256 * 3);
for (let i = 0; i < 256; i++) { const c = kit.hsv(i / 256, 0.8, 1); LUT.set(c, 3 * i); }
export const rainbow = (h, out, k) => {
  const j = 3 * ((((h % 1) + 1) % 1 * 256) | 0);
  out[0] = LUT[j] * k; out[1] = LUT[j + 1] * k; out[2] = LUT[j + 2] * k;
};

const ell = (x, y, rx, ry) => (Math.hypot(x / rx, y / ry) - 1) * Math.min(rx, ry);
const cov = (d) => (d <= -0.5 ? 1 : d >= 0.5 ? 0 : 0.5 - d);
function segD(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
  let t = ((px - ax) * dx + (py - ay) * dy) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

const SKIN = 0.42, CREAM = kit.hex('#e8e2cc').map((v) => v * 0.42), RIM = [0.006, 0.006, 0.01], RIMHI = kit.hex('#dfe8ff').map((v) => v * 0.35);
const MOUTH = [0.05, 0.004, 0.008], TONGUE = kit.hex('#ff6f8a').map((v) => v * 0.28);
const BLUSH = kit.hex('#ff4f8a').map((v) => v * 0.22), UNDER = [0.035, 0.02, 0.008];
const sk = new Float32Array(3);

/**
 * p: { fx, fy, sc, breath, lookX, lookY, open, happy, squeeze, pupil, mouth,
 *      mouthO, blush, fu, gdy, hue, arm: null | { side, hx, hy } , spot: null | {x, y, a} }
 */
export function paintFrog(img, p) {
  const { fx, fy, sc } = p, ry = 10 * p.breath, fu = p.fu, ey = -7.5 + fu, gy = ey + p.gdy;
  const x0 = Math.max(0, Math.floor(fx - 21 * sc)), x1 = Math.min(W - 1, Math.ceil(fx + 21 * sc));
  const arm = p.arm;
  let sx = 0, sy = 0, ax = 0, ay = 0;
  if (arm) { sx = fx + arm.side * 12 * sc; sy = fy + 8.5 * sc; ax = arm.hx; ay = arm.hy; }
  const look = 1.25, plx = p.lookX * look, ply = p.lookY * look * 0.8;
  for (let y = 0; y < BAY; y++) {
    const Y = (y - fy) / sc, clipB = Math.min(1, BAY - y);
    for (let x = x0; x <= x1; x++) {
      const X = (x - fx) / sc;
      const dH = ell(X, Y, 14.5, ry), dB = ell(X, Y - 12.5, 17.5, 9.5);
      const dEl = Math.hypot(X + 7.5, Y - ey) - 5.6, dEr = Math.hypot(X - 7.5, Y - ey) - 5.6;
      const d = Math.min(dH, dB, dEl, dEr) * sc;
      let dA = 9;
      if (arm) dA = Math.min(segD(x, y, sx, sy, ax, ay) - 1.7 * sc, Math.hypot(x - ax, y - ay) - 2.2 * sc);
      const cS = cov(d) * clipB, cA = cov(dA - 0.8) * clipB;
      if (cS <= 0 && cA <= 0) continue;
      const o = 3 * (y * W + x);
      let r = img[o], g = img[o + 1], b = img[o + 2];
      if (cS > 0) {
        // skin: rainbow running diagonally, shaded as a soft ball lit from above-left
        const inBody = dB < Math.min(dH, dEl, dEr);
        const q = inBody ? Math.hypot(X / 17.5, (Y - 12.5) / 9.5) : Math.min(Math.hypot((X + 2) / 14.5, (Y + 2) / ry), Math.hypot((X + 7.5) / 5.6, (Y - ey) / 5.6), Math.hypot((X - 7.5) / 5.6, (Y - ey) / 5.6));
        let lt = 0.42 + 0.58 * Math.sqrt(Math.max(0, 1 - q * q));
        if (inBody) lt *= 0.6;
        rainbow(p.hue + X * 0.026 - Y * 0.016, sk, SKIN * lt);
        let cr = sk[0], cg = sk[1], cb = sk[2];
        // pale chin
        const ch = cov(ell(X, Y - 6.5, 9, 3.6) * sc + 0.5) * 0.45;
        cr += (CREAM[0] * 0.6 - cr) * ch; cg += (CREAM[1] * 0.6 - cg) * ch; cb += (CREAM[2] * 0.6 - cb) * ch;
        // city glow from below
        const u = kit.clamp((y - fy - 2) / 10);
        cr += UNDER[0] * u; cg += UNDER[1] * u; cb += UNDER[2] * u;
        // eye sockets: a darker crease where each bulge meets the head
        if (dH < 0.5 && !inBody) for (let ex = -7.5; ex <= 7.5; ex += 15) {
          const e = Math.abs(Math.hypot(X - ex, Y - ey) - 5.6) * sc;
          if (e < 0.9 && Y > ey + 1.5) { const k = (1 - e / 0.9) * 0.45; cr *= 1 - k; cg *= 1 - k; cb *= 1 - k; }
        }
        // spotlight from the helicopter
        if (p.spot) {
          const sd = Math.hypot(x - p.spot.x, y - p.spot.y);
          if (sd < 4.5) { const k = p.spot.a * (1 - sd / 4.5); cr += 0.12 * k; cg += 0.12 * k; cb += 0.11 * k; }
        }
        // eyes
        for (let side = -1; side <= 1; side += 2) {
          const ex = 7.5 * side, exl = X - ex, eyl = Y - ey, de = Math.hypot(exl, eyl);
          if (de > 4.6) continue;
          const cw = cov((de - 3.4) * sc);
          if (cw > 0) {
            const lid = ey - 3.4 + 6.8 * (1 - p.open);  // lid line (head units)
            const lidCov = kit.clamp((lid - Y) * sc + 0.5);
            // eye white, pupil and catchlight
            let er = CREAM[0], eg = CREAM[1], eb = CREAM[2];
            const cx = plx - side * (p.cross || 0) * 1.5;   // cross-eyed after a miss
            const pd = Math.hypot(exl - cx, eyl - ply) - 1.75 * p.pupil;
            const pc = cov(pd * sc);
            er *= 1 - pc; eg *= 1 - pc; eb *= 1 - pc;
            const cl = cov((Math.hypot(exl - cx + 0.8, eyl - ply + 0.9) - 0.55) * sc) * pc;
            er += 0.5 * cl; eg += 0.5 * cl; eb += 0.48 * cl;
            // closed: lid (skin) with a dark lash line; happy: an upward arc
            const lr = sk[0] * 1.1, lg = sk[1] * 1.1, lb = sk[2] * 1.1;
            er += (lr - er) * lidCov; eg += (lg - eg) * lidCov; eb += (lb - eb) * lidCov;
            const lash = (1 - Math.min(1, Math.abs((Y - lid) * sc) / 0.7)) * (p.open < 0.98 ? 1 : 0) * (1 - p.happy) * (1 - p.squeeze);
            const k1 = Math.max(0, lash) * 0.8;
            er *= 1 - k1; eg *= 1 - k1; eb *= 1 - k1;
            if (p.happy > 0) {
              const ad = Math.abs(Math.hypot(exl, eyl - 1.6) - 2.6) * sc;
              const ac = (ad < 0.75 ? 1 - ad / 0.75 : 0) * (eyl < 1.4 ? 1 : 0) * p.happy;
              er *= 1 - ac; eg *= 1 - ac; eb *= 1 - ac;
            }
            if (p.squeeze > 0) {  // > <  squeezed shut
              const ad = segD(exl * side, eyl, -2.2, -1.6, 1.2, 0) * sc, ad2 = segD(exl * side, eyl, -2.2, 1.6, 1.2, 0) * sc;
              const ac = Math.max(0, 1 - Math.min(ad, ad2) / 0.7) * p.squeeze;
              er *= 1 - ac; eg *= 1 - ac; eb *= 1 - ac;
            }
            cr += (er - cr) * cw; cg += (eg - cg) * cw; cb += (eb - cb) * cw;
          }
        }
        // round glasses
        for (let side = -1; side <= 1; side += 2) {
          const gx = X - 7.5 * side, gyl = Y - gy, dg = Math.hypot(gx, gyl);
          const rc = cov((Math.abs(dg - 4.45) - 0.6) * sc);
          if (dg < 3.9) { // lens: faint tint and a travelling glint
            const gp = ((p.glint % 1) * 14 - 7);
            const gl = Math.max(0, 1 - Math.abs(gx + gyl * 0.8 - gp) / 0.8) * 0.18;
            cr += 0.004 + gl; cg += 0.006 + gl; cb += 0.012 + gl;
          }
          if (rc > 0) {
            const hi = gx * side * 0.3 + gx + gyl < -3.2 && dg > 4.2 ? 0.8 : 0;   // lit edge of the frame, upper left
            const fr = RIM[0] + (RIMHI[0] - RIM[0]) * hi, fg = RIM[1] + (RIMHI[1] - RIM[1]) * hi, fb = RIM[2] + (RIMHI[2] - RIM[2]) * hi;
            cr += (fr - cr) * rc; cg += (fg - cg) * rc; cb += (fb - cb) * rc;
          }
        }
        {
          const db = Math.min(segD(X, Y, -3.2, gy - 0.6, 0, gy - 1.4), segD(X, Y, 0, gy - 1.4, 3.2, gy - 0.6),
            segD(X, Y, -11.8, gy - 1, -14.2, gy + 1.5), segD(X, Y, 11.8, gy - 1, 14.2, gy + 1.5));
          const bc = cov((db - 0.55) * sc);
          if (bc > 0) { cr += (RIM[0] - cr) * bc; cg += (RIM[1] - cg) * bc; cb += (RIM[2] - cb) * bc; }
        }
        // nostrils
        for (let nx = -1.6; nx <= 1.6; nx += 3.2) {
          const nc = cov((Math.hypot(X - nx, Y - (-0.6 + fu)) - 0.45) * sc) * 0.7;
          cr *= 1 - nc; cg *= 1 - nc; cb *= 1 - nc;
        }
        // mouth: a wide smile, an 'o' of surprise, or a roar
        const my = 2.8 + fu;
        if (p.mouth > 0.02) {
          const mo = ell(X, Y - my - 1.2 * p.mouth, 1.5 + 6 * p.mouth, 0.5 + 3.6 * p.mouth) * sc;
          const mc = cov(mo);
          if (mc > 0) {
            const tg = cov(ell(X, Y - my - 3.4 * p.mouth, 3.5 * p.mouth + 0.3, 1.5 * p.mouth + 0.2) * sc);
            const mr = MOUTH[0] + (TONGUE[0] - MOUTH[0]) * tg, mg = MOUTH[1] + (TONGUE[1] - MOUTH[1]) * tg, mb = MOUTH[2] + (TONGUE[2] - MOUTH[2]) * tg;
            cr += (mr - cr) * mc; cg += (mg - cg) * mc; cb += (mb - cb) * mc;
          }
        } else if (p.mouthO > 0.02) {
          const mc = cov(ell(X, Y - my - 0.8, 1.2 + 0.6 * p.mouthO, 0.6 + 1.2 * p.mouthO) * sc) * Math.min(1, p.mouthO * 2);
          cr += (MOUTH[0] - cr) * mc; cg += (MOUTH[1] - cg) * mc; cb += (MOUTH[2] - cb) * mc;
        }
        if (p.mouth <= 0.3 && p.mouthO < 0.5) {
          const w = 9 * (1 - p.mouthO);
          if (Math.abs(X) < w) {
            const sm = Math.abs(Y - (my + 1.2 - 0.026 * X * X)) * sc;
            const k = Math.max(0, 1.25 - sm / 0.9) * 0.95 * (1 - p.mouth / 0.3) * Math.min(1, (w - Math.abs(X)) * 1.5);
            cr *= 1 - k; cg *= 1 - k; cb *= 1 - k;
          }
        }
        // cheeks
        if (p.blush > 0) for (let bx = -10.3; bx <= 10.3; bx += 20.6) {
          const bc = Math.max(0, 1 - Math.hypot((X - bx) / 2.7, (Y - 1.8 - fu) / 1.5)) * p.blush;
          if (bc > 0) { cr += BLUSH[0] * bc; cg += BLUSH[1] * bc; cb += BLUSH[2] * bc; }
        }
        r += (cr - r) * cS; g += (cg - g) * cS; b += (cb - b) * cS;
      }
      if (cA > 0) {
        // the arm, with a dark outline so it reads against the head
        const ao = cA, ai = cov(dA) * clipB;
        r *= 1 - ao * 0.85; g *= 1 - ao * 0.85; b *= 1 - ao * 0.85;
        rainbow(p.hue + (x - fx) * 0.026 - (y - fy) * 0.016, sk, SKIN * 0.85);
        r += (sk[0] - r) * ai; g += (sk[1] - g) * ai; b += (sk[2] - b) * ai;
      }
      img[o] = r; img[o + 1] = g; img[o + 2] = b;
    }
  }
}

/** Coverage of the frog's silhouette at pixel (x, y), for occluding the helicopter. */
export function frogCover(p, x, y) {
  if (y >= BAY) return 0;
  const X = (x - p.fx) / p.sc, Y = (y - p.fy) / p.sc, ey = -7.5 + p.fu;
  const d = Math.min(ell(X, Y, 14.5, 10 * p.breath), ell(X, Y - 12.5, 17.5, 9.5), Math.hypot(X + 7.5, Y - ey) - 5.6, Math.hypot(X - 7.5, Y - ey) - 5.6) * p.sc;
  return cov(d);
}
