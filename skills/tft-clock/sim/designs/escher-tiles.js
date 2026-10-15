// The plane for escher.js: Escher's "regular division" of the square system,
// a translation tessellation whose tile morphs from place to place.
//
// A tile is drawn from two edge curves: T, the top edge from corner (0, 0)
// to (PX, 0), and L, the left edge from (0, 0) to (0, PY). The tile is
//     T,  then L + (PX, 0),  then T + (0, PY) backwards,  then L backwards,
// so whatever bulges out on one side is cut in on the other, and copies
// shifted by (PX, 0) and (0, PY) fill the plane with no gaps. The curves can
// curl (they are not graphs), which is what lets a tile become a bird.
//
// Creatures are curves with the same number of control points, so any blend
// of two is again a valid tile: the plain chessboard (straight edges), a
// bird flying right (wing raised, beak right, forked tail) and a fish. The
// tile is rasterised once per morph level into a lookup table over one cell,
// sampled 4x across (the plane scrolls by quarter pixels) and 1x down:
//   LAB  which neighbouring cell's tile owns the sample (di, dj in -1..1)
//   DST  the distance to the tile's outline, in 1/16 px (for anti-aliasing)
// On the device these are const tables in flash (sizes in FLASH_BYTES).

export const PX = 10, PY = 10;
export const W = 160, H = 80;
export const SUB = 4;                      // samples per pixel across
const CW = PX * SUB;                       // table width
const KX = PX / 10.5, KY = PY / 10;        // the curves are drawn on a 10.5 x 10 cell

// ------------------------------------------------------------ creature curves

const NT = 10, NL = 11;   // control points per curve, ends included

/** Points for the plain chessboard: straight edges. */
const line = (n, x1, y1) => Array.from({ length: n }, (_, k) => [x1 * k / (n - 1), y1 * k / (n - 1)]);

// Bird, flying right. T is the raised wing at the back, swept to a point;
// one row down the same curve is the notch in the belly where the next
// bird's wing fits. L as the right edge is the head and beak; as the left
// edge it is the forked tail (the notch the next bird's beak sits in, and a
// lower tail lobe). A repeated point keeps a tip sharp.
const BIRD = {
  T: [[0, 0], [1, -2], [2, -4.5], [2.6, -6.6], [2.6, -6.6], [4.6, -4], [6.6, -2], [8, -1.1], [9.4, -1.6], [10.5, 0]],
  L: [[0, 0], [1, 0.8], [2.3, 1.7], [3.8, 2.6], [3.8, 2.6], [1.7, 3.5], [0.4, 4.9], [-0.6, 6.4], [-2.4, 8.4], [-0.9, 9.4], [0, 10]],
};
// The same bird with its wing beaten down.
const BIRD_DOWN = {
  T: [[0, 0], [1, -0.6], [2, -1.4], [2.8, -2.4], [2.8, -2.4], [4.6, -1.8], [6.6, -1.1], [8, -0.8], [9.4, -1.6], [10.5, 0]],
  L: BIRD.L,
};
// Fish, swimming right: a swept dorsal fin on T; on L a round snout (right
// side) and, as the left side, a forked tail with two lobes.
const FISH = {
  T: [[0, 0], [1.5, 0.6], [3, 0.5], [4, -0.4], [4.6, -3.8], [4.6, -3.8], [6.4, -1.1], [8, -0.3], [9.4, 0.3], [10.5, 0]],
  L: [[0, 0], [-2.8, 0.3], [-1, 1.6], [1, 2.9], [2.5, 4], [3.2, 5], [2.5, 6], [1, 7.1], [-1, 8.4], [-2.8, 9.7], [0, 10]],
};
const SQUARE = { T: line(NT, 10.5, 0), L: line(NL, 0, 10) };
/** Eye centres in the cell (pixels): bird, fish. */
export const EYE_BIRD = [8.2 * KX, 1.9 * KY], EYE_FISH = [8.6 * KX, 4.0 * KY];

/** Chaikin corner cutting, ends kept: a smooth curve from control points. */
function smooth(pts, n = 2) {
  for (let r = 0; r < n; r++) {
    const o = [pts[0]];
    for (let k = 0; k < pts.length - 1; k++) {
      const [ax, ay] = pts[k], [bx, by] = pts[k + 1];
      o.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25], [ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75]);
    }
    o.push(pts[pts.length - 1]);
    pts = o;
  }
  return pts;
}
const lerpC = (a, b, u) => a.map(([x, y], k) => [(x + (b[k][0] - x) * u) * KX, (y + (b[k][1] - y) * u) * KY]);

