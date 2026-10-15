// Burn — the time printed on paper, and set alight.
//
// The glass shows a sheet of paper (a grey of its own: a blue-noise-like
// scatter whose density follows a streaky fibre noise) printed in black
// with the time in a Didone of its own: hairlines and stems, ball
// terminals, bracketed serifs.
//
// The minute: on a stroke of the numeral that is about to change a brown
// spot spreads and a thread of smoke rises (anticipation, from about -3 s);
// the spot glows and catches. A burn front runs out over a window round the
// numeral, faster upwards, ragged and fingering (fractal noise in the time
// each pixel catches): ahead of it the paper browns, the front itself is a
// bright line whose width flickers, little flames stand on it where it
// faces unburnt paper, sparks fly off it, and behind it the char glows,
// cools and is left black with embers creeping in it; the old numeral burns
// with the paper and the front dies at the window's rim. From :00 the char
// crumbles in the order it burnt, flakes of ash tumbling up, and the next
// sheet shows through, printed with the new numeral (settle). The rim stays:
// through the hour the page collects charred windows (ones place from :01,
// tens from :10), and each later burn in a slot goes to the same rim.
//
// The hour: from -3.2 s the whole page goes up from the bottom edge. The
// heat browns the paper ahead; flame tongues stand on the climbing front
// (teardrops whose height breathes, with a wave running up them so they
// sway and lick, shedding blobs of flame, between smaller noise flames);
// embers swirl up; behind the front the char crumbles to nothing. By :00
// the page is gone; at :00.25 a fresh sheet drops in from above, lands with
// a small bounce, printed with the new hour and :00.
//
// Never a wrong time: an old numeral is only ever burning away, and the
// sheet beneath shows only from :00.05 on. Everything is read off maps of
// when each pixel catches and falls (cached per turn) and closed-form
// particle paths, from the seconds to the nearest turn.
//
// Burn-in: the page walks kit.orbit, its texture belongs to the sheet (so it
// moves with it) and is new every hour, each window's every minute;
// 23:00-07:00 the panel dims via ctx.night.

import { clockFields, previousMinute, orbit, dither } from '../js/kit.js';

const W = 128, H = 64;
const DW = 26, DH = 42, DTOP = 12;          // a numeral's box, and its top on the page
const SLOT_U = [7, 34, 69, 96];             // numeral boxes, in page coordinates
const PAGE = [3, 3, 125, 61];               // the sheet [u0, v0, u1, v1), page coordinates

/** A good integer hash, as a float in [0, 1). */
function hash(x, y, s) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const clamp01 = (u) => (u < 0 ? 0 : u > 1 ? 1 : u);
const smooth = (u) => { u = clamp01(u); return u * u * (3 - 2 * u); };
const lerp = (a, b, u) => a + (b - a) * u;
/** Smooth 2-D value noise in [0, 1). */
function vn2(x, y, s) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  return lerp(lerp(hash(ix, iy, s), hash(ix + 1, iy, s), ux), lerp(hash(ix, iy + 1, s), hash(ix + 1, iy + 1, s), ux), uy);
}
const fbm = (x, y, s) => 0.55 * vn2(x, y, s) + 0.3 * vn2(2.1 * x + 5.3, 2.1 * y + 3.1, s + 1) + 0.15 * vn2(4.3 * x + 1.7, 4.3 * y + 7.9, s + 2);

// ------------------------------------------------------------ the type
//
// A Didone of its own, printed in black on the sheet: hairline-and-stem
// contrast with vertical stress, ball terminals, flat bracketed serifs.
// Shapes in a DW x DH box; clock angles in degrees (0 up, clockwise).

