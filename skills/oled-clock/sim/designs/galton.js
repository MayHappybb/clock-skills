// Quincunx: a Galton board that tells the time.
//
// The hour is the board itself: its pins are set in the shape of the hour
// numeral, on the staggered quincunx lattice every bean machine uses. The
// minute is what the board produces: steel balls stacked in eight glass
// tubes, with little shelves holding up the balls that float, so the stacks
// spell the digits. Every second a ball drops from the hopper, rattles
// through the hour, lands on the roof over the tubes and rolls away. On the
// minute only the tubes that differ open their gates and drain, and the new
// digit is poured ball by ball: each one bounces chaotically through the
// pins and still lands in exactly the right tube. On the hour the pin board
// flips over to show the next hour on its back, and the hopper empties in a
// downpour that builds the new minutes and rains off the roof.
//
// Everything is a pure function of time. Ball paths are simulated from their
// launch with a fixed step and cached per hour layout: the cache saves work,
// it never changes a frame.

import { sprite, previousMinute, orbit, clamp, ease } from '../js/kit.js';

const SPECIMEN = false;

// ---------------------------------------------------------------- geometry
const G = 380;            // gravity, px/s^2
const G_DRAIN = 640;      // a draining column falls a little faster (it is pushed)
const R = 2.5;            // ball radius (5 px balls)
const PIN_R = 1.5;        // pin radius (3 px pins)
const E_PIN = 0.42;       // restitution ball/pin
const E_ROOF = 0.25;
const NECK_Y = -1;
const DT = 1 / 480, SAMPLE = 2; // sim step; a sample every 2 steps (240 Hz)

// Glass tubes: 2 digits x 4 tubes, 6 balls high. Walls every 8 px (wall,
// gap, 5 px ball, gap), a drain chute between the digits.
const ROWS = 6;
const TY = 33;            // top of row 0
const FLOOR_Y = 63;
const WALLS = [27, 35, 43, 51, 59, 68, 76, 84, 92, 100];
const TX = [29, 37, 45, 53, 70, 78, 86, 94];
const tubeCX = (k) => TX[k] + 2.5;
const restCY = (row) => TY + row * 5 + 2.5;
const CHUTE = [WALLS[4] + 3.5, WALLS[5] - 2.5]; // ball centre limits in the drain

// The gutter over the tubes: each side falls steeply outside the pins, then
// gently to the drain between the digits. Each tube has a flap in the gutter
// that opens to catch a ball.
const GUT_L = [[23, 25.6], [36, 29.2], [59.5, 32.2]];
const GUT = { yi: GUT_L[2][1] };
const ROOF_SEGS = [];
for (let i = 0; i + 1 < GUT_L.length; i++) {
  ROOF_SEGS.push([GUT_L[i], GUT_L[i + 1]]);
  ROOF_SEGS.push([[128 - GUT_L[i + 1][0], GUT_L[i + 1][1]], [128 - GUT_L[i][0], GUT_L[i][1]]]);
}
function roofY(x) {
  const d = Math.min(x, 128 - x);
  for (let i = 0; i + 1 < GUT_L.length; i++) {
    const [a, b] = [GUT_L[i], GUT_L[i + 1]];
    if (d <= b[0] || i + 2 === GUT_L.length) return a[1] + (d - a[0]) * (b[1] - a[1]) / (b[0] - a[0]);
  }
}

// Pin board: quincunx lattice, 4 px pitch in a row, rows 3 px apart, every
// other row offset by half a pitch. Pin centres at y = PIN_Y0 + 3 r.
const PIN_Y0 = 4.5, PIN_DY = 3;

// ------------------------------------------------------------ letterforms
// Minutes: four tubes per digit, six balls high, top row first. A ball with
// nothing under it sits on a shelf.
const BALL_DIGITS = {
  0: ['.##.', '#..#', '#..#', '#..#', '#..#', '.##.'],
  1: ['..#.', '.##.', '..#.', '..#.', '..#.', '.###'],
  2: ['.##.', '#..#', '...#', '..#.', '.#..', '####'],
  3: ['###.', '...#', '.##.', '...#', '...#', '###.'],
  4: ['#..#', '#..#', '#..#', '####', '...#', '...#'],
  5: ['####', '#...', '###.', '...#', '...#', '###.'],
  6: ['.##.', '#...', '###.', '#..#', '#..#', '.##.'],
  7: ['####', '...#', '..#.', '.#..', '.#..', '.#..'],
  8: ['.##.', '#..#', '.##.', '#..#', '#..#', '.##.'],
  9: ['.##.', '#..#', '#..#', '.###', '...#', '.##.'],
};
const COLS = {};
for (let d = 0; d < 10; d++) COLS[d] = [0, 1, 2, 3].map((k) => BALL_DIGITS[d].map((row) => row[k] === '#'));
// Tube k (0..7) of the minute m, as 6 booleans top to bottom.
const tubeCol = (m, k) => COLS[k < 4 ? Math.floor(m / 10) : m % 10][k & 3];

