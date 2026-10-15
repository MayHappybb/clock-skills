// Flytrap: a three-colour risograph print of a bog, and the time is grown
// in it. Each numeral is a single Venus flytrap leaf grown into the digit's
// shape (flytrap-glyphs.js): a dark keyline, a green rim, the red inside of
// the open trap, and a fringe of cilia (the trap's teeth) on its outer edge,
// rooted by a stalk in the sphagnum moss. Hours are two old, tall plants;
// minutes two young ones, shorter; a sundew's two dew pads are the colon.
//
// The time is alive every second. On every beat each trap SNAPS: the shut
// runs along the whole leaf like a zip in a third of a second (the red
// inside vanishes, the leaf pulls thin, the teeth fold in), then it eases
// open again; the four leaves snap in a rolling chord, left to right, the
// zip direction swapping every beat. The cilia wave continuously, each plant
// sways on its own slant, and the drums' registration wanders by a pixel,
// so the leaves' coloured fringes shift. Flies buzz round the young plants. Every 15 s a feeding frenzy: a double snap that runs
// through all four leaves as one wave and jolts the print's registration.
// Twice a minute a fly lands on a leaf tip and the trap snaps shut on it,
// holds (wings sticking out of the teeth), and lets it go, dazed.
//
// Minute turn, the plant's own way: from :58.2 every leaf that is about to
// change wilts (it browns as pink creeps into its green, droops toward the
// moss, leans, and its ink thins evenly through the halftone until it is
// gone at :59.9). After :00 the new plant sprouts: the stalk shoots up out
// of the moss, the whole leaf appears as a thin shoot, swells to full width
// with an overshoot, the trap opens red for the first time, its teeth grow,
// and on :02 it starts to snap.
// Hour: everything blooms at once. A slow halftone sunburst turns out of
// the sun, a meadow of flytrap flowers opens along the moss in a wave, two
// tall flower scapes rise above the young plants (the flytrap flowers high
// above its traps) and open pink clusters, every trap stands wide open, its
// red flushing and its teeth turning long and pink, the drums breathe out of
// register and back, and petals blow across the print; by :12 it has all
// closed and the snapping resumes. The time reads throughout.
//
// Medium: risograph, honestly. Three spot inks only (fluorescent pink,
// teal, yellow) on warm paper, each printed through its own coarse round-dot
// screen at its own angle (flytrap-print.js), multiplying where they cross:
// pink + yellow is the trap's red, teal + yellow the leaf green, pink + teal
// the navy of a fly, all three the near-black keyline; tints (the moss, the
// sun, clouds, a wilting leaf) are the drums' coarse dots. Eight colours, no
// others, and no anti-aliasing (a drum either inks a pixel or not). Each
// drum drifts out of register by a pixel or so, slowly, so every edge grows
// the medium's coloured fringes; ~3 % starved specks grain the solids.
// Night: printed on darker stock (blended in over the fade minute) and the
// backlight drops to 40 %; the paper still lifts every leaf off the ground.
//
// Cost: the frame is composed as a byte map of materials (flytrap-print.js),
// then printed: three lookups and compares a pixel. Leaves come from three
// byte fields per digit (flash, ~134 KB), one pass over each glyph box with
// small per-arc-length tables for the snap. Everything is closed-form in
// time; nothing is cached across frames. Flash: fields 134 KB, screens
// 44 KB, ground 15 KB, the sun's polar map 30 KB: ~223 KB. RAM beyond the
// frame buffer: the material map 14.8 KB and ~7 KB of tables.

import { clockFields, hash, sin, cos } from '../js/kit.js';
import { buildSet, M } from './flytrap-glyphs.js';
import { W, H, PAD, MW, MB, DP, DT, DY, PAL_DAY, PAL_NIGHT, palette, print, rectM, ellM, lineM, dotM } from './flytrap-print.js';

// ------------------------------------------------------------ type and layout

const HRS = buildSet(31, 56, 4.4), MIN = buildSet(24, 42, 3.7);
const SLOTS = [
  { set: HRS, x: 6, y: 5 },
  { set: HRS, x: 41, y: 5 },
  { set: MIN, x: 89, y: 19 },
  { set: MIN, x: 118, y: 19 },
];
const BASE = 61, MOSS = 66;
const LEAN = [-0.03, 0.025, -0.035, 0.04];            // the plants' baseline; the top of the moss

