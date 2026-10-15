// Garbage Time: the 64 x 192 tower is a falling-block well, and the time is
// the garbage at the bottom of it. Hours over minutes, each a band of grey
// garbage rows with the numerals inlaid in bright tetrominoes, every row one
// cell short of complete: the right-hand column is left open, a chimney, the
// way real players keep a well for the long bar.
//
// Above the time an AI plays on: pieces fall, rotate and slide in smoothly,
// build four rows with a one-column well and finish them with a long bar
// (a four-line clear), twice a minute. On the left wall the
// incoming-garbage meter fills over the minute. At :00 a train of long bars
// drops down the chimney, the minute band completes and clears (flash, wipe
// from the centre out), the hours fall, and the new minute rises from the
// floor as fresh garbage, lifting the hours back. On the hour eight bars drop:
// the whole stack clears in one 32-line flash, the level (palette) changes
// and the new hour and minute rise in its colours, carrying a rocket that
// lifts off from the top of the stack.
import * as kit from '../js/kit.js';
import { cellsOf, PIECES, GLYPHS, GW, GH, tile, strip } from './tetris-font.js';

const W = 64, H = 192, CS = 4, COLS = 14, X0 = 4;
const ROWS = 48, CHIM = 13, BAND = 16, HB = 16, MB = 32, PR = 4, PLAY = HB - PR, NP = COLS * PR / 4 ;   // rows; pieces per four-line build
const img = new Float32Array(3 * W * H);

// ---- palette: NES-style levels, two hues per level (hour % 12)
const LEVELS = [
  ['#4f8cff', '#58e0ff'], ['#38d048', '#c8f030'], ['#c050ff', '#ff6890'], ['#5890ff', '#60e870'],
  ['#ff4078', '#58f0a8'], ['#40e8b0', '#8c98ff'], ['#ff6030', '#ffd848'], ['#a070ff', '#ff5070'],
  ['#5890ff', '#ff6838'], ['#ff5a30', '#ffb050'], ['#20d8d8', '#ff70b0'], ['#ffc830', '#58b0ff'],
].map(([a, b]) => ({ A: kit.hex(a), B: kit.hex(b) }));
// every block colour brought to about the same luminance, so a numeral made
// of different pieces still reads as one shape, and hue alone tells the pieces apart
const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const level = (c, Y = 0.36) => kit.scale(c, Math.min(1, Y / lum(c)));
const WHITE = [1, 1, 1];
const STYLE = { I: 0, O: 0, T: 0, J: 1, S: 1, L: 2, Z: 2 };   // 0 white core in A, 1 solid A, 2 solid B
const WALL = 99, DIG = 10;   // band codes: garbage, digit piece (DIG + value step); -1 empty

// ---- cell sprite: 3x3 lit on a 4 px pitch (1 px black seam), glint top-left
const cA = new Float32Array(3), cB = new Float32Array(3), cC = new Float32Array(3);
function setc(t, c, k) { t[0] = c[0] * k; t[1] = c[1] * k; t[2] = c[2] * k; }
function plot(x, y, c, a) {
  if (x < 0 || y < 0 || x >= W || y >= H || a <= 0) return;
  const p = 3 * (y * W + x);
  img[p] += c[0] * a; img[p + 1] += c[1] * a; img[p + 2] += c[2] * a;
}
/** Plot pixel (x, y) float with bilinear coverage. */
function plotF(ix, iy, fx, fy, c, a) {
  plot(ix, iy, c, a * (1 - fx) * (1 - fy));
  if (fx > 0) plot(ix + 1, iy, c, a * fx * (1 - fy));
  if (fy > 0) { plot(ix, iy + 1, c, a * (1 - fx) * fy); if (fx > 0) plot(ix + 1, iy + 1, c, a * fx * fy); }
}
/**
 * One block at pixel (px, py) (top-left, float). style 0..3, palette P,
 * a = opacity, wh = flash toward white.
 */
