// Pinball -- the table is the clock.
//
// A pinball table turned on its side: the top of the table is the left end of
// the glass, the flippers sit at the right, and the outhole is the last cell.
// The four numerals are banks of drop targets, one target per segment, every
// target on the cell grid. The colon is a pair of pop bumpers (ROM 'o', which
// flash '*' when struck). Gravity pulls the ball to the right, so every shot
// is a parabola: it hangs at the top of the table and falls back to a flipper,
// trailing the glass's own smear.
//
// All minute the flippers keep the ball in play off bumpers and targets. Near
// :56 the player traps the ball on a flipper, the bumpers start a chase (the
// hurry-up), and if it is on the wrong flipper he passes
// it across the drain to the other one. A beat before :00 he lets it drop and
// fires: the ball smashes the bank, every target in it drops flat,
// and when the last bank has been hit they all reset at once with the new
// digit standing. Mid-turn a bank is either the old digit or empty, never a
// half-dropped shape that reads as another digit.
//
// On the hour the bumpers kick out a second ball: multiball. One ball takes
// the minutes, the other the hours; the reset is a jackpot with the knocker
// (the whole glass flashes). Then the second ball heads down the middle, the
// player nudges the table twice -- the controller's display shift jolts the
// whole picture a cell sideways -- and it drains anyway.
//
// Everything is derived from the wall clock: each minute is a chain of shots
// computed from the minute's number, so any instant can be drawn on its own.
//
// Tiles: the targets are a five-part kit (left stroke, right stroke, top bar,
// low bar, both bars), the two flippers one tile each, the ball one: a 2x2
// ball that hops the cell gaps and the row seam, so it never straddles two. Eight at
// most. The second ball of multiball gets a slot only if one is free, and
// otherwise borrows ROM 0xa5 in an empty cell (it is moving fast then).

import { TileAllocator, noise } from '../js/kit.js';

const FPS = 12;
const W = 96, H = 16;
const G = 22;                  // gravity, glass columns / s^2, towards the flippers
const XF = 81;                 // ball's left column at the flippers (cell 13, dots 3-4)
const FLIP_CELL = 14;
const SLOTS = [0, 3, 7, 10];   // first cell of H1 H2 M1 M2; cell 6 is the bumpers
const BUMPER_CELL = 6;

const SEGS = {
  0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg',
  5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg',
};
const DIGIT_OF = new Map(Object.entries(SEGS).map(([d, s]) => [[...s].sort().join(''), +d]));
// Target of each segment: [cell offset, x0, x1, y0, y1] in dots.
const SEG = {
  a: [1, 0, 4, 0, 1], g: [1, 0, 4, 6, 7], d: [1, 0, 4, 14, 15],
  f: [0, 2, 4, 0, 7], e: [0, 2, 4, 8, 15],
  b: [2, 0, 2, 0, 7], c: [2, 0, 2, 8, 15],
};

// Flippers, upper one; the lower is its mirror. Pivot top left, by the wall.
const FLIP = {
  rest: ['.##..', '####.', '####.', '.###.', '..###', '...##', '....#', '.....'],
  mid:  ['.##..', '####.', '####.', '.###.', '.###.', '..##.', '..##.', '.....'],
  up:   ['.##..', '####.', '###..', '###..', '##...', '##...', '#....', '.....'],
};

// ------------------------------------------------------------------ helpers

const segsOf = (d) => new Set(SEGS[d]);
const isDigit = (set) => DIGIT_OF.has([...set].sort().join(''));
function digitsAt(ms) {
  const dt = new Date(ms);
  const h = dt.getHours(), m = dt.getMinutes();
  return [Math.floor(h / 10), h % 10, Math.floor(m / 10), m % 10];
}

function bounceY(v) {               // ball's top row, reflected between the walls 0 and 14
  const span = 14, p = ((v % (2 * span)) + 2 * span) % (2 * span);
  return p <= span ? p : 2 * span - p;
}

const rnd = (k, i) => noise(k * 0.731 + i * 1.913, 7);

