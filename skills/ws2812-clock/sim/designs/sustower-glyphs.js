// Su Song tower: the placard numerals and the puppets that carry them.
//
// The numerals are a carved "Song" face (Songti, the woodblock type named
// for this dynasty): fat stems, hairline joins, triangular feet, ball
// terminals. Each is built from primitives in a 17 x 22 px box, rasterised
// at 4x and embossed in gold on a red-lacquer placard held up by a puppet
// in a winged Song futou hat. Sprites are premultiplied RGBA plus a gold
// mask (for the travelling glint), at S = 4 texels per LED.

export const S = 4;
const segD = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
  let t = L ? ((px - ax) * dx + (py - ay) * dy) / L : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
};
const R = (x0, y0, x1, y1) => (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
const E = (cx, cy, a, b) => (x, y) => ((x - cx) / a) ** 2 + ((y - cy) / b) ** 2 <= 1;
const D = (cx, cy, r) => E(cx, cy, r, r);
const RING = (o, i, keep) => (x, y) => o(x, y) && !i(x, y) && (!keep || keep(x, y));
const CAP = (ax, ay, bx, by, w) => (x, y) => segD(x, y, ax, ay, bx, by) <= w / 2;
const POLY = (p) => (x, y) => {
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i], [xj, yj] = p[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const U = (...fs) => (x, y) => fs.some((f) => f(x, y));

export const GW = 17, GH = 22;
const foot = (x0, x1, s0, s1) => U(R(x0, 20, x1, 22), POLY([[s0 - 2.2, 20], [s0, 17.6], [s0, 20]]), POLY([[s1, 17.6], [s1 + 2.2, 20], [s1, 20]]));
const SIX = U(
  RING(E(8.6, 15, 8.1, 6.8), E(8.9, 15, 4.0, 4.3)),
  RING(E(11, 14, 10.8, 13.6), E(11.6, 14.4, 6.7, 11.6), (x, y) => x < 11 && y < 15),
  D(13.1, 3.0, 2.3),
);
const GLYPH = [
  RING(E(8.5, 11, 8.5, 11), E(8.5, 11, 4.3, 8.7)),
  U(R(6.5, 0.4, 10.5, 20.5), CAP(7.2, 1.3, 2.6, 5.4, 2.2), foot(3, 14, 6.5, 10.5)),
  U(RING(E(8.5, 7, 7.8, 7), E(8, 7.3, 3.8, 4.8), (x, y) => y <= 7 || (x >= 8.5 && y <= 11.5)),
    CAP(13.3, 10.2, 2.4, 20.3, 3.6), D(2.7, 6.1, 2.4), R(1.2, 19.8, 16.6, 22), R(14.6, 16.8, 16.6, 22)),
  U(RING(E(8.3, 6, 7.1, 6), E(7.8, 6, 3.4, 3.8), (x, y) => y < 5 || x > 7),
    RING(E(8.3, 15.3, 8.2, 6.8), E(7.6, 15.3, 4.0, 4.5), (x, y) => y > 16 || x > 7),
    D(2.5, 4.4, 2.2), D(2.6, 17.9, 2.4)),
  U(R(10.5, 0.4, 14.5, 20.5), CAP(11.2, 1.2, 1.3, 15.4, 2.3), POLY([[10.5, 0.4], [14.5, 0.4], [10.5, 4]]),
    R(0.4, 14.5, 17, 16.7), foot(8.2, 16.8, 10.5, 14.5)),
  U(R(4.2, 0.4, 16.2, 2.7), R(14.4, 0.4, 16.4, 4.4), R(3.8, 0.4, 6.4, 10.2),
    RING(E(8.3, 14.6, 8.2, 7.2), E(7.6, 14.4, 4.0, 4.8), (x, y) => x > 4.6 || y > 16.5), D(2.6, 18.2, 2.3)),
  SIX,
  U(R(0.8, 0.4, 16.8, 2.7), R(0.8, 0.4, 2.9, 5.2), POLY([[13.6, 1.6], [16.8, 1.6], [16.8, 3.4], [9.8, 21.8], [5.6, 21.8]])),
  U(RING(E(8.5, 5.9, 6.6, 5.6), E(8.5, 5.9, 3.2, 3.5)), RING(E(8.5, 15.6, 8.2, 6.5), E(8.5, 15.6, 4.3, 4.3))),
  (x, y) => SIX(17 - x, 22 - y),
];

/** Glyph coverage at 4x texels for a numeral box gw x gh LEDs (the 17x22 design squeezed in). */
const glyphCache = new Map();
export function glyphCov(d, gw, gh) {
  const key = d + ':' + gw + 'x' + gh;
  if (glyphCache.has(key)) return glyphCache.get(key);
  const w = gw * S, h = gh * S, c = new Float32Array(w * h), f = GLYPH[d], kx = GW / gw, ky = GH / gh;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let n = 0;
    for (let sy = 0; sy < 3; sy++) for (let sx = 0; sx < 3; sx++) if (f(((x + (sx + 0.5) / 3) / S) * kx, ((y + (sy + 0.5) / 3) / S) * ky)) n++;
    c[y * w + x] = n / 9;
  }
  glyphCache.set(key, c);
  return c;
}

const lin = (r, g, b) => [r, g, b];
export const PAL = {
  gold: lin(0.95, 0.56, 0.13), goldHi: lin(1, 0.86, 0.5),
  lacq: lin(0.055, 0.004, 0.002),
  rim: lin(0.22, 0.12, 0.025),
  skin: lin(0.42, 0.25, 0.14), skinLo: lin(0.24, 0.13, 0.065), blush: lin(0.5, 0.11, 0.07), eye: lin(0, 0, 0),
  mouth: lin(0.35, 0.05, 0.04), beard: lin(0.025, 0.022, 0.025), collar: lin(0.16, 0.14, 0.11),
  hat: lin(0.035, 0.038, 0.05), hatHi: lin(0.12, 0.12, 0.15),
};
export const ROBES = [lin(0.03, 0.006, 0.055), lin(0.005, 0.035, 0.016)]; // hour: purple, minute: green

// ---------------------------------------------------------------- puppet
export const PW = 26, PH = 41;          // LEDs
const PLK = { x0: 4.4, y0: 16, x1: 21.6, y1: 38.6 }, NB = { x: 6, y: 18, w: 14, h: 19 };
export const EYES = [[10.5, 9], [15.5, 9]];

/** A placard puppet: { w, h, px: Float32Array(5*w*h*S*S) } premultiplied rgb, alpha, gold. */
const pupCache = new Map();
export function puppet(d, robeK) {
  const key = d * 4 + robeK;
  if (pupCache.has(key)) return pupCache.get(key);
  const robe = ROBES[robeK], W = PW * S, H = PH * S, px = new Float32Array(5 * W * H);
  const gw = NB.w * S, gh = NB.h * S, gc = glyphCov(d, NB.w, NB.h), ox = NB.x * S, oy = Math.round(NB.y * S);
  const G = (tx, ty) => (tx < 0 || ty < 0 || tx >= gw || ty >= gh ? 0 : gc[ty * gw + tx]);
  const crown = U(E(13, 3.4, 4.3, 3.1), R(8.7, 3.4, 17.3, 5.4));
  const wings = U(R(0.8, 4.3, 25.2, 5.5), D(1.1, 4.9, 1.05), D(24.9, 4.9, 1.05));
  const face = E(13, 9.7, 4.5, 4.7);
  const eyes = U(E(EYES[0][0], EYES[0][1], 0.62, 1.05), E(EYES[1][0], EYES[1][1], 0.62, 1.05));
  const cheeks = U(D(9.5, 11.5, 0.9), D(16.5, 11.5, 0.9));
  const mouth = E(13, 12.8, 0.9, 0.45);
  const beard = robeK === 0 ? U(CAP(12.2, 12.1, 10.2, 13.6, 0.7), CAP(13.8, 12.1, 15.8, 13.6, 0.7), CAP(13, 13.9, 13, 16.6, 0.9)) : () => false;
  const collar = RING(E(13, 15, 5.4, 2.4), E(13, 14.6, 3.6, 1.7));
  const robeB = U(POLY([[7, 14], [19, 14], [24.8, 40.4], [1.2, 40.4]]), E(13, 15.4, 7.2, 2.6));
  const sleeves = U(E(4.8, 26, 4.2, 8.5), E(21.2, 26, 4.2, 8.5));
  const shoes = U(E(9, 40.7, 2, 0.8), E(17, 40.7, 2, 0.8));
  const hands = U(D(4.6, 27.6, 1.5), D(21.4, 27.6, 1.5));
  const plk = (x, y) => x >= PLK.x0 && x <= PLK.x1 && y >= PLK.y0 && y <= PLK.y1;
  for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
    let r = 0, g = 0, b = 0, a = 0, gm = 0;
    for (let s = 0; s < 4; s++) {
      const x = (tx + 0.25 + 0.5 * (s & 1)) / S, y = (ty + 0.25 + 0.5 * (s >> 1)) / S;
      let c = null, gold = 0;
      if (hands(x, y)) c = PAL.skin;
      else if (plk(x, y)) {
        const e = Math.min(x - PLK.x0, PLK.x1 - x, y - PLK.y0, PLK.y1 - y);
        if (e > 0.25 && e < 1.0) { c = PAL.rim; gold = 0.5; }
        else {
          const gx = tx - ox, gy = ty - oy, cv = G(gx, gy);
          const sheen = 0.7 + 0.55 * Math.exp(-(((y - 19) / 4) ** 2)) + 0.15 * (x - 13) / 8;
          const shadow = G(gx - 3, gy - 3) * (1 - cv);
          const lac = PAL.lacq.map((v) => v * sheen * (1 - 0.8 * shadow) * (e <= 0.25 ? 0.5 : 1));
          if (cv > 0) {
            const sh = Math.max(0, Math.min(1.2, 0.55 + 0.9 * (G(gx + 2, gy + 2) - G(gx - 2, gy - 2))));
            const gcol = PAL.gold.map((v, k) => v * (0.5 + 0.6 * sh) + (PAL.goldHi[k] - v) * Math.max(0, sh - 0.9));
            c = lac.map((v, k) => v + (gcol[k] - v) * cv); gold = cv;
          } else c = lac;
        }
      } else if (wings(x, y) || crown(x, y)) c = y < 1.4 || (wings(x, y) && y < 4.8) ? PAL.hatHi : PAL.hat;
      else if (face(x, y)) {
        if (eyes(x, y)) c = PAL.eye;
        else if (beard(x, y)) c = PAL.beard;
        else if (mouth(x, y)) c = PAL.mouth;
        else if (cheeks(x, y)) c = PAL.blush;
        else c = y > 12.5 && Math.abs(x - 13) > 2.5 ? PAL.skinLo : PAL.skin;
      } else if (beard(x, y)) c = PAL.beard;
      else if (collar(x, y)) c = PAL.collar;
      else if (sleeves(x, y)) c = robe.map((v) => v * (1.35 + 0.3 * Math.sin(y * 1.1)));
      else if (robeB(x, y)) c = robe.map((v) => v * (0.85 + 0.25 * Math.sin(x * 1.3)));
      else if (shoes(x, y)) c = PAL.beard;
      if (c) { r += c[0]; g += c[1]; b += c[2]; a += 1; gm += gold; }
    }
    const o = 5 * (ty * W + tx);
    px[o] = r / 4; px[o + 1] = g / 4; px[o + 2] = b / 4; px[o + 3] = a / 4; px[o + 4] = gm / 4;
  }
  const spr = { w: PW, h: PH, px };
  pupCache.set(key, spr);
  return spr;
}

