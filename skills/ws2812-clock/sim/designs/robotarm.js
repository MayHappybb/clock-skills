// Robot workshop: a 192 x 64 machine shop where the time is a set of steel
// parts. Two orange industrial arms ride a track behind the bench; the four
// numerals are plates milled with chamfered edges, standing in jigs under a
// swaying lamp, the hours painted, the minutes bare brushed steel.
//
// Always alive: the arms laser-scan and deburr the parts, the lamp sways and
// its glint slides over the bevels, bolts ride the conveyor.
// Minute: an arm grips the old numeral, tips it back and drops it behind the
// bench; a blank plate rises into the jig; the other arm's laser cuts the new
// numeral out of it (sparks, a glowing kerf that cools); the off-cut falls
// away and the hot part cools from orange to steel.
// Hour: the jigs eject every changing part at once, both arms cut in
// parallel, then spray the hours a new colour and take a bow.
import * as kit from '../js/kit.js';
import { GLYPHS, GW, GH, STEP, X0, Y0, NX, NY, pathIndex } from './robotarm-glyphs.js';

const W = 192, H = 64, BENCH = 56, SHOULDER = 40, L1 = 21, L2 = 19, L3 = 6;
const img = new Float32Array(W * H * 3), bg = new Float32Array(W * H * 3);
const { clamp, lerp } = kit, ease = kit.ease.inOut, PI = Math.PI;

const SLOTS = [16, 46, 124, 148].map((x, k) => {
  const s = k < 2 ? 2.1 : 1.7;
  return { k, x, s, w: GW * s, h: GH * s, top: BENCH - GH * s, cx: x + GW * s / 2 };
});

const LAMP = kit.blackbody(3300), FILL = kit.hex('#5277a8'), ORANGE = kit.hex('#ff6a10');
const HAZ = kit.hex('#ffb400'), STEEL = [0.46, 0.49, 0.54], TOOL = [0.2, 0.21, 0.23];
const LASER = kit.hex('#a8ecff'), SCAN = kit.hex('#ff2236');
const PAINTS = ['#1d5fd0', '#1f9e46', '#8a3fc0', '#0a9cb0', '#d0307a'].map(kit.hex);
const paintOf = (h) => PAINTS[h % PAINTS.length];

// ------------------------------------------------------------- pixels
function addPx(x, y, r, g, b) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const p = 3 * (y * W + x); img[p] += r; img[p + 1] += g; img[p + 2] += b;
}
/** A point of light at sub-pixel (x, y), shared bilinearly by four LEDs. */
function dot(x, y, c, a) {
  const fx = x - 0.5, fy = y - 0.5, ix = Math.floor(fx), iy = Math.floor(fy), u = fx - ix, v = fy - iy;
  const r = c[0] * a, g = c[1] * a, b = c[2] * a;
  let k = (1 - u) * (1 - v); addPx(ix, iy, r * k, g * k, b * k);
  k = u * (1 - v); addPx(ix + 1, iy, r * k, g * k, b * k);
  k = (1 - u) * v; addPx(ix, iy + 1, r * k, g * k, b * k);
  k = u * v; addPx(ix + 1, iy + 1, r * k, g * k, b * k);
}
function darkPx(x, y, a) { if (x < 0 || y < 0 || x >= W || y >= H) return; const p = 3 * (y * W + x), k = 1 - a; img[p] *= k; img[p + 1] *= k; img[p + 2] *= k; }
function darkDot(x, y, a) {
  const fx = x - 0.5, fy = y - 0.5, ix = Math.floor(fx), iy = Math.floor(fy), u = fx - ix, v = fy - iy;
  darkPx(ix, iy, a * (1 - u) * (1 - v)); darkPx(ix + 1, iy, a * u * (1 - v));
  darkPx(ix, iy + 1, a * (1 - u) * v); darkPx(ix + 1, iy + 1, a * u * v);
}
function glow(x, y, r, c, a) {
  const x0 = Math.max(0, Math.floor(x - r)), x1 = Math.min(W - 1, Math.ceil(x + r));
  const y0 = Math.max(0, Math.floor(y - r)), y1 = Math.min(H - 1, Math.ceil(y + r)), ir = 1 / (r * r);
  for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) {
    const dx = i + 0.5 - x, dy = j + 0.5 - y, f = 1 - (dx * dx + dy * dy) * ir;
    if (f > 0) addPx(i, j, c[0] * a * f * f, c[1] * a * f * f, c[2] * a * f * f);
  }
}
function line(ax, ay, bx, by, c, a) {
  const n = Math.ceil(Math.hypot(bx - ax, by - ay) * 2) + 1;
  for (let i = 0; i <= n; i++) dot(lerp(ax, bx, i / n), lerp(ay, by, i / n), c, a * 0.5);
}

// light for painted machinery: from the upper left and front
const LD = (() => { const v = [-0.45, -0.75, 0.55], m = Math.hypot(...v); return v.map((c) => c / m); })();
const HV = (() => { const v = [LD[0], LD[1], LD[2] + 1], m = Math.hypot(...v); return v.map((c) => c / m); })();
/** A shaded cylinder from a to b (a sphere when a = b), with a dark rim that separates it. */
function capsule(ax, ay, bx, by, r, c, rim = 0.9, shine = 0.45) {
  const dx = bx - ax, dy = by - ay, LL = dx * dx + dy * dy || 1e-9, R = r + rim;
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - R - 1)), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + R + 1));
  const y0 = Math.max(0, Math.floor(Math.min(ay, by) - R - 1)), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by) + R + 1));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const X = x + 0.5, Y = y + 0.5;
    let t = ((X - ax) * dx + (Y - ay) * dy) / LL; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = X - ax - t * dx, qy = Y - ay - t * dy, d = Math.sqrt(qx * qx + qy * qy);
    if (d > R + 0.5) continue;
    const p = 3 * (y * W + x);
    if (rim > 0) { const hk = 0.92 * clamp(R + 0.5 - d); img[p] *= 1 - hk; img[p + 1] *= 1 - hk; img[p + 2] *= 1 - hk; }
    const cov = clamp(r + 0.5 - d);
    if (cov <= 0) continue;
    const q = Math.min(1, d / r), nx = d > 0 ? (qx / d) * q : 0, ny = d > 0 ? (qy / d) * q : 0, nz = Math.sqrt(1 - q * q);
    const diff = Math.max(0, nx * LD[0] + ny * LD[1] + nz * LD[2]);
    let sp = Math.max(0, nx * HV[0] + ny * HV[1] + nz * HV[2]); sp *= sp; sp *= sp; sp *= sp; sp *= sp;
    const k = 0.14 + 0.95 * diff, s = shine * sp;
    img[p] += (c[0] * k + s - img[p]) * cov; img[p + 1] += (c[1] * k + s - img[p + 1]) * cov; img[p + 2] += (c[2] * k + s - img[p + 2]) * cov;
  }
}
// ------------------------------------------------------------- parts
// What a part looks like this frame (one shared object, no allocation).
const MAT = { paintOld: null, paintNew: null, front: 0, heat: 0, scanY: -99, lampX: 98, lampY: 9 };
function resetMat() { MAT.paintOld = MAT.paintNew = null; MAT.front = 0; MAT.heat = 0; MAT.scanY = -99; }

