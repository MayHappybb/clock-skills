// Hanzi — a Chinese word clock (字钟) in the spirit of QlockTwo.
//
// Fifty characters stand on a 10 x 5 grid of 12 px cells, all of them faintly
// there (two stroke pixels in seven, anchored to the cell). The
// ones that spell the time are lit, exact to the minute, read left to right
// and top to bottom as one spoken sentence:
//
//   现在是 下午 三点 二十五分      现在是 晚上 十一点 零五分
//   现在是 上午 十点 一刻          现在是 中午 十二点 半
//   现在是北京时间 下午 三点整     (the first minute of every hour)
//
// The grid is a puzzle solved once: every sentence of the day must be a
// subsequence of the reading order. Periods share their 上 and 午 (凌晨 早
// 晚 上 中 下 午 spells 凌晨 早上 晚上 上午 中午 下午); the hour run 零 十 一
// 二 两 三 ... 九 gives 零点 (midnight), 十一, 十二 and the spoken 两点; after
// 点 come 整 半, then the minute run (零 or a tens digit, 十, a unit) and
// 刻 分. The last three cells, 秒 必 争, finish the idiom 分秒必争 ("every
// minute and second counts"). 北京时间 is the radio time signal's phrase.
//
// 秒 is the seconds hand: through each minute its ghost fills with ink,
// flowing along its strokes from the first, complete just before the turn.
//
// The minute turn is ink. From :59.0 every cell that changes bleeds into a
// wet blot (洇), in reading order: a lit character spreads from its strokes,
// a faint one takes a drop at its centre. From :00 the blots, again in
// reading order, either gather back into the strokes of the newly lit
// character or dry out, grain by grain, to the ghost. The safety rule: a
// cell leaves its old state only once the first blot has fallen, and the
// last blot clears only when every other changed cell shows its new state,
// so a frame is the old sentence, the new one, or one with ink still wet on
// it; never a complete wrong time (3:19 -> 3:20 can not pass through 三点十
// 分 or 三点二十九分 unblotted).
//
// The hour is the radio time signal (报时): over :55-:59 five short pips
// (the whole panel brightens for a tenth of a second, a two-byte contrast
// change) while 必 and 争 ink in beside 分秒, so the grid says 五十九分秒必争;
// a long pip on :00, the sentence turns to 现在是北京时间X点整, and a seal
// (印章) comes down on the empty minute rows: its shadow darkens the ghosts,
// the stone lands (one inverted frame, the grid jolts a pixel), lifts, and
// leaves a 朱文 impression, the hour in raised strokes inside a rim, in my
// own squared seal letterforms (子 at midnight, 午 at noon), worn corners and
// a chipped rim; it fades after forty seconds.
//
// Glyphs: the 12 px bitmaps of Ark Pixel Font (TakWolf, SIL Open Font
// License 1.1), which is drawn on the 12 px grid. Thresholded outline fonts
// (PingFang, Hiragino, Songti, STHeiti) were tried at 11-12 px and merged
// strokes in 凌 晨 零 整; a pixel font drawn at the size reads far better.
// The seal numerals are drawn here as stroked centre-lines.
//
// Every frame is a function of the clock: the three sentences (last, this
// and next minute) come from a table of all 1440, which cells change and
// their stagger from those sets, blot raggedness from noise() of the minute
// key, the seal from the hour. Burn-in: the grid walks two out-of-step
// orbits (3 px across, 2 down); ghosts are 2/7 of each glyph; 点 and 现在是
// are the always-lit words; from 23:00 to 07:00 (ctx.night) the panel dims.

import { dither, noise, orbit, clamp, ease, segDist } from '../js/kit.js';

// ------------------------------------------------------------ glyphs (11 x 11 ink in a 12 px cell)

