// Gobbler, the maze: the time is the walls. Each digit is a run of arcade
// maze wall (a skeleton drawn as a double line, chamfered corners, round
// end caps), sized so its bays are exactly one frog wide: the frog can hop
// into the crook of a 2 or the open top of a 4. Walls glide from one digit
// to the next: every wall piece of the old digit is matched to one of the
// new digit (Hungarian), and slides, stretches or turns into place; spare
// pieces split off a neighbour or merge into one, so no wall ever vanishes.

export const N = 64;
export const W = 17, H = 20;                      // digit skeleton box (pixels)
export const BOX = [[10, 7], [36, 7], [10, 36], [36, 36]];   // skeleton origins: H H / M M
export const LANES = { x: [5.5, 31.5, 57.5], y: [5.5, 31.5, 57.5] };

// Strokes in box units: [points, chamfer, closed?]. A chamfer cuts every
// corner of the stroke at that size (clamped to half the shorter side).
const S = (pts, r = 4, closed = false) => ({ pts, r, closed });
export const GLYPHS = {
  0: [S([[0, 0], [17, 0], [17, 20], [0, 20]], 6.5, true)],
  1: [S([[3, 5], [3, 0, 2.5], [9, 0, 2.5], [9, 20, 0]], 3), S([[2, 20], [16, 20]])],
  2: [S([[0, 5], [0, 0, 5], [17, 0, 6], [17, 10, 5], [0, 10, 5], [0, 20, 0], [17, 20]], 4.5)],
  3: [S([[0, 4], [0, 0, 2], [17, 0, 6], [17, 20, 6], [0, 20, 2], [0, 16]], 4.5), S([[7, 10], [17, 10]])],
  4: [S([[0, 0], [0, 12, 3], [17, 12]], 3), S([[12, 0], [12, 20]])],
  5: [S([[17, 0], [0, 0, 0], [0, 10, 0], [17, 10, 6], [17, 20, 6], [0, 20, 2], [0, 16]], 4.5)],
  6: [S([[17, 4], [17, 0, 2], [0, 0, 7], [0, 20, 6], [17, 20, 6], [17, 10, 5], [0, 10, 0]], 4.5)],
  7: [S([[0, 5], [0, 0, 2], [17, 0, 3], [7, 20]], 3)],
  8: [S([[1.5, 0], [15.5, 0], [15.5, 10], [1.5, 10]], 4.5, true), S([[0, 10], [17, 10], [17, 20], [0, 20]], 5.5, true)],
  9: [S([[17, 10, 0], [0, 10, 5], [0, 0, 6], [17, 0, 6], [17, 20, 7], [0, 20, 2], [0, 16]], 4.5)],
};

/** A stroke's polyline with chamfered corners, as segments [ax, ay, bx, by]. */
function strokeSegs({ pts, r, closed }, ox, oy) {
  const n = pts.length, P = pts.map(([x, y]) => [x + ox, y + oy]);
  const out = [];
  // each corner is cut by a two-chord arc of radius c (the vertex's own r, or the stroke's)
  const pts2 = [];
  for (let k = 0; k < n; k++) {
    const p = P[k];
    if ((!closed && (k === 0 || k === n - 1)) || pts[k][2] === 0) { pts2.push(p); continue; }
    const a = P[(k - 1 + n) % n], b = P[(k + 1) % n];
    const la = Math.hypot(a[0] - p[0], a[1] - p[1]), lb = Math.hypot(b[0] - p[0], b[1] - p[1]);
    const c = Math.min(pts[k][2] ?? r, la / 2, lb / 2);
    const ux = (a[0] - p[0]) / la, uy = (a[1] - p[1]) / la, vx = (b[0] - p[0]) / lb, vy = (b[1] - p[1]) / lb;
    const bx = ux + vx, by = uy + vy, bl = Math.hypot(bx, by) || 1;
    const cosA = ux * vx + uy * vy, half = Math.acos(Math.max(-1, Math.min(1, cosA))) / 2;
    // arc midpoint: distance from the vertex along the bisector
    const m = c * (1 / Math.cos(half) - Math.tan(half));
    pts2.push([p[0] + ux * c, p[1] + uy * c], [p[0] + bx / bl * m, p[1] + by / bl * m], [p[0] + vx * c, p[1] + vy * c]);
  }
  if (closed) pts2.push(pts2[0]);
  for (let k = 0; k + 1 < pts2.length; k++) {
    const [a, b] = [pts2[k], pts2[k + 1]];
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 1e-6) out.push([a[0], a[1], b[0], b[1]]);
  }
  return out;
}

