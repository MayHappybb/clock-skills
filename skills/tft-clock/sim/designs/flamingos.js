// Flamingos: a loose watercolour of a lagoon at the hour, and the time is
// four flamingos standing in it. Each numeral is one bird (flamingos-glyphs.js):
// its long neck writes the digit from the head down, and its plump body is the
// digit's foot, tapering to the black flight feathers at the tail; two stilt
// legs hang from it into the water. The hours stand near (big, low), the
// minutes further out on the lagoon (smaller, higher), with the low sun and
// its glitter between them.
//
// The time is never still. The four birds perform the flamingo's marching
// display together, two steps a second: on each step one leg lifts (the
// ankle folding backwards) and stamps, the body shifts its weight to the
// standing leg (the numeral leans over it), dips on the landing, and every
// head flags round to the other side, in unison, as a real flock does. A
// ripple ring spreads from every stamp. Every ~15 s a flourish: the wing
// salute (all four flash open their coral-and-black wings), a pair flying
// over, or a breeze that drags the lagoon and leans the flock. The far flock
// wades and feeds along the shore; dry-brush ripples drift over the water.
//
// Minute turn: the bird that must leave stops, turns, runs off across the
// water with splashes and opening wings, lowers its neck flat as it lifts off
// (the numeral only ever squashes, never changes) and flies off; the new bird
// glides in from the upper right before :00, touches down with a splash at
// :00, and raises its neck into the new numeral. It lands wet: the wash is
// darker and soft-edged, and dries over two seconds, patchily by the paper's
// grain, into its hard dried edge. Hour: a fresh wash of the next hour's
// sky flows out from the sun with a wet bead at its edge, the whole far flock
// marches in along the shore at double time with the four, all heads
// flagging, the four salute with their wings, and the flock lifts off in a
// wave and sweeps away over the lagoon behind them.
//
// Medium and palette: every pixel is pigment on paper. Three transparent
// pigments (quinacridone rose, a coral, a lagoon teal) over warm white paper,
// mixed by a filter model, so a rose glaze on teal goes mauve and the black
// of the flight feathers is the three piled up, as a watercolourist mixes
// it; no other colour exists. Its marks: flat transparent washes with the
// hard dried edge where the pigment pooled (each bird's darker rim), the
// sky's wet-in-wet mottling and cauliflower backruns, white paper left as a
// sliver round each bird (the background wash was painted round them, so the
// time is the strongest contrast), granulation by a bold paper grain fixed
// to the glass, and dry-brush skips on the water. Night is a nocturne: the
// sky and lagoon go to an indigo of teal and rose, the moon is reserved
// paper, the birds stay pale on it, and the backlight dims.
//
// Cost: every frame paints pigment codes into a 25.6 KB buffer and turns them
// into colour with one 8 KB table. The birds are sampled from ten 36 x 54
// distance fields (Int8) with plumage maps, heads from small fields per
// angle; legs, wings, flyers and rings are integer tests over small boxes.
// The skies are painted at load (flash tables, two variants for each part of
// the day). Flash: fields 39 KB + heads 13 KB + LUTs 16 KB (+8 KB pool) + grain 12.8 KB +
// skies 102 KB + water tables 10 KB = ~201 KB. RAM: the 25.6 KB pigment
// buffer beside the frame buffer.

import { clockFields, hash, sin, cos } from '../js/kit.js';
import { GLYPHS, SW, SH, M, GH, HEADS, HS, HC, YAWS, H_HEAD, H_BILL, H_TIP, H_EYE } from './flamingos-glyphs.js';
import { W, H, N, HORIZON, LUT, LUT_NIGHT, GRAIN, POOL, code, addCode, paintSky, phaseOf, PHASES, WROWS, WLOOP, STREAK, W_SPEED, W_PHASE, WATER_BASE } from './flamingos-paint.js';
import { work, capsule, ring, dab, flyer, farBird, C_LEG, C_KNEE, C_COVERT, C_PRIM } from './flamingos-actors.js';

