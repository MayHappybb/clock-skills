// Air Dancer: four wacky waving inflatable tube men outside a used-car lot,
// and each one's fabric tube is sewn in the shape of a numeral. They stand
// on their blowers in a row along the kerb, under a string of bunting, in
// front of the lot's stock; two silver balloons tied to a stake are the
// colon.
//
// The font (airdancer-glyphs.js) is the tube itself: a fat round nylon
// tube about 9 px across with an ink keyline, round-ended, bending in soft
// arcs; every digit grows out of its blower's collar at the bottom (the 2
// and the 4 have their own feet, the 1 a flopped-over top, the 9 a tail
// that swings under it). Each wears a painted face (googly eyes, open
// mouth) where its tube ends nearest the sky, and two thin arm tubes.
//
// At rest the time is never still: every second each blower chugs and a
// pulse of air (a bulge with a bright band) runs up the whole tube, round
// the bends, to the face; when it gets there the dancer stretches and
// flicks its arms. Under that the tubes sway (the base stays put, the top
// swings), little ripples run up the fabric, and the arms flail with a whip
// that runs out to the tips. Every 15 s a bigger thing: :15 a gust comes in
// from the left and bends each dancer in turn (a sale flyer tumbles past),
// :30 they do a stadium wave, :45 the blowers double-pump.
//
// Minute turn: the old dancer's blower sputters (it gives a last gasp, the
// fabric trembles), cuts out, and the tube sags: the air drains from the
// face down, the arms shrivel, and it folds down onto its blower into a
// crumpled heap of fabric (pure vertical squash with folds, so a sagging
// digit only ever reads as itself, then as cloth). After :00 the blower
// whooshes, the heap puffs, the new digit rises out of it on an
// under-damped spring (overshoot, settle), the air front runs up the tube,
// the arms pop out last and the eyes snap open. Hour: the blowers go to
// full: everyone sways big and fast with two pulses a second, the arms
// windmill, a bunch of balloons is let go from behind the cars and
// confetti comes down, for ten seconds; the time stands throughout.
//
// Palette: four nylon colours (tomato red, sunflower yellow, lime, hot
// pink), the loudest things on the glass, each keylined in one aubergine
// ink, the strongest contrast. Around them the lot is sun-bleached and
// calm: a pale sky, a grey glass showroom, the stock in dusty paint, faded
// bunting. The scene drifts through dawn, day, dusk and night a minute at a
// time; at night the sky is navy, the showroom windows and string lights
// glow warm, the dancers stay at full colour and the backlight dims.
// Flat 2D: no shading, only a sheen line on the lit side of each tube, the
// air pulse band, windscreen glints and the night lights.
//
// Cost: the digits are sampled from four byte maps a glyph (79 KB flash for
// all ten) through a per-row warp (one bilinear lookup a pixel of each
// dancer's box, ~2,000 px a dancer); arms are a few unoutlined capsules;
// the still lot is drawn once a minute into a 25.6 KB scratch canvas
// (~0.3 ms of fills, billed to that frame) and copied in every frame.
// RAM beyond the frame buffer: that canvas plus ~2 KB of per-frame tables.

import { clockFields, sin, cos, hash, clamp, progress, ease, mix, to565 } from '../js/kit.js';
import { FIELDS, R0, M, FW, FH, CH } from './airdancer-glyphs.js';
import { W, H, INK, SLOT_X, NOZ_Y, paletteAt, background, bgCost, bunting, stars, glints, colon, blower } from './airdancer-scene.js';

const INK565 = to565(INK);

const DANCERS = [
  { fill: 0xff4433, lite: 0xffa078, sheen: 0xffd2bc, arm: 0xff6a52 },   // tomato red
  { fill: 0xffcf1a, lite: 0xfff19a, sheen: 0xfffbe2, arm: 0xffdd58 },   // sunflower yellow
  { fill: 0x3bcf55, lite: 0xa2f0a0, sheen: 0xdcffd4, arm: 0x68df74 },   // lime
  { fill: 0xff4fb0, lite: 0xffa8da, sheen: 0xffe2f2, arm: 0xff78c4 },   // hot pink
].map((d) => ({
  ...d,
  lv: Uint16Array.from([0, 1, 2, 3, 4], (j) => to565(mix(d.fill, d.lite, j / 4))),
  edge: Uint16Array.from([0, 1, 2, 3], (j) => to565(mix(INK, d.fill, (j + 0.5) / 4))),
  sh: to565(d.sheen), arm565: to565(d.arm), fill565: to565(d.fill),
}));

