// Turntable — the time cut into the vinyl.
//
// Straight down onto a record on its platter, close enough that the disc runs
// off the top and bottom of the glass. The time is not printed on the vinyl:
// it is *cut* into it. Every stroke of every numeral is a little ribbon of
// grooves — three fine concentric lines following the stroke — bright where
// the cutting catches the light, so the time reads as a groove you could put
// a stylus in. Around them the vinyl is black and the label, the run-out and
// the rim are cut as bare rings; the record turns, and its whole surface is
// crossed by two broad sheens that swing round every 1.8 seconds, and the
// platter's strobe dots run past the edges.
//
// The tonearm reaches in from the right, its stylus riding in from the rim as
// the minute runs out; where the stylus stands is the second. Every minute it
// lifts and drops back a track with a crackle of static.
//
// The minute is the re-cut. The digit that changes comes apart: each ribbon
// of grooves unbends, its radius settling to one side of the stroke's, its
// points spacing out evenly round the disc, until the numeral is only more
// vinyl — a groove like any other, carrying nothing. Then, out of the same
// black, the new numeral's ribbons draw themselves back out of the rings and
// settle into the stroke. So nothing is ever half-written: between the two
// numerals the surface simply has no time on it at all.
//
// The hour is a new side: the arm sweeps right out to the rim and the record
// spins up, the sheen whipping round, before the whole line of sorts is cut
// again and the arm drops back to the first track.
//
// Burn-in: the whole disc walks a 5x5 orbit; 23:00-07:00 the panel dims.

import { dither, clamp, ease, progress, clockFields, previousMinute, orbit, noise } from '../js/kit.js';

const W = 128, H = 64;
const CX = 64, CY = 34, R_REC = 57, R_PLAT = 60;
const R_LABEL = 5, R_RUNOUT = 16;
// The hours are cut fine and small at the left of the label; the minutes are
// cut bold and big at the right of it. A record's own hierarchy.
const SLOT = [
  { x: 22, y: 25, w: 16, h: 24, offs: [-1, 1] },
  { x: 40, y: 25, w: 16, h: 24, offs: [-1, 1] },
  { x: 72, y: 19, w: 22, h: 30, offs: [-2, 0, 2] },
  { x: 97, y: 19, w: 22, h: 30, offs: [-2, 0, 2] },
];

const R = Math.PI / 180;
const TAU = Math.PI * 2;

// ------------------------------------------------------------ the letterform
// A wide geometric monoline — a record's own engraving hand. Each digit is a
// list of centre-lines in a 20 x 30 box; a stroke is cut as a 5-unit ribbon.

function arcP(cx, cy, rx, ry, a0, a1, n = 20) {
  const p = [];
  for (let i = 0; i <= n; i++) {
    const a = (a0 + ((a1 - a0) * i) / n) * R;
    p.push([cx + rx * Math.sin(a), cy - ry * Math.cos(a)]);
  }
  return p;
}
const ell = (cx, cy, rx, ry) => arcP(cx, cy, rx, ry, 0, 360, 30);

const SKEL = {
  0: [ell(10, 15, 7.5, 12.5)],
  1: [[[10.5, 30], [10.5, 2.5]], [[10.5, 2.5], [5.5, 7.5]]],
  2: [[...arcP(10, 9, 7.5, 7, 200, 460), [2.5, 27.5], [17.5, 27.5]]],
  3: [arcP(10, 8.5, 7.5, 6.5, 300, 495), arcP(10, 21, 8, 7.5, 45, 215)],
  4: [[[17, 30], [17, 2.5], [3, 20.5], [18.5, 20.5]]],
  5: [[[17.5, 2.5], [3, 2.5], [3.5, 13]], arcP(10, 20, 7.5, 7, 285, 510)],
  6: [ell(10, 19, 7.5, 8.5), [[2.5, 15], [2.5, 8], [12, 2.5]]],
  7: [[[3, 2.5], [17.5, 2.5], [8, 27.5]]],
  8: [ell(10, 8, 6.5, 6), ell(10, 21.5, 7.5, 8)],
  9: [ell(10, 11, 7.5, 8), [[17.5, 10], [17.5, 22], [11, 27.5]]],
};

