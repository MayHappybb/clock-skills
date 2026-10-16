// marionette: the choreography. Everything here is a pure function of the
// wall clock: plan(date) says, for this instant, where each control bar is,
// how each puppet stands, where the two hands are and what they hold.
//
// A minute, for the two hands of the puppeteer:
//   0 - 6 s     the changed puppet is lowered in on its strings, lands, bows,
//               is hooked on the rail (hour: the whole rail comes down and
//               the troupe does a kick line)
//   7 - 52 s    acts: a hand unhooks one puppet and makes it dance for six
//               seconds (walk, jig, wave, jump, kick, sway), then hooks it back
//   54 - 59.6 s the puppet about to change waves and is flown up out of sight
//               (hour: the hands take the rail itself; a curtain call, then
//               the whole troupe flies)

import { clockFields, ease, progress, clamp, lerp, sin, rand } from '../js/kit.js';

export const SLOT_X = [29, 54, 106, 131];
export const RAIL_Y = 7;                 // the leaning rail the controls hang on
export const HOOK_Y = 11;                // a hooked control's bar
export const STAND_OY = 34;              // a standing puppet's glyph origin
export const STR = STAND_OY - HOOK_Y;    // head-string length, as a drop
export const COLON_X = 80;
const HOME = [[67, 8.5], [93, 8.5]];         // the hands rest on the rail here
const GONE = -78;                        // a control this high has its puppet out of sight

const TAU = Math.PI * 2;
const hump = (s, a, b) => { const u = progress(s, a, b); return u > 0 && u < 1 ? sin(Math.PI * u) : 0; };
const pos = (v) => (v > 0 ? v : 0);

// ------------------------------------------------------------ poses

/** A puppet at rest: arms hanging a little out, legs straight. */
export function restPose() {
  return { dx: 0, dy: 0, roll: 0, leg: 0, tilt: 0, bow: 0, arm: [[0.25, 0.2], [0.25, 0.2]], knee: [0, 0], hip: [0.06, 0.06] };
}

function mixPose(a, b, u) {
  if (u <= 0) return a;
  if (u >= 1) return b;
  const L = (x, y) => x + (y - x) * u;
  return {
    dx: L(a.dx, b.dx), dy: L(a.dy, b.dy), roll: L(a.roll, b.roll), leg: L(a.leg, b.leg),
    tilt: L(a.tilt, b.tilt), bow: L(a.bow, b.bow),
    arm: [[L(a.arm[0][0], b.arm[0][0]), L(a.arm[0][1], b.arm[0][1])], [L(a.arm[1][0], b.arm[1][0]), L(a.arm[1][1], b.arm[1][1])]],
    knee: [L(a.knee[0], b.knee[0]), L(a.knee[1], b.knee[1])],
    hip: [L(a.hip[0], b.hip[0]), L(a.hip[1], b.hip[1])],
  };
}

