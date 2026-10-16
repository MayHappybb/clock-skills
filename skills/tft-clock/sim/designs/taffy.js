// Taffy: the window of a candy shop, where the time is four lengths of
// freshly pulled, candy-striped taffy hung on the brass hooks of a pulling
// rail. Each numeral is ONE rope of taffy laid in the shape of its digit
// (taffy-glyphs.js: fat round bends, a rope's own way of turning a corner,
// the 8 crossing itself at the waist, a loop's end tucked over its start).
// Below them, in the counter, is the pulling machine: one steel pin per
// digit, the pins that pull taffy.
//
// The time is alive, the way soft candy hangs: once a second the rail's
// ratchet tugs every hook up, and each rope follows late from top to bottom,
// stretches, squashes and wobbles to rest (the bottom lags: follow-through);
// all the while the digits sway like pendulums, a slow tick-tock with the
// bottoms trailing, and the stripes wind along every rope (the candy turns
// on its hook), a notch on each beat. Every 15 s a bigger move: :15 a swing
// wave runs down the rail, :30 the pins rise and give each digit a long
// stretch and let go (boing), :45 the ropes twist hard and a glint runs
// along each one. The wrapped pieces of the last batch ride out on the
// counter belt all the time.
//
// Minute turn, one continuous pull per changing digit: its pin dips, rises
// and catches the rope from below (the digit squashes up in anticipation),
// pulls it down long and thin (still the old digit, stretched), then swings
// up in an arc and folds the rope over onto the hook: the digit collapses,
// bottom first, into a twisted skein of four strands hanging from the hook
// (no digit at :00). The pin draws the skein down again and the rope is laid
// out, top first, as the new digit, still stretched; the pin lets go and the
// new numeral springs up, overshoots and settles. Changing digits work
// together, the units digit a beat ahead. Hour: the big pull: every pin
// catches its digit at once, unchanged ones are stretched and held while
// the others fold, and the next batch's flavour is folded into every rope
// from its hook outwards; all four are released together.
//
// Palette, a candy shop's: a dark cocoa wall (calm, one flat colour) so the
// candy is the brightest thing on the glass; two flavours a batch, hours one
// and minutes the other (strawberry and mint, lemon and blueberry, orange
// and grape, then swapped), each a saturated body with cream stripes, one
// cel shadow band and one gloss line (the only light effects, with the
// glint); a near-black keyline round every rope and its shadow on the wall;
// brass for the rail, steel for hooks and pins, a mint enamel counter. By
// night the shop lights go down (backlight 45 %), the wall sinks to
// near-black cocoa and the candy keeps its colour.
//
// Cost: ropes are stamped as capsules into a small G-buffer (taffy-rope.js,
// ~25k tested pixels a frame) and shaded through 60-entry tables; points
// are closed-form from the clock, nothing is simulated, nothing cached.

import { clockFields, sin, cos, clamp, to565 } from '../js/kit.js';
import { GLYPHS, N, BOX_H } from './taffy-glyphs.js';
import { begin, stamp, shade, flavourLUT } from './taffy-rope.js';

const W = 160, H = 80;
const SLOT_CX = [21, 50, 110, 139];
const HOOK_Y = 11, R0 = 3.0;
const PIN_IDLE = 66.5, COUNTER_Y = 71;

// ------------------------------------------------------------ colour
const KEYLINE = 0x170a06;
const WALL = 0x3d2419, WALL_N = 0x221309, SHADOW = 0x27150e, SHADOW_N = 0x150a05;
const FLAV = {
  straw: [0xff4f8b, 0xfff1e2, 0xffd6e4],
  mint: [0x2ee0a8, 0xf4fff4, 0xd6fff0],
  lemon: [0xffcf2e, 0xff5c7c, 0xfff6c8],
  blue: [0x5f7dff, 0xeef1ff, 0xdbe2ff],
  orange: [0xff8a2a, 0xfff0dc, 0xffe0bc],
  grape: [0xb068ff, 0xf6ecff, 0xeadcff],
};
const BATCH = [['straw', 'mint'], ['lemon', 'blue'], ['orange', 'grape'], ['mint', 'straw'], ['blue', 'lemon'], ['grape', 'orange']];
const LUTS = {}, CANDY = {};
for (const [k, [b, s, gl]] of Object.entries(FLAV)) { LUTS[k] = flavourLUT(b, s, 0.34, gl, KEYLINE); CANDY[k] = b; }
const lutOf = (h, slot) => LUTS[BATCH[h % 6][slot < 2 ? 0 : 1]];
const flavourOf = (h, k) => BATCH[h % 6][k];
const GLINT = to565(0xffffff);

