// PEZ — a candy dispenser that fires the minutes at you, in real 3D.
//
// A chunky PEZ dispenser stands at the back of a table; its stem carries the
// hour, a big candy brick close to the lens carries the minutes. Everything
// is real geometry (boxes, chamfered octagonal prisms, ear prisms) projected
// through a perspective camera, faces culled by winding, painted far to
// near, each solid black inside with a lit silhouette, numerals mapped onto
// faces through each quad's homography. The numerals are a pressed-candy
// hand of their own: fat filleted strokes, tabulated once.
//
// Idle: the dispenser sways on its base, the head clicks open a hair every
// second (a thumb testing the hinge), the character watches its candy,
// blinks and now and then glances at you; the candy rocks; the camera
// drifts (burn-in).
//
// The minute: from :56.5 the head tips back and the next candy creeps out
// under the chin, trembling; at :00 the head flicks, the candy shoots out,
// cartwheels towards the lens growing three times, and lands square on the
// old one, knocking it tumbling off the right edge; two small bounces, the
// head snaps shut. The old minute stays until it is hit (0.46 s).
//
// The hour: at :59 the head opens on an empty stem and the dispenser
// rattles; at :00 it and the old candy drop through the table, a new
// dispenser (the next of cat, bear, robot) springs up with the new hour,
// cocks and fires 00 into the slot. No instant shows a wrong hour with a
// minute: the old minute sinks with the old hour.
//
// 23:00-07:00 the panel dims (ctx.night).

import { clamp, ease, progress, previousMinute } from '../js/kit.js';

const W = 128, H = 64;
const TAU = Math.PI * 2;

// ------------------------------------------------------------ letterforms
// Pressed-candy numerals: fat, soft-cornered, drawn as filleted centre lines
// on a 10 x 16 grid and tabulated at GU samples per unit.
const GU = 4, GW = 10 * GU, GH = 16 * GU, SW = 3.7;
const L = 1.85, R = 8.15, T = 1.85, B = 14.15, M = 7.5;
const GLYPH_PATHS = {
  0: [[[L, T, 3.1], [R, T, 3.1], [R, B, 3.1], [L, B, 3.1]], 'closed'],
  1: [[[2.4, 4.8], [5.6, T, 0.6], [5.6, B]]],
  2: [[[L, 5.4], [L, T, 2.9], [R, T, 2.9], [R, 6.8, 2.6], [L, B, 0.3], [R + 0.1, B]]],
  3: [[[L, T], [R, T, 2.7], [R, M, 2.2], [4.2, M]], [[4.2, M], [R, M, 2.8], [R, B, 2.8], [L, B]]],
  4: [[[R + 0.4, 10.4], [L - 0.2, 10.4, 0.5], [6.5, T, 0.5], [6.5, B]]],
  5: [[[R, T], [L, T, 0.3], [L, M, 0.3], [R, M, 3.0], [R, B, 3.0], [L, B]]],
  6: [[[R, T], [L, T, 3.1], [L, B, 3.1], [R, B, 3.0], [R, M, 3.0], [L, M]]],
  7: [[[L, T], [R, T, 0.6], [4.3, B]]],
  8: [[[L + 0.4, T, 2.6], [R - 0.4, T, 2.6], [R - 0.4, M, 2.6], [L + 0.4, M, 2.6]], 'closed',
      [[L, M, 2.9], [R, M, 2.9], [R, B, 2.9], [L, B, 2.9]], 'closed'],
  9: [[[L, B], [R, B, 3.0], [R, T, 3.1], [L, T, 3.1], [L, 8.7, 3.0], [R, 8.7]]],
};

/** Corner-rounded polyline: each [x, y, r] corner becomes a quadratic arc. */
function fillet(pts, closed) {
  const out = [], n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = pts[i], r = p[2] ?? 0;
    const end = !closed && (i === 0 || i === n - 1);
    if (end || !r) { out.push([p[0], p[1]]); continue; }
    const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
    const la = Math.hypot(a[0] - p[0], a[1] - p[1]), lb = Math.hypot(b[0] - p[0], b[1] - p[1]);
    const ra = Math.min(r, la / 2), rb = Math.min(r, lb / 2);
    const s = [p[0] + (a[0] - p[0]) * ra / la, p[1] + (a[1] - p[1]) * ra / la];
    const e = [p[0] + (b[0] - p[0]) * rb / lb, p[1] + (b[1] - p[1]) * rb / lb];
    for (let k = 0; k <= 8; k++) {
      const u = k / 8, w0 = (1 - u) ** 2, w1 = 2 * u * (1 - u), w2 = u * u;
      out.push([w0 * s[0] + w1 * p[0] + w2 * e[0], w0 * s[1] + w1 * p[1] + w2 * e[1]]);
    }
  }
  if (closed) out.push(out[0]);
  return out;
}

