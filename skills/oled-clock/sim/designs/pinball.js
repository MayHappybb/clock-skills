// Pinball — a table with a live ball, and the time standing on it as targets.
//
// The whole glass is the playfield of a machine, seen from above: walls, a
// shooter lane down the right, three pop bumpers, two slingshots and a pair
// of flippers over the drain. A steel ball is always in play — launched up
// the lane, bouncing off the bumpers (which flash and kick) and the flipper
// blades, draining, and being served again. Its whole path is simulated from
// the start of its ten-second ball, so frame() stays a pure function of the
// clock: where the ball is at 10:09:42.3 has an answer without a state.
//
// The time stands in the upper playfield as four banks of drop targets. Each
// numeral is one moulded plastic plate, cut as a shape and stood on the
// playfield: the counters (the hole of a 0, the loops of an 8) are holes
// clean through it with the playfield showing behind, each stroke is lit
// along its moulded top and shaded round its underside, the plate stands in
// a slot with a lip of shadow, and the numerals lean back a touch, as a
// moulded target on a raked playfield does. Nothing here is a font.
//
// Through the minute a ball is fired across the banks from the left: it
// sparks off each plate and knocks it flat as it reaches it, so the old time
// falls; behind it,
// from :00, the new plates swing up out of their slots almost together,
// overshoot and settle. (They rise together on purpose: staggering them would
// leave a moment where the new hour stood beside the old minutes, reading as
// a time that never was.) On the hour the machine serves a multiball — three
// balls at once — the lamps chase round the bumpers, and the new hour comes
// up slowly.
//
// Burn-in: the playfield's fixtures walk a 2 px orbit every three minutes;
// the targets change every minute; 23:00-07:00 the panel dims (ctx.night).

import { dither, clamp, ease, progress, noise, clockFields, previousMinute, orbit } from '../js/kit.js';

const W = 128, H = 64;

// ------------------------------------------------------------ the moulded hand
// Numerals moulded in plastic, standing on the playfield as drop targets:
// chunky, round, no stencil bridges — the counters are holes clean through
// the plate, and the playfield shows behind them.

const DW = 10, DH = 14, SR = 1.5, SLANT = 0.14;
const BOXW = DW + 2 * SR, BOXH = DH + 2 * SR;

const POLY = {
  0: [[[3, 0], [7, 0], [9.4, 2.4], [9.4, 11.6], [7, 14], [3, 14], [0.6, 11.6], [0.6, 2.4], [3, 0]]],
  1: [[[2.4, 4.2], [5.2, 0.6], [5.2, 14]], [[1.6, 14], [8.8, 14]]],
  2: [[[1.0, 2.4], [1.0, 1.2], [2.4, 0], [7.6, 0], [9.0, 1.4], [9.0, 3.6], [7.4, 6.0], [2.2, 11.4], [1.0, 14], [9.0, 14]]],
  3: [[[1.0, 1.2], [2.4, 0], [7.6, 0], [9.0, 1.4], [8.8, 3.6], [6.8, 5.8], [5.0, 7]],
    [[5.0, 7], [7.0, 8.2], [8.8, 10.4], [9.0, 12.6], [7.6, 14], [4.4, 14], [2.2, 13.0], [1.0, 11.6]]],
  4: [[[6.6, 14], [6.6, 0], [0.8, 9.8], [9.8, 9.8]]],
  5: [[[9.0, 0], [1.2, 0], [1.2, 6.2], [5.0, 5.2], [8.0, 6.6], [9.0, 9.0], [9.0, 12.2], [7.4, 14], [2.4, 14], [1.0, 12.8]]],
  6: [[[8.6, 0.8], [7.0, 0], [3.6, 0], [1.8, 1.8], [1.0, 5.0], [1.0, 11.4], [2.0, 13.6], [4.4, 14], [7.2, 14], [8.8, 12.2], [8.8, 9.4], [7.2, 7.6], [4.4, 7.6], [2.4, 9.0], [1.0, 11.4]]],
  7: [[[0.8, 1.4], [0.8, 0], [9.2, 0], [6.2, 7.4], [5.2, 14]], [[2.8, 7.6], [7.6, 7.6]]],
  8: [[[3.0, 0], [7.0, 0], [8.8, 1.8], [8.8, 5.0], [7.0, 6.8], [3.0, 6.8], [1.2, 5.0], [1.2, 1.8], [3.0, 0]],
    [[3.0, 7.2], [7.0, 7.2], [8.8, 9.0], [8.8, 12.2], [7.0, 14], [3.0, 14], [1.2, 12.2], [1.2, 9.0], [3.0, 7.2]]],
};
POLY[9] = POLY[6].map((s) => s.map(([x, y]) => [DW - x, DH - y]));