// ------------------------------------------------------------ timing of a pull (s from the turn)
const A0 = -2.0, A1 = -1.3, S1 = -0.78, F0 = -0.78, F1 = 0.0, L1 = 1.0, REL = 1.0;
const OWN_D = 0.86, DELAY = 0.14; 
const SK_W = 15, SK_H = 15;                  // the skein: a ball of four folded strands under the hook
           // each point's own share of a fold or lay, and the spread

const sm = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const smr = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * x * (x * (x * 6 - 15) + 10));

// the beat: the hook's tug, and the rope's damped wobble after it (tables on the device)
const OSC = new Float32Array(129), BUMP = new Float32Array(129);
for (let k = 0; k <= 128; k++) {
  const x = k / 128;
  OSC[k] = Math.sin(2 * Math.PI * 2.3 * x) * Math.exp(-4.2 * x);
  BUMP[k] = x < 0.08 ? sm(x / 0.08) : 1 - sm((x - 0.1) / 0.45);
}
const look = (T, x) => { if (x <= 0 || x >= 1) return 0; const f = x * 128, i = f | 0; return T[i] + (T[i + 1] - T[i]) * (f - i); };

// ------------------------------------------------------------ per slot working arrays
const PX = [], PY = [], PR = [], PU = [];
for (let i = 0; i < 4; i++) { PX.push(new Float32Array(N)); PY.push(new Float32Array(N)); PR.push(new Float32Array(N)); PU.push(new Float32Array(N)); }
const BRKS = [new Uint8Array(N), new Uint8Array(N), new Uint8Array(N), new Uint8Array(N)];

/** The stretch of a pulled digit at time x (s from the turn). */
function stretchAt(x, stMax, rel) {
  if (x < A0) return 0;
  if (x < A1) return -0.04 * sin(Math.PI * (x - A0) / (A1 - A0));   // anticipation: it squashes up as the pin comes
  if (x < S1) return stMax * smr((x - A1) / (S1 - A1));
  if (x < rel) return stMax;
  const r = x - rel;
  if (r > 2.2) return 0;
  return stMax * Math.exp(-3.6 * r) * cos(2 * Math.PI * 1.45 * r);
}

/** Where the slot's main hook is, and the glyph's rest frame. */
const hookX = (slot, d) => SLOT_CX[slot] - 8.5 + GLYPHS[d].hookX;

