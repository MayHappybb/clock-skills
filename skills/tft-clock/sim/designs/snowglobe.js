// snowglobe: "Index of Refraction".
//
// Two snow globes on a deep window sill, a small one behind for the hour and
// a big one in front for the minutes. Each holds two numerals of clear glass
// whose refractive index matches the water, so they cannot be seen: the time
// is only where the snow has settled. Packed on the glass, the snow draws the
// numerals; on bare glass there is just a faint shimmer of an edge.
//
// The minute: at :57 an unseen hand lifts the front globe and turns it over.
// The snow slides off the numerals and pours into the dome, the hand gives it
// a shake upside down, and at :00 rights it and sets it down. The water,
// dragged round by the turn, swirls clockwise; the snow comes down out of the
// dome in a blizzard, circles, slows, and sinks, and where it sticks the new
// minutes appear, flake by flake, readable a few seconds in. The rest keeps
// drifting down for most of the minute. On the hour both globes are turned.
//
// The glass is a lens: inside each globe the room behind (the window, the
// roofs outside, the sill) shows small and upside down, darkening to the rim,
// with the window's reflection fixed on the glass while the globe turns
// under it, and an air bubble that stays at the top whichever way up it is.
// The light follows the day: blue noon, a gold afternoon, dusk, and at night
// the globes' bases light up from inside, warm, and the room goes blue.
//
// Palette: the room's light at the hour (cool day, gold dusk, navy night with
// warm night lights), white snow tinted by it, two lacquered plinths, oxblood
// with gold and bottle green with silver. Hard pixels for the snow (each
// flake a pixel, each settled clump a few), anti-aliased only for what turns.
//
// Rhythm: nothing on the second. One big physical event a minute, then
// settling; glitter in the snow twinkles now and then.

import { Gfx, sin, cos, clamp, lerp, progress, ease, rand, rng, mix, clockFields, previousMinute, TAU } from '../js/kit.js';
import { buildDigits, T_SHADE, T_BODY, T_LIT, T_CAP, T_GLINT } from './snowglobe-glyphs.js';
import { W, H, KEY, GLOBES, paletteAt, drawRoom, drawLens, drawOutsideSnow } from './snowglobe-room.js';

const PI = Math.PI;

// ------------------------------------------------------------------ the turn, in seconds from the boundary
const LIFT0 = -3.0, ROT0 = -2.75, ROT1 = -1.95, BACK0 = -0.8, BACK1 = 0, DOWN1 = 0.3;
const LIFT = 4;

/** How far the globe has turned (clockwise on screen), e seconds from its boundary. */
function thetaAt(e) {
  if (e < ROT0) return 0;
  if (e < ROT1) return PI * ease.inOutCubic(progress(e, ROT0, ROT1));
  if (e < BACK0) return PI + 0.16 * Math.sin(TAU * 2.6 * (e - ROT1)) * Math.sin(PI * progress(e, ROT1, BACK0));
  if (e < BACK1) return PI + PI * ease.inOutCubic(progress(e, BACK0, BACK1));
  return 0;
}
/** The lift (negative = up) and the shake while it is held upside down. */
function liftAt(e) {
  if (e < LIFT0 || e >= DOWN1) return 0;
  if (e < ROT0) return -LIFT * ease.outQuad(progress(e, LIFT0, ROT0));
  if (e < BACK1) return -LIFT;
  return -LIFT * (1 - ease.inQuad(progress(e, BACK1, DOWN1)));
}
function shakeAt(e) {
  if (e < ROT1 || e >= BACK0) return 0;
  return 2.6 * Math.sin(TAU * 2.6 * (e - ROT1)) * Math.sin(PI * progress(e, ROT1, BACK0));
}

// ------------------------------------------------------------------ per globe: numerals, mound, flakes

