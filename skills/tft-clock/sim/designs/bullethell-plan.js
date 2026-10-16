// bullethell: the choreography. Every position here is a pure function of
// the time T (seconds into the UTC day, continuous across minutes) and s,
// the seconds into the current minute (s = T mod 60).
//
// A minute is one spell card:
//   0.3 - 3.3   wave A: the boss sprays the time's bullets, which curl in two
//               braids and stop dead on their places in the numerals
//   3.4 - 28.6  decoy danmaku (pattern A) streams past the frozen numerals
//   29.0        the frozen numerals launch at the player as a wall; the ship
//               ducks over or under it
//   29.6 - 32.6 wave B re-forms the same time, in a new colour
//   32.8 - 56.8 decoy danmaku (pattern B)
//   57.0        the card breaks: every bullet turns into an item and is
//               vacuumed into the ship; "GET SPELL CARD BONUS!!"
//   :00         the next card is declared with the next minute's name
import { digitSegments, noise, sin, cos, ease } from '../js/kit.js';

export const DIG = { y: 22, w: 20, h: 34, xs: [24, 49, 83, 108], colon: 76.5, size: 5 };
export const TIMES = { emitA: 0.3, releaseA: 29.0, emitB: 29.6, spread: 1.6, flight: 1.4, brk: 57.0 };
export const WINDOWS = [[3.4, 28.6], [32.8, 56.8]];
export const LIFE = 5.2;   // a decoy is off the glass by then
const XREF = 14;           // where the hole-cutting test looks for the ship
const HOLE = 6.5;          // bullets never pass closer than this to the ship's centre line

export const mod = (a, n) => ((a % n) + n) % n;

// ------------------------------------------------------------ actors' paths

export function bossPos(T) {
  return [144 + 2.5 * sin(T * 0.7), 40 + 11 * sin(T * 0.43) + 3 * sin(T * 1.3 + 1)];
}

function baseShip(T) {
  const n = noise(T * 0.27, 7) * 0.72 + noise(T * 0.83, 11) * 0.28;
  const y = 40 + 36 * (n * 2 - 1);
  return [13 + 4.5 * (noise(T * 0.31, 3) * 2 - 1), y < 10 ? 10 : y > 70 ? 70 : y];
}

/** The ship: a wandering line through the left of the field, ducking the wall at :29. */
export function shipPos(T) {
  const s = mod(T, 60);
  const p = baseShip(T);
  if (s > 28.3 && s < 31.6) {
    const side = baseShip(T - s + 28.3)[1] < 40 ? 11 : 70;
    const k = s < 29.05 ? ease.inOutQuad((s - 28.3) / 0.75) : s > 30.8 ? 1 - ease.inOutQuad((s - 30.8) / 0.8) : 1;
    p[1] += (side - p[1]) * k;
    p[0] += (8 - p[0]) * k * 0.6;
  }
  return p;
}

// ------------------------------------------------------------ the numerals

const memo = new Map();
/**
 * Bullet places for a time: the kit's vector digits' centre-lines walked at
 * one bullet every ~5 px, plus two colon bullets. `rank` is the order the
 * boss fires them in (by angle as seen from the boss: a top-to-bottom sweep).
 */
