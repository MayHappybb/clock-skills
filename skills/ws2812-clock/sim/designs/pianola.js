// Pianola: the 32x8 strip is a piano keyboard, the 20x20 square above it a
// falling-notes roll that scrolls straight down onto the keys (the lattice
// continues across the seam, so every roll lane ends on its own key; the
// keyboard is six keys wider than the roll at each end, as on a pianola).
//
// The roll is the time, scored for two hands: the left hand (blue, the low
// keys) plays the hour, the right hand (green, the high keys) the minutes.
// Every numeral is a little phrase: upright strokes are held notes, bars are
// chords, diagonals are runs, and every chord is rolled low to high, which
// gives the figures their lean. The phrase repeats every 10 rows, so the
// 20-row window always holds a whole copy, and the keys play the time as it
// lands, throwing a few sparks.
//
// Minute turn: the changed digit's notes let go of the roll one by one, pale,
// and fall under gravity, crashing into the keys as a flurry; the roll
// surges forward a phrase and the new digit falls in from the top. Hour
// turn: the old notes melt to gold as they fall, and the rests between the
// copies carry glissandi, one per hour struck (1..12): gold runs over all 32
// keys that sweep past the ends of the roll and leave the outer keys ringing.
//
// Look: opal at 3 mm. At about a pitch the diffuser merges each lane's LEDs
// into continuous note bars (the Synthesia look) and turns the strip into
// ivory keys with ebony black keys; bare dots would read as a pixel font.
//
// Stateless: the roll position is a closed-form function of the clock.
import * as kit from '../js/kit.js';

// ---------------------------------------------------------------- the roll
const R = 2;                 // rows per second, tempo
const B = 10;                // extra rows the roll surges at each minute turn
const SURGE = 2.2;           // seconds the surge takes
const P = 60 * R + B;        // rows per minute (a multiple of the phrase)
const PHRASE = 10;           // rows per phrase: 8 of glyph, 2 of rest
const HIT = 19.6;            // hit line, in rows below the window's top row

// Glyphs: 4 lanes x 8 rows, read top to bottom. Upright strokes are held
// notes, bars are chords, diagonals are runs (scales).
const G = {
  0: ['.##.', '#..#', '#..#', '#..#', '#..#', '#..#', '#..#', '.##.'],
  1: ['..#.', '.##.', '..#.', '..#.', '..#.', '..#.', '..#.', '.###'],
  2: ['.##.', '#..#', '...#', '..#.', '.#..', '#...', '#...', '####'],
  3: ['###.', '...#', '...#', '.##.', '...#', '...#', '...#', '###.'],
  4: ['...#', '..##', '.#.#', '#..#', '####', '...#', '...#', '...#'],
  5: ['####', '#...', '#...', '###.', '...#', '...#', '#..#', '.##.'],
  6: ['.##.', '#...', '#...', '###.', '#..#', '#..#', '#..#', '.##.'],
  7: ['####', '...#', '...#', '..#.', '..#.', '.#..', '.#..', '.#..'],
  8: ['.##.', '#..#', '#..#', '.##.', '#..#', '#..#', '#..#', '.##.'],
  9: ['.##.', '#..#', '#..#', '#..#', '.###', '...#', '...#', '.##.'],
};
const GLYPH = Object.fromEntries(Object.entries(G).map(([d, rows]) => [d, rows.map((r) => [...r].map((ch) => ch === '#'))]));

// slots: [first lane, row offset]
const SLOTS = [[0, 0], [5, 0], [11, 0], [16, 0]];
const SLOT_OF = new Int8Array(20).fill(-1);
SLOTS.forEach(([c0], k) => { for (let c = 0; c < 4; c++) SLOT_OF[c0 + c] = k; });

// keyboard: gx -6 is an E, 32 keys up to B
const BLACK = (gx) => [2, 4, 6, 9, 11].includes((((gx + 6) % 12) + 12) % 12);

// --------------------------------------------------------------- palette
const LH = kit.hex('#2f7dff');        // left hand: hours
const RH = kit.hex('#3fe06a');        // right hand: minutes
const GOLD = kit.hex('#ffb43a');      // the hour: glissando, bells
const IVORY = [0.075, 0.062, 0.042];
const FELT = [0.06, 0, 0];
const SPARK = [1, 0.95, 0.8];

// ------------------------------------------------------------------ time
const localSec = (d) => d.getTime() / 1000 - d.getTimezoneOffset() * 60;
/** Roll position in rows at local second tl: steady tempo plus a surge after each minute turn. */
function rollAt(tl) {
  const mi = Math.floor(tl / 60), age = tl - 60 * mi;
  return R * tl + B * (mi + kit.ease.inOut(kit.clamp(age / SURGE)));
}
const digitsOf = (mi) => {
  const h = Math.floor(mi / 60) % 24, m = ((mi % 60) + 60) % 60;
  return [Math.floor(h / 10), h % 10, Math.floor(m / 10), m % 10];
};
const minuteOfRow = (q) => Math.floor(q / P);

