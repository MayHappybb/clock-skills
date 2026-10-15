// Fireworks — a harbour at night, and the time is the whole display.
//
// The minutes hang in the sky as numeral shells: each is a firework burst
// whose stars were loaded along that numeral's skeleton, so what the shell
// breaks into IS the digit. They are near and high and large. The hour is a
// different device altogether - a lance set-piece strung between two masts
// on the far breakwater, its burning points throwing cones of sparks, its
// glare caught in the river below. The seconds are the third device: a fuse
// laid along the near quay, burning from left to right across the minute,
// spitting as it goes, reaching the mortar exactly on the turn.
//
// Nothing is stored between frames. A shell's life runs from the instant its
// numeral last changed: the stars fly out of the burst centre to their
// places, hang, then one by one shed and fall as embers while a fresh star
// climbs out of the centre to take each one's place - the numeral is never
// still. In the last seconds of the old minute the changing numeral's stars
// gutter and drop over the water, its shell climbs, and it bursts open on
// :00. On the hour every shell and every lance refires at once, a volley of
// chrysanthemums goes up the empty channels of the sky, and a waterfall -
// a curtain of sparks lit along the top of the glass - rains the full
// height of it into the river; every burst lifts the whole panel for an
// instant (the panel's contrast follows it). The glass is a canvas of one
// field of light, opened against a noise threshold so halos are grainy and
// cores are crisp, and then opened on the whole. About a tenth of the glass
// is lit on average.
//
// Burn-in: the sky stars drift, the bursts are never twice in the same
// place, the fuse walks the quay and its ticks and the mortar's dots move
// with the minute, the masts are broken lines, and from 23:00 to 07:00 the
// panel dims.

import { ease, noise, orbit, dither } from '../js/kit.js';

const W = 128, H = 64;
const TAU = Math.PI * 2;
const clamp01 = (u) => (u < 0 ? 0 : u > 1 ? 1 : u);
const lerp = (a, b, u) => a + (b - a) * u;
const DAY = 0xd2, NIGHT = 0x1e;

// the scene, in layers
const HORIZON = 40;          // the waterline: everything above is sky, below is river
const QUAY = 58;             // the near bank, where the fuse is laid
const FUSE_Y = 60, FUSE_X0 = 3, FUSE_X1 = 116;

// ------------------------------------------------------------ letterforms
// A star shell is a pattern shell: its stars are laid out on the numeral
// before it is fired. Each digit is a set of strokes in a 22 x 30 box (y
// down, one even weight); the stars are walked along them at a fixed spacing.

/** Catmull-Rom through `pts`, `n` samples a span. */
function spline(pts, n = 9) {
  if (pts.length < 3) return pts.map((p) => [...p]);
  const P = [pts[0], ...pts, pts.at(-1)];
  const out = [];
  for (let i = 1; i < P.length - 2; i++) {
    const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((j) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t
        + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2
        + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3)));
    }
  }
  out.push([...pts.at(-1)]);
  return out;
}

function oval(cx, cy, rx, ry, n = 46) {
  const pts = [];
  for (let i = 0; i <= n; i++) { const a = (i / n) * TAU; pts.push([cx + rx * Math.sin(a), cy - ry * Math.cos(a)]); }
  return pts;
}

