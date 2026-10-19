// Figures for the graffiti alley: bold silhouettes built from tapered
// capsules, drawn by coverage into an albedo raster with a lamp-lit rim.
const W = 192, H = 64;

// colour table (linear albedo)
export const C = {
  body: 0, shoe: 1, can: 2, cap: 3, vest: 4, stripe: 5, hat: 6, beanieR: 7, beanieY: 8, pole: 9, roller: 10,
  cat: 11, catDark: 12, skin: 13,
};
const COL = new Float32Array([
  0.006, 0.006, 0.008, // body: near black
  0.42, 0.42, 0.40,    // shoes
  0.62, 0.05, 0.03,    // can
  0.6, 0.6, 0.6,       // nozzle cap
  0.42, 0.5, 0.0,      // hi-vis vest
  0.8, 0.8, 0.75,      // reflective stripe
  0.55, 0.52, 0.45,    // hard hat
  0.55, 0.04, 0.05,    // red beanie
  0.6, 0.42, 0.0,      // yellow cap
  0.09, 0.09, 0.09,    // pole
  0.2, 0.2, 0.19,      // roller (wet grey)
  0.36, 0.14, 0.03,    // ginger cat
  0.12, 0.04, 0.01,    // cat stripes / dark
  0.16, 0.08, 0.05,    // skin (hands)
]);
const RIM = [0.3, 0.24, 0.17];

/** A figure: up to 24 capsules [ax, ay, bx, by, ra, rb, col]. */
export function makeFig() { return { n: 0, cap: new Float32Array(24 * 7), stripeY: -99, rim: 1 }; }
export function cap(f, ax, ay, bx, by, ra, rb, col) {
  if (f.n >= 24) return;
  const o = f.n++ * 7, c = f.cap;
  c[o] = ax; c[o + 1] = ay; c[o + 2] = bx; c[o + 3] = by; c[o + 4] = ra; c[o + 5] = rb; c[o + 6] = col;
}

const E = new Float32Array(2);
/** Two-bone arm from shoulder to target; writes elbow into E, returns the clamped reach. */
function ik(sx, sy, tx, ty, l, bend) {
  let dx = tx - sx, dy = ty - sy, d = Math.hypot(dx, dy) || 1e-3;
  const mx = 2 * l - 0.05;
  if (d > mx) { dx *= mx / d; dy *= mx / d; d = mx; }
  const a = Math.acos(Math.min(1, d / (2 * l))), base = Math.atan2(dy, dx) + bend * a;
  E[0] = sx + l * Math.cos(base); E[1] = sy + l * Math.sin(base);
  return [sx + dx, sy + dy];
}

/**
 * A person, feet at (x, fy). P is a reusable pose object:
 * { phase, move, lean, lhx, lhy, rhx, rhy, hood, hat, vest, canR, canL, crouch }
 * Hands are absolute targets. Returns the right hand position.
 */
export function person(f, x, fy, P) {
  const cr = P.crouch;
  const hipY = fy - 11 + cr * 3, neckY = fy - 18 + cr * 4, headY = fy - 24.3 + cr * 4;
  const sw = Math.sin(P.phase) * P.move, lift = P.move * 1.3;
  // legs
  for (const sgn of [1, -1]) {
    const s = sw * sgn, hx = x + 1.2 * sgn * 0.6;
    const fx = x + s * 3.8 + sgn * (0.6 + cr * 1.5), fyy = fy - 1.2 - Math.max(0, Math.cos(P.phase) * sgn) * lift;
    const kx = (hx + fx) / 2 + s * 0.8 + cr * 2 * sgn, ky = (hipY + fyy) / 2 - cr * 1.2;
    cap(f, hx, hipY, kx, ky, 1.9, 1.6, C.body);
    cap(f, kx, ky, fx, fyy, 1.6, 1.3, C.body);
    const dir = P.dir || 1;
    cap(f, fx - dir * 0.6, fyy + 0.3, fx + dir * 1.9, fyy + 0.5, 1.15, 1.0, C.shoe);
  }
  const tx = x + P.lean;
  cap(f, x, hipY, tx, neckY, 3.3, 3.8, P.vest ? C.vest : C.body);
  if (P.vest) f.stripeY = (hipY + neckY) / 2;
  cap(f, tx + P.lean * 0.3, headY, tx + P.lean * 0.3, headY, 3.3, 3.3, C.body);
  if (P.hat === C.hat) cap(f, tx - 3.6, headY - 1.4, tx + 3.6, headY - 1.4, 1.2, 1.2, C.hat), cap(f, tx, headY - 2.2, tx, headY - 2.2, 2.6, 2.6, C.hat);
  else if (P.hat >= 0) cap(f, tx - 1.5, headY - 2.5, tx + 1.5, headY - 2.5, 1.9, 1.9, P.hat);
  // arms
  const shy = neckY + 1.0;
  const [rx, ry] = ik(tx + 2.6, shy, P.rhx, P.rhy, 6.6, 1);
  cap(f, tx + 2.6, shy, E[0], E[1], 1.55, 1.45, C.body); cap(f, E[0], E[1], rx, ry, 1.45, 1.3, C.body);
  const [lx, ly] = ik(tx - 2.6, shy, P.lhx, P.lhy, 6.6, -1);
  cap(f, tx - 2.6, shy, E[0], E[1], 1.55, 1.45, C.body); cap(f, E[0], E[1], lx, ly, 1.45, 1.3, C.body);
  if (P.canR) {
    cap(f, rx, ry - 0.4, rx, ry + 2.0, 1.35, 1.35, C.can);
    cap(f, rx, ry - 1.6, rx, ry - 1.6, 0.8, 0.8, C.cap);
  }
  RH[0] = rx; RH[1] = ry; RH[2] = lx; RH[3] = ly;
  return RH;
}
export const RH = new Float32Array(4);

