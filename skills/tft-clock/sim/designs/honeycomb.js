// Honeycomb: the glass is a frame of comb held up to the light, and the time
// is the honey in it. The hours are stored in drone comb (big 8 px cells),
// the minutes in worker comb (6 px cells), the two joined by a seam of
// irregular cells as on a real frame. Each numeral is a run of honey-filled
// cells in a face drawn on the hex lattice itself (honeycomb-glyphs.js): one
// cell per stroke, strokes that zigzag the way comb does, counters at least
// two cells across.
//
// The time is never still. Each second the dancer on the dance floor (lower
// right, under the minutes) makes a waggle run, and its shake runs out
// through the comb as a hexagonal wave: on the crest the walls catch the
// light and the honey brightens, in the trough the walls sink into the dark
// and the honey draws in from the cell rims, so every numeral visibly
// quivers once a second, cell by cell, as the wave crosses it. Tending bees
// walk each numeral (two on each big hour digit, one on each minute), one
// cell a beat, pushing their heads into each cell. Followers turn to watch
// the dancer; workers crawl the margins and the gaps between the numerals;
// foragers fly across with flat cast shadows. Every 15 s the frame is tilted
// to the light and a glint sweeps through the honey; a few cells sparkle
// each second.
//
// Minute turn: a porter bee flies in to the top of each digit about to
// change and feeds while its cells empty, every cell drawing in from its rim
// at once (so the digit thins evenly to a line of dots, it never changes
// shape), gone by :59.8. After :00 the new digit's cells are rebuilt in
// fresh white wax (the whole outline first), the porter hops across to its
// top cell, and pale nectar is poured in there and flows along the strokes
// through the outline, ripening to gold while the white wax tans back.
// Hour: from :55 the colony lifts off the dance floor into a swirling cloud
// that keeps low under the minutes, then climbs over the hour digits being
// emptied; after :00 it comes down on the new hour, one bee to a cell, so
// for a moment the hour is written in bees inside its white wax outline;
// honey fills under each bee, and they fly home to their places.
//
// Palette, a flat screenprint of comb: dark old comb #2e1a0c, tan wax walls
// #7a4a1e, honey #ffaa18 (the brightest, most saturated thing on the glass:
// the time), lit honey #ffd860, fresh wax #f8eed2, pale nectar #e8d890,
// three dull pollens for texture away from the numerals, and the bees' own
// black, tawny and amber with clear wings. No shading: the cells are flat,
// the only effects are the wave, the glint sweep, the sparkle and the flat
// shadows of flying bees. Night: a deeper palette and the backlight at half.
//
// Cost: the comb is drawn from flash tables (cell id and depth per pixel, a
// wall list) through per-cell values computed each frame (~430 cells): a
// few integer ops a pixel. Bees are pre-rasterised sprites (32 headings).
// Everything is closed-form in time; no per-minute caches beyond small
// cell lists.
import { clockFields, hash, sin, cos, R, G, B } from '../js/kit.js';
import { CELL, DEPTH, MAXD, NC, N, W, H, WALLS, cells, slotCells, slotBox, tourFor, SPARK } from './honeycomb-comb.js';
import { GLYPHS } from './honeycomb-glyphs.js';
import { SPR, HALF, WING, INK, POLLEN, dirIndex, blendMask, stampBody, stampMask } from './honeycomb-bees.js';

const PI = Math.PI, TAU = PI * 2;
const c565 = (c) => ((R(c) >> 3) << 11) | ((G(c) >> 2) << 5) | (B(c) >> 3);
/** Integer lerp of two RGB565 colours, k in 0..32. */
function mix565(a, b, k) {
  const ar = a >> 11, ag = (a >> 5) & 63, ab = a & 31;
  return ((ar + ((((b >> 11) - ar) * k) >> 5)) << 11) | ((ag + (((((b >> 5) & 63) - ag) * k) >> 5)) << 5) | (ab + ((((b & 31) - ab) * k) >> 5));
}
const sm = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const cl = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x);

