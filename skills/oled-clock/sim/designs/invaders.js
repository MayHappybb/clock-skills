// Invaders — the time is the attack wave.
//
// Each digit of HH:MM is a 3x5 block of space invaders (the 3x5 font, one
// invader per pixel), so the whole formation spells the time: a squid row on
// top, two crab rows, two octopus rows, like the arcade wave. The formation
// marches edge to edge in two-pixel steps, legs flipping on every beat, and
// the beat quickens as the minute runs out, the way the original's did.
//
// All minute the invaders drop bombs. Bombs over a shield chew craters in it;
// bombs over a gap are shot out of the air by the cannon, which slides about
// under the shields. In most minutes a mystery ship crosses the yellow band and
// the cannon snipes it through the gap between two digits (the score pops up).
//
// The minute turn: the formation halts, and the cannon shoots every invader of
// each digit that is about to change, column by column, bottom up, tunnelling
// through the shields as it goes. Then a mystery ship runs in from the right
// and drops the new digit's invaders out of its belly; they fall into their
// slots and the march resumes at :00. On the hour (and at :X9 -> :X0) more
// digits change, so the shoot-out starts earlier and lasts longer.
//
// Everything is a pure function of the clock: frame() rebuilds the minute's
// plan (march beats, bombs, cannon route, the turn's shots and drops) from the
// digits of this minute and the next, and from minuteKey for the randomness,
// then simulates the shields from the start of the minute to now.
//
// Layout (yellow-blue panel): rows 0-15 are the yellow band, the arcade's
// coloured overlay strip: score, date and the mystery ship's lane. The wave,
// shields and cannon are in the blue below row 16.
//
// Burn-in: the formation marches across 14 px all minute, and over the
// minutes walks down 0-2 rows and a pixel sideways; the shields are rebuilt
// every minute and creep a pixel a minute round the width; the band's text
// slides to and fro; the cannon never stops.

import { sprite, font3x5, noise, orbit, clamp, OFF, ON } from '../js/kit.js';

// ------------------------------------------------------------ geometry

const CELL_W = 7, CELL_H = 5, PITCH_X = 8, PITCH_Y = 6;
const DIGIT_W = 3 * PITCH_X - 1;                 // 23
const SLOT_X = [0, 28, 62, 90];                  // left edge of each digit at ox = 0
const COLON_X = 55;
const MARCH_STEPS = 7, STEP_PX = 2;              // ox runs 0..14 and back
const FORM_Y = 16;                               // top of the wave (first blue row)
const SHIELD_Y = 53, SHIELD_W = 14, SHIELD_H = 4;
const SHIELD_X = [9, 41, 73, 105];
const CANNON_Y = 58, CANNON_TIP = 57;
const UFO_Y = 8, UFO_W = 16;

// Speeds, px/s, and timings, s.
const SHOT_V = 170, BOMB_V = 26, CANNON_V = 42, CANNON_RUSH = 110;
const FIRE_GAP = 0.09, UFO_V = 64, DROP_G = 520, RELEASE_GAP = 0.05;
const LAND_BY = 60.1, MARCH_FROM = 0.4;

// Font cells for a digit: rows of 3 bits.
const GLYPH = {};
for (let d = 0; d <= 9; d++) {
  const s = font3x5.glyph(String(d));
  GLYPH[d] = [0, 1, 2, 3, 4].map((r) => [0, 1, 2].map((c) => s.data[r * s.w + c]));
}

// ------------------------------------------------------------ sprites

// Three kinds, two frames each, cut down from the arcade's 8-12 px originals
// to 7x5 so a 3x5 block of them is a digit.
const SQUID = [sprite(`
  ..###..
  .#####.
  ##.#.##
  .#####.
  #.#.#.#
`), sprite(`
  ..###..
  .#####.
  ##.#.##
  .#####.
  .#...#.
`)];
const CRAB = [sprite(`
  .#...#.
  .#####.
  ##.#.##
  #######
  .#...#.
`), sprite(`
  .#...#.
  #.###.#
  ##.#.##
  #######
  #.....#
`)];
const OCTO = [sprite(`
  .#####.
  ##.#.##
  #######
  .#.#.#.
  #.....#
`), sprite(`
  .#####.
  ##.#.##
  #######
  .##.##.
  ..#.#..
`)];
const KIND = [SQUID, CRAB, CRAB, OCTO, OCTO];
const POINTS = [30, 20, 20, 10, 10];

