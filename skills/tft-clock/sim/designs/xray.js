// X-Ray: the glass is a baggage screener's monitor, and the time is what
// somebody packed. A carry-on sits in the tunnel in the scanner's false
// colour: the hours and minutes are objects lying in it (a coiled belt is a
// 0, a folded umbrella a 1, a power bank and its cable a 2, two bananas a 3,
// a coat hanger a 4, a toothbrush and a neck pillow a 5, a hairbrush a 6, a
// hair dryer a 7, sunglasses an 8, a key on a ring a 9), two coins are the
// colon. They are translucent as X-rays are: where things overlap they go
// darker, and you see inside them (the cells in the power bank, the motor
// and coil in the dryer, the pins in the brush).
//
// Always moving: the operator's zoom loupe hunts over the bag, glides to an
// item, magnifies it, moves on. Minute turn: the belt runs, the bag slides
// out to the left, and the next bag is acquired column by column under the
// scan bar at the right edge, then the belt stops. The hour: the machine
// flags the new hours with a red threat box, and the operator steps through
// the view modes (organic only, metal only, negative, high penetration,
// black and white) in scan wipes, then clears the bag.
//
// Palette: the screener's own convention, kept honest: every pixel is
// computed from two thicknesses (organic, metal) through Beer-Lambert,
// coloured by effective Z: orange organics, green mixed, blue metal, black
// where nothing gets through, on the white of an empty field. Hard pixels
// for the image (it is a scan), AA for the operator's overlay.
//
// Cost: the image is a per-pixel table lookup from two byte maps (a few
// integer ops a pixel, charged to the estimate as box work); a bag is packed
// once a minute by adding byte sprites (~25k byte adds, charged in the frame
// that packs it). All objects are rasterised at load: flash tables.

import { hash, clockFields, to565, from565, clamp, progress, ease, sin, cos } from '../js/kit.js';

import { BW, BH, UNIT, packBag, TRAY, TRAY_W } from './xray-gear.js';

const W = 160, H = 80;

// ------------------------------------------------------------ the colour tables (flash)

const FIELD = [246, 248, 242], FIELD_NIGHT = [206, 222, 238];   // by night the empty field is a cooler, softer glow
const K_ORG = [0.13, 0.5, 1.6], K_MIX = [0.95, 0.34, 1.05], K_MET = [1.35, 0.82, 0.3];
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const MODES = ['colour', 'organic', 'metal', 'negative', 'hipen', 'mono'];

function colour(mode, o, m, field = FIELD, kmul = 1) {
  let A = (o + m) * kmul;
  const r = A > 0 ? m / A : 0;
  const wO = 1 - smooth(0.12, 0.26, r), wM = smooth(0.36, 0.52, r), wX = 1 - wO - wM;
  const k = [0, 1, 2].map((c) => wO * K_ORG[c] + wX * K_MIX[c] + wM * K_MET[c]);
  let T;
  if (mode === 'organic') T = [0, 1, 2].map((c) => Math.exp(-o * K_ORG[c] - m * 0.5));
  else if (mode === 'metal') T = [0, 1, 2].map((c) => Math.exp(-m * K_MET[c] - o * 0.3));
  else if (mode === 'mono') T = [0, 1, 2].map(() => Math.exp(-A * 0.72));
  else {
    if (mode === 'hipen') A *= 0.42;
    const dense = Math.exp(-Math.max(0, A - 2.0) * 0.8);
    T = k.map((kc) => Math.exp(-A * kc) * dense);
  }
  let rgb = T.map((t, c) => field[c] * t);
  if (mode === 'negative') rgb = rgb.map((v, c) => 255 - v * 0.92 - [12, 10, 4][c]);
  const [R, G, B] = rgb.map((v) => Math.round(clamp(v, 0, 255)));
  return to565((R << 16) | (G << 8) | B);
}

const LUT = MODES.map((mode) => {
  const t = new Uint16Array(64 * 64);
  for (let i = 0; i < 64; i++) for (let j = 0; j < 64; j++) t[i * 64 + j] = colour(mode, (i * 4 + 2) / UNIT, (j * 4 + 2) / UNIT);
  return t;
});
const LUT_NIGHT = new Uint16Array(64 * 64);
for (let i = 0; i < 64; i++) for (let j = 0; j < 64; j++) LUT_NIGHT[i * 64 + j] = colour('colour', (i * 4 + 2) / UNIT, (j * 4 + 2) / UNIT, FIELD_NIGHT, 1.15);
const BELT_O = 3;
const DEV = 14, TRAY_GAP = 6;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

