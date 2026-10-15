// Dino — the Chrome offline T-Rex, running out the minutes.
//
// The ground scrolls, cacti come, and the T-Rex jumps them; now and then a
// pterodactyl comes in at head height and it ducks. The sprites are the
// game's own, at the game's own art scale (the 1x sprite sheet draws the
// T-Rex with 2-pixel art pixels, so one art pixel here is one OLED pixel):
// a 20x21 T-Rex with its two-frame run, the 27x13 duck, the pterodactyl's
// two wingbeats, the small and large saguaros.
//
// The time sits in the sky as the game's score would, in a chunky 5x7 drawn
// at 3x. Near the end of the minute a pterodactyl flaps in along the top and
// stomps the digit that is about to change: it drops out of its slot onto
// the track with a thud and a puff of dust, the ground carries it to the
// T-Rex, and the T-Rex jumps it. The slot stays empty until :00, when the new
// digit drops out of the sky into it. When several digits change (:X9, the
// hour) the bird stomps them one after another, right to left, spaced so each
// fallen digit can be jumped on its own, and all the new digits drop in
// together at :00: the glass only ever shows this minute, the next, or gaps.
//
// Everything comes from the clock. The ground's scroll is the wall-clock time
// times its speed, so it is continuous across minutes; each minute's cacti
// and birds are drawn from minuteKey and placed by the time they reach the
// T-Rex; the T-Rex's jumps and ducks are worked out from those obstacles
// (including the digits fallen in the last minute's turn), and each jump is a
// parabola with the game's fixed gravity, as high as that obstacle needs.
//
// At night (20:00-06:00) the clouds give way to stars and a moon.
//
// Burn-in: the time block walks a 3-pixel orbit; the ground, the T-Rex and
// the track walk a pixel up and down; everything else moves all the time.

import { sprite, font3x5, noise, orbit, clamp, ease, progress, OFF, ON } from '../js/kit.js';

// ------------------------------------------------------------ sprites
// From the Chrome T-Rex sprite sheet (via the t-rex-duino project's 1x
// extraction), '#' only; the game's white outline becomes a dark keyline here.

const TREX_RUN = [sprite(`
  ...........########.
  ..........##.#######
  ..........##########
  ..........##########
  ..........##########
  ..........#####.....
  ..........########..
  #........#####......
  #......#######......
  ##....##########....
  ###..#########.#....
  ##############......
  ##############......
  .############.......
  ..###########.......
  ...#########........
  ....#######.........
  .....###..##........
  .....##.............
  .....#..............
  .....##.............
`), sprite(`
  ...........########.
  ..........##.#######
  ..........##########
  ..........##########
  ..........##########
  ..........#####.....
  ..........########..
  #........#####......
  #......#######......
  ##....##########....
  ###..#########.#....
  ##############......
  ##############......
  .############.......
  ..###########.......
  ...#########........
  ....#######.........
  .....##..##.........
  ......##..#.........
  ..........#.........
  ..........##........
`)];
// Both feet down: the game uses it in the air.
const TREX_AIR = sprite(`
  ...........########.
  ..........##.#######
  ..........##########
  ..........##########
  ..........##########
  ..........#####.....
  ..........########..
  #........#####......
  #......#######......
  ##....##########....
  ###..#########.#....
  ##############......
  ##############......
  .############.......
  ..###########.......
  ...#########........
  ....#######.........
  .....###.##.........
  .....##...#.........
  .....#....#.........
  .....##...##........
`);
const TREX_DUCK = [sprite(`
  #.................########.
  ###....########..##########
  ###################.#######
  .##########################
  ..#########################
  ...########################
  ....##################.....
  .....###########..#######..
  ......######..#............
  .....#..###...##...........
  .....##.##.................
  ........#..................
  ........##.................
`), sprite(`
  #.................########.
  ###....########..##########
  ###################.#######
  .##########################
  ..#########################
  ...########################
  ....##################.....
  .....###########..#######..
  ......######..#............
  .....###..###.##...........
  .....##....................
  .....#.....................
  .....##....................
`)];
const PTERO = [sprite(`
  .....................
  .....................
  .....................
  ....##...............
  ...###...............
  ..#####..............
  .######..............
  ##############.......
  ......#########......
  .......##############
  ........##########...
  ........############.
  ........#########....
  ........####.........
  ........###..........
  ........##...........
  ........##...........
  ........#............
`), sprite(`
  .......#.............
  .......##............
  .......###...........
  ....##..###..........
  ...###..####.........
  ..#####.#####........
  .######.######.......
  ##############.......
  ......#########......
  .......##############
  ........##########...
  .........###########.
  ..........#######....
  .....................
  .....................
  .....................
  .....................
  .....................
`)];
const CACTUS_BIG = sprite(`
  .....##.....
  ....####....
  ....####....
  ....####....
  ....####....
  ....####..#.
  .#..####.###
  ###.####.###
  ###.####.###
  ###.####.###
  ###.####.###
  ###.####.###
  ###.####.###
  ###########.
  .#########..
  ..######....
  ....####....
  ....####....
  ....####....
  ....####....
  ....####....
  ....####....
`);
const CACTUS_SMALL = sprite(`
  ...#....
  ...##...
  .#.##...
  ##.##...
  ##.##.##
  ##.##.##
  ##.##.##
  ##.##.##
  ##.##.##
  .####.##
  ...####.
  ...##...
  ...##...
  ...##...
  ...##...
  ...##...
  ...##...
`);
const CLOUD = sprite(`
  .........####.......
  .......##....##.....
  ....###........#....
  ..##............###.
  ##.................#
  ####################
`);
const MOON = sprite(`
  ..###.
  ...###
  ....##
  ....##
  ....##
  ...###
  ..###.
`);

