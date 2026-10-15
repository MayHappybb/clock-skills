// Noodles: looking down into a bowl of shoyu ramen, and the time is four
// noodles lying on top of the broth. Each numeral is ONE long crinkly
// noodle (noodles-glyphs.js), wheat yellow with a dark keyline, laid in the
// shape of its digit; under the surface lies the rest of the bowl's
// noodles, dim through the soup, turning slowly with the stirred broth. The
// bowl's porcelain lip and red raimon band show in the corners; a sheet of
// nori and a narutomaki slice stand at the right; two rings of spring onion
// are the colon.
//
// The time is alive: a ramen noodle is crinkled, and every noodle's crinkle
// runs along it as the noodle slides along its own length, a notch on each
// beat. Once a second the chopsticks (lacquered, top centre) tap the broth;
// the ring rolls out across the bowl and every noodle and onion ring it
// passes heaves as it goes under. Every 15 s a bigger thing happens:
// :15 the chopsticks stir and the whole bowl swirls (every noodle surges
// along its length), :30 a shake of shichimi pepper rains in and floats,
// :45 a drop of chili oil lands and blooms into a red ring.
//
// Minute turn: the chopsticks reach over the changing digits, pinch their
// noodles and lift; each noodle pulls taut and thin and is slurped out
// along its own length (its tail runs through the digit to the chopsticks)
// and away. After :00 the chopsticks drop fresh noodles: each falls (whole,
// thin, the right digit), lands with a splash ring, plumps up and wobbles
// still. Hour: then the chef's big pull: a rope of dough is swung across the
// top of the bowl and folded, again and again, 1, 2, 4, 8 strands, finer
// each time, until the whole hank is dropped into the bowl; the steam
// billows. The time reads below it throughout.
//
// Palette, flat menu print: shoyu amber broth, two dimmer ambers for the
// noodles under it, wheat-yellow noodles with a near-black brown keyline
// (the strongest contrast on the glass), porcelain cream and raimon red,
// nori green-black, naruto white and pink, onion green, chopsticks in
// oxblood lacquer. No shading anywhere: every surface is one flat colour;
// the only effects are the ripple rings, a glint on the oil drops, steam
// wisps and the flourishes. At night the broth sinks to a deep brown and
// the porcelain to warm grey, the backlight dims to 55 %, and the noodles
// stay the brightest thing on the glass.
//
// Cost: one integer pass for broth, bed and rim (a rotated texture lookup a
// pixel), four noodles stamped into a small distance buffer (~25k integer
// ops each) and shaded through a 17 x 17 blend table, a few kit shapes.

import { clockFields, sin, cos, hash, rand, ease, clamp, progress } from '../js/kit.js';
import { GLYPHS } from './noodles-glyphs.js';
import { W, H, C, palette, paintBowl, bedToScreen, DIP_X, DIP_Y, N_COL } from './noodles-bowl.js';
import { drawNoodle, prepare } from './noodles-draw.js';
import { steam, shichimi, rayu, pull, pulling, landed, PULL_END } from './noodles-fx.js';

const TAU = Math.PI * 2;
const PAL = new Array(N_COL).fill(0), PAL565 = new Uint16Array(N_COL);

// ------------------------------------------------------------ layout
// hours a size larger, minutes set lower: four noodles laid in the bowl
const SLOTS = [
  { size: 0, x: 11, y: 22 }, { size: 0, x: 43, y: 22 },
  { size: 1, x: 82, y: 34 }, { size: 1, x: 108, y: 34 },
];
const COLON = [[74.5, 43], [74.5, 58]];

// ------------------------------------------------------------ motion constants
const LAMBDA = 8;          // crinkle wavelength, px
const K = TAU / LAMBDA;
const SLIDE = 2.2;         // steady slide along the length, px/s
const NOTCH = 6;           // the slide on each beat, px
const RING_V = 48;         // ripple speed, px/s (the bowl pass draws the same rings)
const RF = 2.0, RK = 3.25, MOAT = 2.25;

