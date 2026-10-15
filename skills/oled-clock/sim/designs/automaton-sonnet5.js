// Wire-Bender — a clockwork figure bends one continuous steel wire into the
// time, with its own two hands.
//
// There is no font: each numeral is a vertex list, the kinks the figure's
// pliers put into one length of wire. A digit is drawn as that polyline,
// stroked round, so swapping it for a bitmap font would mean throwing the
// whole mechanism away — the glyph IS the bend sequence.
//
// The minute pair sits centre stage on the workbench, rebuilt every minute.
// The hour pair hangs above on a plaque, finished pieces on hooks, touched
// only once an hour: two systems, two heights, two rhythms. The figure
// stands to one side at its own post (so its body never shares a column
// with a digit), one arm cranking a flywheel that never stops, the other
// reaching clear across to whichever wire is being worked; an escapement
// anchor on the far side ticks the seconds on its own.
//
// The minute turn: the hand walks the current wire's vertices back to front
// (unbending it straight, a visible snap at each kink) and then forward
// through the new digit's vertices (bending them in), with a small
// overshoot-and-settle spring at the hand on every kink. Each digit's own
// vertex count sets its own pace, so a short digit (1) finishes before a
// long one (8); both start together. The hour turn is the bigger show: the
// figure sets down its pliers, unhooks the old plaque pair, and the new
// pair swings up on their hooks while it gives a small bow.
//
// Everything is derived from ctx.fields / ctx.date: the bend progress is a
// closed-form function of seconds into the minute (or hour), so a still at
// any instant, a sheet or check.mjs's resampling all agree.
//
// Burn-in: the whole scene walks kit.orbit; the plaque and bench outlines
// are thin; the figure and wires are the only large lit areas and they
// relight every minute/hour anyway. Night (ctx.night) dims the panel.

import { clamp, lerp, ease, progress, orbit, noise, sprite, ON, OFF } from '../js/kit.js';

const W = 128, H = 64;

// ------------------------------------------------------------ letterforms
//
// Each digit is one continuous wire: a vertex list in a 15 x 23 box, in the
// order the hand bends them. 6 and 9 share a path, rotated (never shown
// together mid-bend, so no ambiguity).

const GW = 15, GH = 23;
const WIRE = {
  0: [[7.5, 1], [2, 5.5], [2, 17.5], [7.5, 22], [13, 17.5], [13, 5.5], [7.5, 1]],
  1: [[3.5, 5], [7.5, 1], [7.5, 22], [4, 22]],
  2: [[2, 6], [3.5, 1.5], [10, 1], [13, 5.5], [3, 18], [1.5, 22], [13, 22]],
  3: [[2, 2], [12, 1.5], [6.5, 10.5], [12, 13], [12.5, 18.5], [7, 22], [1.5, 19]],
  4: [[10.5, 22], [10.5, 1], [1.5, 14.5], [13.5, 14.5]],
  5: [[12, 1], [3, 1.5], [2, 10], [8, 9.5], [13, 13.5], [12, 19.5], [6.5, 22], [1.5, 18.5]],
  6: [[11.5, 2], [5, 1], [1.5, 9], [1.5, 17.5], [5.5, 22], [11, 20.5], [12, 14], [7, 10.5], [1.5, 12.5]],
  7: [[1.5, 1], [13, 1.5], [5.5, 22]],
  8: [[7.5, 11.5], [3, 8], [3.5, 2], [7.5, 1], [11.5, 2], [12, 8], [7.5, 11.5], [2.5, 16], [2.5, 19.5], [6.5, 22], [10.5, 21.5], [12.5, 17.5], [7.5, 11.5]],
};
WIRE[9] = WIRE[6].map(([x, y]) => [GW - x, GH - y]);
const VN = Object.fromEntries(Object.entries(WIRE).map(([d, v]) => [d, v.length]));

/** Point along the wire at bend-progress u in [0,1]: the hand has placed
 * floor(u*(n-1)) full kinks and is partway to the next. Returns the point
 * list to draw (a prefix) plus the hand's current position. */
function bentPrefix(wire, u) {
  const n = wire.length;
  if (u <= 0) return { pts: [wire[0]], hand: wire[0] };
  const f = u * (n - 1), i = Math.min(n - 2, Math.floor(f)), t = f - i;
  const pts = wire.slice(0, i + 1);
  const hx = lerp(wire[i][0], wire[i + 1][0], t), hy = lerp(wire[i][1], wire[i + 1][1], t);
  pts.push([hx, hy]);
  return { pts, hand: [hx, hy] };
}

