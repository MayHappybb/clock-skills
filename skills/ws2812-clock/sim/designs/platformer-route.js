// The frog's speedrun, planned once per minute as a list of closed-form
// segments (hops are true ballistic arcs under one gravity), so frame() only
// looks up where the frog is. The level is a loop of stations:
//   M0 -> M1 -> spring -> (launch) H0 -> H1 -> bonk the ? block -> H0 ->
//   (wall-slide) spring -> (bounce) M1 -> M0 -> warp pipe -> M0
// and the minute ends with a ground pound on the digit that is about to
// change (the hour digit at the top of the tower before the hour).
import * as kit from '../js/kit.js';

export const GRAV = 900;              // px / s^2
export const SPRING = { x: 57, y: 112 };
export const PIPE = { x: 121.5, y: 104 };
export const QBLOCK = { x: 13, y: 12, s: 8 };          // ? block above H1 (x centre, top, size)
export const COINS = [[47, 25], [52.5, 21], [58, 25]];  // above the shaft, taken on every launch
export const T_POUND_M = 59.45, T_POUND_H = 59.2;

/** Ballistic arc from (x0, y0) to (x1, y1) whose apex is at height ya (y down). */
function arc(t0, x0, y0, x1, y1, ya, o = {}) {
  ya = Math.min(ya, y0 - 0.01, y1 - 0.01);
  const tu = Math.sqrt((2 * (y0 - ya)) / GRAV), td = Math.sqrt((2 * (y1 - ya)) / GRAV), T = tu + td;
  return { kind: 'arc', t0, t1: t0 + T, x0, y0, x1, y1, ya, tu, T, xm: o.xm || 'lin', spin: o.spin || 0, dir: o.dir ?? Math.sign(x1 - x0 || 1) };
}

function evalArc(S, t) {
  const u = t - S.t0, T = S.T;
  const y = u < S.tu ? S.ya + 0.5 * GRAV * (S.tu - u) ** 2 : S.ya + 0.5 * GRAV * (u - S.tu) ** 2;
  const vy = GRAV * (u - S.tu);
  const f = kit.clamp(u / T);
  let fx = f;
  if (S.xm === 'late') fx = kit.smoothstep(0.42, 1, f);       // straight up first, then air control
  else if (S.xm === 'early') fx = 1 - (1 - kit.smoothstep(0, 0.55, f)) ** 2;
  return { x: S.x0 + (S.x1 - S.x0) * fx, y, vy, air: 1, rot: S.spin * kit.ease.inOut(f), dir: S.dir };
}

export class Route {
  constructor(geo, start, end) {
    this.geo = geo; this.seg = []; this.t = start.t; this.spring = []; this.bonks = []; this.dir = -1;
    this.coinsTaken = COINS.map(() => []); this.dust = [];
    this.at = start.station;
    if (start.station === 'SPR' && start.hour) this.celebrate(start.until);
    else this.sit(start.until - this.t, true);
    this.plan(end);
    this.coinEvents();
  }

  st(name) {
    const g = this.geo;
    if (name === 'SPR') return { x: SPRING.x, y: SPRING.y };
    if (name === 'PIPE') return { x: PIPE.x, y: PIPE.y };
    return g.spot[name];
  }
  push(S) {
    const P = this.seg[this.seg.length - 1];
    if (S.kind === 'land' && P && this.dust) {
      const drop = P.kind === 'arc' ? P.y1 - P.ya : P.kind === 'slide' ? 40 : P.kind === 'pound' ? 30 : 0;
      if (drop > 12) this.dust.push({ t: S.t0, x: S.x, y: S.y, k: Math.min(2, drop / 25) });
    }
    this.seg.push(S); this.t = S.t1; if (S.dir) this.dir = S.dir;
  }

  sit(d, idle = false) {
    if (d <= 0) return;
    const p = this.st(this.at);
    this.push({ kind: 'sit', t0: this.t, t1: this.t + d, x: p.x, y: p.y, dir: this.dir, idle });
  }
  /** A hop between two points: crouch, arc, land. */
  hop(x1, y1, h = 6, o = {}) {
    const p = this.cur();
    this.push({ kind: 'crouch', t0: this.t, t1: this.t + 0.07, x: p.x, y: p.y, dir: Math.sign(x1 - p.x) || this.dir });
    const A = arc(this.t, p.x, p.y, x1, y1, Math.min(p.y, y1) - h, o);
    this.push(A);
    this.push({ kind: 'land', t0: this.t, t1: this.t + 0.11, x: x1, y: y1, dir: A.dir });
  }
  cur() { const S = this.seg[this.seg.length - 1]; if (!S) return this.st(this.at); return S.kind === 'arc' || S.kind === 'fall' || S.kind === 'slide' ? { x: S.x1, y: S.y1 } : { x: S.x ?? S.x1, y: S.y ?? S.y1 }; }

