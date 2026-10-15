// Tangram — the time as a puzzle being solved on the table.
//
// The minutes are loose tangram pieces. Each numeral is exactly two full
// tangram sets (fourteen pieces: four large triangles, two medium, four
// small, two squares, two parallelograms) laid edge to edge, so the
// typeface IS the puzzle: every digit was found by an exact-cover search
// over the half-cell lattice and then picked by eye, and one-pixel joints
// show how it is cut. Every numeral uses the same fourteen pieces, so a turn
// is a rearrangement, never a swap.
//
// The minute: as the minute ends, the pieces that are about to go twitch.
// A mouse that has been creeping along the foot of the glass all minute,
// a dash every second, is under the cat's nose; the cat pounces, the mouse
// bolts back under the minutes, and the changing numeral re-solves itself
// one piece at a time: each hops from its old place to its new one, rising
// (larger, its screened shadow falling away) while it slides, turns and, if
// its mirror image is needed, flips over edge-on, then lands with a little
// bounce. Pieces are matched kind to kind to travel least, a piece never
// lands until every old piece lying there has left, and a piece already in
// place stays down.
//
// The hours are the puzzle card: a grey printed card lying askew, the hour
// on it in black silhouette, the shape the pieces answer. On the hour the
// table is slammed (every piece jumps, in a wave from the cat), the card is
// picked up and turned over (its back shows the solved square), and the cat,
// itself seven tangram pieces, folds back into the solved square, spins once
// in the air and unfolds into a cat again.
//
// A pure function of the clock: plans are built once per pair of numerals,
// every position is closed-form in seconds since the turn. Burn-in: the face
// walks kit.orbit (2 px), the card is a 50% screen, and 23:00-07:00 the
// panel dims.

import { orbit, previousMinute, dither, sprite } from '../js/kit.js';

const W = 128, H = 64;

// ------------------------------------------------------------ the pieces
// Lattice unit: the small triangle's leg. A full tangram is two large
// triangles (L), a medium (M), two small (S), the square (Q) and the
// parallelogram (P): area 8. Every numeral is exactly two full sets.
const CANON = {
  L: [[0, 0], [2, 0], [0, 2]],
  M: [[0, 0], [2, 0], [1, 1]],
  S: [[0, 0], [1, 0], [0, 1]],
  Q: [[0, 0], [1, 0], [1, 1], [0, 1]],
  P: [[0, 0], [1, 0], [2, 1], [1, 1]],
};
const LOCAL = {};
for (const [k, v] of Object.entries(CANON)) {
  const cx = v.reduce((s, p) => s + p[0], 0) / v.length, cy = v.reduce((s, p) => s + p[1], 0) / v.length;
  LOCAL[k] = v.map(([x, y]) => [x - cx, y - cy]);
}

// The numerals, 4 x 6 lattice cells, each tiled by two sets (found by an
// exact-cover search over the half-cell lattice, then picked by eye).
const GLYPH_SRC = [
  'S110110 Q10202111 Q20303121 S313041 L012103 L414321 M121403 M343243 L050325 L452543 P05152616 S252615 S253526 P45352636',
  'L220220 L204022 L422240 S021203 L224224 M424433 S342433 S343344 P24251615 Q24343525 Q34444535 M361625 P25354636 S454635',
  'M101201 Q10202111 Q20303121 M323041 P13120102 L432341 S241423 L234325 S443443 L042406 L260624 S253526 P45352636 S463645',
  'P10110201 Q10202111 L404220 S212031 S120211 S323142 M222413 L224224 L442442 Q04141505 S344435 L462644 P05152616 M153526',
  'P20211211 S203021 M303221 M111302 L232143 L040224 S232413 Q23333424 Q33434434 L260624 S343524 L262446 P46453435 S051506',
  'S101100 P12110001 Q10202111 Q20303121 M323041 L030123 L323412 M343243 L452543 S141504 L060426 S252615 S253526 P45352636',
  'M101201 L103012 M412130 L030123 L323412 S333243 S131403 P15140304 Q33434434 L060426 Q34444535 S252615 S253526 P45352636',
  'M002011 P12110001 S211120 L404220 S212031 Q21313222 S323142 L240422 S323322 M242233 Q32424333 P43332434 L042406 L260624',
  'M101201 Q10202111 Q20303121 S313041 P13120102 S314132 P41423332 L123214 L341432 S141504 L060426 S344435 L462644 M153526',
  'M363445 L361634 M052516 L434523 L141234 S131403 S333243 P31324342 Q13030212 L404220 Q12020111 S212031 S211120 P01112010',
];

