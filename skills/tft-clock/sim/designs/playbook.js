// Playbook: a coach's chalkboard, green-black slate over a wooden chalk
// ledge, and the time is tonight's play. Each numeral is one receiver's
// route chalked in a single line (playbook-glyphs.js: slanted hand, chalk
// wider where pressed, the playbook's own notation on the ends: arrowheads
// where the route keeps going on 2, 7 and 9, a block "T" where it stops on
// 1 and 4; 0 and 8 are loops). The offence (hours, up left, yellow O's) and
// the defence (minutes, down right, pink X's) face each other across the
// dashed blue line of scrimmage, with the football on its spot between them.
// The time lies on one diagonal of the strip and the play on the other: a
// back in pre-snap motion bottom left, two safeties drifting top right.
//
// The time is alive every second. On each whistle every route's player
// sprints a quarter of the route along the chalk itself, skids past its
// mark and settles (a puff of dust); the defence reads the play and goes
// 0.15 s later. Open routes are run out to the arrow and back, loops are
// circled. Running lays fresh chalk: a bright, dense streak follows each
// player along its digit and dulls behind it. The chalk itself boils as
// chalk animation does (the grain is redrawn 8 times a second, the board's
// residue 4 times), so the strokes' edges and tooth are never still while
// their shape is. Every 15 s a pass play: the ball leaves its spot in a
// lob to one of the players, chalking a dashed flight line, is caught with
// a burst of tick marks, and is lobbed back.
//
// Minute turn: from :57.9 the felt eraser lifts off the ledge and scrubs
// the changing digits; their chalk goes to grey smear and away by a fixed
// pixel rank (even thinning, never a partial shape), leaving a fresh haze
// of residue that fades over the next seconds; by :59.85 the slots are
// clean. After :00 the coach sketches the new route lightly in full, then
// four players dab in on it and each runs one quarter at once, laying the
// chalk (so every part of the digit grows together), then the notation
// goes on and three of them leave. Midnight works all four slots at once.
// Hour: the big play. A second player joins every long route and the whole
// team runs laps of the time; the ball goes hand to hand through all four
// digits in dashed lobs, hours to minutes, ends in a touchdown on the last
// one, the coach slaps the board, every digit shudders a pixel and sheds
// chalk dust, and the ball is lobbed back to its spot.
//
// Palette: what a classroom board holds: the slate's green-black (#1c2a23,
// an LCD dark that glows a little) and two residue tones, white chalk in
// four densities (dusted, laid, fresh, thin), and a few coloured sticks:
// yellow for the offence, pink for the defence, blue for lines, orange for
// the ball; the wood of the ledge and the eraser. All hard pixels, with the
// chalk's tooth as the only texture. White chalk is the strongest contrast
// on the glass; the coloured players are calmer, the dim corner players
// calmer still. Night: the backlight drops to 40 % and the board's residue
// thins, so the chalk stays clean on a quiet slate.
//
// Cost: the board is one integer pass (residue map against the grain);
// each digit is one pass over its 34 x 52 box looking up a signed distance
// and an arc-length byte (flash), with a grain lookup or two per pixel;
// players and the ball are small masks. No per-pixel callbacks, no
// per-minute caches: every frame is built cold. Flash: glyph maps 35 KB,
// route samples ~7 KB, residue map 12 KB, grain/rank/residue masks ~8 KB:
// ~62 KB. RAM beyond the frame buffer: well under 1 KB.
import { clockFields, hash, rand, rng, noise, noise2, to565, ease } from '../js/kit.js';
import { GLYPHS, GW, GH, PAD, along } from './playbook-glyphs.js';

const W = 160, H = 80, BH = 74;        // board rows 0..73, the chalk tray below

// ------------------------------------------------------------ palette
const C = {
  board: 0x1c2a23, hz1: 0x24342c, hz2: 0x2d3e35,
  dust: 0xc4cbc1, chalk: 0xe2e6dc, fresh: 0xfafbf3, thin: 0x8f9a91, smear: 0x56645b, guide: 0x4a5a51,
  yel: 0xf0d25a, yelThin: 0xa89640, pink: 0xf08aa8, pinkThin: 0xa86478,
  yelDim: 0xa89a4e, yelDimThin: 0x6e6a3c, pinkDim: 0xa86a80, pinkDimThin: 0x6e4c58,
  blue: 0x6fb2d8, blueThin: 0x4a7a96, ball: 0xd9874a, ballThin: 0x9a6038,
  wood: 0x6f4d30, woodHi: 0xa87c50, woodLo: 0x5a3e26, woodSh: 0x3a281a,
  felt: 0x4a4a54, feltDust: 0x8c8e8a, back: 0xb48858, backLo: 0x8a6440,
};
const P = {};
for (const k in C) P[k] = to565(C[k]);