  move(to) {
    const from = this.at, a = this.st(from), b = this.st(to);
    if (from === 'M0' && to === 'M1') this.hop(b.x, b.y, 7);
    else if (from === 'M1' && to === 'SPR') { this.hop(b.x, b.y, 5); this.spring.push({ t: this.t - 0.11, k: 'land' }); }
    else if (from === 'SPR' && to === 'H0') {
      this.spring.push({ t: this.t + 0.14, k: 'launch' });
      this.push({ kind: 'crouch', t0: this.t, t1: this.t + 0.14, x: a.x, y: a.y, dir: -1, deep: 1 });
      this.push(arc(this.t, a.x, a.y, b.x, b.y, 31, { xm: 'late', dir: -1 }));
      this.push({ kind: 'land', t0: this.t, t1: this.t + 0.12, x: b.x, y: b.y, dir: -1 });
    } else if (from === 'H0' && to === 'H1') this.hop(b.x, b.y, 8);
    else if (from === 'H1' && to === 'H0') this.hop(b.x, b.y, 8);
    else if (from === 'H0' && to === 'SPR') {
      // off the edge into the shaft, then a wall-slide down H0's face
      const xs = SPRING.x;
      this.push({ kind: 'crouch', t0: this.t, t1: this.t + 0.06, x: a.x, y: a.y, dir: 1 });
      const A = arc(this.t, a.x, a.y, xs, a.y + 6, a.y - 7, { xm: 'early', dir: 1 });
      this.push(A);
      const v0 = GRAV * (A.T - A.tu), vmax = 95, y0 = A.y1, y1 = b.y;
      this.push(slide(this.t, xs, y0, y1, v0, vmax));
      this.spring.push({ t: this.t, k: 'land' });
      this.push({ kind: 'land', t0: this.t, t1: this.t + 0.16, x: xs, y: b.y, dir: -1 });
    } else if (from === 'SPR' && to === 'M1') {
      this.spring.push({ t: this.t + 0.1, k: 'launch' });
      this.push({ kind: 'crouch', t0: this.t, t1: this.t + 0.1, x: a.x, y: a.y, dir: 1, deep: 1 });
      this.push(arc(this.t, a.x, a.y, b.x, b.y, b.y - 9, { xm: 'late', dir: 1 }));
      this.push({ kind: 'land', t0: this.t, t1: this.t + 0.11, x: b.x, y: b.y, dir: 1 });
    } else if (from === 'M1' && to === 'M0') this.hop(b.x, b.y, 7);
    else if (from === 'M0' && to === 'PIPE') {
      this.hop(b.x, b.y, 6);
      this.push({ kind: 'pipe', t0: this.t, t1: this.t + 0.4, x: b.x, y: b.y, dir: 1, a0: 0, a1: 1 });
      this.push({ kind: 'hidden', t0: this.t, t1: this.t + 0.7 });
      this.push({ kind: 'pipe', t0: this.t, t1: this.t + 0.4, x: b.x, y: b.y, dir: -1, a0: 1, a1: 0 });
      this.at = 'PIPE';
      this.dir = -1;
    } else if (from === 'PIPE' && to === 'M0') this.hop(b.x, b.y, 6);
    else if (from === 'H1' && to === 'BONK') {
      const q = QBLOCK, yb = q.y + q.s; // bottom of the block
      const feetApex = yb + 13;
      this.push({ kind: 'crouch', t0: this.t, t1: this.t + 0.07, x: a.x, y: a.y, dir: this.dir });
      const up = arc(this.t, a.x, a.y, a.x + (q.x - a.x) * 0.5, feetApex, feetApex, { dir: this.dir });
      // the head meets the block at the top of the arc: cut it, fall back
      up.T = up.tu; up.t1 = up.t0 + up.tu; up.x1 = q.x * 0.5 + a.x * 0.5; up.y1 = feetApex;
      this.push(up);
      this.bonks.push(this.t);
      const dn = arc(this.t, up.x1, feetApex, a.x, a.y, feetApex + 0.01, { dir: this.dir });
      this.push(dn);
      this.push({ kind: 'land', t0: this.t, t1: this.t + 0.11, x: a.x, y: a.y, dir: this.dir });
      return; // stays at H1
    }
    this.at = to;
  }