function segD(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  const u = l2 ? clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1) : 0;
  return Math.hypot(px - ax - u * dx, py - ay - u * dy);
}

const GLYPHS = [];
for (let d = 0; d < 10; d++) {
  const spec = GLYPH_PATHS[d], lines = [];
  for (let i = 0; i < spec.length; i++) {
    if (typeof spec[i] === 'string') continue;
    lines.push(fillet(spec[i], spec[i + 1] === 'closed'));
  }
  const bm = new Uint8Array(GW * GH);
  for (let y = 0; y < GH; y++)
    for (let x = 0; x < GW; x++) {
      const px = (x + 0.5) / GU, py = (y + 0.5) / GU;
      let dm = 99;
      for (const ln of lines)
        for (let k = 0; k + 1 < ln.length; k++) dm = Math.min(dm, segD(px, py, ln[k][0], ln[k][1], ln[k + 1][0], ln[k + 1][1]));
      bm[y * GW + x] = dm < SW / 2 ? 1 : 0;
    }
  GLYPHS.push(bm);
}
/** Glyph d at (lu, lv) in 0..1 of its box. */
function glyph(d, lu, lv) {
  if (lu < 0 || lu >= 1 || lv < 0 || lv >= 1) return 0;
  return GLYPHS[d][((lv * GH) | 0) * GW + ((lu * GW) | 0)];
}
/** Two digits of `n` laid on a face: box [u0,v0,u1,v1], gap as a fraction of the box width. */
function twoDigits(n, u, v, u0, v0, u1, v1, gap) {
  if (v < v0 || v >= v1 || u < u0 || u >= u1) return 0;
  const lv = (v - v0) / (v1 - v0), x = (u - u0) / (u1 - u0);
  const dw = (1 - gap) / 2;
  if (x < dw) return glyph((n / 10) | 0, x / dw, lv);
  if (x >= 1 - dw) return glyph(n % 10, (x - 1 + dw) / dw, lv);
  return 0;
}

// ------------------------------------------------------------ camera
const F = 120;            // focal length, px
const HY = 50;            // principal row
const CAM = { x: 0, y: 0.35, z: 0, ox: 0, oy: 0, cp: Math.cos(0.03), sp: Math.sin(0.03) };

const P = new Float64Array(32 * 3);   // projected scratch: sx, sy, z per vertex

function project(x, y, z, out, k) {
  const X = x - CAM.x, Y0 = y - CAM.y, Z0 = z - CAM.z;
  const Z = -Y0 * CAM.sp + Z0 * CAM.cp, Y = Y0 * CAM.cp + Z0 * CAM.sp;
  out[k] = 64 + CAM.ox + F * X / Z;
  out[k + 1] = HY + CAM.oy - F * Y / Z;
  out[k + 2] = Z;
}

// ------------------------------------------------------------ rotations
function rot(yaw, pitch, roll) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const cr = Math.cos(roll), sr = Math.sin(roll);
  // Ry * Rx * Rz
  const Rz = [cr, -sr, 0, sr, cr, 0, 0, 0, 1];
  const Rx = [1, 0, 0, 0, cp, -sp, 0, sp, cp];
  const Ry = [cy, 0, sy, 0, 1, 0, -sy, 0, cy];
  return mul(Ry, mul(Rx, Rz));
}
function mul(A, B) {
  const C = new Array(9);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) C[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j];
  return C;
}

// ------------------------------------------------------------ raster
const S = new Float64Array(16);
let CLIP_Y = H;

/**
 * Fill a convex screen polygon S[0..2n) (clockwise on screen) with a lit
 * outline `lw` px wide inside its edges, and its inside from
 * shade(u, v, x, y) (1 lit, 0 dark, -1 leave); u, v are the quad's own
 * coordinates when n is 4 (corners at uv 00 10 11 01), else 0.
 */
