// Racetrack: a slot-car table seen from above, and the time is the track.
//
// Each numeral is a real slot-car layout (racetrack-tracks.js): straights and
// constant-radius curve pieces, grey asphalt with two slots and their braid,
// white edge lines on the straights, red/white kerbs on every curve, joint
// lines between pieces and the raised plastic's shadow on the grass. Italic,
// like a number painted on a race car. Every numeral is a closed circuit:
// a car runs up one side of a stroke, round a hairpin at its end, back down
// the other, through the crossover of the 4 and the 8.
//
// Always alive: one car per numeral (red, yellow, blue, white) laps its own
// circuit at 60 fps from a real speed profile: flat out on the straights,
// braking for the hairpins, drifting through the corners with the nose
// tucked in and tyre smoke where it slides. Now and then a car deslots: it
// flies off a corner and spins to a stop on the grass, and a giant hand
// (in a marshal's orange sleeve) reaches in from the nearer edge, picks it
// up and puts it back in the slot. The lap counter on the pit wall counts
// the leader's laps this hour, in the leader's colour; the crowd in the
// stand fidgets.
//
// Minute turn: the marshal shows a yellow flag, the car on each numeral
// that will change dives into the pit lane and its crew come out of the
// garage. A hand comes down, pinches the top of the old layout and lifts it
// off the board (it grows as it comes up towards the eye, sways, its shadow
// falls away) and carries it off; it is gone before :00. After :00 a hand
// lowers the new layout in, it clicks home, a spark of current runs once
// round the new lane, green flag, and the car leaves the pit and rejoins.
//
// Hour: the race of the hour ends. Chequered flag, the crowd on its feet,
// and all four cars leave their numerals to race a figure-eight across the
// whole board, laying a giant figure-eight of rubber over the time, while
// hands swap the numerals; at :00 confetti flies from the stand, the lap
// counter resets, and the cars peel off into their new circuits. The marks
// fade over the first minute.
//
// Never a wrong digit: every old layout is off the glass before :00, every
// new one arrives after it; at midnight the blank is about 0.6 s.
//
// Palette: a toy circuit in daylight: two mown greens (quiet, so the track
// reads), mid-grey asphalt, white and race red for lines and kerbs, and four
// saturated team colours for the cars, garages and the counter; amber LCD
// for the lap count. The light follows the day: a warm low sun before
// dusk, then floodlights: the field goes deep blue-green with warm pools,
// the track stays floodlit, headlight beams come on, camera flashes in the
// stand. Backlight dims with ctx.night.
//
// Hard pixels for the board, the stand and the counter; anti-aliasing for
// everything that moves (cars, hands, smoke, rubber) and for the track's
// curves (baked into the sprites).
//
// Cost: outside the estimate, two extra canvases: the lit board (grass,
// pit, stand) once a minute, roughly 6 ms on the esp32c3; and the board plus
// the resting layouts, re-composed when a layout starts or stops moving
// (three times a minute, roughly 2.5 ms). Both are known seconds ahead, so
// the device can build them in slices over earlier frames. Each frame draws
// that background, the moving layouts, four cars, smoke and the hands.
import { Gfx, R, G, B, from565, sin, cos, clamp, rand, ease, progress, lerp, clockFields } from '../js/kit.js';
import { buildSprite, lanes, lapTable, T, DT } from './racetrack-tracks.js';
import { W, H, PIT_Y, buildLight, LIGHT, lit, paintBoard, lightCanvas, drawCrowd, drawCar, drawHand, drawMarshal, mulTint, drawLapCounter, drawCrew } from './racetrack-art.js';

// ------------------------------------------------------------ layout
const SLOTS = [
  { x: 3, y: 3, w: 30, h: 62, digits: 3 },
  { x: 40, y: 3, w: 30, h: 62, digits: 10 },
  { x: 88, y: 21, w: 24, h: 44, digits: 6 },
  { x: 117, y: 21, w: 24, h: 44, digits: 10 },
];
const BOX_X = SLOTS.map((S) => S.x + S.w / 2 + 2);
const MARSHAL = [82, 6];

