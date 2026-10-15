// Goods — the time is the cargo of a little steam train.
//
// A tank engine with a face on its smokebox door hauls two flat wagons
// across the glass. The wagons carry the time as freight: four wooden
// numerals, hours on the first wagon, minutes on the second. The camera
// rides with the train, so the country streams past behind it in ROM:
// telegraph poles and trees at full speed, hills at a quarter of it (stars
// at night), and its own smoke, which puffs once every two cells of line,
// rolls back over the cab and thins out into ROM puffs in the sky.
//
// Each minute the train brakes into a goods yard: the crane's legs slide in
// from the right and come to rest either side of the minutes wagon. At :00
// the crane's beam comes down, the numerals that changed rise off the deck
// up into it, a dot row every 150 ms, and the new ones are lowered on, with
// a bump. Everything that changes moves together, so the glass only ever
// shows the old time, the old time with gaps, the new time with gaps, or the
// new time. The engine watches the crane, beams when the load is down,
// toots twice, screws its face up and slips its wheels pulling away.
//
// On the hour the camera stays on the platform: the whole train pulls out
// with the old time on it, and the next one backs in from the right with
// the new hour. Then the engine toots the hour, once a second.
//
// Budget: the chassis is one tile shared by every car, its coupling rod
// rising and falling as the wheels turn; the engine is three (cab, boiler,
// face), the smoke over it inked into those; the cargo is at most four.
// Eight at most, and the beam, lifts and expressions all happen inside
// tiles that are already private. Station, scenery, track and smoke in the
// sky are ROM. Every position is worked out from the wall clock: the line
// travelled is a trapezoid of speed between stations, so a still at any
// instant is the same as the live view.

import { Stage, clockFields, noise } from '../js/kit.js';

const FPS = 10;
const L = 110;                    // cells of line between one minute's station and the next
const TA = 5, TD = 7;             // seconds to get up to speed, and to brake
const CARGO = [2, 3, 5, 6];       // H H M M, top row
const CARS = [2, 3, 5, 6, 8, 9, 10]; // chassis cells, bottom row: two wagons and the engine
const LOCO = 8;                   // cab, boiler, smokebox: top row 8-10
const GLASS = (col, i) => col * 6 + i;

// ------------------------------------------------------------------ glyphs

// Wooden numerals: two-dot strokes, seven rows, sitting on the flatcar deck
// with row 0 left free for the crane's beam to come down onto.
const NUM = {
  0: ['.###.', '##.##', '##.##', '##.##', '##.##', '##.##', '.###.'],
  1: ['.##..', '###..', '.##..', '.##..', '.##..', '.##..', '####.'],
  2: ['.###.', '##.##', '...##', '..##.', '.##..', '##...', '#####'],
  3: ['####.', '...##', '...##', '.###.', '...##', '...##', '####.'],
  4: ['...##', '..###', '.#.##', '#..##', '#####', '...##', '...##'],
  5: ['#####', '##...', '####.', '...##', '...##', '##.##', '.###.'],
  6: ['.###.', '##...', '####.', '##.##', '##.##', '##.##', '.###.'],
  7: ['#####', '...##', '...##', '..##.', '..##.', '.##..', '.##..'],
  8: ['.###.', '##.##', '##.##', '.###.', '##.##', '##.##', '.###.'],
  9: ['.###.', '##.##', '##.##', '.####', '...##', '...##', '.###.'],
};

// One chassis tile under every car: deck, axle box, a spoked wheel, rail.
const CHASSIS = [
  ['#####', '#####', '#####', '.....', '#####', '##.##', '#####', '.....'],
  ['#####', '#####', '#####', '.....', '##.##', '#####', '#####', '.....'],
];

// The engine: cab, boiler with dome and funnel, and a face on the smokebox
// door, Thomas-fashion: dark, with the eyes and mouth left unlit.
const CAB = ['.....', '.....', '#####', '##..#', '##..#', '#####', '#####', '#####'];
const BOILER = ['.....', '..###', '...#.', '.#.#.', '#####', '#####', '#####', '#####'];
const FACE = {                      // rows 2-7 of the smokebox door
  ahead: ['.###.', '#####', '#.#.#', '#####', '#...#', '.###.'],
  up: ['.###.', '#.#.#', '#####', '#####', '#...#', '.###.'],
  back: ['.###.', '#####', '.#.##', '#####', '#...#', '.###.'],
  shut: ['.###.', '#####', '#####', '#####', '#...#', '.###.'],
  happy: ['.###.', '#.#.#', '.#.#.', '#####', '#...#', '.###.'],
  toot: ['.###.', '#.#.#', '.#.#.', '##.##', '#.#.#', '.###.'],
  strain: ['.###.', '#.#.#', '#####', '#####', '#.#.#', '.###.'],
};
// A puff over the funnel and over the cab, then ROM puffs in the sky.
const PUFF = [['..##.'], ['#.#.#', '.#.#.']];

