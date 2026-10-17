// Shooting gallery art: tin numeral targets (textures), tin ducks, plush
// prizes, and the compositing helpers that draw them into a linear-light
// RGB raster with sub-pixel placement.
import * as kit from '../js/kit.js';
import { digitSDF, ell, circ, cap, poly } from './shootinggallery-glyphs.js';

const clamp = kit.clamp;
const hex = kit.hex;

// ------------------------------------------------------------------ sprites
// A sprite is { w, h, rgb (premultiplied, 3*w*h), a (w*h), s (specular mask) }.
function newSprite(w, h) {
  return { w, h, rgb: new Float32Array(3 * w * h), a: new Float32Array(w * h), s: new Float32Array(w * h) };
}

/**
 * Build a sprite from layers painted in order: [sdf(x, y), colour, spec].
 * sdf is in sprite pixels (negative inside); 4x4 supersampled coverage.
 */
export function shapeSprite(w, h, layers) {
  const S = newSprite(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0, g = 0, b = 0, a = 0, sp = 0;
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
      const px = x + (i + 0.5) / 4, py = y + (j + 0.5) / 4;
      let cr = 0, cg = 0, cb = 0, ca = 0, cs = 0;
      for (const L of layers) {
        const d = L[0](px, py);
        if (d > 0) continue;
        const c = typeof L[1] === 'function' ? L[1](px, py) : L[1];
        cr = c[0]; cg = c[1]; cb = c[2]; ca = 1; cs = L[2] || 0;
      }
      r += cr; g += cg; b += cb; a += ca; sp += cs;
    }
    const p = y * w + x;
    S.rgb[3 * p] = r / 16; S.rgb[3 * p + 1] = g / 16; S.rgb[3 * p + 2] = b / 16; S.a[p] = a / 16; S.s[p] = sp / 16;
  }
  return S;
}

// ---------------------------------------------------------- tin numerals
const RED = hex('#e0221a'), RED_DK = hex('#8a0d0a'), GOLD = hex('#ffc248'), GOLD_DK = hex('#9a5a12');
const TIN = hex('#b8bcc4'), CREAM = hex('#ffe8c0');

/**
 * Digit d as a stamped tin target, w x h px: red enamel face, a gold rim
 * band lit from above, a darker stamped bevel inside the rim, and a few
 * paint chips showing bare tin. spec marks what glints.
 */
export function numeralTex(d, w, h, seed = 0) {
  const T = newSprite(w, h), sx = 72 / w, sy = 100 / h, ppu = Math.min(w / 72, h / 100);
  const sd = (x, y) => digitSDF(d, x * sx, y * sy) * ppu;
  const rimW = Math.max(1.1, w / 30);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let cov = 0;
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) cov += clamp(0.5 - sd(x + (i + 0.5) / 4, y + (j + 0.5) / 4) * 1.0, 0, 1);
    cov /= 16;
    if (cov <= 0) continue;
    const cx = x + 0.5, cy = y + 0.5, e = -sd(cx, cy);
    const nx = sd(cx + 0.5, cy) - sd(cx - 0.5, cy), ny = sd(cx, cy + 0.5) - sd(cx, cy - 0.5);
    const nl = Math.hypot(nx, ny) || 1;
    const up = (-ny * 0.85 - nx * 0.35) / nl;               // outward normal facing the bulbs above
    let c, s;
    if (e < rimW) {
      const k = 0.45 + 0.75 * clamp(0.5 + 0.5 * up);
      c = kit.mix(GOLD_DK, GOLD, clamp(k)); c = kit.scale(c, 0.8 + 0.7 * k); s = 1;
    } else {
      const top = 1 - y / h;
      c = kit.scale(RED, 0.95 + 0.35 * top);
      if (e < rimW + 1.3) c = kit.mix(c, RED_DK, 0.55 * (1 - clamp(0.5 + 0.5 * up)));   // stamped bevel
      s = 0.35;
      // circus inline: a cream pinstripe down the ridge of every thick stroke
      const ridge = clamp(1.4 - nl / 0.7) * clamp((e - rimW - 1.6) / 1.2);
      if (ridge > 0) { c = kit.mix(c, CREAM, ridge * 0.85); s = 0.6; }
      const n = kit.noise2(x * 0.45 + seed * 7.1, y * 0.45 + d * 3.3);
      if (n > 0.8 && e > rimW + 0.6 && ridge < 0.3) { c = kit.scale(TIN, 0.7); s = 0.9; }
      else if (n > 0.76 && e > rimW + 0.6 && ridge < 0.3) { c = kit.scale(RED_DK, 0.7); }
    }
    const p = y * w + x;
    T.rgb[3 * p] = c[0] * cov; T.rgb[3 * p + 1] = c[1] * cov; T.rgb[3 * p + 2] = c[2] * cov;
    T.a[p] = cov; T.s[p] = s;
  }
  return T;
}

