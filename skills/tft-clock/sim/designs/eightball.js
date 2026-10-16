// eightball: "Outlook Good".
//
// The screen is the window of a Magic 8-Ball, held close. Behind the glass,
// in ink-dark blue liquid, the twenty-sided die presses one triangular face
// against the window, and the raised white type on that face is the answer:
// "SIGNS POINT TO / 10:09", "IT IS / 10:10 / WITHOUT A DOUBT". The die is a
// real icosahedron, drawn as flat facets: the face on the glass is bright,
// its neighbours fall away into the ink and darken with depth; the type is
// legible only where the die touches the window, as on the toy.
//
// Nothing ticks. The die floats: it drifts, tilts a few degrees, eases off
// the glass and back, so the answer breathes in and out of the murk; flecks
// hang in the liquid and bubbles cling to the window and creep to the rim.
//
// The minute: the die rolls over one edge of its face (a 41.8-degree turn of
// the solid about that edge): the old answer tips away into the dark before
// :00, the neighbouring face swings up onto the glass and its letters surface
// just after. Triangles alternate, point-down then point-up, so the layout
// flips each minute, and the edge it rolls over is chosen each minute.
//
// The hour: someone shakes the ball. The window jolts, a cloud of bubbles
// swirls up, the die tumbles away into the deep and comes back with the
// toy's own non-answer ("ASK AGAIN LATER", "REPLY HAZY, TRY AGAIN"); a
// second shake, another tumble, and the new hour surfaces. Never a wrong
// number: the non-answers carry no time, and every face's type is gated to
// its own side of the minute.
//
// Palette: the toy. Ink #050820, the die's royal blue lit and in shadow,
// type white with a blue bleed, black plastic with one cold highlight.
// Anti-aliased throughout: everything turns and floats by fractions of a
// pixel. 60 fps.

import { sin, cos, clamp, lerp, progress, ease, rand, hash, mix, clockFields, previousMinute, noise2, TAU } from '../js/kit.js';
import {
  VERTS, FACES, FACE_N, FACE_C, EDGES, EDGE_F, REST, ROLLS, mmul, apply, rotSC, frontFace, faceFrame,
} from './eightball-geo.js';
import { layoutLine, layoutTime } from './eightball-type.js';

const W = 160, H = 80;
const SC = 70;            // px per unit: edge 2 units = 140 px
const WX = 80, WY = 40, WR = 76; // the window
const CY = [46, 34];      // die centre height for a down / up triangle at rest

// ---------------------------------------------------------------- colour
const INK = 0x050820, INK2 = 0x142070, INK3 = 0x2a2080;
const DIE_LIT = 0x2b46d4, DIE_DARK = 0x101a70;
const TYPE = 0xf2f5ff, BLEED = 0x6f88ff;
const PLASTIC = 0x09090c, PLASTIC_HI = 0x2c3040, GLINT = 0xc9cfe2, BEVEL = 0x1a1f3c;
const BUBBLE = 0xa8b6ff, FLECK = 0x6176e0;

// ---------------------------------------------------------------- the answers
// Point-down faces have a long line above the time, point-up faces a long
// line below it: each list fits its triangle.
const SAY_DOWN = [
  ['SIGNS POINT TO', ''], ['IT IS DECIDEDLY', ''], ['MY SOURCES SAY', ''], ['WITHOUT A DOUBT', ''],
  ['YOU MAY RELY ON', ''], ['AS I SEE IT, IT IS', ''], ['OUTLOOK GOOD:', ''], ['IT IS', 'DEFINITELY'],
  ['IT IS CERTAINLY', ''], ['CONCENTRATE. IT IS', ''], ['THE ANSWER IS', ''], ['IT IS', 'MOST LIKELY'],
];
const SAY_UP = [
  ['IT IS', 'WITHOUT A DOUBT'], ['IT IS', 'DECIDEDLY SO'], ['IT IS', 'YOU MAY RELY ON IT'], ['IT IS', 'SIGNS POINT TO YES'],
  ['AS I SEE IT', 'YES'], ['IT IS', 'MOST LIKELY'], ['OUTLOOK:', 'VERY GOOD'], ['IT IS', 'DEFINITELY'],
  ['MY REPLY:', 'IT IS CERTAIN'], ['IT IS', 'YES, DEFINITELY'],
];
const HAZY = [
  ['ASK AGAIN', 'LATER'], ['REPLY HAZY,', 'TRY AGAIN'], ['BETTER NOT', 'TELL YOU NOW'],
  ['CANNOT', 'PREDICT NOW'], ['CONCENTRATE', 'ASK AGAIN'],
];

