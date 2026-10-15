// Cuckoo moving parts: flip cards (the hour plaques and the pendulum's
// minute medallion), the pendulum rod, pinecone weights on chains, the
// door leaves and the frog. All drawn per pixel by inverse mapping into the
// part's own frame, with coverage for anti-aliasing, into scene.img.
import * as kit from '../js/kit.js';
import { W, H, img, over, add, mul, P, LIGHT } from './cuckoo-scene.js';
import { sample, height, S_ } from './cuckoo-glyphs.js';

const clamp = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const L2x = -0.63, L2y = -0.78;
const GRN = new Float32Array(64 * 64);
for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) GRN[y * 64 + x] = kit.fbm(x * 0.09, y * 0.9, 7, 3) - 0.5;
const grainAt = (x, y) => GRN[((Math.floor(y) & 63) << 6) | (Math.floor(x) & 63)];

const WALNUT = kit.hex('#2e1608'), WALNUT_HI = kit.hex('#8c5a2e'), EDGE = kit.hex('#b88a50');
const IV = P.ivory, IVS = P.ivoryShade;

/**
 * A two-sided carved card.
 *  c = { cx, cy, hw, hh, oval, axis (0: flips about a horizontal axis, 1: vertical),
 *        phi (0 shows the front, pi the back), rho (roll), front: [[d, ox, oy, k]...], back, dim }
 * Digit entries: digit d with its em origin at card (ox, oy) px, k px per em.
 */
