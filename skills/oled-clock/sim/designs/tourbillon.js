// Tourbillon — an openworked movement in a figure-eight case, after the
// Jaquet Droz Grande Seconde and Breguet's own tourbillons.
//
// Left, the hours and minutes: blued-steel Breguet hands (open "pomme"
// moons near the tips) on a dial of jewel indices, keylined so they lie
// on top of the movement seen through it. Under them, in dotted outline
// so they sit back in the shadow, the going train with real teeth: the
// mainspring barrel (18 teeth, its spring coiled inside) drives the centre
// pinion (8 leaves); the centre wheel (24 teeth), concentric with the
// hands, turns once an hour and drives the third pinion (8). Every wheel's
// angle comes from the one before it through the tooth ratio, in the
// opposite direction, phased so tooth meets gap on the line of centres.
// The third wheel runs on under the plate to the carriage pinion.
//
// Right, the tourbillon: a carriage that turns once a minute and is the
// seconds hand (a lance on its rim against a fixed seconds track). In it,
// in its own rotating frame: the escape wheel (15 club teeth), the pallet
// fork rocking between its banking pins, and a screwed balance at 4 Hz
// (28,800 bph, 250 degrees of amplitude) whose hairspring breathes, its
// inner end turning with the balance and its outer end held at the stud.
// Everything in the train moves only on a beat: eight times a second the
// escape wheel steps half a tooth (12 degrees relative to the carriage),
// the fork flips, and the carriage advances 0.75 degrees.
//
// Between the two, the striking work of a petite sonnerie: two gongs leave
// one foot in the waist and wrap round the two dials; two hammers hang
// from a pivot below them; the governor (a two-vaned fly) at the bottom
// whirls while the striking train runs.
//
// The minute: the minute hand is a jumping minute, held all minute and
// sprung forward at :00 with a little overshoot; as it lands the 12 jewel
// glints, and a swell runs once round the seconds track behind the
// carriage, lengthening the ticks as it passes (its lap of honour).
// The quarters: ding-dong pairs on the high then the low gong.
// The hour: the low hammer lifts and strikes the hour, one blow per hour
// (1 to 12), each blow ringing the gong wire, which visibly vibrates and
// decays along its length; the governor spins throughout.
//
// Every frame is computed from the clock: the beat count from the time of
// day gives every wheel's angle; the balance angle is a sine of time; the
// strikes are a schedule from :00, and the hammer lift and gong ring are
// functions of time since each strike. Nothing is remembered.
//
// Burn-in: the whole face walks a 2 px orbit every 3 minutes; the train is
// drawn as dotted outlines; night dims the panel through ctx.night.

import { dither, polar, segDist, orbit, clamp, ease, progress, OFF, ON } from '../js/kit.js';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const BPS = 8;                          // 28,800 bph: 8 beats a second, 4 Hz
const AMP = 250 * DEG;                  // balance amplitude

// ------------------------------------------------------------ geometry helpers

const wrap = (a) => ((a % TAU) + TAU) % TAU;
/** A local offset (x right, y down, in a frame turned by clock angle a) to canvas. */
function loc(cx, cy, a, x, y) {
  const c = Math.cos(a), s = Math.sin(a);
  return [cx + x * c - y * s, cy + x * s + y * c];
}

/**
 * A wheel's shape: `n` teeth on pitch radius `r`, turned to clock angle `a`.
 * The rim runs from `rim` to the tooth root; `spokes` crossings (curved by
 * `curl` radians at the rim); a hub ring from `hubIn` to `hub`.
 */
