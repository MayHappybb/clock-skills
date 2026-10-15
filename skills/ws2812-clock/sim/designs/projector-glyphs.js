// Projector numerals: drawn for this face, not from the kit.
//   'deco'  the title card's hours: a high-contrast Didone with vertical
//           stress, hairline bars and ball terminals (silent-film intertitle)
//   'sans'  the Academy leader's minutes: the same skeletons, monoline and bold,
//           without serifs or balls
// Skeletons live in a 10 x 18 unit box (y down). Arcs: [cx, cy, rx, ry, a0, a1]
// in degrees, 0 = right, 90 = down. Each glyph is rasterised once by 6x6
// supersampling into a coverage mask with a 2 px margin, plus a "moat": the
// mask dilated by ~1.6 px, used to cut a dark keyline round each numeral.

const L = (x0, y0, x1, y1, k, serif = 0) => ({ t: 0, x0, y0, x1, y1, k, serif });
const E = (cx, cy, rx, ry, a0, a1) => ({ t: 1, cx, cy, rx, ry, a0, a1 });
const B = (cx, cy) => ({ t: 2, cx, cy });

const SIX = [
  E(5, 12.4, 4.0, 4.6, 0, 360),
  E(5.6, 9.6, 4.6, 8.6, 168, 300),
  B(5.6 + 4.6 * Math.cos((300 * Math.PI) / 180), 9.6 + 8.6 * Math.sin((300 * Math.PI) / 180)),
];
const rot = (ps) => ps.map((p) => (p.t === 0 ? { ...p, x0: 10 - p.x0, y0: 18 - p.y0, x1: 10 - p.x1, y1: 18 - p.y1 }
  : p.t === 1 ? { ...p, cx: 10 - p.cx, cy: 18 - p.cy, a0: p.a0 + 180, a1: p.a1 + 180 }
    : { ...p, cx: 10 - p.cx, cy: 18 - p.cy }));
const arcPt = (cx, cy, rx, ry, a) => [cx + rx * Math.cos((a * Math.PI) / 180), cy + ry * Math.sin((a * Math.PI) / 180)];

const DIGITS = [
  [E(5, 9, 3.9, 7.9, 0, 360)],
  [L(5.6, 1.0, 5.6, 17.0, 'V'), L(5.6, 1.1, 2.4, 4.3, 'H'), L(2.4, 17.0, 8.8, 17.0, 'H', 1)],
  [E(5, 5.4, 3.8, 4.4, 165, 395), B(...arcPt(5, 5.4, 3.8, 4.4, 165)),
    L(...arcPt(5, 5.4, 3.8, 4.4, 395), 1.2, 17.0, 'D'), L(1.2, 17.0, 9.2, 17.0, 'M')],
  [E(5, 4.7, 3.4, 3.7, 160, 450), B(...arcPt(5, 4.7, 3.4, 3.7, 160)),
    E(5, 12.7, 4.0, 4.3, 270, 520), B(...arcPt(5, 12.7, 4.0, 4.3, 520))],
  [L(7.0, 1.0, 7.0, 17.0, 'V'), L(7.0, 1.0, 0.8, 12.4, 'H'), L(0.8, 12.4, 9.6, 12.4, 'M'), L(4.6, 17.0, 9.4, 17.0, 'H', 1)],
  [L(2.6, 1.0, 8.8, 1.0, 'M'), L(2.4, 1.0, 2.4, 9.2, 'V'),
    E(5.2, 12.0, 3.9, 5.0, 210, 500), B(...arcPt(5.2, 12.0, 3.9, 5.0, 500))],
  SIX,
  [L(1.0, 1.0, 9.2, 1.0, 'M'), L(9.2, 1.0, 3.8, 17.0, 'D'), L(1.0, 1.0, 1.0, 3.8, 'H', 1)],
  [E(5, 4.6, 3.4, 3.6, 0, 360), E(5, 12.7, 4.1, 4.3, 0, 360)],
  rot(SIX),
];

const STYLE = {
  deco: { V: 5.0, D: 4.3, M: 2.4, H: 1.6, ball: 2.35, serifs: true },
  sans: { V: 3.1, D: 3.1, M: 3.1, H: 3.1, ball: 0, serifs: false },
};

function segD(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

/** Is pixel-space point (x, y) inside glyph d drawn in a w x h box? */
function inside(prims, st, sx, sy, x, y) {
  for (const p of prims) {
    if (p.t === 0) {
      if (p.serif && !st.serifs) continue;
      if (segD(x, y, p.x0 * sx, p.y0 * sy, p.x1 * sx, p.y1 * sy) < st[p.k] / 2) return true;
    } else if (p.t === 1) {
      const RX = p.rx * sx, RY = p.ry * sy, dx = x - p.cx * sx, dy = y - p.cy * sy;
      const qx = dx / RX, qy = dy / RY, rho = Math.hypot(qx, qy);
      let a = (Math.atan2(qy, qx) * 180) / Math.PI;
      let rel = (((a - p.a0) % 360) + 360) % 360;
      if (p.a1 - p.a0 < 360 && rel > p.a1 - p.a0) continue;
      const c = Math.cos((a * Math.PI) / 180), s = Math.sin((a * Math.PI) / 180);
      const w = st.H + (st.V - st.H) * c * c;       // vertical stress: thick at the sides
      if (Math.abs(rho - 1) * Math.hypot(RX * c, RY * s) < w / 2) return true;
    } else if (st.ball > 0) {
      if (Math.hypot(x - p.cx * sx, y - p.cy * sy) < st.ball) return true;
    }
  }
  return false;
}

export const MARGIN = 2;
/** Masks for all ten digits: [{ w, h, a, moat }] with w, h including the margin. */
export function makeDigits(w, h, style) {
  const st = STYLE[style], sx = w / 10, sy = h / 18, M = MARGIN, W = w + 2 * M, H = h + 2 * M, SS = 6;
  return DIGITS.map((prims) => {
    const a = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let n = 0;
      for (let j = 0; j < SS; j++) for (let i = 0; i < SS; i++) {
        if (inside(prims, st, sx, sy, x - M + (i + 0.5) / SS, y - M + (j + 0.5) / SS)) n++;
      }
      a[y * W + x] = n / (SS * SS);
    }
    const moat = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let m = 0;
      for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) {
        const X = x + i, Y = y + j;
        if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
        const k = Math.min(1, Math.max(0, 2.1 - Math.hypot(i, j))) * a[Y * W + X];
        if (k > m) m = k;
      }
      moat[y * W + x] = m;
    }
    return { w: W, h: H, a, moat };
  });
}
