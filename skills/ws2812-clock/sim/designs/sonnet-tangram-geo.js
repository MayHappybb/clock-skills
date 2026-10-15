// Geometry for sonnet-tangram: the 7 classic tangram pieces, exact (shoelace-
// verified, zero-overlap) on a side-4 square, plus per-digit placements built
// from verified rigid sub-assemblies (not hand-guessed coordinates).
//
// Pieces, in the home square A(0,0) B(4,0) C(4,4) D(0,4):
//   bigTri1 [[0,0],[2,2],[0,4]]        area 4  (legs 2sqrt2, hyp 4)
//   bigTri2 [[0,4],[2,2],[4,4]]        area 4
//   medTri  [[2,0],[4,0],[4,2]]        area 2  (legs 2, hyp 2sqrt2)
//   smallTri1 [[0,0],[2,0],[1,1]]      area 1  (legs sqrt2, hyp 2)
//   smallTri2 [[2,2],[3,1],[3,3]]      area 1
//   square [[1,1],[2,0],[3,1],[2,2]]   area 2  (side sqrt2)
//   parallelogram [[3,1],[4,2],[4,4],[3,3]] area 2
export const PIECES = {
  bigTri1: [[0, 0], [2, 2], [0, 4]],
  bigTri2: [[0, 4], [2, 2], [4, 4]],
  medTri: [[2, 0], [4, 0], [4, 2]],
  smallTri1: [[0, 0], [2, 0], [1, 1]],
  smallTri2: [[2, 2], [3, 1], [3, 3]],
  square: [[1, 1], [2, 0], [3, 1], [2, 2]],
  parallelogram: [[3, 1], [4, 2], [4, 4], [3, 3]],
};
export const PIECE_NAMES = Object.keys(PIECES);

function centroid(poly) {
  let x = 0, y = 0;
  for (const [px, py] of poly) { x += px; y += py; }
  return [x / poly.length, y / poly.length];
}
export const CENTROID = {};
for (const n of PIECE_NAMES) CENTROID[n] = centroid(PIECES[n]);

/**
 * Place a piece: (dx, dy) is where its OWN centroid lands, in a digit's local
 * unit space; rot in degrees about that centroid; flip mirrors it first
 * (only the parallelogram is normally flipped, as real tangram sets allow).
 * Returns a flat polygon (array of [x, y]).
 */
export function placePiece(name, dx, dy, rot = 0, flip = false) {
  const poly = PIECES[name], c = CENTROID[name];
  const r = (rot * Math.PI) / 180, cs = Math.cos(r), sn = Math.sin(r);
  const out = new Array(poly.length);
  for (let i = 0; i < poly.length; i++) {
    let x = poly[i][0] - c[0], y = poly[i][1] - c[1];
    if (flip) x = -x;
    const rx = x * cs - y * sn, ry = x * sn + y * cs;
    out[i] = [rx + dx, ry + dy];
  }
  return out;
}

/**
 * Digits built from the seven real pieces, not a segment font. Each piece
 * keeps its own natural wedge/kite silhouette -- there is no rectangular
 * "bar" piece -- so every numeral stroke is either: (a) a piece's own
 * straight edge, used face-on as a wall (a big triangle stood on its point
 * has one straight leg, which becomes a numeral's vertical side), (b) a
 * piece's point turned inward to pinch a waist (8's crossing, 0/6/9's
 * loop-to-tail joins), or (c) a small flat run of small triangle + square +
 * small triangle laid in a row as a cap or foot. The parallelogram, already
 * a slanted bar, fills waists and diagonals. Placements were worked out by
 * hand against an ASCII render (half-unit grid, 45-degree rotation steps,
 * parallelogram flip available), then accepted per-digit at legibility --
 * gaps and corner-only contact are left in on purpose, same as a real
 * tangram figure, and in a few digits a piece reads as a serif/foot rather
 * than as part of the main stroke.
 * Each entry is [pieceName, targetBboxCenterX, targetBboxCenterY, rotDeg,
 * flip] -- the target is the piece's OWN axis-aligned bbox centre at that
 * rotation (not its centroid), which is what makes "stand this piece's
 * straight edge at x = ..." reasoning tractable.
 */
