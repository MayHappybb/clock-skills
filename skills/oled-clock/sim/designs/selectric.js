// Selectric — an IBM Selectric typeball types the time on the inside of the glass.
//
// The glass is the sheet of paper and the ball is behind it, facing you, so
// its raised type reads the right way round and every strike leaves exactly
// the character you just saw on the ball. The ball is drawn in real 3D by
// inverse mapping: each pixel of its disc is taken back through the tilt and
// the rotation to the ball's own latitude and longitude, where two tiers of
// ten characters sit (digits above the equator, ":SELECTRIC" below), raised
// a little off the surface so they stand proud at the limb; a hub ring on
// top, detent teeth round the open skirt, a gloss and an unbroken rim. While
// it whirls, each pixel averages the type over the angle swept in one frame,
// so the tiers smear into rings and snap sharp as it stops.
//
// The time is typed in the same face (12 x 19, 14 px pitch, monoline 3 px,
// slab feet, ball terminals): the hour and a colon on the line above, then
// INDEX (line feed, no return) and the minutes, so they step down and right.
// At rest the ball sits back from the glass at the end of the line, turning
// slowly and nodding between its tiers, hovering, the carrier drifting.
//
// The minute: a Correcting Selectric. The ball backspaces, whirls to the old
// character and strikes it again through the lift-off tape, which peels the
// ink off the glass and carries it away down and along; then it whirls to
// the new one and strikes through the ribbon. Old digits go right to left,
// new ones come left to right, so no instant shows a wrong number.
//
// The hour: the margin bell drops in and rings, the ball spins a flourish,
// the sheet is pulled out upwards (its bottom edge sweeps past) and a fresh
// one rolls up from below; the carrier flies back to the margin and rattles
// off the hour and colon, INDEX, and the minutes.
//
// Burn-in: everything walks kit.orbit; ink is the only static light.
// 23:00-07:00 the panel dims (ctx.night).
import { sprite, dither, clamp, lerp, ease, previousMinute, orbit } from '../js/kit.js';