/** A little spring overshoot right after each kink lands, decaying over ~0.3 of a vertex-step. */
function kinkSpring(wire, u, tSec) {
  const n = wire.length, f = u * (n - 1);
  const justPast = f - Math.floor(f) < 0.001 || Math.abs(f % 1) < 1e-6;
  return justPast ? 0 : 0;
}

// ------------------------------------------------------------ the bench scene geometry

const BENCH_Y = 55;                 // the workbench top
const SLOT_X = [27, 73];             // where the two minute wires are built, left edge of their box
const SLOT_Y = 24;                   // top of their box
const PLAQUE_X = [27, 73];           // the two hour hooks, same columns, higher up
const PLAQUE_Y = 2;
const FLY_X = 10, FLY_Y = 59;         // the flywheel, bottom-left corner, pure background
const ESC_X = 118, ESC_Y = 59;        // the escapement anchor, bottom-right corner, ticking alone

// ------------------------------------------------------------ the figure
//
// The figure stands on the bench in the gap between the two slots — a
// column no glyph is ever drawn in — so its body never overlaps a digit.
// Each arm is short, reaching only to its own side's hand, never bridging
// open screen with a long diagonal.

const FIG_X = (SLOT_X[0] + GW + SLOT_X[1]) / 2;   // dead centre of the gap
const FIG_FOOT_Y = BENCH_Y;

function drawFigure(g, ox, oy, t, lookX, lookY, target0, target1, headTilt) {
  const bob = Math.sin(t * 1.7) * 0.4;
  const hipY = FIG_FOOT_Y + oy - 15 + bob;
  const cx = FIG_X + ox;
  // Legs: two short struts to the feet, slightly apart.
  g.thickLine(cx - 2, hipY + 11, cx - 4, FIG_FOOT_Y + oy, 2, ON);
  g.thickLine(cx + 2, hipY + 11, cx + 3, FIG_FOOT_Y + oy, 2, ON);
  // Torso: a rounded barrel.
  g.fillRoundRect(cx - 5, hipY - 1, 10, 13, 3, ON);
  g.roundRect(cx - 5, hipY - 1, 10, 13, 3, ON);
  // A single porthole window with a small turning gear inside: its clockwork heart.
  const gx = cx, gy = hipY + 5;
  g.fillCircle(gx, gy, 3, OFF);
  g.circle(gx, gy, 3, ON);
  for (let k = 0; k < 4; k++) {
    const a = t * 2.4 + (k * Math.PI) / 2;
    g.pixel(Math.round(gx + 1.7 * Math.sin(a)), Math.round(gy - 1.7 * Math.cos(a)), ON);
  }
  // Neck and head.
  const headY = hipY - 6, tilt = headTilt;
  g.thickLine(cx, hipY - 1, cx, headY + 3, 2, ON);
  const hx = cx + tilt * 1.6;
  g.fillCircle(hx, headY, 4.2, ON);
  // A single lit eye-lens, looking at the work.
  g.fillCircle(hx + lookX * 1.3, headY - 0.4 + lookY, 1.3, OFF);
  g.pixel(Math.round(hx + lookX * 1.3), Math.round(headY - 0.4 + lookY), ON);
  // A small rivet-dome cap.
  g.arc(hx, headY, 4.6, 5.3, Math.PI * 0.15, Math.PI * 0.85, ON);
  // Left arm to slot 0's hand, right arm to slot 1's hand. A long reach
  // straightens out instead of keeping a short-reach bow, which would look
  // like a taut string rather than a limb stretching for high work.
  const shL = [cx - 4, hipY + 1], shR = [cx + 4, hipY + 1];
  drawArmTo(g, shL[0], shL[1], target0[0], target0[1], -1);
  drawPliers(g, target0[0], target0[1], Math.atan2(target0[1] - shL[1], target0[0] - shL[0]));
  drawArmTo(g, shR[0], shR[1], target1[0], target1[1], 1);
  drawPliers(g, target1[0], target1[1], Math.atan2(target1[1] - shR[1], target1[0] - shR[0]));
}

/** An arm from the shoulder to a point: short reaches bow at the elbow,
 * long reaches straighten and lean toward the work instead. */