function block(px, py, style, P, a, wh = 0) {
  if (a <= 0.003 || py > H || py < -4) return;
  const ix = Math.floor(px), iy = Math.floor(py), fx = px - ix, fy = py - iy;
  if (style === WALL) {
    // garbage: a flat, dim 2x2 tile, quiet texture that stays out of the digits' way
    setc(cA, P.wall, 1);
    if (wh > 0) { cA[0] += (1 - cA[0]) * wh; cA[1] += (1 - cA[1]) * wh; cA[2] += (1 - cA[2]) * wh; }
    for (let j = 1; j < 3; j++) for (let i = 1; i < 3; i++) plotF(ix + i, iy + j, fx, fy, cA, a);
    return;
  }
  // a piece block: full 4x4, lit bevel top-left, shadow bottom-right, glint
  const sh = P.shade[style];
  setc(cA, sh[0], 1); setc(cB, sh[1], 1); setc(cC, sh[2], 1);
  if (wh > 0) for (const t of [cA, cB, cC]) { t[0] += (1 - t[0]) * wh; t[1] += (1 - t[1]) * wh; t[2] += (1 - t[2]) * wh; }
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
    const c = i === 3 || j === 3 ? cC : i === 0 || j === 0 ? cB : cA;
    plotF(ix + i, iy + j, fx, fy, c, a);
  }
  if (wh < 1) plotF(ix, iy, fx, fy, WHITE, a * 0.5 * (1 - wh));
}
const colX = (c) => X0 + c * CS;
const rowY = (r) => r * CS;

// ---- bands: 16 rows x 14 cols, two glyphs cut into tetrominoes, garbage around.
// Each digit sits in a one-cell black moat and its counters stay empty, so the
// silhouette is clean; the pieces of one digit share a hue and differ in value.
const bands = new Map();
// each digit cut into tetrominoes once, a different cut for the left and right slot
const CUTS = [0, 1].map((slot) => Object.fromEntries([...'0123456789'].map((d) => [d, tile(GLYPHS[d], 11 + 7 * +d + 3 * slot)])));
function band(d1, d2) {
  const key = d1 + d2;
  if (bands.has(key)) return bands.get(key);
  const k = new Int8Array(BAND * COLS).fill(WALL);
  for (let r = 0; r < BAND; r++) k[r * COLS + CHIM] = -1;
  [[d1, 0], [d2, 7]].forEach(([d, x0], slot) => {
    CUTS[slot][d].forEach((pc, n) => { for (const [x, y] of pc.cells) k[(y + 2) * COLS + x0 + x] = DIG + (n % 3); });
  });
  // moat: garbage cells touching a digit (8-neighbourhood) go dark
  const dig = (r, c) => r >= 0 && r < BAND && c >= 0 && c < COLS && k[r * COLS + c] >= DIG && k[r * COLS + c] < WALL;
  const moat = [];
  for (let r = 0; r < BAND; r++) for (let c = 0; c < COLS; c++) {
    if (k[r * COLS + c] !== WALL) continue;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (dig(r + dr, c + dc)) { moat.push(r * COLS + c); dr = dc = 2; }
  }
  for (const p of moat) k[p] = -1;
  // counters: empty cells not reachable from the band's edge stay empty (already),
  // and garbage enclosed by a digit is cleared too
  const seen = new Uint8Array(BAND * COLS), st = [];
  for (let r = 0; r < BAND; r++) for (let c = 0; c < COLS; c++) if ((r === 0 || r === BAND - 1 || c === 0 || c === COLS - 1) && !dig(r, c)) { seen[r * COLS + c] = 1; st.push(r * COLS + c); }
  while (st.length) {
    const p = st.pop(), r = (p / COLS) | 0, c = p % COLS;
    for (const [rr, cc] of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]) {
      if (rr < 0 || rr >= BAND || cc < 0 || cc >= COLS || seen[rr * COLS + cc] || dig(rr, cc)) continue;
      seen[rr * COLS + cc] = 1; st.push(rr * COLS + cc);
    }
  }
  for (let p = 0; p < k.length; p++) if (!seen[p] && k[p] === WALL) k[p] = -1;
  bands.set(key, k);
  return k;
}
/** Draw a band with its top at row `top` (float); wipe(r, c) -> [alpha, white]. */
function drawBand(k, top, P, wipe, hue) {
  for (let r = 0; r < BAND; r++) {
    const y = rowY(top + r);
    if (y >= H || y < -4) continue;
    for (let c = 0; c < COLS; c++) {
      const s = k[r * COLS + c];
      if (s < 0) continue;
      let a = 1, wh = 0;
      if (wipe) { const w = wipe(r, c); a = w[0]; wh = w[1]; }
      block(colX(c), y, s === WALL ? WALL : 3 + 3 * hue + s - DIG, P, a, wh);
    }
  }
}
// The line-clear: rows go white, then the blocks vanish from the centre out.
const WP = [1, 0], NOWIPE = [1, 0];
function wipeAt(w, c) {
  if (w <= 0) { WP[0] = 1; WP[1] = 0; return WP; }
  const d = Math.abs(c + 0.5 - COLS / 2) / (COLS / 2);
  const v = 0.35 + 0.55 * d;
  WP[0] = 1 - kit.smoothstep(v - 0.12, v, w);
  WP[1] = kit.smoothstep(0, 0.2, w) * 0.85;
  return WP;
}