export default {
  name: 'Taffy',
  blurb: 'A candy shop window: the time is four ropes of striped taffy hung on brass hooks, bouncing and swaying on the beat; each minute a pulling pin stretches a digit, folds it into a skein and lays it out as the next.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, nt = ctx.night;
    ctx.lcd.backlight(1 - 0.55 * nt);
    const T = f.h * 3600 + f.m * 60 + s;
    const ms = ctx.date.getTime();
    const prv = clockFields(new Date(ms - 60000)), nxt = clockFields(new Date(ms + 60000));
    const cur = f.hh + f.mm;
    const after = s < 10, x0 = after ? s : s - 60;
    const oldS = after ? prv.hh + prv.mm : cur, newS = after ? cur : nxt.hh + nxt.mm;
    const hourOld = after ? prv.h : f.h, hourNew = after ? f.h : nxt.h;
    const hourTurn = hourOld !== hourNew;
    const inTurn = x0 > A0 - 0.1 && x0 < REL + 2.4;
    const wall = nt > 0 ? mixRGB(WALL, WALL_N, nt) : WALL, shadowC = nt > 0 ? mixRGB(SHADOW, SHADOW_N, nt) : SHADOW;

    g.clear(wall);
    counter(g, T, f.h, nt);

    // ---- the four ropes
    begin(g);
    const slots = [], pins = [], hooks = [];
    const beatP = s - Math.floor(s);
    for (let i = 0; i < 4; i++) {
      const X = PX[i], Y = PY[i], Rr = PR[i], U = PU[i];
      let job = null;
      const changing = oldS[i] !== newS[i];
      if (inTurn && changing) job = { kind: 'turn', x: x0 - (0.06 * (3 - i) - 0.09), a: +oldS[i], b: +newS[i], st: hourTurn ? 0.24 : 0.2, rel: REL };
      else if (inTurn && hourTurn) job = { kind: 'pull', x: x0, a: +cur[i], st: 0.22, rel: REL };
      else if (s > 29 && s < 35) job = { kind: 'pull', x: s - (31.3 + 0.24 * i), a: +cur[i], st: 0.15, rel: S1 + 0.35 };
      const d = job ? job.a : +cur[i];

      // the rest motion: tug, wobble, sway (weights fade it out under the pin)
      const lag = 0.035 * i;
      let wRest = 1;
      if (job) {
        const k = job.kind === 'turn' ? 1 : 0.6;
        wRest = 1 - k * sm((job.x - A1) / (S1 - A1)) * (1 - sm((job.x - job.rel) / 0.9));
      }
      const pb = beatP - lag < 0 ? beatP - lag + 1 : beatP - lag;
      const hookTug = -2.6 * look(BUMP, pb) * wRest;
      let swayA = 3.6, swing = 0;
      const fs = s - (14.6 + 0.2 * i);
      if (fs > 0 && fs < 5) swing = 3.4 * sm(fs / 0.3) * Math.exp(-0.75 * fs) * sin(2 * Math.PI * fs / 1.15);
      const swayPh = Math.PI * T - 0.35 * i;

      let hx = hookX(i, d);
      const hy = HOOK_Y + hookTug;
      let st = 0, gA = GLYPHS[d], gB = null, eFold = -1, eLay = -1, phiSk = 0, eU = 0;
      if (job) {
        st = stretchAt(job.x, job.st, job.rel);
        if (job.kind === 'turn') {
          gB = GLYPHS[job.b];
          eFold = (job.x - F0) / (F1 - F0);
          eLay = (job.x - F1) / (L1 - F1);
          eU = sm((job.x - F0) / (L1 - F0));
          hx = hookX(i, job.a) + (hookX(i, job.b) - hookX(i, job.a)) * eU;
          // the skein's bights sit where the pin holds the rope: the old catch while folding, the new one by the lay
          const pa = phaseFor(gA.catchI), pbk = phaseFor(gB.catchI);
          let dp = pbk - pa; if (dp > 0.25) dp -= 0.5; if (dp < -0.25) dp += 0.5;
          phiSk = pa + dp * sm((job.x - (F1 - 0.3)) / 0.6);
          if (job.x >= REL) { gA = gB; }
        }
      }
      // pose the rope
      const sx = 1 - 0.35 * st, sy = 1 + st, rr = R0 * (1 - 0.7 * st);
      const restOn = wRest > 0.001;
      const twist = 1.5, skPh = 3 * T + i;
      for (let k = 0; k < N; k++) {
        let x, y, u, r = rr;
        const gl = (job && job.kind === 'turn' && job.x < F1) || !gB ? gA : gB;
        if (job && job.kind === 'turn' && job.x >= F0 && job.x < L1) {
          // fold (old -> skein) or lay (skein -> new)
          const sk = k / (N - 1);
          const ky = 4 + SK_H * 0.5 * (1 - cos(4 * Math.PI * (sk + phiSk)));
          const kxp = (sk - 0.5) * SK_W + twist * sin(0.3 * ky + skPh);
          const kX = hx + kxp, kY = hy + ky;
          const folding = job.x < F1;
          const G = folding ? gA : gB;
          const nd = clamp(G.y[k] / BOX_H, 0, 1);
          const e = folding ? eFold : eLay;
          const del = folding ? DELAY * (1 - nd) : DELAY * nd;
          // the digit's own shape is kept while it can still be read: folding, it first rolls up
          // (height) and only then loses its plan (width); laying, the plan comes first, then it unrolls.
          // So before :00 a squashed old digit, after :00 a squashed new one, between them the skein.
          const q = (e - del) / OWN_D, q1 = sm(q * 1.3), q2 = sm((q - 0.3) / 0.7);
          const qy = folding ? q1 : q2, qx = folding ? q2 : q1;
          const gX = hx + G.x[k] * (1 - 0.35 * job.st), gY = hy + G.y[k] * (1 + job.st);
          let ax, ay, bx, by;
          if (folding) { ax = gX; ay = gY; bx = kX; by = kY; } else { ax = kX; ay = kY; bx = gX; by = gY; }
          const dx = bx - ax, dy = by - ay, bulge = 0.07 * sin(Math.PI * qy);
          x = ax + dx * qx - dy * bulge; y = ay + dy * qy + dx * bulge;
          const rS = R0 * (1 - 0.7 * job.st);
          r = folding ? rS + (R0 * 0.95 - rS) * qy : R0 * 0.95 + (rS - R0 * 0.95) * qy;
          u = gA.u[k] + (GLYPHS[job.b].u[k] - gA.u[k]) * eU;
        } else {
          x = hx + gl.x[k] * sx; y = hy + gl.y[k] * sy;
          u = job && job.kind === 'turn' ? gA.u[k] + (GLYPHS[job.b].u[k] - gA.u[k]) * eU : gl.u[k];
        }
        if (restOn) {
          const dep = gl.y[k], nd = dep <= 0 ? 0 : dep / BOX_H;
          let pp = pb - 0.0022 * dep; if (pp < 0) pp += 1;
          // the rope follows the hook late, top to bottom, and wobbles in proportion to depth
          const dy = (-2.6 * look(BUMP, pp) + 4.6 * nd * look(OSC, pp - 0.03)) * wRest - hookTug;
          const dx = nd * (swayA * sin(swayPh - 0.6 * nd) + swing * (1 + 0.25 * nd)) * wRest;
          x += dx; y += dy;
        }
        X[k] = x; Y[k] = y; Rr[k] = r; U[k] = u;
      }
      // breaks: only between strokes at rest; while folded the rope is one length
      const brk = BRKS[i];
      const gAb = job && job.kind === 'turn' ? GLYPHS[job.a].brk : GLYPHS[d].brk;
      const gBb = job && job.kind === 'turn' ? GLYPHS[job.b].brk : gAb;
      for (let k = 0; k < N; k++) brk[k] = gAb[k] | gBb[k];
      let merge = 0, under = GLYPHS[d].under;
      if (job && job.kind === 'turn') {
        merge = sm((job.x - F0) / 0.3) * (1 - sm((job.x - (L1 - 0.15)) / 0.4));
        under = (job.x < F1 ? GLYPHS[job.a] : GLYPHS[job.b]).under;
      }
      stamp(i, X, Y, Rr, U, brk, N, under, merge);
      g.cost.box += N * 28;

      // ---- the pin under this digit
      let pinX = SLOT_CX[i], pinY = PIN_IDLE + 0.8 * sin(2 * Math.PI * (T + 0.25 * i));
      if (job) {
        const G = GLYPHS[job.a];
        const catchY = (gg, stv) => hy + gg.y[gg.catchI] * (1 + stv) + R0 * (1 - 0.7 * stv) + 2.4;
        const catchX = (gg, hxx, stv) => hxx + gg.x[gg.catchI] * (1 - 0.35 * stv);
        const jx = job.x;
        if (jx < A0) { /* idle */ } else if (jx < A1) {
          const e = (jx - A0) / (A1 - A0);
          const ty = catchY(G, 0), tx = catchX(G, hookX(i, job.a), 0);
          const dip = 2.2 * sin(Math.PI * clamp(e / 0.45, 0, 1));
          const q = sm((e - 0.3) / 0.7);
          pinX = pinX + (tx - pinX) * q; pinY = pinY + dip * (1 - q) + (ty - pinY - dip) * q;
        } else if (job.kind === 'pull' || jx < F0) {
          if (jx < job.rel) { pinX = catchX(G, hx, st); pinY = catchY(G, st); } else {
            const r = (jx - job.rel) / 0.9, q = sm(r);
            const gg = job.kind === 'turn' ? GLYPHS[job.b] : G;
            const cx0 = catchX(gg, hx, st), cy0 = catchY(gg, st) + 4 * q * q;
            pinX = cx0 + (pinX - cx0) * q; pinY = cy0 + (pinY - cy0) * q;
          }
        } else if (jx < L1) {
          const skBot = hy + 4 + SK_H + R0 * 0.95 + 2.2;
          if (jx < F1) {
            const q = sm((eFold / OWN_D) * 1.3);
            const ax = catchX(G, hookX(i, job.a), job.st), ay = catchY(G, job.st);
            const dx = hx - ax, dy = skBot - ay, b = 0.07 * sin(Math.PI * q);
            pinX = ax + dx * q - dy * b; pinY = ay + dy * q + dx * b;
          } else {
            const gg = GLYPHS[job.b];
            const q = sm(((eLay - DELAY) / OWN_D - 0.3) / 0.7);
            const bx = catchX(gg, hx, job.st), by = catchY(gg, job.st);
            const dx = bx - hx, dy = by - skBot, b = 0.07 * sin(Math.PI * q);
            pinX = hx + dx * q - dy * b; pinY = skBot + dy * q + dx * b;
          }
        } else if (jx < job.rel) {
          const gg = GLYPHS[job.b]; pinX = catchX(gg, hx, st); pinY = catchY(gg, st);
        } else {
          const r = (jx - job.rel) / 0.9, q = sm(r);
          const gg = GLYPHS[job.b];
          const cx0 = catchX(gg, hx, st), cy0 = catchY(gg, st) + 4 * q * q;
          pinX = cx0 + (pinX - cx0) * q; pinY = cy0 + (pinY - cy0) * q;
        }
      }
      pins.push([pinX, pinY]);
      hooks.push([hx, hy]);

      // ---- colour: this batch, and the next one folded in at the hour
      let lut = lutOf(f.h, i), lutB = lut, front = 0;
      if (inTurn && hourTurn) {
        lut = lutOf(hourOld, i); lutB = lutOf(hourNew, i);
        front = changing ? 170 * sm((x0 - F0) / 1.1) : 170 * sm((x0 - S1) / 1.5);
        if (front >= 169) { lut = lutB; front = 0; }
      }
      // the stripes wind along the rope: steady, a notch on each beat, and the :45 twist
      const fl = Math.floor(T), notch = fl + sm((T - fl - lag) / 0.35);
      let wind = 4.5 * T + 3 * notch;
      const tw = s - (44.6 + 0.15 * i);
      if (tw > -1 && tw < 4) wind += 26 * smr(tw / 1.8);
      if (inTurn && changing) wind += 18 * smr((x0 - F0) / (L1 - F0 + 0.4));   // the hank is twisted while it hangs folded
      const glint = tw > 0 && tw < 2.2 ? -10 + 160 * sm(tw / 2.0) : -999;
      slots.push({ lut, lutB, front, uHook: U[GLYPHS[d].hookI], tauQ: Math.round(-wind * 4 + i * 9) & 255, glint });
    }
    shade(g, slots, to565(wall), to565(shadowC), GLINT);

    if (inTurn && hourTurn) colon(g, T, beatP, hourOld, nt, hourNew, sm((x0 + 0.4) / 1.2));
    else colon(g, T, beatP, f.h, nt);
    for (let i = 0; i < 4; i++) pin(g, pins[i][0], pins[i][1]);
    for (let i = 0; i < 4; i++) hook(g, hooks[i][0], hooks[i][1]);
    rail(g, nt);
  },
};

