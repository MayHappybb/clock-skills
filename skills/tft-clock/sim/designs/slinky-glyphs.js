// Slinky glyphs: the ten numerals as the paths a coil spring is laid along,
// and the coil stamps the spring is drawn with.
//
// Each digit is ONE continuous spring path in a 22 x 39 centreline box
// (the tube is 9 px across, so the drawn digit is 31 x 48). A spring cannot
// make a corner, so every join is a bend: the paths are drawn as lines and
// arcs, resampled by arc length and smoothed, which rounds each corner to
// the radius a 9 px coil can take. Counters stay at least 9 x 8 px of
// ground (the 8's top loop is the tightest).
//
// All of this is computed once at load (flash on the device): ten digit
// paths at 0.5 px steps (~2,000 samples, 12 bytes each, ~24 KB as floats,
// ~12 KB as int16 fixed point) and 32 x 16 coil stamps of 11 x 11 2-bit
// classes (~15.5 KB packed).

export const BOX_W = 22, BOX_H = 39;          // centreline box of a digit
export const COIL_A = 4.6, COIL_B = 2.0;       // a coil's ellipse: half across the tube, half along it
export const TILT = 0.32;                      // helix lean of each coil, radians
export const STEP = 0.5;                       // path sample spacing, px
export const RIM = 0.9;                        // depth of a coil's dark back edge, px

// ------------------------------------------------------------ path building

/** Dense polyline from commands: ['M',x,y] ['L',x,y] ['A',cx,cy,r,a0,a1] (degrees, y down, a0->a1). */
function trace(cmds) {
  const pts = [];
  let x = 0, y = 0;
  const push = (px, py) => {
    if (pts.length) {
      const [lx, ly] = pts[pts.length - 1];
      const d = Math.hypot(px - lx, py - ly), n = Math.max(1, Math.ceil(d / 0.2));
      for (let k = 1; k <= n; k++) pts.push([lx + ((px - lx) * k) / n, ly + ((py - ly) * k) / n]);
    } else pts.push([px, py]);
    x = px; y = py;
  };
  for (const c of cmds) {
    if (c[0] === 'M') { if (pts.length) throw new Error('one M per path'); push(c[1], c[2]); }
    else if (c[0] === 'L') push(c[1], c[2]);
    else if (c[0] === 'A' || c[0] === 'E') {
      const [cx, cy, rx, ry, a0, a1] = c[0] === 'A' ? [c[1], c[2], c[3], c[3], c[4], c[5]] : c.slice(1);
      const n = Math.max(8, Math.ceil((Math.abs(a1 - a0) * Math.PI / 180) * Math.max(rx, ry) / 0.2));
      for (let k = 0; k <= n; k++) {
        const a = ((a0 + ((a1 - a0) * k) / n) * Math.PI) / 180;
        push(cx + rx * Math.cos(a), cy + ry * Math.sin(a));
      }
    } else if (c[0] === 'F') {            // a function: c[1](u) for u in [0,1] -> [x, y]
      const n = c[2] ?? 400;
      for (let k = 0; k <= n; k++) push(...c[1](k / n));
    }
  }
  return pts;
}

/** Resample a polyline at `step` spacing by arc length. */
function resample(pts, step) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const L = cum[cum.length - 1], n = Math.max(2, Math.round(L / step) + 1), out = [];
  let j = 1;
  for (let k = 0; k < n; k++) {
    const s = (L * k) / (n - 1);
    while (j < pts.length - 1 && cum[j] < s) j++;
    const u = (s - cum[j - 1]) / (cum[j] - cum[j - 1] || 1);
    out.push([pts[j - 1][0] + (pts[j][0] - pts[j - 1][0]) * u, pts[j - 1][1] + (pts[j][1] - pts[j - 1][1]) * u]);
  }
  return { pts: out, L };
}

/** Box-smooth a polyline (endpoints fixed, window shrinking toward them): rounds corners like a bent spring. */
function smooth(pts, r, passes, closed) {
  let p = pts;
  for (let k = 0; k < passes; k++) {
    const n = p.length, q = [];
    for (let i = 0; i < n; i++) {
      const w = closed ? r : Math.min(r, i, n - 1 - i);
      let sx = 0, sy = 0, c = 0;
      for (let j = -w; j <= w; j++) {
        let t = i + j;
        if (closed) t = (t + n - 1) % (n - 1);
        sx += p[t][0]; sy += p[t][1]; c++;
      }
      q.push([sx / c, sy / c]);
    }
    if (closed) q[n - 1] = q[0];
    p = q;
  }
  return p;
}

