// Mahjong Hand: a close-up of a player's rack on green baize, lit by a lamp
// overhead. Four tiles stand tall and lit at the centre of the hand -- the
// time itself, carved as the characters-suit numerals (一二三四五六七八九),
// white dragon's blank for zero -- flanked by the player's other tiles lying
// low and dim either side, with a thin discard river along the bottom edge.
// A pair of hands occasionally reaches in to square the rack.
//
// Minute turn: a tile is drawn from the wall (top edge), slides down across
// the baize, flips face-up (a real width-crush perspective flip, not a
// cut), and drops into the changing slot with a settle-bounce, while the
// old tile is swept face-down into the discard river with a click.
// Hour: the hand is declared -- all four tiles are pushed flat and knock
// twice (table shake), then swirl off the rack and reshuffle back in a
// clatter to rebuild, with the new hour's tiles already lit through it.
import * as kit from '../js/kit.js';
import {
  W, H, IVORY, TILE_GREEN, RED, GREEN, INKBLUE, WOOD, LAMP, BAIZE,
  drawTile, drawDiscard, dropShadow, paintBaize, clamp01,
} from './sonnet-mahjong-scene.js';

const img = new Float32Array(W * H * 3);

// ------------------------------------------------------------- layout
// Live tiles stand portrait, close to a real tile's ~3:4 width:height, and
// tall enough (face+skirt ~57px) to give the carved numeral + wan room.
const SLOT_W = 16, SLOT_FH = 17, SLOT_H2 = 16;     // live tile face half-size, skirt height
const SIDE_FH = 7, SIDE_H2 = 7;                      // flanking tiles, smaller/duller
const HAND_Y = 23;                                   // baseline y of the standing hand
const SLOT_GAP = SLOT_W * 2 + 4;
const CX = W / 2;
const SLOT_X = [CX - 1.5 * SLOT_GAP, CX - 0.5 * SLOT_GAP, CX + 0.5 * SLOT_GAP, CX + 1.5 * SLOT_GAP];
const LACQ = [RED, RED, GREEN, GREEN]; // hour tens/ones in red, minute tens/ones in green
const SIDE_N = 2; // tiles flanking each side of the hand, inside the frame
const SIDE_PITCH = SIDE_FH * 2 + 1.5;

const pad2 = (n) => String(n).padStart(2, '0');
function digitsOf(d) { const s = pad2(d.getHours()) + pad2(d.getMinutes()); return [...s].map(Number); }

// deterministic side-tile digits (decorative hand filler), stable per minute
function sideDigit(seed) { return Math.floor(kit.hash(seed, 7, 3) * 9) + 1; }

// discard river: a fixed set of past-looking tiles, dim, never read as time
const RIVER_N = 14;
const river = Array.from({ length: RIVER_N }, (_, i) => ({
  x: 10 + i * ((W - 20) / (RIVER_N - 1)),
  d: sideDigit(i * 11 + 5),
}));

const sideL = Array.from({ length: SIDE_N }, (_, i) => sideDigit(i + 1));
const sideR = Array.from({ length: SIDE_N }, (_, i) => sideDigit(i + 50));

function lampXY(ctx) {
  // lamp swings gently, a little lower during night so the pool tightens;
  // its azimuth drives every tile's highlight, so the whole rack is always
  // alive -- a slow living sheen, never a static card, even mid-minute.
  const t = ctx.date.getTime() / 1000;
  const x = CX + 10 * Math.sin(t * 0.07), y = 8 + 4 * Math.sin(t * 0.05);
  return [x, y, Math.atan2(y - HAND_Y, x - CX) ];
}

