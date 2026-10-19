// Grand Prix track geometry: every numeral is a floodlit racing circuit.
//
// Each digit is one centre-line path (the circuit's skeleton) in a 30 x 50
// box, leaned like a racing livery. The road is 7 px wide (14 mm), with
// white edge lines and red/white kerbs wherever the corner is tight or the
// road ends in a hairpin. Open strokes are out-and-back circuits: cars run
// up one lane, turn the hairpin at the stroke's end and come back down the
// other. 0 and 8 are closed loops (8 is a figure-of-eight).
//
// Exports per digit:
//   raster: r, g, b (lit asphalt, lines, kerbs; linear), m (road coverage),
//           sk (0..1 along the skeleton: the order the floodlight banks run)
//   lap:    x, y, hx, hy, sk, v, tc (cumulative seconds), n, T (lap time)

export const SLANT = 0.15;
const STEP = 0.5;
// the set being built: scale of the 30 x 50 skeleton box, road half-width, box
let SC = 1, ROAD = 4.5, OX = 4.6, OY = 7, GW = 46, GH = 64;

const ASPH = [0.045, 0.05, 0.064];   // floodlit asphalt, cool white
const LINE = [0.40, 0.41, 0.44];      // white edge line
const KERB_R = [0.75, 0.03, 0.02], KERB_W = [0.52, 0.52, 0.54];

// ---------------------------------------------------------------- paths
function pathBuilder() {
  const pts = [];
  const b = {
    pts,
    M(x, y) { pts.push([x, y]); return b; },
    L(x, y) {
      const [x0, y0] = pts[pts.length - 1];
      const n = Math.max(1, Math.ceil(Math.hypot(x - x0, y - y0) / STEP));
      for (let k = 1; k <= n; k++) pts.push([x0 + ((x - x0) * k) / n, y0 + ((y - y0) * k) / n]);
      return b;
    },
    A(cx, cy, r, a0, a1) {
      const n = Math.max(2, Math.ceil((Math.abs(a1 - a0) * Math.PI / 180 * r) / STEP));
      for (let k = 0; k <= n; k++) {
        const a = ((a0 + ((a1 - a0) * k) / n) * Math.PI) / 180;
        const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
        if (k === 0 && pts.length) b.L(x, y); else pts.push([x, y]);
      }
      return b;
    },
  };
  return b;
}

// skeletons in a 30 x 50 box, y down; angles in degrees, clockwise on screen
const SPEC = {
  0: { closed: true, f: (b) => b.A(15, 15, 15, 180, 360).L(30, 35).A(15, 35, 15, 0, 180).L(0, 15) },
  1: { f: (b) => b.M(4.5, 13).L(16, 1.5).L(16, 50) },
  2: { f: (b) => b.A(15, 14, 13.5, 165, 380).L(1, 49.5).L(30, 49.5) },
  3: { f: (b) => b.A(15, 12.5, 12, 205, 440).L(12, 25).A(15, 37.5, 12.5, 256, 515) },
  4: { f: (b) => b.M(22, 50).L(22, 1).L(1, 34).L(31, 34) },
  5: { f: (b) => b.M(28, 1.5).L(5, 1.5).L(4, 22).A(15, 33.5, 14, 228, 515) },
  7: { f: (b) => b.M(1, 1.5).L(29, 1.5).L(11, 50) },
  8: { closed: true, f: (b) => b.A(15, 12.5, 11.5, 90, -270).A(15, 37, 13, 270, 630) },
  9: { f: (b) => b.A(15, 15, 14.5, 0, 360).L(29.5, 33).A(15, 33, 14.5, 0, 120) },
};
SPEC[6] = { f: (b) => { SPEC[9].f(b); for (const p of b.pts) { p[0] = 30 - p[0]; p[1] = 50 - p[1]; } return b; } };

