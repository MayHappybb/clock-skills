// Asteroids — the numerals are big rocks, and the ship has to shoot the time.
//
// Each digit is a rock 2 cells wide and 2 rows tall (11 x 16 dots), drawn as
// a hollow outline two dots thick, with chipped corners and one dent that
// walks round every rock, so the whole field slowly tumbles. The rocks are a
// kit: a cell is a box with some of its top, left, right and bottom walls,
// and the same tile serves the top of one digit and the bottom of another.
// Two digit shapes are chosen for the budget: the 4 is a cup on a pillar and
// the 7 a hook on a pillar, so neither needs a tile of its own. Then the time
// never needs more than eight tiles (worst at times like 01:27), which is all
// of CGRAM: everything else on the glass is ROM.
//
// The ship is the ROM chevron (< ^ > v), the vector ship of the arcade at
// its smallest, and it lives in the open sky to the right of the time.
// Small ROM rocks (o) break off the field or wrap in from the right edge; the
// ship turns to face each one and shoots it, and sometimes does a roll.
//
// On the minute it flies to its post and fires. Hit, the rock splits in two,
// as the arcade's rocks do: its two columns drift apart into the cells beside
// it, burst, and go to dust. Then the dust gathers, two halves drift in and
// close into the new digit. When several digits change (09:59 -> 10:00) it
// fires a volley right to left; every old digit is destroyed before any new
// one gathers, so the glass never shows a wrong time.
//
// On the hour a flying saucer (the ROM omega) warbles in. It dodges the ship's
// shot and fires back; the ship escapes in a hyperspace jump, comes out at
// the far side, shoots it down, rolls, and only then turns to the time.
//
// 24-hour, so all four digits are always there and the time fills 11 cells.

import { Stage, noise } from '../js/kit.js';

// ------------------------------------------------------------------ rocks
const T = 8, L = 4, R = 2, B = 1;

// One rock cell. Walls are two dots thick: the left wall on columns 0-1, the
// right wall on 3-4. Bars are full width, so a bars-only cell is the same
// tile on either side of a digit. `phase` walks a dent round the rock.
function rockRows(key, phase) {
  const g = Array.from({ length: 8 }, () => Array(5).fill(0));
  const t = key & T, l = key & L, r = key & R, b = key & B;
  for (const y of [0, 1]) if (t) for (let c = 0; c <= 4; c++) g[y][c] = 1;
  for (const y of [6, 7]) if (b) for (let c = 0; c <= 4; c++) g[y][c] = 1;
  if (l) for (let y = 0; y <= 7; y++) { g[y][0] = 1; g[y][1] = 1; }
  if (r) for (let y = 0; y <= 7; y++) { g[y][3] = 1; g[y][4] = 1; }
  // chipped outer corners
  if (t && l) g[0][0] = 0;
  if (t && r) g[0][4] = 0;
  if (b && l) g[7][0] = 0;
  if (b && r) g[7][4] = 0;
  // a bar with no wall at its end is a broken edge: round it off
  if (t && !l && !r) { g[0][0] = 0; g[0][4] = 0; }
  if (b && !l && !r) { g[7][0] = 0; g[7][4] = 0; }
  // (a lone wall is left whole at its ends: chips there made a notch at the
  // row seam and the 1 read as '!')
  // the dent: two dots knocked out of the outer face, walking round
  const q = ((phase % 6) + 6) % 6;
  if (l) { const y = 1 + q; g[y][0] = 0; if (y + 1 <= 6) g[y + 1][0] = 0; }
  if (r) { const y = 6 - q; g[y][4] = 0; if (y - 1 >= 1) g[y - 1][4] = 0; }
  // (bars-only cells get no dent: a gap in a bar read as an umlaut)
  return g.map((row) => row.map((v) => (v ? '#' : '.')).join(''));
}

