// Printer — a dot-matrix print head lives between the hours and the minutes.
//
// The glass is a strip of tractor-feed paper: sprocket holes run down both
// margins (ROM 'o', free while the paper is at rest) and the time is printed
// on it in draft, struck in pin columns (#.#.#), so the gap between cells
// becomes one more gap in an even comb of dot columns. The head is a little
// character, five dots by sixteen, parked between the hours and the minutes,
// glancing from one to the other and tapping the platen once a second.
//
// Every minute the paper feeds up and the old print scrolls off the top past
// the head, with the holes running; the head travels to the end of the line
// while it does, then sweeps back hammering the new time out cell by cell,
// the cell behind it half struck for a frame, and bumps the end stop. It
// prints bidirectionally: odd minutes left to right, even minutes right to
// left, so half the time the minutes come out first.
//
// On the hour it does a form feed instead: the page break (a dotted
// perforation) runs through, the hour is printed double-width, then struck a
// second time on the way back so it comes out emphasised (solid), the head
// dances between its digits, and that sheet feeds away for the time.
//
// Budget: the digit parts are stacks of whole rows (T, M, B and the solid
// stroke), so a part shifted by the feed is still a stack of whole rows. A
// sweep of every frame of every transition over the day shows feeds of one
// or two dots would need nine tiles at some minutes; the paper starts every
// feed with a four-dot jerk instead. Worst case 8 slots: up to five paper
// tiles, the moving holes and the head's two.

import { TileAllocator, noise } from '../js/kit.js';

const Q = 1 / 6;                     // one step: two frames at 12 fps, ~167 ms
const MARGINS = [0, 15];
const DIGIT_COLS = [1, 4, 8, 11];
const PARK = 7;                      // the head's home, between hours and minutes
const FIRST = 1, LAST = 13;          // the print line

// ------------------------------------------------------------------ glyphs
// Row masks, 5 bits per row. Ink is struck in pin columns (#.#.#): with the
// gap between cells that is one even comb of dot columns across the glass.
// Every part is a stack of whole rows, so a part shifted by the paper feed
// is still a stack of whole rows, and few new tiles appear while it moves.
const FULL = 0x1f, INK = 0x15;
const bars = (...lit) => Array.from({ length: 8 }, (_, r) => (lit.includes(r) ? INK : 0));
const PART = {
  '#': bars(0, 1, 2, 3, 4, 5, 6, 7),
  ' ': bars(),
  T: bars(0, 1, 2),
  M: bars(0, 1, 2, 5, 6, 7),
  B: bars(5, 6, 7),
};
const DIGITS = {
  0: ['#T#', '#B#'],
  1: ['T# ', 'B#B'],
  2: ['MM#', '#BB'],
  3: ['MM#', 'BB#'],
  4: ['#B#', '  #'],
  5: ['#MM', 'BB#'],
  6: ['#MM', '#B#'],
  7: ['TT#', '  #'],
  8: ['#M#', '#B#'],
  9: ['#M#', 'BB#'],
};

/** A printed time as part names, [row][col]. */
function timeGrid(f) {
  const g = [Array(16).fill(' '), Array(16).fill(' ')];
  [f.hh[0], f.hh[1], f.mm[0], f.mm[1]].forEach((d, k) => {
    DIGITS[d].forEach((parts, row) => [...parts].forEach((p, i) => { g[row][DIGIT_COLS[k] + i] = p; }));
  });
  return g;
}

/** The hour in double-width print: every part column doubled. */
function bannerGrid(hh) {
  const g = [Array(16).fill(' '), Array(16).fill(' ')];
  [hh[0], hh[1]].forEach((d, k) => {
    const c0 = k === 0 ? 1 : 8;
    DIGITS[d].forEach((parts, row) => [...parts].forEach((p, i) => {
      g[row][c0 + 2 * i] = p; g[row][c0 + 2 * i + 1] = p;
    }));
  });
  return g;
}