// materials
const PAPER = 0, MOSS1 = 1, MOSS2 = 2, SUN = 3, CLOUD = 4, FLY = 6, WING = 7, DEW = 8, PETAL = 9, CORE = 10, RAY = 11, ROSE = 12, TENT = 13, SOIL = 14, SCAPE = 15;
const KEY = 0, RIM = 1, INT = 2, TOOTH = 3, SEAM = 4, STALK = 5;
const slotM = (i, z) => 16 + i * 8 + z;

function setInk(m, p, t, y) { DP[m] = p; DT[m] = t; DY[m] = y; }
setInk(PAPER, 0, 0, 0);
setInk(MOSS1, 0, 72, 58);
setInk(MOSS2, 0, 150, 120);
setInk(SUN, 0, 0, 92);
setInk(CLOUD, 52, 0, 0);
setInk(FLY, 255, 255, 0);
setInk(WING, 0, 50, 190);
setInk(DEW, 255, 0, 120);
setInk(PETAL, 255, 0, 0);
setInk(CORE, 120, 0, 255);
setInk(RAY, 0, 0, 80);
setInk(ROSE, 230, 0, 170);
setInk(TENT, 255, 0, 0);
setInk(SOIL, 64, 56, 0);
setInk(SCAPE, 0, 90, 255);

// ------------------------------------------------------------ the ground (flash: 14.8 KB)

const BG = new Uint8Array(MB.length);
{
  MB.fill(PAPER);
  ellM(147, 8, 19, 19, SUN);
  for (let x = -PAD; x < W + PAD; x++) {
    const top = MOSS + Math.round(1.2 * Math.sin(x * 0.31) + 1.1 * Math.sin(x * 0.11 + 1));
    for (let y = top; y < H + PAD; y++) MB[(y + PAD) * MW + PAD + x] = y > 75 + ((hash(x, 9) % 3)) ? SOIL : MOSS1;
  }
  for (let k = 0; k < 34; k++) {
    const x = (hash(k, 1) % 168) - 4, y = MOSS + 2 + (hash(k, 2) % 8);
    ellM(x + 0.5, y + 0.5, 1.8, 1.4, MOSS2);
  }
  BG.set(MB);
}
// the sun's polar map, for the hour's sunburst (flash: 2 x 14.8 KB)
const ANG = new Uint8Array(MB.length), RAD = new Uint8Array(MB.length);
for (let y = 0; y < H + 2 * PAD; y++)
  for (let x = 0; x < MW; x++) {
    const dx = x - PAD + 0.5 - 147, dy = y - PAD + 0.5 - 8;
    ANG[y * MW + x] = Math.round((Math.atan2(dy, dx) / (2 * Math.PI)) * 160) & 255;
    RAD[y * MW + x] = Math.min(255, Math.round(Math.hypot(dx, dy)));
  }

// ------------------------------------------------------------ the snap

const sm = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const outBack = (t) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2;
/** One snap: shut fast, hold, ease open. tau in s after the zip passes. */
function env(tau, hold = 0.13) {
  if (tau < 0) return 0;
  if (tau < 0.05) return sm(tau / 0.05);
  if (tau < 0.05 + hold) return 1;
  return 1 - sm((tau - 0.05 - hold) / 0.55);
}

const CS = [0, 1, 2, 3].map(() => new Int16Array(256));      // outer pull-in, 1/8 px
const IT = [0, 1, 2, 3].map(() => new Int16Array(256));      // interior threshold, 1/8 px
const TL = [0, 1, 2, 3].map(() => new Int16Array(256));      // tooth length, 1/8 px
const SM = [0, 1, 2, 3].map(() => new Uint8Array(256));      // seam shows
const KEY8 = 8, RIM8 = 8;

const FRENZY = [15, 30, 45], CATCH = [7, 37];
function catchAt(mk, s, steady) {
  for (const n of CATCH) {
    const t = s - n;
    if (t > -1.8 && t < 3.6) {
      const cand = [0, 1, 2, 3].filter((i) => steady[i]);
      if (!cand.length) return null;
      const slot = cand[hash(mk, n, 5) % cand.length];
      return { n, t, slot, tip: hash(mk, n, 6) };
    }
  }
  return null;
}

