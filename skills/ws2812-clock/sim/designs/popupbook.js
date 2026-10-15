// Pop-up Book: the 128x64 board is an open storybook spread under a reading
// lamp, ray-traced in real 3D. Every minute is a page: the leaf lifts and
// curls over the spine, the old spread's paper pop-ups fold flat face-down
// as it closes, and the new spread's pop-ups stand up as it opens. The hour
// is the chapter: a whole chapter of pages riffles over at once and the
// chapter opener's numerals stand forward while a paper dragon unfolds
// behind them, flapping and breathing paper fire for that minute. At rest a
// moon pendulum beats the seconds at the spine, the frog slides on its
// pull-tab, a paper boat rocks on the pond, and the reader's head drifts.
import * as kit from '../js/kit.js';
import * as A from './popupbook-art.js';

const W = 128, H = 64, PW = 64, PD = 92;
const CAM = { x: 0, y: -220, z: 150, tx: 0, ty: 42, tz: 8, F: 262 };
const LAMP = [-110, -45, 85], LAMP_R = 7, AMB = 0.09, D0 = 150;
const LAMPC = kit.blackbody(3900), EXPO = 2.5;
const BOAT = A.scaled(A.BOAT, 1.0), NUMS = A.scaled(A.NUM, 1.15), WING_L = A.scaled(A.WING_L, 1.45), WING_R = A.scaled(A.WING_R, 1.45), FROG = A.scaled(A.FROG, 1.25);
const K_PAGE = 0, K_CARD = 1, K_PLAIN = 2;

// ------------------------------------------------------------- camera
let RD = null, CP = null, FW, RT, UP, CAMT = NaN;
/** The reader's head drifts a little, slowly: the paper's depth shows as parallax. */
function camera(t) {
  if (t === CAMT) return;
  CAMT = t;
  const ox = 16 * Math.sin(t * kit.TAU / 23), oz = 6 * Math.sin(t * kit.TAU / 31 + 1);
  CP = [CAM.x + ox, CAM.y, CAM.z + oz];
  const f = norm([CAM.tx + ox * 0.15 - CP[0], CAM.ty - CP[1], CAM.tz - CP[2]]);
  const r = norm([f[1], -f[0], 0]), u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  FW = f; RT = r; UP = u;
  if (!RD) RD = new Float32Array(3 * W * H);
  for (let y = 0; y < H; y++) {
    const b = -(y + 0.5 - H / 2) / CAM.F;
    for (let x = 0; x < W; x++) {
      const a = (x + 0.5 - W / 2) / CAM.F;
      const dx = f[0] + a * r[0] + b * u[0], dy = f[1] + a * r[1] + b * u[1], dz = f[2] + a * r[2] + b * u[2], il = 1 / Math.sqrt(dx * dx + dy * dy + dz * dz);
      const k = 3 * (y * W + x); RD[k] = dx * il; RD[k + 1] = dy * il; RD[k + 2] = dz * il;
    }
  }
}
function norm(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
function project(x, y, z) {
  const dx = x - CP[0], dy = y - CP[1], dz = z - CP[2];
  const zc = dx * FW[0] + dy * FW[1] + dz * FW[2];
  if (zc < 1) return null;
  return [W / 2 + CAM.F * (dx * RT[0] + dy * RT[1] + dz * RT[2]) / zc, H / 2 - CAM.F * (dx * UP[0] + dy * UP[1] + dz * UP[2]) / zc];
}

// --------------------------------------------------------------- quads
function mkQuad(kind, o, U, V, N, lu, lv) {
  // every quad has the same fields in the same order, so the hot loops stay monomorphic
  return { kind, ox: o[0], oy: o[1], oz: o[2], ux: U[0], uy: U[1], uz: U[2], vx: V[0], vy: V[1], vz: V[2], nx: N[0], ny: N[1], nz: N[2], lu, lv,
    bx0: 0, bx1: -1, by0: 0, by1: -1, fx0: 0, fx1: 0, fy0: 0, fy1: 0,
    u0: 0, us: 1, pf: null, pb: null, outer: false, leaf: null, inst: null, col: null, lines: false };
}
function bbox(q) {
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const [a, b] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    const p = project(q.ox + q.ux * q.lu * a + q.vx * q.lv * b, q.oy + q.uy * q.lu * a + q.vy * q.lv * b, q.oz + q.uz * q.lu * a + q.vz * q.lv * b);
    if (!p) { x0 = 0; x1 = W; y0 = 0; y1 = H; break; }
    x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]);
  }
  q.bx0 = Math.max(0, Math.floor(x0 - 1.5)); q.bx1 = Math.min(W - 1, Math.ceil(x1 + 1.5));
  q.by0 = Math.max(0, Math.floor(y0 - 1.5)); q.by1 = Math.min(H - 1, Math.ceil(y1 + 1.5));
}

