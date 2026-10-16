// Ribbon: a rhythmic gymnastics group on the competition carpet, and the
// time is written in the air by their ribbons. Four gymnasts stand in a V
// formation (the outer pair at the front of the carpet, the inner pair
// further back, smaller and higher), each holding a satin ribbon on a stick;
// each ribbon is laid in the shape of one numeral (ribbon-glyphs.js): one
// continuous band from the stick at the bottom to its swallowtail tail, soft
// where it bends, CREASED where a numeral has a corner, so the far side of
// every corner shows the ribbon's reverse face across a mitred fold (a 7's
// stem creases at the top into a bar of the other colour). A fifth gymnast at
// the back juggles two balls between the pairs: the colon.
//
// Alive at rest, on a beat once a second: every gymnast steps (weight shift,
// a knee lifts) and flicks her stick; the flick runs down her ribbon as a
// travelling wave (the whole numeral ripples a px or two, the stick end
// first, the tail up to two seconds later) and as a twist: a narrow band
// where the satin turns edge-on, flashes its reverse colour and turns back,
// sliding from the stick to the tail (a smaller one on the off-beat). The
// numerals sway with the steps, a slow sheen drifts along every band and the
// edges ripple. Flourishes: at :15 every ribbon turns over (a twist front
// runs its length and the numerals change to their reverse colours) while
// the gymnasts pirouette; at :30 a penche runs down the line and lifts each
// ribbon in turn; at :45 they pirouette and turn back over. The juggler keeps
// two balls in a shower all minute; camera flashes twinkle in the crowd.
//
// Minute turn (about 2 s), the gymnast's own figure: she crouches, a twist
// runs down the ribbon until it is all edge-on (a bright hairline of the old
// numeral), the creases let go and slide off the tail as soft twists, and
// she spins twice while the hairline glides along bowed arcs, stick end
// first and tail last, into a small coil low in the slot (about a third of
// the numeral's height, open at both ends, turning as her stick circles: a
// knot of ribbon, never numeral-shaped). After :00 it unwinds the same way
// into the new numeral, the creases slide back in from the tail, an untwist
// runs down from the stick to open the band to full width, and the numeral
// wobbles as she lands, arms up. Changing digits turn together; the glass is
// never without a readable numeral for more than ~0.85 s.
// The hour: every gymnast leaps in a split. The changing hour digits wind
// in early, and their gymnasts toss stick and coil together: the coil
// tumbles once through an 18 px arc while the minutes turn below it, and
// unwinds into the new hours after the catch. So the minutes are away
// only while the hours are in the air (x0:00 and midnight read "  :59",
// then "  :00", then the new time; the old hours never sit beside the new
// minutes). An unchanged ribbon rides up with its gymnast's leap; the
// juggler throws high and the crowd's flashes ripple. Every centre line
// moves at most ~2 px a frame (measured), and every steady motion repeats
// a whole number of times a minute, so nothing jumps when the seconds wrap.
//
// Palette: one ribbon colour per slot, rose, gold, aqua and lime, each with
// an analogous reverse (violet, orange, azure, green), so a crease or a
// twist is a hue shift within the same ribbon and the four numerals stay
// four distinct objects. Light shading is posterised in flat bands (glint,
// light, base, dark, edge) by the twist angle, with a dark rim keyline. The
// ribbons are the only saturated, light things on the glass: the arena is
// one deep indigo, the crowd a dim silhouette, the carpet a dark competition
// blue; leotards are the ribbons' reverse colours, skin a muted warm tone,
// the balls pale lilac. Night: the arena sinks to near black indigo, the
// crowd almost vanishes, the backlight dims to 50 % and the ribbons keep
// their colour, the brightest thing in the room.
//
// Cost: each ribbon is rasterised from its 128-sample centre line every
// frame (each segment fills only its rectangle's spans, recording arc length
// and cross distance in two layers for crossings), then each pixel of its
// box looks up a per-pixel-of-length table (width, ripple, colour) built per
// frame: ~3.7k kit.sin calls and 512 sqrt a frame. Gymnasts are kit lines and
// circles. The arena is two precomputed frames (day, night) copied in.
// RAM: the 4 scan buffers (80 x 80 x 4 x 2 B = 51 KB) and ~8 KB of tables;
// flash: glyphs 15 KB, arena frames 51 KB.

