// Coaster: a funfair at dusk across three HUB75 panels, and the time IS the
// roller coaster. Each digit is one continuous piece of track (loops for 0, 6,
// 8, 9; a hairpin in the 3; drops and curls between), strung with marquee
// bulbs, on a lattice of supports silhouetted against the sunset. A train with
// the rainbow frog in the front car rides the whole circuit all the time:
// chain lift, then energy conservation (slow on crests, fast in dips), brakes,
// station. Minute: the bulbs of the changing digit go out, its steel flexes
// into the new digit while the train climbs the lift, and the bulbs chase back
// on. Hour: no lift, a countdown and a launch, fireworks over the park.
import * as kit from '../js/kit.js';
import { ROUTES, N } from './coaster-track.js';
import { fairStatic, drawFair } from './coaster-fair.js';

const W = 192, H = 64, DS = 0.5;
const SLOTS = [
  { x: 44, w: 32, top: 7, h: 45 }, { x: 81, w: 32, top: 7, h: 45 },
  { x: 121, w: 28, top: 14, h: 38 }, { x: 154, w: 28, top: 14, h: 38 },
];
// codes: 1 platform, 2 lift, 3 first drop, 4 return run, 0 course
// the station runs right into a vertical lift up a lattice tower (x 30), over
// the crest and down a near-vertical first drop (x 38) into the first digit;
// the return run comes back along the ground under the tents
const PREFIX = chaikin([
  [22, 56, 1], [25.5, 55.5, 2], [28.4, 53.8, 2], [29.8, 50.5, 2], [30, 46, 2], [30, 13, 2], [30.6, 9.4, 2],
  [32.4, 7.2, 3], [34.6, 6.6, 3], [36.6, 7.6, 3], [37.8, 10.4, 3], [38, 15, 3], [38, 41, 3], [38.7, 46.6, 3],
  [40.6, 50.4, 3], [44, 52, 0],
], 2);
const SUFFIX = chaikin([
  [186, 52, 4], [188.3, 52.6, 4], [190, 54.4, 4], [190.6, 56.8, 4], [190, 59.2, 4], [188.3, 60.9, 4], [186, 61.5, 4],
  [10, 61.5, 4], [6.4, 61.2, 4], [3.6, 60, 4], [2.4, 58.6, 4], [3.4, 57, 1], [6, 56.2, 1], [9, 56, 1], [22, 56, 1],
], 2);
function chaikin(p, it) {
  for (let k = 0; k < it; k++) {
    const q = [p[0]];
    for (let i = 0; i + 1 < p.length; i++) {
      const a = p[i], b = p[i + 1];
      q.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1], a[2]]);
      q.push([0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1], a[2]]);
    }
    q.push(p[p.length - 1]);
    p = q;
  }
  return p;
}

// ------------------------------------------------------------- palette
const STEEL = [0.03, 0.032, 0.046];
const STEEL_HI = [0.15, 0.14, 0.16];        // lift, drop, station, return run: lit structure
const PAINT = kit.scale(kit.hex('#1fc8c8'), 0.26);
const BULB = [1, 0.66, 0.32];
const BULB_HOT = [1, 0.86, 0.66];
const CAR = kit.scale(kit.hex('#ff3a24'), 0.6);
const FW = [[1, 0.62, 0.18], [1, 0.22, 0.42], [0.9, 0.85, 1]];

// ------------------------------------------------------------- the sky
const SKY = new Float32Array(3 * W * H);
const FAIR = fairStatic();
const STARS = [];
{
  const stops = [[0, [0.0, 0.0, 0.004]], [16, [0.004, 0.002, 0.014]], [32, [0.018, 0.005, 0.028]], [46, [0.045, 0.011, 0.028]], [56, [0.075, 0.022, 0.02]], [60.5, [0.1, 0.04, 0.012]]];
  for (let y = 0; y < H; y++) {
    let c = [0, 0, 0];
    if (y <= 60) {
      let k = 0;
      while (k < stops.length - 2 && stops[k + 1][0] < y) k++;
      const f = kit.smoothstep(stops[k][0], stops[k + 1][0], y);
      c = kit.mix(stops[k][1], stops[k + 1][1], f);
    }
    for (let x = 0; x < W; x++) {
      const p = 3 * (y * W + x), wob = 1 + 0.12 * (kit.noise2(x * 0.05, y * 0.12) - 0.5);
      SKY[p] = c[0] * wob; SKY[p + 1] = c[1] * wob; SKY[p + 2] = c[2] * wob;
    }
  }
  for (let k = 0; k < 46; k++) STARS.push([Math.floor(kit.hash(k, 1) * W), Math.floor(kit.hash(k, 2) ** 1.4 * 34), 0.012 + 0.03 * kit.hash(k, 3), kit.hash(k, 4) * 6.28, 0.6 + 1.6 * kit.hash(k, 5)]);
}

