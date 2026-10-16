// Crossword: the time is the answer, and somebody keeps solving it.
//
// A close-up of a newspaper puzzle page, newsprint and printed grid, being
// filled in by a yellow HB pencil. The page holds sixty mini crosswords,
// one for each minute of the hour, in six columns of ten. Every mini has
// the same two across answers, 1-Across THE HOUR and the long one below it,
// the minute, written out as a crossword writes a phrase (FORTYSEVEN,
// enumeration (5,5)), and a few three-letter downs knitting them together
// (crosswordese: EEL, ERA, OHM...). The clues underneath are riddles that
// come to the answer ("DOZEN AND 35 (5,5)").
//
// How to read it: the top row of the grid is the hour, the long row is the
// minute past it. TEN / FORTYSEVEN is 10:47. The header names the edition
// (MORNING, AFTERNOON, EVENING, LATE NIGHT), which settles am and pm; the
// puzzle number is the minute of the day.
//
// The minute: at :58 the camera slides down the column to the next, empty
// mini, the pencil writes the hour in (it knows that one), and after :00 it
// writes the minute in a solver's scattered order, so no half-written state
// ever reads as a different number. Then it lives with the puzzle: reads a
// down clue, fills the crossing letter, taps, checks the answer, twirls,
// and every third minute or so gets a down wrong, turns the pencil round,
// rubs it out (smudge, crumbs, a ghost left behind) and corrects it.
// Every ten minutes the column ends and the camera pulls back and travels
// to the top of the next. At :59:50 it pulls right out to the whole
// spread: sixty solved minis, the back of last hour's page on the left. The
// page turns, a blank one lies there, and at :00 the camera dives into its
// first puzzle: TEN / OCLOCK.
//
// Palette: newsprint (cooler in the morning, under a warm lamp at night),
// one printing ink, graphite, and the pencil's chrome yellow, wood, ferrule
// and eraser pink. Type: the printed parts in the kit's 3x5 (the size of
// clue type at this pitch); the answers hand-printed with pencil strokes
// that the tip actually follows (crossword-hand.js). Hard pixels for print,
// anti-aliased graphite and pencil.

import { font3x5, mix, hash, rand, noise2, clamp, ease } from '../js/kit.js';
import { drawPencil, letterAt, glyphOf } from './crossword-hand.js';
import {
  CELL, GY, MW, MH, PW, PH, miniX, miniY, CLUE_Y, miniLayout, miniScript, pencilAt, cellXY, REST, scriptEnd,
} from './crossword-page.js';

const INK = 0x1e1b1a, SQUARE = 0x2b2725, LEAD = 0x40414a, DESK = 0x3a2a20;
const ERASER_BITS = [0xd9a3a1, 0xb88e8c, 0xe7c1bd];
const SPREAD = { cx: 0, cy: PH / 2, z: 160 / (2 * PW + 8) };

// Paper by the hour: night lamp, cool morning, plain day, warm evening.
const PAPER = [[0, 0xe8d2ac], [5.5, 0xe8d2ac], [7.5, 0xe4e5dc], [10, 0xebe5d3], [16, 0xebe5d3], [18.5, 0xefdfbf], [21, 0xe8d2ac], [24, 0xe8d2ac]];
function paperAt(hf) {
  for (let i = 1; i < PAPER.length; i++)
    if (hf <= PAPER[i][0]) return mix(PAPER[i - 1][1], PAPER[i][1], (hf - PAPER[i - 1][0]) / (PAPER[i][0] - PAPER[i - 1][0]));
  return PAPER[0][1];
}

const restCam = (k) => ({ cx: miniX(k) + 80, cy: miniY(k) + 40, z: 1 });

/** Camera between two shots: zoom in log space, the centre tracking so the motion reads as one move. */
function between(A, B, u, dip = 0) {
  const w = ease.inOutCubic(clamp(u, 0, 1));
  let lz = Math.log(A.z) + (Math.log(B.z) - Math.log(A.z)) * w;
  lz += dip * Math.sin(Math.PI * w);
  const z = Math.exp(lz);
  let s = w;
  if (Math.abs(A.z - B.z) > 1e-3) s = clamp((1 / z - 1 / A.z) / (1 / B.z - 1 / A.z), 0, 1);
  return { cx: A.cx + (B.cx - A.cx) * s, cy: A.cy + (B.cy - A.cy) * s, z };
}

