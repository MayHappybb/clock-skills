// Waterfall: a graphical water curtain held still by a strobe.
//
// A row of valves can make only two marks: held open, a nozzle pours a
// vertical stream; pulsed, it lets go one drop. Nozzles sit on a fixed
// pitch but a valve can open at any instant, so every numeral here is drawn
// in exactly that language: x locked to the nozzle row, y free. Verticals
// are streams (beads run down each one), horizontals and curves are
// drops placed at the heights a valve would time them. A strobe locks the
// curtain in mid-air.
//
// Two tiers off one stepped pipe. The hours hang small from the upper run,
// the minutes big from the lower run over the pool; every nozzle weeps a
// little between its marks. Between the tiers a nozzle drips once a second
// into a shishi-odoshi, a bamboo tube that fills over the hour.
//
// Minute turn: the changing curtain is let go and falls, streams breaking
// into beads, and splashes into the pool; then jets throw the new numeral
// up out of the water, each mark decelerating to the top of its arc, where
// the strobe catches it and its jet falls away.
// Hour turn: the hour falls into the full bamboo, which tips and pours into
// the pool, the minutes fall with it; the minutes are thrown back up, the
// bamboo swings back and clacks on its stone, then the new hour rises.
//
// Pure function of the clock: every drop's position is closed-form
// ballistics from the start of the minute.

import { clamp, ease, orbit, previousMinute, clockFields, noise, dither } from '../js/kit.js';

// ------------------------------------------------------------------ type
// Each digit: six nozzle columns; each column a list of marks on a 36-row
// box. [y] is a drop (4 rows from y), [y0, y1] a stream (rows y0..y1).
export const GLYPH = {
  0: [[[6, 29]], [[1], [31]], [[0], [32]], [[0], [32]], [[1], [31]], [[6, 29]]],
  1: [[], [[7], [32]], [[3], [32]], [[0, 35]], [[32]], [[32]]],
  2: [[[6], [32]], [[2], [28], [32]], [[0], [24], [32]], [[0], [20], [32]], [[2], [16], [32]], [[6, 13], [32]]],
  3: [[[4], [28]], [[1], [31]], [[0], [16], [32]], [[0], [16], [32]], [[1], [16], [31]], [[5, 13], [20, 29]]],
  4: [[[19, 27]], [[14], [24]], [[9], [24]], [[4], [24]], [[0, 35]], [[24]]],
  5: [[[0, 15], [29]], [[0], [13], [32]], [[0], [12], [32]], [[0], [12], [32]], [[0], [14], [31]], [[18, 29]]],
  6: [[[7, 29]], [[2], [15], [31]], [[0], [13], [32]], [[0], [13], [32]], [[1], [15], [31]], [[4], [19, 29]]],
  7: [[[0, 5]], [[0]], [[0], [21, 35]], [[0], [17]], [[0], [12]], [[0, 9]]],
  8: [[[5, 11], [20, 29]], [[1], [14], [31]], [[0], [15], [32]], [[0], [15], [32]], [[1], [14], [31]], [[5, 11], [20, 29]]],
  9: [[[6, 14], [28]], [[1], [18], [31]], [[0], [19], [32]], [[0], [19], [32]], [[1], [18], [31]], [[6, 28]]],
};

// Two sizes of the same valve language.
const BIG = { pitch: 5, w: 4, sy: 0.95, dropH: 4 };
const SMALL = { pitch: 4, w: 3, sy: 0.64, dropH: 3 };

/** The marks of digit `d` at (x, y) in size `S`, in glass pixels. */
export function marks(d, x, y, S) {
  const out = [];
  GLYPH[d].forEach((col, c) => {
    for (const m of col) {
      const drop = m.length === 1;
      const y0 = y + Math.round(m[0] * S.sy);
      const y1 = drop ? y0 + S.dropH - 1 : y + Math.round((m[1] + 1) * S.sy) - 1;
      out.push({ c, x: x + c * S.pitch, y0, y1, drop, w: S.w });
    }
  });
  return out;
}

const DROP = {
  3: ['.#.', '###', '###'],
  4: ['.##.', '####', '####', '.##.'],
  2: ['##', '##', '##'],
};

