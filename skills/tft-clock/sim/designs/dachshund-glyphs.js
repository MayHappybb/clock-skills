// Dachshund glyphs: the ten numerals as the routes of ten long dogs, seen
// from above. Each digit is ONE dog lying along ONE continuous centreline,
// tail (S, the hairline terminal) to nose (E, the ball terminal). Where a
// route crosses itself (4, 8) or folds back (3's waist), the part nearer the
// head lies on top.
//
// For each digit a body field is baked at load (flash tables): for every
// pixel of the digit's box, the arc length s of the nearest point of the
// route and the signed lateral distance to it (1/16 px), plus the same for
// the nearest point of another branch (the one underneath at a crossing).
// A frame then draws a dog by looking these up: the dog's own coordinate
// along its body is v = h - s (h = where its nose is along the route), so a
// dog that walks along its route slides its coat, legs and head along with it.

const UNIT = 16;          // sd is stored in 1/16 px
export const EXT = 4;     // route extended this far past both ends (s is stored + EXT)
export const BOXW = 40, BOXH = 64;   // field box (centreline box 22 x 46 plus margins)
export const OX = 9, OY = 9;         // centreline origin inside the field box

// ---------------------------------------------------------------- route construction

const rad = (d) => (d * Math.PI) / 180;
function arc(pts, cx, cy, r, a0, a1) {
  const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) * r * 0.05));
  for (let i = 0; i <= n; i++) {
    const a = rad(a0 + ((a1 - a0) * i) / n);
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
}
function line(pts, x, y) { pts.push([x, y]); }
function cubic(pts, p0, p1, p2, p3) {
  for (let i = 0; i <= 24; i++) {
    const t = i / 24, u = 1 - t;
    pts.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ]);
  }
}

/** Raw routes, tail first, in a 22 x 46 centreline box. */
const RAW = {
  0: () => { // a squarish oval, tail at the bottom, the dog curled nose to tail
    const p = [];
    for (let a = 100; a <= 437; a += 2) {
      const t = rad(a), c = Math.cos(t), q = Math.sin(t), n = 2.25;
      p.push([11 + 11.2 * Math.sign(c) * Math.abs(c) ** (2 / n), 23 + 23 * Math.sign(q) * Math.abs(q) ** (2 / n)]);
    }
    return p;
  },
  1: () => { const p = [[13, 46]]; line(p, 13, 10); arc(p, 8, 10, 5, 0, -150); line(p, 1.6, 10.6); return p; },
  2: () => { const p = [[22, 46]]; line(p, 1.5, 46); line(p, 18.8, 20); arc(p, 11, 12, 11, 42, -197); return p; },
  3: () => { const p = []; arc(p, 11, 35, 11.5, 148, -90); line(p, 7.5, 23.5); arc(p, 7.5, 20, 3.5, 90, 270); line(p, 11, 16.5); arc(p, 11, 9, 7.5, 90, -198); return p; },
  4: () => { const p = [[23, 31]]; line(p, -0.5, 31); line(p, 15, 0.5); line(p, 15, 46); return p; },
  5: () => { const p = [[21.5, 1]]; line(p, 2, 1); line(p, 1.5, 21.5); line(p, 10, 21); arc(p, 10, 33.5, 12.5, -90, 146); return p; },
  6: () => { const p = []; cubic(p, [19.5, 1.5], [8, 1.5], [-0.5, 13], [-0.5, 30]); line(p, -0.5, 34.5); arc(p, 11, 34.5, 11.5, 180, -158); return p; },
  7: () => { const p = [[0, 1]]; line(p, 21, 1); cubic(p, [21, 1], [16, 14], [8.5, 29], [7, 46]); return p; },
  8: () => { const p = []; arc(p, 11, 11, 9.5, -62, -225); line(p, 19.1, 25.9); arc(p, 11, 34, 11.5, -45, 225); line(p, 17.7, 17.7); arc(p, 11, 11, 9.5, 45, -50); return p; },
  9: () => { const p = []; cubic(p, [2.5, 45], [14, 45], [22.5, 33], [22.5, 17]); line(p, 22.5, 11.5); arc(p, 11, 11.5, 11.5, 0, -340); return p; },
};

/** Resample a polyline at a fixed arc-length step. */
function resample(pts, step) {
  const out = [pts[0]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    const len = Math.hypot(bx - ax, by - ay);
    if (len < 1e-9) continue;
    let d = step - carry;
    while (d <= len) { out.push([ax + ((bx - ax) * d) / len, ay + ((by - ay) * d) / len]); d += step; }
    carry = len - (d - step);
  }
  const last = pts[pts.length - 1], tail = out[out.length - 1];
  if (Math.hypot(last[0] - tail[0], last[1] - tail[1]) > step * 0.3) out.push(last);
  return out;
}