const POP = sprite(`
  #..#..#
  .#...#.
  ##...##
  .#...#.
  #..#..#
`);
const UFO = sprite(`
  .....######.....
  ...##########...
  ..############..
  .##.##.##.##.##.
  ################
  ..###..##..###..
  ...#........#...
`);
const UFO_BOOM = sprite(`
  #...#..#..#...#.
  .#..#.....#..#..
  ..#...#..#...#..
  #...######.....#
  ...##########...
  .#..#.#..#.#..#.
  #...#..#...#...#
`);
const CANNON = sprite(`
  .....#.....
  ....###....
  .#########.
  ###########
  ###########
  ###########
`);
const SHIELD = sprite(`
  ..##########..
  .############.
  ##############
  ####......####
`);
const BOMB = [sprite(`
  .#.
  #..
  .#.
  ..#
  .#.
`), sprite(`
  .#.
  ..#
  .#.
  #..
  .#.
`)];
const PLUNGER = [sprite(`
  .#.
  .#.
  .#.
  ###
  .#.
`), sprite(`
  .#.
  ###
  .#.
  .#.
  .#.
`)];
const BURST = sprite(`
  #...#
  .#.#.
  ..#..
  .#.#.
  #...#
`);
const SPLAT = sprite(`
  #.#.#
  .###.
  #####
`);

// ------------------------------------------------------------ the plan

const digitsOf = (f) => [f.hh[0], f.hh[1], f.mm[0], f.mm[1]].map(Number);
const cellX = (d, c, ox) => SLOT_X[d] + c * PITCH_X + ox;
const cellY = (r, dy) => FORM_Y + dy + r * PITCH_Y;

/**
 * The turn from digits `a` (this minute) to `b` (the next), in seconds of
 * this minute: the cannon's shots at the old invaders, and the mystery
 * ship's drops of the new ones, timed so the last lands at LAND_BY.
 */
function turnPlan(a, b, dy, base) {
  const changed = [3, 2, 1, 0].filter((d) => a[d] !== b[d]);
  // The ship's left edge is at 128 - UFO_V * (t - ufo0); each column's new
  // invaders leave its belly, bottom row first, as its middle passes over.
  const drops = [];
  for (const d of changed)
    for (let c = 2; c >= 0; c--) {
      const over = (128 + UFO_W / 2 - (cellX(d, c, base) + 3)) / UFO_V;
      let k = 0;
      for (let r = 4; r >= 0; r--) {
        if (!GLYPH[b[d]][r][c]) continue;
        const rel = over + 0.06 + k++ * RELEASE_GAP, y0 = UFO_Y + 2, y1 = cellY(r, dy);
        drops.push({ d, c, r, rel, land: rel + Math.sqrt((2 * (y1 - y0)) / DROP_G), y0, y1 });
      }
    }
  const ufo0 = LAND_BY - Math.max(...drops.map((q) => q.land));
  for (const q of drops) { q.rel += ufo0; q.land += ufo0; }

  // The shoot-out: right to left, each column bottom up, each shot taking
  // the lowest invader still standing in it. Built from 0, then shifted so
  // the last hit lands just before the ship arrives.
  const shots = [];
  let t = 0, x = null;
  for (const d of changed)
    for (let c = 2; c >= 0; c--) {
      const rows = [4, 3, 2, 1, 0].filter((r) => GLYPH[a[d]][r][c]);
      if (!rows.length) continue;
      const cx = cellX(d, c, base) + 3;
      if (x !== null) t += Math.abs(cx - x) / CANNON_RUSH + 0.05;
      x = cx;
      for (const r of rows) {
        const yHit = cellY(r, dy) + CELL_H - 1;
        shots.push({ d, c, r, x: cx, fire: t, hit: t + (CANNON_TIP - yHit) / SHOT_V });
        t += FIRE_GAP;
      }
    }
  const shift = ufo0 - 0.3 - Math.max(...shots.map((s) => s.hit));
  for (const s of shots) { s.fire += shift; s.hit += shift; }
  const start = shots[0].fire - 0.35;
  return { changed, shots, drops, ufo0, start, freeze: start - 0.3, firstX: shots[0].x, lastX: x };
}

