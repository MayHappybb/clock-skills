// The cast of "flamingos": ten numerals, each one flamingo whose long neck
// writes the digit and whose plump body is the digit's foot. The path of
// each numeral runs from the head (the numeral's first terminal) down the
// neck and into the body, which swells along the digit's bottom stroke and
// tapers to the tail, where the black flight feathers are. Legs (drawn per
// frame, flamingos.js) hang from the body's underside into the lagoon.
//
// At load each digit becomes, on a 36 x 54 grid (glyph box 28 x 46 plus a
// 4 px margin), in glyph pixels (scale 1 = the hours; the minutes are
// sampled at 0.8):
//   SDF   Int8, distance to the wash's edge in 1/8 px (negative inside)
//   PART  Uint8: low 2 bits the plumage (0 neck, 1 body, 3 flight
//         feathers), bits 2-3 a wet bloom fixed in the wash (1 the lighter
//         heart of a backrun, 2 its darker crinkled rim), bits 4-7 how high
//         up the body the pixel is (0 where the folded wing never reaches):
//         the coral wing coverts are drawn above a line set per frame
// 1.9 KB + 1.9 KB a digit: 39 KB of flash for the set. Heads are separate
// small fields (HEADS below), one per head angle, so a head can turn on the
// beat without redrawing the neck.

export const GW = 28, GH = 46, M = 4, SW = GW + 2 * M, SH = GH + 2 * M;
export const NECK = 0, BODY = 1, COVERT = 2, PRIMARY = 3;

// Centre lines, head first: [x, y, width?, 'c' for a corner]. Widths are
// interpolated by arc length between the points that give one; the neck is
// WN up to the breast (index `b`), where the body swells; the last point is
// the tail tip. `yaw`: the range the head may turn through on the beat
// (0 faces right, PI left) without its bill entering a counter. `legs`:
// where they hang from the body, in glyph x.
const WN = 4.4, BODY_K = 0.92;
const DIGITS = {
  0: { b: 6, pts: [[7, 9.8], [10.5, 5.2], [15, 3.6], [20.2, 6.6], [23, 14], [23.2, 24], [21.6, 33, WN], [18.6, 38.8, 7.4], [13.6, 41.2, 8.4], [7.6, 38.6, 6.8], [4.6, 31, 4.8], [4.4, 22, 3.6], [5.4, 15.2, 2.8], [6.4, 12.2, 2.4]],
    yaw: [Math.PI, Math.PI * 0.62], legs: [11, 17] },
  1: { b: 5, pts: [[8.2, 10.2], [11.6, 6.6], [15.8, 3.8, null, 'c'], [16, 14], [16, 26], [15.4, 33.5, WN], [12.2, 39, 7.2], [15.6, 41.2, 8.6], [21, 41, 8], [26.4, 38.2, 2.6]],
    yaw: [Math.PI, Math.PI * 0.55], legs: [13, 19] },
  2: { b: 8, pts: [[5.8, 11.2], [8.4, 6.2], [14, 3.6], [19.8, 5.6], [22.6, 11.2], [20.6, 18.4], [14.2, 25.6], [7.6, 32.6], [5.4, 38.6, 5.4, 'c'], [11, 41.2, 8.2], [18, 41.4, 8.4], [23.4, 40.4, 7], [27, 37.6, 2.6]],
    yaw: [Math.PI, Math.PI * 0.5], legs: [12, 18] },
  3: { b: 9, pts: [[5.6, 9.4], [9.4, 5], [15, 3.6], [20.6, 6.6], [21.6, 12.6], [17.6, 18.2], [12, 20.6, null, 'c'], [18.4, 22.6], [22.6, 28.4], [22, 35, 5.4], [17.4, 40.2, 8], [10.4, 41.4, 8], [3.6, 38, 2.6]],
    yaw: [Math.PI, Math.PI * 0.6], legs: [11, 17] },
  4: { b: 7, pts: [[25.8, 28.6], [16, 28.6], [2.8, 28.6, null, 'c'], [8, 19.6], [15.2, 3.4, null, 'c'], [19.2, 14], [19.4, 26], [19, 34, WN], [14.4, 39.4, 7.2], [18, 41.4, 8.4], [23, 41, 7.8], [27.4, 38.4, 2.6]],
    yaw: [0, Math.PI * 0.85], legs: [16, 22] },
  5: { b: 8, pts: [[23.4, 4.8], [15, 4.6], [6.8, 4.6, null, 'c'], [6.2, 12], [5.6, 19.2, null, 'c'], [11.4, 16.6], [18, 17.8], [22.6, 23.6], [22.8, 31.6, 5.2], [18.6, 38.6, 7.8], [11.4, 41.4, 8], [3.6, 38, 2.6]],
    yaw: [0, Math.PI * 0.45], legs: [11, 17] },
  6: { b: 5, pts: [[21.4, 6.4], [16, 3.6], [10, 6], [5.6, 13], [4.2, 22.6], [5, 31, 5], [9.6, 39, 7.8], [16.4, 41.2, 8.2], [21.6, 37.4, 6], [22.6, 31, 4], [19.6, 25.6, 3.2], [12.6, 24.4, 3], [7.4, 27.4, 2.6]],
    yaw: [0, Math.PI * 0.45], legs: [11, 17] },
  7: { b: 4, pts: [[4.6, 6.6], [10, 4.6], [24, 4.4, null, 'c'], [19.6, 14.6], [15.4, 24, WN], [12.4, 32, 7], [10.4, 38, 7.6], [9.2, 42.6, 2.6]],
    yaw: [Math.PI, Math.PI * 0.2], legs: [10, 15] },
  8: { b: 7, pts: [[7.2, 8.6], [11, 4.4], [16.6, 4], [21, 8.2], [20, 14.6], [14, 20.4], [7.2, 25.6], [4.6, 32.6, 5], [8.6, 39.6, 7.6], [15.4, 41.4, 8], [21.6, 37.6, 6], [22.2, 30, 4], [17.6, 23.8, 3.2], [11, 18.4, 3], [7.2, 14.6, 2.6]],
    yaw: [Math.PI, Math.PI * 0.62], legs: [11, 17] },
  9: { b: 9, pts: [[20.4, 20.6], [14.2, 22.4], [7.6, 19.6], [4.8, 12.6], [8, 5.6], [14, 3.6], [20, 6], [22.2, 12.4], [22.4, 22], [21.4, 30, 5], [17.6, 37.6, 7.8], [10.8, 41.4, 8], [3.6, 38, 2.6]],
    yaw: [0, Math.PI * 0.42], legs: [11, 17] },
};

