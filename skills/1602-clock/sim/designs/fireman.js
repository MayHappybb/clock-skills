// Fireman — the time is a fire, and one firefighter can never put it out.
//
// The four numerals are an inferno: every stroke is a column of flame whose
// ragged edges climb, with tongues licking along the top of every bar, so
// the whole glass burns. One small firefighter stands at the right edge with
// a hose. A cat sits warming itself between the hours and the minutes.
//
// Each minute he braces and hoses the digit that is about to change. It
// sizzles (fire and steam flicker), dies to steam puffs that rise out of it
// (ROM rings, low to high), and he wipes his brow and turns away. Then a
// spark jumps from the neighbouring numeral across the gap, the embers catch,
// and the fire roars back exactly on the minute in the shape of the new digit.
// He spins round and reacts: a jump, a shaken fist, a slump, a facepalm.
// When a ten turns, the jet first kills the units and then reaches through
// their steam to the tens.
//
// The hour: he hoses everything that changes, right to left; the jet passes
// under the cat, which leaps into the top row with its fur on end. Dripping,
// it drops back, shakes itself dry, glares at him... and strikes a match.
// The new hour and minutes ignite outwards from the cat, and the blast blows
// his helmet off.
//
// Budget: the flames are a kit of five parts (stroke top, stroke bottom, top
// bar, top+middle bar, bar), shared by every digit, so the face is at most
// five slots however the time reads (a second stroke crown for the units
// digits is taken only when a slot is free). Then the firefighter (1), the
// cat (1), and one spare for embers or a flying helmet. Steam, jet, sparks and the
// kindling are ROM. Everything is derived from the clock.

import { TileAllocator, noise, smoothNoise, clockFields } from '../js/kit.js';

// ------------------------------------------------------------------ layout

const DCOL = [0, 4, 8, 12];          // H tens, H units, M tens, M units: three cells each
const CAT = 7, MAN = 15;

// Digits as [top row, bottom row] of part letters per cell.
// V: a stroke (full cell), T: top bar, M: top + middle bars, B: a bar on the
// lower rows (the middle bar in the top row, the base in the bottom row).
const DIGITS = {
  0: ['VTV', 'VBV'],
  1: [' V ', ' V '],
  2: ['MMV', 'VBB'],
  3: ['MMV', 'BBV'],
  4: ['VBV', '  V'],
  5: ['VMM', 'BBV'],
  6: ['VMM', 'VBV'],
  7: ['TTV', '  V'],
  8: ['VMV', 'VBV'],
  9: ['VMV', 'BBV'],
};

// ROM props
const JET = 0xb0;                    // a full-width bar on row 3: the water jet
const STEAM = [0xa1, 0xa5, 0xdf];    // a small ring low, a puff, a ring high: steam rising
const SPARK = [0x2e, 0xa5, 0x27];    // a spark low, middle, high (embers, the match)
const LEAP = 0xde;                   // two sparks in the air
const MATCH = 0x2a;                  // the cat's lit match, held up
const DROP = 0x27;                   // splash-back over the firefighter

// ------------------------------------------------------------------ flames
//
// A stroke is a column of flame that sways: each dot row leans left or right
// by a dot, and the lean climbs a row every 0.16 s, so the fire rises. The
// top of a stroke is a crown of one or two tongues; the top edge of every bar
// is a row of tips. Both are re-chosen every 0.22 s, each part on its own
// beat, so the digits never flicker in step.

const SWAY = ['####.', '#####', '.####', '#####'];

/**
 * A row of tongues `n` dots tall: one or two peaks that drift sideways a
 * dot at a time, each falling away to its neighbours, so every tongue is a
 * point over a wider base. The last row is always lit.
 */
function tongues(t, seed, n) {
  const p1 = Math.floor(smoothNoise(t * 2.6, seed) * 5);
  const two = noise(Math.floor(t / 0.3), seed + 50) < 0.55;
  const p2 = (p1 + 2 + Math.floor(noise(Math.floor(t / 0.3), seed + 60) * 2)) % 5;
  const h = [];
  for (let c = 0; c < 5; c++) {
    let v = n - Math.abs(c - p1);
    if (two) v = Math.max(v, n - 1 - Math.abs(c - p2));
    h.push(Math.max(1, v));
  }
  const rows = [];
  for (let r = 0; r < n; r++) rows.push(h.map((v) => (v >= n - r ? '#' : '.')).join(''));
  return rows;
}

