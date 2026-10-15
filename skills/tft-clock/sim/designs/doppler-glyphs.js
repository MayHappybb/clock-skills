// The numerals for doppler.js: each digit is a squall line, a chain of
// convective cells strung along a skeleton path. Built once at load into
// three byte tables per digit and size (const tables in flash on the device):
//   LINE  the line's reflectivity, dBZ: peak on the skeleton, falling off
//         with distance (so the bands are parallel ribbons round the stroke)
//   CELL  the cells' reflectivity, dBZ: round bumps at beads along the path,
//         the hottest cores (hail, magenta) on one or two per digit
//   CID   which cell a pixel belongs to (so each core can flicker on its own)
// The skeletons are drawn for the glass: bowls are ellipses, the 4 is open
// at the top-left (never an A), the 9's tail curls into a hook echo, the 3's
// bowls are bow echoes. Slanted forward, as a line leans into its motion.

import { hash } from '../js/kit.js';

const D2R = Math.PI / 180;
/** Points along an ellipse arc (unit coords), angles in degrees: 0 right, 90 down. */
function arc(cx, cy, rx, ry, a0, a1, n = 40) {
  const p = [];
  for (let i = 0; i <= n; i++) {
    const a = (a0 + ((a1 - a0) * i) / n) * D2R;
    p.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return p;
}
/** Quadratic Bezier from a through control c to b. */
function bez(a, c, b, n = 24) {
  const p = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    p.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]);
  }
  return p;
}
const join = (...ps) => ps.reduce((a, b) => a.concat(b), []);

// Each digit: a list of strokes, each a polyline in the unit box (x right, y down).
const SKEL = [
  [arc(0.5, 0.5, 0.5, 0.5, -90, 270, 64)],
  [[[0.12, 0.2], [0.6, 0]], [[0.6, 0], [0.6, 1]]],
  [join(arc(0.5, 0.27, 0.5, 0.27, 190, 385, 32), bez([0.95, 0.38], [0.5, 0.68], [0.0, 1.0])), [[0, 1], [1, 1]]],
  [join(arc(0.47, 0.25, 0.47, 0.25, 205, 450, 36)), arc(0.5, 0.74, 0.5, 0.26, 265, 515, 36)],
  [[[0.74, 0], [-0.04, 0.68], [1.06, 0.68]], [[0.8, 0.04], [0.8, 1]]],
  [[[0.96, 0], [0.12, 0], [0.07, 0.44]], arc(0.48, 0.67, 0.52, 0.33, 220, 500, 40)],
  [join(bez([0.88, 0.02], [0.06, 0.12], [0.02, 0.66])), arc(0.5, 0.68, 0.48, 0.32, 0, 360, 48)],
  [[[0, 0], [1, 0]], bez([1, 0], [0.5, 0.42], [0.32, 1])],
  [arc(0.5, 0.235, 0.41, 0.235, 0, 360, 44), arc(0.5, 0.71, 0.5, 0.29, 0, 360, 48)],
  [arc(0.5, 0.32, 0.48, 0.32, 0, 360, 48), join(bez([0.98, 0.32], [1.0, 0.92], [0.3, 0.98]), bez([0.3, 0.98], [0.02, 1.0], [0.04, 0.84], 10))],
];

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let u = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  u = u < 0 ? 0 : u > 1 ? 1 : u;
  const ex = px - ax - u * dx, ey = py - ay - u * dy;
  return Math.sqrt(ex * ex + ey * ey);
}

export const SHEAR = 0.13;       // forward lean: x shifts right by SHEAR per px up
export const MARGIN = 9;         // table padding round the skeleton rect
const MOVE = [0.92, -0.39];      // the storms move east-north-east
const ASYM = 0.24;

/**
 * One size of numeral. sw x sh is the skeleton rect (stroke centre lines);
 * peak and slope set the line's profile in dBZ and dBZ/px; cellStep the
 * spacing of cells along the path, px.
 */
