// Pachinko glyphs: one set of digit skeletons, drawn two ways.
//  - as brass NAILS hammered into the playfield (the hours): points along the
//    skeleton, one nail every ~2 px, snapped to LEDs so they sit crisp at rest;
//  - as the LCD's flashy anime reel NUMERALS (the minutes): heavy italic brush
//    strokes with thick-thin stress, a white keyline, gold-to-red gradient fill
//    and a top highlight, pre-rendered by supersampled distance field.
// Skeleton box: x 0..10, y 0..14 (y down). Points are [x, y, width].

const P = (x, y, w) => [x, y, w];
function arc(cx, cy, rx, ry, a0, a1, wf, n = 28) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + (a1 - a0) * (i / n)) * Math.PI) / 180;
    out.push(P(cx + rx * Math.cos(a), cy + ry * Math.sin(a), typeof wf === 'function' ? wf(a) : wf));
  }
  return out;
}
function bez(p0, p1, p2, w0, w1, n = 16) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push(P(u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1], w0 + (w1 - w0) * t));
  }
  return out;
}
const stress = (thin, thick) => (a) => thin + (thick - thin) * Math.abs(Math.cos(a));

const SK = [];
SK[0] = [arc(5, 7, 3.75, 5.95, -90, 270, stress(1.7, 2.75), 48)];
SK[1] = [
  [P(2.4, 3.6, 1.5), P(6.2, 0.75, 2.5)],
  [P(6.2, 0.75, 2.8), P(6.2, 13.25, 2.8)],
  [P(3.1, 13.25, 1.7), P(9.3, 13.25, 1.7)],
];
SK[2] = [
  [...arc(5.05, 4.35, 3.7, 3.65, -168, 28, stress(2.4, 1.6), 26),
    ...bez([8.3, 6.05], [5.0, 9.6], [1.1, 13.25], 2.0, 2.7).slice(1),
    P(9.4, 13.25, 2.0)],
];
SK[3] = [
  arc(4.9, 3.75, 3.45, 3.05, -158, 90, stress(1.7, 2.4), 24),
  [P(3.4, 6.8, 1.7), P(4.9, 6.8, 1.9)],
  arc(4.75, 10.1, 3.9, 3.3, -90, 158, stress(1.8, 2.7), 26),
];
SK[4] = [
  [P(7.2, 0.75, 2.0), P(0.8, 9.6, 2.1), P(9.6, 9.6, 2.0)],
  [P(7.2, 0.75, 2.6), P(7.2, 13.25, 2.8)],
];
SK[5] = [
  [P(9.0, 0.75, 1.9), P(2.7, 0.75, 2.0), P(2.1, 6.3, 2.3)],
  arc(5.0, 9.45, 3.85, 3.85, -133, 152, stress(1.7, 2.7), 28),
];
SK[6] = [
  arc(5.0, 9.5, 3.75, 3.75, 0, 360, stress(1.7, 2.6), 36),
  bez([1.25, 9.5], [1.6, 1.4], [8.6, 1.2], 2.7, 1.6, 18),
];
SK[7] = [
  [P(0.8, 0.75, 2.0), P(9.4, 0.75, 2.0)],
  bez([9.4, 0.75], [6.2, 5.6], [4.0, 13.25], 2.0, 2.8),
];
SK[8] = [
  arc(5.0, 3.75, 3.05, 3.0, -90, 270, stress(1.6, 2.2), 32),
  arc(5.0, 10.05, 3.7, 3.25, -90, 270, stress(1.7, 2.7), 36),
];
SK[9] = SK[6].map((pl) => pl.map(([x, y, w]) => P(10 - x, 14 - y, w)));
export const SKELETON = SK;

// ------------------------------------------------------------------ nails
/**
 * Nail positions (grid px) for digit d drawn in a box at (x0, y0), size w x h.
 * Ordered along the skeleton (so a morph can flow nail by nail).
 */