// per (slot, digit): distance and unit direction of each sample from the dip
const RAD = new Map();
function radial(si, d) {
  const k = si * 10 + d;
  let r = RAD.get(k);
  if (!r) {
    const gl = GLYPHS[SLOTS[si].size][d], n = gl.n;
    r = { r: new Float32Array(n), ux: new Float32Array(n), uy: new Float32Array(n) };
    for (let i = 0; i < n; i++) {
      const dx = SLOTS[si].x + gl.x[i] - DIP_X, dy = SLOTS[si].y + gl.y[i] - DIP_Y, l = Math.sqrt(dx * dx + dy * dy) || 1;
      r.r[i] = l; r.ux[i] = dx / l; r.uy[i] = dy / l;
    }
    RAD.set(k, r);
  }
  return r;
}

// the heave of a ring passing: out, then back (derivative of a bump), table over z in [-4, 4) px
const HEAVE = new Float32Array(65);
for (let i = 0; i <= 64; i++) { const z = (i / 8 - 4) / 2.2; HEAVE[i] = -z * Math.exp(-z * z) * 2.33; }
function heave(r, rings) {
  let s = 0;
  for (let k = 0; k < rings.n; k++) {
    const z = r - rings.R[k];
    if (z > -4 && z < 4) s += rings.A[k] * HEAVE[((z + 4) * 8) | 0];
  }
  return s;
}

const TL = 9;                                   // samples of each end that dive under the broth
const SX = new Float32Array(256 + 2 * TL), SY = new Float32Array(256 + 2 * TL);

/** Lay one noodle's centre line for this frame into SX/SY, its own samples from TL on, its ends either side. */
function lay(si, d, P, rings) {
  const sl = SLOTS[si], gl = GLYPHS[sl.size][d], rd = radial(si, d), n = gl.n;
  const cx = sl.x + gl.cx, cy = sl.y + gl.cy, sc = P.scale;
  for (let i = 0; i < n; i++) {
    const w = P.amp * sin(K * (i - P.phase)) + P.amp2 * sin(K * 0.5 * (i - P.phase * 0.7) + 1.3);
    const hv = rings.n ? heave(rd.r[i], rings) : 0;
    SX[TL + i] = cx + (gl.x[i] - gl.cx) * sc + gl.nx[i] * w + rd.ux[i] * hv;
    SY[TL + i] = cy + (gl.y[i] - gl.cy) * sc + gl.ny[i] * w + rd.uy[i] * hv;
  }
  // the ends carry on under the surface, straight on and curling a little
  for (let e = 0; e < 2; e++) {
    const i0 = e ? n - 1 : 0, i1 = e ? n - 3 : 2, sgn = e ? 1 : -1;
    let tx = SX[TL + i0] - SX[TL + i1], ty = SY[TL + i0] - SY[TL + i1];
    const l = Math.sqrt(tx * tx + ty * ty) || 1; tx /= l; ty /= l;
    const curl = (d * 7 + e * 3) % 5 - 2;
    for (let k = 1; k <= TL; k++) {
      const bend = curl * 0.012 * k * k, w = P.amp * sin(K * (i0 + sgn * k - P.phase));
      const x = SX[TL + i0] + tx * k - ty * (bend + w), y = SY[TL + i0] + ty * k + tx * (bend + w);
      const j = e ? TL + n - 1 + k : TL - k;
      SX[j] = x; SY[j] = y;
    }
  }
  return gl;
}

// ------------------------------------------------------------ the chopsticks

