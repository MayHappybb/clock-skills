// Metro: the glass is a Beck-style Underground diagram, and the time is
// four of its lines. Each numeral is one line's route, drawn as the map
// draws track: 5 px flat colour, only 0/45/90 degree runs with small
// rounded bends, station ticks, and terminus bars that become the
// numerals' serifs. The line follows the digit: 0 is the Circle line (a
// loop), 1 Central, 2 Piccadilly, 3 District (a branch line: its middle
// stroke is a branch ending at a terminus), 4 Victoria, 5 Bakerloo,
// 6 Metropolitan (a balloon loop), 7 Overground, 8 Northern (two loops,
// like its Kennington loop), 9 Elizabeth. The Thames, Beck's flat pale band
// with its 45 degree bends, splits the map: the hours on the north bank
// top left, the minutes on the south bank lower right. Round them, the
// rest of the network in pale tints, an interchange, two station names,
// the roundel, a pulsing 'you are here', and a TfL line-status board.
//
// Always alive: trains (a white light in the core of the line, three px
// wide, sliding by fractions of a pixel) run every route to a timetable:
// ease out of a station, ease into the next, dwell, shuttle between the
// termini or circulate the loops; a station glows as a train calls. A soft
// glint runs down the Thames every 9 s; 'you are here' sends out a ring
// every second; the board flips through the four lines' 'GOOD SERVICE'.
//
// Minute turn: the line is closed. From :58.3 the board says PART CLOSURE,
// the track drains from one terminus to the other into the map's grey
// 'closed' outline (the digit stays whole and right), trains are taken off
// ahead of the front, and the grey fades out by :59.9. After :00 the new
// line appears as the map draws a line under construction (a hollow
// outline, so the new digit reads at once), then its colour is laid along
// the route from a terminus, stations opening one by one, trains following.
// Hour: LAST TRAINS, then a front sweeps the printed map away and leaves the
// controllers' live track diagram: deep navy, every line lit and glowing,
// trains drawing light trails, twice the service on every route, the new
// lines built one after another. At :10 the card map sweeps back. At night
// the live diagram is the map (it sweeps in over the first minute of 23:00).
//
// Palette: the Tube map's own spot colours: a warm white card, the Thames
// pale blue, the line colours (saturated, one per digit, so the time is the
// only strong colour on the sheet), tints of 25-35 % for the rest of the
// network, the map's dark blue for lettering, roundel red and blue. The live
// diagram is the same set on navy, lines brightened, Northern turned white.
// Hard pixels for the sheet, the ticks and the lettering (a 5 px caps
// face drawn for the map); AA for the line edges, glow and the trains.
//
// Cost: one pass over the glass through a 12-entry colour table per
// edition (the sheet is a byte map in flash), then ~800-1,400 table
// pixels per numeral (edge distance, arc length, branch per pixel), a few
// blends each; trains and fronts are compares on the arc length. Nothing
// is redrawn once a minute. Flash: sheet 12.8 KB + numeral tables
// 12.2 k pixels x 6 B = ~73 KB, timetables < 2 KB.

import { clockFields, clamp, progress, ease, to565, hash } from '../js/kit.js';
import { GLYPHS, REACH } from './metro-routes.js';
import { W, H, SLOTS, MAT, EDITIONS, LINES, YAH, mapText, textWidth } from './metro-map.js';

const LUT_DAY = Uint16Array.from(EDITIONS.day.mat, to565);
const LUT_LIVE = Uint16Array.from(EDITIONS.live.mat, to565);
const QMAX = W + (H >> 1) + 2;
const FRONT = to565(0x8fd0ff);   // the sweep's own leading edge
// the river glint's profile: 12 steps from its centre out, dithered by nothing, just flat bands
const glintRamp = (base, hi) => Uint16Array.from({ length: 12 }, (_, d) => to565(mixc(base, hi, 0.75 * (1 - d / 12) ** 1.5)));

// ------------------------------------------------------------ integer colour

