// Ramen: a bowl seen from above fills the panel. The minutes are noodles
// laid in the broth in the shape of numerals; the hour is printed on the
// sheet of nori leaning on the rim. Steam drifts, oil beads wander and
// merge, the noodles sway.
// Minute turn: the diner's lacquered chopsticks (from the bottom) pinch the
// old numeral, gather it, lift it and slurp it out of the bowl, tail
// whipping, drips rippling the broth; the chef's long cooking chopsticks
// (from the top) lower a fresh bundle that unfurls into the new numeral.
// Hour: the chef ladles in fresh broth, the bowl whirls one full turn,
// the old nori soaks and sinks and a fresh sheet is tucked in.
import * as kit from '../js/kit.js';
import { sampleDigit } from './ramen-glyphs.js';

const W = 64, N = W * W, CX = 31.5, CY = 31.5, R_BROTH = 28.2, R_RIM = 31.8;
const img = new Float32Array(3 * N);
const cov = new Float32Array(N), shade = new Float32Array(N), halo = new Float32Array(N), ink = new Float32Array(N);
const rad = new Float32Array(N), ang = new Float32Array(N);
const DEPTH = new Float32Array(N), RIMC = new Float32Array(3 * N); // static: broth depth, the bowl's rim colour
const OF = new Float32Array(N), OGX = new Float32Array(N), OGY = new Float32Array(N); // oil field
for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
  const p = y * W + x;
  rad[p] = Math.hypot(x - CX, y - CY); ang[p] = Math.atan2(y - CY, x - CX);
}

// a tileable 64x64 value-noise texture (fbm), sampled bilinearly with wrap
const TEX = new Float32Array(N);
(function () {
  const lat = (i, j, P, s) => kit.hash(((i % P) + P) % P, ((j % P) + P) % P, s);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    let v = 0, a = 0.5, tot = 0;
    for (const [P, s] of [[4, 1], [8, 2], [16, 3]]) {
      const c = W / P, fx = x / c, fy = y / c, i = Math.floor(fx), j = Math.floor(fy);
      const u = fx - i, w = fy - j, su = u * u * (3 - 2 * u), sw = w * w * (3 - 2 * w);
      const A = lat(i, j, P, s), B = lat(i + 1, j, P, s), C = lat(i, j + 1, P, s), D = lat(i + 1, j + 1, P, s);
      v += a * (A + (B - A) * su + (C - A) * sw + (A - B - C + D) * su * sw); tot += a; a *= 0.55;
    }
    TEX[y * W + x] = v / tot;
  }
})();
function tex(x, y) {
  const fx = x - Math.floor(x / W) * W, fy = y - Math.floor(y / W) * W;
  const i = fx | 0, j = fy | 0, u = fx - i, v = fy - j, i1 = (i + 1) & 63, j1 = (j + 1) & 63;
  const a = TEX[j * W + i], b = TEX[j * W + i1], c = TEX[j1 * W + i], d = TEX[j1 * W + i1];
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function staticMaps() {
  for (let p = 0; p < N; p++) {
    const r = rad[p];
    DEPTH[p] = kit.smoothstep(R_BROTH - 0.5, R_BROTH - 5, r) * kit.clamp(R_BROTH + 0.5 - r);
    if (r <= R_BROTH || r > R_RIM + 0.5) continue;
    // black lacquer bowl: a lit lip, a vermilion band, dark glaze
    const v = r - R_BROTH, side = 0.6 + 0.4 * Math.cos(ang[p] + 2.36);
    const lip = Math.exp(-((v - 0.6) ** 2) / 0.45) * side * 1.6;
    const band = kit.smoothstep(1.2, 1.7, v) * (1 - kit.smoothstep(2.4, 2.9, v));
    const out = kit.clamp(R_RIM + 0.5 - r), gl = 0.08 * side;
    for (let c = 0; c < 3; c++) RIMC[3 * p + c] = (GLAZE[c] * (lip * 0.9 + gl) + VERMILION[c] * band * 0.9 * side) * out;
  }
}

// palette (linear)
const BROTH = kit.hex('#8a4c16'), BROTH_DEEP = kit.hex('#401a06');
const OIL = kit.hex('#e0a030'), GLINT = kit.hex('#fff2c8');
const NOODLE = kit.hex('#ffe08a'), INK = kit.hex('#eef2ff');
const GLAZE = kit.hex('#9a8a7a'), VERMILION = kit.hex('#c8240c');
const NORI = kit.hex('#1a3020'), NORI_SHEEN = kit.hex('#6a9070');
const LACQUER = kit.hex('#8a140c'), LACQ_HI = kit.hex('#ff7050'), BAMBOO = kit.hex('#b08850'), BAMBOO_HI = kit.hex('#f0d8a0');
const STEEL = kit.hex('#707880'), STEEL_HI = kit.hex('#e8f0ff');

staticMaps();

// ------------------------------------------------------------- timeline
const pad = (n) => String(n).padStart(2, '0');
const TURN = 3.2, HOURSHOW = 5.0;
const SLOT = [[23, 29], [40, 29]], SW = 14, SH = 24;

// oil beads: closed-form drift round the broth
const OILS = [];
for (let k = 0; k < 18; k++) {
  OILS.push({
    r: 0.8 + 1.7 * kit.hash(k, 7) ** 1.5, a0: kit.hash(k, 1) * kit.TAU, rr: 6 + 20 * Math.sqrt(kit.hash(k, 2)),
    w: (kit.hash(k, 3) - 0.5) * 0.05, wob: 1.5 + 2 * kit.hash(k, 4), wf: 0.05 + 0.08 * kit.hash(k, 5), ph: kit.hash(k, 6) * 9,
    turns: kit.hash(k, 2) < 0.4 ? 2 : 1,
  });
}
const SCALLIONS = [[28, 57], [36, 58], [44, 56.5], [57.5, 38], [57.5, 29], [56.5, 24], [23, 23.5], [40, 24.5], [41, 6], [24, 5.5], [10, 47], [26, 49.5]];
const oilX = new Float32Array(OILS.length), oilY = new Float32Array(OILS.length), oilR2 = new Float32Array(OILS.length);

// ripples: [x, y, t0, amp]
const ripples = [];

function quad(ax, ay, bx, by, cx, cy, u) {
  const v = 1 - u;
  return [v * v * ax + 2 * v * u * bx + u * u * cx, v * v * ay + 2 * v * u * by + u * u * cy];
}

// ------------------------------------------------------------- stamping
function stamp(px, py, R, hl, hx, hy, doHalo = true) {
  const x0 = Math.max(0, Math.floor(px - R - 1)), x1 = Math.min(W - 1, Math.ceil(px + R + 1));
  const y0 = Math.max(0, Math.floor(py - R - 1)), y1 = Math.min(W - 1, Math.ceil(py + R + 1));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const dx = x - px, dy = y - py, d = Math.sqrt(dx * dx + dy * dy), p = y * W + x;
    const c = R + 0.5 - d;
    if (c > 0) {
      const cc = c > 1 ? 1 : c;
      if (cc > cov[p]) cov[p] = cc;
      const q = d / R, s = q < 1 ? 1 - q * q : 0;
      if (s > shade[p]) shade[p] = s;
    }
  }
  if (!doHalo) return;
  // the dark moat / cast shadow
  const H = R + hl, sx = px + hx, sy = py + hy;
  const a0 = Math.max(0, Math.floor(sx - H)), a1 = Math.min(W - 1, Math.ceil(sx + H));
  const b0 = Math.max(0, Math.floor(sy - H)), b1 = Math.min(W - 1, Math.ceil(sy + H));
  for (let y = b0; y <= b1; y++) for (let x = a0; x <= a1; x++) {
    const dx = x - sx, dy = y - sy, d = Math.sqrt(dx * dx + dy * dy), p = y * W + x;
    const c = (H - d) / hl;
    if (c > 0) { const cc = c > 1 ? 1 : c; if (cc > halo[p]) halo[p] = cc; }
  }
}