// ------------------------------------------------------------- the circuit
/** Assemble the whole closed circuit from the four digit routes; sample it every DS px. */
function buildPath(routes) {
  const pts = [];
  for (const p of PREFIX) pts.push([p[0], p[1], 0, -1, p[2]]);
  routes.forEach((r, k) => {
    const S = SLOTS[k];
    for (let i = 0; i < N; i++) pts.push([S.x + r.u[i] * S.w, S.top + r.v[i] * S.h, r.lit[i], k, 0]);
  });
  for (let i = 0; i < SUFFIX.length; i++) pts.push([SUFFIX[i][0], SUFFIX[i][1], 0, -1, SUFFIX[i][2]]);
  // arc length
  const cum = new Float64Array(pts.length);
  for (let i = 1; i < pts.length; i++) cum[i] = cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  const L = cum[pts.length - 1], n = Math.floor(L / DS);
  const X = new Float32Array(n), Y = new Float32Array(n), lit = new Uint8Array(n), slot = new Int8Array(n), code = new Uint8Array(n);
  const ls = new Float32Array(n), lf = new Float32Array(n);
  let j = 0;
  const slotLen = [0, 0, 0, 0];
  for (let k = 0; k < n; k++) {
    const s = k * DS;
    while (j < pts.length - 2 && cum[j + 1] < s) j++;
    const f = (s - cum[j]) / (cum[j + 1] - cum[j] || 1), a = pts[j], b = pts[j + 1];
    X[k] = a[0] + (b[0] - a[0]) * f; Y[k] = a[1] + (b[1] - a[1]) * f;
    lit[k] = a[2]; slot[k] = a[3]; code[k] = a[4];
    if (a[3] >= 0) { ls[k] = slotLen[a[3]]; slotLen[a[3]] += DS; }
  }
  for (let k = 0; k < n; k++) if (slot[k] >= 0) lf[k] = ls[k] / slotLen[slot[k]];
  // smoothed tangents
  const TX = new Float32Array(n), TY = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const a = (k - 4 + n) % n, b = (k + 4) % n, dx = X[b] - X[a], dy = Y[b] - Y[a], m = Math.hypot(dx, dy) || 1;
    TX[k] = dx / m; TY[k] = dy / m;
  }
  // the riders' "up": normal to the track on the course; straight up on the flat
  // turns and the return run (seen side-on they are horizontal), blended
  const ux0 = new Float32Array(n), uy0 = new Float32Array(n), UX = new Float32Array(n), UY = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    if (code[k] === 1 || code[k] === 4) { ux0[k] = 0; uy0[k] = -1; } else { ux0[k] = TY[k]; uy0[k] = -TX[k]; }
  }
  for (let k = 0; k < n; k++) {
    let ax = 0, ay = 0;
    for (let q = -10; q <= 10; q++) { const j = (k + q + n) % n; ax += ux0[j]; ay += uy0[j]; }
    let px = ax - (ax * TX[k] + ay * TY[k]) * TX[k], py = ay - (ax * TX[k] + ay * TY[k]) * TY[k];
    let m = Math.hypot(px, py);
    if (m < 1e-3) { px = ax; py = ay; m = Math.hypot(px, py) || 1; }
    UX[k] = px / m; UY[k] = py / m;
  }
  let crest = 0, lift0 = -1;
  for (let k = 0; k < n && (code[k] <= 3); k++) {
    if (code[k] === 2 && lift0 < 0) lift0 = k;
    if (code[k] >= 2 && Y[k] < Y[crest]) crest = k;
  }
  if (code[crest] !== 2 && code[crest] !== 3) crest = lift0;
  const HW = new Float32Array(n);
  for (let k = 0; k < n; k++) HW[k] = 0.95 + 1.0 * TY[k] * TY[k];
  const P = { X, Y, TX, TY, UX, UY, HW, lit, slot, code, ls, lf, n, L: n * DS, crest, lift0 };
  rasterise(P);
  return P;
}

