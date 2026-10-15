// Low Tide: the crab (and, on the hour, its family). Its day is a keyframe
// list made once per minute from the turn schedule: flee the wave, build the
// new digit part by part, then nap in the burrow, pat the castles, wave at
// gulls, and wait at the water's edge for the next one.
import * as kit from '../js/kit.js';
import { GW, GH, GROUND, SLOTS, BURROW, over, C } from './sandcastle-common.js';
import { glyph } from './sandcastle-font.js';
import { partProgress, partX } from './sandcastle-castle.js';

const MOUTH = [BURROW.x + 0.5, GROUND], MID = [BURROW.x + 4, GROUND + 6.5], DEN = [BURROW.cx, BURROW.cy + 2.7];
const SHELL = [C('#ff4a1a'), C('#ff7a2a'), C('#e8341c'), C('#ff5a48')];
const EYE = C('#ffffff');

const fleeX = (T) => (T.hour ? null : SLOTS[T.c].x - 7);
const nightAt = (Mt) => { const h = new Date(Mt * 1000).getHours(); return h >= 20 || h < 6; };

function plan(A, B) {
  const kfs = [], crews = [];
  const mk = () => { const k = []; let t = 0, x = 0, y = 0; return {
    k, at(tt, xx, yy, act) { t = tt; x = xx; y = yy; k.push([t, x, y, act]); },
    go(xx, yy, speed, act = 'walk') { t += Math.hypot(xx - x, yy - y) / speed; x = xx; y = yy; k.push([t, x, y, act]); },
    hold(tt, act) { if (tt > t) { t = tt; k.push([t, x, y, act]); } },
    get t() { return t; },
  }; };
  const buildPath = (P, b) => {
    const S = SLOTS[b.k], g = glyph(b.d, S.size), n = g.parts.length, sl = (b.dur * 0.82) / n, W = S.size === 'H' ? 20 : 16;
    const cl = (x) => kit.clamp(x, S.x + 2, S.x + W - 2);
    for (let i = 0; i < n; i++) {
      const ts = b.start + i * sl;
      P.at(Math.max(P.t + 0.05, ts - 0.12), cl(partX(g, b.k, i, 0)), GROUND, 'build');
      P.at(Math.max(P.t + 0.05, ts + sl * 0.95), cl(partX(g, b.k, i, 1)), GROUND, 'build');
    }
    P.hold(b.end + 0.7, 'cheer');
  };
  const intoBurrow = (P, sp = 14) => { P.go(MOUTH[0], MOUTH[1], sp); P.go(MID[0], MID[1], sp * 0.6); P.go(DEN[0], DEN[1], sp * 0.6); };
  const outOfBurrow = (P, sp = 12) => { P.go(MID[0], MID[1], sp); P.go(MOUTH[0], MOUTH[1], sp); };
  const H = mk();
  if (!A.hour) {
    H.at(-1, fleeX(A), GROUND, 'flee');
    for (const b of A.builds) { H.go(kit.clamp(H.k[H.k.length - 1][1], 0, GW), GROUND, 40, 'walk'); buildPath(H, b); }
  } else {
    A.builds.forEach((b, i) => {
      const P = i === A.builds.length - 1 ? H : mk();
      P.at(-1, DEN[0], DEN[1], 'sleep');
      P.hold(0.35 + 0.18 * (A.builds.length - 1 - i), 'idle');
      outOfBurrow(P, 16);
      P.go(SLOTS[b.k].x + 3, GROUND, 45);
      buildPath(P, b);
      P.hold(A.fanfare + 0.2, 'cheer');
      P.hold(A.fanfare + 2.8, 'dance');
      if (P !== H) { intoBurrow(P, 22); crews.push({ k: P.k, s: 0.8, col: SHELL[1 + (i % 3)], gone: P.t }); }
    });
  }
  const night = nightAt(A.Mt);
  const v = Math.floor(kit.hash((A.Mt / 60) % 9973, 77) * 3);
  const endT = B.hour ? 56.2 : 57.3;
  if (night) {
    intoBurrow(H, 10); H.hold(B.hour ? 61 : 56.6, 'sleep');
    if (!B.hour) { outOfBurrow(H, 8); H.go(fleeX(B), GROUND, 30, 'walk'); }
  } else {
    const shore = () => { H.go(93, GROUND, 14); H.hold(endT, 'watch'); };
    const nap = (until) => { intoBurrow(H, 14); H.hold(until, 'idle'); outOfBurrow(H, 12); };
    if (v === 0) { nap(20 + 6 * kit.hash((A.Mt / 60) % 9973, 5)); H.hold(H.t + 0.3, 'walk'); H.hold(32, 'wave'); shore(); }
    else if (v === 1) { H.go(93, GROUND, 14); H.hold(22, 'watch'); H.go(24.5, GROUND, 14); H.hold(36, 'pat'); shore(); }
    else { H.go(24.5, GROUND, 14); H.hold(16, 'pat'); H.go(MOUTH[0], GROUND, 14); H.hold(25, 'wave'); nap(40); shore(); }
    if (B.hour) intoBurrow(H, 34);
    else H.go(fleeX(B), GROUND, 22, 'flee');
  }
  H.hold(61, B.hour ? 'sleep' : 'flee');
  kfs.push({ k: H.k, s: 1.1, col: SHELL[0], gone: 1e9 });
  return kfs.concat(crews);
}