// ---------------------------------------------------------------- the hour
// In the first minute of an hour, the rest at the top of each of the first
// N phrases (N = the hour, 1..12) carries a glissando: a gold run over all
// 32 keys, alternating up and down. In the roll it is a thin sloped gold
// rule between the copies; on the keys it is a sweep that runs past the
// ends of the roll, and the outer keys ring on after it like a bell.
const GL_SLOPE = 1.7 / 31;             // rows per key
const GL_LEN = 0.3;                    // rows each gliss note lasts
const strikesOf = (hourMi) => (Math.floor(hourMi / 60) % 12) || 12;
/** Gliss note on key/lane c in phrase j after the hour's first row hq: [a, b) rows. */
function glissNote(c, hq, j) {
  const pos = j % 2 === 0 ? c + 6 : 25 - c;
  const a = hq + PHRASE * j + 8.1 + pos * GL_SLOPE;
  return [a, a + GL_LEN];
}

// --------------------------------------------------------------- the notes
const ROLLED = 0.2;                    // rows between the lanes of a rolled chord
const GRAV = 60;                       // rows/s^2: released notes drop off the roll
/** Weight of lane c's note cell at roll row q (0 = rest), and its minute. */
function cellAt(c, q) {
  const k = SLOT_OF[c];
  if (k < 0) return null;
  const p = ((q % PHRASE) + PHRASE) % PHRASE;
  if (p > 7) return null;
  const mq = minuteOfRow(q), d = digitsOf(mq)[k];
  return GLYPH[d][7 - p][c - SLOTS[k][0]] ? mq : null;
}

/**
 * The notes of lane c near the window, as falling bodies: [{ a, b, w, rel }]
 * in roll rows (a = the head, which lands first). Notes of a digit that has
 * changed are released at the minute turn and fall under gravity, each a
 * little after the next, so the old digit crumbles into the keys.
 */
function laneNotes(c, s, tl, miNow) {
  const out = [];
  const lo = Math.floor(s - HIT) - 9, hi = Math.floor(s) + 1;
  const now = digitsOf(miNow)[SLOT_OF[c]];
  let q = lo;
  while (q <= hi) {
    const mq = cellAt(c, q);
    if (mq === null) { q++; continue; }
    let q1 = q;
    while (q1 + 1 <= hi + 8 && cellAt(c, q1 + 1) === mq && ((q1 + 1) % PHRASE + PHRASE) % PHRASE !== 0) q1++;
    // chords are rolled, low to high: each lane of a digit sounds a little after the one to its left
    const roll = ROLLED * (c - SLOTS[SLOT_OF[c]][0]);
    let a = q + roll, b = q1 + 1 + roll, w = 1, rel = 0, ghost = 0;
    if (mq < miNow && digitsOf(mq)[SLOT_OF[c]] !== now) {
      const tau = tl - 60 * (mq + 1) - 0.2 * kit.hash(c, q);
      ghost = kit.ease.out(kit.clamp(tau / 0.12));                  // released: it pales as it lets go
      w = 1 - 0.3 * ghost;
      if (tau > 0) {
        const drop = 6 * tau + 0.5 * GRAV * tau * tau, v = 6 + GRAV * tau;
        a -= drop; b -= drop - Math.min(2.5, v * 0.04);   // a streak as it gathers speed
        w *= 1 - 0.35 * kit.clamp(tau / 0.9);
        rel = v;
      }
      if (mq < miNow - 1) w = 0;
    }
    if (w > 0) out.push({ a, b, w, rel, ghost, gold: (mq + 1) % 60 === 0 });
    q = q1 + 1;
  }
  return out;
}

const overlap = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

