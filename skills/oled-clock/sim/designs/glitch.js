// Glitch — the time as a VHS tape that is slowly coming apart.
//
// The digits are a slanted, chamfered techno hand of their own, drawn as
// scanlines: every fourth row is dark, so each stroke is a stack of 3 px
// bars, as on a CRT. A VHS on-screen display frames them ("PLAY", the date,
// a tape-position track whose marker is the seconds). The tape is never
// quite clean: tape wow (a smooth bend, rows pushed a pixel or two
// sideways) rolls up through the picture all the time, a tracking band
// crawls down every twenty seconds dragging the rows it crosses and dropping
// out in white dashes,
// and every few seconds there is a micro-glitch: a band of rows slips, the
// fields jitter, or a chroma ghost flashes for a few frames.
//
// The minute is a datamosh. From :56 the changing digits start to break up
// (more glitches, a chroma ghost pulls away from them as dither); from :57.2
// they are pixel-sorted: in bands of two scanlines each row's lit pixels
// slide along the row and pile up at one end, alternate bands opposite
// ways, leaving streaks. The whole frame tears into slices that jump at
// 18 Hz. At :58.5 the vertical hold goes and the picture rolls once through
// the glass on the controller's own start-line register, the blanking
// interval (black, with teletext dashes) rolling with it. Around :00 the
// signal is lost in snow; out of it the piles un-sort into the new digits,
// the tearing dies down, the vertical hold bounces once and catches, the
// ghost converges, and the new time locks with two last stutters.
//
// The hour is a channel change and a reboot: every digit is sorted away
// while the horizontal hold fails (rows skew and wrap) and the picture
// rolls faster and faster; then snow with "NO SIGNAL"; the set is switched
// off (the picture collapses to a line, then a dot that fades), switched on
// again (a line that opens into the screen), and boots: a typed log, the
// tuner locking on the channel of the hour. A burst of snow, and the new
// time rolls in on the start line, three turns decelerating, and locks.
//
// The old time is only on the glass before :00 and the new one after;
// across :00 there is only snow and piles of sorted pixels.
//
// Everything is a function of the clock: noise is hashed from the frame
// number (60 per second of epoch time), the slices from an 18 Hz tick, the
// glitches from a half-second tick.
//
// Burn-in: the face walks a 1 px orbit, the OSD labels swap corners every
// five minutes, the minute digits change every minute, and 23:00-07:00 the
// panel dims.

import { Gfx, dither, clamp, ease, clockFields, previousMinute, orbit, font3x5 } from '../js/kit.js';

const W = 128, H = 64;

/** A good integer hash, as a float in [0, 1). */
function hash(x, y, s) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const smooth = (a, b, v) => { const u = clamp((v - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); };

// ------------------------------------------------------------ letterforms
// Polygons in a 22 x 39 box (y down), filled even-odd. Strokes are 6 px
// wide, bars 7 rows (two scanlines). The top-left and bottom-right corners
// are cut at 45 degrees, so 9 is 6 turned over. The box is slanted.

const GW = 22, GH = 39, SL = 0.18, PAD = 4;
const GLYPHS = {
  0: [[[7, 0], [22, 0], [22, 32], [15, 39], [0, 39], [0, 7]], [[9, 7], [16, 7], [16, 29], [13, 32], [6, 32], [6, 10]]],
  1: [[[3, 6], [9, 0], [15, 0], [15, 39], [9, 39], [9, 7], [3, 7]]],
  2: [[[7, 0], [22, 0], [22, 23], [6, 23], [6, 32], [22, 32], [15, 39], [0, 39], [0, 16], [16, 16], [16, 7], [0, 7]]],
  3: [[[7, 0], [22, 0], [22, 32], [15, 39], [0, 39], [0, 32], [16, 32], [16, 23], [5, 23], [5, 16], [16, 16], [16, 7], [0, 7]]],
  4: [[[0, 6], [6, 0], [6, 16], [16, 16], [16, 0], [22, 0], [22, 33], [16, 39], [16, 23], [0, 23]]],
  5: [[[7, 0], [22, 0], [22, 7], [6, 7], [6, 16], [22, 16], [22, 32], [15, 39], [0, 39], [0, 32], [16, 32], [16, 23], [0, 23], [0, 7]]],
  6: [[[7, 0], [22, 0], [22, 7], [6, 7], [6, 16], [22, 16], [22, 32], [15, 39], [0, 39], [0, 7]], [[6, 23], [16, 23], [16, 29], [13, 32], [6, 32]]],
  7: [[[7, 0], [22, 0], [22, 33], [16, 39], [16, 7], [0, 7]]],
  8: [[[7, 0], [22, 0], [22, 32], [15, 39], [0, 39], [0, 7]], [[6, 7], [16, 7], [16, 16], [6, 16]], [[6, 23], [16, 23], [16, 29], [13, 32], [6, 32]]],
};
GLYPHS[9] = GLYPHS[6].map((p) => p.map(([x, y]) => [GW - x, GH - y]));

/** Rasterize a glyph, slanted, with every fourth row dark (the scanlines). */
function raster(polys, gw) {
  const w = gw + 2 * PAD + 1;
  const data = new Uint8Array(w * GH);
  const rows = [];
  for (let py = 0; py < GH; py++) {
    const lit = [];
    const y = py + 0.5;
    if (py % 4 !== 3) {
      for (let px = 0; px < w; px++) {
        const x = px + 0.5 - PAD - SL * (GH / 2 - y);
        let inside = false;
        for (const P of polys)
          for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
            const [xi, yi] = P[i], [xj, yj] = P[j];
            if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
          }
        if (inside) { data[py * w + px] = 1; lit.push(px); }
      }
    }
    rows.push(Int16Array.from(lit));
  }
  return { w, data, rows };
}

