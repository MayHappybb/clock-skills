// Snail — a snail-powered marble run. The bottom row is a garden path, the
// top row a shelf, and an hour is one snail's journey round the loop.
//
// MINUTES are the slime trail. A snail sets off from a flowerpot at the left
// on the hour and crawls the path, one dot of trail a minute: the path is
// twelve cells of five dots, so every cell is five minutes and the seams
// between cells are the five-minute marks. Its shell always sits square in a
// cell. Through each five minutes the tail creeps up behind it a dot at a
// time (the tail getting shorter is the minute ticking), and on every fifth
// minute the snail lurches a whole cell forward, the tail stretching out
// behind it.
//
// HOURS are the snails that have already done it. At the end of the path the
// snail climbs onto the shelf, tucks itself into its shell and rolls home
// along the shelf, tumbling a cell at a time, until it knocks against the
// sleeper before it, and the knock runs down the row. So the shelf holds one
// sleeping snail per hour, from the left: slots 1-12 sit right above the
// path's twelve five-minute cells, as the numbers of a dial sit at the minute
// marks, and every third sleeper lies the other way round so the row reads
// in threes. Then the old trail dries off and a fresh snail noses out of the
// flowerpot. Until the snail lands the trail stays full, so the glass reads
// the old hour plus sixty minutes, never a wrong time. At one o'clock the
// shelf is full: the newcomer rolls into the row and shoves all twelve
// sleepers along the shelf and off the end, back into the pot they came from.
//
// It is never still. The snail's eye stalks look about, blink and lean, a
// glint of light runs down the wet trail, and now and then a sleeper on the
// shelf twitches. Once an hour it finds a leaf on the path and eats it, a
// bite a minute. Once an hour a beetle walks up and bumps its eye stalks; it
// pulls into its shell, the beetle backs off, and it comes out again slowly,
// one stalk first.
//
// The budget. The whole glass is drawn as a dot canvas and cut into cells;
// identical cells share a slot, so every full cell of trail is one tile and
// every sleeper on the shelf another, and empty shelf slots are ROM dots. The
// snail is three cells (tail, shell, head), four while it lurches. Optional
// touches (the glint, a twitching sleeper, the turned-round sleepers) are
// dropped in that order if a frame would need a ninth tile. 8 at most,
// checked every 0.1 s over a whole day with no frame left over budget.
//
// Tried and dropped: a closed 5x5 spiral read as a row of '@' signs on the
// shelf; the open spiral with a tucked foot reads as a sleeping snail. A
// shell that moved a dot a minute was split by a seam four minutes in five,
// so the shell sits square in a cell and the tail does the fine work.

import { TileAllocator, noise } from '../js/kit.js';

const FPS = 10;
const PATH0 = 5;                 // glass dot column where the trail starts (cell 1)
const SLOT_Y = 3;                // a resting shell's top dot row on the shelf
const STEP = 0.2;                // seconds per visible step of any motion

// ------------------------------------------------------------------ the art

// The shell: one 5x5 spiral, used for the walking snail, the sleepers and the
// rolling shell alike, so the snail that rolls home is visibly the one that
// walked.
const SPIRAL = ['.###.', '#...#', '#.#.#', '#.##.', '.#...'];
const rot = (g) => g.map((_, r) => g.map((row) => row[r]).reverse().join(''));   // 90 degrees clockwise
// Rolling to the left turns it anticlockwise.
const ROLL = [SPIRAL];
for (let i = 1; i < 4; i++) ROLL.push(rot(rot(rot(ROLL[i - 1]))));

// Heads, one cell, rows 0-7. The neck rises from the foot on rows 6-7.
const HEAD = {
  up:     ['.#..#', '..#.#', '..##.', '..##.', '..###', '.####', '#####', '####.'],
  reach:  ['...#.', '..#.#', '...##', '..###', '.####', '#####', '#####', '#####'],
  back:   ['#..#.', '.#.#.', '..##.', '..##.', '..###', '.####', '#####', '####.'],
  blinkA: ['....#', '....#', '..##.', '..##.', '..###', '.####', '#####', '####.'],
  blinkB: ['.#...', '..#..', '..##.', '..##.', '..###', '.####', '#####', '####.'],
  munchA: ['.....', '.#..#', '..#.#', '..##.', '..###', '.####', '#####', '####.'],
  munchB: ['.....', '.#..#', '..#.#', '..##.', '..###', '.####', '#####', '###.#'],
  in1:    ['.....', '.....', '.#.#.', '..##.', '..###', '.####', '#####', '####.'],
  in2:    ['.....', '.....', '.....', '.....', '..#..', '.###.', '####.', '###..'],
  in3:    ['.....', '.....', '.....', '.....', '.....', '.....', '##...', '#....'],
  peek:   ['.....', '.....', '.....', '....#', '...#.', '..##.', '####.', '###..'],
  none:   ['.....', '.....', '.....', '.....', '.....', '.....', '.....', '.....'],
};

