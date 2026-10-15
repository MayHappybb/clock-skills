// Foldbox: the five panels of the plus are the net of a lid-less cardboard
// box lying flat on a dark desk, lit by a lamp to the right. Each side flap
// carries one spray-stencilled numeral, all upright: hours in red (top,
// left), minutes in black (right, bottom), so the plus reads row by row as
// 1 / 0 : 0 / 9 with the box bottom as the colon. A black cat lives on the
// bottom panel and watches a firefly that circles the net once a minute (the
// firefly is the second hand).
//
// Minute: the changing flap is flicked up off the desk in true perspective,
// shading and casting its shadow over the cat, goes past upright (you see
// its plain inside), and flops back down with the new numeral: the swap
// happens exactly edge-on, at :00.
// Hour: all four flaps fold up into a box round the cat, the box is lifted,
// tipped toward you and turned round once like a parcel being read: its
// outer walls carry the new hour (red) and :00 (black). The cat peeks over
// the rim. Then it sets down and unfolds into the net again.
//
// Rendering: a tiny ray caster over six textured quads (the bottom, four
// flaps, the cat as a billboard), 192 x 192 rays, edge pixels supersampled.
import * as kit from '../js/kit.js';
import { T, INK, faceTex, drawCat } from './foldbox-art.js';

const W = 192, HALF = 96, D = 280;                         // camera: D LEDs in front of the net
const LAMP = [120, 85, 190], LN = Math.hypot(...LAMP);
const AMB = 0.2, KL = (1 - AMB) * LN / LAMP[2];
const LAMP2 = [LAMP[0] / LN, LAMP[1] / LN];                // its direction across the desk

// the four flaps: where they lie on the sheet, their hinge and outward direction
const SLOT = [
  { ox: 64, oy: 0, hx: 0, hy: -32, wx: 0, wy: -1, ink: 'red' },     // H tens  (top)
  { ox: 0, oy: 64, hx: -32, hy: 0, wx: -1, wy: 0, ink: 'red' },     // H units (left)
  { ox: 128, oy: 64, hx: 32, hy: 0, wx: 1, wy: 0, ink: 'black' },   // M tens  (right)
  { ox: 64, oy: 128, hx: 0, hy: 32, wx: 0, wy: 1, ink: 'black' },   // M units (bottom)
];
const CREASE = ['b', 'r', 'l', 't'], CUT = ['tlr', 'tlb', 'trb', 'lrb'];
// 'this way up' arrows near each flap's outer corner, pointing out (up, once folded)
const ARROWS = [[55, 13, 0, -1], [13, 9, -1, 0], [55.5, 8, 1, 0], [9, 51, 0, 1]];
// the outer print, read upright when the box stands open-side up: (u, v) -> glyph X, Y
const OUTMAP = [
  (u, v) => [32 - u, v - 32], (u, v) => [v - 32, u - 32], (u, v) => [32 - v, 32 - u], (u, v) => [u - 32, 32 - v],
];
// what each wall's outside shows in the hour show. The right wall faces you
// when the box is held up, and the turn passes the others in between. Two opposite walls carry the whole
// time as a shipping label (HH over MM); the two between carry carton icons, so
// a label is always beside an icon and no two walls can pair into a wrong number.
const OUTPRINT = ['glass', 'time', 'time', 'up'];

// ------------------------------------------------------------- textures
const cache = new Map();
function tex(key, make) { let t = cache.get(key); if (!t) { t = make(); cache.set(key, t); } return t; }
const frontTex = (s, n) => tex(`f${s}${n}`, () => faceTex({
  ox: SLOT[s].ox, oy: SLOT[s].oy, crease: CREASE[s], cut: CUT[s], arrows: ARROWS[s], glyph: { n, ink: INK[SLOT[s].ink], map: (u, v) => [u - 32, v - 32] } }));