/** Skein phase that puts a bight (bottom of a strand) at rope point ci. */
function phaseFor(ci) {
  const s = ci / (N - 1);
  let p = 0.25 - s;
  p -= Math.floor(p * 2) / 2;
  return p;
}

function mixRGB(a, b, u) {
  const r = ((a >> 16) & 255) + ((((b >> 16) & 255) - ((a >> 16) & 255)) * u);
  const g = ((a >> 8) & 255) + ((((b >> 8) & 255) - ((a >> 8) & 255)) * u);
  const c = (a & 255) + (((b & 255) - (a & 255)) * u);
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(c);
}

// ------------------------------------------------------------ the shop around the time

const BRASS = 0xdcae55, BRASS_HI = 0xfbe6a6, BRASS_LO = 0x7f5720;
const ROD = 0x56423a, STEEL = 0xd2d8e0, STEEL_HI = 0xffffff, STEEL_LO = 0x5d6470;

function rail(g, nt) {
  g.fillRect(0, 0, W, 4, BRASS);
  g.fillRect(0, 1, W, 1, BRASS_HI);
  g.fillRect(0, 3, W, 1, BRASS_LO);
  for (const x of [2, 154]) { g.fillRect(x, 0, 4, 6, BRASS_LO); g.fillRect(x + 1, 4, 2, 1, BRASS); }
  void nt;
}