const GLYPH = {
  0: [oval(11, 15, 8.6, 14.2)],
  1: [[[3.4, 10.2], [7.5, 5.6], [11.2, 2.2], [12.9, 0.6]],
      [[12.9, 0.6], [12.3, 14], [11.4, 30]],
      [[4.4, 29.4], [11.6, 29.6], [19.4, 29.2]]],
  2: [[[2, 8.6], [3.6, 3.4], [8.6, 0.6], [14.6, 1.6], [18.6, 6.2], [17.4, 12.4], [11.6, 18.4], [5.4, 24.2], [2.6, 29.2]],
      [[2.6, 29.2], [7.4, 28.2], [13, 29.6], [18.6, 29], [20.6, 27.4]]],
  3: [[[2.2, 4.8], [5.8, 1.2], [12.4, 0.6], [16.8, 3.6], [17.4, 9.4], [13, 13.6], [8.2, 15]],
      [[8.2, 15], [13, 15.4], [18, 19.6], [18.2, 26], [13.4, 29.8], [6.4, 29.2], [2.2, 25.6]]],
  4: [[[15.4, 30], [15.6, 15], [15.6, 1.6]],
      [[15.6, 1.6], [8.4, 11.6], [1.4, 21.4]],
      [[1.4, 21.4], [11, 21.6], [21, 21.2]]],
  5: [[[18.4, 1.2], [10.5, 1], [4.4, 1.8], [3.4, 8], [3.2, 13.4]],
      [[3.2, 13.4], [8.6, 11.2], [14.2, 12.2], [18.2, 17], [18.2, 23.6], [13.2, 29.6], [6.2, 29.2], [2.2, 25.4]]],
  6: [[[16.6, 2.4], [11.4, 0.4], [5.8, 2.6], [2.2, 8.6], [1.5, 17.4], [2.8, 24.6], [7.2, 29.4], [13.2, 30.2], [17.6, 26.4], [18, 20.2], [13.8, 15.8], [7.8, 15.6], [3.4, 18.6]]],
  7: [[[2, 2.6], [6.6, 0.9], [13.4, 2], [19.8, 1.4]],
      [[19.8, 1.4], [15.6, 8.4], [11.6, 17], [9.2, 24], [7.8, 30]],
      [[5.2, 15.4], [11.4, 15], [17, 14.8]]],
  8: [[[11, 15], [15.4, 13.4], [18.4, 9.6], [17.8, 4.6], [13.2, 0.8], [8.6, 0.8], [4.4, 4.2], [4.2, 9.2], [7.6, 13.2],
       [11, 15.4], [14.8, 17.6], [18, 21.8], [17.6, 26.6], [13.2, 30], [8.6, 30], [4.4, 26.6], [4.2, 21.8], [7.6, 17.6], [11, 15.4]]],
  9: [[[5.4, 27.8], [10.6, 29.8], [16.2, 27.6], [19.8, 21.6], [20.5, 12.6], [19.2, 5.4], [14.8, 0.6], [8.8, -0.2], [4.4, 3.4], [4, 9.8], [8.2, 14.2], [14.2, 14.4], [18.6, 11.4]]],
};

/** Walk a digit's strokes and return points every `sp` px, with `s` along the writing. */
function walk(d, sp) {
  const strokes = GLYPH[d].map((pts) => spline(pts));
  const xs = [], ys = [], ss = [];
  let total = 0;
  for (const st of strokes) for (let i = 1; i < st.length; i++) total += Math.hypot(st[i][0] - st[i - 1][0], st[i][1] - st[i - 1][1]);
  let acc = 0;
  for (const st of strokes) {
    let len = 0;
    for (let i = 1; i < st.length; i++) len += Math.hypot(st[i][0] - st[i - 1][0], st[i][1] - st[i - 1][1]);
    const n = Math.max(2, Math.round(len / sp) + 1);
    for (let k = 0; k < n; k++) {
      const target = (len * k) / (n - 1);
      let seg = 1, segStart = 0;
      while (seg < st.length - 1 && segStart + Math.hypot(st[seg][0] - st[seg - 1][0], st[seg][1] - st[seg - 1][1]) < target) {
        segStart += Math.hypot(st[seg][0] - st[seg - 1][0], st[seg][1] - st[seg - 1][1]); seg++;
      }
      const a = st[seg - 1], b = st[seg], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const u = clamp01((target - segStart) / l);
      xs.push(a[0] + (b[0] - a[0]) * u); ys.push(a[1] + (b[1] - a[1]) * u);
      ss.push((acc + target) / total);
    }
    acc += len;
  }
  const n = xs.length;
  const p = new Float32Array(n * 3);
  for (let i = 0; i < n * 3; i++) p[i] = noise(i * 1.37 + d * 11.3);
  return { n, x: Float32Array.from(xs), y: Float32Array.from(ys), s: Float32Array.from(ss), p };
}

const SHELL = Array.from({ length: 10 }, (_, d) => walk(d, 2.35));   // a shell's stars
const LANCE = Array.from({ length: 10 }, (_, d) => walk(d, 5.6));    // a set-piece's candles
const FRAME = Array.from({ length: 10 }, (_, d) => walk(d, 2.5));    // the wire they are clipped to

// ------------------------------------------------------------ light
//
// Every spark adds into one field; the field is opened against a noise
// threshold so a star is a bright core in a soft, grainy halo and a row of
// them melts into one luminous stroke. The brightest points are then redrawn
// crisp on top, as sparks are.

const F = new Float32Array(W * H);
const CORES = [];

function glow(x, y, I, r = 2.5) {
  if (I <= 0.02 || x < -r || y < -r || x > W + r || y > H + r) return;
  const x0 = Math.max(0, Math.floor(x - r)), x1 = Math.min(W - 1, Math.ceil(x + r));
  const y0 = Math.max(0, Math.floor(y - r)), y1 = Math.min(H - 1, Math.ceil(y + r));
  for (let py = y0; py <= y1; py++) {
    const dy = py + 0.5 - y;
    for (let px = x0; px <= x1; px++) {
      const dx = px + 0.5 - x, d2 = dx * dx + dy * dy;
      if (d2 > r * r) continue;
      const w = 1 - d2 / (r * r);
      F[py * W + px] += I * w * w;
    }
  }
}

