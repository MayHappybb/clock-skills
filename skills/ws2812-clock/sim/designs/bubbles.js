// Bubbles: the time is a foam. Every numeral is a cluster of soap bubbles
// strung along its pen path; where bubbles meet they share flat walls with
// three-way Plateau junctions (the power diagram of the discs). Each film
// shows real thin-film interference colour from its thickness, which swirls
// and drains downward. A plastic bubble wand sits in the corner.
//
// Minute turn: the old digit's bubbles thin to black and pop in a chain along
// the pen (rings of droplets), then the wand blows a stream of new bubbles
// that fly in, inflate and pack into the new numeral in pen order.
// Hour: from :55 the wand blows one giant bubble that fills the panel, its
// drained film banded magenta, gold and cyan, a window reflected in it. On
// the hour its black top film breaks: the hole sweeps down, the shower of
// droplets pops the old digits as the front passes, and the wand refills.
import * as kit from '../js/kit.js';
import { FILM, filmIdx, vnoise } from './bubbles-film.js';
import { GLYPHS, ORDER } from './bubbles-glyphs.js';

const N = 64, NN = N * N;
const img = new Float32Array(3 * NN);
const P1 = new Float32Array(NN), P2 = new Float32Array(NN);
const I1 = new Int16Array(NN), I2 = new Int16Array(NN);

// Bubble table (cluster bubbles first, then free spheres).
const MAX = 320;
const BX = new Float32Array(MAX), BY = new Float32Array(MAX), BR = new Float32Array(MAX), BA = new Float32Array(MAX);
const BT = new Float32Array(MAX), BW = new Float32Array(MAX), BD = new Float32Array(MAX);
const C1 = new Float32Array(MAX), S1 = new Float32Array(MAX), C2 = new Float32Array(MAX), S2 = new Float32Array(MAX);
const O1 = new Float32Array(MAX), O2 = new Float32Array(MAX), Q1 = new Float32Array(MAX), Q2 = new Float32Array(MAX);
const RR = new Float32Array(MAX), RG = new Float32Array(MAX), RB = new Float32Array(MAX);
let nb = 0, LX = 0.42, LY = 0.46;                       // where the lamp's glint sits

const SLOTS = [
  { x: 5.0, y: 2.0, s: 2.35 }, { x: 35.5, y: 2.0, s: 2.35 },
  { x: 28.0, y: 40.0, s: 1.6 }, { x: 46.5, y: 40.0, s: 1.6 },
];
const WX = 10.5, WY = 53.5, WRING = 6.2;                 // the wand's ring
const GC = [32, 31.5], GR = 30.5;                         // where the giant bubble ends up
const PLASTIC = kit.hex('#ff3d8b');

const pad = (n) => String(n).padStart(2, '0');
const digitsOf = (d) => pad(d.getHours()) + pad(d.getMinutes());
const H = kit.hash;

/** Add a bubble; id seeds its film pattern. Returns its index. */
function bubble(x, y, r, a, tb, id, t, wall = 1, drain = 0.55) {
  if (nb >= MAX || a <= 0.002 || r < 0.3) return -1;
  const k = nb++;
  BX[k] = x; BY[k] = y; BR[k] = r; BA[k] = a; BT[k] = tb; BW[k] = wall; BD[k] = drain;
  const w1 = (H(id, 1) < 0.5 ? -1 : 1) * (0.35 + 0.4 * H(id, 2)), w2 = -w1 * 0.7;
  const a1 = H(id, 3) * 6.28 + t * w1, a2 = H(id, 4) * 6.28 + t * w2;
  const s1 = 0.55 + 0.3 * H(id, 5), s2 = 0.95 + 0.4 * H(id, 6);
  C1[k] = Math.cos(a1) * s1; S1[k] = Math.sin(a1) * s1; C2[k] = Math.cos(a2) * s2; S2[k] = Math.sin(a2) * s2;
  O1[k] = H(id, 7) * 60; O2[k] = H(id, 8) * 60; Q1[k] = H(id, 9) * 60 + t * 0.05; Q2[k] = H(id, 10) * 60 - t * 0.08;
  const f = 3 * filmIdx(tb * 0.82);                      // the rim's colour: the film seen edge-on
  RR[k] = 0.55 * FILM[f] + 0.22; RG[k] = 0.55 * FILM[f + 1] + 0.22; RB[k] = 0.55 * FILM[f + 2] + 0.25;
  return k;
}

