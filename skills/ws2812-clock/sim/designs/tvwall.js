// TV wall: nine old television sets stacked 3 by 3 in a shop window at
// night, one panel each, wired to one video-wall feed. The feed is a 70s
// station ident: the hour as one giant striped numeral split over the top
// six tubes (each tube shows its cell of the picture, so the bezels break the
// figure, Nam June Paik style), the minutes on the two sets below, and the
// odd portable at the bottom right drifting through its own channels with
// the frog. Every tube has its own life: scanlines, a scan crawl, flicker,
// barrel curve, a colour cast and a quirk (one rolls, one ghosts, one hums).
// Minute turn: the set carrying the digit loses the station in a static
// burst, and the new digit rolls in until the V-hold locks. Hour: the whole
// wall switches off in a ripple (each picture collapses to a line, then a
// dot), nine dots glow, then every set warms up at once, in perfect sync, on
// the hour ident: the new hour is written on as a ribbon while the frog
// presents from its set.
import * as kit from '../js/kit.js';
import { glyph } from './tvwall-glyphs.js';
import { build, SETS } from './tvwall-sets.js';
import { CHANNELS, tallFrog } from './tvwall-channels.js';

const pad = (n) => String(n).padStart(2, '0');
const hhmm = (d) => pad(d.getHours()) + pad(d.getMinutes());
const NAVY = [0.006, 0.03, 0.1], RAY = [0.012, 0.07, 0.2];

// glyph textures, 64 texels a cell: each hour digit stands on two stacked
// sets (1 x 2 cells), each minute digit fills one set
const HG = (d) => glyph(+d, 64, 128, 46, 82, 8);
const MG = (d) => glyph(+d, 64, 64, 40, 42, 6);
// which sets carry what: hours (cols 0-1, rows 0-1), minutes (row 2), channels (col 2)
// build every numeral texture up front, so no frame pays for one
for (let d = 0; d < 10; d++) { HG(d); MG(d); }
const CHAN = [0, 0, 1, 0, 0, 1, 0, 0, 1], TUNE_AT = [0, 0, 4, 0, 0, 11, 0, 0, 17];

/** A tuning-in: old picture lost in snow, burst, new picture rolls to a lock. */
function tune(st, a) {
  if (a < 0) { st.old = true; return; }
  if (a < 0.45) { const k = a / 0.45; st.snow = Math.max(st.snow, kit.ease.in(k)); st.roll += 0.5 * k * k; st.fade = 1 - k; st.old = true; return; }
  if (a < 0.8) { st.snow = 1; st.fade = 0; st.old = false; st.burst = 1; return; }
  if (a < 2.3) {
    const k = (a - 0.8) / 1.5;
    st.old = false; st.snow = Math.max(st.snow, 1 - kit.ease.out(Math.min(1, k * 1.4)));
    st.fade = kit.smoothstep(0, 0.3, k);
    st.roll += 1.12 * 1.4 * (1 - kit.ease.out(k)) + 0.06 * Math.sin(k * 14) * (1 - k) * (1 - k);
  }
}
/** Switch-off: picture collapses to a line, then a dot that fades. */
function switchOff(st, e) {
  if (e <= 0) return;
  if (e < 0.55) st.cy = 1 - 0.985 * kit.ease.in(e / 0.55);
  else {
    st.cy = 0.015;
    st.cx = e < 0.8 ? 1 - 0.98 * kit.ease.in((e - 0.55) / 0.25) : 0.02;
    if (e >= 0.8) st.dot = Math.exp(-(e - 0.8) * 2.2);
  }
}
/** Warm-up: a dot grows into a line, the line opens into the picture. */
function warmUp(st, e) {
  if (e < 0) return;
  if (e >= 1) { st.cy = 1; st.cx = 1; st.dot = 0; return; }
  st.dot = 0;
  if (e < 0.3) { st.cy = 0.015; st.cx = 0.02 + 0.98 * kit.ease.out(e / 0.3); }
  else { st.cx = 1; st.cy = 0.015 + 0.985 * kit.ease.outBack((e - 0.3) / 0.7); }
  st.gain *= 1 + 0.5 * (1 - e);
}

