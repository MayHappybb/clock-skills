// The frog a finger draws in the fogged pane at the hour: one outline for the
// body, two round glasses, a bridge, a smile, two dabbed pupils. Drawn in the
// empty bottom-left of the pane (x 2..28, y 38..60), bold, about 26 px wide.
//
// frogField() precomputes, per pixel, the distance to the line and the
// finger's arc-length position (0..1) when it first passes, so the wiping is
// a threshold on time.

const arc = (cx, cy, rx, ry, a0, a1, n = 28) => {
  const pts = [];
  for (let i = 0; i <= n; i++) { const a = ((a0 + (a1 - a0) * (i / n)) * Math.PI) / 180; pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]); }
  return pts;
};

// strokes in the order the finger draws them
export const FROG = [
  arc(15, 50.5, 12.6, 9, 200, -20, 40),          // body: from upper left, round the bottom, to upper right
  arc(8.6, 43, 4.6, 4.6, 0, -360, 26),          // left glass
  [[13.2, 42.6], [16.8, 42.6]],                  // bridge
  arc(21.4, 43, 4.6, 4.6, 180, 540, 26),        // right glass
  arc(15, 49.2, 5.4, 4.2, 25, 155, 14),         // smile
  arc(9.4, 43.6, 0.6, 0.6, 0, 360, 6),          // pupils (dabs)
  arc(22.2, 43.6, 0.6, 0.6, 0, 360, 6),
];

/** Per pixel: d (distance to the line), s (finger progress 0..1 when it first passes there). */
export function frogField(W, H) {
  const segs = [];
  let total = 0;
  for (const st of FROG) {
    for (let i = 1; i < st.length; i++) {
      const [ax, ay] = st[i - 1], [bx, by] = st[i], L = Math.hypot(bx - ax, by - ay);
      segs.push([ax, ay, bx, by, total, L]);
      total += L;
    }
    total += 4; // the finger lifts between strokes
  }
  const d = new Float32Array(W * H).fill(99), s = new Float32Array(W * H).fill(9);
  for (const [ax, ay, bx, by, s0, L] of segs) {
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-6;
    for (let y = Math.max(0, Math.floor(Math.min(ay, by) - 4)); y <= Math.min(H - 1, Math.ceil(Math.max(ay, by) + 4)); y++) {
      for (let x = Math.max(0, Math.floor(Math.min(ax, bx) - 4)); x <= Math.min(W - 1, Math.ceil(Math.max(ax, bx) + 4)); x++) {
        const u = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2));
        const e = Math.hypot(x - ax - u * dx, y - ay - u * dy), p = y * W + x;
        if (e < d[p]) d[p] = e;
        if (e < 2.6) { const ss = (s0 + u * L) / total; if (ss < s[p]) s[p] = ss; }
      }
    }
  }
  return { d, s };
}
