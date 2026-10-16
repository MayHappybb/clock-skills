// Dragon Dance: a 256 x 64 banner where one long red-and-gold dragon, held up
// on poles by a troupe of dancers (only their legs show), is carried along a
// route that WRITES THE TIME: the body loops through the four numerals, dips
// low behind the troupe between them, and rears up at the right into a big
// head that chases the pearl a lead dancer waves in front of it. The colon is
// a string of two paper lanterns.
//
// Always: a travelling wave runs down the body, sequins glint along it, the
// dancers step, whiskers float, the head tracks the pearl, the lanterns sway.
// Minute: the dragon lunges at the pearl and misses (the dancer yanks it
// away); the jolt runs back down the body, and as it passes a numeral that
// must change, the dancers duck that stretch of body into a low wave and
// raise it again as the new numeral.
// Hour: firecracker strings are lowered at :59; at :00 they go off, the
// dragon CATCHES the pearl and swallows it; the lump travels the whole body,
// through every numeral, to the tail, which spits the pearl back over the
// banner to the lead dancer.
import * as kit from '../js/kit.js';
import { GLYPHS, DIVE, NS, strand } from './dragondance-glyphs.js';
import { W, H, img, ellipse, disc, capsule, polyline, glow, shade } from './dragondance-draw.js';

const N = W * H;
const OX = [18, 57, 110, 149], OY = 5;          // digit slots (route box 28 x 40)
const COLON_X = 97.5;

// palette (linear)
const RED = kit.hex('#e3170a'), GOLD = kit.hex('#ffb31a'), CREAM = kit.hex('#ffe2a6'), MANE = kit.hex('#ffc838');
const WHITE = [1, 1, 1], INK = [0, 0, 0], MOUTH = kit.hex('#3a0206'), TONGUE = kit.hex('#ff5a6a');
const LANT = kit.hex('#ff2410'), LANT_IN = kit.hex('#ff7a28'), WOOD = kit.scale(kit.hex('#8a5426'), 0.45);
const TROUSER = kit.scale(kit.hex('#ffba1e'), 0.55), SASH = kit.scale(kit.hex('#e01010'), 0.7), SOLE = [0.22, 0.22, 0.22];
const PEARL = kit.hex('#fff0f6'), FLAME = kit.hex('#ff6a3a'), SMOKE = [0.5, 0.5, 0.56], SPARK = kit.hex('#ffd060');
const RED_HI = kit.hex('#ff5a2a'), RED_LO = kit.hex('#a00c06');

// ------------------------------------------------------------- the body
const CAP = 1700;
const SX = new Float32Array(CAP), SY = new Float32Array(CAP), SZ = new Float32Array(CAP), SR = new Float32Array(CAP);
const SS = new Float32Array(CAP), TX = new Float32Array(CAP), TY = new Float32Array(CAP);
const PRI = new Float32Array(N), PD = new Float32Array(N), PV = new Float32Array(N), PS = new Float32Array(N);
const PZ = new Float32Array(N), PR = new Float32Array(N), PNX = new Float32Array(N), PNY = new Float32Array(N);

const TAIL = strand([[1.5, 41, 1], [4.5, 46.5, 0.8], [8.5, 50.5, 0.3], [12, 52, 0]], 30);
const CONN = [null, strand([[OX[1] + 34, 52, 0], [COLON_X, 52.5, 0], [OX[2] - 6, 52, 0]], 24), null];
const HEAD_DANCER_DX = 3;

const pad = (n) => String(n).padStart(2, '0');
const digitsAt = (sec) => { const d = new Date(sec * 1000); return pad(d.getHours()) + pad(d.getMinutes()); };
const eio = kit.ease.inOut, cl = kit.clamp, ss = kit.smoothstep;

let n = 0;
function push(x, y, z) { SX[n] = x; SY[n] = y; SZ[n] = z; n++; }
function pushStrand(r, from = 0) { for (let j = from; j < r.x.length; j++) push(r.x[j], r.y[j], r.z[j]); }

/** Morph progress of route point j in a changing slot: 0 old, 0.5 dived, 1 new. */
function morphP(age, g) { return cl((age - 0.15 - (1 - g) * 1.25) / 1.3); }
function morphMix(o, d, w, p) {
  if (p <= 0) return o;
  if (p >= 1) return w;
  const q = p * 2;
  return q < 1 ? o + (d - o) * eio(q) : d + (w - d) * eio(q - 1);
}

