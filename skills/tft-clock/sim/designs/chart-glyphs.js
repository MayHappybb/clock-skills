// The island numerals for chart.js. Each digit is the coast of an island:
// the pen path of a numeral (its skeleton, in the order a cartographer's
// quill would draw it) thickened to a stroke and roughened with two octaves
// of coast noise, so a 0 is a ring-shaped atoll, a 1 a long cape with a
// flag-shaped headland, and so on. Counters stay wide open (a lagoon must
// not close into an 8), the 4 is open at the top (so it never reads as A).
//
// For each digit and size one table is built at load (on the device: const
// tables in flash): per pixel the signed distance to the coast in quarter
// pixels (int8, negative on land) and how far along the pen path the
// nearest skeleton point is (uint8, 0..255 of the path), so the quill can
// grow the island along its path and the sea can drown it, both as integer
// lookups.

import { noise2 } from '../js/kit.js';

export const MARGIN = 11;                     // sea kept round each glyph for the water-lines

// ------------------------------------------------------------ pen paths (unit box, y down)

const L = (x0, y0, x1, y1) => ({ k: 'L', x0, y0, x1, y1 });
/** Ellipse arc, angles in degrees (0 right, 90 down), drawn from a0 to a1 (either direction). */
const A = (cx, cy, rx, ry, a0, a1) => ({ k: 'A', cx, cy, rx, ry, a0, a1 });

// each digit: a list of strokes; each stroke a list of pieces drawn without lifting the pen
const PATHS = {
  0: [[A(0.5, 0.5, 0.5, 0.5, -90, 270)]],
  1: [[L(0.12, 0.24, 0.6, 0), L(0.6, 0, 0.6, 1)]],
  2: [[A(0.5, 0.27, 0.5, 0.27, 190, 400), L(0.88, 0.44, 0, 1), L(0, 1, 1, 1)]],
  3: [[A(0.47, 0.25, 0.47, 0.25, 205, 450)], [A(0.47, 0.74, 0.53, 0.26, -90, 158)]],
  4: [[L(0.64, 0, 0, 0.7), L(0, 0.7, 1, 0.7)], [L(0.74, 0.3, 0.74, 1)]],
  5: [[L(0.95, 0, 0.14, 0), L(0.14, 0, 0.07, 0.46)], [A(0.47, 0.67, 0.53, 0.33, 218, 450 + 62)]],
  6: [[A(0.95, 0.66, 0.95, 0.66, 262, 180), A(0.5, 0.68, 0.5, 0.32, 180, -180)]],
  7: [[L(0, 0, 1, 0), L(1, 0, 0.36, 1)]],
  8: [[A(0.5, 0.235, 0.42, 0.235, 90, 450)], [A(0.5, 0.72, 0.5, 0.28, -90, 270)]],
  9: [[A(0.5, 0.32, 0.5, 0.32, 0, 360), A(0.05, 0.34, 0.95, 0.66, 0, 82)]],
};

// copperplate ball terminals: round headlands at these stroke ends (unit coords)
const BALLS = {
  2: [[0.03, 0.2]], 3: [[0.06, 0.13], [-0.0, 0.83]], 5: [[0.95, 0.02], [0.02, 0.82]],
  6: [[0.82, 0.02]], 9: [[0.2, 0.98]], 7: [], 0: [], 1: [], 4: [], 8: [],
};

/** Dense points along the pen path, in pixels: [{x, y, u, pen}] with u the length so far (air moves included). */
function penPoints(digit, ox, oy, sw, sh) {
  const pts = [];
  let u = 0, last = null;
  const push = (x, y, pen) => {
    if (last) u += Math.hypot(x - last.x, y - last.y);
    last = { x, y, u, pen };
    pts.push(last);
  };
  for (const stroke of PATHS[digit]) {
    let first = true;
    for (const p of stroke) {
      const n = p.k === 'L' ? Math.ceil(Math.hypot((p.x1 - p.x0) * sw, (p.y1 - p.y0) * sh) / 0.4) + 1
        : Math.ceil((Math.abs(p.a1 - p.a0) / 360) * Math.PI * (p.rx * sw + p.ry * sh) / 0.4) + 1;
      for (let i = 0; i <= n; i++) {
        const f = i / n;
        let x, y;
        if (p.k === 'L') { x = p.x0 + (p.x1 - p.x0) * f; y = p.y0 + (p.y1 - p.y0) * f; }
        else {
          const a = ((p.a0 + (p.a1 - p.a0) * f) * Math.PI) / 180;
          x = p.cx + p.rx * Math.cos(a); y = p.cy + p.ry * Math.sin(a);
        }
        const X = ox + x * sw, Y = oy + y * sh;
        if (first && last) {
          // the pen lifts and moves through the air to the next stroke
          const ax = last.x, ay = last.y, m = Math.ceil(Math.hypot(X - ax, Y - ay) / 0.8);
          for (let j = 1; j < m; j++) push(ax + ((X - ax) * j) / m, ay + ((Y - ay) * j) / m, false);
        }
        push(X, Y, true);
        first = false;
      }
    }
  }
  return pts;
}

