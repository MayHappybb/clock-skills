// Domino — the time set up in standing dominoes, seen from above, and
// knocked down every minute.
//
// Each digit is a run of standing dominoes along its strokes, like a real
// domino-art setup: from straight above a standing domino is only its top
// end, a 2 x 5 bar, so a digit reads as a stroke of short bars across its
// path, fanning round the curves. Under the digits runs the fuse, a row of
// sixty small dominoes: a little robot walks along it and stands one up
// every second, so the row is the seconds hand.
//
// The minute: at :59, with the row full, the robot turns round and flicks
// the last domino. The fuse topples right to left, and as the wave
// passes under a digit that is about to change it runs up into it: the
// digit falls as a real chain, branching at every junction and meeting
// itself round the loops. A falling domino is drawn as the solid it is: it
// pivots on its front bottom edge, its top end slides forward and narrows
// (cos θ) while its back face swings up into view (sin θ) with its pips, and
// it comes to rest leaning on the next one (the angle where a falling line
// stacks, cos θ = thickness / spacing) or, at the end of a branch, flat.
// Each domino's start is when the one before it has tipped far enough to
// reach it, so the wave speed comes from the geometry. At :00 the table is
// tilted: everything that has fallen slides off the bottom, and the new
// digit's dominoes pop up one by one along its path. The robot, meanwhile,
// has sprinted back to the start of the row to stand up second zero.
//
// The hour: a big domino has been standing at the left edge all through the
// last minute. The fuse reaches it after running under all four digits (all
// of which fall), it topples across the table with a slam (the glass jumps,
// one frame inverts), and lies over the hours showing the new hour in pips,
// on a double-nine face (midnight is the double blank). The new minutes are
// set up beside it at once; after two seconds it is slid away and the hours
// are set up too.
//
// The time is never wrong: old digits only fall before :00, nothing new
// stands until everything fallen has gone, and a fallen digit is a
// shingled heap, not a row of bars.
//
// Everything is a function of the clock: each domino's fall start is fixed
// by a shortest-path walk from the fuse, computed once per digit when the
// module loads; frame() just evaluates every domino's angle at `sec`.
//
// Burn-in: the digits and the colon walk a 2-pixel orbit, and each minute's
// fuse row is laid a pixel or so from the last one.

import { orbit, clockFields, ease, clamp, OFF, ON, sprite } from '../js/kit.js';

const DAY = 0xcf, NIGHT = 0x18;

// ------------------------------------------------------------ geometry

// Digit dominoes: thickness, width, height (length when lying), spacing.
export const D = { d: 2, w: 5, L: 10, p: 4 };
// Fuse dominoes.
const F = { d: 1, w: 3, L: 5, p: 2 };
const SLOT_X = [6, 32, 74, 100], SLOT_W = 23, SLOT_Y = 3, SLOT_H = 43;
const FUSE_X0 = 6, FUSE_Y = 60.5;
const PI = Math.PI;

// Digit centre-lines in a unit box. ['M',x,y] ['L',x,y]
// ['A',cx,cy,rx,ry,a0,a1]: clock angles (0 up, clockwise).
const PATHS = {
  0: [[['M', 0, 0.27], ['A', 0.5, 0.27, 0.5, 0.27, -PI / 2, PI / 2], ['L', 1, 0.73], ['A', 0.5, 0.73, 0.5, 0.27, PI / 2, 1.5 * PI], ['L', 0, 0.27]]],
  1: [[['M', 0.08, 1], ['L', 1, 1]], [['M', 0.12, 0.2], ['L', 0.55, 0], ['L', 0.55, 0.9]]],
  2: [[['A', 0.5, 0.27, 0.5, 0.27, -1.35, 2.2], ['L', 0, 1], ['L', 1, 1]]],
  3: [[['A', 0.5, 0.25, 0.47, 0.25, -1.4, PI]], [['A', 0.5, 0.74, 0.5, 0.26, 0, PI + 1.4]]],
  4: [[['M', 0.5, 0], ['L', 0, 0.66], ['L', 1, 0.66]], [['M', 0.74, 0.22], ['L', 0.74, 1]]],
  5: [[['M', 0.97, 0], ['L', 0.08, 0], ['L', 0.03, 0.45], ['A', 0.5, 0.68, 0.5, 0.32, -0.95, PI + 1.25]]],
  6: [[['A', 0.5, 0.68, 0.5, 0.32, 0, 2 * PI]], [['A', 1.0, 0.68, 1.0, 0.68, 1.5 * PI, 2 * PI - 0.36]]],
  7: [[['M', 0, 0], ['L', 1, 0], ['L', 0.38, 1]]],
  8: [[['A', 0.5, 0.235, 0.43, 0.235, 0, 2 * PI]], [['A', 0.5, 0.73, 0.5, 0.27, 0, 2 * PI]]],
};
PATHS[9] = PATHS[6].map((s) => s.map((c) => (c[0] === 'A'
  ? ['A', 1 - c[1], 1 - c[2], c[3], c[4], c[5] + PI, c[6] + PI]
  : [c[0], 1 - c[1], 1 - c[2]])));

