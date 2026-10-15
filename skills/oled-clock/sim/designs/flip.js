// Flip — a split-flap (Solari) clock, with the flap drawn in perspective.
//
// HH:MM are four cards with rounded corners, split across the middle by the
// hinge. When a digit changes, the top half of the old card is released and
// falls towards you: it is drawn by mapping every screen pixel back onto the
// flap through a perspective projection (viewer FOCAL pixels away), so as it
// turns it shortens, its free edge widens as it comes closer, and its face
// darkens into a dither as it tilts away from the light. Past edge-on the
// back of the flap shows, carrying the new digit's lower half, and it lands
// over the old bottom half with a small bounce. The new top half was behind
// it all along.
//
// Minutes cascade right to left, the tens dropping a beat after the ones. On
// the hour the whole board refreshes: every card riffles at speed through a
// full turn of its drum (3 flaps for the tens of hours, 6 for the tens of
// minutes, 10 for the ones) and stops on the new time, in a wave from left to
// right. The seconds are two small cards that flip every second. A leading
// zero on the hours is a blank flap, as on real flip clocks.
//
// Everything is a function of `fields.sec` and the digits of this minute and
// the last; each flap's angle is worked out from its own start time.
//
// The cards are dark, with a lit edge and lit numerals (the airport-board
// look). Lit faces with dark numerals were tried (SKIN = 'lit'): they read
// well, but light over half the glass, glare at night and wear the card areas
// evenly all day. On dark cards the turning flap still shows as a surface: its
// face catches a thin dither as it tilts, and its edge stays solid.
//
// Burn-in: the face walks a 2-pixel orbit and the seconds always move.

import { strokeDigit, font5x7, font3x5, Gfx, dither, roundRectTest, orbit, previousMinute } from '../js/kit.js';

const SKIN = 'dark';                // 'dark' | 'lit'
const FOCAL = 150;                  // viewer distance in pixels, for the perspective
const BIG = { w: 26, h: 42, hinge: 21, r: 4, gap: true, kind: 'big' };
const SMALL = { w: 9, h: 13, hinge: 6, r: 2, gap: false, kind: 'small' };
const CARD_X = [4, 32, 70, 98];
const CARD_Y = 2;
const SEC_Y = 49, SEC_X = [54, 65];

// Timing (seconds).
const FALL = 0.3, BOUNCE = 0.12, BOUNCE_RAD = 0.42;  // one ordinary flip
const RIFFLE = 0.11;                                  // one flap of the hourly riffle
const CARRY = 0.1;                                    // tens drop this long after ones
const WAVE = 0.09;                                    // hourly wave, card to card
const SEC_FALL = 0.16;
const DRUM = [3, 10, 6, 10];                          // flaps on each card's drum
const BLANK = 'blank';                                // the hour-tens card's first flap

// ------------------------------------------------------------ card faces

const faces = new Map();

/**
 * The picture of one whole card showing digit `d`: `lit`, `inside` (within
 * the rounded outline) and `edge` (the outline itself), one byte per pixel.
 * Pure, so it is memoised.
 */
function face(spec, d) {
  const key = `${spec.kind}${d}`;
  if (faces.has(key)) return faces.get(key);
  const { w, h, r } = spec;
  const g = new Gfx(w, h);
  const ink = SKIN === 'lit' ? 0 : 1;
  if (SKIN === 'lit') g.fillRoundRect(0, 0, w, h, r, 1);
  else g.roundRect(0, 0, w, h, r, 1);
  if (spec.kind === 'big') {
    strokeDigit(g, d, 4, 4, w - 8, h - 8, { weight: 5, c: ink });
  } else g.text(String(d), 2, 3, { font: font5x7, c: ink });
  if (spec.gap) g.hline(0, spec.hinge, w, 0);
  const inside = roundRectTest(0, 0, w, h, r), inner = roundRectTest(1, 1, w - 2, h - 2, r - 1);
  const f = { lit: g.buf, inside: new Uint8Array(w * h), edge: new Uint8Array(w * h) };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      f.inside[y * w + x] = inside(x + 0.5, y + 0.5) ? 1 : 0;
      f.edge[y * w + x] = f.inside[y * w + x] && !inner(x + 0.5, y + 0.5) ? 1 : 0;
    }
  faces.set(key, f);
  return f;
}

