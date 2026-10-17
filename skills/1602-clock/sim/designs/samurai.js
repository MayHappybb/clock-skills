// Samurai — iai: the time is his opponent, and it is already cut.
//
// A swordsman faces the minutes across a strip of ground. A cherry petal
// falls between them through the minute, swaying: it is the seconds hand,
// and the moment it touches the ground at :00 is his cue, as in every duel
// film. He draws and crosses the whole glass in one frame, 100 ms: the glass
// cannot switch that fast, so all that shows is a ghost of the slash and him
// standing on the far side with his back to the time, blade out. Nothing
// happens. Then the digit that changed slides apart along the row seam (the
// gap between the two rows is the cut), a dot at a time, and crumbles into
// petals that blow away. As he slides the blade home the new digit is
// inked in, top to bottom; the click of the guard lands as it is complete.
// He turns round and waits for the next petal, from the other side.
//
// The minutes are 5x16 brush numerals built from a top half and a bottom
// half, so 5, 9 and 3 share a bottom, as do 0, 6 and 8. The hour is a kanji
// numeral (一 .. 十二, a 12-hour clock) on a banner, one tile; at night the
// moon is up. On the hour a challenger with a topknot walks in at :30 and
// waits across the time. They cross; his topknot drops off, and he runs. Then
// the minutes and the banner fall apart one after another.
//
// Budget: minutes 2-4 tiles, banner 1, swordsman 2 (3 for the blade at the
// end of the dash), petal 1. The challenger's 2 come from the petal, which
// turns into a ROM petal while he is on stage, and from the blade, which he
// keeps low. Petals in the wind, the ground and the slash ghost are ROM
// ('_', ' ` 、 ,). Every frame is a function of the wall clock; every step of
// the turn holds at least 0.15 s, the dash frame excepted on purpose.

import { clockFields } from '../js/kit.js';

const pic = (s) => s.trim().split('\n').map((l) => l.trim());

// ------------------------------------------------------------- minute digits
// 5x16 brush numerals, built from a top half and a bottom half that meet at
// the row seam. Characters 1-3 are the stroke each dot belongs to (the order
// the digit is inked in); '.' is empty.
const TOP = {
  0: '.###. ##.## ##.## ##.## ##.## ##.## ##.## ##.##'.split(' '),
  1: '..##. .###. ##.#. ..##. ..##. ..##. ..##. ..##.'.split(' '),
  2: '.###. ##.## ...## ...## ..##. ..##. .##.. .##..'.split(' '),
  3: '####. ...## ...## ..##. .###. ...## ...## ...##'.split(' '),
  4: '...## ..### .#.## .#.## #..## ##### ##### ...##'.split(' '),
  5: '##### ##... ##... ####. ...## ...## ...## ...##'.split(' '),
  6: '..##. .##.. ##... ##... ####. ##.## ##.## ##.##'.split(' '),
  7: '##### ##### ...## ..##. ..##. .##.. .##.. .##..'.split(' '),
  8: '.###. ##.## ##.## .###. ##.## ##.## ##.## ##.##'.split(' '),
  9: '.###. ##.## ##.## ##.## .#### ...## ...## ...##'.split(' '),
};
const BOT = {
  U: '##.## ##.## ##.## ##.## ##.## .###.'.split(' '),
  J: '...## ...## ...## ...## ##.## .###.'.split(' '),
  B1: '..##. ..##. ..##. ..##. ..##. .####'.split(' '),
  B2: '.##.. ##... ##... ##... ##### #####'.split(' '),
  B4: '...## ...## ...## ...## ...## ...##'.split(' '),
  B7: '.##.. .##.. .##.. .##.. .##.. .#...'.split(' '),
};
const DIGIT_BOT = ['U', 'B1', 'B2', 'J', 'B4', 'J', 'U', 'B7', 'U', 'J'];
const DIGIT = (d) => [...TOP[d], ...BOT[DIGIT_BOT[d]]];

