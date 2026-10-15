// Kintsugi: a mended tea bowl seen from straight above, and the time is its
// repair. The bowl broke; the breaks were filled with gold lacquer; the gold
// seams ARE the numerals. Each digit is a crack (kintsugi-font.js): straight
// runs and sharp kinks, wandering as fractures do, its width pinching and
// pooling along its length, with a dark broken edge either side. The time
// runs across the bowl as one long break: big hours high at the left, the
// minutes lower at the right, two gold-filled chips (kake) for the colon.
//
// The time is alive: the gold is molten. Bands of brighter and duller gold
// flow along every seam all the time; once a second a pulse of fresh gold
// pours through the four digits in turn (left to right, a heartbeat down the
// break), swelling each seam as it passes and leaving it glowing; a glint
// runs each line on its own pace. Every 15 s a bigger thing: at :15 and :45
// the whole repair surges (all seams swell and flare, a star of light
// catches on a kink of each digit in turn); at :30 the window's reflection
// slides right across the bowl and the gold blazes where it crosses. The
// world is calmer: the glaze's own crackle, a shoji window mirrored in the
// glaze drifting a little, leaf shadows from the garden trembling over the
// bowl by day, and by evening and night a candle's flicker on the glaze.
// The molten seams also throw a warm light on the glaze beside them, which
// swells and travels with the beat.
//
// Minute turn: a changing seam cools and sinks back into the glaze (the gold
// thins evenly to a dark scar, the scar closes, gone by :59.7); at :00 the
// bowl cracks with a tap, the new digit's crack racing out along its path in
// a third of a second, and gold is poured into it, the molten head running
// the whole crack in 1.6 s. Hour: the bowl is struck at the centre and
// shatters; the gold of the new time is poured at once, then the pieces of
// the old bowl float apart (an exploded view, the dark lacquer tray showing
// between them, their broken edges in the bare clay) while the gold seams
// hang in the air, holding the time. While apart the pieces turn, one by
// one, into the shards of the next bowl (yobitsugi: a bowl mended with
// another bowl's pieces), and they glide back and lock in round the gold;
// the new break lines glow gold and heal away. Each hour has its own bowl:
// celadon, cobalt ruri, red raku, green oribe in turn by day, black raku
// all night.
//
// Palette: what the craft allows. Each glaze is one hue in a 64-step ramp
// (flat glaze with its crackle and one sheen, never modelled as a volume),
// the lip in the thin-glaze rouge, a black urushi tray, bare clay on broken
// edges, and a 20-step gold from cooled bronze to white heat. The gold with
// its near-black broken edge is the strongest contrast on every bowl. Hard
// pixels throughout: a seam is crisp, its life is in its colour and width.
// Night: the black raku bowl, no leaf shadows, a dim sheen, the gold two
// steps hotter, the backlight at 40 %: gold on black.
//
// Cost: one integer pass over the glass (glaze level map + leaf shadow +
// sheen through the ramp, ordered dither), one pass over the ~3k pixels near
// the seams (byte-map lookups through two 256-entry per-digit tables built
// each frame), a few hard rectangles. Flash: the five bowls' level maps, the
// glyphs' seam-pixel lists, the shatter map, sheen and leaf tiles (~213 KB).
// RAM: the per-frame seam tables (~3 KB); no extra frame buffer.

import { clockFields, sin, hash, clamp, progress, ease, noise } from '../js/kit.js';
import { GLYPHS, FONT_BYTES } from './kintsugi-font.js';
import {
  W, H, N, bowlForHour, SHEEN, SH_W, SH_H, KOMOREBI, SHARD, NS, EDGE_I, EDGE_R, EDGE_RANK, IS_EDGE,
  SHARD_DX, SHARD_DY, SHARD_DIST, SHARD_ORDER, B4, B16, GOLD, CRACK, TABLE, BOWL_BYTES,
} from './kintsugi-bowl.js';

const TAU = Math.PI * 2;
const to565 = (c) => (((c >> 16) & 0xf8) << 8) | (((c >> 8) & 0xfc) << 3) | ((c & 255) >> 3);
const TABLE565 = to565(TABLE);

