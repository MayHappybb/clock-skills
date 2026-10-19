// Robovac -- the time is cereal, and the robot vacuum is losing.
//
// A toddler sits in a high chair at the left of the glass, two cells tall
// (head and arms over the tray, then kicking legs and the chair's legs). The
// hour is two piles of cereal on the high-chair tray (top row); the minutes
// are two piles on the floor right under it, where food really goes. The rest
// of the floor belongs to an eight-dot robot vacuum, side brush flicking and
// LED blinking, with its charging dock (ROM) against the right wall.
//
// All minute the robot roams: it hunts the stray loops that bounced off the
// last spill, noses the minute pile and backs off, docks for a short charge
// (LED racing), spins on the spot, turns round end-on. Near the end of the
// minute it noses into the pile that is about to change and inhales it: the
// pile crumbles into the intake from the robot's side, dot by dot. It backs
// out, and at :00 exactly the toddler tips another spoonful off the tray: the
// new digit rains down on the spot it just cleaned. A '!' pops up over the
// robot, it turns to stare at the mess, turns back and drives off. The
// toddler giggles and kicks.
//
// The hour: in the :59 minute the robot clears both minute piles; then the
// toddler looks you in the eye and shoves the whole hour off the end of the
// tray, crumbling as it goes and pouring onto the floor as a mess. At :00 the
// bowl is upended (the new hour and minutes pour down together) and thrown
// straight up off the glass. It comes down upside down on the robot, which
// spends the next forty seconds driving blind with a bowl on its head,
// ramming the chair and bouncing off its own dock, hoovering up the mess,
// until a last bump pops the bowl off.
//
// The old digit is only ever eaten and the new one only lands at :00, so the
// glass never shows a wrong time. 24-hour clock.
//
// Tiles: piles first (four at most, identical piles share), then the robot's
// cells (two at most: it moves dot by dot but is never longer than eight
// dots), the toddler's two cells. The dock, strays, falling crumbs and the
// '!' are ROM. Everything is derived from the clock.

import { TileAllocator, noise } from '../js/kit.js';

// ------------------------------------------------------------------ glyphs

const DIG = {
  0: ['.###.', '##.##', '##.##', '##.##', '##.##', '##.##', '.###.'],
  1: ['..##.', '.###.', '..##.', '..##.', '..##.', '..##.', '.####'],
  2: ['.###.', '##.##', '...##', '..##.', '.##..', '##...', '#####'],
  3: ['####.', '...##', '..##.', '...##', '...##', '##.##', '.###.'],
  4: ['...##', '..###', '.#.##', '#..##', '#####', '...##', '...##'],
  5: ['#####', '##...', '####.', '...##', '...##', '##.##', '.###.'],
  6: ['..##.', '.##..', '##...', '####.', '##.##', '##.##', '.###.'],
  7: ['#####', '...##', '..##.', '..##.', '.##..', '.##..', '.##..'],
  8: ['.###.', '##.##', '##.##', '.###.', '##.##', '##.##', '.###.'],
  9: ['.###.', '##.##', '##.##', '.####', '...##', '..##.', '.##..'],
};
const bits = (rows) => rows.map((l) => [...l].reduce((b, ch) => (b << 1) | (ch === '#' ? 1 : 0), 0));
const bits8 = (o) => Object.fromEntries(Object.entries(o).map(([k, r]) => [k, bits(r)]));
const str = (b) => { let s = ''; for (let i = 0; i < 5; i++) s += (b >> (4 - i)) & 1 ? '#' : '.'; return s; };
const DBITS = Object.fromEntries(Object.entries(DIG).map(([d, r]) => [d, bits(r)]));
const TRAY = 0x1f;
// For each digit, the dots it has that a near look-alike (within 4 dots) lacks;
// floor-pile rows (shifted down one).
const KEY = Object.fromEntries(Object.keys(DBITS).map((d) => {
  const a = [0, ...DBITS[d]];
  const out = Array(8).fill(0);
  for (const e of Object.keys(DBITS)) {
    if (e === d) continue;
    const b = [0, ...DBITS[e]];
    let h = 0; a.forEach((v, r) => { let x = v ^ b[r]; while (x) { h += x & 1; x >>= 1; } });
    if (h <= 4) a.forEach((v, r) => { out[r] |= v & ~b[r]; });
  }
  return [d, out];
}));