/** Rows [r0, r1) of a card face, drawn at (x, y). */
function drawRows(g, spec, d, x, y, r0, r1) {
  const f = face(spec, d), w = spec.w;
  for (let j = r0; j < r1; j++)
    for (let i = 0; i < w; i++) {
      const k = j * w + i;
      if (f.inside[k]) g.pixel(x + i, y + j, f.lit[k]);
    }
}

/** The hinge pins: a pixel either side of the card at the split. */
function drawPins(g, spec, x, y) {
  if (!spec.gap) return;
  g.pixel(x - 1, y + spec.hinge).pixel(x + spec.w, y + spec.hinge);
}

/**
 * The flap at angle `th` (0 = up, showing the old top half; PI = down,
 * showing its back, the new bottom half). Every screen pixel near the flap is
 * mapped back to a point on it: for a pixel `dy` from the hinge, the point
 * `dist` along the flap with dy = dist*|cos th| * F/(F - dist*sin th).
 * The face is shaded by how squarely it faces the viewer.
 */
function drawFlap(g, spec, x, y, front, back, th) {
  const { w, hinge } = spec;
  const hy = y + hinge, cx = x + w / 2;
  const up = th < Math.PI / 2;
  const len = up ? hinge : spec.h - hinge;          // length of the flap from the hinge
  const c = Math.abs(Math.cos(th)), s = Math.sin(th);
  const reach = (len * c * FOCAL) / (FOCAL - len * s);
  const spread = FOCAL / (FOCAL - len * s);
  const level = Math.min(1, 0.2 + 1.1 * c);           // the numeral dims as it tilts away
  const plate = 0.28 * (1 - c);                      // the dark card catches the light as it tilts
  const f = face(spec, up ? front : back);
  const x0 = Math.floor(cx - (w / 2) * spread) - 1, x1 = Math.ceil(cx + (w / 2) * spread) + 1;
  const y0 = up ? Math.floor(hy - reach) - 1 : hy, y1 = up ? hy : Math.ceil(hy + reach) + 1;
  for (let py = y0; py < y1; py++) {
    const dy = up ? hy - (py + 0.5) : py + 0.5 - hy;
    if (dy < 0) continue;
    const dist = (dy * FOCAL) / (FOCAL * c + dy * s);
    if (dist > len) continue;
    const sc = FOCAL / (FOCAL - dist * s);
    const row = Math.floor(up ? hinge - dist : hinge + dist);
    if (row < 0 || row >= spec.h) continue;
    for (let px = x0; px < x1; px++) {
      const col = Math.floor(w / 2 + (px + 0.5 - cx) / sc);
      if (col < 0 || col >= w) continue;
      const k = row * w + col;
      if (!f.inside[k]) continue;
      const on = f.edge[k] && SKIN !== 'lit' ? f.lit[k] === 1
        : f.lit[k] ? level >= 1 || dither(px, py, level) : SKIN !== 'lit' && dither(px, py, plate);
      g.pixel(px, py, on ? 1 : 0);
    }
  }
  // The flap's free edge, solid, so its silhouette stays crisp while it turns.
  if (c < 0.995) {
    const ey = Math.round(up ? hy - reach : hy + reach - 1);
    const half = (w / 2 - spec.r) * spread;
    g.hline(Math.round(cx - half), ey, Math.round(2 * half));
  }
}

/** Flap angle `tau` seconds into a flip: gravity from rest, then a bounce. */
function angle(tau, fall, bounce) {
  if (tau < fall) { const u = tau / fall; return Math.PI * (0.35 * u + 0.65 * u * u); }
  if (bounce && tau < fall + BOUNCE) return Math.PI - BOUNCE_RAD * Math.sin(Math.PI * (tau - fall) / BOUNCE);
  return Math.PI;
}