const SETS = GLOBES.map((G, gi) => {
  const digits = buildDigits(G.dw, G.dh, G.wt, 5 + gi * 13);
  const maxClumps = Math.max(...digits.map((d) => d.clumps.length));
  const loose = gi === 0 ? 26 : 40;
  const N = 2 * maxClumps + loose;
  const r = G.r;
  const hw0 = Math.sqrt(r * r - G.floor * G.floor);
  const moundTop = (x) => G.floor - 2.6 * Math.abs(x / hw0) ** 3 + 0.5 * Math.sin(x * 0.45 + gi);
  // the mound as a polygon in local coordinates: its top, then back along the glass
  const pts = [];
  const x0 = -hw0 + 0.6, x1 = hw0 - 0.6;
  for (let x = x0; x <= x1 + 0.01; x += 2.5) pts.push([x, moundTop(x)]);
  const a0 = Math.atan2(x1, -moundTop(x1)), a1 = TAU + Math.atan2(x0, -moundTop(x0));
  for (let k = 1; k < 12; k++) { const a = a0 + ((a1 - a0) * k) / 12; pts.push([(r - 0.3) * Math.sin(a), -(r - 0.3) * Math.cos(a)]); }
  const ridge = pts.slice(0, Math.ceil((x1 - x0) / 2.5) + 1);
  // numerals: top-left corners, local
  const left = -Math.round(G.gap / 2) - G.dw, right = left + G.dw + G.gap, top = G.floor - G.dh;

  // fixed flight plan of each flake through the turn
  const f = { N, dx: new Float32Array(N), dy: new Float32Array(N), t1: new Float32Array(N), tDome: new Float32Array(N), t2: new Float32Array(N),
    c1: new Float32Array(N), s1: new Float32Array(N), l1: new Float32Array(N), p2x: new Float32Array(N), p2y: new Float32Array(N),
    rs: new Float32Array(N), ps: new Float32Array(N), near: new Uint8Array(N), glint: new Uint8Array(N), turn: new Uint8Array(N),
    sw: new Float32Array(N), sph: new Float32Array(N), sa: new Float32Array(N) };
  const R = rng(900 + gi);
  for (let i = 0; i < N; i++) {
    const psi = (R() * 2 - 1) * 1.1, dr = 1.6 + 3.6 * R() * R();
    f.dx[i] = (r - dr) * Math.sin(psi); f.dy[i] = -(r - dr) * Math.cos(psi);
    f.t1[i] = -2.74 + 0.34 * R();
    f.tDome[i] = Math.max(f.t1[i] + 0.55, -1.85) + 0.75 * R();
    f.t2[i] = -0.36 + 0.5 * R();
    const th1 = thetaAt(f.t1[i]);
    f.c1[i] = Math.cos(th1); f.s1[i] = Math.sin(th1); f.l1[i] = liftAt(f.t1[i]);
    const thd = thetaAt(f.tDome[i]), cd = Math.cos(thd), sd = Math.sin(thd);
    f.p2x[i] = f.dx[i] * cd - f.dy[i] * sd + shakeAt(f.tDome[i]);
    f.p2y[i] = f.dx[i] * sd + f.dy[i] * cd + liftAt(f.tDome[i]);
    const th2 = thetaAt(f.t2[i]), c2 = Math.cos(th2), s2 = Math.sin(th2);
    const sx = f.dx[i] * c2 - f.dy[i] * s2 + shakeAt(f.t2[i]), sy = f.dx[i] * s2 + f.dy[i] * c2 + liftAt(f.t2[i]);
    f.rs[i] = Math.sqrt(sx * sx + sy * sy); f.ps[i] = Math.atan2(sx, -sy);
    f.near[i] = R() < 0.1 ? 1 : 0;
    f.glint[i] = R() < 0.09 ? 1 : 0;
    f.turn[i] = R() < 0.3 ? 1 : 0;
    f.sw[i] = 1.1 + 1.7 * R(); f.sph[i] = TAU * R(); f.sa[i] = 0.8 + 1.8 * R();
  }
  return { G, gi, digits, N, f, mound: pts, ridge, moundTop, hw0, left, right, top, loose };
});

// ------------------------------------------------------------------ where each flake goes, per turn (cached)

const PLANS = new Map();
/**
 * Flake i's destination for the turn `key` that brings numerals `pair`:
 * a clump of one of the two numerals, or a spot on the floor.
 */