const UQ = new Float64Array(8), EB = new Float64Array(64);
const MASK = new Int32Array(W * H);
let STAMP = 1, BX0 = W, BX1 = -1, BY0 = H, BY1 = -1;
let USE_UQ = false;
function raster(g, n, lw, shade) {
  let xa = 1e9, xb = -1e9, ya = 1e9, yb = -1e9;
  for (let i = 0; i < n; i++) {
    const x = S[2 * i], y = S[2 * i + 1];
    if (x < xa) xa = x; if (x > xb) xb = x; if (y < ya) ya = y; if (y > yb) yb = y;
  }
  xa = Math.max(0, Math.floor(xa)); xb = Math.min(W - 1, Math.ceil(xb));
  ya = Math.max(0, Math.floor(ya)); yb = Math.min(CLIP_Y - 1, H - 1, Math.ceil(yb));
  if (xa > xb || ya > yb) return;
  if (xa < BX0) BX0 = xa; if (xb > BX1) BX1 = xb; if (ya < BY0) BY0 = ya; if (yb > BY1) BY1 = yb;
  const E = EB, NE = n * 4;
  for (let i = 0; i < n; i++) {
    const ax = S[2 * i], ay = S[2 * i + 1], bx = S[(2 * i + 2) % (2 * n)], by = S[(2 * i + 3) % (2 * n)];
    const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1;
    E[4 * i] = ax; E[4 * i + 1] = ay; E[4 * i + 2] = dx / l; E[4 * i + 3] = dy / l;
  }
  let hA = 0, hB = 0, hC = 0, hD = 0, hE = 0, hF = 0, hG = 0, hH = 0, hI = 0, uv = false;
  if ((n === 4 || USE_UQ) && shade) {
    const Q = USE_UQ ? UQ : S;
    const x0 = Q[0], y0 = Q[1], x1 = Q[2], y1 = Q[3], x2 = Q[4], y2 = Q[5], x3 = Q[6], y3 = Q[7];
    const sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3;
    const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2;
    const den = dx1 * dy2 - dx2 * dy1;
    if (Math.abs(den) > 1e-9) {
      const gg = (sx * dy2 - dx2 * sy) / den, hh = (dx1 * sy - sx * dy1) / den;
      const a = x1 - x0 + gg * x1, b = x3 - x0 + hh * x3, c = x0;
      const d = y1 - y0 + gg * y1, e = y3 - y0 + hh * y3, f = y0;
      hA = e - f * hh; hB = c * hh - b; hC = b * f - c * e;
      hD = f * gg - d; hE = a - c * gg; hF = c * d - a * f;
      hG = d * hh - e * gg; hH = b * gg - a * hh; hI = a * e - b * d;
      uv = true;
    }
  }
  const buf = g.buf;
  for (let y = ya; y <= yb; y++) {
    const py = y + 0.5;
    for (let x = xa; x <= xb; x++) {
      const px = x + 0.5;
      let dm = 1e9, k = 0;
      for (; k < NE; k += 4) {
        const d = (py - E[k + 1]) * E[k + 2] - (px - E[k]) * E[k + 3];
        if (d < 0) break;
        if (d < dm) dm = d;
      }
      if (k < NE) continue;
      MASK[y * W + x] = STAMP;
      let r;
      if (dm < lw) r = 1;
      else if (!shade) r = 0;
      else if (uv) {
        const w = hG * px + hH * py + hI;
        r = shade((hA * px + hB * py + hC) / w, (hD * px + hE * py + hF) / w, x, y);
      } else r = shade(0, 0, x, y);
      if (r >= 0) buf[y * W + x] = r;
    }
  }
}