// Hours: pins on the quincunx, 11 half-steps x 7 rows. A pin can only sit
// where (column + row) is even, which is what staggers the lattice, so a
// vertical stroke is a braid (a pair, then one between them) and a slant
// runs at the lattice's own 60 degrees.
const PIN_DIGITS = {
  0: ['  o o o o  ', ' o o   o o ', 'o o     o o', ' o       o ', 'o o     o o', ' o o   o o ', '  o o o o  '],
  1: ['    o o    ', '   o o     ', '  o o o    ', '     o     ', '    o o    ', '     o     ', '  o o o o  '],
  2: ['  o o o o  ', ' o     o o ', '        o o', '     o o   ', '  o o      ', ' o o       ', 'o o o o o o'],
  3: ['o o o o o  ', '       o o ', '        o o', '   o o o   ', '        o o', '       o o ', 'o o o o o  '],
  4: ['      o o o', '     o   o ', '    o   o o', '   o     o ', 'o o o o o o', '         o ', '        o o'],
  5: ['o o o o o o', ' o         ', 'o o        ', ' o o o o   ', '        o o', '       o o ', 'o o o o o  '],
  6: ['    o o o  ', ' o o       ', 'o o        ', ' o o o o   ', 'o o     o o', ' o o   o o ', '  o o o o  '],
  7: ['o o o o o o', '       o o ', '      o o  ', '     o o   ', '    o o    ', '   o o     ', '  o o      '],
  8: ['  o o o o  ', ' o       o ', '  o     o  ', '   o o o   ', 'o o     o o', ' o o   o o ', '  o o o o  '],
};
PIN_DIGITS[9] = [...PIN_DIGITS[6]].reverse().map((r) => [...r].reverse().join(''));
for (const [d, rows] of Object.entries(PIN_DIGITS)) rows.forEach((row, r) => {
  if (row.length !== 11) console.warn(`galton: pin digit ${d} row ${r} is ${row.length} wide`);
  for (let i = 0; i < row.length; i++) if (row[i] === 'o' && (i + r) % 2) console.warn(`galton: pin ${d} r${r} i${i} off lattice`);
});
const pinCells = {};
for (const [d, rows] of Object.entries(PIN_DIGITS)) {
  const cells = [];
  rows.forEach((row, r) => {
    for (let i = 0; i < row.length; i++) if (row[i] === 'o') cells.push([i * 2 + 1.5, r * PIN_DY + 1.5]);
  });
  pinCells[d] = cells;
}

// Pin centres for an hour (0-23, shown as 24-hour time).
const DIGIT_W = 23, DIGIT_GAP = 5;   // digit pitch 28 px = 14 half-steps: one lattice
const PIN_CACHE = {};
function hourPins(h) {
  if (PIN_CACHE[h]) return PIN_CACHE[h];
  const s = String(h);
  const w = s.length * DIGIT_W + (s.length - 1) * DIGIT_GAP;
  const x0 = Math.round(64 - w / 2);
  const out = [];
  [...s].forEach((ch, i) => {
    for (const [px, py] of pinCells[ch]) out.push([x0 + i * (DIGIT_W + DIGIT_GAP) + px, PIN_Y0 + py - 1.5]);
  });
  return (PIN_CACHE[h] = out);
}

// ---------------------------------------------------------------- sprites
const BALL = sprite(`
  .###.
  #.###
  #####
  #####
  .###.
`);
const PIN = sprite(`
  ###
  ###
  ###
`);

// ---------------------------------------------------------------- physics
// One ball from the dispenser: through the pins, onto the gutter, rolling
// down to the drain. Records when it rolls over each tube's flap.
const HIT2 = (R + PIN_R) ** 2;

