// Hourglass: a 25 mm tile of sand you could hold in your palm.
//
// Inside are 58 grains and nothing else: 24 of gold, 34 of dusk-coloured
// sand (ember, rose, violet, indigo strata). The gold is always exactly two
// digits, because the font is drawn under conservation of mass: every digit
// is the same twelve grains (hourglass-font.js), so no sand ever appears or
// vanishes, it only moves.
//
// The time is told by turning the tile over. Sand resting on the floor shows
// the hour; turned over, the sand falls to the ceiling and shows the minutes,
// one row higher, with its two loose grains rolling underneath it. The tile
// turns every 12 s: the bed slumps towards one wall, the grains run along it
// in a stream, surface first, and pile on the new floor deepest first, gold
// landing where the new digits are. The flips alternate sides, as you rock an
// hourglass back and forth (this board has an IMU; on it, tilting would do
// this).
//
// At rest the tile is held in a hand: it sways a little, the two loose grains
// roll along the surface with the tilt, and facets of the grains catch the
// light as it moves.
//
// The minute: at :00, minutes showing, the tile is tapped. All the sand
// shivers and the gold of a changing digit walks through the bed to its new
// shape (vibration sorts sand), dusk grains filling the holes it leaves.
// The hour: the last flip of :59 shows the hour, and at :00 the tile is
// jolted like a prospector's pan, twice: the whole bed jumps, the gold of the
// changing digits is thrown in ballistic arcs and rains into the new hour,
// flaring as it flies, while the unchanged digit stays put and readable.
//
// Everything is closed form in the time since the last event; plans
// (which grain goes where, and when) are cached per pair of pictures.
import * as kit from '../js/kit.js';
import { cells } from './hourglass-font.js';

const W = 8, NC = 64;
const SLOT_X = [0, 5];                     // digit columns: 0-2 and 5-7, the 2-column channel between
const LOOSE_C = [2.2, 4.9];                // where the two loose grains sit at rest, untilted

const GOLD = kit.hex('#ffb040'), GOLD_DEEP = kit.hex('#ff8a1a'), GLINT = kit.hex('#fff0c0');
const STRATA = [kit.hex('#ff6034'), kit.hex('#e03a62'), kit.hex('#9a2aa6'), kit.hex('#4030c0')];
const DUSK = 0.085;                        // the bed's level (linear): about 8-10 / 255 at brightness 0.4

const D_FLIP = 2.8, D_SHAKE = 2.1, D_HOUR = 3.4;
const pad = (n) => String(n).padStart(2, '0');

// ---------------------------------------------------------------- pictures
const pics = new Map();
/** Cell types for a state: 0 air, 1 dusk, 2 gold. Hours rest on the floor (rows 1-7), minutes on the ceiling (0-6). */
function picture(txt, up) {
  const key = txt + (up ? 'u' : 'd');
  let p = pics.get(key);
  if (p) return p;
  const y0 = up ? 0 : 1;
  const type = new Int8Array(NC);
  for (let y = y0; y < y0 + 7; y++) for (let x = 0; x < W; x++) type[y * W + x] = 1;
  for (let j = 0; j < 2; j++) for (const [c, r] of cells(txt[j])) type[(y0 + r) * W + SLOT_X[j] + c] = 2;
  p = { key, txt, up, y0, type, airY: up ? 7 : 0 };
  pics.set(key, p);
  return p;
}

// ------------------------------------------------------------ the held tile
/** The hand's slow sway, about -1..1. */
const sway = (t) => 0.62 * Math.sin(kit.TAU * t / 8.3) + 0.38 * Math.sin(kit.TAU * t / 13.9 + 1.3);
/** x of loose grain k at time t: it rolls with the tilt, stopped by the walls and by its neighbour. */
function looseX(k, t) {
  const x1 = kit.clamp(LOOSE_C[1] + 2.9 * sway(t - 0.35), 1, 7);
  if (k === 1) return x1;
  return kit.clamp(LOOSE_C[0] + 2.9 * sway(t), 0, x1 - 1);
}