const MASK = Array.from({ length: 10 }, (_, d) => raster(GLYPHS[d], GW));
const COLON = raster([[[0, 8], [5, 8], [5, 15], [0, 15]], [[0, 24], [5, 24], [5, 31], [0, 31]]], 5);

const SLOT = [5, 30, 76, 101];      // glyph origins, before the slant
const COLON_X = 61;
const TOP = 12;
const digitsOf = (f) => [...`${f.hh}${f.mm}`].map(Number);

// ------------------------------------------------------------ the picture
// Everything is drawn into P (the picture, in RAM rows), then composed onto
// the canvas through the tape's faults: row shifts, chroma ghost, dropouts, snow.

const P = new Gfx(W, H);
const SHIFT = new Int16Array(H);     // per-row horizontal displacement
const SPARK = new Float32Array(H);   // per-row density of tracking sparks

const EXT = 7;   // a sorted row may pile up this far outside its glyph box

/**
 * A glyph into P at (ox, oy), each row pixel-sorted by `sortOf(py)`
 * (0 = intact, 1 = all its lit pixels piled at one end of the row). Bands
 * of two scanlines sort alternate ways; a sliding pixel run leaves a streak.
 */
function drawGlyph(m, ox, oy, sortOf, dirSeed = 0) {
  const buf = P.buf;
  for (let py = 0; py < GH; py++) {
    const y = oy + py;
    if (y < 0 || y >= H) continue;
    const xs = m.rows[py], n = xs.length;
    if (!n) continue;
    const e = sortOf ? sortOf(py) : 0;
    const row = y * W;
    if (e <= 0) {
      for (let i = 0; i < n; i++) { const x = ox + xs[i]; if (x >= 0 && x < W) buf[row + x] = 1; }
      continue;
    }
    const dir = ((py >> 3) + dirSeed) & 1 ? -1 : 1;
    const L = ox - EXT, R = ox + m.w + EXT;
    let lo = W, hi = -1;
    for (let i = 0; i < n; i++) {
      const x0 = ox + xs[i];
      const tgt = dir > 0 ? R - n + i : L + i;
      const x = Math.round(x0 + (tgt - x0) * e);
      if (x >= 0 && x < W) buf[row + x] = 1;
      if (x < lo) lo = x;
      if (x > hi) hi = x;
    }
    // The streak: the run is smeared back to where it started.
    const lv = 0.55 * Math.sin(Math.PI * Math.min(1, e * 1.15));
    const a = dir > 0 ? ox + xs[0] : hi, b = dir > 0 ? lo : ox + xs[n - 1];
    for (let x = Math.max(0, a); x <= Math.min(W - 1, b); x++) if (dither(x, y, lv)) buf[row + x] = 1;
  }
}

