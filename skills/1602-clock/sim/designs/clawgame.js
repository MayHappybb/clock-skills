// Claw Machine — the time is the prizes in a crane game.
//
// The glass is the inside of the cabinet. The claw hangs from the ceiling
// (the top edge of the glass) and creeps about the top row. The prizes lie on
// the floor of the bottom row: the hour is two plush animals, bold numerals
// with ears that twitch when the claw comes near (the prizes nobody ever
// wins); the minutes are two plain beanbag numerals (the prizes the claw does
// win). The chute is a lipped grille in the far right corner.
//
// Every minute the claw lines up over the minute that is about to change,
// wiggles to aim while the plush trembles, drops, closes and reels it up just
// before :00, and carries it off to the chute; the new one is tossed in from
// above the moment the minute turns, while the old one is still on its way.
// Now and then the famously weak grip slips: the plush rises, slides out and
// flops back into its place, and the claw has to try again. Now and then the
// prize clings to the open claw over the chute and has to be shaken off. When
// the tens of minutes change too, the claw grabs both little ones at once.
//
// On the hour it goes for an hour plush: the lights start chasing, the plush
// twitches its ears, and the claw strains at it for seconds, the plush
// coming up a dot and sagging back, until it tears free at the last moment
// and dashes it to the chute. JACKPOT: the lights flash, the floor drops away
// under the rest of the pile, and a whole new time rains in.
//
// Never a wrong time: an old numeral is in its place, in the claw or down the
// chute; a new one only appears at or after the turn. No slot is empty for
// more than about 3 s.
//
// Tiles: four one-cell numerals and the chute at rest, the claw 2 more. A
// numeral in the claw replaces its own resting tile, new prizes fall one cell
// at a time, and a pair in the claw moves a cell at a time and is dropped one
// by one, so every frame stays within 8 (checked every 0.1 s over the
// turns of a whole day).

import { TileAllocator, clockFields, noise, smoothNoise, clamp, ease } from '../js/kit.js';

const FPS = 10;
const REST_Y = 9;          // top dot row of a resting numeral (rows 9-15, on the floor)
const TIP = 4;             // claw tips are this many rows below its housing
const HY_IDLE = 2;         // claw housing row while it roams
const HY_GRAB = REST_Y - TIP;  // housing row when its tips touch a resting numeral
const HY_UP = 1 - TIP;     // housing reeled into the ceiling, a numeral hanging at Y 1-7
const G = 90;              // gravity, dots / s^2

// ------------------------------------------------------------------ glyphs
// Plush numerals: bold 5x7, two-dot walls, one cell each. The hour plushies
// are the same numerals with ears (a dot over each top corner), so they read
// as stuffed animals and the minutes as plain beanbags.
const SMALL = {
  0: ['.###.', '##.##', '##.##', '##.##', '##.##', '##.##', '.###.'],
  1: ['.##..', '###..', '.##..', '.##..', '.##..', '.##..', '####.'],
  2: ['.###.', '##.##', '...##', '..##.', '.##..', '##...', '#####'],
  3: ['####.', '...##', '...##', '.###.', '...##', '...##', '####.'],
  4: ['...##', '..###', '.#.##', '#..##', '#####', '...##', '...##'],
  5: ['#####', '##...', '####.', '...##', '...##', '##.##', '.###.'],
  6: ['.###.', '##...', '####.', '##.##', '##.##', '##.##', '.###.'],
  7: ['#####', '...##', '...##', '..##.', '.##..', '.##..', '.##..'],
  8: ['.###.', '##.##', '##.##', '.###.', '##.##', '##.##', '.###.'],
  9: ['.###.', '##.##', '##.##', '.####', '...##', '...##', '.###.'],
};

// Where each numeral lives: H1 H2 (big), M1 M2 (little). X is a logical dot
// column (5 per cell, the gap between cells not counted).
const SLOT_X = [15, 20, 35, 40];   // cells 3 4 | 7 8
const BIGSLOT = [true, true, false, false];
const CHUTE = 15;          // bottom-row cell of the prize chute
// The chute: a lip, and a grille you can see down into.
const CHUTE_TILE = ['#####', '.#.#.', '#.#.#', '.#.#.', '#.#.#', '.#.#.', '#.#.#', '.#.#.'];

// Grab points: claw cable column for each kind of lift, and where it drops.
const GRAB = {
  single: { cx: 42, drop: 77, dx: [-2] },        // M2, by its middle
  double: { cx: 39, drop: 74, dx: [-4, 1] },     // M1 and M2 together, one in each hand
  big:    { cx: 22, drop: 77, dx: [-2] },        // H2, by its ears
};

