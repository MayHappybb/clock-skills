// Suminagashi ("floating ink"), after the Japanese marbling art. The panel
// is a tray of black water with faint rings of old ink floating on it. A
// pipette lays each numeral as a chain of drops - clear water first, which
// opens a lane, then ink into it - and every drop pushes everything around it
// outward by the exact marbling map, so the floating rings bend into contour
// lines that hug each numeral, and the numerals push one another.
//   Seconds: a drop each second at the gold target (top right), its rings
//   pushed out by the next; a glint falls, a ripple spreads.
//   Minute: the changing numeral whirls and is drunk back up the pipette in
//   reverse stroke order, then the new one is laid drop by drop.
//   Hour: the whole tray whirls into a spiral while the numerals float in
//   place, and the ground inks change colour.
// Stateless and exact: the picture is an ordered list of drops whose radii
// are functions of the clock; un-writing is the exact inverse of writing, so
// every minute is the same as if it had been built from scratch. Rendered
// backwards per sample (inkwell-ink.js); numerals in inkwell-glyphs.js.
import * as kit from '../js/kit.js';
import { N, SS, W, glyphDrops, back, unpush, blocks, group, backBlocks4, BS } from './inkwell-ink.js';
import { GLYPHS, BOX } from './inkwell-glyphs.js';

// ------------------------------------------------------------- layout
const SLOTS = [[5, 4], [24, 4], [24, 34], [43, 34]];   // glyph boxes, top-left
const TGT = [52, 17];                                  // the seconds target
const TA = 0.9;                                        // target area / pi per second
const NSEC = 59;

// ------------------------------------------------------------- palette
const AI = [kit.hex('#1f4dff'), kit.hex('#5cc8ff')];      // hours: indigo
const BENI = [kit.hex('#ff1f2a'), kit.hex('#ff9a4a')];    // minutes: safflower
const KIN = kit.hex('#ffb030');                           // seconds: gold
const CORE = 0.9;                                         // ink fraction of a drop (u = D2/r2)

const pad = (n) => String(n).padStart(2, '0');
const digitsAt = (ms) => { const d = new Date(ms); return pad(d.getHours()) + pad(d.getMinutes()); };

// ------------------------------------------------------------- drops
const glyphCache = new Map();
function glyph(d) {
  if (!glyphCache.has(d)) glyphCache.set(d, glyphDrops(GLYPHS[d]));
  return glyphCache.get(d);
}
let NOM = 0;   // nominal r2 of a digit, for compensating later pushes
function nominal() {
  if (!NOM) { let s = 0; for (let d = 0; d < 10; d++) for (const p of glyph(d)) s += p[2]; NOM = s / 10; }
  return NOM;
}
const centreOf = (g) => [SLOTS[g][0] + BOX.w / 2, SLOTS[g][1] + BOX.h / 2];

/** Drops of digit d in slot g, placed so the later slots' pushes bring them home. */
const slotCache = new Map();
function slotDrops(g, d) {
  const key = g * 10 + d;
  if (slotCache.has(key)) return slotCache.get(key);
  const src = glyph(d), n = src.length, r2n = nominal();
  const xy = new Float64Array(4 * n), col = new Float32Array(3 * n);
  const pal = g < 2 ? AI : BENI;
  let nInk = 0; for (const p of src) nInk += p[3];
  for (let k = 0, ki = 0; k < n; k++) {
    let [x, y, r2] = src[k];
    x += 0.13 * (13 - y) + SLOTS[g][0]; y += SLOTS[g][1];
    [x, y] = unpush(x, y, TGT[0], TGT[1], TA * NSEC * 0.5);
    for (let h = 3; h > g; h--) { const [cx, cy] = centreOf(h); [x, y] = unpush(x, y, cx, cy, r2n); }
    xy[4 * k] = x; xy[4 * k + 1] = y; xy[4 * k + 2] = r2; xy[4 * k + 3] = g;
    // ink runs deep to pale along the stroke order; every other drop a shade lighter
    const c = src[k][3] ? kit.scale(kit.mix(pal[0], pal[1], (ki++) / nInk), k % 2 ? 0.8 : 1) : [0, 0, 0];
    col[3 * k] = c[0]; col[3 * k + 1] = c[1]; col[3 * k + 2] = c[2];
  }
  const pos = new Float32Array(n); { let c = 0; for (let k = 0; k < n; k++) { pos[k] = c / nInk; c += src[k][3]; } }
  const v = { xy, col, n, pos, ink: src.map((p) => p[3]) };
  slotCache.set(key, v);
  return v;
}

