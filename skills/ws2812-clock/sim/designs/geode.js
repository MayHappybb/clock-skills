// Geode: a cracked-open geode, the time grown inside it as ametrine crystal:
// hours in amethyst, minutes in citrine, every stroke one faceted quartz
// prism and every loop a hexagon, the crystal's own cross-section. A lamp
// circles the stone once a minute, so facets flash in turn and the cavity
// wall opposite the lamp catches the light. Minute: the old crystals melt
// back into the matrix and the new ones grow from seeds, each point pushing
// out facet by facet. Hour: the room lamp dims and a UV torch sweeps an S
// across the stone; everything it touches fluoresces (green uranyl chalcedony,
// orange calcite, the hours blue and the minutes red), with an afterglow
// trailing behind the torch.
import * as kit from '../js/kit.js';
import { glyph } from './geode-glyphs.js';

const W = 64, H = 64, N = W * H;
const CX = 31.5, CY = 31.5;
const AME0 = kit.hex('#c8a8ff'), AME1 = kit.hex('#8a3cff');   // amethyst: clear base, violet point
const CIT0 = kit.hex('#ffc250'), CIT1 = kit.hex('#ff6000');   // citrine: pale base, golden point
const UV_H = kit.hex('#2f9bff'), UV_M = kit.hex('#ff1e3c');   // fluorescence: fluorite blue, calcite orange
const UV_AG = kit.hex('#5cff2a'), UV_CAL = kit.hex('#ff7a10'), UV_LAMP = kit.hex('#7a2cff');

