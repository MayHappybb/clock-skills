// Numberfolk — the digits are little people.
//
// Each numeral is a character whose body IS the numeral: a fat stroke (7 px)
// round a centre-line, so it reads as a bold digit across a room, with eyes
// cut out of it (dark on lit), shoes, and arms when it has something to say.
// Counters double as mouths: the 8 is a snowman in a top hat with an "o" of
// surprise, the 9 gazes upwards open-mouthed, the 0 is a calm ghost with
// half-shut eyes. The 1 is shy and looks at its feet, peeking at a
// neighbour now and then; the 2 waddles; the 3 wears a bow and giggles; the
// 4 is the keen one with its hand up, tapping a foot; the 5 wears its top
// bar as a cap and puffs its chest; the 6 bobs to a tune under its quiff;
// the 7 leans, in shades. Everyone blinks, glances about and hops now and
// then. The colon is two small pets that take turns to hop, once a second.
//
// At the minute turn the leaving digits say goodbye one after another, ones
// first, all gone by :59.9: wave and jump off the bottom of the glass, drop
// through a manhole, float off under a balloon, or shrink and go poof. From
// :00 the new ones arrive left to right: by parachute, up out of a manhole,
// dropped in with a squashy bounce, or in a somersault from below (never for
// a 6 or 9, which upside down would be each other). The others watch whoever
// is moving. The choices come from noise(minuteKey), so they change every
// minute and a still agrees with the animation round it. On the hour,
// after the arrivals, there is a party: confetti, a stadium wave left to
// right with the pets in the middle, then everyone cheers, and the snowman
// raises its hat.
//
// Every frame comes from the clock alone: the turn is scheduled backwards
// from :00 using this minute's digits and the next minute's, idle life from
// the absolute time, so any instant renders on its own.
//
// Burn-in: the troupe walks a 2-pixel orbit sideways and a 3-pixel one up
// and down, out of step; the bodies breathe and the faces move. From 00:00
// to 06:00 everyone sleeps (eyes shut, a zed floats up) and from 23:00 to
// 07:00 the panel runs at low contrast.

import { sprite, ease, progress, noise, orbit, polar, previousMinute, clockFields, segDist, font3x5, ON, OFF } from '../js/kit.js';

const TAU = Math.PI * 2;

// ------------------------------------------------------------ the bodies
//
// Each numeral is a centre-line in a 24x40 box, stroked R either side, so a
// body can be squashed, leant and spun by mapping pixels back into the box.

const BW = 24, BH = 40, R = 3.6;

/** An arc of a superellipse (e < 1 squares it off), clock angles. */
function arc(cx, cy, rx, ry, a0, a1, n = 20, e = 0.8) {
  const pw = (v) => Math.sign(v) * Math.abs(v) ** e;
  const pts = [];
  for (let k = 0; k <= n; k++) {
    const a = a0 + ((a1 - a0) * k) / n;
    pts.push([cx + rx * pw(Math.sin(a)), cy - ry * pw(Math.cos(a))]);
  }
  return pts;
}

const SKEL = {
  0: [arc(12, 20, 8.2, 16, 0, TAU, 40, 0.62)],
  1: [[[6, 10], [13, 4], [13, 36]]],
  2: [[...arc(12, 12, 8, 8.5, -1.25, 2.2, 16), [4, 36], [20, 36]]],
  3: [arc(12, 11.5, 7.5, 7.5, -1.3, Math.PI, 14), arc(12, 27.5, 8, 8.5, 0, 4.0, 16)],
  4: [[[12, 4], [4, 26], [21, 26]], [[17, 14], [17, 36]]],
  5: [[[20, 4], [6, 4], [5, 18]], arc(11.5, 26.5, 8.5, 9.5, -0.75, 4.0, 18)],
  6: [arc(12, 20.5, 8, 15.5, 0.75, -Math.PI, 18), arc(12, 27.5, 8, 8.5, 0, TAU, 24)],
  7: [[[4, 4], [20, 4], [9, 36]]],
  8: [arc(12, 11, 6.5, 7, 0, TAU, 20), arc(12, 27.5, 8, 8.5, 0, TAU, 24)],
};
SKEL[9] = SKEL[6].map((pl) => pl.map(([x, y]) => [BW - x, BH - y]));

