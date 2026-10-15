// Skywriter flight plans. Everything is a pure function of the minute: each
// minute's plan (cached) lists the hero's segments from :00 to the next :00,
// the smoke each write lays down, and at the hour the aerobatic team.
//
// A segment is an arc-length-uniform polyline flown from t0 to t1, at
// constant speed (writing) or with a cubic speed profile that matches the
// speeds at both ends (free flight), so the plane never jerks.
import * as kit from '../js/kit.js';
import { glyphPath, resample } from './skywriter-script.js';

export const GUST_LEAD = 0.5, GUST_LIFE = 1.4;
const V_FREE = 21, V_RETRACE = 27;

export function digitsAt(m) {
  const d = new Date(m * 60000), h = d.getHours(), mi = d.getMinutes();
  return [Math.floor(h / 10), h % 10, Math.floor(mi / 10), mi % 10];
}
export function changedAt(m) {
  const a = digitsAt(m), b = digitsAt(m - 1), c = [];
  for (let k = 0; k < 4; k++) if (a[k] !== b[k]) c.push(k);
  return c;
}

// ------------------------------------------------------------- segments
function dirAt(P, j0, j1) {
  const n = P.n, a = Math.max(0, Math.min(n - 1, j0)), b = Math.max(0, Math.min(n - 1, j1));
  const dx = P.pts[2 * b] - P.pts[2 * a], dy = P.pts[2 * b + 1] - P.pts[2 * a + 1], l = Math.hypot(dx, dy) || 1;
  return [dx / l, dy / l];
}
const startOf = (P) => ({ x: P.pts[0], y: P.pts[1], d: dirAt(P, 0, 4) });
const endOf = (P) => ({ x: P.pts[2 * P.n - 2], y: P.pts[2 * P.n - 1], d: dirAt(P, P.n - 5, P.n - 1) });

function seg(P, t0, t1, v0, v1, mode, loops = null) { return { P, t0, t1, v0, v1, mode, loops }; }
// a write is flown without rolling: upright if the path mostly runs right
function holdOf(P) { let sx = 0; for (let j = 1; j < P.n; j++) sx += P.pts[2 * j] - P.pts[2 * j - 2]; return sx < -2 ? -1 : 1; }
const writeSeg = (P, t0, v) => { const S = seg(P, t0, t0 + P.L / v, v, v, 0); S.hold = P.hold ??= holdOf(P); return S; };

/** Arc length flown on segment S at time t. */
function sAt(S, t) {
  const T = S.t1 - S.t0, u = kit.clamp((t - S.t0) / T);
  if (S.mode === 0) return S.P.L * u;
  const u2 = u * u, u3 = u2 * u;
  return (u3 - 2 * u2 + u) * S.v0 * T + (-2 * u3 + 3 * u2) * S.P.L + (u3 - u2) * S.v1 * T;
}

/** Fill st with the state on a segment list at time t: x, y, dx, dy, loop (+1/-1 in a loop, else 0). */
export function evalSegs(segs, t, st) {
  let S = segs[0];
  for (let i = 0; i < segs.length; i++) if (segs[i].t0 <= t) S = segs[i];
  const P = S.P, s = kit.clamp(sAt(S, t), 0, P.L), step = P.L / (P.n - 1);
  const f = s / step, j = Math.min(P.n - 2, Math.floor(f)), r = f - j;
  st.x = P.pts[2 * j] + (P.pts[2 * j + 2] - P.pts[2 * j]) * r;
  st.y = P.pts[2 * j + 1] + (P.pts[2 * j + 3] - P.pts[2 * j + 1]) * r;
  const A = P.ang ??= angles(P);
  st.ang = A[j] + (A[j + 1] - A[j]) * r;
  st.dx = Math.cos(st.ang); st.dy = Math.sin(st.ang); st.loop = S.hold || 0;
  if (S.loops) for (const [a, b, sg] of S.loops) if (s >= a && s <= b) st.loop = sg;
  st.seg = S;
  return st;
}

