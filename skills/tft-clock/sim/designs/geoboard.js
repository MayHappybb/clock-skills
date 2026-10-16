// Geoboard: the glass is a classroom geoboard, a navy plastic pegboard with
// 23 x 11 pegs, and the time is four rubber bands stretched over it. Each
// numeral is ONE band (geoboard-glyphs.js), doubled along a path of pegs, so
// every stroke is a fat taut strand pinned by the peg heads it straddles;
// curves are what a geoboard allows, straight pulls with every round corner
// cut by one diagonal cell. Hours sit high on the left, minutes low on the
// right, the way a kid lays them out; the colon is two little cream bands
// looped round single pegs.
//
// The time is alive: once a second the bands are strummed left to right.
// Each band has one strand pulled out and let go (it rings down, longer
// strands lower and wider), and the rest of the band rings in sympathy; the
// colon loops jump on the beat; a glint of light runs along every band.
// Every 15 s a bigger move: :15 a glissando (a strum front sweeps the board
// and plucks every strand it crosses), :30 the spare band parked in a free
// corner is drawn back and flicked, tumbling up the channel past the colon
// to the other corner (geoboard-spare.js), :45 "boing": each band in turn
// has its longest strand hauled far out and released. The ground is calm:
// two soft bars of window glare glide over the glossy board.
//
// Minute turn: from :59.25 the changing band is lifted while still on its
// old pegs: it thins, fades halfway into the board and its shadow drops away
// (the old numeral, whole, fading evenly). Then it slips off its pegs one by
// one along its length, each catch tugging back a hair, and travels as a
// thin, faint, slack loop (bowing, wriggling, contracted toward its middle):
// visibly a loose band in transit, never numeral-weight. Each part sweeps on
// an arc to its new peg, overshoots and snaps on, and the peg flashes; only
// once the LAST anchor has landed (after :00, by :00.75) is the band pulled
// taut, fat and bright again, with a twang. At every frame each slot's
// full-strength ink is either the whole old digit, the whole new one, or
// absent. The band never leaves the board.
// Hour: the spare band is shot on a long ricochet tour round both corners,
// pinging off pegs and twanging the bands it passes; then every band
// re-stretches in turn, hauled out round its pegs and snapped back.
//
// Palette: a classroom set, flat. Navy translucent plastic for the board
// (calm, dark, the LCD's glow suits it), pegs a lighter moulded blue lit from
// the top left; the four bands in the four loudest colours of a band tub
// (tomato, sunflower, lime, hot pink) so the time is the strongest contrast,
// each with a hard drop shadow on the board as its keyline; the spare in
// sky blue, the colon cream, so neither competes with the digits. Effects
// kept to what the world has: the glare, the glints, the peg flashes. At
// night the board and pegs sink to near-black navy and the glare fades;
// the bands keep their colour and the backlight dims to 45 %.
//
// Hard pixels for the board and pegs; AA for the bands (they glide and
// vibrate by fractions of a pixel) and the spare.
//
// Cost: one integer pass for the board and glare, 253 peg sprites, then
// each band as ~20-60 kit thick lines (AA) over its hard shadow. No caches;
// every frame is built cold from the clock.

import { clockFields, hash, sin, cos, to565, mix } from '../js/kit.js';
import { N, ANCHORS } from './geoboard-glyphs.js';
import { spareShape, SPARE_PTS, FLICK_T, TOUR_T, TOUR_PINGS, FLICK_PINGS } from './geoboard-spare.js';

const W = 160, H = 80;
const PITCH = 7, COLS = 23, ROWS = 11;
const PX = (i) => 3.5 + PITCH * i, PY = (j) => 5.5 + PITCH * j;
// slots: hours up-left, minutes down-right, the colon between them
const SLOTS = [{ c: 1, r: 0 }, { c: 6, r: 0 }, { c: 13, r: 4 }, { c: 18, r: 4 }];
const SLOT_CX = SLOTS.map((q) => PX(q.c) + 1.5 * PITCH), SLOT_CY = SLOTS.map((q) => PY(q.r) + 3 * PITCH);
const COLON = [[11, 4], [11, 6]];
const BAND_W = 5;

