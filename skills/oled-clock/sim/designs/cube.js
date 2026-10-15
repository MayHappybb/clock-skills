// Cube — the time on four puzzle cubes, in real 3D.
//
// Each digit is a 3x3x3 puzzle cube seen in perspective from a little above,
// so its top and one side show. Nothing is a sprite: every frame the cubes
// are boxes transformed in 3D, their faces projected, back faces dropped by
// their winding on screen, and each front face filled by inverse
// perspective mapping (each pixel's centre is taken back through the face's
// homography to the cube's own coordinates). There a face has its 3x3 grid
// of slice lines, a fill dithered by how it faces the light (upper left),
// and maybe a digit: a squared, round-cornered hand of its own (the cube's
// own geometry), tabulated at 64 x 64 per face, with a dark halo that keeps
// it clear of the grid. A digit is lit only where its face looks at the
// viewer, so a face turning away loses its digit before it is unreadable.
// Faces are painted far to near, opaque.
//
// Idle, every cube sways on its own (yaw, pitch, roll, bob, sub-pixel, from
// the clock), a die rolls along the floor in front of them, one tip over
// its edge every 3 s, across the glass and back on alternate minutes (the
// seconds), and the colon is two small cubes tumbling.
//
// The minute: the changing cube is picked up (it rises towards the viewer)
// and its three column slices part a pixel, an exploded view; it nods
// forward (the wind-back), then the slices roll up one after another, a
// Rubik's twist on a spring with overshoot, bringing the face from
// underneath, which carries the new digit, round to the front. The slices
// close, the cube drops back and squashes. The old digit goes as the first
// slice tips away (before :00) and the new one appears once the last has
// rolled round (after :00), so no instant shows half of one digit beside
// half of another; between, the slices are blank. All changing cubes twist
// together.
//
// The hour: a carousel. The row crouches, leaps and whirls one and a half
// turns round the colon, every cube passing behind and in front of the
// others, each tumbling end over end on its own axis and riding up and down
// like a carousel horse. The old digits are gone before the leap, and the
// new ones (on the faces that were the backs) appear only after :00 as the
// cubes come down in mirrored places, squash and settle.
//
// Burn-in: the sway, the orbit (kit.orbit) and a dither offset that moves
// every five minutes; the date walks its own orbit. 23:00-07:00 the panel
// dims (ctx.night).

import { dither, clamp, ease, progress, clockFields, previousMinute, orbit, font3x5 } from '../js/kit.js';

const TAU = Math.PI * 2;
const W = 128, H = 64;

// ------------------------------------------------------------ 3x3 matrices, row-major

const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const rotX = (a) => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c]; };
const rotY = (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; };
const rotZ = (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1]; };
function mul(A, B) {
  const o = new Array(9);
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++) o[r * 3 + c] = A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c];
  return o;
}
/** Rotation by `a` about the axis (x, y, z), which need not be unit length. */
function axisAngle(x, y, z, a) {
  const l = Math.hypot(x, y, z); x /= l; y /= l; z /= l;
  const c = Math.cos(a), s = Math.sin(a), k = 1 - c;
  return [c + x * x * k, x * y * k - z * s, x * z * k + y * s,
    y * x * k + z * s, c + y * y * k, y * z * k - x * s,
    z * x * k - y * s, z * y * k + x * s, c + z * z * k];
}

// ------------------------------------------------------------ the camera
// World: px, x right, y down, z away from the viewer, origin at the middle of
// the row of cubes. The camera is D px in front, looking slightly down, so
// the tops of the cubes show. At z = 0 the projection is 1:1.

const D = 170, PITCH = 0.42, CP = Math.cos(PITCH), SP = Math.sin(PITCH);
const VX = 64, VY = 29;
const CAM = [0, -D * SP, -D * CP];          // the eye, in world coordinates
const LIGHT = (() => { const v = [-0.6, -0.8, -0.3]; const l = Math.hypot(...v); return v.map((c) => c / l); })();

