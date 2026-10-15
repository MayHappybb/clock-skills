// Pixel loops for artillery.js, written the way the firmware would: integer
// RGB565 arithmetic straight into the frame buffer, no per-pixel callbacks.
// Each loop charges its own work to g.cost (box = a scanned pixel, blit = a
// sprite store, blend = an alpha blend) so the CPU estimate sees it.

export const W = 160, H = 80;

/** Blend two RGB565 values, a in 0..256 (256 = all of s). */
export function bl565(d, s, a) {
  const dr = d >> 11, dg = (d >> 5) & 63, db = d & 31;
  const r = dr + ((((s >> 11) - dr) * a) >> 8);
  const gg = dg + (((((s >> 5) & 63) - dg) * a) >> 8);
  const b = db + ((((s & 31) - db) * a) >> 8);
  return (r << 11) | (gg << 5) | b;
}

/**
 * Draw a terrain sprite. Its glyph origin goes to (x0, y0) (fractions of a
 * pixel allowed in y: rows are blended), rotated by `ang` radians about the
 * glyph point (px, py) (glyph coordinates). `pal` / `scorch` are RGB565
 * palettes; `cr` is a flat list of craters [cx, cy, r, ...] in glyph
 * coordinates, `nc` how many: inside one there is no ground, round its rim
 * the ground is burnt. `clipY`: rows at or below it are not drawn.
 */
export function blitTerrain(g, spr, x0, y0, ang, px, py, pal, scorch, cr, nc, clipY = H) {
  const buf = g.buf, sw = spr.w, sh = spr.h, idx = spr.idx, oy = spr.oy, cost = g.cost;
  const c = Math.cos(ang), s = Math.sin(ang);
  // the pivot on screen
  const PX = x0 + px, PY = y0 + py;
  // screen bounds of the rotated sprite
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  for (let k = 0; k < 4; k++) {
    const u = (k & 1 ? sw : 0) - px, v = (k & 2 ? sh - oy : -oy) - py;
    const X = PX + c * u - s * v, Y = PY + s * u + c * v;
    if (X < minX) minX = X; if (X > maxX) maxX = X; if (Y < minY) minY = Y; if (Y > maxY) maxY = Y;
  }
  const xa = Math.max(0, Math.floor(minX)), xb = Math.min(W - 1, Math.ceil(maxX));
  const ya = Math.max(0, Math.floor(minY)), yb = Math.min(clipY - 1, H - 1, Math.ceil(maxY));
  const frac = ang !== 0 || y0 !== Math.floor(y0);
  for (let y = ya; y <= yb; y++) {
    const dy = y + 0.5 - PY;
    // source coordinates at the row's first pixel, and their step along x
    let u = c * (xa + 0.5 - PX) + s * dy + px, v = -s * (xa + 0.5 - PX) + c * dy + py;
    for (let x = xa; x <= xb; x++, u += c, v -= s) {
      cost.box++;
      const iu = u < 0 ? -1 : u | 0;
      if (iu < 0 || iu >= sw) continue;
      // two rows, blended by the fraction (hard when it is whole)
      const fv = v - 0.5 + oy, j0 = ((fv + 1024) | 0) - 1024, t = frac ? ((fv - j0) * 256) | 0 : 0;
      let c0 = -1, c1 = -1;
      for (let k = 0; k < 2; k++) {
        const j = j0 + k;
        if (j < 0 || j >= sh || (k === 1 && t === 0)) continue;
        const p = idx[j * sw + iu];
        if (!p) continue;
        let col = pal[p];
        if (nc) {
          const gx = iu + 0.5, gy = j - oy + 0.5;
          for (let q = 0; q < nc; q++) {
            const ex = gx - cr[q * 3], ey = gy - cr[q * 3 + 1], rr = cr[q * 3 + 2], d2 = ex * ex + ey * ey;
            if (d2 < rr * rr) { col = -1; break; }
            if (d2 < (rr + 2.2) * (rr + 2.2)) col = scorch[p];
          }
          cost.box += nc * 2;
          if (col < 0) continue;
        }
        if (k === 0) c0 = col; else c1 = col;
      }
      if (c0 < 0 && c1 < 0) continue;
      const i = y * W + x;
      if (t === 0) { if (c0 >= 0) { buf[i] = c0; cost.blit++; } continue; }
      cost.blend++;
      if (c0 >= 0 && c1 >= 0) buf[i] = bl565(c0, c1, t);
      else if (c0 >= 0) buf[i] = bl565(buf[i], c0, 256 - t);
      else buf[i] = bl565(buf[i], c1, t);
    }
  }
}

/**
 * The sea in front: per column a wave height, then every pixel below it
 * tinted by depth (`tint[r]`, `alpha[r]` per row below the surface), a
 * foam line on the surface and travelling bands of light under it.
 * `surf` holds the surface height per column (float).
 */
export function sea(g, surf, tint, alpha, foam, band, T) {
  const buf = g.buf, cost = g.cost;
  const o1 = (T * 180) | 0, o2 = (T * -120) | 0;
  for (let x = 0; x < W; x++) {
    const sy = surf[x], y0 = Math.floor(sy), cov = (256 - (sy - y0) * 256) | 0;
    for (let y = y0 < 0 ? 0 : y0; y < H; y++) {
      const r = y - y0, i = y * W + x;
      cost.box++; cost.blend++;
      let d = bl565(buf[i], tint[r], alpha[r]);
      if (r === 0) d = bl565(buf[i], foam, cov);
      else if (r === 1) d = bl565(d, foam, 110);
      else if (r === 4 || r === 9) {
        // two bands of glints travelling in opposite directions
        const ph = ((x * 21 + (r === 4 ? o1 : o2) + r * 37) & 255);
        const tri = ph < 128 ? ph : 255 - ph;
        if (tri > 70) d = bl565(d, band, (tri - 70) * 2);
      }
      buf[i] = d;
    }
  }
}