/** A finished path: x, y, angle of the tangent, at STEP spacing; L its length. */
function finish(pts, { round = 5, closed = false } = {}) {
  let { pts: p } = resample(pts, STEP);
  if (round > 0) p = smooth(p, round, 3, closed);
  const { pts: q, L } = resample(p, STEP);
  const n = q.length, x = new Float32Array(n), y = new Float32Array(n), a = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    x[i] = q[i][0]; y[i] = q[i][1];
    const i0 = Math.max(0, i - 2), i1 = Math.min(n - 1, i + 2);
    a[i] = Math.atan2(q[i1][1] - q[i0][1], q[i1][0] - q[i0][0]);
  }
  // unwrap the angle so it can be interpolated
  for (let i = 1; i < n; i++) {
    while (a[i] - a[i - 1] > Math.PI) a[i] -= 2 * Math.PI;
    while (a[i] - a[i - 1] < -Math.PI) a[i] += 2 * Math.PI;
  }
  const side = freeSide(x, y, a, n, closed);
  // the way a pulse pushes each coil: toward the open side, the direction smoothed over +-6 px so it turns gently at a knuckle
  let vx = new Float32Array(n), vy = new Float32Array(n);
  for (let i = 0; i < n; i++) { vx[i] = -side[i] * Math.sin(a[i]); vy[i] = side[i] * Math.cos(a[i]); }
  for (let pass = 0; pass < 2; pass++) {
    const ux = new Float32Array(n), uy = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let sx = 0, sy = 0, c = 0;
      for (let j = Math.max(0, i - 12); j <= Math.min(n - 1, i + 12); j++) { sx += vx[j]; sy += vy[j]; c++; }
      ux[i] = sx / c; uy[i] = sy / c;
    }
    vx = ux; vy = uy;
  }
  return { n, L, x, y, a, closed, vx, vy };
}

/**
 * Which side of the path has room (+1: the left normal, -1: the right), so a
 * pulse can bulge a spring outward, never into a counter. Smoothed so the
 * side only changes where both are open.
 */
function freeSide(x, y, a, n, closed) {
  const raw = new Float32Array(n), mid = new Float32Array(n), side = new Float32Array(n);
  const clear = (i, sg) => {
    const px = x[i] - sg * 7 * Math.sin(a[i]), py = y[i] + sg * 7 * Math.cos(a[i]);
    let d = 99;
    for (let j = 0; j < n; j++) {
      let gap = Math.abs(j - i);
      if (closed) gap = Math.min(gap, n - 1 - gap);
      if (gap < 24) continue;
      d = Math.min(d, Math.hypot(x[j] - px, y[j] - py));
    }
    // the box edges count as open space
    return d;
  };
  for (let i = 0; i < n; i++) raw[i] = Math.min(12, clear(i, 1)) - Math.min(12, clear(i, -1));
  // smoothed twice over +-8 px, so the bulge eases from one side to the other where the path turns over
  const avg = (src, dst) => {
    for (let i = 0; i < n; i++) {
      let sum = 0, c = 0;
      for (let j = Math.max(0, i - 16); j <= Math.min(n - 1, i + 16); j++) { sum += src[j]; c++; }
      dst[i] = sum / c;
    }
  };
  avg(raw, mid); avg(mid, side);
  for (let i = 0; i < n; i++) side[i] = Math.max(-1, Math.min(1, side[i] / 2.5));
  return side;
}

// ------------------------------------------------------------ the ten numerals

const eight = (u) => {
  // one stroke, crossing at the waist: a 1:2 Lissajous with a smaller top loop
  const t = 1 - u * 2;                                        // from the bottom, round the bottom loop leftward first
  const v = (1 - Math.cos(Math.PI * t)) / 2;                  // 0 top, 1 bottom, 0 top
  const yy = 39 * Math.pow(v, 1.12);
  const amp = 9.4 + 1.8 * v;
  return [11 + amp * Math.sin(2 * Math.PI * t), yy];
};

const SPEC = {
  0: { cmds: [['E', 11, 19.5, 11, 19.5, 90, 450]], closed: true, round: 2 },
  1: { cmds: [['M', 2.5, 11], ['L', 14, 0.5], ['L', 14, 39]] },
  2: { cmds: [['A', 11, 11, 10.5, 192, 378], ['L', 1, 38.5], ['L', 22, 38.5]], round: 4 },
  3: { cmds: [['A', 10.5, 9.5, 9.3, 198, 446], ['L', 6.5, 18.7], ['L', 11, 18.4], ['A', 11, 28.4, 10.5, 270, 520]], round: 3 },
  4: { cmds: [['M', 1, 0.5], ['L', 1.5, 25], ['L', 17, 25], ['L', 17, 0.5], ['L', 17, 39]], round: 3 },
  5: { cmds: [['M', 21.5, 0.5], ['L', 2.5, 0.5], ['L', 1.5, 17], ['A', 10.8, 27.6, 11, 236, 515]], round: 4, reverse: true },
  6: { cmds: [['A', 19.5, 21, 19.5, 268, 180], ['L', 0, 28.5], ['A', 11, 28.5, 11, 180, -168]], round: 3 },
  7: { cmds: [['M', 0, 0.5], ['L', 22, 0.5], ['L', 8, 39]], round: 4 },
  8: { cmds: [['F', eight, 800]], closed: true, round: 1 },
};