const GLYPHS = {
  现: ["....######.", "###.#....#.", ".#..#..#.#.", ".#..#..#.#.", ".#..#..#.#.", "###.#..#.#.", ".#..#..#.#.", ".#.....#...", ".##...#.#.#", "##...#..#.#", "...##...###"],
  在: ["....#......", "....#......", "###########", "...#.......", "...#...#...", "..#....#...", ".##.#######", "#.#....#...", "..#....#...", "..#....#...", "..#.#######"],
  是: [".#########.", ".#.......#.", ".#########.", ".#.......#.", ".#########.", "...........", "###########", "..#..#.....", "..#..#####.", ".#.###.....", "#.....#####"],
  北: ["...#..#....", "...#..#....", "...#..#...#", "####..#..#.", "...#..###..", "...#..#....", "...#..#....", "..##..#....", "##.#..#...#", "...#..#...#", "...#...####"],
  京: [".....#.....", "###########", "...........", ".#########.", ".#.......#.", ".#.......#.", ".#########.", ".....#.....", "..#..#..#..", "##...#...##", "...###....."],
  时: [".........#.", "####.....#.", "#..#.######", "#..#.....#.", "#..#.....#.", "####.#...#.", "#..#..#..#.", "#..#..#..#.", "#..#.....#.", "####.....#.", ".......###."],
  间: ["#..########", ".#........#", "..........#", "#..#####..#", "#..#...#..#", "#..#...#..#", "#..#####..#", "#..#...#..#", "#..#...#..#", "#..#####..#", "#........##"],
  凌: ["#......#...", ".#..######.", ".#.....#...", "...########", "....#....#.", "...#.#....#", ".#...#####.", ".#..#....#.", ".#.#.#..#..", "#.....##...", "#..###..###"],
  晨: ["..########.", "..#......#.", "..########.", "..#......#.", ".##########", ".#.........", ".##########", ".#.#..#....", ".#.#...#.#.", ".#.#.#..#..", "#..##....##"],
  早: [".#########.", ".#.......#.", ".#########.", ".#.......#.", ".#########.", ".....#.....", ".....#.....", "###########", ".....#.....", ".....#.....", ".....#....."],
  晚: [".....#.....", "###..####..", "#.#.#...#..", "#.#########", "#.#.#..#..#", "###.#..#..#", "#.#.#######", "#.#...#.#..", "#.#...#.#.#", "###..#..#.#", "...##...###"],
  上: [".....#.....", ".....#.....", ".....#.....", ".....#.....", ".....#####.", ".....#.....", ".....#.....", ".....#.....", ".....#.....", ".....#.....", "###########"],
  中: [".....#.....", ".....#.....", "###########", "#....#....#", "#....#....#", "#....#....#", "###########", ".....#.....", ".....#.....", ".....#.....", ".....#....."],
  下: ["###########", ".....#.....", ".....#.....", ".....#.....", ".....#.#...", ".....#..#..", ".....#...#.", ".....#.....", ".....#.....", ".....#.....", ".....#....."],
  午: [".#.........", ".#########.", ".#...#.....", "#....#.....", ".....#.....", "###########", ".....#.....", ".....#.....", ".....#.....", ".....#.....", ".....#....."],
  零: [".#########.", ".....#.....", "###########", "#.##.#.##.#", "....###....", "..##...##..", "##...#...##", "......#....", ".#########.", "....#...#..", ".....###..."],
  十: [".....#.....", ".....#.....", ".....#.....", ".....#.....", "###########", ".....#.....", ".....#.....", ".....#.....", ".....#.....", ".....#.....", ".....#....."],
  一: ["...........", "...........", "...........", "...........", "...........", "###########", "...........", "...........", "...........", "...........", "..........."],
  二: ["...........", ".#########.", "...........", "...........", "...........", "...........", "...........", "...........", "...........", "###########", "..........."],
  两: ["###########", "...#...#...", "...#...#...", "###########", "#..#...#..#", "#..#...#..#", "#.#.#.#.#.#", "##...#...##", "#.........#", "#.........#", "#.......###"],
  三: [".#########.", "...........", "...........", "...........", "...........", "..#######..", "...........", "...........", "...........", "...........", "###########"],
  四: ["###########", "#..#...#..#", "#..#...#..#", "#..#...#..#", "#..#...#..#", "#..#...#..#", "#.#....####", "##........#", "#.........#", "#.........#", "###########"],
  五: [".#########.", "....#......", "....#......", "....#......", ".########..", "...#....#..", "...#....#..", "...#....#..", "..#.....#..", "..#.....#..", "###########"],
  六: ["....#......", ".....#.....", "...........", "###########", "...........", "...........", "..#.....#..", "..#......#.", ".#.......#.", ".#........#", "#.........#"],
  七: ["....#......", "....#......", "....#......", "....#...###", "....####...", "#####......", "....#......", "....#......", "....#.....#", "....#.....#", ".....######"],
  八: ["...#...#...", "...#...#...", "...#...#...", "...#...#...", "...#...#...", "..#.....#..", "..#.....#..", "..#.....#..", ".#.......#.", ".#.......#.", "#.........#"],
  九: ["...#.......", "...#.......", "...#.......", "########...", "...#...#...", "...#...#...", "...#...#...", "..#....#...", "..#....#..#", ".#.....#..#", "#......####"],
  点: [".....#.....", ".....######", ".....#.....", ".....#.....", ".#########.", ".#.......#.", ".#.......#.", ".#########.", "...........", ".#.#..#..#.", "#...#..#..#"],
  整: ["...#...#...", "###########", ".#.#.#.#.#.", ".#####.#.#.", "..###...#..", ".#.#.#.#.#.", "###########", ".....#.....", "..#..#####.", "..#..#.....", "###########"],
  半: [".....#.....", ".#...#...#.", "..#..#..#..", ".....#.....", ".#########.", ".....#.....", ".....#.....", "###########", ".....#.....", ".....#.....", ".....#....."],
  刻: ["...#......#", "#######.#.#", "..#.....#.#", ".#...#..#.#", "#####...#.#", "...#....#.#", "..#...#.#.#", "##...#..#.#", "....#.....#", "..##.#....#", "##....#.###"],
  分: ["...#...#...", "...#...#...", "..#.....#..", "..#.....#..", ".#.......#.", "#.#######.#", "....#...#..", "....#...#..", "...#....#..", "..#.....#..", "##....##..."],
  秒: ["...#...#...", "###....#...", "..#..#.#.#.", "..#..#.#..#", "####.#.#..#", "..#.#..#...", ".##....#..#", ".###.....#.", "#.#.....#..", "..#...##...", "..#.##....."],
  必: ["....#......", ".....#..#..", ".....#..#..", "...#....#..", ".#.#...#...", ".#.#...#.#.", ".#.#..#...#", "#..#.#....#", "...##...#.#", "..##....#..", "##..#####.."],
  争: ["..#........", "..######...", ".#.....#...", ".#########.", ".....#...#.", "###########", ".....#...#.", ".#########.", ".....#.....", ".....#.....", "...###....."],
};

