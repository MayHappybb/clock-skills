// Abyss: a 64 x 128 column of deep water, twilight blue at the top, black
// below. The time is four jellyfish. Each numeral IS one animal: its bell
// is the digit's crown and its glowing oral arms trail down into the rest
// of the stroke (6 is a 9 living upside down, like Cassiopea). Hours are two
// big cyan jellies up in the twilight; minutes, two smaller violet ones in
// the midnight zone. Bells jet-pulse (contract fast, relax slow), the arms
// follow with a delay down their length, a flash of light runs down each
// arm after every stroke, marine snow falls through it all.
//
// Minute: the old jelly gives one hard stroke and jets up into the dark,
// arms streaming; the new one rises out of the deep, small and far, and
// unfurls. Hour: a bioluminescent wave climbs the column, every jelly
// flinches and flashes as it passes, a shoal of comb jellies rises through
// with rainbow combs, and an anglerfish drifts across behind its lure.
import * as kit from '../js/kit.js';
import { GLYPHS } from './jellyfish-glyphs.js';

const W = 64, H = 128, N = W * H;
const img = new Float32Array(3 * N);
// per group (0 hours, 1 minutes): stroke coverage, light along it, bell fill, glow
const COV = [new Float32Array(N), new Float32Array(N)];
const LUM = [new Float32Array(N), new Float32Array(N)];
const FIL = [new Float32Array(N), new Float32Array(N)];
const THR = [new Float32Array(N), new Float32Array(N)], TLM = [new Float32Array(N), new Float32Array(N)];
const TMP = new Float32Array(N), GLO = new Float32Array(N);
const GRAIN = Float32Array.from({ length: N }, (_, p) => 0.6 + 0.8 * kit.hash(p % W, (p / W) | 0, 31) * kit.hash(p % W, (p / W) | 0, 32));

const COL = [kit.hex('#42e4ff'), kit.hex('#9a72ff')];
const WHITE = [0.85, 0.95, 1];

// where each digit lives: origin (px) of its 10 x 20 unit cell, px per unit, stroke radius (px)
const CELLS = [
  { ox: 1.0, oy: 1.5, sc: 3.0, r: 1.85, g: 0 },
  { ox: 33.0, oy: 4.5, sc: 3.0, r: 1.85, g: 0 },
  { ox: 7.5, oy: 81.0, sc: 2.2, r: 1.45, g: 1 },
  { ox: 34.5, oy: 83.5, sc: 2.2, r: 1.45, g: 1 },
];
const PERIOD = [3.7, 4.3, 3.3, 3.9], PHASE = [0.1, 0.55, 0.3, 0.8];
const ARM_C = 11;       // units/s: how fast motion travels down an arm
const SHOW = 16, WAVE0 = 0.3, WAVE_V = 34;  // hour show length (s), wave start and climb (px/s)
const LEAVE = 1.0, ARRIVE0 = 0.6, ARRIVE = 2.2;  // turn timing (s)

const pad = (n) => String(n).padStart(2, '0');
const hhmm = (d) => pad(d.getHours()) + pad(d.getMinutes());
const sstep = (a, b, x) => { const t = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a); return t * t * (3 - 2 * t); };
const easeOut = (t) => 1 - (1 - t) ** 3;

/** Bell contraction 0..1 at pulse phase p (0..1): fast squeeze, slow relax. */
function squeeze(p) {
  if (p < 0.1) { const k = p / 0.1; return k * k * (3 - 2 * k); }
  return Math.exp(-(p - 0.1) / 0.16);
}
/** Bob (px, up negative) at phase p: the jet lifts it, then it sinks back slowly. */
function bob(p) { return -1.3 * (p < 0.3 ? sstep(0.04, 0.3, p) : 1 - sstep(0.3, 1, p)); }

// ------------------------------------------------------------ one animal
/**
 * The motion of one jelly instance at wall time T (s): pose(dt) gives its
 * displacement (px) and contraction dt seconds ago, which is what an arm
 * point s units from the root shows (dt = s / ARM_C).
 */
