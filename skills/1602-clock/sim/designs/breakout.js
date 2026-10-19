// Breakout -- the wall is the time.
//
// The hours and the minutes are two walls of bricks, one brick per segment of
// a seven-segment numeral, every brick on the cell grid: the left stroke is
// ROM 0xff, the right stroke a 3-dot slab, the bars 2-dot slabs in the middle
// column. The gaps between cells are the mortar. Between the walls, where the
// colon would be, is the court: a paddle on the bottom row keeps a ball in
// play all minute. The time's bricks are armoured, so the ball only plinks.
//
// Near the end of the minute the paddle catches the ball and crouches. At :00
// it fires it as a fireball, which goes through armour and smashes exactly the
// bricks the old time has and the new one does not; the paddle catches it and
// the new bricks drop in from above. Each digit's last change is held back to
// a finale, a last shot and the last bricks landing together, so no instant
// mixes a finished new digit with an unfinished one into a wrong time.
// On the hour the first brick that breaks drops a capsule; the paddle catches
// it and the ball splits in three. Two are lost, of course.
//
// Tiles: the wall needs at most four parts (top bar, middle bar = bottom bar,
// both bars, right stroke) at any time of day. The paddle, ball, falling
// bricks and capsule are layered on top in that order, each only if the frame
// still fits in eight; any cell that happens to match a ROM glyph is free.

import { noise, clamp, ease } from '../js/kit.js';

const FPS = 12;
const W = 96, H = 16;                 // glass columns (6 per cell; the 6th is the gap) x dot rows
const SLOTS = [0, 3, 10, 13];         // first cell of H1 H2 M1 M2; cells 6-9 are the court
const COURT_L = 33, COURT_R = 59;     // free glass columns between the walls
const PW = 5;                         // paddle width
const PX_MIN = COURT_L, PX_MAX = COURT_R - PW + 1;
const PARK = [42, 48];                // paddle x that keeps it inside one cell (cells 7, 8)
const BALL_Y = 12;                    // ball's top row when it sits on the paddle

const SEGS = {
  0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg',
  5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg',
};
// Brick of each segment: [cell offset in the slot, dot x0, x1, y0, y1].
const BRICK = {
  a: [1, 0, 4, 0, 1], g: [1, 0, 4, 6, 7], d: [1, 0, 4, 14, 15],
  f: [0, 0, 4, 0, 7], e: [0, 0, 4, 8, 15],
  b: [2, 0, 2, 0, 7], c: [2, 0, 2, 8, 15],
};

// ------------------------------------------------------------------ helpers

const grid = () => new Uint8Array(W * H);
const visible = (x) => x >= 0 && x < W && x % 6 !== 5;
function set(g, x, y) {
  x = Math.round(x); y = Math.round(y);
  if (visible(x) && y >= 0 && y < H) g[y * W + x] = 1;
}

function brickRect(slot, seg) {
  const [co, x0, x1, y0, y1] = BRICK[seg];
  const cx = (SLOTS[slot] + co) * 6;
  return { x0: cx + x0, x1: cx + x1, y0, y1 };
}
function brickCentre(slot, seg) {
  const r = brickRect(slot, seg);
  return { x: (r.x0 + r.x1) / 2 - 0.5, y: (r.y0 + r.y1) / 2 - 0.5 };
}

// Cracks: phase 1 loses a diagonal fault and some chips, phase 2 is rubble.
function crackKeeps(x, y, phase, seed) {
  if (phase === 0) return true;
  const n = noise(x * 17 + y * 131 + seed, 7);
  if (phase === 1) return (x + y + seed) % 4 !== 0 && n > 0.2;
  return n > 0.7;
}

function drawBrick(g, slot, seg, dy = 0, phase = 0, seed = 0) {
  const r = brickRect(slot, seg);
  for (let y = r.y0; y <= r.y1; y++) {
    for (let x = r.x0; x <= r.x1; x++) if (crackKeeps(x, y, phase, seed)) set(g, x, y + dy);
  }
}

function drawBall(g, x, y) {
  const ix = Math.round(x), iy = Math.round(y);
  for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) set(g, ix + dx, iy + dy);
}