/** Per-row sort progress: bands of two scanlines start at staggered times. */
function sorter(tau, t0, spread, dur, seed, inbound) {
  return (py) => {
    const band = py >> 3;
    const start = t0 + spread * hash(band, seed, 11) + 0.12 * hash(py, seed, 12);
    const u = ease.inOutCubic(clamp((tau - start) / dur, 0, 1));
    return inbound ? 1 - u : u;
  };
}

/** Slices: the frame tears into bands of 1-6 rows, re-rolled at 18 Hz. */
function tear(T, amp, ampMax = 9) {
  if (amp <= 0) return;
  const tick = Math.floor(T * 18);
  for (let y = 0; y < H;) {
    const h = 1 + Math.floor(hash(y, tick, 3) * 6);
    const off = hash(y, tick, 4) < 0.4 ? 0 : Math.round((hash(y, tick, 5) * 2 - 1) * amp * ampMax);
    for (let k = 0; k < h && y < H; k++, y++) SHIFT[y] += off + Math.round(amp * 1.6 * Math.sin(y * 0.4 + T * 31));
  }
}

/** Compose P onto the canvas. */
function compose(g, fx) {
  const src = P.buf, dst = g.buf, gh = fx.ghost;
  for (let y = 0; y < H; y++) {
    const dx = SHIFT[y], row = y * W, sp = SPARK[y];
    for (let x = 0; x < W; x++) {
      let sx = x - dx;
      if (fx.wrap) sx = ((sx % W) + W) % W;
      let v = sx >= 0 && sx < W ? src[row + sx] : 0;
      if (!v && gh) {
        const l = sx - gh, r = sx + gh;
        if (l >= 0 && l < W && src[row + l] && dither(x, y, 0.42)) v = 1;
        else if (r >= 0 && r < W && src[row + r] && dither(x + 4, y + 1, 0.2)) v = 1;
      }
      if (sp > 0 && hash(x >> 2, y, fx.fi >> 1) < 0.07 && hash(x, y, 5) < 0.8) v = 1;
      if (fx.snow > 0) {
        const s = hash(x, y, fx.fi + 7919) < fx.snow ? 1 : 0;
        if (fx.kill >= 1 || (fx.kill > 0 && hash(x, y, fx.fi + 104729) < fx.kill)) v = s;
        else if (s && hash(x, y, fx.fi + 15485863) < 0.4) v = 1;
      }
      dst[row + x] = v;
    }
  }
}

/** The vertical blanking interval, drawn into RAM rows 56-63 while the picture rolls. */
function blanking(fi) {
  P.fillRect(0, 56, W, 8, 0);
  for (const y of [58, 60])
    for (let x = 4; x < W - 2; x += 2) if (hash(x >> 1, y, fi >> 1) < 0.5) { P.buf[y * W + x] = 1; P.buf[y * W + x + 1] = 1; }
}

// ------------------------------------------------------------ the tape, steady

/** The four digits and the colon into P; `sorts[k]` pixel-sorts slot k (4 = the colon). */
function drawTime(digits, ox, oy, sorts = [], dirSeed = 0) {
  for (let k = 0; k < 4; k++) drawGlyph(MASK[digits[k]], SLOT[k] - PAD + ox, TOP + oy, sorts[k], dirSeed + k);
  drawGlyph(COLON, COLON_X - PAD + ox, TOP + oy, sorts[4], dirSeed);
}

/**
 * Tape wow: a bend that rolls up through the picture all the time, a
 * smooth wave of rows pushed a pixel or two sideways; and the tracking band,
 * crawling down every twenty seconds, dragging rows and dropping out.
 */
function tapeNoise(T, fi) {
  const yh = 70 - ((T * 4) % 100);
  for (let y = Math.max(0, Math.floor(yh)); y < Math.min(H, yh + 16); y++)
    SHIFT[y] += Math.round(1.7 * Math.sin((Math.PI * (y + 0.5 - yh)) / 16) ** 2);
  const yb = ((T * 5.5) % 110) - 20, tick = Math.floor(T * 30);
  for (let y = Math.max(0, Math.floor(yb)); y < Math.min(H, yb + 3); y++) {
    SHIFT[y] += 1 + (hash(y, tick, 1) < 0.5 ? 1 : 0);
    SPARK[y] = 1;
  }
}