// ------------------------------------------------------------- the colours
const H1 = new Float32Array(NC), H2 = new Float32Array(NC);
for (let i = 0; i < NC; i++) { H1[i] = kit.hash(i, 7); H2[i] = kit.hash(i, 19); }
function strata(depth) {             // depth 0 (surface) .. 6 (deepest row of the bed)
  const f = kit.clamp(depth / 6) * 3, k = Math.min(2, Math.floor(f));
  return kit.mix(STRATA[k], STRATA[k + 1], f - k);
}
const DUSK_C = [], GOLD_C = [];
for (let d = 0; d < 8; d++) DUSK_C.push(strata(d));
for (let i = 0; i < NC; i++) GOLD_C.push(kit.mix(GOLD, GOLD_DEEP, H1[i] * 0.7));

/** Colour of a grain of class cls sitting at cell i of picture p (into c). */
function grainColour(c, cls, i, p, loose) {
  if (cls === 2) { const g = GOLD_C[i]; c[0] = g[0]; c[1] = g[1]; c[2] = g[2]; return; }
  if (loose) { const s = DUSK_C[0]; const k = 0.32; c[0] = s[0] * k; c[1] = s[1] * k; c[2] = s[2] * k; return; }
  const y = (i / W) | 0, s = DUSK_C[y - p.y0], k = DUSK * (0.7 + 0.6 * H2[i]);
  c[0] = s[0] * k; c[1] = s[1] * k; c[2] = s[2] * k;
}

// ------------------------------------------------------------ assignment
/** Min-cost perfect matching (Hungarian, n small): returns col for each row. */
function hungarian(cost, n) {
  const INF = 1e18, u = new Float64Array(n + 1), v = new Float64Array(n + 1), p = new Int32Array(n + 1), way = new Int32Array(n + 1);
  for (let i = 1; i <= n; i++) {
    p[0] = i; let j0 = 0;
    const minv = new Float64Array(n + 1).fill(INF), used = new Uint8Array(n + 1);
    do {
      used[j0] = 1; const i0 = p[j0]; let d = INF, j1 = 0;
      for (let j = 1; j <= n; j++) if (!used[j]) {
        const cur = cost[(i0 - 1) * n + j - 1] - u[i0] - v[j];
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
        if (minv[j] < d) { d = minv[j]; j1 = j; }
      }
      for (let j = 0; j <= n; j++) if (used[j]) { u[p[j]] += d; v[j] -= d; } else minv[j] -= d;
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
  }
  const ans = new Int32Array(n);
  for (let j = 1; j <= n; j++) ans[p[j] - 1] = j - 1;
  return ans;
}
const cx = (i) => i % W, cy = (i) => (i / W) | 0;

/** The grains of a picture: [{ cls, cell, loose }], loose grains as cell -1 with index k. */
function grains(p) {
  const out = [];
  for (let i = 0; i < NC; i++) if (p.type[i]) out.push({ cls: p.type[i], cell: i, k: -1, x: cx(i), y: cy(i) });
  for (let k = 0; k < 2; k++) out.push({ cls: 1, cell: -1, k, x: LOOSE_C[k], y: p.airY });
  return out;
}
const plans = new Map();
function remember(key, make) {
  let P = plans.get(key);
  if (!P) { P = make(); plans.set(key, P); if (plans.size > 64) plans.delete(plans.keys().next().value); }
  return P;
}
/** One moving grain: where from, where to, when. */
const mk = (g) => ({ cls: g.cls, sCell: g.cell, sK: g.k, dCell: g.cell, dK: g.k, ts: 0, te: 0, surf: 0, mover: false, p1: 0, p2: 0 });

/**
 * Turning over: A rests on one floor, B on the opposite one; the sand runs
 * along the wall on `side` (+1 right, -1 left). Grains nearest the new floor
 * leave first and the first to arrive take the deepest places, each class
 * (gold, dusk) in its own order, so gold lands on gold.
 */
function flipPlan(A, B, side) {
  return remember(`f${A.key}${B.key}${side}`, () => {
    const ga = grains(A), gb = grains(B), n = ga.length;
    const wall = (g) => (side > 0 ? 7 - g.x : g.x);
    const dKey = (g) => (B.up ? g.y : 7 - g.y) * 10 + wall(g);
    const aKey = (g) => (g.k >= 0 ? 100 : 0) + (B.up ? g.y : 7 - g.y) * 10 + wall(g);
    const dOrd = [...ga].sort((a, b) => dKey(a) - dKey(b)), aOrd = [...gb].sort((a, b) => aKey(a) - aKey(b));
    const dRank = new Map(dOrd.map((g, r) => [g, r])), aRank = new Map(aOrd.map((g, r) => [g, r]));
    const out = [];
    for (const cls of [1, 2]) {
      const src = dOrd.filter((g) => g.cls === cls), dst = aOrd.filter((g) => g.cls === cls);
      src.forEach((s, j) => {
        const d = dst[j], m = mk(s);
        m.dCell = d.cell; m.dK = d.k;
        m.ts = 0.3 + 1.2 * dRank.get(s) / (n - 1);
        m.te = Math.max(1.0 + 1.4 * aRank.get(d) / (n - 1), m.ts + 0.6);
        const depth = s.k >= 0 ? -1 : A.up ? A.y0 + 6 - s.y : s.y - A.y0;
        m.surf = 1 - (depth + 1) / 7;
        m.p1 = kit.hash(s.cell + 99, s.k + 5, 3); m.p2 = kit.hash(d.cell + 77, d.k + 9, 4);
        out.push(m);
      });
    }
    return out;
  });
}

/**
 * A digit changing in place (same floor): the gold of each changed digit
 * that is not in the new shape walks to the new shape's empty cells, matched
 * for the shortest total walk; the dusk grains there take its place.
 */
function sortPlan(A, B, kind) {
  return remember(`${kind}${A.key}${B.key}`, () => {
    const ga = grains(A), out = ga.map(mk), byCell = new Map();
    out.forEach((m, j) => { if (m.sCell >= 0) byCell.set(m.sCell, m); m.surf = m.sCell < 0 ? 1 : 1 - Math.abs(cy(m.sCell) - (A.up ? A.y0 + 6 : A.y0)) / 7; m.p1 = kit.hash(j, 11); m.p2 = kit.hash(j, 23); });
    const hour = kind === 'h';
    for (let j = 0; j < 2; j++) {
      if (A.txt[j] === B.txt[j]) continue;
      const from = [], to = [];
      for (let r = 0; r < 7; r++) for (let c = 0; c < 3; c++) {
        const i = (A.y0 + r) * W + SLOT_X[j] + c, a = A.type[i] === 2, b = B.type[i] === 2;
        if (a && !b) from.push(i); else if (b && !a) to.push(i);
      }
      const n = from.length, cost = new Float64Array(n * n);
      for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) cost[a * n + b] = (cx(from[a]) - cx(to[b])) ** 2 + (cy(from[a]) - cy(to[b])) ** 2;
      const match = hungarian(cost, n);
      for (let a = 0; a < n; a++) {
        const g = byCell.get(from[a]), d = byCell.get(to[match[a]]);
        g.dCell = to[match[a]]; d.dCell = from[a];
        const h = kit.hash(from[a], to[match[a]], 5);
        for (const m of [g, d]) {
          m.mover = true;
          m.ts = hour ? (h < 0.6 ? 0.28 + 0.25 * h : 1.3 + 0.2 * h) : 0.2 + 0.6 * h;   // the hour: thrown by the first or second jolt
          m.te = m.ts + (hour ? 0.85 + 0.3 * m.p2 : 0.75 + 0.3 * m.p2);
        }
      }
    }
    return out;
  });
}

