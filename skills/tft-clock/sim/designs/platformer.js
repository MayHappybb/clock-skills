// Platformer: the boss room of a 1989 handheld game, and the time is the
// bosses. Four stone golems stand in the arena, hours on the floor, minutes
// on a raised ledge, and each golem's body IS its numeral: a stone font cut
// on a 4 x 4 unit grid with 45-degree corners (platformer-glyphs.js), 8 px
// strokes with a keyline, a lit lip on every top surface, ashlar joints, two
// eye sockets in the top stroke and stubby feet under the bottom one. A
// round little hamster is the hero, and a bottom HUD (hearts, BOSS and its
// health bar, which drains over the minute) frames it as a game.
//
// The time is never still. The golems march in place twice a second, the
// step rolling left to right (body up 2-3 px, a 1 px sway, the stepping foot
// lifting, the planted leg showing); their pupils follow the hamster and
// they blink. On every beat the hamster lands on a golem's head: that golem
// flashes in the hit palette and shudders, eyes squeezed shut. Every 15 s a
// flourish: :15 the golems spring 6 px in a wave, :30 all four jump and slam
// (scenery shakes, dust, the hamster is bounced high), :45 they toss rocks.
//
// Minute turn: the leaving golem flashes in defeat (the GB hit flicker) from
// :57.4; the hamster perches on its neighbour and inhales it: its stones
// leave in one fixed random rank, evenly, and stream into its mouth
// (:58.8-:59.9); cheeks stuffed. After :00 the new golem spawns the GB way,
// flickering in whole 6 px up, drops, lands with dust and opens its eyes;
// the hamster spits a star. Hour: from :48 the arena fades (in whole BGP
// steps) to the boss palette, lightning flashes, the golems' eyes glow; the
// hamster hovers centre and swallows every leaving golem, swelling into a
// balloon; at :00 the new kings drop in wearing crowns, the scenery shakes,
// and the hamster spits the lot out as fireworks; the day palette returns
// at :10. Midnight is the same show with all four.
//
// Palette: exactly the four DMG greens, nothing else, ever: every pixel is
// written as a shade index through a palette map, as the BGP / OBP registers
// did. Shade 1 is opened up from the usual swatch (the two light greens are
// 16 apart there and merge on this glass). Night (and the boss arena) is the
// game's inverted palette: dark sky, lit stone, light keylines, so the
// numerals stay the strongest contrast; the backlight drops to 45 %. Hard
// pixels only; everything moves in whole pixels.
//
// Cost: integer loops writing palette entries into g.buf (charged to
// g.cost.blit); glyphs are precomputed tables (flash); no per-minute caches,
// no buffers beyond the frame. Every frame is closed form in the time.
import { clockFields, hash, sin, cos } from '../js/kit.js';
import { pal, put, spr, HAM, BALLOON, EYE, EYE_SHUT, EYE_HURT, EYE_UP, EYE_GLOW, FOOT, DUST, CHIP, CHIP_S, ROCK, STAR, SPARK, CROWN, HEART, LETTER } from './platformer-art.js';
const STAR_S = spr(['0.0', '.0.', '0.0']);
import { GLYPH_HH, GLYPH_MM } from './platformer-glyphs.js';

const W = 160, H = 80;
const PI = Math.PI;
export const SLOT_X = [10, 46, 94, 124];
export const TOP = 22;                    // top of every golem's body
const FLOOR = 72, LEDGE = 64;             // feet stand on these rows
const BOT = [FLOOR - 2, FLOOR - 2, LEDGE - 2, LEDGE - 2];   // the row the feet start on
const glyphs = (i) => (i < 2 ? GLYPH_HH : GLYPH_MM);

// palette maps (BGP / OBP)
const DAY = pal(0, 1, 2, 3), HIT = pal(0, 0, 1, 3), NIGHT = pal(3, 2, 1, 0);


// ------------------------------------------------------------ the golems' march in place

/** Two steps a second, rolling left to right; the downbeat step is the higher. */
function stepPose(i, s) {
  const t = s - i * 0.07, k = Math.floor(t * 2), u = t * 2 - k;      // half-beat index and phase
  const side = k & 1 ? 1 : -1;                                        // which foot steps
  const up = u < 0.7 ? sin((u / 0.7) * PI) : 0;
  const lift = Math.round(up * (k & 1 ? 2 : 3));
  return { lift, dx: Math.round(side * up * 1.4), side, land: u >= 0.7 && u < 0.85 };
}