const segDistF = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  const u = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  return Math.hypot(px - ax - u * dx, py - ay - u * dy);
};

// ------------------------------------------------------------ the plate mask
// The distance to a numeral's centreline, whether a pixel is on the plate or
// in a counter, which way is up there, and which way is outward — so a
// stroke can be lit along its moulded top and shaded along its underside,
// and its counters left as holes.

const DU = 0.22;
const U0 = -SR - 2.4, V0 = -SR - 2.4;
const MW = Math.ceil((DW + 2 * SR + 4.8) / DU);
const MH = Math.ceil((DH + 2 * SR + 4.8) / DU);

function buildMask(d) {
  const at = (i, j) => {
    if (i < 0 || j < 0 || i >= MW || j >= MH) return 99;
    const v = V0 + (j + 0.5) * DU;
    // the plate leans back a touch, the way a moulded target on a sloped
    // playfield does: the numeral is drawn upright, the sampling slants it
    const u = U0 + (i + 0.5) * DU - SLANT * (DH - v);
    let best = 1e9;
    for (const poly of POLY[d])
      for (let k = 1; k < poly.length; k++) {
        const q = segDistF(u, v, poly[k - 1][0], poly[k - 1][1], poly[k][0], poly[k][1]);
        if (q < best) best = q;
      }
    return best;
  };
  const dist = new Float32Array(MW * MH), cls = new Uint8Array(MW * MH), up = new Int8Array(MW * MH);
  for (let j = 0; j < MH; j++)
    for (let i = 0; i < MW; i++) {
      const q = at(i, j), idx = j * MW + i;
      dist[idx] = q;
      cls[idx] = q <= SR ? 1 : 0;
      if (q <= SR) {
        const dy = at(i, j + 1) - at(i, j - 1);
        up[idx] = dy > 0.05 ? 1 : dy < -0.05 ? -1 : 0;
      }
    }
  const stack = [];
  const push = (i, j) => { const k = j * MW + i; if (cls[k] === 0) { cls[k] = 3; stack.push(k); } };
  for (let i = 0; i < MW; i++) { push(i, 0); push(i, MH - 1); }
  for (let j = 0; j < MH; j++) { push(0, j); push(MW - 1, j); }
  while (stack.length) {
    const k = stack.pop(), i = k % MW, j = (k - i) / MW;
    if (i > 0) push(i - 1, j);
    if (i < MW - 1) push(i + 1, j);
    if (j > 0) push(i, j - 1);
    if (j < MH - 1) push(i, j + 1);
  }
  for (let k = 0; k < cls.length; k++) if (cls[k] === 0) cls[k] = 2;
  const side = new Uint8Array(MW * MH);
  for (let j = 1; j < MH - 1; j++)
    for (let i = 1; i < MW - 1; i++) {
      const idx = j * MW + i;
      if (cls[idx] !== 1) continue;
      const gx = at(i + 1, j) - at(i - 1, j), gy = at(i, j + 1) - at(i, j - 1);
      const sx = Math.sign(gx), sy = Math.sign(gy);
      if (!sx && !sy) { side[idx] = 0; continue; }
      let ii = i, jj = j, k = 0, left = 0;
      while (k++ < 16) {
        ii += sx; jj += sy;
        if (ii < 0 || jj < 0 || ii >= MW || jj >= MH) break;
        if (cls[jj * MW + ii] !== 1) { left = cls[jj * MW + ii]; break; }
      }
      side[idx] = left === 2 ? 2 : left === 3 ? 1 : 0;
    }
  return { dist, cls, up, side };
}
const MASK = Array.from({ length: 10 }, (_, d) => buildMask(d));