// --------------------------------------------------------------- the day
const minutes = new Map();
/** The minute's events: the tile's state at :00 and what happens when. */
function minutePlan(M0) {
  let P = minutes.get(M0);
  if (P) return P;
  const d = new Date(M0 * 1000), pv = new Date((M0 - 60) * 1000);
  const hh = pad(d.getHours()), mm = pad(d.getMinutes()), ph = pad(pv.getHours()), pm = pad(pv.getMinutes());
  const Hh = picture(hh, false), Mm = picture(mm, true);
  const flip = (at, to) => ({ at, dur: D_FLIP, kind: 'f', to, side: to.up ? 1 : -1 });
  if (mm === '00') {
    P = { start: picture(ph, false), events: [{ at: 0, dur: D_HOUR, kind: 'h', to: Hh }, flip(12, Mm), flip(24, Hh), flip(36, Mm)] };
  } else {
    P = { start: picture(pm, true), events: [{ at: 0, dur: D_SHAKE, kind: 's', to: Mm }, flip(12, Hh), flip(24, Mm), flip(36, Hh), flip(48, Mm)] };
    if (mm === '59') P.events.push(flip(57, Hh));
  }
  minutes.set(M0, P);
  if (minutes.size > 8) minutes.delete(minutes.keys().next().value);
  return P;
}

