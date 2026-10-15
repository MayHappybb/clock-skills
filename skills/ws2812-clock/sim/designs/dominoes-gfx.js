// Domino Run renderer: a tiny software rasteriser for one lamp-lit tabletop.
// Everything is drawn at 2x (128 x 128) into typed arrays, then box-filtered
// down to the 64 x 64 panel: that 2x2 average is the anti-aliasing, and it
// lets thin dominoes glide between LEDs instead of hopping.
//
// World: x right, y up, z toward the viewer; the table is the plane y = 0.
// Painter's order (far to near) instead of a z-buffer: dominoes are convex
// boxes, so back-face culling plus sorting is exact except where two touch.

export const SS = 2, W = 64 * SS, H = 64 * SS, N = W * H;
export const col = new Float32Array(3 * N);
const shadow = new Float32Array(N);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

// ------------------------------------------------------------------ camera
export const cam = { cx: 0, cy: 0, cz: 0, rx: 0, ry: 0, rz: 0, ux: 0, uy: 0, uz: 0, fx: 0, fy: 0, fz: 0, f: 1, sx0: W / 2, sy0: H / 2 };
/** Orbit camera: looks at (tx, 0, tz) from azimuth az, elevation el, distance d; focal f in 2x pixels. */
export function setCamera(tx, tz, az, el, d, f, sy0 = H / 2) {
  const ce = Math.cos(el);
  cam.cx = tx + d * Math.sin(az) * ce; cam.cy = d * Math.sin(el); cam.cz = tz + d * Math.cos(az) * ce;
  let fx = tx - cam.cx, fy = -cam.cy, fz = tz - cam.cz;
  const fl = Math.hypot(fx, fy, fz); fx /= fl; fy /= fl; fz /= fl;
  // right = forward x up(0,1,0)
  let rx = -fz, rz = fx; const rl = Math.hypot(rx, rz); rx /= rl; rz /= rl;
  cam.fx = fx; cam.fy = fy; cam.fz = fz; cam.rx = rx; cam.ry = 0; cam.rz = rz;
  // up = right x forward
  cam.ux = -rz * fy; cam.uy = rz * fx - rx * fz; cam.uz = rx * fy;
  cam.f = f; cam.sy0 = sy0;
}
// projected point scratch
export const P = { x: 0, y: 0, z: 0 };
export function project(x, y, z) {
  const dx = x - cam.cx, dy = y - cam.cy, dz = z - cam.cz;
  const zc = dx * cam.fx + dy * cam.fy + dz * cam.fz;
  const xc = dx * cam.rx + dz * cam.rz, yc = dx * cam.ux + dy * cam.uy + dz * cam.uz;
  const k = cam.f / zc;
  P.x = cam.sx0 + xc * k; P.y = cam.sy0 - yc * k; P.z = zc;
  return k;
}

// ------------------------------------------------------------------- lamp
export const lamp = { x: 0, y: 9, z: 0, r: 1, g: 0.8, b: 0.6, k: 60, cos0: 0.55, cos1: 0.85 };
/** Lamp irradiance on a surface at (x,y,z) with normal n (unnormalised direction to lamp handled here). */
function lampAt(x, y, z) {
  const lx = lamp.x - x, ly = lamp.y - y, lz = lamp.z - z;
  const d2 = lx * lx + ly * ly + lz * lz, d = Math.sqrt(d2);
  const c = ly / d, s = c <= lamp.cos0 ? 0 : c >= lamp.cos1 ? 1 : ((c - lamp.cos0) / (lamp.cos1 - lamp.cos0)) ** 2;
  return (lamp.k * s) / d2;
}