// A ballistic leg: x accelerates towards the flippers, y runs straight (unfolded
// over the walls).
function leg(t0, x0, vx, y0, vy, t1) { return { t0, t1, x0, vx, y0, vy }; }
function legAt(L, t) {
  const tau = t - L.t0;
  return { x: L.x0 + L.vx * tau + 0.5 * G * tau * tau, y: bounceY(L.y0 + L.vy * tau) };
}

/** Pick an unfolded y so a straight run from y0 ends on y1, maybe off a wall. */
function unfold(y0, y1, T, r) {
  const opts = [y1, -y1, 28 - y1].map((u) => ({ u, v: (u - y0) / T })).filter((o) => Math.abs(o.v) < 34);
  if (!opts.length || !Number.isFinite(T) || T <= 0) return y1;
  const i = Math.min(opts.length - 1, Math.max(0, Math.floor((Number.isFinite(r) ? r : 0) * opts.length)));
  return opts[i].u;
}

/**
 * A shot from the flippers at (XF, y0) at time t0 to point P, arriving after
 * `frac` of the time it would take to stall there (1 = it stalls exactly on P),
 * then back to the flippers at row yR. Returns legs and times.
 */
function shot(t0, y0, P, frac, yR, r, kick = 0) {
  return shotFrom(t0, XF, y0, frac * Math.sqrt((2 * (XF - P.x)) / G), P, yR, r, kick);
}
/** The same from any point (x0, y0), reaching P after T1 seconds. */
function shotFrom(t0, x0, y0, T1, P, yR, r, kick = 0) {
  const vx = (P.x - x0 - 0.5 * G * T1 * T1) / T1;
  const vP = vx + G * T1;                         // <= 0: still going up the table
  const L1 = leg(t0, x0, vx, y0, (unfold(y0, P.y, T1, r) - y0) / T1, t0 + T1);
  const v2 = Math.max(-0.6 * vP, kick);
  const t2 = (-v2 + Math.sqrt(v2 * v2 + 2 * G * (XF - P.x))) / G;
  const L2 = leg(t0 + T1, P.x, v2, P.y, (unfold(P.y, yR, t2, 1 - r) - P.y) / t2, t0 + T1 + t2);
  return { legs: [L1, L2], hit: t0 + T1, back: t0 + T1 + t2, yR, P };
}

// Where a ball meets a digit: just right of its right-hand targets.
function digitPoint(slot, segs, r) {
  const x = (SLOTS[slot] + 2) * 6 + 2;
  const upper = segs.has('b'), lower = segs.has('c');
  const top = upper && (!lower || r < 0.5);
  return { x, y: top ? (r < 0.25 ? 2 : 4) : (r < 0.75 ? 10 : 12) };
}
const BUMPER_X = (BUMPER_CELL + 1) * 6;
// The free lanes between and inside the banks, where a shot can hang.
const LANES = [0, 2, 5, 9, 12].map((c) => c * 6 + 3).concat([3, 7, 10].map((c) => c * 6));           // ball just right of the bumpers
const flipperY = (upper, r) => (upper ? (r < 0.5 ? 2 : 4) : (r < 0.5 ? 10 : 12));

// ---------------------------------------------------------------- the turn

/**
 * Everything that happens around the minute boundary at T (epoch seconds):
 * which banks are hit when, the shots that hit them, the reset, multiball.
 */
