// Vectorcade: a 1979 colour vector monitor playing Asteroids, where the
// asteroids are the time. Four hollow vector rocks shaped as numerals
// (HH over MM, the square panel's 2x2) tumble a few degrees in 3D. A little
// ship lives at the crossing between them: it turns, takes potshots that
// make the rocks shudder, thrusts off down a channel, wraps round the
// screen's edge and glides back. The rocks throb with Asteroids' heartbeat,
// faster as the minute runs out.
//
// Minute: the ship shoots the changing digit. It bursts into its own line
// segments, which spin out in 3D and drift back to land as the new digit,
// the same pieces re-laid. A tens change is set off by the debris: a chain.
// Hour: the saucer warbles in, the explosion chains through every changing
// rock, the ship shoots the saucer down and flies a victory loop.
//
// Drawn as beam lines into a 64x64 float raster (vectorcade-beam.js), with
// sub-pixel coverage, phosphor trails sampled from the past and bloom.
import * as kit from '../js/kit.js';
import { buildDigits, N } from './vectorcade-font.js';
import { makeBeam } from './vectorcade-beam.js';

const S = 64, C = 31.5;
const SLOT = [[15.5, 16], [47.5, 16], [15.5, 47], [47.5, 47]];   // h10 h1 / m10 m1
const DIG = buildDigits(2.35, 1.1);
const COL = {
  hour: kit.hex('#45bfff'), min: kit.hex('#b27cff'), ship: kit.hex('#ffe04a'),
  shot: kit.hex('#fff2c8'), spark: kit.hex('#ff8a2a'), saucer: kit.hex('#52ff7e'), hot: kit.hex('#ffcf8a'),
};
const EP = 6, EP0 = 4.3, NEP = 86400 / EP;     // ship episodes; one ends with a shot that lands on :00
const D = 2.0;                                  // a rock's burst and re-assembly
const SHOT_V = 46;                              // px / s
const DIRS = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
const DV = [[1, 0], [0, 1], [-1, 0], [0, -1]];

const beam = makeBeam(S, S);
const hash = kit.hash, clamp = kit.clamp, sstep = kit.smoothstep;
const pad = (n) => String(n).padStart(2, '0');
const digitsAt = (minIdx) => { const m = ((minIdx % 1440) + 1440) % 1440; return pad(Math.floor(m / 60)) + pad(m % 60); };
const wrapE = (E) => ((E % NEP) + NEP) % NEP;
const angLerp = (a, b, t) => { let d = b - a; d -= Math.round(d / kit.TAU) * kit.TAU; return a + d * t; };

// ------------------------------------------------------------ the frame's clock
let SD = 0;          // seconds of the day, the only time anything reads

// --------------------------------------------------------------- the ship
const outDir = (E) => Math.floor(hash(wrapE(E), 11) * 4);
const isMinuteEp = (E) => wrapE(E) % 10 === 9;   // its shot lands exactly on the minute
/** The boundary (seconds of day) the minute episode E's shot lands on. */
const boundOf = (E) => EP0 + EP * E + 1.7;
const isHourEp = (E) => isMinuteEp(E) && (Math.round(boundOf(E) / 60) % 60 === 0);
function targetOf(E) { return isMinuteEp(E) ? 3 : Math.floor(hash(wrapE(E), 23) * 4); }

/** Where a shot from the centre at rock k lands (world), and its travel time. */
function impact(k) {
  const [cx, cy] = SLOT[k], dx = cx - C, dy = cy - C, L = Math.hypot(dx, dy);
  // enter the rock's box (shrunk a little): about 9 x 11.5 px half-size
  const tx = (Math.abs(dx) - 8.5) / Math.abs(dx), ty = (Math.abs(dy) - 10.5) / Math.abs(dy);
  const t = Math.max(tx, ty);
  return { x: C + dx * t, y: C + dy * t, ux: dx / L, uy: dy / L, travel: (L * t - 4) / SHOT_V };
}
const IMP = [0, 1, 2, 3].map(impact);

