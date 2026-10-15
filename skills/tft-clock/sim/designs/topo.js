// Topo: a sheet of a Swiss national map (1:25 000 style), and the time is
// four massifs on it. Each numeral is the rock crest of a mountain: a ridge
// of black rock drawn the Swiss way, a solid arete with hachure ticks
// combed off it (topo-glyphs.js: ten digits as straight-run aretes with
// sharp breaks and open basins, rasterised once into distance and
// along-crest maps). Around each crest the brown contour lines ring the
// mountain at a fixed interval, every fifth one a heavier index contour, so
// every digit is also legible as the bull's-eye of its own contours. The
// hours are two big massifs on the west of the sheet, the minutes a smaller
// range to the north east above a long lake (blue fill, depth lines, a shore
// line, its name in blue lettering: the lake is named for the weekday). A
// red trail climbs the pass between hours and minutes in switchbacks, where
// two tarns are the colon; a lake steamer plies its dashed route.
//
// The time is alive: once a second the mountains draw breath: every massif
// rises and settles on the beat, so its contours swell outward and creep
// back; a summit wave runs along each crest (the contour rings ripple with
// it); and on each beat the engraver re-cuts the rock, every hachure easing
// to a new length, so the crest's edge is reworked every second while its
// spine holds still. The hikers (red, white-haloed) take a step up the
// trail on every beat; the valley floor breathes slowly underneath. Every
// 15 s a flourish: a time-lapse uplift front sweeps the sheet west to east,
// every contour flows through a full interval behind it and each massif
// heaves as it passes.
//
// Minute turn (:58.5 to :01.5): erosion in time-lapse. The changing ridges
// sink, their contours collapse inward ring by ring, the rock crumbles away
// in an even per-pixel rank (never a partial digit shape) and its scree
// stipple slides down the flanks and thins; after :00 the new crest is
// first a thin rock line, the whole digit at once, that thickens as the
// mountain rises (overshoots and settles) and its contours ripple out.
// The hour: an ice age. From :57 a glacier fills the sheet from the valleys
// up, drowning contours, trails, the lake and the tarns in white ice with
// flowing blue surface lines; the old ridges are ground away beneath it and
// the new ones rise through it as nunataks, black rock on white, the
// strongest contrast of the hour; by :11 it has melted back.
//
// Palette: the Swiss map's process inks and nothing else: paper, contour
// brown and its index brown, rock black, lake and glacier blues, trail red
// (plus the steamer's black). No hillshading, no gradients: every pixel is
// one flat ink. Rock is the darkest ink on the paper and carries the time.
// Night (23:00-07:00) blends to a darker, warmer paper and deeper inks, the
// backlight dims to 45 %, and the hikers carry yellow headlamps.
//
// Cost: integer passes only. A height buffer (Int16) and a rock mask
// (Uint8) are rebuilt every frame from flash tables: the valley relief, the
// four digit fields (D, S bytes) added with a beat-scaled ridge profile,
// then one print pass turns height level changes into contour pixels.

import { clockFields, sin, hash, ease, clamp, progress, to565, font3x5 } from '../js/kit.js';
import { buildSize } from './topo-glyphs.js';
import { W, H, N, B0, B1, RANK, WATER, DASH, PATHS, TARNS, FERRY_PATH, LAKE_C, LAKE_N } from './topo-land.js';

// ------------------------------------------------------------ sizes and slots

const HOUR = buildSize(21, 47, 15), MIN = buildSize(17, 33, 12);
for (const S of [HOUR, MIN]) {
  S.rid = new Uint8Array(256);
  for (let d = 0; d < 256; d++) S.rid[d] = d >= S.R * 8 ? 0 : Math.round(255 * (1 - d / (S.R * 8)));
}
HOUR.A = 82; HOUR.core8 = 11; HOUR.rock8 = 26;      // crest height, solid crest half-width, hachure reach (1/8 px)
MIN.A = 60; MIN.core8 = 9; MIN.rock8 = 21;