export function card(c) {
  const f = 150, cp = Math.cos(c.phi), sp = Math.sin(c.phi);
  const cr = Math.cos(c.rho || 0), sr = Math.sin(c.rho || 0);
  const backSide = cp < 0, face = backSide ? c.back : c.front;
  const fs = Math.max(0.12, Math.abs(cp));
  // light on the face: its normal tilts with the flip
  const n3a = backSide ? sp : -sp, n3z = Math.abs(cp);
  const nd = c.axis === 0 ? (n3a * LIGHT[1] + n3z * LIGHT[2]) : (n3a * LIGHT[0] + n3z * LIGHT[2]);
  const fl = (0.3 + 0.7 * Math.max(0, nd)) / (0.3 + 0.7 * LIGHT[2]) * (c.dim ?? 1);
  const R = Math.max(c.hw, c.hh) * 1.35 + 2;
  const x0 = Math.max(0, Math.floor(c.cx - R)), x1 = Math.min(W - 1, Math.ceil(c.cx + R));
  const y0 = Math.max(0, Math.floor(c.cy - R)), y1 = Math.min(H - 1, Math.ceil(c.cy + R));
  const te = 2.6;  // card thickness, px
  for (let Y = y0; Y <= y1; Y++) {
    for (let X = x0; X <= x1; X++) {
      const dx = X + 0.5 - c.cx, dy = Y + 0.5 - c.cy;
      const a = dx * cr - dy * sr, b = dx * sr + dy * cr;      // card-aligned screen offsets
      const along = c.axis === 0 ? b : a, across = c.axis === 0 ? a : b;
      const den = f * cp + along * sp;
      let cov = 0, ex = 0, ey = 0, sd = 9;
      if (Math.abs(den) > 1e-3) {
        const v = (along * f) / den, s = (f - v * sp) / f;
        if (s > 0.2) {
          const vv = backSide ? -v : v, uu = across * s;
          ex = c.axis === 0 ? uu : vv; ey = c.axis === 0 ? vv : uu;
          sd = c.oval ? (Math.hypot(ex / c.hw, ey / c.hh) - 1) * Math.min(c.hw, c.hh)
            : Math.max(Math.abs(ex) - c.hw, Math.abs(ey) - c.hh);
          cov = clamp(0.5 - sd * (c.axis === 0 ? (Math.abs(ex) - c.hw > Math.abs(ey) - c.hh ? 1 : fs) : (Math.abs(ey) - c.hh > Math.abs(ex) - c.hw ? 1 : fs)));
        }
      }
      // the card's edge (its thickness), seen while it turns
      const edgeHalf = 0.5 * te * Math.abs(sp);
      let ecov = 0;
      if (edgeHalf > 0.05 && Math.abs(along) < edgeHalf + 0.5) {
        const lim = c.axis === 0 ? c.hw : c.hh;
        if (c.oval) {
          const q = across / lim; ecov = q * q < 1 ? clamp(edgeHalf + 0.5 - Math.abs(along)) * clamp((1 - Math.abs(q)) * lim * 2) : 0;
        } else ecov = clamp(edgeHalf + 0.5 - Math.abs(along)) * clamp(lim + 0.5 - Math.abs(across));
      }
      if (ecov > 0 && cov < 1) over(X, Y, EDGE[0] * 0.85 * (c.dim ?? 1), EDGE[1] * 0.85 * (c.dim ?? 1), EDGE[2] * 0.85 * (c.dim ?? 1), ecov * (1 - cov));
      if (cov <= 0) continue;
      // face: walnut with grain and a lit bevel
      const g = 1 + 0.5 * grainAt(ex * 1.3 + 7 * c.hw, ey * 0.5 + c.cx);
      let r = WALNUT[0] * g, gg = WALNUT[1] * g, bb = WALNUT[2] * g;
      if (sd > -2.2) {
        let nx, ny;
        if (c.oval) { const l = Math.hypot(ex / (c.hw * c.hw), ey / (c.hh * c.hh)) || 1; nx = ex / (c.hw * c.hw) / l; ny = ey / (c.hh * c.hh) / l; }
        else if (Math.abs(ex) - c.hw > Math.abs(ey) - c.hh) { nx = Math.sign(ex); ny = 0; } else { nx = 0; ny = Math.sign(ey); }
        const lit = -(nx * L2x + ny * L2y) * (1 - Math.abs(sd + 1.1) / 1.1) * 0.5;   // outer bevel faces up-left: lit
        const k = kit.lerp(1, 0.45, 0) + 0.9 * Math.max(-0.5, sd > -1.1 ? -lit : lit) + 0.35;
        r = kit.lerp(r, WALNUT_HI[0], 0.6) * k; gg = kit.lerp(gg, WALNUT_HI[1], 0.6) * k; bb = kit.lerp(bb, WALNUT_HI[2], 0.6) * k;
      }
      // the figures, and their shadows on the wood
      let ia = 0, ir = 0, ig = 0, ib = 0, shad = 0;
      for (let j = 0; j < face.length; j++) {
        const e = face[j], k = e[3], u = (ex - e[1]) / k, w = (ey - e[2]) / k;
        const hs = height(e[0], u - 0.55 / k * 1.6, w - 0.7 / k * 1.6);
        if (hs > -1) shad = Math.max(shad, clamp(hs * k * 0.7 + 0.5));
        const h = sample(e[0], u, w);
        if (h < -0.6) continue;
        const ac = clamp(h * k * fs + 0.5);
        if (ac <= ia) continue;
        const gl = Math.hypot(S_.gx, S_.gy) || 1;
        const lit = clamp(0.5 + 0.62 * (-(S_.gx * L2x + S_.gy * L2y) / gl) * Math.min(1, gl));
        const t = lit * lit;
        ia = ac; ir = IVS[0] + (IV[0] - IVS[0]) * t; ig = IVS[1] + (IV[1] - IVS[1]) * t; ib = IVS[2] + (IV[2] - IVS[2]) * t;
      }
      const sk = 1 - 0.75 * shad;
      r *= sk; gg *= sk; bb *= sk;
      if (ia > 0) { r += (ir - r) * ia; gg += (ig - gg) * ia; bb += (ib - bb) * ia; }
      over(X, Y, r * fl, gg * fl, bb * fl, cov);
    }
  }
}

/** A round rod / capsule, shaded as a cylinder lit from the left. */
export function rod(ax, ay, bx, by, rad, col, dim = 1) {
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - rad - 1)), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + rad + 1));
  const y0 = Math.max(0, Math.floor(Math.min(ay, by) - rad - 1)), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by) + rad + 1));
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy || 1e-9, ln = Math.sqrt(L), nx = -dy / ln, ny = dx / ln;
  for (let Y = y0; Y <= y1; Y++) for (let X = x0; X <= x1; X++) {
    const px = X + 0.5 - ax, py = Y + 0.5 - ay;
    let t = (px * dx + py * dy) / L; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = px - t * dx, ey = py - t * dy, d = Math.sqrt(ex * ex + ey * ey);
    const a = clamp(rad + 0.5 - d);
    if (a <= 0) continue;
    const side = (ex * nx + ey * ny) / (rad + 0.3) * Math.sign(nx * L2x + ny * L2y || 1);
    const k = (0.55 + 0.6 * clamp(0.5 + 0.7 * side)) * dim;
    over(X, Y, col[0] * k, col[1] * k, col[2] * k, a);
  }
}