// ------------------------------------------------------------ flash tables
// clumpy chalk grain, 64 x 64, 0..255
const GRAIN = new Uint8Array(64 * 64);
for (let y = 0; y < 64; y++)
  for (let x = 0; x < 64; x++) {
    const v = 0.55 * rand(x, y, 7) + 0.45 * noise2(x / 1.7, y / 1.7, 9);
    GRAIN[y * 64 + x] = Math.min(255, Math.max(0, Math.round((v - 0.05) * 290)));
  }
// eraser residue on the board: long soft swashes, 0..150 (static: the board's history)
const HAZE = new Uint8Array(W * BH);
{
  const r = rng(424242);
  const acc = new Float32Array(W * BH);
  for (let k = 0; k < 16; k++) {
    const cx = r() * 170 - 5, cy = r() * 80 - 3, len = 25 + r() * 45, th = 3 + r() * 6, ang = (r() - 0.5) * 0.5, amp = 40 + r() * 60;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    for (let y = 0; y < BH; y++)
      for (let x = 0; x < W; x++) {
        const dx = x - cx, dy = y - cy, u = dx * ca + dy * sa, v = -dx * sa + dy * ca;
        const eu = Math.max(0, Math.abs(u) - len / 2), q = (eu * eu) / 60 + (v * v) / (th * th);
        if (q < 4) acc[y * W + x] += amp * Math.exp(-q) * (0.7 + 0.6 * noise(u / 3, k));
      }
  }
  for (let i = 0; i < W * BH; i++) HAZE[i] = Math.min(150, acc[i]);
}
// erase / reveal rank inside a glyph box, clumpy, 0..255
const RANK = new Uint8Array(GW * GH);
for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) RANK[y * GW + x] = Math.round(255 * (0.5 * rand(x, y, 31) + 0.5 * noise2(x / 2.3, y / 2.3, 33)));
// fresh residue where the eraser just scrubbed a slot: streaks across a soft blob
const RES = new Uint8Array(GW * GH);
for (let y = 0; y < GH; y++)
  for (let x = 0; x < GW; x++) {
    const b = Math.exp(-(((x - 17) / 14) ** 2) - (((y - 26) / 22) ** 2));
    RES[y * GW + x] = Math.round(230 * b * (0.45 + 0.55 * noise(y / 2.2, 5)));
  }

// player marks, 9 x 9 masks: the O (offence) and the X (defence)
const RING = new Uint8Array(81), CROSS = new Uint8Array(81);
for (let y = 0; y < 9; y++)
  for (let x = 0; x < 9; x++) {
    const dx = x - 4, dy = y - 4, r = Math.sqrt(dx * dx + dy * dy);
    RING[y * 9 + x] = r <= 4.3 && r >= 2.4 ? 1 : 0;
    CROSS[y * 9 + x] = Math.abs(dx - dy) <= 1 || Math.abs(dx + dy) <= 1 ? (r <= 4.9 ? 1 : 0) : 0;
  }

// ------------------------------------------------------------ layout
// hours up-left, minutes down-right: the time on one diagonal, the play on the other
const SLOT = [[6, 3], [35, 3], [99, 26], [128, 26]];   // slot (26 x 44) top-left
const LOS_X = 79, BALL_X = 80, BALL_Y = 37;
const MOTION = [[12, 60], [56, 62]];                    // the back's pre-snap motion, bottom left
const SAFETY = [[114, 9, 0.0], [143, 12, 2.1]];        // the deep defence, top right
const ERASER_HOME = [18, 68];

const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const prog = (v, a, b) => (v <= a ? 0 : v >= b ? 1 : (v - a) / (b - a));
const frac = (x) => x - Math.floor(x);

// ------------------------------------------------------------ timing
const ER0 = 58.75, ER1 = 59.85;          // the eraser takes the old digit
const GD0 = 0.0, GD1 = 0.3;              // the coach's light guide of the new one
const RN0 = 0.3, RN1 = 1.5;              // four runners chalk it in, a quarter each
const NT0 = 1.35, NT1 = 1.7;             // the notation (arrow, block)
const REST = 2.0;                        // the route's own runner takes over
const PASSES = [15, 30, 45];             // a pass play every quarter minute
const BIG0 = 50;                                     // the hour's big play, on the old hour's last seconds
const HR_RUN0 = 51.0, HR_RUN1 = 57.5, HR_LAPS = 16;  // the whole team runs laps of the time (16 = whole cycles)
const RELAY = [53.4, 54.5, 55.6, 56.7, 57.8];        // ...and the ball goes hand to hand through it
const CR0 = 58.0, CR1 = 59.4;                        // the slap shakes the old digits off the board as dust