/** Where the camera is, which page lies where, and whether one is turning. */
function shot(m, sec) {
  if (m === 59) {
    if (sec < 50) return { cam: restCam(59), flip: null };
    if (sec < 53.8) return { cam: between(restCam(59), SPREAD, (sec - 50) / 3.8), flip: null };
    if (sec < 56) return { cam: SPREAD, flip: null };
    if (sec < 58.6) return { cam: SPREAD, flip: (sec - 56) / 2.6 };
    return { cam: SPREAD, flip: 1 };
  }
  if (m === 0 && sec < 2.7) return { cam: sec < 0.3 ? SPREAD : between(SPREAD, restCam(0), (sec - 0.3) / 2.4), flip: null };
  const long = m % 10 === 9;
  const g0 = long ? 57.2 : 57.7, g1 = long ? 59.0 : 58.9;
  if (sec < g0) return { cam: restCam(m), flip: null };
  return { cam: between(restCam(m), restCam(m + 1), (sec - g0) / (g1 - g0), long ? -1.15 : 0), flip: null };
}

export default {
  name: 'Crossword',
  blurb: 'A pencil solves a newspaper mini crossword every minute: 1-Across is the hour, the long answer is the minute; the page turns on the hour.',
  fps: 60,

  frame(g, ctx) {
    const f = ctx.fields, ms = ctx.date.getTime();
    ctx.lcd.backlight(1 - 0.65 * ctx.night);
    const m = f.m, sec = f.sec;
    const key = f.minuteKey;
    const paper = paperAt(f.h + f.m / 60);
    const { cam, flip } = shot(m, sec);
    const z = cam.z;
    // Whole pixels at rest, so print stays crisp.
    const ox = Math.round((80 - cam.cx * z) * 8) / 8, oy = Math.round((40 - cam.cy * z) * 8) / 8;
    const V = { ox: z > 0.999 ? Math.round(ox) : ox, oy: z > 0.999 ? Math.round(oy) : oy, zx: z, zy: z };

    // Which hour's page is where. pageKey(h offset) = minute key of that page's mini 0.
    const page0 = key - m;
    const turned = m === 59 && flip !== null && flip >= 0.5;
    const after = m === 59 && flip === 1;
    const rightPage = (flip !== null) ? page0 + 60 : page0;       // under a turning sheet: the next page
    const leftPage = (flip !== null && (turned || after)) ? page0 : page0 - 60;

    g.clear(DESK);
    const env = { g, ms, paper, back: mix(paper, 0x8a8478, 0.12) };

    // Left page: the back of the page turned last, with its puzzles showing through.
    drawBack(env, V, leftPage);
    // Right page.
    drawPage(env, V, rightPage, z);
    if (flip !== null && flip < 1) drawSheet(env, V, page0, flip, z);
    spine(env, V);

    // The pencil.
    let active = m, tau = sec, page = page0;
    if (m < 59 && sec >= 57.9) { active = m + 1; tau = sec - 60; }
    const L = layoutFor(page + active, active);
    const pose = pencilAt(miniScript(L), tau);
    const tx = V.ox + pose.x * z, ty = V.oy + pose.y * z;
    if (tx > -30 && tx < 190 && ty > -30 && ty < 110)
      drawPencil(g, tx, ty, pose.ang, z * (1 + 0.05 * pose.lift), pose.lift, pose.eraser);
  },
};

// ------------------------------------------------------------ pages

function layoutFor(miniKey, k) {
  const hour = new Date(miniKey * 60000).getHours();
  return miniLayout(hour, k, miniKey);
}

