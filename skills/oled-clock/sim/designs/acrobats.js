// Big Top: the time is performed by a circus troupe.
//
// Every numeral is a small act, and the act is the letterform. The round
// digits are Cyr wheels: a big steel hoop with an acrobat spread-eagled
// inside it, hands and feet on the rim (0; the bowls of 6 and 9; the 8 is
// one wheel balanced on another). The straight ones are perch-pole acts: a
// base man balances a pole on his head and a flyer hangs off the top as the
// 1's flag, the 4's crossbar or lies along the top as the 7's bar. The
// curly ones (2, 3, 5) are contortionists head to foot, with a teeterboard
// as the 2's base and a balancing pole for the 5's roof.
//
// Hours and minutes are different shows: the minutes stand on the ring
// floor under the bunting, life size; the hours perform smaller, high up
// on a trapeze bar that swings on its two ropes all the time.
//
// Always alive: every act sways like a balancing pyramid (a perch pole far
// more), breathes, the Cyr wheels turn a little each way on the spot (the
// performer inside foreshortening with them), contortionists curl and
// uncurl, arms keep balance, someone at the top of each act hops once a
// second, pennants flutter and the marquee bulbs on the ring curb chase.
//
// The minute: the old act breaks up and the troupe somersaults (tucked,
// along ballistic arcs, top of the act first) into the places of the new
// one, stick the landing and throw their arms up. Spare acrobats leap up
// into the rigging, new ones drop out of it; a wheel that stays rolls and
// grows to its new place with its performer in it, a wheel that is not
// needed rolls off into the wings (or is tossed up into the flies) and a
// new one rolls or drops in with a bounce; poles are tossed and twirl.
//
// The hour: a cannon rolls in under the trapeze and cranks up, the fuse
// fizzes, BANG (one inverted frame), and the human cannonball is fired
// right across the big top to land on top of the new :00's Cyr wheel,
// ta-da, and back-flip off into the wings. The blast sets the trapeze
// swinging hard and the hour troupe is blown into double somersaults that
// land as the new hour, about 2 s after the shot.
//
// frame() is a pure function of the clock: idle life from absolute time,
// the turn scheduled around :00 from the minute before and after. Burn-in:
// the scene walks kit.orbit; the panel dims 23:00-07:00 via ctx.night.

import { ease, clamp, lerp, progress, noise, orbit, clockFields, previousMinute, ON, OFF } from '../js/kit.js';

const TAU = Math.PI * 2, D2R = Math.PI / 180;
const inOutSine = (t) => 0.5 - 0.5 * Math.cos(Math.PI * t);

// ------------------------------------------------------------ the acts
//
// Every numeral is a small circus act, built from four things: acrobats
// (straight, or bent like contortionists), columns of acrobats standing on
// each other's shoulders, hoops (a Cyr wheel with a performer spread-eagled
// inside), and props held up by the troupe (a pole, a teeterboard).
// Coordinates are a 26 x 42 box, floor at y = 42. Arcs use clock angles
// (0 = up, clockwise), in degrees.
const Ln = (x0, y0, x1, y1) => ({ k: 'L', x0, y0, x1, y1 });
const Ar = (cx, cy, rx, ry, a0, a1) => ({ k: 'A', cx, cy, rx, ry, a0: a0 * D2R, a1: a1 * D2R });

/** One acrobat: feet F, head H; bend = sideways sag of the body in px. */
const man = (F, H, o = {}) => ({ t: 'man', F, H, bend: 0, arms: [150, 150], spread: 1.1, drop: 0, key: 0.8, ...o });
const hoop = (cx, cy, rx, ry, o = {}) => ({ t: 'hoop', c: [cx, cy], rx, ry, w: 2.4, ...o });
const pole = (x0, y0, x1, y1, o = {}) => ({ t: 'pole', a: [x0, y0], b: [x1, y1], w: 2.2, ...o });

/** A column: n acrobats stacked on shoulders from (x0,y0) up to (x1,y1). */
function col(x0, y0, x1, y1, n, top = [30, 30], o = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const u0 = i / n, u1 = (i + 1) / n;
    out.push(man([lerp(x0, x1, u0), lerp(y0, y1, u0)], [lerp(x0, x1, u1), lerp(y0, y1, u1)], {
      arms: i === n - 1 ? top : (o.arms?.[i] ?? (i % 2 ? [180, 120] : [180, 180])),
      spread: i ? 2.3 : 1.7, drop: i ? 2.6 : 0, ...(o.each ?? {}),
    }));
  }
  return out;
}

/** n contortionists head to foot along a curve, each bent to follow it. */
function chain(prims, n, o = {}) {
  const tr = buildTrack({ p: prims });
  const slot = tr.len / n, out = [];
  for (let i = 0; i < n; i++) {
    const s0 = i * slot + 0.3, s1 = (i + 1) * slot - 0.9;
    const F = at(tr, s0), H = at(tr, s1), M = at(tr, (s0 + s1) / 2);
    const dx = H[0] - F[0], dy = H[1] - F[1], l = Math.hypot(dx, dy) || 1;
    const bend = (M[0] - (F[0] + H[0]) / 2) * (-dy / l) + (M[1] - (F[1] + H[1]) / 2) * (dx / l);
    out.push(man(F, H, { bend: bend * (o.stiff ?? 0.9), arms: o.arms?.[i] ?? [20, 20], spread: 1.1, ...(o.each ?? {}) }));
  }
  return out;
}