const rot = (x, y, th, sx = 1) => {
  const c = Math.cos(th), s = Math.sin(th);
  x *= sx;
  return [x * c - y * s, x * s + y * c];
};

// A placed piece: its centroid and every (angle, flip) that draws it, since
// most pieces are symmetric and can land in more than one way.
function poseOf(k, verts) {
  const cx = verts.reduce((s, p) => s + p[0], 0) / verts.length, cy = verts.reduce((s, p) => s + p[1], 0) / verts.length;
  const want = verts.map(([x, y]) => `${Math.round((x - cx) * 1000)},${Math.round((y - cy) * 1000)}`).sort().join(' ');
  const opts = [];
  for (let f = 0; f < 2; f++)
    for (let q = 0; q < 4; q++) {
      const th = (q * Math.PI) / 2;
      const got = LOCAL[k].map(([x, y]) => rot(x, y, th, f ? -1 : 1)).map(([x, y]) => `${Math.round(x * 1000)},${Math.round(y * 1000)}`).sort().join(' ');
      if (got === want) opts.push({ th, f });
    }
  if (!opts.length) throw new Error(`tangram: bad piece ${k} ${verts}`);
  return { k, x: cx, y: cy, opts };
}

const GLYPHS = GLYPH_SRC.map((src) => src.split(' ').map((tok) => {
  const k = tok[0], v = [];
  for (let i = 1; i < tok.length; i += 2) v.push([+tok[i], +tok[i + 1]]);
  return poseOf(k, v);
}));

// ------------------------------------------------------------ raster

// Fill a convex polygon (pixel coords), pixel centres inside.
function fillConvex(g, pts, c) {
  let y0 = Infinity, y1 = -Infinity;
  for (const p of pts) { if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
  const ya = Math.max(0, Math.ceil(y0 - 0.5)), yb = Math.min(H - 1, Math.floor(y1 - 0.5));
  const n = pts.length, buf = g.buf;
  for (let y = ya; y <= yb; y++) {
    const yc = y + 0.5;
    let xl = Infinity, xr = -Infinity;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi <= yc && yj >= yc) || (yj <= yc && yi >= yc)) {
        const x = yi === yj ? Math.min(xi, xj) : xi + ((yc - yi) * (xj - xi)) / (yj - yi);
        const x2 = yi === yj ? Math.max(xi, xj) : x;
        if (x < xl) xl = x; if (x2 > xr) xr = x2;
      }
    }
    const xa = Math.max(0, Math.ceil(xl - 0.5)), xb = Math.min(W - 1, Math.floor(xr - 0.5));
    for (let x = xa; x <= xb; x++) buf[y * W + x] = c;
  }
}

// Offset a convex polygon's edges inward by d (negative: outward).
function inset(pts, d) {
  const n = pts.length;
  let area = 0;
  for (let i = 0, j = n - 1; i < n; j = i++) area += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
  const sgn = area > 0 ? 1 : -1;
  const lines = [];
  for (let i = 0; i < n; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % n];
    const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1;
    const nx = (-dy / l) * sgn, ny = (dx / l) * sgn; // inward normal
    lines.push([ax + nx * d, ay + ny * d, dx, dy]);
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    const [px, py, rx, ry] = lines[(i + n - 1) % n], [qx, qy, sx, sy] = lines[i];
    const den = rx * sy - ry * sx;
    if (Math.abs(den) < 1e-9) { out.push([qx, qy]); continue; }
    const t = ((qx - px) * sy - (qy - py) * sx) / den;
    out.push([px + rx * t, py + ry * t]);
  }
  return out;
}

// Piece outline in pixels. Lattice point (i, j) of a slot sits at a pixel
// corner + 0.5, so a seam between two pieces lands on one row of pixel
// centres and the inset clears exactly that row: a one-pixel joint.
function piecePts(k, px, py, th, sx, a, scale) {
  return LOCAL[k].map(([x, y]) => {
    const [u, v] = rot(x, y, th, sx);
    return [px + u * a * scale, py + v * a * scale];
  });
}

