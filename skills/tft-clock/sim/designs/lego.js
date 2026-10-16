// lego: "Snap". A green baseplate seen from straight above, the time built
// on it in real bricks, and the builder's own hand doing the work.
//
// The camera looks straight down from close by, so height reads as size and
// as the length of a shadow: a brick in the hand is bigger than one on the
// plate, and its shadow slides away from it. Light from a window at the top
// left.
//
// Each minute the hand rebuilds only what changed, and the time is never
// wrong (lego-plan.js): a few seconds before :00 it pulls the bricks that
// break each digit about to change, so at :00 those slots read as no digit;
// then it builds the new digits in an order that never spells another one.
// A brick of the right size is carried (turned in the air if it has to
// stand the other way) and pressed into its new place, or set aside at the
// edge of the plate for later; the rest are flicked into the tub below the
// glass, and missing ones fetched from it. Bricks are
// coloured by length, as from a sorted tub (1x1 orange, 1x2 yellow, 1x3
// white, 1x4 red, 1x6 blue), so you can follow one brick across a turn.
// Between turns the hand rests at the edge of the plate and drums its
// fingers; at about :55 it reaches in to start breaking.
//
// Hard pixels for everything snapped to the grid (the plate is a grid);
// anti-aliasing for everything in the air and for the hand, which glide.

import { ease, clamp, rand } from '../js/kit.js';
import { minutePlan, boardAt, REST, COLON, P, OX, OY } from './lego-plan.js';
import { makeBase, gridShadow, gridBrick, floatShadow, floatBrick, handShadow, drawHand } from './lego-art.js';

const base = makeBase();
const EASE = { io: ease.inOutCubic, in: ease.inQuad, out: ease.outQuad, lin: ease.linear };
const travel = (d) => 0.16 + d / 240;

// ------------------------------------------------------------ the hand's whole minute

const tracks = new Map();
/**
 * Hand keyframes for second 0..60 of minute mk: the end of this minute's
 * build, a rest at the edge of the plate, and the start of the next turn
 * (which begins a few seconds before the next :00).
 */
function minuteTrack(mk) {
  let tr = tracks.get(mk);
  if (tr) return tr;
  const plan = minutePlan(mk), next = minutePlan(mk + 1);
  const kf = plan.kf.map((k) => ({ ...k }));
  let last = kf[kf.length - 1];
  const push = (t, p, e = 'io') => { last = { ...last, ...p, t, ease: e }; kf.push(last); };
  const n0 = next.kf[0], nStart = 60 + n0.t;
  let restAt = last.t + travel(Math.hypot(REST.x - last.x, REST.y - last.y));
  let goAt = nStart - travel(Math.hypot(n0.x - REST.x, n0.y - REST.y)) - 0.3;
  if (goAt > restAt + 0.6) {
    push(restAt, { ...REST });
    push(goAt, {}, 'lin');
  } else restAt = goAt = last.t;
  for (const k of next.kf) kf.push({ ...k, t: k.t + 60 });
  tr = { plan, next, kf, restAt, goAt };
  if (tracks.size > 8) tracks.delete(tracks.keys().next().value);
  tracks.set(mk, tr);
  return tr;
}

function poseAt(kf, s) {
  let i = 0;
  while (i < kf.length - 2 && kf[i + 1].t <= s) i++;
  const a = kf[i], b = kf[i + 1];
  if (!b || s <= a.t) return { ...a };
  const u = clamp((s - a.t) / (b.t - a.t || 1), 0, 1), e = EASE[b.ease](u);
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  const arc = d > 8 ? Math.sin(Math.PI * u) * Math.min(16, d * 0.14) : 0;
  return {
    x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e,
    z: a.z + (b.z - a.z) * e + arc, open: a.open + (b.open - a.open) * e,
  };
}

