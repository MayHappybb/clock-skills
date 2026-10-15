// Claw machine choreography: what the claw does, as a pure function of time.
//
// Time is cut into windows k = [60k - 8, 60k + 52) s round each minute
// boundary 60k. A window opens with the claw at HOME (over the chute), runs
// the turn into minute k (remove the changed numerals before 60k, fish the
// new ones out of the heap after it), then idles (drifts, tries for a plush
// and fumbles it) and ends back at HOME. Every window is built from its own
// seed, so any moment can be computed on its own.
//
// The cable is a real pendulum, driven by the trolley's acceleration and the
// winch: integrated once per window (deterministic, from 10 s before it) and
// cached, so frame() only interpolates.

export const TOPY = 30;                 // cable top (under the trolley)
export const YI = 37;                   // idle hub height
export const HOME = 31.5;               // over the chute
export const SEAT = 85;                 // numeral feet
export const NTOP = SEAT - 28;          // numeral head
export const SLOTX = [13, 50];          // numeral centres: tens, ones
export const RIM = 74;                  // chute rim
export const ACT = [                    // plush in the heap: sprite key, centre x, bottom y
  { key: 'bunny', x: 8, bot: 100, h: 13 },
  { key: 'bear', x: 18, bot: 100, h: 11 },
  { key: 'octo', x: 44, bot: 100, h: 8 },
  { key: 'frog', x: 54, bot: 100, h: 13 },
];
const GRAB_DY = 9.2;                    // hub to prong tips
const hash = (a, b = 0) => { let h = (a * 374761393 + b * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

const digitsAt = (k) => { const d = new Date(k * 60000); const m = d.getMinutes(); return { h: d.getHours(), m, t: Math.floor(m / 10), o: m % 10 }; };
export { digitsAt };

/** Build window k's plan. */
function build(k) {
  const kf = [{ t: -8, x: HOME, y: YI, a: 0.25 }];
  const holds = [];       // { obj, t0, t1, end }  obj: 'old0','old1','new0','new1', 'a0'..'a3'
  const front = [];       // [t0, t1]: claw in front of the numerals
  const last = () => kf[kf.length - 1];
  const mv = (dur, x, y, a) => { const l = last(); kf.push({ t: l.t + dur, x: x ?? l.x, y: y ?? l.y, a: a ?? l.a }); return l.t + dur; };
  const at = (t) => { const l = last(); if (t > l.t) kf.push({ ...l, t }); };

  const P = digitsAt(k - 1), N = digitsAt(k);
  const changed = [];
  if (P.t !== N.t) changed.push(0);
  if (P.o !== N.o) changed.push(1);
  const hour = P.h !== N.h;
  // The claw always swaps the ones. When the tens changes too, the old tens
  // hops into the chute after its partner, and the new tens jumps out of the
  // heap by itself: numberfolk are alive.
  const both = changed.includes(0), RB = 2.3, start = -0.55 - RB - (both ? 1.2 : 0);
  at(start);
  {
    const x = SLOTX[1], f0 = last().t;
    mv(0.6, x, YI, 0.9);
    mv(0.4, x, NTOP + 4.2 - GRAB_DY, 0.95);
    const g = mv(0.2, null, null, 0.32);
    mv(0.4, null, YI + 1);
    mv(0.55, HOME);
    const r = last().t;
    mv(0.15, null, null, 0.95);
    holds.push({ obj: 'old1', t0: g, t1: r, end: 'chute' });
    front.push([f0, r + 0.15]);
    if (both) {
      // the claw backs off; the old tens dives in after its partner
      mv(0.6, SLOTX[1], YI, 0.6);
      holds.push({ obj: 'old0', t0: r + 0.25, t1: r + 0.25, end: 'hop' });
    }
  }
  {
    const x = SLOTX[1];
    at(-0.55);
    mv(0.6, x, YI, 0.95);
    if (last().t < 0.05) at(0.05);
    mv(0.45, x, SEAT + 1.6 - 4.4, 1);             // dive into the heap where it is buried
    const g = mv(0.22, null, null, 0.3);
    mv(0.65, null, NTOP - 2.5 + 4.2 - GRAB_DY);    // haul it out, a little above its seat
    mv(0.12);
    const r = last().t;
    mv(0.2, null, null, 0.85);
    mv(0.35, null, YI);
    holds.push({ obj: 'new1', t0: g, t1: r, end: 'seat' });
    if (changed.includes(0)) holds.push({ obj: 'new0', t0: 0.15, t1: 0.15, end: 'pop' });
  }
  mv(0.6, HOME, YI, 0.3);

  const rng = (() => { let i = 0; return () => hash(k * 7919 + 13, i++); })();
  let show = null;
  if (hour) {
    // jackpot: this time the frog holds on
    const a = 3, A = ACT[a];
    mv(0.9, A.x, YI, 0.95);
    mv(0.85, null, A.bot - A.h + 4.5 - GRAB_DY);
    const g = mv(0.25, null, null, 0.3);
    mv(0.9, null, YI - 2);
    mv(0.4);
    mv(0.9, HOME);
    const r = last().t;
    mv(0.2, null, null, 0.95);
    mv(1.5, null, YI - 3, 0.95);
    mv(0.8, null, YI, 0.3);
    holds.push({ obj: 'a' + a, t0: g, t1: r, end: 'win' });
    show = { win: r, rain: r + 0.5, back: r + 3.6 };
  }

  // idle: drift and try for plush until 50 s, then home
  let tries = 0, lastAct = -1;
  while (last().t < 41) {
    const r0 = rng();
    if (r0 < 0.55 && tries < 2) {
      tries++;
      let a = Math.floor(rng() * ACT.length);
      if (a === lastAct) a = (a + 1) % ACT.length;
      if (hour && a === 3) a = 2;
      lastAct = a;
      const A = ACT[a];
      mv(0.9 + 0.5 * rng(), A.x + (rng() - 0.5) * 2, YI, 0.95);
      at(last().t + 0.2 + 0.6 * rng());
      mv(0.9, null, A.bot - A.h + 4.5 - GRAB_DY, 1);
      const g = mv(0.25, null, null, 0.3);
      const up = mv(1.0, null, YI - 1);
      mv(0.8 + 0.3 * rng(), HOME);
      const cross = last().t;
      mv(0.2, null, null, 0.95);
      mv(0.4, null, null, 0.3);
      // the classic weak grip: it slips while lifting, or on the way over
      const when = rng();
      const slip = when < 0.5 ? g + 0.45 + (up - g - 0.45) * (when / 0.5) : up + (cross - up) * 0.25 * ((when - 0.5) / 0.5);
      holds.push({ obj: 'a' + a, t0: g, t1: slip, end: 'slip' });
      at(last().t + 0.6 + rng() * 1.5);
    } else {
      mv(1.2 + rng(), 8 + rng() * 48, YI - 2 + rng() * 6, 0.25 + 0.4 * rng());
      at(last().t + 0.8 + rng() * 2.2);
    }
  }
  mv(Math.max(1.2, 0.04 * Math.abs(last().x - HOME)), HOME, YI, 0.25);
  at(52.1);
  return { k, kf, holds, front, changed, hour, show, P, N, theta: null, t0: 0 };
}

const cache = new Map();
export function plan(k) {
  let p = cache.get(k);
  if (!p) {
    p = build(k);
    cache.set(k, p);
    if (cache.size > 6) cache.delete(cache.keys().next().value);
  }
  return p;
}
export const winOf = (t) => Math.floor((t + 8) / 60);

const sm = (t) => t * t * t * (t * (t * 6 - 15) + 10);      // smootherstep: C2, no jerk for the pendulum
/** Trolley x, hub y, claw opening at absolute time t. o: output object */
export function pose(t, o) {
  const k = winOf(t), p = plan(k), rel = t - 60 * k, kf = p.kf;
  let i = 1;
  while (i < kf.length - 1 && kf[i].t < rel) i++;
  const A = kf[i - 1], B = kf[i];
  const u = B.t > A.t ? sm(Math.min(1, Math.max(0, (rel - A.t) / (B.t - A.t)))) : 1;
  o.x = A.x + (B.x - A.x) * u; o.y = A.y + (B.y - A.y) * u; o.a = A.a + (B.a - A.a) * u;
  return o;
}

// ------------------------------------------------------------- pendulum
const G = 1800, DAMP = 3.2, HZ = 240, STORE = 2, PRE = 10;
const q0 = {}, q1 = {}, q2 = {};
/** Is the claw carrying something at t (a load lengthens the pendulum)? */
function holding(t) {
  const k = winOf(t), p = plan(k), rel = t - 60 * k;
  for (const h of p.holds) if (h.obj[0] === 'a' || h.obj[3] === '1') if (rel >= h.t0 && rel < h.t1) return true;
  return false;
}
function swing(p) {
  if (p.theta) return p;
  const tA = 60 * p.k - 8 - PRE, tB = 60 * p.k + 52.2, n = Math.ceil((tB - tA) * HZ);
  const out = new Float32Array(Math.ceil(n / STORE) + 2);
  const dt = 1 / HZ;
  let th = 0, w = 0;
  pose(tA - dt, q0); pose(tA, q1);
  for (let i = 0; i <= n; i++) {
    const t = tA + i * dt;
    pose(t + dt, q2);
    const ax = (q2.x - 2 * q1.x + q0.x) / (dt * dt);
    const L = Math.max(3, q1.y - TOPY) + (holding(t) ? 16 : 3), Ld = (q2.y - q0.y) / (2 * dt);
    const acc = (-G * Math.sin(th) - ax * Math.cos(th) - 2 * Ld * w) / L - DAMP * w;
    w += acc * dt; th += w * dt;
    if (i % STORE === 0) out[i / STORE] = th;
    q0.x = q1.x; q0.y = q1.y; q1.x = q2.x; q1.y = q2.y;
  }
  p.theta = out; p.t0 = tA;
  return p;
}
/** Cable angle at absolute time t (radians, + swings the claw to the right... of the trolley). */
export function theta(t) {
  const p = swing(plan(winOf(t)));
  const f = (t - p.t0) * HZ / STORE, i = Math.floor(f), u = f - i, a = p.theta;
  if (i < 0) return 0;
  if (i >= a.length - 1) return a[a.length - 1];
  return a[i] + (a[i + 1] - a[i]) * u;
}

/** Full claw state at t: trolley x, hub (hx, hy), tilt th, opening a. */
export function claw(t, o) {
  pose(t, o);
  const th = theta(t), L = o.y - TOPY;
  o.th = th; o.hx = o.x + L * Math.sin(th); o.hy = TOPY + L * Math.cos(th);
  return o;
}
/** Where a held thing hangs: grip point under the hub, turned with the cable. */
export function gripAt(t, o) {
  claw(t, o);
  const dy = 4.4;
  o.gx = o.hx + dy * Math.sin(o.th); o.gy = o.hy + dy * Math.cos(o.th);
  return o;
}
