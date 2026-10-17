// Shooting Gallery: the whole 128x192 portrait assembly is a fairground
// booth seen from the counter, popgun in hand. The time is the targets:
// the hour and the minutes are knock-down tin numerals (red enamel, gold
// rims, chipped to bare tin) standing on hinges on two tiers, with a tier
// of tin ducks and rabbits rattling along between them over tin waves.
// Marquee bulbs chase round the awning and the posts; plush prizes hang.
// The popgun at the bottom never rests: it wanders, aims, leads a duck and
// pops its cork (on a string: it snaps back). A hit duck goes down and
// pops up again later.
// Minute turn: the gun takes aim at the minutes, pop, ping, the old tin
// numeral is knocked flat behind its rail; on the minute the new one swings
// up on its hinge, leans out, and rocks to rest.
// Hour: jackpot. Every bulb flashes; a giant teddy bear drops from the
// awning onto the hour targets, flattens them, bounces off in a somersault
// and lands on the counter, knocking last hour's bear off, while the new
// hour swings up.
import * as kit from '../js/kit.js';
import { numeralTex, duckSprite, rabbitSprite, bearSprite, blit, blitXf, drawTarget, glow, capsule } from './shootinggallery-art.js';

const W = 128, H = 192, sst = kit.smoothstep, clamp = kit.clamp, TAU = kit.TAU;
const img = new Float32Array(3 * W * H), bg = new Float32Array(3 * W * H);
const BULB = kit.blackbody(2500), FLASH = kit.blackbody(4200);

// ------------------------------------------------------------------ plan
const HOUR = { w: 30, h: 42, foot: 64, xs: [45, 83] };
const MIN = { w: 42, h: 58, foot: 148, xs: [39, 89] };
const SLOTS = [
  { ...HOUR, cx: HOUR.xs[0], tier: HOUR }, { ...HOUR, cx: HOUR.xs[1], tier: HOUR },
  { ...MIN, cx: MIN.xs[0], tier: MIN }, { ...MIN, cx: MIN.xs[1], tier: MIN },
];
const RISE_STAGGER = [0.32, 0.22, 0.1, 0.0];
const DUCK_N = 8, DUCK_S = 20, DUCK_V = 10, DUCK_FOOT = 87;   // loop 160 px, 16 s
const FLY = 0.16;                                             // cork flight
const PIVOT = [100, 224], GUN_L = 66;
const B_REL = -0.955, B_IMP = -0.5, B_LAND = 0.34;            // teddy, relative to the hour

let TEX = null, DUCK, RABBIT, BEARS, MINI;
function init() {
  TEX = { h: [], m: [] };
  for (let d = 0; d < 10; d++) { TEX.h.push(numeralTex(d, HOUR.w, HOUR.h, d)); TEX.m.push(numeralTex(d, MIN.w, MIN.h, d + 10)); }
  DUCK = duckSprite(); RABBIT = rabbitSprite();
  BEARS = [
    bearSprite('#a8642c', '#f2c890', '#e01818'),
    bearSprite('#f07aa8', '#fff0f4', '#2a7cff'),
    bearSprite('#d89a2a', '#fff0c8', '#1cb04a'),
    bearSprite('#7a8cb8', '#eef2ff', '#e8361c'),
  ];
  MINI = [bearSprite('#3cc0b0', '#e8fff8', '#ff4a8a'), bearSprite('#c050e0', '#ffe8ff', '#ffc020')];
  buildBackground();
}

