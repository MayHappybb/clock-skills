// Artillery: a turn-based worm war on four islands, and the islands are the time.
//
// Each numeral is a landform of its own (artillery-terrain.js): grass on
// every upward face, strata of soil, clay and rock, pebbles, the odd bone,
// a dark keyline, a foot flaring under the sea. Red worms in helmets hold
// the two hour islands, blue worms the minute islands; a buoy with a
// windsock bobs in the strait between them.
//
// Always alive: waves roll, clouds drift with the wind, the windsock swings
// with it (the same wind bends every shot), the worms crawl about their
// hilltops, blink, look about, turn to face each other, taunt; once a
// minute one takes a jetpack hop, and a health crate parachutes onto an
// island for its worm to crawl over and open.
//
// Minute turn: a turn arrow bounces over the red worm on the right-hand
// hour island; it crawls to the edge, shoulders a bazooka, the crosshair
// swings onto the doomed minute island, the power charges, and the rocket
// arcs over the strait, bent by the wind. The glass shakes; it blasts a burnt crater out of
// the island and the blue worm on it into the sky, and the wrecked island
// tilts and sinks, gone before :00. After :00 the new island is airdropped
// on two blue parachutes, plops into the sea and settles; then its worm
// parachutes back down onto it.
//
// Hour: a bomber crosses the sky and carpet-bombs every island that
// changes, hours included, left to right; they all sink, and the new ones
// all come down together on parachutes, readable from the first half
// second.
//
// Never a wrong digit: craters land where the wreck cannot read as another
// numeral (artillery-plan.js HIT), every old island is under before :00 and
// no new one appears before it.
//
// Palette: warm earth (ochre, terracotta, umber, a yellow-green turf) against
// a cool sky and sea: the complement keeps the numerals off the ground. Team
// red and blue, pink worms with near-black outlines. The day runs from a
// blue noon through an orange dusk to an indigo night with a moon; at night
// the terrain is moonlit and kept well above the sky's level, the grass rims
// stay bright, so the time reads when the backlight dims.
//
// Hard pixels for the terrain (it is painted ground, and it holds still);
// anti-aliasing for everything that moves. Islands that fly or sink are
// drawn with blended rows so they glide by fractions of a pixel.

import { clamp, progress, ease, lerp, sin, cos, rand, noise, mix } from '../js/kit.js';
import { buildDigit, FOOT } from './artillery-terrain.js';
import { blitTerrain, sea } from './artillery-blit.js';
import { SEA, SLOTS, planFor, wind, windDisp, GRAV, BOMB_G, PLANE_V, PLANE_Y, GONE } from './artillery-plan.js';
import { dayAt, lighting, background, stars, clouds } from './artillery-world.js';
import { drawWorm, drawChute, drawRocket, drawBomb, drawPlane, drawBuoy, drawBoom, TEAM } from './artillery-actors.js';

// ------------------------------------------------------------ start-up tables
const SPR = SLOTS.map((S, i) => Array.from({ length: 10 }, (_, d) => buildDigit(d, S.w, S.h, S.s, S.top, 11 + i * 13)));

/** Ground height (glyph rows) under glyph-local x on a sprite. */
function topAt(spr, lx) {
  const i = clamp(lx | 0, 0, spr.w - 1), j = clamp(i + 1, 0, spr.w - 1), f = lx - (lx | 0);
  return spr.top[i] * (1 - f) + spr.top[j] * f;
}
/** The stretch of hilltop a worm wanders on, glyph-local [a, b]: the level part of the island's top ledge. */
const PERCH = SPR.map((row) => row.map((spr) => {
  const L = spr.ledges[0];
  let lo = 999;
  for (let k = 0; k < L.y.length; k++) lo = Math.min(lo, L.y[k]);
  let a = L.b, b = L.a;
  for (let k = 0; k < L.y.length; k++) if (L.y[k] <= lo + 3) { a = Math.min(a, L.a + k); b = Math.max(b, L.a + k); }
  a += 3; b -= 3;
  return a <= b ? [a, b] : [(a + b) / 2, (a + b) / 2];
}));
function perch(i, d) { return PERCH[i][d]; }
function perchOf(i, d, right) {
  const [a, b] = perch(i, d), lx = right ? b : (a + b) / 2;
  return [SLOTS[i].x + lx, SLOTS[i].top + topAt(SPR[i][d], lx)];
}

const groundOf = (i, d, gx) => topAt(SPR[i][d], gx);