/** A spark with a short tail behind it (a star in flight, an ember falling). */
function streak(x, y, vx, vy, I, len) {
  for (let k = 0; k <= len; k += 0.8) glow(x - vx * k, y - vy * k, I * (1 - k / (len + 0.8)) ** 1.6, 2.2);
}

/** Open the field onto the glass. */
function develop(g, key) {
  const ox = (key * 13) % 64, oy = (key * 29) % 64;
  for (let y = 0; y < H; y++) {
    const row = y * W;
    for (let x = 0; x < W; x++) {
      const v = F[row + x];
      if (v < 0.035) continue;
      const lv = 1 - Math.exp(-v * 1.2);
      const t = (52.9829189 * ((0.06711056 * (x + ox) + 0.00583715 * (y + oy)) % 1)) % 1;
      if (lv > 0.055 + 0.945 * t) g.pixel(x, y, 1);
    }
  }
}

/** The sparks themselves, drawn crisp over the glow: a star is a bead. */
function cores(g) {
  for (let i = 0; i < CORES.length; i += 3) {
    const x = CORES[i], y = CORES[i + 1], I = CORES[i + 2];
    if (I < 0.55) { if (I > 0.22) g.pixel(x, y); continue; }
    const ix = Math.round(x - 0.5), iy = Math.round(y - 0.5);
    g.pixel(ix, iy, 1);
    if (I > 0.95) { g.pixel(ix + 1, iy, 1); g.pixel(ix, iy + 1, 1); g.pixel(ix + 1, iy + 1, 1); }
    if (I > 1.7) { // a shell's flash: a small cross
      g.pixel(ix - 1, iy, 1); g.pixel(ix, iy - 1, 1); g.pixel(ix + 2, iy + 1, 1); g.pixel(ix + 1, iy + 2, 1);
    }
  }
  CORES.length = 0;
}

// ------------------------------------------------------------ the slots
// Four numerals. Each knows the instant its value last changed and the
// instant it changes next; everything about it - the burst, the hang, the
// shedding stars, the death - is a function of those two times.

const OUT = 0.62;      // s: the burst spreading to full size
const IN_T = 0.30;     // s: a replacement star climbing out of the centre
const FALL = 0.55;     // s: a shed star falls before its replacement arrives
const DIE = 2.5;       // s: how long a numeral takes to gutter out
const CLIMB = 1.15;    // s: the new shell's climb before it bursts

/**
 * The four slots for the wall clock `date`, as plain numbers: the numeral
 * each carries, when it last changed and when it changes next. Nothing here
 * allocates: this runs once a frame, sixty times a second.
 */
const SLOT_T = [{}, {}, {}, {}];
function slotsOf(date) {
  const y = date.getFullYear(), mo = date.getMonth(), d = date.getDate();
  const h = date.getHours(), mi = date.getMinutes();
  const min0 = new Date(y, mo, d, h, mi, 0, 0).getTime();
  const hr0 = new Date(y, mo, d, h, 0, 0, 0).getTime();
  const S = SLOT_T;
  // hours: the lances. Tens changes at 00:00 and 10:00, units every hour.
  S[0].d = h >= 10 ? 1 : 0; S[0].kind = 'lance';
  S[0].c = h >= 10 ? new Date(y, mo, d, 10, 0, 0, 0).getTime() : new Date(y, mo, d, 0, 0, 0, 0).getTime();
  S[0].nx = h >= 10 ? new Date(y, mo, d + 1, 0, 0, 0, 0).getTime() : new Date(y, mo, d, 10, 0, 0, 0).getTime();
  S[1].d = h % 10; S[1].kind = 'lance';
  S[1].c = hr0; S[1].nx = hr0 + 3600000;
  // minutes: the shells. Tens every ten minutes, units every minute.
  S[2].d = Math.floor(mi / 10); S[2].kind = 'shell';
  S[2].c = new Date(y, mo, d, h, Math.floor(mi / 10) * 10, 0, 0).getTime();
  S[2].nx = min0 + (10 - (mi % 10)) * 60000;
  S[3].d = mi % 10; S[3].kind = 'shell';
  S[3].c = min0; S[3].nx = min0 + 60000;
  return S;
}

// where each slot hangs: [x, y] of its box's top-left corner, and its scale
const SLOT_AT = [[4, 14, 0.74], [21, 14, 0.74], [60, 2, 0.95], [88, 2, 0.95]];
const COLON = [47, 20];