/** A chain hanging from y0 to y1 at x; links slide with `off` (px). */
export function chain(x, y0, y1, off, dim = 1) {
  const c = P.brass;
  for (let Y = Math.max(0, Math.floor(y0)); Y < Math.min(H, Math.ceil(y1)); Y++) {
    const ph = ((Y + 0.5 - off) / 3) * Math.PI * 2;
    const a = Y + 1 > y1 ? y1 - Y : 1;
    const v = 0.5 + 0.5 * Math.cos(ph), wide = 0.5 + 0.5 * Math.cos(ph + Math.PI);
    const k = (0.25 + 0.6 * v) * dim;
    over(Math.floor(x), Y, c[0] * k, c[1] * k, c[2] * k, a);
    const side = 0.55 * wide * dim;
    add(Math.floor(x) - 1, Y, c[0] * 0.25 * side, c[1] * 0.25 * side, c[2] * 0.25 * side, a);
    add(Math.floor(x) + 1, Y, c[0] * 0.4 * side, c[1] * 0.4 * side, c[2] * 0.4 * side, a);
  }
}

const CONE = kit.hex('#6a3a18'), CONE_HI = kit.hex('#c88a48'), CONE_LO = kit.hex('#200c04');
/** A cast pinecone weight hanging with its top (hook) at (cx, top). */
export function pinecone(cx, top, dim = 1) {
  const cy = top + 9.5, rx = 4.3, ry = 8.2;
  // brass cap and hook
  rod(cx, top - 1.5, cx, top + 1.2, 0.8, P.brass, dim);
  rod(cx - 2.2, top + 1.6, cx + 2.2, top + 1.6, 0.9, P.brass, dim);
  const y0 = Math.max(0, Math.floor(top + 1)), y1 = Math.min(H - 1, Math.ceil(cy + ry + 1));
  for (let Y = y0; Y <= y1; Y++) for (let X = Math.floor(cx - rx - 1); X <= Math.ceil(cx + rx + 1); X++) {
    const u = (X + 0.5 - cx) / rx, vy = (Y + 0.5 - cy) / ry;
    const taper = vy > 0 ? 1 - 0.55 * vy * vy : 1 - 0.2 * vy * vy;   // egg, pointed below
    const sd = (Math.abs(u) - Math.sqrt(Math.max(0, 1 - vy * vy)) * taper) * rx;
    const a = clamp(0.5 - sd) * clamp((1 - Math.abs(vy)) * ry + 0.5);
    if (a <= 0) continue;
    // scales: a diamond lattice, each scale lit on its upper-left lip
    const s1 = ((X + 0.5 - cx) * 0.36 + (Y + 0.5 - top) * 0.27), s2 = (-(X + 0.5 - cx) * 0.36 + (Y + 0.5 - top) * 0.27);
    const f1 = s1 - Math.floor(s1), f2 = s2 - Math.floor(s2);
    const lip = Math.min(f1, f2);
    const round = 0.55 + 0.45 * clamp(1 - u * 0.9 - 0.2);  // cylinder shade, lit left
    let t = clamp(1.25 - lip * 2.4) * round;
    const col = t > 0.5 ? kit.lerp(CONE[0], CONE_HI[0], (t - 0.5) * 2) : kit.lerp(CONE_LO[0], CONE[0], t * 2);
    const cg = t > 0.5 ? kit.lerp(CONE[1], CONE_HI[1], (t - 0.5) * 2) : kit.lerp(CONE_LO[1], CONE[1], t * 2);
    const cb = t > 0.5 ? kit.lerp(CONE[2], CONE_HI[2], (t - 0.5) * 2) : kit.lerp(CONE_LO[2], CONE[2], t * 2);
    over(X, Y, col * dim, cg * dim, cb * dim, a);
  }
}

