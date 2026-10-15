// Shadowplay's Monkey King: a jointed leather puppet in profile, facing left,
// who balances the minutes on his golden staff held overhead. Bent limbs are
// solved each frame (two-bone IK) so his feet stay planted when he crouches.
import { Piece, draw, dot, hole, rod } from './shadowplay-cloth.js';

const GOLD = [1.0, 0.66, 0.1], GREEN = [0.14, 0.58, 0.16], OCHRE = [0.9, 0.42, 0.05];
const MASK = [0.85, 0.1, 0.04], BOOT = [0.12, 0.09, 0.07], STAFF = [0.3, 0.07, 0.04], INK = [0.04, 0.04, 0.04];
const P = (kind, pts, hw, col, pat = 0, sp = 3, hr = 0.6) => new Piece(kind, pts, hw, col, pat, sp, hr);

const SKIN = [0.95, 0.45, 0.07], FUR = [0.36, 0.14, 0.03];
const torso = P(1, [-4.6, 0.5, 4.6, 0.5, 5, -4, 4.2, -9.2, 2.5, -10.6, -2.5, -10.6, -4.2, -9.2, -5, -4], 0, GREEN, 2, 2.8, 0.65);
const collar = P(0, [-3.2, -9.6, 3.2, -9.6], 0.9, GOLD);
const skirt = P(1, [-5.6, -1.5, 5.6, -1.5, 6.6, 3.8, 3, 5.2, 0, 4, -3, 5.2, -6.6, 3.8], 0, OCHRE, 2, 2.5, 0.55);
const belt = P(0, [-5.2, -1.6, 5.2, -1.6], 0.8, INK);
const head = P(1, [4.5, -2, 5.6, -5.5, 5.2, -9, 3, -11.5, -0.5, -12.3, -3.8, -11.4, -5.8, -9, -6.4, -6.8, -8.8, -6, -9.6, -4.2,
  -9.2, -2.4, -7.2, -1, -4.5, -0.6, -2, 0.2, 1.5, 0.4], 0, SKIN);
const mask = P(1, [4.5, -2, 5.6, -5.5, 5.2, -9, 3, -11.5, -0.5, -12.3, -3.8, -11.4, -5.8, -9, -1.4, -9.6, -0.9, -6.4, -1.6, -3, -2.2, 0, 1.5, 0.4], 0, FUR);
const brow = P(0, [-1.6, -9.2, -4, -9.3, -6.2, -7.6], 0.75, MASK);
const band = P(0, [-5.9, -9.6, -1.5, -11.3, 4.6, -9.2], 0.8, INK);
const mouth = P(0, [-9.5, -3.1, -6.8, -2.6], 0.45, INK);
const tail = P(0, [0, 0, 5, 1, 9, -2, 10, -7, 8.5, -10, 6, -10.5], 1.0, OCHRE);
const legF = P(0, [0, 0, -2, 5.5, -1, 11], 2.0, OCHRE), legB = P(0, [0, 0, -2, 5.5, -1, 11], 2.0, OCHRE);
const bootF = P(1, [-1.6, -1.6, 1.8, -1.6, 1.9, 1.5, -5.2, 1.5, -5.4, 0.1], 0, BOOT);
const bootB = P(1, [-1.6, -1.6, 1.8, -1.6, 1.9, 1.5, -5.2, 1.5, -5.4, 0.1], 0, BOOT);
const armF = P(0, [0, 0, 1, 0, 2, 0], 1.55, GREEN), armB = P(0, [0, 0, 1, 0, 2, 0], 1.55, GREEN);
export const STAFF_HALF = 24, STAFF_HW = 1.5;
const staff = P(0, [-STAFF_HALF + 3.6, 0, STAFF_HALF - 3.6, 0], STAFF_HW, STAFF);
const hoopL = P(0, [-STAFF_HALF, 0, -STAFF_HALF + 3.6, 0], 1.9, GOLD), hoopR = P(0, [STAFF_HALF - 3.6, 0, STAFF_HALF, 0], 1.9, GOLD);

const UP = 8.4, LO = 8.4, THIGH = 6.6, SHIN = 6.6;
let KX = 0, KY = 0;
/** Two-bone IK: the middle joint between (ax, ay) and (bx, by), bent to side sgn. */
function ik(ax, ay, bx, by, a, b, sgn) {
  const dx = bx - ax, dy = by - ay;
  let d = Math.hypot(dx, dy);
  const dd = Math.min(d, a + b - 0.01), ph = Math.atan2(dy, dx);
  const al = Math.acos(Math.max(-1, Math.min(1, (a * a + dd * dd - b * b) / (2 * a * dd))));
  KX = ax + a * Math.cos(ph + sgn * al); KY = ay + a * Math.sin(ph + sgn * al);
}
const LB = new Float64Array(6);
function limb(pc, ax, ay, bx, by, cx, cy) {
  LB[0] = 0; LB[1] = 0; LB[2] = bx - ax; LB[3] = by - ay; LB[4] = cx - ax; LB[5] = cy - ay;
  pc.set(LB);
}