/** A micro-glitch every few seconds: a band slips, the fields jitter, a ghost flashes. */
function micro(T, rate, fx) {
  const k0 = Math.floor(T * 2);
  for (let k = k0 - 1; k <= k0; k++) {
    if (hash(k, 1, 9) >= rate) continue;
    const start = k / 2 + 0.45 * hash(k, 2, 9), dur = (2 + Math.floor(4 * hash(k, 3, 9))) / 60;
    if (T < start || T >= start + dur) continue;
    const type = Math.floor(hash(k, 4, 9) * 3);
    if (type === 0) {
      const y0 = TOP + Math.floor(hash(k, 5, 9) * 34), h = 2 + Math.floor(hash(k, 6, 9) * 7);
      const dx = (hash(k, 7, 9) < 0.5 ? -1 : 1) * (2 + Math.floor(hash(k, 8, 9) * 5));
      for (let y = y0; y < Math.min(H, y0 + h); y++) SHIFT[y] += dx;
    } else if (type === 1) fx.ghost = Math.max(fx.ghost, 3);
    else for (let y = TOP - 2; y < TOP + GH + 2; y++) SHIFT[y] += y & 1 ? 1 : -1;
  }
}

/** The on-screen display: PLAY (or TRACKING), the date, the tape track with the seconds. */
function osd(f, date, ox, oy, mode, T) {
  const swap = Math.floor((date.getTime() - 30000) / 300000) % 2;
  const dt = `${f.dow} ${f.dd} ${f.month}`;
  const dw = font3x5.measure(dt);
  const lw = mode === 'track' ? 56 : 20;
  const lx = swap ? 124 - lw + ox : 4 + ox, dx = swap ? 4 + ox : 124 - dw + ox, y = 2 + oy;
  if (mode === 'track') {
    P.text('TRACKING', lx, y, { font: font3x5 });
    // A meter hunting for the signal.
    const lv = 0.5 + 0.5 * Math.sin(T * 9) * Math.sin(T * 2.3);
    for (let i = 0; i < 5; i++) {
      const x = lx + 34 + i * 4;
      if (i < Math.round(lv * 5)) P.fillRect(x, y, 3, 5, 1); else P.rect(x, y + 2, 3, 1, 1);
    }
  } else {
    for (let j = 0; j < 3; j++) P.vline(lx + j, y + j, 5 - 2 * j, 1);
    P.text('PLAY', lx + 5, y, { font: font3x5 });
  }
  P.text(dt, dx, y, { font: font3x5 });
  // The tape track: dotted ahead, solid behind, the head at the seconds.
  const x0 = 6 + ox, x1 = 121 + ox, ty = 60 + oy;
  const hx = Math.round(x0 + ((x1 - x0) * f.sec) / 60);
  for (let x = x0; x <= x1; x++) if (x <= hx || (x & 1) === 0) P.pixel(x, ty, 1);
  for (let s = 0; s <= 60; s += 15) P.pixel(Math.round(x0 + ((x1 - x0) * s) / 60), ty - 1, 1);
  P.fillRect(hx - 1, ty - 2, 3, 5, 1);
}

// ------------------------------------------------------------ the minute: a datamosh

function minuteShow(tau, T, A, B, fx, seed, ox, oy) {
  const sorts = [];
  for (let k = 0; k < 4; k++) {
    if (A[k] === B[k]) continue;
    sorts[k] = tau < 0 ? sorter(tau, -2.9 + 0.15 * k, 1.0, 0.9, seed + k, false)
      : sorter(tau, 0.1 + 0.12 * k, 0.8, 0.9, seed + k + 50, true);
  }
  drawTime(tau < 0 ? A : B, ox, oy, sorts, seed);
  const antic = smooth(-4.5, -2.5, tau) * (1 - smooth(0, 0.3, tau));
  micro(T, 0.22 + 0.7 * antic, fx);
  fx.ghost = Math.max(fx.ghost, tau < 0 ? Math.round(3 * smooth(-4, -1.5, tau)) : Math.round(4 * (1 - smooth(0.4, 1.9, tau))));
  tear(T, tau < 0 ? smooth(-2.6, -0.5, tau) : 1 - smooth(0.2, 2.3, tau));
  // The vertical hold goes: one roll of the whole picture, on the start line.
  if (tau >= -1.6 && tau < -0.35) {
    fx.start = Math.round(64 * ease.inOutCubic((tau + 1.6) / 1.25));
    fx.vbi = true;
  }
  // ... and catches again, with a bounce.
  if (tau >= 0.35 && tau < 1.6) {
    const k = tau - 0.35;
    fx.start = Math.round(-8 * Math.exp(-k * 3.2) * Math.cos(k * 12));
    fx.vbi = fx.start !== 0;
  }
  // Signal lost, across :00.
  const b = smooth(-0.42, -0.12, tau) * (1 - smooth(0.12, 0.42, tau));
  if (b > 0) { fx.snow = 0.5; fx.kill = b; }
  // Two last stutters as it locks.
  for (const [st, dx] of [[1.8, 5], [2.2, -4]])
    if (tau >= st && tau < st + 0.05) {
      for (let y = TOP - 1; y < TOP + GH + 1; y++) SHIFT[y] += dx;
      fx.ghost = 3;
    }
  return tau < 2.6 ? 'track' : 'play';
}