/** The march: beats quicken through the minute and always end back at ox = 0. */
function marchOf(turn, base) {
  const span = turn.freeze - MARCH_FROM;
  const cycle = 2 * MARCH_STEPS;
  const B = cycle * Math.max(1, Math.round(span / (cycle * 0.42)));
  // Beat i falls at w(i/B) of the span, w(u) = 1.5u - 0.5u^2: the first beats
  // come three times further apart than the last.
  const beatAt = (n) => MARCH_FROM + span * (1.5 * (n / B) - 0.5 * (n / B) ** 2);
  const beats = (sec) => {
    if (sec <= MARCH_FROM) return 0;
    if (sec >= turn.freeze) return B;
    const s = (sec - MARCH_FROM) / span;
    return Math.min(B, Math.floor((1.5 - Math.sqrt(2.25 - 2 * s)) * B + 1e-9));
  };
  const ox = (n) => { const p = n % cycle; return base + STEP_PX * (p <= MARCH_STEPS ? p : cycle - p); };
  return { B, beatAt, beats, ox };
}

/** The mystery ship worth shooting, in most minutes; the cannon snipes it through a gap in the wave. */
function bonusPlan(key, march) {
  if (noise(key, 41) > 0.72) return null;
  const n = march.beats(20 + 16 * noise(key, 42));
  const fire = march.beatAt(n) + 0.03;           // just after a beat: the wave cannot step into the shot
  const gapX = noise(key, 43) < 0.5 ? 25 : 87;   // middle of the gap after H1, or after M1
  const x = gapX + march.ox(n);
  const hit = fire + (CANNON_TIP - (UFO_Y + 6)) / SHOT_V;
  return { fire, hit, x, dir: noise(key, 44) < 0.5 ? 1 : -1, points: [50, 100, 150, 300][Math.floor(noise(key, 45) * 4)] };
}
const BONUS_V = 30;

/** Which shield covers column x, if any. They wrap round the edges as they creep. */
const shieldAt = (x, sx) => SHIELD_X.findIndex((s0) => (((x - s0 - sx) % 128) + 128) % 128 < SHIELD_W);
const shieldCol = (x, i, sx) => (((x - SHIELD_X[i] - sx) % 128) + 128) % 128;

/**
 * Bombs, and the cannon's appointments to shoot the ones over a gap. Each
 * bomb leaves the lowest invader of a column; one over a shield hits it.
 */
function bombPlan(key, a, turn, march, bonus, dy, sx, x0) {
  const bombs = [], appts = [];
  let last = { t: 0, x: x0 };
  let t = 2.2 + 2 * noise(key, 21);
  for (let i = 0; t < turn.freeze - 1.6; i++, t += 2 + 2.8 * noise(key, 30 + i)) {
    if (bonus && t > bonus.fire - 2.4 && t < bonus.hit + 0.3) continue;
    const ox = march.ox(march.beats(t));
    const cols = [];
    for (let d = 0; d < 4; d++)
      for (let c = 0; c < 3; c++) {
        const r = [4, 3, 2, 1, 0].find((rr) => GLYPH[a[d]][rr][c]);
        if (r !== undefined) cols.push({ x: cellX(d, c, ox) + 3, y: cellY(r, dy) + CELL_H + 1 });
      }
    // Two bombs in three come from over a gap, where the cannon can get at them.
    const k0 = Math.floor(noise(key, 50 + i) * cols.length);
    const order = cols.map((_, j) => cols[(k0 + j * 5) % cols.length]);
    const overShield = (x) => shieldAt(x - 1, sx) >= 0 && shieldAt(x, sx) >= 0 && shieldAt(x + 1, sx) >= 0;
    const overGap = (x) => shieldAt(x - 1, sx) < 0 && shieldAt(x, sx) < 0 && shieldAt(x + 1, sx) < 0;
    const wantGap = noise(key, 60 + i) < 0.67;
    const kind = noise(key, 70 + i) < 0.5 ? BOMB : PLUNGER;
    let done = false;
    for (const pass of wantGap ? ['gap', 'shield'] : ['shield', 'gap']) {
      for (const { x, y } of order) {
        if (pass === 'shield' && overShield(x)) { bombs.push({ x, y, t0: t, kind, fate: 'shield' }); done = true; break; }
        if (pass !== 'gap' || !overGap(x)) continue;
        // Over a gap: the cannon shoots it point-blank, just above itself.
        const meet = t + (MEET_Y - 4 - y) / BOMB_V;
        const fire = meet - (CANNON_TIP - MEET_Y) / SHOT_V;
        if (x < 6 || x > 121 || Math.abs(x - last.x) / CANNON_V > fire - last.t - 0.15) continue;
        if (bonus && fire < bonus.fire && Math.abs(x - bonus.x) / CANNON_V > bonus.fire - 0.3 - fire - 0.2) continue;
        bombs.push({ x, y, t0: t, kind, fate: 'shot', meet, fire });
        appts.push({ t: fire, x });
        last = { t: fire, x };
        done = true;
        break;
      }
      if (done) break;
    }
    if (bonus && t > bonus.hit) last = last.t < bonus.fire ? { t: bonus.fire + 0.1, x: bonus.x } : last;
  }
  return { bombs, appts };
}
const MEET_Y = 55;

