// Origami: the folding engine and the font (see origami.js).
//
// A numeral is one rectangular sheet of two-sided paper. The STROKES are the
// part of the sheet that lies flat, face up. Everything else of the sheet
// (the counters, the notches, the cut-off corners) is still there as FLAPS:
// bands of paper hinged on a stroke edge and folded flat, either behind the
// stroke (mountain: hidden) or over it (valley: the paper's coloured reverse
// shows as a band or a corner triangle). A flap region wider than a stroke is
// pleated: an accordion (mountain) or a roll (valley) of strips, each no
// wider than the paper it hides under, so unfolding it really does fill the
// sheet back to a rectangle, strip after strip.
//
// Each band is a rigid strip rotating about a straight hinge, so its motion
// is a cross-section problem: the chain of strips is a polyline in (S, Z),
// S across the hinge and Z up off the paper; the screen sees S (orthographic,
// from above). A point of the sheet maps by an affine map per strip, so a
// polygon stays a polygon: every frame is a few dozen hard polygon fills.

import { sin, cos } from '../js/kit.js';

const PI = Math.PI;

// ------------------------------------------------------------ polygons

const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

/** Keep the part of a convex polygon where nx*x + ny*y >= c. */
export function clipHalf(poly, nx, ny, c) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const dp = p[0] * nx + p[1] * ny - c, dq = q[0] * nx + q[1] * ny - c;
    if (dp >= 0) out.push(p);
    if ((dp >= 0) !== (dq >= 0)) {
      const u = dp / (dp - dq);
      out.push([p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u]);
    }
  }
  return out;
}

const area = (poly) => {
  let a = 0;
  for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; a += p[0] * q[1] - q[0] * p[1]; }
  return Math.abs(a) / 2;
};

// ------------------------------------------------------------ the font

/**
 * A flap: the region `poly` of the sheet, hinged on the line P->Q (a stroke
 * edge), folded 'M' (behind) or 'V' (over, reverse up). `group` orders the
 * turn: 0 counters, 1 notches, 2 corners. Strips are equal, at most `wmax`.
 */
function flap(poly, P, Q, kind, group, wmax) {
  let dx = Q[0] - P[0], dy = Q[1] - P[1];
  const L = Math.hypot(dx, dy);
  dx /= L; dy /= L;
  let nx = -dy, ny = dx;
  const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length, cy = poly.reduce((s, p) => s + p[1], 0) / poly.length;
  if ((cx - P[0]) * nx + (cy - P[1]) * ny < 0) { nx = -nx; ny = -ny; }
  const pn = P[0] * nx + P[1] * ny, pd = P[0] * dx + P[1] * dy;
  let depth = 0;
  for (const p of poly) depth = Math.max(depth, p[0] * nx + p[1] * ny - pn);
  const k = Math.max(1, Math.ceil(depth / wmax - 1e-6)), sw = depth / k;
  const strips = [];
  for (let j = 0; j < k; j++) {
    const s0 = j * sw, s1 = (j + 1) * sw;
    const pg = clipHalf(clipHalf(poly, nx, ny, pn + s0), -nx, -ny, -(pn + s1));
    if (pg.length < 3 || area(pg) < 0.05) continue;
    // each vertex as (along the hinge, across it)
    const a = Float32Array.from(pg, (p) => p[0] * dx + p[1] * dy - pd);
    const s = Float32Array.from(pg, (p) => p[0] * nx + p[1] * ny - pn);
    strips.push({ j, s0, s1, a, s, n: pg.length, flat: pg });
  }
  // folded relative angles: an accordion behind, a roll in front
  const fold = strips.map((_, i) => (kind === 'V' ? PI : i % 2 === 0 ? -PI : PI));
  return { P, d: [dx, dy], n: [nx, ny], kind, group, strips, fold, sw, hinge: [P, Q] };
}

const lineX = (a0, a1, b0, b1) => {
  // intersection of line a0 + t*a1 with b0 + u*b1 (points and directions)
  const den = a1[0] * b1[1] - a1[1] * b1[0];
  if (Math.abs(den) < 1e-9) return null;
  const t = ((b0[0] - a0[0]) * b1[1] - (b0[1] - a0[1]) * b1[0]) / den;
  return [a0[0] + a1[0] * t, a0[1] + a1[1] * t];
};

