// Dachshund: a park lawn seen from above, and the time is four long dogs
// lying on it. Each numeral IS one dachshund (dachshund-glyphs.js): its body
// is the stroke, laid along one continuous route, tail at the hairline
// terminal and head at the ball terminal; where a 4 or an 8 crosses itself
// the front half lies over the back. Ten numerals, ten dogs, ten coats (red,
// black and tan, cream, chocolate, dapple, wire, piebald, brindle, long-hair,
// blue and tan), each in a coloured collar, with paws, flapping ears, a nose,
// a wagging tail and a flat shadow on the grass.
//
// The time is alive: once a second a happy wiggle runs up every body from
// tail to nose (a lateral wave, the four dogs a beat apart, left to right);
// when it reaches the head the dog sniffs and its ears flop out and settle.
// Tails wag all the time, heads look about, eyes blink, tufts lean in the
// wind, a butterfly works the tulips. Every 15 s a flourish: the dogs shake
// themselves off (a fast shimmy runs nose to tail, ears flying, dust off the
// coats), or a squirrel runs the path and every head follows it while each
// dog woofs as it passes, or a butterfly drifts over and the heads track it.
//
// Minute turn: each leaving dog sniffs the ground, digs (paws scrabbling,
// clods flying), and goes to earth: nose first into a hole past its nose,
// its body pouring in after it with the coat sliding along the route, or
// (the 2 4 5 7, so that a stem never stands alone and reads 1) backing tail
// first into a hole at its tail end, bar last (gone by :59.85). The new dog
// has been tunnelling: a mound heaves at its tail end before :00, bursts
// after it, and the dog walks out nose first, tracing its numeral, its body
// drawn out of the ground, paws trotting (locked to the ground, never
// sliding), decelerating into place with a nod; the hole fills behind its
// tail and it shakes off the dirt. All changing digits move on one schedule,
// so none outlives another; the routes' directions were chosen so that a
// half-drawn numeral is a hook or an arc, not another numeral.
// Hour: someone off screen throws a ball over the park; every head snaps
// round, and the four dogs chase it: the whole park streams past beneath
// them (one lap of a 320-px loop: flowerbed, lime tree, pond, bench, lamps)
// while they gallop in their numerals, ears back, tongues out; they catch up
// with the ball as the park comes round to the same view, pant over it, and
// it is thrown again.
//
// Palette: a flat park print. One calm mown green is the ground; the dogs
// are warm coats (rust, tan, cream, chocolate, slate) in a 1-px warm-black
// keyline with a flat cast shadow, so they are the strongest contrast on the
// glass; the collars (cobalt, red, yellow, pink) and the tennis-ball colon
// are the accents; the edges carry sand, tulip red, pond blue. The sun moves:
// shadows and the sunlit rim along each dog's flank swing with the hour, and
// the evening goes golden. Night: the lawn sinks to deep teal under two lamp
// pools, fireflies drift, the backlight dims to 45 %, and the dogs sleep
// (eyes shut, the wiggle slowed to breathing, a dreaming paddle now and
// then) while their coats stay the brightest thing on the glass.
//
// Cost: per frame one palette pass of the park map (12.8k byte lookups),
// four dog boxes of 40 x 64 table lookups (the body fields), a few dozen
// small AA shapes (heads, paws, balls). Flash: 120 KB body fields and
// routes, 20 KB coat textures, 25.6 KB park map. RAM: per-dog arrays of a
// few hundred bytes; nothing cached per minute, every frame built cold.

import { to565, sin, cos, mix, hash, clockFields, clamp } from '../js/kit.js';
import { ROUTES, EXT, BOXW, BOXH, OX, OY, ENTER, LEAVE } from './dachshund-glyphs.js';
import { DOGS, COATS, LANES, KEY, head, paw, shade565 } from './dachshund-coats.js';
import { park, setPalette, goldAt, tufts, butterfly, squirrel, ball, fireflies, lampGlow } from './dachshund-park.js';

