// Lamian — a noodle master keeps the time in hand-pulled noodles.
//
// The hours hang on the left as two tall noodles (5x16, a round strand two
// dots thick), a flour colon, then the minutes lying on the board (5x8, the
// same strand). At the right the chef, a tall toque over a moustached face,
// kneads his dough beside a steaming pot (ROM 0xfc), and every few seconds
// tests a strand, pulling it out toward the minutes and letting it bounce.
// 24-hour: no leading zero before 10, so 18:56 is never 6:56.
//
// Each minute he eyes the minutes, reaches out and grabs the old minute
// noodle: it springs straight, kink by kink, into a thin strand (ROM 0xb0,
// one dot: a stretched noodle is thin). He reels it in, whirls it round his
// toque, flicks it over into the pot (splash), pulls a fresh strand out of
// the dough and lays it along the board, where it curls into the new digit.
// Old digits are gone before the minute turns and new ones curl in after,
// so the glass shows a gap of about four seconds, never a wrong time.
//
// On the hour he throws a rope over the board, every changing digit springs
// into it, and he folds it: one strand, two, four, eight, swinging across
// every free cell of both rows (the slow glass blurs the eight to grey).
// Then he slams it down: flour everywhere, his toque flies off and drops
// back, and the new hour curls in, then the minutes.
//
// Tiles: hours <= 4, minutes <= 2, toque 1, body 1 = 8 at rest. A springing
// or curling digit replaces its own tile; strands, steam, splash and flour
// are ROM; the folded bundle is one tile, only while the changing digits
// are gone.

import { TileAllocator, noise } from '../js/kit.js';

// ------------------------------------------------------------------ layout
const H1C = 3, H2C = 4;     // hours: tall noodles, both rows
const COLON = 5;            // two specks of flour
const M1C = 7, M2C = 8;     // minutes: on the board, row 1
const CH = 11;              // the chef: toque row 0, body row 1
const POTC = 13;            // the pot on its stove (ROM), steam above
const POT = 0xfc;

const STRAND = 0xb0;        // ROM: a one-dot strand on dot row 3
const SAG = 0x5f;           // ROM: the strand sagging, dot row 6
const SPECK = 0xa5;         // ROM: a 2x2 speck
const COMMA = 0x2c, TICK = 0x27, BACK = 0x60, DOT = 0x2e, RING = 0xdf, SPLASH = 0xca, STAR = 0x2a;

// ------------------------------------------------------------------- fonts
// Tall hour noodles, 5x16: one round strand two dots thick.
const TALL = {
  0: ['.###.', '##.##', '##.##', '##.##', '##.##', '##.##', '##.##', '##.##', '##.##', '##.##', '##.##', '##.##', '##.##', '##.##', '##.##', '.###.'],
  1: ['.##..', '###..', '.##..', '.##..', '.##..', '.##..', '.##..', '.##..', '.##..', '.##..', '.##..', '.##..', '.##..', '.##..', '.##..', '####.'],
  2: ['.###.', '##.##', '...##', '...##', '...##', '...##', '...##', '...##', '..##.', '..##.', '.##..', '.##..', '##...', '##...', '#####', '#####'],
  3: ['.###.', '##.##', '...##', '...##', '...##', '...##', '..##.', '.##..', '..##.', '...##', '...##', '...##', '...##', '...##', '##.##', '.###.'],
  4: ['##.##', '##.##', '##.##', '##.##', '##.##', '##.##', '##.##', '##.##', '#####', '#####', '...##', '...##', '...##', '...##', '...##', '...##'],
  5: ['#####', '##...', '##...', '##...', '##...', '##...', '####.', '...##', '...##', '...##', '...##', '...##', '...##', '...##', '##.##', '.###.'],
  6: ['..##.', '.##..', '##...', '##...', '##...', '##...', '##...', '####.', '##.##', '##.##', '##.##', '##.##', '##.##', '##.##', '##.##', '.###.'],
  7: ['#####', '...##', '...##', '...##', '..##.', '..##.', '..##.', '.##..', '.##..', '.##..', '.##..', '.##..', '.##..', '.##..', '.##..', '.##..'],
  8: ['.###.', '##.##', '##.##', '##.##', '##.##', '##.##', '.###.', '##.##', '##.##', '##.##', '##.##', '##.##', '##.##', '##.##', '##.##', '.###.'],
  9: ['.###.', '##.##', '##.##', '##.##', '##.##', '##.##', '##.##', '##.##', '.####', '...##', '...##', '...##', '...##', '..##.', '.##..', '##...'],
};
// Minute noodles, 5x8.
const SMALL = {
  0: ['.###.', '##.##', '##.##', '##.##', '##.##', '##.##', '##.##', '.###.'],
  1: ['.##..', '###..', '.##..', '.##..', '.##..', '.##..', '.##..', '####.'],
  2: ['.###.', '##.##', '...##', '..##.', '.##..', '##...', '##...', '#####'],
  3: ['.###.', '##.##', '...##', '..##.', '...##', '...##', '##.##', '.###.'],
  4: ['##.##', '##.##', '##.##', '##.##', '#####', '...##', '...##', '...##'],
  5: ['#####', '##...', '##...', '####.', '...##', '...##', '##.##', '.###.'],
  6: ['..##.', '.##..', '##...', '####.', '##.##', '##.##', '##.##', '.###.'],
  7: ['#####', '...##', '...##', '..##.', '..##.', '.##..', '.##..', '.##..'],
  8: ['.###.', '##.##', '##.##', '.###.', '##.##', '##.##', '##.##', '.###.'],
  9: ['.###.', '##.##', '##.##', '##.##', '.####', '...##', '..##.', '.##..'],
};
// A noodle springing straight (or curling up): big kink, small kink, then
// the ROM strand. Both end on dot row 3, where the strand runs.
const KINK = [
  ['.....', '.##..', '#..#.', '#..#.', '...#.', '..##.', '.....', '.....'],
  ['.....', '.....', '..#..', '##.##', '.....', '.....', '.....', '.....'],
];

