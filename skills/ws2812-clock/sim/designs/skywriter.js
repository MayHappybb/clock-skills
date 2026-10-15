// Skywriter: a vintage biplane, flown by a frog in goggles, writes the time
// in smoke across a sky that follows the real time of day. The numerals are
// a smoke script designed as flight paths (one continuous stroke each); the
// smoke puffs out of the tail, billows, sheds wisps downwind and is
// re-traced by the pilot so it never thins out. At each minute a gust blows
// the old digit away into wisps while the plane banks in and writes the new
// one. At the hour an aerobatic team joins: rose and gold smoke write the
// hour, then the pair draw a heart and the hero shoots an arrow through it.
import * as kit from '../js/kit.js';
import { glyphPath, DS } from './skywriter-script.js';
import * as S from './skywriter-smoke.js';
import * as sky from './skywriter-sky.js';
import * as plane from './skywriter-plane.js';
import { plan, evalSegs, GUST_LEAD, GUST_LIFE } from './skywriter-flight.js';

const img = new Float32Array(3 * 64 * 64);
const SKY_GAIN = 0.42, SMOKE_GAIN = 0.78;
const COL = { rose: kit.hex('#ff4f74'), gold: kit.hex('#ffb428'), white: [1, 1, 1] };
const st = { x: 0, y: 0, dx: 1, dy: 0, loop: 0, seg: null };
const st2 = { x: 0, y: 0, dx: 1, dy: 0, loop: 0, seg: null };

// per-frame smoke tint (the light of the hour) and wind
let tint = [1, 1, 1], WIND = 2;

/** The look of one smoke sample of a digit, by age a (s); gust age g (s, -1 = none). */
function digitPuff(x, y, j, k, a, T, g, c, w0) {
  // puffing out: a small dense ball that swells; then, as it ages, the trail
  // slowly spreads and thins (until the pilot comes back and re-traces it)
  const old = kit.smoothstep(6, 95, a);
  let r = 0.6 + 0.95 * (a / (a + 0.12)) + 0.35 * (a / (a + 2.5)) + 0.4 * old;
  let w = w0 * (1.0 + 0.4 / (1 + a * 2)) * (1 - 0.22 * old);
  // breathing: lumpy puffs that slowly churn, and a gentle sway
  const n1 = kit.noise2(j * 0.42 + k * 17, T * 0.17), n2 = kit.noise2(j * 0.09 + k * 31, T * 0.33 + 5);
  const lump = Math.min(1, a / 1.5);
  r *= 1 + (n1 - 0.5) * 0.6 * lump; w *= 1 + (n1 - 0.5) * 0.5 * lump;
  const amp = 0.7 * (a / (a + 4)) + 0.5 * old;
  x += (n2 - 0.5) * amp * 1.6; y += (kit.noise2(j * 0.09 + k * 31 + 50, T * 0.31) - 0.5) * amp * 1.4;
  if (g >= 0) {
    // the gust: pushed downwind, lifted and torn into wisps, thinning out
    const e = g / GUST_LIFE, hj = kit.noise2(j * 0.3, k * 9 + 3);
    const push = g * g * (6 + 30 * hj) + g * 4;
    x += push;
    y += (kit.noise2(j * 0.11, g * 1.5 + k) - 0.5) * g * 12 - g * 2.5;
    r *= 1 + 1.2 * e;
    w *= (1 - e) ** 1.4 * (0.15 + 1.4 * kit.smoothstep(0.4, 0.68, kit.noise2(j * 0.35, k * 5 + g * 1.2)));
    // a streak: smoke smeared back along the wind
    const tail = Math.min(6, push * 0.5);
    S.puff(x - tail, y, r * 0.8, S.lineWeight(DS, r) * w * 0.55, c[0], c[1], c[2]);
    S.puff(x - tail * 0.5, y, r * 0.9, S.lineWeight(DS, r) * w * 0.55, c[0], c[1], c[2]);
    w *= 0.6;
  }
  S.puff(x, y, r, S.lineWeight(DS, r) * w, c[0], c[1], c[2]);
}

/** Colour of an event's smoke at age a: team colours wash out to the sky's light. */
function smokeCol(ev, a, out) {
  const base = tint;
  if (!ev || !ev.col) { out[0] = base[0]; out[1] = base[1]; out[2] = base[2]; return out; }
  const c = COL[ev.col], f = ev.col === 'white' ? 0 : 1 - kit.smoothstep(25, 55, a);
  for (let i = 0; i < 3; i++) out[i] = base[i] + (c[i] * (0.4 + 0.6 * Math.max(base[0], base[1], base[2])) - base[i]) * f;
  return out;
}
const cA = [0, 0, 0], cB = [0, 0, 0];

