// crossword: the puzzle page. Each hour is one newspaper page of sixty mini
// crosswords in six columns of ten; puzzle k is the one for minute k. This
// file lays out each mini (where the hour and minute answers sit, which
// three-letter downs knit them, the numbering and the clues) and writes the
// solver's script for it: the order the pencil fills the cells, when it
// reads a clue, when it gets a down wrong and rubs it out.
//
// Everything is a pure function of (hour, minute, minuteKey), cached.

import { hash, rand, noise, clamp, ease } from '../js/kit.js';
import { hourWord, minuteParts, enumOf, minuteClue, hourClue, bridges, WORDS3, HOURS } from './crossword-words.js';
import { layoutLetter, letterAt } from './crossword-hand.js';

export const CELL = 14;
export const GY = 11;                      // grid top inside a mini
export const MW = 176, MH = 96;            // mini pitch on the page
export const PW = 16 + 6 * MW, PH = 64 + 10 * MH;   // page size (1072 x 1024)
export const miniX = (k) => 16 + Math.floor(k / 10) * MW;
export const miniY = (k) => 64 + (k % 10) * MH;
export const CLUE_Y = [57, 64, 71];

const NUMBER_WORDS = new Set([...HOURS, 'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN', 'SEVENTEEN', 'EIGHTEEN', 'NINETEEN',
  'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'OCLOCK', 'TEEN']);

const NUMBER_LIST = [...NUMBER_WORDS].filter((w) => w.length >= 3);

const EDITIONS = (h) => (h >= 5 && h < 12 ? 'MORNING' : h >= 12 && h < 17 ? 'AFTERNOON' : h >= 17 && h < 21 ? 'EVENING' : 'LATE NIGHT');

// ------------------------------------------------------------ layout

const LAYOUTS = new Map();

/** The mini for `hour` (0-23) and minute k, seeded by its minute key. */
export function miniLayout(hour, k, key) {
  const id = `${hour}:${k}:${key}`;
  let L = LAYOUTS.get(id);
  if (L) return L;
  if (LAYOUTS.size > 400) LAYOUTS.clear();
  const H = hourWord(hour), parts = minuteParts(k), M = parts.join('');
  // Where the hour sits over the minute: as many downs as possible, centred.
  let best = null;
  for (let off = -(H.length - 1); off < M.length; off++) {
    const lo = Math.min(0, off), hi = Math.max(M.length, off + H.length);
    if (hi - lo > 11) continue;
    const cand = [];
    let last = -9;
    for (let c = Math.max(0, off); c < Math.min(M.length, off + H.length); c++)
      if (bridges(H[c - off], M[c]).length && c - last > 1) { cand.push(c); last = c; }
    const n = Math.min(3, cand.length);
    const score = n * 10 - Math.abs(off + H.length / 2 - M.length / 2) * 1.2 - (hi - lo) * 0.3 + rand(key, off + 50) * 1.5;
    if (!best || score > best.score) best = { off, lo, hi, cand, score };
  }
  const { off, lo, hi } = best;
  let cand = best.cand;
  if (cand.length > 3) cand = [cand[0], cand[Math.floor(cand.length / 2)], cand[cand.length - 1]];
  const ncol = hi - lo, hc = off - lo, mc = -lo;
  // Cells: row 0 hour, row 1 the downs' middles, row 2 the minute.
  const cell = [[], [], []];
  for (let c = 0; c < H.length; c++) cell[0][hc + c] = H[c];
  for (let c = 0; c < M.length; c++) cell[2][mc + c] = M[c];
  const downs = cand.map((c, i) => {
    const opts = bridges(H[c - off], M[c]);
    const word = opts[hash(key, 90 + i) % opts.length];
    const others = opts.filter((w) => w !== word);
    const wrongMid = others.length ? others[hash(key, 95 + i) % others.length][1]
      : 'AEIOU'.replace(word[1], '')[hash(key, 97 + i) % 4];
    cell[1][mc + c] = word[1];
    return { col: mc + c, word, wrong: wrongMid };
  });
  // Numbering, row-major, as a paper does it.
  const white = (r, c) => r >= 0 && r < 3 && c >= 0 && c < ncol && !!cell[r][c];
  const num = [[], [], []];
  let n = 0;
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < ncol; c++) {
      if (!white(r, c)) continue;
      const across = !white(r, c - 1) && white(r, c + 1), down = !white(r - 1, c) && white(r + 1, c);
      if (across || down) num[r][c] = ++n;
    }
  const gx = Math.floor(80 - (ncol * CELL + 1) / 2);
  const clueH = `${num[0][hc]}A ${hourClue(hour, key)} ${enumOf([H])}`;
  const clueM = `${num[2][mc]}A ${minuteClue(k, key)} ${enumOf(parts)}`;
  let clueD = '';
  for (const d of downs) {
    const s = `${num[0][d.col]}D ${WORDS3.get(d.word)} (3)`;
    if ((clueD ? clueD.length + 2 : 0) + s.length <= 40) {
      if (clueD) clueD += '  ';
      d.clueX = clueD.length * 4; d.clueW = s.length * 4;
      clueD += s;
    }
  }
  const h12 = hour % 12 || 12;
  L = {
    hour, k, key, H, M, parts, ncol, hc, mc, gx, cell, num, downs,
    header: `No.${hour * 60 + k}`, edition: EDITIONS(hour), h12,
    clues: [clueH, clueM, clueD],
  };
  LAYOUTS.set(id, L);
  return L;
}

/** World position of the top-left of cell (r, c) of mini L. */
export const cellXY = (L, r, c) => [miniX(L.k) + L.gx + c * CELL, miniY(L.k) + GY + r * CELL];

/** A hand-printed letter in a cell: slightly different every time it is written. */
function letterIn(L, r, c, ch, seed) {
  const [x0, y0] = cellXY(L, r, c);
  const numbered = !!L.num[r][c];
  const j = (i) => rand(seed, r * 16 + c, i) - 0.5;
  const ox = x0 + (numbered ? 4.8 : 3.4) + j(1) * 0.8, oy = y0 + (numbered ? 3.7 : 2.7) + j(2) * 0.6;
  const sx = (numbered ? 1.12 : 1.26) * (1 + j(3) * 0.07), sy = (numbered ? 1.06 : 1.14) * (1 + j(4) * 0.06);
  const slant = 0.1 + j(5) * 0.1, rot = j(6) * 0.08;
  return layoutLetter(ch, (u, v) => {
    const x = (u + (8 - v) * slant * 0.5) * sx, y = v * sy;
    return [ox + x - y * rot, oy + y + x * rot];
  });
}

// ------------------------------------------------------------ the solver's script

const SCRIPTS = new Map();
export const REST = (k) => ({ x: miniX(k) + 147, y: miniY(k) + 64, lift: 0.5, eraser: false, ang: 0.6 });
export const AWAY = (k) => ({ x: miniX(k) + 215, y: miniY(k) + 135, lift: 1, eraser: false, ang: 0.6 });

/** Script timing for mini k: when it starts (s from its minute's :00), and when the pencil must be back at rest. */
export const scriptStart = (k) => (k === 0 ? 2.7 : -0.95);
export const scriptEnd = (k) => (k === 59 ? 49.0 : 57.6);

/**
 * The solver's script for a mini: `ink`, every mark ever made in it
 * ({ r, c, ch, t0, t1, L, erase: [e0, e1] | null }), and `track`, the
 * pencil's segments in seconds from the minute's :00.
 */
export function miniScript(L) {
  const id = `${L.hour}:${L.k}:${L.key}`;
  let S = SCRIPTS.get(id);
  if (S) return S;
  if (SCRIPTS.size > 400) SCRIPTS.clear();
  const k = L.k, key = L.key;
  const ink = [], track = [];
  let T = scriptStart(k);
  let pose = k === 0 ? AWAY(k) : REST(k - 1);
  const start = pose;
  const seg = (o) => { o.from = o.from ?? pose; track.push(o); T = o.t1; if (o.to) pose = o.to; };
  const move = (to, dur, hop = 0.35) => seg({ type: 'move', t0: T, t1: T + dur, from: pose, to, hop });
  const P = (x, y, lift, extra = {}) => ({ x, y, lift, eraser: pose.eraser, ang: 0.58 + (extra.dang ?? 0), ...extra });
  const writeCell = (r, c, ch, speed = 1) => {
    const Lt = letterIn(L, r, c, ch, key * 7 + ink.length);
    const s0 = P(Lt.start[0], Lt.start[1], 0.12);
    const d = Math.hypot(s0.x - pose.x, s0.y - pose.y);
    move(s0, (0.06 + d * 0.0045) / speed, Math.min(0.5, 0.1 + d * 0.006));
    const dur = (0.07 + Lt.tot * 0.0062) / speed;
    const e = { r, c, ch, t0: T, t1: T + dur, L: Lt, erase: null };
    ink.push(e);
    seg({ type: 'write', t0: T, t1: T + dur, e, to: P(Lt.end[0], Lt.end[1], 0.1) });
    return e;
  };
  const hold = (until) => { if (until > T) seg({ type: 'hold', t0: T, t1: until, from: pose, seed: hash(key, track.length) }); };
  const rest = (dur = 0.5) => move(REST(k), dur, 0.25);

  // The first move comes in from wherever the pencil was.
  T -= 0.95;
  // 1. The hour, left to right, quickly: the solver knows this one.
  for (let i = 0; i < L.H.length; i++) {
    if (i === 0) {
      const Lt = letterIn(L, 0, L.hc, L.H[0], key * 7);
      move(P(Lt.start[0], Lt.start[1], 0.12), 0.95, 0.7);
    }
    writeCell(0, L.hc + i, L.H[i], 1.15);
  }
  // 2. The minute, in a solver's scattered order, never starting with a
  //    readable run (FORTY... is not 10:40), and never before :00.
  hold(Math.max(T, 0));
  const order = scatter(L, key);
  for (const i of order) writeCell(2, L.mc + i, L.M[i]);
  const answered = T;
  rest(0.45);

  // 3. The rest of the minute: the downs, a correction now and then, idling.
  const end = scriptEnd(k);
  const r = (i) => rand(key, 300 + i);
  const fidget = (until, i) => {
    // One small piece of business in a gap, then back to rest.
    if (until - T < 3.2) { hold(until); return; }
    const at = T + 0.5 + r(i) * (until - T - 3.0);
    hold(at);
    const kind = hash(key, 400 + i) % 4;
    const [mx0, my] = cellXY(L, 2, L.mc), mx1 = cellXY(L, 2, L.mc + L.M.length - 1)[0];
    if (kind === 0) {         // check the answer: hover along it
      move(P(mx0 + 7, my + 10, 0.4), 0.45);
      seg({ type: 'slide', t0: T, t1: T + 0.12 * L.M.length + 0.3, from: pose, to: P(mx1 + 8, my + 10, 0.4) });
      rest(0.5);
    } else if (kind === 1) {  // tap, tap: thinking
      seg({ type: 'tap', t0: T, t1: T + 1.1, from: pose, n: 3 });
    } else if (kind === 2) {  // re-read a clue
      const line = r(i + 20) < 0.5 ? 0 : 1;
      const y = miniY(k) + CLUE_Y[line] + 3;
      move(P(miniX(k) + 6, y, 0.4), 0.5);
      seg({ type: 'slide', t0: T, t1: T + 1.2, from: pose, to: P(miniX(k) + 4 + L.clues[line].length * 4, y, 0.4) });
      rest(0.5);
    } else {                  // a twirl of the wrist
      seg({ type: 'twirl', t0: T, t1: T + 1.4, from: pose });
    }
    hold(until);
  };
  const corrIdx = hash(key, 13) % 3 === 0 && L.downs.length ? 0 : -1;
  const slot = (end - answered - 4) / Math.max(1, L.downs.length + 0.6);
  L.downs.forEach((d, i) => {
    const at = answered + 4 + slot * (i + 0.35 + r(i + 40) * 0.3);
    fidget(at, i);
    // Read the down clue, then fill its middle.
    const y = miniY(k) + CLUE_Y[2] + 3;
    const cx0 = miniX(k) + (d.clueX ?? 0) + 4, cx1 = cx0 + Math.min(60, (d.clueW ?? 60) - 8);
    move(P(cx0, y, 0.4), 0.5);
    seg({ type: 'slide', t0: T, t1: T + 0.8, from: pose, to: P(cx1, y, 0.4) });
    if (i === corrIdx) {
      const bad = writeCell(1, d.col, d.wrong);
      const [cx, cy] = cellXY(L, 1, d.col);
      move(P(cx + 9, cy - 4, 0.55), 0.4);
      seg({ type: 'tap', t0: T, t1: T + 0.9, from: pose, n: 2 });
      hold(T + 0.4);
      // Turn the pencil round, out of shot.
      move({ ...AWAY(k), x: cx + 120, y: cy + 90 }, 0.42, 0.2);
      pose = { ...pose, eraser: true };
      move({ x: cx + 7.5, y: cy + 7.5, lift: 0, eraser: true, ang: 0.62 }, 0.45, 0.4);
      seg({ type: 'scrub', t0: T, t1: T + 1.1, from: pose });
      bad.erase = [T - 1.1, T];
      move({ x: cx + 120, y: cy + 90, lift: 1, eraser: true, ang: 0.6 }, 0.42, 0.2);
      pose = { ...pose, eraser: false };
      writeCell(1, d.col, d.word[1], 0.9);
    } else writeCell(1, d.col, d.word[1], 0.9);
    rest(0.5);
  });
  fidget(end - 0.3, 9);
  hold(end - 0.3);
  if (k === 59) move(AWAY(k), 0.9, 0.3);
  else rest(0.3);
  S = { ink, track, start, final: pose };
  SCRIPTS.set(id, S);
  return S;
}

/** The order the minute's letters are written in: scattered, with no early run that reads as a number. */
function scatter(L, key) {
  const n = L.M.length;
  for (let tries = 0; tries < 60; tries++) {
    const idx = [...Array(n).keys()];
    for (let i = n - 1; i > 0; i--) { const j = hash(key, tries, i) % (i + 1); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    if (safeOrder(L.M, idx)) return idx;
  }
  return [...Array(n).keys()].reverse();
}
function safeOrder(M, order) {
  const filled = new Array(M.length).fill(false);
  for (let s = 0; s < order.length - 1; s++) {
    filled[order[s]] = true;
    let run = '';
    for (let i = 0; i <= M.length; i++) {
      if (i < M.length && filled[i]) { run += M[i]; continue; }
      if (run.length >= 3 && NUMBER_LIST.some((w) => run.includes(w))) return false;
      run = '';
    }
  }
  return true;
}

// ------------------------------------------------------------ evaluating the pencil

const inOut = ease.inOutCubic;

/** The pencil's pose at time tau of a script: { x, y, lift, eraser, ang }. */
export function pencilAt(S, tau) {
  const tr = S.track;
  if (!tr.length || tau < tr[0].t0) return S.start;
  let sgm = tr[tr.length - 1];
  if (tau >= sgm.t1) return sgm.to ?? sgm.from;
  let lo = 0, hi = tr.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (tr[mid].t1 <= tau) lo = mid + 1; else hi = mid; }
  sgm = tr[lo];
  const u = clamp((tau - sgm.t0) / Math.max(1e-6, sgm.t1 - sgm.t0), 0, 1);
  const A = sgm.from;
  switch (sgm.type) {
    case 'move': {
      const B = sgm.to, w = inOut(u);
      return {
        x: A.x + (B.x - A.x) * w, y: A.y + (B.y - A.y) * w,
        lift: A.lift + (B.lift - A.lift) * w + sgm.hop * Math.sin(Math.PI * u),
        eraser: u < 0.5 ? A.eraser : B.eraser, ang: A.ang + (B.ang - A.ang) * w,
      };
    }
    case 'write': {
      return writePose(sgm, u);
    }
    case 'slide': {
      const B = sgm.to, w = ease.inOutQuad(u);
      return { ...A, x: A.x + (B.x - A.x) * w, y: A.y + (B.y - A.y) * w + Math.sin(u * 9) * 0.4, lift: A.lift };
    }
    case 'tap': {
      const ph = u * sgm.n;
      return { ...A, lift: Math.max(0, A.lift * Math.abs(Math.cos(Math.PI * ph))) };
    }
    case 'twirl': {
      return { ...A, ang: A.ang + 0.22 * Math.sin(Math.PI * u) * Math.sin(Math.PI * u * 2), lift: A.lift + 0.15 * Math.sin(Math.PI * u) };
    }
    case 'scrub': {
      const ph = u * 6;
      return { ...A, x: A.x + 2.6 * Math.sin(ph * 2 * Math.PI), y: A.y + 0.9 * Math.sin(ph * 4 * Math.PI + 1), lift: 0, ang: A.ang + 0.05 * Math.sin(ph * 2 * Math.PI) };
    }
    default: {   // hold: a resting hand is never quite still
      const t = tau, s = sgm.seed % 997;
      return {
        ...A,
        x: A.x + (noise(t * 0.5, s) - 0.5) * 3.2, y: A.y + (noise(t * 0.4, s + 1) - 0.5) * 2.4,
        lift: Math.max(0.15, A.lift + 0.1 * Math.sin(t * 1.9 + s)), ang: A.ang + (noise(t * 0.3, s + 2) - 0.5) * 0.1,
      };
    }
  }
}

function writePose(sgm, u) {
  const { tip } = letterAt(sgm.e.L, u);
  return { x: tip[0], y: tip[1], lift: tip[2], eraser: false, ang: sgm.from.ang + 0.04 * Math.sin(u * 6) };
}