/** The tile outline (closed polygon) for edge curves T and L. */
function outline(T, L) {
  const t = smooth(T), l = smooth(L);
  const poly = [...t];
  for (let k = 1; k < l.length; k++) poly.push([l[k][0] + PX, l[k][1]]);
  for (let k = t.length - 2; k >= 0; k--) poly.push([t[k][0], t[k][1] + PY]);
  for (let k = l.length - 2; k > 0; k--) poly.push([l[k][0], l[k][1]]);
  poly.x0 = Math.min(...poly.map((p) => p[0])); poly.x1 = Math.max(...poly.map((p) => p[0]));
  poly.y0 = Math.min(...poly.map((p) => p[1])); poly.y1 = Math.max(...poly.map((p) => p[1]));
  return poly;
}

function inside(px, py, poly) {
  if (px < poly.x0 || px > poly.x1 || py < poly.y0 || py > poly.y1) return false;
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function edgeDist(px, py, poly) {
  let d = 1e9;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[j], [bx, by] = poly[i];
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    let u = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    u = u < 0 ? 0 : u > 1 ? 1 : u;
    const ex = px - ax - u * dx, ey = py - ay - u * dy, e = ex * ex + ey * ey;
    if (e < d) d = e;
  }
  return Math.sqrt(d);
}

/** Rasterise one tile shape into a label table and a distance table. */
function bake(T, L) {
  const poly = outline(T, L);
  const lab = new Int8Array(CW * PY), dst = new Uint8Array(CW * PY);
  for (let y = 0; y < PY; y++)
    for (let sx = 0; sx < CW; sx++) {
      const px = (sx + 0.5) / SUB, py = y + 0.5;
      let found = 4;   // (di, dj) = (0, 0) by default
      for (let dj = -1; dj <= 1 && found === 4; dj++)
        for (let di = -1; di <= 1; di++)
          if (inside(px - di * PX, py - dj * PY, poly)) { found = (dj + 1) * 3 + (di + 1); break; }
      const di = (found % 3) - 1, dj = ((found / 3) | 0) - 1;
      lab[y * CW + sx] = found;
      dst[y * CW + sx] = Math.min(255, Math.round(edgeDist(px - di * PX, py - dj * PY, poly) * 16));
    }
  return { lab, dst };
}

// Morph levels along one chain: chessboard (0) -> bird (STEPS) -> fish
// (2 * STEPS); then FLAPS levels from the bird to its beaten-down wing.
export const STEPS = 16, FLAPS = 8, CHAIN = 2 * STEPS + 1, LEVELS = CHAIN + FLAPS;
export const LAB = [], DST = [];
const bounds = { x0: 0, x1: 0, y0: 0, y1: 0 };
/** Per level: the tile outline's extent relative to the cell corner [x0, x1, y0, y1]. */
export const LBOX = [];
for (let l = 0; l < LEVELS; l++) {
  let a, b, u;
  if (l < CHAIN) { a = l <= STEPS ? SQUARE : BIRD; b = l <= STEPS ? BIRD : FISH; u = l <= STEPS ? l / STEPS : (l - STEPS) / STEPS; }
  else { a = BIRD; b = BIRD_DOWN; u = (l - CHAIN + 1) / FLAPS; }
  const T = lerpC(a.T, b.T, u), L = lerpC(a.L, b.L, u);
  const poly = outline(T, L);
  LBOX.push([Math.floor(poly.x0) - 1, Math.ceil(poly.x1) + 1, Math.floor(poly.y0) - 1, Math.ceil(poly.y1) + 1]);
  bounds.x0 = Math.min(bounds.x0, poly.x0); bounds.x1 = Math.max(bounds.x1, poly.x1);
  bounds.y0 = Math.min(bounds.y0, poly.y0); bounds.y1 = Math.max(bounds.y1, poly.y1);
  const { lab, dst } = bake(T, L);
  LAB.push(lab); DST.push(dst);
}
export const TABLE_W = CW;
export const FLASH_BYTES = LEVELS * CW * PY * 2;
/** Tile outline extent over all levels, relative to the cell's corner. */
export const BOUNDS = { x0: Math.floor(bounds.x0) - 1, x1: Math.ceil(bounds.x1) + 1, y0: Math.floor(bounds.y0) - 1, y1: Math.ceil(bounds.y1) + 1 };
/** Morph level index for m in [0, 2] (0 chessboard, 1 bird, 2 fish). */
export const levelOf = (m) => { const l = (m * STEPS + 0.5) | 0; return l < 0 ? 0 : l >= CHAIN ? CHAIN - 1 : l; };
/** Level of a free bird with its wing at f (0 raised .. 1 beaten down). */
export const flapLevel = (f) => { const k = (f * (FLAPS + 1) - 0.5) | 0; return k <= 0 ? STEPS : CHAIN + (k > FLAPS ? FLAPS : k) - 1; };