/** Unwrapped heading along a path (a stall turn at a cusp turns through pi). */
function angles(P) {
  const A = new Float32Array(P.n);
  let prev = 0;
  for (let j = 0; j < P.n; j++) {
    const [dx, dy] = dirAt(P, j - 1, j + 1);
    let a = Math.atan2(dy, dx);
    if (j > 0) { while (a - prev > Math.PI) a -= kit.TAU; while (a - prev < -Math.PI) a += kit.TAU; }
    A[j] = prev = a;
  }
  return A;
}

// ------------------------------------------------------------ free flight
function hermite(out, ax, ay, adx, ady, bx, by, bdx, bdy, k) {
  for (let i = 1; i <= 28; i++) {
    const u = i / 28, u2 = u * u, u3 = u2 * u;
    const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
    out.push([h00 * ax + h10 * adx * k + h01 * bx + h11 * bdx * k, h00 * ay + h10 * ady * k + h01 * by + h11 * bdy * k]);
  }
}
const len = (pts) => { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; };

/** Dense points through knots; loops recorded as arc ranges. */
function build(A, knots, B) {
  const pts = [[A.x, A.y]], loops = [];
  let cur = { x: A.x, y: A.y, d: A.d };
  const all = [...knots, B];
  for (let i = 0; i < all.length; i++) {
    const K = all[i];
    let d = K.d;
    if (!d) { // waypoint: aim along prev -> next
      const nx = all[i + 1] ? all[i + 1].x : K.x, ny = all[i + 1] ? all[i + 1].y : K.y;
      const ddx = nx - cur.x, ddy = ny - cur.y, l = Math.hypot(ddx, ddy) || 1;
      d = [ddx / l, ddy / l];
    }
    const k = Math.max(11, Math.hypot(K.x - cur.x, K.y - cur.y) * 1.2);
    hermite(pts, cur.x, cur.y, cur.d[0], cur.d[1], K.x, K.y, d[0], d[1], k);
    cur = { x: K.x, y: K.y, d };
    if (K.loop) {
      const { R, sg } = K.loop, a = len(pts);
      for (let q = 1; q <= 44; q++) {
        const th = (q / 44) * kit.TAU;
        pts.push([K.x + sg * (R * Math.sin(th) + (th / kit.TAU) * R * 0.6), K.y - R * (1 - Math.cos(th))]);
      }
      loops.push([a, len(pts), sg]);
      cur = { x: pts.at(-1)[0], y: pts.at(-1)[1], d: [sg, 0] };
    }
  }
  return { pts, loops };
}

/** Sharpest turn of a polyline: radians per px, worst over 1 px steps. */
function maxTurn(pts) {
  const P = resample(pts, 1), p = P.pts;
  let mx = 0;
  for (let j = 1; j + 1 < P.n; j++) {
    const ax = p[2 * j] - p[2 * j - 2], ay = p[2 * j + 1] - p[2 * j - 1], bx = p[2 * j + 2] - p[2 * j], by = p[2 * j + 3] - p[2 * j + 1];
    const a = Math.abs(Math.atan2(ax * by - ay * bx, ax * bx + ay * by)) / (P.L / (P.n - 1));
    if (a > mx) mx = a;
  }
  return mx;
}

/**
 * Free flight from A (pos, dir, speed vA, time tA) to B (vB, tB): among
 * deterministic candidate routes (wanders, lazy loops, trips off-screen)
 * pick the one whose length suits the time, so the speed stays near cruise.
 */
