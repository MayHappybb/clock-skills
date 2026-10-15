// Kinetic Rain — the time hangs in a field of droplets on wires.
//
// After ART+COM's sculpture at Changi: 58 x 34 droplets (1,972), each on its
// own wire from the ceiling, seen in real perspective from below and in
// front, so the near rows are at the top of the glass and the field narrows
// away from us. Every frame each droplet's height is worked out, projected,
// and splatted into a z-buffer; a pixel that lies just behind a nearer edge
// is left dark, so whatever hangs low stands clear of what is behind it.
//
// At rest the droplets sit up at the ceiling; only five rows of it are drawn,
// a 1 px bead on every other droplet, spaced wider towards the viewer by the
// perspective and riding a slow swell, and never within 2 px of a numeral.
// The time is what hangs down: droplets let down five units on their wires.
// The numerals are rain trails (a trail of water along the stroke that
// gathers at its low ends into a drop, which hangs heavier than the trail;
// the 0 is a falling drop), drawn as variable-width strokes and tabulated, so
// each droplet takes its depth from the stroke it is in. The hours hang in
// the near left, the minutes deeper in the field to the right. A droplet
// turned from the lamp shows smaller, so a stroke's shadowed flank breaks into
// beads; a sparse comb of wires runs up from the top of each numeral.
//
// Always: the camera drifts (yaw, tilt, pan), each numeral bobs and swings on
// its wires like a pendulum (its drops a beat behind), every second one
// droplet plinks and a ring runs out through the field, and every few seconds
// a drop runs down each numeral's trail, pulling it lower as it passes.
//
// The minute: from :57.6 a swell rolls across the field from the left; the
// droplets it lets down show on their wires, a curtain of rain. It sweeps the
// old digit away (its droplets spring back up to the ceiling as it reaches
// them) and after :00 the new one is written stroke by stroke, each droplet
// dropping onto its wire with a bounce.
//
// The hour: the whole pattern is swept once round the field like water round
// a drain (droplets only rise and fall; it is the pattern that turns), in the
// field's own proportions so the numerals stretch and squash as they go, the
// middle running ahead so they wind into a spiral and unwind. Spiral arms
// wheel through the ceiling, the old hour is let go just before :00 and the
// new one let down just after, and when it comes to rest a ring runs out from
// the centre. The camera leans out and springs back.
//
// Burn-in: the camera's pan and drift move everything. 23:00-07:00 the panel
// dims (ctx.night).

import { clamp, ease, progress, clockFields, previousMinute } from '../js/kit.js';

const TAU = Math.PI * 2;
const W = 128, H = 64;

// ------------------------------------------------------------ the field
// NX x NZ droplets on a square lattice, 1 world unit apart. World: x right,
// y up (height), z away from the viewer. j = 0 is the far row.
const NX = 58, NZ = 34, N = NX * NZ;
const FX = new Float32Array(N), FZ = new Float32Array(N);
for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
  FX[j * NX + i] = i - (NX - 1) / 2;
  FZ[j * NX + i] = (NZ - 1) / 2 - j;
}

