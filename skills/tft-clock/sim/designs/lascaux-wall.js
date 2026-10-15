// The cave wall for lascaux.js: the rock, the paint on it, and the torch.
//
// Built once at boot (on the device: a few hundred ms of integer noise at
// start-up, nothing in flash): a height field of calcite-crusted limestone
// (big bulges, mid-scale lumps, grain, a few cracks), turned into a slope map
// (NX, NY) and an albedo (AR, AG, AB) of pale calcite with ochre stains, grey
// patches and dark crack lines. Hand stencils and finger dots are blown into
// the albedo.
//
// Per frame, `light()` is the whole picture in one integer pass over the
// 12,800 pixels: the paint layer (PID / PA, stamped by lascaux.js) is mixed
// into the albedo multiplicatively (pigment soaks into the stone, so its
// grain shows through), then lit by a point torch held off the wall:
// falloff and incidence from two tables indexed by the squared distance,
// plus the bump term (slope . light direction), so as the torch moves and
// flickers the relief shifts under the paint. That is the Lascaux effect.
// Own ordered dither into RGB565. Priced honestly into g.cost (box 3 cycles
// per unit: ~14 per pixel, ~6 more where there is paint).

import { noise2, rand, hex, R, G, B } from '../js/kit.js';

export const W = 160, H = 80, N = W * H;

// ------------------------------------------------------------ the rock
export const AR = new Uint8Array(N), AG = new Uint8Array(N), AB = new Uint8Array(N);
export const NX = new Int8Array(N), NY = new Int8Array(N);
/** Grain: the stone's brightness relative to its mean, 128 = 1.0, so paint keeps the texture. */
export const GR = new Uint8Array(N);
/** Per-pixel noise 0..255 for dissolves and spatter. */
export const DIS = new Uint8Array(N);

// paint layer: pigment id and coverage, stamped every frame
export const PID = new Uint8Array(N), PA = new Uint8Array(N);
/** Pigments by id (0 unused). Set by the design. */
export const PIG_R = new Int32Array(12), PIG_G = new Int32Array(12), PIG_B = new Int32Array(12);

const HT = new Float32Array((W + 2) * (H + 2));

function crackDist(x, y, cr) {
  let d = 1e9;
  for (let i = 1; i < cr.length; i++) {
    const [ax, ay] = cr[i - 1], [bx, by] = cr[i];
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    let u = ((x - ax) * dx + (y - ay) * dy) / l2; u = u < 0 ? 0 : u > 1 ? 1 : u;
    const ex = x - ax - u * dx, ey = y - ay - u * dy, e = Math.sqrt(ex * ex + ey * ey);
    if (e < d) d = e;
  }
  return d;
}

// cracks: wandering polylines (seeded), mostly away from the digit cores
const CRACKS = [];
{
  const starts = [[60, -2, 0.35, 30], [150, 82, -2.2, 26], [84, 82, -1.4, 22], [-2, 64, -0.25, 34], [128, -2, 1.9, 18], [30, 82, -1.2, 14]];
  starts.forEach(([x, y, a, len], k) => {
    const pts = [[x, y]];
    for (let s = 0; s < len / 3; s++) {
      a += (rand(k, s, 77) - 0.5) * 0.9;
      x += Math.cos(a) * 3.2; y += Math.sin(a) * 3.2;
      pts.push([x, y]);
    }
    CRACKS.push(pts);
  });
}

// big relief: the bulges the painters used (a body on a bulge looks alive)
const BULGES = [[22, 30, 26, 0.9], [62, 40, 22, 0.7], [112, 30, 24, 0.85], [150, 60, 18, 0.5], [86, 70, 16, -0.5], [100, 4, 14, -0.4]];

for (let y = -1; y <= H; y++)
  for (let x = -1; x <= W; x++) {
    let h = 1.0 * noise2(x / 26, y / 20, 3) + 0.3 * noise2(x / 10, y / 9, 4) + 0.1 * noise2(x / 4.5, y / 4.5, 5) + 0.04 * noise2(x / 2, y / 2, 6);
    for (const [bx, by, br, bh] of BULGES) { const d2 = ((x - bx) ** 2 + (y - by) ** 2) / (br * br); h += bh * Math.exp(-d2 * 1.6); }
    for (const cr of CRACKS) { const d = crackDist(x, y, cr); if (d < 3) h -= 0.3 * Math.exp(-d * d / 1.1); }
    HT[(y + 1) * (W + 2) + x + 1] = h * 7;   // in pixels of height
  }

