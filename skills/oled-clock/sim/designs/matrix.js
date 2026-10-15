// Matrix — the time decoded in the digital rain.
//
// The glass is the rain from The Matrix: 32 columns of tiny glyphs (a
// half-width katakana-like set of its own, 3 x 5 px, mirrored at random as
// in the film, with numerals mixed in). The glyphs sit in cells; down each
// column a bright head glides (sub-pixel, continuously), writing glyphs into
// the cells it passes, and each written glyph decays as it ages, thinned by
// an ordered dither until it is gone. Glyphs mutate as they fade.
//
// The time is where the rain has frozen: four tall angular numerals of their
// own, filled with locked glyphs drawn bold and edged with a thin outline,
// the rain parting around them. Locked glyphs still mutate now and then.
// The colon is two solid dots, the only still things on the glass.
//
// The minute turn: the digit that will change starts to glitch (its glyphs
// mutate faster and faster, the outline flickers), then crumbles: cell by
// cell its glyph tiles drop and fall away as code. A surge of fast columns
// pours through the empty slot, and after :00 the new digit is decoded
// column by column: a head runs down each of its six columns, every cell it
// passes inside the numeral locks in with a flash, and a scan line settles
// it. The old digit is only ever seen before :00, the new one after.
//
// The hour: a system moment. Every digit glitches and falls, the rain speeds
// up, then stops dead (bullet time) and runs backwards, the trails rewinding
// up into their heads, and drains off the glass. A terminal cursor types
// "Wake up, Neo...", then "Follow the white rabbit." while a white rabbit
// hops across the bottom. The words fall apart into code, the rain comes
// back, and the new time is decoded slot by slot.
//
// Everything is closed-form in the clock: each column's drops are periodic
// with per-drop hashed lengths, so a cell's brightness is the time since the
// last head passed it; turn choreography is a function of seconds from :00.
//
// Burn-in: the rain is moving everywhere; the numerals walk a 2 px orbit
// every 3 minutes and their fill glyphs mutate; from 23:00 to 07:00 the
// panel dims.

import { dither, orbit, previousMinute, clockFields, font5x7 } from '../js/kit.js';

const W = 128, H = 64;
const CW = 4, CH = 6;                 // glyph cell
const COLS = 32, ROWS = 11, ROW_Y = -2;
const DW = 24, DH = 50;               // numeral box
const SLOT_X = [4, 32, 72, 100], DIG_Y = 7;
const COLON = [[62, 21], [62, 38]];   // top-left of the colon's two 4x4 dots

// ------------------------------------------------------------ glyphs
// Half-width katakana-like shapes and numerals, 3 x 5, rows top to bottom.

const GLYPH_SRC = [
  '###..#.#..#.#..', '..#.#.##..#..#.', '.#.####.#..#.#.', '###.#..#..#.###', '.#.###.#.##.#.#',
  '.#.###.#.###.#.', '.###.#..#.#.#..', '#..####.#..#.#.', '###..#..#..####', '#.####.#...#.#.',
  '#...##....#.##.', '###..#.#..###.#', '#..####.##...##', '#.##.#..#.#.#..', '.###.####..#.#.',
  '##...##.#..#.#.', '###...###.#.#..', '#..#..##.#.##..', '.#.###.#..#.#..', '...###...###...',
  '###..##.#.#.#.#', '.#.###..#.###.#', '...#.##.##.##..', '#..#.###.#...##', '###..#..#.#.#..',
  '.#.###.#.#.#.#.', '###..##.#.#...#', '##...###...###.', '.#..#.#..#.####', '..##.#.#.#.##..',
  '###.#.###.#.##.', '#..###.#.#..#..', '...##..#..#.###', '###..####..####', '###...###..#.##',
  '#.##.##.#..#.#.', '#..#..#..#.###.', '####.##.##.####', '####.#..#.#.#..', '#....#..#.#.#..',
  // numerals
  '####.##.##.####', '.#.##..#..#.###', '###..#####..###', '###..####..####', '#.##.####..#..#',
  '####..###..####', '####..####.####', '###..#..#..#..#', '####.#####.####', '####.####..####',
];
const NG = GLYPH_SRC.length;
/** Each glyph as a 5-row array of 3-bit masks (bit 2 = left), and mirrored. */
const GLYPHS = [];
for (const s of GLYPH_SRC) {
  const rows = [0, 1, 2, 3, 4].map((r) => [0, 1, 2].reduce((m, c) => m | (s[r * 3 + c] === '#' ? 4 >> c : 0), 0));
  GLYPHS.push(rows);
  GLYPHS.push(rows.map((m) => ((m & 4) >> 2) | (m & 2) | ((m & 1) << 2)));
}