/**
 * One whole tile, lifted out of the plane: level L with its cell corner at
 * (ox, oy) on the glass, colour c (0xRRGGBB) at opacity a, anti-aliased from
 * the distance table, with a cut line of colour `line` just inside the
 * outline if given. Quarter-pixel steps across, whole rows down.
 */
const ifloor = (v) => { const t = v | 0; return t > v ? t - 1 : t; };
const iceil = (v) => -ifloor(-v), iround = (v) => ifloor(v + 0.5);
const imin = (a, b) => (a < b ? a : b), imax = (a, b) => (a > b ? a : b);

export function drawTile(g, L, ox, oy, c, a = 1, line = -1, fast = false) {
  if (fast) return drawTileFast(g, L, ox, iround(oy), c, a, line);
  const lab = LAB[L], dst = DST[L];
  const bx = LBOX[L];
  const x0 = imax(0, ifloor(ox + bx[0])), x1 = imin(W, iceil(ox + bx[1]));
  const y0 = imax(0, ifloor(oy + bx[2])), y1 = imin(H, iceil(oy + bx[3] + 1));
  let n = 0;
  for (let y = y0; y < y1; y++) {
    // two table rows either side of the sample, blended: sub-pixel vertical motion
    const lyf = y + 0.5 - oy - 0.5, ly0 = ifloor(lyf), fy = lyf - ly0;
    for (let x = x0; x < x1; x++) {
      n++;
      const lx = x + 0.5 - ox, cx = ifloor(lx / PX), sx = ((lx - cx * PX) * SUB) | 0;
      let cov = 0, edge = 9;
      for (let q = 0; q < 2; q++) {
        const ly = ly0 + q, cy = ifloor(ly / PY), k = (ly - cy * PY) * CW + sx;
        const lb = lab[k], d = dst[k] * 0.0625;
        const own = cx + (lb % 3) - 1 === 0 && cy + ((lb / 3) | 0) - 1 === 0;
        const cv = own ? (d >= 0.5 ? 1 : 0.5 + d) : (d >= 0.5 ? 0 : 0.5 - d);
        cov += (q ? fy : 1 - fy) * cv;
        if (own && d < edge) edge = d;
      }
      if (cov <= 0.01) continue;
      g.put(x, y, line >= 0 && edge < 0.8 ? line : c, cov * a);
    }
  }
  g.cost.box += n * 7;
}

/** drawTile for fast flyers: whole-pixel rows, one table lookup a pixel (vertical motion is several px a frame anyway). */
function drawTileFast(g, L, ox, oy, c, a, line) {
  const lab = LAB[L], dst = DST[L], bx = LBOX[L];
  const x0 = imax(0, ifloor(ox + bx[0])), x1 = imin(W, iceil(ox + bx[1]));
  const y0 = imax(0, oy + bx[2]), y1 = imin(H, oy + bx[3]);
  let n = 0;
  for (let y = y0; y < y1; y++) {
    const ly = y - oy, cy = ifloor(ly / PY), row = (ly - cy * PY) * CW, jj = cy;
    for (let x = x0; x < x1; x++) {
      n++;
      const lx = x + 0.5 - ox, cx = ifloor(lx / PX), k = row + (((lx - cx * PX) * SUB) | 0);
      const lb = lab[k], d = dst[k] * 0.0625;
      const own = cx + (lb % 3) - 1 === 0 && jj + ((lb / 3) | 0) - 1 === 0;
      const cov = own ? (d >= 0.5 ? 1 : 0.5 + d) : (d >= 0.5 ? 0 : 0.5 - d);
      if (cov <= 0) continue;
      g.put(x, y, line >= 0 && own && d < 0.8 ? line : c, cov * a);
    }
  }
  g.cost.box += n * 4;
}
