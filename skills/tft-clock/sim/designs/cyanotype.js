// Cyanotype: a live photogram in the manner of Anna Atkins' British Algae
// (1843), the first book illustrated with photographs. A hand-brushed sheet
// of sun-print paper lies under the sky, and the four numerals are seaweed
// specimens laid on it in the shapes of the digits: each is one frond, a
// smooth rachis feathered with alternate pinnae on its outer side (short
// stubs face the counters, so no counter fills), rising on a thin stipe
// from a holdfast at the foot of the sheet, as Atkins pressed them whole.
// Two round sea-balls are the colon. What we see is the print as it
// exposes: the paper turns Prussian blue wherever light reaches it, and
// every specimen is the white shadow it casts; thin parts let some light
// through and print pale; parts that lift off the paper print soft.
//
// The time is alive (still in its tide pool): once a second a swell rolls
// across the sheet from the left; each frond leans with it from its
// holdfast and springs back, its pinnae stream after it and its shadow
// softens as the water lifts it, then settles crisp. All the while a slow
// ripple runs along every rachis and the sun's dapple through the water
// drifts across the blue. :15 a big swell rolls in (a tideline crosses the
// sheet), :45 the backwash returns it, :30 a loose sprig drifts past along
// the foot of the sheet.
//
// Minute turn: the old specimen is lifted (its shadow blurs, its pinnae
// collapse, the paper under it takes the light and goes blue), a wash runs
// across the sheet from the right and leaves the place pale and wet, and
// the new frond is laid down: its shadow falls soft and faint, sharpens as
// it touches, its pinnae unfurl, and the pale patch around it develops to
// deep blue. Hour: the tide comes in. A wave crosses the whole sheet from
// the left, everything streams in it, and behind it the plate is washed
// pale and develops to Prussian blue while loose specimens (fern plumes, a
// forked wrack, tufts) are laid in a wave along the foot and the margins:
// a full plate, the time reading among them. Ten seconds later the
// backwash lifts them away again.
//
// Palette: the medium's own. One 64-step ramp of exposure, bare paper
// white through the pale blues of a thin frond to full Prussian blue (and
// a darker night sheet); every pixel is one exposure value looked up in
// it, so the digits are the strongest contrast by construction (paper
// white on full blue), and every effect is a change of exposure. Night:
// the sheet darkens to a deep navy, the paper whites to a moonlit grey
// blue, and the backlight dims to 45 %.
//
// Cost: fronds are flash tables (cyanotype-glyphs.js); each frame they are
// stamped as anti-aliased discs into a byte coverage buffer (fixed-point
// distance through a sqrt table, charged per pixel scanned), and one
// integer pass turns coat x light x (1 - coverage) into the ramp, dithered.
// Worst frame (check.mjs) ~11 ms on esp32c3, mean ~6.5 ms. RAM beyond the
// frame buffer: the 12.8 KB coverage buffer, 4 KB of placed stem points and
// a 336-byte column wash, about 17 KB. Flash: frond tables (40 digit fronds,
// 40 stipes, 8 loose specimens), the coat map, two 64x64 light tiles and
// small tables, about 130 KB. Off-canvas work: the 64-entry palette is
// rebuilt only when the night level steps (64 mixes, at most 32 times a day).

import { clockFields, sin, cos, ease, progress } from '../js/kit.js';
import { W, H, N, PAL, palette, COAT, T1, T2, TS, BAYER, JIT } from './cyanotype-paper.js';
import { digitFrond, stipeFrond, plume, wrack, tuft, frondBytes } from './cyanotype-glyphs.js';