const SEGS = {};
for (const d in SKEL) {
  const s = [];
  for (const pl of SKEL[d]) for (let i = 1; i < pl.length; i++) s.push([pl[i - 1][0], pl[i - 1][1], pl[i][0], pl[i][1]]);
  SEGS[d] = s;
}

// Where each body keeps its face (between the eyes), its feet and shoulders.
const BODY = {
  0: { face: [12, 4.5], feet: [7, 17], arms: [[1, 22], [23, 22]] },
  1: { face: [13, 9], feet: [10, 16], arms: [[9, 14], [17, 14]] },
  2: { face: [12, 4.5], feet: [6, 18], arms: [[17, 16], [20, 34]] },
  3: { face: [12, 4.5], feet: [7, 16], arms: [[19, 12], [21, 28]] },
  4: { face: [17, 17], feet: [14, 20], arms: [[3, 26], [21, 26]] },
  5: { face: [14, 17.5], feet: [7, 16], arms: [[2, 10], [21, 27]] },
  6: { face: [13, 19], feet: [7, 17], arms: [[1, 22], [21, 27]] },
  7: { face: [12, 3.5], feet: [6, 12], arms: [[13, 20], [19, 20]] },
  8: { face: [12, 4.5], feet: [7, 17], arms: [[5, 13], [19, 13]] },
  9: { face: [12, 4.5], feet: [9, 16], arms: [[3, 13], [23, 13]] },
};

/** A pose maps the box to the screen: pivot at the feet (12, 40). */
function matrix({ sx = 1, sy = 1, rot = 0, skew = 0 }) {
  const c = Math.cos(rot), s = Math.sin(rot);
  const a = c * sx, b = c * skew * sy - s * sy, cc = s * sx, d = s * skew * sy + c * sy;
  const det = a * d - b * cc;
  return { a, b, c: cc, d, ia: d / det, ib: -b / det, ic: -cc / det, id: a / det };
}

function toScreen(pose, M, lx, ly) {
  const x = lx - BW / 2, y = ly - BH;
  return [pose.x + M.a * x + M.b * y, pose.y + M.c * x + M.d * y];
}

function drawBody(g, d, pose, c = ON) {
  const M = matrix(pose), segs = SEGS[d];
  const cs = [[-R, -R], [BW + R, -R], [-R, BH + R], [BW + R, BH + R]].map(([x, y]) => toScreen(pose, M, x, y));
  const xs = cs.map((p) => p[0]), ys = cs.map((p) => p[1]);
  const box = [Math.min(...xs) - 1, Math.min(...ys) - 1, Math.max(...xs) - Math.min(...xs) + 2, Math.max(...ys) - Math.min(...ys) + 2];
  g.fillWhere((px, py) => {
    const dx = px - pose.x, dy = py - pose.y;
    const lx = M.ia * dx + M.ib * dy + BW / 2, ly = M.ic * dx + M.id * dy + BH;
    for (const s of segs) if (segDist(lx, ly, s[0], s[1], s[2], s[3]) <= R) return true;
    return false;
  }, c, box);
  return M;
}

/** The pose whose body centre (12, 20) sits at (cx, cy). */
function centred(cx, cy, p) {
  const M = matrix(p);
  return { ...p, x: cx + 20 * M.b, y: cy + 20 * M.d };
}

// ------------------------------------------------------------ faces, feet, arms
//
// Eyes are cut out of the lit body: dark on white reads as eyes from across
// a room where a lit pupil on a lit body would not.