/**
 * The table of one digit at one size: box w x h (the glyph) plus MARGIN all
 * round, stroke radius r. Returns { tw, th, d: Int8Array (quarter px),
 * u: Uint8Array (0..255 of the path), path: [{x, y, u}] (tip positions, 64
 * steps), len }.
 */
export function buildGlyph(digit, w, h, rmin, r, seed) {
  const tw = w + 2 * MARGIN, th = h + 2 * MARGIN;
  const sw = w - 2 * r, sh = h - 2 * r;
  const pts = penPoints(digit, MARGIN + r, MARGIN + r, sw, sh);
  const len = pts[pts.length - 1].u;
  // the swell of a copperplate stroke: full on the downstrokes, a hairline across
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 2)], b = pts[Math.min(pts.length - 1, i + 2)];
    const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
    const v = Math.abs(dy) / l;
    pts[i].r = rmin + (r - rmin) * Math.pow(v, 1.6);
  }
  const ink = pts.filter((p) => p.pen);
  for (const [bx, by] of BALLS[digit]) {
    const X = MARGIN + r + bx * sw, Y = MARGIN + r + by * sh;
    let near = ink[0];
    for (const p of ink) if (Math.hypot(p.x - X, p.y - Y) < Math.hypot(near.x - X, near.y - Y)) near = p;
    ink.push({ x: X, y: Y, u: near.u, pen: true, r: r * 0.95 });
  }
  const d = new Int8Array(tw * th), u = new Uint8Array(tw * th);
  for (let y = 0; y < th; y++)
    for (let x = 0; x < tw; x++) {
      const px = x + 0.5, py = y + 0.5;
      let best = 1e9, bu = 0;
      for (const p of ink) {
        const e = Math.sqrt((p.x - px) ** 2 + (p.y - py) ** 2) - p.r;
        if (e < best) { best = e; bu = p.u; }
      }
      // the coast: two octaves of noise, a bay here, a cape there
      const n = (noise2(px / 6, py / 6, seed) - 0.5) * 2.2 + (noise2(px / 1.7, py / 1.7, seed + 17) - 0.5) * 1.3;
      const dist = best + n;
      d[y * tw + x] = Math.max(-128, Math.min(127, Math.round(dist * 4)));
      u[y * tw + x] = Math.min(255, Math.round((bu / len) * 255));
    }
  // the quill's path: 256 steps, with whether the pen is down
  const path = [];
  let k = 0;
  for (let i = 0; i <= 256; i++) {
    const target = (i / 256) * len;
    while (k < pts.length - 1 && pts[k + 1].u < target) k++;
    const a = pts[k], b = pts[Math.min(k + 1, pts.length - 1)];
    const f = b.u > a.u ? (target - a.u) / (b.u - a.u) : 0;
    path.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, pen: a.pen || b.pen });
  }
  // hills along the spine where the land is broad, every `step` px of coast path
  const hills = [];
  const step = r > 5 ? 9 : 8;
  let nextU = step * 0.6;
  for (const p of ink) {
    if (p.u < nextU) continue;
    const t = Math.floor(p.y) * tw + Math.floor(p.x);
    if (d[t] < -(r - 0.8) * 4) { hills.push({ x: p.x, y: p.y, u: Math.round((p.u / len) * 255) }); nextU = p.u + step; }
  }
  return { tw, th, d, u, path, len, w, h, r, hills };
}
