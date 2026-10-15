// The pinball table: geometry (pixel units, 1 px = one LED = 2 mm, y down,
// pixel k spans [k, k+1]) and a deterministic 2D ball physics that is run
// once per minute of the day and cached. frame() only reads the records.
//
// A minute's story, in its own local time t (0..60 s):
//   t = 0       the ball hits the drop-target bank (the shot from the
//               previous minute arrives exactly on the minute)
//   0 .. ~47    free play: flipper "player", bumpers, slings; a drained
//               ball is re-plunged (ball save); hour minutes add two balls
//   ~47 ..      the player stops; the last ball drains, the next waits in
//               the shooter lane
//   60 - SHOT   the plunger fires: the skill shot (same every minute) rides
//               the orbit, is caught on the left flipper, aimed, and hits
//               the bank at t = 60, which is t = 0 of the next minute.

export const BALL_R = 1.9;
export const G = 95;                     // px/s^2 down the slope
const DT = 1 / 720, REC = 3;              // physics step; record every 4th (240 Hz)
export const REC_HZ = 1 / (DT * REC);
export const NB = 3;                      // balls (multiball)

// ---------------------------------------------------------------- geometry
function arcPts(cx, cy, r, a0, a1, n) {
  const p = [];
  for (let k = 0; k <= n; k++) { const a = (a0 + (a1 - a0) * k / n) * Math.PI / 180; p.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return p;
}
export const T = {
  lanex: 60.5, laneRest: 58.6,           // ball centre resting on the plunger
  laneWall: 58, outer: 63,
  flippers: [
    { x: 18, y: 53.2, side: 1, len: 9, r0: 1.45, r1: 0.8, rest: 30 * Math.PI / 180, up: -30 * Math.PI / 180 },
    { x: 41, y: 53.2, side: -1, len: 9, r0: 1.45, r1: 0.8, rest: 30 * Math.PI / 180, up: -30 * Math.PI / 180 },
  ],
  bumpers: [{ x: 10.6, y: 19.4, r: 2.7 }, { x: 16.4, y: 12.4, r: 2.7 }, { x: 42.6, y: 12.4, r: 2.7 }, { x: 48.4, y: 19.4, r: 2.7 }],
  slings: [
    { a: [6.8, 30.5], b: [6.8, 37.4], c: [13.5, 42.6] },     // kicker face a-c
    { a: [52.2, 30.5], b: [52.2, 37.4], c: [45.5, 42.6] },
  ],
  // drop targets in a row above the hours, left to right: hour tens, hour ones, minute tens, minute ones
  targets: [0, 1, 2, 3].map((k) => ({ x0: 22 + k * 4, x1: 22 + k * 4 + 3, y: 13.4 })),
  saucer: { x: 29.5, y: 7.6 },
  gate: { a: [63, 16.8], b: [58, 20.6] },
};
// Outer wall polyline: lane bottom, right outer, top-right arch, top, top-left arch, left wall.
T.outerPts = [[63, 64], [63, 14], ...arcPts(50, 14, 13, 0, -90, 14).slice(1), ...arcPts(14, 14, 13, -90, -180, 14), [1, 40], [18.7, 51.9]];
T.rightPts = [[58, 64], [58, 20.6]];
T.rightLower = [[58, 40], [40.3, 51.9]];

const segs = [];   // [ax, ay, bx, by, e, kind, id]
const K_WALL = 0, K_SLING = 1, K_TARGET = 2, K_GATE = 3;
function poly(pts, e = 0.42, kind = K_WALL, id = -1) { for (let k = 1; k < pts.length; k++) segs.push([...pts[k - 1], ...pts[k], e, kind, id]); }
poly(T.outerPts); poly(T.rightPts); poly(T.rightLower);
T.slings.forEach((s, i) => { poly([s.a, s.b, s.c]); segs.push([...s.a, ...s.c, 0.55, K_SLING, i]); });
T.targets.forEach((tg, i) => segs.push([tg.x0, tg.y, tg.x1, tg.y, 0.3, K_TARGET, i]));
segs.push([...T.gate.a, ...T.gate.b, 0.3, K_GATE, 0]);
T.segs = segs;

// broadphase: cells of 4 px listing the segments within reach
const CELL = 4, CW = 17, CH = 17, REACH = BALL_R + 0.6;
const cells = Array.from({ length: CW * CH }, () => []);
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
  let t = L2 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
  const ex = px - ax - t * dx, ey = py - ay - t * dy;
  return Math.sqrt(ex * ex + ey * ey);
}
for (let cy = 0; cy < CH; cy++) for (let cx = 0; cx < CW; cx++) {
  const mx = (cx + 0.5) * CELL, my = (cy + 0.5) * CELL, rr = CELL * 0.7072 + REACH;
  segs.forEach((s, i) => { if (segDist(mx, my, s[0], s[1], s[2], s[3]) <= rr) cells[cy * CW + cx].push(i); });
}