// The paddle: a little Vaus, rounded on top. pose: 0 rest, 1 crouched, -1 popped up.
function drawPaddle(g, x, pose) {
  const y = pose < 0 ? 13 : 14;
  if (pose !== 1) for (let i = 1; i < PW - 1; i++) set(g, x + i, y);
  for (let i = 0; i < PW; i++) set(g, x + i, y + 1);
}

function drawCapsule(g, x, y) {
  for (const [dx, dy] of [[1, 0], [2, 0], [0, 1], [3, 1], [1, 2], [2, 2]]) set(g, x + dx, y + dy);
}

const digitsOf = (h, m) => [Math.floor(h / 10), h % 10, Math.floor(m / 10), m % 10];

// ------------------------------------------------------------- the turn

const DIGIT_LIST = Object.keys(SEGS).map((d) => new Set(SEGS[d]));
const ham = (x, y) => { let n = 0; for (const s of 'abcdefg') if (x.has(s) !== y.has(s)) n++; return n; };

function permutations(list) {
  if (list.length <= 1) return [list.slice()];
  const out = [];
  list.forEach((x, i) => {
    for (const p of permutations([...list.slice(0, i), ...list.slice(i + 1)])) out.push([x, ...p]);
  });
  return out;
}

/**
 * The bricks one digit loses (-) and gains (+), in an order where no step on
 * the way is another digit, or one brick from another digit while being
 * further from both the old and the new one. The last step is held for the
 * finale; it should be a drop if it can, so that one fireball is enough.
 */
const ORDERS = new Map();
function orderChange(from, to) {
  const k = `${from}${to}`;
  if (ORDERS.has(k)) return ORDERS.get(k);
  const a = new Set(SEGS[from]), b = new Set(SEGS[to]);
  const ops = [...[...a].filter((s) => !b.has(s)).map((seg) => ({ seg, kind: 'rem' })),
    ...[...b].filter((s) => !a.has(s)).map((seg) => ({ seg, kind: 'add' }))];
  const looks = (st) => {
    let worst = 0;
    DIGIT_LIST.forEach((d, i) => {
      if (i === from || i === to) return;
      const h = ham(st, d);
      if (h === 0) worst = Math.max(worst, 100);
      else if (h === 1 && Math.min(ham(st, a), ham(st, b)) > 1) worst = Math.max(worst, 10);
    });
    return worst;
  };
  let best = null, bestCost = Infinity;
  for (const p of permutations(ops)) {
    const st = new Set(a);
    let cost = 0;
    for (const op of p.slice(0, -1)) { if (op.kind === 'rem') st.delete(op.seg); else st.add(op.seg); cost += looks(st); }
    if (p.length && p.at(-1).kind === 'rem') cost += 3;
    // Removals early, drops late, reads as smash-then-build.
    p.forEach((op, i) => { if (op.kind === 'rem') cost += i * 0.1; });
    if (cost < bestCost) { best = p; bestCost = cost; }
  }
  ORDERS.set(k, best);
  return best;
}

const STEP = 0.42, FIRST_HIT = 0.3, RETURN = 0.45;
const DROP_FALL = 0.42, DROP_SETTLE = 0.16;

/**
 * Everything that happens in the first seconds of a minute, from the clock
 * alone. Each changing digit's bricks go one at a time, the digits taking
 * turns; every digit's last brick goes at one instant, the finale, so the
 * display never shows some digits new and others old.
 */