/** Epoch seconds when slot i's current digit was drawn (the start of its value's run). */
function drawnAt(i, f, m0) {
  const sinceMin = i === 3 ? 0 : i === 2 ? f.m % 10 : i === 1 ? f.m : (f.h % 10) * 60 + f.m;
  return m0 - sinceMin * 60;
}

// a beat: whistle (hold), sprint with a skid past the mark, settle
function sprint(p) {
  if (p < 0.1) return 0;
  if (p < 0.65) return ease.outBack((p - 0.1) / 0.55);
  return 1;
}

/** Arc position and direction of a runner `v` quarter-routes along: loops circle, open routes go out and back. */
function uOf(gl, v) {
  const D = gl.L / 4;
  if (gl.loop) { let u = (v * D) % gl.L; if (u < 0) u += gl.L; return [u, 1]; }
  let w = v % 8; if (w < 0) w += 8;
  return w <= 4 ? [w * D, 1] : [(8 - w) * D, -1];
}

/**
 * Everything about slot i at second s of this minute: the digit, its job
 * (erase / draw), and its runners [u, dir, keep].
 */
function plan(i, s, M) {
  const d = M.cur[i], gl = GLYPHS[d];
  const big = M.pre && s >= BIG0;
  let job = null;
  const runners = [];
  const changed = M.old[i] !== d;
  if (changed && s < REST) {
    const fr = ease.inOutQuad(prog(s, RN0, RN1));
    job = { draw: { guide: smooth(prog(s, GD0, GD1)), f: fr, note: prog(s, NT0, NT1) } };
    for (let j = 0; j < 4; j++) {
      let keep = smooth(prog(s, 0.08, 0.3));
      if (j > 0) keep *= 1 - smooth(prog(s, 1.55, 1.9));
      const [u, dir] = uOf(gl, j + fr);
      runners.push([u, dir, keep]);
    }
    return { gl, job, runners };
  }
  const b = M.m0 + s - M.drawn[i] - REST - (i >= 2 ? 0.15 : 0);   // the defence reads the play a beat behind
  const n = Math.floor(b);
  const beatP = b - n;
  let v = 1 + n + sprint(beatP);
  if (big) v += HR_LAPS * ease.inOutQuad(prog(s, HR_RUN0, HR_RUN1));
  runners.push([...uOf(gl, v), 1]);
  // the hour's big play: a second man on every long route, half a route away
  if (big && gl.L > 80) {
    const keep = smooth(prog(s, BIG0, BIG0 + 0.6)) * (1 - smooth(prog(s, CR0, CR0 + 0.6)));
    if (keep > 0) runners.push([...uOf(gl, v + (gl.loop ? 2 : 4)), keep]);
  }
  if (M.pre && s >= CR0 && M.nw[i] !== d) job = { erase: ease.inOutQuad(prog(s, CR0, CR1)), crumble: true };
  else if (!M.pre && s >= ER0 && M.nw[i] !== d) job = { erase: ease.inOutQuad(prog(s, ER0, ER1)) };
  return { gl, job, runners, beatP, beatN: n };
}

/** Screen position of runner j of slot i at second s. */
function runnerXY(i, j, s, M) {
  const p = plan(i, s, M), r = p.runners[Math.min(j, p.runners.length - 1)];
  const [x, y] = along(p.gl, r[0]);
  return [SLOT[i][0] - PAD + x, SLOT[i][1] - PAD + y];
}

// ------------------------------------------------------------ the ball's flights
/** A lob from a to b: [x, y] at t 0..1 (a quadratic arc over the top). */
function lob(a, b, t, lift) {
  const cx = (a[0] + b[0]) / 2, cy = Math.max(-4, Math.min(a[1], b[1]) - lift);
  const u = 1 - t;
  return [u * u * a[0] + 2 * u * t * cx + t * t * b[0], u * u * a[1] + 2 * u * t * cy + t * t * b[1]];
}