function wheel(cx, cy, o) {
  const { n, r, a = 0, h = 1.6, rim = r - 2.6, spokes = 0, curl = 0, hub = 0, hubIn = 0, sw = 0.6, slant = 0, tw = 0.3 } = o;
  const rRoot = r - h / 2, rTip = r + h / 2;
  const pitch = (TAU * r) / n;
  const wRoot = pitch * tw, wTip = pitch * tw * 0.55;
  const test = (px, py) => {
    const dx = px - cx, dy = py - cy;
    const d = Math.hypot(dx, dy);
    if (d > rTip) return false;
    const q = Math.atan2(dx, -dy);
    if (d > rRoot) {
      const k = (d - rRoot) / h;
      const u = (wrap(q - a) * n) / TAU % 1 - 0.5 - slant * k;
      return Math.abs(u) * pitch * (d / r) < wRoot + (wTip - wRoot) * k;
    }
    if (d >= rim) return true;
    if (hub && d <= hub) return d >= hubIn;
    for (let j = 0; j < spokes; j++) {
      const sa = a + (j * TAU) / spokes + curl * (d / rim) ** 2;
      if (Math.abs(d * Math.sin(q - sa)) < sw && Math.cos(q - sa) > 0) return true;
    }
    return false;
  };
  return { test, box: [cx - rTip - 1, cy - rTip - 1, 2 * rTip + 2, 2 * rTip + 2] };
}

/**
 * Draw a shape { test, box }: 'solid'; 'key' (clear a 1 px keyline round
 * it first, so it reads as lying on top); 'grey' (dithered body with a
 * brighter edge, anchored at `anchor` so the texture travels with it).
 */
function draw(g, { test, box }, mode = 'solid', lvl = 0.5, anchor = [0, 0]) {
  if (mode === 'ghost') {
    const [ax, ay] = [Math.floor(anchor[0]), Math.floor(anchor[1])];
    g.fillWhere((px, py, ix, iy) => test(px, py) && !(test(px - 1, py) && test(px + 1, py) && test(px, py - 1) && test(px, py + 1))
      && dither(ix - ax, iy - ay, lvl), ON, box);
    return;
  }
  if (mode === 'grey') {
    const [ax, ay] = [Math.floor(anchor[0]), Math.floor(anchor[1])];
    g.fillWhere((px, py, ix, iy) => test(px, py) && (dither(ix - ax, iy - ay, lvl)
      || (!(test(px - 1, py) && test(px + 1, py) && test(px, py - 1) && test(px, py + 1)) && dither(ix - ax, iy - ay, lvl + 0.3))), ON, box);
    return;
  }
  if (mode === 'key') {
    const b = [box[0] - 1, box[1] - 1, box[2] + 2, box[3] + 2];
    g.fillWhere((px, py) => test(px, py) || test(px - 1, py) || test(px + 1, py) || test(px, py - 1) || test(px, py + 1)
      || test(px - 1, py - 1) || test(px + 1, py + 1) || test(px - 1, py + 1) || test(px + 1, py - 1), OFF, b);
  }
  g.fillWhere(test, ON, box);
}

const segs = (list, w) => (px, py) => { for (const [a, b] of list) if (segDist(px, py, a[0], a[1], b[0], b[1]) <= w) return true; return false; };

function insideTri(px, py, ax, ay, bx, by, qx, qy) {
  const s1 = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
  const s2 = (qx - bx) * (py - by) - (qy - by) * (px - bx);
  const s3 = (ax - qx) * (py - qy) - (ay - qy) * (px - qx);
  return (s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0);
}

// ------------------------------------------------------------ layout

const D = [31, 32];          // hours and minutes
const T = [97, 32];          // the tourbillon
const R_CAGE = 21.5;

// The going train, module 1.25 px (pitch radius 0.625 n). Visible meshes:
// barrel 18 -> centre pinion 8, centre wheel 24 -> third pinion 8. The
// third wheel runs on under the plate to the carriage pinion.
const M = 1.25;
const pr = (n) => (M * n) / 2;
const BARREL = { n: 18 }, CENTRE = { n: 24, pn: 8 }, THIRD = { n: 16, pn: 8 };
const B_DIR = 222 * DEG, W3_DIR = 78 * DEG;
const BP = polar(D[0], D[1], pr(BARREL.n) + pr(CENTRE.pn), B_DIR);
const W3 = polar(D[0], D[1], pr(CENTRE.n) + pr(THIRD.pn), W3_DIR);

