// Bowling: three stacked strips are three bowling lanes seen from above,
// bowled from the right; the seams are the gutters. At the far (left) end
// of the top two lanes stand the pins, and the pins left standing are the
// time: hours on lane 1, minutes on lane 2, every pin one ivory LED with a
// crimson neck. The bottom lane is an ordinary lane with an ordinary
// ten-pin rack, bowled all day, so you can see what the pins are.
//
// Each lane's deck holds two racks: the tens at the back, a pit trench, the
// ones in front, nearest the bowler. At the minute the sweep bar clears the
// old digit into the trench, the pinsetter lowers a full 5 x 7 block of
// pins, and a ball rolls in with a hook and strikes it. Every pin falls
// except the new digit: the survivors teeter and stay up. Knocked pins
// spin into the trench or lie in the gutter as deadwood until a gutter ball
// shoves them into the pit. The hour is cosmic bowling: blacklight, all
// three lanes strike at once, confetti, and an X on every lane.
//
// Stateless: every ball, pin and bar is a closed-form function of the clock
// (episodes cached by the minute they happen in).
import * as kit from '../js/kit.js';

// ------------------------------------------------------------- geometry
const X = (c) => -46.5 + 3 * c;                       // column -> mm
const Y = (lane, r) => -34.9 + 24.4 * lane + 3 * r;   // lane (strip), row -> mm
const PIT = X(0) + 1.5, TRENCH = X(6) + 1.5;          // pins left of these fall in
const FRONT = X(12);                                  // front edge of the pin deck
const SLOT_COL = [1, 7];                              // tens rack, ones rack
const GUTTER_X = [[X(1) - 1, X(5) - 1], [X(7), X(11) + 1]];   // where each rack's deadwood may lie
const BALL_R = 3.3;
// the turn, relative to the minute: sweep, lower the block, roll, hit
const SW0 = -0.15, SW1 = 0.15, RACK = 0.15, LOWER = 0.28, HIT = 0.62, ROLL = 0.9;

// ---------------------------------------------------------------- racks
// Ten digits for a 5 x 7 rack, one pin per LED, drawn on the pin's own
// silhouette where they can be: a narrow head over a full belly (2, 3, 5,
// 6), and an 8 that is simply a bowling pin.
const FONT = {
  0: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  1: ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  2: ['.###.', '.#.#.', '...#.', '..#..', '.#...', '#....', '#####'],
  3: ['.###.', '.#.#.', '...#.', '..##.', '....#', '#...#', '.###.'],
  4: ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  5: ['.####', '.#...', '.###.', '....#', '....#', '#...#', '.###.'],
  6: ['..##.', '.#...', '.#...', '####.', '#...#', '#...#', '.###.'],
  7: ['#####', '....#', '...#.', '..#..', '..#..', '.#...', '.#...'],
  8: ['.###.', '.#.#.', '.###.', '#...#', '#...#', '#...#', '.###.'],
  9: ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
};
const isPin = (d, c, r) => FONT[d][r][c] === '#';
// the ordinary ten-pin rack on lane 3, apex towards the bowler
// (at the back of its deck, so lane 3 is a long, plain lane)
const TENPIN = [[4, 3], [3, 2], [3, 4], [2, 1], [2, 3], [2, 5], [1, 0], [1, 2], [1, 4], [1, 6]];
const L3_FRONT = X(5), L3_GUTTER = [X(1) - 1, X(4) + 1];
const LEAVES = [[], [], [], [], [9], [6], [6, 9], [3, 6], [5, 9], [4], [7], [2, 4, 8], [3, 5, 6, 9], [5, 8], [1, 3, 6]];

// -------------------------------------------------------------- palette
// maple: red and green only, so the dim wood never rounds a stray blue
const MAPLE = [1, 0.4, 0], MAPLE2 = [1, 0.33, 0.0], APPROACH = [1, 0.5, 0.02];
const IVORY = kit.hex('#fff1d8'), NECK = kit.hex('#e0101a');
const STEEL = kit.hex('#8fa6c8');
const BALLS = [
  [kit.hex('#00b07a'), kit.hex('#ffd040')],           // lane 1: emerald, gold swirl
  [kit.hex('#8a22ff'), kit.hex('#ff4fa8')],           // lane 2: violet, pink swirl
  [kit.hex('#1048ff'), kit.hex('#30e0ff')],           // lane 3: royal blue, cyan
];
// cosmic bowling (the hour): blacklight
const UV_FLOOR = kit.hex('#2a0a6a'), UV_PIN = kit.hex('#d8e0ff'), UV_NECK = kit.hex('#ff20c0');
const NEON = [kit.hex('#ff2fb0'), kit.hex('#20f0ff'), kit.hex('#d0ff20'), kit.hex('#ff9020')];

