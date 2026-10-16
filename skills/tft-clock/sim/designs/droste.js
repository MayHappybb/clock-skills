// Droste: howlaround. Point a television camera at the monitor it feeds and
// the picture contains itself: a screen inside a screen inside a screen,
// each copy turned a little and shifted in hue, down to a hot point of
// light. The BBC found it by accident in 1963 and built a title sequence
// on it. Here the camera never stops dollying in: you fall forever inward
// through the copies, and because every copy is the same picture, the fall
// loops seamlessly (one copy is 2.6x smaller and 11 degrees further round
// than the one holding it).
//
// Reading it: every copy is a screen with the hours on its left jamb and
// the minutes on its right, round a hole that is the next screen. One copy
// is always whole on the glass at 40-100% size. The seconds light up each
// screen's bezel clockwise from 12; the lit tips of all the copies line up
// into a curved arm that sweeps round the vanishing point like a hand.
//
// The minute turn is the Droste effect told as time. From :58.8 the digits
// that are about to change fall inward, outermost copy first, each one
// shrinking and turning into the slot of the copy inside it, until the old
// minute has poured into the vanishing point (all gone before :00). At :00
// the new minute is found at the bottom of the tunnel and climbs out, copy
// by copy, each digit growing out of the one inside it. At the hour the
// camera plunges five screens (2.6^5, about 120x) and spins a full turn
// while that happens.
//
// Palette: the glass hue swings teal -> blue -> violet -> magenta and back
// over an 8-copy cycle (never through the yellows, which go brown when
// dark), pale tinted ink with a saturated glow, the copies brightening
// towards the blown-out centre as real feedback does; copies passing the
// camera dim out so the whole copy on the glass leads. Everything is anti-aliased: the
// whole face moves by fractions of a pixel every frame. A faint scanline
// sits over it all, the monitor the camera is looking at.

import { hsv, mix, sin, cos, clamp, clockFields, previousMinute } from '../js/kit.js';
import { GLYPHS } from './droste-glyphs.js';

const K = 2.6;                    // size ratio between a screen and the screen inside it
const LNK = Math.log(K);
const TWIST = (11 * Math.PI) / 180; // extra turn per copy
const RATE = 1 / 3;               // copies fallen through per second
const DIVE = 5;                   // extra copies at the hour plunge (RATE*86400 + 24*DIVE is a multiple of the colour cycle)
const HUES = [182, 214, 246, 278, 310, 278, 246, 214], NCOL = HUES.length;
const CX = 80, CY = 40;

// ---- the picture, in its own coordinates (centre 0,0; 160 x 80 at size 1)

