// The letters of "flytrap": ten numerals drawn as Venus flytrap leaves.
// Each digit is one or two centre lines (a plant's growth path: straight
// stems, oval loops, quadratic curves), stroked as a trap leaf: full width
// along the body, tapering to a pointed leaf tip at every open end. The
// leaf has a dark keyline, a green rim and, while the trap is open, its red
// interior; outside the rim stand the cilia (the trap's teeth), radial
// spikes every 3 px of arc, kept out of the closed counters so a 0, 4, 6, 8
// or 9 never fills in.
//
// At load each digit becomes three byte fields over its box plus a margin,
// at two sizes (hours and minutes):
//   E   signed distance to the leaf's edge, 1/8 px (negative inside)
//   S   arc length of the nearest centre-line point, px (the snap wave runs along it)
//   F   bit 0: a tooth column, bit 1: no teeth here (a counter or a leaf tip),
//       bit 2: the spine (within 0.75 px of the centre line: the seam of a shut trap)
// 3 bytes a pixel: hours 41 x 66, minutes 34 x 52; 10 digits: ~134 KB of flash.

export const M = 5;    // field margin round the glyph box, px

const rad = (a) => (a * Math.PI) / 180;
/** An elliptic arc in glyph units, angles in degrees (0 right, 90 down: increasing is clockwise on screen). */
function el(cx, cy, rx, ry, a0, a1, steps = 48) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const a = rad(a0 + ((a1 - a0) * i) / steps);
    pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return pts;
}
/** A quadratic curve. */
function q(p0, p1, p2, steps = 24) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, u = 1 - t;
    pts.push([u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]]);
  }
  return pts;
}
const ln = (a, b, steps = 12) => q(a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], b, steps);
const cat = (...parts) => parts.reduce((a, p) => a.concat(a.length ? p.slice(1) : p), []);

// Centre lines in a 10 x 18 unit box, inset 1.4 units (half a stroke) from its edges.
// Each stroke: { p: points, closed }.
const SKEL = [
  /* 0 */ [{ p: el(5, 9, 3.6, 7.6, -90, 270, 72), closed: true }],
  /* 1 */ [{ p: cat(q([2.4, 4.9], [4.4, 3.6], [6.0, 1.4], 10), q([6.0, 1.4], [5.5, 9], [6.0, 16.6], 20)), closed: false }],
  /* 2 */ [{ p: cat(el(5, 5.1, 3.6, 3.7, 180, 380, 30), q([8.38, 6.37], [6.2, 10.8], [1.4, 16.6], 20), ln([1.4, 16.6], [8.6, 16.6])), closed: false }],
  /* 3 */ [{ p: cat(el(5, 4.85, 3.5, 3.45, 205, 450, 36), el(5, 12.55, 3.6, 4.05, 270, 518, 40)), closed: false }],
  /* 4 */ [{ p: cat(ln([6.7, 16.6], [6.7, 1.4], 16), ln([6.7, 1.4], [1.4, 11.7], 14), ln([1.4, 11.7], [8.6, 11.7], 10)), closed: false }],
  /* 5 */ [{ p: cat(ln([8.4, 1.4], [2.3, 1.4], 8), ln([2.3, 1.4], [2.0, 7.7], 8), el(4.9, 11.75, 3.7, 4.85, 233, 518, 40)), closed: false }],
  /* 6 */ [{ p: cat(q([7.9, 1.5], [1.2, 1.9], [1.4, 12.2], 24), el(5, 12.2, 3.6, 4.4, 180, -180, 56)), closed: false }],
  /* 7 */ [{ p: cat(ln([1.4, 1.4], [8.6, 1.4], 10), q([8.6, 1.4], [6.0, 7.4], [3.9, 16.6], 22)), closed: false }],
  /* 8 */ [{ p: el(5, 4.85, 3.15, 3.45, 90, 450, 44), closed: true }, { p: el(5, 12.6, 3.7, 4.0, -90, 270, 52), closed: true }],
  /* 9 */ [{ p: cat(q([2.1, 16.5], [8.8, 16.1], [8.6, 5.8], 24), el(5, 5.8, 3.6, 4.4, 0, -360, 56)), closed: false }],
];

/**
 * Build the fields of all ten digits for a glyph box gw x gh px and a leaf
 * half-width hw px. Returns { gw, gh, fw, fh, hw, E[10], S[10], F[10], L[10], root[10], tips[10] }.
 */
