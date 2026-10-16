// tarot: a reading on the reader's table, and the reading is the time.
//
// Three Marseille cards lie on a night-blue velvet cloth by a candle:
//   the first is a Major Arcana card, the hour: I The Magician ... XII The
//     Hanged Man (Marseille order, 12-hour; the light on the cloth says day
//     or night);
//   the second is a pip card, the tens of the minute;
//   the third is a pip card, the units of the minute.
// Each card carries its number as a woodcut Roman numeral in its top
// banner, and the pip cards also show it as pips laid out like a die (four
// is the four corners, nine the full grid). A zero is the Fool, card 0.
// So X, IIII of Swords, II of Cups reads 10:42.
//
// Every picture is alive: the Magician juggles three balls, the Papesse
// turns a page, the Hermit's lantern swings and glows, the Wheel of Fortune
// turns once a minute with the seconds, the Hanged Man sways; coins spin
// and swords glint in a wave across the pips.
//
// The reader's hand does the changing. Before a minute ends it slides the
// cards that are about to change into a stack and lifts them away (gone by
// :59.3); after :00 it deals the new ones face down and turns them over.
// Between, it sometimes hovers over a card or taps it. At the hour it fans
// the whole clock deck (the Fool and I..XII) in a ribbon across the cloth,
// turns it over in one cascade, draws out the new hour, turns the rest back
// and sweeps them away, then deals the minutes. No card ever shows a wrong
// number: old cards leave before :00, new ones arrive after.
//
// Palette: the Marseille stencil colours (red, blue, sky, yellow, flesh,
// green) under black woodblock lines on cream card, against a deep indigo
// velvet, a crimson sleeve, and the candle's warm light. Cards and hand are
// hard pixels (woodcut); only the candle's halo and the shadows are soft.

import { Gfx, clockFields, previousMinute, rand, sin, cos, clamp, lerp, ease, progress, hash, from565, to565 } from '../js/kit.js';
import { drawFace, BLANK, BACK, CW, CH, INK, YEL, RED, PAPER, FLESH, WHITE } from './tarot-cards.js';

const W = 160, H = 80;
const SLOTS = [[4, 8], [45, 11], [86, 6]];
const SUITS = ['CUPS', 'COINS', 'SWORDS', 'WANDS'];
const KEY = 0xff00ff, KEY565 = to565(KEY);

// ------------------------------------------------------------ the spread for a time

function spreadOf(f) {
  const tens = Math.floor(f.m / 10), units = f.m % 10;
  const s1 = SUITS[hash(f.h * 7 + tens, 31) % 4];
  let s2 = SUITS[hash(f.h * 60 + f.m, 57) % 4];
  const pip = (n, suit, seed) => (n === 0 ? { kind: 'fool' } : { kind: 'pip', suit, n, seed });
  return [{ kind: 'major', n: f.h12 }, pip(tens, s1, 1), pip(units, s2, 2)];
}
const same = (a, b) => a.kind === b.kind && a.n === b.n && a.suit === b.suit;

// ------------------------------------------------------------ the cloth, drawn once

const VELVET = 0x27214e, VELVET2 = 0x2e2759, GOLD = 0xc99a3a;
const CLOTH = new Gfx(W, H);
{
  CLOTH.clear(VELVET);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const n = rand(x >> 1, y, 3);
      if (n < 0.22) CLOTH.pixel(x, y, VELVET2);
      else if (n > 0.93) CLOTH.pixel(x, y, 0x221c45);
    }
  // embroidered stars, sparse
  for (let i = 0; i < 26; i++) {
    const x = Math.floor(rand(i, 1, 9) * 158) + 1, y = Math.floor(rand(i, 2, 9) * 78) + 1;
    const c = i % 3 ? GOLD : 0x8a7ab8;
    CLOTH.pixel(x, y, c); CLOTH.pixel(x - 1, y, c); CLOTH.pixel(x + 1, y, c); CLOTH.pixel(x, y - 1, c); CLOTH.pixel(x, y + 1, c);
  }
  // a gold braid along the bottom hem
  CLOTH.fillRect(0, 77, W, 1, GOLD);
  for (let x = 0; x < W; x += 4) { CLOTH.pixel(x, 78, GOLD); CLOTH.pixel(x + 2, 79, GOLD); }
}