// the saucer's path through the hour show (tau: seconds from the hour)
const SAUCER_HIT = 1.3;
function saucerAt(tau, o) {
  o[0] = -7 + (tau + 4.5) * 9;
  o[1] = 4.6 + 0.9 * Math.sin(kit.TAU * 0.4 * tau + 1);   // along the top edge, clear of the digits
  return o;
}
const sau = [0, 0];

/** Fire time, start, end and hit time of episode E's shots: [tf, ax, ay, bx, by, th, kind] list. */
function shotsOf(E, out) {
  out.length = 0;
  const Es = EP0 + EP * E, k = targetOf(E), im = IMP[k];
  const th = isMinuteEp(E) ? boundOf(E) : Es + 1.3 + im.travel;
  out.push([th - im.travel, C + im.ux * 4, C + im.uy * 4, im.x, im.y, th, k]);
  if (isHourEp(E)) {
    const B = boundOf(E), hit = B + SAUCER_HIT;
    saucerAt(SAUCER_HIT, sau);
    const dx = sau[0] - C, dy = sau[1] - C, L = Math.hypot(dx, dy), tr = (L - 4) / SHOT_V;
    out.push([hit - tr, C + dx / L * 4, C + dy / L * 4, sau[0], sau[1], hit, -1]);
  }
  return out;
}
const SH = [], SH2 = [];

/** The ship at seconds-of-day t: [x, y, heading, thrust, loop]. */
function shipPose(t, o) {
  const E = Math.floor((t - EP0) / EP), Es = EP0 + EP * E, p = t - Es;
  const dIn = outDir(E - 1), dOut = outDir(E), aIn = DIRS[dIn], aOut = DIRS[dOut];
  const k = targetOf(E), aim = Math.atan2(IMP[k].uy, IMP[k].ux);
  let x = C + 0.45 * Math.sin(t * 1.3), y = C + 0.4 * Math.sin(t * 1.7 + 1), a, th = 0, loop = 0;
  if (p < 0.6) a = aIn;
  else if (p < 1.2) a = angLerp(aIn, aim, kit.ease.inOut((p - 0.6) / 0.6));
  else if (p < 1.6 || (isHourEp(E) && p < 1.7)) a = aim;
  else if (isHourEp(E)) {
    // the hour: track the saucer, shoot it, loop the loop, face the way out
    const tau = t - boundOf(E);
    saucerAt(SAUCER_HIT, sau);
    const aS = Math.atan2(sau[1] - C, sau[0] - C);
    if (tau < 0.7) a = angLerp(aim, aS, kit.ease.inOut(clamp(tau / 0.7)));
    else if (tau < 1.45) a = aS;
    else if (tau < 1.8) a = angLerp(aS, 0, kit.ease.inOut((tau - 1.45) / 0.35));
    else if (tau < 3.6) {
      const q = kit.ease.inOut((tau - 1.8) / 1.8), R = 7.5;
      const th0 = Math.PI / 2 - q * kit.TAU;
      x = C + R * Math.cos(th0); y = C - R + R * Math.sin(th0);
      a = th0 - Math.PI / 2; th = 1; loop = 1;
    } else a = angLerp(0, aOut, kit.ease.inOut(clamp((tau - 3.6) / 0.6)));
  } else if (p < 2.2) a = angLerp(aim, aOut, kit.ease.inOut((p - 1.6) / 0.6));
  else {
    a = aOut;
    const u = 64 * kit.ease.inOut((p - 2.2) / 3.8);
    x = C + DV[dOut][0] * u; y = C + DV[dOut][1] * u;
    th = p < 3.4 ? 1 : 0;
  }
  // after the loop, x/y from the idle drift again; wrap
  x = ((x + 0.5) % 64 + 64) % 64 - 0.5; y = ((y + 0.5) % 64 + 64) % 64 - 0.5;
  o[0] = x; o[1] = y; o[2] = a; o[3] = th; o[4] = loop;
  return o;
}
const SP = [0, 0, 0, 0, 0];