function planFor(S, key, pair) {
  const id = `${S.gi}:${key}:${pair}`;
  let p = PLANS.get(id);
  if (p) return p;
  if (PLANS.size > 12) PLANS.clear();
  const { N, f, G, digits } = S;
  const r = G.r;
  const slots = [];
  for (let k = 0; k < 2; k++) {
    const D = digits[+pair[k]], ox = k ? S.right : S.left;
    D.clumps.forEach((c, ci) => slots.push({ k, ci, x: ox + c.cx, y: S.top + c.cy }));
  }
  const R = rng(key * 7 + 31 * S.gi + 1);
  while (slots.length < N) {
    const x = (R() * 2 - 1) * (S.hw0 - 3);
    slots.push({ k: -1, ci: 0, x, y: S.moundTop(x) - 0.2 });
  }
  for (let i = slots.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [slots[i], slots[j]] = [slots[j], slots[i]]; }
  p = { kind: new Int8Array(N), sx: new Float32Array(N), sy: new Float32Array(N), ax: new Float32Array(N), ay: new Float32Array(N),
    tH: new Float32Array(N), tL: new Float32Array(N), ra: new Float32Array(N), dphi: new Float32Array(N),
    land: [new Float32Array(digits[+pair[0]].clumps.length), new Float32Array(digits[+pair[1]].clumps.length)],
    det: [new Float32Array(digits[+pair[0]].clumps.length), new Float32Array(digits[+pair[1]].clumps.length)],
    last: 0, lastDigit: 0 };
  const longest = S.gi === 0 ? 420 : 50;
  for (let i = 0; i < N; i++) {
    const s = slots[i], u1 = R(), u2 = R(), u3 = R();
    p.kind[i] = s.k; p.sx[i] = s.x; p.sy[i] = s.y;
    let ax, ay;
    if (s.k >= 0) {
      ax = s.x + (u2 - 0.5) * 4; ay = s.y - (5 + 11 * u3);
      p.tH[i] = f.t2[i] + 1.0 + 3.0 * u1 ** 1.4;
      p.tL[i] = p.tH[i] + (s.y - ay) / (5 + 3 * R());
      p.land[s.k][s.ci] = p.tL[i];
      p.det[s.k][s.ci] = f.t1[i];
      p.lastDigit = Math.max(p.lastDigit, p.tL[i]);
    } else {
      ax = (u2 * 2 - 1) * (r * 0.6); ay = -r * (0.15 + 0.55 * u3);
      p.tH[i] = f.t2[i] + 1.4 + 4 * u1;
      p.tL[i] = p.tH[i] + 5 + (longest - 8) * R() ** 1.4;
    }
    // keep the hover point inside the glass
    const ra = Math.sqrt(ax * ax + ay * ay), lim = r - 3.5;
    if (ra > lim) { ax *= lim / ra; ay *= lim / ra; }
    p.ax[i] = ax; p.ay[i] = ay;
    p.ra[i] = Math.min(Math.sqrt(ax * ax + ay * ay), lim);
    const pa = Math.atan2(ax, -ay);
    let d = (pa - f.ps[i]) % TAU;
    if (d < 0) d += TAU;
    p.dphi[i] = d + TAU * f.turn[i];
    p.last = Math.max(p.last, p.tL[i]);
  }
  PLANS.set(id, p);
  return p;
}

// ------------------------------------------------------------------ the room and the lenses, per minute (cached)

let ROOM = null, ROOMKEY = '';
const ROOMCANVAS = new Gfx(W, H);
const LENS = GLOBES.map((G) => new Gfx(2 * G.r + 2, 2 * G.r + 2));
const SPRITES = new Map();

function sceneFor(f) {
  const hour = f.h + f.m / 60;
  const key = `${f.h}:${f.m}`;
  if (ROOMKEY !== key) {
    const P = paletteAt(hour);
    ROOMCANVAS.clear(0);
    drawRoom(ROOMCANVAS, P);
    GLOBES.forEach((G, gi) => drawLens(LENS[gi], ROOMCANVAS, G, P));
    const tones = [P.snowShade, P.snowBody, mix(P.snowBody, P.snowLit, 0.6), P.snowLit, P.snowLit];
    ROOM = { P, tones, rimDark: mix(P.water, 0x000000, 0.45) };
    ROOMKEY = key;
    SPRITES.clear();
  }
  return ROOM;
}

/** A settled numeral as one sprite, in this minute's light. */
function digitSprite(S, d, tones) {
  const id = `${S.gi}:${d}`;
  let s = SPRITES.get(id);
  if (s) return s;
  const D = S.digits[d];
  const w = D.w, h = D.h + 1;
  const data = new Int32Array(w * h).fill(-1);
  for (let p = 0; p < D.x.length; p++) data[(D.y[p] + 1) * w + D.x[p]] = tones[D.tone[p]];
  s = { w, h, data };
  SPRITES.set(id, s);
  return s;
}

const addCost = (g, c) => { for (const k in c.cost) { g.cost[k] += c.cost[k]; c.cost[k] = 0; } };

// ------------------------------------------------------------------ drawing one globe

