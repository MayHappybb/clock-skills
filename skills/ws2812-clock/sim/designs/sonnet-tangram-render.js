// Rasterizer + materials for sonnet-tangram: fills a set of named, already-
// transformed tangram-piece polygons into a 192x192 linear-light image
// buffer, one piece at a time, with coverage anti-aliasing and simple
// wood/glass shading (flat body tint + a soft diagonal highlight band + a
// darker bevel ring near the edge). Pieces are drawn back-to-front in a
// fixed order so overlaps at touching seams don't flicker.

export const ORDER = ['medTri', 'parallelogram', 'smallTri1', 'smallTri2', 'square', 'bigTri1', 'bigTri2'];

// ----------------------------------------------------------- scan-fill
/**
 * Rasterize one convex-ish polygon (array of [x,y] in pixel space) into img
 * (Float32Array, 3*W*H, linear) using scanline fill with 1px edge AA via
 * coverage from the fractional span at each row's left/right crossing.
 * shade(px, py, u, v) -> [r,g,b] gets the pixel centre and the polygon's
 * local u/v (0..1 across the row span) for a cheap left-to-right gradient.
 */
export function fillPoly(img, W, H, poly, shade) {
  let minY = Infinity, maxY = -Infinity;
  for (const [, y] of poly) { if (y < minY) minY = y; if (y > maxY) maxY = y; }
  const y0 = Math.max(0, Math.floor(minY)), y1 = Math.min(H - 1, Math.ceil(maxY));
  const n = poly.length;
  for (let py = y0; py <= y1; py++) {
    const sy = py + 0.5;
    // find x-crossings of the polygon edges at scanline sy
    let xs = [];
    for (let i = 0; i < n; i++) {
      const [ax, ay] = poly[i], [bx, by] = poly[(i + 1) % n];
      if (ay === by) continue;
      if ((sy >= ay && sy < by) || (sy >= by && sy < ay)) {
        const t = (sy - ay) / (by - ay);
        xs.push(ax + t * (bx - ax));
      }
    }
    if (xs.length < 2) continue;
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xl = xs[k], xr = xs[k + 1];
      if (xr <= xl) continue;
      const px0 = Math.max(0, Math.floor(xl)), px1 = Math.min(W - 1, Math.ceil(xr) - 1);
      for (let px = px0; px <= px1; px++) {
        const cx = px + 0.5;
        // coverage: how much of this pixel's [px,px+1) span lies in [xl,xr)
        const l = Math.max(px, xl), r = Math.min(px + 1, xr);
        const cov = Math.max(0, r - l);
        if (cov <= 0) continue;
        const u = (cx - xl) / Math.max(1e-6, xr - xl);
        const c = shade(cx, sy, u);
        const p = 3 * (py * W + px);
        img[p] += c[0] * cov; img[p + 1] += c[1] * cov; img[p + 2] += c[2] * cov;
      }
    }
  }
}

// ----------------------------------------------------------- materials
// Two materials, chosen per time-unit: lacquered wood (warm) and cut glass
// (cool). Each gives a body colour plus a highlight tint and a dark bevel
// tint; the renderer composites body*coverage, then adds a soft moving
// highlight band and a bevel darkening near computed polygon edges.
export const WOOD = { body: [0.46, 0.14, 0.05], hi: [0.9, 0.5, 0.22], bevel: [0.18, 0.04, 0.01] };
export const GLASS = { body: [0.05, 0.22, 0.34], hi: [0.55, 0.85, 0.95], bevel: [0.02, 0.08, 0.14] };
export const LACQUER_RED = { body: [0.5, 0.03, 0.03], hi: [0.95, 0.35, 0.2], bevel: [0.16, 0.0, 0.0] };
export const JADE = { body: [0.04, 0.26, 0.15], hi: [0.5, 0.9, 0.6], bevel: [0.01, 0.09, 0.04] };

/** Pick a material for a given time-unit slot (0=H tens,1=H units,2=M tens,3=M units), stable per minute. */
export function materialFor(slot, minuteSeed) {
  const mats = [WOOD, GLASS, LACQUER_RED, JADE];
  return mats[(slot + minuteSeed) % mats.length];
}

/**
 * Shade a polygon fill with a lamp highlight that glides diagonally across
 * the whole board over time (shared phase so all pieces breathe together),
 * plus a touch of per-piece centroid-based banding so pieces read as
 * separate solid objects, not one flat wash.
 * cx, cy: polygon centroid in pixel space (for a stable per-piece tint offset).
 */
export function makeShader(mat, cx, cy, lampPhase, shimmer) {
  const [bx, by, bz] = mat.body, [hx, hy, hz] = mat.hi;
  const pieceTint = 0.9 + 0.1 * Math.sin(cx * 0.7 + cy * 1.3);
  return (px, py, u) => {
    // lamp glint: a soft band travelling across the board (world-space, not
    // per-piece), so it reads as one shared light source gliding over glass/wood
    const band = Math.sin((px + py) * 0.05 - lampPhase);
    const glint = Math.max(0, band) ** 6 * 0.35;
    const edgeFade = 1 - Math.abs(u - 0.5) * 0.25; // faint rounding toward piece edges
    const k = pieceTint * edgeFade + shimmer;
    return [
      (bx + (hx - bx) * glint) * k,
      (by + (hy - by) * glint) * k,
      (bz + (hz - bz) * glint) * k,
    ];
  };
}

export function centroidOf(poly) {
  let x = 0, y = 0;
  for (const [px, py] of poly) { x += px; y += py; }
  return [x / poly.length, y / poly.length];
}