/** A path as a fine polyline in slot pixels (centre-line inset by half a domino width). */
function flatten(path) {
  const r = D.w / 2;
  const X = (u) => r + u * (SLOT_W - D.w), Y = (v) => r + v * (SLOT_H - D.w);
  const pts = [];
  for (const c of path) {
    if (c[0] === 'M' || c[0] === 'L') {
      const q = [X(c[1]), Y(c[2])];
      if (c[0] === 'L' && pts.length) {
        const p0 = pts[pts.length - 1], n = Math.ceil(Math.hypot(q[0] - p0[0], q[1] - p0[1]) * 2);
        for (let i = 1; i <= n; i++) pts.push([p0[0] + ((q[0] - p0[0]) * i) / n, p0[1] + ((q[1] - p0[1]) * i) / n]);
      } else pts.push(q);
    } else {
      const [, cx, cy, rx, ry, a0, a1] = c;
      const n = Math.ceil(Math.abs(a1 - a0) * 60);
      for (let i = 0; i <= n; i++) {
        const a = a0 + ((a1 - a0) * i) / n;
        pts.push([X(cx + rx * Math.sin(a)), Y(cy - ry * Math.cos(a))]);
      }
    }
  }
  return pts;
}

/** Points every `p` along a polyline, with the unit tangent there. */
function placeAlong(pts, p, closed) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const len = cum[cum.length - 1];
  const n = closed ? Math.max(3, Math.round(len / p)) : Math.max(1, Math.round(len / p)) + 1;
  const step = closed ? len / n : len / (n - 1);
  const out = [];
  for (let k = 0, j = 1; k < n; k++) {
    const at = k * step;
    while (j < pts.length - 1 && cum[j] < at) j++;
    const u = (at - cum[j - 1]) / (cum[j] - cum[j - 1] || 1);
    const x = pts[j - 1][0] + (pts[j][0] - pts[j - 1][0]) * u, y = pts[j - 1][1] + (pts[j][1] - pts[j - 1][1]) * u;
    const a = pts[Math.max(0, j - 2)], b = pts[Math.min(pts.length - 1, j + 1)];
    const tl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    out.push({ x, y, tx: (b[0] - a[0]) / tl, ty: (b[1] - a[1]) / tl });
  }
  return { out, closed };
}

/** Would two standing dominoes (footprints d x w, plus a pixel of air) touch? */
function overlaps(A, B) {
  const inA = (P, x, y) => {
    const dx = x - P.x, dy = y - P.y;
    return Math.abs(dx * P.tx + dy * P.ty) <= D.d / 2 + 0.6 && Math.abs(-dx * P.ty + dy * P.tx) <= D.w / 2 + 0.3;
  };
  const corners = (P) => [-1, 1].flatMap((i) => [-1, 1].map((j) => [P.x + i * P.tx * D.d / 2 - j * P.ty * D.w / 2, P.y + i * P.ty * D.d / 2 + j * P.tx * D.w / 2]))
    .concat([[P.x, P.y], [P.x - P.ty * D.w / 2, P.y + P.tx * D.w / 2], [P.x + P.ty * D.w / 2, P.y - P.tx * D.w / 2]]);
  return corners(B).some(([x, y]) => inA(A, x, y)) || corners(A).some(([x, y]) => inA(B, x, y));
}

function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