// ---------------------------------------------------------- characters
function head(hx, hy, open, lx, ly, blink, T, gulp) {
  // mane behind the skull
  for (let k = 0; k < 7; k++) {
    const th = Math.PI * (0.55 + k * 0.15), fl = Math.sin(T * 5.3 + k * 1.7);
    const mx = hx - 2 + Math.cos(th) * 8.5 - 1.2 * fl, my = hy + 1 + Math.sin(th) * 10;
    disc(mx, my, 3.2 + 0.5 * fl, k % 2 ? MANE : CREAM, 0.95);
  }
  // horns (antlers swept back)
  polyline([hx + 3, hy - 6, hx - 3, hy - 13, hx - 10, hy - 15.5], 2.4, GOLD);
  polyline([hx + 8, hy - 7, hx + 4, hy - 15, hx - 1, hy - 19], 2.2, GOLD);
  capsule(hx - 3, hy - 13, hx - 4, hy - 18, 1.6, GOLD);
  // keyline, then skull and snout
  ellipse(hx + 6, hy, 11.6, 9.6, 0, INK);
  ellipse(hx + 17, hy + 1, 10.6, 6.2, -0.08, INK);
  ellipse(hx + 16, hy + 7.5 + open * 5.5, 9.6, 4, open * 0.25, INK);
  ellipse(hx + 6, hy, 10.5, 8.5, 0, RED);
  ellipse(hx + 5, hy - 3.5, 7, 3.2, 0, RED_HI, 0.7);
  // mouth: interior, teeth, tongue, jaw
  if (open > 0.02) {
    ellipse(hx + 17, hy + 6 + open * 2.2, 8, 1 + open * 3.4, 0, MOUTH);
    capsule(hx + 13, hy + 7 + open * 2.6, hx + 20, hy + 6.5 + open * 3.6, 2, TONGUE, 0.8);
  }
  ellipse(hx + 17, hy + 1, 9.5, 5, -0.08, RED);
  for (let k = 0; k < 4; k++) capsule(hx + 12 + k * 3.4, hy + 5.6, hx + 12.3 + k * 3.4, hy + 7.2, 1.3, WHITE, 0.9);
  const jy = hy + 7.5 + open * 5.5;
  ellipse(hx + 16, jy, 8.5, 2.9, open * 0.25, RED_LO);
  for (let k = 0; k < 3; k++) capsule(hx + 13 + k * 3.6, jy - 2.4, hx + 13.2 + k * 3.6, jy - 3.4, 1.2, WHITE, open > 0.15 ? 0.9 : 0);
  // beard
  for (let k = 0; k < 4; k++) disc(hx + 9 + k * 3, jy + 3.2 + 0.6 * Math.sin(T * 4 + k), 1.9, CREAM, 0.9);
  // nose bulb, brow
  disc(hx + 26.2, hy - 0.3, 2.7, GOLD);
  disc(hx + 27, hy + 0.3, 0.8, MOUTH);
  capsule(hx + 6.5, hy - 8.3, hx + 15.5, hy - 6.6, 2.2, GOLD);
  // the eye: big, white, tracking the pearl
  const ex = hx + 11.5, ey = hy - 2.8, er = 4.5 + 0.6 * gulp;
  disc(ex, ey, er + 0.8, INK);
  disc(ex, ey, er, WHITE, 0.95);
  const ll = Math.hypot(lx, ly) || 1, pr = 2.3 - 0.6 * gulp;
  disc(ex + (lx / ll) * (er - pr - 0.4), ey + (ly / ll) * (er - pr - 0.4), pr, INK);
  disc(ex + (lx / ll) * (er - pr - 0.4) - 0.8, ey + (ly / ll) * (er - pr - 0.4) - 0.8, 0.7, WHITE);
  if (blink > 0) ellipse(ex, ey - er * (1 - blink) * 0.9, er + 0.9, (er + 0.9) * blink, 0, RED);
  // whiskers float
  const w1 = [], w2 = [];
  for (let i = 0; i <= 8; i++) {
    const f = i / 8;
    w1.push(hx + 25 + i * 1.25, hy + 3 + i * 1.3 + 2.6 * Math.sin(T * 2.1 - i * 0.55) * f);
    w2.push(hx + 24 + i * 1.15, hy - 2.5 - i * 1.25 + 2.4 * Math.sin(T * 1.8 - i * 0.6 + 1.3) * f);
  }
  polyline(w1, 1.15, MANE, 0.9);
  polyline(w2, 1.15, MANE, 0.9);
}