// ------------------------------------------------------------ solids
// A solid: local vertices and faces (vertex index lists, outward winding by
// (b-a)x(c-b)). Faces with a `tex` key are textured by the caller.
function boxSolid(x0, x1, y0, y1, z0, z1) {
  const v = [];
  for (let i = 0; i < 8; i++) v.push([i & 1 ? x1 : x0, i & 2 ? y1 : y0, i & 4 ? z1 : z0]);
  const id = (x, y, z) => x | (y << 1) | (z << 2);
  return {
    v,
    f: [
      { i: [id(0, 1, 0), id(1, 1, 0), id(1, 0, 0), id(0, 0, 0)], tex: 'front' },
      { i: [id(1, 1, 1), id(0, 1, 1), id(0, 0, 1), id(1, 0, 1)], tex: 'back' },
      { i: [id(0, 1, 1), id(0, 1, 0), id(0, 0, 0), id(0, 0, 1)], tex: 'left' },
      { i: [id(1, 1, 0), id(1, 1, 1), id(1, 0, 1), id(1, 0, 0)], tex: 'right' },
      { i: [id(0, 1, 1), id(1, 1, 1), id(1, 1, 0), id(0, 1, 0)], tex: 'top' },
      { i: [id(0, 0, 0), id(1, 0, 0), id(1, 0, 1), id(0, 0, 1)], tex: 'bottom' },
    ],
  };
}
/** A prism from a convex outline in the x-y plane, z from z0 to z1. */
function prismSolid(outline, z0, z1, rect) {
  const n = outline.length, v = [];
  for (const [x, y] of outline) v.push([x, y, z0]);
  for (const [x, y] of outline) v.push([x, y, z1]);
  const f = [{ i: outline.map((_, k) => k), tex: 'front' }, { i: outline.map((_, k) => n + k), tex: 'back' }];
  for (let k = 0; k < n; k++) f.push({ i: [k, (k + 1) % n, n + (k + 1) % n, n + k], tex: 'side' });
  // Fix windings outward.
  const c = [0, 0, 0];
  for (const p of v) { c[0] += p[0] / v.length; c[1] += p[1] / v.length; c[2] += p[2] / v.length; }
  for (const face of f) {
    const [a, b, cc] = face.i.map((k) => v[k]);
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [cc[0] - b[0], cc[1] - b[1], cc[2] - b[2]];
    const nrm = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    let fc = [0, 0, 0];
    for (const k of face.i) { fc[0] += v[k][0]; fc[1] += v[k][1]; fc[2] += v[k][2]; }
    fc = fc.map((q) => q / face.i.length - 0);
    const dot = nrm[0] * (fc[0] - c[0]) + nrm[1] * (fc[1] - c[1]) + nrm[2] * (fc[2] - c[2]);
    if (dot < 0) face.i.reverse();
  }
  if (rect) {
    const [x0, y0, x1, y1] = rect;
    f[0].uvq = [[x0, y1, z0], [x1, y1, z0], [x1, y0, z0], [x0, y0, z0]];
    f[1].uvq = [[x1, y1, z1], [x0, y1, z1], [x0, y0, z1], [x1, y0, z1]];
  }
  return { v, f };
}
/** A box with its four edges along z bevelled by c: front and back are octagons. */
function chamferSolid(x0, x1, y0, y1, z0, z1, c) {
  return prismSolid([[x0 + c, y0], [x1 - c, y0], [x1, y0 + c], [x1, y1 - c], [x1 - c, y1], [x0 + c, y1], [x0, y1 - c], [x0, y0 + c]],
    z0, z1, [x0, y0, x1, y1]);
}

/**
 * Draw solid `so` placed by `place(local) -> world` into the screen, faces
 * that look at the camera only, each filled from texs[face.tex] (or dark).
 */
const WV = [];
function drawSolid(g, so, place, texs = {}, edges = 'front') {
  const nv = so.v.length;
  STAMP++; BX0 = W; BX1 = -1; BY0 = H; BY1 = -1;
  for (let k = 0; k < nv; k++) {
    const w = place(so.v[k]);
    project(w[0], w[1], w[2], P, k * 3);
    if (P[k * 3 + 2] < 0.3) return;
  }
  for (const face of so.f) {
    const n = face.i.length;
    let area = 0;
    for (let k = 0; k < n; k++) {
      const a = face.i[k] * 3, b = face.i[(k + 1) % n] * 3;
      area += P[a] * P[b + 1] - P[b] * P[a + 1];
    }
    if (area <= 0.05) continue;
    for (let k = 0; k < n; k++) { S[2 * k] = P[face.i[k] * 3]; S[2 * k + 1] = P[face.i[k] * 3 + 1]; }
    const tex = texs[face.tex] ?? null;
    USE_UQ = false;
    if (tex && face.uvq) {
      for (let k = 0; k < 4; k++) {
        const w = place(face.uvq[k]);
        project(w[0], w[1], w[2], P, 31 * 3);
        UQ[2 * k] = P[93]; UQ[2 * k + 1] = P[94];
      }
      USE_UQ = true;
    }
    raster(g, n, edges.includes(face.tex) ? 1 : 0, tex);
  }
  // The silhouette: every pixel of the solid with a neighbour outside it.
  const buf = g.buf, cy = Math.min(CLIP_Y, H);
  const inside = (x, y) => x < 0 || x >= W || y < 0 || y >= cy || MASK[y * W + x] === STAMP;
  for (let y = BY0; y <= BY1; y++)
    for (let x = BX0; x <= BX1; x++) {
      if (MASK[y * W + x] !== STAMP) continue;
      if (!inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1)) buf[y * W + x] = 1;
    }
}

