// Lascaux: a painted cave wall deep underground, lit by a moving torch. The
// numerals are the herd painted on the stone: each digit is an animal whose
// body, neck and back are the digit's strokes (lascaux-herd.js): a curled
// bison is 0, a rearing horse 1, a leaping ibex 2, a mammoth 3, a giant deer
// with its palmate antler 4, a charging bison 5, a hind 6, a stretching
// horse 7, an aurochs 8, a grazing horse 9. Hours big in front, minutes
// smaller and higher along the wall, two finger-dabs of ochre between them.
//
// Always alive: the whole frame is the wall relit every frame
// (lascaux-wall.js). The torch's pool drifts, its flame flickers and
// jitters, and the light rakes the bulges and cracks under the paint, so the
// relief and the animals seem to move, as they did by firelight. Each animal
// carries two sets of legs (like the many-legged figures in the caves) and
// the flicker decides which shows, so the herd seems to walk in place. Dust
// motes glint in the beam; smoke curls up from the torch below the glass.
//
// Minute turn: the torch leans toward the animals about to change, and they
// sink blotchily into the rock, gone before :00. Then the painter's hand
// comes up from below, its shadow cast big on the wall by the torch, and
// paints the new animal with ochre on its fingertip, stroke by stroke in
// paint order (body first, then the charcoal head, horns and legs), a puff
// of blown pigment at the tip; several changing digits are painted in turn.
// Hour: the herd stampedes. The four animals gallop off to the left (legs
// alternating fast, bodies bobbing, the torch flaring and swinging after
// them), gone by :00, and the new herd runs in from the right and pulls up
// in place. Order is kept left to right, so the time shown is never wrong,
// only incomplete; the wall is empty for about 0.3 s round :00.
//
// Palette: real cave pigments on calcite. Pale cream-buff limestone with
// ochre stains and grey patches, lit warm by the flame, deep umber where the
// light falls away (the dark is warm rock, never black); paint in charcoal /
// manganese black, red ochre (haematite), yellow ochre and umber, each fill
// shaded darker toward its charcoal contour, a dark umber wash on the
// forequarters and necks; red-ochre hand stencils. One warm hue family: the
// numerals win by their black contours and heads and by a soft soot halo
// that darkens the rock round each animal.
// Night (23-07) dims the backlight and reddens the flame; the contours carry
// the time.
//
// Hard pixels for the paint maps (crisp charcoal, like a painted line), but
// stamped with bilinear sampling, so moving animals glide by fractions of a
// pixel. Anti-aliasing for the hand, its shadow, smoke and spray.
//
// Cost: one integer pass over the glass (paint mixed into the albedo, lit
// with two tables and the bump term, own ordered dither), the paint layer
// restamped each frame from the cached maps, a few kit shapes on top. No
// per-pixel callbacks. Boot: the rock, its slope map and the 20 paint maps
// are built once (on the device, at start-up; the maps could equally ship in
// flash, ~135 KB).

import { sin, cos, noise, rand, clamp, progress, ease, clockFields, R, G, B } from '../js/kit.js';
import { W, H, PID, PA, DIS, PIG_R, PIG_G, PIG_B, light, lightAt, clearPaint } from './lascaux-wall.js';
import { GLYPH_H, GLYPH_M, PIG } from './lascaux-herd.js';

// ------------------------------------------------------------ layout
const SLOTS = [
  { x: 5, y: 10, big: true }, { x: 39, y: 10, big: true },
  { x: 96, y: 16, big: false }, { x: 126, y: 16, big: false },
];
const glyphOf = (s, d) => (SLOTS[s].big ? GLYPH_H : GLYPH_M)[d];

// ------------------------------------------------------------ pigments
// charcoal / manganese black, red ochre (haematite), yellow ochre, umber
// 0 none, 1 charcoal, 2-4 red / yellow ochre / umber, 5-6 the legs (charcoal),
// 7-9 the ochres shaded toward the contour, 10 soot halo, 11 the dark wash
const PIGS = [[0, 0, 0], [34, 24, 20], [168, 52, 28], [218, 142, 56], [126, 66, 32], [34, 24, 20], [34, 24, 20], [120, 36, 22], [164, 98, 38], [86, 42, 24], [40, 32, 28], [92, 50, 30]];
PIGS.forEach(([r, g, b], i) => { PIG_R[i] = r; PIG_G[i] = g; PIG_B[i] = b; });
const LW = new Int32Array(12).fill(256);