// ----------------------------------------------------------------- schedule

const at = (k) => new Date(k * 60000);
const isHour = (k) => at(k).getMinutes() === 0;
const strikes = (k) => at(k).getHours() % 12 || 12;
const TOOTS = 11.5;                // the hour's whistle count starts here, after the new train is in
const arrive = (k) => k * 60 - (isHour(k) ? 4 : 3);
const clears = (k) => k * 60 + (isHour(k) ? TOOTS + strikes(k) : 3.0);
const depart = (k) => k * 60 + (isHour(k) ? TOOTS + strikes(k) + 1.5 : 6.5);

/** Line travelled at absolute second T, and the stop the train is at, if any. */
function line(T) {
  const n = Math.floor(T / 60);
  if (T < depart(n)) return { D: n * L, stop: n };
  if (T >= arrive(n + 1)) return { D: (n + 1) * L, stop: n + 1 };
  const t0 = depart(n), dur = arrive(n + 1) - t0, v = L / (dur - TA / 2 - TD / 2);
  const u = T - t0;
  let d;
  if (u < TA) d = (v * u * u) / (2 * TA);
  else if (u < dur - TD) d = (v * TA) / 2 + v * (u - TA);
  else d = L - (v * (dur - u) ** 2) / (2 * TD);
  return { D: n * L + d, stop: null, sinceDepart: u, toArrive: dur - u };
}

/** The train's own shift (cells, + is right) during the hour's change of train. */
function shunt(r) {
  const V = 3.5, A = 1.2;          // 3.5 cells a second: a whole cell every 285 ms
  if (r < 0) return { X: 0, which: 'old' };
  if (r < 4.8) return { X: r < A ? (V * r * r) / (2 * A) : (V * A) / 2 + V * (r - A), which: 'old' };
  if (r < 5.2) return { X: 99, which: 'none' };
  const u = r - 5.2, cruise = (15 - 4) / V, brake = 8 / V;
  if (u < cruise) return { X: 15 - V * u, which: 'new' };
  if (u < cruise + brake) return { X: 4 * (1 - (u - cruise) / brake) ** 2, which: 'new' };
  return { X: 0, which: 'new' };
}

// ------------------------------------------------------------------- cargo

const digitsAt = (ms) => { const f = clockFields(new Date(ms)); return [...f.hh, ...f.mm].map(Number); };

/** A numeral raised `o` rows off its deck (it vanishes up into the crane). */
function crate(d, o = 0) {
  const g = ['.....', ...NUM[d]];
  return g.map((_, r) => g[r + o] ?? '.....');
}

const LIFT = 0, EMPTY = 1.2, DROP = 1.5, STEP = 0.15, LET_GO = 2.8;

/**
 * The four cargo tiles at absolute second T on an ordinary minute, as
 * { d, o } or null for an empty deck. Every numeral that changes is
 * lifted together and lowered together, so the glass shows the old time,
 * then the old time with gaps, then the new time with gaps, then the new.
 */
function cargo(T) {
  const k = Math.round(T / 60), r = T - k * 60;
  const old = digitsAt(k * 60000 - 1000), now = digitsAt(k * 60000);
  if (r < LIFT || r >= LET_GO || isHour(k)) return digitsAt(T * 1000).map((d) => ({ d, o: 0 }));
  return old.map((d, i) => {
    if (d === now[i]) return { d, o: 0 };
    if (r < EMPTY) return { d, o: Math.min(8, 1 + Math.floor((r - LIFT) / STEP)), lifting: true };
    if (r < DROP) return null;
    const s = Math.floor((r - DROP) / STEP);
    const o = s < 7 ? 7 - s : s === 8 ? 1 : 0;   // seven steps down, a bump on landing
    return { d: now[i], o };
  });
}