// ------------------------------------------------------------ background
function px(x, y, c, k = 1) { const o = 3 * (y * W + x); bg[o] = c[0] * k; bg[o + 1] = c[1] * k; bg[o + 2] = c[2] * k; }
function buildBackground() {
  bg.fill(0);
  const RED = kit.hex('#c8141a'), CREAM = kit.hex('#ffe6b8'), WOOD = kit.hex('#6a1a10'), BRASS = kit.hex('#e0a040');
  // awning: stripes 8 px, scalloped hem
  for (let y = 0; y < 18; y++) for (let x = 0; x < W; x++) {
    const k = Math.floor(x / 8), cx = k * 8 + 4;
    const hem = 11 + Math.sqrt(Math.max(0, 16 - (x + 0.5 - cx) ** 2));
    const cov = clamp(hem - y);
    if (cov <= 0) continue;
    const c = k % 2 ? CREAM : RED, fold = 0.75 + 0.25 * Math.cos(((x + 0.5 - cx) / 4) * 1.4);
    const shade = (0.12 + 0.14 * (y / 15)) * fold;
    px(x, y, c, shade * cov * (k % 2 ? 0.45 : 1));
  }
  // hem trim
  for (let x = 0; x < W; x++) px(x, 10, BRASS, 0.05);
  // posts
  for (let y = 15; y < 172; y++) for (const x0 of [0, 124]) for (let x = x0; x < x0 + 4; x++) {
    const edge = x === x0 + (x0 ? 0 : 3);
    px(x, y, edge ? BRASS : WOOD, edge ? 0.1 : 0.09);
  }
  // rails: brass lips under the tiers
  for (const [y0, y1] of [[HOUR.foot, HOUR.foot + 4], [MIN.foot, MIN.foot + 4]]) {
    for (let y = y0; y < y1; y++) for (let x = 4; x < 124; x++) {
      const k = y === y0 ? 0.32 : y === y0 + 1 ? 0.14 : 0.06;
      px(x, y, BRASS, k);
    }
  }
  // counter: top lip and striped front
  for (let y = 170; y < H; y++) for (let x = 0; x < W; x++) {
    if (y < 173) { px(x, y, BRASS, y === 170 ? 0.3 : 0.1); continue; }
    const st = Math.floor((x + 3) / 10) % 2;
    const c = st ? CREAM : RED, k = (st ? 0.06 : 0.11) * (1 - 0.4 * (y - 173) / 19);
    px(x, y, c, k);
  }
}

// --------------------------------------------------------------- bulbs
const BULBS = [];
for (let k = 0; k < 16; k++) BULBS.push([k * 8 + 4, 15.5]);
for (let y = 24; y <= 164; y += 10) BULBS.push([2, y]);
for (let y = 24; y <= 164; y += 10) BULBS.push([126, y]);
function bulbLevel(k, t, jack) {
  // incandescent chase: three on, one off, with a warm lag
  const order = k < 16 ? k : k < 31 ? 15 - (k - 16) : k - 31 + 16;
  const x = kit.fract(order / 4 - t * 1.25);
  let b = 0.18 + 0.82 * sst(0, 0.12, x) * (1 - sst(0.62, 0.8, x));
  if (jack > 0) {
    const fl = 0.5 + 0.5 * Math.cos(t * TAU * 4);
    b = kit.lerp(b, fl * fl, jack);
  }
  return b;
}

// --------------------------------------------------------------- timing
const pad = (n) => String(n).padStart(2, '0');
const digitsAt = (s) => { s = ((s % 86400) + 86400) % 86400; return pad(Math.floor(s / 3600)) + pad(Math.floor(s / 60) % 60); };

const events = new Map();
/** The shots fired during the minute starting at T0 (local day seconds), and the turn at T0+60. */
function eventsFor(T0) {
  if (events.has(T0)) return events.get(T0);
  const cur = digitsAt(T0), nxt = digitsAt(T0 + 60), T1 = T0 + 60;
  const shots = [];
  for (const [j, at] of [[0, 9], [1, 24.5], [2, 39]]) {
    const th = T0 + at, X = 22 + 84 * kit.hash(T0, j, 7);
    let best = 0, bd = 1e9;
    for (let k = 0; k < DUCK_N; k++) { const d = Math.abs(duckX(k, th) - X); if (d < bd) { bd = d; best = k; } }
    if (j === 1) { const sl = Math.floor(kit.hash(T0, 5) * 4), S = SLOTS[sl]; shots.push({ th, kind: 'ding', slot: sl, x: S.cx + (kit.hash(T0, 6) - 0.5) * S.w * 0.5, y: S.foot - S.h * (0.78 + 0.12 * kit.hash(T0, 8)) }); continue; }
    shots.push({ th, kind: 'duck', k: best, x: duckX(best, th), y: DUCK_FOOT - 10 });
  }
  const tens = cur[2] !== nxt[2];
  shots.push({ th: T1 - (tens ? 1.05 : 0.65), kind: 'plate', slot: 3, x: SLOTS[3].cx, y: MIN.foot - MIN.h * 0.72 });
  if (tens) shots.push({ th: T1 - 0.5, kind: 'plate', slot: 2, x: SLOTS[2].cx, y: MIN.foot - MIN.h * 0.72 });
  shots.sort((a, b) => a.th - b.th);
  const knock = [null, null, null, null], ding = [null, null, null, null];
  for (const s of shots) if (s.kind === 'plate') knock[s.slot] = s.th; else if (s.kind === 'ding') ding[s.slot] = s.th;
  if (cur.slice(0, 2) !== nxt.slice(0, 2)) knock[0] = knock[1] = T1 + B_IMP;
  const ev = { T0, cur, nxt, shots, knock, ding, hour: cur.slice(0, 2) !== nxt.slice(0, 2) };
  if (events.size > 8) events.clear();
  events.set(T0, ev);
  return ev;
}
function duckX(k, t) { return (((k * DUCK_S + DUCK_V * t) % 160) + 160) % 160 - 10; }

