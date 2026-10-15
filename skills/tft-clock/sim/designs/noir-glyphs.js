// Noir's numerals: ten digits drawn as ribbons of cigarette smoke.
//
// Each digit is a skeleton: one or two strokes, each a polyline in a unit box
// (x right, y down). Free ends taper into a wisp, as a ribbon of smoke does
// where it thins out. The font is a tall, condensed 1940s title face: oval
// bowls, a flagged 1, an open 4, a long-tailed 9.
//
// At load every digit is rasterised at the two sizes the face uses into three
// byte maps over its box (flash tables on the device):
//   E  signed distance to the ribbon's edge, 1/8 px (negative inside)
//   U  arc length along the ribbon at the nearest point, px (the smoke flows along it)
//   V  signed distance across the ribbon, 1/2 px (the filaments run along it)

const TAU = Math.PI * 2;

function arc(cx, cy, rx, ry, a0, a1, n = 36) {
  const p = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + (a1 - a0) * (i / n)) * Math.PI) / 180;
    p.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return p;
}
function quad(p0, c, p1, n = 14) {
  const p = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    p.push([u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]]);
  }
  return p;
}
const last = (p) => p[p.length - 1];
const cat = (...ps) => ps.reduce((a, b) => a.concat(a.length ? b.slice(1) : b), []);

// strokes: { p: points, t0, t1 } (taper at the start / end)
const DEFS = [];
// 0: a tall oval, the smoke running round it anticlockwise
DEFS[0] = [{ p: arc(0.5, 0.5, 0.5, 0.5, 270, -90, 48) }];
// 1: a flag that curls in from the left, and the stem
DEFS[1] = [{ p: cat(quad([0.08, 0.3], [0.38, 0.2], [0.64, 0.0], 8), [[0.64, 0.0], [0.64, 1.0]]), t0: 1 }];
// 2: the top bowl, an S-curve down to the foot, the base
{
  const a = arc(0.5, 0.27, 0.5, 0.27, 165, 392, 30), e = last(a);
  DEFS[2] = [{ p: cat(a, quad(e, [0.42, 0.68], [0.0, 1.0], 12), [[0.0, 1.0], [1.0, 1.0]]), t0: 1 }];
}
// 3: two bowls meeting in the middle
DEFS[3] = [
  { p: arc(0.5, 0.245, 0.46, 0.245, 196, 450, 30), t0: 1 },
  { p: arc(0.5, 0.735, 0.5, 0.265, 270, 522, 30), t1: 1 },
];
// 4: open at the top: the diagonal and the bar, then the stem
DEFS[4] = [
  { p: [[0.55, 0.0], [0.0, 0.66], [1.0, 0.66]], t0: 1 },
  { p: [[0.76, 0.3], [0.76, 1.0]] },
];
// 5: the flag, the drop, the round belly ending in a wisp
{
  const b = arc(0.48, 0.69, 0.5, 0.31, 213, 518, 32);
  DEFS[5] = [{ p: cat([[0.96, 0.0], [0.13, 0.0], [0.08, 0.45]], b), t1: 1 }];
}
// 6: a long curve down the left into a closed bowl
{
  const s = quad([0.88, 0.04], [0.06, 0.06], [0.02, 0.68], 16);
  DEFS[6] = [{ p: cat(s, arc(0.5, 0.68, 0.48, 0.32, 180, -180, 40)), t0: 1 }];
}
// 7: the bar and a long, slightly bowed diagonal
DEFS[7] = [{ p: cat([[0.0, 0.0], [1.0, 0.0]], quad([1.0, 0.0], [0.6, 0.42], [0.36, 1.0], 14)), t1: 1 }];
// 8: two loops, the upper one smaller
DEFS[8] = [
  { p: arc(0.5, 0.235, 0.42, 0.235, 90, 450, 36) },
  { p: arc(0.5, 0.73, 0.5, 0.27, 270, 630, 40) },
];
// 9: the bowl, then a tail that sweeps down to the foot and thins out
DEFS[9] = [{ p: cat(arc(0.5, 0.32, 0.5, 0.32, 0, 360, 40), quad([1.0, 0.32], [1.0, 0.98], [0.28, 1.0], 14)), t1: 1 }];

/**
 * Rasterise the ten digits for a skeleton box sw x sh px, ribbon half-width
 * hw, with `pad` px of haze round the outer edge.
 * @returns {{w,h,ox,oy,E:Int8Array,U:Uint8Array,V:Int8Array,len:number}[]}
 *   ox, oy: where the outer box's top-left lies in the map
 */
export function buildDigits(sw, sh, hw, pad) {
  const ox = pad, oy = pad, sx0 = pad + hw, sy0 = pad + hw;
  const w = Math.ceil(sw + 2 * hw + 2 * pad), h = Math.ceil(sh + 2 * hw + 2 * pad);
  return DEFS.map((strokes) => {
    // to pixels, with arc length and the taper's width per vertex
    let u0 = 0;
    const segs = [];
    for (const st of strokes) {
      const P = st.p.map(([x, y]) => [sx0 + x * sw, sy0 + y * sh]);
      const L = [0];
      for (let i = 1; i < P.length; i++) L.push(L[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
      const tot = L[L.length - 1], TL = hw * 3.2;
      const width = (s) => {
        let k = 1;
        if (st.t0 && s < TL) k = Math.min(k, 0.5 + 0.5 * smooth(s / TL));
        if (st.t1 && tot - s < TL) k = Math.min(k, 0.5 + 0.5 * smooth((tot - s) / TL));
        return hw * k;
      };
      for (let i = 1; i < P.length; i++) segs.push({ a: P[i - 1], b: P[i], s0: L[i - 1], s1: L[i], u0, width });
      u0 += tot + 4;
    }
    const E = new Int8Array(w * h), U = new Uint8Array(w * h), V = new Int8Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const px = x + 0.5, py = y + 0.5;
        let best = Infinity, bu = 0, bv = 0;
        for (const sg of segs) {
          const dx = sg.b[0] - sg.a[0], dy = sg.b[1] - sg.a[1], l2 = dx * dx + dy * dy || 1;
          let t = ((px - sg.a[0]) * dx + (py - sg.a[1]) * dy) / l2;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const ex = px - sg.a[0] - t * dx, ey = py - sg.a[1] - t * dy, d = Math.hypot(ex, ey);
          const s = sg.s0 + (sg.s1 - sg.s0) * t, e = d - sg.width(s);
          if (e < best) { best = e; bu = sg.u0 + s; bv = Math.sign(dx * ey - dy * ex) * d; }
        }
        const i = y * w + x;
        E[i] = Math.max(-127, Math.min(127, Math.round(best * 8)));
        U[i] = Math.round(bu) & 255;
        V[i] = Math.max(-127, Math.min(127, Math.round(bv * 2)));
      }
    return { w, h, ox, oy, E, U, V, len: u0 };
  });
}

function smooth(t) { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); }
export { TAU };