// --------------------------------------------------------------- the stone
// A rounded-square geode filling the panel: a 3 px rough rind, ~5 px of bold
// banded agate, then the hollow, lined with quartz points that all grow
// inward along the wall's normal. The time is the two biggest clusters:
// the hours rise from the lower-left wall, the minutes hang from the
// upper-right wall, both leaning along the wall's normal.
let S = null;
const QTZ0 = kit.hex('#8c84a8'), QTZ1 = kit.hex('#e4dcff');    // the druse: smoky-lilac quartz, clear points
const RIND = kit.hex('#9a8670');
const BANDS = [kit.hex('#141a28'), kit.hex('#c8dcff'), kit.hex('#5a4c88'), kit.hex('#ffffff'), kit.hex('#10141e')];
const BAND_W = [1.1, 0.8, 1.1, 0.7, 0.8];                          // px, outer to inner
const EXP = 3.0;
const superR = (c, s) => (Math.abs(c) ** EXP + Math.abs(s) ** EXP) ** (1 / EXP);
function rimR(th) {
  return 31.6 * (1 - 0.035 * kit.noise2(Math.cos(th) * 2.2 + 5, Math.sin(th) * 2.2 + 5) - 0.02 * kit.noise2(Math.cos(th) * 6, Math.sin(th) * 6));
}
const RIND_W = 2.6, AG_W = BAND_W.reduce((a, b) => a + b, 0);
function stone() {
  if (S) return S;
  const reg = new Uint8Array(N), alb = new Float32Array(3 * N), nrm = new Float32Array(3 * N);
  const cal = new Float32Array(N), band = new Float32Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = y * W + x, dx = x - CX, dy = y - CY;
    const th = Math.atan2(dy, dx), R = rimR(th);
    const rho = superR(dx, dy) || 1e-3, depth = R - rho;          // px in from the outer edge
    let r = 0, ar = 0, ag = 0, ab = 0, nx = 0, ny = 0, nz = 1;
    const wob = 0.9 * (kit.noise2(x * 0.12, y * 0.12) - 0.5);
    if (depth < 0) r = 0;
    else if (depth < RIND_W + wob * 0.6) {                // rough rind, broken lumps
      r = 1;
      const e = 0.6, f0 = kit.fbm(x * 0.32, y * 0.32, 0, 3);
      const fx = kit.fbm((x + e) * 0.32, y * 0.32, 0, 3) - f0, fy = kit.fbm(x * 0.32, (y + e) * 0.32, 0, 3) - f0;
      nx = -fx * 6 + dx / rho * 0.7; ny = -fy * 6 + dy / rho * 0.7;
      const k = (0.55 + 0.9 * f0 * f0) * (depth < 0.8 ? 0.55 : 1);
      ar = RIND[0] * 0.75 * k; ag = RIND[1] * 0.75 * k; ab = RIND[2] * 0.75 * k;
    } else if (depth < RIND_W + AG_W + wob) {             // agate: bold concentric bands
      r = 2;
      let t = depth - RIND_W - wob * 0.6, bi = 0;
      while (bi < BANDS.length - 1 && t > BAND_W[bi]) { t -= BAND_W[bi]; bi++; }
      const c = BANDS[bi], lv = bi === 3 ? 0.55 : 0.45;
      band[p] = bi === 1 || bi === 3 ? 1 : 0.3;
      ar = c[0] * lv; ag = c[1] * lv; ab = c[2] * lv;
      nx = -dx / rho * 0.35; ny = -dy / rho * 0.35;       // the cut face, bevelled into the hollow
    } else {                                              // the hollow: dark, deep
      r = 4;
      const g = kit.hash(x, y, 9);
      const k = 0.006 * (0.5 + g);
      ar = k * 0.8; ag = k * 0.6; ab = k * 1.3;
      const a = g * kit.TAU; nx = Math.cos(a) * 0.7; ny = Math.sin(a) * 0.7;
    }
    const nl = Math.hypot(nx, ny, nz);
    reg[p] = r; alb[3 * p] = ar; alb[3 * p + 1] = ag; alb[3 * p + 2] = ab;
    nrm[3 * p] = nx / nl; nrm[3 * p + 1] = ny / nl; nrm[3 * p + 2] = nz / nl;
  }
  // druse: quartz points on the cavity wall, growing inward along its normal
  const pr = [];
  for (let row = 0; row < 2; row++) {
    const n = row ? 22 : 34;
    for (let k = 0; k < n; k++) {
      const th = ((k + 0.5 * row + 0.6 * (kit.hash(k, row, 1) - 0.5)) / n) * kit.TAU;
      const f = superR(Math.cos(th), Math.sin(th)), base = (rimR(th) - RIND_W - AG_W + 1.2 - row * 1.5) / f;
      const bx = CX + Math.cos(th) * base, by = CY + Math.sin(th) * base;
      // the wall's normal on a superellipse, pointing in
      const c = Math.cos(th), sn = Math.sin(th);
      const gx = Math.sign(c) * Math.abs(c) ** (EXP - 1), gy = Math.sign(sn) * Math.abs(sn) ** (EXP - 1);
      const aim = Math.atan2(-gy, -gx) + (kit.hash(k, row, 2) - 0.5) * 0.8;
      const big = kit.hash(k, row, 3);
      const len = row ? 3.5 + 3 * big : 4.5 + 5 * big * big, hw = 1.5 + 0.9 * kit.hash(k, row, 4) + 0.5 * big;
      pr.push([bx, by, Math.cos(aim), Math.sin(aim), len, hw, kit.hash(k, row, 5) - 0.5, row * 0.15 + big * 0.85]);
    }
  }
  pr.sort((A, B) => A[7] - B[7]);
  pr.forEach((Q, qi) => {
    const [ax, ay, ux, uy, L, hw, roll] = Q, tB = hw * 1.7, cxv = -uy, cyv = ux, apB = L + tB * 0.45, nB = Math.hypot(tB, hw);
    for (let y = Math.max(0, Math.floor(Math.min(ay, ay + uy * L) - 5)); y <= Math.min(H - 1, Math.ceil(Math.max(ay, ay + uy * L) + 5)); y++)
      for (let x = Math.max(0, Math.floor(Math.min(ax, ax + ux * L) - 5)); x <= Math.min(W - 1, Math.ceil(Math.max(ax, ax + ux * L) + 5)); x++) {
        const dx = x - ax, dy = y - ay, u = dx * ux + dy * uy, v = dx * cxv + dy * cyv, av = Math.abs(v);
        const d = Math.max(av - hw, (av * tB - hw * (apB - u)) / nB, -u - 1.5);
        const p = y * W + x;
        if (d > 0.35 || reg[p] < 3) continue;
        const tip = (apB - u) < tB * (1 + 0.35 * (1 - av / hw));
        const side = av < hw * 0.25 ? 1 : v < 0 ? 0 : 2;
        const [fc, fa, fz] = FN[(tip ? 3 : 0) + side];
        const c2 = fc * Math.cos(roll) - fz * Math.sin(roll), z2 = fc * Math.sin(roll) + fz * Math.cos(roll);
        const nx = c2 * cxv + (fa + 0.45) * ux, ny = c2 * cyv + (fa + 0.45) * uy, nz = z2;
        const nl = Math.hypot(nx, ny, nz);
        const zt = kit.clamp(u / (L + 1));
        const lv = (0.26 + 0.40 * zt) * (0.6 + 0.4 * kit.hash(qi, 0, 6)) * (d > -0.6 ? 0.5 : 1);
        reg[p] = 3; cal[p] = kit.hash(qi, 1, 6) > 0.85 ? 1 : 0;
        alb[3 * p] = kit.lerp(QTZ0[0], QTZ1[0], zt) * lv; alb[3 * p + 1] = kit.lerp(QTZ0[1], QTZ1[1], zt) * lv; alb[3 * p + 2] = kit.lerp(QTZ0[2], QTZ1[2], zt) * lv;
        nrm[3 * p] = nx / nl; nrm[3 * p + 1] = ny / nl; nrm[3 * p + 2] = nz / nl;
      }
  });
  S = { reg, alb, nrm, cal, band };
  return S;
}

