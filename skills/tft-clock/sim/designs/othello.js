// Othello: a close-up of a long felt Reversi board, every square filled.
// The time is written in discs, 3x5 a digit, and the board changes hands
// every minute: on even minutes white owns the field and the time is black,
// on odd minutes the reverse.
//
// The minute turn is one move. Before :00 the digits that are about to
// change are captured (flipped into the field colour, so nothing wrong is
// ever on the board). A disc at the board's margin rocks, is flicked up
// like a coin, spins across the board with its shadow racing beneath and
// lands in the empty square at :00. From there the capture runs out along
// Othello's eight lines and then fills in between: every disc flips except
// the ones that spell the new time, which are simply the discs the
// cascade leaves alone. On the hour the move is a corner, tossed higher.
//
// Between turns the light is the second hand: a lamp goes round the board
// once a minute, so every disc's glint and shadow turn with the seconds.
//
// Palette: board felt green, its black grid, and two disc materials
// (warm ivory, blue-black) lit by the moving lamp. Resting discs are baked
// sprites (one blit each); only moving discs are drawn live, anti-aliased.

import { hash, ease, clamp } from '../js/kit.js';
import { FELT, GRID, BLACK, WHITE, SPRITES, LIGHT_N, drawDisc, light3 } from './othello-disc.js';

const COLS = 16, ROWS = 9;          // rows 0 and 8 are half off the glass
const DIGIT_COL = [0, 4, 9, 13], DIGIT_ROW = 2;
const FONT = {
  0: ['111', '101', '101', '101', '111'], 1: ['010', '110', '010', '010', '111'],
  2: ['111', '001', '111', '100', '111'], 3: ['111', '001', '011', '001', '111'],
  4: ['101', '101', '111', '001', '001'], 5: ['111', '100', '111', '001', '111'],
  6: ['111', '100', '111', '101', '111'], 7: ['111', '001', '001', '001', '001'],
  8: ['111', '101', '111', '101', '111'], 9: ['111', '101', '111', '001', '111'],
};
const FLIP = 0.3;                    // seconds a disc takes to turn over
const ERASE_AT = 58.2, ERASE_SPAN = 0.8;
const ROCK_AT = 56.5, TOSS_AT = 59;
const PI = Math.PI;

const cx = (c) => 10 * c + 5.5, cy = (r) => 10 * r + 0.5;   // cell centres (row 0 straddles the top edge)

/** Digits of day-minute k: [h tens, h units, m tens, m units]. */
const digitsOf = (k) => { const h = Math.floor(k / 60), m = k % 60; return [Math.floor(h / 10), h % 10, Math.floor(m / 10), m % 10]; };
/** Which digit position (0..3) a cell belongs to, and whether it is lit there, for digits d. */
function digitAt(d, c, r) {
  const y = r - DIGIT_ROW;
  if (y < 0 || y > 4) return -1;
  for (let i = 0; i < 4; i++) {
    const x = c - DIGIT_COL[i];
    if (x >= 0 && x < 3) return FONT[d[i]][y][x] === '1' ? i : -1;
  }
  return -1;
}
/** The field colour of day-minute k: the side that owns the board. */
const fieldOf = (k) => (k % 2 === 0 ? WHITE : BLACK);
/** The empty square during minute k: even minutes in the top margin, odd in the bottom; on :59 a corner. */
function holeOf(k) {
  const row = k % 2 === 0 ? 1 : 7;
  if (k % 60 === 59) return [hash(k, 7) % 2 ? 15 : 0, row];
  return [hash(k, 3) % COLS, row];
}

/** Wave delay of a cell from the move at (oc, or): the eight lines first, then between. */
function waveDelay(c, r, oc, or, slow) {
  const dx = Math.abs(c - oc), dy = Math.abs(r - or);
  const cheb = Math.max(dx, dy), off = Math.min(dx, dy, Math.abs(dx - dy));
  return (0.055 * cheb + 0.05 * off) * slow;
}