const pad = (n) => String(n).padStart(2, '0');
const digitsOf = (lane, T) => { const d = new Date(T * 1000); return lane === 0 ? pad(d.getHours()) : pad(d.getMinutes()); };
const changesAt = (lane, slot, T) => digitsOf(lane, T - 60)[slot] !== digitsOf(lane, T)[slot];
/** The minute (epoch s) at which this rack last changed, at or before minute M. */
function lastChange(lane, slot, M) {
  const d = new Date(M * 1000), mi = d.getMinutes(), h = d.getHours();
  if (lane === 1) return slot ? M : M - (mi % 10) * 60;
  return slot ? M - mi * 60 : M - mi * 60 - (h % 10) * 3600;
}
// --------------------------------------------------------------- motion
/** Ball at time t: { x, y, a, dist } or null. A hook from (x0, y0) into (xHit, yHit). */
function ballAt(b, t) {
  if (t < b.tR) return null;
  if (b.gutter) {
    const x = b.x0 - b.v * (t - b.tR);
    if (x < b.xEnd - 3) return null;
    return { x, y: b.y0, a: kit.clamp(1 - (b.xEnd - x) / 3), dist: b.x0 - x };
  }
  const D = b.tHit - b.tR;
  if (t < b.tHit) {
    const u = (t - b.tR) / D, s = 1.12 * u - 0.12 * u * u;
    const x = b.x0 + (b.xHit - b.x0) * s;
    return { x, y: hookY(b, s), a: 1, dist: b.x0 - x };
  }
  // after the hit it ploughs on into the pins and drops out of sight
  const v1 = ((b.x0 - b.xHit) * 0.88 / D) * 0.45, tau = t - b.tHit, x = b.xHit - v1 * tau;
  const a = 1 - kit.smoothstep(0, 0.22, tau);
  return a > 0 ? { x, y: b.yHit, a, dist: b.x0 - x } : null;
}
const hookY = (b, s) => b.yHit + (b.y0 - b.yHit) * (1 - s) + b.bulge * Math.sin(Math.PI * s ** 1.4);
/** When the ball passed x (before its hit), and where it was: for the oil track. */
function ballPassed(b, x) {
  if (b.gutter) return [b.tR + (b.x0 - x) / b.v, b.y0];
  const s = (x - b.x0) / (b.xHit - b.x0);
  if (s < 0 || s > 1) return null;
  const u = (1.12 - Math.sqrt(1.2544 - 0.48 * s)) / 0.24;
  return [b.tR + u * (b.tHit - b.tR), hookY(b, s)];
}
/** Fold y into [a, b]: pins bounce off the lane's sides. */
function fold(y, a, b) {
  const L = b - a, u = (((y - a) % (2 * L)) + 2 * L) % (2 * L);
  return a + (u < L ? u : 2 * L - u);
}
const barX = (b, t) => kit.lerp(b.x0, b.x1, kit.ease.inOut(kit.clamp((t - b.t0) / (b.t1 - b.t0))));

/**
 * A pin at time t: { x, y, th, fallen 0..1, a (alpha), low (lowered 0..1), g } or null.
 * Knocked pins glide to a chosen resting place (x0 -> xf) on an eased,
 * slightly bent path, spinning to thf: closed form, no simulation.
 */