const W = 160, H = 80, TAU = Math.PI * 2;
const SX = [19, 52, 108, 141], SY = [18, 15, 15, 18];   // centreline box per slot: centre x, top y
const COLON = [[80, 33], [80, 48]];

// the minute turn
const SNIFF0 = 57.75, DIG0 = 58.15, DIVE0 = 58.5, DIVE1 = 59.85;
const ENT0 = 0.12, ENT1 = 1.55;   // the longest dog (8, 130 px) peaks at 1.9 px a frame
// the hour
const THROW0 = 2.2, THROW1 = 3.8, RUN0 = 3.0, RUN1 = 9.8, TOSS0 = 11.2, TOSS1 = 12.4;
const BALL_PX = 470;      // where the ball lands, in park px (it comes round with the lap)

const RAD = new Int16Array(256), OFF = new Int16Array(256), VV = new Int16Array(256), LM = new Int32Array(256), RIM = new Uint8Array(256);
const PAL = new Uint16Array(8);

const sm = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const frac = (x) => x - Math.floor(x);

/** Trapezoid motion with smooth ramps: progress 0..1 over [0, T], ramps a and b. */
function trap(t, T, a, b) {
  if (t <= 0) return 0;
  if (t >= T) return 1;
  const V = 1 / (T - (a + b) / 2);
  if (t < a) { const u = t / a; return V * a * (u * u * u - (u * u * u * u) / 2); }
  if (t > T - b) { const w = (T - t) / b; return 1 - V * b * (w * w * w - (w * w * w * w) / 2); }
  return V * (a / 2 + (t - a));
}

/** Speed of trap() as a fraction of its cruise speed. */
function trapV(t, T, a, b) {
  if (t <= 0 || t >= T) return 0;
  if (t < a) { const u = t / a; return u * u * (3 - 2 * u); }
  if (t > T - b) { const w = (T - t) / b; return w * w * (3 - 2 * w); }
  return 1;
}

/** Body half-width (px) at v px behind the nose of a dog L long. */
function profile(v, L) {
  if (v < 3) return 0;
  if (v < 8) return 2.9;
  if (v < 14) return 2.9 + (v - 8) * 0.1;
  if (v < L - 13) return 3.5;
  if (v < L - 8) return 3.5 - (v - (L - 13)) * 0.16;
  if (v <= L) return 2.6 - (v - (L - 8)) * 0.24;
  return 0;
}

/** Route point at fractional s (route px), in field-box coordinates. */
function at(R, s) {
  let k = s + EXT;
  if (k < 0) k = 0; else if (k > R.M - 1.001) k = R.M - 1.001;
  const i = k | 0, f = k - i;
  return [R.X[i] + (R.X[i + 1] - R.X[i]) * f, R.Y[i] + (R.Y[i + 1] - R.Y[i]) * f];
}
function dirAt(R, s0, s1) {
  const [ax, ay] = at(R, s0), [bx, by] = at(R, s1);
  let fx = bx - ax, fy = by - ay; const l = Math.sqrt(fx * fx + fy * fy) || 1;
  return [fx / l, fy / l];
}

// ---------------------------------------------------------------- one dog's body