// each glyph's centre-line middle, so every digit stands centred on its slot
const MID = FIELDS.map((F) => {
  let a = 99, b = -99;
  for (let j = 0; j < FH; j++) for (let i = 0; i < FW; i++) if (F.D[j * FW + i] < R0 * 16) { a = Math.min(a, i - M); b = Math.max(b, i - M); }
  return (a + b) / 2;
});

// ------------------------------------------------------------ small integer helpers

function blend(a, b, w) {            // RGB565 a -> b by w/32
  const ar = a >> 11, ag = (a >> 5) & 63, ab = a & 31;
  return ((ar + (((b >> 11) - ar) * w >> 5)) << 11) | ((ag + ((((b >> 5) & 63) - ag) * w >> 5)) << 5) | (ab + (((b & 31) - ab) * w >> 5));
}
const SQ = Float32Array.from({ length: 1025 }, (_, i) => Math.sqrt(i / 16));   // sqrt table, d^2 in 1/16 px^2
const sm = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const bump = (x) => (x <= -1 || x >= 1 ? 0 : (1 - x * x) * (1 - x * x));
/** Under-damped spring step from 0 to 1 (zero start velocity). */
function spring(t, w, z) {
  if (t <= 0) return 0;
  const wd = w * Math.sqrt(1 - z * z), e = Math.exp(-z * w * t);
  return 1 - e * (cos(wd * t) + ((z * w) / wd) * sin(wd * t));
}

// ------------------------------------------------------------ one tube, through its warp

const RT = new Float32Array(256), CT = new Uint8Array(256), MA = new Float32Array(16), MB = new Float32Array(16);
let bill = 0;

/**
 * Draw glyph field F with its nozzle at screen (nxs, nys): rows squashed by
 * k toward the nozzle, columns by kx, each row shifted by shiftAt(h)
 * (h = height up the glyph, 0..1). Radius and colour per air distance come
 * from RT / CT.
 */
function drawTube(g, F, nxs, nys, k, kx, shiftAt, pal) {
  const buf = g.buf, D = F.D, S = F.S, L = F.L, NY = F.NY, nzx = F.noz[0], nzy = F.noz[1];
  const ik = 1 / k, ikx = 1 / kx, KW = 1.2;
  // squash metric by surface direction: distances scale with the squash, the
  // girth only with its square root, so a sagging tube stays a fat tube
  for (let j = 0; j < 16; j++) { const m = Math.sqrt((j / 15) * k * k + (1 - j / 15) * kx * kx); MA[j] = m * 0.0625; MB[j] = Math.sqrt(m); }
  const yTop = Math.max(0, Math.floor(nys - (nzy + M) * k)), yBot = Math.min(H - 1, Math.ceil(nys + (FH - 1 - M - nzy) * k));
  let n = 0;
  for (let y = yTop; y <= yBot; y++) {
    const gy = nzy - (nys - (y + 0.5)) * ik, fy = gy + M;
    if (fy < 0 || fy >= FH - 1) continue;
    const iy = fy | 0, wy = fy - iy, h = (nzy - gy) / CH, s = shiftAt(h);
    const xa = nxs + s + (-M - nzx) * kx, xb = nxs + s + (FW - 1 - M - nzx) * kx;
    let x0 = Math.ceil(xa - 0.5), x1 = Math.floor(xb - 0.5);
    if (x0 < 0) x0 = 0;
    if (x1 > W - 1) x1 = W - 1;
    let fx = nzx + (x0 + 0.5 - s - nxs) * ikx + M;
    const row = iy * FW, prow = y * W, near = wy < 0.5 ? 0 : FW;
    for (let x = x0; x <= x1; x++, fx += ikx) {
      if (fx < 0 || fx >= FW - 1) continue;
      n++;
      const ix = fx | 0, wx = fx - ix, i0 = row + ix;
      const a = D[i0], b = D[i0 + 1], c = D[i0 + FW], d = D[i0 + FW + 1];
      if (a > 150 && b > 150 && c > 150 && d > 150) continue;
      const t = a + (b - a) * wx, u = c + (d - c) * wx;
      const ni = i0 + near + (wx < 0.5 ? 0 : 1), si = S[ni], q = NY[ni];
      const dd = (t + (u - t) * wy) * MA[q] - RT[si] * MB[q];
      if (dd >= 1) continue;
      const p = prow + x;
      if (dd > 0) buf[p] = blend(buf[p], INK565, ((1 - dd) * 32) | 0);
      else if (dd > -KW) buf[p] = INK565;
      else if (dd > -KW - 1) buf[p] = pal.edge[((-KW - dd) * 4) | 0];
      else buf[p] = dd > -KW - 2.4 && L[ni] > 55 ? pal.sh : pal.lv[CT[si]];
    }
  }
  bill += n;
}