// ------------------------------------------------------------ layout
// map origins (each glyph map has a 4 px pad); hours a size larger, set high
const SLOTS = [
  { size: 0, x: 6, y: 0 }, { size: 0, x: 38, y: 5 },
  { size: 1, x: 89, y: 30 }, { size: 1, x: 118, y: 34 },
];
const DELAY = [0, 0.09, 0.2, 0.29];       // the beat runs down the break
const COLON = [[77, 32], [80, 45]];
const CHIP = ['..kkk.', '.kgggk', 'kgGggk', 'kgggk.', '.kkk..'];

// ------------------------------------------------------------ per-frame seam tables
const SW = [0, 1, 2, 3].map(() => new Int16Array(256));
const BR = [0, 1, 2, 3].map(() => new Int8Array(256));
const GL = [0, 1, 2, 3].map(() => new Uint8Array(256));      // warm light the molten gold throws on the glaze, 0..16
const W1 = (TAU * 38) / 60, W2 = (TAU * 20) / 60;   // whole cycles a minute: no seam at :00

function tables(si, gl, s, surge, fadeDim) {
  const sw = SW[si], br = BR[si], glw = GL[si], n = gl.maxA + 1;
  let q = s - Math.floor(s) - DELAY[si];
  if (q < 0) q += 1;
  const front = q * 150 - 4;
  let gq = s / 4 + si * 0.27; gq -= Math.floor(gq);
  const gp = gq * (n + 40) - 20;
  for (let a = 0; a < n; a++) {
    const flow = 1.6 * sin(a * 0.55 - s * W1) + 0.9 * sin(a * 0.21 + s * W2 + si * 1.7);
    const dd = a - front, ad = dd < 0 ? -dd : dd;
    const bump = ad < 9 ? 1 - ad / 9 : 0;
    const trail = dd < 0 && dd > -48 ? 1 + dd / 48 : 0;
    const gd = a - gp, glint = gd > -1.6 && gd < 1.6 ? 6 : 0;
    br[a] = Math.round(10 + g_night + flow + 6 * bump + 2.5 * trail + 4 * surge + glint - fadeDim);
    sw[a] = Math.round(22 * bump + 8 * trail + 9 * surge);
    const gg = 16 * bump + 11 * trail + 8 * surge - 3 * fadeDim;
    glw[a] = gg <= 0 ? 0 : gg >= 16 ? 16 : gg | 0;
  }
  g_tableWork += n;
}
let g_tableWork = 0, g_night = 0;

// ------------------------------------------------------------ passes

/** The glaze: level map, leaf shadow and sheen, through the bowl's ramp. */
function glaze(buf, bowl, kAmt, kox, kfx, koy, shx, shy, shAmp, lamp) {
  const L = bowl.L, pal = bowl.pal, sp = bowl.special;
  for (let y = 0; y < H; y++) {
    const kr = ((y + koy) & 31) * 64, b4 = (y & 3) * 4, sr = y - shy;
    const shRow = sr >= 0 && sr < SH_H && shAmp > 0 ? sr * SH_W : -1;
    for (let x = 0, i = y * W; x < W; x++, i++) {
      let v = L[i];
      if (v >= 253) { buf[i] = sp[v - 253]; continue; }
      v += lamp;
      if (kAmt) {
        const kx = (x + kox) & 63;
        v -= ((KOMOREBI[kr + kx] * (16 - kfx) + KOMOREBI[kr + ((kx + 1) & 63)] * kfx) * kAmt) >> 8;
      }
      if (shRow >= 0) { const c = x - shx; if (c >= 0 && c < SH_W) v += (SHEEN[shRow + c] * shAmp) >> 4; }
      v = (v + B4[b4 + (x & 3)]) >> 2;
      buf[i] = pal[v < 0 ? 0 : v > 63 ? 63 : v];
    }
  }
}