const r8 = (v) => ((v >> 11) & 31) * 255 / 31 | 0;
const g8 = (v) => ((v >> 5) & 63) * 255 / 63 | 0;
const b8 = (v) => (v & 31) * 255 / 31 | 0;
/** Blend 0xRRGGBB over a 565 value at a (0..1), back to 565. */
function over(v, c, a) {
  if (a >= 0.999) return to565(c);
  const r = r8(v), gg = g8(v), b = b8(v);
  const R = (c >> 16) & 255, G = (c >> 8) & 255, B = c & 255;
  const rr = r + (R - r) * a, g2 = gg + (G - gg) * a, bb = b + (B - b) * a;
  return ((rr >> 3) << 11) | ((g2 >> 2) << 5) | (bb >> 3);
}
const mixc = (c0, c1, u) => {
  const r = ((c0 >> 16) & 255) + ((((c1 >> 16) & 255) - ((c0 >> 16) & 255)) * u);
  const gg = ((c0 >> 8) & 255) + ((((c1 >> 8) & 255) - ((c0 >> 8) & 255)) * u);
  const b = (c0 & 255) + (((c1 & 255) - (c0 & 255)) * u);
  return ((r | 0) << 16) | ((gg | 0) << 8) | (b | 0);
};

const GLINT_DAY = glintRamp(EDITIONS.day.mat[1], 0xffffff), GLINT_LIVE = glintRamp(EDITIONS.live.mat[1], 0x5aa8e8);

// ------------------------------------------------------------ timetables

const DWELL = 0.8, DWELL_END = 1.5;
function timetable(gl, r) {
  const rt = gl.routes[r];
  const sts = gl.stations.map((st, k) => [st.s, k]).filter((p, k) => gl.stations[k].br === r).sort((a, b) => a[0] - b[0]);
  let stops;
  if (rt.loop) stops = sts.length ? sts : [[0, -1]];
  else {
    const fw = [[3, -1], ...sts, [rt.len - 3, -1]];
    stops = [...fw, ...fw.slice(1, -1).reverse()];
  }
  const legs = [];
  let t = 0;
  for (let i = 0; i < stops.length; i++) {
    const a = stops[i], b = stops[(i + 1) % stops.length];
    let D = b[0] - a[0];
    if (rt.loop) D = ((D % rt.len) + rt.len) % rt.len || rt.len;
    const dwell = a[1] < 0 ? DWELL_END : DWELL, dur = 0.3 + Math.abs(D) / 26;
    legs.push({ t0: t, dwell, dur, a: a[0], D, st: a[1] });
    t += dwell + dur;
  }
  const n = rt.len > 70 ? 2 : 1;
  return { legs, cycle: t, loop: rt.loop, len: rt.len, off: rt.off, n };
}
const TT = GLYPHS.map((gl) => gl.routes.map((_, r) => timetable(gl, r)));

/** Train k of a route at absolute time T (s): [arc length, station index dwelling at or -1, dwell phase]. */
function trainAt(tt, T, k, seed) {
  let u = (T + (k * tt.cycle) / tt.n + seed * 0.37) % tt.cycle;
  if (u !== u) u = 0;
  if (u < 0) u += tt.cycle;
  const L = tt.legs;
  let i = 0;
  while (i < L.length - 1 && L[i + 1].t0 <= u) i++;
  const lg = L[i], lt = u - lg.t0;
  if (lt < lg.dwell) return [lg.a + tt.off, lg.st, lt / lg.dwell, 0];
  const v = (lt - lg.dwell) / lg.dur;
  let s = lg.a + lg.D * ease.inOutQuad(v);
  if (tt.loop) s = ((s % tt.len) + tt.len) % tt.len;
  // speed 0..1 of the leg's peak, signed by direction: the trail grows with it
  const sp = (v < 0.5 ? 2 * v : 2 - 2 * v) * (lg.D < 0 ? -1 : 1);
  return [s + tt.off, -1, 0, sp];
}

// ------------------------------------------------------------ a numeral

const TRAIN_HALF = 3;
const TRAIL = 9;
const trainS = new Float32Array(16), trainBr = new Uint8Array(16), trainLen = new Float32Array(16), trainA = new Float32Array(16), trainV = new Float32Array(16);

/**
 * Draw one numeral's line. st: { lo, hi, hollow, alpha, F }: the line is solid
 * where lo <= s < hi, hollow (an outline, under construction or closed) elsewhere.
 */