// ------------------------------------------------------------------- scene
class Scene {
  constructor() {
    this.code = Array(32).fill(0x20);
    this.bits = Array(32).fill(null);
    this.pri = Array(32).fill(0);
    this.fb = Array(32).fill(0x20);
  }
  rom(col, row, code) {
    if (col < 0 || col > 15 || row < 0 || row > 1) return;
    const i = row * 16 + col;
    this.code[i] = code; this.bits[i] = null; this.fb[i] = code;
  }
  dot(x, y, pri, on = true) {
    const col = Math.floor(x / 6), dx = x - col * 6;
    if (dx > 4 || col < 0 || col > 15 || y < 0 || y > 15) return;
    const i = (y >> 3) * 16 + col;
    if (!this.bits[i]) { this.bits[i] = Array(8).fill(0); this.fb[i] = this.code[i]; }
    const m = 0x10 >> dx;
    if (on) this.bits[i][y & 7] |= m; else this.bits[i][y & 7] &= ~m;
    this.pri[i] = Math.max(this.pri[i], pri);
  }
  /** rows: strings; any char but '.' and ' ' is a dot. keep(ch) filters. */
  sprite(rows, x, y, pri, flip = false, keep = null) {
    const w = Math.max(...rows.map((r) => r.length));
    rows.forEach((line, r) => [...line].forEach((ch, i) => {
      if (ch === '.' || ch === ' ') return;
      if (keep && !keep(ch, i, r)) return;
      this.dot(x + (flip ? w - 1 - i : i), y + r, pri);
    }));
  }
  draw(lcd) {
    const groups = new Map();
    this.bits.forEach((b, i) => {
      if (!b) return;
      if (b.every((v) => v === 0)) { this.bits[i] = null; this.code[i] = 0x20; return; }
      if (b.every((v) => v === 0x1f)) { this.bits[i] = null; this.code[i] = 0xff; return; }
      const k = b.join(',');
      const g = groups.get(k) ?? { b, pri: 0, cells: [] };
      g.pri = Math.max(g.pri, this.pri[i]); g.cells.push(i); groups.set(k, g);
    });
    const order = [...groups.values()].sort((a, b) => b.pri - a.pri);
    this.overflow = Math.max(0, order.length - 8);
    this.slots = order.length;
    const out = this.code.slice();
    order.forEach((g, slot) => {
      if (slot < 8) { lcd.defineChar(slot, g.b); g.cells.forEach((i) => { out[i] = slot; }); }
      else g.cells.forEach((i) => { out[i] = this.fb[i]; });
    });
    for (let row = 0; row < 2; row++) {
      lcd.setCursor(0, row);
      for (let c = 0; c < 16; c++) lcd.data(out[row * 16 + c]);
    }
  }
}


// ----------------------------------------------------------------- swordsman
// 5x16, facing right; wide poses are 11 columns: his cell, the gap, the next.
const HERO = {
  stand: '..##. .###. .##.# ..##. ##### .###. ..### ##.## #.##. .###. .###. ##.## #...# #...#'.split(' ').map((l) => l.slice(0, 5)),
  inhale: '..##. .###. .##.# ##### .###. .###. ..### ##.## #.##. .###. .###. ##.## #...# #...#'.split(' ').map((l) => l.slice(0, 5)),
  ready: '..... ..##. .###. .##.# ##### .#### ..### ##.## #.##. .###. .###. ##.## #...# #...#'.split(' ').map((l) => l.slice(0, 5)),
  crouch: '..... ..... ..##. .###. .##.# ##### .#### ##.## #.##. .###. ##.## #...# #...# #...#'.split(' ').map((l) => l.slice(0, 5)),
  zanshin: '........... ........... ........... ..##....... .###....... .##.#...... ##########. .###.....## #.##....... .###....... ##.##...... #...#...... #...#...... #...#......'.split(' ').map((l) => l.slice(0, 11)),
  low: '..... ..##. .###. .##.# ..##. ####. .###. ##.#. #.##. .###.# .###.# ##.### #...# #...#'.split(' ').map((l) => l.slice(0, 5)),
  noto: '..... ..##. .###. .##.# ..##. ##### .#### ##### #.##. .###. .###. ##.## #...# #...#'.split(' ').map((l) => l.slice(0, 5)),
  front: '..#.. .###. .#.#. ..#.. ##### #.#.# ..#.. .###. #.#.# .###. .###. ##.## #...# #...#'.split(' ').map((l) => l.slice(0, 5)),
  run1: '..##. .###. .##.# ..##. .###. ##### .###. ##.#. .###. .####. ##..# #...# #.... .....'.split(' ').map((l) => l.slice(0, 5)),
  run2: '..##. .###. .##.# ..##. .###. ##### .###. ##.#. .###. ####. #..## ....# ....# .....'.split(' ').map((l) => l.slice(0, 5)),
};
// The challenger: same body, bare head with a topknot instead of the hat.
const KNOT = ['..##.', '.###.', '.##.#', '..##.'];
const BALD = ['#.#.#', '.###.', '.#.#.', '..#..'];
const withHead = (a, head) => {
  const top = a.findIndex((l) => l.includes('#'));
  return a.map((l, r) => (r >= top && r < top + 4 ? head[r - top] + l.slice(5) : l));
};