const CALCITE = hex('e9dcc0'), STAIN = hex('d49a5c'), GREY = hex('9a9184'), CRACK = hex('4a3626'), FLOOR = hex('6c4a30');
let lumSum = 0;
const LUM = new Float32Array(N);
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    const i = y * W + x, k = (y + 1) * (W + 2) + x + 1;
    const hx = (HT[k + 1] - HT[k - 1]) / 2, hy = (HT[k + W + 2] - HT[k - W - 2]) / 2;
    NX[i] = Math.max(-127, Math.min(127, Math.round(hx * 64)));
    NY[i] = Math.max(-127, Math.min(127, Math.round(hy * 64)));
    // albedo
    const st = noise2(x / 18, y / 14, 11), gr = noise2(x / 11, y / 16, 12), sp = rand(x, y, 13);
    let r = R(CALCITE), g = G(CALCITE), b = B(CALCITE);
    const ks = Math.max(0, st - 0.45) * 1.5;
    r += (R(STAIN) - r) * ks; g += (G(STAIN) - g) * ks; b += (B(STAIN) - b) * ks;
    const kg = Math.max(0, gr - 0.55) * 1.4;
    r += (R(GREY) - r) * kg; g += (G(GREY) - g) * kg; b += (B(GREY) - b) * kg;
    let kc = 0;
    for (const cr of CRACKS) { const d = crackDist(x + 0.5, y + 0.5, cr); kc = Math.max(kc, d < 0.6 ? 0.75 : d < 1.4 ? 0.3 : 0); }
    r += (R(CRACK) - r) * kc; g += (G(CRACK) - g) * kc; b += (B(CRACK) - b) * kc;
    const v = 0.9 + 0.2 * sp;                         // speckle
    r *= v; g *= v; b *= v;
    const kf = y > 70 ? Math.min(1, (y - 70) / 10 + 0.3 * noise2(x / 6, 0, 14)) * 0.7 : 0;  // the clay ledge at the foot
    r += (R(FLOOR) - r) * kf; g += (G(FLOOR) - g) * kf; b += (B(FLOOR) - b) * kf;
    AR[i] = Math.min(255, r); AG[i] = Math.min(255, g); AB[i] = Math.min(255, b);
    LUM[i] = r * 0.3 + g * 0.59 + b * 0.11; lumSum += LUM[i];
    DIS[i] = (rand(x, y, 21) * 0.3 + noise2(x / 3.2, y / 3.2, 22) * 0.7) * 255;
  }
{
  const mean = lumSum / N;
  for (let i = 0; i < N; i++) GR[i] = Math.max(70, Math.min(170, Math.round(LUM[i] / mean * 128)));
}

/** Blow pigment into the albedo (boot only): coverage function -> mix toward colour c. */
export function blowAlbedo(cov, c, x0, y0, x1, y1) {
  for (let y = Math.max(0, y0); y < Math.min(H, y1); y++)
    for (let x = Math.max(0, x0); x < Math.min(W, x1); x++) {
      const a = cov(x + 0.5, y + 0.5);
      if (a <= 0) continue;
      const i = y * W + x, k = a > 1 ? 1 : a, gg = GR[i] / 128;
      AR[i] += (R(c) * gg - AR[i]) * k; AG[i] += (G(c) * gg - AG[i]) * k; AB[i] += (B(c) * gg - AB[i]) * k;
    }
}

// hand stencils: a hand pressed to the wall and red ochre blown round it,
// so the hand stays bare rock inside a soft spray halo (boot only)
function handDist(px, py, hx, hy, rot, sz) {
  const c = Math.cos(rot), s = Math.sin(rot);
  const u = ((px - hx) * c + (py - hy) * s) / sz, v = (-(px - hx) * s + (py - hy) * c) / sz;
  let d = Math.sqrt((u / 3.3) ** 2 + ((v - 1.6) / 3.6) ** 2) * 3.3 - 3.3;   // palm
  const F = [[-2.4, -1.4, -2.9, -6.4, 0.85], [-0.8, -1.8, -1.0, -8.2, 0.95], [0.9, -1.8, 1.0, -8.0, 0.95], [2.4, -1.4, 2.9, -6.6, 0.85], [3.0, 2.2, 6.4, -0.4, 0.95]];
  for (const [ax, ay, bx, by, r] of F) {
    const dx = bx - ax, dy = by - ay; let w = ((u - ax) * dx + (v - ay) * dy) / (dx * dx + dy * dy); w = w < 0 ? 0 : w > 1 ? 1 : w;
    d = Math.min(d, Math.hypot(u - ax - w * dx, v - ay - w * dy) - r);
  }
  return d * sz;
}
const OCHRE_SPRAY = hex('a8402a');
for (const [hx, hy, rot, sz] of [[151, 13, 0.25, 1.3], [79, 68, -0.5, 1.1]]) {
  blowAlbedo((x, y) => {
    const d = handDist(x, y, hx, hy, rot, sz);
    if (d < 0) return 0;
    const k = 1.15 - d / 7;
    return k <= 0 ? 0 : Math.min(1, k) * (0.7 + 0.3 * noise2(x / 1.6, y / 1.6, 51)) * (rand(x | 0, y | 0, 52) < 0.12 ? 0.5 : 1);
  }, OCHRE_SPRAY, hx - 20, hy - 20, hx + 20, hy + 18);
}
// the separator: two finger-dabs of red ochre, a sign as old as the herds
for (const [dx, dy] of [[80.5, 30.5], [80.0, 41.5]])
  blowAlbedo((x, y) => { const d = Math.hypot(x - dx, y - dy) - 1.9; return d < 0 ? 0.92 : 0.92 * Math.max(0, 1 - d / 1.2) * noise2(x, y, 53); }, hex('9a3424'), dx - 5, dy - 5, dx + 5, dy + 5);

