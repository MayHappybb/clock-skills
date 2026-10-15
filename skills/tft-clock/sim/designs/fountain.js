// Fountain: the time is a musical fountain show on a night lake. Each numeral
// is a water sculpture: jets leave a nozzle at its foot, run up and round its
// strokes as streaming water (flow lanes slide along every stroke, a ripple
// runs up it), taper as they climb and drip off their free ends. Thirteen
// nozzles behind them play the music: a 1 s beat kicks every jet higher and
// sends a swelling slug of water up through every numeral, from the nozzle to
// the tips, where a drop falls. The show changes figure every 5 s (a wave
// running right, alternate jets on the beat, a leaning V, all swaying), and
// every 15 s the salute: all jets high and fanned, and two corner cannons
// throw long arcs across the strip. The pool below ripples and holds a
// broken reflection.
//
// Minute turn: the pumps cut at :59.3, the show collapses, and at :59.45 the
// old numeral lets go: its water falls as rain into the pool (it thins, never
// thickens into another digit). After :00 new water shoots up from the pool
// and lands in place, all over the digit at once, and the pumps restart.
// Hour: the finale: every nozzle at full height, leaning as one wave, the
// cannons arching over the time, and water fireworks bursting from the top
// edge on every beat for 10 s.
//
// Colour: the pair is a lit fountain at night: aqua #7fe6ff water under the
// floodlights on deep night water #04121c. Strict 1-bit: the frame is a
// Uint8Array mask, written to the glass as these two values. Night only
// lowers the backlight.
//
// Type: ten numerals drawn as jet paths (fountain-glyphs.js), a monoline
// with tapering ends and hanging-drop terminals, rasterised at load into
// distance / arc-length / cross-offset tables; the jets' life at rest is
// lookups in those tables. Hours 30x52, minutes 23x40, set on the waterline:
// the big hour sculptures and the smaller minutes are both played by the show.

import { to565, sin, cos, hash } from '../js/kit.js';
import { makeSet, PAD, MOAT, flashBytes } from './fountain-glyphs.js';

const W = 160, H = 80, N = W * H, WL = 70;
const REL = 59.45;   // the old water lets go
const TAU = Math.PI * 2;
const INK = to565(0x7fe6ff), GND = to565(0x04121c);

const HOURS = makeSet(30, 52, 7), MINS = makeSet(23, 40, 5);
const SLOTS = [
  { set: HOURS, x: 3, y: 15, w: 30 }, { set: HOURS, x: 37, y: 15, w: 30 },
  { set: MINS, x: 109, y: 27, w: 23 }, { set: MINS, x: 135, y: 27, w: 23 },
];
export const FLASH = flashBytes(HOURS) + flashBytes(MINS);

const M = new Uint8Array(N);       // the frame, 1 bit a pixel
const MOATM = new Uint8Array(N);   // where the background may not draw
let moatKey = -1;

// flow-lane dash lengths along a stroke: 32 cells of 8 px, per lane
const LEN = [0, 1].map((L) => Uint8Array.from({ length: 32 }, (_, i) => { const h = hash(i, L, 77) % 10; return h < 3 ? 0 : h < 6 ? 2 : h < 9 ? 3 : 5; }));

let ops = 0;
const put = (x, y) => { if (x >= 0 && y >= 0 && x < W && y < H) M[y * W + x] = 1; };
const bg = (x, y) => { if (x >= 0 && y >= 0 && x < W && y < H) { const i = y * W + x; if (!MOATM[i]) M[i] = 1; } };

function origin(slot, gl) {
  const gx = slot.x + Math.round((slot.w - gl.gw) / 2);
  return [gx - PAD, slot.y - PAD];
}

function buildMoat(key, glyphs) {
  if (key === moatKey) return;
  moatKey = key;
  MOATM.fill(0); ops += N;
  for (const [slot, gl] of glyphs) {
    const [ox, oy] = origin(slot, gl), sx = ox - MOAT, sy = oy - MOAT;
    for (let j = 0; j < gl.sbh; j++) {
      const y = sy + j; if (y < 0 || y >= H) continue;
      for (let i = 0; i < gl.sbw; i++) {
        const x = sx + i;
        if (x >= 0 && x < W && gl.SIL[j * gl.sbw + i]) MOATM[y * W + x] = 1;
      }
    }
    ops += gl.sbw * gl.sbh;
  }
}

