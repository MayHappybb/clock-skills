// Orrery — the solar system on the desk, seen from a little above.
//
// The sun is the anchor: a round disc eight dots tall in the middle of the
// glass, across both gaps, with a corona of short rays that flare one at a
// time. Four planets go round it, told apart by size: Mercury a dot, the
// Earth 2x2 with its Moon swinging to and fro across it, Jupiter a 4x3
// disc, Saturn a ball with its ring tilted across it. Periods follow Kepler
// (Mercury 20 s, Saturn four minutes), so the arrangement never repeats in
// an evening. Mercury and the Earth are on flat orbits that cross the sun:
// behind it they are hidden, in front of it a transit is one dark dot inside
// the disc. Jupiter and Saturn pass above and below it. Nothing ever touches
// the disc: any dot next to it is dropped, so a planet going behind is cut
// off a dot short of the edge. Every 260 s a comet falls in on a parabola,
// whips round the sun with its tail streaming away from it, and leaves.
//
// Positions are worked out in millimetres at the module's real dot centres
// (sim/js/panel.js MODULE), so the orbits and the sun are true shapes.
//
// The budget: the sun is four tiles, and every planet is kept inside one
// cell (Mercury, the Earth and the Moon lose a column to a gap rather than
// spill; Jupiter and Saturn hop the gap whole), so the sun and the planets
// never pass eight, and a body in the sun's cells costs nothing. The comet's
// head, the Moon, and the tail a cell at a time take what is left; a head or
// tail cell with no slot becomes the ROM glyph most like it. The star that
// glints now and then is ROM '+': a steady ROM star would be a 2x2 block,
// the same as the Earth.

import { MODULE } from '../js/panel.js';
import { noise, smoothNoise } from '../js/kit.js';

const FPS = 8;
const EPOCH = Date.UTC(2026, 0, 1);
const PX = MODULE.dotPitchX, PY = MODULE.dotPitchY;
const CX = MODULE.charPitchX, CY = MODULE.charPitchY;

// Dots are addressed as (d, y): d the real dot column, 0-79, five per cell,
// and y the dot row, 0-15. These are their centres in mm.
const mmX = (d) => Math.floor(d / 5) * CX + (d % 5) * PX;
const mmY = (y) => (y >> 3) * CY + (y & 7) * PY;
const SEAM = (7 * PY + CY) / 2;          // the middle of the gap between the rows

/** Nearest real dot column to x mm. */
function dcol(x) {
  const cell = Math.floor(x / CX), rel = x - cell * CX;
  return rel > (4 * PX + CX) / 2 ? (cell + 1) * 5 : cell * 5 + Math.min(4, Math.max(0, Math.round(rel / PX)));
}
/** Nearest dot row to y mm. */
const drow = (y) => (y < SEAM ? Math.min(7, Math.max(0, Math.round(y / PY)))
  : 8 + Math.min(7, Math.max(0, Math.round((y - CY) / PY))));
/**
 * Nearest dot column to x mm counting the gap as a column, as `pong` places
 * its ball: null when x falls in the gap. A body one or two dots wide placed
 * this way loses a column to the gap rather than spilling into a second cell.
 */
function gapcol(x) {
  const g = Math.round(x / (CX / 6));
  return g % 6 === 5 ? null : Math.floor(g / 6) * 5 + (g % 6);
}
const key = (d, y) => d * 16 + y;
const cellOf = (d, y) => (y >> 3) * 16 + Math.floor(d / 5);

// The sun straddles both gaps, centred on the one between cells 7 and 8 and
// on the one between the rows, so it is a 2x2 block of cells, four tiles.
// It is a 2.95 mm circle sampled at the real dot centres: eight rows tall
// and eight dots wide, with the gaps as a cross through its middle.
const SUN = { x: (mmX(39) + mmX(40)) / 2, y: SEAM, r: 2.95 };
const DISC = new Set(), HALO = new Set();
for (let d = 35; d < 45; d++)
  for (let y = 0; y < 16; y++)
    if ((mmX(d) - SUN.x) ** 2 + (mmY(y) - SUN.y) ** 2 <= SUN.r ** 2) DISC.add(key(d, y));
for (const k of DISC)
  for (let dd = -1; dd <= 1; dd++) for (let dy = -1; dy <= 1; dy++) HALO.add(k + dd * 16 + dy);
