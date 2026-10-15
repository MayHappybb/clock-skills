// Invaders: a whole arcade cabinet on 128x64. The invader formation IS the
// time: every numeral is a squad of aliens on the classic lattice (squids on
// top, crabs, octopuses below), marching side to side on the heartbeat, which
// quickens as the hour runs out while the formation steps down towards the
// shields and finally crushes them. The defender is the owner's rainbow frog
// in round glasses, in a little tank. Each minute it shoots out the changing
// numeral alien by alien and a fresh squad drops in from the top; at the
// hour the mothership beams the whole formation up, sprays the new hour back
// out and is shot down through the gaps between the numerals.
//
// Everything is a pure function of the wall clock: plans (who is shot when,
// where the frog drives, every bomb and the shields' damage) are cached per
// minute and chained from the top of the hour.
import * as kit from '../js/kit.js';
import * as SP from './invaders-sprites.js';

const { blit, put, dot, DIGITS } = SP;
const W = 128, H = 64;
const img = new Float32Array(W * H * 3);
const SLOT_X = [0, 28, 62, 90];          // numeral boxes from the formation's left edge
const GAP_X = [25, 56, 87];              // the gaps between them (shots pass here)
const SHIELD_Y = 41, SHIELD_X = [9, 41, 73, 105];
const FROG_Y = 47, SHOT_Y = 46, SHOT_V = 150, BOMB_V = 30, SHOT_DT = 0.075;
const SHOW_END = 8;                      // the hour show freezes the march this long
const pad = (n) => String(n).padStart(2, '0');

// ------------------------------------------------------------- palette
const C = {
  squid: kit.hex('#ff3fb0'), crab: kit.hex('#2fd6ff'), octo: kit.hex('#a8ff2e'),
  doom: kit.hex('#ff2a10'), white: [1, 1, 1], shot: kit.hex('#d8f6ff'), bomb: kit.hex('#ffe7a0'),
  shield: kit.hex('#19c43a'), ground: kit.hex('#19c43a'), ufo: kit.hex('#ff1c1c'), ufoLit: kit.hex('#ffd23a'),
  beam: kit.hex('#9a4dff'), star: kit.hex('#9fb4ff'), fire: kit.hex('#ffb040'),
};
// minor channels under ~10/255 would step and tint at the dim end: zero them
const clean = (c) => c && c.map((v) => (v < 0.04 ? 0 : v));
for (const k in C) C[k] = clean(C[k]);
const SPECIES = [SP.SQUID, SP.SQUID, SP.CRAB, SP.CRAB, SP.OCTO, SP.OCTO];
const SPCOL = [C.squid, C.squid, C.crab, C.crab, C.octo, C.octo];
const MOTHER_PAL = [null, kit.scale(kit.hex('#7fd8ff'), 0.7), kit.scale(kit.hex('#c8f0ff'), 0.45),
  kit.hex('#d0182e'), kit.hex('#ffd23a'), kit.scale(kit.hex('#ff6a1a'), 0.8)].map(clean);

// The frog in a few looks: pupils left/centre/right x up/level, mouth shut/open.
const FROG_PAL = [null, [0.95, 0.95, 0.95], kit.scale(kit.hex('#9ad8ff'), 0.22), null, kit.hex('#ff2424'),
  kit.hex('#ff7a10'), kit.hex('#ffdc10'), kit.hex('#22d63a'), kit.hex('#2a6dff'), kit.hex('#8a2cff'), kit.scale(kit.hex('#8a9cb0'), 0.6)];
FROG_PAL.forEach((c, i) => { FROG_PAL[i] = clean(c); });
const FROG_PAL_OPEN = FROG_PAL.slice(); FROG_PAL_OPEN[3] = kit.hex('#ff5a8a');
const FROGS = {};
for (const dx of [-1, 0, 1]) for (const dy of [-1, 0]) {
  const rows = SP.FROG_ROWS.map((r) => r.replace(/k/g, 'e').split(''));
  for (const cx of [3, 14]) for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) rows[2 + dy + j][cx + dx + i] = 'k';
  FROGS[`${dx},${dy}`] = SP.sprite(rows.map((r) => r.join('')),
    { W: 1, e: 2, k: 0, m: 3, r: 4, o: 5, y: 6, g: 7, b: 8, v: 9, T: 10 });
}

