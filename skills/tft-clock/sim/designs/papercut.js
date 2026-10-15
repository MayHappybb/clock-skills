// Window Flowers (chuanghua): a lattice window at New Year, its rice paper lit
// from behind, with two red paper-cuts pasted on it. The hours are cut
// through a round window flower (a tuanhua, folded in 16 and cut), the
// minutes through a carp. The digits are yin cuts: holes, so the time is the
// light itself coming through the paper. Each stroke is a separate cut in
// the cutter's vocabulary, crescent moons for bowls and willow leaves for
// straight strokes, pointed at both ends with a sawtooth on the outer edge
// of each bowl; strokes never meet where a counter would fall out, so every
// island is held by a bridge and each paper-cut stays one piece.
//
// Always alive: the paper bows on its tape in the draught (a flat row shear,
// a fraction of a pixel), the carp's tail beats, the light behind the paper
// drifts and glows through the cuts (it spills round the digits), a plum
// branch outside sways its soft shadow across the paper, snowflake shadows
// drift down it, and a light runs once a minute round the flower's lace:
// the seconds.
//
// Minute: before :00 a fresh slip of red paper, torn from the sheet, falls
// over each digit that will change (its shadow first holds the old light
// off evenly), and settles opaque in the sheet. After :00 each changing
// digit gets its own pair of scissors, all cutting at once; as they run,
// the digit's whole thin outline opens evenly (never a partial set of
// strokes), then all its pieces pop out together and flutter away and the
// light floods through. Blank time ~0.8 s, midnight included.
// Hour: the scissors snip the flower's old rim off petal by petal (the
// petals fall), a folded wedge of new paper comes down and unfolds, fold by
// fold, into a new rim (one of four patterns, a new one each hour), a front
// of light sweeps the window and the carp leaps.
// Night: the lamp is lit inside; the paper glows a deep cinnabar, the cuts
// glow pink, the light flickers, and the backlight dims.
//
// Colour: one hue, cinnabar (355 deg), a 64-step ramp from an oxblood almost
// black to the pink-white of light through rice paper (papercut-art.js),
// all of it chosen on the RGB565 grid to stay on hue. Every pixel of the
// main pass is a 10-bit value dithered between two ramp entries; the
// scissors, falling pieces and frame are drawn with ramp colours too.
// Hard or AA: everything is AA (coverage tables), because everything sways.
//
// Cost: one integer pass over the glass (light field, two bilinear lookups
// in the paper-cut tables, one in a digit table, a ramp lookup) charged to
// g.cost.box; the shapes on top are kit shapes. During a cut the digit's
// table is rebuilt per frame (~1.7 KB, ~7k cycles); during the hour show the
// flower's 78 x 78 paper map is rebuilt per frame (~60k cycles). All of it
// is inside the frame's estimate. Flash and RAM: FLASH_BYTES, RAM_BYTES.

import { clockFields, sin, cos, noise, noise2, rand, ease, clamp, roundRectDist } from '../js/kit.js';
import { HOUR, MIN, PAD, pathAt, GLYPH_BYTES } from './papercut-glyphs.js';
import { RAMP, shade, FISH, FISH_MAP, TAIL_W, MIN_SLOTS, MED, MED_MAP, MED_ANG, MED_RAD, HOUR_SLOTS, DISC_R, PETAL, SECTOR, ART_BYTES, BRANCH, BRANCH_MAP } from './papercut-art.js';

const W = 160, H = 80;
const B16 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const TAU = Math.PI * 2;

// ------------------------------------------------------------ working buffers (RAM)
const V = new Int16Array(W * H);                  // the frame as 10-bit values
const MBUF = new Uint8Array(MED.w * MED.h);       // the flower's paper, rebuilt during the hour show
const FLAP = new Uint8Array(MED.w * MED.h);       // where a turning fold is (it is drawn a shade darker)
const EFF = [0, 1, 2, 3].map((k) => new Uint8Array((k < 2 ? HOUR : MIN)[0].tw * (k < 2 ? HOUR : MIN)[0].th));
const rowM = new Int32Array(H), rowF = new Int32Array(H), colF = new Int32Array(FISH.w);
const gx = new Int32Array(W), gy = new Int32Array(H), band = new Int32Array(W);
export const RAM_BYTES = V.length * 2 + MBUF.length * 2 + EFF.reduce((a, e) => a + e.length, 0) + (H * 3 + FISH.w + W * 2 + H) * 4 + 4 * (W + H) * 4;   // + slip shadow profiles
export const FLASH_BYTES = GLYPH_BYTES + ART_BYTES + W * H + 66 * 34 + 257 * 4 + 9200;   // + paper fibres, branch shadow, gauss table, slips

// ------------------------------------------------------------ the minute's jobs
// Slots 0, 1 are the hours (in the flower), 2, 3 the minutes (in the carp).
const GLY = (k) => (k < 2 ? HOUR : MIN);
const ORIGIN = (k) => (k < 2 ? HOUR_SLOTS[k] : MIN_SLOTS[k - 2]);
const T_CUT = [0.5, 0.45], CUT0 = 0.03, LEAF_GAP = 0.012, REVEAL = 0.16;
const OUTLINE = 1.7;                               // the hairline outline is whole by 1 / OUTLINE of the trace
const TRAIL = 9;                                   // px of bright fresh cut behind the blades
const DIM0 = 59.1, DIM1 = 59.4, DIM_TO = 0.1;      // the old cut's light is held off as the slip comes
const FALL0 = 59.32, FALL1 = 59.62, SETTLE = 0.22;  // the slip falls in and settles
const SLIP_FADE = 0.6;                             // after the new digit is out, the slip merges into the sheet
const ARRIVE0 = 59.3;                              // scissors fly in
const EXIT = [[-22, 34], [52, -26], [104, -26], [182, 30]];   // where each digit's scissors come from and go back to
const PARK = [-16, 92];                            // where the flower's scissors wait during the hour show