function strokeRows(y0, t, seed) {
  const k = Math.floor(t / 0.16);
  const out = [];
  for (let r = 0; r < 8; r++) {
    const y = y0 + r;
    // a lean wave travelling upward, broken up by a little noise
    let i = (y + k + seed) % 4;
    if (noise(y * 3 + seed, Math.floor(t / 0.32)) < 0.18) i = (i + 1) % 4;
    out.push(SWAY[i]);
  }
  return out;
}

function part(name, t) {
  const blank = '.....', full = '#####';
  switch (name) {
    case 'Vt': case 'Vt2': {
      const sd = name === 'Vt' ? 1 : 8;
      const r = strokeRows(0, t, sd === 1 ? 0 : 2);
      tongues(t, sd, 3).forEach((row, i) => { r[i] = row; });
      return r;
    }
    case 'Vb': { const r = strokeRows(8, t, 0); r[7] = full; return r; }
    case 'T': return [...tongues(t, 2, 2), full, full, blank, blank, blank, blank];
    case 'M': return [...tongues(t, 3, 2), full, blank, blank, ...tongues(t, 4, 2), full];
    case 'B': return [blank, blank, blank, blank, ...tongues(t, 5, 2), full, full];
  }
  return null;
}
const partName = (ch, row) => (ch === 'V' ? (row ? 'Vb' : 'Vt') : ch);

// Embers: low flames along the foot of a cell, before a digit catches.
const EMBER = ['.....', '.....', '.....', '.....', '.....', '..#..', '#.#.#', '#####'];
const EMBER2 = ['.....', '.....', '.....', '.....', '.#...', '.#.#.', '##.##', '#####'];

// ------------------------------------------------------------------ the firefighter
// Facing left, at the fire; hose from the right edge. Helmet: dome and a long back brim.

const MANP = {
  stand: ['..##.', '.####', '..##.', '.###.', '#.##.', '..##.', '..##.', '..#.#'],
  look:  ['...##', '..###', '...#.', '.###.', '#.##.', '..##.', '..##.', '..#.#'],
  aim:   ['..##.', '.####', '..##.', '###..', '..##.', '..##.', '..#.#', '.#..#'],
  spray: ['...##', '..###', '...#.', '####.', '..##.', '..##.', '..#.#', '.#..#'],
  wipe:  ['..##.', '.####', '.###.', '.###.', '..##.', '..##.', '..##.', '..#.#'],
  away:  ['.##..', '####.', '.##..', '.###.', '.##.#', '.##..', '.##..', '#.#..'],
  jump:  ['..##.', '.####', '#.##.', '.###.', '..##.', '.#..#', '#....', '.....'],
  fist:  ['#.##.', '#####', '..##.', '.###.', '..##.', '..##.', '..##.', '..#.#'],
  slump: ['.....', '..##.', '.####', '..##.', '.###.', '#.##.', '..##.', '..#.#'],
  palm:  ['..##.', '.####', '.##..', '.###.', '..##.', '..##.', '..##.', '..#.#'],
  bare:  ['..#.#', '#.##.', '#.##.', '.###.', '..##.', '..##.', '..#.#', '..#.#'],
};
const HELMET = ['.....', '.....', '.....', '.##..', '####.', '.....', '.....', '.....'];
const HELMET2 = ['.....', '..##.', '.####', '.....', '.....', '.....', '.....', '.....'];

// ------------------------------------------------------------------ the cat
// Facing right, towards the firefighter.