/** A good integer hash, in [0, 1). */
function hash(a, b = 0, c = 0) {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const pick = (a, b, c) => GLYPHS[Math.floor(hash(a, b, c) * GLYPHS.length)];

/**
 * Draw glyph `gl` with its top-left at (x, y): lit where the glyph is, at
 * density `b` (ordered dither, fixed to the glass), skipping pixels where
 * `block` is set. `bold` smears it one pixel right, for heads and locked cells.
 */
function drawGlyph(g, gl, x, y, b, block, bold = false) {
  for (let r = 0; r < 5; r++) {
    let m = gl[r];
    if (bold) m = (m << 1) | m;               // 4 bits wide
    const w = bold ? 4 : 3;
    const yy = y + r;
    if (yy < 0 || yy >= H) continue;
    for (let c = 0; c < w; c++) {
      if (!(m & (1 << (w - 1 - c)))) continue;
      const xx = x + c;
      if (xx < 0 || xx >= W || (block && block[yy * W + xx])) continue;
      if (b >= 1 || dither(xx, yy, b)) g.buf[yy * W + xx] = 1;
    }
  }
}

// ------------------------------------------------------------ numerals
// Angular, chamfered centre-lines in a 24 x 50 box, stroked 7 px wide.

const L = 3.6, R = 20.4, T = 3.6, B = 46.4, M = 24.6;
const NUM = {
  0: [[[L + 5, T], [R - 5, T], [R, T + 5], [R, B - 5], [R - 5, B], [L + 5, B], [L, B - 5], [L, T + 5], [L + 5, T]]],
  1: [[[L + 2, T + 7], [L + 9.5, T], [L + 9.5, B]]],
  2: [[[L, T + 6], [L + 5, T], [R - 5, T], [R, T + 5], [R, M - 6], [L, B - 4], [L, B], [R, B]]],
  3: [[[L, T + 4], [L + 4, T], [R - 5, T], [R, T + 5], [R, M - 5], [R - 5, M], [L + 5, M]],
    [[R - 5, M], [R, M + 5], [R, B - 5], [R - 5, B], [L + 4, B], [L, B - 4]]],
  4: [[[R - 3, B], [R - 3, T], [L, M + 8], [R + 1, M + 8]]],
  5: [[[R, T], [L, T], [L, M - 2], [R - 5, M - 2], [R, M + 3], [R, B - 5], [R - 5, B], [L + 4, B], [L, B - 4]]],
  6: [[[R - 1, T + 1], [L + 5, T], [L, T + 5], [L, B - 5], [L + 5, B], [R - 5, B], [R, B - 5], [R, M + 5], [R - 5, M], [L, M]]],
  7: [[[L, T + 3], [L, T], [R, T], [R, T + 6], [L + 6, B]]],
  8: [[[L + 5, T], [R - 5, T], [R, T + 4.5], [R, M - 4.5], [R - 4.5, M], [L + 4.5, M], [L, M - 4.5], [L, T + 4.5], [L + 5, T]],
    [[L + 4.5, M], [L, M + 4.5], [L, B - 5], [L + 5, B], [R - 5, B], [R, B - 5], [R, M + 4.5], [R - 4.5, M]]],
};
NUM[9] = NUM[6].map((p) => p.map(([x, y]) => [DW - x, DH - y]));

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  const u = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  return Math.hypot(px - ax - u * dx, py - ay - u * dy);
}