// ------------------------------------------------------------- time
const infoC = new Map();
function info(M) {
  let v = infoC.get(M);
  if (!v) {
    const d = new Date(M * 60000);
    v = { mo: d.getMinutes(), dig: pad(d.getHours()) + pad(d.getMinutes()) };
    if (infoC.size > 600) infoC.clear();
    infoC.set(M, v);
  }
  return v;
}
// the heartbeat: steps a second, quickening over the hour; PRE = steps before minute m
const R = [], PRE = [0];
for (let m = 0; m < 60; m++) R.push(1.2 + 3.6 * (m / 59) ** 1.7);
for (let m = 1; m < 60; m++) PRE.push(PRE[m - 1] + (m === 1 ? (60 - SHOW_END) * R[0] : 60 * R[m - 1]));
const STEPS = [15, 30, 40, 50, 56];   // minutes the formation steps down a row-pixel
const tri = (k) => { const m = k % 26; return m <= 13 ? m : 26 - m; };

/** The march at time t: formation left x (sub-pixel glide), step count, seconds since the beat. */
function march(t) {
  const M = Math.floor(t / 60), sec = t - M * 60, mo = info(M).mo;
  const r = R[mo];
  const K = mo === 0 ? Math.max(0, sec - SHOW_END) * r : PRE[mo] + sec * r;
  const k = Math.floor(K), f = K - k;
  const g = kit.smoothstep(0, 1, Math.min(1, f / r / Math.min(0.09, 0.45 / r)));
  const a = tri(k), b = tri(k + 1);
  return { x: 1 + a + (b - a) * g, k, beat: f / r, r };
}
const x0At = (t) => march(t).x;
/** Formation top: steps down a pixel every ten minutes, returns to the top after the hour show. */
function yfAt(t) {
  const M = Math.floor(t / 60), sec = t - M * 60, mo = info(M).mo;
  if (mo === 0) return 10 - 5 * kit.ease.inOut(kit.clamp((sec - showPlan(M).ret) / 1.2));
  const base = 5 + STEPS.filter((s) => mo >= s).length;
  return STEPS.includes(mo) ? base - 1 + kit.ease.inOut(kit.clamp(sec / 0.4)) : base;
}

function lru(map, key, make, max = 160) {
  let v = map.get(key);
  if (v === undefined) { v = make(); if (map.size > max) map.delete(map.keys().next().value); map.set(key, v); }
  return v;
}

// ------------------------------------------------------------- minute turn
const turnC = new Map();
/** Turn into minute M: the frog shoots out every changing numeral before M starts. */
function turnPlan(M) {
  return lru(turnC, M, () => {
    const I = info(M), P = info(M - 1), S = M * 60;
    const res = { kills: [], keys: [], shots: [], changed: [false, false, false, false], T0: Infinity, T1: -Infinity, map: new Map() };
    if (I.mo === 0) return res;
    const stops = [];
    for (let j = 0; j < 4; j++) {
      if (P.dig[j] === I.dig[j]) continue;
      res.changed[j] = true;
      const al = DIGITS[P.dig[j]];
      const hxs = [...new Set(al.map((a) => a.hx))].sort((a, b) => a - b);
      for (const hx of hxs) stops.push({ j, hx, aliens: al.filter((a) => a.hx === hx).sort((a, b) => b.row - a.row) });
    }
    const move = (i) => (i === 0 ? 0 : stops[i].j !== stops[i - 1].j ? 0.16 : 0.09);
    let total = 0;
    stops.forEach((s, i) => { total += move(i) + (s.aliens.length - 1) * SHOT_DT + 0.05; });
    res.T0 = S - total - 0.34;
    let t = res.T0;
    stops.forEach((s, i) => {
      t += move(i);
      const tf0 = t, x = Math.round(x0At(tf0 + 0.2) + SLOT_X[s.j] + s.hx * 3 + 2);
      const fxk = Math.min(118, Math.max(9, x));          // the tank never leaves the screen: edge shots slant
      res.keys.push({ t: tf0 - 0.03, x: fxk });
      s.aliens.forEach((a, k) => {
        const tf = tf0 + k * SHOT_DT, yc = yfAt(tf) + 6 * a.row + 2, ti = tf + (SHOT_Y - yc) / SHOT_V;
        const kill = { j: s.j, hx: a.hx, row: a.row, tf, ti, x,
          ex: x0At(ti) + SLOT_X[s.j] + a.hx * 3, ey: yfAt(ti) + 6 * a.row, col: SPCOL[a.row], seed: M * 7 + kill_id(s.j, a) };
        res.kills.push(kill); res.map.set(kill_id(s.j, a), kill);
        res.shots.push({ tf, ti, x, xs: fxk });
      });
      t = tf0 + (s.aliens.length - 1) * SHOT_DT;
      res.keys.push({ t: t + 0.03, x: fxk });
      t += 0.05;
    });
    res.T1 = t + 0.3;
    return res;
  });
}
const kill_id = (j, a) => j * 100 + a.hx * 10 + a.row;