// ------------------------------------------------------------ bags, one per minute

const BAGS = new Map();
let packOps = 0;
function bagFor(key) {
  let b = BAGS.get(key);
  if (!b) {
    const f = clockFields(new Date(key * 60000));
    b = packBag(key, f.hh + f.mm);
    packOps += b.ops;
    BAGS.set(key, b);
    if (BAGS.size > 4) BAGS.delete(BAGS.keys().next().value);
  }
  return b;
}

// ------------------------------------------------------------ the belt

const PITCH = 312;          // bag to bag on the belt, px: the last old digit is off before the first new one is on
const HALF = 1.6;           // the belt runs from :58.4 to :01.6
const beltEase = (u) => u * u * (3 - 2 * u);

// ------------------------------------------------------------ overlay colours

const RING = 0x1c2733, HALO = 0xffffff, ALARM = 0xe2231a, CLEAR = 0x1fa84a, SCAN = 0x7fe0ff;

export default {
  name: 'X-Ray',
  blurb: 'A baggage screener\'s monitor: the time is the things packed in the bag, in false colour; the belt brings a new bag each minute.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, mk = f.minuteKey;
    ctx.lcd.backlight(1 - 0.62 * ctx.night);
    packOps = 0;

    // ---- the belt: which bags are in the tunnel, and where
    let bagA, offA = 0, bagB = null, offB = 0, run = 0;
    if (s >= 60 - HALF || s < HALF) {
      const u = s >= 60 - HALF ? (s - (60 - HALF)) / (2 * HALF) : (s + HALF) / (2 * HALF);
      const D = PITCH * beltEase(u);
      run = 6 * u * (1 - u);                                   // belt speed, 0..1.5
      const k0 = s >= 60 - HALF ? mk : mk - 1;
      bagA = bagFor(k0); offA = D;
      bagB = bagFor(k0 + 1); offB = D - PITCH;
    } else bagA = bagFor(mk);

    // ---- the hour show: threat box, then the view modes in wipes
    const prv = clockFields(new Date(ctx.date.getTime() - 60000));
    const hourShow = prv.h !== f.h && s < 12;
    let modeOld = 0, modeNew = 0, wipeX = -1;
    if (hourShow) {
      const seq = [0, 1, 2, 3, 4, 5, 0], T0 = 2.7, STEP = 1.25, WIPE = 0.5;
      const k = Math.floor((s - T0) / STEP);
      if (k >= 0 && k < seq.length - 1) {
        const lt = s - T0 - k * STEP;
        modeOld = seq[k]; modeNew = seq[k + 1];
        wipeX = lt < WIPE ? Math.round(ease.inOutQuad(lt / WIPE) * 168) - 4 : 999;
        if (wipeX >= 999) modeOld = modeNew;
      }
    }

    // ---- the image: two channels per pixel through the colour table
    // at night the plain view uses the night table; over the fade minute it dissolves in
    const nt = ctx.night, LUT0 = nt >= 1 ? LUT_NIGHT : LUT[0];
    const lutOf = (k) => (k === 0 ? LUT0 : LUT[k]);
    const buf = g.buf, lutA = lutOf(modeNew), lutB = lutOf(modeOld);
    const beltIdx = (BELT_O >> 2) << 6;
    if (!bagB) {
      const O = bagA.o, M = bagA.m;
      if (nt > 0 && nt < 1 && !hourShow) {
        for (let i = 0, y = 0; y < H; y++)
          for (let x = 0; x < W; x++, i++) buf[i] = (nt > BAYER[((y & 3) << 2) | (x & 3)] ? LUT_NIGHT : LUT[0])[((O[i] >> 2) << 6) | (M[i] >> 2)];
      } else
        for (let i = 0, y = 0; y < H; y++)
          for (let x = 0; x < W; x++, i++) buf[i] = (x < wipeX ? lutA : lutB)[((O[i] >> 2) << 6) | (M[i] >> 2)];
      g.cost.px += W * H; g.cost.box += W * H * 2;
    } else {
      // moving: the empty belt, then each bag sampled at a fractional offset, linear across columns
      g.clear(from565(lutA[beltIdx]));
      const lutM = LUT[5], dev = DEV * clamp(run, 0, 1);
      for (const [bag, off] of [[bagA, offA], [TRAY, offA - BW - TRAY_GAP], [bagB, offB]]) {
        const io = Math.floor(off), fw = ((off - io) * 256) | 0, O = bag.o, M = bag.m, bw = bag.w;
        const xs = Math.max(0, -io - 1), xe = Math.min(W, bw - io);
        for (let y = 0; y < H; y++) {
          const row = y * bw;
          for (let x = xs; x < xe; x++) {
            const b0 = x + io, b1 = b0 + 1;
            const o0 = b0 >= 0 ? O[row + b0] : BELT_O, o1 = b1 < bw ? O[row + b1] : BELT_O;
            const m0 = b0 >= 0 ? M[row + b0] : 0, m1 = b1 < bw ? M[row + b1] : 0;
            const o = (o0 * (256 - fw) + o1 * fw) >> 8, m = (m0 * (256 - fw) + m1 * fw) >> 8;
            // fresh columns under the scan bar are still raw (grey); colour develops behind it
            const q = (W - 2 - x) / dev, raw = q < BAYER[((y & 3) << 2) | (x & 3)];
            buf[y * W + x] = (raw ? lutM : lutA)[((o >> 2) << 6) | (m >> 2)];
          }
        }
        if (xe > xs) { g.cost.px += (xe - xs) * H; g.cost.box += (xe - xs) * H * 7; }
      }
      // the scan bar: the detector line where the new bag is acquired
      const a = clamp(run, 0, 1);
      if (a > 0.02) {
        g.fillRect(158, 0, 2, H, SCAN, { a: 0.85 * a });
        g.gradient(146, 0, 12, H, [[0, 0xffffff], [1, SCAN]], { angle: 0, a: 0.35 * a });
      }
    }
    // the wipe's own line
    if (wipeX >= 0 && wipeX < W) {
      g.fillRect(wipeX, 0, 1, H, SCAN, { a: 0.9 });
      if (wipeX > 0) g.fillRect(wipeX - 1, 0, 1, H, SCAN, { a: 0.35 });
    }

    // ---- the operator's loupe: hunts over the bag, stops, magnifies
    if (!bagB) {
      const start = hourShow ? 12.2 : HALF + 0.4, end = 60 - HALF - 0.5;
      if (s > start && s < end) loupe(g, bagA, s, start, end, mk, lutA, lutB, wipeX);
    }

    // ---- the hour: the machine flags the new hours
    if (hourShow) threat(g, bagA, s);
    if (packOps) g.cost.box += packOps * 2;
  },
};