/** A slot's cut this minute (from -> to), or null: all changing digits are cut at once, each by its own pair. */
function slotPlan(k, from, to) {
  if (from[k] === to[k]) return null;
  const G = GLY(k)[+to[k]], t1 = CUT0 + T_CUT[k < 2 ? 0 : 1];
  return { k, d: +to[k], t0: CUT0, t1, revEnd: t1 + 0.02 + LEAF_GAP * (G.polys.length - 1) + REVEAL };
}
/** Screen point of a slot's glyph path at path fraction u (before sway), heading smoothed over 3 px. */
function pathPoint(k, d, u) {
  const G = GLY(k)[d], [ox, oy] = ORIGIN(k), L = u * G.total, p = pathAt(G, L);
  const a = pathAt(G, L - 1.5), b = pathAt(G, L + 1.5);
  return [ox - PAD + p[0], oy - PAD + p[1], b[0] === a[0] && b[1] === a[1] ? p[2] : Math.atan2(b[1] - a[1], b[0] - a[0])];
}
/** Turn from heading a toward b by u, the short way round. */
function turn(a, b, u) {
  let d = b - a;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return a + d * u;
}
/**
 * Where slot k's scissors are at second s of this minute, given this
 * minute's cut (P) and the next minute's (NP), or null. The flower's first
 * pair also snips the rim at the hour. Returns [x, y, angle, snipping 0/1].
 */
function scissorsAt(k, s, P, NP, rimJob) {
  // flying in for the next minute's cut
  if (NP && s >= ARRIVE0) {
    const [tx, ty, ta] = pathPoint(k, NP.d, 0);
    const from = rimJob ? PARK : EXIT[k];
    const u = ease.inOutCubic(clamp((s - ARRIVE0) / (60 + CUT0 - ARRIVE0), 0, 1));
    return [from[0] + (tx - from[0]) * u, from[1] + (ty - from[1]) * u, turn(Math.atan2(ty - from[1], tx - from[0]), ta, smooth((u - 0.4) / 0.6)), 0];
  }
  // the hour: running round the flower's rim, snipping it off
  if (rimJob && s >= RIM0 - 0.35) {
    if (s < RIM0) { const u = ease.outCubic((s - RIM0 + 0.35) / 0.35), [tx, ty] = rimPoint(0); return [EXIT[0][0] + (tx - EXIT[0][0]) * u, EXIT[0][1] + (ty - EXIT[0][1]) * u, -0.9, 0]; }
    if (s > RIM1) { const [ax, ay] = rimPoint(1), v = ease.inOutCubic(clamp((s - RIM1) / 0.9, 0, 1)); return [ax + (PARK[0] - ax) * v, ay + (PARK[1] - ay) * v, -0.6 * v, 0]; }
    const u = clamp((s - RIM0) / (RIM1 - RIM0), 0, 1), [x, y] = rimPoint(u);
    return [x, y, u * TAU, 1];
  }
  if (!P) return null;
  if (s < P.t0) { const [tx, ty, a] = pathPoint(k, P.d, 0); return [tx, ty, a, 0]; }
  if (s < P.t1) { const [x, y, a] = pathPoint(k, P.d, (s - P.t0) / (P.t1 - P.t0)); return [x, y, a, 1]; }
  // done: away again
  const u = (s - P.t1 - 0.06) / 0.5;
  if (u > 1) return null;
  const [ax, ay, a0] = pathPoint(k, P.d, 1), e = EXIT[k], v = ease.inCubic(clamp(u, 0, 1));
  return [ax + (e[0] - ax) * v, ay + (e[1] - ay) * v, turn(a0, Math.atan2(e[1] - ay, e[0] - ax), smooth(u / 0.4)), 0];
}

// ------------------------------------------------------------ the hour: a new rim
const RIM0 = 56.4, RIM1 = 57.4;                    // the old rim is snipped off, petal by petal
const WEDGE0 = 57.5, WEDGE1 = 57.95;              // the folded wedge comes down
const UNF = [58.0, 58.28, 58.62, 59.05, 59.62], UNF0 = UNF[0], UNF_END = UNF[4];   // four folds open, each slower than the last
const variant = (h) => h % 4;
const rimPoint = (u) => [MED.cx + (DISC_R + 0.6) * Math.sin(u * TAU), MED.cy - (DISC_R + 0.6) * Math.cos(u * TAU)];
const petalT0 = (k) => RIM0 + ((k + 0.5) / 16) * (RIM1 - RIM0);
// the folds: [stack from, stack to, fold at, opens clockwise?], in sectors from the top
const FOLDS = [[-0.5, 0.5, 0.5, true], [-0.5, 1.5, -0.5, false], [-2.5, 1.5, 1.5, true], [-2.5, 5.5, -2.5, false]];
const DR4 = Math.round(DISC_R * 4);