// ------------------------------------------------------- page geometry
/** A leaf turned to theta (deg) with a curl: its cross-section as a curve. */
function leafShape(theta, zoff) {
  const th = theta * Math.PI / 180, b = 0.36 * Math.sin(th);
  return { a0: th - b, k: (2 * b) / PW, zoff };
}
function curve(L, u) {
  if (!L) return [u, 0];
  if (Math.abs(L.k) < 1e-6) return [u * Math.cos(L.a0), u * Math.sin(L.a0) + L.zoff];
  return [(Math.sin(L.a0 + L.k * u) - Math.sin(L.a0)) / L.k, (Math.cos(L.a0) - Math.cos(L.a0 + L.k * u)) / L.k + L.zoff];
}
/** World point of spread coordinate X on a page lying on `leaf` (null = flat). */
function pagePt(leaf, side, X) {
  if (!leaf) return [X, 0];
  return curve(leaf, Math.abs(X));
}
const STRIPS = 8;
function leafQuads(Q, OCC, leaf, front, back) {
  const tag = {};
  for (let k = 0; k < STRIPS; k++) {
    const u0 = (k * PW) / STRIPS, u1 = ((k + 1) * PW) / STRIPS;
    const a = curve(leaf, u0), b = curve(leaf, u1), dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz);
    const U = [dx / l, 0, dz / l];
    const q = mkQuad(K_PAGE, [a[0], 0, a[1]], U, [0, 1, 0], [-U[2], 0, U[0]], l, PD);
    q.u0 = u0; q.us = (u1 - u0) / l; q.pf = front; q.pb = back; q.outer = k === STRIPS - 1; q.leaf = tag;
    Q.push(q); STRIPQ.push(q);
  }
  LEAVES.push(leafShadow(leaf, tag));
}
/**
 * A leaf is the same in every slice along the spine, so whether the ray from
 * a flat page point to the lamp meets it depends on X alone: tabulate where.
 */
const TRES = 4, TN = 2 * PW * TRES + 1;
function leafShadow(leaf, tag) {
  const tab = new Float32Array(TN).fill(-1), P = [];
  for (let k = 0; k <= STRIPS; k++) P.push(curve(leaf, (k * PW) / STRIPS));
  for (let i = 0; i < TN; i++) {
    const X = i / TRES - PW, ex = LAMP[0] - X, ez = LAMP[2];
    let best = -1;
    for (let k = 0; k < STRIPS; k++) {
      const ax = P[k][0], az = P[k][1], bx = P[k + 1][0] - ax, bz = P[k + 1][1] - az;
      const den = ex * bz - ez * bx;
      if (den > -1e-9 && den < 1e-9) continue;
      const lam = ((ax - X) * bz - az * bx) / den, mu = ((ax - X) * ez - az * ex) / den;
      if (lam > 0.002 && lam < 1 && mu >= 0 && mu <= 1 && (best < 0 || lam < best)) best = lam;
    }
    tab[i] = best;
  }
  return { tab, tag };
}
let STRIPQ = [], LEAVES = [];
function flatPage(Q, page, side) {
  const q = mkQuad(K_PAGE, [0, 0, 0], [side, 0, 0], [0, 1, 0], [0, 0, 1], PW, PD);
  q.u0 = 0; q.us = 1; q.pf = page; q.pb = page; q.outer = true; q.leaf = null;
  Q.push(q);
}