/** A thin tube (an arm) along a polyline: no keyline, so it stays lighter than the digit it waves from. */
function drawArm(g, pts, r, col) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [x, y] of pts) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  const bx0 = Math.max(0, Math.floor(x0 - r - 1)), by0 = Math.max(0, Math.floor(y0 - r - 1));
  const bx1 = Math.min(W - 1, Math.ceil(x1 + r + 1)), by1 = Math.min(H - 1, Math.ceil(y1 + r + 1));
  const segs = [];
  for (let i = 1; i < pts.length; i++) {
    const ax = pts[i - 1][0], ay = pts[i - 1][1], dx = pts[i][0] - ax, dy = pts[i][1] - ay;
    segs.push([ax, ay, dx, dy, 1 / (dx * dx + dy * dy || 1)]);
  }
  const buf = g.buf, lim = (r + 1) * (r + 1);
  let n = 0;
  for (let y = by0; y <= by1; y++)
    for (let x = bx0; x <= bx1; x++) {
      n++;
      let best = 1e9;
      for (const [ax, ay, dx, dy, iv] of segs) {
        const px = x + 0.5 - ax, py = y + 0.5 - ay;
        let u = (px * dx + py * dy) * iv;
        u = u < 0 ? 0 : u > 1 ? 1 : u;
        const ex = px - u * dx, ey = py - u * dy, e = ex * ex + ey * ey;
        if (e < best) best = e;
      }
      if (best >= lim) continue;
      const dd = SQ[(best * 16) | 0] - r, p = y * W + x;
      buf[p] = dd > 0 ? blend(buf[p], col, ((1 - dd) * 32) | 0) : col;
    }
  bill += n * segs.length;
}

// ------------------------------------------------------------ the face

const WHITE = to565(0xfdfbf4), MOUTH = to565(0x5a1424), TONGUE = to565(0xff7a8a);
function face(g, hx, hy, look, mood, blink) {
  const x = Math.round(hx - 3.5), y = Math.round(hy - 3);
  const set = (px, py, c) => { if (px >= 0 && py >= 0 && px < W && py < H) g.buf[py * W + px] = c; };
  const eye = (ex) => {
    if (blink || mood === 'shut') { for (let i = 0; i < 3; i++) set(ex + i, y + 2, INK565); return; }
    const tall = mood === 'wide' ? 4 : mood === 'sad' ? 2 : 3, y0 = mood === 'wide' ? y - 1 : mood === 'sad' ? y + 1 : y;
    for (let j = 0; j < tall; j++) for (let i = 0; i < 3; i++) set(ex + i, y0 + j, WHITE);
    const px = ex + (look > 0 ? 1 : 0), py = y0 + (mood === 'sad' ? 0 : look === 0 ? 0 : 1);
    set(px, py, INK565); set(px + 1, py, INK565); set(px, py + 1, INK565); set(px + 1, py + 1, INK565);
  };
  eye(x); eye(x + 4);
  // the mouth: an open "O" of joy, a wobbly line when sad
  if (mood === 'sad' || mood === 'shut') { set(x + 2, y + 5, INK565); set(x + 3, y + 4, INK565); set(x + 4, y + 5, INK565); }
  else {
    const big = mood === 'wide';
    for (let i = 1; i < 6; i++) set(x + i, y + 4, INK565);
    for (let i = 1; i < 6; i++) set(x + i, y + 5, i === 1 || i === 5 ? INK565 : MOUTH);
    if (big) { for (let i = 2; i < 5; i++) set(x + i, y + 6, i === 3 ? TONGUE : INK565); }
    else set(x + 3, y + 5, TONGUE);
  }
  g.cost.px += 30;
}

