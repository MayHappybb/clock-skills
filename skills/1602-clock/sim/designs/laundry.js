// Laundry — the time is the washing, pegged out on a line in the wind.
//
// A clothesline runs along the top row between two T-posts. The four
// digits are garments cut in the shape of numerals, folded over the rope
// and hanging in the bottom row: the hours on the left, the minutes on the
// right. The wind never stops: gusts roll along the line from left to
// right, a leaf tumbling ahead and each garment's hem kicking up as it
// passes; between gusts a hem flicks, and wet washing drips.
//
// A sparrow lives on the line. It hops along the rope, fidgets, pecks,
// looks round, and flies off to another spot every few seconds; at night
// it sleeps fluffed up in the gap between the hours and the minutes.
//
// The minute: the sparrow is the one who does the washing. It hops onto
// each garment that is about to change, worries the peg, yanks it out,
// and the old digit drops off the bottom of the glass. Someone below
// tosses up the new one, it flies up to the line, and the sparrow stamps
// the peg back in. Old digits always leave before the minute and new
// ones arrive after it, so the glass shows a gap, never a wrong time.
//
// The hour: a gale. Gusts pile in, the sparrow is blown off, the pegs
// ping out one after another and the whole wash sails up out of the top
// of the glass. A beat of empty line, then the new hour's washing comes
// fluttering down out of the sky, garment by garment, and is pegged.
//
// Tiles: a garment is its bottom cell plus the fold of cloth over the rope
// in the top cell. Folds come in three shapes, so four garments cost 5-7
// tiles; the sparrow on bare rope takes one more. If a frame would need a
// ninth, the wind drops for that moment (hems still, so identical garments
// share), and failing that the sparrow is off the line. The rope, the
// posts and the blown leaves are ROM.

import { TileAllocator, noise } from '../js/kit.js';

// ------------------------------------------------------------------ layout

const COL = [5, 6, 9, 10];          // H1 H2 | M1 M2
const LINE_ROW = 6;                 // the line, a dot row of the top cell
const TOP = 7;                      // a garment's top edge: right under the rope
const PEGS = 0x0a;                  // the two pegs, seen only as they ping off
const SPOTS = [7, 8, 8, 7, 12, 3, 13, 2, 4, 11];   // bare line; 7-8 is between hours and minutes
const LINE = 0x5f;                  // ROM underscore: full-width bar on row 6

// ------------------------------------------------------------------ glyphs

// Garment numerals, 5 x 8, two-dot strokes: the whole digit hangs in the
// bottom row, so it reads whole. (Hung one row higher, the digit's top row
// joins the rope and 0 reads as U, 9 as y; pegs drawn under the rope read as
// umlauts.)
const DIG = {
  0: ['.###.', '##.##', '##.##', '##.##', '##.##', '##.##', '##.##', '.###.'],
  1: ['.##..', '###..', '.##..', '.##..', '.##..', '.##..', '.##..', '####.'],
  2: ['.###.', '##.##', '...##', '..##.', '.##..', '##...', '##...', '#####'],
  3: ['.###.', '##.##', '...##', '.###.', '...##', '...##', '##.##', '.###.'],
  4: ['##.##', '##.##', '##.##', '##.##', '#####', '...##', '...##', '...##'],
  5: ['#####', '##...', '##...', '####.', '...##', '...##', '##.##', '.###.'],
  6: ['.###.', '##...', '##...', '####.', '##.##', '##.##', '##.##', '.###.'],
  7: ['#####', '...##', '...##', '..##.', '..##.', '.##..', '.##..', '.##..'],
  8: ['.###.', '##.##', '##.##', '.###.', '##.##', '##.##', '##.##', '.###.'],
  9: ['.###.', '##.##', '##.##', '##.##', '.####', '...##', '##.##', '.###.'],
};
// The fold of cloth thrown over the rope: the garment's own width, one row,
// right under the rope. Three shapes (wide; the narrow 1; the 4, folded over
// at each arm so a closed top does not turn it into a 9), so garments share
// top tiles.
const FOLD = { 1: '.###.', 4: '##.##' };
const bits = (r) => [...r].reduce((b, ch) => (b << 1) | (ch === '#' ? 1 : 0), 0);
const GARMENT = Object.fromEntries(Object.entries(DIG).map(([d, rows]) => [d, [FOLD[d] ?? '#####', ...rows].map(bits)]));