/**
 * Meshing: B's angle when A (nA teeth) is at aA, centres along clock angle
 * psi from A to B, phased so A's tooth on the line of centres meets B's gap.
 */
function meshAngle(aA, nA, nB, psi) {
  const aA0 = psi - Math.PI / nA;
  return psi + Math.PI - (nA / nB) * (aA - aA0) - Math.PI / nB;
}

// ------------------------------------------------------------ the carriage

/** Hairspring: an Archimedean spiral whose inner end turns with the balance. */
function hairspring(g, cx, cy, a, phi) {
  const turns = 1.5, r0 = 2.3, r1 = 5.7;
  const w = phi / AMP;
  let lx = -99, ly = -99;
  for (let u = 0; u <= 1; u += 0.004) {
    const r = (r0 + (r1 - r0) * u) * (1 - 0.08 * w * (1 - u));
    const q = a + turns * TAU * u + phi * (1 - u);
    const x = Math.floor(cx + r * Math.sin(q)), y = Math.floor(cy - r * Math.cos(q));
    if (x !== lx || y !== ly) { g.pixel(x, y); lx = x; ly = y; }
  }
}

/** The mainspring seen through the openworked barrel: a dotted spiral turning with it. */
function mainspring(g, cx, cy, a, anchor) {
  const [ax, ay] = [Math.floor(anchor[0]), Math.floor(anchor[1])];
  let lx = -99, ly = -99;
  for (let u = 0; u <= 1; u += 0.003) {
    const r = 2.8 + 6 * u, q = a + 2.4 * TAU * u;
    const x = Math.floor(cx + r * Math.sin(q)), y = Math.floor(cy - r * Math.cos(q));
    if ((x !== lx || y !== ly) && dither(x - ax, y - ay, 0.75)) g.pixel(x, y);
    lx = x; ly = y;
  }
}

/** The escape wheel: 15 hooked club teeth as spikes off a rim, three spokes. */
function escapeWheel(g, cx, cy, a) {
  g.fillCircle(cx, cy, 7.6, OFF);
  g.ring(cx, cy, 3.9, 5);
  for (let k = 0; k < 15; k++) {
    const q = a + (k * TAU) / 15;
    const [x0, y0] = polar(cx, cy, 4.6, q), [x1, y1] = polar(cx, cy, 7.1, q + 0.2);
    g.line(x0, y0, x1, y1);
  }
  for (let k = 0; k < 3; k++) {
    const q = a + (k * TAU) / 3 + 0.3;
    const [x0, y0] = polar(cx, cy, 1.2, q), [x1, y1] = polar(cx, cy, 4, q);
    g.line(x0, y0, x1, y1);
  }
  g.ring(cx, cy, 0, 1.3);
}

/**
 * The carriage at clock angle `ca`, everything in its frame: escape wheel
 * towards local 12, pallet fork in the middle, balance towards 6.
 */
