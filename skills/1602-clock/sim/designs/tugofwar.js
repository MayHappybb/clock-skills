// Tug of War — the hours and the minutes, pulling on one rope over a mud pit.
//
// Four little tuggers, and each one's body is a digit: the hours team on the
// left, the minutes team on the right, the rope along the top row (ROM '_')
// and a mud pit between them (ROM squiggles). The teams heave in turn, half a
// second each, so the bow tied on the rope jerks back and forth every second
// while it creeps towards the side that is winning. At :30 the losers give a
// step and their heels plough up the dirt.
//
// Every minute the hours win. One big heave, the minutes are yanked forward,
// and every minute digit that is changing is flung off his feet in an arc,
// turns over at the top and goes head first into the mud (a cell per 150 ms),
// legs kicking, then bubbles. His replacement walks on from the right edge.
// At the hour the 59 finally wins: the hours team is dragged a cell at a time
// into the pit and goes under, the winners land on their backsides, get up,
// cheer and cannonball in after them, and the new hour and the new :00 walk on
// from both edges. The order is fixed so that an old digit is always gone
// before a new one arrives: the glass never shows a time that is not true.
//
// Budget: a tugger is a head cell over a body cell. Heads are shared by a team
// in the same pose (two tiles), bodies are the four digits (four), the bow is
// one, which leaves one for a fidget (somebody waves, a foot slips). Flying and
// sinking tuggers take their own two cells; the field hands out CGRAM by
// priority (numerals, then the flying, then the bow), and the sequence is
// timed so the worst frame of the day needs exactly eight.

import { clamp, noise } from '../js/kit.js';

const FPS = 10;
const ROPE = 0x5f;                 // '_': a rule on dot row 6, the rope along the top row
const MUD = 0xf3;                  // a ROM squiggle on rows 3-5: the mud in the pit
const BUBBLE = [0x6f, 0xa1];       // 'o', then a small ring low in the cell
const PIT_L = 5, PIT_R = 10;       // pit cells in the bottom row
const MUD_TOP = 11;                // figure dot rows from here down are under the mud
const HOME_H = [1, 2];             // hour tens (anchor), hour ones (front)
const HOME_M = [13, 14];           // minute tens (front), minute ones (anchor)
const XC = 47;                     // centre line: the gap between cells 7 and 8
const LINE_H = 31, LINE_M = 63;    // where the ribbon has to be dragged to win
const GAIN_AT = 30;                // the losing side gives a step
const MIN_LEN = 3.6;               // a minute turn, seconds
const HOUR_LEN = 6.6;              // the hour's show, seconds

const pic = (s) => s.trim().split(/\s+/);
const bits = (row) => [...row].reduce((b, ch) => (b << 1) | (ch === '#' ? 1 : 0), 0);
const mirror = (row) => [...row].reverse().join('');

// The bodies: a bold 5x6 face, two-dot strokes, so each tugger is a numeral.
const DIGIT = {
  0: pic('.###. ##.## ##.## ##.## ##.## .###.'),
  1: pic('..##. .###. ..##. ..##. ..##. .####'),
  2: pic('####. ...## .###. ##... ##... #####'),
  3: pic('####. ...## .###. ...## ...## ####.'),
  4: pic('##.## ##.## ##.## ##### ...## ...##'),
  5: pic('##### ##... ####. ...## ...## ####.'),
  6: pic('.###. ##... ####. ##.## ##.## .###.'),
  7: pic('##### ...## ..##. .##.. .##.. .##..'),
  8: pic('.###. ##.## .###. ##.## ##.## .###.'),
  9: pic('.###. ##.## ##.## .#### ...## .###.'),
};

// Heads and arms, the top cell of a tugger, drawn facing right (the hours
// team); the minutes team is the mirror image. The rope is not drawn here: it
// is the ROM rule underneath, on dot row 6, so the hands close on it.
const HEAD = {
  pull:   pic('.##.. .###. .##.. ..#.. ..#.. ...## ..... ..#..'),
  heave:  pic('##... ###.. ##... .#... ..#.. ...## ..... .#...'),
  big:    pic('..... ##... ###.. ##... .##.. ..### ..... .#...'),
  crouch: pic('..... ..... .##.. .###. .##.. ..#.# ..... ..#..'),
  strain: pic('..##. ..### ..##. ..#.. ..##. ...#. ..... ..#..'),
  yank:   pic('...## ..### ...## ...#. ...#. ...## ..... ..#..'),
  walk:   pic('.##.. .##.. ..#.. .###. #.#.# ..#.. ..... ..#..'),
  cheer:  pic('#...# #.#.# .###. ..#.. ..#.. ..#.. ..... ..#..'),
  flail:  pic('.#.#. #.#.# .###. ..#.. ..#.. ..#.. ..... ..#..'),
  wave:   pic('#.##. #.### #.##. .#... ..#.. ...## ..... ..#..'),
  wave2:  pic('..##. #.### #.##. .#... ..#.. ...## ..... ..#..'),
};

