// The Fitter — a clockwork fitting shop whose numerals are machinery.
//
// Every digit is built from real brass parts: rods with a boss riveted at
// each end, bent rods, toothed spoked wheels. Nothing is a drawn glyph; the
// numeral is an assembly, and the assembly runs — the wheels in the bowls
// turn all minute, and the whole bench trembles with the machine.
//
// Two hands ride a lead screw over the bench. The minute is their work: the
// changed digit is undone part by part, each part lifted clear, carried down
// over the hopper and dropped in; then the new parts are drawn back out of
// the hopper and fitted one at a time, each seated with a tap. Whatever is
// off the plate is still on show, as a thin drawn plan of that part at its
// own place, taken only from the digit the clock is showing. So the numeral
// is never wrong — wrought parts plus the drawing of the rest — and the plan
// is wiped and redrawn the instant the minute ticks over.
//
// The hour is the machine's big turn: the flywheel winds up and throws the
// whole bench off the plate in one wave, the governor flies out, and the new
// parts are swung back in and caught.
//
// The lead screw, the flywheel (ticking out the seconds with its pallet), the
// mainspring and the ratchet it hauls all run all day. There is no date: the
// assembled time is the whole of it.
//
// Burn-in: the bench walks a 2 px orbit every three minutes (kit.orbit), the
// only still things are the plans, and the panel dims 23:00-07:00.

import { dither, clamp, ease, progress, orbit, previousMinute, clockFields } from '../js/kit.js';

const TAU = Math.PI * 2;
const PI = Math.PI;

// ---------------------------------------------------------------- primitives
// A part is drawn from primitives tested analytically in the part's own
// frame: a segment with round caps, a disc, or an elliptical annulus arc.

const RIM = 3.2;    // the thickness of a wrought part
const BOSS = 2.5;   // the round end of a rod
const HUB = 2.6;    // a wheel's centre
const RIV = 1.15;   // the rivet hole through a boss or hub

const seg = (x0, y0, x1, y1, w, deco = 0) => ({ s: [x0, y0, x1, y1], w, deco });
const disc = (x, y, r) => ({ c: [x, y], r });
const ell = (cx, cy, rx, ry, a) => [cx + rx * Math.sin(a), cy - ry * Math.cos(a)];

/** A straight rod: a stroke with a riveted boss at each end. */
const rod = (x0, y0, x1, y1, w = 3.1, boss = BOSS) => [seg(x0, y0, x1, y1, w), disc(x0, y0, boss), disc(x1, y1, boss)];

/** A bent rod: an arc of an ellipse, riveted at both ends. */
function bend(cx, cy, rx, ry, a0, a1, w = RIM) {
  const p = [{ e: [cx, cy], rx, ry, a0, a1, w }];
  const q0 = ell(cx, cy, rx, ry, a0), q1 = ell(cx, cy, rx, ry, a1);
  p.push(disc(q0[0], q0[1], BOSS), disc(q1[0], q1[1], BOSS));
  return p;
}

/** A toothed wheel: a rim, spokes from the hub, a riveted hub. */
function wheel(cx, cy, rx, ry, { spokes = 3, phase = 0, teeth = 0, hub = HUB, rim = RIM } = {}) {
  // The rim is marked fixed: a wheel's spokes and teeth turn, its rim — an
  // oval, in a numeral that must stay upright — does not.
  const p = [{ e: [cx, cy], rx, ry, a0: 0, a1: TAU, w: rim, fix: 1 }];
  for (let i = 0; i < spokes; i++) {
    const a = phase + (i * TAU) / spokes;
    const q = ell(cx, cy, rx * 0.93, ry * 0.93, a);
    p.push(seg(cx, cy, q[0], q[1], 1.6, 1));
  }
  if (hub) p.push(disc(cx, cy, hub));
  for (let i = 0; i < teeth; i++) {
    const a = phase + (i * TAU) / teeth;
    const q0 = ell(cx, cy, rx + rim / 2 - 0.9, ry + rim / 2 - 0.9, a);
    const q1 = ell(cx, cy, rx + rim / 2 + 0.3, ry + rim / 2 + 0.3, a);
    p.push(seg(q0[0], q0[1], q1[0], q1[1], 1.7, 1));
  }
  return p;
}