/**
 * Draw digit `d` as a moulded plate standing on the playfield. Its outer box
 * is (x0, y0, w, h); `flat` swings it back towards its base as it falls, and
 * dims it as it turns away from the light.
 */
function plateDigit(g, d, x0, y0, w, h, { flat = 0, lit = 1 } = {}) {
  const M = MASK[d];
  const s = w / BOXW;
  const yb = y0 + h;
  const scale = Math.cos(flat * Math.PI * 0.5);
  if (scale < 0.05) return;
  const hh = h * scale, yc = yb - hh / 2;
  const dim = lit * (0.34 + 0.66 * scale);
  const xa = Math.max(0, Math.floor(x0 - 2)), xb = Math.min(W - 1, Math.ceil(x0 + w + 2));
  const yt = Math.max(0, Math.floor(yb - hh - 2));
  for (let py = yt; py <= Math.min(H - 1, Math.ceil(yb)); py++) {
    const v = DH / 2 + (py + 0.5 - yc) / (s * scale);
    const j = Math.floor((v - V0) / DU);
    if (j < 0 || j >= MH) continue;
    for (let px = xa; px <= xb; px++) {
      const u = ((px + 0.5) - x0) / s - SR;
      const i = Math.floor((u - U0) / DU);
      if (i < 0 || i >= MW) continue;
      const k = j * MW + i, q = M.dist[k], un = M.up[k];
      if (M.cls[k] === 1) {
        if (M.side[k] === 1 && un < 0 && q > SR - 0.8) {
          if (dither(px, py, 0.42 * dim)) g.pixel(px, py, 1); else g.pixel(px, py, 0);
        } else if (dim >= 0.999) g.pixel(px, py, 1);
        else if (dither(px, py, dim)) g.pixel(px, py, 1);
        else g.pixel(px, py, 0);
      } else if (M.cls[k] === 2) g.pixel(px, py, 0);
      else if (q <= SR + 1.1) g.pixel(px, py, 0);
    }
  }
  g.hline(x0 - 1, yb, w + 2, 0);
  if (scale > 0.3) g.shade(x0 - 1, yb + 1, w + 2, 1, 0.30);
}

// ------------------------------------------------------------ the playfield

const CYCLE = 10;                        // one ball lasts ten seconds
const PF = { x0: 5, x1: 123, y0: 6, y1: 61 };
const LANE_X = 115;                      // the shooter lane's inner wall
const DRAIN = [55, 73];
const BR = 2;                            // ball radius
const GRAV = 56;

const BANKS = [10, 31, 64, 85];          // bank left edges
const BANK_W = 19, DIG_W = 17.2, DIG_H = 21, BANK_Y = 11;
const BUMPERS = [{ x: 24, y: 45 }, { x: 64, y: 41 }, { x: 104, y: 45 }];
const BUMPER_R = 5.4;
const SEGS = [
  [LANE_X, 61, LANE_X, 25],              // the shooter lane's wall
  [100, 7, 124, 17],                     // the deflector at the top of the lane
  [5, 54, 55, 61], [123, 54, 73, 61],    // the floor, falling to the drain
  [36, 49, 46, 54], [92, 49, 82, 54],    // the slingshots
];
const FLIP = [{ hx: 51, hy: 52, dir: 1 }, { hx: 77, hy: 52, dir: -1 }];
const FLIP_LEN = 14, FLIP_REST = 0.50, FLIP_UP = -0.52;

/** The flipper blade: hinge to tip, at `a` radians below horizontal. */
const flipperBlade = (i, a) => {
  const f = FLIP[i];
  return [f.hx, f.hy, f.hx + f.dir * FLIP_LEN * Math.cos(a), f.hy + FLIP_LEN * Math.sin(a)];
};

