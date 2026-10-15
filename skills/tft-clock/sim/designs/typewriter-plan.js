// Typewriter: the typist's minute, as a script. Built once per minute (and
// cached): when every slug of the new figures is struck (a light pass, then
// the firm one), when the log's keys fall, when the bell rings, the carriage
// returns and the paper feeds, when the old figure is corrected away, and
// where the type guide is at every moment (keyframes). frame() only looks
// things up in it, so any instant can be drawn cold.

import { rand, clockFields } from '../js/kit.js';
import { FIG, SLUG } from './typewriter-type.js';
import { logLine, hourLine } from './typewriter-log.js';

export const X0 = 2, Y0 = 0, CW = 5, CH = 7;
export const cellX = (c) => X0 + c * CW;
export const rowY = (r) => Y0 + r * CH;

/** Where the figures sit: hours high on the left, minutes a line and a half lower on the right. */
export const SLOTS = [{ c: 1, r: 1 }, { c: 8, r: 1 }, { c: 17, r: 3 }, { c: 24, r: 3 }];
/** The colon: two bold slugs, struck with the figures. */
export const COLON = { c: 15, r: 4, cells: [0, 2] };
export const LOG = { c: 1, w: 14, r: 9 };
export const RULE = { r: 0, c0: 0, c1: 30 };
export const THWACK = [57.5, 58.05, 58.6, 59.15];
export const SHEET_OUT = 58.9, SHEET_DUR = 1.25;

const RULES = ['*-', '=-', '~', '+-', 'o-', '<>', '.:', '-=', '*', '/\\', 'x-', '()'];

export const digitsOf = (f) => [+f.hh[0], +f.hh[1], +f.mm[0], +f.mm[1]];

/** The header: an ornament of repeated characters with the date set in it. */
export function ruleText(f) {
  const pat = RULES[f.h % 12], n = RULE.c1 - RULE.c0 + 1;
  const date = ` ${f.dow} ${f.day} ${f.month} `;
  const chars = [];
  for (let i = 0; i < n; i++) chars.push(pat[i % pat.length]);
  const at = 18 - RULE.c0;
  for (let i = 0; i < date.length; i++) chars[at + i] = date[i];
  return chars;
}

/** The slugs of the given slots, line by line across the sheet: [slot, cell, col, row]. */
function rowsOf(slots, D, withColon) {
  const rows = [];
  for (let R = 0; R < 11; R++) {
    const cells = [];
    for (const s of slots) {
      const S = SLOTS[s], rr = R - S.r;
      if (s === 2 && withColon) {
        const cr = R - COLON.r;
        if (COLON.cells.includes(cr)) cells.push([4, cr, COLON.c, R]);
      }
      if (rr < 0 || rr >= 7) continue;
      for (let i = 0; i < 6; i++) if (FIG[D[s]][rr * 6 + i]) cells.push([s, rr * 6 + i, S.c + i, R]);
    }
    if (cells.length) rows.push(cells);
  }
  return rows;
}

