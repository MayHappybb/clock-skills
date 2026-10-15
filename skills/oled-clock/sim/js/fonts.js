// Fonts. The SSD1306 and SH1106 have no character ROM at all: every letter on
// the glass is pixels some library drew into the frame buffer. So any face is
// possible, and the choice of type is the biggest decision in a design.
//
// Three kinds live here:
//   bitmap fonts   font3x5, font5x7: pixel-exact, use with g.text()
//   vector digits  strokeDigits(): a rounded geometric face at any size,
//                  drawn as thick strokes, so a 40-pixel 7 is still crisp
//   segments       segDigit(): seven-segment digits with bevelled ends
//
// font5x7 is the HD44780 character ROM (rows 0-6 of the A00 set, extracted from
// that module's datasheet in the 1602-clock skill). It is the classic 5x7 that
// most SSD1306 libraries' default fonts descend from.

import { CGROM_A00, CGROM_ROWS } from './cgrom-a00.js';
import { sprite, segDist } from './gfx.js';

/**
 * Build a font from glyph pictures.
 * @param {object} spec { name, height, spacing, glyphs: { ch: picture } }
 */
export function makeFont({ name, height, spacing = 1, glyphs, fallback, upper = false }) {
  const cache = new Map();
  const width = Math.max(...Object.values(glyphs).map((g) => sprite(g).w));
  const font = {
    name, height, width, spacing,
    /** The sprite for one character, or null. */
    glyph(ch) {
      if (upper) ch = ch.toUpperCase();
      if (!cache.has(ch)) {
        const pic = glyphs[ch] ?? (fallback ? glyphs[fallback] : undefined);
        cache.set(ch, pic === undefined ? null : padTo(sprite(pic), height));
      }
      return cache.get(ch);
    },
    /** Width in pixels of `str` at `scale`, without the trailing gap. */
    measure(str, scale = 1, gap = spacing) {
      let w = 0, n = 0;
      for (const ch of String(str)) { w += (font.glyph(ch)?.w ?? width) + gap; n++; }
      return n ? (w - gap) * scale : 0;
    },
    has: (ch) => (upper ? ch.toUpperCase() : ch) in glyphs,
  };
  return font;
}

/** Pad a sprite to `h` rows (blank rows below), so every glyph shares a baseline. */
function padTo(s, h) {
  if (s.h >= h) return s;
  const data = new Uint8Array(s.w * h);
  data.set(s.data);
  return { w: s.w, h, data };
}

// ------------------------------------------------------------ 5x7 (ROM)

function romGlyph(code) {
  const rows = [];
  for (let r = 0; r < 7; r++) {
    const bits = CGROM_A00[code * CGROM_ROWS + r];
    let line = '';
    for (let i = 0; i < 5; i++) line += (bits >> (4 - i)) & 1 ? '#' : '.';
    rows.push(line);
  }
  return rows;
}

const ROM_GLYPHS = {};
for (let code = 0x20; code <= 0x7d; code++) ROM_GLYPHS[String.fromCharCode(code)] = romGlyph(code);
// The A00 ROM has a yen sign at 0x5c and arrows at 0x7e/0x7f; give ASCII its own.
ROM_GLYPHS['\\'] = ['.....', '#....', '.#...', '..#..', '...#.', '....#', '.....'];
ROM_GLYPHS['~'] = ['.....', '.....', '.#...', '#.#.#', '...#.', '.....', '.....'];
ROM_GLYPHS['°'] = romGlyph(0xdf);
ROM_GLYPHS['·'] = romGlyph(0xa5);
ROM_GLYPHS['→'] = romGlyph(0x7e);
ROM_GLYPHS['←'] = romGlyph(0x7f);
ROM_GLYPHS['█'] = romGlyph(0xff);

/** The classic 5x7, full ASCII plus ° · → ← █. Monospaced: every glyph is 5 wide. */
export const font5x7 = makeFont({ name: '5x7', height: 7, spacing: 1, glyphs: ROM_GLYPHS, fallback: '?' });

// ------------------------------------------------------------ 3x5

