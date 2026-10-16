// fighter: the moves, and the choreography of one minute (one round).
//
// Each minute is a round: the hour's champion (left) against that minute's
// challenger (right). The round is written once per minute from a seed (the
// minute key) as a list of clips per fighter (a move, its start and end
// time, where it starts and ends on the stage) and a list of events (hits,
// blocks, fireballs, landings, the super, the K.O.). frame() only looks
// things up at the second it is asked for, so any instant has an answer.
//
//   0.0 - 2.6   the challenger leaps in; "HERE COMES A NEW CHALLENGER", FIGHT!
//   2.6 - 53.6  exchanges, seeded: pokes, kicks, sweeps, fireballs (jumped,
//               blocked or eaten), jump-ins, anti-air uppercuts, spin kicks
//   53.6        both square off at fixed marks
//   54.6        the champion's super: the flash, the dash, a five-hit combo,
//               the uppercut that launches the challenger: K.O. at ~57.5
//   59.1        the loser blinks out, as beaten fighters did
//
// The challenger's life bar is the seconds: every hit he takes sets it to
// the part of the minute still to go. The champion's bar is the hour: it
// starts the round at (60 - minute) / 60 and the challenger's hits chip one
// sixtieth off it. In round 59 the order turns: the challenger, on his last
// sliver, lands the super and K.O.s the hour, and stays on as the next
// hour's champion.
import { rng } from '../js/kit.js';
import { POSE, blend } from './fighter-rig.js';

export const SW = 256;        // stage width (world px)
export const H_HOME = 84, M_HOME = 140;
const WALK = 42, ENTER_X = SW + 8;