// ------------------------------------------------------------- drawing
/**
 * Draw sprite `spr` into the 3*W*H image, its bottom centre at (cx, by),
 * scaled s (sy extra vertically: a bow), times `shade`, plus `glint` gold
 * at sprite x fraction gx (a light sweep), clipped to [x0,x1) x [y0,y1).
 */
export function drawSprite(img, W, spr, cx, by, s, sy, shade, glint, gx, x0, y0, x1, y1, ra = 0, rb = spr.h) {
  const sw = spr.w * S, sh = spr.h * S, px = spr.px, ta = ra * S, tb = rb * S;
  const hw = (spr.w * s) / 2;
  const ax = Math.max(x0, Math.floor(cx - hw)), bx = Math.min(x1, Math.ceil(cx + hw));
  const ay = Math.max(y0, Math.floor(by - (spr.h - ra) * s * sy)), byy = Math.min(y1, Math.ceil(by - (spr.h - rb) * s * sy));
  const kx = S / s, ky = S / (s * sy), ox = sw / 2, gsw = gx * sw;
  for (let y = ay; y < byy; y++) {
    for (let x = ax; x < bx; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let j = 0; j < 4; j++) {
        const ty = Math.floor(sh - (by - (y + 0.125 + 0.25 * j)) * ky);
        if (ty < ta || ty >= tb) continue;
        for (let i = 0; i < 4; i++) {
          const tx = Math.floor(ox + (x + 0.125 + 0.25 * i - cx) * kx);
          if (tx < 0 || tx >= sw) continue;
          const o = 5 * (ty * sw + tx);
          if (px[o + 3] === 0) continue;
          let gl = 0;
          if (glint > 0 && px[o + 4] > 0) { const dd = (tx - gsw + (ty - sh / 2) * 0.5) / (S * 3); gl = glint * px[o + 4] * Math.exp(-dd * dd); }
          r += px[o] + gl; g += px[o + 1] + gl * 0.8; b += px[o + 2] + gl * 0.45; a += px[o + 3];
        }
      }
      if (a === 0) continue;
      const p = 3 * (y * W + x), k = 1 / 16;
      a *= k;
      img[p] = img[p] * (1 - a) + r * k * shade;
      img[p + 1] = img[p + 1] * (1 - a) + g * k * shade;
      img[p + 2] = img[p + 2] * (1 - a) + b * k * shade;
    }
  }
}