// --------------------------------------------------------------- the table
const GT = 128, grain = new Float32Array(GT * GT);
{ // walnut grain: long wavy fibres along x, made once
  const h = (a, b) => { let v = Math.imul(a * 374761393 + b * 668265263, 1274126177); v ^= v >>> 13; return ((Math.imul(v, 1103515245) >>> 0) / 4294967296); };
  const vn = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), u = x - xi, v = y - yi, su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
    const a = h(xi & 127, yi & 127), b = h((xi + 1) & 127, yi & 127), c = h(xi & 127, (yi + 1) & 127), d = h((xi + 1) & 127, (yi + 1) & 127);
    return a + (b - a) * su + (c - a) * sv + (a - b - c + d) * su * sv; };
  for (let j = 0; j < GT; j++) for (let i = 0; i < GT; i++) {
    const warp = 3 * vn(i / 32, j / 16) + 1.2 * vn(i / 8, j / 6);
    const ring = 0.5 + 0.5 * Math.sin((j / 128) * 2 * Math.PI * 9 + warp * 2.2);
    grain[j * GT + i] = 0.72 + 0.28 * ring ** 3 + 0.08 * (vn(i / 2, j / 0.7) - 0.5);
  }
}
const WOOD = [0.011, 0.0045, 0.0018];
/** Paint the table (lamp pool, grain, soft shadows) into col. dim scales the lamp. */
export function drawTable(dim) {
  // lighting and grain per panel pixel (ray through its centre); shadows per 2x pixel
  const { cx, cy, cz, fx, fy, fz, rx, rz, ux, uy, uz, f, sx0, sy0 } = cam;
  const wr = WOOD[0] * dim * lamp.r, wg = WOOD[1] * dim * lamp.g, wb = WOOD[2] * dim * lamp.b;
  for (let Y = 0; Y < 64; Y++) {
    const b = -(2 * Y + 1 - sy0) / f, dy = fy + b * uy;
    for (let X = 0; X < 64; X++) {
      let r = 0, g = 0, bl = 0;
      if (dy < -1e-4) {
        const a = (2 * X + 1 - sx0) / f;
        const dx = fx + a * rx + b * ux, dz = fz + a * rz + b * uz;
        const t = -cy / dy, x = cx + t * dx, z = cz + t * dz;
        const ex = Math.abs(x) - TABLE.x, ez = Math.abs(z - TABLE.z0) - TABLE.z;
        const edge = Math.max(ex, ez);
        if (edge < 0.3) {
          const E = lampAt(x, 0, z) * (edge > 0 ? 1 - edge / 0.3 : 1) * grain[((Math.floor(z * 9) & 127) * GT) + (Math.floor(x * 3) & 127)];
          r = wr * E; g = wg * E; bl = wb * E;
        }
      }
      const p0 = 2 * Y * W + 2 * X;
      for (let q = 0; q < 4; q++) {
        const p = p0 + (q & 1) + (q >> 1) * W, o = 3 * p, k = 1 - shadow[p];
        col[o] = r * k; col[o + 1] = g * k; col[o + 2] = bl * k;
      }
    }
  }
}
export const TABLE = { x: 5.6, z: 7.2, z0: 0 };
export function clearShadow() { shadow.fill(0); }

// ------------------------------------------------------------ rasterising
const qx = new Float32Array(8), qy = new Float32Array(8), eA = new Float32Array(8), eB = new Float32Array(8), eC = new Float32Array(8);
/** Soft-edged convex polygon into the shadow buffer (max-combined). n points in qx/qy. */
function shadowPoly(n, strength, soft) {
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, area = 0;
  for (let k = 0; k < n; k++) {
    const j = (k + 1) % n;
    area += qx[k] * qy[j] - qx[j] * qy[k];
    if (qx[k] < x0) x0 = qx[k]; if (qx[k] > x1) x1 = qx[k]; if (qy[k] < y0) y0 = qy[k]; if (qy[k] > y1) y1 = qy[k];
  }
  if (Math.abs(area) < 1e-3) return;
  const sg = area > 0 ? 1 : -1;
  const X0 = Math.max(0, Math.floor(x0 - soft)), X1 = Math.min(W - 1, Math.ceil(x1 + soft));
  const Y0 = Math.max(0, Math.floor(y0 - soft)), Y1 = Math.min(H - 1, Math.ceil(y1 + soft));
  // edge k as  d = A x + B y + C  (signed distance, inside positive)
  for (let k = 0; k < n; k++) {
    const j = (k + 1) % n, ex = qx[j] - qx[k], ey = qy[j] - qy[k], il = sg / (Math.hypot(ex, ey) * soft);
    eA[k] = -ey * il; eB[k] = ex * il; eC[k] = (ey * qx[k] - ex * qy[k]) * il + 0.5;
  }
  for (let py = Y0; py <= Y1; py++) {
    const sy = py + 0.5;
    for (let px = X0; px <= X1; px++) {
      const sx = px + 0.5;
      let m = 1e9;
      for (let k = 0; k < n; k++) { const d = eA[k] * sx + eB[k] * sy + eC[k]; if (d < m) m = d; }
      if (m <= 0) continue;
      const c = (m > 1 ? 1 : m) * strength, p = py * W + px;
      if (c > shadow[p]) shadow[p] = c;
    }
  }
}

