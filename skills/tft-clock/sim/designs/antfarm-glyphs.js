// The numerals for antfarm.js: each digit is a tunnel system, one gallery
// path an ant could walk from end to end, dug with an even round bore and
// finished with round chambers where a gallery ends.
//
// Built once at load (on the device: const tables in flash):
//  - Q: per pixel of the 28 x 48 glyph box, the bore-relative distance to the
//    gallery's centre line, q = d / r, in 1/64 (Uint8). A tunnel of bore
//    fraction k is every pixel with q < k: k = 1 is the finished gallery, a
//    small k a pilot tunnel, and backfilling is k falling to 0, so a digit
//    always narrows or widens evenly along its whole length.
//  - A: per pixel, the distance along the path of the nearest centre-line
//    point (px, Uint8): the pilot is dug from several faces at once.
//  - ROUTE: the centre line at 1 px steps (x, y, heading), for the ants.

export const DW = 28, DH = 48;
export const BORE = 4.0;                  // gallery radius in px: 8 clean px (an ant leaves 3 clear), then a 1 px packed wall
const BULB = 5.0;                          // chamber ends

function path() {
  const pts = [];
  let cx = 0, cy = 0;
  const api = {
    M(x, y) { cx = x; cy = y; pts.push([x, y]); return api; },
    L(x, y) {
      const n = Math.max(1, Math.ceil(Math.hypot(x - cx, y - cy) * 4));
      for (let i = 1; i <= n; i++) pts.push([cx + ((x - cx) * i) / n, cy + ((y - cy) * i) / n]);
      cx = x; cy = y; return api;
    },
    /** Elliptic arc round (ox, oy), radii (rx, ry), from angle a0 to a1 in degrees (0 right, 90 down). */
    A(ox, oy, rx, ry, a0, a1) {
      const p0 = [ox + rx * Math.cos((a0 * Math.PI) / 180), oy + ry * Math.sin((a0 * Math.PI) / 180)];
      if (Math.hypot(p0[0] - cx, p0[1] - cy) > 0.01) api.L(p0[0], p0[1]);
      const n = Math.ceil((Math.abs(a1 - a0) / 360) * 2 * Math.PI * Math.max(rx, ry) * 4);
      for (let i = 1; i <= n; i++) {
        const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
        pts.push([ox + rx * Math.cos(a), oy + ry * Math.sin(a)]);
      }
      [cx, cy] = pts[pts.length - 1]; return api;
    },
    /** Quadratic curve through control (qx, qy) to (x, y). */
    Q(qx, qy, x, y) {
      const x0 = cx, y0 = cy, n = Math.ceil(Math.hypot(x - x0, y - y0) * 5);
      for (let i = 1; i <= n; i++) {
        const u = i / n, v = 1 - u;
        pts.push([v * v * x0 + 2 * u * v * qx + u * u * x, v * v * y0 + 2 * u * v * qy + u * u * y]);
      }
      cx = x; cy = y; return api;
    },
    pts,
  };
  return api;
}