/**
 * One star shell at rest: the numeral it carries, drawn as the burst that is
 * still opening out, the stars that hang, and the ones shedding.
 */
function shellAt(d, x0, y0, sc, T, burst, I0 = 1) {
  const st = SHELL[d];
  const cx = x0 + 11 * sc, cy = y0 + 15 * sc;
  const age = T - burst;
  // the break itself: a flash and the ring of the shock going out from it
  if (age < 0.5) {
    const u = clamp01(age / 0.5);
    const r = (1.5 + 30 * sc) * ease.outCubic(u);
    for (let k = 0; k < 34; k++) {
      const a = (k / 34) * TAU;
      if (k % 3 === 1) continue;                     // a broken ring, not a drawn circle
      const rk = r * (0.82 + 0.36 * noise(k, 17));
      glow(cx + rk * Math.sin(a) * 1.1, cy - rk * Math.cos(a) * 0.92, 2.0 * (1 - u) ** 1.5, 2.3);
    }
    glow(cx, cy, 3.4 * (1 - u) ** 2, 5);
    if (u < 0.3) CORES.push(cx, cy, 3);
  }
  for (let i = 0; i < st.n; i++) {
    const q1 = st.p[i * 3], q2 = st.p[i * 3 + 1], q3 = st.p[i * 3 + 2];
    const hx = x0 + st.x[i] * sc, hy = y0 + st.y[i] * sc;
    let x, y, I, vx = 0, vy = 0, tail = 0;
    if (age < OUT) {
      // the burst: everything flying out from the centre to its place
      const u = ease.outCubic(clamp01(age / OUT));
      x = cx + (hx - cx) * u; y = cy + (hy - cy) * u;
      vx = (hx - cx) * 0.9; vy = (hy - cy) * 0.9; tail = 1.6 * (1 - u);
      I = I0 * (1.55 - 0.55 * u);
    } else {
      const P = 6.5 + 5.5 * q1;
      const off = IN_T + 0.3 + (P - IN_T - FALL - 0.6) * q2;
      const c = (((age - OUT + off) % P) + P) % P;
      const bob = 0.24 * Math.sin(T * 0.75 + 6.3 * q3);
      if (c < IN_T) {
        const u = ease.outCubic(c / IN_T);
        x = cx + (hx - cx) * u; y = cy + (hy - cy) * u;
        vx = (hx - cx) * 0.7; vy = (hy - cy) * 0.7; tail = 1.1;
        I = I0 * 1.3;
      } else if (c < P - FALL) {
        x = hx + bob * 0.6; y = hy + bob;
        // a star burning, and now and then flaring as a grain of powder catches
        const g1 = (((T * (0.22 + 0.3 * q1) + q3) % 1) + 1) % 1;
        const pop = g1 < 0.07 ? (1 - g1 / 0.07) : 0;
        I = I0 * (0.86 + 0.12 * Math.sin(T * (5 + 4 * q1) + 6.3 * q3) + 0.75 * pop);
        // every star trails back along its own spoke: this is a burst, not a line
        const dx0 = hx - cx, dy0 = hy - cy, dl = Math.hypot(dx0, dy0) || 1;
        const ux = dx0 / dl, uy = dy0 / dl;
        streak(x, y, ux * 0.34, uy * 0.34, I * 0.62, 2.5 + 0.9 * pop);
      } else {
        const ft = c - (P - FALL);
        const v = 30 * ft;
        x = hx + bob * 0.6 + 2.4 * (q3 - 0.5) * ft;
        y = hy + v * ft * 0.5;
        vy = v * 0.5; tail = 1.4;
        I = I0 * (1 - ft / FALL) ** 1.4 * 0.95;
      }
    }
    if (tail > 0) streak(x, y, vx * 0.06, vy * 0.06, I * 0.5, tail);
    glow(x, y, I);
    if (I > 0.5) CORES.push(x, y, I);
  }
}

/** A numeral guttering out: its stars drop away over the river, in order. */
function shellDie(d, x0, y0, sc, T, death) {
  const st = SHELL[d];
  for (let i = 0; i < st.n; i++) {
    const q1 = st.p[i * 3], q3 = st.p[i * 3 + 2];
    const k = clamp01((death - (0.12 + 0.62 * q1)) / 0.34);
    if (k <= 0) {
      const hx = x0 + st.x[i] * sc, hy = y0 + st.y[i] * sc;
      glow(hx, hy, 0.85); CORES.push(hx, hy, 0.6);
      continue;
    }
    const hx = x0 + st.x[i] * sc, hy = y0 + st.y[i] * sc;
    const x = hx + 3 * (q3 - 0.5) * k, y = hy + 30 * k * k;
    const I = 0.95 * (1 - k) ** 1.7;
    streak(x, y, 0, 30 * k * 0.55, I * 0.6, 1.5);
    glow(x, y, I);
    if (I > 0.5) CORES.push(x, y, I);
  }
}