// ------------------------------------------------------------ choreography

// how low (and how far over) an arm may swing, by digit, so a waving arm never
// draws a 7's brim on a 1 or closes a 4's open throat
const ARM_MIN = [12, 52, 14, 14, 38, 12, 14, 22, 12, 12], ARM_MAX = [150, 128, 150, 150, 140, 150, 150, 150, 150, 150];
const OUT0 = 58.6, IN0 = 0.03, STAG = 0.04, V = 72;
const PH = [0, 2.1, 4.0, 5.3];          // each dancer's own phase

/** Gust at :15: a smooth lean that reaches dancer i as the front passes. */
function gustLean(s, i) {
  const t = s - 15 - (SLOT_X[i] + 20) / 100;
  if (t <= 0 || t > 3.2) return 0;
  return 5 * sm(t / 0.45) * (1 - sm((t - 0.45) / 1.9)) * (t > 0.45 ? cos((t - 0.45) * 2.6) : 1);
}
/** Stadium wave at :30: out and back. */
function waveAt(s, i) {
  return bump((s - (30.4 + 0.24 * i)) / 0.38) + 0.7 * bump((s - (31.6 + 0.24 * (3 - i))) / 0.38);
}
/** Double pump at :45: duck, then pop. */
function pumpAt(s) {
  if (s < 44.6 || s > 46.6) return 0;
  return -0.06 * bump((s - 44.95) / 0.35) + 0.075 * bump((s - 45.55) / 0.4) - 0.02 * bump((s - 46.1) / 0.3);
}

function slotState(i, s, cur, prv, nxt, sMax, sHead) {
  const st = { k: 1, kx: 1, flop: 0, crumple: 0, la: 1, droop: 0, mood: 'happy', pile: 0, rest: 1, hide: false, run: 1,
    front: -1, frontDir: 0, tremble: 0 };
  if (nxt[i] !== cur[i] && s >= OUT0 + i * STAG) {
    const u = s - OUT0 - i * STAG;
    const gasp = 0.045 * sm(u / 0.28);
    const q = progress(u, 0.26, 1.16), e = sm(q);
    st.k = (1 + gasp * (1 - e)) * (1 - 0.86 * e);
    st.kx = 1 - 0.5 * e;
    st.flop = (i & 1 ? -1 : 1) * 7 * Math.sin(Math.PI * e);
    st.crumple = 2.4 * Math.sin(Math.PI * e);
    st.tremble = 0.5 * Math.sin(Math.PI * clamp(u / 0.36, 0, 1));
    st.front = sMax * (1 - progress(u, 0.22, 1.05)); st.frontDir = -1;
    st.la = 1 - ease.inQuad(progress(u, 0.1, 0.7)); st.droop = progress(u, 0, 0.55);
    st.mood = u < 0.32 ? 'wide' : st.k > 0.72 ? 'sad' : 'shut';
    st.pile = ease.outCubic(progress(u, 0.64, 1.16));
    st.rest = 1 - progress(u, 0, 0.5);
    st.run = u < 0.3 ? 1 : 0;
    st.hide = u > 1.2;
    st.noFace = false;
  } else if (prv[i] !== cur[i] && s < 3.2) {
    const u = s - IN0 - i * STAG;
    st.run = u >= 0 ? 1 : 0;
    const x = spring(u, 4.6, 0.6), x2 = spring(u, 5.4, 0.72);
    st.k = 0.14 + 0.86 * x; st.kx = 0.5 + 0.5 * x2;
    st.crumple = 2.4 * Math.sin(Math.PI * clamp(x, 0, 1)); st.flop = 0;
    st.front = sMax * 1.15 * ease.outQuad(progress(u, 0.04, 0.85)); st.frontDir = 1;
    st.la = u < 0.75 ? 0 : ease.outBack(progress(u, 0.75, 1.2)); st.droop = 1 - progress(u, 0.75, 1.1);
    st.mood = st.front < sHead + 2 ? 'shut' : u < 1.6 ? 'wide' : 'happy';
    const puff = 1 + 0.14 * bump((u - 0.1) / 0.14);
    st.pile = u < 0 ? 1 : puff * (1 - ease.inOutQuad(progress(u, 0.12, 0.62)));
    st.rest = progress(u, 0.6, 1.9);
    st.hide = u < 0.02;
    st.noFace = u < 0;
  }
  return st;
}