function makeInst(slot, digit, T, mode, u, hourAge) {
  const P = PERIOD[slot], ph = PHASE[slot] * P;
  const cell = CELLS[slot];
  let sc = cell.sc, alpha = 1, reveal = 1;
  if (mode === 'leave') { sc *= 1 - 0.4 * sstep(0, 1.0, u); alpha = 1 - sstep(0.05, 0.95, u); }
  if (mode === 'arrive') {
    const v = kit.clamp((u - ARRIVE0) / ARRIVE);
    sc *= 0.5 + 0.5 * easeOut(v); alpha = sstep(0, 0.45, v); reveal = 0.25 + 0.75 * sstep(0.1, 0.85, v);
  }
  const wave = hourAge >= 0 ? hourAge - WAVE0 - (H + 10 - (cell.oy + 20 * cell.sc * 0.4)) / WAVE_V : -99; // when the hour wave reaches it
  const inst = { slot, digit, cell, sc, alpha, reveal, mode, u };
  inst.pose = (dt, o) => {
    const t = T - dt, p = kit.fract((t + ph) / P);
    let c = squeeze(p), y = bob(p);
    let x = 0.9 * Math.sin(t * kit.TAU / 23 + slot * 1.7) + 0.4 * Math.sin(t * kit.TAU / 9.3 + slot);
    y += 0.7 * Math.sin(t * kit.TAU / 29 + slot * 2.3);
    const uu = u - dt;
    if (mode === 'leave' && uu > 0) {
      const k = uu / 0.25; c = Math.max(c, uu < 0.25 ? k * k * (3 - 2 * k) : Math.exp(-(uu - 0.25) / 0.3));
      y -= 24 * (1 - Math.exp(-uu * 2.2)) * sstep(0, 0.15, uu);
    }
    if (mode === 'arrive') {
      const v = kit.clamp((uu - ARRIVE0) / ARRIVE);
      y += 18 * (1 - easeOut(v)); c *= sstep(0.6, 1, v);
    }
    const w = wave - dt;   // the hour wave makes every jelly flinch
    if (w > 0 && w < 3) c = Math.max(c, w < 0.12 ? w / 0.12 : Math.exp(-(w - 0.12) / 0.25));
    o.x = x; o.y = y; o.c = c; o.pa = p * P;
    return o;
  };
  return inst;
}

const po = { x: 0, y: 0, c: 0, pa: 0 };
// scratch for one jelly's sampled outline
const PX = new Float32Array(512), PY = new Float32Array(512), PR = new Float32Array(512), PL = new Float32Array(512);

/** Coverage of a tapered capsule a-b, max-combined into the group's buffers. */
function capsule(cov, lum, ax, ay, bx, by, ra, rb, la, lb, alpha) {
  const rm = Math.max(ra, rb) + 1;
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - rm)), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + rm));
  const y0 = Math.max(0, Math.floor(Math.min(ay, by) - rm)), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by) + rm));
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-9;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      let t = ((x - ax) * dx + (y - ay) * dy) / L2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = x - ax - t * dx, ey = y - ay - t * dy;
      const d = Math.sqrt(ex * ex + ey * ey), r = ra + (rb - ra) * t;
      let k = r + 0.5 - d;
      if (k <= 0) continue;
      k = (k > 1 ? 1 : k) * alpha;
      const p = y * W + x;
      if (k > cov[p]) { cov[p] = k; lum[p] = la + (lb - la) * t; }
    }
  }
}
function polyline(cov, lum, n, alpha) {
  for (let k = 0; k + 1 < n; k++) capsule(cov, lum, PX[k], PY[k], PX[k + 1], PY[k + 1], PR[k], PR[k + 1], PL[k], PL[k + 1], alpha);
}

