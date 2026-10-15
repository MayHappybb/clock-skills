// Slinky: four rainbow plastic coil springs stand on a staircase, one per
// step, and each is bent into its numeral. The numerals ARE the springs
// (slinky-glyphs.js): one continuous spring per digit, 32 coils laid along a
// path drawn for a 9 px coil (no corners, every join a bend), each coil an
// 11 px leaned ellipse with a dark back rim and a lamp-side glint. A spring
// has a fixed number of coils, so a short 1 is squeezed tight and a long 8
// is stretched open: the font's texture comes from its own physics.
//
// Alive at rest: every second each spring boings on its step (a squash and
// a smaller stretch, feet planted, the step's nose thumps with light) and a
// compression pulse runs its length, alternately each way: the coils bunch
// and spread, the bands of colour slide, the pulse shoves the spring a
// couple of px toward open ground (never into a counter) and lights the
// coils it passes. Down the stairs each spring is 0.09 s behind the one
// above. A slow wave keeps the coils creeping in between. Flourishes:
// :15 the springs hop in a cascade down the stairs, :30 one pulse runs
// through all four springs as if they were one (the colon flashes as it
// crosses), :45 they hop back up. A sheen sweeps the wall every 12 s.
//
// Minute turn (:58.4 to :01.2), the Slinky's own trick: the changing spring
// crouches, then stands up into the arch a Slinky makes on a stair, coil by
// coil from one end (each coil hops along an upward bow, staggered, eased),
// stacked at both feet and stretched over the top. The old digit is all
// arch by :59.95; after :00 the arch's far end peels off first and the
// coils drop into the new numeral, which lands with a squash and a stronger
// pulse. Changing digits work concurrently (midnight: four arches at once).
// Hour: after the turn the four springs hop down the staircase in a
// cascade, each step lighting in its colour as a spring lands on it, and
// as each lands the hour's new paint runs along it coil by coil (rainbow,
// neon, sherbet, by the hour); then they hop back up. The time reads
// throughout: the springs only hop whole.
//
// Palette: the springs are the only saturated thing, six flat bands of toy
// plastic, each with a 45 % darker rim and a white glint, so the time is the
// strongest contrast; the room is one cool indigo family (wall, stair, nose,
// shadow), calm and dark enough for every band to sing, and the stair nose
// lights in a spring's colour only when it is hit. The springs cast flat
// shadows down-right on the wall and stairs (the lamp drifts a little). By
// night the room sinks to near-black indigo and the backlight dims to 45 %;
// the springs keep their colours and stay the brightest thing.
//
// The room around them is busy but calm: a small four-pane window top right
// shows the sky of the hour (sun and drifting clouds by day, a crescent and
// twinkling stars by night), a sheen sweeps the wall every 12 s, and the
// springs' shadows swing slowly as the lamp drifts.
//
// Cost: every coil is one table stamp (32 angles x 16 sub-pixel phases of
// 11 x 11 2-bit classes, ~15.5 KB flash packed) written straight into the
// frame, and one shadow stamp; 128 coils a frame, ~70 float ops each to
// place. Paths are precomputed (10 digits and 4 arches at 0.5 px, ~3,000
// samples x 5 int16, ~30 KB flash). No per-minute work beyond a 22-sample
// check of which way round the arch stands. RAM: the 25.6 KB frame and a
// 128-coil list (~3 KB).
import { clockFields, to565, sin, hash } from '../js/kit.js';
import { PATHS, archPath, at, STAMPS, STAMP_R, STAMP_W, ANGLES, SUB, BOX_W, BOX_H } from './slinky-glyphs.js';

const W = 160, H = 80, TAU = Math.PI * 2;
const N = 32;                                   // coils per spring
const CLX = [9.5, 44.5, 92.5, 127.5];           // centreline box left of each slot
const TREAD = [59, 64, 69, 74];                 // the step each digit stands on
const CLY = TREAD.map((t) => t - 44.2);         // centreline box top
const STEP_X = [0, 38, 80, 121, 160];           // stair step edges