// ------------------------------------------------------------ the ducks
const DUCK_Y = hex('#ffc21a'), DUCK_W = hex('#d8900c'), BEAK = hex('#ff6a10'), INK = [0, 0, 0], WHITE = hex('#fff4e0');
export function duckSprite() {
  const body = (x, y) => Math.min(ell(x, y, 8.5, 10.5, 7.5, 4.5), poly(x, y, [[1, 5.5], [5, 9], [2, 11]]), ell(x, y, 13.5, 8, 2.5, 3.5));
  const head = (x, y) => circ(x, y, 13.6, 4.6, 3.6);
  const beak = (x, y) => poly(x, y, [[16, 3.6], [19.4, 5.3], [16, 6.6]]);
  const all = (x, y) => Math.min(body(x, y), head(x, y), beak(x, y), cap(x, y, 9, 14, 9, 17, 0.9));
  return shapeSprite(20, 18, [
    [(x, y) => all(x, y) - 1.0, INK],
    [(x, y) => cap(x, y, 9, 14, 9, 17, 0.8), hex('#6a6e78'), 0.5],
    [body, (x, y) => kit.scale(DUCK_Y, 0.8 + 0.25 * (1 - y / 15)), 0.4],
    [head, DUCK_Y, 0.4],
    [(x, y) => ell(x, y, 7.5, 10, 3.8, 2.0), DUCK_W, 0.3],
    [beak, BEAK, 0.3],
    [(x, y) => circ(x, y, 14.3, 3.9, 1.05), INK],
    [(x, y) => circ(x, y, 14.6, 3.5, 0.4), WHITE],
  ]);
}
const RAB = hex('#e8eef8'), RAB_P = hex('#ff7aa8');
export function rabbitSprite() {
  const body = (x, y) => Math.min(ell(x, y, 8, 12.5, 6.5, 4), circ(x, y, 13, 8.5, 3.3), circ(x, y, 2, 11, 2));
  const ear = (x, y) => Math.min(ell(x, y, 12.2, 2.8, 1.2, 3.6), ell(x, y, 14.6, 3.2, 1.2, 3.6));
  const all = (x, y) => Math.min(body(x, y), ear(x, y), cap(x, y, 8, 15, 8, 18, 0.9));
  return shapeSprite(18, 19, [
    [(x, y) => all(x, y) - 1.0, INK],
    [(x, y) => cap(x, y, 8, 15, 8, 18, 0.8), hex('#6a6e78'), 0.5],
    [body, (x, y) => kit.scale(RAB, 0.55 + 0.25 * (1 - y / 16)), 0.5],
    [ear, kit.scale(RAB, 0.6), 0.5],
    [(x, y) => ell(x, y, 12.2, 3.4, 0.5, 2.2), RAB_P],
    [(x, y) => circ(x, y, 14, 8, 0.95), INK],
    [(x, y) => circ(x, y, 16.2, 9.3, 0.7), RAB_P],
  ]);
}