function drawEyes(g, ex, ey, style, lx = 0, ly = 0, w = 3) {
  ex = Math.round(ex); ey = Math.round(ey);
  const L = ex - w - 1 + lx, Rx = ex + 1 + lx, y = ey - 2 + ly;
  const both = (fn) => { fn(L); fn(Rx); };
  switch (style) {
    case 'open': both((x) => g.fillRect(x, y, w, 4, OFF)); break;
    case 'calm':
    case 'down': both((x) => g.fillRect(x, y + 2, w, 2, OFF)); break;
    case 'shut': both((x) => g.fillRect(x, y + 2, w, 1, OFF)); break;
    case 'wide': both((x) => g.fillRect(x, y, w, 4, OFF).pixel(x + (w >> 1), y + 1, ON)); break;
    case 'happy': both((x) => {
      // ^ ^ : a little arch, closed tight with joy
      if (w > 2) g.pixel(x + 1, y + 1, OFF).pixel(x, y + 2, OFF).pixel(x + 2, y + 2, OFF).pixel(x, y + 3, OFF).pixel(x + 2, y + 3, OFF);
      else g.pixel(x - 1, y + 3, OFF).pixel(x, y + 2, OFF).pixel(x + 1, y + 2, OFF).pixel(x + 2, y + 3, OFF);
    }); break;
    case 'shades':
      // Cool: a bar of dark glass, and the lenses hanging off it.
      g.fillRect(L - 1, y + 1, Rx + w + 2 - L, 1, OFF);
      g.fillRect(L - 1, y + 2, w + 1, 1, OFF).fillRect(Rx, y + 2, w + 1, 1, OFF);
      g.fillRect(L, y + 3, w - 1, 1, OFF).fillRect(Rx + 1, y + 3, w - 1, 1, OFF);
      break;
  }
}

const FOOT = sprite(`
  .###
  ####
`);

function drawFeet(g, d, pose, M, lift = [0, 0]) {
  const [a, b] = BODY[d].feet;
  const [lx, ly] = toScreen(pose, M, a, BH - 0.5), [rx, ry] = toScreen(pose, M, b, BH - 0.5);
  g.blit(FOOT, lx - 3 - lift[0], ly - lift[0]);
  g.blit(FOOT, rx - 1 + lift[1], ry - lift[1], { flipX: true });
}

/** An arm from shoulder `side` (0 left, 1 right) to a hand at (hx, hy). */
function drawArm(g, d, pose, M, side, hx, hy) {
  const [sx, sy] = toScreen(pose, M, ...BODY[d].arms[side]);
  g.thickLine(sx, sy, hx, hy, 1.5);
  g.fillRect(Math.round(hx) - 1, Math.round(hy) - 1, 2, 2);
}

const HAT = sprite(`
  ..#######..
  ..#######..
  ..#######..
  ...........
  ###########
`);
const BOW = sprite(`
  ##...##
  #######
  ##...##
`);

// ------------------------------------------------------------ the troupe

const SLOT_X = [3, 30, 74, 101];     // left edge of each 24-wide slot
const BASE = 51;                     // where the feet stand
const STYLE = { 0: 'calm', 1: 'down', 7: 'shades' };

/** A fresh actor for digit d in slot i, standing still. */
function actor(i, d, ox, oy) {
  return { i, d, x: SLOT_X[i] + 12 + ox, y: BASE + oy, sx: 1, sy: 1, rot: 0, skew: 0, eyes: STYLE[d] ?? 'open', look: [0, 0], arms: [], lift: [0, 0], hat: 0 };
}