// ------------------------------------------------------------ type
// One typewriter face, 12 x 19, monospaced on a 14 px pitch: monoline 3 px
// strokes, slab feet, ball terminals. The same pictures are the raised type
// on the ball and the ink they leave on the glass.
const GW = 12, GH = 19;
const G = {
  0: `
    ....####....
    ..########..
    .##########.
    ####....####
    ###......###
    ###......###
    ###......###
    ###......###
    ###......###
    ###......###
    ###......###
    ###......###
    ###......###
    ###......###
    ###......###
    ####....####
    .##########.
    ..########..
    ....####....`,
  1: `
    .....###....
    ...#####....
    .#######....
    ###..###....
    #....###....
    .....###....
    .....###....
    .....###....
    .....###....
    .....###....
    .....###....
    .....###....
    .....###....
    .....###....
    .....###....
    .....###....
    .....###....
    .##########.
    .##########.`,
  2: `
    ...######...
    .##########.
    ####....####
    ###......###
    ###......###
    .#.......###
    .........###
    ........###.
    .......####.
    ......####..
    .....####...
    ....####....
    ...####.....
    ..####......
    .####....###
    ####.....###
    ############
    ############
    ############`,
  3: `
    ..########..
    .##########.
    ###......###
    ###......###
    .#.......###
    .........###
    ........###.
    ....######..
    ....######..
    ........####
    .........###
    .........###
    .........###
    .#.......###
    ###......###
    ####....####
    .##########.
    ..########..
    ....####....`,
  4: `
    .......###..
    ......####..
    .....#####..
    .....#####..
    ....######..
    ....######..
    ...###.###..
    ...###.###..
    ..###..###..
    ..###..###..
    .###...###..
    .###...###..
    ###....###..
    ############
    ############
    .......###..
    .......###..
    .....#######
    .....#######`,
  5: `
    ..#########.
    ..#########.
    ..#########.
    ..###.......
    ..###.......
    ..###.......
    ..###.####..
    ..#########.
    ..###...####
    .........###
    .........###
    .........###
    .........###
    .#.......###
    ###......###
    ####....####
    .##########.
    ..########..
    ....####....`,
  6: `
    ......####..
    ....######..
    ...####.....
    ..###.......
    .###........
    .###........
    ###..####...
    ###########.
    #####...####
    ###......###
    ###......###
    ###......###
    ###......###
    ###......###
    ###......###
    ####....####
    .##########.
    ..########..
    ....####....`,
  7: `
    ############
    ############
    ############
    ###.....###.
    ###.....###.
    ........###.
    .......###..
    .......###..
    ......###...
    ......###...
    .....###....
    .....###....
    .....###....
    ....###.....
    ....###.....
    ....###.....
    ....###.....
    ....###.....
    ....###.....`,
  8: `
    ...######...
    .##########.
    ####....####
    ###......###
    ###......###
    ###......###
    .###....###.
    ..########..
    ..########..
    .###....###.
    ###......###
    ###......###
    ###......###
    ###......###
    ###......###
    ####....####
    .##########.
    ..########..
    ....####....`,
  S: `
    ...######...
    .##########.
    ####....####
    ###......###
    ###.......#.
    ###.........
    ####........
    .#######....
    ..########..
    .....######.
    ........####
    .........###
    .........###
    .#.......###
    ###......###
    ####....####
    .##########.
    ..########..
    ....####....`,
  E: `
    ############
    ############
    ############
    .###.....###
    .###.....###
    .###........
    .###....#...
    .#########..
    .#########..
    .###....#...
    .###........
    .###........
    .###........
    .###........
    .###.....###
    .###.....###
    ############
    ############
    ############`,
  L: `
    #######.....
    #######.....
    ..###.......
    ..###.......
    ..###.......
    ..###.......
    ..###.......
    ..###.......
    ..###.......
    ..###.......
    ..###.......
    ..###.......
    ..###.......
    ..###.......
    ..###....###
    ..###....###
    ############
    ############
    ############`,
  C: `
    ...######...
    .##########.
    ####....####
    ###......###
    ###......###
    ###.......#.
    ###.........
    ###.........
    ###.........
    ###.........
    ###.........
    ###.........
    ###.........
    ###.......#.
    ###......###
    ####....####
    .##########.
    ..########..
    ....####....`,
  T: `
    ############
    ############
    ############
    ##..####..##
    #...####...#
    ....####....
    ....####....
    ....####....
    ....####....
    ....####....
    ....####....
    ....####....
    ....####....
    ....####....
    ....####....
    ....####....
    ....####....
    ..########..
    ..########..`,
  R: `
    #########...
    ##########..
    .###...####.
    .###....###.
    .###....###.
    .###....###.
    .###...####.
    .#########..
    .########...
    .###..####..
    .###...###..
    .###...####.
    .###....###.
    .###....####
    .###.....###
    .###.....###
    .###.....###
    #####...####
    #####...####`,
  I: `
    ..########..
    ..########..
    ....####....
    ....####....
    ....####....
    ....####....
    ....####....
    ....####....
    ....####....
    ....####....
    ....####....
    ....####....
    ....####....
    ....####....
    ....####....
    ....####....
    ....####....
    ..########..
    ..########..`,
  ':': `
    ............
    ............
    ............
    ............
    ............
    ....####....
    ....####....
    ....####....
    ....####....
    ............
    ............
    ............
    ............
    ....####....
    ....####....
    ....####....
    ....####....
    ............
    ............`,
};
// 9 is the 6 turned over.
G[9] = G[6].split('\n').filter((l) => l.trim()).map((l) => l.trim().split('').reverse().join('')).reverse().join('\n');
const SPR = {};
for (const k in G) SPR[k] = sprite(G[k]);