import { sin, cos, to565, mix, clockFields, hash } from '../js/kit.js';
import { NS, GLYPHS } from './ribbon-glyphs.js';
import { drawRibbon, LOOK, gymnast } from './ribbon-draw.js';

const W = 160, H = 80, PI = Math.PI, TAU = PI * 2;
// the group stands in a V formation: the outer pair at the front of the
// carpet, the inner pair (and the juggler) further back, smaller and higher
const SC = [1, 0.82, 0.82, 1];
const OX = [3, 44, 97, 133], OY = [4, 2, 2, 4];
const GX = [16, 54, 107, 145];               // where each gymnast stands
const FOOT = [78, 69.5, 69.5, 78];           // and the line her feet are on
const HW = 3;                                // the band's half width at rest
const RIB = [
  { front: 0xff3d7f, back: 0xc552f0 },
  { front: 0xffc61e, back: 0xff7a1a },
  { front: 0x26e0c8, back: 0x4a9bff },
  { front: 0x9be62e, back: 0x2fd27a },
];
const ARENA = 0x15112a, ARENA_N = 0x0b0916;
const CROWD = 0x272046, CROWD_N = 0x15112a;
const CARPET = 0x1d2b6c, CARPET_N = 0x111a44;
const LINE = 0x4060c0, LINE_N = 0x26397a;
const POOL = 0x4766c8;
const SKIN = 0xd9a184, HAIR = 0x7a3426, STICK = 0xeeeaf6, GRIP = 0x8a8296;

function levels(c) {
  return {
    base: to565(c), light: to565(mix(c, 0xffffff, 0.38)), dark: to565(mix(c, 0x000000, 0.3)),
    glint: to565(mix(c, 0xffffff, 0.72)), edge: to565(mix(c, 0x000000, 0.5)), rim: to565(mix(mix(c, 0x000000, 0.62), ARENA, 0.25)),
  };
}
const PAL = RIB.map((r) => [levels(r.front), levels(r.back)]);

// ------------------------------------------------------------ the arena, precomputed (day and night)

function arena(night) {
  const b = new Uint16Array(W * H);
  const n = night ? 1 : 0;
  const A = to565(n ? ARENA_N : ARENA), C = to565(n ? CROWD_N : CROWD);
  const P = to565(n ? CARPET_N : CARPET), L = to565(n ? LINE_N : LINE);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let c = A;
    // the crowd: two rows of heads and shoulders, dim
    if (y >= 46 && y < 60) {
      const row = y < 53 ? 0 : 1, yy = y - (row ? 53 : 46), px = (x + row * 3) % 6;
      const head = yy >= 1 && yy <= 2 && px >= 2 && px <= 3, body = yy >= 3 && yy <= 6 && px >= 1 && px <= 4;
      if ((head || body) && (hash(Math.floor((x + row * 3) / 6), row, 7) & 3) !== 0) c = C;
    }
    if (y >= 63) c = P;
    if (y === 63) c = L;
    b[y * W + x] = c;
  }
  return b;
}
const BG = arena(false), BG_N = arena(true);
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

// ------------------------------------------------------------ helpers

// every steady motion repeats a whole number of times a minute, so nothing jumps when sec wraps
const WS = TAU * 16 / 60, WR = TAU * 58 / 60, WW = TAU * 124 / 60, WN = TAU * 57 / 60;
const sm = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const eio = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : 0.5 - 0.5 * cos(PI * x));
const prog = (v, a, b) => (v <= a ? 0 : v >= b ? 1 : (v - a) / (b - a));
const hump = (x) => (x <= -1 || x >= 1 ? 0 : 0.5 + 0.5 * cos(PI * x));
const bump = (v, a, b) => { const p = prog(v, a, b); return p <= 0 || p >= 1 ? 0 : sin(PI * p); };