// ------------------------------------------------------------ drawing a card in any state

const SCRATCH = new Gfx(CW, CH);

function billScratch(g) {
  for (const k of Object.keys(SCRATCH.cost)) { g.cost[k] += SCRATCH.cost[k]; SCRATCH.cost[k] = 0; }
}

/**
 * One card. k: its width as a fraction (a turn foreshortens it, 1 flat);
 * face: which side is up; lift 0..1 lengthens its shadow.
 */
function drawCard(g, d, T, sec) {
  const { card, x, y, k = 1, face = true, lift = 0, shadow = true } = d;
  const w = Math.max(1, Math.round(CW * Math.abs(k)));
  const cx = x + CW / 2, x0 = Math.round(cx - w / 2);
  const sx = -2 - 2 * lift, sy = 2 + 3 * lift;
  if (shadow) g.fillRect(x0 + sx, Math.round(y) + sy, w, CH, 0x0a0818, { a: 0.45 - 0.15 * lift });
  if (w >= CW) {
    if (face) drawFace(g, Math.round(x), Math.round(y), card, T, sec);
    else g.draw(BACK, Math.round(x), Math.round(y), { key: KEY });
    return;
  }
  // foreshortened: render flat once, then sample its columns
  if (face) { SCRATCH.clear(KEY); drawFace(SCRATCH, 0, 0, card, T, sec); billScratch(g); }
  const src = face ? SCRATCH : BACK, yy = Math.round(y);
  let n = 0;
  for (let i = 0; i < w; i++) {
    const X = x0 + i;
    if (X < g.cx0 || X >= g.cx1) continue;
    const s = ((i + 0.5) * CW / w) | 0;
    for (let j = 0; j < CH; j++) {
      const Y = yy + j;
      if (Y < g.cy0 || Y >= g.cy1) continue;
      const v = src.buf[j * CW + s];
      if (v !== KEY565) { g.buf[Y * W + X] = v; n++; }
    }
  }
  g.cost.blit += n; g.cost.calls++;
}

/** The deck as a stack: a back with a few card edges under it. */
function drawStack(g, x, y, lift = 1) {
  g.fillRect(Math.round(x) - 4 - 2 * lift, Math.round(y) + 3 + 3 * lift, CW + 2, CH + 2, 0x0a0818, { a: 0.4 });
  for (let i = 2; i >= 1; i--) g.fillRect(Math.round(x) - i, Math.round(y) + i, CW, CH, i === 2 ? 0x8c7c5c : PAPER);
  g.draw(BACK, Math.round(x), Math.round(y), { key: KEY });
}

// ------------------------------------------------------------ the reader's hand

const SLEEVE = 0x7a1c2c, SLEEVE2 = 0x9a2a3a, CUFF = 0xd8a840, NAIL = 0xf8dcc0;

