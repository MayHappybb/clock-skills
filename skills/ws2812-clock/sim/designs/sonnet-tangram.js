// Sonnet-tangram: the plus-shaped board is a tangram set laid out on a dark
// lacquered table. Each arm holds the 7 classic tangram pieces (two big
// triangles, one medium, two small, a square, a parallelogram) arranged
// into one digit, always upright; the centre panel is the box they live in.
// Pieces are real lacquered-wood or cut-glass objects (one material per
// time-unit, picked fresh each minute) with a bevelled edge and a shared
// lamp glint that glides across the whole board.
//
// Minute: the changing arm's 7 pieces lift and glide/rotate as rigid shapes
// (matched piece-for-piece between the old and new digit, eased, with a
// little hover-lift) into the new digit -- rearranging, never fading, every
// piece present throughout.
// Hour: all 28 pieces fly in to the centre box, assemble the big square,
// then the set resolves to the time again -- time stays readable except for
// the brief flight, which is kept short.
import * as kit from '../js/kit.js';
import { digitPolys, PIECE_NAMES, DIGIT_FRAME } from './sonnet-tangram-geo.js';
import { ORDER, fillPoly, makeShader, materialFor, centroidOf } from './sonnet-tangram-render.js';

const W = 192, H = 192;
const PANEL = 64;
// Arm centres in pixel space (grid: x right, y down, origin top-left of the 192x192 raster)
const ARM = {
  hTens: { cx: 96, cy: 32, rot: 0 },     // top panel
  hUnits: { cx: 32, cy: 96, rot: 0 },    // left panel
  mTens: { cx: 160, cy: 96, rot: 0 },    // right panel
  mUnits: { cx: 96, cy: 160, rot: 0 },   // bottom panel
};
const SLOTS = ['hTens', 'hUnits', 'mTens', 'mUnits'];
const PX_PER_UNIT = 3.6; // pixels per local "normalised" unit (after each digit is auto-centred + scaled to a common height)

const pad2 = (n) => String(n).padStart(2, '0');
function digitsOf(date) {
  const hh = pad2(date.getHours()), mm = pad2(date.getMinutes());
  return { hTens: +hh[0], hUnits: +hh[1], mTens: +mm[0], mUnits: +mm[1] };
}

// ------------------------------------------------------- rigid piece match
/**
 * All 7 pieces of `digit`, auto-centred on the digit's own bbox and scaled
 * to a common on-panel height (DIGIT_FRAME, computed once in geo.js), then
 * placed at (cx, cy) pixels and rotated by rot degrees.
 */
function pieceFrames(digit, cx, cy, rot, pxPerUnit) {
  const polys = digitPolys(digit);
  const fr = DIGIT_FRAME[digit];
  const scale = fr.k * pxPerUnit;
  const out = {};
  const r = (rot * Math.PI) / 180, cr = Math.cos(r), sr = Math.sin(r);
  for (const name of PIECE_NAMES) {
    const poly = polys[name].map(([x, y]) => {
      const lx = (x - fr.ox) * scale, ly = (y - fr.oy) * scale;
      const rx = lx * cr - ly * sr, ry = lx * sr + ly * cr;
      return [cx + rx, cy + ry];
    });
    out[name] = poly;
  }
  return out;
}

/** Interpolate two polygons vertex-by-vertex (same piece shape, so same vertex count & winding -- a straight lerp traces the rigid glide/rotate smoothly enough for small eased steps). */
function lerpPoly(a, b, t) {
  const out = new Array(a.length);
  for (let i = 0; i < a.length; i++) {
    out[i] = [a[i][0] + (b[i][0] - a[i][0]) * t, a[i][1] + (b[i][1] - a[i][1]) * t];
  }
  return out;
}

// A little hover lift during a minute-turn: pieces rise (scale up slightly
// + brighten) at the midpoint of the glide, like they're lifted off the
// table and set back down.
function hoverScale(t) { return 1 + 0.06 * Math.sin(Math.PI * t); }

// ------------------------------------------------------------- hour flight
// Centre "box" region in pixel space (the centre panel).
const BOX = { cx: 96, cy: 96 };