const K = 2.4;
function pinAt(p, t, wob) {
  if (t < p.tA) return null;
  const low = kit.ease.out(kit.clamp((t - p.tA) / LOWER));
  let x = p.x0, y = p.y0, th = p.th0, fallen = 0, g = 0;
  if (t >= p.tK) {
    const tau = t - p.tK;
    g = 1 - Math.exp(-K * tau);
    x += (p.xf - p.x0) * g; y += (p.yf - p.y0) * g + p.bend * Math.sin(Math.PI * g);
    if (!p.gutter) y = fold(y, Y(p.lane, 0) - 0.5, Y(p.lane, 6) + 0.5);   // off the kickbacks
    th += (p.thf - p.th0) * g;
    fallen = kit.smoothstep(0, 0.14, tau);
  } else {
    if (wob) x += wob(p, t);
    if (p.teeter && t > p.teeter.t) {
      const tau = t - p.teeter.t;
      x += p.teeter.amp * Math.exp(-p.teeter.k * tau) * Math.sin(p.teeter.w * tau);
    }
  }
  if (p.bar && t > p.bar.t0 - 0.05) {
    const bx = barX(p.bar, t) - 1.3;
    if (x > bx) { if (t < p.tK) fallen = Math.max(fallen, kit.smoothstep(0, 2, x - bx)); x = bx; }
  }
  if (p.clear && t > p.clear.tR) x = Math.min(x, p.clear.x0 - p.clear.v * (t - p.clear.tR) - 4.5);
  const a = kit.clamp(1 - (p.pit - x) / 1.8);
  if (a <= 0) return null;
  return { x, y, th, fallen, a, low, g };
}

// ------------------------------------------------------------- episodes
const cache = new Map();
function cached(key, make) {
  let v = cache.get(key);
  if (!v) { v = make(); cache.set(key, v); if (cache.size > 80) cache.delete(cache.keys().next().value); }
  return v;
}

function mkPin(lane, c, r, slot, pit) {
  return { lane, slot, x0: X(c), y0: Y(lane, r), tA: -Infinity, tK: Infinity, pit, bar: null, clear: null, th0: 0 };
}
const aimOf = (lane, T) => Y(lane, 3) + (kit.hash(T, lane, 9) - 0.5) * 2;

/** A ball thrown on `lane` to hit (xHit, yAim) at tHit. */
function throwBall(lane, tHit, xHit, yAim, seed) {
  const yc = Y(lane, 3), side = kit.hash(seed, 3) < 0.5 ? -1 : 1;
  return {
    lane, tR: tHit - ROLL, tHit, x0: 52, xHit,
    y0: yc + side * (3 + 2 * kit.hash(seed, 4)), yHit: yAim, bulge: side * (1.5 + 1.5 * kit.hash(seed, 5)),
  };
}
const gutterBall = (lane, tR, v = 46) => ({ lane, gutter: true, tR, x0: 54, v, y0: Y(lane, 7), xEnd: PIT - 1.5 });
/** The gutter balls the bowlers on lanes 1 and 2 throw during minute M (they only ever hit on the minute). */
function guttersOf(lane, M) {
  const m = Math.round(M / 60), out = [];
  if (kit.hash(m, lane, 77) < 0.6) out.push(gutterBall(lane, M + 12 + 12 * kit.hash(m, lane, 78), 40 + 12 * kit.hash(m, lane, 79)));
  if (kit.hash(m, lane, 87) < 0.6) out.push(gutterBall(lane, M + 32 + 14 * kit.hash(m, lane, 88), 40 + 12 * kit.hash(m, lane, 89)));
  return out;
}
/** The first gutter ball on lane after time t: it shoves the deadwood into the pit. */
function clearOf(lane, t) {
  for (let M = Math.floor(t / 60) * 60, k = 0; k < 720; k++, M += 60) {
    for (const g of guttersOf(lane, M)) if (g.tR > t) return g;
  }
  return null;
}

/**
 * Knock `pins` from an impact at (ix, iy) at time t. Each pin is sent to a
 * resting place: the pit behind its rack, or the gutter as deadwood.
 */
function knock(pins, ix, iy, t, seed, { gutterX, pit, power = 1 }) {
  pins.forEach((p, k) => {
    const h1 = kit.hash(seed, k, 1), h2 = kit.hash(seed, k, 2), h3 = kit.hash(seed, k, 3);
    const dx = p.x0 - ix, dy = p.y0 - iy, d = Math.hypot(dx, dy) || 1;
    p.tK = t + d / 42 + 0.05 * h1;
    p.th0 = Math.atan2(dy * 1.3, dx - 6) + (h2 - 0.5);
    const row = (p.y0 - Y(p.lane, 0)) / 3;
    if (gutterX && row >= 3.5 && h2 < 0.45) {          // into the gutter: deadwood
      p.gutter = true;
      p.xf = kit.clamp(p.x0 - 4 * power * h3, gutterX[0], gutterX[1]);
      p.yf = Y(p.lane, 7) + 0.3;
      p.thf = (h1 < 0.5 ? 0 : Math.PI) + (h3 - 0.5) * 0.4 + Math.round((p.th0) / Math.PI) * Math.PI;
      p.bend = (h1 - 0.5) * 3;
    } else {                                            // over the back into the pit
      p.xf = pit - 4 - 8 * h3 * power;
      p.yf = kit.clamp(p.y0 + dy * 0.8 * power + (h1 - 0.5) * 8, Y(p.lane, 0), Y(p.lane, 6));
      p.thf = p.th0 + (h1 - 0.5) * 16;
      p.bend = (h2 - 0.5) * 22 * power;
    }
  });
}