// The flowerpot the snails live in.
const POT = ['#.#..', '.#...', '#####', '#####', '.###.', '.###.', '.###.', '.###.'];
const POT_GULP = ['.....', '#.#..', '.#...', '#####', '#####', '.###.', '.###.', '.###.'];

// A sleeper's foot, tucked under its shell on the shelf.
const SLEEPER_FOOT = ['####.'];

// A leaf on the path, eaten a bite a minute.
const LEAF = [
  ['.....', '.....', '.....', '...##', '.####', '##.##', '#.##.', '.##..'],
  ['.....', '.....', '.....', '...##', '..###', '..###', '..##.', '..#..'],
  ['.....', '.....', '.....', '.....', '...##', '...##', '...#.', '.....'],
  ['.....', '.....', '.....', '.....', '.....', '....#', '...#.', '.....'],
  ['.....', '.....', '.....', '.....', '.....', '.....', '.....', '.....'],
];

// A beetle, three dots wide, facing left; two leg frames.
const BEETLE = [
  ['.##.', '####', '#.#.'],
  ['.##.', '####', '.#.#'],
];
const flip = (g) => g.map((r) => [...r].reverse().join(''));

// ------------------------------------------------------------------ canvas

/** Frames that needed a ninth tile even with the options dropped (for checks). */
export const stats = { overflow: 0 };

/** 16x2 cells of 5x8 dots; x in dot columns (5 a cell), y 0-15. */
class Canvas {
  constructor() {
    this.bits = Array.from({ length: 32 }, () => Array(8).fill(0));
    this.rom = Array(32).fill(0x20);
    this.prio = Array(32).fill(0);
  }
  dot(x, y, on = true) {
    if (x < 0 || x > 79 || y < 0 || y > 15) return;
    const cell = (y >> 3) * 16 + Math.floor(x / 5), bit = 0x10 >> (x % 5);
    if (on) this.bits[cell][y & 7] |= bit; else this.bits[cell][y & 7] &= ~bit;
  }
  sprite(g, x, y, mask) {
    g.forEach((line, r) => [...line].forEach((ch, i) => {
      if (ch === '#' && !(mask && mask(x + i, y + r))) this.dot(x + i, y + r);
    }));
  }
  /** Cut into cells and write the controller; false if it needs a ninth tile. */
  emit(lcd, dry) {
    const keys = this.bits.map((b) => (b.some((v) => v) ? b.join(',') : null));
    const distinct = new Set(keys.filter(Boolean));
    if (dry) return distinct.size <= 8;
    // Allocate by priority, so if a frame were ever over budget the snail
    // wins and the scenery goes blank.
    const order = [...keys.keys()].sort((a, b) => this.prio[b] - this.prio[a]);
    const alloc = new TileAllocator(lcd, 0);
    const codes = Array(32).fill(0x20);
    for (const i of order) {
      if (!keys[i]) { codes[i] = this.rom[i]; continue; }
      const tile = this.bits[i].map((v) => [...Array(5)].map((_, k) => ((v >> (4 - k)) & 1 ? '#' : '.')).join(''));
      codes[i] = alloc.add(tile) ?? 0x20;
    }
    if (alloc.overflow) stats.overflow++;
    alloc.flush();
    for (let row = 0; row < 2; row++) {
      lcd.setCursor(0, row);
      for (let c = 0; c < 16; c++) lcd.data(codes[row * 16 + c]);
    }
    return true;
  }
}

// ------------------------------------------------------------------ the snail

/**
 * Ink the walking snail. `trail` dots of trail are already down; the tail
 * runs from `tailX` to the shell; the shell's left dot column is `shellX`
 * and the head is the cell after it. `dy` lifts it (negative is up).
 */