/** Each digit's idle life, from the absolute time T (seconds). */
function idle(A, T, night) {
  const { i, d } = A, seed = i * 13 + d * 7;
  const per = d === 0 ? 5.5 : 3 + ((seed % 5) * 0.3);
  const br = Math.sin((TAU * T) / per + i * 1.7);
  A.sy = 1 + (d === 0 ? 0.03 : 0.02) * br;
  A.sx = 1 - 0.012 * br;
  if (night) { A.eyes = 'shut'; return A; }

  // Glances: a new idea every couple of seconds (0 is in no hurry).
  const gp = d === 0 ? 6 : 2.6, gw = Math.floor(T / gp + i * 0.31), gn = noise(gw, seed);
  A.look[0] = gn < 0.3 ? -1 : gn > 0.7 ? 1 : 0;
  if (d === 9) A.look[1] = gn > 0.4 && gn < 0.8 ? -1 : 0;        // the dreamer looks up
  if (d === 1) {
    // Shy: looks at its feet, and now and then peeks at a neighbour.
    A.look = [0, 0];
    if (gn > 0.72) { A.eyes = 'open'; A.look[0] = i % 2 ? -1 : 1; A.skew = -0.07 * A.look[0]; }
  }

  // Blinks.
  const bp = 3.7 + i * 0.37, bw = Math.floor(T / bp), bph = T - bw * bp;
  if (d !== 7 && noise(bw, seed + 5) < 0.75 && bph < 0.14) A.eyes = 'shut';

  // Personalities.
  if (d === 2) A.rot = 0.05 * Math.sin((TAU * T) / 1.7 + i);                // waddles
  if (d === 7) A.skew = 0.1 + 0.025 * Math.sin((TAU * T) / 4.3);            // leans, cool
  if (d === 8) A.rot = 0.03 * Math.sin((TAU * T) / 2.9 + i);                // sways in the cold
  if (d === 5) A.sx *= 1.03;                                                // chest out
  if (d === 6) A.y -= Math.round(Math.abs(Math.sin(Math.PI * T * 1.1)));   // bobs to a tune
  if (d === 4 && Math.floor(T) % 2 === 0 && T % 1 < 0.2) A.lift[1] = 1;    // taps a foot
  if (d === 3) {                                                            // giggles
    const w = Math.floor(T / 5.1), ph = T - w * 5.1;
    if (noise(w, seed + 9) < 0.45 && ph < 0.9) { A.sx *= 1 + 0.05 * Math.sin(TAU * 9 * ph); A.eyes = 'happy'; }
  }
  // A shuffle of the feet, now and then.
  const sw = Math.floor(T / 4.3 + i * 0.5), sph = T - (sw - i * 0.5) * 4.3;
  if (noise(sw, seed + 3) < 0.35 && sph < 0.6) A.lift[Math.floor(sph / 0.15) % 2] = 1;

  // Little hops (9 and 5 like them most, 0 hardly ever).
  const HOP = { 0: 0.05, 1: 0.1, 5: 0.35, 9: 0.35 };
  const hw = Math.floor(T / 6.1 + i * 0.23), hph = T - (hw - i * 0.23) * 6.1;
  if (noise(hw, seed + 1) < (HOP[d] ?? 0.2)) hop(A, hph, 4);
  return A;
}

/** A small hop starting at phase 0: squat, up `h` pixels, land. */
function hop(A, ph, h) {
  if (ph < 0.12) { const s = Math.sin((Math.PI * ph) / 0.12); A.sy *= 1 - 0.1 * s; A.sx *= 1 + 0.06 * s; }
  else if (ph < 0.52) { const u = (ph - 0.12) / 0.4; A.y -= h * Math.sin(Math.PI * u); A.sy *= 1.04; }
  else if (ph < 0.64) { const s = Math.sin((Math.PI * (ph - 0.52)) / 0.12); A.sy *= 1 - 0.08 * s; A.sx *= 1 + 0.05 * s; }
}

// ------------------------------------------------------------ leaving
//
// Each exit is a function of tau, seconds since it began, and returns what
// to draw: the actor (or null once it has gone) and any props.

const EXIT = 2.4;
const EXITS = ['jump', 'manhole', 'balloon', 'poof'];