function simulate(pins, x0, vx0) {
  let x = x0, y = NECK_Y, vx = vx0, vy = 18;
  const s = [];
  const cross = new Array(8).fill(null);
  let hits = 0, last = -1, roofT = -1, slow = 0, px = x;
  for (let step = 0; step < 3.4 / DT; step++) {
    if (step % SAMPLE === 0) s.push(x, y);
    px = x;
    vy += G * DT; x += vx * DT; y += vy * DT;
    if (y < 26) {
      for (let i = 0; i < pins.length; i++) {
        const dx = x - pins[i][0], dy = y - pins[i][1];
        const d2 = dx * dx + dy * dy;
        if (d2 >= HIT2) { if (last === i) last = -1; continue; }
        const d = Math.sqrt(d2) || 1e-6;
        let nx = dx / d, ny = dy / d;
        // Nothing balances on a pin: a dead-centre hit tips to one side.
        if (Math.abs(nx) < 0.12 && ny < 0) { nx = nx < 0 || (nx === 0 && pins[i][0] > 64) ? -0.12 : 0.12; ny = -Math.sqrt(1 - nx * nx); }
        const vn = vx * nx + vy * ny;
        if (vn < 0) {
          const tx = -ny, ty = nx, vt = (vx * tx + vy * ty) * 0.9;
          vx = -E_PIN * vn * nx + vt * tx; vy = -E_PIN * vn * ny + vt * ty;
          if (last !== i) hits++;
          last = i;
        }
        x = pins[i][0] + nx * (R + PIN_R); y = pins[i][1] + ny * (R + PIN_R);
      }
      // A ball wedged on a ledge of the numeral: not a path we use.
      slow = roofT < 0 && vx * vx + vy * vy < 36 ? slow + 1 : 0;
      if (slow > 0.2 / DT) return null;
    }
    for (const [a, b] of ROOF_SEGS) {
      const ex = b[0] - a[0], ey = b[1] - a[1];
      const u = clamp(((x - a[0]) * ex + (y - a[1]) * ey) / (ex * ex + ey * ey), 0, 1);
      const qx = a[0] + ex * u, qy = a[1] + ey * u;
      const dx = x - qx, dy = y - qy, d = Math.hypot(dx, dy);
      if (d < R && dy < 0) {
        const nx = dx / d, ny = dy / d, vn = vx * nx + vy * ny;
        if (vn < 0) {
          const tx = -ny, ty = nx, vt = (vx * tx + vy * ty) * 0.9995;
          vx = -E_ROOF * vn * nx + vt * tx; vy = -E_ROOF * vn * ny + vt * ty;
          if (roofT < 0) roofT = step * DT;
        }
        x = qx + nx * R; y = qy + ny * R;
      }
    }
    // Off the end of the gutter and down the drain chute, between its walls.
    if (roofT >= 0 && y > GUT.yi && x > CHUTE[0] - 4 && x < CHUTE[1] + 4) {
      if (x < CHUTE[0]) { x = CHUTE[0]; vx = Math.abs(vx) * 0.3; }
      if (x > CHUTE[1]) { x = CHUTE[1]; vx = -Math.abs(vx) * 0.3; }
    }
    // Rolling over a flap?
    if (roofT >= 0 && y > roofY(x) - R - 1.5) {
      for (let k = 0; k < 8; k++) {
        const c = tubeCX(k);
        if (!cross[k] && (px - c) * (x - c) <= 0) cross[k] = { t: step * DT, x: c, y, vy: Math.max(vy, 8) };
      }
    }
    if (x < -8 || x > 136) return null;
    if (y > 68) return { s, T: step * DT, roofT, hits, cross };
  }
  return null;
}

// Per hour: every drop the dispenser can make, with a little flick.
const LAYOUT = {};
function layout(h) {
  if (LAYOUT[h]) return LAYOUT[h];
  const pins = hourPins(h);
  const all = [];
  for (let i = 0; i <= 101; i++) {
    for (const vx of [-5, 5]) {
      const x0 = 26 + i * 0.75;
      const r = simulate(pins, x0, vx);
      if (!r || r.roofT < 0) continue;
      r.x0 = x0;
      all.push(r);
    }
  }
  const tubes = TX.map((_, k) => all.filter((r) => r.cross[k]));
  const lively = all.filter((r) => r.hits >= 2 && r.T < 3);
  const trickle = lively.length >= 12 ? lively : all.filter((r) => r.T < 3);
  return (LAYOUT[h] = { pins, tubes, trickle });
}