/** Resample a polyline to `n` points. */
function resample(pts, n) {
  const d = [0];
  for (let i = 1; i < pts.length; i++) d.push(d[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = d[d.length - 1] || 1, out = [];
  for (let k = 0, j = 1; k < n; k++) {
    const at = (total * k) / (n - 1);
    while (j < d.length - 1 && d[j] < at) j++;
    const u = (at - d[j - 1]) / (d[j] - d[j - 1] || 1);
    out.push([pts[j - 1][0] + (pts[j][0] - pts[j - 1][0]) * u, pts[j - 1][1] + (pts[j][1] - pts[j - 1][1]) * u]);
  }
  return out;
}

/**
 * Every cut line of one digit, in the sort's own box: the centre-lines of the
 * strokes, off set sideways by each of `offs` (in glyph units) so a bold
 * numeral is a ribbon of three grooves and a fine one a single hairline.
 */
function cuts(d, offs) {
  const lines = [];
  for (const stroke of SKEL[d]) {
    const p = resample(stroke, 22);
    for (let i = 0; i < p.length; i++) {
      const a = p[Math.max(0, i - 1)], b = p[Math.min(p.length - 1, i + 1)];
      const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
      p[i].nx = -dy / l; p[i].ny = dx / l;                 // the normal, across the cut
    }
    for (const o of offs) lines.push(p.map((q) => [q[0] + q.nx * o, q[1] + q.ny * o]));
  }
  return lines;
}
const RIB = SLOT.map((sl) => ({
  k: sl.w / 20,
  lines: Array.from({ length: 10 }, (_, d) => cuts(d, sl.offs).map((ln) =>
    ln.map(([x, y]) => [sl.x + x * (sl.w / 20), sl.y + y * (sl.h / 30)]))),
}));

// Each cut line's polar form about the record's centre: where it sits, and
// where it goes when the numeral is unwritten (a plain ring of vinyl).
for (const kind of RIB)
  for (const lines of kind.lines)
    for (const ln of lines) {
      ln.rad = ln.map(([x, y]) => Math.hypot(x - CX, y - CY));
      ln.ang = ln.map(([x, y]) => Math.atan2(x - CX, CY - y));
      ln.rbar = ln.rad.reduce((a, b) => a + b, 0) / ln.rad.length;
      ln.a0 = ln.ang[0];
    }

// ------------------------------------------------------------ the disc itself

// The angle and radius of every pixel from the spindle, tabulated once.
const ANG = new Float32Array(W * H), RAD = new Float32Array(W * H);
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    const dx = x + 0.5 - CX, dy = CY - (y + 0.5);
    ANG[y * W + x] = Math.atan2(dx, dy);
    RAD[y * W + x] = Math.hypot(dx, dy);
  }

/** Two broad sheens swinging round the vinyl; `extra` is the hour's spin-up. */
function sheen(g, T, extra) {
  const a0 = (T / 1.8 + extra) * TAU;
  const x0 = Math.max(0, Math.floor(CX - R_REC)), x1 = Math.min(W, Math.ceil(CX + R_REC));
  const y0 = Math.max(0, Math.floor(CY - R_REC)), y1 = Math.min(H, Math.ceil(CY + R_REC));
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const i = y * W + x;
      const r = RAD[i];
      if (r > R_REC) continue;
      // Three radial streaks of glare, the way a light shows in a record's
      // grooves; they turn with the disc.
      const a = ANG[i];
      // The light a ceiling lamp throws across a record: a broad fan in which
      // the grooves themselves come up bright, the way vinyl behaves. The fan
      // turns with the disc, so it is the disc you see turning.
      let dd = (a - a0) % TAU;
      if (dd > Math.PI) dd -= TAU;
      if (dd < -Math.PI) dd += TAU;
      let d2 = (dd - Math.PI) % TAU;
      if (d2 > Math.PI) d2 -= TAU;
      if (d2 < -Math.PI) d2 += TAU;
      if (Math.min(Math.abs(dd), Math.abs(d2)) > 18 * R) continue;
      if (!((r % 4) < 1.1)) continue;                       // the grooves themselves
      // keep the glare out of the cut numerals, so they stay legible
      let clear = true;
      for (const sl of SLOT)
        if (x + 1 >= sl.x && x <= sl.x + sl.w && y + 1 >= sl.y && y <= sl.y + sl.h) { clear = false; break; }
      if (clear) g.pixel(x, y, 1);
    }
}

