// Bonsai — the time is grown and wired on a tree in a pot.
//
// The minutes are two living branches on the long first branch, each
// trained into a numeral and carrying flat-bottomed foliage pads, the way a
// bonsai is styled: pads alternate left and right up an upright stroke and
// sit as clouds along a level one. The hour is jin, the bleached deadwood
// apex of the trunk, forked into two stiff white numerals that do not sway.
//
// The minute: 1.5 s before :00 the old pads shed their leaves tip first;
// the leaves flutter down onto the slab and the bare branch is wired (it
// thickens, and the wraps show as notches). At :00 the wire bends the
// branch, root first, into the new numeral, and from 0.7 s new buds break
// along it from the root out. A clay monk on the slab looks up as the
// leaves come down, then sweeps them off the end of the slab and walks back.
//
// The hour: a gale and rain strip every pad off the minutes, and at :00 a
// bolt strikes the apex; the old deadwood bursts into splinters, the wire
// is whipped over to :00 and the strike burns the new hour into the wood
// from the fork outwards. Lightning is how jin forms in the wild.
//
// The hour of the day is a season of the tree's year: winter in the small
// hours (snow crowns the pads, flakes fall), spring in the morning (blossoms
// on the pads, petals drift), summer in the afternoon (dense pads), autumn
// in the evening (thin pads, leaves drift down).
//
// Always: a breeze leans the living numerals from the root, with a gust
// every 9 s travelling along the branch.
//
// Everything is a function of the clock; the numeral graphs are cached.
// Burn-in: kit.orbit (vertical travel halved, the glass is just tall
// enough), and 23:00-07:00 the panel dims.

import { clockFields, previousMinute, orbit, dither, sprite } from '../js/kit.js';

const W = 128, H = 64;

// ------------------------------------------------------------ helpers

function hash(x, y, s) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const clamp01 = (u) => (u < 0 ? 0 : u > 1 ? 1 : u);
const smooth = (u) => { u = clamp01(u); return u * u * (3 - 2 * u); };
const outBack = (u) => { u = clamp01(u); return 1 + 2.4 * (u - 1) ** 3 + 1.4 * (u - 1) ** 2; };

// ------------------------------------------------------------ letterforms
//
// Every numeral is a little tree: strokes of wood that start at ROOT, the
// point where it sits on its parent branch, and fork from one another. The
// first stroke grows out of the root; each later stroke forks from the
// nearest point of the wood already there. Box 24 x 34; clock-angle arcs
// (degrees, 0 = up, clockwise).

const ROOT = [12, 36.5];

function arc(cx, cy, rx, ry, a0, a1, n = 20) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + (a1 - a0) * (i / n)) * Math.PI) / 180;
    pts.push([cx + rx * Math.sin(a), cy - ry * Math.cos(a)]);
  }
  return pts;
}

const SKEL = {
  0: [arc(12, 17, 8.4, 13.4, 180, 540, 44)],
  1: [[[13, 30.5], [12.5, 22], [12.7, 12], [13.2, 3.6], [9.6, 6.6], [6, 9.6]]],
  2: [
    [[12, 30.5], [3.6, 30.5], [6.5, 27], [12, 21.6], [17.2, 16.4], ...arc(12, 10.6, 7.8, 7.2, 105, -75, 18)],
    [[12, 30.5], [20.5, 30.5]],
  ],
  3: [
    [...arc(11.5, 23.2, 8.6, 7.4, 180, -30, 22), ...arc(11.8, 10.2, 7.4, 6.6, 200, -62, 22)],
    arc(11.5, 23.2, 8.6, 7.4, 180, 245, 6),
  ],
  4: [[[16.5, 30.5], [16.5, 3.6]], [[16.5, 22.5], [4.2, 22.5], [5.2, 13], [7.2, 3.6]], [[16.5, 22.5], [21.2, 22.5]]],
  5: [
    [...arc(11.6, 21.6, 8.5, 8.9, 180, -40, 24), [5.6, 3.6], [20, 3.6]],
    arc(11.6, 21.6, 8.5, 8.9, 180, 240, 6),
  ],
  6: [
    [...arc(12, 21.6, 8.4, 8.9, 180, 270, 8), [3.9, 15], [6.4, 8.6], [11, 4.6], [18.5, 3.8]],
    arc(12, 21.6, 8.4, 8.9, 180, -60, 22),
  ],
  7: [[[9.5, 30.5], [11.4, 22.5], [15.2, 13.5], [20.5, 3.6], [3.6, 3.6]]],
  8: [[...arc(12, 23, 8, 7.6, 180, 360, 16), ...arc(12, 9.6, 6.8, 6, 180, -180, 30), ...arc(12, 23, 8, 7.6, 0, 180, 16)]],
  9: [[[8.5, 30.5], [13.5, 28.2], [17.6, 23.6], [19.8, 17.2], ...arc(12, 11.2, 8.2, 8, 90, -270, 36)]],
};

// ------------------------------------------------------------ wood graphs
//
// A numeral's wood as a graph of samples half a pixel apart: what grows is
// measured along it (from the root, or from wood that is already there),
// and what is cut off falls as connected pieces.

const STEP = 0.5;