const plans = new Map();
export function crabsAt(now, sec, A, B) {
  let P = plans.get(A.Mt);
  if (!P) { P = plan(A, B); plans.set(A.Mt, P); if (plans.size > 4) plans.delete(plans.keys().next().value); }
  const out = [];
  for (const c of P) {
    const k = c.k;
    let i = 0;
    while (i + 1 < k.length && k[i + 1][0] <= sec) i++;
    const a = k[i], b = k[Math.min(i + 1, k.length - 1)];
    let x = a[1], y = a[2], act = a[3], moving = false;
    if (b !== a && sec > a[0] && (b[1] !== a[1] || b[2] !== a[2])) {
      const u = kit.clamp((sec - a[0]) / Math.max(1e-3, b[0] - a[0])), e = 0.5 * u + 0.5 * kit.ease.inOut(u);
      x = kit.lerp(a[1], b[1], e); y = kit.lerp(a[2], b[2], e); moving = true; act = b[3] === 'build' ? 'build' : b[3] === 'flee' ? 'flee' : 'walk';
    }
    const fade = 1 - kit.smoothstep(c.gone - 0.6, c.gone, sec);
    if (fade <= 0) continue;
    out.push({ x, y, s: c.s, col: c.col, act, moving, alpha: fade, under: y > GROUND + 0.5 });
  }
  return out;
}