/** In the disc with all four neighbours: a dark dot here reads as a hole, not a notch. */
const interior = (d, y) => [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].every(([a, b]) => DISC.has(key(d + a, y + b)));
// The corona: six rays, inner dots first, all a clear dot off the disc and
// inside the sun's own four cells, so they cost nothing. The vertical rays
// are pairs either side of the gap, which is the sun's axis. Rays come and go
// one at a time; all six at once made the sun a beetle with legs.
const RAYS = [
  [[[39, 2], [40, 2]], [[39, 1], [40, 1]]], [[[39, 13], [40, 13]], [[39, 14], [40, 14]]],
  [[[43, 3]], [[44, 2]]], [[[36, 3]], [[35, 2]]], [[[43, 12]], [[44, 13]]], [[[36, 12]], [[35, 13]]],
];

// Sprites, drawn as seen: '#' lit. Sizes tell the planets apart: Mercury a
// dot, the Earth 2x2 with its Moon, Jupiter a 4x3 disc (round, at this dot
// aspect), Saturn a ball with its ring tilted across it.
const SPRITE = {
  mercury: ['#'],
  earth: ['##', '##'],
  jupiter: ['.##.', '####', '.##.'],
  saturn: ['...##', '.###.', '.###.', '##...'],
};

// Semi-axes a, b (mm), phase at the epoch. Periods follow Kepler, a^1.5.
// Mercury and the Earth are on flat orbits that cross the sun's face, so
// they transit; Jupiter and Saturn swing wide enough to pass above and below
// it, a dot clear. Venus was cut: a fifth body crowded the inner orbits.
const PLANETS = [
  { name: 'mercury', a: 5.2, b: 0.6, phase: 0.05 },
  { name: 'earth', a: 10.5, b: 1.25, phase: 0.62 },
  { name: 'jupiter', a: 17.0, b: 4.75, phase: 0.71 },
  { name: 'saturn', a: 24.5, b: 4.5, phase: 0.13 },
].map((p) => ({ ...p, P: 20 * (p.a / 5.2) ** 1.5 }));

const MOON = { r: 1.6, P: 6.5 };          // mm from the Earth, seconds a lap

// The comet: a parabola round the sun, one pass in every window. Speed at
// distance r is sqrt(2 GM / r), so it creeps in from the edge and whips
// round the sun (Barker's equation gives the time).
const COMET = { window: 260, q: 4.4, GM: 9 };

/** Comet position in mm, or null, at time T. */
function comet(T) {
  const k = Math.floor(T / COMET.window), dt = T - (k + 0.5) * COMET.window;
  // Solve t = sqrt(2q^3/GM) (D + D^3/3) for D = tan(nu/2), by bisection.
  const c = Math.sqrt((2 * COMET.q ** 3) / COMET.GM);
  let lo = -40, hi = 40;
  for (let i = 0; i < 50; i++) { const mid = (lo + hi) / 2; if (c * (mid + mid ** 3 / 3) < dt) lo = mid; else hi = mid; }
  const D = (lo + hi) / 2, nu = 2 * Math.atan(D), r = COMET.q * (1 + D * D);
  if (r > 70) return null;
  // Each pass comes in at its own angle, and half of them go the other way
  // round. The axis is kept within 30 degrees of the line of the glass, so
  // it comes in from the side, not from above, where it would cross in a second.
  const psi = (noise(k, 11) - 0.5) * (Math.PI / 3) + (noise(k, 13) < 0.5 ? 0 : Math.PI);
  const dir = noise(k, 12) < 0.5 ? 1 : -1;
  const u = r * Math.cos(dir * nu + psi), v = r * Math.sin(dir * nu + psi);
  return { x: SUN.x + u, y: SUN.y - v * 0.3, far: v > 0, r };
}

/** Planet centre in mm and whether it is on the far side, at time T. */
function orbit(p, T) {
  const th = 2 * Math.PI * (T / p.P + p.phase);
  return { x: SUN.x + p.a * Math.cos(th), y: SUN.y - p.b * Math.sin(th), far: Math.sin(th) > 0 };
}

/**
 * The dots of a sprite centred near (x, y) mm, inside one cell: kept in the
 * row it is mostly in, and across, either placed with `gapcol` (one or two
 * dots wide) or snapped to the nearest place it fits whole in one cell. A
 * snapped Jupiter has two places in each cell and hops the gap between; a
 * Jupiter laid across the gap lost a column and read as two bars.
 */
function place(sprite, x, y) {
  const art = SPRITE[sprite], h = art.length, w = art[0].length;
  let top = drow(y) - ((h - 1) >> 1);
  if (top < 8 && top + h > 8) top = y < SEAM ? 8 - h : 8;
  top = Math.max(0, Math.min(16 - h, top));
  let at;
  if (w <= 2) {
    at = (c) => gapcol(x + (c - (w - 1) / 2) * PX);
  } else {
    let best = null;
    for (let cell = Math.floor(x / CX) - 1; cell <= Math.floor(x / CX) + 1; cell++)
      for (let o = 0; o <= 5 - w; o++) {
        const err = Math.abs(cell * CX + (o + (w - 1) / 2) * PX - x);
        if (cell >= 0 && cell < 16 && (!best || err < best.err)) best = { err, d0: cell * 5 + o };
      }
    at = (c) => (best ? best.d0 + c : null);
  }
  const dots = [];
  art.forEach((line, r) => [...line].forEach((ch, c) => {
    const d = at(c);
    if (ch === '#' && d !== null && d >= 0 && d < 80) dots.push([d, top + r]);
  }));
  return { dots, top };
}