const turnCache = new Map();
function turnPlan(T) {
  if (turnCache.has(T)) return turnCache.get(T);
  const k = Math.round(T / 60);
  const oldD = digitsAt(T * 1000 - 1), newD = digitsAt(T * 1000);
  const hour = oldD[0] !== newD[0] || oldD[1] !== newD[1];
  const changing = [3, 2, 1, 0].filter((i) => oldD[i] !== newD[i]);
  const info = changing.map((i) => {
    const o = segsOf(oldD[i]), n = segsOf(newD[i]);
    const keep = new Set([...o].filter((s) => n.has(s)));
    return { i, keep, drops: keep.size < o.size, partialOk: !isDigit(keep) };
  });
  const aimUpper = rnd(k, 1) < 0.5;
  const ballA = { legs: [], hits: [] }, ballB = { legs: [], hits: [], drain: null };
  const fires = [], nudges = [];
  const HIT0 = T + 0.15;

  const aTargets = hour ? info.filter((x) => x.i >= 2) : info;
  const bTargets = hour ? info.filter((x) => x.i < 2) : [];

  // One shot per ball: aimed at the furthest bank, smashing every changing bank
  // it crosses on the way. The first crossing comes just after :00.
  const cross = (L, xc) => {
    const disc = L.vx * L.vx - 2 * G * (L.x0 - xc);
    return L.t0 + (-L.vx - Math.sqrt(Math.max(0, disc))) / G;
  };
  const aim = (targets, make, T0) => {
    const far = targets[targets.length - 1];
    let s = make(0, far);
    const near = targets[0];
    const tc = near === far ? s.hit : cross(s.legs[0], digitPoint(near.i, new Set(), 0).x);
    s = make(T0 - tc, far);
    const hits = targets.map((tg) => ({ i: tg.i, t: tg === far ? s.hit : cross(s.legs[0], digitPoint(tg.i, new Set(), 0).x) }));
    return { s, hits };
  };

  // Ball A, from the trap.
  const y = aimUpper ? 4 : 10;
  const backUpper = hour ? true : rnd(k, 20) < 0.5;
  const A = aim(aTargets, (t0, far) => shot(t0, y, digitPoint(far.i, segsOf(oldD[far.i]), rnd(k, 10)), 0.8,
    flipperY(backUpper, rnd(k, 30)), rnd(k, 10)), HIT0);
  const launch = { t: A.s.legs[0].t0, upper: aimUpper, y };
  fires.push({ t: launch.t, upper: aimUpper });
  ballA.legs.push(...A.s.legs); ballA.hits.push(...A.hits);
  const endA = A.s.back, endUpper = backUpper, endY = A.s.yR;

  // Ball B, on the hour: kicked out between the bumpers as A crosses its first
  // bank, straight up into the hours.
  if (hour) {
    const tK = A.hits[0].t;
    const B = aim(bTargets, (t0, far) => shotFrom(t0, BUMPER_X - 1, 8, 0.9,
      digitPoint(far.i, segsOf(oldD[far.i]), rnd(k, 40)), 12, rnd(k, 40), 10), tK + 0.35);
    // Starts at the bumpers: shift so it leaves at tK.
    const dt = tK - B.s.legs[0].t0;
    for (const L of B.s.legs) { L.t0 += dt; L.t1 += dt; }
    B.hits.forEach((h) => { h.t += dt; });
    ballB.legs.push(...B.s.legs); ballB.hits.push(...B.hits);
    ballB.kick = tK;
    let tB = B.s.back + dt + 0.12, yB = 12;
    // One more shot, then down the middle; two nudges; gone.
    const s = shot(tB, yB, { x: 9 * 6 + 3, y: 6 }, 1, 7, 0.3);
    fires.push({ t: tB, upper: false });
    ballB.legs.push(...s.legs);
    const L = s.legs[1];
    const tOut = (-L.vx + Math.sqrt(L.vx * L.vx + 2 * G * (W + 2 - L.x0))) / G;
    L.t1 = L.t0 + tOut;
    ballB.drain = s.back;
    nudges.push(s.back - 0.75, s.back - 0.35);
  }

  const lastHit = Math.max(...ballA.hits.map((h) => h.t), ...ballB.hits.map((h) => h.t));
  const reset = lastHit + 0.55;
  const hitAt = new Map([...ballA.hits, ...ballB.hits].map((h) => [h.i, h.t]));
  const plan = {
    T, k, hour, oldD, newD, info, hitAt, reset, launch, aimUpper,
    ballA, ballB, fires, nudges, endA, endUpper, endY,
    flash: hour ? [reset, reset + 0.35] : null,
    blinkFrom: T - 4.2,
  };
  turnCache.set(T, plan);
  if (turnCache.size > 64) turnCache.delete(turnCache.keys().next().value);
  return plan;
}

// ------------------------------------------------------------- free play

/**
 * The minute after turn T: shots chained off the flippers until :54, then the
 * trap (and maybe a pass across) until the next turn's launch.
 */