// ---------------------------------------------------------------- the head
// Five dots by sixteen, both rows: a face over a carriage. Built from
// features so every pose is one picture, two tiles.
const EYES = {
  c: ['#.#.#', '#.#.#'],      // ahead
  l: ['.#.##', '.#.##'],      // at the hours
  r: ['##.#.', '##.#.'],      // at the minutes
  shut: ['#####', '#.#.#'],   // blink, or squinting at the work
  up: null,                   // drawn one row higher, see headRows
  happy: ['#.#.#', '#####'],
};
const MOUTH = { n: '#####', o: '##.##', O: '#...#' };

function headRows({ eyes = 'c', mouth = 'n', pins = 'rest', bob = 0 }) {
  const e = eyes === 'up' ? EYES.c : EYES[eyes];
  const face = [
    '.....',
    '.###.',
    '#####',
    eyes === 'up' ? e[0] : '#####',
    eyes === 'up' ? e[1] : e[0],
    eyes === 'up' ? '#####' : e[1],
    MOUTH[mouth],
    '#####',
    '#####',                     // carriage
    '#...#',                     // ribbon window
    '#####',
    pins === 'tap' ? '#####' : pins === 'b' ? '.#.#.' : '#.#.#',
    pins === 'a' || pins === 'b' ? (pins === 'a' ? '.#.#.' : '#.#.#') : '#####',
    '.#.#.',                     // wheels on the rail
    '.....',
    '.....',
  ];
  // bob > 0 hops up a dot, bob < 0 dips down one (the face has room below)
  const rows = bob > 0 ? [...face.slice(bob), ...Array(bob).fill('.....')]
    : bob < 0 ? [...Array(-bob).fill('.....'), ...face.slice(0, 16 + bob)] : face;
  return rows.map((l) => [...l].reduce((m, ch) => (m << 1) | (ch === '#' ? 1 : 0), 0));
}

// ---------------------------------------------------------------- paper
const HOLE = [0, 0, 0x0e, 0x11, 0x11, 0x11, 0x0e, 0];   // ROM 'o': a round sprocket hole
const HOLE_ROM = 0x6f;
const PERF = 0x15;                                      // the page break, a dotted row

function paperMask(paper, col, y) {
  let m = 0;
  if (MARGINS.includes(col)) m = HOLE[((y % 8) + 8) % 8];
  else {
    for (const it of paper.items) {
      if (y < it.y || y >= it.y + 16 || !it.printed(col)) continue;
      const rel = y - it.y;
      let row = PART[it.grid[rel >> 3][col]][rel & 7];
      const wet = col === paper.wet?.col && it.name === paper.wet.item ? paper.wet.mask : FULL;
      if (row && it.bold?.(col)) row = INK | (FULL & wet);   // struck twice: emphasised
      else row &= wet;                                      // the head's last cell, half struck
      m |= row;
    }
  }
  if (paper.perf !== undefined && y === paper.perf) m |= PERF;
  return m;
}

// ------------------------------------------------------------- timeline
// Feed steps in dots. Offsets of one and two dots would make too many new
// tiles (a sweep over every minute of the day says so), so the paper starts
// with a four-dot jerk, which is what a stepper does anyway.
const cum = (steps, k) => steps.slice(0, Math.max(0, Math.min(k, steps.length))).reduce((a, b) => a + b, 0);
const FEED16 = [4, 2, 2, 2, 2, 2, 2];
const FEED32 = [4, 2, 2, 4, 4, 4, 4, 4, 2, 2];
const ALL = () => true;
const NONE = () => false;

/** Cells printed by a pass of the head, given where it is now. */
const passPrinted = (dir, head) => (dir > 0 ? (c) => c < head : (c) => c > head);

/** Head travel from a to b, one cell per step, starting at step i0. */
function travel(a, b, i, i0) {
  const n = Math.abs(b - a), k = Math.max(0, Math.min(n, i - i0));
  return a + Math.sign(b - a) * k;
}

