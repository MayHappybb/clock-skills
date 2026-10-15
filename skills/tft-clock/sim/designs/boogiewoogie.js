// Boogie-Woogie: the glass is Mondrian's Broadway Boogie Woogie (1942-43),
// Manhattan as a grid of yellow streets on an off-white canvas, the streets
// broken into little squares of red, blue and grey, and the four numerals
// are four street plans in it. Each digit (boogiewoogie-glyphs.js) is drawn
// only in horizontals and verticals: its corners and crossings are
// intersection squares, and every street between them is a one-way lane
// packed with traffic squares, nose to tail, a hairline of canvas between
// them so each square reads as a square. The hours are big blocks on the
// left, the minutes a smaller district to the right; the avenues of the
// city run round them, and two traffic lights on the avenue between them
// are the colon.
//
// The time is alive, on a boogie-woogie beat (120 bpm, swung eighths): the
// traffic in every digit hops one square forward on the beat. The hours
// play the left hand, the rolling eight-to-the-bar bass: they hop on every
// swung eighth. The minutes play the right hand, a syncopated riff on the
// offbeats (and-1, 2, and-3, 4, and-4). So every digit's surface steps all
// the time while its plan stays still and readable, and the intersection
// squares pulse (a one-pixel pop and a new colour) in a rotation, one or two
// a beat. The colon lights pop and swap every second. Around them the
// avenue traffic glides and the big colour blocks of the painting slide to
// new places along their streets, calmer. Every ~14 s a bigger figure:
// :14 a glissando, a run of blue and red sweeping through every street left
// to right like a piano run up the keyboard; :27 stop-and-go, every light
// goes red and the traffic halts for a beat, then catches up double time;
// :42 the crosstown express, a big block running the top avenue.
//
// Minute turn: the traffic re-routes. The changing digit's lanes close: no
// new squares enter and the ones inside run out downstream, every lane at
// the same pace, leaving its pale road (the old time still reads in it);
// the old road is lifted by pixel rank and is gone by :59.8; the
// intersections slide through the empty block to the new plan's corners
// (splitting or merging as the plan needs); the new pale road is laid at
// :00 and the new traffic pours in down every lane. Hour: rush hour. The
// traffic of every digit stops hopping and flows, fast; new streets are
// laid round every numeral so each becomes its own city block, packed with
// streaming cars, the lights chase; then the extra streets are lifted and
// the city calms. The time reads throughout.
//
// Palette: Mondrian's own and nothing else: canvas off-white, chrome
// yellow, red, blue, light grey (plus a pale yellow for the bare road, a
// thinned yellow). Every pixel is one of these, hard edges, no gradients,
// no shading: the motion is all squares stepping on the grid. At night it
// becomes the city after dark: the canvas goes to near-black, the avenues
// and blocks dim, the numerals keep their full colours (blue and red lifted
// a little to read on dark), and the backlight drops to 50 %.
//
// Cost: everything is fillRect: ~150 small rectangles a frame, a few
// thousand pixels of rank-dissolved road in a transition. Layouts of all
// 40 digit-slot plans are computed at load (flash, < 3 KB); node matchings
// per digit pair are cached (a few hundred bytes). One 12.8 KB rank table.

import { hash, clockFields, to565 } from '../js/kit.js';
import { layout } from './boogiewoogie-glyphs.js';

const W = 160, H = 80;

// ------------------------------------------------------------ palette
const DAY = { G: 0xebe7dc, Y: 0xf0c51c, R: 0xc5281f, B: 0x1e3c9a, A: 0xb6b6b0, GH: 0xeed27e,
  aY: 0xf0c51c, aR: 0xc5281f, aB: 0x1e3c9a, aA: 0xb6b6b0 };
const NIGHT = { G: 0x17171d, Y: 0xf0c51c, R: 0xe4472f, B: 0x5f88f0, A: 0x9c9c96, GH: 0x4c4428,
  aY: 0x6c5818, aR: 0x6c2a22, aB: 0x283e7c, aA: 0x48484c };
