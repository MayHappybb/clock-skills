// Tattoo Flash glyphs: ten numerals, each a flash motif bent into the digit,
// built once at load into per-pixel material maps (flash tables).
//
// A glyph is a list of parts drawn in order onto a GW x GH box:
//   stroke: a centre line (polyline from lines and arcs) with a half width,
//           a material and end caps (round, cut, notch = swallowtail, open =
//           no outline across the end, for over-under crossings);
//   blob:   any small shape by its signed distance, with its own paint.
// Every part gets a 2 px black outline; a later part's outline cuts across an
// earlier part's fill, which is how flash draws one thing in front of another.
//
// Each pixel stores: material (MAT), the position along its stroke (U, px),
// across it (V, -8..8 of the half width), and the lining key (K, 0..255): when
// the needle reaches it during the minute turn. The needle's own path is
// sampled per glyph (NEEDLE) at K = 0..255 step 4.

export const GW = 34, GH = 54, GN = GW * GH;

// materials
export const M_OUT = 1, M_SNAKE = 2, M_ROPE = 3, M_RIBBON = 4, M_BLADE = 5, M_STEM = 6, M_ROSE = 7, M_GRIP = 8;
export const F_BLACK = 16, F_RED = 17, F_GREEN = 18, F_YELLOW = 19, F_SKIN = 20, F_WHITE = 21;

// ------------------------------------------------------------ path builder

function path() {
  const pts = [];
  const add = (x, y) => {
    const l = pts[pts.length - 1];
    if (!l || Math.hypot(l[0] - x, l[1] - y) > 0.01) pts.push([x, y]);
  };
  const api = {
    pts,
    M(x, y) { add(x, y); return api; },
    L(x, y) {
      const l = pts[pts.length - 1], n = Math.max(1, Math.ceil(Math.hypot(x - l[0], y - l[1]) / 2));
      for (let i = 1; i <= n; i++) add(l[0] + ((x - l[0]) * i) / n, l[1] + ((y - l[1]) * i) / n);
      return api;
    },
    // arc on an ellipse, degrees, y down (90 = down); a0 -> a1 in either direction
    A(cx, cy, rx, ry, a0, a1) {
      const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / 3));
      for (let i = 0; i <= n; i++) {
        const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
        add(cx + rx * Math.cos(a), cy + ry * Math.sin(a));
      }
      return api;
    },
  };
  return api;
}

const stroke = (p, mat, hw, cap0 = 'round', cap1 = 'round', o = {}) => ({ kind: 'stroke', pts: p.pts, mat, hw, cap0, cap1, ...o });
const blob = (sd, paint, box, o = {}) => ({ kind: 'blob', sd, paint, box, ...o });