/** Track coverage, bulbs and supports for a path. */
function rasterise(P) {
  const dist = new Float32Array(W * H).fill(9), who = new Int32Array(W * H).fill(-1);
  const R = 2.6, RH = 4.4, halo = new Float32Array(W * H);
  for (let pass = 0; pass < 2; pass++) {
    for (let k = 0; k < P.n; k++) {
      if (P.lit[k] !== pass) continue;           // plain steel first, lit track over it
      const x = P.X[k], y = P.Y[k], bias = pass ? 0.45 : 0, r = pass ? RH : R, hw = P.HW[k];
      for (let gy = Math.max(0, Math.ceil(y - r)); gy <= Math.min(H - 1, Math.floor(y + r)); gy++) {
        for (let gx = Math.max(0, Math.ceil(x - r)); gx <= Math.min(W - 1, Math.floor(x + r)); gx++) {
          const d = Math.hypot(gx - x, gy - y), p = gy * W + gx;
          if (pass) { const h = 1 - kit.smoothstep(hw + 0.8, hw + 2.6, d); if (h > halo[p]) halo[p] = h; }
          if (d < R && d - bias < dist[p]) { dist[p] = d - bias; who[p] = k; }
        }
      }
    }
  }
  // the dark margin round the lit letterforms, so the fair behind never touches them
  const hp = [], hv = [];
  for (let p = 0; p < W * H; p++) if (halo[p] > 0.02) { hp.push(p); hv.push(halo[p]); }
  P.hpix = Int32Array.from(hp); P.hval = Float32Array.from(hv);
  const idx = [], dd = [], ws = [];
  for (let p = 0; p < W * H; p++) {
    if (who[p] < 0) continue;
    const k = who[p], d = dist[p] + (P.lit[k] ? 0.45 : 0);
    if (d < (P.lit[k] ? P.HW[k] + 0.5 : 1.5)) { idx.push(p); dd.push(d); ws.push(k); }
  }
  P.pix = Int32Array.from(idx); P.pd = Float32Array.from(dd); P.pk = Int32Array.from(ws);
  // bulbs every 3 px along lit track
  const bulbs = [];
  let next = [0, 0, 0, 0];
  for (let k = 0; k < P.n; k++) {
    const s = P.slot[k];
    if (s < 0 || !P.lit[k]) continue;
    if (P.ls[k] >= next[s]) { bulbs.push([P.X[k], P.Y[k], s, Math.round(P.ls[k] / 2.6), P.lf[k], k]); next[s] = P.ls[k] + 2.6; }
  }
  P.bulbs = bulbs;
}

// ------------------------------------------------------------- physics
const G = 60, MU = 0.012, VLIFT = 12, ADEP = 10, ABRAKE = 22, VMIN = 9, VLAUNCH = 58;
/** Speed at every sample for one lap from the station stop (s = 0) back to it, and the time there. */
function lapTable(P, launch) {
  const n = P.n, v = new Float32Array(n + 1), t = new Float64Array(n + 1);
  const sc = P.crest * DS, yc = P.Y[P.crest], vc = launch ? VLAUNCH : VLIFT, aL = (VLAUNCH * VLAUNCH) / (2 * sc);
  for (let k = 0; k <= n; k++) {
    const s = k * DS, y = P.Y[k % n];
    let vv;
    if (k <= P.crest) vv = launch ? Math.sqrt(2 * aL * s) : Math.min(VLIFT, Math.sqrt(2 * ADEP * s));
    else vv = Math.sqrt(Math.max(vc * vc + 2 * G * (y - yc) - 2 * G * MU * (s - sc), VMIN * VMIN));
    if (k > P.crest) vv = Math.min(vv, Math.sqrt(2 * ABRAKE * Math.max(0, P.L - s)));
    v[k] = vv;
  }
  for (let k = 1; k <= n; k++) t[k] = t[k - 1] + (2 * DS) / Math.max(1e-3, v[k - 1] + v[k]);
  return { v, t, T: t[n] };
}
/** Front-car arc length and speed at lap time lt. */
function lapAt(tab, lt) {
  const t = tab.t;
  let lo = 0, hi = t.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (t[m] <= lt) lo = m; else hi = m; }
  const f = (lt - t[lo]) / (t[hi] - t[lo] || 1);
  return [(lo + f) * DS, tab.v[lo] + (tab.v[hi] - tab.v[lo]) * f];
}

