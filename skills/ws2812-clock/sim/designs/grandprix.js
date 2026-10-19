// Grand Prix: a night race where the circuits ARE the time. Each numeral is
// a floodlit street circuit, asphalt with white edge lines and red/white
// kerbs on every hairpin, and F1 cars lap it flat out: braking into the
// hairpins, side by side down the straights, sparks off the plank. The hour
// is two big circuits on the left; a packed grandstand waves flags in the
// middle; the minutes are two smaller circuits under the start gantry.
//
// Minute turn: a safety-car period. The gantry flashes amber, the old
// circuit's floodlight banks shut down one after another, then the safety
// car drives the new circuit's line, its floodlights striking behind it
// (metal-halide violet warming to white), with the field queued up on the
// grid; it peels off and the cars launch in tyre smoke.
// Hour: the race is run. Chequered flags wave across every circuit, the
// crowd goes up, the gantry lights five reds one per second... lights out:
// every circuit blacks out for a blink and floods on as the new time while
// the whole field launches, and a gold lap of honour chases round the
// tracks.
import { makeSet } from './grandprix-track.js';

const W = 256, H = 64;
const img = new Float32Array(W * H * 3);
const pad = (n) => String(n).padStart(2, '0');

const BIG = makeSet(1.06, 4.6), SMALL = makeSet(0.82, 3.9);
// slot: circuit set, x, y, cars, car scale
const SLOTS = [
  { set: BIG, x: 1, y: 0, cars: 3, cs: 1.6 },
  { set: BIG, x: 50, y: 0, cars: 3, cs: 1.6 },
  { set: SMALL, x: 164, y: 14, cars: 2, cs: 1.35 },
  { set: SMALL, x: 207, y: 14, cars: 2, cs: 1.35 },
];
const GANTRY = { x0: 176, x1: 242, y: 6, n: 5 };
const STAND = { x0: 104, x1: 160 };

const lin = (h) => { const n = parseInt(h.slice(1), 16), f = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return [f(n >> 16), f((n >> 8) & 255), f(n & 255)]; };
// liveries: body, wings/nose, helmet
const LIVERY = [
  ['#ff1026', '#ffffff', '#ffd400'], ['#ff7000', '#1d5bff', '#ffffff'], ['#b8c4d0', '#00e0c8', '#202020'],
  ['#1f3cff', '#ff2a40', '#ffffff'], ['#00b060', '#d8ff40', '#ffe000'], ['#ffd000', '#202020', '#ff3010'],
].map((l) => l.map(lin));
const SAFETY = [lin('#d8dce0'), lin('#303438'), lin('#ffb000')];
const TYRE = [0.008, 0.008, 0.009];
const SPARK_A = [1, 0.75, 0.3], SPARK_B = [1, 0.28, 0.03];
const AMBER = [1, 0.42, 0.0], RED = [1, 0.02, 0.01];

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const hash = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// ----------------------------------------------------------- the timing
// minute turn (safety car)
const OFF0 = 0.05, OFF1 = 0.75;        // old banks shut down, in track order
const SC0 = 0.8, SC1 = 2.35;           // safety car drives the new line
const LAUNCH_MIN = 2.45;
// hour (lights out at :00)
const LAUNCH_HOUR = 0.12;

/** Where the safety car is along the new line (0..1) at minute age: eased in and out. */
const scProg = (age) => { const t = Math.min(1, Math.max(0, (age - SC0) / (SC1 - SC0))); return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t); };

// ------------------------------------------------------------- light state
// mode: 0 steady, 1 minute shut-down, 2 minute strike, 3 hour cut, 4 hour strike
const NB = 11;
const LS = { L: 1, r: 1, g: 1, b: 1 };
function strikeTint(k, now, bank) {
  const flut = k < 0.55 ? 0.8 + 0.2 * Math.sin(now * 47 + bank * 2.3) : 1;
  LS.L = (0.3 + 0.7 * k * k) * flut;
  const v = 1 - k;
  LS.r = 1 - 0.4 * v; LS.g = 1 - 0.6 * v; LS.b = 1 + 0.6 * v;
}
function light(mode, sk, age, now, prog) {
  LS.L = 1; LS.r = 1; LS.g = 1; LS.b = 1;
  if (mode === 0) return;
  const bank = Math.min(NB - 1, Math.floor(sk * NB));
  if (mode === 1) { const t0 = OFF0 + (bank / NB) * (OFF1 - OFF0 - 0.2); LS.L = 1 - smooth(t0, t0 + 0.2, age); return; }
  if (mode === 3) { LS.L = 1 - smooth(0, 0.1, age); return; }
  let k;
  if (mode === 2) k = (prog * 1.04 - sk) / 0.16;                           // behind the safety car
  else { const t0 = 0.1 + (bank / NB) * 0.45; k = (age - t0) / 0.4; }      // hour: banks strike fast
  if (k <= 0) { LS.L = 0; return; }
  if (k >= 1) return;
  strikeTint(k, now, bank);
}

