// Typewriter — every minute, the time is typed.
//
// The 128x32 strip is the sheet in the machine, seen at the printing point.
// The type is drawn here: a monoline slab serif after the typewriter faces
// (Courier, Olivetti's Pica), every stroke the same 2.8 px, round
// terminals, flat slab feet, a plain oval 0, 13 x 19 px on a 15 px pitch.
// Monospaced, so the colon takes a whole cell, as on a real machine.
//
// From :00 the keys are struck at a typist's uneven pace. Each strike: the
// key's typebar swings up out of the basket (each key from its own angle,
// 1 at the far left of the fan, 0 at the right) on a dark keyline, its slug
// hits the printing point, falls back; the character is there, and the
// carriage escapes one cell to the left. The printing point stays put and
// the paper moves, so the line grows leftwards into place, centred once
// the last digit is down, and the bell rings for the margin. Every strike
// inks differently: a pressure and a tilt per character (from noise of the
// minute key) thin one side of a light strike to a dotted print, and the
// type sits up to a pixel off the line.
//
// The minute turn is the return lever: from :59.15 the platen rolls one
// line up while the carriage is thrown back, so the old line leaves up and
// to the right, and the next line waits blank. The roll is the controller's
// own: the 128x32 still has 64 rows of RAM, each minute's line lives in
// one half of it (alternating), and the display start line walks 32 rows
// from one half to the other, one command byte a frame and no tearing.
//
// The hour: the sheet is pulled out (accelerating up and away, its bottom
// edge passing, the bare platen behind: a lit rubber cylinder as dither,
// shaded top and bottom), a fresh one is fed in click by click (its top
// edge rising in ratchet steps while the platen's grain turns with it),
// and the time is typed underlined, the typist's way: each character,
// a backspace, an underscore.
//
// Readability: a line is only ever a prefix of the right time while it is
// typed (the old one has rolled away); no typos, no wrong digits.
// Everything comes from the clock: strike times from noise() of the minute
// key, so a still at any instant agrees with the animation. Burn-in: the
// line walks two orbits (±2 px each way), the ink and baseline vary every
// minute; at night (ctx.night) the panel dims.

import { noise, orbit, clamp, ease, progress, segDist, dither, OFF } from '../js/kit.js';

// ------------------------------------------------------------ the typeface

const CW = 13, CH = 19, CELL_H = 24;   // glyph box; rows to 23 hold the underscore
const PITCH = 15;
const STROKE = 2.8;

/** Uniform Catmull-Rom through `pts` (closed if the ends meet). */
function spline(pts, n = 8) {
  const closed = pts.length > 3 && Math.hypot(pts[0][0] - pts.at(-1)[0], pts[0][1] - pts.at(-1)[1]) < 1e-6;
  const P = closed ? [pts.at(-2), ...pts, pts[1]]
    : [[2 * pts[0][0] - pts[1][0], 2 * pts[0][1] - pts[1][1]], ...pts, [2 * pts.at(-1)[0] - pts.at(-2)[0], 2 * pts.at(-1)[1] - pts.at(-2)[1]]];
  const out = [];
  for (let i = 1; i < P.length - 2; i++)
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t3);
      out.push([f(P[i - 1][0], P[i][0], P[i + 1][0], P[i + 2][0]), f(P[i - 1][1], P[i][1], P[i + 1][1], P[i + 2][1])]);
    }
  out.push([...pts.at(-1)]);
  return out;
}
/** An ellipse as points, closed, from the top clockwise. */
const oval = (cx, cy, rx, ry, n = 16) => Array.from({ length: n + 1 }, (_, i) => {
  const a = (i / n) * 2 * Math.PI;
  return [cx + rx * Math.sin(a), cy - ry * Math.cos(a)];
});