/** A point on digit G's track: stroke starting at sample b, arc q (clamped). */
const TR = new Float32Array(4);
function track(G, b, len, q) {
  if (q < 0) q = 0; else if (q > len) q = len;
  const e = b + Math.round(len / 0.5), f = q / 0.5, i = Math.min(b + Math.floor(f), e), j = Math.min(i + 1, e), u = f - Math.floor(f);
  TR[0] = G.x[i] + (G.x[j] - G.x[i]) * u; TR[1] = G.y[i] + (G.y[j] - G.y[i]) * u;
  TR[2] = G.nx[i] + (G.nx[j] - G.nx[i]) * u; TR[3] = G.ny[i] + (G.ny[j] - G.ny[i]) * u;
}

/** Where the laying chopsticks are when c of digit G's lay length is down. */
function layTip(G, c) {
  const n = G.n;
  if (c <= 0) { TR[0] = G.x[0]; TR[1] = G.y[0]; return; }
  let i = 0;
  while (i + 1 < n && G.sl[i + 1] <= c) i++;
  if (i + 1 >= n) { TR[0] = G.x[n - 1]; TR[1] = G.y[n - 1]; return; }
  const u = (c - G.sl[i]) / (G.sl[i + 1] - G.sl[i] || 1);
  TR[0] = G.x[i] + (G.x[i + 1] - G.x[i]) * u; TR[1] = G.y[i] + (G.y[i + 1] - G.y[i]) * u;
}

/**
 * The two noodles of digit d at slot (ox, oy).
 *  mode 0: at rest.
 *  mode 1: being slurped. The noodle slides along its own track toward the
 *    stroke's start, then runs up to the chopsticks at grip (gx, gy) and on
 *    to the diner's mouth below the panel; c is how far it has been pulled.
 *  mode 2: being laid by the chef: samples with lay coordinate < c are down.
 */