/** The cannon's route as keyframes [t, x]: a wander between appointments, arriving on time. */
function cannonRoute(key, x0, appts, turn) {
  const kf = [[0, x0]];
  const goTo = (t, x, v, i) => {
    let [tp, xp] = kf[kf.length - 1];
    // Time to spare: keep drifting about, as a player would, a hop every
    // second or two, as long as there is still time to get to `x`.
    for (let k = 0; k < 12; k++) {
      const w = clamp(xp + (noise(key, 90 + i * 13 + k) - 0.5) * 70, 8, 119);
      const pause = 0.2 + 0.9 * noise(key, 300 + i * 13 + k);
      const there = tp + pause + Math.abs(w - xp) / v;
      if (there + Math.abs(x - w) / v + 0.3 > t) break;
      kf.push([tp + pause, xp], [there, w]);
      [tp, xp] = [there, w];
    }
    const travel = Math.abs(x - xp) / v;
    if (t - tp > travel) kf.push([t - travel, xp]);
    kf.push([t, x]);
  };
  appts.forEach((p, i) => { goTo(p.t, p.x, CANNON_V, i); if (p.hold) kf.push([p.t + p.hold, p.x]); });
  turn.shots.forEach((s, i) => goTo(s.fire, s.x, i ? CANNON_RUSH : CANNON_V, 200 + i));
  kf.push([61, turn.lastX]);
  return (t) => {
    if (t <= kf[0][0]) return kf[0][1];
    for (let i = 1; i < kf.length; i++)
      if (t <= kf[i][0]) {
        const [ta, xa] = kf[i - 1], [tb, xb] = kf[i];
        return tb > ta ? xa + ((xb - xa) * (t - ta)) / (tb - ta) : xb;
      }
    return kf[kf.length - 1][1];
  };
}

/** The shields at second `sec`: fresh each minute, then cratered by bombs and the shoot-out. */
function shieldsAt(sec, bombs, shots, sx, sy) {
  const S = SHIELD_X.map(() => Uint8Array.from(SHIELD.data));
  const lit = (i, c, r) => c >= 0 && c < SHIELD_W && r >= 0 && r < SHIELD_H && S[i][r * SHIELD_W + c];
  const clear = (i, c, r) => { if (c >= 0 && c < SHIELD_W && r >= 0 && r < SHIELD_H) S[i][r * SHIELD_W + c] = 0; };
  const events = [];
  for (const b of bombs) if (b.fate === 'shield') events.push({ t: b.t0, b });
  for (const s of shots) events.push({ t: s.fire, s });
  events.sort((p, q) => p.t - q.t);
  const hits = [];
  for (const e of events) {
    if (e.t > sec) break;
    if (e.b) {
      const b = e.b, i = shieldAt(b.x, sx), c = shieldCol(b.x, i, sx);
      // The first lit pixel under the bomb's three columns.
      let r = 0;
      while (r < SHIELD_H && !lit(i, c - 1, r) && !lit(i, c, r) && !lit(i, c + 1, r)) r++;
      const yHit = SHIELD_Y + sy + r;
      const tHit = b.t0 + (yHit - 5 - b.y) / BOMB_V;
      b.end = tHit; b.yEnd = yHit - 5;
      if (r === SHIELD_H) { b.end = b.t0 + (63 - 5 - b.y) / BOMB_V; b.yEnd = 63 - 5; continue; }
      if (tHit > sec) continue;
      hits.push({ x: b.x, y: yHit, t: tHit });
      for (const [dc, dr] of [[0, 0], [-1, 0], [1, 0], [0, 1]]) clear(i, c + dc, r + dr);
      clear(i, c + (noise(b.t0, 3) < 0.5 ? -1 : 1), r + 1);
    } else {
      // A shoot-out shot tunnels up through any shield in its way.
      const s = e.s, i = shieldAt(s.x, sx);
      if (i < 0) continue;
      const c = shieldCol(s.x, i, sx);
      let r = SHIELD_H - 1;
      while (r >= 0 && !lit(i, c, r)) r--;
      if (r < 0) continue;
      for (const [dc, dr] of [[0, 0], [-1, 0], [1, 0], [0, -1]]) clear(i, c + dc, r + dr);
    }
  }
  return { S, hits };
}

