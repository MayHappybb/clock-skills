// Tables for 'moire' (flash on the device), built once at load.
//
// The face's lines are the numerals' echo: offset outlines of the time,
// repeated outward every few pixels. That needs the distance from every
// pixel to every numeral. Instead of a distance transform each minute, each
// digit at each size has its distance field precomputed on a half-resolution
// grid wide enough for either of its two slots; a frame takes the minimum of
// four lookups (plus a target at the centre) per grid point and interpolates.
//
//   DIST[size][digit]  Uint8, half-pixel units (cap 127.5 px), TW x GH grid
//   CODE[size][digit]  Uint8 per pixel of the glyph box padded by 2:
//                      1..15 inside (distance from the edge), 16 moat or
//                      counter, 0 outside
//   CT                 distance from the centre (80, 40), half-pixel units
//   RT, AT             radius (x16) and angle (1/256 turn) by |dx|, |dy|

import { DIGITS } from './moire-glyphs.js';

export const W = 160, H = 80, N = W * H;
export const P = 5, U = 256 / P;                  // line pitch, phase units a pixel
export const GW = 81, GH = 41;                     // grid point (gx, gy) = pixel (2 gx, 2 gy)

export const SIZES = [
  { w: 32, h: 70, t: 9, xs: [4, 40], y: 6 },       // hours
  { w: 24, h: 46, t: 7, xs: [98, 126], y: 18 },    // minutes
];
export const SLOTS = [
  { size: 0, x: 4, y: 6 }, { size: 0, x: 40, y: 6 },
  { size: 1, x: 98, y: 18 }, { size: 1, x: 126, y: 18 },
];

// 5-7-11 chamfer distance (1/5 px) from every set pixel of a w x h mask
function chamfer(mask, w, h) {
  const D = new Uint16Array(w * h).fill(60000);
  for (let i = 0; i < w * h; i++) if (mask[i]) D[i] = 0;
  const CH = [[-1, 0, 5], [0, -1, 5], [-1, -1, 7], [1, -1, 7], [-2, -1, 11], [2, -1, 11], [-1, -2, 11], [1, -2, 11]];
  for (let pass = 0; pass < 2; pass++) {
    const sg = pass ? -1 : 1;
    for (let yy = 0; yy < h; yy++) {
      const y = pass ? h - 1 - yy : yy;
      for (let xx = 0; xx < w; xx++) {
        const x = pass ? w - 1 - xx : xx, i = y * w + x;
        let best = D[i];
        if (!best) continue;
        for (const [dx, dy, c] of CH) {
          const X = x + dx * sg, Y = y + dy * sg;
          if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
          const v = D[Y * w + X] + c;
          if (v < best) best = v;
        }
        D[i] = best;
      }
    }
  }
  return D;
}

export const DIST = [], CODE = [], TABLE = [];
for (const S of SIZES) {
  const G = DIGITS(S.w, S.h, S.t);
  // grid domain relative to the glyph's corner, for both slots
  const gx0 = -Math.max(...S.xs) / 2, gx1 = (W - Math.min(...S.xs)) / 2, gy0 = -S.y / 2, gy1 = (H - S.y) / 2;
  const TW = gx1 - gx0 + 1, TH = gy1 - gy0 + 1, cw = 2 * (TW - 1) + 1, chh = 2 * (TH - 1) + 1;
  TABLE.push({ TW, TH, gx0, gy0 });
  DIST.push(G.map((gl) => {
    const mask = new Uint8Array(cw * chh), ox = -2 * gx0, oy = -2 * gy0;
    for (let v = 0; v < gl.h; v++) for (let u = 0; u < gl.w; u++) if (gl.d[v * gl.w + u]) mask[(oy + v) * cw + ox + u] = 1;
    const D = chamfer(mask, cw, chh), t = new Uint8Array(TW * TH);
    for (let j = 0; j < TH; j++) for (let i = 0; i < TW; i++) t[j * TW + i] = Math.min(255, Math.round((D[2 * j * cw + 2 * i] * 2) / 5));
    return t;
  }));
  CODE.push(G.map((gl) => {
    const pw = gl.w + 4, ph = gl.h + 4, c = new Uint8Array(pw * ph);
    for (let v = 0; v < gl.h; v++) for (let u = 0; u < gl.w; u++) c[(v + 2) * pw + u + 2] = gl.d[v * gl.w + u];
    // moat: two pixels round the glyph (a rounded 5 x 5 neighbourhood)
    const src = c.slice();
    for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) {
      if (src[y * pw + x]) continue;
      for (let q = 0; q < 25; q++) {
        const dx = (q % 5) - 2, dy = ((q / 5) | 0) - 2;
        if (dx * dx + dy * dy > 5) continue;
        const X = x + dx, Y = y + dy;
        if (X >= 0 && Y >= 0 && X < pw && Y < ph && src[Y * pw + X]) { c[y * pw + x] = 16; break; }
      }
    }
    // counters: ground the box edge cannot reach
    const seen = new Uint8Array(pw * ph), st = [];
    for (let x = 0; x < pw; x++) st.push(x, (ph - 1) * pw + x);
    for (let y = 0; y < ph; y++) st.push(y * pw, y * pw + pw - 1);
    while (st.length) {
      const i = st.pop();
      if (seen[i] || (c[i] && c[i] < 16)) continue;
      seen[i] = 1;
      const x = i % pw;
      if (x > 0) st.push(i - 1);
      if (x < pw - 1) st.push(i + 1);
      if (i >= pw) st.push(i - pw);
      if (i < pw * ph - pw) st.push(i + pw);
    }
    for (let i = 0; i < pw * ph; i++) if (!seen[i] && !c[i]) c[i] = 16;
    return { pw, ph, c };
  }));
}

export const CT = new Uint8Array(GW * GH);
for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) CT[j * GW + i] = Math.min(255, Math.round(Math.hypot(2 * i - 80, 2 * j - 40) * 2));

export const RW = 96, RH = 56;
export const RT = new Uint16Array(RW * RH), AT = new Uint8Array(RW * RH);
for (let y = 0; y < RH; y++) for (let x = 0; x < RW; x++) {
  RT[y * RW + x] = Math.round(Math.hypot(x, y) * 16);
  AT[y * RW + x] = Math.round((Math.atan2(y, x) / (2 * Math.PI)) * 256) & 255;
}

/** Bytes of tables, for the report. */
export const FLASH = DIST.flat().reduce((a, t) => a + t.length, 0) + CODE.flat().reduce((a, t) => a + t.c.length, 0)
  + CT.length + RT.length * 2 + AT.length;