// ------------------------------------------------------------ timeline (seconds into the minute)
const EXIT0 = 51;                                 // a car whose numeral will change heads for the pit after this
const PIT_D = 0.9, OUT_D = 1.0, RAMP = 1.2, R0 = 0.5;
const REJOIN = [0, 0, 2.6, 2.3];                  // pit-out start, minute turns
const HAND_IN = 56.3, GRIP = 57.2, LIFT0 = 57.5, GONE = 59.93;
const PLACE0 = 0.01, PLACE1 = 1.4, LET_GO = 1.5, HAND_OUT = 1.75;
const STAGGER = 0.3;
const SHOW_T = (i) => 50.2 + 0.45 * i;           // minute 59: each car leaves its numeral for the figure-eight
const SHOW_IN = 1.1, SHOW_OUT = 1.2;
const HR = (i) => 3.0 + 0.5 * i;                  // minute 0: each car leaves the figure-eight for its new numeral
const DS_D = 3.3;                                 // a deslot, from flying off to racing again

// ------------------------------------------------------------ tracks (flash tables, built at load)
const SPR = SLOTS.map((S, i) => Array.from({ length: S.digits }, (_, d) => {
  const s = buildSprite(d, S.x, S.y, S.w, S.h);
  s.lanes = lanes(s.pieces, { x: s.x, y: s.y, w: s.w, h: s.h });
  const L = (s.lap = lapTable(s.lanes[0]));
  const bottom = S.y + S.h - 3;
  const pick = (tx, ty) => {
    let best = 1e9, bq = 0;
    for (let q = 0; q < L.n; q++) {
      const left = Math.cos(L.HD[q]) < -0.5 ? 0 : 400;
      const c = (L.X[q] - tx) ** 2 + (L.Y[q] - ty) ** 2 + left;
      if (c < best) { best = c; bq = q; }
    }
    return bq;
  };
  s.exitQ = pick(BOX_X[i] + 14, bottom);
  s.entryQ = pick(BOX_X[i] - 12, bottom);
  s.hot = [];
  for (let q = 0; q < L.n; q++) if (Math.abs(L.BE[q]) > 0.4 && L.SP[q] > 45 && Math.abs(L.BE[(q + 1) % L.n]) <= Math.abs(L.BE[q])) s.hot.push(q);
  // the grip: the top of the highest piece
  let gy = 1e9, gx = 0;
  for (const p of s.pieces) for (const [x, y] of [[p.ax, p.ay], [p.bx, p.by]]) if (y < gy - 0.01) { gy = y; gx = x; }
  s.grip = [gx, gy];
  return s;
}));

// ------------------------------------------------------------ the race
const ANG = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

/** Sample a lap table at table time ph (s): fills P. */
function sample(L, ph, P) {
  let f = (ph / DT) % L.n; if (f < 0) f += L.n;
  const q = f | 0, u = f - q, q1 = (q + 1) % L.n;
  P.x = L.X[q] + (L.X[q1] - L.X[q]) * u;
  P.y = L.Y[q] + (L.Y[q1] - L.Y[q]) * u;
  P.hd = L.HD[q] + ANG(L.HD[q1] - L.HD[q]) * u;
  P.be = L.BE[q] + (L.BE[q1] - L.BE[q]) * u;
  P.sp = L.SP[q] + (L.SP[q1] - L.SP[q]) * u;
  P.brake = L.SP[(q + 8) % L.n] < P.sp - 4 ? 1 : 0;
  return P;
}

/** Table time and speed ratio on a stint segment at time t. */
function segPhase(seg, t) {
  const tau = t - seg.ts;
  if (tau < RAMP) return [seg.ph + seg.r0 * tau + (1 - seg.r0) * tau * tau / (2 * RAMP), seg.r0 + (1 - seg.r0) * tau / RAMP];
  return [seg.ph + tau - (1 - seg.r0) * RAMP / 2, 1];
}

/** Table time of the next pass of sample q at or after table time ph. */
function nextPass(L, ph, q) {
  const lap = L.n * DT, t = q * DT;
  let k = Math.floor((ph - t) / lap) + 1;
  if (t + (k - 1) * lap >= ph) k--;
  return t + k * lap;
}

/** Cubic Hermite between two states over D seconds: fills P with position, heading and speed. */
function hermite(a, b, D, u, P) {
  const p1x = a.x + a.vx * D / 3, p1y = a.y + a.vy * D / 3, p2x = b.x - b.vx * D / 3, p2y = b.y - b.vy * D / 3;
  const v = 1 - u;
  P.x = v * v * v * a.x + 3 * v * v * u * p1x + 3 * v * u * u * p2x + u * u * u * b.x;
  P.y = v * v * v * a.y + 3 * v * v * u * p1y + 3 * v * u * u * p2y + u * u * u * b.y;
  const dx = 3 * v * v * (p1x - a.x) + 6 * v * u * (p2x - p1x) + 3 * u * u * (b.x - p2x);
  const dy = 3 * v * v * (p1y - a.y) + 6 * v * u * (p2y - p1y) + 3 * u * u * (b.y - p2y);
  const sp = Math.sqrt(dx * dx + dy * dy) / D;
  P.hd = sp > 2 ? Math.atan2(dy, dx) : (u < 0.5 ? Math.atan2(a.vy, a.vx) : Math.atan2(b.vy, b.vx));
  P.sp = sp;
  return P;
}
const state = (x, y, hd, sp) => ({ x, y, vx: Math.cos(hd) * sp, vy: Math.sin(hd) * sp });