// [top-left, top-right, bottom-left, bottom-right] cells of each digit
const DIGIT = {
  0: [T | L, T | R, L | B, R | B],
  1: [0, R, 0, R],
  2: [T | B, T | R | B, T | L | B, T | B],
  3: [T | B, T | R | B, T | B, T | R | B],
  4: [L | B, R | B, 0, R],                // a cup on a pillar
  5: [T | L | B, T | B, T | B, T | R | B],
  6: [T | L | B, T | B, T | L | B, T | R | B],
  7: [0, T | R, 0, R],                    // a hook on a pillar
  8: [T | L | B, T | R | B, T | L | B, T | R | B],
  9: [T | L | B, T | R | B, T | B, T | R | B],
};

// ------------------------------------------------------------------ layout
const DIG = [0, 3, 6, 9];           // left cell of H1 H2 M1 M2
const COLON = 5;                    // spacers at 2 and 8
const POST = 12, HOME = 13;         // the ship's firing post and its home cell
const SKY0 = 11;                    // first open-sky cell
// where each digit's halves drift when it splits: [left half, right half]
const DRIFT = [[-1, 2], [2, 5], [5, 8], [8, 11]];

const HIT_GAP = 0.5;                // seconds between hits in a volley
const CELL_T = 0.1;                 // a bullet crosses a cell per frame
const SPLIT = 0.3, BURST = 0.55, CHIPS = 0.85, DUST = 1.15;   // after a hit
const G_DUST = 0.25, G_CHIPS = 0.5, G_HALVES = 0.75;          // gathering
const FORM_GAP = 0.45;

const ROCK = 0x6f, CHIP_A = 0xdf, CHIP_B = 0xa1, STAR = 0x2a, DOT = 0x2e, PEB = 0xa5;
const SAUCER = 0xf4;                // Ω: a dome on a rim, on little legs
const SHIP = { E: 0x3e, N: 0x5e, W: 0x3c, S: 0x76 };

function digitsOf(ms) {
  const d = new Date(ms);
  const h = d.getHours(), m = d.getMinutes();
  return [Math.floor(h / 10), h % 10, Math.floor(m / 10), m % 10];
}

// What happens at the minute boundary `bms`: old and new digits, which are
// destroyed and when (from the boundary), which gather and when.
function turnPlan(bms) {
  const oldD = digitsOf(bms - 60000), newD = digitsOf(bms);
  const hour = new Date(bms).getMinutes() === 0;
  const changed = [3, 2, 1, 0].filter((i) => oldD[i] !== newD[i]);
  const hit = {}, form = {};
  changed.forEach((i, k) => { hit[i] = k * HIT_GAP; });
  const formStart = (changed.length - 1) * HIT_GAP + DUST + 0.1;
  [...changed].reverse().forEach((i, k) => { form[i] = formStart + k * FORM_GAP; });
  const end = formStart + (changed.length - 1) * FORM_GAP + G_HALVES + 0.2;
  return { bms, oldD, newD, hour, changed, hit, form, end };
}

// --------------------------------------------------------------- ship script
// Keyframes {t, c, r, h, hide}. Position steps a cell at a time from one
// keyframe to the next; the heading snaps. Built from the clock alone.
function turnTo(keys, t, from, to, step = 0.2) {
  const order = ['E', 'N', 'W', 'S'];
  let i = order.indexOf(from), tt = t;
  const j = order.indexOf(to), dir = ((j - i + 4) % 4) <= 2 ? 1 : -1;
  while (order[i] !== to) { i = (i + dir + 4) % 4; tt += step; keys.push({ t: tt, h: order[i] }); }
  return tt;
}
function roll(keys, t0, from) {
  const order = ['E', 'N', 'W', 'S'];
  const i0 = order.indexOf(from);
  for (let k = 1; k <= 4; k++) keys.push({ t: t0 + k * 0.18, h: order[(i0 + 4 - k) % 4] });
  return t0 + 4 * 0.18;
}

