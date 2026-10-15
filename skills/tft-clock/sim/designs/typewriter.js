// Typewriter: the glass is a sheet of onionskin in a typewriter, and the
// time is typewriter art. Each numeral is typed from characters the way the
// 1960s typists made portraits from x's and o's: bold-struck 8s for the
// strokes, d b Y P at the turns so the curves bend, so up close it is text
// and at arm's length it is a figure. The hours sit high on the left, the
// minutes a line and a half lower on the right, like two blocks set on a
// page; under the hours the typist keeps a desk log in capitals.
//
// Always moving: the typist types the log a key at a time (each slug lands
// with a tiny jump, the carriage steps along), mistypes now and then and
// x's the word out, the bell dings near the margin, the carriage returns in
// a smooth slide and the paper feeds the line up. Minute turn: the type
// guide glides up to the old figure, frames it, and four strikes of
// correction tape lift it away evenly, letter-shaped bites at a time; after
// :00 the carriage zips the new figure's lines once with a light touch (the
// whole figure, faint) and then types it firmly, line by line, with the
// carriage running along each line. The hour: the sheet is pulled up and
// out over the platen and a fresh one rolls in; the typist types the whole
// time, the hours this time in the hour's own stroke letter (8 # @ M W B H &,
// kept all hour, so each sheet has its own ink), then an ornament of
// repeated characters across the head of the sheet with the date set in it
// (a different ornament every hour), and opens the log with the hour in
// words. Every firm strike is preceded by the ribbon lifting over the slug
// for two frames (a flick of ink) and lands a pixel high for two more.
//
// Colour, strictly two: carbon-ribbon ink #1c1c3a on onionskin #efe9da,
// what a typed page is. Grey exists only as typing does it: the density of
// the characters. Every frame is drawn as a 1-bit mask (one byte a pixel)
// and written through a two-entry palette. Night dims the backlight only.
//
// Cost: ~150 glyph blits (6 rows of 4 bits) into the mask, then one pass of
// 12,800 pixels through the palette. The minute's script is built once a
// minute (a few hundred keyframes, well under a millisecond).

import { hash, to565 } from '../js/kit.js';
import { SLUG, FIG, glyph } from './typewriter-type.js';
import { getPlan, SLOTS, COLON, LOG, RULE, THWACK, SHEET_OUT, SHEET_DUR, cellX, rowY, CW, CH } from './typewriter-plan.js';

const W = 160, H = 80;
const INK = to565(0x1c1c3a), PAPER = to565(0xefe9da);
const M = new Uint8Array(W * H);
const BAIL_Y = 71, GAP = 9, TRAVEL = 80 + GAP;
const JUMP = 0.034;
const RIB = 0.034;    // the ribbon vibrator lifts the ribbon over the slug for two frames before it strikes   // a fresh slug sits a pixel high for two frames: the typebar's slam

let clipY0 = 0, clipY1 = H, nBlit = 0;
const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

/** One slug: glyph rows struck at (x, y), with a typewriter's uneven ink by `seed`. */
function strike(x, y, rows, bold, faint, seed) {
  const h = hash(seed, 77);
  const wob = (h >>> 16) & 31;
  if (wob === 0) y -= 1; else if (wob === 1) y += 1;
  const lightTop = (h & 31) < 3, lightSide = ((h >>> 5) & 31) < 3;
  nBlit += bold ? 2 : 1;
  for (let r = 0; r < 6; r++) {
    let b = rows[r];
    if (!b) continue;
    if (lightTop && r === 0) b &= (h >>> 20) & 1 ? 0b1010 : 0b0101;
    if (lightSide && (r & 1)) b &= 0b1110;
    const yy = y + r;
    if (yy < clipY0 || yy >= clipY1) continue;
    const o = yy * W;
    for (let i = 0; i < 4; i++) {
      if (!(b & (8 >> i))) continue;
      if (faint && (i * 3 + r * 5 + seed) % 3 === 0) continue;
      const xx = x + i;
      if (xx >= 0 && xx < W) M[o + xx] = 1;
      if (bold && xx + 1 < W) M[o + xx + 1] = 1;
    }
  }
  if (((h >>> 10) & 31) < 2 && !faint) {   // a fleck of ribbon ink
    const yy = y + 1 + ((h >>> 22) % 5), xx = x + ((h >>> 26) & 3);
    if (yy >= clipY0 && yy < clipY1 && xx < W) M[yy * W + xx] = 1;
  }
}

// correction tape: each strike lifts this letter's shape out of every slug
const LIFT = [[glyph('/'), 0], [glyph('\\'), 0], [glyph('X'), 1]];
function lift(x, y, [rows, bold]) {
  for (let r = 0; r < 6; r++) {
    const b = rows[r], yy = y + r;
    if (!b || yy < clipY0 || yy >= clipY1) continue;
    for (let i = 0; i < 4; i++) if (b & (8 >> i)) { const xx = x + i; M[yy * W + xx] = 0; if (bold) M[yy * W + xx + 1] = 0; }
  }
}