/** One door leaf hinged at hx, opening toward the viewer by angle q (0 shut). */
export function doorLeaf(hx, side, top, bot, hw, q, dim = 1) {
  let w = hw * Math.cos(q), sd = side;
  if (w < 0) { w = -w; sd = -side; }                  // swung past square: folds back outside the frame
  const ar = hw, ay = top + ar;
  const shadeK = (0.35 + 0.65 * Math.abs(Math.cos(q)) * (Math.cos(q) > 0 ? 1 : 0.6)) * dim;
  const col = P.door;
  for (let Y = Math.floor(top - 1); Y <= Math.ceil(bot); Y++) for (let X = Math.floor(hx - hw - 1); X <= Math.ceil(hx + hw + 1); X++) {
    const px = X + 0.5, py = Y + 0.5;
    const t = sd * (px - hx);                        // distance from the hinge
    if (t < -0.5 || w < 0.05 || py > bot) continue;
    const ta = clamp(Math.min(t + 0.5, w + 0.5 - t));
    const l = clamp(t / Math.max(0.05, w)) * hw;     // leaf-local x, 0 at the hinge
    if (py < ay && Math.hypot(hw - l, py - ay) > ar) continue;
    const plank = (Math.floor(l / hw * 3) % 2) ? 0.82 : 1;
    const rim = l < 0.9 || l > hw - 0.9 || py > bot - 1 ? 1.3 : 1;
    const k = shadeK * plank * rim;
    over(X, Y, col[0] * k, col[1] * k, col[2] * k, ta);
  }
}

// --------------------------------------------------------------- frog
const BANDS = ['#ff3b30', '#ff9500', '#ffd60a', '#34c759', '#0a84ff', '#8e44ff'].map(kit.hex);
const OUTL = kit.hex('#140a20'), WHITE = [1, 1, 1], SAC = kit.hex('#ffd0b0'), MOUTH = kit.hex('#5a0a14');
/** The rainbow frog in round glasses, centred at (cx, cy), scale s; croak 0..1 inflates the sac. */
export function frog(cx, cy, s, croak, look, blink, dim = 1) {
  const R = 15 * s;
  const x0 = Math.max(0, Math.floor(cx - R)), x1 = Math.min(W - 1, Math.ceil(cx + R));
  const y0 = Math.max(0, Math.floor(cy - R)), y1 = Math.min(H - 1, Math.ceil(cy + R));
  const inv = 1 / s, sacR = 6.2 * croak;
  for (let Y = y0; Y <= y1; Y++) for (let X = x0; X <= x1; X++) {
    const u = (X + 0.5 - cx) * inv, v = (Y + 0.5 - cy) * inv;
    // body (squat ellipse) + two eye bumps
    const dB = (Math.hypot(u / 12.2, (v - 3) / 8.6) - 1) * 8.6;
    const dE = Math.min(Math.hypot(u - 5.6, v + 4.2), Math.hypot(u + 5.6, v + 4.2)) - 4.9;
    const dBody = Math.min(dB, dE);
    const ao = clamp(0.5 - (dBody - 1.0) * s);           // outline extends 1 unit
    if (ao <= 0) continue;
    let r = OUTL[0], g = OUTL[1], b = OUTL[2];
    const ab = clamp(0.5 - dBody * s);
    if (ab > 0) {
      const band = Math.max(0, Math.min(5, Math.floor((v + 8.5) / 3.2)));
      const c = BANDS[band];
      const sh = 0.8 + 0.3 * clamp(0.5 - (u * 0.05 + v * 0.06));
      r += (c[0] * sh - r) * ab; g += (c[1] * sh - g) * ab; b += (c[2] * sh - b) * ab;
    }
    // the smile, or an open croaking mouth
    const mv = v - 2.6 + 0.045 * u * u;                  // corners up: a smile
    if (Math.abs(u) < 7.2) {
      const open = croak * 1.6;
      const dm = Math.abs(mv) - 0.45 - open * (1 - (u / 7.2) ** 2);
      const am = clamp(0.5 - dm * s);
      if (am > 0) { const c = open > 0.2 ? MOUTH : OUTL; r += (c[0] - r) * am; g += (c[1] - g) * am; b += (c[2] - b) * am; }
    }
    // throat sac
    if (sacR > 0.3) {
      const ds = Math.hypot(u, (v - 6.4 - sacR * 0.25) * 1.05) - sacR;
      const as = clamp(0.5 - ds * s);
      if (as > 0) {
        const hl = clamp(1 - Math.hypot(u + sacR * 0.35, v - 5.2) / (sacR * 0.5 + 0.5));
        const c0 = SAC[0] * (0.8 + 0.4 * hl), c1 = SAC[1] * (0.8 + 0.4 * hl), c2 = SAC[2] * (0.8 + 0.4 * hl);
        r += (c0 - r) * as; g += (c1 - g) * as; b += (c2 - b) * as;
      }
    }
    // glasses: white rims, bridge, eyes with pupils
    for (let e = -1; e <= 1; e += 2) {
      const ex = u - e * 5.6, ey = v + 4.4, dr = Math.hypot(ex, ey);
      const aRim = clamp(0.5 - (Math.abs(dr - 3.6) - 0.95) * s);
      const aIn = clamp(0.5 - (dr - 2.65) * s);
      if (aIn > 0) {
        const lid = blink;                                // 0 open .. 1 shut
        const shut = ey < -2.65 + 5.3 * lid;
        let c = shut ? BANDS[3] : [0.95, 0.93, 0.85];
        const pd = Math.hypot(ex - look * 0.8, ey - 0.2) - 1.45;
        if (!shut) { const ap = clamp(0.5 - pd * s); c = [c[0] * (1 - ap) + 0.02 * ap, c[1] * (1 - ap) + 0.02 * ap, c[2] * (1 - ap) + 0.04 * ap]; }
        r += (c[0] - r) * aIn; g += (c[1] - g) * aIn; b += (c[2] - b) * aIn;
      }
      if (aRim > 0) { r += (1 - r) * aRim; g += (1 - g) * aRim; b += (1 - b) * aRim; }
    }
    const db = Math.max(Math.abs(u) - 2.0, Math.abs(v + 4.6) - 0.55);
    const abr = clamp(0.5 - db * s);
    if (abr > 0) { r += (1 - r) * abr; g += (1 - g) * abr; b += (1 - b) * abr; }
    over(X, Y, r * dim, g * dim, b * dim, ao);
  }
}