/**
 * A steel part at scale S (px per unit), box top-left (ox, oy), tipped back by
 * th (radians, pivot on its top edge). kind 0 = numeral G, 1 = blank plate,
 * 2 = off-cut (the plate with numeral G cut out of it). Clipped at the bench.
 */
function drawPart(kind, G, S, ox, oy, th) {
  const ct = Math.cos(th), st = Math.sin(th), Sv = S * ct;
  const x0 = Math.max(0, Math.floor(ox - 2.5)), x1 = Math.min(W - 1, Math.ceil(ox + (GW + 0.8) * S + 2));
  const y0 = Math.max(0, Math.floor(oy - 2.5)), y1 = Math.min(BENCH - 1, Math.ceil(oy + (GH + 0.2) * Sv + 2));
  const lx = MAT.lampX, ly = MAT.lampY, pO = MAT.paintOld, pN = MAT.paintNew, heat = MAT.heat, scanY = MAT.scanY;
  for (let y = y0; y <= y1; y++) {
    const Y = y + 0.5, v = (Y - oy) / Sv;
    for (let x = x0; x <= x1; x++) {
      const X = x + 0.5, u = (X - ox) / S;
      let dd = 9, gnx = 0, gny = 0;
      if (kind !== 1) {
        const fx = (u - X0) / STEP, fy = (v - Y0) / STEP;
        if (fx >= 0 && fy >= 0 && fx < NX - 1 && fy < NY - 1) {
          const i = fx | 0, j = fy | 0, a = fx - i, b = fy - j, q = j * NX + i;
          const w00 = (1 - a) * (1 - b), w10 = a * (1 - b), w01 = (1 - a) * b, w11 = a * b;
          const D = G.d, NXa = G.nx, NYa = G.ny;
          dd = D[q] * w00 + D[q + 1] * w10 + D[q + NX] * w01 + D[q + NX + 1] * w11;
          gnx = NXa[q] * w00 + NXa[q + 1] * w10 + NXa[q + NX] * w01 + NXa[q + NX + 1] * w11;
          gny = NYa[q] * w00 + NYa[q + 1] * w10 + NYa[q + NX] * w01 + NYa[q + NX + 1] * w11;
        }
      }
      let dist, nx, ny;
      if (kind === 0) { dist = dd; nx = gnx; ny = gny; }
      else {
        let dp = -0.4 - u; nx = -1; ny = 0;
        let c = u - 12.4; if (c > dp) { dp = c; nx = 1; ny = 0; }
        c = -0.5 - v; if (c > dp) { dp = c; nx = 0; ny = -1; }
        c = v - 19; if (c > dp) { dp = c; nx = 0; ny = 1; }
        if (kind === 2) { c = 0.25 - dd; if (c > dp) { dp = c; nx = -gnx; ny = -gny; } }
        dist = dp;
      }
      const dpx = dist * S;
      if (dpx > 1.6) continue;
      const p = 3 * (y * W + x);
      if (dpx > -0.5) { const hk = 0.9 * clamp((1.6 - dpx) / 1.6); img[p] *= 1 - hk; img[p + 1] *= 1 - hk; img[p + 2] *= 1 - hk; }
      const cov = clamp(0.5 - dpx);
      if (cov <= 0) continue;
      // facet normal: chamfer near the edge, flat face inside
      const m = clamp((1.35 + dpx) / 0.8), nm = Math.sqrt(gnx * gnx + gny * gny) > 0.3 || kind ? 1 : 0;
      let Nx = nx * 0.72 * m * nm, Ny = ny * 0.72 * m * nm, Nz = 1 - 0.3 * m * nm;
      const nl = 1 / Math.sqrt(Nx * Nx + Ny * Ny + Nz * Nz); Nx *= nl; Ny *= nl; Nz *= nl;
      if (th) { const ny2 = Ny * ct - Nz * st; Nz = Ny * st + Nz * ct; Ny = ny2; }
      // the hanging lamp
      let Lx = lx - X, Ly = ly - Y, Lz = 20;
      const l2 = Lx * Lx + Ly * Ly + Lz * Lz, il = 1 / Math.sqrt(l2); Lx *= il; Ly *= il; Lz *= il;
      const att = 1 / (1 + l2 / 4200);
      const diff = Math.max(0, Nx * Lx + Ny * Ly + Nz * Lz);
      // brushed steel: the highlight is stretched along the grain (horizontal)
      let hx = Lx * (0.35 + 0.65 * m), hy = Ly, hz = Lz + 1;
      const hl = 1 / Math.sqrt(hx * hx + hy * hy + hz * hz); hx *= hl; hy *= hl; hz *= hl;
      let sp = Math.max(0, Nx * hx + Ny * hy + Nz * hz); sp *= sp; sp *= sp; sp *= sp; sp *= sp; sp *= sp;
      const fd = Math.max(0, -0.45 * Nx - 0.55 * Ny + 0.7 * Nz);
      const grain = 0.86 + 0.14 * Math.sin(v * 9.7 + 2.3 * Math.sin(v * 3.1 + u * 0.7));
      const pl = kind ? 0.2 : 1;
      let ar = STEEL[0] * grain * pl, ag = STEEL[1] * grain * pl, ab = STEEL[2] * grain * pl * 1.1, gloss = kind ? 0.12 : 1;
      if (pO || pN) {   // painted face, the chamfers machined back to bright steel
        const pc = !pN ? pO : !pO ? pN : null;
        let k = 1 - m, cr, cg, cb;
        if (pc) { cr = pc[0]; cg = pc[1]; cb = pc[2]; }
        else { const f = clamp((MAT.front - Y) / 2.5 + 0.5); cr = lerp(pO[0], pN[0], f); cg = lerp(pO[1], pN[1], f); cb = lerp(pO[2], pN[2], f); }
        if (!pO && pN) k *= clamp((MAT.front - Y) / 2.5 + 0.5);
        if (pO && !pN) k *= 1;
        const pk = k * (0.82 + 0.18 * grain);
        ar = lerp(ar, cr * 1.1, pk); ag = lerp(ag, cg * 1.1, pk); ab = lerp(ab, cb * 1.1, pk); gloss = 1 - 0.55 * k;
      }
      const kd = 0.6 + 2.6 * diff * att, kf = 0.9 * fd, ks = 1.6 * sp * att * gloss;
      let r = ar * (kd * LAMP[0] + kf * FILL[0]) + ks * LAMP[0];
      let g = ag * (kd * LAMP[1] + kf * FILL[1]) + ks * LAMP[1];
      let b = ab * (kd * LAMP[2] + kf * FILL[2]) + ks * LAMP[2];
      if (heat > 0.003) {   // fresh from the laser: edges hottest
        const h = heat * (0.45 + 0.55 * m);
        r += 1.1 * clamp(h * 2.2); g += 0.75 * clamp(h * 2.2 - 0.8) * 0.9; b += 0.5 * clamp(h * 2.2 - 1.5);
      }
      const sy = Math.abs(Y - scanY);
      if (sy < 1.4) { const k = (1 - sy / 1.4) * (0.55 + 0.45 * m); r += SCAN[0] * k; g += SCAN[1] * k; b += SCAN[2] * k; }
      img[p] += (r - img[p]) * cov; img[p + 1] += (g - img[p + 1]) * cov; img[p + 2] += (b - img[p + 2]) * cov;
    }
  }
}
// ------------------------------------------------------------- cutting
/** The laser head on a cut at time t: [x, y, on] in px. */
function headAt(c, t) {
  const S = SLOTS[c.slot], G = GLYPHS[c.g], s = clamp((t - c.a) / c.D) * G.len;
  const i = pathIndex(G, s), j = Math.min(i + 1, G.cum.length - 1), seg = G.cum[j] - G.cum[i];
  const f = seg > 0 ? clamp((s - G.cum[i]) / seg) : 0;
  return [S.x + lerp(G.px[i], G.px[j], f) * S.s, S.top + lerp(G.py[i], G.py[j], f) * S.s, seg < 0.5 && t >= c.a && t <= c.a + c.D];
}
/** Where the arm holds the torch while cutting at fraction u: above the part, leaning toward the head. */
function cutPose(c, u) {
  const S = SLOTS[c.slot], G = GLYPHS[c.g];
  let ax = 0;
  for (let k = -2; k <= 2; k++) {
    const s = clamp(u * G.len + k * 4, 0, G.len), i = pathIndex(G, s);
    ax += S.x + G.px[i] * S.s;
  }
  ax /= 5;
  const tx = lerp(S.cx, ax, 0.75), ty = S.top - 5;
  const h = headAt(c, c.a + u * c.D);
  const ang = Math.atan2(h[1] - ty, h[0] - tx);
  return [tx, ty, PI / 2 + 0.55 * (ang - PI / 2)];
}