const P = new Uint16Array(N);             // the painting, as pigment codes
// the skies, painted at load: two variants per part of the day (their
// backruns differ), alternating hour by hour; 8 x 12.8 KB of flash
const SKIES = {};
for (const ph of Object.keys(PHASES)) SKIES[ph] = [0, 1].map((v) => { const t = new Uint16Array(W * HORIZON); paintSky(ph, t, 7 + v * 5 + ph.length); return t; });

const sm = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const frac = (x) => x - Math.floor(x);
const bump = (x, a, b) => (x <= a || x >= b ? 0 : sin(((x - a) / (b - a)) * Math.PI));

// the four birds: glyph origin x, scale, body baseline (glyph y = GH) and the waterline at their feet
const SLOTS = [
  { x: 3, s: 1, yB: 57, feet: 71, hs: 0 },
  { x: 34, s: 1, yB: 57, feet: 71, hs: 0 },
  { x: 95, s: 0.84, yB: 48, feet: 60, hs: 1 },
  { x: 121, s: 0.84, yB: 48, feet: 60, hs: 1 },
];
const LEG_Y = 43;          // glyph y where the legs leave the body

// ------------------------------------------------------------ plumage codes

// BC[wet][grain][part*6 + rim*3 + bloom]; parts 0..3 from the body field, 4..7 from the head
const RECIPE = [
  [[4, 2, 0], [7, 3, 0]], [[4, 3, 0], [7, 4, 1]], [[4, 6, 0], [6, 8, 1]], [[8, 5, 9], [9, 6, 11]],
  [[4, 2, 0], [7, 3, 0]], [[1, 1, 0], [3, 2, 0]], [[9, 6, 10], [9, 6, 10]], [[8, 5, 9], [8, 5, 9]],
];
const BC = [0, 1].map((wet) => [0, 1].map((gr) => {
  const t = new Uint16Array(48);
  for (let p = 0; p < 8; p++) for (let rim = 0; rim < 2; rim++) for (let bl = 0; bl < 3; bl++) {
    let [r, o, tt] = RECIPE[p][wet ? 0 : rim];
    if (wet && p !== 6 && p !== 7) { r += 2; o += 1; }
    else if (bl === 1 && p < 4) { r -= 1; o -= 1; }
    else if (bl === 2 && p < 4) { r += 2; o += 1; }
    if (gr) r += 1;
    t[p * 6 + rim * 3 + bl] = code(r, o, tt);
  }
  return t;
}));

// ------------------------------------------------------------ choreography

/** Rest pose at time s: the marching display, all four in unison. */
function march(s, amp, fast) {
  const b = s * (fast ? 3 : 2), k = Math.floor(b), p = b - k;
  const lift = p < 0.55 ? sin((p / 0.55) * Math.PI) : 0;
  const land = bump(p, 0.5, 0.85);
  return {
    leg: k & 1, lift: lift * amp * (fast ? 1.5 : 1), land: land * amp,
    h: 2.5 * sin(b * Math.PI) * amp, k: 1 - 0.04 * land * amp + 0.015 * lift * amp, rise: (1.2 * lift - 1.0 * land) * amp, sway: 1.2 * sin(b * Math.PI) * amp, wing: 10 - Math.round(3 * lift * amp),
    flag: (k & 1) ^ 1, turn: sm(p / 0.24), step: k, p,
  };
}

/** What happens this 15 s block: 0 wing salute, 1 a pair flies over, 2 a breeze. */
function flourish(mk, s) {
  if (s < 3 || s >= 48) return null;
  const blk = Math.floor((s - 3) / 15), t = s - 3 - blk * 15 - 6;
  if (t < 0 || t >= 3.2) return null;
  return { kind: hash(mk, blk, 7) % 3, t };
}

/** The sky for hour h (the backruns move hour to hour). */
const skyFor = (h) => SKIES[phaseOf(h)][h & 1];

// ------------------------------------------------------------ the lagoon

