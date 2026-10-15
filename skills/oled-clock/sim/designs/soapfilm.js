// Soap Film — the time written in black film.
//
// A soap film stretched across a wire wand shows its thickness as
// interference fringes: thick film is banded, and where it drains thinner
// than about 30 nm it reflects nothing and goes pitch black ("black film").
// Here the minutes are patches of black film on the wand's film and the
// hour is black film on a bubble the wand blew, drifting beside it. The
// fringes around them are a real thickness field: thin at the top, thick at
// the bottom (gravity drains it), stirred by slow Marangoni swirls and
// creeping downward as the film drains, and they bend round the black
// patches, whose edge is the brightest, first-order white film.
//
// The letterforms are liquid: one mono-line hand whose strokes are fused
// with surface-tension fillets and end in droplet terminals.
//
// Minute: a puff of air sets a vortex spinning under each changing digit.
// The old patch is wound into a spiral and refilled with thick film; the
// same vortex keeps turning and unwinds the new digit out of the swirl, so
// the film is always visibly flowing one way. Old digit only before :00.
//
// Hour: the wand is blown. Its film bulges, pinches off as a bubble that
// bumps the old hour bubble, which pops (rupture rim, spray of droplets);
// the new bubble glides into its place and the new hour condenses on it as
// black spots that grow and merge. The empty wand is dipped and comes back
// up with a fresh, thick film that drains until :00 appears.
//
// Burn-in: everything is film that moves; the wire wand walks kit.orbit and
// sways in the hand. 23:00-07:00 the panel dims (ctx.night).

import { dither, clamp, ease, orbit, clockFields } from '../js/kit.js';

const TAU = Math.PI * 2;
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, u) => a + (b - a) * u;

// ------------------------------------------------------------ the liquid hand
// Design units: a digit box 12 wide, 20 tall, y down. Strokes are polylines
// with round caps; `balls` are droplet terminals.

/** Points on an ellipse, clock angles in degrees (0 = up, clockwise). */
function ell(cx, cy, rx, ry, a0, a1, step = 10) {
  const pts = [], n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / step));
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    pts.push([cx + rx * Math.sin(a), cy - ry * Math.cos(a)]);
  }
  return pts;
}

/** A quadratic curve a -> b with control c, as points. */
function quad(a, c, b, n = 8) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, s = 1 - t;
    pts.push([s * s * a[0] + 2 * s * t * c[0] + t * t * b[0], s * s * a[1] + 2 * s * t * c[1] + t * t * b[1]]);
  }
  return pts;
}

const STROKE = 1.65, BALL = 2.25, FUSE = 1.4;

const GLYPHS = {
  0: { strokes: [ell(6, 10, 4.3, 7.7, 0, 360)], balls: [] },
  1: { strokes: [[[2.9, 6.0], ...quad([2.9, 6.0], [5.4, 4.8], [6.8, 2.3], 6).slice(1), [6.8, 17.7]]],
    balls: [[2.9, 6.0]] },
  2: { strokes: [[...ell(6, 6.1, 4.0, 3.9, 285, 480), ...quad([8.7, 9.3], [4.5, 13], [2.0, 17.7], 6).slice(1), [10.2, 17.7]]],
    balls: [[2.1, 5.1], [10.2, 17.7]] },
  3: { strokes: [ell(5.9, 5.8, 3.9, 3.6, 318, 540), ell(5.9, 13.6, 4.3, 4.2, 0, 245), [[5.9, 9.4], [4.6, 9.4]]],
    balls: [[3.3, 3.1], [2.0, 15.4]] },
  4: { strokes: [[[8.4, 2.4], [8.4, 17.6]], [[8.4, 2.4], [2.0, 13.0], [10.6, 13.0]]],
    balls: [[8.4, 2.4], [10.6, 13.0], [8.4, 17.6]] },
  5: { strokes: [[[10.0, 2.3], [3.7, 2.3], [3.1, 9.2], ...ell(6.0, 12.9, 4.3, 4.9, 318, 600)]],
    balls: [[10.0, 2.3], [2.3, 15.3]] },
  6: { strokes: [ell(6, 13.3, 4.2, 4.4, 0, 360), ell(10.1, 13.2, 8.3, 10.6, 270, 344)],
    balls: [[7.2, 3.0]] },
  7: { strokes: [[[1.9, 2.3], [10.2, 2.3], ...quad([10.2, 2.3], [6.2, 9.5], [4.9, 17.7], 8).slice(1)]],
    balls: [[1.9, 2.3], [4.9, 17.7]] },
  8: { strokes: [ell(6, 5.6, 4.1, 3.8, 0, 360), ell(6, 14.0, 4.7, 4.3, 0, 360)], balls: [] },
  9: { strokes: [ell(6, 6.7, 4.2, 4.4, 0, 360), ell(1.9, 6.8, 8.3, 10.6, 90, 164)],
    balls: [[4.8, 17.0]] },
};