/** Bilinear lookup in a w-wide byte map at (x, y) in its own pixel coordinates (0 outside). */
const ifloor = (v) => { const t = v | 0; return t > v ? t - 1 : t; };
function bil(map, w, h, x, y) {
  x -= 0.5; y -= 0.5;
  const ix = ifloor(x), iy = ifloor(y);
  if (ix < 0 || iy < 0 || ix >= w - 1 || iy >= h - 1) return 0;
  const fx = x - ix, fy = y - iy, i = iy * w + ix;
  return (map[i] * (1 - fx) + map[i + 1] * fx) * (1 - fy) + (map[i + w] * (1 - fx) + map[i + w + 1] * fx) * fy;
}

/**
 * The flower's paper during the hour show, into MBUF (and FLAP). `t` is
 * seconds from the start of the outgoing minute (so up to ~60.5).
 */
function buildRim(t, vOld, vNew) {
  const OLD = MED_MAP[vOld], NEW = MED_MAP[vNew], w = MED.w, h = MED.h;
  FLAP.fill(0);
  let step = -1, c = 0, slide = 0;
  if (t >= UNF0) { step = t >= UNF[3] ? 3 : t >= UNF[2] ? 2 : t >= UNF[1] ? 1 : 0; c = -Math.cos(Math.PI * ease.inOutQuad(clamp((t - UNF[step]) / (UNF[step + 1] - UNF[step]), 0, 1))); }
  else if (t >= WEDGE0) slide = -36 * (1 - ease.outCubic(clamp((t - WEDGE0) / (WEDGE1 - WEDGE0), 0, 1)));
  let flapV = 0, A = -0.5, B = 0.5, ux = 0, uy = 0, vx = 0, vy = 0, sT = 0, cT = 0, ic = 0;
  if (step >= 0) {
    const [a0, b0, F, cw] = FOLDS[step];
    A = a0; B = b0;
    if (t >= UNF_END) { A = -8; B = 8; }
    const Fr = F * SECTOR, K = (b0 - a0) * SECTOR;
    ux = Math.sin(Fr); uy = -Math.cos(Fr);
    vx = cw ? Math.cos(Fr) : -Math.cos(Fr); vy = cw ? Math.sin(Fr) : -Math.sin(Fr);
    sT = Math.sin(K); cT = Math.cos(K); ic = Math.abs(c) > 0.03 ? 1 / c : 0;
    flapV = 255 * (1 - Math.abs(c)) * 0.8 + (c < 0 ? 50 : 0);
  }
  let n = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (MED_RAD[i] < DR4) { MBUF[i] = NEW[i]; continue; }
      n++;
      let a = MED_ANG[i] / 256;
      if (a > 8) a -= 16;
      let cov = 0;
      if (t < WEDGE0) {
        // snipping: a fold of the old rim stays until the scissors pass its far edge
        let k = ifloor(a + 0.5); if (k < 0) k += 16;
        cov = t >= RIM0 && petalT0(k) <= t ? 0 : OLD[i];
      } else if (step < 0) {
        const py = y - slide;
        if (py >= 0 && py < h) {
          const j = ifloor(py) * w + x;
          let aa = MED_ANG[j] / 256; if (aa > 8) aa -= 16;
          if (aa >= -0.5 && aa <= 0.5 && MED_RAD[j] >= DR4) cov = bil(NEW, w, h, x + 0.5, py + 0.5);
        }
      } else {
        if (a >= A && a <= B) cov = NEW[i];
        if (ic !== 0 && t < UNF_END) {
          // the turning fold: unproject this pixel onto the fold's open position
          const dx = x + 0.5 + MED.x - MED.cx, dy = y + 0.5 + MED.y - MED.cy;
          const al = dx * ux + dy * uy, q = (dx * vx + dy * vy) * ic;
          if (q > 0 && al * sT >= q * cT - 1e-6 && al * al + q * q >= DISC_R * DISC_R) {
            const qx = MED.cx + al * ux + q * vx - MED.x, qy = MED.cy + al * uy + q * vy - MED.y;
            const f = bil(NEW, w, h, qx, qy);
            if (f > cov) cov = f;
            FLAP[i] = (flapV + 0.5) | 0;
          }
        }
      }
      MBUF[i] = cov;
    }
  return n;
}

// ------------------------------------------------------------ things drawn on top
/** Chinese tailor's scissors, flat: two blades from a pivot, two round handles. Tip at (x, y), pointing along a. */
function scissors(g, x, y, a, snip, tod, dark, pin) {
  const dx = cos(a), dy = sin(a), nx = -dy, ny = dx;
  const open = snip ? 0.05 + 0.3 * (0.5 + 0.5 * sin(tod * TAU * 6.5)) : 0.22;
  const px = x - dx * 12, py = y - dy * 12;
  for (const sd of [-1, 1]) {
    const ca = cos(open * sd * 0.5), sa = sin(open * sd * 0.5);
    const bx = dx * ca - dy * sa, by = dx * sa + dy * ca, mx = -by, my = bx;
    g.fillPolygon([[px + mx * 1.7, py + my * 1.7], [px + bx * 13, py + by * 13], [px - mx * 1.2, py - my * 1.2], [px - bx * 1.5, py - by * 1.5]], dark, { aa: true });
    // the handle on the other side of the pivot
    const hx = px - dx * 7 - nx * sd * 3.4, hy = py - dy * 7 - ny * sd * 3.4;
    g.thickLine(px, py, hx + dx * 2, hy + dy * 2, 2, dark, { aa: true });
    g.ring(hx, hy, 1.5, 3.5, dark, { aa: true });
  }
  g.fillCircle(px, py, 1.0, pin, { aa: true });
}