// ------------------------------------------------------------- lap lookup
const Q = { x: 0, y: 0, hx: 1, hy: 0, sk: 0, v: 0, i: 0 };
function lapAt(lap, tau) {
  const T = lap.T, tc = lap.tc;
  let t = tau % T; if (t < 0) t += T;
  let lo = 0, hi = lap.n;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (tc[mid] <= t) lo = mid; else hi = mid; }
  const j = (lo + 1) % lap.n, f = (t - tc[lo]) / (tc[lo + 1] - tc[lo]);
  Q.x = lap.x[lo] + (lap.x[j] - lap.x[lo]) * f; Q.y = lap.y[lo] + (lap.y[j] - lap.y[lo]) * f;
  Q.hx = lap.hx[lo] + (lap.hx[j] - lap.hx[lo]) * f; Q.hy = lap.hy[lo] + (lap.hy[j] - lap.hy[lo]) * f;
  const hl = Math.hypot(Q.hx, Q.hy) || 1; Q.hx /= hl; Q.hy /= hl;
  Q.sk = lap.sk[lo]; Q.v = lap.v[lo]; Q.i = lo + f;
}
/** A point on the centre line at fraction u (for the safety car). */
function lineAt(R, u) {
  const f = Math.min(1, Math.max(0, u)) * (R.n - 1), i = Math.min(R.n - 2, Math.floor(f)), g = f - i;
  Q.x = R.cx[i] + (R.cx[i + 1] - R.cx[i]) * g; Q.y = R.cy[i] + (R.cy[i + 1] - R.cy[i]) * g;
  const a = Math.max(0, i - 2), b = Math.min(R.n - 1, i + 3);
  const dx = R.cx[b] - R.cx[a], dy = R.cy[b] - R.cy[a], L = Math.hypot(dx, dy) || 1;
  Q.hx = dx / L; Q.hy = dy / L;
}

// car schedule: a = seconds since this circuit was laid; D = launch delay
const G_C = 0.9, GRID = 0.3;
function tauOf(a, D, k, slot) {
  const x = a - D;
  const g = x <= 0 ? 0 : x - G_C * (1 - Math.exp(-x / G_C));
  const eps = 0.006 * ((slot * 3 + k * 5) % 7 - 3);
  const w = 0.17 + 0.05 * k + 0.03 * slot;
  const wob = x <= 0 ? 0 : 0.6 * Math.sin(w * x + slot * 1.7 + k * 2.4) * (1 - Math.exp(-x / 5));
  return g * (1 + eps) - k * GRID + wob;
}

// --------------------------------------------------------------- drawing
function addPx(x, y, r, g, b) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const q = 3 * (y * W + x); img[q] += r; img[q + 1] += g; img[q + 2] += b;
}
/** A dot that glides between pixels (bilinear). */
function dot(x, y, c, a) {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const r = c[0] * a, g = c[1] * a, b = c[2] * a;
  addPx(x0, y0, r * (1 - fx) * (1 - fy), g * (1 - fx) * (1 - fy), b * (1 - fx) * (1 - fy));
  addPx(x0 + 1, y0, r * fx * (1 - fy), g * fx * (1 - fy), b * fx * (1 - fy));
  addPx(x0, y0 + 1, r * (1 - fx) * fy, g * (1 - fx) * fy, b * (1 - fx) * fy);
  addPx(x0 + 1, y0 + 1, r * fx * fy, g * fx * fy, b * fx * fy);
}
function blob(x, y, rad, c, a) {
  const x0 = Math.floor(x - rad), x1 = Math.ceil(x + rad), y0 = Math.floor(y - rad), y1 = Math.ceil(y + rad);
  for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
    const d = Math.hypot(px - x, py - y) / rad;
    if (d >= 1) continue;
    const f = (1 - d * d) ** 2 * a;
    addPx(px, py, c[0] * f, c[1] * f, c[2] * f);
  }
}

