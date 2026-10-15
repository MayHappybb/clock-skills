// The ten formations for synchro.js: each numeral is a chain of swimmers
// floating on their backs, side by side, holding hands. A digit is drawn as
// pen strokes; swimmers are spaced along each stroke one arm-span apart,
// each lying across the stroke (body along the stroke's normal), so the
// band of bodies is the numeral's ink and the line of joined hands is its
// spine. Heads point into the counters, so every bowl is lined with a ring
// of gold caps: a little Busby Berkeley flower.
//
// Closed strokes circulate: the ring of the 0 and the bowls of 6 and 9 turn
// like carousels, and the 8 is one figure-of-eight circuit whose swimmers
// pass through the waist head first, turning from one bowl's centre to the
// other's (the swimmer counts are chosen so the two passes through the
// waist alternate). The numeral's shape never changes; its people move.
//
// Cell coordinates: 0..CW across, 0..CH down. Each stroke is resampled
// every 0.5 px into a table of position and head direction, so a swimmer's
// place at any arc length is a lookup and a lerp.

export const CW = 29, CH = 52, SP = 6.0;
const L = 4.8, R = 24.2, T = 4.8, B = 47.2, MX = 14.5;
const STEP = 0.5;

/** Points on an ellipse arc, screen angles in degrees (0 right, 90 down; increasing is clockwise on screen). */
function arc(cx, cy, rx, ry, a0, a1) {
  const pts = [], n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / 2));
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return pts;
}
function run(x0, y0, x1, y1) {
  const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 1)), pts = [];
  for (let i = 0; i <= n; i++) pts.push([x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n]);
  return pts;
}
// A segment: { pts, side }. side +1: heads on the left of travel (dy, -dx);
// -1: on the right. A stroke: { segs, closed, speed (px/s along the path) }.
const seg = (pts, side) => ({ pts, side });

const SIX = [
  { segs: [seg(arc(MX + 5.2, 35, 14.9, 29, 283, 196), 1)], closed: false },          // the hook
  { segs: [seg(arc(MX, 35.6, 9.7, 11.6, 180, -180), 1)], closed: true, speed: 1.3 },  // the bowl, turning
];
const turn = (strokes) => strokes.map((s) => ({ ...s, segs: s.segs.map((g) => ({ ...g, pts: g.pts.map(([x, y]) => [CW - x, CH - y]) })) }));

const STROKES = [
  // 0: an oval ring, heads in, turning
  [{
    segs: [seg([...arc(MX, T + 9.7, 9.7, 9.7, 270, 180), ...run(L, T + 9.7, L, B - 9.7).slice(1),
      ...arc(MX, B - 9.7, 9.7, 9.7, 180, 0).slice(1), ...run(R, B - 9.7, R, T + 9.7).slice(1),
      ...arc(MX, T + 9.7, 9.7, 9.7, 360, 270).slice(1)], 1)],
    closed: true, speed: 1.3,
  }],
  // 1: flag and stem, heads under the flag and left of the stem
  [{ segs: [seg(run(6, 15, 16, T), -1), seg(run(16, T, 16, B), -1)], closed: false }],
  // 2: the arch, the diagonal, the floor
  [{
    segs: [seg(arc(MX, T + 9.4, 9.6, 9.4, 182, 380), -1), seg(run(MX + 9.6 * Math.cos(0.35), T + 9.4 + 9.4 * Math.sin(0.35), L, B), -1)],
    closed: false,
  }, { segs: [seg(run(L + 5.6, B, R, B), 1)], closed: false }],
  // 3: two bowls open to the left
  [{ segs: [seg(arc(MX - 0.5, T + 10.2, 9.4, 10.2, 205, 460), -1)], closed: false },
    { segs: [seg(arc(MX, 36.4, 9.7, 10.8, 290, 518), -1)], closed: false }],
  // 4: open-topped, so it cannot close into an A: a vertical left arm that
  // stops short of the top, the bar, and a full-height stem on the right
  // with a clear gap between arm and stem at the top
  [{ segs: [seg(run(L + 0.5, T + 7, L + 0.5, 31), 1), seg(run(L + 0.5, 31, 13.5, 31), 1)], closed: false },
    { segs: [seg(run(19.6, T - 1, 19.6, B), -1)], closed: false }],
  // 5: the flag, the drop, the bowl
  [{ segs: [seg(run(R, T, L + 1, T), 1), seg(run(L + 1, T, L + 0.5, 23.5), 1)], closed: false },
    { segs: [seg(arc(MX - 0.3, 35, 9.7, 12.2, 250, 512), -1)], closed: false }],
  SIX,
  // 7: the bar and the long diagonal
  [{ segs: [seg(run(L, T, R, T), -1), seg(run(R, T, 11, B), -1)], closed: false }],
  // 8: one figure-of-eight circuit: the lower bowl clockwise, the upper anticlockwise
  [{ segs: [seg(arc(MX, 36.6, 9.7, 10.6, 270, 630), -1), seg(arc(MX, 15.3, 8.6, 10.5, 90, -270), 1)], closed: true, speed: 1.6, eight: true }],
  turn(SIX),
];