function drawShip(x, y, a, thrust, I, t) {
  const c = Math.cos(a) * 1.2, s = Math.sin(a) * 1.2;
  for (const ox of x < 8 ? [0, 64] : x > 55 ? [0, -64] : [0]) for (const oy of y < 8 ? [0, 64] : y > 55 ? [0, -64] : [0]) {
    const X = (px, py) => x + ox + px * c - py * s, Y = (px, py) => y + oy + px * s + py * c;
    // the Asteroids ship: two long sides and a crossbar set in from the tips
    beam.line(X(5.8, 0), Y(5.8, 0), X(-4.2, 3.9), Y(-4.2, 3.9), I);
    beam.line(X(5.8, 0), Y(5.8, 0), X(-4.2, -3.9), Y(-4.2, -3.9), I);
    beam.line(X(-2.4, 3.2), Y(-2.4, 3.2), X(-2.4, -3.2), Y(-2.4, -3.2), I);
    if (thrust > 0) {
      const f = 3.6 + 2.2 * hash(Math.floor(t * 30), 5);
      beam.line(X(-2.4, 1.7), Y(-2.4, 1.7), X(-2.4 - f, 0), Y(-2.4 - f, 0), I * thrust * 0.8);
      beam.line(X(-2.4, -1.7), Y(-2.4, -1.7), X(-2.4 - f, 0), Y(-2.4 - f, 0), I * thrust * 0.8);
    }
  }
}

// ---------------------------------------------------------------- the rocks
/** The rock's 3D pose at time t (rotation matrix and centre), with shudder from hits. */
const M = new Float32Array(9);
let RCX = 0, RCY = 0;
function rockPose(k, t) {
  let yaw = 0.22 * Math.sin(kit.TAU * t / 11.3 + k * 1.7);
  let pit = 0.13 * Math.sin(kit.TAU * t / 8.7 + k * 2.3);
  let rol = 0.07 * Math.sin(kit.TAU * t / 13.1 + k * 0.9);
  let bx = 0.8 * Math.sin(kit.TAU * t / 9.1 + k * 1.1), by = 0.7 * Math.sin(kit.TAU * t / 7.3 + k * 0.6);
  // potshots: a knock along the shot, and a wobble
  const E = Math.floor((t - EP0) / EP);
  for (let e = E - 1; e <= E; e++) {
    if (isMinuteEp(e) || targetOf(e) !== k) continue;
    const th = EP0 + EP * e + 1.3 + IMP[k].travel, q = t - th;
    if (q < 0 || q > 3) continue;
    const knock = 1.6 * Math.exp(-5 * q) * (1 - Math.exp(-40 * q));
    bx += IMP[k].ux * knock; by += IMP[k].uy * knock;
    rol += 0.07 * Math.exp(-3 * q) * Math.sin(13 * q);
    pit += 0.12 * Math.exp(-3 * q) * Math.sin(9 * q);
  }
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pit), sp = Math.sin(pit), cr = Math.cos(rol), sr = Math.sin(rol);
  // R = Ry(yaw) * Rx(pitch) * Rz(roll)
  M[0] = cy * cr + sy * sp * sr; M[1] = -cy * sr + sy * sp * cr; M[2] = sy * cp;
  M[3] = cp * sr; M[4] = cp * cr; M[5] = -sp;
  M[6] = -sy * cr + cy * sp * sr; M[7] = sy * sr + cy * sp * cr; M[8] = cy * cp;
  RCX = SLOT[k][0] + bx; RCY = SLOT[k][1] + by;
}
const F = 70;
let PX = 0, PY = 0, PZ = 0;
function project(x, y, z) {
  const X = M[0] * x + M[1] * y + M[2] * z, Y = M[3] * x + M[4] * y + M[5] * z, Z = M[6] * x + M[7] * y + M[8] * z;
  const f = F / (F + Z);
  PX = RCX + X * f; PY = RCY + Y * f; PZ = Z;
  // the beam's wobble: a little deflection hum
  PX += 0.14 * Math.sin(0.23 * PY + SD * 2.9);
  PY += 0.1 * Math.sin(0.19 * PX + SD * 2.1);
}
function seg3(mx, my, a, len, psi, I) {
  const h = len / 2, cp = Math.cos(psi);
  const hx = h * Math.cos(a) * cp, hy = h * Math.sin(a) * cp, hz = h * Math.sin(psi);
  project(mx - hx, my - hy, -hz); const ax = PX, ay = PY, az = PZ;
  project(mx + hx, my + hy, hz);
  const depth = clamp(1 - 0.012 * (az + PZ) / 2, 0.6, 1.25);
  beam.line(ax, ay, PX, PY, I * depth);
}

