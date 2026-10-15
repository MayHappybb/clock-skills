// Crop Circles: the night (and day) shift of a small flying saucer. Seen
// from straight above, a field of golden-green wheat fills the glass, every
// head of it drawn, swaying as gusts roll across in travelling waves. The
// time is laid into the field as crop-circle formations: rings, swirled
// discs and straight paths of flattened straw (cropcircle-glyphs.js), each
// stroke combed so the laid stalks catch the light in the sweeping bands of
// a real formation seen from the air, the standing wheat casting a crisp
// shadow wall onto the laid areas from the side of the sun or moon.
//
// Minute turn: a saucer slides in and hovers over the digits about to
// change. Its beam makes the old formation stand back up in a ripple
// spreading out from under it (all standing before :00), then it spins and
// sweeps the new formation down in a spiral, the stalks flashing as they
// fall, and it leaves. Hour: the mothership comes, rings of light roll out
// over the whole field, every changing formation stands up, the two cows in
// the pasture float up into it; after :00 a ring of light finds the new
// time (it shows first as light on the standing wheat), the stalks are laid
// under it in one great spiral, and the cows are put back down, in each
// other's place.
//
// Around it: a pasture and hedgerow top right with the cows grazing, a farm
// track bottom left where the farmer's tractor goes by in the day, a
// scarecrow with its long shadow, cloud shadows drifting over everything.
//
// Palette (cropcircle-palette.js): the field's own, through the day.
// Day: olive gaps, golden-green ears, gust sheen of pale gold; laid straw
// cream to white-gold, its shadows warm umber. Dawn rose, dusk copper.
// Night: moonlight, a deep blue field (not black: the darks are deliberate
// navy) with silvered ears, the formations pale silver-blue so they glow
// against it, and the beam's mint light the brightest thing on the glass.
// Hard pixels for the field (every ear, the crisp trampled walls); AA for
// everything that flies, drives or grazes.

import { clockFields, progress, ease, sin, clamp, rand } from '../js/kit.js';
import { GLYPHS, GW, GH, COLON, COLON_W, COLON_H } from './cropcircle-glyphs.js';
import { daylight, standingLUT, flatLUT, zoneLUT } from './cropcircle-palette.js';
import { W, H, FP, FL, LAYC, EX, windGrid, renderField, dist, angle, trackY } from './cropcircle-field.js';
import { saucer, mothership, cow, tractor, scarecrow, crow, setNight } from './cropcircle-actors.js';

// ------------------------------------------------------------ layout
// the hours high on the left, the minutes low on the right, a pictogram chain
const SLOTS = [[2, 3], [33, 3], [96, 21], [128, 21]];
const COLON_AT = [76, 32];
const HOUR_C = [80, 40];
const SPR = 40;                     // width of a front, in key units (of 255)

// static gloss table: laid straw lying away from the light shines, lying
// towards it is dull (so lanes combed in alternate directions band light and dark)
const GLOSS = Uint8Array.from({ length: 256 }, (_, k) => Math.round(10 * (0.5 + 0.5 * Math.cos((k / 256) * 2 * Math.PI))));
const layc = (th, st, azb) => Math.min(15, GLOSS[(th - azb) & 255] + st);

// ------------------------------------------------------------ per-minute cache
const FLAT0 = new Uint8Array(FL.length);           // this minute's formations, 0 / 16
const KEYR = new Uint8Array(W * H), KEYL = new Uint8Array(W * H);
const LUT = { S: new Int32Array(528), F: new Int32Array(64), Z: new Int32Array(48), ts: 0, len: 1, glow: 0, ex: false };
let C = { mk: -1 };

const slotCentre = (i) => [SLOTS[i][0] + GW / 2, SLOTS[i][1] + GH / 2];
function changed(a, b) { const out = []; for (let i = 0; i < 4; i++) if (a[i] !== b[i]) out.push(i); return out; }
/** Where the saucer hovers for a turn: over the changing digits (the mothership: mid-field). */
function hoverFor(slots, hour) {
  if (hour) return HOUR_C;
  let x = 0, y = 0;
  for (const i of slots) { const [cx, cy] = slotCentre(i); x += cx; y += cy; }
  return [Math.round(x / slots.length), Math.round(y / slots.length)];
}

