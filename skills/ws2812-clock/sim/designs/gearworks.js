// Gearworks: the time is a working movement. Every digit is a train of
// meshing wheels laid along its stroke (brass hours, steel minutes), all
// driven together by a mainspring barrel and let down in beats by a balance
// wheel and escapement: tick, and every wheel on the plate steps at once,
// neighbours counter-rotating at the ratio of their teeth. The light sweeps
// round once a minute, so every rim's glint points at the second.
//
// Minute: the changing digit's wheels lift off the plate one after another
// along the stroke, swing across spinning, and set down meshed in the new
// digit; spare wheels slide out from under (or tuck under) their neighbours.
// Hour: the striking train runs. A hammer strikes the gong wire that rings
// the whole panel once per hour, rings of light run out across the plate,
// and the whole train races and slows.
import * as kit from '../js/kit.js';
import { layDigit } from './gearworks-font.js';

const W = 64, H = 64;
const P = 1.885;                       // tooth pitch, px: one module for every wheel, so they could all mesh
const rOf = (n) => (n * P) / kit.TAU;  // pitch radius of an n-tooth wheel
const ADD = 0.55;                      // addendum = dedendum, px

const BRASS = kit.hex('#d6a24a'), BRASS_D = kit.hex('#8a5a1c');
const STEEL = kit.hex('#b9c6d6'), STEEL_D = kit.hex('#4a5666');
const BLUE = kit.hex('#2f5cff'), RUBY = kit.hex('#ff1f4a'), GONG = kit.hex('#cfd8e6');
const PLATE = [0.010, 0.0095, 0.009];

// the four digit cells (pixels, inclusive-exclusive) and their wheels
const SLOTS = [
  { x: 1, y: 1, w: 24, h: 34, nt: 8, nk: 12, nb: 14, mat: 0, sign: 1 },
  { x: 26, y: 1, w: 24, h: 34, nt: 8, nk: 12, nb: 14, mat: 0, sign: -1 },
  { x: 24, y: 37, w: 19, h: 26, nt: 7, nk: 10, nb: 12, mat: 1, sign: 1 },
  { x: 44, y: 37, w: 19, h: 26, nt: 7, nk: 10, nb: 12, mat: 1, sign: -1 },
];
const BAL = { x: 57, y: 8, R: 6.2 };          // balance wheel
const ESC = { x: 57.5, y: 22, n: 13 };         // escape wheel
const BARREL = { x: 11.5, y: 49.5, n: 32 };      // mainspring barrel
const HAMMER = { px: 22.5, py: 62, hx: 9.5, hy: 62.2 };

const TT = 2.4;          // minute re-mesh, s
const SHOW0 = 2.6, STRIKE = 0.62, BOOST_D = 7, BOOST = 70;  // hour show
const GW0 = 2.5, GWD = 4.2, GWN = 44;                      // the great wheel's pass

// ------------------------------------------------------------ digit trains
const digitCache = new Map();
/** The wheels of digit d in slot k, with their kinematics: sign and phase. */
function train(k, d) {
  const key = k * 10 + d;
  if (digitCache.has(key)) return digitCache.get(key);
  const S = SLOTS[k], r0 = rOf(S.nk), tip = r0 + ADD;
  const box = { x: S.x - 0.5 + tip, y: S.y - 0.5 + tip, w: S.w - 2 * tip, h: S.h - 2 * tip, r0 };
  const gs = layDigit(d, box, S.nt, S.nk, S.nb, rOf).map((g) => ({ ...g, sg: 0, c: 0 }));
  // BFS over the mesh: neighbours counter-rotate; phases set so tooth meets gap
  const seen = new Set();
  for (let root = 0; root < gs.length; root++) {
    if (seen.has(root)) continue;
    gs[root].sg = S.sign; gs[root].c = 0; seen.add(root);
    const q = [root];
    while (q.length) {
      const i = q.shift(), a = gs[i];
      for (let j = 0; j < gs.length; j++) {
        if (seen.has(j)) continue;
        const b = gs[j], dd = Math.hypot(b.x - a.x, b.y - a.y);
        if (dd > a.r + b.r + 0.9) continue;
        const th = Math.atan2(b.y - a.y, b.x - a.x);
        b.sg = -a.sg;
        // psi_a + psi_b = pi at the contact, psi = n (contact angle - phi)
        b.c = th + Math.PI - (Math.PI - a.n * (th - a.c)) / b.n;
        seen.add(j); q.push(j);
      }
    }
  }
  digitCache.set(key, gs);
  return gs;
}

