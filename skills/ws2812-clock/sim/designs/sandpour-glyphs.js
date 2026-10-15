// Sand pour: the ten moulds. Each digit is a sealed tube of glass bent into
// a numeral, like laboratory glassware, 25 x 35 px, with a mouth at the top
// on the side facing the central stream (where sand is poured in) and a brass
// trapdoor at its lowest point (where it drains). The tube is wide (6 px of
// sand) so the numeral is made of sand, the glass is only its skin.
//
// Everything here is precomputed once: the distance field of each centre
// line (for coverage and for the glass morph between digits), the cavity the
// sand automaton runs in, and the mouth / trapdoor cells.

export const BW = 25, BH = 35;      // mould box, pixels
export const R = 3.1;               // tube radius: sand is the cells with sdf < R
export const GLASS = R + 0.8;       // the glass skin runs at this distance

const L = 4.4, RT = 20.6, T = 4.4, B = 30.6, CX = 12.5;

/** Points along an elliptical arc, angles in degrees (0 = +x, 90 = down). */
function arc(cx, cy, rx, ry, a0, a1, step = 4) {
  const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / step)), pts = [];
  for (let k = 0; k <= n; k++) {
    const a = ((a0 + (a1 - a0) * k / n) * Math.PI) / 180;
    pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return pts;
}
function quad(a, c, b, n = 14) {
  const pts = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n, u = 1 - t;
    pts.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]);
  }
  return pts;
}
/** Superellipse loop: a glass-tube 0 with straight-ish sides and round ends. */
function loop(cx, cy, rx, ry, p = 2.6, n = 64) {
  const pts = [];
  for (let k = 0; k <= n; k++) {
    const a = (k / n) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    pts.push([cx + rx * Math.sign(c) * Math.abs(c) ** (2 / p), cy + ry * Math.sign(s) * Math.abs(s) ** (2 / p)]);
  }
  return pts;
}
const rot180 = (paths) => paths.map((p) => p.map(([x, y]) => [BW - x, BH - y]));

// Centre lines, as lists of polylines, in box pixels.
const SIX = [
  arc(13.4, 17.6, 9.0, 13.2, 302, 168),          // the spine: hook top right, down the left
  arc(12.5, 22.6, 8.1, 8.0, 0, 360),             // the bowl
];
const PATHS = {
  0: [loop(CX, 17.5, 8.1, 13.1)],
  1: [[[14.6, T], [14.6, B]], [[14.6, T], [7.2, 10.6]]],
  2: [[...arc(12.5, 11.4, 8.1, 7.0, 192, 385), ...quad([19.84, 14.36], [14.5, 21.5], [L, B]).slice(1), [RT, B]]],
  3: [
    [...arc(12.3, 10.5, 7.7, 6.1, 205, 450)],
    [...arc(12.5, 23.7, 8.1, 6.9, 270, 520)],
    [[12.4, 16.7], [8.4, 16.7]],
  ],
  4: [[[16.8, T], [16.8, B]], [[16.8, T], [L, 22.4], [RT, 22.4]]],
  5: [[[19.8, T], [6.0, T], [5.6, 16.0]], arc(12.1, 21.9, 8.5, 8.7, 222, 500)],
  6: SIX,
  7: [[[L, T], [RT, T]], quad([RT, T], [15.6, 15.5], [10.0, B])],
  8: [arc(CX, 10.8, 6.8, 6.4, 0, 360), arc(CX, 23.5, 8.1, 7.1, 0, 360)],
  9: rot180(SIX),
};

function segsOf(paths) {
  const s = [];
  for (const p of paths) for (let k = 0; k + 1 < p.length; k++) s.push([p[k][0], p[k][1], p[k + 1][0], p[k + 1][1]]);
  return s;
}
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
  let t = L2 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

function build(d, side) {
  const paths = PATHS[d], segs = segsOf(paths), N = BW * BH;
  const sdf = new Float32Array(N);
  for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) {
    let m = 1e9;
    for (const s of segs) { const v = segDist(x + 0.5, y + 0.5, s[0], s[1], s[2], s[3]); if (v < m) m = v; }
    sdf[y * BW + x] = m;
  }
  // the mouth: the highest point of the centre line, nudged toward the stream
  // (side 0 = a left-hand mould, the stream is on its right)
  const pts = paths.flat();
  let best = null, bs = -1e9;
  for (const [x, y] of pts) {
    // a 7 is poured at its corner, so the sand runs straight down the stem
    const inner = d === 7 ? x : side === 0 ? x : BW - x, sc = -y + 0.3 * inner;
    if (sc > bs) { bs = sc; best = [x, y]; }
  }
  // the trapdoor: the lowest point, nearest the middle on ties
  let trap = null, bt = -1e9;
  for (const [x, y] of pts) { const sc = y - 0.02 * Math.abs(x - CX); if (sc > bt) { bt = sc; trap = [x, y]; } }
  const mouth = { x: best[0], y: best[1] - GLASS }, door = { x: trap[0], y: trap[1] + GLASS };
  const cav = new Uint8Array(N), spawn = [], sinks = [];
  let count = 0;
  for (let i = 0; i < N; i++) if (sdf[i] < R) { cav[i] = 1; count++; }
  for (let i = 0; i < N; i++) {
    if (!cav[i]) continue;
    const x = (i % BW) + 0.5, y = Math.floor(i / BW) + 0.5;
    if (Math.hypot(x - mouth.x, y - (best[1] - R + 0.6)) < 2.4) spawn.push(i);
    if (Math.hypot(x - door.x, y - (trap[1] + R - 0.6)) < 2.4) sinks.push(i);
  }
  // The tube as a lit glass cylinder (light from the top left, in front):
  // shade darkens the sand toward the tube's sides, spec is the glassy
  // highlight streak that runs along every tube, full or empty.
  const shade = new Float32Array(N), spec = new Float32Array(N);
  const Lx = -0.42, Ly = -0.58, Lz = 0.7, hn = Math.hypot(Lx, Ly, Lz + 1);
  const Hx = Lx / hn, Hy = Ly / hn, Hz = (Lz + 1) / hn;
  for (let y = 1; y < BH - 1; y++) for (let x = 1; x < BW - 1; x++) {
    const i = y * BW + x, sd = sdf[i];
    if (sd >= R + 0.6) continue;
    let gx = (sdf[i + 1] - sdf[i - 1]) / 2, gy = (sdf[i + BW] - sdf[i - BW]) / 2;
    const gl = Math.hypot(gx, gy) || 1; gx /= gl; gy /= gl;
    const r = Math.min(sd, R) / R, nz = Math.sqrt(Math.max(0, 1 - r * r));
    const nx = gx * r, ny = gy * r;
    shade[i] = 0.5 + 0.7 * Math.max(0, nx * Lx + ny * Ly + nz * Lz);
    spec[i] = Math.max(0, nx * Hx + ny * Hy + nz * Hz) ** 14;
  }
  // cavity cells lowest first: where packed sand settles into air pockets
  const low = [];
  for (let i = 0; i < N; i++) if (cav[i]) low.push(i);
  low.sort((a, b) => Math.floor(b / BW) - Math.floor(a / BW) || a - b);
  return { d, side, sdf, cav, count, spawn, sinks, mouth, door, low, shade, spec };
}

/** GLYPHS[side][d]: side 0 = left-hand mould (mouth top right), 1 = right-hand. */
export const GLYPHS = [0, 1].map((side) => Array.from({ length: 10 }, (_, d) => build(d, side)));