export function nailDigit(d, x0, y0, w, h, spacing = 2.15) {
  const sx = w / 10, sy = h / 14, out = [];
  const ok = (x, y) => out.every(([a, b]) => (a - x) ** 2 + (b - y) ** 2 >= 1.9 * 1.9);
  for (const pl of SK[d]) {
    let carry = 0;
    for (let k = 0; k + 1 < pl.length; k++) {
      const ax = x0 + pl[k][0] * sx, ay = y0 + pl[k][1] * sy, bx = x0 + pl[k + 1][0] * sx, by = y0 + pl[k + 1][1] * sy;
      const L = Math.hypot(bx - ax, by - ay);
      let s = k === 0 ? 0 : carry;
      for (; s <= L; s += spacing) {
        const x = Math.round(ax + ((bx - ax) * s) / (L || 1)), y = Math.round(ay + ((by - ay) * s) / (L || 1));
        if (ok(x, y)) out.push([x, y]);
      }
      carry = s - L;
    }
    const e = pl[pl.length - 1], x = Math.round(x0 + e[0] * sx), y = Math.round(y0 + e[1] * sy);
    if (ok(x, y)) out.push([x, y]);
  }
  return out;
}

// ----------------------------------------------------------- reel numerals
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const hexl = (s) => { const n = parseInt(s.slice(1), 16); return [lin((n >> 16) / 255), lin(((n >> 8) & 255) / 255), lin((n & 255) / 255)]; };

/** Signed distance (px) to a set of width-carrying polylines already in px. */
function sdf(segs, x, y) {
  let best = 1e9;
  for (let i = 0; i < segs.length; i += 6) {
    const ax = segs[i], ay = segs[i + 1], aw = segs[i + 2], bx = segs[i + 3], by = segs[i + 4], bw = segs[i + 5];
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
    let t = L2 ? ((x - ax) * dx + (y - ay) * dy) / L2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const d = Math.hypot(x - ax - t * dx, y - ay - t * dy) - (aw + (bw - aw) * t) / 2;
    if (d < best) best = d;
  }
  return best;
}

/**
 * A reel cell: RGBA (premultiplied linear) Float32Array of cw x ch.
 * kind: digit 0..9, or a symbol 10.. (see SYMBOLS).
 */
export function reelCell(kind, cw, ch) {
  const img = new Float32Array(cw * ch * 4);
  const gh = 25.5, ux = 1.62, uy = gh / 14, slant = 0.13;
  const gx0 = (cw - 10 * ux - slant * gh) / 2, gy0 = (ch - gh) / 2;
  let segs, fill;
  if (kind < 10) {
    const arr = [];
    for (const pl of SK[kind]) for (let k = 0; k + 1 < pl.length; k++) {
      const [ax, ay, aw] = pl[k], [bx, by, bw] = pl[k + 1];
      const X = (px, py) => gx0 + px * ux + (14 - py) * uy * slant;
      arr.push(X(ax, ay), gy0 + ay * uy, aw * 1.72, X(bx, by), gy0 + by * uy, bw * 1.72);
    }
    segs = new Float32Array(arr);
    const top = hexl('#fff2a0'), mid = hexl('#ffb01e'), bot = hexl('#ff3418');
    fill = (y) => { const v = (y - gy0) / gh; return v < 0.45 ? mixc(top, mid, v / 0.45) : mixc(mid, bot, (v - 0.45) / 0.55); };
  } else {
    segs = SYMBOLS[kind - 10].segs(cw, ch);
    const c = hexl(SYMBOLS[kind - 10].color), c2 = hexl(SYMBOLS[kind - 10].color2);
    fill = (y) => mixc(c, c2, (y - ch * 0.25) / (ch * 0.5));
  }
  const KEY = hexl('#fffbe8');
  const SS = 4;
  for (let py = 0; py < ch; py++) for (let px = 0; px < cw; px++) {
    let cf = 0, co = 0, ck = 0, hl = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const x = px + (sx + 0.5) / SS - 0.5, y = py + (sy + 0.5) / SS - 0.5;
      const d = sdf(segs, x, y);
      if (d < 0) {
        cf++;
        // top-lit bevel: brighter where the stroke surface faces up-left
        const g = sdf(segs, x - 0.45, y - 0.7) - d;
        if (g > 0.25 && d > -1.4) hl++;
      } else if (d < 1.0) co++;
      else if (d < 2.0) ck++;
    }
    const n = SS * SS, f = cf / n, o = co / n, k = ck / n, h = hl / n;
    const fc = fill(py), q = 4 * (py * cw + px);
    // fill + highlight + white keyline; a black moat (alpha only) outside
    for (let c = 0; c < 3; c++) img[q + c] = fc[c] * f * 0.8 + 0.55 * h * (0.6 + 0.4 * fc[c]) + KEY[c] * o * 0.75;
    img[q + 3] = Math.min(1, f + o + 0.85 * k);
  }
  return img;
}
const mixc = (a, b, t) => { t = t < 0 ? 0 : t > 1 ? 1 : t; return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; };

