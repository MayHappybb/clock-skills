// Mochi dough: the numerals of mochi.js, and the little renderer that makes
// them soft.
//
// A numeral is a skeleton (a few strokes, sampled every ~0.9 px) inflated
// into a tube of rice dough: every sample stamps a disc into a height field
// (v = R^2 - d^2, kept as the max), so the strokes are round in section,
// and where strokes meet they fuse like dough does. A "ball" (an ellipsoid
// sitting on the digit's base) can be unioned in; pounding flattens the
// skeleton into it, pulling stretches a new one out of it.
//
// Shading: the height is a hemisphere profile (sqrt from a table), its
// gradient gives a normal, a lookup table gives the colour: a cool lilac
// shadow, the dough's own colour, a warm light and a satin highlight. Flour
// is a fixed speckle in the numeral's own coordinates. Edges are
// anti-aliased from the height field's distance. A 7 x 7 blur of the
// coverage gives occlusion: a soft warm-grey keyline and contact shadow
// round the numeral, darkest inside counters and at pinches, and a darker
// rim on the dough where it is thin, so the holes read as holes.
//
// Cost (charged to g.cost.box, 3 cycles each, so check.mjs sees it): a
// stamped pixel ~3 integer ops (1 box), a field pixel ~12 (4), a shaded pixel
// ~30 (10); g.put prices the store or the blend. In C all of it is fixed
// point with table lookups; no float maths per pixel.

const STEP = 0.9;            // skeleton sample spacing, px

// ------------------------------------------------------------ skeletons
// Unit box (0..1 both ways, y down) of the stroke centre lines. 'L' strokes
// are polylines with sharp joints; 'C' strokes are Catmull-Rom curves
// through their points; 'O' strokes are closed superellipse loops
// [cx, cy, rx, ry, p].

const SK = {
  0: [['O', 0.5, 0.5, 0.5, 0.5, 2.5]],
  1: [['C', [0.1, 0.27], [0.33, 0.13], [0.6, 0]], ['L', [0.6, 0], [0.6, 1]], ['L', [0.22, 1], [0.98, 1]]],
  2: [['C', [0.03, 0.25], [0.2, 0.04], [0.52, 0], [0.84, 0.07], [0.98, 0.3], [0.83, 0.55], [0.45, 0.78], [0.04, 1]], ['L', [0.04, 1], [1, 1]]],
  3: [['C', [0.05, 0.12], [0.38, 0.0], [0.78, 0.04], [0.96, 0.22], [0.78, 0.42], [0.42, 0.47]],
      ['C', [0.42, 0.47], [0.84, 0.54], [1.0, 0.76], [0.82, 0.96], [0.46, 1.0], [0.03, 0.88]]],
  4: [['L', [0.74, 1], [0.74, 0], [0.0, 0.7], [1, 0.7]]],
  5: [['L', [0.96, 0], [0.1, 0], [0.06, 0.45]],
      ['C', [0.06, 0.45], [0.36, 0.36], [0.74, 0.38], [0.99, 0.63], [0.86, 0.92], [0.5, 1.0], [0.02, 0.9]]],
  6: [['O', 0.5, 0.68, 0.5, 0.32, 2.2], ['C', [0.0, 0.66], [0.06, 0.34], [0.3, 0.08], [0.62, 0], [0.9, 0.07]]],
  7: [['L', [0, 0], [1, 0]], ['C', [1, 0], [0.74, 0.34], [0.52, 0.68], [0.44, 1]]],
  8: [['O', 0.5, 0.215, 0.39, 0.215, 2.15], ['O', 0.5, 0.725, 0.5, 0.275, 2.15]],   // two rounds that only just touch: a deep waist
  9: [['O', 0.5, 0.32, 0.5, 0.32, 2.2], ['C', [1.0, 0.34], [0.94, 0.66], [0.7, 0.92], [0.38, 1], [0.1, 0.93]]],
};

function catmull(pts, n = 14) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((j) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3)));
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

function loop(cx, cy, rx, ry, p, n = 96) {
  const out = [];
  for (let k = 0; k <= n; k++) {
    const a = (k / n) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    out.push([cx + rx * Math.sign(c) * Math.abs(c) ** (2 / p), cy + ry * Math.sign(s) * Math.abs(s) ** (2 / p)]);
  }
  return out;
}