function buildGraph(d, sc) {
  const xs = [], ys = [], adj = [], sl = [], stk = [];
  let curS = 0, curK = 0;
  const add = (x, y) => { xs.push(x); ys.push(y); adj.push([]); sl.push(curS); stk.push(curK); return xs.length - 1; };
  const link = (i, j) => {
    if (i === j) return;
    const l = Math.hypot(xs[i] - xs[j], ys[i] - ys[j]);
    adj[i].push(j, l); adj[j].push(i, l);
  };
  const nearest = (x, y, skipFrom = Infinity) => {
    let best = -1, bd = Infinity;
    for (let i = 0; i < xs.length && i < skipFrom; i++) {
      const e = (xs[i] - x) ** 2 + (ys[i] - y) ** 2;
      if (e < bd) { bd = e; best = i; }
    }
    return [best, Math.sqrt(bd)];
  };
  SKEL[d].forEach((st, k) => {
    let pts = st.map(([x, y]) => [x * sc, y * sc]);
    let prev;
    const first = xs.length;
    curK = k; curS = 0;
    if (k === 0) { pts = [[ROOT[0] * sc, ROOT[1] * sc], ...pts]; prev = add(pts[0][0], pts[0][1]); }
    else prev = nearest(pts[0][0], pts[0][1])[0];
    let px = xs[prev], py = ys[prev];
    for (let s = 1; s < pts.length; s++) {
      const [qx, qy] = pts[s];
      const len = Math.hypot(qx - px, qy - py);
      const n = Math.max(1, Math.ceil(len / STEP));
      if (len < 0.05) continue;
      for (let j = 1; j <= n; j++) {
        curS += len / n;
        const i = add(px + ((qx - px) * j) / n, py + ((qy - py) * j) / n);
        link(prev, i); prev = i;
      }
      px = qx; py = qy;
    }
    // A stroke that ends on wood (a closed bowl) joins it there.
    const [j, dj] = nearest(xs[prev], ys[prev], first + Math.max(0, xs.length - first - 8) + (k === 0 ? 0 : 0));
    if (j >= 0 && dj < 1.2 && Math.abs(j - prev) > 6) link(prev, j);
  });
  const n = xs.length;
  const fromRoot = dijkstra(n, adj, [0]);
  // Distance to the nearest free end, for tapering points.
  const ends = [];
  for (let i = 1; i < n; i++) if (adj[i].length === 2) ends.push(i);
  const toEnd = ends.length ? dijkstra(n, adj, ends) : new Float64Array(n).fill(99);
  // Unit tangents.
  const tx = new Float32Array(n), ty = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = adj[i];
    let dx = 0, dy = 0;
    if (a.length >= 4) { dx = xs[a[2]] - xs[a[0]]; dy = ys[a[2]] - ys[a[0]]; }
    else if (a.length >= 2) { dx = xs[a[0]] - xs[i]; dy = ys[a[0]] - ys[i]; }
    const l = Math.hypot(dx, dy) || 1;
    tx[i] = dx / l; ty[i] = dy / l;
  }
  return { n, xs, ys, adj, fromRoot, toEnd, tx, ty, sl, stk };
}

function dijkstra(n, adj, sources) {
  const dist = new Float64Array(n).fill(Infinity);
  const done = new Uint8Array(n);
  for (const s of sources) dist[s] = 0;
  for (;;) {
    let u = -1, bd = Infinity;
    for (let i = 0; i < n; i++) if (!done[i] && dist[i] < bd) { bd = dist[i]; u = i; }
    if (u < 0) break;
    done[u] = 1;
    const a = adj[u];
    for (let k = 0; k < a.length; k += 2) {
      const v = a[k], nd = bd + a[k + 1];
      if (nd < dist[v]) dist[v] = nd;
    }
  }
  return dist;
}

const GRAPHS = new Map();
function graph(d, sc) {
  const k = `${d}@${sc}`;
  let v = GRAPHS.get(k);
  if (!v) {
    v = buildGraph(d, sc);
    v.pads = buildPads(v, d, sc);
    // Samples in growth order (stroke by stroke, root outwards), resampled
    // to MORPH points: the wire is bent point for point from one numeral
    // to the next.
    const ord = Array.from({ length: v.n }, (_, i) => i).sort((a, b) => v.stk[a] - v.stk[b] || v.sl[a] - v.sl[b]);
    v.mx = new Float32Array(MORPH); v.my = new Float32Array(MORPH); v.mr = new Float32Array(MORPH);
    for (let j = 0; j < MORPH; j++) {
      const i = ord[Math.min(v.n - 1, Math.floor((j * v.n) / MORPH))];
      v.mx[j] = v.xs[i]; v.my[j] = v.ys[i]; v.mr[j] = v.toEnd[i];
    }
    v.maxRoot = Math.max(...v.fromRoot);
    GRAPHS.set(k, v);
  }
  return v;
}
const MORPH = 150;

// ------------------------------------------------------------ foliage
//
// Foliage pads, as a bonsai is styled: flat-bottomed domes sitting on the
// wood, wider than tall, each ringed by a dark seam so the pads read one
// above another. On upright strokes they alternate left and right of the
// wood, like the pads on a trained trunk.

const PAD_GAP = 5.0, PAD_RX = 4.35, PAD_RY = 3.0;

function buildPads(gr, d, sc) {
  const out = [];
  let lastK = -1, next = 0;
  for (let i = 1; i < gr.n; i++) {
    const k = gr.stk[i], s = gr.sl[i];
    if (k !== lastK) { lastK = k; next = (k === 0 ? 7.5 : PAD_GAP * 0.8) * sc; }
    if (s < next) continue;
    next = s + PAD_GAP * sc;
    const h = hash(i, d, 17);
    const side = out.length & 1 ? 1 : -1;
    const vert = Math.abs(gr.ty[i]);
    out.push({
      x: gr.xs[i] + side * (0.4 + 0.9 * h) * vert * sc,
      y: gr.ys[i] - 0.3 * (1 - vert),
      s: gr.fromRoot[i],
      rx: PAD_RX * (0.92 + 0.16 * hash(i, d, 23)) * sc,
      ry: PAD_RY * sc,
      h,
    });
  }
  // Drawn from the bottom up, so a higher pad's seam cuts the one below.
  out.sort((a, b) => b.y - a.y);
  return out;
}