// ------------------------------------------------------------- the plan
// Arm 0 (left) works the hours, arm 1 (right) the minutes; they never cross.
const HOME = [[80, 25], [116, 25]], BOFF = [-12, 12], SIDE = [-1, 1], GRIPDY = 1.2;
const pad = (n) => n;
function dig(mi) {
  const d = new Date(mi * 60000), h = d.getHours(), m = d.getMinutes();
  return [Math.floor(h / 10), h % 10, Math.floor(m / 10), m % 10, pad(h), m];
}
function key(T, t, x, y, g, a = PI / 2) {
  const K = T.kf, last = K[K.length - 1];
  if (last && t <= last.t) t = last.t + 1e-3;
  K.push({ t, x, y, g: g ?? (last ? last.g : 0), a, b: clamp(x + BOFF[T.arm], 6, 186) });
}
const lastKey = (T) => T.kf[T.kf.length - 1];
const mkCut = (slot, g, a, D, arm) => ({ slot, g, a, D, arm });

/** What the turn into minute `cur` (from `prev`) does to each slot and arm. */
function turnSpec(prev, cur) {
  const ch = [0, 1, 2, 3].filter((k) => prev[k] !== cur[k]), hour = cur[5] === 0;
  const slots = [null, null, null, null], cuts = [[], []];
  let appr;
  if (hour) {
    for (const k of ch) slots[k] = { how: 'eject', t0: 0, rise: 0.28 };
    for (const arm of [0, 1]) {
      let t = 0.68;
      for (const k of ch.filter((q) => (arm ? q >= 2 : q < 2))) {
        slots[k].cut = mkCut(k, cur[k], t, 0.85, arm); cuts[arm].push(slots[k].cut); t += 1.0;
      }
    }
    appr = [cuts[0].length ? { kind: 'precut', cut: cuts[0][0] } : { kind: 'wait', x: 40, y: 10 }, { kind: 'precut', cut: cuts[1][0] }];
  } else if (ch.length === 1) {
    slots[3] = { how: 'arm', arm: 1, t0: 0, rise: 0.86, cut: mkCut(3, cur[3], 1.25, 1.4, 0) };
    cuts[0].push(slots[3].cut);
    appr = [{ kind: 'wait', x: 137, y: 12 }, { kind: 'grip', slot: 3 }];
  } else {
    slots[2] = { how: 'arm', arm: 0, t0: 0, rise: 0.86, cut: mkCut(2, cur[2], 1.25, 1.4, 0) };
    slots[3] = { how: 'arm', arm: 1, t0: 0, rise: 0.86, cut: mkCut(3, cur[3], 1.25, 1.4, 1) };
    cuts[0].push(slots[2].cut); cuts[1].push(slots[3].cut);
    appr = [{ kind: 'grip', slot: 2 }, { kind: 'grip', slot: 3 }];
  }
  for (const s of slots) if (s) s.drop = s.cut.a + s.cut.D + 0.08;
  return { hour, ch, slots, cuts, appr };
}