// crest boxes (top-left of the crest lines)
const SLOTS = [
  { S: HOUR, x: 8, y: 16 }, { S: HOUR, x: 41, y: 16 },
  { S: MIN, x: 98, y: 9 }, { S: MIN, x: 127, y: 9 },
];

// ------------------------------------------------------------ palette (Swiss map inks)

const P_DAY = { paper: 0xf4f0e4, contour: 0xc0905c, index: 0xa06c40, rock: 0x23201d, trail: 0xd8262c, hiker: 0xc01820, ice: 0xf7fbff, iceLine: 0x5aa2dc, iceEdge: 0x2f7fc1 };
const P_NIGHT = { paper: 0xcfc2a6, contour: 0x9a6c42, index: 0x80542f, rock: 0x1c1916, trail: 0xb81c22, hiker: 0xa8121a, ice: 0xd6e2ea, iceLine: 0x4a8cc4, iceEdge: 0x2a6aa8 };
const C_HULL = [0x23201d, 0x101010], LAMP = 0xffe27a;
// day and night inks blend over the dimming minute: 33 steps, built at load
const mixI = (a, b, k) => {   // k 0..32, integer
  const ch = (sh) => ((((a >> sh) & 255) * (32 - k) + ((b >> sh) & 255) * k) >> 5) << sh;
  return ch(16) | ch(8) | ch(0);
};
const PAL = [];
for (let k = 0; k <= 32; k++) {
  const raw = {}, c = {};
  for (const key of Object.keys(P_DAY)) { raw[key] = mixI(P_DAY[key], P_NIGHT[key], k); c[key] = to565(raw[key]); }
  const lr = {};
  for (const key of Object.keys(LAKE_C)) lr[key] = mixI(LAKE_C[key], LAKE_N[key], k);
  raw.hull = mixI(C_HULL[0], C_HULL[1], k);
  PAL.push({ raw, c, lake: Uint16Array.from([0, lr.fill, lr.deep, lr.line, lr.shore].map(to565)), lr });
}

// hachure tables: ticks every 3 px of crest, two pixels of ink and one of paper
const TICK = new Uint8Array(256), STRIPE = new Uint8Array(256);
for (let s = 0; s < 256; s++) { TICK[s] = (s / 3) | 0; STRIPE[s] = s % 3 < 2 ? 1 : 0; }
// tick lengths, /256 of the reach: the engraver re-cuts the rock on every
// beat, each tick easing from last second's length to this second's
const jag = (t, sec) => 120 + (hash(t, sec, 5) % 140);

// a sine table in bytes for the per-pixel ridge wave: -64..64
const WAVE = new Int8Array(256);
for (let k = 0; k < 256; k++) WAVE[k] = Math.round(64 * Math.sin((k / 256) * Math.PI * 2));

// ------------------------------------------------------------ working buffers (RAM)

const HT = new Int16Array(N);       // height
const RK = new Uint8Array(N);       // 1 rock ink
const LEN = new Uint8Array(96);     // this slot's tick reach this frame
const PHX = new Int16Array(W);      // contour phase per column (the uplift wave)

// ------------------------------------------------------------ the rhythm

// every 15 s a time-lapse uplift wave rolls across the sheet from the west:
// as it passes, every contour flows three intervals downhill and the
// massifs heave. FL_LIFT is how far the levels move per wave.
const FL_AT = [15, 30, 45], FL_DUR = 3.2, FL_LIFT = 48;
function flourish(s) {                    // -> [waves finished this minute, the running wave's time or -1]
  let done = 0, run = -1;
  for (const t0 of FL_AT) {
    if (s >= t0 + FL_DUR) done++;
    else if (s >= t0) run = (s - t0) / FL_DUR;
  }
  return [done, run];
}
// the front's position (px) at wave time q, and the lift it has given column x
const frontX = (q) => -30 + 220 * q;
const liftAt = (x, q) => { const v = (frontX(q) - x) / 26; return v <= 0 ? 0 : v >= 1 ? 1 : v * v * (3 - 2 * v); };