function lagoon(T, phase, breeze) {
  const base = WATER_BASE[phase];
  for (let y = 0; y < WROWS; y++) {
    const off = Math.floor(T * W_SPEED[y] * (1 + 2 * breeze) + 2.2 * sin(T * 0.9 + W_PHASE[y])) & (WLOOP - 1);
    const r0 = base[y * 3], o0 = base[y * 3 + 1], t0 = base[y * 3 + 2], row = (y + HORIZON) * W, srow = y * WLOOP;
    const dark = 22 + Math.round(18 * breeze);
    for (let x = 0; x < W; x++) {
      const i = row + x, gr = GRAIN[i], st = STREAK[srow + ((x + off) & (WLOOP - 1))];
      // dry brush: a dark drag of teal, or a skip where the brush rode over the grain's peaks
      if (st === 2 && gr < 9) { P[i] = 0; continue; }
      const t = st === 1 ? t0 + dark : t0;
      P[i] = code((r0 + gr) >> 4, (o0 + gr) >> 4, (t + gr) >> 4);
    }
  }
  work.n += WROWS * W * 9;
}

// ------------------------------------------------------------ a bird

/**
 * Paint one numeral-bird into P. `q`: { d, x, yB, s, k, h, hx, hy, yaw, wet }.
 * Inside the wash: plumage by part, rim where it dried, blooms. A 1 px sliver
 * of paper round it, then the background's own dried edge (POOL).
 */
function bird(q) {
  const G = GLYPHS[q.d], sdf = G.sdf, part = G.part, s = q.s, k = q.k;
  const sk = s * k, S8 = Math.round(s * 256);
  const top = q.yB - sk * (GH + M), bot = q.yB + sk * M;
  const left = q.x - M * s + Math.min(0, q.h) - 1, right = q.x + (SW - M) * s + Math.max(0, q.h) + 1;
  const y0 = Math.max(0, Math.floor(top)), y1 = Math.min(H - 1, Math.ceil(bot));
  const x0 = Math.max(0, Math.floor(left)), x1 = Math.min(W - 1, Math.ceil(right));
  // the head: nearest-sampled field at its own scale, centred at (hx, hy)
  const yawK = Math.max(0, Math.min(YAWS, Math.round((q.yaw / Math.PI) * YAWS)));
  const HD = HEADS[q.hs][yawK], hsdf = HD.sdf, hpart = HD.part;
  const hx0 = Math.round(q.hx - HC - 0.5), hy0 = Math.round(q.hy - HC - 0.5);
  const wet16 = Math.round(q.wet * 16), bleed = Math.round(q.wet * 7), wingT = q.wingT;
  const BCd = BC[0], BCw = BC[1];
  let n = 0;
  for (let y = y0; y <= y1; y++) {
    const qy = (q.yB - (y + 0.5)) / sk;                     // glyph units above the baseline
    const fy = (GH - qy + M - 0.5) * 256;
    if (fy < 0 || fy >= (SH - 1) * 256) continue;
    const FY = fy | 0, iy = FY >> 8, ay = FY & 255;
    const gx0 = (x0 + 0.5 - q.x - (q.h * qy) / GH) / s;
    let FX = ((gx0 + M - 0.5) * 256) | 0;
    const DFX = (256 / s) | 0, row = y * W, hj = y - hy0;
    for (let x = x0; x <= x1; x++, FX += DFX) {
      n++;
      let d = 999, pi = 0;
      if (FX >= 0 && FX < (SW - 1) * 256) {
        const ix = FX >> 8, ax = FX & 255, g = iy * SW + ix;
        const a = sdf[g] * (256 - ax) + sdf[g + 1] * ax, b = sdf[g + SW] * (256 - ax) + sdf[g + SW + 1] * ax;
        d = (((a * (256 - ay) + b * ay) >> 16) * S8) >> 8;   // eighths of a screen pixel
        pi = part[(iy + (ay >> 7)) * SW + ix + (ax >> 7)];
        if ((pi >> 4) >= wingT) pi ^= 3;          // body -> coral covert (only the body has a height)
      }
      const hi = x - hx0;
      if (hj >= 0 && hj < HS && hi >= 0 && hi < HS) {
        const e = hsdf[hj * HS + hi];
        if (e < d) { d = e; pi = hpart[hj * HS + hi]; }
      }
      if (d >= 16) continue;
      const i = row + x;
      if (d < bleed) {
        const gr = GRAIN[i];
        const wet = wet16 > gr;
        if (d >= 0 && !(wet && d < ((bleed * gr) >> 4))) { P[i] = 0; continue; }
        const p = pi & 7, bl = p < 4 ? (pi >> 2) & 3 : 0;
        const rim = d > -8 ? 1 : 0;
        P[i] = (wet ? BCw : BCd)[gr >= 13 ? 1 : 0][p * 6 + rim * 3 + bl];
      } else if (d < 8) P[i] = 0;
      else P[i] = POOL[P[i]];
    }
  }
  work.n += n * 18;
}