// fall back flat: gravity from upright, gone behind the rail
const fallAngle = (s) => (Math.PI / 2) * Math.min(1, (s / 0.34) ** 2);
// swing up on the hinge: an underdamped spring from flat to upright
const riseAngle = (s) => (Math.PI / 2) * Math.exp(-3.2 * s) * (Math.cos(6 * s) + 0.53 * Math.sin(6 * s));

// ------------------------------------------------------------------ frame
export default {
  name: 'Shooting Gallery',
  blurb: 'a fairground booth: the time is knock-down tin targets; a popgun shoots each minute flat and the new one swings up; on the hour a giant teddy drops',
  layouts: ['hub-2x3'], look: 'smoke', fps: 60, brightness: 0.45, dither: true,
  frame(ctx) {
    if (!TEX) init();
    const d = ctx.date;
    const E = d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds() + d.getMilliseconds() / 1000;
    const T0 = Math.floor(E / 60) * 60, age = E - T0;
    const evNow = eventsFor(T0), evPrev = eventsFor(T0 - 60);
    const dim = 1 - 0.5 * ctx.night;
    img.set(bg);

    // jackpot: near an hour turn (either side)
    const hourTurn = evNow.hour && age > 50 ? T0 + 60 : evPrev.hour ? T0 : null;
    const hb = hourTurn === null ? 99 : E - hourTurn;
    const jack = hourTurn === null ? 0 : sst(-3, -2.2, hb) * (1 - sst(3.2, 4.5, hb));

    // bulbs
    for (let k = 0; k < BULBS.length; k++) {
      const [bx, by] = BULBS[k], b = bulbLevel(k, E, jack);
      const c = jack > 0.5 && b > 0.6 ? FLASH : BULB;
      glow(img, W, H, bx, by, 5.5, c, 0.05 * b * (1 + jack));
      glow(img, W, H, bx, by, 2.1, c, 0.85 * b);
    }

    // hanging prizes on the sides of the hour tier
    for (let j = 0; j < 2; j++) {
      const x = j ? 114 : 14, sw = 0.16 * Math.sin(E * 2.2 + j * 2.1) + (jack ? 0.25 * jack * Math.sin(E * 9 + j) : 0);
      const L = 12, hx = x + Math.sin(sw) * L, hy = 17 + Math.cos(sw) * L;
      for (let s = 0; s <= 10; s++) { const f = s / 10; glow(img, W, H, x + (hx - x) * f, 17 + (hy - 17) * f, 0.9, [1, 0.9, 0.7], 0.03); }
      blitXf(img, W, H, MINI[j], hx, hy, 17, 1.5, 0.42, 0.42, -sw, 0.9);
    }

    // targets
    const cur = evNow.cur, prv = evPrev.cur;
    const thetas = [0, 0, 0, 0];
    for (let i = 0; i < 4; i++) {
      // always a little alive on the spring hinge; rocked hard by a ding
      let th = 0.03 * Math.sin(E * 2.3 + i * 1.9) + 0.015 * Math.sin(E * 5.1 + i);
      const dg = evNow.ding[i];
      if (dg !== null && E >= dg) th += 0.42 * Math.exp(-2.6 * (E - dg)) * Math.sin(8.5 * (E - dg));
      const kt = evNow.knock[i];
      if (kt !== null && E >= kt) th = Math.max(th, fallAngle(E - kt));
      const changed = i < 2 ? evPrev.hour : prv[i] !== cur[i];
      if (changed && age < 3) {
        const rs = T0 + RISE_STAGGER[i];
        th = E < rs ? Math.PI / 2 : riseAngle(E - rs) + th * sst(0, 2, E - rs);
      }
      thetas[i] = th;
    }
    for (let i = 0; i < 4; i++) {
      const S = SLOTS[i], T = i < 2 ? TEX.h[+cur[i]] : TEX.m[+cur[i]];
      const sheen = kit.fract((E + i * 1.7) / 9) * 3 - 0.8;
      drawTarget(img, W, H, T, S.cx, S.foot, thetas[i], 240, dim, 0, sheen, S.foot);
      if (i === 1) drawHinges(HOUR, dim);
      if (i === 1) drawDucks(E, evNow, evPrev, dim);
    }
    drawHinges(MIN, dim);

    // the gun, its cork and the hits
    drawGun(E, [...evPrev.shots, ...evNow.shots], dim);

    // the teddy
    drawBears(E, dim);

    kit.blitGrid(ctx, img, 1);
  },
};