/** How far into its flutter the flipper is: a snap up, a slow drop back. */
function flipperAngle(i, T, live = 1) {
  if (live < 0.3) return FLIP_REST;          // its ball played out: blades down
  const p = ((T * 0.62 + i * 0.5) % 1 + 1) % 1;
  const up = p < 0.12 ? ease.outCubic(p / 0.12) : (p < 0.3 ? 1 - (p - 0.12) / 0.18 : 0);
  return FLIP_REST + (FLIP_UP - FLIP_REST) * up;
}

/** One step of the ball: gravity, then the playfield's walls and furniture. */
function stepBall(b, dt, T, live, hitAt, dead = false) {
  b.vy += GRAV * dt;
  const sp = Math.hypot(b.vx, b.vy);
  if (sp > 165) { b.vx *= 165 / sp; b.vy *= 165 / sp; }
  b.x += b.vx * dt; b.y += b.vy * dt;
  // the playfield gives the ball back less as its ball plays out, so it walks
  // itself down to the drain instead of bouncing for ever
  const e = dead ? 0.12 : 0.56 + 0.42 * live;
  const bounce = (nx, ny) => {
    const vn = b.vx * nx + b.vy * ny;
    if (vn < 0) { b.vx -= (1 + e) * vn * nx; b.vy -= (1 + e) * vn * ny; }
  };
  if (b.x < PF.x0 + BR) { b.x = PF.x0 + BR; bounce(1, 0); }
  if (b.x > PF.x1 - BR) { b.x = PF.x1 - BR; bounce(-1, 0); }
  if (b.y < PF.y0 + BR) { b.y = PF.y0 + BR; bounce(0, 1); }
  for (const [ax, ay, bx, by] of SEGS) {
    const d = segDistF(b.x, b.y, ax, ay, bx, by);
    if (d < BR + 1) {
      const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy);
      let nx = b.x - ax, ny = b.y - ay;
      const t = ((b.x - ax) * dx + (b.y - ay) * dy) / (l * l);
      nx += -dx * Math.max(0, Math.min(1, t)); ny += -dy * Math.max(0, Math.min(1, t));
      const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
      b.x = ax + dx * Math.max(0, Math.min(1, t)) + nx * (BR + 1);
      b.y = ay + dy * Math.max(0, Math.min(1, t)) + ny * (BR + 1);
      bounce(nx, ny);
      b.vx *= 0.996; b.vy *= 0.996;
    }
  }
  if (live > 0.4 && !dead) {
    for (let i = 0; i < BUMPERS.length; i++) {
      const c = BUMPERS[i];
      const dx = b.x - c.x, dy = b.y - c.y, d = Math.hypot(dx, dy);
      if (d < BUMPER_R + BR) {
        const nx = dx / (d || 1), ny = dy / (d || 1);
        b.x = c.x + nx * (BUMPER_R + BR + 0.2); b.y = c.y + ny * (BUMPER_R + BR + 0.2);
        bounce(nx, ny);
        const k = 96 * live;                 // the kick fades as the ball plays out
        b.vx += nx * k; b.vy += ny * k;
        hitAt[i] = T;
      }
    }
  }
  // the flippers
  for (let i = 0; i < 2 && !dead; i++) {
    const a = flipperAngle(i, T, live);
    const [ax, ay, bx, by] = flipperBlade(i, a);
    if (segDistF(b.x, b.y, ax, ay, bx, by) < BR + 1.6) {
      const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy);
      let nx = b.x - ax, ny = b.y - ay;
      const t = clamp(((b.x - ax) * dx + (b.y - ay) * dy) / (l * l), 0, 1);
      nx -= dx * t; ny -= dy * t;
      const nl = Math.hypot(nx, ny) || 1;
      b.x = ax + dx * t + (nx / nl) * (BR + 1.6);
      b.y = ay + dy * t + (ny / nl) * (BR + 1.6);
      const mv = Math.cos(a) * -FLIP[i].dir * Math.sin(a);
      bounce(nx / nl, ny / nl);
      const kick = (live > 0.4 && mv > 0 ? 56 : 14) * Math.max(0.3, live);
      b.vx += (nx / nl) * kick; b.vy += (ny / nl) * kick;
    }
  }
}