const rank = (k, d, slot) => (hash(k, d, slot) & 1023) / 1024;

/**
 * One numeral in place. mode 0 rest, 1 leaving (sec >= release drawn away),
 * 2 arriving (pixels not yet landed are left out).
 */
function glyph(gl, ox, oy, si, T, sec, mode, surgeS) {
  const { D, S, C, bw, bh, sw } = gl;
  const wide = sw >= 7;
  const sh1 = Math.floor(T * 32) & 255, sh2 = Math.floor(T * 64) & 255, shr = Math.floor(T * 36) & 255;
  const L0 = LEN[0], L1 = LEN[1];
  for (let j = 0; j < bh; j++) {
    const y = oy + j; if (y < 0 || y >= H) continue;
    const row = j * bw;
    for (let i = 0; i < bw; i++) {
      const k = row + i, d = D[k];
      if (d > 72) continue;
      const s = S[k];
      let thr = 64;
      if (mode) {
        const r = rank(k, gl.d, si);
        if (mode === 1 ? sec >= REL + r * 0.4 : sec < 0.15 + r * 0.45) continue;
      } else {
        // the beat's surge (a swelling slug of water) and a ripple running up the jet
        const u = s - surgeS;
        thr += (u > -14 && u < 4 ? SURGE[u + 14] : 0) + RIP[(s * 3 - shr) & 255];
      }
      if (d > thr) continue;
      if (thr <= 66) {
        const c = C[k] - 128;
        if (wide) {
          if (c >= -10 && c < -6) { const u = (s - sh1) & 255; if ((u & 7) < L0[u >> 3]) continue; }
          else if (c >= 2 && c < 6) { const u = (s - sh2) & 255; if ((u & 7) < L1[u >> 3]) continue; }
        } else if (c >= -2 && c < 2) { const u = (s - sh2) & 255; if ((u & 7) < L1[u >> 3]) continue; }
      }
      M[y * W + ox + i] = 1;
    }
  }
  ops += bw * bh * 3;
}
// surge profile along the stroke (quarter px of swell), and a travelling ripple
const SURGE = Uint8Array.from({ length: 18 }, (_, k) => Math.round(6 * Math.sin(Math.PI * (k + 0.5) / 18) ** 1.5));
const RIP = Int8Array.from({ length: 256 }, (_, k) => Math.round(2 * Math.sin(TAU * k / 64)));

/**
 * Leaving water falling to the pool: `ts` seconds since the release began.
 * Only a third of the water is drawn as drops, and they leave with a push
 * downward, so the cloud clears the counters at once and never thickens a
 * digit into another (a 9 into an 8).
 */
const V0 = 55, GF = 260;
function falling(gl, ox, oy, si, ts) {
  const ink = gl.ink, bw = gl.bw, late = ts > 60 - REL;
  for (let n = 0; n < ink.length; n++) {
    const k = ink[n], hh = hash(k, gl.d, si);
    if (((hh >>> 20) % 3) !== 0) continue;
    const r = (hh & 1023) / 1024, dt = ts - r * 0.4;
    if (dt <= 0) continue;
    const x0 = ox + (k % bw), y0 = oy + ((k / bw) | 0);
    const y = (y0 + V0 * dt + GF * dt * dt) | 0;
    const drift = (((hh >> 10) & 15) - 7.5) * 3;
    if (y >= WL) {
      // a splash where it lands, briefly
      const tl = (-V0 + Math.sqrt(V0 * V0 + 4 * GF * (WL - y0))) / (2 * GF);
      if ((hh & 1) === 0 && dt - tl < 0.18) { const x = (x0 + drift * tl) | 0, up = ((dt - tl) * 30) | 0; put(x - up, WL - 1 - (up >> 1)); put(x + up, WL - 1 - (up >> 1)); }
      continue;
    }
    const x = (x0 + drift * dt) | 0;
    // inside the numeral's box, water shows only on its own strokes (it thins
    // the digit, never closes a counter); after :00 not at all (the new digit is coming)
    for (let q = 0; q < 2; q++) {
      const yy = y - q, li = x - ox, lj = yy - oy;
      if (li >= 0 && lj >= 0 && li < bw && lj < gl.bh && (late || gl.D[lj * bw + li] > 64)) continue;
      put(x, yy);
    }
  }
  ops += ink.length * 4;
}