function segD(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  const u = l2 ? clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1) : 0;
  return Math.hypot(px - ax - u * dx, py - ay - u * dy);
}

function smin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - (h * h * k) / 4;
}

// Each stroke beads like a liquid thread breaking up (Plateau-Rayleigh): its
// radius swells and necks along its length, swollen at both ends.
const BEAD = 0.09, BEAD_L = 6;
for (const G of Object.values(GLYPHS))
  G.lens = G.strokes.map((st) => {
    const acc = [0];
    for (let i = 1; i < st.length; i++) acc.push(acc[i - 1] + Math.hypot(st[i][0] - st[i - 1][0], st[i][1] - st[i - 1][1]));
    const L = acc.at(-1), n = Math.max(1, Math.round(L / BEAD_L));
    return { acc, L, n, closed: Math.hypot(st[0][0] - st.at(-1)[0], st[0][1] - st.at(-1)[1]) < 0.01 };
  });

/** Signed distance to digit `d` in design units (negative inside). */
function glyphSDF(d, x, y, bead = BEAD) {
  const G = GLYPHS[d];
  let best = 1e9;
  G.strokes.forEach((st, k) => {
    const { acc, L, n } = G.lens[k];
    let m = 1e9;
    for (let i = 1; i < st.length; i++) {
      const ax = st[i - 1][0], ay = st[i - 1][1], dx = st[i][0] - ax, dy = st[i][1] - ay, l2 = dx * dx + dy * dy;
      const u = l2 ? clamp(((x - ax) * dx + (y - ay) * dy) / l2, 0, 1) : 0;
      const sAt = acc[i - 1] + u * (acc[i] - acc[i - 1]);
      const r = STROKE * (1 + bead * Math.cos((TAU * n * sAt) / L));
      const ex = x - ax - u * dx, ey = y - ay - u * dy, v = Math.sqrt(ex * ex + ey * ey) - r;
      if (v < m) m = v;
    }
    best = smin(best, m, FUSE);
  });
  for (const [bx, by] of G.balls) best = smin(best, Math.sqrt((x - bx) ** 2 + (y - by) ** 2) - BALL, FUSE);
  return best;
}

// A digit at a pixel size is cached as a signed-distance grid in pixels,
// sampled at half-pixel steps with a margin, and read back bilinearly.
const MARGIN = 12, RES = 2;
const gridCache = new Map();

function digitGrid(d, scale) {
  const key = d + '@' + scale;
  let G = gridCache.get(key);
  if (G) return G;
  const w = 12 * scale, h = 20 * scale;
  const nx = Math.ceil((w + 2 * MARGIN) * RES) + 1, ny = Math.ceil((h + 2 * MARGIN) * RES) + 1;
  const data = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const px = i / RES - MARGIN, py = j / RES - MARGIN;
      data[j * nx + i] = glyphSDF(d, px / scale, py / scale, scale > 1.2 ? BEAD : 0.04) * scale;
    }
  G = { nx, ny, data, w, h };
  gridCache.set(key, G);
  return G;
}

/** Distance (px) from a point given in the digit's own box coordinates. */
function sampleGrid(G, x, y) {
  const gx = (x + MARGIN) * RES, gy = (y + MARGIN) * RES;
  if (gx < 0 || gy < 0 || gx >= G.nx - 1 || gy >= G.ny - 1) return MARGIN;
  const i = gx | 0, j = gy | 0, fx = gx - i, fy = gy - j, k = j * G.nx + i, D = G.data;
  return (D[k] * (1 - fx) + D[k + 1] * fx) * (1 - fy) + (D[k + G.nx] * (1 - fx) + D[k + G.nx + 1] * fx) * fy;
}

// ------------------------------------------------------------ the film

/**
 * A thickness field u(x, y) in waves of optical path (0 = black film):
 * gravity drains it (thin at `top`, thick at the bottom), vortices stir it,
 * a sphere adds the slant of its limb, a fresh film adds bulk that drains.
 */