/** One circuit: the numeral's raster, lit by its floodlight state. */
function drawCircuit(R, ox, oy, mode, age, now, prog, flag, gold) {
  const gw = R.w, gh = R.h;
  for (let py = 0; py < gh; py++) {
    const Y = oy + py;
    if (Y < 0 || Y >= H) continue;
    for (let px = 0; px < gw; px++) {
      const p = py * gw + px, m = R.m[p];
      if (m <= 0) continue;
      const X = ox + px;
      if (X < 0 || X >= W) continue;
      const sk = R.sk[p];
      light(mode, sk, age, now, prog);
      if (LS.L <= 0) continue;
      let r = R.r[p] * LS.L * LS.r, g = R.g[p] * LS.L * LS.g, b = R.b[p] * LS.L * LS.b;
      if (flag > 0) {
        // the chequered flag, rippling across the circuit
        const wx = X + 1.4 * Math.sin(Y * 0.3 + now * 5.5), wy = Y + 0.9 * Math.sin(X * 0.2 - now * 4.1);
        const chk = (Math.floor(wx / 2.5) + Math.floor(wy / 2.5)) & 1;
        const shade = 0.6 + 0.4 * Math.sin(X * 0.15 - now * 7 + Y * 0.1);
        const v = (chk ? 0.42 * shade : 0.006) * m * LS.L;
        r += (v - r) * flag; g += (v - g) * flag; b += (v * 1.03 - b) * flag;
      }
      if (gold > 0) {
        let u = sk * 2 - gold * 1.6; u -= Math.floor(u);
        const pl = Math.exp(-(((u - 0.5) * 11) ** 2)) * Math.sin(Math.PI * gold) * m * LS.L;
        r += 0.6 * pl; g += 0.38 * pl; b += 0.06 * pl;
      }
      const q = 3 * (Y * W + X);
      img[q] += r; img[q + 1] += g; img[q + 2] += b;
    }
  }
}

const SUB = [-1 / 3, 0, 1 / 3];
/** A top-down F1 car centred at (x, y), nose along (hx, hy), scale cs. */
function drawCar(x, y, hx, hy, liv, vis, cs) {
  const body = liv[0], wing = liv[1], helm = liv[2], inv = 1 / cs, R = 5 * cs + 1;
  const x0 = Math.floor(x - R), x1 = Math.ceil(x + R), y0 = Math.floor(y - R), y1 = Math.ceil(y + R);
  for (let py = Math.max(0, y0); py <= Math.min(H - 1, y1); py++) for (let px = Math.max(0, x0); px <= Math.min(W - 1, x1); px++) {
    let sr = 0, sg = 0, sb = 0, hit = 0;
    for (let a = 0; a < 3; a++) for (let c = 0; c < 3; c++) {
      const dx = px + SUB[c] - x, dy = py + SUB[a] - y;
      const u = (dx * hx + dy * hy) * inv, v = Math.abs(-dx * hy + dy * hx) * inv;
      let col = null;
      if (u > 3.3 && u < 4.4 && v < 1.85) col = wing;                                  // front wing
      else if (u > 1.7 && u < 3.0 && v > 0.95 && v < 1.95) col = TYRE;                 // front tyres
      else if (u > 0.9 && u <= 3.3 && v < 0.62) col = wing;                            // nose
      else if (u > -0.1 && u < 0.9 && v < 0.5) col = helm;                             // helmet
      else if (u > -2.7 && u <= 1.4 && v < 1.25 - 0.18 * Math.max(0, u)) col = body;   // sidepods
      else if (u > -3.5 && u < -2.0 && v > 0.95 && v < 2.05) col = TYRE;               // rear tyres
      else if (u > -4.3 && u <= -2.7 && v < 1.7) col = body;                           // rear wing
      if (!col) continue;
      sr += col[0]; sg += col[1]; sb += col[2]; hit++;
    }
    if (!hit) continue;
    const q = 3 * (py * W + px), k = hit / 9, iv = (0.8 * vis) / hit;
    img[q] += (sr * iv - img[q]) * k; img[q + 1] += (sg * iv - img[q + 1]) * k; img[q + 2] += (sb * iv - img[q + 2]) * k;
  }
}