const clockDeg = (u, v, cx, cy) => (Math.atan2(u - cx, -(v - cy)) * 180) / Math.PI;
/** A bowl: outer ellipse minus an inner one (offset for stress), from a0 to a1. */
const bowl = (cx, cy, rxo, ryo, cxi, rxi, ryi, a0 = -180, a1 = 180) => (u, v) => {
  if (((u - cx) / rxo) ** 2 + ((v - cy) / ryo) ** 2 > 1) return false;
  if (((u - cxi) / rxi) ** 2 + ((v - cy) / ryi) ** 2 <= 1) return false;
  let a = clockDeg(u, v, cx, cy);
  while (a < a0) a += 360;
  while (a >= a0 + 360) a -= 360;
  return a <= a1;
};
const rect = (x0, y0, x1, y1) => (u, v) => u >= x0 && u <= x1 && v >= y0 && v <= y1;
const disc = (cx, cy, r) => (u, v) => (u - cx) ** 2 + (v - cy) ** 2 <= r * r;
const poly = (P) => (u, v) => {
  let inside = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++)
    if ((P[i][1] > v) !== (P[j][1] > v) && u < ((P[j][0] - P[i][0]) * (v - P[i][1])) / (P[j][1] - P[i][1]) + P[i][0]) inside = !inside;
  return inside;
};
const any = (...fs) => (u, v) => fs.some((f) => f(u, v));

const SIX = any(
  bowl(13, 29.5, 11.5, 11.5, 14.2, 6.3, 8.4),
  bowl(16, 26, 14, 23, 18, 9, 21.5, -100, -12),
  disc(20, 5.6, 3.6));
const SHAPES = {
  0: bowl(13, 21, 12.5, 20.5, 13, 7, 18),
  1: any(rect(10, 2.5, 16, 40), rect(5, 39.5, 21, 42), poly([[10, 2.5], [16, 1], [16, 4], [4, 10.5], [3.5, 8.5]]),
    poly([[7.5, 39.6], [10, 35.5], [10, 39.6]]), poly([[16, 35.5], [18.5, 39.6], [16, 39.6]])),
  2: any(bowl(13, 12.5, 11, 10.5, 12, 6, 7.5, -75, 135), disc(5.2, 11.2, 3.6),
    poly([[17.5, 19], [23.2, 20.5], [7.5, 39.5], [2, 39.5]]), rect(2, 38.6, 24, 42), rect(22, 33.5, 24.5, 42)),
  3: any(bowl(12.5, 11.5, 10, 9.5, 11.5, 5, 6.5, -65, 175), bowl(12.5, 30, 11.5, 11.5, 11, 6.2, 8.4, -10, 240),
    disc(4.8, 8.6, 3.5), disc(4.5, 33.5, 3.8)),
  4: any(rect(15.5, 2, 21.5, 42), poly([[15.5, 2], [19, 2], [4, 30], [1, 30]]), rect(1, 28.5, 25.5, 31), rect(11, 39.5, 25.5, 42)),
  5: any(rect(6.5, 2, 23, 5.2), rect(21, 0.5, 23.5, 7.5), rect(5.5, 2, 8, 20),
    bowl(12, 28.5, 11.5, 12.5, 10.5, 6.2, 9.2, -45, 235), disc(4.5, 34, 3.8)),
  6: SIX,
  7: any(rect(2.5, 2, 24, 5), rect(2, 1, 4.5, 9.5), poly([[19.5, 4.5], [24, 3.5], [13.5, 42], [8.5, 42]])),
  8: any(bowl(13, 11.5, 10, 9.5, 13, 5.2, 6.5), bowl(13, 30.5, 12, 11.5, 13, 6.6, 8.5)),
  9: (u, v) => SIX(DW - u, DH - v),
};
/** Each numeral as a bitmap (4x4 supersampled, half coverage), and its ink pixels. */
const INK = {}, INK_PX = {};
for (const [d, f] of Object.entries(SHAPES)) {
  const m = new Uint8Array(DW * DH), list = [];
  for (let y = 0; y < DH; y++)
    for (let x = 0; x < DW; x++) {
      let n = 0;
      for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) if (f(x + (i + 0.5) / 4, y + (j + 0.5) / 4)) n++;
      if (n >= 8) { m[y * DW + x] = 1; list.push(y * DW + x); }
    }
  INK[d] = m; INK_PX[d] = list;
}
/** Is page pixel (u, v) inked, for the numeral `d` printed in slot k? */
function inkAt(d, k, u, v) {
  const x = u - SLOT_U[k], y = v - DTOP;
  return x >= 0 && y >= 0 && x < DW && y < DH && INK[d][y * DW + x] === 1;
}
/** The colon: two printed lozenges. */
const colonAt = (u, v) => (u - 64.5) ** 2 + (v - 25.5) ** 2 <= 9 || (u - 64.5) ** 2 + (v - 42.5) ** 2 <= 9;
const slotOf = (u) => (u < 33.5 ? 0 : u < 66 ? 1 : u < 95.5 ? 2 : 3);