function makeField({ cx, cy, R, base = 0.8, grad = 5.5, vortices = [], limb = 0, extra = 0, stretch = 1 }) {
  return (x, y) => {
    let px = (x - cx) / stretch, py = (y - cy) / stretch;
    for (const v of vortices) {
      const dx = px - v.x, dy = py - v.y, r2 = dx * dx + dy * dy;
      const a = v.phi * Math.exp(-r2 / (v.sig * v.sig));
      if (Math.abs(a) < 1e-3) continue;
      const c = Math.cos(a), s = Math.sin(a);
      px = v.x + c * dx - s * dy; py = v.y + s * dx + c * dy;
    }
    // no clamp: a flat patch of film sitting on a crest would light solid
    const depth = (py + R) / (2 * R);
    let u = Math.max(0.2, base + grad * depth) + extra * (0.6 + 0.4 * clamp(depth, 0, 1));
    if (limb) {
      const q = clamp((px * px + py * py) / (R * R), 0, 0.97);
      u += limb * (1 / Math.sqrt(1 - q) - 1);
    }
    return u;
  };
}

/** Distance (px) from screen point (px, py) to a placed digit: twisted, eroded, wobbling. */
function digitDist(D, px, py, wob) {
  let sx = px, sy = py;
  if (D.tw && D.tw.phi) {
    const dx = sx - D.tw.x, dy = sy - D.tw.y;
    const a = -D.tw.phi * Math.exp(-(dx * dx + dy * dy) / (D.tw.sig * D.tw.sig));
    const c = Math.cos(a), s = Math.sin(a);
    sx = D.tw.x + c * dx - s * dy; sy = D.tw.y + s * dx + c * dy;
  }
  // an eroding patch's bright edge thins with it, so it fades into the film
  const e = D.e || 0;
  let dd = (sampleGrid(D.G, sx - D.ox, sy - D.oy) + e) * (1 + 0.25 * e);
  if (wob) dd += wob * Math.sin(0.55 * px + 0.35 * py + D.ph);
  return dd;
}

const STEP = 3, HUG = 8, DIP = 1.15, MOAT = 2.2;
const coarse = new Float32Array(64 * 64);

/**
 * Draw film inside `inside(x, y)` within box [x0, y0, x1, y1]: the field,
 * bent round the black-film digits. A digit is { G, ox, oy, e, tw } with
 * its box top-left at (ox, oy), eroded by `e` px, and optionally twisted by
 * a vortex tw = { x, y, phi, sig } (screen coordinates).
 */
function drawFilm(g, { box, inside, field, digits = [], drift = 0, rim = 2.6, wob = 0 }) {
  const [x0, y0, x1, y1] = box.map(Math.round);
  const buf = g.buf, W = g.width;
  const cw = Math.ceil((x1 - x0) / STEP) + 2, ch = Math.ceil((y1 - y0) / STEP) + 2;
  for (let j = 0; j < ch; j++)
    for (let i = 0; i < cw; i++) coarse[j * cw + i] = field(x0 + i * STEP, y0 + j * STEP);
  for (let y = Math.max(0, y0); y < Math.min(g.height, y1); y++)
    for (let x = Math.max(0, x0); x < Math.min(g.width, x1); x++) {
      const px = x + 0.5, py = y + 0.5;
      if (!inside(px, py)) continue;
      const gx = (px - x0) / STEP, gy = (py - y0) / STEP;
      const i = gx | 0, j = gy | 0, fx = gx - i, fy = gy - j, k = j * cw + i;
      const c00 = coarse[k], c10 = coarse[k + 1], c01 = coarse[k + cw], c11 = coarse[k + cw + 1];
      const u = (c00 * (1 - fx) + c10 * fx) * (1 - fy) + (c01 * (1 - fx) + c11 * fx) * fy;
      const ux = ((c10 - c00) * (1 - fy) + (c11 - c01) * fy) / STEP, uy = ((c01 - c00) * (1 - fx) + (c11 - c10) * fx) / STEP;
      let d = MARGIN, near = null;
      for (const D of digits) {
        if (px < D.ox - MARGIN || px > D.ox + D.G.w + MARGIN || py < D.oy - MARGIN || py > D.oy + D.G.h + MARGIN) continue;
        const dd = digitDist(D, px, py, wob);
        if (dd < d) { d = dd; near = D; }
      }
      if (d < 0) continue;
      if (d < rim) { buf[y * W + x] = 1; continue; }
      // Beyond the rim the film thickens back to the field over a few px, so
      // the fringes bend round the patch. A fringe is drawn where the film is
      // a whole number of waves plus the drain phase, a constant ~1.3 px wide.
      const t = clamp((d - rim) / HUG, 0, 1), ramp = t * t * (3 - 2 * t), dr = (6 * t * (1 - t)) / HUG;
      const dip = near && near.e ? DIP * (1 - smooth(0.3 * E_MAX, 0.9 * E_MAX, near.e)) : DIP;
      const uu = u - dip * (1 - ramp);
      let qx = ux, qy = uy;
      if (near && dr > 0) {
        // the exact slope, so a fringe keeps its width where the two pulls cancel
        qx += dip * dr * (digitDist(near, px + 0.5, py, wob) - d) * 2;
        qy += dip * dr * (digitDist(near, px, py + 0.5, wob) - d) * 2;
      }
      const gu = Math.max(0.03, Math.sqrt(qx * qx + qy * qy));
      const ph = uu - drift + 0.5, fr = Math.abs(ph - Math.round(ph));
      const wpx = fr / gu;                       // distance to the crest, px
      const w = uu < 1.6 ? 1.0 : 0.72;           // low orders are broader
      if (wpx < w && d > rim + MOAT) buf[y * W + x] = 1;
    }
}