/** Where the ball is, and the dashed flight lines it has chalked: { x, y, flights: [{a, b, lift, t, keep}], burst } */
function ballState(s, M) {
  const home = [BALL_X, BALL_Y];
  const out = { x: home[0], y: home[1], flights: [], burst: null };
  if (M.pre && s >= BIG0) {
    // the big play: the ball goes hand to hand through the time, then back to the spot
    for (let k = 0; k < 4; k++) {
      const t0 = RELAY[k], t1 = RELAY[k + 1];
      const a = k === 0 ? home : runnerXY(k - 1, 0, t0, M), b = runnerXY(k, 0, t1, M);
      if (s < t0) break;
      const t = ease.inOutQuad(prog(s, t0, t1)), keep = 1 - prog(s, t1 + 0.6, t1 + 1.4);
      out.flights.push({ a, b, lift: 12, t, keep });
      if (s < t1) { [out.x, out.y] = lob(a, b, t, 12); return out; }
    }
    if (s >= RELAY[0]) {
      const tdAt = RELAY[4];
      if (s < tdAt + 1.0) {
        [out.x, out.y] = runnerXY(3, 0, s, M);
        out.y -= 2 * Math.abs(Math.sin((s - tdAt) * 9)) * (1 - prog(s, tdAt, tdAt + 1));
        out.burst = { x: out.x, y: out.y, t: s - tdAt, big: true };
        return out;
      }
      const a = runnerXY(3, 0, tdAt + 1.0, M), t = ease.inOutQuad(prog(s, tdAt + 1.0, tdAt + 2.0));
      if (t < 1) { [out.x, out.y] = lob(a, home, t, 10); return out; }
    }
    return out;
  }
  for (let k = 0; k < PASSES.length; k++) {
    const t0 = PASSES[k];
    if (s < t0 || s > t0 + 2.8) continue;
    const slot = (hash(M.mk, k, 17) + k) % 4;
    const catchAt = t0 + 1.0;
    const rec = runnerXY(slot, 0, catchAt, M);
    const keep = 1 - prog(s, catchAt + 0.7, catchAt + 1.6);
    if (s < catchAt) {
      const t = ease.inOutQuad(prog(s, t0, catchAt));
      out.flights.push({ a: home, b: rec, lift: 16, t, keep: 1 });
      [out.x, out.y] = lob(home, rec, t, 16);
      return out;
    }
    out.flights.push({ a: home, b: rec, lift: 16, t: 1, keep });
    if (s < catchAt + 0.5) {
      [out.x, out.y] = runnerXY(slot, 0, s, M);
      out.burst = { x: out.x, y: out.y, t: s - catchAt, big: false };
      return out;
    }
    const a = runnerXY(slot, 0, catchAt + 0.5, M), t = ease.inOutQuad(prog(s, catchAt + 0.5, catchAt + 1.4));
    if (t < 1) [out.x, out.y] = lob(a, home, t, 6);
    return out;
  }
  return out;
}

// ------------------------------------------------------------ the eraser
function eraserAt(s, M, wipe = s >= 50 ? M.toNew : M.fromOld) {
  if (s >= 50 ? M.pre : M.post) return [ERASER_HOME[0], ERASER_HOME[1], false];   // the hour's slap needs no eraser
  if (!wipe.length || !(s > 57.9 || s < 0.9)) return [ERASER_HOME[0], ERASER_HOME[1], false];
  let x0 = 999, y0 = 999, x1 = -999, y1 = -999;
  for (const i of wipe) { const [sx, sy] = SLOT[i]; x0 = Math.min(x0, sx); y0 = Math.min(y0, sy); x1 = Math.max(x1, sx + 26); y1 = Math.max(y1, sy + 44); }
  const cx = (x0 + x1) / 2 - 8, cy = (y0 + y1) / 2 - 3, ax = (x1 - x0) / 2 - 4, ay = (y1 - y0) / 2 - 6;
  const fx = 2.4 * Math.min(1, 9 / ax), fy = 0.9 * Math.min(1, 17 / ay);
  const scrub = (t) => [cx + ax * Math.sin(t * 2 * Math.PI * fx), cy + ay * Math.sin(t * 2 * Math.PI * fy + 1)];
  const [hx, hy] = ERASER_HOME;
  if (s > 57.9 && s < ER0) {
    const u = ease.inOutQuad(prog(s, 57.9, ER0)), [tx, ty] = scrub(0);
    return [hx + (tx - hx) * u, hy + (ty - hy) * u - 6 * Math.sin(Math.PI * u), false];
  }
  if (s >= ER0 && s < ER1) { const [x, y] = scrub(s - ER0); return [x, y, true]; }
  const ss = s < 50 ? s + 60 : s, [tx, ty] = scrub(ER1 - ER0), u = ease.inOutQuad(prog(ss, ER1, 60.9));
  return [tx + (hx - tx) * u, ty + (hy - ty) * u - 5 * Math.sin(Math.PI * u), false];
}

// ------------------------------------------------------------ drawing
function board(g, bo, shift) {
  const buf = g.buf, ox = bo & 63, oy = (bo >> 6) & 63;
  for (let y = 0, i = 0; y < BH; y++) {
    const gy = ((y + oy) & 63) << 6;
    for (let x = 0; x < W; x++, i++) {
      const h = HAZE[i] >> shift, gr = GRAIN[gy | ((x + ox) & 63)];
      buf[i] = h > gr + 70 ? P.hz2 : h > gr ? P.hz1 : P.board;
    }
  }
  g.cost.px += W * BH; g.cost.box += W * BH * 3;
}