let LT = { key: -1 };
function lightFor(key, hour) {
  if (LT.key !== key) { const day = dayAt(hour); LT = { key, day, ...lighting(day) }; }
  return LT;
}

const CR = new Float32Array(3 * 8);
const SURF = new Float32Array(160);
const FALL = 4;                         // the new island starts with its glyph bottom this far above the glass

/** Where an arriving island is (y offset from rest) at second s, and whether its chutes are on. */
function arrivalAt(i, dr, s) {
  const S = SLOTS[i], start = -(S.top + S.h + FALL), u = (s - dr.D) / dr.dur;
  if (u < 1) return start * (1 - ease.outCubic(clamp(u, 0, 1)));
  const tau = s - dr.D - dr.dur;
  return 1.3 * sin(tau * 7) * Math.exp(-tau * 3.2);
}
/** When an arriving island's foot meets the sea. */
function splashAt(i, dr) {
  const S = SLOTS[i], start = S.top + S.h + FALL;
  return dr.D + dr.dur * (1 - Math.cbrt(2 / start));
}

function drawIsland(g, i, s, P, lt, T) {
  const S = SLOTS[i], d = +P.cur[i], spr = SPR[i][d];
  const dr = P.drop[i];
  if (dr && s < dr.D + dr.dur + 1.5) {
    if (s < dr.D) return;
    const yo = arrivalAt(i, dr, s), tau = s - dr.D - dr.dur;
    blitTerrain(g, spr, S.x, S.top + yo, 0, S.w / 2, S.h, lt.PAL, lt.SCORCH, CR, 0);
    // the chutes: on while it falls, then let go and carried off on the wind
    if (tau < 1.1) {
      const a = tau < 0 ? 1 : 1 - tau / 1.1, up = tau < 0 ? 0 : 14 * tau * tau, wx = tau < 0 ? 0 : 9 * tau * Math.sign(wind(T) || 1);
      for (const side of [-1, 1]) {
        const cx = S.x + S.w / 2 + side * S.w * 0.3 + 1.2 * sin(T * 2.1 + i + side) + wx, cy = S.top + yo - 13 - up;
        const ax = S.x + S.w / 2 + side * S.w * 0.38, ay = S.top + yo + 3;
        if (tau < 0) drawChute(g, cx, cy, 14, S.team, ax - 1.5, ay, ax + 1.5, ay, lt.L, 1);
        else drawChute(g, cx, cy, 14 - 3 * tau, S.team, cx - 2, cy + 7, cx + 2, cy + 7, lt.L, a);
      }
    }
    return;
  }
  // craters opened so far on this island
  let nc = 0;
  for (const m of P.impacts) if (m.i === i && s >= m.t && nc < 8) { CR[nc * 3] = m.gx; CR[nc * 3 + 1] = m.gy; CR[nc * 3 + 2] = m.r; nc++; }
  const sk = P.sink[i];
  if (sk && s >= sk.t0) {
    const u = progress(s, sk.t0, GONE), depth = S.h + 14;
    const yo = depth * (0.07 * ease.outQuad(Math.min(1, u * 6)) + 0.93 * u * u * u * u);
    const ang = sk.tilt * ease.outQuad(Math.min(1, u * 1.6));
    if (u < 1) blitTerrain(g, spr, S.x, S.top + yo, ang, S.w / 2, S.h, lt.PAL, lt.SCORCH, CR, nc, SEA + 14);
    return;
  }
  blitTerrain(g, spr, S.x, S.top, 0, S.w / 2, S.h, lt.PAL, lt.SCORCH, CR, nc);
}
// ------------------------------------------------------------ the crate
/** Where the crate lands on its island (glyph x): the end of the hilltop away from the worm. */
function crateSlot(P) {
  for (let k = 0; k < 4; k++) { const i = (P.crate.i + k) % 4, [a, b] = perch(i, +P.cur[i]); if (b - a >= 8) return i; }
  return -1;
}
function crateX(P, d) {
  const c = P.crate, ci = crateSlot(P), [a, b] = perch(ci, d), wl = wander(ci, d, P.Tm + c.land);
  return wl - a > b - wl ? a - 1 : b + 1;
}
function drawCrate(g, s, T, P, lt) {
  const c = P.crate, ci = crateSlot(P);
  if (ci < 0 || s < c.t0 || s > c.open + 0.9) return;
  const S = SLOTS[ci], d = +P.cur[ci];
  const lx = crateX(P, d), gx = S.x + lx, gy = S.top + topAt(SPR[ci][d], lx);
  const u = progress(s, c.t0, c.land), sw = 1.5 * sin(T * 2.2) * (1 - u);
  const x = gx + sw, y = lerp(-6, gy, u);
  const L = lt.L;
  if (s < c.land + 0.5) {
    const k = progress(s, c.land, c.land + 0.5);
    drawChute(g, x, y - 13 + 8 * k, 11 - 4 * k, 0, x - 2.5, y - 6, x + 2.5, y - 6, L, 1 - k);
  }
  if (s < c.open) {
    g.fillRect(Math.round(x - 4), Math.round(y - 7), 8, 7, L(0x5a4a3a));
    g.fillRect(Math.round(x - 3), Math.round(y - 6), 6, 5, L(0xf2eee2));
    g.fillRect(Math.round(x - 1), Math.round(y - 6), 2, 5, L(0xd8302a));
    g.fillRect(Math.round(x - 3), Math.round(y - 4.5), 6, 2, L(0xd8302a));
  } else {
    // opened: a ring of light and little crosses floating up
    const a = s - c.open;
    g.ring(x, y - 4, 2 + a * 14, 3 + a * 14, 0xfff4c0, { aa: true, a: Math.max(0, 0.8 - a) });
    for (let k = 0; k < 4; k++) {
      const px = x + (k - 1.5) * 4 + 1.5 * sin(T * 4 + k), py = y - 5 - a * 16 - k * 1.5;
      g.fillRect(Math.round(px - 1.5), Math.round(py - 0.5), 3, 1, 0x7cf05a, { a: 1 - a / 0.9 });
      g.fillRect(Math.round(px - 0.5), Math.round(py - 1.5), 1, 3, 0x7cf05a, { a: 1 - a / 0.9 });
    }
  }
}

