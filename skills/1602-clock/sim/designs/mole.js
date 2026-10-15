// Whack-a-Clock — four moles peek over the four digits of the time.
//
// Each digit is a sign, held up from a hole in the ground, with its mole
// peeking over the top edge, Kilroy-style: eyes over the wall, claws hooked
// on the sign. A mallet floats in the sky row, patrolling, and every mole
// keeps an eye on it: they look left or right after it, blink, and duck
// when it hovers overhead. The one furthest from it pulls a face. A spare
// burrow mid-field (ROM omega) has a little one that peeks out now and then
// and dives when the mallet comes near.
//
// When the minute turns, the mallet sneaks over the mole holding the digit
// that changed. The mole cowers, trembling; the mallet pulls back a cell for
// the swing, the mole peeks up thinking it has gone, and gets whacked:
// squashed flat, its sign knocked into the hole a step at a time, stars
// over the hole. Then a new mole pushes up the new sign and throws its arms
// up. When several digits change (10:59 -> 11:00) it works right to left,
// one whack every three seconds, and each digit keeps its old value until
// it is hit, so the glass never shows a time that was not true.
//
// On the hour the new hour mole comes up in a hard hat. The mallet takes a
// swing at it, CLANG, bounces off the top of the glass and reels back in
// dizzy, while every mole on the glass jeers. The hat stays on for the
// first minute, and the hatted mole does not duck.
//
// Tiles: the four signs come first (a digit shown twice shares one tile),
// then the mallet's two cells (composited over whatever mole is under it),
// then the helmet, then mole heads, which are coerced onto poses already on
// the glass if slots run out, then the little one, who stays in the burrow
// if there is no slot. Stars, sparks, ground, burrow and CLANG are ROM.
// Everything is derived from the wall clock.

import { TileAllocator, smoothNoise, clamp } from '../js/kit.js';

const COLS = [2, 4, 11, 13];      // sign cells, row 1; mole heads above, row 0
const GAP = 3.0;                  // seconds between whacks when several digits change
const GROUND = 0x5f;
const STAR = [0x2a, 0x2b, 0xeb, 0x2b];
const BURROW = 7, OMEGA = 0xf4;   // a spare burrow mid-field: ROM omega, on the ground line
const BABY = ['.....', '.###.', '#####', '#.#.#', '#####', '.#.#.', '##.##', '.....'];
const BABY_BLINK = ['.....', '.###.', '#####', '#####', '#####', '.#.#.', '##.##', '.....'];

// Bold 5x7 digits on rows 0-6: two-dot stems, so they carry at arm's length.
const D = {
  0: ['.###.', '##.##', '##.##', '##.##', '##.##', '##.##', '.###.'],
  1: ['.##..', '###..', '.##..', '.##..', '.##..', '.##..', '####.'],
  2: ['.###.', '##.##', '...##', '..##.', '.##..', '##...', '#####'],
  3: ['####.', '...##', '...##', '.###.', '...##', '...##', '####.'],
  4: ['...##', '..###', '.#.##', '#..##', '#####', '...##', '...##'],
  5: ['#####', '##...', '####.', '...##', '...##', '##.##', '.###.'],
  6: ['.###.', '##...', '##...', '####.', '##.##', '##.##', '.###.'],
  7: ['#####', '...##', '...##', '..##.', '..##.', '.##..', '.##..'],
  8: ['.###.', '##.##', '##.##', '.###.', '##.##', '##.##', '.###.'],
  9: ['.###.', '##.##', '##.##', '.####', '...##', '...##', '.###.'],
};

/** A sign sunk `k` dots into its hole (0 = up, 7+ = gone). */
function signTile(d, k) {
  const out = [];
  for (let r = 0; r < 7; r++) out.push(d != null && r >= k ? D[d][r - k] : '.....');
  out.push('.....');
  return out;
}

