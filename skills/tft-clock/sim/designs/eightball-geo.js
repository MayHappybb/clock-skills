// eightball: the die. A regular icosahedron (twenty equilateral faces), its
// rest poses and the rotations that roll it from face to face.
//
// World axes: x right, y down, z into the ball (the window is the plane
// z = 0, the viewer is on the negative side). Poses are 3x3 matrices that
// take die-local vectors to world; everything is built once at load.
//
// Poses with one face flat against the window come in two kinds: that face
// is a "down" triangle (an edge on top, the point below) or an "up" one.
// Turning the die in the window plane by 120 degrees is a symmetry of the
// die, so for drawing, a pose is fully known by that parity. Rolling over
// any edge of the front face (a turn of 180 - 138.19 = 41.81 degrees about
// an axis parallel to that edge) always lands on the other parity, which is
// why every minute's roll can pick its edge freely and still end on the pose
// the next minute expects.

const PHI = (1 + Math.sqrt(5)) / 2;

// ---------------------------------------------------------------- vectors
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; };

// ---------------------------------------------------------------- 3x3 matrices, row-major arrays of 9
export const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
export function mmul(A, B) {
  const r = new Array(9);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) r[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j];
  return r;
}
export const apply = (M, v) => [
  M[0] * v[0] + M[1] * v[1] + M[2] * v[2],
  M[3] * v[0] + M[4] * v[1] + M[5] * v[2],
  M[6] * v[0] + M[7] * v[1] + M[8] * v[2],
];
export const transpose = (M) => [M[0], M[3], M[6], M[1], M[4], M[7], M[2], M[5], M[8]];

/** Rotation by angle `a` (radians) about unit axis `k` (Rodrigues), given its sin and cos. */
export function rotSC(k, s, c) {
  const [x, y, z] = k, t = 1 - c;
  return [
    t * x * x + c, t * x * y - s * z, t * x * z + s * y,
    t * x * y + s * z, t * y * y + c, t * y * z - s * x,
    t * x * z - s * y, t * y * z + s * x, t * z * z + c,
  ];
}
export const rot = (k, a) => rotSC(k, Math.sin(a), Math.cos(a));

// ---------------------------------------------------------------- the solid
const RAW = [];
for (const s1 of [-1, 1]) for (const s2 of [-1, 1]) {
  RAW.push([0, s1, s2 * PHI], [s1, s2 * PHI, 0], [s2 * PHI, 0, s1]);
}
/** Twelve vertices, unit circumradius scaled later; edge length 2 here. */
export const VERTS = RAW;
/** Twenty faces as vertex index triples, wound so the normal points out. */
export const FACES = [];
for (let a = 0; a < 12; a++) for (let b = a + 1; b < 12; b++) for (let c = b + 1; c < 12; c++) {
  const d = (i, j) => Math.hypot(...sub(RAW[i], RAW[j]));
  if (Math.abs(d(a, b) - 2) < 1e-6 && Math.abs(d(b, c) - 2) < 1e-6 && Math.abs(d(a, c) - 2) < 1e-6) {
    const n = cross(sub(RAW[b], RAW[a]), sub(RAW[c], RAW[a]));
    const cen = add(add(RAW[a], RAW[b]), RAW[c]);
    FACES.push(dot(n, cen) > 0 ? [a, b, c] : [a, c, b]);
  }
}
export const FACE_N = FACES.map(([a, b, c]) => norm(cross(sub(RAW[b], RAW[a]), sub(RAW[c], RAW[a]))));
export const FACE_C = FACES.map(([a, b, c]) => mul(add(add(RAW[a], RAW[b]), RAW[c]), 1 / 3));
/** Unit edges (vertex pairs), for the bevel highlights. */
export const EDGES = [];
for (const [a, b, c] of FACES) for (const [p, q] of [[a, b], [b, c], [c, a]]) {
  if (!EDGES.some(([x, y]) => (x === p && y === q) || (x === q && y === p))) EDGES.push([p, q]);
}
/** For each edge, the two faces that share it. */
export const EDGE_F = EDGES.map(([p, q]) => FACES.map((f, i) => (f.includes(p) && f.includes(q) ? i : -1)).filter((i) => i >= 0));

/** Inradius of the edge-2 solid: centre to face. */
export const IN_R = Math.hypot(...FACE_C[0]);

// The canonical pose C: face 0 flat on the window, a "down" triangle.
function canonical() {
  const [a, b, c] = FACES[0];
  // choose c as the bottom vertex, ab the top edge; local axes as world rows
  let A = RAW[a], B = RAW[b];
  const Cv = RAW[c];
  let X = norm(sub(B, A));
  const Y = norm(sub(Cv, mul(add(A, B), 0.5)));
  let Z = cross(X, Y);
  if (dot(Z, FACE_N[0]) > 0) { X = mul(X, -1); Z = cross(X, Y); }
  return [...X, ...Y, ...Z];
}
export const C0 = canonical();
/** Rotation about the view axis (world z). */
export const rotZ = (a) => rot([0, 0, 1], a);
/** Rest pose for a parity: 0 = down triangle in front, 1 = up triangle. */
export const REST = [C0, mmul(rotZ(Math.PI / 3), C0)];

/** The dihedral turn between neighbouring faces. */
export const ROLL = Math.PI - Math.acos(-Math.sqrt(5) / 3);

/** Index of the face whose world normal points most at the viewer. */
export function frontFace(M) {
  let best = -1, bz = 2;
  for (let i = 0; i < 20; i++) {
    const nz = apply(M, FACE_N[i])[2];
    if (nz < bz) { bz = nz; best = i; }
  }
  return best;
}

/**
 * The three ways to roll off the front face of `pose`: for each edge of the
 * front face, the world axis and signed angle that bring its neighbour flat
 * on the window. Precomputed for both rest poses.
 */
function rollsFor(M) {
  const f = frontFace(M), out = [];
  const [a, b, c] = FACES[f];
  for (const [p, q] of [[a, b], [b, c], [c, a]]) {
    const axis = norm(apply(M, sub(RAW[q], RAW[p])));
    for (const sgn of [1, -1]) {
      const R = mmul(rot(axis, sgn * ROLL), M);
      const g = frontFace(R);
      if (g !== f && apply(R, FACE_N[g])[2] < -0.9999) { out.push({ axis, angle: sgn * ROLL, end: R }); break; }
    }
  }
  return out;
}
export const ROLLS = [rollsFor(REST[0]), rollsFor(REST[1])];

/**
 * A face's own flat frame, in die-local coordinates, set so that when the
 * die is in `pose` the frame's u axis is screen-right and v is screen-down.
 * Text is laid out in (u, v) pixels from the face centre.
 */
export function faceFrame(pose, face) {
  const T = transpose(pose);
  return { face, c: FACE_C[face], u: apply(T, [1, 0, 0]), v: apply(T, [0, 1, 0]) };
}