// ------------------------------------------------------------------- chef
// Toque (row 0): a tall chef's hat, the whole top cell. It can fly up off
// his head (hatUp dots) and drop back.
const TOQUE = ['.#.#.', '#####', '#####', '#####', '#####', '.###.', '.###.', '.###.'];
function head(hatUp = 0) {
  const k = Math.min(8, hatUp);
  return [...TOQUE.slice(k), ...Array(k).fill('.....')];
}
// Body (row 1): eyes, handlebar moustache, shoulders, arms, apron, legs.
const EYES = { c: '.#.#.', l: '#.#..', r: '..#.#', shut: '.....', up: '.#.#.' };
const POSE = {
  rest:   ['.###.', '#.#.#', '#.#.#', '.###.', '.#.#.', '.#.#.'],
  kneadA: ['.###.', '#####', '.###.', '.###.', '.#.#.', '.#.#.'],
  kneadB: ['.###.', '.###.', '#####', '.###.', '.#.#.', '#...#'],
  reachL: ['.###.', '####.', '..#.#', '.###.', '.#.#.', '.#.#.'],
  reachR: ['.###.', '.####', '#.#..', '.###.', '.#.#.', '.#.#.'],
  pull:   ['.###.', '#####', '....#', '.###.', '.#.#.', '#..#.'],
  up:     ['#####', '..#..', '..#..', '.###.', '.#.#.', '.#.#.'],
  flick:  ['.###.', '.####', '#.#.#', '.###.', '.#.#.', '.#.#.'],
};
function body(pose = 'rest', eyes = 'c') {
  const e = eyes === 'shut' ? '.....' : EYES[eyes];
  const mo = eyes === 'up' ? '#.#.#' : '##.##';
  const p = POSE[pose];
  if (pose === 'up') { return ['#' + e.slice(1, 4) + '#', '#' + mo.slice(1, 4) + '#', ...p]; }
  return [e, mo, ...p];
}

// The folded bundle: n strands over the sixteen dot rows of both rows.
const BUNDLE = {
  4: ['.....', '#####', '.....', '.....', '.....', '#####', '.....', '.....'],
  8: ['#####', '.....', '#####', '.....', '#####', '.....', '#####', '.....'],
  '8b': ['.....', '#####', '.....', '#####', '.....', '#####', '.....', '#####'],
};

// ----------------------------------------------------------------- helpers
const half = (g, row) => g.slice(row * 8, row * 8 + 8);

function digitsAt(sec) {
  const s = ((Math.floor(sec) % 86400) + 86400) % 86400;
  const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60;
  return [h >= 10 ? Math.floor(h / 10) : null, h % 10, Math.floor(m / 10), m % 10];
}
const COLS = [H1C, H2C, M1C, M2C];
const TALLSLOT = [true, true, false, false];
const springLook = (q) => (q < 0.25 ? 'kink0' : q < 0.5 ? 'kink1' : 'strand');
const curlLook = (q) => (q < 0 ? null : q < 0.2 ? 'kink1' : q < 0.4 ? 'kink0' : 'digit');

