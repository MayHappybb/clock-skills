// Plankton: a beach at night, seen from straight above. The sea is at the
// top; waves peel along the bar and break in a line of electric blue, and
// the swash runs up the sand in scalloped tongues of light. Somebody nobody
// can see has written the time in the wet sand with a stick. Every wave
// that runs over the writing wakes the dinoflagellates in the grooves and
// the numerals flare, then settle back to a steady glimmer, cell by cell.
//
// Before a digit changes, footprints come walking along the tideline, stop
// under it, and a foot scuffs it out in a smear of light. After :00 the
// stick writes the new digit, its tip a white spark, and the footprints walk
// off and fade. At the hour a big wave takes the whole beach, digits,
// tracks and all, and the writer comes back and writes the time again.
//
// The medium is light, not paint: every frame is a light buffer (how
// excited the plankton are at each pixel) added through a blue-to-white
// ramp onto a dark beach (sea, swash film, wet and dry sand), then
// ordered-dithered to RGB565. Nothing has a keyline; nothing is a flat
// fill; the rhythm is the waves (every 5-8 s, irregular), not a beat.
//
// Palette: night sand in two mauve-greys (wet, dry), indigo water, and one
// emissive ramp (deep blue, electric blue 0x1a9cff, cyan, white) for all the
// light. Everything is computed in plain loops into the light buffer, priced
// by hand into the canvas cost below (fixed-point C, table exp and sqrt).

import { clockFields, rand, hash, sin, TAU } from '../js/kit.js';
import { glyph, MW, MH, GLYPH_PAD } from './plankton-glyphs.js';
import { wavesOf, planOf, writtenAt, DX, DY, COLON_X, standX } from './plankton-story.js';

const W = 160, H = 80, N = W * H;

// ------------------------------------------------------------ tables

const EXP = Float32Array.from({ length: 513 }, (_, i) => Math.exp(-i / 64)); // exp(-x), x in [0, 8]
const ex = (x) => (x <= 0 ? 1 : x >= 8 ? 0 : EXP[(x * 64) | 0]);
const SQRT = Float32Array.from({ length: 257 }, (_, i) => Math.sqrt(i / 256));
const sq = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : SQRT[(x * 256) | 0]);

// The light ramp, L in [0, 2] -> added RGB
const RAMP_STOPS = [
  [0.0, [0, 0, 0]], [0.12, [0, 10, 40]], [0.3, [0, 42, 120]], [0.5, [4, 92, 205]],
  [0.72, [20, 150, 255]], [0.95, [60, 205, 255]], [1.25, [150, 238, 255]], [1.7, [230, 252, 255]], [2.0, [255, 255, 255]],
];
const RAMP = new Uint8Array(257 * 3);
for (let i = 0; i <= 256; i++) {
  const L = (i / 256) * 2;
  let k = 0;
  while (k < RAMP_STOPS.length - 2 && RAMP_STOPS[k + 1][0] < L) k++;
  const [a, ca] = RAMP_STOPS[k], [b, cb] = RAMP_STOPS[k + 1], u = Math.min(1, Math.max(0, (L - a) / (b - a)));
  for (let c = 0; c < 3; c++) RAMP[i * 3 + c] = Math.round(ca[c] + (cb[c] - ca[c]) * u);
}

const BAYER = Float32Array.from([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5], (v) => (v + 0.5) / 16);

// ------------------------------------------------------------ the beach (static)

/** Where the waves break, per column: the bar's line, a little uneven. */
const YB = Float32Array.from({ length: W }, (_, x) => 16.5 + 1.6 * Math.sin(x * 0.045 + 1) + 0.8 * Math.sin(x * 0.13 + 2));