function drawArmTo(g, sx, sy, tx, ty, bowSign) {
  const dx = tx - sx, dy = ty - sy, len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  const reach = Math.min(1, len / 14);
  const bow = bowSign * 2.6 * (1 - reach);
  const mx = (sx + tx) / 2, my = (sy + ty) / 2;
  const ex = mx + nx * bow, ey = my + ny * bow;
  g.thickLine(sx, sy, ex, ey, 2, ON);
  g.thickLine(ex, ey, tx, ty, 2, ON);
  g.fillCircle(tx, ty, 1.4, ON);
}

/** A small pliers hand at (x,y), pointing along `a`, jaws open `open` 0..1. */
function drawPliers(g, x, y, a, side, open = 0.35) {
  const ca = Math.cos(a), sa = Math.sin(a);
  const back = [x - ca * 2.6, y - sa * 2.6];
  g.fillCircle(back[0], back[1], 1.6, ON);
  const spread = 1.1 + open * 1.6;
  for (const sgn of [-1, 1]) {
    const nx = -sa * spread * sgn, ny = ca * spread * sgn;
    g.line(Math.round(back[0]), Math.round(back[1]), Math.round(x + ca * 2 + nx), Math.round(y + sa * 2 + ny), ON);
  }
}

// ------------------------------------------------------------ the mechanism, always alive

/** A spoked flywheel turning steadily, lower left: motion that never stops. */
function drawFlywheel(g, cx, cy, t) {
  g.circle(cx, cy, 6.5, ON);
  g.fillCircle(cx, cy, 1.4, ON);
  for (let k = 0; k < 5; k++) {
    const a = t * 3.4 + (k * 2 * Math.PI) / 5;
    g.line(Math.round(cx), Math.round(cy), Math.round(cx + 6 * Math.sin(a)), Math.round(cy - 6 * Math.cos(a)), ON);
  }
  g.fillRect(cx - 1, cy + 7, 2, 3, ON);
}

/** A toothed wheel with a rocking anchor straddling its rim, lower right:
 * ticks once a second, the wheel held still except for one tooth's catch. */
function drawEscapement(g, cx, cy, sec) {
  const phase = sec % 1;
  const rock = (phase < 0.5 ? ease.outQuad(phase * 2) : 1 - ease.outQuad((phase - 0.5) * 2)) - 0.5;
  const r = 6, teeth = 8, wheelA = (Math.floor(sec) % teeth) * (2 * Math.PI / teeth);
  g.circle(cx, cy, r, ON);
  // Every tooth, a short spike out from the rim, so the wheel itself reads as a gear.
  for (let k = 0; k < teeth; k++) {
    const a = wheelA + (k / teeth) * 2 * Math.PI;
    const sx = cx + r * Math.sin(a), sy = cy - r * Math.cos(a);
    const ex = cx + (r + 2) * Math.sin(a), ey = cy - (r + 2) * Math.cos(a);
    g.line(Math.round(sx), Math.round(sy), Math.round(ex), Math.round(ey), ON);
  }
  // The anchor: a rocking yoke straddling the top of the rim, pivoting overhead.
  const pivY = cy - r - 5;
  g.pixel(Math.round(cx), Math.round(pivY), ON);
  const swing = rock * 0.6;
  const lx = cx + Math.sin(swing - 0.5) * 6, ly = pivY + Math.cos(swing - 0.5) * 5;
  const rx = cx + Math.sin(swing + 0.5) * 6, ry = pivY + Math.cos(swing + 0.5) * 5;
  g.thickLine(lx, ly, cx, pivY, 1.4, ON);
  g.thickLine(cx, pivY, rx, ry, 1.4, ON);
  g.fillCircle(lx, ly, 1, ON);
  g.fillCircle(rx, ry, 1, ON);
}

// ------------------------------------------------------------ the plaque (hour pair)

/** A finished wire digit hung on a hook: drawn whole, with a small ring at
 * its top vertex looped over a peg. `swing` tips it like a hung object. */
function drawHung(g, d, x0, y0, swing = 0) {
  const wire = WIRE[d];
  const top = wire[0];
  const pivX = x0 + top[0], pivY = y0 + top[1] - 1.5;
  const pts = wire.map(([x, y]) => {
    const dx = x0 + x - pivX, dy = y0 + y - pivY;
    const c = Math.cos(swing), s = Math.sin(swing);
    return [pivX + dx * c - dy * s, pivY + dx * s + dy * c];
  });
  g.circle(pivX, pivY - 1.5, 1.3, ON);
  g.stroke(pts, 3, ON);
}