// one face of a box: 4 screen points, flat colour, optional pips
const fx4 = new Float32Array(4), fy4 = new Float32Array(4);
const PIPS = [[], [[0.5, 0.5]], [[0.27, 0.27], [0.73, 0.73]], [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]],
  [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73]], [[0.25, 0.25], [0.75, 0.25], [0.5, 0.5], [0.25, 0.75], [0.75, 0.75]],
  [[0.27, 0.22], [0.27, 0.5], [0.27, 0.78], [0.73, 0.22], [0.73, 0.5], [0.73, 0.78]]];
function face(r, g, b, pipA, pipB, pr, pg, pb) {
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, area = 0;
  for (let k = 0; k < 4; k++) {
    const j = (k + 1) & 3;
    area += fx4[k] * fy4[j] - fx4[j] * fy4[k];
    if (fx4[k] < x0) x0 = fx4[k]; if (fx4[k] > x1) x1 = fx4[k]; if (fy4[k] < y0) y0 = fy4[k]; if (fy4[k] > y1) y1 = fy4[k];
  }
  if (Math.abs(area) < 0.02) return;
  const sg = area > 0 ? 1 : -1;
  const X0 = Math.max(0, Math.floor(x0)), X1 = Math.min(W - 1, Math.ceil(x1));
  const Y0 = Math.max(0, Math.floor(y0)), Y1 = Math.min(H - 1, Math.ceil(y1));
  // affine uv: corner0 + u*(c1-c0) + v*(c3-c0)
  const ax = fx4[1] - fx4[0], ay = fy4[1] - fy4[0], bx = fx4[3] - fx4[0], by = fy4[3] - fy4[0];
  const det = ax * by - ay * bx, usePips = pipA >= 0 && Math.abs(area) > 10 && Math.abs(det) > 1e-3;
  for (let py = Y0; py <= Y1; py++) for (let px = X0; px <= X1; px++) {
    const sx = px + 0.5, sy = py + 0.5;
    let inside = true;
    for (let k = 0; k < 4; k++) {
      const j = (k + 1) & 3;
      if (sg * ((fx4[j] - fx4[k]) * (sy - fy4[k]) - (fy4[j] - fy4[k]) * (sx - fx4[k])) < 0) { inside = false; break; }
    }
    if (!inside) continue;
    const o = 3 * (py * W + px);
    if (usePips) {
      const qx_ = sx - fx4[0], qy_ = sy - fy4[0];
      const u = (qx_ * by - qy_ * bx) / det, v = (ax * qy_ - ay * qx_) / det;
      let dark = Math.abs(v - 0.5) < 0.035; // the centre bar
      if (!dark) {
        const half = v < 0.5 ? PIPS[pipA] : PIPS[pipB], vv = v < 0.5 ? v * 2 : v * 2 - 1;
        for (let k = 0; k < half.length; k++) {
          const du = u - half[k][0], dv = (vv - half[k][1]);
          if (du * du + dv * dv < 0.036) { dark = true; break; }
        }
      }
      if (dark) { col[o] = pr; col[o + 1] = pg; col[o + 2] = pb; continue; }
    }
    col[o] = r; col[o + 1] = g; col[o + 2] = b;
  }
}

