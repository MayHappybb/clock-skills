// A tiny software 3D renderer for the voxel face: parallelogram faces,
// orthographic camera, z-buffer at 2x2 supersampling, deferred shading with
// a sun shadow map. Everything lives in preallocated typed arrays.
//
// A face is a parallelogram: origin o, edges a and b, normal n. Samples
// store the face id and its (u, v) on the face, so the shading pass can
// rebuild the world position (shadows, water) and draw textures (bevels,
// windows) without any per-pixel allocation.

export const STRIDE = 20;              // floats per face
// face layout: o(3) a(3) b(3) n(3) rgb(3) cornerLight(4: u0v0 u1v0 u0v1 u1v1) param(1)

export class Engine {
  constructor(W, H, maxFaces = 12000, shadowN = 160, shadowExt = 21) {
    this.W = W; this.H = H; this.N = W * H;
    this.max = maxFaces;
    this.F = new Float32Array(maxFaces * STRIDE);
    this.M = new Uint8Array(maxFaces);
    this.n = 0;
    this.zb = new Float32Array(this.N);
    this.fid = new Int32Array(this.N);
    this.U = new Float32Array(this.N);
    this.V = new Float32Array(this.N);
    this.col = new Float32Array(3 * this.N);
    this.SN = shadowN; this.SE = shadowExt;
    this.smap = new Float32Array(shadowN * shadowN);
    this.cam = { r: [1, 0, 0], u: [0, 0, 1], d: [0, 1, 0], s: 1, cx: 0, cy: 0, cz: 0, sx: W / 2, sy: H / 2 };
    this.light = { f: [0, 0, -1], r: [1, 0, 0], u: [0, 1, 0] };
  }

  reset(n = 0) { this.n = n; }

  quad(ox, oy, oz, ax, ay, az, bx, by, bz, nx, ny, nz, mat, r, g, b, l0 = 1, l1 = 1, l2 = 1, l3 = 1, p = 0) {
    if (this.n >= this.max) return;
    const F = this.F, k = this.n * STRIDE;
    F[k] = ox; F[k + 1] = oy; F[k + 2] = oz;
    F[k + 3] = ax; F[k + 4] = ay; F[k + 5] = az;
    F[k + 6] = bx; F[k + 7] = by; F[k + 8] = bz;
    F[k + 9] = nx; F[k + 10] = ny; F[k + 11] = nz;
    F[k + 12] = r; F[k + 13] = g; F[k + 14] = b;
    F[k + 15] = l0; F[k + 16] = l1; F[k + 17] = l2; F[k + 18] = l3;
    F[k + 19] = p;
    this.M[this.n++] = mat;
  }

  /** Axis-aligned box from (x0,y0,z0), size (sx,sy,sz). `skip` bitmask: 1 bottom, 2 top, 4 -x, 8 +x, 16 -y, 32 +y. */
  box(x0, y0, z0, sx, sy, sz, mat, r, g, b, p = 0, skip = 1, topMat = -1, tr = r, tg = g, tb = b) {
    const x1 = x0 + sx, y1 = y0 + sy, z1 = z0 + sz;
    if (!(skip & 2)) this.quad(x0, y0, z1, sx, 0, 0, 0, sy, 0, 0, 0, 1, topMat < 0 ? mat : topMat, tr, tg, tb, 1, 1, 1, 1, p);
    if (!(skip & 1)) this.quad(x0, y0, z0, sx, 0, 0, 0, sy, 0, 0, 0, -1, mat, r, g, b, 1, 1, 1, 1, p);
    if (!(skip & 16)) this.quad(x0, y0, z0, sx, 0, 0, 0, 0, sz, 0, -1, 0, mat, r, g, b, 1, 1, 1, 1, p);
    if (!(skip & 32)) this.quad(x1, y1, z0, -sx, 0, 0, 0, 0, sz, 0, 1, 0, mat, r, g, b, 1, 1, 1, 1, p);
    if (!(skip & 4)) this.quad(x0, y1, z0, 0, -sy, 0, 0, 0, sz, -1, 0, 0, mat, r, g, b, 1, 1, 1, 1, p);
    if (!(skip & 8)) this.quad(x1, y0, z0, 0, sy, 0, 0, 0, sz, 1, 0, 0, mat, r, g, b, 1, 1, 1, 1, p);
  }