const SPRING = 1, SUMMER = 2, AUTUMN = 3, WINTER = 0;

/**
 * One pad at (cx, cy), grown to `k` of its size. Its texture is fixed to the
 * pad, not the glass, so it does not swim as the pad sways.
 */
function drawPad(g, cx, cy, rx, ry, season, k = 1, h = 0.5) {
  if (k <= 0.05) return;
  rx *= k; ry *= k;
  const qx = Math.round(cx), qy = Math.round(cy);
  const x0 = Math.floor(cx - rx - 2), x1 = Math.ceil(cx + rx + 2);
  const y0 = Math.floor(cy - ry - 2), y1 = Math.ceil(cy + 2);
  for (let py = y0; py <= y1; py++)
    for (let px = x0; px <= x1; px++) {
      const dx = px + 0.5 - cx, dy = py + 0.5 - cy;
      if (dy > 1.4) continue;
      const ex = dx / rx, ey = (dy + 0.6) / ry;
      const eo = dx / (rx + 1), eyo = (dy + 0.6) / (ry + 1);
      if (eo * eo + eyo * eyo > 1) continue;
      if (ex * ex + ey * ey > 1 || dy > 0.4) { g.pixel(px, py, 0); continue; }
      // A crown of lit needles two pixels deep, and under it the pad's
      // shadowed underside: dense in summer, thin in autumn, bare in winter
      // (where the crown is snow).
      const lx = px - qx, ly = py - qy;
      const crown = ey < (season === WINTER ? 2.6 : 2) / ry - Math.sqrt(Math.max(0, 1 - ex * ex));
      const under = season === SUMMER ? 0.5 : season === SPRING ? 0.34 : season === AUTUMN ? 0.25 : 0;
      const on = crown || dither(lx, ly, under);
      g.pixel(px, py, on ? 1 : 0);
    }
  // Spring: a blossom open on the crown of every other pad.
  if (season === SPRING && k > 0.85 && h < 0.6) {
    const fx = Math.round(cx + (h / 0.6 - 0.5) * rx * 0.9), fy = Math.round(cy - ry - 0.2);
    for (let yy = -2; yy <= 2; yy++) for (let xx = -2; xx <= 2; xx++) if (Math.abs(xx) + Math.abs(yy) <= 3) g.pixel(fx + xx, fy + yy, 0);
    for (let yy = -1; yy <= 1; yy++) for (let xx = -1; xx <= 1; xx++) if (xx || yy) g.pixel(fx + xx, fy + yy);
  }
}

// ------------------------------------------------------------ wood

function stamp(g, x, y, r, c = 1) {
  const x0 = Math.floor(x - r), x1 = Math.floor(x + r);
  const y0 = Math.floor(y - r), y1 = Math.floor(y + r);
  const r2 = r * r;
  for (let py = y0; py <= y1; py++)
    for (let px = x0; px <= x1; px++)
      if ((px + 0.5 - x) ** 2 + (py + 0.5 - y) ** 2 <= r2) g.pixel(px, py, c);
}

/** A tapering limb along a polyline [[x, y, r], ...], as sampled stamps. */
function limb(pts, step = 0.5) {
  const out = [];
  for (let s = 1; s < pts.length; s++) {
    const [ax, ay, ar] = pts[s - 1], [bx, by, br] = pts[s];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step));
    for (let j = s === 1 ? 0 : 1; j <= n; j++) {
      const u = j / n;
      out.push([ax + (bx - ax) * u, ay + (by - ay) * u, ar + (br - ar) * u]);
    }
  }
  return out;
}

// ------------------------------------------------------------ the tree
//
// Canvas layout (before the burn-in orbit). The pot sits low on the left;
// the trunk twists up out of it, throws its first branch out to the right
// and ends in a bleached deadwood apex (jin) that forks into the hour.

const MIN_ORG = [[58, 5], [93, 4]];               // minute numeral boxes
const HR_SC = 0.64;
const HR_ORG = [[2, -0.6], [19, -0.6]];            // hour numeral boxes (15.4 x 21.8)
const MIN_ROOT = MIN_ORG.map(([x, y]) => [x + ROOT[0], y + ROOT[1]]);
const HR_ROOT = HR_ORG.map(([x, y]) => [x + ROOT[0] * HR_SC, y + ROOT[1] * HR_SC]);
const FORK = [18.4, 26.4];                         // where the jin splits into the hour