function drawGlobe(g, S, e, oldPair, newPair, oldKey, newKey, scene, T) {
  const { G, f, N } = S;
  const { P, tones } = scene;
  const r = G.r;
  const th = thetaAt(e), ct = Math.cos(th), st = Math.sin(th);
  const ly = liftAt(e), lx = shakeAt(e);
  const turning = th !== 0;
  const cx = G.cx + lx, cy = G.cy + ly;           // where the sphere is now
  const toS = (x, y) => [cx + x * ct - y * st, cy + x * st + y * ct];
  const aa = { aa: true };

  // shadow on the sill, smaller and fainter while lifted
  const up = -ly / LIFT;
  g.fillEllipse(G.cx, G.cy + G.plinth[1] + 0.5, G.plinth[3] + 4 - 3 * up, 2.4 - up, 0x000000, { a: 0.32 - 0.18 * up, aa: true });

  // the water lens
  g.draw(LENS[S.gi], Math.round(cx) - r - 1, Math.round(cy) - r - 1, { key: KEY });

  // the air bubble: always at the top, lagging the turn a little
  const dth = (th - thetaAt(e - 0.06)) / 0.06;
  const beta = clamp(-dth * 0.07, -0.7, 0.7);
  const bx = cx + (r - 3.2) * Math.sin(beta), by = cy - (r - 3.2) * Math.cos(beta);
  g.fillEllipse(bx, by, 3.4, 1.5, P.rim, { a: 0.28, aa: true });
  g.pixel(bx - 1, by - 1, P.snowLit, { a: 0.8 });

  // the snow floor, part of the globe
  const moundC = mix(P.snowBody, P.water, 0.12);
  if (turning) {
    g.fillPolygon(S.mound.map(([x, y]) => toS(x, y)), moundC, aa);
    g.stroke(S.ridge.map(([x, y]) => toS(x, y + 0.6)), 1.4, P.snowLit, aa);
  } else {
    g.fillPolygon(S.mound.map(([x, y]) => [cx + x, cy + y]), moundC);
    g.stroke(S.ridge.map(([x, y]) => [cx + x, cy + y + 0.6]), 1.4, P.snowLit);
    g.stroke(S.ridge.map(([x, y]) => [cx + x, cy + y + 3.2]), 1, mix(moundC, P.snowShade, 0.5), { a: 0.6 });
  }

  // the glass numerals: a faint edge where the index almost matches
  const pair = e < 0 ? oldPair : newPair;
  const glassA = e < 0 ? 1 - progress(e, LIFT0, ROT0) : progress(e, DOWN1, DOWN1 + 1.2);
  if (glassA > 0 && !turning) {
    for (let k = 0; k < 2; k++) {
      const D = S.digits[+pair[k]], ox = Math.round(cx) + (k ? S.right : S.left), oy = Math.round(cy) + S.top;
      const E = D.edge;
      for (let p = 0; p < E.x.length; p++)
        g.pixel(ox + E.x[p], oy + E.y[p], E.lit[p] ? P.rim : P.water, { a: (E.lit[p] ? 0.3 : 0.4) * glassA });
    }
  }

  // the snow on the numerals
  const plan = planFor(S, newKey, newPair);
  if (e >= 0) {
    for (let k = 0; k < 2; k++) {
      const d = +newPair[k], D = S.digits[d], ox = Math.round(cx) + (k ? S.right : S.left), oy = Math.round(cy) + S.top;
      if (e >= plan.lastDigit && ly === 0) g.blit(digitSprite(S, d, tones), ox, oy - 1);
      else {
        const land = plan.land[k];
        for (let p = 0; p < D.x.length; p++)
          if (land[D.clump[p]] <= e) g.pixel(ox + D.x[p], oy + D.y[p], tones[D.tone[p]]);
      }
      glints(g, D, ox, oy, T, S.gi * 2 + k, e >= plan.lastDigit ? null : plan.land[k], e);
    }
  } else {
    const old = planFor(S, oldKey, oldPair);
    for (let k = 0; k < 2; k++) {
      const D = S.digits[+oldPair[k]], ox = (k ? S.right : S.left), oy = S.top;
      if (e < ROT0) {
        g.blit(digitSprite(S, +oldPair[k], tones), Math.round(cx) + ox, Math.round(cy) + oy - 1);
        continue;
      }
      const det = old.det[k];
      for (let p = 0; p < D.x.length; p++) {
        if (det[D.clump[p]] <= e) continue;
        const [sx, sy] = toS(ox + D.x[p] + 0.5, oy + D.y[p] + 0.5);
        g.pixel(sx, sy, tones[D.tone[p]]);
      }
    }
  }

  // the flakes that are loose in the water
  const old = e < 0 ? planFor(S, oldKey, oldPair) : null;
  if (!(e >= plan.last)) {
    const lim = r - 1.5, lim2 = lim * lim;
    for (let i = 0; i < N; i++) {
      let x, y, onDome = false;
      if (e < 0 && e < f.t1[i]) continue;                       // still on its numeral or the floor
      if (e < f.tDome[i] && e < 0) {
        // sliding off and falling to the dome while it turns over
        const ox = old.sx[i], oy = old.sy[i];
        const p1x = ox * f.c1[i] - oy * f.s1[i], p1y = ox * f.s1[i] + oy * f.c1[i] + f.l1[i];
        const u = progress(e, f.t1[i], f.tDome[i]);
        x = lerp(p1x, f.p2x[i], ease.inOutQuad(u)); y = lerp(p1y, f.p2y[i], u * u * (1.6 - 0.6 * u));
        x += G.cx; y += G.cy;
      } else if (e < f.t2[i]) {
        // lying in the dome, turning with the globe
        [x, y] = toS(f.dx[i], f.dy[i]);
        onDome = true;
      } else {
        const p = plan;
        if (e >= p.tL[i]) continue;                               // landed
        if (e < p.tH[i]) {
          // the swirl: round the globe clockwise, slowing, towards a point above its spot
          const u = (e - f.t2[i]) / (p.tH[i] - f.t2[i]);
          const phi = f.ps[i] + p.dphi[i] * ease.outCubic(u);
          const rho = lerp(f.rs[i], p.ra[i], ease.inOutQuad(u)) - 4 * Math.sin(PI * u);
          x = G.cx + rho * sin(phi); y = G.cy - rho * cos(phi);
        } else {
          // sinking the last bit, swaying
          const u = (e - p.tH[i]) / (p.tL[i] - p.tH[i]);
          x = G.cx + lerp(p.ax[i], p.sx[i], u) + f.sa[i] * sin(f.sw[i] * e + f.sph[i]) * sin(PI * u);
          y = G.cy + lerp(p.ay[i], p.sy[i], u);
        }
      }
      // never through the glass
      const qx = x - cx, qy = y - cy, q2 = qx * qx + qy * qy;
      if (q2 > lim2) { const k = lim / Math.sqrt(q2); x = cx + qx * k; y = cy + qy * k; }
      if (onDome) { g.fillRect(Math.floor(x - 0.5), Math.floor(y - 0.5), 2, 2, tones[(i & 3) === 0 ? T_SHADE : T_BODY]); continue; }
      if (f.glint[i]) {
        const tw = sin(T * 9 + i * 1.7);
        g.pixel(x, y, tw > 0.3 ? 0xffe9a0 : 0xc8a050, { a: 0.6 + 0.4 * Math.abs(tw) });
      } else if (f.near[i]) {
        g.fillRect(Math.floor(x - 0.5), Math.floor(y - 0.5), 2, 2, P.snowLit, { a: 0.55 });
      } else g.pixel(x, y, P.snowLit, { a: 0.92 });
    }
  }

  // the glass, lit from the room: fixed to the light, not to the globe
  g.ring(cx, cy, r - 0.6, r + 0.4, scene.rimDark, { a: 0.75, aa: true });
  g.arc(cx, cy, r - 2, r - 0.7, 0.55, 2.3, P.rim, { a: 0.3, aa: true });
  g.arc(cx, cy, r - 6, r - 3, -1.3, -0.45, 0xffffff, { a: 0.24 * (0.4 + 0.6 * P.amb), aa: true });
  g.fillEllipse(cx - r * 0.42, cy - r * 0.6, 2.2, 1.3, 0xffffff, { a: 0.85, aa: true });

  // the plinth, turning with the globe
  drawBase(g, G, toS, P, turning);
}