/** The reader's right hand from across the table, fingertips at (x, y). */
function drawHand(g, x, y, spread = 0) {
  if (y < -24) return;
  // the arm comes from the reader, above the top edge, a little right of centre
  const ax = 96 + (x - 96) * 0.45, ay = -46;
  const dx = x - ax, dy = y - 16 - ay, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
  const cx = x, cy = y - 16;
  const sl = [[cx + nx * 8, cy + ny * 8], [cx - nx * 8, cy - ny * 8], [ax - nx * 11, ay - ny * 11], [ax + nx * 11, ay + ny * 11]];
  g.fillPolygon(sl, SLEEVE);
  g.stroke([...sl, sl[0]], 1, INK);
  g.thickLine(cx + nx * 4 - dx / L * 4, cy + ny * 4 - dy / L * 4, ax + nx * 5, ay + ny * 5, 2, SLEEVE2);
  g.thickLine(cx + nx * 8.5, cy + ny * 8.5, cx - nx * 8.5, cy - ny * 8.5, 4, INK);
  g.thickLine(cx + nx * 7.5, cy + ny * 7.5, cx - nx * 7.5, cy - ny * 7.5, 2, CUFF);
  // fingers, palm, thumb
  const F = [[-4.5, 2.2], [-1.5, 0], [1.5, 0.6], [4.5, 3.2]];
  for (const [fx, up] of F) g.thickLine(x + fx * (1 + spread * 0.3), y - 7, x + fx * (1 + spread * 0.5), y - up, 4.2, INK);
  g.fillEllipse(x, y - 10, 7.2, 6.4, INK);
  g.thickLine(x + 6.5, y - 11, x + 9 + spread, y - 5, 4.2, INK);
  for (const [fx, up] of F) g.thickLine(x + fx * (1 + spread * 0.3), y - 7, x + fx * (1 + spread * 0.5), y - up, 2.2, FLESH);
  g.fillEllipse(x, y - 10, 6.2, 5.4, FLESH);
  g.thickLine(x + 6.5, y - 11, x + 9 + spread, y - 5, 2.2, FLESH);
  for (const [fx, up] of F) g.pixel(x + fx * (1 + spread * 0.5) - 0.5, y - up - 1.2, NAIL);
  g.fillRect(Math.round(x - 2.5), Math.round(y - 6), 2, 1, CUFF);         // a gold ring
  g.pixel(x - 2, y - 7, 0xff5a8a);
  g.thickLine(x - 4, y - 13, x + 3, y - 14, 1, 0xe0a882);                 // a knuckle crease
}

// ------------------------------------------------------------ the candle

function drawCandle(g, T, night) {
  const cx = 142, top = 34;
  g.fillEllipse(cx - 3, 74, 16, 4, 0x0a0818, { a: 0.4 });
  g.fillEllipse(cx, 72, 14, 4.5, INK);
  g.fillEllipse(cx, 71.5, 13, 3.5, 0xb88a30);
  g.fillEllipse(cx, 70.5, 9, 2, 0xe6c060);
  g.fillRect(cx - 6, top - 1, 12, 71 - top, INK);
  g.fillRect(cx - 5, top, 10, 70 - top, 0xf1e6cc);
  g.fillRect(cx + 2, top, 3, 70 - top, 0xd8c8a4);
  g.fillRect(cx - 5, top, 10, 2, 0xfff8e8);
  // drips
  for (const [dx, len] of [[-4, 9], [-1, 4], [3, 13]]) { g.fillRect(cx + dx, top + 1, 2, len, 0xfaf0da); g.pixel(cx + dx, top + len + 1, 0xfaf0da); }
  g.fillRect(cx, top - 3, 1, 3, INK);                                      // the wick
  // the flame: a flickering teardrop
  const fl = 0.6 * sin(T * 11) + 0.4 * sin(T * 17.3) + 0.3 * sin(T * 4.1);
  const fx = cx + 0.5 + 0.6 * sin(T * 3.7), fh = 9 + 1.2 * fl;
  g.fillCircle(fx, top - 7, 9 + fl, 0xffc060, { aa: true, a: 0.12 + 0.05 * night });
  g.fillCircle(fx, top - 7, 4.8 + fl * 0.3, 0xffd080, { aa: true, a: 0.25 });
  const flame = (r, h, c) => g.fillPolygon([[fx - r, top - 3.5], [fx - r * 0.7, top - 3.5 - h * 0.4], [fx + 0.4 * sin(T * 5), top - 3.5 - h], [fx + r * 0.7, top - 3.5 - h * 0.4], [fx + r, top - 3.5], [fx, top - 1.5]], c, { aa: true });
  flame(2.6, fh, 0xf08a20);
  flame(1.6, fh * 0.72, 0xffd860);
  flame(0.8, fh * 0.4, 0xfff6d8);
  g.fillCircle(cx + 0.5, top - 2.6, 0.9, 0x5a7ae0, { aa: true, a: 0.7 });
}