// --------------------------------------------------------------- cards
const D2R = Math.PI / 180;
/**
 * Stand a card on a page. Its hinge runs from spread X = x0 to x0 + w at
 * depth y0; phi (deg) is 0 lying face-down toward the reader, 90 upright.
 * rot turns it in its own plane about (ps, pq).
 */
function placeCard(Q, OCC, leaf, side, inst, x0, y0, hz, phi, rot = 0, ps = 0, pq = 0, yaw = 0) {
  const def = inst.def, cy = Math.cos(yaw), sy = Math.sin(yaw);
  inst = { def, d0: inst.d0 ?? 0, d1: inst.d1 ?? 0, k: inst.k ?? 0, t: inst.t ?? 0 };
  const a = pagePt(leaf, side, x0), b = pagePt(leaf, side, x0 + def.w * cy);
  const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
  const E = [dx / l, 0, dz / l], w = [-E[2], 0, E[0]];
  // hinge direction turned by yaw in the page plane; 'toward the reader' turns with it
  const U0 = [cy * E[0], sy, cy * E[2]], R = [sy * E[0], -cy, sy * E[2]];
  const p = phi * D2R, cp = Math.cos(p), sp = Math.sin(p);
  const V0 = [sp * w[0] + cp * R[0], cp * R[1], sp * w[2] + cp * R[2]], N = [-cp * w[0] + sp * R[0], sp * R[1], -cp * w[2] + sp * R[2]];
  const cr = Math.cos(rot), sr = Math.sin(rot);
  const U = [cr * U0[0] + sr * V0[0], cr * U0[1] + sr * V0[1], cr * U0[2] + sr * V0[2]];
  const V = [-sr * U0[0] + cr * V0[0], -sr * U0[1] + cr * V0[1], -sr * U0[2] + cr * V0[2]];
  // pivot in world (unrotated frame), then origin from the rotated axes
  // on the convex side of a curled leaf the chord dips into the page: lift it by the sagitta
  if (leaf && side < 0) hz += (l * l * Math.abs(leaf.k)) / 8;
  const hx = a[0] + w[0] * hz, hy = y0, hzz = a[1] + w[2] * hz;
  const pw = [hx + U0[0] * ps + V0[0] * pq, hy + U0[1] * ps + V0[1] * pq, hzz + U0[2] * ps + V0[2] * pq];
  const o = [pw[0] - U[0] * ps - V[0] * pq, pw[1] - U[1] * ps - V[1] * pq, pw[2] - U[2] * ps - V[2] * pq];
  const q = mkQuad(K_CARD, o, U, V, N, def.w, def.h);
  q.inst = inst; q.leaf = leaf ? leaf.tag : null;
  Q.push(q); OCC.push(q);
}
/** How far a card stands for a spread opened to omega (deg). */
function stand(omega, lo, hi, t, id) {
  const k = kit.clamp((omega - lo) / (hi - lo));
  if (k <= 0) return 0;
  const sway = (1.6 * Math.sin(t * 1.13 + id * 1.9) + 1.1 * Math.sin(t * 2.31 + id * 0.7)) * k;
  return 90 * kit.ease.outBack(k) + sway;
}

