// Griddle: drawing into a w x h linear-RGB raster. Pancakes are discs seen
// from about 58 degrees up; flipping one turns it about its horizontal axis,
// so its squash f = sin(58deg + theta) runs through zero (edge on) to
// negative (the browned underside). Everything is coverage-antialiased.
import * as kit from '../js/kit.js';
import { glyph, GW, GH, GPX, GM } from './griddle-glyphs.js';

export const ELEV = Math.asin(0.85);
const H = kit.hex;
export const COL = {
  cream: H('#ecd08c'), gold: H('#ecb55c'), toast: H('#c98634'),
  fresh: H('#f4e0a8'), tan: H('#c8843a'), brown0: H('#2e1204'), brown1: H('#5e2a0a'),
  under: H('#e09a44'), underD: H('#a85a1e'), side: H('#e6aa54'), crust: H('#94501a'),
  syrup: H('#2a0801'), syrupMid: H('#7a2404'), syrupHi: H('#ffd49a'),
  plate: H('#d8d0c0'), steel: H('#8c9098'), butter: H('#ffe98a'),
  bottle: H('#d8301c'), cap: H('#f2ece0'), wood: H('#7a4a28'),
};

// ------------------------------------------------------------ raster ops
export class Raster {
  constructor(w, h, mask) { this.w = w; this.h = h; this.img = new Float32Array(3 * w * h); this.mask = mask; }
  clear() { this.img.fill(0); }
  /** paint over: blend pixel p toward c by a */
  over(x, y, c0, c1, c2, a) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || a <= 0) return;
    const p = 3 * (y * this.w + x), o = this.img;
    if (a >= 1) { o[p] = c0; o[p + 1] = c1; o[p + 2] = c2; return; }
    o[p] += (c0 - o[p]) * a; o[p + 1] += (c1 - o[p + 1]) * a; o[p + 2] += (c2 - o[p + 2]) * a;
  }
  add(x, y, c0, c1, c2) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const p = 3 * (y * this.w + x), o = this.img;
    o[p] += c0; o[p + 1] += c1; o[p + 2] += c2;
  }
}

// --------------------------------------------------------- glyph sampling
// A "place" puts digit d on a pancake: plane position u0, v0 of the glyph
// box's top-left, plane units per glyph unit s, and its share of the piping
// timeline [t0, t1].
export const place = (d, u0, v0, s, t0, t1) => ({ d, u0, v0, s, t0, t1 });
/** Layout of a number on a pancake (1 or 2 digits). */
export function layoutNum(str, big) {
  if (str.length === 1) {
    const s = big ? 0.09 : 0.074;
    return [place(+str, -5 * s, -8 * s, s, 0, 1)];
  }
  const s = 0.074;
  return [place(+str[0], -0.77, -0.6, s, 0, 0.5), place(+str[1], 0.03, -0.6, s, 0.5, 1)];
}

// sample results (module scope: no allocation per pixel)
export const S = { e: 9, hw: 1, tau: 0, s: 0.07 };
export function sampleLines(places, u, v) {
  S.e = 9; S.hw = 1; S.tau = 0;
  for (let i = 0; i < places.length; i++) {
    const P = places[i];
    const tx = ((u - P.u0) / P.s + GM) * GPX, ty = ((v - P.v0) / P.s + GM) * GPX;
    if (tx < 0 || ty < 0 || tx >= GW - 1 || ty >= GH - 1) continue;
    const g = glyph(P.d), x0 = tx | 0, y0 = ty | 0, fx = tx - x0, fy = ty - y0, k = y0 * GW + x0;
    const E = g.E;
    const e = (E[k] * (1 - fx) + E[k + 1] * fx) * (1 - fy) + (E[k + GW] * (1 - fx) + E[k + GW + 1] * fx) * fy;
    if (e < S.e) {
      const kn = (fy < 0.5 ? k : k + GW) + (fx < 0.5 ? 0 : 1);
      S.e = e; S.hw = g.HW[kn]; S.tau = P.t0 + (P.t1 - P.t0) * g.TAU[kn]; S.s = P.s;
    }
  }
}