const backTex = (s, n) => tex(`b${s}${n}`, () => faceTex({
  ox: 200 + 64 * s, oy: 300, liner: true, crease: CREASE[s], cut: CUT[s],
  glyph: n === -1 ? null : /^\d{4}$/.test(n) ? { label: n.split('').map(Number), map: OUTMAP[s] }
    : { n, ink: INK[typeof n === 'string' ? 'black' : 'red'], map: OUTMAP[s] } }));
const bottomTex = () => tex('bottom', () => faceTex({ ox: 64, oy: 64, crease: 'tblr', stamp: true }));
const underTex = () => tex('under', () => faceTex({ ox: 500, oy: 500, liner: true }));

// every texture the day can need, built once up front (~0.15 s) so no minute
// turn ever pays for one
let warmed = false;
function warm() {
  for (let s = 0; s < 4; s++) { backTex(s, -1); for (let n = 0; n < 10; n++) frontTex(s, n); }
  // the labels the hour show can need: every hour at :00, and the minute before it
  for (let h = 0; h < 24; h++) for (const L of [pad(h) + '00', pad((h + 23) % 24) + '59']) { backTex(1, L); backTex(2, L); }
  backTex(0, 'glass'); backTex(3, 'up'); bottomTex(); underTex();
  warmed = true;
}

// ------------------------------------------------------------- the clock
const pad = (n) => String(n).padStart(2, '0');
const digs = (sec) => { const d = new Date(sec * 1000); return (pad(d.getHours()) + pad(d.getMinutes())).split('').map(Number); };
const E = (x) => kit.ease.inOut(kit.clamp(x));
const DEG = Math.PI / 180;

/** A flap dropped from angle a0 (deg): gravity fall, slap, two small bounces. tau from release. */
function drop(tau, a0, dur) {
  if (tau < 0) return a0;
  if (tau < dur) { const q = tau / dur; return a0 * (1 - q * q); }
  tau -= dur;
  if (tau < 0.34) return 8 * Math.sin(Math.PI * tau / 0.34);
  tau -= 0.34;
  if (tau < 0.2) return 2.2 * Math.sin(Math.PI * tau / 0.2);
  return 0;
}
/** Minute flick, tau = 0 when the flap is edge-on (the swap). */
function flick(tau) {
  if (tau < -0.697) return 0;
  if (tau < 0.603) return 148 * E((tau + 0.697) / 1.3);
  return drop(tau - 0.603, 148, 0.86);
}

/** Everything the time says about the scene now. */
function scene(now) {
  const M = Math.floor(now / 60) * 60;
  const S = { th: [0, 0, 0, 0], dg: digs(now), back: [-1, -1, -1, -1], tip: 0, spin: 0, lift: 0, focus: -1, focusK: 0, slap: 99 };
  for (const B of [M, M + 60]) {
    const tau = now - B, old = digs(B - 60), nw = digs(B);
    if (new Date(B * 1000).getMinutes() === 0) {
      if (tau < -1.5 || tau > 8.4) continue;
      // the hour: fold up (minutes first), lift and turn, set down, unfold
      for (let s = 0; s < 4; s++) {
        const r = 3 - s;
        const up = 90 * E((tau + 1.4 - 0.12 * r) / 1.0);
        S.th[s] = tau < 6.3 ? up : drop(tau - 6.35 - 0.12 * r, 90, 0.62);
        S.dg[s] = tau < 0 ? old[s] : nw[s];
        const o = OUTPRINT[s], t = tau < 0 ? old : nw;
        S.back[s] = o === 'time' ? t.join('') : o;
      }
      S.tip = 58 * (E(tau / 1.15) - E((tau - 5.25) / 1.1));
      S.spin = 45 * E(tau / 1.15) + 315 * E((tau - 2.2) / 3.4);
      S.lift = S.tip / 58;
      S.focusK = kit.clamp(1 - Math.abs(tau - 3) / 5);
      S.slap = tau - 7.0;
      return S;
    }
    if (tau < -1 || tau > 2.8) continue;
    let rank = 0;
    for (let s = 3; s >= 0; s--) {
      if (old[s] === nw[s]) continue;
      const tt = tau - 0.16 * rank++;
      S.th[s] = flick(tt);
      S.dg[s] = tt >= 0 ? nw[s] : old[s];
      if (S.focus < 0) { S.focus = s; S.focusK = kit.clamp(Math.min((tau + 1) / 0.5, (2.8 - tau) / 0.6)); S.slap = tt - 1.46; }
    }
    return S;
  }
  return S;
}
/** Creased board never lies flat: each flap springs up a few degrees and settles, slowly. */
function rest(s, now) {
  return 2.2 + 2 * Math.sin(now * 0.43 + s * 1.9) * (0.6 + 0.4 * Math.sin(now * 0.11 + s * 2.7));
}

