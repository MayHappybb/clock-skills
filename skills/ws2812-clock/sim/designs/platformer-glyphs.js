// Platformer: the digits are warp pipes. Each glyph is one or two pipe paths
// (centre lines with rounded bends), shaded as real cylinders, with the
// classic wide lip on every open end. Two cuts of the same set: tall hour
// pipes for the tower (22 x 72) and squat minute pipes for the run (22 x 32).
//
// Every pixel of a glyph knows g: how far along the pipe it is from the
// glyph's root (where it meets the ground). A pipe grows by raising a
// threshold on g and retracts by lowering it, so every digit can sprout out
// of the ground and be sucked back in, with a lip riding the moving end.
import * as kit from '../js/kit.js';

export const SIZES = {
  hour: { W: 24, H: 72, r: 4.0, lipW: 1.9, lipL: 4.2 },
  min: { W: 24, H: 40, r: 3.5, lipW: 1.6, lipL: 3.6 },
};

/** The ten digits as pipe paths in cell pixels (y down; the cell is W x H, its bottom on the ground). */
function design(ch, W, H, r) {
  const tall = H > 40, a = r + 0.5, L = a, R = W - a, T = a, B = H - a, cx = W / 2, q = (R - L) / 2, GY = H + 7;
  const tail = tall ? 9 : 6;
  switch (ch) {
    case '0': return { root: [cx, B], paths: [{ pts: [[cx, T], [R, T, q], [R, B, q], [L, B, q], [L, T, q]], closed: true }] };
    case '1': {
      const sx = cx + 1.5;
      return { root: [sx, GY], paths: [{ pts: [[sx - (tall ? 8.5 : 7.5), T + (tall ? 8.5 : 6)], [sx, T, 3], [sx, GY]], a: 'lip', b: 'ground' }] };
    }
    case '2': {
      const y2 = tall ? T + q + 7 : T + q + 1.5;
      return { root: [cx, B], paths: [{ pts: [[L, T + tail], [L, T, q], [R, T, q], [R, y2, tall ? 6 : 3.5], [L, B, 2.5], [R + 0.5, B]], a: 'lip', b: 'lip' }] };
    }
    case '3': {
      const y3 = tall ? 0.41 * H : 0.44 * H;
      return { root: [cx, B], paths: [{ pts: [[L - 0.5, T], [R, T, 2.5], [cx - 1.5, y3, 2], [R, y3, q], [R, B, q], [L, B, q], [L, B - tail]], a: 'lip', b: 'lip' }] };
    }
    case '4': {
      const sx = R - 1, y4 = tall ? 0.63 * H : 0.64 * H;
      return {
        root: [sx, GY],
        paths: [
          { pts: [[sx, T], [sx, GY]], a: 'lip', b: 'ground' },
          { pts: [[sx, y4], [L, y4, 2.5], [sx, T + (tall ? 7 : 5)]], a: 'none', b: 'none' },
        ],
      };
    }
    case '5': {
      const y5 = tall ? 0.40 * H : 0.43 * H;
      return { root: [cx, B], paths: [{ pts: [[R + 0.5, T], [L, T, 1.5], [L, y5, 1.5], [R, y5, q], [R, B, q], [L, B, q], [L, B - tail]], a: 'lip', b: 'lip' }] };
    }
    case '6': if (!tall) {
      // squat cut: a small bowl at the bottom, the stem rising into a flag
      const y6 = 0.5 * H;
      return { root: [cx, B], paths: [{ pts: [[R + 0.5, T], [L, T, 4], [L, B, q], [R, B, q], [R, y6, q], [L, y6, q]], a: 'lip', b: 'none' }] };
    } else {
      const y6 = tall ? 0.47 * H : 0.44 * H;
      return { root: [cx, B], paths: [{ pts: [[R, T + tail], [R, T, q], [L, T, q], [L, B, q], [R, B, q], [R, y6, q], [L, y6, q], [L, y6 + q + 2]], a: 'lip', b: 'none' }] };
    }
    case '7':
      return { root: [cx - 2, GY], paths: [{ pts: [[L - 0.5, T], [R, T, 2.5], [cx - 2, GY]], a: 'lip', b: 'ground' }] };
    case '8': {
      const y8 = tall ? 0.45 * H : 0.45 * H, i = 1, qi = q - i;
      return {
        root: [cx, B],
        paths: [
          { pts: [[cx, y8], [R, y8, q], [R, B, q], [L, B, q], [L, y8, q]], closed: true },
          { pts: [[cx, y8], [L + i, y8, qi], [L + i, T, qi], [R - i, T, qi], [R - i, y8, qi]], closed: true },
        ],
      };
    }
    case '9': if (!tall) {
      // squat cut: a small bowl on top, the stem dropping into a foot
      const y9 = 0.5 * H;
      return { root: [cx, B], paths: [{ pts: [[L - 0.5, B], [R, B, 4], [R, T, q], [L, T, q], [L, y9, q], [R, y9, q]], a: 'lip', b: 'none' }] };
    } else {
      const y9 = tall ? 0.53 * H : 0.56 * H;
      return { root: [cx, B], paths: [{ pts: [[L, B - tail], [L, B, q], [R, B, q], [R, T, q], [L, T, q], [L, y9, q], [R, y9, q], [R, y9 - q - 2]], a: 'lip', b: 'none' }] };
    }
  }
  throw new Error('no glyph ' + ch);
}