// the figure-eight of the hour show, across the whole board
const F8 = { cx: 80, cy: 37, a: 64, b: 25, w: 1.55 };
function fig8(i, t, P) {
  const th = F8.w * t + i * 0.62;
  const s1 = sin(th), c1 = cos(th), s2 = sin(2 * th), c2 = cos(2 * th);
  P.x = F8.cx + F8.a * s1; P.y = F8.cy + F8.b * s2;
  const dx = F8.a * c1 * F8.w, dy = 2 * F8.b * c2 * F8.w, ddx = -F8.a * s1 * F8.w * F8.w, ddy = -4 * F8.b * s2 * F8.w * F8.w;
  const sp = Math.sqrt(dx * dx + dy * dy);
  P.hd = Math.atan2(dy, dx); P.sp = sp;
  const k = (dx * ddy - dy * ddx) / (sp * sp * sp);
  P.be = clamp(k * sp * sp / 520 * 0.62, -0.7, 0.7);
  return P;
}


// ------------------------------------------------------------ the hour show: rubber and confetti
const F8N = 84, F8X = new Float32Array(F8N * 2), F8Y = new Float32Array(F8N * 2);
for (let j = 0; j < F8N; j++) {
  const th = (j / F8N) * 2 * Math.PI, P = fig8(0, th / F8.w, {});
  const nx = -Math.sin(P.hd), ny = Math.cos(P.hd);
  F8X[j * 2] = P.x + nx * 1.4; F8Y[j * 2] = P.y + ny * 1.4;
  F8X[j * 2 + 1] = P.x - nx * 1.4; F8Y[j * 2 + 1] = P.y - ny * 1.4;
}
const TAU = 2 * Math.PI;
/** Tyre marks of the figure-eight, laid where the cars have run since they joined it; they fade over minute 0. */
function drawRubber(g, t, C) {
  const Hs = C.m === 59 ? C.Ms + 60 : C.Ms - C.m * 60;
  if (C.m === 59 && C.sec < SHOW_T(0) + SHOW_IN) return;
  if (C.m !== 59 && (C.m !== 0 || C.sec > 45)) return;
  const fade = 1 - progress(t - Hs, 8, 45);
  const cov = [];
  for (let i = 0; i < 4; i++) {
    const tj = Hs - 60 + SHOW_T(i) + SHOW_IN, tl = Hs + HR(i);
    const th0 = F8.w * (tj - Hs) + i * 0.62, th1 = F8.w * (Math.min(t, tl) - Hs) + i * 0.62;
    cov.push(th0, th1 - th0);
  }
  for (let j = 0; j < F8N; j++) {
    const th = (j / F8N) * TAU;
    let on = false;
    for (let i = 0; i < 4 && !on; i++) {
      const run = cov[i * 2 + 1];
      if (run <= 0) continue;
      let d = (th - cov[i * 2]) % TAU; if (d < 0) d += TAU;
      if (run >= TAU || d <= run) on = true;
    }
    if (!on) continue;
    const k = (j + 1) % F8N;
    for (let w = 0; w < 2; w++)
      g.thickLine(F8X[j * 2 + w], F8Y[j * 2 + w], F8X[k * 2 + w], F8Y[k * 2 + w], 0.9, 0x141416, { aa: true, a: 0.34 * fade });
  }
}

