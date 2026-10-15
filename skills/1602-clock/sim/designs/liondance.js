// Lion Dance (舞狮) — the lion eats the minute and spits out the next one.
//
// A southern lion dances along the glass to the drum: a front-on head three
// cells wide and both rows tall (round bulging eyes with lashes, a horn over
// the forehead mirror, a fanged jaw), with the two dancers' costume trailing
// behind it in ROM: ﾐ for its furred back, ﾊ and π for the dancers' legs, a
// wagging ) for the tail. The time is its food. The hour hangs from strings
// as two lanterns, the minutes sit on the floor as two balls, beside a string
// of firecrackers (ROM ｷ) hung at the left edge.
//
// Every second is a drum beat: the head dips a dot, the legs crouch, the
// beard flutters, the lantern strings swing. Between beats it fidgets: it
// looks about and blinks, noses the near ball at :16 (the ball spins and the
// lion jumps back), bows three times at :30, glances up at the lanterns at
// :40. From :52 it stalks the balls, crouched, eyes locked on; at :59.5 the
// jaw drops. On the minute it lunges onto the ball that changed and snaps it
// up, then the other one if that changed too, backs off, chews with happy
// eyes, and spits the new ball out: it spins over the top row (face, three
// wide, edge-on, three wide) and drops onto the floor with a bounce. A ball
// keeps its old value until it is eaten, so the glass only ever shows the
// time the lion has got to, or a gap where it is chewing.
//
// On the hour the firecrackers go off from the bottom up, sparks spray into
// the empty cells, and the lion leaps back wide-eyed. The blast jolts the
// lantern(s) that changed off their strings onto the floor. The lion eats the
// balls, carries on to eat the fallen lanterns, chews for twice as long,
// spits the new lanterns up onto their strings and the new balls onto the
// floor, and takes three bows. Smoke drifts off and a new string is hung.
//
// Everything is derived from the wall clock: the turn is a keyframe script
// built from the digits before and after :00, the dance from noise seeded by
// the minute.
//
// Budget. The head is four tiles at most: three across the top (each eye is
// its own tile, so the lion can look anywhere, wink or go cross-eyed) and one
// jaw tile repeated in all three bottom cells, which is how a lion dance
// mouth is built anyway: one hinged jaw across the whole face. A bob shifts
// the whole head down a dot, which keeps the three jaw cells identical. The
// costume, floor, firecrackers, sparks and smoke are ROM. The four digits are
// four tiles at most (a lantern digit hangs a dot lower than a ball digit, so
// the two never share). A token in flight uses the slot its eaten
// predecessor gave up, and only one token is ever in flight, so a frame never
// asks for a ninth slot; a sweep of every frame of every hour turn agrees.
//
// The digits were first cut out of lit lanterns and balls in negative, 3x5.
// At 1:1 a lit ball with a dark 1 read as a 0, so they are bold 5x7 figures
// with two-dot strokes. ¥ (0x5c here) was the first firecracker and read as
// money; ｷ reads as crackers on a string. A mirror drawn as a hole between the
// eyes read as a third eye until it moved up under the horn.

import { Stage, noise, smoothNoise } from '../js/kit.js';

// ------------------------------------------------------------------ glyphs

// Bold 5x7 digits, two-dot strokes, so they stay legible at 1:1.
const F = {
  0: ['.###.', '##.##', '##.##', '##.##', '##.##', '##.##', '.###.'],
  1: ['.##..', '###..', '.##..', '.##..', '.##..', '.##..', '####.'],
  2: ['.###.', '##.##', '...##', '..##.', '.##..', '##...', '#####'],
  3: ['####.', '...##', '...##', '.###.', '...##', '...##', '####.'],
  4: ['...##', '..###', '.#.##', '##.##', '#####', '...##', '...##'],
  5: ['#####', '##...', '####.', '...##', '...##', '##.##', '.###.'],
  6: ['.###.', '##...', '####.', '##.##', '##.##', '##.##', '.###.'],
  7: ['#####', '...##', '..##.', '..##.', '.##..', '.##..', '.##..'],
  8: ['.###.', '##.##', '##.##', '.###.', '##.##', '##.##', '.###.'],
  9: ['.###.', '##.##', '##.##', '.####', '...##', '...##', '.###.'],
};
/** A digit squeezed to `w` columns (5, 3 or 1), as it turns edge-on. */
function squeeze(d, w) {
  if (w === 5) return F[d];
  if (w === 1) return F[d].map(() => '..#..');
  return F[d].map((l) => '.' + (l[0] === '#' || l[1] === '#' ? '#' : '.') + (l[2] === '#' ? '#' : '.') + (l[3] === '#' || l[4] === '#' ? '#' : '.') + '.');
}