/** A pair of numerals: the red cut card, and a gold backing layer standing a step behind it. */
function numerals(Q, OCC, leaf, side, txt, x0, y0, phi, back = false) {
  const d0 = +txt[0], d1 = +txt[1];
  placeCard(Q, OCC, leaf, side, { def: NUMS, d0, d1 }, x0, y0, 0.3, phi);
}
/** All the paper on one page of a spread. rise: 0..1, the chapter dragon's own entrance. */
function pageCards(Q, OCC, page, leaf, side, omega, t, sec, rise) {
  if (page.type === 'T' || omega <= 0.5) return;
  const id = page.id;
  if (page.chapter) { chapterCards(Q, OCC, page, leaf, side, omega, t, rise); return; }
  if (page.type === 'L') {
    numerals(Q, OCC, leaf, side, page.hh, -59, 40, stand(omega, 118, 172, t, id + 1));
    // the frog on a pull-tab, sliding along its slot
    const fx = frogX(t), vel = Math.cos(t * kit.TAU / 11);
    const rock = 0.14 * Math.sin(t * kit.TAU * 1.3) * Math.abs(vel);
    placeCard(Q, OCC, leaf, side, { def: FROG }, fx - 15, 3.5, 0.36, 180 - stand(omega, 128, 176, t, id + 4), rock, 15, 0);
    // the moon pendulum hangs from a brass arm at the spine: one swing a second
    const ph = stand(omega, 108, 170, t, id + 5);
    placeCard(Q, OCC, leaf, side, { def: A.POST }, -10.8, 42, 0.3, ph);
    const swing = 0.3 * Math.sin(Math.PI * sec) * kit.clamp(ph / 90);
    placeCard(Q, OCC, leaf, side, { def: A.MOON }, -1.8 - A.PIVOT[0], 42.4, 0.3, ph, swing, A.PIVOT[0], A.PIVOT[1]);
  } else {
    numerals(Q, OCC, leaf, side, page.mm, 8.4, 40, stand(omega, 118, 172, t, id + 3));
    // a paper boat rocking on the pond
    const bx = 33 + 7 * Math.sin(t * kit.TAU / 17), bob = 0.13 * Math.sin(t * kit.TAU / 2.3);
    placeCard(Q, OCC, leaf, side, { def: BOAT }, bx - 12, 13, 0.3, 180 - stand(omega, 124, 175, t, id + 6), bob, 12, 0);
  }
}
const frogX = (t) => -31 - 15 * Math.sin(t * kit.TAU / 11);
/** The chapter opener: numerals stand forward, a dragon rises behind them. */
function chapterCards(Q, OCC, page, leaf, side, omega, t, rise) {
  const left = page.type === 'L';
  numerals(Q, OCC, leaf, side, page[left ? 'hh' : 'mm'], left ? -59 : 8.4, 15, 180 - stand(omega, 118, 172, t, page.id + (left ? 1 : 3)), true);
  const up = kit.ease.outElastic(kit.clamp(rise));
  const base = stand(omega, 140, 178, t, 0) * up;
  const flap = 26 * Math.sin(t * kit.TAU / 1.7) * kit.clamp(base / 80);
  const wl = kit.clamp(base + flap, 0, 120);
  const yaw = 0.42;
  if (left) {
    const wd = WING_L.w, rx = -2.2, ry = 64;
    placeCard(Q, OCC, leaf, side, { def: WING_L }, rx - wd * Math.cos(yaw), ry - wd * Math.sin(yaw), 0.2, wl, 0, 0, 0, yaw);
    const bob = 0.07 * Math.sin(t * kit.TAU / 1.7 + 1) * kit.clamp(base / 80);
    placeCard(Q, OCC, leaf, side, { def: A.BODY }, -12, 60, 0.3, base, bob, 12, 0);
    // a breath of paper flame now and then
    const br = Math.max(0, Math.sin(t * kit.TAU / 5.5)) ** 3 * kit.clamp(base / 80);
    if (br > 0.02) {
      placeCard(Q, OCC, leaf, side, { def: A.FLAME, k: br, t }, -12 + 22, 59.7, 0.3, base, bob, 12 - 22, 0);
    }
  } else {
    placeCard(Q, OCC, leaf, side, { def: WING_R }, 2.2, 64, 0.2, wl, 0, 0, 0, -yaw);
  }
}