// The score face: a chunky 5x7, drawn at 3x.
const DIGITS = {
  0: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  1: ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  2: ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  3: ['#####', '...#.', '..#..', '...#.', '....#', '#...#', '.###.'],
  4: ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  5: ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  6: ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  7: ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  8: ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  9: ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
};
const DIGIT_SPR = Object.fromEntries(Object.entries(DIGITS).map(([k, v]) => [k, sprite(v)]));
const SCALE = 3, DW = 15, DH = 21;

// ------------------------------------------------------------ geometry

const V = 60;                 // ground speed, px/s (the game starts at ~0.6 canvas widths a second)
const GRAV = 300;             // the T-Rex's gravity, px/s^2
const DROP_G = 700;           // a falling digit's
const GROUND = 58;            // the horizon line
const FOOT = 59;              // bottom row of anything standing on it
const DINO_X = 2;            // the T-Rex's left edge, before its drift; its feet are 8 px in
const SLOT_X = [44, 62, 88, 106], COLON_X = 81, TIME_Y = 9;
const PT_Y = -6;              // the delivering pterodactyl's sprite top
const PT_MID = 29;            // a pterodactyl at head height: duck
const PT_V = V + 10;

const digitsOf = (f) => [f.hh[0], f.hh[1], f.mm[0], f.mm[1]].map(Number);

/** The lowest jump that clears an obstacle `w` wide and `h` tall at speed V, with fixed gravity. */
function jumpFor(w, h) {
  for (let H = h + 5; ; H++) {
    const T = Math.sqrt((8 * H) / GRAV);
    // Time the feet are above h, times speed, must cover the obstacle plus the feet.
    if (T * Math.sqrt(1 - h / H) * V >= w + 8) return { H, T };
  }
}
const DIGIT_JUMP = jumpFor(DW, DH);

const KNOCK_LAST = 58.4;      // the leftmost changing digit is knocked out then
const KNOCK_V = 40;           // how hard the pterodactyl's stomp sends it down, px/s

/**
 * The turn from digits `a` (this minute) to `b` (the next), in seconds of
 * this minute. The pterodactyl stomps each changing digit out of its slot,
 * right to left, spaced so the fallen digits reach the T-Rex one jump apart;
 * the slots stay empty; at :60 every new digit drops in at once and seats.
 * So the glass never shows a time that is neither this one nor the next.
 */
function turnPlan(a, b, tox, toy, cx, sdy) {
  const changed = [3, 2, 1, 0].filter((d) => a[d] !== b[d]);
  const slotY = TIME_Y + toy, y0 = -DH - 2;
  const restTop = FOOT + sdy - DH + 1;
  const tFall = (-KNOCK_V + Math.sqrt(KNOCK_V ** 2 + 2 * DROP_G * (restTop - slotY))) / DROP_G;
  const tIn = Math.sqrt((2 * (slotY - y0)) / DROP_G);
  const items = [];
  let knock = KNOCK_LAST;
  for (let j = changed.length - 1; j >= 0; j--) {
    const d = changed[j];
    if (j < changed.length - 1) knock -= DIGIT_JUMP.T + 0.45 + (SLOT_X[changed[j]] - SLOT_X[changed[j + 1]]) / V;
    const x = SLOT_X[d] + tox, land = knock + tFall;
    items.unshift({ d, from: a[d], to: b[d], x, slotY, y0, restTop, knock, land, drop: 60 - tIn, seat: 60,
      pass: land + (x + DW / 2 - cx) / V });
  }
  return { items, changed };
}