// ------------------------------------------------------------- plush bears
export function bearSprite(fur, light, bow) {
  const F = hex(fur), Lt = hex(light), B = hex(bow);
  const ears = (x, y) => Math.min(circ(x, y, 7, 6.5, 5), circ(x, y, 27, 6.5, 5));
  const head = (x, y) => ell(x, y, 17, 14, 11.5, 10);
  const body = (x, y) => ell(x, y, 17, 29, 10, 8.5);
  const arms = (x, y) => Math.min(cap(x, y, 9, 25, 4, 31, 3.4), cap(x, y, 25, 25, 30, 31, 3.4));
  const legs = (x, y) => Math.min(ell(x, y, 9.5, 35, 5, 3.4), ell(x, y, 24.5, 35, 5, 3.4));
  const all = (x, y) => Math.min(ears(x, y), head(x, y), body(x, y), arms(x, y), legs(x, y));
  const shade = (c) => (x, y) => kit.scale(c, 0.75 + 0.3 * (1 - y / 38));
  return shapeSprite(34, 40, [
    [(x, y) => all(x, y) - 1.1, INK],
    [ears, shade(F)],
    [(x, y) => Math.min(circ(x, y, 7, 6.5, 2.4), circ(x, y, 27, 6.5, 2.4)), Lt],
    [body, shade(F)],
    [arms, shade(F)],
    [legs, shade(F)],
    [(x, y) => ell(x, y, 17, 30, 6, 5.5), Lt],
    [(x, y) => Math.min(ell(x, y, 9.5, 35.6, 2.8, 2), ell(x, y, 24.5, 35.6, 2.8, 2)), Lt],
    [head, shade(F)],
    [(x, y) => ell(x, y, 17, 18.3, 5.3, 3.9), Lt],
    [(x, y) => ell(x, y, 17, 16.4, 2.1, 1.4), INK],
    [(x, y) => cap(x, y, 17, 17.5, 17, 19.6, 0.45), INK],
    [(x, y) => Math.min(circ(x, y, 11.8, 12, 1.7), circ(x, y, 22.2, 12, 1.7)), INK],
    [(x, y) => Math.min(circ(x, y, 12.3, 11.4, 0.6), circ(x, y, 22.7, 11.4, 0.6)), WHITE],
    [(x, y) => Math.min(poly(x, y, [[17, 24], [11.5, 21.5], [11.5, 26.5]]), poly(x, y, [[17, 24], [22.5, 21.5], [22.5, 26.5]])), B],
    [(x, y) => circ(x, y, 17, 24, 1.5), kit.scale(B, 0.7)],
  ]);
}

// ------------------------------------------------------------- drawing
/** Composite sprite S with its top-left at integer (x0, y0), times k. */
export function blit(img, W, H, S, x0, y0, k = 1) {
  for (let j = 0; j < S.h; j++) {
    const y = y0 + j;
    if (y < 0 || y >= H) continue;
    for (let i = 0; i < S.w; i++) {
      const x = x0 + i;
      if (x < 0 || x >= W) continue;
      const p = j * S.w + i, a = S.a[p];
      if (a <= 0) continue;
      const q = 3 * (y * W + x);
      img[q] = img[q] * (1 - a) + S.rgb[3 * p] * k;
      img[q + 1] = img[q + 1] * (1 - a) + S.rgb[3 * p + 1] * k;
      img[q + 2] = img[q + 2] * (1 - a) + S.rgb[3 * p + 2] * k;
    }
  }
}

/**
 * Composite sprite S transformed: its anchor (ax, ay) (sprite px) lands at
 * screen (X, Y); scaled sx, sy and rotated by rot. Bilinear, sub-pixel.
 */
