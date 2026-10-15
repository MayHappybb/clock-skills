// Breakout's world, one minute at a time, as a deterministic cache keyed by
// the minute: which bricks stand, the fireball path(s) that rebuild the
// numerals at the turn, and the rally played by the frog's paddle for the
// rest of the minute (fixed-step physics, recorded so frame() only looks up).
import * as kit from '../js/kit.js';
import { bricksOf, UNIT, COURSE } from './breakout-font.js';

export const W = 64, H = 192;
export const WALL = 2;                       // frame pipes: x < 2, x >= 62, y < 2
export const PY = 166, PHW = 10;             // paddle top row, half width
export const R = 1.5, SPD = 100;             // ball radius (px), speed (px/s)
export const DT = 1 / 120, CATCH_FROM = 54;  // physics step; the paddle catches the ball after this
export const HOME = 32;                      // paddle rests here at the turn
export const SLOTS = [[5, 12, 0], [35, 12, 0], [5, 64, 1], [35, 64, 1]];   // x, y, material (0 gold, 1 glass)

const pad = (n) => String(n).padStart(2, '0');
export const digitsAt = (M) => { const d = new Date(M * 60000); return pad(d.getHours()) + pad(d.getMinutes()); };

/** World bricks of numeral ch in slot s. */
function placed(ch, s) {
  const [sx, sy, mat] = SLOTS[s];
  return bricksOf(ch).map((b) => {
    const x = sx + b.u * UNIT, y = sy + b.r * COURSE, w = b.len * UNIT;
    return { slot: s, key: b.key, x, y, w, cx: x + (w - 1) / 2, cy: y + 1, mat, len: b.len };
  });
}

// ------------------------------------------------------------ fireball paths
/** A centripetal Catmull-Rom spline through pts, sampled; returns { xs, ys, s (arclength), knotS }. */
function spline(pts) {
  const P = [pts[0], ...pts, pts[pts.length - 1]];
  const xs = [], ys = [], knotS = [0];
  const tj = (a, b) => Math.max(1e-3, Math.hypot(b[0] - a[0], b[1] - a[1]) ** 0.5);
  for (let i = 1; i + 2 < P.length; i++) {
    const p0 = P[i - 1], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2];
    const t1 = tj(p0, p1), t2 = t1 + tj(p1, p2), t3 = t2 + tj(p2, p3);
    const n = Math.max(4, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 1.5));
    for (let k = 0; k < n; k++) {
      const t = t1 + (t2 - t1) * (k / n);
      const q = (a, b, ta, tb) => [((tb - t) * a[0] + (t - ta) * b[0]) / (tb - ta), ((tb - t) * a[1] + (t - ta) * b[1]) / (tb - ta)];
      const A1 = q(p0, p1, 0, t1), A2 = q(p1, p2, t1, t2), A3 = q(p2, p3, t2, t3);
      const B1 = q(A1, A2, 0, t2), B2 = q(A2, A3, t1, t3);
      const C = q(B1, B2, t1, t2);
      xs.push(C[0]); ys.push(C[1]);
    }
    knotS.push(xs.length);       // index of the next knot, fixed up to arclength below
  }
  xs.push(pts[pts.length - 1][0]); ys.push(pts[pts.length - 1][1]);
  const s = new Float32Array(xs.length);
  for (let i = 1; i < xs.length; i++) s[i] = s[i - 1] + Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]);
  return { xs: Float32Array.from(xs), ys: Float32Array.from(ys), s, knotS: knotS.map((i) => s[Math.min(i, s.length - 1)]) };
}
const sstep = (u) => u * u * (3 - 2 * u);
function invSstep(v) { let a = 0, b = 1; for (let i = 0; i < 30; i++) { const m = (a + b) / 2; if (sstep(m) < v) a = m; else b = m; } return (a + b) / 2; }