// ------------------------------------------------------------ the scene

const RING = { x: 91, y: 35, r: 27 };          // the wand: film radius, wire outside it
const HOUR = { x: 28, y: 23, r: 19.5 };          // the hour bubble's home
const MS = 1.4, HS = 1.05, GAP = 23, HGAP = 14.5;                         // digit scales: minutes, hours
const DAY = 0xcf, NIGHT_C = 0x14;
// build every digit's distance grid once, at load, so no frame pays for one
for (let d = 0; d <= 9; d++) { digitGrid(d, MS); digitGrid(d, HS); }

/** Where the hour bubble drifts, T seconds into its hour. */
function bubblePath(T) {
  return [HOUR.x + 3.2 * Math.sin(T * 0.19) + 1.1 * Math.sin(T * 0.47 + 1),
    HOUR.y + 1.4 * Math.sin(T * 0.23 + 2) + 0.6 * Math.sin(T * 0.61)];
}

/** Slow Marangoni swirls, in film-local coordinates. */
function swirls(T, n, R, seed) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const w = 0.031 + 0.013 * i, p = seed + i * 2.1;
    out.push({ x: 0.45 * R * Math.cos(T * w + p), y: 0.38 * R * Math.sin(T * w * 1.3 + p * 1.7),
      phi: 1.5 * Math.sin(T * (0.07 + 0.02 * i) + p), sig: 0.42 * R });
  }
  return out;
}

/**
 * Satellite bubbles: small ones the wand let go, drifting up through the
 * dark behind the big two. Each lives LIFE seconds on its own cycle.
 */
const SATS = [
  { r: 2.6, x: 10, life: 21, off: 0, sway: 3 }, { r: 2.2, x: 38, life: 17, off: 6, sway: 3 },
  { r: 2.0, x: 55.5, life: 13, off: 2, sway: 1.2 }, { r: 3.0, x: 24, life: 26, off: 11, sway: 4 },
  { r: 2.0, x: 125, life: 11, off: 4, sway: 1 }, { r: 2.4, x: 48, life: 19, off: 14, sway: 3 },
];
const SAT_RISE = 9;                                 // px per second

/**
 * Satellite bubbles: small ones the wand let go, rising through the dark;
 * one that touches the hour bubble or the wand's film pops against it.
 * `Tday` places them in their cycles, `T` (seconds into the hour) is where
 * the hour bubble was; (wx, wy) is the wand.
 */
function drawSatellites(g, Tday, T, wx, wy) {
  for (let i = 0; i < SATS.length; i++) {
    const S = SATS[i], c = (Tday + S.off) / S.life, k = Math.floor(c), age = (c - k) * S.life;
    const x0 = S.x + 4 * (((k * 7 + i * 3) % 5) / 4 - 0.5);
    const at = (a) => [x0 + S.sway * Math.sin(a * 0.5 + k), 68 - SAT_RISE * a];
    // when does it first touch something? (stepped from its release)
    let popAt = Infinity;
    for (let a = 0; a <= age; a += 0.4) {
      const [x, y] = at(a);
      const [bx, by] = bubblePath(T - age + a);
      if (y < -4 || (x - bx) ** 2 + (y - by) ** 2 < (HOUR.r + S.r) ** 2 || (x - wx) ** 2 + (y - wy) ** 2 < (RING.r + 3 + S.r) ** 2) { popAt = a; break; }
    }
    if (age > popAt) {                             // a few flecks, and gone
      const v = (age - popAt) / 0.35, [x, y] = at(popAt);
      if (v < 1) for (let q = 0; q < 5; q++) g.pixel(x + (S.r + 3 * v) * Math.cos(q * 1.26 + k), y + (S.r + 3 * v) * Math.sin(q * 1.26 + k) + 2 * v * v);
      continue;
    }
    const [x, y] = at(age), r = S.r * (0.92 + 0.08 * Math.sin(Tday * 3 + i));
    g.fillWhere((px, py) => { const d = Math.sqrt((px - x) ** 2 + (py - y) ** 2); return d > r - 0.55 && d < r + 0.55; }, 1, [x - r - 2, y - r - 2, 2 * r + 4, 2 * r + 4]);
    if (r > 2.1) g.pixel(x - r * 0.45, y - r * 0.45);
  }
}