// ------------------------------------------------------------ paper
//
// The sheet is a grey of its own: an even, blue-noise-like scatter (the
// interleaved gradient pattern) whose density follows a streaky fibre
// noise, so it reads as paper rather than a halftone. The texture belongs
// to the sheet (page coordinates), so it travels with it, and every sheet
// has its own.

const PAPER_D = 0.42;
const TEX = new Map();
function paper(seed) {
  let t = TEX.get(seed);
  if (t) return t;
  if (TEX.size > 12) TEX.clear();
  t = new Uint8Array(W * H);
  const sx = Math.floor(hash(seed, 1, 3) * 64), sy = Math.floor(hash(seed, 2, 3) * 64);
  for (let v = 0; v < H; v++)
    for (let u = 0; u < W; u++) {
      const fib = 0.6 * vn2(u / 9, v / 1.7, seed) + 0.4 * vn2(u / 3, v / 3, seed + 7);
      const d = PAPER_D + 0.22 * (fib - 0.5);
      const ign = (52.9829189 * ((0.06711056 * (u + sx) + 0.00583715 * (v + sy)) % 1)) % 1;
      t[v * W + u] = ign * 0.8 + hash(u, v, seed) * 0.2 < d ? 1 : 0;
    }
  TEX.set(seed, t);
  return t;
}

/** The sheet's outline, deckled a little: 0 off the sheet, 1 on it, 2 its edge. */
const SHEETS = new Map();
function sheet(seed) {
  let m = SHEETS.get(seed);
  if (m) return m;
  if (SHEETS.size > 6) SHEETS.clear();
  m = new Uint8Array(W * H);
  const [u0, v0, u1, v1] = PAGE;
  const e = (a, s) => Math.floor(1.7 * vn2(a / 5, 0.5, seed + s) ** 2);
  const inside = (u, v) => u >= u0 + e(v, 1) && u < u1 - e(v, 2) && v >= v0 + e(u, 3) && v < v1 - e(u, 4);
  for (let v = 0; v < H; v++)
    for (let u = 0; u < W; u++)
      if (inside(u, v)) m[v * W + u] = inside(u - 1, v) && inside(u + 1, v) && inside(u, v - 1) && inside(u, v + 1) ? 1 : 2;
  SHEETS.set(seed, m);
  return m;
}

// ------------------------------------------------------------ the page through the hour
//
// Each hour a fresh sheet is printed with the hour and ":00". When a minute
// numeral changes, a hole is burnt round it and the next sheet shows
// through, printed with the new numeral. So through the hour the page
// collects burnt windows with charred rims (the ones place from :01, the
// tens from :10), and what shows in a window is the sheet of the minute it
// was last burnt. The window outline is the hour's: every burn in a slot
// goes to the same rim.

const WIN_R = [14.3, 24.5];
const WINS = new Map();
/** id: 0, or slot+1 of the window a pixel is in; band: 1 the rim inside it, 2 the scorch outside. */
function windows(seed) {
  let w = WINS.get(seed);
  if (w) return w;
  if (WINS.size > 4) WINS.clear();
  w = { id: new Uint8Array(W * H), band: new Uint8Array(W * H), edge: new Float32Array(W * H).fill(-99) };
  for (let v = 0; v < H; v++)
    for (let u = 0; u < W; u++) {
      const idx = v * W + u, e = [-99, -99, -99, -99];
      for (const k of [2, 3]) {
        const du = u + 0.5 - (SLOT_U[k] + DW / 2), dv = v + 0.5 - (DTOP + DH / 2);
        const d = Math.hypot(du, dv), c = du / (d || 1), s = dv / (d || 1);
        const R = (1 / Math.hypot(c / WIN_R[0], s / WIN_R[1])) * (1 + 0.14 * fbm(1.6 * c + 3 * k, 1.6 * s, seed));
        e[k] = R - d;
      }
      let k = e[2] > 0 && e[3] > 0 ? (u < 95.5 ? 2 : 3) : e[2] > 0 ? 2 : e[3] > 0 ? 3 : 0;
      if (k) {
        let edge = e[k];
        if (e[2] > 0 && e[3] > 0) edge = Math.min(edge, Math.abs(u + 0.5 - 95.5));
        w.id[idx] = k + 1; w.edge[idx] = edge;
        if (edge < 1.5) w.band[idx] = 1;
      } else if (Math.max(e[2], e[3]) > -1.4) { w.band[idx] = 2; w.id[idx] = 0; w.edge[idx] = e[2] > e[3] ? -2 : -3; }
    }
  WINS.set(seed, w);
  return w;
}