// the hours are typed in the hour's own stroke letter, all hour: the sheet's ornament
const HOUR_INK = ['%8', '#', '@', 'M', 'W', 'B', 'H', '&'].map(glyph);
let hourInk = HOUR_INK[0];

function drawFigure(P, s, sec, yo, hourKey) {
  const d = s === 4 ? -1 : P.D[s], S = s === 4 ? COLON : SLOTS[s];
  const fig = s === 4 ? null : FIG[d], tA = P.tA[s], tB = P.tB[s];
  const ncell = s === 4 ? 3 : 42, fw = s === 4 ? 1 : 6;
  let nLift = 0;
  if (s < 4 && P.erased.includes(s)) for (const t of THWACK) if (sec >= t) nLift++;
  if (nLift >= THWACK.length) return;
  const jolt = nLift > 0 && sec - THWACK[nLift - 1] < JUMP * 1.5;
  for (let i = 0; i < ncell; i++) {
    const code = s === 4 ? (COLON.cells.includes(i) ? 1 : 0) : fig[i];
    if (!code) continue;
    let faint = false, age = 9;
    if (tA) {
      if (sec < tA[i]) continue;
      if (sec < tB[i] && sec >= tB[i] - RIB) ribbon(cellX(S.c + (i % fw)), rowY(S.r + ((i / fw) | 0)) + yo);
      if (sec < tB[i]) { faint = true; age = sec - tA[i]; } else age = sec - tB[i];
    }
    const x = cellX(S.c + (i % fw)), y = rowY(S.r + ((i / fw) | 0)) + yo - (age < JUMP || jolt ? 1 : 0);
    const sl = SLUG[code], rows = s < 2 && code === 1 ? hourInk : sl.rows;
    strike(x, y, rows, sl.bold, faint, hourKey * 977 + s * 61 + i + d * 7);
    for (let k = 0; k < nLift; k++) lift(x, y, LIFT[k]);
  }
}

function drawLog(P, prev, sec, yo) {
  const L = P.lines;
  let done = 0, anim = 0;
  for (const ln of L) {
    if (sec >= ln.lf1) done++;
    else if (sec >= ln.lf0) anim = Math.round(CH * smooth((sec - ln.lf0) / (ln.lf1 - ln.lf0)));
  }
  clipY0 = Math.max(0, rowY(LOG.r - 1) + yo); clipY1 = Math.min(H, rowY(LOG.r + 1) + yo);
  const base = rowY(LOG.r) + yo - anim;
  const line = (ln, j, all) => {
    const y = base - CH * (done - j);
    if (y + 6 < clipY0 || y >= clipY1) return;
    for (const k of ln.keys) {
      if (!all && sec < k.t) { if (sec >= k.t - RIB && y >= clipY0) ribbon(cellX(LOG.c + k.col), y); continue; }
      const age = all ? 9 : sec - k.t;
      strike(cellX(LOG.c + k.col), y - (age < JUMP ? 1 : 0), glyph(k.ch), 0, false, (P.mk + j) * 131 + k.col * 7 + k.ch.charCodeAt(0));
    }
  };
  if (prev && prev.lines.length) line(prev.lines[prev.lines.length - 1], -1, true);
  for (let j = Math.max(0, done - 2); j < L.length; j++) line(L[j], j, false);
  clipY0 = 0; clipY1 = H;
  // the bell, near the margin
  for (const ln of L) {
    const a = sec - ln.bell;
    if (ln.bell >= 0 && a >= 0 && a < 0.45) bell(cellX(LOG.c + LOG.w) + 1, rowY(LOG.r) - 1 + yo, a);
  }
}

const BELL = ['..#..', '.###.', '.###.', '.###.', '#####', '..#..'];
function bell(x, y, a) {
  const dx = a < 0.08 ? 0 : a < 0.16 ? 1 : a < 0.24 ? -1 : 0;
  BELL.forEach((row, r) => [...row].forEach((c, i) => { if (c === '#') px(x + i + (r < 5 ? dx : 0), y + r); }));
  if (a < 0.3) { px(x - 1, y - 1); px(x - 2, y - 2); px(x + 5, y - 1); px(x + 6, y - 2); px(x + 6, y + 1); px(x + 7, y + 1); }
}
/** The ribbon raised in front of the strike point: a band of ink over the slug. */
function ribbon(x, y) {
  for (let yy = y + 1; yy < y + 6; yy++) {
    if (yy < clipY0 || yy >= clipY1) continue;
    for (let xx = x - 1; xx < x + 5; xx++) if (xx >= 0 && xx < W) M[yy * W + xx] = 1;
  }
}
function px(x, y) { if (x >= 0 && x < W && y >= 0 && y < H) M[y * W + x] = 1; }
function xpx(x, y) { if (x >= 0 && x < W && y >= 0 && y < H) M[y * W + x] ^= 1; }