/** A world-space box on screen, at least a pixel each way if `min1`. */
function box(g, V, X, Y, W, H, c, a = 1, min1 = true) {
  let x0 = Math.round(V.ox + X * V.zx), x1 = Math.round(V.ox + (X + W) * V.zx);
  let y0 = Math.round(V.oy + Y * V.zy), y1 = Math.round(V.oy + (Y + H) * V.zy);
  if (x1 < x0) [x0, x1] = [x1, x0];
  if (y1 < y0) [y0, y1] = [y1, y0];
  if (min1 && x1 === x0) x1++;
  if (min1 && y1 === y0) y1++;
  if (x1 <= 0 || y1 <= 0 || x0 >= 160 || y0 >= 80) return;
  g.fillRect(x0, y0, x1 - x0, y1 - y0, c, { a });
}

const onScreen = (V, X, Y, W, H) => {
  const a = V.ox + X * V.zx, b = V.ox + (X + W) * V.zx, c = V.oy + Y * V.zy, d = V.oy + (Y + H) * V.zy;
  return Math.max(a, b) > 0 && Math.min(a, b) < 160 && Math.max(c, d) > 0 && Math.min(c, d) < 80;
};

/** Newsprint over a world rect: a faint mottle, and fibres when close. */
function paperRect(env, V, X, Y, W, H, base) {
  const { g } = env;
  let x0 = V.ox + X * V.zx, x1 = V.ox + (X + W) * V.zx, y0 = V.oy + Y * V.zy, y1 = V.oy + (Y + H) * V.zy;
  if (x1 < x0) [x0, x1] = [x1, x0];
  x0 = Math.max(0, Math.round(x0)); x1 = Math.min(160, Math.round(x1));
  y0 = Math.max(0, Math.round(y0)); y1 = Math.min(80, Math.round(y1));
  if (x1 <= x0 || y1 <= y0) return;
  const dark = mix(base, 0x7d7462, 0.16), z = Math.abs(V.zx);
  g.coarse((px, py) => {
    const wx = (px - V.ox) / V.zx, wy = (py - V.oy) / V.zy;
    return mix(base, dark, noise2(wx / 46, wy / 31, 5) * 0.75 + noise2(wx / 7, wy / 9, 6) * 0.25 * clamp(z, 0, 1));
  }, { cell: 8, box: [x0, y0, x1 - x0, y1 - y0] });
  if (z < 0.6) return;
  // Fibres: world-anchored specks.
  const s = 7, wx0 = Math.floor(((x0 - V.ox) / V.zx) / s), wx1 = Math.ceil(((x1 - V.ox) / V.zx) / s);
  const wy0 = Math.floor(((y0 - V.oy) / V.zy) / s), wy1 = Math.ceil(((y1 - V.oy) / V.zy) / s);
  for (let j = wy0; j < wy1; j++)
    for (let i = wx0; i < wx1; i++) {
      const h = hash(i, j, 31);
      if ((h & 7) > 2) continue;
      const px = V.ox + (i * s + ((h >>> 4) % s)) * V.zx, py = V.oy + (j * s + ((h >>> 9) % s)) * V.zy;
      g.pixel(px, py, (h >>> 14) & 1 ? 0x6e675a : 0xfffaf0, { a: 0.22 });
    }
}

function drawPage(env, V, pageKey, z) {
  const { g } = env;
  if (!onScreen(V, 0, 0, PW, PH)) return;
  paperRect(env, V, 0, 0, PW, PH, env.paper);
  masthead(env, V, pageKey);
  // Column rules and the rules between puzzles.
  for (let c = 1; c < 6; c++) box(g, V, miniX(c * 10) - 8, 60, 1, PH - 76, INK, 0.55);
  for (let k = 0; k < 60; k++) {
    const X = miniX(k), Y = miniY(k);
    if (!onScreen(V, X - 8, Y - 8, 176, 96)) continue;
    if (k % 10) box(g, V, X + 40, Y - 8, 80, 1, INK, clamp(z, 0.12, 0.4));
    drawMini(env, V, layoutFor(pageKey + k, k), (env.ms - (pageKey + k) * 60000) / 1000, false);
  }
  coffee(env, V, pageKey);
}