// ---------------------------------------------------------------- pancake
/** A pancake's full state; one shape for all of them (monomorphic). */
export function pancake() {
  return {
    cx: 0, cy: 0, R: 30, th: 0, T: 3, seed: 0,
    places: null, tauNow: 1, tNow: 0, drawT0: -99, drawDur: 1, fillR: 1.2, cook: 0.5,
    syrup: null, syrupTau: -1, spread: 1, shade: 1,
  };
}

const sst = kit.smoothstep;
/**
 * Draw pancake P. Face A (f > 0) is the art side: piped lines on fill
 * batter. Face B (f < 0) is the browned underside, optionally with syrup
 * lines (the hour, written on the top of the stack).
 */
export function drawPancake(Rs, P, now) {
  const phi = ELEV + P.th, f = Math.sin(phi), off = P.T * Math.cos(phi) * (f < 0 ? -1 : 1);
  const af = Math.max(Math.abs(f), 0.015), Rr = P.R, img = Rs.img, W = Rs.w, mask = Rs.mask;
  const sideK = P.places && f > 0 ? sst(0.95, 1.15, P.fillR) : 1;
  const x0 = Math.max(0, Math.floor(P.cx - Rr * 1.06)), x1 = Math.min(W - 1, Math.ceil(P.cx + Rr * 1.06));
  const y0 = Math.max(0, Math.floor(P.cy - Rr * af * 1.06 + Math.min(0, off) - 1));
  const y1 = Math.min(Rs.h - 1, Math.ceil(P.cy + Rr * af * 1.06 + Math.max(0, off) + 1));
  const offLo = Math.min(0, off), offHi = Math.max(0, off), seed = P.seed, sh = P.shade;
  const C = COL, faceA = f > 0;
  for (let y = y0; y <= y1; y++) {
    const dy = y - P.cy;
    for (let x = x0; x <= x1; x++) {
      const p = y * W + x;
      if (!mask[p]) continue;
      const dx = x - P.cx, u = dx / Rr;
      if (u > 1.07 || u < -1.07) continue;
      const v = dy / (Rr * (faceA ? af : -af));
      const r = Math.sqrt(u * u + v * v), a = Math.atan2(v, u);
      const rr = 1 + 0.022 * Math.sin(3 * a + seed) + 0.016 * Math.sin(7 * a + 2 * seed);
      const scaleR = Rr * Math.sqrt(u * u + af * af * v * v) / Math.max(r, 1e-3);
      const covF = kit.clamp((rr - r) * scaleR + 0.5);
      // the rim between the two faces
      let covS = 0;
      if (sideK > 0 && P.T > 0.3) {
        const q = rr * rr - u * u;
        if (q > 0) {
          const hs = Rr * af * Math.sqrt(q);
          covS = kit.clamp(Math.min(dy - (offLo - hs), (offHi + hs) - dy) + 0.5) * kit.clamp((rr - Math.abs(u)) * Rr + 0.5) * sideK;
        }
      }
      if (covF <= 0 && covS <= 0) continue;
      const o = 3 * p;
      if (covS > 0) {
        // crust: paler where the band faces us, darker at the turn
        const lit = (0.45 + 0.55 * Math.sqrt(Math.max(0, 1 - u * u)) - 0.12 * u) * sh;
        const n = 0.85 + 0.3 * kit.noise2(u * 9 + seed, dy * 0.4);
        const k = lit * n;
        const c0 = kit.lerp(C.crust[0], C.side[0], 0.5) * k, c1 = kit.lerp(C.crust[1], C.side[1], 0.5) * k, c2 = kit.lerp(C.crust[2], C.side[2], 0.5) * k;
        img[o] += (c0 - img[o]) * covS; img[o + 1] += (c1 - img[o + 1]) * covS; img[o + 2] += (c2 - img[o + 2]) * covS;
      }
      if (covF <= 0) continue;
      let cr, cg, cb, al;
      const lightK = sh * (1.02 - 0.1 * u - 0.08 * (faceA ? v : -v));
      if (faceA) {
        // fill batter: floods out from the middle; sets from cream to gold
        const rf = P.fillR * rr;
        const fillCov = P.fillR > 0 ? kit.clamp((rf - r) * scaleR * 0.7 + 0.5) : 0;
        const n = kit.noise2(u * 4.5 + seed, v * 4.5 - seed);
        const ck = kit.clamp(0.85 * P.cook + 0.18 * (n - 0.5));
        let fr = kit.lerp(C.cream[0], C.gold[0], ck), fg = kit.lerp(C.cream[1], C.gold[1], ck), fb = kit.lerp(C.cream[2], C.gold[2], ck);
        const rim = sst(0.84 * rr, rr, r) * (0.2 + 0.4 * P.cook);
        fr = kit.lerp(fr, C.toast[0], rim); fg = kit.lerp(fg, C.toast[1], rim); fb = kit.lerp(fb, C.toast[2], rim);
        // the wet lip of the spreading flood
        if (P.fillR < 1.15) { const lp = Math.exp(-(((r - rf) * scaleR) ** 2) / 1.4) * 0.35; fr += lp; fg += lp; fb += lp * 0.8; }
        // lines
        let lc = 0, lr = 0, lg = 0, lb = 0;
        if (P.places) {
          sampleLines(P.places, u, v);
          if (S.e < 1.5 && S.tau <= P.tauNow) {
            const pxu = S.s * Rr * (0.55 + 0.45 * af);
            lc = kit.clamp(0.5 - S.e * pxu);
            if (lc > 0) {
              const age = P.tNow - (P.drawT0 + S.tau * P.drawDur);
              // fresh batter browns to tan on the hot steel; once the pale
              // fill floods round it, it reads as the dark pancake-art line
              const bk = kit.clamp((rf - r) * 5 + 0.2) * sst(0.0, 0.6, age);
              const b1 = sst(0.0, 0.7, age) * 0.55;
              const dark = 0.2 + 0.8 * S.tau;  // first drawn is darkest
              let br = kit.lerp(C.brown0[0], C.brown1[0], dark), bg = kit.lerp(C.brown0[1], C.brown1[1], dark), bb = kit.lerp(C.brown0[2], C.brown1[2], dark);
              // a browned outline round a slightly paler core
              const edge = sst(-S.hw * 0.7, 0.1, S.e);
              const ek = 1.25 - 0.6 * edge;
              br *= ek; bg *= ek; bb *= ek;
              const t0 = kit.lerp(C.fresh[0], C.tan[0], b1), t1 = kit.lerp(C.fresh[1], C.tan[1], b1), t2 = kit.lerp(C.fresh[2], C.tan[2], b1);
              lr = kit.lerp(t0, br, bk); lg = kit.lerp(t1, bg, bk); lb = kit.lerp(t2, bb, bk);
            }
          }
        }
        al = Math.max(fillCov, lc);
        if (al <= 0) continue;
        const fw = fillCov * (1 - lc);
        cr = (lr * lc + fr * fw) / al; cg = (lg * lc + fg * fw) / al; cb = (lb * lc + fb * fw) / al;
      } else {
        // underside: lacy browning
        const n = kit.noise2(u * 6 + seed, v * 6 + 3) * 0.65 + kit.noise2(u * 15 - seed, v * 15) * 0.35;
        const k = sst(0.5, 0.85, n) * 0.45 + sst(0.8 * rr, rr, r) * 0.4;
        cr = kit.lerp(C.under[0], C.underD[0], k); cg = kit.lerp(C.under[1], C.underD[1], k); cb = kit.lerp(C.under[2], C.underD[2], k);
        al = 1;
        if (P.syrup && P.syrupTau > 0) {
          sampleLines(P.syrup, u, -v);
          const e = S.e - S.hw * (P.spread - 1);
          if (e < 1.5 && S.tau <= P.syrupTau) {
            const pxu = S.s * Rr * (0.55 + 0.45 * af);
            const sc = kit.clamp(0.5 - e * pxu);
            if (sc > 0) {
              const inner = sst(-S.hw * P.spread, 0, e);
              let sr = kit.lerp(C.syrup[0], C.syrupMid[0], inner), sg = kit.lerp(C.syrup[1], C.syrupMid[1], inner), sb = kit.lerp(C.syrup[2], C.syrupMid[2], inner);
              // a glint sliding along the glossy syrup
              const g = Math.max(0, Math.sin(u * 7 - v * 4 - now * 0.9 + seed)) ** 10 * (1 - inner) * 0.7;
              sr += C.syrupHi[0] * g; sg += C.syrupHi[1] * g; sb += C.syrupHi[2] * g;
              cr = kit.lerp(cr, sr, sc); cg = kit.lerp(cg, sg, sc); cb = kit.lerp(cb, sb, sc);
            }
          }
        }
      }
      cr *= lightK; cg *= lightK; cb *= lightK;
      const A = covF * al;
      img[o] += (cr - img[o]) * A; img[o + 1] += (cg - img[o + 1]) * A; img[o + 2] += (cb - img[o + 2]) * A;
    }
  }
}