// rotated ellipse SDF (approximate), centre, unit direction, half length a, half width b
function ellipseSD(cx, cy, dx, dy, a, b) {
  return (x, y) => {
    const px = x - cx, py = y - cy, al = px * dx + py * dy, ac = -px * dy + py * dx;
    return (Math.sqrt((al / a) ** 2 + (ac / b) ** 2) - 1) * Math.min(a, b);
  };
}
const rectSD = (x0, y0, x1, y1, r = 0) => (x, y) => {
  const qx = Math.abs(x - (x0 + x1) / 2) - ((x1 - x0) / 2 - r), qy = Math.abs(y - (y0 + y1) / 2) - ((y1 - y0) / 2 - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
};
// a bar along a direction: centre, unit dir, half length, half thickness
const barSD = (cx, cy, dx, dy, hl, ht) => (x, y) => {
  const px = x - cx, py = y - cy, al = Math.abs(px * dx + py * dy) - hl, ac = Math.abs(-px * dy + py * dx) - ht;
  return Math.hypot(Math.max(al, 0), Math.max(ac, 0)) + Math.min(Math.max(al, ac), 0);
};

/** A snake's head: green, a yellow jaw, an eye, the mouth line. dir points to the snout. */
function snakeHead(cx, cy, dx, dy, a = 6, b = 4.2, flip = 1) {
  const sd0 = ellipseSD(cx, cy, dx, dy, a, b);
  // a wedge: wider behind (the jaw hinge), pointed snout
  const sd = (x, y) => {
    const px = x - cx, py = y - cy, al = px * dx + py * dy;
    return sd0(x, y) + Math.max(0, al) * 0.12;
  };
  const paint = (x, y) => {
    const px = x - cx, py = y - cy, al = px * dx + py * dy, ac = (-px * dy + py * dx) * flip;
    const ex = al - a * 0.05, ey = ac + b * 0.42;            // the eye, on the upper side
    if (ex * ex + ey * ey < 1.0) return F_BLACK;
    if (ex * ex + ey * ey < 3.2) return F_YELLOW;
    if (al > -a * 0.15 && Math.abs(ac - b * 0.22) < 0.55) return F_BLACK;  // mouth
    return ac > b * 0.22 ? F_YELLOW : F_GREEN;
  };
  return blob(sd, paint, [cx - a - 3, cy - a - 3, cx + a + 3, cy + a + 3], { snout: [cx + dx * a, cy + dy * a], dir: [dx, dy], head: true });
}

// ------------------------------------------------------------ the ten motifs

const DEF = [];

// 0: the ouroboros, a snake eating its tail
DEF[0] = () => {
  const cx = 17, cy = 28, rx = 11.5, ry = 21;
  const body = stroke(path().A(cx, cy, rx, ry, -58, 262), M_SNAKE, (f) => 1.4 + 1.9 * Math.min(1, f / 0.28), 'round', 'round');
  return [body, snakeHead(19.5, 7.6, 1, 0.08, 6.4, 4.4)];
};

// 1: a dagger, point down, a ribbon flag tied round the grip
DEF[1] = () => {
  const x = 18;
  return [
    stroke(path().M(x - 1, 9).L(4.5, 16), M_RIBBON, 3.2, 'cut', 'notch'),
    stroke(path().M(x, 20).L(x, 51), M_BLADE, (f) => 3.6 - 3.2 * f, 'cut', 'round'),
    blob(rectSD(x - 2.6, 7, x + 2.6, 17), (px, py) => (Math.floor(py) % 3 === 0 ? F_BLACK : F_GREEN), [x - 6, 4, x + 6, 20], { grip: true }),
    blob(rectSD(x - 5, 16.5, x + 5, 20.5, 1), () => F_YELLOW, [x - 9, 13, x + 9, 24]),
    blob((px, py) => Math.hypot(px - x, py - 5.2) - 2.8, () => F_YELLOW, [x - 6, 0, x + 6, 10]),
  ];
};

// 2: a banner ribbon
DEF[2] = () => [
  stroke(path().A(17, 16, 11, 10.5, 200, 382).L(7.5, 45), M_RIBBON, 3.5, 'notch', 'cut'),
  stroke(path().M(5.5, 46).L(29.5, 46), M_RIBBON, 3.5, 'cut', 'notch'),
];

// 3: a rope, whipped at its ends with red thread
DEF[3] = () => [
  stroke(path().A(16, 15.5, 11, 10.5, 196, 470), M_ROPE, 3.1, 'round', 'round', { whip0: true }),
  stroke(path().A(16, 37, 12.5, 11.2, 252, 522), M_ROPE, 3.1, 'round', 'round', { whip1: true }),
];

// 4: a dagger through a banner
DEF[4] = () => {
  const x = 26;
  return [
    stroke(path().M(x, 20).L(x, 51), M_BLADE, (f) => 3.2 - 2.8 * f, 'cut', 'round'),
    blob(rectSD(x - 2.4, 7, x + 2.4, 16), (px, py) => (Math.floor(py) % 3 === 0 ? F_BLACK : F_GREEN), [x - 6, 4, x + 6, 19], { grip: true }),
    blob(rectSD(x - 5, 15.5, x + 5, 19.5, 1), () => F_YELLOW, [x - 8, 12, x + 8, 23]),
    blob((px, py) => Math.hypot(px - x, py - 5.2) - 2.6, () => F_YELLOW, [x - 6, 0, x + 6, 10]),
    stroke(path().M(17, 4.5).L(4.6, 35.6), M_RIBBON, 3.3, 'notch', 'cut'),
    stroke(path().M(4.5, 37).L(30.5, 37), M_RIBBON, 3.3, 'cut', 'notch'),
  ];
};

// 5: a banner ribbon folded into a 5
DEF[5] = () => [
  stroke(path().M(8.5, 5.5).L(8.5, 23).A(16.5, 34.5, 12, 12.5, 233, 510), M_RIBBON, 3.4, 'cut', 'notch'),
  stroke(path().M(29.5, 7).L(7, 7), M_RIBBON, 3.4, 'notch', 'cut'),
];

// 6: a rose on its stem; the stem curls into the bowl
DEF[6] = () => {
  const bx = 23.8, by = 8.6, br = 6.6;
  return [
    stroke(path().A(18, 32.5, 12.5, 25, -70, -180).L(5.5, 37.5).A(17, 37.5, 11.5, 11, 180, -158), M_STEM, 3, 'round', 'round'),
    // thorns, outside the stem
    blob((px, py) => Math.max(Math.hypot(px - 3, py - 26) - 2.4, (px - 3) * 0.8 + (py - 26) * 0.6), () => F_BLACK, [0, 22, 7, 30], { thorn: true }),
    blob((px, py) => Math.hypot(px - bx, py - by) - br, (px, py) => M_ROSE, [bx - br - 3, by - br - 3, bx + br + 3, by + br + 3], { rose: [bx, by, br] }),
  ];
};

// 7: a banner bar, a dagger for the stem
DEF[7] = () => {
  const d = [-0.36, 0.933];                    // blade direction, down-left
  const hx = 25.6, hy = 12.6;                 // guard centre
  return [
    stroke(path().M(4.5, 8.5).L(30.5, 8.5), M_RIBBON, 3.4, 'notch', 'notch'),
    stroke(path().M(hx + d[0] * 2, hy + d[1] * 2).L(13.5, 51), M_BLADE, (f) => 3.6 - 3.2 * f, 'cut', 'round'),
    blob(barSD(hx, hy, -d[1], d[0], 5.6, 1.9), () => F_YELLOW, [hx - 9, hy - 9, hx + 9, hy + 9]),
    blob(barSD(hx - d[0] * 4.6, hy - d[1] * 4.6, d[0], d[1], 3.6, 2.3), (px, py) => (Math.floor(py) % 3 === 0 ? F_BLACK : F_GREEN), [hx - 6, hy - 12, hx + 9, hy + 2], { grip: true }),
    blob((px, py) => Math.hypot(px - (hx - d[0] * 9.6), py - (hy - d[1] * 9.6)) - 2.5, () => F_YELLOW, [hx - 4, -2, hx + 10, hy]),
  ];
};

// 8: a rope tied in a figure-eight
DEF[8] = () => {
  const ux = 17, uy = 15.6, urx = 9.6, ury = 10.2, lx = 17, ly = 38, lrx = 12, lry = 11.2;
  const P = path().A(ux, uy, urx, ury, 62, -242).L(lx + lrx * Math.cos(-58 * Math.PI / 180), ly + lry * Math.sin(-58 * Math.PI / 180))
    .A(lx, ly, lrx, lry, -58, 238);
  const back = [ux + urx * Math.cos(62 * Math.PI / 180), uy + ury * Math.sin(62 * Math.PI / 180)];
  P.L(back[0], back[1]);
  const main = stroke(P, M_ROPE, 3, 'round', 'round');
  // the second pass through the waist goes over the first
  const a0 = [lx + lrx * Math.cos(238 * Math.PI / 180), ly + lry * Math.sin(238 * Math.PI / 180)];
  const over = stroke(path().M(a0[0], a0[1]).L(back[0], back[1]), M_ROPE, 3, 'open', 'open', { uFrom: main, uAt: a0 });
  return [main, over];
};

// 9: a snake, tail tucked in the bowl, head at the foot
DEF[9] = () => {
  const cx = 16.5, cy = 16.8, r = 11;
  const tail = stroke(path().A(cx, cy, r, r, 18, -60), M_SNAKE, (f) => 1.4 + 1.8 * f, 'round', 'open');
  const body = stroke(path().A(cx, cy, r, r, -60, -342).L(27.4, 35).A(17, 37, 10.4, 10, -10, 100), M_SNAKE, 3.2, 'open', 'round', { u0: 'tail' });
  const hd = [-0.98, 0.2];
  return [tail, body, snakeHead(10.4, 46.6, hd[0], hd[1], 6.2, 4.3, -1)];
};

// ------------------------------------------------------------ the rasteriser

function prep(part) {
  const p = part.pts, cum = [0];
  for (let i = 1; i < p.length; i++) cum.push(cum[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
  part.cum = cum; part.L = cum[cum.length - 1];
  const hw = part.hw;
  part.hwAt = typeof hw === 'function' ? (a) => hw(Math.min(1, Math.max(0, a / part.L))) : () => hw;
}

/** Nearest point on a polyline: { a (arc position, extrapolated beyond the ends), v (signed offset) }. */
function nearest(part, x, y) {
  const p = part.pts, n = p.length;
  let best = Infinity, ba = 0, bv = 0;
  for (let i = 1; i < n; i++) {
    const ax = p[i - 1][0], ay = p[i - 1][1], dx = p[i][0] - ax, dy = p[i][1] - ay;
    const len = Math.hypot(dx, dy) || 1e-6;
    const t = ((x - ax) * dx + (y - ay) * dy) / (len * len);
    const tc = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = x - ax - tc * dx, ey = y - ay - tc * dy, d = Math.hypot(ex, ey);
    if (d < best - 1e-9) {
      best = d;
      const cr = (dx * (y - ay) - dy * (x - ax)) / len;
      if (i === 1 && t < 0) { ba = t * len; bv = cr; }
      else if (i === n - 1 && t > 1) { ba = part.L + (t - 1) * len; bv = cr; }
      else { ba = part.cum[i - 1] + tc * len; bv = Math.sign(cr || 1) * d; }
    }
  }
  return { a: ba, v: bv };
}

function capSD(cap, s, vv, hw) {
  // s: distance beyond the end along the path (> 0 outside), vv = |v|
  if (cap === 'round') return s > 0 ? Math.hypot(s, vv) - hw : vv - hw;
  if (cap === 'notch') {
    const N = Math.min(4.6, hw * 1.35);
    return Math.max(vv - hw, (s + N * (1 - vv / hw)) / Math.hypot(1, N / hw), s);
  }
  return Math.max(vv - hw, s);                    // cut, open
}

const OL = 2;

function rasterise(d) {
  const parts = DEF[d]();
  const MAT = new Uint8Array(GN), U = new Uint8Array(GN), V = new Int8Array(GN), K = new Uint8Array(GN);
  const KF = new Float32Array(GN);
  // the lining order: parts in order; the needle travels between them
  let tot = 0, prev = null;
  const needle = [];
  for (const pt of parts) {
    if (pt.kind === 'stroke') {
      prep(pt);
      if (pt.u0 === 'tail') pt.u0v = parts[0].L; else pt.u0v = 0;
      if (pt.uFrom) {
        // u continuous with the part it overlays
        const nn = nearest(pt.uFrom, pt.uAt[0], pt.uAt[1]);
        pt.u0v = nn.a;
      }
    }
  }
  for (const pt of parts) {
    const start = pt.kind === 'stroke' ? pt.pts[0] : [(pt.box[0] + pt.box[2]) / 2, (pt.box[1] + pt.box[3]) / 2];
    if (prev) tot += Math.hypot(start[0] - prev[0], start[1] - prev[1]) * 0.6;
    pt.k0 = tot;
    if (pt.kind === 'stroke') {
      for (let i = 0; i < pt.pts.length; i++) needle.push([tot + pt.cum[i], pt.pts[i][0], pt.pts[i][1]]);
      tot += pt.L; prev = pt.pts[pt.pts.length - 1];
    } else {
      const c = start, r = Math.max(1.5, (pt.box[2] - pt.box[0]) / 2 - 3), len = Math.max(4, r * 4);
      for (let i = 0; i <= 12; i++) needle.push([tot + (len * i) / 12, c[0] + r * Math.cos((i / 12) * Math.PI * 2), c[1] + r * Math.sin((i / 12) * Math.PI * 2)]);
      pt.len = len; pt.c = c;
      tot += len; prev = c;
    }
  }
  const info = { heads: [], rose: null, grips: [], blade: null, ribbons: [] };
  for (const pt of parts) {
    for (let y = 0; y < GH; y++)
      for (let x = 0; x < GW; x++) {
        const px = x + 0.5, py = y + 0.5, k = y * GW + x;
        let sd, mat, u = 0, v = 0, kf, outlineOk = true;
        if (pt.kind === 'stroke') {
          const { a, v: vs } = nearest(pt, px, py);
          const vv = Math.abs(vs), hw = pt.hwAt(a);
          if (a < 0) { sd = capSD(pt.cap0, -a, vv, pt.hwAt(0)); if (pt.cap0 === 'open') outlineOk = false; }
          else if (a > pt.L) { sd = capSD(pt.cap1, a - pt.L, vv, pt.hwAt(pt.L)); if (pt.cap1 === 'open') outlineOk = false; }
          else {
            sd = vv - hw;
            if (pt.cap1 === 'notch') sd = Math.max(sd, capSD('notch', a - pt.L, vv, hw));
            if (pt.cap0 === 'notch') sd = Math.max(sd, capSD('notch', -a, vv, hw));
          }
          mat = pt.mat; u = a + (pt.u0v || 0); v = vs / Math.max(0.8, hw);
          if (pt.whip0 && a < 5) mat = a > 1.5 && a < 3.5 ? F_RED : mat;
          if (pt.whip1 && a > pt.L - 5) mat = a < pt.L - 1.5 && a > pt.L - 3.5 ? F_RED : mat;
          kf = pt.k0 + Math.min(pt.L, Math.max(0, a));
        } else {
          sd = pt.sd(px, py);
          if (sd > OL + 0.5) continue;
          mat = sd < 0 ? pt.paint(px, py) : 0;
          if (pt.rose) {
            const [bx, by, br] = pt.rose, dx = px - bx, dy = py - by;
            u = ((Math.atan2(dy, dx) / (2 * Math.PI) + 1) % 1) * 64; v = (Math.hypot(dx, dy) / br) * 8;
          }
          const an = Math.atan2(py - pt.c[1], px - pt.c[0]);
          kf = pt.k0 + (((an / (2 * Math.PI)) + 1) % 1) * pt.len;
        }
        if (sd < 0) {
          MAT[k] = mat; U[k] = ((u % 256) + 256) % 256 | 0; V[k] = Math.max(-8, Math.min(8, Math.round(v * 8)));
          KF[k] = kf;
        } else if (sd < OL && outlineOk) {
          MAT[k] = M_OUT; V[k] = 0; KF[k] = kf;
        }
      }
    if (pt.head) info.heads.push({ snout: pt.snout, dir: pt.dir });
    if (pt.rose) info.rose = pt.rose;
  }
  for (let i = 0; i < GN; i++) K[i] = Math.min(255, Math.round((KF[i] / tot) * 255));
  // the needle, sampled at K = 0, 4, ..., 252 (+ the end)
  const NP = new Float32Array(66 * 2);
  for (let j = 0; j <= 64; j++) {
    const kt = Math.min(tot, (j / 64) * tot);
    let i = 1;
    while (i < needle.length - 1 && needle[i][0] < kt) i++;
    const A = needle[i - 1], B = needle[i], f = B[0] > A[0] ? Math.max(0, Math.min(1, (kt - A[0]) / (B[0] - A[0]))) : 1;
    NP[j * 2] = A[1] + (B[1] - A[1]) * f; NP[j * 2 + 1] = A[2] + (B[2] - A[2]) * f;
  }
  return { MAT, U, V, K, NP, info };
}

export const GLYPHS = [];
for (let d = 0; d < 10; d++) GLYPHS.push(rasterise(d));