/** What the head does while parked: something every second. */
function idlePose(s, minute) {
  const sec = Math.floor(s), sub = s - sec;
  if (s >= 59.5) return { eyes: 'up', mouth: 'o', pins: Math.floor(s * 12) % 2 ? 'a' : 'b' };
  if (s >= 58) return { eyes: 'up', mouth: 'n' };
  const look = ['c', 'l', 'c', 'r'][(sec + minute) % 4];
  const blink = noise(sec, minute) < 0.22 && sub > 0.5 && sub < 0.67;
  // Every second the head taps the platen: it dips a dot and fires its pins.
  const tick = sub < Q;
  return { eyes: blink ? 'shut' : look, pins: tick ? 'tap' : 'rest', bob: tick ? -1 : 0 };
}

function scene(fields, prev, s, frameNo) {
  const i = Math.floor(s / Q);
  const buzz = frameNo % 2 ? 'a' : 'b';
  const now = timeGrid(fields), old = timeGrid(prev);
  const paper = { items: [{ y: 0, grid: old, printed: ALL }] };
  let F, head, pose;
  const look = (from, to) => (to > from ? 'r' : to < from ? 'l' : 'c');

  if (fields.m !== 0) {
    const dir = fields.m % 2 ? 1 : -1;
    const start = dir > 0 ? FIRST : LAST, end = start + dir * 13;
    const P0 = FEED16.length;                     // pass begins
    F = cum(FEED16, i + 1);
    let printed = NONE;
    if (i < P0) {
      head = travel(PARK, start, i, 1);
      pose = { eyes: i < 1 ? 'up' : look(PARK, start), mouth: i < 1 ? 'O' : 'n' };
    } else if (i < P0 + 13) {
      head = start + dir * (i - P0); printed = passPrinted(dir, head); paper.pass = { dir, item: 'now' };
      pose = { eyes: 'shut', pins: buzz };
    } else if (i < P0 + 15) {
      head = end; printed = ALL;                  // the end stop: a bump
      pose = { eyes: 'shut', mouth: 'O', pins: 'tap' };
    } else {
      head = travel(end, PARK, i, P0 + 15); printed = ALL;
      pose = head === PARK ? idlePose(s, fields.m) : { eyes: look(end, PARK), mouth: 'n' };
      if (head === PARK && i < P0 + 15 + 10) pose = { eyes: 'happy' };
    }
    paper.items.push({ name: 'now', y: 16, grid: now, printed });
  } else {
    // On the hour: a form feed past the page break, the hour in double-width
    // print, struck a second time on the way back so it comes out bold, a
    // little dance between its digits, then the time.
    paper.perf = 24;
    const B0 = FEED32.length;                     // banner, first strike, left to right
    const S0 = B0 + 15;                           // second strike, right to left
    const C0 = S0 + 15 + 7;                       // back at the centre
    const D0 = C0 + 10;                           // second feed
    const P0 = D0 + FEED16.length;                // the time, left to right
    F = cum(FEED32, i + 1) + (i >= D0 ? cum(FEED16, i - D0 + 1) : 0);
    let banner = NONE, bold = NONE, printed = NONE;
    if (i < B0) {
      head = travel(PARK, FIRST, i, 3);
      pose = { eyes: i < 3 ? 'up' : 'l', mouth: 'O' };
    } else if (i < S0 - 2) {
      head = FIRST + (i - B0); banner = passPrinted(1, head); paper.pass = { dir: 1, item: 'banner' };
      pose = { eyes: 'shut', pins: buzz };
    } else if (i < S0) {
      head = 14; banner = ALL; pose = { eyes: 'shut', mouth: 'O', pins: 'tap' };
    } else if (i < S0 + 13) {
      head = LAST - (i - S0); banner = ALL; bold = passPrinted(-1, head);   // no half-struck cell: no slot left for it
      pose = { eyes: 'shut', mouth: 'o', pins: buzz };
    } else if (i < S0 + 15) {
      head = 0; banner = ALL; bold = ALL; pose = { eyes: 'shut', mouth: 'O', pins: 'tap' };
    } else if (i < C0) {
      head = travel(0, PARK, i, S0 + 15); banner = ALL; bold = ALL; pose = { eyes: 'r' };
    } else if (i < D0) {
      head = PARK; banner = ALL; bold = ALL;      // dance between the hour's digits
      const k = i - C0;
      pose = { eyes: 'happy', mouth: k % 2 ? 'O' : 'o', bob: k % 2, pins: 'tap' };
    } else if (i < P0) {
      head = travel(PARK, FIRST, i, D0 + 1); banner = ALL; bold = ALL;
      pose = { eyes: i < D0 + 1 ? 'up' : 'l' };
    } else if (i < P0 + 13) {
      head = FIRST + (i - P0); banner = ALL; bold = ALL; printed = passPrinted(1, head); paper.pass = { dir: 1, item: 'now' };
      pose = { eyes: 'shut', pins: buzz };
    } else if (i < P0 + 15) {
      head = 14; banner = ALL; bold = ALL; printed = ALL; pose = { eyes: 'shut', mouth: 'O', pins: 'tap' };
    } else {
      head = travel(14, PARK, i, P0 + 15); banner = ALL; bold = ALL; printed = ALL;
      pose = head === PARK ? idlePose(s, 0) : { eyes: 'l' };
      if (head === PARK && i < P0 + 15 + 7 + 10) pose = { eyes: 'happy' };
    }
    paper.items.push({ name: 'banner', y: 32, grid: bannerGrid(fields.hh), printed: banner, bold });
    paper.items.push({ name: 'now', y: 48, grid: now, printed });
  }
  // The first frame of each step, the cell the head has just left shows only
  // the pin columns struck first: the ink lands column by column behind it.
  if (paper.pass && frameNo % 2 === 0) {
    const { dir, item } = paper.pass;
    paper.wet = { col: head - dir, item, mask: dir > 0 ? 0x1c : 0x07 };
  }
  return { paper, F, head, pose };
}