// ------------------------------------------------------------- hour show
const showC = new Map();
const shipX = (t, S) => 64 + 40 * Math.sin(1.1 * (t - S + 4));
const shipY = (t, S) => (t < S - 2.2 ? -11 + 11 * kit.ease.out(kit.clamp((t - (S - 3.6)) / 1.4)) : 0.5 * Math.sin(3 * (t - S)) - 0.5);
/** The show at the top of hour M: mothership, tractor beam, new wave sprayed out, boss fight. */
function showPlan(M) {
  return lru(showC, M, () => {
    const S = M * 60, I = info(M);
    const spray = [];
    for (let j = 0; j < 4; j++) for (const a of DIGITS[I.dig[j]]) {
      spray.push({ j, hx: a.hx, row: a.row, tl: S + 0.02 + 0.55 * kit.hash(M & 0xffff, j * 100 + a.hx * 10 + a.row, 9) });
    }
    const hits = [], keys = [{ t: S - 1.8, x: 64 }, { t: S + 0.6, x: 64 }];
    let lastT = S + 0.6, lastX = 64;
    for (let tf = S + 1.4; tf < S + 5.3 && hits.length < 5; tf += 1 / 60) {
      for (const g of GAP_X) {
        const gx = 1 + g;
        if (tf - lastT < 0.2 + Math.abs(gx - lastX) / 120) continue;
        const ti = tf + (SHOT_Y - 9) / SHOT_V;
        if (Math.abs(shipX(ti, S) - gx) > 2) continue;
        hits.push({ tf, ti, x: gx });
        keys.push({ t: tf - 0.06, x: gx }, { t: tf + 0.1, x: gx });
        lastT = tf + 0.1; lastX = gx;
        break;
      }
    }
    const te = hits.length ? hits[hits.length - 1].ti - S : 5.4;
    return { S, spray, hits, keys, te, ret: te + 0.5, busy: [S - 4, S + te + 0.4] };
  });
}

// ------------------------------------------------------------- the UFO
function ufoPlan(M, nextT0) {
  const I = info(M), S = M * 60;
  if (I.mo === 0) return null;
  const v = 22, dur = 139 / v;
  let tu = S + 12 + 22 * kit.hash(M & 0xffff, 1, 3);
  if (tu + dur > nextT0 - 1.5) tu = nextT0 - 1.5 - dur;
  if (tu < S + 3) return null;
  const dir = kit.hash(M & 0xffff, 2, 3) < 0.5 ? 1 : -1;
  const xu = (t) => (dir > 0 ? -11 + v * (t - tu) : 128 - v * (t - tu));
  const u = { tu, end: tu + dur, xu, hit: null, dir };
  if (kit.hash(M & 0xffff, 3, 3) < 0.65) {
    for (let tf = tu + 0.6; tf < u.end - 1; tf += 1 / 60) {
      const gx = Math.round(x0At(tf) + GAP_X[1]), ti = tf + (SHOT_Y - 2) / SHOT_V;
      if (Math.abs(xu(ti) + 5 - gx) < 0.8) { u.hit = { tf, ti, x: gx }; break; }
    }
  }
  return u;
}

