// eightball: the die's lettering. A condensed, round-shouldered grotesque in
// capitals, like the raised white type moulded on a Magic 8-Ball's die:
// stroke centrelines only, laid out flat on a face in (u, v) pixels from the
// face centre, so the frame can carry them through any pose of the die and
// stroke them where they land.
//
// Numerals are tall (1 wide x 1.85 high in their own units) with full round
// bowls; letters are 1 high and ~0.62 wide. Both are drawn as polylines.

const DEG = Math.PI / 180;
function arc(cx, cy, rx, ry, a0, a1, n = 0) {
  const steps = n || Math.max(3, Math.round(Math.abs(a1 - a0) / 22));
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const a = (a0 + ((a1 - a0) * i) / steps) * DEG;
    out.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return out;
}
const cat = (...parts) => parts.flat();

// ---------------------------------------------------------------- numerals
const DH = 1.85; // numeral height in numeral widths
const BOT = DH - 0.5;
const NUM = {
  0: [cat(arc(0.5, 0.5, 0.5, 0.5, 180, 360), arc(0.5, BOT, 0.5, 0.5, 0, 180), [[0, 0.5]])],
  1: [[[0.12, 0.42], [0.62, 0], [0.62, DH]]],
  2: [cat(arc(0.5, 0.5, 0.5, 0.5, 190, 385), [[0, DH], [1.02, DH]])],
  3: [cat([[0.06, 0], [0.98, 0], [0.45, 0.74]], arc(0.5, DH - 0.56, 0.52, 0.56, 268, 512))],
  4: [[[0.74, DH], [0.74, 0], [0, 1.28], [1.04, 1.28]]],
  5: [cat([[0.92, 0], [0.14, 0], [0.07, 0.86]], arc(0.5, DH - 0.55, 0.52, 0.55, 232, 515))],
  6: [cat([[0.74, 0]], [[0.08, BOT - 0.2]]), cat(arc(0.5, BOT, 0.5, 0.5, 0, 360, 18))],
  7: [[[0, 0], [1, 0], [0.34, DH]]],
  8: [arc(0.5, 0.43, 0.43, 0.43, 0, 360, 16), arc(0.5, DH - 0.49, 0.5, 0.49, 0, 360, 18)],
  9: [arc(0.5, 0.5, 0.5, 0.5, 0, 360, 18), [[0.92, 0.7], [0.26, DH]]],
};

// ---------------------------------------------------------------- capitals
const W0 = 0.62;
const LET = {
  A: [[[0, 1], [0.31, 0], [0.62, 1]], [[0.12, 0.64], [0.5, 0.64]]],
  B: [[[0, 0.48], [0.4, 0.48], ...arc(0.4, 0.24, 0.17, 0.24, 90, -90).slice(1), [0, 0], [0, 1], [0.42, 1], ...arc(0.42, 0.74, 0.2, 0.26, 90, -90).slice(1)]],
  C: [arc(0.34, 0.5, 0.34, 0.5, -40, -320)],
  D: [[[0, 0], [0, 1], [0.24, 1], ...arc(0.24, 0.5, 0.36, 0.5, 90, -90).slice(1), [0, 0]]],
  E: [[[0.56, 0], [0, 0], [0, 1], [0.56, 1]], [[0, 0.5], [0.46, 0.5]]],
  F: [[[0.56, 0], [0, 0], [0, 1]], [[0, 0.5], [0.46, 0.5]]],
  G: [cat(arc(0.34, 0.5, 0.34, 0.5, -40, -340), [[0.68, 0.56], [0.36, 0.56]])],
  H: [[[0, 0], [0, 1]], [[0.6, 0], [0.6, 1]], [[0, 0.5], [0.6, 0.5]]],
  I: [[[0, 0], [0, 1]]],
  J: [cat([[0.46, 0]], arc(0.23, 0.76, 0.23, 0.24, 0, 180))],
  K: [[[0, 0], [0, 1]], [[0.58, 0], [0, 0.62]], [[0.2, 0.44], [0.62, 1]]],
  L: [[[0, 0], [0, 1], [0.54, 1]]],
  M: [[[0, 1], [0, 0], [0.38, 0.72], [0.76, 0], [0.76, 1]]],
  N: [[[0, 1], [0, 0], [0.62, 1], [0.62, 0]]],
  O: [arc(0.36, 0.5, 0.36, 0.5, 0, 360, 16)],
  P: [[[0, 1], [0, 0], [0.36, 0], ...arc(0.36, 0.27, 0.22, 0.27, -90, 90).slice(1), [0, 0.54]]],
  Q: [arc(0.36, 0.5, 0.36, 0.5, 0, 360, 16), [[0.44, 0.7], [0.76, 1.06]]],
  R: [[[0, 1], [0, 0], [0.36, 0], ...arc(0.36, 0.27, 0.22, 0.27, -90, 90).slice(1), [0, 0.54]], [[0.3, 0.54], [0.62, 1]]],
  S: [cat(arc(0.3, 0.25, 0.28, 0.25, -20, -270), arc(0.3, 0.75, 0.3, 0.25, -90, 160))],
  T: [[[0, 0], [0.64, 0]], [[0.32, 0], [0.32, 1]]],
  U: [cat([[0, 0]], arc(0.3, 0.68, 0.3, 0.32, 180, 0), [[0.6, 0]])],
  V: [[[0, 0], [0.31, 1], [0.62, 0]]],
  W: [[[0, 0], [0.2, 1], [0.41, 0.3], [0.62, 1], [0.82, 0]]],
  X: [[[0, 0], [0.6, 1]], [[0.6, 0], [0, 1]]],
  Y: [[[0, 0], [0.31, 0.5], [0.62, 0]], [[0.31, 0.5], [0.31, 1]]],
  Z: [[[0, 0], [0.6, 0], [0, 1], [0.6, 1]]],
  ',': [[[0.1, 0.86], [0, 1.14]]],
  '.': [[[0.05, 0.96]]],
  ':': [[[0.05, 0.32]], [[0.05, 0.96]]],
  '-': [[[0, 0.52], [0.4, 0.52]]],
  "'": [[[0.06, 0], [0.02, 0.3]]],
};

