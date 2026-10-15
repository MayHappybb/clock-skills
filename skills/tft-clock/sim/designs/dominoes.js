// Dominoes: seen from above, a green baize table with the time set up on it
// as domino runs. Every numeral is a chain of standing ivory tiles (one or
// two runs, a tile every 4 px), so a stroke is a ladder of tile tops; when a
// run falls it becomes a shingled strip of tile faces with their pips, and
// the last tile lies flat showing its whole face.
//
// Always alive: the colon is a domino lying face up, and every second it
// hops and is slammed down on the table the way players slam a tile. The
// shock runs out across the baize as a ring of lifted nap, and every tile
// rocks forward as the ring passes it: the four numerals shiver outward from
// the centre once a second, every tile of every digit. Every 15 s the slam
// is a hard one and knocks runs over (:15 the hours, :30 all four, :45 the
// minutes): each falls in a real chain reaction from its first tile, lies a
// moment showing its pips, and stands back up from the far end, as if the
// film ran backwards.
//
// Minute: a hard slam at :58 knocks the changing runs over; at :59.3 their
// fallen tiles slide together into a stack at the point where the new
// numeral's run begins. After :00 the new numeral is pencilled on the baize
// as a row of dots and a little domino-laying cart drives along it, setting
// a tile down every 4 px; it parks and is gone by :01.8. Never a wrong
// digit: the old run only falls (still the same shape, bolder) and gathers
// away before :00; the new one is only laid after.
//
// Hour: from :52 two carts lay one long run round the whole edge of the
// table, out from the top centre and meeting at the bottom. At :57 a hard
// slam starts it: the fall races both ways round the frame and knocks over
// every numeral it passes, all four lying in pips by :59. The changing ones
// gather and are relaid; the others stand back up together after :00 while
// the fallen border slides off the table.
//
// Colour: ivory on baize, the colours of a domino table, and nothing else:
// two RGB565 values all day, the pips and shingle lines are holes in the
// ivory. Night only dims the backlight.
//
// Cost: one byte mask (12.8 KB) and a moat mask, a distance table from the
// colon, and per-minute tile layouts; a frame is ~150-300 oriented tiles
// tested in their boxes, one ring pass over the glass and one 2-colour
// write, all charged to g.cost.box.

import { to565, hash, rand, clockFields, sin, clamp, ease, progress } from '../js/kit.js';
import { layoutDigit, tiles, LF, LFLAT, TW, ST } from './dominoes-glyphs.js';
import { tile, cart, dot, dilate, W, H } from './dominoes-draw.js';

const INK_C = 0xece6d6, GND_C = 0x123a22;
const INK = to565(INK_C), GND = to565(GND_C);

// Slots: hours 66 tall at the left, minutes 48 tall set low at the right,
// the colon tile between them; a 7 px margin all round for the hour's
// border run.
const SLOTS = [
  { x: 7, y: 7, w: 34, h: 66 },
  { x: 44, y: 7, w: 34, h: 66 },
  { x: 92, y: 25, w: 29, h: 48 },
  { x: 124, y: 25, w: 29, h: 48 },
];
const CX = 85, CY = 49;            // the colon tile's centre: the slam
const V = 110, R0 = 6, RW = 24;    // shock ring speed (px/s), start radius, rock width
const HW = TW / 2, BHW = 2.5;      // half widths: numeral tiles, border tiles

const M = new Uint8Array(W * H), TMP = new Uint8Array(W * H);
const DIST = new Uint8Array(W * H);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) DIST[y * W + x] = Math.min(255, Math.round(Math.hypot(x + 0.5 - CX, y + 0.5 - CY)));
const dist = (x, y) => Math.hypot(x - CX, y - CY);

// ------------------------------------------------------------ the hour's border run