// ------------------------------------------------------------------ canvas

class Canvas {
  constructor() { this.bits = new Map(); this.rank = new Map(); this.rom = new Map(); }
  dot(X, Y, rank = 1) {
    if (X < 0 || X > 79 || Y < 0 || Y > 15) return;
    const key = (Y >> 3) * 16 + Math.floor(X / 5);
    let b = this.bits.get(key);
    if (!b) { b = [0, 0, 0, 0, 0, 0, 0, 0]; this.bits.set(key, b); }
    b[Y & 7] |= 0x10 >> (X % 5);
    this.rank.set(key, Math.min(this.rank.get(key) ?? 9, rank));
  }
  glyph(rows, X0, Y0, rank) {
    rows.forEach((r, y) => { for (let i = 0; i < r.length; i++) if (r[i] === '#') this.dot(X0 + i, Y0 + y, rank); });
  }
  draw(lcd) {
    const alloc = new TileAllocator(lcd, 0);
    const out = [Array(16).fill(0x20), Array(16).fill(0x20)];
    for (const [key, code] of this.rom) out[key >> 4][key & 15] = code;
    const keys = [...this.bits.keys()].sort((a, b) => this.rank.get(a) - this.rank.get(b) || a - b);
    for (const key of keys) {
      const code = alloc.add(this.bits.get(key));
      out[key >> 4][key & 15] = code ?? out[key >> 4][key & 15];
    }
    alloc.flush();
    out.forEach((codes, row) => { lcd.setCursor(0, row); codes.forEach((c) => lcd.data(c)); });
    return alloc;
  }
}

// ------------------------------------------------------------------ motion helpers

/** Piecewise track: keys [[t, v, easeName?], ...]; easing applies to the segment ending at that key. */
function track(t, keys) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let k = 1; k < keys.length; k++) {
    const [t1, v1, e = 'inOutQuad'] = keys[k];
    const [t0, v0] = keys[k - 1];
    if (t <= t1) return v0 + (v1 - v0) * ease[e](t1 > t0 ? (t - t0) / (t1 - t0) : 1);
  }
  return keys[keys.length - 1][1];
}

// The claw's idle path: waypoints every 5 s, a slow creep then a pause.
const wp = (k) => Math.round(4 + 72 * smoothNoise(k * 0.5, 5));
function idleX(T) {
  const k = Math.floor(T / 5), u = T / 5 - k;
  return wp(k) + (wp(k + 1) - wp(k)) * ease.inOutQuad(clamp(u / 0.65, 0, 1));
}

// Between turns the claw fidgets: every few seconds, once it has stopped, it
// dips at whatever is under it, or snaps its prongs.
function idleClaw(T) {
  const k = Math.floor(T / 5), u = T - k * 5;
  const x = idleX(T);
  let hy = HY_IDLE, open = 1;
  const r = noise(k, 31);
  if (r < 0.4 && u > 3.5) hy = HY_IDLE + [1, 1, 1, 0][Math.min(3, Math.floor((u - 3.5) / 0.35))];
  else if (r > 0.75 && u > 3.6 && u < 4.4) open = 0;
  return { x, hy, open, show: true, sway: true };
}

const digitsOf = (f) => [Math.floor(f.h / 10), f.h % 10, Math.floor(f.m / 10), f.m % 10];
const fall = (t) => 0.5 * G * t * t;

// ------------------------------------------------------------------ the scene

/**
 * Everything on the glass at one instant, from the clock alone:
 * { claw: {x, hy, open, show}, items: [{d, big, X, Y, eyes}], bulbs }
 */