/** A rounded rectangle as a closed polyline, starting at top centre, clockwise. */
function roundRect(hw, hh, r, steps = 4) {
  const pts = [[0, -hh]];
  const corner = (cx, cy, a0) => {
    for (let i = 0; i <= steps; i++) {
      const a = a0 + (i / steps) * (Math.PI / 2);
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  };
  corner(hw - r, -hh + r, -Math.PI / 2);
  corner(hw - r, hh - r, 0);
  corner(-hw + r, hh - r, Math.PI / 2);
  corner(-hw + r, -hh + r, Math.PI);
  pts.push([0, -hh]);
  return pts;
}
const SCREEN = roundRect(80, 40, 9);
const BEZEL = roundRect(76.5, 36.5, 6.5, 6);
const BEZEL_LEN = [0];
for (let i = 1; i < BEZEL.length; i++)
  BEZEL_LEN.push(BEZEL_LEN[i - 1] + Math.hypot(BEZEL[i][0] - BEZEL[i - 1][0], BEZEL[i][1] - BEZEL[i - 1][1]));
const BEZEL_TOTAL = BEZEL_LEN[BEZEL_LEN.length - 1];

/** The bezel from 12 o'clock clockwise to fraction f, plus its tip. */
function bezelTo(f) {
  const want = f * BEZEL_TOTAL, out = [BEZEL[0]];
  for (let i = 1; i < BEZEL.length; i++) {
    if (BEZEL_LEN[i] >= want) {
      const u = (want - BEZEL_LEN[i - 1]) / (BEZEL_LEN[i] - BEZEL_LEN[i - 1] || 1);
      out.push([BEZEL[i - 1][0] + (BEZEL[i][0] - BEZEL[i - 1][0]) * u, BEZEL[i - 1][1] + (BEZEL[i][1] - BEZEL[i - 1][1]) * u]);
      return out;
    }
    out.push(BEZEL[i]);
  }
  return out;
}

// Digit slots: HH on the left jamb, MM on the right, 17 x 44 at size 1.
const GS = 1.7;
const SLOT_X = [-76, -55, 38, 59], SLOT_Y = -22.1;
const WEIGHT = 2.5 * GS;

// ---- time -> depth

const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
/** Ink of a copy that is passing the camera dims out (delta < 0 is bigger than the glass). */
const fade = (delta) => (delta >= 0 ? 1 : clamp(1 + 0.85 * delta, 0.15, 1));

// The minute turn: old digits start falling at OFF_AT, the wave crosses the
// copies in SPAN seconds, each digit takes TAU to fall into the copy inside.
const OFF_AT = 57.7, SPAN = 1.5, TAU = 0.6;   // last old digit gone by :59.95; new ones from :00

/** Plunge progress at the hour: completed plunges since midnight (fractional during one). */
function plunges(T) {
  const h0 = Math.round(T / 3600), rel = T - h0 * 3600;
  if (Math.abs(rel) < 2.2) return h0 - 1 + smooth((rel + 2.2) / 4.4);
  return Math.floor(T / 3600);
}

// ---- drawing

function levelColours(n, delta) {
  const h = HUES[((n % NCOL) + NCOL) % NCOL];
  const d = clamp((delta + 1) / 6, 0, 1);       // 0 at the camera, 1 deep
  return {
    glass: hsv(h, 0.9 - 0.4 * d, 0.24 + 0.5 * d),
    ink: hsv(h - 45, 0.22 - 0.12 * d, 1),
    glow: hsv(h - 45, 0.85, 1),
    dim: hsv(h, 0.6, 0.45 + 0.35 * d),
  };
}

/** The similarity that puts the picture at depth x on the glass. */
function view(x, D, spin) {
  const s = Math.exp((D - x) * LNK);
  const a = (x - D) * TWIST + spin;
  const c = cos(a) * s, sn = sin(a) * s;
  return { s, map: (p) => [CX + c * p[0] - sn * p[1], CY + sn * p[0] + c * p[1]] };
}

function drawDigit(g, v, slot, d, colour, glow, a) {
  if (a <= 0.02) return;
  const ox = SLOT_X[slot], oy = SLOT_Y;
  const w = WEIGHT * v.s;
  const lines = GLYPHS[d].map((pl) => pl.map((p) => v.map([ox + p[0] * GS, oy + p[1] * GS])));
  if (v.s > 0.3) for (const l of lines) g.stroke(l, w + 3.2 * v.s, glow, { aa: true, a: 0.28 * a });
  for (const l of lines) g.stroke(l, Math.max(w, 0.9), colour, { aa: true, a });
}

export default {
  name: 'Droste',
  blurb: 'Howlaround feedback: fall forever through screens inside screens; each new minute climbs out of the vanishing point.',
  fps: 60,

  frame(g, ctx) {
    const f = ctx.fields, sec = f.sec;
    ctx.lcd.backlight(1 - 0.7 * ctx.night);

    const T = f.h * 3600 + f.m * 60 + sec;
    const pl = plunges(T);
    const D = RATE * T + DIVE * pl;
    const spin = 2 * Math.PI * (pl - Math.floor(pl + 1e-9));   // a full turn during each plunge

    const cur = f.hh + f.mm;
    const nextF = clockFields(new Date(ctx.date.getTime() + 60000)), nxt = nextF.hh + nextF.mm;
    const prvF = previousMinute(ctx.date), prv = prvF.hh + prvF.mm;

    const n0 = Math.floor(D) - 1;
    const nMax = Math.floor(D + Math.log(60) / LNK);

    // The copy behind the glass edge: only its glass shows, at the corners.
    g.clear(levelColours(n0, n0 - D).glass);

    const flying = [];
    const progress = sec / 60;
    for (let n = n0 + 1; n <= nMax; n++) {
      const delta = n - D;
      const v = view(n, D, spin);
      const col = levelColours(n, delta);
      g.fillPolygon(SCREEN.map(v.map), col.glass, { aa: true });
      if (v.s * 80 < 3) continue;

      // Bezel: dim all round, lit from 12 o'clock to the seconds.
      const bw = Math.max(1.1 * v.s * 1.6, 0.7);
      g.stroke(BEZEL.map(v.map), bw, col.dim, { aa: true });
      const lit = bezelTo(progress).map(v.map);
      g.stroke(lit, bw * 1.25, col.ink, { aa: true });
      if (sec < 1) g.stroke(BEZEL.map(v.map), bw * 1.25, col.ink, { aa: true, a: 1 - sec });
      const tip = lit[lit.length - 1];
      g.fillCircle(tip[0], tip[1], 2.6 * v.s + 0.6, col.glow, { aa: true, a: 0.45 });
      g.fillCircle(tip[0], tip[1], 1.2 * v.s + 0.5, 0xffffff, { aa: true });

      if (v.s < 0.12) continue;
      for (let j = 0; j < 4; j++) {
        // Old digit falling inward before :00.
        if (sec >= OFF_AT && cur[j] !== nxt[j]) {
          const ts = Math.min(OFF_AT + ((delta + 1.2) / 7) * SPAN, 59.95 - TAU);
          const u = clamp((sec - ts) / TAU, 0, 1);
          if (u > 0) { flying.push({ n, u, j, d: cur[j], old: true }); continue; }
        }
        // New digit climbing out after :00.
        if (sec < SPAN + TAU && prv[j] !== cur[j]) {
          const te = Math.max(0, ((5.8 - delta) / 7) * SPAN);
          const u = 1 - clamp((sec - te) / TAU, 0, 1);
          if (u > 0) { flying.push({ n, u, j, d: cur[j], old: false }); continue; }
        }
        drawDigit(g, v, j, cur[j], col.ink, col.glow, fade(delta));
      }
    }

    // The digits in flight between a copy and the copy inside it, on top.
    for (const fl of flying) {
      if (fl.u >= 1) continue;
      const x = fl.n + smooth(fl.u);
      const v = view(x, D, spin);
      const a0 = levelColours(fl.n, fl.n - D), a1 = levelColours(fl.n + 1, fl.n + 1 - D);
      const ink = mix(a0.ink, a1.ink, fl.u);
      const flash = fl.old ? 0 : 0.75 * smooth(fl.u);       // new digits arrive white-hot
      const alpha = (1 - smooth((fl.u - 0.75) / 0.25)) * fade(x - D);
      drawDigit(g, v, fl.j, fl.d, mix(ink, 0xffffff, flash), mix(a0.glow, a1.glow, fl.u), alpha);
    }

    // The hot point at the bottom of the tunnel.
    g.fillCircle(CX, CY, 1.3, 0xfff6e0, { aa: true });

    // The monitor's scanlines.
    for (let y = 1; y < 80; y += 2) g.fillRect(0, y, 160, 1, 0x000000, { a: 0.1 });
  },
};
