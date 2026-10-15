// Slots — a pachislot machine whose reels land on the time.
//
// Four reels in a bracketed window, one cell wide and both rows tall each.
// The bottom row is the payline and holds the digit; the top row shows the
// next symbol coming down the strip: money from the ROM (yen, dollar, 円, 万,
// cent, sigma, a star, a box for BAR). The strip has an 8-row pitch, so at
// rest every symbol sits exactly in a cell: the payline digit is one tile
// and the symbol above it is free ROM.
//
// A cat sits beside the lever and treats the knob as a toy, batting it once
// a second so the lever jiggles. At :58.6 it crouches with its tail
// wiggling, at :59.6 it pounces, and at :00 it hauls the lever down; the
// lever springs back. Only the reels whose digit changes let go (the rest
// are held, as on a real machine), and they spin up a cell at a time:
// 250, 180, 130 ms, then a cell a frame, a blur of ROM money that costs no
// CGRAM. Each one stops in turn, left to right, 1.2 s apart: the strip
// switches to dot-by-dot scrolling over its last two symbols, eases out,
// runs a row past the payline and jolts back. The old digit is carried off
// by the first spin step and the new one is the only digit on the strip, so
// the glass never shows a time that isn't the old one or the new one. The cat
// watches the reels, smiles when the last one lands, and one coin drops out
// of the chute and rolls along the tray.
//
// On the hour the minute reels stop first, on 0 0, then the hour reel goes
// to リーチ ("reach"): it crawls for 3.2 s, symbols easing past one by one,
// while the sign flashes ﾘｰﾁ!. When it lands, ｷﾀｰ!! ("it's here!"): the row
// above the payline flashes a line of yen and stars, coins pour into the
// tray and over the sign, and the cat hops for joy, three rows clear of the
// floor.
//
// Tiles: one per payline digit (four), two for a reel scrolling dot by dot,
// the cat's head and body, and the lever's top half. The lever's lower half is
// ROM '|' unless the knob is in it. Stops are spaced so only one reel scrolls
// by dots at a time and the lever is back in its top cell before the first
// one does: 7 at rest, 8 during a pull or a stop.

import { TileAllocator, clamp } from '../js/kit.js';

const FPS = 10;
const pic = (s) => s.trim().split(/\s+/);
const romRows = (lcd, code) => lcd.glyph(code).map((b) => [...Array(5)].map((_, i) => ((b >> (4 - i)) & 1 ? '#' : '.')).join(''));

// ---------------------------------------------------------------- reel art
const DIGIT = {
  0: pic(`.###. ##.## ##.## ##.## ##.## ##.## ##.## .###.`),
  1: pic(`..##. .###. #.##. ..##. ..##. ..##. ..##. .####`),
  2: pic(`.###. ##.## ...## ..##. .##.. ##... ##... #####`),
  3: pic(`####. ...## ...## .###. ...## ...## ...## ####.`),
  4: pic(`...## ..### .#.## #..## ##### ...## ...## ...##`),
  5: pic(`##### ##... ##... ####. ...## ...## ##.## .###.`),
  6: pic(`.###. ##... ##... ####. ##.## ##.## ##.## .###.`),
  7: pic(`##### ...## ...## ..##. ..##. .##.. .##.. .##..`),
  8: pic(`.###. ##.## ##.## .###. ##.## ##.## ##.## .###.`),
  9: pic(`.###. ##.## ##.## ##.## .#### ...## ...## .###.`),
};
const MONEY = [0x5c, 0x24, 0xfc, 0x2a, 0xdb, 0xec, 0xfb, 0xf6];

const hash = (a, b = 0) => {
  let x = (a * 374761393 + b * 668265263) | 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  return (x ^ (x >>> 16)) >>> 0;
};
const moneyAt = (k, reel, digit) => MONEY[hash(k + 11, reel * 17 + Number(digit)) % MONEY.length];

/**
 * The 16-row window of the strip that stops on `digit`, Y rows short of rest
 * (Y > 0: still coming down; Y < 0: past the payline). Slot 0 is the digit.
 */
function windowAt(lcd, Y, reel, digit) {
  const out = [];
  const y0 = Math.round(Y) - 8;
  for (let w = 0; w < 16; w++) {
    const y = y0 + w, k = Math.floor(y / 8), r = y - k * 8;
    out.push(k === 0 ? DIGIT[digit][r] : romRows(lcd, moneyAt(k, reel, digit))[r]);
  }
  return out;
}

// ------------------------------------------------------------------- timing
const START = 0.45;
const DECEL = 0.8, BOUNCE = 0.25, GAP = 1.2;
const REACH = 3.2;                          // the hour reel's long crawl
const SPIN_STEPS = [0.25, 0.18, 0.13];