// ------------------------------------------------------------- caches
const paths = new Map(), tables = new Map();
function pathFor(key, routes) {
  let p = paths.get(key);
  if (!p) { if (paths.size > 24) paths.clear(); p = buildPath(routes); paths.set(key, p); }
  return p;
}
function tableFor(key, P, launch) {
  const k = key + (launch ? 'L' : '');
  let t = tables.get(k);
  if (!t) { if (tables.size > 24) tables.clear(); t = lapTable(P, launch); tables.set(k, t); }
  return t;
}

// the in-between form of every turn: three camelback hills
const HUMPS = { u: new Float32Array(N), v: new Float32Array(N) };
for (let i = 0; i < N; i++) {
  const f = i / (N - 1);
  HUMPS.u[i] = f; HUMPS.v[i] = 1 - 0.3 * Math.sin(Math.PI * 3 * f) ** 2 * kit.smoothstep(0, 0.12, f) * kit.smoothstep(1, 0.88, f);
}
const pad = (n) => String(n).padStart(2, '0');
const digitsOf = (d) => pad(d.getHours()) + pad(d.getMinutes());
const MORPH0 = 0.3, MORPH1 = 2.2, RELIGHT = 0.6, WAIT = 3.0;

/** Where the train is: [s, v, launching]. */
function schedule(P, key, tau, hourMin) {
  const tn = tableFor(key, P, false);
  if (!hourMin) {
    const k = Math.max(1, Math.floor(60 / (tn.T + 1.2))), slot = 60 / k, lt = tau % slot;
    return lt < tn.T ? [...lapAt(tn, lt), false, tn, lt, slot] : [0, 0, false, tn, lt, slot];
  }
  if (tau < WAIT) return [0, 0, false, null, 0];
  const tl = tableFor(key, P, true);
  if (tau < WAIT + tl.T) return [...lapAt(tl, tau - WAIT), true, tl, tau - WAIT];
  const rem = 60 - WAIT - tl.T, k = Math.floor(rem / (tn.T + 1.2));
  if (k < 1) return [0, 0, false, tl, tau - WAIT];
  const lt = (tau - WAIT - tl.T) % (rem / k);
  return lt < tn.T ? [...lapAt(tn, lt), false, tn, lt] : [0, 0, false, tn, lt];
}

// ------------------------------------------------------------- drawing
const img = new Float32Array(3 * W * H);
const addPx = (x, y, c, a) => {
  if (x < 0 || y < 0 || x >= W || y >= H || a <= 0) return;
  const p = 3 * (y * W + x);
  img[p] += c[0] * a; img[p + 1] += c[1] * a; img[p + 2] += c[2] * a;
};
const overPx = (x, y, c, a) => {
  if (x < 0 || y < 0 || x >= W || y >= H || a <= 0) return;
  const p = 3 * (y * W + x);
  img[p] += (c[0] - img[p]) * a; img[p + 1] += (c[1] - img[p + 1]) * a; img[p + 2] += (c[2] - img[p + 2]) * a;
};
/** A soft round light at a sub-pixel position. */
function glow(x, y, r, c, a) {
  const x0 = Math.ceil(x - r), x1 = Math.floor(x + r), y0 = Math.ceil(y - r), y1 = Math.floor(y + r), k = 1 / (r * r);
  for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) {
    const d2 = ((gx - x) ** 2 + (gy - y) ** 2) * k;
    if (d2 < 1) addPx(gx, gy, c, a * (1 - d2) * (1 - d2));
  }
}