// Centre-lines in the 13 x 19 box, baseline at 17.6. S = smooth, L = straight.
const S = (...p) => spline(p), L = (...p) => p;
const FORMS = {
  0: { strokes: [spline(oval(6.5, 9.5, 4.5, 8.1))] },
  1: { strokes: [L([3.0, 4.2], [6.6, 1.5], [6.6, 17.6]), L([2.6, 17.6], [10.6, 17.6])] },
  2: { strokes: [S([2.2, 5.2], [3.3, 2.3], [6.4, 1.4], [9.6, 2.3], [10.8, 5.2], [9.6, 8.8], [6, 12.6], [2.2, 17.4]), L([2.2, 17.5], [11.2, 17.5], [11.2, 15])] },
  3: { strokes: [S([2.4, 3.8], [4.8, 1.6], [8.4, 1.6], [10.4, 4.3], [9.4, 7.5], [6, 8.9]),
    S([6, 8.9], [9.6, 9.9], [11.1, 13.2], [9.6, 16.6], [6.2, 17.6], [2.2, 16.2])] },
  4: { strokes: [L([8.4, 17.6], [8.4, 1.6], [1.6, 12.6], [11.6, 12.6]), L([5.4, 17.6], [11.4, 17.6])] },
  5: { strokes: [L([10.6, 1.6], [3.4, 1.6], [3.0, 8.6]), S([3.0, 8.6], [6.4, 7.3], [9.6, 8.3], [11.1, 12], [10.1, 16], [6.6, 17.6], [2, 16.4])] },
  6: { strokes: [S([10.2, 3.2], [7.8, 1.5], [4.6, 2.0], [2.5, 5.6], [1.9, 10.6], [2.6, 15.3], [5.6, 17.6], [9, 17.2], [11.1, 14], [10.6, 10.8], [8, 8.8], [5, 9], [2.3, 11.8])] },
  7: { strokes: [L([1.8, 4.4], [1.8, 1.6], [11.2, 1.6], [5.6, 17.6])] },
  8: { strokes: [spline(oval(6.5, 5.0, 3.7, 3.6)), spline(oval(6.5, 13.3, 4.6, 4.3))] },
  9: { strokes: [S([2.8, 16.0], [5.2, 17.6], [8.4, 17.0], [10.4, 13.4], [11.1, 8.4], [10.4, 3.7], [7.6, 1.5], [4.4, 1.8], [2.0, 4.6], [2.0, 8.0], [4.4, 10.2], [7.6, 10.2], [10.7, 7.4])] },
  ':': { strokes: [], dots: [[6.5, 6.6, 1.9], [6.5, 15.8, 1.9]] },
  _: { strokes: [L([0.4, 23.0], [12.6, 23.0])] },
};

/** A character rasterised once: its bits in a 13 x 24 box. */
const GLYPHS = new Map();
function glyph(ch) {
  if (GLYPHS.has(ch)) return GLYPHS.get(ch);
  const F = FORMS[ch], bits = new Uint8Array(CW * CELL_H);
  for (let y = 0; y < CELL_H; y++)
    for (let x = 0; x < CW; x++) {
      const px = x + 0.5, py = y + 0.5;
      let on = (F.dots ?? []).some(([cx, cy, r]) => Math.hypot(px - cx, py - cy) <= r);
      for (const s of F.strokes)
        for (let k = 1; k < s.length && !on; k++) on = segDist(px, py, s[k - 1][0], s[k - 1][1], s[k][0], s[k][1]) <= STROKE / 2;
      bits[y * CW + x] = on ? 1 : 0;
    }
  GLYPHS.set(ch, bits);
  return bits;
}

/**
 * One strike of the type at (x, y): its own pressure and tilt (a typebar
 * never lands quite flat), so a light strike prints dotted at one side.
 */
function strikeChar(g, ch, x, y, seed) {
  const bits = glyph(ch);
  const p = 0.86 + 0.3 * noise(seed, 1);
  const bounce = noise(seed, 5) < 0.12;      // the bar bounced: a faint echo a pixel right
  const tx = (noise(seed, 2) - 0.5) * 0.55, ty = (noise(seed, 3) - 0.5) * 0.55;
  const dy = ch === '_' ? 0 : Math.round((noise(seed, 4) - 0.5) * 2.2);
  for (let j = 0; j < CELL_H; j++)
    for (let i = 0; i < CW; i++) {
      if (!bits[j * CW + i]) continue;
      const q = p + tx * (i / (CW - 1) - 0.5) * 2 + ty * (Math.min(j, CH - 1) / (CH - 1) - 0.5) * 2;
      if (noise(i * 7.7 + j * 31.3, seed % 9973) < q) g.pixel(x + i, y + j + dy);
      if (bounce && dither(i + 3, j, 0.3)) g.pixel(x + i + 1, y + j + dy);
    }
}

// ------------------------------------------------------------ the typist

const ESCAPE = 0.03, SNAP = 0.03;      // carriage escapes this long after the strike, in this long
const BAR_UP = 0.055, BAR_DOWN = 0.09; // typebar swing
const LF = [59.15, 59.7], CR = [59.2, 59.55];
const PULL = [58.35, 58.95], FEED = [59.05, 59.85], CLICKS = 10, CLICK = 4;

/**
 * This minute's keystrokes: [kind, char, cell, t]. The time at a typist's
 * uneven pace (a breath after the hours); on the hour each character is
 * followed by a backspace and an underscore.
 */