/** Where a turn's digits are at second t of that turn's minute: { newY, oldY, oldX }, null if not shown. */
function digitState(it, t) {
  const s = { newY: null, oldY: it.slotY, oldX: it.x };
  if (t >= it.knock - 0.06 && t < it.knock) s.oldY = it.slotY + 1;           // the stomp lands
  else if (t >= it.knock && t < it.land) {
    const k = t - it.knock;
    s.oldY = it.slotY + 1 + KNOCK_V * k + 0.5 * DROP_G * k * k;
  } else if (t >= it.land) {
    // On the track, with a little bounce, carried off by the ground.
    s.oldY = it.restTop - (t < it.land + 0.14 ? Math.round(2 * Math.sin(Math.PI * (t - it.land) / 0.14)) : 0);
    s.oldX = it.x - V * (t - it.land);
  }
  if (t >= it.drop && t < it.seat) s.newY = it.y0 + 0.5 * DROP_G * (t - it.drop) ** 2;
  else if (t >= it.seat) s.newY = it.slotY - (t < it.seat + 0.12 ? 1 : 0);   // seated, with a bounce
  return s;
}

// Cactus groups, as the game spawns them: one to three small, one or two large, or mixed.
const GROUPS = [
  [[CACTUS_SMALL, 0]],
  [[CACTUS_SMALL, 0], [CACTUS_SMALL, 9]],
  [[CACTUS_SMALL, 0], [CACTUS_SMALL, 9], [CACTUS_SMALL, 18]],
  [[CACTUS_BIG, 0]],
  [[CACTUS_BIG, 0], [CACTUS_BIG, 13]],
  [[CACTUS_BIG, 0], [CACTUS_SMALL, 13]],
].map((parts) => ({
  parts,
  w: Math.max(...parts.map(([s, dx]) => dx + s.w)),
  h: Math.max(...parts.map(([s]) => s.h)),
}));

/** This minute's cacti and birds, between `from` and `to` (times they reach the T-Rex). */
function obstaclePlan(key, from, to) {
  const out = [];
  let t = from + 0.4 + 1.2 * noise(key, 1);
  for (let i = 0; t < to; i++) {
    let o;
    if (t > 6 && noise(key, 10 + i) < 0.16) o = { kind: 'ptero', pass: t, w: 21, until: 0.9 };
    else {
      const gIdx = Math.floor(noise(key, 20 + i) * GROUPS.length);
      const grp = GROUPS[gIdx];
      o = { kind: 'cactus', pass: t, grp, w: grp.w, h: grp.h, jump: jumpFor(grp.w, grp.h) };
      o.until = o.jump.T;
    }
    out.push(o);
    t += o.until + 0.45 + 1.3 * noise(key, 40 + i);
  }
  return out;
}

/** The T-Rex at second t: 'run' | 'air' | 'duck', and its height off the ground. */
function dinoState(t, jumps, ducks) {
  for (const j of jumps)
    if (t >= j.t0 && t < j.t0 + j.T) {
      const u = (t - j.t0) / j.T;
      return { pose: 'air', lift: Math.round(4 * j.H * u * (1 - u)) };
    }
  for (const d of ducks) if (t >= d.t0 && t < d.t1) return { pose: 'duck', lift: 0 };
  return { pose: 'run', lift: 0 };
}

/** Blit with a one-pixel dark keyline round it, so it reads in front of anything. */
function keyed(g, spr, x, y, opts = {}) {
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]])
    g.blit(spr, x + dx, y + dy, { ...opts, c: OFF });
  g.blit(spr, x, y, opts);
}

function drawDigit(g, d, x, y) { g.blit(DIGIT_SPR[d], Math.round(x), Math.round(y), { scale: SCALE }); }

/**
 * The pterodactyl that clears the slots: in from the right along the top,
 * over each changing digit as it stomps it out (a dip with its wings up),
 * then off to the left and up out of sight.
 */