function drawCage(g, tx, ty, ca, phi, beats) {
  const L = (x, y) => loc(tx, ty, ca, x, y);
  const side = beats & 1 ? 1 : -1;
  // escape wheel: half a tooth (12 deg) a beat, relative to the carriage
  const [ex, ey] = L(0, -13.8);
  escapeWheel(g, ex, ey, ca - beats * 12 * DEG);
  // pallet fork, rocking between its banking pins: a T of pallets at the
  // escape wheel, a lever down to the roller under the balance
  const P = L(0, -4.6);
  const fa = ca + side * 9 * DEG;
  const F = (x, y) => loc(P[0], P[1], fa, x, y);
  const fs = [[F(0, 0), F(0, 11.6), 0.75], [F(-3.8, -2.2), F(3.8, -2.2), 0.75], [F(0, 0), F(0, -2.2), 0.75],
    [F(-3.8, -2.2), F(-3.4, -3.6), 0.6], [F(3.8, -2.2), F(3.4, -3.6), 0.6],
    [F(-1.4, 11.6), F(-1.4, 13.4), 0.5], [F(1.4, 11.6), F(1.4, 13.4), 0.5], [F(-1.4, 11.6), F(1.4, 11.6), 0.5]];
  const forkTest = (px, py) => fs.some(([a, b, w]) => segDist(px, py, a[0], a[1], b[0], b[1]) <= w);
  draw(g, { test: forkTest, box: [P[0] - 15, P[1] - 15, 30, 30] }, 'key');
  // balance with timing screws, then its hairspring
  const [bx, by] = L(0, 9.8);
  const ba = ca + phi;
  draw(g, wheel(bx, by, { n: 8, r: 8.3, h: 1.4, a: ba, rim: 6.8, spokes: 2, hub: 1.4, sw: 0.6, tw: 0.14 }), 'key');
  hairspring(g, bx, by, ba, phi);
  // carriage ring, a counterweight, and the seconds arm (local 3 o'clock)
  g.ring(tx, ty, R_CAGE - 1, R_CAGE + 0.2);
  const [wx, wy] = L(-15.5, 0);
  g.fillCircle(wx, wy, 3, OFF);
  g.ring(wx, wy, 1, 2.3);
  const [k0x, k0y] = L(-18.4, 0), [k1x, k1y] = L(-R_CAGE, 0);
  g.thickLine(k0x, k0y, k1x, k1y, 1.5);
  const a = ca + Math.PI / 2;
  draw(g, ringHand(tx, ty, a, 12.5, 28.6, 24, 1.6, 0, 2.1), 'key');
}

// ------------------------------------------------------------ the striking work

// Petite sonnerie: the hours on the hour on the low gong; the quarters as
// ding-dongs (high gong, then low) at :15, :30, :45.
// Two gongs leave one foot in the waist and wrap round the two dials, the
// low one round the hours, the high one round the tourbillon.
const GONG_R = 31.4;
const FOOT = [64, 2.5];
// each gong: from the foot to where it meets its dial's circle, then round it
const GONG_PATH = [{ c: D, a0: 38 * DEG, a1: -100 * DEG }, { c: T, a0: -38 * DEG, a1: 100 * DEG }];
const HAMMER_PIVOT = [64, 21];
const HAMMER_HEAD = [[58.4, 7.2], [69.6, 7.2]];
const GOVERNOR = [64, 56];
const LAP = 1.4;
const STRIKE_AT = 0.5, STRIKE_EVERY = 0.62, QUARTER_GAP = 0.34;

/** The strikes of this hour/quarter: [time after :00, gong] (0 low, 1 high). */
function strikes(f) {
  if (f.m === 0) return Array.from({ length: f.h12 }, (_, k) => [STRIKE_AT + k * STRIKE_EVERY, 0]);
  if (f.m % 15) return [];
  const out = [];
  for (let q = 0; q < f.m / 15; q++) {
    const t0 = STRIKE_AT + q * (STRIKE_EVERY + QUARTER_GAP);
    out.push([t0, 1], [t0 + QUARTER_GAP, 0]);
  }
  return out;
}

/** Hammer lift (radians, away from the gong) at time `sec`, given its strikes. */
function hammerLift(sec, times) {
  for (const t of times) {
    const u = t - sec;                       // time until this strike
    if (u > 0 && u < 0.4) return 0.32 * ease.inOutQuad(progress(0.4 - u, 0, 0.32));
    if (u <= 0 && u > -0.12) return 0.04 * Math.sin((-u / 0.12) * Math.PI);  // rebound
  }
  return 0;
}