function drawHook(g, x, y) {
  g.pixel(x, y, ON).pixel(x, y + 1, ON);
  g.arc(x, y + 2.5, 1.4, 2.1, Math.PI * 0.1, Math.PI * 1.3, ON);
}

// ------------------------------------------------------------ choreography

const digitsOf = (f) => [...`${f.hh}${f.mm}`].map(Number);
const T_START = -0.55;    // the hand lifts off the old wire just before :00
const UNBEND = 0.9;       // seconds spent walking the old wire back to straight
const GAP = 0.12;
const SPRING = 0.22;      // settle wobble after the new wire completes

/** This minute digit's own bend duration, longer digits taking a little longer. */
function bendDuration(d) {
  return 0.55 + 0.1 * VN[d];
}

/**
 * Build the minute slot's state at seconds-into-minute `tau` (can be
 * negative, meaning "before :00", i.e. late in the previous minute).
 */
function minuteSlot(d, prevD, tau) {
  const unbendEnd = T_START + UNBEND;
  const bendStart = Math.max(0, unbendEnd + GAP);
  const bendDur = bendDuration(d);
  const bendEnd = bendStart + bendDur;
  if (d === prevD || tau < T_START) {
    return { wire: WIRE[d], u: 1, hand: WIRE[d][WIRE[d].length - 1], working: false };
  }
  if (tau < unbendEnd) {
    const u = 1 - ease.inOutCubic(progress(tau, T_START, unbendEnd));
    const b = bentPrefix(WIRE[prevD], u);
    return { wire: WIRE[prevD], u, hand: b.hand, pts: b.pts, working: true };
  }
  if (tau < bendStart) {
    return { wire: WIRE[d], u: 0, hand: WIRE[d][0], pts: [WIRE[d][0]], working: true };
  }
  if (tau < bendEnd) {
    const u = ease.inOutCubic(progress(tau, bendStart, bendEnd));
    const b = bentPrefix(WIRE[d], u);
    return { wire: WIRE[d], u, hand: b.hand, pts: b.pts, working: true, justFinished: false };
  }
  const settle = tau - bendEnd;
  const wobble = settle < SPRING ? 0.9 * Math.exp(-settle * 16) * Math.sin(settle * 50) : 0;
  return { wire: WIRE[d], u: 1, hand: WIRE[d][WIRE[d].length - 1], working: settle < SPRING, wobble };
}

function drawWire(g, pts, x0, y0, wobble = 0) {
  const p = pts.map(([x, y], i) => [x0 + x + (i === pts.length - 1 ? wobble : 0), y0 + y]);
  g.stroke(p, 3, ON);
}

// ------------------------------------------------------------ the hour turn

const HOUR_DUR = 2.6;   // total show, after :00
const H_UNHOOK = 0.9, H_SWAP = 0.5, H_HANG = 1.2;

function hourState(tau) {
  if (tau < 0 || tau > HOUR_DUR) return null;
  if (tau < H_UNHOOK) return { phase: 'unhook', u: progress(tau, 0, H_UNHOOK) };
  if (tau < H_UNHOOK + H_SWAP) return { phase: 'swap', u: progress(tau, H_UNHOOK, H_UNHOOK + H_SWAP) };
  return { phase: 'hang', u: progress(tau, H_UNHOOK + H_SWAP, H_UNHOOK + H_SWAP + H_HANG) };
}

// ------------------------------------------------------------ the face