const CATP = {
  sit: ['.....', '#...#', '#####', '#.#.#', '#####', '.###.', '.####', '##.##'],
  flick: ['.....', '#...#', '#####', '#.#.#', '#####', '.####', '.###.', '##.##'],
  blink: ['.....', '#...#', '#####', '#####', '#####', '.###.', '.####', '##.##'],
  lick: ['.....', '#...#', '#####', '#.#.#', '###.#', '.##.#', '.####', '##.##'],
  up: ['#...#', '#.#.#', '#####', '#####', '.###.', '.###.', '.####', '##.##'],
  loaf:  ['.....', '.....', '.....', '#...#', '#####', '#####', '#####', '.###.'],
  cling: ['#...#', '#####', '#.#.#', '#####', '.###.', '#.#.#', '#...#', '.....'],
  wet:   ['.....', '.....', '#####', '#.#.#', '#####', '.###.', '.###.', '.#.#.'],
  shake1:['.....', '#.#.#', '#####', '#.#.#', '#####', '#####', '.###.', '#.#.#'],
  shake2:['.....', '.#.#.', '#####', '#.#.#', '#####', '.###.', '#####', '.#.#.'],
  match: ['....#', '#..##', '#####', '#.#.#', '#####', '.###.', '.####', '##.##'],
  smug: ['.....', '#...#', '#####', '#####', '#.#.#', '.###.', '.####', '##.##'],
};

const mirror = (rows) => rows.map((l) => [...l].reverse().join(''));

// ------------------------------------------------------------------ time

const digitsAt = (date) => { const f = clockFields(date); return f.hh + f.mm; };
const changed = (a, b) => [3, 2, 1, 0].filter((i) => a[i] !== b[i]);

/**
 * What happens around one minute boundary, as times relative to it (s).
 * `L` lists the digits that change, right to left (always a run ending at 3).
 */
function plan(L) {
  const hour = L.includes(1);
  const K = L.length;
  const SIZ = hour ? 0.5 : 0.8, CELL = hour ? 0.1 : 0.15;
  const E = hour ? -1.8 : K === 1 ? -1.6 : -1.3;          // the last flame dies
  let total = 0;
  L.forEach((i, n) => { if (n) total += 4 * CELL; total += SIZ; });
  const S = E - total;
  const douse = {};
  let t = S, front = MAN;                                  // jet front: leftmost wet cell
  const jetSteps = [];                                     // [time, front col]
  L.forEach((i, n) => {
    if (n) for (let c = front - 1; c >= DCOL[i] + 2; c--) { t += CELL; jetSteps.push([t, c]); front = c; }
    douse[i] = { s: t, e: t + SIZ };
    t += SIZ;
  });
  // relighting: full flame at `full`, embers for 0.3 s before, a spark in
  // the gap to its left for 0.3 s before that
  const light = {};
  if (hour) {
    for (const i of L) light[i] = { full: i === 1 || i === 2 ? 0 : 0.45, from: i === 1 ? 'cat' : i === 2 ? 'cat' : 'gap' };
  } else if (K === 1) light[3] = { full: 0, from: 'gap' };
  else { light[2] = { full: 0, from: 'gap' }; light[3] = { full: 0.6, from: 'gap' }; }
  return { hour, K, S, E, douse, jetSteps, light };
}

// ------------------------------------------------------------------ the face