/** Draw one jelly into its group's buffers. */
function drawJelly(inst, T, flash) {
  const G = GLYPHS[inst.digit], b = G.bell, cell = inst.cell, gi = cell.g;
  const cov = COV[gi], lum = LUM[gi], fil = FIL[gi];
  const sc = inst.sc, r0 = cell.r * (0.75 + 0.25 * sc / cell.sc);
  // the cell is scaled about its bell centre
  const cx0 = cell.ox + b.cx * cell.sc, cy0 = cell.oy + b.cy * cell.sc;
  const X = (ux) => cx0 + (ux - b.cx) * sc, Y = (uy) => cy0 + (uy - b.cy) * sc;
  const now = inst.pose(0, po);
  const c = now.c, bx = now.x, by = now.y, pa = now.pa;
  const rx = b.rx * (1 - 0.14 * c), ry = b.ry * (1 + 0.1 * c), m = b.m * (1 + 0.35 * c);
  const cr = Math.cos(b.rot), sr = Math.sin(b.rot);
  const rim = (0.9 + 0.5 * c) * flash;
  // dome (and margin, when closed): the digit's crown
  let n = 0;
  const NB = 28;
  for (let k = 0; k <= NB; k++) {
    const th = Math.PI * k / NB;
    const lx = rx * Math.cos(th), ly = -ry * Math.sin(th);
    PX[n] = X(b.cx + lx * cr - ly * sr) + bx; PY[n] = Y(b.cy + lx * sr + ly * cr) + by;
    // a light runs over the dome after each stroke
    PR[n] = r0; PL[n] = rim * (1 + 0.35 * Math.exp(-((th / Math.PI - kit.fract(pa * 0.6)) ** 2) / 0.01)); n++;
  }
  polyline(cov, lum, n, inst.alpha);
  if (b.closed) {
    n = 0;
    for (let k = 0; k <= NB; k++) {
      const th = Math.PI + Math.PI * k / NB;
      const lx = rx * Math.cos(th), ly = -m * Math.sin(th);
      PX[n] = X(b.cx + lx * cr - ly * sr) + bx; PY[n] = Y(b.cy + lx * sr + ly * cr) + by;
      PR[n] = r0 * 0.9; PL[n] = rim * 0.9; n++;
    }
    polyline(cov, lum, n, inst.alpha);
  }
  // bell body: translucent, brighter toward the rim, with radial canals
  {
    const ext = Math.max(rx, ry, m) * sc + 3;
    const ccx = X(b.cx) + bx, ccy = Y(b.cy) + by;
    const x0 = Math.max(0, Math.floor(ccx - ext)), x1 = Math.min(W - 1, Math.ceil(ccx + ext));
    const y0 = Math.max(0, Math.floor(ccy - ext)), y1 = Math.min(H - 1, Math.ceil(ccy + ext));
    const a = inst.alpha * flash;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const qx = (x - ccx) / sc, qy = (y - ccy) / sc;
        const lx = qx * cr + qy * sr, ly = -qx * sr + qy * cr;
        const e2 = (lx / rx) ** 2 + (ly / (ly < 0 ? ry : m)) ** 2;
        if (e2 >= 1) continue;
        const e = Math.sqrt(e2);
        const ang = Math.atan2(ly, lx);
        let f = 0.17 + 0.36 * e * e * e + 0.08 * Math.max(0, Math.cos(8 * ang)) * e;
        if (ly < 0) f += 0.1 * Math.exp(-((e - 0.45) ** 2) / 0.01) * (0.5 + 0.5 * Math.cos(4 * ang));  // gonad rings
        fil[y * W + x] += f * (1 - sstep(0.85, 1, e)) * a * (1 + 0.6 * c);
      }
    }
  }
  // fine marginal tentacles: dim threads hanging from the bell's rim
  {
    const NF = b.rx > 3.5 ? 5 : b.rx > 2.5 ? 3 : 2, thr = THR[gi];
    for (let j = 0; j < NF; j++) {
      const fx = -0.85 + 1.7 * (j + 0.5) / NF;
      const lx0 = fx * rx, ly0 = m * Math.sqrt(Math.max(0, 1 - fx * fx)) * 0.7;
      const len = 4.5 + 3.5 * kit.hash(inst.slot * 7 + j, 7);
      n = 0;
      for (let k = 0; k <= 8; k++) {
        const s = len * k / 8;
        const q = inst.pose(s / ARM_C, po);
        const sway = 0.5 * (s / len) * Math.sin(1.7 * s - 2.6 * T + j * 1.9);
        const lx = lx0 * (1 - 0.14 * q.c) + sway, ly = ly0 + s;
        PX[n] = X(b.cx + lx * cr - ly * sr) + q.x; PY[n] = Y(b.cy + lx * sr + ly * cr) + q.y;
        PR[n] = 0.42 * (1 - 0.4 * k / 8); PL[n] = 1 - k / 9; n++;
      }
      polyline(thr, TLM[gi], n, inst.alpha * inst.reveal);
    }
  }
  // oral arms: each point shows the bell's motion from s / ARM_C seconds ago
  for (const arm of G.arms) {
    const pts = arm.pts, L = arm.len, Lr = L * inst.reveal;
    n = 0;
    for (let k = 0; k < pts.length; k += 3) {
      const ux = pts[k], uy = pts[k + 1], s = pts[k + 2];
      if (s > Lr) break;
      const q = inst.pose(s / ARM_C, po);
      const fr = s / L;
      // the root rides the squeezing bell; the squeeze travels down the arm
      const sx = (pts[0] - b.cx) * -0.14 * q.c * (1 - fr) * cr;
      // gentle undulation, growing toward the tip
      const wv = 0.22 * fr * Math.sin(1.3 * s - 2.1 * T + inst.slot);
      let tx = 0, ty = 0;
      if (k + 3 < pts.length) { tx = pts[k + 3] - ux; ty = pts[k + 4] - uy; } else { tx = ux - pts[k - 3]; ty = uy - pts[k - 2]; }
      const tl = Math.hypot(tx, ty) || 1;
      PX[n] = X(ux + sx - wv * ty / tl) + q.x; PY[n] = Y(uy + wv * tx / tl) + q.y;
      const tipT = Math.min(1, (Lr - s) / 2.5 + 0.35);
      PR[n] = r0 * (1 - 0.3 * fr) * tipT * (1 + 0.16 * Math.sin(2.6 * s - 3.1 * T + inst.slot) * fr);
      // a flash runs down the arm after each stroke
      PL[n] = flash * (0.85 + 0.55 * Math.exp(-((s - pa * 9) ** 2) / 5)); n++;
    }
    if (n > 1) polyline(cov, lum, n, inst.alpha);
  }
}

