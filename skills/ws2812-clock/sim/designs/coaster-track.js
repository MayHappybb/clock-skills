// Coaster track letterforms. Each digit is ONE continuous piece of track
// that a train can ride: it starts on the station baseline at the left of its
// slot (u 0, v 1) heading right and ends on the baseline at the right, so the
// slots chain into one circuit. Cusps are impossible on rails, so every corner
// is a curve, every bowl a loop and the 3's middle a hairpin. `lit` marks the
// track that carries the marquee bulbs (the digit); the rest is plain steel
// (lead-ins, drops, curls) that only the train needs.
//
// Coordinates: u across the slot 0..1, v down 0..1 (y grows downward).

export const N = 200;              // points per digit route (for morphing)
const ASPECT = 0.71;               // slot width / height, for arc length

function E(out, cx, cy, rx, ry, a0, a1, l, rxf) {
  const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / 6));
  for (let k = 0; k <= n; k++) {
    const a = ((a0 + (a1 - a0) * (k / n)) * Math.PI) / 180;
    const r = rxf ? rxf(a) : rx;
    out.push([cx + r * Math.cos(a), cy + ry * Math.sin(a), l]);
  }
}
const P = (out, u, v, l) => out.push([u, v, l]);

const DEF = {
  0(o) {
    P(o, 0, 1, 0); P(o, 0.25, 1, 0);
    // a clothoid-ish loop: narrower at the top, like a real vertical loop
    E(o, 0.5, 0.5, 0, 0.5, 90, -270, 1, (a) => 0.5 * (0.8 + 0.2 * (1 + Math.sin(a)) / 2));
    o[o.length - 1][2] = 0;
    P(o, 0.75, 1, 0); P(o, 1, 1, 0);
  },
  1(o) {
    P(o, 0, 1, 0); P(o, 0.1, 0.94, 0); P(o, 0.13, 0.7, 0);
    P(o, 0.17, 0.42, 1); P(o, 0.36, 0.22, 1); P(o, 0.53, 0.04, 1);
    P(o, 0.6, 0.0, 1); P(o, 0.64, 0.06, 1); P(o, 0.64, 0.5, 1); P(o, 0.64, 0.9, 1);
    P(o, 0.68, 0.99, 1); P(o, 0.84, 1, 0); P(o, 1, 1, 0);
  },
  2(o) {
    P(o, 0, 1, 0); P(o, 0.0, 0.75, 0); P(o, 0.0, 0.45, 0);
    E(o, 0.5, 0.3, 0.44, 0.28, 180, 395, 1);
    P(o, 0.62, 0.66, 1); P(o, 0.3, 0.84, 1); P(o, 0.08, 0.94, 1); P(o, 0.04, 0.985, 1);
    P(o, 0.12, 1, 1); P(o, 0.5, 1, 1); P(o, 0.95, 1, 0); P(o, 1, 1, 0);
  },
  3(o) {
    P(o, 0, 1, 0); P(o, 0.0, 0.7, 0); P(o, 0.0, 0.32, 0);
    E(o, 0.47, 0.27, 0.4, 0.245, 200, 450, 1);
    P(o, 0.32, 0.505, 1); P(o, 0.26, 0.515, 1); P(o, 0.32, 0.53, 1);
    E(o, 0.48, 0.76, 0.47, 0.245, 270, 515, 1);
    o[o.length - 1][2] = 0;
    P(o, -0.03, 0.82, 0); P(o, -0.05, 0.92, 0); P(o, 0.0, 0.99, 0); P(o, 0.14, 1, 0); P(o, 1, 1, 0);
  },
  4(o) {
    P(o, 0, 1, 0); P(o, 0.5, 1, 0); P(o, 0.66, 0.98, 0); P(o, 0.7, 0.9, 1);
    P(o, 0.7, 0.1, 1); P(o, 0.69, 0.01, 1); P(o, 0.62, 0.03, 1);
    P(o, 0.05, 0.66, 1); P(o, 0.06, 0.71, 1); P(o, 0.16, 0.71, 1); P(o, 0.95, 0.71, 0);
    P(o, 1.03, 0.74, 0); P(o, 1.07, 0.84, 0); P(o, 1.09, 0.96, 0); P(o, 1.13, 1, 0);
  },
  5(o) {
    P(o, 0, 1, 0); P(o, -0.01, 0.88, 0); P(o, 0.03, 0.8, 0);
    E(o, 0.5, 0.68, 0.46, 0.31, 152, -115, 1);
    P(o, 0.2, 0.42, 1); P(o, 0.12, 0.45, 1); P(o, 0.13, 0.36, 1); P(o, 0.15, 0.04, 1);
    P(o, 0.2, 0.025, 1); P(o, 0.9, 0.025, 0);
    P(o, 0.99, 0.05, 0); P(o, 1.05, 0.18, 0); P(o, 1.08, 0.85, 0); P(o, 1.13, 1, 0);
  },
  6(o) {
    P(o, 0, 1, 0); P(o, 0.0, 0.86, 0); P(o, 0.03, 0.7, 0);
    E(o, 0.5, 0.69, 0.44, 0.3, 200, 540, 1);
    P(o, 0.06, 0.4, 1);
    E(o, 0.5, 0.38, 0.44, 0.36, 180, 318, 1);
    o[o.length - 1][2] = 0;
    P(o, 0.97, 0.33, 0); P(o, 1.05, 0.6, 0); P(o, 1.08, 0.88, 0); P(o, 1.13, 1, 0);
  },
  7(o) {
    P(o, 0, 1, 0); P(o, 0.0, 0.6, 0); P(o, 0.0, 0.1, 0); P(o, 0.03, 0.03, 0);
    P(o, 0.06, 0.03, 1); P(o, 0.9, 0.03, 1); P(o, 0.96, 0.05, 1); P(o, 0.94, 0.12, 1);
    P(o, 0.7, 0.45, 1); P(o, 0.52, 0.75, 1); P(o, 0.42, 0.97, 0);
    P(o, 0.41, 1.04, 0); P(o, 0.47, 1.07, 0); P(o, 0.56, 1.03, 0); P(o, 0.66, 1, 0); P(o, 1, 1, 0);
  },
  8(o) {
    P(o, 0, 1, 0); P(o, 0.25, 1, 0);
    // a vertical lemniscate of Gerono: lower lobe, crossing, upper lobe
    const n = 72;
    for (let k = 0; k <= n; k++) {
      const t = Math.PI + (2 * Math.PI * k) / n;
      const v = 0.5 - 0.5 * Math.cos(t);
      o.push([0.5 + 0.96 * Math.sin(t) * Math.cos(t) * (0.82 + 0.18 * v), v, k < n ? 1 : 0]);
    }
    P(o, 0.75, 1, 0); P(o, 1, 1, 0);
  },
  9(o) {
    P(o, 0, 1, 0); P(o, 0.12, 0.985, 1); P(o, 0.55, 0.99, 1); P(o, 0.82, 0.93, 1);
    P(o, 0.93, 0.75, 1); P(o, 0.94, 0.5, 1);
    E(o, 0.5, 0.31, 0.44, 0.3, 0, -300, 1);
    o[o.length - 1][2] = 0;
    P(o, 0.94, 0.5, 0); P(o, 1.04, 0.5, 0); P(o, 1.08, 0.7, 0); P(o, 1.13, 1, 0);
  },
};