// ------------------------------------------------------------ palette
// Three paint jobs, one per hour in turn: the plastic rainbow, neon, sherbet.
const WAYS = [
  [0xff3b4e, 0xff8a1f, 0xffd60a, 0x3ddc6a, 0x2fa8ff, 0xa36bff],
  [0xff2fa0, 0xff5ad8, 0xb36bff, 0x29d8ff, 0x3dffb0, 0xe8ff3a],
  [0xff8f80, 0xffb36b, 0xffe28a, 0x9df0b0, 0x8fd2ff, 0xc9a8ff],
];
const mixc = (a, b, u) => {
  const r = ((a >> 16) & 255) + ((((b >> 16) & 255) - ((a >> 16) & 255)) * u);
  const g = ((a >> 8) & 255) + ((((b >> 8) & 255) - ((a >> 8) & 255)) * u);
  const bl = (a & 255) + (((b & 255) - (a & 255)) * u);
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
};
// the room: day and night
const ROOM = {
  wall: [0x1c1d3a, 0x0f1026], stair: [0x2e2950, 0x1b1834], nose: [0x5a4f86, 0x3a3462],
  shade: [0x14142c, 0x09091a], stairSh: [0x221e3e, 0x131126], colon: [0xf4e9d0, 0xd8cdb4], sweep: [0x252750, 0x15173a],
};
// per way, per band: [_, body, rim, glint, swept body]
const PAL = WAYS.map((way) => way.map((c) => [0, to565(c), to565(mixc(c, 0x0c0a1c, 0.55)), to565(mixc(c, 0xffffff, 0.6)), to565(mixc(c, 0xffffff, 0.4))]));
const FLASH = [0, 2, 3, 5];
// the window's sky through the day: [hour, top, bottom]
const SKY = [[0, 0x0b1030, 0x141a44], [5, 0x101640, 0x2a2a5e], [6.5, 0x5a6ab8, 0xf4a36b], [8, 0x6fbfff, 0xbfe6ff],
  [16.5, 0x5fb2ff, 0xb8e0ff], [18.5, 0x4a3a8a, 0xff8a5c], [20, 0x141a48, 0x2c2a66], [24, 0x0b1030, 0x141a44]];
const WIN = [122, 3, 34, 17];                     // x, y, w, h of the window, top right, clear of the digits                       // which band each stair lights in

// ------------------------------------------------------------ tables
const DTAB = new Float32Array(257);             // D(x) = -x e^(-x^2), x in [-4, 4]
for (let i = 0; i <= 256; i++) { const x = (i / 256) * 8 - 4; DTAB[i] = -x * Math.exp(-x * x); }
const D = (x) => (x <= -4 || x >= 4 ? 0 : DTAB[((x + 4) * 32) | 0]);
const GTAB = new Float32Array(257);             // G(x) = e^(-x^2)
for (let i = 0; i <= 256; i++) { const x = (i / 256) * 8 - 4; GTAB[i] = Math.exp(-x * x); }
const G = (x) => (x <= -4 || x >= 4 ? 0 : GTAB[((x + 4) * 32) | 0]);
const sm = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const sm5 = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * x * (x * (6 * x - 15) + 10));
const bump = (x) => (x <= 0 || x >= 1 ? 0 : sin(Math.PI * x));
const wrapPi = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };

const ARCH = CLX.map((x, k) => archPath(x - 1, x + BOX_W + 1, CLY[k] + BOX_H, CLY[k] - 8));
/** Coil q's place on the arch: stacked at the feet, stretched over the top. */
const archQ = (q) => q - 0.1 * sin(TAU * q);

// ------------------------------------------------------------ motion at rest

/** The hop: anticipation squash, flight, landing squash. h is time since the hop began. */
function hop(h, height) {
  if (h <= 0 || h >= 1.3) return [0, 0];
  if (h < 0.25) return [0, 0.12 * sm(h / 0.25)];                                  // crouch
  if (h < 0.85) { const u = (h - 0.25) / 0.6; return [-height * 4 * u * (1 - u), 0.12 * (1 - sm(u / 0.45)) - 0.04 * bump(u)]; }
  const u = (h - 0.85) / 0.45;
  return [0, 0.1 * bump(Math.min(1, u * 1.6)) * (1 - u)];                          // land
}

/** Hop starts this minute for slot k: [start, height] pairs (the :15 cascade goes down the stairs, :45 climbs back). */
function hops(k, s, hourShow) {
  const L = [[15 + 0.18 * k, 5], [45 + 0.18 * (3 - k), 5]];
  if (hourShow) L.push([2.0 + 0.32 * k, 8], [4.4 + 0.32 * (3 - k), 6]);
  return L;
}