const DRY = new Uint8Array(N * 3), WET = new Uint8Array(N * 3), FILM = new Uint8Array(N * 3);
const TEX = new Float32Array(N);       // a smooth noise, for smears and foam
const SEA_TEX = new Float32Array(64 * 64);
{
  const vn = (x, y, s, seed) => {
    const ix = Math.floor(x / s), iy = Math.floor(y / s), fx = x / s - ix, fy = y / s - iy;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    const a = rand(ix, iy, seed), b = rand(ix + 1, iy, seed), c = rand(ix, iy + 1, seed), d = rand(ix + 1, iy + 1, seed);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  };
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x, k = i * 3;
      const grain = rand(x, y, 3) - 0.5, ripple = vn(x, y, 7, 11) - 0.5;
      // ripple marks on the sand, faint, along the shore
      const rip = 0.5 + 0.5 * Math.sin(y * 0.9 + 2.5 * Math.sin(x * 0.07) + x * 0.05);
      const dv = 9 * grain + 6 * ripple + 4 * rip;
      DRY[k] = clamp8(56 + dv); DRY[k + 1] = clamp8(47 + dv * 0.9); DRY[k + 2] = clamp8(52 + dv * 0.8);
      const wv = 5 * grain + 4 * ripple + 2 * rip;
      WET[k] = clamp8(28 + wv); WET[k + 1] = clamp8(27 + wv); WET[k + 2] = clamp8(42 + wv);
      FILM[k] = clamp8(13 + 3 * ripple); FILM[k + 1] = clamp8(24 + 4 * ripple); FILM[k + 2] = clamp8(46 + 5 * ripple);
      TEX[i] = vn(x, y, 3.2, 21) * 0.65 + vn(x, y, 1.6, 22) * 0.35;
    }
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++) {
      // tileable: blend the noise with its wrapped copies
      const a = vn(x, y, 8, 31), b = vn(x + 64, y, 8, 31), c = vn(x, y + 64, 8, 31), d = vn(x + 64, y + 64, 8, 31);
      const u = x / 64, v = y / 64;
      SEA_TEX[y * 64 + x] = (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
    }
}
function clamp8(v) { return v < 0 ? 0 : v > 255 ? 255 : v | 0; }

// Stranded plankton in the sand: specks that light when the water passes.
const SPECKS = [];
{
  let n = 0;
  for (let i = 0; n < 340 && i < 4000; i++) {
    const x = (rand(i, 1, 41) * W) | 0, y = 15 + ((rand(i, 2, 41) * 62) | 0);
    SPECKS.push({ x, y, a: 0.45 + 0.75 * rand(i, 3, 41), ph: i });
    n++;
  }
}
const SEA_SPECKS = Array.from({ length: 70 }, (_, i) => ({ x: (rand(i, 5, 43) * W) | 0, y: (rand(i, 6, 43) * 18) | 0, ph: i }));

// Footprints, as tiny light masks: walking (toe to the right) and standing (toe up).
const FOOT_R = [
  [0, 0.5, 0, 0, 0.6, 0.6, 0],
  [0.6, 1, 0.3, 0.5, 1, 1, 0.7],
  [0, 0.5, 0, 0, 0.6, 0.6, 0],
];
const FOOT_U = FOOT_R[0].map((_, i) => FOOT_R.map((row) => row[6 - i]));   // toe up

// ------------------------------------------------------------ per frame buffers

const L = new Float32Array(N);        // plankton light
const SHEEN = new Float32Array(N);    // moonlight on water (crests)
const TL = new Float32Array(N);       // when the swash last reached this pixel (s, this minute)
const WATER = new Float32Array(W);    // the swash's edge per column (water above it)
const WETY = new Float32Array(W);     // how far up the sand is wet

