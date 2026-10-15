// Lancework digits for the fireworks face: each digit is the path of the lath
// frame a pyrotechnician nails lances along. A digit is one or more strokes
// (polylines in a 20 x 34 box, y down); lances sit on them at an even step.
// Exports per digit: dense path samples [x, y, s] (s = arc length, strokes
// concatenated) and the lances [x, y, s], deduplicated where strokes meet.

const W = 20, H = 34;

function arc(cx, cy, rx, ry, a0, a1, out = []) {
  const n = Math.max(4, Math.ceil(Math.abs(a1 - a0) / 4));
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + (a1 - a0) * i / n) * Math.PI) / 180;
    out.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return out;
}
function bez(p0, c, p1, out = []) {
  for (let i = 0; i <= 16; i++) {
    const t = i / 16, u = 1 - t;
    out.push([u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]]);
  }
  return out;
}
const line = (a, b, out = []) => { out.push(a, b); return out; };
const cat = (...parts) => parts.flat();

// strokes per digit; each stroke [[x, y], ...]; `closed` strokes loop
const DEFS = {
  0: [{ pts: arc(10, 17, 10, 17, -90, 270), closed: true }],
  1: [{ pts: cat(line([4.5, 7.5], [12, 0]), line([12, 0], [12, 34])) }, { pts: line([6, 34], [18, 34]) }],
  2: [{ pts: cat(arc(10, 10, 9.5, 9.5, 195, 400), bez([17.3, 16.1], [7, 24], [0.5, 34]), line([0.5, 34], [20, 34])) }],
  3: [{ pts: cat(arc(10, 8.6, 8.6, 8.6, 200, 450), arc(10, 25.5, 9.5, 8.5, -90, 152)) }],
  4: [{ pts: cat(line([14.5, 34], [14.5, 0]), line([14.5, 0], [0, 24]), line([0, 24], [20, 24])) }],
  5: [{ pts: cat(line([18.5, 0], [3.5, 0]), line([3.5, 0], [2.4, 15.2]), arc(9.6, 23.2, 10, 10.8, -132, 150)) }],
  6: [{ pts: cat(bez([17, 1], [1.5, 4], [0, 24]), arc(10, 24, 10, 10, 180, -180)) }],
  7: [{ pts: cat(line([0, 0], [20, 0]), bez([20, 0], [9, 13], [7, 34])) }],
  8: [{ pts: arc(10, 8, 7.8, 8, 90, 450), closed: true }, { pts: arc(10, 25, 9.6, 9, -90, 270), closed: true }],
  9: [{ pts: cat(arc(10, 10, 10, 10, 0, -360), bez([20, 10], [20, 29], [4, 34])) }],
};

const STEP = 3.6;

function build(strokes) {
  const dense = [], lances = [];
  let s0 = 0;
  for (const st of strokes) {
    const p = st.pts;
    // cumulative length
    const cum = [0];
    for (let i = 1; i < p.length; i++) cum.push(cum[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
    const L = cum[cum.length - 1];
    const at = (s) => {
      let i = 1;
      while (i < cum.length - 1 && cum[i] < s) i++;
      const t = cum[i] > cum[i - 1] ? (s - cum[i - 1]) / (cum[i] - cum[i - 1]) : 0;
      return [p[i - 1][0] + (p[i][0] - p[i - 1][0]) * t, p[i - 1][1] + (p[i][1] - p[i - 1][1]) * t];
    };
    for (let s = 0; s <= L; s += 0.5) { const q = at(s); dense.push([q[0], q[1], s0 + s]); }
    const n = Math.max(1, Math.round(L / STEP));
    const cnt = st.closed ? n : n + 1;
    for (let k = 0; k < cnt; k++) {
      const s = (L * k) / n, q = at(s);
      if (lances.some((l) => Math.hypot(l[0] - q[0], l[1] - q[1]) < 1.6)) continue;
      lances.push([q[0], q[1], s0 + s]);
    }
    s0 += L;
  }
  return { dense, lances, len: s0 };
}

export const GLYPHS = Object.fromEntries(Object.entries(DEFS).map(([k, v]) => [k, build(v)]));
export const GW = W, GH = H;