/**
 * A part: primitives in the glyph's own coordinates, anchored so the whole
 * thing can be carried and turned as a rigid body. The anchor defaults to the
 * centre of the primitives; a hand passes its grip. Every boss and hub
 * carries a rivet hole, punched after the part is lit.
 */
function part(prims, anchor = null) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  const fit = (x, y) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); };
  const holes = [];
  for (const p of prims) {
    if (p.c) { fit(p.c[0] - p.r, p.c[1] - p.r), fit(p.c[0] + p.r, p.c[1] + p.r); if (p.r > 1.8) holes.push([p.c[0], p.c[1]]); }
    if (p.s) fit(p.s[0], p.s[1]), fit(p.s[2], p.s[3]);
    if (p.e) { const [cx, cy] = p.e, m = Math.max(p.rx, p.ry) + p.w / 2; fit(cx - m, cy - m), fit(cx + m, cy + m); }
  }
  const ax = anchor ? anchor[0] : (x0 + x1) / 2, ay = anchor ? anchor[1] : (y0 + y1) / 2;
  const local = prims.map((p) => {
    if (p.c) return { c: [p.c[0] - ax, p.c[1] - ay], r: p.r };
    if (p.s) return { s: [p.s[0] - ax, p.s[1] - ay, p.s[2] - ax, p.s[3] - ay], w: p.w, deco: p.deco };
    return { e: [p.e[0] - ax, p.e[1] - ay], rx: p.rx, ry: p.ry, a0: p.a0, a1: p.a1, w: p.w, fix: p.fix };
  });
  return {
    x: ax, y: ay, w: x1 - x0, h: y1 - y0,
    prims: local, holes: holes.map(([hx, hy]) => [hx - ax, hy - ay]),
  };
}

// ---------------------------------------------------------------- painting

const CULL = 1.6;
const HOLES = [];          // rivet holes, punched once everything is lit

/**
 * Lay a part with its anchor at the canvas point (X, Y).
 *   th    turn the whole part by this angle
 *   spin  turn only the prims not marked fixed — a wheel's spokes and teeth,
 *         whose oval rim has to stay upright in a numeral one has to read
 *   S     draw it at this scale
 *   thin  1 is a wrought part; less draws it as a thinner line, the plan
 *   level 1 is solid, less is a dither (the plan, going out)
 * Only whole wrought parts donate rivet holes.
 */