/** Laplacian smoothing (ends pinned): rounds corners to a body-like bend. */
function smooth(pts, iters) {
  let p = pts.map((q) => q.slice());
  for (let k = 0; k < iters; k++) {
    const q = p.map((v) => v.slice());
    for (let i = 1; i < p.length - 1; i++) {
      q[i][0] = (p[i - 1][0] + 2 * p[i][0] + p[i + 1][0]) / 4;
      q[i][1] = (p[i - 1][1] + 2 * p[i][1] + p[i + 1][1]) / 4;
    }
    p = q;
  }
  return p;
}

function build(d) {
  let p = resample(RAW[d](), 0.5);
  p = smooth(p, d === 3 ? 10 : 22);
  p = resample(p, 1);
  // tangents from neighbours
  const n = p.length, tx = new Float32Array(n), ty = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = p[Math.max(0, i - 2)], b = p[Math.min(n - 1, i + 2)];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    tx[i] = (b[0] - a[0]) / l; ty[i] = (b[1] - a[1]) / l;
  }
  const L = n - 1;
  // extended arrays: index k = s + EXT, s from -EXT to L + EXT
  const M = L + 1 + 2 * EXT;
  const X = new Float32Array(M), Y = new Float32Array(M), TX = new Float32Array(M), TY = new Float32Array(M);
  for (let k = 0; k < M; k++) {
    const s = k - EXT;
    if (s < 0) { X[k] = p[0][0] + tx[0] * s; Y[k] = p[0][1] + ty[0] * s; TX[k] = tx[0]; TY[k] = ty[0]; }
    else if (s > L) { X[k] = p[L][0] + tx[L] * (s - L); Y[k] = p[L][1] + ty[L] * (s - L); TX[k] = tx[L]; TY[k] = ty[L]; }
    else { X[k] = p[s][0]; Y[k] = p[s][1]; TX[k] = tx[s]; TY[k] = ty[s]; }
    X[k] += OX; Y[k] += OY;
  }
  return { L, M, X, Y, TX, TY };
}

// ---------------------------------------------------------------- body fields

const SEP = 13;  // two route points this far apart along the route are different branches

function bake(r) {
  const N = BOXW * BOXH;
  const S1 = new Uint8Array(N).fill(255), D1 = new Int8Array(N), S2 = new Uint8Array(N).fill(255), D2 = new Int8Array(N);
  const { M, X, Y, TX, TY } = r;
  for (let y = 0; y < BOXH; y++) for (let x = 0; x < BOXW; x++) {
    const px = x + 0.5, py = y + 0.5;
    let b1 = -1, e1 = 1e9;
    for (let k = 0; k < M; k++) { const dx = px - X[k], dy = py - Y[k], e = dx * dx + dy * dy; if (e < e1) { e1 = e; b1 = k; } }
    let b2 = -1, e2 = 1e9;
    for (let k = 0; k < M; k++) {
      if (Math.abs(k - b1) < SEP) continue;
      const dx = px - X[k], dy = py - Y[k], e = dx * dx + dy * dy;
      if (e < e2) { e2 = e; b2 = k; }
    }
    const i = y * BOXW + x;
    const put = (k, S, D) => {
      // signed lateral distance: + to the left of travel (screen: (ty, -tx))
      const dx = px - X[k], dy = py - Y[k];
      const along = dx * TX[k] + dy * TY[k];
      const sd = dx * TY[k] - dy * TX[k];
      if (Math.abs(along) > 1.2 && (k === 0 || k === M - 1)) return; // past the extended ends
      if (Math.abs(sd) >= 7.9) return;
      S[i] = k; D[i] = Math.round(sd * UNIT);
    };
    put(b1, S1, D1);
    // only keep a second branch if it is a local minimum of its own (not just the
    // flank of the first) and close enough to matter
    if (b2 >= 0 && e2 < 64) {
      const lm = (b2 === 0 || ((px - X[b2 - 1]) ** 2 + (py - Y[b2 - 1]) ** 2) >= e2) && (b2 === M - 1 || ((px - X[b2 + 1]) ** 2 + (py - Y[b2 + 1]) ** 2) >= e2);
      if (lm) put(b2, S2, D2);
    }
  }
  return { S1, D1, S2, D2 };
}

/**
 * Which way each dog comes and goes, chosen so that a half-drawn numeral is
 * never another numeral: 'head' enters nose first out of a hole at the tail
 * end (the numeral grows from S) and leaves nose first into a hole at the
 * nose (it shrinks towards E); 'tail' backs out of a hole at the nose, tail
 * first, or backs into a hole at the tail end, as dachshunds do in burrows.
 * Bar-first numerals (2 4 5 7) keep their bar: they arrive bar first and back
 * out bar last.
 */
export const ENTER = ['head', 'head', 'head', 'head', 'head', 'head', 'head', 'head', 'head', 'head'];
export const LEAVE = ['head', 'head', 'tail', 'head', 'tail', 'tail', 'head', 'tail', 'head', 'head'];

export const ROUTES = [];
for (let d = 0; d < 10; d++) {
  const r = build(d);
  Object.assign(r, bake(r));
  ROUTES.push(r);
}

/** Flash held by the glyph tables, bytes. */
export const GLYPH_BYTES = ROUTES.reduce((a, r) => a + r.S1.length * 4 + r.M * 16, 0);