/** When each bumper was last hit, per ball: drives its lamp. */
const LAMPS = [[-9, -9, -9], [-9, -9, -9], [-9, -9, -9]];

/**
 * Where ball `n` is `phase` seconds into its ball. Simulated from the serve,
 * so it is a pure function of the clock; the ball is served again a beat
 * after it drains, and late in its ball the machine lets it play out.
 */
function ballAt(seed, phase, T, n) {
  const dt = 1 / 60;
  const lamps = LAMPS[n];
  lamps[0] = lamps[1] = lamps[2] = -9;
  const b = { x: 119, y: 57, vx: 0, vy: -168 - noise(seed, 3) * 26 };
  let out = 0, lives = 0, stuckT = 0, lastX = b.x, lastY = b.y;
  for (let t = 0; t < phase; t += dt) {
    const live = clamp(1 - t / 17, 0, 1);
    if (out > 0) {
      out -= dt;
      if (out <= 0) {
        lives++;
        b.x = 119; b.y = 57;
        b.vx = (noise(seed, lives * 3) - 0.5) * 30;
        b.vy = -168 - noise(seed, lives * 7 + 1) * 26;
      }
    } else {
      // late in its ball the table gives the ball up: the flippers drop out
      // of the way and it runs down into the drain
      const dead = t > CYCLE - 1.8;
      if (dead) { b.vy += 420 * dt; b.vx += (64 - b.x) * 6 * dt; }
      // nothing sits still on a pinball table: a wedged ball gets nudged
      stuckT += dt;
      if (stuckT > 0.5) {
        if (Math.hypot(b.x - lastX, b.y - lastY) < 4) {
          b.vx += (noise(seed, t * 3) - 0.5) * 110;
          b.vy -= 60 + noise(seed, t * 5) * 40;
        }
        lastX = b.x; lastY = b.y; stuckT = 0;
      }
      stepBall(b, dt, T - (phase - t), live, lamps, dead);
      if (b.y > 63.5) out = t > CYCLE - 1.8 ? 999 : 0.6;
    }
  }
  return b;
}

// ------------------------------------------------------------ choreography

/** Where the shot that knocks the old time flat has got to. */
function shotAt(tau, hour) {
  const span = hour ? [1.2, 0.6] : [0.85, 0.45];              // [out, in]
  return -12 + 152 * progress(tau, -span[0], span[1]);
}

// ------------------------------------------------------------ the design