// All 24 boards are worked out once, at load, so no frame
// ever pays for a search.
for (let h = 0; h < 24; h++) layout(h);

function hash(a) {
  let x = (a | 0) ^ 0x9e3779b9;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return (x ^ (x >>> 16)) >>> 0;
}

// Position along a cached path at time tau after launch.
function pathAt(p, tau) {
  const f = tau / (DT * SAMPLE);
  const n = p.s.length / 2;
  const i = Math.min(n - 1, Math.floor(f));
  const j = Math.min(n - 1, i + 1), u = clamp(f - i, 0, 1);
  return [p.s[i * 2] + (p.s[j * 2] - p.s[i * 2]) * u, p.s[i * 2 + 1] + (p.s[j * 2 + 1] - p.s[i * 2 + 1]) * u];
}

// How many moments two flights (path p from L, path q from M) come closer
// than a ball's width: balls in the same air should not merge into blobs.
function closeCalls(p, L, q, M) {
  const t0 = Math.max(L, M) + 0.12, t1 = Math.min(L + p.T, M + q.T);
  let n = 0;
  for (let t = t0; t < t1; t += 0.07) {
    const [ax, ay] = pathAt(p, t - L), [bx, by] = pathAt(q, t - M);
    if ((ax - bx) ** 2 + (ay - by) ** 2 < 22) n++;
  }
  return n;
}

// The trickle ball dropped at second s of minute `key`.
const trickleAt = (lay, key, s) => lay.trickle[hash(key * 61 + s) % lay.trickle.length];
const LAST_TRICKLE = 56;

// --------------------------------------------------------------- the turn
// Everything that happens in the seconds after a minute turns, as a plan:
// which tubes drain, which balls are dropped where and when, when shelves
// slide in and when each flap opens to catch its ball.
const FLIP_T = 0.6;            // hour: the pin board turns over
const CAR_SPEED = 260;         // dispenser travel, px/s
const FLAP_PRE = 0.12, FLAP_POST = 0.07;
const PLAN = { key: null, plan: null };

function shelvesOf(col) {
  const out = [];
  for (let r = 0; r < ROWS - 1; r++) if (col[r] && !col[r + 1]) out.push(r);
  return out;
}