// ---------------------------------------------------------------- scenery

const NEAR = (w) => {
  const k = Math.round(w / L), off = w - k * L;
  if (off >= -3 && off <= 17) return null;          // the station's own ground
  if (((w % 7) + 7) % 7 === 0) return 0xb7;           // telegraph pole
  const n = noise(w, 3);
  if (n < 0.16) return 0xce;                          // tree
  return null;
};
const FAR = (w, night) => {
  const n = noise(w, 9);
  if (night) return n < 0.10 ? 0xa5 : n < 0.16 ? 0x2e : null;
  return n < 0.10 ? 0x5e : n < 0.15 ? 0xcd : null;
};
// The station, by its column on the glass when the train is standing in it.
const STATION = { 4: 0x7c, 7: 0x7c, 13: 0xc4 };
const GANTRY = [4, 7];          // the crane's legs; its beam runs along dot row 0 between them

// ------------------------------------------------------------------ smoke

const CHUFF = 2;                    // cells of line per puff
function timeAtD(target, T) {
  let lo = T - 6, hi = T;
  for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (line(mid).D < target) lo = mid; else hi = mid; }
  return hi;
}
/** Live puffs: { age, dx } with dx in cells behind the funnel. */
function puffs(T, D, X, shuntX) {
  const out = [];
  for (let j = Math.floor(D / CHUFF); j > Math.floor(D / CHUFF) - 4; j--) {
    const Dj = j * CHUFF;
    if (Dj > D || Dj <= D - 8) continue;
    const tj = timeAtD(Dj, T);
    if (line(tj).stop !== null) continue;
    out.push({ age: T - tj, dx: (D - Dj) * 0.9 + (T - tj) * 0.4 });
  }
  for (let m = Math.floor(T / 1.25); m > Math.floor(T / 1.25) - 4; m--) {
    const tj = m * 1.25, s = line(tj);
    if (s.stop === null) continue;
    const fast = shuntX(tj);
        out.push({ age: T - tj, dx: (T - tj) * 0.7 - (X - fast.X) });
  }
  return out.filter((p) => p.age < 6 && p.dx < 11);
}

// ----------------------------------------------------------------- design