const playCache = new Map();
function playPlan(T) {
  if (playCache.has(T)) return playCache.get(T);
  const tp = turnPlan(T), next = turnPlan(T + 60);
  const k = tp.k;
  const legs = [], fires = [], bumps = [], nudges = [];
  let t = tp.endA + 0.12, y = tp.endY, upper = tp.endUpper, n = 0;
  const digits = tp.newD.map((d) => segsOf(d));
  while (t < T + 54) {
    const r = rnd(k, 100 + n), r2 = rnd(k, 200 + n), r3 = rnd(k, 300 + n);
    let P, frac, kick = 0, bump = null;
    if (r < 0.34) {
      const top = r2 < 0.5;
      P = { x: BUMPER_X, y: top ? (r3 < 0.5 ? 2 : 4) : (r3 < 0.5 ? 10 : 12) };
      frac = 0.6 + 0.3 * r3; kick = 55 + 25 * r2; bump = top ? 0 : 1;
    } else if (r < 0.7) {
      const slot = Math.floor(r2 * 4) % 4;
      P = digitPoint(slot, digits[slot], r3);
      frac = 0.55 + 0.4 * r3;
    } else {
      P = { x: LANES[Math.floor(r2 * LANES.length) % LANES.length], y: Math.floor(r3 * 8) * 2 };
      frac = 1;
    }
    const back = rnd(k, 400 + n) < 0.5;
    const yR = flipperY(back, rnd(k, 500 + n));
    const save = rnd(k, 600 + n) < 0.035 && P.x < 60;    // heading for the drain: nudge
    const s = shot(t, y, P, frac, save ? 7 : yR, r3, kick);
    if (save) {
      // Down the middle; the nudge at the last moment knocks it onto a flipper.
      const L = s.legs[1], tn = s.back - 0.3;
      L.t1 = tn;
      const p = legAt(L, tn);
      const vxn = L.vx + G * (tn - L.t0);
      legs.push(s.legs[0], L);
      legs.push(leg(tn, p.x, vxn, yR, 0, s.back));
      nudges.push(tn);
    } else legs.push(...s.legs);
    fires.push({ t, upper });
    if (bump !== null) bumps.push({ t: s.hit, which: bump });
    upper = back; y = yR; t = s.back + 0.12; n++;
  }
  // The trap: on whichever flipper it came back to, then across if needed.
  const trapAt = t - 0.12;
  const holds = [];
  const launch = next.launch;
  const pass = upper !== launch.upper;
  const passT = Math.max(trapAt + 0.4, T + 57.4);
  holds.push({ upper, t0: trapAt, t1: pass ? passT : launch.t - 0.3 });
  if (pass) holds.push({ upper: launch.upper, t0: passT + 0.45, t1: launch.t - 0.3 });
  const trap = { t0: trapAt, y: upper ? 2 : 12, pass: pass ? passT : null, y2: launch.upper ? 2 : 12, launch };
  const plan = { legs, fires, bumps, nudges, holds, trap };
  playCache.set(T, plan);
  if (playCache.size > 64) playCache.delete(playCache.keys().next().value);
  return plan;
}

// ----------------------------------------------------------- the moment