// ------------------------------------------------------------ layout
// hours a size larger; the four fronds float at different heights on their stipes
const SLOTS = [
  { x: 13, y: 6, w: 24, h: 44, r: 2.2, pin: 6.0, hx: 0, hy: 75.5, lean: 0.012, ph: 0.0 },
  { x: 49, y: 9, w: 24, h: 44, r: 2.2, pin: 6.0, hx: 0, hy: 76.0, lean: -0.010, ph: 1.7 },
  { x: 91, y: 14, w: 22, h: 40, r: 2.0, pin: 5.4, hx: 0, hy: 75.5, lean: 0.010, ph: 3.1 },
  { x: 125, y: 10, w: 22, h: 40, r: 2.0, pin: 5.4, hx: 0, hy: 76.0, lean: -0.012, ph: 4.4 },
];
const COLON = [[82, 24.5], [82, 38.5]];

const FRONDS = SLOTS.map(() => new Array(10).fill(null));
function frondOf(i, d) {
  let F = FRONDS[i][d];
  if (!F) { const s = SLOTS[i]; F = FRONDS[i][d] = digitFrond(d, s.w, s.h, s.r, s.pin, i + 1); }
  return F;
}
const STIPES = new Map();
function stipeOf(i, d) {
  const k = i * 10 + d;
  let S = STIPES.get(k);
  if (!S) {
    const s = SLOTS[i], F = frondOf(i, d);
    const ax = s.x + F.ax, ay = s.y + F.ay - 0.5;
    S = stipeFrond(ax, ay, ax + (((d * 7 + i * 3) % 5) - 2) * 0.8, s.hy, k + 5);
    STIPES.set(k, S);
  }
  return S;
}

// the hour's loose specimens, all in the margins and along the foot of the sheet
const LOOSE = [
  plume(5, 78, -1.25, 26, 0.45, 3.8, 101),
  wrack(43, 79, -1.75, 7.5, 3, 102),
  plume(58, 72, -0.15, 30, -0.3, 3.2, 103),
  plume(86, 79, -1.75, 17, 0.5, 3.0, 109),
  tuft(119, 79, -1.6, 14, 5, 104),
  plume(156, 77, -1.95, 27, -0.45, 3.8, 105),
  tuft(80, 4.5, 0.25, 7, 3, 106),
  wrack(155, 3, 2.3, 5, 2, 107),
];
const SPRIG = plume(0, 0, -0.15, 15, 0.6, 2.0, 108);

// ------------------------------------------------------------ the swell
// one push per second: a quick lean, a damped spring back (table over the beat)
const SURGE = new Float32Array(257);
for (let i = 0; i <= 256; i++) {
  const t = i / 256;
  let v;
  if (t < 0.17) v = Math.sin((t / 0.17) * Math.PI / 2);
  else v = Math.exp(-(t - 0.17) * 4.2) * Math.cos((t - 0.17) * Math.PI * 2 * 1.15);
  v *= 1 - Math.max(0, (t - 0.82) / 0.18) ** 2;
  SURGE[i] = v;
}
const surge = (tau) => { tau -= Math.floor(tau); return SURGE[(tau * 256) | 0]; };
const WAVE_V = 300;               // px/s: the swell's front crosses the sheet in half a second

// ------------------------------------------------------------ coverage: the shadows
const COV = new Uint8Array(N);
const SQ = new Float32Array(1024);
for (let i = 0; i < 1024; i++) SQ[i] = Math.sqrt(i / 16);
let scanned = 0, moved = 0;

/** One anti-aliased disc of shadow, max-combined: radius r, edge width soft, opacity a (0..255). */
function stamp(x, y, r, soft, a) {
  const ext = r + soft * 0.5 + 0.5;
  let x0 = (x - ext) | 0, x1 = (x + ext) | 0, y0 = (y - ext) | 0, y1 = (y + ext) | 0;
  if (x0 < 0) x0 = 0; if (y0 < 0) y0 = 0; if (x1 > W - 1) x1 = W - 1; if (y1 > H - 1) y1 = H - 1;
  if (x0 > x1 || y0 > y1) return;
  const inv = 1 / soft, e2 = ext * ext;
  for (let py = y0; py <= y1; py++) {
    const dy = py + 0.5 - y, dy2 = dy * dy, row = py * W;
    for (let px = x0; px <= x1; px++) {
      const dx = px + 0.5 - x, d2 = dx * dx + dy2;
      if (d2 >= e2) continue;
      let c = (r - SQ[(d2 * 16) | 0]) * inv + 0.5;
      if (c <= 0) continue;
      if (c > 1) c = 1;
      const v = (c * a) | 0;
      if (v > COV[row + px]) COV[row + px] = v;
    }
    scanned += x1 - x0 + 1;
  }
}