/** The main hook: a steel J from the rail, its tip curled up in front of the rope. */
function hook(g, x, y) {
  g.thickLine(x, 3, x, y + 1.4, 1.7, STEEL_LO, { aa: true });
  g.thickLine(x - 0.3, 3, x - 0.3, y + 0.6, 0.8, STEEL, { aa: true });
  g.stroke([[x, y + 1.4], [x + 1.6, y + 2.4], [x + 3.2, y + 1.2], [x + 3.4, y - 1.2]], 1.6, STEEL, { aa: true });
}

/** A puller pin: a steel rod up out of the counter with a round head. */
function pin(g, x, y) {
  if (y < COUNTER_Y) {
    // the rod stays dim and thin: mechanism, not a stroke that could read as a 1
    g.thickLine(x, y + 1.5, x, COUNTER_Y + 0.5, 1.1, ROD, { aa: true });
  }
  g.fillCircle(x, y, 2.6, STEEL_LO, { aa: true });
  g.fillCircle(x - 0.2, y - 0.2, 1.9, STEEL, { aa: true });
  g.fillCircle(x - 0.8, y - 0.8, 0.7, STEEL_HI, { aa: true });
}

const ENAMEL = 0x2f8b7c, ENAMEL_HI = 0x8fe3d0, ENAMEL_LO = 0x1b544b, BELT = 0x183e38;
const WRAP = 0xf4ead4, WRAP_LO = 0xb9ad98;