const hourKey = (c) => c.minuteKey - c.m;
const pageSeed = (c) => hourKey(c) * 7 + 11;
const patchSeed = (k, c) => (k === 3 ? c.minuteKey : c.minuteKey - (c.m % 10)) * 13 + k;
const isOpen = (k, c) => (k === 3 ? c.m >= 1 : k === 2 ? c.m >= 10 : false);
const digitOf = (c, k) => `${c.hh}${c.mm}`[k];

/** What the page shows at page pixel (u, v) at the minute `c`, between burns: 1 lit. */
function contentAt(c, u, v, idx, win) {
  const wid = win.id[idx];
  if (wid && isOpen(wid - 1, c)) {
    if (win.band[idx] === 1) return 0;   // the charred rim
    return patchAt(c, wid - 1, u, v, idx);
  }
  if (win.band[idx] === 2 && isOpen(-win.edge[idx], c) && hash(u, v, 91) < 0.6) return 0;   // scorched round a rim
  return pageAt(c, u, v, idx);
}
/** The hour's sheet: printed hh:00. */
function pageAt(c, u, v, idx) {
  if (!paper(pageSeed(c))[idx] || colonAt(u, v)) return 0;
  const k = slotOf(u);
  return inkAt(k < 2 ? c.hh[k] : '0', k, u, v) ? 0 : 1;
}
/** The sheet showing through window k: printed with that minute's numeral. */
function patchAt(c, k, u, v, idx) {
  if (!paper(patchSeed(k, c))[idx] || colonAt(u, v)) return 0;   // every sheet has the colon
  return inkAt(digitOf(c, k), k, u, v) ? 0 : 1;
}

// ------------------------------------------------------------ fire
//
// A burn is a map of when each pixel of paper catches, TB: the distance
// from the ignition point (fire runs faster upwards) plus fractal noise, so
// the front is ragged and fingers. Seconds behind the front the char
// crumbles away (TC) and what was under it shows. A pixel's state is read
// off T - TB, so the front is exact at any instant:
//
//   paper, browning just ahead of the front (SCORCH s)
//   the front itself: solid light, its width flickering
//   glowing char behind it, cooling over half a second
//   black char with embers creeping in it
//   a bright crumbling edge, then the sheet below

const V_B = 17, SCORCH = 0.4, GLOW = 0.3;
const INF = 1e9;
const bayer = (u, v, level) => dither(u, v, level);

/** Is the pixel lit, for a pixel of a burn at time T? `rim` pixels char but never fall away. */
function burnState(tb, tc, u, v, T, oldLit, scorch = SCORCH) {
  if (T < tb) {
    const sc = (T - tb + scorch) / scorch;
    return sc > 0 && hash(u, v, 77) < smooth(sc) * 1.05 ? 0 : oldLit;
  }
  const ph = T - tb;
  const wf = 0.05 + 0.07 * vn2(u * 0.45, T * 9 + v * 0.3, 5);
  if (ph < wf) return 2;   // the front
  if (T < tc) {
    const glow = 1 - (ph - wf) / GLOW;
    if (glow > 0) return bayer(u, v, glow * glow * (0.35 + 0.65 * vn2(u * 0.7, v * 0.7 + T * 7, 9))) ? 1 : 0;
    const amount = 0.06 * (1 - smooth((ph - GLOW) / 3));
    return hash(u, v, Math.floor(T * 5 + hash(u, v, 3) * 5)) < amount ? 1 : 0;
  }
  return T < tc + 0.035 ? 1 : -1;   // -1: fallen away
}

