// Latte: the still parts of the scene, painted once into a 64 x 64 linear
// RGB image (the café table, the saucer, the cup's rim and handle, a sugar
// cube, crumbs), plus a periodic noise texture the crema and steam sample.
export const W = 64, H = 64, N = W * H, CX = 31.5, CY = 31.5;
export const R_CREMA = 23.2, R_RIM = 26.4, R_SAUCER = 31.9;

const cl = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const ss = (a, b, x) => { const t = cl((x - a) / (b - a)); return t * t * (3 - 2 * t); };
function hash(a, b) {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Periodic value noise 64 x 64 (period 64), two octaves, 0..1. */
export const NOISE = new Float32Array(N);
{
  const oct = (x, y, cell) => {
    const P = W / cell, gx = x / cell, gy = y / cell, xi = Math.floor(gx), yi = Math.floor(gy);
    const u = gx - xi, v = gy - yi, su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
    const h = (i, j) => hash(((i % P) + P) % P + cell * 1000, ((j % P) + P) % P);
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    return a + (b - a) * su + (c - a) * sv + (a - b - c + d) * su * sv;
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) NOISE[y * W + x] = 0.62 * oct(x, y, 8) + 0.38 * oct(x, y, 4);
}
/** Bilinear, wrapping sample of NOISE. */
export function noise(x, y) {
  const xf = Math.floor(x), yf = Math.floor(y), u = x - xf, v = y - yf;
  const x0 = xf & 63, y0 = yf & 63, x1 = (x0 + 1) & 63, y1 = (y0 + 1) & 63;
  const a = NOISE[y0 * W + x0], b = NOISE[y0 * W + x1], c = NOISE[y1 * W + x0], d = NOISE[y1 * W + x1];
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Signed distance to a rounded box centred at (cx, cy), half sizes hx, hy, turned by ang. */
function boxSD(x, y, cx, cy, hx, hy, ang, r) {
  const c = Math.cos(ang), s = Math.sin(ang), dx = x - cx, dy = y - cy;
  const u = Math.abs(c * dx + s * dy) - hx + r, v = Math.abs(-s * dx + c * dy) - hy + r;
  return Math.hypot(Math.max(u, 0), Math.max(v, 0)) + Math.min(Math.max(u, v), 0) - r;
}

export const BG = new Float32Array(3 * N);
/** Per pixel: radius from the cup centre, and how much of it is crema (0..1). */
export const RAD = new Float32Array(N), CREMA = new Float32Array(N);
export const CER = [0.2, 0.165, 0.12], GLAZE = [0.85, 0.42, 0.06], PORC = [0.7, 0.68, 0.62];
export const R_MARK = 30.0;
{
  const TABLE = [0.04, 0.017, 0.007], GRAIN = [0.075, 0.034, 0.014];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = y * W + x, dx = x - CX, dy = y - CY, r = Math.hypot(dx, dy);
      RAD[p] = r; CREMA[p] = cl(R_CREMA + 0.5 - r);
      // table: dark walnut, grain running diagonally
      const g = 0.5 + 0.5 * Math.sin((x * 0.35 + y * 0.9) * 0.9 + 3 * noise(x * 0.6, y * 2.2));
      let c = [TABLE[0] + (GRAIN[0] - TABLE[0]) * g * g, TABLE[1] + (GRAIN[1] - TABLE[1]) * g * g, TABLE[2] + (GRAIN[2] - TABLE[2]) * g * g];
      // saucer: ceramic, a raised rim ring, the cup's shadow round its foot
      const sau = cl(R_SAUCER + 0.5 - r);
      if (sau > 0) {
        const ring = Math.exp(-(((r - 31.0) / 0.7) ** 2));
        const shade = 0.2 + 0.22 * ring - 0.14 * ss(R_RIM + 2.2, R_RIM, r) + 0.06 * (-(dx + dy) / r / 1.41);
        const s = [CER[0] * shade, CER[1] * shade, CER[2] * shade];
        c = [c[0] + (s[0] - c[0]) * sau, c[1] + (s[1] - c[1]) * sau, c[2] + (s[2] - c[2]) * sau];
      }
      // cup: inner wall in shadow, the lip catching light, outer edge
      const cup = cl(R_RIM + 0.5 - r) * (1 - CREMA[p]);
      if (cup > 0) {
        const t = (r - R_CREMA) / (R_RIM - R_CREMA);
        // a white porcelain lip: shaded inner wall, bright rounded top, darker outer edge
        const lip = 0.12 + 0.88 * Math.exp(-(((t - 0.58) / 0.26) ** 2)) - 0.1 * ss(0.85, 1.05, t);
        const side = 1 + 0.25 * (-(dx * 0.6 + dy * 0.8) / r);
        const k = Math.max(0, lip * side);
        c = [c[0] + (PORC[0] * k - c[0]) * cup, c[1] + (PORC[1] * k - c[1]) * cup, c[2] + (PORC[2] * k - c[2]) * cup];
      }
      BG[3 * p] = c[0]; BG[3 * p + 1] = c[1]; BG[3 * p + 2] = c[2];
    }
  }
  // the saucer's painted rim: twelve gold glaze marks, the hour scale
  for (let h = 0; h < 12; h++) {
    const a = -Math.PI / 2 + (h * Math.PI) / 6, big = h % 3 === 0;
    const mx = CX + R_MARK * Math.cos(a), my = CY + R_MARK * Math.sin(a);
    const hl = big ? 1.8 : 1.4, hw = big ? 1.25 : 0.8;
    const ta = -Math.sin(a), tb = Math.cos(a);   // tangent, for the twin bar at 12
    for (let y = Math.floor(my - 4); y <= my + 4; y++) for (let x = Math.floor(mx - 4); x <= mx + 4; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      let d = boxSD(x, y, mx, my, hl, hw, a, 0.6);
      if (h === 0) d = Math.min(boxSD(x, y, mx - 1.7 * ta, my - 1.7 * tb, hl, 0.75, a, 0.5), boxSD(x, y, mx + 1.7 * ta, my + 1.7 * tb, hl, 0.75, a, 0.5));
      const k = cl(0.5 - d);
      if (k <= 0) continue;
      const q = 3 * (y * W + x), g = h === 0 ? 1.15 : big ? 0.95 : 0.7;
      for (let ch = 0; ch < 3; ch++) BG[q + ch] += (GLAZE[ch] * g - BG[q + ch]) * k;
    }
  }
  // sugar cube, top left: a lit top face and two shaded sides
  for (let y = 0; y < 14; y++) {
    for (let x = 0; x < 14; x++) {
      const p = y * W + x;
      const top = cl(0.5 - boxSD(x, y, 4.0, 3.8, 2.4, 2.4, 0.32, 0.5));
      const side = cl(0.5 - boxSD(x, y, 4.8, 4.9, 2.6, 2.6, 0.32, 0.5)) * (1 - top);
      const grain = 0.85 + 0.3 * hash(x, y + 77);
      const v = (0.17 * top + 0.06 * side) * grain;
      if (v > 0) { BG[3 * p] = v * 0.98 + BG[3 * p] * (1 - top - side); BG[3 * p + 1] = v * 0.93; BG[3 * p + 2] = v * 0.82; }
    }
  }
  // crumbs, top right: two flakes of croissant
  for (const [x, y, a] of [[57, 6, 0.9], [60, 10, 0.6], [54, 3, 0.5]]) {
    const p = y * W + x;
    BG[3 * p] = 0.30 * a; BG[3 * p + 1] = 0.16 * a; BG[3 * p + 2] = 0.05 * a;
  }
}

