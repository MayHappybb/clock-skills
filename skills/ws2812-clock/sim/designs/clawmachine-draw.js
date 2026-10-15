// Claw machine drawing: plush numerals, neon numerals, the claw, pixel-art
// plush sprites. Everything draws into a linear RGB Float32Array raster,
// W wide, with coverage anti-aliasing so positions glide between pixels.
import * as kit from '../js/kit.js';
import { FIELD, SKEL, GW, GH, R, sample, smp } from './clawmachine-glyphs.js';

export const W = 64, H = 128;
const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);

// ------------------------------------------------------------- palette
export const FELT = kit.hex('#ffb12a'), STITCH = kit.hex('#7a2c06');
const EYE = [0.004, 0.002, 0.001], GLINT = [0.62, 0.62, 0.58], BLUSH = kit.hex('#ff6a5a');
const LX = -0.48, LY = -0.62, LZ = 0.62;

/**
 * A plush numeral. inst: { d (digit), px, py (world point of the pivot),
 * pu, pv (pivot in glyph units), sx, sy, rot, look (-1..1), eyes ('open' |
 * 'shut' | 'happy'), mouth ('smile' | 'o'), clipY (draw only y < clipY), dark (0..1) }
 */
export function drawPlush(img, I) {
  const F = FIELD[I.d], face = SKEL[I.d].face;
  const c = Math.cos(I.rot || 0), s = Math.sin(I.rot || 0), sx = I.sx || 1, sy = I.sy || 1, k = Math.sqrt(sx * sy);
  // world bbox from the glyph box corners (plus the moat)
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const [u, v] of [[-2, -2], [GW + 2, -2], [-2, GH + 2], [GW + 2, GH + 2]]) {
    const lx = (u - I.pu) * sx, ly = (v - I.pv) * sy, wx = I.px + lx * c - ly * s, wy = I.py + lx * s + ly * c;
    x0 = Math.min(x0, wx); x1 = Math.max(x1, wx); y0 = Math.min(y0, wy); y1 = Math.max(y1, wy);
  }
  x0 = Math.max(0, Math.floor(x0)); x1 = Math.min(W - 1, Math.ceil(x1));
  y0 = Math.max(0, Math.floor(y0)); y1 = Math.min(H - 1, Math.ceil(y1), (I.clipY ?? H) - 1);
  const fx = face[0], fy = face[1], sp = face[2], look = (I.look || 0) * 0.55;
  const shut = I.eyes === 'shut', happy = I.eyes === 'happy', oh = I.mouth === 'o';
  const lit = 1 - (I.dark || 0);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const dx = x - I.px, dy = y - I.py;
    const u = I.pu + (dx * c + dy * s) / sx, v = I.pv + (-dx * s + dy * c) / sy;
    if (!sample(F, u, v)) continue;
    const d = smp.d, dw = (d - R) * k;
    if (dw > 1.6) continue;
    const p = 3 * (y * W + x);
    // dark moat round the felt: keeps the numeral off any busy ground
    const m = clamp((1.6 - dw) / 1.1) * 0.92;
    img[p] *= 1 - m; img[p + 1] *= 1 - m; img[p + 2] *= 1 - m;
    const cov = clamp(0.5 - dw);
    if (cov <= 0) continue;
    // puffy tube shading
    const q = clamp(d / R), nz = Math.sqrt(1 - q * q);
    const nx0 = smp.gx * q, ny0 = smp.gy * q, nx = nx0 * c - ny0 * s, ny = nx0 * s + ny0 * c;
    const dif = Math.max(0, nx * LX + ny * LY + nz * LZ);
    const fuzz = 0.9 + 0.2 * kit.hash(Math.floor(u * 1.4), Math.floor(v * 1.4), I.d);
    let sh = (0.07 + 1.05 * dif ** 1.4) * fuzz;
    const spec = 0.22 * dif ** 7;
    let r = FELT[0] * sh + spec, g = FELT[1] * sh + spec, b = FELT[2] * sh + spec * 0.6;
    // running stitch just inside the seam
    if (d > R - 1.75 && d < R - 0.65 && kit.fract(smp.s / 2.2) < 0.55) {
      const st = 0.35 + 0.65 * dif;
      r = STITCH[0] * st; g = STITCH[1] * st; b = STITCH[2] * st;
    }
    // the face: button eyes, glints, stitched smile, blush
    const fu = u - fx, fv = v - fy;
    if (fu > -sp - 3.5 && fu < sp + 3.5 && fv > -3 && fv < 4) {
      let ink = 0, gl = 0;
      for (let e = -1; e <= 1; e += 2) {
        const ex = fu - e * sp, ey = fv + 0.2;
        if (shut) {               // squeezed shut: a flat stitched line
          ink = Math.max(ink, clamp(0.95 - Math.abs(ey) * 1.8) * (Math.abs(ex) < 1.3 ? 1 : 0));
        } else if (happy) {       // ^ ^
          ink = Math.max(ink, clamp(0.95 - Math.abs(ey + 0.3 + Math.abs(ex) * 0.6) * 1.6) * (Math.abs(ex) < 1.3 ? 1 : 0));
        } else {
          // googly eyes: white felt discs, black pupils that follow the claw
          const de = Math.hypot(ex, ey);
          gl = Math.max(gl, clamp(2.35 - de));
          ink = Math.max(ink, clamp(1.6 - Math.hypot(ex - look * 1.5, ey - 0.25) * 1.15));
        }
      }
      if (oh) ink = Math.max(ink, clamp(1.3 - Math.hypot(fu, (fv - 2.9) * 0.9) * 1.6));
      else if (fv > 2.3) ink = Math.max(ink, clamp(0.9 - Math.abs(Math.hypot(fu, fv - 1.4) - 1.5) * 1.8) * (Math.abs(fu) < 1.6 ? 1 : 0));
      const bl = clamp(1.1 - Math.hypot(Math.abs(fu) - sp - 2.1, fv - 1.4) * 1.0) * 0.45;
      r += (BLUSH[0] * sh - r) * bl; g += (BLUSH[1] * sh - g) * bl; b += (BLUSH[2] * sh - b) * bl;
      r += (GLINT[0] - r) * gl; g += (GLINT[1] - g) * gl; b += (GLINT[2] - b) * gl;
      r += (EYE[0] - r) * ink; g += (EYE[1] - g) * ink; b += (EYE[2] - b) * ink;
    }
    const a = cov;
    img[p] += (r * lit - img[p]) * a; img[p + 1] += (g * lit - img[p + 1]) * a; img[p + 2] += (b * lit - img[p + 2]) * a;
  }
}