// ------------------------------------------------------------ the coil

// Between two numerals the ribbon is wound into a small hairline coil low in
// its slot: about a third of the numeral's height, open at both ends, turning
// as the gymnast circles her stick. It never looks like a numeral (no
// full-height loop, no stem).
const C_X = 12, C_Y = 31.5, C_R0 = 6.8, C_R1 = 2, C_TURNS = 1.3, NL = 6;
/** Sample i of the coil: a short lead from the stick tip, then the coil, wound by psi and lifted by fy. */
function coil(i, psi, fy, tx, ty, out) {
  if (i < NL) {
    coil(NL, psi, fy, tx, ty, out);
    const v = i / NL;
    out[0] = tx + (out[0] - tx) * v; out[1] = ty + (out[1] - ty) * v;
    return;
  }
  const v = (i - NL) / (NS - 1 - NL);
  const rho = C_R0 - (C_R0 - C_R1) * v, phi = PI / 2 + psi - TAU * C_TURNS * v;
  out[0] = C_X + rho * cos(phi); out[1] = C_Y - fy + rho * sin(phi);
}

// ------------------------------------------------------------ the stick's motion (what runs down the ribbon)

const STK = [0, 0];
/** Where the stick end is pushed at time tau (s into the minute) for slot k. */
function stickAt(k, tau, jt, jh, job, out) {
  const b = Math.floor(tau), u = tau - b, dir = ((b + k) & 1) ? 1 : -1;
  const dec = (1 - u) * (1 - u) * (1 - u);
  let x = 1.35 * sin(PI * tau + 1.3 * k) + 1.8 * dir * dec * sin(TAU * 1.5 * u);
  let y = 0.5 * sin(TAU * tau / 3 + k) - 1.3 * dec * sin(PI * (u * 2.2 < 1 ? u * 2.2 : 1));
  const tm = tau < 0 ? tau + 60 : tau;
  // :30 the penche runs down the line and lifts each ribbon in turn
  const pl = bump(tm, 30 + 0.18 * k, 31.5 + 0.18 * k);
  y -= 2.4 * pl * pl;
  if (job && job.change) {
    // the landing wobble after a turn
    const v = prog(jt, 0.6, 1.7);
    if (v > 0 && v < 1) { const a = 1.5 * (1 - v) * (1 - v) * sin(TAU * 2 * v); x += a; y -= 0.6 * a; }
  } else if (job && job.hour) y -= 7 * bump(jh, -0.65, 0.45);   // an unchanged ribbon rides up with its gymnast's leap
  out[0] = x; out[1] = y;
}

// ------------------------------------------------------------ the frame

const X = new Float32Array(NS), Y = new Float32Array(NS), EXT = new Float32Array(NS);
const P = [0, 0];
/** The last frame's centre lines (x of slots 0-3, then y), for the motion tests. */
export const LINES = Array.from({ length: 8 }, () => new Float32Array(NS));
const LK = { k: 0, t: 0, folds: null, fpos: [0, 0, 0], fw: 0, thinF: -1e9, thinW: 1, thinIn: false, whirl: 0, flip: 0 };