/** For review (out/selectric-digits.png): the face at 1x and 2x. */
export function specimen(g) {
  const keys = '0123456789:SELCTRI'.split('');
  keys.forEach((k, i) => g.blit(SPR[k], 2 + i * 14, 2));
  keys.slice(0, 11).forEach((k, i) => g.blit(SPR[k], 2 + i * 26, 26, { scale: 2 }));
}

// ------------------------------------------------------------ the ball
// Two tiers of ten: the digits above the equator, ":SELECTRIC" below.
const TIERS = ['0123456789'.split(''), ':SELECTRIC'.split('')];
const STEP = (2 * Math.PI) / 10;
const LAT = [0.4, -0.4];            // tier centres, radians
const RB = 26;                      // ball radius at contact, px: type there is 1:1
const RAISE = 0.7;                  // height of the raised type, px
const COSL = Math.cos(LAT[0]);
const SPRT = TIERS.map((t) => t.map((c) => SPR[c].data));
const posOf = (ch) => (ch === ':' ? [1, 0] : [0, +ch]);
const TAU = Math.PI * 2;

/** Is ball-frame (lat, lon) on raised type? Returns the sprite bit. */
function typeAt(lat, lon) {
  const t = lat > 0 ? 0 : 1;
  const row = Math.floor((LAT[t] - lat) * RB + 9.5);
  if (row < 0 || row >= GH) return 0;
  const kf = lon / STEP, k = Math.round(kf);
  const col = Math.floor((kf - k) * STEP * COSL * RB + 6);
  if (col < 0 || col >= GW) return 0;
  return SPRT[t][((k % 10) + 10) % 10][row * GW + col];
}
/** Any type within a pixel of (lat, lon)? Keeps a black moat round the type. */
function typeNear(lat, lon) {
  const d = 1.2 / RB;
  return typeAt(lat, lon) || typeAt(lat + d, lon) || typeAt(lat - d, lon) ||
    typeAt(lat, lon + d / COSL) || typeAt(lat, lon - d / COSL);
}

// light from upper left, in front (world, y up)
const LX = -0.42, LY = 0.5, LZ = Math.sqrt(1 - LX * LX - LY * LY);

/**
 * Draw the ball at (cx, cy), scale s (1 = touching the glass), rotated phi
 * about its own axis after a tilt theta, spinning at omega rad/s (blur).
 */