const TOKEN = {
  // A ball on the floor: the digit's foot is on the floor rule (dot row 6).
  ball: (d, w = 5) => [...squeeze(d, w), '.....'],
  ballLow: (d) => ['.....', ...F[d]],                       // landing: one dot into the floor
  // A lantern hangs from its string, which swings on the beat.
  lantern: (d, sway = 0) => [['.#...', '..#..', '...#.'][sway + 1], ...F[d]],
  loose: (d, w = 5) => ['.....', ...squeeze(d, w)],
};

// The head, as a 15x16 picture. Eye whites are cols 1-3, rows 2-5 of the two
// outer top cells; everything else is fur, forehead, horn and jaw.
const TOP = [
  '#.#.# ..#.. #.#.#',     // lashes, the horn
  '.###. ..#.. .###.',
  '#...# .###. #...#',     // eyes: round, bulging, on top of the head
  '#...# ..... #...#',     // the mirror on the forehead
  '#...# .###. #...#',
  '#...# ##### #...#',
  '.###. #.#.# .###.',     // nostrils
  '##### ##### #####',
].map((l) => l.replace(/ /g, ''));

// One jaw tile for all three bottom cells: a lion dance head's jaw is one
// hinged piece across the whole face. Fangs at each cell edge, a chin below.
const JAW = {
  open: ['#####', '##.##', '#...#', '.....', '.....', '#.#.#', '#####', '.###.'],
  wide: ['#####', '#.#.#', '.....', '.....', '.....', '#.#.#', '#####', '.###.'],
  shut: ['#####', '##.##', '#.#.#', '#####', '#####', '.###.', '.....', '.....'],
};
// The chin's fur flutters on the beat.
const BEARD = (row) => (row === '.###.' ? '#.#.#' : row);

/**
 * Eye interior (3 wide, 4 tall). `px` 0/1 is the pupil's column, `py` 0-2
 * its row; `mode` open | closed | happy | wide | half.
 */
function eye(mode, px, py) {
  if (mode === 'closed') return ['###', '###', '###', '...'];
  if (mode === 'happy') return ['###', '#.#', '.#.', '###'];
  if (mode === 'wide') return ['...', '...', '.#.', '...'];
  const g = Array.from({ length: 4 }, () => ['.', '.', '.']);
  if (mode === 'half') { g[0] = ['#', '#', '#']; py = Math.max(py, 1); }
  for (const [x, y] of [[px, py], [px + 1, py], [px, py + 1], [px + 1, py + 1]]) g[y][x] = '#';
  return g.map((r) => r.join(''));
}

/** Pupil columns per look, [left eye, right eye], and the pupil row. */
const LOOK = {
  G: [
  '#.#.# ..#.. #.#.#',
  '.###. .###. .###.',
  '#...# ##### #...#',
  '#...# ##### #...#',
  '#...# ##### #...#',
  '#...# ##### #...#',
  '.###. #.#.# .###.',
  '##### ##### #####',
  ],
  H: [
  '#.#.. ..#.. ..#.#',
  '.###. .###. .###.',
  '#...# ##### #...#',
  '#...# ##### #...#',
  '#...# ##### #...#',
  '#...# ##### #...#',
  '##### #.#.# #####',
  '.#### ##### ####.',
  ],
  C: [[1, 0], 1], L: [[0, 0], 1], R: [[1, 1], 1], LD: [[0, 0], 2], RD: [[1, 1], 2],
  U: [[1, 0], 0], LU: [[0, 0], 0], D: [[1, 0], 2],
};