/** Mask and outline of each numeral, built once. */
const MASK = [], EDGE = [];
for (let d = 0; d < 10; d++) {
  const m = new Uint8Array(DW * DH), e = new Uint8Array(DW * DH);
  for (let y = 0; y < DH; y++)
    for (let x = 0; x < DW; x++) {
      let best = 9;
      for (const p of NUM[d]) for (let i = 1; i < p.length; i++) best = Math.min(best, segDist(x + 0.5, y + 0.5, ...p[i - 1], ...p[i]));
      m[y * DW + x] = best <= 3.5 ? 1 : 0;
    }
  for (let y = 0; y < DH; y++)
    for (let x = 0; x < DW; x++) {
      if (!m[y * DW + x]) continue;
      const at = (xx, yy) => (xx < 0 || yy < 0 || xx >= DW || yy >= DH ? 0 : m[yy * DW + xx]);
      if (!at(x - 1, y) || !at(x + 1, y) || !at(x, y - 1) || !at(x, y + 1)) e[y * DW + x] = 1;
    }
  MASK.push(m); EDGE.push(e);
}
/** The locked cells of a numeral: [j, i] cells (4 x 6, in its box) touching the mask. */
const NCELLS = MASK.map((m) => {
  const out = [];
  for (let i = 0; i * CH < DH; i++)
    for (let j = 0; j * CW < DW; j++) {
      let any = false;
      for (let y = i * CH; y < Math.min(DH, i * CH + CH) && !any; y++)
        for (let x = j * CW; x < j * CW + CW; x++) if (m[y * DW + x]) { any = true; break; }
      if (any) out.push([j, i]);
    }
  return out;
});

/** The mask grown by one pixel: where the rain parts around a numeral. */
const HALO = MASK.map((m) => {
  const o = new Uint8Array((DW + 2) * (DH + 2));
  for (let y = 0; y < DH; y++)
    for (let x = 0; x < DW; x++)
      if (m[y * DW + x]) for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) o[(y + dy) * (DW + 2) + x + dx] = 1;
  return o;
});

// ------------------------------------------------------------ the rain

const COL = Array.from({ length: COLS }, (_, c) => ({
  v: 17 + 36 * hash(c, 1),            // px/s
  pt: 1.3 + 2.6 * hash(c, 2),         // s between drops
  ph: hash(c, 3),
}));
const FMAX = 2.8;
const dropOn = (c, n) => hash(c, n, 4) > 0.15;
const fadeOf = (c, n) => 0.6 + 1.6 * hash(c, n, 5);

/**
 * The background rain at rain-time `rt`: each cell shows the glyph written
 * by the last head to pass it, fading over that drop's fade time; heads
 * glide. `dens` scales it all (the hour drains it).
 */
function drawRain(g, rt, dens, block) {
  if (dens <= 0) return;
  for (let c = 0; c < COLS; c++) {
    const { v, pt, ph } = COL[c], x = c * CW;
    for (let r = 0; r < ROWS; r++) {
      const y = ROW_Y + r * CH;
      let n = Math.floor((rt - (y + 6) / v) / pt - ph), b = 0;
      for (; ; n--) {
        const age = rt - ((n + ph) * pt + (y + 6) / v);
        if (age > FMAX) break;
        if (age < 0 || !dropOn(c, n)) continue;
        b = Math.max(b, 1 - age / fadeOf(c, n));
      }
      b *= dens;
      if (b <= 0.03) continue;
      const mu = 0.5 + 1.6 * hash(c, r, 8);
      drawGlyph(g, pick(c, r, Math.floor(rt * mu + 9 * hash(c, r, 7))), x, y, Math.min(1, b * 1.4), block);
    }
    // Heads.
    for (let n = Math.floor(rt / pt - ph); ; n--) {
      const hy = -6 + v * (rt - (n + ph) * pt);
      if (hy > H + FMAX * v) break;
      if (hy >= H || hy < -6 || !dropOn(c, n)) continue;
      headGlyph(g, x, hy, pick(c, n, Math.floor(rt * 13)), dens, block);
    }
  }
}

