// Shadowplay's cloth: a 128x64 transmittance buffer. The lamp lights the
// screen; every leather piece pressed against it multiplies the light by its
// dye (carved outline nearly black, pierced holes fully clear). A piece lifted
// off the cloth toward the lamp casts a bigger, softer, paler shadow.
export const W = 128, H = 64, N = W * H;
export const T = new Float32Array(3 * N);
export const LAMP_X = 64, LAMP_Y = 40;      // where the lamp sits behind the cloth (px)
const DARK = 0.035;                         // the black-painted carved rim

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

/**
 * A leather piece. kind 0: a strip along a polyline (half-width hw);
 * kind 1: a closed polygon. Points are px, relative to the piece's pivot.
 * pat 0 plain, 1 beads pierced along the strip, 2 hex lattice of holes,
 * 3 a carved centre line.
 */
export class Piece {
  constructor(kind, pts, hw, col, pat, sp, hr) {
    this.kind = kind;
    this.pts = Float64Array.from(pts);
    this.n = pts.length >> 1;
    this.cum = new Float64Array(this.n);
    this.hw = hw;
    this.r = col[0]; this.g = col[1]; this.b = col[2];
    this.pat = pat; this.sp = sp; this.hr = hr;
    this.knob = 0; this.ik = 1 / Math.max(0.5, 1.7 * hw);
    this.len = 0; this.bx0 = 0; this.by0 = 0; this.bx1 = 0; this.by1 = 0;
    this.set(pts);
  }
  /** Reshape in place (same number of points): for limbs bent each frame. */
  set(pts) {
    const m = this.n, P = this.pts, cum = this.cum;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (let k = 0; k < m; k++) {
      const x = (P[2 * k] = pts[2 * k]), y = (P[2 * k + 1] = pts[2 * k + 1]);
      cum[k] = k ? cum[k - 1] + Math.hypot(x - P[2 * k - 2], y - P[2 * k - 1]) : 0;
      if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y;
    }
    this.len = cum[m - 1];
    const e = this.kind === 0 ? this.hw * 1.4 : 0;
    this.bx0 = x0 - e; this.by0 = y0 - e; this.bx1 = x1 + e; this.by1 = y1 + e;
  }
}

export function clear() { T.fill(1); }

// scratch results of the distance query (monomorphic, no allocation)
let qs = 0;
/** Signed distance (local px) from (x, y) to the piece; sets qs = arc length at the nearest point. */
function sdist(pc, x, y) {
  const p = pc.pts, n = pc.n;
  if (pc.kind === 0) {
    let best = 1e18, bs = 0;
    for (let k = 0; k + 1 < n; k++) {
      const ax = p[2 * k], ay = p[2 * k + 1], dx = p[2 * k + 2] - ax, dy = p[2 * k + 3] - ay;
      const l2 = dx * dx + dy * dy;
      let t = l2 > 0 ? ((x - ax) * dx + (y - ay) * dy) / l2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = x - ax - t * dx, ey = y - ay - t * dy, d2 = ex * ex + ey * ey;
      if (d2 < best) { best = d2; bs = pc.cum[k] + t * (pc.cum[k + 1] - pc.cum[k]); }
    }
    qs = bs;
    // carved ends swell into round knobs, like the overlapping discs at a puppet's joints
    const e = Math.min(bs, pc.len - bs) * pc.ik;
    const sw = e < 1 ? (1 - e) * (1 - e) * pc.knob : 0;
    return Math.sqrt(best) - pc.hw * (1 + sw);
  }
  let best = 1e18, inside = false;
  for (let k = 0, j = n - 1; k < n; j = k++) {
    const ax = p[2 * j], ay = p[2 * j + 1], bx = p[2 * k], by = p[2 * k + 1];
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    let t = l2 > 0 ? ((x - ax) * dx + (y - ay) * dy) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = x - ax - t * dx, ey = y - ay - t * dy, d2 = ex * ex + ey * ey;
    if (d2 < best) best = d2;
    if ((ay > y) !== (by > y) && x < ax + ((y - ay) * dx) / dy) inside = !inside;
  }
  qs = 0;
  const d = Math.sqrt(best);
  return inside ? -d : d;
}