// ------------------------------------------------------------ palette
const DAY = {
  empty: 0x2e1a0c, wall: 0x7a4a1e, wallRip: 0xa8743a, white: 0xf8eed2,
  honey: 0xffaa18, lit: 0xffd860, nectar: 0xe8d890, spark: 0xffffff,
  pollen: [0x6e3a12, 0x6a5216, 0x5a2814], shadow: 0x120804,
};
const NIGHT = {
  empty: 0x120a05, wall: 0x46290f, wallRip: 0x6a4420, white: 0xc8bc9c,
  honey: 0xf09812, lit: 0xffc848, nectar: 0xc0b070, spark: 0xfff0c0,
  pollen: [0x381c08, 0x34280a, 0x2e1408], shadow: 0x060302,
};
function palette(P) {
  const o = {};
  for (const k of Object.keys(P)) o[k] = Array.isArray(P[k]) ? P[k].map(c565) : c565(P[k]);
  // wall levels, in the order a wall takes the highest of its cells':
  // 0-1 the ripple's trough (the wall sinks into the dark), 2 at rest,
  // 3-6 the crest (catching the light), 7-17 fresh white wax
  o.walls = new Uint16Array(18);
  for (let k = 0; k < 18; k++) o.walls[k] = k < 2 ? mix565(o.empty, o.wall, k * 14) : k <= 6 ? mix565(o.wall, o.wallRip, (k - 2) * 8) : mix565(o.wall, o.white, Math.round(((k - 6) / 11) * 32));
  return o;
}
const PALS = [];
for (let k = 0; k <= 8; k++) {
  const m = {};
  for (const key of Object.keys(DAY)) m[key] = Array.isArray(DAY[key]) ? DAY[key].map((c, i) => lerpRGB(c, NIGHT[key][i], k / 8)) : lerpRGB(DAY[key], NIGHT[key], k / 8);
  PALS.push(palette(m));
}
function lerpRGB(a, b, u) {
  const r = Math.round(R(a) + (R(b) - R(a)) * u), g = Math.round(G(a) + (G(b) - G(a)) * u), bl = Math.round(B(a) + (B(b) - B(a)) * u);
  return (r << 16) | (g << 8) | bl;
}

// ------------------------------------------------------------ static comb contents
// a scatter of pollen cells, never inside a digit's box
const BG = new Uint8Array(NC);
{
  const inBox = new Uint8Array(NC);
  for (let s = 0; s < 4; s++) for (const id of slotBox(s)) inBox[id] = 1;
  for (let c = 1; c < NC; c++) {
    const C = cells[c];
    if (inBox[c] || C.area < 10) continue;
    if (C.x > 96 && C.y > 54) continue;                 // the dance floor is bare comb
    const h = hash(c, 77) % 100;
    if (h < 16) BG[c] = 1 + (h % 3);
  }
}

// ------------------------------------------------------------ per-frame state (RAM)
const T = new Int16Array(NC), HC = new Uint16Array(NC), EC = new Uint16Array(NC), WV = new Uint8Array(NC);
const RIP = new Float32Array(NC), TRO = new Float32Array(NC), GLN = new Float32Array(NC);
const MAXB = 72;
const BX = new Float32Array(MAXB), BY = new Float32Array(MAXB), BA = new Float32Array(MAXB);
const BM = new Uint8Array(MAXB), BL = new Float32Array(MAXB);
let nb = 0;
function addBee(x, y, a, mode, lift) {
  if (nb >= MAXB) return;
  BX[nb] = x; BY[nb] = y; BA[nb] = a; BM[nb] = mode; BL[nb] = lift; nb++;
}

// ------------------------------------------------------------ choreography helpers
const DC = [127, 66];                // the dance floor
const RIP_V = 120, RIP_BAND = 12;

/** Hex distance: rings in the comb are hexagons. */
function hexd(dx, dy) {
  const ax = dx < 0 ? -dx : dx, ay = dy < 0 ? -dy : dy;
  const a = ax * 0.866 + ay * 0.5;
  return a > ay ? a : ay;
}

function angleLerp(a, b, u) {
  let d = b - a;
  while (d > PI) d -= TAU;
  while (d < -PI) d += TAU;
  return a + d * u;
}