/** Squash (+ squashed, - stretched), lift and pulse strength of slot k at second s. */
function body(k, s, hourShow) {
  let dy = 0, sq = 0, amp = 0.35, quiet = 1;
  for (const [t0, ht] of hops(k, s, hourShow)) {
    const [a, b] = hop(s - t0, ht);
    dy += a; sq += b;
    quiet = Math.min(quiet, 1 - bump((s - t0 + 0.2) / 1.7));       // a hopping spring skips its beat
  }
  const tau = s - 0.09 * k - Math.floor(s - 0.09 * k);
  // the beat: a boing, squash then a smaller stretch, feet on the tread
  sq += quiet * (tau < 0.3 ? 0.075 * sin((Math.PI * tau) / 0.3) : tau < 0.7 ? -0.035 * sin((Math.PI * (tau - 0.3)) / 0.4) : 0);
  // and an upright spring never stands quite still: it sways, feet planted, on a slow two-second swing
  const lean = 1.8 * sin(Math.PI * s + 0.7 * k);
  return [dy, sq, amp * (0.35 + 0.65 * quiet), lean];
}

/** How brightly stair k's nose is lit by a spring landing on it, 0..1. */
function flash(k, s, hourShow) {
  const tau = s - 0.09 * k - Math.floor(s - 0.09 * k);
  let v = tau < 0.5 ? 0.3 * (1 - tau / 0.5) : 0;               // every beat the spring thumps its step
  for (const [t0, ht] of hops(k, s, hourShow)) { const u = (s - t0 - 0.85) / 0.7; if (u > 0 && u < 1) v = Math.max(v, (ht > 6 ? 1 : 0.6) * (1 - u) * (1 - u)); }
  return v;
}

/** The :30 chain: one pulse that runs through all four springs as if they were one. Local pulse place in slot k, or null. */
function chain(k, s) {
  return ((s - 29.6) / 4.4) * 5.6 - 0.3 - 1.25 * k;
}

const tmp = [0, 0, 0];
/** Coil q of digit d in slot k at rest: out = [x, y, angle, lit]. */
function rest(k, d, q, s, bd, out) {
  const p = PATHS[d];
  // the beat: once a second a compression pulse runs the length of the spring, alternately each way;
  // around :30 it gives way to the chain, one pulse through all four springs in turn
  const b = s - 0.09 * k, n = Math.floor(b), tau = b - n;
  const wc = sm((s - 29.4) / 0.5) * (1 - sm((s - 35.0) / 0.5)), wb = 1 - wc;
  let g = q, bulge = 0, lit = 0;
  if (wb > 0) {
    const c = -0.3 + 1.6 * tau, qq = n & 1 ? 1 - q : q, x = (qq - c) / 0.19;
    const dg = wb * bd[2] * 0.19 * D(x);
    g += n & 1 ? -dg : dg;
    bulge += wb * G((qq - c) / 0.13);
    if (x > -0.55 && x < 0.55 && wb > 0.5) lit = 1;
  }
  if (wc > 0) {
    const c = chain(k, s), x = (q - c) / 0.13;
    g += wc * 0.4 * 0.13 * D(x);
    bulge += wc * 1.2 * G((q - c) / 0.1);
    if (x > -0.9 && x < 0.9 && wc > 0.5) lit = 1;
  }
  g += 0.022 * sin(TAU * (2 * q - 0.5 * s + 0.3 * k)) * sin(Math.PI * q);
  if (g < 0) g = 0; else if (g > 1) g = 1;
  at(p, g * p.L, tmp);
  // and the pulse is a bulge too: the coils it passes are pushed a couple of px toward open ground
  const j = Math.min(p.n - 1, (g * p.L * 2) | 0);
  tmp[0] += 2.2 * bulge * p.vx[j]; tmp[1] += 2.2 * bulge * p.vy[j];
  const sq = bd[1], sy = 1 - sq, sx = 1 + 0.5 * sq;
  out[0] = CLX[k] + BOX_W / 2 + (tmp[0] - BOX_W / 2) * sx + bd[3] * (1 - tmp[1] / BOX_H);
  out[1] = CLY[k] + BOX_H - (BOX_H - tmp[1]) * sy + bd[0];
  out[2] = tmp[2];
  out[3] = lit;
  return out;
}