/** Two lacquered sticks from their tips up and right off the glass. */
function chopsticks(g, tx, ty, open, lift) {
  const dx = 0.9, dy = -0.43;          // along the sticks, towards the hand
  const px = 0.43, py = 0.9;           // across
  for (let k = 0; k < 2; k++) {
    const side = k ? 1 : -1, sep = 1.4 + open;
    const ax = tx + px * side * sep, ay = ty + py * side * sep * 0.6;
    const L = 120, spread = 4 + open * 0.5;
    const bx = ax + dx * L + px * side * spread, by = ay + dy * L + py * side * spread;
    const w0 = 0.85 + lift * 0.2, w1 = 2.2 + lift * 0.4;
    const pts = [[ax - px * w0, ay - py * w0], [bx - px * w1, by - py * w1], [bx + px * w1, by + py * w1], [ax + px * w0, ay + py * w0]];
    g.fillPolygon(pts, PAL[C.STICK], { aa: true });
    // the bare wooden tips
    const t = 4.5, cx = ax + dx * t, cy = ay + dy * t, wt = w0 + (w1 - w0) * (t / L);
    g.fillPolygon([[ax - px * w0, ay - py * w0], [cx - px * wt, cy - py * wt], [cx + px * wt, cy + py * wt], [ax + px * w0, ay + py * w0]], PAL[C.STICKTIP], { aa: true });
  }
}

// ------------------------------------------------------------ toppings

const NARUTO_X = 147, NARUTO_Y = 66.5, NARUTO_R = 8.6;
const NR = new Float32Array(20 * 20), NA = new Float32Array(20 * 20);
for (let j = 0; j < 20; j++) for (let i = 0; i < 20; i++) {
  const dx = i + 0.5 - 10, dy = j + 0.5 - 10;
  NR[j * 20 + i] = Math.hypot(dx, dy); NA[j * 20 + i] = (Math.atan2(dy, dx) / TAU + 1) % 1;
}
/** The narutomaki slice: a scalloped white disc with a pink spiral, turning. */
function naruto(g, rot) {
  const buf = g.buf, x0 = Math.round(NARUTO_X - 10), y0 = Math.round(NARUTO_Y - 10);
  const white = PAL565[C.NARUTO], pink = PAL565[C.PINK], key = PAL565[C.KEY];
  let n = 0;
  for (let j = 0; j < 20; j++) for (let i = 0; i < 20; i++) {
    const x = x0 + i, y = y0 + j;
    if (x < 0 || x >= W || y < 0 || y >= H) continue;
    const r = NR[j * 20 + i], a = NA[j * 20 + i];
    const edge = NARUTO_R + 0.7 * sin(a * TAU * 11 - rot);
    if (r > edge + 1.1) continue;
    let c = key;
    if (r <= edge) {
      // spiral: arm of pink winding out over two turns
      const q = (a + r / 3.9 - rot / TAU) % 1;
      c = r < 7.2 && r > 0.6 && q < 0.42 ? pink : white;
    }
    buf[y * W + x] = c; n++;
  }
  g.cost.box += 400 * 4; g.cost.px += n;
}

const NORI = [[137.5, 17], [156, 14], [159, 62], [139.5, 64]];
function nori(g) {
  g.fillPolygon(NORI, PAL[C.NORI]);
  // its pressed-fibre texture: a few lighter flecks, fixed
  for (let k = 0; k < 26; k++) {
    const h = hash(k, 91), u = (h & 255) / 255, v = ((h >> 8) & 255) / 255;
    const x = 139.5 + u * 16 + v * 1.5, y = 17 + v * 45;
    g.fillRect(Math.round(x), Math.round(y), 1 + ((h >> 16) & 1), 1, PAL[C.NORI2]);
  }
}

/** A ring of spring onion: green ring, pale centre, dark keyline. */
function negi(g, x, y, r) {
  g.fillCircle(x, y, r + 0.9, PAL[C.NEGIKEY], { aa: true });
  g.fillCircle(x, y, r, PAL[C.NEGI], { aa: true });
  g.fillCircle(x, y, r * 0.45, PAL[C.NEGI2], { aa: true });
}

// fixed in the bed: oil drops and loose onion rings, carried round by the broth
const OIL = Array.from({ length: 9 }, (_, k) => { const r = rand(k, 5), q = rand(k, 6); return [40 + r * 176, 70 + q * 116, 1 + (hash(k, 7) % 3) * 0.6, k]; });
const FLOAT_NEGI = [[70, 190, 1.7], [205, 95, 1.6], [150, 60, 1.5], [96, 120, 1.6]];

// ------------------------------------------------------------ the frame

const sm = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const LEAVE = 58.3;   // the chopsticks reach the changing noodles