/**
 * A card that runs through `seq` (digits, first to last) with flip k starting
 * at `starts[k]`; `tau` is seconds into the minute (or second). Draws the
 * card and returns its flap, if one is moving, to be drawn after every card:
 * a flap close to edge-on is wider than its card and passes in front of the
 * neighbours.
 */
function drawCard(g, spec, x, y, seq, starts, tau, fall, bounceLast = true) {
  drawPins(g, spec, x, y);
  // Which flip, if any, is in progress.
  let k = -1;
  for (let i = 0; i < starts.length; i++) if (tau >= starts[i]) k = i;
  const last = starts.length - 1;
  const len = (i) => fall + (i === last && bounceLast ? BOUNCE : 0);
  if (k < 0 || tau >= starts[k] + len(k)) {
    const d = seq[k + 1];
    drawRows(g, spec, d, x, y, 0, spec.h);
    return null;
  }
  const a = seq[k], b = seq[k + 1];
  const th = angle(tau - starts[k], fall, k === last && bounceLast);
  drawRows(g, spec, b, x, y, 0, spec.hinge);          // the new top, uncovered
  drawRows(g, spec, a, x, y, spec.hinge, spec.h);     // the old bottom, until covered
  return () => drawFlap(g, spec, x, y, a, b, th);
}

/** The flips one big card makes this minute: its digit sequence and start times. */
function plan(i, from, to, hourTurn) {
  if (hourTurn) {
    // A full turn of the drum plus the step, riffled; a wave left to right.
    const n = ((to - from + DRUM[i]) % DRUM[i]) + DRUM[i];
    const seq = [from], starts = [];
    for (let k = 0; k < n; k++) { seq.push((from + k + 1) % DRUM[i]); starts.push(WAVE * i + k * RIFFLE); }
    return { seq, starts, fall: RIFFLE };
  }
  if (from === to) return { seq: [to], starts: [], fall: FALL };
  return { seq: [from, to], starts: [CARRY * (3 - i)], fall: FALL };
}

const digitsOf = (f) => [...`${f.hh}${f.mm}`].map(Number);

export default {
  name: 'Flip',
  blurb: 'Split-flap cards in perspective: flaps fall, shade and bounce; the board riffles on the hour.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  driver: 'dirty',

  frame(g, { fields: f, date }) {
    const [ox, oy] = orbit(date, 2, 3);
    const now = digitsOf(f), before = digitsOf(previousMinute(date));
    const hourTurn = f.m === 0;
    const flaps = [];
    for (let i = 0; i < 4; i++) {
      const p = plan(i, before[i], now[i], hourTurn);
      // A leading zero is a blank flap, as on real flip clocks.
      if (i === 0) p.seq = p.seq.map((v) => (v === 0 ? BLANK : v));
      flaps.push(drawCard(g, BIG, CARD_X[i] + ox, CARD_Y + oy, p.seq, p.starts, f.sec, p.fall, true));
    }

    // Colon.
    for (const cy of [CARD_Y + BIG.hinge - 8, CARD_Y + BIG.hinge + 6]) g.fillRect(63 + ox, cy + oy, 2, 2);

    // Seconds: two small cards, flipping on the second.
    const frac = f.sec - f.s;
    const s0 = (f.s + 59) % 60;
    const tensFrom = Math.floor(s0 / 10), onesFrom = s0 % 10;
    const tens = Math.floor(f.s / 10), ones = f.s % 10;
    flaps.push(drawCard(g, SMALL, SEC_X[0] + ox, SEC_Y + oy, [tensFrom, tens], tensFrom === tens ? [] : [0], frac, SEC_FALL, false));
    flaps.push(drawCard(g, SMALL, SEC_X[1] + ox, SEC_Y + oy, [onesFrom, ones], [0], frac, SEC_FALL, false));
    for (const flap of flaps) if (flap) flap();

    // Date, either side of the seconds.
    g.text(f.dow, CARD_X[0] + 2 + ox, SEC_Y + 5 + oy, { font: font3x5 });
    const dm = `${f.dd} ${f.month}`;
    g.text(dm, CARD_X[3] + BIG.w - 2 - font3x5.measure(dm) + ox, SEC_Y + 5 + oy, { font: font3x5 });
  },
};