function masthead(env, V, pageKey) {
  const { g } = env;
  if (!onScreen(V, 0, 0, PW, 60)) return;
  box(g, V, 16, 8, PW - 32, 2, INK);
  box(g, V, 16, 53, PW - 32, 1, INK);
  const z = Math.abs(V.zx);
  const title = 'THE DAILY PUZZLE PAGE';
  const pitch = 44, x0 = (PW - title.length * pitch) / 2;
  if (z < 0.12) { box(g, V, x0, 18, title.length * pitch - 12, 26, INK, 0.45); return; }
  for (let i = 0; i < title.length; i++) {
    const ch = title[i];
    if (ch === ' ') continue;
    const X = x0 + i * pitch;
    for (const s of glyphOf(ch)) g.stroke(s.map(([u, v]) => [V.ox + (X + u * 5) * V.zx, V.oy + (17 + v * 3.6) * V.zy]), Math.max(1, 6 * z), INK, { aa: true });
  }
  const hour = new Date(pageKey * 60000).getHours();
  void hour;
}

/** The back of a turned page: its own columns of type, and last hour's grids showing through, mirrored. */
function drawBack(env, V, pageKey) {
  const { g } = env;
  if (!onScreen(V, -PW, 0, PW, PH)) return;
  paperRect(env, V, -PW, 0, PW, PH, env.back);
  const z = Math.abs(V.zx);
  for (let c = 0; c < 6; c++) {
    const X = -PW + 16 + c * MW;
    let Y = 64;
    let i = 0;
    while (Y < PH - 40) {
      const h = hash(pageKey, c, i++);
      let kind = h % 5;
      if (kind === 1 && Y >= PH - 160) kind = 2;
      if (kind === 0) { box(g, V, X, Y, 160, 12, INK, 0.5); Y += 18; }
      else if (kind === 1 && Y < PH - 160) { box(g, V, X, Y, 160, 110, 0x5a554c, 0.4); Y += 118; }
      else {
        const hh = 60 + (h >>> 8) % 160;
        const hb = Math.min(hh, PH - 30 - Y);
        if (z > 0.3) for (let y = 0; y < hb; y += 7) box(g, V, X, Y + y, y + 7 >= hb ? 90 : 160, 3, INK, 0.22);
        else box(g, V, X, Y, 160, hb, INK, 0.13);
        Y += hb + 8;
      }
    }
  }
  box(g, V, -PW + 16, 8, PW - 32, 2, INK, 0.7);
  // Show-through from the other side: the grids, mirrored and faint.
  for (let k = 0; k < 60; k++) {
    const L = layoutFor(pageKey + k, k);
    const X = miniX(k) + L.gx, W = L.ncol * CELL + 1;
    box(g, V, -(X + W), miniY(k) + GY, W, 43, INK, 0.07);
  }
}

/** The turning sheet: the old page front squeezing towards the spine, then its back. */
function drawSheet(env, V, pageKey, u, z) {
  const { g } = env;
  const th = Math.PI * ease.inOutQuad(u), s = Math.cos(th), lift = Math.sin(th);
  // Its shadow on the page below.
  const edge = PW * s;
  const sx0 = V.ox + Math.min(0, edge) * z, sx1 = V.ox + Math.max(edge, 0) * z + 70 * z * lift + 4;
  const y0 = V.oy, y1 = V.oy + PH * z;
  if (s > -0.98) {
    const xa = Math.max(0, Math.round(V.ox + Math.max(edge, 0) * z)), xb = Math.min(160, Math.round(sx1));
    if (xb > xa) g.gradient(xa, Math.round(y0), xb - xa, Math.round(y1 - y0), [0x2a2018, env.paper], { angle: 0, a: 0.35 * lift });
  }
  void sx0;
  const cy = PH / 2;
  const Vs = { ox: V.ox, oy: V.oy + cy * z - cy * z * (1 + 0.05 * lift), zx: z * s, zy: z * (1 + 0.05 * lift) };
  if (Math.abs(s) < 0.02) { box(g, V, 0, 0, 1, PH, mix(env.paper, INK, 0.5)); return; }
  if (s > 0) {
    drawPage(env, Vs, pageKey, z);
    box(g, Vs, 0, 0, PW, PH, 0x2a2018, 0.35 * (1 - s));
  } else {
    paperRect(env, Vs, 0, 0, PW, PH, env.back);
    for (let k = 0; k < 60; k++) {
      const L = layoutFor(pageKey + k, k);
      box(g, Vs, miniX(k) + L.gx, miniY(k) + GY, L.ncol * CELL + 1, 43, INK, 0.07);
    }
    box(g, Vs, 0, 0, PW, PH, 0x2a2018, 0.3 * (1 + s));
  }
}