/** Resample a stroke into a table every STEP px: x, y, head x, head y. */
function table(st) {
  const pts = [], side = [];
  for (const sg of st.segs) for (const p of sg.pts) {
    const q = pts[pts.length - 1];
    if (q && Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-6) continue;
    pts.push(p); side.push(sg.side);
  }
  if (st.closed) { pts.push(pts[0]); side.push(side[0]); }
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const len = cum[cum.length - 1];
  const m = Math.max(2, Math.round(len / STEP));
  const X = new Float32Array(m + 1), Y = new Float32Array(m + 1), SD = new Float32Array(m + 1), TX = new Float32Array(m + 1), TY = new Float32Array(m + 1);
  let k = 1;
  for (let j = 0; j <= m; j++) {
    const s = (j / m) * len;
    while (k < pts.length - 1 && cum[k] < s) k++;
    const u = Math.max(0, Math.min(1, (s - cum[k - 1]) / (cum[k] - cum[k - 1] || 1)));
    X[j] = pts[k - 1][0] + (pts[k][0] - pts[k - 1][0]) * u;
    Y[j] = pts[k - 1][1] + (pts[k][1] - pts[k - 1][1]) * u;
    SD[j] = side[k];
  }
  const at = (j) => (st.closed ? ((j % m) + m) % m : Math.max(0, Math.min(m, j)));
  const HX = new Float32Array(m + 1), HY = new Float32Array(m + 1);
  for (let j = 0; j <= m; j++) {
    // tangent over a 3 px window, side smoothed over 6 px: where the side
    // flips, the swimmer turns head first along the path
    const a = at(j - 3), b = at(j + 3);
    let tx = X[b] - X[a], ty = Y[b] - Y[a];
    const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    let sd = 0;
    for (let q = -6; q <= 6; q++) sd += SD[at(j + q)];
    sd /= 13;
    let hx = sd * ty + (1 - Math.abs(sd)) * tx, hy = -sd * tx + (1 - Math.abs(sd)) * ty;
    const hl = Math.hypot(hx, hy) || 1;
    HX[j] = hx / hl; HY[j] = hy / hl; TX[j] = tx; TY[j] = ty;
  }
  return { X, Y, HX, HY, m, len, closed: !!st.closed, speed: st.speed ?? 0 };
}

function build(strokes) {
  const D = { tabs: [], sk: [], s0: [], link: [], end: [], n: 0 };
  for (const st of strokes) {
    const tb = table(st), si = D.tabs.length;
    D.tabs.push(tb);
    let n;
    if (st.eight) {
      // the two passes through the waist must alternate: pick the count that
      // puts the lower bowl's length nearest a half-spacing off
      let best = 0, bestErr = 9;
      for (let c = 17; c <= 25; c++) {
        const lb = lowerLength(st), f = ((lb / (tb.len / c)) % 1 + 1) % 1, err = Math.abs(f - 0.5);
        if (err < bestErr && Math.abs(tb.len / c - SP) < 0.8) { bestErr = err; best = c; }
      }
      n = best || Math.round(tb.len / SP);
    } else n = st.closed ? Math.max(3, Math.round(tb.len / SP)) : Math.max(2, Math.round(tb.len / SP) + 1);
    const step = st.closed ? tb.len / n : tb.len / (n - 1);
    const first = D.n;
    for (let i = 0; i < n; i++) {
      D.sk.push(si); D.s0.push(i * step);
      D.link.push(st.closed ? (i === n - 1 ? first : D.n + 1) : (i === n - 1 ? -1 : D.n + 1));
      D.end.push(st.closed ? 0 : (i === 0 ? 1 : 0) | (i === n - 1 ? 2 : 0));
      D.n++;
    }
  }
  return D;
}
function lowerLength(st) {
  const p = st.segs[0].pts;
  let l = 0;
  for (let i = 1; i < p.length; i++) l += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
  return l;
}

export const DIGITS = STROKES.map(build);

/**
 * Where swimmer i of digit D is at time t (s): writes cell-space position and
 * head direction into out[0..3]. Closed strokes circulate at their speed.
 */
export function place(D, i, t, out) {
  const tb = D.tabs[D.sk[i]];
  let s = D.s0[i];
  if (tb.closed) { s = (s + tb.speed * t) % tb.len; if (s < 0) s += tb.len; }
  const f = (s / tb.len) * tb.m, j = f | 0, u = f - j, j1 = j < tb.m ? j + 1 : j;
  out[0] = tb.X[j] + (tb.X[j1] - tb.X[j]) * u;
  out[1] = tb.Y[j] + (tb.Y[j1] - tb.Y[j]) * u;
  const hx = tb.HX[j] + (tb.HX[j1] - tb.HX[j]) * u, hy = tb.HY[j] + (tb.HY[j1] - tb.HY[j]) * u;
  const hl = Math.sqrt(hx * hx + hy * hy) || 1;
  out[2] = hx / hl; out[3] = hy / hl;
}
