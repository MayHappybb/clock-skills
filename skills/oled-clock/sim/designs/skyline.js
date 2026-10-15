// Skyline — Lujiazui across the Huangpu, and the time is in the windows.
//
// Seen from the Bund at night: four towers stand on the far bank, each with
// a five-by-nine grid of office windows on its face, and the lit offices
// spell the time. Each tower wears the crown of a Lujiazui landmark (shapes
// taken from photographs from the Bund): a mast tower with its aviation
// light; Jin Mao's pagoda tiers and spire; the World Financial Center's
// tapering slab with the trapezoid "bottle opener" hole at the top; the
// Shanghai Tower's curved taper, spiral notch and sloping crown. Between
// the hours and the minutes stands the Oriental Pearl Tower, and its two
// pearls are the colon, blinking with the seconds. Behind them, low blocks with a scatter of lit
// windows that come and go; nothing ever flickers inside a digit's grid,
// and those windows are drawn as single pixels where the time's are full
// 3x2 panes, so the time always reads.
//
// The sky follows the real day in Shanghai: the sun rises and sets on its
// arc at the day's computed sunrise and sunset (latitude 31.2 N) and passes
// behind the towers; dusk and dawn get a dithered glow on the horizon; at
// night stars come out (drifting with the sky, so none burns in) and the
// moon crosses at the hour its phase gives it, shaded by that phase. The
// day sky stays black (light is wear on an OLED): the sun with its turning
// rays, a couple of drifting clouds and passing birds make it day.
//
// Life: cars' headlights along the Pudong riverside road; a ferry crossing
// the river with lit cabin windows and a wake; a plane's strobe at night;
// the whole far bank reflected in the water, broken into shimmering streaks.
//
// Minute turn: the offices empty and fill. From :58.4 the lights of a
// changing digit go out office by office in a random order (people leave
// when they leave, never a whole stroke at once); the grid is dark for a
// breath; from :00 the new digit's lights come on from the ground floor
// up, along each corridor, the way people arrive. A slot is only ever
// empty or part lit, never another digit. The hour: fireworks from barges
// on the river, a chrysanthemum of rays every second or so for 14 s (twenty
// at midnight). For the show the crowns dim to dotted outlines and their
// windows go dark, no spark ever lands on a digit's offices, each burst
// lights up the whole city for an instant (global contrast), the Pearl's
// spheres run their light show and the ferry sounds its horn in puffs.
//
// Pure function of the clock: sky from the time of day and date, traffic
// and boats from absolute time, the minute's window order and the
// fireworks from noise() of the minute key.
//
// Burn-in: the city walks a 2 px orbit and the Pearl its own, out of step;
// the Pearl's dotted columns and its lit spheres' dither move each minute;
// stars drift; window flicker moves; 23:00-07:00 the panel dims.

import { dither, noise, orbit, previousMinute, clamp } from '../js/kit.js';

const W = 128, H = 64;
const WATER = 50;                 // the embankment line; the river below it
const GRID_Y = 20;                // top of the digit windows
const PANE_W = 3, PANE_H = 2, PITCH_X = 4, PITCH_Y = 3;
const DAY = 0xcf, NIGHT = 0x20;