const ST = Array.from({ length: 9 }, () => ({}));
let IMG = null, LUM = new Float64Array(9), CNT = new Float64Array(9);

export default {
  name: 'TV Wall',
  blurb: 'nine CRT sets stacked in a shop window carry one broadcast: the hour split over six tubes; channels change, tubes roll, collapse to a dot and warm up',
  layouts: ['hub-3x3'], look: 'smoke', fps: 60, brightness: 0.35, dither: true,
  frame(ctx) {
    const G = kit.grid(ctx), S = build(G), W = G.w, N = W * G.h;
    if (!IMG || IMG.length !== 3 * N) IMG = new Float32Array(3 * N);
    const img = IMG;
    const now = ctx.date.getTime() / 1000, T = ((now % 86400) + 86400) % 86400;
    const M = Math.floor(now / 60) * 60, age = now - M;
    const cur = hhmm(ctx.date), prev = hhmm(new Date((M - 60) * 1000));
    const hourShow = ctx.date.getMinutes() === 0 && age < 9;
    const dim = 1 - 0.7 * ctx.night;
    const frame60 = Math.floor(T * 60);
    const sync = hourShow ? kit.smoothstep(5, 8, age) : 1;      // 0: all sets locked together
    const burstGain = hourShow ? 1 + 1.0 * (1 - kit.smoothstep(1.2, 7, age)) : 1;
    const spin = T * 0.03 + (hourShow ? 0.9 * kit.smoothstep(1.0, 6, age) : 0);
    const writeOn = hourShow ? kit.clamp((age - 1.15) / 0.9) : 1;

    // ------------------------------------------------ per-set state
    for (let s = 0; s < 9; s++) {
      const st = ST[s];
      st.roll = 0; st.snow = 0; st.fade = 1; st.old = false; st.burst = 0; st.cy = 1; st.cx = 1; st.dot = 0;
      st.gain = 1; st.blank = 0; st.ch = -1; st.oldCh = -1; st.frogShow = false;
      const c = s % 3, r = Math.floor(s / 3);
      // resting quirks (they fade out while the hour ident holds the wall in sync)
      if (s === 4) { const k = (T % 41) / 1.9; if (k < 1) st.roll += 1.12 * kit.ease.inOut(k) * sync; }
      if (s === 7) st.snow = 0.07 * sync;
      if (s === 8) st.snow = (0.06 + 0.25 * kit.smoothstep(0.75, 0.95, kit.noise2(T * 0.4, 3))) * sync;
      if (CHAN[s]) {
        const k = Math.floor((T - TUNE_AT[s]) / 20), a = T - TUNE_AT[s] - k * 20;
        st.ch = ((((r - k) % 4) + 4) % 4); st.oldCh = ((((r - k + 1) % 4) + 4) % 4);   // four channels, never two sets on the same one
        if (!hourShow) tune(st, a);
      }
      if (hourShow) {
        switchOff(st, age - 0.05 * (c + r));
        if (age > 0.95) warmUp(st, (age - 1.0 - 0.02 * s) / 0.42);
        st.old = age < 0.95;
        if (CHAN[s]) { const back = 6.5 + 0.3 * r; st.old = false; st.frogShow = age >= 0.95 && age < back; if (age >= back) { st.oldCh = -2; tune(st, age - back); } }
      } else if (s === 6 && prev[2] !== cur[2]) tune(st, age - 0.25);
      else if (s === 7 && prev[3] !== cur[3]) tune(st, age);
      LUM[s] = 0; CNT[s] = 0;
    }

    // ------------------------------------------------ the tubes
    const { tv, U, V, cov, vig, meta } = S;
    for (let p = 0; p < N; p++) {
      const s = tv[p];
      if (s < 0) continue;
      const st = ST[s], m = meta[s], c = s % 3, r = (s / 3) | 0;
      let u = U[p], v = V[p], R = 0, Gc = 0, B = 0;
      const y = (p / W) | 0;
      // collapse window
      const H = m.hy * 2, Wd = m.hx * 2;
      const wy = kit.clamp((st.cy * 0.5 - Math.abs(v - 0.5)) * H + 0.5), wx = kit.clamp((st.cx * 0.5 - Math.abs(u - 0.5)) * Wd + 0.5);
      let vis = st.blank ? 0 : wy * wx;
      if (vis > 0) {
        let pu = 0.5 + (u - 0.5) / st.cx, pv = 0.5 + (v - 0.5) / st.cy;
        if (s === 5) pu += 0.012 * Math.sin(pv * 11 - T * 3.1) * sync;
        if (!CHAN[s]) pu += 0.014 * Math.sin(T * (0.31 + 0.04 * s) + s * 1.7) * sync;   // each set's H-hold wanders a little
        let pv2 = pv + st.roll;
        pv2 -= Math.floor(pv2 / 1.12) * 1.12;
        if (pv2 > 1) vis = 0;                       // blanking bar of a rolling picture
        pv = pv2;
        if (vis > 0) {
          const fade = st.fade;
          if (CHAN[s] && !st.frogShow) {
            const ch = st.old ? st.oldCh : st.ch;
            if (fade > 0 && ch >= 0) { CHANNELS[ch](O, pu, pv, T, m.hx / m.hy); R = O[0] * fade; Gc = O[1] * fade; B = O[2] * fade; }
            else if (fade > 0 && ch === -2) { burst(c + pu, r + pv, 1.5, 1.5, spin); tallFrog(O, (pu - 0.5) * m.hx / m.hy, r + pv, T); R = O[0] * fade; Gc = O[1] * fade; B = O[2] * fade; }
          } else {
            // the wall picture: sunburst ground and the ident numerals
            const wxp = c + pu, wyp = r + pv;
            if (fade > 0) {
              burst(wxp, wyp, 1.5, 1.5, spin);
              R = O[0] * burstGain; Gc = O[1] * burstGain; B = O[2] * burstGain;
              if (st.frogShow) { if (tallFrog(O, (pu - 0.5) * m.hx / m.hy, wyp, T)) { R = O[0]; Gc = O[1]; B = O[2]; } }
              else {
                const str = st.old ? prev : cur;
                let Gl, gx, gy, prog = 1;
                if (r < 2) { Gl = HG(str[c]); gx = pu * 64; gy = wyp * 64; if (!st.old) prog = kit.clamp(writeOn * 2 - c); }
                else { Gl = MG(str[c + 2]); gx = pu * 64; gy = pv * 64; }
                sample(Gl, gx, gy, prog, T + c * 0.13);
                const a = SA;
                R = R * (1 - a) + O[0]; Gc = Gc * (1 - a) + O[1]; B = B * (1 - a) + O[2];
                if (s === 3) {          // ghosting: a faint echo to the right
                  sample(Gl, gx - 3.2, gy, prog, T);
                  R += 0.28 * O[0]; Gc += 0.28 * O[1]; B += 0.28 * O[2];
                }
              }
              R *= fade; Gc *= fade; B *= fade;
            }
          }
        }
        // a collapsing picture concentrates into a white-hot line
        const sq = Math.min(st.cy, st.cx);
        if (sq < 1) {
          const wh = 1 - kit.smoothstep(0.03, 0.4, sq), g = 1 + 1.8 * (1 - st.cy);
          R = (R + (0.7 - R) * wh) * g; Gc = (Gc + (0.75 - Gc) * wh) * g; B = (B + (0.85 - B) * wh) * g;
        }
        R *= vis * st.gain; Gc *= vis * st.gain; B *= vis * st.gain;
      }
      if (st.dot > 0) {
        const dd = Math.hypot((u - 0.5) * Wd, (v - 0.5) * H);
        const k = st.dot * Math.exp(-dd * dd / 3.5);
        R += 0.8 * k; Gc += 0.85 * k; B += 0.95 * k;
      }
      // tube life: cast, scanlines, scan crawl, flicker, snow, vignette
      const cast = SETS[s].cast, q = 1 - sync;
      let L = (y & 1 ? 0.8 : 1) * vig[p] * (1 + 0.03 * (kit.hash(frame60, s) - 0.5) * sync);
      const crawl = kit.fract(T * (0.05 + 0.013 * s) + s * 0.31);
      const dv = v - crawl;
      L *= 1 + (s === 6 ? -0.35 : 0.14) * Math.exp(-dv * dv * 180) * sync;
      R *= L * (cast[0] * sync + q); Gc *= L * (cast[1] * sync + q); B *= L * (cast[2] * sync + q);
      if (st.snow > 0 && st.cy > 0.5) {
        const n = kit.hash(p, frame60, 7), streak = kit.hash(y, frame60 >> 1, 3);
        const sn = st.snow * (0.5 * n * n + 0.15 * streak) * (st.burst ? 1.15 : 1);
        const keep = 1 - 0.8 * st.snow;
        R = R * keep + sn * 0.85; Gc = Gc * keep + sn * 0.9; B = B * keep + sn;
      }
      img[3 * p] = R; img[3 * p + 1] = Gc; img[3 * p + 2] = B;
      LUM[s] += 0.3 * R + 0.6 * Gc + 0.1 * B; CNT[s]++;
    }
    // ------------------------------------------------ cabinets, lit by their own tubes
    const cab = S.cab;
    const spill = new Float64Array(9);
    for (let s = 0; s < 9; s++) spill[s] = Math.min(1.5, 0.35 + 5 * LUM[s] / Math.max(1, CNT[s]));
    for (let p = 0; p < N; p++) {
      const s = tv[p], x = p % W, y = (p / W) | 0;
      const k = spill[((y >> 6) * 3 + (x >> 6))];
      if (s < 0) { img[3 * p] = cab[3 * p] * k; img[3 * p + 1] = cab[3 * p + 1] * k; img[3 * p + 2] = cab[3 * p + 2] * k; }
      else {
        const cv = cov[p];
        if (cv < 1) for (let ch = 0; ch < 3; ch++) img[3 * p + ch] = cab[3 * p + ch] * k * (1 - cv) + img[3 * p + ch] * cv;
      }
    }
    kit.blitGrid(ctx, img, dim);
  },
};