/** Gong displacement: each strike rings the wire, decaying; s is 0..1 along it. */
function gongRing(sec, times, s) {
  let d = 0;
  for (const t of times) {
    const u = sec - t;
    if (u < 0 || u > 2.2) continue;
    d += 1.3 * Math.exp(-u / 0.5) * Math.sin(Math.PI * s * 3) * Math.sin(TAU * 7.5 * u) * (1 - s * 0.3);
  }
  return d;
}

function drawStriking(g, f, ox, oy) {
  const all = strikes(f);
  const sec = f.sec;
  const centres = [[D[0] + ox, D[1] + oy], [T[0] + ox, T[1] + oy]];
  for (let k = 0; k < 2; k++) {
    const times = all.filter(([, gg]) => gg === k).map(([t]) => t);
    const P = GONG_PATH[k];
    const [cx, cy] = [P.c[0] + ox, P.c[1] + oy];
    const [jx, jy] = polar(cx, cy, GONG_R, P.a0);
    const [fx, fy] = [FOOT[0] + ox, FOOT[1] + oy];
    const L0 = Math.hypot(jx - fx, jy - fy), L1 = GONG_R * Math.abs(P.a1 - P.a0);
    // the gong, as one wire: the straight run from the foot, then the arc;
    // it rings (bends normal to itself) when struck, decaying
    let lx = -99, ly = -99;
    const n = Math.ceil((L0 + L1) / 0.25);
    for (let i = 0; i <= n; i++) {
      const sAlong = ((L0 + L1) * i) / n, u = sAlong / (L0 + L1);
      const d = gongRing(sec, times, u);
      let x, y;
      if (sAlong < L0) {
        const v = sAlong / L0;
        x = fx + (jx - fx) * v; y = fy + (jy - fy) * v;
        const nx = -(jy - fy) / L0, ny = (jx - fx) / L0;
        x += nx * d * (k ? -1 : 1); y += ny * d * (k ? -1 : 1);
      } else {
        const a = P.a0 + (P.a1 - P.a0) * ((sAlong - L0) / L1);
        [x, y] = polar(cx, cy, GONG_R + d, a);
      }
      const X = Math.floor(x), Y = Math.floor(y);
      if (X !== lx || Y !== ly) { g.pixel(X, Y); lx = X; ly = Y; }
    }
    // the hammer: an arm up from the pivot, its head resting under the gong
    const sgn = k ? 1 : -1;
    const [px, py] = [HAMMER_PIVOT[0] + ox, HAMMER_PIVOT[1] + oy];
    const lift = hammerLift(sec, times);
    const hd = loc(px, py, sgn * lift, HAMMER_HEAD[k][0] - HAMMER_PIVOT[0], HAMMER_HEAD[k][1] - HAMMER_PIVOT[1]);
    const arm = segs([[[px, py], hd]], 0.5);
    const dir = Math.atan2(hd[0] - px, py - hd[1]);
    const head = (qx, qy) => {
      const [u, v] = [qx - hd[0], qy - hd[1]];
      const along = u * Math.sin(dir) - v * Math.cos(dir), across = u * Math.cos(dir) + v * Math.sin(dir);
      return Math.abs(along) < 1.1 && Math.abs(across) < 1.9;
    };
    draw(g, { test: (qx, qy) => arm(qx, qy) || head(qx, qy), box: [Math.min(px, hd[0]) - 4, Math.min(py, hd[1]) - 4, Math.abs(px - hd[0]) + 8, Math.abs(py - hd[1]) + 8] }, 'key');
  }
  g.fillRect(FOOT[0] + ox - 3, FOOT[1] + oy - 2, 7, 3);
  g.fillCircle(HAMMER_PIVOT[0] + ox, HAMMER_PIVOT[1] + oy, 2.2, OFF);
  g.ring(HAMMER_PIVOT[0] + ox, HAMMER_PIVOT[1] + oy, 0.6, 1.7);
  // the governor: a two-bladed fly that whirls while the striking train runs
  const last = all.length ? all[all.length - 1][0] : -1;
  const run = all.length ? clamp(sec - 0.2, 0, last + 0.2) : 0;
  const spin = run * 2.5 * TAU;
  const [gx, gy] = [GOVERNOR[0] + ox, GOVERNOR[1] + oy];
  const vane = (sgn) => {
    const F = (x, y) => loc(gx, gy, spin, x, y);
    const a = F(0, 0), b = F(0, sgn * 5);
    const c = F(-1.8, sgn * 3), d = F(1.8, sgn * 3), e = F(1.8, sgn * 5.3), h = F(-1.8, sgn * 5.3);
    return (px, py) => segDist(px, py, a[0], a[1], b[0], b[1]) < 0.55 || insideTri(px, py, c[0], c[1], d[0], d[1], e[0], e[1]) || insideTri(px, py, c[0], c[1], e[0], e[1], h[0], h[1]);
  };
  const v1 = vane(1), v2 = vane(-1);
  draw(g, { test: (px, py) => v1(px, py) || v2(px, py), box: [gx - 7, gy - 7, 14, 14] });
  g.ring(gx, gy, 0, 1.2);
  return all;
}