// ------------------------------------------------------------ the digits
// Five offices across, nine floors up. '#' a lit office; 'r' / 'l' an
// office lit only in its right or left two pixels (a curtain half drawn),
// which rounds the corners.
const GLYPHS = {
  0: ['r###l', '#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '#...#', 'r###l'],
  1: ['.r#..', 'r##..', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  2: ['r###l', '#...#', '....#', '...r#', '..r#.', '.r#..', 'r#...', '#....', '#####'],
  3: ['r###l', '#...#', '....#', '....#', '..##l', '....#', '....#', '#...#', 'r###l'],
  4: ['...#.', '..##.', '.#.#.', 'r..#.', '#..#.', '#####', '...#.', '...#.', '...#.'],
  5: ['#####', '#....', '#....', '####l', '....#', '....#', '....#', '#...#', 'r###l'],
  6: ['..r#l', '.r#..', 'r#...', '####l', '#...#', '#...#', '#...#', '#...#', 'r###l'],
  7: ['#####', '....#', '...r#', '...#.', '..r#.', '..#..', '.r#..', '.#...', '.#...'],
  8: ['r###l', '#...#', '#...#', '.###.', '#...#', '#...#', '#...#', '#...#', 'r###l'],
  9: ['r###l', '#...#', '#...#', '#...#', 'r####', '....#', '...r#', '..r#.', '###..'],
};

/** The offices of a digit as [col, row, kind], kind '#', 'l' or 'r'. */
const OFFICES = {};
for (const [d, rows] of Object.entries(GLYPHS)) {
  OFFICES[d] = [];
  rows.forEach((r, row) => [...r].forEach((ch, col) => { if (ch !== '.') OFFICES[d].push([col, row, ch]); }));
}

/** Light one office's pane at grid origin (gx, gy). */
function pane(g, gx, gy, col, row, kind) {
  const x = gx + col * PITCH_X, y = gy + row * PITCH_Y;
  const x0 = kind === 'r' ? 1 : 0, x1 = kind === 'l' ? 2 : PANE_W;
  for (let j = 0; j < PANE_H; j++) for (let i = x0; i < x1; i++) g.pixel(x + i, y + j, 1);
}

/**
 * The order people walk the floors: along each corridor, turning at the
 * end, floor after floor. `down` walks from the top floor; otherwise from
 * the ground floor up. Returns each office's place in the walk, 0..1.
 */
function walk(offices, down) {
  const key = ([c, r]) => {
    const floor = down ? r : 8 - r;
    return floor * 10 + (floor % 2 ? 4 - c : c);
  };
  const sorted = [...offices].sort((a, b) => key(a) - key(b));
  return new Map(sorted.map((o, i) => [o, sorted.length > 1 ? i / (sorted.length - 1) : 0]));
}
const WALK_IN = {};
for (let d = 0; d < 10; d++) WALK_IN[d] = walk(OFFICES[d], false);

const OUT_AT = 58.4, OUT_LEN = 1.2;    // lights out, room by room
const IN_AT = 0.05, IN_LEN = 0.9;      // lights on, ground floor up

// ------------------------------------------------------------ the towers
// x of each tower's left wall; 25 wide; the digit grid 3 in from the wall.
const TOWER_X = [3, 30, 74, 101];
const TW = 25;
const PEARL_X = 64.5;

/** Silhouette of tower i as polygons (canvas coordinates, before the orbit). */
function towerShape(i) {
  const x = TOWER_X[i], r = x + TW, c = x + TW / 2;
  const body = (top) => [[x, top], [r, top], [r, WATER], [x, WATER]];
  switch (i) {
    case 0: // a mast tower with a stepped crown
      return [body(15), [[x + 3, 12], [r - 3, 12], [r - 3, 15.5], [x + 3, 15.5]], [[c - 2, 9], [c + 2, 9], [c + 2, 12.5], [c - 2, 12.5]]];
    case 1: { // Jin Mao: tiers stepping in, each with a little flared cornice
      const tiers = [];
      let y = 18, k = 0;
      for (const [inset, h] of [[2.5, 4], [5.5, 3], [8, 3], [10, 2]]) {
        tiers.push([[x + inset - 1.5, y - h], [r - inset + 1.5, y - h], [r - inset + 1.5, y - h + 1], [r - inset, y - h + 1], [r - inset, y + 0.5], [x + inset, y + 0.5], [x + inset, y - h + 1], [x + inset - 1.5, y - h + 1]]);
        y -= h; k++;
      }
      return [body(18), ...tiers];
    }
    case 2: // SWFC: the slab tapers to a flat top
      { // the faces curve in to a narrow flat top
        const L = [], R = [];
        for (let y = 20; y >= 3; y--) { const u = (20 - y) / 17, k = 7.5 * u ** 1.4; L.push([x + k, y]); R.unshift([r - k, y]); }
        return [[[x, WATER], ...L, ...R, [r, WATER]]];
      }
    default: { // Shanghai Tower: a curved taper to a sloping crown
      const pts = [];
      for (let y = 19; y >= 4; y--) pts.push([c - halfShanghai(y), y]);
      const top = [[c - halfShanghai(4), 4], [c + halfShanghai(2), 2]];
      const right = [];
      for (let y = 3; y <= 19; y++) right.push([c + halfShanghai(y), y]);
      return [[[x, WATER], [x, 20], ...pts, ...top, ...right, [r, 20], [r, WATER]]];
    }
  }
}
/** Shanghai Tower's half-width at height y (above the grid it tapers). */
function halfShanghai(y) {
  const u = clamp((y - 0) / 20, 0, 1);
  return 5 + 7.5 * u ** 0.8;
}

const inPoly = (pts, px, py) => {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

/** The silhouette mask of all four towers, cached (it never changes shape). */
const TOWER_MASK = (() => {
  const m = new Uint8Array(W * H);
  for (let i = 0; i < 4; i++) {
    const polys = towerShape(i);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
      if (polys.some((p) => inPoly(p, x + 0.5, y + 0.5))) m[y * W + x] = i + 1;
  }
  // The SWFC's aperture: a trapezoid, wide at the top, under the top bar.
  const x = TOWER_X[2];
  for (let y = 5; y < 10; y++) {
    const half = 4.2 - (y - 5) * 0.55;
    for (let xx = Math.round(x + 12.5 - half); xx < Math.round(x + 12.5 + half); xx++) m[y * W + xx] = 0;
  }
  return m;
})();
const towerAt = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : TOWER_MASK[y * W + x]);

// ------------------------------------------------------------ the sky

const LAT = 31.23 * Math.PI / 180;
/** Sunrise and sunset in local hours for Shanghai on `date` (no refraction fuss). */
function sunTimes(date) {
  const start = new Date(date.getFullYear(), 0, 1);
  const doy = (date - start) / 86400000;
  const decl = (-23.44 * Math.cos((2 * Math.PI * (doy + 10)) / 365) * Math.PI) / 180;
  const cosH = clamp(-Math.tan(LAT) * Math.tan(decl), -1, 1);
  const half = (Math.acos(cosH) * 180) / Math.PI / 15;
  const noon = 11.9;   // 121.5 E on UTC+8
  return [noon - half, noon + half];
}

/** The moon's age as a fraction of the synodic month (0 new, 0.5 full). */
function moonPhase(date) {
  const NEW = Date.UTC(2000, 0, 6, 18, 14);
  const p = ((date.getTime() - NEW) / 86400000 / 29.530588) % 1;
  return p < 0 ? p + 1 : p;
}

/** Height of the arc at fraction u of the way across (0..1): x, y. */
const arcAt = (u) => [4 + 120 * u, WATER - 3 - 42 * Math.sin(Math.PI * u)];

function drawSun(g, x, y, t) {
  g.fillCircle(x, y, 3.2, 1);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * 2 * Math.PI + t * 0.15;
    for (const r of [5, 6.3]) g.pixel(Math.floor(x + r * Math.sin(a)), Math.floor(y - r * Math.cos(a)), 1);
  }
}

/** The moon, lit by its phase: a disc with the terminator as an ellipse. */
function drawMoon(g, x, y, phase, faint) {
  const R = 3.6, k = Math.cos(2 * Math.PI * phase);   // 1 new, -1 full
  const waxing = phase < 0.5;
  g.fillWhere((px, py) => {
    const dx = px - x, dy = py - y;
    if (dx * dx + dy * dy > R * R) return false;
    const edge = Math.sqrt(Math.max(0, R * R - dy * dy));
    // lit part: from the limb on the sunward side to the terminator
    const s = waxing ? dx : -dx;
    const lit = s >= k * edge;
    if (faint) return lit && dx * dx + dy * dy > (R - 1.2) ** 2;
    return lit ? true : dx * dx + dy * dy > (R - 0.8) ** 2 ? 0.25 : false;
  }, 1, [x - R - 1, y - R - 1, 2 * R + 2, 2 * R + 2]);
}

// Stars: fixed in the sky, which drifts with the hours.
const STARS = Array.from({ length: 34 }, (_, i) => [noise(i, 1) * 128, 1 + noise(i, 2) ** 1.4 * 34, noise(i, 3)]);

/** A cloud: an outline of round lobes on a flat base, dark inside. */
function drawCloud(g, x, y, s) {
  const lobes = [[0, 0, 2.6], [3.4, -1.6, 3.2], [7, -0.4, 2.6], [10, 0.6, 1.8]].map(([a, b, r]) => [x + a * s, y + b * s, r * s]);
  const base = y + 1.8 * s;
  const inside = (px, py, grow) => py <= base + grow && lobes.some(([cx, cy, r]) => Math.hypot(px - cx, py - cy) <= r + grow);
  g.fillWhere((px, py) => inside(px, py, 0) && !inside(px, py, -1), 1, [x - 4 * s, y - 6 * s, 16 * s, 9 * s]);
}

/** A bird, wings up or down. */
function drawBird(g, x, y, up) {
  x = Math.round(x); y = Math.round(y);
  if (up) { g.pixel(x - 2, y - 1, 1); g.pixel(x - 1, y, 1); g.pixel(x + 1, y, 1); g.pixel(x + 2, y - 1, 1); }
  else { g.pixel(x - 2, y, 1); g.pixel(x - 1, y, 1); g.pixel(x, y + 1, 1); g.pixel(x + 1, y, 1); g.pixel(x + 2, y, 1); }
}

// ------------------------------------------------------------ low blocks behind

// [x, top, w]: the riverside blocks between and behind the towers.
const BLOCKS = [[0, 30, 4], [26, 36, 6], [124, 28, 4], [97, 40, 5]];

// ------------------------------------------------------------ the Pearl

/**
 * The Oriental Pearl Tower, measured off a photograph from the Bund and
 * squeezed to fit: three columns, splayed legs, the big lower pearl, the
 * upper pearl, the little "space module", the mast. `lit` fills the pearls
 * (the colon); `show` (0..1) is the hour's light show.
 */
const PEARLS = [{ y: 39.5, r: 5 }, { y: 21.5, r: 4.4 }];
function drawPearl(g, ox, oy, lit, show, t, phase = 0, base = WATER + oy) {
  const c = PEARL_X + ox;
  // clear the silhouette first, so the blocks behind do not show through
  for (const p of PEARLS) g.fillCircle(c, p.y + oy, p.r + 1, 0);
  g.fillRect(Math.floor(c) - 3, 2 + oy, 6, base - 2 - oy, 0);
  // legs and columns
  g.line(Math.round(c - 7), base - 1, Math.round(c - 3), base - 7);
  g.line(Math.round(c + 6), base - 1, Math.round(c + 2), base - 7);
  // the columns and mast are dotted, the dots changing places each minute (wear)
  const col = (x, y0, y1) => { for (let y = y0; y < y1; y++) if ((y + phase) % 3 !== 0) g.pixel(x, y, 1); };
  for (const dx of [-2, 1]) col(Math.floor(c + dx), 9 + oy, base);
  // decks between the pearls
  for (const y of [27, 31, 34]) g.hline(Math.floor(c) - 2, y + oy, 4, 1);
  // pearls: outline always; the fill is the colon
  PEARLS.forEach((p, n) => {
    const cy = p.y + oy;
    g.fillCircle(c, cy, p.r + 0.3, 0);
    g.circle(c - 0.5, cy - 0.5, p.r, 1);
    if (show > 0) {
      // light show: bands chase round the sphere
      g.fillWhere((px, py, ix, iy) => {
        const d = Math.hypot(px - c, py - cy);
        if (d > p.r - 0.5) return false;
        const band = Math.sin((py - cy) * 1.4 + t * 9 * (n ? 1 : -1) + Math.atan2(px - c, 1) * 2);
        return band > 0.2 ? true : band > -0.3 ? 0.3 : false;
      }, 1, [c - p.r - 1, cy - p.r - 1, 2 * p.r + 2, 2 * p.r + 2]);
    } else if (lit) {
      // a lit pearl: dithered sphere, bright towards the upper left, a band of windows
      // (the dither and the highlight move each minute, so no pixel holds it)
      const la = phase * 0.9;
      g.fillWhere((px, py, ix, iy) => {
        const dx = px - c, dy = py - cy, d = Math.hypot(dx, dy);
        if (d > p.r - 0.6) return false;
        if (Math.abs(dy) < 0.6) return true;
        const shade = 0.6 - 0.4 * ((dx * Math.cos(la) + dy * Math.sin(la) + dy) / (1.5 * p.r));
        return dither(ix + phase * 3, iy + (phase >> 2), clamp(shade, 0.15, 0.85));
      }, 1, [c - p.r - 1, cy - p.r - 1, 2 * p.r + 2, 2 * p.r + 2]);
    } else g.hline(Math.round(c - p.r + 1.5), Math.round(cy - 0.5), Math.round(2 * p.r - 2), 1);
  });
  // space module and mast
  g.fillRect(Math.floor(c) - 1, 11 + oy, 2, 2, 1);
  col(Math.floor(c) - 1, 1 + oy, 11 + oy);
  // aviation light on the mast, blinking
  if (t % 1.6 < 0.12) g.pixel(Math.floor(c) - 1, 0 + oy, 1);
}

// ------------------------------------------------------------ river life

/** The ferry, facing right: hull, cabin with lit windows, funnel. */
const FERRY = [
  '....##.......',
  '....##.......',
  '..#########..',
  '..#.#.#.#.#..',
  '#############',
  '.###########.',
];
const FERRY_PERIOD = 97, FERRY_CROSS = 70;   // seconds

// ------------------------------------------------------------ fireworks

/** This hour's shells: [launch s, x, burst y, size, seed]. More at midnight. */
function shells(f) {
  const n = f.h === 0 ? 20 : 12, out = [];
  const seed = Math.floor(f.minuteKey / 60) % 997;
  for (let k = 0; k < n; k++) {
    const at = 0.2 + k * (f.h === 0 ? 0.55 : 0.8) + noise(k, seed) * 0.6;
    out.push([at, 10 + ((k * 0.618 + noise(seed, 5)) % 1) * 108, 7 + noise(k, seed + 2) * 6, 13 + noise(k, seed + 3) * 9, seed * 31 + k]);
  }
  return out;
}
const RISE = 0.9, BURST = 2.6;

/** Light every point of every shell in flight at `sec` (seconds after :00). Returns true at a burst's flash. */
function fireworks(g, f, sec, ox, oy, keep) {
  let flash = false;
  for (const [at, x, by, size, seed] of shells(f)) {
    const tau = sec - at;
    if (tau < 0 || tau > RISE + BURST) continue;
    if (tau < RISE) {
      // the rocket climbs from the water with a sparkling tail
      const u = tau / RISE, y = WATER - (WATER - by) * (1 - (1 - u) ** 2);
      for (let k = 0; k < 4; k++) {
        const yy = Math.round(y + k * 1.5 + oy);
        if (k === 0 || noise(k + Math.floor(sec * 30), seed) < 0.5) if (keep(Math.round(x + ox), yy)) g.pixel(Math.round(x + ox), yy, 1);
      }
      continue;
    }
    // the burst: a chrysanthemum of rays flying out, slowing, falling,
    // and glittering out from the tips
    const s = tau - RISE, n = 26;
    if (s < 0.08) { g.fillCircle(x + ox, by + oy, 3, 1); flash = true; }
    const r = size * (1 - Math.exp(-s * 2.4)), fade = 1 - s / BURST;
    const len = clamp(r * 0.45 * (1.2 - s), 0, 6);
    for (let k = 0; k < n; k++) {
      if (noise(k + Math.floor(sec * 20) * 7, seed) > fade + 0.15) continue;
      const a = (k / n) * 2 * Math.PI + noise(seed, 4);
      const ca = Math.cos(a) * 1.15, sa = Math.sin(a) * 0.8;
      for (let q = 0; q <= len; q += 0.7) {
        const rr = r - q;
        if (rr < 0) break;
        const X = Math.round(x + rr * ca + ox), Y = Math.round(by + rr * sa + 2 * s * s * (1 - q / 8) + oy);
        if (q > 0 && s > 1.1 && noise(X * 13 + Y, Math.floor(sec * 15)) < 0.5) continue;   // glitter
        if (keep(X, Y)) g.pixel(X, Y, 1);
      }
    }
  }
  return flash;
}

const digitsOf = (fl) => [...`${fl.hh}${fl.mm}`].map(Number);

export default {
  name: 'Skyline',
  blurb: 'Lujiazui across the Huangpu: the time is lit office windows on four towers, the Pearl is the colon; real sun and moon, fireworks on the hour.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,

  frame(g, { fields: f, date, oled, night }) {
    const sec = f.sec, t = date.getTime() / 1000;
    const [ox, oy] = orbit(date, 2, 3);
    const hours = f.h + f.m / 60 + sec / 3600;
    const now = digitsOf(f), was = digitsOf(previousMinute(date));
    const will = digitsOf(previousMinute(new Date(date.getTime() + 120000)));
    const key = f.minuteKey % 9973;
    const city = (x, y) => towerAt(x - ox, y - oy);
    const pearlBox = (x, y) => Math.abs(x - PEARL_X) < 9 && y < WATER + 3;

    // ---- the sky
    const [rise, set] = sunTimes(date);
    const sunU = (hours - rise) / (set - rise);
    // twilight: 0 in full day, 1 in full night, ramping over 50 min past the horizon
    const below = sunU < 0 ? (rise - hours) : sunU > 1 ? (hours - set) : -Math.min(hours - rise, set - hours);
    const dark = clamp(below / 0.8 + 0.15, 0, 1);
    const glow = clamp(1 - Math.abs(below + 0.2) / 0.9, 0, 1);    // dawn and dusk

    // stars, drifting with the sky
    if (dark > 0) for (let i = 0; i < STARS.length; i++) {
      const [sx, sy, b] = STARS[i];
      if (b > dark) continue;
      const x = Math.floor((sx + hours * 5.3) % 128), y = Math.floor(sy);
      if (noise(Math.floor(t * 2.5) + i * 101, 9) < 0.08) continue;   // twinkle
      g.pixel(x, y, 1);
    }
    const day = 1 - dark;
    // horizon glow at dawn and dusk: a sparse dithered band
    if (glow > 0) for (let y = 0; y < WATER; y++) {
      const lv = glow * 0.34 * (y / WATER) ** 0.8;
      for (let x = 0; x < W; x++) if (dither(x, y, lv)) g.pixel(x, y, 1);
    }
    // the sun on its arc, the moon on its own
    if (sunU > -0.03 && sunU < 1.03) { const [x, y] = arcAt(sunU); drawSun(g, x, y, t); }
    const phase = moonPhase(date);
    const moonRise = (rise + phase * 24.8) % 24;
    const mu = (((hours - moonRise) % 24) + 24) % 24 / 12.4;
    if (mu < 1 && phase > 0.03 && phase < 0.97) {
      const [x, y] = arcAt(mu);
      drawMoon(g, x, y, phase, dark < 0.5);
    }
    // clouds by day
    if (dark < 1) for (let k = 0; k < 2; k++) {
      const x = ((t * (0.35 + 0.15 * k) + k * 53) % 180) - 30, y = 4 + k * 3;
      if (noise(k, Math.floor(t / 600)) < 0.75 - dark) drawCloud(g, x, y, 0.9 + 0.2 * k);
    }
    // a few birds by day, in a loose line
    if (day > 0.5) {
      const bk = Math.floor(t / 75), bu = (t % 75) / 30;
      if (bu < 1 && noise(bk, 15) < 0.6) for (let k = 0; k < 3; k++) {
        const bx = -6 + 140 * bu - k * 5, by = 9 + 6 * noise(bk, 16) + k * 2 + Math.sin(t * 2 + k) * 0.7;
        drawBird(g, bx, by, Math.floor(t * 5 + k * 2) % 2 === 0);
      }
    }
    // a plane's strobe crosses the night sky every couple of minutes
    const pk = Math.floor(t / 140), pu = (t % 140) / 40;
    if (dark > 0.5 && pu < 1 && noise(pk, 12) < 0.7) {
      const dir = noise(pk, 13) < 0.5 ? 1 : -1;
      const x = Math.round(dir > 0 ? -4 + 136 * pu : 132 - 136 * pu), y = Math.round(3 + 8 * noise(pk, 14) + 3 * pu);
      if ((t % 1.1) < 0.08) { g.pixel(x, y, 1); g.pixel(x + 1, y, 1); }
      else if ((t % 0.55) < 0.3) g.pixel(x, y, 1);
    }

    // ---- fireworks on the hour, behind the towers
    const hourShow = f.m === 0 && sec < 14;
    let burst = false;

    // ---- the low blocks behind
    for (const [bx, top, bw] of BLOCKS) {
      const x0 = bx + ox, y0 = top + oy;
      g.fillRect(x0, y0, bw, WATER + oy - y0, 0);
      g.hline(x0, y0, bw, 1);
      // a few lit windows, each switched on and off at its own random times
      for (let y = y0 + 2; y < WATER + oy - 1; y += 2)
        for (let x = x0 + 1; x < x0 + bw - 1; x += 2) {
          const id = x * 64 + y - ox * 64 - oy, slot = Math.floor((t + noise(id, 21) * 90) / 90);
          if (noise(id + slot * 13, 22) < 0.22 + 0.15 * dark) g.pixel(x, y, 1);
        }
    }
    // ---- the towers: dark glass, a lit edge
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const m = city(x, y);
        if (!m) continue;
        const edge = city(x - 1, y) !== m || city(x + 1, y) !== m || city(x, y - 1) !== m;
        const crown = y - oy < GRID_Y - 2;
        g.pixel(x, y, edge && !(hourShow && crown && (x + y) % 2) ? 1 : 0);
      }
    // aviation lights on the crowns
    if (t % 2 < 0.15) for (const [x, y] of [[TOWER_X[0] + 12, 8], [TOWER_X[1] + 12, 5], [TOWER_X[3] + 15, 2]]) g.pixel(x + ox, y + oy, 1);
    // Jin Mao's spire
    g.vline(TOWER_X[1] + 12 + ox, 0 + oy, 6, 1);
    // the Shanghai Tower's spiral notch climbing its face
    for (let y = 18; y > 5; y -= 1) {
      const c = TOWER_X[3] + TW / 2, u = (18 - y) / 13;
      const X = Math.round(c - halfShanghai(y) + 1 + u * 2 * (halfShanghai(y) - 1)) + ox;
      if (y % 2 === 0) g.pixel(X, y + oy, 1);
    }
    // facade windows above the digit grids, flickering by themselves
    for (let i = 0; i < 4 && !hourShow; i++) {
      for (let y = 8; y < GRID_Y - 1; y += 2)
        for (let x = TOWER_X[i] + 3; x < TOWER_X[i] + TW - 3; x += 2) {
          const X = x + ox, Y = y + oy;
          if (city(X, Y) !== i + 1 || city(X - 1, Y) !== i + 1 || city(X + 1, Y) !== i + 1 || city(X, Y - 1) !== i + 1) continue;
          const slot = Math.floor((t + noise(x * 7 + y, 23) * 40) / 40);
          if (noise(x * 7 + y + slot * 17, 24) < 0.18 + 0.2 * dark) g.pixel(X, Y, 1);
        }
    }

    // ---- the time, in the offices
    for (let i = 0; i < 4; i++) {
      const gx = TOWER_X[i] + 3 + ox, gy = GRID_Y + oy;
      const goingOut = now[i] !== will[i] && sec >= OUT_AT;
      const comingIn = now[i] !== was[i] && sec < IN_AT + IN_LEN + 0.1;
      const outU = (sec - OUT_AT) / OUT_LEN, inU = (sec - IN_AT) / IN_LEN;
      // this minute's random order of leaving, as a rank 0..1 per office
      let leave = null;
      if (goingOut) {
        const list = OFFICES[now[i]];
        const order = list.map((o, n) => [noise(n * 7.31 + i * 3.7 + (key % 97) * 0.113, 77), n]).sort((a, b) => a[0] - b[0]);
        leave = new Map(order.map(([, n], r) => [list[n], (r + 1) / list.length]));
      }
      for (const o of OFFICES[now[i]]) {
        const [col, row, kind] = o;
        // people leave whenever they leave: offices go dark in a random
        // order (never a stroke at a time, so a half-dark digit is no other digit)
        if (goingOut && leave.get(o) <= outU) continue;
        if (comingIn && WALK_IN[now[i]].get(o) > inU) continue;
        pane(g, gx, gy, col, row, kind);
      }
    }

    // ---- the Pearl, its pearls the colon (blinking with the seconds)
    const show = hourShow ? 1 : 0;
    // the Pearl walks its own orbit, out of step with the towers
    const [px, py] = orbit(new Date(date.getTime() + 11 * 60000), 3, 2);
    drawPearl(g, Math.max(-2, Math.min(2, px)), py, sec % 2 < 1, show, t, f.m, WATER + oy);

    // ---- fireworks on the hour, launched from barges on the river, so in
    // front of the bank; the crowns dim to dotted outlines for the show and
    // no spark ever lands on a digit's offices (each grid keeps a margin)
    if (hourShow) {
      const inGrid = (x, y) => y >= GRID_Y + oy - 1 && y < GRID_Y + oy + 27 &&
        TOWER_X.some((tx) => x >= tx + 2 + ox && x < tx + 23 + ox);
      burst = fireworks(g, f, sec, 0, 0, (x, y) => y < WATER + oy && !inGrid(x, y) && !pearlBox(x, y));
    }

    // ---- the embankment and the riverside road
    const bank = WATER + oy;
    g.fillRect(0, bank, W, H - bank, 0);
    for (let x = 0; x < W; x++) if ((x + ox) % 3 !== 2) g.pixel(x, bank, 1);
    for (let k = 0; k < 7; k++) {
      // cars both ways: headlights coming, tail lights going
      const dir = k % 2 ? 1 : -1, speed = 9 + 5 * noise(k, 31);
      const x = ((dir * t * speed + noise(k, 32) * 400) % 150 + 150) % 150 - 11;
      const X = Math.round(x);
      g.pixel(X, bank + 1, 1);
      if (dir > 0) g.pixel(X + 2, bank + 1, 1);
    }

    // ---- the river: the bank reflected, broken into streaks
    for (let y = bank + 3; y < H; y++) {
      const src = 2 * bank - y + 1;
      const depth = (y - bank) / (H - bank);
      for (let x = 0; x < W; x++) {
        const wob = Math.round((0.6 + 1.6 * depth) * Math.sin(t * 1.3 + y * 1.9 + Math.sin(x * 0.13 + t * 0.4)));
        if ((y - bank) % 2 === 0 || !g.get(x + wob, src)) continue;
        if (noise(x * 3 + y * 131 + Math.floor(t * 4 + x * 0.05) * 7, 51) < 0.85 - 0.4 * depth) g.pixel(x, y, 1);
      }
    }

    // ---- the ferry
    const fu = (t % FERRY_PERIOD) / FERRY_CROSS;
    if (fu < 1) {
      const fk = Math.floor(t / FERRY_PERIOD), dir = noise(fk, 41) < 0.5 ? 1 : -1;
      const fx = Math.round(dir > 0 ? -14 + 156 * fu : 128 - 156 * fu), fy = 56;
      const hornAt = hourShow;   // on the hour the horn: smoke puffs
      FERRY.forEach((row, j) => [...row].forEach((ch, i) => {
        const X = fx + (dir > 0 ? i : 12 - i), Y = fy + j;
        g.pixel(X, Y, ch === '#' ? 1 : 0);
      }));
      // the wake
      for (let k = 1; k < 10; k++) if (noise(k + Math.floor(t * 8), 42) < 0.6 - k * 0.05) g.pixel(fx + (dir > 0 ? -k : 12 + k), fy + 5 + (k % 2), 1);
      if (hornAt) for (let k = 0; k < 3; k++) {
        const s = (sec * 0.8 + k * 0.4) % 1.2;
        g.circle(fx + (dir > 0 ? 4 : 8) + s * 3 * -dir, fy - 2 - s * 5, Math.round(0.5 + s), 1);
      }
    }

    // each burst lights up the whole city for an instant (global contrast)
    const base = DAY + (NIGHT - DAY) * night;
    oled.contrast(burst ? Math.min(255, base * 1.6 + 30) : base);
  },
};
