// Discoball: the shared 64x64 linear-light canvas and the soft "spot of
// light" primitive everything is drawn with. Pixel centres sit on integers.
export const W = 64, H = 64;
export const img = new Float32Array(3 * W * H);
/** Where the time's own spots are: ambient spots dim there (a dark margin). */
export const mask = new Float32Array(W * H);

/** Which digit spot owns each pixel of the margin (index into the frame's spot list, or -1). */
export const owner = new Int16Array(W * H);
const ownerD = new Float32Array(W * H);
export function clear() { img.fill(0); mask.fill(0); owner.fill(-1); ownerD.fill(0); }

/**
 * A round spot of light at (x, y), radius r px: an anti-aliased disc core
 * plus a little glow. Adds (cr, cg, cb) * a.
 */
export function dot(x, y, r, cr, cg, cb, a) {
  const R = r + 1.3;
  const x0 = Math.max(0, Math.ceil(x - R)), x1 = Math.min(W - 1, Math.floor(x + R));
  const y0 = Math.max(0, Math.ceil(y - R)), y1 = Math.min(H - 1, Math.floor(y + R));
  for (let py = y0; py <= y1; py++) {
    const dy = py - y;
    for (let px = x0; px <= x1; px++) {
      const dx = px - x, d = Math.sqrt(dx * dx + dy * dy);
      if (d >= R) continue;
      let core = r + 0.5 - d; core = core < 0 ? 0 : core > 1 ? 1 : core;
      const g = 1 - d / R;
      const w = (0.86 * core + 0.14 * g * g) * a;
      const p = 3 * (py * W + px);
      img[p] += cr * w; img[p + 1] += cg * w; img[p + 2] += cb * w;
    }
  }
}

/** Stamp the dark-margin mask around a digit spot. */
export function stampMask(x, y, r, a, id = -1) {
  const x0 = Math.max(0, Math.ceil(x - r)), x1 = Math.min(W - 1, Math.floor(x + r));
  const y0 = Math.max(0, Math.ceil(y - r)), y1 = Math.min(H - 1, Math.floor(y + r));
  for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
    const dx = px - x, dy = py - y, d = 1 - (dx * dx + dy * dy) / (r * r);
    if (d > 0) {
      const q = py * W + px; mask[q] = Math.min(1, mask[q] + d * a * 3);
      if (id >= 0 && d * a > ownerD[q]) { ownerD[q] = d * a; owner[q] = id; }
    }
  }
}

/** A thin glint star: two crossed fading lines through (x, y). */
export function star(x, y, len, cr, cg, cb, a) {
  dot(x, y, 0.6, cr, cg, cb, a);
  for (let k = 1; k <= len; k++) {
    const f = a * (1 - k / (len + 1)) ** 2 * 0.55;
    dot(x + k, y, 0.15, cr, cg, cb, f); dot(x - k, y, 0.15, cr, cg, cb, f);
    dot(x, y + k, 0.15, cr, cg, cb, f); dot(x, y - k, 0.15, cr, cg, cb, f);
  }
}