/**
 * What a body puts on the glass. In front of the sun with its centre well
 * inside the disc it is a transit: one dark dot. Otherwise its dots, less any
 * on the disc or touching it, so the sun's edge is never broken; going
 * behind the sun, a body is cut off a dot short of it.
 */
function look(body, dots) {
  if (!body.far) {
    const d = dcol(body.x), y = drow(body.y);
    if (interior(d, y)) return [[d, y, false]];
  }
  return dots.filter(([d, y]) => !HALO.has(key(d, y))).map(([d, y]) => [d, y, true]);
}

// Cells where a star can glint. A steady ROM star is a 2x2 block, the same
// as the Earth, so the sky is left dark and a star only shows when it flashes.
const STARS = [[0, 0], [13, 0], [2, 1], [15, 1], [5, 0], [11, 1]];
/** The frame being built: ink per cell, and ROM codes under it. */
class Sky {
  constructor() { this.ink = new Map(); this.rom = [Array(16).fill(0x20), Array(16).fill(0x20)]; }
  clone() { const s = new Sky(); this.ink.forEach((v, k) => s.ink.set(k, v.slice())); s.rom = this.rom; return s; }
  set(d, y, on) {
    if (d < 0 || d > 79 || y < 0 || y > 15) return;
    const k = cellOf(d, y), rows = this.ink.get(k) ?? Array(8).fill(0);
    if (on) rows[y & 7] |= 0x10 >> (d % 5); else rows[y & 7] &= ~(0x10 >> (d % 5));
    this.ink.set(k, rows);
  }
  tiles() {
    const set = new Set();
    this.ink.forEach((rows) => { if (rows.some((b) => b)) set.add(rows.join()); });
    return set.size;
  }
  /** ROM `code` in the cell holding dot (d, y), if nothing is drawn there. */
  fall(d, y, code) {
    const k = cellOf(d, y);
    if (d >= 0 && d < 80 && !this.ink.has(k) && this.rom[k >> 4][k & 15] === 0x20) this.rom[k >> 4][k & 15] = code;
  }
}

/** The sky with marks [d, y, on] added, or null if it would need a ninth tile. */
function addMarks(sky, marks) {
  const next = sky.clone();
  for (const [d, y, on] of marks) next.set(d, y, on);
  return next.tiles() <= 8 ? next : null;
}

const TAIL_ROM = [0x2d, 0x5f, 0x2f, 0x60, 0xa4, 0x2e, 0xa5, 0x27, 0x2c];

/** The ROM glyph most like a few dots in one cell, or a space if none is. */
function romLike(lcd, dots) {
  const want = Array(8).fill(0);
  for (const [d, y] of dots) want[y & 7] |= 0x10 >> (d % 5);
  let best = 0x20, score = 0;
  for (const code of TAIL_ROM) {
    const have = lcd.glyph(code);
    let hit = 0, miss = 0;
    for (let r = 0; r < 8; r++) {
      for (let i = 0; i < 5; i++) {
        const w = want[r] >> (4 - i) & 1, h = have[r] >> (4 - i) & 1;
        // A dot counts as matched if the glyph lights it or a neighbour of it.
        const near = h || ((have[r - 1] ?? 0) >> (4 - i) & 1) || ((have[r + 1] ?? 0) >> (4 - i) & 1);
        if (w && near) hit++;
        if (h && !w) miss++;
      }
    }
    const sc = hit - 0.4 * miss;
    if (sc > score) { score = sc; best = code; }
  }
  return best;
}