/** New water shooting up to its place. */
function rising(gl, ox, oy, si, sec) {
  const ink = gl.ink, bw = gl.bw, F = 0.25;
  for (let n = 0; n < ink.length; n++) {
    const k = ink[n], hh = hash(k, gl.d, si), r = (hh & 1023) / 1024;
    const ta = 0.15 + r * 0.45, tl = ta - F;
    if (sec < tl || sec >= ta) continue;
    const u = (sec - tl) / F;
    const x0 = ox + (k % bw), y0 = oy + ((k / bw) | 0);
    const y = (WL - (WL - y0) * u * (2 - u)) | 0;
    const x = (x0 + (((hh >> 10) & 7) - 3.5) * (1 - u)) | 0;
    // inside the numeral's box a drop shows only in its last few px, on the strokes: the digit
    // builds evenly all over (never bottom first: an 8's lower loop must not read 0)
    for (let q = 0; q < (u < 0.75 ? 3 : 1); q++) {
      const yy = y + q, li = x - ox, lj = yy - oy;
      if (li >= 0 && lj >= 0 && li < bw && lj < gl.bh && (gl.D[lj * bw + li] > 72 || yy - y0 > 4)) continue;
      put(x, yy);
    }
  }
  ops += ink.length * 6;
}

/** The nozzle boil under a numeral: water rising into its foot. */
function feed(gl, ox, oy, T, on) {
  if (!on) return;
  const sh = Math.floor(T * 60), yb = oy + PAD + gl.h;
  for (const i of gl.feed) {
    const x = ox + i, o = hash(x, 5) & 3;
    for (let y = yb; y < WL; y++) if (((y + sh + o) % 3) === 0) put(x, y);
  }
  ops += gl.feed.length * 4;
}

/** Drips off the free ends, released when the beat's surge reaches them. */
function drips(gl, ox, oy, bp) {
  for (const e of gl.ends) {
    const th = e.s / 110, dt = bp - th - 0.05;
    const x = Math.round(ox + e.x - 0.5);
    let y0 = Math.round(oy + e.y + gl.sw / 2);
    if (dt < -0.05 || dt > 0.8) continue;
    if (dt < 0) { put(x, y0); continue; }
    const y = (y0 + 220 * dt * dt) | 0;
    if (y < WL) { put(x, y); put(x, y + 1); }
  }
}

// ------------------------------------------------------------ the show behind
//
// Every droplet is closed form from its launch time t0: the nozzle's program
// at t0 sets its speed and tilt, then it flies under gravity. So a beat kick
// travels up a column as a slug of faster water, a mode change sweeps up
// the jets, and cutting the pumps lets the last water fall.

const NOZ = 13, GR = 150, RATE = 24;          // nozzles, gravity px/s^2, drops per second per nozzle
const NX = Int16Array.from({ length: NOZ }, (_, i) => 8 + i * 12);
const prog = { h: 0, tilt: 0 };
const smooth = (u) => u * u * (3 - 2 * u);
const kickOf = (b) => { const u = 1 - b; return u * u * u * u; };

/** The nozzle program: height (px above the pool) and tilt (vx / vy) of nozzle i at launch time rel (s from this minute's start). */
function program(i, rel, m) {
  const mi = Math.floor(rel / 60), sec = rel - mi * 60, mm = (m + mi + 60) % 60;
  const bp = sec - Math.floor(sec), kick = kickOf(bp), t = rel;
  prog.tilt = 0;
  if (sec >= 59.3) { prog.h = 0; return; }   // pumps cut before every turn
  if (mm === 0 && sec < 10) {                  // the hour finale: every nozzle at once
    const ramp = sec < 0.4 ? sec / 0.4 : 1;
    prog.h = ramp * (66 + 8 * kick);
    prog.tilt = 0.24 * sin(TAU * (t / 3 - i / 26));   // all lean together as a wave: neighbours never cross into an X
    return;
  }
  const blk = Math.floor(sec / 5), ph = sec - blk * 5;
  const salute = (blk % 3) === 2;              // every 15 s, the big show
  const a = mode(blk, i, t, bp, sec, salute);
  let h = prog.h, tl = prog.tilt;
  if (ph > 4.4 && blk < 11) {
    const w = smooth((ph - 4.4) / 0.6);
    mode(blk + 1, i, t, bp, sec, ((blk + 1) % 3) === 2);
    h += (prog.h - h) * w; tl += (prog.tilt - tl) * w;
  }
  prog.h = h * (1 + 0.28 * kick) * (sec < 0.6 ? smooth(sec / 0.6) : 1);
  prog.tilt = tl;
}
function mode(blk, i, t, bp, sec, salute) {
  if (salute) {   // all jets high, fanned left and right in a sweep that crosses
    prog.h = 52 + 8 * sin(TAU * (t / 2 - i / 13));
    prog.tilt = 0.26 * sin(TAU * t / 2.5 + i * 0.5);
    return;
  }
  const k = ((blk / 3) | 0) * 2 + (blk % 3);   // 0..7 over the minute
  switch (k & 3) {
    case 0: prog.h = 14 + 34 * (0.5 + 0.5 * sin(TAU * (t / 2.5 - i / 7))); prog.tilt = 0; break;   // a wave running right
    case 1: { const odd = ((i + Math.floor(sec)) & 1) === 1; prog.h = odd ? 50 : 14; prog.tilt = 0; break; }   // alternate on the beat
    case 2: prog.h = 16 + 40 * Math.abs(i - 6) / 6; prog.tilt = (i - 6) * 0.05; break;   // a V, leaning out
    default: prog.h = 40; prog.tilt = 0.2 * sin(TAU * t / 3); break;   // all together, swaying
  }
}