// ------------------------------------------------------------ the choreography

const BRING = 0.9, TURN = 0.45, BACKOFF = 0.5, DEAL = BRING + TURN + BACKOFF;   // one dealt card
const HOUR_DEAL = 8.0;                                                          // minutes dealt after the hour show

/** Grip point: the hand holds a card near its middle. */
const grip = (x, y) => [x + CW / 2 + 2, y + 30];

/** A card being dealt face down into a slot and turned over, from t0. Returns {card state, hand}. */
function dealt(card, slot, sec, t0) {
  const [sx, sy] = SLOTS[slot];
  const u = sec - t0;
  if (u < 0) return { d: null, hand: null };
  if (u < BRING) {
    const e = ease.outCubic(u / BRING), x = lerp(sx + 14, sx, e), y = lerp(-72, sy, e);
    return { d: { card, x, y, face: false, lift: 1 - 0.4 * e }, hand: grip(x, y) };
  }
  if (u < BRING + TURN) {
    const v = (u - BRING) / TURN, k = cos(v * Math.PI);
    const ex = sx + CW / 2 + (CW / 2) * k;
    return { d: { card, x: sx, y: sy - 2 * sin(v * Math.PI), k, face: v >= 0.5, lift: 0.6 + 0.4 * sin(v * Math.PI) }, hand: [ex + (v < 0.5 ? 2 : -2), sy + 44] };
  }
  const v = Math.min(1, (u - BRING - TURN) / BACKOFF);
  const hx = sx + CW / 2 - CW / 2 - 2, hy = lerp(sy + 44, -40, ease.inQuad(v));
  return { d: { card, x: sx, y: sy }, hand: v < 1 ? [hx + 6 * v, hy] : null };
}

/** The gather: from t0 the hand stacks the cards of `slots` (right to left) and lifts them away. */
const APPROACH = 0.6, SLIDE = 0.6, LIFT = 0.9;
function gatherStart(n) { return 59.3 - APPROACH - SLIDE * (n - 1) - LIFT; }
function gathered(cards, slots, sec) {
  const n = slots.length, t0 = gatherStart(n), u = sec - t0;
  const rest = slots.map((s) => ({ card: cards[s], x: SLOTS[s][0], y: SLOTS[s][1] }));
  if (u < 0) return { rest, moving: null, hand: idleNone };
  const top = cards[slots[0]];
  if (u < APPROACH) {
    const [gx, gy] = grip(...SLOTS[slots[0]]);
    const e = ease.outCubic(u / APPROACH);
    return { rest, moving: null, hand: [gx, lerp(-40, gy, e)] };
  }
  let i = Math.min(n - 1, Math.floor((u - APPROACH) / SLIDE));
  if (u < APPROACH + SLIDE * (n - 1)) {
    const v = ease.inOutQuad(((u - APPROACH) - i * SLIDE) / SLIDE);
    const [ax, ay] = SLOTS[slots[i]], [bx, by] = SLOTS[slots[i + 1]];
    const x = lerp(ax, bx, v), y = lerp(ay, by, v);
    return { rest: rest.slice(i + 1), moving: { card: top, x, y, lift: 0.3, depth: i + 1 }, hand: grip(x, y) };
  }
  const v = Math.min(1, (u - APPROACH - SLIDE * (n - 1)) / LIFT);
  const [bx, by] = SLOTS[slots[n - 1]];
  const y = lerp(by, -80, ease.inQuad(v));
  return { rest: [], moving: v < 1 ? { card: top, x: bx, y, lift: 0.3 + 0.7 * Math.min(1, v * 3), depth: n } : null, hand: grip(bx, y) };
}
const idleNone = null;