/** Resample a polyline to uniform STEP spacing. */
function resample(pts, closed) {
  const src = closed ? [...pts, pts[0]] : pts;
  const out = [src[0].slice()];
  let carry = 0;
  for (let i = 1; i < src.length; i++) {
    const [ax, ay] = src[i - 1], [bx, by] = src[i];
    const L = Math.hypot(bx - ax, by - ay);
    if (L < 1e-9) continue;
    let d = STEP - carry;
    while (d <= L) { out.push([ax + ((bx - ax) * d) / L, ay + ((by - ay) * d) / L]); d += STEP; }
    carry = L - (d - STEP);
  }
  if (closed) { const a = out[0], z = out[out.length - 1]; if (Math.hypot(a[0] - z[0], a[1] - z[1]) < STEP * 0.5) out.pop(); }
  else { const z = src[src.length - 1], l = out[out.length - 1]; if (Math.hypot(z[0] - l[0], z[1] - l[1]) > 0.1) out.push(z.slice()); }
  return out;
}
/** Moving-average smoothing; ends stay put on open paths. */
function smooth(pts, closed, win, passes) {
  let p = pts;
  for (let it = 0; it < passes; it++) {
    const n = p.length, q = new Array(n);
    for (let i = 0; i < n; i++) {
      let sx = 0, sy = 0, c = 0;
      for (let k = -win; k <= win; k++) {
        let j = i + k;
        if (closed) j = (j + n) % n; else j = Math.max(0, Math.min(n - 1, j));
        sx += p[j][0]; sy += p[j][1]; c++;
      }
      q[i] = [sx / c, sy / c];
    }
    if (!closed) { q[0] = p[0]; q[n - 1] = p[n - 1]; }
    p = q;
  }
  return p;
}
const lean = ([x, y]) => [OX + x + (50 * SC - y) * SLANT, OY + y];

function curvature(p, closed, i, k = 3) {
  const n = p.length;
  const at = (j) => p[closed ? (j + n) % n : Math.max(0, Math.min(n - 1, j))];
  const a = at(i - k), b = at(i), c = at(i + k);
  const h1 = Math.atan2(b[1] - a[1], b[0] - a[0]), h2 = Math.atan2(c[1] - b[1], c[0] - b[0]);
  let d = h2 - h1; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
  return Math.abs(d) / (k * STEP);
}

// ------------------------------------------------------------------ lap
const VMAX = 62, ALAT = 520, DECEL = 260, ACCEL = 130, LANE = 2.3;

function buildLap(skel, closed) {
  const S = smooth(skel, closed, 6, 3);
  const n = S.length, raw = [];
  const tan = (i) => {
    const a = S[Math.max(0, i - 1)], b = S[Math.min(n - 1, i + 1)];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
  };
  if (closed) {
    for (let i = 0; i < n; i++) raw.push([S[i][0], S[i][1], i / n]);
  } else {
    const lane = (i, sgn) => { const [tx, ty] = tan(i); return [S[i][0] - ty * LANE * sgn, S[i][1] + tx * LANE * sgn]; };
    for (let i = 0; i < n; i++) { const [x, y] = lane(i, 1); raw.push([x, y, i / (n - 1)]); }
    const hairpin = (i, sgn, skv) => {      // half turn round the stroke's end
      const [tx, ty] = tan(i), nx = -ty * sgn, ny = tx * sgn, ex = tx * sgn, ey = ty * sgn;
      for (let k = 1; k < 8; k++) {
        const ph = (Math.PI * k) / 8;
        raw.push([S[i][0] + LANE * (nx * Math.cos(ph) + ex * Math.sin(ph)), S[i][1] + LANE * (ny * Math.cos(ph) + ey * Math.sin(ph)), skv]);
      }
    };
    hairpin(n - 1, 1, 1);
    for (let i = n - 1; i >= 0; i--) { const [x, y] = lane(i, -1); raw.push([x, y, i / (n - 1)]); }
    hairpin(0, -1, 0);
  }
  // resample the loop, carrying sk along
  const m = raw.length, pts = [];
  let carry = 0;
  for (let i = 0; i < m; i++) {
    const a = raw[i], b = raw[(i + 1) % m], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 1e-9) continue;
    let d = carry;
    while (d < L) { const f = d / L; pts.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]); d += STEP; }
    carry = d - L;
  }
  const N = pts.length;
  const lap = {
    n: N, T: 0,
    x: new Float32Array(N), y: new Float32Array(N), hx: new Float32Array(N), hy: new Float32Array(N),
    sk: new Float32Array(N), v: new Float32Array(N), tc: new Float64Array(N + 1),
  };
  for (let i = 0; i < N; i++) {
    const [x, y] = lean(pts[i]); lap.x[i] = x; lap.y[i] = y; lap.sk[i] = pts[i][2];
  }
  for (let i = 0; i < N; i++) {
    const a = (i - 2 + N) % N, b = (i + 2) % N;
    const dx = lap.x[b] - lap.x[a], dy = lap.y[b] - lap.y[a], L = Math.hypot(dx, dy) || 1;
    lap.hx[i] = dx / L; lap.hy[i] = dy / L;
  }
  const P = Array.from({ length: N }, (_, i) => [lap.x[i], lap.y[i]]);
  const v = new Float64Array(N);
  for (let i = 0; i < N; i++) v[i] = Math.min(VMAX, Math.sqrt(ALAT / Math.max(curvature(P, true, i, 4), 1e-4)));
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 2 * N - 1; i >= 0; i--) { const j = i % N, k = (j + 1) % N; v[j] = Math.min(v[j], Math.sqrt(v[k] * v[k] + 2 * DECEL * STEP)); }
    for (let i = 0; i < 2 * N; i++) { const j = i % N, k = (j - 1 + N) % N; v[j] = Math.min(v[j], Math.sqrt(v[k] * v[k] + 2 * ACCEL * STEP)); }
  }
  lap.tc[0] = 0;
  for (let i = 0; i < N; i++) { lap.v[i] = v[i]; lap.tc[i + 1] = lap.tc[i] + STEP / ((v[i] + v[(i + 1) % N]) / 2); }
  lap.T = lap.tc[N];
  return lap;
}