/** The new shell climbing to its burst point: a rising star with a burning tail. */
function shellRise(x0, y0, sc, T, next) {
  const u = clamp01((T - (next - CLIMB)) / CLIMB);
  const cx = x0 + 11 * sc, cy = y0 + 15 * sc;
  const from = y0 + 15 * sc + 34;
  const y = lerp(from, cy, ease.outQuad(u));
  const x = cx + 3 * Math.sin(u * 9);
  glow(x, y, 1.9, 3);
  streak(x, y + 1.5, 0, 0.2 + 0.14 * u, 0.85, 5 * u + 1.5);
  // it flickers as it goes, and puts out sparks
  for (let k = 0; k < 4; k++) {
    const ph = ((T * 3 + k * 0.25) % 1);
    glow(x + (noise(k, 3) - 0.5) * 4 * ph, y + 2 + ph * 5, 0.5 * (1 - ph) * u, 1.6);
  }
  glow(cx, cy, 0.6 * u * u, 5);
}

/**
 * The hour: a set-piece of burning lances between two masts on the far
 * breakwater. Each candle lights in turn when the numeral is new and goes
 * out in turn when it changes; every candle throws its own little fountain.
 */
function lanceAt(d, x0, y0, sc, T, burst, death) {
  const st = LANCE[d];
  const fr = FRAME[d];
  // the wire the candles are clipped to: faint, so the shape reads even
  // where a candle has not lit
  for (let i = 0; i < fr.n; i += 2) glow(x0 + fr.x[i] * sc, y0 + fr.y[i] * sc, 0.12, 1.4);
  for (let i = 0; i < st.n; i++) {
    const q1 = st.p[i * 3], q3 = st.p[i * 3 + 2];
    const x = x0 + st.x[i] * sc, y = y0 + st.y[i] * sc;
    if (burnt(death, q1)) continue;
    if (T - burst < 0.4) continue;                    // not yet lit
    // the flame runs round the numeral in writing order, then burns on
    const light = clamp01((T - burst - 0.35 - st.s[i] * 0.7) / 0.26);
    const I = light * (1.15 + 0.16 * Math.sin(T * (7 + 5 * q1) + 6.3 * q3)
      + 0.09 * Math.sin(T * (23 + 11 * q3)) * (1 - q1));
    if (I <= 0.05) continue;
    glow(x, y, I, 2.2);
    CORES.push(x, y, I * 1.2);
    // its fountain: a cone of sparks rising out of the mouth of the candle
    for (let k = 0; k < 3; k++) {
      const ph = (((T * (1.9 + 1.5 * q3) + 5.7 * q1 + k * 0.34) % 1) + 1) % 1;
      const sx = x + (noise(k + i * 3, 5) - 0.5) * 3 * ph;
      const sy = y - ph * 11;
      glow(sx, sy, I * (1 - ph) * 0.55, 1.6);
      if (ph < 0.12 && k === 0) CORES.push(sx, sy, 1.1);
    }
  }
}
const burnt = (death, q) => death > q;

// ------------------------------------------------------------ the fuse
// The second hand: a fuse on the near quay, lit at :00, walking right, the
// tip spitting. It reaches the mortar on the turn.