function flightPos(from, to, t, outIn) {
  // outIn: 0 = at `from`, 1 = at `to`, with a lifted arc in between
  const x = from[0] + (to[0] - from[0]) * t, y = from[1] + (to[1] - from[1]) * t;
  const lift = Math.sin(Math.PI * t) * 10 * outIn;
  return [x, y - lift];
}

export default {
  name: 'sonnet-tangram',
  blurb: 'A tangram set on a dark lacquered table: each arm\'s seven wood or glass pieces rearrange, rigid and gliding, into the hour and minute.',
  layouts: ['hub-cross'],
  look: 'smoke',
  fps: 60,
  brightness: 0.4,
  dither: true,
  warmup: 0,

  init(ctx) {
    ctx._img = new Float32Array(3 * W * H);
    ctx._prevDigits = null;
    ctx._turnStart = {}; // slot -> {from, to, t0}
    ctx._minuteSeed = 0;
    ctx._hourFlight = null; // {t0, dur, fromDigits}
  },

  frame(ctx) {
    const img = ctx._img;
    img.fill(0);
    const date = ctx.date;
    const nowSec = date.getTime() / 1000;
    const digits = digitsOf(date);
    const minuteKey = date.getHours() * 60 + date.getMinutes();

    if (ctx._prevDigits === null) {
      ctx._prevDigits = { ...digits };
      ctx._minuteSeed = minuteKey;
    }
    // detect minute change per slot -> start a glide
    for (const slot of SLOTS) {
      if (ctx._prevDigits[slot] !== digits[slot] && !ctx._turnStart[slot]) {
        ctx._turnStart[slot] = { from: ctx._prevDigits[slot], to: digits[slot], t0: nowSec };
      }
    }
    // detect hour rollover (minute units AND tens AND hour units/tens all land on :00) -> trigger the big show
    if (digits.mUnits === 0 && digits.mTens === 0 && ctx._prevDigits.mUnits !== 0 && !ctx._hourFlight) {
      ctx._hourFlight = { t0: nowSec, dur: 2.6, fromDigits: { ...ctx._prevDigits } };
    }
    ctx._prevDigits = { ...digits };

    const MINUTE_TURN_DUR = 1.4;
    const lampPhase = nowSec * 0.6;
    const shimmer = 0.015 * Math.sin(nowSec * 1.7) + 0.015 * kit.noise2(nowSec * 0.3, 0);

    // Hour flight overrides normal arm drawing while active.
    let hourT = -1;
    if (ctx._hourFlight) {
      hourT = (nowSec - ctx._hourFlight.t0) / ctx._hourFlight.dur;
      if (hourT >= 1) { ctx._hourFlight = null; hourT = -1; }
    }

    if (hourT >= 0) {
      drawHourFlight(img, ctx._hourFlight.fromDigits, digits, hourT, lampPhase, shimmer, ctx._minuteSeed);
      ctx._minuteSeed = minuteKey;
    } else {
      ctx._minuteSeed = minuteKey;
      for (let s = 0; s < SLOTS.length; s++) {
        const slot = SLOTS[s];
        const arm = ARM[slot];
        const turn = ctx._turnStart[slot];
        const mat = materialFor(s, ctx._minuteSeed);
        if (turn) {
          const t = (nowSec - turn.t0) / MINUTE_TURN_DUR;
          if (t >= 1) {
            delete ctx._turnStart[slot];
            drawDigitAt(img, digits[slot], arm.cx, arm.cy, arm.rot, PX_PER_UNIT, mat, lampPhase, shimmer);
          } else {
            drawTurn(img, turn.from, turn.to, arm.cx, arm.cy, arm.rot, PX_PER_UNIT, mat, kit.ease.inOut(kit.clamp(t)), lampPhase, shimmer);
          }
        } else {
          drawDigitAt(img, digits[slot], arm.cx, arm.cy, arm.rot, PX_PER_UNIT, mat, lampPhase, shimmer);
        }
      }
      drawBox(img, BOX.cx, BOX.cy, nowSec);
    }

    kit.blitGrid(ctx, img);
  },
};

// ------------------------------------------------------------- drawing