// Legs, the last two dot rows under the numeral, also facing right.
const LEGS = {
  brace: pic('.#..# #...#'),
  dig:   pic('.#.#. #...#'),
  skid:  pic('..#.# .#..#'),
  walkA: pic('.#.#. #...#'),
  walkB: pic('..#.. ..#..'),
  tuck:  pic('.###. .....'),
  slip:  pic('.#... #.###'),
  kick:  pic('.#.#. #.#.#'),
};

/** A whole tugger, 16 rows of 5-bit numbers: head over numeral over legs. */
function figure(digit, head, legs, facingLeft) {
  const m = (r) => (facingLeft ? mirror(r) : r);
  return [...HEAD[head].map(m), ...DIGIT[digit], ...LEGS[legs].map(m)].map(bits);
}

/**
 * The 16x2 grid: every cell starts as a ROM code, and anything drawn into it
 * turns it into a private copy of that glyph with the ink on top. `draw`
 * hands out CGRAM by priority, so the numerals win over the ribbon, and a cell
 * that misses out shows its ROM code instead.
 */
class Field {
  constructor(lcd) {
    this.lcd = lcd;
    this.code = [Array(16).fill(0x20), Array(16).fill(0x20)];
    this.ink = new Map();
  }
  rom(c, r, code) { if (c >= 0 && c < 16) this.code[r][c] = code; }
  dot(c, r, i, y, pri) {                       // cell, dot column, dot row
    if (c < 0 || c > 15 || i < 0 || i > 4) return;
    const k = r * 16 + c;
    const cell = this.ink.get(k) ?? { rows: Array(8).fill(0), pri: 0 };
    cell.rows[y] |= 0x10 >> i;
    cell.pri = Math.max(cell.pri, pri);
    this.ink.set(k, cell);
  }
  /** A 16-row figure in column c, moved down dy rows; `mud` hides what is under the pit's surface. */
  figure(c, dy, rows, pri, mud = false) {
    rows.forEach((b, y) => {
      const Y = y + dy;
      if (Y < 0 || Y > 15 || (mud && Y >= MUD_TOP)) return;
      for (let i = 0; i < 5; i++) if (b & (0x10 >> i)) this.dot(c, Y >> 3, i, Y & 7, pri);
    });
  }
  draw() {
    const out = this.code.map((r) => [...r]);
    const cells = [...this.ink.entries()].sort((a, b) => b[1].pri - a[1].pri || a[0] - b[0]);
    const tiles = [], index = new Map();
    for (const [k, cell] of cells) {
      const r = k >> 4, c = k & 15;
      const tile = this.lcd.glyph(this.code[r][c]).map((b, y) => (b | cell.rows[y]) & 0x1f);
      const key = tile.join(',');
      if (!index.has(key) && tiles.length < 8) { index.set(key, tiles.length); tiles.push(tile); }
      if (index.has(key)) out[r][c] = index.get(key);
    }
    tiles.forEach((t, slot) => this.lcd.defineChar(slot, t));
    out.forEach((codes, r) => { this.lcd.setCursor(0, r); codes.forEach((x) => this.lcd.data(x)); });
  }
}

const step = (t, dur) => Math.floor(t / dur);
const lerp = (a, b, p) => a + (b - a) * clamp(p, 0, 1);
const inPit = (c) => c >= PIT_L && c <= PIT_R;

/**
 * A tugger flung off his feet, t seconds after the yank: an arc a cell per
 * 150 ms from `from` to `land`, turning over at the top, and head first into
 * the pit, where he sinks until only his kicking legs show, then not those.
 * `flyTime` is when he hits the mud.
 */