/** A ginger cat, walking right, feet at (x, fy). */
export function cat(f, x, fy, t) {
  const ph = x * 0.75;
  for (let k = 0; k < 4; k++) {
    const lx = x - 3.2 + (k >> 1) * 6.4 + (k & 1) * 0.8, s = Math.sin(ph + (k * 1.7 + (k >> 1) * Math.PI)) * 1.0;
    cap(f, lx, fy - 4, lx + s, fy - 0.6, 0.85, 0.7, C.cat);
  }
  cap(f, x - 4, fy - 5, x + 3.6, fy - 5.3, 2.2, 2.0, C.cat);
  const hx = x + 5.6, hy = fy - 7.4 + Math.sin(ph * 2) * 0.25;
  cap(f, hx, hy, hx, hy, 2.0, 2.0, C.cat);
  cap(f, hx - 1.4, hy - 1.6, hx - 1.3, hy - 3.2, 0.8, 0.1, C.cat);
  cap(f, hx + 1.1, hy - 1.6, hx + 1.4, hy - 3.2, 0.8, 0.1, C.cat);
  const tw = Math.sin(t * 1.7) * 1.5;
  cap(f, x - 5.5, fy - 5.6, x - 8.5 + tw * 0.3, fy - 9, 0.85, 0.75, C.cat);
  cap(f, x - 8.5 + tw * 0.3, fy - 9, x - 8.0 + tw, fy - 12.2, 0.75, 0.6, C.cat);
  f.stripeY = -99; f.rim = 0.4;
}

/** Draw figure f into the albedo raster alb (3 per pixel), darkened by `shade` (0..1). */
export function drawFig(alb, f, shade = 1) {
  const c = f.cap, n = f.n;
  if (!n) return;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (let k = 0; k < n; k++) {
    const o = k * 7, r = Math.max(c[o + 4], c[o + 5]) + 1.5;
    x0 = Math.min(x0, c[o] - r, c[o + 2] - r); x1 = Math.max(x1, c[o] + r, c[o + 2] + r);
    y0 = Math.min(y0, c[o + 1] - r, c[o + 3] - r); y1 = Math.max(y1, c[o + 1] + r, c[o + 3] + r);
  }
  x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0));
  x1 = Math.min(W - 1, Math.ceil(x1)); y1 = Math.min(H - 1, Math.ceil(y1));
  const sy = f.stripeY, rimK = f.rim;
  for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
    const qx = px + 0.5, qy = py + 0.5;
    let best = 1e9, bc = 0, bodyD = 1e9, inC = -1;
    for (let k = 0; k < n; k++) {
      const o = k * 7, ax = c[o], ay = c[o + 1], dx = c[o + 2] - ax, dy = c[o + 3] - ay, L2 = dx * dx + dy * dy;
      let t = L2 > 0 ? ((qx - ax) * dx + (qy - ay) * dy) / L2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = qx - ax - t * dx, ey = qy - ay - t * dy;
      const d = Math.sqrt(ex * ex + ey * ey) - (c[o + 4] + (c[o + 5] - c[o + 4]) * t);
      // later capsules sit on top: the last one that covers the pixel wins
      if (d < 0.2) { inC = c[o + 6]; }
      if (d < best) { best = d; bc = c[o + 6]; }
      if (d < bodyD) bodyD = d;
    }
    if (inC >= 0) bc = inC;
    const cov = Math.min(1, Math.max(0, 0.5 - bodyD));
    if (cov <= 0) continue;
    let ci = bc;
    if (ci === C.vest && Math.abs(qy - sy) < 0.8) ci = C.stripe;
    let r = COL[ci * 3], g = COL[ci * 3 + 1], b = COL[ci * 3 + 2];
    // lamp-lit rim on the dark parts: a bold outline that keeps the silhouette off the bricks
    if (ci === C.body && bodyD > -1.15) { const k = rimK * Math.min(1, (bodyD + 1.15) / 0.8); r += RIM[0] * k; g += RIM[1] * k; b += RIM[2] * k; }
    r *= shade; g *= shade; b *= shade;
    const p = 3 * (py * W + px);
    alb[p] += (r - alb[p]) * cov; alb[p + 1] += (g - alb[p + 1]) * cov; alb[p + 2] += (b - alb[p + 2]) * cov;
  }
}
