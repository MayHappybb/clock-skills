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
const BILLET = 15;          // LEDs, the straight bar at p = 0 (minute size)
const STEP = 0.7;           // resample spacing, LEDs

const DEFS = {
  0: [['P', 3.6, 21], ['A', 13, 13.5, 9.4, 9.4, 180, 360], ['A', 13, 26.5, 9.4, 9.4, 0, 180], ['P', 3.6, 20.4]],
  1: [['A', 6.6, 12.6, 0.9, 4.0, 410, 45], ['P', 14.2, 3.4], ['P', 14.2, 37.2]],
  2: [['A', 7.9, 12.8, 0.9, 4.3, -230, 180], ['A', 13, 12.8, 9.4, 9.4, 180, 384], ['P', 3.8, 36.8], ['P', 19.6, 36.8], ['A', 19.6, 32.8, 4.0, 1.0, 90, -230]],
  3: [['A', 7.6, 11.6, 0.9, 4.0, -230, 180], ['A', 12.6, 11.6, 9.0, 9.0, 180, 400], ['A', 12.4, 28.4, 9.0, 9.0, 270, 512]],
  4: [['P', 17.4, 37.4], ['P', 17.4, 3.4], ['P', 3.6, 27.2], ['P', 21, 27.2], ['A', 21, 23.8, 3.4, 0.9, 90, -250]],
  5: [['A', 19.2, 8.4, 0.9, 4.0, 670, 270], ['P', 6.6, 4.4], ['P', 5.6, 18.8], ['A', 12.6, 26.2, 10.0, 10.0, 228, 512]],
  7: [['A', 6.0, 8.4, 0.9, 4.0, -130, 270], ['P', 22.6, 4.4], ['P', 10.2, 37.4]],
  8: [['A', 13, 11.8, 7.6, 7.6, 90, 450], ['A', 13, 28.4, 9.0, 9.0, 270, -90]],
  9: [['A', 13, 12.8, 9.4, 9.4, -326, 0], ['P', 22.4, 27.2], ['A', 13, 27.2, 9.4, 9.4, 0, 152]],
};

/** Dense trace of a definition: [x, y] list. */
function trace(def) {
  const pts = [];
  const fine = 0.2;
  const lineTo = (x, y) => {
    if (!pts.length) { pts.push([x, y]); return; }
    const [px, py] = pts[pts.length - 1], L = Math.hypot(x - px, y - py), n = Math.ceil(L / fine);
    for (let i = 1; i <= n; i++) pts.push([px + ((x - px) * i) / n, py + ((y - py) * i) / n]);
  };
  for (const c of def) {
    if (c[0] === 'P') lineTo(c[1], c[2]);
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
  const xs = [pts[0][0]], ys = [pts[0][1]];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (acc >= STEP) { acc -= STEP; xs.push(pts[i][0]); ys.push(pts[i][1]); }
  }
  const l = pts[pts.length - 1];
  if (acc > STEP * 0.3) { xs.push(l[0]); ys.push(l[1]); }
  return { xs, ys };
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
  return { n, xs, ys, hd, tp };
}

export const GLYPHS = Array.from({ length: 10 }, (_, d) => build(d));

export function makePath() {
  const N = 512;
  return { n: 0, p: 1, x: new Float32Array(N), y: new Float32Array(N), t: new Float32Array(N), s: new Float32Array(N) };
}

/**
 * The bar of digit d at forging progress p (0 = the straight billet,
 * 1 = the numeral), scaled by k, box bottom-centre at (cx, by).
 * P.s[i] is the position along the bar, 0..1 (pours run along it).
 */
export function shapeInto(P, d, p, k, cx, by) {
  const G = GLYPHS[d], n = G.n;
  P.n = n; P.p = p;
  for (let i = 0; i < n; i++) P.s[i] = i / (n - 1);
  if (p >= 0.999) {
    for (let i = 0; i < n; i++) { P.x[i] = cx + (G.xs[i] - BOX_W / 2) * k; P.y[i] = by + (G.ys[i] - BOX_H) * k; P.t[i] = G.tp[i]; }
    return P;
  }
  // the billet lies along the anvil (heading 0); bends grow with p
  const h0 = G.hd[0], base = Math.round(h0 / Math.PI) * Math.PI;   // lie flat, either way round
  const ds = (BILLET / (n - 1)) * (1 - p) * k + STEP * p * k;
  let x = 0, y = 0, minX = 1e9, maxX = -1e9, maxY = -1e9;
  const e = p * p * (3 - 2 * p);
  for (let i = 0; i < n; i++) {
    P.x[i] = x; P.y[i] = y;
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y > maxY) maxY = y;
    const h = base + (G.hd[i] - base) * e;
    x += Math.cos(h) * ds; y += Math.sin(h) * ds;
    // the billet is thick and blunt; drawing it out thins and points it
    P.t[i] = 1.25 + (G.tp[i] - 1.25) * p;
  }
  // centre the bar on the slot; the billet rests on the anvil face (by)
  const ox = cx - (minX + maxX) / 2, oy = by - maxY - 2 * k * (1 - p);
  for (let i = 0; i < n; i++) { P.x[i] += ox; P.y[i] += oy; }
  return P;
}