// ------------------------------------------------------------- shields
const freshShield = () => {
  const s = new Uint8Array(W * 6);
  for (const sx of SHIELD_X) for (let j = 0; j < 6; j++) for (let i = 0; i < 14; i++) if (SP.SHIELD.px[j * 14 + i]) s[j * W + sx + i] = 1;
  return s;
};
const FRESH = freshShield();
const shieldStart = (M) => (info(M).mo === 0 ? FRESH : plan(M - 1).end);

// ------------------------------------------------------------- frog path
function frogX(keys, t) {
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1].t <= t) i++;
  const a = keys[i], b = keys[i + 1];
  if (t <= a.t) return [a.x, 0];
  if (t >= b.t) return [b.x, 0];
  const u = (t - a.t) / (b.t - a.t);
  return [a.x + (b.x - a.x) * u * u * (3 - 2 * u), b.x - a.x];
}

// ------------------------------------------------------------- the minute plan
const planC = new Map();
function plan(M) {
  return lru(planC, M, () => {
    const S = M * 60, I = info(M), N = info(M + 1);
    const tp = turnPlan(M), tn = turnPlan(M + 1);
    const show = I.mo === 0 ? showPlan(M) : null, showN = N.mo === 0 ? showPlan(M + 1) : null;
    const nextT0 = showN ? S + 60 - 4 : tn.T0;
    const ufo = ufoPlan(M, nextT0);
    // frog keys: wander, minus busy windows, plus the planned stops
    const busy = [], keys = [];
    for (const p of [tp, tn]) if (p.keys.length) { busy.push([p.T0 - 0.8, p.T1 + 0.3]); keys.push(...p.keys); }
    if (ufo?.hit) { busy.push([ufo.hit.tf - 1, ufo.hit.tf + 0.5]); keys.push({ t: ufo.hit.tf - 0.08, x: ufo.hit.x }, { t: ufo.hit.tf + 0.12, x: ufo.hit.x }); }
    for (const sp of [show, showN]) if (sp) { busy.push(sp.busy); keys.push(...sp.keys); }
    for (let k = Math.floor((S - 10) / 1.7); k * 1.7 < S + 70; k++) {
      const t = k * 1.7;
      if (busy.some(([a, b]) => t > a && t < b)) continue;
      keys.push({ t, x: Math.round(14 + 100 * kit.noise2(k * 0.43, 7.7)) });
    }
    keys.sort((a, b) => a.t - b.t);

    // shots fired during this minute
    const shots = [...tn.shots];
    if (ufo?.hit) shots.push({ ...ufo.hit });
    if (show) for (const h of show.hits) shots.push(h);

    // bombs from the bottom aliens, resolved against the shields in order
    const st = shieldStart(M).slice();
    const events = [];
    // the formation crushes what it sweeps once it reaches the shields
    const yb = Math.round(yfAt(S + 1)) + 34;
    if (I.mo !== 0 && yb >= SHIELD_Y) {
      const crush = [];
      for (let j = 0; j < 4; j++) for (const a of DIGITS[I.dig[j]]) {
        if (a.row !== 5) continue;
        const xa = SLOT_X[j] + a.hx * 3;
        for (let y = SHIELD_Y; y <= yb; y++) for (let x = xa + 1; x <= xa + 18; x++) crush.push((y - SHIELD_Y) * W + x);
      }
      for (const p of crush) st[p] = 0;
    }
    const start = st.slice();
    const pend = [];
    for (const s of shots) if (s.ti > S + 0) pend.push({ t: s.tf + 0.02, kind: 'slit', x: s.xs ?? s.x });
    const b0 = show ? S + SHOW_END + 1 : S + 2.5, b1 = Math.min(nextT0 - 1, S + 58);
    const nb = b1 > b0 ? 3 + Math.floor(3 * kit.hash(M & 0xffff, 4, 4)) : 0;
    for (let i = 0; i < nb; i++) {
      const td = b0 + (i + 0.2 + 0.6 * kit.hash(M & 0xffff, i, 5)) * (b1 - b0) / nb;
      const j = Math.floor(4 * kit.hash(M & 0xffff, i, 6)), al = DIGITS[I.dig[j]];
      const pick = al[Math.floor(al.length * kit.hash(M & 0xffff, i, 7))];
      const low = al.filter((a) => a.hx === pick.hx).reduce((m, a) => (a.row > m.row ? a : m));
      const x = Math.round(x0At(td) + SLOT_X[j] + low.hx * 3 + 2), y0 = yfAt(td) + 6 * low.row + 5;
      pend.push({ t: td + (SHIELD_Y - 5 - y0) / BOMB_V, kind: 'bomb', td, x, y0, type: kit.hash(M & 0xffff, i, 8) < 0.5 ? 0 : 1 });
    }
    pend.sort((a, b) => a.t - b.t);
    const bombs = [];
    for (const e of pend) {
      if (e.kind === 'slit') {
        if (e.x < 0 || e.x >= W) continue;
        const px = [];
        for (let y = 0; y < 6; y++) if (st[y * W + e.x] && kit.hash(e.x, y, Math.floor(e.t * 10)) < 0.22) { st[y * W + e.x] = 0; px.push(y * W + e.x); }
        if (px.length) events.push({ t: e.t, px });
        continue;
      }
      let r = -1;
      for (let y = 0; y < 6 && r < 0; y++) for (let dx = -1; dx <= 1; dx++) if (st[y * W + e.x + dx]) { r = y; break; }
      if (r < 0) {
        const tl = e.td + (FROG_Y + 10 - e.y0) / BOMB_V;
        const [fx0] = frogX(keys, e.td + (FROG_Y - 5 - e.y0) / BOMB_V), [fx1] = frogX(keys, tl);
        if (Math.abs(fx0 - e.x) < 12 || Math.abs(fx1 - e.x) < 12) continue;   // never aimed at the frog
        bombs.push({ ...e, stopY: 62, tStop: e.td + (62 - 5 - e.y0) / BOMB_V, ground: true });
        continue;
      }
      const stopY = SHIELD_Y + r, tStop = e.td + (stopY - 5 - e.y0) / BOMB_V;
      const px = [];
      for (let y = r; y <= r + 1; y++) for (let dx = -1; dx <= 1; dx++) {
        if (y > 5) continue;
        if ((dx !== 0 || y !== r) && kit.hash(e.x + dx, y, Math.floor(e.td)) < 0.7) continue;
        const p = y * W + e.x + dx;
        if (st[p]) { st[p] = 0; px.push(p); }
      }
      bombs.push({ ...e, stopY, tStop });
      events.push({ t: tStop, px });
    }
    events.sort((a, b) => a.t - b.t);
    return { S, keys, shots, ufo, bombs, start, events, end: st, show, showN, tp, tn };
  });
}