/** One rack's strike at minute T: the block that is lowered, and what stays up. */
function slotStrike(lane, slot, T) {
  return cached(`s${lane}${slot}:${T}`, () => {
    const b = digitsOf(lane, T)[slot], c0 = SLOT_COL[slot], pit = slot ? TRENCH : PIT;
    const block = [], down = [];
    for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) {
      const p = mkPin(lane, c0 + c, r, slot, pit);
      p.tA = T + RACK + 0.012 * (4 - c + 5 * slot) + 0.05 * kit.hash(c, r, T);
      block.push(p);
      if (!isPin(b, c, r)) down.push(p);
    }
    const ix = X(11) + 0.4, iy = aimOf(lane, T), seed = T * 7 + lane * 3 + slot;
    knock(down, ix, iy, T + HIT, seed, { gutterX: GUTTER_X[slot], pit, power: slot ? 1 : 0.8 });
    for (const p of down) if (p.gutter) p.clear = clearOf(lane, p.tK + 1.5);
    // the survivors teeter: most settle at once, one or two take their time
    block.filter((p) => !down.includes(p)).forEach((p, k) => {
      const d = Math.hypot(p.x0 - ix, p.y0 - iy), h = kit.hash(seed, k, 21);
      p.teeter = { t: T + HIT + d / 55, amp: h < 0.18 ? 1.1 : 0.45, k: h < 0.18 ? 1.6 : 5, w: 24 + 10 * kit.hash(seed, k, 22) };
    });
    return block;
  });
}

/** Lane 1 or 2 at minute T, when its ones rack (and maybe its tens) change. */
function laneTurn(lane, T) {
  return cached(`t${lane}:${T}`, () => {
    const struck = [changesAt(lane, 0, T), changesAt(lane, 1, T)];
    const ep = { pins: [], balls: [], bars: [] };
    if (!struck[1]) return ep;
    const a = digitsOf(lane, T - 60), yAim = aimOf(lane, T);
    ep.balls.push(throwBall(lane, T + HIT, X(11) + BALL_R + 0.4, yAim, T * 3 + lane));
    const bar = { lane, t0: T + SW0, t1: T + SW1, x0: FRONT + 1.5, x1: struck[0] ? X(0) - 2.5 : X(6) - 1 };
    ep.bars.push(bar);
    for (const slot of [0, 1]) {
      if (!struck[slot]) continue;
      const pit = slot ? TRENCH : PIT, c0 = SLOT_COL[slot];
      // the old digit, and the deadwood its own strike left in the gutter
      for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) if (isPin(a[slot], c, r)) {
        const p = mkPin(lane, c0 + c, r, slot, pit); p.bar = bar; ep.pins.push(p);
      }
      for (const q of slotStrike(lane, slot, lastChange(lane, slot, T - 60))) {
        if (!q.gutter || (q.clear && q.clear.tR < T)) continue;
        ep.pins.push({ ...q, bar });
      }
      ep.pins.push(...slotStrike(lane, slot, T));
    }
    return ep;
  });
}
/** Lane 3: one frame of bowling starting at S (two balls if needed), or the hour's strike at S. */
function frameEpisode(S, hourStrike) {
  return cached(`f:${S}:${hourStrike ? 1 : 0}`, () => {
    const lane = 2, seed = Math.round(S * 7) + 11;
    const ep = { pins: [], balls: [], bars: [], src: [] };
    const rack = TENPIN.map(([c, r]) => mkPin(lane, c, r, 1, PIT));
    const tHit1 = hourStrike ? S : S + ROLL;
    const leave = hourStrike ? [] : LEAVES[Math.floor(kit.hash(seed, 1) * LEAVES.length)];
    const yAim1 = Y(lane, 3) + (leave.length ? (kit.hash(seed, 2) - 0.5) * 5 : (kit.hash(seed, 2) - 0.5) * 1.5);
    const xHit1 = X(4) + BALL_R + 0.4;
    ep.balls.push(throwBall(lane, tHit1, xHit1, yAim1, seed));
    const down = rack.filter((_, k) => !leave.includes(k)), stay = rack.filter((_, k) => leave.includes(k));
    const opts = { gutterX: L3_GUTTER, pit: PIT, power: hourStrike ? 1.4 : 1 };
    knock(down, xHit1 - BALL_R, yAim1, tHit1, seed, opts);
    ep.src.push({ t: tHit1, x: xHit1 - BALL_R, y: yAim1, amp: 1.4 });
    let tSweep = tHit1 + (hourStrike ? 0.6 : 0.8);
    if (stay.length) {
      const tHit2 = S + 4.5;
      if (kit.hash(seed, 5) < 0.7) {                       // the spare
        const xf = Math.max(...stay.map((p) => p.x0)), yA = stay.reduce((s, p) => s + p.y0, 0) / stay.length;
        const yB = kit.clamp(yA, Y(lane, 0) + 2, Y(lane, 6) - 2);
        ep.balls.push(throwBall(lane, tHit2, xf + BALL_R + 0.4, yB, seed + 1));
        knock(stay, xf - 0.5, yA, tHit2, seed + 1, opts);
        ep.src.push({ t: tHit2, x: xf, y: yA, amp: 1 });
        tSweep = tHit2 + 0.8;
      } else {                                             // into the gutter, and the deadwood with it
        const g = gutterBall(lane, tHit2 - ROLL, 44);
        ep.balls.push(g);
        for (const p of down) if (p.gutter) p.clear = g;
        tSweep = g.tR + (g.x0 - PIT) / g.v + 0.2;
      }
    }
    const bar = { lane, t0: tSweep, t1: tSweep + 0.35, x0: L3_FRONT + 1.5, x1: X(0) - 2.5 };
    ep.bars.push(bar);
    for (const p of rack) { p.bar = bar; ep.pins.push(p); }
    for (const [c, r] of TENPIN) {
      const p = mkPin(lane, c, r, 1, PIT);
      p.tA = bar.t1 + 0.08 + 0.02 * (4 - c) + 0.03 * kit.hash(c, r, seed);
      ep.pins.push(p);
    }
    return ep;
  });
}