// ------------------------------------------------------------ timing (seconds into the minute)
const FADE0 = 58.75, FADE1 = 59.9;          // old animals sink into the rock
const PAINT0 = 0.05, PAINT1 = 2.3, TRAVEL = 0.2;   // the painter's window after :00
const OUT0 = 58.3, OUT1 = 59.96;            // hour: the old herd runs off left
const IN0 = 0.0, IN1 = 2.9;                 // hour: the new herd runs in from the right

/**
 * Stamp a glyph into the paint layer at a fractional position (bilinear, so
 * a running animal glides). mode 0 whole, 1 dissolving (p: 0 whole -> 1
 * gone), 2 painting (p: 0 none -> 1 done; pixels appear in paint order).
 */
let sPid = 0;
function tap(gl, k, mode, thr, dis) {
  const p = gl.pid[k];
  if (!p) { sPid = 0; return 0; }
  let a = (gl.al[k] * LW[p]) >> 8;
  if (mode === 2) { const v = thr - gl.ord[k] - (dis >> 3); a = v <= 0 ? 0 : v >= 24 ? a : (a * v / 24) | 0; }
  sPid = p;
  return a;
}
function stamp(g, gl, ox, oy, mode, p) {
  ox -= gl.off; oy -= gl.off;
  const x0 = Math.floor(ox), y0 = Math.floor(oy), fx = Math.round((ox - x0) * 256), fy = Math.round((oy - y0) * 256), gw = gl.w, gh = gl.h;
  const xa = Math.max(0, x0), xb = Math.min(W, x0 + gw + 1), ya = Math.max(0, y0), yb = Math.min(H, y0 + gh + 1);
  if (xb <= xa || yb <= ya) return;
  const thr = mode === 1 ? p * 350 - 90 : p * 300;
  for (let y = ya; y < yb; y++) {
    const r0 = y - y0, r1 = r0 - 1;
    for (let x = xa; x < xb; x++) {
      const i = y * W + x, c0 = x - x0, c1 = c0 - 1, dis = DIS[i];
      let best = 0, bw = 0, acc = 0;
      // four taps: (c0, r0) (c1, r0) (c0, r1) (c1, r1), weights from the fraction
      if (r0 < gh) {
        if (c0 < gw) { const w = (256 - fx) * (256 - fy), a = tap(gl, r0 * gw + c0, mode, thr, dis) * w; acc += a; if (a > bw) { bw = a; best = sPid; } }
        if (fx && c1 >= 0) { const w = fx * (256 - fy), a = tap(gl, r0 * gw + c1, mode, thr, dis) * w; acc += a; if (a > bw) { bw = a; best = sPid; } }
      }
      if (fy && r1 >= 0) {
        if (c0 < gw) { const w = (256 - fx) * fy, a = tap(gl, r1 * gw + c0, mode, thr, dis) * w; acc += a; if (a > bw) { bw = a; best = sPid; } }
        if (fx && c1 >= 0) { const w = fx * fy, a = tap(gl, r1 * gw + c1, mode, thr, dis) * w; acc += a; if (a > bw) { bw = a; best = sPid; } }
      }
      let a = acc >> 16;
      if (a <= 0) continue;
      if (mode === 1) { const v = dis - thr; a = v <= 0 ? 0 : v >= 90 ? a : (a * v / 90) | 0; if (a <= 0) continue; }
      if (a > PA[i]) { PA[i] = a; PID[i] = best; }
    }
  }
  g.cost.calls++; g.cost.box += (xb - xa) * (yb - ya) * ((fx ? 2 : 1) * (fy ? 2 : 1) * 5 + 4);
}

/** The painter's jobs this minute: the slots that changed at :00, one after another. */
function jobsFor(cur, prv) {
  const ch = [];
  for (let i = 0; i < 4; i++) if (cur[i] !== prv[i]) ch.push(i);
  const n = ch.length, span = n === 1 ? 1.85 : (PAINT1 - PAINT0 - TRAVEL * (n - 1)) / Math.max(1, n);
  return ch.map((slot, k) => ({ slot, t0: PAINT0 + k * (span + TRAVEL), t1: PAINT0 + k * (span + TRAVEL) + span }));
}