function approach(T, sp, t1) {
  if (sp.kind === 'grip') {
    const S = SLOTS[sp.slot];
    key(T, t1 - 0.8, S.cx, S.top - 5, 0); key(T, t1 - 0.32, S.cx, S.top + GRIPDY, 0); key(T, t1 - 0.06, S.cx, S.top + GRIPDY, 1);
  } else if (sp.kind === 'wait') key(T, t1 - 0.5, sp.x, sp.y, 0);
  else { const p = cutPose(sp.cut, 0); key(T, t1 - 0.4, p[0], p[1], 0, p[2]); }
}

/** Fill free time with work: laser scans, deburring the top edges, a rest at home. */
function idle(T, M, t, tEnd) {
  const a = T.arm;
  for (let n = 0; n < 40; n++) {
    const L = lastKey(T), r = kit.hash(M, a * 31 + n, 7), r2 = kit.hash(M, a * 31 + n, 8);
    const S = SLOTS[(a ? 2 : 0) + (r2 < 0.5 ? 0 : 1)];
    const kind = r < 0.28 ? 'rest' : r < 0.64 ? 'scan' : 'burr';
    let sx, sy;
    if (kind === 'rest') { sx = HOME[a][0] + (r2 - 0.5) * 8; sy = HOME[a][1] + (r - 0.14) * 10; }
    else if (kind === 'scan') { sx = S.cx; sy = S.top - 7; }
    else { sx = S.x + 2.5; sy = S.top - 4; }
    const trav = 0.8 + Math.hypot(sx - L.x, sy - L.y) / 110;
    const dur = kind === 'rest' ? 2 + 2.5 * r2 : kind === 'scan' ? 2.8 : 2.6, t1 = t + trav;
    if (t1 + dur > tEnd) break;
    key(T, t1, sx, sy, 0);
    if (kind === 'rest') { key(T, t1 + dur * 0.5, sx, sy - 1.5, 0, PI / 2 + (r2 - 0.5) * 0.7); key(T, t1 + dur, sx, sy, 0); }
    else if (kind === 'scan') { T.modes.push({ kind: 'scan', a: t1 + 0.15, b: t1 + dur - 0.15, slot: S.k }); key(T, t1 + dur, sx, sy, 0); }
    else {
      const y0 = S.top - 0.6;
      key(T, t1 + 0.3, sx, y0, 0);
      T.modes.push({ kind: 'burr', a: t1 + 0.3, b: t1 + dur - 0.3, slot: S.k });
      key(T, t1 + dur - 0.3, S.x + S.w - 2.5, y0, 0); key(T, t1 + dur, S.x + S.w - 2.5, S.top - 4, 0);
    }
    t = t1 + dur;
  }
}

const plans = new Map();
function plan(M) {
  if (plans.has(M)) return plans.get(M);
  const prev = dig(M - 1), cur = dig(M), next = dig(M + 1);
  const tin = turnSpec(prev, cur), tout = turnSpec(cur, next);
  const T = [{ arm: 0, kf: [], modes: [] }, { arm: 1, kf: [], modes: [] }];
  const free = [0, 0];
  for (const a of [0, 1]) approach(T[a], tin.appr[a], 0);
  for (const a of [0, 1]) {
    const Tr = T[a];
    for (const s of tin.slots) if (s && s.how === 'arm' && s.arm === a) {
      const S = SLOTS[tin.slots.indexOf(s)], gy = S.top + GRIPDY;
      key(Tr, 0.55, S.cx, gy - 6, 1); key(Tr, 0.68, S.cx, gy - 7, 0); free[a] = 0.68;
      if (!tin.cuts[a].length) { key(Tr, 1.7, 178, 30, 0); free[a] = 1.7; }
    }
    for (const c of tin.cuts[a]) {
      const p0 = cutPose(c, 0), p1 = cutPose(c, 1), L = lastKey(Tr);
      if (c.a - 0.6 > L.t) key(Tr, c.a - 0.6, L.x, L.y, L.g, L.a);
      key(Tr, c.a, p0[0], p0[1], 0, p0[2]);
      Tr.modes.push({ kind: 'cut', a: c.a, b: c.a + c.D, cut: c });
      key(Tr, c.a + c.D, p1[0], p1[1], 0, p1[2]);
      free[a] = c.a + c.D;
    }
  }
  if (tin.hour) {
    // spray the hours a new colour, then a synchronised bow
    for (const a of [0, 1]) {
      const S = SLOTS[a], Tr = T[a];
      key(Tr, 3.4, S.cx, S.top - 5, 0);
      Tr.modes.push({ kind: 'spray', a: 3.4, b: 5.4, slot: a });
      key(Tr, 5.4, S.cx, S.top - 5, 0);
      key(Tr, 6.0, S.cx + (a ? 6 : -6), 7, 0, -PI / 2);
      key(Tr, 6.45, S.cx + (a ? 2 : -2), 9, 0, -PI / 2 + (a ? 0.6 : -0.6));
      key(Tr, 6.9, S.cx + (a ? 6 : -6), 7, 0, -PI / 2 - (a ? 0.6 : -0.6));
      key(Tr, 7.35, S.cx + (a ? 4 : -4), 8, 0, -PI / 2);
      key(Tr, 7.8, S.cx, S.top - 4, 0, PI / 2 + (a ? -0.9 : 0.9));    // bow to each other
      key(Tr, 8.3, S.cx, S.top - 4, 0, PI / 2 + (a ? -0.9 : 0.9));
      free[a] = 8.3;
    }
  }
  for (const a of [0, 1]) {
    key(T[a], free[a] + 1.0, HOME[a][0], HOME[a][1], 0);
    idle(T[a], M, free[a] + 1.0, 57.6);
    approach(T[a], tout.appr[a], 60);
  }
  const P = { prev, cur, next, tin, tout, T };
  plans.set(M, P);
  if (plans.size > 4) plans.delete(plans.keys().next().value);
  return P;
}