// The toddler, facing you over the tray: round head, two eyes, arms. Row 7
// is the tray, continuous with the hour's. The chair's legs below are ROM.
const KID = bits8({
  idle:   ['.#.#.', '..#..', '.###.', '##.##', '.###.', '..#..', '#####', '#####'],
  blink:  ['.#.#.', '..#..', '.###.', '#####', '.###.', '..#..', '#####', '#####'],
  look:   ['.#.#.', '..#..', '.###.', '#.#.#', '.###.', '..#..', '#####', '#####'],
  down:   ['.....', '.#.#.', '..#..', '..###', '.##.#', '..###', '#####', '#####'],
  spoon:  ['.#.##', '..#.#', '.###.', '##.##', '.####', '..#..', '####.', '#####'],
  tip:    ['.#.#.', '..#..', '.###.', '#.#.#', '.###.', '..###', '###.#', '#####'],
  gig1:   ['#.#.#', '#.#.#', '.###.', '#...#', '.###.', '..#..', '.###.', '#####'],
  gig2:   ['.....', '.#.#.', '.###.', '#...#', '.###.', '#.#.#', '.###.', '#####'],
  push:   ['.....', '.#.#.', '..#..', '.###.', '##.##', '.####', '..###', '#####'],
  bowlup: ['#####', '.###.', '#.#.#', '.###.', '#.#.#', '..#..', '.###.', '#####'],
  pour:   ['..###', '.####', '.#.#.', '.###.', '#.#.#', '.###.', '#####', '#####'],
  arms:   ['#...#', '#.#.#', '.#.#.', '.###.', '#...#', '.###.', '#####', '#####'],
});

// The robot, standing on the floor, drawn facing right. '#' lit, '.' clear
// (it is opaque, so a pile behind it is hidden), ' ' see-through, 'L' the
// LED (blinks), 'B' the side brush (flicks).
// Side on, facing right; eight dots long at most, so it never covers more
// than two cells. A low disc: the LED on the cap, a dark eye that blinks,
// the bumper standing off the front, wheels, and the side brush flicking at
// the front corner. ' ' see-through, '.' opaque dark, 'L' LED, 'E' eye (dark,
// lit when it blinks), 'B'/'b' the two brush positions.
const BOT = {
  side: ['  L     ', ' #####.#', '####E#.#', '######.#', '.##..#bB'],
  end:  ['   L    ', ' ###### ', ' #E##E# ', ' ###### ', 'B##..##B'],
  hat:  ['  ##### ', ' #######', '........', ' #####.#', '####E#.#', '######.#', '.##..#bB'],
  hatE: ['  ##### ', ' #######', '........', ' ###### ', ' #E##E# ', ' ###### ', 'B##..##B'],
};
// The charging dock against the right wall, facing the room: a tower with a
// lit status dot (it blinks fast while charging) and the charging plate.
const DOCK = bits8({
  on:  ['.....', '..###', '.####', '.#.##', '.####', '..###', '..###', '#####'],
  off: ['.....', '..###', '.####', '.####', '.####', '..###', '..###', '#####'],
});
const BOWL = [[1, 0], [2, 0], [3, 0], [0, 1], [1, 1], [2, 1], [3, 1], [4, 1]];   // in flight, one cell

// ------------------------------------------------------------------ layout

