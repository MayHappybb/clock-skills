// Lux Nova: the glass is a church window seen from inside, two lancets and
// a rose in an ashlar wall, and the time is glazed into it. The hours are
// the figures of the two lancets, the minutes sit in the rose's hub: every
// numeral is a run of ruby pieces held in its own black came, cut where a
// glazier cuts (at the corners, and across a curve every 60-90 degrees, so a
// 0 is six curved pieces), on a field of pale painted quarries with a moat
// of plain glass round the lead.
//
// Always alive, by the light only: the sun's gleam crosses the window once a
// minute (left to right, a slanted band), and every piece it reaches glows
// brighter as one flat piece of glass, the lead round it blooming a little;
// a wave of light rolls round the rose's petals once a minute; a cloud
// shadow drifts the other way; now and then a seed in the old glass glints. By night the window is dark
// from outside (the clear quarries show the night sky) and lit from inside:
// the pot-metal glass catches the candlelight, and a carried candle passes
// along below the window once a minute instead of the sun.
//
// Minute: the glazier. From :58.3 he taps the old numeral's pieces loose one
// by one (each flares and sparks, still whole in its lead); at :59.0 the
// whole numeral is knocked out at once, the pieces fall as flat shards, the
// holes show raw daylight for a moment and close with plain quarries; the
// slot is plain by :59.5. After :00 the new numeral's came is set first,
// whole (its shape blazing as open holes with the glare spilling round
// them), then its pieces go in one by one in no order and flare as they are
// set, and the solder joints spark as they are closed. Never a wrong digit.
// Hour: the rose is re-glazed: petal after petal round the clock is knocked
// out and reset in the new hour's colours (six schemes: cobalt and gold,
// emerald and amber, violet and gold ...), a colour front climbs the lancet
// borders, and then the sun comes out across the whole window.
//
// Palette: pot-metal glass (ruby, cobalt, emerald, violet, gold, amber and
// greenish clear), black lead, warm limestone. Every pixel is a piece's
// colour times the light behind it (the sky by time of day: rose dawn, white
// noon, amber sunset, violet dusk, and the night) times that piece's flat
// brightness, with three streak tones per piece and a brown grisaille paint
// tone. The time is the one hue family (reds) and the only saturated thing
// on the pale field. Hard pixels everywhere: it is glass and lead.
//
// Cost: one table lookup per pixel for the window, the four numeral boxes
// composited from their own maps (~5k pixels), ~400 piece colours and a
// 224-entry lead-bloom ramp a frame
// (integer), shards and glints a few hundred pixels. Flash: window code map
// 25.6 KB, numeral maps 10 x (30 x 56 + 23 x 40) x 4 B = 104 KB, moat maps
// 10 KB: ~140 KB. Nothing is redrawn outside the canvas.

import { clockFields, hash, rand, sin } from '../js/kit.js';
import {
  W, H, CODE, NBASE, pKind, pCx, pCy, pT, pOrd, pPix, reserve, moatCodes, LAN_X, ROSE,
  K_LEAD, K_QLEAD, K_SKY, K_STONE, K_FRAME, K_QUARRY, K_BMAIN, K_BPEARL, K_RA, K_RB, K_PIN, K_POUT, K_DIGIT, MAXP,
} from './stainedglass-window.js';
import { rasterDigit, GLASS, LEAD, MOAT } from './stainedglass-glyphs.js';

// ------------------------------------------------------------ numerals and slots
const HOUR = { sx: 0.92, sy: 1.0, sw: 6.6, lw: 1.4, mw: 2.0 };
const MIN = { sx: 0.65, sy: 0.68, sw: 5.0, lw: 1.2, mw: 1.5 };
const GLYPH = [HOUR, MIN].map((S) => Array.from({ length: 10 }, (_, d) => rasterDigit(d, S.sx, S.sy, S.sw, S.lw, S.mw)));
const SLOTS = [];
for (let k = 0; k < 4; k++) {
  const hr = k < 2, S = hr ? HOUR : MIN, set = GLYPH[hr ? 0 : 1];
  const ox = hr ? Math.round(LAN_X[k] + 17.5 - 13 * S.sx - 3) : Math.round(k === 2 ? ROSE.cx - 1.2 - 26 * S.sx - 3 : ROSE.cx + 1.2 - 3);
  const oy = hr ? 21 : 20;
  const { bw, bh } = set[0];
  SLOTS.push({ ox, oy, bw, bh, set, base: reserve(10), moat: moatCodes(ox, oy, bw, bh) });
}