// Two halves, from the top centre round each side to the bottom centre.
function borderHalf(side) {
  const pts = [], P = (x, y) => pts.push(side < 0 ? x : 160 - x, y);
  const r = 4.5, q = 2.5, e = 2 + r + q;
  for (let x = 80; x >= e; x -= 0.5) P(x, q);
  for (let a = 0; a <= 16; a++) { const t = (a / 16) * Math.PI / 2; P(e - r * Math.sin(t) - 0.0, q + r - r * Math.cos(t)); }
  // the arc above ends at (e - r, q + r): continue down the side
  for (let y = q + r; y <= 80 - q - r; y += 0.5) P(e - r, y);
  for (let a = 0; a <= 16; a++) { const t = (a / 16) * Math.PI / 2; P(e - r * Math.cos(t), 80 - q - r + r * Math.sin(t)); }
  for (let x = e; x <= 80; x += 0.5) P(x, 80 - q);
  const t = tiles(pts, false);
  t.a = new Uint8Array(t.N); t.b = new Uint8Array(t.N); t.dist = new Float32Array(t.N);
  for (let k = 0; k < t.N; k++) { const h = hash(k, side, 41); t.a[k] = h % 7; t.b[k] = (h >>> 8) % 7; t.dist[k] = dist(t.x[k], t.y[k]); }
  t.flat = false;
  return t;
}
const BORDER = [borderHalf(-1), borderHalf(1)];
const BLEN = BORDER[0].len;
const BL0 = 50, BL1 = 55.6;                       // the carts lay the border
const BSLAM = 56, BT0 = BSLAM + (dist(80, 2.5) - R0) / V, BDUR = 1.7;   // its fall races round
const NEAR = (x, y) => {   // arc of the border point nearest (x, y), on either half
  let best = 1e9, arc = 0;
  for (const b of BORDER) for (let k = 0; k < b.N; k++) {
    const d = Math.hypot(b.x[k] - x, b.y[k] - y);
    if (d < best) { best = d; arc = b.arc[k]; }
  }
  return arc + best * 0.6;
};

// ------------------------------------------------------------ layouts

const LAYOUTS = new Map();
function layout(slot, d) {
  const k = slot * 10 + d;
  let L = LAYOUTS.get(k);
  if (!L) {
    const b = SLOTS[slot];
    L = layoutDigit(d, b.x, b.y, b.w, b.h, 7 + k);
    for (const s of L) {
      s.dist = new Float32Array(s.N);
      for (let i = 0; i < s.N; i++) s.dist[i] = dist(s.x[i], s.y[i]);
      s.hourT = BT0 + (BDUR * NEAR(s.x[0], s.y[0])) / BLEN;
    }
    LAYOUTS.set(k, L);
  }
  return L;
}

// Per-minute cache: the digits, and a moat round this minute's tiles where
// the ring never lifts the nap.
let CK = -1, C = null;
const MOAT = new Uint8Array(W * H);
function minute(g, date, f) {
  if (CK === f.minuteKey) return C;
  const prv = clockFields(new Date(date.getTime() - 60000)), nxt = clockFields(new Date(date.getTime() + 60000));
  const dg = (q) => [+q.hh[0], +q.hh[1], +q.mm[0], +q.mm[1]];
  C = { cur: dg(f), prv: dg(prv), nxt: dg(nxt), hourEnd: nxt.h !== f.h, hourStart: prv.h !== f.h };
  MOAT.fill(0);
  const cost = { box: 0 };
  for (let i = 0; i < 4; i++) for (const s of layout(i, C.cur[i])) {
    for (let k = 0; k < s.N; k++) tile(MOAT, s.x[k], s.y[k], s.tx[k], s.ty[k], k === s.N - 1 && s.flat ? LFLAT : LF, 0, 0, HW, cost);
  }
  tile(MOAT, CX, CY - 7.5, 0, 1, LFLAT, 0, 0, HW + 1, cost);
  dilate(MOAT, TMP, 3);
  g.cost.box += cost.box + W * H * 14;
  CK = f.minuteKey;
  return C;
}

// ------------------------------------------------------------ run states

const fallL = (u, flat) => ST + ((flat ? LFLAT : LF) - ST) * u * u;
const K = 2.5;   // a falling tile spans ~2.5 tile-times of the front

/** Fraction fallen of tile k of an N-tile run whose front started at t0 and takes dur s. */
function fallAt(k, N, s, t0, dur) {
  const F = ((s - t0) / dur) * (N - 1 + K);
  return clamp((F - k) / K, 0, 1);
}