function drawLine(g, gl, ox, oy, line, st, qlo, qhi, nTrains) {
  const buf = g.buf, ix = Math.floor(ox), iy = Math.floor(oy);
  const L = LINES[line];
  const P = gl.px, Q = gl.py, E = gl.E, S = gl.S, BR = gl.BR;
  const dayG = EDITIONS.day.ground, liveG = EDITIONS.live.ground;
  let n = 0;
  for (let q = 0; q < gl.n; q++) {
    const x = ix + P[q], y = iy + Q[q];
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const i = y * W + x, e = E[q], s = S[q];
    const qq = x + (y >> 1), live = qq < liveN || (qq >= qlo && qq < qhi);
    const col = live ? L[2] : L[1], grd = live ? liveG : dayG;
    let v = buf[i];
    const fs = clamp(s - st.lo + 0.5, 0, 1) * clamp(st.hi - s + 0.5, 0, 1);
    const a = st.alpha;
    n++;
    if (live) {
      // the lit diagram: a soft glow round the line
      if (e > -0.5) {
        const k = 1 - e / REACH, ga = 0.42 * k * k * a * (0.35 + 0.65 * fs);
        if (ga > 0.01) v = over(v, col, ga);
      }
    } else if (e < 2.5) {
      // a moat of paper round the line, where the pale network breaks for it
      v = over(v, grd, clamp(2.5 - e, 0, 1) * a * st.moat);
    }
    const cov = clamp(0.5 - e, 0, 1);
    if (cov > 0) {
      let c = col;
      if (fs < 1) {
        const hol = e > -1.2 ? (st.closed ? (live ? EDITIONS.live.closed : EDITIONS.day.closed) : col) : grd;
        c = fs > 0 ? mixc(hol, col, fs) : hol;
      }
      v = over(v, c, cov * a);
      // trains: a light sliding along the core of the line
      if (fs > 0 && e < -1.0 && BR[q] < 255) {
        for (let k = 0; k < nTrains; k++) {
          if (trainBr[k] !== BR[q]) continue;
          let rel = s - trainS[k];
          const len = trainLen[k];
          if (len > 0) { if (rel > len / 2) rel -= len; else if (rel < -len / 2) rel += len; }
          const d = rel < 0 ? -rel : rel;
          let tc = clamp(TRAIN_HALF + 0.5 - d, 0, 1);
          // on the lit diagram a moving train draws a short fading trail behind it
          if (live && tc < 1) {
            const sp = trainV[k], back = sp > 0 ? -rel : rel;
            if (back > TRAIN_HALF && back < TRAIL + TRAIN_HALF) {
              const tr = (1 - (back - TRAIN_HALF) / TRAIL) * (sp < 0 ? -sp : sp) * 0.75;
              if (tr > tc) tc = tr;
            }
          }
          tc *= fs * a * trainA[k];
          if (tc > 0.01) v = over(v, live ? L[4] : L[3], tc);
        }
      }
    }
    buf[i] = v;
  }
  g.cost.px += n; g.cost.box += n * 24;
}

// ------------------------------------------------------------ the face

function slotState(k, f, prv, nxt, s, hour) {
  const cur = +(f.hh + f.mm)[k], old = +(prv.hh + prv.mm)[k], nw = +(nxt.hh + nxt.mm)[k];
  const gl = GLYPHS[cur];
  if (s >= 58.3 && nw !== cur) {
    const D = gl.total * ease.inOutQuad(progress(s, 58.3, 59.2));
    return { d: cur, lo: D, hi: 1e9, closed: true, alpha: 1 - ease.inQuad(progress(s, 59.2, 59.9)), moat: 1, phase: 'close' };
  }
  const t0 = hour ? 0.5 + 0.4 * k : 0.3;
  if (s < t0 + 1.7 && old !== cur) {
    const F = (gl.total + 1) * ease.inOutQuad(progress(s, t0, t0 + 1.6));
    return { d: cur, lo: 0, hi: F, closed: false, alpha: ease.outQuad(progress(s, 0.05, 0.4)), moat: 1, phase: 'open' };
  }
  return { d: cur, lo: 0, hi: 1e9, closed: false, alpha: 1, moat: 1, phase: 'live' };
}