const digitList = (f) => [Math.floor(f.h / 10), f.h % 10, Math.floor(f.m / 10), f.m % 10];

/** The wand: wire ring and handle, at (x, y). */
function drawWand(g, x, y) {
  g.ring(x, y, RING.r + 1.0, RING.r + 2.4);
  const a = (130 * Math.PI) / 180, [sx, sy] = [x + (RING.r + 1.7) * Math.sin(a), y - (RING.r + 1.7) * Math.cos(a)];
  g.thickLine(sx, sy, sx + 30 * Math.sin(a), sy - 30 * Math.cos(a), 3.2);
  g.thickLine(sx + 2 * Math.sin(a), sy - 2 * Math.cos(a), sx + 30 * Math.sin(a), sy - 30 * Math.cos(a), 1.2, 0);
}

/** The wand's film, centred (x, y), with its minute digits. */
function ringField(x, y, T, { vort = [], extra = 0, stretch = 1, limb = 0, r = RING.r } = {}) {
  return makeField({ cx: x, cy: y, R: r, vortices: [...swirls(T, 3, r, 0.7), ...vort], extra, stretch, limb });
}

function drawRingFilm(g, x, y, { T, digits, vort = [], extra = 0, stretch = 1, limb = 0, r = RING.r }) {
  const field = ringField(x, y, T, { vort, extra, stretch, limb, r });
  drawFilm(g, {
    box: [x - r - 1, y - r - 1, x + r + 1, y + r + 1],
    inside: (px, py) => (px - x) ** 2 + (py - y) ** 2 < r * r,
    field, digits, drift: T * 0.07, wob: 0.25,
  });
}

/**
 * A free bubble at (x, y) radius R with black-film digits, wobbling.
 * `pop` = { x, y, r }: a rupture hole of radius r opened from (x, y).
 */
function drawBubble(g, x, y, R, { T, digits, vort = [], wob = 0.025, limb = 0.4, pop = null, glint = 1, from = null, drift = null }) {
  // the skin's wobble, an elliptical mode: r(a) = R (1 + a2 cos 2(a - th)), without trig per pixel
  const a2 = wob * Math.sin(T * 2.3), th = T * 0.4, c2 = Math.cos(2 * th), s2 = Math.sin(2 * th);
  const edge = (dx, dy, r2) => R * (1 + (a2 * (c2 * (dx * dx - dy * dy) + s2 * 2 * dx * dy)) / (r2 + 1e-6));
  const holed = pop ? (px, py) => (px - pop.x) ** 2 + (py - pop.y) ** 2 < pop.r * pop.r : () => false;
  const buf = g.buf, W = g.width, H = g.height;
  const bx0 = Math.max(0, Math.floor(x - R - 3)), bx1 = Math.min(W, Math.ceil(x + R + 3));
  const by0 = Math.max(0, Math.floor(y - R - 3)), by1 = Math.min(H, Math.ceil(y + R + 3));
  // a bubble hides what is behind it (the wire, as it bellies out)
  for (let j = by0; j < by1; j++)
    for (let i = bx0; i < bx1; i++) {
      const dx = i + 0.5 - x, dy = j + 0.5 - y, r2 = dx * dx + dy * dy, e = edge(dx, dy, r2) + 0.6;
      if (r2 < e * e && !holed(i + 0.5, j + 0.5)) buf[j * W + i] = 0;
    }
  let field = makeField({ cx: x, cy: y, R, base: 0.6, grad: 4.4, limb, vortices: [...swirls(T, 2, R, 2.9), ...vort] });
  if (from) { const f0 = field, f1 = from.field; field = (px, py) => lerp(f1(px, py), f0(px, py), from.u); }
  drawFilm(g, {
    box: [x - R - 2, y - R - 2, x + R + 2, y + R + 2],
    inside: (px, py) => {
      const dx = px - x, dy = py - y, r2 = dx * dx + dy * dy, e = edge(dx, dy, r2) - 1.6;
      return r2 < e * e && !holed(px, py);
    },
    field, digits, drift: drift ?? T * 0.09, wob: 0.2,
  });
  // the skin: a hairline at the edge; on a pop, the thick rim that gathers the film;
  // the window glint, upper left, cut out of the film with a dark moat
  const h = 0.43 * glint, ga0 = -0.875 - h, ga1 = -0.875 + h;
  for (let j = by0; j < by1; j++)
    for (let i = bx0; i < bx1; i++) {
      const px = i + 0.5, py = j + 0.5, dx = px - x, dy = py - y, r2 = dx * dx + dy * dy, r = Math.sqrt(r2);
      const d = r - edge(dx, dy, r2);
      let v = -1;
      if (pop) {
        const hd = Math.sqrt((px - pop.x) ** 2 + (py - pop.y) ** 2) - pop.r;
        if (hd < 0) continue;
        if (hd < 1.8 && d < 0.6) v = 1;
      }
      if (d > -0.6 && d < 0.6) v = 1;
      else if (glint > 0.02 && dx < 0 && dy < 0) {
        const q = r / R;
        if (q > 0.6 && q < 0.86) {
          const a = Math.atan2(dx, -dy);
          if (a > ga0 && a < ga1) v = q > 0.66 && q < 0.8 && a > ga0 + 0.1 && a < ga1 - 0.1 ? 1 : 0;
        }
      }
      if (v >= 0) buf[j * W + i] = v;
    }
}