function spine(env, V) {
  const { g } = env;
  const x = V.ox, w = Math.max(2, 26 * Math.abs(V.zx));
  if (x + w < 0 || x - w > 160) return;
  const y0 = Math.max(0, Math.round(V.oy)), y1 = Math.min(80, Math.round(V.oy + PH * V.zy));
  const xa = Math.max(0, Math.round(x - w)), xb = Math.min(160, Math.round(x + w));
  if (xb > xa && y1 > y0)
    g.gradient(xa, y0, xb - xa, y1 - y0, [[0, env.paper], [0.5, 0x5a4a38], [1, env.paper]], { angle: 0, a: 0.35 });
}

function coffee(env, V, pageKey) {
  const { g } = env;
  const z = Math.abs(V.zx);
  if (z < 0.15 || V.zx !== V.zy) return;
  const h = hash(pageKey, 77);
  const k = h % 60;
  const X = miniX(k) + 120 + (h >>> 8) % 40, Y = miniY(k) + 50 + (h >>> 14) % 40;
  if (!onScreen(V, X - 40, Y - 40, 80, 80)) return;
  const cx = V.ox + X * z, cy = V.oy + Y * z;
  g.ring(cx, cy, 30 * z, 32.5 * z, 0x7a4a22, { aa: true, a: 0.16 });
  g.ring(cx, cy, 24 * z, 30.5 * z, 0x8a5a2b, { aa: true, a: 0.06 });
  g.ring(cx + 2 * z, cy - 1 * z, 28 * z, 29.5 * z, 0x7a4a22, { aa: true, a: 0.08 });
}

// ------------------------------------------------------------ a mini

function drawMini(env, V, L, tau, faint) {
  const { g } = env;
  const X0 = miniX(L.k), Y0 = miniY(L.k);
  if (!onScreen(V, X0, Y0, 160, 80)) return;
  const z = Math.abs(V.zx), text = z > 0.97 && V.zy > 0.97 && V.zx > 0;
  const sx = (X) => V.ox + X * V.zx, sy = (Y) => V.oy + Y * V.zy;

  // Header.
  if (text) {
    g.text(`MINI CROSSWORD ${L.header}`, Math.round(sx(X0)), Math.round(sy(Y0 + 1)), { font: font3x5, c: INK });
    const w = L.edition.length * 4 - 1;
    g.text(L.edition, Math.round(sx(X0 + 160 - w)), Math.round(sy(Y0 + 1)), { font: font3x5, c: INK });
  } else if (z > 0.1) {
    box(g, V, X0, Y0 + 1, 83, 5, INK, 0.35);
    box(g, V, X0 + 160 - L.edition.length * 4, Y0 + 1, L.edition.length * 4 - 1, 5, INK, 0.35);
  }
  box(g, V, X0, Y0 + 7, 160, 1, INK, text ? 1 : clamp(z * 1.6, 0.15, 0.7));

  // Grid: ink over everything, then the unprinted cells.
  const gx0 = X0 + L.gx, gy0 = Y0 + GY, gw = L.ncol * CELL + 1;
  box(g, V, gx0, gy0, gw, 43, SQUARE);
  const pitch = CELL * z, lines = pitch >= 3;
  const done = tau >= 60;
  for (let r = 0; r < 3; r++) {
    const row = L.cell[r];
    let c = 0;
    while (c < L.ncol) {
      if (!row[c]) { c++; continue; }
      let c1 = c + 1;
      if (!lines) while (c1 < L.ncol && row[c1]) c1++;
      let xa = Math.round(sx(gx0 + c * CELL)), xb = Math.round(sx(gx0 + c1 * CELL));
      let ya = Math.round(sy(gy0 + r * CELL)), yb = Math.round(sy(gy0 + (r + 1) * CELL));
      if (xb < xa) [xa, xb] = [xb, xa];
      if (lines) { xa++; ya++; }
      if (xb <= xa) xb = xa + 1;
      if (yb <= ya) yb = ya + 1;
      // From far away a solved cell is just greyer.
      const col = !lines && done ? mix(env.paper, LEAD, 0.38) : env.paper;
      g.fillRect(xa, ya, xb - xa, yb - ya, col);
      c = c1;
    }
  }
  if (z >= 0.6) {   // a heavier outer frame, as printed
    const xa = Math.round(sx(gx0)) - 1, ya = Math.round(sy(gy0)) - 1;
    g.rect(xa, ya, Math.round(sx(gx0 + gw)) - xa + 1, Math.round(sy(gy0 + 43)) - ya + 1, SQUARE);
  }
  if (text)
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < L.ncol; c++)
        if (L.num[r][c]) g.text(String(L.num[r][c]), Math.round(sx(gx0 + c * CELL)) + 2, Math.round(sy(gy0 + r * CELL)) + 2, { font: font3x5, c: INK });

  // Graphite.
  if (lines && tau > -3) drawInk(env, V, L, tau, z);

  // Clues.
  for (let i = 0; i < 3; i++) {
    const s = L.clues[i];
    if (!s) continue;
    if (text) g.text(s, Math.round(sx(X0)), Math.round(sy(Y0 + CLUE_Y[i])), { font: font3x5, c: INK });
    else if (z > 0.1) box(g, V, X0, Y0 + CLUE_Y[i] + 1, s.length * 4 - 1, 3, INK, 0.3);
  }
  void faint;
}