const T = (s) => s.split(' ');
/** A 3x5 for labels and small numbers: digits, capitals, a little punctuation. */
export const font3x5 = makeFont({
  name: '3x5', height: 5, spacing: 1, upper: true, fallback: '?',
  glyphs: {
    0: T('### #.# #.# #.# ###'), 1: T('.#. ##. .#. .#. ###'), 2: T('### ..# ### #.. ###'),
    3: T('### ..# .## ..# ###'), 4: T('#.# #.# ### ..# ..#'), 5: T('### #.. ### ..# ###'),
    6: T('### #.. ### #.# ###'), 7: T('### ..# ..# .#. .#.'), 8: T('### #.# ### #.# ###'),
    9: T('### #.# ### ..# ###'),
    A: T('.#. #.# ### #.# #.#'), B: T('##. #.# ##. #.# ##.'), C: T('.## #.. #.. #.. .##'),
    D: T('##. #.# #.# #.# ##.'), E: T('### #.. ##. #.. ###'), F: T('### #.. ##. #.. #..'),
    G: T('.## #.. #.# #.# .##'), H: T('#.# #.# ### #.# #.#'), I: T('### .#. .#. .#. ###'),
    J: T('..# ..# ..# #.# .#.'), K: T('#.# #.# ##. #.# #.#'), L: T('#.. #.. #.. #.. ###'),
    M: T('#.# ### ### #.# #.#'), N: T('##. #.# #.# #.# #.#'), O: T('.#. #.# #.# #.# .#.'),
    P: T('##. #.# ##. #.. #..'), Q: T('.#. #.# #.# ##. .##'), R: T('##. #.# ##. #.# #.#'),
    S: T('.## #.. .#. ..# ##.'), T: T('### .#. .#. .#. .#.'), U: T('#.# #.# #.# #.# ###'),
    V: T('#.# #.# #.# #.# .#.'), W: T('#.# #.# ### ### #.#'), X: T('#.# #.# .#. #.# #.#'),
    Y: T('#.# #.# .#. .#. .#.'), Z: T('### ..# .#. #.. ###'),
    ' ': T('.. .. .. .. ..'), ':': T('. # . # .'), '.': T('. . . . #'), ',': T('. . . # #'),
    '-': T('... ... ### ... ...'), '+': T('... .#. ### .#. ...'), '=': T('... ### ... ### ...'),
    '/': T('..# ..# .#. #.. #..'), '%': T('#.# ..# .#. #.. #.#'), '!': T('# # # . #'),
    '?': T('##. ..# .#. ... .#.'), "'": T('# # . . .'), '(': T('.# #. #. #. .#'),
    ')': T('#. .# .# .# #.'), '<': T('..# .#. #.. .#. ..#'), '>': T('#.. .#. ..# .#. #..'),
    '°': T('### #.# ### ... ...'), '_': T('... ... ... ... ###'),
  },
});

// ------------------------------------------------------------ vector digits

const PI = Math.PI;
/**
 * Stroke paths for a rounded geometric face, in a unit box (x right, y down,
 * 0..1 each) that maps onto the stroke centre-lines. Commands:
 *   ['M', x, y], ['L', x, y],
 *   ['A', cx, cy, rx, ry, a0, a1]   elliptical arc, clock angles (0 = up, clockwise)
 */