const N = 11, PITCH = 12, COLS = 10;

/**
 * A glyph prepared once: its bits, the distance from every pixel of the
 * cell and its gutter (-1..11) to the nearest stroke pixel, and an "ink
 * flow" order: a breadth-first walk along the strokes from the first one,
 * so filling by order looks like ink running through the character.
 */
function prep(rows) {
  const bits = new Uint8Array(N * N), pts = [];
  rows.forEach((r, y) => { for (let x = 0; x < N; x++) if (r[x] === '#') { bits[y * N + x] = 1; pts.push([x, y]); } });
  const dist = new Float32Array(13 * 13);
  for (let y = -1; y <= N; y++)
    for (let x = -1; x <= N; x++) {
      let d = 99;
      for (const [px, py] of pts) d = Math.min(d, Math.hypot(px - x, py - y));
      dist[(y + 1) * 13 + x + 1] = d;
    }
  const order = new Int16Array(N * N).fill(-1);
  let k = 0;
  for (const [sx, sy] of pts) {                 // components in reading order
    if (order[sy * N + sx] >= 0) continue;
    const queue = [[sx, sy]];
    order[sy * N + sx] = k++;
    while (queue.length) {
      const [x, y] = queue.shift();
      for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        const X = x + dx, Y = y + dy;
        if (X < 0 || Y < 0 || X >= N || Y >= N || !bits[Y * N + X] || order[Y * N + X] >= 0) continue;
        order[Y * N + X] = k++;
        queue.push([X, Y]);
      }
    }
  }
  return { bits, dist, order, count: k };
}
const G = Object.fromEntries(Object.entries(GLYPHS).map(([c, rows]) => [c, prep(rows)]));

// ------------------------------------------------------------ the grid and its sentences

const GRID = [...(
  '现在是北京时间凌晨早' +
  '晚上中下午零十一二两' +
  '三四五六七八九点整半' +
  '零二三四五十一二三四' +
  '五六七八九刻分秒必争')];
const MIAO = 47, BI = 48, ZHENG = 49;