function heraldAt(turn, t) {
  const way = turn.items.map((it) => [it.knock, it.x + DW / 2 - 10]);
  const enter = way[0][0] - (134 - way[0][1]) / 45;
  if (t < enter) return null;
  let x, y = PT_Y;
  if (t < way[0][0]) x = way[0][1] + 45 * (way[0][0] - t);
  else if (t >= way[way.length - 1][0]) {
    const dt = t - way[way.length - 1][0];
    x = way[way.length - 1][1] - 50 * dt; y = PT_Y - 14 * dt * dt;
    if (x < -22 || y < -18) return null;
  } else
    for (let i = 1; i < way.length; i++)
      if (t < way[i][0]) {
        const u = (t - way[i - 1][0]) / (way[i][0] - way[i - 1][0]);
        x = way[i - 1][1] + (way[i][1] - way[i - 1][1]) * u;
        break;
      }
  let dip = 0;
  for (const [tk] of way) {
    const k = t - tk;
    if (k > -0.24 && k < 0.16) dip = Math.max(dip, 6 * Math.sin((Math.PI * (k + 0.24)) / 0.4));
  }
  return { x, y: y + Math.round(dip), stomp: dip > 0.5 };
}

function drawSky(g, f, tAbs, key) {
  const night = f.h >= 20 || f.h < 6;
  if (!night) {
    // Clouds drift by slowly, a parallax layer behind everything.
    const shift = 5 * tAbs;
    const i0 = Math.floor((shift - 40) / 55);
    for (let i = i0; i < i0 + 5; i++) {
      if (noise(i, 2) < 0.35) continue;
      const x = Math.round(i * 55 + 20 * noise(i, 3) - shift), y = 1 + Math.floor(noise(i, 4) * 4);
      g.blit(CLOUD, x, y);
    }
    return;
  }
  // Night: the moon crosses the sky once, 20:00 to 06:00; stars twinkle.
  const nightH = ((f.h + 4) % 24) + f.m / 60;
  const mx = Math.round(122 - 12 * nightH);
  g.blit(MOON, mx, 1);
  const hourKey = Math.floor(key / 60) % 9973;
  for (let i = 0; i < 9; i++) {
    const x = Math.floor(noise(i, hourKey) * 124) + 2, y = 1 + Math.floor(noise(i, hourKey + 7) * 4);   // above the digits
    if (Math.abs(x - mx - 3) < 6) continue;
    const tw = noise(Math.floor(tAbs * 1.5) + i * 31, 9);
    if (tw < 0.15) continue;
    g.pixel(x, y);
    if (tw > 0.85) g.pixel(x - 1, y).pixel(x + 1, y).pixel(x, y - 1).pixel(x, y + 1);
  }
}

/** The horizon with its bumps, and the pebbles under it, scrolled by `shift` world pixels. */
function drawGround(g, shift, sdy) {
  for (let x = 0; x < 128; x++) {
    const wx = x + shift;
    // A bump every so often: the line steps up a pixel for a few pixels.
    const seg = Math.floor(wx / 29), o = wx - seg * 29;
    const bump = noise(seg, 11) < 0.55 && o >= 6 + Math.floor(noise(seg, 12) * 12) && o < 9 + Math.floor(noise(seg, 12) * 12) + Math.floor(noise(seg, 13) * 3);
    g.pixel(x, GROUND + sdy - (bump ? 1 : 0));
    // Pebbles: short dashes on three rows under the line.
    const cell = Math.floor(wx / 5), co = wx - cell * 5;
    if (noise(cell, 14) < 0.34 && co < 1 + Math.floor(noise(cell, 15) * 3)) g.pixel(x, GROUND + sdy + 2 + Math.floor(noise(cell, 16) * 3));
  }
}