/** A head: a bold glyph at a sub-pixel height (rounded late), opaque. */
function headGlyph(g, x, hy, gl, dens, block) {
  const y = Math.round(hy);
  for (let yy = y; yy < y + 6; yy++) for (let xx = x; xx < x + 4; xx++)
    if (yy >= 0 && yy < H && xx < W && !(block && block[yy * W + xx])) g.buf[yy * W + xx] = 0;
  drawGlyph(g, gl, x, y, dens, block, true);
}

/** Extra drops (the surge, a decode head's trail): [x, t0, v, fade] at time `t`. */
function drawDrop(g, x, t0, v, fade, t, block, seed, head = true) {
  const hy = -6 + v * (t - t0);
  if (hy < -6) return;
  for (let r = 0; r < ROWS; r++) {
    const y = ROW_Y + r * CH;
    const age = t - (t0 + (y + 6) / v);
    if (age < 0 || age >= fade) continue;
    drawGlyph(g, pick(x, r + seed, Math.floor(t * 9)), x, y, 1 - age / fade, block);
  }
  if (head && hy < H) headGlyph(g, x, hy, pick(x, seed, Math.floor(t * 14)), 1, block);
}

// ------------------------------------------------------------ numerals in the rain

/**
 * Draw numeral `d` in slot `s`. `cellState(j, i)` returns null (not there),
 * or { lock: seconds since the cell locked in, fall: px it has fallen,
 * fade: 0..1, glitch: 0..1 }.
 */
function drawNumeral(g, s, d, ox, oy, T, cellState, block) {
  const bx = SLOT_X[s] + ox, by = DIG_Y + oy;
  const m = MASK[d], e = EDGE[d];
  for (const [j, i] of NCELLS[d]) {
    const st = cellState(j, i);
    if (!st) continue;
    const k = hash(s * 10 + d, j, i);
    const glitch = st.glitch ?? 0;
    // Locked glyphs mutate every few seconds; glitching ones every frame.
    const epoch = glitch > 0 ? Math.floor(T * (2 + 40 * glitch)) : Math.floor((T + 20 * k) / (3 + 6 * hash(s, j, i)));
    const gl = pick(s * 10 + d, j * 8 + i, epoch);
    const flash = st.lock < 0.15;
    const jx = glitch > 0.4 && hash(j, i, Math.floor(T * 30)) < glitch * 0.3 ? (hash(i, j, Math.floor(T * 30)) < 0.5 ? -1 : 1) : 0;
    const edgeOn = glitch === 0 || hash(s, Math.floor(T * 24), j * 8 + i) > glitch * 0.8;
    const fy = Math.round(st.fall ?? 0), dens = 1 - (st.fade ?? 0);
    for (let ly = 0; ly < CH; ly++)
      for (let lx = 0; lx < CW; lx++) {
        const mx = j * CW + lx, my = i * CH + ly;
        if (my >= DH || !m[my * DW + mx]) continue;
        let on;
        if (flash) on = true;
        else if (e[my * DW + mx] && edgeOn) on = true;
        else if (ly < 5) {
          const row = gl[ly], bold = (row << 1) | row;
          on = !!(bold & (8 >> lx));
        }
        if (!on) continue;
        const x = bx + mx + jx, y = by + my + fy;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        if (dens >= 1 || dither(x, y - fy, dens)) g.buf[y * W + x] = 1;
      }
    // The rain parts round a cell that is in place.
    if (!fy && block) for (let ly = 0; ly < CH + 2; ly++)
      for (let lx = 0; lx < CW + 2; lx++) {
        const hx = j * CW + lx, hyy = i * CH + ly;
        if (hyy >= DH + 2 || !HALO[d][hyy * (DW + 2) + hx]) continue;
        const x = bx + hx - 1, y = by + hyy - 1;
        if (x >= 0 && y >= 0 && x < W && y < H) block[y * W + x] = 1;
      }
  }
}