const io = (u) => (u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ------------------------------------------------------------ moves

/** Keyframed moves: keys [time, pose], optional jump arcs [t0, t1, height]. */
const K = (keys, extra = {}) => ({ keys: keys.map(([t, p]) => [t, typeof p === 'string' ? POSE[p] : p]), dur: keys[keys.length - 1][0], ...extra });
export const MOVES = {
  jab: K([[0, 'stance'], [0.05, 'jabOut'], [0.12, 'jabOut'], [0.26, 'stance']]),
  strong: K([[0, 'stance'], [0.1, 'strongWind'], [0.17, 'strongOut'], [0.28, 'strongOut'], [0.45, 'stance']]),
  kick: K([[0, 'stance'], [0.12, 'kickChamber'], [0.22, 'kickOut'], [0.36, 'kickOut'], [0.48, 'kickChamber'], [0.6, 'stance']]),
  sweep: K([[0, 'stance'], [0.1, 'crouch'], [0.26, 'sweepOut'], [0.42, 'sweepOut'], [0.55, 'crouch'], [0.7, 'stance']]),
  fireball: K([[0, 'stance'], [0.2, 'fbWind'], [0.33, 'fbWind'], [0.39, 'fbOut'], [0.7, 'fbOut'], [0.85, 'stance']]),
  uppercut: K([[0, 'stance'], [0.1, 'upWind'], [0.2, 'upRise'], [0.55, 'upRise'], [0.66, 'jumpTuck'], [0.8, 'stance']], { air: [[0.14, 0.74, 26]] }),
  jumpKick: K([[0, 'stanceLow'], [0.08, 'jumpTuck'], [0.36, 'jumpTuck'], [0.48, 'jumpKick'], [0.68, 'jumpKick'], [0.76, 'stanceLow']], { air: [[0.06, 0.72, 22]] }),
  jump: K([[0, 'stanceLow'], [0.08, 'jumpTuck'], [0.62, 'jumpTuck'], [0.76, 'stanceLow']], { air: [[0.06, 0.72, 27]] }),
  enter: K([[0, 'jumpTuck'], [0.62, 'jumpTuck'], [0.72, 'stanceLow'], [0.95, 'stance']], { air: [[-0.2, 0.68, 30]] }),
  hopBack: K([[0, 'stance'], [0.08, 'jumpTuck'], [0.37, 'jumpTuck'], [0.46, 'stance']], { air: [[0.04, 0.42, 9]] }),
  dash: K([[0, 'dash'], [0.2, 'dash'], [0.26, 'stance']]),
  charge: K([[0, 'stance'], [0.15, 'charge'], [0.8, 'charge']]),
  taunt: K([[0, 'stance'], [0.2, 'taunt'], [0.7, 'taunt'], [0.9, 'stance']]),
  bow: K([[0, 'stance'], [0.3, 'bow'], [0.7, 'bow'], [1.0, 'stance']]),
  trip: K([[0, 'hurtLow'], [0.22, 'flyBack'], [0.4, 'lying'], [0.95, 'lying'], [1.2, 'sitUp'], [1.42, 'kneel'], [1.7, 'stance']], { air: [[0.0, 0.4, 7]] }),
  launch: K([[0, 'hurt'], [0.12, 'flyBack'], [0.8, 'flyBack'], [0.95, 'lying'], [1.45, 'lying'], [1.7, 'sitUp'], [1.95, 'kneel'], [2.25, 'stance']],
    { air: [[0, 0.82, 26], [0.84, 1.04, 5]] }),
  launchKO: K([[0, 'hurt'], [0.15, 'flyBack'], [1.0, 'flyBack'], [1.18, 'lying'], [9, 'lying']], { air: [[0, 1.02, 30], [1.05, 1.32, 6]] }),
  victory: K([[0, 'stance'], [0.3, 'victory'], [9, 'victory']]),
  turn: K([[0, 'turn'], [0.3, 'stance']]),
  spin: { dur: 0.9, spin: true, air: [[0, 0.9, 10]] },
  idle: { dur: 99, idle: true },
  guard: { dur: 99, guard: true },
  walk: { dur: 99, walk: true },
};

/** A move's pose and height at local time lt. */
function movePose(mv, lt, clip) {
  const M = MOVES[mv];
  if (M.idle) {
    const b = 0.5 + 0.5 * Math.sin((clip.t0 + lt) * 2 * Math.PI * 1.5 + clip.phase);
    return { pose: blend(POSE.stance, POSE.stanceLow, b), h: 0 };
  }
  if (M.guard) return { pose: POSE.stance, h: 0 };
  if (M.walk) {
    const travelled = Math.abs(clip.x1 - clip.x0) * clamp(lt / (clip.t1 - clip.t0), 0, 1);
    const ph = travelled / 15 * Math.PI + clip.phase;
    return { pose: blend(POSE.walkA, POSE.walkB, 0.5 + 0.5 * Math.sin(ph)), h: 0 };
  }
  let pose;
  if (M.spin) pose = POSE.spinA;
  else {
    const ks = M.keys;
    if (lt <= ks[0][0]) pose = ks[0][1];
    else if (lt >= ks[ks.length - 1][0]) pose = ks[ks.length - 1][1];
    else {
      let i = 1;
      while (ks[i][0] < lt) i++;
      const [ta, pa] = ks[i - 1], [tb, pb] = ks[i];
      pose = blend(pa, pb, io((lt - ta) / (tb - ta || 1)));
    }
  }
  let h = 0;
  for (const [a, b, H] of M.air ?? []) {
    if (lt > a && lt < b) {
      const u = (lt - a) / (b - a);
      h = M.spin ? H * Math.min(1, u * 5, (1 - u) * 5) : 4 * H * u * (1 - u);
    }
  }
  return { pose, h };
}

// ------------------------------------------------------------ the round

const CACHE = new Map();

/**
 * The round for one minute. `minute` is 0..59 (decides who wins), `key` the
 * minute key (the seed). Cached: a pure function of its arguments.
 */
export function round(key, minute) {
  const ck = key * 64 + minute;
  if (CACHE.has(ck)) return CACHE.get(ck);
  const r = buildRound(key, minute);
  if (CACHE.size > 6) CACHE.delete(CACHE.keys().next().value);
  CACHE.set(ck, r);
  return r;
}

function buildRound(key, minute) {
  const R = rng(key * 7 + 3);
  const pick = (arr) => arr[Math.floor(R() * arr.length)];
  const clips = { H: [], M: [] };
  const ev = { hits: [], proj: [], land: [], text: [], supers: [], combo: [] };
  const pos = { H: H_HOME, M: M_HOME };
  const FACE = { H: 1, M: -1 };
  const other = (f) => (f === 'H' ? 'M' : 'H');
  const hourTurn = minute === 0;
  const add = (f, mv, t0, t1, x0, x1, o = {}) => {
    const c = { f, mv, t0, t1, x0, x1, face: FACE[f], phase: R() * 6, pushes: [], ...o };
    clips[f].push(c);
    pos[f] = x1;
    return c;
  };
  const hit = (t, tgt, kind, h, o = {}) => ev.hits.push({ t, tgt, kind, h, ...o });

  // ---------------------------------------------------------- intro (0 - 2.6)
  const endPrev = endPositions(previousReversed(minute));
  {
    // the champion: where the last round left him, walks back to his mark
    const hx = endPrev.H;
    if (hourTurn) {
      // last round's winning challenger is the new champion: he turns round
      add('H', 'turn', 0, 0.3, hx, hx, { faceFrom: -1, flipAt: 0.14 });
      add('H', 'walk', 0.3, 1.6, hx, H_HOME);
    } else {
      add('H', 'idle', 0, 0.25, hx, hx);
      add('H', 'walk', 0.25, 1.7, hx, H_HOME);
    }
    add('H', 'idle', clips.H[clips.H.length - 1].t1, 2.6, H_HOME, H_HOME);
    add('M', 'enter', 0, 0.95, ENTER_X, M_HOME, { xe: [0, 0.68] });
    ev.land.push({ t: 0.7, f: 'M' });
    add('M', 'taunt', 0.95, 1.85, M_HOME, M_HOME);
    add('M', 'idle', 1.85, 2.6, M_HOME, M_HOME);
    ev.text.push({ k: hourTurn ? 'champion' : 'challenger', t0: 0, t1: 1.55 });
    ev.text.push({ k: 'fight', t0: 1.6, t1: 2.55 });
  }

  // ---------------------------------------------------------- exchanges
  let t = 2.6;
  const END = 51.8;
  const spaceTo = (A, want) => {
    // A walks (or dashes) to be `want` px from the other; the other idles
    const D = other(A), dirA = FACE[A];
    const dist = Math.abs(pos.M - pos.H);
    const move = dist - want;
    if (Math.abs(move) < 2) return;
    let target = pos[A] + dirA * move;
    target = clamp(target, 22, SW - 22);
    const far = Math.abs(target - pos[A]);
    const dash = far > 30 && move > 0;
    const dur = dash ? 0.26 : Math.max(0.25, far / WALK);
    add(A, dash ? 'dash' : 'walk', t, t + dur, pos[A], target);
    add(D, 'idle', t, t + dur, pos[D], pos[D]);
    t += dur;
  };
  const room = (A, want) => {
    // make at least `want` px of room: A hops back (or the other walks back)
    const dist = Math.abs(pos.M - pos.H);
    if (dist >= want) return;
    const dirA = FACE[A], D = other(A);
    const back = clamp(pos[A] - dirA * (want - dist), 22, SW - 22);
    add(A, 'hopBack', t, t + 0.46, pos[A], back);
    const need = want - Math.abs(pos.M - pos.H);
    if (need > 1) {
      const dB = clamp(pos[D] + dirA * need, 22, SW - 22);
      add(D, 'walk', t, t + 0.46, pos[D], dB);
    } else add(D, 'idle', t, t + 0.46, pos[D], pos[D]);
    t += 0.46;
  };
  const push = (c, tt, d) => {
    // shove the clip's fighter back by d px (away from the opponent)
    const back = -FACE[c.f] * d;
    const nx = clamp(pos[c.f] + back, 22, SW - 22);
    c.pushes.push({ t: tt, d: nx - pos[c.f] });
    pos[c.f] = nx;
  };
  const idleBoth = (dur) => {
    add('H', 'idle', t, t + dur, pos.H, pos.H);
    add('M', 'idle', t, t + dur, pos.M, pos.M);
    t += dur;
  };

  const exchanges = {
    pokes(A, D, ok) {
      spaceTo(A, 25);
      const g = add(D, 'guard', t, t + 0.97, pos[D], pos[D], { react: true });
      add(A, 'jab', t, t + 0.26, pos[A], pos[A]);
      hit(t + 0.06, D, ok ? 'hit' : 'block', 30); push(g, t + 0.06, ok ? 3 : 2);
      add(A, 'jab', t + 0.26, t + 0.52, pos[A], pos[A] + FACE[A] * 2);
      hit(t + 0.32, D, ok ? 'hit' : 'block', 30); push(g, t + 0.32, ok ? 3 : 2);
      add(A, 'strong', t + 0.52, t + 0.97, pos[A], pos[A] + FACE[A] * 3);
      hit(t + 0.7, D, ok ? 'hit' : 'block', 28, { heavy: ok }); push(g, t + 0.7, ok ? 9 : 5);
      g.x1 = g.x0; t += 0.97;
    },
    kick(A, D, ok) {
      spaceTo(A, 30);
      const g = add(D, 'guard', t, t + 0.6, pos[D], pos[D], { react: true });
      add(A, 'kick', t, t + 0.6, pos[A], pos[A]);
      hit(t + 0.23, D, ok ? 'hit' : 'block', 26, { heavy: ok }); push(g, t + 0.23, ok ? 13 : 6);
      t += 0.6;
    },
    sweep(A, D, ok) {
      spaceTo(A, 31);
      add(A, 'sweep', t, t + 0.7, pos[A], pos[A]);
      if (ok) {
        const c = add(D, 'idle', t, t + 0.27, pos[D], pos[D]);
        const k = add(D, 'trip', t + 0.27, t + 1.97, pos[D], pos[D]);
        hit(t + 0.27, D, 'hit', 5, { heavy: true }); push(k, t + 0.27, 7);
        ev.land.push({ t: t + 0.27 + 0.4, f: D });
        add(A, 'idle', t + 0.7, t + 1.2, pos[A], pos[A]);
        add(A, R() < 0.5 ? 'taunt' : 'idle', t + 1.2, t + 1.97, pos[A], pos[A]);
        void c;
        t += 1.97;
      } else {
        add(D, 'crouchGuard', t, t + 0.7, pos[D], pos[D], { react: true, low: true });
        hit(t + 0.27, D, 'block', 5);
        push(clips[D][clips[D].length - 1], t + 0.27, 5);
        t += 0.7;
      }
    },
    fireball(A, D, out) {
      room(A, 64);
      const dirA = FACE[A];
      const dist = Math.abs(pos.M - pos.H);
      add(A, 'fireball', t, t + 0.85, pos[A], pos[A]);
      const rel = t + 0.38, x0 = pos[A] + dirA * 14, x1 = pos[D] - dirA * 8;
      const tt = Math.abs(x1 - x0) / 120;
      const contact = rel + tt;
      if (out === 'jump') {
        // D jumps it and kicks A on the way down
        const j0 = contact - 0.34;
        add(D, 'guard', t, j0, pos[D], pos[D]);
        const land = clamp(pos[A] + dirA * 22, 22, SW - 22);
        add(D, 'jumpKick', j0, j0 + 0.76, pos[D], land, { xe: [0.06, 0.72] });
        ev.proj.push({ t0: rel, t1: rel + (SW + 40) / 120, x0, x1: x0 + dirA * (SW + 40), y: 25, by: A, end: 'miss' });
        const ht = j0 + 0.58;
        const a2 = add(A, 'guard', t + 0.85, Math.max(t + 0.86, j0 + 0.76), pos[A], pos[A], { react: true });
        hit(ht, A, 'hit', 34, { heavy: true }); push(a2, ht, 8);
        ev.land.push({ t: j0 + 0.72, f: D });
        t = j0 + 0.76;
        // after landing, too close: D steps off
        idleBoth(0.2);
      } else {
        ev.proj.push({ t0: rel, t1: contact, x0, x1, y: 25, by: A, end: out });
        const g = add(D, 'guard', t, contact + 0.45, pos[D], pos[D], { react: true });
        hit(contact, D, out === 'hit' ? 'hit' : 'block', 25, { heavy: out === 'hit', fire: true });
        push(g, contact, out === 'hit' ? 14 : 6);
        add(A, 'idle', t + 0.85, Math.max(t + 0.86, contact + 0.45), pos[A], pos[A]);
        t = Math.max(t + 0.86, contact + 0.45);
      }
      void dist;
    },
    jumpin(A, D, ok) {
      room(A, 48);
      const dirA = FACE[A];
      const dist = Math.abs(pos.M - pos.H);
      const land = pos[A] + dirA * (dist - 24);
      add(A, 'jumpKick', t, t + 0.76, pos[A], land, { xe: [0.06, 0.72] });
      const g = add(D, 'guard', t, t + 0.76 + (ok ? 0.45 : 0.1), pos[D], pos[D], { react: true });
      hit(t + 0.56, D, ok ? 'hit' : 'block', 34, { heavy: ok }); push(g, t + 0.56, ok ? 4 : 4);
      ev.land.push({ t: t + 0.72, f: A });
      if (ok) {
        add(A, 'strong', t + 0.76, t + 1.21, pos[A], pos[A]);
        hit(t + 0.76 + 0.18, D, 'hit', 28, { heavy: true }); push(g, t + 0.94, 9);
        t += 1.21;
      } else {
        add(A, 'idle', t + 0.76, t + 0.86, pos[A], pos[A]);
        t += 0.86;
      }
    },
    antiair(A, V) {
      // V jumps in; A answers with the uppercut
      room(V, 50);
      const dirV = FACE[V];
      const dist = Math.abs(pos.M - pos.H);
      const ht = 0.4;
      const xAt = pos[V] + dirV * (dist - 26) * (ht - 0.06) / 0.66;
      add(V, 'jumpKick', t, t + ht, pos[V], xAt, { xe: [0.06, ht] });
      // V's arc is cut: continue into the launch from the height he was at
      const lc = add(V, 'launch', t + ht, t + ht + 2.25, xAt, clamp(xAt - dirV * 30, 22, SW - 22), { xe: [0, 0.82], h0: 17 });
      add(A, 'idle', t, t + 0.2, pos[A], pos[A]);
      add(A, 'uppercut', t + 0.2, t + 1.0, pos[A], pos[A] + FACE[A] * 6, { xe: [0.1, 0.6] });
      hit(t + ht, V, 'hit', 30, { heavy: true });
      ev.land.push({ t: t + ht + 0.82, f: V });
      ev.land.push({ t: t + 0.94, f: A });
      add(A, 'idle', t + 1.0, t + ht + 2.25, pos[A], pos[A]);
      void lc;
      t += ht + 2.25;
    },
    spin(A, D, ok) {
      spaceTo(A, 44);
      const dirA = FACE[A];
      const g = add(D, 'guard', t, t + 1.0, pos[D], pos[D], { react: true });
      add(A, 'spin', t, t + 0.9, pos[A], pos[A] + dirA * 26);
      for (const k of [0.3, 0.5, 0.7]) { hit(t + k, D, ok ? 'hit' : 'block', 24); push(g, t + k, ok ? 6 : 4); }
      add(A, 'idle', t + 0.9, t + 1.0, pos[A], pos[A]);
      ev.land.push({ t: t + 0.9, f: A });
      t += 1.0;
    },
    neutral(A) {
      const r = R();
      const D = other(A);
      if (r < 0.35) idleBoth(0.5 + R() * 0.7);
      else if (r < 0.65) {
        // A steps in, D steps back
        const d = 10 + R() * 16, dur = d / WALK;
        add(A, 'walk', t, t + dur, pos[A], clamp(pos[A] + FACE[A] * d, 22, SW - 22));
        add(D, 'walk', t, t + dur, pos[D], clamp(pos[D] - FACE[D] * d * 0.6, 22, SW - 22));
        t += dur;
      } else if (r < 0.85) {
        add(A, 'taunt', t, t + 0.9, pos[A], pos[A]);
        add(D, 'idle', t, t + 0.9, pos[D], pos[D]);
        t += 0.9;
      } else {
        const d = 10 + R() * 10, dur = d / WALK;
        add(A, 'walk', t, t + dur, pos[A], clamp(pos[A] - FACE[A] * d, 22, SW - 22));
        add(D, 'idle', t, t + dur, pos[D], pos[D]);
        t += dur;
      }
    },
  };

  let mHits = 0, sinceM = 0;
  while (t < END - 2.4) {
    // keep the fight on the stage: drift back to the middle when cornered
    const mid = (pos.H + pos.M) / 2;
    if (mid < 70 || mid > SW - 70) {
      const A = mid < 70 ? 'H' : 'M';
      const d = Math.abs(mid - SW / 2) * 0.6, dur = Math.min(1.2, d / WALK);
      const s = mid < 70 ? 1 : -1;
      add('H', 'walk', t, t + dur, pos.H, pos.H + s * d);
      add('M', 'walk', t, t + dur, pos.M, pos.M + s * d);
      t += dur;
      void A;
    }
    // the champion has the edge, but every challenger gets some in
    let A = R() < 0.62 ? 'H' : 'M';
    if (t > 30 && mHits === 0) A = 'M';
    if (A === 'M') sinceM = 0; else sinceM++;
    if (sinceM > 4) A = 'M';
    // the challenger's bar is the seconds: he must not go long unhurt
    const lastHurt = ev.hits.reduce((a, h) => (h.tgt === 'M' && h.kind === 'hit' ? h.t : a), 0);
    const overdue = t - lastHurt > 4.2;
    if (overdue) A = 'H';
    const D = other(A);
    const kind = pick(['pokes', 'pokes', 'kick', 'kick', 'sweep', 'fireball', 'fireball', 'jumpin', 'antiair', 'spin']);
    const ok = R() < (A === 'H' ? 0.7 : 0.5) || (A === 'M' && mHits === 0 && t > 30) || overdue;
    const before = ev.hits.length;
    if (kind === 'fireball') exchanges.fireball(A, D, ok ? 'hit' : pick(['block', 'jump', 'jump']));
    else if (kind === 'antiair') { if (overdue) exchanges.antiair('H', 'M'); else exchanges.antiair(D, A); } // the one who jumps in pays
    else exchanges[kind](A, D, ok);
    for (let i = before; i < ev.hits.length; i++) if (ev.hits[i].tgt === 'H' && ev.hits[i].kind === 'hit') mHits++;
    exchanges.neutral(R() < 0.5 ? 'H' : 'M');
  }

  // square off at the marks
  {
    const dur = Math.max(0.6, 53.4 - t);
    const eh = E0.H, em = E0.M;
    add('H', Math.abs(eh - pos.H) > 3 ? 'walk' : 'idle', t, t + dur, pos.H, eh);
    add('M', Math.abs(em - pos.M) > 3 ? 'walk' : 'idle', t, t + dur, pos.M, em);
    t += dur;
  }

  // ---------------------------------------------------------- the finish
  const rev = minute === 59;
  finish(rev ? 'M' : 'H', rev ? 'H' : 'M', t, { add, hit, push, ev, pos, FACE, clips });
  ev.mHitsTotal = ev.hits.filter((h) => h.tgt === 'H' && h.kind === 'hit').length;
  ev.reversed = rev;
  return { clips, ev };
}

const E0 = { H: H_HOME, M: M_HOME };

/** The champion's (or, reversed, the challenger's) super: from ~53.6 to the end. */
function finish(A, V, t, { add, hit, push, ev, pos, FACE }) {
  const dirA = FACE[A];
  add(A, 'idle', t, 54.0, pos[A], pos[A]);
  add(V, 'idle', t, 54.0, pos[V], pos[V]);
  t = 54.0;
  ev.supers.push({ t0: t, t1: t + 0.8, by: A });
  add(A, 'charge', t, t + 0.8, pos[A], pos[A], { aura: true });
  const g = add(V, 'guard', t, 57.25, pos[V], pos[V], { react: true });
  t += 0.8;
  const close = pos[V] - dirA * 24;
  add(A, 'dash', t, t + 0.26, pos[A], close);
  t += 0.26;
  const seq = [['jab', 0.26, 0.06, 3, 30], ['strong', 0.45, 0.18, 5, 28], ['kick', 0.6, 0.23, 7, 26]];
  let n = 0;
  for (const [mv, d, hk, p, hh] of seq) {
    add(A, mv, t, t + d, pos[A], pos[A]);
    hit(t + hk, V, 'hit', hh, { heavy: mv !== 'jab' }); push(g, t + hk, p);
    ev.combo.push({ t: t + hk, n: ++n, by: A });
    t += d;
    // follow the shove
    const want = pos[V] - dirA * 24;
    if (Math.abs(want - pos[A]) > 0.5) { add(A, 'dash', t, t + 0.12, pos[A], want); t += 0.12; }
  }
  // the spin kick carries him in for two more
  add(A, 'spin', t, t + 0.6, pos[A], pos[A] + dirA * 10);
  for (const k of [0.2, 0.42]) { hit(t + k, V, 'hit', 24); push(g, t + k, 4); ev.combo.push({ t: t + k, n: ++n, by: A }); }
  ev.land.push({ t: t + 0.6, f: A });
  t += 0.6;
  // the uppercut: the K.O.
  add(A, 'uppercut', t, t + 0.8, pos[A], pos[A] + dirA * 6, { xe: [0.1, 0.6] });
  const ko = t + 0.2;
  g.t1 = ko;
  hit(ko, V, 'hit', 30, { heavy: true, ko: true });
  ev.combo.push({ t: ko, n: ++n, by: A });
  add(V, 'launchKO', ko, 60, pos[V], pos[V] - FACE[V] * 40, { xe: [0, 1.02], blink: [59.1, 59.95] });
  ev.land.push({ t: ko + 1.02, f: V, big: true });
  ev.land.push({ t: t + 0.74, f: A });
  ev.ko = ko;
  ev.text.push({ k: 'ko', t0: ko + 0.06, t1: 59.7 });
  t += 0.8;
  add(A, 'idle', t, t + 0.3, pos[A], pos[A]);
  add(A, 'victory', t + 0.3, 60, pos[A], pos[A]);
}

/** Where the finish leaves both fighters (fixed: the finish starts from fixed marks). */
const END_CACHE = {};
export function endPositions(reversed) {
  if (END_CACHE[reversed]) return END_CACHE[reversed];
  const clips = { H: [], M: [] }, pos = { H: E0.H, M: E0.M }, FACE = { H: 1, M: -1 };
  const ev = { hits: [], proj: [], land: [], text: [], supers: [], combo: [] };
  const add = (f, mv, t0, t1, x0, x1, o = {}) => {
    const c = { f, mv, t0, t1, x0, x1, pushes: [], ...o }; clips[f].push(c); pos[f] = x1; return c;
  };
  const push = (c, tt, d) => { const nx = clamp(pos[c.f] - FACE[c.f] * d, 22, SW - 22); c.pushes.push({ t: tt, d: nx - pos[c.f] }); pos[c.f] = nx; };
  finish(reversed ? 'M' : 'H', reversed ? 'H' : 'M', 53.6, { add, hit: () => {}, push, ev, pos, FACE, clips });
  // the winner of a reversed round becomes the champion
  const out = reversed ? { H: pos.M, M: pos.H } : { H: pos.H, M: pos.M };
  END_CACHE[reversed] = out;
  return out;
}

/** Was the previous round (the minute before `minute`) the hour's reversal? */
function previousReversed(minute) { return minute === 0; }

// ------------------------------------------------------------ lookup

/**
 * Where a fighter is at second `t` of the round: { pose, h, x, face, clip }.
 */
export function fighterAt(rd, f, t) {
  const cs = rd.clips[f];
  let c = cs[cs.length - 1];
  for (let i = 0; i < cs.length; i++) if (t < cs[i].t1) { c = cs[i]; break; }
  if (t < c.t0) t = c.t0;
  const lt = t - c.t0;
  const dur = c.t1 - c.t0;
  const { pose, h: h0 } = movePose(c.mv === 'crouchGuard' ? 'guard' : c.mv, lt, c);
  let p = c.mv === 'crouchGuard' ? POSE.crouch : pose;
  let h = h0;
  if (c.h0 !== undefined && MOVES[c.mv].air) {
    // a launch from mid-air: the arc starts at the height he was hit at
    const a = MOVES[c.mv].air[0];
    if (lt < a[1]) h = Math.max(h, c.h0 * (1 - lt / a[1]) ** 2 + h0);
  }
  // horizontal: eased along the clip (or along the part of a move that travels)
  // horizontal: over the clip, or over the window `xe` (local seconds) of a move that travels
  let u = c.xe ? clamp((lt - c.xe[0]) / (c.xe[1] - c.xe[0]), 0, 1) : clamp(lt / (dur || 1), 0, 1);
  if (c.mv === 'dash') u = io(u);
  let x = c.x0 + (c.x1 - c.x0) * u;
  for (const ps of c.pushes) {
    if (t >= ps.t) x += ps.d * Math.min(1, (t - ps.t) / 0.14) ** 0.6;
  }
  let face = c.face ?? (f === 'H' ? 1 : -1);
  if (c.faceFrom !== undefined && lt < c.flipAt) face = c.faceFrom;
  if (MOVES[c.mv]?.spin) face *= Math.floor(lt / 0.075) % 2 ? -1 : 1;
  // reactions to hits and blocks
  let flash = 0;
  if (c.react || c.mv === 'idle' || c.mv === 'guard' || c.mv === 'walk' || c.mv === 'crouchGuard') {
    let best = 0, bp = null;
    for (const e of rd.ev.hits) {
      if (e.tgt !== f) continue;
      const d = t - e.t;
      if (d < -0.2 || d > 0.45) continue;
      let env = 0;
      if (e.kind === 'hit') {
        env = d < 0 ? 0 : d < 0.03 ? d / 0.03 : d < 0.16 ? 1 : Math.max(0, 1 - (d - 0.16) / 0.24);
        if (d >= 0 && d < 0.05) flash = Math.max(flash, 0.7);
      } else {
        env = d < -0.18 ? 0 : d < -0.02 ? (d + 0.18) / 0.16 : d < 0.12 ? 1 : Math.max(0, 1 - (d - 0.12) / 0.2);
      }
      if (env > best) {
        best = env;
        bp = e.kind === 'hit' ? (e.h < 12 ? POSE.hurtLow : POSE.hurt) : c.low ? POSE.crouchBlock : POSE.block;
      }
    }
    if (bp) p = blend(p, bp, io(best));
  }
  for (const e of rd.ev.hits) if (e.tgt === f && t >= e.t && t < e.t + 0.05 && e.kind === 'hit') flash = 0.7;
  let alpha = 1;
  if (c.blink && t >= c.blink[0]) {
    if (t >= c.blink[1]) alpha = 0;
    else alpha = Math.floor((t - c.blink[0]) * 16) % 2 ? 0 : 1;
  }
  return { pose: p, h, x, face, clip: c, flash, alpha, aura: !!c.aura && lt > 0.1 };
}
