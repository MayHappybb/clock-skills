// Marionette — the time is a troupe of wooden puppets on strings.
//
// Every numeral is a marionette: one chain of sixteen wooden dowels pinned
// at knuckle joints, hung by two strings from a control bar that an unseen
// hand, hidden above the pelmet, works all day. The numeral is the puppet's
// pose, so the digits cannot be swapped for a font: what moves is joints.
//
// Always: the hand rocks each bar and the puppets swing under it, the lower
// joints lagging like a real hanging figure; every second one of the
// minute puppets does a little hop, and its feet drag behind.
//
// The minute: the hand lets the old puppet's strings run slack, it slumps
// and falls in a heap of sticks on the boards (each joint in free fall,
// strings sagging after it), the strings are reeled in, new ones are let
// down to the heap, and the hand hauls the next numeral up out of the same
// sticks, limbs dangling behind and swinging into place.
//
// The hour: every puppet drops at once, the house curtain is drawn across
// and opened again on four heaps of sticks, the troupe is hauled up into
// the new time and takes a bow.
//
// Hours stand upstage, smaller; minutes downstage, large. frame() is a
// pure function of the clock: the turn is scheduled around :00 using the
// minute before and after.

import { ease, clamp, lerp, progress, noise, orbit, clockFields, previousMinute, sprite, ON, OFF } from '../js/kit.js';

const TAU = Math.PI * 2;
const N = 16; // joints per puppet

// ------------------------------------------------------------ the puppets
// Each numeral as its bends, in a 20 x 34 box, and the two bends its strings
// are tied to. The chain may retrace itself (the 1's foot, the 3's waist,
// the 8's crossing): overlapping dowels read as one.
const KEYS = {
  0: { p: [[6, 0], [14, 0], [20, 6], [20, 28], [14, 34], [6, 34], [0, 28], [0, 6], [6, 0]], s: [0, 1] },
  1: { p: [[3, 8], [10, 1], [10, 34], [4, 34], [16, 34]], s: [0, 1] },
  2: { p: [[0, 7], [6, 0], [14, 0], [20, 6], [20, 12], [0, 34], [20, 34]], s: [1, 3] },
  3: { p: [[0, 4], [5, 0], [15, 0], [20, 5], [20, 11], [14, 16], [7, 16], [14, 16], [20, 21], [20, 29], [15, 34], [5, 34], [0, 30]], s: [1, 3] },
  4: { p: [[14, 34], [14, 0], [0, 24], [20, 24]], s: [2, 1] },
  5: { p: [[20, 0], [3, 0], [1, 16], [8, 13], [15, 14], [20, 20], [20, 28], [14, 34], [5, 34], [0, 30]], s: [1, 0] },
  6: { p: [[18, 1], [10, 0], [4, 3], [0, 10], [0, 28], [6, 34], [14, 34], [20, 28], [20, 21], [14, 15], [6, 15], [0, 20]], s: [2, 0] },
  7: { p: [[0, 6], [0, 0], [20, 0], [9, 34]], s: [1, 2] },
  8: { p: [[10, 16], [2, 11], [2, 5], [7, 0], [13, 0], [18, 5], [18, 11], [10, 16], [20, 22], [20, 29], [15, 34], [5, 34], [0, 29], [0, 22], [10, 16]], s: [3, 4] },
  9: { p: [[2, 32], [9, 34], [15, 32], [20, 24], [20, 6], [14, 0], [6, 0], [0, 6], [0, 13], [6, 19], [14, 19], [20, 14]], s: [6, 5] },
};