function planMinute(minKey) {
  const now = new Date(minKey * 60000), before = new Date(minKey * 60000 - 60000);
  const cur = digitsOf(now.getHours(), now.getMinutes());
  const old = digitsOf(before.getHours(), before.getMinutes());
  const hour = now.getMinutes() === 0;
  const park = PARK[noise(minKey, 11) < 0.5 ? 0 : 1];
  const start = { x: park + 1, y: BALL_Y };

  // The digits beside the court first, then outwards.
  const queues = [], finals = [];
  for (const slot of [2, 1, 3, 0]) {
    if (old[slot] === cur[slot]) continue;
    const ops = orderChange(old[slot], cur[slot]).map((op) => ({ ...op, slot }));
    finals.push(ops.pop());
    queues.push(ops);
  }
  const steps = [];
  for (let i = 0; queues.some((q) => i < q.length); i++) for (const q of queues) if (i < q.length) steps.push(q[i]);

  const rems = [], adds = [], balls = [];
  let t0 = 0, capsule = null, nBalls = 1;
  if (hour) {
    // The first brick to break drops a capsule; the paddle catches it and
    // the ball splits in three.
    const firstIdx = steps.findIndex((s) => s.kind === 'rem');
    const first = firstIdx >= 0 ? steps.splice(firstIdx, 1)[0] : finals.find((f) => f.kind === 'rem');
    if (first) {
      first.t = FIRST_HIT;
      rems.push(first);
      const c = brickCentre(first.slot, first.seg);
      balls.push({ pts: [{ t: 0, ...start }, { t: first.t, ...c }, { t: first.t + RETURN, ...start }] });
      capsule = { t0: first.t + 0.1, t1: first.t + 1.8, x0: c.x - 1, y0: c.y - 1, x1: park, y1: BALL_Y - 2 };
      if (finals.includes(first)) finals.splice(finals.indexOf(first), 1);
      t0 = capsule.t1 + 0.5;
      nBalls = 3;
    }
  }

  // Lay the steps out in time; removals go to the balls in turn.
  const shots = Array.from({ length: nBalls }, () => []);
  let t = t0 + FIRST_HIT, k = 0;
  for (const s of steps) {
    s.t = s.kind === 'rem' ? t : t - DROP_FALL + 0.1;
    if (s.kind === 'rem') { shots[k % nBalls].push(s); k++; rems.push(s); } else adds.push(s);
    t += STEP * (hour ? 0.8 : 1);
  }
  const T = t + 0.15;
  for (const f of finals) {
    if (f.kind === 'rem') { f.t = T; shots[k % nBalls].push(f); k++; rems.push(f); } else { f.t = T - DROP_FALL; adds.push(f); }
  }

  // Ball flights: out from the paddle, brick to brick (via the court roof when
  // there is time to kill), and home; spare balls of the multiball are lost.
  let end = t0;
  shots.forEach((list, i) => {
    if (!list.length && !hour) return;
    const launch = t0 + i * 0.12;
    const pts = [{ t: launch, ...start }];
    let last = launch;
    for (const s of list) {
      if (s.t - last > 0.75) pts.push({ t: (s.t + last) / 2, x: COURT_L + 4 + ((i * 7 + pts.length * 5) % 18), y: 0 });
      pts.push({ t: s.t, ...brickCentre(s.slot, s.seg) });
      last = s.t;
    }
    const lost = i > 0;
    const home = Math.max(last, T - 0.3) + RETURN + (lost ? 0.25 * i : 0);
    pts.push(lost ? { t: home, x: i === 1 ? COURT_L : COURT_R - 1, y: 17 } : { t: home, ...start });
    balls.push({ pts, lost });
    if (!lost) end = Math.max(end, home);
  });
  const settled = Math.max(end, T + DROP_SETTLE);
  return { minKey, cur, old, hour, park, rems, adds, balls, capsule, finale: T, serve: settled + 0.6 };
}

function flightAt(sec, pts) {
  if (sec < pts[0].t || sec > pts.at(-1).t) return null;
  for (let i = 1; i < pts.length; i++) {
    if (sec <= pts[i].t) {
      const p = pts[i - 1], q = pts[i], u = (sec - p.t) / Math.max(1e-6, q.t - p.t);
      return { x: p.x + (q.x - p.x) * u, y: p.y + (q.y - p.y) * u };
    }
  }
  return null;
}

// --------------------------------------------------------------- the rally

const CACHE = new Map();
const SIM_DT = 0.01;

function wallSolid(digits) {
  const g = grid();
  digits.forEach((d, slot) => { for (const s of SEGS[d]) drawBrick(g, slot, s); });
  return g;
}

/**
 * The minute's rally, simulated from the serve: the ball bounces off the
 * glass edges and the armoured walls; at the paddle the AI decides how it
 * meets the ball, which sets the return angle. It ends when the paddle
 * catches the ball for the wind-up.
 */