/** Lane 3's episode at time now (minute M starting at epoch M). */
function lane3(now, M, minute) {
  const s = now - M;
  if (minute === 0 && s < 2) return frameEpisode(M + HIT, true);
  if (s < 2) return frameEpisode(M - 8, false);
  return frameEpisode(M + 2 + 10 * Math.min(5, Math.floor((s - 2) / 10)), false);
}
// ----------------------------------------------------------------- draw
let ground = null;          // static wood per LED, and region codes
function buildGround(ctx) {
  const n = ctx.n, g = { n, col: new Float32Array(3 * n), kind: new Uint8Array(n) };
  // kind: 0 black (pit, trench, deck), 2 lane, 3 arrow, 4 foul line, 5 approach, 6 gutter
  for (const l of ctx.leds) {
    const c = l.col, r = l.row, lane = l.panel;
    let kind;
    if (r === 7) kind = 6;
    else if (c <= (lane === 2 ? 4 : 11)) kind = 0;
    else if (c === 28) kind = 4;
    else if (c > 28) kind = 5;
    else kind = c === 19 + Math.abs(r - 3) ? 3 : 2;
    g.kind[l.i] = kind;
    // planks: each row is a board with its own tone; grain runs along the lane
    const board = 0.8 + 0.4 * kit.hash(r, lane, 5);
    const grain = 0.85 + 0.4 * kit.fbm(l.x * 0.05, r * 1.7 + lane * 9, 0.5, 3);
    const tone = kit.mix(MAPLE, MAPLE2, kit.hash(r, lane, 8));
    let col = [0, 0, 0];
    if (kind === 2) col = kit.scale(tone, 0.13 * board * grain * (0.8 + 0.3 * kit.clamp((c - 12) / 16, -0.3, 1)));
        if (kind === 5) col = kit.scale(APPROACH, 0.12 * (0.9 + 0.2 * kit.hash(c, r, lane)) * ((c === 30 && r % 2 === 1) ? 0.4 : 1));
    g.col.set(col, 3 * l.i);
  }
  return g;
}

/** Cosmic-bowling level for the hour around `now`. */
function cosmicOf(now, M, minute) {
  if (minute === 59) return kit.smoothstep(M + 60 - 1.2, M + 60 - 0.4, now);
  if (minute === 0) return 1 - kit.smoothstep(M + 7.5, M + 9.5, now);
  return 0;
}