function buildScript(mStart) {
  const prev = turnPlan(mStart), next = turnPlan(mStart + 60000);
  const minuteIndex = Math.floor(mStart / 60000);
  const keys = [], items = [], shots = [];
  const item = (t0, t1, c, r, code) => items.push({ t0, t1, c, r, code });

  // after the last turn: at the post facing the time, then home
  keys.push({ t: -1, c: POST, r: 1, h: 'W' });
  keys.push({ t: prev.end, c: POST, r: 1, h: 'W' });
  keys.push({ t: prev.end + 0.3, c: HOME, r: 1, h: 'W' });
  let r = 1, h = 'W';

  // a hunt every six seconds
  const to = next.hour ? S0 - 2 : 60 - 4;
  for (let u0 = Math.max(6, Math.ceil((prev.end + 0.8) / 6) * 6); u0 + 5 <= to; u0 += 6) {
    const seed = minuteIndex * 17 + u0;
    const rr = noise(seed, 3) < 0.5 ? 0 : 1;
    const fromRight = noise(seed, 4) < 0.4;
    const want = fromRight ? 'E' : 'W';
    keys.push({ t: u0, c: HOME, r, h });
    // the rock shows up: out from behind the time, or wrapping in at the edge
    const rc = fromRight ? 15 : SKY0;
    const shot = u0 + 1.4;
    const hitT = shot + 0.25;
    item(u0 + 0.2, hitT, rc, rr, ROCK);
    // the ship notices, turns, and gets in line
    let tt = u0 + 0.3;
    if (rr !== r) {
      keys.push({ t: tt, c: HOME, r, h });
      tt = turnTo(keys, tt, h, rr < r ? 'N' : 'S');
      keys.push({ t: tt + 0.2, c: HOME, r: rr, h: rr < r ? 'N' : 'S' });
      h = rr < r ? 'N' : 'S'; r = rr; tt += 0.2;
    }
    tt = turnTo(keys, tt, h, want); h = want;
    keys.push({ t: shot, c: HOME, r, h });
    shots.push({ t0: shot, c0: fromRight ? 14 : 12, dir: 0, r, until: hitT });
    item(hitT, hitT + 0.3, rc, rr, STAR);
    item(hitT + 0.3, hitT + 0.6, rc, rr, CHIP_A);
    item(hitT + 0.3, hitT + 0.6, rc, 1 - rr, CHIP_B);
    item(hitT + 0.6, hitT + 0.9, rc, rr, DOT);
    if (noise(seed, 5) < 0.35) { roll(keys, hitT + 0.3, h); }
    else if (noise(seed, 6) < 0.5) {
      // a look round, then back to watching the time
      keys.push({ t: hitT + 0.8, h: r ? 'N' : 'S' });
      keys.push({ t: hitT + 1.3, h: 'W' });
      h = 'W';
    }
    if (h !== 'W') { turnTo(keys, hitT + 1.6, h, 'W'); h = 'W'; }
  }

  // the approach to the next boundary
  if (next.hour) saucerScript(keys, items, shots, r, h);
  else {
    const a = 60 - 3;
    keys.push({ t: a, c: HOME, r, h: 'W' });
    if (r !== 1) {
      keys.push({ t: a + 0.2, h: 'S' });
      keys.push({ t: a + 0.4, c: HOME, r: 1, h: 'S' });
      keys.push({ t: a + 0.6, h: 'W' });
    }
    keys.push({ t: 60 - 1.6, c: HOME, r: 1, h: 'W' });
    keys.push({ t: 60 - 1.2, c: POST, r: 1, h: 'W' });
  }
  keys.push({ t: 61, c: POST, r: 1, h: 'W' });
  keys.sort((a, b) => a.t - b.t);
  return { keys, items, shots };
}