// ------------------------------------------------------------ choreography

const clamp01 = (u) => (u < 0 ? 0 : u > 1 ? 1 : u);
const smooth = (u) => { u = clamp01(u); return u * u * (3 - 2 * u); };
const inOut = (u) => { u = clamp01(u); return u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2; };
const outCubic = (u) => 1 - (1 - clamp01(u)) ** 3;
const wrapPi = (a) => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));

function permutations(n) {
  if (n <= 1) return [[0]].slice(0, n ? 1 : 0).concat(n ? [] : [[]]);
  const out = [];
  for (const p of permutations(n - 1)) for (let i = 0; i <= p.length; i++) out.push([...p.slice(0, i), n - 1, ...p.slice(i)]);
  return out;
}
const PERMS = [null, permutations(1), permutations(2), permutations(3), permutations(4)];

// Which piece of the old numeral becomes which piece of the new one, and when
// it lifts and lands. Pieces of a kind are matched to travel least; a piece
// already where it has to be stays down.
const PLANS = new Map();
function plan(from, to) {
  const key = from * 10 + to;
  if (PLANS.has(key)) return PLANS.get(key);
  const A = GLYPHS[from], B = GLYPHS[to];
  const moves = [];
  for (const k of 'LMSQP') {
    const ia = [], ib = [];
    A.forEach((p, i) => p.k === k && ia.push(i));
    B.forEach((p, i) => p.k === k && ib.push(i));
    let best = null, bc = Infinity;
    for (const perm of PERMS[ia.length]) {
      let c = 0;
      perm.forEach((j, i) => { const a = A[ia[i]], b = B[ib[j]]; c += (a.x - b.x) ** 2 + (a.y - b.y) ** 2; });
      if (c < bc) { bc = c; best = perm; }
    }
    best.forEach((j, i) => {
      const a = A[ia[i]], b = B[ib[j]];
      const s = a.opts[0];
      let e = null, ec = Infinity;
      for (const o of b.opts) {
        const c = Math.abs(wrapPi(o.th - s.th)) + (o.f !== s.f ? 0.9 : 0);
        if (c < ec) { ec = c; e = o; }
      }
      const still = Math.hypot(a.x - b.x, a.y - b.y) < 1e-6 && ec < 1e-6;
      moves.push({ k, x0: a.x, y0: a.y, th0: s.th, f0: s.f, x1: b.x, y1: b.y, th1: s.th + wrapPi(e.th - s.th), f1: e.f, still });
    });
  }
  // One piece at a time, like a hand solving the puzzle: each hops from its
  // old place to its new one. A piece may only land once every old piece
  // lying where it lands has left, so nothing ever lands on another.
  const live = moves.filter((m) => !m.still);
  const pts = (m, w) => LOCAL[m.k].map(([x, y]) => { const [u, v] = rot(x, y, w ? m.th1 : m.th0, (w ? m.f1 : m.f0) ? -1 : 1); return [u + (w ? m.x1 : m.x0), v + (w ? m.y1 : m.y0)]; });
  const inside = (P, x, y) => { let s0 = 0; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const c = (P[i][0] - P[j][0]) * (y - P[j][1]) - (P[i][1] - P[j][1]) * (x - P[j][0]); if (Math.abs(c) < 1e-9) continue; if (!s0) s0 = Math.sign(c); else if (Math.sign(c) !== s0) return false; } return true; };
  const overlaps = (A1, B1) => {
    // sample A's interior (shrunk toward its centroid) against B
    const cx = A1.reduce((s1, p1) => s1 + p1[0], 0) / A1.length, cy = A1.reduce((s1, p1) => s1 + p1[1], 0) / A1.length;
    for (const [x, y] of A1) for (const u of [0.25, 0.6, 0.85]) if (inside(B1, cx + (x - cx) * u, cy + (y - cy) * u)) return true;
    return inside(B1, cx, cy);
  };
  for (const m of live) m.block = live.filter((o) => o !== m && overlaps(pts(m, 1), pts(o, 0)));
  const done = new Set(), order = [];
  const pending = [...live].sort((p1, q1) => (p1.x0 + p1.y0 * 0.7) - (q1.x0 + q1.y0 * 0.7));
  while (pending.length) {
    let i = pending.findIndex((m) => m.block.every((o) => done.has(o) || o === m));
    if (i < 0) i = 0;
    const m = pending.splice(i, 1)[0];
    done.add(m); order.push(m);
  }
  const STEP = live.length > 1 ? Math.min(0.13, 1.5 / (live.length - 1)) : 0;
  order.forEach((m, i) => {
    m.t0 = i * STEP;
    const dist = Math.hypot(m.x1 - m.x0, m.y1 - m.y0);
    m.t1 = m.t0 + 0.42 + 0.05 * dist;
    m.h = 0.8 + 0.12 * dist;
  });
  const r = { moves, end: Math.max(0, ...order.map((m) => m.t1)) + 0.25 };
  PLANS.set(key, r);
  return r;
}