// ------------------------------------------------------------ the hour: channel change and reboot

const H_START = -3.6, H_END = 6.8;

function bootLog(lt, f, T) {
  const lines = [
    'GLITCH/OS 2.6   (C)1989',
    'VRAM 1024 BYTES ..... OK',
    'H-SYNC 15.7KHZ ...... OK',
    'V-SYNC 60HZ ......... OK',
    `TUNER CH ${f.hh} ...... LOCK`,
    `TIME ${f.hh}:${f.mm}:${f.ss}`,
    '> PLAY',
  ];
  let cx = -1, cy = 0;
  for (let i = 0; i < lines.length; i++) {
    const t0 = i * 0.33;
    if (lt < t0) break;
    const n = Math.min(lines[i].length, Math.floor((lt - t0) * 60));
    const y = 3 + i * 8;
    const end = P.text(lines[i].slice(0, n), 6, y, { font: font3x5 });
    cx = n ? end + 2 : 6; cy = y;
  }
  if (cx >= 0 && Math.floor(T * 4) % 2 === 0) P.fillRect(cx, cy, 3, 5, 1);
}

function hourShow(tau, T, A, B, f, fx, seed, ox, oy) {
  if (tau < -1.6) {
    // The channel goes: everything is sorted away, the horizontal hold
    // fails (rows skew and wrap) and the picture rolls faster and faster.
    const sorts = [0, 1, 2, 3, 4].map((k) => sorter(tau, -3.4 + 0.1 * k, 0.6, 0.9, seed + k, false));
    drawTime(A, ox, oy, sorts, seed);
    tear(T, 1.2 * smooth(-3.6, -2.0, tau));
    const hold = smooth(-3.2, -1.8, tau);
    for (let y = 0; y < H; y++) SHIFT[y] += Math.round(hold * (14 * Math.sin(y * 0.08 + T * 6) + y * 0.9 * hold));
    fx.wrap = true;
    const u = clamp((tau + 3.2) / 1.6, 0, 1);
    fx.start = Math.round(128 * ease.inCubic(u));
    fx.vbi = u > 0;
    fx.ghost = Math.round(4 * smooth(-3.6, -2.4, tau));
    const s = smooth(-2.0, -1.6, tau);
    if (s > 0) { fx.snow = 0.5; fx.kill = s; }
    return 'track';
  }
  if (tau < 0) {
    fx.snow = 0.5; fx.kill = 1;
    if (tau < -0.55) fx.overlay = 'nosignal';
    else { fx.overlay = 'off'; fx.u = (tau + 0.55) / 0.55; }
    return null;
  }
  if (tau < 0.35) { fx.overlay = 'dot'; fx.u = tau / 0.35; return null; }
  if (tau < 0.8) { fx.overlay = 'on'; fx.u = (tau - 0.35) / 0.45; return null; }
  if (tau < 3.7) {
    bootLog(tau - 0.8, f, T);
    tear(T, 0.04);
    if (tau >= 3.45) { const s = smooth(3.45, 3.6, tau); fx.snow = 0.5; fx.kill = s; }
    return null;
  }
  drawTime(B, ox, oy);
  if (tau < 5.3) {
    // The new picture rolls in on the start line, three turns, slowing.
    const u = (tau - 3.7) / 1.6;
    fx.start = Math.round(192 * (1 - ease.outCubic(u)));
    fx.vbi = true;
    tear(T, 0.5 * (1 - u));
    fx.ghost = Math.round(4 * (1 - u));
    const s = 1 - smooth(3.7, 3.85, tau);
    if (s > 0) { fx.snow = 0.5; fx.kill = s; }
    return 'track';
  }
  const k = tau - 5.3;
  fx.start = Math.round(5 * Math.exp(-k * 4) * Math.sin(k * 16));
  fx.vbi = fx.start !== 0;
  fx.ghost = Math.round(2 * (1 - smooth(5.3, 6.4, tau)));
  for (const [st, dx] of [[5.9, 4], [6.3, -3]])
    if (tau >= st && tau < st + 0.05) { for (let y = TOP - 1; y < TOP + GH + 1; y++) SHIFT[y] += dx; fx.ghost = 3; }
  return tau < 6.2 ? 'track' : 'play';
}

