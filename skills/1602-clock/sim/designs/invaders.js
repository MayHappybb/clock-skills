// Invaders — the time marches, and the cannon updates it by shooting it.
//
// The four digits are the invaders: little numerals on legs, marching side to
// side in formation one cell a step, with the legs swapping on every step as
// the arcade sprites do, and getting faster as the minute runs out. A cannon patrols the ground below. When the minute
// turns, it lines up under the digit that changed, leading the target since
// the formation is still marching, and fires. The digit explodes and the new
// one beams in. When several digits change (10:59 -> 11:00) it picks them off
// right to left, one shot a second, and each keeps its old value until it is
// hit, so the time on the glass is always the one the cannon has got to.
//
// Everything is worked out from the wall clock: the march from the seconds
// since midnight, the cannon's path from waypoints for the minute, the shots
// from the digits that differ between this minute and the last.
//
// The formation moves a whole cell per step, as the arcade's invaders move in
// steps, so the digits are just four tiles that never need splitting. The
// colon marches with them, in ROM. The cannon moves dot by dot over the ROM
// ground line (`Stage`), two tiles when it straddles cells; the beam takes
// one more where it enters a digit, and the explosion one: eight at most,
// with the digits allocated first.

import { art, Stage, noise, ease, clamp } from '../js/kit.js';

// The march speeds up through the minute, as the arcade's does through a wave:
// a step every 0.8 s at :00, every 0.3 s by :59. The step rate rises
// linearly, so the steps taken by second s of a minute are RATE0*s + ACCEL*s^2/2,
// and the constants make that a whole number (137) by :60, so the march
// carries straight on into the next minute.
const RATE0 = 1.25, ACCEL = 62 / 1800;
const PER_MINUTE = 60 * RATE0 + 1800 * ACCEL;
const SPAN = 11;                  // the formation's left cell runs 0..11
const OFFSETS = [0, 1, 3, 4];     // digit cells within the formation; the colon is 2
const COLON = 2;
const SHOT_GAP = 1.2;             // seconds between shots when several digits change
const FLIGHT = 0.35;              // the beam takes this long to reach the digit
const BOOM = 0.45, BEAM = 0.35;   // explosion, then dark before the new digit lands
const GROUND = 0x5f;              // ROM underscore: a rule on dot row 6

const D = {
  0: '.###.|#...#|#...#|#...#|#...#|.###.',
  1: '..#..|.##..|..#..|..#..|..#..|.###.',
  2: '.###.|#...#|...#.|..#..|.#...|#####',
  3: '####.|....#|.###.|....#|....#|####.',
  4: '...#.|..##.|.#.#.|#..#.|#####|...#.',
  5: '#####|#....|####.|....#|....#|####.',
  6: '.###.|#....|####.|#...#|#...#|.###.',
  7: '#####|....#|...#.|..#..|.#...|.#...',
  8: '.###.|#...#|.###.|#...#|#...#|.###.',
  9: '.###.|#...#|#...#|.####|....#|.###.',
};
const LEGS = [['.#.#.', '#...#'], ['.#.#.', '.#.#.']];
const digitTile = (d, frame) => [...D[d].split('|'), ...LEGS[frame]];

const BOOM_TILE = art(`
  #...#
  .#.#.
  #.#.#
  ..#..
  #.#.#
  .#.#.
  #...#
  .....`);

const CANNON = ['..#..', '.###.', '#####', '#####'];
const CANNON_TOP = 10;            // dot row of the cannon's tip; it sits on the ground rule
const BEAM_FROM = 9, BEAM_TO = 5; // the beam grows from above the tip into the digit

/** Formation's left cell after `n` steps: a ping-pong between 0 and SPAN. */
const formationAt = (n) => { const p = ((n % (2 * SPAN)) + 2 * SPAN) % (2 * SPAN); return p <= SPAN ? p : 2 * SPAN - p; };
/** March steps taken by `daySec` seconds since midnight. */
const stepsAt = (daySec) => {
  const minute = Math.floor(daySec / 60), sec = daySec - minute * 60;
  return Math.floor(minute * PER_MINUTE + RATE0 * sec + (ACCEL * sec * sec) / 2 + 1e-9);
};
const marchAt = (daySec) => formationAt(stepsAt(daySec));