// ------------------------------------------------------------ the scene
const pad = (n) => String(n).padStart(2, '0');
function mkPage(type, d) {
  return { type, hh: pad(d.getHours()), mm: pad(d.getMinutes()), id: (d.getHours() * 60 + d.getMinutes()) % 97, chapter: d.getMinutes() === 0 };
}
const turnEase = (p) => kit.ease.inOut(kit.clamp(p));

function buildScene(ctx) {
  const now = ctx.date.getTime() / 1000, t = now % 3600, M = Math.floor(now / 60) * 60, age = now - M;
  const cur = new Date(M * 1000), prev = new Date((M - 60) * 1000);
  const chapter = cur.getMinutes() === 0;
  const dur = chapter ? 3.0 : 2.6, rise = (age - dur * 0.92) / 1.6;
  const Q = [], OCC = [];
  STRIPQ = []; LEAVES = [];
  const day = (cur.getHours() * 60 + cur.getMinutes()) / 1440;
  bookBody(Q, day);
  if (age >= dur) {
    const L = mkPage('L', cur), R = mkPage('R', cur);
    flatPage(Q, L, -1); flatPage(Q, R, 1);
    pageCards(Q, OCC, L, null, -1, 180, t, age, rise);
    pageCards(Q, OCC, R, null, 1, 180, t, age, rise);
    pullTab(Q, t);
  } else {
    const n = chapter ? 6 : 1, st = chapter ? 0.03 : 0, p = age / dur;
    const L0 = mkPage('L', prev), R1 = mkPage('R', cur);
    flatPage(Q, L0, -1); flatPage(Q, R1, 1);
    let th0 = 0, thN = 0;
    for (let i = 0; i < n; i++) {
      const pi = (p - i * st) / (1 - (n - 1) * st), th = 180 * turnEase(pi);
      if (i === 0) th0 = th;
      if (i === n - 1) thN = th;
      if ((th <= 0 && i > 0) || th >= 180) continue;
      const env = Math.sin(th * D2R);
      const zoff = 0.3 * kit.smoothstep(0, 6, th) * (1 - kit.smoothstep(174, 180, th)) + 0.25 * env * (th < 90 ? n - i : i + 1);
      const leaf = leafShape(th, zoff); leaf.tag = {};
      const F = i === 0 ? mkPage('R', prev) : { type: 'T', id: i };
      const B = i === n - 1 ? mkPage('L', cur) : { type: 'T', id: i + 7 };
      const q0 = Q.length;
      leafQuads(Q, OCC, leaf, F, B);
      for (let k = q0; k < Q.length; k++) Q[k].leaf = leaf.tag;
      if (i === 0) pageCards(Q, OCC, F, leaf, 1, 180 - th, t, age, 1);
      if (i === n - 1) pageCards(Q, OCC, B, leaf, -1, th, t, age, rise);
    }
    if (th0 < 176) pageCards(Q, OCC, L0, null, -1, 180 - th0, t, age, 1);
    if (thN > 4) pageCards(Q, OCC, R1, null, 1, thN, t, age, rise);
    if (th0 < 176) pullTab(Q, t);
  }
  return { Q, OCC };
}
function pullTab(Q, t) {
  const ext = 2.5 + ((-16 - frogX(t)) / 30) * 6;
  const q = mkQuad(K_PLAIN, [-PW - ext, 2.0, 0.05], [1, 0, 0], [0, 1, 0], [0, 0, 1], ext + 0.5, 3.2);
  q.col = A.PAL.core; Q.push(q);
}
function bookBody(Q, day) {
  const thL = 1.2 + 5 * day, thR = 1.2 + 5 * (1 - day);
  for (const [x0, th] of [[-PW, thL], [0, thR]]) {
    const b = mkQuad(K_PLAIN, [x0, 0, -th], [1, 0, 0], [0, 0, 1], [0, -1, 0], PW, th); b.col = A.PAL.block; b.lines = true; Q.push(b);
    const cx = x0 < 0 ? -PW - 2.2 : 0, ox = x0 < 0 ? -PW - 2.2 : PW;
    for (const [o, U, V, lu, lv] of [[[cx, -2.2, -th - 0.02], [1, 0, 0], [0, 1, 0], PW + 2.2, 2.2], [[cx, PD, -th - 0.02], [1, 0, 0], [0, 1, 0], PW + 2.2, 2.2],
      [[ox, -2.2, -th - 0.02], [1, 0, 0], [0, 1, 0], 2.2, PD + 4.4]]) {
      const c = mkQuad(K_PLAIN, o, U, V, [0, 0, 1], lu, lv); c.col = A.PAL.cloth; Q.push(c);
    }
    const e = mkQuad(K_PLAIN, [cx, -2.2, -th - 1.3], [1, 0, 0], [0, 0, 1], [0, -1, 0], PW + 2.2, 1.28); e.col = kit.scale(A.PAL.cloth, 0.7); Q.push(e);
  }
}