// ------------------------------------------------------------ the leaves

/**
 * Draw slot i's leaf into the material map. o: { d, grow (1/8 px pulled in
 * everywhere), droop (0..), lean (px per px of height) }.
 */
function leaf(i, d, o) {
  const sl = SLOTS[i], set = sl.set, fw = set.fw, fh = set.fh;
  const E = set.E[d], S = set.S[d], F = set.F[d];
  const cs = CS[i], it = IT[i], tl = TL[i], sm_ = SM[i];
  const mK = slotM(i, KEY), mR = slotM(i, RIM), mI = slotM(i, INT), mT = slotM(i, TOOTH), mS = slotM(i, SEAM);
  const bj = BASE - (sl.y - M);                      // the baseline's row in the field
  const grow = o.grow | 0;
  let n = 0;
  for (let j = 0; j < fh; j++) {
    const y = sl.y - M + j;
    if (y < -PAD || y >= H + PAD) continue;
    // droop: the leaf sinks toward its baseline; lean: it flops sideways
    const sj = Math.round(bj + (j - bj) * (1 + o.droop));
    if (sj < 0 || sj >= fh) continue;
    const sh = Math.round(o.lean * (bj - j));
    const row = (y + PAD) * MW + PAD + sl.x - M + sh, src = sj * fw;
    for (let x = 0; x < fw; x++) {
      const k = src + x, e0 = E[k];
      n++;
      if (e0 >= 40) continue;
      const s = S[k], e = e0 + grow + cs[s];
      let m;
      if (e < 0) {
        if (e >= -KEY8) m = mK;
        else if (e < it[s]) m = mI;
        else m = (F[k] & 4) && sm_[s] ? mS : mR;
      } else if ((F[k] & 3) === 1 && e < tl[s]) m = mT;
      else continue;
      MB[row + x] = m;
    }
  }
  return n;
}

/** The stalk from the moss to slot i's leaf root, `u` of it grown. */
function stalk(i, d, u, droop) {
  const sl = SLOTS[i], r = sl.set.root[d];
  const rx = sl.x - M + r[0], ry = BASE - (BASE - (sl.y - M + r[1])) * (1 - droop);
  const top = MOSS + 2 - (MOSS + 2 - ry) * u;
  let n = 0;
  if (u > 0) n += lineM(rx, MOSS + 2, rx + 0.4 * sin(top), top, 2, slotM(i, STALK));
  // the rosette: two spent little traps on the moss
  if (u > 0.3) {
    const w = 4 * sm((u - 0.3) / 0.7);
    n += ellM(rx - 3.5, MOSS + 1.5, w, 1.6, ROSE) + ellM(rx + 4.5, MOSS + 2, w * 0.9, 1.5, ROSE);
  }
  return n;
}

// ------------------------------------------------------------ flies

const FLIES = [
  { cx: 124, ax: 26, cy: 8.5, ay: 3.5, w1: 0.83, w2: 1.9, p: 0.0 },
  { cx: 151, ax: 5, cy: 27, ay: 9, w1: 1.3, w2: 0.61, p: 2.1 },
  { cx: 151, ax: 5.5, cy: 52, ay: 6, w1: 1.1, w2: 1.45, p: 4.0 },
];
function flyPath(k, T) {
  const f = FLIES[k];
  return [f.cx + f.ax * sin(T * f.w1 + f.p) + 2.5 * sin(T * 3.1 + k), f.cy + f.ay * sin(T * f.w2 + f.p * 1.3) + 1.5 * cos(T * 4.3 + k * 2)];
}
function fly(x, y, F, wingsOnly = false) {
  let n = 0;
  const xi = Math.round(x), yi = Math.round(y), up = F & 1;
  n += ellM(xi - 1.5, yi - 1.5 - up, 1.8, 1.3, WING) + ellM(xi + 2.5, yi - 1.5 - up, 1.8, 1.3, WING);
  if (!wingsOnly) { n += rectM(xi - 1, yi - 1, 3, 2, FLY); n += dotM(xi + 2, yi - 1, FLY); }
  return n;
}

// ------------------------------------------------------------ the colon: a sundew's dew pads