const KIDC = 0, HC = [1, 2], MC = [5, 6], LEG_F = 3, DOCKC = 15;
const CHAIR = 0xca;               // the high chair's splayed legs, ROM
const LOOP = 0xa1;                // a cereal loop on the floor
const CRUMB = [0xdf, 0xa5, 0x2e, 0xa1];
const STEP = 0.2;                 // one dot of driving
const EAT_D = 2.4;                // seconds to inhale one pile
// The robot's left edge at: its nose against the minute piles, waiting while
// the new spill lands, parked for the bowl (cell-aligned, so the falling bowl
// is one tile), the far end of its roam, and nose on the dock.
const X_NOSE = 6 * MC[1] + 5, X_HOME = 44, X_PARK = 48, X_DOCK = 82;
const ROAM = [X_HOME, 76];
const RAIN = 0.85;

const rnd = (a, b) => noise(a * 7.13 + b * 0.917, 23);
const diff = (a, b) => [0, 1, 2, 3].filter((i) => a[i] !== b[i]);

// ------------------------------------------------------------------ the robot's minute

class Path {
  constructor(x, face) { this.s = []; this.t = 0; this.x = x; this.face = face; this.bumps = []; }
  seg(dur, x0, x1, face, pose) { this.s.push({ t0: this.t, t1: this.t + dur, x0, x1, face, pose }); this.t += dur; }
  hold(dur, pose = 'side') { if (dur > 0) this.seg(dur, this.x, this.x, this.face, pose); return this; }
  turn() { this.seg(0.3, this.x, this.x, this.face, 'end'); this.face = -this.face; return this; }
  drive(x, step = STEP) {
    if (x === this.x) return this;
    const dir = Math.sign(x - this.x);
    if (dir !== this.face) this.turn();
    this.seg(Math.abs(x - this.x) * step, this.x, x, dir, 'side');
    this.x = x;
    return this;
  }
  bump(what) {               // nudge, recoil
    this.bumps.push({ t: this.t, what });
    this.hold(0.25);
    const back = this.x - this.face * 2;
    this.seg(0.3, this.x, back, this.face, 'side'); this.x = back;
    return this.hold(0.35);
  }
  dock(blind) {               // on the dock: a short charge, LED racing; blind, it bounces off it
    if (blind) return this.bump('dock');
    this.bumps.push({ t: this.t, what: 'charge' });
    return this.hold(2.2, 'charge');
  }
  at(T) {
    for (const g of this.s) if (T >= g.t0 && T < g.t1) {
      const n = Math.abs(g.x1 - g.x0);
      const k = n ? Math.min(n, Math.floor((T - g.t0) / ((g.t1 - g.t0) / n))) : 0;
      return { x: g.x0 + Math.sign(g.x1 - g.x0) * k, face: g.face, pose: g.pose };
    }
    return { x: this.x, face: this.face, pose: 'side' };
  }
  /** First time at or after `from` that the robot's body covers glass column gx. */
  reach(gx, from) {
    for (const g of this.s) {
      if (g.t1 < from) continue;
      const lo = Math.min(g.x0, g.x1), hi = Math.max(g.x0, g.x1) + 6;
      if (lo <= gx && hi >= gx) {
        if (g.x0 === g.x1) return Math.max(g.t0, from);
        const k = g.x1 > g.x0 ? Math.max(0, gx - 7 - g.x0) : Math.max(0, g.x0 - gx);
        return Math.max(from, g.t0 + k * ((g.t1 - g.t0) / Math.abs(g.x1 - g.x0)));
      }
    }
    return 99;
  }
}