export default {
  name: 'Goods',
  blurb: 'A steam train carries the time as freight; a goods crane swaps the minutes at every station, and on the hour a new train backs in.',
  bus: 'i2c100',
  panel: 'green',
  fps: FPS,

  frame(lcd, api, { date }) {
    const T = Math.floor((date.getTime() / 1000) * FPS + 1e-6) / FPS;
    const { D, stop } = line(T);
    const st = new Stage(lcd);
    const night = (() => { const h = new Date(T * 1000).getHours(); return h >= 20 || h < 6; })();

    // The hour: the train leaves without the camera and the next one backs in.
    const k = Math.round(T / 60), r = T - k * 60;
    const hourShow = isHour(k) && stop === k;
    const sh = hourShow ? shunt(r) : { X: 0, which: 'old' };
    const shuntX = (t) => {
      const kk = Math.round(t / 60);
      if (!isHour(kk) || line(t).stop !== kk) return { X: 0, moving: false };
      const s = shunt(t - kk * 60);
      const s2 = shunt(t - kk * 60 + 0.1);
      return { X: s.which === 'none' ? 99 : s.X, moving: Math.abs(s2.X - s.X) > 0.01 && s.which !== 'none' };
    };
    const X = Math.round(sh.X);
    const present = sh.which !== 'none';

    let cars;
    if (hourShow) {
      const ds = digitsAt((sh.which === 'old' ? k * 60 - 1 : k * 60) * 1000);
      cars = ds.map((d) => ({ d, o: 0 }));
    } else cars = cargo(T);

    // Scenery first, so the train covers it.
    const S = Math.round(D);
    const props = new Set();
    for (let c = 0; c < 16; c++) {
      st.put(c, 1, 0x5f);
      const far = FAR(c + Math.round(D * 0.25), night);
      const near = NEAR(c + S);
      let g = near ?? far ?? 0x20;
      for (const kk of [Math.floor(D / L), Math.ceil(D / L)]) {
        const s = STATION[c + S - kk * L];
        if (s !== undefined) {
          g = s === 0xc4 && T >= clears(kk) ? 0xb2 : s;   // the signal's arm swings up to clear
          props.add(c);
        }
      }
      st.put(c, 0, g);
    }

    // Pulling away, the drivers slip for a moment before they bite.
    const slip = stop !== null && T >= depart(stop) - 0.9 && T < depart(stop) - 0.1;
    const wheel = CHASSIS[slip ? Math.floor(T / 0.15) % 2 : Math.floor((D + sh.X) * 1.5) % 2];

    if (present) {
      for (const c of CARS) st.put(c + X, 1, wheel);
      CARGO.forEach((c, i) => {
        const car = cars[i];
        const tile = car ? crate(car.d, car.o) : null;
        st.put(c + X, 0, tile && tile.some((row) => row.includes('#')) ? tile : 0x20);
      });

      // The engine's face: it watches the crane, beams when the load is down,
      // toots, screws its eyes up to pull away and to brake, and glances about.
      const changed = digitsAt(k * 60000 - 1000).join() !== digitsAt(k * 60000).join();
      const whistle = !hourShow
        ? stop === k && r >= 3.4 && r < 4.4 && (r < 3.8 || r >= 4.0)
        : (r >= -2.5 && r < -2) || (r >= TOOTS && r < TOOTS + strikes(k) && (r - TOOTS) % 1 < 0.5);
      const crane = !hourShow && stop === k && changed && r >= -0.3 && r < 2.6;
      const pleased = !hourShow && stop === k && r >= 2.6 && r < 3.3;
      const strain = (stop !== null && T >= depart(stop) - 1.0) || (hourShow && r >= 0 && r < 1.2);
      const moving = stop === null;
      const lt = moving ? line(T) : null;
      let eye = 'ahead';
      if (moving && T % 11 >= 5 && T % 11 < 5.7) eye = 'up';
      if (moving && T % 17 >= 9 && T % 17 < 9.6) eye = 'back';
      if (eye === 'ahead' && T % 4.3 < 0.2) eye = 'shut';
      if (moving && lt.toArrive < 1.8) eye = 'strain';
      if (crane) eye = 'up';
      if (pleased) eye = 'happy';
      if (sh.which === 'new' && sh.X > 0) eye = 'back';
      if (strain) eye = 'strain';
      if (whistle) eye = 'toot';
      const front = ['.....', '.....', ...FACE[eye]];
      const cab = CAB.slice();
      if (whistle) {
        const p = Math.floor(T / 0.15) % 2;
        cab[0] = p ? '.#.#.' : '#.#.#';
        cab[1] = p ? '..#..' : '.#.#.';
      }

      // Smoke, a cell at a time: inked over the engine (funnel, boiler, cab),
      // then ROM puffs thinning out in the sky behind it.
      const trainCells = new Set([...CARGO, LOCO, LOCO + 1, LOCO + 2].map((c) => c + X));
      const rom = new Map();
      const over = [];
      for (const p of puffs(T, D, sh.X, shuntX)) {
        const stage = Math.floor(p.dx), cell = LOCO + 1 + X - stage;
        if (stage < 2) { if (!over[stage]) over[stage] = PUFF[stage]; continue; }
        if (cell >= 0 && cell < 16 && !trainCells.has(cell) && !props.has(cell) && !rom.has(cell)) rom.set(cell, stage < 4 ? 0x6f : 0xa5);
      }
      const tops = [BOILER.slice(), cab];
      over.forEach((pf, i) => { if (pf) pf.forEach((row, r) => { if (!(i === 1 && whistle)) tops[i][r] = row; }); });
      st.put(LOCO + X, 0, tops[1]).put(LOCO + 1 + X, 0, tops[0]).put(LOCO + 2 + X, 0, front);
      for (const [cell, g] of rom) st.put(cell, 0, g);

      // The goods crane's beam, lowered to the cargo while it works.
      if (crane) for (const kk of [k]) {
        const c0 = kk * L + GANTRY[0] - S, c1 = kk * L + GANTRY[1] - S;
        for (let c = Math.max(0, c0); c <= Math.min(15, c1); c++) {
          if (!trainCells.has(c)) { if (c === c0 || c === c1) st.put(c, 0, 0x54); continue; }
          for (let i = 0; i < 5; i++) st.dotAt(c, 0, i, 0);
        }
      }
    }

    st.draw();
  },
};
