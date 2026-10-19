// Beaver — the time is a beaver dam, and the river keeps breaking it.
//
// Four numerals, three cells wide and both rows tall, are built from a kit of
// wooden parts: upright stakes (left and right) and horizontal logs with bark
// knots. The seams between cells are the joints between the logs. Between
// the hours and the minutes is the dam's spillway: a drop runs over the lip
// and splashes into the pool once a second, which is the colon. On the bank
// to the right a beaver gnaws a sapling all minute (chomp, chips flying, the
// notch in the trunk deepening), fidgets, looks back at its dam, slaps its
// tail.
//
// The minute: the sapling creaks, wobbles and falls (a stump is left). The
// beaver turns to the dam. At :00 the river bursts through the digit that
// changes: its logs pop out one after another with a splash, water gushes
// through the hole, and the beaver shoves the new logs in, a log every 0.3 s,
// in an order whose half-built states are never another numeral (left
// stakes, then logs, then right stakes, top first). It turns round, slaps the
// new digit tight with its tail, and a new sapling sprouts from the stump.
// When the tens change too, the beaver hops into the units hole and rebuilds
// the tens first.
//
// The hour: through :59 the spillway roars and water starts topping the dam;
// the beaver panics. At :00 the whole dam bursts, the flood sweeps the beaver
// and the logs off downstream, then it trudges back, zips to the far end and
// rebuilds all four digits in a frenzy, left to right, and shakes itself dry.
//
// 24-hour clock with the leading zero, so 18:56 can never pass for 6:56.
// Tiles: the wooden kit (5 at most: two stakes, top log, top+middle log,
// bottom log), the beaver (2, tail and body), the sapling (1). Water, chips,
// drops and the alarm are ROM. Everything is derived from the clock.

import { TileAllocator, noise } from '../js/kit.js';

const g = (s) => s.trim().split(/\s+/);