export default {
  name: 'Pianola',
  blurb: 'falling-notes piano roll: the time is the score, the keys play it as it lands',
  layouts: ['sq-strip'], look: { look: 'opal', gap: 2.0 }, fps: 60, brightness: 0.6, dither: true,
  frame(ctx) {
    const { leds, date } = ctx;
    const tl = localSec(date), s = rollAt(tl), miNow = Math.floor(tl / 60);
    const dim = 1 - 0.75 * ctx.night;
    const speed = (s - rollAt(tl - 0.02)) / 0.02;       // rows per second
    const uh = s - HIT;                                 // the roll row on the hit line

    const hourMi = Math.floor(miNow / 60) * 60, hq = hourMi * P;
    const strikes = miNow - hourMi < 2 ? strikesOf(hourMi) : 0;

    const notes = [];
    for (let c = 0; c < 20; c++) notes[c] = SLOT_OF[c] < 0 ? [] : laneNotes(c, s, tl, miNow);

    // ---- the roll
    for (const l of leds) {
      if (l.gy >= 20) continue;
      const c = l.gx, u = s - l.gy;
      const col = SLOT_OF[c] < 2 ? LH : RH;
      let v = 0, vg = 0, gold = false;
      for (const n of notes[c]) {
        const o = overlap(u - 0.5, u + 0.5, n.a, n.b);
        if (o <= 0) continue;
        const along = kit.clamp((u - n.a) / Math.max(1, n.b - n.a));    // 0 at the head
        const e = o * n.w * (1 - 0.38 * along);
        v += e; vg += e * n.ghost; gold ||= n.gold;
      }
      if (v > 0) {
        const k = dim * (BLACK(c) ? 0.85 : 1);
        kit.add(ctx, l.i, col, k * (v - (gold ? 1 : 0.6) * vg));
        // released notes pale; at the hour they turn to gold as they fall
        kit.add(ctx, l.i, gold ? GOLD : kit.mix(col, [1, 1, 1], 0.6), k * (gold ? 0.8 : 0.45) * vg);
      }
      // bar lines in the rests, scrolling with the roll
      const bd = (((u - 9) % PHRASE) + PHRASE) % PHRASE, bar = 1 - Math.min(1, Math.min(bd, PHRASE - bd) / 0.6);
      if (bar > 0) kit.add(ctx, l.i, [0.012, 0.012, 0.02], dim * bar);
      // the hour's glissandi
      for (let j = 0; j < strikes; j++) {
        const [a, b] = glissNote(c, hq, j);
        const o = overlap(u - 0.5, u + 0.5, a, b);
        if (o > 0) kit.add(ctx, l.i, GOLD, dim * 1.4 * o);
      }
    }

    // ---- what reaches the hit line
    const keyLv = new Float32Array(32), keyCol = new Array(32).fill(LH), keyGold = new Float32Array(32);
    const sparks = [];
    for (let c = 0; c < 20; c++) {
      const k = c + 6, col = SLOT_OF[c] < 2 ? LH : RH;
      for (const n of notes[c]) {
        const vel = speed + n.rel;
        if (uh >= n.a && uh < n.b + 0.3) {
          const into = uh - n.a, flash = Math.exp(-into * 1.1);
          let lv = n.w * (0.5 + 0.5 * flash) * kit.smoothstep(0, 0.12, into);
          lv *= 1 - kit.smoothstep(n.b - 0.1, n.b + 0.3, uh);                   // release
          if (lv > keyLv[k]) { keyLv[k] = lv; keyCol[k] = n.gold && n.ghost > 0 ? GOLD : col; }
        }
        const age = (uh - n.a) / Math.max(vel, 0.5);                        // seconds since it struck
        if (age > 0 && age < 0.6) sparks.push([c, n.a, age, n.gold && n.ghost > 0 ? GOLD : col, n.w]);
      }
    }
    for (let j = 0; j < strikes; j++) {
      for (let c = -6; c <= 25; c++) {
        const k = c + 6, [a, b] = glissNote(c, hq, j);
        // each gliss note is a quick touch: about a key lit at the head, a short tail behind
        if (uh >= a) keyGold[k] = Math.max(keyGold[k], Math.exp(-(uh - a) / 0.09));
        // the outer keys ring on like a bell
        if ((c < 0 || c > 19) && uh > a + 0.3) keyGold[k] = Math.max(keyGold[k], 0.4 * kit.smoothstep(a + 0.3, a + 0.5, uh) * Math.exp(-(uh - a) / Math.max(speed, 0.5) * 1.4));
      }
    }

    // ---- the keyboard
    for (const l of leds) {
      if (l.gy < 20) continue;
      const k = l.gx + 6, row = l.gy - 20, black = BLACK(l.gx);
      if (row === 0) { kit.add(ctx, l.i, FELT, dim); continue; }      // the felt behind the keys
      const onKey = !black || row <= 4;                               // black keys stop short
      if (black && row <= 4) { /* ebony: dark */ } else kit.add(ctx, l.i, IVORY, dim * (0.8 + 0.06 * row));
      if (!onKey) continue;
      if (keyLv[k] > 0) kit.add(ctx, l.i, kit.mix(keyCol[k], [1, 1, 1], 0.25 * keyLv[k]), dim * keyLv[k]);
      if (keyGold[k] > 0) kit.add(ctx, l.i, GOLD, dim * keyGold[k]);
    }

    // ---- the strike: a glow on the hit line and a few sparks thrown up
    const X0 = -28.5, YH = 17.6;
    for (let c = 0; c < 20; c++) {
      const lv = keyLv[c + 6];
      if (lv > 0.55) kit.splat(ctx, X0 + 3 * c, YH, 3.4, keyCol[c + 6], dim * 0.5 * (lv - 0.5));
    }
    for (const [c, a, age, col, w] of sparks) {
      const life = 1 - age / 0.6, sc = kit.mix(col, SPARK, 0.6);
      for (let m = 0; m < 2; m++) {
        const h1 = kit.hash(c, Math.round(a * 8), m), h2 = kit.hash(m, c, Math.round(a * 8) + 7);
        const vx = (h1 - 0.5) * 22, vy = 22 + 22 * h2;
        const x = X0 + 3 * c + vx * age, y = YH - vy * age + 0.5 * 110 * age * age;
        kit.splat(ctx, x, y, 2.2, sc, dim * 0.45 * w * life * life);
      }
    }
  },
};