export default {
  name: 'Wire-Bender',
  blurb: 'A clockwork figure bends one wire into the time with its own two hands: a hook-plaque of finished hours above, a flywheel and an escapement ticking below; each minute it unbends and rebends the wire kink by kink, and the hour gets a little bow.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  driver: 'full',

  frame(g, ctx) {
    const { fields: f, date, oled, night } = ctx;
    const t = date.getTime() / 1000;
    const sec = f.sec;
    const [ox, oy] = orbit(date, 2, 4);

    const late = sec >= 59.4;
    const curF = f, nextDigits = digitsOf({ hh: f.hh, mm: String((f.m + 1) % 60).padStart(2, '0') });
    const now = digitsOf(f);
    // tau is seconds relative to :00 of the *upcoming* minute when late, so
    // the unbend can start a touch before the clock actually ticks over.
    const tau = late ? sec - 60 : sec;
    const prevMM = String((f.m + 59) % 60).padStart(2, '0');
    const prevDigits = [Number(f.hh[0]), Number(f.hh[1]), Number(prevMM[0]), Number(prevMM[1])];
    const curDigits = now;
    const futureMM = String((f.m + 1) % 60).padStart(2, '0');
    const nextMinuteDigits = [Number(f.hh[0]), Number(f.hh[1]), Number(futureMM[0]), Number(futureMM[1])];

    // Which minute digit (0 or 1, i.e. tens/units of mm) is "this" one at
    // time tau: late in the minute we're already previewing the hand
    // starting on next minute's digits.
    const mTarget = late ? nextMinuteDigits.slice(2) : curDigits.slice(2);
    const mPrev = late ? curDigits.slice(2) : prevDigits.slice(2);

    const slots = [0, 1].map((i) => minuteSlot(mTarget[i], mPrev[i], tau));

    // Hour turn choreography (only near :00 of hour 0).
    const hourTau = f.m === 0 ? sec : -999;
    const hState = f.m === 0 ? hourState(hourTau) : null;
    const prevHourF = f.m === 0 ? { hh: String((f.h + 23) % 24).padStart(2, '0') } : null;
    const prevHourDigits = prevHourF ? [Number(prevHourF.hh[0]), Number(prevHourF.hh[1])] : null;
    const curHourDigits = [Number(f.hh[0]), Number(f.hh[1])];

    // ---------------- the plaque: two hour wires on hooks

    for (let i = 0; i < 2; i++) {
      const x0 = PLAQUE_X[i], y0 = PLAQUE_Y;
      drawHook(g, x0 + 7 + ox, y0 - 3 + oy);
      let swing = 0.05 * Math.sin(t * 0.8 + i * 2);
      let digit = curHourDigits[i];
      let visible = true;
      if (hState) {
        if (hState.phase === 'unhook') { swing = -0.5 * ease.outBack(hState.u); digit = prevHourDigits[i]; if (hState.u > 0.85) visible = false; }
        else if (hState.phase === 'swap') visible = false;
        else {
          swing = 0.6 * (1 - ease.outElastic(hState.u));
          digit = curHourDigits[i];
          visible = hState.u > 0.02;
        }
      }
      if (visible) drawHung(g, digit, x0 + ox, y0 + oy, swing);
    }
    // A thin shelf under the plaque.
    g.line(PLAQUE_X[0] + 1 + ox, PLAQUE_Y + GH + 2 + oy, PLAQUE_X[1] + GW - 1 + ox, PLAQUE_Y + GH + 2 + oy, ON);

    // ---------------- the bench, and the figure reaching to each hand

    g.line(FIG_X - 4 + ox, BENCH_Y + oy, SLOT_X[1] + GW + 4 + ox, BENCH_Y + oy, ON);

    const anyWorking = slots.some((s) => s.working);
    const idleSway = 2 * Math.sin(t * 0.5);
    const targets = [0, 1].map((i) => {
      const s = slots[i];
      return s.working
        ? [SLOT_X[i] + ox + s.hand[0], SLOT_Y + oy + s.hand[1]]
        : [SLOT_X[i] + ox + GW / 2, SLOT_Y + oy + GH - 3 + (i === 0 ? idleSway : -idleSway)];
    });

    const lookX = anyWorking ? (slots[0].working ? -1 : 1) : Math.sin(t * 0.4);
    const lookY = anyWorking ? -0.3 : 0;
    const headTilt = anyWorking
      ? (slots[0].working && !slots[1].working ? -0.3 : slots[1].working && !slots[0].working ? 0.3 : 0)
      : 0.2 * Math.sin(t * 0.5);

    let bow = 0;
    if (hState && hState.phase === 'hang') bow = 0.3 * Math.sin(Math.PI * hState.u);
    // Drawn before the wires, so each wire sits visibly in front of the arm
    // reaching to it — the hand is working the near side of the metal.
    drawFigure(g, ox, oy + bow * 3, t, lookX, lookY, targets[0], targets[1], headTilt);

    for (let i = 0; i < 2; i++) {
      const x0 = SLOT_X[i] + ox, y0 = SLOT_Y + oy;
      const s = slots[i];
      drawWire(g, s.pts ?? s.wire, x0, y0, s.wobble ?? 0);
    }

    // ---------------- the mechanism, always turning

    drawFlywheel(g, FLY_X + ox, FLY_Y + oy, t);
    drawEscapement(g, ESC_X + ox, ESC_Y + oy, sec);

    oled.contrast(0xcf + (0x20 - 0xcf) * night);
  },
};