/** A tending bee on digit d in slot s at absolute time ta (s). */
function walker(s, d, ta, out, second) {
  const tour = tourFor(s, d), L = tour.length;
  const k = Math.floor(ta), f = ta - k;
  const i0 = (((k + s * 7 + (second ? L >> 1 : 0)) % L) + L) % L;
  const a = cells[tour[i0]], b = cells[tour[(i0 + 1) % L]], z = cells[tour[(i0 + L - 1) % L]];
  const hPrev = Math.atan2(a.y - z.y, a.x - z.x), hNew = Math.atan2(b.y - a.y, b.x - a.x);
  const u = sm((f - 0.12) / 0.6);
  out[0] = a.x + (b.x - a.x) * u; out[1] = a.y + (b.y - a.y) * u;
  out[2] = a === b ? hPrev : angleLerp(hPrev, hNew, sm(f / 0.22));
  // working the cell it reached: a little push of the head
  if (f > 0.78) { const w = 0.7 * sin((f - 0.78) * TAU * 4.5); out[0] += cos(out[2]) * w; out[1] += sin(out[2]) * w; }
}

/** A point off the glass edge chosen by n. */
function offEdge(n, out) {
  const e = n % 4, r = (hash(n, 5) % 1000) / 1000;
  if (e === 0) { out[0] = -10; out[1] = 8 + r * 64; }
  else if (e === 1) { out[0] = 170; out[1] = 8 + r * 64; }
  else if (e === 2) { out[0] = 10 + r * 140; out[1] = -10; }
  else { out[0] = 10 + r * 140; out[1] = 90; }
}

/** A flight from (ax, ay) to (bx, by), u 0..1, arcing up; writes x, y, heading, lift. */
function flight(ax, ay, bx, by, u, bow, out) {
  const e = sm(u);
  const mx = (ax + bx) / 2 - (by - ay) * bow, my = (ay + by) / 2 + (bx - ax) * bow;
  const q = 1 - e;
  out[0] = q * q * ax + 2 * q * e * mx + e * e * bx;
  out[1] = q * q * ay + 2 * q * e * my + e * e * by;
  const tx = 2 * q * (mx - ax) + 2 * e * (bx - mx), ty = 2 * q * (my - ay) + 2 * e * (by - my);
  out[2] = Math.atan2(ty, tx);
  out[3] = sin(PI * cl(u));
}

const tmp = [0, 0, 0, 0], tmp2 = [0, 0, 0, 0];