// ------------------------------------------------------------ letterforms
// Each digit is a rain trail in a 10 x 14 box (y down): water running along
// the stroke and gathering, at the low ends, into a drop that hangs heavier
// than the trail. A stroke is a polyline of [x, y, half-width] smoothed with
// Catmull-Rom (closed if it ends where it starts); a drop is [x, y, radius].
const BW = 10, BH = 14;
const S = (...p) => p;
const GLYPHS = {
  0: { s: [S([5, 0.9, 0.8], [8.1, 5.6, 0.95], [8.5, 9.6, 1.1], [5, 13.1, 1.25], [1.5, 9.6, 1.1], [1.9, 5.6, 0.95], [5, 0.9, 0.8])], d: [] },
  1: { s: [S([5.4, 0.8, 0.8], [5.4, 5, 0.95], [5.4, 11.2, 1.1])], d: [[5.4, 12, 1.7]] },
  2: { s: [S([1.9, 3.4, 0.85], [4.8, 1.1, 0.9], [8.2, 3.5, 1.0], [6.8, 7.2, 0.9], [1.7, 12.5, 0.9]), S([1.7, 12.5, 0.9], [7.6, 12.5, 0.85])], d: [[1.9, 3.6, 1.25], [8.2, 12.3, 1.5]] },
  3: { s: [S([1.8, 2.6, 0.85], [5, 1.0, 0.9], [8.0, 3.3, 1.0], [4.8, 6.5, 0.85]), S([4.8, 6.5, 0.85], [8.4, 9.4, 1.1], [5.2, 13, 1.0], [2.2, 11.4, 0.85])], d: [[1.8, 2.7, 1.2], [2.0, 11.2, 1.55]] },
  4: { s: [S([6.8, 1, 0.85], [1.3, 9.6, 0.9]), S([1.3, 9.6, 0.9], [9.1, 9.6, 0.85]), S([6.8, 1, 0.85], [6.8, 11.2, 0.95])], d: [[6.8, 12, 1.55]] },
  5: { s: [S([8.4, 1.3, 0.85], [2.6, 1.3, 0.9]), S([2.6, 1.3, 0.9], [2.2, 6.2, 0.9]), S([2.2, 6.2, 0.9], [5.4, 5.4, 1.0], [8.4, 8.7, 1.1], [6.2, 12.7, 1.0], [2.4, 11.8, 0.85])], d: [[8.5, 1.4, 1.2], [2.1, 11.4, 1.55]] },
  6: { s: [S([7.8, 1.6, 0.85], [4.2, 3.6, 0.95], [1.7, 8.4, 1.05], [4.6, 13, 1.15], [8.3, 10, 1.05], [5.6, 6.5, 0.9], [2.0, 8.3, 0.85])], d: [[7.9, 1.7, 1.25]] },
  7: { s: [S([1.4, 1.4, 0.85], [8.6, 1.4, 0.9], [5.6, 6.8, 0.95], [4.4, 11.2, 0.9])], d: [[1.4, 1.6, 1.2], [4.2, 12, 1.55]] },
  8: { s: [S([5, 6.5, 0.85], [2.1, 3.8, 0.9], [5, 1.0, 0.85], [7.9, 3.8, 0.9], [5, 6.5, 0.85], [1.6, 9.8, 1.05], [5, 13.1, 1.15], [8.4, 9.8, 1.05], [5, 6.5, 0.85])], d: [] },
  9: { s: [S([8.3, 4.8, 0.9], [5, 7.4, 0.9], [1.7, 4.4, 1.0], [5, 1, 1.0], [8.4, 4.6, 1.05], [7.2, 9.2, 0.95], [4.6, 11.6, 0.9])], d: [[3.7, 12, 1.55]] },
};

function catmull(pts, steps = 10) {
  const out = [];
  const n = pts.length;
  const closed = n > 3 && pts[0][0] === pts[n - 1][0] && pts[0][1] === pts[n - 1][1];
  const P = (k) => (closed ? pts[((k % (n - 1)) + (n - 1)) % (n - 1)] : pts[clamp(k, 0, n - 1)]);
  for (let k = 0; k < n - 1; k++) {
    const p0 = P(k - 1), p1 = P(k), p2 = P(k + 1), p3 = P(k + 2);
    for (let s = 0; s < steps; s++) {
      const t = s / steps, t2 = t * t, t3 = t2 * t;
      const c = (a, b, cc, d) => 0.5 * (2 * b + (-a + cc) * t + (2 * a - 5 * b + 4 * cc - d) * t2 + (-a + 3 * b - 3 * cc + d) * t3);
      out.push([c(p0[0], p1[0], p2[0], p3[0]), c(p0[1], p1[1], p2[1], p3[1]), p1[2] + (p2[2] - p1[2]) * t]);
    }
  }
  out.push(pts[n - 1]);
  return out;
}

