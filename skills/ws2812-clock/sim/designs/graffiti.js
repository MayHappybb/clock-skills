// Buff: a brick alley at night under a flickering wall lamp. The time is
// graffiti: a wildstyle piece for the hour, a throw-up for the minutes, with
// keylines, 3D blocks, shine and slow drips. Every minute a council worker
// rolls a grey buff patch over the minute; the writer, whistling with the can
// behind his back, sneaks in behind him and sprays the new one, outline first
// then fill. The wall keeps the scars: a quilt of mismatched grey patches.
// On the hour a two-person crew sweeps a new backdrop and colourway across
// the whole piece with spray poles, paints the new hour, high-fives, and
// scatters when a torch beam comes sweeping down the alley.
import * as kit from '../js/kit.js';
import { bake, pathAt, KW, OW } from './graffiti-glyphs.js';
import { makeFig, cap, person, cat, drawFig, C, RH } from './graffiti-figs.js';

const W = 192, H = 64, N = W * H, FY = 62; // FY: where feet stand
const LX = 102.5, LY = 4.2;                 // lamp bulb

// ------------------------------------------------------------- the slots
const SL = [
  { ox: 18, oy: 7, sw: 24, sh: 34, R: 4.6, slant: 0.16, rot: -0.03, ext: 3.4 },
  { ox: 55, oy: 4, sw: 24, sh: 36, R: 4.6, slant: 0.16, rot: 0.035, ext: 3.4 },
  { ox: 113, oy: 29, sw: 16, sh: 21, R: 3.1, slant: 0.2, rot: -0.05, ext: 2.4 },
  { ox: 136, oy: 27, sw: 16, sh: 21, R: 3.1, slant: 0.2, rot: 0.06, ext: 2.4 },
];
const BK = SL.map((S) => Array.from({ length: 10 }, (_, g) => bake(g, S)));
// each minute slot's box (union over digits) for the buff patches
const BOX = SL.map((_, k) => {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const B of BK[k]) { x0 = Math.min(x0, B.x0 + 1); y0 = Math.min(y0, B.y0 + 1); x1 = Math.max(x1, B.x0 + B.w - 1); y1 = Math.max(y1, B.y0 + B.h - 1); }
  return [x0, y0, x1, y1];
});

// ------------------------------------------------------------- palettes
const P = (a, b, sh, out, back) => ({ a: kit.hex(a), b: kit.hex(b), sh: kit.scale(kit.hex(sh), 0.42), out: kit.scale(kit.hex(out), 0.5), back: kit.scale(kit.hex(back), 0.11) });
const PALS = [
  P('#ff2f8e', '#ff9a1a', '#16c8d8', '#fff1c8', '#7a2cff'), // pink-orange fade, teal block
  P('#9dff2a', '#ffe11a', '#9a3cff', '#ffffff', '#1a5cff'), // lime-yellow, violet block
  P('#2fe6ff', '#3a6bff', '#ff2fb0', '#fff6a0', '#ff2f6a'), // ice blue, magenta block
  P('#ffb21a', '#ff3a1a', '#2a8cff', '#fff4d0', '#00c8a0'), // fire, blue block
  P('#d26bff', '#ff4fa8', '#ffc21a', '#ffffff', '#00a0ff'), // violet-pink, gold block
  P('#ffffff', '#8fd8ff', '#ff4a1a', '#ffe08a', '#ff7a00'), // chrome, red block
];
const palOf = (hi) => PALS[((hi % 6) + 6) % 6];

// ------------------------------------------------------------- the wall
const WALL = new Float32Array(N * 3), POOL = new Float32Array(N);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const p = y * W + x;
  let r, g, b;
  if (y < 57) {
    const course = y >> 2, off = (course & 1) * 4, bx = Math.floor((x + off) / 8);
    const mortar = (y & 3) === 3 || (x + off) % 8 === 7;
    const hb = kit.hash(bx, course, 3), n = 0.75 + 0.5 * kit.noise2(x * 0.4, y * 0.5);
    if (mortar) { r = 0.03; g = 0.028; b = 0.025; }
    else { const k = (0.65 + 0.6 * hb) * n; r = 0.1 * k; g = (0.036 + 0.014 * kit.hash(bx, course, 5)) * k; b = 0.022 * k; }
    // grime toward the ground
    const gr = 1 - 0.35 * kit.smoothstep(38, 56, y);
    r *= gr; g *= gr; b *= gr;
    // drainpipe on the right
    if (x >= 171 && x <= 173) { const e = x === 172 ? 0.09 : 0.05; r = e; g = e; b = e * 1.05; if ((y + 2) % 18 < 2) { r *= 1.6; g *= 1.6; b *= 1.6; } }
  } else if (y === 57) { r = 0.07; g = 0.068; b = 0.064; }   // kerb edge
  else {
    const joint = x % 24 === 0;
    const k = 0.75 + 0.5 * kit.noise2(x * 0.3, y * 0.6);
    r = g = b = joint ? 0.012 : 0.028 * k;
    if (x >= 3 && x <= 16 && y >= 59 && y <= 61) r = g = b = (x & 1) ? 0.004 : 0.05; // steam grate
  }
  WALL[3 * p] = r * 1.5; WALL[3 * p + 1] = g * 1.5; WALL[3 * p + 2] = b * 1.5;
  const dx = (x - LX) / 52, dy = (y - LY) / 38;
  POOL[p] = 1 / (1 + dx * dx + dy * dy);
}
const LAMPC = kit.hex('#ffd9a0');