function jets(T, sec, m) {
  const t0 = T - sec;
  const n0 = Math.floor(T * RATE);
  for (let i = 0; i < NOZ; i++) {
    const xn = NX[i];
    for (let k = 0; k < 66; k++) {
      const n = n0 - k, tl = n / RATE, age = T - tl;
      program(i, tl - t0, m);
      const h = prog.h;
      if (h < 2) continue;
      const vy = Math.sqrt(2 * GR * h), fl = (2 * vy) / GR;
      if (age > fl) continue;
      const hh = hash(n, i, 3);
      // a tight column going up; the water breaks up only as it falls
      const fall = age - fl * 0.5, jit = ((hh & 15) - 7.5) * (fall > 0 ? 3.2 * fall : 0);
      const vx = prog.tilt * vy;
      const x = Math.round(xn + vx * age + jit), v = vy - GR * age;
      const y = Math.round(WL - vy * age + 0.5 * GR * age * age);
      bg(x, y);
      // fast water streaks along its motion; near the apex it hangs as spray
      const len = v > 70 ? 3 : v > 30 ? 2 : v < -60 ? 1 : 0;
      for (let q = 1; q <= len; q++) bg(x - Math.round(prog.tilt * q), y + (v > 0 ? q : -q));
      if (v < 10 && v > -40 && (hh & 48) === 0) bg(x + ((hh >> 6) & 1 ? 1 : -1), y);
    }
    ops += 66 * 20;
  }
}

/** The corner cannons: two long arcs across the strip in the salute and the finale. */
function cannons(T, rel, m) {
  const mi = Math.floor(rel / 60), mm = (m + mi + 60) % 60, sec = rel - mi * 60;
  let on = 0;
  if (mm === 0 && sec < 10) on = 1;
  else if (sec < 59.3) { const blk = Math.floor(sec / 5), ph = sec - blk * 5; if (blk % 3 === 2) on = ph < 0.5 ? ph / 0.5 : ph > 4.3 ? Math.max(0, (4.7 - ph) / 0.4) : 1; }
  if (on <= 0) return;
  // high enough that the two arcs cross at their apex, over the numerals: an arch, not an X
  const vy = 140 * Math.sqrt(on), fl = (2 * vy) / GR;
  for (let side = 0; side < 2; side++) {
    const sw = 0.5 + 0.5 * sin(TAU * T / 4 + side * Math.PI);
    const vx = (side ? -1 : 1) * (72 + 16 * sw), xn = side ? 159 : 0;
    for (let k = 0; k < 40; k++) {
      let p = k / 40 + T * 0.9; p -= Math.floor(p);
      const a = p * fl;
      const x = Math.round(xn + vx * a), y = Math.round(WL - vy * a + 0.5 * GR * a * a);
      bg(x, y); bg(x + (side ? 1 : -1), y + 1);
    }
  }
  ops += 80 * 10;
}