// ------------------------------------------------------------- the crystals
// Each digit: centre (x, y), scale s (design box 10 x 16), tilt a (rad, + is clockwise).
const SLOTS = [   // placed by search: every digit pair keeps >= 1 px of moat, all inside the agate
  { x: 16.5, y: 37.5, s: 1.16, a: 0.30, hw: 1.6, kind: 0 },
  { x: 33.25, y: 42.65, s: 1.16, a: 0.30, hw: 1.6, kind: 0 },
  { x: 33.4, y: 19.4, s: 0.95, a: 0.30, hw: 1.5, kind: 1 },
  { x: 47.6, y: 23.75, s: 0.95, a: 0.30, hw: 1.5, kind: 1 },
];
let OX = 0, OY = 0;                                       // parallax offset of the crystals this frame

/** Facet normals in the prism frame (across c, along a, up z): body L/top/R, tip at B, tip at A. */
const FN = [[-0.78, 0, 0.62], [0, 0, 1], [0.78, 0, 0.62], [-0.6, 0.55, 0.58], [0, 0.72, 0.69], [0.6, 0.55, 0.58],
  [-0.6, -0.55, 0.58], [0, -0.72, 0.69], [0.6, -0.55, 0.58]];

function Prism() {
  this.ax = 0; this.ay = 0; this.ux = 1; this.uy = 0; this.len = 0; this.full = 0; this.hw = 1; this.hw0 = 1;
  this.tA = 0; this.tB = 0; this.freeB = 0; this.kind = 0; this.alpha = 1; this.melt = 0; this.flare = 0;
  this.n = new Float32Array(27); this.c = new Float32Array(27); this.sp = new Float32Array(9);
}

const cache = new Map();
/** The prisms of digit d in slot k, at full growth (geometry and normals). */
function digitPrisms(k, d) {
  const key = k * 10 + d;
  if (cache.has(key)) return cache.get(key);
  const S0 = SLOTS[k], out = [];
  glyph(d).forEach((g, i) => {
    const P = new Prism();
    const ca = Math.cos(S0.a), sa = Math.sin(S0.a);
    const tx = (gx, gy) => S0.x + ((gx - 5) * ca - (gy - 8) * sa) * S0.s, ty = (gx, gy) => S0.y + ((gx - 5) * sa + (gy - 8) * ca) * S0.s;
    const ax = tx(g.ax, g.ay), ay = ty(g.ax, g.ay), bx = tx(g.bx, g.by), by = ty(g.bx, g.by);
    const L = Math.hypot(bx - ax, by - ay);
    P.ax = ax; P.ay = ay; P.ux = (bx - ax) / L; P.uy = (by - ay) / L; P.full = L; P.len = L;
    P.hw0 = P.hw = S0.hw * (g.freeA && g.freeB ? 0.8 : 1);
    P.tA = g.freeA ? P.hw * 1.7 : 0; P.freeB = g.freeB ? 1 : 0; P.tB = g.freeB ? P.hw * 1.9 : 0;
    P.kind = S0.kind;
    // facet normals to world, with a random roll about the axis
    const roll = (kit.hash(key, i, 7) - 0.5) * 0.6, cr = Math.cos(roll), sr = Math.sin(roll);
    const cxv = -P.uy, cyv = P.ux;
    for (let f = 0; f < 9; f++) {
      const [fc, fa, fz] = FN[f];
      const c2 = fc * cr - fz * sr, z2 = fc * sr + fz * cr;
      P.n[3 * f] = c2 * cxv + fa * P.ux; P.n[3 * f + 1] = c2 * cyv + fa * P.uy; P.n[3 * f + 2] = z2;
    }
    out.push(P);
  });
  cache.set(key, out);
  return out;
}