function makePlan(oldM, newM, h, isHour, key, startX) {
  const lay = layout(h);
  // On the hour the old minutes hold on until the board is half over.
  const d0 = isHour ? 0.28 : 0;
  const tubes = [];
  for (let k = 0; k < 8; k++) {
    const o = tubeCol(oldM, k), n = tubeCol(newM, k);
    let top = o.indexOf(true); if (top < 0) top = ROWS;
    let mode = 'same';
    if (o.some((v, r) => v !== n[r])) {
      mode = 'drain';
      if (n.every((v, r) => r < top || v === o[r])) mode = 'add';
    }
    const t = { k, o, n, mode, top, balls: [], shelfT: {}, gateClose: 0 };
    if (mode === 'drain') {
      t.d0 = d0;
      t.gateClose = d0 + 0.42;
      // Old balls: each falls when what holds it goes (floor first, then shelves, bottom up).
      const oldShelves = shelvesOf(o).reverse();
      t.oldBalls = [];
      for (let r = 0; r < ROWS; r++) {
        if (!o[r]) continue;
        let b = r; while (b < ROWS - 1 && o[b + 1]) b++;
        const start = d0 + (b === ROWS - 1 ? 0 : 0.06 + 0.05 * oldShelves.indexOf(b));
        t.oldBalls.push({ r, start });
      }
      t.oldShelves = oldShelves.map((r, i) => ({ r, off: d0 + 0.06 + 0.05 * i }));
    }
    tubes.push(t);
  }
  // The cells to pour, bottom row first, outer tubes first on each side.
  const cells = [];
  for (let r = ROWS - 1; r >= 0; r--) {
    const ks = [];
    for (const t of tubes) {
      if (t.mode === 'same' || !t.n[r]) continue;
      if (t.mode === 'add' && r >= t.top) continue;
      ks.push(t.k);
    }
    ks.sort((a, b) => Math.abs(tubeCX(b) - 64) - Math.abs(tubeCX(a) - 64));
    for (const k of ks) cells.push([k, r]);
  }
  const spacing = isHour ? 0.045 : 0.07;
  let prevL = isHour ? FLIP_T - 0.3 : -0.02, curX = startX;
  const launches = [];
  const placed = [];        // every ball so far: { k, L, p, A }
  const lastA = {};
  const settleBelow = (t, r) => {
    let m = t.mode === 'drain' ? t.gateClose : 0.1;
    for (const b of t.balls) if (b.r > r) m = Math.max(m, b.settle);
    return m;
  };
  // Would a ball with path p, launched at L into tube k, clash with a flap?
  const clash = (p, L, k) => {
    const A = L + p.cross[k].t;
    for (const b of placed) {
      // It must not roll over another ball's open flap...
      const c = p.cross[b.k];
      if (c && b.k !== k && L + c.t > b.A - FLAP_PRE - 0.02 && L + c.t < b.A + FLAP_POST + 0.02) return true;
      // ...nor may another ball roll over ours while it is open.
      const c2 = b.p.cross[k];
      if (c2 && b.k !== k && b.L + c2.t > A - FLAP_PRE - 0.02 && b.L + c2.t < A + FLAP_POST + 0.02) return true;
      if (b.k === k && Math.abs(b.A - A) < 0.1) return true;
    }
    return false;
  };
  let end = 0;
  cells.forEach(([k, r], i) => {
    const t = tubes[k];
    const list = lay.tubes[k];
    if (!list.length) return; // no path to this tube for this hour (checked: never)
    let earliest = t.mode === 'drain' ? t.gateClose + 0.03 : 0.15;
    // The ball before it in this tube must have fallen a ball's height first.
    if (lastA[k] !== undefined) earliest = Math.max(earliest, lastA[k] + 0.15);
    // A shelf under this ball must be in first.
    if (r < ROWS - 1 && !t.n[r + 1]) {
      const ins = settleBelow(t, r);
      t.shelfT[r] = ins;
      earliest = Math.max(earliest, ins + 0.12);
    }
    let best = null, bestCost = Infinity, bestL = 0;
    const tries = Math.min(10, list.length);
    for (let j = 0; j < tries; j++) {
      const p = list[hash(key * 131 + i * 977 + j) % list.length];
      const travel = Math.abs(p.x0 - curX) / CAR_SPEED + 0.04;
      let L = Math.max(prevL + (i ? spacing : 0), prevL + travel, earliest - p.cross[k].t);
      let n = 0;
      while (clash(p, L, k) && n++ < 80) L += 0.025;
      if (n >= 80) continue;
      let near = 0;
      for (const b of placed) if (b.A > L) near += closeCalls({ ...p, T: p.cross[k].t }, L, { ...b.p, T: b.A - b.L }, b.L);
      const cost = L * 0.6 + (L + p.cross[k].t) + (p.hits >= 2 ? 0 : p.hits === 1 ? 0.05 : 0.15) + near * 0.08;
      if (cost < bestCost) { bestCost = cost; best = p; bestL = L; }
    }
    if (!best) return;
    const L = bestL, c = best.cross[k], A = L + c.t;
    const fall = (-c.vy + Math.sqrt(c.vy * c.vy + 2 * G * Math.max(0, restCY(r) - c.y))) / G;
    const b = { k, r, p: best, L, A, settle: A + fall, cy: c.y, vy: c.vy };
    // The shelf pins push in just before their ball comes down the tube.
    if (t.shelfT[r] !== undefined) t.shelfT[r] = Math.max(t.shelfT[r], A - 0.12);
    t.balls.push(b);
    placed.push(b);
    launches.push({ L, x: best.x0 });
    lastA[k] = A;
    prevL = L; curX = best.x0;
    end = Math.max(end, b.settle + 0.15);
  });
  // The hour's finale: the dispenser sweeps the rail and the rest of its
  // balls rain through the new hour and pour down the drain.
  const rain = [];
  if (isHour) {
    // Must not roll over any flap while it is open.
    const free = (p, L) => placed.every((b) => {
      const c = p.cross[b.k];
      return !c || L + c.t < b.A - FLAP_PRE - 0.03 || L + c.t > b.A + FLAP_POST + 0.03;
    });
    // The dispenser sweeps the whole rail and back, dropping as it goes.
    const byX = [...lay.trickle].sort((p, q) => p.x0 - q.x0);
    const sweep = curX < 64 ? [...byX, ...byX.slice().reverse()] : [...byX.slice().reverse(), ...byX];
    const step = Math.max(1, Math.floor(sweep.length / 22));
    let L = Math.max(FLIP_T - 0.1, prevL + 0.03), x = curX;
    for (let i = 0; i < sweep.length && rain.length < 18; i += Math.max(1, step >> 1)) {
      const p = sweep[i];
      const Lp = Math.max(L + 0.085, L + Math.abs(p.x0 - x) / CAR_SPEED);
      if (!free(p, Lp)) continue;
      if (placed.some((b) => closeCalls(p, Lp, { ...b.p, T: b.A - b.L }, b.L))) continue;
      if (rain.reduce((n, q) => n + closeCalls(p, Lp, q.p, q.L), 0) > 1) continue;
      rain.push({ p, L: Lp });
      launches.push({ L: Lp, x: p.x0 });
      L = Lp; x = p.x0;
      end = Math.max(end, Lp + p.T);
    }
  }
  end = Math.max(end, 1);
  // Trickle for the rest of the minute, then the dispenser's whole itinerary.
  const trickles = [];
  for (let s = Math.ceil(end + 0.3); s <= LAST_TRICKLE; s++) {
    const p = trickleAt(lay, key, s);
    trickles.push({ s, p });
    launches.push({ L: s, x: p.x0 });
  }
  launches.push({ L: -60 + LAST_TRICKLE, x: startX });
  launches.sort((a, b) => a.L - b.L);
  return { tubes, rain, trickles, end, launches, placed };
}