const CONF = ['ff3a3a', 'ffd21a', '3a8aff', 'f6f6f6', '3ad06a', 'ff7ad0'].map((h) => parseInt(h, 16));
/** Confetti thrown from the stand at the hour: flutters down onto the board and lies there, then fades. */
function drawConfetti(g, C, tint) {
  if (C.m !== 0 || C.sec > 14) return;
  const fade = 1 - progress(C.sec, 9, 14);
  for (let n = 0; n < 80; n++) {
    const r1 = rand(n, 1, 5), r2 = rand(n, 2, 5), r3 = rand(n, 3, 5);
    const tau = C.sec - r1 * 0.8;
    if (tau <= 0) continue;
    const land = 1.4 + r2 * 1.4, tt = Math.min(tau, land);
    const ox = 92 + r3 * 64, oy = 9;
    const vx = (rand(n, 4, 5) - 0.62) * 95, vy = 25 + rand(n, 5, 5) * 75, k = 1.3;
    const e = (1 - Math.exp(-k * tt)) / k;
    const air = tau < land;
    const x = ox + vx * e + (air ? 2.2 * sin(tau * 7 + n) : 0), y = oy + vy * e + 6 * tt * tt * 0.5;
    const flip = air ? sin(tau * (11 + n % 5) + n) : 0.6;
    const c = CONF[n % 6], col = flip > 0 ? c : mulTint(c, 0x8c8c8c);
    if (x < 0 || x >= 160 || y < 0 || y >= 80) continue;
    g.fillRect(x | 0, y | 0, Math.abs(flip) > 0.4 ? 2 : 1, 1, mulTint(col, tint), { a: fade });
  }
}

const DIG = (date) => { const f = clockFields(date); return f.hh + f.mm; };

/**
 * Where car i is at absolute time t (s): { x, y, yaw, lift, brake, smoke, hand }.
 * Closed form from the start of its stint (the last turn that changed its
 * numeral, or the hour), replaying only this stint's deslots.
 */
function carPose(i, t, C) {
  const P = { x: 0, y: 0, hd: 0, be: 0, sp: 0, brake: 0, lift: 0, hand: null, mode: 'race', laps: 0, crew: 0, trail: null };
  const sec = C.sec, Ms = C.Ms, m = C.m;
  const startMin = i === 3 ? Ms : i === 2 ? Ms - (m % 10) * 60 : Ms - m * 60;
  const hourStint = startMin === Ms - m * 60;
  const s = SPR[i][+C.cur[i]], L = s.lap;
  const entry = sample(L, s.entryQ * DT, {});
  const entryState = state(entry.x, entry.y, entry.hd, entry.sp * R0);
  const box = state(BOX_X[i], PIT_Y, Math.PI, 6);
  let seg;
  if (hourStint) {
    const t0 = startMin + HR(i);
    if (t < t0) { fig8(i, t - startMin, P); P.mode = 'show'; return P; }
    if (t < t0 + SHOW_OUT) {
      const a = fig8(i, t0 - startMin, {});
      hermite(state(a.x, a.y, a.hd, a.sp), entryState, SHOW_OUT, (t - t0) / SHOW_OUT, P);
      P.be = 0; P.mode = 'show'; return P;
    }
    seg = { ts: t0 + SHOW_OUT, ph: s.entryQ * DT, r0: R0 };
  } else {
    const t0 = startMin + REJOIN[i];
    if (t < t0) { P.x = box.x; P.y = box.y; P.hd = Math.PI; P.mode = 'box'; P.crew = clamp((t0 - t) / 0.45, 0, 1); return P; }
    if (t < t0 + OUT_D) { hermite(box, entryState, OUT_D, ease.inQuad((t - t0) / OUT_D) * 0.4 + 0.6 * (t - t0) / OUT_D, P); P.mode = 'pit'; return P; }
    seg = { ts: t0 + OUT_D, ph: s.entryQ * DT, r0: R0 };
  }
  // deslots during this stint, in order
  for (let mk = Math.round(startMin / 60); mk * 60 <= Ms; mk++) {
    if (rand(mk, i, 77) > 0.16) continue;
    const tn = mk * 60 + 12 + rand(mk, i, 78) * 28;
    if (tn > t) break;
    if (tn < seg.ts + RAMP + 0.5 || s.hot.length === 0) continue;
    const [phn] = segPhase(seg, tn);
    let ph = 1e9;
    for (const q of s.hot) { const p = nextPass(L, phn, q); if (p < ph) ph = p; }
    const td = tn + (ph - phn);
    if (t < td) break;
    if (t < td + DS_D) return deslot(i, L, ph, t - td, P, mk);
    seg = { ts: td + DS_D, ph, r0: 0 };
  }
  // the end of the minute: pit, or the show
  const changes = C.cur[i] !== C.nxt[i];
  if (m === 59) {
    const t0 = Ms + SHOW_T(i);
    if (t >= t0) {
      const [ph, rr] = segPhase(seg, t0);
      const a = sample(L, ph, {});
      P.laps = Math.floor((ph - s.entryQ * DT) / (L.n * DT));
      const tShow = t0 + SHOW_IN;
      const b = fig8(i, tShow - (Ms + 60), {});
      if (t < tShow) {
        hermite(state(a.x, a.y, a.hd, a.sp * rr), state(b.x, b.y, b.hd, b.sp), SHOW_IN, (t - t0) / SHOW_IN, P);
        P.be = a.be * (1 - (t - t0) / SHOW_IN); P.mode = 'show'; return P;
      }
      fig8(i, t - (Ms + 60), P); P.mode = 'show'; return P;
    }
  } else if (changes) {
    const [ph51] = segPhase(seg, Ms + EXIT0);
    const phx = nextPass(L, ph51, s.exitQ);
    const te = Ms + EXIT0 + (phx - ph51);
    if (t >= te) {
      const a = sample(L, phx, {});
      if (t < te + PIT_D) {
        const u = (t - te) / PIT_D;
        hermite(state(a.x, a.y, a.hd, a.sp), box, PIT_D, u, P);
        P.be = a.be * (1 - u); P.brake = 1; P.mode = 'pit'; return P;
      }
      P.x = box.x; P.y = box.y; P.hd = Math.PI; P.mode = 'box'; P.crew = clamp((t - te - PIT_D) / 0.45, 0, 1); return P;
    }
  }
  const [ph, rr] = segPhase(seg, t);
  sample(L, ph, P);
  P.be *= rr * rr; P.sp *= rr;
  if (rr < 1) P.brake = 0;
  P.laps = Math.floor((ph - s.entryQ * DT) / (L.n * DT));
  // tyre smoke where it has been drifting hard
  for (let k = 1; k <= 4; k++) {
    const q = (((ph - k * 0.07) / DT) % L.n + L.n) % L.n | 0;
    const b = Math.abs(L.BE[q]) * rr;
    if (b > 0.36) (P.trail ??= []).push(L.X[q], L.Y[q], 0.9 + k * 0.55, (b - 0.36) * 1.3 * (1 - k / 5.5));
  }
  return P;
}