const NUM = '零一二三四五六七八九';
const period = (h) => (h < 5 ? '凌晨' : h < 8 ? '早上' : h < 12 ? '上午' : h < 13 ? '中午' : h < 18 ? '下午' : '晚上');
function hourWord(h) {
  if (h === 0) return '零';
  if (h === 12) return '十二';
  const k = h % 12;
  return k === 2 ? '两' : k === 10 ? '十' : k === 11 ? '十一' : NUM[k];
}
function minuteWord(m) {
  if (m === 0) return '整';
  if (m === 30) return '半';
  if (m === 15) return '一刻';
  if (m === 45) return '三刻';
  const t = Math.floor(m / 10), u = m % 10;
  if (t === 0) return `零${NUM[u]}分`;
  return `${t > 1 ? NUM[t] : ''}十${u ? NUM[u] : ''}分`;
}
/** The sentence for a time of day, as the characters it lights. */
export function sentence(h, m) {
  return `现在是${m === 0 ? '北京时间' : ''}${period(h)}${hourWord(h)}点${minuteWord(m)}`;
}
/** The cells that spell `text`, each found after the last: the grid's reading order. */
function cellsOf(text) {
  const out = [];
  let at = -1;
  for (const ch of text) {
    at = GRID.indexOf(ch, at + 1);
    if (at < 0) throw new Error(`hanzi: "${text}" is not spelled by the grid`);
    out.push(at);
  }
  return out;
}
export const PHRASES = Array.from({ length: 1440 }, (_, i) => new Set(cellsOf(sentence(Math.floor(i / 60), i % 60))));
const phraseOf = (f) => PHRASES[f.h * 60 + f.m];

// ------------------------------------------------------------ the ink turn

const BLEED_AT = 59.0, BLEED = 0.35, COND = 0.5;   // seconds
const MIAO_DONE = 58.8;                            // 秒 finishes filling
const COUNTDOWN = [[BI, 56.3], [ZHENG, 57.3]];      // 必 争 ink in before the hour

export const GHOST = 0, LIT = 1, BLEED_LIT = 2, BLEED_DROP = 3, BLOT = 4, GATHER = 5, DRY = 6, WRITE = 7;

/** What is lit at the very end of a minute, just before the bleed. */
function endSet(minute) {
  const s = new Set(PHRASES[minute]);
  s.add(MIAO);
  if ((minute + 1) % 60 === 0) { s.add(BI); s.add(ZHENG); }
  return s;
}

/**
 * The turn into `minute` (of the day): every cell whose state changes, in
 * reading order, with when it bleeds (before :00) and when it gathers or
 * dries (after). Cached: 1440 small maps at most.
 */
const TURNS = new Map();
function turnInto(minute) {
  if (TURNS.has(minute)) return TURNS.get(minute);
  const from = endSet((minute + 1439) % 1440), to = PHRASES[minute];
  const C = [];
  for (let i = 0; i < GRID.length; i++) if (from.has(i) !== to.has(i)) C.push(i);
  const n = C.length;
  const sb = n > 1 ? Math.min(0.09, 0.5 / (n - 1)) : 0;
  const sc = n > 1 ? Math.min(0.13, 0.9 / (n - 1)) : 0;
  const map = new Map();
  C.forEach((i, k) => map.set(i, { b0: BLEED_AT + k * sb, c0: 0.05 + k * sc, lit0: from.has(i), lit1: to.has(i) }));
  TURNS.set(minute, map);
  return map;
}

/**
 * Every cell's state at this instant: { mode, u, key }, `u` the progress
 * through the mode and `key` the minute whose turn the ink belongs to (so a
 * blot keeps its shape across :00).
 */
export function plan(f) {
  const now = f.h * 60 + f.m, next = (now + 1) % 1440, sec = f.sec;
  const cur = PHRASES[now], tin = turnInto(now), tout = turnInto(next);
  const cells = [];
  for (let i = 0; i < GRID.length; i++) {
    let mode = cur.has(i) ? LIT : GHOST, u = 1, key = f.minuteKey;
    if (i === MIAO) {
      // The seconds: 秒 fills with ink along its strokes, from when its last
      // turn dried until just before the next.
      const a = tin.get(MIAO), w0 = a ? a.c0 + COND : 0;
      mode = WRITE; u = clamp((sec - w0) / (MIAO_DONE - w0), 0, 1);
    }
    for (const [c, t0] of COUNTDOWN)
      if (i === c && next % 60 === 0 && sec >= t0) {
        const v = sec - t0;
        if (v < BLEED) { mode = BLEED_DROP; u = v / BLEED; } else if (v < BLEED + COND) { mode = GATHER; u = (v - BLEED) / COND; } else mode = LIT;
        key = f.minuteKey + 7;
      }
    const a = tin.get(i);
    if (a && sec < a.c0 + COND) {
      if (sec < a.c0) { mode = BLOT; u = 1; } else { mode = a.lit1 ? GATHER : DRY; u = (sec - a.c0) / COND; }
    }
    const b = tout.get(i);
    if (b && sec >= b.b0) {
      const v = (sec - b.b0) / BLEED;
      key = f.minuteKey + 1;
      if (v >= 1) { mode = BLOT; u = 1; } else { mode = b.lit0 ? BLEED_LIT : BLEED_DROP; u = v; }
    }
    cells.push({ mode, u, key });
  }
  return cells;
}