const KEYS = Object.keys(DAY);
const P = {};
function palette(nt) {
  const k = Math.round(nt * 256);
  for (const key of KEYS) {
    const a = DAY[key], b = NIGHT[key];
    const r = ((a >> 16) * (256 - k) + (b >> 16) * k) >> 8;
    const gg = (((a >> 8) & 255) * (256 - k) + ((b >> 8) & 255) * k) >> 8;
    const bb = ((a & 255) * (256 - k) + (b & 255) * k) >> 8;
    P[key] = (r << 16) | (gg << 8) | bb;
  }
}
// tile colour codes: 0 yellow, 1 red, 2 blue, 3 grey
const tileC = (c) => (c === 0 ? P.Y : c === 1 ? P.R : c === 2 ? P.B : P.A);
const carC = (c) => (c === 0 ? P.aY : c === 1 ? P.aR : c === 2 ? P.aB : P.aA);

// ------------------------------------------------------------ the plan of the city
const SLOTS = [
  { x: 5, y: 12, w: 30, h: 56, s: 6, hand: 0 },
  { x: 41, y: 12, w: 30, h: 56, s: 6, hand: 0 },
  { x: 86, y: 12, w: 24, h: 40, s: 5, hand: 1 },
  { x: 117, y: 12, w: 24, h: 40, s: 5, hand: 1 },
];
const LAY = SLOTS.map((S) => Array.from({ length: 10 }, (_, d) => layout(d, S.x, S.y, S.w, S.h, S.s)));

// avenues: x, y, w, h (3 px wide), car speed px/s (sign = direction along the long axis)
const AVENUES = [
  { x: 0, y: 4, w: 160, h: 3, v: 13 },
  { x: 77, y: 0, w: 3, h: 80, v: -9 },
  { x: 0, y: 73, w: 77, h: 3, v: -11 },
  { x: 80, y: 58, w: 80, h: 3, v: 15 },
  { x: 147, y: 7, w: 3, h: 51, v: 10 },
  { x: 118, y: 61, w: 3, h: 19, v: -8 },
  { x: 80, y: 70, w: 38, h: 3, v: -12 },
  { x: 0, y: 7, w: 2, h: 66, v: 12 },
  { x: 155, y: 7, w: 3, h: 51, v: -14 },
  { x: 121, y: 64, w: 39, h: 3, v: 11 },
  { x: 80, y: 77, w: 80, h: 3, v: -16 },
];
for (const [i, a] of AVENUES.entries()) {
  a.len = Math.max(a.w, a.h); a.hor = a.w > a.h;
  a.cars = [];
  const n = Math.max(1, Math.floor(a.len / 10));
  for (let k = 0; k < n; k++) {
    const r = hash(i, k, 11);
    a.cars.push({ base: (k * a.len) / n + (r % 7), c: [3, 3, 1, 2, 3, 0, 1, 2][(r >>> 8) & 7] });
  }
}

// the painting's big blocks: they slide between two homes along their street
const BLOCKS = [
  { x0: 84, x1: 102, y0: 63, y1: 63, w: 14, h: 13, c: 'aB', ix: 4, iy: 4, iw: 5, ih: 5, ic: 'aY', ph: 0 },
  { x0: 126, x1: 140, y0: 63, y1: 63, w: 9, h: 14, c: 'aR', ix: 2, iy: 5, iw: 5, ih: 4, ic: 'aA', ph: 1.5 },
  { x0: 12, x1: 46, y0: 71, y1: 71, w: 12, h: 7, c: 'aY', ix: 4, iy: 2, iw: 4, ih: 3, ic: 'aR', ph: 0.3 },
  { x0: 145, x1: 145, y0: 18, y1: 36, w: 7, h: 10, c: 'aR', ix: 2, iy: 3, iw: 3, ih: 4, ic: 'aA', ph: 2.6 },
  { x0: 58, x1: 22, y0: 2, y1: 2, w: 8, h: 7, c: 'aA', ix: 2, iy: 2, iw: 4, ih: 3, ic: 'aB', ph: 2.2 },
  { x0: 150, x1: 150, y0: 40, y1: 12, w: 5, h: 12, c: 'aB', ix: 1, iy: 4, iw: 3, ih: 4, ic: 'aR', ph: 0.7 },
];
const COLON = [[76, 26], [76, 41]];