// ------------------------------------------------------------ the hamster's beat route

const PAT = [0, 1, 2, 3, 2, 1];
/** Where the hamster stands on golem i (left edge of its sprite). */
function perchX(i, d) {
  const G = glyphs(i)[d], e = G.eyes[i === 3 && G.eyes[1][0] > 4 ? 1 : 0];
  return SLOT_X[i] + e[0] + 2 - 8;
}
const CENTRE_X = 76, CENTRE_Y = 0;        // where it hovers to swallow the hour

// palette fade into the boss arena (GB style: whole steps of BGP)
const FADE = [DAY, pal(1, 2, 3, 3), pal(2, 3, 3, 3), pal(3, 3, 3, 3), pal(3, 3, 2, 1), NIGHT];
const FLASH = pal(0, 0, 0, 1);

/** Extra lift for golem i from the flourishes (closed form in s). */
function flourishLift(i, s) {
  // :15 the wave: each golem in turn springs 6 px
  const qa = (s - 15 - i * 0.18) / 0.45;
  if (qa > 0 && qa < 1) return Math.round(6 * sin(qa * PI));
  // :30 the quake: all four jump 8 px together and slam
  const qb = (s - 30) / 0.6;
  if (qb > 0 && qb < 1) return Math.round(8 * (qb < 0.7 ? sin((qb / 0.7) * PI * 0.5) : 1 - ((qb - 0.7) / 0.3) ** 2));
  return 0;
}