const sm = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

/** Sample a centre line (Catmull-Rom through the points, broken at corners) every ~0.2 px. */
function sampleLine(pts) {
  const out = [];
  const P = (i) => pts[Math.max(0, Math.min(pts.length - 1, i))];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    // a corner breaks the spline: its neighbours do not pull the curve round it
    const a = p1[3] === 'c' || i === 0 ? p1 : p0, d = p2[3] === 'c' || i + 1 === pts.length - 1 ? p2 : p3;
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const n = Math.max(2, Math.ceil(len / 0.2));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const c = (q) => 0.5 * (2 * p1[q] + (-a[q] + p2[q]) * t + (2 * a[q] - 5 * p1[q] + 4 * p2[q] - d[q]) * t2 + (-a[q] + 3 * p1[q] - 3 * p2[q] + d[q]) * t3);
      out.push([c(0), c(1)]);
    }
  }
  out.push([pts[pts.length - 1][0], pts[pts.length - 1][1]]);
  return out;
}

function build(d) {
  const spec = DIGITS[d];
  const line = sampleLine(spec.pts);
  // arc length
  const S = [0];
  for (let i = 1; i < line.length; i++) S.push(S[i - 1] + Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]));
  const L = S[S.length - 1];
  // the arc length of each control point, and the widths given there
  const key = [];
  let at = 0;
  for (let k = 0; k < spec.pts.length; k++) {
    const p = spec.pts[k];
    while (at < line.length - 1 && Math.hypot(line[at][0] - p[0], line[at][1] - p[1]) > 0.11) at++;
    if (k === 0) key.push([0, WN]);
    else if (p[2] != null) key.push([S[at], p[2] > 5 ? p[2] * BODY_K : p[2]]);
    if (k === spec.b) var sb = S[at];
  }
  const widthAt = (s) => {
    let k = 0;
    while (k < key.length - 1 && key[k + 1][0] < s) k++;
    if (k === key.length - 1) return key[k][1];
    const [s0, w0] = key[k], [s1, w1] = key[k + 1];
    return w0 + (w1 - w0) * sm((s - s0) / (s1 - s0 || 1));
  };
  const C = line.map((p, i) => ({ x: p[0], y: p[1], r: widthAt(S[i]) / 2, u: (S[i] - sb) / (L - sb), s: S[i] / L, tail: L - S[i] }));
  const sdf = new Int8Array(SW * SH), part = new Uint8Array(SW * SH);
  // the body's own blooms: a backrun or two where a wet stroke met a damper one
  const blooms = [];
  const hb = (k) => ((Math.imul(d * 977 + k, 0x9e3779b1) >>> 0) / 4294967296);
  const body = C.filter((c) => c.u >= 0.1 && c.tail > 8);
  for (let k = 0; k < 2; k++) {
    const c = body[Math.floor(body.length * (0.15 + 0.7 * hb(k)))];
    blooms.push({ x: c.x + (hb(k + 7) - 0.5) * 2, y: c.y + (hb(k + 9) - 0.5) * 2, r: 2.6 + 1.6 * hb(k + 3), seed: d * 13 + k });
  }
  for (let j = 0; j < SH; j++)
    for (let i = 0; i < SW; i++) {
      const px = i - M + 0.5, py = j - M + 0.5;
      let best = 1e9, bi = 0;
      for (let k = 0; k < C.length; k++) {
        const c = C[k], e = Math.hypot(px - c.x, py - c.y) - c.r;
        if (e < best) { best = e; bi = k; }
      }
      const idx = j * SW + i;
      sdf[idx] = Math.max(-127, Math.min(127, Math.round(best * 8)));
      const c = C[bi];
      let p = NECK, side = 0;
      if (c.u >= 0) {
        // plumage: the upper side of the body carries the coral coverts, the
        // tail end the black flight feathers
        const up = py < c.y - 0.15 * c.r;
        p = c.tail < 3.5 || (c.tail < 7 && up) ? PRIMARY : BODY;
        // how far up the body this pixel lies (8 = the centre line): the
        // folded wing's coral covers the part above a line that the face
        // moves on every step, so the wing shuffles as the bird marches
        if (p === BODY && c.u > 0.12 && c.tail > 9) side = Math.max(1, Math.min(15, Math.round(8 + ((c.y - py) / c.r) * 5)));
      }
      let bl = 0;
      for (const B of blooms) {
        const a = Math.atan2(py - B.y, px - B.x);
        const wob = 0.55 * Math.sin(a * 5 + B.seed) + 0.35 * Math.sin(a * 9 + B.seed * 2.3);
        const r = Math.hypot(px - B.x, py - B.y), R = B.r + wob;
        if (r < R - 0.9) bl = 1; else if (r < R + 0.2 && bl === 0) bl = 2;
      }
      part[idx] = p | (bl << 2) | (side << 4);
    }
  // where the legs hang from (glyph x), and where the head sits
  return { sdf, part, head: spec.pts[0].slice(0, 2), yaw: spec.yaw, legs: spec.legs };
}