/** Arm pose at time t: keyframes eased, overridden by the task in hand; then IK. */
function armAt(T, t) {
  const K = T.kf;
  let i = 0;
  while (i + 1 < K.length && K[i + 1].t <= t) i++;
  const A = K[i], B = K[Math.min(i + 1, K.length - 1)];
  const e = B === A || t <= A.t ? (t < A.t ? 0 : 1) : ease(clamp((t - A.t) / (B.t - A.t)));
  const P = { arm: T.arm, x: lerp(A.x, B.x, e), y: lerp(A.y, B.y, e), g: lerp(A.g, B.g, e), a: lerp(A.a, B.a, e), b: lerp(A.b, B.b, e), mode: null };
  if (t < A.t) { P.x = A.x; P.y = A.y; P.g = A.g; P.a = A.a; P.b = A.b; }
  for (const md of T.modes) {
    if (t < md.a || t >= md.b) continue;
    P.mode = md;
    if (md.kind === 'cut') { const q = cutPose(md.cut, (t - md.a) / (md.b - md.a)); P.x = q[0]; P.y = q[1]; P.a = q[2]; }
    else if (md.kind === 'spray') {
      const S = SLOTS[md.slot], u = (t - md.a) / (md.b - md.a);
      P.x = S.cx + 0.42 * S.w * Math.sin(u * 8 * PI);
      P.a = PI / 2 + 0.35 * Math.sin(u * 8 * PI) * 0;
    }
  }
  // inverse kinematics: shoulder on the carriage, elbow out and up
  const sx = P.b, sy = SHOULDER, wx = P.x - L3 * Math.cos(P.a), wy = P.y - L3 * Math.sin(P.a);
  const dx = wx - sx, dy = wy - sy, d = clamp(Math.hypot(dx, dy), Math.abs(L1 - L2) + 0.5, L1 + L2 - 0.2);
  const phi = Math.atan2(dy, dx), al = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
  const ex = sx + L1 * Math.cos(phi + SIDE[T.arm] * al), ey = sy + L1 * Math.sin(phi + SIDE[T.arm] * al);
  const qx = wx - ex, qy = wy - ey, ql = Math.hypot(qx, qy) || 1;
  P.sx = sx; P.sy = sy; P.ex = ex; P.ey = ey; P.wx = ex + (qx / ql) * L2; P.wy = ey + (qy / ql) * L2;
  P.tx = P.wx + L3 * Math.cos(P.a); P.ty = P.wy + L3 * Math.sin(P.a);
  return P;
}
// ------------------------------------------------------------- machinery
const ORANGE_DK = kit.scale(ORANGE, 0.55), CHROME = [0.62, 0.64, 0.68];
/** The carriage under each arm: a hazard-striped pedestal on the track behind the bench. */
function pedestal(cx) {
  for (let y = SHOULDER + 1; y < BENCH; y++) for (let x = Math.floor(cx - 7); x <= Math.ceil(cx + 7); x++) {
    if (x < 0 || x >= W) continue;
    const X = x + 0.5, dx = Math.abs(X - cx), p = 3 * (y * W + x);
    const rim = clamp(6.6 - dx); if (rim <= 0) continue;
    const hk = 0.9 * rim; img[p] *= 1 - hk; img[p + 1] *= 1 - hk; img[p + 2] *= 1 - hk;
    const cov = clamp(5.6 - dx); if (cov <= 0) continue;
    const s = clamp(0.5 + 1.6 * Math.sin((X - cx + y) * PI / 3)), sh = 0.55 + 0.45 * (1 - dx / 5.6);
    const r = lerp(0.02, HAZ[0] * 0.4, s) * sh, g = lerp(0.02, HAZ[1] * 0.4, s) * sh, b = lerp(0.02, HAZ[2] * 0.4, s) * sh;
    img[p] += (r - img[p]) * cov; img[p + 1] += (g - img[p + 1]) * cov; img[p + 2] += (b - img[p + 2]) * cov;
  }
}
function drawArmBody(P) {
  const side = SIDE[P.arm];
  pedestal(P.sx);
  // hydraulic ram from the pedestal to the upper arm: chrome rod, dark barrel
  const hx = P.sx - side * 5, hy = SHOULDER + 4, mx = lerp(P.sx, P.ex, 0.55), my = lerp(P.sy, P.ey, 0.55);
  capsule(hx, hy, mx, my, 0.6, CHROME, 0.6, 0.9);
  capsule(hx, hy, lerp(hx, mx, 0.5), lerp(hy, my, 0.5), 1.3, [0.12, 0.13, 0.14], 0.6, 0.4);
  capsule(P.sx, P.sy, P.sx, P.sy, 4.2, ORANGE_DK, 1);
  capsule(P.sx, P.sy, P.ex, P.ey, 2.9, ORANGE, 1);
  capsule(P.sx, P.sy, P.sx, P.sy, 1.3, [0.25, 0.26, 0.28], 0.4, 0.8);
  capsule(P.ex, P.ey, P.wx, P.wy, 2.2, ORANGE, 0.9);
  capsule(P.ex, P.ey, P.ex, P.ey, 3.0, ORANGE_DK, 0.8);
  capsule(P.ex, P.ey, P.ex, P.ey, 1.1, [0.25, 0.26, 0.28], 0.3, 0.8);
}
function drawTool(P) {
  const c = Math.cos(P.a), s = Math.sin(P.a), px = -s, py = c;
  capsule(P.wx, P.wy, P.wx, P.wy, 2.0, [0.16, 0.17, 0.18], 0.7, 0.6);
  capsule(P.wx, P.wy, P.tx - c * 1.2, P.ty - s * 1.2, 1.3, TOOL, 0.7, 0.6);
  const gap = lerp(3.3, 2.3, P.g);
  capsule(P.tx - c * 1.2 + px * gap, P.ty - s * 1.2 + py * gap, P.tx - c * 1.2 - px * gap, P.ty - s * 1.2 - py * gap, 0.7, TOOL, 0.5, 0.5);
  for (const sg of [-1, 1]) {
    const bx = P.tx + px * gap * sg - c * 1.2, by = P.ty + py * gap * sg - s * 1.2;
    capsule(bx, by, bx + c * 2.7, by + s * 2.7, 0.6, [0.5, 0.52, 0.56], 0.4, 0.9);
  }
  dot(P.tx - c * 0.6, P.ty - s * 0.6, LASER, 0.25);
}