function minuteFor(minKey) {
  if (CACHE.has(minKey)) return CACHE.get(minKey);
  if (CACHE.size > 40) CACHE.clear();
  const plan = planMinute(minKey);
  const solid = wallSolid(plan.cur);
  const hit = (x, y) => {
    const ix = Math.floor(x), iy = Math.floor(y);
    if (iy < 0 || iy + 1 >= H || ix < 0 || ix + 1 >= W) return true;
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) if (solid[(iy + dy) * W + ix + dx]) return true;
    return false;
  };
  const inCourt = (x) => x >= COURT_L - 0.5 && x <= COURT_R - 1.5;

  const contacts = [{ t: plan.serve, px: plan.park, style: 'serve' }];
  let x = plan.park + 1, y = BALL_Y, t = plan.serve;
  let vx = (noise(minKey, 3) < 0.5 ? -1 : 1) * (3 + noise(minKey, 4) * 4);
  let vy = -Math.sqrt(121 - vx * vx);
  const xs = [], ys = [];
  let caughtAt = null;
  for (let n = 0; t < 59.6 && n < 7000; n++) {
    xs.push(x); ys.push(y);
    let ny = y + vy * SIM_DT;
    if (vy > 0 && ny >= BALL_Y && inCourt(x)) {
      // The paddle meets it.
      const i = contacts.length;
      const r = noise(minKey * 131 + i, 5);
      const style = r < 0.22 ? 'panic' : r < 0.42 ? 'smash' : 'calm';
      let u = style === 'panic' ? (noise(minKey + i, 6) < 0.5 ? -1 : 1) * (0.8 + 0.15 * noise(i, minKey))
        : (noise(minKey * 7 + i, 8) * 2 - 1) * (style === 'smash' ? 0.4 : 0.7);
      const centre = x + 1;
      const px = clamp(Math.round(centre - PW / 2 - u * 2.5), PX_MIN, PX_MAX);
      u = clamp((centre - (px + PW / 2)) / 2.5, -1, 1);
      contacts.push({ t, px, style, u });
      if (t >= 56 && caughtAt === null) { caughtAt = t; break; }
      const speed = style === 'smash' ? 15 : style === 'panic' ? 12.5 : 11;
      vx = u * 8;
      if (Math.abs(vx) < 2) vx = (vx < 0 || (vx === 0 && noise(i, 9) < 0.5) ? -1 : 1) * (2 + 2.5 * noise(minKey + i, 10));
      vy = -Math.sqrt(speed * speed - vx * vx);
      ny = BALL_Y;
    } else if (hit(x, ny)) { vy = -vy; ny = y; }
    let nx = x + vx * SIM_DT;
    if (hit(nx, ny)) { vx = -vx; nx = x; }
    x = nx; y = ny; t += SIM_DT;
  }
  if (caughtAt === null) {
    const last = [...contacts].reverse().find((c) => c.t <= 59.0 && c.style !== 'serve') ?? contacts[0];
    caughtAt = last.t;
    contacts.splice(contacts.indexOf(last) + 1);
  }
  const res = { plan, contacts, xs, ys, caughtAt, nextPark: planMinute(minKey + 1).park };
  CACHE.set(minKey, res);
  return res;
}