export default {
  name: 'Platformer',
  blurb: 'A Game Boy boss room in four greens: the numerals are stone golems marching on the beat; each minute the hamster hero inhales the old one and a new one drops in.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, buf = g.buf;
    const now = ctx.date.getTime();
    const prv = clockFields(new Date(now - 60000)), nxt = clockFields(new Date(now + 60000));
    const cur = f.hh + f.mm, old = prv.hh + prv.mm, nw = nxt.hh + nxt.mm;
    const T = (now % 86400000) / 1000, F = Math.floor(T * 60);
    const night = ctx.night > 0.5;
    ctx.lcd.backlight(1 - 0.55 * ctx.night);

    // ---- the turn: which golems leave and arrive
    const leaving = [], arriving = [];
    for (let i = 0; i < 4; i++) { if (cur[i] !== nw[i]) leaving.push(i); if (cur[i] !== old[i]) arriving.push(i); }
    const hourOut = cur[1] !== nw[1], hourIn = cur[1] !== old[1];

    // ---- the arena's palette: by day, by night, and the boss fade at the hour
    let BG = night ? NIGHT : DAY;
    if (!night) {
      let step = 0;
      if (hourOut && s >= 48) step = Math.min(5, Math.floor((s - 48) / 0.1));
      if (hourIn && s < 10.6) step = s < 10 ? 5 : 5 - Math.min(5, Math.floor((s - 10) / 0.1));
      BG = FADE[step];
    }
    const bolt = (hourOut && ((s >= 48 && s < 48.05) || (s >= 53 && s < 53.05) || (s >= 56.5 && s < 56.53))) || (hourIn && s >= 0.55 && s < 0.6);
    const ARENA = BG;
    if (bolt) BG = FLASH;
    const boss = (hourOut && s >= 48) || (hourIn && s < 10);
    const OBJ = night || boss ? NIGHT_OBJ : DAY;
    let n = 0;

    // ---- shake: the quake (:30) and the hour's landing shake the scenery, never the golems
    const shk = (s > 30.6 && s < 31.0) || (hourIn && s > 0.6 && s < 1.1) ? ((F >> 1) & 1 ? 2 : -1) : 0;

    // ---- sky and far hills (calm, shades 0 and 1 only)
    buf.fill(BG[0]); n += W * H;
    const scroll = Math.floor(T * 3);
    for (let x = 0; x < W; x++) {
      const hgt = RUIN[(x + scroll) & 255] + shk;
      for (let y = FLOOR - hgt; y < FLOOR; y++) buf[y * W + x] = BG[1];
      n += hgt;
    }
    if (boss || night) n += stars(buf, T, BG);
    // the floor and the minutes' ledge
    for (let x = 0; x < W; x++) { buf[FLOOR * W + x] = BG[3]; buf[(FLOOR + 1) * W + x] = BG[2]; }
    for (let y = LEDGE; y < FLOOR; y++) for (let x = 88; x < 154; x++) {
      const ry = y - LEDGE, rx = (x + (ry >= 4 ? 4 : 0)) & 7;
      buf[y * W + x] = ry === 0 || x === 88 || x === 153 ? BG[3] : ry === 4 || rx === 0 ? BG[3] : ry === 1 ? BG[1] : BG[2];
    }
    n += 66 * 8 + 320;

    // ---- hamster: a station per beat
    const big = hourOut || leaving.length > 2;               // the hour: it swallows from the centre of the sky
    const bigIn = hourIn || arriving.length > 2;
    const perchOut = big ? -1 : leaving.length ? Math.max(0, leaving[0] - 1) : 2;
    const perchIn = bigIn ? -1 : arriving.length ? Math.max(0, arriving[0] - 1) : 2;
    const station = (k) => (k >= 57 ? perchOut : k <= 0 ? perchIn : k === 1 && bigIn ? -1 : PAT[k % 6]);
    const k0 = Math.floor(s), u = s - k0;
    const a = station(k0), b = station(k0 + 1);
    const digOf = (i, k) => +(k >= 60 ? nw : cur)[i];
    const xOf = (st, k) => (st < 0 ? CENTRE_X : perchX(st, digOf(st, k)));
    const yOf = (st) => (st < 0 ? CENTRE_Y : TOP - 16);
    const xa = xOf(a, k0), xb = xOf(b, k0 + 1), ya = yOf(a), yb = yOf(b);
    let hx = xa, hy = ya, frame = HAM.stand, face = xb >= xa ? 0 : 1;
    if (a !== b || xa !== xb) {
      const e = u < 0.15 ? 0 : (u - 0.15) / 0.85;
      hx = xa + (xb - xa) * e;
      hy = ya + (yb - ya) * e - 4 * (Math.abs(xb - xa) > 40 ? 8 : 6) * e * (1 - e);
      frame = u < 0.12 ? HAM.land : HAM.jump;
      // the quake bounces it high
      if (s > 30.6 && s < 31.6) hy -= Math.round(10 * sin(((s - 30.6) / 1.0) * PI));
    } else if (a >= 0) hy -= stepPose(a, s).lift * (leaving.includes(a) && k0 >= 57 ? 0 : 1);
    if (a >= 0 && (a === b ? true : u < 0.15) && !(leaving.includes(a) && k0 >= 57)) hy -= flourishLift(a, s);
    if (a === b && xa === xb && k0 >= 57) {
      if (s >= 58.6) frame = s < 59.9 ? HAM.inhale : HAM.full;
      if (big) hy += Math.round(sin(s * 4) * 1.5);
    } else if (k0 === 0 && s < 0.6) frame = HAM.full;
    // swallowing the hour: a balloon from :59.4 until it spits at :00.6
    const balloon = (big && s >= 59.4) || (bigIn && s < 0.6);
    const spitT = s >= 0.6 && s < 2.6 ? s - 0.6 : -1;          // the spat star
    const hit = (a !== b || xa !== xb) && k0 < 57 && a >= 0 ? a : -1;

    // ---- golems
    let landed = -1;
    for (let i = 0; i < 4; i++) {
      const G = glyphs(i)[+cur[i]];
      let P = stepPose(i, s), m = BG, eyes, gone = -1, show = true, yoff = 0;
      if (boss && !night) m = ARENA;
      if (bolt) m = FLASH;
      const gaze = hx + 8 < SLOT_X[i] ? 0 : hx + 8 > SLOT_X[i] + G.w ? 2 : 1;
      eyes = hy < TOP - 19 ? EYE_UP : EYE[gaze];
      if (boss && hash(i, Math.floor(s * 2)) % 3 === 0) eyes = EYE_GLOW;
      const fl = flourishLift(i, s);
      if (fl) P = { lift: fl, dx: 0, side: 0 };
      if (i === hit && u < 0.12) { m = bolt ? m : HIT; eyes = EYE_HURT; P = { lift: fl, dx: (F & 2) ? 1 : -1, side: 0 }; }
      if (hash(i, Math.floor(T * 1.3)) % 6 === 0 && (T * 1.3) % 1 < 0.12) eyes = EYE_SHUT;
      // leaving: defeat flicker, then the stones stream into the hamster's mouth
      if (leaving.includes(i) && s >= 57.4) {
        P = { lift: 0, dx: 0, side: 0 };
        eyes = EYE_HURT;
        if (s < 58.8 && (F >> 2) & 1) m = HIT;
        gone = s >= 58.8 ? (s - 58.8) / 0.7 : -1;
      }
      // arriving: spawn flicker high, then the drop
      if (arriving.includes(i) && s < 1.2) {
        P = { lift: 0, dx: 0, side: 0 };
        if (s < 0.4) { yoff = -6; show = s < 0.2 ? (F & 1) === 0 : (F & 3) !== 3; }
        else if (s < 0.6) yoff = -6 + Math.round(6 * ((s - 0.4) / 0.2) ** 2);
        else if (s < 0.75) landed = i;
        eyes = s < 0.8 ? EYE_SHUT : eyes;
      }
      if (!show) continue;
      const gx = SLOT_X[i] + P.dx, gy = TOP - P.lift + yoff;
      n += drawGolem(buf, G, gx, gy, BOT[i], P, m, eyes, gone);
      if (bigIn && arriving.includes(i) && s >= 0.6 && s < 10) n += put(buf, CROWN, gx + (G.w >> 1) - 5, gy - 6, m);
      // dust where feet slam: the quake, the wave, the arrival
      const dq = s > 30.6 && s < 31.0 ? s - 30.6 : landed === i ? s - 0.6 : -1;
      if (dq >= 0) for (const fx of G.feet) {
        const fr = DUST[Math.min(2, Math.floor(dq / 0.1))];
        n += put(buf, fr, gx + fx - 4 - Math.round(dq * 12), BOT[i] - 1, BG);
        n += put(buf, fr, gx + fx + 6 + Math.round(dq * 12), BOT[i] - 1, BG);
      }
    }

    // ---- :45 the golems toss rocks at the hamster; they sail off the top
    for (let i = 0; i < 4; i++) {
      const q = s - 45 - i * 0.3;
      if (q < 0 || q > 0.9) continue;
      const G = glyphs(i)[+cur[i]], x0 = SLOT_X[i] + (G.w >> 1) - 4, y0 = TOP - 8;
      const rx = x0 + (i < 2 ? 14 : -14) * q, ry = y0 - 70 * q + 30 * q * q;
      n += put(buf, ROCK, Math.round(rx), Math.round(ry), BG);
    }

    // ---- stones in flight to the mouth
    const mx = hx + (balloon ? 12 : 8), my = hy + (balloon ? 14 : 11);
    if (s >= 58.8) {
      for (const i of leaving) {
        const G = glyphs(i)[+cur[i]];
        for (const un of G.units) {
          const t0 = 58.8 + un.rank * 0.7, q = (s - t0) / 0.4;
          if (q < 0 || q >= 1) continue;
          const sx = SLOT_X[i] + un.ux * 4, sy = TOP + un.uy * 4, e = q * q;
          const sw = sin(q * PI) * 5;
          const x = sx + (mx - 2 - sx) * e, y = sy + (my - 2 - sy) * e - sw;
          n += put(buf, q < 0.6 ? CHIP : CHIP_S, Math.round(x), Math.round(y), BG);
        }
      }
    }

    // ---- the hamster (its own palette, OBP)
    if (balloon) {
      const bx = CENTRE_X - 4, by = Math.round(-4 + sin(s * 3) * 1.5);
      n += put(buf, BALLOON, bx, by, OBJ);
    } else n += put(buf, frame, Math.round(hx), Math.round(hy), OBJ, face === 1);

    // ---- what it spits: one star by day, a fountain of fireworks at the hour
    if (spitT >= 0) {
      if (!bigIn) {
        if (spitT < 1.0) n += put(buf, STAR, Math.round(hx + 8 + spitT * 40), Math.round(hy + 6 - spitT * 30), OBJ);
      } else n += fireworks(buf, s, OBJ, F);
    }

    // ---- HUD: hearts, BOSS and its health, which drains with the minute
    hud(buf, s, bolt ? FLASH : boss && !night ? ARENA : BG, boss, F);
    g.cost.blit += n + 600;
  },
};