const SCHEDULES = new Map();
function schedule(text, key, hour) {
  const id = `${key}${hour}`;
  if (SCHEDULES.has(id)) return SCHEDULES.get(id);
  const ev = [];
  let t = 0.12;
  for (let k = 0; k < 5; k++) {
    ev.push({ kind: 'strike', ch: text[k], cell: k, t });
    t += 0.13 + 0.14 * noise(key % 9973, 10 + k) + (k === 1 ? 0.1 : 0);
    if (hour) {
      // Underlined as typed, one character at a time, so the carriage never
      // backs off more than a cell and the line stays on the glass.
      ev.push({ kind: 'back', t: t - 0.04 });
      t += 0.1;
      ev.push({ kind: 'strike', ch: '_', cell: k, t });
      t += 0.12 + 0.06 * noise(key % 9973, 30 + k);
    }
  }
  if (SCHEDULES.size > 8) SCHEDULES.clear();
  SCHEDULES.set(id, ev);
  return ev;
}

/** Carriage position (cells escaped) at `sec`. */
function carriage(ev, sec) {
  let c = 0;
  for (const e of ev) {
    if (e.kind === 'strike') c += ease.outQuad(progress(sec, e.t + ESCAPE, e.t + ESCAPE + SNAP));
    else c -= ease.outQuad(progress(sec, e.t, e.t + SNAP + 0.01));
  }
  return c;
}

/** The typed line as it stands at `sec`, its cell 0 at x0 + carriage offset. */
function drawLine(g, ev, sec, key, x0, y0, c) {
  const px = Math.round(x0 - PITCH * c);
  ev.forEach((e, k) => {
    if (e.kind === 'strike' && sec >= e.t) strikeChar(g, e.ch, px + e.cell * PITCH, y0, key * 31 + k);
  });
}

// Keyboard position of each key, 0 (far left of the typebar fan) to 10.
const KEY_AT = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6, 8: 7, 9: 8, 0: 9, ':': 8.6, _: 10.2 };
const BAR_R = 62;

/**
 * A typebar swung `u` of the way from the basket (0) to the printing point
 * (1). It swings in the plane through its pivot and the printing point, so
 * from the front it is foreshortened: a bar shooting up its own line from
 * below the glass to the point.
 */
function typebar(g, ch, sx, sy, u) {
  const phi = -0.62 + 1.24 * (KEY_AT[ch] ?? 5) / 10.2;
  const px = sx + BAR_R * Math.sin(phi), py = sy + BAR_R * Math.cos(phi);
  const k = 0.45 + 0.55 * Math.sin((u * Math.PI) / 2);
  const tx = px + (sx - px) * k, ty = py + (sy - py) * k;
  g.thickLine(px, py, tx, ty, 5, OFF);     // keyline
  g.thickLine(px, py, tx, ty, 2.2);
  g.fillRect(Math.round(tx - 3), Math.round(ty - 4), 7, 9, OFF);
  g.fillRect(Math.round(tx - 2), Math.round(ty - 3), 5, 7);   // the slug
}

// The margin bell, as an outline (a filled one reads as an arrowhead at 9 px).
const BELL = [
  '....#....',
  '...###...',
  '..##.##..',
  '..#...#..',
  '..#...#..',
  '.##...##.',
  '#########',
];
/** The margin bell, struck `v` seconds ago: it rocks, its clapper swings, ring marks either side. */
function bell(g, x, y, v) {
  const decay = Math.exp(-v * 5), sw = Math.sin(v * 38) * decay;
  const lean = Math.round(sw * 1.4);
  BELL.forEach((row, j) => {
    const dx = Math.round(lean * (j / 6));
    for (let i = 0; i < row.length; i++) if (row[i] === '#') g.pixel(x + i + dx, y + j);
  });
  g.pixel(x + 4 + Math.round(-sw * 1.6), y + 7);            // the clapper
  if (v < 0.45 && Math.floor(v * 14) % 2 === 0)
    for (const s of [-1, 1]) {
      const cx = x + 4 + s * 7;
      g.pixel(cx, y + 1); g.pixel(cx + s, y + 2); g.pixel(cx + s, y + 3); g.pixel(cx + s, y + 4); g.pixel(cx, y + 5);
    }
}

/** The bare platen: a rubber cylinder, lit in the middle, its grain turned by `rot`. */
function platen(g, top, y0, y1, rot) {
  for (let y = Math.max(0, Math.ceil(y0)); y < Math.min(32, y1); y++) {
    const level = 0.06 + 0.2 * Math.sin((Math.PI * (y + 0.5)) / 32);
    for (let x = 0; x < 128; x++) if (dither(x, y + rot, level)) g.pixel(x, top + y);
  }
}