export function glyphSegs(d, slot) {
  const [ox, oy] = BOX[slot];
  return GLYPHS[d].flatMap((s) => strokeSegs(s, ox, oy));
}
export const BORDER = [
  ...strokeSegs(S([[1, 28], [1, 1], [62, 1], [62, 28]], 5), 0, 0),
  ...strokeSegs(S([[1, 35], [1, 62], [62, 62], [62, 35]], 5), 0, 0),
];

// ------------------------------------------------------------ the morph
function segCost(a, b) {
  const d1 = Math.hypot(a[0] - b[0], a[1] - b[1]) + Math.hypot(a[2] - b[2], a[3] - b[3]);
  const d2 = Math.hypot(a[0] - b[2], a[1] - b[3]) + Math.hypot(a[2] - b[0], a[3] - b[1]);
  return d1 <= d2 ? [d1, false] : [d2, true];
}
/** Min-cost assignment for a square cost matrix (n <= ~40): row -> col. */
function hungarian(C) {
  const n = C.length, INF = 1e18;
  const u = new Float64Array(n + 1), v = new Float64Array(n + 1), p = new Int32Array(n + 1), way = new Int32Array(n + 1);
  for (let i = 1; i <= n; i++) {
    p[0] = i; let j0 = 0;
    const minv = new Float64Array(n + 1).fill(INF), used = new Uint8Array(n + 1);
    do {
      used[j0] = 1; const i0 = p[j0]; let delta = INF, j1 = 0;
      for (let j = 1; j <= n; j++) if (!used[j]) {
        const cur = C[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      for (let j = 0; j <= n; j++) if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
  }
  const row = new Int32Array(n);
  for (let j = 1; j <= n; j++) row[p[j] - 1] = j - 1;
  return row;
}

const pairs = new Map();
/** Wall pieces gliding from digit a to digit b in a slot: [{ from, to, delay }]. */
export function morphPlan(a, b, slot) {
  const key = `${a}${b}${slot}`;
  if (pairs.has(key)) return pairs.get(key);
  const A = glyphSegs(a, slot), B = glyphSegs(b, slot), n = Math.max(A.length, B.length);
  const C = [];
  for (let i = 0; i < n; i++) {
    C.push([]);
    for (let j = 0; j < n; j++) {
      if (i < A.length && j < B.length) C[i].push(segCost(A[i], B[j])[0]);
      else if (i < A.length) C[i].push(Math.min(...B.map((s) => segCost(A[i], s)[0])) + 6);   // merges
      else C[i].push(Math.min(...A.map((s) => segCost(s, B[j])[0])) + 6);                     // splits off
    }
  }
  const row = hungarian(C), moves = [];
  const near = (s, set) => set.reduce((best, t) => { const c = segCost(s, t)[0]; return c < best[0] ? [c, t] : best; }, [1e9, null])[1];
  const orient = (s, t) => (segCost(s, t)[1] ? [t[2], t[3], t[0], t[1]] : t);
  for (let i = 0; i < n; i++) {
    const j = row[i];
    let from = A[i], to = B[j];
    if (!from) from = orient(to, near(to, A));
    if (!to) to = orient(from, near(from, B));
    else to = orient(from, to);
    moves.push({ from, to, cost: segCost(from, to)[0] });
  }
  // the pieces that travel go one after another, like tiles in a slide puzzle
  const travel = moves.filter((m) => m.cost > 0.5).sort((p, q) => q.cost - p.cost);
  travel.forEach((m, k) => { m.delay = travel.length > 1 ? k / (travel.length - 1) : 0; });
  for (const m of moves) m.delay ??= 0;
  pairs.set(key, moves);
  return moves;
}

// ------------------------------------------------------- distance raster
/** Min distance from each pixel centre to the segments (only within reach). */
export function distField(segs, D, reach = 3) {
  D.fill(99);
  for (const s of segs) {
    const [ax, ay, bx, by] = s;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - reach)), x1 = Math.min(N - 1, Math.ceil(Math.max(ax, bx) + reach));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by) - reach)), y1 = Math.min(N - 1, Math.ceil(Math.max(ay, by) + reach));
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-9;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      let t = ((x - ax) * dx + (y - ay) * dy) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = x - ax - t * dx, ey = y - ay - t * dy, d = Math.sqrt(ex * ex + ey * ey);
      const p = y * N + x;
      if (d < D[p]) D[p] = d;
    }
  }
  return D;
}