// Where a hopping piece is at time t (seconds since its numeral's turn).
function flight(m, t, hmax) {
  if (m.still || t <= m.t0) return { x: m.x0, y: m.y0, th: m.th0, sx: m.f0 ? -1 : 1, z: 0 };
  if (t >= m.t1) {
    const b = (t - m.t1) / 0.16;
    const z = b < 1 ? 0.12 * hmax * Math.sin(Math.PI * b) : 0;
    return { x: m.x1, y: m.y1, th: m.th1, sx: m.f1 ? -1 : 1, z };
  }
  const u = (t - m.t0) / (m.t1 - m.t0);
  const z = hmax * m.h * Math.sin(Math.PI * u) ** 0.8;
  const v = inOut(u);
  const sx0 = m.f0 ? -1 : 1, sx1 = m.f1 ? -1 : 1;
  const sx = sx0 === sx1 ? sx0 : sx0 * Math.cos(Math.PI * smooth((u - 0.15) / 0.7));
  return { x: m.x0 + (m.x1 - m.x0) * v, y: m.y0 + (m.y1 - m.y0) * v, th: m.th0 + (m.th1 - m.th0) * smooth(u), sx, z };
}

// Shadows of anything off the table: a screen of its outline, cast down and
// right as it rises, so height reads as distance from its shadow.
function fillConvexDither(g, pts, level, dx = 0, dy = 0) {
  let y0 = Infinity, y1 = -Infinity;
  for (const p of pts) { if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
  const ya = Math.max(0, Math.ceil(y0 - 0.5)), yb = Math.min(H - 1, Math.floor(y1 - 0.5));
  const n = pts.length, buf = g.buf;
  for (let y = ya; y <= yb; y++) {
    const yc = y + 0.5;
    let xl = Infinity, xr = -Infinity;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi <= yc && yj >= yc) || (yj <= yc && yi >= yc)) {
        const x = yi === yj ? Math.min(xi, xj) : xi + ((yc - yi) * (xj - xi)) / (yj - yi);
        const x2 = yi === yj ? Math.max(xi, xj) : x;
        if (x < xl) xl = x; if (x2 > xr) xr = x2;
      }
    }
    const xa = Math.max(0, Math.ceil(xl - 0.5)), xb = Math.min(W - 1, Math.floor(xr - 0.5));
    for (let x = xa; x <= xb; x++) if (dither(x - dx, y - dy, level)) buf[y * W + x] = 1;
  }
}

function drawShadows(g, pieces) {
  for (const q of pieces) {
    if (q.z < 0.3) continue;
    const d = q.z * 0.55;
    fillConvexDither(g, piecePts(q.k, q.px + d, q.py + d * 1.25, q.th, q.sx, q.a, 1), Math.min(0.5, q.z * 0.12));
  }
}

// ------------------------------------------------------------ the minutes
// Two numerals of loose pieces, 7 px to the lattice unit (28 x 42 each).
const MIN_A = 7;
const MIN_X = [62, 94], MIN_Y = 11;