export function digitPoints(hh, mm) {
  const key = hh + mm;
  const hit = memo.get(key);
  if (hit) return hit;
  const str = hh + mm, pts = [];
  for (let i = 0; i < 4; i++) {
    const segs = digitSegments(str[i], DIG.xs[i], DIG.y, DIG.w, DIG.h, DIG.size);
    const lines = [];
    let cur = null;
    for (const [x0, y0, x1, y1] of segs) {
      const last = cur && cur[cur.length - 1];
      if (!last || Math.abs(last[0] - x0) + Math.abs(last[1] - y0) > 0.01) { cur = [[x0, y0]]; lines.push(cur); }
      cur.push([x1, y1]);
    }
    const mine = [];
    for (const line of lines) {
      const d = [0];
      for (let k = 1; k < line.length; k++) d.push(d[k - 1] + Math.hypot(line[k][0] - line[k - 1][0], line[k][1] - line[k - 1][1]));
      const L = d[d.length - 1];
      const a = line[0], z = line[line.length - 1];
      const closed = Math.abs(a[0] - z[0]) + Math.abs(a[1] - z[1]) < 0.6;
      const n = Math.max(1, Math.round(L / 5.2));
      for (let k = 0, j = 1; k <= n; k++) {
        if (closed && k === n) break;
        const at = (L * k) / n;
        while (j < d.length - 1 && d[j] < at) j++;
        const u = (at - d[j - 1]) / (d[j] - d[j - 1] || 1);
        const x = line[j - 1][0] + (line[j][0] - line[j - 1][0]) * u, y = line[j - 1][1] + (line[j][1] - line[j - 1][1]) * u;
        if (mine.every((q) => Math.hypot(q[0] - x, q[1] - y) > 3.6)) mine.push([x, y]);
      }
    }
    for (const [x, y] of mine) pts.push({ x, y, d: i });
  }
  pts.push({ x: DIG.colon, y: DIG.y + DIG.h * 0.3, d: 4 }, { x: DIG.colon, y: DIG.y + DIG.h * 0.72, d: 4 });
  pts.map((p, i) => [Math.atan2(p.y - 40, 144 - p.x), i]).sort((a, b) => a[0] - b[0])
    .forEach(([, i], r) => { pts[i].rank = r; });
  const out = { pts, n: pts.length };
  memo.set(key, out);
  return out;
}

/**
 * Where numeral bullet `p` is at minute-second `s`, for a wave first fired at
 * `emit0`: null before it is fired, else [x, y, u] with u = 1 once it is home.
 * It leaves the boss as it was when fired and curls in on a quadratic arc,
 * alternate bullets bending opposite ways, decelerating onto its place.
 */
export function flyIn(p, n, emit0, T, s) {
  const te = emit0 + (TIMES.spread * p.rank) / (n - 1);
  const u = (s - te) / TIMES.flight;
  if (u < 0) return null;
  if (u >= 1) return [p.x, p.y, 1];
  const [bx, by] = bossPos(T - (s - te));
  const dx = p.x - bx, dy = p.y - by, sg = p.rank % 2 ? 0.42 : -0.42;
  const cx = bx + dx * 0.5 - dy * sg, cy = by + dy * 0.5 + dx * sg;
  const q = ease.outCubic(u), a = (1 - q) * (1 - q), b = 2 * q * (1 - q), c = q * q;
  return [a * bx + b * cx + c * p.x, a * by + b * cy + c * p.y, u];
}

/** Wave A's numerals after :29: a wall launched left, peeling from its left edge. */
export function wallPos(p, s) {
  const tau = s - TIMES.releaseA - (p.x - DIG.xs[0]) * 0.0032;
  return [tau <= 0 ? p.x : p.x - 45 * tau * tau, p.y, 1];
}

// ------------------------------------------------------------ the danmaku

export const LEVELS = ['EASY', 'NORMAL', 'HARD', 'LUNATIC'];
export function level(h) {
  if (h >= 23 || h < 7) return 0;
  if (h < 12) return 1;
  if (h < 18) return 2;
  return 3;
}