const CAR = { x: new Float32Array(3), y: new Float32Array(3), hx: new Float32Array(3), hy: new Float32Array(3), i: new Float32Array(3), sk: new Float32Array(3), tau: new Float64Array(3) };
/** The field on one circuit. */
function drawField(slot, S, D, ox, oy, a, launch, mode, age, now, prog) {
  const lap = D.lap, C = CAR, n = S.cars;
  for (let k = 0; k < n; k++) {
    const tau = tauOf(a, launch, k, slot);
    lapAt(lap, tau);
    C.x[k] = Q.x; C.y[k] = Q.y; C.hx[k] = Q.hx; C.hy[k] = Q.hy; C.i[k] = Q.i; C.sk[k] = Q.sk; C.tau[k] = tau;
  }
  const road = S.set.road;
  for (let k = 0; k < n; k++) {
    // side by side when two cars are close: one pulls out to pass
    let lat = 0;
    for (let j = 0; j < n; j++) {
      if (j === k) continue;
      let d = Math.abs(C.i[k] - C.i[j]) * 0.5; d = Math.min(d, lap.n * 0.5 - d);
      if (d < 9) { const bmp = (1 - (d / 9) ** 2) ** 2; lat += (k < j ? 1 : -1) * 0.3 * road * bmp; }
    }
    const x = ox + C.x[k] - C.hy[k] * lat, y = oy + C.y[k] + C.hx[k] * lat;
    light(mode, C.sk[k], age, now, prog);
    const vis = Math.min(1, LS.L);
    if (vis <= 0.01) continue;
    // sparks off the plank on the fast bits
    for (let s = 1; s <= 9; s++) {
      const te = C.tau[k] - s * 0.022, tick = Math.floor(te * 45);
      if (hash(tick, slot * 7 + k) < 0.5) continue;
      lapAt(lap, te);
      if (Q.v < 50) continue;
      const sx = ox + Q.x - Q.hx * 3.6 * S.cs + (hash(tick, 99) - 0.5) * s * 0.35;
      const sy = oy + Q.y - Q.hy * 3.6 * S.cs + (hash(tick, 77) - 0.5) * s * 0.35;
      dot(sx, sy, s < 3 ? SPARK_A : SPARK_B, 0.9 * (1 - s / 10) ** 1.6 * vis);
    }
    drawCar(x, y, C.hx[k], C.hy[k], LIVERY[(slot * 3 + k) % LIVERY.length], vis, S.cs);
    // braking into a corner: the discs glow orange and the rain light burns
    lapAt(lap, C.tau[k] + 0.12);
    const vAhead = Q.v; lapAt(lap, C.tau[k]);
    const brake = Math.min(1, Math.max(0, (Q.v - vAhead) / 14));
    const blink = (Math.floor(now * 4 + k * 1.3 + slot) & 1) ? 0.8 : 0.1;
    dot(x - C.hx[k] * 4.6 * S.cs, y - C.hy[k] * 4.6 * S.cs, RED, Math.max(k ? blink : 0.3, brake) * vis);
    if (brake > 0.05) {
      const nx = -C.hy[k] * 1.5 * S.cs, ny = C.hx[k] * 1.5 * S.cs, fx = C.hx[k] * 2.3 * S.cs, fy = C.hy[k] * 2.3 * S.cs;
      dot(x + fx + nx, y + fy + ny, SPARK_B, 0.7 * brake * vis);
      dot(x + fx - nx, y + fy - ny, SPARK_B, 0.7 * brake * vis);
    }
  }
  // launch: tyre smoke off the grid
  const ls = a - launch;
  if (ls > -0.05 && ls < 1.8) {
    for (let k = 0; k < n; k++) {
      lapAt(lap, -k * GRID);
      for (let pf = 0; pf < 3; pf++) {
        const tt = ls - pf * 0.12;
        if (tt < 0) continue;
        const rad = 1.5 + 3 * tt, al = 0.1 * Math.exp(-tt * 2.2);
        blob(ox + Q.x - Q.hx * (4 + 6 * tt) + (pf - 1) * 1.4, oy + Q.y - Q.hy * (4 + 6 * tt) - 1.5 * tt, rad, [0.7, 0.74, 0.82], al);
      }
    }
  }
}

