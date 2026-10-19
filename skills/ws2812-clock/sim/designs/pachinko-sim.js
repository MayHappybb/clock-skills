// Pachinko ball physics, in grid pixels (64 x 128, pixel centres on integers,
// y down). Each ball is simulated once, from its launch time, against the
// nail field as it is at each instant (the nails glide at the hour), and its
// track is cached: frame() stays a pure function of time.

export const G = 150;            // px/s^2: a toy-scale tilt so a fall takes ~2 s
export const RB = 1.15;          // ball radius
export const RN = 0.55;          // nail radius
export const RATE = 120;         // track samples per second
const SUB = 3, DT = 1 / (RATE * SUB);
export const MAXLIFE = 12;

// the outer guide rail: a semicircle on top, straight sides
export const RAIL = { cx: 31.5, cy: 31.5, r: 28.5, left: 3, right: 60 };
export const INNER_X = 6.5, INNER_TOP = 36;          // inner rail: the launch channel's right wall
export const LAUNCH = { x: 4.75, y: 117 };

// static solid segments [ax, ay, bx, by, restitution]
export const FRAME = [[10, 55], [32, 49], [54, 55], [54, 96], [10, 96]];
export const GUIDES = [[7.2, 98], [13, 101.2], [59.3, 98], [51, 101.2]];
export const WINDMILLS = [[16, 104, 1], [48, 104, -1]];   // x, y, spin sign (+ = clockwise)
export const WM_R = 2.3;
export const LIFE = [[29.5, 100.2], [34.5, 100.2]];
export const HESO = { x0: 30.3, x1: 33.7, y0: 102, y1: 105.5 };
export const ATT = { x0: 25, x1: 39, y: 110, tilt: 0.7 };
const SEGS = [];
const seg = (ax, ay, bx, by, e = 0.3) => SEGS.push(ax, ay, bx, by, e);
seg(INNER_X, INNER_TOP, INNER_X, 118, 0.2);
for (let i = 0; i < FRAME.length; i++) { const a = FRAME[i], b = FRAME[(i + 1) % FRAME.length]; seg(a[0], a[1], b[0], b[1], 0.35); }
seg(GUIDES[0][0], GUIDES[0][1], GUIDES[1][0], GUIDES[1][1], 0.25);
seg(GUIDES[2][0], GUIDES[2][1], GUIDES[3][0], GUIDES[3][1], 0.25);
seg(29.6, 102.2, 29.6, 105.5, 0.3); seg(34.4, 102.2, 34.4, 105.5, 0.3);   // the start pocket's cup
seg(INNER_X, 112, 26.5, 117.6, 0.2); seg(60, 112, 37.5, 117.6, 0.2);         // floor to the out-hole
const NSEG = SEGS.length / 5;
const ATT_SEG = [ATT.x0, ATT.y - 0.7, ATT.x1, ATT.y + 0.7];   // the closed door tilts, so balls roll off

export const END = { none: 0, heso: 1, out: 2, foul: 3, attacker: 4 };

/** Push the ball out of a segment, bounce. Returns true on contact. */
function hitSeg(b, ax, ay, bx, by, e) {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
  let t = ((b.x - ax) * dx + (b.y - ay) * dy) / L2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const px = ax + t * dx, py = ay + t * dy, ox = b.x - px, oy = b.y - py, d2 = ox * ox + oy * oy;
  const lim = RB + 0.35;
  if (d2 >= lim * lim) return false;
  const d = Math.sqrt(d2) || 1e-6, nx = ox / d, ny = oy / d;
  b.x = px + nx * lim; b.y = py + ny * lim;
  const vn = b.vx * nx + b.vy * ny;
  if (vn < 0) { b.vx -= (1 + e) * vn * nx; b.vy -= (1 + e) * vn * ny; b.vx *= 0.995; b.vy *= 0.995; }
  return true;
}
function hitCircle(b, cx, cy, r, e, spin) {
  const ox = b.x - cx, oy = b.y - cy, lim = RB + r, d2 = ox * ox + oy * oy;
  if (d2 >= lim * lim) return false;
  const d = Math.sqrt(d2) || 1e-6, nx = ox / d, ny = oy / d;
  b.x = cx + nx * lim; b.y = cy + ny * lim;
  const vn = b.vx * nx + b.vy * ny;
  if (vn < 0) {
    b.vx -= (1 + e) * vn * nx; b.vy -= (1 + e) * vn * ny;
    const tx = -ny, ty = nx, vt = b.vx * tx + b.vy * ty;
    const k = spin ? 0.5 * (spin - vt) : -0.04 * vt;      // windmill vanes kick the ball along
    b.vx += k * tx; b.vy += k * ty;
  }
  return true;
}

const ball = { x: 0, y: 0, vx: 0, vy: 0 };
/**
 * Simulate one ball launched at t0 with launch speed v0.
 * field.at(t) -> { n, xy, key, moving, rows } nail positions (rows: per pixel row, the nails within reach, or null) at time t (xy Float32Array, 2 per nail).
 * attackerOpen(t) -> bool. Returns { n, track, hits, nh, end, endT } (hits: t, nail index, key).
 */