export function buildPlan(mk) {
  const date = new Date(mk * 60000);
  const f = clockFields(date), p = clockFields(new Date(date.getTime() - 60000)), n = clockFields(new Date(date.getTime() + 60000));
  const D = digitsOf(f), DP = digitsOf(p), DN = digitsOf(n);
  const hourIn = f.m === 0, hourOut = n.m === 0;
  const typed = hourIn ? [0, 1, 2, 3] : [0, 1, 2, 3].filter((s) => D[s] !== DP[s]);
  const erased = hourOut ? [] : [0, 1, 2, 3].filter((s) => D[s] !== DN[s]);
  const plan = {
    mk, f, D, hourIn, hourOut, typed, erased,
    tA: [], tB: [], keys: [], lines: [], ruleT: null, ruleDt: 0, rule: ruleText(f), showFrom: 0, hideFrom: 99,
  };
  for (const s of typed) { plan.tA[s] = new Float32Array(42).fill(1e9); plan.tB[s] = new Float32Array(42).fill(1e9); }
  if (hourIn) { plan.tA[4] = new Float32Array(3).fill(1e9); plan.tB[4] = new Float32Array(3).fill(1e9); }

  // the type guide's path
  let T = 0, cx = 0, cy = 0, cw = CW, chh = CH;
  const key = (e) => plan.keys.push({ t: T, x: cx, y: cy, w: cw, h: chh, e });
  const moveTo = (x, y, dur, e = 1, w = CW, h = CH) => {
    key(0); T += dur; cx = x; cy = y; cw = w; chh = h; key(e);
  };
  const travel = (x, y) => { const d = Math.hypot(x - cx, y - cy); if (d > 0.5) moveTo(x, y, 0.15 + d / 95, 1); };

  // the figures: a light strike of every slug line by line (a zip), then the firm run
  const rows = rowsOf(typed, D, hourIn);
  const first = rows[0][0];
  T = hourIn ? SHEET_OUT + SHEET_DUR - 60 : 0;
  plan.showFrom = T;
  cx = cellX(first[2]); cy = rowY(first[3]); key(0);
  const pass = (arr, dt, crDur) => {
    rows.forEach((cells) => cells.forEach(([s, i, c, R], k) => {
      const x = cellX(c), y = rowY(R);
      if (x !== cx || y !== cy) {
        if (k === 0) moveTo(x, y, crDur, 1);
        else moveTo(x, y, ((x - cx) / CW) * dt, 0);
      }
      arr[s][i] = T;
    }));
  };
  pass(plan.tA, hourIn ? 1 / 480 : 1 / 240, hourIn ? 1 / 120 : 1 / 60);
  moveTo(cellX(first[2]), rowY(first[3]), 0.2, 1);
  pass(plan.tB, hourIn ? 0.028 : 0.03, 0.1);

  // the hour: the header ornament across the top, then the hour in words
  if (hourIn) {
    travel(cellX(RULE.c0), rowY(RULE.r));
    plan.ruleT = T; plan.ruleDt = 0.04;
    moveTo(cellX(RULE.c1 + 1), rowY(RULE.r), (RULE.c1 - RULE.c0 + 1) * plan.ruleDt, 0);
  }

  // the log
  const ly = rowY(LOG.r);
  for (let k = 0; k < 16; k++) {
    const keys = k === 0 && hourIn ? [...hourLine(f.h)].map((ch, i) => [i, ch, 0]).filter((k) => k[1] !== ' ') : logLine(f.h, rand(mk, k, 11), rand(mk, k, 12), LOG.w);
    const need = keys.length * 0.17 + 2.4 + (k === 0 ? 1.2 : 0);
    if (T + need > (hourOut ? 55.5 : 55.4)) break;
    if (k === 0) travel(cellX(LOG.c + keys[0][0]), ly);
    T += 0.4 + rand(mk, k, 13) * 1.2;
    const line = { keys: [], bell: -1, lf0: 0, lf1: 0 };
    keys.forEach(([col, ch, isX], j) => {
      const x = cellX(LOG.c + col);
      if (x !== cx) moveTo(x, ly, Math.min(0.06, Math.abs(x - cx) / CW * 0.05) + (x < cx ? 0.04 * Math.abs(x - cx) / CW : 0), 0);
      line.keys.push({ col, ch, t: T });
      if (line.bell < 0 && col >= 9) line.bell = T;
      const r = rand(mk, k * 31 + j, 14);
      T += isX ? 0.07 : 0.08 + r * 0.11 + (keys[j + 1] && keys[j + 1][0] > col + 1 ? 0.12 : 0) + (r > 0.93 ? 0.4 : 0);
      // after a typo: a pause, then back over the word
      if (!isX && keys[j + 1] && keys[j + 1][2] && !keys[j][2]) T += 0.5;
    });
    // escapement after the last key, a beat, then the return and the feed
    moveTo(cx + CW, ly, 0.06, 0);
    T += 0.3;
    moveTo(cellX(LOG.c), ly, 0.9, 1);
    line.lf0 = T - 0.4; line.lf1 = T;
    plan.lines.push(line);
  }

  // the end of the minute: to the old figures, the correction, then onto the next figure's first slug
  T = Math.max(T, 55.6);
  if (hourOut) {
    travel(cellX(31), rowY(1));
    plan.hideFrom = Math.max(T, 58.3);
  } else {
    const xs = erased.map((s) => SLOTS[s].c), x0 = Math.min(...xs), x1 = Math.max(...xs) + 6;
    const ys = erased.map((s) => SLOTS[s].r), y0 = Math.min(...ys), y1 = Math.max(...ys) + 7;
    travel(cellX(x0), rowY(y0));
    moveTo(cellX(x0), rowY(y0), 0.4, 1, (x1 - x0) * CW - 1, (y1 - y0) * CH - 1);
    T = Math.max(T, THWACK[THWACK.length - 1] + 0.25);
    key(0);
    const nf = rowsOf(erased, DN, false)[0][0];
    moveTo(cellX(nf[2]), rowY(nf[3]), 60 - T, 1);
  }
  plan.end = T;
  return plan;
}

const CACHE = new Map();
export function getPlan(mk) {
  let p = CACHE.get(mk);
  if (!p) {
    p = buildPlan(mk);
    CACHE.set(mk, p);
    if (CACHE.size > 4) CACHE.delete(CACHE.keys().next().value);
  }
  return p;
}

export { SLUG };