const FORMS = [
  /* 0 */ [hoop(13, 21, 11.5, 19.5)],
  /* 1 */ [pole(15, 28.6, 15, 2.5, { w: 3 }), man([15, 42], [15, 29.5], { arms: [12, 12], spread: 2 }),
           man([4.5, 15.5], [13, 6], { arms: [8, 30], spread: 1.3 })],
  /* 2 */ [pole(1, 39.5, 25, 39.5, { board: true }),
           ...col(4, 39, 20.5, 16, 2, [12, 40], { each: { spread: 1.2, drop: 1.2 }, arms: [[150, 20]] }),
           ...chain([Ar(13, 13, 10, 10.5, 125, -80)], 2)],
  /* 3 */ [...chain([Ar(12, 11.5, 10, 9.5, -60, 168)], 2), ...chain([Ar(12, 30, 11, 11, -8, 240)], 2)],
  /* 4 */ [pole(19, 28.6, 19, 2.5, { w: 3 }), man([19, 42], [19, 29.5], { arms: [12, 12], spread: 2 }),
           man([2.5, 26.5], [16.5, 26.5], { arms: [0, 0], spread: 1.1 }),
           ...col(4, 25, 17, 4, 2, [10, 30], { each: { spread: 1.5, drop: 1.5 }, arms: [[150, 30]] })],
  /* 5 */ [pole(5, 3.5, 24, 3.5), man([5, 21], [5, 6], { arms: [8, 8], spread: 1.6 }),
           ...chain([Ar(12.5, 29.5, 10.5, 11, -62, 235)], 3)],
  /* 6 */ [hoop(13, 30.5, 10.5, 10.5), ...chain([Ar(24, 30, 21, 27, 272, 350)], 2)],
  /* 7 */ [pole(11, 28.6, 20.5, 6, { w: 3 }), man([9, 42], [10.5, 29.5], { arms: [10, 10], spread: 2 }),
           man([25, 3.5], [9, 3.5], { arms: [2, 2], spread: 0.9 })],
  /* 8 */ [hoop(13, 11, 8.5, 8.6), hoop(13, 30.8, 10.5, 10.6)],
  /* 9 */ [hoop(12.5, 12, 10, 10.5), ...col(22.5, 42, 22.5, 19, 2, [5, 5])],
];

// A curve resampled to dense points with arc length.
function samplePrim(pr, out) {
  const N = 160;
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    if (pr.k === 'L') out.push([lerp(pr.x0, pr.x1, u), lerp(pr.y0, pr.y1, u)]);
    else {
      const a = lerp(pr.a0, pr.a1, u);
      out.push([pr.cx + pr.rx * Math.sin(a), pr.cy - pr.ry * Math.cos(a)]);
    }
  }
}
function buildTrack(tr) {
  const pts = [];
  for (const pr of tr.p) samplePrim(pr, pts);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { ...tr, pts, cum, len: cum[cum.length - 1] };
}
function at(tr, s) {
  s = clamp(s, 0, tr.len);
  const { cum, pts } = tr;
  let lo = 0, hi = cum.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
  const u = cum[hi] > cum[lo] ? (s - cum[lo]) / (cum[hi] - cum[lo]) : 0;
  return [lerp(pts[lo][0], pts[hi][0], u), lerp(pts[lo][1], pts[hi][1], u)];
}

// ------------------------------------------------------------ drawing

const qb = (A, Q, B, u) => [
  (1 - u) * (1 - u) * A[0] + 2 * (1 - u) * u * Q[0] + u * u * B[0],
  (1 - u) * (1 - u) * A[1] + 2 * (1 - u) * u * Q[1] + u * u * B[1],
];

/**
 * Draw one acrobat. The spine is a quadratic through F, M, H. k is the
 * figure scale (1 for the floor troupe). Built from capsules: two legs,
 * a torso, two arms, and a round head with a dark neck gap.
 * P.arms = [left, right] in degrees from the body's axis (0 straight up
 * past the head, 90 out sideways, 160 hanging down). P.spread is half the
 * distance between the feet; P.drop pushes the feet past F (standing on
 * the shoulders of the one below, either side of his head).
 */