/**
 * Draw the monkey. (hx, hy) hip, ba body lean, (sx, sy, sa) the staff centre
 * and angle, look the head tilt, t the time (plumes, tail, blink), fx the
 * x where his feet stand, floor their y.
 */
export function monkey(hx, hy, ba, sx, sy, sa, look, t, fx, floor, bright) {
  const c = Math.cos(ba), s = Math.sin(ba);
  const W = (lx, ly, o) => (o ? hy + s * lx + c * ly : hx + c * lx - s * ly);
  // legs, feet planted
  for (let k = 0; k < 2; k++) {
    const jx = W(k ? 1.6 : -1.6, 2), jy = W(k ? 1.6 : -1.6, 2, 1);
    const ax = fx + (k ? 2.4 : -2.2), ay = floor;
    ik(jx, jy, ax, ay, THIGH, SHIN, k ? 1 : 1);
    const pc = k ? legB : legF;
    limb(pc, jx, jy, KX, KY, ax, ay);
    draw(pc, jx, jy, 0, 0, 1);
    draw(k ? bootB : bootF, ax, ay - 0.6, 0, 0, 1);
    dot(KX, KY, 0.9, 0.05, 0.05, 0.05, 0, 1);
  }
  // tail
  draw(tail, W(5, -0.6), W(5, -0.6, 1), ba + 0.22 * Math.sin(t * 1.9) + 0.09 * Math.sin(t * 3.3), 0, 1);
  draw(torso, hx, hy, ba, 0, 1);
  draw(skirt, hx, hy, ba, 0, 1);
  draw(belt, hx, hy, ba, 0, 1);
  draw(collar, hx, hy, ba, 0, 1);
  // head on the neck
  const nx = W(-0.2, -10.4), ny = W(-0.2, -10.4, 1), ha = ba + look;
  draw(head, nx, ny, ha, 0, 1);
  draw(mask, nx, ny, ha, 0, 1);
  draw(band, nx, ny, ha, 0, 1);
  draw(brow, nx, ny, ha, 0, 1);
  draw(mouth, nx, ny, ha, 0, 1);
  const hc = Math.cos(ha), hs = Math.sin(ha);
  const HX = (lx, ly) => nx + hc * lx - hs * ly, HY = (lx, ly) => ny + hs * lx + hc * ly;
  // ear, eye (a pierced hole with a pupil), blink
  hole(HX(2.2, -6), HY(2.2, -6), 1.7, 0.75);
  dot(HX(2.2, -6), HY(2.2, -6), 1.7, 1, 0.6, 0.15, 0, 1);
  const bp = (t * 0.27) % 1, blink = bp > 0.965 ? 0.2 : 1;
  const ex = HX(-4, -7), ey = HY(-4, -7);
  hole(ex, ey, 1.95 * blink, bright);
  dot(ex - 0.7 * hc, ey - 0.7 * hs, 1.0 * blink, 0.03, 0.03, 0.03, 0, blink);
  // the staff and the arms that hold it
  const sc = Math.cos(sa), ss = Math.sin(sa);
  draw(staff, sx, sy, sa, 0, 1); draw(hoopL, sx, sy, sa, 0, 1); draw(hoopR, sx, sy, sa, 0, 1);
  for (let k = 0; k < 2; k++) {
    const shx = W(k ? 2.4 : -2.4, -9.4), shy = W(k ? 2.4 : -2.4, -9.4, 1);
    const g = k ? 8 : -8.4, gx = sx + sc * g, gy = sy + ss * g;
    ik(shx, shy, gx, gy, UP, LO, k ? 1 : -1);
    const pc = k ? armB : armF;
    limb(pc, shx, shy, KX, KY, gx, gy);
    draw(pc, shx, shy, 0, 0, 1);
    dot(KX, KY, 0.9, 0.05, 0.05, 0.05, 0, 1);
    dot(gx, gy, 1.7, 0.45, 0.28, 0.08, 0, 1);
  }
  // the puppeteer's main rod, from the back of the neck down to his hand
  rod(W(3, -9), W(3, -9, 1), hx + 26, 70, 0.55, 0.3, 0, 0.55, 1);
}