// ------------------------------------------------------------ the face
export default {
  name: 'Honeycomb',
  blurb: 'The time is honey in a comb: hours in drone cells, minutes in worker cells, quivering to the waggle dance; bees empty and refill the cells at each turn, and the swarm writes the new hour in bees.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, ms = ctx.date.getTime();
    const ta = ms / 1000, secAbs = Math.floor(ta), frac = ta - secAbs;
    const tl = (ms % 600000) / 1000;
    const night = ctx.night;
    ctx.lcd.backlight(1 - 0.5 * night);
    const P = PALS[Math.round(night * 8)];
    const buf = g.buf;
    const prv = clockFields(new Date(ms - 60000)), nxt = clockFields(new Date(ms + 60000));
    const cur = f.hh + f.mm, was = prv.hh + prv.mm, will = nxt.hh + nxt.mm;
    const mStart = ta - s;                         // this minute began here (absolute s)
    const hourOut = nxt.h !== f.h, hourIn = prv.h !== f.h;
    const sw = { on: false, tau: 0, k: null };
    if (hourOut && s >= 55) { sw.on = true; sw.tau = s - 60; sw.k = f.minuteKey + 1; }
    else if (hourIn && s < 6) { sw.on = true; sw.tau = s; sw.k = f.minuteKey; }

    // ---- the comb at rest
    for (let c = 1; c < NC; c++) {
      T[c] = 999; WV[c] = 2;
      EC[c] = BG[c] ? P.pollen[BG[c] - 1] : P.empty;
    }

    // ---- the beat: each second the dancer's waggle shakes the comb, and a
    // hexagonal ripple runs out from the dance floor through every cell
    for (let c = 1; c < NC; c++) {
      const C = cells[c], d = hexd(C.x - DC[0], C.y - DC[1]);
      // a wave: the crest runs ahead (light), the trough behind (the comb dips)
      let p = 0, tr = 0;
      for (let k = 0; k < 2; k++) {
        const age = frac + k, q = (d - RIP_V * age) / RIP_BAND;
        if (q <= -1 || q >= 1) continue;
        const w = sin(PI * q) * (1 - age / 1.9);
        if (w > p) p = w;
        if (-w > tr) tr = -w;
      }
      RIP[c] = p; TRO[c] = tr;
      WV[c] = tr > 0.45 ? 0 : tr > 0.2 ? 1 : 2 + Math.round(p * 4);
    }

    // ---- the flourish: every 15 s the frame is tilted to the light and a
    // glint sweeps across the honey
    let sweep = -999, sdir = 1;
    const fl = s % 15;
    if (s >= 14 && fl < 1.6) { sweep = -40 + 260 * sm(fl / 1.6); sdir = (Math.floor(s / 15) & 1) ? -1 : 1; }

    // ---- the digits: honey in the cells
    for (let sl = 0; sl < 4; sl++) {
      const d = +cur[sl], dOut = +will[sl], dIn = +was[sl];
      const ids = slotCells(sl, d);
      const out = dOut !== d && s >= 57.5, inn = dIn !== d && s < 3.2;
      const swarm = sl < 2 && hourIn && inn;
      for (let k = 0; k < ids.length; k++) {
        const c = ids[k], md = MAXD[c];
        let th = 0, hc = P.honey;
        if (out) {
          // every cell of the old digit is drunk at once, from its rim in, so
          // the digit thins evenly to a line of dots and never changes shape
          const o = (hash(sl, d, k) % 120) / 1000;
          th = Math.round(md * sm((s - 58.6 - o) / 1.05));
          if (th >= md) continue;
        } else if (inn) {
          // the hour: honey under each swarm bee as it lands; a minute: honey
          // poured in where the porter sits, flowing along the strokes
          const L0 = swarm ? landAt(hourTargets(f.minuteKey).rank.get(c), hourTargets(f.minuteKey).ids.length) + 0.1 : 0.3 + flowAt(sl, d, k);
          th = Math.round(md * (1 - sm((s - L0) / (swarm ? 0.9 : 0.6))));
          hc = mix565(P.nectar, P.honey, Math.round(32 * sm((s - 0.6) / 2.0)));
          // fresh white wax: the whole outline is there first, then fills
          const wv = s < 0.3 ? s / 0.3 : s < 1.8 ? 1 : 1 - (s - 1.8) / 1.2;
          WV[c] = Math.max(WV[c], 6 + Math.round(11 * cl(wv)));
        }
        // the honey quivers with it: brighter on the crest, drawn in on the trough
        const p = RIP[c];
        th += Math.round(TRO[c] * (cells[c].lat ? 30 : 38));
        let lk = Math.round(p * 22);
        if (sweep > -999) {
          const q = (sdir > 0 ? cells[c].x : 160 - cells[c].x) + cells[c].y * 0.5 - sweep;
          const gl = 1 - Math.abs(q) / 14;
          if (gl > 0) { lk = Math.max(lk, Math.round(gl * 32)); GLN[c] = gl; } else GLN[c] = 0;
        } else GLN[c] = 0;
        T[c] = th;
        HC[c] = lk ? mix565(hc, P.lit, lk) : hc;
      }
    }

    // ---- the comb as pixels: honey where the cell is deep enough, else the empty cell
    for (let p = 0; p < N; p++) {
      const c = CELL[p];
      if (c) buf[p] = DEPTH[p] > T[c] ? HC[c] : EC[c];
    }
    const WP = P.walls;
    for (let q = 0; q < WALLS.length; q += 4) {
      let v = WV[WALLS[q + 1]];
      const b = WV[WALLS[q + 2]], c = WV[WALLS[q + 3]];
      if (b > v) v = b;
      if (c > v) v = c;
      buf[WALLS[q]] = WP[v];
    }
    g.cost.px += N; g.cost.box += N * 3 + WALLS.length * 2 + NC * 30;

    // glints: the sweep's sparkle, and a few honey cells catching the light each second
    for (let sl = 0; sl < 4; sl++) {
      const ids = slotCells(sl, +cur[sl]);
      for (let k = 0; k < ids.length; k++) {
        const c = ids[k];
        if (T[c] > 20) continue;
        const sp = SPARK[c];
        if (GLN[c] > 0.55 || (hash(c, secAbs) % 19 === 0 && frac > 0.25 && frac < 0.45)) {
          buf[sp] = P.spark; buf[sp + 1] = P.lit; buf[sp + W] = P.lit;
        }
      }
    }

    // ---- the bees
    nb = 0;
    const tg = sw.on ? hourTargets(sw.k) : null;
    // the residents: the dancer, her followers and the crawlers; at the hour
    // they lift off into the swarm and come back down after it
    for (let i = 0; i < NRES; i++) {
      if (sw.on && swarmBee(i, sw.tau, sw.k, tg, tmp)) { addBee(tmp[0], tmp[1], tmp[2], tmp[3] > 0.05 ? 1 : 0, tmp[3]); continue; }
      resident(i, ta, tmp);
      addBee(tmp[0], tmp[1], tmp[2], 0, 0);
    }
    if (sw.on) for (let i = NRES; i < NSWARM; i++) if (swarmBee(i, sw.tau, sw.k, tg, tmp)) addBee(tmp[0], tmp[1], tmp[2], tmp[3] > 0.05 ? 1 : 0, tmp[3]);

    // tenders: one bee works each digit, a cell a beat; at a turn it flies
    // from the old digit to the new one
    // (the big drone-comb hours have two, half a tour apart)
    for (let sl = 0; sl < 4; sl++) for (let w2 = 0; w2 < (sl < 2 ? 2 : 1); w2++) {
      const d = +cur[sl], dOut = +will[sl], dIn = +was[sl], sec = w2 === 1;
      if (dOut !== d && s >= 59.3) {
        walker(sl, d, mStart + 59.3, tmp, sec); walker(sl, dOut, mStart + 61, tmp2, sec);
        flight(tmp[0], tmp[1], tmp2[0], tmp2[1], (s - 59.3) / 1.7, 0.25, tmp);
        addBee(tmp[0], tmp[1], tmp[2], 1, tmp[3]);
      } else if (dIn !== d && s < 1) {
        walker(sl, dIn, mStart - 0.7, tmp, sec); walker(sl, d, mStart + 1, tmp2, sec);
        flight(tmp[0], tmp[1], tmp2[0], tmp2[1], (s + 0.7) / 1.7, 0.25, tmp);
        addBee(tmp[0], tmp[1], tmp[2], 1, tmp[3]);
      } else {
        walker(sl, d, ta, tmp, sec);
        addBee(tmp[0], tmp[1], tmp[2], 0, 0);
      }
    }

    // porters: two bees fly in to each digit about to change, feed on it
    // while it empties, hop to the new digit and sit on it while it fills
    for (let sl = 0; sl < 4; sl++) {
      let tau, dOld, dNew, K;
      if (+will[sl] !== +cur[sl] && s >= 56.8) { tau = s - 60; dOld = +cur[sl]; dNew = +will[sl]; K = f.minuteKey + 1; }
      else if (+was[sl] !== +cur[sl] && s < 3.8) { tau = s; dOld = +was[sl]; dNew = +cur[sl]; K = f.minuteKey; }
      else continue;
      if (sl < 2 && (tau < 0 ? hourOut : hourIn)) continue;     // the swarm does the hour
      const io = slotCells(sl, dOld), inew = slotCells(sl, dNew);
      for (let j = 0; j < (sl < 2 ? 2 : 1); j++) {          // one porter on a small worker-comb digit
        const t0 = -3.2 + 0.3 * j;
        // porter 0 feeds at the top of the old digit, away from its counters, and
        // lands at the top of the new one, where the pour starts
        const ca = cells[j ? io[io.length - 1] : io[0]], cb = cells[j ? inew[inew.length - 1] : inew[0]];
        if (tau < t0) continue;
        if (tau < t0 + 0.9) { offEdge(hash(K, sl, j + 3), tmp2); flight(tmp2[0], tmp2[1], ca.x, ca.y, (tau - t0) / 0.9, 0.2, tmp); }
        else if (tau < -0.55) { tmp[0] = ca.x; tmp[1] = ca.y; tmp[2] = -PI / 2 + 0.3 * sin(tau * 5 + j); tmp[3] = 0; }
        else if (tau < 0.35) flight(ca.x, ca.y, cb.x, cb.y, (tau + 0.55) / 0.9, 0.3, tmp);
        else if (tau < 2.6 + 0.3 * j) { tmp[0] = cb.x; tmp[1] = cb.y; tmp[2] = -PI / 2 + 0.3 * sin(tau * 4 + j); tmp[3] = 0; }
        else if (tau < 3.5 + 0.3 * j) { offEdge(hash(K, sl, j + 6), tmp2); flight(cb.x, cb.y, tmp2[0], tmp2[1], (tau - 2.6 - 0.3 * j) / 0.9, -0.2, tmp); }
        else continue;
        addBee(tmp[0], tmp[1], tmp[2], tmp[3] > 0.05 ? 1 : 0, tmp[3]);
      }
    }

    // foragers crossing the glass, by day
    if (night < 0.5 && !sw.on) for (let i = 0; i < 3; i++) {
      const Pd = FLY_P[i], c = Math.floor(ta / Pd), u = (ta - c * Pd) / 2.6;
      if (u >= 1) continue;
      const e = hash(c, i, 4);
      offEdge(e, tmp2); const ax = tmp2[0], ay = tmp2[1];
      offEdge(e + 1 + (e >> 8) % 3, tmp2);
      flight(ax, ay, tmp2[0], tmp2[1], u, ((e >> 4) % 5 - 2) * 0.12, tmp);
      addBee(tmp[0], tmp[1], tmp[2], 1, 0.6 + 0.4 * tmp[3]);
    }

    // ---- draw: shadows of the flyers, the walkers, then the flyers
    const fr = Math.floor(ta * 60) & 1;
    let nBody = 0, nBlend = 0;
    for (let i = 0; i < nb; i++) if (BL[i] > 0.05) {
      const sp = SPR[dirIndex(BA[i])], o = 1 + BL[i] * 4;
      nBlend += blendMask(buf, sp.shadow, Math.round(BX[i] + o) - HALF, Math.round(BY[i] + o) - HALF, P.shadow, 14);
    }
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < nb; i++) {
      const fly = BL[i] > 0.05;
      if ((pass === 1) !== fly) continue;
      const sp = SPR[dirIndex(BA[i])], x0 = Math.round(BX[i]) - HALF, y0 = Math.round(BY[i]) - HALF;
      nBody += stampBody(buf, sp, x0, y0);
      if (BM[i] === 0) nBlend += blendMask(buf, sp.fold, x0, y0, c565(WING), 13);
      else nBlend += blendMask(buf, fr ? sp.wa : sp.wb, x0, y0, c565(WING), 17);
    }
    g.cost.blit += nBody; g.cost.blend += nBlend; g.cost.calls += nb * 3;
  },
};