function drawBase(g, G, toS, P, turning) {
  const amb = 0.35 + 0.65 * P.amb;
  const dark = mix(G.wood, 0x000000, 0.45), lit = mix(G.woodLit, G.wood, 1 - amb), mid = mix(G.wood, 0x000000, 0.15 * (1 - amb));
  const o = { aa: true };
  const quad = (yt, yb, ht, hb, f0, f1, c) =>
    g.fillPolygon([toS(ht * f0, yt), toS(ht * f1, yt), toS(hb * f1, yb), toS(hb * f0, yb)], c, o);
  const [c0, c1, ch] = G.collar, [p0, p1, pt, pb] = G.plinth;
  // collar: dark ring that holds the glass
  quad(c0, c1, ch, ch + 1, -1, 1, mix(G.trim, 0x000000, 0.45 + 0.35 * (1 - amb)));
  quad(c0, c0 + 1, ch, ch, -0.7, -0.1, mix(G.trim, 0xffffff, 0.3 * amb));
  // plinth in three bands of light, lit from the window on the left
  quad(p0, p1, pt, pb, -1, -0.35, lit);
  quad(p0, p1, pt, pb, -0.35, 0.45, mid);
  quad(p0, p1, pt, pb, 0.45, 1, dark);
  // a metal band
  const [b0, b1] = G.band, hb0 = pt + ((pb - pt) * (b0 - p0)) / (p1 - p0), hb1 = pt + ((pb - pt) * (b1 - p0)) / (p1 - p0);
  quad(b0, b1, hb0, hb1, -1, 1, mix(G.trim, 0x000000, 0.55 * (1 - amb)));
  quad(b0, b0 + 0.8, hb0, hb0, -0.8, -0.2, mix(G.trim, 0xffffff, 0.5 * amb));
  // a lit lip on top of the plinth
  quad(p0, p0 + 1, pt, pt, -1, 1, mix(lit, 0xffffff, 0.15));
  if (P.glow > 0) quad(c0, c0 + 1.2, ch, ch, -0.8, 0.8, mix(dark, P.glowCol, 0.8 * P.glow));
}