function drawBall(g, cx, cy, s, phi, theta, omega) {
  const R = RB * s, Rt = (RB + RAISE) * s;
  const ct = Math.cos(theta), st = Math.sin(theta);
  const blur = Math.abs(omega) / 60;                  // rad swept in one frame
  const K = blur < 0.04 ? 1 : Math.min(7, Math.ceil(blur / 0.06));
  const x0 = Math.max(0, Math.floor(cx - Rt)), x1 = Math.min(127, Math.ceil(cx + Rt));
  const y0 = Math.max(0, Math.floor(cy - Rt)), y1 = Math.min(63, Math.ceil(cy + Rt));
  const toBall = (nx, ny, nz) => {                    // undo the tilt about x
    const y = ny * ct + nz * st, z = -ny * st + nz * ct;
    return [Math.asin(clamp(y, -1, 1)), Math.atan2(nx, z) - phi, y];
  };
  for (let py = y0; py <= y1; py++) {
    const Y = py + 0.5 - cy;
    for (let px = x0; px <= x1; px++) {
      const X = px + 0.5 - cx, r2 = X * X + Y * Y;
      if (r2 > Rt * Rt) continue;
      // the raised faces of the type, a shell RAISE above the ball
      {
        const nz = Math.sqrt(1 - r2 / (Rt * Rt));
        const [lat, lon] = toBall(X / Rt, -Y / Rt, nz);
        let cov = 0;
        if (K === 1) cov = typeAt(lat, lon);
        else { for (let j = 0; j < K; j++) cov += typeAt(lat, lon + ((j + 0.5) / K - 0.5) * blur); cov /= K; }
        if (cov > 0) {
          // solid type; foreshortened type is dropped before it turns to slivers
          if (r2 < (R - 2) * (R - 2)) {
            if (K === 1 ? nz > 0.5 : cov >= 0.5 && nz > 0.5) g.pixel(px, py, 1);
            continue;
          }
        }
      }
      if (r2 > R * R) continue;
      const nx = X / R, ny = -Y / R, nz = Math.sqrt(1 - r2 / (R * R));
      const [lat, lon] = toBall(nx, ny, nz);
      let on = 0;
      if (r2 > (R - 1.1) * (R - 1.1)) on = 1;               // silhouette, unbroken
      else if (r2 < (R - 2) * (R - 2) && K === 1 && typeAt(lat, lon)) continue;  // a wall of the type: dark
      else if (lat > 0.86) on = lat < 0.92 ? 1 : 0;      // the top: hub ring
      else if (lat < -0.84) {                            // open skirt with detent teeth
        if (lat > -0.9) on = (Math.floor(lon / (TAU / 44)) & 1) ? 1 : 0;
      } else {
        const sp = nx * LX + ny * LY + nz * LZ;
        if (sp > 0.975) on = 1;                          // the gloss, solid
        if (on && K === 1 && typeNear(lat, lon)) on = 0;
      }
      if (on) g.pixel(px, py, 1);
    }
  }
  // sweep away crumbs: a lit pixel with at most one lit neighbour of eight
  // is a sliver of foreshortened type, not a shape
  const W = g.width, b = g.buf, kill = [];
  for (let py = Math.max(1, y0); py <= Math.min(62, y1); py++)
    for (let px = Math.max(1, x0); px <= Math.min(126, x1); px++) {
      const i = py * W + px;
      if (!b[i]) continue;
      const n = b[i - 1] + b[i + 1] + b[i - W] + b[i + W] + b[i - W - 1] + b[i - W + 1] + b[i + W - 1] + b[i + W + 1];
      if (n <= 1) kill.push(i);
    }
  for (const i of kill) b[i] = 0;
}

// ------------------------------------------------------------ the script
// Layout: a 14 px pitch from x = 3. The hour line is one line feed (LF)
// above the strike line; minutes are typed after an INDEX (line feed with
// no return), so the hour's colon sits above-left of the minutes.
const X0 = 3, ADV = 14, SY = 29, LF = 23;      // SY: top of type on the strike line
const cellX = (c) => X0 + ADV * c;             // left of a type cell
const cellCx = (c) => cellX(c) + 6;            // the ball's centre when striking it
const BCY = SY + 9.5;                          // ball centre y when striking
// a typewriter never quite holds its line: each character sits a pixel high
// or low, the same every time (that typebar, that column)
const jit = (ch, col) => [0, 1, 0, -1, 0, 0, 1][((ch.charCodeAt(0) * 5 + col * 3) % 7)];
const REST_X = 105, REST_S = 0.84;

/** A value over time: eased segments appended in order. */
class Track {
  constructor(v) { this.v0 = v; this.v = v; this.segs = []; }
  to(t0, dur, v1, e = ease.inOutCubic) { this.segs.push([t0, t0 + dur, this.v, v1, e]); this.v = v1; return this; }
  at(t) {
    let v = this.v0;
    for (const [a, b, va, vb, e] of this.segs) {
      if (t < a) break;
      if (t < b) return lerp(va, vb, e((t - a) / (b - a)));
      v = vb;
    }
    return v;
  }
}

// idle motion, from absolute time T (s): it never stops
// at rest the ball turns slowly on its own, nodding between its two tiers
const idlePhi = (T) => 0.26 * T + 0.15 * Math.sin(T * 0.7);
const idleTheta = (T) => -0.4 + 0.1 * Math.sin(T * 0.43);   // the letter tier faces out
const drift = (T) => 2.2 * Math.sin(T * 0.19) + 0.8 * Math.sin(T * 0.47 + 0.5);
const bob = (T) => 0.8 * Math.sin(T * 1.9);