function stopTimes(changed, hour) {
  const t = changed.map(() => null);
  const order = hour ? [2, 3, 0, 1] : [0, 1, 2, 3];
  let at = 2.0;
  for (const i of order) {
    if (!changed[i]) continue;
    if (hour && i === 1) at += REACH - DECEL + 0.6;
    t[i] = at; at += GAP;
  }
  return t;
}
function spinSteps(ts) {
  let acc = 0, k = 0;
  for (const d of SPIN_STEPS) { if (ts < acc + d) return k; acc += d; k++; }
  return k + Math.floor((ts - acc) * FPS + 1e-6);
}
/** Reel i, u s into the minute: { digit } at rest, { rom } in the blur, or { rows } scrolling. */
function reelAt(lcd, i, u, was, now, stop, reach) {
  if (stop == null || u >= stop + BOUNCE) return { digit: now };
  if (u < START) return { digit: was };
  const dt = reach ? REACH : DECEL;
  if (u < stop - dt) {
    const k = spinSteps(u - START);
    if (k === 0) return { digit: was };
    return { rom: [moneyAt(-1 - k, i, was), moneyAt(-k, i, was)] };
  }
  if (u < stop) {
    const v = (stop - u) / dt;
    return { rows: windowAt(lcd, -1 + (reach ? 41 * v ** 3 : 17 * v * v), i, now) };
  }
  return { rows: windowAt(lcd, u - stop < 0.25 ? -1 : 0, i, now) };
}

// ----------------------------------------------------------- lever and cat
// The lever is a ball on a stick, the stick on dot column 2, where ROM '|'
// draws it, so its lower half is free at rest. The cat faces us, one cell
// wide, the head exactly one cell so the row gap is its collar; its batting
// paw is drawn into the lever's cells, so it costs nothing.
const HEAD = {
  open:   pic(`#...# ##.## ##### #.#.# #.#.# ##### .###. .....`),
  look:   pic(`#...# ##.## ##### ##.#. ##.#. ##### .###. .....`),
  blink:  pic(`#...# ##.## ##### ##### #.#.# ##### .###. .....`),
  wide:   pic(`#...# ##.## #.#.# #.#.# ##### ##.## .###. .....`),
  crouch: pic(`..... ..... #...# ##.## ##### #.#.# #.#.# #####`),
  happy:  pic(`#...# ##.## #.#.# .#.#. ##### ##.## .###. .....`),
  pull:   pic(`#...# ##.## ##### #.#.# ##### ##.## .###. .....`),
};
const BODY = {
  sit:    pic(`.#.#. ##.## ##### ##### ##.## ##.## ##.## #...#`),
  crouch: pic(`.###. ##### ##### ##### ##### ##.## ##.## #...#`),
};

/** Knob drop (dot rows) and whether the paw is on it, at u seconds into the minute. */
function lever(u) {
  if (u < 0.3) return { y: 9 * (u / 0.3) ** 2, paw: true };
  if (u < 0.6) return { y: 9, paw: true };
  if (u < 1.4) { const v = u - 0.6; return { y: 9 * Math.exp(-5 * v) * Math.cos(v * 9), paw: false }; }
  if (u > 59.6) return { y: 0, paw: true };          // the pounce lands
  if (u > 58.6) return { y: 0, paw: false };
  const s = u % 1;                                    // a bat, once a second
  return s < 0.3 ? { y: 0, paw: true, bat: true } : { y: s < 0.5 ? 1 : 0, paw: false };
}

const KNOB = pic(`.###. ##### ##### .###.`);
function leverTiles(y, paw) {
  const col = Array.from({ length: 16 }, () => '.....');
  const set = (r, c) => { if (r >= 0 && r < 16) col[r] = col[r].slice(0, c) + '#' + col[r].slice(c + 1); };
  for (let r = y + 4; r < 15; r++) set(r, 2);
  KNOB.forEach((line, r) => [...line].forEach((ch, c) => { if (ch === '#') set(y + r, c); }));
  if (paw) [[4, 0], [5, 0], [5, 1], [6, 0]].forEach(([r, c]) => set(y + r, c));
  return [col.slice(0, 8), col.slice(8)];
}

// ------------------------------------------------------------------- layout
const TAIL_COL = 1, CAT_COL = 2, LEVER_COL = 3;
const FRAME_L = 4, REELS = [5, 6, 8, 9], COLON = 7, FRAME_R = 10;
const PANEL = 11;                           // sign above, tray below, to the right edge
const SIGN = { 'ﾘ': 0xd8, 'ｰ': 0xb0, 'ﾁ': 0xc1, '!': 0x21, 'ｷ': 0xb7, 'ﾀ': 0xc0, ' ': 0x20 };
const FEVER = 12;                           // seconds of jackpot after the hour reel lands