/** One mark, moved down by dy, drawn only above row `cut` (a water line). */
export function drawMark(g, m, dy, cut, t, seed = 0, beads = 0) {
  const y0 = Math.round(m.y0 + dy), y1 = Math.round(m.y1 + dy);
  if (m.drop) {
    for (let r = 0; r <= y1 - y0; r++) {
      const y = y0 + r;
      if (y >= cut) break;
      for (let i = 0; i < m.w; i++) {
        if ((DROP[m.w][r] ?? '').charAt(i) === '.') continue;
        g.pixel(m.x + i, y);
      }
    }
    return;
  }
  // A stream: tapered at the valve end, round at the foot, and necks
  // (Rayleigh beading) running down it at the speed of the water.
  const w = m.w;
  const gap = Math.min(3, Math.floor(beads));
  for (let y = y0; y <= y1 && y < cut; y++) {
    // in flight a stream breaks up into beads (Plateau-Rayleigh)
    if (gap && (y - y0) % (4 + gap) >= 4) continue;
    const ph = (((y - y0) - t * 22 + seed * 5) % 9 + 9) % 9;
    const neck = w >= 4 && ph < 1 && y > y0 + 2 && y < y1 - 2;
    const end = y === y0 || y === y1;
    for (let i = 0; i < w; i++) {
      const edge = i === 0 || i === w - 1;
      if (w >= 3 && edge && (w >= 4 ? (end || neck) : y === y0)) continue;
      g.pixel(m.x + i, y);
    }
  }
}

/** For review: all ten digits, both sizes. */
export function specimen(g, t = 0) {
  for (let d = 0; d < 10; d++) {
    const x = 6 + (d % 5) * 52, y = 4 + Math.floor(d / 5) * 44;
    for (const m of marks(String(d), x, y, BIG)) drawMark(g, m, 0, 999, t, m.c);
    for (const m of marks(String(d), 4 + d * 26, 94, SMALL)) drawMark(g, m, 0, 999, t, m.c);
  }
}


// ------------------------------------------------------------------ scene
const G = 240;                       // gravity, px/s^2
const POOL = 54;                     // the water line
const HX = [1, 24], HY = 7;          // hour digits (small)
const MX = [61, 95], MY = 18;
const UPPER = 1, LOWER = 12, STEP = 55;   // the pipe: upper run, lower run, the elbow between         // minute digits (big)
const DRIP_X = 50, DRIP_Y = 4;       // the seconds nozzle
const PIV = [33, 45], TUBE_L = 34, TUBE_R = 3, REST = 0.38, TIPPED = -0.25;
const DAY = 0xcf, NIGHT_C = 0x1c;

const fall = (h) => Math.sqrt((2 * Math.max(0, h)) / G);

/** Bamboo angle and how full it is, at second `sec` of minute `m` (hour turn at tau). */
function bamboo(m, sec, tau) {
  let fill = (m * 60 + sec) / 3600, a = REST - 0.05 * fill;
  if (tau !== null) {
    if (tau < 0) fill = Math.min(1, fill + 0.4 * clamp((tau + 1.6) / 0.4, 0, 1));
    const full = REST - 0.05;
    if (tau < -1.15) a = full;
    else if (tau < -0.65) a = full + (TIPPED - full) * ease.inQuad((tau + 1.15) / 0.5);
    else if (tau < 0.9) a = TIPPED + 0.02 * Math.sin((tau + 0.65) * 9) * Math.exp(-(tau + 0.65) * 3);
    else if (tau < 1.4) a = TIPPED + (REST - TIPPED) * ease.inQuad((tau - 0.9) / 0.5);
    else if (tau < 1.9) a = REST + 0.05 * Math.sin(Math.PI * (tau - 1.4) / 0.5) * (1 - (tau - 1.4) / 0.5);
    else a = REST;
    if (tau > -0.8) fill = tau < 0 ? fill * clamp(-tau / 0.8, 0, 1) : sec / 3600;
  }
  return { a, fill };
}