/** Pin wobble along x from impacts, passing gutter balls and thumps from the next lane. */
function makeWobble(srcs, balls, shakes) {
  return (p, t) => {
    let w = 0;
    for (const s of srcs) {
      const d = Math.hypot(p.x0 - s.x, p.y0 - s.y), tau = t - s.t - d / 90;
      if (tau > 0 && tau < 1.5) w += s.amp * Math.exp(-4 * tau) * Math.sin(30 * tau) * Math.exp(-d / 14);
    }
    for (const b of balls) {
      if (!b.gutter) continue;
      const tau = t - (b.tR + (b.x0 - p.x0) / b.v), d = Math.abs(p.y0 - b.y0);
      if (tau > 0 && tau < 1.2) w += 0.6 * Math.exp(-4 * tau) * Math.sin(34 * tau) * Math.exp(-d / 6);
    }
    for (const s of shakes) {
      const tau = t - s.t - 0.05;
      if (tau > 0 && tau < 1) w += 0.3 * Math.exp(-5 * tau) * Math.sin(26 * tau + 9 * kit.hash(p.x0 * 3, p.y0 * 3));
    }
    return w;
  };
}

export default {
  name: 'Bowling',
  blurb: 'the pins left standing are the time; each minute a ball strikes a fresh rack and only the new digit survives',
  layouts: ['strip-x3'], look: { look: 'opal', gap: 1.0 }, fps: 60, brightness: 0.8, dither: true,
  frame(ctx) {
    if (!ground || ground.n !== ctx.n) ground = buildGround(ctx);
    const { out, leds, n } = ctx;
    const now = ctx.date.getTime() / 1000, M = Math.floor(now / 60) * 60, minute = ctx.date.getMinutes();
    const dim = 1 - 0.65 * ctx.night;
    const cos = cosmicOf(now, M, minute);

    // ---- what is on each lane right now
    const pins = [[], [], []], balls = [[], [], []], bars = [[], [], []], src = [[], [], []];
    for (const lane of [0, 1]) {
      for (const slot of [0, 1]) {
        const E = now >= M + 60 + SW0 - 0.3 && changesAt(lane, slot, M + 60) ? laneTurn(lane, M + 60) : laneTurn(lane, lastChange(lane, slot, M));
        for (const p of E.pins) if (p.slot === slot) pins[lane].push(p);
      }
      for (const E of [laneTurn(lane, M), laneTurn(lane, M + 60)]) {
        balls[lane].push(...E.balls); bars[lane].push(...E.bars);
        for (const b of E.balls) src[lane].push({ t: b.tHit, x: b.xHit - BALL_R, y: b.yHit, amp: 0.9 });
      }
      balls[lane].push(...guttersOf(lane, M));
    }
    const e3 = lane3(now, M, minute);
    pins[2] = e3.pins; balls[2] = [...e3.balls]; bars[2] = e3.bars; src[2] = e3.src;
    if (minute === 59) balls[2].push(...frameEpisode(M + 60 + HIT, true).balls);

    // ---- the floor: maple under lane lights, or blacklight at the hour
    const gl = 1 - cos;
    for (const l of leds) {
      const i = l.i, k = ground.kind[i];
      let r = ground.col[3 * i] * gl, g = ground.col[3 * i + 1] * gl, b = ground.col[3 * i + 2] * gl;
      if (k === 2 || k === 5) {
        // gloss: the ceiling lights' reflections drift slowly along the lane
        const ph = now * 0.05 + l.panel * 0.31;
        const gx = X(14) + 40 * (0.5 + 0.5 * Math.sin(ph * kit.TAU)), gy = Y(l.panel, 3) + 4 * Math.sin(ph * 5.1);
        const gloss = Math.exp(-(((l.x - gx) / 9) ** 2) - (((l.y - gy) / 4) ** 2));
        r += 0.05 * gloss * gl; g += 0.035 * gloss * gl; 
        // the oil track a ball leaves, fading
        if (k === 2) for (const bl of balls[l.panel]) {
          if (bl.gutter) continue;
          const pp = ballPassed(bl, l.x);
          if (!pp) continue;
          const age = now - pp[0];
          if (age < 0 || age > 6) continue;
          const w = Math.exp(-(((l.y - pp[1]) / 2.4) ** 2)) * (1 - age / 6) ** 2;
          r += 0.06 * w * gl; g += 0.045 * w * gl;
        }
      }
      if (cos > 0) {
        if (k === 2) { const v = 0.016 * (0.7 + 0.3 * Math.sin(l.x * 0.2 - now * 3)); r += UV_FLOOR[0] * v * cos; g += UV_FLOOR[1] * v * cos; b += UV_FLOOR[2] * v * cos; }
        if (k === 3) { const c = NEON[1]; r += c[0] * 0.25 * cos; g += c[1] * 0.25 * cos; b += c[2] * 0.25 * cos; }
        if (k === 4) { const c = NEON[0], v = 0.18 * (0.6 + 0.4 * Math.sin(now * 6 + l.row)); r += c[0] * v * cos; g += c[1] * v * cos; b += c[2] * v * cos; }
      }
      out[3 * i] = r * dim; out[3 * i + 1] = g * dim; out[3 * i + 2] = b * dim;
    }

    // ---- sweep bars
    for (const list of bars) for (const bar of list) {
      const vis = kit.smoothstep(bar.t0 - 0.2, bar.t0, now) * (1 - kit.smoothstep(bar.t1, bar.t1 + 0.2, now));
      if (vis <= 0) continue;
      const bx = barX(bar, now), y0 = Y(bar.lane, 0) - 0.5, y1 = Y(bar.lane, 7) + 0.5;
      for (const i of ctx.layout.index.near(bx, (y0 + y1) / 2, (y1 - y0) / 2 + 3)) {
        const l = leds[i];
        if (l.y < y0 - 1 || l.y > y1 + 1) continue;
        kit.add(ctx, i, STEEL, 0.25 * vis * dim * (1 - kit.smoothstep(0.4, 2.0, Math.abs(l.x - bx))));
      }
    }

    // ---- pins
    const cov = new Float32Array(n), halo = new Float32Array(n), fb = new Float32Array(3 * n);
    const pinCol = kit.mix(IVORY, UV_PIN, cos), neckCol = kit.mix(NECK, UV_NECK, cos);
    const pinLevel = (0.45 + 0.2 * cos) * dim;
    for (let lane = 0; lane < 3; lane++) {
      const wob = makeWobble(src[lane], balls[lane], lane < 2 ? src[2] : []);
      for (const p of pins[lane]) {
        const q = pinAt(p, now, wob);
        if (!q) continue;
        const a = q.a * q.low * pinLevel;
        if (q.fallen < 0.02) {
          const rr = kit.lerp(4, 3, q.low);
          for (const i of ctx.layout.index.near(q.x, q.y, rr)) {
            const l = leds[i], d = Math.hypot(l.x - q.x, l.y - q.y) / rr, f = (1 - d * d) ** 2;
            kit.add(ctx, i, pinCol, a * f); cov[i] += f;
          }
          for (const i of ctx.layout.index.near(q.x, q.y, 4.6)) {
            const l = leds[i], d = Math.hypot(l.x - q.x, l.y - q.y) / 4.6, f = (1 - d * d) ** 1.5 * q.a * q.low ** 3;
            if (f > halo[i]) halo[i] = f;
          }
        } else {
          drawFallen(ctx, q, pinCol, neckCol, a * 0.8 * (p.gutter ? 1 - 0.8 * q.g : 1), cov, fb);
        }
      }
    }
    for (let k = 0; k < 3 * n; k++) out[k] += fb[k];
    const hl = (0.16 + 0.1 * cos) * dim;
    for (let i = 0; i < n; i++) if (halo[i] > 0.25) kit.add(ctx, i, neckCol, hl * halo[i] * kit.clamp(1 - 1.6 * cov[i]));

    // ---- balls
    balls.forEach((list, lane) => {
      const [c1, c2] = BALLS[lane];
      for (const b of list) {
        const p = ballAt(b, now);
        if (!p) continue;
        const R = b.gutter ? 2.6 : BALL_R, lvl = (0.85 + 0.2 * cos) * dim * p.a;
        const body = kit.mix(c1, NEON[(lane + 2) % 4], cos * 0.6);
        for (const i of ctx.layout.index.near(p.x, p.y, R + 1.4)) {
          const l = leds[i], d = Math.hypot(l.x - p.x, l.y - p.y);
          kit.over(ctx, i, kit.scale(body, lvl), p.a * (1 - kit.smoothstep(R - 1.4, R + 1.4, d)));
        }
        // spin: a swirl on the ball rolls over the top
        const phi = p.dist / R + lane, vis = Math.max(0, Math.cos(phi));
        kit.splat(ctx, p.x - Math.sin(phi) * R * 0.6, p.y + 0.6 * Math.sin(phi * 0.5), 2.4, c2, lvl * 0.9 * vis);
        // the crash: a flash where it meets the pins
        if (!b.gutter && now > b.tHit && now < b.tHit + 0.25) kit.splat(ctx, b.xHit - R - 1, b.yHit, 6, IVORY, 0.35 * (1 - (now - b.tHit) / 0.25) ** 2 * dim);
        // sheen from the lane lights
        kit.splat(ctx, p.x + 0.8, p.y - 1, 2.2, [1, 0.95, 0.85], lvl * 0.35);
      }
    });

    if (cos > 0) hourShow(ctx, now, M, minute, cos, dim);
  },
};
/** A toppled pin: a short capsule, ivory belly, crimson neck, ivory head. */
function drawFallen(ctx, q, pinCol, neckCol, a, cov, fb) {
  const len = 3 + 4.5 * q.fallen, ux = Math.cos(q.th), uy = Math.sin(q.th);
  for (const i of ctx.layout.index.near(q.x, q.y, len / 2 + 2.6)) {
    const l = ctx.leds[i], dx = l.x - q.x, dy = l.y - q.y;
    const u = (dx * ux + dy * uy) / len, d = Math.abs(-dx * uy + dy * ux);
    const uc = kit.clamp(u, -0.5, 0.5), along = Math.abs(u - uc) * len;
    const rad = uc < 0.1 ? 1.4 : uc < 0.3 ? 0.9 : 1.1;
    const f = 1 - kit.smoothstep(rad - 0.6, rad + 1.6, Math.hypot(d, along));
    if (f <= 0) continue;
    const isNeck = uc > 0.08 && uc < 0.3, c = isNeck ? neckCol : pinCol, v = a * f * (isNeck ? 0.7 : 1);
    // fallen pins pile up: keep the brightest, don't add (no white blobs)
    for (let k = 0; k < 3; k++) if (c[k] * v > fb[3 * i + k]) fb[3 * i + k] = c[k] * v;
    cov[i] = Math.max(cov[i], f);
  }
}