/** The digit d resting in its slot. */
function drawRest(d, I, skip = -1) {
  const g = DIG[d].segs;
  for (let j = 0; j < N; j++) if ((j / GS | 0) !== skip) seg3(g[4 * j], g[4 * j + 1], g[4 * j + 2], g[4 * j + 3], 0, I);
}

// The burst flies in shards: GS consecutive segments of the outline, which
// tumble rigidly in 3D (whole turns, so they land flat) while their pieces
// re-lay from the old digit's shape to the new one's.
const GS = 4, NS = N / GS;
const FL = new Float32Array(NS * 8);
function flightSetup(k, minIdx, ix, iy, d0, d1) {
  const a = DIG[d0].segs, b = DIG[d1].segs;
  for (let s = 0; s < NS; s++) {
    let c0x = 0, c0y = 0, c1x = 0, c1y = 0;
    for (let j = s * GS; j < (s + 1) * GS; j++) { c0x += a[4 * j]; c0y += a[4 * j + 1]; c1x += b[4 * j]; c1y += b[4 * j + 1]; }
    c0x /= GS; c0y /= GS; c1x /= GS; c1y /= GS;
    const h1 = hash(minIdx * 7 + k, s, 1), h2 = hash(minIdx * 7 + k, s, 2), h3 = hash(minIdx * 7 + k, s, 3);
    let vx = c0x - ix, vy = c0y - iy;
    const L = Math.hypot(vx, vy) || 1, sp = 8 + 11 * h1;
    FL[8 * s] = vx / L * sp + (h2 - 0.5) * 5; FL[8 * s + 1] = vy / L * sp + (h3 - 0.5) * 5;
    FL[8 * s + 2] = (h2 < 0.5 ? -1 : 1) * kit.TAU;          // spin in the plane
    FL[8 * s + 3] = kit.TAU * (h3 < 0.7 ? 1 : 2);           // tumble out of it
    FL[8 * s + 4] = kit.TAU * h1;                           // tumble axis
    FL[8 * s + 5] = c0x; FL[8 * s + 6] = c0y; FL[8 * s + 7] = 0;
    SC[2 * s] = c1x; SC[2 * s + 1] = c1y;
  }
}
const SC = new Float32Array(NS * 2);
const Bf = (u) => (1 - Math.exp(-10 * u)) * (1 - sstep(0.2, 0.92, u));
const Gf = (u) => { const v = clamp(u / 0.92); return 1 - (1 - v) * (1 - v) * (1 - v); };
const Hf = (u) => sstep(0.25, 0.92, u);
function drawFlight(d0, d1, u, I, only = -1, amp = 1) {
  const a = DIG[d0].segs, b = DIG[d1].segs, B = Bf(u) * amp, G = Gf(u), Hh = Hf(u);
  for (let s = only < 0 ? 0 : only; s < (only < 0 ? NS : only + 1); s++) {
    const c0x = FL[8 * s + 5], c0y = FL[8 * s + 6], c1x = SC[2 * s], c1y = SC[2 * s + 1];
    const cx = c0x + (c1x - c0x) * Hh + FL[8 * s] * B, cy = c0y + (c1y - c0y) * Hh + FL[8 * s + 1] * B;
    const th = FL[8 * s + 2] * G, ps = FL[8 * s + 3] * G, ax = FL[8 * s + 4];
    const ct = Math.cos(th), st = Math.sin(th), cps = Math.cos(ps), sps = Math.sin(ps), ux = Math.cos(ax), uy = Math.sin(ax);
    for (let j = s * GS; j < (s + 1) * GS; j++) {
      const ox = (a[4 * j] - c0x) + ((b[4 * j] - c1x) - (a[4 * j] - c0x)) * Hh;
      const oy = (a[4 * j + 1] - c0y) + ((b[4 * j + 1] - c1y) - (a[4 * j + 1] - c0y)) * Hh;
      let da = b[4 * j + 2] - a[4 * j + 2]; da -= Math.round(da / Math.PI) * Math.PI;
      const an = a[4 * j + 2] + da * Hh, hl = (a[4 * j + 3] + (b[4 * j + 3] - a[4 * j + 3]) * Hh) / 2;
      const hx = Math.cos(an) * hl, hy = Math.sin(an) * hl;
      let sx = 0, sy = 0, sz = 0;
      for (let e = -1; e <= 1; e += 2) {
        const px = ox + e * hx, py = oy + e * hy;
        // tumble about the in-plane axis u, then spin in the plane
        const al = px * ux + py * uy, pe = -px * uy + py * ux;
        const qx = al * ux - pe * cps * uy, qy = al * uy + pe * cps * ux, qz = pe * sps;
        const rx = cx + qx * ct - qy * st, ry = cy + qx * st + qy * ct;
        project(rx, ry, qz);
        if (e < 0) { sx = PX; sy = PY; sz = PZ; }
      }
      const depth = clamp(1 - 0.012 * (sz + PZ) / 2, 0.6, 1.3);
      beam.line(sx, sy, PX, PY, I * depth);
    }
  }
}