/** Sound rings: arcs spreading sideways from (cx, cy). */
export function rings(cx, cy, rad, a, col) {
  if (a <= 0.01) return;
  const R = rad + 1.5;
  for (let Y = Math.max(0, Math.floor(cy - R)); Y <= Math.min(H - 1, Math.ceil(cy + R)); Y++) {
    for (let X = Math.max(0, Math.floor(cx - R)); X <= Math.min(W - 1, Math.ceil(cx + R)); X++) {
      const dx = X + 0.5 - cx, dy = Y + 0.5 - cy, d = Math.hypot(dx, dy);
      const ang = Math.abs(dx) / (d || 1);              // 1 = sideways
      if (ang < 0.62) continue;
      const k = clamp(1 - Math.abs(d - rad) / 0.9) * clamp((ang - 0.62) * 4) * a;
      if (k > 0) add(X, Y, col[0], col[1], col[2], k);
    }
  }
}
export { mul };

/** The escape wheel behind its porthole: steps one tooth per tick, eased. */
export function escapeWheel(cx, cy, r, step, dim = 1) {
  const c = P.brass, N = 15;
  const rot = step * Math.PI * 2 / N;
  for (let Y = Math.floor(cy - r); Y <= Math.ceil(cy + r); Y++) for (let X = Math.floor(cx - r); X <= Math.ceil(cx + r); X++) {
    const dx = X + 0.5 - cx, dy = Y + 0.5 - cy, d = Math.hypot(dx, dy);
    if (d > r) continue;
    const a = Math.atan2(dy, dx) - rot, f = ((a * N) / (Math.PI * 2)) % 1, saw = f < 0 ? f + 1 : f;
    const edge = r * 0.62 + r * 0.3 * saw;              // ratchet teeth
    const rim = clamp(edge + 0.5 - d) * (d > r * 0.45 ? 1 : 0.0);
    const hub = clamp(r * 0.22 + 0.5 - d);
    const spoke = clamp(0.8 - Math.abs(Math.sin((a) * 2) * d)) * (d < r * 0.62 ? 1 : 0);
    const k = Math.max(rim, hub, spoke) * dim * (0.7 + 0.5 * clamp(-(dx * L2x + dy * L2y) / (d || 1) * 0.5 + 0.5));
    if (k > 0) over(X, Y, c[0] * k, c[1] * k, c[2] * k, Math.max(rim, hub, spoke));
  }
}