// ---- play: pre-solved four-row builds, each finished by an I down its well
const STRIPS = [];
for (let s = 1; STRIPS.length < 24 && s < 400; s++) { const q = strip(COLS, PR, s, [CHIM], Math.floor(kit.hash(s, 9) * CHIM)); if (q) STRIPS.push(q); }

const pals = new Map();
function palette(hour) {
  const key = hour % 12;
  if (!pals.has(key)) pals.set(key, makePalette(key));
  return pals.get(key);
}
function makePalette(key) {
  const L = LEVELS[key];
  const g = kit.mix([0.62, 0.66, 0.74], L.A, 0.12);
  const A = level(L.A), B = level(L.B), C = level(kit.mix(L.A, WHITE, 0.3), 0.42);
  // shade[style] = [face, lit bevel, shadow bevel]. 0..2: the AI's play pieces
  // (dimmer, so the play stack never merges with the hours); 3..5 the hours'
  // hue A in three values; 6..8 the minutes' hue B in three values.
  const bev = (c) => [c, kit.mix(c, WHITE, 0.4), kit.scale(c, 0.42)];
  const vals = (c) => [level(kit.mix(c, WHITE, 0.22), 0.44), c, kit.scale(c, 0.68)].map(bev);
  const shade = [...[C, A, B].map((c) => bev(kit.scale(kit.mix(c, [lum(c), lum(c), lum(c)], 0.45), 0.42))), ...vals(A), ...vals(B)];
  return { A, B, C, shade, wall: kit.scale(g, 0.045) };
}

const pad = (n) => String(n).padStart(2, '0');
const TURN = { drop: 0.32, wipe: 0.4, fall: 0.3, rise: 0.9 };
const HOUR = { drop: 0.45, wipe: 0.5, rise: 0.9 };

/** A falling piece: cells in pixels at local time u (s), duration dp. */
const PC = new Float32Array(8);
function pieceCells(p, r, tx, ty, u, fallT) {
  const n = PIECES[p].n, spawnX = 7, spawnY = -3;
  const f = kit.clamp(u / fallT);
  const by = spawnY + (ty - spawnY) * f;
  const lx = kit.ease.inOut(kit.clamp((f - 0.42) / 0.3));
  const bx = spawnX + (tx - spawnX) * lx;
  // rotation: r clockwise steps (3 = one counter-clockwise), each eased along an arc
  const steps = r === 3 ? -1 : r, ns = Math.abs(steps);
  let st = 0, part = 0;
  for (let k = 0; k < ns; k++) {
    const e = kit.ease.inOut(kit.clamp((f - 0.06 - 0.09 * k) / 0.08));
    if (e >= 1) st++; else { part = e; break; }
  }
  const dir = Math.sign(steps) || 1;
  const cur = cellsOf(p, ((st * dir) % 4 + 4) % 4), ang = part * dir * Math.PI / 2;
  const ca = Math.cos(ang), sa = Math.sin(ang), m = (n - 1) / 2;
  for (let q = 0; q < 4; q++) {
    const dx = cur[q][0] - m, dy = cur[q][1] - m;
    PC[2 * q] = colX(bx + m + dx * ca - dy * sa);
    PC[2 * q + 1] = rowY(by + m + dx * sa + dy * ca);
  }
  return { bx, by, st: part > 0.5 ? st + 1 : st, dir };
}