/** Turn keys 0..255 for the formation pixels of `slots`, from hover point hp. */
function keys(K, cur, slots, hp, spiral, seed) {
  let dmax = 1;
  const px = [];
  for (const s of slots) {
    const G = GLYPHS[+cur[s]], [ox, oy] = SLOTS[s];
    for (let y = 0; y < GH; y++)
      for (let x = 0; x < GW; x++) {
        if (!G.MASK[y * GW + x]) continue;
        const sx = ox + x, sy = oy + y, d = dist(sx - hp[0], sy - hp[1]);
        if (d > dmax) dmax = d;
        px.push(sy * W + sx, d, angle(sx - hp[0], sy - hp[1]));
      }
  }
  let lo = 255, hi = 0;
  for (let k = 0; k < px.length; k += 3) {
    const rho = (px[k + 1] * 256) / dmax, n = (rand(px[k], seed) * 22) | 0;
    // spiral: an arm sweeps round once, the front moving out behind it
    const v = spiral ? (rho * 0.35 + px[k + 2] * 0.65) * 0.9 : rho * 0.9;
    const key = Math.min(255, (v | 0) + n);
    K[px[k]] = key;
    if (key < lo) lo = key; if (key > hi) hi = key;
  }
  return [dmax, lo, hi];
}

function build(f, nx, pv) {
  const day = daylight(f.h + f.m / 60);
  standingLUT(day.pal, LUT.S); flatLUT(day.pal, LUT.F); zoneLUT(day.pal, LUT.Z);
  const tdx = Math.round(-day.sdx), tdy = Math.round(-day.sdy);
  LUT.ts = tdy * W + tdx; LUT.len = day.len; LUT.glow = day.pal.glow;
  const azb = (((day.az / (2 * Math.PI)) % 1 + 1) % 1 * 256) & 255;
  const cur = f.hh + f.mm, nxs = nx.hh + nx.mm, pvs = pv.hh + pv.mm;
  FLAT0.fill(0);
  for (let s = 0; s < 4; s++) {
    const G = GLYPHS[+cur[s]], [ox, oy] = SLOTS[s];
    for (let y = 0; y < GH; y++)
      for (let x = 0; x < GW; x++) {
        const k = y * GW + x;
        if (!G.MASK[k]) continue;
        const i = (oy + y) * W + ox + x;
        FLAT0[i + FP] = 16;
        LAYC[i] = layc(G.THETA[k], G.STREAK[k], azb);
      }
  }
  for (let y = 0; y < COLON_H; y++)
    for (let x = 0; x < COLON_W; x++) {
      const k = y * COLON_W + x;
      if (!COLON.MASK[k]) continue;
      const i = (COLON_AT[1] + y) * W + COLON_AT[0] + x;
      FLAT0[i + FP] = 16;
      LAYC[i] = layc(COLON.THETA[k], COLON.STREAK[k], azb);
    }
  const hourN = nx.h !== f.h, hourP = pv.h !== f.h;
  const cn = changed(cur, nxs), cp = changed(pvs, cur);
  const hn = hoverFor(cn, hourN), hp = hoverFor(cp, hourP);
  const dn = cn.length ? keys(KEYR, cur, cn, hn, false, f.minuteKey) : [1, 0, 255];
  const dp = cp.length ? keys(KEYL, cur, cp, hp, true, f.minuteKey + 7) : [1, 0, 255];
  C = { mk: f.minuteKey, day, cur, cn, cp, hn, hp, dn, dp, hourN, hourP, hour: f.h };
  return C;
}

// ------------------------------------------------------------ turn timing (seconds; negative = before :00)
const MIN = { in0: -5.8, in1: -4.0, r0: -3.1, r1: -0.12, l0: 0.02, l1: 2.5, out0: 2.8, out1: 4.6, from: [62, -58], to: [-74, -52], R: 7.5 };
const HOUR = { in0: -7.2, in1: -4.3, r0: -3.6, r1: -0.12, l0: 0.45, l1: 3.4, out0: 5.0, out1: 7.8, from: [0, -78], to: [-130, -46], R: 19 };