// ------------------------------------------------------------ palette
const BOARD_DAY = [0x1b2f6c, 0x243f84], BOARD_NIGHT = [0x0b1430, 0x0f1b40];
const PEG_DAY = [0x4f73c8, 0xa8c4f6, 0x0f1f52], PEG_NIGHT = [0x24397a, 0x4d69a8, 0x060d26];
const SHADOW_DAY = 0x0a1434, SHADOW_NIGHT = 0x040818;
const BANDS = [
  { c: 0xff4a32, l: 0xffc8b4 },   // tomato
  { c: 0xffc61a, l: 0xfff6c8 },   // sunflower
  { c: 0x8ee03c, l: 0xe6ffc8 },   // lime
  { c: 0xff4fa3, l: 0xffd2e8 },   // hot pink
];
const TINT = BANDS.map((q) => [0, 1, 2, 3].map((k) => mix(q.c, q.l, k * 0.09)));
const CREASE = BANDS.map((q) => mix(q.c, 0x1a0a20, 0.42));
const COLON_C = 0xfff1d0, SPARE_C = 0x58c8ff, FLASH_C = 0xe8f4ff;

// ------------------------------------------------------------ tables (flash)
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const LEVELS = 6;
const EXP = Float32Array.from({ length: 513 }, (_, i) => Math.exp(-i / 64));   // e^-x, x in 0..8
const decay = (x) => (x >= 8 ? 0 : EXP[(x * 64) | 0]);
const ss = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

// distinct segments of each digit as anchor pairs (k, k+1); the strands worth plucking; the pegs each straddles
const SEGS = ANCHORS.map((A) => {
  const out = [];
  for (let k = 0; k < N - 1; k++) {
    const dc = A[k + 1][0] - A[k][0], dr = A[k + 1][1] - A[k][1];
    if (dc || dr) {
      const n = gcd(Math.abs(dc), Math.abs(dr)), mid = [];
      for (let q = 1; q < n; q++) mid.push([A[k][0] + (dc / n) * q, A[k][1] + (dr / n) * q]);
      out.push({ k, len: Math.hypot(dc, dr) * PITCH, mid });
    }
  }
  return out;
});
function gcd(a, b) { return b ? gcd(b, a % b) : a; }
const PLUCK = SEGS.map((S) => S.filter((q) => q.len >= 12).map((q) => q.k));
const LONGEST = SEGS.map((S) => S.reduce((a, q) => (q.len > a.len ? q : a)));
// swing and pitch of a strand: longer rings lower and wider, peak speed held near 1 px a frame
const swing = (len, big) => Math.min(big ? 4 : 2.2, (big ? 0.2 : 0.11) * len);
const pitch = (len, A) => Math.min(Math.max(3.2, 150 / len), 62 / (6.2832 * A));

// ------------------------------------------------------------ the turn
// The band is lifted (thinned, dimmed, slack) over LIFT s while still on its
// old pegs, its anchors leave from T0, and it is only pulled taut and bright
// again once the last anchor has landed (TEND): in between it is a faint loose
// loop in transit, never a numeral-weight shape.
const T0 = -0.5, STAG = 0.012, LIFT = 0.25, PRE = 0.8, POST = 3;
const durOf = (dist) => Math.max(0.5, dist / 48);
function anchorMotion(P0, P1, Q0, Q1, i, u, out) {
  const dx = Q0 - P0, dy = Q1 - P1, dist = Math.sqrt(dx * dx + dy * dy);
  out.free = 0;
  if (dist < 0.5) { out.x = P0; out.y = P1; out.hookA = 1; out.hookB = 1; out.arr = -99; return; }
  const D = durOf(dist), st = T0 + i * STAG, v = (u - st) / D;
  out.arr = st + 0.88 * D;
  if (v <= 0) { out.x = P0; out.y = P1; out.hookA = 1; out.hookB = 0; return; }
  if (v >= 1) { out.x = Q0; out.y = Q1; out.hookA = 0; out.hookB = 1; return; }
  // smootherstep along an arc, a tug back as it slips off, an overshoot as it snaps on
  let b = v * v * v * (10 - 15 * v + 6 * v * v);
  if (v < 0.3) { const q = sin((Math.PI * v) / 0.3); b -= (1.2 / dist) * q * q; }
  if (v > 0.7) { const q = sin((Math.PI * (v - 0.7)) / 0.3); b += (1.6 / dist) * q * q; }
  const bc = b < 0 ? 0 : b > 1 ? 1 : b, bulge = 0.12 * dist * 4 * bc * (1 - bc);
  out.x = P0 + dx * b - (dy / dist) * bulge;
  out.y = P1 + dy * b + (dx / dist) * bulge;
  out.hookA = 1 - ss((v - 0.2) / 0.12);
  out.hookB = ss((v - 0.85) / 0.1);
  // how loose this part of the band is: it contracts while off the pegs
  out.free = ss((v - 0.08) / 0.32) * (1 - ss((v - 0.58) / 0.32));
}