const TRUNK = limb([
  [36, 55.5, 6.4], [33.4, 51, 5.4], [30.5, 47, 4.6], [32, 42, 4.0], [37, 38, 3.5],
  [38.6, 33.5, 3.0], [35.2, 29.8, 2.6], [28.5, 27.6, 2.2], [FORK[0] + 1.5, FORK[1] + 0.2, 1.8],
]);
const BRANCH = limb([
  [37, 38.5, 2.3], [44, 42.2, 2.0], [52, 44.4, 1.7], [61, 44.2, 1.5], [MIN_ROOT[0][0], MIN_ROOT[0][1] + 0.6, 1.3],
  [79, 44, 1.2], [88, 44.4, 1.1], [MIN_ROOT[1][0], MIN_ROOT[1][1] + 0.6, 1.0], [112, 43.2, 0.8], [119.5, 41.2, 0.55],
]);
const BACK = limb([[31, 46.5, 1.7], [25, 45.2, 1.2], [18.5, 43.4, 0.6]]);
// Small pads of the tree's own, on its branches (they are not the time).
const TREE_PADS = [[20, 42.6, 3.6], [26.5, 44.4, 3.2], [48, 41.6, 3.3], [118.5, 40.6, 3.4]];
// Deadwood from the top of the trunk to each hour numeral's root.
const JIN = HR_ROOT.map(([x, y], k) => limb([
  [FORK[0], FORK[1], 1.45], [lerp2(FORK[0], x, 0.5) + (k ? 0.6 : -0.6), lerp2(FORK[1], y, 0.5) + 0.5, 1.3], [x, y, 1.2],
]));
function lerp2(a, b, u) { return a + (b - a) * u; }

/** The trunk as a cached list of lit pixels: shaded from the left, with a twisting vein of shari. */
let TRUNK_PX = null;
function trunkPixels() {
  if (TRUNK_PX) return TRUNK_PX;
  const out = [];
  const xs = TRUNK.map((p) => p[0]), ys = TRUNK.map((p) => p[1]);
  const bx0 = Math.floor(Math.min(...xs) - 6), bx1 = Math.ceil(Math.max(...xs) + 6);
  const by0 = Math.floor(Math.min(...ys) - 6), by1 = Math.ceil(Math.max(...ys) + 2);
  for (let py = by0; py <= by1; py++)
    for (let px = bx0; px <= bx1; px++) {
      const cx = px + 0.5, cy = py + 0.5;
      let best = Infinity, bi = 0;
      for (let i = 0; i < TRUNK.length; i++) {
        const [x, y, r] = TRUNK[i];
        const e = Math.hypot(cx - x, cy - y) / r;
        if (e < best) { best = e; bi = i; }
      }
      if (best > 1) continue;
      const a = TRUNK[Math.max(0, bi - 2)], b = TRUNK[Math.min(TRUNK.length - 1, bi + 2)];
      const tl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const nx = -(b[1] - a[1]) / tl, ny = (b[0] - a[0]) / tl;
      const [x, y, r] = TRUNK[bi];
      // u: -1 on one flank, +1 on the other; flip so -1 faces the light (left).
      let u = ((cx - x) * nx + (cy - y) * ny) / r;
      if (nx > 0) u = -u;
      // Living bark: fibres that twist up the trunk, dark between them, and
      // a lit edge for the silhouette. (The deadwood above is solid white.)
      const s = bi * 0.5;
      const k = u * (r > 3 ? 2.4 : 1.6) + s * 0.07;
      const fibre = k - Math.floor(k) < 0.6;
      const on = py <= 54 && (Math.abs(u) > 0.72 || fibre || r < 2.1);
      if (on) out.push(px, py);
    }
  // Surface roots (nebari) gripping the soil.
  const roots = [limb([[33, 53, 1.6], [27, 54.3, 0.9], [21, 54.8, 0.4]]), limb([[39, 53, 1.6], [45, 54.2, 0.9], [51, 54.8, 0.4]])];
  for (const r of roots) for (const [x, y, w] of r) {
    for (let py = Math.floor(y - w); py <= y + w; py++)
      for (let px = Math.floor(x - w); px <= x + w; px++)
        if ((px + 0.5 - x) ** 2 + (py + 0.5 - y) ** 2 <= w * w) out.push(px, py);
  }
  return (TRUNK_PX = out);
}

/** A shallow rectangular pot on two feet: lip, body outline and a moss line. */
let POT_PX = null;
function potPixels() {
  if (POT_PX) return POT_PX;
  const out = [];
  const P = (x, y) => out.push(x, y);
  for (let x = 14; x <= 59; x++) { P(x, 55); P(x, 56); }            // the lip
  P(13, 56); P(60, 56);
  P(16, 57); P(16, 58); P(57, 57); P(57, 58);                          // the body
  for (let x = 17; x <= 56; x++) P(x, 59);
  for (let x = 20; x <= 53; x += 3) P(x, 57);                         // a beaded band on the face
  for (let x = 19; x <= 24; x++) { P(x, 60); P(x, 61); }              // feet
  for (let x = 49; x <= 54; x++) { P(x, 60); P(x, 61); }
  for (let x = 2; x <= 125; x++) P(x, 62);                            // the display slab
  return (POT_PX = out);
}

function drawPixels(g, list, ox, oy) {
  for (let i = 0; i < list.length; i += 2) g.pixel(list[i] + ox, list[i + 1] + oy);
}

// ------------------------------------------------------------ wind

/** The breeze, in pixels of lean at the tip of a minute numeral; gusts every 9 s. */
function wind(T) {
  const gust = Math.max(0, Math.sin(Math.PI * (((T / 9) % 1 + 1) % 1))) ** 6;
  return 0.35 * Math.sin(T * 0.9) + 0.2 * Math.sin(T * 2.3 + 1.1) + 1.1 * gust;
}

/** How far a point of a living numeral leans: nothing at its root, most at its top. */
function lean(slot, y, T, storm) {
  const [rx, ry] = MIN_ROOT[slot];
  const hf = clamp01((ry - y) / 34);
  return wind(T - rx / 40) * (0.75 + 0.45 * slot) * hf * (1 + 3.5 * storm);
}

// ------------------------------------------------------------ the minute