/** Fresh eraser residue over slot i, `lv` 0..1. */
function residue(g, i, lv, bo) {
  if (lv <= 0) return;
  const buf = g.buf, x0 = SLOT[i][0] - PAD, y0 = SLOT[i][1] - PAD, ox = bo & 63, oy = (bo >> 6) & 63, k = (lv * 256) | 0;
  for (let j = 0; j < GH; j++) {
    const y = y0 + j;
    if (y < 0 || y >= BH) continue;
    for (let q = 0; q < GW; q++) {
      const x = x0 + q;
      if (x < 0 || x >= W) continue;
      const v = (RES[j * GW + q] * k) >> 8, gr = GRAIN[(((y + oy) & 63) << 6) | ((x + ox) & 63)];
      if (v > gr + 60) buf[y * W + x] = P.hz2; else if (v > gr) buf[y * W + x] = P.hz1;
    }
  }
  g.cost.box += GW * GH * 4;
}

/**
 * One chalk digit. job: { erase 0..1 } | { draw: {guide, f, note} } | null.
 * runners [u, dir, keep] lay fresh chalk behind them.
 */
function chalkDigit(g, gl, sx, sy, bo, runners, job, trailLen) {
  const buf = g.buf, SD = gl.SD, U = gl.U, L = gl.L, D = L / 4;
  const ox = bo & 63, oy = (bo >> 6) & 63, ox2 = (bo >> 12) & 63, oy2 = (bo >> 18) & 63;
  const x0 = sx - PAD, y0 = sy - PAD;
  const crumble = !!(job && job.crumble);
  const er = job && job.erase !== undefined ? job.erase * (crumble ? 1.02 : 1.3) * 255 : -1;
  const dr = job && job.draw ? job.draw : null;
  const nR = runners.length;
  let n = 0;
  for (let j = 0; j < GH; j++) {
    const y = y0 + j;
    if (y < 0 || y >= BH) continue;
    for (let k = 0; k < GW; k++) {
      const q = j * GW + k, sd = SD[q];
      if (sd > 8) continue;
      const x = x0 + k;
      if (x < 0 || x >= W) continue;
      n++;
      const u = U[q];
      // fresh chalk behind a runner
      let fr = 0;
      if (u !== 255)
        for (let r = 0; r < nR; r++) {
          const R = runners[r];
          if (R[2] <= 0) continue;
          let b = (R[0] - u) * R[1];
          if (gl.loop && b < 0) b += L;
          if (b >= 0 && b < trailLen) { const v = 1 - b / trailLen; if (v > fr) fr = v; }
        }
      const gr = GRAIN[(((y + oy) & 63) << 6) | ((x + ox) & 63)];
      // ragged edge: the chalk catches the board's tooth unevenly; fresh chalk is pressed a little wider
      if (sd * 32 > gr - 128 + fr * 80) continue;
      // removal and reveal go by a fixed rank, never by a partial shape
      if (er >= 0) {
        const r = RANK[q];
        if (r < er - (crumble ? 0 : 77)) continue;
        if (r < er) { buf[y * W + x] = P.smear; continue; }
      }
      if (dr) {
        let shown;
        if (u === 255) shown = dr.note * 255 > RANK[q];
        else { const loc = u - Math.floor(u / D) * D; shown = loc <= dr.f * D; }
        if (!shown) { if (sd < -6 && dr.guide * 255 > RANK[q]) buf[y * W + x] = P.guide; continue; }
      }
      const g2 = GRAIN[(((y + oy2) & 63) << 6) | ((x + ox2) & 63)];
      const hole = (sd > -8 ? 70 : 34) * (1 - 0.75 * fr);
      if (g2 < hole) continue;
      buf[y * W + x] = g2 < hole + 34 ? P.thin : fr > 0.45 ? P.fresh : fr > 0.05 ? P.chalk : P.dust;
    }
  }
  g.cost.px += n; g.cost.box += GW * GH + n * 6 + n * nR * 2;
}