function place(g, P, X, Y, o = {}) {
  const th = o.th ?? 0, spin = o.spin ?? 0, S = o.S ?? 1, K = o.thin ?? 1, L = clamp(o.level ?? 1, 0, 1);
  const solid = L >= 1;
  const c = Math.cos(th), s = Math.sin(th);
  const cs = Math.cos(th + spin), ss = Math.sin(th + spin);
  const wOf = (w) => Math.max(1.05, w * K);
  for (const p of P.prims) {
    if (!solid && p.deco) continue;            // a plan is drawn without its teeth
    const rc = p.fix ? c : cs, rs = p.fix ? s : ss;
    if (p.c) {
      const wx = X + S * (p.c[0] * rc - p.c[1] * rs), wy = Y + S * (p.c[0] * rs + p.c[1] * rc);
      const h = wOf(p.r), r = S * h + CULL, h2 = S * S * h * h;
      if (solid) g.fillWhere((px, py) => (px - wx) ** 2 + (py - wy) ** 2 <= h2, 1, [wx - r, wy - r, 2 * r, 2 * r]);
      else g.fillWhere((px, py, ix, iy) => (px - wx) ** 2 + (py - wy) ** 2 <= h2 && dither(ix, iy, L), 1, [wx - r, wy - r, 2 * r, 2 * r]);
    } else if (p.s) {
      const ax = X + S * (p.s[0] * rc - p.s[1] * rs), ay = Y + S * (p.s[0] * rs + p.s[1] * rc);
      const bx = X + S * (p.s[2] * rc - p.s[3] * rs), by = Y + S * (p.s[2] * rs + p.s[3] * rc);
      const h = wOf(p.w / 2), r = S * h + CULL, h2 = S * S * h * h;
      const ex = bx - ax, ey = by - ay, l2 = ex * ex + ey * ey;
      const box = [Math.min(ax, bx) - r, Math.min(ay, by) - r, Math.abs(ex) + 2 * r, Math.abs(ey) + 2 * r];
      const test = (px, py) => {
        const ux = px - ax, uy = py - ay;
        const u = l2 ? Math.max(0, Math.min(1, (ux * ex + uy * ey) / l2)) : 0;
        return (ux - u * ex) ** 2 + (uy - u * ey) ** 2 <= h2;
      };
      if (solid) g.fillWhere(test, 1, box);
      else g.fillWhere((px, py, ix, iy) => test(px, py) && dither(ix, iy, L), 1, box);
    } else {
      const [ecx, ecy] = p.e, rx = p.rx, ry = p.ry, h = wOf(p.w / 2);
      const m = (rx + ry) / 2, span = ((p.a1 - p.a0) % TAU + TAU) % TAU, full = Math.abs(p.a1 - p.a0) >= TAU - 1e-6;
      const wx = X + S * (ecx * rc - ecy * rs), wy = Y + S * (ecx * rs + ecy * rc);
      const ex = S * Math.hypot(rx * rc, ry * rs), ey = S * Math.hypot(rx * rs, ry * rc);
      const cull = S * h + CULL;
      const test = (px, py) => {
        const qx = (px - wx) / S, qy = (py - wy) / S;
        const lx = qx * rc + qy * rs, ly = -qx * rs + qy * rc;
        const rho = Math.hypot(lx / rx, ly / ry);
        if (rho < 1e-6 || Math.abs((rho - 1) * m) > h) return false;
        if (!full) {
          const a = Math.atan2(lx / rx, -ly / ry) - p.a0;
          if (((a % TAU) + TAU) % TAU > span + 1e-9) return false;
        }
        return true;
      };
      const box = [wx - ex - cull, wy - ey - cull, 2 * (ex + cull), 2 * (ey + cull)];
      if (solid) g.fillWhere(test, 1, box);
      else g.fillWhere((px, py, ix, iy) => test(px, py) && dither(ix, iy, L), 1, box);
    }
  }
  if (solid) for (const [hx, hy] of P.holes) HOLES.push([X + S * (hx * cs - hy * ss), Y + S * (hx * ss + hy * cs)]);
}

// ---------------------------------------------------------------- the glyphs
// A box 16 wide and 26 tall. Straight strokes are rods with a boss at each
// end, curves are bent rods, bowls are toothed wheels.

const DT = 2.6, DL = 2.6, DR = 13.4, DC = 8.0;

const GLYPH = {
  0: [part(wheel(DC, 13, 5.2, 10.2, { spokes: 3, teeth: 10 }))],
  1: [part(rod(DC, DT, DC, 21.6, 3.1, 2.2)), part(rod(4.6, 21.6, 11.4, 21.6))],
  2: (() => {
    const cx = 8, cy = 8.4, r = 5.5, a = 0.86, p = ell(cx, cy, r, r, a);
    return [part(bend(cx, cy, r, r, -PI / 2, a)), part(rod(p[0], p[1], DL, 21.6)), part(rod(DL, 21.6, DR, 21.6))];
  })(),
  3: [part(bend(DC, 8.2, 5.0, 5.0, -PI / 2, 2.55)), part(bend(DC, 17.8, 5.0, 5.0, 0.59, 3.80))],
  4: [part(rod(11.4, DT, 11.4, 21.4, 3.1, 2.0)), part(rod(DL, 14.4, 13.4, 14.4, 3.1, 2.0)), part(rod(11.4, DT, DL, 14.4, 3.1, 2.0))],
  5: [part(rod(DL, DT, DR, DT, 3.1, 2.1)), part(rod(DL, DT, DL, 15.6, 3.1, 2.1)), part(bend(8.2, 15.6, 4.9, 4.9, -0.55, 3 * PI / 2))],
  6: [part(wheel(DC, 17.6, 4.7, 4.5, { spokes: 2, teeth: 6, hub: 2.1 })), part(bend(8.2, 13.6, 4.4, 9.6, -1.78, -0.38))],
  7: [part(rod(DL, DT, DR, DT, 3.1, 2.1)), part(rod(DR, DT, 6.2, 21.8, 3.1, 2.1))],
  8: [part(wheel(DC, 7.4, 4.9, 4.7, { spokes: 2, teeth: 6, hub: 2.1 })), part(wheel(DC, 17.9, 5.4, 5.7, { spokes: 3, phase: 0.5, teeth: 8 }))],
};
/** A part turned 180 degrees about the middle of the box (6 becomes 9). */
function turn180(q) {
  return {
    x: 16 - q.x, y: 26 - q.y, w: q.w, h: q.h,
    prims: q.prims.map((p) => (p.c ? { c: [-p.c[0], -p.c[1]], r: p.r }
      : p.s ? { s: [-p.s[0], -p.s[1], -p.s[2], -p.s[3]], w: p.w }
        : { e: [-p.e[0], -p.e[1]], rx: p.rx, ry: p.ry, a0: p.a0 + PI, a1: p.a1 + PI, w: p.w })),
    holes: q.holes.map(([hx, hy]) => [-hx, -hy]),
  };
}
GLYPH[9] = GLYPH[6].map(turn180);