// ------------------------------------------------------------ the water
const SNOW = Array.from({ length: 46 }, (_, k) => ({
  x: kit.hash(k, 1) * W, y: kit.hash(k, 2) * (H + 10), v: 0.6 + 1.6 * kit.hash(k, 3),
  a: 0.02 + 0.06 * kit.hash(k, 4) ** 2, w: 0.3 + kit.hash(k, 5), ph: kit.hash(k, 6) * 7,
}));
/** Add colour c * a at a sub-pixel position (bilinear). */
function dot(x, y, c, a) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
    const gx = xi + i, gy = yi + j;
    if (gx < 0 || gy < 0 || gx >= W || gy >= H) continue;
    const w = (i ? fx : 1 - fx) * (j ? fy : 1 - fy) * a, p = 3 * (gy * W + gx);
    img[p] += c[0] * w; img[p + 1] += c[1] * w; img[p + 2] += c[2] * w;
  }
}
/** A soft round glow at (x, y), radius r px. */
function glow(x, y, r, c, a) {
  const x0 = Math.max(0, Math.floor(x - r)), x1 = Math.min(W - 1, Math.ceil(x + r));
  const y0 = Math.max(0, Math.floor(y - r)), y1 = Math.min(H - 1, Math.ceil(y + r));
  for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) {
    const d2 = ((gx - x) ** 2 + (gy - y) ** 2) / (r * r);
    if (d2 >= 1) continue;
    const f = (1 - d2) ** 2 * a, p = 3 * (gy * W + gx);
    img[p] += c[0] * f; img[p + 1] += c[1] * f; img[p + 2] += c[2] * f;
  }
}

function water(T) {
  for (let y = 0; y < H; y++) {
    const d = Math.max(0, 1 - y / 92), b = d * d;
    for (let x = 0; x < W; x++) {
      // faint shafts from far above, slanting and slowly shifting
      const u = x + 0.4 * y;
      const ray = y < 70 ? (0.5 + 0.5 * Math.sin(u * 0.21 + T * 0.23) * Math.sin(u * 0.083 - T * 0.11 + 1.3)) * (1 - y / 70) ** 2 : 0;
      const p = 3 * (y * W + x);
      img[p] = 0.0015 * b; img[p + 1] = 0.009 * b + 0.006 * ray; img[p + 2] = 0.03 * b + 0.012 * ray;
    }
  }
}

function blur(src, dst) {   // two box passes, radius 2, separable: a soft halo
  for (let pass = 0; pass < 2; pass++) {
    const a = pass ? dst : src;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let s = 0;
        for (let k = -2; k <= 2; k++) { const xx = x + k; if (xx >= 0 && xx < W) s += a[y * W + xx]; }
        TMP[y * W + x] = s / 5;
      }
    }
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let s = 0;
        for (let k = -2; k <= 2; k++) { const yy = y + k; if (yy >= 0 && yy < H) s += TMP[yy * W + x]; }
        dst[y * W + x] = s / 5;
      }
    }
  }
}