/** Two digit placements (tens, units) centred on (x, y), at scale s, gap between centres. */
function pair(d0, d1, x, y, s, gap) {
  const G0 = digitGrid(d0, s), G1 = digitGrid(d1, s);
  return [{ G: G0, ox: x - gap / 2 - G0.w / 2, oy: y - G0.h / 2, ph: 0.3 },
    { G: G1, ox: x + gap / 2 - G1.w / 2, oy: y - G1.h / 2, ph: 2.1 }];
}

// The minute turn: a vortex under each changing digit turns the film by PSI
// in all; the old patch is wound and refilled before :00, the new one
// unwound out of the same turning after it.
const E_MAX = 5.5;
const TW0 = -1.3, TW1 = 1.5, PHI = 2.6 * Math.PI;
const turnS = (tau) => 0.5 - 0.5 * Math.cos(Math.PI * clamp((tau - TW0) / (TW1 - TW0), 0, 1));

function minuteDigits(f, tau, x, y, changes) {
  const D = pair(Math.floor(f.m / 10), f.m % 10, x, y, MS, GAP);
  const vort = [];
  if (tau > TW0 && tau < 4) {
    const S = turnS(tau), psi = PHI * S;
    D.forEach((d, i) => {
      if (!changes[i]) return;
      const cx = d.ox + d.G.w / 2, cy = d.oy + d.G.h / 2;
      const sig = 12;
      if (tau < 0) { d.tw = { x: cx, y: cy, phi: psi, sig }; d.e = E_MAX * smooth(-1.05, -0.08, tau); }
      else { d.tw = { x: cx, y: cy, phi: psi - PHI, sig }; d.e = E_MAX * (1 - smooth(0.08, 1.35, tau)); }
      vort.push({ x: cx - x, y: cy - y, phi: psi * (1 - smooth(0.8, 3.8, tau)), sig: 13 });
    });
  }
  return { D, vort };
}

// ------------------------------------------------------------ the hour

// Seconds from the hour: the wand's film bulges, pinches off as a bubble
// that touches the old hour bubble, which pops (ending at :00); the new one
// glides home and its hour condenses; the empty wand is dipped and brought
// back with a fresh film on which :00 condenses.
const H_BLOW0 = -3.0, H_PINCH = -1.6, H_TOUCH = -0.42, H_GLIDE = 1.5, H_END = 4.4;
const DIP0 = -0.3, DIP1 = 0.95, UP0 = 1.25, UP1 = 2.45;

/** The pop's droplets: where each sits on the skin, and when the hole reaches it. */
const DROPS = Array.from({ length: 22 }, (_, i) => ({ a: (i / 22) * TAU + 0.13 * Math.sin(i * 7.1), v: 22 + 14 * ((i * 37) % 11) / 11 }));