/** A player mark (O or X) centred at (cx, cy); `keep` 0..1 thins it by rank. */
function mark(g, mask, cx, cy, c, cThin, bo, keep = 1) {
  const buf = g.buf, x0 = Math.round(cx - 4.5), y0 = Math.round(cy - 4.5), ox = (bo >> 12) & 63, oy = (bo >> 18) & 63;
  for (let j = 0; j < 9; j++) {
    const y = y0 + j;
    if (y < 0 || y >= BH) continue;
    for (let k = 0; k < 9; k++) {
      if (!mask[j * 9 + k]) continue;
      const x = x0 + k;
      if (x < 0 || x >= W) continue;
      if (keep < 1 && RANK[j * GW + k] > keep * 255) continue;
      const gr = GRAIN[(((y + oy) & 63) << 6) | ((x + ox) & 63)];
      if (gr < 22) continue;
      buf[y * W + x] = gr < 60 ? cThin : c;
    }
  }
  g.cost.box += 81 * 3;
}

const BALL = [
  '...ooooooo...',
  '.ooooooooooo.',
  'oooow.w.woooo',
  'ooowwwwwwwooo',
  'oooow.w.woooo',
  '.ooooooooooo.',
  '...ooooooo...',
];
function ball(g, cx, cy, bo) {
  const buf = g.buf, x0 = Math.round(cx - 6.5), y0 = Math.round(cy - 3.5), ox = bo & 63, oy = (bo >> 6) & 63;
  for (let j = 0; j < 7; j++)
    for (let k = 0; k < 13; k++) {
      const ch = BALL[j][k];
      if (ch === '.') continue;
      const x = x0 + k, y = y0 + j;
      if (x < 0 || x >= W || y < 0 || y >= BH) continue;
      const gr = GRAIN[(((y + oy) & 63) << 6) | ((x + ox) & 63)];
      buf[y * W + x] = ch === 'w' ? (gr < 50 ? P.thin : P.chalk) : gr < 40 ? P.ballThin : P.ball;
    }
  g.cost.box += 91 * 3;
}

/** The dashed blue line a pass chalks behind the ball. */
function flightLine(g, fl, bo) {
  const buf = g.buf, ox = bo & 63, oy = (bo >> 6) & 63, N = 30;
  for (let k = 0; k <= N; k++) {
    if (k % 3 === 2 || k / N > fl.t) continue;
    if (fl.keep < 1 && (hash(k, 3) & 255) > fl.keep * 255) continue;
    const [px, py] = lob(fl.a, fl.b, k / N, fl.lift), x0 = Math.round(px - 1), y0 = Math.round(py - 1);
    for (let j = 0; j < 2; j++)
      for (let q = 0; q < 2; q++) {
        const x = x0 + q, y = y0 + j;
        if (x < 0 || x >= W || y < 0 || y >= BH) continue;
        const gr = GRAIN[(((y + oy) & 63) << 6) | ((x + ox) & 63)];
        if (gr > 30) buf[y * W + x] = gr < 90 ? P.blueThin : P.blue;
      }
  }
  g.cost.box += N * 20;
}

/** Chalk tick marks flying out of a catch. */
function burst(g, b) {
  const n = b.big ? 10 : 6, life = b.big ? 0.9 : 0.45;
  if (b.t > life) return;
  const r0 = 6 + b.t * (b.big ? 14 : 10), len = b.big ? 4 : 3, c = b.big ? C.yel : C.fresh;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + 0.3, ca = Math.cos(a), sa = Math.sin(a);
    if ((hash(k, 9) & 255) < 255 * (b.t / life) * 0.8) continue;
    g.line(Math.round(b.x + ca * r0), Math.round(b.y + sa * r0 * 0.8), Math.round(b.x + ca * (r0 + len)), Math.round(b.y + sa * (r0 + len) * 0.8), c);
  }
}

function los(g, bo) {
  const buf = g.buf, ox = bo & 63, oy = (bo >> 6) & 63;
  for (let y = 1; y < BH - 1; y++) {
    if (y % 8 >= 5) continue;
    for (let x = LOS_X; x < LOS_X + 2; x++) {
      const gr = GRAIN[(((y + oy) & 63) << 6) | ((x + ox) & 63)];
      if (gr < 40) continue;
      buf[y * W + x] = gr < 90 ? P.blueThin : P.blue;
    }
  }
  g.cost.box += 80 * 4;
}

/** The motion line: a zigzag, the playbook's sign for a man moving before the snap. */
function motionAt(k) {
  const [a, b] = MOTION, x = a[0] + (b[0] - a[0]) * k, y = a[1] + (b[1] - a[1]) * k;
  return [x, y];
}
function motionLine(g, bo) {
  const buf = g.buf, ox = (bo >> 12) & 63, oy = (bo >> 18) & 63, [a, b] = MOTION;
  for (let x = a[0] - 2; x <= b[0] + 2; x++) {
    const k = (x - a[0]) / (b[0] - a[0]), y0 = a[1] + (b[1] - a[1]) * k, z = ((x & 7) < 4 ? (x & 3) : 3 - (x & 3)) - 1.5;
    const y = Math.round(y0 + 6 + z);
    const gr = GRAIN[(((y + oy) & 63) << 6) | ((x + ox) & 63)];
    if (gr > 50 && y < BH) buf[y * W + x] = P.yelDimThin;
  }
  g.cost.box += 60 * 4;
}