/** The scan line that settles a freshly decoded numeral: a bright band in the mask. */
function drawScan(g, s, d, ox, oy, u) {
  if (u <= 0 || u >= 1) return;
  const bx = SLOT_X[s] + ox, by = DIG_Y + oy, sy = u * (DH + 6) - 3;
  for (let my = Math.max(0, Math.floor(sy - 1)); my <= Math.min(DH - 1, Math.ceil(sy + 1)); my++)
    for (let mx = 0; mx < DW; mx++) if (MASK[d][my * DW + mx]) g.pixel(bx + mx, by + my, 1);
}

// ------------------------------------------------------------ choreography

const sm = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const prog = (v, a, b) => (v <= a ? 0 : v >= b ? 1 : (v - a) / (b - a));

// Minute turn, seconds from :00.
const GLITCH0 = -2.0, GLITCH1 = -0.9;     // the old digit's glyphs go wild
const MELT0 = -1.05;                       // its cells start to drop
const SURGE0 = -0.5;                       // fast columns pour through
const DECODE0 = 0.55, DCOL = 0.17, VD = 85, SLOT_LAG = 0.5;
const G_FALL = 420;

/** Melting: when cell (j, i) lets go, and where it is then. */
function meltCell(s, j, i, tau, t0) {
  const tc = t0 + 0.05 * (9 - i) + 0.03 * j + 0.22 * hash(s, j, i);
  const dt = tau - tc;
  if (dt <= 0) return { fall: 0, fade: 0 };
  return { fall: 0.5 * G_FALL * dt * dt + 12 * dt, fade: Math.min(1, dt / 0.55) };
}

/** Decoding: when the head down column j of slot s reaches the cell at numeral row i. */
const decodeStart = (order, j, d0) => d0 + order * SLOT_LAG + j * DCOL;
const lockAt = (order, j, i, oy, d0) => decodeStart(order, j, d0) + (DIG_Y + oy + i * CH + 6) / VD;
const decodeEnd = (order, oy, d0) => lockAt(order, 5, Math.ceil(DH / CH), oy, d0);

// Hour: the rain's speed (multiples of normal) over the show.
const RATE = [[-2.6, 1], [-0.6, 3.2], [0, 3.2], [0, 0], [0.35, 0], [0.35, -3], [1.6, -3]];
/** Extra rain-time gained (or lost) by the hour's speed changes, at tau. */
function rainShift(tau) {
  if (tau <= RATE[0][0] || tau >= RATE.at(-1)[0]) return 0;
  let x = 0;
  for (let k = 1; k < RATE.length; k++) {
    const [t0, m0] = RATE[k - 1], [t1, m1] = RATE[k];
    if (t1 <= t0) continue;
    const e = Math.min(tau, t1);
    if (e <= t0) break;
    const me = m0 + ((m1 - m0) * (e - t0)) / (t1 - t0);
    x += ((m0 + me) / 2 - 1) * (e - t0);
  }
  return x;
}
const H_GLITCH0 = -2.8, H_MELT0 = -1.8, H_DECODE0 = 6.0;
const LINES = [
  { text: 'Wake up, Neo...', x: 4, y: 9, t0: 1.75 },
  { text: 'Follow the', x: 4, y: 25, t0: 3.2 },
  { text: 'white rabbit.', x: 4, y: 35, t0: 3.85 },
];
const TYPE = 0.07, DISSOLVE = 5.3;