const HOP = 0.15, ARC = 7;
const flyTime = (from, land) => Math.abs(from - land) * HOP;
function flight(t, from, land) {
  const n = Math.abs(from - land), k = step(t, HOP), dir = Math.sign(land - from);
  if (k < n) {
    const p = k / n;
    return { col: from + dir * k, dy: -Math.round(4 * ARC * p * (1 - p)) - (k === 0 ? 2 : 0),
      head: 'flail', legs: p < 0.5 ? 'tuck' : 'kick', flip: p >= 0.5 };
  }
  const dy = 1 + 3 * (k - n);
  if (dy >= 14) return null;
  return { col: land, dy, head: 'flail', legs: k % 2 ? 'kick' : 'tuck', flip: true };
}

/** ROM spray either side of a landing, for the first half second. */
function splash(f, col, t) {
  if (t < 0 || t >= 0.5) return;
  const code = t < 0.25 ? 0x2a : 0x27;                         // '*', then "'"
  for (const c of [col - 1, col + 1]) f.rom(c, 1, code);
}

/** Bubbles rising where something went under. */
function bubbles(f, col, t) {
  for (const t0 of [0.9, 1.8]) {
    const u = t - t0;
    if (u >= 0 && u < 0.6) f.rom(col, 1, BUBBLE[step(u, 0.3)]);
  }
}

/** Head and legs for one team during the bout: the two teams heave alternately. */
function boutPose(u, winning) {
  if (u >= GAIN_AT && u < GAIN_AT + 0.6) return winning ? ['big', 'dig'] : ['strain', 'skid'];
  if (u >= 58.9) return winning ? ['crouch', 'dig'] : ['strain', 'skid'];
  const ph = u % 1;
  const on = winning ? ph < 0.45 : ph >= 0.5 && ph < 0.95;
  return on ? ['heave', 'brace'] : ['pull', 'brace'];
}

/** Where the ribbon is during the bout: dragged towards the side that wins at :00. */
function boutRibbon(u, start, winnerH) {
  const target = winnerH ? LINE_H : LINE_M, dir = Math.sign(target - XC);
  const p = clamp((u - start) / (60 - start), 0, 1);
  const off = u >= GAIN_AT ? 6 * dir : 0;                      // the ground won at :30
  let x = XC + (target - XC - 6 * dir) * p + off;
  const ph = u % 1;
  if (u >= 58.9) x -= 2 * dir;                                  // they gather, and lose a little
  else if (ph < 0.45) x += 1.5 * dir;
  else if (ph >= 0.5 && ph < 0.95) x -= 1 * dir;
  return x;
}

/** The ribbon: a bow tied on the rope, at glass column x (six per cell). */
function ribbon(f, x) {
  x = Math.round(x);
  const c = Math.floor(x / 6), i = clamp(x % 6, 1, 3);         // the whole bow stays in one cell
  for (const [di, y] of [[-1, 4], [1, 4], [0, 5], [-1, 7], [1, 7]]) f.dot(c, 0, i + di, y, 2);
}

/** Walking on from the edge of the glass, a cell per 0.3 s. Returns the column, or null. */
function walkOn(t, home, fromRight, order) {
  const n = step(t, 0.3) - order;              // the front man comes on first
  if (n < 0) return null;
  const edge = fromRight ? 15 : 0, dir = fromRight ? -1 : 1;
  const col = edge + dir * n;
  return fromRight ? Math.max(col, home) : Math.min(col, home);
}

// ------------------------------------------------------------------ scenes
// Each returns the actors on the field and the ribbon's column. An actor is
// { col, dy, digit, head, legs, left (faces left), flip, pri }.

