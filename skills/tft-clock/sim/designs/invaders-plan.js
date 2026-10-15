// Invaders: the formation's march, and each minute's script.
//
// Everything is closed form in (minute, second). The march is a step count
// that runs on across minutes (132 steps a minute: two a second, eight a
// second in a two-second frenzy), and each alien reads the count a little
// late, by its place in the formation, so every step ripples through the
// formation from the bottom row up, as the arcade updated one alien per
// frame. A minute's script (bombs, the base's shots, the saucer, the turn)
// is planned once per minute from the previous, current and next digits.
import { clockFields, rand, hash } from '../js/kit.js';
import { FONT, SPECIES, BABY, SHIELD } from './invaders-art.js';

export const W = 160, H = 80;
export const FX = 8, FY = 9, PX = 8, PY = 6;          // formation origin and cell pitch
export const SLOT_X = [0, 34, 78, 112], COLON_X = 69;
export const SPM = 132;                                // steps a minute
export const BASE_Y = 69, SHOT_V = 180, BOMB_V = 45;   // px, px/s
export const SHIELD_X = [15, 49, 93, 127], SHIELD_Y = 61;
export const SW = SHIELD.w, SH = SHIELD.h, SN = SW * SH;
const CAN_V = 40;                                      // the base's planned speed, px/s (eased peak 60 = 1 px/frame)
/** The turn's two sweeps of the base, ending at :59.6; wide spans start earlier (<= 90 px/s cruising). */
export function passes(xa, xb) {
  const d = Math.max(1.1, (xb - xa) / 90);
  return [[59.5 - 2 * d, 59.5 - d], [59.6 - d, 59.6]];
}

// ------------------------------------------------------------ the march

export function within(s, fz) {
  if (s < fz) return 2 * s;
  if (s < fz + 2) return 2 * fz + 8 * (s - fz);
  return 2 * s + 12;
}
/**
 * The absolute step index at minute mk, second s (s < 0 reads the previous
 * minute), read `lag` steps late: the step count runs on smoothly across minutes.
 */
export function stepAt(P, s, lag = 0) {
  const v = s < 0 ? (P.mk - 1) * SPM + within(s + 60, P.fzPrev) : P.mk * SPM + within(s, P.fz);
  return Math.floor(v - lag);
}
/** The march: a 12-step triangle, 2 px a step, -6..+6. */
export function marchOff(n) {
  const p = n % 12;
  return ((p <= 6 ? p : 12 - p) - 3) * 2;
}
/** The descent: one pixel on every third reversal, down 4; back up to the top before the turn. */
export function dropOf(n, mk) {
  let nw = n - mk * SPM;
  if (nw < 0) nw += SPM;
  if (nw >= 116) return Math.max(0, 4 - (nw - 116));
  const w = Math.floor(nw / 6), d = Math.floor((w - 1) / 3);
  return d < 0 ? 0 : d > 4 ? 4 : d;
}
/**
 * The ripple, in steps: bottom row first, left to right, and the top row a
 * whole step behind, so a wave of stepping aliens is always crossing the
 * formation and no two neighbours are ever more than one step (2 px) apart.
 */
const delayOf = (row, xr) => (((6 - row) + xr / 150) / 7) * 0.94;

/** Where a cell is at second s: writes [x, y, frame] into out. */
export function cellAt(P, c, s, out) {
  const n = stepAt(P, s, c.dl);
  out[0] = FX + c.xr + marchOff(n);
  out[1] = FY + c.yr + dropOf(n, P.mk);
  out[2] = n & 1;
  return out;
}

// ------------------------------------------------------------ the formation of a minute

function digitsOf(mk) {
  const f = clockFields(new Date(mk * 60000));
  return { d: f.hh + f.mm, m: f.m };
}

function cellsFor(dig) {
  const cells = [];
  for (let i = 0; i < 4; i++)
    for (const g of FONT[+dig[i]]) {
      const xr = SLOT_X[i] + g.col * PX;
      cells.push({ slot: i, xr, yr: g.row * PY, row: g.row, dl: delayOf(g.row, xr), spr: SPECIES[g.row], bottom: g.bottom,
        ta: -1, tf: Infinity, th: Infinity, sx: 0 });
    }
  for (const row of [2, 4]) cells.push({ slot: -1, xr: COLON_X, yr: row * PY, row, dl: delayOf(row, COLON_X), spr: BABY, bottom: false, ta: -1, tf: Infinity, th: Infinity, sx: 0 });
  return cells;
}

/** The base's sweep span for the turn from digits a to digits b. */
export function sweepSpan(a, b) {
  let lo = 999, hi = -999;
  for (let i = 0; i < 4; i++) {
    if (a[i] === b[i]) continue;
    for (const g of FONT[+a[i]]) {
      const x = FX + SLOT_X[i] + g.col * PX + 3;
      if (x < lo) lo = x;
      if (x > hi) hi = x;
    }
  }
  return [Math.max(5, lo - 9), Math.min(155, hi + 9)];
}

/** A shuffled order 0..n-1 from a seed. */
function shuffle(n, seed) {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) { const j = hash(seed, i, 77) % (i + 1); const t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}