/** The hour's exploded view: every piece of the bowl moved by its own offset, old or new glaze. */
const OXI = new Int8Array(NS), OYI = new Int8Array(NS), SWAP = new Uint8Array(NS);
function flight(buf, bOld, bNew) {
  buf.fill(TABLE565);
  for (let y = 0; y < H; y++) {
    const b4 = (y & 3) * 4;
    for (let x = 0, i = y * W; x < W; x++, i++) {
      const s = SHARD[i];
      if (s === 255) continue;
      const X = x + OXI[s], Y = y + OYI[s];
      if (X < 0 || X >= W || Y < 0 || Y >= H) continue;
      const bowl = SWAP[s] > B16[b4 + (x & 3)] ? bNew : bOld;
      let c;
      if (IS_EDGE[i] && (OXI[s] | OYI[s])) c = bowl.clay;
      else {
        const v = bowl.L[i];
        c = v >= 253 ? bowl.special[v - 253] : bowl.pal[(v + B4[b4 + (x & 3)]) >> 2];
      }
      buf[Y * W + X] = c;
    }
  }
}

/** One gold seam. cf/pf: how far the crack and the pour have run (0..255 along each stroke). */
function seam(buf, gl, ox, oy, si, key, cf, pf, fm, kl, shx, shy, shAmp) {
  const PD = gl.pd, PA = gl.pa, PU = gl.pu, HW = gl.HW, lx = gl.lx, ly = gl.ly;
  const sw = SW[si], br = BR[si], glw = GL[si], n = gl.n;
  let work = 0;
  for (let k = 0; k < n; k++) {
    const u = PU[k];
    if (u > cf) continue;
    const x = ox + lx[k], y = oy + ly[k];
    if (x < 0 || x >= W || y < 0 || y >= H) continue;
    work++;
    const d = PD[k], o = y * W + x;
    if (u > pf) {                                 // cracked, not yet gilded
      if (d < 13) buf[o] = cf < 255 && cf - u < 12 ? GOLD[18] : CRACK;
      continue;
    }
    const a = PA[k];
    let gw = HW[a] + sw[a], lv = br[a];
    if (pf < 255) { const hd = pf - u; if (hd < 28) { gw += (28 - hd) >> 2; lv += (28 - hd) >> 2; } }
    if (fm < 256) gw = (gw * fm) >> 8;
    const t = d - gw;
    if (t < 0) {
      lv += t < -18 ? 2 : t > -7 ? -3 : 0;
      if (shAmp) { const sx = x - shx, sy = y - shy; if (sx >= 0 && sx < SH_W && sy >= 0 && sy < SH_H) lv += (SHEEN[sy * SH_W + sx] * shAmp) >> 8; }
      buf[o] = GOLD[lv < 0 ? 0 : lv > 19 ? 19 : lv];
    } else if (t < kl) buf[o] = key;
    else {
      // beyond the broken edge: the glaze lit warm by the molten seam, falling off over ~2.5 px
      const e = t - kl, gv = glw[a];
      if (gv && e < 56 && fm === 256) {
        const k = (gv * (56 - e)) / 22 | 0;          // 0..40
        const c = buf[o];
        let r = (c >> 11) + ((k * 5) >> 4), gg = ((c >> 5) & 63) + ((k * 7) >> 4), b = c & 31;
        if (r > 31) r = 31; if (gg > 63) gg = 63;
        buf[o] = (r << 11) | (gg << 5) | b;
      }
    }
  }
  return work;
}

// ------------------------------------------------------------ the face

const IN_END = 2.2, HOUR_END = 8;