// --------------------------------------------------------------- raster
function buildRaster(skel, closed) {
  const n = skel.length;
  const K = smooth(skel, closed, 2, 2);
  const kappa = new Float32Array(n);
  for (let i = 0; i < n; i++) kappa[i] = curvature(K, closed, i, 4);
  const L = skel.map(lean);
  const total = n * STEP;
  const sz = GW * GH;
  const R = { r: new Float32Array(sz), g: new Float32Array(sz), b: new Float32Array(sz), m: new Float32Array(sz), sk: new Float32Array(sz) };
  for (let py = 0; py < GH; py++) for (let px = 0; px < GW; px++) {
    let best = 1e9, bi = 0;
    for (let i = 0; i < n; i++) {
      const dx = px - L[i][0], dy = py - L[i][1], d = dx * dx + dy * dy;
      if (d < best) { best = d; bi = i; }
    }
    const d = Math.sqrt(best);
    const cov = Math.min(1, Math.max(0, ROAD + 0.5 - d));
    if (cov <= 0) continue;
    const p = py * GW + px;
    const s = bi * STEP;
    // floodlight pools: a pylon every ~17 px of track
    const pool = 0.75 + 0.5 * Math.cos((s / 17) * Math.PI) ** 2;
    let c = [ASPH[0] * pool, ASPH[1] * pool, ASPH[2] * pool];
    const isCap = !closed && (bi === 0 || bi === n - 1);
    const kerbZone = isCap || kappa[bi] > 1 / 7.5;
    if (kerbZone) {
      const band = Math.min(1, Math.max(0, (d - (ROAD - 2.1)) / 0.6));
      let par;
      if (isCap) par = Math.atan2(py - L[bi][1], px - L[bi][0]) * ROAD;
      else par = s;
      const red = Math.floor(par / 1.6) & 1;
      const kc = red ? KERB_R : KERB_W;
      c = [c[0] + (kc[0] - c[0]) * band, c[1] + (kc[1] - c[1]) * band, c[2] + (kc[2] - c[2]) * band];
    } else {
      const e = Math.max(0, 1 - Math.abs(d - (ROAD - 0.8)) / 0.85);
      c = [c[0] + (LINE[0] - c[0]) * e, c[1] + (LINE[1] - c[1]) * e, c[2] + (LINE[2] - c[2]) * e];
    }
    R.r[p] = c[0] * cov; R.g[p] = c[1] * cov; R.b[p] = c[2] * cov; R.m[p] = cov;
    R.sk[p] = bi / Math.max(1, n - 1);
  }
  R.length = total;
  // the centre line, leaned, for the pace car that lays the track
  R.cx = new Float32Array(n); R.cy = new Float32Array(n);
  for (let i = 0; i < n; i++) { R.cx[i] = L[i][0]; R.cy[i] = L[i][1]; }
  R.n = n;
  return R;
}

/** All ten circuits at skeleton scale `scale`, road half-width `road`. */
export function makeSet(scale, road) {
  SC = scale; ROAD = road; OX = road + 0.6; OY = road + 0.6;
  GW = Math.ceil(2 * OX + (30 + 50 * SLANT) * scale); GH = Math.ceil(2 * OY + 50 * scale);
  const set = { w: GW, h: GH, scale, road, digits: [] };
  for (let dgt = 0; dgt <= 9; dgt++) {
    const spec = SPEC[dgt], b = pathBuilder();
    spec.f(b);
    const skel = resample(b.pts.map(([x, y]) => [x * scale, y * scale]), !!spec.closed);
    const R = buildRaster(skel, !!spec.closed);
    R.w = GW; R.h = GH;
    set.digits.push({ raster: R, lap: buildLap(skel, !!spec.closed), closed: !!spec.closed });
  }
  return set;
}