const RABBIT = [
  '...........#..#.',
  '...........#..#.',
  '...........#.##.',
  '...........####.',
  '..........######',
  '..........#.####',
  '....#############',
  '..##############.',
  '.#############...',
  '##############...',
  '.############....',
  '..###.....###....',
  '.##......##......',
];

// ------------------------------------------------------------ face

const BLOCK = new Uint8Array(W * H);
const digitsOf = (c) => [...`${c.hh}${c.mm}`].map(Number);

/** Font glyph pixels for a typed character, dithered, `fall` px lower. */
function typeChar(g, ch, x, y, dens) {
  const spr = font5x7.glyph(ch);
  if (!spr) return;
  for (let j = 0; j < spr.h; j++)
    for (let i = 0; i < spr.w; i++) {
      if (!spr.data[j * spr.w + i]) continue;
      const xx = x + i, yy = Math.round(y) + j;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      if (dens >= 1 || dither(xx, yy, dens)) g.buf[yy * W + xx] = 1;
    }
}

function drawTerminal(g, tau) {
  let k = 0, cursor = null;
  for (const ln of LINES) {
    const n = Math.max(0, Math.min(ln.text.length, Math.floor((tau - ln.t0) / TYPE) + 1));
    if (tau >= ln.t0 - 0.6) cursor = [ln.x + 6 * n, ln.y, tau < ln.t0 + ln.text.length * TYPE];
    for (let c = 0; c < n; c++, k++) {
      const dt = tau - (DISSOLVE + 0.03 * k + 0.2 * hash(k, 3));
      const fall = dt > 0 ? 0.5 * 300 * dt * dt : 0, dens = dt > 0 ? 1 - dt / 0.6 : 1;
      if (dens > 0) typeChar(g, ln.text[c], ln.x + 6 * c, ln.y + fall, dens);
    }
    k += ln.text.length - n;
  }
  if (cursor && tau < DISSOLVE && (cursor[2] || (tau * 2.4) % 1 < 0.55)) g.fillRect(cursor[0], cursor[1], 5, 7, 1);
}

function drawRabbit(g, tau) {
  const u = prog(tau, 3.0, 6.3);
  if (u <= 0 || u >= 1) return;
  const x = -12 + 152 * u, ph = (tau - 3.0) / 0.43;
  const y = 62 - 9 * Math.abs(Math.sin(Math.PI * ph)) - (RABBIT.length - 1);
  const X = Math.round(x), Y = Math.round(y);
  RABBIT.forEach((row, j) => [...row].forEach((ch, i) => { if (ch === '#') g.pixel(X + i, Y + j, 1); }));
}