/** The burn of window k at a minute turn: when each pixel catches and falls, and its sparks. */
function burnMap(win, k, turn, tign, d, seed) {
  // It catches on the paper right at the edge of a stroke (so the brown
  // spot shows), somewhere in the lower half where it has room to climb.
  const edge = [];
  for (let v = DTOP + 14; v < DTOP + DH - 2; v++)
    for (let u = SLOT_U[k]; u < SLOT_U[k] + DW; u++)
      if (!inkAt(d, k, u, v) && (inkAt(d, k, u - 2, v) || inkAt(d, k, u + 2, v) || inkAt(d, k, u, v - 2) || inkAt(d, k, u, v + 2))) edge.push([u, v]);
  const [au, av] = edge[Math.floor(hash(seed, 5, 1) * edge.length)];
  const iu = au + 0.5, iv = av + 0.5;
  const TB = new Float32Array(W * H).fill(INF), TC = new Float32Array(W * H).fill(INF);
  const cells = [];
  let span = 0;
  for (let idx = 0; idx < W * H; idx++) {
    if (win.id[idx] !== k + 1) continue;
    const u = idx % W, v = (idx / W) | 0, du = u + 0.5 - iu, dv = v + 0.5 - iv;
    const tb = tign + (Math.hypot(du, dv < 0 ? dv * 0.72 : dv * 1.3) + 7 * fbm(u / 6, v / 6, seed)) / V_B;
    TB[idx] = tb; span = Math.max(span, tb - tign);
    cells.push(idx);
  }
  for (const idx of cells) {
    const u = idx % W, v = (idx / W) | 0;
    if (win.band[idx] === 1) continue;   // the rim stays
    TC[idx] = Math.max(turn + 0.05 + 1.0 * (TB[idx] - tign) / span, TB[idx] + 0.5) + 0.25 * fbm(u / 4 + 9, v / 4, seed + 3);
  }
  const pick = (n, s) => Array.from({ length: n }, (_, i) => cells[Math.floor(hash(i, s, seed) * cells.length)]);
  return { TB, TC, iu, iv, tign, seed, sparks: pick(48, 1), flakes: pick(22, 2).filter((i) => TC[i] < INF) };
}
const MAPS = new Map();
function cachedMap(key, make) {
  let m = MAPS.get(key);
  if (!m) { if (MAPS.size > 6) MAPS.clear(); m = make(); MAPS.set(key, m); }
  return m;
}

// ------------------------------------------------------------ what flies off
//
// Sparks are thrown up off the front; flakes of char lift off as the burnt
// paper crumbles, tumbling (a dark sliver whose glowing edge flickers out).
// All closed-form in the seconds since the pixel they came from caught or
// fell. A bright point gets a dark halo so it shows on the grey paper.

function drawSparks(g, srcs, TB, seed, ox, oy, T) {
  for (let pass = 0; pass < 2; pass++)
    for (let i = 0; i < srcs.length; i++) {
      const idx = srcs[i], a = T - TB[idx] - 0.04 * hash(i, 1, seed);
      if (a < 0 || a > 0.35 + 0.55 * hash(i, 2, seed)) continue;
      const x = ox + (idx % W) + 0.5 + (hash(i, 3, seed) - 0.5) * 16 * a + 5 * Math.sin(13 * a + i) * a;
      const y = oy + ((idx / W) | 0) + 0.5 - (30 + 34 * hash(i, 4, seed)) * a + 24 * a * a;
      // A spark is a short streak along its flight (where it was 1/60 s ago).
      const vx = (hash(i, 3, seed) - 0.5) * 16 + 5 * Math.sin(13 * a + i) + 65 * Math.cos(13 * a + i) * a;
      const vy = -(30 + 34 * hash(i, 4, seed)) + 48 * a;
      const px = x - vx / 60, py = y - vy / 60;
      if (pass === 0) { g.pixel(x - 1, y, 0); g.pixel(x + 1, y, 0); g.pixel(x, y - 1, 0); g.pixel(x, y + 1, 0); g.pixel(px - 1, py, 0); g.pixel(px + 1, py, 0); }
      else { g.pixel(x, y, 1); g.pixel(px, py, 1); }
    }
}