/** When the last anchor of a from -> to turn lands, per pair (flash table, 100 floats). */
const TEND = new Float32Array(100);
for (let a = 0; a < 10; a++) for (let b = 0; b < 10; b++) {
  let e = 0;
  for (let i = 0; i < N; i++) {
    const dist = Math.hypot(ANCHORS[a][i][0] - ANCHORS[b][i][0], ANCHORS[a][i][1] - ANCHORS[b][i][1]) * PITCH;
    if (dist >= 0.5) e = Math.max(e, T0 + i * STAG + durOf(dist));
  }
  TEND[a * 10 + b] = e;
}
/** How far a band is in transit at u (0 taut on its pegs, 1 lifted and loose). */
const transit = (u, tEnd) => ss((u - (T0 - LIFT)) / LIFT) * (1 - ss((u - tEnd + 0.08) / 0.22));
const TAU_B = new Float32Array(4);

// ------------------------------------------------------------ vibration
const TD = 0.45;
/** Pulled out over `pull` s, let go, rings down. */
function pluckEnv(t, A, f, pull = 0.14) {
  if (t <= 0) return 0;
  if (t < pull) return A * ss(t / pull);
  const r = t - pull;
  return A * cos(6.2832 * f * r) * decay(r / TD);
}
/** Struck: starts from the rest position, rings down. */
function ringEnv(t, A, f) {
  if (t <= 0) return 0;
  return A * sin(6.2832 * f * t) * decay(t / TD);
}

// ------------------------------------------------------------ the hour
const TOUR_AT = 1.6, RESTRETCH_AT = TOUR_AT + TOUR_T + 0.5, HOUR_END = RESTRETCH_AT + 4 * 0.28 + 1.6;
const FLICK_AT = 30;
const nearestSlot = (x, y) => {
  let best = -1, bd = 26;
  for (let b = 0; b < 4; b++) { const d = Math.hypot(x - SLOT_CX[b], (y - SLOT_CY[b]) * 0.7); if (d < bd) { bd = d; best = b; } }
  return best;
};
const TOUR_HIT = TOUR_PINGS.map(([, x, y]) => nearestSlot(x, y));
const FLICK_HIT = FLICK_PINGS.map(([, x, y]) => nearestSlot(x, y));
const CHANNEL_K = { tour: 3, flick: 1 };   // the ping where the spare passes the colon

// ------------------------------------------------------------ scratch (RAM)
const AX = new Float32Array(N), AY = new Float32Array(N), HA = new Float32Array(N), HB = new Float32Array(N), ARR = new Float32Array(N);
const MO = { x: 0, y: 0, hookA: 0, hookB: 0, arr: 0, free: 0 };
const AMP = new Float32Array(N);
const SEGBUF = new Float32Array(4 * 4 * N * 4);   // x0 y0 x1 y1, per band
const SEGA = new Float32Array(4 * 4 * N);        // each piece's stretch (px of swing), for its tint
const SEGW = new Float32Array(4 * 4 * N);        // each piece's width: a strand lifted off its pegs is stretched thin
const SEGN = new Int32Array(4);
const CAPS = new Float32Array(3 * 160);
const PEGC = new Uint16Array(3), PEGRGB = [0, 0, 0];
const FL = new Float32Array(3 * 64);             // flashes: x, y, age

function ground(g, T, nt) {
  const c0 = mix(BOARD_DAY[0], BOARD_NIGHT[0], nt), c1 = mix(BOARD_DAY[1], BOARD_NIGHT[1], nt);
  const lut = new Uint16Array(LEVELS + 1);
  for (let k = 0; k <= LEVELS; k++) lut[k] = to565(mix(c0, c1, k / LEVELS));
  // window glare: the classroom windows' reflection, soft diagonal bars
  // (a wide pane, a narrow one) repeating every 96 px, gliding across the glossy board
  const p = (T * 26) % 96;
  const buf = g.buf;
  for (let y = 0; y < H; y++) {
    const d0 = -0.55 * y - p + 960;
    for (let x = 0; x < W; x++) {
      const d = (x + d0) % 96;
      const a = d < 9 ? d / 9 : d < 27 ? 1 : d < 31 ? 1 - ((d - 27) / 4) * 0.7 : d < 35 ? 0.3 + ((d - 31) / 4) * 0.4 : d < 41 ? 0.7 : d < 50 ? 0.7 * (1 - (d - 41) / 9) : 0;
      buf[y * W + x] = lut[(((a * LEVELS * 16) | 0) + BAYER[((y & 3) << 2) | (x & 3)]) >> 4];
    }
  }
  g.cost.px += W * H; g.cost.box += W * H * 3;
}

