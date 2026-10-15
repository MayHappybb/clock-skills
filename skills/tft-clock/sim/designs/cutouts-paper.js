// Cut-outs: the paper. Colours, the gouache streak texture, the wall, the
// pinned grounds, and the one routine that lays a cut piece on the glass
// (rotated about its pin, anti-aliased from its distance field, with its
// flat cast shadow on whatever lies under it).
//
// All in integer arithmetic on RGB565 words; the frame charges its work to
// g.cost by hand (box per pixel scanned, blend per mixed pixel).

import { rand, noise, noise2, to565, sin } from '../js/kit.js';

export const W = 160, H = 80;

// Matisse's Linel gouaches, as he had his assistants paint the sheets.
export const C = {
  wall: 0xf1ece0,     // the studio wall at the Régina: a warm white
  white: 0xfbf8ef,    // white paper
  ultra: 0x2442a8,    // ultramarine
  lemon: 0xf7d21c,    // lemon yellow
  verm: 0xe4431f,     // vermilion
  emer: 0x13905c,     // emerald
  mag: 0xd6317c,      // magenta-rose
  black: 0x221f23,    // black paper
  orange: 0xf28b1f,   // orange
  violet: 0x5b3e9f,   // violet
  pin: 0x5a5560,      // pin heads, steel
};

// ------------------------------------------------------------ texture

/** The gouache: streaks along a brush direction, four shade levels (0..3). */
export const TEX = new Uint8Array(64 * 64);
{
  const ca = Math.cos(0.5), sa = Math.sin(0.5);
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++) {
      const across = -x * sa + y * ca, along = x * ca + y * sa;
      const v = 0.62 * noise(across * 0.55 + noise(along * 0.06, 9) * 3, 5) + 0.38 * noise2(x * 0.19, y * 0.19, 6);
      TEX[y * 64 + x] = v < 0.3 ? 0 : v < 0.5 ? 1 : v < 0.7 ? 2 : 3;
    }
}

const SH_F = [-0.055, -0.02, 0.012, 0.04];
/** Four RGB565 shades of a colour for the texture levels. */
export function shades(c, k = 1) {
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  return Uint16Array.from(SH_F, (f) => {
    const m = (v) => Math.max(0, Math.min(255, Math.round(v + f * k * (v * 0.8 + 30))));
    return to565((m(r) << 16) | (m(g) << 8) | m(b));
  });
}

// ------------------------------------------------------------ 565 arithmetic

/** Mix RGB565 a toward b by t/16 (t 0..16). */
export function mix565(a, b, t) {
  const ar = a >> 11, ag = (a >> 5) & 63, ab = a & 31;
  return ((ar + ((((b >> 11) - ar) * t) >> 4)) << 11) | ((ag + (((((b >> 5) & 63) - ag) * t) >> 4)) << 5) | (ab + ((((b & 31) - ab) * t) >> 4));
}
/** Darken RGB565 by k/256. */
export function dark565(a, k) {
  return ((((a >> 11) * k) >> 8) << 11) | (((((a >> 5) & 63) * k) >> 8) << 5) | (((a & 31) * k) >> 8);
}

// ------------------------------------------------------------ the wall

/** The wall: warm white paper, a faint grain, old pin holes. RGB565, static. */
export const WALL = new Uint16Array(W * H);
{
  const base = shades(C.wall, 0.45);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const v = noise2(x * 0.11, y * 0.11, 2) * 0.6 + rand(x, y, 3) * 0.4;
      WALL[y * W + x] = base[v < 0.32 ? 0 : v < 0.5 ? 1 : v < 0.68 ? 2 : 3];
    }
  // pin holes from years of pinning
  for (let k = 0; k < 70; k++) {
    const x = (rand(k, 1, 40) * W) | 0, y = (rand(k, 2, 40) * H) | 0;
    WALL[y * W + x] = dark565(WALL[y * W + x], 205);
  }
}

// ------------------------------------------------------------ the grounds (painted sheets pinned flat)

/**
 * Bake the geometry of pinned rectangles of painted paper, colour-free, so
 * the colours can change by the hour: per pixel the top sheet (255 = wall),
 * its coverage 0..16 (anti-aliased cut edge), what is under that edge
 * (another sheet, the wall, or 254: the wall in a sheet's 1 px flat shadow),
 * and the gouache texture level. `rects`: { cx, cy, w, h, rot, seed }.
 */