function scene(date, f) {
  const sec = f.s + f.ms / 1000;
  const T = f.h * 3600 + f.m * 60 + sec;
  const cur = digitsOf(f);

  // the turn we are near: the coming one (second half of the minute) or the
  // one just past (first half)
  const pre = sec >= 30;
  const tau = pre ? sec - 60 : sec;
  const other = clockFields(new Date(date.getTime() + (pre ? 60000 : -60000)));
  const from = pre ? cur : digitsOf(other);
  const to = pre ? digitsOf(other) : cur;
  const Tturn = T - tau;
  const toMin = pre ? other.h * 60 + other.m : f.h * 60 + f.m;
  const kind = to[2] === 0 && to[3] === 0 ? 'hour' : from[2] !== to[2] ? 'double' : 'single';
  const fumble = kind !== 'hour' && noise(toMin * 0.618 + 3.3, 11) < 0.2;
  const cling = kind !== 'hour' && noise(toMin * 0.382 + 1.7, 13) < 0.22;

  const rest = (i, d) => ({ i, d, big: BIGSLOT[i], X: SLOT_X[i], Y: REST_Y, eyes: null });
  const out = { claw: null, items: [], bulbs: null, T };

  const start = kind === 'hour' ? -22 : fumble ? -22 : -9;
  const end = 6;
  if (tau < start || tau > end) {
    out.claw = idleClaw(T);
    out.items = cur.map((d, i) => rest(i, d));
    return out;
  }

  if (kind === 'hour') return hourTurn(out, tau, T, Tturn, from, to, rest);

  // ---------------------------------------------------- a minute: one or two little ones
  const g = GRAB[kind];
  const targets = kind === 'double' ? [2, 3] : [3];
  const dropT = cling ? 1.1 : 0.3;      // when the prize leaves the claw
  const back = dropT + (kind === 'double' ? 2.1 : 1.5);             // claw starts back to roaming

  // claw x
  const xk = [];
  if (fumble) {
    xk.push([-22, idleX(Tturn - 22)], [-19, g.cx], [-18.7, g.cx + 2], [-18.4, g.cx - 1], [-18.1, g.cx]);
    xk.push([-13.4, g.cx], [-13.1, g.cx - 1], [-12.8, g.cx + 1], [-12.5, g.cx - 1], [-12.2, g.cx]);
  } else {
    xk.push([-9, idleX(Tturn - 9)], [-7, g.cx]);
  }
  xk.push([-6.7, g.cx + 2], [-6.4, g.cx - 1], [-6.1, g.cx], [-1.4, g.cx], [0.2, g.drop, 'inOutCubic']);
  if (cling) xk.push([0.5, g.drop], [0.65, g.drop - 1], [0.8, g.drop + 1], [0.95, g.drop - 1], [1.1, g.drop]);
  xk.push([dropT + 0.2, g.drop]);
  // a pair: the right one drops in, then the claw shuffles a cell on for the other
  if (kind === 'double') xk.push([dropT + 0.5, g.drop + 5]);
  const lastDrop = kind === 'double' ? dropT + 0.7 : dropT;
  let x = track(tau, xk);
  // a pair is carried a cell at a time, so the two stay on two cells
  if (kind === 'double' && tau > -1.4 && tau < dropT) x = 5 * Math.round((x - 4) / 5) + 4;
  if (tau > back) x = x + (idleClaw(T).x - x) * ease.inOutQuad(clamp((tau - back) / 2.5, 0, 1));

  // claw height and grip
  const hk = [[-30, HY_IDLE]];
  const ok = [[-30, 1]];
  if (fumble) {
    hk.push([-18, HY_IDLE], [-16.8, HY_GRAB, 'linear'], [-16.3, HY_GRAB], [-15.0, HY_GRAB - 3, 'linear'],
      [-14.9, HY_GRAB - 4], [-14.2, HY_GRAB - 2], [-13.6, HY_IDLE]);
    ok.push([-16.8, 1], [-16.3, 0, 'linear'], [-15.05, 0], [-14.95, 1, 'linear']);
  }
  hk.push([-4.0, HY_IDLE], [-3.0, HY_GRAB, 'linear'], [-2.6, HY_GRAB], [-1.4, HY_UP, 'linear'],
    [lastDrop + 0.2, HY_UP], [lastDrop + 1.2, HY_IDLE, 'linear']);
  ok.push([-3.0, 1], [-2.6, 0, 'linear'], [lastDrop - 0.2, 0], [lastDrop, 1, 'linear']);
  const hy = Math.round(track(tau, hk));
  const open = track(tau, ok);
  out.claw = { x, hy, open, show: true, sway: tau > back || tau < -6.1 };

  // the numerals
  for (let i = 0; i < 4; i++) {
    if (!targets.includes(i)) { out.items.push(rest(i, tau < 0 ? from[i] : to[i])); continue; }
    const k = targets.indexOf(i);
    if (tau < -2.6) {
      // resting old numeral; in a fumble it rides up and slips back
      const it = rest(i, from[i]);
      if (fumble && tau >= -16.3 && tau < -15.0) it.Y = Math.round(track(tau, [[-16.3, REST_Y], [-15.0, REST_Y - 3, 'linear']]));
      if (fumble && tau >= -15.0 && tau < -14.8) it.Y = Math.min(REST_Y, Math.round(REST_Y - 3 + fall(tau + 15.0)));
      if (fumble && tau >= -14.6 && tau < -14.3) it.Y = REST_Y - 1;      // bounces
      if (tau >= -6.9 && tau < -3.0 && Math.floor((tau + 7) / 0.3) % 2) it.Y = REST_Y - 1;   // trembles while aimed at
      out.items.push(it);
    } else if (tau < (kind === 'double' && k === 0 ? lastDrop : dropT)) {
      // in the claw
      out.items.push({ i, d: from[i], big: false, X: Math.round(x) + g.dx[k], Y: hy + TIP, held: true });
    } else {
      // down the chute
      const t0 = kind === 'double' && k === 0 ? lastDrop : dropT;
      if (tau < t0 + 0.5) out.items.push({ i, d: from[i], big: false, X: CHUTE * 5, Y: Math.round(1 + fall(tau - t0)), chute: true });
    }
    // the new one, tossed in from above while the claw is still on its way
    const it = tossed(i, to[i], tau - (kind === 'double' && i === 2 ? 0.2 : 0));
    if (it) out.items.push(it);
  }
  return out;
}