/** Neon numeral: additive tube light. (ox, oy) top-left of the glyph box, sc px per unit. */
export function drawNeon(img, d, ox, oy, sc, col, lit, core = [1, 0.85, 0.9]) {
  if (lit <= 0) return;
  const F = FIELD[d];
  const x0 = Math.max(0, Math.floor(ox - 3)), x1 = Math.min(W - 1, Math.ceil(ox + GW * sc + 3));
  const y0 = Math.max(0, Math.floor(oy - 3)), y1 = Math.min(H - 1, Math.ceil(oy + GH * sc + 3));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (!sample(F, (x - ox) / sc, (y - oy) / sc)) continue;
    const dw = smp.d * sc;
    if (dw > 3.2) continue;
    const cr = 1 - kit.smoothstep(0.3, 1.05, dw), gw = Math.exp(-dw * dw / 2.2) * 0.42 + Math.exp(-dw * dw / 7) * 0.1;
    const p = 3 * (y * W + x);
    img[p] += lit * (col[0] * (gw + 0.75 * cr) + core[0] * cr * 0.3);
    img[p + 1] += lit * (col[1] * (gw + 0.75 * cr) + core[1] * cr * 0.3);
    img[p + 2] += lit * (col[2] * (gw + 0.75 * cr) + core[2] * cr * 0.3);
  }
}

// ---------------------------------------------------------------- claw
const segD = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
  let t = L2 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
};
const CHROME = [0.42, 0.45, 0.52];
const clawSegs = new Float32Array(4 * 8);
/** The three-pronged claw at hub (hx, hy), tilted th, open a (0..1), from cable top (tx, ty). */
export function drawClaw(img, hx, hy, th, a, tx, ty, lvl = 1) {
  const c = Math.cos(th), s = Math.sin(th);
  const P = (lx, ly) => [hx + lx * c - ly * s, hy + lx * s + ly * c];
  const phi = (12 + 40 * a) * Math.PI / 180, phi2 = phi - 62 * Math.PI / 180;
  let n = 0;
  const seg = (A, B) => { clawSegs[n++] = A[0]; clawSegs[n++] = A[1]; clawSegs[n++] = B[0]; clawSegs[n++] = B[1]; };
  for (const e of [-1, 1]) {
    const pv = [e * 2.1, 1.3], el = [pv[0] + e * 5.4 * Math.sin(phi), pv[1] + 5.4 * Math.cos(phi)];
    const tp = [el[0] + e * 3.7 * Math.sin(phi2), el[1] + 3.7 * Math.cos(phi2)];
    seg(P(pv[0], pv[1]), P(el[0], el[1])); seg(P(el[0], el[1]), P(tp[0], tp[1]));
  }
  const fl = 5.2 * (1 - 0.35 * a);
  seg(P(0, 1.5), P(0, 1.5 + fl));                 // the front prong, foreshortened
  const nseg = n / 4;
  // bbox
  const x0 = Math.max(0, Math.floor(Math.min(hx, tx) - 10)), x1 = Math.min(W - 1, Math.ceil(Math.max(hx, tx) + 10));
  const y0 = Math.max(0, Math.floor(ty)), y1 = Math.min(H - 1, Math.ceil(hy + 12));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const p = 3 * (y * W + x);
    // cable
    const dc = segD(x, y, tx, ty, hx + 1.6 * s, hy - 1.6 * c);
    let cov = 0, shade = 0, r = 0, g = 0, b = 0;
    if (dc < 1.2) { const k = clamp(0.95 - dc * 1.1) * 0.55; r = 0.16; g = 0.16; b = 0.18; cov = k; }
    // hub: rounded box 5.6 x 3.4 in claw frame
    const lx = (x - hx) * c + (y - hy) * s, ly = -(x - hx) * s + (y - hy) * c;
    const qx = Math.abs(lx) - 2.3, qy = Math.abs(ly) - 1.2;
    const dh = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - 0.6;
    let best = dh, prong = false;
    for (let i = 0; i < nseg; i++) {
      const dd = segD(x, y, clawSegs[4 * i], clawSegs[4 * i + 1], clawSegs[4 * i + 2], clawSegs[4 * i + 3]) - (i === nseg - 1 ? 0.75 : 0.62);
      if (dd < best) { best = dd; prong = true; }
    }
    const k2 = clamp(0.5 - best);
    if (k2 > cov) {
      cov = k2;
      // chrome: bright on the upper-left, a hard glint, darker below
      shade = prong ? 0.75 + 0.35 * clamp(-ly / 8 + 0.4) : 0.65 + 0.6 * clamp((-lx - ly) / 4 + 0.5);
      const glint = !prong && lx < -0.5 && ly < -0.2 ? 0.5 : 0;
      r = CHROME[0] * shade + glint; g = CHROME[1] * shade + glint; b = CHROME[2] * shade + glint;
    }
    if (cov > 0) { r *= lvl; g *= lvl; b *= lvl; img[p] += (r - img[p]) * cov; img[p + 1] += (g - img[p + 1]) * cov; img[p + 2] += (b - img[p + 2]) * cov; }
  }
  // tips, for the grip point
  return P(0, 1.5 + fl);
}

