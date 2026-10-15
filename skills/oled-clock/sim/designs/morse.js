// Morse — the time tapped out and punched into paper tape.
//
// A telegraph bench: a strip of register tape runs across the glass, dark,
// with its two edges and its row of sprocket holes catching the light from
// the lamp behind it. The time is *punched* through the tape, and it is
// punched in the hand of the key itself: every numeral is drawn as a chain of
// telegraph marks — short round dots and long bars — and the rhythm of that
// chain is the numeral's own Morse: the 5 is a chain of nothing but dots, the
// 0 nothing but dashes, the 1 a dot then four dashes, and so on, so each
// digit's marks are literally its own call sign repeated along its skeleton.
//
// Below the tape sit the two brass things: on the left the key, whose lever
// dips once a second (and, on the minute, taps out the new time); on the
// right the sounder, whose armature clacks in answer, and which carries the
// bell that rings the hour. The tape is clamped while a minute runs; at the
// turn the clamp lifts, the tape feeds left by a whole number of sprocket
// pitches — so that the moment the section is changed is invisible, the holes
// landing where they were — and a length of fresh tape comes up under the
// punch. From :00 the punch carriage rides the tape's edge, and each numeral
// is punched mark by mark as the pin passes over it, so the new time writes
// itself on left to right. The old time has gone before :00 and the new one is
// only ever written after it.
//
// On the hour the whole tape is changed: it runs through a long feed, the
// bell on the sounder is struck (ringing rings spread from it), and the new
// time is punched in one heavy pass.
//
// Burn-in: the tape walks a small orbit and the sprocket holes travel with
// it. From 23:00 to 07:00 the panel dims.

import { clamp, ease, progress, orbit, clockFields } from '../js/kit.js';

const TAU = Math.PI * 2;

// ------------------------------------------------------------ the tape

const TAPE_TOP = 7, TAPE_BOT = 48;      // the strip's edges
const SPROCKET_Y = 45;                  // the row of sprocket holes
const SPROCKET_P = 6;                   // their pitch

// The four numerals, left to right. Each sits in a box 24 wide and 34 tall.
const BOX_W = 22, BOX_H = 34, BOX_Y = 9;
const BOX_X = [2, 34, 72, 104];

// ------------------------------------------------------------ the marks
//
// One Morse unit is U pixels. A dot is a disc one unit across, a dash a bar
// three units long; one unit of silence separates them.

const U = 4.2;
const DW = U * 0.8;                 // the width of a mark's stroke
const DOT = (mid, o) => o.push({ k: 'dot', x: mid[0], y: mid[1] });
/** A dash carries the piece of the stroke it covers, so it follows a curve. */
const DASH = (pts, o) => o.push({ k: 'dash', p: pts });

/**
 * A point of an ellipse, as a stroke point. The round numerals are built from
 * these so that a dash laid across a curve follows it.
 */
function ell(cx, cy, rx, ry, n = 22, a0 = 0, a1 = TAU) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    pts.push([cx + rx * Math.sin(a), cy - ry * Math.cos(a)]);
  }
  return pts;
}

/**
 * Every numeral's skeleton, as a list of strokes; each stroke is walked from
 * its start and the numeral's own Morse code is laid along it, mark by mark.
 * Coordinates are inside the box, y down.
 */
const SKELETON = {
  0: [ell(11, 17, 10, 16)],
  1: [
    [[4, 11], [10, 5], [11, 4], [11, 30]],
    [[5, 30], [18, 30]],
  ],
  2: [
    [[2, 9], [4, 4], [9, 2], [15, 2], [19, 6], [20, 11], [17, 17], [11, 23], [5, 28], [2, 30], [3, 31], [20, 31]],
  ],
  3: [
    [[3, 3], [19, 3], [13, 11], [17, 12], [20, 17], [19, 26], [14, 31], [6, 31], [3, 28]],
  ],
  4: [
    [[17, 31], [17, 3], [3, 23], [21, 23]],
  ],
  5: [
    [[20, 3], [5, 3], [4, 15], [10, 13], [16, 16], [19, 22], [16, 30], [8, 31], [3, 27]],
  ],
  6: [
    [[19, 4], [13, 2], [7, 4], [3, 11], [2, 21], [5, 28], [11, 32], [17, 30], [20, 23], [17, 16], [10, 16], [5, 20]],
  ],
  7: [
    [[3, 3], [20, 3], [13, 15], [10, 31]],
  ],
  8: [
    ell(11, 9, 7.5, 7.5, 16, 0, -TAU).concat(ell(11, 25, 8.5, 7, 16, 0, -TAU)),
  ],
  9: [
    ell(11, 11, 8.5, 9.5, 18, 2.6, -TAU + 2.6),
    [[17, 15], [20, 21], [19, 28], [13, 32], [6, 30]],
  ],
};