function tubeEnds(a, ox, oy) {
  const ux = Math.cos(a), uy = -Math.sin(a);
  const px = PIV[0] + ox, py = PIV[1] + oy;
  return { bx: px - 0.45 * TUBE_L * ux, by: py - 0.45 * TUBE_L * uy,
    mx: px + 0.55 * TUBE_L * ux, my: py + 0.55 * TUBE_L * uy, ux, uy, px, py };
}

/** Top of the bamboo at column x (Infinity off its ends). */
function tubeTop(T, x) {
  const s = (x - T.bx) / T.ux;
  if (s < 0 || s > TUBE_L) return Infinity;
  return T.by + s * T.uy - TUBE_R / T.ux;
}

function drawBamboo(g, T, fill) {
  const R = TUBE_R + 0.5, L = TUBE_L;
  const x0 = Math.floor(Math.min(T.bx, T.mx) - 6), x1 = Math.ceil(Math.max(T.bx, T.mx) + 6);
  const y0 = Math.floor(Math.min(T.by, T.my) - 6), y1 = Math.ceil(Math.max(T.by, T.my) + 6);
  const water = fill * L * 0.82;
  const NODES = [L * 0.3, L * 0.63];
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - T.bx, dy = y + 0.5 - T.by;
      const s = dx * T.ux + dy * T.uy, n = -dx * T.uy + dy * T.ux;   // n > 0 below the axis
      const d = Math.abs(n);
      // the mouth is cut on the slant: the upper lip reaches further
      const end = L - (n + R) * 0.85;
      const node = NODES.some((k) => Math.abs(s - k) < 0.8) && d <= R + 1;
      if (!node && (s < -1.3 || s > end + 1.3 || d > R + 1.3)) continue;
      g.pixel(x, y, 0);                                   // the tube hides what is behind it
      if (!node && (s < -0.3 || s > end || d > R)) continue;
      const shell = d > R - 1.1;
      const rim = s > end - 1.1 || s < 0.8;
      const wet = s < water && d < R - 1.1 && (s > water - 1.5 || dither(x, y, 0.5));
      if (shell || node || rim || wet) g.pixel(x, y);
    }
}

const STONE = ['..#####...', '.########.', '##########'];

/** Every mark leaving and arriving at one turn, with its schedule and splashes. */
function plan(A, B, hourTurn, ox, oy) {
  const leaves = [], arrives = [], events = [];
  const surf = POOL + oy;
  const slot = (oldD, newD, x, y, S, rel, rise, force, key) => {
    if (oldD === newD && !force) return;
    const first = {};
    for (const m of marks(oldD, x + ox, y + oy, S)) {
      const tr = rel + 0.12 * noise(m.x * 3 + m.y0, key);
      leaves.push({ m, tr, small: S === SMALL });
      const th = tr + fall(surf - m.y1 - 1);
      if (S !== SMALL && !(first[m.c] <= th)) first[m.c] = th;
    }
    for (const c in first) events.push({ x: x + ox + c * S.pitch + 2, t: first[c], k: 0.8 });
    const launch = {};
    for (const m of marks(newD, x + ox, y + oy, S)) {
      const fl = fall(surf - m.y0);
      const ta = rise + m.c * 0.06 + 0.05 * noise(m.x + m.y0 * 5, key + 1) + fl;
      arrives.push({ m, ta, tl: ta - fl });
      if (!(launch[m.c] <= ta - fl)) launch[m.c] = ta - fl;
    }
    for (const c in launch) events.push({ x: x + ox + c * S.pitch + S.w / 2, t: launch[c], k: 0.4 });
  };
  const H = hourTurn;
  slot(A.hh[0], B.hh[0], HX[0], HY, SMALL, H ? -1.75 : 0, H ? 1.6 : 0, H, 11);
  slot(A.hh[1], B.hh[1], HX[1], HY, SMALL, H ? -1.7 : 0, H ? 1.75 : 0, H, 12);
  slot(A.mm[0], B.mm[0], MX[0], MY, BIG, H ? -1.55 : -0.85, H ? 0.1 : 0.02, H, 13);
  slot(A.mm[1], B.mm[1], MX[1], MY, BIG, H ? -1.45 : -0.8, H ? 0.25 : 0.12, H, 14);
  if (H) {
    for (let i = 0; i < 6; i++) events.push({ x: 0, pour: true, t: -0.7 + i * 0.22, k: 1.1 - i * 0.12 });
    events.push({ x: 18 + ox, t: 1.4, k: 0.9, clack: true });
  }
  return { leaves, arrives, events };
}