function drawFlakes(g, srcs, TC, seed, ox, oy, T) {
  for (let i = 0; i < srcs.length; i++) {
    const idx = srcs[i], a = T - TC[idx], life = 1.3 + 1.1 * hash(i, 1, seed);
    if (a < 0 || a > life) continue;
    const x = ox + (idx % W) + 0.5 + (hash(i, 3, seed) - 0.5) * 12 * a + 3 * Math.sin(2.4 * a + 6 * hash(i, 4, seed)) * Math.min(1, 2 * a);
    const y = oy + ((idx / W) | 0) + 0.5 - (5 * a + 9 * a * a);
    // A flake of grey ash, tumbling: a short sliver that turns in the plane
    // and flips edge-on (its length breathes), with a dark rim so it shows
    // on paper. It shrinks to a mote before it is gone.
    const th = 6.28 * hash(i, 5, seed) + (hash(i, 6, seed) - 0.5) * 9 * a;
    const flip = Math.abs(Math.cos(a * (5 + 5 * hash(i, 7, seed)) + i));
    const len = (a > life * 0.7 ? 0.4 : 1.6) * (0.35 + 0.65 * flip), c = Math.cos(th) * len, s = Math.sin(th) * len;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) { g.pixel(x + c + dx, y + s + dy, 0); g.pixel(x - c + dx, y - s + dy, 0); }
    g.pixel(x + c, y + s, 1); g.pixel(x, y, 1); g.pixel(x - c, y - s, 1);
  }
}

/** Before it catches: a brown spot spreads, a thread of smoke rises, the spot glows. */
function drawSmoulder(g, bm, ox, oy, T) {
  const a = T - (bm.tign - 0.9);
  if (a < 0 || T > bm.tign + 1.4) return;
  const fade = 1 - smooth((T - bm.tign - 0.6) / 0.8);
  for (let q = 0; q < 14; q++) {
    const s = (a * 15 + q * 1.4) % 20, gen = Math.floor((a * 15 + q * 1.4) / 20);
    if (hash(q, gen, bm.seed) > 0.85 * fade * (1 - s / 24)) continue;
    g.pixel(ox + bm.iu + 1.8 * Math.sin(s * 0.42 - T * 2.6) * (s / 9), oy + bm.iv - 1.5 - s, 0);
  }
  if (T > bm.tign - 0.45 && T < bm.tign) {
    g.pixel(ox + bm.iu, oy + bm.iv, 1);
    if (hash(Math.floor(T * 16), 1, bm.seed) < 0.6) g.pixel(ox + bm.iu + 1, oy + bm.iv, 1);
  }
}

// ------------------------------------------------------------ the minute
//
// 2.7 s before :00 a brown spot spreads on a stroke of the numeral that is
// about to change and a thread of smoke rises from it; it glows, and at
// -1.8 s it catches. The front runs out over the window, fastest upwards,
// throwing sparks; the old numeral burns with the paper; the front dies at
// the rim. From :00 the char crumbles in the order it burnt, flakes lifting
// off, and the next sheet shows through with the new numeral. When both
// minute numerals change they catch 0.35 s apart and the fronts merge.

function drawMinute(g, from, to, tau, turn, T, ox, oy) {
  const win = windows(hourKey(to)), sh = sheet(hourKey(to));
  const changing = [2, 3].filter((k) => digitOf(from, k) !== digitOf(to, k));
  const BM = [null, null, null, null];
  if (tau > -3.6 && tau < 4)
    for (const k of changing)
      BM[k] = cachedMap(`${to.minuteKey}:${k}`, () => burnMap(win, k, turn,
        turn + (changing.length === 2 ? (k === 2 ? -2.6 : -2.2) : -2.4), digitOf(from, k), (to.minuteKey * 31 + k) | 0));
  const cur = tau < 0 ? from : to;
  const licks = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const u = x - ox, v = y - oy;
      if (u < 0 || v < 0 || u >= W || v >= H) continue;
      const idx = v * W + u, s = sh[idx];
      if (!s) continue;
      if (s === 2) { g.pixel(x, y); continue; }
      const wid = win.id[idx], bm = wid ? BM[wid - 1] : null;
      let lit;
      if (bm) {
        let old = contentAt(from, u, v, idx, win);
        const st = T - (bm.tign - 0.9);
        if (st > 0 && T < bm.tign) {
          const r = 3.6 * smooth(st / 0.9), d = Math.hypot(u + 0.5 - bm.iu, v + 0.5 - bm.iv);
          if (d < r && hash(u, v, 78) < 0.25 + 0.75 * (1 - d / r)) old = 0;
        }
        const r = burnState(bm.TB[idx], bm.TC[idx], u, v, T, old);
        lit = r === -1 ? patchAt(to, wid - 1, u, v, idx) : r;
        // Where the front faces unburnt paper above, little flames stand on it.
        if (r === 2 && v > 0 && T < bm.TB[idx - W] && licks.length < 400) licks.push(x, y, u);
      } else if (win.band[idx] === 2 && BM[-win.edge[idx]]) {
        lit = contentAt(T > BM[-win.edge[idx]].tign + 1.0 ? to : from, u, v, idx, win);
      } else lit = contentAt(cur, u, v, idx, win);
      if (lit) g.pixel(x, y);
    }
  for (let i = 0; i < licks.length; i += 3) {
    const [x, y, u] = [licks[i], licks[i + 1], licks[i + 2]];
    const hl = 4.5 * vn2(u * 0.55, T * 8, 21) ** 2;
    for (let h = 1; h <= hl; h++) g.pixel(x, y - h, 1);
  }
  for (const bm of BM) {
    if (!bm) continue;
    drawSmoulder(g, bm, ox, oy, T);
    drawSparks(g, bm.sparks, bm.TB, bm.seed, ox, oy, T);
    drawFlakes(g, bm.flakes, bm.TC, bm.seed, ox, oy, T);
  }
}