/** The moves a hand can work a puppet through; u is seconds into the move. */
export const MOVES = {
  walk(u) {   // the paddle walk: the control rocks, the legs lift in turn, the puppet strolls its slot
    const w = TAU * u / 1.3, sw = sin(w);
    const p = restPose();
    p.dx = 3.5 * sin(TAU * u / 5.2);
    p.dy = -0.7 * Math.abs(sw);
    p.knee = [pos(sw) * 0.85, pos(-sw) * 0.85];
    p.roll = 0.22 * sw; p.leg = 0.4 * sw; p.tilt = -0.05 * sw;
    p.arm = [[0.3 + 0.4 * sw, 0.35], [0.3 - 0.4 * sw, 0.35]];
    return p;
  },
  jig(u) {    // quick alternating knees, hopping, hands up
    const w = TAU * u * 1.7, sw = sin(w);
    const p = restPose();
    p.dy = -2.2 * Math.abs(sw);
    p.knee = [pos(sw), pos(-sw)];
    p.roll = 0.12 * sw; p.leg = 0.45 * sw; p.tilt = 0.07 * sin(w / 2);
    p.arm = [[2.3 + 0.25 * sin(w * 2), 0.5], [2.3 - 0.25 * sin(w * 2), 0.5]];
    return p;
  },
  wave(u, side) {   // one arm up, the forearm waving; the other on the hip
    const p = restPose(), o = 1 - side;
    p.arm[side] = [2.55, 0.55 + 0.55 * sin(TAU * u * 2.1)];
    p.arm[o] = [0.75, -1.9];
    p.tilt = (side ? 1 : -1) * 0.07 + 0.02 * sin(TAU * u * 2.1);
    p.roll = (side ? 1 : -1) * 0.12;
    p.dy = -0.5 * Math.abs(sin(TAU * u * 1.05));
    p.knee[o] = 0.25 + 0.2 * sin(TAU * u * 1.05);
    return p;
  },
  jump(u) {   // two big jumps on the strings: crouch, up with legs dangling, land and crouch
    const p = restPose(), ph = (u % 2.6) / 2.6;
    const air = hump(ph, 0.18, 0.62), crouch = hump(ph, 0, 0.18) + hump(ph, 0.62, 0.86);
    p.dy = -11 * air + 3.2 * crouch;
    p.knee = [0.45 * air, 0.35 * air];
    p.hip = [0.06 + 0.25 * air, 0.06 + 0.25 * air];
    p.arm = [[0.3 + 2.1 * air, 0.3], [0.3 + 2.1 * air, 0.3]];
    p.roll = 0.05 * sin(TAU * ph);
    p.tilt = 0.06 * air * sin(TAU * u);
    return p;
  },
  kick(u, side = 0, sync = false) {   // high side kicks in turn, arms out like a chorus girl
    const w = TAU * u * (sync ? 1.25 : 1.05) + (side ? Math.PI : 0), sw = sin(w);
    const p = restPose();
    const kl = pos(sw), kr = pos(-sw);
    p.hip = [0.06 + 1.25 * kl * kl, 0.06 + 1.25 * kr * kr];
    p.knee = [0.15 * kl, 0.15 * kr];
    p.arm = [[1.45 + 0.15 * sw, 0.15], [1.45 - 0.15 * sw, 0.15]];
    p.tilt = 0.08 * sw;
    p.dy = -0.8 * Math.abs(sw);
    p.leg = 0.5 * sw; p.roll = 0.08 * sw;
    return p;
  },
  sway(u) {   // a slow waltz sway, arms floating
    const w = TAU * u / 2.3, sw = sin(w);
    const p = restPose();
    p.dx = 2.5 * sw; p.tilt = 0.15 * sw; p.roll = 0.25 * sw;
    p.arm = [[1.7 + 0.7 * sw, 0.8], [1.7 - 0.7 * sw, 0.8]];
    p.knee = [0.3 * pos(-sw), 0.3 * pos(sw)];
    p.dy = -0.6 * Math.abs(sw);
    return p;
  },
  bow(u, dur = 1.8) {   // the cut-out folds forward at the hips: foreshortened, arms forward
    const b = hump(u, 0, dur), p = restPose();
    p.bow = 0.75 * b; p.dy = 1.2 * b;
    p.arm = [[0.25 + 0.9 * b, 0.2 + 0.6 * b], [0.25 + 0.9 * b, 0.2 + 0.6 * b]];
    p.roll = -0.05 * b;
    return p;
  },
};
const REST_MOVES = ['walk', 'jig', 'wave', 'jump', 'kick', 'sway'];
const NIGHT_MOVES = ['walk', 'wave', 'sway'];

/** A hooked puppet idling: a slow sway, breathing. */
function idlePose(i, tod) {
  const p = restPose();
  p.tilt = 0.03 * sin(tod * 1.1 + i * 1.9);
  p.roll = 0.04 * sin(tod * 1.1 + i * 1.9 - 0.5);
  p.arm = [[0.22 + 0.05 * sin(tod * 0.9 + i), 0.2], [0.22 + 0.05 * sin(tod * 0.9 + i + 2), 0.2]];
  return p;
}

// ------------------------------------------------------------ jobs

const digitsOf = (f) => f.hh + f.mm;
function turnKind(a, b) {
  if (a.slice(0, 2) !== b.slice(0, 2)) return 'hour';
  if (a[2] !== b[2]) return 'tens';
  return 'unit';
}

