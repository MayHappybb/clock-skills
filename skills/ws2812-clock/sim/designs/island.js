// Island: the seven hexagons are seven tiles of a tiny board-game island.
//
//   top row      wheat fields: the HOUR, laid out in red road pieces
//   middle row   mountains with a mine | a lake | a forest
//   bottom row   pastures: the MINUTE, a flock of sheep standing in line
//
// Digits are drawn for the hexagon's own lattice: verticals and 30-degree
// lines only, roofs on top and keels below, so a 0 is a tall hexagon (a
// tile) and an 8 is two hexagons touching. Every node is an LED, every road
// piece is two LEDs long and a sheep stands on every LED of a stroke.
// The seams are the tile borders, the outer ring of LEDs is the surf round
// the island, and the sun follows the real time across the board: it lights
// the mountain's sunward slopes and glints on the lake; at night the
// settlements' windows glow. The ferry circles the lake once a minute.
//
// Minute turn: the sheepdog runs a lap and the flock trots into the new
// digit; sheep the new digit doesn't need go into the barn, extras come out.
// Hour turn: two dice tumble across the board and land on the new hour
// (their sum, 12-hour), the robber hops to another tile, and settlers carry
// the red road pieces to their new places.
//
// Stateless: everything is a function of the wall clock. Who walks where is
// planned once per digit pair and cached.
import * as kit from '../js/kit.js';