// ------------------------------------------------------------ the torch
export const LZ = 44;          // the flame's distance from the wall, pixels
const RF = 135;                // falloff radius
const DSH = 4, NL = ((W * W + H * H) >> DSH) + 2;
const LF = new Int32Array(NL), LI = new Int32Array(NL);
for (let k = 0; k < NL; k++) {
  const d2 = k << DSH, l = Math.sqrt(d2 + LZ * LZ);
  const fall = 1 / (1 + d2 / (RF * RF));
  LF[k] = Math.round(256 * fall * (LZ / l) * 1.05);          // flat incidence x falloff, 256 = 1
  LI[k] = Math.round(256 * fall * 1.05 * 4096 * 1.2 / (64 * l)); // bump term, x1.8 relief
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((t) => t * 4096 + 2048);

/**
 * The frame: albedo + paint, lit. L = { x, y, ar, ag, ab (ambient, 256 = 1),
 * tr, tg, tb (torch colour x intensity, 256 = 1) }.
 */
export function light(g, L) {
  const buf = g.buf, lx = L.x, ly = L.y;
  const ar = L.ar, ag = L.ag, ab = L.ab, tr = L.tr, tg = L.tg, tb = L.tb;
  let painted = 0;
  for (let y = 0; y < H; y++) {
    const dy = ly - y - 0.5, dy2 = dy * dy;
    const t0 = BAYER[(y & 3) << 2], t1 = BAYER[((y & 3) << 2) | 1], t2 = BAYER[((y & 3) << 2) | 2], t3 = BAYER[((y & 3) << 2) | 3];
    let i = y * W;
    for (let x = 0; x < W; x++, i++) {
      const dx = lx - x - 0.5;
      const k = ((dx * dx + dy2) | 0) >> DSH;
      let lit = LF[k] - (((NX[i] * dx + NY[i] * dy) * LI[k]) >> 12);
      if (lit < 0) lit = 0;
      let r = AR[i], gg = AG[i], b = AB[i];
      const a = PA[i];
      if (a) {
        const p = PID[i], gr = GR[i];
        r += ((((PIG_R[p] * gr) >> 7) - r) * a) >> 8;
        gg += ((((PIG_G[p] * gr) >> 7) - gg) * a) >> 8;
        b += ((((PIG_B[p] * gr) >> 7) - b) * a) >> 8;
        painted++;
      }
      r = (r * (ar + ((lit * tr) >> 8))) >> 8;
      gg = (gg * (ag + ((lit * tg) >> 8))) >> 8;
      b = (b * (ab + ((lit * tb) >> 8))) >> 8;
      if (r > 255) r = 255; if (gg > 255) gg = 255; if (b > 255) b = 255;
      if (r < 0) r = 0; if (gg < 0) gg = 0; if (b < 0) b = 0;
      const t = (x & 3) === 0 ? t0 : (x & 3) === 1 ? t1 : (x & 3) === 2 ? t2 : t3;
      let r5 = (r * 7967 + t) >> 16, g6 = (gg * 16191 + t) >> 16, b5 = (b * 7967 + t) >> 16;
      if (r5 > 31) r5 = 31; if (g6 > 63) g6 = 63; if (b5 > 31) b5 = 31;
      buf[i] = (r5 << 11) | (g6 << 5) | b5;
    }
  }
  const c = g.cost;
  c.calls++; c.px += N; c.dither += N; c.box += N * 14 + painted * 6;
}

/** The light falling at (x, y), flat wall, as channel multipliers (256 = 1): for things drawn over the wall. */
export function lightAt(x, y, L, out) {
  const dx = L.x - x, dy = L.y - y, k = ((dx * dx + dy * dy) | 0) >> DSH, lit = LF[k < NL ? k : NL - 1];
  out[0] = L.ar + ((lit * L.tr) >> 8); out[1] = L.ag + ((lit * L.tg) >> 8); out[2] = L.ab + ((lit * L.tb) >> 8);
  return out;
}

/** Clear the paint layer (a memset). */
export function clearPaint(g) {
  PA.fill(0);
  g.cost.px += N >> 2;
}