// ------------------------------------------------------------------ the kit
const PART = {
  PL: g('.#### ##### ##### ###.# ##### ##### #.### #####'), // left stake, 5 wide
  PR: g('###.. ###.. ###.. #.#.. ###.. ###.. ###.. ###..'), // right stake, 3 wide
  A: g('##### ####. ##### ..... ..... ..... ..... .....'),  // top log
  AG: g('##### ####. ##### ..... ..... ##### ##.## #####'), // top + middle log
  D: g('..... ..... ..... ..... ..... ##### .#### #####'),  // middle or bottom log
};
// seven-segment logic: a top, b upper right, c lower right, d bottom, e lower
// left, f upper left, g middle (sits at rows 5-7 of the top cell, so it is the
// same tile as the bottom log)
const SEG = { 0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' };
// Build order. Every prefix of it, for every digit, is not a digit: nothing
// before the right stakes has b or c, and "digit minus c" is never a digit.
const ORDER = 'efdgabc';
const CELL_OF = { f: 0, a: 1, g: 1, b: 2, e: 3, d: 4, c: 5 };

/** The six cells of a digit, [top L,C,R, bottom L,C,R], from its segments. */
function digitCells(S) {
  const h = (s) => S.includes(s);
  const ct = h('a') && h('g') ? 'AG' : h('a') ? 'A' : h('g') ? 'D' : null;
  return [h('f') ? 'PL' : null, ct, h('b') ? 'PR' : null, h('e') ? 'PL' : null, h('d') ? 'D' : null, h('c') ? 'PR' : null];
}

// ------------------------------------------------------------------ beaver
// Each pose is tail cell + body cell, facing right: 8 rows of "ttttt bbbbb".
const B10 = (s) => { const r = g(s); return [r.map((l) => l.slice(0, 5)), r.map((l) => l.slice(5))]; };
const POSE = {
  stand:  B10(`.......... .......... ....###... ..######.. .#######.# ##.####### #.#.####.. .....#.#..`),
  walk:   B10(`.......... .......... ....###... ..######.. .#######.# ##.####### #.#.####.. ....#...#.`),
  chomp:  B10(`.......... ....###... ..######.. .#######.. .#######.# ##.######. #.#.####.# .....#.#..`),
  alert:  B10(`.......... ........#. ....###### ..######.# .#######.. ##.######. #.#.####.. .....#.#..`),
  tailUp: B10(`.##....... #.#....... .##.###... ...######. ..#######. ..######.# ..######.. .....#.#..`),
  slap:   B10(`.......... .......... .......... ....###... ..######.. ..######.# ..######## ##.##.#.#.`),
  push:   B10(`.......... .......... .......... ....###### ..######.# .########. ##.######. #.#..#.#..`),
  shake:  B10(`..#...#.#. .......... ...#####.# ..######.. .#######.# ##.####### #.#.####.. .....#.#..`),
};
POSE.look = POSE.alert;
POSE.tumble = POSE.stand.map((cell) => [...cell].reverse());
const mirror = (rows) => rows.map((l) => [...l].reverse().join(''));

// ------------------------------------------------------------------ sapling
const TREE = {
  t0: g('..#.. .###. ..#.. .###. ##### .###. .###. #####'),
  t1: g('..#.. .###. ..#.. .###. ##### ..##. .###. #####'),
  t2: g('..#.. .###. ..#.. .###. ##### ..#.. .##.. #####'),
  t3: g('..#.. .###. ..#.. .###. ##### ..#.. ...#. #####'),
  wobL: g('.#... ###.. .#... .###. ####. ..##. ...#. #####'),
  wobR: g('...#. ..### ...#. .###. .#### .##.. ...#. #####'),
  fall: g('..... ..... ..... #.... ###.. #####. .##.# #####'.replace('#####.', '#####')),
  stump: g('..... ..... ..... ..... ..... ..... .###. #####'),
  sprout: g('..... ..... ..... ..... ..#.. .#.#. ..#.. #####'),
  sapling: g('..... ..... ..#.. .###. ..#.. .###. ..#.. #####'),
};

// ------------------------------------------------------------------ ROM
const DROP = [0x27, 0xa5, 0x2e];          // a drop falling: high, middle, low
const WAVE = [0xf3, 0x2d];                // pool surface, shimmering
const SPLASH = 0x2a;                      // '*'
const CHIP = [0x27, 0x60, 0x2e];          // a wood chip in flight
const BANG = 0x21;                        // '!'
const X = [0, 3, 7, 10];                  // left cell of each digit
const COLON = 6;
const HOME_R = 14, HOME_L = 13;           // body column facing the sapling / the dam
const TREE_COL = 15;

const TEAR = 0.16, PLACE = 0.25, BUILD0 = 1.3;
const H_TEAR = 0.15, H_PLACE = 0.15, H_BUILD0 = 2.0, H_DIGIT = 0.95;
const TIMBER = 55.5;

const rnd = (a, b) => noise(a * 7.13 + b * 0.917, 23);

// ------------------------------------------------------------------ the minute's plan

function plan(prev, now, isHour, preHour, m) {
  const P = { digits: [], isHour, preHour, m };
  const changed = isHour ? [0, 1, 2, 3] : [0, 1, 2, 3].filter((i) => prev[i] !== now[i]);
  const tear = isHour ? H_TEAR : TEAR;
  const place = isHour ? H_PLACE : PLACE;
  P.both = !isHour && changed.includes(2);
  let end = 0;
  for (let i = 0; i < 4; i++) {
    const d = { i, change: changed.includes(i) };
    if (d.change) {
      const old = [...ORDER].reverse().filter((s) => SEG[prev[i]].includes(s));
      const nu = [...ORDER].filter((s) => SEG[now[i]].includes(s));
            d.old = old.map((s, k) => ({ s, gone: k * tear }));
      d.tornAt = old.length * tear;
      if (isHour) d.start = H_BUILD0 + i * H_DIGIT;
      else if (P.both) d.start = i === 2 ? BUILD0 : BUILD0 + SEG[now[2]].length * PLACE + 0.3;
      else d.start = BUILD0;
      d.nu = nu.map((s, k) => ({ s, at: d.start + k * place }));
      d.doneAt = d.start + nu.length * place;
      end = Math.max(end, d.doneAt);
    }
    P.digits.push(d);
  }
  P.end = end;
  return P;
}

function segsAt(d, now, u) {
  if (!d.change) return SEG[now[d.i]];
  if (u < d.tornAt) return d.old.filter((p) => p.gone > u).map((p) => p.s).join('');
  return d.nu.filter((p) => p.at <= u).map((p) => p.s).join('');
}

// The beaver: { col (body), row, dir, pose, marks: [[col,row,code]] }
function beaverAt(P, u) {
  const marks = [];
  const at = (col, dir, pose, row = 1) => ({ col, row, dir, pose, marks });
  const E = P.end;

  if (P.isHour) {
    if (u < 0.3) { marks.push([HOME_L, 0, BANG]); return at(HOME_L, -1, 'alert'); }
    if (u < 1.2) {                                   // swept off downstream
      const col = HOME_L + Math.floor((u - 0.3) / 0.25) + 1;
      return at(col, 1, Math.floor(u / 0.2) % 2 ? 'tumble' : 'alert');
    }
    if (u < 1.4) return null;
    if (u < 1.8) {                                    // trudging back
      const col = 16 - Math.floor((u - 1.4) / 0.2);
      return at(col, -1, Math.floor(u / 0.2) % 2 ? 'walk' : 'stand');
    }
    const d0 = P.digits[0];
    if (u < d0.start - 0.1) {                         // the zip to the far end
      const k = Math.min(10, Math.floor((u - 1.8) / 0.02));
      const col = HOME_L - k;
      for (let j = 1; j <= 2; j++) if (col + 1 + j <= 15) marks.push([col + 1 + j, 1, 0x2d]);
      return at(col, -1, 'walk');
    }
    for (let i = 0; i < 4; i++) {
      const d = P.digits[i], next = P.digits[i + 1];
      if (u < d.doneAt || (next && u < next.start - 0.1)) {
        const col = X[i] + 3;
        if (u >= d.doneAt) return at(col, -1, 'walk');
        const placing = d.nu.some((p) => u >= p.at && u < p.at + 0.08);
        return at(col, -1, placing ? 'push' : 'stand');
      }
    }
    if (u < E + 1.2) {
      for (const c of [12, 13, 15]) if (rnd(Math.floor(u / 0.15), c) < 0.5) marks.push([c, 0, rnd(c, Math.floor(u / 0.15)) < 0.5 ? 0x27 : 0x2e]);
      return at(HOME_R, 1, Math.floor(u / 0.15) % 2 ? 'shake' : 'stand');
    }
    return idle(P, u, E + 1.2, marks, at);
  }

  if (u < 0.6) { marks.push([HOME_L, 0, BANG]); return at(HOME_L, -1, 'alert'); }
  const tens = P.digits[2], units = P.digits[3];
  if (P.both) {
    if (u < tens.start - 0.2) return at(HOME_L, -1, 'look');
    if (u < tens.start) return at(11, -1, 'walk');
    if (u < tens.doneAt + 0.1) {
      const placing = tens.nu.some((p) => u >= p.at && u < p.at + 0.15);
      return at(10, -1, placing ? 'push' : 'stand');
    }
    if (u < units.start - 0.1) return at(12, -1, 'walk');
  }
  if (units.change && u < units.start) {
    // the breach squirts it right in the face
    const jet = u >= 0.6 && u < units.start - 0.1;
    if (jet) marks.push([12, 1, Math.floor(u / 0.15) % 2 ? 0x2d : 0xb0]);
    return at(HOME_L + (jet && u > 0.9 ? 1 : 0), -1, jet ? (Math.floor(u / 0.3) % 2 ? 'shake' : 'alert') : 'look');
  }
  if (units.change && u < units.doneAt) {
    const placing = units.nu.some((p) => u >= p.at && u < p.at + 0.15);
    return at(HOME_L, -1, u < units.start ? 'look' : placing ? 'push' : 'stand');
  }
  return idle(P, u, Math.max(E, 1.2), marks, at);
}

const settled = (P) => Math.max(P.end, 1.2) + (P.isHour ? 1.2 : 0);
const gnawStart = (P) => settled(P) + 4.5;

/** After the build: slap the new digit tight, then gnaw the sapling, with fidgets, until it falls. */
function idle(P, u, E, marks, at) {
  const v = u - E;
  if (v < 0.3) return at(HOME_R, 1, 'stand');
  if (v < 1.5) {
    const down = Math.floor((v - 0.3) / 0.3) % 2 === 1;
    if (down) marks.push([12, 0, SPLASH]);
    return at(HOME_R, 1, down ? 'slap' : 'tailUp');
  }
  if (u < gnawStart(P)) return at(HOME_R, 1, Math.floor(u / 1.4) % 3 === 2 ? 'look' : 'stand');
  if (u >= TIMBER) {
    if (u < TIMBER + 1.0) { marks.push([HOME_R, 0, BANG]); return at(HOME_R, 1, 'alert'); }
    if (u < 58.6) return at(HOME_R, 1, 'stand');
    if (P.preHour) {
      if (Math.floor(u / 0.3) % 2) marks.push([HOME_L, 0, BANG]);
      return at(HOME_L, -1, Math.floor(u / 0.15) % 2 ? 'walk' : 'alert');
    }
    return at(HOME_L, -1, 'look');
  }
  const blk = Math.floor(u / 6), w = u - blk * 6, r = rnd(P.m, blk);
  if (w > 3.8 && blk > 0) {
    if (r < 0.25) return at(HOME_L, -1, 'look');
    if (r < 0.45) return at(HOME_R, 1, Math.floor(w / 0.3) % 2 ? 'slap' : 'tailUp');
    if (r < 0.6) return at(HOME_R, 1, 'alert');
    if (r < 0.7) return at(HOME_R, 1, Math.floor(w / 0.15) % 2 ? 'shake' : 'stand');
  }
  const k = Math.floor(u / 0.6), p = (u - k * 0.6) / 0.6;
  const path = rnd(k, 3) < 0.5 ? [[15, 0], [14, 0], [13, 0]] : [[15, 0], [14, 0], [15, 0]];
  const j = Math.min(2, Math.floor(p * 3));
  marks.push([path[j][0], path[j][1], CHIP[j]]);
  return at(HOME_R, 1, Math.floor(u / 0.3) % 2 ? 'chomp' : 'stand');
}

function treeAt(P, u) {
  const E = settled(P), G0 = gnawStart(P);
  if (u < E + 1.8) return 'stump';
  if (u < E + 2.7) return 'sprout';
  if (u < G0) return 'sapling';
  if (u < TIMBER) return 't' + Math.min(3, Math.floor(Math.max(0, (u - G0) / (TIMBER - G0)) * 4));
  if (u < TIMBER + 1.0) return Math.floor((u - TIMBER) / 0.25) % 2 ? 'wobR' : 'wobL';
  if (u < TIMBER + 1.4) return 'fall';
  return 'stump';
}


// ------------------------------------------------------------------ the face

const digitsAt = (kit, dayStart, B) => {
  const f = kit.clockFields(new Date(dayStart + B * 1000));
  return { v: f.hh + f.mm, f };
};

export default {
  name: 'Beaver',
  blurb: 'The time is a beaver dam of logs and stakes; each minute the river bursts through the digit that changes and the beaver plugs in the new one, and on the hour the whole dam washes away.',
  bus: 'i2c100',
  panel: 'green',
  fps: 10,

  frame(lcd, api, { fields, date, kit }) {
    const midnight = new Date(date); midnight.setHours(0, 0, 0, 0);
    const dayStart = midnight.getTime();
    const T = (date.getTime() - dayStart) / 1000;
    const u = fields.s + fields.ms / 1000;
    const B = T - u;
    const now = digitsAt(kit, dayStart, B), prev = digitsAt(kit, dayStart, B - 60);
    const next = digitsAt(kit, dayStart, B + 60);
    const isHour = now.f.mm === '00', preHour = next.f.mm === '00';
    const Pn = plan(prev.v, now.v, isHour, preHour, Math.round(B / 60));

    const grid = [Array(16).fill(0x20), Array(16).fill(0x20)];
    const tiles = [Array(16).fill(null), Array(16).fill(null)];
    const flood = isHour && u >= 0.3 && u < 1.8;

    // ---- the dam
    Pn.digits.forEach((d) => {
      const cells = digitCells(segsAt(d, now.v, u));
      const wet = d.change && u >= 0.1 && u < d.doneAt + 0.2;
      const gush = d.change && u >= 0.1 && u < d.start;
      cells.forEach((part, k) => {
        const col = X[d.i] + (k % 3), row = k < 3 ? 0 : 1;
        if (part) { tiles[row][col] = PART[part]; return; }
        const popped = d.change && d.old.some((p) => u >= p.gone && u < p.gone + 0.3 && CELL_OF[p.s] === k);
        if (popped) grid[row][col] = SPLASH;
        else if (wet && row === 1) grid[row][col] = WAVE[(col + Math.floor(T / 0.4)) % 2];
        else if (gush && row === 0) grid[row][col] = DROP[Math.floor(T / 0.15 + col * 1.3) % 3];
      });
    });

    // ---- the spillway, which is the colon: a drop a second
    const f = u % 1;
    if (flood || (preHour && u > 50)) {
      grid[0][COLON] = DROP[Math.floor(T / 0.15) % 3];
      grid[1][COLON] = WAVE[Math.floor(T / 0.3) % 2];
    } else {
      grid[0][COLON] = f < 0.25 ? 0x27 : f < 0.5 ? 0xa5 : f < 0.75 ? 0x2e : 0x20;
      grid[1][COLON] = f >= 0.75 ? SPLASH : 0xa5;
    }
    // water topping the dam before the hour
    if (preHour && u > 52) {
      for (let c = 0; c < 13; c++) {
        if (c !== COLON && !tiles[0][c] && rnd(Math.floor(T / 0.3), c) < (u - 52) / 12) grid[0][c] = DROP[Math.floor(T / 0.15 + c) % 3];
      }
    }
    // the flood: water over everything, logs washing downstream
    const logs = [];
    if (flood) {
      for (let c = 0; c < 16; c++) {
        if (!tiles[0][c] && c !== COLON) grid[0][c] = DROP[Math.floor(T / 0.15 + c * 1.3) % 3];
        if (!tiles[1][c]) grid[1][c] = WAVE[(c + Math.floor(T / 0.2)) % 2];
      }
      for (let k = 0; k < 3; k++) {
        const c = Math.floor((u - 0.4) / 0.2) - k * 4;
        if (c >= 0 && c < 16 && !tiles[1][c]) logs.push(c);
      }
    }

    const bv = beaverAt(Pn, u);
    const tree = treeAt(Pn, u);

    // ---- tiles: dam first, then beaver, then sapling, then floating logs
    const alloc = new TileAllocator(lcd, 0);
    for (let row = 0; row < 2; row++) for (let c = 0; c < 16; c++) {
      if (tiles[row][c]) grid[row][c] = alloc.add(tiles[row][c]) ?? 0x20;
    }
    const beaverCells = new Set();
    if (bv) {
      let [tail, body] = POSE[bv.pose];
      if (bv.dir < 0) { tail = mirror(tail); body = mirror(body); }
      const put = (c, t) => {
        if (c < 0 || c > 15 || tiles[bv.row][c]) return;
        const code = alloc.add(t);
        if (code != null) { grid[bv.row][c] = code; beaverCells.add(bv.row * 16 + c); }
      };
      put(bv.col, body);
      put(bv.col - bv.dir, tail);
      for (const [c, r, code] of bv.marks) {
        if (c >= 0 && c < 16 && !tiles[r][c] && !beaverCells.has(r * 16 + c)) grid[r][c] = code;
      }
    }
    if (tree && !beaverCells.has(16 + TREE_COL)) {
      const code = alloc.add(TREE[tree]);
      if (code != null) grid[1][TREE_COL] = code;
    }
    for (const c of logs) {
      if (beaverCells.has(16 + c)) continue;
      grid[1][c] = alloc.add(PART.D) ?? 0xb0;
    }
    alloc.flush();
    grid.forEach((codes, row) => { lcd.setCursor(0, row); codes.forEach((c) => lcd.data(c)); });
  },
};