// ------------------------------------------------------------ the hour show
const RAINBOW = Array.from({ length: 64 }, (_, k) => kit.hsv(k / 64, 0.7, 1));
const SHOAL = Array.from({ length: 6 }, (_, k) => ({
  x: 7 + 50 * ((k + 0.5 * kit.hash(k, 11)) / 6), d: 0.6 + 2.8 * kit.hash(k, 12), v: 11 + 6 * kit.hash(k, 13), ph: kit.hash(k, 14) * 6,
  s: 1.0 + 0.35 * kit.hash(k, 15),
}));
function combJelly(x, y, T, k, a, sz) {
  const rx = 3.0 * sz, ry = 5.4 * sz;
  const x0 = Math.max(0, Math.floor(x - rx - 1)), x1 = Math.min(W - 1, Math.ceil(x + rx + 1));
  const y0 = Math.max(0, Math.floor(y - ry - 1)), y1 = Math.min(H - 1, Math.ceil(y + ry + 1));
  const spin = T * 1.3 + k;
  for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) {
    const lx = (gx - x) / rx, ly = (gy - y) / ry, e2 = lx * lx + ly * ly;
    if (e2 >= 1.15) continue;
    const p = 3 * (gy * W + gx);
    const body = (0.025 + 0.16 * e2 * e2) * (1 - sstep(0.9, 1.15, e2)) * a;
    img[p] += 0.4 * body; img[p + 1] += 0.7 * body; img[p + 2] += body;
    // comb rows: meridians seen side on, iridescence running down them
    let best = 0;
    for (let r = 0; r < 8; r++) {
      if (Math.cos(spin + r * Math.PI / 4) < 0) continue;   // only the rows on the near side
      const mx = Math.sin(spin + r * Math.PI / 4) * Math.sqrt(Math.max(0, 1 - ly * ly));
      const q = Math.exp(-((lx - mx) ** 2) / 0.012) * (Math.abs(ly) < 0.85 ? 1 : 0);
      if (q > best) best = q;
    }
    if (best < 0.05 || e2 > 1) continue;
    const c = RAINBOW[Math.floor(kit.fract(ly * 0.35 - T * 1.8 + k * 0.21) * 64)];
    const f = best * a * 0.42;
    img[p] += c[0] * f; img[p + 1] += c[1] * f; img[p + 2] += c[2] * f;
  }
}

/** The anglerfish, facing left, centred at (x, y); only its lure gives light. */
const LURE = kit.hex('#9fe8ff');
const AS = 1.7;   // px per fish unit
/** Where the lure is and how bright: it lights the fish and the jellies it passes. */
function lureOf(x, y, T) {
  return [x - 15 * AS + Math.sin(T * 1.7) * 1.2, y - 8 * AS + Math.sin(T * 2.3) * 0.8, 0.8 + 0.2 * Math.sin(T * 5.1) * Math.sin(T * 1.3)];
}
function angler(x, y, T, a) {
  const S = AS;
  const [lx, ly, pulse] = lureOf(x, y, T);
  const x0 = Math.max(0, Math.floor(x - 12 * S)), x1 = Math.min(W - 1, Math.ceil(x + 16 * S));
  const y0 = Math.max(0, Math.floor(y - 8 * S)), y1 = Math.min(H - 1, Math.ceil(y + 8 * S));
  const gape = 0.36 + 0.08 * Math.sin(T * 0.8);
  for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) {
    const fx = (gx - x) / S, fy = (gy - y) / S;
    const eb = (fx / 9.5) ** 2 + (fy / 6.5) ** 2;
    const jaw = ((fx + 3.5) / 7) ** 2 + ((fy - 3.2) / 3) ** 2;
    const tail = fx > 8 && fx < 14.5 && Math.abs(fy + 0.5) < (fx - 8) * 0.75;
    // the gape: a wedge cut in from the left
    const wedge = Math.abs(fy - 1.6) - (-1 - fx) * gape;
    if (!((eb < 1 || jaw < 1 || tail) && !(fx < -1 && wedge < 0))) continue;
    const edge = (eb > 0.72 && eb < 1.3 && jaw > 0.8) || (tail && Math.abs(fy + 0.5) > (fx - 8) * 0.5) ? 1 : 0;
    const dl = (gx - lx) ** 2 + (gy - ly) ** 2;
    const lit = pulse / (1 + dl / 160);
    let v = (0.09 + 0.3 * edge) * lit;
    // fangs along the gape
    if (fx < -1.5 && wedge < 1.1 && ((gx + gy) & 1)) v = 0.9 * lit;
    const p = 3 * (gy * W + gx);
    img[p] += 0.5 * v * a; img[p + 1] += 0.75 * v * a; img[p + 2] += 0.9 * v * a;
  }
  // eye: a cold glint
  glow(x - 4.5 * S, y - 2.6 * S, 1.8, [0.6, 0.9, 1], 0.6 * a);
  // the illicium arching forward, and the esca
  for (let k = 0; k <= 16; k++) {
    const t = k / 16, u = 1 - t;
    const px = u * u * (x - 3 * S) + 2 * u * t * (x - 8 * S) + t * t * lx, py = u * u * (y - 6 * S) + 2 * u * t * (y - 13 * S) + t * t * ly;
    dot(px, py, LURE, 0.12 * a);
  }
  glow(lx, ly, 16, LURE, 0.3 * a * pulse);
  glow(lx, ly, 5, LURE, 2.4 * a * pulse);
  glow(lx, ly, 2.6, [1, 1, 1], 2.5 * a * pulse);
}