// sparks: an explosion's dots, with streaks
function sparks(x, y, q, n, seed, speed, life, I) {
  if (q < 0 || q > life) return;
  const fade = (1 - q / life) ** 2;
  for (let j = 0; j < n; j++) {
    const th = kit.TAU * hash(seed, j, 9), v = speed * (0.35 + 0.65 * hash(seed, j, 10));
    const r1 = v * (1 - Math.exp(-2.5 * q)) / 2.5, q0 = Math.max(0, q - 0.05), r0 = v * (1 - Math.exp(-2.5 * q0)) / 2.5;
    const c = Math.cos(th), s = Math.sin(th);
    beam.line(x + c * r0, y + s * r0, x + c * r1, y + s * r1, I * fade * (0.6 + 0.4 * hash(seed, j, Math.floor(q * 20))));
  }
}

/** The latest potshot on rock k: seconds since it landed (or -1) and its episode. */
const CHIP = 1.5;
function potshot(k, t) {
  const E = Math.floor((t - EP0) / EP);
  for (let e = E; e >= E - 1; e--) {
    if (isMinuteEp(e) || targetOf(e) !== k) continue;
    const q = t - (EP0 + EP * e + 1.3 + IMP[k].travel);
    if (q >= 0 && q < CHIP) return [q, e];
  }
  return null;
}
/** The shard of digit d nearest the point (x, y) about the rock's centre. */
function nearestShard(d, x, y) {
  const g = DIG[d].segs;
  let best = 0, bd = 1e9;
  for (let s = 0; s < NS; s++) {
    let cx = 0, cy = 0;
    for (let j = s * GS; j < (s + 1) * GS; j++) { cx += g[4 * j]; cy += g[4 * j + 1]; }
    const dd = (cx / GS - x) ** 2 + (cy / GS - y) ** 2;
    if (dd < bd) { bd = dd; best = s; }
  }
  return best;
}