/** Polyline with rounded corners (quadratic) sampled every ~0.25 px: [{x, y}] plus arc length. */
function sample(path) {
  const P = path.pts.map((p) => ({ x: p[0], y: p[1], f: p[2] || 0 }));
  const n = P.length, closed = !!path.closed;
  const at = (i) => P[(i + n) % n];
  const len = (A, Bp) => Math.hypot(Bp.x - A.x, Bp.y - A.y);
  // tangent length at each corner, shared fairly with neighbours
  const tl = P.map((p, i) => {
    if (!closed && (i === 0 || i === n - 1)) return 0;
    const pa = at(i - 1), pb = at(i + 1), fa = closed || i - 1 > 0 ? pa.f : 0, fb = closed || i + 1 < n - 1 ? pb.f : 0;
    return Math.min(p.f, (len(pa, p) * p.f) / (p.f + fa || 1), (len(p, pb) * p.f) / (p.f + fb || 1));
  });
  const out = [];
  const push = (x, y) => {
    const l = out[out.length - 1];
    if (l && Math.hypot(x - l.x, y - l.y) < 1e-6) return;
    out.push({ x, y });
  };
  const lineTo = (x0, y0, x1, y1) => {
    const k = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 0.25));
    for (let j = 0; j <= k; j++) push(x0 + ((x1 - x0) * j) / k, y0 + ((y1 - y0) * j) / k);
  };
  const corner = (i) => {
    const p = at(i), pa = at(i - 1), pb = at(i + 1), t = tl[i];
    const la = len(pa, p), lb = len(p, pb);
    const A = { x: p.x + ((pa.x - p.x) * t) / la, y: p.y + ((pa.y - p.y) * t) / la };
    const Bq = { x: p.x + ((pb.x - p.x) * t) / lb, y: p.y + ((pb.y - p.y) * t) / lb };
    return [A, Bq];
  };
  const idx = closed ? [...Array(n).keys(), 0] : [...Array(n).keys()];
  let cur = null;
  for (let m = 0; m < idx.length; m++) {
    const i = idx[m], p = at(i), t = tl[i];
    if (t <= 0.01) {
      if (cur) lineTo(cur.x, cur.y, p.x, p.y); else push(p.x, p.y);
      cur = { x: p.x, y: p.y };
      continue;
    }
    const [A, Bq] = corner(i);
    if (cur) lineTo(cur.x, cur.y, A.x, A.y); else push(A.x, A.y);
    if (closed && m === idx.length - 1) { cur = A; break; }
    const k = Math.max(4, Math.ceil(t * 3));
    for (let j = 1; j <= k; j++) {
      const u = j / k, v = 1 - u;
      push(v * v * A.x + 2 * u * v * p.x + u * u * Bq.x, v * v * A.y + 2 * u * v * p.y + u * u * Bq.y);
    }
    cur = Bq;
  }
  let s = 0;
  out.forEach((p, i) => { if (i) s += Math.hypot(p.x - out[i - 1].x, p.y - out[i - 1].y); p.s = s; });
  return out;
}

// light from the upper left, towards the viewer
const LX = -0.55, LY = -0.68, LZ = 0.48, LN = Math.hypot(LX, LY, LZ);
const lx = LX / LN, ly = LY / LN, lz = LZ / LN;
const hx0 = lx, hy0 = ly, hz0 = lz + 1, hn = Math.hypot(hx0, hy0, hz0), hx = hx0 / hn, hy = hy0 / hn, hz = hz0 / hn;
/** Shade a point on a cylinder: (px, py) the unit cross-section direction in the image plane, k = |offset| / radius. */
export function shade(px, py, k, base, out, o) {
  // toon bands like a 16-bit warp pipe: outline, shadow, body, light, glint
  k = Math.min(k, 0.999);
  const z = Math.sqrt(1 - k * k), nx = px * k, ny = py * k;
  const dif = Math.max(0, nx * lx + ny * ly + z * lz), sp = Math.max(0, nx * hx + ny * hy + z * hz);
  const P = PAL;
  let c = P[0];
  const st = (a, b, x) => kit.smoothstep(a - 0.05, a + 0.05, x);
  let r = P[1][0], g = P[1][1], b = P[1][2];
  const mixTo = (C, f) => { r += (C[0] - r) * f; g += (C[1] - g) * f; b += (C[2] - b) * f; };
  mixTo(P[2], st(0.32, 0, dif));
  mixTo(P[3], st(0.72, 0, dif));
  mixTo(P[4], st(0.955, 0, sp));
  mixTo(P[0], kit.smoothstep(0.78, 0.92, k));
  const m = base === PIPE_TINT ? 1 : 1;
  out[o] = r * m; out[o + 1] = g * m; out[o + 2] = b * m;
}
const PIPE_TINT = null;
const PAL = ['#04200a', '#127a22', '#2fbe36', '#8ae65a', '#eaffd8'].map((h) => kit.hex(h));