// The flourishes: [second, slots]. Each knocked run falls, lies, stands back up.
const FLOURISH = [[15, [0, 1]], [30, [0, 1, 2, 3]], [45, [2, 3]]];
const TDUR = 0.8, HOLD = 0.7, RDUR = 0.8;

/** When the slam at second s0 knocks a run: as the ring reaches its first tile. */
const trig = (s0, st) => s0 + Math.max(0, st.dist[0] - R0) / V;

const LS = new Float32Array(256);

function drawRun(st, Ls, hw, cost) {
  for (let k = st.N - 1; k >= 0; k--) tile(M, st.x[k], st.y[k], st.tx[k], st.ty[k], Ls[k], st.a[k], st.b[k], hw, cost);
}

/** Rock every standing tile of a run forward as the shock ring passes it. */
function rock(st, n, R, amp) {
  for (let k = 0; k < n; k++) {
    if (LS[k] >= ST + 0.4) continue;
    const x = (R - st.dist[k]) / RW;
    if (x > 0 && x < 1) LS[k] += amp * sin(Math.PI * x);
  }
}

/**
 * A numeral at rest (not being laid or gathered): standing, or knocked over
 * by a flourish and standing back up, or felled by the hour's border run.
 */
function restLengths(st, slot, s, c) {
  let t0 = -100, r0 = 1e9;
  for (const [t, sl] of FLOURISH) if (s >= t && s < t + 4 && sl.includes(slot)) { t0 = trig(t, st); r0 = t0 + TDUR + HOLD; }
  if (c.hourEnd && s >= BSLAM) { t0 = st.hourT; r0 = 1e9; }
  if (c.hourStart && s < 2) { t0 = -10; r0 = 0.35; }
  for (let k = 0; k < st.N; k++) {
    let L = ST;
    if (t0 > -20 && s >= t0) {
      const fl = k === st.N - 1 && st.flat;
      const u = fallAt(k, st.N, s, t0, TDUR), v = fallAt(st.N - 1 - k, st.N, s, r0, RDUR);
      L = fallL(u * (1 - v), fl);
    }
    LS[k] = L;
  }
  return LS;
}

/** Where a cart is at arc A along an open run (extrapolated past its ends). */
function along(st, A, out) {
  const step = st.len / (st.N - 1), p = A / step;
  if (p >= st.N - 1 || p <= 0) {
    const e = p <= 0 ? 0 : st.N - 1, over = p <= 0 ? A : A - st.len;
    out.x = st.x[e] + st.tx[e] * over; out.y = st.y[e] + st.ty[e] * over; out.tx = st.tx[e]; out.ty = st.ty[e];
    return out;
  }
  const k = Math.floor(p), u = p - k;
  out.x = st.x[k] + (st.x[k + 1] - st.x[k]) * u; out.y = st.y[k] + (st.y[k + 1] - st.y[k]) * u;
  const tx = st.tx[k] + (st.tx[k + 1] - st.tx[k]) * u, ty = st.ty[k] + (st.ty[k + 1] - st.ty[k]) * u, l = Math.hypot(tx, ty) || 1;
  out.tx = tx / l; out.ty = ty / l;
  return out;
}
const AT = { x: 0, y: 0, tx: 1, ty: 0 };

// ------------------------------------------------------------ the face