// ------------------------------------------------------------ letterforms
// A squared, round-cornered hand (the Eurostile family: a cube's own
// geometry) drawn as centre-lines in a 10 x 14 box, stroked round, and
// tabulated as a 64 x 64 bitmap over a cube face.

const GL = 1.35, GR = 8.65, GT = 1.35, GB = 12.65, GM = 6.2, SR = 1.35;   // edges, middle bar, stroke radius

/** A polyline with rounded corners: points [x, y, r], r the corner radius. */
function fillet(pts, closed = false) {
  const n = pts.length, out = [];
  for (let i = 0; i < n; i++) {
    const [x, y, r = 0] = pts[i];
    const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
    if ((!closed && (i === 0 || i === n - 1)) || !r) { out.push([x, y]); continue; }
    const l1 = Math.hypot(a[0] - x, a[1] - y), l2 = Math.hypot(b[0] - x, b[1] - y);
    const t = Math.min(r, l1 / 2, l2 / 2);
    const p0 = [x + ((a[0] - x) * t) / l1, y + ((a[1] - y) * t) / l1];
    const p1 = [x + ((b[0] - x) * t) / l2, y + ((b[1] - y) * t) / l2];
    for (let k = 0; k <= 8; k++) {
      const u = k / 8, v = 1 - u;
      out.push([v * v * p0[0] + 2 * v * u * x + u * u * p1[0], v * v * p0[1] + 2 * v * u * y + u * u * p1[1]]);
    }
  }
  if (closed) out.push(out[0]);
  return out;
}

const R1 = 2.9;   // the usual corner radius
const o = (...p) => ({ p, closed: false }), c = (...p) => ({ p, closed: true });
const SKETCH = {
  0: [c([GL, GT, 3.6], [GR, GT, 3.6], [GR, GB, 3.6], [GL, GB, 3.6])],
  1: [o([2.4, 4.2], [5.7, GT, 0.6], [5.7, GB]), o([2.6, GB], [8.6, GB])],
  2: [o([GL, 3.8], [GL, GT, R1], [GR, GT, R1], [GR, GM, R1], [GL, GM, R1], [GL, GB, 0.8], [GR + 0.1, GB])],
  3: [o([GL, GT], [GR, GT, R1], [GR, GB, R1], [GL, GB]), o([3.4, GM], [GR, GM])],
  4: [o([GL, GT], [GL, 9.2, 1.4], [GR + 0.3, 9.2]), o([6.9, 4.4], [6.9, GB])],
  5: [o([GR + 0.2, GT], [GL, GT], [GL, GM - 0.3], [GR, GM - 0.3, R1], [GR, GB, R1], [GL, GB])],
  6: [o([GR, GT], [GL, GT, R1], [GL, GB, R1], [GR, GB, R1], [GR, GM, R1], [GL, GM])],
  7: [o([GL, 3.9], [GL, GT, 0.8], [GR, GT, 1.6], [GR, 4.6, 3], [4.6, GB])],
  8: [c([2.0, GT, 2.6], [8.0, GT, 2.6], [8.0, GM, 2.2], [2.0, GM, 2.2]), c([GL, GM, 0.1], [GR, GM, R1], [GR, GB, R1], [GL, GB, R1])],
};
SKETCH[9] = SKETCH[6].map((s) => ({ ...s, p: s.p.map(([x, y, r]) => [10 - x, 14 - y, r]) }));

const TEX = 64, HALO = 1.25;
const GK = 0.056, GU0 = 0.5 - 5 * GK, GV0 = 0.5 - 7 * GK;   // glyph units -> face coordinates