const cache = new Map();
/**
 * A glyph at one size: pixels (local x, y), coverage, colour, g; lips; and
 * the sampled paths with g, to place moving lips. Built once.
 */
export function glyph(ch, sizeKey, base) {
  const key = ch + sizeKey;
  if (cache.has(key)) return cache.get(key);
  const S = SIZES[sizeKey], { W, H, r } = S, D = design(ch, W, H, r);
  const paths = D.paths.map((p) => ({ ...p, smp: sample(p) }));
  // g along each path: geodesic from the root (first path) or from the junction with an earlier path
  paths.forEach((p, pi) => {
    const smp = p.smp, Lp = smp[smp.length - 1].s;
    let best = 1e9, sr = 0, off = 0;
    const tryPt = (x, y, o) => smp.forEach((q) => { const d = Math.hypot(q.x - x, q.y - y); if (d < best - 1e-9) { best = d; sr = q.s; off = o; } });
    if (pi === 0) tryPt(D.root[0], D.root[1], 0);
    else {
      // join at this path's own start
      const st = smp[0];
      let bd = 1e9, bg = 0;
      for (let k = 0; k < pi; k++) for (const q of paths[k].smp) { const d = Math.hypot(q.x - st.x, q.y - st.y); if (d < bd) { bd = d; bg = q.g; } }
      sr = 0; off = bg;
    }
    for (const q of smp) {
      const ds = Math.abs(q.s - sr);
      q.g = off + (p.closed ? Math.min(ds, Lp - ds) : ds);
    }
    p.gmax = Math.max(...smp.map((q) => q.g));
  });
  const gmax = Math.max(...paths.map((p) => p.gmax));

  // body pixels
  const px = [], py = [], cov = [], col = [], gg = [];
  const tmp = new Float32Array(3);
  for (let y = -3; y < H; y++) {
    for (let x = -3; x < W + 3; x++) {
      const cxp = x + 0.5, cyp = y + 0.5;
      let bd = 1e9, bx = 0, by = 0, bg = 0;
      for (const p of paths) {
        const smp = p.smp;
        for (let k = 0; k + 1 < smp.length; k++) {
          const A = smp[k], Bq = smp[k + 1], dx = Bq.x - A.x, dy = Bq.y - A.y, L2 = dx * dx + dy * dy;
          const t = L2 ? kit.clamp(((cxp - A.x) * dx + (cyp - A.y) * dy) / L2) : 0;
          const qx = A.x + dx * t, qy = A.y + dy * t, d = Math.hypot(cxp - qx, cyp - qy);
          if (d < bd) { bd = d; bx = qx; by = qy; bg = A.g + (Bq.g - A.g) * t; }
        }
      }
      if (bd > r + 0.6) continue;
      const k = bd / r, ux = bd > 1e-6 ? (cxp - bx) / bd : 0, uy = bd > 1e-6 ? (cyp - by) / bd : 0;
      shade(ux, uy, k, base, tmp, 0);
      // couplings: a dark joint and a bright collar every so often along the pipe
      const gm = bg % 15;
      if (bg > 5 && bg < gmax - 7) {
        const j = gm < 1.1 ? 0.35 : gm < 2.3 ? 1.3 : 1;
        tmp[0] *= j; tmp[1] *= j; tmp[2] *= j;
      }
      px.push(x); py.push(y); cov.push(kit.clamp(r + 0.5 - bd)); col.push(tmp[0], tmp[1], tmp[2]); gg.push(bg);
    }
  }
  // lips on the open ends
  const lips = [];
  paths.forEach((p) => {
    const smp = p.smp, n = smp.length;
    const ends = [];
    if (p.a === 'lip') ends.push([smp[0], smp[Math.min(6, n - 1)]]);
    if (p.b === 'lip') ends.push([smp[n - 1], smp[Math.max(0, n - 7)]]);
    for (const [e, inner] of ends) {
      const dl = Math.hypot(e.x - inner.x, e.y - inner.y), dx = (e.x - inner.x) / dl, dy = (e.y - inner.y) / dl;
      lips.push({ x: e.x, y: e.y, dx, dy, g: e.g });
    }
  });
  const lipPix = [];
  for (const lp of lips) {
    const P = lipPixels(lp.x, lp.y, lp.dx, lp.dy, S, base, 1);
    for (const e of P) { e.g = lp.g; lipPix.push(e); }
  }
  // exit: the lip farthest from the root, else the far point of a loop
  let exit = null;
  for (const lp of lips) if (lp.g > gmax - 3 && (!exit || lp.g > exit.g)) exit = { x: lp.x, y: lp.y, dx: lp.dx, dy: lp.dy, g: lp.g };
  if (!exit) {
    for (const p of paths) for (const q of p.smp) if (!exit || q.g > exit.g) exit = { x: q.x, y: q.y, dx: 0, dy: -1, g: q.g };
  }
  // top profile: the highest pipe pixel per column (for the frog's feet)
  const top = new Float32Array(W + 6).fill(1e9);
  for (let i = 0; i < px.length; i++) if (cov[i] > 0.5) { const c = px[i] + 3; if (py[i] < top[c]) top[c] = py[i]; }
  for (const e of lipPix) if (e.c > 0.5) { const c = e.x + 3; if (c >= 0 && c < top.length && e.y < top[c]) top[c] = e.y; }
  // right and left profiles (outermost pixel per row)
  const right = new Float32Array(H).fill(-1e9), left = new Float32Array(H).fill(1e9);
  const prof = (x, y, c) => { if (c > 0.5 && y >= 0 && y < H) { if (x > right[y]) right[y] = x; if (x < left[y]) left[y] = x; } };
  for (let i = 0; i < px.length; i++) prof(px[i], py[i], cov[i]);
  for (const e of lipPix) prof(e.x, e.y, e.c);

  const G = {
    ch, size: sizeKey, S, paths, gmax, exit, top, right, left, root: D.root, lipList: lips,
    px: Int16Array.from(px), py: Int16Array.from(py), cov: Float32Array.from(cov), col: Float32Array.from(col), g: Float32Array.from(gg),
    lips: lipPix,
  };
  cache.set(key, G);
  return G;
}

