// calder: the numerals as bent wire.
//
// Every numeral is ONE length of wire, bent by hand: it starts at the hang
// point at its top (where the hook holds it), runs as a single stroke with
// round bends, hairpins where the wire doubles back on itself (the flag of
// the 1, the left terminal of the 2 and 3, the bars of 4, 5, 7), each turned
// end balled with pliers, and a wrapped joint where it meets itself again
// (0, 4, 8). Designed on a 20 x 36 grid (centre lines),
// scaled per slot.
//
// Each glyph is stored the way the sculpture is made: a list of N segment
// headings and lengths from the hang point (a turtle path), so the hanging
// (swing, stretch) is just a rotation and scale of the turtle. Free ends are
// balled or curled over; the hang point is the top. The minute turn reels
// the wire onto a tight flat coil (coilHeadings) and out again
// (calder-wire.js). On the device: 10 x 128 x (int16 heading + uint8
// length) = ~3.8 KB of flash.

export const GW = 20, GH = 36;
export const N = 128;

const D = Math.PI / 180;

// ---------------------------------------------------------------- path language
// ['M', x, y]                    start (the hang point)
// ['L', x, y]                    straight run
// ['A', cx, cy, r, a0, a1]       arc, angles in degrees (y down: 90 = down), linear from a0 to a1
// ['E', cx, cy, rx, ry, a0, a1]  elliptic arc
// ['C', x1, y1, x2, y2, x, y]    cubic bezier from the current point
// ['G', cx, cyT, cyB, rxT, rxB, ryT, ryB, t0, t1]  a figure-eight (Gerono), for the 8

function dense(cmds) {
  const pts = [];
  let cx = 0, cy = 0;
  const push = (x, y) => { pts.push([x, y]); cx = x; cy = y; };
  for (const c of cmds) {
    const k = c[0];
    if (k === 'M') push(c[1], c[2]);
    else if (k === 'L') {
      const [, x, y] = c, n = Math.max(2, Math.ceil(Math.hypot(x - cx, y - cy) / 0.05));
      const x0 = cx, y0 = cy;
      for (let i = 1; i <= n; i++) push(x0 + (x - x0) * i / n, y0 + (y - y0) * i / n);
    } else if (k === 'A' || k === 'E') {
      const [ox, oy, rx, ry, a0, a1] = k === 'A' ? [c[1], c[2], c[3], c[3], c[4], c[5]] : c.slice(1);
      const n = Math.max(4, Math.ceil(Math.abs(a1 - a0) * D * Math.max(rx, ry) / 0.05));
      for (let i = 0; i <= n; i++) {
        const a = (a0 + (a1 - a0) * i / n) * D;
        push(ox + rx * Math.cos(a), oy + ry * Math.sin(a));
      }
    } else if (k === 'C') {
      const [, x1, y1, x2, y2, x, y] = c, x0 = cx, y0 = cy;
      for (let i = 1; i <= 400; i++) {
        const t = i / 400, u = 1 - t;
        push(u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x,
          u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y);
      }
    } else if (k === 'K') {
      // a curl from the current point and heading: radius r tightening to r * shrink, turning `turn` degrees (+ clockwise)
      const [, r, turn, shrink = 1] = c;
      const n0 = pts.length;
      const h = Math.atan2(cy - pts[n0 - 2][1], cx - pts[n0 - 2][0]);
      const sg = Math.sign(turn), ox = cx + r * Math.cos(h + sg * Math.PI / 2), oy = cy + r * Math.sin(h + sg * Math.PI / 2);
      const a0 = h - sg * Math.PI / 2, n = Math.max(8, Math.ceil(Math.abs(turn) * D * r / 0.03));
      for (let i = 1; i <= n; i++) {
        const u = i / n, a = a0 + turn * D * u, rr = r * (1 + (shrink - 1) * u);
        push(ox + rr * Math.cos(a), oy + rr * Math.sin(a));
      }
    } else if (k === 'G') {
      const [, ox, cyT, cyB, rxT, rxB, ryT, ryB, t0, t1] = c;
      const n = 3000;
      for (let i = 0; i <= n; i++) {
        const t = t0 + (t1 - t0) * i / n, ct = Math.cos(t), up = ct > 0;
        push(ox + (up ? rxT : rxB) * Math.sin(2 * t) * 0.5, (up ? cyT : cyB) - (up ? ryT : ryB) * ct);
      }
    }
  }
  // drop exact duplicates
  return pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1]);
}