function bout(F, u, start, f) {
  const winnerH = F.m !== 59;
  const [hh, hl] = boutPose(u, winnerH), [mh, ml] = boutPose(u, !winnerH);
  const off = u >= GAIN_AT ? (winnerH ? -1 : 1) : 0;           // at :30 the losers give a step
  const actors = [
    { col: HOME_H[0] + off, digit: F.hh[0], head: hh, legs: hl },
    { col: HOME_H[1] + off, digit: F.hh[1], head: hh, legs: hl },
    { col: HOME_M[0] + off, digit: F.mm[0], head: mh, legs: ml, left: true },
    { col: HOME_M[1] + off, digit: F.mm[1], head: mh, legs: ml, left: true },
  ];
  // One fidget a minute: somebody wipes his brow, or a foot slips.
  const n = F.h * 60 + F.m, who = actors[Math.floor(noise(n, 3) * 4)];
  const at = 12 + Math.floor(noise(n, 4) * 14) + (noise(n, 6) < 0.5 ? 0 : 20);
  const kind = noise(n, 5) < 0.5 ? 'wave' : 'slip';
  if (u >= at && u < at + (kind === 'wave' ? 1.8 : 0.6)) {
    if (kind === 'wave') who.head = step(u - at, 0.3) % 2 ? 'wave2' : 'wave'; else who.legs = 'slip';
  }
  // The losers' heels plough up the dirt in front of them when they give ground.
  const skid = u >= GAIN_AT && u < GAIN_AT + 0.6 ? u - GAIN_AT : u >= 58.9 ? u - 58.9 : -1;
  if (skid >= 0) {
    const front = winnerH ? HOME_M[0] + off - 1 : HOME_H[1] + off + 1;
    if (!inPit(front)) f.rom(front, 1, step(skid, 0.3) % 2 ? 0x27 : 0x2e);
  }
  return { actors, x: boutRibbon(u, start, winnerH) };
}

/**
 * Every minute but the hour: the hours give one big heave, the minutes are
 * yanked a cell forward, and each minute digit that is changing is flung off
 * his feet and into the mud. His replacement walks on from the right.
 */
function minuteTurn(F, P, u, f) {
  const actors = [];
  // The hours heave, then take back the step they gained at :30.
  let hp = u < 0.45 ? ['big', 'dig'] : boutPose(u, true);
  if (u >= 2.4 && u < 2.7) hp = ['walk', 'walkB'];
  HOME_H.forEach((col, k) => actors.push({ col: col - (u < 2.4 ? 1 : 0), digit: F.hh[k], head: hp[0], legs: hp[1] }));

  const out = [P.mm[0] !== F.mm[0], true];                    // [tens, ones] leaving
  const subs = out[0] ? [0, 1] : [1];
  const LAUNCH = [0.75, 0.45], LAND = [6, 7];
  for (let k = 0; k < 2; k++) {
    const yanked = HOME_M[k] - 2;                              // a step at :30, a step now
    if (!out[k]) {                                             // the one who stays
      let a = { col: yanked, head: 'yank', legs: 'skid' };
      if (u >= 1.2) a = { col: yanked, head: 'walk', legs: 'walkA' };
      if (u >= 2.4) a = { col: yanked + 1, head: 'walk', legs: 'walkB' };
      if (u >= 2.7) a = { col: HOME_M[k], head: 'walk', legs: 'walkA' };
      if (u >= 3.0) a = { col: HOME_M[k], head: 'pull', legs: 'brace' };
      actors.push({ ...a, digit: F.mm[k], left: true });
      continue;
    }
    const t = u - LAUNCH[k];
    if (t < 0) actors.push({ col: yanked, digit: P.mm[k], head: 'yank', legs: 'skid', left: true });
    else {
      const fl = flight(t, yanked, LAND[k]);
      if (fl) actors.push({ ...fl, digit: P.mm[k], left: true, pri: 6 });
      splash(f, LAND[k], t - flyTime(yanked, LAND[k]));
      bubbles(f, LAND[k], t - flyTime(yanked, LAND[k]));
    }
  }
  subs.forEach((k, order) => {
    const col = u >= 2.4 ? walkOn(u - 2.4, HOME_M[k], true, order) : null;
    if (col == null) return;
    const home = col === HOME_M[k] && u >= 2.4 + 0.3 * (subs.length + 0.0);
    const walking = step(u - 2.4, 0.3) % 2 ? 'walkB' : 'walkA';
    actors.push({ col, digit: F.mm[k], head: home ? 'pull' : 'walk', legs: home ? 'brace' : walking, left: true });
  });

  const x = lerp(LINE_H - 4, XC, (u - 2.6) / 1.0);
  return { actors, x };
}

/**
 * The hour: the 59 finally wins. The hours team is dragged a cell at a time
 * into the pit and goes under; the winners land on their backsides, get up,
 * cheer, and jump in after them. Then both new teams walk on.
 */