// ------------------------------------------------------------- drawing
const acc = new Float32Array(3 * NC), wsum = new Float32Array(NC), col = [0, 0, 0], col2 = [0, 0, 0];
/** Light the facets the hand's tilt turns towards the eye: a smooth field, so moving grains glint too. */
function glint(x, y, sw) {
  const c = Math.cos(kit.TAU * (0.413 * x + 0.677 * y + 0.093 * x * y + 0.85 * sw));
  return c > 0 ? c ** 80 : 0;
}
/** Lay one grain at (x, y) by coverage: it glides between LEDs; overlapping grains share a cell. */
function grain(x, y, r, g, b) {
  x = kit.clamp(x, 0, 7); y = kit.clamp(y, 0, 7);
  const x0 = Math.min(6, Math.floor(x)), y0 = Math.min(6, Math.floor(y)), fx = x - x0, fy = y - y0;
  const i = y0 * W + x0;
  const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
  acc[3 * i] += r * w00; acc[3 * i + 1] += g * w00; acc[3 * i + 2] += b * w00; wsum[i] += w00;
  acc[3 * i + 3] += r * w10; acc[3 * i + 4] += g * w10; acc[3 * i + 5] += b * w10; wsum[i + 1] += w10;
  acc[3 * i + 24] += r * w01; acc[3 * i + 25] += g * w01; acc[3 * i + 26] += b * w01; wsum[i + 8] += w01;
  acc[3 * i + 27] += r * w11; acc[3 * i + 28] += g * w11; acc[3 * i + 29] += b * w11; wsum[i + 9] += w11;
}
/** A grain with its colour, glint and flare. */
function drawGrain(x, y, c, cls, sw, flare) {
  const gl = glint(x, y, sw) * (cls === 2 ? 0.45 + 0.8 * flare : 0.05);
  const k = cls === 2 ? 1 + 0.35 * flare : 1;
  grain(x, y, c[0] * k + GLINT[0] * gl, c[1] * k + GLINT[1] * gl, c[2] * k + GLINT[2] * gl);
}

function drawRest(p, now, sw) {
  for (let i = 0; i < NC; i++) {
    const t = p.type[i];
    if (!t) continue;
    grainColour(col, t, i, p, false);
    drawGrain(cx(i), cy(i), col, t, sw, 0);
  }
  for (let k = 0; k < 2; k++) { grainColour(col, 1, -1, p, true); drawGrain(looseX(k, now), p.airY, col, 1, sw, 0); }
}