function buildGlyph(d) {
  const segs = [];
  for (const st of SKETCH[d]) {
    const p = fillet(st.p, st.closed);
    for (let i = 1; i < p.length; i++) segs.push([p[i - 1][0], p[i - 1][1], p[i][0], p[i][1]]);
  }
  const T = new Uint8Array(TEX * TEX);
  for (let j = 0; j < TEX; j++)
    for (let i = 0; i < TEX; i++) {
      const x = ((i + 0.5) / TEX - GU0) / GK, y = ((j + 0.5) / TEX - GV0) / GK;
      let best = 1e9;
      for (const [ax, ay, bx, by] of segs) {
        const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
        const u = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0;
        const e = (x - ax - u * dx) ** 2 + (y - ay - u * dy) ** 2;
        if (e < best) best = e;
      }
      // 1 the stroke, 2 the dark halo round it that keeps it off the grid.
      T[j * TEX + i] = best <= SR * SR ? 1 : best <= (SR + HALO) ** 2 ? 2 : 0;
    }
  return T;
}
const GLYPH = Array.from({ length: 10 }, (_, d) => buildGlyph(d));

// ------------------------------------------------------------ the renderer
// A cube is drawn as one or more slabs (boxes inside it: the whole cube, or
// the slices of a twist), each turned about the cube's centre. A slab's six
// faces are projected, back faces dropped by their winding on screen, and
// each front face is filled by inverse perspective mapping: every pixel's
// centre is taken back through the face's homography to (u, v) on the
// face, and from there to the cube's own coordinates, where the stickers
// and the digits are. Faces are painted far to near, each one opaque.

// A face of the box [x0,x1]x[y0,y1]x[z0,z1]: its normal, and its corners as
// picks from the bounds (u along c0->c1, v along c0->c3, as seen from outside).
const FACES = [
  { n: [0, 0, -1], c: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]], axis: 2, side: 0 },   // 0 front
  { n: [0, 0, 1], c: [[1, 0, 1], [0, 0, 1], [0, 1, 1], [1, 1, 1]], axis: 2, side: 1 },    // 1 back
  { n: [-1, 0, 0], c: [[0, 0, 1], [0, 0, 0], [0, 1, 0], [0, 1, 1]], axis: 0, side: 0 },   // 2 left
  { n: [1, 0, 0], c: [[1, 0, 0], [1, 0, 1], [1, 1, 1], [1, 1, 0]], axis: 0, side: 1 },    // 3 right
  { n: [0, -1, 0], c: [[0, 0, 1], [1, 0, 1], [1, 0, 0], [0, 0, 0]], axis: 1, side: 0 },   // 4 top
  { n: [0, 1, 0], c: [[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]], axis: 1, side: 1 },    // 5 bottom
];
const WHOLE = [-1, 1, -1, 1, -1, 1];

/** World point -> camera space, into out[0..2]. */
function toCam(x, y, z, out, k) {
  out[k] = x; out[k + 1] = y * CP - z * SP; out[k + 2] = y * SP + z * CP + D;
}

/**
 * Whether grid coordinate s (0..1 across a face) is on one of the face's
 * lines: its edges and the two cuts between the slices. `k` is px per unit.
 */
function gridLine(s, k) {
  const e = Math.min(s, 1 - s) * k;
  if (e < 1) return 1;
  return Math.abs(s - 1 / 3) * k < 0.5 || Math.abs(s - 2 / 3) * k < 0.5 ? 2 : 0;
}
// On a face that carries a digit the slice cuts are only ticks at the edge,
// outside this box (face coordinates -1..1), so a cut never reads as part of
// the digit (a crossbar on a 1, say).
const TICK_BOX = 0.7;

const Q = new Float64Array(8), CC = new Float64Array(12), LC = new Float64Array(12);

/**
 * Fill the screen quad Q (corners for uv (0,0) (1,0) (1,1) (0,1)) with
 * `shade(u, v, x, y)`, which returns 1 (lit), 0 (dark) or -1 (leave).
 */