/**
 * A Breguet hand that starts at the carriage: a stub from r0, an open moon
 * ("pomme") at rp, then a tapering point to r1.
 */
function ringHand(cx, cy, a, r0, r1, rp, po, pi, w) {
  const ux = Math.sin(a), uy = -Math.cos(a);
  const [mx, my] = [cx + ux * rp, cy + uy * rp];
  return {
    test: (px, py) => {
      const dm = Math.hypot(px - mx, py - my);
      if (dm <= po) return dm >= pi;
      const along = (px - cx) * ux + (py - cy) * uy;
      const across = Math.abs((px - cx) * -uy + (py - cy) * ux);
      if (along < r0 || along > r1) return false;
      if (along < rp) return across <= w / 2;
      return across <= (w / 2 + 0.3) * (1 - (along - rp) / (r1 - rp)) + 0.15;
    },
    box: (() => {
      const xs = [cx + ux * r0, cx + ux * r1, mx], ys = [cy + uy * r0, cy + uy * r1, my];
      const m = Math.max(po, w) + 1;
      return [Math.min(...xs) - m, Math.min(...ys) - m, Math.max(...xs) - Math.min(...xs) + 2 * m, Math.max(...ys) - Math.min(...ys) + 2 * m];
    })(),
  };
}

// ------------------------------------------------------------ frame