/** A splash: spray thrown up from the water line, and a ring spreading on it. */
function splashSpray(g, e, age, surf) {
  const n = Math.round(1 + 2.5 * e.k);
  for (let i = 0; i < n; i++) {
    const vx = (noise(i, e.x * 7 + e.t * 13) - 0.5) * 60 * e.k;
    const vy = (35 + 55 * noise(i + 9, e.x * 3 + e.t * 17)) * e.k;
    const x = e.x + vx * age, y = surf - (vy * age - 0.5 * G * age * age);
    if (y < surf - 0.5) g.pixel(x, y);
  }
}

function ring(g, x0, age, k, surf, lift) {
  const life = 1.1 * k + 0.3;
  if (age < 0 || age > life) return;
  const r = 2 + 15 * age, fade = age / life;
  const steps = Math.ceil(r * 2.4);
  for (let i = 0; i <= steps; i++) {
    const phi = (Math.PI * i) / steps;
    if (noise(i, Math.floor(x0 * 10)) < fade) continue;
    const x = x0 + r * Math.cos(phi);
    const y = surf + 1 + 2 * Math.round(0.14 * r * Math.sin(phi));
    if (y < 64) g.pixel(x, y);
  }
  const l = Math.round(x0 - r), rr = Math.round(x0 + r);
  if (fade < 0.7) { lift[l] = 1; lift[rr] = 1; }
}

function trail(g, m, dy, len, below, cut) {
  if (len < 1) return;
  const cx = m.x + (m.w >= 3 ? 1 : 0), w = m.w >= 4 ? 2 : 1;
  const ya = below ? Math.round(m.y1 + dy) + 1 : Math.round(m.y0 + dy - len);
  const yb = below ? Math.round(m.y1 + dy + len) : Math.round(m.y0 + dy) - 1;
  for (let y = ya; y <= yb && y < cut; y++)
    for (let i = 0; i < w; i++) if (!below || (y - ya) % 2 === 0 || y === ya) g.pixel(cx + i, y);
}

function drawPipe(g, ox, oy, t) {
  // Upper run, an elbow down, the lower run: water steps down from the
  // hours' tier to the minutes'. A glint slides along it: the flow inside.
  const run = (x0, x1, y, cap0, cap1) => {
    for (let x = x0; x <= x1; x++) {
      const gap = ((x - t * 9) % 23 + 23) % 23 < 1 && x > x0 + 2 && x < x1 - 2;
      if (!gap) g.pixel(x + ox, y + oy);
      g.pixel(x + ox, y + 2 + oy);
    }
    if (cap0) g.pixel(x0 - 1 + ox, y + 1 + oy);
    if (cap1) g.pixel(x1 + 1 + ox, y + 1 + oy);
  };
  run(1, STEP - 1, UPPER, true, false);
  run(STEP + 3, 126, LOWER, false, true);
  for (let y = UPPER; y <= LOWER + 2; y++) {
    if (y >= UPPER + 2) g.pixel(STEP + ox, y + oy);
    if (y <= LOWER) g.pixel(STEP + 2 + ox, y + oy);
  }
  g.pixel(STEP + 1 + ox, UPPER + oy);
  const nub = (x, w, y) => { for (let i = 0; i < w; i++) g.pixel(x + ox + i, y + 3 + oy); };
  for (const x of HX) for (let c = 0; c < 6; c++) nub(x + c * SMALL.pitch, SMALL.w, UPPER);
  for (const x of MX) for (let c = 0; c < 6; c++) nub(x + c * BIG.pitch + 1, 2, LOWER);
  nub(DRIP_X, 2, UPPER);
}