// hour backdrops: a cloud of blobs behind the piece, cached per hour
const BACKS = new Map();
function backdrop(hi) {
  if (BACKS.has(hi)) return BACKS.get(hi);
  const m = new Float32Array(N), blobs = [];
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * kit.TAU + kit.hash(hi, k, 1);
    blobs.push([56 + 40 * Math.cos(a) + 5 * kit.hash(hi, k, 2), 27 + 19 * Math.sin(a) + 4 * kit.hash(hi, k, 4), 9 + 6 * kit.hash(hi, k, 3)]);
  }
  blobs.push([56, 27, 34]);
  for (let y = 0; y < 56; y++) for (let x = 2; x < 110; x++) {
    let f = 0;
    for (const [bx, by, br] of blobs) { const d = Math.hypot(x + 0.5 - bx, (y + 0.5 - by) * (br > 30 ? 1.9 : 1)) / br; f = Math.max(f, 1 - d); }
    m[y * W + x] = kit.smoothstep(0, 0.06, f) + 0.9 * (kit.smoothstep(0, 0.03, f) - kit.smoothstep(0.035, 0.07, f)) * 1;
  }
  // stars sprayed on the backdrop
  const stars = [];
  for (let k = 0; k < 5; k++) stars.push([12 + 90 * kit.hash(hi, k, 7), 4 + 46 * kit.hash(hi, k, 8), kit.hash(hi, k, 9)]);
  const v = { m, stars };
  BACKS.set(hi, v);
  if (BACKS.size > 4) BACKS.delete(BACKS.keys().next().value);
  return v;
}

// ------------------------------------------------------------- buffers
const alb = new Float32Array(N * 3), em = new Float32Array(N * 3), LT = new Float32Array(N);
const img = new Float32Array(N * 3);
const T2 = new Float32Array(2), T3 = new Float32Array(2);
const pad = (n) => String(n).padStart(2, '0');
const digitsOf = (d) => pad(d.getHours()) + pad(d.getMinutes());
const cl = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

function emSplat(x, y, r, c0, c1, c2, a) {
  const x0 = Math.max(0, Math.floor(x - r)), x1 = Math.min(W - 1, Math.ceil(x + r));
  const y0 = Math.max(0, Math.floor(y - r)), y1 = Math.min(H - 1, Math.ceil(y + r));
  for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
    const dx = px + 0.5 - x, dy = py + 0.5 - y, q = (dx * dx + dy * dy) / (r * r);
    if (q >= 1) continue;
    const f = (1 - q) * (1 - q) * a, o = 3 * (py * W + px);
    em[o] += c0 * f; em[o + 1] += c1 * f; em[o + 2] += c2 * f;
  }
}
function emLine(ax, ay, bx, by, w, c, a) {
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - w - 1)), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + w + 1));
  const y0 = Math.max(0, Math.floor(Math.min(ay, by) - w - 1)), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by) + w + 1));
  for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
    const d = kit.segDist(px + 0.5, py + 0.5, ax, ay, bx, by);
    if (d >= w) continue;
    const f = (1 - d / w) * a, o = 3 * (py * W + px);
    em[o] += c[0] * f; em[o + 1] += c[1] * f; em[o + 2] += c[2] * f;
  }
}
// a 4-point star of light
function glint(x, y, size, a) {
  const R = Math.ceil(size + 1);
  for (let py = Math.max(0, Math.floor(y - R)); py <= Math.min(H - 1, y + R); py++)
    for (let px = Math.max(0, Math.floor(x - R)); px <= Math.min(W - 1, x + R); px++) {
      const dx = Math.abs(px + 0.5 - x), dy = Math.abs(py + 0.5 - y);
      const f = (Math.max(0, 1 - dx / 0.75) * Math.max(0, 1 - dy / size) + Math.max(0, 1 - dy / 0.75) * Math.max(0, 1 - dx / size)) * a;
      if (f <= 0) continue;
      const o = 3 * (py * W + px);
      em[o] += f; em[o + 1] += f; em[o + 2] += f * 0.95;
    }
}
// a tiny bitmap drawn with bilinear coverage, so it glides
const NOTE = ['.###', '.#.#', '.#..', '.#..', '##..', '##..'];
function emBitmap(rows, x, y, c, a) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  for (let j = 0; j < rows.length; j++) for (let i = 0; i < rows[j].length; i++) {
    if (rows[j][i] !== '#') continue;
    for (let q = 0; q < 4; q++) {
      const px = ix + i + (q & 1), py = iy + j + (q >> 1);
      if (px < 0 || py < 0 || px >= W || py >= H) continue;
      const wgt = ((q & 1) ? fx : 1 - fx) * ((q >> 1) ? fy : 1 - fy) * a, o = 3 * (py * W + px);
      em[o] += c[0] * wgt; em[o + 1] += c[1] * wgt; em[o + 2] += c[2] * wgt;
    }
  }
}