export const GLYPHS = Array.from({ length: 10 }, (_, d) => build(d));

// ------------------------------------------------------------ heads

// A flamingo head in profile: a round crown, the thick pale base of the bill
// and its bent black tip. `yaw` turns it about the vertical: 0 faces right,
// PI faces left, PI/2 looks at the viewer (the bill foreshortened to a short
// hook under the chin). Each field is HS x HS around the head's centre.
export const HS = 16, HC = 7.5, YAWS = 12;
export const H_HEAD = 4, H_BILL = 5, H_TIP = 6, H_EYE = 7;

function capsule(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let u = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  u = u < 0 ? 0 : u > 1 ? 1 : u;
  return Math.hypot(px - ax - u * dx, py - ay - u * dy);
}

function buildHead(yaw, sc) {
  const cs = Math.cos(yaw), sdf = new Int8Array(HS * HS), part = new Uint8Array(HS * HS);
  const rx = 2.9 * sc, ry = 2.5 * sc;
  // bill: from the face forward, then bent down; foreshortened by cos(yaw)
  const b0 = [cs * 1.8 * sc, 0.4 * sc], b1 = [cs * 4.4 * sc, 1.1 * sc], b2 = [cs * 5.4 * sc, 3.9 * sc];
  const front = Math.abs(cs) < 0.35;
  if (front) { b1[1] += 0.6 * sc; b2[0] = cs * 2 * sc; b2[1] = 4.6 * sc; }
  const eye = [cs * 0.5 * sc, -0.7 * sc];
  for (let j = 0; j < HS; j++)
    for (let i = 0; i < HS; i++) {
      const px = i - HC, py = j - HC;
      const dh = (Math.hypot(px / rx, py / ry) - 1) * Math.min(rx, ry);
      const dB = capsule(px, py, b0[0], b0[1], b1[0], b1[1]) - 1.25 * sc;
      const dT = capsule(px, py, b1[0], b1[1], b2[0], b2[1]) - 0.95 * sc;
      const d = Math.min(dh, dB, dT);
      sdf[j * HS + i] = Math.max(-127, Math.min(127, Math.round(d * 8)));
      let p = H_HEAD;
      if (dT < 0 && dT <= dB) p = H_TIP; else if (dB < 0 && dh > -0.6) p = H_BILL;
      if (!front && Math.abs(px - eye[0]) < 0.75 && Math.abs(py - eye[1]) < 0.75 && dh < -0.5) p = H_EYE;
      part[j * HS + i] = p;
    }
  return { sdf, part };
}

/** HEADS[scaleIndex][yawStep]: scale 0 for the hours (1.0), 1 for the minutes (0.8). */
export const HEAD_SCALES = [1, 0.84];
export const HEADS = HEAD_SCALES.map((sc) => Array.from({ length: YAWS + 1 }, (_, k) => buildHead((k / YAWS) * Math.PI, sc)));