const pad = (n) => String(n).padStart(2, '0');
const hhmm = (d) => pad(d.getHours()) + pad(d.getMinutes());
const DISS0 = 0, DISS1 = 0.8, GROW0 = 0.85, GROW1 = 2.4;

/** Live prisms for this instant: the old digit melting, then the new one growing. */
function livePrisms(prev, next, age, list) {
  list.length = 0;
  for (let k = 0; k < 4; k++) {
    const a = +prev[k], b = +next[k];
    if (a === b || age >= GROW1) { for (const P of digitPrisms(k, b)) { P.len = P.full; P.hw = P.hw0; P.alpha = 1; P.melt = 0; P.flare = 0; P.tB = P.freeB ? P.hw0 * 1.9 : 0; list.push(P); } continue; }
    if (age < DISS1) {
      const ps = digitPrisms(k, a), n = ps.length;
      ps.forEach((P, i) => {
        const st = DISS0 + kit.hash(i, n, 3) * 0.12, q = kit.clamp((age - st) / 0.66);
        const e = kit.ease.inOut(q);
        P.len = P.full * (1 - e); P.hw = P.hw0 * (1 - 0.7 * e); P.alpha = 1 - e * e; P.melt = e; P.flare = 0;
        P.tB = P.freeB ? P.hw * 1.9 : P.hw * 1.2 * kit.smoothstep(0, 0.2, e);
        if (q < 1) list.push(P);
      });
    } else if (age >= GROW0) {
      const ps = digitPrisms(k, b), n = ps.length, span = GROW1 - GROW0;
      ps.forEach((P, i) => {
        // all strokes grow together (a stagger would show part-digits: a 4's stem is a 1)
        const st = GROW0 + kit.hash(i, n, 4) * span * 0.12, q = kit.clamp((age - st) / (span * 0.88));
        if (q <= 0) return;
        const e = kit.ease.out(q);
        P.len = Math.max(0.3, P.full * e); P.hw = P.hw0 * (0.55 + 0.45 * kit.smoothstep(0, 0.6, q));
        P.alpha = kit.smoothstep(0, 0.12, q); P.melt = 0;
        // the growing end is always a sharp point; a joint end blunts as it lands
        P.tB = P.freeB ? P.hw * 1.9 : P.hw * 1.9 * (1 - kit.smoothstep(0.82, 1, q));
        P.flare = q > 0.7 ? Math.sin(Math.PI * kit.clamp((q - 0.7) / 0.3)) * (P.freeB ? 1 : 0.5) : 0;
        list.push(P);
      });
    }
  }
  return list;
}

// ------------------------------------------------------------------- frame
const img = new Float32Array(3 * N), expo = new Float32Array(N);
const live = [];