// rush hour: the extra streets laid round every numeral (x, y, w, h, 2 px)
const RUSH = [
  { x: 37, y: 7, w: 2, h: 66 }, { x: 112, y: 7, w: 2, h: 51 },
  { x: 143, y: 7, w: 2, h: 51 }, { x: 80, y: 54, w: 67, h: 2 }, { x: 80, y: 68, w: 80, h: 2 },
  { x: 102, y: 61, w: 2, h: 19 }, { x: 2, y: 9, w: 75, h: 2 }, { x: 80, y: 9, w: 67, h: 2 },
];
for (const r of RUSH) { r.len = Math.max(r.w, r.h); r.hor = r.w > r.h; }

// rank of every pixel, for dissolving roads evenly (flash/RAM 12.8 KB)
const RANK = new Uint8Array(W * H);
for (let i = 0; i < W * H; i++) RANK[i] = hash(i % W, (i / W) | 0, 77) & 255;

// ------------------------------------------------------------ the beat
const HOP = 0.14;                                   // a hop glides one square in 0.14 s
const TK = [0, 1 / 3, 0.5, 0.5 + 1 / 3, 1, 1 + 1 / 3, 1.5, 1.5 + 1 / 3];   // swung eighths in a 2 s bar
const HANDS = [[1, 1, 1, 1, 1, 1, 1, 1], [0, 1, 1, 0, 0, 1, 1, 1]];
const PER_BAR = HANDS.map((p) => p.reduce((a, b) => a + b, 0));
const sstep = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const prog = (v, a, b) => (v <= a ? 0 : v >= b ? 1 : (v - a) / (b - a));

/** Squares hopped by a hand since the epoch, at time T (s), eased through each hop. */
function hops(T, hand) {
  const bar = Math.floor(T / 2), tb = T - bar * 2, pat = HANDS[hand];
  let c = bar * PER_BAR[hand];
  for (let k = 0; k < 8; k++) if (pat[k]) c += sstep((tb - TK[k]) / HOP);
  return c;
}

// rush hour: extra flow in squares, the integral of a speed ramp; every
// hour adds the whole run so the flow never jumps between hours
const RA = 1.6, RB = 3.0, RC = 9.4, RD = 11.0, RV = 6;
const RTOT = RV * ((RB - RA) / 2 + (RC - RB) + (RD - RC) / 2);
function rushInt(t) {
  if (t <= RA) return 0;
  if (t < RB) return (RV * (t - RA) * (t - RA)) / (2 * (RB - RA));
  if (t < RC) return RV * ((RB - RA) / 2 + (t - RB));
  if (t < RD) return RV * ((RB - RA) / 2 + (RC - RB) + (t - RC) - ((t - RC) * (t - RC)) / (2 * (RD - RC)));
  return RTOT;
}
const rushSpeed = (t) => RV * (t < RA ? 0 : t < RB ? (t - RA) / (RB - RA) : t < RC ? 1 : t < RD ? 1 - (t - RC) / (RD - RC) : 0);

/**
 * The flow of a hand at clock time: hops on the warped beat (stop-and-go at
 * :30 holds a beat and catches up double time) plus the rush hour run.
 * `T` epoch seconds, `s` seconds into the minute, `hk` hours since the epoch, `th` s into the hour.
 */
function flow(T, s, hand, hk, th) {
  let Tw = T;
  if (s >= 27 && s < 28) Tw = T - (s - 27);
  else if (s >= 28 && s < 29) Tw = T + s - 29;
  return hops(Tw, hand) + hk * RTOT + rushInt(th);
}

// ------------------------------------------------------------ tile colours
function rawCol(seed, j) {
  const h = hash(seed, j | 0, 5) % 100;
  return h < 34 ? 0 : h < 61 ? 1 : h < 86 ? 2 : 3;
}
function tileCol(seed, j) {
  const c = rawCol(seed, j);
  return c && c === rawCol(seed, j - 1) ? 0 : c;
}