/**
 * A digit's aliens split checkerwise: [the smaller half, the larger half].
 * Either half alone is the numeral dotted along its strokes, so a digit
 * that loses (or gains) one half first still reads as itself.
 */
function halves(mine, seed) {
  const a = [], b = [];
  for (const c of mine) (((Math.floor((c.xr - SLOT_X[c.slot]) / PX) + c.row) & 1) ? a : b).push(c);
  if (a.length < b.length || (a.length === b.length && (seed & 1))) return [a, b];
  return [b, a];
}

// ------------------------------------------------------------ the base's path

const smooth = (u) => u * u * (3 - 2 * u);
/** A sweep: constant speed with eased ends (a quarter of the time each). */
function trap(u) {
  const a = 0.25, v = 1 / (1 - a);
  if (u < a) return (v * u * u) / (2 * a);
  if (u > 1 - a) return 1 - (v * (1 - u) * (1 - u)) / (2 * a);
  return v * (u - a / 2);
}
export function baseX(P, s) {
  const S = P.seg;
  if (s <= S[0].t0) return S[0].x0;
  for (let k = 0; k < S.length; k++) {
    const g = S[k];
    if (s < g.t0) return S[k - 1].x1;
    if (s < g.t1) {
      const u = (s - g.t0) / (g.t1 - g.t0);
      return g.x0 + (g.x1 - g.x0) * (g.trap ? trap(u) : smooth(u));
    }
  }
  return S[S.length - 1].x1;
}

// ------------------------------------------------------------ saucer paths
/** The saucer that brings the new aliens in, at tau seconds from the start of its minute. */
export function shipX(hour, dir, tau) {
  if (hour) { const x = -24 + 40 * (tau + 1.2); return dir > 0 ? x : 160 - 22 - x; }
  const x = -12 + 70 * (tau + 0.8);
  return dir > 0 ? x : 160 - 11 - x;
}
export const shipLife = (hour) => (hour ? [-1.2, 5.2] : [-0.8, 1.8]);
const ufoX = (u, t) => (u.dir > 0 ? -12 + 66 * (t - u.t0) : 161 - 66 * (t - u.t0));
export { ufoX };

// ------------------------------------------------------------ the minute's script

const PLANS = new Map();
export function planFor(mk) {
  let P = PLANS.get(mk);
  if (!P) {
    P = makePlan(mk);
    PLANS.set(mk, P);
    if (PLANS.size > 4) PLANS.delete(PLANS.keys().next().value);
  }
  return P;
}