function fillQuad(g, shade) {
  const [x0, y0, x1, y1, x2, y2, x3, y3] = Q;
  const sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3;
  const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2;
  const den = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(den) < 1e-9) return;
  const gg = (sx * dy2 - dx2 * sy) / den, hh = (dx1 * sy - sx * dy1) / den;
  const a = x1 - x0 + gg * x1, b = x3 - x0 + hh * x3, c = x0;
  const d = y1 - y0 + gg * y1, e = y3 - y0 + hh * y3, f = y0;
  const A = e - f * hh, B = c * hh - b, C = b * f - c * e;
  const Dd = f * gg - d, E = a - c * gg, F = c * d - a * f;
  const G = d * hh - e * gg, Hh = b * gg - a * hh, II = a * e - b * d;
  const xa = Math.max(0, Math.floor(Math.min(x0, x1, x2, x3))), xb = Math.min(W - 1, Math.ceil(Math.max(x0, x1, x2, x3)));
  const ya = Math.max(0, Math.floor(Math.min(y0, y1, y2, y3))), yb = Math.min(H - 1, Math.ceil(Math.max(y0, y1, y2, y3)));
  const buf = g.buf;
  for (let y = ya; y <= yb; y++) {
    const py = y + 0.5;
    for (let x = xa; x <= xb; x++) {
      const px = x + 0.5;
      const w = G * px + Hh * py + II;
      const u = (A * px + B * py + C) / w;
      if (u < 0 || u > 1) continue;
      const v = (Dd * px + E * py + F) / w;
      if (v < 0 || v > 1) continue;
      const r = shade(u, v, x, y);
      if (r >= 0) buf[y * W + x] = r;
    }
  }
}

/**
 * Draw one cube. `cube` is { P: centre, h: half edge, R: rotation, S: squash
 * along the world axes, slabs: [{ b: bounds in the cube's frame, R }] (the
 * whole cube if absent), split: the axis the slabs are cut along, faces: six
 * entries, null or { d, M, w }: digit d on that face, upright when the cube
 * is turned by M, at strength w; plain: a shade for an unmarked cube; dx, dy:
 * the dither's offset }.
 */
function renderCube(g, cube) {
  const { P, h, R, S } = cube;
  let slabs = cube.slabs ?? [{ b: WHOLE, R: I3 }];
  if (slabs.length > 1) {
    // Far slab first: order by the eye's distance along the cut axis, in the cube's own frame.
    const ex = (CAM[0] - P[0]) / S[0], ey = (CAM[1] - P[1]) / S[1], ez = (CAM[2] - P[2]) / S[2];
    const eye = (R[cube.split] * ex + R[3 + cube.split] * ey + R[6 + cube.split] * ez) / h;
    const ax = cube.split * 2;
    slabs = slabs.map((s) => [s, Math.abs(eye - (s.b[ax] + s.b[ax + 1]) / 2)]).sort((a, b) => b[1] - a[1]).map((a) => a[0]);
  }
  for (const slab of slabs) drawSlab(g, cube, slab);
}