/** Glitter in the settled snow: now and then a pixel flashes. */
function glints(g, D, ox, oy, T, salt, land, e) {
  for (let p = 0; p < D.x.length; p++) {
    if (D.tone[p] !== T_GLINT) continue;
    if (land && land[D.clump[p]] > e) continue;
    const v = sin(T * (0.9 + 0.13 * (p % 7)) + p * 2.3 + salt);
    if (v < 0.92) continue;
    const x = ox + D.x[p], y = oy + D.y[p];
    g.pixel(x, y, 0xffffff);
    if (v > 0.985) { g.pixel(x - 1, y, 0xfff0c0, { a: 0.7 }); g.pixel(x + 1, y, 0xfff0c0, { a: 0.7 }); g.pixel(x, y - 1, 0xfff0c0, { a: 0.7 }); g.pixel(x, y + 1, 0xfff0c0, { a: 0.7 }); }
  }
}

// ------------------------------------------------------------------ the face

export default {
  name: 'Index of Refraction',
  blurb: 'Two snow globes on a window sill hold numerals of glass you cannot see in the water; the snow that sticks to them is the time. Each minute the front one is turned over, shaken and set down, and the new minutes settle out of the blizzard.',
  fps: 60,

  frame(g, ctx) {
    const f = ctx.fields, s = f.sec;
    const T = ctx.date.getTime() / 1000;
    ctx.lcd.backlight(1 - 0.6 * ctx.night);
    const scene = sceneFor(f);
    g.draw(ROOMCANVAS, 0, 0);
    drawOutsideSnow(g, scene.P, T, sin);

    const prev = previousMinute(ctx.date), next = clockFields(new Date(ctx.date.getTime() + 60000));
    const mk = f.minuteKey, hk = Math.floor((mk - f.m) / 60);   // one key per local hour

    // the hour globe, behind: turned only on the hour
    {
      const last = f.m === 59 && s >= 60 + LIFT0;
      const e = last ? s - 60 : f.m * 60 + s;
      const lastHour = clockFields(new Date(ctx.date.getTime() - 3600000));
      const oldPair = last ? f.hh : lastHour.hh, newPair = last ? next.hh : f.hh;
      drawGlobe(g, SETS[0], e, oldPair, newPair, last ? hk : hk - 1, last ? hk + 1 : hk, scene, T);
    }
    // the minute globe, in front
    {
      const last = s >= 60 + LIFT0;
      const e = last ? s - 60 : s;
      const oldPair = last ? f.mm : prev.mm, newPair = last ? next.mm : f.mm;
      drawGlobe(g, SETS[1], e, oldPair, newPair, last ? mk : mk - 1, last ? mk + 1 : mk, scene, T);
    }
  },
};