const T_FALL0 = -1.55, T_FALLSPAN = 1.15;   // pads shed, tip first
const T_BEND = 0.0, T_BENDLAG = 0.4, T_BENDDUR = 0.6;  // the wire bends, root first
const T_BUD0 = 0.7, T_BUDSPAN = 1.25, T_BUDGROW = 0.45;  // buds break, root first
const LEAVES = 4;

const inOut = (u) => { u = clamp01(u); return u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2; };

function releaseTime(p, gr, x0, hour) {
  if (hour) return -2.55 + 1.5 * clamp01((x0 + p.x - 56) / 70) + 0.25 * p.h;
  return T_FALL0 + T_FALLSPAN * (1 - p.s / gr.maxRoot) + 0.12 * p.h;
}

const FLOOR_Y = 61;     // where fallen leaves lie, on the slab

/** Leaves shed by a pad `dt` seconds ago: they flutter down (or blow off, on the hour). */
function drawShed(g, p, k, x, y, dt, hour, season, tau) {
  for (let q = 0; q < LEAVES; q++) {
    const h1 = hash(q, k, 31), h2 = hash(q, k, 37), ph = h1 * 6.28;
    const sx = x + (q - 1.5) * p.rx * 0.45, sy = y - p.ry * 0.5 * h2;
    let px, py, flat = false;
    if (hour) {
      px = sx + (45 + 30 * h1) * dt + 70 * dt * dt;
      py = sy - 7 * dt + 9 * dt * dt + 3 * Math.sin(6 * dt + ph) * Math.min(1, dt * 3);
    } else {
      const vt = season === WINTER ? 34 : 20 + 8 * h2, tc = 0.3;
      const fy = (t) => sy + vt * (t - tc * (1 - Math.exp(-t / tc)));
      const fx = (t) => sx + (5 + 4 * h1) * t + 2.6 * Math.sin(4.2 * t + ph) * Math.min(1, t * 2);
      if (fy(dt) < FLOOR_Y) { px = fx(dt); py = fy(dt); }
      else {
        // Landed: find when, and lie there until the broom comes by.
        let lo = 0, hi = dt;
        for (let it = 0; it < 18; it++) { const m = (lo + hi) / 2; if (fy(m) < FLOOR_Y) lo = m; else hi = m; }
        px = Math.max(fx(hi), broomFront(tau) + 1.5 * h2);
        py = FLOOR_Y; flat = true;
      }
    }
    if (py > H + 2 || px > W + 2) continue;
    g.pixel(px, py);
    if (season === WINTER) continue;   // snow falls as single flakes
    if (flat) g.pixel(px + 1, h2 < 0.5 ? py - 1 : py);
    else if (Math.sin(7 * dt + ph) > 0) g.pixel(px + 1, py); else g.pixel(px, py + 1);
  }
}

function drawSteady(g, gr, x0, y0, slot, T, storm, season, budK = null) {
  for (const p of gr.pads) {
    const k = budK ? budK(p) : 1;
    drawPad(g, x0 + p.x + lean(slot, y0 + p.y, T, storm), y0 + p.y, p.rx, p.ry, season, k, p.h);
  }
  for (let i = 0; i < gr.n; i++) {
    const y = y0 + gr.ys[i];
    stamp(g, x0 + gr.xs[i] + lean(slot, y, T, storm), y, Math.min(1.05, 0.55 + 0.25 * gr.toEnd[i]));
  }
}

/**
 * One living numeral through its minute: the old pads shed their leaves
 * tip first; at :00 the bare wire is bent, root first, into the new
 * numeral; then the new buds break along it from the root out.
 */
function drawMinute(g, slot, A, B, tau, hour, sOld, sNew, T, storm, ox, oy) {
  const x0 = MIN_ORG[slot][0] + ox, y0 = MIN_ORG[slot][1] + oy;
  // The old pads, until each lets go; then its leaves.
  A.pads.forEach((p, k) => {
    const tr = releaseTime(p, A, MIN_ORG[slot][0], hour);
    const x = x0 + p.x + lean(slot, y0 + p.y, T, storm), y = y0 + p.y;
    if (tau < tr) {
      if (tau < 0) drawPad(g, x + (tau > tr - 0.3 ? 0.6 * Math.sin(tau * 60 + k) : 0), y, p.rx, p.ry, sOld, 1, p.h);
    } else drawShed(g, p, k + slot * 97, x, y, tau - tr, hour, sOld, tau);
  });
  // While it is bare the branch is wired: thicker, wrapped in a spiral of
  // wire, the wraps showing as notches down alternate sides.
  const wired = smooth((tau - T_FALL0 - 0.35) / 0.5) * (1 - smooth((tau - 1.8) / 0.6));
  if (tau < 0) { drawWire(g, A, A, () => 0, wired, slot, x0, y0, T, storm); return; }
  // New buds.
  const span = B.maxRoot;
  const bud = (p) => {
    const u = (tau - T_BUD0 - T_BUDSPAN * (p.s / span) - 0.08 * p.h) / T_BUDGROW;
    return u <= 0 ? 0 : outBack(u);
  };
  for (const p of B.pads) {
    const k = bud(p);
    if (k > 0) drawPad(g, x0 + p.x + lean(slot, y0 + p.y, T, storm), y0 + p.y, p.rx, p.ry, sNew, k, p.h);
  }
  // The wire, bent point for point.
  // On the hour the strike whips the bare wire over faster, so the new hour
  // never stands beside the old minutes.
  const lag = hour ? 0.15 : T_BENDLAG, dur = hour ? 0.3 : T_BENDDUR;
  drawWire(g, A, B, (j) => inOut((tau - T_BEND - (lag * j) / MORPH) / dur), wired, slot, x0, y0, T, storm);
}