// ------------------------------------------------------------ the worms
const BIAS = [1, 1, -1, -1];            // each team faces the other across the strait
function wander(w, d, T) {
  const [a, b] = perch(w, d);
  return (a + b) / 2 + ((b - a) / 2) * (2 * noise(T * 0.05 + w * 17, 3) - 1);
}
const POSE = { dir: 1, team: 0, ang: 0, open: 1, lx: 0, ly: 0, breath: 0, mouth: 0, aim: null, jet: 0, L: null, t: 0 };

function drawWorms(g, s, T, P, lt, look) {
  for (let w = 0; w < 4; w++) {
    const S = SLOTS[w], d = +P.cur[w], spr = SPR[w][d];
    let lx = wander(w, d, T);
    const v = (wander(w, d, T + 0.4) - wander(w, d, T - 0.4)) / 0.8;
    let dir = clamp(v * 5 + BIAS[w] * 0.55, -1, 1), lift = 0, ang = 0, mouth = 0, aim = null, jet = 0, chute = 0;
    // the shooter: to the edge, bazooka out, aim, fire, recoil, back
    const tr = P.turn;
    if (w === 1 && tr) {
      const b = perch(1, d)[1];
      const k = ease.inOutQuad(progress(s, tr.t0, tr.t0 + 0.9)) * (1 - ease.inOutQuad(progress(s, tr.end + 1.4, tr.end + 2.4)));
      lx = lerp(lx, b, k); dir = lerp(dir, 1, k);
      if (s >= tr.t0 + 0.9 && s < tr.end) {
        aim = -0.3; dir = 1;
        for (let q = 0; q < P.shots.length; q++) {
          const sh = P.shots[q], prev = q ? P.shots[q - 1].aim : -0.3;
          if (s >= sh.t0 - 1.4) aim = lerp(prev, sh.aim, ease.inOutQuad(progress(s, sh.t0 - 1.4, sh.t0 - 0.7)));
          if (s > sh.t0) ang = -0.22 * Math.exp(-(s - sh.t0) * 7);
        }
      }
    }
    // the crate: crawl over to it, open it, hop for joy, wander off again
    const cr = P.crate;
    if (s > cr.land && s < cr.open + 3 && w === crateSlot(P)) {
      const cx = crateX(P, d), side = Math.sign(lx - cx) || 1, target = cx + side * 6;
      const k = ease.inOutQuad(progress(s, cr.land, cr.open - 0.2)) * (1 - ease.inOutQuad(progress(s, cr.open + 0.8, cr.open + 3)));
      const back = s > cr.open + 0.8;
      lx = lerp(lx, target, k);
      if (k > 0.02 && k < 0.98) dir = lerp(dir, back ? side : -side, Math.min(1, k * 4, (1 - k) * 4));
      else if (k >= 0.98) dir = -side;
      if (s > cr.open && s < cr.open + 0.8) { lift += 3 * Math.abs(sin(Math.PI * (s - cr.open) / 0.4)); mouth = 1; }
    }
    let x = S.x + lx, y = S.top + topAt(spr, lx);
    // back from the sky on a parachute, after its island has landed
    const dr = P.drop[w];
    if (dr) {
      const t0 = dr.D + dr.dur * 0.55 + 0.3 * (w & 1), t1 = t0 + 2.4;
      if (s < t0) continue;
      if (s < t1) {
        const u = (s - t0) / (t1 - t0), sw = sin(T * 2.4 + w);
        x += (1 - u) * (-12 * BIAS[w] + 2 * sw); y = lerp(-17, y, u); ang = 0.12 * sw * (1 - u); chute = 1;
      } else if (s < t1 + 0.5) chute = -(s - t1) / 0.5;
    }
    // blown off by the hit on its island
    const sk = P.sink[w];
    let open = 1;
    if (sk && s >= sk.t0 - 0.06) {
      const ti = sk.t0 - 0.06, tau = s - ti, l0 = wander(w, d, P.Tm + ti);
      const vx = (w < 2 ? -1 : 1) * (52 + 14 * rand(w, P.Tm)), spin = w & 1 ? 1 : -1;
      x = S.x + l0 + vx * tau; y = S.top + topAt(spr, l0) - 120 * tau + 90 * tau * tau;
      ang = spin * tau * 9; mouth = 1; open = 1.15;
      if (x < -14 || x > 174 || tau > 2.4) continue;
    }
    // a jetpack hop and a taunt
    const jt = P.jet;
    if (jt.w === w && s > jt.t0 && s < jt.t0 + 4) {
      const tau = s - jt.t0;
      lift = 13 * (ease.inOutQuad(progress(tau, 0, 0.8)) - ease.inOutQuad(progress(tau, 3, 4)));
      x += jt.dx * sin(Math.PI * tau / 4); jet = lift > 0.4 ? (tau < 3 ? 1 : 0.6) : 0; ang += 0.07 * sin(T * 5) * lift / 13;
    }
    const tn = P.taunt;
    if (tn.w === w && s > tn.t0 && s < tn.t0 + 1.2) { lift += 3.5 * Math.abs(sin(Math.PI * (s - tn.t0) / 0.6)); mouth = 1; dir = BIAS[w]; }
    // blinking, gaze, breathing
    const tb = T + w * 1.1, slot = Math.floor(tb / 2.9), bt = tb - slot * 2.9 - rand(slot, w) * 2.4;
    if (bt > 0 && bt < 0.14 && open === 1) open = 0;
    let gx = clamp(BIAS[w] * 0.5 + (noise(T * 0.3 + w * 5, 11) - 0.5) * 1.8, -1, 1), gy = (noise(T * 0.25 + w * 7, 12) - 0.5) * 1.2;
    if (look) { gx = clamp((look[0] - x) / 18, -1, 1); gy = clamp((look[1] - y + 10) / 18, -1, 1); if (sk && look[2] === w) mouth = Math.max(mouth, 0.7); }
    const p = POSE;
    p.dir = dir; p.team = S.team; p.ang = ang; p.open = open; p.lx = gx; p.ly = gy; p.mouth = mouth; p.aim = aim; p.jet = jet; p.L = lt.L; p.t = T;
    p.breath = 0.035 * sin(T * 2.7 + w * 1.3) + Math.min(0.05, Math.abs(v) * 0.02) * sin(T * 11);
    if (chute) {
      const k = chute > 0 ? 0 : -chute, cy = y - lift - 23 + 9 * k;
      drawChute(g, x + 0.8 * sin(T * 2.4 + w + 0.5), cy, 12 - 4 * k, S.team, x - 2, y - lift - 9, x + 2, y - lift - 9, lt.L, 1 - k);
    }
    drawWorm(g, x, y - lift, p);
  }
}
// ------------------------------------------------------------ shots, bombs, blasts
function rocketAt(sh, tau) {
  return [sh.x0 + sh.vx * tau + 0.5 * sh.aw * tau * tau, sh.y0 + sh.vy * tau + 0.5 * GRAV * tau * tau, sh.vx + sh.aw * tau, sh.vy + GRAV * tau];
}