/** Draw the quiet (dim, secondary) tiles: wall hint, side hand, river. */
function drawSurround(ctx, dim, lightAz) {
  // side hand tiles, flanking the four live tiles, standing but duller
  const edgeL = SLOT_X[0] - SLOT_W - 2, edgeR = SLOT_X[3] + SLOT_W + 2;
  for (let i = 0; i < SIDE_N; i++) {
    const xL = edgeL - i * SIDE_PITCH, xR = edgeR + i * SIDE_PITCH;
    const a = clamp01(1 - i * 0.22) * 0.26 * dim;
    drawTile(img, W, H, { cx: xL, cy: HAND_Y + 2, fw: SIDE_FH, fh: SIDE_H2, skirt: 5, digit: null, lacquer: GREEN, alpha: a, lightAz });
    drawTile(img, W, H, { cx: xR, cy: HAND_Y + 2, fw: SIDE_FH, fh: SIDE_H2, skirt: 5, digit: null, lacquer: GREEN, alpha: a, lightAz });
  }
  // discard river along the bottom edge: flat, face-up, dim, clearly secondary
  for (const t of river) drawDiscard(img, W, H, t.x, H - 6, 11, 8, t.d, 0.16 * dim);
}

/** Draw the four live time tiles, standing tall, carved and lacquered, lit. */
function drawHand(ctx, slots, dim, extraGlow, lightAz) {
  // drop shadows first (all four), so they sit under the tiles, not over them
  for (let s = 0; s < 4; s++) {
    const sl = slots[s];
    if (sl.hidden) continue;
    const fw = SLOT_W * (sl.sx ?? 1), fh = SLOT_FH * (sl.sy ?? 1), skirt = SLOT_H2 * (sl.sy ?? 1);
    dropShadow(img, W, H, SLOT_X[s] + (sl.dx || 0) + 2, HAND_Y + (sl.dy || 0) + fh + skirt + 1.5, fw * 0.95, 3.5, 0.5 * (sl.alpha ?? 1));
  }
  for (let s = 0; s < 4; s++) {
    const sl = slots[s];
    if (sl.hidden) continue;
    drawTile(img, W, H, {
      cx: SLOT_X[s] + (sl.dx || 0), cy: HAND_Y + (sl.dy || 0),
      fw: SLOT_W * (sl.sx ?? 1), fh: SLOT_FH * (sl.sy ?? 1), skirt: SLOT_H2 * (sl.sy ?? 1),
      digit: sl.digit, glow: 0.35 + extraGlow, lacquer: LACQ[s], alpha: sl.alpha ?? 1, lightAz,
    });
  }
}

// --------------------------------------------------------- minute turn
// For the changing slot: old tile is swept to the river (face-down slide,
// shrink + fade), new tile arrives from the wall (slide down, flip, bounce).
function minuteSlots(now, prevD, nextD) {
  const M = Math.floor(now / 60) * 60, age = now - M; // 0..60
  const slots = [0, 1, 2, 3].map((s) => ({ digit: nextD[s], sx: 1, sy: 1, dx: 0, dy: 0, alpha: 1 }));
  const changed = [0, 1, 2, 3].filter((s) => prevD[s] !== nextD[s]);
  if (!changed.length || age > 2.2) return slots;
  const DUR = 1.9;
  const k = clamp01(age / DUR);
  for (const s of changed) {
    if (k < 0.42) {
      // phase 1: old tile tips and slides down off the rack toward the river
      const p = kit.ease.in(k / 0.42);
      slots[s].digit = prevD[s];
      slots[s].dy = p * 26;
      slots[s].dx = p * (s < 2 ? -10 : 10);
      slots[s].sx = 1 - 0.5 * p; slots[s].sy = 1 - 0.3 * p;
      slots[s].alpha = 1 - 0.75 * p;
    } else if (k < 0.46) {
      slots[s].hidden = true; // the brief gap at the hinge: nothing drawn, never a wrong digit
    } else {
      // phase 2: new tile drops from the wall and flips face-up with a bounce
      const p = clamp01((k - 0.46) / 0.54);
      const drop = kit.ease.outBack(Math.min(1, p * 1.08));
      slots[s].dy = (1 - drop) * -22;
      const flip = clamp01(p / 0.55);
      const crush = Math.abs(Math.cos(flip * Math.PI)); // width crush = the 3D flip
      slots[s].sx = kit.lerp(0.08, 1, flip < 0.5 ? 1 - crush : crush);
      slots[s].digit = flip < 0.5 ? null : nextD[s]; // face is blank/edge-on until past the flip
      slots[s].sy = 1;
      slots[s].alpha = 1;
    }
  }
  return slots;
}