function noodles(d, ox, oy, now, mode, c, gx, gy, lift) {
  const G = sampleDigit(d, SW, SH), n = G.n;
  const mx = gx + 12, my = 92; // the diner's mouth, off the bottom
  for (let k = 0; k < 3; k++) {
    const side = k - 1, ph = k * 2.1 + d * 0.7;
    for (let i = 0; i < n; i++) {
      // wavy chijire noodles; the wave belongs to the noodle and drifts slowly
      const s0 = G.s[i];
      const sw = 0.32 * Math.sin(s0 * 1.3 + ph + now * 0.9) + 0.15 * Math.sin(s0 * 0.37 - now * 0.5 + k);
      let off = side * 1.05 + sw;
      const endF = Math.min(s0, G.rem[i]);
      if (endF < 1.5) off *= 0.55 + 0.3 * endF; // ends drawn together, rounded
      let x, y, R = 0.8, h = 0;
      if (mode === 2) {
        const ago = c - G.sl[i];
        if (ago < 0) continue;
        h = ago < 3.5 ? 1 - ago / 3.5 : 0; // just dropped from the chopsticks
        h *= h;
        x = ox + G.x[i] + G.nx[i] * off; y = oy + G.y[i] + G.ny[i] * off - 1.2 * h;
      } else if (mode === 0) {
        x = ox + G.x[i] + G.nx[i] * off + 0.25 * Math.sin(now * 0.31 + d);
        y = oy + G.y[i] + G.ny[i] * off + 0.25 * Math.cos(now * 0.27 + d * 1.7);
      } else {
        const b = G.base[i], q = s0 - c;
        if (q >= 0) {
          // still in the bowl: sliding along its own shape
          track(G, b, s0 + G.rem[i], q);
          x = ox + TR[0] + TR[2] * off; y = oy + TR[1] + TR[3] * off;
          if (q < 4) h = lift * (1 - q / 4);
        } else {
          // pulled out: up to the chopsticks, then away to the mouth
          const u = -q, sx = ox + G.x[b], sy = oy + G.y[b];
          const ax = gx - sx, ay = gy - sy, LA = Math.hypot(ax, ay) || 1;
          const bx = mx - gx, by = my - gy, LB = Math.hypot(bx, by);
          let px, py, tx, ty;
          if (u < LA) { px = sx + ax * u / LA; py = sy + ay * u / LA; tx = ax / LA; ty = ay / LA; h = lift * (0.3 + 0.7 * u / LA); }
          else {
            const v = u - LA; if (v > LB) continue;
            px = gx + bx * v / LB; py = gy + by * v / LB; tx = bx / LB; ty = by / LB; h = lift + v / 30;
            // the slurp whips the strand
            const wh = 1.4 * Math.sin(v * 0.35 - now * 26 + k) * Math.min(1, v / 6);
            px += -ty * wh; py += tx * wh;
          }
          x = px - ty * off * 0.7; y = py + tx * off * 0.7;
        }
      }
      if (h > 1.6) h = 1.6;
      R = 0.72 * (1 + 0.3 * h);
      // the middle strand's moat lies inside the outer strands'; samples are
      // 0.5 px apart, so every other one is enough for the moat
      stamp(x, y, R, 1.6 + 1.4 * h, 2.4 * h, 3 * h, k !== 1 && ((i & 1) === 0 || G.last[i] === 1));
    }
  }
}

// ---------------------------------------------------------------- hour ink
/** Brush the hour onto the nori: slanted nib, thick-thin, local -> raster. */
function brushHour(hh, ncx, ncy, ca, sa, fade) {
  // stacked top to bottom, as shop signs are written
  const s = String(hh), dw = 11, dh = 16.5, gap = 2.6;
  const total = s.length * dh + (s.length - 1) * gap;
  for (let c = 0; c < s.length; c++) {
    const G = sampleDigit(+s[c], dw, dh, 0.4);
    const lx0 = -dw / 2 + 0.3, ly0 = -total / 2 + c * (dh + gap);
    for (let i = 0; i < G.n; i++) {
      // the nib is cut at 40 deg: strokes across it are broad
      const tx = -G.ny[i], ty = G.nx[i];
      const across = Math.abs(tx * 0.643 - ty * 0.766);
      const press = Math.min(1, 0.45 + 0.35 * G.s[i]) * Math.min(1, 0.5 + 0.25 * G.rem[i]);
      const R = (0.45 + 0.75 * across) * press;
      const lx = lx0 + G.x[i] * 0.94 + (dh - G.y[i]) * 0.07, ly = ly0 + G.y[i];
      const px = ncx + lx * ca - ly * sa, py = ncy + lx * sa + ly * ca;
      const x0 = Math.max(0, Math.floor(px - R - 1)), x1 = Math.min(W - 1, Math.ceil(px + R + 1));
      const y0 = Math.max(0, Math.floor(py - R - 1)), y1 = Math.min(W - 1, Math.ceil(py + R + 1));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x - px, y - py), cc = kit.clamp(R + 0.5 - d) * fade, p = y * W + x;
        if (cc > ink[p]) ink[p] = cc;
      }
    }
  }
}

// ------------------------------------------------------------- painting
function over(p, r, g, b, a) {
  const o = 3 * p;
  img[o] += (r - img[o]) * a; img[o + 1] += (g - img[o + 1]) * a; img[o + 2] += (b - img[o + 2]) * a;
}

/** A topping: shape(lx, ly) writes into SH_ (r, g, b, a). Drawn rotated by rot round (cx, cy). */
const SH_ = new Float32Array(4);
function topping(cx, cy, ext, rot, shape, lift) {
  const ca = Math.cos(rot), sa = Math.sin(rot);
  const x0 = Math.max(0, Math.floor(cx - ext)), x1 = Math.min(W - 1, Math.ceil(cx + ext));
  const y0 = Math.max(0, Math.floor(cy - ext)), y1 = Math.min(W - 1, Math.ceil(cy + ext));
  // contact shadow
  for (let y = y0; y <= Math.min(W - 1, y1 + 2); y++) for (let x = x0; x <= Math.min(W - 1, x1 + 2); x++) {
    const dx = x - 1.2 - cx, dy = y - 1.4 - cy, lx = dx * ca + dy * sa, ly = -dx * sa + dy * ca;
    shape(lx, ly);
    if (SH_[3] > 0) { const o = 3 * (y * W + x), k = 1 - 0.65 * SH_[3]; img[o] *= k; img[o + 1] *= k; img[o + 2] *= k; }
  }
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const dx = x - cx, dy = y - cy, lx = dx * ca + dy * sa, ly = -dx * sa + dy * ca;
    shape(lx, ly);
    if (SH_[3] > 0) over(y * W + x, SH_[0] * lift, SH_[1] * lift, SH_[2] * lift, SH_[3]);
  }
}
const edge = (d) => kit.clamp(0.5 - d); // coverage from a signed distance (px)

// toppings write SH_ through mixRGB: no arrays per pixel
function mixRGB(a, b, t) { SH_[0] = a[0] + (b[0] - a[0]) * t; SH_[1] = a[1] + (b[1] - a[1]) * t; SH_[2] = a[2] + (b[2] - a[2]) * t; }
function toward(b, t) { SH_[0] += (b[0] - SH_[0]) * t; SH_[1] += (b[1] - SH_[1]) * t; SH_[2] += (b[2] - SH_[2]) * t; }