/** A cut piece falling out of the paper: outline pts (+ox, +oy), turned by rot round (cx, cy), moved by (mx, my). */
function piece(g, pts, ox, oy, cx, cy, rot, mx, my, col, back, shadow, a, flip) {
  const c = cos(rot), s = sin(rot), out = new Array(pts.length), sh = new Array(pts.length);
  let cf = cos(flip);
  const face = cf >= 0 ? col : back;
  cf = cf < 0 ? (cf > -0.22 ? -0.22 : cf) : cf < 0.22 ? 0.22 : cf;
  if (cf < 0) cf = -cf;
  for (let i = 0; i < pts.length; i++) {
    const x = (pts[i][0] - cx) * cf, y = pts[i][1] - cy;
    const X = ox + cx + mx + x * c - y * s, Y = oy + cy + my + x * s + y * c;
    out[i] = [X, Y]; sh[i] = [X + 1, Y + 1.3];
  }
  g.fillPolygon(sh, shadow, { aa: true, a: 0.7 * a });
  g.fillPolygon(out, face, { aa: true, a });
}
/** How a piece falls, tau seconds after it lets go: [dx, dy, turn, alpha, flip]. */
const FALL_T = 1.7;
function fall(tau, seed) {
  const r = rand(seed, 7), sx = (r - 0.5) * 2, w = 5 + 4 * rand(seed, 8);
  return [sx * 7 * tau + 3 * sin(tau * 4.5 + seed) * tau, 5 * tau + 30 * tau * tau, (0.8 * sin(tau * 3.5 + seed) + sx * 0.8) * tau, clamp((FALL_T - tau) / 0.35, 0, 1), w * tau * tau * 0.8 + w * 0.4 * tau];
}

// ------------------------------------------------------------ light
const GT = new Int32Array(257);                    // exp(-u^2) for u = i / 64, 0..4, x 256
for (let i = 0; i <= 256; i++) GT[i] = Math.round(256 * Math.exp(-((i / 64) ** 2)));
const gauss = (d, sigma) => { let u = ((d < 0 ? -d : d) * 64) / sigma; u = u | 0; return u > 256 ? 0 : GT[u]; };
const FLAKES = 12;
// rice paper: a faint fibre texture (a flash table), the same day and night
const FIB = new Int8Array(W * H);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) FIB[y * W + x] = Math.round((noise2(x * 0.7, y * 0.22, 11) - 0.5) * 30 + (noise2(x * 0.2, y * 0.9, 12) - 0.5) * 16 + (rand(x, y, 5) - 0.5) * 8);

let lightOps = 0;
function lightField(tod, nt, flare, front) {
  lightOps = W * H * 3;
  const base = 820 - 490 * nt;
  const sx = nt > 0.5 ? 80 + 9 * sin((TAU * tod) / 13) : 80 + 46 * sin((TAU * tod) / 37);
  const sy = nt > 0.5 ? 44 + 3 * sin((TAU * tod) / 7) : 27 + 14 * sin((TAU * tod) / 23 + 1);
  const flick = nt * 46 * (noise(tod * 6.5, 3) - 0.5) + nt * 22 * (noise(tod * 17, 5) - 0.5);
  const amp = 100 + 150 * nt + flick + flare;
  for (let x = 0; x < W; x++) { gx[x] = gauss(x + 0.5 - sx, 52 - 8 * nt); band[x] = front > -99 ? (gauss(x + 0.5 - front, 15) * 150) >> 8 : 0; }
  for (let y = 0; y < H; y++) gy[y] = (gauss(y + 0.5 - sy, 40 - 6 * nt) * amp) >> 8;
  const top = 34 * (1 - nt);
  for (let y = 0, i = 0; y < H; y++) {
    const row = (base + top * (1 - y / H)) | 0, gyy = gy[y];
    for (let x = 0; x < W; x++, i++) V[i] = row + ((gx[x] * gyy) >> 8) + band[x] + FIB[i];
  }
  // the plum branch's shadow, swaying from its base above the window (by day)
  const sh = (170 * (1 - nt)) | 0;
  if (sh > 0) {
    const bw = BRANCH.w, sway = 2.4 * sin((TAU * tod) / 6.1) + 0.8 * sin((TAU * tod) / 2.7 + 2);
    let n = 0;
    for (let y = 0; y < BRANCH.h; y++) {
      const off = (256 * sway * (1 - y / BRANCH.h) * 0.4 + 256 * sway * 0.6 * (y / BRANCH.h)) | 0;
      for (let x = 0; x < bw; x++) {
        const sx = (x << 8) - off, ix = sx >> 8, fx = sx & 255;
        if (ix < 0 || ix >= bw - 1) continue;
        const j = y * bw + ix, v = (BRANCH_MAP[j] * (256 - fx) + BRANCH_MAP[j + 1] * fx) >> 8;
        if (v) { V[(BRANCH.y + y) * W + BRANCH.x + x] -= (v * sh) >> 8; n++; }
      }
    }
    lightOps += BRANCH.w * BRANCH.h * 6;
  }
  // snow falling outside: soft shadows drifting down the paper
  const depth = 120 - 60 * nt;
  for (let k = 0; k < FLAKES; k++) {
    const r = 1.8 + 1.9 * rand(k, 1), v = 5 + 7 * rand(k, 2), d = depth * (0.6 + 0.6 * rand(k, 3));
    const fy = ((rand(k, 4) * 110 + v * tod) % 110) - 15;
    const fx = ((rand(k, 5) * 190 + 2.5 * tod + 4 * sin(tod * (0.5 + rand(k, 6)) + k)) % 190) - 15;
    const x0 = Math.max(0, (fx - r) | 0), x1 = Math.min(W - 1, (fx + r + 1) | 0), y0 = Math.max(0, (fy - r) | 0), y1 = Math.min(H - 1, (fy + r + 1) | 0);
    const ir2 = 1 / (r * r);
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const ex = x + 0.5 - fx, ey = y + 0.5 - fy, q = 1 - (ex * ex + ey * ey) * ir2;
        if (q > 0) V[y * W + x] -= (d * q * q) | 0;
      }
  }
  return base;
}