function drawDigitAt(img, digit, cx, cy, rot, scale, mat, lampPhase, shimmer) {
  const polys = pieceFrames(digit, cx, cy, rot, scale);
  for (const name of ORDER) {
    const poly = polys[name];
    const [px, py] = centroidOf(poly);
    fillPoly(img, W, H, poly, makeShader(mat, px, py, lampPhase, shimmer));
  }
}

function drawTurn(img, fromDigit, toDigit, cx, cy, rot, scale, mat, t, lampPhase, shimmer) {
  const a = pieceFrames(fromDigit, cx, cy, rot, scale);
  const b = pieceFrames(toDigit, cx, cy, rot, scale);
  const hs = hoverScale(t);
  for (const name of ORDER) {
    let poly = lerpPoly(a[name], b[name], t);
    if (hs !== 1) {
      // scale the piece slightly about its own centroid for the hover-lift feel
      const [ccx, ccy] = centroidOf(poly);
      poly = poly.map(([x, y]) => [ccx + (x - ccx) * hs, ccy + (y - ccy) * hs]);
    }
    const [px, py] = centroidOf(poly);
    const bright = 1 + 0.12 * Math.sin(Math.PI * t); // slight lift brighten
    const shade = makeShader(mat, px, py, lampPhase, shimmer + bright - 1);
    fillPoly(img, W, H, poly, shade);
  }
}

function drawHourFlight(img, fromDigits, toDigits, t, lampPhase, shimmer, minuteSeed) {
  // Phase 1 (0..0.45): all 16 arm-piece-groups collapse toward the centre box.
  // Phase 2 (0.45..0.55): hold, assembled as the big square in the centre.
  // Phase 3 (0.55..1): pieces fly back out to the NEW time's arms.
  const SLOTS_ = SLOTS;
  const te = kit.ease.inOut(kit.clamp(t < 0.5 ? t / 0.5 : (t - 0.5) / 0.5));
  for (let s = 0; s < SLOTS_.length; s++) {
    const slot = SLOTS_[s];
    const arm = ARM[slot];
    const mat = materialFor(s, minuteSeed);
    const fromDigit = fromDigits[slot], toDigit = toDigits[slot];
    const homeFrom = pieceFrames(fromDigit, arm.cx, arm.cy, arm.rot, PX_PER_UNIT);
    const homeTo = pieceFrames(toDigit, arm.cx, arm.cy, arm.rot, PX_PER_UNIT);
    for (const name of ORDER) {
      let poly;
      if (t < 0.5) {
        // fly from home-arm position toward the centre box (shrink slightly, converge)
        const from = homeFrom[name];
        const toward = from.map(([x, y]) => {
          const dx = BOX.cx - arm.cx, dy = BOX.cy - arm.cy;
          const k = 0.75; // how far toward centre they travel
          return [x + dx * k * te, y + dy * k * te];
        });
        poly = toward;
      } else {
        // fly from a centre-converged position back out to the NEW digit's home arm
        const to = homeTo[name];
        const dx = BOX.cx - arm.cx, dy = BOX.cy - arm.cy;
        const k = 0.75;
        const converged = homeFrom[name].map(([x, y]) => [x + dx * k, y + dy * k]);
        poly = lerpPoly(converged, to, te);
      }
      const [px, py] = centroidOf(poly);
      fillPoly(img, W, H, poly, makeShader(mat, px, py, lampPhase, shimmer));
    }
  }
}

// The centre panel: a simple dark lacquered tray with a thin inlaid border,
// standing in for "the box the pieces live in."
function drawBox(img, cx, cy, nowSec) {
  const half = 30;
  const glow = 0.03 + 0.015 * Math.sin(nowSec * 0.4);
  for (let y = Math.max(0, cy - half); y < Math.min(H, cy + half); y++) {
    for (let x = Math.max(0, cx - half); x < Math.min(W, cx + half); x++) {
      const edge = Math.min(x - (cx - half), (cx + half) - x, y - (cy - half), (cy + half) - y);
      const p = 3 * (y * W + x);
      const rim = edge < 2 ? 0.08 : 0;
      img[p] += 0.015 + rim * 0.3 + glow * 0.2;
      img[p + 1] += 0.012 + rim * 0.25 + glow * 0.2;
      img[p + 2] += 0.01 + rim * 0.2 + glow * 0.25;
    }
  }
}