/** The spray tip for order o (0..1) of a glyph in a slot. */
function tipAt(slot, d, o, out) {
  const gl = glyphOf(slot, d), S = SLOTS[slot];
  const u = clamp(o, 0, 1) * 63, k = Math.floor(u), v = u - k, k1 = Math.min(63, k + 1);
  out[0] = S.x - gl.off + gl.path[2 * k] + (gl.path[2 * k1] - gl.path[2 * k]) * v;
  out[1] = S.y - gl.off + gl.path[2 * k + 1] + (gl.path[2 * k1 + 1] - gl.path[2 * k + 1]) * v;
  return out;
}
/** Painting pace: brisk, eased only at the ends. */
const paintEase = (u) => 0.7 * u + 0.3 * u * u * (3 - 2 * u);
/** Paint progress p -> the order the spray is laying down now (matches stamp's threshold). */
const orderOf = (p) => clamp((p * 300 - 20) / 255, 0, 1);

const HAND_IN = 59.1, HAND_OUT = 0.9;      // the painter's arm comes in before :00, leaves after the last job
const OFF_DX = 30, OFF_DY = 64;            // where the arm goes when it leaves (down-right, off the glass)
const A0 = [0, 0], A1 = [0, 0];

/**
 * Where the painter's spray tip is: out = [x, y, spraying 0..1, glyph or null].
 * Returns false when the arm is out of sight.
 */
function painter(s, jobsNow, cur, jobsNext, nx, out) {
  out[2] = 0; out[3] = null;
  if (jobsNext.length && s > HAND_IN) {
    const j = jobsNext[0];
    tipAt(j.slot, +nx[j.slot], 0, A0);
    const u = ease.outCubic(progress(s, HAND_IN, 59.98));
    out[0] = A0[0] + OFF_DX * (1 - u); out[1] = A0[1] + OFF_DY * (1 - u);
    return true;
  }
  const n = jobsNow.length;
  if (!n) return false;
  for (let k = 0; k < n; k++) {
    const j = jobsNow[k];
    if (s <= j.t0 && k === 0) { tipAt(j.slot, +cur[j.slot], 0, out); return true; }
    if (s <= j.t1) {
      if (s < j.t0) {   // travelling from the last job to this one
        const pj = jobsNow[k - 1], u = ease.inOutQuad(progress(s, pj.t1, j.t0));
        tipAt(pj.slot, +cur[pj.slot], 1, A0); tipAt(j.slot, +cur[j.slot], 0, A1);
        out[0] = A0[0] + (A1[0] - A0[0]) * u; out[1] = A0[1] + (A1[1] - A0[1]) * u - 4 * Math.sin(Math.PI * u);
        return true;
      }
      const p = paintEase(progress(s, j.t0, j.t1)), o = orderOf(p);
      tipAt(j.slot, +cur[j.slot], o, out);
      const gl = glyphOf(j.slot, +cur[j.slot]);
      out[2] = clamp(Math.min((s - j.t0) / 0.12, (j.t1 - s) / 0.12), 0, 1);
      out[3] = o < gl.bodyEnd ? gl.fill : PIG.black;
      return true;
    }
  }
  const j = jobsNow[n - 1];
  if (s > j.t1 + HAND_OUT) return false;
  tipAt(j.slot, +cur[j.slot], 1, A0);
  const u = ease.inCubic(progress(s, j.t1, j.t1 + HAND_OUT));
  out[0] = A0[0] + OFF_DX * u; out[1] = A0[1] + OFF_DY * u;
  return true;
}

// The painter's hand, in its own frame: a along the index finger from its
// tip back to the wrist (direction RD), c across it (+c the curled fingers,
// -c the thumb). It paints with ochre on the fingertip: the index finger
// out, the other three curled, the thumb along them, the forearm coming up
// from below the glass. Drawn bold: a dark outline, flat skin, the edges
// that face the torch lit, the creases between the fingers dark.
const RD = [0.45, 0.893];
const SKIN = 0x9a5a3a, SKIN_LIT = 0xf0b07c, LINE = 0x2a140c, NAIL = 0xf4cfa4, HS = 1.7;
const HAND_Z = 10;                          // the hand's distance from the wall, px (sets the shadow)