/** The chain for slots 0..k-1 of digits s, concatenated. */
function chain(s, k) {
  let n = 0;
  for (let g = 0; g < k; g++) n += slotDrops(g, +s[g]).n;
  const xy = new Float64Array(4 * n), col = new Float32Array(3 * n), pos = new Float32Array(n), slot = new Uint8Array(n);
  let o = 0, nb = 0, ng = 0;
  const bl = new Float64Array(BS * 160), gr = new Float64Array(BS * 8);
  for (let g = 0; g < k; g++) {
    const v = slotDrops(g, +s[g]);
    xy.set(v.xy, 4 * o); col.set(v.col, 3 * o); pos.set(v.pos, o); slot.fill(g, o, o + v.n);
    const b0 = nb; nb = blocks(xy, o, o + v.n, bl, nb); ng = group(xy, bl, b0, nb, gr, ng); o += v.n;
  }
  return { xy, col, n, bl, nb, gr, ng, pos, slot };
}

// ------------------------------------------------------------- base field
// The static part of the chain sampled on the hires grid: per cell either
// ink (rgb) or water (its position in the water's own frame).
const bases = new Map();
const res = new Float64Array(3);
const inkMask = (u) => kit.clamp((CORE + 0.1 - u) / 0.2);
function base(s, k) {
  const key = s.slice(0, k) + '/' + k;
  if (bases.has(key)) return bases.get(key);
  const C = chain(s, k);
  const kind = new Uint8Array(W * W), A = new Float32Array(W * W), B = new Float32Array(W * W), Cc = new Float32Array(W * W), F = new Float32Array(W * W);
  const P = new Float64Array(8), H = new Int32Array(4), U = new Float64Array(4);
  for (let J = 0; J < N; J++) for (let I = 0; I < N; I++) {
    for (let j = 0; j < 4; j++) { P[2 * j] = I + 0.25 + 0.5 * (j & 1); P[2 * j + 1] = J + 0.25 + 0.5 * (j >> 1); H[j] = -1; }
    backBlocks4(C.xy, C.bl, C.gr, C.ng, P, H, U);
    for (let j = 0; j < 4; j++) {
      const p = (2 * J + (j >> 1)) * W + 2 * I + (j & 1), hit = H[j];
      if (hit >= 0) {
        const m = inkMask(U[j]);
        kind[p] = 1; A[p] = m; B[p] = hit;
      } else { A[p] = P[2 * j]; B[p] = P[2 * j + 1]; F[p] = phase0(A[p], B[p]); }
    }
  }
  const v = { kind, A, B, C: Cc, F, chain: C, tab: new Float32Array(3 * C.n) };
  if (bases.size > 8) bases.delete(bases.keys().next().value);
  bases.set(key, v);
  return v;
}