// ----------------------------------------------------------- hour turn
// Declared hand: push flat + knock (0-1.1s), swirl off (1.1-2.6s), rebuild
// clatter back in with the new hour already lit (2.6-3.6s).
function hourSlots(now, nextD) {
  const H0 = Math.floor(now / 3600) * 3600, age = now - H0;
  const slots = [0, 1, 2, 3].map((s) => ({ digit: nextD[s], sx: 1, sy: 1, dx: 0, dy: 0, alpha: 1 }));
  if (age > 3.6) return slots;
  if (age < 1.1) {
    const p = age / 1.1;
    const knock = Math.sin(p * Math.PI * 5) * (1 - p) * 1.6;
    for (const sl of slots) { sl.dy = knock; sl.sy = 1 - 0.12 * clamp01(p * 3); }
  } else if (age < 2.6) {
    const p = (age - 1.1) / 1.5;
    for (let s = 0; s < 4; s++) {
      const ang = p * (3.4 + s * 0.4) + s * 1.4;
      const r = 18 * Math.sin(p * Math.PI);
      slots[s].dx = Math.cos(ang) * r; slots[s].dy = Math.sin(ang) * r * 0.4 - p * 6;
      slots[s].sx = 1 - 0.5 * Math.sin(p * Math.PI);
      slots[s].sy = slots[s].sx;
      slots[s].alpha = 1 - 0.5 * Math.sin(p * Math.PI);
      slots[s].digit = p < 0.5 ? nextD[s] : nextD[s]; // digits never go wrong: content unchanged through the swirl
    }
  } else {
    const p = (age - 2.6) / 1.0;
    const settle = kit.ease.outBack(Math.min(1, p * 1.1));
    for (let s = 0; s < 4; s++) {
      const from = [-1, 1, -1, 1][s] * 30;
      slots[s].dx = (1 - settle) * from;
      slots[s].dy = (1 - settle) * -10 * ((s % 2) ? 1 : -1);
      slots[s].sx = kit.lerp(0.3, 1, settle); slots[s].sy = slots[s].sx;
    }
  }
  return slots;
}

export default {
  name: 'Mahjong Hand',
  blurb: 'a lamplit rack of ivory tiles: the time is carved characters-suit numerals in the standing hand, drawn and discarded each minute, declared and reshuffled each hour',
  layouts: ['hub-x4'], look: 'smoke', fps: 60, brightness: 0.32, dither: true,
  frame(ctx) {
    const now = ctx.date.getTime() / 1000;
    const dim = 1 - 0.55 * ctx.night;
    const [lx, ly, lightAz] = lampXY(ctx);
    paintBaize(img, W, H, lx, ly, dim);
    drawSurround(ctx, dim, lightAz);

    const M = Math.floor(now / 60), prevD = digitsOf(new Date((M - 1) * 60000)), nextD = digitsOf(ctx.date);
    const H0 = Math.floor(now / 3600), hourAge = now - H0 * 3600;
    const inHour = hourAge < 3.6;
    const slots = inHour ? hourSlots(now, nextD) : minuteSlots(now, prevD, nextD);
    const glow = inHour ? 0.25 * clamp01(1 - Math.abs((hourAge - 1.8) / 1.8)) : 0;
    drawHand(ctx, slots, dim, glow, lightAz);

    // steam curl from a cup, bottom-left, pure ambience, well clear of the hand
    const sx = 14, sy = H - 10;
    for (let i = 0; i < 10; i++) {
      const t = now * 0.6 + i * 0.6;
      const px = sx + 2.2 * Math.sin(t * 0.9 + i) * (i / 10);
      const py = sy - i * 1.6 - (now * 3 % 1.6);
      const a = (1 - i / 10) * 0.05 * dim;
      const xi = Math.round(px), yi = Math.round(py);
      if (xi < 0 || yi < 0 || xi >= W || yi >= H) continue;
      const o = 3 * (yi * W + xi);
      img[o] += a; img[o + 1] += a; img[o + 2] += a;
    }

    kit.blitGrid(ctx, img, 1);
  },
};