/** The look of ribbon k along its length: twist (face and width), sheen, ripple. */
function look(S, L) {
  const k = LK.k, t = LK.t, pal = PAL[k];
  const nf = LK.folds.length;
  for (let fi = 0; fi < nf; fi++) LK.fpos[fi] = LK.foldAt(fi, S, L);
  const beat = Math.floor(t), pulse = 1 - LK.whirl;
  for (let s = 0, n = Math.ceil(L) + 1; s <= n; s++) {
    let th = 0.42 * sin(0.13 * s - WS * t + k) + LK.flip0;
    // the turnover fronts (:15, :45)
    if (LK.flipF > -100) { const v = (LK.flipF - s) / 14; th += PI * (v <= 0 ? 0 : v >= 1 ? 1 : v * v * (3 - 2 * v)); }
    // folds: creases (sharp) or, during a turn, soft twists sliding along
    for (let fi = 0; fi < nf; fi++) {
      const fp = LK.fpos[fi];
      if (LK.fw < 0.5) { if (s >= fp) th += PI; }
      else { const v = (s - fp) / LK.fw + 0.5; th += PI * (v <= 0 ? 0 : v >= 1 ? 1 : v * v * (3 - 2 * v)); }
    }
    // the beat's twist pulses, stick to tail
    let bulge = 0;
    // (and a smaller one on the off-beat)
    for (let b2 = 2 * beat + 1; b2 > 2 * beat - 6; b2--) {
      const b = b2 / 2, on = (b2 & 1) === 0;
      const h = hump((s - 70 * (t - b)) / (on ? 9 : 6)) * pulse;
      if (h > 0) { th += (on ? PI : 0.75 * PI) * h; bulge += h * (on ? ((beat & 1) ? 0.9 : -0.9) : 0.4); }
    }
    if (LK.whirl > 0) th += LK.whirl * 1.7 * sin(0.33 * s - WW * t);
    const c = cos(th), sn = sin(th), ac = c < 0 ? -c : c;
    const p = c >= 0 ? pal[0] : pal[1];
    // thin: edge-on during a turn (a front running from the stick)
    const tv = LK.thinIn ? (s - LK.thinF) / LK.thinW : (LK.thinF - s) / LK.thinW;
    const thin = LK.thinAll * (tv <= 0 ? (LK.thinIn ? 0 : 0) : tv >= 1 ? 1 : tv * tv * (3 - 2 * tv)) + LK.thinBase;
    const th1 = thin > 1 ? 1 : thin;
    let hw = LK.hw0 * (0.32 + 0.68 * ac);
    hw += (0.9 - hw) * th1;
    LOOK.hw[s] = hw;
    LOOK.off[s] = (0.6 * sin(0.42 * s - WR * t) + bulge) * (s < 14 ? s / 14 : 1) * (1 - th1);
    LOOK.fill[s] = th1 > 0.5 ? (sn > 0 ? p.glint : p.light)
      : ac < 0.3 ? (sn > 0 ? p.glint : p.edge) : ac < 0.72 ? (sn > 0 ? p.light : p.dark) : p.base;
    LOOK.rim[s] = p.rim;
  }
}

const FLY = 0.55;
/**
 * This minute's job for each slot near a turn: from, to, tau (s from :00),
 * hour, change, fly (tossed at the hour) and tt, the slot's own timeline
 * (tau with the flight cut out).
 */
function jobs(ctx) {
  const f = ctx.fields, s = f.sec, cur = f.hh + f.mm;
  const out = [null, null, null, null];
  if (s >= 30) {
    const n = clockFields(new Date(ctx.date.getTime() + 60000)), nx = n.hh + n.mm, hour = n.h !== f.h;
    for (let k = 0; k < 4; k++) out[k] = { from: cur[k], to: nx[k], tau: s - 60, hour, change: nx[k] !== cur[k] };
  } else {
    const p = clockFields(new Date(ctx.date.getTime() - 60000)), px = p.hh + p.mm, hour = p.h !== f.h;
    for (let k = 0; k < 4; k++) out[k] = { from: px[k], to: cur[k], tau: s, hour, change: px[k] !== cur[k] };
  }
  for (let k = 0; k < 4; k++) {
    const j = out[k];
    if (j.tau < -2.4 || j.tau > 4.5) { out[k] = null; continue; }
    // a changing hour digit at the hour is tossed: its timeline is split by a 1.1 s flight
    j.fly = j.hour && j.change && k < 2;
    j.tt = j.fly ? (j.tau < -FLY ? j.tau + FLY : j.tau > FLY ? j.tau - FLY : 0) : j.tau;
  }
  return out;
}