function fuse(g, sec, T, ox, oy) {
  const u = sec / 60;
  const tip = FUSE_X0 + ox + (FUSE_X1 - FUSE_X0) * u;
  const Y = FUSE_Y + oy;
  // the unburnt cord ahead of the tip, and the ash behind
  for (let x = Math.ceil(tip) + 2; x <= FUSE_X1 + ox; x++) if (x % 3 && dither(x, Y, 0.55)) g.pixel(x, Y, 1);
  for (let x = FUSE_X0 + ox; x < tip - 2; x += 4) if (dither(x, Y + 1, 0.28)) g.pixel(x, Y + 1, 1);
  // every fifth second of cord is marked, so the minute is countable
  const step = (FUSE_X1 - FUSE_X0) / 12;
  for (let k = 0; k <= 12; k++) g.pixel(Math.round(FUSE_X0 + ox + k * step), Y - 2, 1);
  // the burning tip, and the sparks it throws
  g.pixel(tip, Y, 1); g.pixel(tip - 1, Y, 1); g.pixel(tip, Y - 1, 1);
  const big = (sec % 5) < 0.5 ? 1 : 0;
  for (let k = 0; k < 5 + 3 * big; k++) {
    const bk = Math.floor(T / 0.34) + k * 7;
    const life = noise(bk, 3), ang = -0.5 - noise(bk, 4) * 2.0;
    const sp = (14 + 26 * noise(bk, 6)) * (1 + big * 0.8);
    const t0 = noise(bk, 7) * 0.34;
    const a = (T % 0.34) - t0;
    if (a < 0 || a > life * 0.34) continue;
    const x = tip + Math.sin(ang) * sp * a, y = Y - Math.cos(ang) * sp * a + 90 * a * a;
    glow(x, y, 0.9 * (1 - a / (life * 0.34 + 0.001)), 1.8);
  }
  glow(tip, Y, 1.5, 3.4);
  CORES.push(tip, Y, 1.6);
  // at :00 the next length of fuse is struck alight at this end
  if (sec < 0.55) {
    const m = Math.exp(-sec * 6);
    const m0 = FUSE_X0 + ox;
    glow(m0, Y, 2.4 * m, 4);
    CORES.push(m0, Y, 2.2 * m);
    for (let k = 0; k < 4; k++) {
      const a = -1.2 + k * 0.5;
      glow(m0 + 7 * (1 - m) * Math.sin(a), Y - 7 * (1 - m) * Math.cos(a), m, 1.6);
    }
  }
  // the mortar on the quay, and the flash when the fuse gets there. It is
  // drawn as a broken outline and its dots change places each minute, so no
  // pixel of it is lit all day.
  const mx = FUSE_X1 + ox + 3;
  const ph = Math.floor(T / 60);
  for (let x = mx; x < mx + 7; x++) {
    if ((x + ph) % 3) g.pixel(x, Y + 2, 1);
    if ((x * 2 + ph) % 5) g.pixel(x, Y - 1, 1);
  }
  for (let y = Y; y <= Y + 2; y++) {
    if ((y * 3 + ph) % 4) g.pixel(mx, y, 1);
    if ((y + ph) % 4) g.pixel(mx + 6, y, 1);
  }
  if (sec > 59.3) {
    glow(mx + 3, Y - 3, 2.2, 5);
    CORES.push(mx + 3, Y - 4, 2.2);
  }
}

// ------------------------------------------------------------ the volley
// On the hour, everything refires and extra shells go up across the sky.

// where the extra shells of the hour go up: open sky, never on a numeral
const FREE = [[48, 20, 0.5], [48, 30, 0.55], [48, 38, 0.42],
  [118, 7, 0.7], [118, 18, 0.55], [118, 29, 0.62], [118, 39, 0.45],
  [20, 5, 0.5], [33, 4, 0.45], [8, 6, 0.42], [70, 38, 0.45]];

function volley(T, sec, floorH) {
  if (sec > 11) return 0;
  let flash = 0;
  for (let k = 0; k < FREE.length; k++) {
    const [bx, by, sc] = FREE[k];
    const at = 0.25 + k * 0.62 + noise(k, floorH) * 0.35;
    const tau = sec - at;
    if (tau < 0) continue;
    const rise = 0.85, R = 17 * sc;
    if (tau < rise) {
      const u = tau / rise, y = HORIZON - (HORIZON - by) * ease.outQuad(u);
      glow(bx, y, 1.4, 2.8);
      streak(bx, y + 1.2, 0, 0.2, 0.7, 4 * u + 1);
      continue;
    }
    const s = tau - rise;
    if (s < 0.10) { glow(bx, by, 3.4, 7); CORES.push(bx, by, 2.6); flash = Math.max(flash, 1 - s / 0.10); }
    const r = R * (1 - Math.exp(-s * 3.1)) * (1 + 0.18 * sc);
    const fade = 1 - s / 3.4;
    if (fade <= 0) continue;
    const n = 14 + Math.round(7 * sc);
    for (let j = 0; j < n; j++) {
      const a = (j / n) * TAU + noise(k * 31 + j, 3) * 0.6;
      const sp = 0.72 + 0.55 * noise(k * 17 + j, 9);
      const rr = r * sp;
      const ux = Math.sin(a) * 1.15, uy = -Math.cos(a) * 0.85;
      const x = bx + rr * ux;
      const y = by + rr * uy + 26 * s * s;
      const glitter = s > 1.4 && noise(Math.floor(x) * 13 + Math.floor(y), Math.floor(s * 13)) < 0.42 + 0.5 * fade;
      const I = fade * (1.35 - 0.35 * s) * (0.65 + 0.55 * noise(k + j, 11)) * (glitter ? 1.35 : 1);
      if (s > 1.4 && !glitter) continue;
      streak(x, y, ux * 0.30, uy * 0.30, I * 0.55, 2.4 + 2 * (1 - fade));
      glow(x, y, I, 2.2);
      if (I > 0.6 && s < 1.8) CORES.push(x, y, I);
    }
  }
  return flash;
}

