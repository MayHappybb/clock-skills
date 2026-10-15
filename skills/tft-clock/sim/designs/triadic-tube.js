// Padded tubes: the rasteriser the Triadic costumes are made of.
//
// A costume is a list of capsules (segments with a radius at each end; a
// zero-length one is a sphere), each tagged with a material. For every pixel
// of the figure's box the nearest capsule surface wins (a true union, so
// joints are seamless and the anti-aliasing is right), and the pixel is lit
// as a point on a padded tube: the offset from the centre line gives a
// surface normal, a fixed stage light shades it, and the arc length along the
// part plus the offset across it give spiral stripes, which slide when the
// costume spins. Cloth is matte felt (a soft terminator band and a fine
// grain), metal has a hot specular. A dark keyline rings the silhouette.
//
// Cost, as the device would do it (the per-segment scan with a coverage
// buffer): every pixel tested against a capsule is charged 12 cycles (a
// projection, a clamp, a squared distance in fixed point), every pixel inside
// the silhouette 60 more (a table square root, the normal, the stripe, the
// shading). Both go into g.cost.box (3 cycles a unit), so check.mjs sees them;
// the final store goes through g.put (a plain store, or a blend on the edge).
// No Math calls in the loop: square roots and the sphere's z come from tables.

const MAXS = 192;
const AX = new Float32Array(MAXS), AY = new Float32Array(MAXS), DX = new Float32Array(MAXS), DY = new Float32Array(MAXS);
const RA = new Float32Array(MAXS), RD = new Float32Array(MAXS), IL2 = new Float32Array(MAXS);
const S0 = new Float32Array(MAXS), LEN = new Float32Array(MAXS), MAT = new Uint8Array(MAXS);
const X0 = new Float32Array(MAXS), X1 = new Float32Array(MAXS), Y0 = new Float32Array(MAXS), Y1 = new Float32Array(MAXS);
let n = 0;

// sqrt on [0, 64) and sqrt(1 - h²) on [0, 1], as tables (1/16 and 1/256 steps)
const SQ = new Float32Array(1026);
for (let i = 0; i < SQ.length; i++) SQ[i] = Math.sqrt(i / 16);
const ZT = new Float32Array(258);
for (let i = 0; i < ZT.length; i++) ZT[i] = Math.sqrt(Math.max(0, 1 - i / 256));

function sqrtT(v) {
  if (v >= 63.9) return 8;
  const f = v * 16, i = f | 0;
  return SQ[i] + (SQ[i + 1] - SQ[i]) * (f - i);
}

// light from the front, up and to the left (the follow spot and the battens)
const LX = -0.42, LY = -0.55, LZ = 0.72;

/** A material: base colour, stripe colour, stripe period (px), duty, slant, phase, finish. */
export function material() {
  return { mr: 0, mg: 0, mb: 0, ar: 0, ag: 0, ab: 0, per: 6, duty: 0, slant: 0, phase: 0, metal: 0 };
}

export function setMaterial(m, main, acc, per, duty, slant, metal) {
  m.mr = (main >> 16) & 255; m.mg = (main >> 8) & 255; m.mb = main & 255;
  m.ar = (acc >> 16) & 255; m.ag = (acc >> 8) & 255; m.ab = acc & 255;
  m.per = per; m.duty = duty; m.slant = slant; m.metal = metal;
  return m;
}

export function begin() { n = 0; }

/** A capsule from (ax, ay) radius ra to (bx, by) radius rb; s0 = arc length at a along its part. */
export function capsule(ax, ay, bx, by, ra, rb, s0, mat) {
  if (n >= MAXS) return;
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  AX[n] = ax; AY[n] = ay; DX[n] = dx; DY[n] = dy; RA[n] = ra; RD[n] = rb - ra;
  IL2[n] = l2 > 1e-6 ? 1 / l2 : 0;
  S0[n] = s0; LEN[n] = l2 > 1e-6 ? sqrtT(l2 > 63 ? 63 : l2) : 0;
  if (l2 > 63) LEN[n] = Math.sqrt(l2);   // long segments: rare, set-up only
  MAT[n] = mat;
  const r = (ra > rb ? ra : rb) + 2.2;
  X0[n] = (ax < bx ? ax : bx) - r; X1[n] = (ax > bx ? ax : bx) + r;
  Y0[n] = (ay < by ? ay : by) - r; Y1[n] = (ay > by ? ay : by) + r;
  n++;
}

/**
 * Rasterise the capsules added since begin(). `mats` is this figure's
 * material list, `key` the keyline colour and width (0 for none), `light`
 * a brightness factor (out of the spot, upstage), `alpha` the opacity.
 */