/** Pixels of a lip whose opening is at (x, y) facing (dx, dy). */
export function lipPixels(x, y, dx, dy, S, base, a = 1) {
  const R = S.r + S.lipW, Ll = S.lipL, out = [], tmp = new Float32Array(3);
  const ext = R + Ll + 1;
  const nx = -dy, ny = dx;
  for (let yy = Math.floor(y - ext); yy <= Math.ceil(y + ext); yy++) {
    for (let xx = Math.floor(x - ext); xx <= Math.ceil(x + ext); xx++) {
      const ox = xx + 0.5 - x, oy = yy + 0.5 - y;
      const u = ox * dx + oy * dy, v = ox * nx + oy * ny;
      const c = kit.clamp(R + 0.5 - Math.abs(v)) * kit.clamp(u + Ll + 0.5) * kit.clamp(0.5 - u) * a;
      if (c <= 0.02) continue;
      const k = Math.abs(v) / R, sg = v >= 0 ? 1 : -1;
      shade(nx * sg, ny * sg, k, base, tmp, 0);
      // a dark seam where the lip meets the pipe, and a bright rim at the mouth
      const seam = 1 - 0.9 * (1 - kit.smoothstep(0.4, 1.2, Math.abs(u + Ll)));
      const mouth = 1.2 + 0.4 * (1 - kit.smoothstep(0, 0.9, -u));
      const m = seam * mouth;
      out.push({ x: xx, y: yy, c, r: tmp[0] * m + 0.02 * seam, gr: tmp[1] * m, b: tmp[2] * m * 0.8 });
    }
  }
  return out;
}

/**
 * The moving ends while a glyph grows or retracts to threshold G: lips at
 * every place a path's g crosses G, facing the way the pipe is growing.
 */
export function fronts(Gl, G) {
  const out = [];
  if (G <= 0.3 || G >= Gl.gmax - 0.3) return out;
  for (const p of Gl.paths) {
    const smp = p.smp;
    if (G >= p.gmax - 0.6) continue;
    for (let k = 0; k + 1 < smp.length; k++) {
      const a = smp[k].g - G, b = smp[k + 1].g - G;
      if ((a <= 0 && b > 0) || (a > 0 && b <= 0)) {
        const t = a / (a - b), x = smp[k].x + (smp[k + 1].x - smp[k].x) * t, y = smp[k].y + (smp[k + 1].y - smp[k].y) * t;
        let dx = smp[k + 1].x - smp[k].x, dy = smp[k + 1].y - smp[k].y;
        if (b < a) { dx = -dx; dy = -dy; }
        const l = Math.hypot(dx, dy) || 1;
        out.push({ x, y, dx: dx / l, dy: dy / l });
      }
    }
  }
  return out;
}