export default {
  name: 'Orrery',
  blurb: 'The solar system at a tilt: Kepler periods, transits, a moon, and a comet every few minutes.',
  bus: 'i2c100',
  panel: 'blue',
  fps: FPS,

  frame(lcd, api, { date }) {
    // Seconds since a fixed epoch rather than since midnight, so the planets
    // do not jump back to their starting places once a day.
    const T = (date.getTime() - EPOCH) / 1000;
    let sky = new Sky();

    // Every eleven seconds or so one star glints, out past the orbits, for
    // under a second.
    const beat = Math.floor(T / 11), since = T - beat * 11 - noise(beat, 5) * 6;
    if (since >= 0 && since < 0.75) {
      const [col, row] = STARS[Math.floor(noise(beat, 6) * STARS.length)];
      sky.rom[row][col] = 0x2b;
    }

    // The sun. Then the planets: each is one cell at most, or in the sun's
    // cells, so the sun's four and the planets' four never pass eight.
    for (const k of DISC) sky.set(k >> 4, k & 15, true);
    let earth = null;
    const near = new Set();
    for (const p of PLANETS) {
      const o = orbit(p, T), { dots, top } = place(p.name, o.x, o.y);
      const marks = look(o, dots);
      sky = addMarks(sky, marks) ?? sky;
      for (const [d, y] of marks) for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) near.add(key(d + a, y + b));
      if (p.name === 'earth') earth = { ...o, top, dots };
    }

    // The corona: a ray flares, holds a second or two and dies down, and never
    // touches a planet passing over the sun.
    RAYS.forEach((ray, n) => {
      const v = smoothNoise(T * 0.7 + n * 5.7, n + 1);
      const len = v > 0.86 ? 2 : v > 0.6 ? 1 : 0;
      ray.slice(0, len).flat().forEach(([d, y]) => { if (!near.has(key(d, y))) sky.set(d, y, true); });
    });

    // The comet's head, or if the planets have every slot, a ROM dot.
    const cm = comet(T);
    if (cm && cm.y > -0.4 && cm.y < 11.2) {
      const d = gapcol(cm.x), y = drow(cm.y);
      if (d !== null) {
        const next = addMarks(sky, look(cm, [[d, y]]));
        if (next) sky = next; else if (!HALO.has(key(d, y))) sky.fall(d, y, 0xa5);
      }
    }

    // The Moon swings to and fro across the Earth, in its row: the orbit seen
    // edge on. If its own cell has no slot, it waits at the edge of the
    // Earth's cell.
    const ph = (2 * Math.PI * T) / MOON.P;
    const md = gapcol(earth.x + MOON.r * Math.cos(ph));
    const my = earth.top + (Math.sin(ph) > 0 ? 0 : 1);
    if (md !== null) {
      const moon = { x: earth.x + MOON.r * Math.cos(ph), y: mmY(my), far: earth.far };
      // Beside the Earth it would merge with it, so there it is in front of or
      // behind the Earth, and hidden.
      const byEarth = earth.dots.some(([d]) => Math.abs(d - md) <= 1);
      if (!byEarth) {
        let next = addMarks(sky, look(moon, [[md, my]]).filter(([, , on]) => on));
        if (!next && earth.dots.length) {
          const cell = Math.floor(earth.dots[0][0] / 5) * 5;
          const d = Math.max(cell, Math.min(cell + 4, md));
          if (!earth.dots.some(([ed]) => Math.abs(ed - d) <= 1)) next = addMarks(sky, look(moon, [[d, my]]).filter(([, , on]) => on));
        }
        if (next) sky = next;
      }
    }

    // The tail streams away from the sun, longest at perihelion: a line of
    // dots that thins out with distance. Each cell of it takes a tile if one
    // is left, nearest the head first, and otherwise the ROM glyph closest to
    // its piece of the line.
    if (cm) {
      const sd = Math.hypot(cm.x - SUN.x, cm.y - SUN.y) || 1;
      const ux = (cm.x - SUN.x) / sd, uy = (cm.y - SUN.y) / sd;
      const len = Math.min(13, 46 / cm.r);
      const cells = new Map();
      for (let s = 0.6, n = 0; s < len; s += 0.3, n++) {
        const f = s / len;
        if (f > 0.4 && n % 2) continue;
        if (f > 0.7 && n % 4) continue;
        const ym = cm.y + uy * s, d = gapcol(cm.x + ux * s), y = drow(ym);
        if (ym < -0.4 || ym > 11.2 || d === null || HALO.has(key(d, y))) continue;
        const k = cellOf(d, y);
        if (!cells.has(k)) cells.set(k, []);
        cells.get(k).push([d, y]);
      }
      for (const [k, dots] of cells) {
        const next = addMarks(sky, dots.map(([d, y]) => [d, y, true]));
        if (next) sky = next;
        else sky.fall(dots[0][0], dots[0][1], romLike(lcd, dots));
      }
    }

    // Write it: inked cells take tiles, everything else is ROM.
    const codes = new Map(); let n = 0;
    const out = sky.rom.map((r) => r.slice());
    sky.ink.forEach((rows, k) => {
      if (!rows.some((b) => b)) return;
      const id = rows.join();
      if (!codes.has(id)) { lcd.defineChar(n, rows); codes.set(id, n++); }
      out[k >> 4][k & 15] = codes.get(id);
    });
    out.forEach((row, r) => { lcd.setCursor(0, r); row.forEach((c) => lcd.data(c)); });
  },
};