const WX = new Float32Array(MORPH), WY = new Float32Array(MORPH);

/** The wire bent part way from A to B: point j is `u(j)` of the way there. */
function drawWire(g, A, B, u, wired, slot, x0, y0, T, storm) {
  for (let j = 0; j < MORPH; j++) {
    const k = u(j);
    const y = y0 + A.my[j] + (B.my[j] - A.my[j]) * k;
    WX[j] = x0 + A.mx[j] + (B.mx[j] - A.mx[j]) * k + lean(slot, y, T, storm);
    WY[j] = y;
    const r = Math.min(1.05, 0.55 + 0.25 * (A.mr[j] + (B.mr[j] - A.mr[j]) * k)) + 0.5 * wired;
    stamp(g, WX[j], WY[j], r);
  }
  if (wired < 0.5) return;
  for (let j = 8; j < MORPH - 3; j += 3) {
    const dx = WX[j + 1] - WX[j - 1], dy = WY[j + 1] - WY[j - 1], l = Math.hypot(dx, dy);
    if (l < 0.3 || l > 3) continue;   // no wraps across the jump between strokes
    const side = (j / 3) & 1 ? 1 : -1;
    g.pixel(WX[j] - (dy / l) * 1.1 * side, WY[j] + (dx / l) * 1.1 * side, 0);
  }
}

// ------------------------------------------------------------ the hour: deadwood and lightning
//
// The hour is jin: bare, bleached deadwood at the apex, stiff while the
// living pads sway. In the wild, jin is made by lightning, and so it is
// here: on the hour a gale strips every pad, a bolt strikes the apex, the
// old deadwood bursts into splinters and the strike burns the new hour into
// the wood from the fork outwards.

const T_STRIKE = 0.0, T_BOLT = 0.34, T_BURN0 = 0.3, T_BURN = 0.6;

function jinR(gr, i) { return Math.min(1.6, 0.45 + 0.4 * gr.toEnd[i]); }

/**
 * Deadwood: a stiff white stroke tapering to sharp points. `reveal` (px from the root)
 * draws only the wood the strike has burnt in so far, its front thicker.
 */
function drawJin(g, gr, x0, y0, reveal = Infinity) {
  for (let i = 0; i < gr.n; i++) {
    const d = gr.fromRoot[i];
    if (d > reveal) continue;
    const front = reveal - d < 2.2;
    stamp(g, x0 + gr.xs[i], y0 + gr.ys[i], jinR(gr, i) + (front ? 0.8 : 0));
  }
}

function drawForks(g, ox, oy) {
  for (const l of JIN) for (const [x, y, r] of l) stamp(g, x + ox, y + oy, r);
}

/** The bolt: a jagged channel from above the glass to the fork, re-forked every 40 ms. */
function drawBolt(g, tau, ox, oy) {
  const key = Math.floor(tau * 25);
  const tx = FORK[0] + ox, ty = FORK[1] + oy - 1;
  let px = tx + 14 + 10 * hash(key, 1, 41), py = -2;
  const N = 8;
  for (let s = 1; s <= N; s++) {
    const u = s / N;
    const qx = s === N ? tx : px + (tx - px) / (N - s + 1) + (hash(key, s, 43) - 0.5) * 9;
    const qy = s === N ? ty : -2 + (ty + 2) * u;
    g.thickLine(px, py, qx, qy, 2.2);
    if (s === 3 || s === 5) {
      // a side branch that dies out in the air
      let bx = qx, by = qy;
      for (let b = 0; b < 3; b++) {
        const nx = bx + (s === 3 ? -1 : 1) * (2 + 3 * hash(key, s * 9 + b, 47)), ny = by + 2.5 + 2 * hash(key, s * 7 + b, 53);
        g.line(bx, by, nx, ny); bx = nx; by = ny;
      }
    }
    px = qx; py = qy;
  }
}

/** The old hour's deadwood, burst into splinters at the strike. */
function drawSplinters(g, gr, x0, y0, dt, seed) {
  if (dt > 1.1) return;
  for (let i = 0; i < gr.n; i += 5) {
    const h1 = hash(i, seed, 61), h2 = hash(i, seed, 67);
    const x = x0 + gr.xs[i], y = y0 + gr.ys[i];
    const ax = x - FORK[0], ay = y - FORK[1] - 8;
    const l = Math.hypot(ax, ay) || 1;
    const v = 30 + 50 * h1;
    const px = x + ((ax / l) * v + (h2 - 0.5) * 30) * dt;
    const py = y + ((ay / l) * v - 20) * dt + 0.5 * 260 * dt * dt;
    if (py > H) continue;
    g.pixel(px, py);
    if (h2 < 0.4) g.pixel(px + (h1 < 0.5 ? 1 : -1), py - 1);
  }
}

/** Smoke curling up off the struck wood. */
function drawSmoke(g, tau, ox, oy) {
  for (let i = 0; i < 7; i++) {
    const t0 = 0.15 + 0.22 * i, dt = tau - t0;
    if (dt < 0 || dt > 2.2) continue;
    const h1 = hash(i, 5, 71);
    const x = HR_ROOT[i & 1][0] + ox + (h1 - 0.5) * 12 + 4 * Math.sin(dt * 2 + i) + 6 * dt;
    const y = 16 + oy - 3 * h1 - 9 * dt;
    const r = 1 + 2.4 * Math.sqrt(dt);
    const lvl = 0.55 * (1 - dt / 2.2);
    for (let py = Math.floor(y - r - 1); py <= y + r + 1; py++)
      for (let px = Math.floor(x - r - 1); px <= x + r + 1; px++) {
        const e = Math.hypot(px + 0.5 - x, py + 0.5 - y);
        if (Math.abs(e - r) < 0.55 && dither(px, py, lvl)) g.pixel(px, py);
      }
  }
}