// ------------------------------------------------------------ drawing a cell

// Ghosts: two stroke pixels in seven, on the lattice (x + 2y) mod 7 in {0, 3},
// which thins a stroke evenly whichever way it runs (rows, columns, both
// diagonals); a Bayer dither at this level leaves whole rows lit. 1/5 hid
// the characters entirely, 2/5 competed with the lit sentence.
const isGhost = (x, y) => { const r = (x + 2 * y) % 7; return r === 0 || r === 3; };

/**
 * One cell with its top-left ink pixel at (X, Y). Blots are a ragged disc
 * about the cell's centre; bleeding grows it out of the strokes, gathering
 * shrinks it back onto them, drying loses it grain by grain, outside in.
 * `wet` moves the dithered rim of a wet blot so it shimmers.
 */
function drawCell(g, X, Y, gl, { mode, u, key }, cell, wet) {
  if (mode === LIT || mode === GHOST || mode === WRITE) {
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        if (!gl.bits[y * N + x]) continue;
        if (mode === LIT || isGhost(x, y) || (mode === WRITE && gl.order[y * N + x] < u * gl.count)) g.pixel(X + x, Y + y);
      }
    return;
  }
  // This blot's shape, fixed for the turn: a lobed disc (two harmonics of
  // its radius) and a few satellite drops thrown off as it lands.
  const seed = key % 9973, nz = (k) => noise(cell * 7.3 + k, seed);
  const p1 = nz(1) * 6.283, p2 = nz(2) * 6.283, a1 = 0.08 + 0.12 * nz(3), a2 = 0.05 + 0.08 * nz(4);
  const sats = [0, 1, 2].filter((k) => nz(10 + k) < 0.6).map((k) => {
    const ang = nz(20 + k) * 6.283, r = 6.8 + 1.6 * nz(30 + k);
    return [5 + r * Math.cos(ang), 5 + r * Math.sin(ang), 0.7 + 0.8 * nz(40 + k)];
  });
  const sat = (x, y, s) => s > 0.6 && sats.some(([sx, sy, sr]) => Math.hypot(x - sx, y - sy) <= sr * Math.min(1, (s - 0.6) / 0.3));
  for (let y = -2; y <= N + 1; y++)
    for (let x = -2; x <= N + 1; x++) {
      const inside = x >= 0 && y >= 0 && x < N && y < N;
      const on = inside && gl.bits[y * N + x] === 1;
      const ghost = on && isGhost(x, y);
      const n = noise(x * 13.7 + y * 71.3 + cell * 5.1, seed);
      const d = x >= -1 && y >= -1 && x <= N && y <= N ? gl.dist[(y + 1) * 13 + x + 1] : 99;
      const th = Math.atan2(y - 5, x - 5);
      const b = Math.hypot(x - 5, y - 5) / (6.1 * (1 + a1 * Math.sin(3 * th + p1) + a2 * Math.sin(5 * th + p2))) + (n - 0.5) * 0.14;
      let lit = false, rim = false;
      if (mode === BLOT) { lit = b <= 1 || sat(x, y, 1); rim = b <= 1.2; }
      else if (mode === BLEED_LIT || mode === GATHER) {
        const k = mode === GATHER ? 1 - ease.inQuad(u) : ease.outQuad(u);
        const r = 9 * k * (0.55 + 0.9 * n);
        lit = on || (d <= r && b <= 1) || sat(x, y, k);
        rim = k > 0.08 && d <= r + 1.4 && b <= 1.2;
      } else if (mode === BLEED_DROP) {
        const s = ease.outCubic(u);
        lit = ghost || b <= s || sat(x, y, s);
        rim = b <= s * 1.2 + 0.05;
      } else if (mode === DRY) {
        const k = 0.6 * n + 0.4 * clamp(1.2 - b, 0, 1);   // the rim dries first
        lit = ghost || ((b <= 1 || sat(x, y, 1)) && k > u);
        rim = b <= 1.2 && k > u + 0.25;
      }
      if (lit || (rim && dither(X + x + wet, Y + y + (wet >> 1), 0.3))) g.pixel(X + x, Y + y);
    }
}