// ------------------------------------------------------------ the pour
// After a minute turn the new digit's honey starts at the top cell, where the
// porter sits, and flows outward along the strokes (breadth-first over the glyph's
// own cell adjacency), so the fill runs through the white outline like a
// liquid front. Returns cell k's start delay in seconds (0 .. 1.1).
const FLOW = new Map();
function flowAt(sl, d, k) {
  const ids = slotCells(sl, d), n = ids.length;
  const start = 0, key = sl * 10 + d;
  let t = FLOW.get(key);
  if (!t) {
    const pts = [];
    for (let row = 0; row < 9; row++) for (const col of GLYPHS[d][row]) pts.push([row, col]);
    const dist = new Int8Array(n).fill(-1), q = [start];
    dist[start] = 0;
    for (let h = 0; h < q.length; h++) {
      const [r, c] = pts[q[h]];
      for (let m = 0; m < n; m++) {
        if (dist[m] >= 0) continue;
        const [r2, c2] = pts[m];
        if ((r === r2 && Math.abs(c - c2) === 1) || (Math.abs(r - r2) === 1 && Math.abs(c - c2) === 0.5)) { dist[m] = dist[q[h]] + 1; q.push(m); }
      }
    }
    let mx = 1;
    for (let m = 0; m < n; m++) if (dist[m] > mx) mx = dist[m];
    t = new Float32Array(n);
    for (let m = 0; m < n; m++) t[m] = 1.1 * (dist[m] < 0 ? 1 : dist[m] / mx);
    FLOW.set(key, t);
    if (FLOW.size > 16) FLOW.delete(FLOW.keys().next().value);
  }
  return t[k];
}