function drawShots(g, s, T, P, lt) {
  for (const sh of P.shots) {
    if (s < sh.t0 || s > sh.t1 + 0.3) continue;
    const tau = Math.min(s, sh.t1) - sh.t0;
    // the smoke trail, thinning behind
    for (let j = 1; j <= 9; j++) {
      const tj = tau - j * 0.055 - (s - Math.min(s, sh.t1));
      if (tj < 0) break;
      const [px, py] = rocketAt(sh, tj);
      g.fillCircle(px, py - j * 0.15, 0.7 + j * 0.16, mix(lt.smoke, 0xffffff, 0.45), { aa: true, a: 0.5 * (1 - j / 10) });
    }
    if (s < sh.t1) { const [x, y, vx, vy] = rocketAt(sh, tau); drawRocket(g, x, y, vx, vy, T, lt.L); }
    if (s - sh.t0 < 0.12) g.fillCircle(sh.x0, sh.y0, 2.8 * (1 - (s - sh.t0) / 0.12), 0xffe27a, { aa: true, a: 0.9 });
  }
  const pl = P.plane;
  if (pl) {
    const px = -30 + PLANE_V * (s - pl.t0);
    if (px > -2 && px < 200) drawPlane(g, px, PLANE_Y + 0.8 * sin(T * 3), T, lt.L);
    for (const b of pl.bombs) {
      if (s < b.tr || s >= b.t1) continue;
      const tau = s - b.tr, vx = PLANE_V * 0.5, vy = BOMB_G * tau;
      drawBomb(g, b.xr + vx * tau, PLANE_Y + 2 + 0.5 * BOMB_G * tau * tau, Math.atan2(vy, vx), lt.L);
    }
  }
}