function drawSheet(P, prev, sec, yo) {
  const hourKey = Math.floor(P.mk / 60);
  hourInk = HOUR_INK[P.f.h % 8];
  for (let s = 0; s < 4; s++) drawFigure(P, s, sec, yo, hourKey);
  drawFigure(P, 4, sec, yo, hourKey);
  // the header ornament
  const y = rowY(RULE.r) + yo;
  for (let i = 0; i < P.rule.length; i++) {
    const ch = P.rule[i];
    if (ch === ' ') continue;
    let age = 9;
    if (P.ruleT !== null) { const t = P.ruleT + i * P.ruleDt; if (sec < t) break; age = sec - t; }
    strike(cellX(RULE.c0 + i), y - (age < JUMP ? 1 : 0), glyph(ch), 0, false, hourKey * 53 + i);
  }
  drawLog(P, P.hourIn ? null : prev, sec, yo);
}

/** The type guide: four corner marks round the slug (or the figure) it is working, drawn by inversion. */
function cursorAt(P, sec) {
  if (sec < P.showFrom || sec >= P.hideFrom) return null;
  const K = P.keys;
  let i = 0;
  while (i + 1 < K.length && K[i + 1].t <= sec) i++;
  const a = K[i], b = K[i + 1];
  if (!b) return a;
  const u = b.t > a.t ? (sec - a.t) / (b.t - a.t) : 1, e = b.e ? smooth(u) : u;
  return { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e, w: a.w + (b.w - a.w) * e, h: a.h + (b.h - a.h) * e };
}
function drawCursor(c) {
  const x0 = Math.round(c.x) - 1, y0 = Math.round(c.y) - 1, x1 = Math.round(c.x + c.w), y1 = Math.round(c.y + c.h) - 1;
  for (const [x, y, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) {
    xpx(x, y); xpx(x + sx, y); xpx(x, y + sy);
  }
}

// the paper bail across the foot: a chrome bar with the carriage scale and two rollers
function drawBail(cx) {
  for (let x = 0; x < W; x++) {
    M[(BAIL_Y) * W + x] = 0;
    M[(BAIL_Y + 1) * W + x] = 1;
    for (let y = BAIL_Y + 2; y < H; y++) M[y * W + x] = y === BAIL_Y + 2 ? 0 : (y === H - 1 ? 1 : ((x + y) & 1));
  }
  for (let c = 0; c < 32; c++) {
    const x = cellX(c) + 2;
    M[(BAIL_Y + 2) * W + x] = 1;
    if (c % 5 === 0) { M[(BAIL_Y + 3) * W + x] = 1; M[(BAIL_Y + 4) * W + x] = 1; }
  }
  for (const rx of [34, 118]) for (let y = BAIL_Y - 2; y < H; y++) for (let x = rx; x < rx + 9; x++) {
    // a rubber roller on the bail: a rounded body with its ridges
    const top = y === BAIL_Y - 2, corner = top && (x === rx || x === rx + 8);
    if (corner) continue;
    const edge = x === rx || x === rx + 8 || top || y === H - 1;
    M[y * W + x] = edge || (x - rx) % 2 === 0 ? 1 : 0;
  }
  if (cx !== null) {   // the carriage pointer rides the scale
    const x = Math.round(cx) + 2;
    for (let k = -2; k <= 2; k++) { M[(BAIL_Y - 1) * W + x + k] = 0; M[BAIL_Y * W + x + k] = Math.abs(k) <= 2 ? 1 : 0; }
    M[(BAIL_Y - 1) * W + x] = 1;
  }
}

export default {
  name: 'Typewriter',
  blurb: 'Typewriter art on onionskin: the time is typed in 8s, d, b, Y and P; the typist keeps a log, corrects each old figure away and types the new one, and changes the sheet on the hour.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, sec = f.sec;
    ctx.lcd.backlight(1 - 0.65 * ctx.night);
    const P = getPlan(f.minuteKey), prev = getPlan(f.minuteKey - 1);
    M.fill(0);
    nBlit = 0;
    let cur = null;
    if (P.hourOut && sec >= SHEET_OUT) {
      const off = Math.round(TRAVEL * smooth((sec - SHEET_OUT) / SHEET_DUR));
      drawSheet(P, prev, sec, -off);
      for (let y = Math.max(0, 80 - off); y < Math.min(H, 80 - off + GAP); y++) for (let x = 0; x < W; x++) M[y * W + x] = (x + y) & 1 || y === 80 - off ? 1 : (y & 2 ? 1 : 0);
    } else if (P.hourIn && sec < P.showFrom) {
      const off = Math.round(TRAVEL * smooth((sec + 60 - SHEET_OUT) / SHEET_DUR));
      for (let y = Math.max(0, 80 - off); y < Math.min(H, 80 - off + GAP); y++) for (let x = 0; x < W; x++) M[y * W + x] = (x + y) & 1 || y === 80 - off ? 1 : (y & 2 ? 1 : 0);
    } else {
      drawSheet(P, prev, sec, 0);
      cur = cursorAt(P, sec);
      if (cur) drawCursor(cur);
    }
    drawBail(cur ? cur.x : null);

    const buf = g.buf;
    for (let i = 0; i < W * H; i++) buf[i] = M[i] ? INK : PAPER;
    g.cost.calls += nBlit + 4;
    g.cost.blit += nBlit * 24;
    g.cost.px += W * H * 2;
    g.cost.box += W * H * 2;
  },
};