export default {
  name: 'Dominoes',
  blurb: 'The time set up as domino runs on a baize table: every second the colon tile is slammed and a shiver runs through every numeral; the old digit topples in a chain reaction and a little cart lays the new one; at the hour a run round the whole table knocks everything down.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec;
    ctx.lcd.backlight(1 - 0.6 * ctx.night);
    const c = minute(g, ctx.date, f);
    const cost = g.cost;
    M.fill(0);

    // ---- the slam: the shock ring through the nap of the baize
    const sec = Math.floor(s), fs = s - sec;
    const hard = sec === 15 || sec === 30 || sec === 45 || (c.hourEnd ? sec === BSLAM : sec === 58);
    const R = R0 + V * fs;
    nap(R, hard, cost);
    const amp = hard ? 3.6 : 3.2;

    // ---- the hour's border run
    if (c.hourEnd && s >= BL0) border(s, R, amp, cost);
    if (c.hourStart && s < 6.6) unborder(s, cost);

    // ---- the numerals
    for (let i = 0; i < 4; i++) {
      const d = c.cur[i], strokes = layout(i, d);
      const incoming = c.prv[i] !== d, outgoing = c.nxt[i] !== d;
      if (incoming && s < 1.7) { layRun(strokes, s, cost); continue; }
      if (outgoing && s >= 56) {
        const hourly = c.hourEnd;
        if (hourly || s >= 58) { toppleGather(strokes, s, layout(i, c.nxt[i])[0], hourly, cost); continue; }
      }
      for (const st of strokes) { restLengths(st, i, s, c); rock(st, st.N, R, amp); drawRun(st, LS, HW, cost); }
    }

    // ---- the colon: a double-six lying face up, lifted and slammed on the beat
    const lift = fs > 0.72 ? ease.outQuad((fs - 0.72) / 0.28) : 0;
    const grow = Math.round(lift * (hard ? 2 : 1));
    tile(M, CX, CY - 7.5 - grow, 0, 1, LFLAT + 2 * grow, 6, 6, HW + grow + 1, cost);

    // ---- out: two colours
    const buf = g.buf;
    for (let i = 0; i < W * H; i++) buf[i] = M[i] ? INK : GND;
    cost.px += W * H; cost.box += W * H;
  },
};

// The baize's nap: a sparse stipple of short diagonal hairs (~9 % ink). The
// slam's shock ring is a bright front of standing nap; behind it the nap
// lies flat (bare felt) and grows back over ~45 px, so a clean dark ring
// sweeps the whole table once a second. Never inside the numerals' moat.
const NAP = new Uint8Array(W * H);
// Inside the numerals' boxes the front shows only the standing hairs: a
// solid arc there could close an open side (a 3 reading 8).
const BOX = new Uint8Array(W * H);
for (const b of [{ x: 4, y: 4, w: 77, h: 72 }, { x: 89, y: 22, w: 67, h: 54 }])
  for (let y = b.y; y < b.y + b.h; y++) BOX.fill(1, y * W + b.x, y * W + b.x + b.w);
for (let cy = 0; cy < H; cy += 4) for (let cx = 0; cx < W; cx += 4) {
  // one 2-px diagonal hair in most 4 x 4 cells, at a jittered spot
  const h = hash(cx, cy, 77);
  if ((h & 7) < 4) continue;
  const x = cx + ((h >>> 3) & 3), y = cy + ((h >>> 5) & 3), th = 1 + ((h >>> 8) % 200);
  for (let q = 0; q < 2; q++) {
    const xx = x + q, yy = y + q;
    if (xx < W && yy < H) NAP[yy * W + xx] = th;
  }
}
function nap(R, hard, cost) {
  const front = hard ? 4 : 3;
  for (let i = 0; i < W * H; i++) {
    const n = NAP[i];
    if (MOAT[i]) continue;
    const d = DIST[i], behind = R - d;
    if (behind < 0) { if (n) M[i] = 1; continue; }            // ahead of the ring: the nap stands
    if (behind < front) {                                    // the front: a solid line, then a checker
      if (n || (!BOX[i] && (behind < 1 || ((i + ((i / W) | 0)) & 1) === 0))) M[i] = 1;
      continue;
    }
    if (n && n * 0.22 < behind - front) M[i] = 1;             // regrowth behind it
  }
  cost.box += W * H * 4;
}

/** :50-:60 of an hour's last minute: two carts lay the border, the slam fells it. */
function border(s, R, amp, cost) {
  const A = (BLEN + 6) * ease.inOutQuad(progress(s, BL0, BL1));
  for (const b of BORDER) {
    let n = 0;
    while (n < b.N && b.arc[n] + 6 <= A) n++;
    for (let k = 0; k < n; k++) LS[k] = s >= BT0 ? fallL(fallAt(k, b.N, s, BT0, BDUR), false) : ST;
    rock(b, n, R, amp);
    for (let k = n - 1; k >= 0; k--) tile(M, b.x[k], b.y[k], b.tx[k], b.ty[k], LS[k], b.a[k], b.b[k], BHW, cost);
    const keep = s < BL0 + 0.2 ? (s - BL0) / 0.2 : clamp(1 - (s - BL1) / 0.3, 0, 1);
    if (keep > 0) { along(b, A, AT); cart(M, AT.x, AT.y, AT.tx, AT.ty, keep, cost); }
  }
}