// ------------------------------------------------------------ the seasons
//
// The hour of the day is a season of the tree's year: winter through the
// small hours, spring in the morning, summer through the afternoon and
// autumn in the evening. It sets the pads' texture and what drifts down.

const seasonOf = (h) => Math.floor(h / 6);   // 0 winter, 1 spring, 2 summer, 3 autumn

function drawAmbient(g, season, T, pads, ox, oy) {
  if (season === WINTER) {
    for (let i = 0; i < 18; i++) {
      const v = 5 + 4 * hash(i, 3, 5);
      const y = ((hash(i, 2, 5) * 72 + T * v) % 72) - 4;
      const x = ((hash(i, 1, 5) * 136 + T * 2.5 + 2.5 * Math.sin(T * 0.7 + i * 1.7)) % 136) - 4;
      if (y < FLOOR_Y) g.pixel(x + ox, y + oy);
    }
    return;
  }
  if (!pads.length) return;
  const N = season === AUTUMN ? 6 : season === SPRING ? 6 : 2;
  const P = season === AUTUMN ? 5 : season === SPRING ? 6.5 : 8;
  for (let i = 0; i < N; i++) {
    const ph = T / P + hash(i, 1, 81);
    const c = Math.floor(ph), dt = (ph - c) * P;
    const p = pads[Math.floor(hash(i, c, 83) * pads.length)];
    const vt = season === SPRING ? 7 : 15, tc = 0.5;
    const y = p[1] - 1 + vt * (dt - tc * (1 - Math.exp(-dt / tc)));
    if (y > FLOOR_Y) continue;
    const s = hash(i, c, 89) * 6.28;
    const x = p[0] + 4 * dt + (season === SPRING ? 4 : 2.5) * Math.sin(2.6 * dt + s) * Math.min(1, dt);
    g.pixel(x, y);
    if (season !== SPRING) { if (Math.sin(6 * dt + s) > 0) g.pixel(x + 1, y); else g.pixel(x, y + 1); }
  }
}

// ------------------------------------------------------------ the keeper
//
// A clay figurine of a monk stands on the slab under the long branch, as
// mudmen do in bonsai displays. He watches the leaves come down at the
// minute, then sweeps them off the end of the slab and walks back; on the
// hour the thunderclap makes him jump.

const MONK = {
  stand: sprite(`
    ..###...
    .#####..
    .###.#..
    .#####..
    ..###...
    ........
    .####...
    ######..
    .#####..
    .#####..
    ######..
    .##.##..
  `),
  up: sprite(`
    ..###...
    .###.#..
    .#####..
    .#####..
    ..###...
    ........
    .####...
    ######..
    .#####..
    .#####..
    ######..
    .##.##..
  `),
  stepA: sprite(`
    ..###...
    .#####..
    .###.#..
    .#####..
    ..###...
    ........
    .####...
    ######..
    .#####..
    .#####..
    ######..
    #....#..
  `),
  stepB: sprite(`
    ..###...
    .#####..
    .###.#..
    .#####..
    ..###...
    ........
    .####...
    ######..
    .#####..
    .#####..
    ######..
    ..##....
  `),
};
const HOME = 63, SWEEP0 = 3.0, SWEEP_V = 10, BACK0 = 12, BACK_V = 12, OFF = W + 10;

/** Where the monk is and what he is doing, `tau` s from the minute. */
function monk(tau, hour) {
  if (!hour && tau >= SWEEP0) {
    const xs = HOME + SWEEP_V * (tau - SWEEP0);
    if (xs < OFF) return { x: xs, face: 1, mode: 'sweep' };
    const xb = OFF - BACK_V * (tau - BACK0);
    if (tau < BACK0) return null;
    if (xb > HOME) return { x: xb, face: -1, mode: 'walk' };
  }
  // He looks up when the leaves come down, and now and then to admire the tree.
  const look = (tau > T_FALL0 - 0.4 && tau < 2.6) || (tau > 24 && tau < 25.8) || (tau > 38 && tau < 40.4);
  const hop = hour && tau >= 0 && tau < 0.45 ? 4 * Math.sin((Math.PI * tau) / 0.45) : 0;
  return { x: HOME, face: 1, mode: look || (hour && tau > -3 && tau < 2) ? 'up' : 'stand', hop };
}

/** The leading edge of the broom along the slab: leaves are pushed ahead of it. */
function broomFront(tau) {
  if (tau < SWEEP0) return -Infinity;
  return HOME + 9 + SWEEP_V * (tau - SWEEP0);
}