const angleFor = (ch) => -posOf(ch)[1] * STEP;
const tiltFor = (ch) => LAT[posOf(ch)[0]];

/**
 * The episode that runs from the top of the minute: tracks for the ball
 * (x, phi, theta, scale), ribbon and tape lifts, the paper, and the strikes.
 * Built from the clock alone, so any instant has an answer.
 */
function episode(prev, cur, T0) {
  const ch0 = prev.mm[1];
  const X = new Track(REST_X + drift(T0)), P = new Track(idlePhi(T0)), Y = new Track(0);
  const TH = new Track(idleTheta(T0)), S = new Track(REST_S);
  const RIB = new Track(0), TAPE = new Track(0);
  const OLD = new Track(-LF), NEW = new Track(60);  // the two sheets' offsets
  const ev = [];                                     // strikes: {t, kind, ch, col, line}
  const whirl = (t, dur, ch, spins) => {
    const base = angleFor(ch), cur0 = P.v;
    let d = ((base - cur0) % TAU + TAU) % TAU; if (d > Math.PI) d -= TAU;
    const dir = d >= 0 ? 1 : -1;
    P.to(t, dur, cur0 + d + dir * spins * TAU, ease.inOutCubic);
    TH.to(t, dur, tiltFor(ch), ease.inOutQuad);
  };
  const strike = (ts, kind, ch, col, line, fast) => {
    const lift = kind === 'lift' ? TAPE : RIB;
    lift.to(ts - 0.06, 0.06, 1, ease.outQuad);
    S.to(ts - 0.015, 0.06, 1, ease.inQuad).to(ts + 0.06, fast ? 0.07 : 0.1, REST_S, ease.outQuad);
    ev.push({ t: ts + 0.045, kind, ch, col, line });
    if (kind === 'lift') TAPE.to(ts + 0.08, 0.55, 0, ease.inOutQuad);
    else RIB.to(ts + 0.1, 0.12, 0, ease.inQuad);
  };
  let t = 0, end;
  if (cur.m !== 0) {
    const ch = [0, 1].filter((i) => prev.mm[i] !== cur.mm[i]);
    let first = true;
    for (const i of [...ch].reverse()) {             // lift off, right to left
      const d = first ? 0.34 : 0.26; first = false;
      X.to(t, d, cellCx(3 + i)); Y.to(t, d, jit(prev.mm[i], 3 + i)); whirl(t, d, prev.mm[i], 1);
      strike(t + d, 'lift', prev.mm[i], 3 + i, 1); t += d + 0.13;
    }
    for (const i of ch) {                            // retype, left to right
      const d = 0.3;
      X.to(t, d, cellCx(3 + i)); Y.to(t, d, jit(cur.mm[i], 3 + i)); whirl(t, d, cur.mm[i], 1);
      strike(t + d, 'ink', cur.mm[i], 3 + i, 1); t += d + 0.13;
    }
    X.to(t, 0.45, REST_X + drift(T0 + t + 0.45)); Y.to(t, 0.45, 0); TH.to(t, 0.45, idleTheta(T0 + t + 0.45)); P.to(t, 0.45, P.v + 0.5, ease.outQuad); end = t + 0.45;
  } else {
    // the hour: flourish and bell, the sheet pulled out, a fresh one rolled in
    P.to(0, 0.5, P.v + 2 * TAU, ease.inOutQuad);
    TH.to(0, 0.25, -0.5, ease.inOutQuad).to(0.25, 0.25, 0.4, ease.inOutQuad);
    OLD.to(0.3, 0.75, -LF - 80, ease.inCubic);
    X.to(0.45, 0.6, cellCx(0), ease.inOutCubic); Y.to(0.45, 0.6, jit(cur.hh[0], 0));
    NEW.to(0.8, 0.35, 0, ease.outCubic);
    whirl(0.5, 0.62, cur.hh[0], 1);
    const seq = [[cur.hh[0], 0], [cur.hh[1], 1], [':', 2]];
    t = 1.12;
    seq.forEach(([c, col], k) => {
      if (k) { const d = 0.17; X.to(t, d, cellCx(col)); Y.to(t, d, jit(c, col)); whirl(t, d, c, 0); t += d; }
      strike(t, 'ink', c, col, 0, true); t += 0.06;
    });
    t += 0.04;
    NEW.to(t, 0.28, -LF, ease.inOutCubic);           // INDEX: line feed, no return
    X.to(t, 0.28, cellCx(3)); Y.to(t, 0.28, jit(cur.mm[0], 3)); whirl(t, 0.28, cur.mm[0], 1); t += 0.28;
    strike(t, 'ink', cur.mm[0], 3, 1, true); t += 0.06;
    X.to(t, 0.17, cellCx(4)); Y.to(t, 0.17, jit(cur.mm[1], 4)); whirl(t, 0.17, cur.mm[1], 0); t += 0.17;
    strike(t, 'ink', cur.mm[1], 4, 1, true); t += 0.1;
    X.to(t, 0.45, REST_X + drift(T0 + t + 0.45)); Y.to(t, 0.45, 0); TH.to(t, 0.45, idleTheta(T0 + t + 0.45)); P.to(t, 0.45, P.v + 0.5, ease.outQuad); end = t + 0.45;
  }
  return { X, Y, P, TH, S, RIB, TAPE, OLD, NEW, ev, end, hour: cur.m === 0 };
}