const DIGIT_SPECS = {
  0: [
    // open ring: the two big triangles' straight edges face each other with
    // a real gap between their points (not touching), unlike 8's pinch.
    ['bigTri1', -1.375, 0, 0, false],
    ['bigTri2', 1.375, 0, 270, false],
    ['smallTri1', -0.9, -4.3, 0, false],
    ['square', 0.1, -4.3, 45, false],
    ['smallTri2', 1.0, -4.3, 90, false],
    ['medTri', -0.3, 4.3, 180, false],
    ['parallelogram', 0, 0, 90, false],
  ],
  1: [
    ['bigTri2', 0, 0, 90, false],
    ['bigTri1', -1.3, -2.6, 135, false],
    ['medTri', 0, 3.4, 0, false],
    ['square', -1.1, 4.2, 45, false],
    ['parallelogram', 1.1, 4.0, 90, false],
    ['smallTri1', -1.6, 4.9, 0, false],
    ['smallTri2', 1.5, 4.9, 90, false],
  ],
  2: [
    ['bigTri2', 0.3, -4, 0, false],
    ['bigTri1', -0.2, 0, 315, false],
    ['medTri', -1.6, -4, 180, false],
    ['parallelogram', 1.3, -2.5, 45, false],
    ['smallTri1', -0.9, 4.3, 0, false],
    ['square', 0.1, 4.3, 45, false],
    ['smallTri2', 1.3, 2.0, 0, false],
  ],
  3: [
    ['bigTri2', 0.3, -4, 0, false],
    ['bigTri1', 0.3, 0, 90, false],
    ['medTri', -1.6, -4, 180, false],
    ['parallelogram', 1.6, -2, 90, false],
    ['smallTri1', -0.9, 4.3, 0, false],
    ['square', 0.1, 4.3, 45, false],
    ['smallTri2', 1.6, 2, 90, false],
  ],
  4: [
    ['bigTri2', 1.0, 0, 90, false],
    ['bigTri1', -0.8, -1.8, 0, false],
    ['medTri', -1.3, 1.0, 90, false],
    ['parallelogram', 0.2, 1.0, 90, false],
    ['smallTri1', -1.8, -4.3, 0, false],
    ['square', 1.0, -4.3, 45, false],
    ['smallTri2', 1.0, 4.3, 90, false],
  ],
  5: [
    ['bigTri2', -0.5, -4, 0, false],
    ['bigTri1', -1.2, -0.3, 90, false],
    ['medTri', 1.3, -4, 180, false],
    ['parallelogram', 0.5, 1.6, 45, false],
    ['smallTri1', -0.9, 4.3, 0, false],
    ['square', 0.1, 4.3, 45, false],
    ['smallTri2', 1.6, 2.2, 90, false],
  ],
  6: [
    // open loop at the bottom (same wide gap as 0), tail curling up top-left.
    ['bigTri1', -1.375, 1.6, 0, false],
    ['bigTri2', 1.375, 1.6, 270, false],
    ['smallTri1', -0.9, -2.6, 0, false],
    ['square', 0.1, -2.6, 45, false],
    ['parallelogram', 0, 1.6, 90, false],
    ['medTri', -0.3, 5.9, 180, false],
    ['smallTri2', -0.6, -4.4, 90, false],
  ],
  7: [
    ['bigTri2', 0, -4, 270, false],
    ['bigTri1', 0.3, -0.5, 0, false],
    ['medTri', -1.8, -4, 180, false],
    ['square', 1.9, -4, 0, false],
    ['parallelogram', -0.3, 3.0, 0, false],
    ['smallTri1', 1.6, 2.0, 90, false],
    ['smallTri2', -1.1, 2.2, 0, false],
  ],
  8: [
    // pinched waist: the two big triangles point inward and nearly meet,
    // unlike 0's open gap -- this is the "turn the points inward" pinch.
    ['bigTri1', -0.75, 0, 180, false],
    ['bigTri2', 0.75, 0, 90, false],
    ['smallTri1', -0.9, -4.3, 0, false],
    ['square', 0.1, -4.3, 45, false],
    ['smallTri2', 1.0, -4.3, 90, false],
    ['medTri', -0.3, 4.3, 180, false],
    ['parallelogram', 0, 0, 90, false],
  ],
  9: [
    // open loop at the top (same wide gap as 0), tail descending bottom-right.
    ['bigTri1', -1.375, -1.6, 0, false],
    ['bigTri2', 1.375, -1.6, 270, false],
    ['smallTri1', -0.9, -5.9, 0, false],
    ['square', 0.1, -5.9, 45, false],
    ['parallelogram', 0, -1.6, 90, false],
    ['medTri', -0.3, 2.6, 0, false],
    ['smallTri2', 0.6, 4.4, 90, false],
  ],
};

/** Axis-aligned bbox of a piece polygon. */
function bbox(poly) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of poly) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  return [minX, minY, maxX, maxY];
}

/**
 * Place a piece so its OWN axis-aligned bbox centre lands at (tx, ty), at
 * the given rotation/flip -- easier to reason about than centroid placement
 * when the goal is "put this piece's straight edge at x = ...".
 */
function placeByBboxCenter(name, tx, ty, rot, flip) {
  const probe = placePiece(name, 0, 0, rot, flip); // centroid at origin, to read off the bbox offset
  const [minX, minY, maxX, maxY] = bbox(probe);
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  return placePiece(name, tx - cx, ty - cy, rot, flip);
}

// A small inward pull on every piece's target position (not on rotation),
// applied uniformly after placement was worked out by hand -- pieces that
// read fine individually left too much dead air between them at the panel's
// actual size; pulling each 20% toward the digit's own origin keeps every
// stroke's shape and relative layout but closes that gap so the seven
// pieces read as one numeral instead of a scatter of unrelated shapes.
const TIGHTEN = 0.8;

export function digitPolys(d) {
  const spec = DIGIT_SPECS[d];
  const polys = {};
  for (const [name, tx, ty, rot, flip] of spec) {
    polys[name] = placeByBboxCenter(name, tx * TIGHTEN, ty * TIGHTEN, rot, flip);
  }
  return polys;
}

/** Bbox of the whole digit (all 7 pieces), used to centre/scale each digit consistently. */
function digitBounds(d) {
  const polys = digitPolys(d);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const name of PIECE_NAMES) {
    for (const [x, y] of polys[name]) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
  return [minX, minY, maxX, maxY];
}

// Per-digit centring + normalising scale: every digit's full 7-piece bbox is
// centred and scaled to a common height, so every numeral reads at the same
// size on its panel regardless of its own local layout quirks.
const TARGET_HEIGHT = 13;
export const DIGIT_FRAME = {};
for (let d = 0; d <= 9; d++) {
  const [minX, minY, maxX, maxY] = digitBounds(d);
  const h = maxY - minY || 1;
  DIGIT_FRAME[d] = { ox: (minX + maxX) / 2, oy: (minY + maxY) / 2, k: TARGET_HEIGHT / h };
}

export const DIGIT_BOUNDS = [-4, -8, 4, 8]; // local unit-space bbox, with margin