// ------------------------------------------------------------- ground
// Faint ink lines already floating on the water, in the water's own frame.
let gT = 0, gPh = 0, gA = 0;
const gC1 = [0, 0, 0], gC2 = [0, 0, 0];
// one pair of ground inks per hour, in turn: ai/murasaki, matcha/ai, teal/fuji, kin/ai
const GROUNDS = [['#2a6a9a', '#6a3a7a'], ['#2a7a5a', '#2a4a9a'], ['#1a6a7a', '#5a3a8a'], ['#6a5a2a', '#2a4a8a']].map((p) => p.map(kit.hex));
// suminagashi rings round two old drop sites, still spreading outward
function phase0(x, y) {
  const ax = x - 13, ay = y - 47, bx = x - TGT[0], by = y - TGT[1];
  return 0.2 * (Math.sqrt(ax * ax + ay * ay) + 0.55 * Math.sqrt(bx * bx + by * by));
}
function ground(x, y, out, o, w) {
  if (gA) {
    // the hour's whirl: the water turns, the numerals stay where they float
    const dx = x - 32, dy = y - 32, D2 = dx * dx + dy * dy;
    if (D2 < 2116) {
      const f = 1 - D2 / 2116, t = f * f * 255, k = t | 0, u = t - k;
      const c = gCos[k] + (gCos[k + 1] - gCos[k]) * u, s = gSin[k] + (gSin[k + 1] - gSin[k]) * u;
      x = 32 + dx * c - dy * s; y = 32 + dx * s + dy * c;
    }
  }
  groundPh(phase0(x, y) + gT, out, o, w);
}
function groundPh(ph, out, o, w) {
  const fl = Math.floor(ph), f = ph - fl;
  const band = (fl & 1) ? gC2 : gC1;
  const d = f > 0.5 ? 2 * f - 1 : 1 - 2 * f;
  if (d < 0.5) return;
  const v = 2 * d - 1, a = v * (2 - v) * 0.5 * w;
  out[o] += band[0] * a; out[o + 1] += band[1] * a; out[o + 2] += band[2] * a;
}
const gCos = new Float64Array(257), gSin = new Float64Array(257);
function trig(A, C, S) { for (let k = 0; k <= 256; k++) { C[k] = Math.cos(A * k / 255); S[k] = Math.sin(A * k / 255); } }

// ------------------------------------------------------------- frame
const acc = new Float32Array(3 * N * N);
const live = new Float64Array(4 * 400), liveCol = new Float32Array(3 * 400), lblk = new Float64Array(BS * 160), lgr = new Float64Array(BS * 16);
const vtab = [0, 1, 2, 3].map(() => ({ c: new Float64Array(257), s: new Float64Array(257) }));
const SP = new Float64Array(8), SH = new Int32Array(4), SU = new Float64Array(4);
const wx = new Float32Array(W * 2), wy = new Float32Array(W * 2);
const smooth = (t) => { t = kit.clamp(t); return t * t * (3 - 2 * t); };

let BFc = null;
let TAB = null;
/** Light running along the wet ink in stroke order: a slow glint per numeral. */
function glint(tg, g, pos) {
  const ph = kit.fract(tg / 7 + g * 0.29) * 1.6 - 0.3, d = (pos - ph) * 5;
  return 0.8 + 0.45 * Math.exp(-d * d);
}
function corner(kind, BA, BB, BC, p, w, o) {
  if (kind[p]) { const t = 3 * BB[p], m = BA[p] * w; acc[o] += TAB[t] * m; acc[o + 1] += TAB[t + 1] * m; acc[o + 2] += TAB[t + 2] * m; }
  else if (gA) ground(BA[p], BB[p], acc, o, w);
  else groundPh(BFc[p] + gT, acc, o, w);
}
const SPARK = kit.hex('#fff2c8'), RING = kit.hex('#9fd8ff');
/** A drop falling (tau < 0: a glint closing on the spot) and its ripple (tau > 0). */
function ripple(cx, cy, tau, size) {
  if (tau < -0.2 || tau > 0.9) return;
  const fall = tau < 0, rho = fall ? 0.4 + 9 * tau * tau : (2.2 + 11 * Math.sqrt(tau)) * size;
  const a = fall ? 0.5 * (1 + tau / 0.2) : 0.13 * (1 - tau / 0.9) ** 2;
  const reach = rho + 1.5, col = fall ? SPARK : RING;
  for (let y = Math.max(0, Math.floor(cy - reach)); y <= Math.min(N - 1, Math.ceil(cy + reach)); y++) {
    for (let x = Math.max(0, Math.floor(cx - reach)); x <= Math.min(N - 1, Math.ceil(cx + reach)); x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      const f = fall ? kit.clamp(1 - d / (rho + 0.7)) : kit.clamp(1 - Math.abs(d - rho) / 1.1);
      if (f <= 0) continue;
      const o = 3 * (y * N + x), w = a * f * f;
      acc[o] += col[0] * w; acc[o + 1] += col[1] * w; acc[o + 2] += col[2] * w;
    }
  }
}

