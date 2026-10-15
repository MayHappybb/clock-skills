// Metro's line geometry: the ten digit routes and the Circle line, rasterised
// once into coverage masks (with arc length per pixel, for laying track) and
// given closed-form timetables for their trains.
import * as kit from '../js/kit.js';

// Each digit is one or more routes on a 14 x 18 centre-line box, only 0/45/90
// degree segments. `rings` are interchanges (crossings and junctions).
export const CELL = { w: 14, h: 18 };
const DIG = {
  0: { paths: [{ p: [[4, 0], [10, 0], [14, 4], [14, 14], [10, 18], [4, 18], [0, 14], [0, 4]], loop: true }] },
  1: { paths: [{ p: [[3, 4], [7, 0], [7, 18]] }] },
  2: { paths: [{ p: [[0, 4], [4, 0], [10, 0], [14, 4], [14, 5], [1, 18], [14, 18]] }] },
  3: { paths: [{ p: [[0, 0], [10, 0], [14, 4], [14, 5], [10, 9], [14, 13], [14, 14], [10, 18], [0, 18]] }, { p: [[10, 9], [4, 9]] }], rings: [[10, 9]] },
  4: { paths: [{ p: [[10, 18], [10, 0], [0, 10], [14, 10]] }], rings: [[10, 10]] },
  5: { paths: [{ p: [[14, 0], [1, 0], [1, 8], [10, 8], [14, 12], [14, 14], [10, 18], [0, 18]] }] },
  6: { paths: [{ p: [[12, 0], [4, 0], [0, 4], [0, 14], [4, 18], [10, 18], [14, 14], [14, 12], [10, 8], [0, 8]] }], rings: [[0, 8]] },
  7: { paths: [{ p: [[0, 0], [14, 0], [14, 3], [6, 11], [6, 18]] }] },
  8: { paths: [{ p: [[7, 9], [12, 4], [12, 3], [9, 0], [5, 0], [2, 3], [2, 4], [7, 9], [14, 16], [12, 18], [2, 18], [0, 16], [7, 9]], loop: true }], rings: [[7, 9]] },
  9: { paths: [{ p: [[2, 18], [10, 18], [14, 14], [14, 4], [10, 0], [4, 0], [0, 4], [0, 6], [4, 10], [14, 10]] }], rings: [[14, 10]] },
};

// The Circle line round the panel's edge, clockwise from the top centre, and
// its twelve stations (one every five seconds).
const CIRC = [[31.5, 1.5], [56.5, 1.5], [62.5, 7.5], [62.5, 56.5], [56.5, 62.5], [7.5, 62.5], [1.5, 56.5], [1.5, 7.5], [7.5, 1.5]];
const CIRC_ST = [[31.5, 1.5], [47.5, 1.5], [62.5, 15.5], [62.5, 31.5], [62.5, 47.5], [47.5, 62.5], [31.5, 62.5], [15.5, 62.5], [1.5, 47.5], [1.5, 31.5], [1.5, 15.5], [15.5, 1.5]];

const V = 8;          // train cruising speed, px/s
const DWELL = 0.9;    // s at each station

/** A polyline with arc length, position and a timetable. */
function makePath(pts, loop) {
  const P = loop ? [...pts, pts[0]] : pts.slice();
  // a loop given with its start repeated at the end (the 8) is not doubled
  if (loop && pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) P.pop();
  const cum = [0];
  for (let k = 1; k < P.length; k++) cum.push(cum[k - 1] + Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]));
  const len = cum[cum.length - 1];
  const path = {
    P, cum, len, loop,
    pos(s) {
      if (loop) s = ((s % len) + len) % len; else s = kit.clamp(s, 0, len);
      let k = 1;
      while (k < cum.length - 1 && cum[k] < s) k++;
      const a = P[k - 1], b = P[k], seg = cum[k] - cum[k - 1] || 1, u = (s - cum[k - 1]) / seg;
      return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
    },
  };
  return path;
}