/** The head's six tiles [row][cell] for a pose. */
function head({ look = 'C', eyes = 'open', jaw = 'open', bob = 0, beard = 0 }) {
  const [pxs, py] = LOOK[look];
  const top = TOP.map((l) => [...l]);
  [0, 1].forEach((side) => {
    const e = eye(eyes, pxs[side], py);
    const x0 = side === 0 ? 1 : 11;
    e.forEach((row, y) => [...row].forEach((ch, x) => { top[2 + y][x0 + x] = ch; }));
  });
  const jawRows = JAW[jaw].map((r, i) => (i === 7 && beard ? BEARD(r) : r));
  let pic = [...top.map((r) => r.join('')), ...jawRows.map((r) => r.repeat(3))];
  for (let i = 0; i < bob; i++) pic = ['.'.repeat(15), ...pic.slice(0, 15)];
  const tiles = [[], []];
  for (let R = 0; R < 2; R++) for (let c = 0; c < 3; c++) tiles[R].push(pic.slice(R * 8, R * 8 + 8).map((l) => l.slice(c * 5, c * 5 + 5)));
  return tiles;
}

// ------------------------------------------------------------------ stage

const FLOOR = 0x5f;
const FUR = 0xd0;            // ﾐ: the costume's furred back
const LEG_BENT = 0xca;       // ﾊ: a dancer's legs, knees out
const LEG_UP = 0xf7;         // π: standing
const TAIL = [0x29, 0x3e];   // ) and >
const CRACKER = 0xb7;        // ｷ: crackers on a string
const SPARKS = [0x2a, 0x2b, 0xa5, 0x2e, 0x2a];
const SMOKE = [0x6f, 0xdf, 0xa5];

const LANTERN_COL = [1, 2];  // top row
const BALL_COL = [4, 5];     // bottom row

const STEP = 0.18;           // a flying token's step, one cell
const HOP = 0.22;            // the lion's step, one cell
const BEAT_DIP = 0.25;       // the head is down for this long on each beat

// ------------------------------------------------------------------ script

/**
 * The turn, from :00 of a minute: the lion's keyframes, and what happens to
 * each token (`was` and `now` are the four digits before and after).
 */