/**
 * Press a piece onto the cloth. (ox, oy) is where its pivot lands (px),
 * ang its rotation, z its lift off the cloth (0 pressed .. 1 near the lamp),
 * alpha a fade. The shadow grows and softens with z, about the lamp.
 */
export function draw(pc, ox, oy, ang, z, alpha) {
  if (alpha <= 0.003) return;
  const g = 1 + 0.32 * z;
  ox = LAMP_X + (ox - LAMP_X) * g; oy = LAMP_Y + (oy - LAMP_Y) * g;
  const c = Math.cos(ang), s = Math.sin(ang);
  const bl = 0.75 + 6 * z;                         // edge softness, px
  const detail = clamp01(1 - 2.2 * z);
  const op = alpha * (1 - 0.7 * clamp01(z));
  // world bbox
  let wx0 = 1e9, wy0 = 1e9, wx1 = -1e9, wy1 = -1e9;
  for (let q = 0; q < 4; q++) {
    const lx = q & 1 ? pc.bx1 : pc.bx0, ly = q & 2 ? pc.by1 : pc.by0;
    const wx = ox + g * (c * lx - s * ly), wy = oy + g * (s * lx + c * ly);
    if (wx < wx0) wx0 = wx; if (wx > wx1) wx1 = wx; if (wy < wy0) wy0 = wy; if (wy > wy1) wy1 = wy;
  }
  const xa = Math.max(0, Math.floor(wx0 - bl)), xb = Math.min(W - 1, Math.ceil(wx1 + bl));
  const ya = Math.max(0, Math.floor(wy0 - bl)), yb = Math.min(H - 1, Math.ceil(wy1 + bl));
  if (xa > xb || ya > yb) return;
  const ig = 1 / g, ow = 1.0, hr = pc.hr, sp = pc.sp, pat = pc.pat;
  const mr = DARK + (pc.r - DARK) * 0.75, mg = DARK + (pc.g - DARK) * 0.75, mb = DARK + (pc.b - DARK) * 0.75;
  for (let y = ya; y <= yb; y++) {
    const ry = y - oy;
    for (let x = xa; x <= xb; x++) {
      const rx = x - ox;
      const lx = (c * rx + s * ry) * ig, ly = (-s * rx + c * ry) * ig;
      if (lx < pc.bx0 - bl || lx > pc.bx1 + bl || ly < pc.by0 - bl || ly > pc.by1 + bl) continue;
      const sd = sdist(pc, lx, ly);
      const cov = clamp01(0.5 - sd / bl);
      if (cov <= 0) continue;
      const inner = clamp01((-sd - ow) * 1.1 + 0.5);
      let tr = DARK + (pc.r - DARK) * inner, tg = DARK + (pc.g - DARK) * inner, tb = DARK + (pc.b - DARK) * inner;
      if (pat && detail > 0 && -sd > ow + 0.4) {
        let hole = 0;
        if (pat === 1) {
          if (qs > sp * 0.55 && qs < pc.len - sp * 0.55) {
            const u = qs / sp, ru = Math.round(u), f = (u - ru) * sp, dperp = sd + pc.hw;
            hole = clamp01((ru & 1 ? hr * 0.55 : hr) - Math.sqrt(f * f + dperp * dperp) + 0.5);
          }
        } else if (pat === 2) {
          const rr = Math.round(ly / (sp * 0.866)), xo = (rr & 1) * sp * 0.5;
          const cx = Math.round((lx - xo) / sp) * sp + xo, ex = lx - cx, ey = ly - rr * sp * 0.866;
          hole = clamp01(hr - Math.sqrt(ex * ex + ey * ey) + 0.5) * clamp01(-sd - ow - hr);
        } else if (pat === 3) {
          const dperp = sd + pc.hw;
          if (qs > 1.5 && qs < pc.len - 1.5) { const k = clamp01(hr - dperp + 0.5); tr *= 1 - 0.8 * k; tg *= 1 - 0.8 * k; tb *= 1 - 0.8 * k; }
        }
        if (hole > 0) { hole *= detail * inner; tr += (1 - tr) * hole; tg += (1 - tg) * hole; tb += (1 - tb) * hole; }
      }
      if (detail < 1) { tr = mr + (tr - mr) * detail; tg = mg + (tg - mg) * detail; tb = mb + (tb - mb) * detail; }
      const a = cov * op, p = 3 * (y * W + x);
      T[p] *= 1 - a * (1 - tr); T[p + 1] *= 1 - a * (1 - tg); T[p + 2] *= 1 - a * (1 - tb);
    }
  }
}