// ------------------------------------------------------------ the hour show extras

const BALLOON_C = [0xff4433, 0xffcf1a, 0x3bcf55, 0xff4fb0, 0x44a0ff, 0xffffff, 0xff8a1e];
function balloons(g, s) {
  for (let j = 0; j < 14; j++) {
    const t = s - (2.2 + j * 0.42);
    if (t < 0) continue;
    const h = hash(j, 404), x0 = 6 + (h % 148), v = 10 + ((h >>> 9) % 6);
    const y = 60 - v * t, x = x0 + 3 * sin(t * 1.4 + j) + t * 1.2;
    if (y < -10) continue;
    const c = BALLOON_C[j % BALLOON_C.length];
    g.thickLine(x, y + 3.5, x - 1 + sin(t * 2 + j), y + 9, 0.7, 0x7a7068, { aa: true, a: 0.8 });
    g.fillEllipse(x, y, 3.2, 3.8, INK, { aa: true });
    g.fillEllipse(x, y, 2.3, 2.9, c, { aa: true });
    g.fillRect(Math.round(x - 1.4), Math.round(y - 1.8), 1, 1, 0xffffff);
  }
}
function confetti(g, s) {
  for (let j = 0; j < 40; j++) {
    const h = hash(j, 505), t = s - (2.4 + (h % 50) / 10);
    if (t < 0) continue;
    const y = -3 + t * (9 + (h >>> 7) % 7), x = (h >>> 12) % W + 3 * sin(t * 3 + j);
    if (y > 58) continue;
    const c = BALLOON_C[(h >>> 20) % BALLOON_C.length], flip = ((t * 6 + j) | 0) & 1;
    g.fillRect(Math.round(x), Math.round(y), flip ? 2 : 1, flip ? 1 : 2, c);
  }
}
function flyer(g, s) {
  const t = s - 15;
  if (t < 0 || t > 2.2) return;
  const x = -8 + 100 * t, y = 33 + 6 * sin(t * 3.1) - 4 * t, a = t * 7;
  const cx = cos(a), sx = sin(a);
  const pts = [[-3, -2], [3, -2], [3, 2], [-3, 2]].map(([u, v]) => [x + u * cx - v * sx * 0.6, y + u * sx * 0.6 + v * cx]);
  g.fillPolygon(pts, 0xf6f0de, { aa: true });
  g.thickLine(pts[0][0], pts[0][1], pts[1][0], pts[1][1], 1, 0xe0574a, { aa: true });
}

// ------------------------------------------------------------ the frame