// ------------------------------------------------------------ the paper-cuts over the light
const HM = [null, null, null, null], HK = new Int32Array(4), GF = new Int32Array(4), GD = new Int8Array(4);
const SX0 = new Int32Array(4), SY0 = new Int32Array(4), STW = new Int32Array(4), STH = new Int32Array(4);
for (let k = 0; k < 4; k++) { const G = GLY(k)[0]; SX0[k] = ORIGIN(k)[0] - PAD; SY0[k] = ORIGIN(k)[1] - PAD; STW[k] = G.tw; STH[k] = G.th; }

// ------------------------------------------------------------ the slips
// A fresh slip of red paper, torn from the sheet (pale fibres on its torn
// edge), one per digit slot; rasterised once (flash).
const SLIP = [0, 1, 2, 3].map((k) => {
  const G = GLY(k)[0], [ox, oy] = ORIGIN(k), ins = 1.5, r = k < 2 ? 7 : 2.5;
  const sw = G.w + 2 * ins, sh = G.h + 2 * ins, mw = Math.ceil(sw) + 5, mh = Math.ceil(sh) + 5;
  const dist = (px, py) => roundRectDist(px, py, 2, 2, sw, sh, r) + 1.1 * (noise2(px * 0.55, py * 0.55, 30 + k) - 0.5) + 0.6 * (noise2(px * 1.7, py * 1.7, 50 + k) - 0.5);
  const m = new Uint8Array(mw * mh), e = new Uint8Array(mw * mh);
  for (let y = 0; y < mh; y++)
    for (let x = 0; x < mw; x++) {
      let n = 0;
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (dist(x + (i + 0.5) / 3, y + (j + 0.5) / 3) < 0) n++;
      m[y * mw + x] = Math.round((n * 255) / 9);
      const d = dist(x + 0.5, y + 0.5);
      e[y * mw + x] = Math.round(255 * clamp(1 - Math.abs(d + 0.5) / 0.7, 0, 1) * clamp(noise2(x * 0.45, y * 0.45, 70 + k) * 2.2 - 0.7, 0, 1));
    }
  return { m, e, mw, mh, x0: ox - ins - 2, y0: oy - ins - 2 };
});
const SON = new Uint8Array(4), SOUT = new Uint8Array(4), SXF = new Int32Array(4), SYF = new Int32Array(4), STONE = new Int32Array(4);
const SHX = [0, 1, 2, 3].map(() => new Int32Array(W)), SHY = [0, 1, 2, 3].map(() => new Int32Array(H)), SSH = new Uint8Array(4);
let slipOps = 0;

/** The slips' state this frame: falling in before :00 (and their shadow), lying in the sheet after it, then merging. */
function slips(s, tod, cur, nxt, plans) {
  slipOps = 0;
  for (let k = 0; k < 4; k++) {
    SON[k] = 0; SOUT[k] = 0; SSH[k] = 0;
    const S = SLIP[k];
    let xo = 0, yo = 0, tone = 0, shadow = 0, sig = 1, lift = 0;
    if (nxt[k] !== cur[k] && s >= DIM0) {
      const u = clamp((s - FALL0) / (FALL1 - FALL0), 0, 1), top = -(S.y0 + S.mh + 2);
      lift = 1 - u;
      yo = top * lift * lift;
      if (s > FALL1) { const w = clamp((s - FALL1) / SETTLE, 0, 1); yo = -0.9 * Math.sin(Math.PI * w) * (1 - w); }
      xo = lift * 3.2 * sin(TAU * 1.4 * s + k);
      SON[k] = s >= FALL0 ? 1 : 0; SOUT[k] = 1; tone = 26;
      shadow = 0.26 * smooth((s - DIM0) / (FALL0 + 0.2 - DIM0)) * (1 - smooth((s - FALL1) / SETTLE));
      sig = 1.2 + 5 * (s < FALL0 ? 1 : lift);
      // the old cut's light is held off evenly by the slip's shadow, before the slip itself covers it
      HK[k] = (HK[k] * (1 - (1 - DIM_TO) * smooth((s - DIM0) / (DIM1 - DIM0)))) | 0; GF[k] = HK[k];
    } else if (plans[k] && s < plans[k].revEnd + SLIP_FADE) {
      SON[k] = 1;
      tone = (26 * (1 - smooth((s - plans[k].revEnd) / SLIP_FADE))) | 0;
    }
    if (!SON[k] && shadow <= 0) continue;
    SXF[k] = ((S.x0 + xo) * 256) | 0; SYF[k] = ((S.y0 + yo) * 256) | 0; STONE[k] = tone;
    if (shadow > 0) {
      // a soft shadow under the slip, sharpening as it comes down
      SSH[k] = 1;
      const off = 1 + 3 * lift, x0 = S.x0 + 2 + off, x1 = S.x0 + S.mw - 3 + off, y0 = S.y0 + 2 + off, y1 = S.y0 + S.mh - 3 + off, st = shadow * 256;
      for (let x = 0; x < W; x++) SHX[k][x] = (256 * smooth((x + 0.5 - x0) / sig + 0.5) * smooth((x1 - x - 0.5) / sig + 0.5)) | 0;
      for (let y = 0; y < H; y++) SHY[k][y] = (st * smooth((y + 0.5 - y0) / sig + 0.5) * smooth((y1 - y - 0.5) / sig + 0.5)) | 0;
      slipOps += (W + H) * 12;
    }
  }
}