// ------------------------------------------------------------ the loupe

const CYC = 4.4, TRV = 1.6, LR = 11.5, ZMAX = 2.0;

function target(bag, mk, c) {
  const n = bag.targets.length;
  let k = hash(mk, c, 3) % n;
  if (c > 0 && k === hash(mk, c - 1, 3) % n) k = (k + 1) % n;
  return bag.targets[k];
}

function loupe(g, bag, s, start, end, mk, lutA, lutB, wipeX) {
  const t = s - start, c = Math.floor(t / CYC), lt = t - c * CYC;
  const to = target(bag, mk, c);
  const from = c > 0 ? target(bag, mk, c - 1) : [to[0] + 40, to[1] - 10];
  const u = ease.inOutCubic(progress(lt, 0, TRV));
  let lx = from[0] + (to[0] - from[0]) * u, ly = from[1] + (to[1] - from[1]) * u;
  // a slow search wobble while it dwells
  const dw = progress(lt, TRV, TRV + 0.6);
  lx += dw * 1.6 * sin(s * 1.3 + c); ly += dw * 1.1 * cos(s * 1.7 + c);
  lx = clamp(lx, LR + 2, W - LR - 2); ly = clamp(ly, LR + 2, H - LR - 2);
  const zin = ease.inOutQuad(progress(lt, TRV, TRV + 0.55)) * (1 - ease.inOutQuad(progress(lt, CYC - 0.55, CYC)));
  const fade = progress(s, start, start + 0.6) * (1 - progress(s, end - 0.6, end));
  const Z = 1 + (ZMAX - 1) * zin * fade;

  // inside: the same two maps, magnified, sampled bilinear
  const O = bag.o, M = bag.m, buf = g.buf;
  const x0 = Math.max(0, Math.floor(lx - LR)), x1 = Math.min(W - 1, Math.ceil(lx + LR));
  const y0 = Math.max(0, Math.floor(ly - LR)), y1 = Math.min(H - 1, Math.ceil(ly + LR));
  const r2 = (LR - 0.5) * (LR - 0.5), iz = 1 / Z;
  // every third stop the operator also turns up the penetration inside the lens; it dissolves in with the zoom
  const probe = c % 3 === 2 ? LUT[4] : null, pz = zin * fade;
  let n = 0;
  for (let y = y0; y <= y1; y++) {
    const dy = y + 0.5 - ly;
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - lx;
      if (dx * dx + dy * dy > r2) continue;
      const sx = lx + dx * iz - 0.5, sy = ly + dy * iz - 0.5;
      const ix = sx | 0, iy = sy | 0, fx = ((sx - ix) * 256) | 0, fy = ((sy - iy) * 256) | 0;
      const k = iy * BW + ix, kx = ix + 1 < BW ? 1 : 0, ky = iy + 1 < BH ? BW : 0;
      const oT = (O[k] * (256 - fx) + O[k + kx] * fx) >> 8, oB = (O[k + ky] * (256 - fx) + O[k + ky + kx] * fx) >> 8;
      const mT = (M[k] * (256 - fx) + M[k + kx] * fx) >> 8, mB = (M[k + ky] * (256 - fx) + M[k + ky + kx] * fx) >> 8;
      const o = (oT * (256 - fy) + oB * fy) >> 8, m = (mT * (256 - fy) + mB * fy) >> 8;
      const lut = probe !== null && pz > BAYER[((y & 3) << 2) | (x & 3)] ? probe : x < wipeX ? lutA : lutB;
      buf[y * W + x] = lut[((o >> 2) << 6) | (m >> 2)];
      n++;
    }
  }
  g.cost.px += n; g.cost.box += n * 14;

  // the rim, a halo to lift it off dark things, and the crosshair
  const a = fade;
  g.ring(lx, ly, LR + 0.4, LR + 1.6, HALO, { aa: true, a: 0.7 * a });
  g.ring(lx, ly, LR - 0.9, LR + 0.5, RING, { aa: true, a: 0.95 * a });
  for (const [ux, uy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    g.thickLine(lx + ux * (LR + 1.5), ly + uy * (LR + 1.5), lx + ux * (LR + 5), ly + uy * (LR + 5), 1.1, RING, { aa: true, a: 0.9 * a });
    g.thickLine(lx + ux * 1.6, ly + uy * 1.6, lx + ux * 3.6, ly + uy * 3.6, 0.9, ALARM, { aa: true, a: 0.8 * a });
  }
}