/** The cup's handle, on the saucer at angle ang: drawn into img (linear RGB). */
export function drawHandle(img, ang) {
  const hx = CX + 29.6 * Math.cos(ang), hy = CY + 29.6 * Math.sin(ang);
  const x0 = Math.max(0, Math.floor(hx - 6)), x1 = Math.min(W - 1, Math.ceil(hx + 7));
  const y0 = Math.max(0, Math.floor(hy - 6)), y1 = Math.min(H - 1, Math.ceil(hy + 7));
  const ca = Math.cos(ang), sa = Math.sin(ang);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const q = 3 * (y * W + x);
    // shadow cast down-right on the saucer
    const sd = boxSD(x - 1.5, y - 1.5, hx, hy, 4.0, 2.9, ang, 2.4);
    const sh = cl(0.8 - sd * 0.5) * 0.75;
    const hd = boxSD(x, y, hx, hy, 4.0, 2.9, ang, 2.4);
    const hole = boxSD(x, y, hx + 0.8 * ca, hy + 0.8 * sa, 1.7, 0.8, ang, 0.75);
    const k = cl(0.5 - hd) * cl(0.5 + hole), hs = cl(0.5 - hole) * cl(0.5 - hd);
    if (sh > 0 && hd > -0.5) for (let c = 0; c < 3; c++) img[q + c] *= 1 - sh;
    if (k > 0) {
      // white porcelain, rounded: lit from the upper left, a glint on the crown
      const lit = 0.55 + 0.45 * cl(-hd / 1.1) - 0.3 * ((x - hx) * 0.7 + (y - hy) * 0.7) / 4;
      for (let c = 0; c < 3; c++) img[q + c] += (PORC[c] * Math.max(0.25, lit) - img[q + c]) * k;
    }
    if (hs > 0) for (let c = 0; c < 3; c++) img[q + c] *= 1 - 0.6 * hs;
  }
}