/** All the smoke of slot k at time T. */
function slotSmoke(k, T, m, P, Pp, Pn) {
  const d = P.cur[k], G = glyphPath(k, d), n = G.n;
  const changedNow = P.ch.includes(k);
  // events that wrote this digit (this minute, and last minute if it did not change)
  const E = P.events.filter((e) => e.slot === k);
  if (!changedNow) for (const e of Pp.events) if (e.slot === k) E.unshift(e);
  E.sort((a, b) => a.t0 - b.t0);
  const mature = !changedNow && !Pp.ch.includes(k);
  const blowNext = Pn.ch.includes(k) && T >= (m + 1) * 60 - GUST_LEAD;
  const g = blowNext ? T - ((m + 1) * 60 - GUST_LEAD) : -1;
  for (let j = 0; j < n; j++) {
    const x = G.pts[2 * j], y = G.pts[2 * j + 1], sj = j * DS;
    let e1 = -1, a1 = 1e9;
    for (let q = E.length - 1; q >= 0; q--) { const te = E[q].t0 + sj / E[q].v; if (te <= T) { e1 = q; a1 = T - te; break; } }
    if (e1 < 0 && !mature) continue;
    // the layer under a fresh re-trace fades as the new smoke takes over
    if (e1 >= 0 && a1 < 1.4) {
      const e0 = e1 - 1, a0 = e0 >= 0 ? T - (E[e0].t0 + sj / E[e0].v) : 1e9;
      if (e0 >= 0 || mature) digitPuff(x, y, j, k, a0, T, g, smokeCol(e0 >= 0 ? E[e0] : null, a0, cB), 1 - a1 / 1.4);
      digitPuff(x, y, j, k, a1, T, g, smokeCol(E[e1], a1, cA), Math.min(1, a1 / 0.25 + 0.4));
    } else digitPuff(x, y, j, k, a1, T, g, smokeCol(e1 >= 0 ? E[e1] : null, a1, cA), 1);
  }
  // last minute's digit, blowing away
  if (changedNow) {
    const gb = T - (m * 60 - GUST_LEAD);
    if (gb >= 0 && gb < GUST_LIFE) {
      const od = Pp.cur[k], O = glyphPath(k, od);
      for (let j = 0; j < O.n; j++) digitPuff(O.pts[2 * j], O.pts[2 * j + 1], j, k, 1e9, T, gb, smokeCol(null, 1e9, cA), 1);
    }
  }
}

/** Heart and arrow: written, then slowly dissolving downwind over half a minute. */
function figureSmoke(ev, T) {
  const P = ev.P, c = COL[ev.col];
  for (let j = 0; j < P.n; j++) {
    const a = T - (ev.t0 + (j * DS) / ev.v);
    if (a < 0 || a > 40) continue;
    let r = 0.6 + 0.8 * (a / (a + 0.12)) + 1.6 * (a / (a + 12));
    const fade = 1 - kit.smoothstep(10, 38, a);
    const n1 = kit.noise2(j * 0.23 + 300, T * 0.2);
    const x = P.pts[2 * j] + WIND * a * 0.08 + (kit.noise2(j * 0.07, T * 0.25) - 0.5) * a * 0.12;
    const y = P.pts[2 * j + 1] + a * 0.03 + (kit.noise2(j * 0.07 + 9, T * 0.25) - 0.5) * a * 0.1;
    r *= 0.85 + 0.3 * n1;
    const col = ev.col === 'white' ? tint : c, w = fade * (0.8 + 0.4 * n1);
    S.puff(x, y, r, S.lineWeight(DS, r) * w, col[0], col[1], col[2]);
  }
}

/** Wisps that peel off the writing and drift downwind: the smoke is always alive. */
function wisps(T, m, P) {
  if (T - m * 60 < 4 || T - m * 60 > 59) return;
  const B = 0.45;
  for (let i = 0; i < 9; i++) {
    const b = Math.floor(T / B) - i, tb = (b + kit.hash(b, 3)) * B, a = T - tb;
    if (a < 0 || a > 4 || tb < m * 60 + 3.5) continue;
    const k = Math.floor(kit.hash(b, 4) * 4), G = glyphPath(k, P.cur[k]), j = Math.floor(kit.hash(b, 5) * G.n);
    const x = G.pts[2 * j] + WIND * (a * 1.6 + a * a * 0.35) + (kit.noise2(b, a * 0.8) - 0.5) * a * 1.5;
    const y = G.pts[2 * j + 1] - a * 0.6 + (kit.noise2(b + 50, a * 0.8) - 0.5) * a * 1.5;
    const r = 0.9 + a * 0.45, w = 0.42 * Math.sin((Math.PI * a) / 4) ** 0.7;
    S.puff(x, y, r, w, tint[0], tint[1], tint[2]);
  }
}