/** The Morse code of a numeral, as a string of '.' and '-'. */
const CODE = {
  0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-',
  5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.',
};

/** The piece of `stroke` between arc lengths `d0` and `d1`, as a polyline. */
function subPath(stroke, d0, d1) {
  const out = [atStart(stroke, d0)];
  let acc = 0;
  for (let i = 1; i < stroke.length; i++) {
    const a = stroke[i - 1], b = stroke[i];
    acc += Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (acc > d0 && acc < d1) out.push(b);
  }
  out.push(atStart(stroke, d1));
  return out;
}

/** Walk a polyline, returning the point at arc length `d`. */
function atStart(stroke, d) {
  let acc = 0;
  for (let i = 1; i < stroke.length; i++) {
    const a = stroke[i - 1], b = stroke[i];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (acc + len >= d) {
      const t = len ? (d - acc) / len : 0;
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
    acc += len;
  }
  return stroke[stroke.length - 1];
}

const strokeLen = (s) => {
  let L = 0;
  for (let i = 1; i < s.length; i++) L += Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]);
  return L;
};

/**
 * The marks of one numeral: its Morse code repeated along each stroke, taken
 * from the stroke's start, so a chain of dots and dashes draws the numeral.
 */
const MARK_CACHE = new Map();
function marksOf(d) {
  let m = MARK_CACHE.get(d);
  if (m) return m;
  const code = CODE[d];
  m = [];
  for (const stroke of SKELETON[d]) {
    const L = strokeLen(stroke);
    let a = 0;
    let k = 0;
    while (a < L - 0.5) {
      const ch = code[k % code.length];
      const len = ch === '-' ? 3 * U : U;
      const b = Math.min(L, a + len);
      if (b - a >= 2) {
        if (ch === '-') DASH(subPath(stroke, a, b), m);
        else {
          const mid = atStart(stroke, (a + b) / 2);
          DOT(mid, m);
        }
      }
      a = b + U;                                  // one unit of silence
      k++;
    }
  }
  MARK_CACHE.set(d, m);
  return m;
}

// ------------------------------------------------------------ the machine
//
// The key and the sounder, drawn as small brass silhouettes on the bench,
// each with one moving part. Both move on the second.

const KEY = { x: 3, y: 49, w: 44, h: 15 };
const SND = { x: 81, y: 49, w: 44, h: 15 };

/**
 * The key's lever at phase `p` of a press: quick down, slow up, a spring under
 * the fingers. Every tenth second the press is held — a dash among the dots,
 * the way an operator marks the time.
 */
function contacts(p, hold) {
  return p < hold ? Math.sin((Math.PI * p) / hold) : 1 - ease.inOutQuad((p - hold) / (1 - hold));
}

function drawKey(g, press, ox, oy) {
  const { x, y, w, h } = KEY;
  const bx = x + ox, by = y + oy;
  g.fillRect(bx + 2, by + h - 4, w - 4, 3);                     // the base plate
  g.fillRect(bx + 8, by + h - 12, 3, 8);                        // the pivot post
  const knob = [bx + w - 9, by + 3 + 4 * press];
  g.thickLine(bx + 9, by + 4, knob[0], knob[1], 2.2);           // the lever
  g.fillCircle(knob[0], knob[1], 3.4);                          // the knob
  if (press > 0.4) {                                            // the contacts spark
    const f = (press - 0.4) / 0.6;
    g.pixel(bx + 12, by + 6).pixel(bx + 14, by + 8).pixel(bx + 10, by + 8)
      .pixel(bx + 13, by + 4);
    if (f > 0.4) g.pixel(bx + 15, by + 3);
  }
}

