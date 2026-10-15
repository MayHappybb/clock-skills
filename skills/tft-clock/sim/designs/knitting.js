// Fair Isle: a winter jumper on the needles, seen close up, and the time is
// knitted into it. The whole glass is stockinette, every pixel part of a
// 4 x 4 px knit stitch (a V of two legs, the tip of the stitch above dipping
// into it, tension a little uneven, a fuzzy halo of Shetland fibre at every
// colour change). Across the chest runs the main Fair Isle band, and its
// motif is the time: four charted numerals (knitting-fabric.js, 7 stitches
// by 12 rows) on the two fronts of a cardigan, between peerie bands; the
// ribbed button band runs down the middle and its two horn buttons are the
// colon, riding the cloth. Two wooden needles hold the live row along the top edge, and the two
// balls of yarn being knitted sit in the bottom corners.
//
// Alive: the knitter works along the row, the needle tips travelling right
// to left. Every second the needles click and the stitch is pulled through:
// the tug runs out through the cloth from the needle tips as a ripple, so
// the numerals are lifted and stretched one after the other, nearest
// first, and settle; the cloth also hangs and sways. The two balls turn as
// their yarn is drawn, alternately, on the half beat. The halo of loose
// fibre at the colour edges shimmers like stop-motion wool (4 fps boil).
// Every 15 s the row is finished: the needles swap (the tips glide back
// across) and the turned work swings on them.
// Minute turn: the tips go to the changing numerals and pick them out, one
// stitch at a time in an even random order (never row by row), each picked
// stitch springing up as a crinkled bit of yarn that is drawn back up to
// the tips; after :00 yarn comes down from the tips and they knit the new
// numeral in by the same even rule, each new stitch fresh and lifted for a
// moment.
// Hour: the knitter shakes out the jumper (a big wave runs along the cloth)
// and it is a new jumper: a ragged front of re-knitting crosses the glass
// with the wave and every stitch behind it is the next colourway, peeries,
// band shading and the numerals' yarns included; the old balls roll out
// and the new ones roll in. The time reads throughout.
//
// Palette: real Fair Isle, a few yarns per jumper and only two in any one
// row: a dark ground with a second dark for the band shading, a natural
// white motif and its partner (gold, ice blue, pink...), a mid peerie
// ground and its figure. Six colourways by hour, and a night jumper from
// 23:00 to 07:00 (navy, oat-cream numerals) with the backlight at 45 %.
// The numerals are always the light yarn on the darkest ground: the
// strongest contrast on the glass. Hard pixels everywhere: it is stitches.
//
// Cost: one integer pass over the glass (three click rings and the hour
// wave looked up per pixel from a distance table, then three table reads:
// stitch, shade, palette); the chart (924 stitches) rebuilt each frame; a
// few dozen kit shapes. Nothing is cached per minute. Flash ~128 KB: fabric
// maps 74 KB, ring distance/direction tables 51 KB, tug curve, palettes and
// the re-knit schedule ~4 KB. RAM ~11 KB of per-frame buffers.

import { clockFields, rand, sin, cos, ease, progress, clamp, to565 } from '../js/kit.js';
import {
  CC, CR, FW, FH, OX, S0, S1, PS, NY, NCW, PAL, RGB, BASE, COLOURWAYS, cwOf,
  motifYarn, GLYPH, SLOT_C, BAND0, BAND_C, BUTTON_Y, M1, M2, G2,
} from './knitting-fabric.js';

const W = 160, H = 80, N = CC * CR, TAU = Math.PI * 2;

// ------------------------------------------------------------ the turn
const OUT0 = 58.7, OUT1 = 59.7;   // picking out
const IN1 = 1.2;                  // knitting in, from :00
const XR = 150, XL = 10;          // the needle tips' run along a row

// ------------------------------------------------------------ the tug (flash tables)
// Each click pulls the cloth toward the needle tip, and the pull spreads out
// through the knitting as a ring: PR is the displacement (1/64 px) at a
// distance j (1/4 px) behind the ring's front; DIST / UX / UY are the
// distance and direction of every pixel from a tip at (|dx|, 2).
const RIPPLE_V = 260, PULSE_T = 1.5, JMAX = Math.round(RIPPLE_V * 4 * PULSE_T);
const PR = new Int16Array(JMAX);
for (let j = 0; j < JMAX; j++) {
  const t = j / (RIPPLE_V * 4);
  PR[j] = Math.round(64 * 4.6 * Math.exp(-1.5 * t) * Math.sin(TAU * 1.5 * t) * Math.min(1, (PULSE_T - t) * 3));
}
const TIP_Y = 2;
const DIST = new Uint16Array(W * H), UX = new Int8Array(W * H), UY = new Int8Array(W * H);
for (let a = 0; a < W; a++)
  for (let y = 0; y < H; y++) {
    const dy = y + 0.5 - TIP_Y, r = Math.hypot(a, dy) || 1, k = a * H + y;
    DIST[k] = Math.round(r * 4); UX[k] = Math.round((a / r) * 64); UY[k] = Math.round((dy / r) * 64);
  }