// ---- the hour: a rocket launch, as at the end of the old handheld game
const ROCKET = [
  '......W......', '.....WWW.....', '.....WRW.....', '....WRRRW....', '....WRRRW....', '....WWWWW....',
  '...WWWWWWW...', '...WWBBBWW...', '...WBBCBBW...', '...WBBBBBW...', '...WWBBBWW...', '...WWWWWWW...',
  '...WWWWWWW...', '...WGWWWGW...', '...WWWWWWW...', '...RRRRRRR...', '...WWWWWWW...', '...WWWWWWW...',
  '..RWWWWWWWR..', '.RRWWWWWWWRR.', 'RRRWWWWWWWRRR', 'RRR.GGGGG.RRR', 'RR...GGG...RR', '.....GGG.....',
];
const RS = 2, RH = ROCKET.length * RS, RW = 13, RX = 32 - 6.5 * RS;   // drawn at 2x: chunky, like the sprite it quotes
const SMOKE = [0.16, 0.16, 0.18];
function disc(cx, cy, r, c, a) {
  const x0 = Math.max(0, Math.floor(cx - r - 1)), x1 = Math.min(W - 1, Math.ceil(cx + r + 1));
  const y0 = Math.max(0, Math.floor(cy - r - 1)), y1 = Math.min(H - 1, Math.ceil(cy + r + 1));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const d = Math.hypot(x - cx, y - cy);
    const k = kit.clamp(r + 0.5 - d) * (1 - 0.5 * d / (r + 0.5));
    if (k > 0) plot(x, y, c, a * k);
  }
}
/** u: seconds since the new stack settled; base: pixel row of the stack top. */
function rocket(u, base, P, now) {
  const LIFT = 0.65, ACC = 140;
  const lift = u > LIFT ? 0.5 * ACC * (u - LIFT) ** 2 : 0;
  const shake = u > 0.2 && u < LIFT + 0.4 ? 0.35 * Math.sin(now * 90) : 0;
  const top = base - RH - lift;
  if (top + RH + 60 < 0) return;
  // body
  const WHT = kit.scale([1, 0.95, 0.9], 0.55), RED = P.B, WIN = P.A, GRY = [0.12, 0.12, 0.14];
  const fy = top - Math.floor(top), iy = Math.floor(top), fx = shake - Math.floor(shake), ix = Math.floor(RX + shake);
  for (let j = 0; j < ROCKET.length; j++) {
    const row = ROCKET[j];
    for (let i = 0; i < RW; i++) {
      const ch = row[i];
      if (ch === '.') continue;
      const c = ch === 'W' ? WHT : ch === 'R' ? RED : ch === 'B' ? WIN : ch === 'C' ? WHITE : GRY;
      const a = i < 6 && ch === 'W' ? 1 : 0.8;   // light from the left
      for (let q = 0; q < RS * RS; q++) plotF(ix + i * RS + (q % RS), iy + j * RS + ((q / RS) | 0), fx, fy, c, a);
    }
  }
  // flame from the nozzle
  const ign = kit.smoothstep(0.2, 0.55, u);
  if (ign > 0) {
    const len = ign * (10 + 16 * kit.clamp((u - LIFT) * 2) + 2.5 * kit.noise2(now * 14, 3));
    const ny = top + RH;
    const room = lift + 3;   // on the pad the fire splashes out sideways as smoke, not into the stack
    for (let k = 0; k < Math.min(len + 2, room); k++) {
      const t = k / len, half = 4.2 * (1 - t * t) + 0.6;
      const col = kit.mix([1, 0.92, 0.6], [1, 0.32, 0.05], kit.clamp(t * 1.3));
      for (let x = Math.floor(32 - half - 1); x <= Math.ceil(32 + half); x++) {
        const cov = kit.clamp(half + 0.5 - Math.abs(x + 0.5 - 32 - shake)) * kit.clamp(len - k + 1);
        if (cov > 0) plotF(x, Math.floor(ny + k), 0, fy, col, cov * (1 - 0.6 * t));
      }
    }
  }
  // smoke: puffs billow sideways along the stack top, then a trail
  for (let i = 0; i < 44; i++) {
    const tb = 0.3 + i * 0.035, a = u - tb;
    if (a < 0 || a > 1.8) continue;
    const ground = i < 22, side = i % 2 ? 1 : -1;
    const liftB = tb > LIFT ? 0.5 * ACC * (tb - LIFT) ** 2 : 0;
    const x0 = 32 + side * 4, y0 = base - liftB + 2;
    const sp = ground ? 14 + 22 * kit.hash(i, 1) : 3 + 6 * kit.hash(i, 1);
    const g = 1 - Math.exp(-2.2 * a);
    const cx = x0 + side * sp * g, cy = (ground ? Math.min(y0, base - 1) : y0) - (ground ? 3 * g : -2 * g);
    disc(cx, cy, 2 + 6 * g, SMOKE, 0.9 * (1 - a / 1.8) ** 1.5);
  }
}