/** The saucer's place at turn time T: slides in, hovers (bobbing), leaves. */
function flight(P, hp, T) {
  let x = hp[0], y = hp[1] + 0.6 * sin(T * 2.3);
  if (T < P.in1) { const u = 1 - ease.outCubic(progress(T, P.in0, P.in1)); x += P.from[0] * u; y += P.from[1] * u; }
  if (T > P.out0) { const u = ease.inCubic(progress(T, P.out0, P.out1)); x += P.to[0] * u; y += P.to[1] * u; }
  return [x, y];
}

/** Flatness of a slot's pixels during a turn: raising (old) or laying (new). */
function turnFL(g, slots, cur, K, front, laying) {
  for (const s of slots) {
    const G = GLYPHS[+cur[s]], [ox, oy] = SLOTS[s];
    for (let y = 0; y < GH; y++)
      for (let x = 0; x < GW; x++) {
        if (!G.MASK[y * GW + x]) continue;
        const i = (oy + y) * W + ox + x;
        let v = laying ? ((front - K[i]) * 16) / SPR : ((K[i] + SPR - front) * 16) / SPR;
        FL[i + FP] = v <= 0 ? 0 : v >= 16 ? 16 : v | 0;
      }
    g.cost.box += GW * GH * 3;
  }
}

// ------------------------------------------------------------ the beam's light, into EX
const EXL = new Uint8Array(256);
function lightBox(g, cx, cy, R) {
  const x0 = Math.max(0, cx - R), x1 = Math.min(W - 1, cx + R), y0 = Math.max(0, cy - R), y1 = Math.min(H - 1, cy + R);
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const v = EXL[dist(x - cx, y - cy)];
      if (v) EX[y * W + x] = v;
    }
  g.cost.box += (x1 - x0 + 1) * (y1 - y0 + 1) * 4;
}
/** The pool under a hovering saucer, with a bright ring at radius `ring` (or none). */
function poolLUT(a, R, ring, core) {
  for (let d = 0; d < 256; d++) {
    let v = 0;
    if (d < R) { const u = 1 - d / R; v = 70 * u * u; }
    if (d < core) v += 50;
    if (ring >= 0) { const e = 1 - Math.abs(d - ring) / 2.6; if (e > 0 && d < R) v += 120 * e; }
    EXL[d] = Math.min(255, v * a) | 0;
  }
}
/** The mothership's rings of light rolling out over the whole field. */
function ringsLUT(T, a) {
  for (let d = 0; d < 256; d++) {
    let v = d < 20 ? 60 : 60 * Math.max(0, 1 - (d - 20) / 30);
    for (let k = 0; k < 6; k++) {
      const r = (T - (-4.6 + k * 0.7)) * 42;
      if (r < 0) continue;
      const e = 1 - Math.abs(d - r) / 3.5;
      if (e > 0) v += 110 * e * Math.max(0, 1 - r / 120);
    }
    EXL[d] = Math.min(255, v * a) | 0;
  }
}
/** After the hour: a ring of light runs out from the mothership and finds the new digits. */
function glyphGlow(g, slots, cur, T) {
  const front = 18 + T * 150, fade = 1 - progress(T, 2.6, 4.6);
  for (const s of slots) {
    const G = GLYPHS[+cur[s]], [ox, oy] = SLOTS[s];
    for (let y = 0; y < GH; y++)
      for (let x = 0; x < GW; x++) {
        if (!G.MASK[y * GW + x]) continue;
        const sx = ox + x, sy = oy + y, i = sy * W + sx;
        const on = clamp((front - dist(sx - HOUR_C[0], sy - HOUR_C[1])) / 6, 0, 1);
        const v = 210 * on * fade * (1 - FL[i + FP] / 28);
        if (v > EX[i]) EX[i] = v | 0;
      }
    g.cost.box += GW * GH * 4;
  }
}

// ------------------------------------------------------------ the pasture's cows
const REST = [[116, 5.5, 0], [143, 6.5, 0]];
const CROW = [[62, 69], [70, 75]];
const FLY = [[96, 9], [112, 15], [134, 17.5], [154, 15], [12, 71], [38, 72], [64, 74]];
function cowAt(k, h, tod) {
  const [x, y, a] = REST[(k + h) & 1];
  return [x + 2.2 * sin(tod * 0.031 + k * 2), y + 0.5 * sin(tod * 0.043 + k), a];
}