export default {
  name: 'Plankton',
  blurb: 'Night beach from above: the time is written in wet sand, and every wave that runs over it wakes the plankton in the grooves.',
  fps: 60,

  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, mk = f.minuteKey;
    ctx.lcd.backlight(1 - 0.55 * ctx.night);
    const cost = g.cost;
    L.fill(0); SHEEN.fill(0); TL.fill(-1e9);
    cost.box += N;   // the clears

    // ---------------------------------------------------- waves
    const waves = [];
    for (const d of [-1, 0, 1]) {
      const fm = d === 0 ? f : clockFields(new Date((mk + d) * 60000));
      for (const w of wavesOf(mk + d, fm.m)) waves.push({ ...w, t0: w.t0 + 60 * d });
    }
    waves.sort((a, b) => a.t0 - b.t0);
    for (let x = 0; x < W; x++) { WATER[x] = 0; WETY[x] = YB[x]; }

    let bigWave = null;
    for (const w of waves) {
      if (w.big && w.t0 <= s + 3 && w.t0 > s - 60) bigWave = w;
      const age = s - w.t0;
      if (age < -3.5 || age > 75) continue;
      const fresh = age < w.T + w.Tb + 6;   // still moving or still glowing
      for (let x = 0; x < W; x++) {
        const tb = w.t0 + (w.dir > 0 ? x : W - 1 - x) * w.peel;
        const tau = s - tb, yb = YB[x];
        const Rx = w.R + w.amp * sin(x * w.k + w.ph);
        // how far up the sand this wave wet it, for the wet/dry line
        if (tau > 0) {
          const reach = tau < w.T ? yb + (Rx - yb) * (1 - (1 - tau / w.T) ** 2) : Rx;
          const dryness = tau > 20 ? (tau - 20) / 40 : 0;   // old wet marks shrink as the sand drains
          const wy = reach - dryness * (reach - yb) * 0.5;
          if (wy > WETY[x]) WETY[x] = wy;
        }
        if (!fresh) continue;
        cost.box += 30;
        if (tau < 0) {
          // the swell coming in over the sea: a moonlit crest, glowing as it steepens
          if (tau > -2.6) {
            const yc = yb + tau * 7;
            const y0 = Math.max(0, (yc - 3) | 0), y1 = Math.min(H - 1, (yc + 1) | 0);
            const glow = tau > -0.6 ? (1 + tau / 0.6) * 0.45 : 0;
            for (let y = y0; y <= y1; y++) {
              const dd = y + 0.5 - yc, p = y * W + x;
              const prof = dd < 0 ? ex(-dd / 1.2) : ex(dd * 2);
              SHEEN[p] += prof * 0.9;
              if (glow) L[p] += glow * prof * (0.4 + TEX[p]);
              cost.box += 3;
            }
          }
          continue;
        }
        // the break: a flash along the bar as the wave peels past this column
        if (tau < 2.5) {
          const fl = 1.55 * ex(tau / 0.42) + 0.25 * ex(tau / 1.6);
          const y0 = Math.max(0, (yb - 6) | 0), y1 = Math.min(H - 1, (yb + 3) | 0);
          for (let y = y0; y <= y1; y++) {
            const p = y * W + x, dd = y + 0.5 - (yb - 1.5);
            const prof = ex((dd < 0 ? -dd : dd) / 2.2) * (0.55 + 0.9 * TEX[(p + ((s * 9) | 0)) % N]);
            L[p] += fl * prof * (w.big ? 1.25 : 1);
            cost.box += 4;
          }
        }
        // uprush and backwash
        const T = w.T, Tb = w.Tb;
        let e;
        if (tau < T) {
          const u = tau / T;
          e = yb + (Rx - yb) * (1 - (1 - u) * (1 - u));
          const F = (0.3 + 1.15 * (1 - u) ** 1.5) * (w.big ? 1.3 : 1);
          const y0 = Math.max(0, (e - (w.big ? 16 : 9)) | 0), y1 = Math.min(H - 1, e | 0);
          const foam = 0.55 + 0.9 * rand(x >> 1, (tau * 10) | 0, w.t0 * 10 | 0);
          for (let y = Math.max(y0, yb | 0); y <= y1; y++) {
            const dd = e - (y + 0.5), p = y * W + x;
            L[p] += F * ex(dd / (w.big ? 4 : 1.7)) * (dd < 1.5 ? foam : 0.6 + 0.6 * TEX[p]);
            cost.box += 3;
          }
          // the thin film behind the front
          const yy1 = Math.min(H - 1, y0);
          // (the big wave: the whole body of water churning with light)
          const film = w.big ? 0.3 + 0.55 * (1 - u) : 0.13 * (1 - u);
          for (let y = yb | 0; y < yy1; y++) {
            const p = y * W + x, tx = w.big ? TEX[(p + W * (((s * 14) | 0) % H)) % N] : TEX[p];
            L[p] += film * tx * (w.big ? 1.4 : 1);
            cost.box += 2;
          }
        } else if (tau < T + Tb) {
          const v = (tau - T) / Tb, ev = v < 0.5 ? 2 * v * v : -1 + (4 - 2 * v) * v;
          e = Rx - (Rx - yb) * ev;
          const y0 = Math.max(yb | 0, (e - (w.big ? 80 : 3)) | 0), y1 = Math.min(H - 1, e | 0);
          const amt = w.big ? 0.3 * (1 - v) : 0.22 * (1 - v);
          for (let y = y0; y <= y1; y++) {
            const p = y * W + x, tx = w.big ? TEX[(p + W * ((80 - ((s * 9) | 0) % H) % H)) % N] : TEX[p];
            L[p] += amt * tx * (w.big ? 1.6 * tx : 1);
            cost.box += 2;
          }
        } else e = 0;
        if (e > WATER[x]) WATER[x] = e;
        // when the front reached each row (for the plankton it wakes)
        const top = Math.min(H - 1, tau < T ? e : Rx);
        if (age < 12)
          for (let y = Math.max(0, yb | 0); y <= top; y++) {
            const sr = (y + 0.5 - yb) / (Rx - yb);
            if (sr < 0) continue;
            const tr = tb + T * (1 - sq(1 - sr));
            if (tr <= s) TL[y * W + x] = tr;
            cost.box += 3;
          }
      }
    }

    // ---------------------------------------------------- the writing
    const plan = planOf(mk), planPrev = planOf(mk - 1);
    const digits = f.hh + f.mm;
    const slots = [0, 1, 'c', 2, 3];
    for (const p of slots) {
      // which instance is on the sand, and how much of it is written
      let wr = plan.writes.find((w) => w.p === p && w.t0 <= s);
      let t0 = -1e9, dur = 1, seed;
      if (wr) { t0 = wr.t0; dur = wr.dur; seed = wr.seed; }
      else if (plan.writes.find((w) => w.p === p)) continue; // erased, not yet rewritten
      else {
        const wm = writtenAt(mk, f.m, p);
        seed = wm * 5 + (p === 'c' ? 4 : p);
        const pw = planPrev.writes.find((w) => w.p === p);
        if (pw && wm === mk - 1) { t0 = pw.t0 - 60; dur = pw.dur; }
      }
      const d = p === 'c' ? ':' : digits[p];
      const m = glyph(d, seed);
      const ox = p === 'c' ? Math.round(COLON_X - MW / 2) : DX[p] - GLYPH_PAD, oy = DY - GLYPH_PAD;
      const prog = (s - t0) / dur;
      const sc = plan.scuffs.find((q) => q.p === p && s >= q.t0);
      for (let j = 0; j < MH; j++) {
        const y = oy + j;
        if (y < 0 || y >= H) continue;
        for (let i = 0; i < MW; i++) {
          const k = j * MW + i, uu = m.u[k];
          if (uu > 1.5 || uu > prog) continue;
          const x = ox + i;
          if (x < 0 || x >= W) continue;
          if (sc && s >= passTime(sc, x, y, p)) continue;   // scuffed out
          const pix = y * W + x;
          cost.box += 9;
          // big wave: the groove is gone once the water has been over it
          let keep = 1;
          if (bigWave) {
            const trb = bigReach(bigWave, x, y + 0.5);
            if (s > trb && t0 + uu * dur < trb) { keep = 1 - (s - trb) / 0.35; if (keep <= 0) continue; }
          }
          const tw = t0 + uu * dur;                       // when the stick passed here
          const fr = ex((s - tw) / 1.3);
          const tl = TL[pix], E = tl > -1e8 ? ex((s - tl) / 1.15) : 0;
          const tws = rand(pix, (s * 7) | 0, 77) < 0.035 ? 0.45 : 0;  // a cell flashing
          const c = m.core[k], h = m.halo[k];
          L[pix] += keep * (c * (0.5 + 0.8 * fr + 0.95 * E + tws) + h * (0.55 + 1.6 * fr + 1.3 * E));
        }
      }
      // the stick's tip while writing
      if (prog >= 0 && prog < 1) {
        const [tx, ty] = m.tipAt(prog);
        spark(ox + tx, oy + ty, 1.5, 3.2, cost);
        for (let q = 0; q < 4; q++) {           // a spray of startled cells round the tip
          const a = rand(q, (s * 20) | 0, 9) * TAU, r = 1.5 + 4 * rand(q, (s * 20) | 0, 10);
          dot(ox + tx + r * Math.cos(a), oy + ty + r * Math.sin(a), 0.5 * rand(q, (s * 20) | 0, 11), cost);
        }
      }
    }

    // ---------------------------------------------------- scuffs: smears of light
    for (const [pl, off] of [[plan, 0], [planPrev, -60]])
      for (const sc of pl.scuffs) {
        const t = s - off;
        if (t < sc.t0 || t > sc.t1 + 4) continue;
        const x0 = SX0(sc.p), x1 = x0 + SCW;
        for (let y = SY0; y < SY0 + SCH; y++)
          for (let x = x0; x < x1; x++) {
            const pix = y * W + x, tp = passTime(sc, x, y, sc.p);
            if (t < tp) continue;
            const ed = Math.min(y - SY0, SY0 + SCH - 1 - y, x - x0, x1 - 1 - x) / 3;
            const tx = TEX[pix];
            L[pix] += 1.2 * ex((t - tp) / 0.45) * (0.35 + tx) * (ed < 1 ? ed : 1);
            cost.box += 8;
          }
        // the foot itself, ploughing the sand: a blob of light
        if (t < sc.t1) {
          const [fx, fy] = footAt(sc, t, sc.p);
          for (let y = (fy - 8) | 0; y <= fy + 8; y++)
            for (let x = (fx - 6) | 0; x <= fx + 6; x++) {
              if (x < 0 || y < 0 || x >= W || y >= H) continue;
              const dx = (x + 0.5 - fx) / 5, dy = (y + 0.5 - fy) / 7, d2 = dx * dx + dy * dy;
              if (d2 > 1.3) continue;
              L[y * W + x] += (d2 < 0.75 ? 1.2 : (1.3 - d2) * 2.2) * (0.6 + 0.6 * TEX[y * W + x]);
              cost.box += 4;
            }
        }
      }

    // ---------------------------------------------------- footprints
    const allSteps = [];
    for (const st of planPrev.steps) allSteps.push([st, st.t - 60]);
    for (const st of plan.steps) allSteps.push([st, st.t]);
    for (const [st, ts] of allSteps) {
      const a = s - ts;
      if (a < 0 || a > 40) continue;
      // washed away? any swash reaching it after the step
      let gone = false;
      for (const w of waves) {
        if (w.t0 < ts - 4 || w.t0 > s) continue;
        const tr = reachTime(w, st.x, st.y);
        if (tr > ts && tr < s) { gone = true; break; }
      }
      if (gone) continue;
      const b = 1.35 * ex(a / 0.5) + 0.62 * ex(a / 10);
      const mask = st.o === 'U' ? FOOT_U : FOOT_R;
      const flip = st.o === 'L';
      const hgt = mask.length, wid = mask[0].length;
      const x0 = Math.round(st.x - wid / 2), y0 = Math.round(st.y - hgt / 2);
      for (let j = 0; j < hgt; j++)
        for (let i = 0; i < wid; i++) {
          const v = mask[j][flip ? wid - 1 - i : i];
          if (!v) continue;
          const x = x0 + i, y = y0 + j;
          if (x < 0 || x >= W || y < 0 || y >= H) continue;
          L[y * W + x] += v * b;
          cost.box += 3;
        }
      if (a < 0.5) spark(st.x, st.y, 0.6 * (1 - a / 0.5), 4, cost);   // the splash of light as it lands
    }

    // ---------------------------------------------------- specks: stranded and floating plankton
    const slot = (s * 6) | 0;
    for (const sp of SPECKS) {
      const pix = sp.y * W + sp.x;
      if (sp.y > WETY[sp.x] + 1) continue;
      const tl = TL[pix];
      let v = tl > -1e8 ? 1.1 * ex((s - tl) / 0.9) : 0;
      const h = hash(sp.ph, slot, 5) & 1023;
      if (h < 14) v += 0.75 * (1 - (s * 6 - slot));
      if (v < 0.03) continue;
      dot(sp.x + 0.5, sp.y + 0.5, v * sp.a, cost);
    }
    for (const sp of SEA_SPECKS) {
      if (sp.y >= YB[sp.x] - 1) continue;
      const h = hash(sp.ph, (s * 3) | 0, 6) & 255;
      if (h < 40) dot(sp.x + 0.5, sp.y + 0.5, 0.35 + 0.004 * h, cost);
    }

    // ---------------------------------------------------- resolve: beach + light
    const buf = g.buf, drift = (s * 2.2) | 0, dx = (s * 0.7) | 0;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const p = y * W + x, k = p * 3, bt = BAYER[((y & 3) << 2) | (x & 3)];
        let r, gg, b;
        const yb = YB[x];
        if (y + 0.5 < yb - 0.5) {
          // the sea: indigo, deeper away from shore, a slow drifting swell texture
          const st = SEA_TEX[(((y - drift) & 63) << 6) | ((x + dx) & 63)], d = (yb - y) / yb;
          const sh = SHEEN[p];
          r = 9 + 6 * st - 3 * d + 22 * sh; gg = 20 + 12 * st - 8 * d + 38 * sh; b = 54 + 18 * st - 16 * d + 50 * sh;
        } else if (y + 0.5 < WATER[x]) {
          const dep = (WATER[x] - y) / 10, m = dep > 1 ? 1 : dep;
          r = WET[k] + (FILM[k] - WET[k]) * m; gg = WET[k + 1] + (FILM[k + 1] - WET[k + 1]) * m; b = WET[k + 2] + (FILM[k + 2] - WET[k + 2]) * m;
        } else {
          const wv = WETY[x] - (y + 0.5) + bt * 2 - 1;   // dithered tideline
          const src = wv > 0 ? WET : DRY;
          r = src[k]; gg = src[k + 1]; b = src[k + 2];
          if (wv > 0 && wv < 2.5) { r += 4; gg += 6; b += 10; }  // the wet edge catches the sky
        }
        let l = L[p];
        if (l > 0) {
          const li = l >= 2 ? 256 : (l * 128) | 0, q = li * 3;
          r += RAMP[q]; gg += RAMP[q + 1]; b += RAMP[q + 2];
        }
        let R5 = r * (31 / 255) + bt, G6 = gg * (63 / 255) + bt, B5 = b * (31 / 255) + bt;
        R5 = R5 < 0 ? 0 : R5 > 31 ? 31 : R5 | 0; G6 = G6 < 0 ? 0 : G6 > 63 ? 63 : G6 | 0; B5 = B5 < 0 ? 0 : B5 > 31 ? 31 : B5 | 0;
        buf[p] = (R5 << 11) | (G6 << 5) | B5;
      }
    cost.px += N; cost.dither += N; cost.box += N * 5;   // ~25 cycles a pixel: classify, table add, dither, pack
    cost.calls += 40;
  },
};