  /** A cube of half-size h centred at c, turned by the rotation R (row-major 3x3: columns are the cube's axes). */
  cube(cx, cy, cz, h, R, mat, r, g, b, p = 0) {
    const ex = R[0], ey = R[3], ez = R[6], fx = R[1], fy = R[4], fz = R[7], gx = R[2], gy = R[5], gz = R[8];
    const d = 2 * h;
    // +X / -X faces
    this.quad(cx + h * (ex - fx - gx), cy + h * (ey - fy - gy), cz + h * (ez - fz - gz), d * fx, d * fy, d * fz, d * gx, d * gy, d * gz, ex, ey, ez, mat, r, g, b, 1, 1, 1, 1, p);
    this.quad(cx + h * (-ex - fx - gx), cy + h * (-ey - fy - gy), cz + h * (-ez - fz - gz), d * fx, d * fy, d * fz, d * gx, d * gy, d * gz, -ex, -ey, -ez, mat, r, g, b, 1, 1, 1, 1, p);
    // +Y / -Y
    this.quad(cx + h * (fx - ex - gx), cy + h * (fy - ey - gy), cz + h * (fz - ez - gz), d * ex, d * ey, d * ez, d * gx, d * gy, d * gz, fx, fy, fz, mat, r, g, b, 1, 1, 1, 1, p);
    this.quad(cx + h * (-fx - ex - gx), cy + h * (-fy - ey - gy), cz + h * (-fz - ez - gz), d * ex, d * ey, d * ez, d * gx, d * gy, d * gz, -fx, -fy, -fz, mat, r, g, b, 1, 1, 1, 1, p);
    // +Z / -Z
    this.quad(cx + h * (gx - ex - fx), cy + h * (gy - ey - fy), cz + h * (gz - ez - fz), d * ex, d * ey, d * ez, d * fx, d * fy, d * fz, gx, gy, gz, mat, r, g, b, 1, 1, 1, 1, p);
    this.quad(cx + h * (-gx - ex - fx), cy + h * (-gy - ey - fy), cz + h * (-gz - ez - fz), d * ex, d * ey, d * ez, d * fx, d * fy, d * fz, -gx, -gy, -gz, mat, r, g, b, 1, 1, 1, 1, p);
  }

  /** Orthographic camera: yaw th (0 looks along +y), pitch ph (down), scale s px/unit, looking at (cx,cy,cz). */
  setCamera(th, ph, s, cx, cy, cz, sx = this.W / 2, sy = this.H / 2) {
    const c = this.cam, ct = Math.cos(th), st = Math.sin(th), cp = Math.cos(ph), sp = Math.sin(ph);
    c.r = [ct, -st, 0];
    c.u = [st * sp, ct * sp, cp];
    c.d = [st * cp, ct * cp, -sp];
    c.s = s; c.cx = cx; c.cy = cy; c.cz = cz; c.sx = sx; c.sy = sy;
  }

  /** World point to screen [x, y, depth] (sample units). */
  project(x, y, z, out) {
    const c = this.cam, px = x - c.cx, py = y - c.cy, pz = z - c.cz;
    out[0] = c.sx + c.s * (px * c.r[0] + py * c.r[1] + pz * c.r[2]);
    out[1] = c.sy - c.s * (px * c.u[0] + py * c.u[1] + pz * c.u[2]);
    out[2] = px * c.d[0] + py * c.d[1] + pz * c.d[2];
    return out;
  }

  /** Rasterise faces [from, to) into the z-buffer. Call clear() first. */
  clear() { this.zb.fill(1e9); this.fid.fill(-1); }