// ---------------------------------------------------------------- rng
function rng(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

// ---------------------------------------------------------------- physics
function newState() {
  return {
    t: 0,
    balls: Array.from({ length: NB }, () => ({ x: 0, y: 0, vx: 0, vy: 0, on: false })),
    fl: T.flippers.map((f) => ({ a: f.rest, w: 0, up: false })),
    down: [false, false, false, false],    // targets dropped
    events: [],
    lastBump: [-9, -9, -9, -9], lastSling: [-9, -9], lastTarget: [-9, -9, -9, -9],
    hit: -1,                                // first target hit (index)
  };
}
function cloneState(S) {
  return { ...S, balls: S.balls.map((b) => ({ ...b })), fl: S.fl.map((f) => ({ ...f })), down: [...S.down], events: [], lastBump: [...S.lastBump], lastSling: [...S.lastSling], lastTarget: [...S.lastTarget] };
}

function collideSeg(b, s, S) {
  const ax = s[0], ay = s[1], bx = s[2], by = s[3], e = s[4], kind = s[5], id = s[6];
  if (kind === K_TARGET && S.down[id]) return;
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
  let t = ((b.x - ax) * dx + (b.y - ay) * dy) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = ax + t * dx, cy = ay + t * dy;
  let nx = b.x - cx, ny = b.y - cy;
  const d = Math.sqrt(nx * nx + ny * ny);
  if (d >= BALL_R || d < 1e-9) return;
  nx /= d; ny /= d;
  if (kind === K_GATE) {
    // one-way: only stops a ball coming down onto its upper face
    // (-dy, dx) points up-left for this gate: only a ball above it collides
    if ((b.x - ax) * -dy + (b.y - ay) * dx <= 0) return;
  }
  b.x = cx + nx * BALL_R; b.y = cy + ny * BALL_R;
  const vn = b.vx * nx + b.vy * ny;
  if (vn >= 0) return;
  const ee = -vn < 6 ? 0 : e;
  b.vx -= (1 + ee) * vn * nx; b.vy -= (1 + ee) * vn * ny;
  if (kind === K_SLING && -vn > 10 && S.t - S.lastSling[id] > 0.12) {
    b.vx += nx * 62; b.vy += ny * 62; S.lastSling[id] = S.t; S.events.push([S.t, 1, id]);
  }
  if (kind === K_TARGET && -vn > 8 && S.t - S.lastTarget[id] > 0.15) {
    S.lastTarget[id] = S.t; S.events.push([S.t, 2, id]);
    if (S.hit < 0) S.hit = id;
  }
}

function collideBumpers(b, S) {
  for (let i = 0; i < 4; i++) {
    const p = T.bumpers[i], R = p.r + BALL_R;
    let nx = b.x - p.x, ny = b.y - p.y;
    const d = Math.sqrt(nx * nx + ny * ny);
    if (d >= R) continue;
    nx /= d; ny /= d;
    b.x = p.x + nx * R; b.y = p.y + ny * R;
    const vn = b.vx * nx + b.vy * ny;
    if (vn >= 0) continue;
    const out = Math.max(-vn * 0.5, 82);
    b.vx += (out - vn) * nx; b.vy += (out - vn) * ny;
    if (S.t - S.lastBump[i] > 0.08) { S.lastBump[i] = S.t; S.events.push([S.t, 0, i]); }
  }
}

/** Flipper k's geometry at angle a: pivot, unit direction. */
export function flipperDir(k, a) {
  const f = T.flippers[k];
  return [f.side * Math.cos(a), Math.sin(a)];
}
function collideFlipper(b, k, S) {
  const f = T.flippers[k], st = S.fl[k], [ux, uy] = flipperDir(k, st.a);
  const rx = b.x - f.x, ry = b.y - f.y;
  let u = (rx * ux + ry * uy) / f.len; u = u < 0 ? 0 : u > 1 ? 1 : u;
  const cx = f.x + ux * u * f.len, cy = f.y + uy * u * f.len;
  const R = BALL_R + f.r0 + (f.r1 - f.r0) * u;
  let nx = b.x - cx, ny = b.y - cy;
  const d = Math.sqrt(nx * nx + ny * ny);
  if (d >= R || d < 1e-9) return;
  nx /= d; ny /= d;
  b.x = cx + nx * R; b.y = cy + ny * R;
  // surface velocity at the contact: w x r (angle grows clockwise on screen)
  const s = u * f.len, w = st.w;
  const vfx = -f.side * s * w * Math.sin(st.a) * 1, vfy = s * w * Math.cos(st.a);
  const rvx = b.vx - vfx, rvy = b.vy - vfy, vn = rvx * nx + rvy * ny;
  if (vn >= 0) return;
  const ee = -vn < 8 ? 0 : Math.abs(w) > 2 ? 0.4 : 0.15;
  b.vx -= (1 + ee) * vn * nx; b.vy -= (1 + ee) * vn * ny;
  if (-vn > 8) {   // rubber grip: an impact kills some of the slide
    const tx = -ny, ty = nx, vt = (b.vx - vfx) * tx + (b.vy - vfy) * ty;
    b.vx -= 0.35 * vt * tx; b.vy -= 0.35 * vt * ty;
  }
}

function stepFlippers(S) {
  for (let k = 0; k < 2; k++) {
    const f = T.flippers[k], st = S.fl[k];
    const target = st.up ? f.up : f.rest, speed = st.up ? 26 : 15;
    const prev = st.a;
    if (st.a > target) st.a = Math.max(target, st.a - speed * DT);
    else if (st.a < target) st.a = Math.min(target, st.a + speed * DT);
    st.w = (st.a - prev) / DT;
  }
}

function step(S) {
  stepFlippers(S);
  const damp = Math.exp(-0.09 * DT);
  for (const b of S.balls) {
    if (!b.on) continue;
    b.vy += G * DT;
    b.vx *= damp; b.vy *= damp;
    const sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
    if (sp > 330) { b.vx *= 330 / sp; b.vy *= 330 / sp; }
    b.x += b.vx * DT; b.y += b.vy * DT;
    const ci = Math.floor(b.x / CELL), cj = Math.floor(b.y / CELL);
    if (ci >= 0 && cj >= 0 && ci < CW && cj < CH) for (const i of cells[cj * CW + ci]) collideSeg(b, segs[i], S);
    if (b.y < 25) collideBumpers(b, S);
    if (b.y > 40) { collideFlipper(b, 0, S); collideFlipper(b, 1, S); }
    if (b.y > 66) { b.on = false; S.events.push([S.t, 3, 0]); }
  }
  // ball against ball (multiball)
  for (let i = 0; i < NB; i++) for (let j = i + 1; j < NB; j++) {
    const a = S.balls[i], c = S.balls[j];
    if (!a.on || !c.on) continue;
    let nx = c.x - a.x, ny = c.y - a.y;
    const d = Math.sqrt(nx * nx + ny * ny);
    if (d >= 2 * BALL_R || d < 1e-9) continue;
    nx /= d; ny /= d;
    const o = (2 * BALL_R - d) / 2;
    a.x -= nx * o; a.y -= ny * o; c.x += nx * o; c.y += ny * o;
    const vn = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny;
    if (vn < 0) { const j2 = -0.92 * vn; a.vx -= j2 * nx; a.vy -= j2 * ny; c.vx += j2 * nx; c.vy += j2 * ny; }
  }
  S.t += DT;
}

// ------------------------------------------------------------- recording
const STRIDE = NB * 3 + 2;
function recorder(seconds) {
  const n = Math.ceil(seconds * REC_HZ) + 2;
  return { data: new Float32Array(n * STRIDE), n: 0 };
}
function record(R, S) {
  const o = R.n * STRIDE;
  if (o + STRIDE > R.data.length) return;
  for (let i = 0; i < NB; i++) { const b = S.balls[i]; R.data[o + 3 * i] = b.x; R.data[o + 3 * i + 1] = b.y; R.data[o + 3 * i + 2] = b.on ? 1 : 0; }
  R.data[o + NB * 3] = S.fl[0].a; R.data[o + NB * 3 + 1] = S.fl[1].a;
  R.n++;
}
/** Sample a record at time t (s from its start): fills out[] like a frame of STRIDE. */
export function sampleRec(R, t, out) {
  let f = t * REC_HZ;
  if (f < 0) f = 0;
  if (f > R.n - 1) f = R.n - 1;
  const i = Math.floor(f), u = f - i, j = Math.min(R.n - 1, i + 1), A = i * STRIDE, B = j * STRIDE;
  for (let k = 0; k < STRIDE; k++) out[k] = R.data[A + k] + (R.data[B + k] - R.data[A + k]) * u;
  for (let b = 0; b < NB; b++) {
    const onA = R.data[A + 3 * b + 2], onB = R.data[B + 3 * b + 2];
    out[3 * b + 2] = onA && onB ? 1 : 0;
    if (onA && !onB) { out[3 * b] = R.data[A + 3 * b]; out[3 * b + 1] = R.data[A + 3 * b + 1]; }
  }
  return out;
}
export { STRIDE };

// -------------------------------------------------------- the skill shot
// Plunge, ride the orbit, catch on the raised left flipper, cradle, then a
// drop-and-flip whose timing is searched so the ball strikes the minute target.
const LAUNCH_V = 205;
function runShot(flipAt, maxT = 9, rec = null) {
  const S = newState();
  const b = S.balls[0];
  Object.assign(b, { x: T.lanex, y: T.laneRest, vx: 0, vy: -LAUNCH_V, on: true });
  while (S.t < maxT) {
    // the player: one flip of the left flipper as the ball rolls off the inlane
    S.fl[0].up = S.t >= flipAt && S.t < flipAt + 0.3;
    for (let k = 0; k < REC; k++) { step(S); if (S.hit >= 0) break; }
    if (rec) record(rec, S);
    if (S.hit >= 0 || !b.on) break;
  }
  return S;
}

const SHOTS = [];
/**
 * The skill shot aimed at target k, found once: { rec, dur (plunge to hit),
 * end (state at the hit), flipAt, width (s of flip timing that still hits) }.
 */
export function shot(k) {
  if (SHOTS[k]) return SHOTS[k];
  // timings found by the search below, kept so the face loads fast
  const KNOWN = [1.138, 1.096, 1.105, 1.111];
  {
    const rec = recorder(4), S = runShot(KNOWN[k], 4, rec);
    if (S.hit === k) return (SHOTS[k] = { rec, dur: S.t, end: S, flipAt: KNOWN[k] });
  }
  const ok = [], STEPF = 0.001, F0 = 1.0;
  for (let f = F0; f <= 1.45; f += STEPF) ok.push(runShot(f, 3).hit === k ? 1 : 0);
  // the middle of the widest run of hits: robust to tiny changes
  let bs = -1, bl = 0;
  for (let i = 0; i < ok.length;) {
    if (!ok[i]) { i++; continue; }
    let j = i; while (j < ok.length && ok[j]) j++;
    if (j - i > bl) { bl = j - i; bs = i; }
    i = j;
  }
  if (bl < 2) throw new Error('pinball: no skill shot reaches target ' + k);
  const flipAt = F0 + (bs + (bl - 1) / 2) * STEPF;
  const rec = recorder(4);
  const S = runShot(flipAt, 4, rec);
  SHOTS[k] = { rec, dur: S.t, end: S, flipAt, width: bl * STEPF };
  return SHOTS[k];
}
export { newState, cloneState, step, record, recorder, rng, DT, REC, LAUNCH_V };

// ------------------------------------------------------------ one minute
const pad2 = (n) => String(n).padStart(2, '0');
/** The four digits shown during minute-of-day m. */
export const digitsOf = (m) => pad2(Math.floor(m / 60) % 24) + pad2(m % 60);
/** Which of the four digits change as minute m begins. */
export function changedAt(m) {
  const a = digitsOf((m + 1439) % 1440), b = digitsOf(m);
  return [0, 1, 2, 3].map((k) => a[k] !== b[k]);
}
/** The bank target the skill shot arriving at minute m aims for: its most significant change. */
export const aimOf = (m) => changedAt(m).indexOf(true);
export const RESET = 2.6;         // dropped targets pop back up
export const AI_END = 51, RELAUNCH_END = 48, PULL = 1.5;

const MINUTES = new Map(), JOBS = new Map();
/** A resumable computation of minute m: a generator that yields while it works. */
function* job(m) {
  const aim = aimOf(m), next = aimOf((m + 1) % 1440);
  const plunge = 60 - shot(next).dur;
  let res = null, tries = 0;
  for (let tryN = 0; tryN < 12 && !res; tryN++) { tries++; res = yield* runMinute(m, aim, plunge, tryN); }
  if (!res) res = yield* runMinute(m, aim, plunge, 99, true);
  res.plunge = plunge; res.aim = aim; res.next = next; res.tries = tries;
  return res;
}
function finish(m, res) {
  JOBS.delete(m);
  if (MINUTES.size > 4) MINUTES.delete(MINUTES.keys().next().value);
  MINUTES.set(m, res);
  return res;
}
/**
 * Minute-of-day m, simulated from the bank hit at t = 0 to the last drain.
 * { rec, events [[t, kind, id]], lanes [{ appear, pull, launch, v }], final (ball waits in the lane from), plunge, aim }
 */
export function minute(m) {
  m = ((m % 1440) + 1440) % 1440;
  if (MINUTES.has(m)) return MINUTES.get(m);
  const g = JOBS.get(m) ?? job(m);
  let r;
  do r = g.next(); while (!r.done);
  return finish(m, r.value);
}
/** Work on minute m ahead of time for about `ms` milliseconds (spread over many frames). */
export function prefetch(m, ms = 1.5) {
  m = ((m % 1440) + 1440) % 1440;
  if (MINUTES.has(m)) return;
  if (!JOBS.has(m)) JOBS.set(m, job(m));
  const g = JOBS.get(m), t0 = performance.now();
  while (performance.now() - t0 < ms) { const r = g.next(); if (r.done) { finish(m, r.value); return; } }
}

function* runMinute(m, aim, plunge, tryN, force = false) {
  const R = rng(m * 7919 + tryN * 104729 + 17);
  const S = cloneState(shot(aim).end);
  S.t = 0; S.hit = -1;
  const ch = changedAt(m), multi = m % 60 === 0;
  S.down = ch.slice();
  // a slightly different rebound each minute
  const b0 = S.balls[0], ang = (R() - 0.5) * 0.5, sc = 0.85 + 0.3 * R();
  const c = Math.cos(ang), s = Math.sin(ang), vx = b0.vx, vy = b0.vy;
  b0.vx = (c * vx - s * vy) * sc; b0.vy = (s * vx + c * vy) * sc;
  const rec = recorder(61), lanes = [], ai = [{ hold: S.fl[0].up ? 0.12 : -1, cool: 0 }, { hold: S.fl[1].up ? 0.12 : -1, cool: 0 }];
  let final = -1, pending = null, ejected = 0;
  const deadline = plunge - PULL - 0.9;
  while (S.t < 60) {
    const t = S.t;
    if (S.down.some(Boolean) && t >= RESET) S.down = [false, false, false, false];
    if (multi && ejected < 2 && t >= 0.9 + ejected * 0.8) {
      const b = S.balls[1 + ejected];
      Object.assign(b, { x: T.saucer.x, y: T.saucer.y, vx: (ejected ? 1 : -1) * (55 + 30 * R()), vy: 10 + 20 * R(), on: true });
      ejected++;
    }
    if (pending && t >= pending.launch) {
      Object.assign(S.balls[0], { x: T.lanex, y: T.laneRest, vx: 0, vy: -pending.v, on: true });
      pending = null;
    }
    // the player
    for (let k = 0; k < 2; k++) {
      const f = T.flippers[k], A = ai[k], st = S.fl[k];
      if (A.hold >= 0) { if (t >= A.hold) { st.up = false; A.hold = -1; A.cool = t + 0.12; } continue; }
      if (t < AI_END && t >= A.cool) {
        const [ux, uy] = flipperDir(k, f.rest), nx = uy * f.side, ny = -ux * f.side;
        for (const b of S.balls) {
          if (!b.on) continue;
          const rx = b.x - f.x, ry = b.y - f.y, al = rx * ux + ry * uy, ac = rx * nx + ry * ny;
          if (al > f.len * 0.3 && al < f.len + 2 && ac > 0.5 && ac < 6 && b.vy > -25) {
            if (R() < 0.035) { A.cool = t + 0.5; break; }                // missed it
            if (al < f.len * (0.35 + 0.55 * R())) break;                  // waits for it to roll further
            st.up = true; A.hold = t + 0.16 + 0.22 * R();
            break;
          }
        }
      }
    }
    for (let k = 0; k < REC; k++) step(S);
    record(rec, S);
    if ((rec.n & 31) === 0) yield;
    if (!S.balls.some((b) => b.on) && !pending && final < 0) {
      if (S.t < RELAUNCH_END) {
        pending = { appear: S.t + 0.5, pull: S.t + 0.8, launch: S.t + 1.9, v: 150 + 65 * R() };
        lanes.push(pending);
      } else { final = S.t + 0.5; break; }
    }
    if (S.t > deadline && !force) return null;
  }
  if (final < 0) final = force ? 99 : -1;
  return { rec, events: S.events, lanes, final, multi };
}