export default {
  name: 'Garbage Time',
  blurb: 'a falling-block well where the time is the garbage: bars drop down the chimney to clear the minute, new rows rise from the floor',
  layouts: ['hub-tall3'], look: 'smoke', fps: 60, brightness: 0.4,
  frame(ctx) {
    img.fill(0);
    const now = ctx.date.getTime() / 1000, M0 = Math.floor(now / 60) * 60, s = now - M0;
    const cur = new Date(M0 * 1000), prev = new Date((M0 - 60) * 1000);
    const hh = pad(cur.getHours()), mm = pad(cur.getMinutes());
    const ph = pad(prev.getHours()), pm = pad(prev.getMinutes());
    const hourTurn = cur.getMinutes() === 0;
    const P = palette(cur.getHours()), PP = palette(prev.getHours());

    // ---------------- the stack (time) and the turn
    const T = hourTurn ? HOUR : TURN;
    const tWipe = T.drop, tFall = T.drop + T.wipe, tRise = hourTurn ? tFall : tFall + T.fall, tEnd = tRise + T.rise;
    let meter = 0, rocketY = null;
    if (s < tWipe + T.wipe) {
      // old stack, the bar train dropping down the chimney, then the clear
      const land = hourTurn ? HB : MB, len = ROWS - land;
      const w = (s - tWipe) / T.wipe;
      const wipeRow = (r0) => (r, c) => {
        if (!hourTurn) return wipeAt(w, c);
        const row = r0 + r, stag = (ROWS - 1 - row) / (2 * BAND) * 0.35;   // the 32-line clear ripples upward
        return wipeAt((s - tWipe - stag * T.wipe * 0.6) / (T.wipe * 0.79), c);
      };
      drawBand(band(ph[0], ph[1]), HB, hourTurn ? PP : P, hourTurn && s >= tWipe ? wipeRow(HB) : null, 0);
      drawBand(band(pm[0], pm[1]), MB, PP, s >= tWipe ? wipeRow(MB) : null, 1);
      const e = kit.ease.in(kit.clamp(s / T.drop));
      const top = -len - 2 + (land + len + 2) * e;                    // rows
      for (let q = 0; q < len; q++) {
        const row = top + q;
        let a = 1, wh = 0;
        if (s >= tWipe) { const wr = wipeRow(land)(row - land, CHIM); a = wr[0]; wh = wr[1]; }
        block(colX(CHIM), rowY(row), 0, PP, a, wh);
      }
      // speed streak above the falling train
      if (s < tWipe + 0.12) {
        const fade = 1 - kit.clamp((s - tWipe) / 0.12), y0 = rowY(top);
        for (let y = Math.max(0, Math.floor(y0 - 70)); y < Math.min(H, y0); y++) {
          const k = (1 - (y0 - y) / 70) ** 2 * 0.35 * fade;
          for (let x = 1; x < 3; x++) plot(colX(CHIM) + x, y, PP.A, k);
        }
      }
      meter = 1;
      // the screen flash of a big clear
      if (s >= tWipe) {
        const fl = Math.max(0, Math.sin(kit.clamp(w) * Math.PI * (hourTurn ? 3 : 1))) * (hourTurn ? 0.05 : 0.025);
        if (fl > 0) for (let p = 0; p < img.length; p += 3) { img[p] += fl * PP.A[0]; img[p + 1] += fl * PP.A[1]; img[p + 2] += fl * PP.A[2]; }
      }
    } else if (s < tRise) {
      // minute turn: the hours fall into the cleared rows
      const e = kit.ease.in(kit.clamp((s - tFall) / T.fall));
      drawBand(band(hh[0], hh[1]), HB + (MB - HB) * e, P, null, 0);
      meter = 1;
    } else if (s < tEnd) {
      // fresh garbage rises from the floor and lifts the hours back
      const e = (hourTurn ? kit.ease.out : kit.ease.inOut)(kit.clamp((s - tRise) / T.rise));
      rocketY = rowY(HB + (hourTurn ? 2 * BAND : BAND) * (1 - e));
      const d = (hourTurn ? 2 * BAND : BAND) * (1 - e);
      drawBand(band(hh[0], hh[1]), HB + d, P, null, 0);
      drawBand(band(mm[0], mm[1]), MB + d, P, null, 1);
      meter = 1 - e;
    } else {
      drawBand(band(hh[0], hh[1]), HB, P, null, 0);
      drawBand(band(mm[0], mm[1]), MB, P, null, 1);
      meter = 0;
    }

    // ---------------- the game above: build four rows around a well, then the long bar
    if (hourTurn && s >= tEnd) rocketY = rowY(HB);
    if (hourTurn && rocketY !== null) rocket(s - tEnd, rocketY, P, now);
    const play0 = tEnd + (hourTurn ? 2.0 : 0.15), play1 = 59.35, NC = 2;
    const cyc = (play1 - play0) / NC, dp = (cyc + 0.27) / NP, fallT = dp - 0.32;
    let nextPiece = 'I';
    if (s >= play0) {
      const ci = Math.min(NC - 1, Math.floor((s - play0) / cyc)), cs = play0 + ci * cyc;
      const seqs = [0, 1].map((k) => STRIPS[Math.floor(kit.hash(M0 / 60, ci + k) * STRIPS.length)]);
      const seq = seqs[0];
      // previous cycle's rows clearing, as the new cycle starts
      const u0 = s - cs;
      let ki = Math.min(NP - 1, Math.floor(u0 / dp));
      const fill = (sq, n, wipeW) => {
        for (let k = 0; k < n; k++) {
          const pc = sq[k];
          for (const [x, y] of pc.cells) {
            const wr = wipeW != null ? wipeAt(wipeW, x) : NOWIPE;
            block(colX(x), rowY(PLAY + y), STYLE[pc.p], P, wr[0], wr[1]);
          }
        }
      };
      const lastLock = (NP - 1) * dp + fallT;
      if (ci > 0 && u0 + cyc - lastLock < 0.45) {
        fill(STRIPS[Math.floor(kit.hash(M0 / 60, ci - 1) * STRIPS.length)], NP, (u0 + cyc - lastLock) / 0.45);
      }
      if (u0 >= lastLock) {
        fill(seq, NP, (u0 - lastLock) / 0.45);
      } else {
        fill(seq, ki, null);
        const pc = seq[ki], u = u0 - ki * dp;
        const tp = pieceCells(pc.p, pc.r, pc.x, pc.y + PLAY, u, fallT);
        const st = STYLE[pc.p];
        const lock = u >= fallT ? 1 - kit.clamp((u - fallT) / 0.25) : 0;
        // ghost: where it would land now
        const gc = Math.round(tp.bx), gr = ((tp.st * tp.dir) % 4 + 4) % 4;
        const near = 1 - 2 * Math.abs(tp.bx - gc);
        if (u < fallT && near > 0) {
          const cells = cellsOf(pc.p, gr);
          let oy = 99;
          for (const [cx, cy] of cells) {
            const col = gc + cx;
            let top = col === CHIM ? ROWS : HB;
            for (let k = 0; k < ki; k++) for (const [x, y] of seq[k].cells) if (x === col && PLAY + y < top) top = PLAY + y;
            oy = Math.min(oy, top - cy - 1);
          }
          const gcol = st === 2 ? P.B : P.A;
          for (const [cx, cy] of cells) {
            const gx = colX(gc + cx), gy = rowY(oy + cy);
            if (gy < rowY(tp.by + cy) + 2) continue;
            for (let i = 0; i < 3; i++) { plot(gx + i, gy, gcol, 0.4 * near); plot(gx + i, gy + 2, gcol, 0.4 * near); }
            plot(gx, gy + 1, gcol, 0.4 * near); plot(gx + 2, gy + 1, gcol, 0.4 * near);
          }
        }
        // the falling piece burns bright, then settles to the play stack's dimmer level
        for (let q = 0; q < 4; q++) block(PC[2 * q], PC[2 * q + 1], st, P, u < fallT ? 2.2 : 1 + 1.2 * lock, lock * 0.5);
      }
      nextPiece = ki < NP - 1 ? seq[ki + 1].p : ci < NC - 1 ? seqs[1][0].p : 'I';
      if (u0 >= lastLock) nextPiece = ci < NC - 1 ? seqs[1][0].p : 'I';
      if (ci === NC - 1 && ki === NP - 1) nextPiece = 'I';
    }

    // ---------------- HUD: NEXT window, walls, incoming-garbage meter
    const frame = kit.scale(kit.mix([0.55, 0.6, 0.7], P.A, 0.3), 0.16);
    for (let x = 4; x < 28; x++) { plot(x, 2, frame, 1); plot(x, 15, frame, 1); }
    for (let y = 3; y < 15; y++) { plot(4, y, frame, 1); plot(27, y, frame, 1); }
    {
      const p = nextPiece, c = cellsOf(p, 0).map(([x, y]) => [x, y - (p === 'I' ? 1 : 0)]);
      const wpx = (p === 'I' ? 4 : p === 'O' ? 2 : 3) * CS, hpx = (p === 'I' ? 1 : 2) * CS;
      const ox = 16 - wpx / 2 + 0.5, oy = 9 - hpx / 2 + 0.5;
      for (const [x, y] of c) block(ox + x * CS, oy + y * CS, STYLE[p], P, 0.9);
    }
    const wallC = kit.scale(kit.mix([0.5, 0.55, 0.7], P.A, 0.25), 0.1), wallE = kit.scale(kit.mix([0.6, 0.65, 0.8], P.A, 0.3), 0.22);
    for (let y = 18; y < H; y++) {
      plot(0, y, wallC, 1); plot(3, y, wallE, 1); plot(60, y, wallE, 1); plot(63, y, wallC, 1);
      plot(1, y, wallC, 0.5); plot(2, y, wallC, 0.5); plot(61, y, wallC, 0.5); plot(62, y, wallC, 0.5);
    }
    // incoming garbage: fills the minute's 16 rows over 60 s (32 in the hour's last minute)
    const lastOfHour = cur.getMinutes() === 59;
    const mh = s < tEnd && s >= 0 && meter > 0 ? meter * (hourTurn ? 2 : 1) * BAND * CS : (s / 60) * (lastOfHour ? 2 : 1) * BAND * CS;
    const RED = kit.hex('#ff3018');
    for (let y = H - 1; y >= H - mh - 1 && y >= 18; y--) {
      const k = Math.min(1, H - y - 0 > mh ? (mh - (H - 1 - y)) : 1);
      if (k <= 0) continue;
      const seam = (H - 1 - y) % CS === CS - 1 ? 0.3 : 1;
      plot(1, y, RED, 0.7 * k * seam); plot(2, y, RED, 0.7 * k * seam);
    }

    kit.blitGrid(ctx, img, 1 - 0.7 * ctx.night);
  },
};