/** Ping-pong (open) or circulating (loop) timetable through stops (sorted arc lengths). */
function timetable(path, stops) {
  const seq = [];
  if (path.loop) {
    for (let k = 0; k < stops.length; k++) seq.push([stops[k], k + 1 < stops.length ? stops[k + 1] : stops[0] + path.len]);
  } else {
    for (let k = 0; k + 1 < stops.length; k++) seq.push([stops[k], stops[k + 1]]);
    for (let k = stops.length - 1; k > 0; k--) seq.push([stops[k], stops[k - 1]]);
  }
  const legs = [];
  let T = 0;
  for (const [a, b] of seq) {
    const run = 0.5 + Math.abs(b - a) / V;
    legs.push({ a, b, t0: T, run });
    T += DWELL + run;
  }
  path.T = T;
  path.sAt = (t) => {
    if (!legs.length) return 0;
    const tt = ((t % T) + T) % T;
    let k = legs.length - 1;
    while (k > 0 && legs[k].t0 > tt) k--;
    const L = legs[k], local = tt - L.t0;
    if (local < DWELL) return L.a;
    return L.a + (L.b - L.a) * kit.ease.inOut(kit.clamp((local - DWELL) / L.run));
  };
}

/** Nearest point on any of `segs` to (x, y): [distance, global arc length]. */
function nearest(segs, x, y) {
  let best = 1e9, bs = 0;
  for (const g of segs) {
    const dx = g.bx - g.ax, dy = g.by - g.ay, L2 = dx * dx + dy * dy;
    const t = L2 ? kit.clamp(((x - g.ax) * dx + (y - g.ay) * dy) / L2) : 0;
    const d = Math.hypot(x - g.ax - t * dx, y - g.ay - t * dy);
    if (d < best) { best = d; bs = g.s0 + t * g.len; }
  }
  return [best, bs];
}

/**
 * Rasterise digit `d` (or 'circle') with its box at grid (ox, oy).
 * Returns masks over a bounding box and the routes with timetables.
 */