function drawSnail(cv, sn) {
  const base = 8 + (sn.dy ?? 0);
  const mask = sn.mask;
  // tail: a wedge on the foot rows, thick near the shell, thin at its tip
  const tail = sn.shellX - sn.tailX;
  for (let x = sn.tailX; x < sn.shellX; x++) {
    if (mask && mask(x)) continue;
    cv.dot(x, base + 7);
    if (x > sn.tailX || tail === 1) cv.dot(x, base + 6);
    if (x >= sn.shellX - 2 && tail >= 3) cv.dot(x, base + 5);
  }
  const m = mask;
  if (!sn.noBody) {
    cv.sprite(SPIRAL, sn.shellX + (sn.heave ? 1 : 0), base + 1 + (sn.heave ? 1 : 0), m);
    cv.sprite(['#####', '#####'], sn.shellX, base + 6, m);
  }
  cv.sprite(HEAD[sn.head ?? 'up'], sn.shellX + 5, base, m);
}

/** The idle head for this moment: it looks about, blinks, leans. */
function idleHead(T) {
  const slot = Math.floor(T / 1.5);
  const n = noise(slot, 7);
  const sub = (T / 1.5) - slot;
  if (n < 0.45) return 'up';
  if (n < 0.6) return sub < 0.5 ? 'blinkA' : 'up';
  if (n < 0.72) return sub < 0.5 ? 'blinkB' : 'up';
  if (n < 0.86) return 'back';
  return 'reach';
}

// ------------------------------------------------------------------ the hour

/** Each hour's events, from noise: which cell has the leaf, when the beetle comes. */
function events(hourKey) {
  const leafK = 2 + Math.floor(noise(hourKey, 3) * 4);          // blocks 2-5
  const beetleK = 7 + Math.floor(noise(hourKey, 5) * 4);        // blocks 7-10
  const beetleJ = 1 + Math.floor(noise(hourKey, 9) * 3);        // minute 1-3 in it
  return { leafK, beetleK, beetleM: beetleK * 5 + beetleJ };
}

/** Normal resting position at minute m. */
function rest(m) {
  const k = Math.floor(m / 5);
  return { trail: m, tailX: PATH0 + m, shellX: PATH0 + 5 + 5 * k };
}

/**
 * The hour show, seconds after the hour. Returns the trail, the snail (or a
 * rolling shell), the shelf contents, and whether the minute 0 rest state has
 * been reached.
 */
function hourShow(sec, newH) {
  const out = { trail: 60, dry: 0, snail: null, rolling: [], shelf: newH === 1 ? 12 : newH - 1, pot: 'still', done: false };
  const t = sec;
  // lurch to the end: the shell from cell 13 to 14
  if (t < 0.3) { out.trail = 59; out.snail = { tailX: 64, shellX: 65, head: 'reach' }; return out; }
  if (t < 1.3) {
    const i = Math.min(5, 1 + Math.floor((t - 0.3) / STEP));
    out.trail = 59; out.snail = { tailX: 64, shellX: 65 + i, head: 'up' }; return out;
  }
  if (t < 1.9) {
    const i = Math.min(5, 1 + Math.floor((t - 1.3) / STEP) * 2);
    out.snail = { tailX: 65 + i, shellX: 70, head: 'up' }; return out;
  }
  if (t < 2.3) { out.snail = { tailX: 70, shellX: 70, head: 'back' }; return out; }
  if (t < 3.9) {
    const dy = -Math.min(8, 1 + Math.floor((t - 2.3) / STEP));
    out.snail = { tailX: 70, shellX: 70, head: 'back', dy }; return out;
  }
  if (t < 4.7) {
    const i = Math.floor((t - 3.9) / STEP);
    out.snail = { tailX: 70, shellX: 70, head: ['in1', 'in2', 'in3', 'none'][i], dy: -8, noBody: i === 3 };
    if (i === 3) out.rolling.push({ cell: 14, y: 1, frame: 0 });
    if (i === 3) out.snail = null;
    return out;
  }
  if (t < 5.1) { out.rolling.push({ cell: 14, y: t < 4.9 ? 2 : SLOT_Y, frame: 0 }); return out; }

  // roll home. Step 0 takes 0.3 s (getting going), the rest STEP each.
  const full = newH === 1;              // twelve sleepers to clear first
  const steps = full ? 14 : 14 - newH;  // to cell newH, or 1 + 13 pushes
  const u = t - 5.1;
  const i = u < 0.3 ? 0 : Math.min(steps, 1 + Math.floor((u - 0.3) / STEP));
  const rollEnd = 5.1 + 0.3 + (steps - 1) * STEP;
  const frame = (steps - i) % 4;
  if (!full) {
    out.rolling.push({ cell: 14 - i, y: SLOT_Y, frame });
  } else {
    // one roll to cell 13, against the full row, then every push moves the
    // whole row a cell left; a shell pushed past cell 0 drops into the pot
    const p = Math.max(0, i - 1);
    out.shelf = 0;
    out.rolling.push({ cell: i === 0 ? 14 : Math.max(1, 13 - p), y: SLOT_Y, frame });
    for (let s = 1; s <= 12; s++) {
      const c = s - p;
      if (c >= 0) out.rolling.push({ cell: c, y: SLOT_Y, frame: p ? frame : 0 });
    }
    if (p > 1 && i < steps) out.pot = 'gulp';
  }
  if (t < rollEnd + STEP) return out;
  // landed: a knock and a rock, then still
  out.rolling = [];
  out.shelf = newH;
  const after = t - (rollEnd + STEP);
  if (after < 0.4) {
    out.rock = { cell: newH, frame: after < 0.2 ? 3 : 1 };
    return out;
  }
  // the knock runs down the row: each sleeper is jostled in turn
  const ripple = (newH - 1) * 0.15;
  if (after < 0.4 + ripple) { out.twitch = newH - 1 - Math.floor((after - 0.4) / 0.15); return out; }
  // the old trail dries off
  const d = after - 0.4 - ripple;
  if (d < 0.9) { out.dry = 1 + Math.floor(d / 0.3); return out; }
  out.trail = 0;
  // a fresh snail noses out of the pot
  const e = d - 0.9;
  if (e < 15 * STEP) {
    const shellX = -5 + Math.min(15, 1 + Math.floor(e / STEP));
    out.snail = { tailX: PATH0, shellX, head: e < 1.2 ? 'blinkA' : 'up', mask: (x) => x < PATH0 };
    return out;
  }
  out.done = true;
  return out;
}