/**
 * The waterfall: the hour's great set piece. A curtain of fire is lit along
 * the top of the sky and the sparks rain the full height of the glass and
 * into the river, burning out as they fall.
 */
function waterfall(sec, floorH) {
  const amp = Math.min(clamp01((sec - 0.55) / 0.5), clamp01((7.2 - sec) / 1.6));
  if (amp <= 0.02) return;
  for (let k = 0; k < 26; k++) {
    const bh = noise(k, floorH), bh2 = noise(k, floorH + 1), bh3 = noise(k, floorH + 2);
    const x = 3 + k * 4.9 + bh * 2.4;
    const top = 1 + bh2 * 13;
    const drop = HORIZON + 4 - top;
    const speed = 0.28 + 0.36 * bh3;
    const sway = 0.9 * Math.sin(sec * 1.7 + k * 0.9);
    for (let j = 0; j < 2; j++) {
      const ph = ((((sec - 0.55) * speed * 3 + j * 0.42 + bh) % 1) + 1) % 1;
      const y = top + ph * drop;
      const I = amp * (0.95 - 0.5 * ph) * (0.24 + 0.72 * noise(k * 5 + j, 9)) * (bh3 > 0.4 ? 1 : 0.5);
      streak(x + sway * ph, y, 0, 0.5, I * 0.5, 2.4);
      glow(x + sway * ph, y, I, 1.8);
      if (I > 0.62 && j === 0) CORES.push(x + sway * ph, y, I);
    }
  }
}

// ------------------------------------------------------------ the harbour

// the sky's own stars, drifting, so none of them burns in
function skyStars(g, T, ox, oy) {
  for (let i = 0; i < 22; i++) {
    const x = (noise(i, 1) * 128 + T * (0.22 + 0.2 * noise(i, 2))) % 128;
    const y = 2 + noise(i, 3) ** 1.6 * 34;
    if (noise(i, 5) > 0.5) continue;
    if (noise(Math.floor(T * 2.2) + i * 37, 8) < 0.3) continue;   // twinkle
    g.pixel(x + ox, y + oy, 1);
  }
}

/** The colon: two embers between the two systems, popping at every second. */
function colon(g, sec, T, ox, oy) {
  const tick = sec - Math.floor(sec);
  const flare = Math.exp(-tick * 4.2);
  for (let c = 0; c < 2; c++) {
    const x = COLON[0] + ox, y = COLON[1] + 11 * c + oy + 0.5 * Math.sin(T * 0.6 + c);
    const I = 0.62 + 1.35 * flare;
    glow(x, y, I, 2.4 + 1.6 * flare);
    CORES.push(x, y, I * 1.15);
  }
}

/** The far breakwater: a low silhouette, the sign's two masts, a light. */
function shoreline(g, T, ox, oy) {
  const y = HORIZON + oy;
  for (let x = 0; x < W; x++) {
    const t = noise(Math.floor(x / 3), 21);
    if (t < 0.3) g.pixel(x, y - 1, 1);
    if (t < 0.12) g.pixel(x, y - 2, 1);
  }
  // the two masts the hour set-piece is strung between, against the sky
  for (const mx of [2, 39]) {
    for (let y = 13; y < HORIZON; y++) if ((y + mx) % 3 === 0) g.pixel(mx + ox, y + oy, 1);
    g.pixel(mx - 1 + ox, HORIZON - 1 + oy, 1); g.pixel(mx + 1 + ox, HORIZON - 1 + oy, 1);
  }
  // a harbour light far right, blinking
  const lx = 122 + ox;
  if (T % 4.5 < 0.6) { g.pixel(lx, 35 + oy, 1); g.pixel(lx + 1, 35 + oy, 1); }
  else if (dither(lx, 35, 0.3)) g.pixel(lx, 35 + oy, 1);
}

/**
 * The river: every light above the waterline runs a broken column down the
 * water under it, shifted a little by the swell and thinning as it goes.
 */