// ------------------------------------------------------------- geometry
const NQ = 6, CATQ = 5;
const Q = new Float64Array(NQ * 16);                 // per quad: O, U/|U|^2, V/|V|^2, N, num, flat, on
const QT = new Array(NQ), QB = new Array(NQ);
const tmp = [0, 0, 0];
/** Box transform of a local point into tmp: spin about the box axis, tip toward the camera, lift back. */
function boxXf(x, y, z, S, spin = true) {
  const s = spin ? S.spin * DEG : 0, a = S.tip * DEG;
  const qz = z - 32, cs = Math.cos(s), sn = Math.sin(s);
  const rx = x * cs - y * sn, ry = x * sn + y * cs;
  const ca = Math.cos(a), sa = Math.sin(a);
  tmp[0] = rx; tmp[1] = ry * ca - qz * sa; tmp[2] = ry * sa + qz * ca + 32 - 30 * S.lift;
}
function setQuad(q, c0, c1, c2, front, back, flat) {
  const b = q * 16;
  const ux = c1[0] - c0[0], uy = c1[1] - c0[1], uz = c1[2] - c0[2];
  const vx = c2[0] - c0[0], vy = c2[1] - c0[1], vz = c2[2] - c0[2];
  const uu = ux * ux + uy * uy + uz * uz, vv = vx * vx + vy * vy + vz * vz;
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
  Q[b] = c0[0]; Q[b + 1] = c0[1]; Q[b + 2] = c0[2];
  Q[b + 3] = ux / uu; Q[b + 4] = uy / uu; Q[b + 5] = uz / uu;
  Q[b + 6] = vx / vv; Q[b + 7] = vy / vv; Q[b + 8] = vz / vv;
  Q[b + 9] = nx; Q[b + 10] = ny; Q[b + 11] = nz;
  Q[b + 12] = c0[0] * nx + c0[1] * ny + (c0[2] - D) * nz;
  Q[b + 13] = flat ? 1 : 0; Q[b + 14] = 1; Q[b + 15] = 0;
  QT[q] = front; QB[q] = back;
}
const C0 = [0, 0, 0], C1 = [0, 0, 0], C2 = [0, 0, 0], C3 = [0, 0, 0];
/** Corner (fx, fy) of flap s, lifted by th (deg), through the box transform, into out. */
function flapPt(s, fx, fy, th, S, out) {
  const P = SLOT[s], sd = (fx - P.hx) * P.wx + (fy - P.hy) * P.wy;
  const ax = fx - P.wx * sd, ay = fy - P.wy * sd, c = Math.cos(th * DEG), z = sd * Math.sin(th * DEG);
  boxXf(ax + P.wx * sd * c, ay + P.wy * sd * c, z, S);
  out[0] = tmp[0]; out[1] = tmp[1]; out[2] = tmp[2];
}
const SH = [];                                       // shadow polygons on the desk, 4 points each
function build(S) {
  const still = S.tip === 0 && S.spin === 0;
  // bottom
  for (const [o, x, y] of [[C0, -32, -32], [C1, 32, -32], [C2, -32, 32]]) { boxXf(x, y, 0, S); o[0] = tmp[0]; o[1] = tmp[1]; o[2] = tmp[2]; }
  setQuad(4, C0, C1, C2, bottomTex(), underTex(), still);
  Q[4 * 16 + 15] = still ? 1 : 0;
  SH.length = 0;
  for (let s = 0; s < 4; s++) {
    const P = SLOT[s], x0 = P.ox - HALF, y0 = P.oy - HALF;
    flapPt(s, x0, y0, S.th[s], S, C0); flapPt(s, x0 + 64, y0, S.th[s], S, C1); flapPt(s, x0, y0 + 64, S.th[s], S, C2);
    setQuad(s, C0, C1, C2, frontTex(s, S.dg[s]), backTex(s, S.back[s]), still && S.th[s] === 0);
    Q[s * 16 + 15] = still && S.th[s] < 6 ? 1 : 0;
    if (still && S.th[s] > 6) {
      flapPt(s, x0 + 64, y0 + 64, S.th[s], S, C3);
      const poly = [];
      for (const c of [C0, C1, C3, C2]) { const k = LAMP[2] / (LAMP[2] - c[2]); poly.push(LAMP[0] + (c[0] - LAMP[0]) * k, LAMP[1] + (c[1] - LAMP[1]) * k); }
      // pre-normalised edges: [ax, ay, nx, ny] with n pointing inside
      let area = 0;
      for (let i = 0; i < 8; i += 2) { const j = (i + 2) % 8; area += poly[i] * poly[j + 1] - poly[j] * poly[i + 1]; }
      const sg = area > 0 ? 1 : -1, ed = [];
      for (let i = 0; i < 8; i += 2) {
        const j = (i + 2) % 8, ex = poly[j] - poly[i], ey = poly[j + 1] - poly[i + 1], l = Math.hypot(ex, ey) || 1;
        ed.push(poly[i], poly[i + 1], -sg * ey / l, sg * ex / l);
      }
      ed.src = s;
      SH.push(ed);
    }
  }
  // the cat: a camera-facing card that rides with the box (not the spin)
  const k = S.lift;
  boxXf(0, -2 * k, 0.4 + 50 * k, S, false);
  const cx = tmp[0], cy = tmp[1], cz = tmp[2];
  C0[0] = cx - 32; C0[1] = cy - 32; C0[2] = cz; C1[0] = cx + 32; C1[1] = cy - 32; C1[2] = cz; C2[0] = cx - 32; C2[1] = cy + 32; C2[2] = cz;
  setQuad(CATQ, C0, C1, C2, null, null, false);
}