function script(was, now, hourly) {
  const keys = [];
  const tok = [{}, {}, {}, {}];
  const key = (t, col, pose = {}) => keys.push({ t, col, ...pose });
  const walk = (from, to, pose) => {          // one hop per HOP seconds
    const dir = Math.sign(to - from);
    for (let k = from + dir; dir && k !== to + dir; k += dir) { key(t, k, { ...pose, bob: k % 2, legs: k % 2 ? 'bent' : 'up' }); t += HOP; }
    return to;
  };
  let t = 0;
  let col = 6;
  const lanternsChange = hourly && (was[0] !== now[0] || was[1] !== now[1]);

  if (hourly) {
    // Bang. The lion leaps back.
    key(0, 6, { eyes: 'wide', jaw: 'wide', legs: 'bent' });
    key(0.3, 8, { eyes: 'wide', jaw: 'wide', legs: 'bent', bob: 1 });
    key(0.55, 10, { eyes: 'wide', jaw: 'shut', look: 'L', legs: 'up' });
    key(1.2, 10, { eyes: 'open', look: 'L', jaw: 'shut' });
    key(1.6, 10, { eyes: 'wide', look: 'LU', jaw: 'open' });
    for (const i of [0, 1]) if (was[i] !== now[i]) { tok[i].jolt = 1.0; tok[i].fall = 1.6; }
    t = 2.4;
    col = walk(10, 6, { look: 'LD', jaw: 'shut' });
    key(t, 6, { look: 'LD', jaw: 'wide', eyes: 'wide' });
    t += 0.3;
  }

  // Lunge at each ball that changed, right to left.
  const lunge = (i, c) => {
    col = c;
    key(t, col, { jaw: 'wide', eyes: 'wide', look: 'LD', legs: 'bent' });
    key(t + 0.3, col, { jaw: 'shut', eyes: 'closed', bob: 1, legs: 'bent' });
    tok[i].gone = t + 0.3;
    t += 0.6;
  };
  for (const i of [3, 2]) if (was[i] !== now[i]) lunge(i, BALL_COL[i - 2]);
  // On the hour, on to the fallen lanterns.
  if (lanternsChange) {
    for (const i of [1, 0]) {
      if (was[i] === now[i]) continue;
      walk(col, LANTERN_COL[i] + 1, { look: 'LD', jaw: 'open' });
      lunge(i, LANTERN_COL[i]);
    }
  }

  // Back off and chew.
  const spitCol = lanternsChange ? 4 : 7;
  col = walk(col, spitCol, { jaw: 'shut', eyes: 'happy' });
  const chews = hourly ? 8 : 5;
  for (let k = 0; k < chews; k++) {
    key(t, col, { jaw: k % 2 ? 'open' : 'shut', eyes: 'happy', bob: k % 2, legs: k % 2 ? 'bent' : 'up' });
    t += HOP;
  }

  // Spit the new tokens out, farthest first. A lantern flies up onto its
  // string; a ball arcs over the top row and drops onto the floor.
  const spit = (i) => {
    const lantern = i < 2;
    const target = lantern ? LANTERN_COL[i] : BALL_COL[i - 2];
    const m = col - 1;                       // the cell in front of the jaw
    const path = [[m, 1], [m, 0]];
    for (let c = m - 1; c >= target; c--) path.push([c, 0]);
    if (!lantern) path.push([target, 1]);
    key(t, col, { jaw: 'wide', eyes: 'open', look: 'L' });
    key(t + 0.4, col, { jaw: 'shut', eyes: 'open', look: 'L' });
    tok[i].fly = { start: t + 0.1, path };
    t += 0.1 + path.length * STEP;
    tok[i].land = t;
    key(t, col, { jaw: 'open', eyes: 'open', look: 'LD' });
    t += lantern ? 0.3 : 0.4;
  };
  if (lanternsChange) for (const i of [0, 1]) if (was[i] !== now[i]) spit(i);
  col = walk(col, 7, { jaw: 'shut', look: 'L' });
  for (const i of [2, 3]) if (was[i] !== now[i]) spit(i);

  // Pleased with itself.
  key(t, col, { jaw: 'open', eyes: 'happy', look: 'C' });
  t += 0.6;
  if (hourly) {
    for (let k = 0; k < 3; k++) {             // three bows
      key(t, col, { jaw: 'shut', eyes: 'closed', bob: 2, legs: 'bent' });
      key(t + 0.45, col, { jaw: 'open', eyes: 'open', look: 'C', legs: 'up' });
      t += 0.9;
    }
  }
  key(t, col, { jaw: 'open', look: 'C' });
  keys.sort((a, b) => a.t - b.t);
  return { keys, tok, end: t + 0.4 };
}

/** The keyframe in force at `t`. */
function poseAt(keys, t) {
  let k = keys[0];
  for (const q of keys) { if (q.t <= t) k = q; else break; }
  return k;
}