// -------------------------------------------------------------- tracing
const MAXH = 48;   // candidate hits a pixel, sorted by depth before any SDF is evaluated
const hT = new Float32Array(MAXH), hS = new Float32Array(MAXH), hV = new Float32Array(MAXH), hW = new Float32Array(MAXH);
const hQ = new Array(MAXH), hF = new Uint8Array(MAXH);
const alb = [0, 0, 0];
let IMG = null;

function sdfOf(q, s, v) {
  if (q.kind === K_CARD) return q.inst.def.sdf(s, v, q.inst);
  if (q.kind === K_PAGE) return Math.max(-v, v - q.lv, s < -0.3 ? 9 : -9, q.outer ? s - q.lu : s > q.lu + 0.3 ? 9 : -9);
  return Math.max(-s, s - q.lu, -v, v - q.lv);
}

/** Where an occluder's shadow can fall on the flat page plane z = 0. */
function footprint(o) {
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const [a, b] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    const x = o.ox + o.ux * o.lu * a + o.vx * o.lv * b, y = o.oy + o.uy * o.lu * a + o.vy * o.lv * b, z = o.oz + o.uz * o.lu * a + o.vz * o.lv * b;
    if (z >= LAMP[2] - 1) { o.fx0 = -1e9; o.fx1 = 1e9; o.fy0 = -1e9; o.fy1 = 1e9; return; }
    const k = Math.max(z, 0) / (LAMP[2] - Math.max(z, 0)), sx = x + (x - LAMP[0]) * k, sy = y + (y - LAMP[1]) * k;
    x0 = Math.min(x0, x, sx); x1 = Math.max(x1, x, sx); y0 = Math.min(y0, y, sy); y1 = Math.max(y1, y, sy);
  }
  o.fx0 = x0 - 4; o.fx1 = x1 + 4; o.fy0 = y0 - 4; o.fy1 = y1 + 4;
}
function shadowAt(px, py, pz, lx, ly, lz, dist, self, OCC) {
  let sh = 1;
  const flat = self.kind === K_PAGE && !self.leaf;
  if (flat) {
    for (const Lf of LEAVES) {
      const f = (px + PW) * TRES, i = f | 0;
      if (i < 0 || i >= TN - 1) continue;
      const a = Lf.tab[i], b = Lf.tab[i + 1];
      if (a < 0 && b < 0) continue;
      const lam = a < 0 ? b : b < 0 ? a : a + (b - a) * (f - i), cov = a < 0 || b < 0 ? 0.5 : 1;
      const hy = py + lam * (LAMP[1] - py);
      const inY = kit.clamp(0.5 + (hy < PD / 2 ? hy : PD - hy) / (0.4 + lam * 6));
      sh *= 1 - 0.88 * cov * inY;
    }
  }
  const n = OCC.length, all = flat || self.kind !== K_CARD ? n : n + STRIPQ.length;
  for (let i = 0; i < all; i++) {
    const o = i < n ? OCC[i] : STRIPQ[i - n];
    if (flat && (px < o.fx0 || px > o.fx1 || py < o.fy0 || py > o.fy1)) continue;
    if (o === self || (self.leaf && o.leaf === self.leaf && o.kind === K_PAGE)) continue;
    const den = lx * o.nx + ly * o.ny + lz * o.nz;
    if (den > -1e-4 && den < 1e-4) continue;
    const lam = ((o.ox - px) * o.nx + (o.oy - py) * o.ny + (o.oz - pz) * o.nz) / den;
    if (lam < 0.05 || lam > dist) continue;
    const rx = px + lam * lx - o.ox, ry = py + lam * ly - o.oy, rz = pz + lam * lz - o.oz;
    const s = rx * o.ux + ry * o.uy + rz * o.uz, v = rx * o.vx + ry * o.vy + rz * o.vz;
    if (s < -3 || v < -3 || s > o.lu + 3 || v > o.lv + 3) continue;
    const d = sdfOf(o, s, v), soft = 0.35 + (lam * LAMP_R) / dist;
    const occ = kit.clamp(0.5 - d / soft);
    if (occ > 0) { sh *= 1 - 0.9 * occ; if (sh < 0.03) return sh; }
  }
  return sh;
}