/** The visible rim band of a lower stack layer (top face hidden by the one above). */
export function drawBand(Rs, cx, cy, Rr, T, seed, sh) {
  const img = Rs.img, W = Rs.w, mask = Rs.mask, C = COL;
  const x0 = Math.max(0, Math.floor(cx - Rr)), x1 = Math.min(W - 1, Math.ceil(cx + Rr));
  for (let x = x0; x <= x1; x++) {
    const u = (x - cx) / Rr, q = 1 - u * u;
    if (q <= 0) continue;
    const hs = Rr * 0.85 * Math.sqrt(q), yA = cy + hs, yB = yA + T;
    const hx = kit.clamp((1 - Math.abs(u)) * Rr + 0.5);
    const lit = (0.45 + 0.55 * Math.sqrt(q) - 0.12 * u) * sh;
    for (let y = Math.floor(yA - 2.5); y <= Math.ceil(yB + 0.5); y++) {
      if (y < 0 || y >= Rs.h) continue;
      const p = y * W + x;
      if (!mask[p]) continue;
      const cov = kit.clamp(Math.min(y + 0.5, yB) - Math.max(y - 0.5, yA - 2)) * hx;
      if (cov <= 0) continue;
      const t = kit.clamp((y - yA) / T);
      // crust at the top and bottom, fluffy crumb in between, a dark seam under
      const crumb = Math.sin(Math.PI * kit.clamp(t)) ** 0.7;
      const seam = sst(0.82, 1.0, t);
      const n = 0.88 + 0.24 * kit.noise2(x * 0.7 + seed, y * 0.5);
      const k = lit * n * (1 - 0.65 * seam);
      const cr = kit.lerp(C.crust[0], C.side[0], crumb) * k, cg = kit.lerp(C.crust[1], C.side[1], crumb) * k, cb = kit.lerp(C.crust[2], C.side[2], crumb) * k;
      const o = 3 * p;
      img[o] += (cr - img[o]) * cov; img[o + 1] += (cg - img[o + 1]) * cov; img[o + 2] += (cb - img[o + 2]) * cov;
    }
  }
}