// ------------------------------------------------------------ node matching for the turn
const MATCH = new Map();
/** Moves that carry digit a's intersections to digit b's: [fromIndex, toIndex, survives]. */
function matching(q, a, b) {
  const key = q * 100 + a * 10 + b;
  let m = MATCH.get(key);
  if (m) return m;
  const A = LAY[q][a].nodes, B = LAY[q][b].nodes;
  const d2 = (i, j) => (A[i][0] - B[j][0]) ** 2 + (A[i][1] - B[j][1]) ** 2;
  const pairs = [];
  for (let i = 0; i < A.length; i++) for (let j = 0; j < B.length; j++) pairs.push([d2(i, j), i, j]);
  pairs.sort((u, v) => u[0] - v[0] || u[1] - v[1] || u[2] - v[2]);
  const usedA = new Array(A.length).fill(false), gotB = new Array(B.length).fill(false);
  m = [];
  for (const [, i, j] of pairs) if (!usedA[i] && !gotB[j]) { usedA[i] = gotB[j] = true; m.push([i, j, 1]); }
  for (let j = 0; j < B.length; j++) if (!gotB[j]) {           // a node splits off its nearest
    let best = 0; for (let i = 1; i < A.length; i++) if (d2(i, j) < d2(best, j)) best = i;
    m.push([best, j, 1]);
  }
  for (let i = 0; i < A.length; i++) if (!usedA[i]) {          // a spare node merges into its nearest
    let best = 0; for (let j = 1; j < B.length; j++) if (d2(i, j) < d2(i, best)) best = j;
    m.push([i, best, 0]);
  }
  MATCH.set(key, m);
  return m;
}

// ------------------------------------------------------------ drawing helpers
function road(g, x, y, w, h, frac, c) {
  if (frac <= 0) return;
  if (frac >= 1) { g.fillRect(x, y, w, h, c); return; }
  const v = to565(c), buf = g.buf, th = frac * 256;
  const x0 = Math.max(0, x), x1 = Math.min(W, x + w), y0 = Math.max(0, y), y1 = Math.min(H, y + h);
  let n = 0;
  for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) {
    const i = yy * W + xx;
    if (RANK[i] < th) { buf[i] = v; n++; }
  }
  g.cost.px += n; g.cost.box += (x1 - x0) * (y1 - y0) * 2;
}

/** The node colour of intersection i of slot q at its pop number k: red, blue or grey, never twice running. */
function nodeCol(q, i, k) {
  const c = 1 + (hash(q, i, k) % 3);
  const p = 1 + (hash(q, i, k - 1) % 3);
  return c === p ? 1 + (c % 3) : c;
}

/** Draw a street's traffic: tiles j in (jLo, jHi] at flow F; wave = glissando front x or -999. */
function traffic(g, st, s, seed, F, jLo, jHi, wave) {
  const Pp = s + 1, L = st.L;
  if (L <= 0) return;
  const jA = Math.max(jLo + 1, Math.floor(F - L / Pp)), jB = Math.min(jHi, Math.floor(F) + 1);
  for (let j = jA; j <= jB; j++) {
    const u = Math.round((F - j) * Pp);
    let a = u, b = u + s;
    if (a < 0) a = 0;
    if (b > L) b = L;
    if (b <= a) continue;
    let x, y, w, h;
    if (st.ax === 0) {
      x = st.d > 0 ? st.o + a : st.o - b; w = b - a; y = st.y; h = s;
    } else {
      y = st.d > 0 ? st.o + a : st.o - b; h = b - a; x = st.x; w = s;
    }
    let c = tileCol(seed, j);
    if (wave > -999) {
      const dw = wave - (x + w / 2);
      if (dw >= 0 && dw < 9) c = 2; else if (dw >= 9 && dw < 18) c = 1;
    }
    g.fillRect(x, y, w, h, tileC(c));
  }
}