// Spread the bends over N joints: extra joints go into the longest dowels,
// so every puppet is the same chain and joint i of one numeral can become
// joint i of the next.
function buildPuppet({ p, s }) {
  const segs = [];
  for (let i = 1; i < p.length; i++) segs.push(Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
  const extra = N - p.length;
  const total = segs.reduce((a, b) => a + b, 0);
  const cuts = segs.map((l) => Math.floor((l / total) * extra));
  let left = extra - cuts.reduce((a, b) => a + b, 0);
  const rem = segs.map((l, i) => [(l / total) * extra - cuts[i], i]).sort((a, b) => b[0] - a[0]);
  for (let k = 0; left > 0; k++, left--) cuts[rem[k % rem.length][1]]++;
  const J = [[...p[0]]];
  const keyAt = [0];
  for (let i = 1; i < p.length; i++) {
    const n = cuts[i - 1] + 1;
    for (let k = 1; k <= n; k++) J.push([lerp(p[i - 1][0], p[i][0], k / n), lerp(p[i - 1][1], p[i][1], k / n)]);
    keyAt.push(J.length - 1);
  }
  const strings = s.map((k) => keyAt[k]);
  // How many dowels each joint hangs below its nearest string: lag.
  const depth = J.map((_, j) => Math.min(...strings.map((q) => Math.abs(q - j))));
  return { J, strings, depth };
}
const PUPPETS = Object.fromEntries(Object.entries(KEYS).map(([d, k]) => [d, buildPuppet(k)]));

// ------------------------------------------------------------ drawing

/** Dowels and knuckles of one puppet, joints already in canvas coordinates. */
function drawChain(g, J, rod, pins = true) {
  const r = rod / 2;
  for (let i = 1; i < J.length; i++) g.thickLine(J[i - 1][0], J[i - 1][1], J[i][0], J[i][1], rod, ON);
  const knuck = [];
  for (let i = 0; i < J.length; i++) {
    let bend = 1;
    if (i > 0 && i < J.length - 1) {
      const ax = J[i][0] - J[i - 1][0], ay = J[i][1] - J[i - 1][1];
      const bx = J[i + 1][0] - J[i][0], by = J[i + 1][1] - J[i][1];
      const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
      if (la < 0.3 || lb < 0.3) continue;
      const c = clamp((ax * bx + ay * by) / (la * lb), -1, 1);
      bend = progress(Math.acos(c), 0.35, 0.8);
    }
    if (bend <= 0) continue;
    const kr = r + 0.95 * bend;
    g.fillCircle(J[i][0], J[i][1], kr, ON);
    if (bend > 0.6) knuck.push(J[i]);
  }
  if (pins) for (const [x, y] of knuck) g.pixel(Math.floor(x), Math.floor(y), OFF);
}

/** A string from hook (hx,hy) to (jx,jy), sagging by `sag` px. */
function drawString(g, hx, hy, jx, jy, sag) {
  const mx = (hx + jx) / 2 + sag * 0.55, my = (hy + jy) / 2 + sag;
  let px = hx, py = hy;
  const n = sag > 0.5 ? 10 : 1;
  for (let k = 1; k <= n; k++) {
    const u = k / n, v = 1 - u;
    const x = v * v * hx + 2 * u * v * mx + u * u * jx, y = v * v * hy + 2 * u * v * my + u * u * jy;
    g.line(px, py, x, y, ON);
    px = x; py = y;
  }
}

/** For review: the ten puppets at rest, as a sheet. */
export function specimen(g, x0 = 4, y0 = 6, gap = 26, scale = 1, rod = 3.4) {
  for (let d = 0; d <= 9; d++) {
    const P = PUPPETS[d];
    const J = P.J.map(([x, y]) => [x0 + d * gap + x * scale, y0 + y * scale]);
    drawChain(g, J, rod, scale >= 0.9);
  }
}

// ------------------------------------------------------------ the stage

// Hours upstage (small, further back), minutes downstage (large). `floor` is
// where a dowel lying on the boards has its centre.
const SLOTS = [
  { x: 11, y: 19, s: 0.56, rod: 2.3, barY: 8, ph: 0.0, half: 5.5, floor: 38.4 },
  { x: 26, y: 19, s: 0.56, rod: 2.3, barY: 8, ph: 1.9, half: 5.5, floor: 38.4 },
  { x: 64, y: 22, s: 1, rod: 3.4, barY: 9.5, ph: 3.1, half: 10, floor: 57.4 },
  { x: 93, y: 22, s: 1, rod: 3.4, barY: 9.5, ph: 4.4, half: 10, floor: 57.4 },
];
// `floor`: where a dowel lying on the boards has its centre. The hours
// stand upstage on a riser, the minutes on the forestage.
for (const S of SLOTS) S.cx = S.x + 10 * S.s;
const RISER = { x0: 7, x1: 55, y: 41 };

const G = 560;            // px/s^2: how fast a dropped joint falls
const SAG0 = -1.3;        // the hand lowers the bar, the strings go slack
const FALL0 = -1.0;       // the joints let go
const REEL = [-0.5, -0.2]; // the old strings are reeled in
const MIN_RISE = 0.2;     // the new puppet is hauled up
const RISE_DUR = 0.85;
const MIN_END = 1.6;
const HOUR_RISE = 2.9;    // after the curtain
const HOUR_BOW = 4.7;
const HOUR_END = 6.2;

const spring = (u) => {
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  const v = 1 - Math.exp(-5.5 * u) * Math.cos(8 * u);
  return v + (1 - v) * u ** 4;
};

// The heap a dropped puppet lands in, drawn by hand: a sprawl of sticks
// along the boards with a tent of them propped up in the middle, so the
// dowels still read as dowels. x from the puppet's centre, y up from the
// boards, in minute-puppet pixels.
const HEAP = [
  [-12, 0], [-4, 0], [4, 0], [12, 0], [9, 0.5], [3, 3.4], [-3, 5.8], [-9, 8.2],
  [-9.6, 4.2], [-9, 0.5], [-3, 3.2], [3, 6], [9.5, 8.6], [5, 6.6], [0, 4.4], [-4.5, 2.4],
];

/** Where joint j of slot i lies in the heap of sticks on the boards. */
function heapAt(S, i, j) {
  const [hx, hy] = HEAP[j];
  const m = i % 2 ? -1 : 1;
  const jit = (noise(j * 1.7 + i * 3.1, 4) - 0.5) * 0.8;
  return [S.cx + (m * hx * 0.9 + jit) * S.s, S.floor - Math.max(0, hy + jit * 0.5) * S.s];
}

const digits = (F) => [F.hh[0], F.hh[1], F.mm[0], F.mm[1]].map(Number);

/** What is showing: the numerals before and after the turn and the time relative to it. */
function schedule(date, f) {
  if (f.sec >= 60 + SAG0) {
    const next = clockFields(new Date(date.getTime() + 60000));
    return { A: digits(f), B: digits(next), rel: f.sec - 60, hour: next.m === 0 };
  }
  if (f.m === 0 && f.sec < HOUR_END) return { A: digits(previousMinute(date)), B: digits(f), rel: f.sec, hour: true };
  if (f.sec < MIN_END) return { A: digits(previousMinute(date)), B: digits(f), rel: f.sec, hour: false };
  return { A: digits(f), B: digits(f), rel: null, hour: false };
}

/**
 * One puppet at this instant: its joints, its bar, its strings.
 * `T` is absolute time in seconds, `sec` the seconds into the minute.
 */
function puppet(i, sch, T, sec) {
  const S = SLOTS[i];
  const { rel, hour } = sch;
  const changing = rel !== null && (hour || sch.A[i] !== sch.B[i]);
  const riseAt = hour ? HOUR_RISE + 0.15 * i : MIN_RISE;
  const PA = PUPPETS[sch.A[i]], PB = PUPPETS[sch.B[i]];
  const place = (P, j) => [S.x + P.J[j][0] * S.s, S.y + P.J[j][1] * S.s];

  let J, hung = 1, barDy = 0, P = PB, strings = [];
  const after = !changing || rel >= riseAt - 0.4;
  if (!changing) {
    J = PB.J.map((_, j) => place(PB, j));
  } else if (!after) {
    // The slump: the bar comes down, the strings go slack, every joint falls.
    P = PA;
    const sag = ease.inOutQuad(progress(rel, SAG0, FALL0));
    barDy = 2.5 * S.s * sag;
    const maxD = Math.max(...PA.depth);
    J = PA.J.map((_, j) => {
      const [ax, ay0] = place(PA, j);
      const ay = ay0 + sag * (0.8 + 1.4 * PA.depth[j] / maxD) * S.s;
      const [hx, hy] = heapAt(S, i, j);
      const t = rel - FALL0 - 0.04 * (1 - PA.depth[j] / maxD);
      if (t <= 0) return [ax, ay];
      const dist = Math.max(0.01, hy - ay);
      const tl = Math.sqrt((2 * dist) / G);
      if (t < tl) return [lerp(ax, hx, ease.inOutQuad(t / tl)), ay + 0.5 * G * t * t];
      const b = t - tl;
      return [hx, hy - Math.min(dist, 2.2 * S.s) * 0.5 * Math.abs(Math.sin(b * TAU * 1.7)) * Math.exp(-b * 8)];
    });
    hung = 1 - progress(rel, FALL0, FALL0 + 0.25);
  } else {
    // The haul: new strings come down to the heap, catch, and the hand
    // lifts the next numeral out of the same sticks.
    J = PB.J.map((_, j) => {
      const h = heapAt(S, i, j);
      if (rel < riseAt) return h;
      const [bx, by] = place(PB, j);
      const u = spring((rel - riseAt - 0.05 * PB.depth[j]) / RISE_DUR);
      return [lerp(h[0], bx, u), lerp(h[1], by, u)];
    });
    barDy = -3 * S.s * Math.sin(Math.PI * progress(rel, riseAt - 0.1, riseAt + 0.5));
    hung = progress(rel, riseAt + 0.4, riseAt + 1.1);
  }

  // The hand's rocking, and the lag of a hanging body under it.
  const P0 = i < 2 ? 5.3 : 3.7;
  const amp = i < 2 ? 0.02 : 0.028;
  // The routine, four beats to a bar: tens skip, units skip, everyone
  // swings left, everyone swings right. The hours just sway.
  const beat = Math.floor(sec) % 4;
  const tau = sec % 1;
  const lean = (u) => (i < 2 ? 0 : (beat === 2 ? -1 : beat === 3 ? 1 : 0) * 0.075 *
    Math.sin(Math.PI * clamp(u / 0.85, 0, 1)) ** 2);
  const phi = (lag) => amp * Math.sin((TAU * (T - lag)) / P0 + S.ph) + lean(tau - lag);
  const tilt = phi(0) * 1.8;
  const hopOn = i >= 2 && beat === i - 2;
  const hop = (u) => (u > 0 && u < 0.5 ? Math.sin((Math.PI * u) / 0.5) : 0) * 2.8;
  const kickDir = Math.floor(sec / 4) % 2 ? 1 : -1;
  const barLift = hopOn ? hop(tau) : 0;
  const bow = hour && rel !== null && rel > HOUR_BOW
    ? Math.sin(Math.PI * progress(rel, HOUR_BOW + 0.08 * i, HOUR_BOW + 1.1 + 0.08 * i)) ** 2 : 0;
  // The hours start when the minute puppet hits the boards.
  const flinch = i < 2 && !changing && rel !== null && !hour
    ? Math.sin(Math.PI * progress(rel, -0.62 + 0.06 * i, -0.2 + 0.06 * i)) * 2 : 0;
  const by = S.barY - barLift * hung + barDy + bow * 6 * S.s - flinch;
  const top = S.y;
  J = J.map(([x, y], j) => {
    const lag = (0.22 * (y - by)) / 40;
    let dx = (y - by) * phi(lag) * hung, dy = -flinch * (1 - progress(y - by, 10, 30) * 0.5);
    if (hopOn) {
      // Up on the bar, and the feet kick out a beat late.
      const lagH = (0.1 * (y - top)) / 34;
      dy -= hop(tau - lagH) * hung;
      const foot = progress(y, top + 18, top + 34);
      const k = Math.sin(Math.PI * clamp((tau - 0.08 - lagH) / 0.6, 0, 1));
      dx += kickDir * (i === 2 ? -1 : 1) * 3 * foot * foot * k * hung;
      dx -= kickDir * 0.9 * (1 - foot) * k * hung * progress(y, top + 14, top);
    }
    return [x + dx, y + dy];
  });

  // Hour: the curtain call.
  if (bow > 0) {
    const waist = S.y + 17 * S.s;
    J = J.map(([x, y]) => [x, y + bow * Math.max(0, waist - y) * 0.5]);
  }

  // Strings: from hooks on the bar to the tied joints.
  const hook = (q, Pz) => {
    const ox = place(Pz, q)[0] - S.cx;
    return [S.cx + ox * Math.cos(tilt), by + ox * Math.sin(tilt)];
  };
  if (!changing) {
    for (const q of PB.strings) strings.push([...hook(q, PB), ...J[q], 0]);
  } else if (!after) {
    const slack = 7 * S.s * progress(rel, FALL0, FALL0 + 0.4);
    const reel = ease.inQuad(progress(rel, REEL[0], REEL[1]));
    if (reel < 1)
      for (const q of PA.strings) {
        const [hx, hy] = hook(q, PA);
        strings.push([hx, hy, lerp(J[q][0], hx, reel), lerp(J[q][1], hy, reel), slack * (1 - reel)]);
      }
  } else {
    const down = ease.outQuad(progress(rel, riseAt - 0.4, riseAt - 0.05));
    for (const q of PB.strings) {
      const [hx, hy] = hook(q, PB);
      strings.push([hx, hy, lerp(hx, J[q][0], down), lerp(hy, J[q][1], down), 2.5 * S.s * (1 - progress(rel, riseAt - 0.1, riseAt + 0.1))]);
    }
  }
  return { S, J, by, tilt, strings };
}

// ------------------------------------------------------------ the frog
// The troupe's compère: a wooden frog marionette in round glasses, sat on
// the corner of the riser with his legs over the edge. He swings a leg to
// every second, watches each puppet fall and get hauled up, and claps the
// bow on the hour.
const FROG = sprite(`
  .###.....###.
  #...#...#...#
  #...#####...#
  #...#...#...#
  .###.....###.
  .###########.
  #############
  ##.#######.##
  ###.......###
  .###########.
  ..#########..
`);
const FROG_X = 41, FROG_Y = RISER.y - 11, FROG_BAR = 13.5;

function drawFrog(g, sch, T, sec, ox, oy) {
  const sway = Math.sin((TAU * T) / 4.6 + 0.7) * 1.2;
  const x = Math.round(FROG_X + sway + ox), y = FROG_Y + oy;
  const lip = RISER.y + oy;
  const rel = sch.rel;
  const minuteTurn = rel !== null && (sch.hour || sch.A[2] !== sch.B[2] || sch.A[3] !== sch.B[3]);
  const bow = sch.hour && rel !== null ? progress(rel, HOUR_BOW - 0.2, HOUR_END) : 0;
  const clapping = bow > 0 && bow < 1;
  // A little hop in his seat when he claps.
  const bob = Math.sin(Math.PI * clamp((sec % 1) / 0.55, 0, 1)) > 0.5 ? -1 : 0;
  const seat = clapping ? -Math.abs(Math.sin(rel * TAU * 2)) * 1.5 : bob;
  const yy = Math.round(y + seat);

  // Gaze: ahead; across at the minutes now and then; down at a falling
  // puppet, up at one being hauled.
  let gx = 0, gy = 0;
  if (minuteTurn) {
    gx = 1;
    gy = rel < (sch.hour ? 1 : 0) ? 1 : -1;
  } else if (Math.floor(T / 7) % 3 === 1 && (T % 7) < 2.2) gx = 1;
  else if (Math.floor(T / 7) % 3 === 2 && (T % 7) < 1.6) gx = -1;
  const blink = (T % 4.3) < 0.13;

  // Strings and bar.
  const bx = FROG_X + 6.5 + sway * 1.4 + ox, by = FROG_BAR + oy;
  g.line(Math.round(bx - 4), Math.round(by), x + 2, yy, ON);
  g.line(Math.round(bx + 4), Math.round(by), x + 10, yy, ON);
  g.thickLine(bx - 5, by, bx + 5, by, 1.6, ON);
  g.thickLine(bx, by, bx + 2 * Math.sin(sway * 0.03), -4, 1.6, ON);

  // Legs: wooden dowels over the edge, one kicking on each second.
  const tau = sec % 1;
  for (const [k, hip] of [[0, 4], [1, 8]]) {
    const kick = Math.floor(sec) % 2 === k ? Math.sin(Math.PI * clamp(tau / 0.55, 0, 1)) : 0;
    const out = k ? 1 : -1;
    const hx = x + hip + 0.5, hy = lip + 0.5;
    const kx = hx + out * (0.5 + kick), ky = hy + 4 - kick * 1.2;
    const fx = hx + out * (0.5 + 2 * kick), fy = hy + 8 - kick * 3.5;
    g.thickLine(hx, hy, kx, ky, 1.7, ON);
    g.thickLine(kx, ky, fx, fy, 1.7, ON);
    g.thickLine(fx - 1.5 + out, fy + 0.6, fx + 1.5 + out, fy + 0.6, 1.6, ON);
  }

  g.blit(FROG, x, yy, { opaque: true });
  for (const ex of [2, 10]) {
    if (blink) g.hline(x + ex - 1, yy + 2, 3, ON);
    else g.pixel(x + ex + gx, yy + 2 + gy, ON);
  }
  // Arms: hands on the lip beside him, or clapping over his head.
  const clap = clapping ? (Math.sin(rel * TAU * 3) + 1) / 2 : 0;
  for (const side of [-1, 1]) {
    const sx = x + 6.5 + side * 6, sy = yy + 7;
    const [hx, hy] = clapping ? [x + 6.5 + side * (1 + 3 * clap), yy - 3] : [x + 6.5 + side * 8.5, lip - 0.5];
    const ex = clapping ? sx + side * 2.5 : sx + side * 1.5, ey = clapping ? yy + 2 : sy + 1;
    g.thickLine(sx, sy, ex, ey, 1.5, ON);
    g.thickLine(ex, ey, hx, hy, 1.5, ON);
    g.fillCircle(hx, hy, 1.1, ON);
  }
}

// ------------------------------------------------------------ scenery

function drawBar(g, { S, by, tilt }) {
  const half = S.half, w = S.s > 0.8 ? 2.2 : 1.8;
  const c = Math.cos(tilt), s = Math.sin(tilt);
  g.thickLine(S.cx - half * c, by - half * s, S.cx + half * c, by + half * s, w, ON);
  // The handle, up into the dark where the hand is.
  g.thickLine(S.cx, by, S.cx + 4 * s, -4, w, ON);
  // The cross-piece, end on: a knob.
  g.fillCircle(S.cx, by, w * 0.95, ON);
}

function drawShadow(g, { S, J }) {
  let lo = Infinity, hi = -Infinity, bottom = -Infinity;
  for (const [x, y] of J) { lo = Math.min(lo, x); hi = Math.max(hi, x); bottom = Math.max(bottom, y); }
  const gap = S.floor - bottom;
  const y = Math.round(S.floor + S.rod / 2 + 0.9);
  const cx = (lo + hi) / 2, half = ((hi - lo) / 2) * (0.85 - clamp(gap / 40, 0, 0.55));
  for (let x = Math.ceil(cx - half); x <= cx + half; x++) if ((x + y) % 2 === 0) g.pixel(x, y, ON);
}

/** Swagged pelmet across the top: it hides the hand. */
function drawPelmet(g, ox, oy) {
  const dy = Math.max(0, oy + 1);
  for (let x = 0; x < 128; x++) {
    const u = (((x - ox - 4) % 30) + 30) % 30 / 30;
    const e = 1 + dy + Math.round(3.2 * Math.sin(Math.PI * u));
    for (let y = 0; y < e; y++) g.pixel(x, y, OFF);
    g.pixel(x, e, ON);
    if (u < 0.04) { g.pixel(x, e + 1, ON); g.pixel(x, e + 2, ON); }
  }
}

/** The proscenium's side legs, gathered at a tie-back, stirring in a draught. */
function drawDrapes(g, ox, oy, T) {
  const tie = 36 + oy;
  for (const side of [0, 1]) {
    const X = (x) => (side ? 127 - x : x) + ox;
    const stir = 0.9 * Math.sin((TAU * T) / 11 + side * 2);
    for (let y = 4; y < 64; y++) {
      const u = y < tie ? (y - 4) / (tie - 4) : 1 - (y - tie) / (63 - tie);
      const w = 2.5 + 4.5 * (1 - Math.sin((Math.PI / 2) * u)) + stir * (1 - u);
      for (let x = 0; x < w; x++) g.pixel(X(x), y, OFF);
      g.pixel(X(Math.round(w)), y, ON);
    }
    g.fillCircle(X(3) + 0.5, tie + 0.5, 1.4, ON);
  }
}

function drawFloor(g, ox, oy) {
  const y = 62 + oy;
  for (let x = 6; x < 122; x += 2) g.pixel(x + ox, y, ON);
  // The riser: its lip, and the corner of its face going down to the boards.
  for (let x = RISER.x0; x <= RISER.x1; x += 2) g.pixel(x + ox, RISER.y + oy, ON);
  // its front corner, fading down into the dark
  for (let y = RISER.y + 2; y < 52; y += 2 + Math.floor((y - RISER.y) / 4)) g.pixel(RISER.x1 + ox, y + oy, ON);
}

/** The house curtain, `c` 0 open .. 1 closed, folds travelling with its edge. */
function drawCurtain(g, c) {
  if (c <= 0) return;
  const reach = 64 * c;
  for (const side of [-1, 1]) {
    const edge = side < 0 ? reach : 128 - reach;
    const x0 = side < 0 ? 0 : Math.floor(edge), x1 = side < 0 ? Math.ceil(edge) : 128;
    for (let y = 3; y < 64; y++) for (let x = x0; x < x1; x++) g.pixel(x, y, OFF);
    // Folds: hanging straight, drawn in at the top, swinging out at the hem
    // with the speed of the pull.
    const swing = Math.sin(Math.PI * c) * 2.5;
    for (let k = 0; k < 14; k++) {
      const base = edge + side * (1.5 + k * 5);
      if (side < 0 ? base < -2 : base > 130) break;
      for (let y = 4; y < 61; y++) {
        const u = (y - 4) / 57;
        const x = base - side * swing * u * u + 1.1 * Math.sin(u * 5 + k * 1.9);
        if (side < 0 ? x < edge - 0.5 : x > edge + 0.5) g.pixel(Math.floor(x), y, ON);
      }
      // the hem, scalloped between folds
      for (let t = 0; t < 5; t++) {
        const hx = base + side * t;
        g.pixel(Math.floor(hx - side * swing), 60 + Math.round(Math.sin((Math.PI * t) / 5) * 1.5), ON);
      }
    }
    g.thickLine(edge - side * 0.9, 3, edge - side * 0.9 - side * swing, 61, 1.8, ON);
  }
}

function curtainAt(sch) {
  if (!sch.hour || sch.rel === null) return 0;
  const r = sch.rel;
  if (r < 1.4) return ease.inOutCubic(progress(r, -0.25, 0.8));
  return 1 - ease.inOutCubic(progress(r, 1.4, 2.45));
}

export default {
  name: 'Marionette',
  blurb: 'The time is a troupe of wooden marionettes: each minute the hand lets the old numeral slump into a heap of sticks and hauls the next one up out of it; on the hour the curtain falls and the troupe takes a bow.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  driver: 'full',

  frame(g, { fields: f, date, oled, night }) {
    oled.contrast(lerp(0xcf, 0x0a, night));
    const [ox, oy] = orbit(date, 2, 3);
    const T = date.getTime() / 1000;
    const sch = schedule(date, f);
    const shift = (p) => ({ ...p, J: p.J.map(([x, y]) => [x + ox, y + oy]), by: p.by + oy,
      S: { ...p.S, cx: p.S.cx + ox, floor: p.S.floor + oy },
      strings: p.strings.map(([a, b, c, d, e]) => [a + ox, b + oy, c + ox, d + oy, e]) });
    const troupe = [0, 1, 2, 3].map((i) => shift(puppet(i, sch, T, f.sec)));

    drawFloor(g, ox, oy);
    for (const p of troupe) {
      drawShadow(g, p);
      for (const [hx, hy, jx, jy, sag] of p.strings) drawString(g, hx, hy, jx, jy, sag);
      drawChain(g, p.J, p.S.rod, p.S.s > 0.8);
      drawBar(g, p);
    }
    drawFrog(g, sch, T, f.sec, ox, oy);
    drawDrapes(g, ox, oy, T);
    drawCurtain(g, curtainAt(sch));
    drawPelmet(g, ox, oy);
  },
};