// Every piece of one numeral, posed for this instant. `t` is seconds since
// its turn; `boost` raises the hops (the hour) and `shiver` the last moments
// before a piece is due to move.
function posePieces(d0, d1, t, bx, by, a, boost, out, next, shiver) {
  const hmax = a * 1.1 * boost;
  const P = d0 === d1 ? null : plan(d0, d1);
  if (!P || t >= P.end) {
    // at rest; pieces that are about to go twitch, as if nudged
    const S = shiver > 0 && next !== d1 ? plan(d1, next) : null;
    const moving = S ? S.moves : null;
    GLYPHS[d1].forEach((p, i) => {
      let th = p.opts[0].th, dx = 0;
      if (moving) {
        const m = moving.find((mm) => Math.abs(mm.x0 - p.x) < 1e-6 && Math.abs(mm.y0 - p.y) < 1e-6 && mm.k === p.k);
        if (m && !m.still) {
          const w = shiver * shiver * Math.max(0, 1 - m.t0 * 0.8);
          th += 0.07 * w * Math.sin(t * 47 + i * 2.1);
          dx = 0.05 * w * Math.sin(t * 61 + i);
        }
      }
      out.push({ k: p.k, a, px: bx + (p.x + dx) * a, py: by + p.y * a, th, sx: p.opts[0].f ? -1 : 1, z: 0 });
    });
    return;
  }
  for (const m of P.moves) {
    const q = flight(m, t, hmax, boost);
    out.push({ k: m.k, a, px: bx + q.x * a, py: by + q.y * a, th: q.th, sx: q.sx, z: q.z });
  }
}

// The solved square, on a grid of quarter sides: the classic dissection.
const SQUARE_G = [
  ['L', [[0, 0], [4, 0], [2, 2]]], ['L', [[0, 0], [2, 2], [0, 4]]], ['M', [[4, 2], [4, 4], [2, 4]]],
  ['S', [[4, 0], [4, 2], [3, 1]]], ['S', [[2, 2], [3, 3], [1, 3]]], ['Q', [[3, 1], [4, 2], [3, 3], [2, 2]]],
  ['P', [[0, 4], [1, 3], [3, 3], [2, 4]]],
];

// ------------------------------------------------------------ the hour card
// A puzzle card lying askew on the table, the hour printed on it as solid
// silhouettes: the problem the loose pieces answer. On the hour it is
// picked up and turned over to the next card; its back is the solved square.
const CARD = { cx: 23.5, cy: 16.5, w: 41, h: 29, ang: -0.08, a: 3.8 };

function cardXf(cx, cy, ang, sxk) {
  const c = Math.cos(ang), s = Math.sin(ang);
  return (x, y) => [cx + x * sxk * c - y * s, cy + x * sxk * s + y * c];
}

function rectPts(xf, w, h) {
  return [xf(-w / 2, -h / 2), xf(w / 2, -h / 2), xf(w / 2, h / 2), xf(-w / 2, h / 2)];
}

function drawCard(g, hh, flip, lift, ox, oy) {
  // flip: 0..2 half-turns (face, back, face); lift: px off the table
  const turn = Math.PI * flip;
  const k = Math.cos(turn), face = k >= 0;
  const sc = 1 + lift * 0.018;
  const xf = cardXf(CARD.cx + ox, CARD.cy + oy - lift * 0.4, CARD.ang + 0.25 * Math.sin(turn), Math.max(0.02, Math.abs(k)) * sc);
  const xfy = (x, y) => xf(x, y * sc);
  fillConvex(g, rectPts(xfy, CARD.w + 1, CARD.h + 1), 0);
  // the screen travels with the burn-in walk, so each pixel is lit half the time
  fillConvexDither(g, rectPts(xfy, CARD.w, CARD.h), 0.5, ox, oy);
  if (Math.abs(k) < 0.08) return;
  const a = CARD.a;
  if (face) {
    const digs = hh;
    digs.forEach((d, i) => {
      const x0 = i ? 1.4 : -1.4 - 4 * a, y0 = -3 * a;
      for (const p of GLYPHS[d]) {
        const o = p.opts[0];
        const pts = LOCAL[p.k].map(([x, y]) => { const [u, v] = rot(x, y, o.th, o.f ? -1 : 1); return xfy(x0 + (p.x + u) * a, y0 + (p.y + v) * a); });
        fillConvex(g, inset(pts, -0.35), 0);
      }
    });
  } else {
    // the back: the seven pieces of the solved square, drawn as a diagram
    const S = 5.2;
    for (const [, v] of SQUARE_G) fillConvex(g, inset(v.map(([x, y]) => xfy((x - 2) * S, (y - 2) * S)), 0.55), 0);
  }
}