function drawHand(g, tx, ty, Lt, shadow, pig) {
  const k = 44 / (44 - HAND_Z), ss = (shadow ? k : 1) * HS;
  let ox = 0, oy = 0;
  const P = (a, c, z = HAND_Z) => {
    a *= HS; c *= HS;
    let x = tx + RD[0] * a - RD[1] * c + ox, y = ty + RD[1] * a + RD[0] * c + oy;
    if (shadow) { const kk = 44 / (44 - z); x = Lt.x + (x - Lt.x) * kk; y = Lt.y + (y - Lt.y) * kk; }
    return [x, y];
  };
  const bar = (a0, c0, a1, c1, w, colr, o, grow = 0, z0, z1) => { const p = P(a0, c0, z0), q = P(a1, c1, z1); g.thickLine(p[0], p[1], q[0], q[1], w * ss + 2 * grow, colr, o); };
  const disc = (a, c, r, colr, o, grow = 0) => { const q = P(a, c); g.fillCircle(q[0], q[1], r * ss + grow, colr, o); };
  const shapes = (colr, o, grow) => {
    bar(15.5, 1.2, 52, 6.0, 4.4, colr, o, grow, HAND_Z, HAND_Z + 8);   // forearm, off the glass
    bar(10.2, 1.0, 13.6, 1.4, 6.0, colr, o, grow);                      // the back of the hand
    bar(0.7, 0, 9.0, 0.3, 2.2, colr, o, grow, 1, HAND_Z);               // index finger, its tip on the wall
    for (let f = 0; f < 3; f++) bar(8.4 + f * 2.2, 2.6, 8.8 + f * 2.2, 5.0, 2.0, colr, o, grow);   // three curled fingers
    bar(13.4, -2.0, 8.2, -1.7, 2.1, colr, o, grow);                    // thumb
  };
  if (shadow) { shapes(0x0c0604, { aa: true, a: 0.32 }, 0); return; }
  const lit = lightAt(tx + RD[0] * 14, ty + RD[1] * 14, Lt, LIT), aa = { aa: true };
  // outline, then the lit rim (the shapes nudged toward the torch), then the skin
  shapes(litCol(LINE, lit), aa, 0.75);
  const dx = Lt.x - tx, dy = Lt.y - ty - 20, dl = Math.hypot(dx, dy) || 1;
  ox = 0.9 * dx / dl; oy = 0.9 * dy / dl;
  shapes(litCol(SKIN_LIT, lit), aa, 0);
  ox = -0.3 * dx / dl; oy = -0.3 * dy / dl;
  shapes(litCol(SKIN, lit), aa, -0.15);
  ox = 0; oy = 0;
  // creases between the curled fingers, the thumb's edge, the wrist, a nail
  const crease = litCol(LINE, lit), thin = { aa: true, a: 0.85 };
  for (let f = 0; f < 2; f++) bar(9.5 + f * 2.2, 2.4, 9.9 + f * 2.2, 5.6, 0.45, crease, thin);
  bar(13.0, -0.9, 8.6, -0.8, 0.4, crease, thin);
  bar(15.6, -1.0, 15.4, 3.6, 0.4, crease, { aa: true, a: 0.5 });
  disc(1.6, -0.55, 0.42, litCol(NAIL, lit), aa);
  if (pig) { const q = P(0.6, 0); g.fillCircle(q[0], q[1], 1.3, litCol((PIG_R[pig] << 16) | (PIG_G[pig] << 8) | PIG_B[pig], lit), aa); }
}

/** Pigment blown from the reed: a puff and flying grains at the tip. */
function drawSpray(g, x, y, pig, k, t, Lt) {
  const c = litCol((PIG_R[pig] << 16) | (PIG_G[pig] << 8) | PIG_B[pig], lightAt(x, y, Lt, LIT));
  g.fillCircle(x, y, 3.2, c, { aa: true, a: 0.22 * k });
  for (let i = 0; i < 18; i++) {
    const ph = t * 2.6 + i / 18, cyc = Math.floor(ph), u = ph - cyc;
    const a = rand(i, cyc, 7) * 6.283, r = 0.6 + 5.5 * u * (0.5 + rand(i, cyc, 8));
    g.pixel(x + r * cos(a), y + r * sin(a), c, { a: 0.85 * (1 - u) * k });
  }
}