// Drumming fingers at rest: little-to-index rolls at uneven intervals.
function drum(mk, s, from, to) {
  const lift = [0, 0, 0, 0];
  if (s < from + 0.4 || s > to) return lift;
  let t = from + 0.8 + rand(mk, 1) * 1.5;
  for (let n = 0; t < to - 0.5 && n < 40; n++) {
    const kind = rand(mk, n, 7);
    for (let i = 0; i < 4; i++) {
      const ti = kind < 0.75 ? t + i * 0.085 : t + (i === 3 ? 0 : 99); // a roll, or one index tap
      const v = (s - ti) / 0.2;
      if (v > 0 && v < 1) lift[i] = Math.max(lift[i], Math.sin(Math.PI * v));
    }
    t += 1.3 + rand(mk, n, 3) * 2.6;
  }
  return lift;
}

export default {
  name: 'Snap',
  blurb: 'A baseplate from above: the time in real bricks, and a hand that pulls, turns and presses them into the next minute.',
  fps: 60,

  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, mk = f.minuteKey;
    ctx.lcd.backlight(1 - 0.7 * ctx.night);
    const tr = minuteTrack(mk);
    const both = [[tr.plan, 0], [tr.next, 60]];

    // What lies on the plate: the digits, and any brick set aside.
    const placed = boardAt(mk, s);
    const colon = COLON.map(([c, r]) => ({ c, r, w: 1, h: 1 }));

    // The hand.
    const pose = poseAt(tr.kf, s);
    pose.lift = drum(mk, s, tr.restAt, tr.goAt);
    if (s > tr.restAt && s < tr.goAt) pose.x += Math.sin(s * 0.9) * 0.8;

    // What is in the air: a brick in the hand, bricks flicked away.
    const air = [];
    for (const [p, off] of both) {
      const held = p.held.find((h) => s >= h.t0 + off && s < h.t1 + off);
      if (held) {
        const u = ease.inOutCubic(clamp((s - held.t0 - off) / Math.max(0.01, held.t1 - held.t0 - 0.2), 0, 1));
        air.push({ b: held.brick, x: pose.x, y: pose.y, z: Math.max(0, pose.z - 1.5), a: held.a0 + (held.a1 - held.a0) * u });
      }
      for (const ts of p.tossed) {
        const dt = s - ts.t0 - off;
        if (dt < 0 || dt > 0.8) continue;
        air.push({ b: ts.brick, x: ts.x + ts.vx * dt, y: ts.y + ts.vy * dt, z: 16 + 140 * dt - 120 * dt * dt, a: ts.a0 + ts.spin * dt });
      }
    }

    g.draw(base, 0, 0);
    for (const b of placed) gridShadow(g, b);
    for (const b of colon) gridShadow(g, b);
    for (const b of placed) gridBrick(g, b);
    for (const b of colon) gridBrick(g, b, 0xf4f4f4);
    for (const o of air) floatShadow(g, o.b, o.x, o.y, o.z, o.a);
    handShadow(g, pose);
    for (const o of air) floatBrick(g, o.b, o.x, o.y, o.z, o.a);
    drawHand(g, pose);

    // The click: a few ticks off the corners of a brick just pressed home.
    for (const [p, off] of both)
      for (const e of p.events) {
        const dt = s - e.t - off;
        if (e.op !== 'add' || dt < 0 || dt > 0.22) continue;
        const b = e.b;
        const x0 = OX + b.c * P, y0 = OY + b.r * P, x1 = x0 + b.w * P - 1, y1 = y0 + b.h * P - 1;
        const d = 1 + Math.round(dt * 14), l = 2, a = 1 - dt / 0.22;
        for (const [cx, cy, sx, sy] of [[x0, y0, -1, -1], [x1, y0, 1, -1], [x0, y1, -1, 1], [x1, y1, 1, 1]]) {
          g.line(cx + sx * d, cy + sy * d, cx + sx * (d + l), cy + sy * (d + l), 0xffffff, { a });
        }
      }

    // Late at night only the desk lamp: warm in the middle, falling off.
    if (ctx.night > 0) g.radial(70, 26, 120, [[0, 0xffd9a0], [0.45, 0x806040], [1, 0x070a18]], { a: 0.42 * ctx.night });
  },
};