// the hour: an ice age. From :57 of the last minute the ice surface rises
// over the sheet, valleys first (it is tilted, so the north fills first);
// every contour it drowns turns glacier blue, its surface lines flow. The
// old ridges are ground down under it, the new ones rise through it as
// nunataks, then it melts back by :11.
function iceLevel(s, before, after) {
  if (before && s >= 57) return Math.round(-70 + 150 * ease.inOutQuad(progress(s, 57, 59.6)));
  if (after && s < 11.5) return Math.round(80 - 150 * ease.inOutQuad(progress(s, 6, 11.4)));
  return -999;
}

// hikers: [path, offset px, pace]; they step on the beat
const HIKERS = [[0, 10, 1], [0, 46, 1], [0, 83, 1], [1, 18, 1], [1, 60, 1], [1, 104, 1], [1, 150, 1]];
const STEP = 2.5;   // px per beat

// the lake's name, in the map's blue italic water lettering: the lake is
// named for the day. Pixel offsets per weekday, built at load.
const DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
const LABEL_Y = 72, LABEL_CX = 120;
const LABELS = DAYS.map((name) => {
  const px = [];
  let x = 0;
  for (const ch of name) {
    const gl = font3x5.glyph(ch);
    for (let r = 0; r < gl.h; r++) for (let c = 0; c < gl.w; c++) if (gl.data[r * gl.w + c] >= 0) px.push([x + c + (r < 2 ? 1 : 0), r]);
    x += gl.w + 2;
  }
  const x0 = Math.round(LABEL_CX - x / 2);
  const ink = px.map(([a, b]) => (LABEL_Y + b) * W + x0 + a), halo = new Set();
  for (const i of ink) for (const o of [-W - 1, -W, -W + 1, -1, 1, W - 1, W, W + 1]) halo.add(i + o);
  return { ink: Int32Array.from(ink), halo: Int32Array.from([...halo].filter((i) => i >= 0 && i < N)) };
});

function digitsAt(date) {
  const f = clockFields(date);
  return f.hh + f.mm;
}