/** Paddle x and pose (0 rest, 1 crouched, -1 popped up) at second `sec`. */
function paddleAt(sec, M) {
  const { plan, contacts, caughtAt, nextPark } = M;
  if (sec < plan.serve) {
    // Through the turn it stays parked; it pops up as it fires and as it catches.
    let pose = 0;
    for (const b of plan.balls) {
      const t0 = b.pts[0].t, t1 = b.pts.at(-1).t;
      if (sec >= t0 && sec < t0 + 0.2) pose = -1;
      if (!b.lost && sec >= t1 - 0.05 && sec < t1 + 0.15) pose = -1;
    }
    if (plan.capsule) {
      const c = plan.capsule;
      if (sec >= c.t1 - 0.4 && sec < c.t1) pose = 1;                 // braces for it
      if (sec >= c.t1 && sec < c.t1 + 0.45) return { x: plan.park, pose: Math.floor((sec - c.t1) / 0.15) % 2 ? 0 : -1, flash: true };
    }
    return { x: plan.park, pose };
  }
  if (sec >= caughtAt) {
    // Caught: carry the ball to where the next minute fires from, then wind up.
    const from = contacts.at(-1).px;
    const u = clamp((sec - caughtAt - 0.2) / 0.7, 0, 1);
    let x = Math.round(from + (nextPark - from) * ease.inOutQuad(u)), pose = 0;
    if (sec > 58.2 && u >= 1) {
      const per = sec > 59.1 ? 0.16 : 0.3;
      x += Math.floor((sec - 58.2) / per) % 2;
      if (sec > 59.5) { x = nextPark; pose = 1; }
    }
    return { x: clamp(x, PX_MIN, PX_MAX), pose };
  }
  let i = 1;
  while (i < contacts.length && contacts[i].t < sec) i++;
  const prev = contacts[i - 1], next = contacts[i] ?? prev;
  const p0 = prev.px, p1 = next.px, t0 = prev.t, t1 = next.t;
  let x = p0, pose = 0;
  if (prev.style === 'smash' && sec - t0 < 0.2) pose = -1;
  if (prev.style === 'panic' && sec - t0 < 0.55) {
    // Phew: a shudder after a save on the very tip.
    x = p0 + (Math.floor((sec - t0) / 0.18) % 2 ? 1 : -1);
    return { x: clamp(x, PX_MIN, PX_MAX), pose };
  }
  if (next.style === 'panic') {
    // Wrong way first, a frozen beat, then a scramble that only just makes it.
    const wrong = clamp(p0 - Math.sign(p1 - p0 || 1) * 4, PX_MIN, PX_MAX);
    const a0 = t0 + 0.35, a1 = Math.max(a0 + 0.1, t1 - 1.0), b0 = Math.max(a1 + 0.2, t1 - 0.5), b1 = t1 - 0.02;
    if (sec < a0) x = p0;
    else if (sec < a1) x = p0 + (wrong - p0) * ease.inOutQuad((sec - a0) / (a1 - a0));
    else if (sec < b0) x = wrong;
    else x = wrong + (p1 - wrong) * clamp((sec - b0) / (b1 - b0), 0, 1);
  } else {
    const early = next.style === 'smash' ? 0.6 : 0.25;
    const m0 = Math.max(t0 + 0.3, t1 - 1.6), m1 = Math.max(m0 + 0.05, t1 - early);
    x = p0 + (p1 - p0) * ease.inOutQuad(clamp((sec - m0) / (m1 - m0), 0, 1));
    if (next.style === 'smash') {
      if (sec > t1 - 0.45 && sec < t1 - 0.1) pose = 1;       // crouch
      else if (sec >= t1 - 0.1) pose = -1;                  // and pop
    }
  }
  return { x: clamp(Math.round(x), PX_MIN, PX_MAX), pose };
}

// ------------------------------------------------------------- composition

let ROM = null;
function romMap(lcd) {
  if (ROM) return ROM;
  ROM = new Map();
  for (let c = 0x10; c < 0x100; c++) {
    const k = lcd.glyph(c).join(',');
    if (!ROM.has(k) || c === 0x20 || c === 0xff) ROM.set(k, c);
  }
  return ROM;
}

function cellKey(g, col, row) {
  const rows = [];
  for (let r = 0; r < 8; r++) {
    let b = 0;
    for (let i = 0; i < 5; i++) if (g[(row * 8 + r) * W + col * 6 + i]) b |= 0x10 >> i;
    rows.push(b);
  }
  return rows;
}

function tilesOf(g, rom) {
  const cells = [], need = new Map();
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 16; col++) {
      const rows = cellKey(g, col, row), k = rows.join(',');
      cells.push({ row, k });
      if (!rom.has(k) && !need.has(k)) need.set(k, rows);
    }
  }
  return { cells, need };
}

/** Layers in priority order; each one is kept only if the frame still fits in eight tiles. */
export function compose(lcd, layers) {
  const rom = romMap(lcd);
  let acc = layers[0].slice();
  const dropped = [];
  for (let k = 1; k < layers.length; k++) {
    const cand = acc.slice();
    for (let i = 0; i < cand.length; i++) cand[i] |= layers[k][i];
    if (tilesOf(cand, rom).need.size <= 8) acc = cand; else dropped.push(k);
  }
  const { cells, need } = tilesOf(acc, rom);
  const slot = new Map();
  [...need.entries()].slice(0, 8).forEach(([k, rows], i) => { slot.set(k, i); lcd.defineChar(i, rows); });
  for (let row = 0; row < 2; row++) {
    lcd.setCursor(0, row);
    for (const c of cells.filter((q) => q.row === row)) lcd.data(rom.get(c.k) ?? slot.get(c.k) ?? 0x20);
  }
  return { dropped, wallOverflow: need.size > 8 };
}