const SKY = new Uint8Array(W * 26);    // the mirrored slice, reused every frame
function water(g, T, key) {
  const ko = key % 6, ko2 = (key * 3) % 5;   // the texture re-dealt each minute
  const ROWS = 26;                     // how far above the waterline is mirrored
  const sky = SKY;
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < W; x++) sky[y * W + x] = g.get(x, HORIZON - 1 - y) ? 1 : 0;
  for (let d = 0; d < ROWS; d += 2) {
    for (let x = 0; x < W; x++) {
      if (!sky[d * W + x]) continue;
      const len = 6 + Math.round(d * 0.75);
      for (let k = 1; k <= len; k++) {
        const y = HORIZON + k;
        if (y >= QUAY) break;
        const wob = Math.round((0.5 + 0.42 * k) * Math.sin(T * 1.2 + k * 1.9 + x * 0.13));
        if (wob + x < 0 || wob + x >= W) continue;
        if (dither(wob + x + ko, y + ko2, clamp01(0.54 - 0.22 * (k / (QUAY - HORIZON)) - 0.024 * d))) g.pixel(wob + x, y, 1);
      }
    }
  }
  // the surface itself: a few glints running on the swell
  for (let i = 0; i < 12; i++) {
    const y = HORIZON + 2 + Math.floor(noise(i, 31) * 12);
    const x = ((noise(i, 32) * 128 + T * (1.4 + noise(i, 33))) % 128 + 128) % 128;
    if (dither(x, y, 0.75)) g.pixel(x, y, 1);
  }
}

/** The near quay, drawn dark and last so it sits in front of the river. */
function quay(g, ox, oy, T) {
  // mooring posts: short, broken, and their dots move with the minute
  const ph = Math.floor(T / 60);
  for (const px of [14, 52, 88]) for (let y = 0; y < 5; y++)
    if ((y + px + ph) % 3) g.pixel(px + ox, QUAY + oy + y, 1);
}

// ------------------------------------------------------------ face

export default {
  name: 'Fireworks',
  blurb: 'A harbour at night: the minutes are numeral shells hanging in the sky, the hour burns as a lance set-piece on the breakwater, and a fuse crawls the quay as the seconds; on the hour, a waterfall.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  driver: 'full',

  frame(g, { date, fields: f, oled, night }) {
    const T = date.getTime() / 1000;
    const sec = f.sec;
    const [ox, oy] = orbit(date, 2, 3);
    F.fill(0);

    const slots = slotsOf(date);
    let flash = 0;

    // --- the hours and minutes, each slot from its own two instants
    for (let k = 0; k < 4; k++) {
      const s = slots[k];
      const [x0, y0, sc] = SLOT_AT[k];
      const now = date.getTime();
      const nextIn = (s.nx - now) / 1000;
      const age = (now - s.c) / 1000;
      const dying = clamp01((DIE - nextIn) / DIE);
      const X = x0 + ox, Y = y0 + oy;
      if (s.kind === 'shell') {
        if (dying > 0) shellDie(s.d, X, Y, sc, T, dying);
        else shellAt(s.d, X, Y, sc, T, s.c / 1000);
        if (nextIn < CLIMB) shellRise(X, Y, sc, T, s.nx / 1000);
      } else {
        if (dying > 0) lanceAtOut(s.d, X, Y, sc, T, dying);
        else lanceAt(s.d, X, Y, sc, T, s.c / 1000);
      }
      if (age < 0.18) flash = Math.max(flash, 1 - age / 0.18);
    }

    // --- the hour: a volley of shells and the waterfall
    if (f.m === 0) {
      flash = Math.max(flash, volley(T, sec, f.minuteKey % 91));
      waterfall(sec, f.minuteKey % 91);
    }

    colon(g, sec, T, ox, oy);
    skyStars(g, T, ox, oy);
    shoreline(g, T, ox, oy);
    develop(g, f.minuteKey);
    cores(g);
    water(g, T, f.minuteKey);
    quay(g, ox, oy, T);
    fuse(g, sec, T, ox, oy);

    oled.contrast(Math.min(255, (DAY + (NIGHT - DAY) * night) * (1 + 0.28 * flash)));
  },
};

/** The hour numeral going out: its candles die one after another. */
function lanceAtOut(d, x0, y0, sc, T, death) {
  const st = LANCE[d];
  for (let i = 0; i < st.n; i++) {
    const q1 = st.p[i * 3], q3 = st.p[i * 3 + 2];
    if (!burnt(death, q1)) continue;
    const x = x0 + st.x[i] * sc, y = y0 + st.y[i] * sc;
    const k = clamp01((death - q1) / 0.3);
    const I = (1 - k) * (1.0 + 0.2 * Math.sin(T * 9 + 6.3 * q3));
    if (I > 0.02) { glow(x, y, I, 2.3); CORES.push(x, y, I); }
    if (k < 1) for (let j = 0; j < 3; j++) {
      const ph = (((T * 2.4) + j * 0.34) % 1);
      glow(x + (q3 - 0.5) * 3 * ph, y - ph * 10, I * (1 - ph) * 0.55, 1.6);
    }
  }
}