// The chain: a domino tipping forward reaches the next one (p - d ahead)
// at sin θ = (p - d) / L, and comes to rest leaning on it at cos θ = d / p.
const FALL_T = 0.09;                                   // seconds to tip from upright to its rest angle
const REST = Math.acos(D.d / D.p);                     // leaning on the next one (60°)
const CONTACT = Math.asin((D.p - D.d) / D.L);          // touches the next one
/** Angle at time τ after being struck: accelerating, as a toppling block does. */
function angleAt(tau, rest, fallT = FALL_T) {
  if (tau <= 0) return 0;
  const u = tau / fallT;
  if (u >= 1) return rest;
  return rest * u * u;
}
// The delay between a domino being struck and it striking the next.
const HOP = FALL_T * Math.sqrt(CONTACT / REST);
const SPEED = D.p / HOP;                               // wave speed, pixels per second

/**
 * One digit's setup: dominoes with position, fall direction, the time
 * (from its first domino being struck) at which each is struck, whether it
 * ends a branch (it then falls flat) and its pips.
 */
function buildDigit(d) {
  const nodes = [];
  const strokeOf = [];
  const edges = [];
  PATHS[d].forEach((path, si) => {
    const pts = flatten(path);
    const closed = Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 1;
    const { out } = placeAlong(pts, D.p, closed);
    let prev = -1, first = -1;
    for (const q of out) {
      // At a junction, drop dominoes that would stand on one already there.
      // (Anything but the last two of this run: so a stroke crossing itself, as in 4, leaves a gap too.)
      const recent = new Set([prev, prev - 1, ...(closed ? [first, first + 1] : [])]);
      if (nodes.some((n, j) => !recent.has(j) && (Math.hypot(n.x - q.x, n.y - q.y) < D.p * 0.9 || overlaps(n, q)))) continue;
      // At a sharp corner of its own stroke, skip one that would touch the last.
      if (prev >= 0 && Math.hypot(nodes[prev].x - q.x, nodes[prev].y - q.y) < D.p * 0.6) continue;
      const id = nodes.length;
      nodes.push(q); strokeOf.push(si);
      if (prev >= 0 && Math.hypot(nodes[prev].x - q.x, nodes[prev].y - q.y) <= D.L) edges.push([prev, id]);
      if (first < 0) first = id;
      prev = id;
    }
    if (closed && first >= 0 && prev >= 0 && prev !== first) edges.push([prev, first]);
  });
  // Junctions: join a stroke's ends (and touching loops) to the nearest domino of any other stroke.
  const deg = nodes.map(() => 0);
  for (const [a, b] of edges) { deg[a]++; deg[b]++; }
  for (let i = 0; i < nodes.length; i++) {
    let best = -1, bd = D.L;
    for (let j = 0; j < nodes.length; j++) {
      if (Math.abs(j - i) < 3 || edges.some(([a, b]) => (a === i && b === j) || (a === j && b === i))) continue;
      const dd = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
      if (dd < bd && (deg[i] < 2 || deg[j] < 2 || dd < D.p * 1.3)) { bd = dd; best = j; }
    }
    if (best >= 0) { edges.push([i, best]); deg[i]++; deg[best]++; }
  }
  // Anything still cut off (two loops that only touch) joins at its nearest point.
  for (;;) {
    const comp = nodes.map((_, i) => i);
    const root = (i) => (comp[i] === i ? i : (comp[i] = root(comp[i])));
    for (const [a, b] of edges) comp[root(a)] = root(b);
    let best = null;
    for (let i = 0; i < nodes.length; i++)
      for (let j = i + 1; j < nodes.length; j++) {
        if (root(i) === root(j)) continue;
        const dd = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
        if (!best || dd < best[2]) best = [i, j, dd];
      }
    if (!best) break;
    edges.push([best[0], best[1]]);
  }
  const adj = nodes.map(() => []);
  for (const [a, b] of edges) {
    const l = Math.hypot(nodes[a].x - nodes[b].x, nodes[a].y - nodes[b].y);
    adj[a].push([b, l]); adj[b].push([a, l]);
  }
  // The fuse strikes the lowest domino (nearest the middle on a tie).
  let start = 0;
  nodes.forEach((n, i) => {
    const s = n.y * 10 - Math.abs(n.x - SLOT_W / 2), b = nodes[start].y * 10 - Math.abs(nodes[start].x - SLOT_W / 2);
    if (s > b) start = i;
  });
  // Shortest paths from it: when each is struck, and by which.
  const dist = nodes.map(() => Infinity), parent = nodes.map(() => -1), done = nodes.map(() => false);
  dist[start] = 0;
  for (;;) {
    let i = -1;
    for (let k = 0; k < nodes.length; k++) if (!done[k] && dist[k] < Infinity && (i < 0 || dist[k] < dist[i])) i = k;
    if (i < 0) break;
    done[i] = true;
    for (const [j, l] of adj[i]) if (dist[i] + l < dist[j]) { dist[j] = dist[i] + l; parent[j] = i; }
  }
  const kids = nodes.map(() => 0);
  parent.forEach((p) => { if (p >= 0) kids[p]++; });
  const rand = rng(d * 7919 + 13);
  const order = nodes.map((_, i) => i).sort((a, b) => dist[a] - dist[b]);
  const out = nodes.map((n, i) => {
    // Fall along the stroke, away from whoever strikes it (towards its first child for the first).
    let fx = n.tx, fy = n.ty;
    let ref = null;
    if (parent[i] >= 0) ref = [n.x - nodes[parent[i]].x, n.y - nodes[parent[i]].y];
    else { const c = parent.indexOf(i); if (c >= 0) ref = [nodes[c].x - n.x, nodes[c].y - n.y]; }
    if (ref && fx * ref[0] + fy * ref[1] < 0) { fx = -fx; fy = -fy; }
    // Square to the grid, a standing domino is exactly 2 x 5 pixels: centre on a
    // pixel edge along its thickness and on a pixel centre across its width.
    let { x, y } = n;
    if (Math.abs(fx) > 0.97) { x = Math.round(x); y = Math.floor(y) + 0.5; fx = Math.sign(fx); fy = 0; }
    else if (Math.abs(fy) > 0.97) { y = Math.round(y); x = Math.floor(x) + 0.5; fy = Math.sign(fy); fx = 0; }
    return {
      x, y, fx, fy,
      hit: (dist[i] / D.p) * HOP,
      leaf: kids[i] === 0,
      build: order.indexOf(i),
      pips: [Math.floor(rand() * 7), Math.floor(rand() * 7)],
    };
  });
  return { nodes: out, start: nodes[start], span: Math.max(...out.map((n) => n.hit)) + FALL_T, count: out.length };
}