/** Dust shaken off a digit's chalk by the slap: specks fall from points along its route. */
function slapDust(g, gl, sx, sy, t, i) {
  for (let k = 0; k < 16; k++) {
    const t0 = (hash(k, i, 41) % 30) / 100, age = t - t0;
    if (age < 0 || age > 1.6) continue;
    if ((hash(k, i, 42) & 255) < 255 * (age / 1.6)) continue;
    const [x, y] = along(gl, (hash(k, i, 43) % 1000) / 1000 * gl.L);
    g.pixel(sx - PAD + x + ((hash(k, i, 44) % 5) - 2) * age, sy - PAD + y + 3 + age * 10 + age * age * 14, C.thin);
  }
}

/** The old digits shaken loose: chalk falls off them, spread evenly over the crumble. */
function crumbleDust(g, gl, sx, sy, s, i) {
  for (let k = 0; k < 44; k++) {
    const t0 = CR0 + ((k + 0.5) / 44) * (CR1 - CR0) * 0.9, age = s - t0;
    if (age < 0 || age > 1.3) continue;
    const [x, y] = along(gl, ((hash(k, i, 51) % 1000) / 1000) * gl.L);
    const fx = sx - PAD + x + ((hash(k, i, 52) % 7) - 3) * 0.4 * age, fy = sy - PAD + y + age * 6 + age * age * 26;
    if (fy >= BH - 1) continue;
    const c = (hash(k, i, 53) & 3) ? C.thin : C.dust;
    g.pixel(fx, fy, c);
    if (age < 0.5) g.pixel(fx, fy - 1, c);
  }
}

function tray(g) {
  g.fillRect(0, 74, W, 1, C.woodHi);
  g.fillRect(0, 75, W, 3, C.wood);
  g.fillRect(0, 78, W, 1, C.woodLo);
  g.fillRect(0, 79, W, 1, C.woodSh);
  // chalk sticks lying on the ledge
  g.fillRect(100, 72, 9, 2, C.chalk); g.fillRect(100, 73, 9, 1, C.dust);
  g.fillRect(114, 72, 6, 2, C.yel);
  g.fillRect(125, 72, 5, 2, C.pink);
  g.fillRect(136, 72, 7, 2, C.blue);
}

function eraser(g, x, y) {
  x = Math.round(x); y = Math.round(y);
  g.fillRect(x, y, 16, 3, C.back);
  g.fillRect(x, y + 2, 16, 1, C.backLo);
  g.fillRect(x, y + 3, 16, 3, C.felt);
  g.fillRect(x + 2, y + 4, 3, 1, C.feltDust); g.fillRect(x + 8, y + 5, 4, 1, C.feltDust); g.fillRect(x + 12, y + 3, 2, 1, C.feltDust);
}

/** Chalk dust shaken out of the eraser while it scrubs. */
function eraserDust(g, s, M) {
  const ss = s < 50 ? s + 60 : s;
  for (let k = 0; k < 28; k++) {
    const tb = ER0 + (k * (ER1 - ER0)) / 28, age = ss - tb;
    if (age < 0 || age > 1.6) continue;
    const [ex, ey] = eraserAt(tb, M, s < 50 ? M.fromOld : M.toNew);
    const x = ex + 2 + (hash(k, 1) % 12) + age * ((hash(k, 2) % 5) - 2), y = ey + 6 + age * 9 + age * age * 8;
    if ((hash(k, 3) & 255) < 255 * (age / 1.6)) continue;
    g.pixel(x, y, C.thin);
  }
}