// ---------------------------------------------------------------- helpers
const O = new Float32Array(3);
let SA = 0;
/** Sunburst ground of the ident at wall coords (x, y) around (cx, cy). */
function burst(x, y, cx, cy, spin) {
  const dx = x - cx, dy = y - cy, rr = Math.sqrt(dx * dx + dy * dy);
  const a = Math.atan2(dy, dx);
  const ray = 0.5 + 0.5 * Math.cos(a * 14 + spin * 6.2832);
  const k = kit.smoothstep(0.2, 0.75, ray) * (0.55 + 0.45 * Math.exp(-rr * 0.5));
  O[0] = NAVY[0] + (RAY[0] - NAVY[0]) * k; O[1] = NAVY[1] + (RAY[1] - NAVY[1]) * k; O[2] = NAVY[2] + (RAY[2] - NAVY[2]) * k;
}
/** Bilinear sample of a glyph texture at texel (x, y) into O and SA. */
function sample(Gl, x, y, prog, T) {
  x -= 0.5; y -= 0.5;
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, w = Gl.w, h = Gl.h;
  O[0] = 0; O[1] = 0; O[2] = 0; SA = 0;
  if (x0 < -1 || y0 < -1 || x0 >= w || y0 >= h) return;
  const rgb = Gl.rgb, A = Gl.a, Tt = Gl.t;
  for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
    const xx = x0 + i, yy = y0 + j;
    if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
    const wgt = (i ? fx : 1 - fx) * (j ? fy : 1 - fy), q = yy * w + xx;
    let a = A[q];
    if (a <= 0) continue;
    const tp = Tt[q];
    let k = wgt;
    if (prog < 1) k *= 1 - kit.smoothstep(prog - 0.04, prog, tp);
    // a light runs along the ribbon every few seconds
    const ph = tp - kit.fract(T / 6) * 1.6 + 0.3, run = 1 + 0.9 * Math.exp(-ph * ph * 60) * Gl.hot[q];
    O[0] += rgb[3 * q] * k * run; O[1] += rgb[3 * q + 1] * k * run; O[2] += rgb[3 * q + 2] * k * run;
    SA += a * k;
  }
}