// Tabulate each digit at TR samples per unit: INK, 0..1, how far into the
// stroke a point is (1 on the centre line); HANG, how heavy it hangs (a drop
// more than the trail); ORD, 0..1, when the pen reaches it as it is written.
const TR = 4, TW = BW * TR + 1, TH = BH * TR + 1;
function buildDigit(d) {
  const segs = [];
  let total = 0;
  for (const st of GLYPHS[d].s) {
    const p = catmull(st);
    for (let k = 1; k < p.length; k++) {
      const l = Math.hypot(p[k][0] - p[k - 1][0], p[k][1] - p[k - 1][1]);
      segs.push([p[k - 1][0], p[k - 1][1], p[k - 1][2], p[k][0], p[k][1], p[k][2], total, l]);
      total += l;
    }
  }
  // a drop is reached when the pen reaches the nearest point of its stroke
  const drops = GLYPHS[d].d.map(([cx, cy, r]) => {
    let best = 1e9, o = 0;
    for (const [ax, ay, , bx, by, , s0, l] of segs) {
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
      const u = l2 ? clamp(((cx - ax) * dx + (cy - ay) * dy) / l2, 0, 1) : 0;
      const e = Math.hypot(cx - ax - u * dx, cy - ay - u * dy);
      if (e < best) { best = e; o = (s0 + u * l) / total; }
    }
    return [cx, cy, r, o];
  });
  const INK = new Float32Array(TW * TH), ORD = new Float32Array(TW * TH), HANG = new Float32Array(TW * TH);
  for (let jy = 0; jy < TH; jy++) for (let ix = 0; ix < TW; ix++) {
    const x = ix / TR, y = jy / TR;
    let best = -1e9, ord = 0, hang = 1;
    for (const [ax, ay, aw, bx, by, bw, s0, l] of segs) {
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
      const u = l2 ? clamp(((x - ax) * dx + (y - ay) * dy) / l2, 0, 1) : 0;
      const e = Math.hypot(x - ax - u * dx, y - ay - u * dy);
      const w = aw + (bw - aw) * u;
      const v = (w - e) / w;
      if (v > best) { best = v; ord = (s0 + u * l) / total; }
    }
    for (const [cx, cy, r, o] of drops) {
      const v = (r - Math.hypot(x - cx, y - cy)) / r;
      if (v > 0 && v + 0.2 > best) { best = Math.max(best, v); hang = 1.12; ord = o; }
    }
    INK[jy * TW + ix] = best > 0 ? Math.sqrt(clamp(best * 1.6, 0, 1)) : 0;
    ORD[jy * TW + ix] = ord;
    HANG[jy * TW + ix] = hang;
  }
  return { INK, ORD, HANG };
}
const DIG = Array.from({ length: 10 }, (_, d) => buildDigit(d));
function sampleInk(d, x, y) {
  if (x < 0 || y < 0 || x > BW || y > BH) return 0;
  return DIG[d].INK[Math.round(y * TR) * TW + Math.round(x * TR)];
}
function sampleHang(d, x, y) {
  return DIG[d].HANG[Math.round(clamp(y, 0, BH) * TR) * TW + Math.round(clamp(x, 0, BW) * TR)];
}
function sampleOrd(d, x, y) {
  return DIG[d].ORD[Math.round(clamp(y, 0, BH) * TR) * TW + Math.round(clamp(x, 0, BW) * TR)];
}

// Where each digit hangs: [i0, j of its top row, droplets per unit across,
// per unit deep]. From below, the near rows are at the top of the glass, so
// the hours hang in the near left of the field and the minutes in the far
// right, drawn deeper in the field so perspective does not flatten them.
const SLOTS = [[3, 32, 1.0, 1.0], [14, 32, 1.0, 1.0], [25, 20, 1.45, 1.45], [41, 20, 1.45, 1.45]];

// ------------------------------------------------------------ motion helpers
const smooth = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
/** Step response of a damped spring, 0 -> 1, from rest at s = 0. */
function spring(s, zeta, w) {
  if (s <= 0) return 0;
  const wd = w * Math.sqrt(1 - zeta * zeta);
  return 1 - Math.exp(-zeta * w * s) * (Math.cos(wd * s) + ((zeta * w) / wd) * Math.sin(wd * s));
}
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const digitsOf = (f) => [...`${f.hh}${f.mm}`].map(Number);

// ------------------------------------------------------------ camera
const F = 100;   // focal length, px