/** Draw a flying plane from a segment list at T, with banking and real rolls. */
function drawPlane(segs, team, T, light, nav, inSegs) {
  evalSegs(segs, T, st);
  // heading: the path's angle averaged over 0.3 s, so stall turns pivot instead of flipping
  {
    // unwrap outward from now, sample to sample (exact within a segment, so stall turns keep their sense)
    let sum = 0;
    for (const dir of [-1, 1]) {
      let pa = st.ang, ps = st.seg, acc = 0;
      for (let q = 1; q <= 3; q++) {
        const tq = T + dir * q * 0.05;
        evalSegs(inSegs(tq), tq, st2);
        let d = st2.ang - pa;
        if (st2.seg !== ps) d = Math.atan2(Math.sin(d), Math.cos(d));
        acc += d; sum += acc; pa = st2.ang; ps = st2.seg;
      }
    }
    const a = st.ang + sum / 7;
    st.dx = Math.cos(a); st.dy = Math.sin(a);
  }
  // roll: upright when flying right, inverted-then-rolled when flying left; in loops, hold
  let num = 0, den = 0;
  for (let q = -3; q <= 3; q++) {
    const tq = T + q * 0.07, sg = inSegs(tq);
    evalSegs(sg, tq, st2);
    const wq = st2.loop ? 1 : Math.abs(st2.dx) + 0.06, sgn = st2.loop || (st2.dx >= 0 ? 1 : -1);
    num += sgn * wq; den += wq;
  }
  let rho = num / den;
  // bank in turns: the wings show a little planform
  evalSegs(segs, T + 0.06, st2);
  const turn = Math.abs(Math.cos(st2.ang) * st.dy - Math.sin(st2.ang) * st.dx) / 0.06;
  rho *= 1 - Math.min(0.06, turn * 0.02);
  // perspective: up at writing height the plane is far and small; swooping low it comes close
  const sc = 1.22 + 0.45 * kit.smoothstep(32, 50, st.y);
  plane.draw(img, st.x, st.y, st.dx, st.dy, rho, team, light, nav, T, 1, sc);
}

const heroSegs = (t) => plan(Math.floor(t / 60)).hero;

export default {
  name: 'Skywriter',
  blurb: 'a frog in a biplane writes the time in smoke script across the real sky of the day; gusts blow each old digit away as it re-writes it, and at the hour an aerobatic team writes the hour and a heart',
  layouts: ['hub'], look: 'smoke', fps: 60, brightness: 0.35, dither: true,
  frame(ctx) {
    const ms = ctx.date.getTime(), T = ms / 1000, m = Math.floor(T / 60);
    const d = ctx.date, h = d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600 + d.getMilliseconds() / 3.6e6;
    const P = plan(m), Pp = plan(m - 1), Pn = plan(m + 1);
    WIND = 1.6 + 0.8 * kit.noise2(T * 0.03, 1);
    // gust envelope round each minute turn (the windsock fills)
    const tm = T - m * 60, gt = tm > 30 ? tm - 60 : tm;
    const gust = Math.exp(-(((gt - 0.1) / 0.9) ** 2));
    sky.paint(img, T, h, WIND, gust, SKY_GAIN);
    const pal = sky.pal;
    tint = [pal.smoke[0] * SMOKE_GAIN, pal.smoke[1] * SMOKE_GAIN, pal.smoke[2] * SMOKE_GAIN];
    // smoke
    S.clear();
    for (let k = 0; k < 4; k++) slotSmoke(k, T, m, P, Pp, Pn);
    for (const Q of [Pp, P]) for (const f of Q.figures) figureSmoke(f, T);
    wisps(T, m, P);
    // the colon: two dropped puffs that breathe
    for (let c = 0; c < 2; c++) {
      const br = 1 + 0.12 * Math.sin(T * 1.3 + c * 2);
      S.puff(31.6 - c * 1.1 + 0.3 * Math.sin(T * 0.7 + c), 19.5 + c * 8.5, 1.7 * br, 0.9, tint[0], tint[1], tint[2]);
    }
    S.composite(img, 1, tint);
    sky.birds(img, T);
    sky.land(img, T, WIND, gust, SKY_GAIN, ctx.night);
    // the planes
    const light = 0.3 + 0.55 * pal.day, nav = 1 - pal.day * 0.85;
    for (const Q of [P, Pn]) for (const tm2 of Q.team) if (T >= tm2.t0 && T <= tm2.t1) drawPlane(tm2.segs, tm2.name, T, light, nav, () => tm2.segs);
    drawPlane(P.hero, 'hero', T, light, nav, heroSegs);
    const dim = 1 - 0.55 * ctx.night;
    kit.blitGrid(ctx, img, dim);
  },
};