// Reel symbols: deliberately unlike any digit (no rings, no bars).
function polySegs(pts, w) {
  const a = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a.push(p[0], p[1], w, q[0], q[1], w);
  }
  return new Float32Array(a);
}
const SYMBOLS = [
  { color: '#bff8ff', color2: '#18a8ff', segs: (cw, ch) => { // five-point star, filled by a fat outline
    const cx = cw / 2, cy = ch / 2 + 0.5, pts = [];
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 3.4 : 8.6; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
    const s = [...polySegs(pts, 2.4)];
    for (let i = 0; i < 10; i += 2) s.push(cx, cy, 5.5, pts[i][0], pts[i][1], 1.6);
    return new Float32Array(s);
  } },
  { color: '#ffd0ec', color2: '#ff2a8a', segs: (cw, ch) => { // heart
    const cx = cw / 2, cy = ch / 2, s = [];
    const L = (ax, ay, aw, bx, by, bw) => s.push(cx + ax, cy + ay, aw, cx + bx, cy + by, bw);
    L(-3.6, -3.2, 6.6, 0, 6.8, 2.0); L(3.6, -3.2, 6.6, 0, 6.8, 2.0); L(-3.6, -3.2, 6.6, 3.6, -3.2, 6.6);
    L(-4.4, -2.0, 5.2, -1.0, 2.6, 5.2); L(4.4, -2.0, 5.2, 1.0, 2.6, 5.2);
    return new Float32Array(s);
  } },
  { color: '#d6ffd2', color2: '#18d060', segs: (cw, ch) => { // cut jewel
    const cx = cw / 2, cy = ch / 2, pts = [[cx - 7.5, cy - 2.5], [cx - 4, cy - 6.5], [cx + 4, cy - 6.5], [cx + 7.5, cy - 2.5], [cx, cy + 7.5]];
    const s = [...polySegs(pts, 2.2)];
    s.push(cx - 4, cy - 1.5, 5.5, cx + 4, cy - 1.5, 5.5, cx, cy + 3, 4, cx, cy - 4, 6);
    return new Float32Array(s);
  } },
  { color: '#fff0c8', color2: '#c070ff', segs: (cw, ch) => { // bell
    const cx = cw / 2, cy = ch / 2, s = [];
    const L = (ax, ay, aw, bx, by, bw) => s.push(cx + ax, cy + ay, aw, cx + bx, cy + by, bw);
    L(0, -6.5, 4.5, 0, -2, 6.5); L(-1.5, -2, 6.5, -4.5, 4.5, 4.5); L(1.5, -2, 6.5, 4.5, 4.5, 4.5);
    L(-7, 5.2, 2.2, 7, 5.2, 2.2); L(0, 6.5, 3.2, 0, 7.4, 3.2);
    return new Float32Array(s);
  } },
];
export const NSYM = SYMBOLS.length;