// A new prize tossed in at the turn: it drops through the top row and lands
// with a bounce, one cell (or one pair of cells) at a time.
function tossed(i, d, t) {
  if (t < 0) return null;
  const Y = t < 0.12 ? -3 : t < 0.27 ? 1 : t < 0.42 ? REST_Y - 1 : REST_Y;
  return { i, d, big: BIGSLOT[i], X: SLOT_X[i], Y, eyes: BIGSLOT[i] && t < 2 ? true : null };
}

// ---------------------------------------------------- the hour: the big prize
function hourTurn(out, tau, T, Tturn, from, to, rest) {
  const g = GRAB.big;
  const xk = [[-22, idleX(Tturn - 22)], [-18, 50], [-17, 50], [-15.5, g.cx - 3], [-15, g.cx + 3], [-14.5, g.cx],
    [-1.6, g.cx], [-0.4, g.drop, 'inOutCubic']];
  let x = track(tau, xk);
  const back = 1.6;
  if (tau > back) x = g.drop + (idleX(T) - g.drop) * ease.inOutQuad(clamp((tau - back) / 2.5, 0, 1));
  let hy = Math.round(track(tau, [[-30, HY_IDLE], [-12.4, HY_IDLE], [-11.2, HY_GRAB, 'linear'], [-2.6, HY_GRAB],
    [-1.6, HY_UP, 'linear'], [-0.2, HY_UP], [0.9, HY_IDLE, 'linear']]));
  // it strains: the plush comes up a dot and sags back, over and over
  if (tau >= -10.4 && tau < -2.6) {
    const k = Math.floor((tau + 10.4) / 0.45);
    if (k % 3 === 1 || (k > 9 && k % 3 === 2)) hy -= 1;
  }
  const open = track(tau, [[-30, 1], [-11.2, 1], [-10.7, 0, 'linear'], [-0.6, 0], [-0.4, 1, 'linear']]);
  out.claw = { x, hy, open, show: true, sway: tau > back || tau < -17 };

  for (let i = 0; i < 4; i++) {
    if (i === 1 && tau >= -10.7 && tau < -0.4) {
      out.items.push({ i, d: from[i], big: true, X: Math.round(x) + g.dx[0], Y: hy + TIP, eyes: true, held: true });
    } else if (i === 1 && tau >= -0.4 && tau < 0.1) {
      out.items.push({ i, d: from[i], big: true, X: CHUTE * 5, Y: Math.round(1 + fall(tau + 0.4)), eyes: true, chute: true });
    } else if (i !== 1 && tau < -0.6) {
      const it = rest(i, from[i]);
      if (i < 2) it.eyes = tau > -16 ? true : null;
      out.items.push(it);
    } else if (i !== 1 && tau < 0) {
      // JACKPOT: the floor drops away under the rest
      out.items.push({ ...rest(i, from[i]), Y: Math.round(REST_Y + fall(tau + 0.6)) });
    } else if (i === 1 && tau < -10.7) {
      out.items.push({ ...rest(i, from[i]), eyes: tau > -16 ? true : null });
    }
    // and a whole new time rains in, minutes first
    const it = tossed(i, to[i], tau - [0.5, 0, 0.3, 0.15][i]);
    if (it) out.items.push(it);
  }
  // lights chase round the cabinet; flash on the jackpot
  if (tau > -20 && tau < 4) out.bulbs = tau > -0.6 && tau < 1.8 ? 'flash' : 'chase';
  return out;
}