function pegs(g, nt) {
  for (let k = 0; k < 3; k++) { PEGRGB[k] = mix(PEG_DAY[k], PEG_NIGHT[k], nt); PEGC[k] = to565(PEGRGB[k]); }
  const buf = g.buf;
  for (let j = 0; j < ROWS; j++)
    for (let i = 0; i < COLS; i++) {
      const x = 3 + PITCH * i, y = 5 + PITCH * j, o = y * W + x;
      // a plastic post seen from above: lit top-left, rim shadow bottom-right
      buf[o - W - 1] = PEGC[1]; buf[o - W] = PEGC[0];
      buf[o - 1] = PEGC[0]; buf[o] = PEGC[0]; buf[o + 1] = PEGC[2];
      buf[o + W] = PEGC[2];
      if (y + 2 < H) buf[o + W + 1] = PEGC[2];
    }
  g.cost.blit += COLS * ROWS * 7; g.cost.calls += COLS * ROWS;
}

/** A peg head over a band: the band runs round its post, under it. */
function cap(g, x, y, a) {
  if (a <= 0.02) return;
  const xi = x | 0, yi = y | 0;
  if (xi < 1 || yi < 1 || xi > W - 2 || yi > H - 2) return;
  if (a >= 0.98) {
    const buf = g.buf, o = yi * W + xi;
    buf[o - W] = PEGC[0]; buf[o - 1] = PEGC[0]; buf[o] = PEGC[1]; buf[o + 1] = PEGC[2]; buf[o + W] = PEGC[2];
    g.cost.blit += 5;
  } else {
    g.pixel(xi, yi - 1, PEGRGB[0], { a }); g.pixel(xi - 1, yi, PEGRGB[0], { a }); g.pixel(xi, yi, PEGRGB[1], { a });
    g.pixel(xi + 1, yi, PEGRGB[2], { a }); g.pixel(xi, yi + 1, PEGRGB[2], { a });
  }
}