export const DIGITS = {};
for (let d = 0; d <= 9; d++) DIGITS[d] = buildDigit(d);

// ------------------------------------------------------------ drawing a domino

// Pip positions on one half of a face, in half-local units (0..1 along, -1..1 across).
const PIP_AT = {
  0: [], 1: [[0.5, 0]], 2: [[0.2, -0.6], [0.8, 0.6]], 3: [[0.2, -0.6], [0.5, 0], [0.8, 0.6]],
  4: [[0.2, -0.6], [0.2, 0.6], [0.8, -0.6], [0.8, 0.6]], 5: [[0.2, -0.6], [0.2, 0.6], [0.5, 0], [0.8, -0.6], [0.8, 0.6]],
  6: [[0.2, -0.6], [0.2, 0.6], [0.5, -0.6], [0.5, 0.6], [0.8, -0.6], [0.8, 0.6]],
  7: [[0.2, -0.6], [0.2, 0.6], [0.5, -0.6], [0.5, 0], [0.5, 0.6], [0.8, -0.6], [0.8, 0.6]],
  8: [[0.2, -0.6], [0.2, 0], [0.2, 0.6], [0.5, -0.6], [0.5, 0.6], [0.8, -0.6], [0.8, 0], [0.8, 0.6]],
  9: [[0.2, -0.6], [0.2, 0], [0.2, 0.6], [0.5, -0.6], [0.5, 0], [0.5, 0.6], [0.8, -0.6], [0.8, 0], [0.8, 0.6]],
};

/**
 * A domino seen from straight above, standing on (x, y) (the centre of its
 * footprint) and tipped by θ towards (fx, fy). It pivots on its front
 * bottom edge: its top end (d deep) moves forward and narrows by cos θ, and
 * its back face swings up into view, L sin θ long, with its pips. A black
 * keyline is cleared round it first, so a domino lying on another reads.
 * `style` 'ivory' (lit face, dark pips) or 'ebony' (outlined face, lit pips).
 */