// ------------------------------------------------------------ the cat
// A tangram cat sits below the card, side on, facing the minutes: the two
// large triangles are its body, the medium one its face, the small ones its
// ears, the square a front paw, the parallelogram its tail. It flicks its
// tail every second, follows the mouse and the hopping pieces with its head,
// pounces at the minute, and on the hour folds itself back into the solved
// square, spins, and unfolds into a cat again.
const CAT_A = 6;
const R2 = Math.SQRT2, CH = 2 * R2 + 0.85;
const CAT_SRC = [
  ['L', [[0, 0], [0, -2 * R2], [-R2, -R2]]],
  ['L', [[0, 0], [-2 * R2, 0], [-R2, -R2]]],
  ['M', [[-1, -CH], [1, -CH], [0, -CH + 1]]],
  ['S', [[-1, -CH], [0, -CH], [-1, -CH - 1]]],
  ['S', [[0, -CH], [1, -CH], [1, -CH - 1]]],
  ['Q', [[0.15, 0], [1.15, 0], [1.15, -1], [0.15, -1]]],
  ['P', [[-2 * R2, 0], [-2 * R2, -1], [-2 * R2 - 1, -2], [-2 * R2 - 1, -1]]],
];
function poseOptions(k, verts) {
  const cx = verts.reduce((s1, p1) => s1 + p1[0], 0) / verts.length, cy = verts.reduce((s1, p1) => s1 + p1[1], 0) / verts.length;
  const key = (list) => list.map(([x, y]) => `${Math.round(x * 100)},${Math.round(y * 100)}`).sort().join(' ');
  const want = key(verts.map(([x, y]) => [x - cx, y - cy]));
  const opts = [];
  for (let f = 0; f < 2; f++)
    for (let q = 0; q < 8; q++) {
      const th = (q * Math.PI) / 4;
      if (key(LOCAL[k].map(([x, y]) => rot(x, y, th, f ? -1 : 1))) === want) opts.push({ th, f });
    }
  if (!opts.length) throw new Error(`tangram: bad piece ${k}`);
  return { x: cx, y: cy, opts };
}
function freePose(k, verts) {
  const P = poseOptions(k, verts);
  return { k, x: P.x, y: P.y, th: P.opts[0].th, f: P.opts[0].f };
}
const CAT = CAT_SRC.map(([k, v]) => freePose(k, v));

// The same seven pieces as the solved square: what the cat turns back into
// on the hour (and what is printed on the back of the card).
const G = Math.SQRT1_2, SQ_C = [-0.9, -2.6];
const SQUARE_SRC = SQUARE_G.map(([k, v]) => [k, v.map(([x, y]) => [SQ_C[0] + (x - 2) * G, SQ_C[1] + (y - 2) * G])]);
// each cat piece's place in the square: kinds matched, nearest first
const SQUARE = (() => {
  const used = new Set();
  return CAT.map((c) => {
    let best = -1, bd = Infinity;
    SQUARE_SRC.forEach(([k, v], j) => {
      if (k !== c.k || used.has(j)) return;
      const P = poseOptions(k, v), d = (P.x - c.x) ** 2 + (P.y - c.y) ** 2;
      if (d < bd) { bd = d; best = j; }
    });
    used.add(best);
    const P = poseOptions(...SQUARE_SRC[best]);
    let o = null, oc = Infinity;
    for (const op of P.opts) { const cst = Math.abs(wrapPi(op.th - c.th)) + (op.f !== c.f ? 1 : 0); if (cst < oc) { oc = cst; o = op; } }
    return { x: P.x, y: P.y, th: c.th + wrapPi(o.th - c.th), f: o.f };
  });
})();
const CAT_HOME = { x: 38.5, y: 62.5 };
const TAILROOT = [-2 * R2, -0.3];
const EYES = [[-0.27, -CH + 0.3], [0.27, -CH + 0.3]];