export default {
  name: 'Matrix',
  blurb: 'The digital rain: the time is where the code has frozen; on the minute a digit crumbles into rain and the new one is decoded column by column.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,

  frame(g, { fields: f, date, oled, night }) {
    const T = date.getTime() / 1000 - 1.7e9;
    const [ox, oy] = orbit(date, 2, 3);
    const ahead = f.sec >= 30;
    const to = ahead ? clockFields(new Date(date.getTime() + 60000)) : f;
    const from = ahead ? f : previousMinute(date);
    const tau = ahead ? f.sec - 60 : f.sec;
    const hour = to.m === 0;
    const a = digitsOf(from), b = digitsOf(to), now = digitsOf(f);
    const active = hour ? tau > -3.2 && tau < 10 : tau > -2.4 && tau < 5;
    const changed = [0, 1, 2, 3].filter((s) => active && (hour || a[s] !== b[s]));
    const order = (s) => changed.indexOf(s);
    BLOCK.fill(0);

    // What each slot shows: the old numeral (glitching, melting) before
    // :00, the new one (decoding) after; a slot not in the turn just stands.
    const d0 = hour ? H_DECODE0 : DECODE0, lag = hour ? 0.38 : SLOT_LAG;
    const plan = [0, 1, 2, 3].map((s) => {
      if (!changed.includes(s)) return { d: now[s], state: () => ({ lock: 99 }) };
      const o = order(s);
      if (tau < (hour ? 0.6 : 0.4)) {
        const g0 = (hour ? H_GLITCH0 + 0.1 * s : GLITCH0 + 0.15 * o), m0 = hour ? H_MELT0 + 0.15 * s : MELT0 + 0.15 * o;
        const glitch = sm(prog(tau, g0, hour ? H_MELT0 + 0.4 : GLITCH1));
        return { d: a[s], state: (j, i) => { const st = meltCell(s, j, i, tau, m0); return st.fade >= 1 ? null : { ...st, lock: 99, glitch }; } };
      }
      return {
        d: b[s],
        state: (j, i) => { const l = tau - (d0 + o * lag + j * DCOL + (DIG_Y + oy + i * CH + 6) / VD); return l < 0 ? null : { lock: l }; },
      };
    });

    // 1. Numeral cells in place (they part the rain).
    plan.forEach(({ d, state }, s) => drawNumeral(g, s, d, ox, oy, T, (j, i) => { const st = state(j, i); return st && !st.fall ? st : null; }, BLOCK));
    // Colon: two dots; on the hour it goes with the digits and comes back with them.
    const colonOn = !hour || !active || tau < H_MELT0 + 0.3 || tau > d0 + lag * 1.5 + 0.6;
    if (colonOn) for (const [cx, cy] of COLON) {
      g.fillRect(cx + ox, cy + oy, 4, 4, 1);
      for (let y = cy + oy - 2; y < cy + oy + 6; y++) for (let x = cx + ox - 2; x < cx + ox + 6; x++) if (x >= 0 && y >= 0 && x < W && y < H) BLOCK[y * W + x] = 1;
    }

    // 2. The rain. On the hour it races, stops dead, rewinds and drains.
    const rt = T + (hour && active ? rainShift(tau) : 0);
    let dens = 1;
    if (hour && active) dens = tau < 0.8 ? 1 : tau < 1.5 ? 1 - prog(tau, 0.8, 1.5) : tau < 5.6 ? 0 : prog(tau, 5.6, 6.5);
    drawRain(g, rt, dens, BLOCK);

    // 3. The surge through an emptied slot (the minute only).
    if (!hour) for (const s of changed)
      for (let j = 0; j < 6; j++)
        for (let k = 0; k < 3; k++) {
          const t0 = SURGE0 + 0.1 * order(s) + 0.2 * k + 0.25 * hash(s, j, k);
          drawDrop(g, SLOT_X[s] + j * CW, t0, 140 + 70 * hash(s, j, k + 9), 0.5, tau, BLOCK, s * 40 + j * 5 + k);
        }

    // 4. Falling cells of the old numerals.
    plan.forEach(({ d, state }, s) => drawNumeral(g, s, d, ox, oy, T, (j, i) => { const st = state(j, i); return st && st.fall ? st : null; }, null));

    // 5. Decode heads, and the scan that settles each new numeral.
    for (const s of changed) {
      const o = order(s);
      for (let j = 0; j < 6; j++) {
        const t0 = d0 + o * lag + j * DCOL;
        if (tau > t0 && tau < t0 + 1.3) drawDrop(g, SLOT_X[s] + ox + j * CW, t0, VD, 0.3, tau, null, 300 + s * 8 + j);
      }
      const end = d0 + o * lag + 5 * DCOL + (DIG_Y + oy + DH + 6) / VD;
      drawScan(g, s, b[s], ox, oy, prog(tau, end, end + 0.4));
    }

    // 6. The hour's terminal and its rabbit.
    if (hour && active && tau > 1.4 && tau < 7) { drawTerminal(g, tau); drawRabbit(g, tau); }

    oled.invert(hour && active && tau >= 0 && tau < 0.034);
    oled.contrast(0xcf + (0x20 - 0xcf) * night);
  },
};