/**
 * The shots fired at the minute boundary `B` (seconds since midnight, may be
 * negative or past 86400): one per changed digit, right to left.
 */
function shotsAt(B, kit, dayStart) {
  const now = kit.clockFields(new Date(dayStart + B * 1000));
  const was = kit.clockFields(new Date(dayStart + (B - 60) * 1000));
  const a = was.hh + was.mm, b = now.hh + now.mm;
  const shots = [];
  for (let i = 3; i >= 0; i--) {
    if (a[i] === b[i]) continue;
    const hit = B + shots.length * SHOT_GAP;
    const cell = marchAt(hit) + OFFSETS[i];
    shots.push({ i, from: a[i], to: b[i], hit, fire: hit - FLIGHT, x: cell * 6 + 2 });
  }
  return shots;
}

/** Cannon centre (glass column) at `T`: idle waypoints, then lined up for each shot. */
function cannonAt(T, shots, B) {
  const busy = (t) => shots.some((s) => t > s.fire - 1.5 && t < s.hit + 0.8);
  const pts = [];
  for (const base of [B - 60, B]) {
    for (let j = 1; j <= 8; j++) {
      const t = base + j * 6.5;
      const cell = 1 + Math.floor(noise(base / 60 + j * 7.3, 5) * 14);
      if (!busy(t)) pts.push({ t, x: cell * 6 + 2 });
    }
  }
  // Under the target a moment before firing, and still there as the beam lands.
  for (const s of shots) pts.push({ t: s.fire - 0.25, x: s.x }, { t: s.hit + 0.15, x: s.x });
  pts.sort((p, q) => p.t - q.t);
  let prev = pts[0];
  for (const p of pts) {
    if (T <= p.t) {
      if (p === prev) return p.x;
      const u = clamp((T - prev.t) / (p.t - prev.t), 0, 1);
      return prev.x + (p.x - prev.x) * ease.inOutQuad(u);
    }
    prev = p;
  }
  return prev.x;
}

export default {
  name: 'Invaders',
  blurb: 'The digits march like invaders; each minute the cannon shoots the one that changed and the new one beams in.',
  bus: 'i2c100',
  panel: 'blue',
  fps: 12,

  frame(lcd, api, { fields, date, kit }) {
    const midnight = new Date(date); midnight.setHours(0, 0, 0, 0);
    const dayStart = midnight.getTime();
    const T = (date.getTime() - dayStart) / 1000;        // seconds since midnight
    const B = T - (fields.s + fields.ms / 1000);         // this minute's boundary

    // This minute's shots, and the next minute's, whose first is fired at :59.5.
    const shots = [...shotsAt(B, kit, dayStart), ...shotsAt(B + 60, kit, dayStart)];
    const current = shots.filter((s) => s.hit < B + 60);

    const n = stepsAt(T);
    const left = formationAt(n);
    const legs = n % 2;

    const st = new Stage(lcd);
    for (let c = 0; c < 16; c++) st.put(c, 1, GROUND);

    // Each digit shows its old value until it is hit, then the explosion, a
    // beat of nothing, and the new value.
    const value = fields.hh + fields.mm;
    for (let i = 0; i < 4; i++) {
      const s = current.find((q) => q.i === i);
      let tile = digitTile(value[i], legs);
      if (s && T < s.hit) tile = digitTile(s.from, legs);
      else if (s && T < s.hit + BOOM) tile = BOOM_TILE;
      else if (s && T < s.hit + BOOM + BEAM) tile = null;
      if (tile) st.put(left + OFFSETS[i], 0, tile);
    }
    st.put(left + COLON, 0, 0x3a);

    const cx = Math.round(cannonAt(T, shots, B));
    CANNON.forEach((line, r) => [...line].forEach((ch, k) => { if (ch === '#') st.dot(cx - 2 + k, CANNON_TOP + r); }));

    // The beam grows up from the cannon and holds for a frame as it lands.
    const firing = shots.find((s) => T >= s.fire && T < s.hit + 0.1);
    if (firing) {
      const u = clamp((T - firing.fire) / FLIGHT, 0, 1);
      const head = Math.round(BEAM_FROM - (BEAM_FROM - BEAM_TO) * u);
      for (let y = head; y <= BEAM_FROM; y++) st.dot(firing.x, y);
    }

    st.draw();
  },
};