function drawInk(env, V, L, tau, z) {
  const { g } = env;
  const S = miniScript(L);
  const sx = (X) => V.ox + X * V.zx, sy = (Y) => V.oy + Y * V.zy;
  const strokes = z >= 0.45;
  const w = Math.max(0.9, 1.5 * z);
  for (const e of S.ink) {
    if (tau < e.t0) continue;
    const p = clamp((tau - e.t0) / (e.t1 - e.t0), 0, 1);
    const er = e.erase ? clamp((tau - e.erase[0]) / (e.erase[1] - e.erase[0]), 0, 1) : 0;
    const [x0, y0] = cellXY(L, e.r, e.c);
    if (strokes) {
      const { done } = letterAt(e.L, p);
      const a = 0.95 * (1 - 0.86 * er);
      for (const s of done) g.stroke(s.map(([x, y]) => [sx(x), sy(y)]), w, LEAD, { aa: true, a });
      if (er > 0) {
        const cx = sx(x0 + 7.5), cy = sy(y0 + 7.5);
        g.fillEllipse(cx, cy, 5.6 * z, 4.6 * z, LEAD, { aa: true, a: 0.12 * er });
        g.thickLine(cx - 4.5 * z, cy - 1.5 * z, cx + 4 * z, cy - 2.2 * z, 0.8 * z, LEAD, { aa: true, a: 0.1 * er });
        g.thickLine(cx - 4 * z, cy + 2 * z, cx + 4.5 * z, cy + 1.2 * z, 0.8 * z, LEAD, { aa: true, a: 0.08 * er });
      }
    } else box(g, V, x0 + 2, y0 + 2, 11, 11, LEAD, 0.4 * p * (1 - 0.8 * er));
    // Eraser crumbs: fall as it rubs, brushed away a couple of seconds later.
    if (e.erase && tau > e.erase[0] && tau < e.erase[1] + 4.5) {
      const [e0, e1] = e.erase;
      for (let i = 0; i < 8; i++) {
        const born = e0 + ((i + 0.5) / 8) * (e1 - e0);
        if (tau < born) continue;
        const h = hash(L.key, i, 55);
        const ang = (h % 628) / 100, rad = 5 + ((h >>> 10) % 60) / 10;
        let bx = x0 + 7.5 + Math.cos(ang) * rad, by = y0 + 7.5 + Math.sin(ang) * rad * 0.8;
        const brush = Math.max(0, tau - e1 - 2.2);
        bx += brush * brush * 40; by += brush * brush * 14;
        const sz = 1 + ((h >>> 20) & 1);
        box(g, V, bx, by, sz, (h >>> 21) & 1 ? 1 : sz, ERASER_BITS[(h >>> 24) % 3], 0.9);
      }
    }
  }
}