// ------------------------------------------------------------------ drawing

// An hour plush pricks its ears. When the claw comes near (or on the hour)
// they twitch, one and then the other; now and then one flicks on its own.
function ears(it, sc) {
  const T = sc.T;
  let alert = it.eyes === true;
  const c = sc.claw;
  if (c.show && Math.abs(c.x - (it.X + 2)) < 8) alert = true;
  if (alert) return [[1, 1], [0, 1], [1, 0], [1, 1]][Math.floor(T / 0.3 + it.i) % 4];
  const k = Math.floor(T / 3);
  if (noise(k * 7 + it.i, 21) < 0.35 && T - k * 3 < 0.4) return noise(k, 22) < 0.5 ? [0, 1] : [1, 0];
  return [1, 1];
}

function drawClaw(cv, c, sway) {
  const cx = Math.round(c.x) + sway, x0 = Math.round(c.x);
  const P = (dx, dy) => cv.dot(cx + dx, c.hy + dy, 2);
  // cable from the ceiling to the housing, leaning with the sway
  for (let y = 0; y < c.hy; y++) cv.dot(cx, y, 2);
  const row = (dy, pat) => { for (let i = 0; i < 5; i++) if (pat[i] === '#') P(i - 2, dy); };
  row(0, '.###.'); row(1, '#####');                   // the housing
  if (c.open > 0.66) {          // open: three prongs splayed, hooks turned in
    row(2, '#.#.#'); row(3, '#...#'); row(4, '#...#');
  } else if (c.open > 0.33) {   // closing
    row(2, '#.#.#'); row(3, '#...#'); row(4, '.#.#.');
  } else if (c.hy < 0) {       // reeled up with a prize: only the hooks show, gripping its head
    row(2, '#.#.#'); row(3, '#...#'); row(4, '#...#');
  } else {                      // shut: the hooks meet
    row(2, '#.#.#'); row(3, '.#.#.'); row(4, '.#.#.');
  }
}

function render(lcd, sc) {
  const cv = new Canvas();
  // resting numerals first (they must win any slot), then moving ones, then the claw
  const items = [...sc.items].sort((a, b) => (b.Y === REST_Y) - (a.Y === REST_Y));
  for (const it of items) {
    const rank = it.Y === REST_Y && it.X === SLOT_X[it.i] ? 0 : 1;
    let rows = SMALL[it.d];
    if (it.big) { const [l, r] = ears(it, sc); rows = [(l ? '#' : '.') + '...' + (r ? '#' : '.'), ...rows]; }
    const Y0 = it.big ? it.Y - 1 : it.Y;
    if (it.chute) rows = rows.map((r, y) => (Y0 + y < 8 ? r : ''));   // gone below the floor, into the chute
    cv.glyph(rows, it.X, Y0, rank);
  }
  if (sc.claw.show) {
    let sway = 0;
    // the head lags behind the trolley while it travels, only when it hangs free
    if (sc.claw.hy <= HY_IDLE + 1 && !sc.items.some((it) => it.held)) {
      sway = clamp(Math.round((sc.xBefore - sc.claw.x) / 3), -1, 1);
    }
    drawClaw(cv, sc.claw, sway);
  }
  // the chute (anything that falls in is swallowed: the cell is only the chute)
  cv.bits.delete(16 + CHUTE);
  cv.glyph(CHUTE_TILE, CHUTE * 5, 8, 0);
  if (sc.bulbs) {
    // marquee bulbs along the top of the cabinet: a chase, then a flash
    const ph = Math.floor(sc.T * 5);
    for (let col = 0; col < 16; col++) {
      if (cv.bits.has(col)) continue;
      const lit = sc.bulbs === 'flash' ? (col + ph) % 2 === 0 : (col + ph) % 3 === 0;
      if (lit) cv.rom.set(col, sc.bulbs === 'flash' ? 0x2a : 0xa5);
    }
  }
  return cv.draw(lcd);
}

export default {
  name: 'Claw Machine',
  blurb: 'A crane game: the hours are plush animals with ears, the minutes beanbags; each minute the claw (weak grip and all) fishes out the old one and a new one is tossed in; on the hour it strains to haul off an hour plush, JACKPOT, and the floor drops.',
  bus: 'i2c100',
  panel: 'green',
  fps: FPS,

  frame(lcd, api, ctx) {
    const sc = scene(ctx.date, ctx.fields);
    const before = new Date(ctx.date.getTime() - 400);
    sc.xBefore = scene(before, clockFields(before)).claw.x;
    render(lcd, sc);
  },
};