/** Points scored in the minute keyed by `f` (its shoot-out and its mystery ship), up to `upTo` seconds. */
function minutePoints(fNow, fNext, key, upTo, turn, bonus) {
  const a = digitsOf(fNow), b = digitsOf(fNext);
  let p = 0;
  for (let d = 0; d < 4; d++) {
    if (a[d] === b[d]) continue;
    for (let r = 0; r < 5; r++)
      for (let c = 0; c < 3; c++) {
        if (!GLYPH[a[d]][r][c]) continue;
        if (turn) { const s = turn.shots.find((q) => q.d === d && q.c === c && q.r === r); if (s.hit > upTo) continue; }
        p += POINTS[r];
      }
  }
  if (noise(key, 41) <= 0.72 && (!bonus || bonus.hit <= upTo)) p += [50, 100, 150, 300][Math.floor(noise(key, 45) * 4)];
  return p;
}

// ------------------------------------------------------------ drawing

const fallY = (q, t) => (t < q.land ? q.y0 + 0.5 * DROP_G * (t - q.rel) ** 2 : q.y1);
const shotTop = (fire, t) => Math.round(CANNON_TIP - 2 - SHOT_V * (t - fire));

/** A turn's mystery ship, at second `t` of the minute the turn belongs to. */
function drawCarrier(g, turn, t) {
  if (t < turn.ufo0) return;
  const x = Math.round(128 - UFO_V * (t - turn.ufo0));
  if (x > -UFO_W) g.blit(UFO, x, UFO_Y);
}