// ------------------------------------------------------------- sprites
/** Build a sprite: rows of chars, pal maps char -> linear rgb; adds a dark 1px outline. */
export function sprite(rows, pal, outline = 0.9) {
  const w = rows[0].length + 2, h = rows.length + 2, px = new Float32Array(4 * w * h);
  rows.forEach((row, j) => [...row].forEach((ch, i) => {
    const col = pal[ch];
    if (!col) return;
    const q = 4 * ((j + 1) * w + i + 1);
    px[q] = col[0]; px[q + 1] = col[1]; px[q + 2] = col[2]; px[q + 3] = 1;
  }));
  if (outline) for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const q = 4 * (j * w + i);
    if (px[q + 3]) continue;
    let near = false;
    for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
      const ii = i + a, jj = j + b;
      if (ii >= 0 && jj >= 0 && ii < w && jj < h && px[4 * (jj * w + ii) + 3] === 1) near = true;
    }
    if (near) px[q + 3] = outline * 0.999;   // black outline (premultiplied rgb 0)
  }
  return { w, h, px };
}
/**
 * Draw sprite S with its pixel (pu, pv) (sprite coords, may be fractional) at
 * world (x, y), scaled and tilted; bilinear, so it glides. a = opacity, lvl = light.
 */
export function drawSprite(img, S, x, y, pu, pv, { sx = 1, sy = 1, rot = 0, a = 1, lvl = 1, clipY = H } = {}) {
  const c = Math.cos(rot), s = Math.sin(rot);
  const hw = Math.max(S.w, S.h) * Math.max(sx, sy) + 2;
  const x0 = Math.max(0, Math.floor(x - hw)), x1 = Math.min(W - 1, Math.ceil(x + hw));
  const y0 = Math.max(0, Math.floor(y - hw)), y1 = Math.min(H - 1, Math.ceil(y + hw), clipY - 1);
  const P = S.px, w = S.w, h = S.h;
  for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) {
    const dx = xx - x, dy = yy - y;
    const u = pu + (dx * c + dy * s) / sx - 0.5, v = pv + (-dx * s + dy * c) / sy - 0.5;
    if (u < -1 || v < -1 || u >= w || v >= h) continue;
    const i = Math.floor(u), j = Math.floor(v), tx = u - i, ty = v - j;
    let r = 0, g = 0, b = 0, al = 0;
    for (let q = 0; q < 4; q++) {
      const ii = i + (q & 1), jj = j + (q >> 1);
      if (ii < 0 || jj < 0 || ii >= w || jj >= h) continue;
      const wt = ((q & 1) ? tx : 1 - tx) * ((q >> 1) ? ty : 1 - ty), o = 4 * (jj * w + ii);
      r += P[o] * wt; g += P[o + 1] * wt; b += P[o + 2] * wt; al += P[o + 3] * wt;
    }
    if (al <= 0.001) continue;
    al *= a;
    const p = 3 * (yy * W + xx);
    img[p] = img[p] * (1 - al) + r * a * lvl; img[p + 1] = img[p + 1] * (1 - al) + g * a * lvl; img[p + 2] = img[p + 2] * (1 - al) + b * a * lvl;
  }
}