export function bakeLayout(rects) {
  const top = new Uint8Array(W * H).fill(255), cov = new Uint8Array(W * H), under = new Uint8Array(W * H).fill(255), tex = new Uint8Array(W * H);
  rects.forEach((R, idx) => {
    const ca = Math.cos(R.rot), sa = Math.sin(R.rot);
    // corners nudged: scissors never cut a true rectangle
    const nud = [0, 1, 2, 3].map((i) => [(rand(R.seed, i, 7) - 0.5) * 1.6, (rand(R.seed, i, 8) - 0.5) * 1.6]);
    const dist = (px, py) => {
      const dx = px - R.cx, dy = py - R.cy;
      const u = dx * ca + dy * sa, v = -dx * sa + dy * ca;
      const n = nud[(u < 0 ? 0 : 1) + (v < 0 ? 0 : 2)];
      const hw = R.w / 2 + n[0] * Math.abs(v) / R.h * 2, hh = R.h / 2 + n[1] * Math.abs(u) / R.w * 2;
      return Math.max(Math.abs(u) - hw, Math.abs(v) - hh) + 0.35 * (noise2(px * 0.25, py * 0.25, R.seed) * 2 - 1);
    };
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const c16 = Math.round(Math.max(0, Math.min(1, 0.5 - dist(x + 0.5, y + 0.5))) * 16);
        if (c16 > 0) {
          // this sheet goes on top; what was on top becomes what is under its edge
          under[i] = c16 >= 16 ? 255 : top[i] === 255 ? under[i] : top[i];
          top[i] = idx; cov[i] = c16;
          tex[i] = TEX[(y & 63) * 64 + ((x + R.seed * 13) & 63)];
        } else if (top[i] === 255 && dist(x - 0.6, y - 0.9) < 0) under[i] = 254;
      }
  });
  return { top, cov, under, tex };
}

/** Lay the baked grounds over the wall (already in buf), sheet k in shades SH[k]. */
export function grounds(g, L, SH) {
  const buf = g.buf, top = L.top, cov = L.cov, under = L.under, tex = L.tex;
  let nb = 0;
  for (let i = 0; i < W * H; i++) {
    const t = top[i], u = under[i];
    if (t === 255) { if (u === 254) { buf[i] = dark565(buf[i], 214); nb++; } continue; }
    const c = SH[t][tex[i]], cv = cov[i];
    if (cv >= 16) { buf[i] = c; continue; }
    buf[i] = mix565(u >= 254 ? buf[i] : SH[u][tex[i]], c, cv); nb++;
  }
  g.cost.box += W * H * 3; g.cost.px += W * H; g.cost.blend += nb;
}

/** A sheet in flight: centre (cx, cy), w x h, turned by `rot`, flat shadow `lift` px away. */
export function flyingSheet(g, cx, cy, w, h, rot, sh, lift) {
  const buf = g.buf, ca = Math.cos(rot), sa = Math.sin(rot);
  const r = Math.sqrt(w * w + h * h) / 2 + 1;
  const x0 = Math.max(0, (cx - r) | 0), x1 = Math.min(W, ((cx + r + lift) | 0) + 1);
  const y0 = Math.max(0, (cy - r) | 0), y1 = Math.min(H, ((cy + r + lift) | 0) + 1);
  const hw = w / 2, hh = h / 2;
  let n = 0, nb = 0;
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      n++;
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const u = dx * ca + dy * sa, v = -dx * sa + dy * ca;
      const au = u < 0 ? -u : u, av = v < 0 ? -v : v;
      const d = (au - hw > av - hh ? au - hw : av - hh);
      const i = y * W + x;
      if (d < -0.5) { buf[i] = sh[TEX[(((v + 40) & 63) << 6) | ((u + 40) & 63)]]; continue; }
      // the shadow, then the AA edge
      const ex = dx - lift, ey = dy - lift, us = ex * ca + ey * sa, vs = -ex * sa + ey * ca;
      if ((us < 0 ? -us : us) < hw && (vs < 0 ? -vs : vs) < hh) { buf[i] = dark565(buf[i], 200); nb++; }
      if (d < 0.5) { buf[i] = mix565(buf[i], sh[TEX[(((v + 40) & 63) << 6) | ((u + 40) & 63)]], ((0.5 - d) * 16) | 0); nb++; }
    }
  g.cost.box += n * 8; g.cost.blend += nb; g.cost.px += n - nb;
}