function drawSlab(g, cube, slab) {
  const M = mul(cube.R, slab.R), b = slab.b, { P, h, S } = cube;
  const R = cube.R, off = slab.off ?? [0, 0, 0];
  const tx = h * (R[0] * off[0] + R[1] * off[1] + R[2] * off[2]), ty = h * (R[3] * off[0] + R[4] * off[1] + R[5] * off[2]), tz = h * (R[6] * off[0] + R[7] * off[1] + R[8] * off[2]);
  const ox = cube.dx ?? 0, oy = cube.dy ?? 0;
  for (let fi = 0; fi < 6; fi++) {
    const F = FACES[fi];
    for (let k = 0; k < 4; k++) {
      const pk = F.c[k];
      const lx = b[pk[0]], ly = b[2 + pk[1]], lz = b[4 + pk[2]];
      LC[k * 3] = lx; LC[k * 3 + 1] = ly; LC[k * 3 + 2] = lz;
      toCam(P[0] + S[0] * (tx + h * (M[0] * lx + M[1] * ly + M[2] * lz)),
        P[1] + S[1] * (ty + h * (M[3] * lx + M[4] * ly + M[5] * lz)),
        P[2] + S[2] * (tz + h * (M[6] * lx + M[7] * ly + M[8] * lz)), CC, k * 3);
      Q[k * 2] = VX + (D * CC[k * 3]) / CC[k * 3 + 2];
      Q[k * 2 + 1] = VY + (D * CC[k * 3 + 1]) / CC[k * 3 + 2];
    }
    let area = 0;
    for (let k = 0; k < 4; k++) { const j = (k + 1) & 3; area += Q[2 * k] * Q[2 * j + 1] - Q[2 * j] * Q[2 * k + 1]; }
    if (area <= 0.4) continue;
    const n = F.n;
    const nx = M[0] * n[0] + M[1] * n[1] + M[2] * n[2], ny = M[3] * n[0] + M[4] * n[1] + M[5] * n[2], nz = M[6] * n[0] + M[7] * n[1] + M[8] * n[2];
    const lam = Math.max(0, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]);
    const cx = (CC[0] + CC[3] + CC[6] + CC[9]) / 4, cy = (CC[1] + CC[4] + CC[7] + CC[10]) / 4, cz = (CC[2] + CC[5] + CC[8] + CC[11]) / 4;
    const facing = -(nx * cx + (ny * CP - nz * SP) * cy + (ny * SP + nz * CP) * cz) / Math.hypot(cx, cy, cz);
    const surface = b[F.axis * 2 + F.side] === (F.side ? 1 : -1);
    if (!surface) {
      // The black core of the puzzle, showing in a twist: just its outline.
      const lu = Math.hypot(Q[2] - Q[0], Q[3] - Q[1]), lv = Math.hypot(Q[6] - Q[0], Q[7] - Q[1]);
      fillQuad(g, (u, v) => (Math.min(u, 1 - u) * lu < 1 || Math.min(v, 1 - v) * lv < 1 ? 1 : 0));
      continue;
    }
    const o0 = LC[0], o1 = LC[1], o2 = LC[2];
    const ux = LC[3] - o0, uy = LC[4] - o1, uz = LC[5] - o2, vx = LC[9] - o0, vy = LC[10] - o1, vz = LC[11] - o2;
    if (cube.plain !== undefined) {
      const lv = cube.plain * (0.3 + 0.7 * lam);
      fillQuad(g, (u, v, x, y) => (dither(x + ox, y + oy, lv) ? 1 : 0));
      continue;
    }
    const ct = cube.faces?.[fi];
    const glyph = ct && ct.w > 0 ? GLYPH[ct.d] : null, Mm = ct?.M;
    const digL = glyph ? 1.2 * clamp((facing - 0.55) / 0.25, 0, 1) * ct.w : 0;
    const fill = 0.6 * clamp((lam - 0.3) / 0.5, 0, 1);
    const ia = F.axis === 0 ? 2 : 0, ib = F.axis === 1 ? 2 : 1;
    // Pixels per unit of the face's own grid coordinates, for 1 px lines.
    const lenU = (Math.hypot(Q[2] - Q[0], Q[3] - Q[1]) + Math.hypot(Q[4] - Q[6], Q[5] - Q[7])) / 2;
    const lenV = (Math.hypot(Q[6] - Q[0], Q[7] - Q[1]) + Math.hypot(Q[4] - Q[2], Q[5] - Q[3])) / 2;
    const dsu = Math.abs(LC[3 + ia] - LC[ia]) / 2, dtu = Math.abs(LC[3 + ib] - LC[ib]) / 2;
    const ks = dsu > 1e-6 ? lenU / dsu : lenV / (Math.abs(LC[9 + ia] - LC[ia]) / 2);
    const kt = dtu > 1e-6 ? lenU / dtu : lenV / (Math.abs(LC[9 + ib] - LC[ib]) / 2);
    const p = [0, 0, 0];
    fillQuad(g, (u, v, x, y) => {
      p[0] = o0 + u * ux + v * vx; p[1] = o1 + u * uy + v * vy; p[2] = o2 + u * uz + v * vz;
      let halo = false, inBox = false;
      if (glyph && digL > 0) {
        const qx = Mm[0] * p[0] + Mm[1] * p[1] + Mm[2] * p[2], qy = Mm[3] * p[0] + Mm[4] * p[1] + Mm[5] * p[2];
        const i = ((qx + 1) * 0.5 * TEX) | 0, j = ((qy + 1) * 0.5 * TEX) | 0;
        const tx = i >= 0 && i < TEX && j >= 0 && j < TEX ? glyph[j * TEX + i] : 0;
        if (tx === 1) return digL >= 1 || dither(x + ox, y + oy, digL) ? 1 : 0;
        halo = tx === 2;
        inBox = Math.abs(qx) < TICK_BOX && Math.abs(qy) < TICK_BOX;
      }
      const ga = gridLine((p[ia] + 1) / 2, ks), gb = gridLine((p[ib] + 1) / 2, kt);
      if (ga === 1 || gb === 1 || ((ga || gb) && !inBox)) return halo ? 0 : 1;
      return !halo && fill > 0 && dither(x + ox, y + oy, fill) ? 1 : 0;
    });
  }
}