export function blitXf(img, W, H, S, X, Y, ax, ay, sx, sy, rot, k = 1) {
  const c = Math.cos(rot), s = Math.sin(rot);
  // bounding box of the four corners
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const [u, v] of [[-ax, -ay], [S.w - ax, -ay], [-ax, S.h - ay], [S.w - ax, S.h - ay]]) {
    const px = X + c * u * sx - s * v * sy, py = Y + s * u * sx + c * v * sy;
    if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py;
  }
  const X0 = Math.max(0, Math.floor(x0)), X1 = Math.min(W - 1, Math.ceil(x1)), Y0 = Math.max(0, Math.floor(y0)), Y1 = Math.min(H - 1, Math.ceil(y1));
  const isx = 1 / sx, isy = 1 / sy, sw = S.w, sh = S.h, rgb = S.rgb, A = S.a;
  for (let y = Y0; y <= Y1; y++) {
    const dy = y + 0.5 - Y;
    for (let x = X0; x <= X1; x++) {
      const dx = x + 0.5 - X;
      const u = (c * dx + s * dy) * isx + ax - 0.5, v = (-s * dx + c * dy) * isy + ay - 0.5;
      if (u <= -1 || v <= -1 || u >= sw || v >= sh) continue;
      const iu = Math.floor(u), iv = Math.floor(v), fu = u - iu, fv = v - iv;
      let a = 0, r = 0, g = 0, b = 0;
      for (let jj = 0; jj < 2; jj++) {
        const vv = iv + jj;
        if (vv < 0 || vv >= sh) continue;
        const wv = jj ? fv : 1 - fv;
        for (let ii = 0; ii < 2; ii++) {
          const uu = iu + ii;
          if (uu < 0 || uu >= sw) continue;
          const wgt = wv * (ii ? fu : 1 - fu), p = vv * sw + uu;
          a += A[p] * wgt; r += rgb[3 * p] * wgt; g += rgb[3 * p + 1] * wgt; b += rgb[3 * p + 2] * wgt;
        }
      }
      if (a <= 0.002) continue;
      const q = 3 * (y * W + x);
      img[q] = img[q] * (1 - a) + r * k; img[q + 1] = img[q + 1] * (1 - a) + g * k; img[q + 2] = img[q + 2] * (1 - a) + b * k;
    }
  }
}

/**
 * A knock-down target: texture T standing on its foot hinge, its bottom edge
 * at screen row footY, centred on cx, tipped back by th (radians; negative
 * leans toward the viewer), seen with perspective focal length f px.
 * light: overall gain. glint(u01, v01) adds a warm sheen on spec texels.
 * clipY: rows at or below it are hidden (behind the rail lip).
 */