/** Whether a part is one of the wheels: round things run, rods do not. */
const isWheel = (P) => P.w > 12 && P.h > 12;

// ---------------------------------------------------------------- the machine

const FW_WHEEL = part(wheel(0, 0, 14, 14, { spokes: 8, teeth: 20, hub: 0, rim: 2.8 }));
const FW_HUB = part([disc(0, 0, 4.0), disc(0, 0, 1.5)]);
const RATCHET = part(wheel(0, 0, 13, 13, { spokes: 5, teeth: 16, hub: 3.0, rim: 2.6 }));
const PAWL = part([seg(0, 0, 7.5, 3.0, 2.4), disc(0, 0, 2.2), disc(7.5, 3.0, 1.8)]);
const PINION = part(wheel(0, 0, 3.2, 3.2, { spokes: 0, teeth: 8, hub: 1.6, rim: 2.1 }));
const HAND_O = part(claw(1), [0, 0]);
const HAND_S = part(claw(0), [0, 0]);

/** A hand's claw: grips at the origin, wrist above; the jaws open and shut. */
function claw(open) {
  const o = open * 2.0;
  const jaw = (s) => [
    seg(s * (4.6 + o), -5.8, s * (4.1 + o * 0.6), -1.9, 3.0),
    seg(s * (4.1 + o * 0.6), -1.9, s * (1.7 + o * 0.8), -0.5 - o * 0.5, 2.8),
  ];
  return [
    ...jaw(-1), ...jaw(1),
    seg(-3.2, -6.1, 3.2, -6.1, 4.6),
    seg(0, -15, 0, -8, 2.8),
    disc(0, -11, 3.1),
    disc(0, -15.2, 2.0),
  ];
}

/** The engine: the flywheel, half in the floor at the left, ticking out the
 *  seconds with its pallet, and the governor flying out on the hour. */
function flywheel(g, spin, speed, kick, ox, oy) {
  const cx = 16 + ox, cy = 56 + oy;
  place(g, FW_WHEEL, cx, cy, { spin });
  place(g, FW_HUB, cx, cy, { spin });
  // The pallet fork, kicking once a second.
  const k = clamp(kick, -1, 1);
  const px = cx + 5, py = cy - 12;
  g.thickLine(px, py - 3, px + k * 3.2, py - 1.2, 1.9);
  g.thickLine(px + k * 3.2, py - 1.2, px + k * 3.2 + 2.4, py + 1.7, 1.6);
  // The governor: two arms that fly out as the wheel spins up.
  const spread = 0.3 + 0.7 * clamp(speed, 0, 1);
  for (const s of [-1, 1]) {
    g.thickLine(cx + s * 3, cy + 1, cx + s * (4 + 6 * spread), cy + 3 + 4 * spread, 1.6);
    g.fillCircle(cx + s * (4 + 6 * spread), cy + 3 + 4 * spread, 2.0);
  }
}

/** The ratchet the spring hauls, half in the floor at the other side, and the
 *  pawl that lets it round one tooth each minute. */
function ratchet(g, minutes, wind, ox, oy) {
  const cx = 127 + ox, cy = 54 + oy;
  place(g, RATCHET, cx, cy, { spin: -minutes * 0.18 });
  place(g, PAWL, cx - 11, cy - 9, { th: -0.4 - 0.3 * wind });
}