// The hem lifts in the wind: drop rows from the lowest stretch of identical
// rows, so the top stays pegged and the shape keeps its features.
function lifted(rows, k) {
  const out = rows.slice();
  for (let n = 0; n < k; n++) {
    let cut = -1;
    for (let i = out.length - 2; i >= 4; i--) if (out[i] === out[i - 1]) { cut = i; break; }
    if (cut < 0) cut = out.length - 2;
    out.splice(cut, 1);
  }
  return out;
}

// The sparrow: one cell, six rows tall, standing on the rope (row 6).
// Drawn facing right; mirrored to face left.
const BIRD_ART = {
  perch: ['.....', '..##.', '..###', '####.', '.###.', '..#..'],   // head, beak right, tail out left, leg
  peck:  ['.....', '.....', '#....', '####.', '.####', '..#.#'],   // tail up, beak down at the rope
  tug:   ['.....', '..##.', '..###', '####.', '.###.', '..#..'],
  flap:  ['.#...', '#.##.', '..###', '####.', '.###.', '..#..'],   // wing flung up
  fly:   ['#...#', '##.##', '.###.', '.....', '.....', '.....'],   // airborne
  sleep: ['.....', '.....', '.....', '.###.', '#####', '..#..'],   // fluffed into a ball
};
const BIRD = {};
for (const [k, rows] of Object.entries(BIRD_ART)) {
  BIRD[k + 'R'] = rows.map(bits);
  BIRD[k + 'L'] = rows.map((r) => bits([...r].reverse().join('')));
}


// Pegs sit where the garment has cloth on its top edge: two for a wide top,
// one in the middle of a narrow one (the 1).
function pegsFor(top) {
  if ((top & PEGS) === PEGS) return PEGS;
  return (top & 0x04) ? 0x04 : top & 0x08 ? 0x08 : 0x02;
}

// ------------------------------------------------------------------ time

function digitsAt(T) {
  const s = ((Math.floor(T) % 86400) + 86400) % 86400;
  const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60;
  return [Math.floor(h / 10), h % 10, Math.floor(m / 10), m % 10];
}

// Step a value through a list of [time, value] keys (hold, no tween).
function steps(q, keys) {
  let v = keys[0][1];
  for (const [t, val] of keys) if (q >= t) v = val;
  return v;
}

// ------------------------------------------------------------------ the turn

// Plans the turn at boundary B (seconds since midnight).
function plan(B) {
  const before = digitsAt(B - 1), after = digitsAt(B);
  const changed = [0, 1, 2, 3].filter((i) => before[i] !== after[i]);
  const hour = before[1] !== after[1] || before[0] !== after[0];
  if (hour) return { B, before, after, hour: true, w0: B - 10, end: B + 6 };
  // minute: the sparrow unpegs left to right, then pegs left to right
  const n = changed.length;
  const out = changed.slice();                          // left to right, so no gap is long
  const yank = out.map((_, j) => -1.7 - 2.0 * (n - 1 - j));
  const rise = changed.map((_, j) => 0.3 + 1.9 * j);
  return { B, before, after, hour: false, changed, out, yank, rise,
    w0: B + yank[0] - 2.4, end: B + rise[n - 1] + 2.6 };
}

// ------------------------------------------------------------------ design