// ------------------------------------------------------------ the seal

// Squared seal letterforms (after 缪篆, the Han seal style that fills its
// square), as centre-lines in a 20 x 20 box, carved 3 px wide.
const SEAL_FORMS = {
  一: [[[2, 10], [18, 10]]],
  二: [[[4, 5.5], [16, 5.5]], [[2, 15], [18, 15]]],
  三: [[[4, 3.5], [16, 3.5]], [[5, 10], [15, 10]], [[2, 16.5], [18, 16.5]]],
  四: [[[2.5, 3], [17.5, 3], [17.5, 17.5], [2.5, 17.5], [2.5, 3]], [[8, 3], [8, 9], [5.5, 12.5]], [[12, 3], [12, 11], [17.5, 11]]],
  五: [[[2.5, 2.5], [17.5, 2.5]], [[9, 2.5], [7, 17.5]], [[4.5, 9.5], [14.5, 9.5], [14.5, 17.5]], [[1.5, 17.5], [18.5, 17.5]]],
  六: [[[10, 1], [10, 4.5]], [[1.5, 6.5], [18.5, 6.5]], [[7, 10.5], [3, 18]], [[13, 10.5], [17, 18]]],
  七: [[[1.5, 9], [18.5, 6]], [[8, 1.5], [8, 15.5], [10.5, 17.5], [17.5, 17.5], [17.5, 14]]],
  八: [[[7.5, 3], [7, 10], [2, 18]], [[12.5, 3], [13, 11], [18, 18]]],
  九: [[[8, 1.5], [8, 9], [2, 18]], [[2.5, 6.5], [13, 6.5], [13, 16], [15, 17.5], [18, 17.5], [18, 14]]],
  十: [[[1.5, 10], [18.5, 10]], [[10, 1.5], [10, 18.5]]],
  十一: [[[3, 6], [17, 6]], [[10, 1.5], [10, 11]], [[1.5, 16], [18.5, 16]]],
  子: [[[4, 2.5], [15.5, 2.5], [10, 7.5]], [[10, 7.5], [10, 16.5], [7, 18.5], [5, 17.5]], [[1.5, 11], [18.5, 11]]],
  午: [[[6.5, 1.5], [3.5, 7]], [[5, 6], [16.5, 6]], [[1.5, 12], [18.5, 12]], [[10, 6], [10, 18.5]]],
};
const SEAL_HOUR = ['子', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一',
  '午', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一'];
const S = 24;                                     // the seal is 2 x 2 cells
const DROP = 1.7, IMPACT = 2.3, LIFT = [2.65, 3.2], FADE = [40, 43];

/**
 * The impression of hour h's seal, 1 = paste. 朱文: the hour in raised
 * strokes inside a raised rim (白文, carved strokes in a solid block, was
 * tried: on a black screen the eye reads the lit block as the figure, and
 * 三 became 目). Worn corners, a chipped rim, paste that did not take.
 */
const SEALS = new Map();
function impression(h) {
  if (SEALS.has(h)) return SEALS.get(h);
  const strokes = SEAL_FORMS[SEAL_HOUR[h]];
  const px = new Uint8Array(S * S);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const cx = x + 0.5, cy = y + 0.5, n = noise(x * 3.3 + y * 17.9, 400 + h);
      const qx = Math.max(3 - cx, 0, cx - (S - 3)), qy = Math.max(3 - cy, 0, cy - (S - 3));
      if (qx * qx + qy * qy > 9 - 4 * n) continue;
      if (n > 0.94) continue;
      const edge = Math.min(cx, cy, S - cx, S - cy);
      let lit = edge < 2 && !(edge < 1 && n < 0.25);
      if (!lit) {
        let d = 99;
        for (const st of strokes)
          for (let k = 1; k < st.length; k++) d = Math.min(d, segDist((cx - 3.5) / 0.85, (cy - 3.5) / 0.85, st[k - 1][0], st[k - 1][1], st[k][0], st[k][1]) * 0.85);
        lit = d <= 1.4 + (noise(x * 7.1 + y * 3.7, 500 + h) - 0.5) * 0.5;
      }
      if (lit) px[y * S + x] = 1;
    }
  SEALS.set(h, px);
  return px;
}