// ------------------------------------------------------------ residents
// 0 the dancer, 1-4 her followers, 5-9 crawlers in the margins and the gaps
const NRES = 10, NSWARM = 30, FLY_P = [5.3, 7.9, 11.3];
const W5 = TAU / 600;
const CRAWL = [   // centre x, y, radius x, y, angular speed (x 2pi/600 s), phase
  [44, 76, 38, 1.2, 17, 1.3], [44, 3, 38, 1.2, -13, 4.0], [44, 40, 1.2, 26, 38, 0.5],
  [126, 28, 1.0, 18, 31, 2.2], [66, 76, 14, 1.2, 29, 0.9],
];
function resident(i, ta, out) {
  const tl = ta % 600, k = Math.floor(ta), frac = ta - k;
  const th = -PI / 2 + 0.7 * sin(tl * W5 * 3), ux = cos(th), uy = sin(th);
  if (i === 0 || i <= 4) {
    // the waggle dance: a straight waggling run each second, then a loop back, alternately left and right
    let x, y, a;
    if (frac < 0.45) {
      const u = frac / 0.45, w = sin(TAU * 13 * frac);
      x = DC[0] - ux * 5 + ux * 10 * u - uy * w * 0.9; y = DC[1] - uy * 5 + uy * 10 * u + ux * w * 0.9;
      a = th + 0.35 * sin(TAU * 13 * frac + PI / 2);
    } else {
      const sg = (k & 1) ? 1 : -1, u = (frac - 0.45) / 0.55, ph = th + sg * PI * sm(u);
      x = DC[0] + 5 * cos(ph); y = DC[1] + 5 * sin(ph);
      a = angleLerp(th, ph + sg * PI / 2, sm((frac - 0.45) / 0.1));
    }
    if (i === 0) { out[0] = x; out[1] = y; out[2] = a; return; }
    // followers stand round her, heads turned to her
    const ps = th + PI / 4 + (i - 1) * PI / 2 + 0.25 * sin(tl * 0.21 * i + i);
    const fx = DC[0] + 16 * cos(ps), fy = DC[1] + 10 * sin(ps);
    out[0] = fx; out[1] = fy; out[2] = Math.atan2(y - fy, x - fx);
    return;
  }
  const [cx, cy, rx, ry, w, ph] = CRAWL[i - 5];
  const a = tl * w * W5 + ph;
  out[0] = cx + rx * sin(a); out[1] = cy + ry * cos(a);
  out[2] = Math.atan2(-ry * sin(a) * w, rx * cos(a) * w);
}