// ------------------------------------------------------------ the face
const insts = [];
export default {
  name: 'Abyss',
  blurb: 'four deep-sea jellyfish are the time: bells crown the numerals, glowing arms trail into their strokes; at the hour a light wave climbs the column',
  layouts: ['hub-tall'], look: 'smoke', fps: 60, brightness: 0.4, dither: true,
  frame(ctx) {
    const date = ctx.date, T = date.getTime() / 1000, Tm = T % 86400;
    const M = Math.floor(T / 60) * 60, age = T - M;
    const cur = hhmm(date), prev = hhmm(new Date((M - 60) * 1000));
    const hourAge = date.getMinutes() === 0 && age < SHOW ? age : -1;

    for (let g = 0; g < 2; g++) { COV[g].fill(0); LUM[g].fill(0); FIL[g].fill(0); THR[g].fill(0); }
    water(Tm);
    // the hour wave: a band of light climbing the column
    const wy = hourAge >= 0 ? H + 10 - WAVE_V * (hourAge - WAVE0) : -999;
    const glowOn = hourAge >= 0 ? sstep(WAVE0, WAVE0 + 0.5, hourAge) * (1 - sstep(7, 11, hourAge)) : 0;
    const flashAt = (y) => (hourAge >= 0 ? 1 + 2.2 * Math.exp(-(((y - wy) / 10) ** 2)) * glowOn + 0.3 * (y > wy ? Math.exp(-(y - wy) / 45) : 0) * glowOn : 1);

    // the anglerfish's crossing, and its lure (lights jellies as it passes)
    const at = hourAge - 2.5;
    const fish = hourAge >= 0 && at > 0 && at < 14 ? [94 - 9 * at, 73 + 1.5 * Math.sin(at * 0.9), sstep(0, 1, at) * (1 - sstep(13, 14, at))] : null;
    const lure = fish ? lureOf(fish[0], fish[1], Tm) : null;
    insts.length = 0;
    for (let k = 0; k < 4; k++) {
      if (prev[k] !== cur[k] && age < LEAVE + ARRIVE0 + ARRIVE) {
        if (age < LEAVE) insts.push(makeInst(k, prev[k], Tm, 'leave', age, hourAge));
        insts.push(makeInst(k, cur[k], Tm, 'arrive', age, hourAge));
      } else insts.push(makeInst(k, cur[k], Tm, 'rest', age, hourAge));
    }
    for (const inst of insts) drawJelly(inst, Tm, 1);
    // a jet leaves a wake of disturbed plankton glowing where the bell was
    for (const inst of insts) {
      if (inst.mode !== 'leave') continue;
      const cell = inst.cell, b = GLYPHS[inst.digit].bell, C = COL[cell.g];
      const cx = cell.ox + b.cx * cell.sc, cy = cell.oy + b.cy * cell.sc;
      for (let j = 0; j < 46; j++) {
        const tj = 0.04 + j * 0.019, a = inst.u - tj;
        if (a < 0) break;
        const q = inst.pose(a, po), h1 = kit.hash(inst.slot, j, 41), h2 = kit.hash(inst.slot, j, 42);
        const x = cx + q.x + (h1 - 0.5) * b.rx * cell.sc * 1.6 + 0.6 * a * (h1 - 0.5);
        const y = cy + q.y + b.ry * cell.sc * 0.3 + (h2 - 0.3) * 6 + 1.2 * a;
        const f = (a < 0.08 ? a / 0.08 : Math.exp(-(a - 0.08) / (0.5 + 0.6 * h2))) * (0.4 + 0.5 * h1);
        dot(x, y, kit.mix(C, WHITE, 0.5), f);
      }
    }

    // marine snow, drifting down and sideways
    for (const s of SNOW) {
      const y = (s.y + Tm * s.v * 0.35) % (H + 10) - 5;
      const x = (s.x + 3 * Math.sin(Tm * 0.17 * s.w + s.ph) + Tm * 0.05) % W;
      dot(x, y, [0.55, 0.7, 0.8], s.a * flashAt(y) * (1 - 0.5 * ctx.night));
    }

    // compose the jellies: stroke light, white-hot core, halo, bell body
    for (let g = 0; g < 2; g++) {
      const cov = COV[g], lum = LUM[g], fil = FIL[g], thr = THR[g], tlm = TLM[g], C = COL[g];
      for (let p = 0; p < N; p++) GLO[p] = cov[p] * lum[p];
      blur(GLO, GLO);
      for (let p = 0; p < N; p++) {
        const y = (p / W) | 0;
        let fl = flashAt(y);
        if (lure) { const dx = (p % W) - lure[0], dy = y - lure[1]; fl += 1.6 * fish[2] * lure[2] / (1 + (dx * dx + dy * dy) / 60); }
        const v = cov[p] * lum[p] * fl, th = thr[p] * tlm[p] * 0.9 * fl;
        const hot = v * v * 0.28 + 0.4 * th, f = fil[p] * fl + 0.45 * GLO[p] * fl + 0.6 * th;
        const q = 3 * p;
        img[q] += C[0] * (v * 0.8 + f) + WHITE[0] * hot;
        img[q + 1] += C[1] * (v * 0.8 + f) + WHITE[1] * hot;
        img[q + 2] += C[2] * (v * 0.8 + f) + WHITE[2] * hot;
      }
    }

    if (hourAge >= 0) {
      // plankton sparks in the wave front
      // the front itself: a sheet of cold light, leaving an afterglow
      for (let y = Math.max(0, Math.floor(wy - 20)); y < H; y++) {
        const d = y - wy, f = (0.07 * Math.exp(-((d / 6) ** 2)) + (d > 0 ? 0.018 * Math.exp(-d / 28) : 0)) * glowOn;
        if (f < 0.002) continue;
        for (let x = 0; x < W; x++) {
          const q = 3 * (y * W + x), n = GRAIN[y * W + x];
          img[q] += 0.1 * f * n; img[q + 1] += 0.55 * f * n; img[q + 2] += f * n;
        }
      }
      for (let k = 0; k < 520; k++) {
        const x = kit.hash(k, 21) * W + 2 * Math.sin(Tm * 0.3 + k), y = kit.hash(k, 22) * H;
        // each dinoflagellate flares as the front reaches it, then fades over a second or two
        const since = (wy < y ? (y - wy) / WAVE_V : -1) - 0.08 * kit.hash(k, 23);
        if (since < 0 || since > 2.5) continue;
        const f = (since < 0.06 ? since / 0.06 : Math.exp(-(since - 0.06) / (0.25 + 0.6 * kit.hash(k, 24)))) * glowOn;
        dot(x, y, [0.2, 0.7, 1], f * (0.3 + 0.5 * kit.hash(k, 25)));
      }
      // a shoal of comb jellies rises through
      for (let k = 0; k < SHOAL.length; k++) {
        const s = SHOAL[k], t = hourAge - s.d;
        if (t < 0) continue;
        const y = H + 8 - s.v * t, x = s.x + 3 * Math.sin(t * 0.9 + s.ph);
        if (y < -8) continue;
        combJelly(x, y, Tm, k, sstep(0, 0.6, t) * (1 - sstep(SHOW - 2.5, SHOW, hourAge)), s.s);
      }
      // an anglerfish drifts across the gap, behind its lure
      if (fish) angler(fish[0], fish[1], Tm, fish[2]);
    }

    kit.blitGrid(ctx, img, 1 - 0.65 * ctx.night);
  },
};
