// The numerals for ukiyoe.js: ten foam letters, cut as a woodblock set.
//
// Each digit is drawn as brush strokes (polylines whose width swells and
// thins like a brush line), and its free ends curl the way a crest does:
// the 6 rises out of its bowl and breaks over at the top, the 2 and 3 start
// in a curling lip, the 1 is a stem under a breaking flag, the 5's flag
// curls up at its tip, the 7 hooks down at its left.
//
// In the face they are the foam: white numerals left in the Prussian body
// of the two great waves (ukiyoe-print.js), the way Hokusai left the paper
// bare for the spray. Each has a sumi keyline, a few pale-blue bubbles in
// its thick strokes, and an offset block: its own shape again, set a
// pixel down and right in deep indigo, as a cheap pull shows a block out of
// register. That block is also the numeral's contrast moat on the blue.
//
// Built once at load (on the device: const tables in flash), one byte a
// pixel over the slot padded by GM.

export const GM = 4;
export const M_NONE = 0, M_KEY = 1, M_SHADOW = 2, M_CORE = 3, M_FOAM = 4;

const DW = 30, DH = 60;   // design box

// ------------------------------------------------------------ stroke builders
// A stroke is { pts: [[x, y, r], ...] } in design units.

const lerp = (a, b, u) => a + (b - a) * u;
function line(ax, ay, bx, by, r0, r1, n = 12) {
  const p = [];
  for (let i = 0; i <= n; i++) { const u = i / n; p.push([lerp(ax, bx, u), lerp(ay, by, u), lerp(r0, r1, u)]); }
  return p;
}
/** Elliptic arc from a0 to a1 (degrees, screen: 0 right, 90 down); radius r0(a, u) or a lerp r0 -> r1. */
function arc(cx, cy, rx, ry, a0, a1, r0, r1, n = 40, rx1 = rx, ry1 = ry) {
  const p = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, a = ((a0 + (a1 - a0) * u) * Math.PI) / 180;
    const R = typeof r0 === 'function' ? r0(a, u) : lerp(r0, r1, u);
    p.push([cx + lerp(rx, rx1, u) * Math.cos(a), cy + lerp(ry, ry1, u) * Math.sin(a), R]);
  }
  return p;
}
/** Quadratic bezier with a radius lerp. */
function quad(ax, ay, cx, cy, bx, by, r0, r1, n = 20) {
  const p = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, v = 1 - u;
    p.push([v * v * ax + 2 * v * u * cx + u * u * bx, v * v * ay + 2 * v * u * cy + u * u * by, lerp(r0, r1, u)]);
  }
  return p;
}
const S = (pts) => ({ pts });
// brush stress: thick where the stroke runs vertical, thin where it runs across
const stress = (thin, thick, tilt = 20) => (a) => thin + (thick - thin) * Math.abs(Math.cos(a - (tilt * Math.PI) / 180));
const ramp3 = (a, b, c, m) => (x, u) => (u < m ? lerp(a, b, u / m) : lerp(b, c, (u - m) / (1 - m)));

// ------------------------------------------------------------ the ten

function six() {
  return [
    S(arc(15.5, 42, 9.8, 13.4, 0, 360, stress(3.3, 5.3), 0, 56)),                     // the bowl
    S(arc(20.5, 41, 15, 32, 180, 262, (a, u) => lerp(5.3, 4.2, u), 0, 24)),           // the face rising
    S(arc(22, 16, 7.2, 7.2, 262, 425, (a, u) => lerp(4.2, 2.1, u), 0, 26, 7.2, 5.6)), // breaking over
  ];
}
const DIGITS = [
  () => [S(arc(15, 30, 10.2, 25.2, 90, 450, stress(3.4, 5.4), 0, 72))],
  () => [
    S(line(18.5, 11, 18.5, 58, 5.0, 5.4)),
    S(arc(12.5, 12.5, 6.0, 6.2, -12, -208, (a, u) => lerp(4.8, 2.2, u), 0, 28)),
    S(quad(8.5, 58, 18.5, 55, 28, 58, 2.5, 2.7)),
  ],
  () => [
    S(arc(15, 17.5, 10, 10.6, 150, 378, ramp3(2.6, 5.2, 5.0, 0.6), 0, 40)),
    S(quad(24, 22.5, 20, 37, 5.5, 53.5, 5.0, 4.4)),
    S(line(4.4, 55.6, 26.8, 55.6, 4.0, 3.8)),
  ],
  () => [
    S(arc(14.2, 15.6, 9.4, 10, 200, 468, ramp3(2.6, 5.0, 3.0, 0.6), 0, 40)),
    S(line(9.6, 28.4, 14.6, 28.4, 3.0, 3.0, 4)),
    S(arc(14.2, 42.6, 11.6, 13.2, 262, 518, ramp3(3.0, 5.6, 2.8, 0.4), 0, 44)),
  ],
  // 4: open-topped, so it never peaks into an A
  () => [
    S(line(17.4, 5.5, 5, 40.5, 3.0, 4.2)),
    S(line(3.6, 42.4, 28.2, 42.4, 3.7, 3.7)),
    S(line(22, 16, 22, 58, 5.2, 5.4)),
  ],
  () => [
    S(quad(10, 6.4, 18, 7, 26.5, 4.4, 3.7, 2.8)),
    S(line(10, 6.4, 8.8, 28.5, 4.3, 3.9)),
    S(arc(14.2, 41.8, 11.2, 12.8, 234, 510, ramp3(3.0, 5.6, 2.6, 0.45), 0, 44)),
  ],
  six,
  () => [
    S(line(9, 6.6, 26.6, 6.6, 3.8, 3.9)),
    S(arc(8.8, 11.2, 4.6, 4.6, 270, 150, (a, u) => lerp(3.8, 2.0, u), 0, 16)),
    S(quad(26.6, 6.6, 18, 26, 12.6, 58, 4.0, 5.4)),
  ],
  // 8: a small loop on a big one, so it never reads 0 or B
  () => [
    S(arc(15, 16.6, 8.4, 10.4, 90, 450, stress(3.0, 4.5), 0, 56)),
    S(arc(15, 42.2, 10.6, 13.6, 270, 630, stress(3.4, 5.3), 0, 60)),
  ],
  // 9: the 6 turned round
  () => six().map((s) => S(s.pts.map(([x, y, r]) => [DW - x, DH - y, r]))),
];