/** The robot's whole minute, and when it starts inhaling each pile. */
function robotMinute(m, eatM, show, back, strays) {
  const seed = m * 5 + 1;
  const p = new Path(back ? X_PARK : X_HOME, -1);
  const piles = [];                                   // ones first (nearest), then tens
  if (eatM.includes(3)) piles.push(MC[1]);
  if (eatM.includes(2)) piles.push(MC[0]);
  const xOut = show ? X_PARK : X_HOME;
  const lastX = piles.length ? 6 * piles[piles.length - 1] + 3 : X_NOSE;
  const exitT = 0.3 + Math.abs(xOut - lastX) * STEP;
  const eatT = piles.length * (EAT_D + 0.3) + (piles.length > 1 ? 6 * STEP : 0);
  const E0 = (show ? 59.5 : 59.85) - exitT - eatT;
  const TA = E0 - 1.4;
  const rx = (k) => ROAM[0] + Math.floor(rnd(seed, k) * (ROAM[1] - ROAM[0] + 1));

  if (back) {
    // the bowl lands at 2.2; dazed; then driving blind
    p.hold(3.2, 'side');
    let k = 0;
    while (p.t < 36) {
      const r = rnd(seed, k++);
      const tgt = r < 0.3 ? X_NOSE : r < 0.55 ? X_DOCK : rx(50 + k);
      p.drive(tgt, STEP * (0.9 + rnd(seed, 90 + k) * 0.5));
      if (tgt === X_NOSE) p.bump('pile'); else if (tgt === X_DOCK) p.dock(back);
      else p.hold(0.4 + rnd(seed, 70 + k));
      if (rnd(seed, 30 + k) < 0.4) p.turn().hold(0.3).turn();
    }
    p.drive(X_NOSE);
    p.popT = p.t;
    p.bump('pop');                                    // the bowl comes off
  } else {
    // flinch at the new spill, turn away, turn back and stare at it
    p.hold(0.9);
    p.turn().hold(0.9).turn().hold(0.4);
  }
  // roam: strays first, then wander, nose things, charge
  const stop = TA - 1.0;
  const home = (x) => Math.abs(x - X_NOSE) * STEP;
  for (const st of strays) {
    const tx = Math.min(ROAM[1], Math.max(ROAM[0], 6 * st.col - 3));
    if (p.t + (Math.abs(tx - p.x) * STEP) + home(tx) + 1 > stop) break;
    p.drive(tx);
    st.eaten = p.reach(6 * st.col + 2, 0);
    p.hold(0.6, 'spin');
  }
  let k = 0;
  for (;;) {
    const r = rnd(seed, 200 + k++);
    const tgt = r < 0.22 ? X_NOSE : r < 0.42 ? X_DOCK : rx(300 + k);
    if (p.t + Math.abs(tgt - p.x) * STEP + home(tgt) + 3 > stop) break;
    p.drive(tgt);
    if (tgt === X_NOSE) p.bump('pile');
    else if (tgt === X_DOCK) p.dock(back);
    else if (rnd(seed, 400 + k) < 0.35) p.hold(0.6, 'spin');
    else p.hold(0.3 + rnd(seed, 500 + k) * 1.2);
  }
  if (!piles.length) { p.drive(X_HOME).hold(Math.max(0, 60.5 - p.t)); return { p, eat: [] }; }
  p.drive(X_NOSE + 2).hold(Math.max(0, TA - p.t));
  p.drive(X_NOSE).hold(Math.max(0.3, E0 - p.t));     // nose up to the pile, aim
  // inhale: the front over the pile's edge, scrubbing back and forth
  const eat = [];
  piles.forEach((c) => {
    const x0 = 6 * c + 3;
    p.drive(x0);
    eat.push({ cell: c, t: p.t });
    const t1 = p.t + EAT_D;
    let j = 0;
    while (p.t < t1 - 0.01) {
      const x = x0 + (j++ % 2 ? 0 : 2);
      p.seg(Math.min(0.3, t1 - p.t), p.x, x, -1, 'side'); p.x = x;
    }
    p.x = x0; p.hold(0.3, 'spin');
  });
  p.drive(xOut);
  p.hold(Math.max(0.05, 60.5 - p.t));
  return { p, eat };
}

// ------------------------------------------------------------------ piles

/**
 * A pile being inhaled from its right side. Every dot goes at its own moment:
 * mostly random, a little earlier the nearer it is to the intake, so the pile
 * dissolves into crumbs rather than being wiped. (A column wipe turned a 9
 * into a 'G' and then a 'b'.)
 */