/** A round thing pressed on the cloth: a rivet, an eye. tr = transmittance (scalar or tinted). */
export function dot(x, y, r, tr, tg, tb, z, alpha) {
  const g = 1 + 0.45 * z;
  x = LAMP_X + (x - LAMP_X) * g; y = LAMP_Y + (y - LAMP_Y) * g; r *= g;
  const bl = 0.75 + 6 * z, op = alpha * (1 - 0.55 * clamp01(z));
  const xa = Math.max(0, Math.floor(x - r - bl)), xb = Math.min(W - 1, Math.ceil(x + r + bl));
  const ya = Math.max(0, Math.floor(y - r - bl)), yb = Math.min(H - 1, Math.ceil(y + r + bl));
  for (let py = ya; py <= yb; py++) for (let px = xa; px <= xb; px++) {
    const d = Math.hypot(px - x, py - y) - r, a = clamp01(0.5 - d / bl) * op;
    if (a <= 0) continue;
    const p = 3 * (py * W + px);
    T[p] *= 1 - a * (1 - tr); T[p + 1] *= 1 - a * (1 - tg); T[p + 2] *= 1 - a * (1 - tb);
  }
}

/** Light let back through: a hole cut after the fact (an eye). Pulls T toward 1. */
export function hole(x, y, r, k) {
  const xa = Math.max(0, Math.floor(x - r - 1)), xb = Math.min(W - 1, Math.ceil(x + r + 1));
  const ya = Math.max(0, Math.floor(y - r - 1)), yb = Math.min(H - 1, Math.ceil(y + r + 1));
  for (let py = ya; py <= yb; py++) for (let px = xa; px <= xb; px++) {
    const a = clamp01(r - Math.hypot(px - x, py - y) + 0.5) * k;
    if (a <= 0) continue;
    const p = 3 * (py * W + px);
    T[p] += (1 - T[p]) * a; T[p + 1] += (1 - T[p + 1]) * a; T[p + 2] += (1 - T[p + 2]) * a;
  }
}

/** A bamboo control rod: a thin line that leaves the cloth toward the operator (z0 -> z1). */
export function rod(x0, y0, x1, y1, hw, tr, z0, z1, alpha) {
  const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy;
  const zm = Math.max(z0, z1), blm = 0.75 + 6 * zm;
  const xa = Math.max(0, Math.floor(Math.min(x0, x1) - hw - blm)), xb = Math.min(W - 1, Math.ceil(Math.max(x0, x1) + hw + blm));
  const ya = Math.max(0, Math.floor(Math.min(y0, y1) - hw - blm)), yb = Math.min(H - 1, Math.ceil(Math.max(y0, y1) + hw + blm));
  for (let py = ya; py <= yb; py++) for (let px = xa; px <= xb; px++) {
    let t = ((px - x0) * dx + (py - y0) * dy) / l2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = px - x0 - t * dx, ey = py - y0 - t * dy;
    const z = z0 + (z1 - z0) * t, bl = 0.75 + 6 * z;
    const a = clamp01(0.5 - (Math.sqrt(ex * ex + ey * ey) - hw * (1 + 0.45 * z)) / bl) * alpha * (1 - 0.6 * clamp01(z));
    if (a <= 0) continue;
    const p = 3 * (py * W + px), k = 1 - a * (1 - tr);
    T[p] *= k; T[p + 1] *= k; T[p + 2] *= k;
  }
}