function leave(A, kind, tau) {
  const out = { actor: A };
  A.look = [0, 0];
  if (kind === 'jump') {
    // Waves goodbye, crouches, and jumps off the bottom of the glass.
    if (tau < 1.1) {
      A.eyes = 'happy';
      A.arms = [[1, 4 + 2 * Math.sin(TAU * 3 * tau), -10]];
    } else if (tau < 1.35) {
      const s = Math.sin((Math.PI * (tau - 1.1)) / 0.25);
      A.sy *= 1 - 0.16 * s; A.sx *= 1 + 0.1 * s; A.eyes = 'shut';
    } else {
      const tt = tau - 1.35;
      A.y += -55 * tt + 190 * tt * tt;
      A.sy *= 1.08; A.eyes = 'wide';
      A.arms = [[0, -3, -9], [1, 3, -9]];
      if (A.y > BASE + 70) out.actor = null;
    }
  } else if (kind === 'manhole') {
    // A hole opens under its feet. It looks down, panics, drops.
    const open = ease.outBack(progress(tau, 0, 0.35)) * (1 - progress(tau, 2.0, 2.3));
    out.hole = { x: A.x, y: A.y + 2, rx: 12 * open };
    if (tau < 0.4) { A.look = [0, 1]; }
    else if (tau < 1.3) { A.eyes = 'wide'; A.rot = 0.04 * Math.sin(TAU * 11 * tau); A.arms = [[0, -4, -7], [1, 4, -7]]; }
    else {
      const tt = tau - 1.3;
      A.y += 600 * tt * tt; A.eyes = 'wide'; A.arms = [[0, -3, -10], [1, 3, -10]];
      if (tt > 0.4) out.actor = null;
    }
    A.clipY = out.hole.y;
  } else if (kind === 'balloon') {
    // Blows up a balloon and floats away off the top.
    const r = 4.5 * ease.outBack(progress(tau, 0, 0.8));
    A.eyes = 'happy'; A.look = [0, -1];
    A.y -= 80 * ease.inQuad(progress(tau, 0.9, 2.4));
    if (tau > 0.9) A.lift = Math.floor(tau * 8) % 2 ? [2, 0] : [0, 2];
    A.arms = [[1, 3, -11]];
    out.balloon = r;
    if (tau >= 2.4) out.actor = null;
  } else {
    // Shivers, shrinks to nothing and goes poof.
    const cx = A.x, cy = A.y - 20;
    if (tau < 0.6) { A.rot = 0.07 * Math.sin(TAU * 10 * tau); A.eyes = 'shut'; }
    const k = 1 - ease.inCubic(progress(tau, 0.6, 1.1));
    if (tau < 1.1) {
      Object.assign(A, centred(cx, cy, { ...A, sx: A.sx * k, sy: A.sy * k, rot: A.rot + 2 * (1 - k) }));
      if (k < 0.7) A.bare = true;   // no eyes or feet on something that small
    } else out.actor = null;
    if (tau > 0.95) out.puff = { x: cx, y: cy, u: progress(tau, 0.95, 2.0) };
  }
  return out;
}

// ------------------------------------------------------------ arriving

const ENTRY = 2.2;
const ENTRIES = ['parachute', 'manhole', 'bounce', 'flip'];

function arrive(A, kind, tau) {
  const out = { actor: A };
  if (kind === 'parachute') {
    // Drifts down under a canopy, lands, and the canopy folds away.
    const u = progress(tau, 0, 1.7);
    A.y -= 70 * (1 - ease.outQuad(u));
    A.rot = 0.12 * Math.sin(TAU * 0.8 * tau) * (1 - u);
    A.eyes = u < 1 ? 'happy' : 'open'; A.look = [0, u < 1 ? 1 : 0];
    out.chute = { fold: progress(tau, 1.7, 2.15) };
  } else if (kind === 'manhole') {
    // Pops up out of a manhole: ta-da.
    const open = ease.outBack(progress(tau, 0, 0.3)) * (1 - progress(tau, 1.5, 1.8));
    out.hole = { x: A.x, y: A.y + 2, rx: 12 * open };
    A.y += 48 * (1 - ease.outBack(progress(tau, 0.3, 0.85)));
    A.clipY = out.hole.y;
    A.eyes = tau < 0.85 ? 'wide' : 'happy';
    if (tau > 0.8 && tau < 1.6) A.arms = [[0, -6, -8], [1, 6, -8]];
  } else if (kind === 'bounce') {
    // Dropped in from above: lands, bounces, squashes.
    const u = progress(tau, 0, 1.4);
    A.y -= 66 * (1 - ease.outBounce(u));
    for (const [uc, amp] of [[1 / 2.75, 0.22], [2 / 2.75, 0.12], [2.5 / 2.75, 0.06], [1, 0.04]]) {
      const s = Math.max(0, 1 - Math.abs(u - uc) / 0.045);
      A.sy *= 1 - amp * s; A.sx *= 1 + amp * 0.7 * s;
    }
    A.eyes = u < 0.36 ? 'wide' : u < 1 ? 'shut' : 'happy';
    if (u < 0.3) A.sy *= 1.06;
  } else {
    // A somersault up from below the glass, landing with a flourish.
    const tt = Math.min(tau, 1.1), dir = A.i < 2 ? 1 : -1;
    const cy = A.y - 20 + 60 - 193 * tt + 125.8 * tt * tt;
    const rot = dir * TAU * ease.inOutQuad(tt / 1.1);
    Object.assign(A, centred(A.x, cy, { ...A, rot }));
    A.eyes = tau < 1.1 ? 'wide' : 'happy';
    if (tau >= 1.1) {
      const s = Math.sin(Math.PI * progress(tau, 1.1, 1.4));
      A.sy *= 1 - 0.15 * s; A.sx *= 1 + 0.1 * s;
      if (tau < 1.9) A.arms = [[0, -6, -4], [1, 6, -4]];
    }
  }
  return out;
}