/**
 * Lay one paper-cut over the light in V. `map` is its paper (0..255) over
 * box (bx, by, bw, bh); rows shift by rowS[y] and columns by colS[x - bx]
 * (1/256 px); slots k0, k1 are the digits cut in it, and their slips lie on it.
 */
const BOOST = new Int32Array(256);                 // the light running round the rim, by angle
function lay(map, bx, by, bw, bh, rowS, colS, k0, k1, P, flap, rim) {
  const { base, red, bloom, glowA } = P;
  const anySlip = SON[k0] | SON[k1] | SSH[k0] | SSH[k1];
  let nS = 0;
  for (let y = by; y < by + bh; y++) {
    const rs = rowS[y];
    for (let x = bx; x < bx + bw; x++) {
      // where this pixel's paper comes from (fixed point, 1/256 px)
      const cs = colS ? colS[x - bx] : 0;
      const sx = ((x - bx) << 8) - rs, sy = ((y - by) << 8) - cs;
      const ix = sx >> 8, iy = sy >> 8, fx = sx & 255, fy = sy & 255;
      let s = 0;
      if (ix >= 0 && iy >= 0 && ix < bw - 1 && iy < bh - 1) {
        const i = iy * bw + ix;
        s = ((map[i] * (256 - fx) + map[i + 1] * fx) * (256 - fy) + (map[i + bw] * (256 - fx) + map[i + bw + 1] * fx) * fy) >> 16;
      }
      const o = y * W + x;
      let L = V[o];
      // the slips: coverage, torn edge, tone; and their shadows
      let c = 0, cOut = 0, edge = 0, tone = 0, fib = 0;
      if (anySlip) {
        for (let q = k0; q <= k1; q++) {
          if (SSH[q]) { const sh = (SHX[q][x] * SHY[q][y]) >> 8; if (sh > 0) L -= ((L - 140) * sh) >> 8; }
          if (!SON[q]) continue;
          const S = SLIP[q], lx = (x << 8) - rs - SXF[q], ly = (y << 8) - cs - SYF[q], jx = lx >> 8, jy = ly >> 8;
          if (jx < 0 || jy < 0 || jx >= S.mw - 1 || jy >= S.mh - 1) continue;
          nS++;
          const gx2 = lx & 255, gy2 = ly & 255, j = jy * S.mw + jx, m = S.m, e = S.e, mw = S.mw;
          const cc = ((m[j] * (256 - gx2) + m[j + 1] * gx2) * (256 - gy2) + (m[j + mw] * (256 - gx2) + m[j + mw + 1] * gx2) * gy2) >> 16;
          if (cc > c) {
            c = cc; tone = STONE[q];
            edge = ((e[j] * (256 - gx2) + e[j + 1] * gx2) * (256 - gy2) + (e[j + mw] * (256 - gx2) + e[j + mw + 1] * gx2) * gy2) >> 16;
            fib = FIB[(jy + 7 * q) * W + jx + 30 * q];
          }
          if (SOUT[q] && cc > cOut) cOut = cc;
        }
      }
      if (s === 0 && c === 0) { V[o] = L; continue; }   // bare paper
      // a digit cut here?
      let h = 0, gl = 0;
      const k = x < SX0[k1] ? k0 : k1, gxp = ix + bx - SX0[k], gyp = iy + by - SY0[k];
      if (HK[k] > 0 && gxp >= 0 && gyp >= 0 && gxp < STW[k] - 1 && gyp < STH[k] - 1) {
        const tw = STW[k], j = gyp * tw + gxp, m = HM[k], G = GLY(k)[GD[k]].glow;
        h = ((((m[j] * (256 - fx) + m[j + 1] * fx) * (256 - fy) + (m[j + tw] * (256 - fx) + m[j + tw + 1] * fx) * fy) >> 16) * HK[k]) >> 8;
        gl = (G[j] * GF[k]) >> 8;
      }
      if (cOut) { h = (h * (255 - cOut)) >> 8; gl = (gl * (255 - cOut)) >> 8; }   // an old cut under a slip coming down
      let vr = red + (((L - base) * 90) >> 8) + ((gl * glowA) >> 8);
      if (flap) vr -= flap[(y - by) * bw + (x - bx)] >> 1;
      let bo = 0;
      if (rim) { const ii = (y - by) * bw + (x - bx), rr = MED_RAD[ii]; if (rr >= DR4 - 6) { bo = BOOST[MED_ANG[ii] >> 4]; if (rr < DR4) bo = (bo * (rr - DR4 + 6)) / 6 | 0; vr += bo; } }
      if (c) {
        // fresh paper: a touch lighter, its own fibres, a pale torn edge (all merging into the sheet once it is cut)
        const fresh = tone + ((fib * tone) >> 4) + ((edge * tone * 7) >> 8);
        vr += (fresh * c) >> 8;
        if (c > s) s = c;
      }
      let hole = 255 - s + h;
      if (hole > 255) hole = 255;
      let lh = L + ((bloom * h) >> 8);
      lh += bo;
      V[o] = vr + (((lh - vr) * hole) >> 8);
    }
  }
  slipOps += nS * 30;
}