/** Resample to N uniform-arc-length segments: headings (unwrapped) and chord lengths. */
function build(cmds) {
  const p = dense(cmds);
  const cum = [0];
  for (let i = 1; i < p.length; i++) cum.push(cum[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
  const L = cum[cum.length - 1];
  const q = [];
  let j = 0;
  for (let i = 0; i <= N; i++) {
    const s = (L * i) / N;
    while (j < p.length - 2 && cum[j + 1] < s) j++;
    const u = (s - cum[j]) / (cum[j + 1] - cum[j] || 1);
    q.push([p[j][0] + (p[j + 1][0] - p[j][0]) * u, p[j][1] + (p[j + 1][1] - p[j][1]) * u]);
  }
  const head = new Float32Array(N), len = new Float32Array(N);
  let prev = null;
  for (let i = 0; i < N; i++) {
    const dx = q[i + 1][0] - q[i][0], dy = q[i + 1][1] - q[i][1];
    let a = Math.atan2(dy, dx);
    if (prev !== null) {
      let d = a - prev;
      while (d > Math.PI + 1e-6) d -= 2 * Math.PI;
      while (d <= -Math.PI + 1e-6) d += 2 * Math.PI;   // an exact hairpin turns clockwise (+pi)
      a = prev + d;
    }
    head[i] = a; len[i] = Math.hypot(dx, dy); prev = a;
  }
  return { head, len, L, x0: q[0][0], y0: q[0][1] };
}

// ---------------------------------------------------------------- the ten numerals
// Hang points sit at the top, x 10-13. Terminals end in a small curl (the
// wire's end turned over with pliers): reads as a ball terminal at size.

const E = 1.9, C = 1.8;      // the hang eye's radius; a terminal curl's radius
const PATHS = [
  // 0: the eye, one oval loop, the end wrapped past the start
  [['M', 9.6, 1.5], ['L', 10, 1.5], ['E', 10, 18, 8.5, 16.5, -90, 290]],
  // 1: the eye, a hairpin flag (balled at its tip), the stem, a foot curled up at its end
  [['M', 12.8, 1.2], ['L', 12.5, 1.5], ['L', 4.5, 8.5], ['K', 1.3, 360], ['L', 12.5, 1.5], ['L', 12.5, 34.5],
    ['L', 7.5, 34.5], ['L', 15.5, 34.5], ['K', C, -300, 0.6]],
  // 2: the eye, left terminal balled, back over the top, down the diagonal, the base curled up
  [['M', 10.4, 2], ['A', 10, 9.5, 7.5, -87, -90], ['A', 10, 9.5, 7.5, -90, -172], ['K', 1.3, -360],
    ['A', 10, 9.5, 7.5, -172, 35], ['C', 14, 18, 6, 24, 2, 34.5], ['L', 16.5, 34.5], ['K', C, -300, 0.6]],
  // 3: the eye, left terminal balled, the upper bowl, a loop at the waist, the lower bowl curling in
  [['M', 10.4, 1.5], ['A', 10, 8.5, 7, -87, -90], ['A', 10, 8.5, 7, -90, -160], ['K', 1.3, -360],
    ['A', 10, 8.5, 7, -160, 90], ['A', 9, 17, 1.6, -90, -270], ['A', 10, 26, 8.5, -90, 140], ['K', C, 300, 0.6]],
  // 4: the eye, down the diagonal, the crossbar (balled), back and down the stem, up to the top (wrapped)
  [['M', 14.3, 1.0], ['L', 14, 1.5], ['L', 1.5, 24], ['L', 18.5, 24], ['K', 1.3, -360], ['L', 14, 24],
    ['L', 14, 34.5], ['L', 14, 1.5]],
  // 5: the eye, the flag (balled at its right end), down the side, the bowl, curl
  [['M', 9.6, 1.5], ['L', 10, 1.5], ['L', 17, 1.5], ['K', 1.3, 360], ['L', 4, 1.5], ['L', 3.5, 15],
    ['C', 7, 12, 18.5, 13, 18.5, 23.5], ['C', 18.5, 34, 7, 37, 3.5, 30.5], ['K', C, 300, 0.6]],
  // 6: the eye, sweeping down the left into the bowl, round and closed
  [['M', 13.5, 1.5], ['L', 13, 1.5], ['C', 7, 2, 2.5, 9, 2.5, 26.5], ['A', 10.5, 26.5, 8, 180, -170]],
  // 7: the eye, a hairpin at the left end of the bar (balled), the bar, the long stroke curled at its foot
  [['M', 10.4, 1.5], ['L', 10, 1.5], ['L', 2.5, 1.5], ['K', 1.3, -360], ['L', 18.5, 1.5],
    ['C', 14, 12, 10, 22, 8.8, 33], ['K', C, 300, 0.6]],
  // 8: the eye, a figure eight, crossing at the waist, wrapped past the top
  [['M', 9.6, 1.5], ['L', 10, 1.5], ['G', 10, 17, 17, 15, 17, 15.5, 17.5, 0, 2 * Math.PI + 0.25]],
  // 9: the eye, the bowl from its top round to the right, the tail down, a curl
  [['M', 9.6, 1.5], ['L', 10, 1.5], ['A', 10, 9.5, 8, -90, 360], ['C', 18, 22, 17.5, 30, 10, 34.5],
    ['L', 7, 34], ['K', C, 300, 0.6]],
];

export const GLYPHS = PATHS.map(build);

// ---------------------------------------------------------------- the coil
// The wire wound into a flat spiral, outer end at the hook, clockwise (so it
// hangs below the hook): heading(s) = (2 pi / p)(R - r(s)), r(s)^2 = R^2 - p s / pi.

/** Spiral headings for a wire of length L (pitch p, inner radius r0), into `out` (Float32Array N). */
export function coilHeadings(L, p, r0, out) {
  const R2 = r0 * r0 + (p * L) / Math.PI, R = Math.sqrt(R2), k = (2 * Math.PI) / p;
  for (let i = 0; i < N; i++) {
    const s = (L * (i + 0.5)) / N;
    out[i] = k * (R - Math.sqrt(Math.max(r0 * r0, R2 - (p * s) / Math.PI)));
  }
  return out;
}