export function draw(g, mats, key, keyW, light, alpha) {
  if (n === 0 || alpha <= 0.004) return;
  let bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9;
  for (let i = 0; i < n; i++) {
    if (X0[i] < bx0) bx0 = X0[i]; if (X1[i] > bx1) bx1 = X1[i];
    if (Y0[i] < by0) by0 = Y0[i]; if (Y1[i] > by1) by1 = Y1[i];
  }
  const W = g.width, H = g.height;
  const x0 = bx0 < 0 ? 0 : bx0 | 0, y0 = by0 < 0 ? 0 : by0 | 0;
  const x1 = bx1 >= W ? W : (bx1 | 0) + 1, y1 = by1 >= H ? H : (by1 | 0) + 1;
  const kr = (key >> 16) & 255, kg = (key >> 8) & 255, kb = key & 255;
  const reach = keyW + 0.5;
  let tests = 0, inside = 0;
  for (let y = y0; y < y1; y++) {
    const py = y + 0.5;
    for (let x = x0; x < x1; x++) {
      const px = x + 0.5;
      let best = 1e9, bi = -1, bu = 0, bd = 0, bex = 0, bey = 0, br = 1;
      for (let i = 0; i < n; i++) {
        if (px < X0[i] || px > X1[i] || py < Y0[i] || py > Y1[i]) continue;
        tests++;
        const qx = px - AX[i], qy = py - AY[i];
        let u = (qx * DX[i] + qy * DY[i]) * IL2[i];
        u = u < 0 ? 0 : u > 1 ? 1 : u;
        const ex = qx - u * DX[i], ey = qy - u * DY[i];
        const d2 = ex * ex + ey * ey;
        const r = RA[i] + RD[i] * u, lim = r + reach;
        if (d2 >= lim * lim) continue;
        const d = sqrtT(d2), sd = d - r;
        if (sd < best) { best = sd; bi = i; bu = u; bd = d; bex = ex; bey = ey; br = r; }
      }
      if (bi < 0 || best >= reach) continue;
      inside++;
      const m = mats[MAT[bi]];
      // the padded surface: normal from the offset, z from the sphere table
      let h = bd / br; if (h > 1) h = 1;
      const inv = bd > 1e-3 ? 1 / bd : 0, nx = bex * inv * h, ny = bey * inv * h;
      const nz = ZT[(h * h * 256) | 0];
      let lam = nx * LX + ny * LY + nz * LZ; if (lam < 0) lam = 0;
      // stripes: along the part, slanted across it (a spiral wrapped on the tube)
      let cr = m.mr, cg = m.mg, cb = m.mb;
      if (m.duty > 0) {
        const side = DX[bi] * bey - DY[bi] * bex >= 0 ? 1 : -1;
        let v = (S0[bi] + bu * LEN[bi] + m.slant * side * h * br) / m.per + m.phase + 4096;
        v -= v | 0;
        const e = v < m.duty ? (v < m.duty - v ? v : m.duty - v) : -((v - m.duty) < (1 - v) ? (v - m.duty) : (1 - v));
        let bw = 0.5 + e * m.per; bw = bw < 0 ? 0 : bw > 1 ? 1 : bw;
        cr += (m.ar - cr) * bw; cg += (m.ag - cg) * bw; cb += (m.ab - cb) * bw;
      }
      const l2 = lam * lam, l4 = l2 * l2, l8 = l4 * l4;
      let k, sp;
      if (m.metal) { k = 0.22 + 1.0 * lam; sp = 255 * l8 * l4; }
      else {
        // felt: a hard-ish terminator band (sculpted, not balloon) and a fine integer grain
        let t = (lam - 0.42) * 6 + 0.5; t = t < 0 ? 0 : t > 1 ? 1 : t;
        k = 0.42 + 0.28 * lam + 0.36 * t; sp = 10 * l8;
        const nz = (((x * 73) ^ (y * 151) ^ ((x * y) & 31)) & 7) - 3.5;
        k += nz * 0.012;
      }
      k *= light; sp *= light;
      cr = cr * k + sp; cg = cg * k + sp; cb = cb * k + sp;
      // keyline outside the body
      if (keyW > 0 && best > -0.5) {
        let bc = 0.5 - best; bc = bc < 0 ? 0 : bc > 1 ? 1 : bc;
        cr = kr + (cr - kr) * bc; cg = kg + (cg - kg) * bc; cb = kb + (cb - kb) * bc;
      }
      cr = cr > 255 ? 255 : cr; cg = cg > 255 ? 255 : cg; cb = cb > 255 ? 255 : cb;
      let a = 0.5 - (best - keyW); a = a > 1 ? 1 : a;
      a *= alpha;
      if (a <= 0.004) continue;
      g.put(x, y, ((cr + 0.5) << 16) | ((cg + 0.5) << 8) | (cb + 0.5), a);
    }
  }
  g.cost.box += tests * 4 + inside * 20;
  g.cost.calls++;
}