// ------------------------------------------------------------ the threat box

function threat(g, bag, s) {
  const [bx, by, bw, bh] = bag.box;
  const grow = ease.outCubic(progress(s, 1.7, 2.25));
  if (grow <= 0) return;
  const clear = progress(s, 9.6, 10.0), gone = progress(s, 10.6, 11.6);
  const a = (1 - gone) * (s < 9.6 ? 0.75 + 0.25 * Math.round(0.5 + 0.5 * sin(s * 12)) : 1);
  if (a <= 0) return;
  const inf = (1 - grow) * 16;
  const x0 = bx - inf, y0 = by - inf * 0.6, x1 = bx + bw + inf, y1 = by + bh + inf * 0.6;
  const col = clear > 0.5 ? CLEAR : ALARM, L = 6;
  // the outline, and heavier corner brackets
  g.rect(Math.round(x0), Math.round(y0), Math.round(x1 - x0), Math.round(y1 - y0), col, { a: 0.55 * a * grow });
  for (const [cx, cy, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) {
    g.thickLine(cx, cy, cx + sx * L, cy, 1.8, col, { aa: true, a: a * grow });
    g.thickLine(cx, cy, cx, cy + sy * L, 1.8, col, { aa: true, a: a * grow });
  }
  // the tag on the box: a warning triangle, then a tick once cleared
  const tx = Math.round(x0), ty = Math.round(y0) - 1;
  g.fillRect(tx, ty, 9, 8, col, { a: a * grow });
  if (clear < 0.5) {
    g.fillPolygon([[tx + 4.5, ty + 1], [tx + 8, ty + 7], [tx + 1, ty + 7]], 0xffffff, { a: a * grow });
    g.fillRect(tx + 4, ty + 3, 1, 2, ALARM, { a: a * grow });
    g.fillRect(tx + 4, ty + 6, 1, 1, ALARM, { a: a * grow });
  } else {
    g.thickLine(tx + 2, ty + 4, tx + 4, ty + 6, 1.2, 0xffffff, { aa: true, a: a });
    g.thickLine(tx + 4, ty + 6, tx + 7.5, ty + 1.8, 1.2, 0xffffff, { aa: true, a: a });
  }
}