const STROKES = {
  0: [[['M', 0, 0.27], ['A', 0.5, 0.27, 0.5, 0.27, -PI / 2, PI / 2], ['L', 1, 0.73], ['A', 0.5, 0.73, 0.5, 0.27, PI / 2, 1.5 * PI], ['L', 0, 0.27]]],
  1: [[['M', 0.18, 0.2], ['L', 0.62, 0], ['L', 0.62, 1]]],
  2: [[['A', 0.5, 0.27, 0.5, 0.27, -1.3, 2.25], ['L', 0, 1], ['L', 1, 1]]],
  3: [[['A', 0.5, 0.25, 0.47, 0.25, -1.35, PI]], [['A', 0.5, 0.74, 0.5, 0.26, 0, PI + 1.35]]],
  4: [[['M', 0.78, 1], ['L', 0.78, 0], ['L', 0, 0.7], ['L', 1, 0.7]]],
  5: [[['M', 0.95, 0], ['L', 0.1, 0], ['L', 0.05, 0.47], ['A', 0.5, 0.68, 0.5, 0.32, -0.95, PI + 1.25]]],
  6: [[['A', 0.5, 0.68, 0.5, 0.32, 0, 2 * PI]], [['A', 1.0, 0.68, 1.0, 0.68, 1.5 * PI, 2 * PI - 0.32]]],
  7: [[['M', 0, 0], ['L', 1, 0], ['L', 0.36, 1]]],
  8: [[['A', 0.5, 0.235, 0.43, 0.235, 0, 2 * PI]], [['A', 0.5, 0.73, 0.5, 0.27, 0, 2 * PI]]],
};
// 9 is 6 turned half a turn.
STROKES[9] = STROKES[6].map((s) => s.map((c) => (c[0] === 'A'
  ? ['A', 1 - c[1], 1 - c[2], c[3], c[4], c[5] + PI, c[6] + PI]
  : [c[0], 1 - c[1], 1 - c[2]])));

/** Flatten a stroke path into a polyline in the unit box. */
function flatten(path) {
  const pts = [];
  for (const c of path) {
    if (c[0] === 'M' || c[0] === 'L') pts.push([c[1], c[2]]);
    else {
      const [, cx, cy, rx, ry, a0, a1] = c;
      const n = Math.max(8, Math.ceil(Math.abs(a1 - a0) * 12));
      for (let i = 0; i <= n; i++) {
        const a = a0 + ((a1 - a0) * i) / n;
        pts.push([cx + rx * Math.sin(a), cy - ry * Math.cos(a)]);
      }
    }
  }
  return pts;
}
const FLAT = Object.fromEntries(Object.entries(STROKES).map(([k, v]) => [k, v.map(flatten)]));

/**
 * Draw one digit of the rounded vector face so its ink fills the box
 * (x, y, w, h) exactly. `weight` is the stroke width in pixels.
 * `morph` (0..1) with `to` blends the centre-lines towards another digit,
 * point by point: a cheap, odd-looking tween, sometimes the right one.
 */
export function strokeDigit(g, d, x, y, w, h, { weight = 3, c = 1, to, morph = 0 } = {}) {
  const segs = digitSegments(String(d), x, y, w, h, weight, to === undefined ? undefined : String(to), morph);
  if (!segs) return g;
  const r = weight / 2;
  return g.fillWhere((px, py) => {
    for (const s of segs) if (segDist(px, py, s[0], s[1], s[2], s[3]) <= r) return true;
    return false;
  }, c, [x - 1, y - 1, w + 2, h + 2]);
}

/** The digit's centre-line as pixel segments [x0,y0,x1,y1], inset by half the weight. */
export function digitSegments(d, x, y, w, h, weight, to, morph = 0) {
  const lines = FLAT[d];
  if (!lines) return null;
  const r = weight / 2;
  const sx = (u) => x + r + u * (w - weight), sy = (v) => y + r + v * (h - weight);
  const other = to !== undefined ? FLAT[to] : null;
  const segs = [];
  const strokes = other ? resampleAll(lines, other, morph) : lines;
  for (const pts of strokes)
    for (let i = 1; i < pts.length; i++) segs.push([sx(pts[i - 1][0]), sy(pts[i - 1][1]), sx(pts[i][0]), sy(pts[i][1])]);
  return segs;
}

/** Blend two digits' polylines by arc length, stroke for stroke. */
function resampleAll(a, b, k) {
  const n = Math.max(a.length, b.length);
  const out = [];
  for (let i = 0; i < n; i++) {
    const pa = resample(a[Math.min(i, a.length - 1)], 48), pb = resample(b[Math.min(i, b.length - 1)], 48);
    out.push(pa.map((p, j) => [p[0] + (pb[j][0] - p[0]) * k, p[1] + (pb[j][1] - p[1]) * k]));
  }
  return out;
}