// ------------------------------------------------------------------ design

export default {
  name: 'Snail',
  blurb: 'A snail-powered marble run: its slime trail along the path is the minutes; each hour it rolls home to a shelf of sleeping shells, one per hour.',
  bus: 'i2c100',
  panel: 'green',
  fps: FPS,

  frame(lcd, api, { fields, date }) {
    const sec = fields.s + Math.floor(fields.ms / 100) / 10;
    const m = fields.m;
    const h12 = fields.h % 12 || 12;
    const T = Math.floor(date.getTime() / 100) / 10;           // absolute seconds, 0.1 s steps
    const hourKey = Math.floor(date.getTime() / 3.6e6);
    const ev = events(hourKey);

    // the scene, before options
    let scene = { trail: m, dry: 0, shelf: h12, rolling: [], snail: null, pot: 'still' };
    let show = null;
    if (m === 0) {
      show = hourShow(sec, h12);
      if (!show.done) scene = show;
    }
    if (!scene.snail && (!show || show.done)) {
      const r = rest(m);
      const k = Math.floor(m / 5), j = m % 5;
      let head = idleHead(T);
      if (j === 0 && m > 0 && sec < 1.5) {
        // the five-minute lurch: reach, then the shell slides a cell
        const old = rest(m - 1);
        if (sec < 0.3) Object.assign(r, old, { trail: m - 1 }), head = 'reach';
        else if (sec < 1.3) {
          const i = Math.min(5, 1 + Math.floor((sec - 0.3) / STEP));
          Object.assign(r, { trail: m - 1, tailX: old.tailX, shellX: old.shellX + i }); head = 'up';
        } else head = 'up';
      } else if (j > 0 && sec < 0.7) {
        // a minute's creep: reach forward, then the tail draws up a dot
        if (sec < 0.4) Object.assign(r, rest(m - 1)), head = 'reach';
        else r.heave = true;
      }
      // the leaf: eaten through its block, a bite a minute
      if (k === ev.leafK && j < 4 && sec >= 1.5) {
        head = Math.floor(T / 0.4) % 2 ? 'munchA' : 'munchB';
      }
      // the beetle
      if (m === ev.beetleM) {
        const front = r.shellX + 10;                 // first dot past the head's cell
        const contact = 30, out = 31.2, back = 35;
        if (sec >= contact && sec < back) head = sec < contact + 0.6 ? ['in1', 'in2', 'in3'][Math.floor((sec - contact) / STEP)] : 'none';
        else if (sec >= back && sec < back + 1) head = 'peek';
        else if (sec >= back + 1 && sec < back + 1.6) head = 'in1';
        scene.beetle = { front, contact, out };
      }
      scene.trail = r.trail;
      scene.snail = { tailX: r.tailX, shellX: r.shellX, head, heave: r.heave };
    }

    // try with every option, then drop them one at a time
    const opts = [
      { glint: true, twitch: true, quarter: true },
      { glint: false, twitch: true, quarter: true },
      { glint: false, twitch: false, quarter: true },
      { glint: false, twitch: false, quarter: false },
    ];
    for (let o = 0; o < opts.length; o++) {
      const cv = paint(scene, { ...opts[o], T, sec, m, ev, h12 });
      if (o === opts.length - 1 || cv.emit(lcd, true)) { cv.emit(lcd, false); return; }
    }
  },
};