/** Resample a dense polyline (pixel space) every STEP px. */
function resample(line, xs, ys) {
  xs.push(line[0][0]); ys.push(line[0][1]);
  let carry = 0;
  for (let i = 1; i < line.length; i++) {
    const [ax, ay] = line[i - 1], [bx, by] = line[i];
    const len = Math.hypot(bx - ax, by - ay);
    let d = STEP - carry;
    while (d <= len) { xs.push(ax + ((bx - ax) * d) / len); ys.push(ay + ((by - ay) * d) / len); d += STEP; }
    carry = len - (d - STEP);
  }
  const [lx, ly] = line[line.length - 1];
  xs.push(lx); ys.push(ly);
}

const GLYPHS = new Map();
/**
 * Skeleton samples of digit `d` for a box w x h with tube radius r, in the
 * box's pixel coordinates: { n, x: Float32Array, y: Float32Array }.
 * Built once per size and kept (flash: ~1 KB a digit per size).
 */
export function glyph(d, w, h, r) {
  const key = `${d}/${w}/${h}/${r}`;
  let gl = GLYPHS.get(key);
  if (gl) return gl;
  const iw = w - 2 * r, ih = h - 2 * r, X = (u) => r + u * iw, Y = (v) => r + v * ih;
  const xs = [], ys = [];
  for (const s of SK[d]) {
    let pts;
    if (s[0] === 'O') pts = loop(s[1], s[2], s[3], s[4], s[5]);
    else if (s[0] === 'C') pts = catmull(s.slice(1));
    else {
      pts = [];
      const q = s.slice(1);
      for (let i = 0; i < q.length - 1; i++) for (let k = 0; k < 8; k++) pts.push([q[i][0] + ((q[i + 1][0] - q[i][0]) * k) / 8, q[i][1] + ((q[i + 1][1] - q[i][1]) * k) / 8]);
      pts.push(q[q.length - 1]);
    }
    resample(pts.map(([u, v]) => [X(u), Y(v)]), xs, ys);
  }
  gl = { n: xs.length, x: Float32Array.from(xs), y: Float32Array.from(ys) };
  GLYPHS.set(key, gl);
  return gl;
}

// ------------------------------------------------------------ tables

const SQRT_T = new Float32Array(1025);            // sqrt(i / 8), i.e. v up to 128
for (let i = 0; i <= 1024; i++) SQRT_T[i] = Math.sqrt(i / 8);
const DOME_T = new Float32Array(257);             // sqrt(i / 256)
for (let i = 0; i <= 256; i++) DOME_T[i] = Math.sqrt(i / 256);
const INVN_T = new Float32Array(513);             // 1 / sqrt(1 + i / 32)
for (let i = 0; i <= 512; i++) INVN_T[i] = 1 / Math.sqrt(1 + i / 32);

// the light: from the upper left, a little in front
let lx = 0, ly = 0, lz = 1;
/** Where the light comes from: x (-1 left .. 1 right), y (up is negative), z (towards us). */
export function setLight(x, y, z) {
  const n = 1 / Math.sqrt(x * x + y * y + z * z);
  lx = x * n; ly = y * n; lz = z * n;
}
setLight(-0.5, -0.62, 0.6);

const ch = (c, s) => (c >> s) & 255;
function mixc(a, b, u) {
  return (((ch(a, 16) + (ch(b, 16) - ch(a, 16)) * u + 0.5) | 0) << 16) | (((ch(a, 8) + (ch(b, 8) - ch(a, 8)) * u + 0.5) | 0) << 8) | ((ch(a, 0) + (ch(b, 0) - ch(a, 0)) * u + 0.5) | 0);
}

/**
 * A dough material: a 64-step colour ramp over the lighting term (-1..1),
 * from stops [term, colour], plus the flour colour. Build once per tint.
 */
export function material(stops, flour, shade = 0x3a2c2c) {
  const ramp = new Int32Array(64);
  for (let i = 0; i < 64; i++) {
    const u = (i / 63) * 2 - 1;
    let k = 1;
    while (k < stops.length - 1 && stops[k][0] < u) k++;
    const a = stops[k - 1], b = stops[k];
    const f = Math.min(1, Math.max(0, (u - a[0]) / (b[0] - a[0])));
    ramp[i] = mixc(a[1], b[1], f);
  }
  return { ramp, flour, shade, dust: Int32Array.from(ramp, (c) => mixc(c, flour, 0.55)) };
}