// ------------------------------------------------------------ rasterising

const tmp = { u: 0 };
function segDist(px, py, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
  let u = l2 ? ((px - a[0]) * dx + (py - a[1]) * dy) / l2 : 0;
  u = u < 0 ? 0 : u > 1 ? 1 : u;
  const ex = px - a[0] - u * dx, ey = py - a[1] - u * dy;
  tmp.u = u;
  return Math.sqrt(ex * ex + ey * ey) - (a[2] + (b[2] - a[2]) * u);
}
/** Distance to a set of strokes at a design-space point; sets near.s / near.u (stroke, 0..1 along it). */
function dist(strokes, px, py, near) {
  let d = 1e9;
  for (let s = 0; s < strokes.length; s++) {
    const p = strokes[s].pts, n = p.length - 1;
    for (let i = 1; i <= n; i++) {
      const e = segDist(px, py, p[i - 1], p[i]);
      if (e < d) { d = e; near.s = s; near.u = (i - 1 + tmp.u) / n; }
    }
  }
  return d;
}

/** One size: w x h px for the 30 x 60 design box, `thick` design units added to every radius. */
function build(w, h, thick) {
  const tw = w + 2 * GM, th = h + 2 * GM, k = Math.sqrt((w / DW) * (h / DH));
  const near = { s: 0, u: 0 };
  const glyphs = DIGITS.map((mk) => {
    const body = mk().map((s) => ({ pts: s.pts.map(([x, y, r]) => [x, y, r + thick]) }));
    const D = new Float32Array(tw * th), U = new Float32Array(tw * th), SI = new Int16Array(tw * th);
    for (let y = 0; y < th; y++)
      for (let x = 0; x < tw; x++) {
        const px = ((x - GM + 0.5) / w) * DW, py = ((y - GM + 0.5) / h) * DH, i = y * tw + x;
        D[i] = dist(body, px, py, near) * k; U[i] = near.u; SI[i] = near.s;
      }
    const at = (x, y) => (x < 0 || y < 0 || x >= tw || y >= th ? 9 : D[y * tw + x]);
    const mat = new Uint8Array(tw * th);
    for (let y = 0; y < th; y++)
      for (let x = 0; x < tw; x++) {
        const i = y * tw + x, d = D[i];
        if (d > 0) {
          // the offset block, a pixel down and right (two down: the press slips along the grain)
          if (at(x - 1, y - 1) <= 0 || at(x - 1, y - 2) <= 0 || at(x, y - 2) <= 0) mat[i] = M_SHADOW;
          continue;
        }
        if (d > -0.9 || at(x - 1, y) > 0 || at(x + 1, y) > 0 || at(x, y - 1) > 0 || at(x, y + 1) > 0) { mat[i] = M_KEY; continue; }
        // a few bubbles in the foam where the stroke is thick, never touching the keyline
        const h1 = Math.imul((x * 73856093) ^ (y * 19349663) ^ (SI[i] * 83492791), 0x2c1b3c6d) >>> 0;
        mat[i] = d < -2.7 && (h1 % 100) < 6 && !(x % 2 === 0 && y % 2 === 0) ? M_CORE : M_FOAM;
      }
    return { mat };
  });
  return { w, h, tw, th, glyphs };
}

export const HOUR = build(28, 50, 0.35);
export const MIN = build(18, 38, 0.95);
/** Digit slots: top-left of the design box and its size. Hours in the great wave, minutes in the far one. */
export const SLOTS = [
  { x: 5, y: 19, S: HOUR }, { x: 35, y: 19, S: HOUR },
  { x: 119, y: 31, S: MIN }, { x: 138, y: 31, S: MIN },
];
export const FLASH_BYTES = 10 * (HOUR.tw * HOUR.th + MIN.tw * MIN.th);