const PX = new Float32Array(N), PY = new Float32Array(N), PZ = new Float32Array(N);
const AX = new Float32Array(N), AY = new Float32Array(N), AZ = new Float32Array(N);
const FR = new Float32Array(N), FTH = new Float32Array(N);
for (let k = 0; k < N; k++) { FR[k] = Math.hypot(FX[k], FZ[k]); FTH[k] = Math.atan2(FZ[k], FX[k]); }
const WX = new Float32Array(NX), WZ = new Float32Array(NZ), WD = new Float32Array(NX + NZ), RING = new Float32Array(12);
const RH = new Float32Array(N), SW = new Float32Array(N), GY = new Float32Array(N), HT = new Float32Array(N), INK = new Float32Array(N), PRES = new Float32Array(N);

// A z-buffered splat: each pixel keeps the nearest thing that covers it.
const ZB = new Float32Array(W * H), CB = new Uint8Array(W * H), MASK = new Uint8Array(W * H), ROWM = new Uint8Array(W);
const CEIL_ROWS = [31, 25, 19, 13, 7];
function splat(cx, cy, r, z) {
  const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(W - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(H - 1, Math.ceil(cy + r));
  const r2 = r * r;
  for (let y = y0; y <= y1; y++) {
    const dy = y + 0.5 - cy;
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx, q = y * W + x;
      if (dx * dx + dy * dy <= r2 && z < ZB[q]) { ZB[q] = z; CB[q] = 1; }
    }
  }
}
function wire(x0, y0, z0, x1, y1, z1) {
  const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)));
  for (let s = 0; s <= n; s++) {
    const u = n ? s / n : 0;
    const x = Math.floor(x0 + (x1 - x0) * u), y = Math.floor(y0 + (y1 - y0) * u);
    if (x < 0 || x >= W || y < 0 || y >= H) continue;
    const q = y * W + x, z = z0 + (z1 - z0) * u;
    if (z < ZB[q]) { ZB[q] = z; CB[q] = 1; }
  }
}

const DEP = 5;                    // how far a digit hangs below the ceiling plane
const RUN_EVERY = 7.3, RUN_T = 1.4;   // a drop runs down each digit's trail
const EA = NX / 2, EB = NZ / 2;   // the field's half-extents
// The lamp, below the field and to the left (the face of the hanging relief
// is its underside: y down towards the viewer).
const LX = -0.55, LY = 0.7, LZ = 0.45;