export default {
  name: 'Laundry',
  blurb: 'The time is the washing on the line: a sparrow unpegs the old digit each minute and pegs up the new one; on the hour a gale blows the whole wash away.',
  bus: 'i2c100',
  panel: 'green',
  fps: 8,

  frame(lcd, api, { date }) {
    const midnight = new Date(date); midnight.setHours(0, 0, 0, 0);
    const T = (date.getTime() - midnight.getTime()) / 1000;
    const hourNow = date.getHours();
    const night = hourNow >= 23 || hourNow < 6;

    let P = plan(Math.round(T / 60) * 60);
    if (!(T >= P.w0 && T < P.end)) P = null;

    // Garment state.
    const now = digitsAt(T);
    const G = [0, 1, 2, 3].map((i) => ({ d: now[i], dy: 0, lift: 0, peg: 0, drip: false }));
    let bird = null;                       // { i, pose, dy } dy: rows above perch
    let gale = 0;                          // 0..1, wind strength for streaks

    // ---- idle wind: gusts roll left to right along the line
    const GUST = 6.5;
    const gk = Math.floor(T / GUST);
    const gStart = gk * GUST + noise(gk, 3) * 2.5;
    const gustAt = (col) => T - gStart - col * 0.13;   // time since the gust reached col
    for (let i = 0; i < 4; i++) {
      const q = gustAt(COL[i]);
      if (q >= 0 && q < 0.9) G[i].lift = q < 0.3 ? 1 : q < 0.6 ? 2 : 1;
      // breeze: a hem flick now and then
      const b = Math.floor(T / 1.1 + i * 0.37);
      if (!G[i].lift && noise(b, 10 + i) > 0.72) G[i].lift = 1;
      // drips
      const dk = Math.floor(T / 0.5);
      if (noise(dk, 20 + i) > 0.9) G[i].drip = true;
    }

    // ---- idle sparrow: a new perch every 6 s, fidgets between
    if (!P) {
      const slot = Math.floor(T / 6), u = T - slot * 6;
      const perchOf = (k) => SPOTS[Math.floor(noise(k, 7) * SPOTS.length)];
      const p = night ? 7 : perchOf(slot), prev = night ? p : perchOf(slot - 1);
      const r = noise(Math.floor(T / 0.6), 8);
      const pose = night ? (Math.floor(T / 2) % 4 ? 'sleep' : 'perch')
        : r < 0.4 ? 'perch' : r < 0.65 ? 'look' : r < 0.88 ? 'peck' : 'flap';
      if (p !== prev) {
        if (u < 0.3) bird = { c: prev, pose: 'flap', dy: 0 };
        else if (u < 0.6) bird = { c: prev, pose: 'fly', dy: 2 };
        else if (u < 1.0) bird = null;
        else if (u < 1.3) bird = { c: p, pose: 'fly', dy: 2 };
        else if (u < 1.6) bird = { c: p, pose: 'flap', dy: 0 };
        else bird = { c: p, pose, dy: 0 };
      } else bird = { c: p, pose, dy: 0 };
      if (bird) bird.face = noise(slot, 9) < 0.5 ? 'R' : 'L';
    }

    // ---- the turn
    if (P && !P.hour) {
      const u = T - P.B;
      for (const i of P.changed) G[i].d = P.before[i];
      // unpegging
      P.out.forEach((i, j) => {
        const y = P.yank[j], q = u - y;
        if (q >= -1.6 && q < 0) {
          bird = { c: COL[i], pose: Math.floor(q / 0.4) % 2 ? 'peck' : 'perch', dy: 0 };
          if (q < -1.4 && j > 0) bird = { c: COL[i], pose: 'perch', dy: 1 };     // hop across
        }
        if (q >= 0) {
          G[i].peg = 1;                                   // peg gone
          G[i].dy = steps(q, [[0, 1], [0.3, 3], [0.6, 5], [0.9, 7], [1.2, 99]]);
          G[i].lift = 0;
          if (q < 1.6) bird = { c: COL[i], pose: q < 0.6 ? 'tug' : 'flap', dy: 0 };
        }
      });
      if (u >= 0) for (const i of P.changed) { G[i].d = P.after[i]; G[i].dy = 99; G[i].peg = 1; }
      P.changed.forEach((i, j) => {
        const q = u - P.rise[j];
        // waiting for the next one: it looks down for it, unless still busy
        if (u >= 0 && q < 0 && (j === 0 || u - P.rise[j - 1] >= 1.9)) bird = { c: COL[i], pose: 'look', dy: 0 };
        if (q >= 0) {
          G[i].dy = steps(q, [[0, 6], [0.25, 4], [0.5, 1], [0.75, -2], [1.0, 0]]);
          G[i].lift = steps(q, [[0, 0], [1.0, 2], [1.3, 1], [1.6, 0]]);
          G[i].peg = q >= 1.3 ? 0 : 1;
          if (q < 1.9) {
            bird = { c: COL[i], pose: q < 1.0 ? 'tug' : q < 1.3 ? 'flap' : q < 1.6 ? 'peck' : 'perch',
              dy: q >= 1.0 && q < 1.3 ? 1 : 0 };
          }
        }
      });
    }

    if (P && P.hour) {
      const u = T - P.B;
      gale = u < 0 ? Math.min(1, (u + 10) / 5) : Math.max(0, 1 - u / 1.5);
      for (let i = 0; i < 4; i++) {
        G[i].d = u < 0 ? P.before[i] : P.after[i];
        const pop = -3.0 + 0.45 * i, go = pop + 0.3;
        if (u < 0) {
          // everything flaps hard
          G[i].lift = Math.floor(T * 3 + i) % 2 ? 1 : 2;
          if (u >= pop) G[i].peg = u < pop + 0.3 ? 2 : 1;   // peg jumps, then gone
          if (u >= go) { G[i].dy = steps(u - go, [[0, -2], [0.3, -5], [0.6, -8], [0.9, -11], [1.2, -14], [1.5, -99]]); }
        } else {
          const q = u - (0.5 + 0.55 * i);
          G[i].dy = q < 0 ? -99 : steps(q, [[0, -14], [0.3, -11], [0.6, -8], [0.9, -5], [1.2, -2], [1.5, 0]]);
          G[i].lift = q < 0 ? 0 : steps(q, [[0, 2], [0.3, 0], [0.6, 2], [0.9, 0], [1.2, 1], [1.5, 0]]);
          G[i].peg = q < 1.5 ? 1 : 0;
        }
        G[i].drip = false;
      }
      // the sparrow clings, then is blown away, then comes back
      if (u < -4.5) bird = { c: COL[3], pose: Math.floor(T * 4) % 2 ? 'flap' : 'perch', dy: 0 };
      else if (u < -4.2) bird = { c: COL[3], pose: 'fly', dy: 2 };
      else if (u > 4.6) bird = { c: COL[3], pose: u < 4.9 ? 'fly' : u < 5.2 ? 'flap' : 'perch', dy: u < 4.9 ? 2 : 0 };
    }

    // ---- draw
    const alloc = new TileAllocator(lcd, 0);
    const grid = [Array(16).fill(0x20), Array(16).fill(0x20)];
    for (let c = 1; c < 15; c++) grid[0][c] = LINE;
    grid[0][0] = grid[0][15] = 0x54; grid[1][0] = grid[1][15] = 0x7c;   // T-posts

    // leaves bowling along the bottom row ahead of each gust (ROM, free)
    const LEAF = [0x60, 0x27];   // a leaf flipping over as it tumbles
    const leaves = [];
    { const q = T - gStart; if (q >= 0) leaves.push(Math.floor(q / 0.2)); }
    if (gale > 0) for (let k = 0; k < 4; k++) {
      const c = Math.floor((T + k * 0.83) / 0.2) % 20;
      if (noise(Math.floor((T + k * 0.83) / 4) * 4 + k, 40) < gale) leaves.push(c);
    }
    // never right beside a garment, where a leaf reads as a prime mark ("59'")
    const nearCloth = (c) => COL.some((k) => Math.abs(k - c) <= 1);
    for (const c of leaves) if (c >= 1 && c < 15 && !nearCloth(c)) grid[1][c] = LEAF[c & 1];

    // The sparrow's ink in a top-row cell (8 rows), or null.
    const birdInk = (bird, c) => {
      if (!bird) return null;
      let face = bird.face ?? 'R', pose = bird.pose;
      if (pose === 'look') { pose = 'perch'; face = face === 'R' ? 'L' : 'R'; }
      if (c !== bird.c) return null;
      const art = BIRD[pose + face], ink = Array(8).fill(0);
      for (let r = 0; r < art.length; r++) { const y = LINE_ROW - art.length + r - bird.dy; if (y >= 0 && y < 8) ink[y] |= art[r]; }
      return ink;
    };
    const birdCells = (bird) => (bird ? [bird.c] : []);

    // One garment's column of 16 dot rows: rope, cloth, pegs, drip, sparrow.
    const column = (i, bird) => {
      const g = G[i];
      const f = Array(16).fill(0);
      let onLine = false;
      if (g.d !== null && g.dy > -99 && g.dy < 99) {
        const rows = lifted(GARMENT[g.d], g.lift);
        const y0 = TOP + g.dy;
        rows.forEach((b, r) => { const y = y0 + r; if (y >= 0 && y < 16) f[y] |= b; });
        onLine = y0 <= LINE_ROW && y0 + rows.length > LINE_ROW;
        if (g.peg === 2) f[LINE_ROW - 3] |= pegsFor(rows[0]);  // pegs pinging up off the rope
        const hem = y0 + rows.length;
        if (g.drip && g.dy === 0 && hem < 16) {
          const last = rows[rows.length - 1];
          f[hem] |= last & 0x04 ? 0x04 : last & 0x08 ? 0x08 : last & 0x02 ? 0x02 : 0x10;
        }
      }
      if (!onLine) f[LINE_ROW] |= 0x1f;      // the rope, behind the garment
      const ink = birdInk(bird, COL[i]);
      if (ink) ink.forEach((v, r) => { f[r] |= v; });
      return f;
    };
    const bareCell = (bird, c) => {
      const f = Array(8).fill(0); f[LINE_ROW] = 0x1f;
      birdInk(bird, c).forEach((v, r) => { f[r] |= v; });
      return f;
    };

    const LINE_KEY = [0, 0, 0, 0, 0, 0, 0x1f, 0].join(), EMPTY_KEY = Array(8).fill(0).join();
    const slotsUsed = (bird) => {
      const used = new Set();
      for (let i = 0; i < 4; i++) {
        const f = column(i, bird);
        for (const k of [f.slice(0, 8).join(), f.slice(8).join()]) if (k !== LINE_KEY && k !== EMPTY_KEY) used.add(k);
      }
      for (const c of birdCells(bird)) if (c >= 0 && c < 16 && !COL.includes(c)) used.add(bareCell(bird, c).join());
      return used.size;
    };
    // If the sparrow does not fit, the wind drops for it (hems hang still);
    // if it still does not fit, it is off somewhere this moment.
    if (bird && slotsUsed(bird) > 8) {
      const saved = G.map((g) => [g.lift, g.drip]);
      G.forEach((g) => { g.lift = 0; g.drip = false; });
      if (slotsUsed(bird) > 8) { G.forEach((g, i) => { [g.lift, g.drip] = saved[i]; }); bird = null; }
    }
    for (let i = 0; i < 4; i++) {
      const f = column(i, bird);
      const top = f.slice(0, 8), bot = f.slice(8, 16);
      grid[0][COL[i]] = top.join() === LINE_KEY ? LINE : alloc.add(top) ?? LINE;
      grid[1][COL[i]] = bot.every((v) => !v) ? 0x20 : alloc.add(bot) ?? 0x20;
    }
    for (const c of birdCells(bird)) {
      if (c < 0 || c > 15 || COL.includes(c)) continue;
      const code = alloc.add(bareCell(bird, c));
      if (code !== null) grid[0][c] = code;
    }
    alloc.flush();
    grid.forEach((row, r) => { lcd.setCursor(0, r); row.forEach((c) => lcd.data(c)); });
  },
};