export default {
  name: 'Suminagashi', blurb: 'floating ink: numerals laid by a pipette as chains of drops that push the water\'s rings into contours round them; drunk back up and re-laid each minute',
  layouts: ['hub'], look: 'smoke', fps: 60, brightness: 0.3, dither: true,
  frame(ctx) {
    const G = kit.grid(ctx);
    const ms = ctx.date.getTime(), M = Math.floor(ms / 60000) * 60000, s = (ms - M) / 1000;
    const cur = digitsAt(M), prev = digitsAt(M - 60000);
    let k0 = 0; while (k0 < 4 && cur[k0] === prev[k0]) k0++;
    const turning = k0 < 4 && s < 2.6;
    const B = base(cur, turning ? k0 : 4);
    const tt = (ms / 1000) % 3600;
    gT = -tt * 0.12; gPh = (tt * 0.21) % kit.TAU;
    // the hour: the whole tray whirls, and the ground inks change
    const hr = new Date(M).getHours(), hourTurn = new Date(M).getMinutes() === 0;
    const hs = hourTurn ? s : 99;
    gA = hs < 4.5 ? 7.5 * Math.sin(Math.PI * hs / 4.5) ** 2 : 0;
    if (gA) trig(gA, gCos, gSin);
    const gm = hs < 4.5 ? smooth((hs - 0.8) / 2.6) : 1;
    const g0 = GROUNDS[(hr + 3) % 4], g1 = GROUNDS[hr % 4];
    for (let c = 0; c < 3; c++) { gC1[c] = kit.lerp(g0[0][c], g1[0][c], gm); gC2[c] = kit.lerp(g0[1][c], g1[1][c], gm); }
    if (hs < 4.5) gT -= 2 * smooth(hs / 4.5);   // 2 bands on: same picture after

    // live drops: the old digits drunk back up in reverse, then the new laid
    let nl = 0;
    const vort = [], sips = [], drips = [];
    let nlb = 0, nlg = 0;
    if (turning) {
      for (let g = k0; g < 4; g++) {
        const v = slotDrops(g, +prev[g]), n = v.n, s0 = nl;
        for (let k = 0; k < n; k++) {
          const ts = 0.05 + 0.6 * (n - 1 - k) / n, f = 1 - smooth((s - ts) / 0.3);
          if (v.ink[k] && s > ts && s < ts + 0.3) sips.push(v.xy[4 * k], v.xy[4 * k + 1], f);
          if (f <= 0) continue;
          live.set(v.xy.subarray(4 * k, 4 * k + 4), 4 * nl); live[4 * nl + 2] *= f;
          { const f = glint(ms / 1000 % 3600, g, v.pos[k]); liveCol[3 * nl] = v.col[3 * k] * f; liveCol[3 * nl + 1] = v.col[3 * k + 1] * f; liveCol[3 * nl + 2] = v.col[3 * k + 2] * f; } nl++;
        }
        if (nl > s0) { const b0 = nlb; nlb = blocks(live, s0, nl, lblk, nlb); nlg = group(live, lblk, b0, nlb, lgr, nlg); }
        const va = 2.4 * Math.sin(Math.PI * kit.clamp(s / 1.15)) ** 2;
        if (va > 0) { const [vx, vy] = centreOf(g), T = vtab[vort.length]; trig(va, T.c, T.s); vort.push([vx, vy, va, T.c, T.s]); }
      }
      for (let g = k0; g < 4; g++) {
        const v = slotDrops(g, +cur[g]), n = v.n, s0 = nl;
        for (let k = 0; k < n; k++) {
          const ts = 0.95 + 1.15 * k / n, f = kit.ease.out(kit.clamp((s - ts) / 0.25));
          if (v.ink[k] && s > ts - 0.12 && s < ts + 0.5) drips.push(v.xy[4 * k], v.xy[4 * k + 1], s - ts);
          if (f <= 0) continue;
          live.set(v.xy.subarray(4 * k, 4 * k + 4), 4 * nl); live[4 * nl + 2] *= f;
          { const f = glint(ms / 1000 % 3600, g, v.pos[k]); liveCol[3 * nl] = v.col[3 * k] * f; liveCol[3 * nl + 1] = v.col[3 * k + 1] * f; liveCol[3 * nl + 2] = v.col[3 * k + 2] * f; } nl++;
        }
        if (nl > s0) { const b0 = nlb; nlb = blocks(live, s0, nl, lblk, nlb); nlg = group(live, lblk, b0, nlb, lgr, nlg); }
      }
    }
    // the seconds target
    let R2 = 0;
    if (s < 0.6) R2 = TA * NSEC * (1 - smooth(s / 0.55));
    else for (let j = 0; j < NSEC; j++) { const f = kit.ease.out(kit.clamp((s - (j + 1)) / 0.45)); if (f <= 0) break; R2 += TA * f; }

    // surface wobble: a weak divergence-free drift
    const t = ms / 1000 % 600;
    for (let i = 0; i < W; i++) {
      const x = (i + 0.5) / SS;
      wx[2 * i] = Math.sin(x * 0.19 + t * 0.7); wx[2 * i + 1] = Math.cos(x * 0.19 + t * 0.7);
    }
    for (let j = 0; j < W; j++) {
      const y = (j + 0.5) / SS;
      wy[2 * j] = Math.sin(y * 0.23 - t * 0.53); wy[2 * j + 1] = Math.cos(y * 0.23 - t * 0.53);
    }
    const WA = 1.6;

    acc.fill(0);
    const kind = B.kind, BA = B.A, BB = B.B, BC = B.C, BF = B.F;
    BFc = BF;
    {
      const Cn = B.chain, tab = B.tab, tg = ms / 1000 % 3600;
      for (let k = 0; k < Cn.n; k++) {
        const f = glint(tg, Cn.slot[k], Cn.pos[k]);
        tab[3 * k] = Cn.col[3 * k] * f; tab[3 * k + 1] = Cn.col[3 * k + 1] * f; tab[3 * k + 2] = Cn.col[3 * k + 2] * f;
      }
      TAB = tab;
    }
    const q = 1 / (SS * SS);
    for (let J = 0; J < N; J++) for (let I = 0; I < N; I++) {
      const o = 3 * (J * N + I);
      for (let sb = 0; sb < 4; sb++) {
        const i = 2 * I + (sb & 1), j = 2 * J + (sb >> 1);
        let x = (i + 0.5) / SS, y = (j + 0.5) / SS;
        // wobble: psi = WA sin(ax) sin(by); v = (psi_y, -psi_x)
        x -= WA * 0.23 * wx[2 * i] * wy[2 * j + 1]; y += WA * 0.19 * wx[2 * i + 1] * wy[2 * j];
        for (let v = 0; v < vort.length; v++) {
          const vx = vort[v][0], vy = vort[v][1], a = vort[v][2];
          const dx = x - vx, dy = y - vy, D2 = dx * dx + dy * dy;
          if (D2 >= 196 || !a) continue;
          const f = 1 - D2 / 196, t = f * f * 255, k = t | 0, u = t - k, VC = vort[v][3], VS = vort[v][4];
          const c = VC[k] + (VC[k + 1] - VC[k]) * u, sn = -(VS[k] + (VS[k + 1] - VS[k]) * u);
          x = vx + dx * c - dy * sn; y = vy + dx * sn + dy * c;
        }
        SH[sb] = -1;
        // the seconds target
        if (R2 > 0) {
          const dx = x - TGT[0], dy = y - TGT[1], D2 = dx * dx + dy * dy;
          if (D2 < R2) {
            const jj = Math.floor((R2 - D2) / TA), band = Math.floor(jj / 4);
            if (band % 2 === 0) { const a = q * (0.55 + 0.45 * (jj === Math.floor(R2 / TA - 1e-9) ? 1 : 0)); acc[o] += KIN[0] * a; acc[o + 1] += KIN[1] * a; acc[o + 2] += KIN[2] * a; }
            SH[sb] = 1e6;
            continue;
          }
          const k = Math.sqrt(1 - R2 / D2); x = TGT[0] + dx * k; y = TGT[1] + dy * k;
        }
        SP[2 * sb] = x; SP[2 * sb + 1] = y;
      }
      if (nlg) backBlocks4(live, lblk, lgr, nlg, SP, SH, SU);
      for (let sb = 0; sb < 4; sb++) {
        const hit = SH[sb];
        if (hit >= 1e6) continue;
        if (hit >= 0) {
          const m = inkMask(SU[sb]) * q;
          acc[o] += liveCol[3 * hit] * m; acc[o + 1] += liveCol[3 * hit + 1] * m; acc[o + 2] += liveCol[3 * hit + 2] * m;
          continue;
        }
        // bilinear lookup in the base field
        let fx = SP[2 * sb] * SS - 0.5, fy = SP[2 * sb + 1] * SS - 0.5;
        fx = fx < 0 ? 0 : fx > W - 1.001 ? W - 1.001 : fx; fy = fy < 0 ? 0 : fy > W - 1.001 ? W - 1.001 : fy;
        const i0 = fx | 0, j0 = fy | 0, tx = fx - i0, ty = fy - j0;
        const p00 = j0 * W + i0, p10 = p00 + 1, p01 = p00 + W, p11 = p01 + 1;
        const w00 = (1 - tx) * (1 - ty) * q, w10 = tx * (1 - ty) * q, w01 = (1 - tx) * ty * q, w11 = tx * ty * q;
        if (!(kind[p00] | kind[p10] | kind[p01] | kind[p11])) {
          if (gA) ground((BA[p00] * w00 + BA[p10] * w10 + BA[p01] * w01 + BA[p11] * w11) / q,
            (BB[p00] * w00 + BB[p10] * w10 + BB[p01] * w01 + BB[p11] * w11) / q, acc, o, q);
          else groundPh((BF[p00] * w00 + BF[p10] * w10 + BF[p01] * w01 + BF[p11] * w11) / q + gT, acc, o, q);
        } else {
          corner(kind, BA, BB, BC, p00, w00, o); corner(kind, BA, BB, BC, p10, w10, o);
          corner(kind, BA, BB, BC, p01, w01, o); corner(kind, BA, BB, BC, p11, w11, o);
        }
      }
    }
    // each second's drop: a glint falling to the water, then a ring of light
    const sec = Math.floor(s);
    for (const j of [sec, sec + 1]) {
      if (j < 1 || j > NSEC) continue;
      const tau = s - j;
      if (tau < -0.2 || tau > 0.9) continue;
      ripple(TGT[0], TGT[1], tau, 1);
    }
    // the pipette: drinking the old numeral back (a glint where it sips),
    // and laying the new one drop by drop (each a glint, then a small ring)
    for (let k = 0; k < sips.length; k += 3) ripple(sips[k], sips[k + 1], -0.2 * sips[k + 2], 0.5);
    for (let k = 0; k < drips.length; k += 3) ripple(drips[k], drips[k + 1], drips[k + 2] < 0 ? drips[k + 2] * 1.6 : drips[k + 2] * 1.8, 0.35);
    const dim = 1 - 0.7 * ctx.night, idx = G.idx, out = ctx.out;
    for (let p = 0; p < N * N; p++) {
      const i = idx[p]; if (i < 0) continue;
      out[3 * i] = acc[3 * p] * dim; out[3 * i + 1] = acc[3 * p + 1] * dim; out[3 * i + 2] = acc[3 * p + 2] * dim;
    }
  },
};