/** The rings cut in the vinyl: the rim, the run-out, the label, the spindle. */
function rings(g, T, ox, oy, wave) {
  const cx = CX + ox, cy = CY + oy;
  g.ring(cx, cy, R_REC - 1, R_REC, 1);
  g.ring(cx, cy, R_REC + 1, R_REC + 1, 1);
  g.ring(cx, cy, R_LABEL, R_LABEL, 1);
  g.ring(cx, cy, 2.5, 2.5, 1);

  // the platter's edge with its strobe dots, running past the record
  const st = T / 1.8;
  for (let k = 0; k < 90; k++) {
    const a = ((k / 90) + st) * TAU;
    const px = Math.round(cx + (R_PLAT - 1) * Math.sin(a)), py = Math.round(cy - (R_PLAT - 1) * Math.cos(a));
    if (px >= 0 && px < W && py >= 0 && py < H) g.pixel(px, py, 1);
  }
  if (wave > 0) {
    // the hour's shock: a ring running out from the spindle
    const rr = 6 + 52 * ease.outCubic(clamp(wave, 0, 1));
    g.ring(cx, cy, rr, rr + 1.4, 1);
  }
}

// ------------------------------------------------------------ the tonearm

/**
 * The arm, reaching in from the right. `r` is where the stylus sits, `lift`
 * raises it, and `swing` is the hour's sweep out to the rim.
 */
function tonearm(g, r, lift, ox, oy, spark) {
  const px = 122 + ox, py = 20 + oy;
  const ang = (10 + 3 * (1 - r / 31)) * R;        // the arm swings as the stylus runs in
  const sx = CX + ox + r * Math.sin(ang), sy = CY + oy - r * Math.cos(ang);
  const up = lift * 4;
  const bx = sx, by = sy - up;
  // the pipe, the headshell and the stylus
  g.thickLine(px, py, bx, by, 1.8, 1);
  const hx = bx + (px - bx) * 0.06, hy = by + (py - by) * 0.06;
  g.thickLine(hx, hy, bx + (px - bx) * 0.12, by + (py - by) * 0.12, 4.4, 1);
  g.fillRect(Math.round(bx) - 2, Math.round(by) - 1, 5, 4, 1);
  if (lift < 0.6) { g.pixel(bx - 1, sy + 2, 1); g.pixel(bx, sy + 2, 1); }
  // the pivot, its counterweight and the cue lever
  g.circle(px, py, 4, 1);
  g.circle(px, py, 1.6, 1);
  const cw = 12 / Math.hypot(px - bx, py - by);
  g.thickLine(px, py, px + (px - bx) * cw, py + (py - by) * cw, 3, 1);
  // the crackle of the jump
  if (spark > 0) {
    for (let i = 0; i < 14; i++) {
      const a = noise(i, 7) * TAU, d = 3 + noise(i, 11) * 11;
      const bx = Math.round(sx + Math.cos(a) * d), by = Math.round(sy + Math.sin(a) * d);
      if (spark > noise(i, 13)) g.pixel(bx, by, 1);
    }
  }
}

// ------------------------------------------------------------ the design

const MIN_OUT = -1.9, MIN_IN = 0.9;      // when the old cut unwrites, the new writes
const HOUR_OUT = -3.6, HOUR_IN = 1.6;