export function drawDomino(g, x, y, fx, fy, theta, S, pips, style = 'ivory', pipR = 0.75, keyline = true) {
  const nx = -fy, ny = fx;
  const c = Math.cos(theta), s = Math.sin(theta);
  const sp = S.d / 2;
  const f0 = sp - S.d * c, f1 = f0 + S.L * s, e1 = sp + S.L * s; // back face [f0, f1], top end [f1, e1]
  const hw = S.w / 2;
  const reach = Math.max(Math.abs(f0), Math.abs(e1)) + hw + 2;
  const bx0 = Math.floor(x - reach), by0 = Math.floor(y - reach), bx1 = Math.ceil(x + reach), by1 = Math.ceil(y + reach);
  const half = S.L / 2;
  const pipsAt = s > 0.97 ? [PIP_AT[pips[0]], PIP_AT[pips[1]]] : null;
  for (let py = by0; py <= by1; py++)
    for (let px = bx0; px <= bx1; px++) {
      const dx = px + 0.5 - x, dy = py + 0.5 - y;
      const a = dx * fx + dy * fy, t = dx * nx + dy * ny;
      if (Math.abs(t) > hw + 0.7 || a < f0 - 0.7 || a > e1 + 0.7) continue;
      const inside = Math.abs(t) <= hw && a >= f0 && a <= e1;
      if (!inside) {
        // A keyline down its sides and across its leading edge (not behind it:
        // the domino it fell from lies there, on top of it).
        if (keyline && a >= f0) g.pixel(px, py, OFF);
        continue;
      }
      let lit = true;
      if (a < f1 && (s > 0.3 || style === 'ebony')) {
        // On the back face: where on the domino is this, unforeshortened?
        const fl = (a - f0) / s;                               // 0..L from its foot to its top
        const big = S.w > 20;
        if (style === 'ebony') lit = Math.abs(t) > hw - (big ? 2 : 1) || fl < (big ? 1.5 : 0.6) / s || fl > S.L - (big ? 1.5 : 0.6) / s;
        if (s > 0.9 && Math.abs(fl - half) * s < (big ? 1 : 0.55)) lit = style === 'ebony'; // the bar across the middle
        if (pipsAt) {
          const k = fl < half ? 0 : 1, hl = (k ? fl - half : fl) / half;
          for (const [pu, pv] of pipsAt[k]) {
            const du = (hl - pu) * half * s, dv = t - pv * (hw - Math.max(1.2, S.w * 0.24));
            if (du * du + dv * dv <= pipR * pipR) { lit = style === 'ebony'; break; }
          }
        }
      }
      g.pixel(px, py, lit ? ON : OFF);
    }
}

// ------------------------------------------------------------ the robot

const BOT = {
  stand: sprite(`
    ...#...
    .#####.
    #.....#
    #.#.#.#
    #.....#
    .#####.
    ..#.#..
    .#...#.
  `),
  walk: sprite(`
    ...#...
    .#####.
    #.....#
    #.#.#.#
    #.....#
    .#####.
    ..#.#..
    ..#.#..
  `),
  reach: sprite(`
    ....#..
    .#####.
    #.....#
    #...#.#
    #.....#
    .######
    ..#.#.#
    .#...#.
  `),
  kick: sprite(`
    ...#...
    .#####.
    #.....#
    #.##.##
    #.....#
    .#####.
    ..#.#..
    .#...##
  `),
  run: sprite(`
    ..#....
    .#####.
    #.....#
    #.#.#.#
    #.....#
    .#####.
    .#..#..
    #....#.
  `),
};

function drawBot(g, spr, x, y, flipX) {
  // A keyline, then the robot.
  for (let j = 0; j < spr.h; j++)
    for (let i = 0; i < spr.w; i++) {
      const on = spr.data[j * spr.w + (flipX ? spr.w - 1 - i : i)];
      if (on) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) g.pixel(x + i + dx, y + j + dy, OFF);
    }
  g.blit(spr, x, y, { flipX });
}

// ------------------------------------------------------------ timing (seconds from the turn)