// ------------------------------------------------------------ the props
// World units: the candy is 1.4 x 0.85 x 0.7.
const CL = 1.4, CHT = 0.85, CD = 0.7;
const CANDY = chamferSolid(-CL / 2, CL / 2, -CHT / 2, CHT / 2, -CD / 2, CD / 2, 0.14);
const STW = 2.0, STH = 1.45, STD = 1.5;          // stem
const STEM = boxSolid(-STW / 2, STW / 2, 0, STH, -STD / 2, STD / 2);
const HDW = 2.2, HDH = 1.0, HDD = 1.8;           // head, hinged at the stem's top back edge
const HEAD = chamferSolid(-HDW / 2, HDW / 2, 0, HDH, -HDD + 0.15, 0.15, 0.3);
const EZ0 = -HDD + 0.45, EZ1 = -HDD + 0.85;
const mirror = (pts) => pts.map(([x, y]) => [-x, y]).reverse();
const ring = (cx, cy, r, n = 8) => Array.from({ length: n }, (_, k) => [cx + r * Math.cos(-TAU * k / n), cy + r * Math.sin(-TAU * k / n)]);
const pair = (left) => [prismSolid(left, EZ0, EZ1), prismSolid(mirror(left), EZ0, EZ1)];
// Three characters, one per hour in turn: the refill at the hour brings the next.
const EARS = {
  cat: pair([[-HDW / 2, HDH - 0.02], [-HDW / 2 + 0.8, HDH - 0.02], [-HDW / 2 + 0.12, HDH + 0.5]]),
  bear: pair(ring(-HDW / 2 + 0.38, HDH + 0.1, 0.36)),
  robot: [prismSolid([[-0.07, HDH - 0.02], [0.07, HDH - 0.02], [0.07, HDH + 0.3], [-0.07, HDH + 0.3]], EZ0, EZ1),
    prismSolid(ring(0, HDH + 0.42, 0.17), EZ0, EZ1)],
};
const CHARS = ['cat', 'bear', 'robot'];

const SLOT = { x: 0.62, z: 3.3 };                 // where the minute candy rests
const DISP = { x: -2.3, z: 7.6 };                // where the dispenser stands

function candyTex(val) {
  if (val == null) return {};
  const face = (u, v) => twoDigits(val, u, v, 0.165, 0.11, 0.835, 0.89, 0.12);
  return { front: face, back: face };
}

const LIT = () => 1;
function drawCandy(g, c) {
  const Rm = rot(c.yaw, c.pitch, c.roll);
  const place = (p) => [
    c.x + Rm[0] * p[0] + Rm[1] * p[1] + Rm[2] * p[2],
    c.y + Rm[3] * p[0] + Rm[4] * p[1] + Rm[5] * p[2],
    c.z + Rm[6] * p[0] + Rm[7] * p[1] + Rm[8] * p[2],
  ];
  // a candy with no number (the next one, in the mouth) shows its lit end
  drawSolid(g, CANDY, place, c.val == null ? { side: LIT } : candyTex(c.val), 'front');
}

// The cat's face on the head's front, in face units (px at rest).
const FW = 38, FH = 17.5;
function catFace(st, who = 'cat') {
  const gx = st.gx ?? 0, gy = st.gy ?? 0, open = st.blink ?? 1, sq = st.squint ?? 0;
  return (u, v) => {
    const X = u * FW, Y = v * FH;
    for (const ex of [11.5, 26.5]) {
      const dx = X - ex, dy = Y - 7.5;
      if (sq > 0.5) {
        // > <  squeezed shut
        const s = ex < 19 ? 1 : -1;
        const d = Math.min(segD(X, Y, ex - 3 * s, 4.6, ex + 2.2 * s, 7.5), segD(X, Y, ex + 2.2 * s, 7.5, ex - 3 * s, 10.4));
        if (d < 1.05) return 1;
        continue;
      }
      const ry = 4.6 * open + 0.7;
      const robo = who === 'robot';
      if (robo ? Math.abs(dx) < 3.8 && Math.abs(dy) < ry * 0.85 : (dx / 4.1) ** 2 + (dy / ry) ** 2 < 1) {
        const pdx = dx - gx * (robo ? 0.9 : 1.6), pdy = dy - gy * (robo ? 0.9 : 1.5);
        if (open > 0.4 && (robo ? Math.abs(pdx) < 1.3 && Math.abs(pdy) < 1.6 * open
          : (pdx / 1.9) ** 2 + (pdy / (2.8 * open)) ** 2 < 1)) return 0;
        return 1;
      }
    }
    if (who === 'bear') {
      // a muzzle ring round a fat nose
      const r = Math.hypot((X - 19) / 5.2, (Y - 13.4) / 3.4);
      if (r > 0.82 && r < 1) return 1;
      if (Math.hypot((X - 19) / 2.1, (Y - 12.4) / 1.2) < 1) return 1;
      if (segD(X, Y, 19, 13, 19, 14.8) < 0.55) return 1;
      return 0;
    }
    if (who === 'robot') {
      // a grille mouth: a box with two bars
      const inBox = X > 13 && X < 25 && Y > 11.6 && Y < 15.6;
      const inner = X > 14 && X < 24 && Y > 12.6 && Y < 14.6;
      if (inBox && (!inner || Math.abs(X - 17.3) < 0.5 || Math.abs(X - 20.7) < 0.5)) return 1;
      return 0;
    }
    // nose
    if (Y > 11 && Y < 13 && Math.abs(X - 19) < 2.1 - (Y - 11) * 0.95) return 1;
    // mouth: a small w
    const mw = Math.min(segD(X, Y, 19, 12.6, 17.2, 14.6), segD(X, Y, 17.2, 14.6, 15.6, 13.4),
      segD(X, Y, 19, 12.6, 20.8, 14.6), segD(X, Y, 20.8, 14.6, 22.4, 13.4));
    if (mw < 0.6) return 1;
    // whiskers
    for (const sx of [-1, 1]) {
      const x0 = 19 + sx * 9.5, x1 = 19 + sx * 17.5;
      if (segD(X, Y, x0, 12.2, x1, 11.2) < 0.5 || segD(X, Y, x0, 14, x1, 15.2) < 0.5) return 1;
    }
    return 0;
  };
}

