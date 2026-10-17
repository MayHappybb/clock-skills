// Forge glyphs: wrought-iron numerals, each bent from ONE square bar, the
// way a smith bends them round a scroll jig: straight runs, bends and
// scrolls that tighten to a drawn-out point.
//
// Each digit is a path of points ('P', x, y: a straight run to there) and
// arcs/scrolls ('A', cx, cy, r0, r1, a0, a1 in degrees, screen y down, so
// increasing angle turns clockwise). A straight run joins anything that does
// not meet. Designed in a 26 x 40 LED box and scaled to the slot.
//
// Because a digit is a bar with curvature along it, forging is physical:
// shapeInto(p) scales every bend by p and draws the bar out from a fixed
// straight billet, so p = 0 is the SAME billet for every digit: the old
// numeral is hammered straight, the billet is bent into the new one.

export const BOX_W = 26, BOX_H = 40;
// which end the smith starts bending from: chosen per digit so that no
// half-forged bar reads as another numeral (a tail-first 5 made a 6)
export const FROM = [0, 1, 1, 1, 1, 0, 1, 0, 0, 0];
const BILLET = 15;          // LEDs, the straight bar at p = 0 (minute size)
const STEP = 0.7;           // resample spacing, LEDs

const DEFS = {
  0: [['A', 13, 26.5, 9.4, 9.4, 90, 180], ['A', 13, 13.5, 9.4, 9.4, 180, 360], ['A', 13, 26.5, 9.4, 9.4, 0, 89]],
  1: [['A', 6.6, 12.6, 1.9, 4.0, 335, 45], ['P', 14.2, 3.4], ['P', 14.2, 9], ['T', 14.2, 31], ['P', 14.2, 37.2]],
  2: [['A', 7.9, 12.8, 1.9, 4.3, -110, 180], ['A', 13, 12.8, 9.4, 9.4, 180, 384], ['P', 3.8, 36.8], ['P', 19.6, 36.8], ['A', 19.6, 32.8, 4.0, 1.9, 90, -200]],
  3: [['A', 7.6, 11.6, 1.9, 4.0, -110, 180], ['A', 12.6, 11.6, 9.0, 9.0, 180, 400], ['A', 12.4, 28.4, 9.0, 9.0, 270, 512]],
  4: [['P', 17.4, 37.4], ['P', 17.4, 31], ['T', 17.4, 9], ['P', 17.4, 3.4], ['P', 3.6, 27.2], ['P', 21, 27.2], ['A', 21, 24.4, 2.8, 1.7, 90, -150]],
  5: [['A', 19.2, 8.4, 1.9, 4.0, 560, 270], ['P', 6.6, 4.4], ['P', 5.6, 18.8], ['A', 12.6, 26.2, 10.0, 10.0, 228, 512]],
  7: [['A', 6.0, 8.4, 1.9, 4.0, -20, 270], ['P', 22.6, 4.4], ['P', 20.6, 10], ['T', 12.6, 31], ['P', 10.2, 37.4]],
  8: [['A', 13, 11.8, 7.6, 7.6, 90, 450], ['A', 13, 28.4, 9.0, 9.0, 270, -90]],
  9: [['A', 13, 12.8, 9.4, 9.4, -326, 0], ['P', 22.4, 27.2], ['A', 13, 27.2, 9.4, 9.4, 0, 152]],
};

// collars: forge-welded bands where bars meet (a local bulge in the bar)
const COLLARS = {
  0: [[13, 35.9]], 3: [[12.4, 19.6]], 4: [[17.4, 27.2]], 8: [[13, 19.4]], 9: [[21.9, 18.2]],
};

