// The spare band: a thin sky-blue band parked on two pegs in one of the two
// free corners of the board (under the hours, or over the minutes). At :30 a
// finger-less flick launches it: one end is drawn back (anticipation), let
// go, and it flies as a spinning loop up the channel past the colon to the
// other corner, where it snaps back onto two pegs. At the hour it is shot on
// a long ricochet tour round both corners, pinging off pegs on the way.
//
// Everything is closed form in the time since launch: a path of waypoints
// walked at a fixed speed (about 1.5 px a frame), the loop's spin a phase.

import { sin, cos } from '../js/kit.js';

const PX = (i) => 3.5 + 7 * i, PY = (j) => 5.5 + 7 * j;

/** The two parking spots: [peg a, peg b] in (col, row). */
export const PARK = [
  [[3, 9], [4, 9]],        // under the hours
  [[18, 1], [19, 1]],      // over the minutes
];

// waypoints (pixels) from the bottom-left park to the top-right park, and a tour
const P = (i, j) => [PX(i), PY(j)];
const FLICK = [P(3.5, 9), P(9.4, 9.2), P(9.93, 5), P(9.93, 2.7), P(12.4, 1.2), P(18.5, 1)];
const TOUR = [P(3.5, 9), P(9.5, 9.6), P(0.4, 8.6), P(9.6, 7.4), P(9.93, 5), P(9.93, 2.7), P(12.3, 0.4), P(21.6, 2.4), P(18.5, 1)];
const SPEED = 70;          // px/s
function lengths(path) {
  const L = [0];
  for (let k = 1; k < path.length; k++) L.push(L[k - 1] + Math.hypot(path[k][0] - path[k - 1][0], path[k][1] - path[k - 1][1]));
  return L;
}
const FLICK_L = lengths(FLICK), TOUR_L = lengths(TOUR);
// it speeds up over RAMP s after the release and slows over RAMP s into the landing
const RAMP = 0.3;
/** Flight durations, launch to touch-down. */
export const FLICK_T = FLICK_L[FLICK_L.length - 1] / SPEED + RAMP, TOUR_T = TOUR_L[TOUR_L.length - 1] / SPEED + RAMP;
/** Bounce points (the corners of each path): [time after launch, x, y]. */
export const TOUR_PINGS = TOUR.slice(1, -1).map((p, k) => [TOUR_L[k + 1] / SPEED + RAMP / 2, p[0], p[1]]);
export const FLICK_PINGS = FLICK.slice(1, -1).map((p, k) => [FLICK_L[k + 1] / SPEED + RAMP / 2, p[0], p[1]]);
/** Distance flown after t s of a flight lasting T s. */
function flown(t, T) {
  if (t <= 0) return 0;
  if (t < RAMP) return (SPEED * t * t) / (2 * RAMP);
  if (t < T - RAMP) return SPEED * (t - RAMP / 2);
  if (t < T) return SPEED * (T - RAMP - (T - t) ** 2 / (2 * RAMP)) ;
  return SPEED * (T - RAMP);
}

const wrapHalf = (a) => { while (a > Math.PI / 2) a -= Math.PI; while (a <= -Math.PI / 2) a += Math.PI; return a; };
const SEG_ANG = (path) => path.slice(1).map((p, k) => Math.atan2(p[1] - path[k][1], p[0] - path[k][0]));
const FLICK_A = SEG_ANG(FLICK), TOUR_A = SEG_ANG(TOUR);
function orient(path, L, d) {
  const A = path === TOUR ? TOUR_A : FLICK_A;
  let k = 1;
  while (k < L.length - 1 && L[k] < d) k++;
  const a = A[k - 1];
  if (k > 1 && d < L[k - 1] + 6) return a - wrapHalf(a - A[k - 2]) * (1 - ss((d - L[k - 1] + 6) / 12));
  if (k < L.length - 1 && d > L[k] - 6) return a + wrapHalf(A[k] - a) * ss((d - L[k] + 6) / 12);
  return a;
}
function walk(path, L, d, out) {
  let k = 1;
  while (k < L.length - 1 && L[k] < d) k++;
  const u = (d - L[k - 1]) / (L[k] - L[k - 1] || 1);
  out[0] = path[k - 1][0] + (path[k][0] - path[k - 1][0]) * u;
  out[1] = path[k - 1][1] + (path[k][1] - path[k - 1][1]) * u;
}