export function buildSet(gw, gh, hw) {
  const fw = gw + 2 * M, fh = gh + 2 * M, sx = gw / 10, sy = gh / 18;
  const set = { gw, gh, fw, fh, hw, E: [], S: [], F: [], L: [], root: [], tips: [] };
  for (let d = 0; d < 10; d++) {
    // the strokes in field px, with cumulative arc length
    const strokes = [];
    let s0 = 0;
    for (const st of SKEL[d]) {
      const p = st.p.map(([x, y]) => [x * sx + M, y * sy + M]);
      const acc = [0];
      for (let k = 1; k < p.length; k++) acc.push(acc[k - 1] + Math.hypot(p[k][0] - p[k - 1][0], p[k][1] - p[k - 1][1]));
      strokes.push({ p, acc, len: acc[acc.length - 1], s0, closed: st.closed });
      s0 += acc[acc.length - 1];
    }
    set.L.push(s0);
    const N = fw * fh, E = new Int8Array(N), S = new Uint8Array(N), F = new Uint8Array(N);
    const TAPER = 8, TIP = 0.42;
    for (let j = 0; j < fh; j++)
      for (let i = 0; i < fw; i++) {
        const px = i + 0.5, py = j + 0.5;
        let best = 1e9, bs = 0, bd = 0, cap = false, vx = -1, vy = 0;
        for (const st of strokes) {
          const p = st.p;
          for (let k = 1; k < p.length; k++) {
            const ax = p[k - 1][0], ay = p[k - 1][1], dx = p[k][0] - ax, dy = p[k][1] - ay, l2 = dx * dx + dy * dy;
            let u = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
            u = u < 0 ? 0 : u > 1 ? 1 : u;
            const ex = px - ax - u * dx, ey = py - ay - u * dy, dist = Math.sqrt(ex * ex + ey * ey);
            const sl = st.acc[k - 1] + u * (st.acc[k] - st.acc[k - 1]);
            let w = hw;
            if (!st.closed) {
              const tipd = Math.min(sl, st.len - sl);
              if (tipd < TAPER) { const t = tipd / TAPER; w = hw * (TIP + (1 - TIP) * t * (2 - t)); }
            }
            const e = dist - w;
            if (e < best) {
              best = e; bs = st.s0 + sl; bd = dist;
              cap = !st.closed && ((k === 1 && u === 0) || (k === p.length - 1 && u === 1));
              vx = u === 0 ? ax : u === 1 ? p[k][0] : -1; vy = u === 0 ? ay : p[k][1];
            }
          }
        }
        const v = Math.round(best * 8), n = j * fw + i;
        E[n] = v < -127 ? -127 : v > 127 ? 127 : v;
        S[n] = Math.min(255, Math.round(bs));
        let fl = 0;
        // round a corner the teeth fan out: their phase is the arc length along the rim there
        const ph = vx >= 0 && bd > 0.5 ? bs + Math.atan2(py - vy, px - vx) * (hw + 1.5) + 300 : bs;
        if (ph % 3 < 1.15) fl |= 1;
        if (cap) fl |= 2;
        if (bd < 0.75) fl |= 4;
        F[n] = fl;
      }
    // closed counters: outside the leaf but not reachable from the field's border
    const seen = new Uint8Array(N), stack = [];
    for (let i = 0; i < fw; i++) { stack.push(i, (fh - 1) * fw + i); }
    for (let j = 0; j < fh; j++) { stack.push(j * fw, j * fw + fw - 1); }
    while (stack.length) {
      const n = stack.pop();
      if (seen[n] || E[n] <= 0) continue;
      seen[n] = 1;
      const i = n % fw, j = (n / fw) | 0;
      if (i > 0) stack.push(n - 1);
      if (i < fw - 1) stack.push(n + 1);
      if (j > 0) stack.push(n - fw);
      if (j < fh - 1) stack.push(n + fw);
    }
    for (let n = 0; n < N; n++) if (E[n] > 0 && !seen[n]) F[n] |= 2;
    set.E.push(E); set.S.push(S); set.F.push(F);
    // the root: the lowest centre-line point (where the stalk meets the leaf), field px
    let rx = 0, ry = -1;
    for (const st of strokes) for (const [x, y] of st.p) if (y > ry + 0.01 || (Math.abs(y - ry) < 0.01 && Math.abs(x - fw / 2) < Math.abs(rx - fw / 2))) { rx = x; ry = y; }
    set.root.push([rx, ry]);
    // leaf tips (open ends) where a fly can be caught: [x, y, s]
    const tips = [];
    for (const st of strokes) if (!st.closed) {
      tips.push([st.p[0][0], st.p[0][1], st.s0]);
      tips.push([st.p[st.p.length - 1][0], st.p[st.p.length - 1][1], st.s0 + st.len]);
    }
    if (!tips.length) for (const st of strokes) { const k = (st.p.length * 0.12) | 0; tips.push([st.p[k][0], st.p[k][1], st.s0 + st.acc[k]]); }
    set.tips.push(tips);
  }
  return set;
}