/** Dust motes drifting through the torch beam: bright only where the light is. */
const MOTES = 26;
function dust(g, t, Lt, stir) {
  for (let i = 0; i < MOTES; i++) {
    const vx = (rand(i, 1) - 0.5) * 4 + stir * (rand(i, 5) - 0.7) * 30, vy = 0.6 + rand(i, 2) * 1.4 - stir * 3;
    let x = (rand(i, 3) * 170 + vx * t + 3 * sin(t * 0.7 + i)) % 170; if (x < 0) x += 170; x -= 5;
    let y = (rand(i, 4) * 90 + vy * t + 2 * sin(t * 0.5 + i * 1.7)) % 90; if (y < 0) y += 90; y -= 5;
    const dx = x - Lt.x, dy = y - Lt.y, b = 1 - (dx * dx + dy * dy) / (62 * 62);
    if (b <= 0) continue;
    const tw = 0.55 + 0.45 * sin(t * (2 + rand(i, 6) * 3) + i), a = 0.75 * b * tw;
    const ix = Math.floor(x), iy = Math.floor(y), u = x - ix, v = y - iy, c = 0xfff0d0;
    g.pixel(ix, iy, c, { a: a * (1 - u) * (1 - v) }); g.pixel(ix + 1, iy, c, { a: a * u * (1 - v) });
    g.pixel(ix, iy + 1, c, { a: a * (1 - u) * v }); g.pixel(ix + 1, iy + 1, c, { a: a * u * v });
  }
}

/** Smoke from the torch below the glass, curling up through the light. */
const PUFFS = 6, PUFF_LIFE = 7;
function smoke(g, t, Lt) {
  const x0 = 0.5 * Lt.x + 46;
  for (let k = 0; k < PUFFS; k++) {
    const ph = t / PUFF_LIFE + k / PUFFS, cyc = Math.floor(ph), age = (ph - cyc) * PUFF_LIFE;
    const y = 86 - age * 13, r = 3 + age * 1.15;
    const x = x0 + (rand(cyc, k, 9) - 0.5) * 20 + 7 * sin(age * 0.9 + k * 2.1 + cyc);
    const a = 0.1 * sin(Math.PI * age / PUFF_LIFE);
    g.fillEllipse(x, y, r * 1.25, r, 0x3a2a22, { aa: true, a });
  }
}

const L = { x: 80, y: 32, ar: 74, ag: 50, ab: 40, tr: 256, tg: 190, tb: 124 };
const LIT = [0, 0, 0], HAND = [0, 0, 0, null];
const litCol = (c, k) => (Math.min(255, (R(c) * k[0]) >> 8) << 16) | (Math.min(255, (G(c) * k[1]) >> 8) << 8) | Math.min(255, (B(c) * k[2]) >> 8);