function poseCat(out, tt, look, hop, burst, ox, oy, eyesOpen, lunge = 0) {
  const a = CAT_A;
  // tail: a flick on every second, eased there and back
  const ph = tt % 2, flick = ph < 1 ? smooth(ph) : 1 - smooth(ph - 1);
  const tailAng = -0.45 + 0.6 * flick;
  // head: tilts toward whatever is moving
  // head: leans toward whatever it is watching; the eyes go a little further
  const lean = 0.22 * look + 0.03 * Math.sin(tt * 0.9);
  const z = hop, sc = 1 + z * 0.035;
  const place = (x, y) => [CAT_HOME.x + ox + (x + lunge) * a * sc, CAT_HOME.y + oy + y * a * sc - z * 0.45];
  const head = (x, y) => [x + lean, y];
  CAT.forEach((p, i) => {
    let x = p.x, y = p.y, th = p.th;
    if (i >= 2 && i <= 4) [x, y] = head(x, y);
    if (i === 6) {
      const [u, v] = rot(x - TAILROOT[0], y - TAILROOT[1], tailAng);
      x = TAILROOT[0] + u; y = TAILROOT[1] + v; th += tailAng;
    }
    let pz = z, sx = p.f ? -1 : 1;
    if (burst > 0) {
      // the hour: the cat folds itself back into the solved square, which
      // spins once in the air, and unfolds into a cat again
      const S = SQUARE[i];
      const e = smooth(burst / 0.3) * (1 - smooth((burst - 0.7) / 0.3));
      const spin = 2 * Math.PI * inOut((burst - 0.28) / 0.44);
      const [u, v] = rot(S.x - SQ_C[0], S.y - SQ_C[1], spin);
      const tx = SQ_C[0] + u, ty = SQ_C[1] + v - 0.6 * Math.sin(Math.PI * clamp01((burst - 0.2) / 0.6));
      x += (tx - x) * e; y += (ty - y) * e;
      th += (S.th + spin - th) * e;
      if (S.f !== p.f) sx = (p.f ? -1 : 1) * Math.cos(Math.PI * e);
      pz += 6 * Math.sin(Math.PI * clamp01(burst / 1.0)) + i * 0.01;
    }
    const [px, py] = place(x, y);
    const q = { k: p.k, a, px, py, th, sx, z: pz };
    if (i === 2 && eyesOpen) q.eyes = EYES.map(([ex, ey]) => place(...head(ex + 0.12 * look, ey)));
    out.push(q);
  });
}

// ------------------------------------------------------------ the mouse
// The cat's quarry: a mouse that creeps in from the right along the foot of
// the glass, a dash every second, until it is under the cat's nose at the
// end of the minute. At the turn the cat pounces, the mouse bolts back under
// the minutes and knocks their pieces loose as it goes.
const MOUSE = [
  sprite(`
    ...##.......
    ..####......
    .#.####.....
    ########....
    .########..#
    ..#...#.###.
  `),
  sprite(`
    ...##.......
    ..####......
    .#.####.....
    ########....
    .########.##
    ...#.#...#..
  `),
];
const MOUSE_Y = 57;
const MOUSE_NEAR = 50, MOUSE_FAR = 118;

// Where the mouse is (x of its nose), which way it faces, and whether it is
// running, as a function of the second.
function mouseAt(sec) {
  if (sec < 1.0) {
    // bolting right, past the minutes and off the glass
    const u = clamp01(sec / 1.0);
    return { x: MOUSE_NEAR + (W + 12 - MOUSE_NEAR) * (u * u * (1.6 - 0.6 * u)), dir: 1, run: true };
  }
  if (sec < 2.4) return null;
  if (sec < 3.4) return { x: W + 4 - (W + 4 - MOUSE_FAR) * outCubic((sec - 2.4) / 1.0), dir: -1, run: sec < 3.25 };
  // creeping in: a dash each second, a pause to sniff
  const steps = 56, k = (sec - 3.4) / (60 - 3.4) * steps;
  const i = Math.floor(k), fr = k - i;
  const dash = smooth(fr / 0.45);
  const x = MOUSE_FAR - (MOUSE_FAR - MOUSE_NEAR) * ((i + dash) / steps);
  return { x, dir: -1, run: fr < 0.45 };
}

function drawMouse(g, m, tt, ox, oy) {
  if (!m) return;
  const spr = MOUSE[m.run ? Math.floor(tt * 14) & 1 : 0];
  const bob = m.run ? (Math.floor(tt * 14) & 1) : 0;
  const x = m.dir < 0 ? m.x : m.x - spr.w;
  g.fillRect(Math.round(x + ox) - 1, MOUSE_Y - 1 - bob, spr.w + 2, spr.h + 2, 0);
  g.blit(spr, x + ox, MOUSE_Y - bob, { flipX: m.dir > 0 });
}