const ss = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const POS = [0, 0], RING = 10;
const PTS = new Float32Array(RING * 2);

/**
 * The spare's outline as RING points into PTS, at `t` seconds since launch
 * (t < 0: parked, the draw-back starts at -0.6). `tour`: the hour's long
 * flight, else the flick from park `from` to the other one.
 * Returns the point count; flight position in POS.
 */
export function spareShape(t, from, tour) {
  const path = tour ? TOUR : FLICK, L = tour ? TOUR_L : FLICK_L, T = tour ? TOUR_T : FLICK_T;
  const rev = from === 1;
  // parked lozenge round two pegs, centre (x, y), half length 3.5
  const park = (pk, pull) => {
    const [a, b] = PARK[pk];
    const x = (PX(a[0]) + PX(b[0])) / 2, y = PY(a[1]);
    for (let i = 0; i < RING; i++) {
      const th = (i / RING) * 6.2832, c = cos(th), s = sin(th);
      // a stadium: the two pegs' half circles joined by straight pulls
      const ex = c > 0 ? 3.5 + 1.6 * c + pull : -3.5 + 1.6 * c;
      PTS[i * 2] = x + ex; PTS[i * 2 + 1] = y + 1.6 * s * (1 - 0.25 * Math.min(1, pull / 6));
    }
  };
  // the end away from the flight is drawn back: left from the bottom-left park, right from the top-right
  const drawBack = (pk, pull) => {
    park(pk, 0);
    const [a, b] = PARK[pk], x = (PX(a[0]) + PX(b[0])) / 2, dir = pk === 0 ? -1 : 1;
    for (let i = 0; i < RING; i++) {
      const dx = PTS[i * 2] - x;
      if (dx * dir > 0) PTS[i * 2] += dir * pull * Math.min(1, Math.abs(dx) / 5);
    }
  };
  if (t <= -0.6 || t >= T + 0.5) {
    const pk = t <= -0.6 ? from : 1 - from;
    park(pk, 0); return RING;
  }
  if (t < 0) {
    // the draw-back: the far end is pulled away from the flight, slowly, then let go
    drawBack(from, 6 * ss((t + 0.6) / 0.55), rev);
    return RING;
  }
  // flight: a loop that tumbles (its long axis turning) along the path
  const d = flown(t, T), dd = rev ? L[L.length - 1] - d : d;
  walk(path, L, dd, POS);
  const land = ss((t - T + 0.15) / 0.5), take = ss(t / 0.35);
  // a flung band flies stretched along its flight, wriggling: its long axis
  // follows the path, turned smoothly over 12 px round each bounce (mod half a
  // turn: a loop looks the same either way round)
  const ang = orient(path, L, dd);
  const th0 = ang + 0.35 * sin(t * 11), rx = 3.8, ry = 1.2 + 0.5 * (0.5 + 0.5 * sin(t * 17));
  for (let i = 0; i < RING; i++) {
    const th = (i / RING) * 6.2832, c = cos(th), s = sin(th);
    const lx = rx * c, ly = ry * s, ca = cos(th0), sa = sin(th0);
    PTS[i * 2] = POS[0] + lx * ca - ly * sa; PTS[i * 2 + 1] = POS[1] + lx * sa + ly * ca;
  }
  // ease out of the launch shape and into the landing one
  if (take < 1 || land > 0) {
    // blended as shapes about their centres, so the blend adds no travel of its own
    const fx = PTS.slice(), pk = take < 1 ? from : 1 - from;
    if (take < 1) drawBack(from, 6); else park(pk, 0);
    const [a, b] = PARK[pk], pcx = (PX(a[0]) + PX(b[0])) / 2, pcy = PY(a[1]);
    const w = take < 1 ? 1 - take : land;
    for (let i = 0; i < RING; i++) {
      PTS[i * 2] = fx[i * 2] + (PTS[i * 2] - pcx - (fx[i * 2] - POS[0])) * w;
      PTS[i * 2 + 1] = fx[i * 2 + 1] + (PTS[i * 2 + 1] - pcy - (fx[i * 2 + 1] - POS[1])) * w;
    }
  }
  return RING;
}
export { PTS as SPARE_PTS, POS as SPARE_POS };