export default {
  name: 'Playbook',
  blurb: "A coach's chalkboard: each numeral is a receiver's route, run by its X or O on every whistle; the eraser wipes the old play and the team chalks in the new one.",
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, date = ctx.date;
    ctx.lcd.backlight(1 - 0.6 * ctx.night);
    const tAbs = date.getTime() / 1000;
    const bo = hash(Math.floor(tAbs * 8), 5) & 0xffffff, ho = hash(Math.floor(tAbs * 4), 6) & 0xfff;

    const prv = clockFields(new Date(date.getTime() - 60000)), nxt = clockFields(new Date(date.getTime() + 60000));
    const cur = f.hh + f.mm, old = prv.hh + prv.mm, nw = nxt.hh + nxt.mm;
    const m0 = Math.floor(date.getTime() / 60000) * 60;
    const M = {
      cur, old, nw, m0, mk: f.minuteKey, pre: f.m === 59, post: f.m === 0,
      drawn: [0, 1, 2, 3].map((i) => drawnAt(i, f, m0)),
      toNew: [0, 1, 2, 3].filter((i) => cur[i] !== nw[i]),
      fromOld: [0, 1, 2, 3].filter((i) => cur[i] !== old[i]),
    };
    const beat = frac(tAbs);

    board(g, ho, ctx.night > 0.5 ? 1 : 0);
    for (let i = 0; i < 4; i++) {
      let lv = 0;
      if (s >= ER0 && !M.pre && M.toNew.includes(i)) lv = prog(s, ER0, ER1);
      else if (s < 50 && !M.post && M.fromOld.includes(i)) lv = 1 - prog(s, 1.5, 14);
      residue(g, i, lv, ho);
    }
    los(g, ho);

    // the back in motion, bottom left: shuttles along his chalked zigzag, a step per whistle
    const fire = (p) => (p < 0.08 ? 0 : p < 0.2 ? smooth((p - 0.08) / 0.12) : 1 - smooth((p - 0.2) / 0.5));
    motionLine(g, bo);
    {
      const b = tAbs / 1, n = Math.floor(b), v = n + sprint(b - n), w = v % 12, k = w <= 6 ? w / 6 : (12 - w) / 6;
      const [mx, my] = motionAt(k);
      mark(g, RING, mx, my - (b - n < 0.1 ? 0 : 0), P.yelDim, P.yelDimThin, bo);
    }
    // the deep defence drifts in its zone
    for (const [x, y, ph] of SAFETY) {
      const dx = 4 * Math.sin(tAbs * 0.9 + ph), dy = 1.5 * Math.sin(tAbs * 0.6 + ph * 2) - (fire(frac(beat - 0.15)) > 0.5 ? 1 : 0);
      mark(g, CROSS, x + dx, y + dy, P.pinkDim, P.pinkDimThin, bo);
    }

    // the touchdown: the coach slaps the board, the chalk shudders and sheds dust
    const td = M.pre && s >= RELAY[4] && s < RELAY[4] + 2.2 ? s - RELAY[4] : -1;
    const shake = td >= 0 && td < 0.45 ? ((Math.floor(td * 30) & 1) ? 1 : -1) : 0;

    // the time: four routes, and the players running them
    for (let i = 0; i < 4; i++) {
      const p = plan(i, s, M), sx = SLOT[i][0] + shake, sy = SLOT[i][1];
      if (td >= 0) slapDust(g, p.gl, sx, sy, td, i);
      if (p.job && p.job.crumble) crumbleDust(g, p.gl, sx, sy, s, i);
      chalkDigit(g, p.gl, sx, sy, bo, p.runners, p.job, p.gl.L / 4);
      const mask = i < 2 ? RING : CROSS, c = i < 2 ? P.yel : P.pink, ct = i < 2 ? P.yelThin : P.pinkThin;
      for (const r of p.runners) {
        let keep = r[2];
        if (p.job && p.job.erase !== undefined) keep *= 1 - p.job.erase;
        if (keep <= 0) continue;
        const [px, py] = along(p.gl, r[0]);
        mark(g, mask, sx - PAD + px, sy - PAD + py, c, ct, bo, keep);
        // the skid: a puff of chalk dust kicked up behind the mark as it stops
        if (p.beatP !== undefined && keep >= 1 && p.beatP > 0.42 && p.beatP < 0.95) {
          const age = p.beatP - 0.42, [qx, qy] = along(p.gl, r[0] - r[1] * 4);
          let bx = qx - px, by = qy - py; const bl = Math.hypot(bx, by) || 1; bx /= bl; by /= bl;
          for (let k = 0; k < 4; k++) {
            if ((hash(k, p.beatN, i) & 255) < 255 * (age / 0.53)) continue;
            const dd = 6 + k * 1.5 + age * 6, side = (k & 1 ? 1 : -1) * (1 + age * 3);
            g.pixel(sx - PAD + px + bx * dd - by * side, sy - PAD + py + by * dd + bx * side - age * 3, C.thin);
          }
        }
      }
    }

    // the ball: on its spot, or in the air
    const bs = ballState(s, M);
    for (const fl of bs.flights) if (fl.keep > 0) flightLine(g, fl, ho);
    ball(g, bs.x, bs.y, ho);
    if (bs.burst) burst(g, bs.burst);

    tray(g);
    const [ex, ey, scrubbing] = eraserAt(s, M);
    if ((s > ER0 && !M.pre) || (s < 2 && !M.post)) eraserDust(g, s, M);
    eraser(g, ex, ey);
  },
};