// The hour: the room lamp dims and a UV torch is waved over the stone. Every
// mineral it passes fluoresces and keeps a phosphorescent afterglow, so the
// torch paints a fading trail of colour across the cavity.
const SHOW0 = 2.6, TORCH0 = 3.0, TORCH1 = 12.0, SHOW1 = 14.0, TAU_GLOW = 2.4;
const TR = 17, NS = 30, DT = 0.16;
const tx = new Float32Array(NS), ty = new Float32Array(NS), tw = new Float32Array(NS);
function torchAt(ha) {
  const s = kit.clamp((ha - TORCH0) / (TORCH1 - TORCH0)), e = kit.ease.inOut(s);
  return [32 - 40 * Math.cos(Math.PI * e), 32 - 20 * Math.sin(3 * Math.PI * e) + 4 * Math.sin(1.7 * ha)];
}
/** White-lamp level at `ha` s past the hour (1 outside the show). */
function whiteAt(ha) {
  if (ha < SHOW0 || ha > SHOW1) return 1;
  return 1 - 0.78 * kit.smoothstep(SHOW0, SHOW0 + 0.8, ha) * (1 - kit.smoothstep(TORCH1 + 0.3, SHOW1, ha));
}
/** Fill expo[] with each pixel's UV exposure + afterglow; returns false if none. */
function exposure(ha) {
  if (ha < TORCH0 || ha > TORCH1 + 4) return false;
  let any = 0;
  for (let k = 0; k < NS; k++) {
    const t = ha - k * DT;
    const on = t < TORCH0 || t > TORCH1 ? 0 : kit.smoothstep(TORCH0, TORCH0 + 0.3, t) * (1 - kit.smoothstep(TORCH1 - 0.3, TORCH1, t));
    const [x, y] = torchAt(t); tx[k] = x; ty[k] = y; tw[k] = on * (k === 0 ? 1 : 0.8 * Math.exp(-k * DT / TAU_GLOW));
    any += tw[k];
  }
  if (any < 0.01) return false;
  const r2 = 1 / (TR * TR);
  expo.fill(0);
  for (let k = 0; k < NS; k++) {
    const w = tw[k]; if (w < 0.004) continue;
    const cx = tx[k], cy = ty[k];
    const y0 = Math.max(0, Math.ceil(cy - TR)), y1 = Math.min(H - 1, Math.floor(cy + TR));
    const x0 = Math.max(0, Math.ceil(cx - TR)), x1 = Math.min(W - 1, Math.floor(cx + TR));
    for (let y = y0; y <= y1; y++) {
      const dy2 = (y - cy) * (y - cy);
      for (let x = x0, p = y * W + x0; x <= x1; x++, p++) {
        let f = 1 - ((x - cx) * (x - cx) + dy2) * r2;
        if (f <= 0) continue; f = f * f * w; if (f > expo[p]) expo[p] = f;
      }
    }
  }
  return true;
}