function drawHinges(tier, dim) {
  const c = kit.hex('#e0a040');
  for (const x of tier.xs) for (let dx = -5; dx <= 5; dx++) {
    const o = 3 * ((tier.foot) * W + x + dx);
    const k = (Math.abs(dx) === 5 ? 0.25 : 0.55) * dim;
    img[o] = c[0] * k; img[o + 1] = c[1] * k; img[o + 2] = c[2] * k;
  }
}

function drawDucks(E, evNow, evPrev, dim) {
  // down state from shots
  const down = new Float32Array(DUCK_N);
  for (const ev of [evPrev, evNow]) for (const s of ev.shots) {
    if (s.kind !== 'duck' || E < s.th) continue;
    const a = E - s.th;
    if (a < 3.6) {
      let th = Math.min(1, (a / 0.25) ** 2);
      if (a > 3.0) th = Math.max(0, 1 - kit.ease.outBack((a - 3.0) / 0.6));
      down[s.k] = Math.max(down[s.k], th);
    }
  }
  for (let k = 0; k < DUCK_N; k++) {
    const x = duckX(k, E);
    if (x < -12 || x > W + 12) continue;
    const S = k % 3 === 2 ? RABBIT : DUCK;
    const bob = 0.5 * Math.sin(E * 11 + k * 1.7), rot = 0.06 * Math.sin(E * 7.3 + k * 2.3);
    const cy = Math.cos(down[k] * Math.PI / 2);
    if (cy > 0.05) blitXf(img, W, H, S, x, DUCK_FOOT + bob, S.w / 2, S.h - 1, 1, cy, rot * cy, dim * (1 + 0.4 * down[k]));
  }
  // tin waves in front, rolling the other way
  const BLUE = kit.hex('#1f6ee8'), CREST = kit.hex('#a8d8ff');
  for (let x = 4; x < 124; x++) {
    const top = 80.5 + 1.5 * Math.sin((x + 0.5) * 0.4 + E * 2.4) + 0.6 * Math.sin((x + 0.5) * 0.13 - E * 0.9);
    for (let y = Math.floor(top); y < 90; y++) {
      const cov = clamp(y + 1 - top), o = 3 * (y * W + x);
      const crest = y - top < 1.3 ? 0.35 : 0;
      const k = (0.22 - 0.014 * (y - top)) * dim;
      const r = BLUE[0] * k + CREST[0] * crest * dim * 0.5, g = BLUE[1] * k + CREST[1] * crest * dim * 0.5, b = BLUE[2] * k + CREST[2] * crest * dim * 0.5;
      img[o] = img[o] * (1 - cov) + r * cov; img[o + 1] = img[o + 1] * (1 - cov) + g * cov; img[o + 2] = img[o + 2] * (1 - cov) + b * cov;
    }
  }
}