function shade(q, s, v, front, w, d, px, py, pz, sec, OCC, out) {
  let nx = q.nx, ny = q.ny, nz = q.nz;
  if (!front) { nx = -nx; ny = -ny; nz = -nz; }
  if (q.kind === K_PAGE) {
    const page = front ? q.pf : q.pb, side = front ? 1 : -1;
    const u = q.u0 + s * q.us;
    // a fixed left page has its spine at s = 0 with u running outward to -X
    const X = q.leaf ? side * u : q.ux * u;
    A.pagePrint(page, X, v, w, sec, alb);
    const g = 1 - 0.55 * Math.exp(-u / 3.2);
    alb[0] *= g; alb[1] *= g; alb[2] *= g;
  } else if (q.kind === K_CARD) {
    if (front) {
      q.inst.def.paint(s, v, q.inst, w, alb);
      if (!q.inst.def.ownEdge) {
        // printed ink keyline round every cut edge
        const k = 1 - kit.clamp(0.5 - (d + 0.7) / w);
        if (k > 0) for (let c = 0; c < 3; c++) alb[c] += (A.PAL.numKey[c] - alb[c]) * k * 0.85;
      }
      // the cut edge of the card shows its pale core along edges facing up
      if (d > -1.2) {
        const g = q.inst.def.sdf(s, v + 0.4, q.inst) - d;
        const band = 1 - kit.clamp(0.5 - (d + 0.55) / w);
        const k = band * kit.clamp(g * 2.5) * 0.85;
        if (k > 0) for (let c = 0; c < 3; c++) alb[c] += (A.PAL.core[c] - alb[c]) * k;
      }
    } else { const c = A.PAL.back; alb[0] = c[0]; alb[1] = c[1]; alb[2] = c[2]; }
  } else {
    const c = q.col; alb[0] = c[0]; alb[1] = c[1]; alb[2] = c[2];
    if (q.lines) { const k = 0.82 + 0.18 * Math.sin(v * 9); alb[0] *= k; alb[1] *= k; alb[2] *= k; }
  }
  let lx = LAMP[0] - px, ly = LAMP[1] - py, lz = LAMP[2] - pz;
  const dist = Math.hypot(lx, ly, lz); lx /= dist; ly /= dist; lz /= dist;
  const ndl = lx * nx + ly * ny + lz * nz;
  let diff = ndl > 0 ? ndl : q.kind === K_PLAIN ? 0 : -ndl * 0.2;   // thin paper lets some lamp through
  if (diff > 0.001) diff *= shadowAt(px, py, pz, lx, ly, lz, dist, q, OCC);
  const I = (D0 / dist) ** 2, L = AMB + I * diff;
  out[0] = alb[0] * LAMPC[0] * L; out[1] = alb[1] * LAMPC[1] * L; out[2] = alb[2] * LAMPC[2] * L;
}