export default {
  name: 'Topo',
  blurb: 'A Swiss topographic sheet: the time is four mountain massifs whose rock crests are the numerals.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, nt = ctx.night;
    ctx.lcd.backlight(1 - 0.55 * nt);
    const pal = PAL[Math.round(nt * 32)], C = pal.c, PR = pal.raw;
    const now = digitsAt(ctx.date);
    const prev = digitsAt(new Date(ctx.date.getTime() - 60000));
    const next = digitsAt(new Date(ctx.date.getTime() + 60000));
    const tAbs = ctx.date.getTime() / 1000;

    // ---- the beat: each second the mountains draw breath (quick in, slow out)
    const u = s - Math.floor(s);
    const beat = u < 0.14 ? ease.outQuad(u / 0.14) : (1 - (u - 0.14) / 0.86) ** 2;

    // ---- the uplift wave: contour phase per column, cumulative over all time so it never pops
    const [done, run] = flourish(s);
    const F = (f.minuteKey % 5) * 3 + done;                  // waves so far, mod 5 index contours
    const base = (F * FL_LIFT) % 80;
    for (let x = 0; x < W; x++) PHX[x] = base + (run >= 0 ? Math.round(FL_LIFT * liftAt(x + 0.5, run)) : 0);

    // ---- the valley floor, breathing slowly
    const wB = Math.round(256 * sin(tAbs * 0.21));
    for (let i = 0; i < N; i++) { HT[i] = B0[i] + ((B1[i] * wB) >> 8); RK[i] = 0; }
    g.cost.box += N * 2;

    // ---- the four massifs
    for (let j = 0; j < 4; j++) {
      const sl = SLOTS[j], S = sl.S;
      let dg = now[j], m = 1, grow = 1, erode = 0;
      if (s >= 58.6 && next[j] !== dg) {
        const q = progress(s, 58.5, 59.85);
        m = 1 - ease.inQuad(q); erode = progress(s, 58.5, 59.75) ** 2;
      } else if (s < 1.6 && prev[j] !== dg) {
        const q = progress(s, 0.05, 1.45);
        m = ease.outBack(q); grow = ease.outCubic(progress(s, 0.2, 1.1));
        if (q <= 0) continue;
      }
      if (m <= 0.005 && erode >= 1) continue;
      const G = S.glyphs[dg], D = G.D, Sg = G.S;
      const bx = sl.x - S.ox, by = sl.y - S.oy;
      // the wave heaves each massif as it passes
      const cx = sl.x + S.sw / 2;
      const heave = run >= 0 ? Math.max(0, 1 - Math.abs(frontX(run) - 13 - cx) / 22) : 0;
      const aEff = Math.round(S.A * m * (256 + 40 * beat + 70 * heave));      // x256
      const ph = (Math.round(tAbs * 60) + j * 64) & 255;                        // the summit wave runs along the crest
      // tick reach for this frame
      const sN = Math.floor(tAbs), cut = Math.round(256 * ease.inOutQuad(clamp(u / 0.35, 0, 1)));
      for (let t = 0; t < 96; t++) {
        const jl = (jag(t + j * 97, sN - 1) * (256 - cut) + jag(t + j * 97, sN) * cut) >> 8;
        LEN[t] = (S.rock8 * jl * grow) >> 8;
      }
      const core = grow >= 1 ? S.core8 : 4 + ((S.core8 - 4) * grow);
      const eRank = (erode * 256) | 0;
      const scr = S.rock8 + ((erode * 70) | 0), scrN = (46 * Math.sin(Math.PI * Math.min(1, erode * 1.15))) | 0;
      let n = 0;
      for (let y = 0; y < S.h; y++) {
        const gy = by + y;
        if (gy < 0 || gy >= H) continue;
        for (let x = 0; x < S.w; x++) {
          const gx = bx + x;
          if (gx < 0 || gx >= W) continue;
          const k = y * S.w + x, d = D[k];
          if (d === 255) continue;
          const i = gy * W + gx, sa = Sg[k];
          n++;
          const wv = WAVE[(sa * 7 - ph) & 255];
          HT[i] += (((aEff * S.rid[d]) >> 16) * (256 + wv)) >> 8;
          // rock: the solid crest and the hachure ticks off it, crumbling as it erodes
          if (d < core || (d < LEN[TICK[sa]] + (wv >> 3) && STRIPE[(sa + (d >> 4)) & 255])) {
            if (RANK[i] >= eRank) RK[i] = 1;
          } else if (eRank > 0) {
            // scree: what crumbles off the crest slides down the flanks as a stipple and thins out
            const fd = d - scr;
            if (fd > -12 && fd < 12 && RANK[i] < scrN) RK[i] = 1;
          }
        }
      }
      g.cost.box += n * 10 + 96 * 2 * 6;                // the pixels, and the tick-length hashes
    }

    // ---- print the sheet: lake, rock, contours on paper; under the ice, blue on white
    const buf = g.buf, lake = pal.lake;
    const nextH = new Date(ctx.date.getTime() + 60000).getHours(), prevH = new Date(ctx.date.getTime() - 60000).getHours();
    const L = iceLevel(s, nextH !== f.h, prevH !== f.h), iceFlow = (Math.round(s * 30) & 31);
    for (let y = 0, i = 0; y < H; y++) {
      const north = (80 - y) >> 1;
      for (let x = 0; x < W; x++, i++) {
        if (RK[i]) { buf[i] = C.rock; continue; }
        const ph = PHX[x];
        const hc = HT[i];
        if (L > -999 && hc - north < L) {
          // glacier: its surface contours flow, its edge is a hard blue line
          const hr = x < W - 1 ? HT[i + 1] : hc, hd = y < H - 1 ? HT[i + W] : hc;
          const er = hr - north >= L, ed = hd - north + 1 >= L;
          if (er || ed) { buf[i] = C.iceEdge; continue; }
          const k = (hc + ph + iceFlow) >> 5;
          buf[i] = k !== ((hr + ph + iceFlow) >> 5) || k !== ((hd + ph + iceFlow) >> 5) ? C.iceLine : C.ice;
          continue;
        }
        const wc = WATER[i];
        if (wc) { buf[i] = lake[wc]; continue; }
        const k = (hc + ph) >> 4;
        const kr = x < W - 1 ? (HT[i + 1] + PHX[x + 1]) >> 4 : k;
        const kd = y < H - 1 ? (HT[i + W] + ph) >> 4 : k;
        if (k !== kr || k !== kd) {
          const top = k > kr ? (k > kd ? k : kd) : (kr > kd ? kr : kd);
          buf[i] = top % 5 === 0 ? C.index : C.contour;
        } else buf[i] = C.paper;
      }
    }
    g.cost.px += N; g.cost.box += N * 9;
    const iced = (i) => L > -999 && HT[i] - ((80 - ((i / W) | 0)) >> 1) < L;

    // ---- the red overprint: trails, and the hikers on them, stepping on the beat
    for (let q = 0; q < DASH.length; q++) { const i = DASH[q]; if (!RK[i] && !iced(i)) buf[i] = C.trail; }
    g.cost.px += DASH.length; g.cost.box += DASH.length * 3;
    const walked = (Math.floor(tAbs) + ease.inOutQuad(clamp(u / 0.45, 0, 1))) * STEP;
    for (const [p, off] of HIKERS) {
      const P = PATHS[p], len = P.length * 0.5;
      const at = (walked + off) % len, pt = P[Math.floor(at * 2)];
      const hx = Math.round(pt[0] - 1), hy = Math.round(pt[1] - 1);
      if (hx < -1 || hy < -1 || hx > W || hy > H) continue;
      const hi = clamp(hy, 0, H - 1) * W + clamp(hx, 0, W - 1);
      if (iced(hi)) continue;
      if (nt > 0.5) {
        // by night they walk with headlamps
        g.fillRect(hx - 1, hy - 1, 4, 4, PR.paper);
        g.fillRect(hx, hy, 2, 2, LAMP);
      } else {
        g.fillRect(hx - 1, hy - 1, 4, 4, PR.paper);
        g.fillRect(hx, hy, 2, 2, PR.hiker);
      }
    }

    // ---- the colon: two tarns in the pass
    const LP = pal.lr;
    for (const [tx, ty] of TARNS) {
      const ti = Math.floor(ty) * W + Math.floor(tx);
      const frozen = iced(ti);
      g.fillEllipse(tx, ty, 3.6, 2.7, frozen ? PR.iceEdge : LP.shore);
      g.fillEllipse(tx, ty, 2.5, 1.6, frozen ? PR.ice : LP.fill);
    }

    // ---- the lake's name
    if (L < -40) {
      const lab = LABELS[f.wday], lc = lake[4], lf = lake[1];
      for (let q = 0; q < lab.halo.length; q++) { const i = lab.halo[q]; if (WATER[i] && WATER[i] !== 4) buf[i] = lf; }
      for (let q = 0; q < lab.ink.length; q++) { const i = lab.ink[q]; if (WATER[i]) buf[i] = lc; }
      g.cost.px += lab.ink.length + lab.halo.length;
    }

    // ---- the lake steamer, plying between the landings (not while the lake is frozen)
    const fl = FERRY_PATH.length, cyc = 40, fq = (tAbs % (2 * cyc)) / cyc;
    const fu = fq < 1 ? fq : 2 - fq, fe = ease.inOutQuad(fu);
    const fpt = FERRY_PATH[Math.min(fl - 1, Math.floor(fe * (fl - 1)))];
    const fx = Math.round(fpt[0]), fy = Math.round(fpt[1]);
    if (!iced(fy * W + fx)) {
      const dir = fq < 1 ? 1 : -1;
      g.fillRect(fx - 2, fy, 5, 2, PR.hull);
      g.fillRect(fx - (dir > 0 ? 0 : 1), fy - 2, 2, 2, PR.hull);
      g.fillRect(fx - 3 * dir - (dir > 0 ? 3 : 0), fy + 1, 3, 1, LP.line);           // the wake
    }
  },
};