export default {
  name: 'Crop Circles',
  blurb: 'The time is crop-circle formations in a swaying wheat field; a saucer raises the old digit and spins the new one down.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, tod = f.h * 3600 + f.m * 60 + s;
    ctx.lcd.backlight(1 - 0.55 * ctx.night);
    const nx = clockFields(new Date(ctx.date.getTime() + 60000)), pv = clockFields(new Date(ctx.date.getTime() - 60000));
    if (C.mk !== f.minuteKey) build(f, nx, pv);
    const day = C.day, night = day.night, sun = day.sun;
    const sh = [day.sdx * day.len, day.sdy * day.len], shA = 0.32 * (1 - night) + 0.12;

    windGrid(g, tod, 70 - 30 * night, night);
    FL.set(FLAT0);
    g.cost.px += W * H / 2;

    // which turn is on: the coming one (T < 0) or the one just past (T >= 0)
    let T = 99, P = MIN, hp = null, slots = null, dmax = [1, 0, 255], hour = false;
    if (s >= 50 && C.cn.length) { T = s - 60; hour = C.hourN; hp = C.hn; slots = C.cn; dmax = C.dn; }
    else if (s < 10 && C.cp.length) { T = s; hour = C.hourP; hp = C.hp; slots = C.cp; dmax = C.dp; }
    if (hour) P = HOUR;
    let ex = false;
    if (T < 50) {
      // the fronts run over this turn's whole key range: nothing pops at either end
      const [dm, klo, khi] = dmax, span = khi + SPR - klo;
      if (T < 0 && T > P.r0) turnFL(g, slots, C.cur, KEYR, klo + span * ease.inQuad(progress(T, P.r0, P.r1)), false);
      if (T < 0 && T >= P.r1) turnFL(g, slots, C.cur, KEYR, 999, false);     // all standing before :00
      if (T >= 0 && T < P.l1 + 0.1) turnFL(g, slots, C.cur, KEYL, klo + span * ease.outQuad(progress(T, P.l0, P.l1)), true);
      const beam = progress(T, P.r0 - 0.6, P.r0) * (1 - progress(T, P.l1, P.l1 + 0.6));
      if (beam > 0 || (hour && T > P.in0 && T < 5)) {
        EX.fill(0); g.cost.px += W * H / 2; ex = true;
        if (hour) {
          ringsLUT(T, Math.max(beam, 0.3) * (T < 0 ? 1 : 1 - progress(T, 0, 1.2)));
          lightBox(g, HOUR_C[0], HOUR_C[1], 160);
          if (T >= 0) glyphGlow(g, slots, C.cur, T);
        } else {
          const ring = T < 0 ? ease.inQuad(progress(T, P.r0, P.r1)) * dmax[0] : -1;
          poolLUT(beam, dmax[0] + 4, ring, P.R + 2);
          lightBox(g, hp[0], hp[1], dmax[0] + 4);
        }
      }
    }
    LUT.ex = ex;
    renderField(g, LUT);

    setNight(night);
    // ---- the farm: scarecrow, crows (by day; they fly off when a saucer comes), tractor, cows
    scarecrow(g, 76.5, 65, [sh[0] * 4.5, sh[1] * 4.5], shA * 0.9, sin(tod * 0.9));
    if (sun) {
      const away = T < 50 ? ease.inOutQuad(progress(T, P.in0 - 0.3, P.in0 + 1.6)) * (1 - ease.inOutQuad(progress(T, P.out1 + 0.5, P.out1 + 3.5))) : 0;
      for (let k = 0; k < 2; k++) {
        const per = 1.9 + k * 0.4, n = Math.floor(tod / per), ph = progress(tod / per - n, 0, 0.16);
        const spot = (m) => [CROW[k][0] + (rand(m, k, 51) - 0.5) * 9, CROW[k][1] + (rand(m, k, 52) - 0.5) * 5];
        const [ax, ay] = spot(n - 1), [bx, by] = spot(n), u = ease.inOutQuad(ph);
        let x = ax + (bx - ax) * u, y = ay + (by - ay) * u - 1.2 * sin(ph * Math.PI);
        let ang = Math.atan2(by - ay, bx - ax);
        if (away > 0) { x += (k ? -70 : -95) * away; y += (k ? 40 : 18) * away; ang = Math.atan2(k ? 40 : 18, k ? -70 : -95); }
        const fly = away > 0.02 && away < 0.98;
        if (away < 0.98) crow(g, x, y, ang, fly, 0.5 + 0.5 * sin(tod * 21 + k), [sh[0] * (fly ? 4 : 0.8), sh[1] * (fly ? 4 : 0.8)], shA * 0.8);
      }
    } else if (night > 0.3) {
      // fireflies along the hedge and the track
      for (let k = 0; k < 7; k++) {
        const [bx, by] = FLY[k], on = Math.max(0, sin(tod * (0.9 + k * 0.13) + k * 2.3)) ** 3 * night;
        if (on < 0.03) continue;
        const x = bx + 4 * sin(tod * 0.31 + k), y = by + 2 * sin(tod * 0.43 + k * 1.7);
        g.fillCircle(x, y, 2, 0xc8ff70, { aa: true, a: 0.3 * on });
        g.fillCircle(x, y, 0.8, 0xf4ffb0, { aa: true, a: on });
      }
    }
    if (sun) {
      const tx = -16 + ((tod * 2.3) % 360);
      if (tx < 100) {
        const ty = trackY(tx) + 4.2, ty2 = trackY(tx + 1) + 4.2;
        tractor(g, tx, ty, Math.atan2(ty2 - ty, 1), [sh[0] * 1.5, sh[1] * 1.5], shA);
      }
    }
    for (let k = 0; k < 2; k++) {
      let [x, y, a] = cowAt(k, C.hour, tod), sc = 1, csh = 1, lift = 0;
      if (hour && T < 50) {
        // up into the mothership before the hour, put down in each other's place after
        const up = ease.inOutCubic(progress(T, -4.6 + k * 0.4, -1.4 + k * 0.3));
        const down = ease.inOutCubic(progress(T, 1.4 + k * 0.4, 4.6 + k * 0.3));
        lift = T < 0 ? up : 1 - down;
        const tx = HOUR_C[0] + (k ? 5 : -5), ty = HOUR_C[1] + (k ? 2 : -2);
        x += (tx - x) * lift; y += (ty - y) * lift; a += 0.5 * sin(lift * 3.1416) * (k ? -1 : 1); sc = 1 + 0.5 * lift; csh = 1 - lift;
      }
      if (lift > 0.03 && lift < 0.97) {
        // the tractor beam holding it: a shaft of the beam's light from the ship's belly
        const sx = HOUR_C[0] + (k ? 6 : -6), sy = HOUR_C[1] + 6, dx = x - sx, dy = y - sy, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
        g.fillPolygon([[sx + nx * 3, sy + ny * 3], [x + nx * 8, y + ny * 8], [x - nx * 8, y - ny * 8], [sx - nx * 3, sy - ny * 3]], LUT.glow, { aa: true, a: 0.28 * Math.sin(lift * Math.PI) + 0.08 });
      }
      if (lift < 0.97) cow(g, x, y, a, sc, k ? -1 : 1, [sh[0] * (1 + lift * 8), sh[1] * (1 + lift * 8) + lift * 6], shA * csh, tod * 1.1 + k * 2);
    }

    setNight(night * 0.3);   // the saucers carry their own lights
    // ---- the saucer, or the mothership
    if (T < 50 && T > P.in0 && T < P.out1) {
      const [ux, uy] = flight(P, hour ? HOUR_C : hp, T);
      const spin = T * 1.4 + 9 * ease.inOutQuad(progress(T, P.r1 - 0.3, P.l1));
      const k = (4 + 3 * day.len) * (hour ? 1.5 : 1), ssh = [day.sdx * k, day.sdy * k + 2];
      if (hour) mothership(g, ux, uy, P.R, spin, ssh, shA * 0.9);
      else saucer(g, ux, uy, P.R, spin, 8, ssh, shA * 0.9);
    }
  },
};