function planFor(f, prev, key) {
  if (PLAN.key === key) return PLAN.plan;
  const startX = trickleAt(layout(prev.h), key - 1, LAST_TRICKLE).x0;
  PLAN.key = key;
  PLAN.plan = makePlan(prev.m, f.m, f.h, f.m === 0, key, startX);
  return PLAN.plan;
}

// Where the dispenser is, and how long since it let a ball go.
function carriage(plan, sec) {
  const ls = plan.launches;
  let i = 0;
  while (i + 1 < ls.length && ls[i + 1].L <= sec) i++;
  const a = ls[i], b = ls[i + 1];
  let x = a.x;
  if (b) {
    const t0 = a.L + 0.05, t1 = b.L - 0.03;
    const u = t1 > t0 ? clamp((sec - t0) / (t1 - t0), 0, 1) : (sec >= t1 ? 1 : 0);
    x = a.x + (b.x - a.x) * ease.inOutCubic(u);
  }
  return [x, sec - a.L];
}

// ---------------------------------------------------------------- drawing
function ball(g, cx, cy, ox, oy) {
  g.blit(BALL, Math.round(cx - 2.5) + ox, Math.round(cy - 2.5) + oy);
}

function drawPins(g, pins, ox, oy) {
  for (const [x, y] of pins) g.blit(PIN, Math.round(x - 1.5) + ox, Math.round(y - 1.5) + oy);
}

// The pin board turning over about a horizontal axis, with perspective.
function drawFlip(g, oldPins, newPins, u, ox, oy) {
  const th = Math.PI * ease.inOutCubic(u);
  const cy = PIN_Y0 + 3 * PIN_DY, D = 70;
  const c = Math.cos(th), sn = Math.sin(th);
  const proj = (x, v) => { const z = v * sn, k = D / (D - z); return [64 + (x - 64) * k, cy + v * c * k, k]; };
  const front = c >= 0;
  const pins = front ? oldPins : newPins;
  const hgt = Math.max(1, Math.round(3 * Math.abs(c)));
  for (const [x, y] of pins) {
    const v = front ? y - cy : cy - y;
    const [px, py, k] = proj(x, v);
    const w = Math.max(2, Math.round(3 * k));
    g.fillRect(Math.round(px - w / 2) + ox, Math.round(py - hgt / 2) + oy, w, hgt);
  }
  // The board's edge, so the turn reads as a plate in space.
  const x0 = 35, x1 = 93, v0 = -11.5, v1 = 11.5;
  const q = [proj(x0, v0), proj(x1, v0), proj(x1, v1), proj(x0, v1)];
  if (Math.abs(c) < 0.97) {
    for (let i = 0; i < 4; i++) {
      const a = q[i], b = q[(i + 1) % 4];
      g.line(Math.round(a[0]) + ox, Math.round(a[1]) + oy, Math.round(b[0]) + ox, Math.round(b[1]) + oy);
    }
  }
}