export function freeSeg(A, vA, tA, B, vB, tB, seed) {
  const T = tB - tA, avg = (vA + vB) / 2;
  const wt = kit.clamp((T - 1) / 3), Lt = T * (avg * (1 - wt) + V_FREE * wt);
  let best = null, bestE = 1e9;
  for (let c = 0; c < 26; c++) {
    const r = (i) => kit.hash(seed, c, i);
    const nk = T < 1.2 ? 0 : c % 7, knots = [];
    let nl = 0;
    for (let i = 0; i < nk; i++) {
      const ty = r(10 * i);
      if (ty < 0.38 && nl < 2) {
        nl++;
        knots.push({ x: 12 + 40 * r(10 * i + 1), y: 45 + 3 * r(10 * i + 2), d: null, loop: { R: 5.5 + 2 * r(10 * i + 3), sg: r(10 * i + 4) < 0.5 ? 1 : -1 } });
        knots.at(-1).d = [knots.at(-1).loop.sg, 0];
      } else if (ty < 0.55) knots.push({ x: r(10 * i + 5) < 0.5 ? -18 : 82, y: 34 + 12 * r(10 * i + 6) });
      else knots.push({ x: 4 + 56 * r(10 * i + 7), y: 33 + 14 * r(10 * i + 8) });
    }
    const path = build(A, knots, B), L = len(path.pts);
    let e = Math.abs(Math.log(L / Lt));
    const tn = maxTurn(path.pts);
    if (tn > 0.5) e += 4 + tn;                    // a kink: planes cannot turn that tight
    if (T > 6) e -= 0.12 * nl;                     // between jobs, prefer a lazy loop
    if (L / T < 0.45 * avg && T < 3) e += 5;      // would stall
    if (e < bestE) { bestE = e; best = path; }
  }
  const P = resample(best.pts, 0.5);
  // loop ranges were measured on the dense path; rescale to the resampled length
  const k = P.L / len(best.pts);
  return seg(P, tA, tB, vA, vB, 1, best.loops.map(([a, b, s]) => [a * k, b * k, s]));
}

// ------------------------------------------------------------- the heart
const HEART = { cx: 32, cy: 41, s: 0.6 };
function heartHalf(side) {
  const pts = [];
  for (let i = 0; i <= 120; i++) {
    const t = Math.PI * (1 - i / 120);
    const x = 16 * Math.sin(t) ** 3, y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    pts.push([HEART.cx + side * x * HEART.s, HEART.cy - y * HEART.s]);
  }
  return resample(pts, 0.55);
}
// the arrow: a straight shot through the heart, then the head flown as two quick barbs
const ARROW = resample((() => {
  const pts = [], tip = [51.5, 40.5], from = [1, 52.5], ux = tip[0] - from[0], uy = tip[1] - from[1], l = Math.hypot(ux, uy), dx = ux / l, dy = uy / l;
  for (let i = 0; i <= 40; i++) pts.push([from[0] + ux * i / 40, from[1] + uy * i / 40]);
  for (const sgn of [1, -1]) {
    const bx = tip[0] - dx * 4.2 - dy * 3 * sgn, by = tip[1] - dy * 4.2 + dx * 3 * sgn;
    for (let i = 1; i <= 8; i++) pts.push([tip[0] + (bx - tip[0]) * i / 8, tip[1] + (by - tip[1]) * i / 8]);
    if (sgn > 0) for (let i = 1; i <= 8; i++) pts.push([bx + (tip[0] - bx) * i / 8, by + (tip[1] - by) * i / 8]);
  }
  return pts;
})(), 0.55);

// ------------------------------------------------------------- the plan
function heroBurst(m) {
  const cur = digitsAt(m), paths = changedAt(m).filter((k) => k >= 2).map((k) => ({ k, d: cur[k], P: glyphPath(k, cur[k]) }));
  const tot = paths.reduce((a, p) => a + p.P.L, 0);
  return { paths, v: Math.max(34, tot / 2.3) };
}
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** Fly a list of jobs: [{ P, t0?, v, ev }] joined by free flight. Returns segs. */
function fly(segs, from, vFrom, tFrom, jobs, seed) {
  let last = from, lv = vFrom, t = tFrom;
  for (const J of jobs) {
    const st = J.P ? startOf(J.P) : J.to;
    // an unscheduled hop takes as long as its curve needs at these speeds
    const t0 = J.t0 ?? t + Math.max(0.3, len(build(last, [], st).pts) / ((lv + J.v) / 2));
    if (t0 > t + 0.01) segs.push(freeSeg(last, lv, t, st, J.v, t0, seed++));
    if (!J.P) { last = st; lv = J.v; t = t0; continue; }
    const S = writeSeg(J.P, t0, J.v);
    segs.push(S);
    if (J.ev) J.ev.t0 = t0;
    last = endOf(J.P); lv = J.v; t = S.t1;
  }
  return { last, lv, t };
}