// ------------------------------------------------------------ the turn

const OUT0 = 58.4, LIFT = 0.4, STAG = 0.3, DUR = 0.85;   // out: 58.8 .. 59.95
const IN0 = 0.05;                                         // in: 0.05 .. 1.2

/** Move from A toward B by e along an arc that bows upward. */
function glide(A, B, e, out) {
  const dx = B[0] - A[0], dy = B[1] - A[1], d = Math.hypot(dx, dy);
  const bow = Math.min(7, 0.3 * d) * 4 * e * (1 - e);          // every coil hops: its path bows upward
  out[0] = A[0] + dx * e;
  out[1] = A[1] + dy * e - bow;
  out[2] = A[2] + wrapPi(B[2] - A[2]) * e;
  out[3] = 0;
  return out;
}

const PA = [0, 0, 0, 0], PB = [0, 0, 0, 0];
function archAt(k, q, flip, out) {
  const p = ARCH[k];
  at(p, archQ(flip ? 1 - q : q) * p.L, out);
  if (flip) out[2] += Math.PI;
  out[3] = 0;
  return out;
}

/** Which way round the arch the spring stands, so coils travel least. */
function archFlip(k, a, b) {
  let d0 = 0, d1 = 0;
  for (let i = 0; i < N; i += 3) {
    const q = i / (N - 1);
    for (const d of [a, b]) {
      if (d < 0) continue;
      const p = PATHS[d];
      at(p, q * p.L, tmp);
      const x = CLX[k] + tmp[0], y = CLY[k] + tmp[1];
      archAt(k, q, false, PA); d0 += Math.hypot(PA[0] - x, PA[1] - y);
      archAt(k, q, true, PA); d1 += Math.hypot(PA[0] - x, PA[1] - y);
    }
  }
  return d1 < d0;
}

// ------------------------------------------------------------ drawing

function drawCoil(g, x, y, a, P, lit) {
  const buf = g.buf;
  let ai = Math.round((a / TAU) * ANGLES) % ANGLES;
  if (ai < 0) ai += ANGLES;
  const fx = x - STAMP_R, fy = y - STAMP_R;
  const ix = Math.floor(fx), iy = Math.floor(fy);
  const sx = ((fx - ix) * SUB) | 0, sy = ((fy - iy) * SUB) | 0;
  const m = STAMPS[(ai * SUB + sy) * SUB + sx];
  const body = lit ? P[4] : P[1];
  for (let j = 0; j < STAMP_W; j++) {
    const yy = iy + j;
    if (yy < 0 || yy >= H) continue;
    for (let i = 0; i < STAMP_W; i++) {
      const v = m[j * STAMP_W + i];
      if (!v) continue;
      const xx = ix + i;
      if (xx < 0 || xx >= W) continue;
      buf[yy * W + xx] = v === 1 ? body : P[v];
    }
  }
  g.cost.box += STAMP_W * STAMP_W; g.cost.px += 60;
}

/** The coil's shadow on the wall and stairs: darken only the ground, a few px off. */
function shadeCoil(g, x, y, a, W565, SW565, S565, SH565, SSH565) {
  const buf = g.buf;
  let ai = Math.round((a / TAU) * ANGLES) % ANGLES;
  if (ai < 0) ai += ANGLES;
  const fx = x - STAMP_R, fy = y - STAMP_R;
  const ix = Math.floor(fx), iy = Math.floor(fy);
  const m = STAMPS[(ai * SUB) * SUB];
  for (let j = 0; j < STAMP_W; j++) {
    const yy = iy + j;
    if (yy < 0 || yy >= H) continue;
    for (let i = 0; i < STAMP_W; i++) {
      if (!m[j * STAMP_W + i]) continue;
      const xx = ix + i;
      if (xx < 0 || xx >= W) continue;
      const o = yy * W + xx, v = buf[o];
      if (v === W565 || v === SW565) buf[o] = SH565;
      else if (v === S565) buf[o] = SSH565;
    }
  }
  g.cost.box += STAMP_W * STAMP_W * 2;
}

