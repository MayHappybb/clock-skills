// receipt-slip: one minute's till slip as a 1-bit thermal print, plus the
// schedule the printer feeds it out on.
//
// The slip is a PW-wide strip, row 0 at the top (printed first). Each cell
// is 0 (no paper: the torn teeth at the top), 1 (paper) or 2 (ink). Each
// row is kept as runs [x, len, kind] so the face draws a row as a handful
// of 1-pixel-high fills, the way C would (memset spans), not per pixel.
//
// On the device the mask is ~2 KB of bits rebuilt once a minute.

import { font5x7, font3x5 } from '../js/kit.js';

export const PW = 108;          // paper width in pixels
export const TEETH = 3;         // rows of torn teeth at the top of every slip
const MAXH = 220;
const DEAD = 71;                // one burnt-out heating element: a white column through the print

/** Rows missing from the top of a fresh slip at column x (the tear bar's teeth, period 6). */
export const jag = (x) => [2, 1, 0, 0, 1, 2][((x % 6) + 6) % 6];

// ITF (interleaved 2 of 5): a real barcode for the digits HHMM.
const ITF = ['nnwwn', 'wnnnw', 'nwnnw', 'wwnnn', 'nnwnw', 'wnwnn', 'nwwnn', 'nnnww', 'wnnwn', 'nwnwn'];
const NARROW = 2, WIDE = 5;

function itfElements(digits) {
  const el = [];                                   // [isBar, width]
  for (const k of [1, 0, 1, 0]) el.push([k, NARROW]);
  for (let i = 0; i < digits.length; i += 2) {
    const a = ITF[+digits[i]], b = ITF[+digits[i + 1]];
    for (let j = 0; j < 5; j++) {
      el.push([1, a[j] === 'w' ? WIDE : NARROW]);
      el.push([0, b[j] === 'w' ? WIDE : NARROW]);
    }
  }
  el.push([1, WIDE], [0, NARROW], [1, NARROW]);
  return el;
}

/**
 * Build the slip for clock fields `f`.
 * @returns {{ h, rows, segs, total, tail }}  rows: runs per row; segs: feed schedule
 */