/** Dense trace of a definition: [x, y] list. */
function trace(def) {
  const pts = [];
  const fine = 0.2;
  const lineTo = (x, y, tw = 0) => {
    if (!pts.length) { pts.push([x, y, 0]); return; }
    const [px, py] = pts[pts.length - 1], L = Math.hypot(x - px, y - py), n = Math.ceil(L / fine);
    for (let i = 1; i <= n; i++) pts.push([px + ((x - px) * i) / n, py + ((y - py) * i) / n, tw]);
  };
  for (const c of def) {
    if (c[0] === 'P' || c[0] === 'T') lineTo(c[1], c[2], c[0] === 'T' ? 1 : 0);
    else {
      const [, cx, cy, r0, r1, a0, a1] = c;
      const t0 = (a0 * Math.PI) / 180, t1 = (a1 * Math.PI) / 180;
      const n = Math.max(4, Math.ceil((Math.abs(t1 - t0) * Math.max(r0, r1)) / fine));
      for (let i = 0; i <= n; i++) {
        const u = i / n, r = r0 + (r1 - r0) * u, t = t0 + (t1 - t0) * u;
        lineTo(cx + r * Math.cos(t), cy + r * Math.sin(t));
      }
    }
  }
  return pts;
}

function resample(pts) {
  const xs = [pts[0][0]], ys = [pts[0][1]], tw = [0];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (acc >= STEP) { acc -= STEP; xs.push(pts[i][0]); ys.push(pts[i][1]); tw.push(pts[i][2]); }
  }
  const l = pts[pts.length - 1];
  if (acc > STEP * 0.3) { xs.push(l[0]); ys.push(l[1]); tw.push(0); }
  return { xs, ys, tw };
}

function build(d) {
  const flip = d === 6;
  const r = resample(trace(DEFS[flip ? 9 : d]));
  const n = r.xs.length;
  const xs = new Float32Array(n), ys = new Float32Array(n);
  for (let i = 0; i < n; i++) { xs[i] = flip ? BOX_W - r.xs[i] : r.xs[i]; ys[i] = flip ? BOX_H - r.ys[i] : r.ys[i]; }
  const hd = new Float32Array(n);
  for (let i = 0; i < n - 1; i++) hd[i] = Math.atan2(ys[i + 1] - ys[i], xs[i + 1] - xs[i]);
  hd[n - 1] = hd[n - 2];
  for (let i = 1; i < n; i++) {
    while (hd[i] - hd[i - 1] > Math.PI) hd[i] -= 2 * Math.PI;
    while (hd[i] - hd[i - 1] < -Math.PI) hd[i] += 2 * Math.PI;
  }
  // relative headings: total turning from the start, so p scales the bends
  const tp = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const e = Math.min(i, n - 1 - i) * STEP;
    tp[i] = d === 0 ? 1 : 0.4 + 0.6 * Math.min(1, e / 9) ** 0.75;
  }
  const tw = Float32Array.from(r.tw);
  for (const [cx0, cy0] of COLLARS[flip ? 9 : d] ?? []) {
    const cx = flip ? BOX_W - cx0 : cx0, cy = flip ? BOX_H - cy0 : cy0;
    let best = 0, bd = 1e9;
    for (let i = 0; i < n; i++) { const q = Math.hypot(xs[i] - cx, ys[i] - cy); if (q < bd) { bd = q; best = i; } }
    for (let j = -1; j <= 1; j++) if (best + j >= 0 && best + j < n) { tp[best + j] = 1.55; tw[best + j] = 2; }
  }
  return { n, xs, ys, hd, tp, tw };
}

export const GLYPHS = Array.from({ length: 10 }, (_, d) => build(d));
for (const G of GLYPHS) {
  let a = 1e9, b = -1e9, c = -1e9, top = 0;
  for (let i = 0; i < G.n; i++) {
    a = Math.min(a, G.xs[i]); b = Math.max(b, G.xs[i]); c = Math.max(c, G.ys[i]);
    if (G.ys[i] < G.ys[top]) top = i;
  }
  G.cx = (a + b) / 2; G.maxY = c; G.top = top;
}

export function makePath() {
  const N = 512;
  return { n: 0, p: 1, x: new Float32Array(N), y: new Float32Array(N), t: new Float32Array(N), s: new Float32Array(N), w: new Float32Array(N) };
}

/**
 * The bar of digit d at forging progress p (0 = the straight billet,
 * 1 = the numeral), scaled by k, box bottom-centre at (cx, by).
 * P.s[i] is the position along the bar, 0..1 (pours run along it).
 */