/** A square outline, `w` thick, of half-size `hs` about (cx, cy); dithered at `level`. */
function square(g, cx, cy, hs, w, level = 1) {
  for (let y = Math.floor(cy - hs); y < Math.ceil(cy + hs); y++)
    for (let x = Math.floor(cx - hs); x < Math.ceil(cx + hs); x++) {
      const e = Math.min(x + 0.5 - (cx - hs), cx + hs - x - 0.5, y + 0.5 - (cy - hs), cy + hs - y - 0.5);
      if (e >= 0 && e < w && (level >= 1 || dither(x, y, level))) g.pixel(x, y);
    }
}

/** The hour's seal: shadow and descent, the stamp, the lift, the impression fading. */
function drawSeal(g, f, bx, by) {
  const sec = f.sec, cx = bx + S / 2, cy = by + S / 2;
  if (sec >= DROP && sec < IMPACT) {
    const v = (sec - DROP) / (IMPACT - DROP);
    // Its shadow darkens the ghosts under it; the stone comes down from the viewer.
    g.fillWhere((_, __, x, y) => dither(x, y, 0.3 + 0.7 * v), 0, [bx, by, S, S]);
    square(g, cx, cy, S / 2 + 1 + 16 * (1 - v) ** 2, 2);
    return;
  }
  if (sec < IMPACT || sec >= FADE[1]) return;
  if (sec < LIFT[0]) {
    // The stone pressed down: its top, a dark block with a rim and its knob.
    g.fillRect(bx - 1, by - 1, S + 2, S + 2, 0);
    square(g, cx, cy, S / 2 + 1, 2);
    g.fillCircle(cx, cy, 4.2);
    g.fillCircle(cx, cy, 2.2, 0);
    return;
  }
  const px = impression(f.h);
  const fade = 1 - clamp((sec - FADE[0]) / (FADE[1] - FADE[0]), 0, 1);
  g.fillRect(bx - 1, by - 1, S + 2, S + 2, 0);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++)
      if (px[y * S + x] && (fade >= 1 || dither(x, y, fade))) g.pixel(bx + x, by + y);
  if (sec < LIFT[1]) {
    const v = (sec - LIFT[0]) / (LIFT[1] - LIFT[0]);
    square(g, cx, cy, S / 2 + 2 + 14 * ease.inQuad(v), 2, 1 - v);
  }
}

// ------------------------------------------------------------ the face

const DAY = 0xa0, NIGHT = 0x18, PIP_DAY = 0xff, PIP_NIGHT = 0x50;

export default {
  name: 'Hanzi',
  blurb: 'A Chinese word clock: 现在是下午三点二十五分 lit on a grid of fifty characters; ink bleeds and gathers on the minute, a seal stamps the hour.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,

  frame(g, { fields: f, date, oled, night }) {
    const sec = f.sec;
    const ox = orbit(date, 3, 3)[0], oy = orbit(new Date(date.getTime() + 7 * 60000), 2, 5)[1];
    const hourIn = f.m === 0;
    const jolt = hourIn && sec >= IMPACT && sec < IMPACT + 0.12 ? 1 : 0;
    const X0 = 4 + ox, Y0 = 2 + oy + jolt;
    const wet = Math.floor(sec * 12) % 8;

    const cells = plan(f);
    for (let i = 0; i < GRID.length; i++)
      drawCell(g, X0 + (i % COLS) * PITCH, Y0 + Math.floor(i / COLS) * PITCH, G[GRID[i]], cells[i], i, wet);

    if (hourIn) {
      const col = [0, 3, 5, 1, 4, 2][f.h % 6];
      drawSeal(g, f, X0 + col * PITCH - 1, Y0 + 3 * PITCH - 1);
    }

    // The radio time signal: five short pips over :55-:59, a long one on :00.
    const pip = (f.m === 59 && sec >= 55 && sec % 1 < 0.12) || (hourIn && sec < 0.55);
    const base = DAY + (NIGHT - DAY) * night, peak = PIP_DAY + (PIP_NIGHT - PIP_DAY) * night;
    oled.contrast(pip ? peak : base);
    if (hourIn && sec >= IMPACT && sec < IMPACT + 0.04) oled.invert(true);
  },
};