function drawAcrobat(g, P, k = 1, c = ON) {
  const { F, H, M } = P;
  const Q = [2 * M[0] - (F[0] + H[0]) / 2, 2 * M[1] - (F[1] + H[1]) / 2];
  const sp = (u) => qb(F, Q, H, u);
  const tang = (u) => {
    const a = sp(Math.max(0, u - 0.05)), b = sp(Math.min(1, u + 0.05));
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
  };
  const caps = [];
  const cap = (A, B, r) => caps.push([A[0], A[1], B[0], B[1], r]);
  const off = (p, n, d) => [p[0] + n[0] * d, p[1] + n[1] * d];
  const tu = P.tuck ?? 0;
  const kt = Math.max(k, 0.84); // limbs do not thin below this
  const hr = 1.5 * kt;
  const hip = sp(0.42), sh = sp(0.7), hd = sp(1).map((v, i) => v - tang(1)[i] * hr + (P.lift ? P.lift[i] : 0));
  const tH = tang(0.3), nH = [-tH[1], tH[0]];
  const drop = (P.drop ?? 0) * k;
  const feet = off(sp(0), tH, -drop), knee = sp(0.2);
  // tucked, the knees come up to the chest and the heels to the seat
  const kneeT = [lerp(knee[0], sh[0] + nH[0] * 2.4 * k, tu), lerp(knee[1], sh[1] + nH[1] * 2.4 * k, tu)];
  const footT = [lerp(feet[0], hip[0] + nH[0] * 2.2 * k, tu), lerp(feet[1], hip[1] + nH[1] * 2.2 * k, tu)];
  const spread = lerp(P.spread ?? 0.9, 0.5, tu) * k;
  for (const sgn of [-1, 1]) {
    const kk = off(kneeT, nH, sgn * lerp(0.6 * k, spread * 0.85, 0.7)), ff = off(footT, nH, sgn * spread);
    cap(off(hip, nH, sgn * 0.5 * k), kk, 0.72 * kt);
    cap(kk, ff, 0.66 * kt);
  }
  cap(hip, sh, 1.45 * kt);
  cap(sp(0.56), sh, 1.65 * kt);
  const tS = tang(0.7), nS = [-tS[1], tS[0]];
  const L = Math.hypot(H[0] - F[0], H[1] - F[1]) / k;
  const armLen = P.armLen ?? 5 * k * clamp(L / 13, 0.8, 1.15);
  const A = P.arms ?? [150, 150];
  for (const sgn of [-1, 1]) {
    const a0 = sgn < 0 ? A[0] : A[1];
    const s0 = off(sh, nS, sgn * 1.1 * k);
    if (a0 >= 175 && tu < 0.5) { // hands on hips: the strongman's triangle
      const el = off(off(sh, nS, sgn * 3.1 * k), tS, -1.9 * k), hp = off(hip, nS, sgn * 1.2 * k);
      cap(s0, el, 0.6 * kt); cap(el, hp, 0.6 * kt);
      continue;
    }
    const deg = lerp(Math.min(a0, 170), 60, tu) * D2R;
    const dir = [tS[0] * Math.cos(deg) + nS[0] * sgn * Math.sin(deg), tS[1] * Math.cos(deg) + nS[1] * sgn * Math.sin(deg)];
    cap(s0, [s0[0] + dir[0] * armLen, s0[1] + dir[1] * armLen], 0.6 * kt);
  }
  let x0 = hd[0] - hr, y0 = hd[1] - hr, x1 = hd[0] + hr, y1 = hd[1] + hr;
  for (const [ax, ay, bx, by, r] of caps) {
    x0 = Math.min(x0, ax - r, bx - r); x1 = Math.max(x1, ax + r, bx + r);
    y0 = Math.min(y0, ay - r, by - r); y1 = Math.max(y1, ay + r, by + r);
  }
  const ng = hr + 0.8 * kt; // dark neck ring
  const box = [x0 - 2, y0 - 2, x1 - x0 + 4, y1 - y0 + 4];
  // a black keyline round the whole figure, so one acrobat in front of
  // another still reads as two
  const kl = P.key ?? 0;
  if (kl > 0) g.fillWhere((x, y) => {
    if (Math.hypot(x - hd[0], y - hd[1]) <= hr + kl) return true;
    for (let i = 0; i < caps.length; i++) {
      const q = caps[i];
      const dx = q[2] - q[0], dy = q[3] - q[1], l2 = dx * dx + dy * dy;
      const u = l2 ? clamp(((x - q[0]) * dx + (y - q[1]) * dy) / l2, 0, 1) : 0;
      const ex = x - q[0] - u * dx, ey = y - q[1] - u * dy, r = q[4] + kl;
      if (ex * ex + ey * ey <= r * r) return true;
    }
    return false;
  }, OFF, box);
  g.fillWhere((x, y) => {
    const dh = Math.hypot(x - hd[0], y - hd[1]);
    if (dh <= hr) return true;
    if (dh <= ng) return false;
    for (let i = 0; i < caps.length; i++) {
      const q = caps[i];
      const dx = q[2] - q[0], dy = q[3] - q[1], l2 = dx * dx + dy * dy;
      const u = l2 ? clamp(((x - q[0]) * dx + (y - q[1]) * dy) / l2, 0, 1) : 0;
      const ex = x - q[0] - u * dx, ey = y - q[1] - u * dy;
      if (ex * ex + ey * ey <= q[4] * q[4]) return true;
    }
    return false;
  }, c, [x0 - 1, y0 - 1, x1 - x0 + 2, y1 - y0 + 2]);
}

// ------------------------------------------------------------ items
//
// A digit in motion is a list of items in its own box coordinates:
//   man  { C centre, ang (feet->head, radians, 0 = pointing up), L, bend, ... }
//   hoop { c, rx, ry, w, rot (how far it has rolled), sq (Cyr-wheel turn) }
//   pole { C, ang, L, w, board }
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const angOf = (F, H) => Math.atan2(H[0] - F[0], -(H[1] - F[1]));