// ------------------------------------------------------------ the face

const DAY = 0xaf, NIGHT = 0x10;
const SPX = 100, TOP = 6;      // printing cell's left edge; top of the type, in a half

/** The minute's typing in the half at `top`: the line, the typebar, the bell. */
function typing(g, f, key, top, x0, y0) {
  const sec = f.sec, hourIn = f.m === 0;
  const ev = schedule(`${f.hh}:${f.mm}`, key, hourIn);
  g.clip(0, top, 128, 32);
  drawLine(g, ev, sec, key, x0, top + y0, carriage(ev, sec));
  for (const e of ev) {
    if (e.kind !== 'strike' || sec < e.t - BAR_UP || sec > e.t + BAR_DOWN) continue;
    const u = sec < e.t ? ease.inQuad(progress(sec, e.t - BAR_UP, e.t)) : 1 - ease.outQuad(progress(sec, e.t, e.t + BAR_DOWN));
    typebar(g, e.ch, x0 + CW / 2, top + y0 + 9.5, u);
  }
  const last = ev.filter((e) => e.kind === 'strike').at(-1).t + ESCAPE;
  if (sec >= last && sec < last + 0.7) bell(g, 114, top + 1, sec - last);   // the bell is the machine's, it does not orbit
  g.unclip();
}

export default {
  name: 'Typewriter',
  blurb: '128x32: every minute a typewriter types the time, then throws the carriage back; a fresh sheet on the hour.',
  module: '091-128x32',
  colour: 'white',
  bus: 'i2c400',
  fps: 50,
  driver: 'dirty',
  ramPages: 8,          // each minute's line lives in its own half of the 64 RAM rows

  frame(g, { fields: f, date, oled, night }) {
    const sec = f.sec, key = f.minuteKey;
    const half = (key % 2) * 32, other = 32 - half;
    const ox = orbit(date, 2, 3)[0], oy = orbit(new Date(date.getTime() + 5 * 60000), 2, 4)[1];
    const x0 = SPX + ox, y0 = TOP + oy;
    const hourOut = f.m === 59;
    oled.contrast(DAY + (NIGHT - DAY) * night);

    if (hourOut && sec >= PULL[0]) {
      // The sheet is pulled out and a fresh one fed in, drawn in the half
      // the next minute will type in.
      const ev = schedule(`${f.hh}:${f.mm}`, key, false);
      const s = 78 * ease.inQuad(progress(sec, PULL[0], PULL[1]));
      const c = 5 * (1 - ease.inOutQuad(progress(sec, PULL[0] + 0.15, PULL[1])));
      oled.startLine(other);
      g.clip(0, other, 128, 32);
      if (sec < PULL[1]) {
        drawLine(g, ev, sec, key, x0, other + y0 - Math.round(s), c);
        const edge = Math.round(38 - s);                  // the sheet's bottom edge
        if (edge < 32) { platen(g, other, edge + 1, 32, 0); if (edge >= 0) g.hline(0, other + edge, 128); }
      } else if (sec < FEED[0]) platen(g, other, 0, 32, 0);
      else {
        // Click by click: each ratchet step snaps in the first third of its slot.
        const v = progress(sec, FEED[0], FEED[1]) * CLICKS, k = Math.floor(v);
        const pos = Math.round(CLICK * (Math.min(k, CLICKS) + ease.outQuad(clamp((v - k) * 3, 0, 1)) * (k < CLICKS ? 1 : 0)));
        const edge = 34 - pos;                             // the new sheet's top edge
        if (edge > 0) platen(g, other, 0, edge, pos);
        if (edge >= 0 && edge < 32) g.hline(0, other + edge, 128);
      }
      g.unclip();
      return;
    }

    typing(g, f, key, half, x0, y0);
    if (sec >= LF[0]) {
      // The return lever: the platen rolls a line (start line, half to half)
      // while the carriage is thrown back to the margin.
      const ev = schedule(`${f.hh}:${f.mm}`, key, f.m === 0);
      const c = carriage(ev, 59) * (1 - ease.outCubic(progress(sec, CR[0], CR[1])));
      g.fillRect(0, half, 128, 32, OFF);
      g.clip(0, half, 128, 32);
      drawLine(g, ev, sec, key, x0, half + y0, c);
      g.unclip();
      oled.startLine(half + Math.round(32 * ease.inOutQuad(progress(sec, LF[0], LF[1]))));
    } else oled.startLine(half);
  },
};