/** Between turns: the dance. `sec` is seconds into the minute, `seed` the minute. */
function dance(sec, seed, since) {
  const beat = Math.floor(sec);
  const inBeat = sec - beat;
  const dip = inBeat < BEAT_DIP;
  const pose = { jaw: 'open', eyes: 'open', look: 'C', bob: dip ? 1 : 0, legs: dip ? 'bent' : 'up' };

  // A new spot every couple of beats, between cols 7 and 10, moving on the beat.
  let col = 7 + Math.min(3, Math.floor(smoothNoise(beat / 2.3, seed % 97) * 4));
  if (sec < since + 1.5) col = 7;

  // Looking about, a few seconds at a time.
  const looks = ['C', 'L', 'C', 'LD', 'R', 'C', 'U', 'L'];
  pose.look = looks[Math.floor(noise(Math.floor(sec / 2.5), seed % 89 + 3) * looks.length)];

  if (sec >= 14 && sec < 18) {              // sniffs the balls
    col = sec < 15 ? 7 : sec < 16.8 ? 6 : 8;
    pose.look = 'LD';
    if (sec >= 16 && sec < 16.8) { pose.eyes = 'wide'; pose.jaw = 'shut'; }   // and thinks better of it
  } else if (sec >= 30 && sec < 33) {       // three bows
    col = 8;
    const down = inBeat < 0.45;
    Object.assign(pose, { bob: down ? 2 : 0, eyes: down ? 'closed' : 'open', jaw: down ? 'shut' : 'open', look: 'C' });
  } else if (sec >= 40 && sec < 43) {       // what's up there?
    col = 8;
    pose.look = 'LU';
  } else if (sec >= 52) {                   // stalking
    col = sec < 55 ? 8 : sec < 58 ? 7 : 6;
    pose.look = 'LD';
    pose.jaw = 'shut';
    if (sec >= 58) { pose.bob = 1; pose.legs = 'bent'; pose.eyes = 'half'; }
    if (sec >= 59.5) { pose.jaw = 'wide'; pose.eyes = 'wide'; }
  }

  // Blinks: about one every four seconds, 200 ms long.
  const bk = Math.floor(sec / 4);
  const bt = bk * 4 + 0.5 + noise(bk, seed % 83 + 11) * 2.8;
  if (sec >= bt && sec < bt + 0.2 && pose.eyes === 'open') pose.eyes = 'closed';
  return { col, ...pose };
}

// ------------------------------------------------------------------ design