// ---------------------------------------------------------------- type, laid out once per text
const T_CAP = 7, T_STROKE = 1.35, T_TRACK = 1.2;
const D_W = 14, D_STROKE = 3.6, D_GAP = 3;
const H_CAP = 9, H_STROKE = 1.7, H_TRACK = 1.6;
const cache = new Map();
function timeText(par, hhmm, minuteKey) {
  const key = `t${par}${hhmm}${minuteKey % 997}`;
  let v = cache.get(key);
  if (v) return v;
  const list = par === 0 ? SAY_DOWN : SAY_UP;
  const [top, bot] = list[hash(minuteKey, 7) % list.length];
  const s = par === 0 ? -1 : 1;
  const small = [];
  if (top) small.push(...layoutLine(top, T_CAP, s < 0 ? -35 : -6.5, T_TRACK, T_STROKE).strokes);
  if (bot) small.push(...layoutLine(bot, T_CAP, s < 0 ? 6.5 : 34, T_TRACK, T_STROKE).strokes);
  const big = layoutTime(hhmm, D_W, s < 0 ? -14 : 15, D_GAP, D_STROKE).chars.flatMap((c) => c.strokes);
  v = { groups: [{ strokes: big, w: D_STROKE }, { strokes: small, w: T_STROKE }] };
  if (cache.size > 64) cache.clear();
  cache.set(key, v);
  return v;
}
function hazyText(par, hourKey) {
  const key = `h${par}${hourKey % 5}`;
  let v = cache.get(key);
  if (v) return v;
  const [a, b] = HAZY[hourKey % HAZY.length];
  const s = par === 0 ? -1 : 1;
  const strokes = [
    ...layoutLine(a, H_CAP, s < 0 ? -27 : 11, H_TRACK, H_STROKE).strokes,
    ...layoutLine(b, H_CAP, s < 0 ? -11 : 27, H_TRACK, H_STROKE).strokes,
  ];
  v = { groups: [{ strokes, w: H_STROKE }] };
  cache.set(key, v);
  return v;
}

// ---------------------------------------------------------------- small rotations
const rx = (a) => rotSC([1, 0, 0], sin(a), cos(a));
const ry = (a) => rotSC([0, 1, 0], sin(a), cos(a));
const rz = (a) => rotSC([0, 0, 1], sin(a), cos(a));
const parOf = (f) => f.minuteKey & 1;