// Mole heads, in the sky row, claws on row 7 hooked over the sign below.
const HEAD = {
  C:     ['.....', '.###.', '#####', '#.#.#', '#####', '#####', '.#.#.', '#...#'],
  L:     ['.....', '.###.', '#####', '.#.##', '#####', '#####', '.#.#.', '#...#'],
  R:     ['.....', '.###.', '#####', '##.#.', '#####', '#####', '.#.#.', '#...#'],
  BLINK: ['.....', '.###.', '#####', '#####', '#####', '#####', '.#.#.', '#...#'],
  TAUNT: ['.....', '.###.', '#####', '#.###', '#####', '##.##', '##.##', '#.#.#'],
  CHEER: ['#...#', '#.#.#', '#####', '#.#.#', '#####', '#####', '.#.#.', '.....'],
  DUCK:  ['.....', '.....', '.....', '.....', '.....', '.###.', '#.#.#', '#...#'],
  QUAKE: ['.....', '.....', '.....', '.....', '.....', '.....', '#.#.#', '#...#'],
  PEEK:  ['.....', '.....', '.###.', '#.#.#', '#####', '#####', '.#.#.', '#...#'],
  SQUASH:['.....', '.....', '.....', '.....', '.....', '.....', '#####', '#.#.#'],
  HELM:  ['.###.', '#####', '#####', '.....', '#.#.#', '#####', '.#.#.', '#...#'],
  HELMW: ['.###.', '#####', '#####', '.....', '#.###', '#####', '##.##', '#.#.#'],
};

// The mallet: a barrel head in one cell, the handle rising out of its side
// through the next cell towards whoever is holding it, off the glass to the
// upper right. y is the head's top dot row (negative: raised above the glass).
const MALLET_HEAD = ['.###.', '#####', '#####', '.###.'];
const HANDLE = [[0, 1], [1, 1], [2, 0], [3, 0], [4, -1]];  // [dot col, row from y] in the next cell
function malletTiles(y) {
  const L = Array(8).fill(0), R = Array(8).fill(0);
  MALLET_HEAD.forEach((l, r) => { if (y + r >= 0 && y + r < 8) L[y + r] = bits([l])[0]; });
  for (const [i, dr] of HANDLE) { const r = y + dr; if (r >= 0 && r < 8) R[r] |= 0x10 >> i; }
  return [L, R];
}
const bits = (rows) => rows.map((l) => [...l].reduce((b, ch) => (b << 1) | (ch === '#' ? 1 : 0), 0));
const str = (b) => Array.from({ length: 5 }, (_, i) => ((b >> (4 - i)) & 1 ? '#' : '.')).join('');
const over = (top, under) => top.map((b, r) => str(b | under[r]));

// ------------------------------------------------------------------ timing

/** Whacks scheduled at the minute boundary B (seconds since midnight). */
function whacksAt(B, kit, dayStart) {
  const now = kit.clockFields(new Date(dayStart + B * 1000));
  const was = kit.clockFields(new Date(dayStart + (B - 60) * 1000));
  const a = was.hh + was.mm, b = now.hh + now.mm;
  const out = [];
  for (let i = 3; i >= 0; i--) {
    if (a[i] !== b[i]) out.push({ i, from: +a[i], to: +b[i], S: B + out.length * GAP });
  }
  const hour = now.mm === '00';
  const clang = hour ? { i: 1, S: B + (out.length - 1) * GAP + 4.2 } : null;
  return { list: out, clang, B };
}

/** Patrol column at time T, before strikes override it. */
const patrolCol = (T) => {
  const j = Math.floor(T / 2.4), u = T / 2.4 - j;
  const c = (k) => Math.round(clamp(7.5 + 8 * (smoothNoise(k * 0.3, 3) - 0.5) * 2, 0, 15));
  const a = c(j), b = c(j + 1);
  // hold for half the segment, then walk a cell per 150 ms to the next spot
  if (u < 0.5) return a;
  const n = Math.floor(((u - 0.5) * 2.4) / 0.15);
  return a + Math.sign(b - a) * Math.min(Math.abs(b - a), n);
};