/** The hour's fireworks: stars burst in the sky band, 8 sparks each, from :00.6 to ~:09. */
function fireworks(buf, s, m, F) {
  let n = 0;
  for (let k = 0; k < 9; k++) {
    const t0 = 0.6 + k * 0.9, q = s - t0;
    if (q < 0 || q > 1.3) continue;
    const cx = 14 + (hash(k, 77) % 132), cy = 4 + (hash(k, 78) % 12);
    if (q < 0.3) { n += put(buf, SPARK, cx - 1, Math.round(cy + 30 - q * 100), m); continue; }
    const r = (q - 0.3) * 22, fade = q > 1.0 ? (F & 1) : 1;
    if (!fade) continue;
    for (let j = 0; j < 8; j++) {
      const an = (j * PI) / 4, x = cx + r * cos(an), y = cy + r * sin(an) * 0.8 + (q - 0.3) * (q - 0.3) * 12;
      n += put(buf, j & 1 ? SPARK : STAR_S, Math.round(x) - 1, Math.round(y) - 1, m);
    }
  }
  return n;
}

/** night and the boss arena: a few twinkling stars in the sky band */
function stars(buf, T, BG) {
  let n = 0;
  for (let k = 0; k < 14; k++) {
    const x = (hash(k, 5) % 158) + 1, y = (hash(k, 6) % 18) + 1;
    if ((Math.floor(T * 2) + k) % 7 === 0) continue;
    buf[y * W + x] = BG[1]; n++;
  }
  return n;
}