// ------------------------------------------------------------ the hour show: a ribbon spread, turned over

const RX = 6, RY = 9, RSTEP = 8, RN = 13;
const HS = { bring: [0, 0.8], spread: [0.8, 2.0], turn: [2.1, 3.3], pick: [3.6, 4.4], unturn: [4.5, 5.4], sweep: [5.5, 6.3], away: [6.3, 7.0], carry: [7.0, 7.9] };
const ribbonCard = (i) => (i === 0 ? { kind: 'fool' } : { kind: 'major', n: i });

function hourShow(g, sec, h12, T) {
  const P = (k) => progress(sec, HS[k][0], HS[k][1]);
  let hand = null;
  const chosen = h12;
  if (sec < HS.bring[1]) {
    const e = ease.outCubic(P('bring')), y = lerp(-75, RY, e);
    drawStack(g, RX, y, 1 - 0.6 * e);
    return grip(RX, y);
  }
  // where each card of the ribbon lies
  const spread = ease.inOutQuad(P('spread')) * RSTEP * (RN - 1);
  const sweep = ease.inOutQuad(P('sweep'));
  const xs = [], ks = [], faces = [];
  for (let i = 0; i < RN; i++) {
    let x = RX + Math.min(i * RSTEP, spread);
    if (i !== chosen) x = lerp(x, RX, sweep);
    let k = 1, face = false;
    const ut = progress(sec, HS.turn[0] + i * 0.07, HS.turn[0] + i * 0.07 + 0.3);
    const ub = progress(sec, HS.unturn[0] + i * 0.05, HS.unturn[0] + i * 0.05 + 0.28);
    let v = ut;
    if (i !== chosen) v = ut - ub;       // turned over, then (all but the chosen one) back again
    k = cos(v * Math.PI); face = v >= 0.5;
    xs.push(x); ks.push(k); faces.push(face);
  }
  const lefts = xs.map((x, i) => x + CW / 2 - (CW * Math.abs(ks[i])) / 2);
  const pulled = P('pick'), carry = ease.inOutCubic(P('carry'));
  const away = ease.inQuad(P('away'));
  if (away < 1) {
    // the ribbon (without the chosen card once it is pulled), each clipped to what the later cards leave showing
    const yy = lerp(RY, -80, away);
    let r0 = W, r1 = 0;                  // one shadow under the whole ribbon
    for (let i = 0; i < RN; i++) if (!(i === chosen && pulled > 0)) { r0 = Math.min(r0, lefts[i]); r1 = Math.max(r1, lefts[i] + CW * Math.abs(ks[i])); }
    g.fillRect(Math.round(r0) - 2 - 2 * away, Math.round(yy) + 2 + 3 * away, Math.round(r1 - r0), CH, 0x0a0818, { a: 0.45 });
    for (let i = 0; i < RN; i++) {
      if (i === chosen && pulled > 0) continue;
      let right = W;
      for (let j = i + 1; j < RN; j++) if (!(j === chosen && pulled > 0)) right = Math.min(right, lefts[j]);
      // gathering up: a card whose strip has closed to under 3 px is just an edge in the deck
      if (sweep > 0 && i < RN - 1 && right - lefts[i] < 3 && !(i === RN - 2 && chosen === RN - 1)) continue;
      g.clip(0, 0, Math.max(0, Math.ceil(right)), H);
      drawCard(g, { card: ribbonCard(i), x: xs[i], y: yy, k: ks[i], face: faces[i], shadow: false }, T, sec);
      g.unclip();
    }
  }
  // the chosen card: drawn out, then carried to the first place
  const cx0 = xs[chosen], cy0 = RY + 6 * ease.outCubic(pulled);
  const cx = lerp(cx0, SLOTS[0][0], carry), cy = lerp(cy0, SLOTS[0][1], carry);
  drawCard(g, { card: ribbonCard(chosen), x: cx, y: cy, k: ks[chosen], face: faces[chosen], lift: pulled > 0 && pulled < 1 ? 1 : carry > 0 && carry < 1 ? 1 : 0 }, T, sec);

  // the hand
  if (sec < HS.spread[1]) hand = [RX + spread + CW / 2 + 2, RY + 34];
  else if (sec < HS.turn[1] + 0.2) {
    const front = clamp((sec - HS.turn[0]) / (RN * 0.07 + 0.3), 0, 1);
    hand = [RX + front * (RSTEP * (RN - 1)) + CW / 2, RY + 50 - 6 * sin(front * Math.PI)];
  } else if (sec < HS.pick[0]) {
    const v = progress(sec, HS.turn[1] + 0.2, HS.pick[0]);
    hand = [lerp(RX + RSTEP * (RN - 1) + CW / 2, grip(cx0, RY)[0], ease.inOutQuad(v)), RY + 40 - 10 * sin(v * Math.PI)];
  } else if (sec < HS.unturn[0]) hand = grip(cx0, cy0);
  else if (sec < HS.sweep[0]) {
    const v = progress(sec, HS.unturn[0], HS.sweep[0]);
    hand = [lerp(grip(cx0, cy0)[0], RX + RSTEP * (RN - 1) + CW / 2, ease.inOutQuad(v)), RY + 30 - 8 * sin(v * Math.PI)];
  } else if (sec < HS.away[1]) {
    const lastX = lerp(RX + RSTEP * (RN - 1), RX, sweep);
    hand = grip(lastX, lerp(RY, -80, away));
  } else if (sec < HS.carry[0] + 0.0001) hand = null;
  else if (sec < HS.carry[1]) hand = grip(cx, cy);
  else {
    const v = progress(sec, HS.carry[1], HS.carry[1] + 0.4);
    hand = v < 1 ? [grip(cx, cy)[0], lerp(grip(cx, cy)[1], -40, ease.inQuad(v))] : null;
  }
  return hand;
}

