// Soft Serve numerals: each digit is ONE ribbon of soft serve, piped by a
// star nozzle along a centre line. The paths below are the order the nozzle
// lays them (mostly bottom-up, as soft serve is built on a cone), chosen so
// that a half-piped digit never reads as another digit: the 2 starts with
// its base, the 4 with its bar and open arm (an "L"), the 7 with its bar, the
// 8 is two stacked coils (the lower coil first, then the upper one right
// side first), the 1 with its stem.
//
// Design box 26 x 44 px; the ribbon is 2R = 8.5 px wide (chunky and soft);
// every counter keeps at least 6 x 9 px of ground. Bowls sit a little low and
// full, as soft serve settles.
//
// At load every glyph is rasterised into a "material map" (flash tables on
// the device): for each pixel of a 34 x 50 box, the nearest strand of the
// ribbon as (s, v): s = how far along the piping the strand is (1/4 px),
// v = signed distance across the ribbon (1/8 px). Where the ribbon passes
// over itself (8's waist, 4's crossing, the 0's seam) a pixel has extra
// strands, kept in a sparse list, latest first: the later strand lies on top.
// The face colours every pixel from (s, v) through a band table, so the twist
// stripes, the bead ridges, the piping head and the keyline all come from
// two bytes and a lookup.

export const R = 4.0;               // ribbon half-width, px
export const DW = 26, DH = 44;      // design box
export const M = 4;                 // margin of the map box
export const GW = DW + 2 * M + 2, GH = DH + 2 * M;   // 36 x 52 (the 4's bar overhangs right)
export const NONE = 0xffff;
const REACH = R + 2.25;             // strands farther than this from a pixel are not stored

// ------------------------------------------------------------ the paths
// ['M', x, y] move (start of a stroke), ['L', x, y] line,
// ['A', cx, cy, rx, ry, a0, a1] elliptical arc in degrees (screen: y down, so
// increasing angle turns clockwise), ['Q', cx, cy, x, y] quadratic.
// A new stroke (the nozzle lifts and travels) is a new array.
const PATHS = {
  0: [[['A', 13, 30.75, 8.9, 9, 90, 0], ['L', 21.9, 13.4], ['A', 13, 13.4, 8.3, 9.15, 0, -180], ['L', 4.1, 30.75], ['A', 13, 30.75, 8.9, 9, 180, 72]]],
  1: [[['M', 15, 41], ['L', 15, 4.6], ['Q', 11.5, 7.5, 6.6, 11.6]]],
  2: [[['M', 22.2, 39.6], ['Q', 13, 40.6, 4.8, 39.4], ['L', 19.2, 20.2], ['A', 12.8, 13.3, 8.6, 9.05, 38, -192]]],
  3: [[['A', 12.5, 30.6, 9.3, 9.15, 152, -113], ['A', 12.3, 13.15, 8.2, 8.9, 114, -162]]],
  4: [[['M', 24, 29.2], ['L', 4.5, 29.2], ['Q', 4.2, 15, 5, 4.4]], [['M', 19.8, 12.5], ['L', 19.8, 41]]],
  5: [[['A', 12.5, 28.3, 9.3, 11.45, 146, -141], ['L', 5.6, 4.4], ['Q', 13.5, 3.6, 21.6, 4.6]]],
  6: [[['A', 13.6, 17.2, 9.3, 12.9, -46, -180], ['L', 4.3, 29.7], ['A', 13, 29.7, 8.75, 10.05, 180, -170]]],
  7: [[['M', 4.3, 4.5], ['Q', 13, 3.7, 21.8, 4.6], ['Q', 15.2, 18.5, 10.8, 41]]],
  8: [[['A', 13, 30.75, 8.9, 9, -90, 270], ['A', 13, 13.3, 8.05, 9.05, 90, -275]]],
  9: [[['A', 13, 25.2, 8.75, 14.55, 112, 0], ['L', 21.75, 14.5], ['A', 13, 14.5, 8.75, 10.25, 0, -352]]],
};

const STEP = 0.25;