const STEEL = kit.hex('#8a9cb0'), BRASS = kit.hex('#ffb040'), CORK = kit.hex('#e0a868'), WOOD = kit.hex('#c8702a');
function drawGun(E, shots, dim) {
  // aim: idle wander, pulled onto each target before it fires
  let ax = 64 + 30 * Math.sin(E * 0.37) + 8 * Math.sin(E * 1.31 + 1), ay = 100 + 26 * Math.sin(E * 0.23 + 1) + 4 * Math.sin(E * 0.9);
  let kick = 0, fly = null, back = null, ping = [];
  for (const s of shots) {
    const tf = s.th - FLY;
    const w = sst(tf - 0.8, tf - 0.2, E) * (1 - sst(s.th + 0.35, s.th + 1.1, E));
    if (w > 0) { ax += (s.x - ax) * w; ay += (s.y - ay) * w; }
    if (E >= tf && E < tf + 0.5) kick = Math.max(kick, Math.exp(-(E - tf) * 12));
    if (E >= tf && E < s.th) fly = { s, f: (E - tf) / FLY };
    if (E >= s.th && E < s.th + 0.32) back = { s, f: (E - s.th) / 0.32 };
    if (E >= s.th && E < s.th + 0.4) ping.push({ s, a: (E - s.th) / 0.4 });
  }
  ay += 0.4 * Math.sin(E * 13);                                  // hand tremor
  let dx = ax - PIVOT[0], dy = ay - PIVOT[1];
  const L = Math.hypot(dx, dy); dx /= L; dy /= L;
  const len = GUN_L - 5 * kick;
  const mx = PIVOT[0] + dx * len + 3 * kick * dy, my = PIVOT[1] + dy * len;
  // the cork and its string
  let cx = mx, cy = my, cr = 2.3;
  if (fly) {
    const f = kit.ease.out(fly.f);
    cx = mx + (fly.s.x - mx) * f; cy = my + (fly.s.y - my) * f; cr = 2.3 - 1.1 * f;
  } else if (back) {
    const f = kit.ease.inOut(back.f);
    cx = back.s.x + (mx - back.s.x) * f; cy = back.s.y + (my - back.s.y) * f + 6 * Math.sin(Math.PI * f); cr = 1.2 + 1.1 * f;
  }
  if (fly || back) {
    const n = Math.ceil(Math.hypot(cx - mx, cy - my) / 0.8);
    const sag = back ? 4 * Math.sin(Math.PI * back.f) : 0;
    for (let k = 1; k < n; k++) {
      const f = k / n;
      glow(img, W, H, mx + (cx - mx) * f, my + (cy - my) * f + sag * Math.sin(Math.PI * f), 0.85, [1, 0.92, 0.8], 0.05 * dim);
    }
  }
  // barrel: steel tube in perspective, brass bands
  const ex = PIVOT[0] + dx * 38, ey = PIVOT[1] + dy * 38;
  const sx = PIVOT[0] + dx * 8, sy = PIVOT[1] + dy * 8;
  capsule(img, W, H, ex + 2 * dy, ey, sx, sy, 10, 18, (t, side) => {           // wooden fore-stock
    const hl = Math.exp(-((side + 0.4) ** 2) * 5), grain = 0.85 + 0.15 * Math.sin(t * 40 + side * 3);
    const k = (0.12 + 0.5 * hl) * grain * (1 - 0.4 * t) * dim;
    return [WOOD[0] * k, WOOD[1] * k, WOOD[2] * k];
  });
  capsule(img, W, H, mx, my, ex, ey, 4.4, 8.5, (t, side) => {
    const hl = Math.exp(-((side + 0.35) ** 2) * 8);
    const band = t < 0.07 || (t > 0.42 && t < 0.5);
    const base = band ? BRASS : STEEL;
    const k = ((band ? 0.3 : 0.14) + (band ? 0.8 : 0.75) * hl) * (1 - 0.3 * t) * dim;
    return [base[0] * k, base[1] * k, base[2] * k];
  });
  // muzzle bore
  glow(img, W, H, mx, my, 2.0, [-0.2, -0.2, -0.2], dim);
  if (kick > 0.25) glow(img, W, H, mx, my - 2, 7 * kick, FLASH, 1.2 * kick * kick * dim);
  // cork
  capsule(img, W, H, cx - 0.01, cy, cx + 0.01, cy, cr, cr, (t, side) => kit.scale(CORK, (0.3 + 0.45 * (1 - side)) * dim));
  // ping: a white-hot spark where the cork hits tin
  for (const p of ping) {
    const k = (1 - p.a) * (1 - p.a) * dim, r = 2 + 6 * p.a;
    glow(img, W, H, p.s.x, p.s.y, r, [1, 0.95, 0.8], 0.9 * k);
    for (let q = 0; q < 4; q++) {
      const a = q * Math.PI / 2 + Math.PI / 4;
      for (let s = 1; s <= 4; s++) glow(img, W, H, p.s.x + Math.cos(a) * s * r * 0.4, p.s.y + Math.sin(a) * s * r * 0.4, 1.1, [1, 0.9, 0.6], 0.6 * k);
    }
  }
}

