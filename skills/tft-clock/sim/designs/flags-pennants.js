// flags: the International Code of Signals numeral pennants (0-9) and the
// first substitute, as cloth in the wind.
//
// Patterns are written in cloth coordinates: X along the pennant from the
// hoist (0) to the fly (len), Y across it from the centre line, the cloth
// being `H0 * taper(X)` wide at X. The renderer walks screen columns, finds
// each column's place on the cloth and its flutter, and writes the column as
// a few vertical runs (hard inside, one blended pixel at each edge).

import { mix, sin, cos, clamp } from '../js/kit.js';

export const ICS = {
  red: 0xd0281e,
  blue: 0x1d4ea6,
  yellow: 0xf3c41a,
  black: 0x1c1c22,
  white: 0xf3f0e6,
};
const { red, blue, yellow, black, white } = ICS;

/** Cloth size at zoom 1: hoist height and length. */
export const H0 = 13;
export const LEN = { num: 36, sub: 30 };

/** Width factor of the cloth at X (0..1 of the hoist height). */
function taperOf(kind, X) {
  const L = LEN[kind];
  return kind === 'sub' ? Math.max(0.06, 1 - X / L) : 1 - 0.62 * (X / L);
}

/**
 * Base colour of pennant `sym` ('0'..'9' or 'S') at cloth point (X, Y);
 * `w` is the cloth's full width at X. Patterns are laid out on a 30 x 11
 * reference pennant and scaled to the real size.
 */
export function patternAt(sym, X, Y, w) {
  const x = (X * 30) / LEN.num, y = (Y * 11) / H0, ww = (w * 11) / H0;
  switch (sym) {
    case '1': return (x - 6.5) ** 2 + y * y < 3.5 * 3.5 ? red : white;
    case '2': return (x - 6.5) ** 2 + y * y < 3.5 * 3.5 ? white : blue;
    case '3': return x < 10 ? red : x < 20 ? white : blue;
    case '4': return Math.abs(y) < 1.5 || Math.abs(x - 7.5) < 1.6 ? white : red;
    case '5': return x < 15 ? yellow : blue;
    case '6': return y < 0 ? black : white;
    case '7': return y < 0 ? yellow : red;
    case '8': return Math.abs(y) < 1.5 || Math.abs(x - 7.5) < 1.6 ? red : white;
    case '9': return x < 15 ? (y < 0 ? white : red) : (y < 0 ? black : yellow);
    case '0': return x < 10 || x >= 20 ? yellow : red;
    case 'S': {
      const xs = (X * 25) / LEN.sub;
      return xs > 2.4 && Math.abs(y) < ww / 2 - 2.0 && xs < 21 ? yellow : blue;
    }
    default: return white;
  }
}

/**
 * The symbols a two-pennant hoist flies for a two-digit string: the second
 * pennant is the first substitute when it repeats the first (one set aboard).
 */
export function hoistSymbols(two) {
  return [two[0], two[1] === two[0] ? 'S' : two[1]];
}

/**
 * Draw one pennant. (x, y) is the top of the hoist edge on screen, z the
 * zoom, `t` seconds (absolute), `wind` 0..1, `seed` decorrelates flutter,
 * `tint` (c) => c applied to every colour (light of day).
 */
export function drawPennant(g, sym, x, y, z, t, wind, seed, tint) {
  const kind = sym === 'S' ? 'sub' : 'num';
  const L = LEN[kind], Hs = H0 * z;
  // The cloth breathes in length as it ripples (foreshortening).
  const breathe = 0.93 + 0.05 * sin(t * 5.1 + seed) - 0.05 * (1 - wind);
  const Ls = L * z * breathe;
  const cols = Math.ceil(Ls);
  const amp = (0.9 + 2.1 * wind) * z;
  const droop = (1 - wind) * 6 * z;
  const freq = 1.6 + 1.4 * wind;
  const x0 = Math.floor(x);
  for (let i = 0; i < cols; i++) {
    const u = (i + 0.5 + (x0 - x)) / Ls;
    if (u < 0 || u > 1) continue;
    const X = u * L;
    const ph = (t * freq + seed) * 6.2832 - u * 7.5;
    const a = amp * u * (0.8 + 0.2 * u);
    const yc = y + Hs / 2 + a * sin(ph) + droop * u * u;
    // slope of the centre line -> fold shading, three tones
    const slope = (-a * 7.5 * cos(ph)) / Ls;
    const w = H0 * taperOf(kind, X);
    // the cloth twists a little: its apparent width narrows at the folds
    const hw = (w * z) / 2 * (0.82 + 0.18 * Math.abs(sin(ph + 1.57)));
    const top = yc - hw, bot = yc + hw;
    const shade = slope > 0.45 ? 1 : slope < -0.45 ? -1 : 0;
    columnRuns(g, x0 + i, top, bot, (vy) => {
      const Y = ((vy - yc) / hw) * (w / 2);
      let c = patternAt(sym, X, Y, w);
      if (shade > 0) c = mix(c, 0xffffff, 0.22);
      else if (shade < 0) c = mix(c, 0x000000, 0.26);
      return tint(c);
    });
  }
}

/** Fill a column from `top` to `bot` (floats) with colours by y, merging runs; blended ends. */
function columnRuns(g, x, top, bot, colourAt) {
  const y0 = Math.floor(top), y1 = Math.floor(bot);
  let runC = -1, runY = 0, runN = 0;
  const flush = () => { if (runN > 0) g.fillRect(x, runY, 1, runN, runC); runN = 0; };
  for (let yy = y0; yy <= y1; yy++) {
    const cov = Math.min(yy + 1, bot) - Math.max(yy, top);
    if (cov <= 0.02) continue;
    const c = colourAt(clamp(yy + 0.5, top + 0.01, bot - 0.01));
    if (cov < 0.98) { flush(); g.pixel(x, yy, c, { a: cov }); continue; }
    if (c === runC && runN > 0 && runY + runN === yy) runN++;
    else { flush(); runC = c; runY = yy; runN = 1; }
  }
  flush();
}

/** Tiny flat pennant icon for the log page (no flutter), top-left (x, y), hoist height h, length l. */
export function drawPennantIcon(g, sym, x, y, l, h) {
  const kind = sym === 'S' ? 'sub' : 'num';
  const L = LEN[kind];
  const ls = (l * L) / LEN.num;
  for (let i = 0; i < Math.round(ls); i++) {
    const X = ((i + 0.5) / ls) * L;
    const w = H0 * taperOf(kind, X);
    const hw = (h * taperOf(kind, X)) / 2;
    const yc = y + h / 2;
    columnRuns(g, x + i, yc - hw, yc + hw, (vy) => patternAt(sym, X, ((vy - yc) / hw) * (w / 2), w));
  }
}