// ------------------------------------------------------------- one numeral
// a: outline traced (0..1), b: fill sprayed, c: shine. clip: 0 none,
// 1 keep y > v (old digit under the roller), 2 keep x < v, 3 keep x > v.
function numeral(B, pal, a, b, c, clip, v) {
  const { x0, y0, w, h, dF, dS, sP, hl, grain } = B;
  const top = B.top, span = B.bot - B.top;
  const A = pal.a, Bc = pal.b, SH = pal.sh, OU = pal.out;
  for (let j = 0; j < h; j++) {
    const py = y0 + j;
    if (py < 0 || py >= H) continue;
    let cy = 1;
    if (clip === 1) { cy = cl(py + 0.5 - v); if (cy <= 0) continue; }
    for (let i = 0; i < w; i++) {
      const px = x0 + i;
      if (px < 0 || px >= W) continue;
      const q = j * w + i, df = dF[q], ds = dS[q];
      const dm = df < ds ? df : ds;
      if (dm > KW + OW + 0.6) continue;
      let k = cy;
      if (clip === 2) k *= cl(v - px - 0.5); else if (clip === 3) k *= cl(px + 0.5 - v);
      if (k <= 0) continue;
      const s = sP[q], gn = grain[q];
      const rB = cl((b * 1.12 - s - gn * 0.08) * 12), rS = cl((b * 1.12 - 0.12 - s) * 10);
      const o = 3 * (py * W + px);
      let r = alb[o], g = alb[o + 1], bl = alb[o + 2], al;
      // outer outline, round the letter and its block
      al = cl(0.5 - (dm - KW - OW)) * rS * k;
      if (al > 0) { r += (OU[0] - r) * al; g += (OU[1] - g) * al; bl += (OU[2] - bl) * al; }
      // 3D block, darker away from the letter
      al = cl(0.5 - (ds - KW)) * rS * k;
      if (al > 0) {
        const dk = 1 - 0.5 * cl((df - KW) / 3.5);
        r += (SH[0] * dk - r) * al; g += (SH[1] * dk - g) * al; bl += (SH[2] * dk - bl) * al;
      }
      // keyline
      al = cl(0.5 - (df - KW)) * rB * k;
      if (al > 0) { r += (0.003 - r) * al; g += (0.003 - g) * al; bl += (0.005 - bl) * al; }
      // fill: a two-colour fade split on a zigzag, with shine streaks
      al = cl(0.5 - df) * rB * k;
      if (al > 0) {
        const zz = Math.abs(((px * 0.16) % 1) - 0.5) * 0.12;
        const t = kit.smoothstep(0.42, 0.6, (py - top) / span + zz);
        let fr = A[0] + (Bc[0] - A[0]) * t, fg = A[1] + (Bc[1] - A[1]) * t, fb = A[2] + (Bc[2] - A[2]) * t;
        const sh = hl[q] * c * 0.85 + (1 - 4 * Math.abs(t - 0.5) > 0 ? (1 - 4 * Math.abs(t - 0.5)) * 0.18 : 0);
        fr += (0.95 - fr) * sh; fg += (0.95 - fg) * sh; fb += (0.92 - fb) * sh;
        const m = 0.86;
        r += (fr * m - r) * al; g += (fg * m - g) * al; bl += (fb * m - bl) * al;
      }
      // the sketch line traced first, swallowed by the fill
      if (a > 0 && rB < 1) {
        al = cl(1.3 - Math.abs(df + 0.3)) * cl((a * 1.04 - s) * 25) * (1 - rB) * k;
        if (al > 0) { r += (OU[0] * 1.3 - r) * al; g += (OU[1] * 1.3 - g) * al; bl += (OU[2] * 1.3 - bl) * al; }
      }
      alb[o] = r; alb[o + 1] = g; alb[o + 2] = bl;
    }
  }
}

function drips(B, pal, age, k, clip, v) {
  for (const [x, y, Lm, ph] of B.drips) {
    const L = Lm * kit.ease.out(cl((age - 1 - ph * 0.15) / 26));
    if (L <= 0.05) continue;
    if (clip === 2 && x >= v) continue;
    if (clip === 3 && x < v) continue;
    const c = pal.b;
    for (let yy = Math.floor(y); yy <= Math.min(H - 1, y + L + 1); yy++) {
      if (clip === 1 && yy < v) continue;
      const cov = cl(y + L - yy + 0.5) * (yy > y + L - 1.2 ? 1 : 0.8);
      if (cov <= 0) continue;
      const o = 3 * (yy * W + x);
      alb[o] += (c[0] * 0.8 - alb[o]) * cov; alb[o + 1] += (c[1] * 0.8 - alb[o + 1]) * cov; alb[o + 2] += (c[2] * 0.8 - alb[o + 2]) * cov;
    }
  }
}

// the buff patch for a minute event e (minute index): wide when both minute digits went
function patchRect(e, out) {
  const wide = ((e % 10) + 10) % 10 === 0;
  const b2 = BOX[2], b3 = BOX[3];
  out[0] = (wide ? b2[0] : b3[0]) - 1 + 3 * (kit.hash(e, 1) - 0.5);
  out[1] = Math.min(b2[1], b3[1]) - 1 + 3 * (kit.hash(e, 2) - 0.5);
  out[2] = b3[2] + 1 + 3 * (kit.hash(e, 3) - 0.5);
  out[3] = Math.max(b2[3], b3[3]) + 1 + 2 * (kit.hash(e, 4) - 0.5);
  return out;
}
const PR = new Float32Array(4);
function buff(e, rollY, wet) {
  patchRect(e, PR);
  const g = 0.1 + 0.05 * kit.hash(e, 5), tint = kit.hash(e, 6) - 0.5;
  const cr = g * (1 + 0.15 * tint), cg = g, cb = g * (1 - 0.15 * tint);
  const x0 = Math.max(0, Math.floor(PR[0])), x1 = Math.min(W - 1, Math.ceil(PR[2]));
  for (let x = x0; x <= x1; x++) {
    const ex = cl(x + 1 - PR[0]) * cl(PR[2] - x);
    const lap = 1 + 0.06 * Math.sin(x * 0.9 + e) + 0.04 * (kit.hash(x, e) - 0.5);
    const yb = Math.min(PR[3] + 1.2 * kit.hash(x, e, 7), rollY), yt = PR[1];
    for (let y = Math.max(0, Math.floor(yt)); y <= Math.min(56, Math.ceil(yb)); y++) {
      const cov = ex * cl(y + 1 - yt) * cl(yb - y);
      if (cov <= 0) continue;
      const o = 3 * (y * W + x), d = (1 - 0.3 * wet) * lap;
      alb[o] += (cr * d - alb[o]) * cov; alb[o + 1] += (cg * d - alb[o + 1]) * cov; alb[o + 2] += (cb * d - alb[o + 2]) * cov;
    }
  }
}