/** Paint the whole scene on a fresh canvas. */
function paint(scene, o) {
  const cv = new Canvas();
  const { T, sec, m, ev } = o;

  // the pot
  cv.sprite(scene.pot === 'gulp' && Math.floor(T / STEP) % 2 ? POT_GULP : POT, 0, 8);
  cv.prio[16] = 2;

  // the trail, drying off by stages after the hour
  const dryMask = [() => true, (x) => x % 2 === 0, (x) => x % 4 === 1, () => false][scene.dry];
  for (let i = 0; i < scene.trail; i++) if (dryMask(i)) cv.dot(PATH0 + i, 15);
  // a glint runs down the wet trail from the snail to the pot, then rests
  if (o.glint && scene.trail > 6 && !scene.dry) {
    const period = scene.trail * 0.2 + 4;
    const p = Math.floor((T % period) / 0.2);
    const x = scene.trail - 1 - p;
    if (x >= 0 && x < scene.trail - 2) cv.dot(PATH0 + x, 14);
  }

  // the leaf, ahead of the snail until eaten
  {
    const k = Math.floor(m / 5);
    if (k <= ev.leafK && !(m === 0 && scene.trail > 0)) {
      const stage = k < ev.leafK ? 0 : m % 5;
      cv.sprite(LEAF[stage], PATH0 + 5 * (ev.leafK + 3), 8);
    }
  }

  // the shelf: sleepers in slots 1..n, ROM dots in the empty ones
  const twitchSlot = o.twitch && scene.shelf > 0 && noise(Math.floor(T / 5), 11) < 0.7
    && (T % 5) < 0.6 ? 1 + Math.floor(noise(Math.floor(T / 5), 13) * scene.shelf) : 0;
  for (let c = 1; c <= 12; c++) {
    if (c <= scene.shelf) {
      if (scene.rock && scene.rock.cell === c) cv.sprite(ROLL[scene.rock.frame], 5 * c, SLOT_Y);
      else {
        const up = c === twitchSlot || c === scene.twitch ? 1 : 0;
        // every third sleeper lies the other way round, so the shelf reads in
        // threes, like the quarters of a dial
        const turn = o.quarter && c % 3 === 0 ? flip : (g) => g;
        cv.sprite(turn(SPIRAL), 5 * c, SLOT_Y - 1 - up);
        cv.sprite(turn(SLEEPER_FOOT), 5 * c, 7 - up);
      }
    } else cv.rom[c] = 0x2e;
  }
  for (const r of scene.rolling) {
    cv.bits[r.cell] = Array(8).fill(0);
    cv.sprite(ROLL[r.frame], 5 * r.cell, r.y);
    cv.prio[r.cell] = 3;
  }

  // the snail
  if (scene.snail) {
    const sn = scene.snail;
    drawSnail(cv, sn);
    for (let x = sn.tailX; x <= sn.shellX + 9; x++) {
      const c = Math.floor(x / 5);
      if (c >= 0 && c < 16) { cv.prio[16 + c] = 4; if (sn.dy) cv.prio[c] = 4; }
    }
  }

  // the beetle walks up to the head, bumps it, backs off
  if (scene.beetle) {
    const b = scene.beetle;
    const dist = 80 - b.front;
    const start = b.contact - dist * 0.25;
    let x = null, g = BEETLE[Math.floor(T / 0.25) % 2];
    if (sec >= start && sec < b.contact) x = 80 - Math.floor((sec - start) / 0.25);
    else if (sec >= b.contact && sec < b.out) { x = b.front; g = BEETLE[0]; }
    else if (sec >= b.out) { x = b.front + Math.floor((sec - b.out) / 0.15); g = flip(g); }
    if (x !== null && x < 80) cv.sprite(g, x, 13);
    // a startled "!" over it, if the shelf is empty there
    const hc = Math.floor(b.front / 5) - 1;
    if (sec >= b.contact && sec < b.contact + 1.5 && hc > o.h12 && hc <= 15) cv.rom[hc] = 0x21;
  }
  return cv;
}