  raster(from = 0, to = this.n) {
    const F = this.F, c = this.cam, W = this.W, H = this.H, zb = this.zb, fid = this.fid, U = this.U, V = this.V;
    const rx = c.r[0], ry = c.r[1], ux = c.u[0], uy = c.u[1], uz = c.u[2], dx = c.d[0], dy = c.d[1], dz = c.d[2], s = c.s;
    const E = 0.002;
    for (let f = from; f < to; f++) {
      const k = f * STRIDE;
      const nx = F[k + 9], ny = F[k + 10], nz = F[k + 11];
      if (nx * dx + ny * dy + nz * dz > -1e-4) continue;          // back face or edge-on
      const ox = F[k] - c.cx, oy = F[k + 1] - c.cy, oz = F[k + 2] - c.cz;
      const X0 = c.sx + s * (ox * rx + oy * ry), Y0 = c.sy - s * (ox * ux + oy * uy + oz * uz), Z0 = ox * dx + oy * dy + oz * dz;
      const ax = F[k + 3], ay = F[k + 4], az = F[k + 5], bx = F[k + 6], by = F[k + 7], bz = F[k + 8];
      const AX = s * (ax * rx + ay * ry), AY = -s * (ax * ux + ay * uy + az * uz), AZ = ax * dx + ay * dy + az * dz;
      const BX = s * (bx * rx + by * ry), BY = -s * (bx * ux + by * uy + bz * uz), BZ = bx * dx + by * dy + bz * dz;
      const det = AX * BY - BX * AY;
      if (det > -1e-6 && det < 1e-6) continue;
      const id = 1 / det;
      let xmin = Math.min(X0, X0 + AX, X0 + BX, X0 + AX + BX), xmax = Math.max(X0, X0 + AX, X0 + BX, X0 + AX + BX);
      let ymin = Math.min(Y0, Y0 + AY, Y0 + BY, Y0 + AY + BY), ymax = Math.max(Y0, Y0 + AY, Y0 + BY, Y0 + AY + BY);
      let x0 = Math.max(0, Math.floor(xmin)), x1 = Math.min(W - 1, Math.ceil(xmax));
      let y0 = Math.max(0, Math.floor(ymin)), y1 = Math.min(H - 1, Math.ceil(ymax));
      if (x0 > x1 || y0 > y1) continue;
      // u = ((px-X0)*BY - BX*(py-Y0)) * id ; v = (AX*(py-Y0) - (px-X0)*AY) * id
      const dudx = BY * id, dvdx = -AY * id;
      for (let y = y0; y <= y1; y++) {
        const py = y + 0.5 - Y0, px0 = x0 + 0.5 - X0;
        let u = (px0 * BY - BX * py) * id, v = (AX * py - px0 * AY) * id;
        let p = y * W + x0;
        for (let x = x0; x <= x1; x++, p++, u += dudx, v += dvdx) {
          if (u < -E || u > 1 + E || v < -E || v > 1 + E) continue;
          const z = Z0 + u * AZ + v * BZ;
          if (z < zb[p]) { zb[p] = z; fid[p] = f; U[p] = u < 0 ? 0 : u > 1 ? 1 : u; V[p] = v < 0 ? 0 : v > 1 ? 1 : v; }
        }
      }
    }
  }