  /** On the spring after the hour: bounce for joy while the fireworks count. */
  celebrate(until) {
    const p = this.st('SPR');
    while (this.t + 1.3 < until) {
      this.spring.push({ t: this.t + 0.1, k: 'launch' });
      this.push({ kind: 'crouch', t0: this.t, t1: this.t + 0.1, x: p.x, y: p.y, dir: this.dir, deep: 1 });
      this.push(arc(this.t, p.x, p.y, p.x, p.y, 60, { spin: this.seg.length % 3 === 0 ? 2 * Math.PI : 0, dir: this.dir }));
      this.spring.push({ t: this.t, k: 'land' });
      this.push({ kind: 'land', t0: this.t, t1: this.t + 0.14, x: p.x, y: p.y, dir: this.dir });
      this.dir = -this.dir;
    }
    this.sit(until - this.t, true);
  }

  /** Go round the loop from the current station, ending at `end.station` at `end.t`, with slack spread as idle time. */
  plan(end) {
    const C = ['M0', 'M1', 'SPR', 'H0', 'H1', 'BONK', 'H0', 'SPR', 'M1', 'M0', 'PIPE'];
    const startIdx = { M0: 0, M1: 1, SPR: 2, H0: 3, H1: 4, PIPE: 10 }[this.at] ?? 0;
    // one dry run round the loop, noting when each station is reached
    const R = Object.create(Route.prototype);
    Object.assign(R, { geo: this.geo, seg: [], t: 0, spring: [], bonks: [], dir: this.dir, at: this.at });
    const avail = end.t - this.t, seqAll = [];
    let best = null;
    for (let n = 1; n < 80; n++) {
      const st = C[(startIdx + n) % C.length];
      seqAll.push(st);
      R.move(st);
      if (st === 'BONK') R.at = 'H1';
      R.t += 0.16;
      if (R.t > avail) break;
      if (st === end.station) best = { dur: R.t, seq: seqAll.slice() };
    }
    const idleable = best.seq.map((s, i) => (s === 'BONK' || s === 'M0' || s === 'H1' || s === 'M1' ? 1 : 0.3));
    const wsum = idleable.reduce((a, b) => a + b, 0), slack = avail - best.dur;
    best.seq.forEach((s, i) => {
      if (s === 'BONK') { this.move('BONK'); this.at = 'H1'; } else this.move(s);
      this.sit(0.16 + (slack * idleable[i]) / wsum, true);
    });
  }

  coinEvents() {
    // which coins the frog's head passes through, and when
    for (const S of this.seg) {
      if (S.kind !== 'arc') continue;
      for (let t = S.t0; t < S.t1; t += 1 / 60) {
        const p = evalArc(S, t);
        COINS.forEach(([cx, cy], k) => {
          const L = this.coinsTaken[k];
          if (Math.hypot(p.x - cx, p.y - 7 - cy) < 6.5 && !(L.length && t - L[L.length - 1] < 1)) L.push(t);
        });
      }
    }
  }

  /** The frog at local time t: position and pose parameters. */
  frog(t) {
    const seg = this.seg;
    let lo = 0, hi = seg.length - 1;
    if (!seg.length) return null;
    if (t <= seg[0].t0) return still(seg[0], t);
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (seg[m].t0 <= t) lo = m; else hi = m - 1; }
    const S = seg[lo];
    if (t > S.t1) return still(S, t);
    return evalSeg(S, t);
  }
}

function slide(t0, x, y0, y1, v0, vmax) {
  // accelerate at GRAV/3 towards vmax (friction on the wall), from speed v0 (clamped to vmax)
  const a = GRAV * 0.35, v = Math.min(v0, vmax);
  const ta = Math.max(0, (vmax - v) / a), da = v * ta + 0.5 * a * ta * ta;
  const D = y1 - y0;
  let T;
  if (da >= D) T = (-v + Math.sqrt(v * v + 2 * a * D)) / a;
  else T = ta + (D - da) / vmax;
  return { kind: 'slide', t0, t1: t0 + T, x0: x, x1: x, y0, y1, v, a, ta, vmax, dir: -1 };
}

function still(S, t) {
  if (S.kind === 'hidden') return null;
  const e = evalSeg(S, Math.min(t, S.t1));
  if (e) { e.air = 0; e.vy = 0; }
  return e;
}