function drawMonk(g, tau, hour, storm, ox, oy) {
  const m = monk(tau, hour);
  if (!m) return;
  const x = Math.round(m.x) + ox, top = FLOOR_Y - 11 - Math.round(m.hop ?? 0) + oy;
  const foot = top + 11;
  let spr = MONK.stand;
  if (m.mode === 'up') spr = MONK.up;
  else if (m.mode === 'walk' || m.mode === 'sweep') spr = Math.floor(m.x / 3) & 1 ? MONK.stepA : MONK.stepB;
  g.blit(spr, m.face > 0 ? x : x - 2, top, { flipX: m.face < 0 });
  // The broom.
  if (m.mode === 'sweep') {
    const sw = Math.sin(tau * 2 * Math.PI * 2.2);
    const hx = x + 5, hy = top + 7, tx = x + 9 + 1.6 * sw, ty = foot;
    g.line(hx - 2, hy - 3, tx, ty - 1);
    g.line(tx - 1, ty, tx + 2, ty); g.line(tx - 1, ty - 1, tx + 1, ty - 1);
  } else if (m.mode === 'walk') {
    const bx = x - 4;   // carried over the shoulder, walking left
    g.line(bx + 1, top + 4, bx + 7, top + 9);
    g.pixel(bx, top + 3); g.pixel(bx - 1, top + 3); g.pixel(bx, top + 4);
  } else {
    // Upright beside him, leaning with the gale on the hour.
    const lean = Math.round(2.5 * storm);
    const bx = x + 7;
    g.line(bx, top + 1, bx + lean, foot - 2);
    g.line(bx + lean - 1, foot - 1, bx + lean + 1, foot - 1);
    g.line(bx + lean - 1, foot, bx + lean + 1, foot);
  }
}

// ------------------------------------------------------------ rain

function drawRain(g, tau, storm, ox, oy) {
  const n = Math.round(46 * storm);
  for (let i = 0; i < n; i++) {
    const v = 150 + 60 * hash(i, 1, 91);
    const y = ((hash(i, 2, 91) * 80 + (tau + 10) * v) % 80) - 8;
    const x = ((hash(i, 3, 91) * 150 + (tau + 10) * v * 0.45) % 150) - 16;
    if (y > FLOOR_Y) continue;
    g.line(x, y, x + 2, y + 4);
  }
}

// ------------------------------------------------------------ face

const DAY = 0xcf, NIGHT_LEVEL = 0x18;

export default {
  name: 'Bonsai',
  blurb: 'A bonsai that grows the time: the minutes are wired branches in foliage pads that shed, bend and bud anew each minute while a clay monk sweeps up; the hour is deadwood, burnt in by lightning; the hour of day is the season.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  driver: 'full',

  frame(g, { fields: f, date, oled, night }) {
    const [ox, oy0] = orbit(date, 2, 3);
    const oy = Math.sign(oy0) * Math.min(1, Math.abs(oy0));   // the glass is only just tall enough
    const late = f.sec >= 50;
    const from = late ? f : previousMinute(date);
    const to = late ? clockFields(new Date(date.getTime() + 60000)) : f;
    const tau = late ? f.sec - 60 : f.sec;
    const hour = to.m === 0;
    const T = (((date.getTime() / 1000) % 86400) + 86400) % 86400;
    const storm = hour ? smooth((tau + 2.9) / 0.6) * (1 - smooth((tau - 0.4) / 1.6)) : 0;
    const sOld = seasonOf(from.h), sNew = seasonOf(to.h);

    drawPixels(g, potPixels(), ox, oy);
    drawPixels(g, trunkPixels(), ox, oy);
    for (const [x, y, r] of BRANCH) stamp(g, x + ox, y + oy, r);
    for (const [x, y, r] of BACK) stamp(g, x + ox, y + oy, r);
    for (const [x, y, rx] of TREE_PADS) {
      const sway = wind(T - x / 40) * 0.5 * (1 + 3 * storm);
      drawPad(g, x + ox + sway, y + oy, rx, PAD_RY * 0.85, tau < 0 ? sOld : sNew);
    }

    // The hour, in deadwood.
    drawForks(g, ox, oy);
    for (let k = 0; k < 2; k++) {
      const x0 = HR_ORG[k][0] + ox, y0 = HR_ORG[k][1] + oy;
      const gOld = graph(from.hh[k], HR_SC), gNew = graph(to.hh[k], HR_SC);
      if (!hour || tau < T_STRIKE) { drawJin(g, tau < 0 ? gOld : gNew, x0, y0); continue; }
      drawSplinters(g, gOld, x0, y0, tau - T_STRIKE, k * 13 + from.h);
      drawJin(g, gNew, x0, y0, gNew.maxRoot * 1.05 * smooth((tau - T_BURN0) / T_BURN) - 0.5);
    }

    // The minutes, alive.
    const pads = [];
    for (let k = 0; k < 2; k++) {
      const A = graph(from.mm[k], 1), B = graph(to.mm[k], 1);
      if (A === B) drawSteady(g, B, MIN_ORG[k][0] + ox, MIN_ORG[k][1] + oy, k, T, storm, sNew);
      else drawMinute(g, k, A, B, tau, hour, sOld, sNew, T, storm, ox, oy);
      if (tau > 3 || tau < T_FALL0) for (const p of (tau < 0 ? A : B).pads) pads.push([MIN_ORG[k][0] + p.x + ox, MIN_ORG[k][1] + p.y + oy]);
    }
    drawAmbient(g, tau < 0 ? sOld : sNew, T, pads, ox, oy);
    drawMonk(g, tau, hour, storm, ox, oy);
    if (storm > 0) drawRain(g, tau, storm, ox, oy);

    if (hour && tau >= 0) {
      if (tau < T_BOLT) drawBolt(g, tau, ox, oy);
      drawSmoke(g, tau, ox, oy);
      if ((tau < 0.05) || (tau >= 0.11 && tau < 0.15)) oled.invert(true);
    }
    oled.contrast(DAY + (NIGHT_LEVEL - DAY) * night);
  },
};