  /** Light direction L (unit, toward the light). Rebuilds the shadow map from faces [0, n). */
  shadows(Lx, Ly, Lz) {
    const N = this.SN, ext = this.SE, sc = N / (2 * ext), map = this.smap, F = this.F;
    map.fill(1e9);
    const fx = -Lx, fy = -Ly, fz = -Lz;
    // right = normalize(f x z) (or x if f is vertical), up = right x f
    let rx = fy, ry = -fx, rz = 0, rl = Math.hypot(rx, ry);
    if (rl < 1e-4) { rx = 1; ry = 0; rl = 1; }
    rx /= rl; ry /= rl;
    const ux = ry * fz - rz * fy, uy = rz * fx - rx * fz, uz = rx * fy - ry * fx;
    const Lt = this.light; Lt.f = [fx, fy, fz]; Lt.r = [rx, ry, rz]; Lt.u = [ux, uy, uz]; Lt.sc = sc;
    const h = N / 2;
    for (let f = 0; f < this.n; f++) {
      const k = f * STRIDE;
      if (this.M[f] === 4 || this.M[f] === 1 || this.M[f] === 2) continue;   // lights and water don't cast
      if (F[k + 9] * fx + F[k + 10] * fy + F[k + 11] * fz > -1e-4) continue;
      const ox = F[k], oy = F[k + 1], oz = F[k + 2];
      const X0 = h + sc * (ox * rx + oy * ry), Y0 = h - sc * (ox * ux + oy * uy + oz * uz), Z0 = ox * fx + oy * fy + oz * fz;
      const ax = F[k + 3], ay = F[k + 4], az = F[k + 5], bx = F[k + 6], by = F[k + 7], bz = F[k + 8];
      const AX = sc * (ax * rx + ay * ry), AY = -sc * (ax * ux + ay * uy + az * uz), AZ = ax * fx + ay * fy + az * fz;
      const BX = sc * (bx * rx + by * ry), BY = -sc * (bx * ux + by * uy + bz * uz), BZ = bx * fx + by * fy + bz * fz;
      const det = AX * BY - BX * AY;
      if (det > -1e-6 && det < 1e-6) continue;
      const id = 1 / det;
      const x0 = Math.max(0, Math.floor(Math.min(X0, X0 + AX, X0 + BX, X0 + AX + BX)));
      const x1 = Math.min(N - 1, Math.ceil(Math.max(X0, X0 + AX, X0 + BX, X0 + AX + BX)));
      const y0 = Math.max(0, Math.floor(Math.min(Y0, Y0 + AY, Y0 + BY, Y0 + AY + BY)));
      const y1 = Math.min(N - 1, Math.ceil(Math.max(Y0, Y0 + AY, Y0 + BY, Y0 + AY + BY)));
      const dudx = BY * id, dvdx = -AY * id, E = 0.02;
      for (let y = y0; y <= y1; y++) {
        const py = y + 0.5 - Y0, px0 = x0 + 0.5 - X0;
        let u = (px0 * BY - BX * py) * id, v = (AX * py - px0 * AY) * id, p = y * N + x0;
        for (let x = x0; x <= x1; x++, p++, u += dudx, v += dvdx) {
          if (u < -E || u > 1 + E || v < -E || v > 1 + E) continue;
          const z = Z0 + u * AZ + v * BZ;
          if (z < map[p]) map[p] = z;
        }
      }
    }
  }

  /** 0 (shadowed) .. 1 (lit) at world point, bilinear PCF. */
  lit(x, y, z) {
    const L = this.light, N = this.SN, sc = L.sc, h = N / 2, map = this.smap;
    const X = h + sc * (x * L.r[0] + y * L.r[1]) - 0.5, Y = h - sc * (x * L.u[0] + y * L.u[1] + z * L.u[2]) - 0.5;
    const d = x * L.f[0] + y * L.f[1] + z * L.f[2] - 0.12;
    const xi = Math.floor(X), yi = Math.floor(Y);
    if (xi < 0 || yi < 0 || xi >= N - 1 || yi >= N - 1) return 1;
    const fx = X - xi, fy = Y - yi, p = yi * N + xi;
    const a = d > map[p] ? 0 : 1, b = d > map[p + 1] ? 0 : 1, c = d > map[p + N] ? 0 : 1, e = d > map[p + N + 1] ? 0 : 1;
    return (a + (b - a) * fx) * (1 - fy) + (c + (e - c) * fx) * fy;
  }
}

/** Rotation matrix (row-major) about a unit axis by angle. */
export function rotAxis(ax, ay, az, ang, out = new Float32Array(9)) {
  const c = Math.cos(ang), s = Math.sin(ang), t = 1 - c;
  out[0] = t * ax * ax + c; out[1] = t * ax * ay - s * az; out[2] = t * ax * az + s * ay;
  out[3] = t * ax * ay + s * az; out[4] = t * ay * ay + c; out[5] = t * ay * az - s * ax;
  out[6] = t * ax * az - s * ay; out[7] = t * ay * az + s * ax; out[8] = t * az * az + c;
  return out;
}