// per-frame placement of a frond: one reused object (monomorphic)
const P = { ox: 0, oy: 0, pivot: 0, invL: 0, sway: 0, lean: 0, und: 0, t: 0, ph: 0, soft: 1, alpha: 1, unfurl: 1, droop: 0, flow: 0, lift: 0, idle: 1 };
const SX = new Float32Array(512), SY = new Float32Array(512);
const K_UND = (Math.PI * 2) / 16, W_UND = Math.PI * 2 * 0.9, K_FLOW = 0.55;

function render(F, p) {
  const n = F.n, a255 = 255 * p.alpha;
  if (a255 < 2) return;
  const wt = W_UND * p.t + p.ph;
  // the rachis: lean from the holdfast, a ripple along it
  for (let i = 0; i < n; i++) {
    const y0 = p.oy + F.sy[i];
    let q = (p.pivot - y0) * p.invL;
    q = q < 0 ? 0 : q > 1 ? 1 : q;
    const flex = q * (0.6 + 0.4 * q);
    const w = p.und * sin(K_UND * F.ss[i] - wt);
    SX[i] = p.ox + F.sx[i] + p.sway * flex + p.lean * (p.pivot - y0) + F.snx[i] * w;
    SY[i] = y0 + F.sny[i] * w - p.lift;
  }
  moved += n;
  const soft = p.soft, stride = soft > 2.2 ? 2 : 1;
  for (let i = 0; i < n; i += stride) stamp(SX[i], SY[i], F.sr[i], soft, a255);
  // the pinnae: stream with the flow, flutter, droop when lifted, fold when not yet laid
  const m = F.m, ls = 0.3 + 0.7 * p.unfurl, fold = 0.85 * (1 - p.unfurl), ps = 0.8 + (soft - 1) * 1.2;
  for (let b = 0; b < m; b++) {
    const th = -F.bDirY[b] * K_FLOW * p.flow + 0.16 * p.idle * sin(1.9 * p.t + F.bPh[b]) + p.droop * F.bDirX[b] - F.bAng[b] * fold;
    const c = cos(th) * ls, s = sin(th) * ls;
    const bx = SX[F.bBase[b]], by = SY[F.bBase[b]];
    const k0 = F.bStart[b], k1 = k0 + F.bCount[b];
    for (let k = k0; k < k1; k++) {
      const ox = F.dox[k], oy = F.doy[k];
      stamp(bx + c * ox - s * oy, by + s * ox + c * oy, F.dr[k], ps, a255 * F.da[k] / 255);
    }
    moved += k1 - k0;
  }
}

function place(i, t, sway, flow, soft, idle) {
  const s = SLOTS[i];
  P.ox = s.x; P.oy = s.y; P.pivot = s.hy; P.invL = 1 / (s.hy - s.y);
  P.sway = sway; P.flow = flow; P.lean = s.lean; P.und = 0.45; P.t = t; P.ph = s.ph;
  P.soft = soft; P.alpha = 1; P.unfurl = 1; P.droop = 0; P.lift = 0; P.idle = idle;
}

// ------------------------------------------------------------ the wash: exposure per column
const COL = new Int16Array(W + 8);    // 256 = as coated; lower is paler (washed, not yet developed)

const GAIN = 292;                 // exposure past full density: the deep blue is flat, as a real print's is
const sm = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

