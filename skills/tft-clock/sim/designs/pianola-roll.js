// pianola-roll: the score. What is punched in each minute's stretch of the
// music roll, and where the roll is at any instant.
//
// Paper coordinates: `c` is pixels along the roll, measured from the start of
// a minute's stretch; larger c is read later, so it sits higher on the glass
// (the paper runs down into the tracker bar). Columns are the white keys,
// 4 px apart, column i under x = 4i .. 4i+3.

import { clockFields } from '../js/kit.js';

export const COL = 4;          // px per key column
export const ROW = 4;          // px of paper per glyph row (hole 3, web 1)
export const HOLE = 3;         // hole width and the length of a one-row hole
export const W = 55;           // paper visible above the tracker bar, px
export const V = 8;            // roll speed while playing, px/s (two rows a second)
export const P = 32;           // one copy of the time: 7 rows + 1 rest row
export const LEAD = 64;        // blank leader at the head of each minute (the glissando)
export const N = 16;           // copies of the time per minute
export const D = 48;           // extra paper pulled through by each half of the minute rush
export const T = 1.2;          // how long each half of the rush takes, s
export const LSEC = 60 * V + 2 * D;   // 576: one minute of paper = LEAD + N * P
export const DIGIT_COL = 6;    // first column of the time

// Digits as punched: 5 columns x 7 rows, row 0 at the top. A vertical stroke
// is one long slot (a held note), a horizontal stroke a chord of round holes.
const GLYPHS = {
  0: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  1: ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  2: ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  3: ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  4: ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  5: ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  6: ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  7: ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  8: ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  9: ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  ':': ['.', '.', '#', '.', '#', '.', '.'],
};

// Columns for the layout "HH:MM": H H gap colon gap M M.
function timeSlots(hh, mm) {
  const out = [];
  const place = (ch, col0) => {
    const gl = GLYPHS[ch];
    for (let i = 0; i < gl[0].length; i++) {
      let r = 0;
      while (r < 7) {
        if (gl[r][i] !== '#') { r++; continue; }
        let r1 = r;
        while (r1 + 1 < 7 && gl[r1 + 1][i] === '#') r1++;
        out.push({ col: col0 + i, c0: (6 - r1) * ROW, c1: (6 - r) * ROW + HOLE, kind: 0 });
        r = r1 + 1;
      }
    }
  };
  place(hh[0], DIGIT_COL);
  place(hh[1], DIGIT_COL + 6);
  place(':', DIGIT_COL + 13);
  place(mm[0], DIGIT_COL + 16);
  place(mm[1], DIGIT_COL + 22);
  return out;   // spans columns 6 .. 32
}
export const LAST_DIGIT_COL = DIGIT_COL + 26;

// Westminster quarters for the hour (changes 2-5, in C: G3 C4 D4 E4), on the
// four treble columns at the right edge, then the hour struck in the bass.
const WEST = 'CEDG CDEC ECDG GDEC'.split(' ').map((p) => [...p]);
const WEST_COL = { G: 35, C: 36, D: 37, E: 38 };
export const STRIKE_COLS = [1, 2, 3];

/** Every hole in the stretch of roll for the minute `f` (clock fields), sorted by c0. */
function buildSection(f) {
  const holes = [];
  // the leader: a white-key glissando across the time's columns, up on even
  // minutes, down on odd, so the roll ends each minute with a run
  const up = f.m % 2 === 0;
  for (let i = 0; i <= LAST_DIGIT_COL - DIGIT_COL; i++) {
    const col = up ? DIGIT_COL + i : LAST_DIGIT_COL - i;
    const c0 = 8 + i * 1.55;
    holes.push({ col, c0, c1: c0 + 2.5, kind: 1 });
  }
  // the time, punched N times
  const one = timeSlots(f.hh, f.mm);
  for (let k = 0; k < N; k++) {
    const base = LEAD + k * P + 2;
    for (const s of one) holes.push({ col: s.col, c0: base + s.c0, c1: base + s.c1, kind: 0 });
  }
  // the hour: chimes, then the strikes
  if (f.m === 0) {
    let c = LEAD + 6;
    for (const phrase of WEST) {
      for (const n of phrase) { holes.push({ col: WEST_COL[n], c0: c, c1: c + HOLE + 1, kind: 2 }); c += 6; }
      c += 6;
    }
    c += 10;
    for (let k = 0; k < f.h12; k++) {
      for (const col of STRIKE_COLS) holes.push({ col, c0: c, c1: c + 7, kind: 3 });
      c += 14;
    }
  }
  holes.sort((a, b) => a.c0 - b.c0);
  return holes;
}

// Printed in red down the right margin, as on a real roll: tempo and
// dynamics, the accelerando into the rush, and FINE at each minute's end.
function buildPrint(f) {
  const out = [];
  const chimeEnd = f.m === 0 ? LEAD + 6 + 16 * 6 + 4 * 6 : 0;
  const dyn = ['MF', 'P', 'F', 'PP'];
  if (!chimeEnd) out.push({ c: LEAD + 20, text: 'TEMPO' });
  for (let k = 2; k < N - 2; k += 3) {
    const c = LEAD + k * P + 20;
    if (c > chimeEnd) out.push({ c, text: dyn[(k + f.m) % 4] });
  }
  out.push({ c: LSEC - 2 * P + 20, text: 'ACCEL' });
  out.push({ c: LSEC - 6, text: 'FINE' });
  return out;
}

const CACHE = new Map();
/** The holes of the minute at `date`'s stretch of roll (cached by minute; a pure function of it). */
export function sectionFor(date) {
  const f = clockFields(date);
  const key = f.minuteKey;
  let s = CACHE.get(key);
  if (!s) {
    s = { f, holes: buildSection(f), print: buildPrint(f) };
    if (CACHE.size > 6) CACHE.delete(CACHE.keys().next().value);
    CACHE.set(key, s);
  }
  return s;
}

/**
 * Where the roll is, in the current minute's paper coordinates: the c at the
 * tracker bar at `sec` seconds into the minute. Steady at V, with a rush at
 * each turn: the last copies are pulled through fast before :00, the next
 * minute's music pulled in fast after it. Continuous in position and speed.
 */
export function rollAt(sec) {
  const u = Math.min(sec / T, 1);
  const w = Math.max(0, Math.min((sec - (60 - T)) / T, 1));
  return V * sec + D * (1 - (1 - u) * (1 - u)) + D * w * w;
}

/** Roll speed, px/s, at `sec`. */
export function speedAt(sec) {
  const u = Math.min(sec / T, 1);
  const w = Math.max(0, Math.min((sec - (60 - T)) / T, 1));
  return V + (2 * D / T) * (1 - u) + (2 * D / T) * w;
}