/** Chaikin corner cutting, open polyline, ends kept; lit follows the segment. */
function chaikin(p, it) {
  for (let k = 0; k < it; k++) {
    const q = [p[0]];
    for (let i = 0; i + 1 < p.length; i++) {
      const a = p[i], b = p[i + 1];
      q.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1], a[2]]);
      // the corner after this segment belongs to the longer of its two neighbours
      const c = p[i + 2], la = Math.hypot(b[0] - a[0], b[1] - a[1]), lb = c ? Math.hypot(c[0] - b[0], c[1] - b[1]) : 0;
      q.push([0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1], c && lb > la ? b[2] : a[2]]);
    }
    q.push(p[p.length - 1]);
    p = q;
  }
  return p;
}

/** Resample to N points equally spaced along the track. */
function resample(p) {
  const L = [0];
  for (let i = 1; i < p.length; i++) L.push(L[i - 1] + Math.hypot((p[i][0] - p[i - 1][0]) * ASPECT, p[i][1] - p[i - 1][1]));
  const tot = L[L.length - 1], u = new Float32Array(N), v = new Float32Array(N), lit = new Uint8Array(N);
  let j = 0;
  for (let k = 0; k < N; k++) {
    const s = (tot * k) / (N - 1);
    while (j < p.length - 2 && L[j + 1] < s) j++;
    const f = (s - L[j]) / (L[j + 1] - L[j] || 1);
    u[k] = p[j][0] + (p[j + 1][0] - p[j][0]) * f;
    v[k] = p[j][1] + (p[j + 1][1] - p[j][1]) * f;
    lit[k] = p[j][2];
  }
  return { u, v, lit };
}

export const ROUTES = {};
for (const d of Object.keys(DEF)) {
  const o = [];
  DEF[d](o);
  ROUTES[d] = resample(chaikin(o, 3));
}