export default {
  name: 'Turntable',
  blurb: 'The time cut into the vinyl as ribbons of grooves; the record turns under a swinging sheen, and every minute the old numeral unbends into plain rings and the new one is cut.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  driver: 'full',

  frame(g, { date, fields: f, oled, night }) {
    const T = date.getTime() / 1000;
    const late = f.sec >= 52;
    const from = late ? f : previousMinute(date);
    const to = late ? clockFields(new Date(date.getTime() + 60000)) : f;
    const tau = late ? f.sec - 60 : f.sec;
    const [ox, oy] = orbit(date, 2, 4);

    const fromD = from.hh + from.mm, toD = to.hh + to.mm;
    const hourTurn = to.m === 0 && tau < 9 && tau > -7;

    // The hour gets the whole line re-cut and the arm swept back to the rim.
    const out0 = hourTurn ? HOUR_OUT : MIN_OUT, in1 = hourTurn ? HOUR_IN : MIN_IN;
    const unwrite = ease.inOutCubic(progress(tau, out0, out0 + 0.9));
    const rewrite = ease.inOutCubic(progress(tau, in1 - 0.9, in1));
    // The stylus runs in from the first track as the minute goes, and the hour
    // takes it right back out to the rim.
    const secF = clamp((tau < 0 ? 60 + tau : tau) / 60, 0, 1);
    const sweep = hourTurn ? ease.inOutCubic(progress(tau, -3.0, 0.4)) * (1 - ease.inOutCubic(progress(tau, 1.0, 3.4))) : 0;
    const rStylus = 27 + 7 * (1 - secF) + 26 * sweep;
    const lift = Math.max(progress(tau, out0 + 0.5, out0 + 0.9) * (1 - progress(tau, in1 - 0.3, in1 + 0.1)),
      sweep > 0.02 ? 1 : 0);
    const spark = Math.max(0, 1 - Math.abs(tau + 0.05) / 0.35) * (tau > -0.45 && tau < 0.35 ? 1 : 0);
    const spinUp = 1.6 * ease.outCubic(progress(tau, -2.6, 0)) * (1 - ease.inOutCubic(progress(tau, 0.6, 3.0)));

    sheen(g, T, spinUp);
    rings(g, T, ox, oy, hourTurn ? ease.outCubic(progress(tau, -0.2, 1.1)) * (1 - progress(tau, 1.2, 1.6)) : 0);

    // The line of numerals, cut in the vinyl.
    for (let k = 0; k < 4; k++) {
      const isNew = fromD[k] !== toD[k];
      const kk = isNew ? clamp(unwrite - rewrite, 0, 1) : 0;         // 1 = bare rings, 0 = cut
      const kind = RIB[k];
      const lines = kind.lines[+((isNew && tau < 0 ? fromD : toD)[k])];
      for (const ln of lines) {
        let px = 0, py = 0;
        for (let i = 0; i < ln.length; i++) {
          const x = ln[i][0] + ox, y = ln[i][1] + oy;
          const a = ln.ang[i], a1 = ln.a0 + (TAU * i) / (ln.length - 1);
          const th = a + (a1 - a) * kk;
          const rr = ln.rad[i] + (ln.rbar - ln.rad[i]) * kk;
          const qx = CX + rr * Math.sin(th), qy = CY - rr * Math.cos(th);
          const fx = x + (qx - x) * kk, fy = y + (qy - y) * kk;
          if (i) g.line(px, py, fx, fy, 1);
          px = fx; py = fy;
        }
      }
    }

    // The colon: two cuts on the spindle's axis.
    if (rewrite < 0.98 || !hourTurn) {
      const ck = hourTurn ? 1 - rewrite : 1;
      for (const cy of [CY - 9, CY + 9]) {
        for (let i = 0; i < 3; i++)
          g.line(CX - 1 + ox + i, cy - 1 + oy, CX - 1 + ox + i, cy + 1 + oy, 1);
        g.line(CX - 2 + ox, cy + oy, CX + 2 + ox, cy + oy, 1);
        if (ck < 1) g.rect(CX - 2 + ox, cy - 2 + oy, 5, 5, 1);
      }
    }

    tonearm(g, rStylus, lift, ox, oy, spark);

    oled.contrast(0xcf + (0x20 - 0xcf) * night);
  },
};