const EGG_W = kit.hex('#e8dcc0'), EGG_SKIN = kit.hex('#a8743c'), YOLK = kit.hex('#ff9a18'), YOLK_GEL = kit.hex('#e05a04');
function eggShape(lx, ly) {
  const rx = 7.0, ry = 5.4, q = Math.hypot(lx / rx, ly / ry), d = (q - 1) * ry;
  const a = edge(d);
  SH_[3] = a;
  if (a <= 0) return;
  const yq = Math.hypot((lx + 0.4) / 3.9, (ly + 0.2) / 3.3), yd = (yq - 1) * 3.3;
  mixRGB(EGG_W, EGG_SKIN, d > -1.3 ? kit.clamp(d + 1.3) : 0); // soy-stained skin
  const yolk = edge(yd);
  if (yolk > 0) {
    const g = kit.clamp(1 - yq * 1.4), w = yolk;
    SH_[0] += (YOLK[0] + (YOLK_GEL[0] - YOLK[0]) * g - SH_[0]) * w;
    SH_[1] += (YOLK[1] + (YOLK_GEL[1] - YOLK[1]) * g - SH_[1]) * w;
    SH_[2] += (YOLK[2] + (YOLK_GEL[2] - YOLK[2]) * g - SH_[2]) * w;
  }
  const spec = Math.exp(-((lx + 2.4) ** 2 + (ly + 2.6) ** 2) / 1.2) * 0.6;
  SH_[0] += spec; SH_[1] += spec; SH_[2] += spec * 0.9;
  SH_[3] = a;
}
const NARU_W = kit.hex('#e8e4e0'), NARU_P = kit.hex('#ff2a5a');
function narutoShape(lx, ly) {
  const r = Math.hypot(lx, ly), th = Math.atan2(ly, lx);
  const R = 4.7 + 0.45 * Math.cos(th * 10), a = edge(r - R);
  SH_[3] = a;
  if (a <= 0) return;
  const sp = kit.fract(r / 1.7 - th / kit.TAU);
  const pink = r < 3.9 ? kit.smoothstep(0.5, 0.35, Math.abs(sp - 0.5)) * kit.smoothstep(0.2, 0.9, r) : 0;
  mixRGB(NARU_W, NARU_P, pink);
  SH_[3] = a;
}
const PORK = kit.hex('#e08a70'), FAT = kit.hex('#f4c8b0'), SEAR = kit.hex('#6a2a10');
function chashuShape(lx, ly) {
  const r = Math.hypot(lx, ly), th = Math.atan2(ly, lx);
  const R = 6.4 + 0.5 * Math.sin(th * 3 + 1) + 0.3 * Math.sin(th * 7), a = edge(r - R);
  SH_[3] = a;
  if (a <= 0) return;
  // rolled belly: a faint spiral of fat through the meat, seared rim
  const sp = kit.fract(r / 2.6 + th / kit.TAU * 0.9);
  mixRGB(PORK, FAT, kit.smoothstep(0.3, 0.15, Math.abs(sp - 0.5)) * 0.4 * kit.smoothstep(1, 3, r));
  toward(SEAR, kit.clamp((r - R + 1.4) / 1.2));
  SH_[3] = a;
}
const SCAL_G = kit.hex('#5cc828'), SCAL_L = kit.hex('#d8f080');
function scallionShape(lx, ly) {
  // a slice of scallion: a green ring round a pale core
  const r = Math.hypot(lx, ly * 1.15), a = edge(r - 1.9);
  SH_[3] = a;
  if (a <= 0) return;
  mixRGB(SCAL_L, SCAL_G, kit.smoothstep(0.5, 1.3, r));
  const k = r < 0.7 ? 0.45 : 0.85;
  SH_[0] *= k; SH_[1] *= k; SH_[2] *= k;
  SH_[3] = a;
}

/** Nori sheet, leaning on the rim, with the hour brushed on it. */
function nori(ncx, ncy, rot, alpha, soak, now) {
  const ca = Math.cos(rot), sa = Math.sin(rot), hx = 8.6, hy = 22.5, ext = 26;
  const x0 = Math.max(0, Math.floor(ncx - ext)), x1 = Math.min(W - 1, Math.ceil(ncx + ext));
  const y0 = Math.max(0, Math.floor(ncy - ext)), y1 = Math.min(W - 1, Math.ceil(ncy + ext));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const dx = x - ncx, dy = y - ncy, lx = dx * ca + dy * sa, ly = -dx * sa + dy * ca;
    // a sheet with a slightly ragged torn edge
    const rag = 0.35 * (tex(lx * 3 + 11, ly * 3) - 0.5);
    const d = Math.max(Math.abs(lx) - hx, Math.abs(ly) - hy) + rag;
    const p = y * W + x;
    // its shadow on the broth, down and to the right
    const sxl = (dx - 1.6) * ca + (dy - 1.8) * sa, syl = -(dx - 1.6) * sa + (dy - 1.8) * ca;
    const sd = Math.max(Math.abs(sxl) - hx, Math.abs(syl) - hy);
    if (sd < 1 && d > -0.5) { const k = 1 - 0.7 * kit.clamp(0.5 - sd * 0.6) * alpha, o = 3 * p; img[o] *= k; img[o + 1] *= k; img[o + 2] *= k; }
    const a = edge(d) * alpha;
    if (a <= 0) continue;
    // fibrous, with a sheen band and a darker soaked foot
    const fib = 0.7 + 0.6 * tex(lx * 2.2 + 30, ly * 0.9 + 7);
    const sheen = (Math.exp(-((lx * 1.2 + ly * 0.5 + 6) ** 2) / 10) + 0.5 * Math.exp(-((lx * 1.2 + ly * 0.5 - 10) ** 2) / 6)) * 0.55;
    const wet = 1 - 0.5 * kit.smoothstep(12, 22.5, ly) - 0.6 * soak;
    let r = (NORI[0] * fib + NORI_SHEEN[0] * sheen) * wet, g = (NORI[1] * fib + NORI_SHEEN[1] * sheen) * wet, b = (NORI[2] * fib + NORI_SHEEN[2] * sheen) * wet;
    const rimL = kit.clamp(1 + d) * 0.6 * wet; // crisp lit edge
    r += NORI_SHEEN[0] * rimL; g += NORI_SHEEN[1] * rimL; b += NORI_SHEEN[2] * rimL;
    const k = ink[p];
    if (k > 0) { r += (INK[0] - r) * k; g += (INK[1] - g) * k; b += (INK[2] - b) * k; }
    over(p, r, g, b, a);
  }
}