// ------------------------------------------------------------- effects
const SPK = [0, 0, 0];
/** Deterministic sparks: one born every 1/rate s, flying from where the emitter was then. */
function sparks(seed, t, a, b, rate, emit, spread, up) {
  const dt = 1 / rate, j0 = Math.floor(t / dt);
  for (let k = 0; k < 45; k++) {
    const j = j0 - k, tb = j * dt;
    if (tb < a || tb > b) continue;
    const life = 0.2 + 0.35 * kit.hash(j, seed, 3), age = t - tb;
    if (age > life || age < 0) continue;
    const e = emit(tb); if (!e) continue;
    const vx = (kit.hash(j, seed, 1) - 0.5) * spread, vy = -up * kit.hash(j, seed, 2) + 6;
    const x = e[0] + vx * age;
    let y = e[1] + vy * age + 0.5 * 240 * age * age;
    if (y > BENCH - 0.5) y = 2 * (BENCH - 0.5) - y;
    const f = 1 - age / life;
    SPK[0] = 1; SPK[1] = 0.45 + 0.45 * f; SPK[2] = 0.1 + 0.6 * f * f;
    dot(x, y, SPK, 1.5 * f + 0.2);
  }
}
const HOT = [0, 0, 0];
function kerf(sp, t) {
  const c = sp.cut, S = SLOTS[c.slot], G = GLYPHS[c.g], s = clamp((t - c.a) / c.D) * G.len, speed = G.len / c.D;
  const late = Math.max(0, t - (c.a + c.D)), n = pathIndex(G, s);
  for (let i = 0; i <= n; i++) {
    const ago = (s - G.cum[i]) / speed + late, temp = Math.exp(-ago / 0.5);
    const x = S.x + G.px[i] * S.s, y = S.top + G.py[i] * S.s;
    if (t < sp.drop) darkDot(x, y, 0.8 * (1 - temp));
    if (temp < 0.02) continue;
    HOT[0] = 1; HOT[1] = 0.22 + 0.7 * temp; HOT[2] = 0.05 + 0.65 * temp * temp;
    dot(x, y, HOT, 1.1 * temp);
  }
}
// ------------------------------------------------------------- the shop
const JIGS = [[12, 14.6], [42.4, 45], [72.4, 75], [120, 122.6], [145, 147], [169.6, 172.2]];
let bgReady = false;
function buildBG() {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = 3 * (y * W + x);
    let r = 0, g = 0, b = 0;
    if (x % 48 === 0 && y > 2) { r = 0.018; g = 0.02; b = 0.026; }
    if (y <= 2) { const k = y === 2 ? 0.05 : 0.025; r = k; g = k * 1.04; b = k * 1.1; }
    if (y === BENCH) { r = 0.2; g = 0.21; b = 0.22; }
    else if (y === BENCH + 1 || y === BENCH + 2) {
      const s = (x + y) % 8 < 4; r = s ? HAZ[0] * 0.3 : 0.004; g = s ? HAZ[1] * 0.3 : 0.004; b = s ? HAZ[2] * 0.3 : 0.004;
    } else if (y > BENCH + 2) { const k = y === BENCH + 3 ? 0.035 : 0.011; r = k; g = k; b = k * 1.1; }
    bg[p] = r; bg[p + 1] = g; bg[p + 2] = b;
  }
  for (const [a, b] of JIGS) for (let y = BENCH - 6; y < BENCH; y++) for (let x = Math.floor(a); x < Math.ceil(b); x++) {
    const cov = clamp(Math.min(x + 1 - a, b - x)), p = 3 * (y * W + x);
    const k = (y === BENCH - 6 ? 0.13 : 0.05) * cov;
    bg[p] = k; bg[p + 1] = k * 1.05; bg[p + 2] = k * 1.12;
  }
  bgReady = true;
}
function lampPool(lx, ly) {
  for (let y = Math.max(0, Math.floor(ly + 2)); y < BENCH; y++) {
    const dy = y + 0.5 - ly, w = 5 + dy * 0.8, a = 0.03 * (1 - dy / 90);
    const x0 = Math.max(0, Math.floor(lx - 2.2 * w)), x1 = Math.min(W - 1, Math.ceil(lx + 2.2 * w));
    for (let x = x0; x <= x1; x++) {
      const u = (x + 0.5 - lx) / w, f = a * Math.exp(-u * u * 1.4), p = 3 * (y * W + x);
      img[p] += LAMP[0] * f; img[p + 1] += LAMP[1] * f; img[p + 2] += LAMP[2] * f;
    }
  }
}
function lampFixture(lx, ly) {
  line(98, 0, lx, ly - 2.5, [0.06, 0.06, 0.065], 1);
  capsule(lx - 3.6, ly - 1.4, lx + 3.6, ly - 1.4, 1.4, [0.1, 0.16, 0.13], 0.7, 0.6);
  capsule(lx, ly - 2.6, lx, ly - 2.6, 1.3, [0.1, 0.16, 0.13], 0.4, 0.6);
  glow(lx, ly + 0.4, 2.6, LAMP, 0.9);
  glow(lx, ly + 1.5, 9, LAMP, 0.06);
}
function conveyor(now) {
  for (let x = 0; x < W; x += 6) dot(x + ((now * 9) % 6), BENCH + 5.6, [0.03, 0.03, 0.033], 1);
  for (let k = 0; k < 9; k++) {
    const x = ((k * 23 + kit.hash(k, 4) * 9 + now * 9) % (W + 23)) - 12, nut = kit.hash(k, 5) < 0.35;
    if (nut) capsule(x, BENCH + 4.6, x + 1.4, BENCH + 4.6, 1.1, [0.3, 0.31, 0.33], 0.5, 0.7);
    else {
      capsule(x + 1.2, BENCH + 4.9, x + 5.2, BENCH + 4.9, 0.55, [0.26, 0.27, 0.29], 0.4, 0.7);
      capsule(x, BENCH + 4.6, x, BENCH + 5.2, 1.0, [0.34, 0.35, 0.37], 0.5, 0.8);
    }
  }
}

/** Paint on an hour numeral this frame (minutes stay bare steel). */
function setPaint(k, t, P) {
  resetMat();
  if (k >= 2) return;
  const hr = P.cur[4], tin = P.tin;
  if (!tin.hour) { MAT.paintOld = paintOf(hr); return; }
  const pO = tin.slots[k] ? null : paintOf(P.prev[4]);   // freshly cut parts are bare until sprayed
  if (t < 3.4) MAT.paintOld = pO;
  else if (t < 5.4) { MAT.paintOld = pO; MAT.paintNew = paintOf(hr); MAT.front = SLOTS[k].top - 1 + (SLOTS[k].h + 2) * (t - 3.4) / 2; }
  else MAT.paintOld = paintOf(hr);
}