// The gutter, with a flap swung down under each tube that is catching.
function drawRoof(g, openness, ox, oy) {
  for (const side of [0, 1]) {
    const x0 = side ? 128 - GUT_L[GUT_L.length - 1][0] : GUT_L[0][0];
    const x1 = side ? 128 - GUT_L[0][0] : GUT_L[GUT_L.length - 1][0];
    for (let x = Math.round(x0); x < Math.round(x1); x++) {
      const xc = x + 0.5;
      let gap = false;
      for (let k = 0; k < 8; k++) if (openness[k] > 0.02 && Math.abs(xc - tubeCX(k)) < 3 * openness[k]) gap = true;
      if (!gap) g.pixel(x + ox, Math.round(roofY(xc) - 0.5) + oy);
    }
  }
  for (let k = 0; k < 8; k++) {
    const o = openness[k];
    if (o <= 0.02) continue;
    const xl = Math.round(tubeCX(k) - 3 * o - 0.5);   // the flap hangs from its hinge
    g.vline(xl + ox, Math.round(roofY(xl)) + oy, Math.max(1, Math.round(3 * o)));
  }
}

function drawHopper(g, cx, sinceLaunch, ox, oy) {
  const x = Math.round(cx);
  g.line(x - 5 + ox, 0 + oy, x - 4 + ox, 2 + oy);    // the dispenser's funnel
  g.line(x + 4 + ox, 0 + oy, x + 3 + ox, 2 + oy);
  // The next ball drops into the funnel after a release.
  const u = clamp((sinceLaunch - 0.05) / 0.16, 0, 1);
  if (sinceLaunch > 0.05) ball(g, cx, -5 + 4 * ease.outBounce(u), ox, oy);
}

// Shelves are clear glass: a floating ball simply rests on one. Drawing
// them added only clutter at 1x.
function drawShelf() {}

function drawTubeStatic(g, k, col, ox, oy) {
  col.forEach((on, r) => { if (on) ball(g, tubeCX(k), restCY(r), ox, oy); });
  for (const r of shelvesOf(col)) drawShelf(g, k, r, 1, ox, oy);
}

function drawTubes(g, gate, ox, oy) {
  // The glass, kept sparse so the balls are the brightest thing: a short lip
  // at the top of every wall, a foot at the bottom, and the floor of each
  // tube, whose trapdoor swings away when its gate opens.
  for (const x of WALLS) {
    g.vline(x + ox, TY + oy, 2);
    g.vline(x + ox, FLOOR_Y - 2 + oy, 2);
  }
  for (let k = 0; k < 8; k++) {
    const shut = Math.round(7 * (1 - gate[k]));
    if (shut > 0) g.hline(TX[k] - 1 + ox, FLOOR_Y + oy, shut);
  }
}

// ---------------------------------------------------------------- specimen
function specimen(g, t) {
  if (t >= 0.95) {
    for (let d = 0; d < 10; d++) {
      const x = 1 + (d % 5) * 25.5, y = 4 + Math.floor(d / 5) * 32;
      for (const [px, py] of pinCells[d]) g.blit(PIN, Math.round(x + px - 1.5), Math.round(y + py - 1.5));
    }
    return;
  }
  const first = t < 0.45 ? 0 : 6;
  for (let d = first; d < Math.min(10, first + 6); d++) {
    const i = d - first, x = 5 + (i % 3) * 41, y = Math.floor(i / 3) * 32;
    for (let k = 0; k <= 4; k++) g.vline(x + k * 8, y, 31);
    g.hline(x, y + 30, 33);
    for (let k = 0; k < 4; k++) COLS[d][k].forEach((on, r) => { if (on) g.blit(BALL, x + 2 + k * 8, y + r * 5); });
  }
}

