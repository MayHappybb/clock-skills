// Terrain numerals for artillery.js: ten landforms, built once at start-up
// as palette-index sprites (one byte a pixel; the firmware keeps them in
// flash). Each digit is a chunky letterform of rounded-rectangle rings and
// capsules, eroded at the edge by noise so it reads as dug-out earth, with a
// flared foot below the waterline. Texture: grass on every upward face,
// blades sticking up; a dark keyline round the outside; strata bands by
// absolute height (so all four islands share the same geology); pebbles and
// the odd bone.

import { rand, noise, noise2, roundRectDist, segDist } from '../js/kit.js';

export const MARGIN = 2;          // rows above the glyph (grass blades)
export const FOOT = 10;           // rows below the glyph (the flared foot under water)

// palette indices
export const I = {
  NONE: 0, TIP: 1, GR_HI: 2, GR: 3, GR_DK: 4, EDGE: 5,
  BAND: 6,                        // 6..15: five strata, light/dark each
  PEB: 16, PEB_DK: 17, BONE: 18, N: 19,
};

/** Is pixel (x, y) of digit d (cell w x h, stroke s) inside the letterform? Pixel centres. */
function inside(d, x, y, w, h, s) {
  const r = s / 2, L = r, Rr = w - r, T = r, B = h - r, cx = w / 2;
  const ring = (x0, y0, x1, y1, rc) => Math.abs(roundRectDist(x, y, x0, y0, x1 - x0, y1 - y0, rc)) - r <= 0;
  const seg = (ax, ay, bx, by, rr = r) => segDist(x, y, ax, ay, bx, by) - rr <= 0;
  const H = B - T;
  switch (d) {
    case 0: return ring(L, T, Rr, B, (Rr - L) * 0.5);
    case 1: {
      const sx = w * 0.56;
      return seg(sx, T, sx, B) || seg(sx, T + 0.5, sx - w * 0.36, T + H * 0.2) || seg(w * 0.16, B, w * 0.92, B, r * 0.92);
    }
    case 2: {
      const rw = (Rr - L) / 2, cy = T + rw;
      const arc = ring(L, T, Rr, T + 2 * rw, rw) && (y <= cy || (x > cx && y < cy + rw * 0.55));
      const a = 0.62, ex = cx + rw * Math.cos(a), ey = cy + rw * Math.sin(a);
      return arc || seg(ex, ey, L + 0.5, B - 0.5) || seg(L, B, Rr, B);
    }
    case 3: {
      const M = T + H * 0.47;
      const top = ring(L + 1, T, Rr - 1, M, (M - T) * 0.5) && (x >= cx - 2 || y <= T + s * 0.9);
      const bot = ring(L, M, Rr, B, (B - M) * 0.5) && (x >= cx - 2 || y >= B - s * 0.9);
      return top || bot;
    }
    case 4: {
      const sx = Rr - s * 0.35, Y = T + H * 0.66;
      return seg(sx, T, sx, B) || seg(sx, T, L, Y) || seg(L, Y, Rr + 0.5, Y);
    }
    case 5: {
      const M = T + H * 0.4, rcB = (B - M) * 0.5;
      const bowl = ring(L, M, Rr, B, rcB) && (x >= cx - 1 || y >= M + rcB);
      return seg(L + 0.5, T, Rr, T) || seg(L + 0.5, T, L + 0.5, M + 1) || bowl;
    }
    case 6: {
      const M = T + H * 0.42, rc = (Rr - L) / 2;
      const outer = ring(L, T, Rr, B, rc) && (x <= cx || (y <= T + s * 0.9 && x < Rr - 1));
      const bowl = ring(L, M, Rr, B, Math.min(rc, (B - M) * 0.5));
      return outer || bowl;
    }
    case 7: {
      return seg(L, T, Rr, T) || seg(Rr, T, cx - s * 0.2, B) || seg(L, T, L, T + s * 0.45);
    }
    case 8: {
      const M = T + H * 0.45;
      return ring(L + 1.2, T, Rr - 1.2, M, (M - T) * 0.5) || ring(L, M, Rr, B, (B - M) * 0.5);
    }
    case 9: {
      const M = T + H * 0.58, rc = (Rr - L) / 2;
      const outer = ring(L, T, Rr, B, rc) && (x >= cx || (y >= B - s * 0.9 && x > L + 1));
      const bowl = ring(L, T, Rr, M, Math.min(rc, (M - T) * 0.5));
      return outer || bowl;
    }
  }
  return false;
}

/**
 * Build digit d's sprite for a slot whose glyph is w x h with stroke s and
 * whose glyph top sits at absolute row `top` (strata are by absolute row).
 * Returns { w, h: total rows, oy: rows above the glyph, idx: Uint8Array,
 * top: Int16Array (first solid row per column, glyph coords), perch: [a, b] }.
 */