function drawSounder(g, clack, ox, oy, strike) {
  const { x, y, w, h } = SND;
  const bx = x + ox, by = y + oy;
  g.fillRect(bx + 1, by + h - 3, w - 2, 3);                     // the base plate
  g.fillRect(bx + 3, by + h - 10, 13, 7);                       // the coils
  g.fillRect(bx + w - 7, by + h - 12, 3, 9);                    // the anvil post
  const arm = by + h - 13 + 4 * clack;                          // the armature
  g.fillRect(bx + 4, arm, w - 12, 2);
  g.fillRect(bx + 2, arm - 1, 3, 5);
  // the bell, and the hammer that strikes it on the hour
  const cx = bx + 10, cy = by + h - 9;
  g.fillWhere((px, py) => py <= cy && Math.hypot(px - cx, py - cy) <= 5.5, 1, [cx - 7, cy - 7, 14, 7]);
  g.fillRect(cx - 5, cy, 11, 1);
  const hit = 1 + 4 * strike;
  g.fillRect(cx - 1, cy - hit - 1, 3, 1 + hit);
}

/** The first `f` of a polyline, by length: a dash being drawn. */
function clipPoly(p, f) {
  if (f >= 1) return p;
  let full = 0;
  for (let i = 1; i < p.length; i++) full += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
  const want = f * full;
  if (want <= 0.01) return [p[0], p[0]];
  const out = [p[0]];
  let acc = 0;
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1], b = p[i];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (acc + len >= want) {
      const t = len ? (want - acc) / len : 0;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      return out;
    }
    acc += len;
    out.push(b);
  }
  return out;
}

/** The punch carriage: a brass block riding the tape's edge, with its pin. */
function drawPunch(g, x, pin, ox, oy) {
  const bx = Math.round(x + ox), by = oy;
  if (bx < -8 || bx > 136) return;
  g.fillRect(bx - 5, by - 1, 10, 6);                      // the body
  g.fillRect(bx - 6, by + 4, 12, 1);
  g.fillRect(bx - 2, by + 5, 4, 2 + 5 * pin);             // the pin
  if (pin > 0.75) g.fillRect(bx - 3, by + 6 + 5 * pin, 6, 1);
}

// ------------------------------------------------------------ the face

const digitsOf = (f) => [+f.hh[0], +f.hh[1], +f.mm[0], +f.mm[1]];

/**
 * The marks of the four numerals and the colon, each at its own x on the
 * tape. `age[i]` is how long that piece has been punched, for the write-on.
 */
function drawTime(g, digits, colonAge, shift, ages, ox, oy) {
  for (let i = 0; i < 4; i++) {
    const bx = BOX_X[i] + ox + shift, by = BOX_Y + oy;
    const marks = marksOf(digits[i]);
    for (let j = 0; j < marks.length; j++) {
      const grow = ages ? clamp((ages[i] - j * 0.011) / 0.1, 0, 1) : 1;
      if (grow <= 0) continue;
      const m = marks[j];
      if (m.k === 'dot') g.fillCircle(bx + m.x, by + m.y, U * 0.5 * grow);
      else {
        const pts = clipPoly(m.p, grow).map(([x, y]) => [bx + x, by + y]);
        if (pts.length > 1) g.stroke(pts, DW);
      }
    }
  }
  const cg = colonAge === null ? 1 : clamp(colonAge / 0.1, 0, 1);
  if (cg > 0) for (const cy of [14, 26]) g.fillCircle(63 + ox + shift, BOX_Y + cy + oy, U * 0.62 * cg);
}