// ---------------------------------------------------------------- dominoes
// A domino: pivot (px, pz) on its front-bottom edge, heading yaw (direction it
// falls), tilt th (0 standing, pi/2 flat), lift y, size h (height) w (width) t.
const cX = new Float32Array(8), cY = new Float32Array(8), cZ = new Float32Array(8);
const sX = new Float32Array(8), sY = new Float32Array(8);
function corners(d) {
  const fx = Math.cos(d.yaw), fz = Math.sin(d.yaw), rx = -fz, rz = fx;
  const ct = Math.cos(d.th), st = Math.sin(d.th);
  // A = f*ct - up*st ; C = f*st + up*ct ; B = r
  const Ax = fx * ct, Ay = -st, Az = fz * ct, Cx = fx * st, Cy = ct, Cz = fz * st;
  for (let k = 0; k < 8; k++) {
    const a = k & 1 ? 0 : -d.t, b = (k & 2 ? 0.5 : -0.5) * d.w, c = k & 4 ? d.h : 0;
    cX[k] = d.x + Ax * a + rx * b + Cx * c; cY[k] = d.y + Ay * a + Cy * c; cZ[k] = d.z + Az * a + rz * b + Cz * c;
  }
  return [Ax, Ay, Az, rx, rz, Cx, Cy, Cz];
}
/** Add a domino's soft shadow (call before drawTable). */
export function dominoShadow(d, strength = 0.78) {
  corners(d);
  // mid-plane quad: average front/back corners, then project from the lamp
  const ids = [[0, 1], [2, 3], [6, 7], [4, 5]];
  for (let k = 0; k < 4; k++) {
    const [i0, i1] = ids[k];
    const x = (cX[i0] + cX[i1]) / 2, y = (cY[i0] + cY[i1]) / 2, z = (cZ[i0] + cZ[i1]) / 2;
    const t = lamp.y / Math.max(0.05, lamp.y - y);
    project(lamp.x + (x - lamp.x) * t, 0, lamp.z + (z - lamp.z) * t);
    qx[k] = P.x; qy[k] = P.y;
  }
  shadowPoly(4, strength, 1.6);
}
/** Ground shadow of any convex blob (ellipse) at (x,z), radii rx rz. */
export function blobShadow(x, z, rx, rz, strength) {
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; project(x + rx * Math.cos(a), 0, z + rz * Math.sin(a)); qx[k] = P.x; qy[k] = P.y; }
  shadowPoly(8, strength, 2.5);
}