function body(g, st, sun, nightPal) {
  const { d, h, bx, by, lo, hi } = st, R = ROUTES[d], L = R.L, M = R.M, T = COATS[d];
  for (let k = 0; k < M; k++) {
    const s = k - EXT;
    if (s < lo || s > hi) { RAD[k] = 0; continue; }
    const v = h - s, r = profile(v, L) + (d === 8 && v > 14 && v < L - 10 && ((v | 0) & 3) < 2 ? 0.35 : 0);
    RAD[k] = (r * 16 + 0.5) | 0;
    VV[k] = v < 0 ? 0 : v > 159 ? 159 : v | 0;
    OFF[k] = (st.off(v) * 16 + (st.off(v) < 0 ? -0.5 : 0.5)) | 0;
    LM[k] = RAD[k] > 20 ? ((LANES << 12) / (2 * RAD[k] - 34)) | 0 : 0;
    RIM[k] = (R.TY[k] * sun[0] - R.TX[k] * sun[1]) > 0 ? 1 : 0;
  }
  const pal = nightPal[d];
  for (let i = 0; i < 8; i++) PAL[i] = pal[i];
  const buf = g.buf, S1 = R.S1, D1 = R.D1, S2 = R.S2, D2 = R.D2;
  const x0 = bx < 0 ? 0 : bx, x1 = bx + BOXW > W ? W : bx + BOXW, y0 = by < 0 ? 0 : by, y1 = by + BOXH > H ? H : by + BOXH;
  const shx = st.shx, shy = st.shy;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y - by) * BOXW + (x - bx);
      let best = -1, be = 0;
      let k = S1[i];
      if (k !== 255 && RAD[k]) { const e = D1[i] - OFF[k]; if (e < RAD[k] && e > -RAD[k]) { best = k; be = e; } }
      k = S2[i];
      if (k !== 255 && k > best && RAD[k]) { const e = D2[i] - OFF[k]; if (e < RAD[k] && e > -RAD[k]) { best = k; be = e; } }
      const o = y * W + x;
      if (best >= 0) {
        const r = RAD[best];
        if (be > r - 17 || be < 17 - r) { buf[o] = PAL[0]; continue; }
        let lane = ((be + r - 17) * LM[best]) >> 12; if (lane > LANES - 1) lane = LANES - 1; else if (lane < 0) lane = 0;
        const c = T[VV[best] * LANES + lane];
        buf[o] = (c & 0x80) && (lane >= 4 ? 1 : 0) === RIM[best] ? PAL[5] : PAL[c & 0x7f];
        continue;
      }
      // the flat cast shadow: is the body here, looked up from the sun's side?
      const sx = x - bx - shx, sy = y - by - shy;
      if (sx < 0 || sy < 0 || sx >= BOXW || sy >= BOXH) continue;
      const j = sy * BOXW + sx;
      let sh = false;
      k = S1[j];
      if (k !== 255 && RAD[k]) { const e = D1[j] - OFF[k]; if (e < RAD[k] && e > -RAD[k]) sh = true; }
      if (!sh) { k = S2[j]; if (k !== 255 && RAD[k]) { const e = D2[j] - OFF[k]; if (e < RAD[k] && e > -RAD[k]) sh = true; } }
      if (sh) buf[o] = shade565(buf[o]);
    }
  }
  const n = (x1 - x0) * (y1 - y0);
  g.cost.px += n; g.cost.box += n * 9;
}

/** Paws and head, posed. */
function overlays(g, st, pals) {
  const { d, h, bx, by, lo, hi } = st, R = ROUTES[d], L = R.L, pz = pals.rgb[d];
  const pt = (s) => { const [x, y] = at(R, s); return [x + bx, y + by]; };
  // paws: front pair behind the collar, hind pair at the hips; a trot locked to the ground
  for (const [v, lead] of [[14, 0], [L - 12, 1]]) {
    const s = h - v;
    if (s < lo + 1 || s > hi - 1 || s < 0.5 || s > L - 0.5) continue;
    const [x, y] = pt(s), [tx, ty] = dirAt(R, s - 1.5, s + 1.5);
    const off = st.off(v);
    for (const side of [1, -1]) {
      const ph = st.gait + (side > 0 ? 0 : Math.PI) + lead * Math.PI;
      const fwd = st.stride * sin(ph) + ((lead ? st.digWho === 'hind' : st.digWho === 'front') ? st.dig * sin(st.T * 34 + side) : 0);
      const q = side * 4.0 + off;
      paw(g, x + ty * q + tx * fwd, y - tx * q + ty * fwd, pz[3]);
    }
  }
  // head: the skull rides v = 5 behind the nose; in a hole it sinks and shrinks
  const hp = st.head;
  if (!hp) return;
  let ss = h - 5, k = 1;
  if (h > L) { k = clamp(1 - (h - L) / 10, 0, 1); ss = Math.min(ss, L + 4); }
  if (h < 8) { k = clamp((h + 4) / 12, 0, 1); ss = Math.max(ss, -4); }
  if (k <= 0.15) return;
  const [x, y] = pt(ss);
  let [fx, fy] = dirAt(R, ss - 5, ss + 4);
  if (hp.yaw) { const c = cos(hp.yaw), s = sin(hp.yaw); [fx, fy] = [fx * c - fy * s, fx * s + fy * c]; }
  const off = st.off(5);
  hp.k = k;
  head(g, d, x + fy * off + fx * (hp.nod || 0), y - fx * off + fy * (hp.nod || 0), fx, fy, hp, pz);
}