/** What is drawn over the composed picture: the NO SIGNAL card and the tube switching off and on. */
function overlay(g, fx) {
  const u = fx.u;
  if (fx.overlay === 'nosignal') {
    g.fillRect(40, 24, 48, 15, 0);
    g.rect(41, 25, 46, 13, 1);
    g.text('NO SIGNAL', 47, 29, { font: font3x5 });
  } else if (fx.overlay === 'off') {
    if (u < 0.6) {
      // The picture is squeezed into a line, getting brighter as it goes.
      const hh = Math.max(0.6, 32 * (1 - ease.inCubic(u / 0.6)));
      const boost = 0.6 * (1 - hh / 32);
      for (let y = 0; y < H; y++) {
        const inside = Math.abs(y + 0.5 - 32) < hh;
        for (let x = 0; x < W; x++) {
          const i = y * W + x;
          if (!inside) g.buf[i] = 0;
          else if (hash(x, y, fx.fi + 3) < boost) g.buf[i] = 1;
        }
      }
    } else {
      g.clear();
      const v = (u - 0.6) / 0.4, w = 64 * (1 - ease.inCubic(v)) + 1;
      g.fillRect(Math.round(64 - w), 31, Math.round(2 * w), 2, 1);
    }
  } else if (fx.overlay === 'dot') {
    g.clear();
    const r = 2.4 * (1 - u) + 0.4;
    g.fillWhere((px, py) => ((px - 64) ** 2 + (py - 32) ** 2 <= r * r ? 1 - u * 0.8 : false), 1, [58, 26, 12, 12]);
  } else if (fx.overlay === 'on') {
    g.clear();
    const hh = Math.max(1, 32 * ease.outCubic(u));
    const lv = 0.85 * (1 - u) ** 2;
    for (let y = 0; y < H; y++) {
      if (Math.abs(y + 0.5 - 32) >= hh) continue;
      const solid = hh < 2.5;
      for (let x = 0; x < W; x++) if (solid || dither(x, y, lv)) g.buf[y * W + x] = 1;
    }
  }
}

// ------------------------------------------------------------ the design

export default {
  name: 'Glitch',
  blurb: 'A VHS tape coming apart: scanlined techno digits pixel-sorted, torn and rolled on the start line into the next minute; a channel change, power cycle and reboot on the hour.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,

  frame(g, { date, fields: f, oled, night }) {
    const T = date.getTime() / 1000;
    const fi = Math.floor(T * 60) % 2000000000;
    P.clear(); SHIFT.fill(0); SPARK.fill(0);
    const fx = { ghost: 0, snow: 0, kill: 0, wrap: false, fi, start: 0, vbi: false, overlay: null, u: 0 };
    const late = f.sec >= 50;
    const from = late ? f : previousMinute(date);
    const to = late ? clockFields(new Date(date.getTime() + 60000)) : f;
    const tau = late ? f.sec - 60 : f.sec;
    const A = digitsOf(from), B = digitsOf(to);
    const hour = to.m === 0;
    const seed = to.minuteKey % 9973;
    const [ox, oy] = orbit(date, 1, 3);

    let mode = 'play';
    if (hour && tau >= H_START && tau < H_END) mode = hourShow(tau, T, A, B, f, fx, seed, ox, oy);
    else if (!hour && tau >= -4.5 && tau < 2.8) mode = minuteShow(tau, T, A, B, fx, seed, ox, oy);
    else { drawTime(digitsOf(f), ox, oy); micro(T, 0.22, fx); }
    tapeNoise(T, fi);
    if (mode) osd(f, date, ox, oy, mode, T);
    if (fx.vbi) blanking(fi);
    compose(g, fx);
    overlay(g, fx);
    oled.startLine(fx.start);
    oled.contrast(0xcf + (0x20 - 0xcf) * night);
  },
};