const POSE = HERO;

// ---------------------------------------------- the hour, on a hanging banner
// Kanji numerals 1-12 under a crossbar; 11 and 12 are written top to bottom.
const KANJI = {
  1: ['.....', '.....', '#####', '.....', '.....', '.....'],
  2: ['.....', '.###.', '.....', '.....', '#####', '.....'],
  3: ['####.', '.....', '.##..', '.....', '#####', '.....'],
  4: ['#####', '#.#.#', '#.#.#', '##.##', '#...#', '#####'],
  5: ['#####', '.#...', '####.', '.#.#.', '.#.#.', '#####'],
  6: ['..#..', '#####', '.....', '.#.#.', '.#..#', '#...#'],
  7: ['.#...', '.#..#', '#####', '.#...', '.#..#', '..##.'],
  8: ['.#.#.', '.#.#.', '.#.#.', '.#..#', '#...#', '#...#'],
  9: ['.#...', '####.', '.#.#.', '.#.#.', '#..#.', '#..##'],
  10: ['..#..', '..#..', '#####', '..#..', '..#..', '..#..'],
  11: ['..#..', '#####', '..#..', '.....', '#####', '.....'],
  12: ['..#..', '#####', '..#..', '.###.', '.....', '#####'],
};
// A crossbar with the cloth hanging under it, so 十 is a banner and not a plus.
const hourArt = (h) => ['#####', '#...#', ...KANJI[h]];


// The challenger wears a straw hat; otherwise he moves like the hero.

// ------------------------------------------------------------------ layout
const HOME = { L: 2, R: 13 };                 // where he stands, by side
const SIGN = 6, TENS = 8, ONES = 9;           // hour banner, minute digits
const FIELD = { L: [3, 5], R: [10, 12] };     // where the seconds petal falls
const PETALS = [0x27, 0x60, 0xa4, 0x2c];       // ROM petals: ' ` 、 ,
const h12 = (h) => (h % 12) || 12;
const hash = (a, b = 0) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); };

// One minute turn as a schedule, in seconds after :00. Each cut is 0.6 s of
// sliding apart and 0.6 s of crumbling; they run one after another.
function schedule(prev, cur, hourTurn) {
  const cuts = [];
  let t = hourTurn ? 2.6 : 1.2;
  // each piece starts sliding a beat after the one before: "that one too"
  const add = (what) => { cuts.push({ what, t0: t }); t += 0.9; };
  if (prev.mm[1] !== cur.mm[1]) add('ones');
  if (prev.mm[0] !== cur.mm[0]) add('tens');
  if (hourTurn) add('hour');
  t += CUT_LEN - 0.9;
  return { cuts, ink: t, click: t + 0.9, turn: t + 2.0, done: t + 2.4 };
}

/**
 * A glyph cut through at dot row `split`: the part above slides off along the
 * cut, one dot per step, tips over the edge and drops to the ground beside
 * the stump, and then both crumble into petals. Steps are 0.15 s.
 */
const CUT_STEPS = 10, CUT_LEN = CUT_STEPS * 0.15;
function drawCut(sc, g, x, split, dir, k, seed) {
  const thr = k < 6 ? 1 : [0.7, 0.45, 0.25, 0.08][k - 6];
  const keep = (ch, i, r) => hash(i + seed, r) < thr;
  const top = g.slice(0, split);
  // it slides off the stump along the cut, a dot a step, then sags as it goes
  sc.sprite(top, x + Math.min(k + 1, 6) * dir, 0, 100, false, keep);
  sc.sprite(g.slice(split), x, split, 100, false, (ch, i, r) => keep(ch, i, r + split));
}