// ------------------------------------------------------------ drawing a slot

function drawActor(g, A) {
  const { d } = A;
  if (A.clipY !== undefined) g.clip(0, 0, 128, Math.round(A.clipY));
  const M = drawBody(g, d, A);
  if (!A.bare) {
    const [ex, ey] = toScreen(A, M, ...BODY[d].face);
    drawEyes(g, ex, ey, A.eyes, d === 1 ? 0 : A.look[0], A.look[1], d === 1 || d === 4 ? 2 : 3);
    drawFeet(g, d, A, M, A.lift);
    if (d === 8) {
      const [hx, hy] = toScreen(A, M, 12, 0);
      g.blit(HAT, hx - 5, hy - 6 - A.hat);
    }
    if (d === 3) {
      const [bx, by] = toScreen(A, M, 7, 1);
      g.fillRect(Math.round(bx) - 4, Math.round(by) - 3, 9, 5, OFF);
      g.blit(BOW, bx - 3, by - 2);
    }
  }
  for (const [side, dx, dy] of A.arms) {
    const [sx, sy] = toScreen(A, M, ...BODY[d].arms[side]);
    drawArm(g, d, A, M, side, sx + dx, sy + dy);
  }
  if (A.clipY !== undefined) g.unclip();
  return M;
}

function drawHole(g, { x, y, rx }) {
  if (rx < 1) return;
  const ry = Math.max(1, rx / 6);
  const e = (px, py, a, b) => ((px - x) / a) ** 2 + ((py - y) / b) ** 2 <= 1;
  g.fillWhere((px, py) => e(px, py, rx + 1, ry + 1), OFF, [x - rx - 3, y - ry - 3, 2 * rx + 6, 2 * ry + 6]);
  g.fillWhere((px, py) => e(px, py, rx + 1, ry + 1) && !e(px, py, rx, ry), ON, [x - rx - 3, y - ry - 3, 2 * rx + 6, 2 * ry + 6]);
}

