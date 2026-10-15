// Pop-up book numerals: a storybook fat-face (Didone stress, ball terminals,
// bracketed slab serifs), drawn as tapered strokes and baked into signed
// distance grids so a cut-paper card can be sampled at any angle with
// coverage anti-aliasing. Glyph box: 18 x 30 units, y DOWN from the top.
export const GW = 18, GH = 30;

const T = 2.9, t = 1.0;      // thick and thin stroke radii
const STRESS = -0.18;        // slight backward tilt of the stress axis (rad)
const D = Math.PI / 180;

function seg(L, ax, ay, bx, by, ra, rb = ra) { L.push([ax, ay, bx, by, ra, rb]); }
function ball(L, x, y, r) { L.push([x, y, x, y, r, r]); }
/** Elliptic arc a0..a1 (deg; 270 = top, 0 = right, y down), thin..thick by stress. */
function arc(L, cx, cy, rx, ry, a0, a1, thin = t, thick = T, n = 0) {
  n = n || Math.max(8, Math.round(Math.abs(a1 - a0) / 9));
  const r = (a) => thin + (thick - thin) * Math.cos(a - STRESS) ** 2;
  let pa = a0 * D, px = cx + rx * Math.cos(pa), py = cy + ry * Math.sin(pa);
  for (let k = 1; k <= n; k++) {
    const a = (a0 + ((a1 - a0) * k) / n) * D, x = cx + rx * Math.cos(a), y = cy + ry * Math.sin(a);
    seg(L, px, py, x, y, r(pa), r(a));
    pa = a; px = x; py = y;
  }
}

const DEF = {
  0(L) { arc(L, 9, 15, 6.0, 12.2, 0, 360); },
  1(L) {
    seg(L, 10.6, 3.2, 10.6, 27.0, 2.75);
    seg(L, 10.4, 3.0, 5.0, 8.0, 1.25, 0.95); ball(L, 4.9, 8.2, 1.85);
    seg(L, 4.4, 28.5, 16.8, 28.5, 1.05);
  },
  2(L) {
    arc(L, 9, 9.4, 6.0, 6.4, 200, 392);
    seg(L, 14.0, 13.3, 3.4, 27.3, 2.25, 1.0);
    seg(L, 3.0, 28.1, 15.8, 28.1, 1.45);
    seg(L, 16.0, 28.4, 16.4, 24.8, 1.05, 0.8);
    ball(L, 3.7, 7.6, 2.45);
  },
  3(L) {
    arc(L, 8.8, 8.5, 5.6, 5.7, 205, 450, t, T * 0.85);
    arc(L, 8.8, 21.1, 6.7, 7.1, 270, 518);
    seg(L, 8.8, 14.2, 6.0, 14.2, 1.0, 0.8);
    ball(L, 3.9, 6.5, 2.2); ball(L, 3.1, 23.0, 2.45);
  },
  4(L) {
    seg(L, 12.9, 3.2, 12.9, 27.0, 2.85);
    seg(L, 12.4, 2.6, 2.0, 20.4, 0.95);
    seg(L, 1.8, 20.8, 17.3, 20.8, 1.1);
    seg(L, 8.6, 28.5, 17.0, 28.5, 1.05);
  },
  5(L) {
    seg(L, 5.6, 2.9, 15.6, 2.9, 1.85);
    seg(L, 15.9, 1.6, 16.3, 5.4, 1.0, 0.8);
    seg(L, 5.4, 3.0, 4.8, 13.6, 1.15);
    arc(L, 9.2, 19.8, 6.6, 7.5, 234, 515);
    ball(L, 3.2, 22.6, 2.45);
  },
  6(L) {
    arc(L, 9.2, 20.6, 6.3, 7.1, 0, 360);
    arc(L, 12.8, 17.2, 9.7, 13.6, 166, 262, t, T, 12);
    ball(L, 12.2, 4.7, 2.15);
  },
  7(L) {
    seg(L, 2.6, 3.0, 16.3, 3.0, 1.75);
    seg(L, 2.4, 2.0, 2.2, 6.8, 1.0, 0.85);
    seg(L, 16.3, 3.6, 10.8, 15.8, 1.15, 2.35);
    seg(L, 10.8, 15.8, 8.6, 27.4, 2.35, 2.6);
  },
  8(L) {
    arc(L, 9, 8.5, 5.0, 5.7, 0, 360, t, T * 0.8);
    arc(L, 9, 21.2, 6.3, 6.7, 0, 360);
  },
};
DEF[9] = (L) => { const M = []; DEF[6](M); for (const [ax, ay, bx, by, ra, rb] of M) L.push([GW - ax, GH - ay, GW - bx, GH - by, ra, rb]); };

/** Distance to a round cone (tapered capsule) from a to b, radii ra, rb (iq). */
function cone(px, py, ax, ay, bx, by, ra, rb) {
  const bax = bx - ax, bay = by - ay, l2 = bax * bax + bay * bay;
  const pax = px - ax, pay = py - ay;
  if (l2 < 1e-9) return Math.hypot(pax, pay) - ra;
  const rr = ra - rb, a2 = l2 - rr * rr, il2 = 1 / l2;
  const y = pax * bax + pay * bay, z = y - l2;
  const qx = pax * l2 - bax * y, qy = pay * l2 - bay * y, x2 = qx * qx + qy * qy;
  const y2 = y * y * l2, z2 = z * z * l2, k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - rb;
  if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - ra;
  return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - ra;
}

// SDF grids: box x -4..22, y -4..34, 4 samples per unit
export const RES = 4, X0 = -4, Y0 = -4, NX = (GW + 8) * RES + 1, NY = (GH + 8) * RES + 1;
export const GRIDS = [];
for (let d = 0; d <= 9; d++) {
  const L = []; DEF[d](L);
  const g = new Float32Array(NX * NY);
  for (let j = 0; j < NY; j++) {
    const y = Y0 + j / RES;
    for (let i = 0; i < NX; i++) {
      const x = X0 + i / RES;
      let m = 1e9;
      for (const s of L) { const v = cone(x, y, s[0], s[1], s[2], s[3], s[4], s[5]); if (v < m) m = v; }
      g[j * NX + i] = m;
    }
  }
  GRIDS.push(g);
}

/** Signed distance (units) to digit d at glyph point (x, y), bilinear. */
export function glyphSDF(d, x, y) {
  const fx = (x - X0) * RES, fy = (y - Y0) * RES;
  if (fx < 0 || fy < 0 || fx >= NX - 1 || fy >= NY - 1) return 4;
  const i = fx | 0, j = fy | 0, u = fx - i, v = fy - j, g = GRIDS[d], k = j * NX + i;
  const a = g[k], b = g[k + 1], c = g[k + NX], e = g[k + NX + 1];
  return a + (b - a) * u + (c - a) * v + (a - b - c + e) * u * v;
}