/**
 * A ribbon of width w along a centreline, cut square at open ends, mitred at
 * every turn, and creased along its spine: each run is two long facets, one
 * either side of the spine. Returns the facets with their outward normals.
 */
function ribbon(pts, w, closed) {
  const n = pts.length, h = w / 2, segs = [];
  const m = closed ? n : n - 1;
  for (let k = 0; k < m; k++) {
    const a = pts[k], b = pts[(k + 1) % n];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
    segs.push({ a, b, u, v: [-u[1], u[0]] });
  }
  // the offset corner on side sg (+1 left, -1 right) at the start/end of segment k
  const corner = (k, sg, end) => {
    const s = segs[k], p = end ? s.b : s.a;
    const off = [p[0] + s.v[0] * h * sg, p[1] + s.v[1] * h * sg];
    const k2 = end ? k + 1 : k - 1;
    if (!closed && (k2 < 0 || k2 >= m)) return off;
    const t = segs[(k2 + m) % m];
    const off2 = [p[0] + t.v[0] * h * sg, p[1] + t.v[1] * h * sg];
    return lineX(off, s.u, off2, t.u) ?? off;
  };
  const out = [];
  for (let k = 0; k < m; k++) {
    const s = segs[k];
    for (const sg of [1, -1]) {
      const pts2 = sg > 0 ? [s.a, s.b, corner(k, 1, true), corner(k, 1, false)] : [s.a, corner(k, -1, false), corner(k, -1, true), s.b];
      out.push({ pts: pts2, o: [s.v[0] * sg, s.v[1] * sg] });
    }
  }
  return out;
}

/**
 * The ten numerals for a sheet W x H with strokes w wide. Every numeral is
 * the same sheet: strokes + flaps tile the rectangle exactly (checked by
 * out/origami-test.mjs), and folded, every flap lies inside the strokes.
 */