function hourTex(hour) {
  return { front: (u, v) => twoDigits(hour, u, v, 0.11, 0.13, 0.89, 0.87, 0.1) };
}

/**
 * The dispenser. st: { x, z, sink (world units down into the table), yaw,
 * head (tip-back angle), hour, face: {gx, gy, blink, squint}, mouth: null |
 * { out, up } (the top candy pushed out of the stem), squash }.
 */
function drawDispenser(g, st) {
  const Ry = rot(st.yaw, 0, 0);
  const sq = st.squash ?? 1, by = -(st.sink ?? 0);
  const toWorld = (p) => [
    st.x + Ry[0] * p[0] + Ry[2] * p[2],
    by + p[1] * sq,
    st.z + Ry[6] * p[0] + Ry[8] * p[2],
  ];
  drawSolid(g, STEM, toWorld, hourTex(st.hour));
  const ca = Math.cos(st.head), sa = Math.sin(st.head);
  const hz = STD / 2, hy = STH;
  const headPlace = (p) => toWorld([p[0], hy + p[1] * ca - (p[2] - 0) * sa, hz + p[1] * sa + p[2] * ca]);
  const who = CHARS[st.hour % 3];
  for (const ear of EARS[who]) drawSolid(g, ear, headPlace, {}, '');
  drawSolid(g, HEAD, headPlace, { front: catFace(st.face ?? {}, who) }, 'front');
  if (st.mouth) {
    // The top candy, long axis front to back, pushed out under the chin.
    const m = st.mouth;
    const local = mouthLocal(m.out);
    const w = toWorld(local);
    const top = toWorld([0, STH, -STD / 2]);
    project(top[0], top[1], top[2], P, 90);
    const keep = CLIP_Y;
    CLIP_Y = Math.min(CLIP_Y, Math.round(P[91]));
    drawCandy(g, { x: w[0], y: w[1], z: w[2], yaw: st.yaw + Math.PI / 2, pitch: 0, roll: 0, val: null });
    CLIP_Y = keep;
  }
}

// ------------------------------------------------------------ timing
const smooth = (u) => u * u * (3 - 2 * u);
const FLIGHT = 0.46, HIT = 0.36, SETTLE = 1.0;   // after the shot, s
const MOUTH_OUT = 0.55;

function idleYaw(tt) { return 0.3 * Math.sin(TAU * tt / 9) + 0.07 * Math.sin(TAU * tt / 4); }

/** Head tip-back d s after the shot (d < 0: before it, cocked by `cock`). */
function shotHead(d, cock) {
  if (d < 0) return 0.3 * cock;
  if (d < 0.07) return 0.3 + 0.5 * ease.outQuad(d / 0.07);
  if (d < 0.32) return 0.8 + 0.05 * Math.sin((d - 0.07) * 40) * (1 - (d - 0.07) / 0.25);
  if (d < 0.62) {
    const u = (d - 0.32) / 0.3;
    return 0.8 * (1 - ease.inCubic(u));
  }
  // the snap shut rattles the hinge
  const u = (d - 0.62) / 0.3;
  return u < 1 ? 0.06 * Math.sin(u * Math.PI * 3) * (1 - u) : 0;
}
const tick = (s) => 0.07 * Math.sin(Math.PI * clamp((s % 1) / 0.26, 0, 1));
const blink = (tt) => { const k = tt % 4.7; return k < 0.14 ? Math.abs(k - 0.07) / 0.07 : 1; };