const KICK = -1.0;                  // the robot flicks the last fuse domino (at :59.0)
const FUSE_HOP = 0.006;             // the fuse is a zip: 58 hops in 0.35 s
const FUSE_FALL = 0.06;
const SPUR = 0.03;                  // fuse domino under a digit -> its first domino
const SLIDE0 = 0.0, SLIDE_T = 0.55; // the table tilts: fallen dominoes slide off
const BUILD0 = 0.55, BSTEP = 0.028, POP_T = 0.12;
const GIANT = { d: 3, w: 46, L: 70 };
const GIANT_FALL = 0.45, GIANT_OFF = 2.3, BUILD0_HOUR = 2.85;
const RUN_T0 = -0.85, RUN_T1 = -0.08;

const fuseX = (k) => FUSE_X0 + 2 * (k - 1) + 0.5;           // fuse domino k = 1..59
const fuseHit = (k) => KICK + (59 - k) * FUSE_HOP;     // when it is struck
const FUSE_REST = Math.acos(F.d / F.p);
const fuseOffset = (K) => [((K % 2) + 2) % 2, (((Math.floor(K / 2) % 3) + 3) % 3) - 1];
const digitsAt = (K) => { const c = clockFields(new Date(K * 60000)); return { s: `${c.hh}${c.mm}`, hour: c.m === 0, h: c.h }; };