// ---------------------------------------------------------------- the sequence at time t
// Returns the die's pose, where it is, and which faces carry which type.
function sequence(ctx) {
  const f = ctx.fields, sec = f.sec, date = ctx.date;
  const pose = { M: REST[parOf(f)], cy: CY[parOf(f)], zoff: 0, texts: [], shake: 0, burst: null };
  const restText = (fields, gate = 1) => {
    const p = parOf(fields), M = REST[p];
    return { frame: faceFrame(M, frontFace(M)), text: timeText(p, `${fields.hh}:${fields.mm}`, fields.minuteKey), gate };
  };

  let oldF, newF, u = null;
  if (sec >= 57) {
    const next = clockFields(new Date(date.getTime() + 60000));
    if (next.m === 0 || sec >= 59) { oldF = f; newF = next; u = sec - 60; }
  } else if (sec < 7) {
    if (f.m === 0 || sec < 1) { oldF = previousMinute(date); newF = f; u = sec; }
  }
  if (u === null) { pose.texts.push(restText(f)); return pose; }

  const p0 = parOf(oldF), p1 = parOf(newF);
  if (newF.m !== 0) {
    // ------------------------------------------------ the minute: roll over an edge
    const roll = ROLLS[p0][hash(newF.minuteKey, 3) % 3];
    const q = ease.inOutCubic(progress(u, -1, 1));
    const a = roll.angle * q;
    pose.M = mmul(rotSC(roll.axis, sin(a), cos(a)), REST[p0]);
    pose.cy = lerp(CY[p0], CY[p1], q);
    const old = restText(oldF, 1 - progress(u, -0.85, -0.12));
    const nw = restText(newF, progress(u, 0.08, 0.7));
    nw.frame = faceFrame(roll.end, frontFace(roll.end));
    pose.texts.push(old, nw);
    return pose;
  }

  // ------------------------------------------------ the hour: shake, tumble, ask again
  pose.hour = true;
  const hk = Math.floor(newF.minuteKey / 60);
  const sx = hash(hk, 11) & 1 ? 1 : -1, sy = hash(hk, 12) & 1 ? 1 : -1;
  const tumble = (u0, u1, Mstart, psiEnd, s1, s2) => {
    const q = ease.inOutCubic(progress(u, u0, u1));
    const b = Math.sin(Math.PI * progress(u, u0, u1));
    const R = mmul(rz(psiEnd * q), mmul(rx(TAU * s1 * q), mmul(ry(TAU * s2 * q), Mstart)));
    return { R, q, zoff: 300 * b * b };
  };
  const T1 = [-2.8, 0.6], T2 = [2.6, 6.0];
  const hazy = hazyText(p1, hk);
  const hazyFrame = faceFrame(REST[p1], frontFace(REST[p1]));
  if (u < T1[1]) {
    const tm = tumble(T1[0], T1[1], REST[p0], Math.PI / 3 + TAU, sx, sy);
    Object.assign(pose, { M: tm.R, zoff: tm.zoff, cy: lerp(CY[p0], CY[p1], tm.q) });
    pose.texts.push(restText(oldF, 1 - progress(u, -2.4, -1.6)));
    pose.texts.push({ frame: faceFrame(mmul(rz(Math.PI / 3), REST[p0]), frontFace(mmul(rz(Math.PI / 3), REST[p0]))), text: hazy, gate: progress(u, 0, 0.5) });
  } else if (u < T2[0]) {
    pose.M = REST[p1];
    pose.texts.push({ frame: hazyFrame, text: hazy, gate: 1 });
  } else {
    const tm = tumble(T2[0], T2[1], REST[p1], (2 * Math.PI) / 3 + TAU, -sy, sx);
    Object.assign(pose, { M: tm.R, zoff: tm.zoff });
    pose.texts.push({ frame: hazyFrame, text: hazy, gate: 1 - progress(u, 2.9, 3.6) });
    const end = mmul(rz((2 * Math.PI) / 3), REST[p1]);
    const nw = restText(newF, progress(u, 4.4, 5.2));
    nw.frame = faceFrame(end, frontFace(end));
    pose.texts.push(nw);
  }
  // two shakes, each a decaying jolt
  for (const s0 of [T1[0], T2[0]]) {
    const v = u - s0;
    if (v >= 0 && v < 1.6) pose.shake = Math.max(pose.shake, (1 - v / 1.6) ** 2);
    if (v >= -0.2 && v < 3.6) pose.burst = { age: v, seed: hk * 2 + (s0 === T1[0] ? 0 : 1), n: 34, spin: 1 };
  }
  return pose;
}