// ------------------------------------------------------------ idle gestures

/** Between deals the hand sometimes hovers over a card, circling, or taps one. */
function idleHand(f, sec) {
  for (let k = 0; k < 2; k++) {
    const t0 = 14 + k * 18 + rand(f.minuteKey, k, 5) * 10, u = sec - t0;
    if (u < 0 || u > 4.6) continue;
    const s = Math.floor(rand(f.minuteKey, k, 6) * 3), [sx, sy] = SLOTS[s];
    const tx = sx + CW / 2 + 3, ty = sy + 40;
    const tap = rand(f.minuteKey, k, 8) < 0.4;
    const inn = ease.outCubic(clamp(u / 0.9, 0, 1)), out = ease.inQuad(clamp((u - 3.7) / 0.9, 0, 1));
    let x = tx, y = lerp(-40, ty, inn);
    if (u > 0.9 && u < 3.7) {
      const v = (u - 0.9) / 2.8;
      if (tap) y = ty - 3 * Math.abs(sin(v * Math.PI * 3)) ;
      else { x = tx + 4 * sin(v * Math.PI * 2 * 1.5); y = ty - 3 + 3 * cos(v * Math.PI * 2 * 1.5); }
    }
    y = lerp(y, -40, out);
    return { pos: [x, y], spread: tap ? 0 : 1 };
  }
  return null;
}

// ------------------------------------------------------------ the frame