/** Soft shadow amount (0..1) at desk point (x, y) from the lifted flaps. */
function shadowAt(x, y, self) {
  let sh = 0;
  for (const p of SH) {
    if (p.src === self) continue;
    let m = 1e9;
    for (let i = 0; i < 16; i += 4) {
      const d = (x - p[i]) * p[i + 2] + (y - p[i + 1]) * p[i + 3];
      if (d < m) m = d;
    }
    sh = Math.max(sh, kit.smoothstep(-1.2, 2.5, m));
  }
  return sh;
}

// ------------------------------------------------------------- shading
const img = new Float32Array(W * W * 3), ids = new Int8Array(W * W);
const cat = new Float32Array(64 * 64 * 4);
const RES = [0, 0, 0];
let EXPO = 1, INSIDE = 1, NIGHT = 0;                             // INSIDE: the shade inside a folded box
function bilin(t, ch, u, v, out) {
  let x = u * T - 0.5, y = v * T - 0.5;
  if (x < 0) x = 0; else if (x > T - 1.001) x = T - 1.001;
  if (y < 0) y = 0; else if (y > T - 1.001) y = T - 1.001;
  const xi = x | 0, yi = y | 0, fx = x - xi, fy = y - yi;
  const w0 = (1 - fx) * (1 - fy), w1 = fx * (1 - fy), w2 = (1 - fx) * fy, w3 = fx * fy;
  const a = (yi * T + xi) * ch, b = a + ch, c = a + T * ch, d = c + ch;
  out[0] = t[a] * w0 + t[b] * w1 + t[c] * w2 + t[d] * w3;
  out[1] = t[a + 1] * w0 + t[b + 1] * w1 + t[c + 1] * w2 + t[d + 1] * w3;
  out[2] = t[a + 2] * w0 + t[b + 2] * w1 + t[c + 2] * w2 + t[d + 2] * w3;
  if (ch === 4) out[3] = t[a + 3] * w0 + t[b + 3] * w1 + t[c + 3] * w2 + t[d + 3] * w3;
}
const SMP = [0, 0, 0, 0];
/** Cast one ray through (px, py) on the net plane; colour into RES, returns the quad hit (-1 none). */
function cast(px, py) {
  let best = -1, bt = 1e9, bu = 0, bv = 0, bden = 0;
  for (let q = 0; q < 5; q++) {
    const b = q * 16, den = px * Q[b + 9] + py * Q[b + 10] - D * Q[b + 11];
    if (den > -1e-6 && den < 1e-6) continue;
    const t = Q[b + 12] / den;
    if (t <= 0 || t >= bt) continue;
    const rx = t * px - Q[b], ry = t * py - Q[b + 1], rz = D - t * D - Q[b + 2];
    const u = rx * Q[b + 3] + ry * Q[b + 4] + rz * Q[b + 5];
    if (u < 0 || u >= 1) continue;
    const v = rx * Q[b + 6] + ry * Q[b + 7] + rz * Q[b + 8];
    if (v < 0 || v >= 1) continue;
    best = q; bt = t; bu = u; bv = v; bden = den;
  }
  let r = 0, g = 0, bl = 0;
  if (best >= 0) {
    const b = best * 16, front = bden < 0;
    bilin(front ? QT[best] : QB[best], 3, bu, bv, SMP);
    const sgn = front ? 1 : -1, nx = Q[b + 9] * sgn, ny = Q[b + 10] * sgn, nz = Q[b + 11] * sgn;
    const hx = bt * px, hy = bt * py, hz = D - bt * D;
    const lx = LAMP[0] - hx, ly = LAMP[1] - hy, lz = LAMP[2] - hz, l2 = lx * lx + ly * ly + lz * lz;
    let dif = (nx * lx + ny * ly + nz * lz) * KL * LN / (l2 * Math.sqrt(l2) / LN);
    if (dif < 0) dif = 0;
    if (SH.length && Q[b + 15] && hz < 4) dif *= 1 - 0.82 * shadowAt(hx, hy, best);
    // a little ambient occlusion: the inside of a folded box is darker
    const I = (AMB + dif) * EXPO * (front ? INSIDE : 1);
    r = SMP[0] * I; g = SMP[1] * I; bl = SMP[2] * I;
  }
  // the cat card, if in front of what was hit
  const c = CATQ * 16, den = -D * Q[c + 11];
  const t = Q[c + 12] / den;
  if (t > 0 && t < bt) {
    const u = (t * px - Q[c]) * Q[c + 3], v = (t * py - Q[c + 1]) * Q[c + 7];
    if (u >= 0 && u < 1 && v >= 0 && v < 1) {
      bilin(cat, 4, u, v, SMP);
      const a = SMP[3];
      r = SMP[0] + r * (1 - a); g = SMP[1] + g * (1 - a); bl = SMP[2] + bl * (1 - a);
    }
  }
  RES[0] = r; RES[1] = g; RES[2] = bl;
  return best < 0 ? -1 : (Q[best * 16 + 13] ? 9 : best);
}