function drawSlot(g, S, T) {
  if (S.hole) drawHole(g, S.hole);
  const A = S.actor;
  let M = null;
  if (A) M = drawActor(g, A);
  if (S.balloon && A) {
    const [sx, sy] = toScreen(A, M, ...BODY[A.d].arms[1]);
    const hx = sx + 3, hy = sy - 11, r = S.balloon;
    const bx = hx + 2 + Math.sin(T * 3) * 1.5, by = hy - 6 - r;
    g.line(hx, hy, bx, by + r);
    g.fillCircle(bx, by, r + 1, OFF);
    g.ring(bx, by, r - 1.2, r);
    g.pixel(bx - r / 2, by - r / 2);
    g.pixel(bx, by + r + 1);
  }
  if (S.chute && A && S.chute.fold < 1) {
    // The canopy: a dome with two gores and a hem, on lines to
    // the shoulders. On landing it sags and folds away.
    const [hx, hy] = toScreen(A, M, 12, 0);
    const fold = S.chute.fold;
    const cx = hx, cy = hy - 3 + 2 * fold, rx = 13 * (1 - 0.5 * fold), ry = 6 * (1 - fold) + 0.6;
    g.fillWhere((px, py) => {
      if (py > cy) return false;
      const e = ((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2;
      if (e > 1) return false;
      if (e > 0.55) return true;
      return Math.abs(Math.abs(px - cx) - rx * 0.4) < 0.6 || py > cy - 1;
    }, ON, [cx - rx - 1, cy - ry - 1, 2 * rx + 2, ry + 2]);
    if (fold === 0) for (const side of [0, 1]) {
      const [sx, sy] = toScreen(A, M, side ? 23 : 1, 10);
      g.line(cx + (side ? rx - 1 : 1 - rx), cy, sx, sy);
    }
  }
  if (S.puff && S.puff.u > 0 && S.puff.u < 1) {
    const { x, y, u } = S.puff, rr = 3 + 9 * ease.outCubic(u);
    for (let k = 0; k < 7; k++) {
      const [px, py] = polar(x, y, rr, (k / 7) * TAU + 0.4);
      const pr = 2.5 * (1 - u) + 0.6;
      g.fillWhere((qx, qy) => Math.hypot(qx - px, qy - py) <= pr && 1 - u * 0.8, ON, [px - pr - 1, py - pr - 1, 2 * pr + 2, 2 * pr + 2]);
    }
  }
}

// ------------------------------------------------------------ the colon: two pets

const PET_X = 61, PET_Y = [22, 36];

function drawPet(g, x, y, look, shut) {
  x = Math.round(x); y = Math.round(y);
  g.fillRect(x + 1, y, 4, 5).fillRect(x, y + 1, 6, 3);
  if (shut) g.pixel(x + 1, y + 3, OFF).pixel(x + 4, y + 3, OFF);
  else g.pixel(x + 1 + look, y + 2, OFF).pixel(x + 4 + look, y + 2, OFF);
}

// ------------------------------------------------------------ the hour: a party

function confetti(g, sec) {
  for (let k = 0; k < 56; k++) {
    const t0 = 4 + noise(k, 2) * 2.5, v = 9 + noise(k, 3) * 10, tt = sec - t0;
    if (tt < 0) continue;
    const y = -2 + v * tt, x = noise(k, 1) * 128 + 3 * Math.sin(tt * (2 + noise(k, 4) * 3) + k);
    if (y > 64) continue;
    if (Math.floor(tt * 6 + k) % 2) g.fillRect(Math.round(x), Math.round(y), 2, 1);
    else g.pixel(x, y).pixel(x, y + 1);
  }
}

const ZED = sprite(`
  ####
  ..#.
  .#..
  ####
`);

/** This minute's choice among n, the same all minute. */
const pick = (key, seed, n) => Math.floor(noise(key % 9973, seed) * 997) % n;
const digitsOf = (f) => [...`${f.hh}${f.mm}`].map(Number);
const STAGGER = 0.45;
const WAVE = 4.0, CHEER = [5.6, 8.6];

export default {
  name: 'Numberfolk',
  blurb: 'The digits are little characters: they blink, glance, wave goodbye and arrive in style.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,

  frame(g, { fields: f, date, oled, night: dim }) {
    const T = date.getTime() / 1000, sec = f.sec;
    const night = f.h < 6;
    oled.contrast(0xcf + (0x20 - 0xcf) * dim);  // night dimming, 23:00-07:00 (ctx.night)
    // Burn-in: the troupe walks a 2-pixel orbit, and bobs a 3-pixel one, out of step.
    const ox = orbit(date, 2, 3)[0], oy = orbit(new Date(date.getTime() + 17 * 60000), 3, 4)[1];

    const now = digitsOf(f), prev = digitsOf(previousMinute(date));
    const nextF = clockFields(new Date(date.getTime() + 60000)), next = digitsOf(nextF);
    // Who leaves this minute (ones first, the last one gone by :59.9) and who
    // arrives (left to right, from :00.05).
    const leaving = [3, 2, 1, 0].filter((i) => now[i] !== next[i]);
    const arriving = [0, 1, 2, 3].filter((i) => now[i] !== prev[i]);
    const leaveAt = (i) => 59.9 - EXIT - (leaving.length - 1 - leaving.indexOf(i)) * STAGGER;
    const arriveAt = (i) => 0.05 + arriving.indexOf(i) * STAGGER;
    // Whoever is on the move is watched by the others.
    const watch = sec > 55 ? leaving : sec < 4 ? arriving : [];

    const hourParty = f.m === 0 && sec > WAVE - 0.5 && sec < 12;
    if (hourParty) confetti(g, sec);

    for (let i = 0; i < 4; i++) {
      const A = actor(i, now[i], ox, oy);
      let S;
      if (leaving.includes(i) && sec >= leaveAt(i)) {
        S = leave(A, EXITS[pick(nextF.minuteKey, i + 40, EXITS.length)], sec - leaveAt(i));
      } else if (arriving.includes(i) && sec < arriveAt(i) + ENTRY) {
        let kind = ENTRIES[pick(f.minuteKey, i + 20, ENTRIES.length)];
        if (kind === 'flip' && (now[i] === 6 || now[i] === 9)) kind = 'bounce';   // upside down, a 6 is a 9
        S = sec < arriveAt(i) ? { actor: null } : arrive(A, kind, sec - arriveAt(i));
      } else {
        idle(A, T, night);
        const others = watch.filter((j) => j !== i);
        if (others.length) {
          const j = others.reduce((a, b) => (Math.abs(b - i) < Math.abs(a - i) ? b : a));
          A.look = [Math.sign(j - i), 0];
          if (A.eyes === 'down' || A.eyes === 'shut') A.eyes = 'open';
        }
        if (hourParty) party(A, sec);
        S = { actor: A };
      }
      drawSlot(g, S, T);
    }

    // The colon: two pets taking turns to hop, one a second.
    for (let k = 0; k < 2; k++) {
      let dy = 0;
      const frac = sec % 1;
      if (!night && Math.floor(sec) % 2 === k && frac < 0.35) dy = -2 * Math.sin((Math.PI * frac) / 0.35);
      if (hourParty) {
        const u = progress(sec, WAVE + 0.3 * 1.5 + 0.15 * k, WAVE + 0.3 * 1.5 + 0.15 * k + 0.5);
        dy -= 9 * Math.sin(Math.PI * u);
        if (sec > CHEER[0] && sec < CHEER[1]) dy -= 3 * Math.abs(Math.sin(TAU * 1.5 * (sec - CHEER[0]) + k));
      }
      let look = noise(Math.floor(T / 3.1), 50 + k) < 0.5 ? 0 : 1;
      if (watch.length) look = watch[0] >= 2 ? 1 : 0;
      drawPet(g, PET_X + ox, PET_Y[k] + oy + dy, look, night);
    }

    if (night) {
      // Snoring: a zed floats up from one sleeper.
      const i = Math.floor(noise(f.h, 7) * 4), p = (T % 2.6) / 2.6;
      if (p < 0.8 && sec > 4 && sec < 54) g.blit(ZED, SLOT_X[i] + 16 + ox + 4 * p, BASE - 46 + oy - 9 * p);
    }

    const date3 = `${f.dow} ${f.day} ${f.month}`;
    g.text(date3, 64 + ox - Math.round(font3x5.measure(date3) / 2), 56 + oy, { font: font3x5 });
  },
};

/** The hourly party: a stadium wave, left to right, then everyone cheers. */
function party(A, sec) {
  const u = progress(sec, WAVE + 0.3 * A.i, WAVE + 0.3 * A.i + 0.5);
  if (u > 0 && u < 1) {
    A.y -= 9 * Math.sin(Math.PI * u);
    A.arms = [[0, -3, -12], [1, 3, -12]];
    A.eyes = 'happy';
  }
  if (sec > CHEER[0] && sec < CHEER[1]) {
    const w = Math.sin(TAU * 3 * sec);
    A.arms = [[0, -4 - w, -12], [1, 4 + w, -12]];
    A.eyes = 'happy';
    A.y -= 2 * Math.abs(Math.sin(TAU * 1.5 * (sec - CHEER[0]) + A.i));
    A.hat = 4;
  }
}