/** A deslot: the car flies off at a corner, spins to a stop, a hand puts it back. */
function deslot(i, L, ph, u, P, mk) {
  const a = sample(L, ph, {});
  const v0 = a.sp, ts = 0.55;
  let dist = v0 * ts / 2;
  const ex = a.x + Math.cos(a.hd) * dist, ey = a.y + Math.sin(a.hd) * dist;
  // keep the stop on the board
  let k = 1;
  if (ex < 5) k = Math.min(k, (a.x - 5) / (a.x - ex)); if (ex > 155) k = Math.min(k, (155 - a.x) / (ex - a.x));
  if (ey < 5) k = Math.min(k, (a.y - 5) / (a.y - ey)); if (ey > 63) k = Math.min(k, (63 - a.y) / (ey - a.y));
  dist *= clamp(k, 0.15, 1);
  const spin = (a.be >= 0 ? 1 : -1) * (2.2 + rand(mk, i, 79) * 1.6);
  const yaw0 = a.hd + a.be;
  const sx = a.x + Math.cos(a.hd) * dist, sy = a.y + Math.sin(a.hd) * dist, syaw = yaw0 + spin;
  P.mode = 'deslot';
  if (u < ts) {
    const w = u / ts, e = 1 - (1 - w) * (1 - w);
    P.x = a.x + Math.cos(a.hd) * dist * e; P.y = a.y + Math.sin(a.hd) * dist * e;
    P.hd = yaw0 + spin * e; P.be = 0; P.brake = 1;
    P.trail = [];
    for (let k = 1; k <= 4; k++) { const e2 = Math.max(0, e - k * 0.12); P.trail.push(a.x + Math.cos(a.hd) * dist * e2, a.y + Math.sin(a.hd) * dist * e2, 1 + k * 0.6, 0.4 * (1 - w) * (1 - k / 5)); }
    return P;
  }
  // the hand: down to the car, pinch, carry it back to the slot, let go, away
  const H_IN = 1.0, PICK = 1.55, CARRY = 1.7, PUT = 2.55, AWAY = 2.75;
  // the arm reaches in from the nearer long edge, leaning out to the nearer side
  const side = sx < 80 ? 1 : -1;
  const dir = sy > 34 ? Math.PI / 2 + 0.35 * side : -Math.PI / 2 - 0.35 * side;
  const dvx = Math.cos(dir), dvy = Math.sin(dir);
  let away = 0, open = 1, hl = 0, cx = sx, cy = sy, cyaw = syaw, lift = 0;
  if (u < PICK) away = 1 - ease.outCubic(clamp((u - H_IN) / (PICK - H_IN), 0, 1));
  else if (u < CARRY) open = 1 - (u - PICK) / (CARRY - PICK);
  else if (u < PUT) {
    const w = ease.inOutQuad((u - CARRY) / (PUT - CARRY));
    open = 0; cx = lerp(sx, a.x, w); cy = lerp(sy, a.y, w); cyaw = syaw + ANG(a.hd - syaw) * w;
    lift = Math.sin(Math.PI * w); hl = lift;
  } else if (u < AWAY) { cx = a.x; cy = a.y; cyaw = a.hd; open = (u - PUT) / (AWAY - PUT); }
  else { cx = a.x; cy = a.y; cyaw = a.hd; open = 1; away = ease.inQuad((u - AWAY) / (DS_D - AWAY + 0.4)); }
  P.x = cx; P.y = cy; P.hd = cyaw; P.be = 0; P.lift = lift;
  if (u >= H_IN) P.hand = { x: cx + dvx * away * 75, y: cy + dvy * away * 75, open, lift: hl, s: 1 + hl * 0.3, dir };
  return P;
}