function hourShow(g, f, tau, T, wx, wy, now, oth, Td) {
  drawSatellites(g, Td, tau < 0 ? T : 3600 + tau, wx, wy);
  const O = bubblePath(tau < 0 ? T : 3600 + tau);      // the old bubble keeps its old-hour drift
  const ringC = [wx, wy];
  const dir = [ringC[0] - O[0], ringC[1] - O[1]], dl = Math.hypot(...dir);
  dir[0] /= dl; dir[1] /= dl;
  const touch = [O[0] + dir[0] * (2 * HOUR.r - 0.5), O[1] + dir[1] * (2 * HOUR.r - 0.5)];
  const hole0 = [O[0] + dir[0] * HOUR.r, O[1] + dir[1] * HOUR.r];

  // --- the old hour bubble, until it pops
  if (tau < 0) {
    const pr = tau > H_TOUCH ? (2 * HOUR.r + 4) * ease.inQuad((tau - H_TOUCH) / -H_TOUCH) : 0;
    const pop = pr > 0 ? { x: hole0[0], y: hole0[1], r: pr } : null;
    drawBubble(g, O[0], O[1], HOUR.r, { T, digits: pair(now[0], now[1], O[0], O[1], HS, HGAP), pop });
  }
  // droplets thrown off the rim as the hole sweeps the skin
  if (tau > H_TOUCH && tau < 1.6) {
    const span = -H_TOUCH, reach = 2 * HOUR.r + 4;
    for (const d of DROPS) {
      const sx = O[0] + HOUR.r * Math.sin(d.a), sy = O[1] - HOUR.r * Math.cos(d.a);
      const tr = H_TOUCH + span * Math.sqrt(Math.hypot(sx - hole0[0], sy - hole0[1]) / reach);
      const age = tau - tr;
      if (age < 0 || age > 1.1) continue;
      const ax = sx - hole0[0], ay = sy - hole0[1], al = Math.hypot(ax, ay) + 1e-6;
      const vx = (ax / al) * d.v + Math.sin(d.a) * 8, vy = (ay / al) * d.v - Math.cos(d.a) * 8;
      const px = sx + vx * age, py = sy + vy * age + 40 * age * age;
      if (age < 0.45) g.fillCircle(px, py, 1.0); else g.pixel(px, py);
    }
  }

  // --- the wand: bulge, pinch-off, dip, fresh film
  let dipY = 0;
  if (tau > DIP0 && tau < UP1) {
    if (tau < DIP1) dipY = 72 * ease.inCubic((tau - DIP0) / (DIP1 - DIP0));
    else if (tau < UP0) dipY = 72;
    else dipY = 72 * (1 - ease.outBack((tau - UP0) / (UP1 - UP0)));
  }
  const ry = wy + dipY;
  if (tau > UP0) {
    // fresh film, thick and banded, draining; :00 condenses on it
    const fresh = 1 - smooth(UP0, H_END, tau);
    const D = pair(now[2], now[3], wx, ry, MS, GAP);
    const e = E_MAX * (1 - smooth(2.7, 3.9, tau));
    for (const d of D) d.e = e;
    drawRingFilm(g, wx, ry, { T, digits: e < E_MAX - 0.05 ? D : [], extra: 2.6 * fresh,
      vort: [{ x: -8, y: 6, phi: 2.2 * fresh, sig: 13 }, { x: 10, y: -4, phi: -1.8 * fresh, sig: 11 }] });
  }
  drawWand(g, wx, ry);

  // --- the new bubble: the wand's film bellies out through the ring, pinches
  // off, drifts to the touch, then home
  {
    let cx, cy, R, from = null;
    if (tau < H_PINCH) {
      const u = ease.inOutQuad((tau - H_BLOW0) / (H_PINCH - H_BLOW0));
      cx = wx - 9 * u; cy = wy - 2 * u; R = RING.r + 2.5 * u;
      from = { u: 0.6 * u, field: ringField(cx, cy, T, { stretch: 1 + 0.3 * u, limb: 0.4 * u, r: R,
        vort: [{ x: 0, y: 0, phi: 0.8 * u, sig: 20 }] }) };
    } else if (tau < H_TOUCH) {
      const u = ease.inOutQuad((tau - H_PINCH) / (H_TOUCH - H_PINCH));
      const sx = wx - 9, sy = wy - 2;
      cx = lerp(sx, touch[0], u); cy = lerp(sy, touch[1], u) - 3 * Math.sin(Math.PI * u); R = lerp(RING.r + 2.5, HOUR.r, u);
      // it leaves with the wand's own film, which settles into a bubble's
      from = { u: lerp(0.6, 1, smooth(0, 0.8, u)), field: ringField(cx, cy, T, { stretch: 1.3 * R / RING.r, limb: 0.4, r: R,
        vort: [{ x: 0, y: 0, phi: 0.8, sig: 20 * R / RING.r }] }) };
    } else {
      const u = ease.inOutCubic(clamp(tau / H_GLIDE, 0, 1));
      const home = bubblePath(Math.max(0, tau));
      const k = tau < 0 ? 0 : u;
      cx = lerp(touch[0], home[0], k); cy = lerp(touch[1], home[1], k); R = HOUR.r;
    }
    const wob = 0.025 + 0.06 * smooth(H_BLOW0, H_PINCH, tau) * Math.exp(-Math.max(0, tau - H_PINCH) * 1.6);
    let digits = [];
    if (tau < 0) {
      // it carries the old minutes off, winding them away
      const e = E_MAX * smooth(H_PINCH, -0.55, tau);
      const sc = Math.min(1, R / RING.r);
      digits = pair(Math.floor(f.m / 10), f.m % 10, cx, cy, MS, GAP * sc).map((d) => ({ ...d, e, tw: { x: cx, y: cy, phi: 3 * smooth(H_PINCH, -0.4, tau), sig: 14 } }));
      if (e > E_MAX - 0.05) digits = [];
    } else if (tau > 0.55) {
      const e = E_MAX * (1 - smooth(0.6, 1.9, tau));
      digits = pair(now[0], now[1], cx, cy, HS, HGAP).map((d) => ({ ...d, e }));
    }
    // the drain phase hands over from the wand's film to the bubble's
    const dA = T * 0.07, dB = tau * 0.09, k = smooth(H_PINCH, 0.8, tau);
    let dd = (dA - dB) % 1; if (dd > 0.5) dd -= 1; if (dd < -0.5) dd += 1;
    const drift = dB + dd * (1 - k);
    drawBubble(g, cx, cy, R, { T: tau, digits, wob, limb: 0.4, from, drift, glint: smooth(H_BLOW0, H_BLOW0 + 1.2, tau),
      vort: [{ x: 0, y: 0, phi: 2.5 * smooth(H_PINCH, H_TOUCH, tau) * Math.exp(-Math.max(0, tau - H_TOUCH) * 0.8) * (1 - smooth(2.5, H_END, tau)), sig: R * 0.6 }] });
  }
}