// The hour: the saucer. Minute-u times; the hour is at 60.
const S0 = 50;
function saucerScript(keys, items, shots, r, h) {
  const s = S0;
  const item = (t0, t1, c, rr, code) => items.push({ t0, t1, c, r: rr, code });
  keys.push({ t: s - 1.5, c: HOME, r, h });
  // up to the top row, facing the edge it is coming from
  let tt = turnTo(keys, s - 1.4, h, 'E');
  keys.push({ t: tt + 0.2, c: HOME, r, h: 'E' });
  keys.push({ t: tt + 0.4, c: HOME, r: 0, h: 'E' });
  // its shot: the saucer bobs down and the bullet goes over it
  shots.push({ t0: s + 2.0, c0: 14, dir: 1, r: 0, until: s + 2.2 });
  keys.push({ t: s + 2.4, h: 'S' });          // where did it go?
  keys.push({ t: s + 2.8, h: 'E' });
  // the saucer bobs up and fires back; the ship jumps to hyperspace
  shots.push({ t0: s + 3.4, c0: 14, dir: -1, r: 0, until: s + 3.8 });
  keys.push({ t: s + 3.45, c: HOME, r: 0, h: 'E', hide: 'out' });
  keys.push({ t: s + 3.7, c: HOME, r: 0, h: 'E', hide: true });
  // out at the far side of the sky, on the saucer's row, already facing it
  keys.push({ t: s + 4.6, c: SKY0, r: 1, h: 'E', hide: 'in' });
  keys.push({ t: s + 4.9, c: SKY0, r: 1, h: 'E' });
  shots.push({ t0: s + 5.3, c0: 12, dir: 1, r: 1, until: s + 5.5 });
  const b = s + 5.5, bc = 14;
  item(b, b + 0.35, bc, 1, STAR); item(b, b + 0.35, bc, 0, PEB);
  item(b + 0.35, b + 0.75, bc - 1, 1, CHIP_A); item(b + 0.35, b + 0.75, bc + 1, 0, CHIP_B);
  item(b + 0.35, b + 0.75, bc + 1, 1, CHIP_B);
  item(b + 0.75, b + 1.2, bc, 0, DOT); item(b + 0.75, b + 1.2, bc + 1, 1, PEB);
  item(b + 0.75, b + 1.2, bc - 1, 0, PEB);
  // a roll for the crowd, then round to the time and on to the post
  tt = roll(keys, b + 0.4, 'E');
  turnTo(keys, tt + 0.3, 'E', 'W');
  keys.push({ t: 60 - 2.0, c: SKY0, r: 1, h: 'W' });
  keys.push({ t: 60 - 1.4, c: POST, r: 1, h: 'W' });
}

// The saucer's path, in seconds after it arrives: [col, row] or null.
function saucerAt(s) {
  if (s < 0 || s >= 5.5) return null;
  if (s < 0.6) return [15, 0];
  if (s < 2.0) return [15, (Math.floor(s / 0.7) % 2)];   // warbling up and down
  if (s < 3.0) return [15, 1];                           // dodged under the shot
  if (s < 4.2) return [15, 0];                           // and fires back
  if (s < 4.8) return [14, 0];                           // creeping after it
  return [14, 1];                                        // ...into its sights
}

function poseAt(keys, u) {
  let c = POST, r = 1, h = 'W', hide = false, last = null;
  for (const k of keys) {
    if (k.t > u) {
      if (k.c !== undefined && last && !hide) {
        const f = (u - last.t) / (k.t - last.t);
        c = Math.round(last.c + (k.c - last.c) * f);
        r = Math.round(last.r + (k.r - last.r) * f);
      }
      if (k.c !== undefined) break;
      continue;
    }
    if (k.h !== undefined) h = k.h;
    if (k.c !== undefined) { c = k.c; r = k.r; last = k; hide = k.hide ?? false; }
  }
  return { c, r, h, hide };
}

// ------------------------------------------------------------------ frame
export const diag = { overflow: false, slots: 0 };