/** Shade one pixel p of bubble k. e: px inside the edge; w: px to a shared wall (or big). */
function shade(p, k, dx, dy, e, w, hole) {
  const r = BR[k], ux = dx / r, uy = dy / r;
  let rho2 = ux * ux + uy * uy; if (rho2 > 1) rho2 = 1;
  const n = vnoise(C1[k] * ux - S1[k] * uy + O1[k], S1[k] * ux + C1[k] * uy + Q1[k])
          + vnoise(C2[k] * ux - S2[k] * uy + O2[k], S2[k] * ux + C2[k] * uy + Q2[k]) - 1;
  const vy = uy * 0.5 + 0.5, dr = BD[k];
  const tb = BT[k];
  const sz = r > 12 ? 1 : r < 3 ? 0.25 : r / 12;          // small films are nearly one colour
  const T = r > 12
    ? tb * (dr * 0.3 + (1 - dr * 0.3) * vy * vy) * (1 - 0.25 * rho2) + (0.2 * tb + 40) * n * vy   // drained: black cap, bands below
    : tb * (1 - sz * (0.3 * rho2 + (1 - dr) * (1 - vy))) + sz * (0.16 * tb + 40) * n;
  const f = 3 * filmIdx(T);
  const fr = FILM[f], fg = FILM[f + 1], fb = FILM[f + 2];
  let cres = (0.55 * ux + 0.65 * uy) * 2.2 - 0.9; cres = cres < 0 ? 0 : cres > 1 ? 1 : cres;   // the lit room, lower right
  const inten = r > 12 ? (0.022 + 0.24 * rho2 * rho2 * rho2 + 0.14 * cres * rho2) * (0.45 + 1.7 * vy * vy) : 0.05 + 0.32 * rho2 * rho2 * rho2 + 0.2 * cres * rho2;
  const rim = Math.exp(-((e - 0.15) * (e - 0.15)) / 0.35);
  let wl = 0;
  if (w < 2) wl = Math.exp(-(w * w) / 0.3) * 0.75 * BW[k];
  const hx = dx + LX * r, hy = dy + LY * r;
  const sg = 0.32 + 0.0012 * r * r;
  let gl = Math.exp(-(hx * hx + hy * hy) / sg) * 1.4;
  if (r > 2.8) { const qx = dx - 0.5 * r, qy = dy - 0.55 * r; gl += Math.exp(-(qx * qx + qy * qy) / (sg * 1.6)) * 0.22; }
  const cov = e + 0.5 > 1 ? 1 : e + 0.5 < 0 ? 0 : e + 0.5;
  const a = BA[k] * cov * hole;
  const rl = 0.85 * rim + 0.6 * wl, o = 3 * p;
  img[o] += a * (fr * inten + RR[k] * rl + gl); img[o + 1] += a * (fg * inten + RG[k] * rl + gl); img[o + 2] += a * (fb * inten + RB[k] * rl + gl);
}

/** Pass A: bubbles [k0, k1) as one foam (power diagram). */
function foam(k0, k1) {
  P1.fill(1e9); P2.fill(1e9);
  for (let k = k0; k < k1; k++) {
    const r = BR[k], cx = BX[k], cy = BY[k], R = r + 1.2;
    const x0 = Math.max(0, Math.ceil(cx - R)), x1 = Math.min(N - 1, Math.floor(cx + R));
    const y0 = Math.max(0, Math.ceil(cy - R)), y1 = Math.min(N - 1, Math.floor(cy + R));
    const r2 = r * r, lim = R * R - r2;
    for (let y = y0; y <= y1; y++) {
      const dy = y - cy;
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx, pw = dx * dx + dy * dy - r2;
        if (pw > lim) continue;
        const p = y * N + x;
        if (pw < P1[p]) { P2[p] = P1[p]; I2[p] = I1[p]; P1[p] = pw; I1[p] = k; }
        else if (pw < P2[p]) { P2[p] = pw; I2[p] = k; }
      }
    }
  }
  for (let p = 0; p < NN; p++) {
    if (P1[p] > 1e8) continue;
    const k = I1[p], x = p % N, y = (p / N) | 0, dx = x - BX[k], dy = y - BY[k];
    const e = BR[k] - Math.sqrt(dx * dx + dy * dy);
    if (e < -0.6) continue;
    let w = 9;
    if (P2[p] < 1e8) {
      const j = I2[p], cd = Math.hypot(BX[j] - BX[k], BY[j] - BY[k]);
      w = (P2[p] - P1[p]) / (2 * cd + 1e-6);
      if (BA[j] < BA[k]) w /= BA[j] + 1e-3;      // a half-landed neighbour's wall is faint
    }
    shade(p, k, dx, dy, e, w, 1);
  }
}