// ------------------------------------------------------------ the hour swarm
// From 59:55 the colony lifts off and swirls over the hours; after :00 it
// comes down onto the new hour's cells, one bee to a cell, so for a moment
// the hour is written in bees; honey fills under each as it lands, then the
// bees walk off and settle back.
const TG_CACHE = new Map();
/** The new hour's cells for the turn into minute K, ranked for landing. */
function hourTargets(K) {
  if (K === null) return null;
  let t = TG_CACHE.get(K);
  if (t) return t;
  const a = clockFields(new Date((K - 1) * 60000)), b = clockFields(new Date(K * 60000));
  const ids = [];
  for (let sl = 0; sl < 2; sl++) if (a.hh[sl] !== b.hh[sl]) ids.push(...slotCells(sl, +b.hh[sl]));
  ids.sort((p, q) => (hash(p, K) % 9973) - (hash(q, K) % 9973));
  const rank = new Map();
  ids.forEach((c, r) => rank.set(c, r));
  // the cloud settles over the digits that change
  let cx = 0;
  for (const c of ids) cx += cells[c].x;
  t = { ids, rank, cx: ids.length ? cx / ids.length : 46 };
  TG_CACHE.set(K, t);
  if (TG_CACHE.size > 3) TG_CACHE.delete(TG_CACHE.keys().next().value);
  return t;
}
const landAt = (r, n) => 0.05 + (r / Math.max(1, n - 1)) * 0.6;