/** The bird's mirror in the water below its feet: a pale, rippled glaze. */
function reflection(q, T) {
  const G = GLYPHS[q.d], sdf = G.sdf, s = q.s, sk = s * q.k;
  const y0 = q.feet, y1 = Math.min(H - 1, q.feet + 16);
  const x0 = Math.max(0, Math.floor(q.x - 2)), x1 = Math.min(W - 1, Math.ceil(q.x + 30 * s));
  let n = 0;
  for (let y = y0; y <= y1; y++) {
    const my = 2 * q.feet - y - 0.5 + (q.yB0 - q.yB);          // mirrored
    const qy = (q.yB - my) / sk;
    const fy = (GH - qy + M - 0.5) * 256;
    if (fy < 0 || fy >= (SH - 1) * 256) continue;
    const iy = (fy | 0) >> 8;
    const wob = Math.round(1.6 * sin(T * 3.1 + y * 0.9));
    for (let x = x0; x <= x1; x++) {
      n++;
      const gx = (x + 0.5 + wob - q.x - (q.h * qy) / GH) / s + M - 0.5;
      const ix = gx | 0;
      if (ix < 0 || ix >= SW) continue;
      if (sdf[iy * SW + ix] < 0) { const i = y * W + x; P[i] = addCode(P[i], 2, 1, 0); }
    }
  }
  work.n += n * 8;
}

/** The two legs: thigh hidden in the body, the visible shank folding back at the ankle when lifted. */
function legs(q, mirror) {
  const G = GLYPHS[q.d], s = q.s;
  const rootY = q.yB - s * q.k * (GH - LEG_Y);
  const len = q.feet - rootY;
  if (len < 2) return;
  for (let L = 0; L < 2; L++) {
    const rx = q.x + G.legs[L] * s + (q.h * (GH - LEG_Y)) / GH;
    const lift = L === q.leg ? q.lift : 0;
    const back = -q.face;                                   // the ankle points backwards
    const footY = q.feet - lift * 4.5 * s - (q.air ?? 0);
    const kx = rx + back * (0.6 + lift * 2.4) * s, ky = rootY + (footY - rootY) * 0.5;
    const fx = rx - (q.sway ?? 0) * s + (q.run ? q.run * (L ? 1 : -1) * 2.5 : 0) + lift * -back * 0.8 * s;
    const r = 0.85 * s + 0.1;
    if (!mirror) {
      capsule(P, rx, rootY, kx, ky, r, C_LEG);
      capsule(P, kx, ky, fx, Math.min(footY, q.feet), r, C_LEG);
      capsule(P, kx, ky, kx, ky, r + 0.45, C_KNEE);
    } else if (lift < 0.2 && !q.air) {
      // the leg's reflection, short and broken by the ripples
      const my = 2 * q.feet - ky;
      capsule(P, fx, q.feet + 1, kx, Math.min(H - 1, my), r * 0.8, addCode(C_LEG, -2, -2, 2));
    }
  }
}