function stateAt(now) {
  const T = Math.floor(now / 60) * 60;         // the turn this minute began with
  const tp = turnPlan(T), pp = playPlan(T), nx = turnPlan(T + 60);
  const balls = [];

  // Ball A.
  const inLegs = (legs) => legs.find((L) => now >= L.t0 && now < L.t1);
  let a = null;
  const L = inLegs(tp.ballA.legs) ?? inLegs(pp.legs) ?? (now >= nx.launch.t ? inLegs(nx.ballA.legs) : null);
  if (L) a = legAt(L, now);
  else if (now >= pp.trap.t0 && now < nx.launch.t) {
    const tr = pp.trap;
    let yy = tr.y;
    if (tr.pass !== null && now >= tr.pass) yy = now < tr.pass + 0.45 ? tr.y + (tr.y2 - tr.y) * ((now - tr.pass) / 0.45) : tr.y2;
    if (now >= nx.launch.t - 0.3) yy = nx.launch.y;   // let go: it rolls to the tip
    a = { x: XF, y: yy };
  } else {                                       // sitting on a flipper between shots
    let last = null;
    for (const Lg of [...tp.ballA.legs, ...pp.legs]) if (Lg.t1 <= now && (!last || Lg.t1 > last.t1)) last = Lg;
    a = last ? { x: XF, y: bounceY(last.y0 + last.vy * (last.t1 - last.t0)) } : { x: XF, y: tp.endY };
  }
  balls.push(a);

  // Ball B (multiball), this hour only.
  const b = inLegs(tp.ballB.legs);
  if (b) { const p = legAt(b, now); if (p.x < W) balls.push(p); }
  else if (tp.hour && tp.ballB.legs.length && now >= tp.ballB.kick && now < tp.ballB.drain) balls.push({ x: XF, y: 12 });

  // Flippers.
  const fires = [...tp.fires, ...pp.fires, ...nx.fires.filter((f) => f.t < T + 60)];
  const pose = [true, false].map((upper) => {
    if (pp.holds.some((h) => h.upper === upper && now >= h.t0 && now < h.t1)) return 'up';
    let best = Infinity;
    for (const f of fires) if (f.upper === upper && now >= f.t) best = Math.min(best, now - f.t);
    if (best < 0.25) return 'up';
    if (best < 0.42) return 'mid';
    return 'rest';
  });

  // Bumpers: lit for a moment after a hit, both in turn at the multiball kickout.
  const lit = [false, false];
  for (const bp of pp.bumps) if (now >= bp.t && now < bp.t + 0.25) lit[bp.which] = true;
  if (tp.hour && now >= tp.ballB.kick - 0.4 && now < tp.ballB.kick + 0.4) {
    const ph = Math.floor((now - tp.ballB.kick + 0.4) / 0.2) % 2;
    lit[0] = ph === 0; lit[1] = ph === 1;
  }

  // Hurry-up: the bumpers chase each other while the ball is trapped.
  if (now >= nx.blinkFrom && now < nx.launch.t) {
    const ph = Math.floor((now - nx.blinkFrom) / 0.3) % 2;
    lit[0] = ph === 0; lit[1] = ph === 1;
  }

  // Targets.
  const digits = [0, 1, 2, 3].map((i) => {
    // Next turn's hurry-up lives at the end of this minute.
    const tg = tp.info.find((x) => x.i === i);
    if (!tg || now >= tp.reset) return segsOf(tp.newD[i]);
    const hit = tp.hitAt.get(i);
    if (hit !== undefined && now >= hit) {
      // The whole bank drops flat, then rises as the new digit: a clean blank,
      // never a half-digit that reads as another one.
      return new Set();
    }
    return segsOf(tp.oldD[i]);
  });

  const nudge = [...pp.nudges, ...tp.nudges].some((t) => now >= t && now < t + 0.17);
  const flash = tp.flash && now >= tp.flash[0] && now < tp.flash[1];
  return { balls, pose, lit, digits, nudge, flash };
}

// ----------------------------------------------------------------- drawing