export default {
  name: 'Samurai',
  blurb: 'A swordsman waits for a falling petal to land, crosses the glass in one frame, and the minute he passed slides apart along the row seam.',
  bus: 'i2c100',
  panel: 'green',
  fps: 10,
  frame(lcd, api, { date, fields }) {
    const sc = new Scene();
    const u = fields.s + fields.ms / 1000;
    const prev = clockFields(new Date(date.getTime() - 60000));
    const H = h12(fields.h);
    const hourTurn = h12(prev.h) !== H;
    const side = fields.m % 2 ? 'R' : 'L';
    const S = schedule(prev, fields, hourTurn);
    const inTurn = u < S.done;
    const night = fields.h < 6 || fields.h >= 18;
    const cutOf = (w) => (inTurn ? S.cuts.find((c) => c.what === w) : null);
    const step = Math.min(3, 1 + Math.floor((u - S.ink) / 0.3));

    // ---- the time: old until it is cut, then nothing, then inked anew
    const piece = (which, g, gOld, x, split, dir) => {
      const cut = cutOf(which);
      if (!cut) { sc.sprite(g, x, 0, 100); return; }
      if (u < cut.t0) {
        sc.sprite(gOld, x, 0, 100);
        if (u < 0.2) for (let i = 0; i < 5; i++) sc.dot(x + i, split - 1, 100);
        return;
      }
      const k = Math.floor((u - cut.t0) / 0.15);
      if (k < CUT_STEPS) { drawCut(sc, gOld, x, split, dir, k, x); return; }
      if (u >= S.ink) sc.sprite(g, x, 0, 100, false, (ch, i, r) => r < [g.length * 0.4, g.length * 0.7, 99][step - 1]);
    };
    piece('tens', DIGIT(+fields.mm[0]), DIGIT(+prev.mm[0]), TENS * 6, 8, -1);
    piece('ones', DIGIT(+fields.mm[1]), DIGIT(+prev.mm[1]), ONES * 6, 8, 1);
    piece('hour', hourArt(H), hourArt(h12(prev.h)), SIGN * 6, 4, -1);

    // ---- the swordsman
    const hero = { col: HOME[side], flip: side === 'R', pose: 'stand' };
    if (inTurn) {
      hero.flip = side === 'L';                  // after the dash, back to the time
      if (u < 1.2) hero.pose = hourTurn ? 'low' : 'zanshin';
      else if (u < S.ink) hero.pose = 'low';
      else if (u < S.click) hero.pose = 'noto';
      else if (u < S.turn) hero.pose = 'stand';
      else { hero.pose = 'front'; }
    } else if (u >= 59) hero.pose = 'crouch';
    else if (u >= 56) hero.pose = 'ready';
    else hero.pose = (u % 3.2) < 1.8 ? 'stand' : 'inhale';
    // now and then his eye flicks up to the petal
    const glance = !inTurn && u < 56 && (u % 7) >= 3 && (u % 7) < 3.6;
    const actors = [hero];

    // ---- on the hour, a challenger in a straw hat walks in and waits
    if (fields.m === 59 && u >= 30) {
      const c = { col: HOME.L, flip: false, pose: 'ready', pri: 70, head: KNOT };
      if (u < 33) { c.col = HOME.L - 3 + Math.floor((u - 30) / 0.75); c.pose = (u / 0.375 | 0) % 2 ? 'run1' : 'run2'; }
      else if (u >= 59) c.pose = 'crouch';
      else if (u < 34 || (u > 45 && u < 46.5)) c.pose = 'stand';
      actors.push(c);
      if (u >= 33) hero.pose = u >= 59 ? 'crouch' : (u % 3.2) < 1.8 ? 'ready' : 'ready';
    } else if (hourTurn && u < 2.6) {
      // ...and loses his hat: it splits along the cut and slides apart
      const c = { col: HOME.R, flip: false, pose: 'low', pri: 70, head: KNOT };
      if (u >= 1.2) { c.pose = 'front'; c.knot = (u - 1.2) / 0.6; }
      if (u >= 1.8 && u < 2.0) c.pose = 'front';
      if (u >= 1.8) { c.head = BALD; c.knot = undefined; }
      if (u >= 2.0) { c.col = HOME.R + Math.ceil((u - 2.0) / 0.2); c.pose = (u * 5 | 0) % 2 ? 'run1' : 'run2'; c.head = BALD; }
      actors.push(c);
    }
    for (const a of actors) {
      let spr = POSE[a.pose];
      if (a === hero && glance) spr = spr.map((l, r) => (r === 1 ? '.##.#' : r === 2 ? '.####' : l));
      if (a.head) spr = withHead(spr, a.head);
      const x = a.col * 6, w = spr[0].length;
      const x0 = a.flip ? x - (w - 5) : x;
      if (a.knot !== undefined) {
        // the topknot, cut clean off, drops to his feet
        spr = spr.map((l, r) => (r === 0 ? '.....' : l));
        // it hangs a beat where it was, then drops to his feet
        const f = Math.max(0, (a.knot - 0.4) / 0.6);
        const y = Math.round(Math.min(1, f) ** 2 * 11);
        sc.dot(x0 + 4, y, a.pri); sc.dot(x0 + 3, y, a.pri); sc.dot(x0 + 4, y + 1, a.pri);
        sc.sprite(spr, x0, 0, a.pri, a.flip);
      } else sc.sprite(spr, x0, 0, a.pri ?? 80, a.flip);
    }
    if (!inTurn && u >= 58 && u < 59) sc.dot(hero.flip ? hero.col * 6 : hero.col * 6 + 4, 5, 80);

    // ---- the dash: one frame, too fast for the glass to show more than a ghost
    if (inTurn && u < 0.2) {
      for (let c = HOME.L + 1; c < HOME.R; c++) if (sc.code[c] === 0x20 && !sc.bits[c]) sc.rom(c, 0, 0x5f);
      if (!sc.bits[HOME[side === 'L' ? 'R' : 'L']]) sc.rom(HOME[side === 'L' ? 'R' : 'L'], 0, 0x5f);
    }

    // ---- what is cut crumbles into petals and blows away
    for (const cut of inTurn ? S.cuts : []) {
      const tau = u - cut.t0 - 1.05;
      if (tau < 0 || tau > 2) continue;
      const col0 = { tens: TENS, ones: ONES, hour: SIGN }[cut.what];
      const dir = cut.what === 'ones' ? 1 : -1;
      for (let j = 0; j < 3; j++) {
        const c = col0 + dir * (1 + Math.floor(tau * 3 + j * 0.9));
        if (c >= 0 && c < 16 && sc.code[c] === 0x20 && !sc.bits[c]) sc.rom(c, 0, PETALS[(Math.floor(tau * 5) + j) % 4]);
      }
    }

    // ---- a petal on the wind every twelve seconds, and the moon at night
    {
      const c = Math.floor((u % 12) / 0.4);
      if (c < 16 && sc.code[c] === 0x20 && !sc.bits[c]) sc.rom(c, 0, PETALS[Math.floor(u * 4) % 4]);
    }
    if (night && !sc.bits[15]) sc.rom(15, 0, 0xdf);

    // ---- the seconds petal: it lands at :00, and that is his cue
    if (!inTurn || u > 5) {
      const [c0, c1] = FIELD[side];
      const p = Math.min(1, Math.max(0, (u - 5) / 54.5));
      const y = Math.round(p * 13);
      const xc = ((c0 + c1 + 1) / 2) * 6 - 1;
      const x = Math.round(xc + 6 * Math.sin(u * 0.9));
      const tumble = Math.floor(u * 2) % 3;
      const pts = y === 7 || y >= 13 || tumble === 0 ? [[0, 0], [1, 0]] : tumble === 1 ? [[0, 0], [1, 1]] : [[1, 0], [0, 1]];
      if (actors.length > 1) {
        // no slot to spare while the challenger is here: a ROM petal instead
        const c = Math.floor(x / 6);
        if (!sc.bits[(y >> 3) * 16 + c]) sc.rom(c, y >> 3, PETALS[(y & 7) < 3 ? 0 : (y & 7) < 5 ? 1 : 2]);
      } else for (const [dx, dy] of pts) {
        sc.dot(x + dx, y + dy, 10);
        const i = ((y + dy) >> 3) * 16 + Math.floor((x + dx) / 6);
        if (i >= 0 && i < 32 && sc.bits[i]) sc.fb[i] = PETALS[((y + dy) & 7) < 4 ? 0 : 2];
      }
    }

    // ---- the ground: a line on dot row 14 under everything that stands on it
    for (let c = 0; c < 16; c++) {
      const i = 16 + c;
      if (sc.bits[i]) sc.bits[i][6] = 0x1f;
      else if (sc.code[i] === 0x20) sc.code[i] = 0x5f;
    }
    sc.draw(lcd);
    // read by out/samurai-sweep.mjs, the dense per-frame check
    this.stats = { tiles: Math.min(8, sc.slots), overflow: sc.overflow };
  },
};