// ------------------------------------------------------------- the firefly
// The firefly flies once round the plus a minute, clockwise from the top: the second hand.
const PATH = (() => {
  const m = 6, a = 64 + m, b = 128 - m, e = 192 - m;
  const pts = [[96, m], [b, m], [b, a], [e, a], [e, b], [b, b], [b, e], [a, e], [a, b], [m, b], [m, a], [a, a], [a, m], [96, m]];
  const seg = []; let L = 0;
  for (let i = 0; i + 1 < pts.length; i++) { const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); seg.push([pts[i], pts[i + 1], L, l]); L += l; }
  return { seg, L };
})();
function pathAt(f, out) {
  let s = kit.fract(f) * PATH.L;
  for (const [p, q, L0, l] of PATH.seg) if (s <= L0 + l) { const k = (s - L0) / l; out[0] = p[0] + (q[0] - p[0]) * k; out[1] = p[1] + (q[1] - p[1]) * k; return out; }
  return out;
}
const MP = [0, 0], MQ = [0, 0];
function flyPos(now, out) {
  // average the path over a short window: corners round off into turns
  let x = 0, y = 0;
  const f = (now % 60) / 60;
  for (let k = -3; k <= 3; k++) { pathAt(f + k * 0.006, MQ); x += MQ[0]; y += MQ[1]; }
  out[0] = x / 7 + 2.5 * (kit.noise2(now * 0.9, 3) - 0.5) * 2;
  out[1] = y / 7 + 2.5 * (kit.noise2(now * 0.9, 9) - 0.5) * 2 + 1.2 * Math.sin(now * 5.1);
  return out;
}
// Light adds, so a glowing body reads on the lit board at any distance.
const FLY = kit.hex('#c8ff4a'), GLOWC = kit.hex('#9cff3a');
function drawFly(now) {
  flyPos(now, MP);
  const x = MP[0], y = MP[1];
  const pulse = 0.55 + 0.45 * Math.sin(now * kit.TAU / 1.7) ** 2;
  const k = (1 - 0.35 * NIGHT) * pulse;
  for (let j = Math.floor(y - 7); j <= y + 7; j++) for (let i = Math.floor(x - 7); i <= x + 7; i++) {
    if (i < 0 || j < 0 || i >= W || j >= W) continue;
    const dx = i + 0.5 - x, dy = j + 0.5 - y, r2 = dx * dx + dy * dy;
    if (r2 > 49) continue;
    const p = 3 * (j * W + i);
    // the glow it throws on the board, then its lamp
    const halo = (1 - r2 / 49) ** 2 * 0.45 * k, core = kit.clamp(2.6 - Math.sqrt(r2)) * 1.5 * k;
    img[p] += GLOWC[0] * halo + FLY[0] * core; img[p + 1] += GLOWC[1] * halo + FLY[1] * core; img[p + 2] += GLOWC[2] * halo + FLY[2] * core;
  }
}