export default {
  name: 'Kintsugi',
  blurb: 'A broken tea bowl mended with gold: the gold seams are the numerals, molten and pulsing; each minute the bowl cracks anew and gold is poured in, each hour it shatters and is rebuilt as another bowl.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, buf = g.buf;
    ctx.lcd.backlight(1 - 0.6 * ctx.night);
    const prev = clockFields(new Date(ctx.date.getTime() - 60000));
    const next = clockFields(new Date(ctx.date.getTime() + 60000));
    const cur = f.hh + f.mm, old = prev.hh + prev.mm, nxt = next.hh + next.mm;
    const hourShow = prev.h !== f.h && s < HOUR_END;
    const bNow = bowlForHour(f.h), bOld = hourShow ? bowlForHour(prev.h) : bNow;
    g_tableWork = 0; g_night = 2.5 * ctx.night;

    // ---- the light: leaf shadows by day, the shoji sheen, the :30 sweep
    const T = f.h * 3600 + f.m * 60 + s;
    const kAmt = f.h >= 8 && f.h <= 16 ? 16 : f.h === 7 || f.h === 17 ? 9 : 0;
    const kxf = T * 2.2 + 2.5 * sin(T * 0.6) + 2.2 * sin(T * 2.4), kox = Math.floor(kxf), kfx = ((kxf - kox) * 16) | 0;
    const koy = Math.floor(T * 0.7 + 1.2 * sin(T * 0.45) + 1.6 * sin(T * 1.9 + 1));
    // by evening and night the tea is taken by candlelight (yobanashi): it flickers from the left
    const lamp = kAmt ? 0 : Math.round(6 * (noise(T * 2.3, 7) + 0.5 * noise(T * 7.1, 9)) * (f.h >= 18 || f.h < 7 ? 1 : 0.5));
    let shx = Math.round(106 + 5 * sin(T * 0.13)), shy = Math.round(3 + 2 * sin(T * 0.09));
    let shAmp = ctx.night > 0.5 || bNow.name === 'black raku' ? 9 : 16;
    if (s >= 30 && s < 34.5) {
      if (s < 33) {
        const u = ease.inOutQuad(progress(s, 30, 33));
        shx = Math.round(106 + (-46 - 106) * u); shy = Math.round(3 + 30 * Math.sin(u * Math.PI) * 0.9);
      } else shAmp = Math.round(shAmp * progress(s, 33, 34.5));
    }

    // ---- the bowl: whole, or the hour's exploded view
    const flying = hourShow && s >= 1.1 && s < 4.6;
    if (flying) {
      for (let k = 0; k < NS; k++) {
        const o = SHARD_ORDER[k] * 0.3;
        const pOut = ease.outCubic(progress(s, 1.1 + o, 2.1 + o)), pIn = ease.inOutCubic(progress(s, 3.0 + o, 4.2 + o));
        const lift = pOut - pIn, bob = lift * 0.9 * sin((s - 2) * 3.4 + k * 1.9);
        const dist = SHARD_DIST[k] * lift;
        OXI[k] = Math.round(SHARD_DX[k] * dist + bob); OYI[k] = Math.round(SHARD_DY[k] * dist * 0.8 - bob * 0.6);
        SWAP[k] = Math.round(16 * progress(s, 2.25 + SHARD_ORDER[k] * 0.6, 2.55 + SHARD_ORDER[k] * 0.6));
      }
      flight(buf, bOld, bNow);
      g.cost.px += N; g.cost.box += N * 6;
    } else {
      const bowl = hourShow && s < 1.1 ? bOld : bNow;
      glaze(buf, bowl, kAmt, kox, kfx, koy, shx, shy, shAmp, lamp);
      g.cost.px += N; g.cost.box += N * (kAmt ? 5 : 3);
      // the hour's break lines: racing out from the blow, then glowing gold and healing away
      if (hourShow) {
        if (s < 1.1) {
          const rf = ease.outQuad(progress(s, 0, 0.4)) * 92;
          for (let k = 0; k < EDGE_I.length; k++) if (EDGE_R[k] < rf) buf[EDGE_I[k]] = CRACK;
        } else {
          const heal = progress(s, 4.9, 7.6), lvl = Math.round(15 - 6 * progress(s, 4.6, 6.5));
          const th = heal * 256;
          for (let k = 0; k < EDGE_I.length; k++) if (EDGE_RANK[k] >= th) buf[EDGE_I[k]] = GOLD[lvl];
        }
        g.cost.box += EDGE_I.length * 2;
      }
    }

    // ---- the flourishes' envelopes
    const surgeAt = (t0) => (s >= t0 && s < t0 + 2 ? Math.sin(progress(s, t0, t0 + 2) * Math.PI) : 0);
    let surge = surgeAt(15) + surgeAt(45);
    if (hourShow) surge += 0.8 * Math.sin(progress(s, 2.2, 3.4) * Math.PI) + Math.sin(progress(s, 4.5, 5.6) * Math.PI);

    // ---- the seams
    let seamWork = 0;
    const flare = shAmp && s >= 30 && s < 33 ? 24 : 6;
    for (let si = 0; si < 4; si++) {
      const sl = SLOTS[si], d = +cur[si], gl = GLYPHS[sl.size][d];
      let cf = 255, pf = 255, fm = 256, kl = 17, dim = 0;
      if (s >= 58.6 && nxt[si] !== cur[si]) {                 // cooling, sinking into the glaze
        const u = ease.inOutQuad(progress(s, 58.6, 59.7));
        fm = Math.round(256 * clamp(1 - u / 0.6, 0, 1));
        kl = u < 0.6 ? 17 : Math.round(17 * (1 - (u - 0.6) / 0.4));
        dim = 5 * u;
        if (u >= 1) continue;
      } else if (old[si] !== cur[si] && s < IN_END) {            // cracked, then poured
        const c0 = hourShow ? 0.02 : 0.02 + DELAY[si] * 0.3;
        cf = Math.round(255 * ease.outQuad(progress(s, c0, c0 + (hourShow ? 0.22 : 0.32))));
        pf = hourShow ? Math.round(255 * ease.outQuad(progress(s, 0.24, 0.8)))
          : Math.round(255 * ease.inOutQuad(progress(s, 0.4 + DELAY[si] * 0.3, 2.0 + DELAY[si] * 0.3)));
        if (cf <= 0) continue;
      }
      tables(si, gl, s, surge, dim);
      seamWork += seam(buf, gl, sl.x, sl.y, si, bNow.key, cf, pf, fm, kl, shx, shy, shAmp * flare);
    }
    g.cost.box += seamWork * 8 + g_tableWork * 30;

    // ---- the colon: two chips filled with gold, flashing on the beat
    let q = s - Math.floor(s) - 0.15; if (q < 0) q += 1;
    const cl = Math.round(10 + 6 * Math.max(0, 1 - q * 3) + 4 * surge);
    for (const [cx, cy] of COLON)
      for (let j = 0; j < 5; j++)
        for (let i = 0; i < 6; i++) {
          const ch = CHIP[j][i];
          if (ch === '.') continue;
          buf[(cy + j) * W + cx + i] = ch === 'k' ? bNow.key : GOLD[clamp(cl + (ch === 'G' ? 2 : 0), 0, 19)];
        }
    g.cost.px += 40;

    // ---- stars of light catching on a kink: the surges and the rebuilt bowl
    const star = (t0, si) => {
      const p = progress(s, t0, t0 + 0.6);
      if (p <= 0 || p >= 1) return;
      const sl = SLOTS[si], gl = GLYPHS[sl.size][+cur[si]];
      const kk = gl.kinks[hash(f.minuteKey, si, 71) % gl.kinks.length];
      const x = Math.floor(sl.x + kk[0]), y = Math.floor(sl.y + kk[1]), arm = Math.round(3 * Math.sin(p * Math.PI));
      if (arm < 1) return;
      g.fillRect(x - arm, y, 2 * arm + 1, 1, GOLD[16]);
      g.fillRect(x, y - arm, 1, 2 * arm + 1, GOLD[16]);
      g.fillRect(x, y, 1, 1, GOLD[19]);
    };
    for (let si = 0; si < 4; si++) {
      star(15.3 + si * 0.3, si); star(45.3 + si * 0.3, si);
      if (hourShow) star(4.5 + si * 0.15, si);
    }

    // ---- the tap of the crack: the bowl jolts
    const turned = old !== cur;
    if (turned && s < 0.12) g.shift(s < 0.06 ? (hourShow ? 2 : 1) : -1, 0, TABLE);
  },
};

export const KINTSUGI_FLASH = FONT_BYTES + BOWL_BYTES;