/** The window: the sky of the hour, a sun or moon crossing it, clouds drifting by day, stars by night. */
function windowView(g, ctx, T, room) {
  const f = ctx.fields, [x, y, w, h] = WIN, hr = f.h + f.m / 60 + f.sec / 3600;
  let i = 0;
  while (SKY[i + 1][0] < hr) i++;
  const u = (hr - SKY[i][0]) / (SKY[i + 1][0] - SKY[i][0]);
  const top = mixc(SKY[i][1], SKY[i + 1][1], u), bot = mixc(SKY[i][2], SKY[i + 1][2], u);
  const dim = 1 - 0.35 * ctx.night;
  g.fillRect(x, y, w, h, room.nose);
  g.clip(x + 1, y + 1, w - 2, h - 2);
  g.fillRect(x + 1, y + 1, w - 2, 9, mixc(0, top, dim));
  g.fillRect(x + 1, y + 10, w - 2, h - 11, mixc(0, bot, dim));
  const day = hr > 6.5 && hr < 18.5;
  if (day) {
    const p = (hr - 6.5) / 12, sx = x + 3 + p * (w - 6), sy = y + 12 - 9 * sin(Math.PI * p);
    g.fillCircle(sx, sy, 2.6, 0xfff1b0);
    for (let c = 0; c < 2; c++) {
      const cx = x - 10 + (((T / 6 + c * 23) % (w + 20)) | 0), cy = y + 4 + c * 6;
      g.fillRoundRect(cx, cy, 9, 3, 1.5, 0xf4f6ff);
      g.fillRoundRect(cx + 2, cy - 1, 5, 3, 1.5, 0xf4f6ff);
    }
  } else {
    const p = ((hr + 5.5) % 24) / 12, mx = x + 3 + Math.min(1, p) * (w - 6), my = y + 12 - 8 * sin(Math.PI * Math.min(1, p));
    for (let k = 0; k < 7; k++) {
      const sx = x + 2 + (hash(k, 7) % (w - 4)), sy = y + 2 + (hash(k, 9) % 10);
      const tw = (hash(k, 11, Math.floor(T * 0.7 + k * 0.37)) & 3) === 0;
      g.pixel(sx, sy, tw ? 0x6a7090 : 0xe8ecff);
    }
    g.fillCircle(mx, my, 2.6, 0xf2ecd8);
    g.fillCircle(mx + 1.3, my - 0.8, 2.2, mixc(0, my - 0.8 < y + 10 ? top : bot, dim));   // a crescent
  }
  g.unclip();
  // the mullions
  g.fillRect(x + (w >> 1), y, 1, h, room.nose);
  g.fillRect(x, y + 9, w, 1, room.nose);
  g.fillRect(x - 1, y + h, w + 2, 1, mixc(room.nose, 0xffffff, 0.15));   // the sill
}