// the train: two big cars. In front the rainbow frog in round glasses; behind
// it a duck. Drawn in the car's own frame (uu along the track, nn up from the
// rail), so cars bank and turn over with the track.
const CARS = 2, GAP = 11.5;
const DUCK = [0.62, 0.46, 0.04], BEAK = [0.7, 0.2, 0.02], GLASS = [1, 1, 0.95], TRIM = [0.6, 0.42, 0.08], WHEELC = [0.1, 0.1, 0.12];
const FROG = [];
for (let k = 0; k < 6; k++) FROG.push(kit.hsv(k / 6.6, 0.9, 0.95));
function drawTrain(P, s, v, t, dim, dwell) {
  const raise = kit.smoothstep(26, 46, v);
  for (let car = CARS - 1; car >= 0; car--) {
    const sc = ((((s - car * GAP) % P.L) + P.L) % P.L);
    const f = sc / DS, i = Math.floor(f) % P.n, j = (i + 1) % P.n, a = f - Math.floor(f);
    const px = P.X[i] + (P.X[j] - P.X[i]) * a, py = P.Y[i] + (P.Y[j] - P.Y[i]) * a;
    let tx = P.TX[i] + (P.TX[j] - P.TX[i]) * a, ty = P.TY[i] + (P.TY[j] - P.TY[i]) * a;
    let m = Math.hypot(tx, ty) || 1; tx /= m; ty /= m;
    let nx = P.UX[i] + (P.UX[j] - P.UX[i]) * a, ny = P.UY[i] + (P.UY[j] - P.UY[i]) * a;
    m = Math.hypot(nx, ny) || 1; nx /= m; ny /= m;
    const frog = car === 0, bob = dwell ? 0.35 * Math.sin(t * 2.6 + car * 1.3) : 0.15 * Math.sin(t * 9 + car);
    const hy = (frog ? 7.4 : 7.6) + bob;
    for (let gy = Math.floor(py - 14); gy <= Math.ceil(py + 14); gy++) {
      for (let gx = Math.floor(px - 14); gx <= Math.ceil(px + 14); gx++) {
        const dx = gx - px, dy = gy - py, uu = dx * tx + dy * ty, nn = dx * nx + dy * ny;
        if (nn < -0.6 || nn > 14.5 || uu < -7.5 || uu > 7.5) continue;
        // car body: a rounded tub with a gold trim line and two wheels
        const bx = Math.abs(uu) - 3.7, by = Math.abs(nn - 3.1) - 1.3;
        const sdB = Math.hypot(Math.max(bx, 0), Math.max(by, 0)) + Math.min(Math.max(bx, by), 0) - 1.0;
        const cb = kit.clamp(0.5 - sdB);
        if (cb > 0) overPx(gx, gy, kit.scale(Math.abs(nn - 4.5) < 0.5 ? TRIM : CAR, dim), cb);
        for (const wx of [-2.9, 2.9]) {
          const cw = kit.clamp(1.4 - Math.hypot(uu - wx, nn - 0.4));
          if (cw > 0) overPx(gx, gy, kit.scale(WHEELC, dim), cw);
        }
        if (frog) {
          // head: a wide ellipse with two eye bumps on top, striped like a rainbow
          const eh = Math.hypot(uu / 4.8, (nn - hy) / 3.1) - 1;
          const e1 = Math.hypot(uu + 2.4, nn - hy - 2.9), e2 = Math.hypot(uu - 2.4, nn - hy - 2.9);
          const sdH = Math.min(eh * 3.1, e1 - 2.45, e2 - 2.45), ch = kit.clamp(0.5 - sdH);
          if (ch > 0) overPx(gx, gy, kit.scale(FROG[Math.max(0, Math.min(5, Math.floor((hy + 3.4 - nn) / 1.25)))], dim * 0.42), ch);
          // round glasses on the eye bumps: white frames, dark lenses, a glint
          for (const [ex, ed] of [[-2.4, e1], [2.4, e2]]) {
            const lens = kit.clamp(1.6 - ed);
            if (lens > 0) overPx(gx, gy, [0, 0, 0], lens);
            const ring = kit.clamp(0.75 - Math.abs(ed - 1.95));
            if (ring > 0) overPx(gx, gy, kit.scale(GLASS, dim), ring);
            const gl = kit.clamp(0.9 - Math.hypot(uu - ex - 0.5, nn - hy - 3.3) * 1.3);
            if (gl > 0) overPx(gx, gy, kit.scale(GLASS, dim * 0.9), gl);
          }
          const br = kit.clamp(0.6 - kit.segDist(uu, nn, -0.4, hy + 3.1, 0.4, hy + 3.1));
          if (br > 0) overPx(gx, gy, kit.scale(GLASS, dim * 0.8), br);
          // a wide smile
          const sm = kit.clamp(0.6 - Math.abs(Math.hypot(uu, nn - hy - 2.2) - 3.2)) * (nn < hy - 0.1 ? 1 : 0);
          if (sm > 0) overPx(gx, gy, [0.02, 0, 0.01], sm);
          if (raise > 0) for (const [ax, ex] of [[-3.6, -5.6], [3.8, 5.8]]) {
            const ca = kit.clamp(0.8 - kit.segDist(uu, nn, ax, hy - 0.5, ex, hy + 5.2)) * raise;
            if (ca > 0) overPx(gx, gy, kit.scale(FROG[3], dim * 0.8), ca);
          }
        } else {
          // a duck: round yellow head, orange beak, one eye
          const cd = kit.clamp(3.2 - Math.hypot(uu + 0.2, nn - hy));
          if (cd > 0) overPx(gx, gy, kit.scale(DUCK, dim), cd);
          const cbk = kit.clamp(0.6 - (Math.hypot((uu - 3.2) / 1.6, (nn - hy + 0.4) / 0.8) - 1) * 1.2);
          if (cbk > 0) overPx(gx, gy, kit.scale(BEAK, dim), cbk);
          const ce = kit.clamp(1.0 - Math.hypot(uu - 1.0, nn - hy - 0.9) * 1.5);
          if (ce > 0) overPx(gx, gy, [0, 0, 0], ce);
          if (raise > 0) {
            const ca = kit.clamp(0.8 - kit.segDist(uu, nn, -2.4, hy - 0.6, -4.4, hy + 4.2)) * raise;
            if (ca > 0) overPx(gx, gy, kit.scale(DUCK, dim), ca);
          }
        }
      }
    }
  }
}