// idlers: each meshes with the wheel before it (sign flips, tooth meets gap)
const IDLERS = (() => {
  const chain = (from, list) => {
    let a = from;
    return list.map(([n, mat]) => {
      const r = rOf(n), x = a.x, y = a.y + a.dir * (a.r + r);
      const th = a.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      const q = { x, y, r, n, mat, sg: -a.sg, c: th + Math.PI - (Math.PI - a.n * (th - a.c)) / n, dir: a.dir };
      a = q; return q;
    });
  };
  const rB = rOf(BARREL.n), rE = rOf(ESC.n);
  return [
    ...chain({ x: BARREL.x, y: BARREL.y, r: rB, n: BARREL.n, sg: 1, c: 0, dir: -1 }, [[7, 0]]),
    ...chain({ x: ESC.x, y: ESC.y, r: rE, n: ESC.n, sg: -1, c: 0, dir: 1 }, [[8, 1], [7, 1]]),
  ];
})();

// lay every digit in every slot once, up front, so no frame pays for it
for (let k = 0; k < 4; k++) for (let d = 0; d < 10; d++) train(k, d);

// --------------------------------------------------------------- the plate
let plate = null, perim = null;
function initPlate() {
  plate = new Float32Array(2 * W * H);   // Geneva-stripe normal (cos, sin) per pixel
  perim = new Float32Array(2 * W * H);   // gong wire: coverage, and position along it (px)
  const c = Math.SQRT1_2;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = y * W + x;
    const u = (x * c + y * c) / 7, v = (-x * c + y * c) / 7;   // across / along the stripes
    const f = kit.fract(u) - 0.5, g = kit.fract(v * 0.5) - 0.5;
    const ang = Math.atan2(f, 0.35 + g * g * 2) * 2.2 + 0.7;   // arcs of the cutting cup
    plate[2 * p] = Math.cos(ang); plate[2 * p + 1] = Math.sin(ang);
    // rounded-square wire through the outermost LEDs
    const qx = Math.abs(x - 31.5) - (31.5 - 6), qy = Math.abs(y - 31.5) - (31.5 - 6);
    const sd = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - 6;
    perim[2 * p] = kit.clamp(1 - Math.abs(sd) / 0.75);
    // perimeter coordinate: angle round the centre is a fine proxy at this size
    perim[2 * p + 1] = (Math.atan2(y - 31.5, x - 31.5) / kit.TAU + 1) % 1 * 236;
  }
}

// ------------------------------------------------------------- rendering
const img = new Float32Array(3 * W * H);
let LX = 1, LY = 0;          // light direction (the seconds)

function put(p, r, g, b, a) {
  const o = 3 * p;
  img[o] += (r - img[o]) * a; img[o + 1] += (g - img[o + 1]) * a; img[o + 2] += (b - img[o + 2]) * a;
}

/**
 * One wheel. o: { x, y, r, n, phi, mat (0 brass, 1 steel), lift 0..1,
 * spokes, saw (escape teeth), blur 0..1, k (brightness) }
 */