// ------------------------------------------------------------ choreography

const HC = 11.5;                          // half the edge of a digit cube
const SLOTS = [-45, -17.5, 17.5, 45];     // where the cubes stand, from the middle
const smooth = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
/** Step response of a damped spring, 0 -> 1, starting at rest. */
function spring(s, zeta, w) {
  if (s <= 0) return 0;
  const wd = w * Math.sqrt(1 - zeta * zeta);
  return 1 - Math.exp(-zeta * w * s) * (Math.cos(wd * s) + ((zeta * w) / wd) * Math.sin(wd * s));
}

const digitsOf = (f) => [...`${f.hh}${f.mm}`].map(Number);
const front = (d) => [{ d, M: I3, w: 1 }, null, null, null, null, null];

/** The idle sway: every cube breathes on its own, so no edge rests. `k2`, `m` blend towards another slot's. */
function sway(k, T, k2 = k, m = 0) {
  const at = (j) => [0.075 * Math.sin((TAU * T) / 7.3 + j * 1.9), 0.05 * Math.sin((TAU * T) / 5.9 + j * 2.4),
    0.03 * Math.sin((TAU * T) / 8.1 + j * 0.7), 0.6 * Math.sin((TAU * T) / 4.3 + j * 1.3)];
  const A = at(k), B = at(k2), v = A.map((a, i) => a + (B[i] - a) * m);
  return { R: mul(rotY(v[0]), mul(rotX(v[1]), rotZ(v[2]))), bob: v[3] };
}

function idleCube(k, T, d, ox, oy) {
  const s = sway(k, T);
  return { P: [SLOTS[k] + ox, oy + s.bob, 0], h: HC, R: s.R, S: [1, 1, 1], faces: front(d) };
}

// The minute: the cube is cut into three columns that roll up one after the
// other, a Rubik's twist, so the face underneath (the new digit) comes round
// to the front. Wind-back, then a spring with overshoot, then settle.
const STAG = 0.07, WIND = 0.22, W0 = -0.9, W1 = -0.3, R0 = -0.13, M_START = -1.9, M_END = 2.2;
const ROLL_TO = rotX(-Math.PI / 2);
const sliceAngle = (t) => (t < R0 ? WIND * ease.inOutCubic(progress(t, W0, W1)) : WIND + (-Math.PI / 2 - WIND) * spring(t - R0, 0.5, 10));
// The old digit goes as the first slice tips away, the new one comes once the
// last has rolled round: so no instant shows half of one beside half of the
// other (which can read as some third digit).
const crossing = (lag, a) => { let t = W0; while (-sliceAngle(t - lag) < a) t += 0.001; return t; };
const T_OLD = crossing(0, 0.4), T_NEW = crossing(2 * STAG, 1.05);