/** One wrapped piece of taffy: a pillow of candy in wax paper twisted at both ends. */
function candy(g, x, y, c) {
  g.fillPolygon([[x - 3, y], [x - 6.5, y - 2.6], [x - 6.5, y + 2.6]], WRAP_LO, { aa: true });
  g.fillPolygon([[x + 3, y], [x + 6.5, y - 2.6], [x + 6.5, y + 2.6]], WRAP_LO, { aa: true });
  g.fillPolygon([[x - 3, y], [x - 6, y - 2], [x - 6, y + 1.6]], WRAP, { aa: true });
  g.fillPolygon([[x + 3, y], [x + 6, y - 2], [x + 6, y + 1.6]], WRAP, { aa: true });
  g.fillEllipse(x, y, 4.3, 3.1, KEYLINE, { aa: true });
  g.fillEllipse(x, y, 3.4, 2.3, c, { aa: true });
  g.fillRect(Math.round(x - 2), Math.round(y - 2), 2, 1, WRAP);
}

/** The counter: mint enamel, the pins' slot, and the belt of wrapped pieces. */
function counter(g, T, h, nt) {
  g.fillRect(0, COUNTER_Y, W, H - COUNTER_Y, ENAMEL);
  g.fillRect(0, COUNTER_Y, W, 1, ENAMEL_HI);
  g.fillRect(0, COUNTER_Y + 1, W, 1, ENAMEL_LO);
  g.fillRect(0, 74, W, 6, BELT);
  // the belt: pieces ride out left, one flavour then the other
  // each piece keeps the flavour of the batch it was cut from, so a new batch rides in after the hour
  const speed = 9, pos = T * speed, off = pos % 26, first = Math.floor(pos / 26);
  for (let k = -1; k < 8; k++) {
    const x = W + 6 - (k * 26 + off), idx = first - k;
    const born = (idx * 26) / speed + 12, hb = Math.floor((born < 0 ? born + 86400 : born) / 3600) % 24;
    candy(g, x, 77, CANDY[flavourOf(hb, idx & 1)]);
  }
  void h; void nt;
}

/** The colon: two wrapped pieces on a string from the rail, swaying with the beat. */
function colon(g, T, p, h, nt, mixTo = -1, mixU = 0) {
  const sw = 1.2 * sin(Math.PI * T - 0.5), bob = -1.2 * look(BUMP, p - 0.05 < 0 ? p + 0.95 : p - 0.05);
  const x0 = 80, xa = x0 + sw * 0.55, xb = x0 + sw;
  g.thickLine(x0, 3, xb, 41 + bob, 0.9, 0x9a8a78, { aa: true });
  const c0 = CANDY[flavourOf(h, 0)], c1 = CANDY[flavourOf(h, 1)];
  candy(g, xa, 26 + bob * 0.8, mixTo < 0 ? c0 : mixRGB(c0, CANDY[flavourOf(mixTo, 0)], mixU));
  candy(g, xb, 42 + bob, mixTo < 0 ? c1 : mixRGB(c1, CANDY[flavourOf(mixTo, 1)], mixU));
  void nt;
}