function drawBooms(g, s, T, P, lt) {
  const wd = wind(T);
  for (const m of P.impacts) if (s >= m.t && s < m.t + 2.6) drawBoom(g, m.x, m.y, s - m.t, m.k, m.seed, wd, lt.debris, lt.L, lt.smoke);
}

/** What the worms are watching: the rocket in flight, the bomber, or a blast. */
function lookAt(s, P) {
  for (const sh of P.shots) if (s >= sh.t0 && s < sh.t1) { const r = rocketAt(sh, s - sh.t0); return [r[0], r[1], sh.i]; }
  for (const m of P.impacts) if (s >= m.t && s < m.t + 1.2) return [m.x, m.y, -1];
  if (P.plane) { const px = -40 + PLANE_V * (s - P.plane.t0); if (px > -20 && px < 180) return [px, PLANE_Y, -1]; }
  return null;
}

/** The turn arrow, crosshair and power gauge over the shooter. */
function drawUI(g, s, T, P, lt) {
  const tr = P.turn;
  if (!tr) return;
  const sh0 = P.shots[0], [sx, sy] = [tr.x, tr.y];
  if (s > tr.t0 - 0.3 && s < tr.t0 + 2.6) {
    const a = progress(s, tr.t0 - 0.3, tr.t0) * (1 - progress(s, tr.t0 + 2.2, tr.t0 + 2.6));
    const ax = SLOTS[1].x + wander(1, +P.cur[1], T), ay = sy - 18 - 2.5 * Math.abs(sin(T * 6.5));
    const ax2 = lerp(ax, sx, progress(s, tr.t0, tr.t0 + 0.9));
    g.fillPolygon([[ax2 - 3.6, ay - 4.4], [ax2 + 3.6, ay - 4.4], [ax2, ay + 0.6]], 0xffffff, { aa: true, a });
    g.fillPolygon([[ax2 - 2.2, ay - 3.6], [ax2 + 2.2, ay - 3.6], [ax2, ay - 0.6]], TEAM[0], { aa: true, a });
  }
  for (const sh of P.shots) {
    if (s < sh.t0 - 1.4 || s > sh.t0 + 0.1) continue;
    const ca = Math.cos(sh.aim), sa = Math.sin(sh.aim), u = ease.inOutQuad(progress(s, sh.t0 - 1.4, sh.t0 - 0.7));
    const prev = sh === sh0 ? -0.3 : P.shots[P.shots.indexOf(sh) - 1].aim, am = lerp(prev, sh.aim, u);
    const cx = sh.x0 + 13 * Math.cos(am), cy = sh.y0 + 13 * Math.sin(am);
    g.ring(cx, cy, 1.6, 2.6, 0xff3a2a, { aa: true });
    g.fillCircle(cx, cy, 0.6, 0xffffff, { aa: true });
    const pw = progress(s, sh.t0 - 0.6, sh.t0);
    for (let k = 0; k < 6 && k < pw * 6; k++) {
      const r = 2.5 + k * 1.7;
      g.fillCircle(sh.x0 + r * ca, sh.y0 + r * sa, 0.6 + k * 0.22, mix(0xfff04a, 0xff2a1a, k / 5), { aa: true, a: 0.9 });
    }
  }
}
// ------------------------------------------------------------ the sea's side of it
function drawSplashes(g, s, T, P, lt) {
  const foam = mix(lt.L(0xffffff), 0xc8e4ff, 0.3);
  for (let i = 0; i < 4; i++) {
    const S = SLOTS[i], dr = P.drop[i];
    if (dr) {
      const tau = s - splashAt(i, dr);
      if (tau > 0 && tau < 1.3) {
        g.fillEllipse(S.x + S.w / 2, SEA - 0.5, S.w * 0.55 + 14 * tau, 1.6, foam, { aa: true, a: 0.8 * (1 - tau / 1.3) });
        for (let k = 0; k < 12; k++) {
          const side = k & 1 ? 1 : -1, x0 = S.x + S.w / 2 + side * S.w * (0.25 + 0.2 * rand(i, k, 1));
          const vx = side * (10 + 22 * rand(i, k, 2)), vy = -(30 + 40 * rand(i, k, 3));
          const y = SEA - 1 + vy * tau + 110 * tau * tau;
          if (y < SEA) g.fillCircle(x0 + vx * tau, y, 0.8 + 0.4 * (k % 3 === 0), foam, { aa: true, a: 0.9 });
        }
      }
    }
    const sk = P.sink[i];
    if (sk && s > sk.t0) {
      // bubbles where it goes down
      for (let k = 0; k < 7; k++) {
        const ph = ((s - sk.t0) * 1.6 + rand(i, k, 7)) % 1, x = S.x + 3 + rand(i, k, 8) * (S.w - 6) + 1.5 * sin(T * 3 + k);
        g.ring(x, SEA + 1 - ph * 2, 0.4 + ph * 1.1, 0.9 + ph * 1.3, foam, { aa: true, a: 0.7 * (1 - ph) });
      }
    }
  }
}