function gear(o) {
  const s = 1 + 0.2 * o.lift, r = o.r, root = r - ADD, tip = (r + ADD) * s;
  const base = o.mat ? STEEL : BRASS, dark = o.mat ? STEEL_D : BRASS_D, k = o.k;
  const x0 = Math.max(0, Math.floor(o.x - tip - 1)), x1 = Math.min(W - 1, Math.ceil(o.x + tip + 1));
  const y0 = Math.max(0, Math.floor(o.y - tip - 1)), y1 = Math.min(H - 1, Math.ceil(o.y + tip + 1));
  const n = o.n, phi = o.phi, sp = o.spokes ?? (r >= 2.3 ? 3 : 0), blur = o.blur || 0;
  const wIn = sp > 5 ? 0.2 * r : sp > 3 ? 0.3 * r : 0.72, wOut = sp > 5 ? root - 1.5 : root - 0.62;
  // a lifted wheel throws a shadow down-right onto whatever is under it
  if (o.lift > 0.01) {
    const sx = o.x + 1.6 * o.lift, sy = o.y + 2.2 * o.lift, sr = tip;
    for (let y = y0; y <= Math.min(H - 1, y1 + 3); y++) for (let x = x0; x <= Math.min(W - 1, x1 + 3); x++) {
      const d = Math.hypot(x - sx, y - sy), a = kit.clamp(sr + 0.8 - d) * (o.shadow ?? 0.75) * o.lift;
      if (a > 0) { const q = 3 * (y * W + x); img[q] *= 1 - a; img[q + 1] *= 1 - a; img[q + 2] *= 1 - a; }
    }
  }
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const dx = x - o.x, dy = y - o.y, d = Math.hypot(dx, dy);
    if (d > tip + 0.6) continue;
    const dd = d / s, al = Math.atan2(dy, dx);
    let tf;
    if (o.saw) { const f = kit.fract((n * (al - phi)) / kit.TAU); tf = f < 0.55 ? f / 0.55 : (1 - f) / 0.45 * 0.2; tf = tf * tf; }
    else tf = kit.clamp(0.5 + 0.95 * Math.cos(n * (al - phi)));
    tf += (0.5 - tf) * blur;
    const R = root + 2 * ADD * tf;
    let cov = kit.clamp(R - dd + 0.5);
    if (cov <= 0) continue;
    // structure: teeth (edge-on, dimmer), a bright rim, a dark recess crossed
    // by spokes, the hub. This is what makes each wheel read as a wheel.
    const ux = dx / (d || 1), uy = dy / (d || 1), cl = ux * LX + uy * LY;
    let body;
    const tooth = kit.clamp((dd - root) * 1.6 + 0.2);
    if (sp && dd < root) {
      const rec = kit.clamp((dd - wIn) * 2.4) * kit.clamp((wOut - dd) * 2.4);
      const f = kit.fract((al - phi - (o.curve || 0) * dd) * sp / kit.TAU + 0.5) - 0.5;
      const spoke = kit.clamp(0.9 - Math.abs(f) * kit.TAU / sp * dd * 1.6);
      const open = rec * (1 - spoke) * (1 - blur * 0.7);
      cov *= 1 - open;
      if (cov <= 0.01) continue;
      body = 1 - 0.3 * rec;
    } else body = 1;
    // brushed face catches the light along its direction; teeth glint on the lit side
    const sun = cl * cl, sun2 = sun * sun;
    let sh = (0.6 + 0.4 * sun2) * body * (1 - 0.6 * tooth);
    const gl = cl > 0 ? sun2 * sun2 * sun : 0;
    sh += tooth * 1.3 * gl + kit.clamp(1 - Math.abs(dd - root + 0.35) * 1.5) * 0.35 * gl;
    let cr = dark[0] + (base[0] - dark[0]) * Math.min(1, sh), cg = dark[1] + (base[1] - dark[1]) * Math.min(1, sh), cb = dark[2] + (base[2] - dark[2]) * Math.min(1, sh);
    if (sh < 0.4) { const z = sh / 0.4; cr *= z; cg *= z; cb *= z; }
    const w = Math.max(0, sh - 1) * 0.6;
    cr += w; cg += w; cb += w;
    // arbor: a ruby jewel in brass, a blued screw in steel
    if (dd < 0.8) {
      const j = kit.clamp(0.8 - dd) * 1.0, J = o.mat ? BLUE : RUBY;
      cr += (J[0] * 0.8 - cr) * j; cg += (J[1] * 0.8 - cg) * j; cb += (J[2] * 0.8 - cb) * j;
    }
    const kk = k * (1 + 0.35 * o.lift);
    put(y * W + x, cr * kk, cg * kk, cb * kk, cov);
  }
}

/** Anti-aliased line of light (or paint) from a to b. */
function line(ax, ay, bx, by, wid, col, a) {
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - wid - 1)), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + wid + 1));
  const y0 = Math.max(0, Math.floor(Math.min(ay, by) - wid - 1)), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by) + wid + 1));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const c = kit.clamp(wid / 2 + 0.5 - kit.segDist(x, y, ax, ay, bx, by));
    if (c > 0) put(y * W + x, col[0], col[1], col[2], c * a);
  }
}