function bearOf(hourSec) { return BEARS[Math.floor(kit.hash(Math.floor(hourSec / 3600), 3) * BEARS.length)]; }
function drawBears(E, dim) {
  const H0 = Math.floor(E / 3600) * 3600;
  // which turn is near: the next one (falling) or the last one (landing)
  let turn = null;
  if (E - H0 < 3) turn = H0; else if (H0 + 3600 - E < 1.2) turn = H0 + 3600;
  const SX = 24, SBOT = 191;
  const sit = (S, k) => {
    const br = 1 + 0.018 * Math.sin(E * 2.1);
    blitXf(img, W, H, S, SX, SBOT, 17, 40, 1 / Math.sqrt(br), br, 0.03 * Math.sin(E * 0.8), k);
  };
  if (turn === null) { sit(bearOf(E), dim); return; }
  const b = E - turn;
  confetti(b - B_IMP, 64, 34, 46, 1, dim);
  confetti(b - B_LAND, SX + 4, SBOT - 22, 24, 2, dim);
  const oldB = bearOf(turn - 10), newB = bearOf(turn + 10);
  // last hour's bear sits until the new one lands on it
  if (b < B_LAND) sit(oldB, dim);
  else {
    const t = b - B_LAND;
    const x = SX - 150 * t, y = SBOT - 20 - 170 * t + 320 * t * t;
    if (x > -30) blitXf(img, W, H, oldB, x, y, 17, 20, 1, 1, -6 * t, dim);
  }
  if (b < B_REL) return;
  if (b < B_IMP) {
    const y = -50 + 386 * (b - B_REL) ** 2;
    blitXf(img, W, H, newB, 64, y, 17, 20, 1.35, 1.35, 0.15 * Math.sin(b * 9), dim);
  } else if (b < B_LAND) {
    const tau = b - B_IMP, TL = B_LAND - B_IMP, f = tau / TL;
    const vy0 = (SBOT - 20 - 30 - 300 * TL * TL) / TL;
    const x = 64 + (SX - 64) * f, y = 30 + vy0 * tau + 300 * tau * tau;
    const sc = 1.35 - 0.35 * f;
    blitXf(img, W, H, newB, x, y, 17, 20, sc, sc, -TAU * kit.ease.inOut(f), dim);
  } else {
    const tau = b - B_LAND;
    const q = Math.exp(-5 * tau) * Math.cos(13 * tau) * 0.28;
    blitXf(img, W, H, newB, SX, SBOT, 17, 40, 1 + q, 1 - q, 0, dim);
  }
}

// jackpot confetti: tin stars and paper flecks, ballistic, fluttering (closed form)
const CONF = [kit.hex('#ffc248'), kit.hex('#ff3020'), kit.hex('#ffe8c0'), kit.hex('#3a8cff'), kit.hex('#40e070')];
function confetti(t, x0, y0, n, seed, dim) {
  if (t < 0 || t > 2.6) return;
  for (let k = 0; k < n; k++) {
    const a = -Math.PI / 2 + (kit.hash(k, seed, 1) - 0.5) * 2.6, v = 70 + 110 * kit.hash(k, seed, 2);
    const drag = 1.6, e = (1 - Math.exp(-drag * t)) / drag;          // air drag, then settling flutter
    const x = x0 + Math.cos(a) * v * e + 4 * Math.sin(t * 7 + k);
    const y = y0 + Math.sin(a) * v * e + 60 * (t - e) * 1.4;
    const spin = Math.abs(Math.cos(t * (8 + 6 * kit.hash(k, seed, 3)) + k));
    const fade = 1 - sst(1.8, 2.6, t);
    const c = CONF[k % CONF.length];
    glow(img, W, H, x, y, 1.7, c, (0.25 + 0.75 * spin) * fade * dim);
  }
}