function makePlan(mk) {
  const cur = digitsOf(mk), prv = digitsOf(mk - 1), nxt = digitsOf(mk + 1);
  const P = { mk, dig: cur.d, hour: cur.m === 0, nextHour: nxt.m === 0, fz: cur.m === 0 ? 4 : 30, fzPrev: prv.m === 0 ? 4 : 30,
    cells: cellsFor(cur.d), bombs: [], shots: [], ufos: [], hits: [], seg: [], ops: 0,
    dir: hash(mk, 5) & 1 ? 1 : -1, ship: null };
  const tmp = [0, 0, 0];
  let ops = 0;

  // arrivals: every new digit fills evenly, its aliens beamed down in a shuffled order
  const aEnd = P.hour ? 1.2 : 1.0;
  for (let i = 0; i < 4; i++) {
    if (cur.d[i] === prv.d[i]) continue;
    // the skeleton (every other alien along the strokes) arrives first, then the rest
    const [rest, skel] = halves(P.cells.filter((c) => c.slot === i), hash(mk, i, 1));
    const mid = 0.05 + (aEnd - 0.05) * 0.5;
    shuffle(skel.length, hash(mk, i, 3)).forEach((k, j) => { skel[k].ta = 0.05 + (mid - 0.05) * (j / skel.length); });
    shuffle(rest.length, hash(mk, i, 4)).forEach((k, j) => { rest[k].ta = mid + (aEnd - mid) * (j / rest.length); });
  }

  // the base's path: from where the last turn left it, through this minute's shots, into the next sweep
  const [xa0] = sweepSpan(prv.d, cur.d), [xa, xb] = sweepSpan(cur.d, nxt.d);
  let lastT = -0.4, lastX = xa0;
  const seg = P.seg;
  seg.push({ t0: -0.4, t1: -0.4, x0: xa0, x1: xa0 });
  const can = (t, x) => t - lastT >= 0.25 && Math.abs(x - lastX) <= CAN_V * (t - lastT) && x >= 5 && x <= 155;
  const goTo = (t, x) => { seg.push({ t0: lastT, t1: t, x0: lastX, x1: x }); lastT = t + 0.08; lastX = x; seg.push({ t0: t, t1: lastT, x0: x, x1: x }); };

  // the hour: the base shoots down the mothership that brought the new hour
  if (P.hour) {
    P.dir = xa0 < 80 ? -1 : 1;           // the mothership flies toward the base
    const ship = { dir: P.dir, th: Infinity };
    for (let tf = 1.8; tf < 4.2 && ship.th > 99; tf += 1 / 30) {
      const th = tf + (68 - 9) / SHOT_V, x = Math.round(shipX(true, P.dir, th) + 11);
      if (x > 16 && x < 144 && can(tf, x)) { goTo(tf, x); P.shots.push({ t0: tf, x, t1: th }); ship.th = th; }
    }
    P.ship = ship;
  } else P.ship = { dir: P.dir, th: Infinity };

  // the shields, simulated through the minute so every bomb knows where it lands
  const sh = SHIELD_X.map(() => Uint8Array.from(SHIELD.d));
  const ufoAt = [15, 45];
  let t = P.hour ? 7 : 4, k = 0;
  const bottoms = P.cells.filter((c) => c.bottom);
  while (t < 51.5) {
    if (ufoAt.length && t > ufoAt[0] - 0.4) {
      const t0 = ufoAt.shift(), u = { t0, dir: hash(mk, t0) & 1 ? 1 : -1, th: Infinity };
      for (let tf = t0 + 0.5; tf < t0 + 2.0; tf += 1 / 30) {
        const th = tf + (68 - 6) / SHOT_V, x = Math.round(ufoX(u, th) + 5);
        if (x > 8 && x < 152 && can(tf, x)) { goTo(tf, x); P.shots.push({ t0: tf, x, t1: th }); u.th = th; break; }
      }
      P.ufos.push(u);
      t = Math.max(t, t0 + 3.2);
      continue;
    }
    const start = hash(mk, k, 9) % bottoms.length, kind = hash(mk, k, 4) & 1;
    for (let j = 0; j < bottoms.length; j++) {
      const c = bottoms[(start + j) % bottoms.length];
      cellAt(P, c, t, tmp);
      const x = tmp[0] + 3, y = tmp[1] + 5;   // the bomb's top-left is x - 1
      ops += 20;
      let si = -1;
      for (let q = 0; q < 4; q++) if (x - 1 >= SHIELD_X[q] && x + 1 < SHIELD_X[q] + SW) si = q;
      if (si >= 0) {
        // the first solid row under the bomb
        const cx = x - SHIELD_X[si];
        let r = -1;
        for (let rr = 0; rr < SH && r < 0; rr++) for (let dx = -1; dx <= 1; dx++) if (sh[si][rr * SW + cx + dx]) { r = rr; break; }
        if (r < 0) continue;
        const t1 = t + (SHIELD_Y + r - (y + 5)) / BOMB_V;
        // the crater: the 3 x 3 under the impact and a ragged pixel or two
        const gone = [];
        for (let dy = 0; dy < 3; dy++) for (let dx = -1 - (dy === 0 ? 1 : 0); dx <= 1 + (dy === 1 ? 1 : 0); dx++) {
          const px = cx + dx, py = r + dy;
          if (px < 0 || px >= SW || py >= SH) continue;
          if ((dy === 2 || Math.abs(dx) === 2) && (hash(mk, k, px * 8 + py) & 1)) continue;
          const p = py * SW + px;
          if (sh[si][p]) { sh[si][p] = 0; gone.push(p); }
        }
        ops += 40;
        P.bombs.push({ t0: t, t1, x, y, kind, end: 1, ex: x, ey: SHIELD_Y + r });
        P.hits.push({ t: t1, si, gone });
        break;
      }
      const tf = t + 0.15;
      if (!can(tf, x)) continue;
      const tm = (68 - (y + 5) + BOMB_V * t + SHOT_V * tf) / (BOMB_V + SHOT_V);
      goTo(tf, x);
      P.shots.push({ t0: tf, x, t1: tm });
      P.bombs.push({ t0: t, t1: tm, x, y, kind, end: 2, ex: x, ey: Math.round(y + 5 + BOMB_V * (tm - t)) });
      break;
    }
    t += 2.0 + 1.4 * rand(mk, k, 3);
    k++;
  }
  P.shieldFinal = sh;

  // the turn: the base sweeps under the leaving digits twice and shoots half of each digit on each pass
  const PASS = passes(xa, xb);
  goTo(PASS[0][0] - 0.08, xa);
  seg.push({ t0: PASS[0][0], t1: PASS[0][1], x0: xa, x1: xb, trap: true });
  seg.push({ t0: PASS[1][0], t1: PASS[1][1], x0: xb, x1: xa, trap: true });
  for (let i = 0; i < 4; i++) {
    if (cur.d[i] === nxt.d[i]) continue;
    const [first, last] = halves(P.cells.filter((c) => c.slot === i), hash(mk, i, 2));
    [...first.map((c) => [c, 0]), ...last.map((c) => [c, 1])].forEach(([c, pass]) => {
      const [p0, p1] = PASS[pass];
      const travel = (68 - (FY + c.yr + 5)) / SHOT_V;
      let best = 1e9, bt = p0;
      for (let tt = p0; tt < p1; tt += 1 / 60) {
        cellAt(P, c, tt + travel, tmp);
        const d = Math.abs(baseX(P, tt) - (tmp[0] + 3));
        if (d < best) { best = d; bt = tt; }
        ops += 12;
      }
      c.tf = bt; c.th = bt + travel; c.sx = Math.round(baseX(P, bt));
    });
  }
  P.ops = ops;
  return P;
}