function balance(beta, k) {
  const { x: bx, y: by, R } = BAL;
  const ca = Math.cos(beta), sa = Math.sin(beta);
  for (let y = Math.floor(by - R - 1); y <= Math.ceil(by + R + 1); y++) for (let x = Math.floor(bx - R - 1); x <= Math.ceil(bx + R + 1); x++) {
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const dx = x - bx, dy = y - by, d = Math.hypot(dx, dy), p = y * W + x;
    const ux = dx / (d || 1), uy = dy / (d || 1), cl = ux * LX + uy * LY;
    // rim
    const rim = kit.clamp(R + 0.5 - d) * kit.clamp(d - (R - 1.7) + 0.5);
    if (rim > 0) {
      const sh = 0.45 + 0.4 * cl * cl + (cl > 0 ? 1.2 * cl ** 8 : 0);
      put(p, BRASS[0] * sh * k, BRASS[1] * sh * k, BRASS[2] * sh * k, rim);
    }
    // body-frame coordinates (turns with the balance)
    const rx = dx * ca + dy * sa, ry = -dx * sa + dy * ca, al = Math.atan2(ry, rx);
    // three arms
    if (d > 0.8 && d < R - 1.2) {
      const am = Math.cos(3 * al), aw = kit.clamp((am - 0.93) * 18 * Math.min(1, d / 3));
      if (aw > 0) put(p, BRASS[0] * 0.7 * k, BRASS[1] * 0.7 * k, BRASS[2] * 0.7 * k, aw);
    }
    // the hairspring: inner end turns with the balance, outer end pinned, so it breathes
    if (d > 1.4 && d < 5.6) {
      const fr = (d - 1.4) / 4.2, a2 = Math.atan2(dy, dx) - beta * (1 - fr) * 0.45;
      const q = (d - 1.4) / 1.4 - a2 / kit.TAU;
      const dist = Math.abs(kit.fract(q) - 0.5) * 1.4;
      const c = kit.clamp(0.75 - Math.abs(dist - 0.7) * 1.6);
      if (c > 0) put(p, BLUE[0] * 0.7 * k, BLUE[1] * 0.7 * k, BLUE[2] * 0.7 * k, c * 0.9);
    }
    // timing screws on the rim
    for (let s = 0; s < 6; s++) {
      const a = beta + s * kit.TAU / 6 + 0.5;
      const sx = bx + (R - 0.85) * Math.cos(a), sy = by + (R - 0.85) * Math.sin(a);
      const c = kit.clamp(1.15 - Math.hypot(x - sx, y - sy));
      if (c > 0) put(p, BLUE[0] * 0.9 * k + 0.05 * k, BLUE[1] * 0.9 * k + 0.05 * k, BLUE[2] * k, c);
    }
    if (d < 1) put(p, RUBY[0] * 0.8 * k, RUBY[1] * 0.8 * k, RUBY[2] * 0.8 * k, kit.clamp(1 - d));
  }
}

// ---------------------------------------------------------------- time
const pad = (v) => String(v).padStart(2, '0');
const hhmm = (d) => pad(d.getHours()) + pad(d.getMinutes());
const stepE = (f) => (f < 0.36 ? 1 + 2.2 * (f / 0.36 - 1) ** 3 + 1.2 * (f / 0.36 - 1) ** 2 : 1);  // tick, with a small recoil
const wrap = (a) => a - kit.TAU * Math.round(a / kit.TAU);

/** Train travel at pitch line (px) for epoch seconds T. Pure in T. */
function travel(T) {
  const b = Math.floor(T / 0.5), f = T / 0.5 - b;
  let s = 1.4 * (b + stepE(f));
  const h = Math.floor(T / 3600), tau = T - h * 3600;
  const x = kit.clamp((tau - SHOW0) / BOOST_D);
  s += BOOST * (h + x - Math.sin(kit.TAU * x) / kit.TAU);
  return s;
}