/** Water fireworks at the hour: rings of drops thrown from the jet tops on each beat. */
function bursts(T, sec, m) {
  if (m !== 0 || sec > 10) return;
  for (let b = Math.max(0, Math.floor(sec) - 1); b <= Math.floor(sec); b++) {
    const a = sec - b; if (a < 0 || a > 1.6) continue;
    for (let q = 0; q < 3; q++) {
      const cx = 14 + q * 66 + ((hash(b, q, 9) % 20) | 0), cy = -2 + (hash(b, q, 10) % 5);   // centred at the top edge: a crown opening downward
      for (let j = 0; j < 32; j++) {
        const th = TAU * j / 32, sp = 44 + (hash(j, b, q) & 7);
        const rr = 12 + sp * a;   // born as a wide ring: never a small 'o' beside the numerals
        const x = Math.round(cx + rr * cos(th)), y = Math.round(cy + rr * sin(th) + 0.5 * 60 * a * a);
        bg(x, y);
        if (a < 0.4) bg(Math.round(cx + rr * 0.8 * cos(th)), Math.round(cy + rr * 0.8 * sin(th)));
      }
    }
  }
  ops += 200 * 10;
}

export default {
  name: 'Fountain',
  blurb: 'A night fountain show: water-jet numerals pulse to the beat, rain down at the turn and shoot back up.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, sec = f.sec, T = (f.minuteKey % 1440) * 60 + sec, bp = sec - Math.floor(sec);
    ctx.lcd.backlight(1 - 0.65 * ctx.night);
    ops = 0;
    M.fill(0); ops += N;

    const cur = f.hh + f.mm;
    const prevD = new Date(ctx.date.getTime() - 60000), nextD = new Date(ctx.date.getTime() + 60000);
    const p2 = (n) => String(n).padStart(2, '0');
    const prev = p2(prevD.getHours()) + p2(prevD.getMinutes()), next = p2(nextD.getHours()) + p2(nextD.getMinutes());
    const leaving = sec >= REL, arriving = sec < 1.0;

    // the moat: what is or will be standing
    const phase = sec >= 58.5 ? 2 : sec < 2 ? 1 : 0;
    const gl = [];
    for (let si = 0; si < 4; si++) {
      const slot = SLOTS[si];
      gl.push([slot, slot.set[+cur[si]]]);
      if (phase === 2 && next[si] !== cur[si]) gl.push([slot, slot.set[+next[si]]]);
      if (phase === 1 && prev[si] !== cur[si]) gl.push([slot, slot.set[+prev[si]]]);
    }
    buildMoat(f.minuteKey * 4 + phase, gl);

    // ---- the show
    jets(T, sec, f.m);
    cannons(T, sec, f.m);
    bursts(T, sec, f.m);

    // ---- the pool
    for (let x = 0; x < W; x++) {
      const v = sin(x * 0.42 - TAU * T / 1.5) + 0.6 * sin(x * 0.17 + TAU * T / 4);
      put(x, v > 0.9 ? WL - 1 : WL);
    }

    // ---- the numerals
    const surgeS = bp * 110;
    for (let si = 0; si < 4; si++) {
      const slot = SLOTS[si], d = +cur[si], g0 = slot.set[d], [ox, oy] = origin(slot, g0);
      const willGo = next[si] !== cur[si] && leaving, came = prev[si] !== cur[si] && arriving;
      glyph(g0, ox, oy, si, T, sec, willGo ? 1 : came ? 2 : 0, willGo || came ? -99 : surgeS);
      if (willGo) falling(g0, ox, oy, si, sec - REL);
      if (came) {
        const gp = slot.set[+prev[si]], [px, py] = origin(slot, gp);
        falling(gp, px, py, si, sec + 60 - REL);
        rising(g0, ox, oy, si, sec);
      }
      feed(g0, ox, oy, T, !willGo && !(came && sec < 0.05));
      if (!willGo && !came) drips(g0, ox, oy, bp);
    }

    // ---- reflections in the pool
    for (let y = 72; y < H; y += 2) {
      const ym = 66 - (y - 72) * 6, wob = Math.round(1.5 * sin(TAU * (T / 2 + y / 9))), sh = Math.floor(T * 12);
      for (let x = 0; x < W; x++) {
        const xs = x + wob;
        if (xs >= 0 && xs < W && M[ym * W + xs] && ((x + (y >> 1) * 3 + sh) % 7) < 5) M[y * W + x] = 1;
      }
      ops += W * 2;
    }

    // ---- out to the glass: two colours
    const buf = g.buf;
    for (let i = 0; i < N; i++) buf[i] = M[i] ? INK : GND;
    g.cost.px += N; g.cost.box += N + ops;
  },
};