// face list: [corner ids (in order), normal selector]
const FACES = [[1, 3, 7, 5, 0], [0, 2, 6, 4, 1], [4, 5, 7, 6, 2], [2, 6, 7, 3, 3], [0, 1, 5, 4, 4]];
/** Draw a domino. mat = { r,g,b, pr,pg,pb, spec }. */
export function drawDomino(d, mat, dim) {
  const [Ax, Ay, Az, rx, rz, Cx, Cy, Cz] = corners(d);
  for (let k = 0; k < 8; k++) { project(cX[k], cY[k], cZ[k]); sX[k] = P.x; sY[k] = P.y; }
  // centre, for lighting
  const mx = d.x + Ax * (-d.t / 2) + Cx * (d.h / 2), my = d.y + Ay * (-d.t / 2) + Cy * (d.h / 2), mz = d.z + Az * (-d.t / 2) + Cz * (d.h / 2);
  let lx = lamp.x - mx, ly = lamp.y - my, lz = lamp.z - mz;
  const ld = Math.hypot(lx, ly, lz); lx /= ld; ly /= ld; lz /= ld;
  let vx = cam.cx - mx, vy = cam.cy - my, vz = cam.cz - mz;
  const vd = Math.hypot(vx, vy, vz); vx /= vd; vy /= vd; vz /= vd;
  let hx = lx + vx, hy = ly + vy, hz = lz + vz; const hd = Math.hypot(hx, hy, hz); hx /= hd; hy /= hd; hz /= hd;
  const E = lampAt(mx, my, mz) * dim;
  for (const F of FACES) {
    let nx, ny, nz;
    switch (F[4]) {
      case 0: nx = Ax; ny = Ay; nz = Az; break;          // front (falls this way)
      case 1: nx = -Ax; ny = -Ay; nz = -Az; break;       // back: face up when fallen
      case 2: nx = Cx; ny = Cy; nz = Cz; break;          // top end
      case 3: nx = rx; ny = 0; nz = rz; break;           // side
      default: nx = -rx; ny = 0; nz = -rz;               // other side
    }
    if (nx * vx + ny * vy + nz * vz <= 0.02) continue;
    const nl = Math.max(0, nx * lx + ny * ly + nz * lz), nh = Math.max(0, nx * hx + ny * hy + nz * hz);
    const sp = mat.spec * nh ** 40, dif = 0.07 + 0.93 * nl;
    const r = E * (mat.r * dif * lamp.r + sp), g = E * (mat.g * dif * lamp.g + sp * 0.9), b = E * (mat.b * dif * lamp.b + sp * 0.75);
    for (let k = 0; k < 4; k++) { fx4[k] = sX[F[k]]; fy4[k] = sY[F[k]]; }
    const big = F[4] < 2;
    face(r, g, b, big ? d.pa : -1, d.pb, E * mat.pr * dif, E * mat.pg * dif, E * mat.pb * dif);
  }
}

/** Paint a screen-space ellipse into col (painter's), colour per call. */
export function ellipse(cx, cy, rx, ry, r, g, b, a = 1) {
  const X0 = Math.max(0, Math.floor(cx - rx)), X1 = Math.min(W - 1, Math.ceil(cx + rx));
  const Y0 = Math.max(0, Math.floor(cy - ry)), Y1 = Math.min(H - 1, Math.ceil(cy + ry));
  for (let py = Y0; py <= Y1; py++) for (let px = X0; px <= X1; px++) {
    const u = (px + 0.5 - cx) / rx, v = (py + 0.5 - cy) / ry;
    if (u * u + v * v > 1) continue;
    const o = 3 * (py * W + px);
    col[o] += (r - col[o]) * a; col[o + 1] += (g - col[o + 1]) * a; col[o + 2] += (b - col[o + 2]) * a;
  }
}
/** Additive glow (screen space). */
export function glow(cx, cy, rad, r, g, b) {
  const X0 = Math.max(0, Math.floor(cx - rad)), X1 = Math.min(W - 1, Math.ceil(cx + rad));
  const Y0 = Math.max(0, Math.floor(cy - rad)), Y1 = Math.min(H - 1, Math.ceil(cy + rad));
  for (let py = Y0; py <= Y1; py++) for (let px = X0; px <= X1; px++) {
    const u = (px + 0.5 - cx) / rad, v = (py + 0.5 - cy) / rad, q = 1 - u * u - v * v;
    if (q <= 0) continue;
    const o = 3 * (py * W + px), k = q * q;
    col[o] += r * k; col[o + 1] += g * k; col[o + 2] += b * k;
  }
}

/** 2x2 box filter onto the panel. */
export function blit(ctx, gain) {
  const G = ctx.layout.grid, out = ctx.out, idx = G.idx;
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const i = idx[y * 64 + x];
    if (i < 0) continue;
    const o0 = 3 * ((2 * y) * W + 2 * x), o1 = o0 + 3 * W;
    for (let c = 0; c < 3; c++) out[3 * i + c] = gain * 0.25 * (col[o0 + c] + col[o0 + 3 + c] + col[o1 + c] + col[o1 + 3 + c]);
  }
}