// ------------------------------------------------------------ colour
const COB = [34, 62, 168], AZ = [54, 112, 196], EM = [24, 128, 74], VI = [100, 52, 150], GOLD = [232, 178, 40], AMB = [226, 128, 30], WH = [210, 216, 196];
// per kind: border, pearl, roundel A, roundel B, petal inner, petal outer
const SCHEMES = [
  [COB, GOLD, COB, GOLD, GOLD, COB],
  [EM, AMB, EM, GOLD, AMB, EM],
  [VI, GOLD, VI, GOLD, GOLD, VI],
  [COB, WH, EM, COB, EM, COB],
  [AZ, AMB, AZ, AMB, AMB, AZ],
  [EM, GOLD, COB, GOLD, COB, EM],
];
const STONE = [118, 104, 90], FRAME = [146, 132, 112], SKYC = [236, 242, 255];
// the light behind the glass through the day: [hour, r, g, b] (0..1)
const SKY = [
  [0, 0.1, 0.13, 0.3], [4.6, 0.1, 0.13, 0.3], [5.6, 0.42, 0.3, 0.46], [6.6, 0.96, 0.62, 0.56], [8, 1, 0.9, 0.76],
  [12, 1, 1, 0.95], [16, 1, 0.95, 0.82], [18, 1, 0.7, 0.42], [19.2, 0.62, 0.38, 0.52], [20.3, 0.14, 0.14, 0.32], [21, 0.1, 0.13, 0.3], [24, 0.1, 0.13, 0.3],
];
function skyAt(h) {
  let k = 1;
  while (SKY[k][0] < h) k++;
  const a = SKY[k - 1], b = SKY[k], u = (h - a[0]) / (b[0] - a[0]);
  return [a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u, a[3] + (b[3] - a[3]) * u];
}
const WARM = [255, 150, 72];
const SCATTER = new Uint16Array(13);   // how much candlelight a kind of glass catches, /256
SCATTER[K_QUARRY] = 40; SCATTER[K_BMAIN] = 130; SCATTER[K_BPEARL] = 170; SCATTER[K_RA] = 140; SCATTER[K_RB] = 140;
SCATTER[K_PIN] = 150; SCATTER[K_POUT] = 120; SCATTER[K_DIGIT] = 430; SCATTER[K_STONE] = 210; SCATTER[K_FRAME] = 230;

const PAL = new Uint16Array(MAXP * 4);
const BR = new Int32Array(MAXP);         // flat brightness per piece, 256 = 1
const HOLE = new Uint8Array(MAXP);       // the piece is out: raw daylight
const NEWS = new Uint8Array(MAXP);       // uses the new hour's scheme
const DIGC = new Int16Array(MAXP * 3);   // numeral piece colours, per frame
const pack = (r, g, b) => ((r > 255 ? 255 : r) >> 3 << 11) | ((g > 255 ? 255 : g) >> 2 << 5) | ((b > 255 ? 255 : b) >> 3);
function tones(o, r, g, b, P = PAL) {
  P[o] = pack(r, g, b);
  P[o + 1] = pack((r * 212) >> 8, (g * 212) >> 8, (b * 212) >> 8);
  P[o + 2] = pack((r * 282) >> 8, (g * 282) >> 8, (b * 282) >> 8);
  P[o + 3] = pack((r * 104) >> 8, (g * 96) >> 8, (b * 84) >> 8);    // grisaille: a warm brown paint
}
const TMP = new Uint16Array(4);
const BLOOM_OFF = 24, BLOOM_N = 160 + 2 * BLOOM_OFF + 20, BLOOM = new Uint16Array(BLOOM_N);
function blend(i, buf, c, a) {   // a 0..256
  const d = buf[i];
  const r = (d >> 11) + ((((c >> 11) - (d >> 11)) * a) >> 8);
  const g = ((d >> 5) & 63) + (((((c >> 5) & 63) - ((d >> 5) & 63)) * a) >> 8);
  const b = (d & 31) + ((((c & 31) - (d & 31)) * a) >> 8);
  buf[i] = (r << 11) | (g << 5) | b;
}

// ------------------------------------------------------------ jobs
const NOSTATE = new Uint8Array(10).fill(2);
const order = (n, seed) => Array.from({ length: n }, (_, i) => i).sort((a, b) => hash(seed, a) - hash(seed, b));
const TAP0 = 58.3, TAP = 0.55, KNOCK0 = 59.0, KNOCK = 0.2, HOLE_T = 0.25, FALL = 0.7, GRAV = 190;
const LAY0 = 0.02, LAY = 0.1, SET0 = 0.42, SET = 0.95, FLASH = 0.45;