// ---------------------------------------------------------------- design
const toRows = (m) => m.map((b) => Array.from({ length: 5 }, (_, i) => ((b >> (4 - i)) & 1 ? '#' : '.')).join(''));
const same = (a, b) => a.every((v, r) => v === b[r]);

export default {
  name: 'Printer',
  blurb: 'A print head with a face lives between the hours and minutes; each minute the tractor paper feeds and it hammers out the new time.',
  bus: 'i2c100',
  panel: 'green',
  fps: 12,

  frame(lcd, api, { date, fields, kit }) {
    const s = fields.s + fields.ms / 1000;
    const frameNo = Math.floor(s * 12);
    const prev = kit.clockFields(new Date(date.getTime() - 60000));
    const { paper, F, head, pose } = scene(fields, prev, s, frameNo);

    const cells = [[], []];
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 16; col++) {
        cells[row][col] = Array.from({ length: 8 }, (_, r) => paperMask(paper, col, F + 8 * row + r));
      }
    }
    const hm = headRows(pose);
    cells[0][head] = hm.slice(0, 8);
    cells[1][head] = hm.slice(8, 16);

    // Allocate the printed time first, then the head, then the sprocket
    // holes (which are ROM whenever the paper is at rest).
    const alloc = new TileAllocator(lcd, 0);
    const codes = [[], []];
    const order = [];
    for (let row = 0; row < 2; row++) for (let col = 0; col < 16; col++) {
      order.push([col === head ? 1 : MARGINS.includes(col) ? 2 : 0, row, col]);
    }
    order.sort((a, b) => a[0] - b[0]);
    for (const [, row, col] of order) {
      const m = cells[row][col];
      if (m.every((b) => b === FULL)) codes[row][col] = 0xff;
      else if (m.every((b) => b === 0)) codes[row][col] = 0x20;
      else if (same(m, HOLE)) codes[row][col] = HOLE_ROM;
      else codes[row][col] = alloc.add(toRows(m)) ?? 0x20;
    }
    alloc.flush();
    for (let row = 0; row < 2; row++) { lcd.setCursor(0, row); codes[row].forEach((c) => lcd.data(c)); }
  },
};