export default {
  name: 'Ribbon',
  blurb: 'A rhythmic gymnastics group writes the time in satin ribbons, creased at the corners; each minute a ribbon winds into a coil and unwinds as the new numeral.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, t = f.sec, night = ctx.night;
    ctx.lcd.backlight(1 - 0.5 * night);

    // ---- the arena
    const buf = g.buf;
    if (night <= 0) buf.set(BG);
    else if (night >= 1) buf.set(BG_N);
    else for (let i = 0, y = 0; y < H; y++) for (let x = 0; x < W; x++, i++) buf[i] = night > BAYER[((y & 3) << 2) | (x & 3)] ? BG_N[i] : BG[i];
    g.cost.px += W * H; g.cost.box += night > 0 && night < 1 ? W * H : 0;

    const J = jobs(ctx);
    const anyHour = J.some((j) => j && j.hour);
    flashes(g, t, anyHour ? J.find((j) => j)?.tau : null, night);
    // the follow spots: a pool of light on the carpet under each gymnast, moving with her steps
    for (let k = 0; k < 5; k++) {
      const z = k < 4 ? SC[k] : 0.8, x = k < 4 ? GX[k] + 1.2 * z * cos(PI * t + k) : 80, y = k < 4 ? FOOT[k] : 69.5;
      g.fillEllipse(x, y - 0.3, 8.5 * z, 2.1 * z, POOL, { aa: true, a: 0.55 * (1 - 0.45 * night) });
    }
    const tips = [];

    // ---- the four ribbons
    for (let k = 0; k < 4; k++) {
      const job = J[k], ch = job && job.change;
      const Gf = GLYPHS[ch ? job.from : (f.hh + f.mm)[k]], Gt = ch ? GLYPHS[job.to] : Gf;
      const tau = job ? job.tt : 0, fly = job && job.fly;
      // which numeral's creases, and how far they have let go
      let G = Gf, soft = 0, slide = 0, whirl = 0;
      LK.thinAll = 0; LK.thinF = -1e9; LK.thinW = 14; LK.thinIn = false; LK.thinBase = 0;
      if (ch) {
        if (tau < 0) {
          soft = prog(tau, -0.85, -0.45); slide = eio(soft);
          const fr = eio(prog(tau, -1.0 + 0.05 * k, -0.6 + 0.05 * k));
          LK.thinAll = 1; LK.thinF = fr * (Gf.L + 30) - 14;
        } else {
          G = Gt; soft = 1 - prog(tau, 0.35, 0.8); slide = eio(soft);
          const fr = eio(prog(tau, 0.5 + 0.05 * k, 0.9 + 0.05 * k));
          LK.thinAll = 1; LK.thinIn = true; LK.thinF = fr * (Gt.L + 30) - 14;
        }
        whirl = bump(tau, -0.75, 0.75);
      }
      const sc = SC[k];
      LK.k = k; LK.t = t; LK.folds = G.folds; LK.whirl = whirl; LK.hw0 = HW * sc;
      LK.fw = 16 * soft;
      LK.foldAt = (fi, S, L) => { const s0 = S[G.folds[fi]]; return s0 + (L + 20 - s0) * slide; };
      // the turnover fronts at :15 and :45
      LK.flip0 = t >= 45 + 1.6 ? TAU : t >= 15 + 1.6 ? PI : 0; LK.flipF = -1e9;
      if (t >= 15 && t < 16.6) { LK.flip0 = 0; LK.flipF = (t - 15) * 110 - 14; }
      if (t >= 45 && t < 46.6) { LK.flip0 = PI; LK.flipF = (t - 45) * 110 - 14; }

      // the centre line: the numeral, or a numeral on its way through the coil
      const ox = OX[k];
      const endF = Gf.end, endT = Gt.end;
      let tx = endF[0], ty = endF[1], psi = 0, fy = 0;
      if (ch) {
        const e = eio(prog(tau, -0.7, 0.7));
        tx = endF[0] + (endT[0] - endF[0]) * e + 2.2 * whirl * sin(TAU * 1.5 * tau);
        ty = endF[1] + 1.4 * whirl * cos(TAU * 1.5 * tau) - 1.2 * whirl;
        // the coil turns as she circles the stick, and turns over once in the air when tossed
        psi = -2.4 * eio(prog(tau, -0.7, 0.7));
        if (fly) {
          const q = prog(job.tau, -FLY, FLY);
          psi -= TAU * eio(q);
          fy = 72 * q * (1 - q);                 // a toss 18 px high
          // the stick goes up inside the coil: the lead shortens to nothing before the throw
          const hold = sm(prog(job.tau, -FLY - 0.25, -FLY)) * (1 - sm(prog(job.tau, FLY, FLY + 0.25)));
          if (hold > 0) {
            coil(NL, psi, fy, tx, ty, P);
            tx += (P[0] - tx) * hold; ty += (P[1] - ty) * hold;
          }
        }
      }
      const damp = 1 - 0.5 * whirl, eT = ch ? eio(prog(tau, -0.7, 0.7)) : 0;
      for (let i = 0; i < NS; i++) {
        const u = i / (NS - 1);
        let x, y;
        if (!ch) { x = Gf.x[i]; y = Gf.y[i]; }
        else {
          coil(i, psi, fy, tx, ty, P);
          const D = tau < 0 ? Gf : Gt;
          // the stick end first, the tail last; a 0.5 s glide each way
          const w = tau < 0 ? eio(prog(tau, -0.65 + 0.1 * u, -0.15 + 0.1 * u)) : 1 - eio(prog(tau, 0.05 + 0.1 * u, 0.55 + 0.1 * u));
          // along an arc: the straight path bowed sideways, the same way for every point (a swirl)
          const dx = P[0] - D.x[i], dy = P[1] - D.y[i], bow = 0.28 * sin(PI * w);
          x = D.x[i] + dx * w - dy * bow; y = D.y[i] + dy * w + dx * bow;
        }
        const dl = (Gf.s[i] + (Gt.s[i] - Gf.s[i]) * eT) / 60;   // the wave's delay follows the ribbon it runs down
        stickAt(k, t - dl, job ? job.tt - dl : 0, job ? job.tau - dl : 0, job, STK);
        X[i] = ox + (x + STK[0] * damp) * sc; Y[i] = OY[k] + (y + STK[1] * damp) * sc;
        EXT[i] = 0;
      }
      if (soft < 1) for (const fi of G.folds) EXT[fi] = 2.5 * (1 - soft);
      drawRibbon(g, X, Y, EXT, look);
      LINES[k].set(X); LINES[k + 4].set(Y);
      tips.push([X[0], Y[0], job]);
    }

    // ---- the gymnasts
    for (let k = 0; k < 4; k++) drawGymnast(g, k, t, tips[k], night);
    juggler(g, t, anyHour ? J.find((j) => j).tau : null, night);
  },
};