// ------------------------------------------------------------ props
/** A band carried in front of the ball (ribbon or lift-off tape), lift u. */
function bandTop(u) { return lerp(66, SY - 2, u); }
function drawBand(g, cx, top, kind, T) {
  const x0 = Math.round(cx - 16), w = 33, y = Math.round(top);
  g.fillRect(x0, y, w, 23, 0);
  g.hline(x0, y, w, 1); g.hline(x0, y + 22, w, 1);
  if (kind === 'ribbon') {                            // film ribbon: a glint runs along it
    const gx = ((T * 23) % 60) - 14;
    for (let k = 0; k < 3; k++) g.line(x0 + gx + k, y + 2, x0 + gx + k + 3, y + 6, 1);
  }
}

const BELL = sprite(`
  ....###....
  ...#####...
  ..#######..
  ..#######..
  ..#######..
  .#########.
  ###########
  ...........
  ....###....`);

// ------------------------------------------------------------ export
export default {
  name: 'Selectric',
  blurb: 'A Selectric typeball behind the glass types the time onto it: each minute it lifts the old digit off with correction tape and strikes the new one; on the hour a bell, a flourish and a fresh sheet.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  frame(g, ctx) {
    const { date, fields: f, oled, night } = ctx;
    const prev = previousMinute(date);
    const tau = f.sec;                                 // seconds since the minute turned
    const T0 = (date.getTime() - tau * 1000) / 1000 % 86400;
    const T = T0 + tau;
    const E = episode(prev, f, T0);
    const [ox, oy] = orbit(date, 2, 3);
    const am = clamp((tau - E.end) / 1.5, 0, 1), idle = ease.inOutQuad(am);
    const at = (tr, tt = tau) => tr.at(tt);
    const cx = at(E.X) + (idle ? (REST_X + drift(T)) - (REST_X + drift(T0 + E.end)) : 0) * idle + ox;
    const pe = E.P.v, de = (((idlePhi(T0 + E.end) - pe) % TAU) + TAU + Math.PI) % TAU - Math.PI;
    const phi = tau < E.end ? at(E.P) : idlePhi(T) - de * (1 - idle);
    const omega = tau < E.end ? (at(E.P, tau + 1 / 120) - at(E.P, tau - 1 / 120)) * 60 : 0;
    const theta = lerp(at(E.TH), idleTheta(T), idle);
    const s = at(E.S);
    const cy = BCY + oy + at(E.Y) + idle * bob(T);
    drawBall(g, cx, cy, s, phi, theta, omega);

    // ink: what the glass held at the top of the minute, then every strike so far
    const ink = new Map();                             // key "sheet,line,col" -> ch
    const sheet0 = E.hour ? 'old' : 'new';
    const ph = E.hour ? prev : f;
    [[ph.hh[0], 0, 0], [ph.hh[1], 0, 1], [':', 0, 2], [prev.mm[0], 1, 3], [prev.mm[1], 1, 4]]
      .forEach(([c, line, col]) => ink.set(`${sheet0},${line},${col}`, c));
    const taped = [];
    for (const e of E.ev) {
      if (e.t > tau) break;
      const key = `new,${e.line},${e.col}`;
      if (e.kind === 'lift') { ink.delete(key); taped.push(e); } else ink.set(key, e.ch);
    }
    // the lift-off tape, carrying what it took: it rides with the ball and
    // steps along one character after each lift, out of the window
    const tu = at(E.TAPE);
    if (tu > 0.001) {
      const top = Math.round(bandTop(tu));
      drawBand(g, cx, top, 'tape', T);
      const bx0 = Math.round(cx - 16);
      g.clip(bx0 + 1, top + 1, 31, 21);
      taped.forEach((e, i) => {
        const steps = taped.length - 1 - i + ease.inOutQuad(clamp((tau - e.t - 0.25) / 0.3, 0, 1));
        g.blit(SPR[e.ch], Math.round(cx - 6 - steps * 15), top + 2);
      });
      g.unclip();
    }
    drawBand(g, cx, bandTop(at(E.RIB)), 'ribbon', T);
    const offs = { old: E.hour ? at(E.OLD) : -LF, new: E.hour ? at(E.NEW) : -LF };
    for (const [key, c] of ink) {
      const [sh, line, col] = key.split(',');
      const x = cellX(+col) + ox, y = Math.round(SY + +line * LF + offs[sh] + oy) + jit(c, +col);
      if (y > 64 || y < -GH) continue;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) g.blit(SPR[c], x + dx, y + dy, { c: 0 });
      g.blit(SPR[c], x, y);
    }
    // the edges of the sheets, seen only when paper moves on the hour
    if (E.hour) {
      const eo = Math.round(SY + 40 + at(E.OLD) + LF + oy), en = Math.round(SY - 11 + at(E.NEW) + oy);
      if (eo >= 0 && eo < 64) g.hline(0, eo, 128, 1);
      if (en >= 0 && en < 64 && tau > 0.8) g.hline(0, en, 128, 1);
      // the margin bell drops in, rings and goes
      if (tau < 1.3) {
        const by = -10 + 12 * ease.outBack(clamp(tau / 0.2, 0, 1)) - 14 * ease.inQuad(clamp((tau - 1.0) / 0.3, 0, 1));
        const ring = tau > 0.12 && tau < 0.95 ? Math.sin(tau * 70) * (0.95 - tau) * 2.2 : 0;
        const bx = 108 + ox + Math.round(ring);
        g.vline(bx + 5, by - 12, 12, 1);
        g.blit(BELL, bx, Math.round(by));
        if (ring) {
          const a = Math.round((tau * 9) % 2);
          g.arc(bx + 5.5, by + 4, 8 + a * 2, 9 + a * 2, -2.2, -1.7, 1);
          g.arc(bx + 5.5, by + 4, 8 + a * 2, 9 + a * 2, 1.7, 2.2, 1);
        }
      }
    }
    oled.contrast(0xcf + (0x20 - 0xcf) * night);
  },
};