export default {
  name: 'Metro',
  blurb: 'A Tube map whose lines draw the time: each digit is a line route with stations and running trains; lines close and reopen at the minute, and the hour lights the live track diagram.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, T = ctx.date.getTime() / 1000;
    ctx.lcd.backlight(1 - 0.65 * ctx.night);
    const prv = clockFields(new Date(ctx.date.getTime() - 60000));
    const nxt = clockFields(new Date(ctx.date.getTime() + 60000));

    // the hour: tau is time from the top of the hour, -0.7 .. 14
    const pre = nxt.h !== f.h && s >= 59.3, hour = prv.h !== f.h && s < 14;
    const tau = pre ? s - 60 : hour ? s : 99;
    const showOn = tau < 99;
    // edition fronts: night sweeps in over the first minute of 23:00 (and out at 07:00);
    // the hour show sweeps the lit diagram in at the turn and the card map back at :10
    const qn = ctx.night >= 1 ? 999 : ctx.night * QMAX;
    let qlo = 0, qhi = 0;
    if (showOn) { qhi = QMAX * ease.inOutQuad(progress(tau, -0.7, 1.1)); qlo = QMAX * ease.inOutQuad(progress(tau, 9.8, 11.8)); }
    const rush = showOn ? progress(tau, 1.5, 3) * (1 - progress(tau, 10, 12)) : 0;
    liveN = qn; liveLo = qlo; liveHi = qhi;
    // a slow glint of light running down the Thames, east to west, every 9 s
    const gl9 = (T % 9) / 9, gq = Math.round(QMAX + 30 - gl9 * (QMAX + 60));
    const fhi = qhi > 0 && qhi < QMAX ? Math.floor(qhi) : -9, flo = qlo > 0 && qlo < QMAX ? Math.floor(qlo) : -9;

    // the sheet
    const buf = g.buf;
    for (let y = 0, i = 0; y < H; y++) {
      const rq = y >> 1;
      for (let x = 0; x < W; x++, i++) {
        const q = x + rq;
        const m = MAT[i], lv = q < qn || (q >= qlo && q < qhi);
        let v = (lv ? LUT_LIVE : LUT_DAY)[m];
        if (m === 1) { const dq = q - gq; if (dq > -12 && dq < 12) v = (lv ? GLINT_LIVE : GLINT_DAY)[dq < 0 ? -dq : dq]; }
        buf[i] = q === fhi || q === flo ? FRONT : v;
      }
    }
    g.cost.px += W * H; g.cost.box += W * H * 3;

    // the four lines
    for (let k = 0; k < 4; k++) {
      const st = slotState(k, f, prv, nxt, s, hour);
      const gl = GLYPHS[st.d], tts = TT[st.d];
      let nT = 0;
      calls.fill(0);
      for (let r = 0; r < tts.length; r++) {
        const tt = tts[r];
        const nj = rush > 0 ? tt.n * 2 : tt.n;
        for (let j = 0; j < nj; j++) {
          // in the hour's rush every route runs twice the trains, the extra ones between the others
          const extra = j >= tt.n;
          const [ts, si, ph, sp] = trainAt(tt, T, extra ? j - tt.n + 0.5 : j, hash(k, st.d, r) % 97);
          trainV[nT] = sp;
          if (si >= 0) calls[si] = Math.max(calls[si], Math.sin(Math.PI * ph) * (extra ? rush : 1));
          trainS[nT] = ts; trainBr[nT] = r; trainLen[nT] = tt.loop ? tt.len : 0;
          // trains run only on open track: they leave as the line closes, follow the build
          trainA[nT] = (extra ? rush : 1) * (st.phase === 'close' ? clamp((ts - st.lo) / 3, 0, 1) : st.phase === 'open' ? clamp((st.hi - ts - 4) / 3, 0, 1) : 1);
          nT++;
        }
      }
      const [ox, oy] = SLOTS[k];
      drawLine(g, gl, ox, oy, st.d, st, qlo, qhi, nT);
      drawStations(g, gl, ox, oy, st.d, st, qlo, qhi);
      boardLines[k] = st.d; slotSt[k] = st;
    }

    yah(g, s, qlo, qhi);
    board(g, f, prv, nxt, s);
  },
};

// ------------------------------------------------------------ stations

const calls = new Float32Array(16), boardLines = [0, 0, 0, 0];
let liveN = 0, liveLo = 0, liveHi = 0;
const isLive = (x, y) => { const q = Math.floor(x) + (Math.floor(y) >> 1); return q < liveN || (q >= liveLo && q < liveHi); };

function drawStations(g, gl, ox, oy, line, st, qlo, qhi) {
  const L = LINES[line];
  for (let k = 0; k < gl.stations.length; k++) {
    const sn = gl.stations[k];
    const open = sn.gs >= st.lo && sn.gs < st.hi;
    if (!open && !st.closed) continue;          // not built yet
    const cx = ox + sn.x + sn.nx * 3.5, cy = oy + sn.y + sn.ny * 3.5;
    const live = isLive(cx, cy);
    const col = open ? (live ? L[2] : L[1]) : (live ? EDITIONS.live.closed : EDITIONS.day.closed);
    // a train calling, or the station just opened by the building front
    let glow = open ? calls[k] : 0;
    if (st.phase === 'open') glow = Math.max(glow, clamp(1 - (st.hi - sn.gs) / 14, 0, 1) * (sn.gs < st.hi ? 1 : 0));
    const a = st.alpha;
    if (glow > 0.02) {
      const hc = live ? 0xffffff : col;
      g.fillCircle(cx, cy, 3.6, hc, { aa: true, a: (live ? 0.5 : 0.28) * glow * a });
    }
    g.fillRect(Math.round(cx - 1), Math.round(cy - 1), 2, 2, glow > 0.5 ? (live ? 0xffffff : mixc(col, 0xffffff, 0.55)) : col, { a });
  }
}