function eatenPile(rowsB, cell, eat, u, d) {
  const e = eat.find((q) => q.cell === cell);
  if (!e || u < e.t) return rowsB;
  const keep = KEY[d];
  return rowsB.map((b, r) => {
    let o = b;
    for (let i = 0; i < 5; i++) {
      const near = (i / 4) * 0.6 + (r / 7) * 0.4;     // right and low go first
      // the dots that tell this digit from its look-alikes go last, so a half-eaten
      // 8 never passes for a 0
      const key = keep && (keep[r] & (0x10 >> i)) ? 0.45 : 0;
      const at = e.t + EAT_D * (0.6 * (0.7 * rnd(cell * 40 + r * 5 + i, 91) + 0.3 * (1 - near)) + key * 0.78);
      if (u >= at) o &= ~(0x10 >> i);
    }
    return o;
  });
}

/** A pile raining in: dots fall from above, bottom rows first. Depends only on the digit and v. */
function rainPile(rowsB, seed, v) {
  const out = Array(8).fill(0);
  for (let r = 0; r < 8; r++) for (let i = 0; i < 5; i++) {
    if (!(rowsB[r] & (0x10 >> i))) continue;
    const land = 0.07 * (7 - r) + rnd(seed * 11 + i, r) * 0.3;
    const y = r - Math.ceil(Math.max(0, land - v) / 0.05);
    if (y >= 0) out[y] |= 0x10 >> i;
  }
  return out;
}

// ------------------------------------------------------------------ the face