export default {
  name: 'Asteroids',
  blurb: 'The digits are big hollow rocks; each minute the ship shoots the old one, it splits in two and goes to dust, and the dust gathers into the next. On the hour, a saucer.',
  bus: 'i2c100',
  panel: 'green',
  fps: 10,

  frame(lcd, api, ctx) {
    const ms = ctx.date.getTime();
    const u = ctx.date.getSeconds() + ctx.date.getMilliseconds() / 1000;
    const mStart = ms - u * 1000;
    const phase = Math.floor(ms / 700);
    const st = new Stage(lcd);
    const busy = new Set();
    const at = (c, r) => r * 16 + c;
    const put = (c, r, what, force = false) => {
      if (c < 0 || c > 15) return;
      if (!force && busy.has(at(c, r))) return;
      st.put(c, r, what); busy.add(at(c, r));
    };
    const tiles = (d) => DIGIT[d].map((k) => (k ? rockRows(k, phase) : 0x20));
    const half = (d, side, c) => {        // one column of a digit at cell c
      const ts = tiles(d);
      put(c, 0, ts[side], true); put(c, 1, ts[2 + side], true);
    };

    const near = turnPlan(u < 30 ? mStart : mStart + 60000);
    const v = (ms - near.bms) / 1000;

    // ---- digits, and the ones splitting or gathering
    st.put(COLON, 0, PEB); st.put(COLON, 1, PEB);
    for (let i = 0; i < 4; i++) {
      const c0 = DIG[i], oldD = near.oldD[i], newD = near.newD[i];
      const [dl, dr] = DRIFT[i];
      if (oldD === newD || v < (near.hit[i] ?? 0)) {
        const d = oldD === newD || v < 0 ? (v < 0 ? oldD : newD) : oldD;
        half(d, 0, c0); half(d, 1, c0 + 1);
        continue;
      }
      const e = v - near.hit[i], g = v - near.form[i];
      if (e < SPLIT) { half(oldD, 0, dl); half(oldD, 1, dr); }
      else if (e < BURST) for (const c of [dl, dr]) { put(c, 0, STAR, true); put(c, 1, STAR, true); }
      else if (e < CHIPS) { put(dl, 0, CHIP_A, true); put(dl, 1, CHIP_B, true); put(dr, 0, CHIP_B, true); put(dr, 1, CHIP_A, true); }
      else if (e < DUST) { put(dl, 1, DOT, true); put(dr, 0, PEB, true); }
      if (g >= 0) {
        if (g < G_DUST) { put(dl, 0, PEB, true); put(dr, 1, DOT, true); }
        else if (g < G_CHIPS) { put(dl, 1, CHIP_A, true); put(dr, 0, CHIP_A, true); }
        else if (g < G_HALVES) { half(newD, 0, dl); half(newD, 1, dr); }
        else { half(newD, 0, c0); half(newD, 1, c0 + 1); }
      }
    }
    // the cells the time owns are off limits to the scenery from here on
    for (let i = 0; i < 4; i++) for (const c of [DIG[i], DIG[i] + 1]) { busy.add(at(c, 0)); busy.add(at(c, 1)); }
    busy.add(at(COLON, 0)); busy.add(at(COLON, 1));

    const sc = buildScript(mStart);

    // the ship, first: nothing in the sky draws over it
    const p = poseAt(sc.keys, u);
    if (p.hide === 'out') put(p.c, p.r, PEB);
    else if (p.hide === 'in') put(p.c, p.r, DOT);
    else if (!p.hide) put(p.c, p.r, SHIP[p.h]);

    // the minute's volley: a bullet down the bottom row to each digit
    for (const i of near.changed) {
      const target = DIG[i] + 1, h = near.hit[i], f = h - CELL_T * (11 - target);
      if (v < f || v >= h) continue;
      const c = 11 - Math.floor((v - f) / CELL_T + 1e-6);
      if (c > target) put(c, 1, PEB, true);
    }
    // scenery
    for (const it of sc.items) if (u >= it.t0 && u < it.t1) put(it.c, it.r, it.code);
    for (const s of sc.shots) if (u >= s.t0 && u < s.until) {
      const dir = s.dir || (s.c0 > HOME ? 1 : -1);
      put(s.c0 + dir * Math.floor((u - s.t0) / CELL_T + 1e-6), s.r, PEB);
    }
    if (near.hour && v < 0) {
      const sa = saucerAt(u - S0);
      if (sa) put(sa[0], sa[1], SAUCER);
    }
    const alloc = st.draw();
    diag.overflow = alloc.overflow; diag.slots = alloc.used;
  },
};
