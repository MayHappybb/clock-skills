// Rube Goldberg: the chain reaction as closed-form functions of time.
//
// A "run" fires every minute, timed backwards from the turn (rt = seconds
// relative to the minute boundary M): a marble leaves the hopper, rolls down
// the rail across the hours, falls into the seesaw cup, the seesaw flings the
// frog up into the pendulum boot, the boot kicks the dominoes, the last
// domino trips the drum's pawl lever at rt = 0. On the hour three marbles go,
// and the frog rides the domino wave to the end of the banner.
// Physics in a slow world: g = 300 px/s^2, rolling balls (5/7 g sin a).
import * as kit from '../js/kit.js';

export const G = 300;
export const MR = 2.3;                               // marble radius
export const RAIL = { x0: 12, y0: 7, x1: 74, y1: 12 };
export const railY = (x) => RAIL.y0 + ((x - RAIL.x0) * (RAIL.y1 - RAIL.y0)) / (RAIL.x1 - RAIL.x0);
export const ballY = (x) => railY(x) - MR - 0.6;
export const SLOT = (j) => 30 - 4.8 * j;             // hopper queue positions
export const GATE_X = 33.5;

const SINA = (RAIL.y1 - RAIL.y0) / Math.hypot(RAIL.x1 - RAIL.x0, RAIL.y1 - RAIL.y0), COSA = Math.sqrt(1 - SINA * SINA);
const ACC = G * (5 / 7) * SINA;
const LR = (RAIL.x1 - SLOT(0)) / COSA;
export const TR = Math.sqrt((2 * LR) / ACC), VR = ACC * TR;

// seesaw
export const PIV_Y = 56, HALF = 20, TH0 = 0.17;
const cupY = (th) => PIV_Y - HALF * Math.sin(th) - 1.2 - MR;     // left end, up when th > 0
const fy0 = ballY(RAIL.x1), vx = VR * COSA, vy = VR * SINA;
export const TF = (-vy + Math.sqrt(vy * vy + 4 * (G / 2) * (cupY(TH0) - fy0))) / G;
export const LAND_X = RAIL.x1 + vx * TF;
export const PIV_X = LAND_X + HALF * Math.cos(TH0);
/** Centre of a marble sitting in the cup when the seesaw is at angle th. */
export const cupPos = (th) => [PIV_X - HALF * Math.cos(th), cupY(th)];

// boot pendulum: period 2 s, ticks the seconds
export const BOOT = { px: 149.5, py: -16, L: G / (Math.PI * Math.PI) };
// dominoes
export const DOM = { n: 15, x0: 162, dx: 5, shelf: 19.5, h: 9, w: 2.4, step: 0.17, fall: 0.22 };
export const T_D0 = -((DOM.n - 1) * DOM.step + DOM.fall);         // first domino hit
export const T_KICK = T_D0 - 0.33;                                  // frog meets the boot
export const T_LAND = T_KICK - 0.52;                                // marble lands in the cup
export const T_REL = T_LAND - TF - TR;                              // gate opens
export const T_FROG = T_LAND + 0.08;                                // frog is flung

// belt and lift
export const BELT = { x0: 3, x1: 143, y: 62, v: 4 };
export const LIFT = { x: 7, yb: 58, yt: 5, r: 4 };
const LOOP = 2 * (LIFT.yb - LIFT.yt) + 2 * Math.PI * LIFT.r;
export const LIFT_SP = LOOP / 14, LIFT_V = (17 * LIFT_SP) / 60;
export const liftLoop = LOOP;

export const runCount = (hour) => (hour ? 3 : 1);
export const relTime = (k) => T_REL + 0.45 * k;

/** Seesaw angle for one run (rt relative to its minute); null when this run doesn't own it. */
export function seesawRun(rt, hour) {
  const n = runCount(hour), land0 = T_LAND;
  if (rt < land0) return null;
  const flip = TH0 - 2 * TH0 * kit.ease.outBack(kit.clamp((rt - land0) / 0.25));
  const back = hour ? frogHourBack : T_KICK + 0.5;
  if (rt < back) return flip;
  const k = kit.clamp((rt - back) / 0.35);
  return -TH0 + 2 * TH0 * kit.ease.outBack(k);
}
export const frogHourBack = 9.4;

/** Absolute times of one marble's journey after release at time r (seconds). */
export function marbleTimes(r, k, hour) {
  const land = r + TR + TF;
  const out = land + 0.55 + (hour ? 0.15 * (2 - k) : 0);
  const belt = out + 0.3;
  const x0 = LAND_X - 4;
  const atLift = belt + (x0 - (LIFT.x + LIFT.r + 0.5)) / BELT.v;
  // wait for the next bucket at the bottom of the up side
  // loop param 0 = bottom of the up side; buckets sit at multiples of LIFT_SP
  const lift = (Math.ceil((LIFT_V * atLift) / LIFT_SP) * LIFT_SP) / LIFT_V;
  const top = lift + (LIFT.yb - LIFT.yt) / LIFT_V;
  return { r, land, out, belt, x0, atLift, lift, top, home: top + 1.1 };
}