// ------------------------------------------------------------ the hour
//
// From 3.2 s before the hour the whole sheet goes up from the bottom edge:
// the front climbs the page with flames standing on it, tongues of fire
// (a height noise along the front, cut by noise rising through them) that
// lick, split and let go of blobs; embers swirl up; behind the front the
// char crumbles to nothing. By :00 the page is gone; at :00.25 a fresh
// sheet drops in from above, lands with a little bounce and lies there.

function hourMap(turn, seed) {
  const TB = new Float32Array(W * H), TC = new Float32Array(W * H);
  for (let v = 0; v < H; v++)
    for (let u = 0; u < W; u++) {
      const tb = turn - 3.2 + (61 - v) / 27 + 0.7 * fbm(u / 8, v / 8, seed);
      TB[v * W + u] = tb;
      TC[v * W + u] = tb + 0.45 + 0.45 * fbm(u / 5 + 3, v / 5, seed + 1);
    }
  return { TB, TC, seed };
}

function drawFlames(g, yf, ox, oy, T, tau, seed) {
  const env = smooth((tau + 3.3) / 0.5) * (1 - smooth((tau + 0.8) / 0.9));
  if (env <= 0) return;
  for (let u = 0; u < W; u++) {
    const base = yf[u];
    if (base < 0) continue;
    // Tall tongues where the height noise is high, short ones between; the
    // body is cut by noise rising faster than the flame, so tongues lick,
    // fork and shed blobs.
    const hf = env * (2 + 9 * fbm(u / 5.5, T * 1.3, seed) ** 1.6);
    for (let h = 0; h < hf + 6; h++) {
      const v = base - h;
      if (v + oy < 0) break;
      const n = fbm(u / 4, (v + 46 * T) / 5, seed + 5);
      const I = 1.15 * (1 - h / hf) - 1.1 * (0.6 - n);
      if (I > 0.45 || (I > 0.22 && bayer(u, v, (I - 0.22) / 0.23))) g.pixel(u + ox, v + oy);
    }
  }
  // The big tongues: each a teardrop standing on the front, its height
  // breathing, a wave running up it so it sways and licks, and now and then
  // a blob of flame pinching off its tip and rising away.
  for (let i = 0; i < 11; i++) {
    const xc = 4 + 11.5 * i + 3 * Math.sin(T * 1.1 + i * 1.9);
    const base = yf[Math.max(0, Math.min(W - 1, Math.round(xc)))];
    if (base < 0) continue;
    const ht = env * (9 + 15 * fbm(T * 1.9 + i * 3.7, i, seed + 9)), w0 = 3.6 + 1.4 * Math.sin(T * 3.1 + i);
    for (let h = 0; h < ht; h++) {
      const q = h / ht, c = xc + 3.2 * Math.sin(T * 6 - h * 0.33 + i) * q, w = w0 * (1 - q) ** 0.65;
      for (let u = Math.floor(c - w); u <= c + w; u++) {
        const I = 1 - Math.abs(u + 0.5 - c) / w;
        if (I > 0.35 || (I > 0 && bayer(u, base - h, I / 0.35))) g.pixel(u + ox, base - h + oy);
      }
    }
    const ph = (T * 1.6 + hash(i, 1, seed)) % 1, r = 1.8 * (1 - ph);
    if (r > 0.6) g.fillCircle(xc + ox + 2 * Math.sin(T * 4 + i), base - ht - 1 - ph * 12 + oy, r);
  }
}