function sundew(s, F) {
  let n = 0;
  const beat = env(s % 1, 0.05);
  for (const [cx, cy] of [[81.5, 33.5], [81.5, 48.5]]) {
    const r = 2.6 + 0.5 * beat;
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4 + 0.2 * sin(s * 3 + k);
      n += dotM(Math.floor(cx + (r + 1.6) * cos(a)), Math.floor(cy + (r + 1.6) * sin(a)), TENT);
    }
    n += ellM(cx, cy, r, r, DEW);
  }
  return n;
}

// ------------------------------------------------------------ the hour: everything blooms

// a meadow of flytrap flowers along the moss, between the plants' stalks
const MEADOW = [];
for (let k = 0; k < 17; k++) MEADOW.push([3 + k * 9.4 + (hash(k, 21) % 4), MOSS + 1 + (hash(k, 22) % 3)]);
function flower(x, y, r, spin) {
  let n = 0;
  for (let p = 0; p < 5; p++) {
    const a = spin + (p * 2 * Math.PI) / 5;
    n += ellM(x + r * 0.75 * cos(a), y + r * 0.75 * sin(a), r * 0.55, r * 0.55, PETAL);
  }
  return n + ellM(x, y, r * 0.42 + 0.3, r * 0.42 + 0.3, CORE);
}
const SCAPES = [[115.5, 9, 0.5], [151, 18, -1]];
function bloom(s, T) {
  let n = 0;
  // the sunburst: paper inside the rays takes a yellow tint, turning slowly
  const ra = sm((s - 0.3) / 1.4) * (1 - sm((s - 9.5) / 2));
  if (ra > 0) {
    const L = (175 * ra) | 0, rot = (s * 4) | 0;
    for (let j = 0; j < MB.length; j++) if (MB[j] === PAPER && RAD[j] < L && ((ANG[j] + rot) & 15) < 7) MB[j] = RAY;
    n += MB.length * 3;
  }
  // the meadow opens in a wave from the left and closes again
  MEADOW.forEach(([x, y], k) => {
    const o = sm((s - 0.8 - k * 0.09) / 0.6) * (1 - sm((s - 9.8 - k * 0.05) / 0.8));
    if (o > 0) n += flower(x, y - 2 * o, 3.4 * o, s * 0.5 + k);
  });
  // two tall flower scapes rise above the young plants, the flytrap's way (high above its traps)
  SCAPES.forEach(([x, top, lean], k) => {
    const u = sm((s - 0.9 - k * 0.3) / 1.6) * (1 - sm((s - 10.4) / 1.2));
    if (u <= 0) return;
    const sway = 1.3 * sin(T * 1.3 + k * 2) * u;
    const ty = MOSS + 1 - (MOSS + 1 - top) * u, tx = x + lean * u + sway;
    n += lineM(x, MOSS + 1, tx, ty, 1, SCAPE);
    const o = sm((s - 2.2 - k * 0.3) / 0.9) * (1 - sm((s - 9.6) / 0.8));
    if (o > 0) {
      n += lineM(tx, ty, tx - 5 * o, ty + 2 * o, 1, SCAPE) + lineM(tx, ty, tx + 5 * o, ty + 1 * o, 1, SCAPE);
      n += flower(tx - 5 * o, ty + 2 * o, 3.6 * o, s * 0.7 + k) + flower(tx + 5 * o, ty + o, 3.6 * o, -s * 0.6 + k) + flower(tx, ty - 1.5 * o, 4.4 * o, s * 0.4 + k * 3);
    }
  });
  // petals blow across the print
  if (s > 3) for (let k = 0; k < 12; k++) {
    const t = s - 3 - (hash(k, 4) % 600) / 100;
    if (t < 0 || t > 4.5) continue;
    const x = -6 + (hash(k, 7) % 60) + t * 34 + 3 * sin(t * 3 + k), y = (hash(k, 8) % 40) + t * 7 + 3 * sin(t * 2.3 + k * 1.7);
    n += ellM(x, y, 1.6, 1.0 + 0.5 * sin(t * 7 + k), PETAL);
  }
  return n;
}

// ------------------------------------------------------------ the design