/** Pass B: a free sphere k, added over everything. Optional hole (hx, hy, hr). */
function sphere(k, hx = 0, hy = 0, hr = -1) {
  const r = BR[k], cx = BX[k], cy = BY[k], R = r + 0.7;
  const x0 = Math.max(0, Math.ceil(cx - R)), x1 = Math.min(N - 1, Math.floor(cx + R));
  const y0 = Math.max(0, Math.ceil(cy - R)), y1 = Math.min(N - 1, Math.floor(cy + R));
  for (let y = y0; y <= y1; y++) {
    const dy = y - cy;
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx, d2 = dx * dx + dy * dy;
      if (d2 > R * R) continue;
      const e = r - Math.sqrt(d2);
      let hole = 1, w = 9;
      if (hr >= 0) {
        const dh = Math.hypot(x - hx, y - hy) - hr;
        if (dh < -0.5) continue;
        hole = Math.min(1, dh + 0.5);
        w = dh * 0.6;                               // the hole's rolling rim glints like a wall
      }
      shade(y * N + x, k, dx, dy, e, w, hole);
    }
  }
}

/** A droplet: a sub-pixel dot, bilinear. */
function drop(x, y, a, cr, cg, cb) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  for (let j = 0; j < 4; j++) {
    const px = xi + (j & 1), py = yi + (j >> 1);
    if (px < 0 || py < 0 || px >= N || py >= N) continue;
    const wgt = ((j & 1) ? fx : 1 - fx) * ((j >> 1) ? fy : 1 - fy) * a, o = 3 * (py * N + px);
    img[o] += cr * wgt; img[o + 1] += cg * wgt; img[o + 2] += cb * wgt;
  }
}
/** The ring of droplets thrown when a bubble of radius r at (x, y) pops, tau s ago. */
function popRing(x, y, r, tau, id) {
  if (tau < 0 || tau > 0.5) return;
  const n = r > 3 ? 10 : 7, fade = (1 - tau / 0.5) ** 2;
  for (let j = 0; j < n; j++) {
    const ang = ((j + H(id, j, 3)) / n) * kit.TAU, v = 6 + 7 * H(id, j, 4) + 1.5 * r;
    const s = r * 0.9 + v * tau * (1 - tau);
    const f = 3 * filmIdx(250 + 500 * H(id, j, 5));
    const a = fade * 0.9;
    drop(x + Math.cos(ang) * s, y + Math.sin(ang) * s + 22 * tau * tau, a, 0.35 + FILM[f] * 0.5, 0.35 + FILM[f + 1] * 0.5, 0.4 + FILM[f + 2] * 0.5);
  }
}

/** Ambient thickness of a resting bubble: drifts slowly through the vivid orders. */
const BULGE = 7.2;
/** Radius of the bubble swelling on the wand, `age` s into the minute. */
const bulgeR = (age) => BULGE * Math.max(0, (age - 0.6) / 59.4) ** 0.65;
// A numeral's film drains for as long as it lives: pale higher orders when fresh,
// the vivid magenta-gold-blue first orders later. f is its age as a fraction of its life.
const restT = (id, t, f = 0.5) => 1080 - 720 * f ** 0.6 + 70 * Math.sin(t * (0.12 + 0.1 * H(id, 11)) + H(id, 12) * 6.28) + 120 * (H(id, 13) - 0.5);
const SPAN = [36000, 3600, 600, 60];