export default {
  name: 'Slots',
  blurb: 'A pachislot machine whose reels land on the time; a cat pulls the lever every minute, and on the hour it hits the jackpot.',
  bus: 'i2c100',
  panel: 'green',
  fps: FPS,

  frame(lcd, api, { date, kit }) {
    const ms = date.getTime();
    const f = kit.clockFields(date);
    const u = f.s + f.ms / 1000;            // seconds into the minute
    const n = Math.floor(ms / (1000 / FPS) + 1e-6);
    const prev = kit.clockFields(new Date(ms - u * 1000 - 1));
    const now = [...(f.hh + f.mm)];
    const was = [...(prev.hh + prev.mm)];
    const hour = f.m === 0;
    const changed = now.map((v, i) => v !== was[i]);
    const stops = stopTimes(changed, hour);
    const landed = Math.max(...stops.filter((t) => t != null)) + BOUNCE;   // last reel settled
    const reaching = hour && u > stops[3] + BOUNCE && u < stops[1];
    const F = hour ? u - stops[1] : -1;     // seconds into the jackpot
    const fever = F >= 0 && F < FEVER;

    const cells = [Array(16).fill(0x20), Array(16).fill(0x20)];
    const want = [];                        // tiles, in priority order: reels first

    REELS.forEach((col, i) => {
      const r = reelAt(lcd, i, u, was[i], now[i], stops[i], hour && i === 1);
      if (r.digit != null) { cells[0][col] = moneyAt(-1, i, r.digit); want.push([col, 1, DIGIT[r.digit]]); }
      else if (r.rom) { cells[0][col] = r.rom[0]; cells[1][col] = r.rom[1]; }
      else want.push([col, 0, r.rows.slice(0, 8)], [col, 1, r.rows.slice(8)]);
    });
    cells[1][COLON] = 0x3a;
    for (const row of [0, 1]) { cells[row][FRAME_L] = 0x5b; cells[row][FRAME_R] = 0x5d; }

    // The sign: chasing bulbs, or the machine shouting.
    const sign = fever ? ((n >> 2) % 2 || F > 3.4 ? 'ｷﾀｰ!!' : '') : reaching ? ((n >> 2) % 2 ? ' ﾘｰﾁ!' : '') : '';
    for (let c = PANEL; c < 16; c++) {
      cells[0][c] = sign ? SIGN[sign[c - PANEL]] : (c + Math.floor(u * 3)) % 3 === 0 ? 0x2a : 0xa5;
      cells[1][c] = 0x5f;
    }

    if (fever) {
      // The reel lamps flash a line of yen, then stars.
      for (const col of REELS) cells[0][col] = (n >> 1) % 2 ? 0x5c : 0x2a;
      // Coins pour into the tray, a cell every half second, bouncing as they
      // land; some fly up past the sign. Then they are raked off to the right.
      for (let c = PANEL; c < 16; c++) {
        const land = 0.8 + (c - PANEL) * 0.5;
        if (F > land) cells[1][c] = F > land + 0.3 ? 0x6f : 0xdf;
        if (F > 8.5 + (c - PANEL) * 0.4) cells[1][c] = 0x5f;
      }
      if (F > 0.5 && F < 3.4) cells[0][PANEL + (Math.floor(F * 5) % 5)] = 0x6f;
    } else if (!hour && u >= landed && u < landed + 1.6) {
      // Every other minute pays one coin: it drops out of the chute and rolls off.
      const k = Math.floor((u - landed) / 0.2);
      if (k === 0) cells[0][PANEL] = 0xdf;
      else if (k < 7) cells[1][PANEL + k - 1] = k === 1 ? 0xdf : 0x6f;
    }

    // Lever and cat.
    const L = lever(u);
    const y = Math.round(clamp(L.y, 0, 9));
    const [lt, lb] = leverTiles(y, L.paw);
    let face = 'open', body = 'sit', lift = 0;
    if (u > 58.6 && u <= 59.6) { face = 'crouch'; body = 'crouch'; }
    else if (u > 59.6 || u < 0.6) face = 'pull';
    else if (reaching) face = 'wide';
    else if (fever) {
      face = 'happy';
      lift = Math.floor(F / 0.3) % 2 && F < 8 ? 3 : 0;   // hops for joy
    } else if (u < landed) face = 'look';
    else if (u < landed + 0.6) face = 'happy';
    else if (u < landed + 1.6) face = 'look';
    else if (Math.floor(u) % 7 === 4 && u % 1 > 0.5) face = 'blink';
    const cat = [...HEAD[face], ...BODY[body]].slice(lift);
    while (cat.length < 16) cat.push('.....');
    want.push([LEVER_COL, 0, lt], [CAT_COL, 0, cat.slice(0, 8)], [CAT_COL, 1, cat.slice(8)]);
    if (lb.join() === romRows(lcd, 0x7c).join()) cells[1][LEVER_COL] = 0x7c;
    else want.push([LEVER_COL, 1, lb]);
    // The tail: a slow swish, a fast wiggle before the pounce.
    const swish = body === 'crouch' ? (n >> 1) % 2 : Math.floor(u / 1.5) % 3 === 0;
    cells[1][TAIL_COL] = swish ? 0x29 : 0x28;

    const alloc = new TileAllocator(lcd, 0);
    const placed = want.map(([c, r, t]) => [c, r, alloc.add(t)]);
    alloc.flush();
    for (const [c, r, code] of placed) if (code != null) cells[r][c] = code;
    cells.forEach((row, r) => { lcd.setCursor(0, r); row.forEach((c) => lcd.data(c)); });
  },
};