export default {
  name: 'Lion dance',
  blurb: 'A lion dances to the drum, eats the minute ball each minute and spits out the next; on the hour firecrackers knock the lanterns down.',
  bus: 'i2c100',
  panel: 'amber',
  fps: 10,

  frame(lcd, api, { fields, date, kit }) {
    const sec = fields.s + fields.ms / 1000;
    const B = date.getTime() - sec * 1000;                    // this minute's :00
    const old = kit.clockFields(new Date(B - 60000));
    const was = old.hh + old.mm, now = fields.hh + fields.mm;
    const hourly = was.slice(0, 2) !== now.slice(0, 2);
    const seed = Math.round(B / 60000);

    const sc = script(was, now, hourly);
    const inTurn = sec < sc.end;
    const p = inTurn ? poseAt(sc.keys, sec) : dance(sec, seed, sc.end);
    const dip = (sec % 1) < BEAT_DIP;

    const st = new Stage(lcd);
    for (let c = 0; c < 16; c++) st.put(c, 1, FLOOR);

    // The tokens.
    const sway = (Math.floor(sec) % 2 ? 1 : -1) * (dip ? 1 : 0);    // lanterns swing on the beat
    for (let i = 0; i < 4; i++) {
      const lantern = i < 2;
      const home = lantern ? [LANTERN_COL[i], 0] : [BALL_COL[i - 2], 1];
      const rest = (d) => (lantern ? TOKEN.lantern(d, sway) : TOKEN.ball(d));
      const s = sc.tok[i];
      if (!inTurn || was[i] === now[i]) {
        // At :16 the lion noses the near ball and it spins on the spot.
        const nudge = i === 3 && !inTurn && sec >= 16 && sec < 16.8;
        st.put(...home, nudge ? TOKEN.ball(now[i], [3, 1, 3, 5][Math.floor((sec - 16) / 0.2)]) : rest(now[i]));
        continue;
      }
      if (s.gone === undefined || sec < s.gone) {
        // Still the old value: hanging, jolted by the blast, or fallen.
        if (s.fall !== undefined && sec >= s.fall) st.put(home[0], 1, TOKEN.loose(was[i]));
        else if (s.jolt !== undefined && sec >= s.jolt) st.put(...home, TOKEN.lantern(was[i], Math.floor(sec / 0.2) % 2 ? 1 : -1));
        else st.put(...home, rest(was[i]));
        continue;
      }
      if (!s.fly || sec < s.fly.start) continue;                  // inside the lion
      if (sec < s.land) {
        const k = Math.min(s.fly.path.length - 1, Math.floor((sec - s.fly.start) / STEP));
        // It spins as it flies: face, three wide, edge-on, three wide, face.
        const w = k === s.fly.path.length - 1 ? 5 : [5, 3, 1, 3][k % 4];
        st.put(...s.fly.path[k], lantern ? TOKEN.loose(now[i], w) : TOKEN.ball(now[i], w));
        continue;
      }
      const since = sec - s.land;                                 // landed: a bounce, or a swing
      st.put(...home, lantern
        ? TOKEN.lantern(now[i], since < 0.25 ? 1 : since < 0.5 ? -1 : 0)
        : (since < 0.2 ? TOKEN.ballLow(now[i]) : TOKEN.ball(now[i])));
    }

    // Firecrackers on the left edge. They go off on the hour; a new string is
    // hung once the smoke has cleared. Sparks and smoke only use empty cells.
    const empty = (c, row) => st.cells[row][c] === 0x20 || st.cells[row][c] === FLOOR;
    const fc = hourly ? sec : 99;
    if (fc >= 18) { st.put(0, 0, CRACKER); st.put(0, 1, CRACKER); }
    else if (fc >= 17.2) st.put(0, 0, CRACKER);
    else if (fc < 2.6) {
      // The fuse is at the bottom: that cell bursts first, then the top one.
      const k = Math.floor(fc / 0.2);
      st.put(0, 1, fc < 0.2 ? CRACKER : SPARKS[k % SPARKS.length]);
      st.put(0, 0, fc < 0.6 ? CRACKER : SPARKS[(k + 2) % SPARKS.length]);
      // Sparks into the empty cells nearby, 200 ms each.
      if (fc >= 0.2) {
        for (let n = 0; n < 4; n++) {
          const c = 1 + Math.floor(noise(k * 7 + n, 5) * 6), row = noise(k * 3 + n, 9) < 0.6 ? 0 : 1;
          if (empty(c, row)) st.put(c, row, SPARKS[Math.floor(noise(k + n, 2) * SPARKS.length)]);
        }
      }
    } else if (fc < 8) {
      // Three puffs of smoke drift off along the top, a cell every 0.5 s,
      // thinning as they go.
      for (let n = 0; n < 3; n++) {
        const age = fc - 2.6 - n * 0.7;
        if (age < 0) continue;
        const c = Math.floor(age / 0.5), row = age < 0.5 && n === 0 ? 1 : 0;
        if (c < 8 && empty(c, row)) st.put(c, row, SMOKE[Math.min(2, Math.floor(age / 1.4))]);
      }
    }

    // The lion: the head, then the costume trailing behind it.
    const col = p.col;
    const tiles = head({ look: p.look ?? 'C', eyes: p.eyes ?? 'open', jaw: p.jaw ?? 'open', bob: p.bob ?? 0, beard: dip ? 1 : 0 });
    for (let R = 0; R < 2; R++) for (let c = 0; c < 3; c++) st.put(col + c, R, tiles[R][c]);
    const bent = (p.legs ?? (dip ? 'bent' : 'up')) === 'bent';
    for (let c = 3; c <= 5; c++) st.put(col + c, 0, FUR);
    st.put(col + 6, 0, TAIL[Math.floor(sec * 2) % 2]);
    st.put(col + 3, 1, bent ? LEG_BENT : LEG_UP);
    st.put(col + 5, 1, bent ? LEG_UP : LEG_BENT);

    st.draw();
  },
};