/** Set up each digit slot for this frame: which table, how lit, and the cut-in state. */
let effOps = 0;
function slots(s, cur, nxt, plans) {
  effOps = 0;
  for (let k = 0; k < 4; k++) {
    const G = GLY(k)[+cur[k]];
    GD[k] = +cur[k]; HM[k] = G.cov; HK[k] = 256; GF[k] = 256;
    const P = plans[k];
    if (!P || s >= P.revEnd) continue;
    if (s < P.t0) { HK[k] = 0; GF[k] = 0; continue; }
    // the cut: its whole thin outline opens evenly (never a partial set of strokes),
    // brightest just behind the blades; then each piece drops out and the light floods in
    const Gn = GLY(k)[P.d], nL = Gn.polys.length, u = (s - P.t0) / (P.t1 - P.t0);
    const prog = (Math.min(1, u) * 254 + 1) | 0, line = (200 * smooth(u * OUTLINE)) | 0, tr = Math.max(2, (TRAIL / Gn.total) * 254) | 0;
    const rev = REV;
    let sum = 0;
    for (let j = 0; j < nL; j++) { const r = smooth((s - (P.t1 + 0.02 + LEAF_GAP * j)) / REVEAL); rev[j] = (r * 256) | 0; sum += r; }
    const E = EFF[k], cov = Gn.cov, cut = Gn.cut, lf = Gn.leafOf;
    for (let i = 0; i < E.length; i++) {
      let v = lf[i] >= 0 ? (cov[i] * rev[lf[i]]) >> 8 : 0;
      const ci = cut[i];
      if (ci) {
        let w = line;
        if (u < 1 && ci <= prog && ci > prog - tr) { const t = line + 30 - (((prog - ci) * 30) / tr | 0); if (t > w) w = t; }
        if (w > v) v = w;
      }
      E[i] = v;
    }
    HM[k] = E; GD[k] = P.d; GF[k] = ((sum / nL) * 256) | 0; effOps += E.length * 5;
  }
}
const REV = new Int32Array(8);

function render(g, ctx) {
  const f = ctx.fields, s = f.sec, tod = f.h * 3600 + f.m * 60 + s, nt = ctx.night;
  ctx.lcd.backlight(1 - 0.55 * nt);
  const prv = clockFields(new Date(ctx.date.getTime() - 60000)), nxt = clockFields(new Date(ctx.date.getTime() + 60000));
  const cur = f.hh + f.mm, P = prv.hh + prv.mm, N = nxt.hh + nxt.mm;
  const hourOut = nxt.h !== f.h, hourIn = prv.h !== f.h;
  const plans = [0, 1, 2, 3].map((k) => slotPlan(k, P, cur)), next = [0, 1, 2, 3].map((k) => slotPlan(k, cur, N));

  // the hour's light: a flare as the new rim opens, and a front sweeping the window
  let flare = 0, front = -999;
  if (hourIn && s < 2.6) { const u = clamp((s - 0.9) / 1.6, 0, 1); flare = 140 * Math.sin(Math.PI * u); front = -10 + u * 185; }
  const base = lightField(tod, nt, flare, front);
  const red = (500 - 350 * nt) | 0, bloom = (100 + 300 * nt) | 0, glowA = (290 + 90 * nt) | 0;
  const PP = { base, red, bloom, glowA };

  // the draught: the flower bows on its tape, the carp sways and beats its tail
  const sw = 0.55 * sin((TAU * tod) / 5.3) + 0.2 * sin((TAU * tod) / 2.3 + 1);
  for (let y = 0; y < H; y++) {
    rowM[y] = (256 * (sw * ((y - 1) / 78) + 0.18 * sin((TAU * tod) / 1.9 + y * 0.13))) | 0;
    rowF[y] = (256 * (0.35 * sin((TAU * tod) / 4.4 + 2) * ((y - 2) / 77))) | 0;
  }
  let leap = 0, beat = 1;
  if (hourIn && s > 2.4 && s < 3.4) { const u = (s - 2.4) / 1.0; leap = -5 * Math.sin(Math.PI * u); beat = 2.2; }
  const tb = sin((TAU * tod) / 1.25), ub = sin((TAU * tod) / 1.25 - 1.1);
  for (let x = 0; x < FISH.w; x++) colF[x] = (256 * (leap + beat * (2.3 * TAIL_W[x] * tb + 0.3 * ub * (1 - TAIL_W[x]) * ((94 - x - FISH.x) / 60)))) | 0;

  slots(s, cur, N, plans);
  slips(s, tod, cur, N, plans);

  // the flower's paper: still, or rebuilt during the hour show
  let mmap = MED_MAP[variant(f.h)], flap = null, rimN = 0;
  if (hourOut && s >= RIM0) { rimN = buildRim(s, variant(f.h), variant(nxt.h)); mmap = MBUF; flap = FLAP; }
  else if (hourIn && s + 60 < UNF_END) { rimN = buildRim(s + 60, variant(prv.h), variant(f.h)); mmap = MBUF; flap = FLAP; }
  // a light runs once round the flower's rim each minute: the seconds, in the lace
  const head = (s / 60) * 256, bamp = 300 + 40 * nt;
  for (let a = 0; a < 256; a++) {
    let d = head - a; if (d < -128) d += 256; if (d > 128) d -= 256;
    const tail = d >= 0 && d < 90 ? 0.4 * (1 - d / 90) * (1 - d / 90) : 0, hd = d > -4 && d < 12 ? (d < 0 ? 1 + d / 4 : 1 - d / 12) : 0;
    BOOST[a] = (bamp * (tail > hd ? tail : hd)) | 0;
  }
  lay(mmap, MED.x, MED.y, MED.w, MED.h, rowM, null, 0, 1, PP, flap, true);
  lay(FISH_MAP, FISH.x, FISH.y, FISH.w, FISH.h, rowF, colF, 2, 3, PP, null, false);

  // values to the ramp, dithered
  const buf = g.buf;
  for (let y = 0, i = 0; y < H; y++) {
    const br = (y & 3) << 2;
    for (let x = 0; x < W; x++, i++) {
      let q = (V[i] + B16[br | (x & 3)]) >> 4;
      buf[i] = RAMP[q < 0 ? 0 : q > 63 ? 63 : q];
    }
  }
  g.cost.px += W * H;
  g.cost.box += lightOps + W * H * 2 + (MED.w * MED.h + FISH.w * FISH.h) * 14 + rimN * 12 + FLAKES * 40 + effOps + slipOps;

  overlays(g, s, tod, cur, N, plans, next, hourOut, hourIn, PP, f, prv, nxt);
}