/** A chopstick: capsule from tip (tx, ty) along (ux, uy), height h for its shadow. */
function stick(tx, ty, ux, uy, len, h, base, hi, shadowPass) {
  const bx = tx + ux * len, by = ty + uy * len;
  const ox = shadowPass ? 1.5 + 3 * h : 0, oy = shadowPass ? 2 + 3.5 * h : 0;
  const ax0 = tx + ox, ay0 = ty + oy, ax1 = bx + ox, ay1 = by + oy;
  const x0 = Math.max(0, Math.floor(Math.min(ax0, ax1) - 3)), x1 = Math.min(W - 1, Math.ceil(Math.max(ax0, ax1) + 3));
  const y0 = Math.max(0, Math.floor(Math.min(ay0, ay1) - 3)), y1 = Math.min(W - 1, Math.ceil(Math.max(ay0, ay1) + 3));
  if (x0 > x1 || y0 > y1) return;
  const L2 = len * len, nx = -uy, ny = ux;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const px = x - ax0, py = y - ay0;
    let t = (px * ux * len + py * uy * len) / L2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = px - ux * len * t, qy = py - uy * len * t, d = Math.sqrt(qx * qx + qy * qy);
    const R = 0.95 + 0.8 * t;
    const p = y * W + x, o = 3 * p;
    if (shadowPass) {
      const a = kit.clamp((R + 1 - d) / 1.6) * (0.75 - 0.4 * h);
      if (a > 0) { const k = 1 - a; img[o] *= k; img[o + 1] *= k; img[o + 2] *= k; }
    } else {
      const a = kit.clamp(R + 0.5 - d);
      if (a <= 0) continue;
      const side = (qx * nx + qy * ny) / R; // -1..1 across the stick
      const lit = kit.clamp(0.35 + 0.65 * (1 - Math.abs(side + 0.45)));
      const sp = Math.max(0, 1 - Math.abs(side + 0.5) * 4) * 0.8;
      over(p, base[0] * lit + hi[0] * sp, base[1] * lit + hi[1] * sp, base[2] * lit + hi[2] * sp, a);
    }
  }
}
function pair(tx, ty, ang, spread, len, h, base, hi, shadowPass) {
  const ux = Math.cos(ang), uy = Math.sin(ang), nx = -uy, ny = ux;
  // two sticks, tips spread apart by `spread`, nearly parallel
  for (const s of [-1, 1]) {
    const a2 = ang + s * 0.035;
    stick(tx + nx * s * spread / 2, ty + ny * s * spread / 2, Math.cos(a2), Math.sin(a2), len, h, base, hi, shadowPass);
  }
}