export default {
  name: 'Gearworks',
  blurb: 'digits built as meshing gear trains, ticked by a balance wheel; wheels lift and re-mesh at the minute, the gong rings the hour',
  layouts: ['hub'], look: 'smoke', fps: 60, brightness: 0.35, dither: true,
  frame(ctx) {
    if (!plate) initPlate();
    const G = kit.grid(ctx);
    const T = ctx.date.getTime() / 1000;
    const M = Math.floor(T / 60) * 60, age = T - M;
    const cur = hhmm(ctx.date), prev = hhmm(new Date((M - 60) * 1000));
    const dim = 1 - 0.7 * ctx.night, k = dim;
    const sec = age;
    const la = (sec / 60) * kit.TAU - Math.PI / 2;
    LX = Math.cos(la); LY = Math.sin(la);
    const Tl = T - ctx.date.getTimezoneOffset() * 60;        // local seconds: the hour is local
    const tau = Tl - Math.floor(Tl / 3600) * 3600;
    const s = travel(Tl);
    // motion blur only when the striking train races (a tick is too brief to smear)
    const bx = kit.clamp((tau - SHOW0) / BOOST_D), sDot = BOOST / BOOST_D * (1 - Math.cos(kit.TAU * bx));
    const blur = kit.clamp((sDot - 4) / 18);

    // ---- hour show: strikes on the gong
    const hour = ctx.date.getHours() % 12 || 12;
    let strikeGlow = 0, hammerA = 0;
    const strikes = [];
    if (tau < SHOW0 + 1 + hour * STRIKE + 3) {
      for (let i = 0; i < hour; i++) {
        const ti = SHOW0 + 0.6 + i * STRIKE, dt = tau - ti;
        if (dt >= 0 && dt < 3) strikes.push(dt);
        if (dt > -0.3 && dt < 0) hammerA = Math.max(hammerA, kit.ease.out((dt + 0.3) / 0.3) * 0.38);
        if (dt >= 0 && dt < 0.12) hammerA = Math.max(hammerA, 0.38 * (1 - dt / 0.12) ** 2 * 0.2);
      }
    }

    // ---- plate: dark rhodium with Geneva stripes catching the moving light
    const pk = 0.9 * (1 - ctx.night * 0.85);
    const hx = HAMMER.hx, hy = 63;
    for (let p = 0; p < W * H; p++) {
      const sh = 0.5 + 0.5 * (plate[2 * p] * LX + plate[2 * p + 1] * LY);
      let v = (0.45 + 1.4 * sh * sh) * pk;
      if (strikes.length) {
        const x = p % W, y = (p / W) | 0, rr = Math.hypot(x - hx, y - hy);
        for (const dt of strikes) {
          const ring = rr - dt * 55, e = Math.exp(-ring * ring / 10) * Math.exp(-dt * 1.2);
          v += 9 * e * (0.3 + sh) * dim;
        }
      }
      img[3 * p] = PLATE[0] * v; img[3 * p + 1] = PLATE[1] * v; img[3 * p + 2] = PLATE[2] * v;
    }
    // gong wire round the edge
    for (let p = 0; p < W * H; p++) {
      const c = perim[2 * p];
      if (c <= 0) continue;
      let v = 0.05;
      const u = perim[2 * p + 1], uh = 0.25 * 236 + 2;   // the hammer hits the bottom edge
      for (const dt of strikes) {
        const e = Math.exp(-dt * 1.6);
        for (const dir of [1, -1]) {
          let du = (u - uh - dir * dt * 150) % 236; if (du < -118) du += 236; if (du > 118) du -= 236;
          v += 1.4 * e * Math.exp(-du * du / 30);
        }
        v += 0.35 * e;
      }
      put(p, GONG[0] * v * k, GONG[1] * v * k, GONG[2] * v * k, c);
    }

    // ---- the drive: barrel, escapement, balance
    const beta = 4.0 * Math.sin(kit.TAU * T);
    const rB = rOf(BARREL.n);
    gear({ x: BARREL.x, y: BARREL.y, r: rB, n: BARREL.n, phi: s / rB, mat: 0, lift: 0, spokes: 5, curve: 0.12, blur, k: k * 0.85 });
    const rE = rOf(ESC.n);
    gear({ x: ESC.x, y: ESC.y, r: rE, n: ESC.n, phi: -s / rE, mat: 1, lift: 0, spokes: 4, saw: true, blur: 0, k });
    // pallet lever rocks once per beat
    const b = Math.floor(T / 0.5), f = T / 0.5 - b;
    const rock = 0.2 * Math.cos(Math.PI * (b + kit.smoothstep(0, 0.25, f)));
    const pvx = 57.2, pvy = 15.6, cr = Math.cos(rock), sr = Math.sin(rock);
    const rot = (x, y) => [pvx + (x - pvx) * cr - (y - pvy) * sr, pvy + (x - pvx) * sr + (y - pvy) * cr];
    const fork = rot(57.1, 11.6), pa = rot(54.0, 18.6), pb = rot(61.0, 18.4);
    for (const e of [fork, pa, pb]) line(pvx, pvy, e[0], e[1], 0.9, kit.scale(STEEL, 0.55 * k), 1);
    for (const e of [pa, pb]) line(e[0], e[1], e[0], e[1], 1.3, kit.scale(RUBY, 0.7 * k), 1);
    // idler pinions carry the drive on: barrel up into the hours, escape wheel down to the minutes
    for (const q of IDLERS) gear({ x: q.x, y: q.y, r: q.r, n: q.n, phi: (q.sg * s) / q.r + q.c, mat: q.mat, lift: 0, blur, k });
    balance(beta, k);
    // hammer
    {
      const ca = Math.cos(-hammerA), sa = Math.sin(-hammerA);
      const hx2 = HAMMER.px + (HAMMER.hx - HAMMER.px) * ca - (HAMMER.hy - HAMMER.py) * sa;
      const hy2 = HAMMER.py + (HAMMER.hx - HAMMER.px) * sa + (HAMMER.hy - HAMMER.py) * ca;
      line(HAMMER.px, HAMMER.py, hx2, hy2, 0.9, kit.scale(STEEL, 0.5 * k), 1);
      line(hx2 - 1, hy2, hx2 + 1, hy2, 2.2, kit.scale(BRASS, 0.8 * k), 1);
    }

    // ---- the digits
    const lifted = [];
    for (let slot = 0; slot < 4; slot++) {
      const a = +prev[slot], d = +cur[slot], S = SLOTS[slot];
      const B = train(slot, d);
      const ph = (g) => (g.sg * s) / g.r + g.c;
      if (a === d || age >= TT) {
        for (const g of B) gear({ x: g.x, y: g.y, r: g.r, n: g.n, phi: ph(g), mat: S.mat, lift: 0, blur, k });
        continue;
      }
      const A = train(slot, a), nA = A.length, nB = B.length, moves = [];
      if (nB >= nA) for (let j = 0; j < nB; j++) moves.push([A[Math.floor((j * nA) / nB)], B[j], j / nB, j > 0 && Math.floor(((j - 1) * nA) / nB) === Math.floor((j * nA) / nB)]);
      else for (let j = 0; j < nA; j++) moves.push([A[j], B[Math.floor((j * nB) / nA)], j / nA, false]);
      // wheels that are still waiting, or have landed, sit on the plate; spare ones first (underneath)
      const seated = [];
      for (const [ga, gb, ord, under] of moves) {
        const t0 = ord * (TT - 1.25), u = kit.clamp((age - t0) / 1.25);
        const e = kit.ease.inOut(u), lift = Math.sin(Math.PI * u) ** 0.8;
        const ex = gb.x - ga.x, ey = gb.y - ga.y, dist = Math.hypot(ex, ey);
        const bend = 0.22 * Math.sin(Math.PI * e);
        const x = ga.x + ex * e - ey * bend, y = ga.y + ey * e + ex * bend;
        const r = ga.r + (gb.r - ga.r) * e, n = Math.round(ga.n + (gb.n - ga.n) * e);
        const pA = ph(ga), pB = ph(gb), turns = Math.round(dist / (kit.TAU * r)) * (ga.sg || 1);
        const phi = pB + wrap(pA - pB) * (1 - e) + turns * kit.TAU * e;
        const o = { x, y, r, n, phi, mat: S.mat, lift, blur, k };
        if (lift > 0.001) lifted.push(o); else seated.push([under && u === 0 ? 0 : 1, o]);
      }
      seated.sort((p, q) => p[0] - q[0]);
      for (const [, o] of seated) gear(o);
    }
    lifted.sort((p, q) => p.lift - q.lift);
    for (const o of lifted) gear(o);

    // ---- the hour: the great wheel of the striking train rolls across the face
    if (tau > GW0 && tau < GW0 + GWD) {
      const u = (tau - GW0) / GWD, e = u * u * (3 - 2 * u) * 0.6 + u * 0.4;
      const rG = rOf(GWN), x = -rG - 2 + (W + 2 * rG + 4) * e, y = 34 + 2.5 * Math.sin(Math.PI * e);
      gear({ x, y, r: rG, n: GWN, phi: x / rG, mat: 0, lift: 0.35, spokes: 6, curve: 0.05, blur: 0, k: k * 1.1, shadow: 0.25 });
    }

    // ---- out
    const idx = G.idx, out = ctx.out;
    for (let p = 0; p < idx.length; p++) {
      const i = idx[p]; if (i < 0) continue;
      out[3 * i] = img[3 * p]; out[3 * i + 1] = img[3 * p + 1]; out[3 * i + 2] = img[3 * p + 2];
    }
  },
};