/** Draw one crab: body, eye stalks, two claws, six legs. (x, y) is between its feet. */
export function drawCrab(E, now, c) {
  const s = c.s, ph = now * 1.0 + c.x * 0.3;
  let lift = [0.2, 0.2], snip = 0.3 + 0.3 * Math.sin(now * 3 + c.x), bob = 0, sleep = c.act === 'sleep';
  if (c.act === 'build' || c.act === 'pat') { const f = c.act === 'build' ? 13 : 7; lift = [0.5 + 0.5 * Math.sin(now * f), 0.5 - 0.5 * Math.sin(now * f)]; snip = 0.6; }
  else if (c.act === 'wave' || c.act === 'cheer') lift = [0.85 + 0.15 * Math.sin(now * 6), 0.85 + 0.15 * Math.sin(now * 6 + 2)];
  else if (c.act === 'flee') lift = [1, 1];
  else if (c.act === 'dance') { lift = [0.9, 0.9]; bob = -Math.abs(Math.sin(now * 7 + c.x)) * 2.2; }
  else if (c.act === 'watch') lift = [0.15 + 0.5 * Math.max(0, Math.sin(now * 0.9)), 0.15 + 0.5 * Math.max(0, Math.sin(now * 0.9 + 0.6))];
  if (sleep) lift = [0, 0];
  const x = c.x, y = c.y + bob, breathe = 0.12 * Math.sin(now * 2.2);
  const walk = c.moving ? c.x * 1.6 : 0;
  const L = (0.22 + 0.78 * E.lev) * (c.under ? 0.55 : 1) * (sleep ? 0.7 : 1);
  const shell = kit.scale(c.col, L), claw = kit.scale(kit.mix(c.col, [1, 0.75, 0.3], 0.45), L), leg = kit.scale(c.col, L * 0.7);
  const bx = x, by = y - 2.9 * s + breathe, rx = 3.7 * s, ry = 2.05 * s;
  const arms = [-1, 1].map((d, j) => { const cx = x + d * 5.2 * s, cy = y - 4.2 * s - lift[j] * 2.8 * s; return [x + d * 3.1 * s, y - 2.8 * s, cx, cy, d]; });
  const legs = [];
  for (const d of [-1, 1]) for (let i = 0; i < 3; i++) {
    const sw = c.moving ? 0.7 * s * Math.sin(walk + i * 2.1 + (d > 0 ? Math.PI : 0)) : 0;
    const hx = x + d * (1.4 + 0.8 * i) * s, hy = y - 2.3 * s, kx = x + d * (3 + 0.9 * i) * s + sw * 0.5, ky = y - 2.6 * s - (c.moving ? 0.5 * s * Math.max(0, Math.sin(walk + i * 2.1 + (d > 0 ? Math.PI : 0))) : 0);
    legs.push([hx, hy, kx, ky], [kx, ky, x + d * (3.6 + 1.0 * i) * s + sw, y - 0.2]);
  }
  const eyeY = sleep ? by - 1.6 * s : y - 6.9 * s + 0.2 * Math.sin(now * 1.7 + c.x);
  const eyes = [-1, 1].map((d) => [x + d * 1.3 * s, by - 1.4 * s, x + d * 1.7 * s, eyeY]);
  const X0 = Math.max(0, Math.floor(x - 7.5 * s)), X1 = Math.min(GW - 1, Math.ceil(x + 7.5 * s));
  const Y0 = Math.max(0, Math.floor(y - 9 * s)), Y1 = Math.min(GH - 1, Math.ceil(y + 0.5));
  for (let py = Y0; py <= Y1; py++) for (let px = X0; px <= X1; px++) {
    const qx = px + 0.5, qy = py + 0.5, P = py * GW + px;
    let dl = 9;
    for (const l of legs) dl = Math.min(dl, kit.segDist(qx, qy, l[0], l[1], l[2], l[3]));
    if (dl < 0.75 * s + 0.4) over(P, leg, c.alpha * kit.clamp(0.42 * s + 0.5 - dl));
    for (const [ax, ay, cx, cy, d] of arms) {
      const da = kit.segDist(qx, qy, ax, ay, cx, cy);
      if (da < 1.2) over(P, leg, c.alpha * kit.clamp(0.5 * s + 0.5 - da));
      const dc = Math.hypot(qx - cx, qy - cy), rr = 1.45 * s;
      if (dc < rr + 0.6) {
        const ang = Math.atan2(qy - cy, (qx - cx) * d), notch = ang < -0.2 && ang > -0.2 - 1.1 * snip && dc > 0.35 * rr;
        if (!notch) over(P, claw, c.alpha * kit.clamp(rr + 0.5 - dc));
      }
    }
    const db = Math.hypot((qx - bx) / rx, (qy - by) / ry);
    if (db < 1.3) {
      const top = kit.clamp((by - qy) / ry);
      over(P, kit.scale(shell, 0.85 + 0.35 * top), c.alpha * kit.clamp((1 - db) * rx + 0.5));
    }
    for (const [ax, ay, ex, ey] of eyes) {
      const ds = kit.segDist(qx, qy, ax, ay, ex, ey);
      if (ds < 1) over(P, leg, c.alpha * kit.clamp(0.35 * s + 0.5 - ds));
      const de = Math.hypot(qx - ex, qy - ey);
      if (!sleep && de < 1.6) {
        over(P, kit.scale(EYE, L), c.alpha * kit.clamp(0.95 * s + 0.5 - de));
        const dp = Math.hypot(qx - ex - 0.35 * (ex - x), qy - ey - 0.2);
        if (dp < 0.6) over(P, [0, 0, 0], c.alpha * 0.85 * kit.clamp((0.6 - dp) / 0.4));
      }
    }
  }
}