// ------------------------------------------------------------ laying a piece

/**
 * Lay a cut piece (a distance field F: w, h, d in 1/16 px) on the canvas: the
 * field point (fx, fy) lands on screen (sx, sy); (ia ib / ic id) maps a
 * screen offset to a field offset (a rotation, or a squeeze for a flip).
 * `sh`: its four shades. A flat shadow is cast (shx, shy) px away, darkening
 * what is below by shk/256 (0 = none). Charges its work to g.cost.
 */
export function layM(g, F, fx, fy, sx, sy, ia, ib, ic, id, sh, shx, shy, shk, wa = 0, wk = 0, wp = 0) {
  const buf = g.buf, fw = F.w, fh = F.h, D = F.d;
  // forward map, for the screen box of the field's corners (and the shadow)
  const det = ia * id - ib * ic, fa = id / det, fb = -ib / det, fc = -ic / det, fd = ia / det;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (let k = 0; k < 4; k++) {
    const u = (k & 1 ? fw : 0) - fx, v = (k & 2 ? fh : 0) - fy;
    const X = sx + fa * u + fb * v, Y = sy + fc * u + fd * v;
    if (X < x0) x0 = X; if (X > x1) x1 = X; if (Y < y0) y0 = Y; if (Y > y1) y1 = Y;
  }
  if (shk) { if (shx > 0) x1 += shx; else x0 += shx; if (shy > 0) y1 += shy; else y0 += shy; }
  if (wa) { x0 -= wa; x1 += wa; }
  x0 = x0 < 0 ? 0 : x0 | 0; y0 = y0 < 0 ? 0 : y0 | 0;
  x1 = x1 >= W ? W : (x1 | 0) + 1; y1 = y1 >= H ? H : (y1 | 0) + 1;
  if (x0 >= x1 || y0 >= y1) return 0;
  const su = ia * shx + ib * shy, sv = ic * shx + id * shy;
  let n = 0, nb = 0, np = 0;
  for (let Y = y0; Y < y1; Y++) {
    const dy = Y + 0.5 - sy;
    // a wave along the piece (seaweed in water): rows shift sideways, more away from the pin
    const dx0 = x0 + 0.5 - sx - (wa ? wa * sin(wk * dy + wp) * (dy < 0 ? -dy : dy) * 0.08 : 0);
    let u = fx + ia * dx0 + ib * dy - 0.5, v = fy + ic * dx0 + id * dy - 0.5;
    for (let X = x0; X < x1; X++, u += ia, v += ic) {
      n++;
      const i = Y * W + X;
      let cv = 0, iu = 0, iv = 0;
      if (u >= 0 && v >= 0 && u < fw - 1 && v < fh - 1) {
        iu = u | 0; iv = v | 0;
        const k = iv * fw + iu, a = D[k];
        if (a < 40 && a > -40) {
          const fu = u - iu, fv = v - iv, b = D[k + 1], c = D[k + fw], e = D[k + fw + 1];
          const top = a + (b - a) * fu, bot = c + (e - c) * fu, d = top + (bot - top) * fv;
          cv = 8 - d; cv = cv < 0 ? 0 : cv > 16 ? 16 : cv | 0;
        } else cv = a <= -40 ? 16 : 0;
      }
      if (cv >= 16) { buf[i] = sh[TEX[((iv & 63) << 6) | (iu & 63)]]; np++; continue; }
      if (shk) {
        const us = u - su, vs = v - sv;
        if (us >= 0 && vs >= 0 && us < fw - 1 && vs < fh - 1 && D[((vs + 0.5) | 0) * fw + ((us + 0.5) | 0)] < 0) { buf[i] = dark565(buf[i], shk); nb++; }
      }
      if (cv > 0) { buf[i] = mix565(buf[i], sh[TEX[((iv & 63) << 6) | (iu & 63)]], cv); nb++; }
    }
  }
  g.cost.box += n * 9; g.cost.px += np; g.cost.blend += nb;
  return n;
}

/** layM for a piece turned by `th` (cos, sin given) about the pin. */
export function lay(g, F, fx, fy, sx, sy, cth, sth, sh, shx, shy, shk, wa = 0, wk = 0, wp = 0) {
  return layM(g, F, fx, fy, sx, sy, cth, sth, -sth, cth, sh, shx, shy, shk, wa, wk, wp);
}