/** Wings opened beside the body (salute, take-off), behind the numeral. */
function wings(q, open) {
  if (open <= 0.02) return;
  const G = GLYPHS[q.d], s = q.s;
  const cy = q.yB - s * q.k * 6, xl = q.x + (G.legs[0] - 6) * s, xr = q.x + (G.legs[1] + 6) * s;
  const len = 12 * s * open, up = 5 * s * open;
  for (const [x, dir] of [[xl, -1], [xr, 1]]) {
    const mx = x + dir * len * 0.55, my = cy - up * 0.5, tx = x + dir * len, ty = cy - up;
    capsule(P, x, cy, mx, my, 2.4 * s, C_COVERT);
    capsule(P, mx, my, tx, ty, 1.5 * s, C_PRIM);
  }
}

// ------------------------------------------------------------ the face

export default {
  name: 'Flamingos',
  blurb: 'A loose watercolour lagoon: each numeral is a flamingo whose neck writes the digit, marching and head-flagging on the beat; at the minute the old bird runs and takes off, the new one glides in and lands wet.',
  fps: 60,
  frame(g, ctx) {
    work.n = 0;
    const f = ctx.fields, s = f.sec, mk = f.minuteKey, tms = ctx.date.getTime();
    const T = (tms % 86400000) / 1000, day = Math.floor(tms / 86400000);
    ctx.lcd.backlight(1 - 0.55 * ctx.night);
    const prv = clockFields(new Date(tms - 60000)), nxt = clockFields(new Date(tms + 60000));
    const cur = f.hh + f.mm, old = prv.hh + prv.mm, nw = nxt.hh + nxt.mm;
    const hourShow = prv.h !== f.h && s < 14;
    const phase = phaseOf(f.h);
    const fl = hourShow ? null : flourish(mk, s);
    const breeze = fl && fl.kind === 2 ? bump(fl.t, 0, 3.2) : 0;

    // ---- sky (and at the hour, the next sky flowing out from the sun)
    const sky = skyFor(f.h);
    if (hourShow && s > 2.5 && s < 8.5) {
      const was = skyFor(prv.h);
      const R = 110 * sm((s - 2.5) / 5.5), sun = PHASES[phase].sun;
      for (let y = 0; y < HORIZON; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x, dx = x + 0.5 - sun.x, dy = y + 0.5 - sun.y, d2 = dx * dx + dy * dy;
        P[i] = d2 < (R - 2) * (R - 2) ? sky[i] : d2 < R * R ? POOL[sky[i]] : was[i];
      }
      work.n += W * HORIZON * 8;
    } else { P.set(sky); work.n += W * HORIZON; }

    lagoon(T, phase, breeze);

    // ---- the far flock wading along the shore (and at the hour, marching in)
    for (let j = 0; j < 9; j++) {
      const sp = 0.6 + 0.25 * (j % 3), x = ((hash(j, 61) % 220) - sp * T) % 220;
      const xx = x < 0 ? x + 220 : x;
      farBird(P, xx - 30, 42 + (j % 3), -1, frac(T * 0.21 + j * 0.37) < 0.45);
    }
    if (hourShow && s > 1.5 && s < 14) {
      // the whole flock marches in along the shore at double time, heads
      // flagging, then lifts off in a wave and sweeps away over the lagoon
      const cx = 190 - 150 * sm((s - 1.5) / 7.5), mt = march(s, 1, true);
      for (let j = 0; j < 22; j++) {
        const x0 = cx + (j % 11) * 7 + ((j / 11) | 0) * 3.5, y0 = 43 + ((j / 11) | 0) * 2;
        const up = s - (8.6 + (j % 11) * 0.16 + ((j / 11) | 0) * 0.3);
        if (up < 0) farBird(P, x0, y0 - (((mt.step + j) & 1) && mt.p < 0.5 ? 1 : 0), mt.flag ? -1 : 1, false);
        else {
          const x = x0 - 6 - 26 * up - 3 * up * up, y = y0 - 5 - 9 * up - 1.2 * up * up;
          if (x > -12 && y > -6) flyer(P, x, y, -1, 0.3, frac(up * 3.2 + j * 0.13), 0, 0);
        }
      }
    }

    // ---- the four birds: poses
    const mt = march(s, 1, hourShow && s > 2 && s < 12);
    const tau = s >= 56 ? s - 60 : s;                       // time relative to the minute turn
    const Q = [], flyers = [];
    for (let i = 0; i < 4; i++) {
      const S = SLOTS[i];
      const changing = tau < 0 ? cur[i] !== nw[i] : old[i] !== cur[i];
      const G = GLYPHS[+cur[i]];
      const q = { d: +cur[i], x: S.x + mt.sway * S.s, wingT: mt.wing, sway: mt.sway, yB: S.yB - mt.rise * S.s, yB0: S.yB, s: S.s, hs: S.hs, feet: S.feet, k: mt.k, h: mt.h, wet: 0,
        leg: mt.leg, lift: mt.lift, face: 1, open: 0, show: true, run: 0, air: 0 };
      let yawA = G.yaw[0], yawB = G.yaw[1], amp = 1, dip = mt.land;
      if (fl && fl.kind === 0) q.open = bump(fl.t, 0.3, 2.1);
      if (hourShow) q.open = Math.max(q.open, bump(s, 6.2, 8.6));
      q.h += 1.6 * breeze;
      if (changing && tau < 0 && tau > -4) {
        // ---- the old bird leaves: turns, runs, lifts off
        const ready = sm((tau + 2.4) / 0.5);
        const run = tau + 1.8;
        amp = 1 - ready * 0.4;
        yawA = yawB = 0; q.face = 1;
        if (run > 0) {
          const ru = Math.min(run, 1.35) / 1.35;
          q.x += 16 * S.s * ru * ru;
          const rb = run * 5, rk = Math.floor(rb), rp = rb - rk;
          q.leg = rk & 1; q.lift = rp < 0.6 ? sin((rp / 0.6) * Math.PI) * 0.8 : 0; q.run = 1;
          q.open = Math.max(q.open, sm(run / 0.7));
          q.h = 1.2 * sm(run / 0.4);                         // leaning into the run
          // splashes kicked up behind
          for (let j = 0; j < 3; j++) {
            const sp = frac(run * 2.5 + j / 3), sx = q.x + (G.legs[0] - 2 - sp * 9) * S.s, sy = S.feet - 1 - 6 * S.s * sp * (1 - sp) * 4;
            if (sp < 0.9) dab(P, sx, sy, 2, 1);
          }
        }
        const sq = sm((tau + 0.85) / 0.4);
        q.k = mt.k * (1 - ready * 0.05) - 0.72 * sq;
        q.air = 7 * S.s * sm((tau + 0.7) / 0.3);
        q.yB -= q.air;
        if (tau >= -0.45) q.show = false;
      } else if (changing && tau >= 0 && tau < 3) {
        // ---- the new bird has landed: the neck rises into the numeral, wet, and dries
        const r = tau / 0.55;
        q.k = r >= 1 ? mt.k : 0.28 + 0.72 * (1 - (1 - r) * (1 - r)) + 0.06 * bump(r, 0.55, 1);
        q.wet = 1 - sm(tau / 2.6);
        amp = sm((tau - 0.8) / 0.6);
        dip = 0;
      }
      if (amp < 1) { q.lift *= amp; q.h *= amp; if (q.k > 0.99) q.k = 1 - (1 - q.k) * amp; }
      // head: flags to the other side on every step
      const ya = mt.flag ? yawA : yawB, yb = mt.flag ? yawB : yawA;
      q.yaw = amp < 0.5 ? yawA : ya + (yb - ya) * mt.turn;
      const hx = G.head[0], hy = G.head[1];
      q.hx = q.x + hx * S.s + (q.h * (GH - hy)) / GH;
      q.hy = q.yB - S.s * q.k * (GH - hy) + dip * 1.0;
      Q.push(q);

      // ---- flyers: the old bird after lift-off, the new one gliding in
      if (changing) {
        const cx = S.x + 14 * S.s, by = S.yB - 6 * S.s;
        if (tau >= -0.5 && tau < 1.0) {
          const u = (tau + 0.5) / 1.5;
          flyers.push([cx + 16 * S.s + 70 * u + 10 * u * u, by - 9 * S.s - 62 * u ** 1.4, 1, S.s * 0.95, frac(tau * 4.2 + 0.25), 0, 0]);
        }
        if (tau >= -1.05 && tau < 0) {
          const u = (tau + 1.05) / 1.05, e = 1 - (1 - u) * (1 - u);
          flyers.push([cx + 70 - 70 * e, -16 + (by - 3 * S.s + 16) * e, -1, S.s * 0.95, frac(tau * 3.4), sm((u - 0.45) / 0.3), sm((u - 0.7) / 0.3)]);
        }
      }
    }

    // ---- reflections, wings, birds, legs
    for (const q of Q) if (q.show) { reflection(q, T); legs(q, true); }
    for (const q of Q) if (q.show) wings(q, q.open);
    for (const q of Q) if (q.show) bird(q);
    for (const q of Q) if (q.show) legs(q, false);

    // ripple rings from every stamp, and the touchdown splash
    for (let i = 0; i < 4; i++) {
      const q = Q[i], S = SLOTS[i], G = GLYPHS[q.d];
      if (!q.show || q.air > 0.5) continue;
      for (let L = 0; L < 2; L++) {
        const age = mt.p - 0.5 + (L === (mt.leg ^ 1) ? 1 : 0);   // since that foot stamped
        if (age < 0 || age > 1.2) continue;
        const rx = 1.5 + 7 * S.s * age;
        ring(P, q.x + G.legs[L] * S.s, S.feet + 0.5, rx, rx * 0.28, 0, 0, age < 0.6 ? 2 : 1);
      }
      const tau0 = tau >= 0 && tau < 1 && old[i] !== cur[i] ? tau : -1;
      if (tau0 >= 0) {
        const cx = S.x + 14 * S.s;
        ring(P, cx, S.feet + 0.5, 3 + 22 * S.s * tau0, (3 + 22 * S.s * tau0) * 0.25, 0, 0, 2);
        for (let j = 0; j < 7; j++) {
          const a = (j / 6 - 0.5) * 2.4, v = 10 * S.s * (0.7 + 0.3 * ((j * 5) % 3));
          const px = cx + sin(a) * v * tau0 * 2.2, py = S.feet - cos(a) * v * tau0 * 2 + 30 * tau0 * tau0;
          if (py < S.feet && tau0 < 0.7) dab(P, px, py, 2, 2);
        }
      }
    }

    // ---- the flourish fly-over, then the turn's flyers on top
    if (fl && fl.kind === 1) {
      const u = fl.t / 3.2;
      flyer(P, -20 + 200 * u, 5 + 2 * sin(u * 6), 1, 0.42, frac(fl.t * 3.6));
      flyer(P, -38 + 200 * u, 8 + 2 * sin(u * 6 + 1), 1, 0.38, frac(fl.t * 3.6 + 0.4));
    }
    for (const F of flyers) flyer(P, F[0], F[1], F[2], F[3], F[4], F[5], F[6]);

    // ---- pigment to colour
    const buf = g.buf, nt = Math.round(ctx.night * 16);
    if (nt <= 0) for (let i = 0; i < N; i++) buf[i] = LUT[P[i]];
    else if (nt >= 16) for (let i = 0; i < N; i++) buf[i] = LUT_NIGHT[P[i]];
    else for (let i = 0; i < N; i++) buf[i] = (nt > GRAIN[i] ? LUT_NIGHT : LUT)[P[i]];   // the glaze goes on over the dusk minute
    g.cost.px += N;
    g.cost.box += work.n + N * 2;
  },
};