// ------------------------------------------------------------ frame

function drawPieces(g, pieces) {
  drawShadows(g, pieces);
  pieces.sort((p, q) => p.z - q.z);
  for (const q of pieces) {
    const sc = 1 + q.z * 0.035;
    const pts = piecePts(q.k, q.px, q.py, q.th, q.sx, q.a, sc);
    if (q.z > 0.05) fillConvex(g, inset(pts, -0.6), 0);
    fillConvex(g, inset(pts, 0.4), 1);
    if (q.eyes) for (const [ex, ey] of q.eyes) g.pixel(Math.floor(ex), Math.floor(ey), 0);
  }
}

export default {
  name: 'Tangram',
  blurb: 'Minutes cut from loose tangram pieces that re-solve themselves one hop at a time, the hour a printed puzzle card; a tangram cat pounces each minute and folds back into the solved square on the hour.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  driver: 'full',
  frame(g, ctx) {
    const { fields: f, date, oled, night } = ctx;
    const [ox, oy] = orbit(date, 2, 3);
    const tt = date.getTime() / 1000;
    const p = previousMinute(date);
    const nx = new Date(date.getTime() + 60000);
    const nm = nx.getMinutes();
    const sec = f.sec;
    const hourTurn = f.m === 0 && sec < 6;
    const boost = hourTurn ? 1.7 : 1;

    // minutes
    const pieces = [];
    const mNow = [Math.floor(f.m / 10), f.m % 10], mWas = [Math.floor(p.m / 10), p.m % 10], mNext = [Math.floor(nm / 10), nm % 10];
    // the mouse bolts under the tens at ~0.25 s and the units at ~0.45 s
    const lag = [0.12, 0.3];
    const shiver = clamp01((sec - 59.2) / 0.8);
    for (let i = 0; i < 2; i++)
      posePieces(mWas[i], mNow[i], sec - lag[i], MIN_X[i] + ox + 0.5, MIN_Y + oy + 0.5, MIN_A, boost, pieces, mNext[i], shiver);

    // on the hour the table is slammed: every piece jumps, in a wave from the cat
    if (hourTurn)
      for (const q of pieces) {
        const u = (sec - 0.15 - (q.px - 40) / 260) / 0.42;
        if (u > 0 && u < 1) q.z += 5 * Math.sin(Math.PI * u);
      }

    // the mouse, and the cat watching it (or the flying pieces)
    const mouse = mouseAt(sec);
    let busy = 0, bx = 0;
    for (const q of pieces) if (q.z > 0.2) { busy += q.z; bx += q.z * q.px; }
    const target = busy > 2 ? bx / busy : mouse ? mouse.x : 90;
    const look = clamp01((target - 34) / 70) * 1.2 - 0.2;

    // the cat: crouches as the mouse arrives, pounces at the minute, comes
    // apart at the hour
    let hop = 0, burst = 0, lunge = 0;
    if (hourTurn) burst = clamp01((sec - 0.2) / 3.2);
    if (sec < 0.6) { const u = sec / 0.6; hop = (hourTurn ? 7 : 5) * Math.sin(Math.PI * u); lunge = 1.4 * Math.sin(Math.PI * u); }
    if (sec > 59.3) lunge = -0.25 * smooth((sec - 59.3) / 0.5);
    const catPieces = [];
    const blink = (tt % 4.3) < 0.12;
    poseCat(catPieces, tt, look, hop, burst, ox, oy, !blink && burst === 0, lunge);

    // the hour card: turned over on the hour
    const hNow = [Math.floor(f.h / 10), f.h % 10], hWas = [Math.floor(p.h / 10), p.h % 10];
    let flip = 0, lift = 0, show = hNow;
    if (f.m === 0 && sec < 3.4) {
      flip = 2 * inOut((sec - 0.5) / 2.4);       // a whole turn: face, back, face
      lift = 9 * Math.sin(Math.PI * clamp01((sec - 0.25) / 3.0));
      show = flip < 1 ? hWas : hNow;
    }
    drawCard(g, show, flip, lift, ox, oy);

    drawMouse(g, mouse, tt, ox, oy);
    drawPieces(g, pieces.concat(catPieces));
    oled.contrast(0xcf + (0x20 - 0xcf) * night);
  },
};