// ------------------------------------------------------------- the cat
const POSE = { tilt: 0, breathe: 0, hx: 0, hy: 0, earL: 0, earR: 0, tail: 0, tailPh: 0, blink: 1, lookX: 0, lookY: 0, pupil: 0, whisk: 0, eyeK: 0.8, rimK: 1, shadow: 1, lx: 0, ly: 0 };
const FOCUS = [[0, -1], [-1, 0], [1, 0], [0, 1]];
function pose(now, S, night) {
  const p = POSE;
  p.breathe = Math.sin(now * kit.TAU / 3.6);
  p.tailPh = now * 1.7 + 0.9 * Math.sin(now * 0.31);
  p.tail = 0.5 + 0.5 * Math.sin(now * 0.21);
  // blink: once in each 4.5 s slot, at a hashed moment
  const slot = Math.floor(now / 4.5), at = 0.3 + 3.6 * kit.hash(slot, 5), bt = now - slot * 4.5 - at;
  p.blink = bt > 0 && bt < 0.2 ? 0.05 + 0.95 * Math.abs(bt / 0.1 - 1) : 1;
  // ears: a twitch now and then, one ear at a time
  const es = Math.floor(now / 3.1), et = now - es * 3.1 - 1.2 * kit.hash(es, 8);
  const tw = et > 0 && et < 0.5 ? Math.sin(et * 30) * (1 - et / 0.5) * 1.6 : 0;
  p.earL = kit.hash(es, 9) < 0.5 ? tw : 0; p.earR = kit.hash(es, 9) < 0.5 ? 0 : -tw;
  p.whisk = Math.sin(now * 2.3);
  // now and then a curious head tilt, held, then back (one in each 11 s slot)
  const ts = Math.floor(now / 11), tt = now - ts * 11 - 2 - 5 * kit.hash(ts, 12);
  const tk = tt > 0 && tt < 2.6 ? Math.sin(Math.PI * kit.clamp(tt / 2.6)) ** 2 : 0;
  p.tilt = tk * (kit.hash(ts, 13) < 0.5 ? -0.28 : 0.28);
  // look at the firefly, or at the flap that is moving
  flyPos(now, MP);
  let tx = MP[0] - HALF, ty = MP[1] - HALF - 4;
  const tl = Math.hypot(tx, ty) || 1;
  let lx = tx / tl * Math.min(1, tl / 40), ly = ty / tl * Math.min(1, tl / 40);
  if (S.focus >= 0) { const f = FOCUS[S.focus]; lx += (f[0] - lx) * S.focusK; ly += (f[1] - ly) * S.focusK; }
  if (S.lift > 0) { lx *= 1 - S.lift; ly += (-0.3 - ly) * S.lift; }
  p.lookX = lx; p.lookY = ly;
  p.hx = lx * 1.4; p.hy = ly * 0.9;
  // startle at the slap: pupils go wide, ears flatten
  const st = S.slap > 0 && S.slap < 1.2 ? 1 - S.slap / 1.2 : 0;
  p.pupil = Math.max(0.35 * night, st);
  if (st > 0) { p.earL -= 2.2 * st; p.earR += 2.2 * st; }
  p.eyeK = 0.75 - 0.2 * night;
  p.rimK = EXPO / 0.6;
  p.shadow = 1 - S.lift;
  p.lx = LAMP2[0]; p.ly = LAMP2[1];
}