export function buildFont(W, H, w) {
  const xR = W - w, yT = w, yM0 = Math.round((H - w) / 2), yM1 = yM0 + w, yB = H - w;
  const c = w - 1, bV = w <= 6 ? 3.5 : 4;          // corner cut; widest band of reverse that shows
  const h = w / 2, l = h, r = W - h, t = h, b = H - h, mY = yM0 + h;
  const font = [];
  for (let d = 0; d < 10; d++) {
    let strokes = [];
    const flaps = [], cuts = [];
    const P = (pts, closed = false) => strokes.push(...ribbon(pts, w, closed));
    // a cut corner: the triangle of sheet beyond it is folded over, reverse up
    const C = (x, y, sx, sy) => {
      cuts.push([x, y, sx, sy]);
      const A = [x + sx * c, y], B = [x, y + sy * c];
      flaps.push(flap([[x, y], A, B], A, B, 'V', 2, 99));
    };
    const F = (poly, P0, Q0, kind, group) => flaps.push(flap(poly, P0, Q0, kind, group, kind === 'V' ? bV : w));
    // a hand-made stroke: a quad creased along its spine from (p, q) to (r2, s2)
    const Q = (quad, o1, o2) => {
      const [p0, p1, p2, p3] = quad, m0 = [(p0[0] + p3[0]) / 2, (p0[1] + p3[1]) / 2], m1 = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
      strokes.push({ pts: [p0, p1, m1, m0], o: o1 }, { pts: [m0, m1, p2, p3], o: o2 });
    };
    const xm = (w + xR) / 2;
    switch (d) {
      case 0:
        P([[l, t], [r, t], [r, b], [l, b]], true);
        C(0, 0, 1, 1); C(W, 0, -1, 1); C(W, H, -1, -1); C(0, H, 1, -1);
        F(rect(w, yT, xm, yB), [w, yT], [w, yB], 'V', 0);
        F(rect(xm, yT, xR, yB), [xR, yT], [xR, yB], 'M', 0);
        break;
      case 1: {
        const sx = Math.round(W * 0.47), ex = sx + w, fh = Math.round(w * 1.41);
        P([[sx + h, 0], [sx + h, H]]);
        Q([[0, sx], [sx, 0], [sx, fh], [0, sx + fh]], [-0.7, -0.7], [0.7, 0.7]);
        F([[0, sx + fh], [sx, fh], [sx, H], [0, H]], [sx, fh], [sx, H], 'M', 1);
        F([[0, 0], [sx, 0], [0, sx]], [sx, 0], [0, sx], 'V', 1);
        F(rect(ex, 0, W, H), [ex, 0], [ex, H], 'V', 1);
        break;
      }
      case 2:
        P([[0, t], [r, t], [r, mY], [l, mY], [l, b], [W, b]]);
        C(0, 0, 1, 1); C(W, 0, -1, 1); C(0, yM0, 1, 1); C(W, yM1, -1, -1); C(0, H, 1, -1); C(W, H, -1, -1);
        F(rect(0, yT, xR, yM0), [xR, yT], [xR, yM0], 'M', 1);
        F(rect(w, yM1, W, yB), [w, yM1], [w, yB], 'M', 1);
        break;
      case 3: {
        const mx = Math.round(W * 0.3);
        P([[0, t], [r, t], [r, b], [0, b]]);
        P([[mx, mY], [xR, mY]]);
        C(0, 0, 1, 1); C(W, 0, -1, 1); C(W, H, -1, -1); C(0, H, 1, -1);
        F(rect(0, yT, xR, yM0), [xR, yT], [xR, yM0], 'M', 1);
        F(rect(0, yM1, xR, yB), [xR, yM1], [xR, yB], 'M', 1);
        F(rect(0, yM0, mx, yM1), [mx, yM0], [mx, yM1], 'V', 1);
        break;
      }
      case 4: {
        const st = W - w - Math.round(W * 0.17), yX = Math.round(H * 0.58), gm = (w + st) / 2;
        P([[l, 0], [l, yX + h], [W, yX + h]]);
        P([[st + h, 0], [st + h, H]]);
        C(0, 0, 1, 1); C(0, yX + w, 1, -1);
        F(rect(w, 0, gm, yX), [w, 0], [w, yX], 'V', 1);
        F(rect(gm, 0, st, yX), [st, 0], [st, yX], 'M', 1);
        F(rect(st + w, 0, W, yX), [st + w, 0], [st + w, yX], 'M', 1);
        F(rect(0, yX + w, st, H), [st, yX + w], [st, H], 'M', 1);
        F(rect(st + w, yX + w, W, H), [st + w, yX + w], [st + w, H], 'V', 1);
        break;
      }
      case 5:
        P([[W, t], [l, t], [l, mY], [r, mY], [r, b], [0, b]]);
        C(0, 0, 1, 1); C(W, 0, -1, 1); C(W, yM0, -1, 1); C(W, H, -1, -1); C(0, H, 1, -1);
        F(rect(w, yT, W, yM0), [w, yT], [w, yM0], 'M', 1);
        F(rect(0, yM1, xR, yB), [xR, yM1], [xR, yB], 'M', 1);
        break;
      case 6:
        P([[W, t], [l, t], [l, b], [r, b], [r, mY], [w, mY]]);
        C(0, 0, 1, 1); C(W, 0, -1, 1); C(W, yM0, -1, 1); C(W, H, -1, -1); C(0, H, 1, -1);
        F(rect(w, yT, W, yM0), [w, yT], [w, yM0], 'M', 1);
        F(rect(w, yM1, xm, yB), [w, yM1], [w, yB], 'V', 0);
        F(rect(xm, yM1, xR, yB), [xR, yM1], [xR, yB], 'M', 0);
        break;
      case 7: {
        const x7 = Math.round(W * 0.33);
        P([[0, t], [W, t]]);
        const dl = Math.hypot(xR - x7, H - yT), ux = -(H - yT) / dl, uy = -(xR - x7) / dl;
        Q([[xR, yT], [x7, H], [x7 + w, H], [W, yT]], [ux, uy], [-ux, -uy]);
        C(0, 0, 1, 1); C(W, 0, -1, 1);
        F([[0, yT], [xR, yT], [x7, H], [0, H]], [xR, yT], [x7, H], 'M', 1);
        F([[W, yT], [W, H], [x7 + w, H]], [W, yT], [x7 + w, H], 'V', 1);
        break;
      }
      case 8:
        P([[l, t], [r, t], [r, b], [l, b]], true);
        P([[w, mY], [xR, mY]]);
        C(0, 0, 1, 1); C(W, 0, -1, 1); C(W, H, -1, -1); C(0, H, 1, -1);
        F(rect(w, yT, xm, yM0), [w, yT], [w, yM0], 'V', 0);
        F(rect(xm, yT, xR, yM0), [xR, yT], [xR, yM0], 'M', 0);
        F(rect(w, yM1, xm, yB), [w, yM1], [w, yB], 'V', 0);
        F(rect(xm, yM1, xR, yB), [xR, yM1], [xR, yB], 'M', 0);
        break;
      case 9:
        P([[xR, mY], [l, mY], [l, t], [r, t], [r, b], [0, b]]);
        C(0, 0, 1, 1); C(W, 0, -1, 1); C(0, yM1, 1, -1); C(W, H, -1, -1); C(0, H, 1, -1);
        F(rect(w, yT, xm, yM0), [w, yT], [w, yM0], 'V', 0);
        F(rect(xm, yT, xR, yM0), [xR, yT], [xR, yM0], 'M', 0);
        F(rect(0, yM1, xR, yB), [xR, yM1], [xR, yB], 'M', 1);
        break;
    }
    // the cut corners come off the strokes
    for (const [x, y, sx, sy] of cuts) {
      const k0 = c + x * sx + y * sy, next = [];
      for (const s of strokes) {
        // a facet minus the corner triangle: beyond the cut, or beside the corner either way
        const inner = clipHalf(s.pts, -sx, -sy, -k0);
        const parts = [clipHalf(s.pts, sx, sy, k0), clipHalf(inner, -sx, 0, -x * sx), clipHalf(clipHalf(inner, sx, 0, x * sx), 0, -sy, -y * sy)];
        for (const p of parts) if (p.length >= 3 && area(p) > 0.01) next.push({ ...s, pts: p });
      }
      strokes = next;
    }
    font.push({ d, strokes, flaps });
  }
  return { W, H, w, digits: font };
}