function drawEmbers(g, turn, ox, oy, T, seed) {
  for (let pass = 0; pass < 2; pass++)
    for (let i = 0; i < 90; i++) {
      const tb = turn - 2.9 + 3.0 * hash(i, 1, seed), a = T - tb;
      if (a < 0 || a > 1.2 + 1.6 * hash(i, 2, seed)) continue;
      if (hash(i, Math.floor(T * 11), seed) < 0.12) continue;   // twinkle
      const v0 = Math.max(4, 61 - (tb - turn + 3.2) * 27);
      const x = ox + 4 + 120 * hash(i, 3, seed) + 7 * Math.sin(1.9 * a + 6.28 * hash(i, 4, seed)) * smooth(a / 0.6) + (hash(i, 5, seed) - 0.5) * 14 * a;
      const y = oy + v0 - (16 + 16 * hash(i, 6, seed)) * a - 3 * a * a;
      if (pass === 0) { g.pixel(x - 1, y, 0); g.pixel(x + 1, y, 0); g.pixel(x, y - 1, 0); g.pixel(x, y + 1, 0); }
      else g.pixel(x, y, 1);
    }
}

/** The fresh sheet's offset as it drops in: falls, lands, bounces. null before it appears. */
function dropOff(tau) {
  const t = tau - 0.25, D = 0.7;
  if (t < 0) return null;
  if (t < D) return Math.round(-66 * (1 - (t / D) ** 2));
  const b = t - D;
  return -Math.round(3.5 * Math.exp(-b * 5) * Math.abs(Math.sin(b * 9)));
}

function drawHour(g, from, to, tau, turn, T, ox, oy) {
  const seed = (to.minuteKey * 17) | 0;
  const hm = cachedMap(`H${to.minuteKey}`, () => hourMap(turn, seed));
  const winA = windows(hourKey(from)), shA = sheet(hourKey(from)), winB = windows(hourKey(to)), shB = sheet(hourKey(to));
  const off = dropOff(tau), yf = new Int16Array(W).fill(-1);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (off !== null) {
        const u = x - ox, v = y - oy - off;
        if (u >= 0 && v >= 0 && u < W && v < H && shB[v * W + u]) {
          const i2 = v * W + u;
          if (shB[i2] === 2 || contentAt(to, u, v, i2, winB)) g.pixel(x, y);
          continue;
        }
      }
      const u = x - ox, v = y - oy;
      if (u < 0 || v < 0 || u >= W || v >= H) continue;
      const idx = v * W + u, s = shA[idx];
      if (!s) continue;
      const tb = hm.TB[idx];
      if (T >= tb && yf[u] < 0) yf[u] = v;
      const old = s === 2 ? 1 : contentAt(from, u, v, idx, winA);
      // The heat browns the paper well ahead of the fire, so the flames
      // stand out against it.
      if (burnState(tb, hm.TC[idx], u, v, T, old, 0.6) > 0) g.pixel(x, y);
    }
  drawFlames(g, yf, ox, oy, T, tau, seed);
  drawEmbers(g, turn, ox, oy, T, seed);
}

// ------------------------------------------------------------ face


export default {
  name: 'Burn',
  blurb: 'The time printed on a sheet of paper, and set alight: a changing numeral smoulders, catches and burns out to the next sheet; on the hour the page goes up in flames and a fresh one drops in.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,

  frame(g, { fields: f, date, oled, night }) {
    const late = f.sec >= 50;
    const from = late ? f : previousMinute(date);
    const to = late ? clockFields(new Date(date.getTime() + 60000)) : f;
    // Everything burns on the clock of the nearest turn: tau s from it
    // (the maps are float32, so they hold times relative to the turn).
    const tau = late ? f.sec - 60 : f.sec;
    const [ox, oy] = orbit(date, 2, 3);
    if (to.m === 0 && tau > -3.6 && tau < 3) drawHour(g, from, to, tau, 0, tau, ox, oy);
    else drawMinute(g, from, to, tau, 0, tau, ox, oy);
    oled.contrast(0xcf + (0x18 - 0xcf) * night);
  },
};