function drawSlot(k, t, P, A, scanY) {
  const S = SLOTS[k], sp = P.tin.slots[k];
  if (!sp) { setPaint(k, t, P); MAT.scanY = scanY; drawPart(0, GLYPHS[P.cur[k]], S.s, S.x, S.top, 0); return; }
  // the old part: gripped, tipped back and dropped behind the bench (or ejected on the hour)
  const Gold = GLYPHS[P.prev[k]], tau = t - sp.t0;
  resetMat(); if (k < 2) MAT.paintOld = paintOf(P.prev[4]);
  if (tau < 0) { MAT.scanY = scanY; drawPart(0, Gold, S.s, S.x, S.top, 0); }
  else if (sp.how === 'arm') {
    if (tau < 0.68) drawPart(0, Gold, S.s, S.x, S.top + A[sp.arm].y - (S.top + GRIPDY), 0.85 * ease(clamp(tau / 0.62)));
    else {
      const tf = tau - 0.68, oy = S.top - 7 + 6 * tf + 450 * tf * tf;
      if (oy < BENCH) drawPart(0, Gold, S.s, S.x, oy, Math.min(1.35, 0.85 + 2.6 * tf));
    }
  } else { const oy = S.top + 420 * tau * tau; if (oy < BENCH) drawPart(0, Gold, S.s, S.x, oy, 0); }
  // the new part: a blank rises, is cut, the off-cut falls
  if (t < sp.rise) return;
  resetMat();
  if (t < sp.drop) {
    const e = clamp((t - sp.rise) / 0.4);
    drawPart(1, null, S.s, S.x, S.top + (S.h + 3) * (1 - kit.ease.out(e)), 0);
  } else {
    setPaint(k, t, P); MAT.heat = 0.95 * Math.exp(-(t - sp.drop) / 1.6); MAT.scanY = scanY;
    drawPart(0, GLYPHS[P.cur[k]], S.s, S.x, S.top, 0);
    const tf = t - sp.drop, oy = S.top + 6 * tf + 550 * tf * tf;
    if (oy < BENCH) { resetMat(); drawPart(2, GLYPHS[P.cur[k]], S.s, S.x, oy, 0); }
  }
}
// The operator: the owner's rainbow frog in round glasses, at the control desk.
const BANDS = ['#ff3b30', '#ff9500', '#ffd60a', '#34c759', '#1e90ff', '#9b59ff'].map(kit.hex);
function frog(now, t, P, look, cheer) {
  const cx = 98, hy = 39 - 1.2 * cheer + 0.35 * Math.sin(now * 2 * PI / 3.3);
  const bb = Math.floor(now / 3.7), bu = (now - bb * 3.7 - 3.0 * kit.hash(bb, 77)) / 0.16;
  const lid = bu > 0 && bu < 1 ? Math.sin(PI * bu) : 0;
  const ex = [cx - 4.6, cx + 4.6], ey = hy - 6.2;
  const px = clamp((look[0] - cx) / 60, -1, 1) * 1.1, py = clamp((look[1] - ey) / 30, -1, 1) * 0.9;
  for (let y = Math.floor(ey - 6); y < 46; y++) for (let x = cx - 13; x <= cx + 13; x++) {
    const X = x + 0.5, Y = y + 0.5, p = 3 * (y * W + x);
    const hx = (X - cx) / 10.5, hh = (Y - hy) / 7.4;
    let d = (Math.sqrt(hx * hx + hh * hh) - 1) * 7.4;
    let eye = -1;
    for (let k = 0; k < 2; k++) {
      const de = Math.hypot(X - ex[k], Y - ey) - 4.3;
      if (de < d) d = de;
      if (de < 0.2) eye = k;
    }
    if (d > 1.4) continue;
    const hk = 0.92 * clamp(1.4 - d); img[p] *= 1 - hk; img[p + 1] *= 1 - hk; img[p + 2] *= 1 - hk;
    const cov = clamp(0.5 - d); if (cov <= 0) continue;
    const band = BANDS[clamp(Math.floor((Y - (ey - 4.5)) / 2.9), 0, 5)];
    let r = band[0] * 0.8, g = band[1] * 0.8, b = band[2] * 0.8;
    if (eye >= 0) {
      const dx = X - ex[eye], dy = Y - ey, rr = Math.hypot(dx, dy);
      if (rr > 2.9 && rr < 4.1) { r = g = b = 0.85; }                       // white rim of the glasses
      else if (rr <= 2.9) {
        if (Math.abs(dy) < 2.9 * lid + 0.01 && lid > 0.05) { r = band[0] * 0.4; g = band[1] * 0.4; b = band[2] * 0.4; }
        else {
          const pd = Math.hypot(dx - px, dy - py);
          const k = pd < 1.25 ? 0.01 : 0.42; r = k; g = k; b = k * 1.05;
        }
      }
    }
    // the smile
    const sm = Math.abs(Math.hypot(X - cx, Y - (hy - 3.5)) - 6.3);
    if (sm < 0.8 && Y > hy + 0.6 && Math.abs(X - cx) < 5.2) { const k = 1 - sm / 0.75; r *= 1 - 0.9 * k; g *= 1 - 0.9 * k; b *= 1 - 0.9 * k; }
    img[p] += (r - img[p]) * cov; img[p + 1] += (g - img[p + 1]) * cov; img[p + 2] += (b - img[p + 2]) * cov;
  }
  // the desk, the frog's hands on it (raised in a cheer on the hour), and its stack light
  for (let y = 45; y < BENCH; y++) for (let x = 80; x < 114; x++) {
    const p = 3 * (y * W + x), k = y === 45 ? 0.16 : 0.035 + 0.01 * ((x + y) % 2);
    img[p] = k; img[p + 1] = k * 1.04; img[p + 2] = k * 1.12;
  }
  const hand = BANDS[3];
  for (const sg of [-1, 1]) {
    const hx = cx + sg * (9 + 3 * cheer), hy2 = lerp(44.6, hy - 9 - 2 * Math.sin(now * 9), cheer);
    if (cheer > 0.05) capsule(cx + sg * 8, hy + 3, hx, hy2 + 1, 1.2, kit.scale(hand, 0.6), 0.7, 0.3);
    capsule(hx - 1, hy2, hx + 1, hy2, 1.3, kit.scale(hand, 0.65), 0.7, 0.3);
  }
  const busy = t < 4 || t > 59.2, hour = P.tin.hour && t < 9;
  const green = 0.2 + 0.3 * Math.cos(t * PI) ** 2;
  const amber = busy ? 0.25 + 0.75 * Math.sin(now * 2 * PI * 1.5) ** 2 : 0.03;
  const red = hour ? (Math.sin(now * 2 * PI * 2) > 0 ? 1 : 0.15) : 0.03;
  capsule(84, 40, 84, 45, 0.6, [0.3, 0.31, 0.33], 0.5, 0.5);
  capsule(84, 31.6, 84, 32.4, 1.4, kit.scale([1, 0.05, 0.03], red), 0.8, 0.3);
  capsule(84, 34.8, 84, 35.6, 1.4, kit.scale([1, 0.5, 0.02], amber), 0.6, 0.3);
  capsule(84, 38, 84, 38.8, 1.4, kit.scale([0.05, 1, 0.2], green), 0.6, 0.3);
  if (hour) glow(84, 32, 9, [1, 0.08, 0.03], 0.15 * red);
  if (busy) glow(84, 35.2, 6, [1, 0.5, 0.02], 0.08 * amber);
  for (const [bx, c] of [[88, [0.1, 0.5, 1]], [92, [1, 0.2, 0.1]], [104, [0.1, 1, 0.3]]]) dot(bx, 49.5, c, 0.35 + 0.25 * Math.sin(now * 3 + bx));
}