/** Bed angle: one turn in two minutes, plus a surge at each :15 stir (closed form). */
function bedAngle(T) {
  const q = Math.floor(T / 60), s = T - q * 60;
  return (TAU * T) / 120 + (TAU / 8) * (q + sm(progress(s, 15, 17.5)));
}
/** Extra slide of every noodle from the :15 stirs, px (closed form, continuous). */
function stirSlide(T) {
  const q = Math.floor(T / 60), s = T - q * 60;
  return 3 * LAMBDA * (q + ease.inOutQuad(progress(s, 15, 17.8)));
}

export default {
  name: 'Noodles',
  blurb: 'Looking down into a bowl of ramen: each numeral is one crinkly noodle in the broth, sliding along its length on the beat; chopsticks slurp the old one and drop a fresh one each minute, and the chef pulls dough at the hour.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, nt = ctx.night, mk = f.minuteKey;
    ctx.lcd.backlight(1 - 0.45 * nt);
    palette(nt, PAL, PAL565);
    prepare(PAL, PAL565, nt);
    const T = f.h * 3600 + f.m * 60 + s;
    const prv = clockFields(new Date(ctx.date.getTime() - 60000)), nxt = clockFields(new Date(ctx.date.getTime() + 60000));
    const cur = f.hh + f.mm, old = prv.hh + prv.mm, nw = nxt.hh + nxt.mm;
    const hourShow = f.m === 0 && s < 14;
    const leaving = [], entering = [];
    for (let i = 0; i < 4; i++) {
      if (s >= LEAVE && cur[i] !== nw[i]) leaving.push(i);
      if (s < 2 && cur[i] !== old[i]) entering.push(i);
    }
    const theta = bedAngle(T);
    const thetaAt = (sec) => bedAngle(T - s + sec);

    // ---- the chopsticks: where are the tips, and the rings of their taps
    const st = sticks(s, leaving, entering, hourShow);
    const beat = Math.floor(s), fb = s - beat;
    const rings = { n: 0, R: new Float32Array(3), A: new Float32Array(3) };
    let mask = 0;
    for (let k = 0; k < 3; k++) {
      const n = beat - k;
      if (n < 2 || n > 57 || (hourShow && pulling(n))) continue;
      mask |= 1 << k;
      const age = fb + k, strong = n >= 15 && n <= 17 ? 1.5 : 1;
      rings.R[rings.n] = RING_V * age; rings.A[rings.n] = 1.4 * strong * (1 - age / 3); rings.n++;
    }

    // ---- broth, bed, rim, rings
    paintBowl(g, PAL565, theta, Math.round(RING_V * fb * 16), mask, 1);

    // ---- things floating on the broth, carried round by it
    for (const [u, v, r, k] of OIL) {
      const [x, y] = bedToScreen(u, v, theta);
      if (x < -3 || x > W + 3 || y < -3 || y > H + 3) continue;
      g.fillCircle(x, y, r, PAL[C.OIL]);
      const tw = (T * 0.7 + k * 0.37) % 1;
      if (r > 1.5 && tw < 0.25) g.pixel(x - 1, y - 1, PAL[C.GLINT]);
    }
    for (const [u, v, r] of FLOAT_NEGI) {
      const [x, y] = bedToScreen(u, v, theta);
      if (x > -4 && x < W + 4 && y > -4 && y < H + 4) negi(g, x, y, r);
    }
    shichimi(g, PAL, s, theta, thetaAt);
    rayu(g, PAL, s, mk);

    // ---- toppings at the right
    nori(g);
    naruto(g, T * 0.35);

    // ---- splash rings where fresh noodles land, and where the hour's hank lands
    for (const i of entering) {
      const t = s - 0.32;
      if (t > 0 && t < 0.9) {
        const sl = SLOTS[i], gl = GLYPHS[sl.size][0];
        const r = 6 + 34 * ease.outCubic(t / 0.9);
        g.ring(sl.x + gl.cx, sl.y + gl.cy, r - 0.8, r + 0.6, PAL[C.RIP1], { aa: true, a: 1 - t / 0.9 });
      }
    }
    const land = hourShow ? landed(s) : -1;
    if (land >= 0) for (let k = 0; k < 3; k++) {
      const t = land - k * 0.35;
      if (t <= 0 || t > 2.4) continue;
      const r = 4 + 70 * ease.outCubic(t / 2.4);
      g.ring(80, 30, r - 1, r + 1, PAL[C.RIP1], { aa: true, a: 0.9 * (1 - t / 2.4) });
    }
    if (hourShow) pull(g, PAL565, s, true);

    // ---- the four noodles
    const strands = [];
    const notch = 1 - (1 - Math.min(1, fb / 0.4)) ** 3;
    const slide = SLIDE * T + NOTCH * (beat + notch) + stirSlide(T);
    const stirring = progress(s, 15, 15.6) * (1 - progress(s, 17.2, 18));
    const splash = land >= 0 ? 1 - progress(land, 0, 2) : 0;
    for (let i = 0; i < 4; i++) {
      const d = +cur[i];
      const P = { scale: 1, amp: 0.45, amp2: 0.25, phase: 0, rf: RF, rk: RK, a: 0, tails: true };
      P.phase = (slide + i * 3.1) % (LAMBDA * 64);
      P.amp = 0.42 + 0.6 * (1 - Math.min(1, fb / 0.45)) ** 2 + 0.35 * stirring + 0.6 * splash;
      const gl = GLYPHS[SLOTS[i].size][d];
      const b = gl.n;
      const isLeaving = leaving.includes(i);
      if (isLeaving) {
        const t = s - LEAVE;
        const thin = ease.inOutQuad(progress(t, 0.35, 0.9));
        P.rf = RF - 1.15 * thin; P.rk = P.rf + (RK - RF) * (1 - thin);
        P.amp *= 1 - 0.7 * thin; P.amp2 *= 1 - thin;
        P.phase += 26 * ease.inQuad(progress(t, 0.3, 1.35));
        P.a = Math.round(gl.n * ease.inQuad(progress(t, 0.9, 1.35)));
        if (P.a >= gl.n) continue;
        P.tails = t < 0.6;
      } else if (entering.includes(i)) {
        const u = progress(s, 0, 0.32), v = progress(s, 0.32, 1.3);
        P.scale = 1.22 - 0.22 * ease.inQuad(u);
        P.rf = 0.85 + (RF - 0.85) * ease.outBack(v);
        P.rk = P.rf + (RK - RF) * ease.outCubic(v);
        P.amp = 0.42 + 1.3 * (1 - ease.outQuad(v)); P.amp2 = 0.25 + 0.6 * (1 - v);
        P.tails = v > 0.25;
      }
      lay(i, d, P, rings);
      // which ends show diving under: not on closed loops, not while being lifted or before landing
      const closed = d === 0 || d === 8;
      const tails = !closed && P.tails;
      const a0 = tails && P.a === 0 ? 0 : TL + P.a, b0 = tails && !isLeaving ? TL + b + TL : TL + b;
      const over = gl.over ? [gl.over[0] + TL, gl.over[1] + TL] : null;
      drawNoodle(g, SX, SY, a0, b0, P.rf, P.rk, MOAT * Math.min(1, P.rk / RK), over, TL, TL + b, PAL565[C.BED2]);
      if (isLeaving) strands.push([SX[TL + b - 1], SY[TL + b - 1], P.rf]);
    }

    // ---- the colon: two onion rings, heaving with the rings
    for (const [x, y] of COLON) {
      const dx = x - DIP_X, dy = y - DIP_Y, r = Math.hypot(dx, dy), hv = rings.n ? heave(r, rings) : 0;
      negi(g, x + (dx / r) * hv, y + (dy / r) * hv, 2.4);
    }

    // ---- above the bowl: steam, the chef's hank, the lifted noodles, the chopsticks
    steam(g, PAL, T, hourShow ? 1 + 1.5 * (land >= 0 ? 1 - progress(land, 0, 3) : 0) : 1);
    if (hourShow) pull(g, PAL565, s, false);
    const t = s - LEAVE;
    if (strands.length && t > 0.15 && t < 1.55) {
      const grow = sm((t - 0.15) / 0.18), up = sm((t - 1.36) / 0.17);
      for (const [x, y, rf] of strands) {
        // from the tips down to where the noodle leaves the broth; at the end its last bit lifts off
        const ex = st.x + (x - st.x) * grow, ey = st.y + (y - st.y) * grow;
        const bx = ex + (st.x - ex) * up, by = ey + (st.y - ey) * up;
        g.thickLine(st.x, st.y, bx, by, Math.max(1.3, rf * 1.3), PAL[C.FILL], { aa: true });
      }
    }
    if (st.show) chopsticks(g, st.x, st.y, st.open, st.lift);
  },
};