export default {
  name: 'Air Dancer',
  blurb: 'Four wacky waving tube men outside a car lot, each tube sewn in the shape of a numeral; each minute the old one sags into a heap and the new one whooshes up.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, mk = f.minuteKey;
    ctx.lcd.backlight(1 - 0.5 * ctx.night);
    const T = (ctx.date.getTime() - 1767225600000) / 1000;   // seconds since 2026-01-01: one continuous clock for every phase, no wrap at midnight
    const mod = f.h * 60 + f.m + s / 60;
    const prv = clockFields(new Date(ctx.date.getTime() - 60000)), nxt = clockFields(new Date(ctx.date.getTime() + 60000));
    const cur = f.hh + f.mm, old = prv.hh + prv.mm, nw = nxt.hh + nxt.mm;
    const hourShow = prv.h !== f.h && s < 13;
    const wild = hourShow ? sm((s - 2) / 1) * (1 - sm((s - 10.5) / 1.6)) : 0;
    bill = 0;

    // ---- the lot
    const bg = background(mk, f.h * 60 + f.m);
    if (bgCost) for (const k of Object.keys(bgCost)) g.cost[k] += bgCost[k];
    g.buf.set(bg.buf); g.cost.px += W * H;
    const P = paletteAt(f.h * 60 + f.m);
    stars(g, T, P);
    const gustAll = s > 15 && s < 18.5 ? sm((s - 15) / 0.5) * (1 - sm((s - 15.8) / 2.6)) : 0;
    bunting(g, T, P, gustAll, wild);
    glints(g, T, P);
    if (hourShow) { balloons(g, s); confetti(g, s); }
    flyer(g, s);
    const beatC = bump(((s % 1) - 0.12) / 0.2);
    colon(g, T, beatC, P, wild);

    // ---- the dancers
    for (let i = 0; i < 4; i++) {
      const d = +cur[i], F = FIELDS[d], pal = DANCERS[i];
      const st = slotState(i, s, cur, old, nw, F.sMax, F.sHead);
      // the squash gathers on the slot centre, so every digit's heap lands in the same place
      const wk = clamp((st.kx - 0.5) / 0.5, 0, 1);
      const nxs = SLOT_X[i] + (F.noz[0] - MID[d]) * wk, nys = NOZ_Y;
      const rw = st.rest;

      // the beat: a pulse of air leaves the nozzle each second (two a second in the hour show)
      const tb = T - i * 0.05;   // time of day, so the beat runs on across the minute
      const pulses = [];
      for (const n of [Math.floor(tb), Math.floor(tb) - 1]) pulses.push([V * (tb - n), 1.05 * (s >= 44.9 && s < 46 ? 1.6 : 1)]);
      if (s >= 44.9 && s < 46) pulses.push([V * (s - i * 0.05 - 45.3), 1.6]);
      if (wild > 0) for (const n of [Math.floor(tb - 0.5), Math.floor(tb - 0.5) - 1]) pulses.push([V * (tb - 0.5 - n), 1.05 * wild]);
      const arrive = Math.max(0, ...pulses.map(([p, a]) => a * bump((p - F.sHead - 6) / 12)));
      // when the air reaches the face the top of the tube whips over, left on one beat, right on the next
      const tw = (tb - (F.sHead + 4) / V) % 1, beatN = Math.floor(tb - (F.sHead + 4) / V);
      const whip = (beatN & 1 ? 1 : -1) * (i & 1 ? -1 : 1) * 2.6 * (tw < 0.5 ? Math.sin(Math.PI * tw / 0.5) : 0);

      // radius and colour along the tube
      const sMax = Math.min(255, F.sMax + 10);
      for (let a = 0; a <= sMax; a++) {
        let r = R0 + 0.32 * rw * sin(0.55 * a - 9 * T + PH[i]), c = 0;
        for (const [p, amp] of pulses) { const b = bump((a - p) / 4.5); if (b > 0) { r += 1.0 * amp * rw * b; c = Math.max(c, b * amp * rw); } }
        if (st.frontDir < 0 && a > st.front) r = r * 0.8 + 0.4 * sin(a * 1.3 + T * 3);
        if (st.frontDir > 0) {
          if (a > st.front) r = r * 0.7 + 0.4 * sin(a * 1.3);
          else { const b = bump((a - st.front + 4) / 5); r += 0.8 * b; c = Math.max(c, b); }
        }
        if (st.tremble > 0) r += st.tremble * sin(a * 0.9 + T * 70);
        RT[a] = r; CT[a] = Math.min(4, Math.round(c * 4));
      }
      g.cost.box += sMax * (pulses.length * 3 + 4);

      // the warp
      const kr = 1 + rw * (0.03 * arrive + 0.075 * waveAt(s, i) + pumpAt(s) + 0.04 * wild);
      const k = st.k * kr, kx = st.kx * (1 - 0.6 * (kr - 1));
      const gl = gustLean(s, i);
      const ws = 2.3 * PH[i];
      const shiftAt = (h) => {
        const hh = h < 0 ? 0 : h;
        return rw * (3.0 * hh * hh * sin(T * 2.7 + PH[i]) + 1.2 * hh * sin(T * 6.3 - 3.5 * hh + ws)
          + wild * 3.2 * hh * sin(T * 8.6 + PH[i] * 1.7))
          + rw * whip * hh * hh * hh + gl * hh * hh + st.flop * hh * hh + st.crumple * sin(hh * 13 + PH[i] + T * 2) * (0.3 + hh);
      };

      // head (face) and arms
      const hgy = F.head[1], hh = (F.noz[1] - hgy) / CH;
      const hy = nys - (F.noz[1] - hgy) * k;
      const hx = nxs + (F.head[0] - F.noz[0]) * kx + shiftAt(hh);
      if (!st.hide && st.la > 0.05) {
        for (const side of [-1, 1]) {
          const ph = T * 7.2 + PH[i] + side * 1.3;
          let e = 46 + 30 * sin(ph) + 22 * Math.min(1, arrive) + 40 * waveAt(s, i) + wild * 55 * sin(T * 11 + side + PH[i]);
          e += side < 0 ? 38 * gustAll : -38 * gustAll;
          e = e * (1 - st.droop) - 55 * st.droop;
          const L = 3.8 * st.la;
          let ax = hx + side * 3.4, ay = hy + 1.2, ang = e;
          const pts = [[ax, ay]];
          for (let j = 0; j < 4; j++) {
            if (j) ang += (24 + 10 * wild) * sin(T * 9.5 - j * 1.1 + PH[i] + side);
            const a = (clamp(ang, ARM_MIN[d] - (ARM_MIN[d] + 80) * st.droop, ARM_MAX[d]) * Math.PI) / 180;
            ax += side * L * cos(a); ay -= L * sin(a);
            pts.push([ax, ay]);
          }
          drawArm(g, pts, 1.35 * Math.min(1, st.la * 1.6), pal.arm565);
        }
      }
      if (!st.hide) drawTube(g, F, nxs, nys, k, kx, shiftAt, pal);
      if (!st.hide && !st.noFace) {
        const blink = (hash(mk, i, Math.floor(s / 0.25)) % 16 === 0);
        const look = gustAll > 0.2 ? 1 : (Math.floor(T / 1.7 + i) % 3) - 1;
        face(g, hx, hy, look, st.mood, blink && st.mood === 'happy');
      }
      // the heap of fabric
      if (st.pile > 0.02) {
        const z = st.pile, cx = nxs;
        const lumps = [[-5.2, -2.0, 5.6, 3.3], [5.0, -1.8, 5.8, 3.1], [0.2, -4.0, 5.2, 3.5]];
        for (let j = 0; j < 3; j++) {
          const [dx, dy, rx, ry] = lumps[j], wob = 0.35 * sin(T * 5 + j * 2);
          const ex = cx + dx * z, ey = nys + 0.5 + (dy + wob) * z;
          const kl = 1.2 * Math.min(1, z * 3);
          g.fillEllipse(ex, ey, rx * z + kl, ry * z + kl, INK, { aa: true });
          g.fillEllipse(ex, ey, rx * z, ry * z, mix(DANCERS[i].fill, INK, 0.12 * (2 - j)), { aa: true });
        }
      }
      blower(g, SLOT_X[i], nxs, T, st.run, beatC * st.run, P);
    }
    g.cost.box += bill * 8;
  },
};