export function buildGlyph(d, ox, oy, seed) {
  const isCircle = d === 'circle';
  const def = isCircle ? { paths: [{ p: CIRC, loop: true }], rings: [[31.5, 1.5]] } : DIG[d];
  const width = isCircle ? 2 : 3;
  const off = isCircle ? [0, 0] : [ox, oy];
  const paths = def.paths.map((r) => makePath(r.p.map(([x, y]) => [x + off[0], y + off[1]]), !!r.loop));
  // segments with global arc length
  const segs = [];
  let L = 0;
  paths.forEach((p, pi) => {
    p.offset = L;
    for (let k = 1; k < p.P.length; k++) {
      const [ax, ay] = p.P[k - 1], [bx, by] = p.P[k];
      segs.push({ ax, ay, bx, by, s0: L + p.cum[k - 1], len: p.cum[k] - p.cum[k - 1], pi });
    }
    L += p.len;
  });
  const cx = off[0] + CELL.w / 2, cy = off[1] + CELL.h / 2;

  // terminus bars at free ends of open routes
  const bars = [];
  for (const p of paths) {
    if (p.loop) continue;
    for (const end of [0, 1]) {
      const a = end ? p.P[p.P.length - 1] : p.P[0], b = end ? p.P[p.P.length - 2] : p.P[1];
      const others = segs.filter((g) => !(g.ax === a[0] && g.ay === a[1]) && !(g.bx === a[0] && g.by === a[1]));
      if (nearest(others, a[0], a[1])[0] < 0.6) continue; // joins another line: no bar
      const ux = b[0] - a[0], uy = b[1] - a[1], ul = Math.hypot(ux, uy), nx = -uy / ul, ny = ux / ul;
      bars.push({ ax: a[0] - nx * 2.5, ay: a[1] - ny * 2.5, bx: a[0] + nx * 2.5, by: a[1] + ny * 2.5, s: p.offset + (end ? p.len : 0) });
    }
  }

  // stations: white ticks on the outer side of straight runs
  const ticks = [];   // { ax, ay, bx, by, w, s, path, ls }
  const stopsOf = paths.map(() => []);
  if (isCircle) {
    const p = paths[0];
    CIRC_ST.forEach(([x, y], k) => {
      const ls = nearest(segs, x, y)[1];
      stopsOf[0].push(ls);
      if (k === 0) return; // the depot is a ring
      const nx = x < 2 ? 1 : x > 62 ? -1 : 0, ny = y < 2 ? 1 : y > 62 ? -1 : 0;
      ticks.push({ ax: x + nx * 1.2, ay: y + ny * 1.2, bx: x + nx * 2.6, by: y + ny * 2.6, w: 2, s: ls });
    });
    p.stations = stopsOf[0].slice();
  } else {
    for (const g of segs) {
      const horiz = g.ay === g.by, vert = g.ax === g.bx;
      if (!(horiz || vert) || g.len < 6) continue;
      const n = g.len >= 14 ? 2 : 1;
      for (let m = 1; m <= n; m++) {
        const u = m / (n + 1);
        let x = g.ax + (g.bx - g.ax) * u, y = g.ay + (g.by - g.ay) * u;
        x = Math.round(x); y = Math.round(y);
        let nx = horiz ? 0 : Math.sign(x - cx) || 1, ny = horiz ? Math.sign(y - cy) || 1 : 0;
        const ok = (sx, sy) => {
          const ex = x + sx * 3.4, ey = y + sy * 3.4;
          const near = segs.filter((h) => h !== g);
          return nearest(near, ex, ey)[0] > 2.6 && nearest(near, x + sx * 2, y + sy * 2)[0] > 2.4;
        };
        if (!ok(nx, ny)) { nx = -nx; ny = -ny; if (!ok(nx, ny)) continue; }
        const gs = nearest([g], x, y)[1];
        ticks.push({ ax: x + nx * 1.6, ay: y + ny * 1.6, bx: x + nx * 3.2, by: y + ny * 3.2, w: 1, s: gs });
        stopsOf[g.pi].push(gs - paths[g.pi].offset);
      }
    }
  }
  const rings = (def.rings ?? []).map(([x, y]) => {
    const [, s] = nearest(segs, x + off[0], y + off[1]);
    return { x: x + off[0], y: y + off[1], s };
  });

  // timetables
  paths.forEach((p, pi) => {
    let st = stopsOf[pi].slice().sort((a, b) => a - b);
    if (!p.loop) st = [0, ...st.filter((s) => s > 2 && s < p.len - 2), p.len];
    else if (!st.length) st = [0, p.len / 2];
    timetable(p, st);
    p.n = isCircle ? 1 : p.len >= 44 ? 2 : p.len >= 14 ? 1 : 0;
    p.phase = kit.hash(seed, pi) * p.T;
  });

  // masks
  const x0 = isCircle ? 0 : ox - 5, y0 = isCircle ? 0 : oy - 5;
  const bw = isCircle ? 64 : CELL.w + 11, bh = isCircle ? 64 : CELL.h + 11, N = bw * bh;
  const cov = new Float32Array(N), s = new Float32Array(N), deco = new Float32Array(N), decoS = new Float32Array(N), hole = new Float32Array(N);
  for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) {
    const x = x0 + i, y = y0 + j, q = j * bw + i;
    const [dl, sl] = nearest(segs, x, y);
    let c = kit.clamp(width / 2 + 0.5 - dl), sv = sl;
    for (const b of bars) {
      const db = kit.segDist(x, y, b.ax, b.ay, b.bx, b.by), cb = kit.clamp(1 + 0.5 - db);
      if (cb > c) { c = cb; sv = b.s; }
    }
    cov[q] = c; s[q] = sv;
    let dc = 0, ds = 0;
    for (const t of ticks) {
      const dt = kit.segDist(x, y, t.ax, t.ay, t.bx, t.by), ct = kit.clamp(t.w / 2 + 0.5 - dt) * 0.75;
      if (ct > dc) { dc = ct; ds = t.s; }
    }
    for (const r of rings) {
      const dr = Math.hypot(x - r.x, y - r.y), rr = isCircle ? 2.6 : 2.3;
      const cr = kit.clamp(0.75 + 0.5 - Math.abs(dr - rr));
      if (cr > dc) { dc = cr; ds = r.s; }
      hole[q] = Math.max(hole[q], kit.clamp(rr - 0.9 - dr + 0.5));
    }
    deco[q] = dc; decoS[q] = ds;
  }

  const at = (head) => {
    for (const p of paths) if (head <= p.offset + p.len) return p.pos(Math.max(0, head - p.offset));
    return null;
  };
  const glyph = { x0, y0, bw, bh, cov, s, deco, decoS, hole, L, paths, at };
  if (isCircle) {
    const st = paths[0].stations, len = paths[0].len;
    glyph.secAt = (t) => {
      const sec = ((t % 60) + 60) % 60, k = Math.floor(sec / 5), local = sec - 5 * k;
      const a = st[k], b = k + 1 < 12 ? st[k + 1] : st[0] + len;
      if (local < 1) return a;
      return a + ((b < a ? b + len : b) - a) * kit.ease.inOut((local - 1) / 4);
    };
  }
  return glyph;
}