function size(sw, sh, { peak, slope, cellPeak, cellSlope, cellStep, seed }) {
  const pad = MARGIN + Math.ceil(SHEAR * sh / 2);
  const tw = sw + 2 * pad, th = sh + 2 * MARGIN;
  const ox = pad, oy = MARGIN;         // skeleton rect origin inside the table
  const glyphs = SKEL.map((strokes, d) => {
    // map to px, shear about the rect's middle
    const ps = strokes.map((s) => s.map(([u, v]) => {
      const y = oy + v * sh, x = ox + u * sw + SHEAR * (oy + sh / 2 - y);
      return [x, y];
    }));
    // cells along each stroke, evenly by arc length
    const cells = [];
    for (const s of ps) {
      let len = 0;
      for (let i = 1; i < s.length; i++) len += Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]);
      const n = Math.max(1, Math.round(len / cellStep));
      const step = len / n;
      let want = step / 2, acc = 0;
      for (let i = 1; i < s.length && cells.length < 40; i++) {
        const l = Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]);
        while (want <= acc + l) {
          const f = (want - acc) / l;
          cells.push([s[i - 1][0] + (s[i][0] - s[i - 1][0]) * f, s[i - 1][1] + (s[i][1] - s[i - 1][1]) * f]);
          want += step;
        }
        acc += l;
      }
    }
    // cell strengths: most strong, one or two hail cores
    const hot = hash(d, seed, 1) % cells.length, hot2 = (hot + 2 + (hash(d, seed, 2) % Math.max(1, cells.length - 3))) % cells.length;
    const cpk = cells.map((_, i) => cellPeak - 9 + (hash(d, i, seed) % 10) + (i === hot ? 10 : i === hot2 && cells.length > 4 ? 8 : 0));
    const csl = cells.map((_, i) => cellSlope * (0.85 + (hash(d, i, seed + 5) % 30) / 100));
    const LINE = new Uint8Array(tw * th), CELL = new Uint8Array(tw * th), CID = new Uint8Array(tw * th);
    for (let y = 0; y < th; y++)
      for (let x = 0; x < tw; x++) {
        const px = x + 0.5, py = y + 0.5;
        let dl = 1e9, nx = 0, ny = 0;
        for (const s of ps) for (let i = 1; i < s.length; i++) {
          const e = segDist(px, py, s[i - 1][0], s[i - 1][1], s[i][0], s[i][1]);
          if (e < dl) {
            dl = e;
            const ax = s[i - 1][0], ay = s[i - 1][1], dx = s[i][0] - ax, dy = s[i][1] - ay, l2 = dx * dx + dy * dy;
            const u = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
            nx = px - (ax + u * dx); ny = py - (ay + u * dy);
          }
        }
        let best = 0, bc = 0;
        for (let i = 0; i < cells.length; i++) {
          const v = cpk[i] - csl[i] * Math.hypot(px - cells[i][0], py - cells[i][1]);
          if (v > best) { best = v; bc = i; }
        }
        // the line is strong where its cells are strong, and asymmetric: a
        // tight gradient on the leading (east) edge, a softer trailing side
        const nl = Math.hypot(nx, ny) || 1, lead = (nx * MOVE[0] + ny * MOVE[1]) / nl;
        const sl = slope * (1 + ASYM * lead), pk = peak + 0.5 * (cpk[bc] - cellPeak);
        const k = y * tw + x;
        LINE[k] = Math.max(0, Math.round(pk - sl * dl));
        CELL[k] = Math.max(0, Math.round(best));
        CID[k] = bc;
      }
    return { LINE, CELL, CID, cells, n: cells.length };
  });
  // every pixel any digit can ever reach (for keeping showers clear)
  const ANY = new Uint8Array(tw * th);
  for (const gl of glyphs) for (let k = 0; k < ANY.length; k++) if (gl.LINE[k] > 8 || gl.CELL[k] > 8) ANY[k] = 1;
  return { sw, sh, tw, th, ox, oy, glyphs, ANY };
}

export const HOUR = size(20, 55, { peak: 53, slope: 7.2, cellPeak: 63, cellSlope: 8, cellStep: 9.5, seed: 11 });
export const MIN = size(17, 43, { peak: 52, slope: 8.2, cellPeak: 62, cellSlope: 9, cellStep: 8.5, seed: 23 });

/** Slots: the skeleton rect's top-left on the glass. Hours tall at the left, minutes lower right. */
export const SLOTS = [
  { x: 9, y: 12, S: HOUR }, { x: 41, y: 12, S: HOUR },
  { x: 89, y: 28, S: MIN }, { x: 117, y: 28, S: MIN },
].map((s) => ({ ...s, bx: s.x - s.S.ox, by: s.y - s.S.oy }));   // bx, by: table origin on the glass

export const FLASH_BYTES = 10 * 3 * (HOUR.tw * HOUR.th + MIN.tw * MIN.th);