// ------------------------------------------------------------- drawing helpers
function burst(t0, now, x, y, col, seed, n = 6, big = 1) {
  const age = now - t0;
  if (age < 0 || age > 0.9) return;
  if (age < 0.24) blit(img, W, H, SP.BURST, x, y, [null, kit.mix([1, 1, 1], col, age / 0.24)], 1 - age / 0.4);
  for (let i = 0; i < n; i++) {
    const ang = kit.TAU * (i + kit.hash(seed, i, 1)) / n, sp = big * (22 + 26 * kit.hash(seed, i, 2));
    const px = x + 2 + Math.cos(ang) * sp * age, py = y + 2 + Math.sin(ang) * sp * age + 40 * age * age;
    dot(img, W, H, px, py, col, 0.9 * (1 - age / 0.9));
  }
}
const stars = [];
for (let i = 0; i < 34; i++) stars.push([kit.hash(i, 1, 11) * 128, kit.hash(i, 2, 11) * 40, kit.hash(i, 3, 11)]);
const shieldBuf = new Uint8Array(W * 6);

export default {
  name: 'Invaders',
  blurb: 'the time is the invader formation; the rainbow frog shoots out each old minute and the mothership brings the hour',
  layouts: ['hub-x2'], look: 'smoke', fps: 60, brightness: 0.35, dither: false,
  frame(ctx) {
    const now = ctx.date.getTime() / 1000;
    const M = Math.floor(now / 60), S = M * 60, sec = now - S;
    const I = info(M), N = info(M + 1), pl = plan(M);
    img.fill(0);
    const mr = march(now), x0 = mr.x, yf = yfAt(now), frame = (mr.r && !(I.mo === 0 && sec < SHOW_END)) ? mr.k & 1 : Math.floor(now * 2) & 1;

    // deep space: a few slow stars
    for (const [sx, sy, ph] of stars) {
      const y = (sy + now * 0.12) % 40;
      const tw = 0.5 + 0.5 * Math.sin(now * (0.7 + ph) + ph * 40);
      dot(img, W, H, sx, y, C.star, (0.05 + 0.05 * tw) * kit.smoothstep(0, 4, y) * (1 - kit.smoothstep(34, 40, y)));
    }
    // ground line with the heartbeat thump (four notes, falling)
    const thump = Math.exp(-mr.beat * 9) * [1, 0.8, 0.65, 0.5][mr.k & 3] * (I.mo === 0 && sec < SHOW_END ? 0 : 1);
    for (let x = 0; x < W; x++) put(img, W, H, x, 63, C.ground, 0.28 + 0.5 * thump);

    // shields: start of minute + events so far (hour: rebuilt after the boss falls)
    shieldBuf.set(pl.start);
    for (const e of pl.events) { if (e.t > now) break; for (const p of e.px) shieldBuf[p] = 0; }
    let rebuild = null;
    if (pl.show) {
      const old = plan(M - 1).end, t0 = S + pl.show.te + 0.3;
      rebuild = (p) => (old[p] ? 1 : kit.clamp((now - t0 - 1.2 * kit.hash(p, 5, 5)) / 0.25));
    }
    for (let p = 0; p < W * 6; p++) {
      if (!shieldBuf[p]) continue;
      let a = 0.5, flash = 0;
      if (rebuild) { const k = rebuild(p); if (k <= 0) continue; if (k < 1) { a *= k; flash = 1 - k; } }
      const x = p % W, y = SHIELD_Y + ((p / W) | 0);
      put(img, W, H, x, y, C.shield, a);
      if (flash) put(img, W, H, x, y, [1, 1, 1], 0.6 * flash);
    }

    // --- the formation
    const tp = pl.tp, tn = pl.tn;
    for (let j = 0; j < 4; j++) {
      const d = I.dig[j];
      for (const a of DIGITS[d]) {
        const spr = SPECIES[a.row][frame], col = SPCOL[a.row];
        let x = x0 + SLOT_X[j] + a.hx * 3, y = yf + 6 * a.row, alpha = 1, c = col;
        if (pl.show && sec < 2) {
          // sprayed out of the mothership along an arc
          const s = pl.show.spray.find((q) => q.j === j && q.hx === a.hx && q.row === a.row);
          const u = (now - s.tl) / 0.5;
          if (u < 0) continue;
          if (u < 1) {
            const e = kit.smoothstep(0, 1, u), sx = shipX(s.tl, S) - 2, sy = 7, cx = x, cy = 3;
            x = (1 - e) ** 2 * sx + 2 * e * (1 - e) * cx + e * e * x;
            y = (1 - e) ** 2 * sy + 2 * e * (1 - e) * cy + e * e * y;
            alpha = Math.min(1, u * 6);
          }
        } else if (pl.showN && sec > 58.75) {
          // the tractor beam lifts the old hour into the ship
          const st = S + 58.8 + 0.03 * a.row, u = kit.clamp((now - st) / (1.16 - 0.03 * a.row));
          const e = kit.ease.in(u);
          y = y + (3 - y) * e;
          x = x + (shipX(now, S + 60) - 2 - x) * kit.smoothstep(0.65, 1, u);
          alpha = 1 - kit.smoothstep(0.78, 1, u);
          if (alpha <= 0) continue;
        } else {
          if (tp.changed[j] && sec < 1.4) {
            const u = kit.clamp((sec - 0.03 - 0.05 * (5 - a.row)) / 0.8);
            if (u <= 0) continue;
            y -= 46 * (1 - kit.ease.out(u));
            // a white flash as each one locks into place
            if (u >= 1) { const fl = 1 - kit.clamp((sec - 0.03 - 0.05 * (5 - a.row) - 0.8) / 0.18); if (fl > 0) c = kit.mix(col, [1, 1, 1], fl * 0.8); }
          }
          if (tn.changed[j]) {
            const k = tn.map.get(kill_id(j, a));
            if (k && now >= k.ti) continue;
            const panic = kit.clamp((now - (tn.T0 - 0.35)) / 0.3);
            if (panic > 0) { c = kit.mix(col, C.doom, panic * (0.55 + 0.45 * Math.sin(now * 40))); x += panic * 0.5 * Math.sin(now * 31 + a.hx); }
          }
        }
        blit(img, W, H, spr, x, y, [null, c], alpha);
      }
    }

    // explosions of shot aliens (this turn's and the last one's)
    for (const p of [tp, tn]) for (const k of p.kills) if (now >= k.ti && now < k.ti + 0.9) burst(k.ti, now, k.ex, k.ey, k.col, k.seed);

    // frog shots
    for (const s of pl.shots) {
      if (now < s.tf || now >= s.ti) continue;
      const y = SHOT_Y - SHOT_V * (now - s.tf), xs = s.xs ?? s.x, q = (now - s.tf) / (s.ti - s.tf);
      const dxs = (s.x - xs) / (SHOT_V * (s.ti - s.tf));
      for (let i = 0; i < 4; i++) dot(img, W, H, xs + (s.x - xs) * q - dxs * i, y + i, C.shot, 1 - i * 0.22);
    }
    // alien bombs
    for (const b of pl.bombs) {
      if (now < b.td) continue;
      if (now < b.tStop) {
        const fr = (b.type ? SP.PLUNGER : SP.SQUIGGLE)[Math.floor(now * 14) & 3];
        blit(img, W, H, fr, b.x - 1, b.y0 + BOMB_V * (now - b.td), [null, C.bomb], 0.9);
      } else if (now < b.tStop + 0.5) {
        const age = now - b.tStop;
        burst(b.tStop, now, b.x - 2, b.stopY - 3, b.ground ? C.bomb : C.shield, b.x * 13 + b.td, 5, 0.6);
        if (age < 0.15) dot(img, W, H, b.x - 0.5, b.stopY - 1, [1, 1, 1], 1 - age / 0.15);
      }
    }
    // the UFO
    const u = pl.ufo;
    if (u && now >= u.tu && now < u.end) {
      const dead = u.hit && now >= u.hit.ti;
      if (!dead) blit(img, W, H, SP.UFO[Math.floor(now * 6) & 1], u.xu(now), 0, [null, C.ufo, C.ufoLit], 0.85);
      else burst(u.hit.ti, now, u.xu(u.hit.ti) + 3, 0, C.ufo, M, 10, 1.2);
    }
    // the mothership
    const shipShow = pl.show && sec < pl.show.te + 1.5 ? pl.show : pl.showN && sec > 56.4 ? pl.showN : null;
    if (shipShow) {
      const SS = shipShow.S, sx = shipX(now, SS) - 16, sy = shipY(now, SS);
      const te = SS + shipShow.te;
      if (now < te) {
        const flash = shipShow.hits.reduce((m, h) => Math.max(m, now >= h.ti && now < h.ti + 0.14 ? 1 - (now - h.ti) / 0.14 : 0), 0);
        const pal = flash ? MOTHER_PAL.map((c) => c && kit.mix(c, [1, 1, 1], flash)) : MOTHER_PAL;
        blit(img, W, H, SP.MOTHER, sx, sy, pal, 1);
        for (const h of shipShow.hits) if (now >= h.ti) burst(h.ti, now, h.x - 2, 6, C.fire, h.ti * 100, 6, 0.8);
        // tractor beam
        const ba = kit.smoothstep(SS - 1.7, SS - 1.4, now) * (1 - kit.smoothstep(SS - 0.15, SS + 0.1, now));
        if (ba > 0) {
          for (let y = 10; y < 46; y++) {
            const v = (y - 10) / 36, half = 9 + v * 52, cx = sx + 16;
            const sh = 0.55 + 0.45 * Math.sin(y * 0.9 - now * 18);
            for (let x = Math.max(0, Math.floor(cx - half)); x <= Math.min(W - 1, Math.ceil(cx + half)); x++) {
              const edge = kit.smoothstep(half, half - 3, Math.abs(x - cx));
              put(img, W, H, x, y, C.beam, ba * edge * sh * (0.12 - 0.07 * v));
            }
          }
        }
      } else {
        // the boss explodes: its plates fly apart, a shock ring runs out
        const age = now - te, cx = shipX(te, SS), cy = 5;
        if (age < 1.6) {
          const px = SP.MOTHER.px;
          for (let p = 0; p < px.length; p++) {
            if (!px[p]) continue;
            const i = p % 33, jj = (p / 33) | 0, hh = kit.hash(p, 3, 9);
            const vx = (i - 16) * 2.4 + (hh - 0.5) * 30, vy = (jj - 6) * 4 - 25 * kit.hash(p, 4, 9);
            const X = cx - 16 + i + vx * age, Y = cy - 5 + jj + vy * age + 45 * age * age;
            const heat = kit.clamp(1 - age / 1.2);
            dot(img, W, H, X, Y, kit.mix(MOTHER_PAL[px[p]] || C.fire, kit.mix(C.fire, [1, 1, 1], heat), heat), 1 - age / 1.6);
          }
        }
        if (age < 0.9) {
          const r = 4 + 100 * kit.ease.out(age / 0.9), a = 0.7 * (1 - age / 0.9);
          for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const d = Math.abs(Math.hypot(x - cx, (y - cy) * 1.15) - r);
            if (d < 2.5) put(img, W, H, x, y, C.fire, a * (1 - d / 2.5));
          }
        }
      }
    }

    // --- the frog in its tank
    const [fx, vel] = frogX(pl.keys, now);
    let lastFire = -9;
    for (const s of pl.shots) if (s.tf <= now && s.tf > lastFire) lastFire = s.tf;
    const firing = now - lastFire;
    const look = firing < 0.5 || (shipShow && now > shipShow.S - 3) ? -1 : 0;
    const lx = Math.abs(vel) < 2 ? 0 : vel > 0 ? 1 : -1;
    const left = fx - 9;
    blit(img, W, H, FROGS[`${lx},${look}`], left, FROG_Y + (firing < 0.08 ? 1 : 0), firing < 0.15 ? FROG_PAL_OPEN : FROG_PAL, 1);
    // treads roll with the tank
    const ph = Math.floor(fx);
    for (let i = 0; i < 19; i++) {
      const lit = ((i + ph) % 3 + 3) % 3 === 0 ? 0.55 : 0.25;
      if (i > 0 && i < 18) dot(img, W, H, left + i, FROG_Y + 15, C.white, 0.4 * lit);
      dot(img, W, H, left + i, FROG_Y + 14, kit.hex('#8a9cb0'), lit);
    }
    if (firing < 0.1) dot(img, W, H, fx - 0.5, SHOT_Y - 1, [1, 1, 1], 1 - firing / 0.1);

    kit.blitGrid(ctx, img, 1 - 0.6 * ctx.night);
  },
};