const CS = 2 * Math.sqrt(3);                  // column step, 3.464 mm
const A = 4 * CS;                             // digit half-width: 4 columns
// ---------------------------------------------------------------- digits
// Nodes sit exactly on LEDs (even columns, rows on 4 mm), joined only by
// lattice lines: vertical, or 30 degrees (4 columns = 8 mm of drop).
const N = {
  T: [0, -32], UL: [-A, -24], UR: [A, -24], ML: [-A, -8], MR: [A, -8], C: [0, 0],
  NL: [-A, 8], NR: [A, 8], LL: [-A, 24], LR: [A, 24], B: [0, 32],
};
const GLYPH = {
  0: [['T', 'UR', 'LR', 'B', 'LL', 'UL', 'T']],
  1: [['UL', 'T', 'B']],
  2: [['UL', 'T', 'UR', 'MR', 'NL', 'LL', 'B', 'LR']],
  3: [['UL', 'T', 'UR', 'MR', 'C', 'NR', 'LR', 'B', 'LL']],
  4: [[[-A, -24], [-A, 0], [0, 8], [A, 0]], [[A, -24], [A, 32]]],
  5: [[[A, -32], [-A, -16], 'ML', 'C', 'NR', 'LR', 'B', 'LL']],   // a slanted flag, so it is never an S
  6: [['UR', 'T', 'UL', 'LL', 'B', 'LR', 'NR', 'C', 'NL']],
  7: [['UL', 'T', 'UR', [A, 32]]],
  8: [['T', 'UR', 'MR', 'C', 'ML', 'UL', 'T'], ['C', 'NR', 'LR', 'B', 'LL', 'NL', 'C']],
  9: [['T', 'UR', 'LR', 'B', 'LL'], ['T', 'UL', 'ML', 'C', 'MR']],
};
const pt = (p) => (typeof p === 'string' ? N[p] : p);
/** Glyph d as straight segments [ax, ay, bx, by] in tile-local mm. */
const segsOf = (d) => GLYPH[d].flatMap((pl) => pl.slice(1).map((p, k) => [...pt(pl[k]), ...pt(p)]));
const memo = (f) => { const c = {}; return (d) => c[d] ?? (c[d] = f(d)); };
/** Where the sheep stand for digit d: one on every LED of the strokes, corners shared. */
const sheepOf = memo((d) => {
  const out = [];
  for (const [ax, ay, bx, by] of segsOf(d)) {
    const n = Math.round(Math.hypot(bx - ax, by - ay) / 4);
    for (let k = 0; k <= n; k++) {
      const x = kit.lerp(ax, bx, k / n), y = kit.lerp(ay, by, k / n);
      if (!out.some((p) => Math.hypot(p.x - x, p.y - y) < 1)) out.push({ x, y, a: 0 });
    }
  }
  return out;
});
/** Road pieces for digit d: every segment cut into 8 mm sticks. */
const roadOf = memo((d) => {
  const out = [];
  for (const [ax, ay, bx, by] of segsOf(d)) {
    const n = Math.round(Math.hypot(bx - ax, by - ay) / 8), a = Math.atan2(by - ay, bx - ax);
    for (let k = 0; k < n; k++) out.push({ x: kit.lerp(ax, bx, (k + 0.5) / n), y: kit.lerp(ay, by, (k + 0.5) / n), a });
  }
  return out;
});
/** Settlements stand on the digit's corners, like settlements on a board's vertices. */
const housesOf = memo((d) => {
  const out = [];
  for (const pl of GLYPH[d]) for (const q of pl) {
    const p = pt(q);
    if (!out.some((o) => Math.hypot(o[0] - p[0], o[1] - p[1]) < 1)) out.push(p);
  }
  return out;
});
/** The settler's beat: the glyph's longest stroke as a polyline, with its length. */
const beatOf = memo((d) => {
  const pls = GLYPH[d].map((pl) => pl.map(pt));
  const len = (pl) => pl.slice(1).reduce((s, p, k) => s + Math.hypot(p[0] - pl[k][0], p[1] - pl[k][1]), 0);
  const pl = pls.sort((a, b) => len(b) - len(a))[0];
  return { pl, len: len(pl) };
});
function alongBeat(b, s) {
  for (let k = 1; k < b.pl.length; k++) {
    const [ax, ay] = b.pl[k - 1], [bx, by] = b.pl[k], l = Math.hypot(bx - ax, by - ay);
    if (s <= l || k === b.pl.length - 1) { const f = kit.clamp(s / l); return [kit.lerp(ax, bx, f), kit.lerp(ay, by, f)]; }
    s -= l;
  }
  return b.pl[0];
}
// ------------------------------------------------------------- the moves
/** Minimum-cost assignment (Hungarian), n x n: returns col for each row. */
function assign(cost) {
  const n = cost.length, u = new Float64Array(n + 1), v = new Float64Array(n + 1);
  const p = new Int32Array(n + 1), way = new Int32Array(n + 1);
  for (let i = 1; i <= n; i++) {
    p[0] = i; let j0 = 0;
    const minv = new Float64Array(n + 1).fill(Infinity), used = new Uint8Array(n + 1);
    do {
      used[j0] = 1; const i0 = p[j0]; let delta = Infinity, j1 = 0;
      for (let j = 1; j <= n; j++) if (!used[j]) {
        const c = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (c < minv[j]) { minv[j] = c; way[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      for (let j = 0; j <= n; j++) if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
  }
  const col = new Int32Array(n);
  for (let j = 1; j <= n; j++) col[p[j] - 1] = j - 1;
  return col;
}
const angGap = (a, b) => { const d = Math.abs(((a - b) % Math.PI + Math.PI) % Math.PI); return Math.min(d, Math.PI - d); };

/**
 * How the pieces of digit a become digit b. Pieces in both stay put; the
 * rest are paired by least travel, and the surplus goes home to `H` (barn,
 * woodpile) or comes out of it. Timing: each starts after a small stagger
 * and walks at its own pace, all done by `end` seconds.
 */
function planMoves(Pa, Pb, H, { angW = 0, end = 2.8, speed = 40, seed = 0, spread = 0.8 } = {}) {
  const usedB = new Set(), stay = [], ra = [];
  for (const p of Pa) {
    const j = Pb.findIndex((q, k) => !usedB.has(k) && Math.abs(q.x - p.x) < 0.5 && Math.abs(q.y - p.y) < 0.5 && angGap(p.a, q.a) < 0.05);
    if (j >= 0) { usedB.add(j); stay.push(Pb[j]); } else ra.push(p);
  }
  const rb = Pb.filter((_, k) => !usedB.has(k)), n = Math.max(ra.length, rb.length);
  const home = { x: H[0], y: H[1], a: Math.PI / 2, home: true };
  const A_ = [...ra, ...Array(n - ra.length).fill(home)], B_ = [...rb, ...Array(n - rb.length).fill(home)];
  const cost = A_.map((p) => B_.map((q) => (p.home && q.home ? 0 : Math.hypot(p.x - q.x, p.y - q.y) + angW * angGap(p.a, q.a))));
  const col = n ? assign(cost) : [];
  const moves = [];
  A_.forEach((p, i) => {
    const q = B_[col[i]];
    if (p.home && q.home) return;
    const dist = Math.hypot(p.x - q.x, p.y - q.y), h = kit.hash(i, seed, 7);
    // every departure starts (by 0.9 s) before the first arrival (at 1.0 s or later), so the
    // pieces standing still are only ever part of the old digit or part of the new one
    const dur = kit.clamp(0.9 + dist / speed, 0.9, 1.9), delay = Math.min(0.1 + spread * h, end - dur);
    // shortest turn for a stick (it has no head): end angle within 90 degrees
    let a1 = q.a; while (a1 - p.a > Math.PI / 2) a1 -= Math.PI; while (p.a - a1 > Math.PI / 2) a1 += Math.PI;
    moves.push({ p, q, a1, out: !!q.home, in: !!p.home, delay, dur, bulge: (kit.hash(i, seed, 3) - 0.5) * Math.min(20, 4 + dist * 0.5) });
  });
  return { stay, moves, changed: moves.length > 0 };
}
const planCache = new Map();
function planFor(kind, a, b, H) {
  const k = kind + a + b;
  if (!planCache.has(k)) planCache.set(k, kind === 'road'
    ? planMoves(roadOf(a), roadOf(b), H, { angW: 10, end: 3.0, speed: 45, seed: +a * 10 + +b })
    : planMoves(sheepOf(a), sheepOf(b), H, { end: 2.7, speed: 30, seed: +a * 10 + +b + 100, spread: 0.25 }));
  return planCache.get(k);
}
/** A moving piece at `age` seconds into the turn: [x, y, angle, alpha, lifted 0..1]. */
function poseOf(m, age, bolt = false) {
  // sheep bolt (fast away, slow to settle) so the old digit breaks up at once; sticks are lifted and set down
  const u = kit.clamp((age - m.delay) / m.dur), e = bolt ? 1 - (1 - u) ** 2.6 : kit.ease.inOut(u);
  const dx = m.q.x - m.p.x, dy = m.q.y - m.p.y, L = Math.hypot(dx, dy) || 1, b = m.bulge * Math.sin(Math.PI * e);
  const x = m.p.x + dx * e - (dy / L) * b, y = m.p.y + dy * e + (dx / L) * b;
  let al = 1;
  if (m.in) al = kit.smoothstep(0, 0.2, e);
  if (m.out) al = 1 - kit.smoothstep(0.8, 1, e);
  return [x, y, kit.lerp(m.p.a, m.a1, e), al, Math.sin(Math.PI * u)];
}
// ------------------------------------------------------------ the island
// Board numbers in the hex-flower layout: 0 centre, 1 right, 2 bottom-right,
// 3 bottom-left, 4 left, 5 top-left, 6 top-right.
const HOUR_T = 5, HOUR_U = 6, MIN_T = 3, MIN_U = 2, MINE = 4, LAKE = 0, WOOD = 1;
const KIND_OF = { 5: 0, 6: 0, 3: 1, 2: 1, 4: 2, 0: 3, 1: 4 };   // wheat, grass, rock, water, forest; 5 = surf
const HOME = { 5: [-27.7, 0], 6: [27.7, 0], 3: [-28.5, 0], 2: [28.5, 0] };   // woodpiles and barns, tile-local
const PEAKS = [[-5, -12, 30, 1], [15, 6, 22, 0.72], [-17, 14, 19, 0.6]];    // mountain: x, y, radius, height
const MINE_AT = [9, 26];
const ROBBER_SPOTS = [[MINE, -15, -10], [WOOD, -12, -14], [MINE, 16, -18], [WOOD, 14, 14], [MINE, -20, 12], [WOOD, 18, -10]];

const C = {
  // grounds: one or two channels each, dark so the strokes glow; dithered at the dim end
  soil: [0.010, 0.003, 0.0], wheat: [0.080, 0.036, 0.0],
  grassD: [0.0, 0.018, 0.0], grassL: [0.006, 0.052, 0.0],
  rock: [0.036, 0.032, 0.032], snow: [0.15, 0.16, 0.19],
  deep: [0.0, 0.008, 0.055], shallow: [0.0, 0.040, 0.050], sand: [0.050, 0.032, 0.006],
  floor: [0.0, 0.014, 0.003], crown: [0.008, 0.062, 0.008],
  sea: [0.0, 0.018, 0.075], foam: [0.11, 0.13, 0.15],
  road: [0.62, 0.035, 0.012], house: [0.85, 0.62, 0.26], settler: [0.5, 0.45, 0.4],
  wood: [0.10, 0.035, 0.0], barn: [0.13, 0.010, 0.0],
  sheep: [0.50, 0.48, 0.40], dog: [0.42, 0.17, 0.02],
  sail: [0.45, 0.43, 0.40], wake: [0.05, 0.08, 0.10], lamp: [0.45, 0.20, 0.04],
  robber: [0.075, 0.068, 0.085],
};

let PREP = null;
/** Per-LED terrain, built once per layout: kind, textures, local position. */
function prep(L) {
  if (PREP?.key === L.key) return PREP;
  const n = L.n, kind = new Uint8Array(n), tex = new Float32Array(n), tex2 = new Float32Array(n);
  const gx = new Float32Array(n), gy = new Float32Array(n), lx = new Float32Array(n), ly = new Float32Array(n);
  const crowns = [];
  for (let y = -44; y <= 44; y += 7) for (let x = -40; x <= 40; x += 7.5) {
    const h = kit.hash(Math.round(x * 10), Math.round(y * 10), 5);
    crowns.push([x + (h - 0.5) * 4 + (y / 7 % 2) * 3.7, y + (kit.hash(Math.round(x), Math.round(y), 9) - 0.5) * 3, 3.4 + 1.6 * h, 0.55 + 0.45 * kit.hash(Math.round(x), Math.round(y), 2)]);
  }
  for (const l of L.leds) {
    const i = l.i, o = L.panels[l.panel], x = l.x - o.x, y = l.y - o.y;
    lx[i] = x; ly[i] = y;
    let k = KIND_OF[l.panel];
    if (l.ring === 10 && L.index.near(l.x, l.y, 6.5).every((j) => L.leds[j].panel === l.panel)) k = 5;
    kind[i] = k;
    if (k === 0) {        // wheat: furrows along the 30-degree lattice line, in patches
      const f = 0.5 + 0.5 * Math.sin((x * 0.5 + y * 0.866) * kit.TAU / 6.93);
      tex[i] = 0.2 + 0.8 * f * (0.6 + 0.4 * kit.noise2(x * 0.09 + l.panel, y * 0.09));
      tex2[i] = kit.noise2(x * 0.2, y * 0.2 + 7);
    } else if (k === 1) { tex[i] = kit.noise2(x * 0.16 + l.panel * 9, y * 0.16); tex2[i] = kit.hash(i); }
    else if (k === 2) {   // rock: three cones and a little ridge noise; the gradient faces outwards
      let best = 0, bx = 0, by = 0;
      for (const [px, py, r, hh] of PEAKS) {
        const d = Math.hypot(x - px, y - py), h = hh * (1 - d / r);
        if (h > best) { best = h; bx = (x - px) / (d || 1); by = (y - py) / (d || 1); }
      }
      tex[i] = best + 0.12 * (kit.noise2(x * 0.18, y * 0.18) - 0.5); gx[i] = bx; gy[i] = by;
    } else if (k === 3) { tex[i] = l.ring; tex2[i] = kit.hash(i, 3) * kit.TAU; }
    else if (k === 4) {
      let best = 0, ph = 0;
      for (const [cx, cy, r, b] of crowns) { const d2 = ((x - cx) ** 2 + (y - cy) ** 2) / (r * r); if (d2 < 1 && b * (1 - d2) > best) { best = b * (1 - d2); ph = cx * 0.7 + cy; } }
      tex[i] = best; tex2[i] = ph;
    } else { tex[i] = Math.atan2(l.y, l.x); tex2[i] = kit.hash(i, 11); }
  }
  return (PREP = { key: L.key, kind, tex, tex2, gx, gy, lx, ly, tileDim: new Float32Array(L.panels.length) });
}
// ------------------------------------------------------------------- sky
/** The sun from the wall clock: east (right) at 6, south (bottom) at noon, west at 18. */
function sky(date) {
  const h = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
  const phi = (h - 6) / 12 * Math.PI, alt = Math.sin(phi);
  const day = kit.smoothstep(-0.18, 0.28, alt);
  const sunCol = kit.mix([1.0, 0.52, 0.28], [1.0, 0.96, 0.9], kit.smoothstep(0.05, 0.5, alt));
  const light = kit.mix([0.30, 0.38, 0.72], sunCol, day);
  // by night the moon, opposite, lights the slopes and the lake instead
  const dir = day > 0.5 ? [Math.cos(phi), Math.sin(phi)] : [-Math.cos(phi), -Math.sin(phi)];
  return { alt, day, light, dir, level: kit.lerp(0.5, 1, day) };
}

// ------------------------------------------------------------------ dice
const rot = (ax, ay, az, t) => {   // Rodrigues, row-major 3x3
  const n = Math.hypot(ax, ay, az) || 1, x = ax / n, y = ay / n, z = az / n, c = Math.cos(t), s = Math.sin(t), k = 1 - c;
  return [c + x * x * k, x * y * k - z * s, x * z * k + y * s, y * x * k + z * s, c + y * y * k, y * z * k - x * s, z * x * k - y * s, z * y * k + x * s, c + z * z * k];
};
const mul = (a, b) => {
  const o = new Array(9);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o[3 * r + c] = a[3 * r] * b[c] + a[3 * r + 1] * b[3 + c] + a[3 * r + 2] * b[6 + c];
  return o;
};
// face value -> the turn that brings it to face the viewer (+z); opposite faces sum to 7
const FACE_UP = { 1: rot(1, 0, 0, 0), 6: rot(1, 0, 0, Math.PI), 2: rot(0, 1, 0, -Math.PI / 2), 5: rot(0, 1, 0, Math.PI / 2), 3: rot(1, 0, 0, Math.PI / 2), 4: rot(1, 0, 0, -Math.PI / 2) };
const FACE_VAL = [[2, 5], [3, 4], [1, 6]];     // [axis][+ / -]
const PIPS = {
  1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
};
const DIE = 14;                              // half-size, mm
const DIE_COL = [{ body: [0.11, 0.006, 0.003], pip: [0.62, 0.56, 0.46] }, { body: [0.10, 0.065, 0.0], pip: [0.62, 0.56, 0.46] }];

/** The hour's dice at `age` s past the hour: thrown from the left, tumbling, landing on h12. */
function diceOf(age, hourIdx, h12) {
  if (age > 15) return [];
  const lo = Math.max(1, h12 - 6), hi = Math.min(6, h12 - 1);
  const v0 = h12 === 1 ? 1 : lo + Math.floor(kit.hash(hourIdx, 41) * (hi - lo + 1));
  const vals = h12 === 1 ? [1] : [v0, h12 - v0];
  return vals.map((v, k) => {
    const t0 = 0.05 + 0.2 * k, t1 = 2.2 + 0.3 * k;
    if (age < t0) return null;
    const u = kit.clamp((age - t0) / (t1 - t0));
    const S = [-135, -26 + 34 * k], E = k ? [15, 9] : [-15, -10];
    const e = kit.ease.out(u), x = kit.lerp(S[0], E[0], e), y = kit.lerp(S[1], E[1], e);
    const z = 30 * (1 - u) ** 2 * Math.abs(Math.cos(Math.PI * 2.5 * u ** 0.75));
    const dx = E[0] - S[0], dy = E[1] - S[1];
    const spin = (5 + 2 * kit.hash(hourIdx, k, 2)) * Math.PI * (1 - u) ** 2;
    const yaw = 2.2 * (1 - u) ** 2;               // lands square to the lattice
    const R = mul(rot(0, 0, 1, yaw), mul(rot(-dy, dx, 25, spin), FACE_UP[v]));
    const gone = kit.smoothstep(13, 14.5, age);
    return { x, y, z, R, s: DIE * (1 + z / 70 + 0.35 * gone), alpha: 1 - gone, col: DIE_COL[k] };
  }).filter(Boolean);
}
/** Paint a die: an orthographic ray per LED against the turned cube. */
function drawDie(ctx, d, sun) {
  const R = d.R, dz0 = R[6], dz1 = R[7], dz2 = R[8], reach = d.s * 1.75;
  for (const i of ctx.layout.index.near(d.x, d.y, reach)) {
    const l = ctx.leds[i], u = (l.x - d.x) / d.s, v = (l.y - d.y) / d.s;
    const o = [R[0] * u + R[3] * v, R[1] * u + R[4] * v, R[2] * u + R[5] * v], dd = [dz0, dz1, dz2];
    let zlo = -Infinity, zhi = Infinity, kk = -1, miss = false;
    for (let k = 0; k < 3; k++) {
      if (Math.abs(dd[k]) < 1e-6) { if (Math.abs(o[k]) > 1) miss = true; continue; }
      const z1 = (-1 - o[k]) / dd[k], z2 = (1 - o[k]) / dd[k];
      if (Math.min(z1, z2) > zlo) zlo = Math.min(z1, z2);
      if (Math.max(z1, z2) < zhi) { zhi = Math.max(z1, z2); kk = k; }
    }
    if (miss || zlo > zhi || kk < 0) continue;
    const h = [o[0] + zhi * dd[0], o[1] + zhi * dd[1], o[2] + zhi * dd[2]], sg = h[kk] > 0 ? 1 : -1;
    const fa = h[(kk + 1) % 3], fb = h[(kk + 2) % 3];
    const nz = sg * R[6 + kk], ns = sg * (R[kk] * sun.dir[0] + R[3 + kk] * sun.dir[1]);
    const edge = 1 - 0.7 * kit.smoothstep(0.82, 1, Math.max(Math.abs(fa), Math.abs(fb)));
    const shade = (0.3 + 0.7 * Math.max(0, nz) + 0.35 * Math.max(0, ns) * sun.day) * edge;
    let pd = 9;
    for (const [pa, pb] of PIPS[FACE_VAL[kk][sg > 0 ? 0 : 1]]) pd = Math.min(pd, Math.hypot(fa - pa * 0.58, fb - pb * 0.58));
    const pip = 1 - kit.smoothstep(0.12, 0.23, pd);
    const c = kit.mix(d.col.body, d.col.pip, pip);
    kit.over(ctx, i, kit.scale(c, shade), d.alpha);
  }
}
// ---------------------------------------------------------------- robber
const PERM = [0, 3, 1, 4, 2, 5];
/** The robber's spot for hour h (0..23): consecutive hours always differ. */
const spotOf = (h) => ROBBER_SPOTS[PERM[(5 * h) % 6]];
function robberAt(L, date, ageH) {
  const h = date.getHours(), b = spotOf(h), a = spotOf((h + 23) % 24);
  const wpos = (s) => [L.panels[s[0]].x + s[1], L.panels[s[0]].y + s[2]];
  const u = kit.clamp((ageH - 2.6) / 1.0), e = kit.ease.inOut(u);
  const pa = wpos(a), pb = wpos(b);
  return { x: kit.lerp(pa[0], pb[0], e), y: kit.lerp(pa[1], pb[1], e) - 26 * Math.sin(Math.PI * e), sc: 1 + 0.45 * Math.sin(Math.PI * e), from: a[0], to: b[0], e };
}
function drawRobber(ctx, r, sun) {
  // a grey pawn, lit from the sun's side, with a dark collar of shadow round it
  const s = r.sc, o = ctx.out;
  for (const i of ctx.layout.index.near(r.x, r.y, 13 * s)) {
    const l = ctx.leds[i], dx = (l.x - r.x) / s, dy = (l.y - r.y) / s;
    const body = Math.hypot(dx / 5.6, (dy - 3) / 6.8), head = Math.hypot(dx, dy + 6.5) / 3.8;
    const m = Math.min(body, head), cov = 1 - kit.smoothstep(0.85, 1.15, m), ring = kit.smoothstep(1.0, 1.25, m) * (1 - kit.smoothstep(1.5, 1.9, m));
    const k = 1 - 0.9 * Math.max(cov, ring);
    o[3 * i] *= k; o[3 * i + 1] *= k; o[3 * i + 2] *= k;
    const lit = 0.6 + 0.5 * kit.clamp((dx * sun.dir[0] + dy * sun.dir[1]) / 6);
    kit.add(ctx, i, C.robber, cov * lit * kit.lerp(0.45, 1, sun.day));
  }
}

// ------------------------------------------------------------------ misc
const pad = (n) => String(n).padStart(2, '0');
/** A point on the hexagon of corner radius R (pointy top), s in 0..1 clockwise from the top. */
function hexAt(R, s) {
  s = (((s % 1) + 1) % 1) * 6;
  const e = Math.floor(s), f = s - e, a0 = -Math.PI / 2 + e * Math.PI / 3, a1 = a0 + Math.PI / 3;
  return [R * kit.lerp(Math.cos(a0), Math.cos(a1), f), R * kit.lerp(Math.sin(a0), Math.sin(a1), f)];
}
const EPOCH = 1.7e9;   // animation seconds are counted from here, to keep noise inputs small

/** The ground: every LED's terrain, lit by the sun or moon, under the clouds. */
function drawGround(ctx, P, sun, T, robber) {
  const { leds, out } = ctx, n = ctx.n, [lr, lg, lb] = sun.light, [sx, sy] = sun.dir;
  const dim = P.tileDim; dim.fill(1);
  dim[robber.from] *= kit.lerp(0.7, 1, robber.e); dim[robber.to] *= kit.lerp(1, 0.7, robber.e);
  const cloudK = 0.42 * sun.day, cx = T * 0.045, cy = T * 0.011;
  for (let i = 0; i < n; i++) {
    const l = leds[i], x = l.x, y = l.y, tx = P.tex[i], t2 = P.tex2[i];
    let c0, c1, m;
    switch (P.kind[i]) {
      case 0: { const w = 0.5 + 0.5 * Math.sin((x * 0.8 + y * 0.45) * 0.13 - T * 1.6 + t2 * 1.2); c0 = C.soil; c1 = C.wheat; m = tx * (0.65 + 0.55 * w); break; }
      case 1: { const w = 0.5 + 0.5 * Math.sin((x * 0.6 - y * 0.5) * 0.12 - T * 1.1); c0 = C.grassD; c1 = C.grassL; m = tx * (0.7 + 0.4 * w); break; }
      case 2: {
        const lit = Math.max(0, P.gx[i] * sx + P.gy[i] * sy), sh = 0.4 + 1.1 * lit + 0.3 * tx;
        const sn = kit.smoothstep(0.66, 0.8, tx);
        c0 = kit.scale(C.rock, sh); c1 = kit.scale(C.snow, 0.55 + 0.6 * lit); m = sn; break;
      }
      case 3: {
        if (tx >= 9) { c0 = C.sand; c1 = C.shallow; m = 0.3 * (0.5 + 0.5 * Math.sin(T * 0.8 + t2)); break; }
        const sh = 0.8 + 0.35 * Math.sin(x * 0.42 + T * 1.3 + t2) * Math.sin(y * 0.37 - T * 0.8);
        c0 = kit.scale(C.shallow, sh); c1 = kit.scale(C.deep, sh); m = kit.smoothstep(0, 5, 8 - tx); break;
      }
      case 4: c0 = C.floor; c1 = C.crown; m = tx * (0.8 + 0.3 * Math.sin(T * 1.3 + t2 + x * 0.03)); break;
      default: {
        const w = Math.sin(tx * 42 - T * 0.7 + 2 * Math.sin(tx * 5 + T * 0.2));
        c0 = C.sea; c1 = C.foam; m = (w > 0 ? w ** 6 : 0) * (0.55 + 0.45 * Math.sin(T * 0.9 + tx * 3)); break;
      }
    }
    const cl = kit.noise2(x * 0.017 + cx, y * 0.021 + cy);
    const f = sun.level * dim[l.panel] * (1 - cloudK * kit.smoothstep(0.52, 0.8, cl));
    out[3 * i] = (c0[0] + (c1[0] - c0[0]) * m) * lr * f;
    out[3 * i + 1] = (c0[1] + (c1[1] - c0[1]) * m) * lg * f;
    out[3 * i + 2] = (c0[2] + (c1[2] - c0[2]) * m) * lb * f;
  }
}

/** Lake: the sun's glint, the pier, and the ferry that circles once a minute. */
function drawLake(ctx, L, sun, T, sec) {
  const o = L.panels[LAKE], g = 1 - 0.6 * Math.abs(sun.alt);
  const gx = o.x + sun.dir[0] * 16 * g, gy = o.y + sun.dir[1] * 16 * g;
  const gc = kit.scale(kit.mix([0.25, 0.3, 0.45], sun.light, sun.day), kit.lerp(0.25, 1, sun.day));
  for (let j = 0; j < 5; j++) {
    const tw = Math.max(0, Math.sin(T * (2.1 + j * 0.37) + j * 1.9));
    kit.splat(ctx, gx + 6 * (kit.noise2(T * 0.4, j * 3.1) - 0.5), gy + 6 * (kit.noise2(j * 5.7, T * 0.4) - 0.5), 3.2, gc, 0.35 * tw * tw);
  }
  for (const y of [-29, -33, -37]) kit.splat(ctx, o.x, o.y + y, 2.6, C.wood, 0.8);
  for (let j = 8; j >= 1; j--) { const [x, y] = hexAt(24, sec / 60 - j * 0.0055); kit.splat(ctx, o.x + x, o.y + y, 2.6, C.wake, 1 - j / 9); }
  const [bx, by] = hexAt(24, sec / 60);
  kit.splat(ctx, o.x + bx, o.y + by, 3.4, C.wood, 1.2);
  kit.splat(ctx, o.x + bx, o.y + by - 0.8, 2.6, C.sail, 0.6 + 0.2 * sun.day);
}
/** Mine: the lit entrance, and a cart lamp that trundles out to the spoil heap and back. */
function drawMine(ctx, L, T) {
  const o = L.panels[MINE], ex = o.x + MINE_AT[0], ey = o.y + MINE_AT[1];
  kit.splat(ctx, ex, ey, 4.4, C.lamp, 0.45 + 0.1 * Math.sin(T * 9) * Math.sin(T * 5.3));
  const c = (((T % 22) + 22) % 22) / 22;
  let u, a = 1;
  if (c < 0.3) u = kit.ease.inOut(c / 0.3); else if (c < 0.45) u = 1; else if (c < 0.75) u = 1 - kit.ease.inOut((c - 0.45) / 0.3); else { u = 0; a = 0; }
  a *= kit.smoothstep(0, 0.03, c) * (1 - kit.smoothstep(0.72, 0.75, c));
  const x = kit.lerp(ex - 3, o.x - 20, u), y = kit.lerp(ey, o.y + 20, u);
  kit.splat(ctx, x, y, 3, C.lamp, 0.7 * a);
  if (c > 0.3 && c < 0.45) kit.splat(ctx, o.x - 22, o.y + 18, 2.4, [0.5, 0.45, 0.2], 0.5 * Math.sin(Math.PI * (c - 0.3) / 0.15));
}

/** One hour tile: road sticks, settlements, the woodpile and a settler on his beat. */
function drawRoads(ctx, L, tile, was, is, ageH, sun, T) {
  const o = L.panels[tile], H = HOME[tile], segs = [], extra = [];
  const turning = was !== is && ageH < 3.2;
  const stick = (x, y, a, al, lift, still = false) => {
    const c = Math.cos(a) * 4, s = Math.sin(a) * 4;
    segs.push([o.x + x - c, o.y + y - s, o.x + x + c, o.y + y + s, al * (1 - (still ? 0.85 : 0.6) * lift)]);
    if (lift > 0.01 && !still) extra.push([o.x + x + 1.2, o.y + y + 1.6, al * Math.min(1, 2 * lift)]);
  };
  if (turning) {
    const pl = planFor('road', was, is, H);
    // the sticks that stay are lifted too (and set down last), so the old digit never stands half-built
    pl.stay.forEach((p, j) => { const h = 0.3 * kit.hash(j, tile); stick(p.x, p.y, p.a, 1, kit.smoothstep(0.1 + h, 0.4 + h, ageH) * (1 - kit.smoothstep(2.5 + h, 2.9 + h, ageH)), true); });
    for (const m of pl.moves) { const [x, y, a, al, lift] = poseOf(m, ageH); stick(x, y, a, al, m.q.home && ageH > m.delay + m.dur ? 0 : lift); }
  } else for (const p of roadOf(is)) stick(p.x, p.y, p.a, 1, 0);
  // the woodpile the spare sticks live in
  for (const dy of [-2.2, 2.2]) kit.splat(ctx, o.x + H[0], o.y + H[1] + dy, 2.8, C.wood, 1);
  kit.drawStrokes(ctx, segs, { width: 2.8, soft: 1.3, paint(l, d, sg) { kit.add(ctx, l.i, C.road, sg[4] * (1 - kit.smoothstep(0.3, 2.7, d))); } });
  for (const [x, y, a] of extra) kit.splat(ctx, x, y, 2.8, C.settler, 0.9 * a);
  // settlements: lamps at the road ends, brighter as the light goes
  const lamp = (0.5 + 0.5 * (1 - sun.day));
  const houses = (d, a) => housesOf(d).forEach(([x, y], k) => kit.splat(ctx, o.x + x, o.y + y, 3.7, C.house, a * lamp * (0.9 + 0.1 * Math.sin(T * 5 + k * 2 + tile))));
  if (turning) { houses(was, 1 - kit.smoothstep(0, 0.6, ageH)); houses(is, kit.smoothstep(2.6, 3.2, ageH)); } else houses(is, 1);
  // a settler walking the longest road, there and back
  const b = beatOf(is), ph = ((T * 5) / b.len + tile * 0.37) % 2, s = b.len * (0.5 - 0.5 * Math.cos(Math.PI * ph));
  const [wx, wy] = alongBeat(b, s), wa = ageH < 3.6 && was !== is ? kit.smoothstep(3.2, 3.6, ageH) : 1;
  kit.splat(ctx, o.x + wx, o.y + wy, 2.6, C.settler, 0.55 * wa);
}
/** One minute tile: the flock standing in the digit, the barn, and the dog at the turn. */
function drawFlock(ctx, L, tile, was, is, age, sun, T) {
  const o = L.panels[tile], H = HOME[tile], sd = Math.sign(H[0]), turning = was !== is && age < 3.0;
  const a = 0.8 + 0.2 * sun.day;
  kit.splat(ctx, o.x + H[0] + sd * 1.5, o.y + H[1], 4.2, C.barn, 1);
  kit.splat(ctx, o.x + H[0] - sd * 1.2, o.y + H[1], 2.2, C.house, 0.12 * (0.4 + (1 - sun.day)));
  const sheep = (x, y, j, al, r = 4) => {
    const jx = 0.55 * Math.sin(T * 0.9 + j * 2.3 + tile), jy = 0.45 * Math.sin(T * 0.67 + j * 1.7);
    kit.splat(ctx, o.x + x + jx, o.y + y + jy, r, C.sheep, a * al);
  };
  // the dog: lies by the barn; at a turn runs one lap round the digit and lies down again
  const dog = (u) => {
    const th = (sd > 0 ? 0 : Math.PI) + sd * kit.TAU * kit.ease.inOut(u);
    const dx = 25 * Math.cos(th), dy = 37 * Math.sin(th), tx = -25 * Math.sin(th) * sd, ty = 37 * Math.cos(th) * sd, tn = Math.hypot(tx, ty) || 1;
    const hx = u > 0 && u < 1 ? tx / tn : 0, hy = u > 0 && u < 1 ? ty / tn : -1;   // resting, head up
    const breathe = u <= 0 || u >= 1 ? 0.06 * Math.sin(T * 2.2) : 0;
    kit.splat(ctx, o.x + dx, o.y + dy, 3.2, C.dog, 0.85 + breathe);
    kit.splat(ctx, o.x + dx + 3 * hx, o.y + dy + 3 * hy, 2.2, C.dog, 0.7);
  };
  if (!turning) {
    // now and then one sheep wanders out of line to graze, and comes back
    const pts = sheepOf(is), slot = Math.floor(T / 7), u = (T / 7) % 1;
    const j0 = Math.floor(kit.hash(slot, tile, 1) * pts.length), an = kit.hash(slot, tile, 2) * kit.TAU;
    const off = 4.5 * Math.sin(Math.PI * u) ** 2 * kit.smoothstep(3.5, 4.5, age) * (1 - kit.smoothstep(55.5, 56.5, age));
    pts.forEach((p, j) => sheep(p.x + (j === j0 ? off * Math.cos(an) : 0), p.y + (j === j0 ? off * Math.sin(an) : 0), j, 1));
    dog(0);
    return;
  }
  const pl = planFor('sheep', was, is, H);
  // the sheep that stay put duck their heads while the flock runs: only the old or the new digit stands tall
  const duck = 1 - 0.75 * kit.smoothstep(0.15, 0.4, age) * (1 - kit.smoothstep(2.3, 2.8, age));
  pl.stay.forEach((p, j) => sheep(p.x, p.y, j, duck));
  pl.moves.forEach((m, j) => {
    const [x, y, , al, go] = poseOf(m, age, true);
    sheep(x, y - 1.2 * Math.abs(Math.sin(T * 14 + j)) * go, j + 50, al, 4 + 0.3 * go);
  });
  dog(kit.clamp(age / 2.9));
}

export default {
  name: 'Island',
  blurb: 'a board-game island: hours laid in road pieces, minutes stood in sheep; dice roll the hour',
  // opal at 3 mm: the lattice melts into painted cardboard tiles, yet every sheep,
  // stick and pip stays its own soft dot, and the seams still read as tile borders
  layouts: ['hex-flower'], look: { look: 'opal', gap: 2.0 }, fps: 60, brightness: 1, dither: true,
  frame(ctx) {
    const L = ctx.layout, P = prep(L), date = ctx.date, now = date.getTime() / 1000, T = now - EPOCH;
    const M = Math.floor(now / 60) * 60, age = now - M, sec = kit.secOf(date);
    const prev = new Date((M - 60) * 1000);
    const hh = pad(date.getHours()), mm = pad(date.getMinutes()), ph = pad(prev.getHours()), pm = pad(prev.getMinutes());
    const ageH = date.getMinutes() === 0 ? age : 99;
    const sun = sky(date), robber = robberAt(L, date, ageH);

    drawGround(ctx, P, sun, T, robber);
    drawLake(ctx, L, sun, T, sec);
    drawMine(ctx, L, T);
    drawRoads(ctx, L, HOUR_T, ph[0], hh[0], ageH, sun, T);
    drawRoads(ctx, L, HOUR_U, ph[1], hh[1], ageH, sun, T);
    drawFlock(ctx, L, MIN_T, pm[0], mm[0], age, sun, T);
    drawFlock(ctx, L, MIN_U, pm[1], mm[1], age, sun, T);
    drawRobber(ctx, robber, sun);

    // the hour's dice, with their shadows thrown away from the light
    const h12 = date.getHours() % 12 || 12;
    for (const d of diceOf(ageH, date.getDate() * 24 + date.getHours(), h12)) {
      const sx = d.x - sun.dir[0] * (2 + 0.5 * d.z), sy = d.y - sun.dir[1] * (2 + 0.5 * d.z), r = d.s * 1.3;
      for (const i of L.index.near(sx, sy, r)) {
        const l = ctx.leds[i], k = 1 - 0.75 * d.alpha * (1 - kit.smoothstep(0.6, 1, Math.hypot(l.x - sx, l.y - sy) / r));
        ctx.out[3 * i] *= k; ctx.out[3 * i + 1] *= k; ctx.out[3 * i + 2] *= k;
      }
      drawDie(ctx, d, sun);
    }

    const k = 1 - 0.6 * ctx.night, o = ctx.out;
    if (k < 1) for (let j = 0; j < o.length; j++) o[j] *= k;
  },
};