// ---------------------------------------------------------------- frame
export default {
  name: 'Ramen',
  blurb: 'a bowl of ramen from above: the minutes are noodles laid in the broth, the hour is brushed on the nori; each minute is slurped away and the chef lowers the next, the hour is a ladle of fresh broth that whirls the bowl',
  layouts: ['hub'], look: 'smoke', fps: 60, brightness: 0.34, dither: true,
  frame(ctx) {
    const ms = ctx.date.getTime(), mi = Math.floor(ms / 60000), t = (ms - mi * 60000) / 1000, now = ms / 1000;
    const nowD = ctx.date, prevD = new Date(mi * 60000 - 1);
    const hh = nowD.getHours(), mm = pad(nowD.getMinutes()), pm = pad(prevD.getMinutes()), ph = prevD.getHours();
    const turning = t < TURN, hourShow = t < HOURSHOW && ph !== hh;
    const dim = 1 - 0.55 * ctx.night;

    cov.fill(0); shade.fill(0); halo.fill(0); ink.fill(0);
    ripples.length = 0;

    // ---- the minutes: noodles. Changing digits are slurped, then laid anew.
    const ch = [turning && pm[0] !== mm[0], turning && pm[1] !== mm[1]];
    let gripX = 0, gripY = 0, lift = 0, slurpC = 0, nch = 0, layC = 0, layTot = 0;
    let diner = null, chef = null;
    if (ch[0] || ch[1]) {
      // grip: by the start of the old noodles, then lifted toward the diner
      for (let k = 0; k < 2; k++) if (ch[k]) {
        const G = sampleDigit(+pm[k], SW, SH);
        gripX += SLOT[k][0] + G.x[0]; gripY += SLOT[k][1] + G.y[0]; nch++;
      }
      gripX /= nch; gripY /= nch;
      lift = kit.ease.inOut(kit.clamp((t - 0.45) / 0.3));
      gripX += 3 * lift; gripY += 4 * lift;
      const sl = kit.clamp((t - 0.72) / 0.85);
      slurpC = 135 * sl * sl; // accelerating: the slurp
      const inA = kit.ease.out(kit.clamp(t / 0.45)), outA = kit.ease.in(kit.clamp((t - 1.5) / 0.4));
      diner = [kit.lerp(gripX + 34, gripX, inA) + 14 * outA, kit.lerp(gripY + 42, gripY, inA) + 50 * outA,
        kit.smoothstep(0.32, 0.48, t), lift];
      ripples.push([gripX, gripY, 0.48, 1]);
      ripples.push([gripX + 4, gripY + 10, 1.1, 0.7]);
      // the chef lays the new noodles, tens first, with long chopsticks
      const segs = [];
      for (let k = 0; k < 2; k++) if (ch[k]) segs.push(k);
      let acc = 0, px = 0, py = 0;
      const starts = [];
      for (const k of segs) {
        const G = sampleDigit(+mm[k], SW, SH);
        const sx = SLOT[k][0] + G.x[0], sy = SLOT[k][1] + G.y[0];
        if (starts.length) acc += Math.hypot(sx - px, sy - py);
        starts.push(acc);
        acc += G.layLen;
        px = SLOT[k][0] + G.x[G.n - 1]; py = SLOT[k][1] + G.y[G.n - 1];
      }
      layTot = acc;
      const lu = kit.ease.inOut(kit.clamp((t - 1.65) / 1.15));
      layC = layTot * lu;
      // where the chef's tips are
      let tx = 0, ty = 0;
      for (let q = 0; q < segs.length; q++) {
        const k = segs[q], G = sampleDigit(+mm[k], SW, SH), c = layC - starts[q];
        if (q > 0 && c < 0) {
          // gliding from the end of the tens to the start of the ones
          const Gp = sampleDigit(+mm[segs[0]], SW, SH), gap = starts[q] - (starts[0] + Gp.layLen);
          const u = gap > 0 ? kit.clamp(1 + c / gap) : 1;
          const ex = SLOT[segs[0]][0] + Gp.x[Gp.n - 1], ey = SLOT[segs[0]][1] + Gp.y[Gp.n - 1];
          if (layC >= starts[0] + Gp.layLen) { tx = kit.lerp(ex, SLOT[k][0] + G.x[0], u); ty = kit.lerp(ey, SLOT[k][1] + G.y[0], u); }
          break;
        }
        layTip(G, c);
        tx = SLOT[k][0] + TR[0]; ty = SLOT[k][1] + TR[1];
        if (c < G.layLen) break;
      }
      const cin = kit.ease.out(kit.clamp((t - 1.3) / 0.35)), cout = kit.ease.in(kit.clamp((t - 2.8) / 0.4));
      chef = [tx + 10 * (1 - cin) + 4 * cout, kit.lerp(-22, ty, cin) - 70 * cout, 1 - layC / (layTot || 1), t];
      if (t > 1.3) ripples.push([chef[0], chef[1], 1.65, 0.8]);
      ripples.push([px, py, 2.8, 0.6]);
    }
    for (let k = 0; k < 2; k++) {
      if (!ch[k]) noodles(+mm[k], SLOT[k][0], SLOT[k][1], now, 0, 0, 0, 0, 0);
      else {
        if (t < 1.75) noodles(+pm[k], SLOT[k][0], SLOT[k][1], now, 1, slurpC, gripX, gripY, lift);
        if (t > 1.6) {
          // this digit's own lay coordinate
          let c = layC;
          if (k === 1 && ch[0]) {
            const G0 = sampleDigit(+mm[0], SW, SH), G1 = sampleDigit(+mm[1], SW, SH);
            c -= G0.layLen + Math.hypot(SLOT[1][0] + G1.x[0] - SLOT[0][0] - G0.x[G0.n - 1], SLOT[1][1] + G1.y[0] - SLOT[0][1] - G0.y[G0.n - 1]);
          }
          if (c > 0) noodles(+mm[k], SLOT[k][0], SLOT[k][1], now, 2, c, 0, 0, 0);
        }
      }
    }
    // the bundle still held by the chef: a loose loop of noodle
    if (chef && t > 1.3 && chef[2] > 0.01) {
      const rr = 0.8 + 2.2 * chef[2];
      for (let k = 0; k < 28; k++) {
        const a = k / 28 * kit.TAU * 2 + now * 3;
        stamp(chef[0] + Math.cos(a) * rr * (0.7 + 0.3 * Math.sin(k)), chef[1] - 1.5 + Math.sin(a) * rr * 0.8, 1.0, 2.8, 2.4, 3);
      }
    }

    // ---- hour show state: ladle, whirl, nori swap
    let whirl = 0, pour = 0, ladle = null;
    if (hourShow) {
      whirl = kit.ease.inOut(kit.clamp((t - 0.7) / 4.0));
      pour = kit.smoothstep(0.6, 0.9, t) * (1 - kit.smoothstep(2.3, 2.6, t));
      const inA = kit.ease.out(kit.clamp(t / 0.6)), outA = kit.ease.in(kit.clamp((t - 2.6) / 0.7));
      ladle = [kit.lerp(76, 50, inA) + 30 * outA, kit.lerp(-14, 26, inA) - 44 * outA];
      if (pour > 0) for (let k = 0; k < 4; k++) ripples.push([ladle[0] - 6, ladle[1] + 2, 0.75 + k * 0.4, 0.9]);
    }
    const PHI = whirl * kit.TAU; // the toppings make exactly one turn

    // ---- broth, rim, oil
    for (let k = 0; k < OILS.length; k++) {
      const o = OILS[k];
      const a = o.a0 + now * o.w + PHI * o.turns * 0.999999;
      const rr = o.rr + o.wob * Math.sin(now * o.wf + o.ph);
      oilX[k] = CX + Math.cos(a) * rr; oilY[k] = CY + Math.sin(a) * rr;
      oilR2[k] = o.r * o.r;
    }
    OF.fill(0); OGX.fill(0); OGY.fill(0);
    for (let k = 0; k < OILS.length; k++) {
      const bx = oilX[k], by = oilY[k], r2 = oilR2[k];
      const x0 = Math.max(0, Math.ceil(bx - 5.4)), x1 = Math.min(W - 1, Math.floor(bx + 5.4));
      const y0 = Math.max(0, Math.ceil(by - 5.4)), y1 = Math.min(W - 1, Math.floor(by + 5.4));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const dx = x - bx, dy = y - by, d2 = dx * dx + dy * dy + 0.2;
        if (d2 > 30) continue;
        const p = y * W + x, f = r2 / d2;
        OF[p] += f; OGX[p] += f * dx / d2; OGY[p] += f * dy / d2;
      }
    }
    const swirl = whirl * (1 - whirl) * 4;
    const st = now * 0.05;
    for (let p = 0; p < N; p++) {
      const o = 3 * p, r = rad[p], x = p & 63, y = p >> 6;
      if (r > R_RIM + 0.5) { img[o] = img[o + 1] = img[o + 2] = 0; continue; }
      let cr, cg, cb;
      if (r > R_BROTH) {
        cr = RIMC[o]; cg = RIMC[o + 1]; cb = RIMC[o + 2];
      } else {
        // broth: deep at the wall, flowing texture, swirl at the hour
        const depth = DEPTH[p];
        let sx = x, sy = y;
        if (whirl > 0 && whirl < 1) {
          const a = PHI + 3.2 * swirl * (1 - r / R_BROTH), c = Math.cos(a), s = Math.sin(a);
          const dx = x - CX, dy = y - CY; sx = CX + dx * c - dy * s; sy = CY + dx * s + dy * c;
        }
        const n1 = tex(sx * 0.8 + st * 7, sy * 0.8 + st * 3);
        const n2 = tex(sx * 1.6 - st * 9 + n1 * 6, sy * 1.6 + st * 5);
        let lum = 0.7 + 0.45 * n1 + 0.25 * (n2 - 0.5) + swirl * 0.5 * (n2 - 0.5);
        // ripples
        for (let k = 0; k < ripples.length; k++) {
          const R0 = ripples[k], age = t - R0[2];
          if (age <= 0 || age > 2.2) continue;
          const d = Math.hypot(x - R0[0], y - R0[1]) - age * 9;
          if (d > 3 || d < -6) continue;
          lum += R0[3] * Math.sin(d * 1.6) * Math.exp(-d * d * 0.18) * Math.exp(-age * 1.6) * 0.9;
        }
        if (swirl > 0) lum *= 1 - 0.6 * swirl * Math.exp(-r * r / 20); // the vortex dimple
        const ea = r > R_BROTH - 0.5 ? R_BROTH + 0.5 - r : 1;
        cr = (BROTH_DEEP[0] + (BROTH[0] - BROTH_DEEP[0]) * depth) * lum * ea;
        cg = (BROTH_DEEP[1] + (BROTH[1] - BROTH_DEEP[1]) * depth) * lum * ea;
        cb = (BROTH_DEEP[2] + (BROTH[2] - BROTH_DEEP[2]) * depth) * lum * ea;
        // oil beads: a merging field, bright meniscus, glint
        const F = OF[p], gx = OGX[p], gy = OGY[p];
        if (F > 0.6) {
          const inside = kit.smoothstep(0.75, 1.15, F);
          const rim = inside * (1 - kit.smoothstep(1.2, 2.4, F));
          const gl = kit.clamp((-gx - gy) * 0.9 - 0.2) * inside; // lit from the top-left
          cr += (OIL[0] * (0.10 + 0.25 * rim) + GLINT[0] * gl * 0.55) * depth;
          cg += (OIL[1] * (0.10 + 0.25 * rim) + GLINT[1] * gl * 0.55) * depth;
          cb += (OIL[2] * (0.10 + 0.25 * rim) + GLINT[2] * gl * 0.55) * depth;
        }
        // noodle moat and cast shadows
        const hl = 1 - 0.9 * halo[p];
        cr *= hl; cg *= hl; cb *= hl;
      }
      img[o] = cr; img[o + 1] = cg; img[o + 2] = cb;
    }

    // ---- toppings (they ride the whirl and resettle exactly)
    const cP = Math.cos(PHI), sP = Math.sin(PHI);
    const rotX = (x, y) => CX + (x - CX) * cP - (y - CY) * sP, rotY = (x, y) => CY + (x - CX) * sP + (y - CY) * cP;
    const bob = (k) => 0.3 * Math.sin(now * 0.4 + k * 1.9);
    const tops = [[48, 15, 7.5, 0.55, eggShape], [18.5, 52.5, 5.6, now * 0.05, narutoShape], [32, 12.5, 7.4, 0.3, chashuShape]];
    for (let k = 0; k < SCALLIONS.length; k++) {
      const [sx, sy] = SCALLIONS[k];
      const bx = sx + bob(k + 5), by = sy + bob(k + 9);
      topping(rotX(bx, by), rotY(bx, by), 2.8, k * 0.8 + PHI * 2, scallionShape, 1);
    }
    for (let k = 0; k < tops.length; k++) {
      const [sx, sy, ext, rot, shape] = tops[k];
      const bx = sx + bob(k), by = sy + bob(k + 3);
      topping(rotX(bx, by), rotY(bx, by), ext, rot + PHI * 1.0, shape, 1);
    }

    // ---- nori with the hour
    const NX = 12.4, NY = 23.5, NR = -0.07;
    // At the hour the chef slides a fresh sheet in from the top, over the
    // old one; only once it is down does the old one soak and sink away
    // beneath it. The hour is never off the face.
    const inU = hourShow ? kit.clamp((t - 1.25) / 0.7) : 1; // only once the old minutes are gone
    if (inU < 1 || (hourShow && t < 2.6)) {
      const sink = kit.smoothstep(1.7, 2.6, t);
      // the ladle's splash soaks it: its ink runs off before the new sheet covers it
      const soakInk = 1 - kit.smoothstep(0.95, 1.3, t);
      if (soakInk > 0) brushHour(ph, NX, NY + 3 * sink, Math.cos(NR + 0.1 * sink), Math.sin(NR + 0.1 * sink), soakInk);
      nori(NX, NY + 3 * sink, NR + 0.1 * sink, 1 - sink, sink, now);
      ink.fill(0);
    }
    {
      const a = kit.ease.outBack(inU), y = kit.lerp(-28, NY, a) + bob(7) * 0.5, r = NR - 0.25 * (1 - kit.ease.out(inU));
      if (inU > 0) {
        brushHour(hh, NX, y, Math.cos(r), Math.sin(r), 1);
        nori(NX, y, r, 1, 0, now);
      }
    }

    // ---- the noodles themselves
    for (let p = 0; p < N; p++) {
      const a = cov[p];
      if (a <= 0) continue;
      const s = shade[p], lum = 0.5 + 0.6 * s, spec = s > 0.85 ? (s - 0.85) * 2.5 : 0;
      over(p, NOODLE[0] * lum + spec, NOODLE[1] * lum + spec, NOODLE[2] * lum + spec * 0.8, a);
    }

    // ---- chopsticks
    if (diner && diner[1] < W + 6) {
      // the diner's lacquered pair, in from the bottom right
      const spread = kit.lerp(3.2, 1.1, diner[2]), h = 0.3 + 0.7 * diner[3];
      pair(diner[0], diner[1], 1.05, spread, 75, h, null, null, true);
      pair(diner[0], diner[1], 1.05, spread, 75, h, LACQUER, LACQ_HI, false);
    }
    if (chef && t > 1.3 && chef[1] > -40) {
      // the chef's long bamboo cooking chopsticks, from the top
      const spread = 1.1 + 2.2 * kit.smoothstep(2.75, 2.95, t), h = 0.4 + 0.6 * chef[2];
      pair(chef[0], chef[1] - 1, -1.2, spread, 90, h, null, null, true);
      pair(chef[0], chef[1] - 1, -1.2, spread, 90, h, BAMBOO, BAMBOO_HI, false);
    }

    // ---- the ladle of fresh broth
    if (ladle) {
      const [lx, ly] = ladle, tilt = pour;
      stick(lx + 4, ly - 4, 0.6, -0.8, 50, 1, null, null, true);
      stick(lx + 4, ly - 4, 0.6, -0.8, 50, 1, STEEL, STEEL_HI, false);
      const ry = 6.2 * (1 - 0.35 * tilt);
      for (let y = Math.max(0, Math.floor(ly - 8)); y <= Math.min(W - 1, ly + 8); y++) for (let x = Math.max(0, Math.floor(lx - 8)); x <= Math.min(W - 1, lx + 8); x++) {
        const dx = (x - lx) / 6.2, dy = (y - ly) / ry, q = Math.sqrt(dx * dx + dy * dy);
        const a = kit.clamp((1 - q) * 6.2 + 0.5);
        if (a <= 0) continue;
        const p = y * W + x;
        // steel lip round a pool of fresh, brighter broth
        const lip = q > 0.78;
        const sh = 0.5 + 0.5 * kit.clamp(-dx - dy);
        if (lip) over(p, STEEL[0] * sh + STEEL_HI[0] * 0.2, STEEL[1] * sh + STEEL_HI[1] * 0.2, STEEL[2] * sh + STEEL_HI[2] * 0.2, a);
        else {
          const f = 1.4 * (0.8 + 0.4 * tex(x * 2 + now * 20, y * 2));
          over(p, BROTH[0] * f, BROTH[1] * f, BROTH[2] * f, a);
        }
      }
      // the pour: a bright stream foot with splash
      if (pour > 0) {
        const px = lx - 6, py = ly + 2;
        for (let y = Math.max(0, Math.floor(py - 3)); y <= Math.min(W - 1, py + 3); y++) for (let x = Math.max(0, Math.floor(px - 3)); x <= Math.min(W - 1, px + 3); x++) {
          const d = Math.hypot(x - px, y - py), fl = 0.7 + 0.3 * Math.sin(now * 40 + x * 2 + y);
          const a = kit.clamp(2.4 - d) * pour * fl;
          if (a > 0) over(y * W + x, OIL[0] * 0.9, OIL[1] * 0.8, OIL[2] * 0.6, a * 0.8);
        }
      }
    }

    // ---- steam: soft curls drifting up off the bowl
    const steamK = (0.04 + (hourShow ? 0.05 * (1 - kit.smoothstep(3, 5, t)) * kit.smoothstep(0.6, 1.4, t) : 0)) * (1 - 0.6 * ctx.night);
    for (let p = 0; p < N; p++) {
      const x = p & 63, y = p >> 6;
      const w = tex(x * 0.9 + now * 1.3, y * 0.9 + now * 4.0);
      const v = tex(x * 0.55 + w * 9 - now * 0.7, y * 0.7 + now * 5.5);
      let s = v - 0.52;
      if (s <= 0) continue;
      s = s * s * 14 * steamK * (0.4 + 0.6 * kit.smoothstep(38, 10, rad[p] * 0.6 + (y - 10) * 0.5 + 10));
      const o = 3 * p;
      img[o] += s; img[o + 1] += s * 0.97; img[o + 2] += s * 0.92;
    }

    kit.blitGrid(ctx, img, dim);
  },
};
