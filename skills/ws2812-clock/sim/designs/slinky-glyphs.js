// Stone-mason numerals for the slinky staircase: Roman inscriptional digits
// (thick stems, thin hairlines, wedge serifs) drawn as tapered strokes in a
// 16 x 34 box, then cut into a coverage mask with 4x4 supersampling.
export const GW = 16, GH = 34;

// A stroke is [ax, ay, bx, by, wa, wb]: a tapered capsule, widths in px.
const TH = 3.8, TN = 1.7;
function arc(cx, cy, rx, ry, a0, a1, thick = TH, thin = TN, tilt = 0.35, n = 28) {
  const out = [];
  let px = 0, py = 0, pw = 0;
  for (let k = 0; k <= n; k++) {
    const a = a0 + ((a1 - a0) * k) / n;
    const x = cx + rx * Math.cos(a), y = cy - ry * Math.sin(a);
    const w = thin + (thick - thin) * Math.abs(Math.cos(a - tilt)) ** 1.5;
    if (k) out.push([px, py, x, y, pw, w]);
    px = x; py = y; pw = w;
  }
  return out;
}
function quad(ax, ay, cx, cy, bx, by, wa, wb, n = 18) {
  const out = [];
  let px = ax, py = ay;
  for (let k = 1; k <= n; k++) {
    const t = k / n, u = 1 - t;
    const x = u * u * ax + 2 * u * t * cx + t * t * bx, y = u * u * ay + 2 * u * t * cy + t * t * by;
    out.push([px, py, x, y, wa + (wb - wa) * ((k - 1) / n), wa + (wb - wa) * t]);
    px = x; py = y;
  }
  return out;
}
const D = Math.PI / 180;
const ln = (ax, ay, bx, by, wa, wb = wa) => [[ax, ay, bx, by, wa, wb]];

const SPEC = {
  0: () => arc(8, 17, 6.3, 15.4, 0, 2 * Math.PI, 3.5, 1.4, 0.3, 40),
  1: () => [...ln(8, 1.6, 8, 32.4, TH), ...ln(8.2, 1.4, 3.6, 5.6, 1.6, 1.2), ...ln(3.2, 32.7, 12.8, 32.7, TN)],
  2: () => [...arc(8, 9.4, 6.1, 7.9, 205 * D, -28 * D, 3.2, 1.3, -0.2), ...quad(13.4, 13.4, 9, 21, 2.2, 32.2, 3.3, 1.6),
    ...ln(2.2, 32.6, 14.2, 32.6, 1.9), ...ln(14.2, 32.6, 14.4, 28.8, 1.4, 1.0)],
  3: () => [...arc(7.7, 9.2, 5.8, 7.6, 160 * D, -90 * D, 3.0, 1.3, 0), ...ln(6, 16.8, 8, 16.8, 1.5),
    ...arc(7.9, 24.7, 6.6, 8.1, 90 * D, -165 * D, 3.5, 1.3, 0)],
  4: () => [...ln(11.6, 1.6, 1.4, 24.2, 1.6, 1.5), ...ln(1.4, 24.2, 15.4, 24.2, 1.7), ...ln(11.6, 1.6, 11.6, 32.4, TH),
    ...ln(8.2, 32.7, 15, 32.7, TN)],
  5: () => [...ln(4.2, 1.8, 14.6, 1.8, 1.9), ...ln(14.6, 1.8, 14.8, 5, 1.4, 1.0), ...ln(4.2, 1.6, 3.6, 15.4, 2.4, 2.2),
    ...arc(7.8, 23.4, 6.6, 9.2, 125 * D, -160 * D, 3.5, 1.4, 0)],
  6: () => [...arc(8, 23.6, 6.4, 9.2, 0, 2 * Math.PI, 3.4, 1.4, 0.3, 36), ...quad(1.9, 23, 1.6, 3.4, 12.4, 1.9, 3.4, 1.3)],
  7: () => [...ln(1.6, 1.8, 14.6, 1.8, 1.9), ...ln(1.6, 1.8, 1.4, 5.2, 1.4, 1.0), ...quad(14.6, 2, 8.6, 14, 6.6, 32.4, 1.8, 3.4)],
  8: () => [...arc(8, 9.1, 5.3, 7.5, 0, 2 * Math.PI, 3.0, 1.3, 0.3, 32), ...arc(8, 24.8, 6.5, 8.6, 0, 2 * Math.PI, 3.5, 1.4, 0.3, 36)],
};
SPEC[9] = () => SPEC[6]().map(([ax, ay, bx, by, wa, wb]) => [GW - ax, GH - ay, GW - bx, GH - by, wa, wb]);

/** Distance from p to a tapered capsule, negative inside. */
function capsule(px, py, s) {
  const [ax, ay, bx, by, wa, wb] = s, dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
  let t = L2 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy) - (wa + (wb - wa) * t) / 2;
}

/** Coverage masks: Float32Array(GW * GH) per digit, 0..1. */
export const MASKS = [];
for (let d = 0; d < 10; d++) {
  const segs = SPEC[d](), m = new Float32Array(GW * GH);
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    let c = 0;
    for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
      const px = x + (sx + 0.5) / 4, py = y + (sy + 0.5) / 4;
      for (const s of segs) if (capsule(px, py, s) < 0) { c++; break; }
    }
    m[y * GW + x] = c / 16;
  }
  MASKS.push(m);
}