export default {
  name: 'Pinball',
  blurb: 'A pinball playfield with a steel ball always in play: the time stands on it in banks of drop targets, and each minute a shot knocks the old numerals flat as it crosses them and the new ones swing up behind it.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  driver: 'full',

  frame(g, ctx) {
    const f = ctx.fields, T = ctx.date.getTime() / 1000, sec = f.sec;
    const tau = sec > 57 ? sec - 60 : sec;
    const hour = f.m === 0 || (tau < 0 && clockFields(new Date(ctx.date.getTime() + 60000)).m === 0);
    const [ox, oy] = orbit(ctx.date, 2, 3);

    // -- the cabinet walls
    g.rect(PF.x0 - 2 + ox, PF.y0 - 2 + oy, PF.x1 - PF.x0 + 4, PF.y1 - PF.y0 + 4, 1);
    g.rect(PF.x0 - 1 + ox, PF.y0 - 1 + oy, PF.x1 - PF.x0 + 2, PF.y1 - PF.y0 + 2, 0);
    // the shooter lane down the right, and its mouth at the top
    g.vline(LANE_X + ox, 25 + oy, 37, 1);
    g.vline(LANE_X + 1 + ox, 25 + oy, 37, 0);

    // -- the return lanes either side of the banks, and the colon of inserts
    //    the machine puts between the hour and the minute
    for (const lx of [109, 6]) {
      g.line(lx + ox, 9 + oy, lx + ox, 40 + oy, dither(lx, 9, 0.5) ? 1 : 0);
      g.line(lx + (lx > 64 ? 1 : -1) + ox, 11 + oy, lx + (lx > 64 ? 1 : -1) + ox, 38 + oy, 0);
    }
    const pip = 0.45 + 0.55 * Math.exp(-(sec % 1) * 4);
    for (const py of [17, 27]) g.fillCircle(57 + ox, py + oy, 2.4, 1);
    g.fillCircle(57 + ox, 17 + oy, 1.2, dither(56, 17, pip) ? 1 : 0);
    g.fillCircle(57 + ox, 27 + oy, 1.2, dither(56, 27, pip) ? 1 : 0);

    // -- the balls, simulated before anything is drawn so the bumpers can
    //    flash on the hits this very frame
    const nBalls = hour ? 3 : 1;
    const balls = [];
    for (let i = 0; i < nBalls; i++) {
      const off = i * (CYCLE / 3);
      const t = sec + off;
      const cyc = Math.floor(t / CYCLE);
      const phase = t - cyc * CYCLE;
      const seed = (f.minuteKey % 997) * 0.37 + cyc * 11.3 + i * 5.1;
      balls.push(ballAt(seed, phase, T, i));
    }


    // -- the drop target banks
    const xs = shotAt(tau, hour);
    const prevF = previousMinute(ctx.date);
    const nextF = clockFields(new Date(ctx.date.getTime() + 60000));
    const oldD = (tau < 0 ? `${f.hh}${f.mm}` : `${prevF.hh}${prevF.mm}`).split('').map(Number);
    const newD = (tau < 0 ? `${nextF.hh}${nextF.mm}` : `${f.hh}${f.mm}`).split('').map(Number);
    for (let k = 0; k < 4; k++) {
      const bx = BANKS[k] + ox, by = BANK_Y + oy;
      g.shade(bx - 1, by + DIG_H, BANK_W - 2, 1, 0.42);      // the slot it stands in
      const cx = bx + BANK_W / 2;
      // the sweep ball knocks the plate flat as it reaches it ...
      let flat = xs > cx - 9 ? 1 - ease.inCubic(progress(xs, cx - 9, cx + 4)) : 0;
      // ... and after :00 the new plate swings up out of the slot
      const r0 = 0.06 + k * 0.04, r1 = r0 + (hour ? 1.05 : 0.72);
      const u = progress(tau, r0, r1);
      const rising = tau >= r0;
      if (rising) {
        const e = u < 0.72 ? ease.outCubic(u / 0.72) : 1 + 0.13 * Math.sin(((u - 0.72) / 0.28) * Math.PI);
        flat = 1 - e;
      }
      const d = (rising ? newD[k] : oldD[k]) % 10;
      plateDigit(g, (d + 10) % 10, bx + (BANK_W - DIG_W) / 2, by, DIG_W, DIG_H, { flat: clamp(flat, 0, 1) });
      // the spark where the shot struck it
      const spark = clamp(1 - (xs - cx) / 16, 0, 1);
      if (spark > 0 && spark < 1) {
        const sy2 = by + 2, sx2 = cx;
        for (let r2 = 3; r2 <= 5 + spark * 4; r2 += 1.7)
          for (const [dx2, dy2] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) g.pixel(sx2 + dx2 * r2, sy2 + dy2 * r2, 1);
      }
    }

    // -- the shot that crosses the banks at the turn, knocking them flat
    if (xs > -14 && xs < 142) {
      const p = clamp((xs + 12) / 152, 0, 1);
      const sy = BANK_Y + oy + DIG_H * 0.52 - 5.5 * Math.sin(Math.PI * p);
      for (let s2 = 1; s2 <= 4; s2++) {
        const px = xs - s2 * 3.2, py = sy + s2 * 0.5;
        if (px > -8 && dither(Math.round(px), Math.round(py), 0.5 / s2)) g.pixel(px, py, 1);
      }
      g.fillCircle(xs + ox, sy, BR + 1, 0);
      g.fillCircle(xs + ox, sy, BR + 0.4, 1);
    }

    // -- the bumpers, their lamps and their skirts
    for (let i = 0; i < BUMPERS.length; i++) {
      const c = BUMPERS[i];
      let lam = -9;
      for (let n = 0; n < nBalls; n++) lam = Math.max(lam, LAMPS[n][i]);
      const age = T - lam;
      let flash = age >= 0 && age < 0.22 ? 1 - age / 0.22 : (lam < 0 ? 0.25 + 0.25 * Math.sin(T * 2 + i) : 0);
      // on the hour the lamps chase round the bumpers: a multiball starting
      if (hour && tau > -1.4 && tau < 1.8 && Math.floor((tau + 1.4) * 9) % 3 === i) flash = 1;
      const x = c.x + ox, y = c.y + oy;
      g.ring(x, y, BUMPER_R - 1.3, BUMPER_R, 1);
      g.ring(x, y, BUMPER_R + 0.4, BUMPER_R + 1.2, dither(x, y, 0.45) ? 1 : 0);
      g.fillCircle(x, y, 2.4, 1);
      g.fillCircle(x, y, 1, 0);
      if (flash > 0) {
        const rr = BUMPER_R + 1.9;
        g.ring(x, y, rr - 1.1, rr, dither(x, y, clamp(flash + 0.25, 0, 1)) ? 1 : 0);
        g.ring(x, y, 2.4, 3.4, dither(x, y, flash) ? 1 : 0);
      }
    }

    // -- the apron the ball runs down, the slingshots over the flippers
    for (const [ax, ay, bx, by] of [SEGS[2], SEGS[3]]) g.line(ax + ox, ay + oy, bx + ox, by + oy, dither(ax, ay, 0.4) ? 1 : 0);
    for (let i = 4; i < 6; i++) {
      const [ax, ay, bx, by] = SEGS[i];
      const mx = (ax + bx) / 2 + (by - ay) * 1.5, my = (ay + by) / 2 - (bx - ax) * 1.5;
      g.fillPolygon([[ax + ox, ay + oy], [bx + ox, by + oy], [mx + ox, my + oy]], 0);
      g.thickLine(ax + ox, ay + oy, bx + ox, by + oy, 2.2, 1);
      g.thickLine(mx * 0.72 + ox + ((ax + bx) / 2) * 0.28, my * 0.72 + oy + ((ay + by) / 2) * 0.28,
        mx + ox, my + oy, 1.2, 1);
    }
    for (let i = 0; i < 2; i++) {
      const a = flipperAngle(i, T);
      const [ax, ay, bx, by] = flipperBlade(i, a);
      g.thickLine(ax + ox, ay + oy, bx + ox, by + oy, 5, 0);
      g.thickLine(ax + ox, ay + oy, bx + ox, by + oy, 3.6, 1);
      g.thickLine(ax + ox, ay + oy, bx + ox, by + oy, 1.2, 0);
    }
    g.fillCircle(FLIP[0].hx + ox, FLIP[0].hy + oy, 1.6, 1);
    g.fillCircle(FLIP[1].hx + ox, FLIP[1].hy + oy, 1.6, 1);
    for (const b of balls) {
      for (let s = 1; s <= 3; s++) {
        const px = b.x - b.vx * s * 0.012 + ox, py = b.y - b.vy * s * 0.012 + oy;
        if (dither(Math.round(px), Math.round(py), 0.34 / s)) g.pixel(px, py, 1);
      }
      if (b.x < 114 && b.y < 62) {
        g.fillCircle(b.x + ox, b.y + oy, BR + 0.9, 0);
        g.fillCircle(b.x + ox, b.y + oy, BR, 1);
      }
    }

    ctx.oled.contrast(0xcf + (0x20 - 0xcf) * ctx.night);
  },
};