function hourTurn(F, P, u, f) {
  const actors = [];
  // The old hour, dragged right into the mud.
  const k = u < 0.5 ? 0 : Math.min(3, step(u - 0.5, 0.35) + 1);
  HOME_H.forEach((h0, j) => {
    const home = h0 + 1, col = home + k;                        // they gave a step at :30
    if (!inPit(col)) { actors.push({ col, digit: P.hh[j], head: 'yank', legs: 'skid' }); return; }
    const kIn = PIT_L - home;                                   // drag step that put him in
    const t = u - (0.5 + 0.35 * (kIn - 1));
    const dy = 1 + 2 * step(t, 0.15);
    splash(f, col, t);
    bubbles(f, col, t);
    if (dy < 16) actors.push({ col, dy, digit: P.hh[j], head: 'flail', legs: 'kick', pri: 6, mud: true });
  });
  // The old minutes, :59, who won.
  const LAUNCH = [3.4, 3.65], LAND = [8, 9];
  HOME_M.forEach((m0, j) => {
    const col = m0 + 1, t = u - LAUNCH[j];
    let a;
    if (u < 0.5) a = { col, head: 'big', legs: 'dig' };
    else if (u < 1.6) a = { col, dy: 2, head: 'heave', legs: 'kick' };          // sat down hard
    else if (t < 0) {
      const up = step(u - 1.6 + j * 0.15, 0.3) % 2 === 0;
      a = { col, dy: up ? -2 : 0, head: 'cheer', legs: up ? 'tuck' : 'walkA' };
    } else {
      const fl = flight(t, col, LAND[j]);
      splash(f, LAND[j], t - flyTime(col, LAND[j]));
      bubbles(f, LAND[j], t - flyTime(col, LAND[j]));
      if (!fl) return;
      a = { ...fl, pri: 6 };
    }
    actors.push({ ...a, digit: P.mm[j], left: true });
  });
  // The new hour from the left and the new :00 from the right.
  if (u >= 5.4) {
    const t = u - 5.4, walking = step(t, 0.3) % 2 ? 'walkB' : 'walkA', settled = t >= 0.9;
    [1, 0].forEach((j, order) => {
      const col = walkOn(t, HOME_H[j], false, order);
      if (col != null) actors.push({ col, digit: F.hh[j], head: settled ? 'pull' : 'walk', legs: settled ? 'brace' : walking });
    });
    [0, 1].forEach((j, order) => {
      const col = walkOn(t, HOME_M[j], true, order);
      if (col != null) actors.push({ col, digit: F.mm[j], head: settled ? 'pull' : 'walk', legs: settled ? 'brace' : walking, left: true });
    });
  }
  const x = lerp(LINE_M + 4, XC, (u - 5.6) / 1.0);
  return { actors, x };
}

function actorRows(a) {
  let rows = figure(a.digit, a.head, a.legs, a.left);
  if (a.flip) rows = rows.reverse().map((b) => parseInt([...b.toString(2).padStart(5, '0')].reverse().join(''), 2));
  return rows;
}

export default {
  name: 'Tug of War',
  blurb: 'The hours and the minutes, digits with arms and legs, in a tug of war over a mud pit; each minute the loser is flung into the mud.',
  bus: 'i2c100',
  panel: 'green',
  fps: FPS,

  frame(lcd, api, { fields: F, date, kit }) {
    const f = new Field(lcd);
    const u = F.s + F.ms / 1000;
    const P = kit.clockFields(new Date(date.getTime() - 60000));

    for (let c = 0; c < 16; c++) f.rom(c, 0, ROPE);
    for (let c = PIT_L; c <= PIT_R; c++) f.rom(c, 1, MUD);
    // The mud bubbles now and then on its own.
    const T = F.h * 3600 + F.m * 60 + u, slot = Math.floor(T / 2.7);
    if (noise(slot, 7) < 0.5) {
      const ph = T - slot * 2.7;
      if (ph < 0.6) f.rom(PIT_L + Math.floor(noise(slot, 8) * 6), 1, BUBBLE[step(ph, 0.3)]);
    }

    let scene;
    if (F.m === 0 && u < HOUR_LEN) scene = hourTurn(F, P, u, f);
    else if (F.m !== 0 && u < MIN_LEN) scene = minuteTurn(F, P, u, f);
    else scene = bout(F, u, F.m === 0 ? HOUR_LEN : MIN_LEN, f);

    for (const a of scene.actors) f.figure(a.col, a.dy ?? 0, actorRows(a), a.pri ?? 10, a.mud ?? inPit(a.col));
    ribbon(f, scene.x);
    f.draw();
  },
};