function evalSeg(S, t) {
  const u = t - S.t0, d = S.t1 - S.t0, f = d > 0 ? kit.clamp(u / d) : 1;
  switch (S.kind) {
    case 'hidden': return null;
    case 'sit': return { x: S.x, y: S.y, dir: S.dir, air: 0, sq: 1, idle: S.idle ? u : -1, idleLen: d, t0: S.t0 };
    case 'crouch': return { x: S.x, y: S.y, dir: S.dir, air: 0, sq: 1 + (S.deep ? 0.45 : 0.3) * Math.sin((Math.PI / 2) * f) };
    case 'land': return { x: S.x, y: S.y, dir: S.dir, air: 0, sq: 1 + 0.4 * (1 - f) * Math.cos(f * 4) };
    case 'arc': { const e = evalArc(S, t); e.sq = 1 - 0.12 * kit.clamp(-e.vy / 400); return e; }
    case 'slide': {
      let y, vy;
      if (u < S.ta) { y = S.y0 + S.v * u + 0.5 * S.a * u * u; vy = S.v + S.a * u; }
      else { y = S.y0 + S.v * S.ta + 0.5 * S.a * S.ta * S.ta + S.vmax * (u - S.ta); vy = S.vmax; }
      return { x: S.x0, y: Math.min(y, S.y1), vy, air: 1, slide: 1, dir: -1, sq: 1 };
    }
    case 'fall': {
      const y = S.y0 + S.v0 * u + 0.5 * S.g * u * u;
      return { x: S.x0, y: Math.min(y, S.y1), vy: S.v0 + S.g * u, air: 1, dir: S.dir, sq: 0.8, rot: 0 };
    }
    case 'pipe': {
      const k = S.a0 + (S.a1 - S.a0) * kit.ease.inOut(f);
      return { x: S.x, y: S.y + 14 * k, dir: S.dir, air: 0, sq: 0.9, clip: [S.x, S.y, 0, -1] };
    }
    case 'pound': {
      // hang at the top with a spin, then slam
      if (u < S.hang) return { x: S.x, y: S.ya, dir: S.dir, air: 1, rot: -2 * Math.PI * kit.ease.inOut(u / S.hang), sq: 1, vy: 0 };
      const v = u - S.hang, y = Math.min(S.y1, S.ya + 0.5 * GRAV * 3 * v * v);
      return { x: S.x, y, dir: S.dir, air: 1, sq: 0.75, vy: 500, pound: 1 };
    }
  }
  return null;
}

/** The pre-turn act: jump, spin, slam down on the digit at `spotName`, then recoil to a perch. */
export function poundAndRecoil(R, spotName, tImpact, perch) {
  const p = R.st(spotName);
  const hang = 0.32, rise = spotName === 'H0' ? 16 : 9;
  const tu = Math.sqrt((2 * rise) / GRAV), slam = Math.sqrt((2 * rise) / (GRAV * 3));
  const tStart = tImpact - slam - hang - tu - 0.08;
  if (R.t < tStart) R.sit(tStart - R.t, true);
  R.push({ kind: 'crouch', t0: R.t, t1: R.t + 0.08, x: p.x, y: p.y, dir: R.dir });
  const up = arc(R.t, p.x, p.y, p.x, p.y - rise, p.y - rise, { dir: R.dir });
  up.T = up.tu; up.t1 = up.t0 + up.tu; up.y1 = p.y - rise;
  R.push(up);
  R.push({ kind: 'pound', t0: R.t, t1: R.t + hang + slam, x: p.x, ya: p.y - rise, y1: p.y, hang, dir: R.dir });
  R.push({ kind: 'land', t0: R.t, t1: R.t + 0.06, x: p.x, y: p.y, dir: R.dir });
  // recoil to the perch
  const q = R.st(perch);
  const dir = Math.sign(q.x - p.x) || 1;
  R.push({ kind: 'crouch', t0: R.t, t1: R.t + 0.05, x: p.x, y: p.y, dir });
  const ya = p.y - (perch === 'SPR' ? 12 : 8);
  R.push(arc(R.t, p.x, p.y, q.x, q.y, ya, { xm: 'early', dir }));
  if (perch === 'SPR') R.spring.push({ t: R.t, k: 'land' });
  R.push({ kind: 'land', t0: R.t, t1: R.t + 0.14, x: q.x, y: q.y, dir });
  R.at = perch;
  R.dir = -dir;
  R.push({ kind: 'sit', t0: R.t, t1: R.t + 30, x: q.x, y: q.y, dir: -dir, idle: true, watch: 1 });
}