export default {
  name: 'Slinky',
  blurb: 'Four rainbow coil springs on a staircase, each bent into a numeral; a pulse runs every spring each second, and at the minute the changing spring stands up into a Slinky arch and drops into the new digit.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, nt = ctx.night;
    ctx.lcd.backlight(1 - 0.55 * nt);
    const T = (ctx.date.getTime() / 1000) % 86400;
    const prv = clockFields(new Date(ctx.date.getTime() - 60000)), nxt = clockFields(new Date(ctx.date.getTime() + 60000));
    const cur = f.hh + f.mm, old = prv.hh + prv.mm, nw = nxt.hh + nxt.mm;
    const hourShow = prv.h !== f.h && s < 12;
    const room = {};
    for (const key in ROOM) room[key] = mixc(ROOM[key][0], ROOM[key][1], nt);
    const wall565 = to565(room.wall), stair565 = to565(room.stair), sh565 = to565(room.shade), ssh565 = to565(room.stairSh);

    // ---- the wall and the stairs; a stair's nose lights when a spring lands on it
    g.clear(room.wall);
    // a sheen sweeps the wall every 12 s (a slanted band of light, 1.8 s across)
    const sw = (s + 6) % 12;
    if (sw < 1.8) {
      const x0 = -70 + 250 * sm(sw / 1.8), sw565 = to565(room.sweep), buf = g.buf;
      for (let y = 0; y < H; y++) {
        const a = Math.max(0, Math.round(x0 - 0.45 * y)), e = Math.min(W, Math.round(x0 - 0.45 * y + 16));
        if (e > a) { buf.fill(sw565, y * W + a, y * W + e); g.cost.px += e - a; }
      }
    }
    const sweep565 = to565(room.sweep);
    windowView(g, ctx, T, room);
    const wayNow = f.h % 3, wayOld = prv.h % 3;
    for (let k = 0; k < 4; k++) {
      const x0 = STEP_X[k], x1 = STEP_X[k + 1], fl = flash(k, s, hourShow);
      g.fillRect(x0, TREAD[k], x1 - x0, H - TREAD[k], room.stair);
      if (fl > 0.02) {
        const c = mixc(room.nose, WAYS[wayNow][FLASH[k]], fl);
        g.fillRect(x0, TREAD[k], x1 - x0, 2, c);
        g.fillRect(x0, TREAD[k] + 2, x1 - x0, 1, mixc(room.stair, c, 0.5));
      } else g.fillRect(x0, TREAD[k], x1 - x0, 1, room.nose);
    }

    // ---- every spring's coils for this frame
    const coils = [];   // [x, y, angle, way, band, lit] per coil, per slot
    const st = [0, 0, 0, 0];
    for (let k = 0; k < 4; k++) {
      const d = +cur[k], bd = body(k, s, hourShow), list = [];
      let mode = 0, other = -1;
      if (s >= OUT0 && nw[k] !== cur[k]) { mode = 1; other = +nw[k]; }
      else if (s < 3 && old[k] !== cur[k]) { mode = 2; other = +old[k]; }
      const flip = mode ? archFlip(k, mode === 1 ? d : other, mode === 1 ? other : d) : false;
      // the hour's new paint runs along each spring as it lands from the cascade
      const repaint = hourShow ? 2.0 + 0.32 * k + 0.85 : -1;
      for (let i = 0; i < N; i++) {
        const q = i / (N - 1);
        if (mode === 1) {
          const e = sm5((s - OUT0 - LIFT - STAG * q) / DUR);
          const sq = 0.08 * bump((s - OUT0) / (LIFT + 0.2));                // anticipation: a crouch
          rest(k, d, q, s, [bd[0], bd[1] + sq, bd[2], bd[3]], PA);
          archAt(k, q, flip, PB);
          glide(PA, PB, e, st);
        } else if (mode === 2) {
          // landing: a squash as the last coils come down, then a strong pulse rings through the new digit
          const lb = [bd[0], bd[1] + 0.1 * bump((s - IN0 - STAG - DUR + 0.25) / 0.8), bd[2] + 0.08 * bump((s - 1.0) / 2.0), bd[3]];
          const e = sm5((s - IN0 - STAG * q) / DUR);
          rest(k, d, q, s, lb, PB);
          if (e < 1) { archAt(k, q, flip, PA); glide(PA, PB, e, st); } else for (let j = 0; j < 4; j++) st[j] = PB[j];
        } else rest(k, d, q, s, bd, st);
        const way = hourShow && s < repaint + 0.5 * q ? wayOld : wayNow;
        list.push([st[0], st[1], st[2], way, Math.min(5, (q * 6) | 0), st[3]]);
      }
      coils.push(list);
    }
    // shadows first (the lamp is up and to the left: they fall down and right), then the springs
    const sdx = Math.round(2 + 1.4 * sin((TAU * T) / 23)), sdy = 2;
    for (const list of coils) for (const c of list) shadeCoil(g, c[0] + sdx, c[1] + sdy, c[2], wall565, sweep565, stair565, sh565, ssh565);
    for (const list of coils) for (const c of list) drawCoil(g, c[0], c[1], c[2], PAL[c[3]][c[4]], c[5]);

    // the colon: two beads that bob on the beat, and flash as the :30 chain passes between the hours and minutes
    const cb = bump((s % 1) / 0.3) * 1.2, cf = s > 31.1 && s < 32.3 ? bump((s - 31.1) / 1.2) : 0;
    const cc = cf > 0 ? mixc(room.colon, 0xffffff, cf) : room.colon;
    g.fillCircle(79.5, 36 - cb, 2.2 + 0.6 * cf, cc);
    g.fillCircle(79.5, 48 - cb, 2.2 + 0.6 * cf, cc);
  },
};