export default {
  name: 'Invaders',
  blurb: 'The time is the attack wave: the cannon shoots the old minute apart and a mystery ship drops the new one in.',
  module: '096-128x64',
  colour: 'yellow-blue',
  bus: 'spi10',
  fps: 60,

  frame(g, { fields: f, date, kit }) {
    const sec = f.sec, key = f.minuteKey;
    const next = kit.clockFields(new Date(date.getTime() + 60000));
    const a = digitsOf(f), b = digitsOf(next), p = digitsOf(kit.previousMinute(date));
    // The wave's own walk against burn-in: down 0-2 rows, and a pixel
    // sideways so the two-pixel march does not always land on even columns.
    const dy = Math.floor(key / 3) % 3, base = Math.floor(key / 5) % 2;
    const sx = key % 32;                           // the shields creep a pixel a minute, wrapping,
    const sy = orbit(date, 1, 7)[1];               // and walk a pixel up and down

    const turn = turnPlan(a, b, dy, base), prevTurn = turnPlan(p, a, dy, base);
    const march = marchOf(turn, base);
    const bonus = bonusPlan(key, march);
    const { bombs, appts } = bombPlan(key, a, turn, march, bonus, dy, sx, prevTurn.lastX);
    if (bonus) appts.push({ t: bonus.fire - 0.3, x: bonus.x, hold: 0.4 });
    appts.sort((u, v) => u.t - v.t);
    const cannonX = cannonRoute(key, prevTurn.lastX, appts, turn);

    const n = march.beats(sec), ox = march.ox(n), legs = n % 2;

    // Shields, as cratered so far this minute.
    const { S } = shieldsAt(sec, bombs, turn.shots, sx, sy);
    S.forEach((m, i) => {
      for (let r = 0; r < SHIELD_H; r++)
        for (let c = 0; c < SHIELD_W; c++) if (m[r * SHIELD_W + c]) g.pixel((SHIELD_X[i] + sx + c) % 128, SHIELD_Y + sy + r);
    });

    // Bombs, the cannon's shots at them, and what they hit.
    for (const bm of bombs) {
      if (sec < bm.t0) continue;
      const end = bm.fate === 'shot' ? bm.meet : bm.end;
      if (sec < end) g.blit(bm.kind[Math.floor(sec * 8) % 2], bm.x - 1, Math.round(bm.y + BOMB_V * (sec - bm.t0)));
      else if (bm.fate === 'shot' && sec < end + 0.15) g.blit(BURST, bm.x - 2, MEET_Y - 4);
      else if (bm.fate === 'shield' && sec < end + 0.12) g.blit(SPLAT, bm.x - 2, bm.yEnd + 3);
      if (bm.fate === 'shot' && sec >= bm.fire && sec < bm.meet) g.vline(bm.x, shotTop(bm.fire, sec), 3);
    }

    // The cannon.
    g.blit(CANNON, Math.round(cannonX(sec)) - 5, CANNON_Y);

    // The wave: this minute's digits, less what the shoot-out has taken,
    // plus whatever is still falling into place from the last turn.
    for (let d = 0; d < 4; d++)
      for (let r = 0; r < 5; r++)
        for (let c = 0; c < 3; c++) {
          if (!GLYPH[a[d]][r][c]) continue;
          if (prevTurn.changed.includes(d)) {
            const q = prevTurn.drops.find((u) => u.d === d && u.c === c && u.r === r);
            if (sec + 60 < q.land) { g.blit(KIND[r][0], cellX(d, c, base), Math.round(fallY(q, sec + 60))); continue; }
          }
          if (turn.changed.includes(d)) {
            const s = turn.shots.find((u) => u.d === d && u.c === c && u.r === r);
            if (sec >= s.hit) { if (sec < s.hit + 0.25) g.blit(POP, cellX(d, c, base), cellY(r, dy)); continue; }
          }
          g.blit(KIND[r][legs], cellX(d, c, ox), cellY(r, dy));
        }
    for (const r of [1, 3]) g.fillRect(COLON_X + ox, cellY(r, dy) + 1, 3, 3);

    // The turn: shots climbing the columns, the new wave dropping in.
    for (const s of turn.shots) if (sec >= s.fire && sec < s.hit) g.vline(s.x, shotTop(s.fire, sec), 3);
    for (const q of turn.drops) if (sec >= q.rel) g.blit(KIND[q.r][0], cellX(q.d, q.c, base), Math.round(fallY(q, sec)));
    drawCarrier(g, turn, sec);
    drawCarrier(g, prevTurn, sec + 60);

    // The mystery ship worth points.
    if (bonus) {
      if (sec < bonus.hit) {
        g.blit(UFO, Math.round(bonus.x + bonus.dir * BONUS_V * (sec - bonus.hit)) - UFO_W / 2, UFO_Y);
        if (sec >= bonus.fire) g.vline(bonus.x, shotTop(bonus.fire, sec), 3);
      } else if (sec < bonus.hit + 0.4) g.blit(UFO_BOOM, bonus.x - UFO_W / 2, UFO_Y);
      else if (sec < bonus.hit + 1.6) {
        const txt = String(bonus.points);
        g.text(txt, bonus.x - Math.floor(font3x5.measure(txt) / 2), UFO_Y + 1, { font: font3x5 });
      }
    }

    // The yellow band: the score this hour, and the date.
    let score = 0;
    for (let k = f.m; k >= 1; k--) {
      const d0 = new Date(date.getTime() - k * 60000);
      score += minutePoints(kit.clockFields(d0), kit.clockFields(new Date(d0.getTime() + 60000)), key - k, Infinity, null, null);
    }
    score += minutePoints(f, next, key, sec, turn, bonus);
    // The band's text slides a pixel a minute, to and fro across the free
    // width, so no letter sits on the same pixels for long; the ship's lane
    // is below it.
    const scoreTxt = `SCORE ${String(score).padStart(5, '0')}`, dateTxt = `${f.dow} ${f.day} ${f.month}`;
    const span = font3x5.measure(scoreTxt) + 12 + font3x5.measure(dateTxt);
    const room = 126 - span, k = key % (2 * room);
    const hx = 1 + (k <= room ? k : 2 * room - k), ty = 1 + (Math.floor(key / 7) % 2);
    const x2 = g.text(scoreTxt, hx, ty, { font: font3x5 });
    g.text(dateTxt, x2 + 12, ty, { font: font3x5 });
  },
};