const REST = FORMS.map((form) => {
  const men = form.filter((e) => e.t === 'man');
  return form.map((e, i) => {
    if (e.t === 'man') return {
      t: 'man', C: [(e.F[0] + e.H[0]) / 2, (e.F[1] + e.H[1]) / 2], ang: angOf(e.F, e.H), L: dist(e.F, e.H),
      bend: e.bend, arms: e.arms, spread: e.spread, drop: e.drop, key: e.key, tuck: 0,
      // nobody stands on him: he is free to hop and wave
      top: !men.some((o) => o !== e && dist(o.F, e.H) < 3.5), i,
    };
    if (e.t === 'hoop') return { t: 'hoop', c: e.c.slice(), rx: e.rx, ry: e.ry, w: e.w, rot: 0, sq: 1, i };
    return { t: 'pole', C: [(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2], ang: angOf(e.a, e.b), L: dist(e.a, e.b), w: e.w, board: !!e.board, i };
  });
});

/**
 * Digit d at rest, alive: the act sways like a balancing pyramid (more at
 * the top), breathes, the wheels turn on the spot, arms keep balance and
 * once a second someone at the top does a little hop.
 */
const swayOf = (T, seed) => 0.75 * Math.sin(T * 1.35 + seed * 3.1) + 0.35 * Math.sin(T * 2.7 + seed * 5.3);

const PERCH = [0, 1, 0, 0, 1, 0, 0, 1, 0, 0];

function idle(d, T, seed) {
  // a perch pole is balanced on one man's head: it sways much more
  const sway = swayOf(T, seed) * (PERCH[d] ? 1.9 : 1);
  const br = Math.sin(T * 2.2 + seed * 1.7);
  const P = (x, y) => {
    const h = clamp((42 - y) / 42, 0, 1);
    return [x + sway * h ** 1.5, 42 - (42 - y) * (1 - 0.012 * br)];
  };
  const sec = Math.floor(T), ph = T - sec;
  const tops = REST[d].filter((e) => e.t === 'man' && e.top);
  const hopper = tops.length ? tops[Math.floor(noise(sec, seed) * tops.length)] : null;
  return REST[d].map((e) => {
    if (e.t === 'man') {
      const C = P(e.C[0], e.C[1]);
      const lean = (sway * 1.5 * Math.sqrt(clamp((42 - e.C[1]) / 42, 0, 1))) / 42;
      let arms = e.arms.map((a, j) => (a >= 175 ? a : a + (a > 70 ? 9 : 5) * Math.sin(T * 1.9 + e.i * 1.3 + j * 2 + seed)));
      let hopY = 0;
      if (e === hopper && ph < 0.55) {
        const q = ph / 0.55;
        hopY = -2.6 * Math.sin(Math.PI * q);
        arms = arms.map((a) => lerp(a, 28, Math.sin(Math.PI * q)));
      }
      // contortionists curl and uncurl as they breathe
      const bend = e.bend * (1 + 0.22 * Math.sin(T * 1.6 + e.i * 0.9 + seed));
      return { ...e, C: [C[0], C[1] + hopY], ang: e.ang + lean, L: e.L * (1 - 0.01 * br), arms, bend };
    }
    if (e.t === 'hoop') {
      // the Cyr wheel turns on the spot, a little way each side
      const sq = 0.8 + 0.2 * Math.cos(T * 1.05 + e.i * 2 + seed * 2.3);
      const c = P(e.c[0], e.c[1]);
      return { ...e, c, sq, rot: 0.12 * Math.sin(T * 0.8 + seed + e.i) };
    }
    // a rigid pole tilts with the slope of the sway where it stands
    const h = clamp((42 - e.C[1]) / 42, 0, 1);
    return { ...e, C: P(e.C[0], e.C[1]), ang: e.ang + (sway * 1.5 * Math.sqrt(h)) / 42 };
  }).flatMap((e) => (e.t === 'hoop' ? [e, starMan(e)] : [e]));
}

/** The performer inside a hoop: spread-eagled, hands and feet on the rim. */
function starMan(h) {
  const r = Math.min(h.rx, h.ry), o = 0.03 * h.ry;
  return {
    t: 'man', star: h.i, C: [h.c[0] - Math.sin(h.rot) * o, h.c[1] + Math.cos(h.rot) * o], ang: h.rot,
    L: h.ry * 1.26, bend: 0, arms: [52, 52], spread: h.rx * 0.55 * h.sq, drop: 0, key: 0, tuck: 0,
    armLen: r * 0.85 * (0.7 + 0.3 * h.sq), top: false, i: 100 + h.i,
  };
}

// ------------------------------------------------------------ the minute turn
//
// Every acrobat of the old act somersaults (tucked, along a ballistic arc)
// to a place in the new one; spare ones leap up into the rigging and new
// ones drop out of it. Hoops roll across to where the new act needs them,
// or roll away into the wings; poles are tossed and twirl.
const MAN_FLIGHT = 1.15;

function pairUp(A, B) {
  // greedy nearest pairs, so nobody crosses the whole act needlessly
  const pairs = [], usedB = new Set(), usedA = new Set();
  const cand = [];
  A.forEach((a, i) => B.forEach((b, j) => cand.push([dist(a.C ?? a.c, b.C ?? b.c), i, j])));
  cand.sort((x, y) => x[0] - y[0]);
  for (const [, i, j] of cand) if (!usedA.has(i) && !usedB.has(j)) { usedA.add(i); usedB.add(j); pairs.push([A[i], B[j]]); }
  A.forEach((a, i) => { if (!usedA.has(i)) pairs.push([a, null]); });
  B.forEach((b, j) => { if (!usedB.has(j)) pairs.push([null, b]); });
  return pairs;
}

const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** Man in flight from a to b (either may be null: off into the rigging). */
function flyMan(a, b, p, flip, big) {
  const up = big ? 1.6 : 1;
  if (!a) a = { ...b, C: [b.C[0] - flip * 8, -40], ang: b.ang + Math.PI, tuck: 0 };
  if (!b) b = { ...a, C: [a.C[0] + flip * 10, -46], ang: a.ang - Math.PI, tuck: 0 };
  const e = inOutSine(p);
  const h = (10 + 0.25 * Math.abs(b.C[0] - a.C[0])) * up;
  const x = lerp(a.C[0], b.C[0], e);
  const yb = lerp(a.C[1], b.C[1], e) - h * 4 * e * (1 - e);
  const turns = (big ? 2 : 1) * TAU * flip;
  const ang = a.ang + (wrapA(b.ang - a.ang) + turns) * ease.inOutCubic(p);
  const tuck = Math.sin(Math.PI * clamp(p * 1.15 - 0.07, 0, 1)) ** 0.7 * 0.95;
  const mix = (k) => lerp(a[k], b[k], e);
  return {
    ...b, C: [x, yb], ang, L: mix('L') * (1 - 0.25 * tuck), bend: mix('bend') * (1 - tuck), tuck,
    spread: mix('spread'), drop: mix('drop') * (1 - tuck), key: 0.8,
    arms: [lerp(a.arms[0], b.arms[0], e), lerp(a.arms[1], b.arms[1], e)],
    armLen: a.armLen != null || b.armLen != null ? lerp(a.armLen ?? 5, b.armLen ?? 5, e) : undefined,
  };
}

function moveHoop(a, b, p, side) {
  const R = (h) => Math.min(h.rx, h.ry);
  if (side > 0) {
    if (!a) { // rolls in from the wings
      const e = ease.outCubic(p), dx = side * 95 * (1 - e);
      return { ...b, c: [b.c[0] + dx, b.c[1]], rot: b.rot - dx / R(b) };
    }
    if (!b) { // rolls away into the wings
      const e = ease.inQuad(p), dx = side * 95 * e;
      return { ...a, c: [a.c[0] + dx, a.c[1]], rot: a.rot - dx / R(a) };
    }
  } else {
    if (!a) { // dropped in from the rigging, spinning, and bounces
      const e = ease.outBounce(p);
      return { ...b, c: [b.c[0], b.c[1] - 100 * (1 - e)], sq: lerp(Math.abs(Math.cos(3 * Math.PI * p)), b.sq, p * p) };
    }
    if (!b) { // tossed up into the rigging
      return { ...a, c: [a.c[0], a.c[1] - 110 * p ** 1.3], sq: Math.max(0.12, Math.abs(Math.cos(3 * Math.PI * p))) * a.sq };
    }
  }
  const e = ease.inOutCubic(p);
  const c = [lerp(a.c[0], b.c[0], e), lerp(a.c[1], b.c[1], e) - 6 * Math.sin(Math.PI * e) * (Math.abs(b.c[1] - a.c[1]) > 4 ? 1 : 0)];
  const rx = lerp(a.rx, b.rx, e), ry = lerp(a.ry, b.ry, e);
  return { ...b, c, rx, ry, sq: lerp(a.sq, b.sq, e), rot: lerp(a.rot, b.rot, e) - (c[0] - a.c[0]) / Math.min(rx, ry) };
}

function movePole(a, b, p) {
  if (!a) a = { ...b, C: [b.C[0], -30], ang: b.ang - TAU };
  if (!b) b = { ...a, C: [a.C[0], -36], ang: a.ang + TAU };
  const e = ease.inOutCubic(p);
  const h = 8;
  return {
    ...b, C: [lerp(a.C[0], b.C[0], e), lerp(a.C[1], b.C[1], e) - h * 4 * e * (1 - e)],
    ang: a.ang + (wrapA(b.ang - a.ang) + Math.PI) * e, L: lerp(a.L, b.L, e),
  };
}

/** Items of a changing digit, u seconds into the turn. */
function turning(A, B, u, seed, side, big = false) {
  const out = [];
  const by = (t) => [A.filter((e) => e.t === t), B.filter((e) => e.t === t)];
  // hoops and poles first: the props move, the men fly over them
  const [ha, hb] = by('hoop');
  const keepA = new Set(), keepB = new Set();
  pairUp(ha, hb).forEach(([a, b], i) => {
    const p = progress(u, 0.1 + 0.15 * i, (a && b ? 1.7 : side < 0 && !b ? 0.85 : 1.4) + 0.15 * i);
    const h = p <= 0 ? a ?? null : p >= 1 ? b ?? null : moveHoop(a, b, p, side);
    if (!h) return;
    out.push(h);
    // a hoop that stays keeps its performer; one that leaves lets him go
    if (a && b) { keepA.add(a.i); keepB.add(b.i); out.push(starMan(h)); }
  });
  const [pa, pb] = by('pole');
  pairUp(pa, pb).forEach(([a, b], i) => {
    const p = progress(u, 0.25 + 0.2 * i, 1.35 + 0.2 * i);
    out.push(p <= 0 ? a ?? null : p >= 1 ? b ?? null : movePole(a, b, p));
  });
  let [ma, mb] = by('man');
  ma = ma.filter((e) => e.star == null || !keepA.has(e.star));
  mb = mb.filter((e) => e.star == null || !keepB.has(e.star));
  const pairs = pairUp(ma, mb);
  // the top of the act leaves first, the base lands first... both: order by height
  pairs.sort((x, y) => ((x[0] ?? x[1]).C[1] - (y[0] ?? y[1]).C[1]));
  pairs.forEach(([a, b], i) => {
    const t0 = 0.05 + i * 0.13 + 0.08 * noise(i, seed);
    const t1 = t0 + MAN_FLIGHT * (big ? 1.25 : 1);
    const p = progress(u, t0, t1);
    const flip = noise(i + 7, seed) < 0.5 ? -1 : 1;
    if (p >= 1 && b && u - t1 < 0.8) { // stuck the landing: knees give, then "ta-da"
      const l = u - t1, sq = 0.13 * Math.exp(-l * 9) * Math.sin(Math.min(1, l * 14) * Math.PI / 2);
      const v = Math.sin(Math.PI * clamp(l / 0.8, 0, 1)) * (b.top || b.star != null ? 1 : 0.5);
      const dy = Math.cos(b.ang) * b.L * sq / 2;
      out.push({ ...b, L: b.L * (1 - sq), C: [b.C[0], b.C[1] + dy], arms: b.star != null ? b.arms : b.arms.map((a) => lerp(a, 32, v)) });
      return;
    }
    out.push(p <= 0 ? a ?? null : p >= 1 ? b ?? null : flyMan(a, b, p, flip, big));
  });
  return out.filter(Boolean);
}

// ------------------------------------------------------------ rendering items

function drawHoop(g, c, rx, ry, w, col = ON) {
  const [cx, cy] = c, r = Math.min(rx, ry);
  g.fillWhere((x, y) => {
    const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
    return Math.abs(d - 1) * r <= w / 2;
  }, col, [cx - rx - w, cy - ry - w, 2 * (rx + w), 2 * (ry + w)]);
}

function manToPose(e, map) {
  const k = map.k ?? 1;
  const dx = Math.sin(e.ang) * e.L / 2, dy = -Math.cos(e.ang) * e.L / 2;
  const F = map([e.C[0] - dx, e.C[1] - dy]), H = map([e.C[0] + dx, e.C[1] + dy]);
  const l = e.L || 1, nx = -(2 * dy) / l, ny = (2 * dx) / l;
  const M = map([e.C[0] + nx * e.bend, e.C[1] + ny * e.bend]);
  // a curled contortionist lifts his head out of the curve, a bump on its outside
  const lb = clamp(Math.abs(e.bend) - 0.4, 0, 1) * Math.sign(e.bend) * 1.1 * k * (1 - e.tuck);
  const lift = lb ? [nx * lb, ny * lb] : null;
  return { F, H, M, lift, arms: e.arms, spread: e.spread, drop: e.drop, key: e.key, tuck: e.tuck, armLen: e.armLen != null ? e.armLen * k : undefined };
}

function drawItems(g, items, map) {
  const k = map.k ?? 1;
  for (const e of items) {
    if (e.t === 'hoop') {
      const c = map(e.c);
      drawHoop(g, c, e.rx * e.sq * k, e.ry * k, Math.max(e.w * k, 1.8));
    } else if (e.t === 'pole') {
      const dx = Math.sin(e.ang) * e.L / 2, dy = -Math.cos(e.ang) * e.L / 2;
      const a = map([e.C[0] - dx, e.C[1] - dy]), b = map([e.C[0] + dx, e.C[1] + dy]);
      const w = Math.max(e.w * k, 1.6);
      g.thickLine(a[0], a[1], b[0], b[1], w);
      if (e.board) {
        const m = map([e.C[0], e.C[1]]), f = map([e.C[0], 42]);
        g.fillPolygon([[m[0] - 3 * k, f[1]], [m[0] + 3 * k, f[1]], [m[0], m[1]]]);
      }
    }
  }
  for (const e of items) if (e.t === 'man') drawAcrobat(g, manToPose(e, map), k);
}

// ------------------------------------------------------------ digit sheet

export const digitSheetSize = { w: 2 + 10 * 29, h: 48 + 34 };
/** All ten numerals: floor troupe (top row) and trapeze troupe (below). */
export function drawDigitSheet(g, t = 0) {
  for (let d = 0; d < 10; d++) {
    const ox = 3 + d * 29;
    const m1 = ([x, y]) => [ox + x, 2 + y]; m1.k = 1;
    drawItems(g, idle(d, t, 0), m1);
    const m2 = ([x, y]) => [ox + 4 + x * HK, 48 + y * HK]; m2.k = HK;
    drawItems(g, idle(d, t, 1), m2);
  }
}

const HK = 0.72;

// ------------------------------------------------------------ the ring

const FLOOR = 58;              // the ring's floor line, screen y
const MIN_X = [65, 96];        // minute digit boxes
const BAR_Y = 43, BAR_X = [2, 47], PIVOT_Y = -24;
const HOUR_X = [4, 26];        // hour digit boxes (on the trapeze bar)

function turnState(date) {
  const f = clockFields(date);
  const START = 59.2, END = 2.6;
  if (f.sec >= START) return { from: f, to: clockFields(new Date(date.getTime() + 60000)), u: f.sec - START };
  if (f.sec < END) return { from: previousMinute(date), to: f, u: f.sec + 60 - START };
  return { from: f, to: f, u: null };
}

/** Seconds from the hour's cannon shot (-10 .. 9), or null. */
function hourClock(f) {
  if (f.m === 59 && f.sec >= 50) return f.sec - 60;
  if (f.m === 0 && f.sec < 9) return f.sec;
  return null;
}

/** Bunting along the top of the ring: rope swags with pennants that flutter. */
function drawBunting(g, T, ox, oy) {
  const hooks = [50, 76, 102, 128];
  for (let k = 0; k < 3; k++) {
    const x0 = hooks[k], x1 = hooks[k + 1], sag = 4.5;
    const ropeY = (x) => { const u = (x - x0) / (x1 - x0); return 1 + sag * 4 * u * (1 - u); };
    for (let x = x0; x < x1; x++) g.pixel(x + ox, Math.floor(ropeY(x + 0.5)) + oy);
    for (let j = 0; j < 3; j++) {
      const px = x0 + 5.5 + j * 7.5, py = ropeY(px) + 0.5;
      const fl = 0.9 * Math.sin(T * 2.6 + k * 1.9 + j * 1.3) + 0.4 * Math.sin(T * 5.3 + j);
      g.fillPolygon([[px - 2 + ox, py + oy], [px + 2 + ox, py + oy], [px + fl + ox, py + 4.6 + oy]]);
    }
  }
}

/** The ring curb, with a chase of marquee bulbs once round per two seconds. */
function drawCurb(g, T, ox, oy) {
  const y = FLOOR + 1 + oy;
  g.hline(54 + ox, y, 74);
  const step = Math.floor(T * 6);
  for (let i = 0; i < 13; i++) {
    const x = 56 + i * 6 + ox;
    if ((i + step) % 3 === 0) g.fillRect(x, y + 1, 2, 2);
    else g.pixel(x + (i % 2), y + 2);
  }
}

/** The cannon, rolled in under the trapeze for the hour. */
function drawCannon(g, x, elev, T, ox, oy) {
  const wy = 57.5 + oy, wx = x + ox, r = 3.6;
  const rot = x / r;
  // barrel: breech on the axle, pointing up at elev (radians from level)
  const bx = wx - 1, by = wy - 1.5;
  const ex = bx + Math.cos(elev) * 12, ey = by - Math.sin(elev) * 12;
  g.thickLine(bx - Math.cos(elev) * 2.5, by + Math.sin(elev) * 2.5, ex, ey, 4);
  g.thickLine(ex - Math.cos(elev) * 1.2, ey + Math.sin(elev) * 1.2, ex, ey, 5.5);
  // a dark band round the barrel and a dark bore, so it reads as a cannon
  g.thickLine(bx + Math.cos(elev) * 5 - Math.sin(elev) * 3, by - Math.sin(elev) * 5 - Math.cos(elev) * 3,
    bx + Math.cos(elev) * 5 + Math.sin(elev) * 3, by - Math.sin(elev) * 5 + Math.cos(elev) * 3, 1, OFF);
  g.fillCircle(bx - Math.cos(elev) * 2.5, by + Math.sin(elev) * 2.5, 2.3);
  // carriage trail and the wheel (spokes turn as it rolls)
  g.thickLine(wx - 9, 61.5 + oy, wx, wy, 2);
  g.fillCircle(wx, wy, r + 1.4, OFF);
  g.ring(wx, wy, r - 0.6, r + 0.6);
  for (let k = 0; k < 3; k++) {
    const a = rot + (k * Math.PI) / 3;
    g.line(Math.round(wx - Math.cos(a) * r), Math.round(wy - Math.sin(a) * r), Math.round(wx + Math.cos(a) * r), Math.round(wy + Math.sin(a) * r));
  }
  return [ex, ey];
}

/** A cartoon puff of smoke: one lumpy outline (a few balls) that swells, drifts up and thins out. */
function drawSmoke(g, x, y, age, seed, dir) {
  const LIFE = 1.4;
  if (age < 0 || age > LIFE) return;
  const life = age / LIFE, grow = ease.outCubic(clamp(age / 0.45, 0, 1));
  const balls = [];
  for (let k = 0; k < 4; k++) {
    const a = seed + k * 1.7;
    const reach = (3 + k * 2.2) * grow;
    balls.push([x + dir[0] * reach + Math.cos(a) * 2.2 * grow, y + dir[1] * reach + Math.sin(a) * 1.6 * grow - 7 * ease.inOutQuad(life),
      (1.6 + 2.6 * grow) * (1 - 0.12 * k)]);
  }
  // the outline breaks up as it thins: drop a growing share of its pixels
  const thin = ease.inQuad(life);
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [bx, by, r] of balls) { x0 = Math.min(x0, bx - r); y0 = Math.min(y0, by - r); x1 = Math.max(x1, bx + r); y1 = Math.max(y1, by + r); }
  const box = [x0 - 1, y0 - 1, x1 - x0 + 2, y1 - y0 + 2];
  const inside = (px, py, m) => balls.some(([bx, by, r]) => (px - bx) ** 2 + (py - by) ** 2 <= (r - m) ** 2);
  g.fillWhere((px, py) => inside(px, py, 0), OFF, box);
  g.fillWhere((px, py, ix, iy) => inside(px, py, 0) && !inside(px, py, 1.1) && noise(ix * 7.1 + iy * 3.3, 4) >= thin, ON, box);
}