const NIGHT_OBJ = pal(0, 1, 2, 2);

function drawGolem(buf, G, x, y, bot, P, m, eyes, gone) {
  const { w, h, tex, unit, units } = G;
  let n = 0;
  for (let j = 0; j < h; j++) {
    const yy = y + j;
    if (yy < 0 || yy >= H) continue;
    for (let i = 0; i < w; i++) {
      const v = tex[j * w + i];
      if (v < 0) continue;
      if (gone >= 0 && units[unit[j * w + i]].rank <= gone) continue;
      buf[yy * W + x + i] = m[v]; n++;
    }
  }
  const eyeOn = (ex) => { if (gone < 0) return true; const k = unit[4 * w + ex + 2]; return k >= 0 && units[k].rank > gone; };
  for (const [ex, ey] of G.eyes) if (eyeOn(ex)) n += put(buf, eyes, x + ex, y + ey, m);
  // feet stay planted, except the stepping one; legs fill the gap
  if (gone < 0) G.feet.forEach((fx, k) => {
    const stepping = (k === 0 ? -1 : 1) === P.side;
    const fy = stepping ? y + h : bot;
    for (let yy = y + h; yy < fy; yy++) for (let xx = x + fx + 2; xx < x + fx + 5; xx++) buf[yy * W + xx] = m[3];
    n += put(buf, FOOT, x + fx, fy, m);
  });
  return n;
}

// far hills: a low, wide line, 256 px, repeating (shade 1), well under the golems' height
const RUIN = new Uint8Array(256);
for (let x = 0; x < 256; x++) {
  const k = x >> 6, u = (x & 63) / 64;
  const h0 = 4 + (hash(k, 9) % 9), h1 = 4 + (hash(k + 1, 9) % 9);
  const e = u * u * (3 - 2 * u), bump = Math.sin(u * Math.PI) * (3 + (hash(k, 4) % 4));
  RUIN[x] = Math.round(h0 + (h1 - h0) * e + bump);
}

function hud(buf, s, BG, boss, F) {
  for (let y = 74; y < 80; y++) buf.fill(BG[0], y * W, y * W + W);
  for (let k = 0; k < 3; k++) put(buf, HEART, 3 + k * 7, 75, BG);
  let x = 92;
  for (const c of 'BOSS') { put(buf, LETTER[c], x, 75, BG); x += 4; }
  const L = 46, fill = Math.round(L * (s < 1.2 ? Math.max(0, (s - 0.6) / 0.6) : 1 - s / 60));
  for (let y = 75; y < 80; y++) for (let i = 0; i < L + 2; i++) {
    const xx = 110 + i, edge = y === 75 || y === 79 || i === 0 || i === L + 1;
    buf[y * W + xx] = edge ? BG[3] : i - 1 < fill ? BG[(i & 1) && y === 76 ? 1 : 2] : BG[0];
  }
}