/** A hand's jobs this minute: rest acts, and the turns at either end. */
function jobsFor(f, prv, nxt, night) {
  const cur = digitsOf(f), inKind = turnKind(digitsOf(prv), cur), outKind = turnKind(cur, digitsOf(nxt));
  const jobs = [[], []];
  // -- the turn into this minute
  if (inKind === 'hour') {
    for (const h of [0, 1]) jobs[h].push({ kind: 'railIn', t0: 0, t1: 8.6, enter: true });
  } else {
    jobs[1].push({ kind: 'flyIn', slot: 3, t0: 0, t1: 5.55, T: 0.3, enter: true });
    if (inKind === 'tens') jobs[0].push({ kind: 'flyIn', slot: 2, t0: 0, t1: 6.05, T: 0.75, enter: true });
  }
  // -- the turn out of it
  if (outKind === 'hour') {
    for (const h of [0, 1]) jobs[h].push({ kind: 'railOut', t0: 54.2 + 0.15 * h, t1: 60, exit: true });
  } else {
    jobs[1].push({ kind: 'flyOut', slot: 3, t0: 55.0, t1: 60, exit: true });
    if (outKind === 'tens') jobs[0].push({ kind: 'flyOut', slot: 2, t0: 54.7, t1: 60, exit: true });
  }
  // -- the acts between
  const first = inKind === 'hour' ? 10.6 : 7.4;
  const ACTS = [[[7.4, 14], [21, 27.5], [34.5, 41], [46, 52.5]], [[10.8, 17.4], [24.4, 31], [38, 44.6]]];
  const pool = night ? NIGHT_MOVES : REST_MOVES;
  for (const h of [0, 1]) {
    const flip = rand(f.minuteKey, h, 7) < 0.5 ? 0 : 1;
    ACTS[h].forEach(([a, b], k) => {
      if (a < first) return;
      const slot = h * 2 + ((k + flip) % 2);
      const move = pool[Math.floor(rand(f.minuteKey, h * 10 + k, 3) * pool.length)];
      const side = rand(f.minuteKey, h * 10 + k, 5) < 0.5 ? 0 : 1;
      jobs[h].push({ kind: 'act', slot, t0: a, t1: b, move, side });
    });
  }
  return { jobs, inKind, outKind, cur };
}

/** Rail height and tilt (rail y at x is RAIL_Y + dy + tilt * (80 - x)). */
function railState(s, inKind, outKind) {
  let dy = 0, tilt = 0;
  if (inKind === 'hour' && s < 9) {
    const u = progress(s, 0.3, 3.0);
    dy = lerp(-92, 0, ease.inOutQuad(u)) + 2.6 * hump(s, 2.75, 3.5);
    tilt = 0.075 * (1 - ease.outQuad(progress(s, 1.5, 3.3)));
    if (s > 3.6) dy -= 1.2 * Math.abs(sin(TAU * (s - 3.6) * 1.25)) * (1 - progress(s, 8, 8.6));
  }
  if (outKind === 'hour' && s > 54) {
    dy = 2.2 * hump(s, 54.3, 54.8) - 92 * ease.inOutCubic(progress(s, 55.6, 59.3));
    tilt = -0.07 * ease.inOutQuad(progress(s, 55.4, 57.5));
  }
  return { dy, tilt };
}
export const railY = (r, x) => RAIL_Y + r.dy + r.tilt * (80 - x);

// ------------------------------------------------------------ the instant

/**
 * Everything at `date`: slots [{ d, show, ctrl: {x,y,roll,leg}, pose, ox, oy, lit }],
 * hands [{ x, y, grip, tilt }], rail { dy, tilt }, colon angle.
 */