export default {
  name: 'Tourbillon',
  blurb: 'A haute-horlogerie movement: a one-minute tourbillon as the seconds, a 4 Hz balance, a jumping minute and a sonnerie that strikes the hours.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,

  frame(g, ctx) {
    const { fields: f, date, oled, night } = ctx;
    const s = f.h * 3600 + f.m * 60 + f.sec;
    const beats = Math.floor(s * BPS + 0.5);
    const phi = AMP * Math.sin(TAU * (BPS / 2) * s);
    const [ox, oy] = orbit(date, 2, 3);
    const sq = beats / BPS;

    const dx = D[0] + ox, dy = D[1] + oy, tx = T[0] + ox, ty = T[1] + oy;
    const centre = (sq / 3600) * TAU;

    // ---- under the hour dial: barrel and train, set back in grey
    const bAng = meshAngle(centre, CENTRE.pn, BARREL.n, B_DIR);
    const w3Ang = meshAngle(centre, CENTRE.n, THIRD.pn, W3_DIR);
    draw(g, wheel(BP[0] + ox, BP[1] + oy, { n: BARREL.n, r: pr(BARREL.n), a: bAng, rim: pr(BARREL.n) - 1.8, hub: 2.2, hubIn: 1 }), 'ghost', 0.6, BP);
    mainspring(g, BP[0] + ox, BP[1] + oy, bAng, BP);
    draw(g, wheel(W3[0] + ox, W3[1] + oy, { n: THIRD.n, r: pr(THIRD.n), a: w3Ang, rim: pr(THIRD.n) - 1.8, spokes: 4, curl: 0.4, hub: 1.2, sw: 0.7 }), 'ghost', 0.6, W3);
    draw(g, wheel(W3[0] + ox, W3[1] + oy, { n: THIRD.pn, r: pr(THIRD.pn), a: w3Ang, h: 1.5, rim: 0 }), 'ghost', 0.8, W3);
    draw(g, wheel(dx, dy, { n: CENTRE.pn, r: pr(CENTRE.pn), a: centre, h: 1.5, rim: 0 }), 'ghost', 0.8, D);
    g.fillCircle(BP[0] + ox, BP[1] + oy, 2.2, OFF); g.ring(BP[0] + ox, BP[1] + oy, 0.6, 1.6);
    g.fillCircle(W3[0] + ox, W3[1] + oy, 1.8, OFF); g.ring(W3[0] + ox, W3[1] + oy, 0, 1.1);
    const cw = wheel(dx, dy, { n: CENTRE.n, r: pr(CENTRE.n), a: centre, rim: pr(CENTRE.n) - 1.8, spokes: 0 });
    g.fillWhere(cw.test, OFF, cw.box);
    draw(g, cw, 'ghost', 0.6, D);

    // ---- chapters: hour jewels and minute dots round the dial, seconds round the tourbillon
    // On the minute the carriage's lap is celebrated: a swell runs round
    // the seconds track, lengthening the ticks as it passes.
    const lap = f.sec < LAP ? f.sec / LAP : -1;
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * TAU;
      if (i % 5) { const [x, y] = polar(dx, dy, 29.4, a); g.pixel(x, y); }
      let grow = 0;
      if (lap >= 0) {
        const behind = lap * 60 - i;                 // ticks since the swell passed
        if (behind > -2 && behind < 9) grow = 3 * Math.exp(-((behind - 1.5) ** 2) / 6);
      }
      const [x0, y0] = polar(tx, ty, (i % 5 ? 27.6 : 26) - grow, a), [x1, y1] = polar(tx, ty, 29.2, a);
      g.line(x0, y0, x1, y1);
    }
    for (let i = 0; i < 12; i++) {
      const [x, y] = polar(dx, dy, 27, (i / 12) * TAU);
      g.fillCircle(x, y, i % 3 ? 2.2 : 2.9, OFF);
      g.ring(x, y, i % 3 ? 0.4 : 0.9, i % 3 ? 1.4 : 2.1);
    }

    drawStriking(g, f, ox, oy);
    drawCage(g, tx, ty, ((sq % 60) / 60) * TAU - Math.PI / 2, phi, beats);

    // ---- hands. The minute jumps at :00 (a jumping-minute work), overshooting a little.
    const jump = f.sec < 0.4 ? ease.outBack(f.sec / 0.4) - 1 : 0;
    const aM = ((f.m + jump) / 60) * TAU;
    const aH = (((f.h % 12) + (f.m + jump) / 60) / 12) * TAU;
    draw(g, ringHand(dx, dy, aH, -3, 17, 11.8, 2.9, 1.4, 2.2), 'key');
    draw(g, ringHand(dx, dy, aM, -4, 26.5, 19.5, 2.3, 1, 1.6), 'key');
    g.fillCircle(dx, dy, 3, OFF);
    g.ring(dx, dy, 0.7, 2.1);
    // and the 12 jewel catches the light as the minute lands
    if (f.sec < 0.7) {
      const k = Math.sin((f.sec / 0.7) * Math.PI);
      const [jx, jy] = polar(dx, dy, 27, 0);
      const r = 1.5 + 3.5 * k;
      g.line(jx - r, jy, jx - 2.5, jy); g.line(jx + 2.5, jy, jx + r, jy);
      g.line(jx, jy - r, jx, jy - 2.5); g.line(jx, jy + 2.5, jx, jy + r);
    }

    oled.contrast(0xcf + (0x14 - 0xcf) * night);
  },
};