/** :00-:06.6 of a new hour: the carts drive back over the fallen border and pick it up. */
function unborder(s, cost) {
  const A = BLEN * (1 - ease.inOutQuad(progress(s, 0.6, 6.2))) + 6;
  for (const b of BORDER) {
    for (let k = b.N - 1; k >= 0; k--) if (b.arc[k] + 6 <= A) tile(M, b.x[k], b.y[k], b.tx[k], b.ty[k], LF, b.a[k], b.b[k], BHW, cost);
    const keep = s < 0.6 ? progress(s, 0.3, 0.6) : clamp(1 - (s - 6.2) / 0.3, 0, 1);
    if (keep > 0) { along(b, A - 6, AT); cart(M, AT.x, AT.y, -AT.tx, -AT.ty, keep, cost); }
  }
}

/** The old run at the turn: knocked over, then gathered into a stack where the new one starts. */
function toppleGather(strokes, s, to, hourly, cost) {
  const qx = to.x[0], qy = to.y[0];
  const G0 = 59.45, G1 = 59.95;
  for (const st of strokes) {
    const t0 = hourly ? st.hourT : trig(58, st);
    for (let k = 0; k < st.N; k++) LS[k] = s >= t0 ? fallL(fallAt(k, st.N, s, t0, TDUR), k === st.N - 1 && st.flat) : ST;
    if (s < G0) { drawRun(st, LS, HW, cost); continue; }
    for (let k = st.N - 1; k >= 0; k--) {
      // each tile is picked up at its own random moment: the numeral thins
      // evenly (never a partial that reads as another digit)
      const u = ease.inQuad(clamp((s - G0 - (G1 - G0 - 0.14) * rand(k, st.N, 5)) / 0.14, 0, 1));
      if (u >= 1) continue;
      const x = st.x[k] + (qx - st.x[k]) * u * 0.3, y = st.y[k] + (qy - st.y[k]) * u * 0.3;
      tile(M, x, y, st.tx[k], st.ty[k], LS[k] * (1 - u), st.a[k], st.b[k], HW * (1 - u), cost);
    }
  }
  // the stack where the new run begins
  if (s >= G0 && s < 60) {
    const n = Math.round(4 * progress(s, G0, G1));
    for (let j = 0; j < n; j++) tile(M, qx, qy - j * 2, 0, 1, 3, 0, 0, HW, cost);
  }
}

/** The new run after :00: its whole path pencilled first, then the cart sets a tile every 4 px. */
function layRun(strokes, s, cost) {
  const L0 = 0.05, L1 = 1.25;
  for (const st of strokes) {
    const A = (st.len + 6) * ease.inOutQuad(clamp((s - L0) / (L1 - L0), 0, 1));
    for (let k = st.N - 1; k >= 0; k--) {
      if (A >= st.arc[k] + 6) tile(M, st.x[k], st.y[k], st.tx[k], st.ty[k], ST, 0, 0, HW, cost);
      else if (s >= 0.12 * rand(k, st.N, 9)) {
        // a pencil tick across the run where this tile will stand
        const nx = -st.ty[k], ny = st.tx[k];
        for (let q = -1.5; q <= 1.5; q += 1) dot(M, st.x[k] + nx * q, st.y[k] + ny * q);
      }
    }
    const keep = s < 0.12 ? s / 0.12 : clamp(1 - (s - 1.3) / 0.3, 0, 1);
    if (keep <= 0) continue;
    if (st.closed) {
      const step = st.len / st.N, p = (A / step) % st.N, k = Math.floor(p), k2 = (k + 1) % st.N, u = p - k;
      cart(M, st.x[k] + (st.x[k2] - st.x[k]) * u, st.y[k] + (st.y[k2] - st.y[k]) * u, st.tx[k], st.ty[k], keep, cost);
    } else { along(st, A, AT); cart(M, AT.x, AT.y, AT.tx, AT.ty, keep, cost); }
  }
}