const sc = [0, 0, 0];
function trace(scene, sec, img) {
  const { Q, OCC } = scene;
  for (const q of Q) bbox(q);
  for (const o of OCC) footprint(o);
  const cx = CP[0], cy = CP[1], cz = CP[2], invF = 1 / CAM.F;
  const rows = [];
  for (let y = 0; y < H; y++) rows.push([]);
  for (const q of Q) for (let y = q.by0; y <= q.by1; y++) rows[y].push(q);
  for (let py = 0; py < H; py++) {
    const R = rows[py];
    for (let px = 0; px < W; px++) {
      const k = py * W + px, dx = RD[3 * k], dy = RD[3 * k + 1], dz = RD[3 * k + 2];
      let nh = 0;
      for (let i = 0; i < R.length; i++) {
        const q = R[i];
        if (px < q.bx0 || px > q.bx1) continue;
        const den = dx * q.nx + dy * q.ny + dz * q.nz;
        if (den > -1e-6 && den < 1e-6) continue;
        const t = ((q.ox - cx) * q.nx + (q.oy - cy) * q.ny + (q.oz - cz) * q.nz) / den;
        if (t <= 0) continue;
        const rx = cx + t * dx - q.ox, ry = cy + t * dy - q.oy, rz = cz + t * dz - q.oz;
        const s = rx * q.ux + ry * q.uy + rz * q.uz, v = rx * q.vx + ry * q.vy + rz * q.vz;
        if (s < -3 || v < -3 || s > q.lu + 3 || v > q.lv + 3) continue;
        const ad = den < 0 ? -den : den, w = (t * invF) / Math.sqrt(ad < 0.05 ? 0.05 : ad);
        let j = nh < MAXH ? nh++ : MAXH - 1;
        while (j > 0 && hT[j - 1] > t) { hT[j] = hT[j - 1]; hS[j] = hS[j - 1]; hV[j] = hV[j - 1]; hW[j] = hW[j - 1]; hQ[j] = hQ[j - 1]; hF[j] = hF[j - 1]; j--; }
        hT[j] = t; hS[j] = s; hV[j] = v; hW[j] = w; hQ[j] = q; hF[j] = den < 0 ? 1 : 0;
      }
      // front to back: only surfaces that are not already hidden get their SDF and shading
      let r = 0, g = 0, b = 0, rem = 1;
      for (let j = 0; j < nh && rem > 0.01; j++) {
        const q = hQ[j], w = hW[j], d = sdfOf(q, hS[j], hV[j]);
        let cov = 0.5 - d / w;
        if (cov <= 0.004) continue;
        if (cov > 1) cov = 1;
        const t = hT[j];
        shade(q, hS[j], hV[j], hF[j] === 1, w, d, cx + t * dx, cy + t * dy, cz + t * dz, sec, OCC, sc);
        const a = rem * cov;
        r += sc[0] * a; g += sc[1] * a; b += sc[2] * a; rem -= a;
      }
      img[3 * k] = r; img[3 * k + 1] = g; img[3 * k + 2] = b;
    }
  }
}

export default {
  name: 'Pop-up Book',
  blurb: 'a storybook under a reading lamp, in real 3D: each minute a page turns and its paper numerals fold down and stand up; each hour a chapter riffles over and a paper dragon rises',
  layouts: ['hub-x2'], look: 'smoke', fps: 60, brightness: 0.26, dither: true,
  frame(ctx) {
    camera((ctx.date.getTime() / 1000) % 3600);
    if (!IMG) IMG = new Float32Array(3 * W * H);
    const scene = buildScene(ctx);
    trace(scene, ctx.date.getSeconds() + ctx.date.getMilliseconds() / 1000, IMG);
    kit.blitGrid(ctx, IMG, EXPO * (1 - 0.6 * ctx.night));
  },
};
