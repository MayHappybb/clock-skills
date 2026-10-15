// Starry Night numerals: each digit is a stream of wind, drawn as centre
// lines (paths) that the brushstrokes run along. A glyph is baked once at
// load into a small map (flash): per pixel, which lane of which path it lies
// in (three body lanes across the stroke, one dark keyline lane outside it,
// then two lanes of sky strokes that echo the digit's contour, the way Van
// Gogh rings everything with its own wake) and how far along the path it is. Strokes are 8 px dashes along that
// arc, so moving them is just an offset per lane per frame.
//
// Box 24 x 40 px, centre lines inset 3.5 px, stroke ~6.4 px (tapering to
// ~4 px at open ends, like a loaded brush lifting). Every counter keeps at
// least ~8 x 9 px of ground; the 4 is open at the top, the 1 has a flag
// only, the 6 and 9 have long hooks so neither closes into a 0.

export const GW = 24, GH = 40, MG = 7, MW = GW + 2 * MG, MH = GH + 2 * MG;
export const HW = 3.2, MOAT = 2.3, ECHO = 2.4, LEN = 8;
export const NONE = 255;

const D2R = Math.PI / 180;

/** Sample a path built from simple commands into points ~0.25 px apart. */
function build(cmds) {
  const pts = [];
  let px = 0, py = 0;
  const push = (x, y) => {
    if (pts.length) {
      const [lx, ly] = pts[pts.length - 1];
      const d = Math.hypot(x - lx, y - ly);
      if (d < 1e-6) return;
      const n = Math.ceil(d / 0.25);
      for (let i = 1; i <= n; i++) pts.push([lx + ((x - lx) * i) / n, ly + ((y - ly) * i) / n]);
    } else pts.push([x, y]);
    px = x; py = y;
  };
  for (const c of cmds) {
    const [op, ...a] = c;
    if (op === 'M') push(a[0], a[1]);
    else if (op === 'L') push(a[0], a[1]);
    else if (op === 'C') {
      const [x1, y1, x2, y2, x3, y3] = a, x0 = px, y0 = py;
      for (let i = 1; i <= 64; i++) {
        const t = i / 64, u = 1 - t;
        push(u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
          u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3);
      }
    } else if (op === 'A') {
      // ellipse arc: centre, radii, from angle a0 to a1 (degrees, screen: 90 = down)
      const [cx, cy, rx, ry, a0, a1] = a;
      const n = Math.ceil(Math.abs(a1 - a0) / 2);
      for (let i = 0; i <= n; i++) {
        const t = (a0 + ((a1 - a0) * i) / n) * D2R;
        push(cx + rx * Math.cos(t), cy + ry * Math.sin(t));
      }
    }
  }
  return pts;
}

const P = (closed, cmds) => ({ closed, pts: build(cmds) });

const SHAPES = {
  0: [P(true, [['A', 12, 20, 8.5, 16.5, -90, 270]])],
  1: [P(false, [['M', 4.5, 12.5], ['C', 8, 11.5, 11.5, 8, 13.5, 3.5], ['L', 13.5, 36.5]])],
  2: [P(false, [['A', 12, 12, 8.5, 8.5, 172, 390], ['C', 16.5, 21.5, 8, 28, 3.5, 36.5], ['L', 20.5, 36.5]])],
  3: [
    P(false, [['A', 11.5, 11.5, 8, 8, 196, 450], ['L', 7.5, 19.5]]),
    P(false, [['M', 7.5, 19.5], ['L', 11.5, 19.5], ['A', 11.5, 28, 8.5, 8.5, -90, 162]]),
  ],
  4: [
    P(false, [['M', 7.5, 3.5], ['C', 6.5, 10, 4.8, 17, 4, 25], ['L', 21, 25]]),
    P(false, [['M', 15.5, 10.5], ['L', 15.5, 36.5]]),
  ],
  5: [P(false, [['M', 20, 3.5], ['L', 6.5, 3.5], ['L', 5.5, 17], ['C', 9, 14.2, 20.5, 14, 20.5, 26], ['C', 20.5, 36.5, 9, 39, 3.5, 32.5]])],
  6: [P(false, [['M', 18.5, 5], ['C', 10, 4.5, 3.5, 12, 3.5, 26], ['L', 3.5, 27.5], ['A', 12, 27.5, 8.5, 8.5, 180, -180]])],
  7: [P(false, [['M', 3.5, 3.5], ['L', 20.5, 3.5], ['C', 15.5, 13, 11, 24, 10, 36.5]])],
  8: [
    P(true, [['A', 12, 11.5, 7.5, 8, 90, 450]]),
    P(true, [['A', 12, 28, 8.5, 8.5, -90, -450]]),
  ],
};
// the 9 is the 6 turned half round (its hook then sweeps down and left)
SHAPES[9] = SHAPES[6].map((p) => ({ closed: p.closed, pts: p.pts.map(([x, y]) => [GW - x, GH - y]) }));

/**
 * Bake one glyph: lane (path * 8 + sub, sub 0..2 body lanes, 3 keyline, 4-5 echo;
 * NONE outside), arc position s (scaled on closed paths so a loop holds a
 * whole number of strokes), per-path period, and the pixel count.
 */
function bake(paths) {
  const N = MW * MH;
  const lane = new Uint8Array(N).fill(NONE), arc = new Uint16Array(N);
  const per = [], plen = [];
  const cum = paths.map((p) => {
    const c = [0];
    for (let i = 1; i < p.pts.length; i++) c.push(c[i - 1] + Math.hypot(p.pts[i][0] - p.pts[i - 1][0], p.pts[i][1] - p.pts[i - 1][1]));
    return c;
  });
  paths.forEach((p, k) => {
    const L = cum[k][cum[k].length - 1];
    plen.push(L);
    per.push(p.closed ? Math.max(3, Math.round(L / LEN)) * LEN : LEN * 1024);
  });
  let ink = 0;
  for (let py = 0; py < MH; py++) for (let px = 0; px < MW; px++) {
    const x = px - MG + 0.5, y = py - MG + 0.5;
    let best = 1e9, bp = 0, bs = 0, side = 0;
    paths.forEach((p, k) => {
      const pts = p.pts, c = cum[k];
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
        const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
        let t = ((x - ax) * dx + (y - ay) * dy) / l2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = ax + dx * t - x, qy = ay + dy * t - y, d = qx * qx + qy * qy;
        if (d < best) { best = d; bp = k; bs = c[i] + t * Math.sqrt(l2); side = dx * (y - ay) - dy * (x - ax); }
      }
    });
    const d = Math.sqrt(best), L = plen[bp];
    // open ends taper like a brush lifting off
    const w = paths[bp].closed ? HW : HW * Math.min(1, 0.66 + 0.34 * Math.min(bs, L - bs) / 5);
    const i = py * MW + px;
    let sub = NONE;
    if (d < w) {
      const q = (side >= 0 ? d : -d) / w;
      sub = q < -0.34 ? 0 : q < 0.34 ? 1 : 2;
      ink++;
    } else if (d < w + MOAT) sub = 3;
    else if (d < w + MOAT + ECHO) sub = 4;
    else if (d < w + MOAT + 2 * ECHO) sub = 5;
    if (sub === NONE) continue;
    lane[i] = bp * 8 + sub;
    arc[i] = paths[bp].closed ? Math.round((bs * per[bp]) / L) % per[bp] : Math.round(bs);
  }
  return { lane, arc, per, plen, ink, paths: paths.length };
}

export const GLYPHS = Array.from({ length: 10 }, (_, d) => bake(SHAPES[d]));