// ------------------------------------------------------------ the face
export default {
  name: 'Boogie-Woogie',
  blurb: 'Mondrian\'s Broadway Boogie Woogie: each numeral is a street plan whose traffic squares hop on a swung boogie beat; the traffic re-routes at the turn, rush hour at the hour.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, nt = ctx.night;
    ctx.lcd.backlight(1 - 0.5 * nt);
    palette(nt);
    const T = f.minuteKey * 60 + s;
    const th = f.m * 60 + s, hk = Math.round((f.minuteKey - f.m) / 60);
    const prv = clockFields(new Date(ctx.date.getTime() - 60000));
    const nxt = clockFields(new Date(ctx.date.getTime() + 60000));
    const cur = f.hh + f.mm, pd = prv.hh + prv.mm, nd = nxt.hh + nxt.mm;
    const hourShow = f.m === 0 && th < 12;
    const rs = hourShow ? rushSpeed(th) / RV : 0;               // 0..1 rush intensity

    g.clear(P.G);

    // ---- rush hour: extra streets laid round every numeral
    if (hourShow && th > RA && th < 12) {
      for (let i = 0; i < RUSH.length; i++) {
        const r = RUSH[i], t0 = RA + 0.12 * i, t1 = RC + 0.12 * i;
        const tip = (th - t0) * 120, tail = th > t1 ? (th - t1) * 120 : 0;
        const a = Math.max(0, tail), b = Math.min(r.len, tip);
        if (b <= a) continue;
        if (r.hor) g.fillRect(r.x + a, r.y, b - a, r.h, P.aY); else g.fillRect(r.x, r.y + a, r.w, b - a, P.aY);
        // cars stream down it at 1 px a frame, entering behind the tip
        const run = (th - t0) * 60;
        for (let k = Math.max(0, Math.floor((run - b) / 7)); k * 7 <= run - a; k++) {
          const p = Math.round(run - k * 7);
          if (p < a || p + 2 > b) continue;
          const c = carC(1 + (hash(i, k, 21) % 3));
          if (r.hor) g.fillRect(r.x + p, r.y, 2, 2, c); else g.fillRect(r.x, r.y + p, 2, 2, c);
        }
      }
    }

    // ---- the avenues and their traffic (it speeds up at rush hour)
    const rushPx = hourShow ? rushInt(th) * 3 : 0;
    for (let i = 0; i < AVENUES.length; i++) {
      const a = AVENUES[i];
      g.fillRect(a.x, a.y, a.w, a.h, P.aY);
      const span = a.len + 3;
      for (const car of a.cars) {
        let p = (car.base + a.v * T + Math.sign(a.v) * rushPx) % span;
        if (p < 0) p += span;
        const cw = a.hor ? a.h : a.w, q = Math.round(p) - cw;
        const lo = Math.max(0, q), hi = Math.min(a.len, q + cw);
        if (hi <= lo) continue;
        if (a.hor) g.fillRect(a.x + lo, a.y, hi - lo, cw, carC(car.c)); else g.fillRect(a.x, a.y + lo, cw, hi - lo, carC(car.c));
      }
    }

    // ---- the big blocks, sliding between their homes every 8 s
    for (const b of BLOCKS) {
      const k = Math.floor((T + b.ph) / 3), lt = T + b.ph - k * 3;
      const e = sstep(prog(lt, 0, 1.2));
      const u = k & 1 ? e : 1 - e;
      const x = Math.round(b.x0 + (b.x1 - b.x0) * u), y = Math.round(b.y0 + (b.y1 - b.y0) * u);
      g.fillRect(x, y, b.w, b.h, P[b.c]);
      g.fillRect(x + b.ix, y + b.iy, b.iw, b.ih, P[b.ic]);
    }

    // ---- :42 the crosstown express on the top avenue
    if (s >= 42 && s < 46.5) {
      const x = Math.round(-16 + (s - 42) * 42);
      g.fillRect(x, 1, 14, 9, P.aR);
      g.fillRect(x + 3, 3, 4, 5, P.aY);
      g.fillRect(x + 9, 3, 3, 5, P.aA);
    }

    // ---- the colon: two traffic lights on the avenue, popping every second
    {
      const sec = Math.floor(s), pop = s - sec < 0.12 ? 1 : 0;
      for (let i = 0; i < 2; i++) {
        const [cx, cy] = COLON[i];
        const c = ((sec + i) & 1) ? P.B : P.R;
        g.fillRect(cx - pop, cy - pop, 5 + 2 * pop, 5 + 2 * pop, c);
      }
    }

    // ---- the numerals
    const wave = s >= 14 && s < 15.5 ? -20 + (s - 14) * 140 : -999;
    const stop = s >= 27 && s < 28;
    const beat = Math.floor(T * 2), sinceBeat = T * 2 - beat;
    for (let q = 0; q < 4; q++) {
      const S = SLOTS[q], ss = S.s, Pp = ss + 1;
      const dc = +cur[q];
      const out = s >= 58.4 && nd[q] !== cur[q];
      const inn = s < 2.0 && pd[q] !== cur[q];
      const Lc = LAY[q][dc];
      const Fr = flow(T, s, S.hand, hk, th);

      // the road (pale): only while the lanes are emptying or filling
      let roadF = 0;
      if (out) roadF = 1 - prog(s, 59.3, 59.8);
      else if (inn) roadF = s < 1.6 ? prog(s, 0, 0.4) : 1 - prog(s, 1.6, 2.0);
      if (roadF > 0) {
        for (const st of Lc.streets) road(g, st.x, st.y, st.w, st.h, roadF, P.GH);
        for (const [nx, ny] of Lc.nodes) road(g, nx, ny, ss, ss, roadF, P.GH);
      }

      // the traffic
      let showTiles = true;
      for (const st of Lc.streets) {
        const seed = hash(q, dc, st.i);
        const K = Math.ceil(st.L / Pp) + 1;
        let F = Fr, jLo = -Infinity, jHi = Infinity;
        if (out) {
          const T0 = T - (s - 58.4);
          const F0 = flow(T0, 58.4, S.hand, hk, th - (s - 58.4));
          jHi = Math.floor(F0) + 1;
          { const u = prog(s, 58.4, 59.3); F = Fr + u * u * (K + 1); }
          if (s >= 59.3) showTiles = false;
        } else if (inn) {
          if (s < 0.4) { showTiles = false; } else {
            const T0 = T - (s - 0.4);
            const F0 = flow(T0, 0.4, S.hand, hk, th - (s - 0.4));
            jLo = Math.floor(F0 - K);
            { const u = 1 - prog(s, 0.4, 1.6); F = Fr - u * u * (K + 1); }
          }
        }
        if (showTiles) traffic(g, st, ss, seed, F, jLo, jHi, wave);
      }

      // the intersections: pop in rotation on the beat; slide to the new plan at the turn
      let moving = null, mu = 0, Lfrom = null, Lto = null, dTo = dc;
      if (out && s >= 59.6) { Lfrom = Lc; dTo = +nd[q]; Lto = LAY[q][dTo]; moving = matching(q, dc, dTo); mu = sstep(prog(s, 59.6, 60.4)); }
      else if (inn && s < 0.4) { const dp = +pd[q]; Lfrom = LAY[q][dp]; Lto = Lc; moving = matching(q, dp, dc); mu = sstep(prog(s + 60, 59.6, 60.4)); }
      const rushChase = rs > 0.5;
      const nodeAt = (i) => {
        // pop number and freshness of node i of the target digit
        const ph = rushChase ? (beat * 2 + (sinceBeat >= 0.5 ? 1 : 0)) : beat;
        const n = rushChase ? 6 : 4, off = rushChase ? i : i * 3 + q;
        const k = Math.floor((ph + off) / n), pop = (ph + off) % n === 0;
        const fresh = pop && (rushChase ? (sinceBeat % 0.5) < 0.12 : sinceBeat < 0.24);
        return [k, fresh];
      };
      const drawNode = (x, y, i, colCode) => {
        const [k, fresh] = nodeAt(i);
        let c = colCode ?? nodeCol(q, i, k);
        if (stop) c = 1;
        if (wave > -999) { const dw = wave - (x + ss / 2); if (dw >= 0 && dw < 9) c = 2; else if (dw >= 9 && dw < 18) c = 1; }
        const p = fresh && !stop ? 1 : 0;
        g.fillRect(x - p, y - p, ss + 2 * p, ss + 2 * p, tileC(c));
      };
      if (moving) {
        for (const [i, j] of moving) {
          const [ax, ay] = Lfrom.nodes[i], [bx, by] = Lto.nodes[j];
          drawNode(Math.round(ax + (bx - ax) * mu), Math.round(ay + (by - ay) * mu), j);
        }
      } else {
        for (let i = 0; i < Lc.nodes.length; i++) drawNode(Lc.nodes[i][0], Lc.nodes[i][1], i);
      }
    }
  },
};