export default {
  name: 'Bubbles',
  blurb: 'the time as soap foam: iridescent bubble numerals that pop and are re-blown from a wand; a giant bubble at the hour',
  layouts: ['hub'], look: 'smoke', fps: 60, brightness: 0.42, dither: true,
  frame(ctx) {
    const o = ctx.out, G = kit.grid(ctx);
    const now = ctx.date.getTime() / 1000, M = Math.floor(now / 60) * 60, age = now - M;
    const t = now % 86400;
    const next = digitsOf(ctx.date), prev = digitsOf(new Date((M - 60) * 1000));
    const hourTurn = ctx.date.getMinutes() === 0 && age < 4;
    const preShow = ctx.date.getMinutes() === 59 ? age - 60 : -99;    // seconds to the hour (negative)
    img.fill(0); nb = 0;
    const la = -2.3 + 0.32 * Math.sin(t * 0.21) + 0.12 * Math.sin(t * 0.57);   // the lamp sways a little
    LX = -0.62 * Math.cos(la); LY = -0.62 * Math.sin(la);
    const drops = [];                                                 // [x, y, r, tau, id]

    // ------------------------------------------------ giant bubble state
    let gk = -1, gx = 0, gy = 0, gr = 0, ghx = 0, ghy = 0, ghr = -1, gsp = 1;
    const gTau = preShow > -5 ? preShow : hourTurn ? age : -99;       // time relative to the pop
    if (gTau > -5 && gTau < 4) {
      const g = kit.smoothstep(-4.8, -1.0, gTau);
      gr = BULGE + (GR - BULGE) * kit.ease.out(g);
      const dxw = GC[0] - WX, dyw = GC[1] - WY, dl = Math.hypot(dxw, dyw);
      const ax = WX + (dxw / dl) * (gr - 2.5), ay = WY + (dyw / dl) * (gr - 2.5);
      const glide = kit.ease.inOut(kit.smoothstep(-2.4, -0.2, gTau));
      gx = kit.lerp(ax, GC[0], glide) + 0.4 * Math.sin(t * 1.3); gy = kit.lerp(ay, GC[1], glide) + 0.5 * Math.sin(t * 0.9);
      ghx = gx - 0.18 * gr; ghy = gy - 0.86 * gr; gsp = (2.1 * gr) / 0.42;
      if (gTau > 0) ghr = gTau * gsp;
    }

    // ------------------------------------------------ the foam numerals
    for (let s = 0; s < 4; s++) {
      const S = SLOTS[s];
      const bx = S.x + 0.35 * Math.sin(t * 0.71 + s * 1.9), by = S.y + 0.5 * Math.sin(t * 0.93 + s * 2.3);
      const changed = prev[s] !== next[s] && age < 4;
      const rank = 3 - s;                                             // right-hand digits go first
      const mi = ctx.date.getMinutes(), hr = ctx.date.getHours();
      const born = [(hr % 10) * 3600 + mi * 60, mi * 60, (mi % 10) * 60, 0][s] + age;   // s since this digit changed
      const life = Math.min(1, born / SPAN[s]);
      const place = (g, k, id, alpha, tb, jost) => {
        const q = GLYPHS[g][k];
        const jx = 0.28 * Math.sin(t * 1.7 + id), jy = 0.28 * Math.cos(t * 1.3 + id * 1.7);
        const r = q.r * S.s * (1 + 0.05 * Math.sin(t * 2.1 + id * 0.7) + jost);
        bubble(bx + q.x * S.s + jx, by + q.y * S.s + jy, r, alpha, tb, id, t);
      };
      // the old digit pops in a chain
      if (changed) {
        const g = +prev[s], n = GLYPHS[g].length;
        for (let k = 0; k < n; k++) {
          const id = 1000 * s + 100 * g + k, q = GLYPHS[g][k];
          let popAt;
          if (hourTurn) {
            const qx = bx + q.x * S.s, qy = by + q.y * S.s;
            popAt = Math.hypot(qx - ghx, qy - ghy) / gsp + 0.04;
          } else popAt = 0.32 + rank * 0.06 + ORDER[g][k] * 0.032;
          if (age < popAt) {
            // the whole numeral drains to black film first, then the chain runs along the pen
            const thin = hourTurn ? kit.smoothstep(popAt - 0.2, popAt, age) : 0.85 * kit.smoothstep(0, 0.3, age) + 0.15 * kit.smoothstep(popAt - 0.1, popAt, age);
            place(g, k, id, 1, kit.lerp(restT(id, t, 1), 30, thin), 0);
          } else drops.push([bx + q.x * S.s, by + q.y * S.s, q.r * S.s, age - popAt, id]);
        }
      }
      // the steady (or newly blown) digit
      const g = +next[s], n = GLYPHS[g].length;
      for (let k = 0; k < n; k++) {
        const id = 1000 * s + 100 * g + k + 50;
        if (!changed) { place(g, k, id, 1, restT(id, t, life), 0); continue; }
        const FL = hourTurn ? 0.75 : 0.95, launch = (hourTurn ? 0.0 : 0.35) + rank * (hourTurn ? 0.06 : 0.12) + ORDER[g][k] * (hourTurn ? 0.06 : 0.075), arr = launch + FL;
        if (age < launch) continue;
        const q = GLYPHS[g][k];
        if (age >= arr) {
          const ta = age - arr;
          place(g, k, id, Math.min(1, ta / 0.15 + 0.05), restT(id, t, life), 0.12 * Math.exp(-ta * 6) * Math.sin(ta * 26));
          continue;
        }
        // in flight: a lob from the wand, inflating as it goes (drawn after the foam pass)
        const f = (age - launch) / FL, e = kit.ease.out(f);
        const tx = bx + q.x * S.s, ty = by + q.y * S.s;
        const cx = kit.lerp(WX, tx, 0.35), cy = Math.min(WY, ty) - 7 - 5 * H(id, 20);
        const u = 1 - e;
        let x = u * u * WX + 2 * u * e * cx + e * e * tx, y = u * u * WY + 2 * u * e * cy + e * e * ty;
        const wob = 1.1 * Math.sin(f * Math.PI) * Math.sin(f * 8 + id);
        x += wob * 0.6; y += wob * 0.8;
        flying.push([x, y, q.r * S.s * (0.5 + 0.5 * kit.smoothstep(0, 0.6, f)), id, 1100 - 600 * e]);
      }
    }
    foam(0, nb);

    // ------------------------------------------------ free spheres
    const k0 = nb;
    for (const [x, y, r, id, tb] of flying) { const k = bubble(x, y, r, 1, tb, id, t); if (k >= 0) sphere(k); }
    flying.length = 0;
    // ambient bubbles, a few at a time, drifting up from the wand
    const AP = 2.3, kn = Math.floor(t / AP);
    for (let j = kn - 5; j <= kn; j++) {
      const born = j * AP + 0.6 * H(j, 30), life = 4.2 + 2.5 * H(j, 31), tau = t - born;
      if (tau < 0) continue;
      const giantBusy = (gTau > -5.5 && gTau < 0.2);
      if (giantBusy && H(j, 37) < 0.9) continue;
      // across the open corner to the gap between the rows, then up the gutter between the hours
      const vy = 6 + 3 * H(j, 33), r0 = 1.0 + 1.3 * H(j, 34) ** 2, ta = 2.4 + 0.6 * H(j, 32);
      const a = kit.ease.inOut(Math.min(1, tau / ta)), gx0 = 32.2 + 1.2 * (H(j, 35) - 0.5);
      const rise = Math.max(0, tau - ta * 0.8);
      const x = kit.lerp(WX + 3, gx0, a) + 0.8 * Math.sin(tau * 2.1 + j) * Math.min(1, rise);
      const y = kit.lerp(WY - 5, 37.5, Math.sin(a * Math.PI / 2)) - vy * rise - 0.3 * rise * rise + 0.5 * Math.sin(tau * 3.1 + j);
      if (tau > life) { drops.push([x, y, r0, tau - life, 9000 + j]); continue; }
      const r = r0 * Math.min(1, 0.4 + tau * 2.5);
      const k = bubble(x, y, r, 0.8, kit.lerp(900, 380, Math.min(1, tau / life)) - (tau > life - 0.25 ? 300 : 0), 9000 + j, t);
      if (k >= 0) sphere(k);
    }
    // the minute's breath: a bubble swells on the wand all minute and becomes the turn's stream
    if (!(gTau > -4.9 && gTau < 0.6)) {
      const rb = age < 0.6 ? bulgeR(60) * (1 - kit.smoothstep(0.15, 0.6, age)) : bulgeR(age);
      if (rb > 0.4) {
        const dxw = GC[0] - WX, dyw = GC[1] - WY, dl = Math.hypot(dxw, dyw), off = Math.max(0, rb - 1.3);
        const wob = 1 + 0.03 * Math.sin(t * 3.3);
        const k = bubble(WX + (dxw / dl) * off + 0.2 * Math.sin(t * 1.1), WY + (dyw / dl) * off, rb * wob, 0.95, 1050 - 520 * Math.min(1, age / 60), 31337 + Math.floor(now / 60), t, 1, 0.4);
        if (k >= 0) sphere(k);
      }
    }
    // the giant
    if (gr > 0 && (ghr < 0 || ghr < 2.2 * gr)) {
      const left = -gTau;                                             // s before the pop
      const tb = 330 + 850 * kit.clamp(left / 4.8);
      gk = bubble(gx, gy, gr, 0.8, tb, 77777 + Math.floor(now / 3600), t, 1, 0.12);
      if (gk >= 0) sphere(gk, ghx, ghy, ghr);
      // its reflected window, four panes
      if (gk >= 0 && ghr < 0) {
        const wx = gx - 0.44 * gr, wy = gy - 0.5 * gr, hw = 0.13 * gr, hh = 0.1 * gr;
        for (let y = Math.max(0, Math.floor(wy - hh - 1)); y <= Math.min(N - 1, Math.ceil(wy + hh + 1)); y++) {
          for (let x = Math.max(0, Math.floor(wx - hw - 1)); x <= Math.min(N - 1, Math.ceil(wx + hw + 1)); x++) {
            const ax = Math.abs(x - wx + 0.08 * (y - wy)), ay = Math.abs(y - wy);
            const c = kit.clamp(hw + 0.5 - ax) * kit.clamp(hh + 0.5 - ay) * kit.clamp(Math.min(ax, ay) * 1.6 - 0.15);
            const a = c * 0.4 * kit.smoothstep(6, 18, gr), q = 3 * (y * N + x);
            img[q] += a; img[q + 1] += a * 0.97; img[q + 2] += a * 0.92;
          }
        }
      }
    }
    // the giant's shower
    if (hourTurn && gTau >= 0 && gTau < 2) {
      for (let j = 0; j < 90; j++) {
        const ang = H(j, 40) * kit.TAU, rr = Math.sqrt(H(j, 41)) * gr;
        const px = GC[0] + Math.cos(ang) * rr, py = GC[1] + Math.sin(ang) * rr;
        const tau = gTau - Math.hypot(px - ghx, py - ghy) / gsp;
        if (tau < 0 || tau > 1.6) continue;
        const dx = px - ghx, dy = py - ghy, dl = Math.hypot(dx, dy) + 1e-3, v = 8 + 14 * H(j, 42);
        const x = px + (dx / dl) * v * tau, y = py + (dy / dl) * v * tau + 26 * tau * tau;
        const f = 3 * filmIdx(200 + 600 * H(j, 43)), a = 0.8 * (1 - tau / 1.6) ** 1.5;
        drop(x, y, a, 0.3 + 0.6 * FILM[f], 0.3 + 0.6 * FILM[f + 1], 0.35 + 0.6 * FILM[f + 2]);
      }
    }
    for (const d of drops) popRing(d[0], d[1], d[2], d[3], d[4]);

    // ------------------------------------------------ the wand
    const wk = bubble(WX, WY, WRING - 0.6, 0.3, 650 + 120 * Math.sin(t * 0.4), 4242, t, 1, 0.8);
    if (wk >= 0) sphere(wk);
    const hx0 = WX - WRING * 0.72, hy0 = WY + WRING * 0.72, hx1 = -3, hy1 = 68;
    for (let y = 44; y < N; y++) {
      for (let x = 0; x < 20; x++) {
        const d = Math.abs(Math.hypot(x - WX, y - WY) - WRING);
        let a = kit.clamp(1.15 - d);
        const sd = kit.segDist(x, y, hx0, hy0, hx1, hy1);
        a = Math.max(a, kit.clamp(1.6 - sd));
        if (a <= 0) continue;
        const lit = 0.32 + 0.5 * kit.clamp(1 - Math.hypot(x - WX + 4, y - WY + 4) / 6);
        const q = 3 * (y * N + x);
        img[q] = img[q] * (1 - a) + a * PLASTIC[0] * lit; img[q + 1] = img[q + 1] * (1 - a) + a * PLASTIC[1] * lit; img[q + 2] = img[q + 2] * (1 - a) + a * PLASTIC[2] * lit;
      }
    }

    // ------------------------------------------------ out
    const dim = 1 - 0.65 * ctx.night, idx = G.idx;
    for (let p = 0; p < NN; p++) {
      const i = idx[p]; if (i < 0) continue;
      const r = img[3 * p] * dim, g = img[3 * p + 1] * dim, b = img[3 * p + 2] * dim;
      o[3 * i] = r > 1 ? 1 : r; o[3 * i + 1] = g > 1 ? 1 : g; o[3 * i + 2] = b > 1 ? 1 : b;
    }
  },
};
const flying = [];