export function shapeInto(P, d, p, k, cx, by) {
  const G = GLYPHS[d], n = G.n;
  P.n = n; P.p = p;
  for (let i = 0; i < n; i++) { P.s[i] = i / (n - 1); P.w[i] = G.tw[i]; }
  if (p >= 0.999) {
    for (let i = 0; i < n; i++) { P.x[i] = cx + (G.xs[i] - BOX_W / 2) * k; P.y[i] = by + (G.ys[i] - BOX_H) * k; P.t[i] = G.tp[i]; }
    return P;
  }
  // The smith works along the bar from one end (FROM[d]): the worked part
  // is already the numeral, in its final place, and the unworked rest runs
  // on from it as a straight, thicker billet along the tangent. So a part-
  // forged bar is a half-drawn numeral with a straight bar attached, never
  // a rotated or different numeral.
  const hf = FROM[d] === 1;
  const m = p * (n - 1);
  const mi = Math.min(n - 2, Math.floor(m)), mf = m - mi;
  const ds = (BILLET / (n - 1)) * k;
  // index along the work direction
  const J = (i) => (hf ? n - 1 - i : i);
  const ax = cx - BOX_W / 2 * k, ay = by - BOX_H * k;
  const xa = G.xs[J(mi)], ya = G.ys[J(mi)], xb = G.xs[J(mi + 1)], yb = G.ys[J(mi + 1)];
  const fx = ax + (xa + (xb - xa) * mf) * k, fy = ay + (ya + (yb - ya) * mf) * k;
  let tx = xb - xa, ty = yb - ya;
  const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
  for (let i = 0; i < n; i++) {
    const w = J(i);
    if (i <= m) { P.x[w] = ax + G.xs[w] * k; P.y[w] = ay + G.ys[w] * k; P.t[w] = G.tp[w]; }
    else {
      const r = (i - m) * ds;
      P.x[w] = fx + tx * r; P.y[w] = fy + ty * r;
      P.t[w] = 1.3;
    }
  }
  // near p = 0 every digit eases onto the same billet lying along the anvil
  // face, so unbending the old numeral and bending the new one meet exactly
  const wb = p >= 0.3 ? 0 : 1 - (p / 0.3) ** 2 * (3 - 2 * (p / 0.3));
  if (wb > 0) {
    const x0 = cx - (BILLET * k) / 2, y0 = by - 1.6 * k;
    for (let i = 0; i < n; i++) {
      const w = J(i), bx = x0 + i * ds, byy = y0;
      P.x[w] += (bx - P.x[w]) * wb; P.y[w] += (byy - P.y[w]) * wb; P.t[w] += (1.3 - P.t[w]) * wb;
    }
  }
  return P;
}

/**
 * The old numeral hammered flat: s = 0 the numeral, 1 = the billet. Each
 * blow squashes it down onto the anvil face and spreads it (a squat old
 * digit, then a flat bar: never another numeral); the last part of s draws
 * the flat bar in to the billet that every numeral is bent from.
 */
export function squashInto(P, d, s, k, cx, by) {
  shapeInto(P, d, 1, k, cx, by);
  const n = P.n, face = by - 1.6 * k;
  const sq = Math.min(1, s / 0.8), dr = s <= 0.8 ? 0 : (s - 0.8) / 0.2;
  const h = 1 - sq, spread = 1 + 0.35 * sq;
  const ds = (BILLET / (n - 1)) * k, x0 = cx - (BILLET * k) / 2;
  const hf = FROM[d] === 1;
  for (let i = 0; i < n; i++) {
    let x = cx + (P.x[i] - cx) * spread, y = face + (P.y[i] - face) * h;
    P.t[i] = P.t[i] + (1.3 - P.t[i]) * sq;
    if (dr > 0) {
      const j = hf ? n - 1 - i : i, e = dr * dr * (3 - 2 * dr);
      x += (x0 + j * ds - x) * e; y += (face - y) * e;
    }
    P.x[i] = x; P.y[i] = y; P.w[i] = sq > 0.5 ? 0 : P.w[i];
  }
  return P;
}