// ------------------------------------------------------------ the renderer

const BW = 72, BH = 72;      // the largest numeral box, with its ball, squash and shadow (5 fields: ~50 KB as int16 in C)
const V = new Float32Array(BW * BH);   // tube field, R^2 - d^2
const T = new Float32Array(BW * BH);   // blur scratch
const O = new Float32Array(BW * BH);   // occlusion: coverage blurred over 7 x 7
const Z = new Float32Array(BW * BH);   // height
const C = new Float32Array(BW * BH);   // coverage

/** A parameter block, reused (monomorphic). */
export function doughJob() {
  return {
    gl: null, ox: 0, oy: 0, w: 0, h: 0, r: 3,
    sx: 1, sy: 1,                     // squash about the base centre
    lean: 0,                          // shear: px of x shift at the top
    ball: 0, brx: 10, bry: 8,         // ball size 0..1 and full radii
    flat: 1,                          // height scale (pounded dough is flatter)
    mat: null, a: 1, seed: 0,
    shadow: 0.7,                      // strength of the keyline and occlusion
  };
}

const PX = new Float32Array(1024), PY = new Float32Array(1024);
const AOR = 3;       // occlusion radius, px
const AO = 26;       // how far (of 64 ramp steps) occlusion darkens the dough

/** Draw one dough numeral (or ball) described by job `j` onto `g`. */
export function drawDough(g, j) {
  const cost = g.cost;
  const gl = j.gl, W = g.width, H = g.height;
  const ax = j.ox + j.w * 0.5, ay = j.oy + j.h;          // base centre, screen
  const r = j.r, r2 = r * r, rs = r + 1.5, rb = rs + AOR;
  const showTube = gl !== null && j.sy > 0.02;
  // transformed samples and the box
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  const n = showTube ? gl.n : 0;
  for (let i = 0; i < n; i++) {
    const ly = gl.y[i] - j.h;                            // <= 0, from the base
    const X = ax + (gl.x[i] - j.w * 0.5) * j.sx + j.lean * (-ly / j.h), Y = ay + ly * j.sy;
    PX[i] = X; PY[i] = Y;
    if (X < x0) x0 = X; if (X > x1) x1 = X; if (Y < y0) y0 = Y; if (Y > y1) y1 = Y;
  }
  cost.box += n;
  const brx = j.brx * j.ball, bry = j.bry * j.ball;
  const bcx = ax, bcy = ay - bry;
  if (brx > 0.3) {
    if (bcx - brx < x0 + rs) x0 = bcx - brx - rs; if (bcx + brx > x1 - rs) x1 = bcx + brx + rs;
    if (bcy - bry < y0 + rs) y0 = bcy - bry - rs; if (ay > y1 - rs) y1 = ay + rs;
  }
  if (x0 > x1) return;
  let bx0 = Math.floor(x0 - rb) - 1, by0 = Math.floor(y0 - rb) - 1;
  let bx1 = Math.ceil(x1 + rb) + 1, by1 = Math.ceil(y1 + rb) + 1;
  if (bx1 - bx0 > BW) bx1 = bx0 + BW;
  if (by1 - by0 > BH) by1 = by0 + BH;
  const bw = bx1 - bx0, bh = by1 - by0;
  V.fill(-1e6, 0, bw * bh);

  // 1. stamp the tube
  for (let i = 0; i < n; i++) {
    const cx = PX[i] - bx0, cy = PY[i] - by0;
    const sx0 = (cx - rs) | 0, sx1 = (cx + rs) | 0, sy0 = (cy - rs) | 0, sy1 = (cy + rs) | 0;
    for (let y = sy0; y <= sy1; y++) {
      if (y < 0 || y >= bh) continue;
      const dy = y + 0.5 - cy, dy2 = dy * dy, row = y * bw;
      for (let x = sx0; x <= sx1; x++) {
        if (x < 0 || x >= bw) continue;
        const dx = x + 0.5 - cx, v = r2 - dx * dx - dy2;
        if (v > V[row + x]) V[row + x] = v;
      }
    }
    cost.box += (sx1 - sx0 + 1) * (sy1 - sy0 + 1);
  }

  // 2. height and coverage, unioned with the ball
  const inv2r = 1 / (2 * r), flat = j.flat;
  const hasBall = brx > 0.3;
  const ibx = hasBall ? 1 / brx : 0, iby = hasBall ? 1 / bry : 0, bmin = hasBall ? Math.min(brx, bry) * 0.5 : 0, bz = bry * 0.8 * flat;
  for (let y = 0; y < bh; y++) {
    const py = by0 + y + 0.5, row = y * bw;
    const qy = (py - bcy) * iby, qy2 = qy * qy;
    for (let x = 0; x < bw; x++) {
      const k = row + x, v = V[k];
      let sd = v * inv2r, z = 0;
      if (v > 0) z = SQRT_T[v * 8 < 1024 ? (v * 8) | 0 : 1024] * flat;
      if (hasBall && py < ay + 0.5) {
        const qx = (bx0 + x + 0.5 - bcx) * ibx, q = 1 - qx * qx - qy2;
        const sb = q * bmin;
        if (sb > sd) sd = sb;
        if (q > 0) { const zb = DOME_T[(q * 256) | 0] * bz; if (zb > z) z = zb; }
      }
      Z[k] = z;
      C[k] = sd + 0.5;
    }
  }
  cost.box += bw * bh * 4;

  // 3. occlusion: the coverage box-blurred 7 x 7 (two running sums). Outside
  // the dough it is the soft keyline and contact shadow, strongest where the
  // dough surrounds a pixel (counters, the 8's waist); inside it darkens the
  // dough where it is thin or pinched.
  const inv = 1 / ((2 * AOR + 1) * (2 * AOR + 1));
  for (let y = 0; y < bh; y++) {
    const row = y * bw;
    let acc = 0;
    for (let x = -AOR; x < bw + AOR; x++) {
      const xi = x + AOR;
      if (xi < bw) { const c = C[row + xi]; acc += c <= 0 ? 0 : c >= 1 ? 1 : c; }
      const xo = x - AOR - 1;
      if (xo >= 0) { const c = C[row + xo]; acc -= c <= 0 ? 0 : c >= 1 ? 1 : c; }
      if (x >= 0 && x < bw) T[row + x] = acc;
    }
  }
  for (let x = 0; x < bw; x++) {
    let acc = 0;
    for (let y = -AOR; y < bh + AOR; y++) {
      const yi = y + AOR;
      if (yi < bh) acc += T[yi * bw + x];
      const yo = y - AOR - 1;
      if (yo >= 0) acc -= T[yo * bw + x];
      if (y >= 0 && y < bh) O[y * bw + x] = acc * inv;
    }
  }
  cost.box += bw * bh * 6;

  // 4. shade
  const ramp = j.mat.ramp, dust = j.mat.dust, alpha = j.a, seed = j.seed, shade = j.mat.shade, shadow = j.shadow;
  const ox = Math.round(j.ox), oy = Math.round(j.oy);
  for (let y = 1; y < bh - 1; y++) {
    const sy = by0 + y;
    if (sy < 0 || sy >= H) continue;
    const row = y * bw;
    for (let x = 1; x < bw - 1; x++) {
      const k = row + x;
      let cov = C[k];
      const sx = bx0 + x;
      if (sx < 0 || sx >= W) continue;
      const o = O[k];
      if (cov < 1 && o > 0.03) {
        // the keyline / contact shadow under the edge
        let sa = o * 2.2 * shadow;
        if (sa > 0.8) sa = 0.8;
        g.put(sx, sy, shade, sa * alpha);
        cost.box += 3;
      }
      if (cov <= 0.02) continue;
      if (cov > 1) cov = 1;
      const nx = (Z[k - 1] - Z[k + 1]) * 0.5, ny = (Z[k - bw] - Z[k + bw]) * 0.5;
      const s = (nx * nx + ny * ny) * 32;
      const dot = (nx * lx + ny * ly + lz) * INVN_T[s < 512 ? s | 0 : 512];
      let idx = ((dot + 1) * 31.5 - (1 - o) * AO) | 0;
      if (idx < 0) idx = 0; else if (idx > 63) idx = 63;
      // flour: a fixed speckle in the numeral's own frame, on the upper faces
      const hsh = (Math.imul((sx - ox) * 73856093 ^ (sy - oy) * 19349663 ^ seed, 0x2c1b3c6d) >>> 24);
      const c = hsh < 18 && ny > -0.3 ? dust[idx] : ramp[idx];
      g.put(sx, sy, c, cov * alpha);
      cost.box += 10;
    }
  }
}