// ------------------------------------------------------------ numerals in the air
/** Lift state of slot i at second sec, for its old or new numeral: null when it rests on the board. */
function assembly(i, C) {
  const order = C.changeOrder[i];
  if (order < 0) return null;
  const sh = order * STAGGER;
  const sec = C.sec;
  if (C.leaving[i] && sec > 50) {
    const s = SPR[i][+C.cur[i]], [gx, gy] = s.grip;
    const top = -(s.y + s.h - gy) * 1.3 - gy - 6;
    const hin = progress(sec, HAND_IN - sh, GRIP - sh), close = progress(sec, GRIP - sh, LIFT0 - sh);
    const up = ease.outQuad(progress(sec, LIFT0 - sh, LIFT0 - sh + 0.7));
    const carry = ease.inQuad(progress(sec, LIFT0 - sh + 0.4, GONE - sh * 0.15));
    return {
      s, gx, gy, dx: carry * 5, dy: carry * top, sc: 1 + 0.22 * up, rot: 0.07 * up * sin(sec * 3.1 + i),
      up, hand: hin > 0 ? { open: 1 - close, approach: 1 - ease.outCubic(hin) } : null,
    };
  }
  if (C.arriving[i] && sec < 5) {
    const s = SPR[i][+C.cur[i]], [gx, gy] = s.grip;
    const top = -(s.y + s.h - gy) * 1.3 - gy - 6;
    const inn = ease.outCubic(progress(sec, PLACE0 + sh * 0.15, PLACE1 + sh - 0.35));
    const up = 1 - ease.inOutQuad(progress(sec, PLACE1 + sh - 0.45, PLACE1 + sh));
    const click = progress(sec, PLACE1 + sh, PLACE1 + sh + 0.25);
    const bounce = click > 0 && click < 1 ? 0.025 * sin(Math.PI * click) : 0;
    const open = progress(sec, LET_GO + sh, HAND_OUT + sh);
    const away = ease.inQuad(progress(sec, HAND_OUT + sh, HAND_OUT + sh + 0.9));
    if (sec < PLACE0 + sh * 0.15) return { s, hidden: true };
    return {
      s, gx, gy, dx: (1 - inn) * -5, dy: (1 - inn) * top, sc: 1 + 0.22 * up - bounce, rot: 0.07 * up * sin(sec * 3.1 + i),
      up, click, spark: progress(sec, PLACE1 + sh + 0.1, PLACE1 + sh + 1.0) * (sec < PLACE1 + sh + 0.1 ? 0 : 1) - (sec < PLACE1 + sh + 0.1 ? 1 : 0),
      hand: away < 1 ? { open, approach: away } : null,
    };
  }
  return null;
}