export default {
  name: 'Foldbox',
  blurb: 'the plus is a cardboard box net: stencilled flaps flick up to change, the hour folds it into a box that turns; a black cat lives inside',
  layouts: ['hub-cross'], look: 'smoke', fps: 60, brightness: 0.75, dither: true,
  init() { warm(); },
  frame(ctx) {
    if (!warmed) warm();
    const now = ctx.date.getTime() / 1000;
    const G = kit.grid(ctx);
    NIGHT = ctx.night;
    EXPO = 0.6 * (1 - 0.6 * ctx.night);   // the lamp: the board sits low, so the eyes and the firefly glow over it
    const S = scene(now);
    if (S.tip === 0) for (let s = 0; s < 4; s++) S.th[s] = Math.max(S.th[s], rest(s, now));
    pose(now, S, ctx.night);
    drawCat(cat, POSE);
    build(S);
    INSIDE = 1 - 0.55 * kit.clamp(Math.min(...S.th) / 80) * (0.4 + 0.6 * S.lift);
    // pass 1: one ray per LED
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      const p = y * W + x;
      if (G.idx[p] < 0) { ids[p] = -2; continue; }
      ids[p] = cast(x + 0.5 - HALF, y + 0.5 - HALF);
      img[3 * p] = RES[0]; img[3 * p + 1] = RES[1]; img[3 * p + 2] = RES[2];
    }
    // pass 2: where a moving edge crosses an LED, take four rays
    for (let y = 1; y < W - 1; y++) for (let x = 1; x < W - 1; x++) {
      const p = y * W + x, id = ids[p];
      if (id === -2) continue;
      const a = ids[p - 1], b = ids[p + 1], c = ids[p - W], d = ids[p + W];
      if ((a === id || a === -2) && (b === id || b === -2) && (c === id || c === -2) && (d === id || d === -2)) continue;
      let r = 0, g = 0, bl = 0;
      for (let k = 0; k < 4; k++) {
        cast(x + 0.25 + 0.5 * (k & 1) - HALF, y + 0.25 + 0.5 * (k >> 1) - HALF);
        r += RES[0]; g += RES[1]; bl += RES[2];
      }
      img[3 * p] = r / 4; img[3 * p + 1] = g / 4; img[3 * p + 2] = bl / 4;
    }
    drawFly(now);
    kit.blitGrid(ctx, img);
  },
};