// Each: the walkable path, its chamber ends, and the port where the shaft from the surface comes in.
const DEFS = [
  // 0: one ring gallery, tall and round-ended
  () => ({ p: path().M(14, 5).A(14, 14, 9, 9, -90, 0).L(23, 32).A(14, 32, 9, 9, 0, 180).L(5, 14).A(14, 14, 9, 9, 180, 270), b: [], port: [14, 5] }),
  // 1: a stem with a flag gallery ending in a chamber, and a chamber at the foot
  () => ({ p: path().M(8, 12.5).L(16, 5).L(16, 40.5), b: [[7.8, 12.6], [16, 40.5]], port: [16, 5] }),
  // 2
  () => ({ p: path().M(5.2, 13).A(14, 13.5, 8.8, 8.5, 180, 375).Q(16, 27, 5, 41).L(22.5, 41), b: [[5.6, 12.6], [22.6, 41]], port: [14, 5] }),
  // 3: two bowls meeting in a short tongue
  () => ({ p: path().M(6, 10.5).A(14, 13.5, 8.5, 8.5, 200, 450).L(9.5, 22.5).L(14, 22.5).A(14, 32, 9, 9, 270, 520), b: [[6, 10.5], [5.6, 35]], port: [14, 5] }),
  // 4: open top, the bar running through the stem
  () => ({ p: path().M(5, 5).L(5, 27.5).L(23.5, 27.5).L(19, 27.5).L(19, 5).L(19, 41), b: [[5, 5.4], [19, 40.6]], port: [19, 5] }),
  // 5: flag, stem, and a deep bowl that stays open on the left
  () => ({ p: path().M(22.5, 5).L(6, 5).L(6, 20).L(9.5, 20).A(14, 30.5, 9, 10.5, -115, 145), b: [[22.6, 5.2], [6.6, 36.6]], port: [14, 5] }),
  // 6: a hooked stem falling into a round chamber loop
  () => ({ p: path().M(21, 7.5).A(15, 19.5, 10, 12, 295, 180).L(5, 30.5).A(14, 30.5, 9, 10.5, 180, 540), b: [[21, 7.4]], port: [21, 7.5] }),
  // 7: a bar and a curving drop
  () => ({ p: path().M(5, 5).L(23, 5).Q(17, 22, 12, 40.5), b: [[5.2, 5.2], [12, 40.6]], port: [14, 5] }),
  // 8: a smaller ring above a bigger one
  () => ({ p: path().M(14, 22).A(14, 13.5, 8, 8.5, 90, 450).A(14, 31.5, 9, 9.5, -90, 270), b: [], port: [14, 5] }),
  // 9: the 6 turned round, its port on top of the loop
  null,
];

// the shapes are drawn on an 18 x 36 skeleton box; stretched to the glyph box's height
const SX = (x) => x, SY = (y) => 24 + ((y - 23) * 38) / 36;

function build(d) {
  const pts = d.p.pts.map(([x, y]) => [SX(x), SY(y)]);
  const b = d.b.map(([x, y]) => [SX(x), SY(y)]), port = [SX(d.port[0]), SY(d.port[1])];
  // arc length of every sample
  const arc = new Float32Array(pts.length);
  for (let i = 1; i < pts.length; i++) arc[i] = arc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  const len = arc[pts.length - 1];
  const Q = new Uint8Array(DW * DH), A = new Uint8Array(DW * DH);
  for (let y = 0; y < DH; y++) for (let x = 0; x < DW; x++) {
    const px = x + 0.5, py = y + 0.5;
    let best = 1e9, bi = 0;
    for (let i = 0; i < pts.length; i++) {
      const q = Math.hypot(px - pts[i][0], py - pts[i][1]) / BORE;
      if (q < best) { best = q; bi = i; }
    }
    for (const [bx, by] of b) {
      const q = Math.hypot(px - bx, py - by) / BULB;
      if (q < best) best = q;
    }
    Q[y * DW + x] = Math.min(255, Math.round(best * 64));
    A[y * DW + x] = Math.min(255, Math.round(arc[bi]));
  }
  // the ants' route: 1 px steps along the centre line
  const n = Math.max(2, Math.floor(len) + 1);
  const RX = new Float32Array(n), RY = new Float32Array(n), RH = new Float32Array(n);
  for (let k = 0, i = 0; k < n; k++) {
    const s = (k / (n - 1)) * len;
    while (i < pts.length - 2 && arc[i + 1] < s) i++;
    const u = arc[i + 1] > arc[i] ? (s - arc[i]) / (arc[i + 1] - arc[i]) : 0;
    RX[k] = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * u;
    RY[k] = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * u;
  }
  for (let k = 0; k < n; k++) {
    const a = Math.max(0, k - 2), c = Math.min(n - 1, k + 2);
    RH[k] = Math.atan2(RY[c] - RY[a], RX[c] - RX[a]);
  }
  return { Q, A, len, RX, RY, RH, n, port };
}

function turn(d) {
  const p = { pts: d.p.pts.map(([x, y]) => [28 - x, 46 - y]) };
  return { p, b: d.b.map(([x, y]) => [28 - x, 46 - y]), port: [14, 5] };
}

export const GLYPHS = DEFS.map((f, i) => build(f ? f() : turn(DEFS[6]())));