export function buildSlip(f) {
  const m = new Uint8Array(PW * MAXH).fill(1);
  const segs = [];               // { r0, r1, kind }
  let y = 0;
  const set = (x, yy, v) => { if (x >= 0 && x < PW && yy >= 0 && yy < MAXH) m[yy * PW + x] = v; };
  const seg = (h, kind) => { segs.push({ r0: y, r1: y + h, kind }); y += h; };
  const gap = (h) => seg(h, 'gap');

  const glyphs = (str, x, yy, sx = 1, sy = 1, v = 2, font = font5x7) => {
    let cx = x;
    for (const ch of str) {
      const gl = font.glyph(ch);
      if (gl) for (let j = 0; j < gl.h; j++) for (let i = 0; i < gl.w; i++)
        if (gl.data[j * gl.w + i] >= 0)
          for (let a = 0; a < sx; a++) for (let b = 0; b < sy; b++) set(cx + i * sx + a, yy + j * sy + b, v);
      cx += ((gl?.w ?? 5) + 1) * sx;
    }
  };
  const width = (str, sx = 1) => (str.length * 6 - 1) * sx;
  const line = (str, align = 'l', sy = 1) => {
    const w = width(str);
    const x = align === 'c' ? Math.floor((PW - w) / 2) : align === 'r' ? PW - 3 - w : 3;
    glyphs(str, x, y, 1, sy);
    seg(7 * sy, 'text');
  };
  const leader = (a, b) => {
    const n = 17 - a.length - b.length;
    line(a + '.'.repeat(Math.max(1, n)) + b);
  };
  const rule = () => {
    for (let x = 3; x < PW - 3; x++) if (x % 6 !== 2) set(x, y, 2);
    seg(1, 'text');
  };
  const reverse = (str) => {             // white-on-black band, the printer's inverse mode
    for (let j = 0; j < 11; j++) for (let x = 2; x < PW - 2; x++) set(x, y + j, 2);
    glyphs(str, Math.floor((PW - width(str)) / 2), y + 2, 1, 1, 1);
    seg(11, 'text');
  };

  // ---------------------------------------------------------------- content
  for (let j = 0; j < TEETH; j++) for (let x = 0; x < PW; x++) if (j < jag(x)) set(x, j, 0);
  gap(TEETH + 3);
  line('MINUTE MART', 'c', 2);
  gap(2);
  line('OPEN 24 HOURS', 'c');
  gap(3); rule(); gap(3);
  line(`${f.dow} ${f.dd} ${f.month} ${f.year}`);
  gap(2);
  const txn = String(f.h * 60 + f.m).padStart(4, '0');
  line(`TXN #${txn}   REG 2`);
  gap(3); rule(); gap(3);
  if (f.m === 0) {
    reverse(f.h === 0 ? 'END OF DAY' : 'END OF HOUR');
    gap(3);
    line(f.h === 0 ? '1440 MINUTES SOLD' : '60 MINUTES SOLD', 'c');
    gap(2);
    line('ALL SALES FINAL', 'c');
    gap(3); rule(); gap(3);
  }
  leader('HOURS', f.hh);
  gap(2);
  leader('MINUTES', f.mm);
  gap(3); rule(); gap(4);

  // The tail: what hangs flat above the slot once printing ends.
  const tail = y;
  line('TOTAL');
  gap(2);
  {
    // Big type: the 5x7 font at 3x wide, 4x tall (ESC/POS-style magnification);
    // the colon keeps only its two inked columns.
    const SX = 3, SY = 4;
    const parts = [f.hh[0], f.hh[1], ':', f.mm[0], f.mm[1]];
    const ws = parts.map((p) => (p === ':' ? 2 * SX : 5 * SX));
    const tot = ws.reduce((a, b) => a + b, 0) + 2 * SX + 2 * 2;
    let x = Math.floor((PW - tot) / 2);
    parts.forEach((p, i) => {
      if (p === ':') { glyphs(p, x - SX, y, SX, SY); x += ws[i] + 2; }
      else { glyphs(p, x, y, SX, SY); x += ws[i] + (i === 0 || i === 3 ? SX : 2); }
    });
    seg(7 * SY, 'big');
  }
  gap(3);
  {
    const el = itfElements(f.hh + f.mm);
    const w = el.reduce((a, [, n]) => a + n, 0);
    let x = Math.floor((PW - w) / 2);
    for (const [bar, n] of el) {
      if (bar) for (let j = 0; j < 9; j++) for (let i = 0; i < n; i++) set(x + i, y + j, 2);
      x += n;
    }
    seg(9, 'bar');
  }
  gap(3);
  line('THANK YOU', 'c');
  gap(3);
  const h = y;

  // The dead element: nothing prints in its column.
  for (let r = 0; r < h; r++) if (m[r * PW + DEAD] === 2) m[r * PW + DEAD] = 1;

  // Runs per row.
  const rows = [];
  for (let r = 0; r < h; r++) {
    const runs = [];
    let x = 0;
    while (x < PW) {
      const v = m[r * PW + x];
      let e = x + 1;
      while (e < PW && m[r * PW + e] === v) e++;
      if (v) runs.push(x, e - x, v);
      x = e;
    }
    rows.push(runs);
  }

  // Feed schedule: text lines at the head's print speed with a breath
  // after each, blank paper slewed through fast.
  const SPEED = { gap: 170, text: 80, big: 46, bar: 60 };
  const PAUSE = { gap: 0, text: 0.05, big: 0.12, bar: 0.08 };
  let t = 0;
  const sched = [];
  for (const s of segs) {
    const a = Math.max(s.r0, TEETH), b = s.r1;
    if (b <= a) continue;
    const d = (b - a) / SPEED[s.kind];
    sched.push({ t0: t, t1: t + d, l0: a, l1: b, kind: s.kind });
    t += d + PAUSE[s.kind];
  }
  // The last TEETH rows as they look once torn off: the complement of the
  // next slip's teeth (row k from the bottom survives where k >= TEETH - jag).
  const torn = [];
  for (let r = h - TEETH; r < h; r++) {
    const k = h - 1 - r, runs = [];
    let x = 0;
    while (x < PW) {
      const keep = (xx) => k >= TEETH - jag(xx) && m[r * PW + xx] !== 0;
      if (!keep(x)) { x++; continue; }
      const v = m[r * PW + x];
      let e = x + 1;
      while (e < PW && keep(e) && m[r * PW + e] === v) e++;
      runs.push(x, e - x, v);
      x = e;
    }
    torn.push(runs);
  }
  return { h, rows, torn, sched, total: t, tail: h - tail };
}

/** Paper out of the slot (rows) `e` seconds after printing started, and whether the head is busy. */
export function fedAt(slip, e) {
  if (e <= 0) return { L: TEETH, busy: false, kind: null };
  for (const s of slip.sched) {
    if (e < s.t0) return { L: s.l0, busy: false, kind: null };           // a pause between lines
    if (e < s.t1) return { L: s.l0 + (s.l1 - s.l0) * (e - s.t0) / (s.t1 - s.t0), busy: true, kind: s.kind };
  }
  return { L: slip.h, busy: false, kind: null };
}

// tiny 3x5 kept available for the printer's own label
export { font3x5 };