export default {
  name: 'Dino',
  blurb: 'The Chrome T-Rex runs the minutes: a pterodactyl drops the new digit, the old one falls on the track and gets jumped.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,

  frame(g, { fields: f, date, kit }) {
    const sec = f.sec, key = f.minuteKey;
    const next = kit.clockFields(new Date(date.getTime() + 60000));
    const a = digitsOf(f), b = digitsOf(next), p = digitsOf(kit.previousMinute(date));
    const [tox, toy] = orbit(date, 3, 2);                             // the time's walk
    const sdy = orbit(date, 1, 5)[1];                                 // the ground's
    const tAbs = (key % 100003) * 60 + sec;
    const foot = FOOT + sdy;

    // The T-Rex edges forward and back over the minutes, as a player does.
    const dinoX = DINO_X + 8 + orbit(date, 8, 1)[0], cx = dinoX + 8;
    const turn = turnPlan(a, b, tox, toy, cx, sdy), prevTurn = turnPlan(p, a, tox, toy, cx, sdy);
    const lastPrev = Math.max(...prevTurn.items.map((it) => it.pass)) - 60;
    // (None past :58.6, so none is still on screen when the next minute takes over.)
    const obs = obstaclePlan(key, lastPrev + DIGIT_JUMP.T / 2, Math.min(58.6, turn.items[0].pass - DIGIT_JUMP.T / 2 - 1.0));

    // What the T-Rex does about it all.
    const jumps = [], ducks = [];
    for (const it of prevTurn.items) jumps.push({ t0: it.pass - 60 - DIGIT_JUMP.T / 2, ...DIGIT_JUMP });
    for (const it of turn.items) jumps.push({ t0: it.pass - DIGIT_JUMP.T / 2, ...DIGIT_JUMP });
    for (const o of obs) {
      if (o.kind === 'cactus') jumps.push({ t0: o.pass - o.jump.T / 2, ...o.jump });
      else ducks.push({ t0: o.pass - 0.45, t1: o.pass + 0.35 });
    }

    const scroll = Math.floor(V * sec);
    const worldShift = 3600 * (key % 10007) + scroll;
    /** Screen x of something on the track that is at `x` at second `t0`. */
    const onTrack = (x, t0) => Math.round(x + V * t0) - scroll;

    drawSky(g, f, tAbs, key);

    // The time. Digits in a turn are drawn from where the turn has them.
    const fallen = [];
    for (let d = 0; d < 4; d++) {
      const it = turn.items.find((u) => u.d === d), pit = prevTurn.items.find((u) => u.d === d);
      if (it) {
        const s = digitState(it, sec);
        if (sec < it.land) drawDigit(g, it.from, s.oldX, s.oldY);
        if (s.newY !== null) drawDigit(g, it.to, it.x, s.newY);
      } else if (pit) drawDigit(g, pit.to, pit.x, digitState(pit, sec + 60).newY);
      else drawDigit(g, a[d], SLOT_X[d] + tox, TIME_Y + toy);
    }
    for (const it of turn.items) if (sec >= it.land) fallen.push([it, sec]);
    for (const it of prevTurn.items) fallen.push([it, sec + 60]);
    for (const r of [2, 4]) g.fillRect(COLON_X + tox, TIME_Y + toy + r * SCALE, 3, 3);

    // Cacti, and the old digits the ground is carrying.
    for (const o of obs) {
      if (o.kind !== 'cactus') continue;
      const x0 = onTrack(cx - o.w / 2, o.pass);
      if (x0 > 128 || x0 + o.w < 0) continue;
      for (const [spr, dx] of o.grp.parts) g.blit(spr, x0 + dx, foot - spr.h + 1);
    }
    for (const [it, t] of fallen) {
      const x0 = Math.round(it.x + V * it.land) - Math.floor(V * t);
      if (x0 + DW < 0) continue;
      const s = digitState(it, t);
      drawDigit(g, it.from, x0, s.oldY);
      // A puff of dust either side as it lands.
      const k = t - it.land;
      if (k < 0.35) {
        const spread = Math.floor(k * 22);
        for (const [px, py] of [[-2 - spread, 0], [-4 - spread, -1], [DW + 1 + spread, 0], [DW + 3 + spread, -1]])
          if ((px + py + Math.floor(k * 30)) % 2 === 0 || k < 0.15) g.pixel(x0 + px, foot + py);
      }
    }

    // The T-Rex.
    const st = dinoState(sec, jumps, ducks);
    const run = Math.floor(tAbs * 10) % 2;
    if (st.pose === 'duck') keyed(g, TREX_DUCK[run], dinoX, foot - TREX_DUCK[0].h + 1);
    else keyed(g, st.pose === 'air' ? TREX_AIR : TREX_RUN[run], dinoX, foot - TREX_AIR.h + 1 - st.lift);

    // The ground goes over the T-Rex's keyline, so its feet stand on the line.
    drawGround(g, worldShift, sdy);

    // Birds at head height, and the one bringing the time.
    const flap = Math.floor(tAbs * 6) % 2;
    for (const o of obs) {
      if (o.kind !== 'ptero') continue;
      const x = Math.round(cx - 10 + PT_V * (o.pass - sec));
      // Its upstroke would poke into the digits: it flies behind them.
      g.clip(0, TIME_Y + toy + DH + 1, 128, 64);
      if (x < 130 && x > -24) keyed(g, PTERO[flap], x, PT_MID + sdy);
      g.unclip();
    }
    for (const [tr, t] of [[turn, sec], [prevTurn, sec + 60]]) {
      const h = heraldAt(tr, t);
      if (h) keyed(g, PTERO[h.stomp ? 1 : flap], Math.round(h.x), Math.round(h.y));
    }
  },
};