// ------------------------------------------------------------- the people
const fW = makeFig(), fK = makeFig(), fA = makeFig(), fB = makeFig(), fC = makeFig();
const pose = () => ({ phase: 0, move: 0, lean: 0, lhx: 0, lhy: 0, rhx: 0, rhy: 0, hood: 1, hat: -1, vest: 0, canR: 0, canL: 0, crouch: 0, dir: 1 });
const PW = pose(), PK = pose(), PA = pose(), PB = pose();
const reset = (f) => { f.n = 0; f.stripeY = -99; f.rim = 1; };

// paint timings (s): outline, fill, shine
const TM = [0.8, 0.6, 0.3], TH = [0.95, 0.65, 0.3];
function phases(tl, T, out) {
  out[0] = cl(tl / T[0]); out[1] = cl((tl - T[0] + 0.12) / T[1]); out[2] = cl((tl - T[0] - T[1] + 0.05) / T[2]);
  return out;
}
const PH = new Float32Array(3);
/** Where the can points at local paint time tl (s), and the paint colour index (0 outline, 1 fill, 2 shine). */
function nozzle(B, tl, T, out) {
  if (tl < T[0]) { pathAt(B, tl / T[0], out); return 0; }
  if (tl < T[0] + T[1]) {
    pathAt(B, (tl - T[0]) / T[1], out);
    out[0] += 1.2 * Math.sin(tl * 40); out[1] += 1.2 * Math.cos(tl * 33);
    return 1;
  }
  out[0] = B.glint[0]; out[1] = B.glint[1]; return 2;
}
const TOTAL = (T) => T[0] + T[1] + T[2];

function mist(B, start, T, now, pal, tx) {
  // particles sprayed in the last 0.7 s drift off the wall and fade
  for (let j = 0; j < 16; j++) {
    const life = 0.7, ag = (now - start + j * 0.0437) % life, born = now - start - ag;
    if (born < 0 || born > TOTAL(T)) continue;
    const ci = nozzle(B, born, T, T3);
    const c = ci === 0 ? pal.out : ci === 1 ? (kit.hash(j, 3) < 0.5 ? pal.a : pal.b) : [0.6, 0.6, 0.6];
    const h1 = kit.hash(j, Math.floor((now - start - ag) * 10), 1), h2 = kit.hash(j, Math.floor((now - start - ag) * 10), 2);
    const x = T3[0] + (h1 - 0.5) * 7 * ag + tx * ag * 3, y = T3[1] - (1.5 + 3 * h2) * ag + (h2 - 0.5) * 3 * ag;
    const f = (1 - ag / life) ** 2 * 0.16;
    emSplat(x, y, 1 + ag * 3.5, c[0], c[1], c[2], f);
  }
}

// the writer's schedule: [slot, mode (0 outline, 1 fill, 2 shine), t0, t1] in s after the minute
const SCH1 = new Float32Array([3, 0, 1.15, 1.95, 3, 1, 2.0, 2.65, 3, 2, 2.7, 3.0]);
const SCH2 = new Float32Array([2, 0, 1.15, 1.8, 3, 0, 1.9, 2.55, 2, 1, 2.65, 3.15, 3, 1, 3.25, 3.75, 2, 2, 3.85, 4.1, 3, 2, 4.15, 4.4]);
const WHITE = [0.7, 0.7, 0.68];
function prog(S, n, k, mode, t) {
  for (let e = 0; e < n; e++) if (S[4 * e] === k && S[4 * e + 1] === mode) return cl((t - S[4 * e + 2]) / (S[4 * e + 3] - S[4 * e + 2]));
  return 1;
}
const NZ = new Float32Array(2);
function entryAt(S, e, u, cur, out) {
  const k = S[4 * e], mode = S[4 * e + 1], B = BK[k][+cur[k]];
  if (mode === 2) { out[0] = B.glint[0] + 1.2 * Math.sin(u * 9); out[1] = B.glint[1] + 1.2 * Math.cos(u * 9); return; }
  pathAt(B, u, out);
  if (mode === 1) { const w = Math.sin(u * Math.PI); out[0] += 1.3 * w * Math.sin(u * 70); out[1] += 1.3 * w * Math.cos(u * 57); }
}
/** Where the writer's can points at t; returns -1 before/after, 0 moving between strokes, 1 + mode while spraying. */
function noz(S, n, cur, t, out) {
  if (t <= S[2]) { entryAt(S, 0, 0, cur, out); return -1; }
  for (let e = 0; e < n; e++) {
    const t0 = S[4 * e + 2], t1 = S[4 * e + 3];
    if (t < t1) {
      if (t >= t0) { entryAt(S, e, (t - t0) / (t1 - t0), cur, out); return 1 + S[4 * e + 1]; }
      entryAt(S, e - 1, 1, cur, NZ); entryAt(S, e, 0, cur, out);
      const u = kit.ease.inOut((t - S[4 * e - 1]) / (t0 - S[4 * e - 1]));
      out[0] = NZ[0] + (out[0] - NZ[0]) * u; out[1] = NZ[1] + (out[1] - NZ[1]) * u;
      return 0;
    }
  }
  entryAt(S, n - 1, 1, cur, out); return -1;
}
// paint mist sprayed in the last 0.7 s drifts off the wall and fades
function mistW(S, n, cur, now, pal) {
  for (let j = 0; j < 16; j++) {
    const life = 0.7, ag = (now + j * 0.0437) % life, born = now - ag;
    const ci = noz(S, n, cur, born, T3);
    if (ci < 1) continue;
    const c = ci === 1 ? pal.out : ci === 2 ? (kit.hash(j, 3) < 0.5 ? pal.a : pal.b) : WHITE;
    const sd = Math.floor(born * 10), h1 = kit.hash(j, sd, 1), h2 = kit.hash(j, sd, 2);
    const x = T3[0] + (h1 - 0.5) * 7 * ag - ag * 1.2, y = T3[1] - (1.5 + 3 * h2) * ag;
    emSplat(x, y, 1 + ag * 3.5, c[0], c[1], c[2], (1 - ag / life) ** 2 * 0.16);
  }
}