export default {
  name: 'Flytrap',
  blurb: 'A three-ink risograph of a bog: each numeral is a Venus flytrap leaf that snaps shut on the beat; each minute the old plant wilts away and the new one sprouts; on the hour everything blooms.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, mk = f.minuteKey;
    const T = (ctx.date.getTime() % 86400000) / 1000, Fn = Math.floor(T * 60);
    const night = ctx.night;
    ctx.lcd.backlight(1 - 0.6 * night);
    const prv = clockFields(new Date(ctx.date.getTime() - 60000)), nxt = clockFields(new Date(ctx.date.getTime() + 60000));
    const cur = f.hh + f.mm, old = prv.hh + prv.mm, nw = nxt.hh + nxt.mm;
    const hourShow = prv.h !== f.h && s < 12;
    const n = Math.floor(s);
    let box = 0;

    // ---- per slot: what it is doing
    const st = [];
    for (let i = 0; i < 4; i++) {
      const leaving = cur[i] !== nw[i] && s >= 58.0, arriving = cur[i] !== old[i] && s < 2.2;
      st.push({ d: +cur[i], leaving, arriving, steady: !leaving && !arriving });
    }
    const gag = hourShow ? null : catchAt(mk, s, st.map((q) => q.steady && s > 3 && s < 54));

    // ---- the snap tables
    const fl = hourShow ? sm((s - 1.5) / 1) * (1 - sm((s - 9.5) / 1.5)) : 0;
    for (let i = 0; i < 4; i++) {
      const q = st[i], L = SLOTS[i].set.L[q.d], cs = CS[i], it = IT[i], tl = TL[i], sm_ = SM[i];
      const hw8 = SLOTS[i].set.hw * 8;
      const tip = gag && gag.slot === i ? SLOTS[i].set.tips[q.d][gag.tip % SLOTS[i].set.tips[q.d].length] : null;
      for (let k = 0; k < 256; k++) {
        const u = k / L;
        let e = 0;
        if (hourShow) {
          // in bloom every trap stands wide open, breathing with the beat
          e = s < 1.5 || s > 11 ? 0 : -0.25 * env(((s % 1) + 1) % 1, 0.1);
        } else if (q.steady || (q.arriving && s >= 2)) {
          for (let b = n - 1; b <= n; b++) {
            if (b < 2 || b > 57) continue;
            if (FRENZY.includes(b)) {
              for (const dt of [0, 0.42]) e = Math.max(e, 1.25 * env(s - b - dt - 0.17 * i - 0.2 * u, 0.08));
            } else {
              const dir = b & 1, t0 = b + 0.08 * i;
              e = Math.max(e, env(s - t0 - 0.32 * (dir ? 1 - u : u)));
            }
          }
          if (tip) {
            const tc = gag.n + 0.15;
            const near = Math.abs(k - tip[2]);
            const ec = env(s - tc - near / 140, 1.5);
            if (gag.t > -0.3 && gag.t < 2.6) e = Math.max(e * (gag.t < 0 ? 1 : 0), ec * 1.1);
          }
        }
        cs[k] = Math.round(e * 13);
        it[k] = -(KEY8 + RIM8) - Math.round(clamp01(e) * hw8);
        sm_[k] = e > 0.55 ? 1 : 0;
        const wave = 5 * sin(k * 0.55 - s * 7 + i);
        tl[k] = Math.round((22 + wave) * (1 - 0.75 * clamp01(e)) * (1 + 0.45 * fl));
      }
      box += 256 * 6;
    }

    // ---- compose the materials
    MB.set(BG);
    box += MB.length;
    if (hourShow) box += bloom(s, T);
    // clouds of pink tint drift behind the plants
    for (let k = 0; k < 2; k++) {
      const x = ((T * (2.2 + k) + k * 97) % 230) - 35, y = 13 + k * 15;
      box += ellM(x, y, 15, 4.5, CLOUD) + ellM(x + 9, y - 3, 8, 4, CLOUD);
    }
    box += sundew(s, Fn);
    // ink densities per slot this frame
    for (let i = 0; i < 4; i++) {
      const q = st[i];
      let dens = 1, wilt = 0, grow = 0, droop = 0, lean = 0, su = 1, ti = 1;
      if (q.leaving) {
        const w = (s - 58.0) / 1.9;
        wilt = sm(w / 0.5); droop = -0.14 * sm(w); lean = (i & 1 ? 0.1 : -0.1) * sm(w);
        dens = 1 - sm((w - 0.6) / 0.4);
        grow = Math.round(8 * sm(w));
      } else if (q.arriving) {
        su = sm(s / 0.3);
        dens = sm((s - 0.05) / 0.2);
        grow = Math.round((SLOTS[i].set.hw - 1.2) * 8 * (1 - clamp01(outBack(clamp01((s - 0.2) / 0.85)))));
        ti = sm((s - 1.1) / 0.6);
        if (s < 1.55) { const c = 1 - sm((s - 1.05) / 0.5); for (let k = 0; k < 256; k++) { IT[i][k] = Math.min(IT[i][k], -(KEY8 + RIM8) - Math.round(c * 40)); } }
        for (let k = 0; k < 256; k++) TL[i][k] = Math.round(TL[i][k] * ti);
      }
      const flush = fl;
      const D = (v) => Math.round(v * dens);
      setInk(slotM(i, KEY), D(255), D(255), D(255));
      setInk(slotM(i, RIM), D(170 * wilt), D(255), D(255));
      setInk(slotM(i, INT), D(255 - 140 * wilt), D(120 * wilt), D(200 + 55 * Math.max(wilt, flush)));
      setInk(slotM(i, TOOTH), D(100 * wilt + 255 * flush), D((255 - 60 * wilt) * (1 - flush)), D(190 * flush));
      setInk(slotM(i, SEAM), D(255), D(255), D(255));
      setInk(slotM(i, STALK), D(60 * wilt), D(230 - 80 * wilt), D(255));
      box += stalk(i, q.d, su, droop);
      // every plant grows at its own slant and sways a little in the bog air
      lean += LEAN[i] + 0.022 * sin(T * 0.8 + i * 1.9);
      box += leaf(i, q.d, { grow, droop, lean }) * 4;
    }

    // ---- flies
    for (let k = 0; k < 3; k++) {
      let [x, y] = flyPath(k, T);
      let wingsOnly = false;
      if (gag && k === 0) {
        const sl = SLOTS[gag.slot], d = st[gag.slot].d, tips = sl.set.tips[d], tp = tips[gag.tip % tips.length];
        const tx = sl.x - M + tp[0], ty = sl.y - M + tp[1] - 1;
        const a = sm((gag.t + 1.8) / 1.85), r = gag.t > 1.75 ? sm((gag.t - 1.75) / 1.8) : 0;
        let bx = tx, by = ty;
        if (gag.t > 1.75) { bx += 6 * r + 2 * sin(T * 9); by -= 10 * r + 1.5 * cos(T * 11); }
        x = x + (bx - x) * a * (1 - r); y = y + (by - y) * a * (1 - r);
        if (gag.t > 1.75) { x = bx + (x - bx) * r; y = by + (y - by) * r; }
        if (gag.t > 0.1 && gag.t < 1.75) wingsOnly = true;
      }
      box += fly(x, y, Fn, wingsOnly);
    }

    // ---- the drums' registration
    const jolt = !hourShow && FRENZY.includes(n) ? Math.round(2 * (1 - sm((s - n) / 0.6)) * (Fn & 2 ? 1 : -1)) : 0;
    const breath = hourShow ? 2.4 * sm((s - 1) / 1.5) * (1 - sm((s - 8) / 2.5)) : 0;
    const px = Math.round(0.85 * sin(T * 0.71) + breath * sin(s * 1.3)) + jolt, py = Math.round(0.8 * sin(T * 0.57 + 1) - breath * 0.6);
    const tx = Math.round(0.8 * sin(T * 0.83 + 2) - breath * cos(s * 1.1)), ty = Math.round(0.75 * sin(T * 0.62 + 4) + breath * 0.5);
    const yx = Math.round(0.6 * sin(T * 0.53 + 3)) - jolt, yy = Math.round(0.6 * sin(T * 0.77 + 5) + breath * 0.4 * sin(s));
    // the stock: warm paper by day, a darker sheet by night, blended over the fade minute
    const pal = night <= 0 ? PAL_DAY : night >= 1 ? PAL_NIGHT : palette([246 - 32 * night, 241 - 35 * night, 229 - 37 * night]);
    print(g.buf, pal, px, py, tx, ty, yx, yy);
    g.cost.px += W * H; g.cost.box += W * H * 8 + box;
  },
};