// Around the twist the cube is picked up: it rises towards the viewer, its
// slices part (an exploded view of the
// mechanism), and after the twist it closes up, drops back and squashes.
const LIFT0 = -1.9, LIFT1 = -1.05, DROP0 = 0.55, DROP1 = 1.05;
function turnCube(k, T, tau, was, now, ox, oy) {
  const s = sway(k, T);
  const up = smooth(progress(tau, LIFT0, LIFT1)) * (1 - ease.inQuad(progress(tau, DROP0, DROP1)));
  const gap = 0.13 * smooth(progress(tau, -1.4, -0.75)) * (1 - smooth(progress(tau, 0.35, 0.9)));
  const crouch = ease.inOutCubic(progress(tau, W0, W1)) * (1 - smooth(progress(tau, R0, R0 + 0.1)));
  const tl = tau - DROP1;
  const land = tl > 0 ? 0.11 * Math.exp(-tl * 7) * Math.cos(tl * 24) : 0;
  const sq = 0.06 * crouch + land;
  const slabs = [0, 1, 2].map((j) => ({
    b: [-1 + (2 * j) / 3, -1 + (2 * (j + 1)) / 3, -1, 1, -1, 1], R: rotX(sliceAngle(tau - j * STAG)), off: [(j - 1) * gap, 0, 0],
  }));
  const faces = [{ d: was, M: I3, w: 1 - smooth(progress(tau, T_OLD - 0.08, T_OLD)) }, null, null, null, null, { d: now, M: ROLL_TO, w: smooth(progress(tau, T_NEW, T_NEW + 0.1)) }];
  return {
    P: [SLOTS[k] + ox, oy + s.bob + sq * HC - 4.5 * up, -6 * up], h: HC, R: s.R,
    S: [1 + sq * 0.55, 1 - sq, 1 + sq * 0.55], slabs, split: 0, faces,
  };
}

// The hour: a carousel. The row of cubes leaps up and whirls one and a half
// turns round the colon, so every cube passes behind and in front of the
// others, each tumbling end over end on its own axis and riding up and down
// like a carousel horse, and they come down in mirrored places, each with
// the new digit on the face that was its back.
const H_CROUCH = -1.3, H_GO = -0.75, H_SPIN = 3.2, H_END = H_GO + H_SPIN + 1.0;
const SPINS = 3 * Math.PI;
const TUMBLE = [[1, 0.2, 0], [0.3, 1, 0.6], [0.2, -0.4, 1], [1, -1, 0.3]];
const BACK_TO = rotY(Math.PI);
const hourU = (tau) => progress(tau, H_GO, H_GO + H_SPIN);

function hourCube(k, T, tau, was, now, ox, oy) {
  const u = hourU(tau), e = (1 - Math.cos(Math.PI * u)) / 2;
  const s = sway(k, T, 3 - k, e);
  const a = SPINS * e, X = SLOTS[k];
  const lift = Math.sin(Math.PI * u);
  const y = -(9 * lift + 3.5 * lift * Math.sin(TAU * 2 * u + k * 1.6));
  const crouch = smooth(progress(tau, H_CROUCH, H_GO - 0.1)) * (1 - smooth(progress(tau, H_GO - 0.08, H_GO + 0.05)));
  const tl = tau - (H_GO + H_SPIN);
  const land = tl > 0 ? 0.16 * Math.exp(-tl * 6) * Math.cos(tl * 20) : 0;
  const sq = 0.12 * crouch + land;
  const [ax, ay, az] = TUMBLE[k];
  const own = axisAngle(ax, ay, az, TAU * ease.inOutCubic(progress(u, 0.08, 0.92)));
  const faces = [{ d: was, M: I3, w: 1 - smooth(progress(tau, H_GO + 0.05, H_GO + 0.45)) }, { d: now, M: BACK_TO, w: smooth(progress(tau, 1.7, 2.2)) }, null, null, null, null];
  return {
    P: [X * Math.cos(a) + ox, oy + s.bob + y + sq * HC, -X * Math.sin(a) + 16 * lift], h: HC,
    R: mul(s.R, mul(rotY(a), own)), S: [1 + sq * 0.55, 1 - sq, 1 + sq * 0.55], faces,
  };
}