export default {
  name: 'Othello',
  blurb: 'The time in discs on a Reversi board that changes hands every minute: a disc is flicked, lands at :00 and the cascade flips everything but the new time; the lamp circling the board is the second hand.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec;
    ctx.lcd.backlight(1 - 0.7 * ctx.night);
    const k = f.h * 60 + f.m, kPrev = (k + 1439) % 1440, kNext = (k + 1) % 1440;
    const dCur = digitsOf(k), dPrev = digitsOf(kPrev), dNext = digitsOf(kNext);
    const F = fieldOf(k), Fp = fieldOf(kPrev);
    const [hc, hr] = holeOf(k), [pc, pr] = holeOf(kPrev), [nc, nr] = holeOf(kNext);
    const hourMove = f.m === 0;               // the move that just landed was a corner
    const hourNext = f.m === 59;

    // The lamp: once round per minute, from 12 o'clock at :00.
    const la = light3((s / 60) * 2 * PI);
    const bucket = Math.floor((s / 60) * LIGHT_N) % LIGHT_N;

    g.clear(FELT);
    for (let c = 0; c < COLS; c++) g.vline(10 * c, 0, 80, GRID);
    for (let r = 1; r < ROWS; r++) g.hline(0, 10 * r - 5, 160, GRID);

    const moving = [];   // [height, draw()]
    const rest = (c, r, side) => g.blit(SPRITES[side][bucket], 10 * c + 1, 10 * r - 4);
    const flipping = (c, r, from, to, u, oc, or) => {
      const dx = c - oc, dy = r - or;
      const axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
      const sgn = (axis === 'x' ? dx : dy) >= 0 ? 1 : -1;
      const th = PI * ease.inOutCubic(u), h = 2.6 * Math.sin(PI * u);
      moving.push([h, () => drawDisc(g, cx(c), cy(r), from, to, th, h, la, { axis, sgn })]);
    };

    const waveOn = s < 2.2;
    const slow = hourMove ? 1.35 : 1;

    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        // The hole: empty felt, with a faint hint of the side that moves next.
        if (c === hc && r === hr) {
          if (!(s >= TOSS_AT)) {
            const p = 0.5 + 0.5 * Math.sin(s * 2.2);
            g.fillCircle(cx(c), cy(r), 1.6, fieldOf(kNext) === WHITE ? 0xf3f0e6 : 0x101014, { aa: true, a: 0.18 + 0.14 * p });
          }
          continue;
        }
        // The disc that will be tossed: rocking, then gone.
        if (c === nc && r === nr && s >= ROCK_AT) {
          if (s >= TOSS_AT) continue;
          const u = (s - ROCK_AT) / (TOSS_AT - ROCK_AT);
          const th = 0.32 * u * u * Math.sin((s - ROCK_AT) * 2 * PI * 2.2);
          moving.push([0.3, () => drawDisc(g, cx(c), cy(r), F, F === WHITE ? BLACK : WHITE, Math.abs(th), 0.4 * u, la, { axis: 'y', sgn: th >= 0 ? 1 : -1, bevel: true })]);
          continue;
        }

        const iCur = digitAt(dCur, c, r);
        const now = iCur >= 0 ? 1 - F : F;

        // The cascade from the move that landed at :00.
        if (waveOn) {
          if (c === pc && r === pr) {
            // The landed disc settles.
            if (s < 0.18) {
              const u = s / 0.18;
              moving.push([0.5, () => drawDisc(g, cx(c), cy(r), now, now, 0, 1.6 * (1 - u) * Math.cos(u * PI * 1.5) ** 2, la, { bevel: true })]);
            } else rest(c, r, now);
            continue;
          }
          const iPrev = digitAt(dPrev, c, r);
          // Before the move the board held the previous minute, with its changing digits captured.
          const pre = iPrev >= 0 && dPrev[iPrev] === dCur[iPrev] ? 1 - Fp : Fp;
          if (pre !== now) {
            const u = (s - waveDelay(c, r, pc, pr, slow)) / FLIP;
            if (u <= 0) { rest(c, r, pre); continue; }
            if (u < 1) { flipping(c, r, pre, now, u, pc, pr); continue; }
          }
        }

        // Capture before the turn: digits about to change flip into the field.
        if (iCur >= 0 && dCur[iCur] !== dNext[iCur] && s >= ERASE_AT) {
          const u = (s - ERASE_AT - eraseDelay(c, r, dCur, dNext, nc, nr)) / FLIP;
          if (u >= 1) { rest(c, r, F); continue; }
          if (u > 0) { flipping(c, r, now, F, u, nc, nr); continue; }
        }
        rest(c, r, now);
      }

    // The toss: from the rocking disc to this minute's hole, landing at :00.
    if (s >= TOSS_AT) {
      const u = clamp((s - TOSS_AT) / (60 - TOSS_AT), 0, 1);
      const gu = ease.inOutQuad(u);
      const x = cx(nc) + (cx(hc) - cx(nc)) * gu, y = cy(nr) + (cy(hr) - cy(nr)) * gu;
      const top = hourNext ? 24 : 15, turns = hourNext ? 7 : 5;
      const h = 4 * top * u * (1 - u);
      const sgn = hr < nr ? -1 : 1;
      moving.push([h, () => drawDisc(g, x, y, F, 1 - F, turns * PI * u, h, la, { axis: 'y', sgn, shadowA: 0.5, bevel: true })]);
    }

    moving.sort((a, b) => a[0] - b[0]);
    for (const [, draw] of moving) draw();
  },
};

/** Capture order: the changing digits' discs, nearest the tossed disc first, spread over ERASE_SPAN. */
function eraseDelay(c, r, dCur, dNext, nc, nr) {
  const dist = Math.max(Math.abs(c - nc), Math.abs(r - nr));
  return clamp((dist - 1) / 15, 0, 1) * ERASE_SPAN;
}