const plans = new Map();
export function plan(m) {
  if (plans.has(m)) return plans.get(m);
  const cur = digitsAt(m), ch = changedAt(m), hour = cur[2] === 0 && cur[3] === 0, T0 = m * 60;
  const hero = [], events = [], figures = [], team = [];
  const Bu = heroBurst(m);
  const jobs = Bu.paths.map((p, i) => {
    const ev = { slot: p.k, d: p.d, t0: 0, v: Bu.v, col: null };
    events.push(ev);
    return { P: p.P, v: Bu.v, ev, t0: i === 0 ? T0 : undefined };
  });
  const first = startOf(Bu.paths[0].P);
  let st = fly(hero, first, Bu.v, T0, jobs, m * 97);
  if (hour) {
    const fa = { P: ARROW, v: 34, t0: T0 + 5.9, ev: { P: ARROW, t0: 0, v: 34, col: 'white' } };
    figures.push(fa.ev);
    st = fly(hero, st.last, st.lv, st.t, [fa], m * 97 + 20);
    // the team: rose writes the tens of hours (if they change), gold the units, then both draw the heart
    for (const [name, slot, side, from, exit] of [
      ['rose', 0, -1, { x: -20, y: 5, d: [0.94, 0.34] }, { x: -24, y: 26 }],
      ['gold', 1, 1, { x: 84, y: 3, d: [-0.94, 0.34] }, { x: 88, y: 24 }],
    ]) {
      const segs = [], tj = [];
      if (ch.includes(slot)) {
        const P = glyphPath(slot, cur[slot]), v = Math.max(32, P.L / 2.0), ev = { slot, d: cur[slot], t0: 0, v, col: name };
        events.push(ev); tj.push({ P, v, ev, t0: T0 });
      }
      const H = heartHalf(side), hv = 21, hev = { P: H, t0: 0, v: hv, col: 'rose' };
      figures.push(hev);
      tj.push({ P: H, v: hv, ev: hev, t0: T0 + 3.7 });
      tj.push({ to: { x: exit.x, y: exit.y, d: [Math.sign(exit.x), -0.3] }, v: 26, t0: T0 + 3.7 + H.L / hv + 2.2 });
      fly(segs, from, 30, T0 - 2.4, tj, m * 97 + 40 + slot * 10);
      team.push({ name, segs, t0: segs[0].t0, t1: segs.at(-1).t1 });
    }
  }
  // touch-ups: the plane re-traces older digits, so the smoke stays thick
  const cand = [0, 1, 2, 3].filter((k) => !ch.includes(k)), rj = [];
  (hour ? [26, 44] : [17, 37]).forEach((tr, i) => {
    if (!cand.length || (i > 0 && cand.length < 2)) return;
    const k = cand[(m + i) % cand.length], P = glyphPath(k, cur[k]), ev = { slot: k, d: cur[k], t0: 0, v: V_RETRACE, col: null };
    events.push(ev); rj.push({ P, v: V_RETRACE, ev, t0: T0 + tr });
  });
  st = fly(hero, st.last, st.lv, st.t, rj, m * 97 + 60);
  // and on to the first stroke of the next minute
  const Bn = heroBurst(m + 1);
  fly(hero, st.last, st.lv, st.t, [{ to: startOf(Bn.paths[0].P), v: Bn.v, t0: T0 + 60 }], m * 97 + 80);
  const p = { m, cur, ch, hour, hero, team, events, figures };
  plans.set(m, p);
  if (plans.size > 8) plans.delete(plans.keys().next().value);
  return p;
}