export default {
  name: 'Fireman',
  blurb: 'The time is an inferno: a firefighter hoses each changing digit to steam, and a spark relights it as the next minute; on the hour the cat, soaked, strikes a match.',
  bus: 'i2c100',
  panel: 'green',
  fps: 10,

  frame(lcd, api, { date, fields }) {
    const ms = date.getTime();
    const u = fields.s + fields.ms / 1000;                 // seconds into this minute
    const B = ms - u * 1000;                               // this minute began
    const now = digitsAt(new Date(B + 500));
    const prev = digitsAt(new Date(B - 30000));
    const next = digitsAt(new Date(B + 60500));
    const Lnext = changed(now, next), Lprev = changed(prev, now);
    const up = plan(Lnext), past = plan(Lprev);
    const tu = u - 60, tp = u;                             // relative to the coming and the last boundary
    const mseed = Math.floor(B / 60000);
    const night = fields.h < 6 || fields.h >= 22;

    const grid = [Array(16).fill(0x20), Array(16).fill(0x20)];
    const want = [];                                       // [col,row,tile,priority]

    // ---- each digit's state
    // fire(d) | sizzle(d) | steam(since) | embers(d) | blank
    const state = [0, 1, 2, 3].map((i) => {
      const d = up.douse[i];
      if (d && tu >= d.s) {
        if (tu < d.e) return Math.floor((tu - d.s) / 0.2) % 2 ? { k: 'steam', since: 0 } : { k: 'fire', d: now[i] };
        const lu = up.light[i];
        if (lu && tu >= lu.full - 0.3) return { k: 'embers', d: next[i], t: tu - lu.full + 0.3 };
        return { k: 'steam', since: tu - d.e };
      }
      const lp = past.light[i];
      if (lp && tp < lp.full) {
        if (tp >= lp.full - 0.3) return { k: 'embers', d: now[i], t: tp - lp.full + 0.3 };
        return { k: 'steam', since: 2 + tp };
      }
      return { k: 'fire', d: now[i] };
    });

    // ---- flames and steam
    state.forEach((st, i) => {
      const c0 = DCOL[i];
      if (st.k === 'fire') {
        DIGITS[st.d].forEach((rowStr, r) => [...rowStr].forEach((ch, j) => {
          if (ch === ' ') return;
          const nm = partName(ch, r);
          if (nm === 'Vt' && i % 2) want.push([c0 + j, r, part('Vt2', u), 5, part('Vt', u)]);
          else want.push([c0 + j, r, part(nm, u), 0]);
        }));
      } else if (st.k === 'steam') {
        // one puff per column rises out of the doused digit in six steps,
        // then only a wisp now and then while it waits
        for (let j = 0; j < 3; j++) {
          let step = Math.floor((st.since - j * 0.3) / 0.22);
          if (step >= 6) {
            const q = st.since + j * 0.9, w = Math.floor(q / 2.2);
            step = noise(w, j + i * 3) < 0.5 ? Math.floor((q - w * 2.2) / 0.25) : 9;
          }
          if (step >= 0 && step < 3) grid[1][c0 + j] = STEAM[step];
          else if (step >= 3 && step < 6) grid[0][c0 + j] = STEAM[step - 3];
        }
      } else if (st.k === 'embers') {
        const rowStr = DIGITS[st.d][1];
        [...rowStr].forEach((ch, j) => {
          if (ch !== ' ') want.push([c0 + j, 1, Math.floor(u / 0.15) % 2 ? EMBER : EMBER2, 3]);
          else if (DIGITS[st.d][0][j] !== ' ') grid[1][c0 + j] = SPARK[0];
        });
      }
    });

    // ---- the jet (coming boundary)
    let spraying = false;
    if (tu >= up.S && tu < up.E + 0.15) {
      spraying = true;
      let front = MAN;
      for (const [t, c] of up.jetSteps) if (tu >= t) front = c;
      for (let c = front; c < MAN; c++) {
        const isDigitCell = DCOL.some((d0, i) => c >= d0 && c < d0 + 3 && state[i].k === 'fire');
        if (!isDigitCell) grid[1][c] = JET;
      }
    }

    // ---- sparks leaping into a gap before a digit catches
    const sparkFor = (pl, t) => {
      for (const [i, l] of Object.entries(pl.light)) {
        if (l.from !== 'gap') continue;
        const g = DCOL[i] - 1;
        if (t >= l.full - 0.6 && t < l.full - 0.3) grid[0][g] = LEAP;
      }
    };
    sparkFor(up, tu); sparkFor(past, tp);

    // ---- the firefighter
    let man = 'stand', faceRight = false, helmetFly = null;
    const Ld = up.douse, first = Ld[3];
    const react = Math.floor(noise(mseed, 5) * 4);
    if (spraying) man = Math.floor((tu - up.S) / 0.3) % 2 ? 'spray' : 'aim';
    else if (first && tu >= up.S - 0.9 && tu < up.S) man = 'aim';
    else if (first && tu >= up.S - 2.2 && tu < up.S - 0.9) man = 'look';
    else if (tu >= up.E + 0.15) {
      const v = tu - up.E - 0.15;
      if (up.hour) man = v < 0.9 ? 'wipe' : 'away', faceRight = v >= 0.9;
      else man = v < 0.7 ? 'wipe' : 'away', faceRight = v >= 0.7;
    } else if (tp < 3.2 && Lprev.length) {
      // the fire is back: he spins round
      if (past.hour) {
        if (tp < 0.2) { man = 'away'; faceRight = true; }
        else if (tp < 1.6) { man = 'bare'; helmetFly = tp < 0.8 ? HELMET2 : HELMET; }
        else if (tp < 2.4) man = 'bare';
        else man = 'slump';
      } else {
        const seq = [['jump', 'fist', 'fist'], ['jump', 'slump', 'slump'], ['look', 'palm', 'palm'], ['jump', 'fist', 'slump']][react];
        man = tp < 0.2 ? 'away' : seq[Math.min(2, Math.floor((tp - 0.2) / 1.0))];
        faceRight = tp < 0.2;
        if (man === 'fist' && Math.floor(tp / 0.3) % 2) man = 'stand';
      }
    } else {
      // idle: a loop of small fidgets
      const w = Math.floor(u / 2.4), lt = Math.max(0, u - w * 2.4), r = noise(w, mseed % 97);
      if (r < 0.25) man = lt < 1.2 ? 'look' : 'stand';
      else if (r < 0.45) man = lt > 0.6 && lt < 1.6 ? 'wipe' : 'stand';
      else if (r < 0.65) man = lt < 1.6 ? (Math.floor(lt / 0.4) % 2 ? 'aim' : 'stand') : 'stand';
      else man = Math.floor(lt / 0.8) % 2 ? 'look' : 'stand';
    }
    const manTile = faceRight ? mirror(MANP[man]) : MANP[man];
    want.push([MAN, 1, manTile, 1]);
    if (helmetFly) want.push([MAN, 0, helmetFly, 4]);
    if (spraying && Math.floor(tu / 0.3) % 2 && grid[0][MAN] === 0x20) grid[0][MAN] = DROP;

    // ---- the cat
    let cat = night ? 'loaf' : 'sit', catRow = 1;
    const w = Math.floor(u / 3.1), lt = Math.max(0, u - w * 3.1), r = noise(w, 77 + (mseed % 31));
    if (!night) {
      if (r < 0.3) cat = lt < 0.5 || (lt > 1.0 && lt < 1.5) ? 'flick' : 'sit';
      else if (r < 0.5) cat = lt < 2.0 ? (Math.floor(lt / 0.35) % 2 ? 'lick' : 'sit') : 'blink';
      else if (r < 0.65) cat = 'up';
    }
    // a spark crossing above it: it looks up
    if (grid[0][CAT] === LEAP) cat = 'up';
    if (up.hour) {
      const wetAt = (up.jetSteps.find(([, c]) => c === CAT) ?? [up.E])[0];
      if (tu >= wetAt - 0.1 && tu < up.E + 0.2) { cat = 'cling'; catRow = 0; }
      else if (tu >= up.E + 0.2) {
        const v = tu - up.E - 0.2;
        if (v < 0.3) cat = 'wet';
        else if (v < 0.7) cat = Math.floor(v / 0.2) % 2 ? 'shake1' : 'shake2';
        else { cat = 'match'; if (Math.floor(v / 0.2) % 2) grid[0][CAT] = MATCH; else grid[0][CAT] = SPARK[2]; }
      } else if (tu >= up.S - 2.2) cat = 'up';
    }
    if (past.hour && tp < 3.2) {
      if (tp < 0.3) { cat = 'match'; grid[0][CAT] = LEAP; }
      else cat = Math.floor(tp / 0.4) % 2 ? 'lick' : 'smug';
    }
    want.push([CAT, catRow, CATP[cat], 2]);

    // ---- allocate: flames first, then the firefighter, the cat, extras
    want.sort((a, b) => a[3] - b[3]);
    const alloc = new TileAllocator(lcd, 0);
    for (const [c, rr, tile, , alt] of want) {
      let code = alloc.add(tile);
      if (code == null && alt) code = alloc.add(alt);
      if (code != null) grid[rr][c] = code;
    }
    alloc.flush();
    grid.forEach((codes, row) => { lcd.setCursor(0, row); codes.forEach((c) => lcd.data(c)); });
  },
};