export default {
  name: 'Kinetic Rain',
  blurb: 'A field of 1,972 droplets on wires seen from below: the time hangs in it as rain-trail numerals; a curtain of rain sweeps the minute, and the hour swirls round the field like water down a drain.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  driver: 'full',
  frame(g, { date, fields: f, oled, night }) {
    const T = date.getTime() / 1000, sec = f.sec;
    // The turn is centred on :00: from :50 the next minute is the target.
    const late = sec >= 50;
    const from = late ? f : previousMinute(date);
    const to = late ? clockFields(new Date(date.getTime() + 60000)) : f;
    const tau = late ? sec - 60 : sec;
    const A = digitsOf(from), B = digitsOf(to);
    const hour = to.m === 0 && tau > -4 && tau < 4;

    // ---- camera: always drifting; on the hour it leans out and springs back
    let yaw = 0.15 * Math.sin(TAU * T / 23) + 0.05 * Math.sin(TAU * T / 9.1);
    let elev = 0.9 + 0.07 * Math.sin(TAU * T / 17), dist = 56;
    if (hour) {
      // lean out as the swirl winds up, and spring back after :00
      const out = smooth(progress(tau, -3.6, -0.8)), back = spring(tau - 0.1, 0.4, 3.4);
      const sw = out * (1 - back);
      yaw += 0.3 * sw; elev += 0.1 * sw; dist += 7 * sw;
    }
    const cy = Math.cos(yaw), sy = Math.sin(yaw), ce = Math.cos(elev), se = Math.sin(elev);
    // the camera also wanders sideways and in and out, so nothing rests on the glass
    const panX = 3.4 * Math.sin(TAU * T / 41) + 0.9 * Math.sin(TAU * T / 13.7), panZ = 2.8 * Math.sin(TAU * T / 53) + 0.8 * Math.sin(TAU * T / 11.3);

    // ---- the seconds: each second a droplet plinks and a ring runs out from it
    for (let b = 0; b < 3; b++) {
      const n = Math.floor(T) - b, age = T - n;
      RING[b * 4] = (hash(n) - 0.5) * (NX - 8); RING[b * 4 + 1] = (hash(n + 0.5) - 0.5) * (NZ - 6);
      RING[b * 4 + 2] = 9 * age; RING[b * 4 + 3] = 2.6 * Math.exp(-1.4 * age) * smooth(age / 0.15);
    }
    // the idle swell, separable: per column, per row, per diagonal
    for (let i = 0; i < NX; i++) WX[i] = 0.5 * Math.sin((i - (NX - 1) / 2) * 0.13 + T * 1.1);
    for (let j = 0; j < NZ; j++) WZ[j] = Math.cos(((NZ - 1) / 2 - j) * 0.11 - T * 0.7);
    for (let q = 0; q < NX + NZ; q++) WD[q] = 0.35 * Math.sin((q - NZ - (NX - 1) / 2 + (NZ - 1) / 2) * 0.21 - T * 1.7);
    // the hour: the whole time is swept once round the field like water
    // round a drain, the middle running ahead so the digits wind into a
    // spiral and unwind again; the new hour is let down at :00 while it is
    // wound, and when it comes to rest a ring runs out from the centre
    const hu = progress(tau, -1.7, 1.7);
    const swirl = hour && hu > 0 && hu < 1;
    const PHI = TAU * ease.inOutCubic(hu), TWIST = 1.1 * Math.sin(Math.PI * hu);
    const whirl = hour ? Math.sin(Math.PI * hu) : 0;
    const ringAge = tau - 1.5, ringOn = hour && ringAge > 0 && ringAge < 3.2;
    // ---- the minute: a swell rolls across the field from the left
    const crestX = -NX / 2 - 8 + (NX + 16) * progress(tau, -2.5, -0.4);
    const crestOn = !hour && tau > -2.6 && tau < 0;

    for (let k = 0; k < N; k++) {
      const i = k % NX, j = (k / NX) | 0, x = FX[k], z = FZ[k];
      let h = WX[i] * WZ[j] + WD[i - j + NZ];
      for (let b = 0; b < 3; b++) {
        const rx = x - RING[b * 4], rz = z - RING[b * 4 + 1];
        const d = Math.sqrt(rx * rx + rz * rz) - RING[b * 4 + 2];
        if (d > -4 && d < 4) h -= RING[b * 4 + 3] * Math.exp(-d * d * 0.35) * Math.cos(d * 1.2);
      }
      if (crestOn) {
        const d = x - crestX + 0.25 * z;
        if (d > -30 && d < 12) h -= 4 * Math.exp(-d * d * 0.05) + (d > 0 ? 0 : 0.8 * Math.exp(d * 0.2) * Math.sin(d * 0.8));
      }
      if (hour) {
        const r = FR[k];
        if (whirl > 0) h -= 1.6 * whirl * Math.min(1, r / 6) * Math.max(0, Math.sin(2 * FTH[k] - r * 0.3 - 2 * PHI));
        if (ringOn) { const d = r - 15 * ringAge; if (d > -5 && d < 5) h -= 2.6 * Math.exp(-1.1 * ringAge) * Math.exp(-d * d * 0.25) * Math.cos(d * 0.9); }
      }
      // the digits
      let ink = 0, pres = 0, hang = 1, slot = 0, gy = 99;
      // where on the pattern this droplet is: on the hour the pattern turns
      let fi = i, fj = j;
      if (swirl) {
        // turned in the field's own proportions, so the digits stay on it,
        // stretching and squashing as they go round
        const ex = x / EA, ez = z / EB, er = Math.hypot(ex, ez);
        const ph = -(PHI + TWIST * Math.max(0, 1 - er)), c = Math.cos(ph), sn = Math.sin(ph);
        fi = (ex * c - ez * sn) * EA + (NX - 1) / 2; fj = (NZ - 1) / 2 - (ex * sn + ez * c) * EB;
      }
      for (let s = 0; s < 4; s++) {
        const [ci, cj, sc, sz] = SLOTS[s];
        const dx = (fi - ci) / sc, dy = (cj - fj) / sz;
        if (dx < -0.5 || dx > BW + 0.5 || dy < -0.5 || dy > BH + 0.5) continue;
        const a = A[s], b = B[s];
        let va = sampleInk(a, dx, dy), vb = sampleInk(b, dx, dy);
        va = va > 0.3 ? va : 0; vb = vb > 0.3 ? vb : 0;
        let p, v, hg;
        if (a === b) {
          v = va; p = va ? 1 : 0; hg = sampleHang(a, dx, dy);
          // every few seconds a drop runs down the trail, pulling each droplet
          // a little lower as it passes
          if (va) {
            const ru = (T + s * 1.9) / RUN_EVERY, ph = (ru - Math.floor(ru)) * RUN_EVERY / RUN_T;
            if (ph < 1.15) { const d = sampleOrd(a, dx, dy) - ph; hg += 0.32 * Math.exp(-d * d * 260); }
          }
        }
        else {
          // the old digit is let go as the swell reaches it (on the hour, just
          // before :00, from the middle out)
          const tGo = hour ? -0.6 + 0.01 * FR[k] : -2.5 + 2.1 * (x + NX / 2 + 8) / (NX + 16);
          let pa = va ? 1 - spring(tau - tGo, 0.6, 12) : 0;
          if (pa < 0.12) pa = 0;          // back at the ceiling: gone, well before :00
          // the new one is written stroke by stroke, each droplet dropping on its wire
          const tIn = (hour ? 0.02 + 0.012 * FR[k] : 0.05) + (hour ? 0.5 : 1.0) * sampleOrd(b, dx, dy);
          const pb = vb ? spring(tau - tIn, 0.35, 11) : 0;
          if (pb > Math.abs(pa)) { p = pb; v = vb; hg = sampleHang(b, dx, dy); } else { p = pa; v = va; hg = sampleHang(a, dx, dy); }
        }
        if (v > ink) { ink = v; pres = p; hang = hg; slot = s; gy = dy; }
      }
      INK[k] = ink; PRES[k] = pres; GY[k] = gy;
      // each digit bobs on its wires, and its drops swing a little behind it
      const bob = 0.45 * Math.sin(T * 2.1 + slot * 1.9) + (hang > 1 ? 0.5 * Math.sin(T * 2.1 + slot * 1.9 - 0.9) : 0);
      RH[k] = -DEP * hang * (0.85 + 0.15 * ink) * clamp(pres, 0, 1);
      HT[k] = h * (1 - 0.5 * clamp(pres, 0, 1)) - (DEP * hang * (0.85 + 0.15 * ink) + bob) * pres;
      // and swings on them like a pendulum, the drops a beat behind
      SW[k] = pres > 0.04 ? 0.55 * pres * Math.sin(T * 2.7 + slot * 2.3 - (hang > 1 ? 0.7 : 0)) : 0;
    }

    // ---- project
    for (let k = 0; k < N; k++) {
      const wx = FX[k] + SW[k], x = wx * cy - FZ[k] * sy + panX, z = wx * sy + FZ[k] * cy + panZ, y = HT[k];
      // camera below the field, looking up and forward
      const zc = y * se + z * ce + dist, yc = y * ce - z * se;
      PX[k] = W / 2 + F * x / zc; PY[k] = H / 2 + 1 - F * yc / zc; PZ[k] = zc;
      // where its wire meets the ceiling
      const ax = FX[k] * cy - FZ[k] * sy + panX, az = FX[k] * sy + FZ[k] * cy + panZ, za = 0.6 * se + az * ce + dist;
      AX[k] = W / 2 + F * ax / za; AY[k] = H / 2 + 1 - F * (0.6 * ce - az * se) / za; AZ[k] = za;
    }

    // ---- draw
    ZB.fill(1e9); CB.fill(0);
    for (let k = 0; k < N; k++) {
      const i = k % NX, j = (k / NX) | 0, p = PRES[k];
      if (p > 0.04) {
        const r = (0.35 + 0.45 * INK[k]) * (F / PZ[k]) * (0.6 + 0.4 * clamp(p, 0, 1));
        // lit by how the surface of the hanging relief faces the lamp
        // (the relief's own shape, not the swell it rides on, so the shading
        // belongs to the letter)
        const hx = RH[i < NX - 1 ? k + 1 : k] - RH[i > 0 ? k - 1 : k];
        const hz = RH[j > 0 ? k - NX : k] - RH[j < NZ - 1 ? k + NX : k];
        const lam = (hx * LX + LY * 2 + hz * LZ) / Math.sqrt(hx * hx + 4 + hz * hz);
        // a droplet turned from the lamp catches less of it and shows smaller, so
        // the shadowed flank of a stroke breaks into beads
        splat(PX[k], PY[k], lam > 0.15 ? r : r * 0.62, PZ[k]);
        // its wire, shown for the nearest hanging droplet of each column of a
        // digit's upper part, so the strokes hang from a comb of wires
        if (i % 4 === 1 && GY[k] < 5 && j < NZ - 1 && PRES[k + NX] <= 0.04) {
          let top = true;
          for (let jj = j + 2; jj < Math.min(NZ, j + 14); jj++) if (PRES[jj * NX + i] > 0.04) { top = false; break; }
          // (seen nearly end on, a wire is lost against the strokes: only
          // wires that run up the glass are drawn)
          if (top && Math.abs(AX[k] - PX[k]) < 0.35 * (PY[k] - AY[k])) wire(PX[k], PY[k] - r, PZ[k] + 0.2, AX[k], AY[k], AZ[k]);
        }
      } else if (HT[k] < -1.6) {
        // a droplet let down well below the ceiling shows, on its wire: a
        // passing wave is a curtain of rain
        if (((i + j) & 1) === 0) {
          const r = (F / PZ[k]) * 0.4 * clamp((-HT[k] - 1.6) / 2.5, 0.4, 1);
          splat(PX[k], PY[k], r, PZ[k]);
          if ((i & 1) === 0) wire(PX[k], PY[k] - r, PZ[k] + 0.2, AX[k], AY[k], AZ[k]);
        }
      }
    }
    // depth edges: a pixel just behind a nearer edge stays dark, so the
    // hanging droplets stand clear of whatever is behind them
    const buf = g.buf;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const q = y * W + x;
      if (!CB[q]) continue;
      const z = ZB[q] - 1.5;
      if ((x > 0 && ZB[q - 1] < z) || (x < W - 1 && ZB[q + 1] < z) || (y > 0 && ZB[q - W] < z) || (y < H - 1 && ZB[q + W] < z)) continue;
      buf[q] = 1;
    }
    // the ceiling: five rows of beads, a whole number of droplets apart in
    // depth, so perspective spaces them wider towards the viewer; they ride
    // the swell. A bead is kept 2 px clear of anything hanging.
    for (let x = 0; x < W; x++) {
      let run = -9;
      for (let y = 0; y < H; y++) { if (buf[y * W + x]) run = y; MASK[y * W + x] = y - run <= 2 ? 1 : 0; }
      run = 99;
      for (let y = H - 1; y >= 0; y--) { if (buf[y * W + x]) run = y; if (run - y <= 2) MASK[y * W + x] = 1; }
    }
    for (let y = 0; y < H; y++) {
      const row = y * W;
      for (let x = 0; x < W; x++) ROWM[x] = MASK[row + x];
      for (let x = 0; x < W; x++) {
        if (ROWM[x]) continue;
        for (let d = 1; d <= 2; d++) if ((x >= d && ROWM[x - d]) || (x + d < W && ROWM[x + d])) { MASK[row + x] = 1; break; }
      }
    }
    for (const j of CEIL_ROWS) for (let i = j % 4 === 1 ? 1 : 0; i < NX; i += 2) {
      const k = j * NX + i;
      if (PRES[k] > 0.04 || HT[k] < -1.6) continue;
      const x = Math.floor(PX[k]), y = Math.floor(PY[k]);
      if (x < 0 || x >= W || y < 0 || y >= H || MASK[y * W + x]) continue;
      buf[y * W + x] = 1;
    }
    oled.contrast(0xcf + (0x20 - 0xcf) * night);
  },
};