export default {
  name: 'Whack-a-Clock',
  blurb: 'Moles peek over the digits; each minute the mallet whacks the one that changed into its hole and a new mole pushes up the new digit.',
  bus: 'i2c100',
  panel: 'green',
  fps: 10,

  frame(lcd, api, { fields, date, kit }) {
    const midnight = new Date(date); midnight.setHours(0, 0, 0, 0);
    const dayStart = midnight.getTime();
    const T = (date.getTime() - dayStart) / 1000;
    const B = T - (fields.s + fields.ms / 1000);

    const cur = whacksAt(B, kit, dayStart);
    const next = whacksAt(B + 60, kit, dayStart);
    const value = fields.hh + fields.mm;

    // Strike events relevant now: this minute's, plus the approach to the next.
    const events = [...cur.list.map((w) => ({ ...w })), ...(cur.clang ? [{ ...cur.clang, clang: true }] : [])];
    const ahead = next.list[0];

    // ---- the mallet: column and head height
    let mcol = patrolCol(T), my = 1 + (Math.floor(T / 0.6) % 2);
    const moleAt = (c) => COLS.includes(c);
    let mode = 'patrol';
    const all = [...events, ...(ahead ? [ahead] : [])];
    all.forEach((e, n0) => {
      const u = T - e.S, x = COLS[e.i];
      const prev = !e.clang && n0 > 0 && all[n0 - 1].S > e.S - GAP - 1 ? all[n0 - 1] : null;
      if (u >= -2.2 && u < -0.9) {
        // walk to the target, one cell per 150 ms at most
        const from = prev ? COLS[prev.i] : patrolCol(e.S - 2.2), steps = Math.abs(x - from);
        const n = Math.min(steps, Math.floor((u + 2.2) / 0.15));
        mcol = from + Math.sign(x - from) * n; mode = 'approach';
      } else if (u >= -0.9 && u < 0.9) {
        mcol = x; mode = e.clang ? 'clang' : 'whack';
        if (u < -0.3) my = 0;                                     // hovering: the mole cowers
        else if (u < 0) { mcol = x + 1; my = -1; }                // pulled back for the swing
        else if (e.clang) my = u < 0.2 ? 1 : u < 0.4 ? -2 : -5;  // bounces off, out of sight
        else my = u < 0.25 ? 2 : u < 0.45 ? 3 : u < 0.6 ? 1 : 0;
      } else if (e.clang && u >= 0.9 && u < 2.6) {
        // reels back in, dizzy, wobbling between two cells
        mcol = 7; my = [1, 2, 1, 0][Math.floor(u / 0.3) % 4]; mode = 'dizzy';
      } else if (u >= 0.9 && u < 2.0 && !e.clang) {
        // leave towards wherever the patrol is going, a cell per step
        const to = patrolCol(e.S + 2.0), steps = Math.abs(to - x);
        const n = Math.min(steps, Math.floor((u - 0.9) / 0.15));
        mcol = x + Math.sign(to - x) * n;
      }
    });
    if ((mode === 'patrol' || mode === 'approach') && moleAt(mcol)) my = 0;   // keeps clear of a ducked head

    // ---- each mole: sign value and sink, and head pose
    const moles = [0, 1, 2, 3].map((i) => {
      const x = COLS[i];
      let d = +value[i], k = 0, head = null, stars = -1, phase = 'idle';
      const pre = ahead && ahead.i === i && T - ahead.S >= -0.9 ? ahead : null;
      const w = pre ? null : events.find((e) => e.i === i && !e.clang);
      if (w) {
        const u = T - w.S;
        if (u < 0) { d = w.from; phase = u >= -0.9 ? (u < -0.3 ? 'cower' : 'peek') : 'idle'; }
        else if (u < 0.25) { d = w.from; k = 1; head = 'SQUASH'; phase = 'hit'; }
        else if (u < 1.05) { d = w.from; k = [2, 3, 5, 7, 7][Math.floor((u - 0.25) / 0.2)] ?? 7; phase = 'sink'; stars = u; }
        else if (u < 1.65) { d = w.to; k = [7, 5, 3, 1][Math.floor((u - 1.05) / 0.15)]; phase = 'rise'; stars = u < 1.2 ? u : -1; }
        else if (u < 1.85) { head = 'DUCK'; phase = 'pop'; }
        else if (u < 2.6) { phase = 'proud'; }
      } else if (pre) {
        const u = T - pre.S;
        if (u >= -0.9) phase = u < -0.3 ? 'cower' : 'peek';
      }
      return { i, x, d, k, head, stars, phase };
    });

    // helmet: the new hour mole, from its rise until the minute is out
    const hourW = cur.clang ? cur.list.find((w) => w.i === 1) : null;
    const helmet = hourW && T - hourW.S >= 1.65;
    const clangU = cur.clang ? T - cur.clang.S : null;
    const taunting = clangU != null && clangU >= 0.2 && clangU < 2.8;

    // Pick each head pose.
    const far = moles.reduce((best, m) => (Math.abs(m.x - mcol) > Math.abs(best.x - mcol) ? m : best), moles[0]);
    const anyHit = events.some((e) => !e.clang && T - e.S >= 0 && T - e.S < 0.45);
    for (const m of moles) {
      if (m.head || m.phase === 'sink' || m.phase === 'rise') continue;
      if (helmet && m.i === 1) {
        m.head = taunting || (m.x !== mcol && (T % 5) < 1.2) ? 'HELMW' : 'HELM';
        continue;
      }
      if (m.phase === 'cower') m.head = Math.floor(T / 0.2) % 2 ? 'QUAKE' : 'DUCK';   // trembling
      else if (m.phase === 'peek') m.head = 'PEEK';
      else if (taunting) m.head = Math.floor(T / 0.4) % 2 ? 'TAUNT' : 'CHEER';
      else if (anyHit) m.head = 'BLINK';                     // the others wince
      else if (m.x === mcol || m.x === mcol + 1) m.head = 'DUCK';
      else if (m.phase === 'proud') m.head = 'CHEER';
      else if (m === far && Math.abs(m.x - mcol) >= 6 && (T % 7) > 4.6 && (T % 7) < 6) m.head = 'TAUNT';
      else if (((T + m.i * 0.77) % (3.1 + m.i * 0.6)) < 0.2) m.head = 'BLINK';
      else m.head = mcol < m.x ? 'L' : 'R';
    }

    // ---- compose cells
    const grid = [Array(16).fill(0x20), Array(16).fill(GROUND)];
    const tiles = [];                          // [col,row,tile,priority,fallbacks]
    for (const m of moles) tiles.push([m.x, 1, signTile(m.d, m.k), 0]);

    const [mL, mR] = malletTiles(my);
    const malletVisible = my > -5;
    const mcells = malletVisible ? [[mcol, mL], [mcol + 1, mR]].filter(([c, t]) => c < 16 && t.some((b) => b)) : [];
    for (const [c, t] of mcells) {
      const mole = moles.find((m) => m.x === c);
      const under = mole && mole.head ? bits(HEAD[mole.head]) : Array(8).fill(0);
      tiles.push([c, 0, over(t, under), 1]);
    }
    const covered = (c) => mcells.some(([x]) => x === c);

    // The spare burrow: a little one peeks out now and then, and dives when
    // the mallet comes near, or comes out to jeer on the hour.
    grid[1][BURROW] = OMEGA;
    const near = Math.abs(mcol - BURROW) <= 1 || Math.abs(mcol + 1 - BURROW) <= 0;
    const peekCycle = (T % 11) > 6.5;
    if ((taunting || (peekCycle && !near)) && !anyHit) {
      tiles.push([BURROW, 1, (T % 2.3) < 0.2 ? BABY_BLINK : BABY, 4]);
    }
    for (const m of moles) {
      if (!m.head || covered(m.x)) continue;
      tiles.push([m.x, 0, HEAD[m.head], m.head.startsWith('HELM') ? 2 : 3, m.head]);
    }

    // stars over a sinking sign; sparks at the hit; CLANG at the hour
    for (const m of moles) {
      if (m.stars >= 0 && !covered(m.x)) grid[0][m.x] = STAR[Math.floor(m.stars / 0.2) % 4];
      if (m.phase === 'hit') for (const c of [m.x - 1, m.x + 1]) if (!covered(c)) grid[0][c] = 0x2a;
    }
    if (clangU != null && clangU >= 0 && clangU < 1.0) {
      const x = COLS[1];
      if (clangU < 0.4) for (const c of [x - 1, x + 1]) grid[0][c] = STAR[Math.floor(clangU / 0.2) % 2];
      [...'CLANG'].forEach((ch, j) => { grid[0][6 + j] = ch.charCodeAt(0); });
    }
    if (mode === 'dizzy') {
      const u = clangU - 0.9;
      grid[0][mcol - 1] = STAR[Math.floor(u / 0.2) % 4];
    }

    // ---- allocate: signs, mallet, helmet, then heads (coerced if full)
    const alloc = new TileAllocator(lcd, 0);
    tiles.sort((p, q) => p[3] - q[3]);
    for (const [col, row, tile, , pose] of tiles) {
      let code = alloc.add(tile);
      if (code == null && pose) {
        for (const alt of ['L', 'R', 'C', 'BLINK', 'DUCK', 'TAUNT', 'CHEER']) {
          code = alloc.index.get(HEAD[alt].join('/'));
          if (code != null) break;
        }
      }
      grid[row][col] = code ?? (row === 1 && col === BURROW ? OMEGA : 0x20);
    }
    alloc.flush();
    grid.forEach((codes, row) => { lcd.setCursor(0, row); codes.forEach((c) => lcd.data(c)); });
  },
};