/** Position on path at arclength d. */
export function pathAt(p, d) {
  const s = p.sp.s, n = s.length;
  if (d <= 0) return [p.sp.xs[0], p.sp.ys[0]];
  if (d >= s[n - 1]) return [p.sp.xs[n - 1], p.sp.ys[n - 1]];
  let a = 0, b = n - 1;
  while (b - a > 1) { const m = (a + b) >> 1; if (s[m] <= d) a = m; else b = m; }
  const f = (d - s[a]) / (s[b] - s[a] || 1);
  return [p.sp.xs[a] + (p.sp.xs[b] - p.sp.xs[a]) * f, p.sp.ys[a] + (p.sp.ys[b] - p.sp.ys[a]) * f];
}
/** Arclength travelled at age t (seconds into the minute). */
export const pathDist = (p, t) => p.L * sstep(kit.clamp((t - p.t0) / p.D));

/** A molecule's position at time t. */
export function enemyAt(e, t) {
  const u = t - e.ts;
  return [kit.clamp(e.hx + 11 * Math.sin(u * 0.8 + e.ph) * Math.min(1, u * 0.5), 7, W - 7), 3 + e.vy * u];
}

/** Nearest-neighbour order of bricks starting from (x, y). */
function nnOrder(list, x, y) {
  const left = list.slice(), out = [];
  while (left.length) {
    let bi = 0, bd = Infinity;
    left.forEach((b, i) => { const d = Math.hypot(b.cx - x, b.cy - y) + 0.35 * Math.abs(b.cy - y); if (d < bd) { bd = d; bi = i; } });
    const b = left.splice(bi, 1)[0];
    out.push(b); x = b.cx; y = b.cy;
  }
  return out;
}

function makePath(start, doomed, laid, t0, events) {
  const a = nnOrder(doomed, start[0], start[1]);
  const last = a.length ? a[a.length - 1] : { cx: start[0], cy: start[1] };
  const b = nnOrder(laid, last.cx, last.cy);
  const seq = [...a.map((x) => ['smash', x]), ...b.map((x) => ['lay', x])];
  const pts = [start, ...seq.map(([, x]) => [x.cx, x.cy]), start];
  const sp = spline(pts), L = sp.s[sp.s.length - 1];
  const D = kit.clamp(0.9 + L / 260, 1.4, 2.8);
  seq.forEach(([kind, br], i) => {
    const t = t0 + D * invSstep(kit.clamp(sp.knotS[i + 1] / L));
    events.push({ kind, br, t });
  });
  return { sp, L, D, t0 };
}