export default {
  name: 'Quincunx',
  blurb: 'A Galton board that tells the time: the pins are set in the shape of the hour (24 h) and the balls that bounce through them stack into the minute in glass tubes; every second a ball rattles through, each minute only the tubes that differ drain and refill ball by ball, and on the hour the pin board flips over in a downpour.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  frame(g, ctx) {
    if (SPECIMEN) return specimen(g, ctx.t);
    const { date, fields: f, oled, night } = ctx;
    oled.contrast(0xcf + (0x20 - 0xcf) * night);
    const ox = orbit(date, 1)[0], oy = 0;   // every row is used, so the walk is sideways
    const sec = f.sec;
    const prev = previousMinute(date);
    const plan = planFor(f, prev, f.minuteKey);
    const inTurn = sec < plan.end + 0.05;
    const lay = layout(f.h);

    // --- pins (the hour)
    if (f.m === 0 && sec < FLIP_T && prev.h !== f.h) drawFlip(g, hourPins(prev.h), lay.pins, sec / FLIP_T, ox, oy);
    else drawPins(g, lay.pins, ox, oy);

    // --- trickle: one ball a second, outside the turn
    for (const { s: s0, p } of plan.trickles) {
      const tau = sec - s0;
      if (tau >= 0 && tau < p.T) { const [x, y] = pathAt(p, tau); ball(g, x, y, ox, oy); }
    }
    // The tail of last minute's trickle.
    const pl = trickleAt(layout(prev.h), f.minuteKey - 1, LAST_TRICKLE), tl = sec + 60 - LAST_TRICKLE;
    if (tl < pl.T) { const [x, y] = pathAt(pl, tl); ball(g, x, y, ox, oy); }

    // --- tubes
    const flaps = new Array(8).fill(0), gates = new Array(8).fill(0);
    for (const t of plan.tubes) {
      if (!inTurn || t.mode === 'same') { drawTubeStatic(g, t.k, t.n, ox, oy); continue; }
      if (t.mode === 'drain') {
        gates[t.k] = ease.outQuad(clamp((sec - t.d0) / 0.08, 0, 1)) * (1 - ease.inOutQuad(clamp((sec - t.gateClose + 0.1) / 0.1, 0, 1)));
        for (const b of t.oldBalls) {
          const tau = Math.max(0, sec - b.start);
          const y = restCY(b.r) + 0.5 * G_DRAIN * tau * tau;
          if (y < 70) ball(g, tubeCX(t.k), y, ox, oy);
        }
        for (const s of t.oldShelves) if (sec < s.off) drawShelf(g, t.k, s.r, 1, ox, oy);
      } else {
        for (let r = t.top; r < ROWS; r++) if (t.o[r]) ball(g, tubeCX(t.k), restCY(r), ox, oy);
        for (const r of shelvesOf(t.o)) drawShelf(g, t.k, r, 1, ox, oy);
      }
      // A shelf shows only once its ball sits on it: bare pins mid-air read as noise.
      for (const b of t.balls) if (t.shelfT[b.r] !== undefined && sec >= b.settle) drawShelf(g, t.k, b.r, 1, ox, oy);
      for (const b of t.balls) {
        if (sec < b.L) continue;
        if (sec < b.A) { const [x, y] = pathAt(b.p, sec - b.L); ball(g, x, y, ox, oy); continue; }
        const tau = sec - b.A;
        let y = Math.min(restCY(b.r), b.cy + b.vy * tau + 0.5 * G * tau * tau);
        const x = tubeCX(t.k);
        if (sec > b.settle) { const d = sec - b.settle; y -= 1.4 * Math.max(0, Math.sin(d * 25)) * Math.exp(-d * 18); }
        ball(g, x, y, ox, oy);
      }
    }
    if (inTurn) {
      for (const b of plan.placed) {
        const u = Math.min(clamp((sec - b.A + FLAP_PRE) / 0.06, 0, 1), 1 - clamp((sec - b.A - FLAP_POST + 0.06) / 0.06, 0, 1));
        flaps[b.k] = Math.max(flaps[b.k], ease.inOutQuad(u));
      }
      for (const q of plan.rain) {
        const tau = sec - q.L;
        if (tau < 0 || tau >= q.p.T) continue;
        const [x, y] = pathAt(q.p, tau);
        ball(g, x, y, ox, oy);
      }
    }
    drawRoof(g, flaps, ox, oy);
    drawTubes(g, gates, ox, oy);

    // --- the dispenser
    const [cx, since] = carriage(plan, sec);
    drawHopper(g, cx, since, ox, oy);
  },
};