// ------------------------------------------------------------ the gymnasts' routine

const POSE = { x: 0, hip: 0, lean: 0, face: 1, legs: [[0, 0], [0, 0]], arm: [0, 0], arm2: [2.6, -0.2], tip: null, stick: 8, release: 0, sc: 1 };
const COLS = RIB.map((r) => ({ leo: mix(r.back, 0x000000, 0.12), skin: SKIN, skinFar: mix(SKIN, ARENA, 0.35), hair: HAIR, stick: STICK, grip: GRIP }));

function drawGymnast(g, k, t, tip, night) {
  const [tx, ty, job] = tip;
  const face = k < 2 ? 1 : -1;
  const p = POSE;
  // the step: weight shifts every beat, the free knee lifts, the arm sways
  const b = Math.floor(t), u = t - b, side = (b + k) & 1;
  const kn = sin(PI * u); const lift1 = kn * kn * 0.5;
  p.x = GX[k] + 1.2 * SC[k] * cos(PI * t + k);
  const z = SC[k];
  p.sc = z;
  p.hip = FOOT[k] - 13.5 * z - 0.6 * kn * z;
  p.lean = 0.04 * sin(PI * t);
  p.face = face;
  p.legs[0][0] = 0.14 + (side ? lift1 : 0); p.legs[0][1] = side ? 2 * lift1 : 0.05;
  p.legs[1][0] = -0.14 + (side ? 0 : lift1 * 0.8); p.legs[1][1] = side ? 0.05 : 2 * lift1;
  p.arm[0] = 2.3 + 0.35 * sin(PI * t + k); p.arm[1] = -0.3;
  // :15 and :45, pirouettes (a full turn on one foot, the other knee up)
  for (const t0 of [15, 45]) {
    const e = sm(prog(t, t0, t0 + 0.25)) * (1 - sm(prog(t, t0 + 1.35, t0 + 1.6)));
    if (e > 0) {
      p.face = face * cos(TAU * eio(prog(t, t0 + 0.1, t0 + 1.45)));
      p.legs[0][0] += (0.95 - p.legs[0][0]) * e; p.legs[0][1] += (2.0 - p.legs[0][1]) * e;
      p.legs[1][0] *= 1 - e; p.legs[1][1] *= 1 - e;
      p.hip -= 1.2 * e * z; p.arm[0] += (2.9 - p.arm[0]) * e;
    }
  }
  // :30 a penche runs down the line: lean forward, the back leg high
  const pe = bump(t, 30 + 0.18 * k, 31.5 + 0.18 * k);
  if (pe > 0) {
    p.lean += 0.95 * pe; p.legs[1][0] += (-1.9 - p.legs[1][0]) * pe; p.legs[1][1] *= 1 - pe;
    p.legs[0][0] *= 1 - pe; p.legs[0][1] *= 1 - pe; p.arm[0] += (1.5 - p.arm[0]) * pe;
  }
  p.tip = [tx, ty]; p.stick = 8 * z;
  let air = 0;
  if (job) {
    const tau = job.tau, tt = job.tt;
    // anticipation: a crouch before the figure
    const cr = (job.change ? bump(tt, -1.3, -0.45) : 0) + (job.hour ? bump(tau, -1.25, -0.6) * 0.6 + bump(tau, 0.3, 1.0) * 0.8 : 0);
    p.hip += 2.6 * cr * z; p.lean += 0.3 * cr;
    p.legs[0][0] += 0.5 * cr; p.legs[0][1] += 1.0 * cr; p.legs[1][0] -= 0.25 * cr; p.legs[1][1] += 0.8 * cr;
    if (job.hour) {
      // everyone leaps: a split in the air
      const lp = bump(tau, -0.65, 0.45);
      p.hip -= 7 * lp * z; p.lean -= 0.1 * lp;
      p.legs[0][0] += (1.35 - p.legs[0][0]) * lp; p.legs[0][1] *= 1 - lp;
      p.legs[1][0] += (-1.25 - p.legs[1][0]) * lp; p.legs[1][1] *= 1 - lp;
      p.arm[0] += (3.0 - p.arm[0]) * lp;
      if (job.fly) air = sm(prog(tau, -FLY - 0.15, -FLY + 0.12)) * (1 - sm(prog(tau, FLY - 0.12, FLY + 0.15)));
    }
    if (job.change && !job.fly) {
      // she spins as she winds the ribbon in and out
      const e = eio(prog(tt, -0.75, 0.75));
      p.face = face * cos(TAU * 2 * e);
    }
    if (job.change) { const up = bump(tt, 0.65, 1.8); p.arm[0] += (3.0 - p.arm[0]) * up; }
  }
  const C = COLS[k];
  // the stick in the air: her hand lets go and rises after it
  p.release = air; p.arm2[0] = 2.9; p.arm2[1] = 0;
  const r = gymnast(g, p, C, sin, cos);
  if (air > 0) {
    // the tossed stick turns over once, pointing back at her hand when it leaves and when it is caught
    const a = Math.atan2(r.ik[1] - ty, r.ik[0] - tx) + TAU * eio(prog(job.tau, -FLY, FLY));
    // its length blends from the held stick's (hand to tip) to its own as it leaves the hand, and back
    const lh = Math.sqrt((r.ik[0] - tx) ** 2 + (r.ik[1] - ty) ** 2), len = lh + (8 * z - lh) * air;
    const hx = tx + len * cos(a), hy = ty + len * sin(a);
    g.thickLine(tx, ty, hx, hy, 1.1, STICK, { aa: true });
    g.fillCircle(hx, hy, 1.0, GRIP, { aa: true });
  }
}