/** World position of the dispenser frame point p (stem-local) for state st. */
function dispPoint(st, p) {
  const c = Math.cos(st.yaw), sn = Math.sin(st.yaw);
  return [st.x + c * p[0] + sn * p[2], -(st.sink ?? 0) + p[1] * (st.squash ?? 1), st.z - sn * p[0] + c * p[2]];
}
const mouthLocal = (out) => [0, STH - CHT / 2 + 0.45 * out / MOUTH_OUT, -STD / 2 + CL / 2 - out - 0.1];

/** The candy in flight, d s after the shot from `from` (world), landing at x = lx then sliding. */
function flyingCandy(d, from, yaw0, val, hourShot) {
  const lx = hourShot ? SLOT.x - 0.55 : SLOT.x;
  const ly = CHT / 2;
  if (d < FLIGHT) {
    const u = d / FLIGHT;
    return {
      x: from[0] + (lx - from[0]) * u,
      y: from[1] + (ly - from[1]) * u + 0.55 * 4 * u * (1 - u),
      z: from[2] + (SLOT.z - from[2]) * u,
      yaw: (yaw0 + Math.PI / 2) * (1 - u) ** 2, pitch: 0, roll: -TAU * (1 - ease.outQuad(u)), val,
    };
  }
  const c = { x: lx, y: ly, z: SLOT.z, yaw: 0, pitch: 0, roll: 0, val };
  if (hourShot) {
    const u = progress(d, FLIGHT, SETTLE);
    c.x = lx + (SLOT.x - lx) * ease.outBack(u);
    c.y += 0.18 * Math.sin(Math.PI * progress(d, FLIGHT, FLIGHT + 0.2));
    c.roll = 0.08 * Math.sin(Math.PI * progress(d, FLIGHT, FLIGHT + 0.2));
  } else {
    // two small bounces, the second rocking it square
    const u = progress(d, FLIGHT, SETTLE);
    const b = u < 0.55 ? Math.sin(Math.PI * u / 0.55) * 0.22 : Math.sin(Math.PI * (u - 0.55) / 0.45) * 0.06;
    c.y += b;
    c.roll = 0.12 * Math.sin(Math.PI * u * 2) * (1 - u);
  }
  return c;
}