/** The mainspring: wound tight all minute, let go on the hour. */
function spring(g, wind, ox, oy) {
  const cx = 92 + ox, cy = 50 + oy;
  const r0 = 1.8, r1 = 5.2 + 1.6 * (1 - wind), turns = 2.7;
  const pts = [];
  for (let i = 0; i <= 64; i++) {
    const u = i / 64, a = u * turns * TAU, r = r0 + (r1 - r0) * u;
    pts.push([cx + r * Math.cos(a + wind * 1.2), cy + r * Math.sin(a + wind * 1.2)]);
  }
  g.stroke(pts, 1.7);
}

/** The hopper: the bin the parts are dropped into and drawn out of. Behind
 *  the parts: the mouth, and whatever stock is standing in it. */
function hopperBack(g, live, ox, oy) {
  const X = BIN.x + ox, Y = BIN.y + oy;
  g.fillRect(X - 4, Y - 6, BIN.w + 8, BIN.h + 8, 0);
  // A few part-ends standing in the stock, and the chute behind it.
  for (let i = 0; i < 3; i++) {
    const sx = X + 7 + i * 9.5, jig = 0.5 * Math.sin(live * 2.3 + i * 2.1);
    g.fillRect(sx, Y - 3.5 + jig, 3.0, 6, 1);
    g.fillCircle(sx + 1.5, Y - 3.5 + jig, 1.5, 1);
  }
  g.thickLine(X - 2, Y + 2, X - 5, Y + BIN.h + 2, 1.3);
  g.thickLine(X + BIN.w + 2, Y + 2, X + BIN.w + 5, Y + BIN.h + 2, 1.3);
  g.thickLine(X - 6, Y + BIN.h + 2, X + BIN.w + 6, Y + BIN.h + 2, 1.4);
}

/** The bin's front lip, drawn over the parts as they sink in. */
function hopperLip(g, ox, oy) {
  const X = BIN.x + ox, Y = BIN.y + oy;
  g.thickLine(X - 2, Y + 2, X + BIN.w + 2, Y + 2, 2.2);
  g.thickLine(X - 2, Y + 2, X - 6, Y + BIN.h + 2, 1.4);
  g.thickLine(X + BIN.w + 2, Y + 2, X + BIN.w + 6, Y + BIN.h + 2, 1.4);
  g.thickLine(X - 6, Y + BIN.h + 2, X + BIN.w + 6, Y + BIN.h + 2, 1.4);
}

// ---------------------------------------------------------------- the bench

const GS = 1.16;                                 // the glyph box, drawn at this scale
const SLOT = [16, 36, 76, 96];                   // the four boxes, left edge
const GY = 7;                                    // the boxes' top
const GYS = [GY - 3, GY - 3, GY, GY];            // the hours stand a step higher
const COLON_X = 65;
const RAIL_Y = 2;
const SHELF_Y = 40;
const BIN = { x: 48, y: 47, w: 32, h: 10 };

const digitsOf = (f) => `${f.hh}${f.mm}`.split('').map(Number);

/** The seat of a part in the bin: hours to the left, minutes to the right. */
function binSeat(k, i) {
  return [BIN.x + 6 + i * 6.4 + (k >= 2 ? 8 : 0), BIN.y + 5];
}

// The fit: the two hands undo and remake one digit at a time.
const FIT = { start: -1.25, lift: 0.14, carry: 0.24, drop: 0.13, step: 0.26, build: 0.04, btake: 0.12, bup: 0.30, bseat: 0.16, bstep: 0.26 };
// The hour: the flywheel winds up and the whole bench goes in one wave.
const FLING = { start: -1.15, lift: 0.09, carry: 0.28, drop: 0.12, step: 0.08, build: 0.06, btake: 0.12, bup: 0.42, bseat: 0.24, bstep: 0.08 };

/** How far a part has travelled off its seat: 0 on the plate, 1 in the bin. */
function travel(tau, i, K, late) {
  if (late) return progress(tau, K.start + i * K.step, K.start + i * K.step + K.lift + K.carry + K.drop);
  return 1 - progress(tau, K.build + i * K.bstep, K.build + i * K.bstep + K.btake + K.bup + K.bseat);
}