// ---------------------------------------------------------------- the frame
export default {
  name: 'Outlook Good',
  blurb: 'A Magic 8-Ball window: the icosahedral die rolls a new face onto the glass each minute and its raised type gives the time; on the hour it is shaken, says "ask again later", and is shaken again.',
  fps: 60,

  frame(g, ctx) {
    const T = ctx.date.getTime() / 1000 - 1.7e9;
    ctx.lcd.backlight(1 - 0.65 * ctx.night);
    const P = sequence(ctx);
    // a few bubbles shaken loose by each minute's roll
    const s = ctx.fields.sec, ur = s >= 59 ? s - 60 : s;
    if (!P.hour && ur > -0.6 && ur < 3.2) P.burst = { age: ur + 0.6, seed: (ctx.fields.minuteKey + (s >= 59 ? 1 : 0)) * 2 + 7, n: 9, spin: 0.4 };

    // the hand on the ball: the whole window jolts; the liquid lags behind
    const shx = P.shake * 5 * sin(T * 47), shy = P.shake * 3 * sin(T * 39 + 1);
    const slx = P.shake * 7 * sin(T * 47 - 1.2), sly = P.shake * 4 * sin(T * 39 - 0.4);

    // the float: a slow drift, tilt and bob, always on
    const W3 = mmul(rz(0.03 * sin(T * 0.21) + 0.016 * sin(T * 0.13 + 1)),
      mmul(rx(0.035 * sin(T * 0.37 + 2)), ry(0.045 * sin(T * 0.29 + 4))));
    const M = mmul(W3, P.M);
    // the die leans on the glass: it pivots about the face it presses there,
    // so the wobble tilts the answer without sliding it about
    const fc = FACE_C[frontFace(P.M)], c0 = apply(P.M, fc), c1 = apply(M, fc);
    const gap = 0.6 + 1.6 * (0.5 + 0.5 * sin(T * 0.83));
    const k = 220 / (220 + P.zoff);
    const cx = WX + 1.6 * sin(T * 0.17) + slx + (c0[0] - c1[0]) * SC;
    const cy = P.cy + 1.1 * sin(T * 0.23 + 2) + sly + (c0[1] - c1[1]) * SC;

    // the die's vertices in the world
    const vw = VERTS.map((v) => apply(M, v));
    let zmin = Infinity;
    for (const v of vw) zmin = Math.min(zmin, v[2]);
    const zc = gap - zmin * SC + P.zoff;
    const scr = (v) => [WX + shx + (cx - WX + v[0] * SC) * k, WY + shy + (cy - WY + v[1] * SC) * k];
    const depth = (v) => v[2] * SC + zc;
    const fog = (d) => 1 - Math.exp(-Math.max(0, d - P.zoff) / 48 - P.zoff / 420);

    // the liquid itself, only seen when the die is far from the glass
    if (P.zoff > 4) {
      const vis = clamp(P.zoff / 120, 0, 1);
      g.coarse((x, y) => mix(INK, mix(INK2, INK3, noise2(x / 30 + T * 0.4, y / 20, 5)), vis * noise2(x / 18 - T * 0.7, y / 14 + T * 0.2, 9)), { cell: 8 });
    } else g.clear(INK);

    // facets
    const faceCol = new Array(20).fill(-1);
    for (let i = 0; i < 20; i++) {
      const n = apply(M, FACE_N[i]);
      if (n[2] > -0.02) continue;
      const lit = clamp(-n[2] * 0.75 + (-n[1] * 0.2 - n[0] * 0.12), 0, 1);
      const c = mix(mix(DIE_DARK, DIE_LIT, lit), INK, fog(depth(apply(M, FACE_C[i]))));
      faceCol[i] = c;
      g.fillPolygon(FACES[i].map((j) => scr(vw[j])), c, { aa: true });
    }
    // rounded edges catch a little light where two visible facets meet
    for (let e = 0; e < EDGES.length; e++) {
      const [fa, fb] = EDGE_F[e];
      if (faceCol[fa] < 0 || faceCol[fb] < 0) continue;
      const [p, q] = EDGES[e];
      const a = scr(vw[p]), b = scr(vw[q]);
      const d = (depth(vw[p]) + depth(vw[q])) / 2;
      g.thickLine(a[0], a[1], b[0], b[1], 1.1 * k, mix(faceCol[fa], 0x9fb2ff, 0.35), { aa: true, a: 0.7 * (1 - fog(d)) });
    }

    // the type, raised on its face, visible only near the glass
    for (const tx of P.texts) {
      if (tx.gate <= 0.001) continue;
      const fr = tx.frame, n = apply(M, FACE_N[fr.face]);
      const facing = clamp((-n[2] - 0.55) / 0.35, 0, 1);
      if (facing <= 0) continue;
      const toWorld = ([u, v]) => apply(M, [fr.c[0] + (u * fr.u[0] + v * fr.v[0]) / SC, fr.c[1] + (u * fr.u[1] + v * fr.v[1]) / SC, fr.c[2] + (u * fr.u[2] + v * fr.v[2]) / SC]);
      for (const pass of [0, 1]) {
        for (const grp of tx.text.groups) {
          for (const s of grp.strokes) {
            const pw = s.map(toWorld);
            let dsum = 0;
            for (const p of pw) dsum += depth(p);
            const a = tx.gate * facing * Math.exp(-Math.max(0, dsum / pw.length - 0.5) / 18) * (P.zoff > 0 ? Math.exp(-P.zoff / 40) : 1);
            if (a < 0.02) continue;
            const pts = pw.map(scr);
            if (pass === 0) g.stroke(pts, (grp.w + 1.6) * k, BLEED, { aa: true, a: 0.32 * a });
            else g.stroke(pts, grp.w * k, TYPE, { aa: true, a: 0.92 * a });
          }
        }
      }
    }

    // flecks suspended in the liquid
    for (let i = 0; i < 26; i++) {
      const x = (rand(i, 1) * 150 + 5 + T * (0.6 + rand(i, 2)) + 4 * sin(T * 0.3 + i) + slx * 1.5) % 160;
      const y = (rand(i, 3) * 76 + 2 + 3 * sin(T * 0.21 + i * 2) + T * 0.35 * (rand(i, 4) - 0.5) + sly * 1.5 + 800) % 80;
      g.pixel(Math.floor(x + shx), Math.floor(y + shy), FLECK, { a: 0.18 + 0.3 * rand(i, 5) });
    }

    // bubbles on the inside of the window, creeping out to the rim
    const bubble = (x, y, r, a) => {
      if (a <= 0.02 || r < 0.4) return;
      if ((x - WX) ** 2 + (y - WY) ** 2 > (WR - r - 1) ** 2) return;
      if (r < 1.1) { g.fillCircle(x, y, r + 0.2, BUBBLE, { aa: true, a: 0.55 * a }); return; }
      g.ring(x, y, r - 0.8, r + 0.15, BUBBLE, { aa: true, a: 0.7 * a });
      g.fillCircle(x, y, r - 0.6, INK, { aa: true, a: 0.18 * a });
      g.pixel(Math.floor(x - r * 0.45), Math.floor(y - r * 0.45), 0xffffff, { a: 0.8 * a });
    };
    for (let i = 0; i < 7; i++) {
      const per = 11 + 9 * rand(i, 20), ph = rand(i, 21) * per;
      const cyc = Math.floor((T + ph) / per), q = ((T + ph) % per) / per;
      const ang = rand(i, cyc, 22) * TAU, r0 = 10 + 50 * rand(i, cyc, 23);
      const rad = r0 + q * 18;
      const x = WX + shx + cos(ang) * rad * 1.15 + 1.5 * sin(T * 0.9 + i);
      const y = WY + shy + sin(ang) * rad * 0.6;
      const sz = 0.8 + 1.8 * rand(i, cyc, 24);
      bubble(x, y, sz * clamp(q * 8, 0, 1), clamp((1 - q) * 6, 0, 1));
    }
    if (P.burst) {
      const { age, seed, n, spin } = P.burst;
      for (let i = 0; i < n; i++) {
        const st = rand(seed, i, 30) * 0.9, v = age - st;
        if (v < 0 || v > 2.6) continue;
        const ang = rand(seed, i, 31) * TAU + v * spin * (2.2 + rand(seed, i, 32)) * (i & 1 ? 1 : -1);
        const rad = 6 + rand(seed, i, 33) * 30 + v * 16;
        const x = WX + shx + cos(ang) * rad * 1.6, y = WY + shy + sin(ang) * rad * 0.75;
        bubble(x, y, (0.7 + 2.2 * rand(seed, i, 34)) * clamp(v * 5, 0, 1), clamp((2.6 - v) * 1.5, 0, 1));
      }
    }

    // the window: glass glare, a bevelled rim, the black ball round it
    const ox = WX + shx, oy = WY + shy;
    g.arc(ox, oy, WR - 10, WR - 6, 5.05, 5.85, 0xffffff, { aa: true, a: 0.06 });
    g.ring(ox, oy, WR - 3, WR - 0.5, INK, { aa: true, a: 0.45 });
    g.ring(ox, oy, WR - 0.5, WR + 1.5, BEVEL, { aa: true });
    g.ring(ox, oy, WR + 1.5, 130, PLASTIC, { aa: true });
    g.arc(ox, oy, WR + 4, WR + 7, 4.95, 5.7, PLASTIC_HI, { aa: true });
    g.arc(ox, oy, WR + 4.6, WR + 6.2, 5.2, 5.38, GLINT, { aa: true, a: 0.85 });
    g.arc(ox, oy, WR + 4, WR + 6, 1.9, 2.25, PLASTIC_HI, { aa: true, a: 0.6 });
  },
};