// the needles hold the top still; the cloth hangs free below
const EYQ = new Int32Array(H), EY = new Float32Array(H);
for (let y = 0; y < H; y++) {
  const u = clamp((y - 3) / 17, 0, 1);
  EY[y] = u * u * (3 - 2 * u); EYQ[y] = Math.round(EY[y] * 256);
}

// the hour's re-knitting front: per stitch, when it turns into the new jumper
const FLIP_T = new Float32Array(N);
for (let r = 0; r < CR; r++) for (let c = 0; c < CC; c++) FLIP_T[r * CC + c] = 1.9 + (c / (CC - 1)) * 2.6 + rand(c, r, 99) * 0.4 + (r & 1) * 0.05;

// per-frame working buffers (RAM)
const CB = new Uint16Array(N), KC = new Uint8Array(N), FR = new Uint8Array(N);
const AXQ = new Int32Array(W), SXI = new Int16Array(H), SYI = new Int32Array(H);
const RA = [0, 1, 2].map(() => new Int32Array(W)), RS = [0, 1, 2].map(() => new Int8Array(W));
const CURL = new Float32Array(300 * 3); let nCurl = 0;

/** A loose bit of yarn: from a stitch at (x, y) at u = 0 to the needle tip at u = 1, rising first. */
function addCurl(x, y, xw, u) {
  const e = u * u * (3 - 2 * u), lift = 7 * Math.min(1, u * 4);
  CURL[nCurl * 3] = x + (xw - x) * e;
  CURL[nCurl * 3 + 1] = y - lift + (4 - y + lift) * e;
  CURL[nCurl * 3 + 2] = u; nCurl++;
}

// ------------------------------------------------------------ where the needle tips are
function needleX(s, L, R) {
  if (s >= OUT0) return L + (R - L) * (1 - ease.inOutQuad(progress(s, OUT0, 60)));
  if (s < 1.3) return L + (R - L) * ease.inOutQuad(s / 1.3);
  if (s < 2.5) return R + (XR - R) * ease.inOutCubic(progress(s, 1.3, 2.5));
  const rows = [[2.5, 14], [15.5, 29], [30.5, 44], [45.5, 57.2]];
  for (let k = 0; k < 4; k++) {
    const [a, b] = rows[k];
    if (s < b) return XR + (XL - XR) * progress(s, a, b);
    const nextA = k < 3 ? rows[k + 1][0] : OUT0, to = k < 3 ? XR : R;
    if (s < nextA) return XL + (to - XL) * ease.inOutCubic(progress(s, b, nextA));
  }
  return R;
}
const ROW_END = [14, 29, 44];

/** The cloth's sideways hang: a slow sway, and a swing each time the work is turned. */
function sway(s) {
  let v = 0.8 * sin((TAU * s) / 3.75);
  for (const tf of ROW_END) {
    const t = s - tf;
    if (t > 0 && t < 5) v += 3.2 * Math.exp(-1.0 * t) * sin((TAU * t) / 1.25);
  }
  return v;
}

function clickDip(s, fast) {
  const ph = fast ? (s * 4) % 1 : (s * 2) % 1, big = fast || s % 1 < 0.5 ? 1 : 0.55;
  return ph < 0.2 ? big * sin((Math.PI * ph) / 0.2) : 0;
}

// ------------------------------------------------------------ drawing helpers (direct buffer writes)
function put(g, x, y, c565) {
  if (x >= 0 && x < W && y >= 0 && y < H) g.buf[y * W + x] = c565;
}

const WOOD = [0xf0dcaa, 0xcfa565, 0x8a673a];   // lit, body, shadow: birch needles
const WOOD565 = WOOD.map((c) => ((c >> 8) & 0xf800) | ((c >> 5) & 0x7e0) | ((c & 0xff) >> 3));