export default {
  name: 'Geoboard',
  blurb: 'A classroom geoboard: each numeral is one rubber band stretched over the pegs, strummed every second; at the minute the bands slip off peg by peg and snap onto the new numeral.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, nt = ctx.night;
    const ms = ctx.date.getTime(), T = (ms % 86400000) / 1000;
    ctx.lcd.backlight(1 - 0.55 * nt);
    const prv = clockFields(new Date(ms - 60000)), nxt = clockFields(new Date(ms + 60000));
    const cur = f.hh + f.mm, old = prv.hh + prv.mm, nw = nxt.hh + nxt.mm;
    const secT = Math.floor(T), minStart = T - s;
    const hourMin = f.m === 0, hourT = hourMin ? s : 99;   // seconds into the hour show

    // ---- the spare band: which corner it is parked in (one flight a minute, one more an hour), and its flight
    const lm = f.minuteKey - ctx.date.getTimezoneOffset();
    let par = f.minuteKey + Math.floor((lm - 1) / 60);
    let spareT = -9, spareFrom = -1, tour = false;
    if (hourMin && s >= TOUR_AT - 0.6 && s < TOUR_AT + TOUR_T + 0.6) { spareFrom = par & 1; spareT = s - TOUR_AT; tour = true; }
    if (hourMin && s >= TOUR_AT) par++;
    if (!tour && s >= FLICK_AT - 0.6 && s < FLICK_AT + FLICK_T + 0.6) { spareFrom = par & 1; spareT = s - FLICK_AT; }
    if (s >= FLICK_AT) par++;
    if (spareFrom < 0) spareFrom = par & 1;
    const flightT = tour ? TOUR_T : FLICK_T;

    ground(g, T, nt);
    pegs(g, nt);

    // ---- the colon: two loops of cream band round single pegs, jumping on the beat
    const beatP = T - secT;
    for (let q = 0; q < 2; q++) {
      const [ci, cj] = COLON[q];
      const e = beatP < 0.1 ? ss(beatP / 0.1) : decay((beatP - 0.1) / 0.15);
      let r = 2.6 + 0.6 * e;
      // the spare brushes past the colon on its way up the channel: the loops wobble
      if (spareT > 0) {
        const P = tour ? TOUR_PINGS : FLICK_PINGS, k = tour ? CHANNEL_K.tour : CHANNEL_K.flick;
        const tp = spareFrom === 1 ? flightT - P[k][0] : P[k][0];
        if (spareT > tp) r += 0.5 * decay((spareT - tp) * 3) * sin((spareT - tp) * 30);
      }
      g.ring(PX(ci), PY(cj), r - 0.8, r + 0.8, COLON_C, { aa: true });
      cap(g, PX(ci), PY(cj), 1);
    }

    const shadow = mix(SHADOW_DAY, SHADOW_NIGHT, nt), boardMid = mix(mix(BOARD_DAY[0], BOARD_DAY[1], 0.3), mix(BOARD_NIGHT[0], BOARD_NIGHT[1], 0.3), nt);
    let ncap = 0, nfl = 0;
    const addCap = (x, y, a) => { if (ncap < 160 && a > 0.02) { CAPS[ncap * 3] = x; CAPS[ncap * 3 + 1] = y; CAPS[ncap * 3 + 2] = a; ncap++; } };
    for (let b = 0; b < 4; b++) {
      const sl = SLOTS[b], ox = PX(sl.c), oy = PY(sl.r), cx = SLOT_CX[b], cy = SLOT_CY[b];
      let from = +cur[b], to = from, u = 99;
      if (s >= 60 - PRE && cur[b] !== nw[b]) { from = +cur[b]; to = +nw[b]; u = s - 60; }
      else if (s < POST && old[b] !== cur[b]) { from = +old[b]; to = +cur[b]; u = s; }
      const AF = ANCHORS[from], AT = ANCHORS[to], moving = from !== to;
      const tEnd = TEND[from * 10 + to], tau = moving ? transit(u, tEnd) : 0;
      TAU_B[b] = tau;
      for (let i = 0; i < N; i++) {
        const P0 = ox + AF[i][0] * PITCH, P1 = oy + AF[i][1] * PITCH;
        if (!moving) { AX[i] = P0; AY[i] = P1; HA[i] = 1; HB[i] = 1; ARR[i] = -99; continue; }
        anchorMotion(P0, P1, ox + AT[i][0] * PITCH, oy + AT[i][1] * PITCH, i, u, MO);
        // a released band contracts: its loose parts are drawn in toward the middle
        const kc = 1 - 0.2 * MO.free;
        AX[i] = cx + (MO.x - cx) * kc; AY[i] = cy + (MO.y - cy) * kc; HA[i] = MO.hookA; HB[i] = MO.hookB; ARR[i] = MO.arr;
        // the peg it lands on flashes
        if (MO.arr > -90 && u > MO.arr - 0.05 && u < MO.arr + 0.4 && nfl < 64 && (i === N - 1 || AT[i + 1][0] !== AT[i][0] || AT[i + 1][1] !== AT[i][1])) {
          FL[nfl * 3] = ox + AT[i][0] * PITCH; FL[nfl * 3 + 1] = oy + AT[i][1] * PITCH; FL[nfl * 3 + 2] = u - MO.arr + 0.05; nfl++;
        }
      }
      // the hour's re-stretch: each band hauled out round its pegs and snapped back
      const rs = hourT - RESTRETCH_AT - b * 0.28;
      if (rs > 0 && rs < 1) for (let i = 0; i < N; i++) {
        const x = (rs - i * 0.012) / 0.6;
        if (x <= 0 || x >= 1) continue;
        const q = sin(Math.PI * x), k = 1 + (2.6 * q * q) / 24;
        AX[i] = cx + (AX[i] - cx) * k; AY[i] = cy + (AY[i] - cy) * k;
      }

      // ---- vibration amplitude per anchor pair
      for (let k = 0; k < N - 1; k++) AMP[k] = 0;
      const dRest = moving ? (u < 0 ? from : to) : from;
      for (let n = secT - 2; n <= secT; n++) {
        const inCur = n >= minStart - 0.001, sec = ((Math.round(n - minStart) % 60) + 60) % 60;
        const d = inCur ? +cur[b] : +old[b];
        const changing = inCur ? cur[b] !== nw[b] : old[b] !== cur[b];
        if (changing && (sec === 59 || sec === 0 || sec === 1)) continue;
        if (sec === 15 || sec === 16 || sec === 45 || sec === 46) continue;   // the flourishes play instead
        if (inCur && hourMin && sec >= RESTRETCH_AT - 1 && sec < HOUR_END) continue;   // the re-stretch plays instead
        if (d !== dRest) continue;
        const list = PLUCK[d], kk = list[hash(n, b, 7) % list.length];
        const t = T - (n + b * 0.07);
        if (t <= 0) continue;
        for (const q of SEGS[d]) {
          const A = swing(q.len), fq = pitch(q.len, A);
          AMP[q.k] += q.k === kk ? pluckEnv(t, A, fq) : ringEnv(t - 0.14, 0.95, fq * 1.1);
        }
      }
      if (!moving) {
        // :15 glissando: a front sweeps the board left to right, plucking every strand it crosses
        const gl = s - 15;
        if (gl > 0 && gl < 3.5) for (const q of SEGS[from]) {
          const mx = (AX[q.k] + AX[q.k + 1]) / 2, A = swing(q.len) * 0.9;
          AMP[q.k] += pluckEnv(gl - mx / 120, A, pitch(q.len, A), 0.1);
        }
        // :45 boing: each band in turn has its longest strand hauled far out and let go
        const bo = s - 45 - b * 0.3;
        if (bo > 0 && bo < 3.5) {
          const q = LONGEST[from], A = swing(q.len, true);
          AMP[q.k] += pluckEnv(bo, A, pitch(q.len, A), 0.4);
          for (const z of SEGS[from]) if (z !== q) AMP[z.k] += ringEnv(bo - 0.4, 0.6, pitch(z.len, 0.6));
        }
        // the spare's pings twang the band they pass
        if (spareT > 0) {
          const P = tour ? TOUR_PINGS : FLICK_PINGS, HIT = tour ? TOUR_HIT : FLICK_HIT;
          for (let k = 0; k < P.length; k++) {
            const tp = spareFrom === 1 ? flightT - P[k][0] : P[k][0];
            if (HIT[k] === b && spareT > tp) for (const z of SEGS[from]) AMP[z.k] += ringEnv(spareT - tp, 1.2, pitch(z.len, 1.2));
          }
        }
        // after the re-stretch every strand rings
        if (rs > 0.6) for (const z of SEGS[from]) AMP[z.k] += ringEnv(rs - 0.6, 1.4, pitch(z.len, 1.4));
      } else for (let k = 0; k < N - 1; k++) {
        // every strand the turn pulls taut rings as its second end snaps on
        const ta = Math.max(ARR[k], ARR[k + 1]);
        if (u > ta) AMP[k] += ringEnv(u - ta, 0.8, 5);
        // and the whole band twangs as it is pulled taut again
        if (u > tEnd) AMP[k] += ringEnv(u - tEnd, 1.3, 4.5);
      }

      // ---- build the strokes
      let nseg = 0;
      const base = b * 4 * N * 4;
      for (let k = 0; k < N - 1; k++) {
        const x0 = AX[k], y0 = AY[k], x1 = AX[k + 1], y1 = AY[k + 1];
        const dx = x1 - x0, dy = y1 - y0, len = Math.sqrt(dx * dx + dy * dy);
        if (len < 0.3) continue;
        // displacement points outward from the digit's centre; the side is a
        // continuous function of the geometry, so a strand that swings across
        // the centre mid-turn fades through zero instead of flipping
        const nx = -dy / len, ny = dx / len;
        let side = (((x0 + x1) / 2 - cx) * nx + ((y0 + y1) / 2 - cy) * ny) / 3;
        side = side < -1 ? -1 : side > 1 ? 1 : side;
        const short = len < 10 ? len / 10 : 1;
        // in transit the band hangs slack: each strand bows and drifts
        // (a bow and an S-wriggle, both drifting: a loose band, not a straight stroke)
        const sag = tau > 0 ? tau * 1.6 * sin(T * 6.5 + k * 1.7 + b) : 0;
        const wig = tau > 0 ? tau * 1.5 * sin(T * 8.3 + k * 2.3 + b * 2) * short : 0;
        const a = (AMP[k] * side + sag) * short;
        let o = base + nseg * 4;
        const aa = Math.abs(a);
        const wd = BAND_W - (BAND_W - 1.8) * tau;
        if (aa < 0.2 && Math.abs(wig) < 0.2) { SEGBUF[o] = x0; SEGBUF[o + 1] = y0; SEGBUF[o + 2] = x1; SEGBUF[o + 3] = y1; SEGA[b * 4 * N + nseg] = aa; SEGW[b * 4 * N + nseg] = wd; nseg++; continue; }
        let px = x0, py = y0;
        for (let q = 1; q <= 4; q++) {
          const w = q / 4, off = a * (q === 2 ? 1 : q === 4 ? 0 : 0.7071) + (q === 1 ? wig : q === 3 ? -wig : 0);
          const qx = x0 + dx * w + nx * off, qy = y0 + dy * w + ny * off;
          o = base + nseg * 4; SEGBUF[o] = px; SEGBUF[o + 1] = py; SEGBUF[o + 2] = qx; SEGBUF[o + 3] = qy; SEGA[b * 4 * N + nseg] = aa; SEGW[b * 4 * N + nseg] = wd; nseg++;
          px = qx; py = qy;
        }
      }
      SEGN[b] = nseg;

      // ---- caps: the peg heads the band is hooked round, and the ones it straddles
      const lift = rs > 0 && rs < 1 ? 0 : 1;   // lifted off during the re-stretch
      for (let pass = 0; pass < (moving ? 2 : 1); pass++) {
        const D0 = pass ? to : from, Hs = pass ? HB : HA, A = ANCHORS[D0];
        for (const q of SEGS[D0]) {
          const a = Math.min(Hs[q.k], Hs[q.k + 1]) * lift;
          if (a > 0.02) for (const [c, r] of q.mid) addCap(ox + c * PITCH, oy + r * PITCH, a);
        }
        for (let i = 0; i < N; i++) {
          if (i > 0 && A[i][0] === A[i - 1][0] && A[i][1] === A[i - 1][1]) continue;
          if (pass && HA[i] === 1 && HB[i] === 1) continue;   // never moved: drawn in the first pass
          addCap(ox + A[i][0] * PITCH, oy + A[i][1] * PITCH, Hs[i] * lift);
        }
      }
    }

    // ---- draw: shadows, bands, peg heads, glints
    for (let b = 0; b < 4; b++) {
      const base = b * 4 * N * 4;
      for (let q = 0; q < SEGN[b]; q++) {
        const o = base + q * 4;
        // a lifted band's shadow falls further from it
        const sx = 1 + 1.5 * TAU_B[b], sy = 1.2 + 1.5 * TAU_B[b];
        g.thickLine(SEGBUF[o] + sx, SEGBUF[o + 1] + sy, SEGBUF[o + 2] + sx, SEGBUF[o + 3] + sy, SEGW[b * 4 * N + q], shadow);
      }
    }
    for (let b = 0; b < 4; b++) {
      const base = b * 4 * N * 4, tau = TAU_B[b];
      // in transit the band fades halfway into the board: a loose loop, not a numeral
      // (the colour goes quickly, over the first 40 % of the lift, so the band reads as one thing fading, never a part of a digit)
      const col = tau > 0 ? mix(BANDS[b].c, boardMid, 0.58 * ss(tau / 0.4)) : BANDS[b].c;
      for (let q = 0; q < SEGN[b]; q++) {
        const o = base + q * 4;
        // stretched rubber pales: a strand swinging out goes a shade lighter (integer mix, 8 steps)
        const k = tau > 0 ? 0 : Math.min(3, (SEGA[b * 4 * N + q] * 1.6) | 0);
        g.thickLine(SEGBUF[o], SEGBUF[o + 1], SEGBUF[o + 2], SEGBUF[o + 3], SEGW[b * 4 * N + q], k ? TINT[b][k] : col, { aa: true });
      }
    }
    // the crease between the band's two strands (it is doubled round the pegs)
    for (let b = 0; b < 4; b++) {
      const base = b * 4 * N * 4, cr = CREASE[b], ca = 0.75 * (1 - TAU_B[b]);
      if (ca < 0.05) continue;
      for (let q = 0; q < SEGN[b]; q++) {
        const o = base + q * 4;
        g.thickLine(SEGBUF[o], SEGBUF[o + 1], SEGBUF[o + 2], SEGBUF[o + 3], 1.1, cr, { aa: true, a: ca });
      }
    }
    for (let q = 0; q < ncap; q++) cap(g, CAPS[q * 3], CAPS[q * 3 + 1], CAPS[q * 3 + 2]);
    for (let b = 0; b < 4; b++) glint(g, b, T);

    // ---- the spare band, parked or flying
    const n = spareShape(spareT, spareFrom, tour);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      g.thickLine(SPARE_PTS[i * 2] + 1, SPARE_PTS[i * 2 + 1] + 1, SPARE_PTS[j * 2] + 1, SPARE_PTS[j * 2 + 1] + 1, 1.8, shadow);
    }
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      g.thickLine(SPARE_PTS[i * 2], SPARE_PTS[i * 2 + 1], SPARE_PTS[j * 2], SPARE_PTS[j * 2 + 1], 1.8, SPARE_C, { aa: true });
    }
    {
      // its two peg heads, while it is on them
      const on = spareT <= -0.6 ? 1 : spareT <= 0 ? 1 : spareT < 0.12 ? 1 - spareT / 0.12 : spareT > flightT + 0.3 ? Math.min(1, (spareT - flightT - 0.3) / 0.15) : 0;
      const pk = spareT <= 0.2 ? spareFrom : 1 - spareFrom, row = pk === 0 ? 9 : 1, c0 = pk === 0 ? 3 : 18;
      cap(g, PX(c0), PY(row), on); cap(g, PX(c0 + 1), PY(row), on);
    }
    // the spare's pings off pegs
    if (spareT > 0) {
      const P = tour ? TOUR_PINGS : FLICK_PINGS;
      for (const [tp0, x, y] of P) {
        const tp = spareFrom === 1 ? flightT - tp0 : tp0, age = spareT - tp;
        if (age > 0 && age < 0.45 && nfl < 64) { FL[nfl * 3] = Math.round((x - 3.5) / 7) * 7 + 3.5; FL[nfl * 3 + 1] = Math.round((y - 5.5) / 7) * 7 + 5.5; FL[nfl * 3 + 2] = age; nfl++; }
      }
    }
    // ---- peg flashes: a ring of light off the peg head
    for (let q = 0; q < nfl; q++) {
      const age = FL[q * 3 + 2];
      if (age <= 0 || age >= 0.4) continue;
      const r = 1.8 + 8 * age, a = 0.6 * (1 - age / 0.4);
      g.ring(FL[q * 3], FL[q * 3 + 1], r - 0.6, r + 0.6, FLASH_C, { aa: true, a: a * (1 - 0.4 * nt) });
    }
  },
};