export function simulate(t0, v0, field, attackerOpen) {
  const track = new Float32Array(2 * RATE * MAXLIFE + 2);
  const hits = new Float32Array(3 * 48);
  let nh = 0, n = 0, end = END.none, stall = 0, ghost = 0;
  const b = ball;
  b.x = LAUNCH.x; b.y = LAUNCH.y; b.vx = 0; b.vy = -v0;
  const lastHit = new Float32Array(400).fill(-9);
  const steps = RATE * MAXLIFE * SUB;
  let F = field.at(t0);
  for (let s = 0; s < steps; s++) {
    const t = t0 + s * DT;
    if (s % SUB === 0) { track[2 * n] = b.x; track[2 * n + 1] = b.y; n++; }
    if (F.moving || (s & 15) === 0) F = field.at(t);
    b.vy += G * DT;
    b.vx *= 0.9997; b.vy *= 0.9997;
    b.x += b.vx * DT; b.y += b.vy * DT;
    // guide rail
    if (b.y < RAIL.cy) {
      const ox = b.x - RAIL.cx, oy = b.y - RAIL.cy, d = Math.hypot(ox, oy), lim = RAIL.r - RB;
      if (d > lim) {
        const nx = ox / d, ny = oy / d; b.x = RAIL.cx + nx * lim; b.y = RAIL.cy + ny * lim;
        const vn = b.vx * nx + b.vy * ny;
        if (vn > 0) { b.vx -= 1.15 * vn * nx; b.vy -= 1.15 * vn * ny; }
      }
    } else {
      if (b.x < RAIL.left + RB) { b.x = RAIL.left + RB; if (b.vx < 0) b.vx *= -0.3; }
      if (b.x > RAIL.right - RB) { b.x = RAIL.right - RB; if (b.vx > 0) b.vx *= -0.3; }
    }
    if (b.y > 44) {
      for (let k = 0; k < NSEG; k++) { const q = 5 * k; hitSeg(b, SEGS[q], SEGS[q + 1], SEGS[q + 2], SEGS[q + 3], SEGS[q + 4]); }
      if (b.y > 95) {
        for (const [cx, cy, sp] of WINDMILLS) hitCircle(b, cx, cy, WM_R, 0.3, sp * 28);
        for (const [cx, cy] of LIFE) hitCircle(b, cx, cy, RN, 0.45, 0);
        if (!attackerOpen(t)) hitSeg(b, ATT_SEG[0], ATT_SEG[1], ATT_SEG[2], ATT_SEG[3], 0.3);
      }
    } else if (b.x > INNER_X - 1 && b.y > INNER_TOP - 2) hitSeg(b, INNER_X, INNER_TOP, INNER_X, 118, 0.2);
    // the nails
    if (ghost > 0) ghost -= DT;
    else if (b.y > 2 && b.y < 93) {
      const xy = F.xy, rows = F.rows, list = rows ? rows[Math.round(b.y)] : null, cnt = list ? list.length : F.n;
      for (let m = 0; m < cnt; m++) {
        const k = list ? list[m] : m;
        const ox = b.x - xy[2 * k], oy = b.y - xy[2 * k + 1];
        if (ox > 2 || ox < -2 || oy > 2 || oy < -2) continue;
        if (hitCircle(b, xy[2 * k], xy[2 * k + 1], RN, 0.5, 0) && !F.moving && t - lastHit[k] > 0.25 && nh < 48) {
          lastHit[k] = t; hits[3 * nh] = t; hits[3 * nh + 1] = k; hits[3 * nh + 2] = F.key; nh++;
        }
      }
    }
    // a ball wedged between nails wriggles through
    if (b.vx * b.vx + b.vy * b.vy < 25 && b.y < 93 && (b.y < 49 || b.x > 54)) { stall += DT; if (stall > 0.3) { ghost = 0.3; stall = 0; } } else stall = 0;
    // where balls leave the field
    if (b.x > HESO.x0 && b.x < HESO.x1 && b.y > HESO.y0 && b.y < HESO.y1) { end = END.heso; break; }
    if (b.y > 116.6 && b.x > 26 && b.x < 38) { end = END.out; break; }
    if (b.x < INNER_X && b.y > 117.5 && b.vy > 0) { end = END.foul; break; }
    if (b.y > ATT.y - 2 && b.y < ATT.y + 1.5 && b.x > ATT.x0 && b.x < ATT.x1 && attackerOpen(t)) { end = END.attacker; break; }
    if (b.y > 130 || b.x < 0 || b.x > 64) { end = END.out; break; }
  }
  track[2 * n] = b.x; track[2 * n + 1] = b.y; n++;
  return { n, track, hits, nh, end, endT: t0 + (n - 1) / RATE };
}