const slotSt = [null, null, null, null];

// ------------------------------------------------------------ you are here

function yah(g, s, qlo, qhi) {
  const [x, y] = YAH;
  const live = isLive(x, y);
  for (let k = 0; k < 2; k++) {
    const u = ((s + k) % 2) / 2;                 // a ring every second, two alive at once
    const r = 2.5 + u * 7;
    g.ring(x, y, r - 0.6, r + 0.6, 0xe1251b, { aa: true, a: 0.55 * (1 - u) * (1 - u) });
  }
  g.fillCircle(x, y, 3.2, live ? EDITIONS.live.ground : 0xffffff, { aa: true });
  g.fillCircle(x, y, 2.3, 0xe1251b, { aa: true });
}

// ------------------------------------------------------------ the status board

const ALL = ['ALL LINES', 0x10248c, 0x3a5cd8];
/** What the board says at second t of the minute whose digits are cur (pv before, nx after). */
function boardEntry(cur, pv, nx, uniq, t) {
  let ch = -1, op = -1;
  for (let k = 3; k >= 0; k--) if (cur[k] !== nx[k]) { ch = k; break; }
  for (let k = 3; k >= 0; k--) if (cur[k] !== pv[k]) { op = k; break; }
  const hourIn = cur.slice(0, 2) !== pv.slice(0, 2), hourNext = cur.slice(0, 2) !== nx.slice(0, 2);
  if (hourNext && t >= 57.4) return [-1, 'LAST TRAINS', 1, 57.4];
  if (ch >= 0 && t >= 57.4) return [+cur[ch], 'PART CLOSURE', 1, 57.4];
  if (hourIn && t < 12) return [-1, 'NEW TIMETABLE', 2, 0];
  if (op >= 0 && t < 6) return [+cur[op], 'NOW OPEN', 2, 0];
  const k = Math.floor(t / 6);
  return [uniq[k % uniq.length], 'GOOD SERVICE', 0, k * 6];
}

function board(g, f, prv, nxt, s) {
  const BX = 2, BY = 61, BHt = 18;
  const cur = f.hh + f.mm, nx = nxt.hh + nxt.mm, pv = prv.hh + prv.mm;
  const uniq = [...new Set(boardLines)];
  const e = boardEntry(cur, pv, nx, uniq, s);
  const u = ease.inOutQuad(progress(s - e[3], 0, 0.45));
  let e0 = null;
  if (u < 1) {
    if (e[3] > 0) e0 = boardEntry(cur, pv, nx, uniq, e[3] - 0.01);
    else {
      // the previous minute's last words
      const pp = clockFields(new Date(f.minuteKey * 60000 - 60000));
      e0 = boardEntry(pv, pp.hh + pp.mm, cur, [...new Set([...pv].map(Number))], 59.99);
    }
  }
  g.clip(0, BY, 58, BHt + 1);
  const row = (en, dy) => {
    const [line, msg, kind] = en, L = line < 0 ? ALL : LINES[line];
    const live = isLive(BX + 4, BY);
    const name = L[0], w = textWidth(name) + 5;
    const lc = live ? L[2] : L[1];
    g.fillRect(BX, BY + dy, w, 9, lc);
    const light = line === 0 || (line === 8 && live);
    mapText(g, name, BX + 3, BY + 2 + dy, light ? 0x14286e : 0xffffff);
    const ink = kind === 1 ? 0xe1251b : live ? EDITIONS.live.label : EDITIONS.day.label;
    mapText(g, msg, BX + 1, BY + 12 + dy, ink);
  };
  if (e0 && (e0[0] !== e[0] || e0[1] !== e[1])) {
    row(e0, Math.round(-u * (BHt + 1)));
    row(e, Math.round((1 - u) * (BHt + 1)));
  } else row(e, 0);
  g.unclip();
}