/** A white plate at the same tilt: rim brighter than the well. */
export function drawPlate(Rs, cx, cy, Rr, k) {
  const img = Rs.img, W = Rs.w, mask = Rs.mask, P = COL.plate, f = 0.85;
  for (let y = Math.max(0, Math.floor(cy - Rr * f - 1)); y <= Math.min(Rs.h - 1, Math.ceil(cy + Rr * f + 3)); y++) {
    for (let x = Math.max(0, Math.floor(cx - Rr - 1)); x <= Math.min(W - 1, Math.ceil(cx + Rr + 1)); x++) {
      const p = y * W + x;
      if (!mask[p]) continue;
      const u = (x - cx) / Rr, v = (y - cy) / (Rr * f), r = Math.hypot(u, v);
      const vs = (y - cy - 2.2) / (Rr * f), rs = Math.hypot(u, vs);
      const cov = kit.clamp((1 - r) * Rr * 0.8 + 0.5), covS = kit.clamp((1 - rs) * Rr * 0.8 + 0.5);
      if (cov <= 0 && covS <= 0) continue;
      const o = 3 * p;
      if (covS > 0 && cov < 1) {
        const s = 0.35 * k * covS * (1 - cov);
        img[o] += (P[0] * s - img[o]) * covS; img[o + 1] += (P[1] * s - img[o + 1]) * covS; img[o + 2] += (P[2] * s - img[o + 2]) * covS;
      }
      if (cov > 0) {
        const rim = sst(0.72, 0.8, r) * (1 - sst(0.94, 1, r) * 0.4);
        const s = k * (0.2 + 0.32 * rim) * (1.05 - 0.2 * u - 0.15 * v);
        img[o] += (P[0] * s - img[o]) * cov; img[o + 1] += (P[1] * s - img[o + 1]) * cov; img[o + 2] += (P[2] * s - img[o + 2]) * cov;
      }
    }
  }
}

