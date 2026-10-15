// Neon: bent glass, as data. A tube is written like an SVG path in the
// sign-maker's own terms (where the glass runs, where it is painted black,
// where its electrodes are), sampled into short straight runs, and then
// rasterised ONCE into a sparse light field: for every pixel near the glass,
// how far it is from the lit tube (quarter pixels), which point along the
// tube is nearest (arc length, px), and how far it is from black-painted
// blockout. A frame only looks these up (neon.js), so on the device every
// tube is a flash table of a few bytes a pixel.
//
// Path commands (numbers are px, angles degrees, y down):
//   M x y              start a new tube here (an electrode)
//   L x y              straight run
//   C x1 y1 x2 y2 x y  a bend (cubic)
//   A cx cy r a0 a1    a bend round a circle, from angle a0 to a1 (a straight
//                      run joins the current point to its start)
//   K                  toggle blockout: the runs that follow are painted black

export const STEP = 0.5;          // sampling of bends, px
export const PAD = 10;            // how far the glow is kept around the glass, px
export const DQ = 4;              // distance quantum: 1/4 px

/** Parse a path into tubes: each a list of runs [ax, ay, bx, by, blk]. */
export function parsePath(str, tf = null) {
  const tok = str.trim().split(/[\s,]+/);
  const tubes = [];
  let cur = null, x = 0, y = 0, blk = false, i = 0;
  const P = (px, py) => (tf ? tf(px, py) : [px, py]);
  const run = (nx, ny) => {
    const [ax, ay] = P(x, y), [bx, by] = P(nx, ny);
    if (Math.hypot(bx - ax, by - ay) > 1e-6) cur.push([ax, ay, bx, by, blk]);
    x = nx; y = ny;
  };
  const num = () => parseFloat(tok[i++]);
  while (i < tok.length) {
    const c = tok[i++];
    if (c === 'M') { cur = []; tubes.push(cur); x = num(); y = num(); blk = false; }
    else if (c === 'L') run(num(), num());
    else if (c === 'K') blk = !blk;
    else if (c === 'C') {
      const x0 = x, y0 = y, x1 = num(), y1 = num(), x2 = num(), y2 = num(), x3 = num(), y3 = num();
      const len = Math.hypot(x1 - x0, y1 - y0) + Math.hypot(x2 - x1, y2 - y1) + Math.hypot(x3 - x2, y3 - y2);
      const n = Math.max(2, Math.ceil(len / STEP));
      for (let k = 1; k <= n; k++) {
        const t = k / n, u = 1 - t;
        run(u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
          u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3);
      }
    } else if (c === 'A') {
      const cx = num(), cy = num(), r = num(), a0 = num() * Math.PI / 180, a1 = num() * Math.PI / 180;
      run(cx + r * Math.cos(a0), cy + r * Math.sin(a0));
      const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) * r / STEP));
      for (let k = 1; k <= n; k++) {
        const a = a0 + (a1 - a0) * k / n;
        run(cx + r * Math.cos(a), cy + r * Math.sin(a));
      }
    } else throw new Error(`neon path: bad command ${c}`);
  }
  return tubes;
}

/**
 * Rasterise tubes into a sparse light field over the integer pixel centres
 * of a box. Pixel centres sit at integer coordinates of the path space plus
 * `half` (0.5 for screen paths, 0 for glyph paths placed at .5 origins).
 * Returns { n, x, y, d, s, b, L, dead }:
 *   d  distance to the lit glass in 1/4 px (255 = far)
 *   s  arc length of the nearest lit point, px (one global count per element,
 *      tube after tube, so a front can run through the whole element)
 *   b  distance to blockout in 1/4 px (255 = none near)
 *   L  total arc length; dead[s] = 1 where the glass holds an electrode
 */