// ------------------------------------------------------------------ design

const design = {
  name: 'Breakout',
  blurb: 'The hours and minutes are two walls of bricks with a Breakout court between them; at :00 a fireball smashes the bricks the new time does not need and new ones drop in.',
  bus: 'i2c100',
  panel: 'green',
  fps: FPS,

  frame(lcd, api, { fields, date }) {
    const sec = fields.s + fields.ms / 1000;
    const M = minuteFor(Math.floor(date.getTime() / 60000));
    const { plan } = M;
    const inTurn = sec < plan.serve;

    // The wall, as it stands at this instant, and the bricks still falling.
    const wall = grid(), falling = [];
    for (let slot = 0; slot < 4; slot++) {
      for (const s of SEGS[inTurn ? plan.old[slot] : plan.cur[slot]]) {
        const r = inTurn && plan.rems.find((q) => q.slot === slot && q.seg === s);
        if (r) {
          const dt = sec - r.t;
          if (dt < 0.36) drawBrick(wall, slot, s, 0, dt < 0 ? 0 : dt < 0.18 ? 1 : 2, slot * 7 + s.charCodeAt(0));
        } else drawBrick(wall, slot, s);
      }
    }
    if (inTurn) {
      for (const a of plan.adds) {
        const dt = sec - a.t;
        if (dt < 0) continue;
        if (dt >= DROP_FALL) { drawBrick(wall, a.slot, a.seg, dt < DROP_FALL + DROP_SETTLE ? -1 : 0); continue; }
        const lift = brickRect(a.slot, a.seg).y1 + 1;
        const g = grid();
        drawBrick(g, a.slot, a.seg, -Math.round(lift * (1 - ease.inQuad(dt / DROP_FALL))));
        falling.push(g);
      }
    }

    const pad = paddleAt(sec, M);
    const paddle = grid();
    if (!pad.flash || pad.pose !== 0) drawPaddle(paddle, pad.x, pad.pose);

    // Balls: the rally, a fireball in flight, or sitting on the paddle.
    const sitting = { x: pad.x + 1, y: BALL_Y + pad.pose };
    const balls = [], trail = [];
    if (inTurn) {
      let flying = false;
      for (const b of plan.balls) {
        const p = flightAt(sec, b.pts);
        if (!p) continue;
        if (b.lost) balls.push(p); else { balls.unshift(p); flying = true; }
        // A fireball burns: a two-dot tail of where it was a moment ago.
        for (const lag of [0.07, 0.14]) {
          const q = flightAt(sec - lag, b.pts);
          if (q && Math.hypot(q.x - p.x, q.y - p.y) > 1.5) trail.push(q);
        }
      }
      if (!flying) balls.unshift(sitting);
    } else if (sec >= M.caughtAt) balls.push(sitting);
    else {
      const i = clamp(Math.floor((sec - plan.serve) / SIM_DT), 0, M.xs.length - 1);
      balls.push({ x: M.xs[i], y: M.ys[i] });
    }
    const ballLayers = balls.map((b) => { const g = grid(); drawBall(g, b.x, b.y); return g; });

    const extra = [];
    if (plan.capsule && sec >= plan.capsule.t0 && sec < plan.capsule.t1) {
      const c = plan.capsule, u = ease.inQuad((sec - c.t0) / (c.t1 - c.t0));
      const g = grid();
      drawCapsule(g, c.x0 + (c.x1 - c.x0) * u, c.y0 + (c.y1 - c.y0) * u);
      extra.push(g);
    }

    const tail = grid();
    for (const q of trail) set(tail, q.x + 0.5, q.y + 0.5);
    const layers = [wall, paddle, ...falling, ballLayers[0] ?? grid(), ...extra, ...ballLayers.slice(1), tail];
    design.last = compose(lcd, layers);
    design.last.names = ['wall', 'paddle', ...falling.map(() => 'falling'), 'ball', ...extra.map(() => 'capsule'), ...ballLayers.slice(1).map(() => 'spare'), 'tail'];
  },
};

export default design;