/** A soft disc of light added at (x, y). */
export function glow(Rs, x, y, r, c, a) {
  const img = Rs.img, W = Rs.w, mask = Rs.mask;
  for (let py = Math.max(0, Math.floor(y - r)); py <= Math.min(Rs.h - 1, Math.ceil(y + r)); py++) {
    for (let px = Math.max(0, Math.floor(x - r)); px <= Math.min(W - 1, Math.ceil(x + r)); px++) {
      const p = py * W + px;
      if (!mask[p]) continue;
      const d2 = ((px - x) ** 2 + (py - y) ** 2) / (r * r);
      if (d2 >= 1) continue;
      const k = a * (1 - d2) * (1 - d2), o = 3 * p;
      img[o] += c[0] * k; img[o + 1] += c[1] * k; img[o + 2] += c[2] * k;
    }
  }
}

/** A solid round-ended bar from (ax, ay) to (bx, by), radius ra..rb, painted over. */
export function capsule(Rs, ax, ay, bx, by, ra, rb, c, a = 1, hiK = 0) {
  const img = Rs.img, W = Rs.w, mask = Rs.mask, rm = Math.max(ra, rb) + 1;
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-6, L = Math.sqrt(L2);
  const nx = -dy / L, ny = dx / L;
  for (let py = Math.max(0, Math.floor(Math.min(ay, by) - rm)); py <= Math.min(Rs.h - 1, Math.ceil(Math.max(ay, by) + rm)); py++) {
    for (let px = Math.max(0, Math.floor(Math.min(ax, bx) - rm)); px <= Math.min(W - 1, Math.ceil(Math.max(ax, bx) + rm)); px++) {
      const p = py * W + px;
      if (!mask[p]) continue;
      let t = ((px - ax) * dx + (py - ay) * dy) / L2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = px - ax - t * dx, qy = py - ay - t * dy, d = Math.sqrt(qx * qx + qy * qy), rad = ra + (rb - ra) * t;
      const cov = kit.clamp(rad - d + 0.5) * a;
      if (cov <= 0) continue;
      // cylinder shading across the bar, lit from the upper left
      const side = (qx * nx + qy * ny) / Math.max(rad, 0.5);
      const k = 0.75 + 0.3 * side * (nx < 0 ? -1 : 1) * -1 + hiK * Math.max(0, 1 - Math.abs(side + 0.45) * 3);
      const o = 3 * p;
      img[o] += (c[0] * k - img[o]) * cov; img[o + 1] += (c[1] * k - img[o + 1]) * cov; img[o + 2] += (c[2] * k - img[o + 2]) * cov;
    }
  }
}