// ---------------------------------------------------------------- holes and dirt

const DIRT = 0x6b4a2a, DIRT_L = 0x93683c, DARK = 0x1e140c;
function holeRim(g, x, y, r) { if (r > 0.3) { g.fillCircle(x, y, r + 1.7, DIRT, { aa: true }); } }
function holeIn(g, x, y, r) { if (r > 0.3) { g.fillCircle(x, y, r, DARK, { aa: true }); g.fillCircle(x - 0.6, y - 0.6, r * 0.55, 0x0e0905, { aa: true }); } }
function mound(g, x, y, r, T) {
  if (r < 0.3) return;
  const j = sin(T * 47) * 0.4;
  g.fillCircle(x + j, y, r + 0.9, KEY, { aa: true });
  g.fillCircle(x + j, y, r, DIRT, { aa: true });
  g.fillCircle(x + j - r * 0.3, y - r * 0.3, r * 0.5, DIRT_L, { aa: true });
}
/** Clods thrown from (x, y) roughly along (dx, dy), t seconds after the throw. */
function dirt(g, x, y, dx, dy, t, seed, n, spread = 1.3) {
  if (t < 0 || t > 0.75) return;
  const base = Math.atan2(dy, dx);
  for (let i = 0; i < n; i++) {
    const tt = t - (hash(seed, i, 3) % 100) / 900;
    if (tt < 0) continue;
    const a = base + ((hash(seed, i, 1) % 1000) / 1000 - 0.5) * 2 * spread, sp = 45 + (hash(seed, i, 2) % 60);
    const dd = (sp * tt) / (1 + 2.4 * tt), z = 26 * tt * (0.62 - tt);
    if (z < -0.5) continue;
    const px = x + cos(a) * dd, py = y + sin(a) * dd - z;
    const sz = i % 3 === 0 ? 2 : 1;
    g.fillRect(Math.round(px), Math.round(py), sz, sz, i & 1 ? DIRT : DIRT_L);
  }
}

// ---------------------------------------------------------------- the face

let PALS_KEY = '', PALS = [];
function dogPalettes(night) {
  const key = night.toFixed(2);
  if (key === PALS_KEY) return PALS;
  PALS_KEY = key;
  PALS = DOGS.map(({ pal }) => pal.map((c, i) => {
    if (i === 0) return to565(c);
    let q = night > 0 ? mix(c, mix(c, 0x40507a, 0.28), night) : c;
    if (i === 5 && night > 0) q = mix(q, pal[1], night * 0.7);
    return to565(q);
  }));
  PALS.rgb = DOGS.map(({ pal }) => pal.map((c) => (night > 0 ? mix(c, mix(c, 0x40507a, 0.28), night) : c)));
  return PALS;
}

const FLOURISH = [['shake', 'squirrel', 'butterfly'], ['squirrel', 'butterfly', 'shake'], ['butterfly', 'shake', 'squirrel'],
  ['shake', 'butterfly', 'squirrel'], ['squirrel', 'shake', 'butterfly'], ['butterfly', 'squirrel', 'shake']];