function pearl(x, y, T, a = 1) {
  glow(x, y, 9, kit.scale(PEARL, 0.18), a);
  for (let k = 0; k < 3; k++) {
    const an = T * 2.7 + k * 2.09, L = 4.4 + 0.9 * Math.sin(T * 7 + k);
    capsule(x, y, x + Math.cos(an) * L, y + Math.sin(an) * L, 1.7, FLAME, 0.75 * a);
  }
  disc(x, y, 3.5, PEARL, a);
  disc(x + 0.9, y + 1, 2.2, kit.hex('#ffc6e0'), 0.45 * a);
  disc(x - 1.1, y - 1.2, 0.9, WHITE, a);
}

function lantern(cx, cy, T, k, tassel) {
  const fl = 0.85 + 0.15 * kit.noise2(T * 3, k * 7);
  glow(cx, cy, 11, kit.scale(LANT_IN, 0.05 * fl));
  ellipse(cx, cy, 5.4, 4.6, 0, LANT);
  ellipse(cx, cy + 0.3, 3.2, 3, 0, LANT_IN, 0.55 * fl);
  disc(cx - 0.5, cy - 0.2, 1.3, kit.hex('#ffd080'), 0.4 * fl);
  capsule(cx - 2.8, cy - 3.2, cx - 2.8, cy + 3.2, 0.8, kit.hex('#7a0804'), 0.7);
  capsule(cx + 2.8, cy - 3.2, cx + 2.8, cy + 3.2, 0.8, kit.hex('#7a0804'), 0.7);
  capsule(cx - 2.3, cy - 4.8, cx + 2.3, cy - 4.8, 1.6, GOLD);
  capsule(cx - 2.3, cy + 4.8, cx + 2.3, cy + 4.8, 1.6, GOLD);
  if (tassel) {
    const sw = 1.2 * Math.sin(T * 1.6 + k);
    capsule(cx, cy + 5.6, cx + sw, cy + 10, 1.5, GOLD, 0.85);
  }
}

function dancer(x, ph, hop) {
  const hipY = 55 - hop;
  for (let k = 0; k < 2; k++) {
    const p = ph + k * Math.PI, lift = Math.max(0, Math.sin(p)) * 2.6;
    const hx = x + (k ? 0.9 : -0.9), fx = x + (k ? 1.4 : -1.4) + 1.6 * Math.cos(p), fy = 62.4 - lift - hop * 0.6;
    const kx = (hx + fx) / 2 + 1 + lift * 0.3, ky = (hipY + fy) / 2 - lift * 0.25;
    capsule(hx, hipY, kx, ky, 2.3, TROUSER);
    capsule(kx, ky, fx, fy, 2.1, kit.scale(TROUSER, 0.8));
    capsule(fx - 0.6, fy + 0.7, fx + 1.6, fy + 0.7, 1, SOLE);
  }
  capsule(x - 2.2, hipY, x + 2.2, hipY, 1.6, SASH);
}

// --------------------------------------------------------- firecrackers
const STR_X = [4.5, 251.5];
function crackerTime(s, k) { return 0.05 + s * 0.17 + (7 - k) * 0.31 + 0.06 * kit.hash(k, s, 3); }
function crackerPos(s, k, drop, T) {
  const y = 3 + k * 2.6 + drop, x = STR_X[s] + 0.4 * Math.sin(T * 1.3 + s) * (k / 7);
  return [x, y];
}
/** One bang at (x, y), dt seconds ago: flash, sparks, paper, smoke. */
function bang(x, y, dt, seed, big) {
  if (dt < 0 || dt > 3.5) return;
  if (dt < 0.12) glow(x, y, big ? 8 : 6, [1, 0.9, 0.7], 1.6 * (1 - dt / 0.12));
  if (dt < 0.5) for (let k = 0; k < 7; k++) {
    const an = kit.hash(seed, k) * kit.TAU, sp = 18 + 22 * kit.hash(k, seed, 1);
    const sx = x + Math.cos(an) * sp * dt, sy = y + Math.sin(an) * sp * dt + 30 * dt * dt;
    glow(sx, sy, 1.6, SPARK, 1.2 * (1 - dt / 0.5));
  }
  for (let k = 0; k < 3; k++) {
    const px = x + (kit.hash(seed, k, 5) - 0.5) * 8 + 1.5 * Math.sin(dt * 5 + k), py = y + dt * 11 * (0.6 + kit.hash(k, seed, 7));
    if (py < H) glow(px, py, 1.2, kit.scale(RED, 0.8), 0.8 * (1 - dt / 3.5));
  }
  const r = 3 + dt * 2.4;
  glow(x + dt * 2.5, y - dt * 3, r, kit.scale(SMOKE, 0.05), 1 - dt / 3.5);
}