// --------------------------------------------------------------- the rally
const caches = new Map(), jobs = new Map();
/** The plan of minute M (computed now if it was not prepared). */
export function minute(M) {
  if (caches.has(M)) return caches.get(M);
  const j = jobs.get(M) || build(M);
  let r;
  do r = j.next(); while (!r.done);
  jobs.delete(M);
  return r.value;
}
/** Work on minute M's plan a little (one rally), so no single frame pays for all of it. */
export function prepare(M) {
  if (caches.has(M)) return;
  if (!jobs.has(M)) jobs.set(M, build(M));
  if (jobs.get(M).next().done) jobs.delete(M);
}
function* build(M) {
  if (caches.size > 6) caches.delete(caches.keys().next().value);
  const now = digitsAt(M), old = digitsAt(M - 1), hour = now.slice(2) === '00';
  const bricks = [], events = [], paths = [], changed = [];
  const doomed = [], laid = [];
  for (let s = 0; s < 4; s++) {
    const nb = placed(now[s], s), ob = placed(old[s], s);
    const nk = new Set(nb.map((b) => b.key)), ok = new Set(ob.map((b) => b.key));
    const dm = ob.filter((b) => !nk.has(b.key)), ld = nb.filter((b) => !ok.has(b.key));
    for (const b of nb) { b.isNew = !ok.has(b.key); bricks.push(b); }
    if (dm.length || ld.length) changed.push(s);
    doomed.push(dm); laid.push(ld);
  }
  const start = [HOME, PY - R];
  if (hour) {
    // multiball: one fireball per changed numeral, fanned out from the paddle
    changed.forEach((s, k) => {
      const st = [HOME + (k - (changed.length - 1) / 2) * 4, PY - R];
      paths.push(makePath(st, doomed[s], laid[s], 0.25 + 0.22 * k, events));
    });
  } else {
    paths.push(makePath(start, doomed.flat(), laid.flat(), 0, events));
  }
  const smashT = new Map(), layT = new Map();
  for (const e of events) (e.kind === 'smash' ? smashT : layT).set(e.br.slot * 10000 + e.br.key, e.t);
  const T0 = Math.max(...paths.map((p) => p.t0 + p.D)) + 0.35;

  // solid map of the standing numerals
  const map = new Int16Array(W * H).fill(-1);
  bricks.forEach((b, i) => { for (let y = b.y; y < b.y + COURSE; y++) for (let x = b.x; x < b.x + b.w; x++) map[y * W + x] = i; });
  const solid = (x, y) => {
    if (x < WALL || x >= W - WALL || y < WALL) return -2;
    if (y >= H) return -1;
    return map[(y | 0) * W + (x | 0)];
  };

  // drifting "molecules" come out of the two ceiling hatches; closed-form flight
  const enemies = [];
  for (let k = 0, ts = T0 + 2.5 + 2 * kit.hash(M, 41); ts < CATCH_FROM - 17; k++, ts += 6.5 + 3 * kit.hash(M, k, 43)) {
    enemies.push({ ts, hx: k & 1 ? 49.5 : 17.5, ph: kit.hash(M, k, 47) * 6.28, vy: 10 + 3 * kit.hash(M, k, 53), kind: Math.floor(kit.hash(M, k, 59) * 3) });
  }
  for (const e of enemies) e.tEnd = e.ts + (PY - 6 - 3) / e.vy;

  // serve and play: a few serves are tried, the first whose rally comes home
  // in time (and never strands the ball up top for long) is kept
  const play = (seed) => {
    const n = Math.ceil((60 - T0) / DT) + 2;
    const bx = new Float32Array(n), by = new Float32Array(n), px = new Float32Array(n);
    const hits = [], pads = [], kill = new Map();
    let x = HOME + 2, y = PY - R, p = HOME, pv = 0;
    const a0 = (kit.hash(M, 7, seed) - 0.5) * 1.6;
    let vx = SPD * Math.sin(a0), vy = -SPD * Math.cos(a0), np = 0, aim = 0.3, caught = -1, xc = HOME, off = 0, missed = 0, nb = 0;
    for (let i = 0; i < n; i++) {
      const t = T0 + i * DT;
      bx[i] = x; by[i] = y; px[i] = p;
      if (caught >= 0) continue;
      // ball, axis by axis
      const sx = Math.sign(vx), sy = Math.sign(vy);
      let nx = x + vx * DT, hx = -1;
      for (const dy of [-0.8, 0, 0.8]) { const h = solid(nx + sx * R, y + dy); if (h !== -1) { hx = h; break; } }
      if (hx !== -1) { vx = -vx; if (hx >= 0) hits.push([t, hx]); } else x = nx;
      let ny = y + vy * DT, hy = -1;
      for (const dx of [-0.8, 0, 0.8]) { const h = solid(x + dx, ny + sy * R); if (h !== -1) { hy = h; break; } }
      if (hy !== -1) { vy = -vy; if (hy >= 0) hits.push([t, hy]); } else y = ny;
      if (hx !== -1 || hy !== -1) {
        // a rough brick face: each bounce turns the ball a few degrees, which
        // breaks periodic loops; late in the minute it is nudged homeward
        nb++;
        let ang = Math.atan2(vx, -vy) + (kit.hash(M, nb, 11 + seed * 31) - 0.5) * 0.22;
        const down = vy > 0;
        let a = down ? Math.PI - Math.abs(ang) : Math.abs(ang);   // angle from vertical, 0..pi/2-ish
        a = Math.min(a, 1.05);
        if (t > CATCH_FROM - 4 && down) a *= 0.8;
        const s = Math.sign(vx) || 1;
        vx = s * SPD * Math.sin(a); vy = (down ? 1 : -1) * SPD * Math.cos(a);
      }
      // paddle
      if (vy > 0 && y + R >= PY && y + R - vy * DT < PY + 0.5 && Math.abs(x - p) <= PHW + R) {
        if (t >= CATCH_FROM) { caught = t; xc = p; off = x - p; y = PY - R; continue; }
        const o = kit.clamp((x - p) / PHW, -1, 1), ang = o * 1.05;
        vx = SPD * Math.sin(ang); vy = -SPD * Math.cos(ang);
        pads.push(t); np++;
        aim = (kit.hash(M, np, 3 + seed * 31) - 0.5) * 1.5;
      }
      if (y > PY + 3 && !missed) missed = t;
    // molecules: the ball knocks one out and glances off it
    for (const e of enemies) {
      if (t < e.ts || t >= e.tEnd || (kill.get(e) ?? 1e9) <= t) continue;
      const [ex, ey] = enemyAt(e, t), dx = x - ex, dy = y - ey, d = Math.hypot(dx, dy);
      if (d < 4.2) {
        kill.set(e, t);
        const nx = dx / d, ny = dy / d, dot = vx * nx + vy * ny;
        if (dot < 0) { vx -= 2 * dot * nx; vy -= 2 * dot * ny; }
        let a = Math.atan2(vx, -vy), down = vy > 0, aa = down ? Math.PI - Math.abs(a) : Math.abs(a);
        aa = Math.min(aa, 1.05); const sg = Math.sign(vx) || 1;
        vx = sg * SPD * Math.sin(aa); vy = (down ? 1 : -1) * SPD * Math.cos(aa);
      }
    }
      // the frog steers: where will the ball come down?
      let tgt;
      if (vy > 0) {
        const tt = (PY - R - y) / vy;
        let xl = x + vx * tt;
        const lo = WALL + R, hi = W - WALL - R, span = hi - lo;
        xl = ((xl - lo) % (2 * span) + 2 * span) % (2 * span);
        xl = lo + (xl > span ? 2 * span - xl : xl);
        tgt = xl - (t >= CATCH_FROM ? 0 : aim * PHW * 0.8);
      } else tgt = 0.5 * x + 0.5 * HOME;
      tgt = kit.clamp(tgt, WALL + PHW, W - WALL - PHW);
      pv += (150 * (tgt - p) - 22 * pv) * DT;
      pv = kit.clamp(pv, -180, 180);
      p = kit.clamp(p + pv * DT, WALL + PHW, W - WALL - PHW);
    }
    let gap = 0, prev = T0; for (const t of pads) { gap = Math.max(gap, t - prev); prev = t; }
    return { bx, by, px, n, hits, pads, kill, caught: caught < 0 ? 60 : caught, xc, off, missed, gap: Math.max(gap, (caught < 0 ? 60 : caught) - prev) };
  };
  let rally;
  for (let seed = 0; seed < 10; seed++) {
    yield;
    const r = play(seed);
    if (!rally || (r.caught < 58.8 && !r.missed && (r.gap < rally.gap || rally.caught >= 58.8))) rally = r;
    if (rally.caught < 58.8 && rally.gap < 9 && !rally.missed) break;
  }
  const res = { M, now, old, hour, bricks, events, paths, smashT, layT, T0, enemies, ...rally };
  // capsules: every few knocks on the gold and glass shakes one loose; it falls,
  // and the frog has it if the paddle is under it when it gets there
  res.capsules = [];
  let last = -9;
  rally.hits.forEach(([t, bi], k) => {
    if (kit.hash(M, k, 61) > 0.16 || t - last < 5 || t > CATCH_FROM - 8) return;
    last = t;
    const b = bricks[bi], ta = t + (PY - 3 - b.y) / 26;
    const i = Math.min(rally.n - 1, Math.max(0, Math.round((ta - T0) / DT)));
    const got = ta < rally.caught && Math.abs(rally.px[i] - b.cx) < PHW + 2;
    res.capsules.push({ t, x: b.cx, y: b.y + 1, ta, got, kind: Math.floor(kit.hash(M, k, 67) * 5) });
  });
  caches.set(M, res);
  return res;
}