/** The hour: confetti from the decks, and a strike mark (X) on every lane. */
function hourShow(ctx, now, M, minute, cos, dim) {
  if (minute !== 0) return;
  const tau = now - (M + HIT + 0.05);
  if (tau < 0) return;
  for (let k = 0; k < 54; k++) {
    const lane = k % 3, h1 = kit.hash(k, 1, M), h2 = kit.hash(k, 2, M), h3 = kit.hash(k, 3, M);
    const life = 3.5 + 3 * h3, ts = tau - 0.25 * h2;
    if (ts < 0 || ts > life) continue;
    const vx = 25 + 70 * h1, vy = (h2 - 0.5) * 50, f = (1 - Math.exp(-1.4 * ts)) / 1.4;
    const x = X(5 + 6 * h3) + vx * f + 2 * Math.sin(ts * 5 + k);
    const y = Y(lane, 3) + vy * f + 1.8 * ts * ts + 1.5 * Math.sin(ts * 7 + k * 2);
    const tw = 0.55 + 0.45 * Math.sin(ts * 14 + k * 1.7);
    const fade = (1 - kit.smoothstep(life - 1, life, ts)) * cos;
    kit.splat(ctx, x, y, 2.4, NEON[k % 4], 0.5 * tw * fade * dim);
  }
  // the turkey: three strikes at once
  const xa = X(23), xb = X(27);
  const vis = kit.smoothstep(0.4, 0.9, tau) * (1 - kit.smoothstep(5.5, 6.5, tau)) * cos;
  if (vis <= 0) return;
  for (let lane = 0; lane < 3; lane++) {
    const y0 = Y(lane, 0), y1 = Y(lane, 6), col = NEON[[0, 2, 3][lane]];
    const pulse = 0.75 + 0.25 * Math.sin(now * 8 - lane * 1.3);
    kit.drawStrokes(ctx, [[xa, y0, xb, y1], [xa, y1, xb, y0]], {
      width: 1.6, soft: 1.2,
      paint(l, d) { kit.add(ctx, l.i, col, 0.4 * vis * pulse * dim * (1 - kit.smoothstep(0.2, 2.0, d))); },
    });
  }
}