// Shapes: 0 small diamond, 1 hollow ring, 2 small orb.
const TAU = Math.PI * 2;
export const PATTERNS = [
  { // "wave and particle": arms whose angle goes with the square of time; aliasing does the rest
    name: 'WAVE', dt: 0.07,
    emit(m, tl, te, bx, by, lvl, out) {
      const arms = 5 + lvl;
      for (let a = 0; a < arms; a++) out(TAU * (0.0017 * m * m + a / arms), 44, 0, a & 1);
    },
  },
  { // alternating flower rings, each turned on from the last
    name: 'RING', dt: 0.42,
    emit(m, tl, te, bx, by, lvl, out) {
      const n = 14 + 4 * lvl, odd = m & 1;
      for (let j = 0; j < n; j++) out(TAU * ((j + odd * 0.5) / n + m * 0.013), odd ? 26 : 34, odd ? 0 : 1, odd);
    },
  },
  { // fans aimed at where the ship is, over a slow two-armed spiral
    name: 'FAN', dt: 0.26,
    emit(m, tl, te, bx, by, lvl, out) {
      const [sx, sy] = shipPos(te);
      const aim = Math.atan2(sy - by, sx - bx), nf = 3 + 2 * lvl;
      for (let j = 0; j < nf; j++) out(aim + (j - (nf - 1) / 2) * 0.17, 50, 2, 0);
      for (let a = 0; a < 3; a++) out(m * 0.37 + (a * TAU) / 3, 30, 0, 1);
    },
  },
  { // snaking streams
    name: 'SNAKE', dt: 0.085,
    emit(m, tl, te, bx, by, lvl, out) {
      const n = [3, 3, 4, 5][lvl];
      for (let j = 0; j < n; j++)
        out(Math.PI + (j - (n - 1) / 2) * 0.5 + 0.5 * sin(TAU * 0.3 * tl + j * 1.9), 46, j & 1 ? 2 : 0, j & 1);
    },
  },
];

export const patternOf = (M, k) => mod(2 * M + k, 4);

/**
 * Every decoy bullet on the glass at T, as flat records [x, y, shape, colourIndex, pattern].
 * A bullet whose straight path would cross the ship's column within HOLE of
 * where the ship will be is never fired, which leaves the moving gap the
 * ship weaves through.
 */
export function decoys(T, s, lvl) {
  const M = Math.floor(T / 60), list = [];
  for (let k = 0; k < 2; k++) {
    if (k === 1 && s >= TIMES.brk) continue;
    const [w0, w1] = WINDOWS[k];
    const pi = patternOf(M, k), P = PATTERNS[pi];
    const lo = Math.max(w0, s - LIFE), hi = Math.min(w1, s);
    if (hi < lo) continue;
    const m0 = Math.ceil((lo - w0) / P.dt - 1e-9), m1 = Math.floor((hi - w0) / P.dt + 1e-9);
    for (let m = m0; m <= m1; m++) {
      const tl = w0 + m * P.dt, age = s - tl, te = T - age;
      const [bx, by] = bossPos(te);
      P.emit(m, tl, te, bx, by, lvl, (ang, v, shape, ci) => {
        const ca = cos(ang), sa = sin(ang);
        const x = bx + ca * v * age, y = by + sa * v * age;
        if (x < -4 || x > 164 || y < -4 || y > 84) return;
        if (ca < -0.05) {
          // sample the path across the ship's band of the strip
          const t0 = (XREF + 11 - bx) / (v * ca), t1 = (XREF - 11 - bx) / (v * ca), step = 3 / v;
          for (let tc = t0; tc <= t1; tc += step) {
            const xc = bx + ca * v * tc, yc = by + sa * v * tc;
            if (yc < -8 || yc > 88) break;
            const [qx, qy] = shipPos(te + tc);
            if ((xc - qx) * (xc - qx) + (yc - qy) * (yc - qy) < HOLE * HOLE) return;
          }
        }
        list.push([x, y, shape, ci, pi]);
      });
    }
  }
  return list;
}

// ------------------------------------------------------------ the card's name

const ONES = ['ZERO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN', 'ELEVEN', 'TWELVE',
  'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN', 'SEVENTEEN', 'EIGHTEEN', 'NINETEEN'];
const TENS = ['', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY'];
const num = (n) => (n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : ''));
const SIGNS = ['TIME SIGN', 'CLOCK SIGN', 'HOUR SIGN', 'DIAL SIGN'];

/** Spell card name: the time as a 24-hour reading, "TEN OH NINE", "TWENTY-TWO HUNDRED". */
export function cardName(h, m, M) {
  return { sign: SIGNS[mod(M, 4)], words: num(h) + ' ' + (m === 0 ? 'HUNDRED' : m < 10 ? 'OH ' + ONES[m] : num(m)) };
}