/** A needle: a 3 px shaft, tapering to a point at `tip`; dir +1 points right. */
function needle(g, tip, yc, dir, dip) {
  const tipI = Math.round(tip);
  for (let i = 0; i < 9; i++) {
    const x = tipI - dir * i, d = Math.round(dip * (1 - i / 9));
    if (i < 2) put(g, x, yc + d, WOOD565[1]);
    else if (i < 5) { put(g, x, yc + d - 1, WOOD565[0]); put(g, x, yc + d, WOOD565[1]); put(g, x, yc + d + 1, WOOD565[2]); }
    else { put(g, x, yc - 1, WOOD565[0]); put(g, x, yc, WOOD565[1]); put(g, x, yc + 1, WOOD565[2]); }
  }
  const a = dir > 0 ? 0 : tipI + 9, b = dir > 0 ? tipI - 9 : W - 1;
  if (b >= a) {
    for (let k = 0; k < 3; k++) {
      const row = (yc - 1 + k) * W, c = WOOD565[k];
      for (let x = Math.max(0, a); x <= Math.min(W - 1, b); x++) g.buf[row + x] = c;
    }
    g.cost.px += 3 * (b - a + 1);
  }
  g.cost.px += 27;
}

/** The live stitches looped over a needle: two legs in front, the crown above. */
function loops(g, xw, left, yc) {
  for (let cc = 1; cc <= 40; cc++) {
    const x0 = cc * 4 - OX;
    if ((x0 + 2 < xw) !== left) continue;
    const base = CB[cc];   // row 0
    const lit = PAL[base + 3], mid = PAL[base + 2], dk = PAL[base + 1];
    put(g, x0 + 1, yc - 2, mid); put(g, x0 + 2, yc - 2, dk);
    put(g, x0, yc - 1, lit); put(g, x0, yc, lit); put(g, x0, yc + 1, mid);
    put(g, x0 + 3, yc - 1, mid); put(g, x0 + 3, yc, mid); put(g, x0 + 3, yc + 1, dk);
    g.cost.px += 8;
  }
}

const BTN = [0x5e3f24, 0xc89a62, 0xeccb94];   // horn button: rim, face, lit edge
/** A button sewn on with the motif yarn: a flat disc, rim, two holes and the thread between. */
function button(g, cx, cy, k) {
  const x = Math.round(cx), y = Math.round(cy);
  g.fillCircle(x, y, 4.2, BTN[0]);
  g.fillCircle(x, y, 3.3, BTN[1]);
  g.fillRect(x - 3, y - 2, 1, 2, BTN[2]); g.fillRect(x - 2, y - 3, 2, 1, BTN[2]);
  const th = RGB[(k * NY + M1) * 4 + 3];
  put(g, x - 2, y, to565(BTN[0])); put(g, x + 1, y, to565(BTN[0]));
  g.fillRect(x - 1, y, 2, 1, th);
}

/** A ball of yarn: a flat disc wound with two families of strands. */
function ball(g, cx, cy, r, base, th) {
  const body = RGB[base + 2], line = RGB[base + (base % (NY * 4) === G2 * 4 ? 3 : 1)], rim = RGB[base + 0];
  g.fillCircle(cx, cy, r, body);
  for (const [ang, offs] of [[th, [-7, -3.5, 0, 3.5, 7]], [th + 1.15, [-6, -2, 2, 6]]]) {
    const dx = cos(ang), dy = sin(ang);
    for (const d of offs) {
      const L = Math.sqrt(Math.max(0, r * r - d * d)) - 0.8;
      if (L < 1) continue;
      const mx = cx - dy * d, my = cy + dx * d;
      g.line(Math.round(mx - dx * L), Math.round(my - dy * L), Math.round(mx + dx * L), Math.round(my + dy * L), line);
    }
  }
  g.circle(cx, cy, r, rim);
}