export default {
  name: 'Waterfall',
  blurb: 'A graphical water curtain held in a strobe: valves pour streams and drops into numerals; each minute the curtain lets go into the pool and the jets throw the next one up; a drip a second fills the bamboo that tips the hour.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  driver: 'full',

  frame(g, { fields: f, date, oled, night }) {
    oled.contrast(DAY + (NIGHT_C - DAY) * night);
    const [ox, oy] = orbit(date, 2, 3);
    const sec = f.sec, t = (date.getTime() % 86400000) / 1000;
    const surf = POOL + oy;

    // Which turn, if any, is in progress.
    let A = f, B = f, mu = null;
    if (sec >= 57) { B = clockFields(new Date(date.getTime() + 60000)); mu = sec - 60; }
    else if (sec < 4) { A = previousMinute(date); mu = sec; }
    const hourTurn = mu !== null && B.m === 0;
    const P = mu !== null ? plan(A, B, hourTurn, ox, oy) : null;
    const tau = hourTurn ? mu : null;
    const bm = mu !== null && mu < 0 ? A : f;
    const { a, fill } = bamboo(bm.m, mu !== null && mu < 0 ? sec : sec, tau);
    const T = tubeEnds(a, ox, oy);

    // Static digits: every slot not taking part in a turn.
    const slots = [
      [0, 'hh', HX[0], HY, SMALL], [1, 'hh', HX[1], HY, SMALL],
      [0, 'mm', MX[0], MY, BIG], [1, 'mm', MX[1], MY, BIG],
    ];
    const drawStatic = (small) => {
      for (const [i, k, x, y, S] of slots) {
        if ((S === SMALL) !== small) continue;
        const moving = mu !== null && (hourTurn || A[k][i] !== B[k][i]);
        if (moving) continue;
        for (const m of marks(B[k][i], x + ox, y + oy, S)) drawMark(g, m, 0, surf, t, m.c + m.x);
      }
    };
    const drawTurn = (small) => {
      if (!P) return;
      for (const L of P.leaves) {
        if (L.small !== small) continue;
        const m = L.m;
        const cut = small ? Math.min(surf, tubeTop(T, m.x + m.w / 2) + 1) : surf;
        if (mu < L.tr) { drawMark(g, m, 0, cut, t, m.c + m.x); continue; }
        const u = mu - L.tr, dy = 0.5 * G * u * u;
        if (m.y0 + dy >= cut) continue;
        drawMark(g, m, dy, cut, t, m.c + m.x, u * 10);
        if (m.drop) trail(g, m, dy, Math.min(6, (G * u) / 40), false, cut);
      }
      for (const R of P.arrives) {
        if ((R.m.w < 4) !== small || mu < R.tl) continue;
        const m = R.m;
        const jx = m.x + (m.w >= 4 ? 1 : 0);
        if (mu >= R.ta) {
          drawMark(g, m, 0, surf, t, m.c + m.x);
          // the jet that threw it falls away beneath it
          const u = mu - R.ta, top = m.y1 + 2 + 0.5 * G * u * u;
          for (let y = Math.round(top); y < surf; y++) g.pixel(jx + (m.w >= 4 ? (y & 1) : 0), y);
          continue;
        }
        const u = R.ta - mu, dy = 0.5 * G * u * u;
        drawMark(g, m, dy, surf, t, m.c + m.x, u * 8);
        // the jet under it, up from the pool
        for (let y = Math.round(m.y1 + dy) + 1; y < surf; y++) g.pixel(jx + (m.w >= 4 ? (y & 1) : 0), y);
      }
    };

    // Every nozzle weeps a little between its marks: the curtain is live water.
    const weep = (small) => {
      for (const [i, k, x, y, S] of slots) {
        if ((S === SMALL) !== small) continue;
        if (mu !== null && (hourTurn || A[k][i] !== B[k][i])) continue;
        for (let c = 0; c < 6; c++) {
          const key = x * 7 + c, per = 2.4 + 1.6 * noise(key, 3);
          const u = (t + per * noise(key, 5)) % per;
          const yy = (small ? UPPER : LOWER) + 4 + oy + 0.5 * G * u * u;
          const nx = x + ox + c * S.pitch + (S.w >= 3 ? 1 : 0);
          const cut = small ? Math.min(surf, tubeTop(T, nx)) : surf;
          if (yy + 1 < cut) { g.pixel(nx, yy); g.pixel(nx, yy + 1); }
        }
      }
    };

    drawPipe(g, ox, oy, t);
    weep(true);
    drawStatic(true); drawTurn(true);

    // The bamboo and its trestle, in front of the hour curtain.
    drawBamboo(g, T, fill);
    // one post, its axle through the tube
    for (let y = Math.round(T.py) + 1; y < surf; y++) { g.pixel(T.px - 1, y); g.pixel(T.px, y); }
    g.pixel(T.px - 1, T.py, 0); g.pixel(T.px, T.py, 0);
    STONE.forEach((row, r) => { for (let i = 0; i < row.length; i++) if (row[i] === '#') g.pixel(12 + ox + i, surf - 3 + r); });

    weep(false);
    drawStatic(false); drawTurn(false);

    // The seconds: a drop swells on the nozzle and lets go on the second.
    {
      const fr = sec % 1, ny = DRIP_Y + oy + 1, x = DRIP_X + ox;
      const near = Math.abs(a - REST) < 0.12;
      const cut = near ? Math.floor(tubeTop(T, x + 1)) + 1 : surf;
      const y = ny + 0.5 * G * fr * fr;
      if (y + 2 < cut) {
        for (let r = 0; r < 3; r++) if (y + r < cut) { g.pixel(x, y + r); g.pixel(x + 1, y + r); }
        trail(g, { x, w: 2, y0: y, y1: y + 2 }, 0, Math.min(5, (G * fr) / 40), false, cut);
      } else {
        const age = fr - fall(cut - ny - 2);
        if (age < 0.25) for (let i = 0; i < 2; i++) {
          const vx = (i ? 1 : -1) * 22, vy = 30;
          const px = x + 0.5 + vx * age, py = cut - 1 - (vy * age - 0.5 * G * age * age);
          if (py < cut) g.pixel(px, py);
        }
      }
      // the next drop swelling
      const sw = clamp((fr - 0.35) / 0.65, 0, 1);
      if (sw > 0.2) { g.pixel(x, ny); g.pixel(x + 1, ny); }
      if (sw > 0.7) { g.pixel(x, ny + 1); g.pixel(x + 1, ny + 1); }
    }

    // The bamboo pouring out on the hour.
    if (hourTurn && mu > -0.75 && mu < 0.75) {
      const w = mu < 0.2 ? 3 : mu < 0.5 ? 2 : 1;
      for (let y = Math.round(T.my); y < surf; y++)
        for (let i = 0; i < w; i++) g.pixel(T.mx - 1 + i + (y - T.my) * 0.3, y);
    }

    // The pool: the water line, the curtain's reflection, rings and spray.
    const lift = new Uint8Array(140);
    const snap = g.buf.slice();
    const get = (x, y) => (x < 0 || x > 127 || y < 0 || y >= surf) ? 0 : snap[y * 128 + x];
    if (P) for (const e of P.events) {
      const ex = e.pour ? T.mx + 1 : e.x;
      const age = mu - e.t;
      if (age >= 0) ring(g, ex, age, e.k, surf, lift);
    }
    for (let x = 0; x < 128; x++) {
      const v = Math.sin(x * 0.55 + t * 1.7) + Math.sin(x * 0.23 - t * 1.1);
      if (v > -1.3) g.pixel(x, surf - (lift[x] ? 1 : 0));
    }
    for (let y = surf + 2; y < 64; y += 2) {
      const d = y - surf;
      const src = surf - 1 - Math.round(d * 2.2);
      const off = Math.round(1.4 * Math.sin(y * 0.9 + t * 2.3));
      for (let x = 0; x < 128; x++) if (get(x + off, src)) g.pixel(x, y);
    }
    if (P) for (const e of P.events) {
      const ex = e.pour ? T.mx + 1 : e.x;
      const age = mu - e.t;
      if (age >= 0 && age < 0.9) splashSpray(g, { ...e, x: ex }, age, surf);
    }
  },
};