/** The safety car on the new line, amber light bar flashing. */
function drawSafety(S, R, ox, oy, age, now) {
  if (age < SC0 - 0.1 || age > SC1 + 0.35) return;
  const p = scProg(age);
  const fade = smooth(SC0 - 0.1, SC0 + 0.1, age) * (1 - smooth(SC1, SC1 + 0.35, age));
  lineAt(R, p * 1.04);
  const x = ox + Q.x, y = oy + Q.y;
  drawCar(x, y, Q.hx, Q.hy, SAFETY, fade, S.cs * 1.05);
  const fl = Math.floor(now * 9) & 1;
  const sx = -Q.hy * 1.1 * S.cs, sy = Q.hx * 1.1 * S.cs;
  dot(x + sx, y + sy, AMBER, (fl ? 1 : 0.15) * fade);
  dot(x - sx, y - sy, AMBER, (fl ? 0.15 : 1) * fade);
  blob(x, y, 6, AMBER, 0.05 * fade);
}

// ------------------------------------------------------------ grandstand
const FANS = [];
for (let row = 0; row < 8; row++) {
  const y = 20 + row * 5.2, lean = row * 1.2;
  for (let x = STAND.x0 + 4 + lean + (row & 1) * 1.5; x < STAND.x1 - 3 - (7 - row) * 0.4; x += 3.1) {
    const h = hash(Math.round(x * 10), row);
    FANS.push({ x, y, ph: h * 6.28, team: hash(row, Math.round(x * 7)) < 0.75 ? Math.floor((x - STAND.x0) / 14) % LIVERY.length : Math.floor(hash(row, Math.round(x * 3)) * LIVERY.length), flag: h > 0.8 ? 1 : 0, sp: 1.5 + h * 1.6 });
  }
}
const SKIN = lin('#a07050');
function drawStand(now, hype) {
  // the roof and its floodlight pylons
  for (let x = STAND.x0 + 2; x <= STAND.x1 - 2; x++) dot(x, 11, [0.12, 0.125, 0.14], 1);
  for (const px of [STAND.x0 + 5, STAND.x1 - 6]) {
    for (let y = 4; y < 11; y++) dot(px, y, [0.04, 0.04, 0.05], 1);
    for (let k = -2; k <= 2; k++) dot(px + k * 1.6, 3, [0.9, 0.92, 1], 0.32);
  }
  for (let row = 0; row < 8; row++) {
    const y = 23 + row * 5.2;
    for (let x = STAND.x0 + 3 + row * 1.2; x <= STAND.x1 - 2 - (7 - row) * 0.4; x++) dot(x, y, [0.02, 0.021, 0.026], 1);
  }
  for (let i = 0; i < FANS.length; i++) {
    const f = FANS[i];
    const bob = (0.35 + 1.4 * hype) * Math.max(0, Math.sin(now * f.sp * (1 + hype) + f.ph));
    const shirt = LIVERY[f.team][0];
    const a = 0.16 + 0.12 * hype;
    dot(f.x, f.y - bob, SKIN, a * 0.7);
    dot(f.x, f.y + 1.3 - bob, shirt, a);
    dot(f.x + 0.9, f.y + 1.3 - bob, shirt, a * 0.6);
    // camera flashes when the race ends and starts
    if (hype > 0.2 && hash(Math.floor(now * 12), i) < 0.012 * hype) blob(f.x, f.y - 1, 2.2, [1, 1, 1], 0.9);
    if (f.flag || hype > 0.5) {
      // a flag on a stick, waving
      const sw = Math.sin(now * (4 + f.sp) + f.ph);
      const fx = f.x + 0.8 * sw, fy = f.y - 3.4 - bob;
      const fc = LIVERY[(f.team + 2) % LIVERY.length][f.flag ? 0 : 1];
      dot(f.x + 0.3 * sw, f.y - 1.6 - bob, [0.3, 0.3, 0.3], a * 0.5);
      for (let k = 0; k < 3; k++) { dot(fx + k * (1 + 0.3 * sw), fy + 0.4 * k * sw, fc, a * 1.3); dot(fx + k * (1 + 0.3 * sw), fy + 1 + 0.4 * k * sw, fc, a * 1.1); }
    }
  }
}