export default {
  name: 'Tarot',
  blurb: 'A Marseille tarot reading by candlelight: hour arcanum, then the minute as two pip cards; a hand deals each change, a ribbon spread every hour.',
  fps: 60,

  frame(g, ctx) {
    const f = ctx.fields, sec = f.sec, night = ctx.night;
    const T = f.h * 3600 + f.m * 60 + sec;
    ctx.lcd.backlight(1 - 0.65 * night);

    const prev = previousMinute(ctx.date), next = clockFields(new Date(ctx.date.getTime() + 60000));
    const cur = spreadOf(f), was = spreadOf(prev), will = spreadOf(next);
    const hourTurn = prev.h !== f.h;
    const changedIn = hourTurn ? [0, 1, 2] : [1, 2].filter((s) => !same(cur[s], was[s]));
    const changedOut = next.h !== f.h ? [2, 1, 0] : [2, 1].filter((s) => !same(cur[s], will[s]));

    // the table and its light
    g.draw(CLOTH, 0, 0);
    // daylight through a window by day (7:00-19:00, faded over an hour each end), the candle alone by night
    const hd = f.h + f.m / 60 + sec / 3600;
    const day = clamp(Math.min(hd - 6.5, 19.5 - hd), 0, 1);
    if (day > 0) {
      // four panes of window light falling across the cloth, moving with the sun
      const u = (hd - 6.5) / 13, wx = lerp(130, -30, u);
      for (const [px, py] of [[0, 0], [24, 0], [0, 40], [24, 40]])
        g.fillPolygon([[wx + px, py - 4], [wx + px + 22, py - 4], [wx + px + 36, py + 34], [wx + px + 14, py + 34]], 0xbfc8ff, { a: 0.1 * day });
    }
    if (day < 1) g.fillRect(0, 0, W, H, 0x05040e, { a: 0.3 * (1 - day) });
    g.radial(142, 30, 70, [[0, 0x6a4a3a], [1, 0x241e46]], { box: [96, 0, 64, 80], a: 0.45 });

    // the cards
    let hand = null, spread = 0;
    const draws = [];
    const inStart = (i) => (hourTurn ? HOUR_DEAL + DEAL * (i - 1) : DEAL * changedIn.indexOf(i));
    const tIn = hourTurn ? HOUR_DEAL + DEAL * 2 : DEAL * changedIn.length;
    let movingTop = null;
    if (sec < 30) {
      for (let s = 0; s < 3; s++) {
        if (hourTurn && s === 0) {
          if (sec >= HS.carry[1]) draws.push({ card: cur[0], x: SLOTS[0][0], y: SLOTS[0][1] });
          continue;
        }
        if (!changedIn.includes(s)) { draws.push({ card: cur[s], x: SLOTS[s][0], y: SLOTS[s][1] }); continue; }
        const r = dealt(cur[s], s, sec, inStart(s));
        if (r.d) { if (r.hand) { movingTop = r.d; hand = r.hand; } else draws.push(r.d); }
      }
    } else {
      const gr = gathered(cur, changedOut, sec);
      for (let s = 0; s < 3; s++) if (!changedOut.includes(s)) draws.push({ card: cur[s], x: SLOTS[s][0], y: SLOTS[s][1] });
      for (const r of gr.rest) draws.push(r);
      if (gr.moving) movingTop = gr.moving;
      hand = gr.hand;
      if (gr.moving && gr.moving.depth > 1) movingTop.stack = gr.moving.depth;
    }
    draws.sort((a, b) => a.x - b.x);
    for (const d of draws) drawCard(g, d, T, sec);
    if (hourTurn && sec < HS.carry[1] + 0.4) {
      const hh = hourShow(g, sec, f.h12, T);
      if (hh) hand = hh;
    }
    if (movingTop) {
      if (movingTop.stack) for (let i = movingTop.stack - 1; i >= 1; i--) g.fillRect(Math.round(movingTop.x) - i, Math.round(movingTop.y) + i, CW, CH, i % 2 ? PAPER : 0x8c7c5c);
      drawCard(g, movingTop, T, sec);
    }
    if (!hand && sec > tIn && sec < 50) {
      const idle = idleHand(f, sec);
      if (idle) { hand = idle.pos; spread = idle.spread; }
    }

    drawCandle(g, T, night);
    if (hand) {
      g.fillEllipse(hand[0] - 4, hand[1] - 6, 8, 7, 0x0a0818, { a: 0.3 });
      drawHand(g, hand[0], hand[1], spread);
    }
  },
};