// ------------------------------------------------------------ the frame
export default {
  name: 'Dragon Dance',
  blurb: 'a troupe carries one long dragon along a route that writes the time; it lunges for the pearl each minute and swallows it on the hour',
  layouts: ['hub-x4'], look: 'smoke', fps: 60, brightness: 0.35, dither: false,
  frame(ctx) {
    const nowS = ctx.date.getTime() / 1000, M = Math.floor(nowS / 60) * 60, age = nowS - M;
    const T = nowS - 1.7e9;
    const prev = digitsAt(M - 60), next = digitsAt(M);
    const minute = ctx.date.getMinutes(), hourShow = minute === 0 && age < 12;
    const dim = 1 - 0.7 * ctx.night;
    img.fill(0);

    // pearl, lunge, head pose
    const om = 1.25;
    let px = 239.5 + 3.5 * Math.sin(2 * om * T), py = 24 + 7 * Math.sin(om * T);
    let lunge = 0, open = 0.12 + 0.12 * Math.sin(T * 1.7), pearlA = 1, gulp = 0;
    if (age < 0.8) {
      lunge = Math.sin(Math.PI * cl(age / 0.75)) ** 1.5;
      open = age < 0.26 ? kit.lerp(open, 1, eio(age / 0.26)) : Math.max(0, 1 - (age - 0.26) / 0.08) * 0.0 + (age < 0.34 ? 1 - (age - 0.26) / 0.08 : 0);
    }
    const hx = 192 + lunge * 7, hyBase = 24 + 0.25 * (py - 24) + 1.1 * Math.sin(T * 2.6);
    const hy = hyBase - lunge * 2;
    let pearlTip = [px, py], flyPearl = null;
    if (!hourShow) {
      const dodge = age < 1.1 ? Math.sin(Math.PI * cl(age / 1.1)) : 0;
      px += 2 * dodge; py -= 13 * dodge;
      pearlTip = [px, py];
    } else {
      // the catch, the gulp, the long swallow, the spit
      const mouthX = hx + 19, mouthY = hy + 5;
      if (age < 0.3) { const e = eio(age / 0.3); px = kit.lerp(px, mouthX, e); py = kit.lerp(py, mouthY, e); }
      else if (age < 6.7) pearlA = 0;
      gulp = ss(0.3, 0.7, age) * (1 - ss(7.5, 8.5, age));
      if (age > 6.7 && age < 9) {
        const f = cl((age - 6.7) / 2.2), e = eio(f);
        flyPearl = [kit.lerp(3, px, e), kit.lerp(40, py, e) - 52 * f * (1 - f) * 1.0];
        pearlA = 0;
      }
    }
    const blink = hourShow && age > 0.3 && age < 7 ? 0 : Math.max(0, 1 - Math.abs(kit.fract(T / 4.3) - 0.5) * 2 / 0.04) ** 0;
    const blinkAmt = kit.fract(T / 4.3) > 0.97 ? Math.sin(Math.PI * (kit.fract(T / 4.3) - 0.97) / 0.03) : 0;

    // -------- assemble the body: tail, four routes (+ connector), neck
    n = 0;
    pushStrand(TAIL);
    const slotStart = [0, 0, 0, 0];
    const est = TAIL.x.length + 4 * NS + 24 + 40;             // fixed count -> fixed g per sample
    const poleXY = [];
    for (let k = 0; k < 4; k++) {
      slotStart[k] = n;
      const o = GLYPHS[+prev[k]], w = GLYPHS[+next[k]], ch = prev[k] !== next[k] && age < 3.2;
      for (let j = 0; j < NS; j++) {
        let x = w.x[j], y = w.y[j], z = w.z[j];
        if (ch) {
          const p = morphP(age, (n) / est);
          x = morphMix(o.x[j], DIVE.x[j], w.x[j], p); y = morphMix(o.y[j], DIVE.y[j], w.y[j], p); z = morphMix(o.z[j], DIVE.z[j], w.z[j], p);
        }
        push(OX[k] + x, OY + y, z);
      }
      for (let h = 0; h < 2; h++) {
        let ji = w.poles[h] >= 0 ? w.poles[h] : w.poles[1 - h];
        if (ch) {
          const jo = o.poles[h] >= 0 ? o.poles[h] : o.poles[1 - h];
          const p = morphP(age, (slotStart[k] + jo) / est);
          ji = morphMix(jo, DIVE.poles[h], ji, p);
        }
        poleXY.push(slotStart[k] + ji);
      }
      if (CONN[k]) pushStrand(CONN[k], 1);
    }
    const neck = strand([[OX[3] + 34, 52, 0], [188, 50.5, 0.3], [191, 45, 1], [hx - 2, hy + 14, 1], [hx + 2, hy + 4, 1]], 40);
    pushStrand(neck, 1);

    // rest life: a wave runs head to tail; the minute's jolt follows it
    const shockF = age < 2 ? 1 - (age - 0.12) / 1.3 : -9;
    for (let c = 0; c < n; c++) {
      const g = c / n;
      SY[c] += 0.75 * Math.sin(T * 4.4 + SX[c] * 0.05) * (0.4 + 0.6 * Math.min(1, SZ[c]));
      const sh = Math.exp(-(((g - shockF) / 0.035) ** 2));
      SY[c] -= 1.6 * sh;
    }
    let s = 0;
    for (let c = 0; c < n; c++) {
      const a = c > 0 ? c - 1 : c, b = c < n - 1 ? c + 1 : c;
      let tx = SX[b] - SX[a], ty = SY[b] - SY[a];
      const l = Math.hypot(tx, ty) || 1;
      TX[c] = tx / l; TY[c] = ty / l;
      if (c > 0) s += Math.hypot(SX[c] - SX[c - 1], SY[c] - SY[c - 1]);
      SS[c] = s;
    }
    // the swallowed pearl: a lump that runs from the head to the tail
    const sTot = s;
    const sL = hourShow && age > 0.45 && age < 6.8 ? sTot * (1 - eio(cl((age - 0.45) / 6.2))) : -999;
    for (let c = 0; c < n; c++) {
      const z = Math.min(1, SZ[c]);
      SR[c] = 1.7 + 1.7 * z + (sL > -1 ? 2.1 * Math.exp(-(((SS[c] - sL) / 4) ** 2)) : 0);
    }

    // -------- scenery behind the body: lanterns (the colon), poles
    const th1 = 0.07 * Math.sin(T * 1.05) + 0.02 * Math.sin(T * 2.3);
    const c1x = COLON_X + Math.sin(th1) * 15, c1y = Math.cos(th1) * 15 - 1;
    const th2 = th1 + 0.07 * Math.sin(T * 1.05 - 0.9);
    const b1x = c1x + Math.sin(th1) * 5, b1y = c1y + Math.cos(th1) * 5;
    const c2x = b1x + Math.sin(th2) * 12, c2y = b1y + Math.cos(th2) * 12;
    capsule(COLON_X, -1, c1x, c1y - 4.5, 0.8, kit.scale(GOLD, 0.35));
    capsule(b1x, b1y, c2x, c2y - 4.5, 0.8, kit.scale(GOLD, 0.35));
    lantern(c1x, c1y, T, 0, false);
    lantern(c2x, c2y, T, 1, true);

    const dancers = [];
    const stepPh = (x) => T * 2 * Math.PI * 1.25 + x * 0.33;
    const addPole = (fi) => {
      const i0 = Math.floor(fi), f = fi - i0, i1 = Math.min(n - 1, i0 + 1);
      const ax = SX[i0] + (SX[i1] - SX[i0]) * f, ay = SY[i0] + (SY[i1] - SY[i0]) * f;
      capsule(ax, 54.5, ax, ay, 1.1, WOOD);
      dancers.push(ax);
    };
    addPole(4);
    for (const fi of poleXY) addPole(fi);
    addPole(n - 14);
    // the pearl's pole and its dancer
    const pdx = 247.5;
    capsule(pdx, 54.5, pearlTip[0] + (pearlA ? 0 : 0), pearlTip[1] + 2, 1.1, WOOD);

    // -------- the body: z-buffered stamps, then shading
    PRI.fill(-1e9);
    for (let c = 0; c < n; c++) {
      const r = SR[c], reach = r + 1.4, cx = SX[c], cy = SY[c], z = SZ[c];
      const x0 = Math.max(0, Math.floor(cx - reach)), x1 = Math.min(W - 1, Math.ceil(cx + reach));
      const y0 = Math.max(0, Math.floor(cy - reach)), y1 = Math.min(H - 1, Math.ceil(cy + reach));
      const tx = TX[c], ty = TY[c], r2 = reach * reach;
      for (let y = y0; y <= y1; y++) {
        const dy = y - cy;
        for (let x = x0; x <= x1; x++) {
          const dx = x - cx, d2 = dx * dx + dy * dy;
          if (d2 > r2) continue;
          const d = Math.sqrt(d2), pri = z * 4 - d * 0.15, p = y * W + x;
          if (pri <= PRI[p]) continue;
          PRI[p] = pri; PD[p] = d; PR[p] = r; PZ[p] = z;
          PV[p] = -dx * ty + dy * tx; PS[p] = SS[c] + dx * tx + dy * ty;
          PNX[p] = -ty; PNY[p] = tx;
        }
      }
    }
    const Lx = -0.33, Ly = -0.72, Lz = 0.61;
    for (let p = 0; p < N; p++) {
      if (PRI[p] < -1e8) continue;
      const d = PD[p], r = PR[p], z = PZ[p] > 1 ? 1 : PZ[p], cov = cl(r + 0.5 - d), q = 3 * p;
      if (cov <= 0) { if (z > 0.5) { img[q] = 0; img[q + 1] = 0; img[q + 2] = 0; } continue; }
      const vn = cl(PV[p] / r, -1, 1), sp = PS[p];
      const nz = Math.sqrt(1 - vn * vn), dot = PNX[p] * vn * Lx + PNY[p] * vn * Ly + nz * Lz;
      const diff = 0.3 + 0.7 * (dot > 0 ? dot : 0);
      let cr, cg, cb;
      if (vn < -0.6) {
        const tuft = 0.55 + 0.45 * Math.sin(sp * 1.9 + T * 6);
        cr = MANE[0] * tuft; cg = MANE[1] * tuft; cb = MANE[2] * tuft;
      } else if (vn > 0.52) {
        const plate = kit.fract(sp / 2.6) < 0.3 ? 0.45 : 0.8;
        cr = CREAM[0] * plate; cg = CREAM[1] * plate; cb = CREAM[2] * plate;
      } else {
        const row = Math.floor((vn + 0.6) * 2.3), u = sp / 2.4 + row * 0.5, f = u - Math.floor(u);
        if (f < 0.34) { cr = 0.45 * RED[0] + 0.55 * GOLD[0]; cg = 0.45 * RED[1] + 0.55 * GOLD[1]; cb = 0.45 * RED[2] + 0.55 * GOLD[2]; }
        else { cr = RED[0]; cg = RED[1]; cb = RED[2]; }
        const h = kit.hash(Math.floor(u), row, 11), tw = Math.sin(T * 2.3 + h * 60);
        if (tw > 0.93) { const k = (tw - 0.93) * 10; cr += k; cg += 0.8 * k; cb += 0.4 * k; }
      }
      const glint = 0.5 + 0.5 * Math.sin(sp * 0.21 - T * 3.2), spec = dot > 0 ? dot ** 8 * glint * 0.55 : 0;
      cr = cr * diff + GOLD[0] * spec; cg = cg * diff + GOLD[1] * spec; cb = cb * diff + GOLD[2] * spec;
      if (sL > -1) {
        const gl = Math.exp(-(((sp - sL) / 4.5) ** 2)) * 0.9;
        cr += PEARL[0] * gl; cg += PEARL[1] * gl * 0.8; cb += PEARL[2] * gl * 0.85;
      }
      const dk = 0.045 + 0.955 * z * z * cov;
      img[q] += (cr * dk - img[q]) * cov; img[q + 1] += (cg * dk - img[q + 1]) * cov; img[q + 2] += (cb * dk - img[q + 2]) * cov;
    }
    // the tail's tuft
    const tsw = Math.sin(T * 1.7);
    for (let k = 0; k < 4; k++) {
      const an = -2.2 + k * 0.42 + 0.25 * tsw + 0.1 * Math.sin(T * 6 + k), L = 6 + 1.5 * Math.sin(T * 4.2 + k * 1.3) + (hourShow && age > 6.4 && age < 7.4 ? 4 * Math.sin(Math.PI * (age - 6.4)) : 0);
      capsule(SX[0], SY[0], SX[0] + Math.cos(an) * L, SY[0] + Math.sin(an) * L, 2, k % 2 ? MANE : CREAM, 0.9);
    }

    // -------- the troupe, the head, the pearl
    for (const x of dancers) dancer(x, stepPh(x), 0);
    const hop = hourShow && age > 0.3 && age < 1.2 ? 2.5 * Math.sin(Math.PI * (age - 0.3) / 0.45) ** 2 : 0;
    dancer(pdx, stepPh(pdx), Math.abs(hop));
    const tgt = flyPearl || [px, py];
    head(hx, hy, cl(open), tgt[0] - (hx + 11.5), tgt[1] - (hy - 2.8), hourShow && age > 0.3 && age < 7 ? 0 : blinkAmt, T, gulp);
    if (pearlA > 0) pearl(px, py, T, pearlA);
    if (flyPearl) pearl(flyPearl[0], flyPearl[1], T, 1);
    // a huff of smoke from the nose after a miss
    if (!hourShow && age > 0.4 && age < 2.4) {
      const f = (age - 0.4) / 2;
      glow(hx + 28 + f * 6, hy - 2 - f * 9, 2.5 + f * 4, kit.scale(SMOKE, 0.06), 1 - f);
    }

    // -------- firecrackers: lowered at :59, lit at :00
    const sec = ctx.date.getSeconds() + ctx.date.getMilliseconds() / 1000;
    const showStr = minute === 59 || (minute === 0 && age < 4);
    if (showStr) {
      const drop = minute === 59 ? -26 * (1 - eio(cl(sec / 2.5))) : 0;
      for (let st = 0; st < 2; st++) {
        const top = crackerPos(st, 0, drop, T);
        let lowest = 7;
        if (minute === 0) { lowest = -1; for (let k = 0; k < 8; k++) if (age < crackerTime(st, k)) lowest = Math.max(lowest, k); }
        if (lowest >= 0) capsule(STR_X[st], -1, top[0], crackerPos(st, lowest, drop, T)[1], 0.8, kit.scale(GOLD, 0.3));
        for (let k = 0; k <= lowest; k++) {
          const [x, y] = crackerPos(st, k, drop, T), tl = k % 2 ? 0.45 : -0.45;
          capsule(x - 1.6 * Math.cos(tl), y - 1.6 * Math.sin(tl), x + 1.6 * Math.cos(tl), y + 1.6 * Math.sin(tl), 1.8, kit.scale(RED, 0.9));
          disc(x, y, 0.6, GOLD, 0.7);
        }
        if (minute === 0 && lowest >= 0 && age > 0) glow(top[0], crackerPos(st, lowest, drop, T)[1] + 2, 1.5, SPARK, 0.8 + 0.4 * Math.sin(T * 40));
      }
    }
    if (hourShow) {
      for (let st = 0; st < 2; st++) for (let k = 0; k < 8; k++) {
        const [x, y] = crackerPos(st, k, 0, T);
        bang(x, y, age - crackerTime(st, k), st * 8 + k, false);
      }
      for (let k = 0; k < 9; k++) {
        const bx = 24 + 200 * kit.hash(k, 77), bt = 0.25 + k * 0.32 + 0.1 * kit.hash(k, 78);
        bang(bx, 61, age - bt, 100 + k, true);
      }
    }

    // a dark keyline round the head is already drawn; send it all out
    kit.blitGrid(ctx, img, dim);
  },
};