function sampleStroke(stroke) {
  const pts = [];
  let cx = 0, cy = 0, started = false;
  const lineTo = (x, y) => {
    if (!started) { pts.push([x, y]); cx = x; cy = y; started = true; return; }
    const n = Math.max(1, Math.ceil(Math.hypot(x - cx, y - cy) / STEP));
    for (let i = 1; i <= n; i++) pts.push([cx + ((x - cx) * i) / n, cy + ((y - cy) * i) / n]);
    cx = x; cy = y;
  };
  for (const seg of stroke) {
    if (seg[0] === 'M') { started = false; lineTo(seg[1], seg[2]); }
    else if (seg[0] === 'L') lineTo(seg[1], seg[2]);
    else if (seg[0] === 'Q') {
      const [, qx, qy, x, y] = seg, x0 = cx, y0 = cy;
      const n = 64;
      for (let i = 1; i <= n; i++) {
        const u = i / n, a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u;
        lineTo(a * x0 + b * qx + c * x, a * y0 + b * qy + c * y);
      }
    } else if (seg[0] === 'A') {
      const [, ax, ay, rx, ry, a0, a1] = seg;
      const n = Math.ceil(Math.abs(a1 - a0) / 2);
      for (let i = 0; i <= n; i++) {
        const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
        lineTo(ax + rx * Math.cos(a), ay + ry * Math.sin(a));
      }
    }
  }
  // resample evenly by arc length
  const out = [pts[0]];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    const d = Math.hypot(x1 - x0, y1 - y0);
    if (d === 0) continue;
    let t = STEP - acc;
    while (t <= d) { out.push([x0 + ((x1 - x0) * t) / d, y0 + ((y1 - y0) * t) / d]); t += STEP; }
    acc = d - (t - STEP);
  }
  return out;
}

function build(d) {
  // samples: x, y (map coords), s (px along the piping, lifts included), tangent
  const xs = [], ys = [], ss = [], txs = [], tys = [];
  const route = [];          // the nozzle's route, lifts included: [x, y, s]
  let s = 0, px = null, py = null;
  for (const stroke of PATHS[d]) {
    const pts = sampleStroke(stroke).map(([x, y]) => [x + M, y + M]);
    if (px !== null) s += Math.hypot(pts[0][0] - px, pts[0][1] - py);   // the lift: the nozzle travels through the air
    for (let i = 0; i < pts.length; i++) {
      if (i > 0) s += STEP;
      const a = pts[Math.max(0, i - 2)], b = pts[Math.min(pts.length - 1, i + 2)];
      const tl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      xs.push(pts[i][0]); ys.push(pts[i][1]); ss.push(s);
      txs.push((b[0] - a[0]) / tl); tys.push((b[1] - a[1]) / tl);
      route.push([pts[i][0], pts[i][1], s]);
    }
    [px, py] = pts[pts.length - 1];
  }
  // the head's position every 0.5 px of s, interpolated along the route
  const head = [];
  for (let k = 0, j = 0; k <= s * 2 + 1; k++) {
    const sk = Math.min(s, k / 2);
    while (j < route.length - 2 && route[j + 1][2] < sk) j++;
    const [x0, y0, s0] = route[j], [x1, y1, s1] = route[j + 1] ?? route[j];
    const u = s1 > s0 ? Math.min(1, Math.max(0, (sk - s0) / (s1 - s0))) : 0;
    head.push([x0 + (x1 - x0) * u, y0 + (y1 - y0) * u]);
  }
  const len = s, n = xs.length;
  const S = new Uint16Array(GW * GH).fill(NONE), V = new Int8Array(GW * GH);
  const X = new Map();
  const top = new Int8Array(GW).fill(-1);
  let extras = 0;
  for (let y = 0; y < GH; y++)
    for (let x = 0; x < GW; x++) {
      const cx = x + 0.5, cy = y + 0.5;
      // every sample within reach, in s order; split into strands where s jumps
      const strands = [];
      let cur = null, lastS = -99;
      for (let j = 0; j < n; j++) {
        const dx = cx - xs[j], dy = cy - ys[j];
        const d2 = dx * dx + dy * dy;
        if (d2 > REACH * REACH) continue;
        if (!cur || ss[j] - lastS > 3) { cur = { d2: Infinity, j: -1 }; strands.push(cur); }
        if (d2 < cur.d2) { cur.d2 = d2; cur.j = j; }
        lastS = ss[j];
      }
      if (!strands.length) continue;
      const list = strands.map(({ d2, j }) => {
        const dx = cx - xs[j], dy = cy - ys[j];
        const sgn = txs[j] * dy - tys[j] * dx >= 0 ? 1 : -1;
        return [Math.round(ss[j] * 4), Math.max(-127, Math.min(127, Math.round(Math.sqrt(d2) * 8 * sgn)))];
      }).sort((a, b) => b[0] - a[0]);       // latest strand first: it lies on top
      const i = y * GW + x;
      S[i] = list[0][0]; V[i] = list[0][1];
      if (list.length > 1) { X.set(i, list.slice(1).flat()); extras += list.length - 1; }
      if (top[x] < 0 && list.some(([, v]) => Math.abs(v) < R * 8)) top[x] = y;
    }
  return { d, S, V, X, len, head, top, extras };
}

export const GLYPHS = Array.from({ length: 10 }, (_, d) => build(d));

/** Flash for the maps: 3 bytes a pixel dense, 5 a sparse extra strand, plus the head paths. */
export const FLASH_BYTES = GLYPHS.reduce((a, g) => a + GW * GH * 3 + g.extras * 5 + g.head.length * 2 + GW, 0);