function cellRows(g, col, row) {
  const rows = [];
  for (let r = 0; r < 8; r++) {
    let b = 0;
    for (let i = 0; i < 5; i++) if (g[(row * 8 + r) * W + col * 6 + i]) b |= 0x10 >> i;
    rows.push(b);
  }
  return rows;
}
const toArt = (rows) => rows.map((b) => [...Array(5)].map((_, i) => (b & (0x10 >> i) ? '#' : '.')).join(''));
const fromArt = (art) => art.map((s) => parseInt(s.replace(/#/g, '1').replace(/\./g, '0'), 2));

function ballCell(p) {
  // A 2x2 ball, top-left at glass column x, row y, kept inside one cell: it
  // hops the gap between cells and the seam between rows, as the glass does.
  let x = Math.round(p.x), y = Math.round(p.y);
  y = Math.max(0, Math.min(14, y));
  if ((y & 7) === 7) y += 1;
  const m = ((x % 6) + 6) % 6;
  if (m >= 4) x += 6 - m;
  if (x < 0 || x > 93) return null;
  return { col: Math.floor(x / 6), dx: x % 6, row: y >> 3, dy: y & 7 };
}

export default {
  name: 'Pinball',
  blurb: 'The numerals are banks of drop targets on a sideways pinball table; each minute the flipper traps the ball, aims, and smashes the bank, which resets as the new digit. On the hour, multiball.',
  bus: 'i2c100',
  panel: 'green',
  fps: FPS,

  frame(lcd, api, ctx) {
    const now = ctx.date.getTime() / 1000;
    const st = stateAt(now);
    lcd.command(0x02);                                // home: undo any nudge
    if (st.flash) {
      for (let row = 0; row < 2; row++) { lcd.setCursor(0, row); for (let c = 0; c < 16; c++) lcd.data(0xff); }
      return;
    }

    // The table: targets and flippers as dots, bumpers as ROM.
    const g = new Uint8Array(W * H);
    st.digits.forEach((segs, slot) => {
      for (const s of segs) {
        const [co, x0, x1, y0, y1] = SEG[s];
        const cx = (SLOTS[slot] + co) * 6;
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) g[y * W + cx + x] = 1;
      }
    });
    const flipTiles = st.pose.map((p, i) => fromArt(i === 0 ? FLIP[p] : [...FLIP[p]].reverse()));
    const rom = { [BUMPER_CELL]: st.lit[0] ? 0x2a : 0xa5, [16 + BUMPER_CELL]: st.lit[1] ? 0x2a : 0xa5 };

    const alloc = new TileAllocator(lcd, 0);
    const out = [Array(16).fill(0x20), Array(16).fill(0x20)];
    const pic = [[], []];
    for (let row = 0; row < 2; row++) for (let col = 0; col < 16; col++) {
      const romCode = rom[row * 16 + col];
      pic[row][col] = romCode !== undefined ? Array.from(lcd.glyph(romCode))
        : col === FLIP_CELL ? flipTiles[row] : cellRows(g, col, row);
      if (romCode !== undefined) out[row][col] = romCode;
    }
    // Over a stroke the ball is XORed in, a dark ball crossing it, so it is never
    // lost in it; in a bar cell it is ORed, so it can never cut a bar and turn
    // an 8 into a 0.
    const ballAt = new Map();
    st.balls.forEach((p, n) => {
      const c = ballCell(p);
      if (!c) return;
      const key = c.row * 16 + c.col;
      const rows = pic[c.row][c.col].slice();
      const barCell = SLOTS.some((s0) => c.col === s0 + 1);
      for (let r = 0; r < 2; r++) rows[c.dy + r] = barCell ? rows[c.dy + r] | (0x18 >> c.dx) : rows[c.dy + r] ^ (0x18 >> c.dx);
      if (!ballAt.has(key)) ballAt.set(key, { n, plain: out[c.row][c.col], under: pic[c.row][c.col] });
      pic[c.row][c.col] = rows;
    });
    // Allocate: targets first, then flippers, then balls.
    const code = (rows) => (rows.every((v) => v === 0) ? 0x20 : rows.every((v) => v === 0x1f) ? 0xff : alloc.add(toArt(rows)));
    for (const pass of ['targets', 'flippers', 'balls']) {
      for (let row = 0; row < 2; row++) for (let col = 0; col < 16; col++) {
        const key = row * 16 + col;
        const kind = ballAt.has(key) ? 'balls' : col === FLIP_CELL ? 'flippers' : 'targets';
        if (kind !== pass || (rom[key] !== undefined && !ballAt.has(key))) continue;
        let c = code(pic[row][col]);
        if (c === null && kind === 'balls') {
          const b = ballAt.get(key);            // no slot: the ball as a ROM dot, or not drawn
          c = b.under.every((v) => v === 0) ? 0xa5 : rom[key] ?? code(b.under);
        }
        out[row][col] = c ?? 0x20;
      }
    }

    alloc.flush();
    out.forEach((codes, row) => { lcd.setCursor(0, row); codes.forEach((c) => lcd.data(c)); });
    if (st.nudge) lcd.command(0x1c);                  // the nudge: shift the display right
  },
};