export default {
  name: 'Robovac',
  blurb: 'The time is cereal under a high chair: a robot vacuum inhales the old minute, and at :00 the toddler tips the new one onto the spot it just cleaned; on the hour the whole bowl lands on its head.',
  bus: 'i2c100',
  panel: 'green',
  fps: 10,

  frame(lcd, api, { fields, date, kit }) {
    const midnight = new Date(date); midnight.setHours(0, 0, 0, 0);
    const dayStart = midnight.getTime();
    const T = (date.getTime() - dayStart) / 1000;
    const B = T - (fields.s + fields.ms / 1000);
    const u = T - B;
    const m = Math.round(B / 60) + 1440 * (Math.floor(dayStart / 86400000) % 7);
    const val = (b) => { const f = kit.clockFields(new Date(dayStart + b * 1000)); return { v: f.hh + f.mm, f }; };
    const now = val(B), prev = val(B - 60), next = val(B + 60);
    const landed = diff(prev.v, now.v);
    const eatIdx = diff(now.v, next.v);
    const show = next.f.mm === '00';
    const back = now.f.mm === '00';
    const digit = now.v.split('');

    // strays: a loop or two bounced out of the last spill
    const strays = [];
    if (!back) {
      const n = 1 + (landed.includes(2) ? 1 : 0);
      for (let k = 0; k < n; k++) strays.push({ col: 8 + k * 3 + Math.floor(rnd(m, 100 + k) * 3), eaten: 99 });
    }
    const { p: bot, eat } = robotMinute(m, eatIdx.filter((i) => i >= 2), show, back, strays);
    const R = bot.at(u);

    // ---- ROM grid, and cells that are tiles
    const grid = [Array(16).fill(0x20), Array(16).fill(0x20)];
    const tiles = [Array(16).fill(null), Array(16).fill(null)];

    grid[1][KIDC] = CHAIR;
    const pile = (i) => {
      const d = digit[i], isH = i < 2;
      let rows = isH ? [...DBITS[d], 0] : [0, ...DBITS[d]];
      if (landed.includes(i) && u < RAIN) rows = rainPile(rows, +d + (isH ? 0 : 10), u);
      if (!isH && eatIdx.includes(i)) rows = eatenPile(rows, MC[i - 2], eat, u, d);
      return rows;
    };
    // the hour on the tray, or being swept off the end of it
    const pushK = show && u >= 56.5 ? Math.floor((u - 56.5) / 0.15) + 1 : 0;
    let fallen = 0;
    if (pushK) {
      const cells = [Array(8).fill(0), Array(8).fill(0)];
      for (const i of [0, 1]) DBITS[digit[i]].forEach((b, r0) => {
        for (let j = 0; j < 5; j++) if (b & (0x10 >> j)) {
          const gx = 6 * HC[i] + j + pushK;
          if (gx > 16) { fallen++; continue; }
          // the piles crumble as they are shoved: dots tumble down the further they go
          const r = Math.min(6, r0 + Math.floor(pushK * rnd(i * 7 + j, r0) / 2.5));
          const dx = gx % 6;
          if (dx < 5) cells[Math.floor(gx / 6) - 1][r] |= 0x10 >> dx;
        }
      });
      for (const i of [0, 1]) if (cells[i].some((b) => b)) tiles[0][HC[i]] = [...cells[i].slice(0, 7), TRAY];
      for (const i of [0, 1]) if (!tiles[0][HC[i]]) tiles[0][HC[i]] = [0, 0, 0, 0, 0, 0, 0, TRAY];
      if (fallen && pushK < 14) grid[0][LEG_F] = CRUMB[pushK % 4];
    } else {
      for (const i of [0, 1]) { const r = pile(i); r[7] = TRAY; tiles[0][HC[i]] = r; }
    }
    // the minutes on the floor
    for (const i of [2, 3]) {
      const r = pile(i);
      if (r.some((b) => b)) tiles[1][MC[i - 2]] = r;
    }
    // strays, until the robot gets them
    for (const s of strays) if (u >= 0.6 && u < s.eaten + 0.1) grid[1][s.col] = LOOP;
    // the swept hour as a mess on the floor; hoovered up blind in the next minute
    if ((show && u >= 57) || back) {
      const n = show ? Math.min(3, Math.floor(fallen / 8)) : 3;
      for (let k = 0; k < n; k++) {
        const col = 8 + k * 2;
        const gone = back ? bot.reach(6 * col + 2, 3.2) + 0.2 : 99;
        if (u < gone) grid[1][col] = [LOOP, 0x2e, 0xa5][k];
      }
    }

    // ---- the robot, inked dot by dot
    const hatOn = back && u >= 2.2 && u < (bot.popT ?? 99) + 0.25;
    const spinning = R.pose === 'spin' && Math.floor(u / 0.25) % 2;
    const art = R.pose === 'end' || spinning ? (hatOn ? BOT.hatE : BOT.end) : (hatOn ? BOT.hat : BOT.side);
    const led = R.pose === 'charge' ? Math.floor(T / 0.2) % 2 === 0 : Math.floor(T / 0.5) % 2 === 0 || (!back && u < 0.9);
    const brush = Math.floor(T / 0.2) % 2 === 0;
    const blink = (T + rnd(m, 9) * 5) % 5 < 0.2;
    const ink = new Map();
    const put = (gx, gy, on) => {
      const c = Math.floor(gx / 6), dx = gx - 6 * c;
      if (dx > 4 || c < 0 || c > 15 || gy < 0 || gy > 15) return;
      const key = (gy >> 3) * 16 + c;
      const e = ink.get(key) ?? { set: Array(8).fill(0), clr: Array(8).fill(0) };
      if (on) e.set[gy & 7] |= 0x10 >> dx; else e.clr[gy & 7] |= 0x10 >> dx;
      ink.set(key, e);
    };
    const top = 16 - art.length;
    art.forEach((line, r) => {
      for (let j = 0; j < 8; j++) {
        const ch = R.face < 0 ? line[7 - j] : line[j];
        if (ch === ' ') continue;
        const on = ch === '#' || (ch === 'L' && led) || (ch === 'E' && blink) || (ch === 'B' && brush) || (ch === 'b' && !brush);
        put(R.x + j, top + r, on);
      }
    });
    // the bowl: off the top of the glass, then down onto the robot
    if (back && u >= 1.5 && u < 2.2) {
      const gy = -2 + Math.floor((u - 1.5) / 0.1) * 2;
      for (const [dx, dy] of BOWL) put(X_PARK + dx, gy + dy, true);
    }
    // ...and popping off at the last bump, back up out of the glass
    if (back && bot.popT && u >= bot.popT + 0.25 && u < bot.popT + 1.0) {
      const gy = 9 - Math.floor((u - bot.popT - 0.25) / 0.15) * 3;
      // in the air it is one cell, snapped to the grid, so it costs one slot
      const bx = gy >= 8 ? R.x + 1 : 6 * Math.floor((R.x + 3) / 6);
      for (const [dx, dy] of BOWL) put(bx + dx, gy + dy, true);
    }

    // ---- the toddler
    const bumped = (what, d) => bot.bumps.find((b) => what.includes(b.what) && u >= b.t && u < b.t + d);
    const legHit = bumped(['pile', 'pop'], 0.6);
    let kid;
    if (show && u >= 55.3) kid = u < 56.5 ? 'look' : u < 58.6 ? 'push' : u < 59.2 ? 'look' : 'bowlup';
    else if (back && u < 6) kid = u < 1.0 ? 'pour' : u < 1.5 ? 'arms' : u < 2.3 ? 'look' : Math.floor(u / 0.3) % 2 ? 'gig1' : 'gig2';
    else if (!show && u >= 58.4) kid = u < 59.0 ? 'look' : 'spoon';
    else if (u < 0.5) kid = 'tip';
    else if (u < 3) kid = Math.floor(u / 0.3) % 2 ? 'gig1' : 'gig2';
    else if (legHit) kid = Math.floor(u / 0.15) % 2 ? 'gig1' : 'down';
    else if (back && bot.popT && u >= bot.popT && u < bot.popT + 2) kid = 'arms';
    else if (R.x < 47) kid = 'down';
    else {
      const ph = (T + rnd(m, 7) * 9) % 9;
      kid = ph < 0.2 ? 'blink' : ph > 6 && ph < 7.2 ? (Math.floor(ph / 0.3) % 2 ? 'spoon' : 'idle') : 'idle';
    }
    let kidRows = KID[kid];
    const charging = R.pose === 'charge';
    const dockRows = DOCK[(charging ? Math.floor(T / 0.2) : Math.floor(T / 1.0)) % 2 ? 'off' : 'on'];
    if (legHit && Math.floor(u / 0.15) % 2) kidRows = kidRows.map((b, r) => (r < 6 ? (b >> 1) | (b & 0x10) : b));

    // the spoonful in flight, tray to floor, just before :00
    if (!show && eatIdx.some((i) => i >= 2) && u >= 59.1) grid[0][3 + Math.min(2, Math.floor((u - 59.1) / 0.3))] = CRUMB[Math.floor(u / 0.3) % 4];
    // the robot sees the new spill land right where it cleaned
    if (!back && u >= 0.15 && u < 1.0) { const c = Math.floor((R.x + 4) / 6); if (c >= 3) grid[0][c] = 0x21; }

    // ---- tiles: piles, the robot's cells, the toddler's two cells
    const alloc = new TileAllocator(lcd, 0);
    const out = [grid[0].slice(), grid[1].slice()];
    for (let r = 0; r < 2; r++) for (let c = 0; c < 16; c++) {
      if (tiles[r][c] && !ink.has(r * 16 + c)) out[r][c] = alloc.add(tiles[r][c].map(str)) ?? 0x20;
    }
    for (const [key, e] of [...ink.entries()].sort((a, b) => a[0] - b[0])) {
      const r = key >> 4, c = key & 15;
      const under = tiles[r][c] ?? lcd.glyph(grid[r][c]);
      const tile = under.map((b, y) => ((b & ~e.clr[y]) | e.set[y]) & 0x1f);
      const code = alloc.add(tile.map(str));
      if (code != null) out[r][c] = code;
      else if (tiles[r][c]) out[r][c] = alloc.add(tiles[r][c].map(str)) ?? 0x20;
    }
    { const code = alloc.add(kidRows.map(str)); if (code != null) out[0][KIDC] = code; }
    { const code = alloc.add(dockRows.map(str)); out[1][DOCKC] = code ?? 0xa3; }
    alloc.flush();
    out.forEach((codes, row) => { lcd.setCursor(0, row); codes.forEach((c) => lcd.data(c)); });
  },
};