export default {
  name: 'Domino',
  blurb: 'HH:MM set up in standing dominoes seen from above; a robot lays the seconds, then knocks the minute down.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,

  frame(g, { fields: f, date, oled, night }) {
    oled.contrast(Math.round(DAY + (NIGHT - DAY) * night));
    const sec = f.sec, K = f.minuteKey;
    // The turn this frame belongs to: the coming one from the kick, else the last one.
    const late = sec - 60 >= KICK - 0.2;
    const tau = late ? sec - 60 : sec;
    const B = late ? K + 1 : K;                              // the minute being turned into
    const before = digitsAt(B - 1), after = digitsAt(B);
    const hour = after.hour;
    const [ox, oy] = orbit(date, 2, 3);
    const tilt = (x, t0) => { const u = tau - t0 - (x / 128) * 0.12; return u > 0 ? 0.5 * 2600 * u * u : 0; };
    const slam = hour && tau >= 0 && tau < 0.35 ? Math.round(3 * Math.sin(tau * 60) * (1 - tau / 0.35)) : 0;
    const sy = slam;

    // ---- the colon: an ebony domino lying face up, a one-one: two lit pips.
    {
      const cx = 64 + ox, cy = SLOT_Y + SLOT_H / 2 + oy + sy;
      drawDomino(g, cx, cy - 11, 0, 1, PI / 2, { d: 1, w: 9, L: 22 }, [1, 1], 'ebony', 1.5);
    }

    // ---- the digits.
    const changed = [0, 1, 2, 3].map((i) => hour || before.s[i] !== after.s[i]);
    for (let i = 0; i < 4; i++) {
      // On the hour the hours lie under the big domino: they go when it goes.
      const under = hour && i < 2;
      const buildAt = under ? BUILD0_HOUR : BUILD0, slideAt = under ? GIANT_OFF : SLIDE0;
      const X = SLOT_X[i] + ox, Y = SLOT_Y + oy + sy;
      if (!changed[i] || (!late && tau >= buildAt)) {
        // Standing (the new digit, perhaps still popping up).
        const dg = DIGITS[after.s[i]];
        const building = changed[i] && !late && tau < buildAt + dg.count * BSTEP + POP_T;
        for (const n of dg.nodes) {
          let th = 0;
          if (building) {
            const u = (tau - buildAt - n.build * BSTEP) / POP_T;
            if (u < 0) continue;
            th = (PI / 2) * (1 - ease.outCubic(Math.min(1, u)));
          }
          drawDomino(g, X + n.x, Y + n.y, n.fx, n.fy, th, D, n.pips);
        }
        continue;
      }
      if (under && !late) continue; // under the big domino now, and leaving with it
      // Falling: the old digit, struck when the fuse passes under its first domino.
      const dg = DIGITS[before.s[i]];
      const k = clamp(Math.round((SLOT_X[i] + dg.start.x - FUSE_X0) / 2) + 1, 1, 59);
      const t0 = fuseHit(k) + SPUR;
      const list = dg.nodes.map((n) => ({ n, th: angleAt(tau - t0 - n.hit, n.leaf ? PI / 2 : REST, FALL_T) }));
      // Later-struck dominoes underneath: each lies on the one it fell onto.
      list.sort((a, b) => b.n.hit - a.n.hit);
      for (const { n, th } of list) {
        const dy = th > 0 ? tilt(X + n.x, slideAt) : 0;
        if (Y + n.y + dy > 70) continue;
        drawDomino(g, X + n.x, Y + n.y + dy, n.fx, n.fy, th, D, n.pips);
      }
    }

    // ---- the fuse: one domino stood up per second. Each minute's row is laid
    // a pixel or so from the last one, so its pixels share the wear.
    const row = (Kx, n, fallen) => {
      const [fx, fy] = fuseOffset(Kx);
      for (let k = 1; k <= n; k++) {
        const th = fallen ? angleAt(tau - fuseHit(k), k === 1 ? PI / 2 : FUSE_REST, FUSE_FALL) : 0;
        const dy = th > 0 && !late ? tilt(fuseX(k), 0) : 0;
        if (FUSE_Y + fy + dy > 70) continue;
        drawDomino(g, fuseX(k) + fx, FUSE_Y + fy + dy, -1, 0, th, F, [0, 0], 'ivory', 0, false);
      }
    };
    if (late) row(K, 59, true);                                  // knocked down from :59
    else if (tau < SLIDE0 + SLIDE_T) row(K - 1, 59, true);       // last minute's, sliding away
    else row(K, Math.floor(sec), false);

    // ---- the big one, in the last minute of every hour.
    const nextIsHour = digitsAt(K + 1).hour;
    if ((nextIsHour && !late) || (hour && (late || tau < GIANT_OFF + 0.6))) {
      const gx = 2, gy = SLOT_Y + SLOT_H / 2 + 0.5;
      const hitAt = fuseHit(1) + 0.02;
      let th = 0, dy = 0;
      if (late || hour) th = angleAt(tau - hitAt, PI / 2, GIANT_FALL);
      if (hour && !late && tau > GIANT_OFF) dy = 0.5 * 2600 * (tau - GIANT_OFF) ** 2;
      const pop = nextIsHour && !late && sec < 0.4 ? ease.outBack(sec / 0.4) : 1;
      if (gy + dy - GIANT.w / 2 < 64)
        drawDomino(g, gx, gy + dy + sy, 1, 0, th, { ...GIANT, w: GIANT.w * pop }, [after.h > 9 ? Math.floor(after.h / 10) : 0, after.h % 10].map((v) => (hour || late ? v : 0)), 'ebony', 4.5);
      if (hour && !late && tau >= 0 && tau < 0.05) oled.invert(true);
    }

    // ---- the robot.
    let bx, spr = BOT.stand, flip = false, by = 50;
    if (late) {
      if (tau < KICK) { bx = fuseX(59) + 3; spr = BOT.stand; flip = true; }
      else if (tau < RUN_T0) { bx = fuseX(59) + 3; spr = BOT.kick; flip = true; }
      else {
        const u = clamp((tau - RUN_T0) / (RUN_T1 - RUN_T0), 0, 1);
        bx = fuseX(59) + 3 + (FUSE_X0 - 2 - fuseX(59) - 3) * ease.inOutQuad(u);
        spr = Math.floor(tau * 16) & 1 ? BOT.run : BOT.walk; flip = true;
      }
    } else {
      // Walking right, standing up one domino each second.
      const k = Math.floor(sec), fr = sec - k;
      bx = fuseX(Math.max(1, k + 1)) - 2 * (1 - Math.min(1, fr / 0.7)) + 1;
      if (k === 0 && fr < 0.7) bx = FUSE_X0 - 2;
      spr = fr > 0.85 ? BOT.reach : Math.floor(sec * 4) & 1 ? BOT.walk : BOT.stand;
      if (hour && tau < 0.45) by -= Math.round(8 * Math.sin((tau / 0.45) * PI)); // the slam makes it jump
    }
    drawBot(g, spr, Math.round(bx - 3 + fuseOffset(K)[0]), by + fuseOffset(K)[1], flip);
  },
};