export default {
  name: 'PEZ',
  blurb: 'A PEZ dispenser fires each new minute at you as a candy brick; the hour is on its stem, and each hour a new character pops up.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  driver: 'full',

  frame(g, ctx) {
    const f = ctx.fields, s = f.sec;
    const tt = (ctx.date.getTime() % 3600000) / 1000;
    const prev = previousMinute(ctx.date);
    const hourPre = f.m === 59 && s > 56.5, hourPost = f.m === 0 && s < 2.5;
    const minPost = !hourPost && s < 1.6;

    // The camera drifts on a slow figure of eight (burn-in), never fast enough to blur the digits.
    CAM.x = 0.12 * Math.sin(TAU * tt / 40);
    CAM.y = 0.35 + 0.05 * Math.sin(TAU * tt / 30);
    CAM.ox = 0; CAM.oy = 0;
    const restYaw = 0.07 * Math.sin(TAU * tt / 6);
    const candies = [];
    const dispensers = [];
    // The cat watches its candy, and every 12 s glances at you for a moment.
    const gl = smooth(progress(tt % 12, 7, 7.3)) * (1 - smooth(progress(tt % 12, 9.2, 9.5)));
    const look = { gx: 0.9 * (1 - gl), gy: 0.4 * (1 - gl), blink: blink(tt), squint: 0 };

    if (hourPost) {
      // Old dispenser and old candy drop through the table; a new one pops up and fires.
      const pSink = progress(s, 0, 0.3);
      if (pSink < 1) {
        dispensers.push({ x: DISP.x, z: DISP.z, yaw: idleYaw(tt), hour: prev.h, head: 0.3 * (1 - pSink),
          sink: 4.2 * ease.inQuad(pSink), face: { gx: 0, gy: -1, blink: 1, squint: 1 } });
        candies.push({ x: SLOT.x, y: CHT / 2 - 1.2 * ease.inQuad(pSink), z: SLOT.z, yaw: restYaw, pitch: 0, roll: 0, val: prev.m, sinks: true });
      }
      const pUp = progress(s, 0.3, 0.75), TS = 0.75;
      const st = { x: DISP.x, z: DISP.z, yaw: idleYaw(tt), hour: f.h, sink: 4.2 * (1 - ease.outBack(pUp)), face: { ...look } };
      const cock = progress(s, 0.55, TS);
      st.head = s < TS ? 0.3 * cock : shotHead(s - TS, 1);
      st.squash = s > TS ? 1 - 0.1 * Math.sin(Math.PI * progress(s, TS, TS + 0.25)) : 1;
      if (s < TS) st.mouth = { out: MOUTH_OUT * cock };
      if (s > TS - 0.15 && s < TS + 0.35) st.face.squint = 1;
      if (pUp > 0) dispensers.push(st);
      if (s >= TS) {
        const st0 = { ...st, yaw: idleYaw(tt - (s - TS)), sink: 0, squash: 1 };
        const from = dispPoint(st0, mouthLocal(MOUTH_OUT));
        const c = flyingCandy(s - TS, from, st0.yaw, f.m, true);
        candies.push(c);
      }
    } else {
      const st = { x: DISP.x, z: DISP.z, yaw: idleYaw(tt), hour: f.h, face: look };
      st.head = tick(s);
      if (s > 56.5) {
        // cocking: the head tips back, the next candy creeps out under the chin
        const cock = smooth(progress(s, 56.5, 59.6));
        st.head = 0.3 * cock + 0.04 * Math.sin(tt * 70) * progress(s, 58.6, 59.9);
        if (hourPre) {
          // empty: nothing under the chin, it rattles and peers in
          st.x += 0.06 * Math.sin(tt * 47) * progress(s, 57.5, 59.5);
          st.yaw += 0.12 * Math.sin(tt * 31) * progress(s, 57.5, 59.5);
          st.face = { gx: 0, gy: 1, blink: 1, squint: 0 };
        } else {
          st.mouth = { out: MOUTH_OUT * smooth(progress(s, 57, 59.4)) };
          st.face = { gx: 0.6, gy: -0.6, blink: 1, squint: s > 59.3 ? 1 : 0 };
        }
      }
      if (minPost) {
        st.head = Math.max(st.head, shotHead(s, 1));
        if (s < 0.35) st.face = { gx: 1, gy: 1, blink: 1, squint: s < 0.3 ? 1 : 0 };
        const st0 = { ...st, yaw: idleYaw(tt - s) };
        const from = dispPoint(st0, mouthLocal(MOUTH_OUT));
        candies.push(flyingCandy(s, from, st0.yaw, f.m, false));
        // the old candy, until the new one knocks it away
        const p = progress(s, HIT, HIT + 0.5);
        if (p < 1)
          candies.push({ x: SLOT.x + 3.6 * ease.outQuad(p), y: CHT / 2 + 1.4 * Math.sin(Math.PI * p * 0.8) - 0.12 * Math.sin(Math.PI * progress(s, HIT - 0.05, HIT + 0.05)),
            z: SLOT.z + 1.2 * p, yaw: restYaw - 2.6 * p, pitch: 0.9 * p, roll: -3.2 * ease.outQuad(p), val: prev.m });
      } else {
        candies.push({ x: SLOT.x, y: CHT / 2, z: SLOT.z, yaw: restYaw, pitch: 0, roll: 0, val: f.m });
      }
      dispensers.push(st);
    }

    // the table's far edge, dashed, the dashes travelling with the camera
    CLIP_Y = H;
    project(0, 0, 12, P, 90);
    const ty = Math.round(P[91]), ph = Math.round(P[90]);
    for (let x = 0; x < W; x++) if ((((x - ph) % 9) + 9) % 9 < 6) g.buf[ty * W + x] = 1;
    // shadows of airborne candies: a bar on the table that shrinks as they rise
    for (const c of candies) {
      const hgt = c.y - CHT / 2;
      if (c.sinks || hgt < 0.08) continue;
      project(c.x, 0, c.z, P, 90);
      const half = Math.max(1, 0.6 * F / P[92] * (1 - clamp(hgt / 2, 0, 0.8)));
      const sy = Math.round(P[91]);
      if (sy < H) for (let x = Math.round(P[90] - half); x <= Math.round(P[90] + half); x++) if (x >= 0 && x < W) g.buf[sy * W + x] = 1;
    }
    for (const st of dispensers) {
      CLIP_Y = H;
      if (st.sink > 0) { project(st.x, 0, st.z - STD / 2, P, 90); CLIP_Y = Math.round(P[91]); }
      drawDispenser(g, st);
    }
    candies.sort((a, b) => b.z - a.z);
    for (const c of candies) {
      CLIP_Y = H;
      if (c.sinks) { project(SLOT.x, 0, SLOT.z - CD / 2, P, 90); CLIP_Y = Math.round(P[91]); }
      drawCandy(g, c);
    }
    CLIP_Y = H;
    if (ctx.oled) ctx.oled.contrast(Math.round(255 + (40 - 255) * (ctx.night ?? 0)));
  },
};