// ------------------------------------------------------------ the face
export const FLASH = (() => {
  let b = 0;
  for (let i = 0; i < 4; i++) for (let d = 0; d < 10; d++) b += frondBytes(frondOf(i, d)) + frondBytes(stipeOf(i, d));
  for (const L of LOOSE) b += frondBytes(L);
  return b + frondBytes(SPRIG) + N + 2 * TS * TS + 1024 * 2 + 257 * 2;
})();

export default {
  name: 'Cyanotype',
  blurb: 'A live photogram after Anna Atkins: the numerals are seaweed fronds printing white on Prussian blue, swaying in the tide; each minute the specimen is lifted and a new one laid.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, night = ctx.night;
    ctx.lcd.backlight(1 - 0.55 * night);
    scanned = 0; moved = 0;
    const palOps = palette(night);
    const tod = f.h * 3600 + f.m * 60 + s;

    const now = f.hh + f.mm;
    const prv = clockFields(new Date(ctx.date.getTime() - 60000)), nxt = clockFields(new Date(ctx.date.getTime() + 60000));
    const before = prv.hh + prv.mm, after = nxt.hh + nxt.mm;
    const hourShow = prv.h !== f.h && s < 14;

    COV.fill(0);
    const calm = 1 - 0.35 * night;

    // ---- the swell this second, and the big ones
    const big = s >= 15 && s < 17 ? sm((s - 15) / 0.3) * (1 - sm((s - 16.2) / 0.8)) : 0;
    const back = s >= 45 && s < 47 ? sm((s - 45) / 0.3) * (1 - sm((s - 46.2) / 0.8)) : 0;
    const tide = hourShow ? sm(s / 0.6) * (1 - sm((s - 2.5) / 2)) : 0;

    // ---- the fronds
    for (let i = 0; i < 4; i++) {
      const sl = SLOTS[i], xc = sl.x + sl.w / 2;
      let tau = s - xc / WAVE_V;
      let A = 2.0 * calm;
      let su = surge(tau), fl = surge(tau - 0.07);
      // big swell from the left (:15), backwash from the right (:45), the hour's tide from the left
      const tb = s - 15 - xc / 120, tk = s - 45 - (W - xc) / 120, th = s - xc / 110;
      if (big > 0 && tb > 0) { const e = Math.exp(-tb * 1.6) * Math.sin(Math.min(tb * 5, Math.PI / 2 + tb * 3.2)); su += 1.8 * e; fl += 2.0 * e; }
      if (back > 0 && tk > 0) { const e = Math.exp(-tk * 1.6) * Math.sin(Math.min(tk * 5, Math.PI / 2 + tk * 3.2)); su -= 1.8 * e; fl -= 2.0 * e; }
      if (tide > 0 && th > 0) { const e = Math.exp(-th * 0.9) * Math.sin(Math.min(th * 4, Math.PI / 2 + th * 2.4)); su += 2.2 * e; fl += 2.4 * e; }
      const sway = A * su + 0.6 * sin(0.9 * tod + sl.ph), soft = 1 + 0.75 * (su > 0 ? su : 0) * calm;
      const dNow = +now[i], dOld = +before[i], dNew = +after[i];
      // the old specimen lifted before the turn
      if (s >= 58.8 && dNew !== dNow) {
        const l = progress(s, 58.8, 59.8) ** 1.4;
        place(i, tod, sway, fl, soft + 3.2 * l, calm);
        P.alpha = (1 - l) ** 1.2; P.lift = 3 * l; P.droop = 0.7 * l; P.unfurl = 1 - 0.6 * l;
      } else if (s < 1.4 && dOld !== dNow) {
        // the new one laid down after it: soft and faint, then crisp, pinnae unfurling
        const mu = 1 - ease.outCubic(progress(s, 0, 1.4));
        place(i, tod, sway, fl, soft + 3.2 * mu, calm);
        P.alpha = 1 - mu * mu; P.lift = 3 * mu; P.unfurl = 1 - mu;
      } else place(i, tod, sway, fl, soft, calm);
      if (P.alpha > 0.01) {
        render(stipeOf(i, dNow), P);
        render(frondOf(i, dNow), P);
      }
    }

    // ---- the colon: two sea-balls, lifted by each swell
    for (let k = 0; k < 2; k++) {
      const [cx, cy] = COLON[k], su = surge(s - cx / WAVE_V - 0.03 * k) * calm + 1.6 * big - 1.6 * back + 2 * tide;
      stamp(cx + 0.6 * su, cy, 2.4, 1 + 0.8 * (su > 0 ? su : 0), 255);
      stamp(cx + 0.6 * su - 0.4, cy - 0.3, 3.3, 1.6 + (su > 0 ? su : 0), 110);
    }

    // ---- :30 a loose sprig drifts along the foot of the sheet
    if (s >= 29 && s < 39 && !hourShow) {
      const u = (s - 29) / 10;
      P.ox = -20 + 200 * u; P.oy = 67 + 2.2 * sin(u * 9); P.pivot = 999; P.invL = 0;
      P.sway = 0; P.lean = 0; P.und = 0.5; P.t = tod; P.ph = 0; P.flow = 0.8 + 0.5 * sin(tod * 2.1);
      P.soft = 1.6 + 0.6 * sin(tod * 1.3); P.alpha = 0.72 * sm(u * 8) * sm((1 - u) * 8); P.unfurl = 1; P.droop = 0; P.lift = 0; P.idle = 1.4;
      render(SPRIG, P);
    }

    // ---- the hour: loose specimens laid in the tide's wave, lifted by the backwash
    if (hourShow) {
      for (let k = 0; k < LOOSE.length; k++) {
        const L = LOOSE[k], lx = (L.box[0] + L.box[2]) / 2;
        const tin = s - (lx / 110 + 0.25), tout = s - (10 + (W - lx) / 90);
        if (tin <= 0) continue;
        const mu = 1 - ease.outCubic(Math.min(1, tin / 1.2)), l = tout > 0 ? Math.min(1, tout / 1.3) : 0;
        if (l >= 1) continue;
        const su = surge(s - lx / WAVE_V);
        P.ox = -6 * l; P.oy = 0; P.pivot = 80; P.invL = 1 / 40; P.sway = 1.6 * su + 3 * Math.exp(-tin) ; P.lean = 0; P.und = 0.4;
        P.t = tod; P.ph = k; P.flow = surge(s - lx / WAVE_V - 0.07) + 1.5 * Math.exp(-tin); P.idle = 1;
        P.soft = 1.3 + 3 * mu + 3 * l; P.alpha = 0.9 * (1 - mu * mu) * (1 - l) ** 1.2; P.unfurl = 1 - mu; P.droop = 0.6 * l; P.lift = 3 * mu + 3 * l;
        render(L, P);
      }
    }

    // ---- the wash, per column (exposure multiplier, 256 = as coated)
    COL.fill(256);
    if (hourShow) {
      // the tide's front from the left; behind it washed pale, then developing to full blue
      for (let x = 0; x < W + 8; x++) {
        const tp = (x - 4) / 110, d = s - tp;
        if (d < 0) continue;
        let v = 0.55 + 0.45 * sm((d - 0.3) / 3.2);
        if (d < 0.12) v = 0.82 + 0.25 * (1 - d / 0.12);          // the foam line
        COL[x] = (v * 256) | 0;
      }
    } else {
      if (s >= 59.4 || s < 1.0) {
        // the wash from the right; changed places stay pale and develop
        const tw = s >= 59.4 ? s - 59.4 : s + 0.6;
        const xf = W + 6 - tw * 190;
        let lo = 999, hi = -999;
        for (let i = 0; i < 4; i++) if (+now[i] !== +after[i] && s >= 59) { lo = Math.min(lo, SLOTS[i].x - 9); hi = Math.max(hi, SLOTS[i].x + SLOTS[i].w + 9); }
        for (let i = 0; i < 4; i++) if (+now[i] !== +before[i] && s < 2) { lo = Math.min(lo, SLOTS[i].x - 9); hi = Math.max(hi, SLOTS[i].x + SLOTS[i].w + 9); }
        for (let x = 0; x < W + 8; x++) {
          const d = (xf - x) / 190;       // seconds since the front passed this column (negative: not yet)
          if (d > 0) continue;
          const dd = -d;
          let v = 1;
          if (dd < 0.05) v = 0.86;
          else if (dd < 0.35) v = 0.86 + 0.14 * sm((dd - 0.05) / 0.3);
          if (x >= lo && x <= hi) { const e = Math.min(1, (x - lo) / 5, (hi - x) / 5); v = Math.min(v, 1 - e * (0.38 - 0.38 * sm((dd - 0.1) / 1.6))); }
          COL[x] = (v * 256) | 0;
        }
      }
      if (s < 2.6) {
        // the changed places finish developing after the front has gone
        for (let i = 0; i < 4; i++) {
          if (+now[i] === +before[i]) continue;
          const lo = SLOTS[i].x - 9, hi = SLOTS[i].x + SLOTS[i].w + 9;
          for (let x = lo; x <= hi; x++) {
            const xf0 = W + 6 - x;            // where the front was at 59.4 + tp
            const dd = s + 0.6 - xf0 / 190;
            if (dd <= 0) continue;
            const e = Math.min(1, (x - lo) / 5, (hi - x) / 5);
            const v = 1 - e * (0.38 - 0.38 * sm((dd - 0.1) / 1.6));
            if (x >= 0 && x < W + 8) COL[x] = Math.min(COL[x], (v * 256) | 0);
          }
        }
      }
      // the tidelines of the big swells
      const line = (x0, v) => { for (let x = Math.max(0, x0 - 10 | 0); x < Math.min(W + 8, x0 + 1); x++) { const q = (x0 - x) / 10; COL[x] = Math.min(COL[x], ((1 - 0.16 * (1 - q) * v) * 256) | 0); } };
      if (s >= 15 && s < 16.6) line(-4 + (s - 15) * 120, 1);
      if (s >= 45 && s < 46.6) { const x0 = W + 4 - (s - 45) * 120; for (let x = Math.max(0, x0 | 0); x < Math.min(W + 8, x0 + 10); x++) { const q = (x - x0) / 10; COL[x] = Math.min(COL[x], ((1 - 0.16 * (1 - q)) * 256) | 0); } }
    }

    // ---- the print: coat x light x (1 - shadow) through the ramp
    const buf = g.buf;
    const o1x = ((tod * 9) | 0) & 63, o1y = ((tod * 3.5) | 0) & 63, o2x = (64 - (((tod * 6.5) | 0) & 63)) & 63, o2y = ((tod * 5) | 0) & 63;
    for (let y = 0; y < H; y++) {
      const row = y * W, r1 = ((y + o1y) & 63) << 6, r2 = ((y + o2y) & 63) << 6, jy = JIT[y] + 4, by = (y & 3) << 2;
      for (let x = 0; x < W; x++) {
        const i = row + x;
        const Lt = 256 - (((T1[r1 | ((x + o1x) & 63)] + T2[r2 | ((x + o2x) & 63)]) * 40) >> 9);
        let xc = x + jy; if (xc > W + 7) xc = W + 7;
        // full exposure saturates (D-max): only thin coat, the dapple's bright lines and washes show below it
        let e = (COAT[i] * Lt * GAIN) >> 16;
        if (e > 255) e = 255;
        e = (e * COL[xc]) >> 8;
        e = (e * (255 - COV[i])) >> 8;
        if (e > 255) e = 255;
        buf[i] = PAL[(e * 64 + BAYER[by | (x & 3)]) >> 8];
      }
    }
    g.cost.px += N + N / 2;            // the print, and clearing the coverage
    g.cost.box += N * 6 + scanned * 6 + moved * 10 + palOps * 20 + 170 * 4;
  },
};