export function plan(date, night = 0) {
  const f = clockFields(date), s = f.sec;
  const tod = f.h * 3600 + f.m * 60 + s;
  const prv = clockFields(new Date(date.getTime() - 60000));
  const nxt = clockFields(new Date(date.getTime() + 60000));
  const { jobs, inKind, outKind, cur } = jobsFor(f, prv, nxt, night > 0.5);
  const rail = railState(s, inKind, outKind);

  const slots = [0, 1, 2, 3].map((i) => {
    const hy = railY(rail, SLOT_X[i]) + (HOOK_Y - RAIL_Y);
    return { i, d: +cur[i], show: true, held: false, lit: 0, pose: idlePose(i, tod), ctrl: { x: SLOT_X[i], y: hy, roll: 0, leg: 0 } };
  });
  const hands = [0, 1].map((h) => ({ x: HOME[h][0], y: HOME[h][1], grip: 0.25, tilt: 0, idle: 1 }));

  // a slot under a job, at time s
  const work = (job, s) => {
    const sl = slots[job.slot], X = SLOT_X[job.slot];
    let p = restPose(), y = HOOK_Y, x = X;
    if (job.kind === 'act') {
      const lift = -2 * (hump(s, job.t0, job.t0 + 0.45) + hump(s, job.t1 - 0.45, job.t1));
      const env = ease.inOutQuad(progress(s, job.t0 + 0.3, job.t0 + 1.0) * (1 - progress(s, job.t1 - 1.0, job.t1 - 0.3)));
      const u = Math.max(0, s - job.t0 - 0.3);
      const mv = night > 0.5 ? (uu, sd) => MOVES[job.move](uu * 0.75, sd) : MOVES[job.move];
      p = mixPose(restPose(), mv(u, job.side), env);
      y += lift;
    } else if (job.kind === 'flyOut') {
      const T = job.t0;
      y += -2 * hump(s, T, T + 0.45);
      const wave = progress(s, T + 0.35, T + 0.7) * (1 - progress(s, T + 1.6, T + 2.2));
      p = mixPose(restPose(), MOVES.wave(s - T, 1), wave);
      const u = progress(s, T + 1.0, T + 4.5);
      y += (GONE - HOOK_Y) * ease.inOutCubic(u);
      const dang = progress(s, T + 1.0, T + 1.8);
      p.tilt += 0.12 * dang * sin(TAU * (s - T - 1.0) / 1.25);
      p.hip = [0.06 + dang * (0.12 + 0.1 * sin(TAU * (s - T) / 0.9)), 0.06 + dang * (0.12 - 0.1 * sin(TAU * (s - T) / 0.9))];
      p.knee = [0.25 * dang, 0.3 * dang];
      p.arm = p.arm.map(([a, b]) => [a + 0.5 * dang, b + 0.3 * dang]);
    } else if (job.kind === 'flyIn') {
      const T = job.T;
      const u = progress(s, T, T + 2.5);
      y = lerp(GONE, HOOK_Y + 3.2, ease.inOutQuad(u));
      y = lerp(y, HOOK_Y, ease.outQuad(progress(s, T + 2.5, T + 3.1)));
      const dang = 1 - progress(s, T + 2.0, T + 2.5);
      p.hip = [0.06 + 0.2 * dang, 0.06 + 0.2 * dang];
      p.knee = [0.35 * dang, 0.3 * dang];
      p.arm = [[0.3 + 1.3 * dang, 0.4], [0.3 + 1.3 * dang, 0.4]];
      p.tilt = 0.1 * dang * sin(TAU * (s - T) / 1.3);
      const bt = T + 3.1;
      if (s > bt) p = mixPose(p, MOVES.bow(s - bt, 1.8), 1);
      y += -2 * hump(s, job.t1 - 0.45, job.t1);
      x = X;
    }
    sl.held = true;
    sl.pose = p;
    sl.ctrl = { x: x + p.dx, y: y + p.dy, roll: p.roll, leg: p.leg };
  };

  // rail jobs: every puppet rides the rail
  const railPose = (s) => {
    if (inKind === 'hour' && s < 9) {
      for (const sl of slots) {
        const dang = 1 - progress(s, 2.2 + 0.25 * sl.i, 2.9 + 0.2 * sl.i);
        let p = restPose();
        p.hip = [0.06 + 0.2 * dang, 0.06 + 0.2 * dang];
        p.knee = [0.35 * dang, 0.3 * dang];
        p.arm = [[0.3 + 1.2 * dang, 0.4], [0.3 + 1.2 * dang, 0.4]];
        p.tilt = 0.08 * dang * sin(TAU * (s - 0.3 * sl.i) / 1.3);
        const kenv = progress(s, 3.6, 4.2) * (1 - progress(s, 7.9, 8.5));
        p = mixPose(p, MOVES.kick(s - 3.6, 0, true), kenv);
        sl.pose = p; sl.held = true;
        sl.ctrl = { ...sl.ctrl, roll: p.roll, leg: p.leg, x: SLOT_X[sl.i] };
      }
    }
    if (outKind === 'hour' && s > 54) {
      for (const sl of slots) {
        let p = mixPose(restPose(), MOVES.bow(s - 54.5 - 0.12 * sl.i, 1.6), 1);
        const dang = progress(s, 55.8, 56.6);
        p.tilt += 0.1 * dang * sin(TAU * (s - 55.8 + 0.3 * sl.i) / 1.3);
        p.hip = [0.06 + 0.2 * dang, 0.06 + 0.2 * dang];
        p.knee = [0.3 * dang, 0.3 * dang];
        sl.pose = p; sl.held = true;
        sl.ctrl = { ...sl.ctrl, roll: p.roll, leg: p.leg };
      }
    }
  };
  railPose(s);

  for (const h of [0, 1]) {
    const hand = hands[h];
    for (const job of jobs[h]) {
      const a = job.enter ? job.t0 : job.t0 - 0.9, b = job.exit ? job.t1 : job.t1 + 0.9;
      if (s < a || s >= b) continue;
      const isRail = job.kind === 'railIn' || job.kind === 'railOut';
      const gripAt = (tt) => {
        if (isRail) { const gx = h ? 118 : 42; return [gx, railY(railState(tt, inKind, outKind), gx) + 0.5, 0]; }
        const tmp = slots[job.slot].ctrl, keep = { ...slots[job.slot] };
        work(job, tt);
        const c = slots[job.slot].ctrl, r = [c.x, c.y - 0.5, c.roll];
        Object.assign(slots[job.slot], keep); slots[job.slot].ctrl = tmp;
        return r;
      };
      if (!isRail && s >= job.t0 && s <= job.t1) work(job, s);
      const lit = progress(s, job.t0 - 0.7, job.t0) * (1 - progress(s, job.t1, job.t1 + 0.8));
      if (!isRail) slots[job.slot].lit = Math.max(slots[job.slot].lit, lit);
      else for (const sl of slots) sl.lit = Math.max(sl.lit, lit);
      hand.idle = 0;
      if (s < job.t0) {            // reaching for it
        const [gx, gy] = gripAt(job.t0), u = ease.inOutQuad(progress(s, a, job.t0 - 0.1));
        hand.x = lerp(HOME[h][0], gx, u); hand.y = lerp(HOME[h][1], gy, u) - 3 * sin(Math.PI * u);
        hand.grip = lerp(0.25, 0, progress(s, a, a + 0.3)) + progress(s, job.t0 - 0.3, job.t0);
        hand.idle = 1 - u;
      } else if (s <= job.t1) {    // holding it
        const [gx, gy, roll] = gripAt(s);
        hand.x = gx; hand.y = gy; hand.grip = 1; hand.tilt = roll;
      } else {                     // putting it back, going home
        const [gx, gy] = gripAt(job.t1), u = ease.inOutQuad(progress(s, job.t1 + 0.1, b));
        hand.x = lerp(gx, HOME[h][0], u); hand.y = lerp(gy, HOME[h][1], u) - 3 * sin(Math.PI * u);
        hand.grip = 1 - progress(s, job.t1, job.t1 + 0.3) + 0.25 * progress(s, b - 0.3, b);
        hand.idle = u;
      }
    }
  }

  // bodies follow controls; a puppet on the floor stands, legs take a crouch
  for (const sl of slots) {
    sl.ox = sl.ctrl.x;
    sl.oy = sl.ctrl.y + STR;
    if (sl.oy + 57 < 0) sl.show = false;
  }
  // the colon: a seconds pendulum hung from the rail, two beads on one thread
  const colon = 0.075 * sin(Math.PI * (s - 0.5));
  return { f, s, tod, slots, hands, rail, colon, inKind, outKind };
}