export function rasterise(tubes, box, { half = 0, dead = 1.8, keep = PAD } = {}) {
  // arc length along each tube; electrode ends are the first and last `dead` px of lit glass
  const segs = [];
  let S = 0;
  const deadRanges = [];
  for (const t of tubes) {
    const s0 = S;
    for (const [ax, ay, bx, by, blk] of t) {
      const len = Math.hypot(bx - ax, by - ay);
      segs.push({ ax, ay, bx, by, blk, s0: S, len });
      S += len;
    }
    if (dead > 0) { deadRanges.push([s0, s0 + dead]); deadRanges.push([S - dead, S]); }
    S += 2;                               // a short break in the count between tubes
  }
  const L = Math.ceil(S) + 1;
  const deadA = new Uint8Array(L + 1);
  for (const [a, b] of deadRanges) for (let s = Math.floor(a); s <= Math.ceil(b) && s <= L; s++) if (s >= a - 0.5 && s <= b + 0.5) deadA[s] = 1;

  const [x0, y0, x1, y1] = box;
  const X = [], Y = [], D = [], Sa = [], B = [];
  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      const cx = px + half, cy = py + half;
      let best = 1e9, bs = 0, bb = 1e9;
      for (const g of segs) {
        const dx = g.bx - g.ax, dy = g.by - g.ay;
        let t = g.len > 0 ? ((cx - g.ax) * dx + (cy - g.ay) * dy) / (g.len * g.len) : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = g.ax + dx * t - cx, ey = g.ay + dy * t - cy, dd = ex * ex + ey * ey;
        if (g.blk) { if (dd < bb) bb = dd; }
        else if (dd < best) { best = dd; bs = g.s0 + g.len * t; }
      }
      const d = Math.sqrt(best), db = Math.sqrt(bb);
      if (d > keep && db > 2.5) continue;
      X.push(px); Y.push(py);
      D.push(Math.min(255, Math.round(d * DQ)));
      Sa.push(Math.min(L, Math.round(bs)));
      B.push(Math.min(255, Math.round(db * DQ)));
    }
  }
  return {
    n: X.length, x: Int16Array.from(X), y: Int16Array.from(Y), d: Uint8Array.from(D),
    s: Uint16Array.from(Sa), b: Uint8Array.from(B), L, dead: deadA,
  };
}

// ------------------------------------------------------------ light and glass, as tables

const clamp8 = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
const rgbOf = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];

/** Glow falloff by quarter-pixel distance (0..255): a tight bright halo and a long soft one. */
export const GLOW = new Uint16Array(256);
for (let q = 0; q < 256; q++) {
  const d = q / DQ, e = Math.max(0, d - 1.2);
  GLOW[q] = d > PAD ? 0 : clamp8(255 * (0.55 * Math.exp(-e / 1.25) + 0.2 * Math.exp(-e / 3.6)));
}

/** Coverage of the glass body by quarter-pixel distance, for a tube of half-width hw. */
export function coverage(hw) {
  const a = new Uint8Array(256);
  for (let q = 0; q < 256; q++) a[q] = clamp8(255 * Math.min(1, Math.max(0, (hw + 0.45 - q / DQ) / 0.9)));
  return a;
}

export const LEVELS = 32, BODY_Q = 10;   // brightness levels x distance steps inside the glass

/**
 * One gas colour as tables. `deep` is the tube barely lit, `tube` the gas
 * at full, `hot` the over-driven white core, `halo` the light it throws on
 * the wall. Body colours are indexed [level * BODY_Q + dq]; level 0 is
 * unlit glass.
 */
export function gas({ deep, tube, hot, halo, glass = 0x56505e }) {
  const D = rgbOf(deep), T = rgbOf(tube), Hh = rgbOf(hot), G = rgbOf(glass);
  const r = new Uint8Array(LEVELS * BODY_Q), g = new Uint8Array(LEVELS * BODY_Q), b = new Uint8Array(LEVELS * BODY_Q);
  for (let l = 0; l < LEVELS; l++) {
    const u = l / (LEVELS - 1);
    for (let q = 0; q < BODY_Q; q++) {
      let c;
      if (l === 0) c = G;
      else {
        const k = Math.min(1, u / 0.62);
        const base = D.map((v, i) => v + (T[i] - v) * k);
        // the white core: always a little paler at the centre once lit, white-hot when over-driven
        const heat = Math.max(0, (u - 0.55) / 0.45);
        const prof = Math.max(0, 1 - q / 5.5);
        const w = Math.min(1, prof * (0.18 + 0.82 * heat) + (q < 8 ? 0.35 * heat * heat : 0));
        c = base.map((v, i) => v + (Hh[i] - v) * w);
      }
      r[l * BODY_Q + q] = clamp8(c[0]); g[l * BODY_Q + q] = clamp8(c[1]); b[l * BODY_Q + q] = clamp8(c[2]);
    }
  }
  const [hr, hg, hb] = rgbOf(halo);
  return { r, g, b, hr, hg, hb };
}