/** The colon: two small plain cubes tumbling; they spin up on the hour. */
function colonCubes(T, ox, oy, spin) {
  return [-5.5, 5.5].map((y, i) => ({
    P: [ox, oy + y, 0], h: 2.3, S: [1, 1, 1], plain: 1,
    R: mul(rotY(T * 1.1 + i * 2 + spin * (i ? -1 : 1)), rotX(T * 0.8 + i + spin)),
  }));
}

// The seconds: a small die rolls along the floor in front of the cubes, a
// tip over its edge every 2.5 s, 24 to a minute, across the glass and back.
const DIE = 2.6, DIE_Z = -25, ROLLS = 20, ROLL_T = 3, TIP = 0.55;
function dieCube(f, ox, oy) {
  const n = Math.min(ROLLS - 1, Math.floor(f.sec / ROLL_T));
  const tip = progress(f.sec, n * ROLL_T + ROLL_T - TIP, (n + 1) * ROLL_T);
  const phi = (Math.PI / 2) * (tip < 1 ? ease.inOutQuad(tip) : 1);
  const dir = f.minuteKey % 2 ? -1 : 1;
  // Its centre starts this minute at -dir * ROLLS * DIE and ends at the mirror of that.
  const px = dir * (2 * n + 1 - ROLLS) * DIE;      // the edge it tips over
  const b = rotZ(dir * phi);
  const vx = -dir * DIE, vy = -DIE;
  return {
    P: [px + ox + b[0] * vx + b[1] * vy, oy + HC + b[3] * vx + b[4] * vy, DIE_Z], h: DIE, S: [1, 1, 1], plain: 1,
    R: mul(b, rotY(0.5)),
  };
}

// ------------------------------------------------------------ the face

export default {
  name: 'Cube',
  blurb: 'Four puzzle cubes in real 3D: on the minute a cube is picked up and its slices twist the new digit round; on the hour the row whirls round like a carousel.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,

  frame(g, { date, fields: f, oled, night }) {
    const T = date.getTime() / 1000, sec = f.sec;
    const late = sec >= 50;
    const from = late ? f : previousMinute(date), to = late ? clockFields(new Date(date.getTime() + 60000)) : f;
    const tau = late ? sec - 60 : sec;
    const a = digitsOf(from), b = digitsOf(to), cur = digitsOf(f);
    const [ox, oy] = orbit(date, 2, 3);
    const dk = (Math.floor(f.minuteKey / 5) * 5) & 7;
    const [lx, ly] = orbit(new Date(date.getTime() + 90000), 3, 2);
    const label = `${f.dow} ${f.dd} ${f.month}`;
    g.text(label, 64 - font3x5.measure(label) / 2 + lx, 57 + clamp(ly, -1, 1), { font: font3x5 });
    const cubes = [];
    const hour = to.m === 0 && tau >= H_CROUCH && tau < H_END;
    for (let k = 0; k < 4; k++) {
      const turning = a[k] !== b[k] && tau >= M_START && tau < M_END;
      cubes.push(hour ? hourCube(k, T, tau, a[k], b[3 - k], ox, oy)
        : turning ? turnCube(k, T, tau, a[k], b[k], ox, oy) : idleCube(k, T, cur[k], ox, oy));
    }
    cubes.push(...colonCubes(T, ox, oy, hour ? 4 * Math.PI * ease.inOutCubic(hourU(tau)) : 0));
    cubes.push(dieCube(f, ox, oy));
    // Far to near.
    const depth = (c) => c.P[1] * SP + c.P[2] * CP;
    cubes.sort((p, q) => depth(q) - depth(p));
    for (const c of cubes) { c.dx = ox + dk; c.dy = oy + 3 * dk; renderCube(g, c); }
    oled.contrast(0xcf + (0x20 - 0xcf) * night);
  },
};