// ------------------------------------------------------------ the juggler (the colon)

const JPOSE = { x: 80, sc: 0.8, hip: 58.7, lean: 0, face: 1, legs: [[0.1, 0.05], [-0.1, 0.05]], arm: [2.6, -0.5], arm2: [2.5, -0.6], tip: null, stick: 0 };
const JCOL = { leo: 0x5a5a8e, skin: SKIN, skinFar: mix(SKIN, ARENA, 0.35), hair: HAIR };
const BALL = 0xf0ecff, BALL_D = 0xa096d0;

function juggler(g, t, hourTau, night) {
  const p = JPOSE;
  p.hip = 58.7 - 0.4 * sin(PI * t) ** 2;
  p.arm[0] = 2.75 + 0.15 * sin(PI * t); p.arm2[0] = 2.45 - 0.15 * sin(PI * t);
  const r = gymnast(g, p, JCOL, sin, cos);
  const [ax, ay] = r.free, [bx, by] = r.hand;
  const high = hourTau !== null ? 10 * bump(hourTau, -1, 1.2) : 0;
  for (let j = 0; j < 2; j++) {
    // a shower: each ball flies a beat from one hand to the other
    const q = t + j, n = Math.floor(q), v = q - n, fwd = (n & 1) === 0;
    const x0 = fwd ? ax : bx, x1 = fwd ? bx : ax, y0 = fwd ? ay : by, y1 = fwd ? by : ay;
    const hgt = 12 + 0.8 * high;
    const x = x0 + (x1 - x0) * v, y = y0 + (y1 - y0) * v - 4 * hgt * v * (1 - v) - 2.2;
    g.fillCircle(x, y, 2.2, BALL_D, { aa: true });
    g.fillCircle(x - 0.4, y - 0.4, 1.5, BALL, { aa: true });
  }
}

// ------------------------------------------------------------ camera flashes in the crowd

function flashes(g, t, hourTau, night) {
  const b = Math.floor(t);
  const n = hourTau !== null && hourTau > -0.2 && hourTau < 3 ? 6 : 2;
  for (let bb = b - 1; bb <= b; bb++) for (let j = 0; j < n; j++) {
    const h = hash(bb, j, 91);
    const t0 = bb + (h & 1023) / 1024, age = t - t0;
    if (age < 0 || age > 0.3) continue;
    const x = 2 + ((h >>> 10) % 156), y = 47 + ((h >>> 20) % 11);
    const a = (age < 0.05 ? age / 0.05 : 1 - (age - 0.05) / 0.25) * (1 - 0.6 * night);
    g.pixel(x, y, 0xffffff, { a });
    g.pixel(x - 1, y, 0xc8c0ff, { a: a * 0.5 }); g.pixel(x + 1, y, 0xc8c0ff, { a: a * 0.5 });
    g.pixel(x, y - 1, 0xc8c0ff, { a: a * 0.5 }); g.pixel(x, y + 1, 0xc8c0ff, { a: a * 0.5 });
  }
}