/** A part in flight: lifted clear, carried across, dropped into the bin. */
function flightPose(home, seat, u, K, out) {
  const L = K.lift, C = K.carry, D = K.drop, dur = L + C + D;
  const t = u * dur;
  const hx = home[0], hy = home[1], bx = seat[0], by = seat[1];
  if (t < L) { const e = ease.outQuad(t / L); return { x: hx, y: hy - 3.4 * e, th: 0, inHand: e > 0.25 }; }
  if (t < L + C) {
    const e = ease.inOutCubic((t - L) / C);
    return { x: hx + (bx - hx) * e, y: (hy - 3.4) + (by - 7 - (hy - 3.4)) * e, th: out * 0.5 * e, inHand: true };
  }
  const e = ease.inQuad((t - L - C) / D);
  return { x: bx, y: (by - 7) + 7.5 * e, th: out * (0.5 + 0.9 * e), inHand: e < 0.55 };
}

// ---------------------------------------------------------------- the face

export default {
  name: 'The Fitter',
  blurb: 'A clockwork fitting shop whose numerals are machinery: rods, bent rods and toothed wheels, unscrewed and re-fitted by the machine\'s own two hands.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  driver: 'full',

  frame(g, { date, fields: f, oled, night }) {
    const T = date.getTime() / 1000;
    const MINUTES = Math.floor(T / 60);
    const [ox, oy] = orbit(date, 2, 3);

    // Where the turn is: 'late' means the parts are being taken off before
    // the minute ticks over. The digits come straight from the clock, so the
    // face can never read anything but the true time.
    const stripStart = (f.m === 59 ? FLING.start : FIT.start);
    const late = f.sec >= 60 + stripStart - 0.2;
    const to = late ? clockFields(new Date(date.getTime() + 60000)) : f;
    const from = late ? f : previousMinute(date);
    const hour = late ? to.m === 0 : f.m === 0 && f.sec < 2.6;
    const K = hour ? FLING : FIT;
    const tau = late ? f.sec - 60 : f.sec;
    const cur = digitsOf(f);
    const A = digitsOf(from), B = digitsOf(to);

    // The machine is never still: it trembles, and its wheels run.
    const tremble = (i) => [0.22 * Math.sin(T * 13.1 + i * 2.7), 0.18 * Math.sin(T * 16.7 + i * 1.9)];

    HOLES.length = 0;

    // ---- the bench the whole thing is bolted to, with the raised station
    // the hours are fitted on.
    g.thickLine(5 + ox, SHELF_Y + oy, 125 + ox, SHELF_Y + oy, 1.6);
    g.thickLine(11 + ox, GY + GS * 26 + 1.5 + oy, 57 + ox, GY + GS * 26 + 1.5 + oy, 1.5);
    g.thickLine(11 + ox, GY + GS * 26 + 1.5 + oy, 11 + ox, SHELF_Y + oy, 1.3);
    g.thickLine(57 + ox, GY + GS * 26 + 1.5 + oy, 57 + ox, SHELF_Y + oy, 1.3);
    g.thickLine(5 + ox, SHELF_Y + oy, 5 + ox, SHELF_Y + 7 + oy, 1.4);
    g.thickLine(125 + ox, SHELF_Y + oy, 125 + ox, SHELF_Y + 7 + oy, 1.4);

    // ---- the hopper's mouth, behind everything the hands carry.
    hopperBack(g, T, ox, oy);

    // ---- the four digits: solid parts, and the ghost of the plan.
    const handAt = [null, null];
    for (let k = 0; k < 4; k++) {
      const parts = GLYPH[cur[k]];
      const changing = A[k] !== B[k];
      for (let i = 0; i < parts.length; i++) {
        const P = parts[i];
        const [tx, ty] = tremble(k * 4 + i);
        const home = [SLOT[k] + GS * P.x + ox + (changing ? 0 : tx), GYS[k] + GS * P.y + oy + (changing ? 0 : ty)];
        const u = changing ? travel(tau, i, K, late) : 0;
        const spin = isWheel(P) ? T * 0.4 * (1 + 0.18 * i) : 0;
        if (u <= 0) {
          place(g, P, home[0], home[1], { spin, S: GS });
          continue;
        }
        const pose = flightPose(home, binSeat(k, i), u, K, late ? 1 : -1);
        if (pose.inHand) {
          const seat2 = (k >= 2 ? 0 : 1);
          if (!handAt[seat2] || u > handAt[seat2][2]) handAt[seat2] = [pose.x, pose.y, u];
        }
        if (pose.y < BIN.y + 2) place(g, P, pose.x, pose.y, { th: pose.th, spin: isWheel(P) ? T * 2.6 * u : 0, S: GS });
      }
    }

    // Punch the rivets before the ghost goes down, so a hole never bites the
    // dithered plan.
    for (const [hx, hy] of HOLES) g.fillCircle(hx, hy, RIV, 0);

    // ---- the ghost of the plan: the digit kept legible while it is apart.
    const edge = clamp(Math.abs(tau) / 0.07, 0, 1);
    if (edge > 0.05) {
      for (let k = 0; k < 4; k++) {
        if (A[k] === B[k]) continue;
        const parts = GLYPH[cur[k]];
        for (let i = 0; i < parts.length; i++) {
          const u = travel(tau, i, K, late);
          if (u < 0.2) continue;
          const P = parts[i];
          place(g, P, SLOT[k] + GS * P.x + ox, GYS[k] + GS * P.y + oy, { S: GS, thin: 0.42, level: 0.3 + 0.7 * edge });
        }
      }
    }

    // ---- under the bench: the hopper's lip, and the engine.
    hopperLip(g, ox, oy);
    const rush = hour ? clamp(1 - Math.abs(f.sec - (late ? -1.4 : 1.0)) / 1.4, 0, 1) : 0;
    flywheel(g, f.sec * 0.35 + rush * 9, rush, Math.cos(f.sec * TAU) * clamp(1 - Math.abs(f.sec - Math.round(f.sec)) * 5, 0, 1), ox, oy);
    ratchet(g, MINUTES, hour ? clamp((f.sec - 0.2) / 1.8, 0, 1) : f.sec / 60, ox, oy);
    spring(g, hour ? clamp((f.sec - 0.2) / 1.8, 0, 1) : f.sec / 60, ox, oy);

    // ---- the lead screw, and the two hands that ride it. Idle, they are
    // wound up into their trolleys; they run out to do the work.
    const railY = RAIL_Y + oy;
    g.thickLine(-2 + ox, railY, 130 + ox, railY, 1.4);
    for (let x = 0; x < 128; x += 4) g.fillRect(x + ox, railY - 1.5, 1, 1, 1);
    for (let h = 0; h < 2; h++) {
      const at = handAt[h];
      const rx = at ? at[0] : (h ? 7 : 121) + ox;
      // At rest the claw is wound up: only the tips of its jaws show.
      const ry = at ? at[1] : 5 + oy + Math.sin(T * 0.8 + h * 2.4) * 1.1;
      g.fillRect(rx - 5.5, railY - 4.8, 11, 4.8, 1);
      g.fillRect(rx - 3.2, railY - 3.6, 1.6, 2.2, 0);
      if (ry - 19 > railY + 1) {
        g.thickLine(rx, railY, rx, ry - 19, 1.6);
        const sleeve = Math.min(9, Math.max(0, (ry - 21 - railY) * 0.5));
        g.thickLine(rx, railY + 1, rx, railY + 1 + sleeve, 3.2);
      }
      place(g, at ? HAND_S : HAND_O, rx, ry, { th: at ? 0 : Math.sin(T * 0.6 + h * 3) * 0.08, S: 1.15 });
    }

    // ---- the colon: two pinions between the hours and the minutes, meshing.
    const cs = T * 0.4;
    place(g, PINION, COLON_X + ox, 15 + oy, { spin: cs });
    place(g, PINION, COLON_X + ox, 27 + oy, { spin: -cs });
    for (const y of [15, 27]) g.fillCircle(COLON_X + ox, y + oy, 1.0, 0);

    for (const [hx, hy] of HOLES) g.fillCircle(hx, hy, RIV, 0);
    oled.contrast(0xd0 + (0x18 - 0xd0) * night);
  },
};