/** The start gantry over the minutes: five lamps. */
function drawGantry(now, red, amber, out) {
  const g = GANTRY;
  for (let x = g.x0 - 5; x <= g.x1 + 5; x++) { dot(x, g.y - 4.5, [0.1, 0.1, 0.11], 1); dot(x, g.y + 4.5, [0.05, 0.05, 0.06], 1); }
  for (let j = 0; j < g.n; j++) {
    const cx = g.x0 + ((g.x1 - g.x0) * j) / (g.n - 1), cy = g.y;
    blob(cx, cy, 3.4, [0.03, 0.012, 0.01], 1);
    if (j < red) { blob(cx, cy, 4.2, RED, 0.95); blob(cx, cy, 1.6, [1, 0.4, 0.3], 0.5); }
    else if (amber > 0 && (j & 1) === 0) {
      const fl = ((Math.floor(now * 3) + j / 2) & 1) ? 1 : 0.1;
      blob(cx, cy, 4.0, AMBER, 0.9 * amber * fl);
    }
    if (out > 0) blob(cx, cy, 2.5, RED, 0.25 * out);
  }
}

// ------------------------------------------------------------- the frame
const lastChange = (h, m, sec) => [(h % 10) * 3600 + m * 60 + sec, m * 60 + sec, (m % 10) * 60 + sec, sec];
const prevSpan = (h) => [h >= 10 ? 36000 : 14400, 3600, 600, 60];

export default {
  name: 'Grand Prix',
  blurb: 'night race: floodlit street circuits shaped as the time, F1 cars lapping them; safety car each minute, lights out on the hour',
  layouts: ['hub-x4'], look: 'smoke', fps: 60, brightness: 0.36, dither: true,
  frame(ctx) {
    const d = ctx.date, now = d.getTime() / 1000;
    const h = d.getHours(), mi = d.getMinutes(), sec = d.getSeconds() + d.getMilliseconds() / 1000;
    const M = Math.floor(now / 60) * 60, age = now - M;
    const cur = pad(h) + pad(mi);
    const pd = new Date((M - 60) * 1000), prev = pad(pd.getHours()) + pad(pd.getMinutes());
    const isHour = mi === 0;
    const since = lastChange(h, mi, sec), span = prevSpan(h);
    const dim = 1 - 0.55 * ctx.night;
    img.fill(0);

    // the hour: chequered flags over the last seconds; gold lap after
    const flag = mi === 59 && age > 53.5 ? smooth(53.5, 54.8, age) : 0;
    const gold = isHour && age > 0.9 && age < 5.5 ? (age - 0.9) / 4.6 : 0;
    const prog = scProg(age);

    for (let s = 0; s < 4; s++) {
      const S = SLOTS[s], ox = S.x, oy = S.y;
      const changed = prev[s] !== cur[s];
      // on the hour every circuit goes dark for the start, changed or not
      const inTurn = (changed || isHour) && age < (isHour ? 1.2 : SC1 + 0.2);
      const Dn = S.set.digits[+cur[s]];
      const newMode = !inTurn ? 0 : isHour ? 4 : 2;
      if (inTurn) {
        const Do = S.set.digits[+prev[s]], oldMode = isHour ? 3 : 1;
        drawCircuit(Do.raster, ox, oy, oldMode, age, now, prog, isHour ? 1 - smooth(0, 0.1, age) : 0, 0);
        drawField(s, S, Do, ox, oy, since[s] + span[s], -1e9, oldMode, age, now, prog);
      }
      drawCircuit(Dn.raster, ox, oy, newMode, age, now, prog, flag, gold);
      // on the hour every field relaunches, so its cars count from :00
      if (isHour) drawField(s, S, Dn, ox, oy, age, LAUNCH_HOUR, newMode, age, now, prog);
      else drawField(s, S, Dn, ox, oy, since[s], LAUNCH_MIN, newMode, age, now, prog);
      if (inTurn && !isHour) drawSafety(S, Dn.raster, ox, oy, age, now);
    }

    // crowd hype through the hour show
    const hype = mi === 59 && age > 50 ? smooth(50, 56, age) : isHour ? 1 - smooth(4, 9, age) : 0;
    drawStand(now, hype);
    let red = 0, amber = 0, out = 0;
    if (mi === 59 && age >= 55) red = Math.min(5, 1 + Math.floor(age - 55));
    if (isHour) out = 1 - smooth(0, 0.35, age);
    else amber = smooth(0, 0.2, age) * (1 - smooth(SC1, SC1 + 0.4, age));
    drawGantry(now, red, amber, out);

    const G = ctx.layout.grid, o = ctx.out, idx = G.idx;
    for (let p = 0; p < idx.length; p++) {
      const i = idx[p];
      if (i < 0) continue;
      o[3 * i] = img[3 * p] * dim; o[3 * i + 1] = img[3 * p + 1] * dim; o[3 * i + 2] = img[3 * p + 2] * dim;
    }
  },
};