function fireworks(t, dim) {
  for (let b = 0; b < 11; b++) {
    const t0 = 0.2 + b * 0.95 + 0.4 * kit.hash(b, 7), age = t - t0;
    if (age < 0 || age > 3.2) continue;
    const cx = 50 + kit.hash(b, 8) * 125, cy = 12 + kit.hash(b, 9) * 12, col = FW[b % 3], rise = 0.55;
    if (age < rise) {                                   // the rocket climbing, with a spark tail
      const k = age / rise, y = 61 - (61 - cy) * (1 - (1 - k) ** 2);
      glow(cx, y, 1.1, [1, 0.7, 0.4], 0.6 * dim);
      for (let q = 1; q < 5; q++) glow(cx + 0.3 * Math.sin(q * 3 + t * 20), y + q * 1.6, 0.9, [1, 0.45, 0.15], 0.18 * dim * (1 - q / 5));
      continue;
    }
    const a = age - rise, fade = Math.max(0, 1 - a / 2.65) ** 1.4;
    if (fade <= 0) continue;
    if (a < 0.15) glow(cx, cy, 6, [1, 0.9, 0.8], 0.7 * dim * (1 - a / 0.15));
    const np = 44;
    for (let q = 0; q < np; q++) {
      const ang = (q / np) * kit.TAU + kit.hash(b, q) * 0.3, sp = 46 + 22 * kit.hash(q, b, 3);
      const c2 = kit.mix(col, [1, 0.95, 0.85], kit.clamp(1 - a * 1.5));
      for (let tr = 0; tr < 5; tr++) {
        const aa = Math.max(0, a - tr * 0.06), r = (sp * (1 - Math.exp(-2.4 * aa))) / 2.4;
        const x = cx + Math.cos(ang) * r, y = cy + Math.sin(ang) * r * 0.9 + 6 * aa * aa;
        const tw = 0.6 + 0.4 * Math.sin(t * 31 + q * 2.1);
        glow(x, y, 1.0, c2, 0.5 * dim * fade * tw * (1 - tr * 0.19));
      }
    }
  }
}