export default {
  name: 'Artillery',
  blurb: 'Worms at war on four islands that are the time: a bazooka sinks the old minute, the new one is airdropped.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec;
    ctx.lcd.backlight(1 - 0.7 * ctx.night);
    const lt = lightFor(f.minuteKey, f.h + f.m / 60), day = lt.day;
    const P = planFor(ctx.date, f, perchOf, groundOf);
    const T = P.Tm + s, wd = wind(T);

    g.draw(background(f.minuteKey, day), 0, 0);
    stars(g, day, T);
    clouds(g, day, windDisp(T) * 7);
    for (let i = 0; i < 4; i++) drawIsland(g, i, s, P, lt, T);
    drawBuoy(g, 80.5, SEA - 0.6 + 0.7 * sin(T * 1.9), wd, T, s, lt.L);
    drawCrate(g, s, T, P, lt);
    drawWorms(g, s, T, P, lt, lookAt(s, P));
    drawShots(g, s, T, P, lt);
    drawBooms(g, s, T, P, lt);
    for (let x = 0; x < 160; x++) SURF[x] = SEA - 1.2 + 0.8 * sin(x * 0.21 - T * 2.3) + 0.45 * sin(x * 0.083 + T * 1.15 + 1);
    sea(g, SURF, lt.tint, lt.alpha, lt.foam, lt.band, T);
    drawSplashes(g, s, T, P, lt);
    // the glass shakes at each blast
    let amp = 0, age = 0;
    for (const m of P.impacts) { const a = s - m.t; if (a >= 0 && a < 0.3 && m.k * 1.15 * (1 - a / 0.3) > amp) { amp = m.k * 1.15 * (1 - a / 0.3); age = a; } }
    if (amp > 0.5) g.shift(Math.round(amp * sin(age * 90)), Math.round(amp * cos(age * 71)), day.top);
    drawUI(g, s, T, P, lt);
  },
};