export default {
  name: 'Lux Nova',
  blurb: 'A church window: the hours are leaded ruby figures in two lancets, the minutes sit in the rose; a glazier knocks out and resets the pieces each minute while the sun crosses the glass.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, mk = f.minuteKey, buf = g.buf;
    ctx.lcd.backlight(1 - 0.62 * ctx.night);
    const prv = clockFields(new Date(ctx.date.getTime() - 60000)), nxt = clockFields(new Date(ctx.date.getTime() + 60000));
    const cur = f.hh + f.mm, pstr = prv.hh + prv.mm, nstr = nxt.hh + nxt.mm;
    const hourT = f.h + f.m / 60 + s / 3600, T = f.h * 3600 + f.m * 60 + s;
    const sky = skyAt(hourT), lum = 0.3 * sky[0] + 0.59 * sky[1] + 0.11 * sky[2];
    const day = lum < 0.2 ? 0 : lum > 0.6 ? 1 : (lum - 0.2) / 0.4;
    const cand = lum > 0.5 ? 0 : lum < 0.16 ? 1 : (0.5 - lum) / 0.34;
    const Lr = (sky[0] * 256) | 0, Lg = (sky[1] * 256) | 0, Lb = (sky[2] * 256) | 0;
    const flick = 236 + ((20 * sin(T * 11.3) * sin(T * 4.7 + 1)) | 0);
    const Cr = (WARM[0] * cand * flick) >> 8, Cg = (WARM[1] * cand * flick) >> 8, Cb = (WARM[2] * cand * flick) >> 8;

    // ---- the hour: which scheme, and the re-glazing
    const hourShow = prv.h !== f.h && s < 7.5;
    const schNew = SCHEMES[f.h % 6], schOld = SCHEMES[(f.h + 5) % 6];
    // ---- the light: the gleam (sun by day, a carried candle by night), a cloud, the hour's burst
    const xb = -45 + 250 * (s / 60);
    const xc = 200 - ((T * 2.3) % 420);
    const wave = (s / 60) * 12 - 0.5;
    const burst = hourShow && s > 4.6 ? -40 + 240 * ((s - 4.6) / 2.2) : -999;

    // ---- per piece: brightness, holes, scheme
    for (let i = 0; i < NBASE; i++) {
      const k = pKind[i], cx = pCx[i], cy = pCy[i];
      let u = (cx + 0.5 * (cy - 40) - xb) / 19;
      let beam = u > -1 && u < 1 ? (1 - u * u) * (1 - u * u) : 0;
      if (burst > -999) { const v = (cx + 0.5 * (cy - 40) - burst) / 30; if (v > -1 && v < 1) beam += 1.3 * (1 - v * v); }
      const cv = (cx - xc) / 50, cloud = cv > -1 && cv < 1 ? (1 - cv * cv) * day : 0;
      BR[i] = 236 + ((beam * 120) | 0) - ((cloud * 44) | 0);
      HOLE[i] = 0; NEWS[i] = 1;
      if (k === K_PIN || k === K_POUT) {
        // a wave of light rolls round the rose's petals once a minute
        let dp = (pOrd[i] | 0) - wave;
        if (dp < -6) dp += 12; else if (dp > 6) dp -= 12;
        if (dp > -2 && dp < 1) { const e = dp < 0 ? 1 + dp / 2 : 1 - dp; BR[i] += (e * e * 120) | 0; }
      }
      if (hourShow && k >= K_BMAIN && k <= K_POUT) {
        if (k >= K_PIN) {
          const tp = 1.2 + 0.28 * pOrd[i];
          if (s < tp) NEWS[i] = 0;
          else if (s < tp + 0.22) HOLE[i] = 1;
          else { const fl = 1 - (s - tp - 0.22) / 0.5; if (fl > 0) BR[i] += (fl * 150) | 0; }
        } else {
          const tf = 0.8 + 3.4 * pOrd[i];
          if (s < tf) NEWS[i] = 0;
          else { const fl = 1 - (s - tf) / 0.5; if (fl > 0) BR[i] += (fl * 130) | 0; }
        }
      }
    }
    g.cost.box += NBASE * 14;

    // ---- the numerals: which digit each slot shows, and each piece's state
    const STATE = [NOSTATE, NOSTATE, NOSTATE, NOSTATE];
    const shards = [], sparks = [];
    for (let k = 0; k < 4; k++) {
      const S = SLOTS[k], G = S.set[+cur[k]], np = G.np;
      for (let j = 0; j < np; j++) {
        const id = S.base + j, P = G.pieces[j];
        pCx[id] = S.ox + P.cx; pCy[id] = S.oy + P.cy;
        DIGC[id * 3] = G.colour[j][0]; DIGC[id * 3 + 1] = G.colour[j][1]; DIGC[id * 3 + 2] = G.colour[j][2];
        const u = (pCx[id] + 0.5 * (pCy[id] - 40) - xb) / 19;
        let beam = u > -1 && u < 1 ? (1 - u * u) * (1 - u * u) : 0;
        if (burst > -999) { const v = (pCx[id] + 0.5 * (pCy[id] - 40) - burst) / 30; if (v > -1 && v < 1) beam += 1.3 * (1 - v * v); }
        const cv = (pCx[id] - xc) / 50, cloud = cv > -1 && cv < 1 ? (1 - cv * cv) * day : 0;
        BR[id] = 236 + ((beam * 120) | 0) - ((cloud * 44) | 0);
        HOLE[id] = 0;
      }
      if (s >= TAP0 && nstr[k] !== cur[k]) {
        // the glazier taps each piece loose (it flares, still in its lead), then the whole numeral is knocked out at once
        const st = new Uint8Array(10), ord = order(np, mk * 8 + k);
        for (let r = 0; r < np; r++) {
          const j = ord[r], tt = TAP0 + (TAP * r) / Math.max(1, np - 1), tk = KNOCK0 + (KNOCK * r) / Math.max(1, np - 1);
          const ta = (s - tt) / 0.16;
          if (ta > 0 && ta < 1) { BR[S.base + j] += ((1 - ta) * 110) | 0; sparks.push((S.ox + G.pieces[j].cx) | 0, (S.oy + G.pieces[j].cy) | 0, ta); }
          if (s < tk) st[j] = 2;
          else { st[j] = s < tk + HOLE_T ? 1 : 0; if (s < tk + FALL) shards.push(k, j, s - tk); }
        }
        STATE[k] = st; g.cost.box += np * 40;
      } else if (s < SET0 + SET + 1.2 && pstr[k] !== cur[k]) {
        const st = new Uint8Array(10), oa = order(np, mk * 8 + k + 3), ob = order(np, mk * 8 + k + 5);
        for (let r = 0; r < np; r++) {
          const ja = oa[r], th = LAY0 + (LAY * r) / Math.max(1, np - 1);
          if (s >= th) st[ja] = 1;
          const jb = ob[r], ts = SET0 + (SET * r) / Math.max(1, np - 1);
          if (s >= ts) { st[jb] = 2; const fl = 1 - (s - ts) / FLASH; if (fl > 0) BR[S.base + jb] += (fl * 170) | 0; }
        }
        const J = G.joints, oj = order(J.length, mk * 8 + k + 7);
        for (let r = 0; r < J.length; r++) {
          const tj = 1.15 + (0.85 * r) / J.length, a = (s - tj) / 0.3;
          if (a > 0 && a < 1) sparks.push(S.ox + J[oj[r]][0], S.oy + J[oj[r]][1], a);
        }
        STATE[k] = st; g.cost.box += (np * 2 + J.length) * 40;
      }
    }

    // ---- colours: every piece = its glass x the light x its brightness (+ candle it catches)
    const lead = pack(20 + (Lr >> 5), 18 + (Lg >> 5), 24 + (Lb >> 5));
    const N = SLOTS[3].base + 10;
    for (let i = 0; i < N; i++) {
      const k = pKind[i], o = i * 4;
      if (k === K_LEAD) { PAL[o] = PAL[o + 1] = PAL[o + 2] = PAL[o + 3] = lead; continue; }
      let tr, tg, tb;
      if (k === K_DIGIT) { tr = DIGC[i * 3]; tg = DIGC[i * 3 + 1]; tb = DIGC[i * 3 + 2]; }
      else if (k >= K_BMAIN && k <= K_POUT) { const c = (NEWS[i] ? schNew : schOld)[k - K_BMAIN]; tr = c[0]; tg = c[1]; tb = c[2]; }
      else if (k === K_QLEAD) { tr = 62; tg = 66; tb = 58; }
      else if (k === K_SKY) { tr = SKYC[0]; tg = SKYC[1]; tb = SKYC[2]; }
      else if (k === K_STONE) { tr = STONE[0]; tg = STONE[1]; tb = STONE[2]; }
      else if (k === K_FRAME) { tr = FRAME[0]; tg = FRAME[1]; tb = FRAME[2]; }
      else { tr = pT[i * 3]; tg = pT[i * 3 + 1]; tb = pT[i * 3 + 2]; }
      if (HOLE[i]) { tr = SKYC[0]; tg = SKYC[1]; tb = SKYC[2]; }
      let b = BR[i];
      if (k === K_STONE || k === K_FRAME) b = 150 + ((b - 236) >> 2);         // the wall is lit by what comes through
      if (k === K_SKY || HOLE[i]) b = 300;
      // candlelight from below, stronger low down and near the carried candle
      const sc = SCATTER[k], cy = pCy[i];
      let cl = 0;
      if (cand > 0 && sc) {
        const u = (pCx[i] - xb) / 34;
        const near = u > -1 && u < 1 ? (1 - u * u) : 0;
        cl = (sc * (90 + ((cy * 1.4) | 0) + ((near * 120) | 0))) >> 8;
      }
      const r = (tr * ((Lr * b) >> 8) >> 8) + ((tr * Cr * cl) >> 16);
      const gg = (tg * ((Lg * b) >> 8) >> 8) + ((tg * Cg * cl) >> 16);
      const bb = (tb * ((Lb * b) >> 8) >> 8) + ((tb * Cb * cl) >> 16);
      if (k === K_STONE) {
        PAL[o] = pack(r, gg, bb); PAL[o + 1] = pack((r * 232) >> 8, (gg * 232) >> 8, (bb * 232) >> 8);
        PAL[o + 2] = pack((r * 274) >> 8, (gg * 274) >> 8, (bb * 274) >> 8); PAL[o + 3] = pack((r * 150) >> 8, (gg * 150) >> 8, (bb * 150) >> 8);
      } else if (k === K_FRAME) {
        PAL[o] = pack(r, gg, bb); PAL[o + 1] = PAL[o + 2] = PAL[o + 3] = pack((r * 205) >> 8, (gg * 205) >> 8, (bb * 205) >> 8);
      } else if (HOLE[i] || k === K_SKY || k === K_QLEAD) { PAL[o] = PAL[o + 1] = PAL[o + 2] = PAL[o + 3] = pack(r, gg, bb); }
      else tones(o, r, gg, bb);
    }
    g.cost.box += N * 30;

    // ---- the window: one lookup a pixel
    // the lead blooms where the gleam is brightest: a halation of the light round the glass
    const lr = 20 + (Lr >> 5), lgc = 18 + (Lg >> 5), lbc = 24 + (Lb >> 5);
    for (let u = 0; u < BLOOM_N; u++) {
      const v = (u - BLOOM_OFF - xb) / 15, bl = v > -1 && v < 1 ? (1 - v * v) * (1 - v * v) * day * 0.42 : 0;
      BLOOM[u] = pack(lr + (((((Lr * 250) >> 8) - lr) * bl) | 0), lgc + (((((Lg * 236) >> 8) - lgc) * bl) | 0), lbc + (((((Lb * 200) >> 8) - lbc) * bl) | 0));
    }
    g.cost.box += BLOOM_N * 12;
    for (let i = 0, y = 0; y < H; y++) {
      const uo = (y >> 1) - 20 + BLOOM_OFF;
      for (let x = 0; x < W; x++, i++) { const c = CODE[i]; buf[i] = c < 4 ? BLOOM[x + uo] : PAL[c]; }
    }
    g.cost.px += W * H; g.cost.box += W * H * 3;

    // ---- the numerals: moats first (they may overlap the next slot), then glass and lead
    const skyHole = PAL[2 * 4];
    // raw daylight through an open came spills into the plain glass round it
    const glare = pack((Lr * 228) >> 8, (Lg * 226) >> 8, (Lb * 206) >> 8);
    for (let pass = 0; pass < 2; pass++)
      for (let k = 0; k < 4; k++) {
        const S = SLOTS[k], G = S.set[+cur[k]], st = STATE[k], base = S.base * 4;
        const kind = G.kind, p1 = G.p1, p2 = G.p2, tone = G.tone, bw = S.bw, bh = S.bh, moat = S.moat;
        for (let y = 0; y < bh; y++) {
          const sy = S.oy + y;
          if (sy < 0 || sy >= H) continue;
          for (let x = 0; x < bw; x++) {
            const sx = S.ox + x;
            if (sx < 0 || sx >= W) continue;
            const q = y * bw + x, kd = kind[q];
            if (!kd) continue;
            const si = sy * W + sx;
            if (pass === 0) { if (kd === MOAT) { const v = st[p1[q]]; if (v === 2) buf[si] = PAL[moat[q]]; else if (v === 1) buf[si] = glare; } continue; }
            if (kd === GLASS) {
              const v = st[p1[q]];
              if (v === 2) buf[si] = PAL[base + p1[q] * 4 + tone[q]];
              else if (v === 1) buf[si] = skyHole;
            } else if (kd === LEAD && (st[p1[q]] | st[p2[q]])) buf[si] = BLOOM[sx + (sy >> 1) - 20 + BLOOM_OFF];
          }
        }
        g.cost.box += S.bw * S.bh * 4;
      }

    // ---- shards: the tapped-out pieces fall, flat, and fade
    for (let n = 0; n < shards.length; n += 3) {
      const k = shards[n], j = shards[n + 1], a = shards[n + 2], S = SLOTS[k], G = S.set[+cur[k]];
      const dx = ((hash(mk, k, j) % 17) - 8) * a, dy = 0.5 * GRAV * a * a + 6 * a;
      const al = a < 0.35 ? 256 : ((1 - (a - 0.35) / (FALL - 0.35)) * 256) | 0;
      const px = G.pieces[j].px, ox = S.ox + Math.round(dx), oy = S.oy + Math.round(dy), base = (S.base + j) * 4;
      for (let m = 0; m < px.length; m++) {
        const q = px[m], x = ox + (q % S.bw), y = oy + ((q / S.bw) | 0);
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        blend(y * W + x, buf, PAL[base + G.tone[q]], al);
      }
      g.cost.blend += px.length;
    }
    // the hour's petals fall the same way, in the old colours
    if (hourShow && s > 1.2 && s < 1.2 + 0.28 * 12 + FALL) {
      for (let i = 0; i < NBASE; i++) {
        const k = pKind[i];
        if (k !== K_PIN && k !== K_POUT) continue;
        const a = s - (1.2 + 0.28 * pOrd[i]);
        if (a < 0 || a > FALL) continue;
        const c = schOld[k - K_BMAIN], b = BR[i];
        const r = (c[0] * ((Lr * b) >> 8)) >> 8, gg = (c[1] * ((Lg * b) >> 8)) >> 8, bb = (c[2] * ((Lb * b) >> 8)) >> 8;
        tones(0, r, gg, bb, TMP);
        const dx = ((hash(i, 4) % 13) - 6) * a, dy = 0.5 * GRAV * a * a;
        const al = a < 0.35 ? 256 : ((1 - (a - 0.35) / (FALL - 0.35)) * 256) | 0;
        const px = pPix[i], ox = Math.round(dx), oy = Math.round(dy);
        for (let m = 0; m < px.length; m++) {
          const q = px[m], x = (q % W) + ox, y = ((q / W) | 0) + oy;
          if (x < 0 || y < 0 || x >= W || y >= H) continue;
          blend(y * W + x, buf, TMP[CODE[q] & 3], al);
        }
        g.cost.blend += px.length;
      }
    }

    // ---- solder sparks at the new joints, and the odd glint of a seed in the glass
    const star = (x, y, a, c) => {
      const A = (a * 256) | 0;
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      blend(y * W + x, buf, c, A);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < W && yy < H) blend(yy * W + xx, buf, c, (A * 140) >> 8);
      }
      if (a > 0.7) for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) {
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < W && yy < H) blend(yy * W + xx, buf, c, (A * 60) >> 8);
      }
    };
    const SPARK = pack(255, 236, 170);
    for (let n = 0; n < sparks.length; n += 3) { const a = sparks[n + 2]; star(sparks[n], sparks[n + 1], a < 0.3 ? a / 0.3 : (1 - a) / 0.7, SPARK); }
    if (day > 0) {
      const P = 0.8, n = Math.floor(T / P), ph = (T - n * P) / 0.45;
      if (ph < 1) {
        const tx = Math.round(xb + (rand(n, 1) - 0.5) * 36 - 0.5 * ((rand(n, 2) * 72) - 36)), ty = 4 + ((rand(n, 2) * 72) | 0);
        if (tx >= 0 && tx < W) {
          const kd = pKind[CODE[ty * W + tx] >> 2];
          if (kd >= K_QUARRY) star(tx, ty, sin(ph * Math.PI) * day, pack(255, 252, 236));
        }
      }
    }
    g.cost.blend += 40;
  },
};