export default {
  name: 'Lascaux',
  blurb: 'The numerals are a herd painted on a torch-lit cave wall; a hand paints each new minute, and at the hour the herd stampedes.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, night = ctx.night;
    const t = (f.h * 3600 + f.m * 60 + s);
    ctx.lcd.backlight(1 - 0.55 * night);
    const nxt = clockFields(new Date(ctx.date.getTime() + 60000)), prv = clockFields(new Date(ctx.date.getTime() - 60000));
    const cur = f.hh + f.mm, nx = nxt.hh + nxt.mm, pv = prv.hh + prv.mm;
    const hourOut = nxt.m === 0 && s > OUT0, hourIn = f.m === 0 && s < IN1;
    const jobs = f.m === 0 ? [] : jobsFor(cur, pv), jobsNext = nxt.m === 0 ? [] : jobsFor(nx, cur);

    // ---- legs: a slow walk at rest, a gallop while the herd runs
    const run = hourOut || hourIn;
    // at rest the flicker itself decides which legs show (the cave-cinema
    // reading of the many-legged figures); running, a gallop
    const ph = t * 2 * Math.PI * 3.2;
    const w = run ? 0.5 + 0.5 * sin(ph) : clamp(0.5 + 2.2 * (noise(t * 2.2, 9) - 0.5) + 0.35 * sin(t * 3.1), 0, 1);
    const w2 = clamp((w - 0.5) * 2.4 + 0.5, 0, 1), wk = w2 * w2 * (3 - 2 * w2);   // one pose at a time, a quick swap
    LW[PIG.legA] = Math.round(256 * wk);
    LW[PIG.legB] = Math.round(256 * (1 - wk));

    // ---- the paint
    clearPaint(g);
    let runDx = 0;
    if (hourOut) runDx = -158 * ease.inQuad(progress(s, OUT0, OUT1));
    if (hourIn) runDx = 160 * (1 - ease.outCubic(progress(s, IN0, IN1)));
    const runBob = hourOut ? 2.2 * progress(s, OUT0, OUT0 + 0.4) : hourIn ? 2.2 * (1 - progress(s, IN1 - 0.9, IN1)) : 0;
    for (let i = 0; i < 4; i++) {
      const S = SLOTS[i], d = +cur[i], gl = glyphOf(i, d);
      if (run) { const bob = runBob * Math.abs(sin(ph * 0.5 + i * 1.3)); stamp(g, gl, S.x + runDx, S.y - bob, 0, 0); continue; }
      const job = jobs.find((j) => j.slot === i);
      if (job && s < job.t1) {
        if (s <= job.t0) continue;
        stamp(g, gl, S.x, S.y, 2, paintEase(progress(s, job.t0, job.t1)));
        continue;
      }
      if (cur[i] !== nx[i] && s > FADE0 && nxt.m !== 0) {
        const k = jobsFor(nx, cur).findIndex((j) => j.slot === i);
        const p = ease.inQuad(progress(s, FADE0 + 0.2 * Math.max(0, k), FADE1));
        if (p < 1) stamp(g, gl, S.x, S.y, 1, p);
        continue;
      }
      stamp(g, gl, S.x, S.y, 0, 0);
    }

    // ---- the torch: drifts, flickers; leans toward the painter's work
    const fl0 = (noise(t * 7, 1) - 0.5) * 2, fl1 = (noise(t * 17, 2) - 0.5) * 2;
    let fl = 0.9 + 0.12 * fl0 + 0.06 * fl1;
    let lx = 80 + 28 * sin(t * 0.13) + 9 * sin(t * 0.31 + 1) + 2.4 * (noise(t * 5, 3) - 0.5);
    let ly = 32 + 8 * sin(t * 0.21 + 2) + 2 * (noise(t * 6, 4) - 0.5);
    // the torch leans toward where the painter works
    let lw = 0, lj = null, ld = cur;
    if (s >= 30 && jobsNext.length) { lw = progress(s, 58.4, 59.8); lj = jobsNext[0]; ld = nx; }
    else if (s < 30 && jobs.length) {
      const last = jobs[jobs.length - 1];
      lw = 1 - progress(s, last.t1, last.t1 + 1.6);
      lj = jobs.find((j) => s < j.t1 + TRAVEL * 0.5) ?? last;
    }
    if (lw > 0) {
      const tg = SLOTS[lj.slot], tgl = glyphOf(lj.slot, +ld[lj.slot]);
      const cx = tg.x + tgl.w / 2 - tgl.off + 6, cy = tg.y + 22, k = 0.55 * ease.inOutQuad(lw);
      lx += (cx - lx) * k; ly += (cy - ly) * k;
    }
    // at the hour the torch follows the running herd
    if (run) {
      const herdX = 80 + runDx * 0.8, k = hourOut ? ease.inOutQuad(progress(s, OUT0 - 0.4, OUT0 + 0.5)) : 1 - ease.inOutQuad(progress(s, IN1 - 1.2, IN1));
      lx += (Math.max(-10, Math.min(170, herdX)) - lx) * 0.7 * k;
    }
    if (run) { const k = hourOut ? progress(s, OUT0, OUT0 + 0.6) : 1 - progress(s, IN1 - 0.8, IN1); fl *= 1 + 0.1 * k + 0.14 * k * fl1; }
    // night: the torch burns low and red
    const nk = 1;
    L.x = lx; L.y = ly;
    L.tr = Math.round(262 * fl * nk); L.tg = Math.round(194 * fl * nk * (1 - 0.12 * night)); L.tb = Math.round(124 * fl * nk * (1 - 0.25 * night));
    light(g, L);
    dust(g, t, L, run ? 1 : 0);
    smoke(g, t, L);

    // ---- the painter
    if (painter(s, jobs, cur, jobsNext, nx, HAND)) {
      drawHand(g, HAND[0], HAND[1], L, true, 0);
      if (HAND[2] > 0) drawSpray(g, HAND[0], HAND[1], HAND[3], HAND[2], t, L);
      drawHand(g, HAND[0], HAND[1], L, false, HAND[3]);
    }
  },
};