function resample(pts, n) {
  const d = [0];
  for (let i = 1; i < pts.length; i++) d.push(d[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = d[d.length - 1] || 1, out = [];
  for (let k = 0, j = 1; k < n; k++) {
    const at = (total * k) / (n - 1);
    while (j < d.length - 1 && d[j] < at) j++;
    const u = (at - d[j - 1]) / (d[j] - d[j - 1] || 1);
    out.push([pts[j - 1][0] + (pts[j][0] - pts[j - 1][0]) * u, pts[j - 1][1] + (pts[j][1] - pts[j - 1][1]) * u]);
  }
  return out;
}

/**
 * A string of vector digits (and ':' or ' '), each `w` x `h`, `gap` apart.
 * Returns the x just past the last character.
 */
export function strokeText(g, str, x, y, { w, h, weight = 3, gap = 3, c = 1, colonW } = {}) {
  let cx = x;
  for (const ch of String(str)) {
    if (ch === ':') {
      const cw = colonW ?? Math.max(weight, 2);
      const r = weight / 2;
      g.fillCircle(cx + cw / 2, y + h * 0.3, r + 0.2, c).fillCircle(cx + cw / 2, y + h * 0.72, r + 0.2, c);
      cx += cw + gap;
    } else if (ch === ' ') cx += w + gap;
    else { strokeDigit(g, ch, cx, y, w, h, { weight, c }); cx += w + gap; }
  }
  return cx - gap;
}

// ------------------------------------------------------------ seven segment

/** Which of segments a..g (top, upper right, lower right, bottom, lower left, upper left, middle) each digit lights. */
export const SEGMENTS = {
  0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg',
  '-': 'g', ' ': '',
};

/**
 * A seven-segment digit in the box (x, y, w, h), segments `t` thick with
 * bevelled ends and a `gap` between them. `lit` overrides which segments show
 * (a string like 'abg'); `ghost` draws unlit segments at that dither level.
 */
export function segDigit(g, d, x, y, w, h, { t = 3, gap = 1, c = 1, lit, ghost = 0 } = {}) {
  const on = lit ?? SEGMENTS[d] ?? '';
  const mid = y + (h - t) / 2;
  const hx0 = x + t / 2 + gap, hx1 = x + w - t / 2 - gap;
  const vy = [[y + t / 2 + gap, mid + t / 2 - gap], [mid + t / 2 + gap, y + h - t / 2 - gap]];
  const H = (yy) => [[hx0, yy + t / 2], [hx0 + t / 2, yy], [hx1 - t / 2, yy], [hx1, yy + t / 2], [hx1 - t / 2, yy + t], [hx0 + t / 2, yy + t]];
  const V = (xx, [a, b]) => [[xx + t / 2, a], [xx + t, a + t / 2], [xx + t, b - t / 2], [xx + t / 2, b], [xx, b - t / 2], [xx, a + t / 2]];
  const shapes = {
    a: H(y), g: H(mid), d: H(y + h - t),
    f: V(x, vy[0]), b: V(x + w - t, vy[0]), e: V(x, vy[1]), c: V(x + w - t, vy[1]),
  };
  for (const [k, poly] of Object.entries(shapes)) {
    if (on.includes(k)) g.fillPolygon(poly, c);
    else if (ghost > 0) {
      const inside = polyTest(poly);
      g.fillWhere((px, py) => (inside(px, py) ? ghost : 0), c, [x, y, w, h]);
    }
  }
  return g;
}

function polyTest(points) {
  return (px, py) => {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const [xi, yi] = points[i], [xj, yj] = points[j];
      if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
}

/**
 * Text drawn as round dots on a grid, from a bitmap font: the look of an LED
 * matrix. Each font pixel becomes a disc of radius `r` on a `pitch` grid.
 */
export function dotText(g, str, x, y, { font = font5x7, pitch = 3, r = 1, c = 1 } = {}) {
  let cx = x;
  for (const ch of String(str)) {
    const gl = font.glyph(ch);
    if (gl)
      for (let j = 0; j < gl.h; j++)
        for (let i = 0; i < gl.w; i++)
          if (gl.data[j * gl.w + i]) g.fillCircle(cx + i * pitch + pitch / 2, y + j * pitch + pitch / 2, r, c);
    cx += ((gl?.w ?? font.width) + (font.spacing ?? 1)) * pitch;
  }
  return cx;
}