export default {
  name: 'Geode', blurb: 'ametrine crystals grow the time inside a cracked geode; a lamp circles it, the hour turns on the UV',
  layouts: ['hub'], look: 'smoke', fps: 60, brightness: 0.4, dither: true,
  frame(ctx) {
    const G = kit.grid(ctx), St = stone();
    const now = ctx.date.getTime() / 1000, M = Math.floor(now / 60) * 60, age = now - M;
    const prev = hhmm(new Date((M - 60) * 1000)), next = hhmm(ctx.date);
    const hourAge = ctx.date.getMinutes() === 0 ? age : 99;
    const white = whiteAt(hourAge), uvAny = exposure(hourAge);

    // the lamp: circles once a minute, bobbing in elevation
    const az = kit.TAU * (now / 60) + Math.PI / 2, el = 0.42 + 0.12 * Math.sin(now * 0.9);
    // the stone wobbles a few degrees: the light swings over it, and the crystals,
    // standing proud of the floor, slide against the rind (parallax)
    const yaw = 0.07 * Math.sin(now * 0.37), pitch = 0.06 * Math.sin(now * 0.29 + 1.3);
    OX = yaw * 9; OY = pitch * 9;
    let Lx = Math.cos(az) * Math.cos(el), Ly = Math.sin(az) * Math.cos(el), Lz = Math.sin(el);
    { const t = Lx * Math.cos(yaw) - Lz * Math.sin(yaw); Lz = Lx * Math.sin(yaw) + Lz * Math.cos(yaw); Lx = t;
      const u = Ly * Math.cos(pitch) - Lz * Math.sin(pitch); Lz = Ly * Math.sin(pitch) + Lz * Math.cos(pitch); Ly = u; }
    let Hx = Lx, Hy = Ly, Hz = Lz + 1; const hl = Math.hypot(Hx, Hy, Hz); Hx /= hl; Hy /= hl; Hz /= hl;
    const wl = white;

    // UV coverage per column (the beam sweeps left to right)
    // stone + druse
    const { reg, alb, nrm, cal, band } = St;
    for (let p = 0; p < N; p++) {
      const r = reg[p];
      if (r === 0) { img[3 * p] = img[3 * p + 1] = img[3 * p + 2] = 0; continue; }
      const nx = nrm[3 * p], ny = nrm[3 * p + 1], nz = nrm[3 * p + 2];
      const dif = Math.max(0, nx * Lx + ny * Ly + nz * Lz);
      let sh = nx * Hx + ny * Hy + nz * Hz; sh = sh > 0.9 ? (sh - 0.9) / 0.1 : 0; sh = sh * sh * sh;
      const k = (r === 3 ? 0.10 + 1.6 * dif * dif : r === 4 ? 1 : 0.45 + 0.8 * dif) * wl, gl = (r === 3 ? 0.55 : r === 2 ? 0.12 : r === 4 ? 0.03 : 0.01) * sh * wl;
      let R = alb[3 * p] * k + gl, Gc = alb[3 * p + 1] * k + gl, B = alb[3 * p + 2] * k + gl * 1.1;
      if (uvAny) {
        const u = expo[p];
        if (u > 0.002) {
          if (r === 2) { const g = band[p] * 0.45 * u; R += UV_AG[0] * g; Gc += UV_AG[1] * g; B += UV_AG[2] * g; }
          else if (r === 3) {
            if (cal[p]) { const c = 0.5 * u; R += UV_CAL[0] * c; Gc += UV_CAL[1] * c; B += UV_CAL[2] * c; }
            else { const c = 0.10 * u * (0.3 + 5 * alb[3 * p + 2]); R += UV_LAMP[0] * c; Gc += UV_LAMP[1] * c; B += UV_LAMP[2] * c; }
          } else if (r === 4) { const c = 0.012 * u; R += UV_LAMP[0] * c; B += UV_LAMP[2] * c; }
        }
      }
      img[3 * p] = R; img[3 * p + 1] = Gc; img[3 * p + 2] = B;
    }
    // the torch itself leaks a little visible violet: a soft pool where it points
    if (uvAny && tw[0] > 0) {
      const cx = tx[0], cy = ty[0], a = tw[0] * 0.06;
      for (let y = Math.max(0, Math.floor(cy - TR)); y <= Math.min(H - 1, Math.ceil(cy + TR)); y++)
        for (let x = Math.max(0, Math.floor(cx - TR)); x <= Math.min(W - 1, Math.ceil(cx + TR)); x++) {
          const p = y * W + x; if (!reg[p]) continue;
          let f = 1 - ((x - cx) ** 2 + (y - cy) ** 2) / (TR * TR); if (f <= 0) continue; f *= f * a;
          img[3 * p] += UV_LAMP[0] * f; img[3 * p + 1] += UV_LAMP[1] * f; img[3 * p + 2] += UV_LAMP[2] * f;
        }
    }
    // crystals: per-facet light for this frame
    livePrisms(prev, next, hourAge < 99 || age < GROW1 ? age : 99, live);
    for (const P of live) {
      for (let f = 0; f < 9; f++) {
        const nx = P.n[3 * f], ny = P.n[3 * f + 1], nz = P.n[3 * f + 2];
        const dif = Math.max(0, nx * Lx + ny * Ly + nz * Lz);
        let s = nx * Hx + ny * Hy + nz * Hz; s = s > 0.93 ? (s - 0.93) / 0.07 : 0; s *= s; s *= s;
        P.c[3 * f] = 0.30 + 1.9 * dif * dif * dif; P.sp[f] = s;
      }
    }
    // pass 1: a dark moat round every crystal
    for (const P of live) paintPrism(P, 1, 0, 0, 0, 0, 0, wl);
    // pass 2: the crystals
    for (const P of live) paintPrism(P, 0, Lx, Ly, uvAny ? 1 : 0, 0, 0, wl);
    // star flares on points that catch the lamp, and on freshly grown points
    for (const P of live) {
      const tipx = P.ax + OX + P.ux * (P.len + P.tB * 0.4), tipy = P.ay + OY + P.uy * (P.len + P.tB * 0.4);
      const glint = Math.max(P.sp[4], P.sp[3], P.sp[5]) * (P.freeB ? 1 : 0) * wl * P.alpha;
      const a = Math.max(glint * 0.8, P.flare);
      if (a > 0.02) star(tipx, tipy, a * (P.kind ? 0.7 : 0.8));
    }
    const dim = 1 - 0.55 * ctx.night;
    kit.blitGrid(ctx, img, dim);
  },
};