// ------------------------------------------------------------------ the face
export default {
  name: 'Vectorcade',
  blurb: 'Asteroids on a 1979 vector monitor: the rocks are the time, and the ship shoots each minute apart',
  layouts: ['hub'], look: 'smoke', fps: 60, brightness: 0.4, dither: true,
  frame(ctx) {
    const d = ctx.date, G = kit.grid(ctx);
    const sd = d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds() + d.getMilliseconds() / 1000;
    SD = sd;
    beam.clear();
    const minIdx = Math.floor(sd / 60), tau = sd - minIdx * 60;
    const now = digitsAt(minIdx), prev = digitsAt(minIdx - 1);
    const hourTurn = minIdx % 60 === 0;
    // which rocks are in flight: the changing ones, in a chain from the ship's shot
    const gap = hourTurn ? 0.32 : 0.3;
    const order = [3, 2, 1, 0].filter((k) => now[k] !== prev[k]);
    // heartbeat: faster through the minute
    const phi = 0.9 * tau + 1.3 * tau * tau * tau / 10800;
    const beat = 0.84 + 0.16 * Math.exp(-kit.fract(phi) * 6);

    for (let k = 0; k < 4; k++) {
      const col = k < 2 ? COL.hour : COL.min;
      const oi = order.indexOf(k), te = oi * gap, q = tau - te;
      if (oi >= 0 && q >= 0 && q < D) {
        const u = q / D;
        // the knock comes from the ship, or from the rock that burst before
        const src = oi === 0 ? [C, C] : SLOT[order[oi - 1]];
        rockPose(k, sd);
        const ix = (src[0] - SLOT[k][0]) * 0.35, iy = (src[1] - SLOT[k][1]) * 0.35;
        flightSetup(k, minIdx, ix, iy, +prev[k], +now[k]);
        // phosphor: the pieces leave trails while they fly
        for (let s = 2; s >= 0; s--) {
          const us = (q - s * 0.035) / D;
          if (us < 0) continue;
          drawFlight(+prev[k], +now[k], us, (s === 0 ? 0.95 : s === 1 ? 0.4 : 0.18) * (us > 0.95 ? (s ? 0 : 1) : 1));
        }
        const heat = Math.exp(-5 * u), lock = Math.exp(-(((u - 0.93) / 0.04) ** 2));
        beam.flush(kit.mix(col, COL.hot, heat), 0.35 + 0.5 * heat + 0.4 * lock);
        // the burst's sparks
        sparks(RCX + ix, RCY + iy, q, 16, minIdx * 5 + k, 26, 0.9, 1);
        beam.flush(COL.spark, 0.5);
      } else {
        rockPose(k, sd);
        const dk = +((oi >= 0 && q < 0) ? prev[k] : now[k]);
        // a potshot chips one shard off: it spins out and settles back
        const ps = potshot(k, sd);
        if (ps) {
          const ix = IMP[k].x - SLOT[k][0], iy = IMP[k].y - SLOT[k][1], sh = nearestShard(dk, ix, iy);
          flightSetup(k, ps[1] * 3 + 7, 0, 0, dk, dk);
          drawRest(dk, 0.88 * beat, sh);
          drawFlight(dk, dk, ps[0] / CHIP, 1, sh, 0.9);
        } else drawRest(dk, 0.88 * beat);
        beam.flush(col, 0.3);
      }
    }

    // shots, and the sparks where potshots land
    const E = Math.floor((sd - EP0) / EP);
    for (let e = E - 1; e <= E; e++) {
      for (const [tf, ax, ay, bx, by, th, kind] of shotsOf(e, SH)) {
        if (sd >= tf && sd < th) {
          const L = th - tf, f1 = (sd - tf) / L, f0 = Math.max(0, (sd - 0.06 - tf) / L);
          beam.line(ax + (bx - ax) * f0, ay + (by - ay) * f0, ax + (bx - ax) * f1, ay + (by - ay) * f1, 1);
        }
        if (kind >= 0 && !isMinuteEp(e)) sparks(bx, by, sd - th, 6, e * 3 + 1, 14, 0.45, 0.8);
      }
    }
    beam.flush(COL.shot, 0.6);

    // the saucer, in the hour show
    const Bn = Math.round(sd / 60) * 60, tauH = sd - Bn;
    if (Math.round(Bn / 60) % 60 === 0 && tauH > -4.6 && tauH < SAUCER_HIT + 1.4) {
      const seed = Math.round(Bn / 60);
      if (tauH < SAUCER_HIT) {
        saucerAt(tauH, sau);
        const wob = 1 + 0.07 * Math.sin(sd * kit.TAU * 7), I = 0.75 + 0.25 * Math.sin(sd * kit.TAU * 11);
        const sx = sau[0], sy = sau[1] + 0.5 * Math.sin(sd * kit.TAU * 3);
        const P = [[-6, 0], [-2.8, 1.9], [2.8, 1.9], [6, 0], [2.8, -1.7], [-2.8, -1.7]];
        for (let j = 0; j < 6; j++) {
          const [ax, ay] = P[j], [bx, by] = P[(j + 1) % 6];
          beam.line(sx + ax * wob, sy + ay, sx + bx * wob, sy + by, I);
        }
        beam.line(sx - 6 * wob, sy, sx + 6 * wob, sy, I * 0.8);
        beam.line(sx - 1.8, sy - 1.7, sx - 1.1, sy - 3.6, I);
        beam.line(sx - 1.1, sy - 3.6, sx + 1.1, sy - 3.6, I);
        beam.line(sx + 1.1, sy - 3.6, sx + 1.8, sy - 1.7, I);
        beam.flush(COL.saucer, 0.3);
      } else {
        const q = tauH - SAUCER_HIT;
        saucerAt(SAUCER_HIT, sau);
        // its eight pieces fly apart and fade
        const P = [[-6, 0, -2.8, 1.9], [-2.8, 1.9, 2.8, 1.9], [2.8, 1.9, 6, 0], [6, 0, 2.8, -1.7], [2.8, -1.7, -2.8, -1.7], [-2.8, -1.7, -6, 0], [-1.8, -1.7, -1.1, -3.6], [1.1, -3.6, 1.8, -1.7]];
        const fade = (1 - q / 1.4) ** 1.5, r = 22 * (1 - Math.exp(-2.2 * q));
        P.forEach(([ax, ay, bx, by], j) => {
          const mx = (ax + bx) / 2, my = (ay + by) / 2, L = Math.hypot(mx, my) || 1;
          const ox = sau[0] + mx + mx / L * r, oy = sau[1] + my + my / L * r, sp = (hash(seed, j) - 0.5) * 9 * q;
          const hx = (bx - ax) / 2, hy = (by - ay) / 2, c = Math.cos(sp), s = Math.sin(sp);
          beam.line(ox - hx * c + hy * s, oy - hx * s - hy * c, ox + hx * c - hy * s, oy + hx * s + hy * c, fade);
        });
        beam.flush(COL.saucer, 0.4);
        sparks(sau[0], sau[1], q, 26, seed * 13, 40, 1.2, 1);
        beam.flush(COL.hot, 0.6);
      }
    }

    // the ship, with its phosphor trail
    const loopNow = shipPose(sd, SP)[4];
    const trail = loopNow ? 7 : 3;
    const x0 = SP[0], y0 = SP[1];
    for (let s = trail; s >= 1; s--) {
      shipPose(sd - s * 0.06, SP);
      const moved = clamp((Math.hypot(SP[0] - x0, SP[1] - y0) - 0.6 * s) / (1.5 * s));
      if (moved > 0) drawShip(SP[0], SP[1], SP[2], 0, moved * 0.3 * (1 - s / (trail + 1)) ** 1.6, sd);
    }
    shipPose(sd, SP);
    drawShip(SP[0], SP[1], SP[2], SP[3], 1, sd);
    beam.flush(COL.ship, 0.25);

    beam.bloom(0.3);
    // out, dimmed at night
    const dim = 1 - 0.7 * ctx.night, o = ctx.out, rgb = beam.rgb, idx = G.idx;
    for (let p = 0; p < idx.length; p++) {
      const i = idx[p];
      if (i < 0) continue;
      o[3 * i] = rgb[3 * p] * dim; o[3 * i + 1] = rgb[3 * p + 1] * dim; o[3 * i + 2] = rgb[3 * p + 2] * dim;
    }
  },
};