export default {
  name: 'Lamian',
  blurb: 'A noodle master behind his pot: each minute he pulls the old minute noodle straight, whirls it into the pot and curls a fresh one into the new digit; on the hour he folds a rope into eight strands across the glass.',
  bus: 'i2c100',
  panel: 'green',
  fps: 10,

  frame(lcd, api, { date }) {
    const midnight = new Date(date); midnight.setHours(0, 0, 0, 0);
    const T = (date.getTime() - midnight.getTime()) / 1000;
    const B = Math.round(T / 60) * 60;
    const u = T - B;                         // time from the nearest minute boundary
    const before = digitsAt(B - 60), after = digitsAt(B);
    const hour = B % 3600 === 0;
    const changed = [0, 1, 2, 3].filter((i) => before[i] !== after[i]);
    const inTurn = hour ? u >= -6.0 && u < 2.4 : u >= -6 && u < 2.2;

    const now = digitsAt(T);
    const slot = now.map((d) => ({ d, look: d == null ? null : 'digit' }));
    const grid = [Array(16).fill(0x20), Array(16).fill(0x20)];
    const strandAt = (r, c, code = STRAND) => { if (grid[r][c] === 0x20) grid[r][c] = code; };

    let eyes = 'c', arms = 'rest', hatUp = 0;
    let bundle = null;
    let cloud = 0;
    const idleArms = () => (Math.floor(T / 0.4) % 2 ? 'kneadA' : 'kneadB');

    const sIn = ((T % 60) + 60) % 60;
    if (sIn > 52) eyes = 'l';
    if (Math.floor(T * 5) % 23 === 0) eyes = 'shut';

    if (inTurn && !hour) {
      const springs = changed.filter((i) => i >= 2);
      if (u < -4.6) { arms = idleArms(); eyes = 'l'; }
      else if (u < -4.3) {
        arms = 'reachL'; eyes = 'l';
        for (let c = CH - 1; c >= CH - (u < -4.45 ? 1 : 2); c--) strandAt(1, c);
      } else if (u < -3.2) {
        arms = 'pull'; eyes = 'l';
        for (let c = CH - 1; c > M2C; c--) strandAt(1, c);
        const q = u + 4.1;
        [...springs].reverse().forEach((i, k) => { slot[i].d = before[i]; slot[i].look = q - k * 0.3 < 0 ? 'digit' : springLook(q - k * 0.3); });
      } else if (u < -2.6) {
        arms = 'pull'; eyes = 'c';
        for (const i of springs) slot[i].look = null;
        const left = u < -3.0 ? COLS[Math.min(...springs)] : u < -2.8 ? CH - 2 : CH - 1;
        for (let c = CH - 1; c >= left; c--) strandAt(1, c);
      } else if (u < -1.4) {
        for (const i of springs) slot[i].look = null;
        arms = 'up'; eyes = 'up';
        const k = Math.floor((u + 2.6) / 0.3);
        if (k % 2 === 0) { strandAt(0, CH - 1, STRAND); strandAt(0, CH - 2, SAG); }
        else { strandAt(0, CH + 1, STRAND); strandAt(0, CH + 2, SAG); }
      } else if (u < -0.6) {
        // flick: the strand flies over to the pot and splashes in
        for (const i of springs) slot[i].look = null;
        if (u < -1.2) { arms = 'flick'; eyes = 'r'; strandAt(0, CH + 1, STRAND); }
        else if (u < -1.0) { arms = 'flick'; eyes = 'r'; strandAt(0, POTC - 1, SAG); strandAt(0, POTC, SAG); }
        else { arms = 'rest'; eyes = 'up'; grid[0][POTC] = u < -0.8 ? SPLASH : STAR; }
      } else if (u < 0) {
        for (const i of springs) slot[i].look = null;
        arms = 'reachL'; eyes = 'l';
        for (let c = CH - 1; c >= CH - (u < -0.3 ? 1 : 2); c--) strandAt(1, c);
      } else {
        arms = 'pull'; eyes = 'l';
        springs.forEach((i, k) => { slot[i].d = after[i]; slot[i].look = curlLook(u - k * 0.7); });
        const end = springs.length * 0.7 + 0.1;
        if (u < end) {
          for (let c = CH - 1; c > M2C; c--) strandAt(1, c);
          if (slot[3].look == null) strandAt(1, M2C);
        } else { arms = 'up'; eyes = 'up'; }
      }
    } else if (inTurn && hour) {
      if (u < -5.0) { arms = idleArms(); eyes = 'l'; }
      else if (u < -4.6) {
        arms = 'reachL'; eyes = 'l';
        const reach = Math.floor((u + 5.0) / 0.15) * 4 + 2;
        for (let c = CH - 1; c >= Math.max(0, CH - reach); c--) strandAt(0, c);
      } else if (u < -4.0) {
        arms = 'pull'; eyes = 'l';
        for (let c = CH - 1; c >= 0; c--) strandAt(0, c);
        const q = u + 4.6;
        for (const i of changed) { slot[i].d = before[i]; slot[i].look = springLook(q); }
      } else if (u < -1.0) {
        for (const i of changed) slot[i].look = null;
        const k = Math.min(3, Math.floor((u + 4.0) / 0.75));
        const sw = Math.floor((u + 4.0) / 0.25) % 2;
        arms = sw ? 'up' : 'pull';
        eyes = k === 3 ? 'up' : 'c';
        bundle = { n: [1, 2, 4, 8][k], phase: sw };
      } else if (u < 0) {
        for (const i of changed) slot[i].look = null;
        arms = 'rest'; eyes = u < -0.3 ? 'shut' : 'up';
        cloud = u < -0.5 ? 1 : 0.5;
        hatUp = u < -0.8 ? 3 : u < -0.3 ? 8 : 2;
      } else {
        arms = 'pull'; eyes = 'l';
        // the hour curls in first, then the minutes
        if (u < 0.4) cloud = 0.25;
        changed.forEach((i) => { slot[i].d = after[i]; slot[i].look = curlLook(u - (i < 2 ? 0 : 0.4)); });
        if (u > 1.3) { arms = 'up'; eyes = 'up'; }
      }
    } else {
      const cyc = Math.floor(T / 4.8), ph = T - cyc * 4.8;
      if (noise(cyc, 3) < 0.55 && ph >= 2.4 && ph < 4.5) {
        const k = Math.floor((ph - 2.4) / 0.3);
        arms = 'reachL'; eyes = 'l';
        const len = k < 1 ? 1 : k < 5 ? 2 : 1;
        for (let c = CH - 1; c >= CH - len; c--) strandAt(1, c, (k + c) % 2 && k >= 1 && k < 5 ? SAG : STRAND);
      } else arms = idleArms();
    }

    // steam from the pot: a wisp rising every 1.6 s, in the cell above it
    if (!cloud && grid[0][POTC] === 0x20) {
      const steam = [COMMA, SPECK, BACK, 0x20];
      grid[0][POTC] = steam[Math.floor(T / 0.4) % 4];
    }

    // ------------------------------------------------------------- compose
    const cells = [Array(16).fill(null), Array(16).fill(null)];
    slot.forEach((s, i) => {
      if (s.look == null || s.d == null) return;
      const col = COLS[i], r = TALLSLOT[i] ? 0 : 1;
      if (s.look === 'digit') {
        if (TALLSLOT[i]) { cells[0][col] = half(TALL[s.d], 0); cells[1][col] = half(TALL[s.d], 1); }
        else cells[1][col] = SMALL[s.d];
      } else if (s.look === 'strand') grid[r][col] = STRAND;
      else cells[r][col] = KINK[s.look === 'kink0' ? 0 : 1];
    });
    grid[0][COLON] = SPECK; grid[1][COLON] = SPECK;
    cells[0][CH] = head(hatUp);
    cells[1][CH] = body(arms);
    grid[1][POTC] = POT;

    if (bundle) {
      const { n, phase } = bundle;
      for (let r = 0; r < 2; r++) for (let c = 0; c < 16; c++) {
        if (cells[r][c] || c === COLON || (r === 1 && c === POTC)) continue;
        if (n === 1) grid[r][c] = r === 1 ? (phase ? SAG : STRAND) : 0x20;
        else if (n === 2) grid[r][c] = phase ? SAG : STRAND;
        else cells[r][c] = n === 4 ? BUNDLE[4] : BUNDLE[phase ? '8b' : 8];
      }
    }
    if (cloud) {
      const marks = [SPECK, DOT, BACK, RING, STAR, COMMA, TICK];
      const k = Math.floor(T / 0.2);
      for (let r = 0; r < 2; r++) for (let c = 0; c < 16; c++) {
        if (cells[r][c] || c === COLON || (r === 1 && c === POTC)) continue;
        grid[r][c] = noise(c * 3 + r * 53 + k * 7, 11) < cloud * 0.6
          ? marks[Math.floor(noise(c + r * 16 + k, 5) * marks.length)] : 0x20;
      }
    }

    const alloc = new TileAllocator(lcd, 0);
    const first = [[0, H1C], [1, H1C], [0, H2C], [1, H2C], [1, M1C], [1, M2C], [0, CH], [1, CH]];
    const order = [...first];
    for (let r = 0; r < 2; r++) for (let c = 0; c < 16; c++) if (!first.some(([a, b]) => a === r && b === c)) order.push([r, c]);
    for (const [r, c] of order) {
      const w = cells[r][c];
      if (w) grid[r][c] = alloc.add(w) ?? 0x20;
    }
    alloc.flush();
    grid.forEach((codes, r) => { lcd.setCursor(0, r); codes.forEach((c) => lcd.data(c)); });
  },
};