/** A glint of light running along the band: a short bright dash on its lit side. */
function glint(g, b, T) {
  const base = b * 4 * N * 4, n = SEGN[b];
  let L = 0;
  for (let q = 0; q < n; q++) { const o = base + q * 4; const dx = SEGBUF[o + 2] - SEGBUF[o], dy = SEGBUF[o + 3] - SEGBUF[o + 1]; L += Math.sqrt(dx * dx + dy * dy); }
  const gp = ((T * 75 + b * 61) % 170) - 10;   // a fixed cycle: a glint never jumps when the band's length changes
  if (gp < -6 || gp > L + 6) return;
  const lo = gp - 4, hi = gp + 4, col = BANDS[b].l, ga = 0.9 * (1 - TAU_B[b]);
  if (ga < 0.05) return;
  let acc = 0;
  for (let q = 0; q < n; q++) {
    const o = base + q * 4, x0 = SEGBUF[o], y0 = SEGBUF[o + 1], dx = SEGBUF[o + 2] - x0, dy = SEGBUF[o + 3] - y0;
    const len = Math.sqrt(dx * dx + dy * dy);
    const a0 = Math.max(lo, acc), a1 = Math.min(hi, acc + len);
    if (a1 > a0 && len > 0) {
      const u0 = (a0 - acc) / len, u1 = (a1 - acc) / len;
      g.thickLine(x0 + dx * u0 - 0.7, y0 + dy * u0 - 0.7, x0 + dx * u1 - 0.7, y0 + dy * u1 - 0.7, 1.6, col, { aa: true, a: ga });
    }
    acc += len;
    if (acc > hi) break;
  }
}