export function buildDigit(d, w, h, s, top, seed) {
  const SW = w, SH = MARGIN + h + FOOT;
  const solid = new Uint8Array(SW * SH);
  const at = (x, y) => (x < 0 || y < 0 || x >= SW || y >= SH ? 0 : solid[y * SW + x]);
  // the letterform, eroded
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const px = x + 0.5, py = y + 0.5;
      let ok = inside(d, px, py, w, h, s);
      // erosion: probe a jittered point, so the edge wobbles by about a pixel
      const jx = (noise2(x * 0.33, y * 0.33, seed + d * 7) - 0.5) * 1.9;
      const jy = (noise2(x * 0.33, y * 0.33, seed + d * 7 + 3) - 0.5) * 1.6;
      const ok2 = inside(d, px + jx, py + jy, w, h, s);
      ok = ok2;
      if (ok) solid[(y + MARGIN) * SW + x] = 1;
    }
  // the underside: a rocky cone tapering down from whatever the bottom row
  // holds, so an airdropped island looks like a clod torn out of the ground
  for (let k = 0; k < FOOT; k++) {
    const y = MARGIN + h + k;
    for (let x = 0; x < SW; x++) {
      const bite = rand(x, k, seed + d) < 0.35 ? 1 : 0;
      if (at(x, y - 1) && at(x - 1 - bite, y - 1) && at(x + 1 + (1 - bite) * (k & 1), y - 1)) solid[y * SW + x] = 1;
    }
  }
  // texture
  const idx = new Uint8Array(SW * SH);
  for (let y = 0; y < SH; y++)
    for (let x = 0; x < SW; x++) {
      if (!at(x, y)) continue;
      const gy = top + y - MARGIN;           // absolute row
      const up1 = !at(x, y - 1), up2 = !at(x, y - 2), up3 = !at(x, y - 3);
      const side = !at(x - 1, y) || !at(x + 1, y) || !at(x, y + 1);
      let v;
      if (y >= MARGIN + h) {
        // the foot, under water: bare rock
        v = side ? I.EDGE : I.BAND + 8 + (noise2(x * 0.45, gy * 0.6, 21) > 0.55 ? 1 : 0);
      } else if (up1) v = I.GR_HI;
      else if (up2) v = I.GR;
      else if (up3 && !side) v = I.GR_DK;
      else if (side) v = I.EDGE;
      else {
        const wave = 3 * noise(x * 0.15 + seed, 5) + 1.2 * noise(x * 0.5, 9);
        const band = Math.max(0, Math.min(4, Math.floor((gy - 17 + wave) / 11)));
        const speck = noise2(x * 0.45, gy * 0.6, 21) > 0.6 || ((gy + Math.round(wave)) % 11 === 0 && rand(x, gy, 4) > 0.3);
        v = I.BAND + band * 2 + (speck ? 1 : 0);
        if (rand(x >> 1, gy >> 1, seed + 77) > 0.955) v = ((x ^ gy) & 1) ? I.PEB : I.PEB_DK;
        if (band >= 2 && band <= 3 && rand(x, gy, seed + 91) > 0.996) v = I.BONE;
      }
      idx[y * SW + x] = v;
    }
  // turf draped over the edges: grass hangs a pixel or three down the sides
  for (let y = 0; y < MARGIN + h; y++)
    for (let x = 0; x < SW; x++) {
      if (idx[y * SW + x] !== I.GR_HI) continue;
      for (const sx of [-1, 1]) {
        if (at(x + sx, y) || at(x + sx, y + 1)) continue;
        const len = 1 + Math.floor(rand(x, y, seed + 13) * 3);
        for (let k = 1; k <= len && y + k < MARGIN + h; k++) if (idx[(y + k) * SW + x] === I.EDGE) idx[(y + k) * SW + x] = k === len ? I.GR_DK : I.GR;
      }
    }
  // grass blades above the surface
  for (let y = 1; y < SH; y++)
    for (let x = 0; x < SW; x++)
      if (idx[y * SW + x] === I.GR_HI && !at(x, y - 1) && rand(x, y, seed + d) > 0.55) {
        idx[(y - 1) * SW + x] = I.TIP;
        if (rand(x, y, seed + 5) > 0.8 && y > 1 && !at(x, y - 2)) idx[(y - 2) * SW + x] = I.TIP;
      }
  // the top profile (craters land on it)
  const topRow = new Int16Array(SW).fill(999);
  for (let x = 0; x < SW; x++) for (let y = 0; y < SH; y++) if (at(x, y)) { topRow[x] = y - MARGIN; break; }
  // ledges a worm can stand on: the island's skyline, ground with nothing
  // above it (never inside a counter or a bowl, where a worm would change
  // the digit's shape), as runs of near-level ground at least 9 px long
  const out = new Uint8Array(SW * SH), stack = [];
  for (let x = 0; x < SW; x++) stack.push(x);
  for (let y = 0; y < MARGIN + h; y++) stack.push(y * SW, y * SW + SW - 1);
  while (stack.length) {
    const k = stack.pop(), x = k % SW, y = (k / SW) | 0;
    if (out[k] || solid[k] || y >= MARGIN + h) continue;
    out[k] = 1;
    if (x > 0) stack.push(k - 1); if (x < SW - 1) stack.push(k + 1); if (y > 0) stack.push(k - SW); stack.push(k + SW);
  }
  const runs = [];
  for (let x = 0; x < SW; x++)
    for (let y = MARGIN; y < MARGIN + h - 4; y++) {
      if (!at(x, y) || at(x, y - 1) || !out[(y - 1) * SW + x]) continue;
      let clear = true;
      for (let k = 1; k <= y && clear; k++) if (at(x, y - k)) clear = false;
      if (!clear) continue;
      const gy = y - MARGIN;
      const r = runs.find((q) => q.b === x - 1 && Math.abs(q.ys[q.ys.length - 1] - gy) <= 3);
      if (r) { r.b = x; r.ys.push(gy); } else runs.push({ a: x, b: x, ys: [gy] });
    }
  const ledges = runs.filter((r) => r.b - r.a >= 8).map((r) => ({ a: r.a, b: r.b, y: Int16Array.from(r.ys), mean: r.ys.reduce((u, v) => u + v, 0) / r.ys.length }));
  ledges.sort((p, q) => p.mean - q.mean);
  return { w: SW, h: SH, oy: MARGIN, idx, top: topRow, ledges };
}