// ------------------------------------------------------------ helpers

// A scuff: the side of a foot dragged across the digit in three sweeps,
// left to right, back, and right again, working down the box.
const SY0 = DY - 3, SCH = 40, SCW = 36, BAND = SCH / 3;
const SX0 = (p) => DX[p] - 4;
/** When the foot passes pixel (x, y) while scuffing digit p. */
function passTime(sc, x, y, p) {
  let k = ((y - SY0) / BAND) | 0;
  k = k < 0 ? 0 : k > 2 ? 2 : k;
  let fr = (x - SX0(p)) / SCW;
  fr = fr < 0 ? 0 : fr > 1 ? 1 : fr;
  if (k === 1) fr = 1 - fr;
  return sc.t0 + (k + fr) * ((sc.t1 - sc.t0) / 3) + (TEX[(y < 0 ? 0 : y) * W + (x < 0 ? 0 : x)] - 0.5) * 0.12;
}
/** Where the foot is at time t. */
function footAt(sc, t, p) {
  const v = ((t - sc.t0) / (sc.t1 - sc.t0)) * 3;
  const k = Math.min(2, v | 0);
  let fr = v - k;
  if (k === 1) fr = 1 - fr;
  return [SX0(p) + fr * SCW, SY0 + (k + 0.5) * BAND];
}
/** When wave w's swash reaches (x, y), or +inf if it never does. */
function reachTime(w, x, y) {
  const xi = Math.max(0, Math.min(W - 1, x | 0));
  const tb = w.t0 + (w.dir > 0 ? xi : W - 1 - xi) * w.peel, yb = YB[xi];
  const Rx = w.R + w.amp * sin(xi * w.k + w.ph);
  const sr = (y - yb) / (Rx - yb);
  if (sr > 1) return Infinity;
  if (sr < 0) return tb;
  return tb + w.T * (1 - sq(1 - sr));
}
function bigReach(w, x, y) { return reachTime(w, x, y); }

/** A soft point of light. */
function spark(cx, cy, amp, r, cost) {
  const x0 = Math.max(0, (cx - r) | 0), x1 = Math.min(W - 1, (cx + r) | 0);
  const y0 = Math.max(0, (cy - r) | 0), y1 = Math.min(H - 1, (cy + r) | 0);
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d2 = dx * dx + dy * dy;
      if (d2 > r * r) continue;
      L[y * W + x] += amp * ex(d2 / 2.2);
      cost.box += 4;
    }
}
/** One speck: a pixel and a faint cross round it. */
function dot(x, y, v, cost) {
  const xi = x | 0, yi = y | 0;
  if (xi < 0 || xi >= W || yi < 0 || yi >= H) return;
  L[yi * W + xi] += v;
  if (xi > 0) L[yi * W + xi - 1] += v * 0.22;
  if (xi < W - 1) L[yi * W + xi + 1] += v * 0.22;
  if (yi > 0) L[(yi - 1) * W + xi] += v * 0.22;
  if (yi < H - 1) L[(yi + 1) * W + xi] += v * 0.22;
  cost.box += 6;
}