export default {
  name: 'Morse',
  blurb: 'A telegraph register: the time is punched through a backlit tape in dots and dashes — each numeral drawn in its own Morse rhythm — while the key taps the seconds and the sounder clacks.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  driver: 'full',

  frame(g, { date, fields: f, oled, night }) {
    const sec = f.sec;
    const [ox, oy] = orbit(date, 2, 3);
    const late = sec >= 54;
    const fromF = late ? f : clockFields(new Date(date.getTime() - 60000));
    const toF = late ? clockFields(new Date(date.getTime() + 60000)) : f;
    const t = late ? sec - 60 : sec;
    const hour = toF.m === 0;

    // ---- the tape. It is clamped while a minute runs; the clamp lifts at
    // :55 and the tape feeds a whole number of sprocket pitches, so that the
    // moment the section is swapped is invisible — the holes land where they
    // were. On the hour it feeds twice as far.
    const FEED = hour ? 252 : 126;      // whole sprocket pitches: no jump at the turn
    const shift = late ? -FEED * ease.inOutCubic(progress(sec, 55.2, hour ? 59.5 : 59.7)) : 0;
    const off = ((shift % SPROCKET_P) + SPROCKET_P) % SPROCKET_P;
    g.hline(0, TAPE_TOP + oy, 128);
    g.hline(0, TAPE_BOT + oy, 128);
    for (let x = -SPROCKET_P; x < 132; x += SPROCKET_P) {
      g.fillCircle(x + ox + off + 0.5, SPROCKET_Y + oy + 0.5, 1.4);
    }

    // ---- the punching. The carriage rides the tape's edge from :00, and each
    // numeral is written as the pin passes over it.
    const P0 = 0.05, P1 = hour ? 1.55 : 1.2;
    const stampAt = (x) => P0 + ((x + 10) / 148) * (P1 - P0);
    const carriageX = (s) => {
      if (s <= P0) return -10;
      if (s < P1) return -10 + 148 * ease.inOutQuad((s - P0) / (P1 - P0));
      return 138 - 148 * ease.inOutQuad(clamp((s - P1) / (56 - P1), 0, 1));
    };

    if (late) {
      drawTime(g, digitsOf(fromF), null, shift, null, ox, oy);
    } else {
      const to = digitsOf(toF);
      const ages = to.map((_, i) => t - stampAt(BOX_X[i] + BOX_W / 2));
      drawTime(g, to, t - stampAt(63), 0, ages, ox, oy);
    }

    // ---- the carriage, and the pin dipping at each stamp
    let pin = 0;
    for (const x of [...BOX_X.map((v) => v + BOX_W / 2), 63]) {
      const d = sec - stampAt(x);
      if (d > -0.09 && d < 0.17) pin = Math.max(pin, 1 - Math.abs(d) / 0.13);
    }
    drawPunch(g, carriageX(sec), Math.max(0, pin), ox, oy);

    // ---- the key and the sounder. The key makes a dot every second; while a
    // numeral is being punched, the sounder clacks along with the pin.
    const press = contacts(sec % 1, Math.floor(sec) % 10 === 0 ? 0.72 : 0.45);
    const strike = hour && !late ? clamp(1 - Math.abs(sec - 0.5) / 0.12, 0, 1) : 0;
    drawKey(g, Math.max(press, 0.3 * pin), ox, oy);
    drawSounder(g, Math.max(1 - press, 0.85 * pin, strike), ox, oy, strike);

    // ---- on the hour, the bell rings
    if (hour && !late && sec > 0.45 && sec < 3.1) {
      const u = (sec - 0.45) / 2.6;
      for (const k of [0, 0.4]) {
        const ru = u - k;
        if (ru <= 0 || ru >= 0.7) continue;
        const cx = SND.x + 10 + ox, cy = SND.y + 6 + oy;
        const r0 = 2 + 11 * ease.outCubic(ru / 0.7);
        g.fillWhere((px, py) => {
          const d = Math.hypot(px - cx, py - cy);
          return d >= r0 - 1 && d <= r0;
        }, 1, [cx - r0 - 2, cy - r0 - 2, 2 * r0 + 4, 2 * r0 + 4]);
      }
    }

    oled.contrast(0xcf + (0x20 - 0xcf) * night);
  },
};
