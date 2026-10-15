// Domino Run letterforms: each digit is a domino ARTIST'S trail, not a font.
// One continuous run where the figure allows it; where it does not (1's foot,
// 3's two bowls, 4's bar, 8's two loops) the trail SPLITS, the way real
// domino builders fork a line, and the wave runs down both branches at once.
//
// Drawn on a 4 x 6 cell (u right, v down = away from -> toward the viewer).
// A stroke is a dense polyline; `from` names the stroke it forks off.

const arc = (cx, cy, rx, ry, a0, a1, n = 28) => {
  const out = [];
  for (let k = 0; k <= n; k++) { const a = ((a0 + (a1 - a0) * (k / n)) * Math.PI) / 180; out.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]); }
  return out;
};
const line = (...pts) => pts;
const cat = (...parts) => parts.flat();

// Every trail starts where the wave enters (marked first point).
export const GLYPHS = {
  0: [{ pts: arc(2, 3, 1.62, 2.55, -98, 246, 60) }],
  1: [{ pts: line([2.25, 0.2], [2.25, 3], [2.25, 5.75]) },
      { pts: line([2.25, 0.2], [1.6, 0.7], [1.0, 1.15]), from: 0 },
      { pts: line([2.25, 5.75], [0.95, 5.75]), from: 0 },
      { pts: line([2.25, 5.75], [3.55, 5.75]), from: 0 }],
  2: [{ pts: cat(arc(2, 1.85, 1.55, 1.55, 195, 360 + 28, 40), line([1.9, 4.1], [0.45, 5.7], [2, 5.72], [3.7, 5.72])) }],
  3: [{ pts: cat(arc(2, 1.6, 1.45, 1.3, -160, 90, 44), line([2, 2.9], [0.95, 2.9])) },
      { pts: arc(2, 4.38, 1.65, 1.42, -90, 160, 44), from: 0 }],
  4: [{ pts: line([2.85, 0.25], [2.85, 4.25]) },
      { pts: line([2.85, 0.25], [1.6, 2.1], [0.3, 4.2], [2.2, 4.22]), from: 0 },
      { pts: line([2.85, 4.25], [2.85, 5.8]), from: 0 },
      { pts: line([2.85, 4.25], [3.8, 4.25]), from: 0 }],
  5: [{ pts: cat(line([3.55, 0.3], [2.2, 0.3], [0.85, 0.3], [0.78, 1.5]), arc(1.9, 3.95, 1.75, 1.72, -132, 150, 44)) }],
  6: [{ pts: cat(line([3.35, 0.55], [2.4, 0.22]), arc(2.35, 3.9, 1.9, 3.65, -100, -180, 12).slice(1), arc(2.05, 4.2, 1.6, 1.58, 180, 180 - 300, 50)) }],
  7: [{ pts: line([0.3, 0.3], [2, 0.3], [3.7, 0.3], [2.6, 3], [1.55, 5.8]) },
      { pts: line([2.95, 2.6], [1.6, 2.6]), from: 0 }],
  8: [{ pts: cat(arc(2, 1.55, 1.32, 1.28, -90, 90, 30), arc(2, 4.38, 1.66, 1.5, -90, -428, 56).slice(1)) },
      { pts: arc(2, 1.55, 1.32, 1.28, -90, -266, 30), from: 0 }],
  9: [{ pts: cat(arc(1.95, 1.85, 1.55, 1.6, 270, 360, 16), arc(-0.3, 1.85, 3.8, 3.95, 0, 72, 16).slice(1)) },
      { pts: arc(1.95, 1.85, 1.55, 1.6, 270, 40, 40), from: 0 }],
};

function densify(pts, step = 0.04) {
  const out = [pts[0]];
  for (let k = 1; k < pts.length; k++) {
    const [ax, ay] = pts[k - 1], [bx, by] = pts[k], L = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.ceil(L / step));
    for (let j = 1; j <= n; j++) out.push([ax + ((bx - ax) * j) / n, ay + ((by - ay) * j) / n]);
  }
  return out;
}
// round sharp corners: a moving average over ~0.5 cell
function smooth(pts, r = 6) {
  const out = [];
  for (let k = 0; k < pts.length; k++) {
    let sx = 0, sy = 0, n = 0;
    for (let j = Math.max(0, k - r); j <= Math.min(pts.length - 1, k + r); j++) { sx += pts[j][0]; sy += pts[j][1]; n++; }
    out.push(k === 0 || k === pts.length - 1 ? pts[k] : [sx / n, sy / n]);
  }
  return out;
}

/**
 * Lay a digit out as dominoes. sp: spacing in cell units. Returns
 *   { doms: [{u, v, yaw, gi, s}], strokes: [{off, end}], maxEnd }
 * gi is the domino's step count from the start of the wave; yaw the heading
 * (radians, in u/v axes) the domino falls along.
 */
export function layDigit(d, sp) {
  const strokes = [], doms = [];
  GLYPHS[d].forEach((S, si) => {
    const pts = smooth(densify(S.pts));
    // cumulative length
    const cum = [0];
    for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
    const L = cum[cum.length - 1];
    let off = 0, startD = 0;
    if (S.from !== undefined) {
      // fork: find the parent domino nearest our first point
      const par = doms.filter((q) => q.s === S.from);
      let best = par[0], bd = 1e9;
      for (const q of par) { const dd = Math.hypot(q.u - pts[0][0], q.v - pts[0][1]); if (dd < bd) { bd = dd; best = q; } }
      off = best.gi + 1; startD = sp * 0.9;
    }
    let k = 0, seg = 0, n = 0;
    for (let dist = startD; dist <= L + 1e-6; dist += sp) {
      while (seg < cum.length - 2 && cum[seg + 1] < dist) seg++;
      const t = (dist - cum[seg]) / Math.max(1e-6, cum[seg + 1] - cum[seg]);
      const u = pts[seg][0] + (pts[seg + 1][0] - pts[seg][0]) * t, v = pts[seg][1] + (pts[seg + 1][1] - pts[seg][1]) * t;
      // tangent over a short window
      const a = pointAt(pts, cum, Math.max(0, dist - 0.15)), b = pointAt(pts, cum, Math.min(L, dist + 0.15));
      // skip a domino that would collide with one already laid (8's waist)
      let clash = false;
      for (const q of doms) if (Math.hypot(q.u - u, q.v - v) < sp * 0.7) { clash = true; break; }
      if (!clash) { doms.push({ u, v, yaw: Math.atan2(b[1] - a[1], b[0] - a[0]), gi: off + k, s: si }); n++; }
      k++;
    }
    strokes.push({ off, end: off + k - 1 });
  });
  let maxEnd = 0;
  for (const s of strokes) maxEnd = Math.max(maxEnd, s.end);
  return { doms, strokes, maxEnd };
}
function pointAt(pts, cum, dist) {
  let lo = 0, hi = cum.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] < dist) lo = m; else hi = m; }
  const t = (dist - cum[lo]) / Math.max(1e-6, cum[hi] - cum[lo]);
  return [pts[lo][0] + (pts[hi][0] - pts[lo][0]) * t, pts[lo][1] + (pts[hi][1] - pts[lo][1]) * t];
}