function glyphWidth(strokes) {
  let m = 0;
  for (const s of strokes) for (const [x] of s) m = Math.max(m, x);
  return m;
}

/**
 * A line of capitals laid out centred on (0, v): cap height `h` px, gaps of
 * `track` px plus the stroke between letters. Returns { strokes, w } with
 * strokes as polylines in (u, v) px and the line's width.
 */
export function layoutLine(str, h, v, track, stroke) {
  const glyphs = [];
  let x = 0;
  const sp = 0.38 * h;
  for (const ch of str) {
    if (ch === ' ') { x += sp; continue; }
    const g = LET[ch];
    if (!g) throw new Error(`eightball: no glyph '${ch}'`);
    const w = glyphWidth(g) * h;
    glyphs.push({ g, x });
    x += w + stroke + track;
  }
  const total = x - stroke - track;
  const out = [];
  for (const { g, x: gx } of glyphs)
    for (const s of g) out.push(s.map(([px, py]) => [gx + px * h - total / 2, v - h / 2 + py * h]));
  return { strokes: out, w: total };
}

/**
 * The time as tall numerals with a colon, centred on (0, v): numeral width
 * `w` px (height 1.85 w). Each numeral's strokes are grouped so the frame
 * can draw them per character.
 */
export function layoutTime(hhmm, w, v, gap, stroke) {
  const h = DH * w;
  const chars = [];
  let x = 0;
  for (const ch of hhmm) {
    if (ch === ':') {
      chars.push({ strokes: [[[x + 0.2 * w, v - h / 2 + 0.56 * h]], [[x + 0.2 * w, v - h / 2 + 0.2 * h]]] });
      x += 0.4 * w + gap;
      continue;
    }
    const g = NUM[ch];
    // the 1 is narrow: centre its stem in a slimmer cell
    const cw = ch === '1' ? 0.8 * w : w, off = ch === '1' ? -0.12 * w : 0;
    chars.push({ strokes: g.map((s) => s.map(([px, py]) => [x + off + px * w, v - h / 2 + py * (h / DH)])) });
    x += cw + gap + stroke * 0.4;
  }
  const total = x - gap - stroke * 0.4;
  for (const c of chars) c.strokes = c.strokes.map((s) => s.map(([px, py]) => [px - total / 2, py]));
  return { chars, w: total, h };
}

export const HAS_GLYPH = (ch) => ch === ' ' || ch in LET;