/** Draw a numeral's track, scaled and turned about its grip, lifted by `up`. */
function drawAssembly(g, A) {
  const s = A.s, cs = Math.cos(A.rot), sn = Math.sin(A.rot), inv = 1 / A.sc;
  const ox = A.gx + A.dx, oy = A.gy + A.dy;
  const sox = 1.2 + A.up * 5, soy = 1.6 + A.up * 6;
  // bounding box of the transformed sprite
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [cx, cy] of [[s.x, s.y], [s.x + s.w, s.y], [s.x, s.y + s.h], [s.x + s.w, s.y + s.h]]) {
    const qx = (cx - A.gx) * A.sc, qy = (cy - A.gy) * A.sc;
    const X = ox + cs * qx - sn * qy, Y = oy + sn * qx + cs * qy;
    x0 = Math.min(x0, X); y0 = Math.min(y0, Y); x1 = Math.max(x1, X); y1 = Math.max(y1, Y);
  }
  const buf = g.buf;
  const X0 = Math.max(0, Math.floor(x0)), X1 = Math.min(W, Math.ceil(x1 + sox)), Y0 = Math.max(0, Math.floor(y0)), Y1 = Math.min(H, Math.ceil(y1 + soy));
  const sa = 0.3 + 0.0 * A.up;
  for (let pass = 0; pass < 2; pass++) {
    const offx = pass === 0 ? sox : 0, offy = pass === 0 ? soy : 0;
    for (let y = Y0; y < Y1; y++)
      for (let x = X0; x < X1; x++) {
        g.cost.box += 4;
        const qx = x + 0.5 - offx - ox, qy = y + 0.5 - offy - oy;
        const px = A.gx + (cs * qx + sn * qy) * inv - s.x, py = A.gy + (-sn * qx + cs * qy) * inv - s.y;
        if (px < 0 || py < 0 || px >= s.w || py >= s.h) continue;
        const k = (py | 0) * s.w + (px | 0), ta = s.ta[k];
        if (!ta) continue;
        if (pass === 0) g.put(x, y, 0x000000, (ta / 255) * sa * (A.up > 0 ? 1 : 0) + (A.up > 0 ? 0 : 0));
        else g.put(x, y, mulTint(s.col[k], LIGHT.track), ta / 255);
      }
    if (pass === 0 && A.up <= 0) {
      // resting: the sprite's own baked shadow
      for (let y = Math.max(0, s.y); y < Math.min(H, s.y + s.h); y++)
        for (let x = Math.max(0, s.x); x < Math.min(W, s.x + s.w); x++) {
          const k = (y - s.y) * s.w + (x - s.x);
          if (s.sa[k] && !s.ta[k]) { g.cost.box++; g.put(x, y, 0x000000, s.sa[k] / 255); }
        }
    }
  }
}

// ------------------------------------------------------------ the background, once a minute
let BG = null, BOARD = null;
function background(C, mask, hour) {
  const key = C.mk * 16 + mask;
  if (BG && BG.key === key) return BG.c;
  if (!BOARD || BOARD.key !== C.mk) {
    // the lit board, once a minute
    buildLight(hour);
    const b = BOARD?.c ?? new Gfx(W, H);
    paintBoard(b);
    lightCanvas(b);
    BOARD = { key: C.mk, c: b };
  }
  const c = BG?.c ?? new Gfx(W, H);
  c.buf.set(BOARD.c.buf);
  const tl = LIGHT.track;
  for (let i = 0; i < 4; i++) if (mask & (1 << i)) {
    const s = SPR[i][+C.cur[i]];
    for (let j = 0; j < s.h; j++)
      for (let q = 0; q < s.w; q++) {
        const x = s.x + q, y = s.y + j, k = j * s.w + q;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        if (s.sa[k]) c.put(x, y, 0x000000, s.sa[k] / 255);
        if (s.ta[k]) c.put(x, y, mulTint(s.col[k], tl), s.ta[k] / 255);
      }
  }
  BG = { key, c };
  return c;
}