/** Coverage-render one prism into img. moat: darken the ground; else paint it. */
function paintPrism(P, moat, Lx, Ly, uvAny, phos, _, wl) {
  const hw = P.hw, L = P.len, tA = P.tA, tB = P.tB;
  if (hw <= 0.05 || L <= 0) return;
  const ext = hw * 0.85, apA = -tA * 0.45, apB = L + tB * 0.45;
  const nA = Math.hypot(tA, hw) || 1, nB = Math.hypot(tB, hw) || 1;
  const reach = Math.max(tA, ext, tB) + hw + 3.5;
  const x0 = Math.max(0, Math.floor(Math.min(P.ax, P.ax + P.ux * L) - reach)), x1 = Math.min(W - 1, Math.ceil(Math.max(P.ax, P.ax + P.ux * L) + reach));
  const y0 = Math.max(0, Math.floor(Math.min(P.ay, P.ay + P.uy * L) - reach)), y1 = Math.min(H - 1, Math.ceil(Math.max(P.ay, P.ay + P.uy * L) + reach));
  const ux = P.ux, uy = P.uy, cxv = -uy, cyv = ux;
  const lc = Lx * cxv + Ly * cyv;                       // which side faces the lamp
  const c0 = P.kind ? CIT0 : AME0, c1 = P.kind ? CIT1 : AME1, uc = P.kind ? UV_M : UV_H;
  const melt = P.melt, al = P.alpha;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const dx = x - P.ax - OX, dy = y - P.ay - OY;
    const u = dx * ux + dy * uy, v = dx * cxv + dy * cyv, av = v < 0 ? -v : v;
    const dv = av - hw;
    const dA = tA > 0 ? (av * tA - hw * (u - apA)) / nA : -ext - u;
    const dB = tB > 0.05 ? (av * tB - hw * (apB - u)) / nB : u - (L + ext);
    let d = dv; if (dA > d) d = dA; if (dB > d) d = dB;
    const p = y * W + x;
    if (moat) {
      if (d < 2.6) { const m = kit.smoothstep(0.3, 2.6, d) * al + (1 - al); img[3 * p] *= m; img[3 * p + 1] *= m; img[3 * p + 2] *= m; }
      continue;
    }
    let cov = 0.5 - d; if (cov <= 0) continue; if (cov > 1) cov = 1;
    cov *= al;
    // facet
    const side = av < hw * 0.22 ? 1 : v < 0 ? 0 : 2;
    let f = side;
    if (tB > 0.05 && (apB - u) < tB * (1 + 0.35 * (1 - av / hw))) f = 3 + side;
    else if (tA > 0 && (u - apA) < tA * (1 + 0.35 * (1 - av / hw))) f = 6 + side;
    const z = kit.clamp(u / (P.full + 0.01) * 1.15);        // colour zoning: pale base, deep point
    const zz = z * z;
    const lit = P.c[3 * f] * wl, sp = P.sp[f] * wl;
    let R = (c0[0] + (c1[0] - c0[0]) * zz) * lit * 1.45 + sp * 0.9;
    let Gc = (c0[1] + (c1[1] - c0[1]) * zz) * lit * 1.45 + sp * 0.85;
    let B = (c0[2] + (c1[2] - c0[2]) * zz) * lit * 1.45 + sp * 0.95;
    // glint edge on the rim that faces the lamp
    const rimSide = (v < 0 ? -lc : lc);
    if (rimSide > 0 && d > -1.3) { const r = (1 + d / 1.3) * rimSide * 0.35 * wl; R += r; Gc += r * 0.95; B += r; }
    // ridges between facets
    const rd = Math.abs(av - hw * 0.22);
    if (rd < 0.6) { const r = (0.6 - rd) * 0.12 * lit; R += r; Gc += r; B += r; }
    // melting: milky and pale
    if (melt > 0) { const m = melt * 0.6; R += (0.5 - R) * m * 0.3; Gc += (0.5 - Gc) * m * 0.3; B += (0.55 - B) * m * 0.3; }
    if (uvAny) {
      const ua = expo[p];
      if (ua > 0.002) { const k = ua * (1.1 + 0.25 * (f % 3)); R += uc[0] * k; Gc += uc[1] * k; B += uc[2] * k; }
    }
    const o = 3 * p;
    img[o] += (R - img[o]) * cov; img[o + 1] += (Gc - img[o + 1]) * cov; img[o + 2] += (B - img[o + 2]) * cov;
  }
}

/** A four-point star flare at (x, y), additive. */
function star(x, y, a) {
  const xi = Math.round(x), yi = Math.round(y);
  for (let k = -4; k <= 4; k++) {
    const f = a * Math.exp(-Math.abs(k) * 0.75);
    addPx(xi + k, yi, f); if (k) addPx(xi, yi + k, f);
  }
  addPx(xi + 1, yi + 1, a * 0.25); addPx(xi - 1, yi - 1, a * 0.25); addPx(xi + 1, yi - 1, a * 0.25); addPx(xi - 1, yi + 1, a * 0.25);
}
function addPx(x, y, a) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const o = 3 * (y * W + x); img[o] += a; img[o + 1] += a * 0.97; img[o + 2] += a;
}