// ------------------------------------------------------------ the chopsticks' minute

const OFF = { dx: 34, dy: -34 };   // where the sticks go when lifted away (off the top right)

/** Tip position, opening and lift for second-of-minute s. */
function sticks(s, leaving, entering, hourShow) {
  const rest = () => {
    // a small stirring loop each second that comes back to the dip on the beat; a wide stir at :15
    const fb = s % 1, a = fb * TAU, big = 1 + 1.6 * progress(s, 15, 15.4) * (1 - progress(s, 17.3, 17.8));
    const tap = fb < 0.12 ? 1 - fb / 0.12 : 0;
    return { x: DIP_X + 2.2 * big * sin(a), y: DIP_Y + 1.1 * big * (1 - cos(a)) + tap * 0.8, open: 0.3 + tap * 0.5, lift: 0, show: true };
  };
  const over = (list) => {
    let x = 0;
    for (const i of list) x += SLOTS[i].x + (SLOTS[i].size ? 11 : 9);
    return { x: clamp(x / list.length + 3, 40, 130), y: 5 };
  };
  const lerpPose = (a, b, u) => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, open: a.open + (b.open - a.open) * u, lift: a.lift + (b.lift - a.lift) * u, show: true });
  if (s >= 57.6 && leaving.length) {
    const o = over(leaving), hold = { x: o.x, y: o.y, open: 1.9, lift: 0 };
    if (s < LEAVE) return lerpPose(rest(), hold, ease.inOutCubic(progress(s, 57.6, LEAVE)));
    const t = s - LEAVE;
    if (s >= 59.72) {
      // back in with the fresh noodles
      const u = ease.outCubic(progress(s, 59.72, 59.98));
      return lerpPose({ x: o.x + OFF.dx, y: o.y + OFF.dy, open: 0, lift: 1 }, { x: o.x, y: o.y, open: 0, lift: 0 }, u);
    }
    const away = ease.inQuad(progress(t, 1.0, 1.42));
    return { x: o.x + OFF.dx * away, y: o.y + 3 * sm(t / 0.2) - 2.5 * sm((t - 0.3) / 0.7) + OFF.dy * away, open: 1.9 * (1 - sm(t / 0.2)), lift: away, show: away < 1 };
  }
  if (s < 1.9 && entering.length) {
    const o = over(entering), drop = { x: o.x, y: o.y, open: 2.2, lift: 0 };
    if (s < 0.4) return { x: o.x, y: o.y - 1.5 * sm(s / 0.3), open: 2.2 * sm(s / 0.12), lift: 0, show: true };
    if (hourShow) {
      const u = ease.inQuad(progress(s, 0.4, 1.2));
      return { x: o.x + OFF.dx * u, y: o.y - 1.5 + OFF.dy * u, open: 2.2, lift: u, show: u < 1 };
    }
    return lerpPose(drop, rest(), ease.inOutCubic(progress(s, 0.5, 1.9)));
  }
  if (hourShow) {
    if (s < PULL_END) return { x: 0, y: 0, open: 0, lift: 1, show: false };
    if (s < PULL_END + 1.2) {
      const r = rest();
      return lerpPose({ x: r.x + OFF.dx, y: r.y + OFF.dy, open: 0.3, lift: 1 }, r, ease.outCubic(progress(s, PULL_END, PULL_END + 1.2)));
    }
  }
  return rest();
}