export default {
  name: 'Robot Workshop',
  blurb: 'two orange robot arms machine the time from steel plate: grip, drop, laser-cut, cool; the hours sprayed a new colour each hour',
  layouts: ['hub-x3'], look: 'smoke', fps: 60, brightness: 0.4, dither: true,
  frame(ctx) {
    if (!kit.grid(ctx)) return;
    if (!bgReady) buildBG();
    const now = ctx.date.getTime() / 1000, M = Math.floor(now / 60), t = now - M * 60;
    const P = plan(M);
    img.set(bg);
    const sw = 0.1 * Math.sin(now * 2 * PI / 4.4) + 0.03 * Math.sin(now * 2 * PI / 1.9);
    const lx = 98 + 9 * Math.sin(sw), ly = 9 * Math.cos(sw);
    MAT.lampX = lx; MAT.lampY = ly;
    lampPool(lx, ly);
    const A = [armAt(P.T[0], t), armAt(P.T[1], t)];
    drawArmBody(A[0]); drawArmBody(A[1]);
    const scanY = [-99, -99, -99, -99];
    for (const a of A) if (a.mode && a.mode.kind === 'scan') {
      const md = a.mode, S = SLOTS[md.slot], u = (t - md.a) / (md.b - md.a);
      scanY[md.slot] = S.top + 0.5 + (S.h - 1) * (0.5 - 0.5 * Math.cos(2 * PI * u));
    }
    for (let k = 0; k < 4; k++) drawSlot(k, t, P, A, scanY[k]);
    for (const sp of P.tin.slots) if (sp && t >= sp.cut.a && t < sp.drop + 0.6) kerf(sp, t);
    // tools at work
    for (const a of A) {
      const md = a.mode; if (!md) continue;
      if (md.kind === 'cut') {
        const c = md.cut, h = headAt(c, t);
        sparks(c.slot + 1, t, c.a, c.a + c.D, 170, (tb) => { const q = headAt(c, tb); return q[2] ? q : null; }, 95, 40);
        if (h[2]) {
          line(a.tx, a.ty, h[0], h[1], LASER, 0.7);
          glow(h[0], h[1], 3, [1, 0.97, 0.9], 1.6);
          glow(h[0], h[1], 8, [1, 0.45, 0.1], 0.16);
        }
      } else if (md.kind === 'scan') {
        const S = SLOTS[md.slot], y = scanY[md.slot];
        line(a.tx, a.ty, S.x, y, SCAN, 0.1); line(a.tx, a.ty, S.x + S.w, y, SCAN, 0.1);
        glow(a.tx, a.ty + 0.5, 1.6, SCAN, 0.5);
      } else if (md.kind === 'burr') {
        const S = SLOTS[md.slot], G = GLYPHS[P.cur[md.slot]], x0 = S.x + 2.5, x1 = S.x + S.w - 2.5;
        const contact = (tb) => {
          const x = lerp(x0, x1, ease(clamp((tb - md.a) / (md.b - md.a)))), u = (x - S.x) / S.s;
          let best = 99;
          for (let v = 0; v < 4; v += 0.5) {
            const i = Math.round((u - X0) / STEP), j = Math.round((v - Y0) / STEP);
            if (G.d[j * NX + i] < 0) { best = v; break; }
          }
          return best < 4 ? [x, S.top + best * S.s] : null;
        };
        const c = contact(t);
        sparks(md.slot + 11, t, md.a, md.b, 70, contact, 50, 45);
        if (c) glow(c[0], c[1], 2, [1, 0.8, 0.5], 0.6);
      } else if (md.kind === 'spray') {
        const S = SLOTS[md.slot], col = paintOf(P.cur[4]), front = S.top - 1 + (S.h + 2) * (t - md.a) / 2;
        for (let k = 0; k < 40; k++) {
          const j = Math.floor(t * 120) - k, tb = j / 120, age = t - tb;
          if (tb < md.a) continue;
          const u = (tb - md.a) / (md.b - md.a), nx = S.cx + 0.42 * S.w * Math.sin(u * 8 * PI);
          const x = nx + (kit.hash(j, 21) - 0.5) * 40 * age, y = S.top - 2 + 90 * age;
          if (y > front + 2 || y > BENCH) continue;
          dot(x, y, col, 0.35 * (1 - age * 2));
        }
        glow(a.tx, a.ty + 1.5, 3, col, 0.25);
      }
    }
    drawTool(A[0]); drawTool(A[1]);
    lampFixture(lx, ly);
    let look = [lx, ly + 20];
    for (const a of A) if (a.mode) look = a.mode.kind === 'cut' ? headAt(a.mode.cut, t) : [a.tx, a.ty + 8];
    const cheer = P.tin.hour ? clamp((t - 5.3) / 0.5) * clamp((9 - t) / 0.6) : 0;
    frog(now, t, P, look, cheer);
    conveyor(now);
    // jig status lights: amber while their part is being changed
    JIGS.forEach(([a, b], j) => {
      const k = [0, 0, 1, 2, 3, 3][j], sp = P.tin.slots[k], busy = (sp && t < sp.drop + 0.8) || P.tout.slots[k] && t > 59;
      dot((a + b) / 2, BENCH - 6.6, busy ? [1, 0.45, 0.02] : [0.05, 0.9, 0.25], busy ? 0.6 : 0.25);
    });
    const dim = 1 - 0.55 * ctx.night;
    kit.blitGrid(ctx, img, dim);
  },
};