export default {
  name: 'Racetrack',
  blurb: 'Slot-car tracks shaped as the numerals; cars race them, a giant hand swaps the layouts each minute.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, ms = ctx.date.getTime(), t = ms / 1000;
    const sec = f.sec, Ms = t - sec;
    const cur = f.hh + f.mm, nxt = DIG(new Date(ms + 60000)), prv = DIG(new Date(ms - 60000));
    const leaving = [0, 1, 2, 3].map((i) => cur[i] !== nxt[i]), arriving = [0, 1, 2, 3].map((i) => cur[i] !== prv[i]);
    // the order hands work in, right to left
    const changeOrder = [-1, -1, -1, -1];
    const list = sec > 30 ? leaving : arriving;
    let n = 0; for (let i = 3; i >= 0; i--) if (list[i]) changeOrder[i] = n++;
    const C = { sec, Ms, m: f.m, mk: f.minuteKey, cur, nxt, prv, leaving, arriving, changeOrder };
    const hour = f.h + f.m / 60 + sec / 3600;
    ctx.lcd.backlight(1 - 0.6 * ctx.night);

    const A = [0, 1, 2, 3].map((i) => assembly(i, C));
    let mask = 0;
    for (let i = 0; i < 4; i++) if (!A[i] && !(leaving[i] && sec > 50) && !(arriving[i] && sec < 5)) mask |= 1 << i;
    g.draw(background(C, mask, hour), 0, 0);
    const tint0 = lit(0xffffff, 80, 40);

    // marshal
    let flag = null, wave = 0;
    if (f.m === 59 && sec > 47) { flag = 'chequered'; wave = 1; }
    else if (f.m === 0 && sec < 3.5) { flag = 'chequered'; wave = 1; }
    else if (f.m === 0 && sec < 7) { flag = 'green'; wave = 1; }
    else if (leaving.some(Boolean) && sec > 50.5) { flag = 'yellow'; wave = 1; }
    else if (arriving.some(Boolean) && sec < 4.5) { flag = sec < 2.2 ? 'yellow' : 'green'; wave = 1; }
    drawMarshal(g, MARSHAL[0], MARSHAL[1], flag, wave, t, tint0);
    drawCrowd(g, t, f.m === 0 && sec < 8 ? 1 : f.m === 59 && sec > 48 ? 0.6 : 0, LIGHT.flood);

    // numerals resting on the board but not in the background
    for (let i = 0; i < 4; i++) {
      if (mask & (1 << i)) continue;
      const a = A[i];
      if (a?.hidden) continue;
      if (!a || a.up <= 0) {
        const s = SPR[i][+cur[i]];
        drawAssembly(g, { s, gx: s.grip[0], gy: s.grip[1], dx: 0, dy: 0, sc: 1, rot: 0, up: 0 });
      }
    }
    drawRubber(g, t, C);
    // cars, their smoke, the pit crews, the lap counter
    const poses = [0, 1, 2, 3].map((i) => carPose(i, t, C));
    for (const p of poses) if (p.trail)
      for (let k = 0; k < p.trail.length; k += 4) g.fillCircle(p.trail[k], p.trail[k + 1], p.trail[k + 2], mulTint(0xd8d8d4, tint0), { aa: true, a: Math.min(0.5, p.trail[k + 3]) });
    for (let i = 2; i < 4; i++) drawCrew(g, BOX_X[i], i, poses[i].crew, t, tint0);
    drawLapCounter(g, Math.max(poses[0].laps, poses[1].laps), poses[0].laps >= poses[1].laps ? 0 : 1, tint0);
    for (let i = 0; i < 4; i++) {
      const p = poses[i];
      const tint = LIGHT.track;
      drawCar(g, p.x, p.y, p.hd + p.be, i, { lift: p.lift, lights: LIGHT.flood, brake: p.brake, tint });
    }
    // numerals in the air, and the hands
    for (let i = 0; i < 4; i++) {
      const a = A[i];
      if (!a || a.hidden) continue;
      if (a.up > 0) drawAssembly(g, a);
      if (a.click > 0 && a.click < 1) {
        // the click as the layout snaps home, and the current running round the new lane once
        g.ring(a.gx, a.gy, 1 + a.click * 9, 2 + a.click * 9, 0xffffff, { aa: true, a: 0.55 * (1 - a.click) });
      }
      if (a.spark >= 0 && a.spark < 1) {
        const L = a.s.lap, P = {};
        for (let k = 5; k >= 0; k--) {
          const u = a.spark - k * 0.012;
          if (u < 0) continue;
          sample(L, (a.s.entryQ * DT) + u * L.n * DT, P);
          g.fillCircle(P.x, P.y, k === 0 ? 1.3 : 1.0 - k * 0.12, k === 0 ? 0xfffbe0 : 0xffd24a, { aa: true, a: k === 0 ? 1 : 0.7 - k * 0.11 });
        }
        sample(L, (a.s.entryQ * DT) + a.spark * L.n * DT, P);
        g.fillCircle(P.x, P.y, 3.2, 0xffe080, { aa: true, a: 0.25 });
      }
      if (a.hand) {
        const hx = a.gx + a.dx, hy = a.gy + a.dy - a.hand.approach * 80;
        drawHand(g, hx, hy, { s: a.sc, open: a.hand.open, lift: a.up, tint: tint0 });
      }
    }
    drawConfetti(g, C, tint0);
    for (const p of poses) if (p.hand) drawHand(g, p.hand.x, p.hand.y, { s: p.hand.s, open: p.hand.open, lift: p.hand.lift, tint: tint0, dir: p.hand.dir });
  },
};