export default {
  name: 'Big Top',
  blurb: 'A circus troupe performs the time: Cyr wheels, perch poles and contortionists are the numerals, the hours on a swinging trapeze; each minute the acrobats somersault into the new act, and on the hour a human cannonball is fired across the ring.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  driver: 'full',
  frame(g, ctx) {
    const { date, oled, night } = ctx;
    oled.contrast(0xcf + (0x30 - 0xcf) * night);
    const T = date.getTime() / 1000 % 86400;
    const [ox, oy] = orbit(date, 2, 3);
    const f = ctx.fields;
    const st = turnState(date);
    const hu = hourClock(f);
    const dig = (F) => [Math.floor(F.h / 10), F.h % 10, Math.floor(F.m / 10), F.m % 10];
    const A = dig(st.from), B = dig(st.to);

    drawBunting(g, T, ox, oy);

    // trapeze: two parallel ropes, so the bar stays level as it swings;
    // the cannon's blast sets it swinging hard
    const R = BAR_Y - PIVOT_Y;
    let th = 0.05 * Math.sin(T * TAU / 3.6);
    if (hu != null && hu > 0) th += 0.16 * Math.exp(-hu / 2.4) * Math.sin(hu * TAU / 2.9);
    const sx = R * Math.sin(th), sy = R * (1 - Math.cos(th));
    for (const bx of BAR_X) { // twisted rope: every other pixel
      for (let y = 0; y < BAR_Y; y++) {
        const u = (y - PIVOT_Y) / R;
        if ((y & 1) === 0) g.pixel(Math.floor(bx + sx * u + ox + 0.5), y + oy);
      }
    }
    g.thickLine(BAR_X[0] - 1 + sx + ox, BAR_Y + 1 - sy + oy, BAR_X[1] + 1 + sx + ox, BAR_Y + 1 - sy + oy, 2);

    // the hour's cannon: rolls in, cranks up, fires the human cannonball
    // straight up past the trapeze at :00, catches him again and leaves
    let fly = null;
    if (hu != null) {
      const inX = -20 + 29 * ease.outCubic(progress(hu, -8, -5)) - 29 * ease.inCubic(progress(hu, 6, 8.5));
      const recoil = hu > 0 ? 4 * Math.exp(-hu * 3) * Math.min(1, hu * 30) : 0;
      const elev = lerp(0.15, 0.55, ease.inOutCubic(progress(hu, -4.5, -2.5))) - 0.05 * recoil;
      const shake = hu > -1.6 && hu < 0 ? 0.6 * Math.sin(hu * 70) : 0;
      const [mx, my] = drawCannon(g, inX - recoil + shake, elev, T, ox, oy);
      if (hu > -1.6 && hu < 0) { // the fuse fizzes at the breech
        const sp = Math.floor(hu * 20);
        for (let k = 0; k < 3; k++) g.pixel(inX - 6 + ox + Math.round(noise(sp, k) * 4 - 2), 54 + oy - Math.round(noise(sp, k + 5) * 4));
      }
      if (hu >= 0 && hu < 0.14) { // muzzle flash
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * TAU, l = 5 + 3 * (k % 2);
          g.line(Math.round(mx), Math.round(my), Math.round(mx + Math.cos(a) * l), Math.round(my + Math.sin(a) * l));
        }
      }
      const sd = [Math.cos(elev), -Math.sin(elev)];
      drawSmoke(g, mx + sd[0] * 2, my + sd[1] * 2, hu, 0.3, sd);
      // the human cannonball: head first along a ballistic arc right over
      // the ring, half a somersault at the end to land on top of the new
      // :00's Cyr wheel; ta-da; a back flip off into the wings
      const useed = 3 * 1.7 + 0.3, topX = MIN_X[1] + 13 + ox, topY = FLOOR - 42 + 1.5 + oy;
      const FL = 1.5;
      if (hu >= 0 && hu < FL) {
        const p = hu / FL;
        const tx = topX + swayOf(T, useed) * 0.94, ty = topY - 6.5;
        const H = 29; // apex height above the straight line
        const x = lerp(mx, tx, p), y = lerp(my, ty, p) - H * 4 * p * (1 - p);
        const vx = tx - mx, vy = (ty - my) - H * 4 * (1 - 2 * p);
        const va = Math.atan2(vx, -vy);
        const ang = lerp(va, TAU, ease.inOutCubic(progress(p, 0.55, 1)));
        fly = { C: [x, y], ang, tuck: 0.5 * Math.sin(Math.PI * progress(p, 0.55, 1)), arms: [8, 8], spread: 0.6 };
      } else if (hu >= FL && hu < 4.6) {
        const l = hu - FL, x = topX + swayOf(T, useed) * 0.94;
        const off = progress(hu, 3.4, 4.6);
        if (off <= 0) {
          const sq = 0.18 * Math.exp(-l * 8) * Math.min(1, l * 20), v = Math.sin(Math.PI * clamp(l / 1.9, 0, 1));
          fly = { C: [x, topY - 6.5 * (1 - sq)], ang: 0.04 * Math.sin(l * 9) * Math.exp(-l * 2), L: 13 * (1 - sq), tuck: 0, arms: [lerp(150, 30, v), lerp(150, 30, v)], spread: 1.4 };
        } else { // back flip off the far side
          const xx = lerp(x, 142, off), yy = topY - 6.5 - 22 * 4 * off * (1 - off) + 30 * off * off;
          fly = { C: [xx, yy], ang: -TAU * ease.inOutCubic(off), tuck: 0.9 * Math.sin(Math.PI * off), arms: [60, 60], spread: 0.8 };
        }
      }
    }

    for (let i = 0; i < 4; i++) {
      const hour = i < 2;
      const map = hour
        ? (([x, y]) => [HOUR_X[i] + x * HK + sx + ox, BAR_Y - 42 * HK + y * HK - sy + oy])
        : (([x, y]) => [MIN_X[i - 2] + x + ox, FLOOR - 42 + y + oy]);
      map.k = hour ? HK : 1;
      const seed = i * 1.7 + 0.3;
      let items;
      if (st.u != null && A[i] !== B[i]) {
        // the hour waits for the cannon, then the whole troupe is blown up into the air
        const u = hour ? st.u - 0.85 : st.u;
        items = turning(idle(A[i], T, seed), idle(B[i], T, seed), u, st.from.minuteKey + i, i === 3 ? 1 : -1, hour);
      } else items = idle(B[i], T, seed);
      drawItems(g, items, map);
    }
    if (fly) {
      const m = (p) => p; m.k = 1;
      drawAcrobat(g, manToPose({ L: 13, spread: 0.7, ...fly, bend: 0, drop: 0, key: 0.8 }, m), 1);
    }
    drawCurb(g, T, ox, oy);
    if (hu != null && hu >= 0 && hu < 0.05) oled.invert(true);
  },
};