// ------------------------------------------------------------- the face
export default {
  name: 'Buff', blurb: 'alley graffiti: the city rolls grey over each minute, a writer sneaks in behind and sprays it back',
  layouts: ['hub-x3'], look: 'smoke', fps: 60, brightness: 0.45, dither: true,
  frame(ctx) {
    const G = kit.grid(ctx);
    const d = ctx.date, ms = d.getTime(), now = ms / 1000;
    const loc = ms - d.getTimezoneOffset() * 60000;
    const mI = Math.floor(loc / 60000), hI = Math.floor(mI / 60);
    const sec = (loc % 60000) / 1000, mm = mI % 60;
    const cur = digitsOf(d), prev = digitsOf(new Date(ms - 60000));
    const hourTurn = mm === 0 && sec < 12;
    const nextHour = mm === 59;
    const pal = palOf(hI), palP = palOf(hI - 1);
    const tau = sec < 40 ? sec : sec - 60;  // seconds from this turn (negative: before the next)

    // ---- lamp: a hum, and now and then a sputter
    const bk = Math.floor(now / 5.3), lb = now - bk * 5.3 - kit.hash(bk, 1) * 4.2;
    let flick = 0.96 + 0.04 * Math.sin(now * 1.3);
    if (kit.hash(bk, 2) < 0.35 && lb > 0 && lb < 0.55) flick = kit.hash(Math.floor(now * 26), 3) > 0.5 ? 0.95 : 0.4;

    alb.set(WALL);
    em.fill(0);

    // ---- buff patches: the last few, oldest first; the current one rolls down
    const rollT = tau >= 0 && tau < 3 ? kit.ease.inOut(cl(tau / 1.1)) : 1;
    {
      const last10 = mI - (mm % 10), ev = [last10 - 10, last10, mI - 2, mI - 1, mI];
      ev.sort((p, q) => p - q);
      for (let k = 0; k < ev.length; k++) {
        const e = ev[k];
        if (k && ev[k - 1] === e) continue;
        let ry = 99;
        if (e === mI && tau >= 0 && tau < 3) { patchRect(e, PR); ry = PR[1] + (PR[3] + 2 - PR[1]) * rollT; }
        const age = (mI - e) * 60 + sec;
        buff(e, ry, Math.exp(-age / 14));
      }
    }
    // ---- hour backdrop, swept in from the right on the hour
    const waveX = hourTurn ? 108 - 100 * kit.ease.inOut(cl(sec / 1.0)) : -99;
    {
      const bn = backdrop(hI), bo = backdrop(hI - 1), cn = pal.back, co = palP.back;
      for (let y = 0; y < 56; y++) for (let x = 2; x < 110; x++) {
        const p = y * W + x, nw = x + 0.5 > waveX;
        let m = nw ? bn.m[p] : bo.m[p];
        if (m <= 0) continue;
        const c = nw ? cn : co, ou = nw ? pal.out : palP.out, o = 3 * p;
        const rim = m > 1 ? (m - 1) * 0.22 : 0;
        if (m > 1) m = 1;
        alb[o] += (c[0] + ou[0] * rim - alb[o]) * m; alb[o + 1] += (c[1] + ou[1] * rim - alb[o + 1]) * m; alb[o + 2] += (c[2] + ou[2] * rim - alb[o + 2]) * m;
      }
    }

    // ---- the numerals
    // minute slots: the old digit under the roller, then the writer's new one:
    // every outline first, then the fills, then the shine, so the new minutes
    // read whole as soon as possible
    const two = prev[2] !== cur[2], SC = two ? SCH2 : SCH1, NS = SC.length / 4;
    const mPaint = tau >= 0 && tau < 12 && prev[3] !== cur[3];
    for (let k = 0; k < 4; k++) {
      const g = +cur[k], gp = +prev[k], B = BK[k][g], changed = prev[k] !== cur[k];
      if (k < 2) {
        // hours: the crew's wave recolours what stays and covers what goes
        let since = mm * 60 + sec - 3.2;
        if (hourTurn) {
          if (waveX > BK[k][gp].x0) { numeral(BK[k][gp], palP, 1, 1, 1, 2, waveX); drips(BK[k][gp], palP, 1e3, k, 2, waveX); }
          if (!changed) { numeral(B, pal, 1, 1, 1, 3, waveX); since = sec; }
          else {
            const st = k === 1 ? 0.9 : 1.45, tl = sec - st;
            phases(tl + TH[0], TH, PH); numeral(B, pal, 1, PH[1], PH[2], 3, waveX);
            since = sec - st - 1.5;
          }
        } else numeral(B, pal, 1, 1, 1, 0, 0);
        drips(B, pal, hourTurn && changed ? since : mm * 60 + sec + 30, k, hourTurn && !changed ? 3 : 0, waveX);
      } else {
        let since = 0;
        if (changed && mPaint) {
          const ry = PR[1] + (PR[3] + 2 - PR[1]) * rollT;
          if (rollT < 1) numeral(BK[k][gp], hourTurn ? palP : pal, 1, 1, 1, 1, ry);
          const a_ = prog(SC, NS, k, 0, tau), b_ = prog(SC, NS, k, 1, tau), c_ = prog(SC, NS, k, 2, tau);
          if (a_ > 0) numeral(B, pal, a_, b_, c_, 0, 0);
          since = tau - SC[4 * NS - 3];
        } else {
          numeral(B, pal, 1, 1, 1, 0, 0);
          since = k === 3 ? sec + 60 : (mm % 10) * 60 + sec;
        }
        drips(B, pal, since, k, 0, 0);
      }
    }

    // ---- the writer
    reset(fW);
    {
      const P_ = PW; P_.lean = 0; P_.crouch = 0; P_.hat = -1; P_.vest = 0; P_.canR = 1; P_.dir = -1;
      const REST = 183, T0 = SC[2], TE = SC[4 * NS - 1];
      let x = REST, innocent = 0, mv = 0, spraying = -1;
      const standX = (tt) => { noz(SC, NS, cur, tt, T2); return T2[0] + 8; };
      const smX = (tt) => (standX(tt) + standX(tt - 0.1) + standX(tt - 0.2) + standX(tt - 0.3) + standX(tt - 0.4)) / 5;
      if (tau > -3.3 && tau < 0.7) innocent = 1;
      if (tau < 0.7 || tau > TE + 1.6) x = REST;
      else if (tau < T0) { x = kit.lerp(REST, smX(T0), kit.ease.inOut((tau - 0.7) / (T0 - 0.7))); mv = 1; }
      else if (tau < TE + 0.4) { x = smX(tau); spraying = noz(SC, NS, cur, tau, T2); }
      else { x = kit.lerp(smX(TE + 0.4), REST, kit.ease.inOut(cl((tau - TE - 0.4) / 1.2))); mv = 1; }
      P_.phase = x * 0.55; P_.move = mv;
      const shY = FY - 17;
      if (spraying >= 0) {
        P_.rhx = T2[0] + 2.5; P_.rhy = Math.max(T2[1] + 2, shY - 13);
        P_.lhx = x - 3; P_.lhy = FY - 9;
        P_.lean = -0.8;
      } else if (innocent) {
        // can behind the back, whistling
        P_.rhx = x + 1.5; P_.rhy = FY - 11; P_.lhx = x - 1.5; P_.lhy = FY - 11; P_.canR = 0;
        P_.lean = 0.4 * Math.sin(now * 3);
      } else {
        // shaking the can now and then: the ball rattles
        const sb = (now % 6.5) < 1.3 ? Math.sin(now * 2 * Math.PI * 6.5) * 2.2 : 0;
        P_.rhx = x - 4; P_.rhy = FY - 15 + sb; P_.lhx = x - 2.5; P_.lhy = FY - 9;
      }
      person(fW, x, FY, P_);
      // spray jet and mist
      if (spraying >= 1) {
        const ci = spraying - 1, c = ci === 0 ? pal.out : ci === 1 ? pal.a : WHITE;
        emLine(RH[0] - 0.5, RH[1] - 1.6, T2[0], T2[1], 1.3, c, 0.12);
        emSplat(T2[0], T2[1], 2.4, c[0], c[1], c[2], 0.35);
      }
      if (mPaint && tau > T0 && tau < TE + 0.8) mistW(SC, NS, cur, tau, pal);
      if (innocent) {
        for (let j = 0; j < 2; j++) {
          const ph = (now * 0.55 + j * 0.5) % 1;
          emBitmap(NOTE, x - 2 + 5 * ph + 2 * Math.sin(ph * 6 + j), FY - 34 - 12 * ph, [0.25, 0.5, 0.6], 0.5 * Math.sin(ph * Math.PI));
        }
      }
    }

    // ---- the council worker with the roller (every minute)
    reset(fK);
    if (tau > -3.8 && tau < 4.2) {
      const P_ = PK; P_.crouch = 0; P_.hat = C.hat; P_.vest = 1; P_.canR = 0;
      patchRect(tau < 0 ? mI + 1 : mI, PR);
      const xs = PR[2] + 7;
      let x, mv = 0;
      if (tau < -0.5) { const u = (tau + 3.8) / 3.3; x = kit.lerp(204, xs, u); mv = 1; P_.dir = -1; }
      else if (tau < 1.35) x = xs;
      else { const u = cl((tau - 1.35) / 2.85); x = kit.lerp(xs, 204, u); mv = 1; P_.dir = 1; }
      P_.phase = x * 0.5; P_.move = mv; P_.lean = 0;
      // the pole: carried upright, raised to the patch, rolled down, lowered
      let tx, ty, rw = 7;
      const cx = (PR[0] + PR[2]) / 2;
      if (tau < -0.5 || tau > 1.6) { tx = x - 3; ty = FY - 40; }
      else if (tau < 0) { const u = kit.ease.inOut((tau + 0.5) / 0.5); tx = kit.lerp(x - 3, cx, u); ty = kit.lerp(FY - 40, PR[1] + 1, u); rw = kit.lerp(7, (PR[2] - PR[0]) / 2, u); }
      else if (tau < 1.1) { tx = cx; ty = PR[1] + 1 + (PR[3] + 1 - PR[1]) * rollT; rw = (PR[2] - PR[0]) / 2; }
      else { const u = kit.ease.inOut(cl((tau - 1.1) / 0.5)); tx = kit.lerp(cx, x - 3, u); ty = kit.lerp(PR[3] + 1, FY - 40, u); rw = kit.lerp((PR[2] - PR[0]) / 2, 7, u); }
      const bx = x + 1, by = FY - 9;
      const hx1 = kit.lerp(bx, tx, 0.18), hy1 = kit.lerp(by, ty, 0.18), hx2 = kit.lerp(bx, tx, 0.33), hy2 = kit.lerp(by, ty, 0.33);
      P_.rhx = hx1; P_.rhy = hy1; P_.lhx = hx2; P_.lhy = hy2;
      person(fK, x, FY, P_);
      cap(fK, bx, by, tx, ty + 1.5, 0.6, 0.6, C.pole);
      cap(fK, tx - rw, ty, tx + rw, ty, 1.4, 1.4, C.roller);
    }

    // ---- the hour crew
    reset(fA); reset(fB);
    let beam = 0, bmx = 0, bmy = 0;
    if ((nextHour && tau > -2.6) || hourTurn) {
      const t = tau;
      // A: red beanie, sweeps the whole wave and paints the tens; B: yellow cap, the units
      const flee = (x, t0) => (t > t0 ? x - 85 * (t - t0) ** 1.3 : x);
      const runIn = (x0, x1) => kit.lerp(x0, x1, kit.ease.out(cl((t + 2.6) / 2.6)));
      const crew = [[fA, PA, C.beanieR, 0, 1.45, 12], [fB, PB, C.beanieY, 1, 0.9, 52]];
      for (const [f, P_, hat, k, st, stop] of crew) {
        P_.hat = hat; P_.vest = 0; P_.canR = 0; P_.crouch = 0; P_.lean = 0; P_.dir = -1;
        const B = BK[k][+cur[k]], changed = prev[k] !== cur[k];
        let x, mv = 0, tipx = 0, tipy = 0, spray = 0;
        if (t < 0) { x = runIn(-14 - k * 6, 112 - k * 8); mv = 1; P_.dir = 1; tipx = x + 3; tipy = FY - 40; }
        else if (t < 1.0 || (k === 1 && t < st)) {
          const wx = 108 - 100 * kit.ease.inOut(cl(t / 1.0));
          x = Math.max(wx + 4 + k * 5, k === 1 ? stop + 10 : -99); mv = x > (k === 1 ? stop + 10.5 : 0) ? 1 : 0;
          tipx = wx; tipy = k ? 34 : 12; spray = wx < 106 && wx > 6 && x < wx + 12 ? 1 : 0;
        } else {
          const tl = t - st + TH[0];
          if (changed && tl > TH[0] - 0.15 && tl < TOTAL(TH)) { nozzle(B, tl, TH, T2); tipx = T2[0]; tipy = T2[1]; spray = 2; x = T2[0] + 5; }
          else { nozzle(B, cl(tl / TOTAL(TH)) * TOTAL(TH), TH, T2); x = (changed ? T2[0] + 5 : (k ? stop + 10 : stop + 6)); tipx = x - 6; tipy = FY - 36; }
          if (t > 3.3) { // meet for a high five
            const mid = 46, u = kit.ease.inOut(cl((t - 3.3) / 0.6));
            x = kit.lerp(x, mid + (k ? 5 : -5), u); if (u > 0 && u < 1) mv = 1;
          }
          if (t > 5.4) { x = flee(x, 5.4); mv = 1; P_.dir = -1; }
        }
        P_.phase = x * 0.6; P_.move = mv;
        const hf = t > 3.9 && t < 4.6;
        P_.rhx = kit.lerp(x - 1, tipx, 0.12); P_.rhy = kit.lerp(FY - 16, tipy, 0.12);
        P_.lhx = kit.lerp(x - 1, tipx, 0.3); P_.lhy = kit.lerp(FY - 16, tipy, 0.3);
        if (hf) { P_.rhx = 46; P_.rhy = FY - 33 - 1.5 * Math.sin((t - 3.9) * 9); P_.lhx = x + (k ? 3 : -3); P_.lhy = FY - 10; }
        if (x > -20) {
          person(f, x, FY, P_);
          if (!hf) { cap(f, RH[0], RH[1], tipx, tipy, 0.55, 0.55, C.pole); cap(f, tipx, tipy, tipx, tipy + 2.2, 1.3, 1.3, C.can); }
        }
        const pc = spray === 1 ? (k ? pal.b : pal.a) : spray === 2 ? pal.a : null;
        if (pc) {
          for (let j = 0; j < 7; j++) {
            const ph = (now * 2.2 + j / 7) % 1;
            emSplat(tipx - 1.5 - 8 * ph, tipy + (kit.hash(j, Math.floor(now * 2.2 + j / 7)) - 0.5) * 14 * ph, 1.5 + 4 * ph, pc[0], pc[1], pc[2], 0.2 * (1 - ph));
          }
          emSplat(tipx, tipy, 3, pc[0], pc[1], pc[2], 0.4);
        }
        if (spray === 2) mist(B, st - TH[0], TH, t, pal, 0.3);
      }
      // the torch
      if (hourTurn && t > 4.6 && t < 8.8) {
        const sx = [215, 182, 182, 60, 64, 230], sy = [36, 40, 40, 26, 24, 30], ts = [4.6, 5.0, 5.7, 6.6, 7.8, 8.8];
        let q = 0; while (q < 4 && t > ts[q + 1]) q++;
        const u = kit.ease.inOut(cl((t - ts[q]) / (ts[q + 1] - ts[q])));
        bmx = kit.lerp(sx[q], sx[q + 1], u) + 3 * Math.sin(t * 2.3); bmy = kit.lerp(sy[q], sy[q + 1], u) + 2 * Math.sin(t * 3.1);
        beam = cl((t - 4.6) / 0.3) * cl((8.8 - t) / 0.5);
      }
    }

    // ---- the cat, every third minute, along the kerb
    reset(fC);
    if (mm % 3 === 1 && tau > 14 && tau < 36) cat(fC, -12 + (tau - 14) * 10, FY, now);

    drawFig(alb, fC);
    drawFig(alb, fW);
    drawFig(alb, fA); drawFig(alb, fB);
    drawFig(alb, fK);

    // ---- light: ambient + the lamp pool + the torch
    const lampK = 0.95 * flick;
    for (let p = 0; p < N; p++) LT[p] = 0.52 + lampK * POOL[p];
    if (beam > 0) {
      const R = 16;
      for (let y = 0; y < H; y++) for (let x = Math.max(0, Math.floor(bmx - R)); x <= Math.min(W - 1, bmx + R); x++) {
        const dx = (x + 0.5 - bmx) / R, dy = (y + 0.5 - bmy) / (R * 0.9), q = dx * dx + dy * dy;
        if (q < 1) LT[y * W + x] += 4 * beam * (1 - q) * (1 - q);
      }
    }
    // lamp head and moths
    emSplat(LX, LY, 7, LAMPC[0], LAMPC[1], LAMPC[2], 0.12 * flick);
    emSplat(LX, LY + 0.3, 2.2, 1, 0.92, 0.75, 0.9 * flick);
    for (let k = 0; k < 3; k++) {
      const a = now * (2.1 + 0.7 * k) + k * 2.1;
      const mx = LX + (5 + 2 * k) * Math.sin(a) + 1.5 * kit.noise2(now * 2 + k * 9, 0), my = LY + 3 + 3 * Math.cos(a * 1.3) * (1 + 0.4 * k);
      emSplat(mx, my, 1.0, 0.5, 0.45, 0.35, 0.35 * flick);
    }
    // steam from the grate
    for (let y = 14; y < 59; y++) {
      const hgt = 59 - y, wd = 2.5 + hgt * 0.32, cx = 9.5 + 3 * Math.sin(y * 0.11 - now * 0.7) * (hgt / 45);
      const fade = kit.smoothstep(0, 6, hgt) * (1 - kit.smoothstep(22, 45, hgt));
      for (let x = Math.max(0, Math.floor(cx - wd * 1.6)); x <= Math.min(40, cx + wd * 1.6); x++) {
        const e = (x - cx) / wd, env = Math.exp(-e * e) * fade;
        if (env < 0.02) continue;
        const n = kit.noise2(x * 0.22, y * 0.16 + now * 1.4) * kit.noise2(x * 0.1 + 7, y * 0.09 + now * 0.8);
        const v = env * n * 0.055, o = 3 * (y * W + x);
        em[o] += v * 0.9; em[o + 1] += v * 0.95; em[o + 2] += v;
      }
    }
    // glints on the numerals and stars on the backdrop
    for (let k = 0; k < 4; k++) {
      const B = BK[k][+cur[k]];
      let c = 1;
      if (k >= 2 && prev[k] !== cur[k] && mPaint) c = prog(SC, NS, k, 2, tau);
      if (k < 2 && hourTurn && prev[k] !== cur[k]) c = cl((sec - (k ? 0.9 : 1.45) - TH[1]) / TH[2]);
      if (c <= 0) continue;
      const tw = 0.5 + 0.5 * Math.sin(now * 1.1 + k * 1.9);
      glint(B.glint[0], B.glint[1], (1.5 + 2.2 * tw * tw) * kit.ease.outBack(c), 0.5 * c);
    }
    {
      const bd = backdrop(hI);
      const burst = hourTurn ? kit.smoothstep(1.5, 2.4, sec) * (1 - kit.smoothstep(3.5, 6, sec)) : 0;
      for (const [sx, sy, h] of bd.stars) {
        if (hourTurn && sx < waveX) continue;
        const tw = 0.5 + 0.5 * Math.sin(now * (0.6 + h) + h * 20);
        const c = pal.out;
        glint(sx, sy, 1.2 + 1.5 * tw + 4 * burst, (0.12 + 0.1 * tw) + 0.4 * burst);
        void c;
      }
    }
    // the torch's haze cone
    if (beam > 0) {
      emLine(236, 4, bmx, bmy, 7, [0.5, 0.52, 0.55], 0.035 * beam);
      emSplat(bmx, bmy, 15, 0.3, 0.32, 0.33, 0.09 * beam);
    }

    // ---- compose
    const dim = 1 - 0.55 * ctx.night;
    for (let p = 0; p < N; p++) {
      const o = 3 * p, l = LT[p];
      img[o] = (alb[o] * l * LAMPC[0] + em[o]) * dim;
      img[o + 1] = (alb[o + 1] * l * (0.35 + 0.65 * LAMPC[1]) + em[o + 1]) * dim;
      img[o + 2] = (alb[o + 2] * l * (0.3 + 0.7 * LAMPC[2]) + em[o + 2]) * dim;
    }
    kit.blitGrid(ctx, img);
    void G;
  },
};