// ------------------------------------------------------------ kinematics

/**
 * Pose one flap: `f(i)` is how folded strip i is (1 folded flat, 0 lying
 * open in the sheet). Returns per strip: its projected polygon (screen, from
 * origin ox, oy), which face is up, its tilt (for the light), and a depth key.
 */
export function poseFlap(fl, fs, ox, oy, out) {
  let th = 0, S = 0, Z = 0, thz = 0, Zz = 0;
  const [px, py] = fl.P, [dx, dy] = fl.d, [nx, ny] = fl.n, K = fl.strips.length;
  for (let i = 0; i < K; i++) {
    const st = fl.strips[i], fi = fs[i], al = fl.fold[i];
    th += al * fi;
    // the depth key uses a fold just short of flat, so stacked layers keep their order
    thz += al * Math.min(fi, 0.97);
    const ct = cos(th), stt = sin(th), wdt = st.s1 - st.s0;
    const pts = new Array(st.n);
    for (let k = 0; k < st.n; k++) {
      const Sp = S + (st.s[k] - st.s0) * ct, a = st.a[k];
      pts[k] = [ox + px + a * dx + Sp * nx, oy + py + a * dy + Sp * ny];
    }
    const key = Zz + 0.5 * wdt * sin(thz) + 1e-3 * (fl.kind === 'V' ? K - i : -i);
    out.push({ pts, back: ct < 0, th, n: fl.n, z: Z + 0.5 * wdt * stt, key, fl, i, ct });
    S += wdt * ct; Z += wdt * stt; Zz += wdt * sin(thz);
  }
  return out;
}