// ------------------------------------------------------------ the face
export default {
  name: 'Fair Isle',
  blurb: 'A winter jumper on the needles: the time is the colourwork of its main band; every click of the needles tugs the cloth, picked out and knitted anew each minute, a new jumper each hour.',
  fps: 60,

  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, mk = f.minuteKey, T = ctx.date.getTime();
    ctx.lcd.backlight(1 - 0.55 * ctx.night);
    const prv = clockFields(new Date(T - 60000)), nxt = clockFields(new Date(T + 60000));
    const cur = f.hh + f.mm, pStr = prv.hh + prv.mm, nStr = nxt.hh + nxt.mm;

    // ---- this turn's changing numerals, and where the needle goes for them
    const outgoing = s >= OUT0, incoming = s < IN1 + 0.3;
    const other = outgoing ? nStr : pStr;
    let spanL = 999, spanR = -999;
    for (let i = 0; i < 4; i++) if (cur[i] !== other[i]) {
      const x0 = SLOT_C[i] * 4 - OX;
      spanL = Math.min(spanL, x0 + 4); spanR = Math.max(spanR, x0 + 24);
    }
    if (spanL > spanR) { spanL = 120; spanR = 146; }
    const xw = needleX(s, spanL, spanR);

    // ---- the jumper: which colourway each stitch is in (the hour re-knits it)
    const kCur = cwOf(f.h), kOld = cwOf(prv.h);
    const hourShow = prv.h !== f.h && s < 6.5;
    for (let i = 0; i < N; i++) {
      let k = kCur, fr = 0;
      if (hourShow) {
        const dt = s - FLIP_T[i];
        if (dt < 0) k = kOld; else if (dt < 0.3) fr = 1;
      }
      KC[i] = k; FR[i] = fr;
      CB[i] = ((k + fr * NCW) * NY + BASE[k][i]) * 4;
    }

    // ---- the numerals, picked out and knitted in stitch by stitch
    nCurl = 0;
    const P = outgoing ? ease.inQuad(progress(s, OUT0, OUT1)) : 0;
    const Q = incoming ? ease.outQuad(progress(s, 0, IN1)) : 1;
    for (let i = 0; i < 4; i++) {
      const d = cur.charCodeAt(i) - 48, cells = GLYPH[d];
      const out = outgoing && cur[i] !== nStr[i], inn = incoming && cur[i] !== pStr[i];
      for (let j = 0; j < cells.length; j++) {
        const gx = cells[j][0], gy = cells[j][1];
        const c = SLOT_C[i] + gx, r = BAND0 + gy, idx = r * CC + c;
        let fresh = FR[idx];
        if (out) {
          const rk = rand(c, r, mk + 1);
          if (rk < P) {
            // the picked stitch springs up as crinkled yarn and is drawn back to the needle tip
            const tr = OUT0 + Math.sqrt(rk) * (OUT1 - OUT0), u = (s - tr) / 0.5;
            if (u < 1 && nCurl < 300) addCurl(c * 4 - OX + 1, r * 4 + 1, xw, u);
            continue;
          }
        } else if (inn) {
          const rk = rand(c, r, mk);
          const ta = (1 - Math.sqrt(1 - rk)) * IN1;
          // its yarn comes down from the needle tip and is knitted in
          if (s < ta) { const u = 1 - (ta - s) / 0.4; if (u > 0 && nCurl < 300) addCurl(c * 4 - OX + 1, r * 4 + 1, xw, u * 0.9); }
          if (rk >= Q) continue;
          if (s - ta < 0.28) fresh = 1;
        }
        const k = KC[idx];
        CB[idx] = ((k + fresh * NCW) * NY + motifYarn(k, gx, gy)) * 4;
      }
    }
    g.cost.box += N * 4 + 84 * 4 * 6;

    // ---- the cloth: tugged by each click, swung, shaken at the hour
    // the last three clicks' rings (a click on the second, a lighter clack on the half):
    // per column, the offset into the distance table and the side
    const k0 = Math.floor(s * 2), F = [0, 0, 0], AM = [0, 0, 0];
    for (let b = 0; b < 3; b++) {
      const kb = k0 - b, tk = kb / 2, sb = tk < 0 ? tk + 60 : tk;
      const xb = needleX(sb, spanL, spanR) + 0.5;
      F[b] = Math.round((s - tk) * RIPPLE_V * 4); AM[b] = kb & 1 ? 34 : 64;
      const ra = RA[b], rs = RS[b];
      for (let x = 0; x < W; x++) { const d = x - Math.round(xb); ra[x] = (d < 0 ? -d : d) * H; rs[x] = d < 0 ? -1 : 1; }
    }
    for (let x = 0; x < W; x++) AXQ[x] = 0;
    if (hourShow && s > 1.5 && s < 5.5) {
      const u = (s - 1.5) / 4, A = 5 * sin(Math.PI * u) * 4096;
      for (let x = 0; x < W; x++) AXQ[x] = (A * sin(TAU * (x / 90 - 1.15 * (s - 1.5)))) | 0;
    }
    const sw = sway(s);
    // breathing: the hanging cloth sinks and lifts on its needles, once per 3.75 s
    const br = 1.6 * sin((TAU * s) / 3.75 + 1.2);
    for (let y = 0; y < H; y++) { SXI[y] = Math.round(sw * EY[y]) + OX; SYI[y] = Math.round(br * EY[y] * 4096); }
    g.cost.box += W * 16 + H * 2;

    // ---- every pixel: where the cloth is, which stitch, which shade
    const buf = g.buf, boil = Math.floor((mk * 60 + s) * 4) & 7;
    const ra0 = RA[0], rs0 = RS[0], ra1 = RA[1], rs1 = RS[1], ra2 = RA[2], rs2 = RS[2];
    const F0 = F[0], F1 = F[1], F2 = F[2], A0 = AM[0], A1 = AM[1], A2 = AM[2];
    for (let y = 0, i = 0; y < H; y++) {
      const ey = EYQ[y], sx = SXI[y], sy = SYI[y];
      for (let x = 0; x < W; x++, i++) {
        // displacement in 1/4096 px: the rings pull toward the tip, the hour wave lifts
        let dx = 0, dy = AXQ[x] + sy;
        let k = ra0[x] + y, j = F0 - DIST[k];
        if (j >= 0 && j < JMAX) { const p = (PR[j] * A0) >> 6; dx += rs0[x] * UX[k] * p; dy += UY[k] * p; }
        k = ra1[x] + y; j = F1 - DIST[k];
        if (j >= 0 && j < JMAX) { const p = (PR[j] * A1) >> 6; dx += rs1[x] * UX[k] * p; dy += UY[k] * p; }
        k = ra2[x] + y; j = F2 - DIST[k];
        if (j >= 0 && j < JMAX) { const p = (PR[j] * A2) >> 6; dx += rs2[x] * UX[k] * p; dy += UY[k] * p; }
        let fy = y + ((dy * ey + 524288) >> 20);
        fy = fy < 0 ? 0 : fy >= FH ? FH - 1 : fy;
        let fx = x + sx + ((dx * ey + 524288) >> 20);
        fx = fx < 0 ? 0 : fx >= FW ? FW - 1 : fx;
        const p = fy * FW + fx, ps = PS[p];
        const st = (((ps >> 2) + boil) & 7) < 3 ? S1[p] : S0[p];
        buf[i] = PAL[CB[st] + (ps & 3)];
      }
    }
    g.cost.px += W * H; g.cost.box += W * H * 18;

    // ---- loose yarn springing up from picked stitches
    if (nCurl) {
      const k = kCur, c565 = PAL[(k * NY + M1) * 4 + 3];
      for (let n = 0; n < nCurl; n++) {
        const x = Math.round(CURL[n * 3]), y = Math.round(CURL[n * 3 + 1]), u = CURL[n * 3 + 2];
        put(g, x + 1, y, c565); put(g, x, y + 1, c565);
        if (u < 0.75) { put(g, x + 1, y + 2, c565); put(g, x + 2, y + 3, c565); }
      }
      g.cost.px += nCurl * 4; g.cost.box += nCurl * 8;
    }

    // ---- the colon: two buttons on the band, riding the cloth
    const bx = BAND_C[0] * 4 - OX + 4;
    for (const by of BUTTON_Y) {
      let ddx = 0, ddy = AXQ[bx] + SYI[by];
      for (let b = 0; b < 3; b++) {
        const k = RA[b][bx] + by, j = F[b] - DIST[k];
        if (j >= 0 && j < JMAX) { const p = (PR[j] * AM[b]) >> 6; ddx += RS[b][bx] * UX[k] * p; ddy += UY[k] * p; }
      }
      const e = EY[by];
      button(g, bx - (ddx * e) / 4096 - (SXI[by] - OX), by - (ddy * e) / 4096, kCur);
    }

    // ---- the needles and the live row
    const fast = outgoing || s < 1.3;
    const dip = 2 * clickDip(s, fast);
    needle(g, xw + 5, 3, 1, -0.6 * dip);
    loops(g, xw, true, 3);
    needle(g, xw - 5, 2, -1, dip);
    loops(g, xw, false, 2);

    // ---- the two balls in the corners, turning as their yarn is drawn
    const step = (t) => Math.floor(t) + ease.inOutQuad(progress(t % 1, 0, 0.35));
    let lx = 7, rx = 153, kL = kCur, kR = kCur;
    let roll = 0;
    for (const tf of ROW_END) { const t = s - tf; if (t > 0 && t < 4) roll += 3 * Math.exp(-1.2 * t) * sin((TAU * t) / 1.6); }
    lx += roll; rx -= roll;
    if (hourShow) {
      const uo = ease.inQuad(progress(s, 1.6, 2.8)), ui = ease.outCubic(progress(s, 4.2, 5.8));
      if (s < 4.2) { lx -= 26 * uo; rx += 26 * uo; kL = kR = kOld; } else { lx = -19 + 26 * ui; rx = 179 - 26 * ui; }
    }
    const thL = 0.45 * step(s) - lx / 11, thR = -0.45 * step(s + 0.5) + rx / 11;
    ball(g, lx, 79, 11, (kL * NY + M2) * 4, thL);
    ball(g, rx, 79, 11, (kR * NY + G2) * 4, thR);
  },
};