// ------------------------------------------------------------ review sheet

/** For review (out/soapfilm-digits.png): the ten digits at minute and hour size on film tiles. */
export function specimen(g) {
  const rows = [[MS, 26, 38, 1], [HS, 26, 32, 41]];
  for (const [s, tw, th, ty] of rows)
    for (let d = 0; d <= 9; d++) {
      const tx = 1 + d * (tw + 2);
      const G = digitGrid(d, s);
      const cx = tx + tw / 2, cy = ty + th / 2;
      const field = makeField({ cx, cy, R: th / 2, grad: th / 10, vortices: [{ x: 3, y: 6, phi: 0.9, sig: 9 }] });
      drawFilm(g, {
        box: [tx, ty, tx + tw, ty + th], inside: () => true, field, drift: 0.1 * d,
        digits: [{ G, ox: cx - G.w / 2, oy: cy - G.h / 2, ph: 0 }],
      });
    }
}

export default {
  name: 'Soap Film',
  blurb: 'The time in black film: minutes on a bubble wand, the hour on the bubble it blew; a puff of air swirls each minute into the next, and on the hour the wand blows a new bubble that pops the old.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  driver: 'full',

  frame(g, { fields: f, date, oled, night }) {
    oled.contrast(DAY + (NIGHT_C - DAY) * night);
    const ms = date.getTime();
    const T = (ms % 3600000) / 1000;              // seconds into the hour
    // kit.orbit steps a pixel every 3 minutes (at :30); glide each step over 3 s
    const k = Math.floor((ms - 30000) / 180000), step = k * 180000 + 30000;
    const [o1x, o1y] = orbit(date, 2, 3), [o0x, o0y] = orbit(new Date(step - 1000), 2, 3);
    const ou = ease.inOutQuad(clamp((ms - step) / 3000, 0, 1));
    const ox = lerp(o0x, o1x, ou), oy = lerp(o0y, o1y, ou);
    const sway = Math.sin(T * 0.37) * 0.6 + Math.sin(T * 0.83 + 1) * 0.3;
    const wx = RING.x + ox + sway, wy = RING.y + oy + 0.4 * Math.sin(T * 0.51);

    const tau = f.sec >= 57 ? f.sec - 60 : f.sec;
    const other = clockFields(new Date(ms + (tau < 0 ? 60000 : -60000)));
    const now = digitList(f), oth = digitList(other);
    const hourTurn = tau < 0 ? other.m === 0 : f.m === 0;
    if (hourTurn && tau > H_BLOW0 && tau < H_END) return hourShow(g, f, tau, T, wx, wy, now, oth, (ms % 86400000) / 1000);

    const changes = [now[2] !== oth[2], now[3] !== oth[3]];
    drawSatellites(g, (ms % 86400000) / 1000, T, wx, wy);
    const [bx, by] = bubblePath(T);
    drawBubble(g, bx, by, HOUR.r, { T, digits: pair(now[0], now[1], bx, by, HS, HGAP) });
    const { D, vort } = minuteDigits(f, tau, wx, wy, changes);
    drawRingFilm(g, wx, wy, { T, digits: D, vort });
    drawWand(g, wx, wy);
  },
};