function overlays(g, s, tod, cur, N, plans, next, hourOut, hourIn, PP, f, prv, nxt) {
  const pieceC = shade(PP.red + 60), backC = shade(PP.red + 230), shadowC = shade(PP.red - 260), nt = 1 - (PP.red - 150) / 350, dark = shade(72 + 520 * nt), pin = shade(nt > 0.5 ? 120 : 760);
  // the rim's petals, snipped off at the hour
  if (hourOut && s >= RIM0) {
    const pts = PETAL[variant(f.h)];
    for (let k = 0; k < 16; k++) {
      const tau = s - petalT0(k);
      if (tau < 0 || tau > FALL_T) continue;
      const a = k * SECTOR, c = Math.cos(a), sn = Math.sin(a);
      const rp = pts.map(([x, y]) => [x * c - y * sn, x * sn + y * c]);
      const [mx, my, rot, al, fl] = fall(tau, k + 40);
      piece(g, rp, MED.cx, MED.cy, rp[6][0] * 0.85, rp[6][1] * 0.85, rot, mx, my * 1.2, pieceC, backC, shadowC, al, fl);
    }
  }
  // the pieces cut out of the new digits, falling away
  for (const P of plans) {
      if (!P) continue;
      const G = GLY(P.k)[P.d], [ox, oy] = ORIGIN(P.k);
      for (let j = 0; j < G.polys.length; j++) {
        const tau = s - (P.t1 + 0.02 + LEAF_GAP * j);
        if (tau < 0 || tau > FALL_T) continue;
        const L = G.polys[j], [mx, my, rot, al, fl] = fall(tau, P.k * 8 + j + P.d * 3);
        // every piece pops out of the sheet at once and away from the digit's centre, so the light comes through evenly
        let ux = L.cx - PAD - G.w / 2, uy = L.cy - PAD - G.h / 2;
        const ul = Math.sqrt(ux * ux + uy * uy) + 1;
        ux /= ul; uy = uy / ul + 0.3;
        const push = 40 * tau + 10 * tau * tau;
        // it lifts off the sheet as it goes: drawn in only as it clears its hole, which is already full of light
        piece(g, L.pts, ox - PAD, oy - PAD, L.cx, L.cy, rot, mx + ux * push, my + uy * push * 0.6, pieceC, backC, shadowC, al * smooth((tau - 0.1) / 0.14), fl);
      }
    }
  // the scissors, one pair for each digit being cut
  for (let k = 0; k < 4; k++) {
    const sc = scissorsAt(k, s, plans[k], next[k], k === 0 && hourOut);
    if (!sc) continue;
    const yy = Math.max(0, Math.min(H - 1, sc[1] | 0)), sh = (k > 1 ? rowF : rowM)[yy] / 256;
    if (sc[3] > 0) { g.fillCircle(sc[0] + sh, sc[1], 2.6, shade(PP.base + 200), { aa: true, a: 0.35 }); g.fillCircle(sc[0] + sh, sc[1], 1.2, shade(1010), { aa: true, a: 0.85 }); }
    scissors(g, sc[0] + sh, sc[1], sc[2], sc[3], tod, dark, pin);
  }
  // the window's frame
  const fr = shade(40);
  g.fillRect(0, 0, W, 1, fr); g.fillRect(0, H - 1, W, 1, fr); g.fillRect(0, 0, 1, H, fr); g.fillRect(W - 1, 0, 1, H, fr);
}

export default {
  name: 'Window Flowers',
  blurb: 'A New Year paper-cut window: the hours cut through a red window flower, the minutes through a carp; scissors cut each new minute and the light comes through.',
  fps: 60,
  frame: render,
};