function build(d) {
  if (d === 9) {
    // the 9 is the 6 turned half round, so the pair is one design
    const six = PATHS[6], n = six.n;
    const x = new Float32Array(n), y = new Float32Array(n), a = new Float32Array(n);
    for (let i = 0; i < n; i++) { x[i] = BOX_W - six.x[i]; y[i] = BOX_H - six.y[i]; a[i] = six.a[i] + Math.PI; }
    return { n, L: six.L, x, y, a, closed: false, vx: six.vx.map((v) => -v), vy: six.vy.map((v) => -v) };
  }
  const sp = SPEC[d];
  const cmds = sp.cmds[0][0] === 'M' || sp.cmds[0][0] === 'F' ? sp.cmds : [['M', ...startOf(sp.cmds[0])], ...sp.cmds];
  const pts = trace(cmds);
  if (sp.reverse) pts.reverse();
  return finish(pts, { round: sp.round ?? 5, closed: !!sp.closed });
}

function startOf(c) {
  if (c[0] === 'A') { const a = (c[4] * Math.PI) / 180; return [c[1] + c[3] * Math.cos(a), c[2] + c[3] * Math.sin(a)]; }
  if (c[0] === 'E') { const a = (c[5] * Math.PI) / 180; return [c[1] + c[3] * Math.cos(a), c[2] + c[4] * Math.sin(a)]; }
  return [c[1], c[2]];
}

export const PATHS = [];
for (let d = 0; d <= 9; d++) PATHS[d] = build(d);

/**
 * The arch a spring stands up into at the minute turn, in screen
 * coordinates: an upturned U from (x0, base) to (x1, base) with its apex at
 * `top`, the legs near vertical like a Slinky stood on a step.
 */
export function archPath(x0, x1, base, top) {
  const cx = (x0 + x1) / 2, rx = (x1 - x0) / 2, ry = base - top;
  return finish(trace([['E', cx, base, rx, ry, 180, 360]]), { round: 0 });
}

/**
 * Sample a path at arc length s (clamped): writes [x, y, angle] into out.
 * Linear interpolation between 0.5 px samples.
 */
export function at(p, s, out) {
  let f = s / STEP;
  if (f < 0) f = 0; else if (f > p.n - 1) f = p.n - 1;
  const i = f | 0, j = i < p.n - 1 ? i + 1 : i, u = f - i;
  out[0] = p.x[i] + (p.x[j] - p.x[i]) * u;
  out[1] = p.y[i] + (p.y[j] - p.y[i]) * u;
  out[2] = p.a[i] + (p.a[j] - p.a[i]) * u;
  return out;
}

// ------------------------------------------------------------ coil stamps

export const STAMP_R = 5, STAMP_W = 11;        // stamps cover -5..+5 px round the coil centre
export const ANGLES = 32, SUB = 4;             // 32 tangent angles, quarter-pixel positions
// classes: 0 none, 1 body, 2 back rim (dark), 3 glint (light, on the side facing the lamp, up-left)
export const STAMPS = [];
{
  const LX = -0.6, LY = -0.8;                  // toward the lamp
  for (let ai = 0; ai < ANGLES; ai++) {
    const th = (ai / ANGLES) * Math.PI * 2;
    const tx = Math.cos(th), ty = Math.sin(th), nx = -ty, ny = tx;
    const ct = Math.cos(TILT), st = Math.sin(TILT);
    const mx = nx * ct + tx * st, my = ny * ct + ty * st;      // major axis (across, leaned)
    const kx = tx * ct - nx * st, ky = ty * ct - ny * st;      // minor axis (along)
    for (let sy = 0; sy < SUB; sy++)
      for (let sx = 0; sx < SUB; sx++) {
        const m = new Uint8Array(STAMP_W * STAMP_W);
        for (let j = 0; j < STAMP_W; j++)
          for (let i = 0; i < STAMP_W; i++) {
            const px = i - STAMP_R + 0.5 - (sx + 0.5) / SUB, py = j - STAMP_R + 0.5 - (sy + 0.5) / SUB;
            const inE = (qx, qy) => ((qx * mx + qy * my) / COIL_A) ** 2 + ((qx * kx + qy * ky) / COIL_B) ** 2 <= 1;
            if (!inE(px, py)) continue;
            let c = 1;
            // the back edge, RIM px deep measured along the path: one dark line per coil
            if (!inE(px - RIM * tx, py - RIM * ty)) c = 2;
            // the front edge on the side facing the lamp: a glint, seen where the spring is stretched
            else if (!inE(px + 1.0 * tx, py + 1.0 * ty) && px * LX + py * LY > 0.5) c = 3;
            m[j * STAMP_W + i] = c;
          }
        STAMPS[(ai * SUB + sy) * SUB + sx] = m;
      }
  }
}