// the swarm is a cloud: its centre travels over the glass (Catmull-Rom
// through these keys), each bee swirls round the centre on its own loop
// It keeps low, under the minutes, and only climbs once it is over the hours
// (whose changing digits are being emptied by then); from -0.8 s on its x is
// the centre of the changing hour digits (the 99s below).
const CLOUD = [[-6.4, 127, 66], [-5, 126, 64], [-3.6, 116, 66], [-2.2, 98, 62], [-0.8, 99, 40], [1.5, 99, 40], [3, 99, 40]];
const CK = CLOUD.map((k) => k.slice());
function cloud(tau, out, cx) {
  for (let k = 4; k < CK.length; k++) CK[k][1] = cx;
  let k = 1;
  while (k < CK.length - 3 && tau > CK[k + 1][0]) k++;
  const p0 = CK[k - 1], p1 = CK[k], p2 = CK[k + 1], p3 = CK[k + 2];
  const u = Math.min(1, Math.max(0, (tau - p1[0]) / (p2[0] - p1[0]))), u2 = u * u, u3 = u2 * u;
  for (let c = 1; c <= 2; c++)
    out[c - 1] = 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * u + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * u2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * u3);
}
function orbit(i, tau, cx, out) {
  const r1 = (hash(i, 1) % 1000) / 1000, r2 = (hash(i, 2) % 1000) / 1000, r3 = (hash(i, 3) % 1000) / 1000;
  const r = 4 + 12 * Math.sqrt(r1), sq = 0.55 + 0.3 * r2, w = (2.4 + 1.6 * r3) * ((i & 1) ? 1 : -1), ph = r2 * TAU + i;
  cloud(tau, out, cx);
  const a = w * tau + ph;
  out[0] += r * cos(a); out[1] += r * sq * sin(a);
  out[2] = Math.atan2(sq * cos(a) * w, -sin(a) * w);
}

const tmp3 = [0, 0, 0, 0], tmp4 = [0, 0, 0, 0];
/** Swarm bee i at tau seconds from the hour turn (into minute K). False when it is not in the air or on a cell. */
function swarmBee(i, tau, K, tg, out) {
  const res = i < NRES, T0 = K * 60;
  const lift = -5 + 1.6 * ((hash(i, 11) % 1000) / 1000);
  if (tau < lift) return false;
  const n = tg.ids.length, land = i < n ? landAt(i, n) : -0.3 + 0.7 * ((hash(i, 12) % 1000) / 1000);
  const off = land + (i < n ? 1.3 + 0.8 * ((hash(i, 13) % 1000) / 1000) : 0);
  const back = off + 1.1;
  if (tau >= back) return false;
  orbit(i, tau, tg.cx, tmp3);
  if (tau < lift + 1.0) {
    // lifting off from its place on the comb (or flying in from outside)
    if (res) resident(i, T0 + lift, tmp4); else offEdge(hash(i, K, 14), tmp4);
    const u = sm((tau - lift) / 1.0);
    out[0] = tmp4[0] + (tmp3[0] - tmp4[0]) * u; out[1] = tmp4[1] + (tmp3[1] - tmp4[1]) * u;
    out[2] = angleLerp(tmp4[2], tmp3[2], u); out[3] = u;
    return true;
  }
  if (i < n) {
    const cid = tg.ids[i], C = cells[cid];
    if (tau < land - 0.6) { out[0] = tmp3[0]; out[1] = tmp3[1]; out[2] = tmp3[2]; out[3] = 1; return true; }
    if (tau < land) {
      const u = sm((tau - land + 0.6) / 0.6);
      out[0] = tmp3[0] + (C.x - tmp3[0]) * u; out[1] = tmp3[1] + (C.y - tmp3[1]) * u;
      out[2] = angleLerp(tmp3[2], -PI / 2, u); out[3] = 1 - u * u;
      return true;
    }
    if (tau < off) { out[0] = C.x; out[1] = C.y; out[2] = -PI / 2 + 0.25 * sin(tau * 6 + i); out[3] = 0; return true; }
    tmp3[0] = C.x; tmp3[1] = C.y; tmp3[2] = -PI / 2;
  } else if (tau < land) { out[0] = tmp3[0]; out[1] = tmp3[1]; out[2] = tmp3[2]; out[3] = 1; return true; }
  // home again: back to its place on the comb, or away out of the frame
  const u = (tau - off) / (back - off);
  if (res) resident(i, T0 + back, tmp4); else offEdge(hash(i, K, 15), tmp4);
  flight(tmp3[0], tmp3[1], tmp4[0], tmp4[1], u, 0.15, out);
  if (res && u > 0.8) out[2] = angleLerp(out[2], tmp4[2], (u - 0.8) / 0.2);
  return true;
}