function drawEvent(ev, A, tau, now, t0, sw) {
  const B = ev.to, flip = ev.kind === 'f', hour = ev.kind === 'h';
  const P = flip ? flipPlan(A, B, ev.side) : sortPlan(A, B, ev.kind);
  const D = ev.dur, wallX = ev.side > 0 ? 7.9 : -0.9;
  // the tap's shiver, and the hour's slosh (a damped rocking of the tile)
  const shiver = ev.kind === 's' ? 0.13 * Math.sin(Math.PI * tau / D) ** 2 : hour ? 0.06 * Math.sin(Math.PI * tau / D) ** 2 : 0;
  const rock = hour ? Math.sin(kit.TAU * tau / 1.15) * kit.smoothstep(0, 0.3, tau) * Math.exp(-tau / 1.25) * (1 - kit.smoothstep(D - 0.7, D, tau)) : 0;
  // the jolt that throws the gold: the whole bed jumps once, then twice smaller
  const jolt = hour ? [0.2, 1.25, 2.1].reduce((a, t0j, j) => a + (tau > t0j && tau < t0j + 0.32 ? Math.sin(Math.PI * (tau - t0j) / 0.32) * [1, 0.45, 0.2][j] : 0), 0) : 0;
  const flare = hour ? Math.sin(Math.PI * kit.clamp(tau / D)) : 0;
  for (const m of P) {
    const sx = m.sK >= 0 ? looseX(m.sK, t0) : cx(m.sCell), sy = m.sK >= 0 ? A.airY : cy(m.sCell);
    const dx = m.dK >= 0 ? looseX(m.dK, now) : cx(m.dCell), dy = m.dK >= 0 ? B.airY : cy(m.dCell);
    let x, y, u;
    if (flip) {
      const creepTo = ev.side * 0.45 * m.surf;
      if (tau < m.ts) { u = 0; x = sx + creepTo * kit.smoothstep(0, m.ts, tau); y = sy; }
      else {
        u = kit.clamp((tau - m.ts) / (m.te - m.ts));
        const s = u * u * (3 - 2 * u), q = 1 - s;
        const x0 = sx + creepTo, c1 = kit.lerp(x0, wallX, 0.9), c2 = kit.lerp(dx, wallX, 0.9);
        x = q * q * q * x0 + 3 * q * q * s * c1 + 3 * q * s * s * c2 + s * s * s * dx;
        y = q * q * q * sy + 3 * q * q * s * sy + 3 * q * s * s * dy + s * s * s * dy;
        if (tau > m.te) { const v = kit.clamp((tau - m.te) / 0.3); y += (B.up ? 1 : -1) * 0.18 * Math.sin(Math.PI * v) * (1 - v); }
      }
    } else {
      u = m.mover ? kit.clamp((tau - m.ts) / (m.te - m.ts)) : 0;
      if (hour && m.mover && m.cls === 2) {
        // the gold is tossed, as a prospector's pan throws it: a ballistic arc
        // (even in x, parabolic in y) over the bed, then a little settle
        const Hh = kit.clamp(Math.min(sy, dy) - 0.2, 0.7, 2.4);
        x = kit.lerp(sx, dx, u); y = kit.lerp(sy, dy, u) - Hh * 4 * u * (1 - u);
        if (tau > m.te) { const v = kit.clamp((tau - m.te) / 0.3); y -= 0.25 * Math.sin(Math.PI * v) * (1 - v); }
      } else {
        const s = u * u * (3 - 2 * u);
        x = kit.lerp(sx, dx, s); y = kit.lerp(sy, dy, s);
        if (m.mover && u > 0 && u < 1) {           // a wandering walk, not a straight line
          const L = Math.hypot(dx - sx, dy - sy) || 1, w = 0.32 * Math.sin(Math.PI * u) * Math.sin(kit.TAU * (1.5 * u + m.p1));
          x += (-(dy - sy) / L) * w; y += ((dx - sx) / L) * w;
        }
      }
      x += shiver * Math.sin(kit.TAU * (8.3 * tau + m.p1)); y += shiver * Math.sin(kit.TAU * (9.7 * tau + m.p2));
      if (hour) { x += rock * (m.sK >= 0 ? 2.2 : 0.5 * m.surf); y -= jolt * (0.4 + 0.3 * m.surf); }
    }
    // colour travels with the grain: from its old place's tone to its new one's
    if (m.cls === 2) {
      const a = GOLD_C[m.sCell], b = GOLD_C[m.dCell];
      col[0] = kit.lerp(a[0], b[0], u); col[1] = kit.lerp(a[1], b[1], u); col[2] = kit.lerp(a[2], b[2], u);
    } else {
      grainColour(col, 1, m.sCell, A, m.sK >= 0); grainColour(col2, 1, m.dCell, B, m.dK >= 0);
      col[0] = kit.lerp(col[0], col2[0], u); col[1] = kit.lerp(col[1], col2[1], u); col[2] = kit.lerp(col[2], col2[2], u);
    }
    drawGrain(x, y, col, m.cls, sw, flare);
  }
}

export default {
  name: 'Hourglass',
  blurb: 'a palm-sized tile of sand: 24 gold grains are always two digits; turned over every 12 s, the sand falls from the hour to the minutes',
  layouts: ['s3m'], look: { look: 'opal', gap: 0.8 }, fps: 60, brightness: 0.4, dither: true,
  frame(ctx) {
    const G = kit.grid(ctx), o = ctx.out, now = ctx.date.getTime() / 1000;
    const M0 = Math.floor(now / 60) * 60, s = now - M0, P = minutePlan(M0);
    const sw = sway(now);
    acc.fill(0); wsum.fill(0);
    let cur = P.start, done = false;
    for (const ev of P.events) {
      if (s < ev.at) break;
      if (s < ev.at + ev.dur) { drawEvent(ev, cur, s - ev.at, now, M0 + ev.at, sw); done = true; break; }
      cur = ev.to;
    }
    if (!done) drawRest(cur, now, sw);
    const dim = 1 - 0.7 * ctx.night;
    for (let p = 0; p < NC; p++) {
      const i = G.idx[p];
      if (i < 0) continue;
      const k = dim / Math.max(1, wsum[p]);
      o[3 * i] = acc[3 * p] * k; o[3 * i + 1] = acc[3 * p + 1] * k; o[3 * i + 2] = acc[3 * p + 2] * k;
    }
  },
};