export default {
  name: 'Dachshund',
  blurb: 'A park lawn from above: each numeral is a long dachshund lying in its shape; they wiggle on the beat, dig out and back in at the minute, and chase a ball round the park at the hour.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, mk = f.minuteKey, nt = ctx.night;
    const T = (ctx.date.getTime() % 86400000) / 1000;
    ctx.lcd.backlight(1 - 0.55 * nt);
    const prv = clockFields(new Date(ctx.date.getTime() - 60000)), nxt = clockFields(new Date(ctx.date.getTime() + 60000));
    const cur = f.hh + f.mm, old = prv.hh + prv.mm, nw = nxt.hh + nxt.mm;
    const hourShow = prv.h !== f.h && s < 13;
    const asleep = nt > 0.5;

    // ---- light: palette, sun, shadows
    const hf = f.h + f.m / 60 + s / 3600;
    setPalette(nt, goldAt(hf) * (1 - nt));
    const az = clamp((hf - 6) / 12, 0.08, 0.92) * Math.PI;
    const sun = [cos(az), sin(az) * 0.8 + 0.2];
    const len = nt > 0.5 ? 1.2 : 2.0 + 1.2 * Math.abs(cos(az));
    const shx = Math.round(-sun[0] * len), shy = Math.round(-sun[1] * len * 0.7) || -1;
    const pals = dogPalettes(nt);

    // ---- the hour: the throw, the lap, the catch, the toss
    let scroll = 0, run = 0, ballAt = null;
    if (hourShow) {
      if (s > RUN0 && s < RUN1 + 0.01) scroll = 320 * trap(s - RUN0, RUN1 - RUN0, 2.0, 2.2);
      else if (s >= RUN1) scroll = 320;
      run = sm((s - RUN0) / 0.6) * (1 - sm((s - RUN1 + 0.6) / 0.8));
      if (s >= THROW0 && s < THROW1) {
        const u = (s - THROW0) / (THROW1 - THROW0);
        ballAt = { x: -8 + 186 * u, y: 66 - 30 * u, z: 46 * u * (1 - u) + 2 };
      } else if (s >= THROW1 && s < TOSS0) {
        const x = BALL_PX - scroll;
        if (x < 170) ballAt = { x, y: 70, z: 0 };
      } else if (s >= TOSS0 && s < TOSS1) {
        const u = (s - TOSS0) / (TOSS1 - TOSS0);
        ballAt = { x: 150 - 120 * u, y: 70 - 64 * u, z: 40 * u * (1 - u) + 30 * u * u };
      }
    }
    if (scroll >= 320) scroll = 0;

    // ---- the park
    park(g, scroll);
    if (nt > 0) lampGlow(g, scroll, nt);
    tufts(g, scroll, T, nt);
    if (nt < 0.5) {
      // a butterfly working the tulips along the top
      const bx = -10 + ((T * 7) % 190), by = 4 + 2.5 * sin(T * 1.7) + 1.5 * sin(T * 4.1);
      butterfly(g, bx, by, T, 0xf8f0a0);
    }

    // ---- this second's flourish
    const fk = Math.floor(s / 15), ft = s - fk * 15;
    let fl = null;
    if (fk >= 1 && ft < 4.2 && !(hourShow && s < 13)) fl = asleep ? 'dream' : FLOURISH[mk % 6][fk - 1];
    let critter = null;
    if (fl === 'squirrel') {
      const x = 172 - 50 * ft + 10 * sin(ft * 2.2);
      critter = { x, y: 74.5 };
      if (x > -14 && x < 176) squirrel(g, x, 74.5, -1, T, nt > 0.5);
    } else if (fl === 'butterfly') {
      critter = { x: -6 + 42 * ft, y: 24 + 16 * sin(ft * 1.6) + 4 * sin(ft * 5) };
    }

    // ---- the dogs
    const sts = [], holes = [], mounds = [], clods = [];
    // where the heads look during the hour: the ball, or far ahead while it is out of sight
    let hourLook = null, hourW = 0;
    if (hourShow) {
      hourW = sm((s - THROW0) / 0.35) * (1 - sm((s - TOSS1) / 0.5));
      hourLook = ballAt ? [ballAt.x, ballAt.y - ballAt.z] : s < TOSS0 ? [200, 40 + 30 * sm((s - THROW1) / (RUN1 - THROW1))] : [20, -20];
    }
    for (let i = 0; i < 4; i++) {
      const d = +cur[i];
      const bx = SX[i] - 11 - OX, by = SY[i] - OY;
      const R0 = ROUTES[d], L = R0.L;
      let h = L, gait = 0, mv = 0, dig = 0, nod = 0, sniff = 0, still = 1, st0 = { back: false, dig: 'front' };
      const exit = s >= SNIFF0 - 0.5 && cur[i] !== nw[i], enter = s < 4 && old[i] !== cur[i];
      if (exit) {
        const t = s - DIVE0, TT = DIVE1 - DIVE0, back = LEAVE[d] === 'tail';
        const p = trap(t, TT, 0.2, 0.12);
        h = back ? L - p * (L + 9) : L + p * (L + 5);
        mv = trapV(t, TT, 0.2, 0.12);
        gait = (p * (L + 5) / 7) * TAU;
        still = 1 - sm((s - SNIFF0 + 0.35) / 0.35);              // stop looking about: eyes on the ground
        if (s >= SNIFF0 && s < DIG0 + 0.2) sniff = Math.abs(sin((s - SNIFF0) * Math.PI * 6.5)) * 1.2 * (1 - sm((s - DIG0) / 0.2));
        dig = sm((s - DIG0) / 0.1) * (1 - sm((s - DIVE0 - 0.05) / 0.2));
        // nose first into a hole past the nose, or backing into one past the tail
        const hs = back ? -4 : L + 4, [hx, hy] = at(R0, hs), [ex, ey] = back ? dirAt(R0, 4, -4) : dirAt(R0, L - 6, L + 2);
        holes.push([hx + bx, hy + by, 3.7 * sm((s - DIG0 + 0.05) / 0.3)]);
        // clods thrown out of the hole while it digs: overlapping batches, each living out its arc
        const c = Math.floor((s - DIG0) / 0.3);
        for (const cc of [c - 1, c]) {
          const t0 = DIG0 + cc * 0.3;
          if (cc >= 0 && t0 < DIVE0 + 0.2) clods.push([hx + bx, hy + by, back ? ex : -ex, back ? ey : -ey, s - t0, mk * 8 + i + cc * 31, 6]);
        }
        // the next dog heaves its mound where it will come out, before :00
        const dn = +nw[i], Rn = ROUTES[dn], [mx, my] = at(Rn, ENTER[dn] === 'tail' ? Rn.L + 4 : -4);
        mounds.push([mx + bx, my + by, 3.4 * sm((s - 59.5) / 0.45)]);
        st0 = { back, dig: back ? 'hind' : 'front' };
      } else if (enter) {
        const t = s - ENT0, TT = ENT1 - ENT0, back = ENTER[d] === 'tail';
        const p = trap(t, TT, 0.15, 0.4);
        h = back ? 2 * L + 4 - p * (L + 4) : -4 + p * (L + 4);
        mv = trapV(t, TT, 0.15, 0.4);
        gait = (p * (L + 4) / 7) * TAU;
        still = sm((s - ENT1 - 0.1) / 0.6);
        const hs = back ? L + 4 : -4, [hx, hy] = at(R0, hs), [ex, ey] = back ? dirAt(R0, L - 4, L + 4) : dirAt(R0, 4, -4);
        const r = s < ENT1 ? 3.7 * sm((s - 0.03) / 0.16) : 3.7 * (1 - sm((s - ENT1 - 0.05) / 0.4));
        holes.push([hx + bx, hy + by, r]);
        mounds.push([hx + bx, hy + by, 3.4 * (1 - sm((s - 0.02) / 0.14))]);
        clods.push([hx + bx, hy + by, ex, ey, s - 0.03, mk * 8 + i, 12, 2.4]);
        clods.push([hx + bx, hy + by, ex, ey, s - ENT1 - 0.05, mk * 8 + i + 5, 6, 2.6]);
        // follow-through: the head swings on when the walk stops, and back
        nod = (back ? -1 : 1) * 1.3 * sin(clamp((s - ENT1 + 0.3) / 0.9, 0, 1) * TAU) * (1 - sm((s - ENT1 + 0.1) / 0.5));
        // the old dog's hole closing just after :00
        const dol = +old[i], Ro = ROUTES[dol], [ox, oy] = at(Ro, LEAVE[dol] === 'tail' ? -4 : Ro.L + 4);
        holes.push([ox + bx, oy + by, 3.7 * (1 - sm(s / 0.35))]);
        st0 = { back, dig: '' };
      }
      const lo = Math.max(-4, h - L), hi = Math.min(h, L + 4);
      const st = { d, h, bx, by, lo, hi, shx, shy, gait, stride: 1.3 * mv, dig: 1.6 * dig, digWho: st0.dig, T };

      // ---- the motion along the body (lateral offset, px, by v from the nose)
      const ph = frac(s - i * 0.13);
      const restW = still * (1 - mv) * (1 - run);
      const wiggleA = (asleep ? 0.9 : 1.85) * restW;
      let shakeT = -1;
      if (fl === 'shake') shakeT = ft - 0.4 - i * 0.22;
      if (enter && !hourShow && s > ENT1 + 0.45) shakeT = s - ENT1 - 0.45;
      const shakeA = shakeT > 0 && shakeT < 1.3 ? 1.9 * sm(shakeT / 0.2) * (1 - sm((shakeT - 1.0) / 0.3)) : 0;
      const dream = fl === 'dream' && i === mk % 4 ? ft : -1;
      const dreamA = dream >= 0 && dream < 3 ? 0.7 * sm(dream / 0.4) * (1 - sm((dream - 2.4) / 0.6)) : 0;
      const excite = critter ? sm(ft / 0.5) * (1 - sm((ft - 3.5) / 0.6)) : 0;
      const tailA = asleep ? 0.8 : 2.6 + 0.9 * Math.max(excite, hourW) - 1.2 * run;
      const tailPh = T * 2.6 * TAU + i * 1.3, runPh = s * 3.2 * TAU, walkPh = gait * 0.5;
      st.off = (v) => {
        let o = 0;
        if (wiggleA > 0 && ph < 0.9) {                                 // the beat: a wiggle running tail to nose
          const fr = L + 14 - (L + 34) * sm(ph / 0.9) , u = (v - fr) / 18;
          if (u > -1 && u < 1) o = wiggleA * (0.5 + 0.5 * cos(Math.PI * u)) * sin(((v - fr) / 24) * TAU);
        }
        if (mv > 0) o += 0.6 * mv * sin(walkPh - v * 0.15);            // a little swagger as it walks
        if (run > 0) o += run * 1.1 * sin(v / 20 * TAU + runPh);       // the gallop
        if (shakeA > 0) {
          const fr2 = -10 + (L + 20) * (shakeT / 1.1), u = (v - fr2) / 22;
          if (u > -1 && u < 1) o += shakeA * (0.5 + 0.5 * cos(Math.PI * u)) * sin(s * 7.5 * TAU + v * 0.2);
        }
        if (dreamA > 0) o += dreamA * sin(s * 5 * TAU + v * 0.3);
        if (v > L - 11) { const q = (v - (L - 11)) / 11; o += tailA * q * q * sin(tailPh); }
        return o;
      };

      // ---- the head's pose
      const hp = { ear: 0, yaw: 0 };
      const [cx, cy] = at(R0, Math.min(h, L) - 4), gx = cx + bx, gy = cy + by;
      const [fx0, fy0] = dirAt(R0, Math.min(h, L) - 9, Math.min(h, L));
      const aim = (tx, ty) => { const a = Math.atan2(ty - gy, tx - gx) - Math.atan2(fy0, fx0); return 0.8 * Math.sin(a); };
      let yaw = 0.22 * sin(T * 0.37 + i * 1.9);
      if (excite > 0) yaw += (aim(critter.x, critter.y) - yaw) * excite;
      if (hourW > 0) yaw += (aim(hourLook[0], hourLook[1]) - yaw) * hourW;
      hp.yaw = yaw * (1 - mv) * still;
      // the beat: the wiggle arrives at the head, the dog sniffs and its ears flop
      let ear = 0;
      if (!asleep && ph > 0.6 && ph < 0.9) sniff = Math.max(sniff, sin(((ph - 0.6) / 0.3) * Math.PI) * restW);
      if (!asleep && ph > 0.68) { const q = ph - 0.68; ear = 0.42 * Math.exp(-q * 5) * sin(q * 22) * restW; }
      ear += 0.18 * mv * sin(gait);
      hp.ear = ear;
      if (shakeA > 0) { const e = 0.7 * (shakeA / 1.9) * sin(s * 7.5 * TAU); hp.earL = ear + e; hp.earR = ear - e; }
      if (run > 0) { const e = run * (-0.3 + 0.18 * sin(s * 6 * TAU + i)); hp.earL = (hp.earL ?? ear) * (1 - run) + e; hp.earR = (hp.earR ?? ear) * (1 - run) + e; }
      hp.tongue = hourShow && s > RUN0 + 0.5 && s < TOSS0 + 0.6;
      if (fl === 'squirrel' && critter) { const q = Math.abs(critter.x - gx) / 9; if (q < 1) { nod = Math.max(nod, 1.3 * (1 - q * q)); hp.bark = 1 - q; } }
      hp.sniff = sniff; hp.nod = nod;
      hp.blink = !asleep && hash(mk, i, Math.floor(s / 2.3)) % 4 === 0 && frac(s / 2.3) < 0.07;
      hp.sleep = asleep && still > 0.99 && mv === 0 && !(dream > 1 && dream < 2);
      st.head = hp;
      sts.push(st);
    }

    // ---- under the dogs: hole rims and mounds; then bodies; then paws and heads; then hole mouths
    for (const [x, y, r] of holes) holeRim(g, x, y, r);
    for (const [x, y, r] of mounds) mound(g, x, y, r, T);
    for (const st of sts) body(g, st, sun, pals);
    for (const st of sts) overlays(g, st, pals);
    for (const [x, y, r] of holes) holeIn(g, x, y, r);
    for (const c of clods) dirt(g, ...c);
    for (const st of sts) if (st.head.bark) {
      const R = ROUTES[st.d], [x, y] = at(R, R.L), [fx, fy] = dirAt(R, R.L - 6, R.L), X = x + st.bx + fx * 3, Y = y + st.by + fy * 3;
      const r0 = 2 + 3 * (1 - st.head.bark), a0 = Math.atan2(fy, fx);
      for (let k = -1; k <= 1; k++) { const a = a0 + k * 0.6; g.thickLine(X + r0 * cos(a), Y + r0 * sin(a), X + (r0 + 2.5) * cos(a), Y + (r0 + 2.5) * sin(a), 1, 0xfff4d8, { aa: true, a: Math.min(1, st.head.bark * 2) }); }
    }

    // ---- the colon: two tennis balls, rocking on the beat
    for (let j = 0; j < 2; j++) ball(g, COLON[j][0], COLON[j][1], 3.2, 0.5 * sin((s + j * 0.5) * TAU), nt > 0.5);

    // ---- in the air: the butterfly flourish and the hour's ball
    if (fl === 'butterfly' && critter) butterfly(g, critter.x, critter.y, T, 0xffd23a);
    if (ballAt) {
      const r = 3.0 + ballAt.z * 0.05;
      if (ballAt.z > 0.5) g.fillCircle(ballAt.x + ballAt.z * 0.15, ballAt.y + 1, r * 0.9, 0x000000, { aa: true, a: 0.3 });
      ball(g, ballAt.x, ballAt.y - ballAt.z, r, T * 9, nt > 0.5);
    }
    if (nt > 0) fireflies(g, T, nt);
  },
};