export function drawTarget(img, W, H, T, cx, footY, th, f, light, sheen, sheenPos, clipY) {
  const ct = Math.cos(th), st = Math.sin(th), w = T.w, h = T.h;
  if (ct <= 0.02) return;
  // screen extent: top edge at v = h
  const topS = footY - (h * ct * f) / (f + h * st);
  const scTop = f / (f + h * st);
  const half = (w / 2) * Math.max(1, scTop) + 1;
  const Y0 = Math.max(0, Math.floor(topS)), Y1 = Math.min(H - 1, Math.min(clipY, footY) - 1);
  const X0 = Math.max(0, Math.floor(cx - half)), X1 = Math.min(W - 1, Math.ceil(cx + half));
  const rgb = T.rgb, A = T.a, SP = T.s;
  // facing the bulbs above: tipping back brightens, a glint passes near 35 deg
  const tilt = th * 57.2958;
  const gain = light * (1 + 0.55 * Math.max(0, st)) * (th < 0 ? 1 + 0.4 * th : 1);
  const flash = Math.exp(-(((tilt - 38) / 13) ** 2)) * 1.4 + sheen;
  const GR = 1.0, GG = 0.74, GB = 0.42;
  for (let y = Y0; y <= Y1; y++) {
    const q = footY - (y + 0.5);
    const den = f * ct - q * st;
    if (den <= 0) continue;
    const v = (q * f) / den;                 // height above the foot, texture px
    if (v < 0 || v > h) continue;
    const tv = h - v - 0.5, sc = (f + v * st) / f;
    const iv = Math.floor(tv), fv = tv - iv;
    for (let x = X0; x <= X1; x++) {
      const tu = (x + 0.5 - cx) * sc + w / 2 - 0.5;
      if (tu <= -1 || tu >= w) continue;
      const iu = Math.floor(tu), fu = tu - iu;
      let a = 0, r = 0, g = 0, b = 0, s = 0;
      for (let jj = 0; jj < 2; jj++) {
        const vv = iv + jj;
        if (vv < 0 || vv >= h) continue;
        const wv = jj ? fv : 1 - fv;
        for (let ii = 0; ii < 2; ii++) {
          const uu = iu + ii;
          if (uu < 0 || uu >= w) continue;
          const wgt = wv * (ii ? fu : 1 - fu), p = vv * w + uu;
          if (wgt === 0) continue;
          const ap = A[p] * wgt;
          a += ap; r += rgb[3 * p] * wgt; g += rgb[3 * p + 1] * wgt; b += rgb[3 * p + 2] * wgt; s += SP[p] * ap;
        }
      }
      if (a <= 0.002) continue;
      let gl = flash;
      if (sheenPos > -9) { const z = (tu / w + tv / h * 0.55) - sheenPos; gl += 0.55 * Math.exp(-z * z * 60); }
      const add = s * gl * 0.5;
      const o = 3 * (y * W + x);
      img[o] = img[o] * (1 - a) + r * gain + add * GR;
      img[o + 1] = img[o + 1] * (1 - a) + g * gain + add * GG;
      img[o + 2] = img[o + 2] * (1 - a) + b * gain + add * GB;
    }
  }
}

/** Additive soft dot: r radius px, colour c times k. */
export function glow(img, W, H, x, y, r, c, k) {
  const X0 = Math.max(0, Math.floor(x - r)), X1 = Math.min(W - 1, Math.ceil(x + r));
  const Y0 = Math.max(0, Math.floor(y - r)), Y1 = Math.min(H - 1, Math.ceil(y + r));
  const ir2 = 1 / (r * r);
  for (let py = Y0; py <= Y1; py++) {
    const dy = py + 0.5 - y;
    for (let px = X0; px <= X1; px++) {
      const dx = px + 0.5 - x, d2 = (dx * dx + dy * dy) * ir2;
      if (d2 >= 1) continue;
      const f = (1 - d2) * (1 - d2) * k, o = 3 * (py * W + px);
      img[o] += c[0] * f; img[o + 1] += c[1] * f; img[o + 2] += c[2] * f;
    }
  }
}

/** Fill a capsule a-b with radii r0..r1 (anti-aliased), colour from fn(t, side) or flat c. */
export function capsule(img, W, H, ax, ay, bx, by, r0, r1, paint) {
  const X0 = Math.max(0, Math.floor(Math.min(ax, bx) - Math.max(r0, r1) - 1)), X1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + Math.max(r0, r1) + 1));
  const Y0 = Math.max(0, Math.floor(Math.min(ay, by) - Math.max(r0, r1) - 1)), Y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by) + Math.max(r0, r1) + 1));
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy, L = Math.sqrt(L2), nx = -dy / L, ny = dx / L;
  for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) {
    const px = x + 0.5 - ax, py = y + 0.5 - ay;
    const t = clamp((px * dx + py * dy) / L2), r = r0 + (r1 - r0) * t;
    const ex = px - t * dx, ey = py - t * dy, d = Math.hypot(ex, ey) - r;
    const a = clamp(0.5 - d);
    if (a <= 0) continue;
    const side = (ex * nx + ey * ny) / (r || 1);      // -1..1 across the barrel
    const c = paint(t, side);
    const o = 3 * (y * W + x);
    img[o] = img[o] * (1 - a) + c[0] * a; img[o + 1] = img[o + 1] * (1 - a) + c[1] * a; img[o + 2] = img[o + 2] * (1 - a) + c[2] * a;
  }
}