export default {
  name: 'Coaster',
  blurb: 'the time is a roller coaster at dusk: each digit one ridden track of loops and drops, strung with bulbs; the rainbow frog rides the front car; digits flex while the train climbs the lift; hours launch with fireworks',
  layouts: ['hub-x3'],
  look: 'smoke', fps: 60, brightness: 0.35, dither: true,
  frame(ctx) {
    const now = ctx.date.getTime() / 1000, M = Math.floor(now / 60) * 60, tau = now - M;
    const cur = digitsOf(ctx.date), prev = digitsOf(new Date((M - 60) * 1000));
    const hourMin = ctx.date.getMinutes() === 0;
    const dim = 1 - 0.65 * ctx.night;

    // the four routes this instant (morphing slots interpolate along the track)
    const changed = [0, 1, 2, 3].map((k) => cur[k] !== prev[k]);
    let key = '', morphing = false;
    const routes = [0, 1, 2, 3].map((k) => {
      if (!changed[k] || tau >= MORPH1) { key += cur[k]; return ROUTES[cur[k]]; }
      if (tau < MORPH0) { key += prev[k]; return ROUTES[prev[k]]; }
      morphing = true;
      const a = ROUTES[prev[k]], b = ROUTES[cur[k]], m = (tau - MORPH0) / (MORPH1 - MORPH0);
      const u = new Float32Array(N), v = new Float32Array(N), lit = new Uint8Array(N);
      // the old digit's steel sags into a row of camelback humps (no digit
      // reads in that), then is hauled up into the new one; a gentle wave runs
      // along the track and every changing slot moves in near-lockstep
      const first = m < 0.5, mm = first ? m * 2 : m * 2 - 1, A = first ? a : HUMPS, B = first ? HUMPS : b;
      for (let i = 0; i < N; i++) {
        const p = kit.ease.inOut(kit.clamp(mm * 1.25 - 0.25 * (i / N)));
        u[i] = A.u[i] + (B.u[i] - A.u[i]) * p; v[i] = A.v[i] + (B.v[i] - A.v[i]) * p; lit[i] = b.lit[i];
      }
      return { u, v, lit };
    });
    const P = morphing ? buildPath(routes) : pathFor(key, routes);
    const PT = pathFor(cur, [0, 1, 2, 3].map((k) => ROUTES[cur[k]]));   // the ride the train is on
    const [s, v, launching, tab, lapT, period = 1e9] = schedule(PT, cur, tau, hourMin);
    if (tau > 50 && tau < 50.2) {
      // build the next minute's circuit early, so the turn itself stays light
      const nd = new Date((M + 60) * 1000), nx = digitsOf(nd), np = pathFor(nx, [0, 1, 2, 3].map((k) => ROUTES[nx[k]]));
      tableFor(nx, np, false); if (nd.getMinutes() === 0) tableFor(nx, np, true);
    }
    const dwell = v < 0.5;

    // per-slot bulb power: 1 lit, 0 dark; and the re-light front
    // bulbs go out and come back in random order, so a half-lit digit never
    // draws another number's shape
    const slotLit = (k, h) => {
      if (!changed[k]) return 1;
      if (tau < MORPH0) return h > tau / MORPH0 ? 1 : 0;
      if (tau < MORPH1) return 0;
      return h < (tau - MORPH1) / RELIGHT ? 1 : 0;
    };
    const slotPaint = (k) => (!changed[k] ? 1 : tau < MORPH0 ? 1 - 0.55 * (tau / MORPH0) : tau < MORPH1 ? 0.45 : 0.45 + 0.55 * kit.clamp((tau - MORPH1) / RELIGHT));

    // sky, stars
    for (let p = 0; p < img.length; p++) img[p] = SKY[p] * dim;
    for (const [x, y, b, ph, sp] of STARS) addPx(x, y, [0.8, 0.85, 1], dim * b * (0.55 + 0.45 * Math.sin(now * sp + ph)));

    // the fair: tents, tower, canopy (baked), the wheel and the bulbs (live)
    for (let p = 0; p < img.length; p++) img[p] += FAIR[p] * dim;
    drawFair(img, glow, now, dim);
    // a dark margin round the letterforms
    for (let q = 0; q < P.hpix.length; q++) {
      const r = 3 * P.hpix[q], k = 1 - 0.92 * P.hval[q];
      img[r] *= k; img[r + 1] *= k; img[r + 2] *= k;
    }

    // the track
    const crest = PT.crest;
    for (let q = 0; q < P.pix.length; q++) {
      const p = P.pix[q], k = P.pk[q], d = P.pd[q], sl = P.slot[k];
      let col = STEEL, cov, a = 1;
      if (sl >= 0 && P.lit[k]) {
        // painted track: wide where it stands up (two rails and the ties between
        // them, like truss), a single rail where it runs flat
        const pt = slotPaint(sl), hw = P.HW[k];
        col = kit.mix(STEEL, PAINT, pt);
        cov = 1 - kit.smoothstep(hw - 0.4, hw + 0.45, d);
        const rail = kit.smoothstep(hw - 1.25, hw - 0.6, d), tie = 0.5 + 0.5 * Math.cos(kit.TAU * (P.ls[k] / 2.2));
        a = 0.5 + 0.65 * rail + 0.45 * (1 - rail) * tie * kit.smoothstep(1.2, 1.7, hw);
      } else {
        cov = 1 - kit.smoothstep(0.5, 1.45, d);
        if (P.code[k] !== 0) col = STEEL_HI;
        if (P.code[k] === 2) {
          // chain lift: the dogs run up all the time
          const ch = kit.fract((k * DS - now * VLIFT) / 2.4);
          a = 1 + 1.2 * Math.max(0, 1 - Math.abs(ch - 0.5) * 5);
        }
      }
      const r = 3 * p, w = cov * dim * a;
      img[r] = img[r] * (1 - cov) + col[0] * w; img[r + 1] = img[r + 1] * (1 - cov) + col[1] * w; img[r + 2] = img[r + 2] * (1 - cov) + col[2] * w;
    }

    // marquee bulbs, chasing in the direction of travel
    const show = hourMin && tau > WAIT && tau < WAIT + 14;
    const speed = show ? 4.2 : 1.4;
    const flares = tab && P === PT;
    for (const [bx, by, sl, n, lf, kb] of P.bulbs) {
      const h = 0.06 + 0.88 * kit.hash(n, sl, 11);
      if (!slotLit(sl, h)) continue;
      const ph = 0.5 + 0.5 * Math.cos(kit.TAU * (n / 5 - now * speed));
      let b = 0.42 + 0.58 * ph ** 4;
      let col = BULB;
      if (flares) {
        // the train lights the track it rides: bulbs flare as it passes, then cool
        let age = lapT - tab.t[kb];
        if (age < 0) age += period;
        if (age >= 0) { const fl = Math.exp(-age / 1.2); b += 1.5 * fl; if (fl > 0.4) col = kit.mix(BULB, BULB_HOT, (fl - 0.4) / 0.6); }
      }
      if (changed[sl] && tau >= MORPH1) {                               // the re-light front flashes white
        const front = (tau - MORPH1) / RELIGHT - h;
        if (front < 0.12) { b += 1.4 * (1 - front / 0.12); col = BULB_HOT; }
      }
      if (show && n % 2) col = BULB_HOT;
      glow(bx, by, 1.0, col, b * dim);
    }

    // station: canopy with bulbs, posts; the hour countdown lamps
    if (hourMin && tau < WAIT + 0.6) {
      for (let q = 0; q < 3; q++) {
        const onq = tau > q * 0.9 + 0.3;
        const c = tau >= WAIT ? [0.1, 1, 0.3] : [1, 0.12, 0.05];
        if (onq) glow(10 + q * 5.5, 36.2, 1.5, c, dim);
      }
    }
    // aircraft beacon on the lift crest
    glow(PT.X[crest], PT.Y[crest] - 2.4, 1.0, [1, 0.05, 0.02], dim * 0.5 * (0.5 + 0.5 * Math.sin(now * 3)));

    // the train
    drawTrain(PT, s, v, now, dim, dwell);
    if (launching && s < PT.crest * DS + 10) {
      // launch: a magnetic glare down the lift as the train is fired up it
      const f = s / DS;
      for (let q = 0; q < 8; q++) {
        const kk = Math.max(0, Math.floor(f - 14 - q * 3));
        glow(PT.X[kk], PT.Y[kk], 1.4, [0.5, 0.7, 1], dim * 0.35 * (1 - q / 8));
      }
    }
    if (show) fireworks(tau - WAIT, dim);

    kit.blitGrid(ctx, img);
  },
};
