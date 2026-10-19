// Piñata Party: a 64x128 tower of a party. The HOUR is a papier-mâché number
// piñata in fringed crepe stripes, swinging and twisting on its rope from a
// bunting-hung ceiling. The MINUTES are two stacks of wrapped candies, laid
// into numerals, and each stack is the step stool of a kid in a party hat.
// Every minute the kid on the units stack jumps and whacks the piñata: it
// swings, candy falls out and lands in the cells the new numeral needs,
// candies the stack no longer needs hop up and get eaten, the rest re-hop
// into place. On the hour both kids whack, the piñata BURSTS into
// papier-mâché chunks, candy and confetti, and the next hour's piñata is
// lowered on its rope and bounces.
//
// Everything is closed form in time: pendulum impulses from the whack
// times, ballistic candy arcs from per-minute plans, cached glyph SDFs.
import * as kit from '../js/kit.js';

const { clamp, lerp, smoothstep, hash, TAU } = kit;
const W = 64, H = 128;
const img = new Float32Array(W * H * 3);

// ------------------------------------------------------------ palette
const PINK = kit.hex('#ff2f7d'), ORANGE = kit.hex('#ff7417'), YELLOW = kit.hex('#ffcf26'), TEAL = kit.hex('#10d8c2');
const STRIPES = [PINK, ORANGE, YELLOW, TEAL];
const CANDY = [kit.hex('#ff6aa6'), kit.hex('#ffd640'), kit.hex('#3ff0d8'), kit.hex('#ffa14a')];
const SKIN = kit.hex('#f5b88a'), CHEEK = kit.hex('#ff6f86'), DARK = [0, 0, 0];
const SHIRT = [kit.hex('#3b78ff'), kit.hex('#a24cff')];
const PANTS = kit.scale(kit.hex('#4a5cc0'), 0.7);
const HAT = [[PINK, YELLOW], [TEAL, YELLOW]];
const WOOD = kit.hex('#c88a48'), TWINE = kit.scale(kit.hex('#d9b27a'), 0.55);
const WHITE = [1, 1, 1];

// ----------------------------------------------------------- painting
function px(x, y, r, g, b, a) {
  const k = 3 * (y * W + x);
  img[k] += (r - img[k]) * a; img[k + 1] += (g - img[k + 1]) * a; img[k + 2] += (b - img[k + 2]) * a;
}
function disc(cx, cy, r, c, a = 1) {
  const R = r + 0.5;
  const x0 = Math.max(0, Math.floor(cx - R)), x1 = Math.min(W - 1, Math.ceil(cx + R));
  const y0 = Math.max(0, Math.floor(cy - R)), y1 = Math.min(H - 1, Math.ceil(cy + R));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const dx = x - cx, dy = y - cy, cov = R - Math.sqrt(dx * dx + dy * dy);
    if (cov > 0) px(x, y, c[0], c[1], c[2], (cov > 1 ? 1 : cov) * a);
  }
}
function capsule(ax, ay, bx, by, r, c, a = 1) {
  const R = r + 0.5;
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - R)), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + R));
  const y0 = Math.max(0, Math.floor(Math.min(ay, by) - R)), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by) + R));
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-9;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    let t = ((x - ax) * dx + (y - ay) * dy) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = x - ax - t * dx, ey = y - ay - t * dy, cov = R - Math.sqrt(ex * ex + ey * ey);
    if (cov > 0) px(x, y, c[0], c[1], c[2], (cov > 1 ? 1 : cov) * a);
  }
}
/** Party hat: a cone from base (bx0..bx1 at by) to tip, striped across its axis. */
function hat(bx0, bx1, by, tx, ty, cA, cB, a = 1) {
  const P = [[bx0, by], [bx1, by], [tx, ty]];
  const x0 = Math.max(0, Math.floor(Math.min(bx0, tx) - 1)), x1 = Math.min(W - 1, Math.ceil(Math.max(bx1, tx) + 1));
  const y0 = Math.max(0, Math.floor(ty - 1)), y1 = Math.min(H - 1, Math.ceil(by + 1));
  // edges with inward normals (vertices are clockwise on screen: base-left, base-right, tip)
  const E = [];
  for (let k = 0; k < 3; k++) {
    const [ax, ay] = P[k], [bx, by2] = P[(k + 1) % 3], ex = bx - ax, ey = by2 - ay, L = Math.hypot(ex, ey);
    let nx = ey / L, ny = -ex / L;
    const [ox, oy] = P[(k + 2) % 3];
    if ((ox - ax) * nx + (oy - ay) * ny < 0) { nx = -nx; ny = -ny; }
    E.push([ax, ay, nx, ny]);
  }
  const hx = tx - (bx0 + bx1) / 2, hy = ty - by, HL = Math.hypot(hx, hy);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    let d = -1e9;
    for (const [ax, ay, nx, ny] of E) { const s = (ax - x) * nx + (ay - y) * ny; if (s > d) d = s; }
    const cov = 0.5 - d;
    if (cov <= 0) continue;
    const along = ((x - (bx0 + bx1) / 2) * hx + (y - by) * hy) / (HL * HL);
    const c = Math.floor(along * 3.2) & 1 ? cB : cA;
    px(x, y, c[0], c[1], c[2], (cov > 1 ? 1 : cov) * a);
  }
}
/** A wrapped candy: round body and two cellophane twists along `ang`. */
function candy(cx, cy, ang, c, a, glint) {
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const x0 = Math.max(0, Math.floor(cx - 3)), x1 = Math.min(W - 1, Math.ceil(cx + 3));
  const y0 = Math.max(0, Math.floor(cy - 3)), y1 = Math.min(H - 1, Math.ceil(cy + 3));
  const wr = (c[0] * 0.6 + 0.4) * 0.5, wg = (c[1] * 0.6 + 0.4) * 0.5, wb = (c[2] * 0.6 + 0.4) * 0.5;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const dx = x - cx, dy = y - cy, u = dx * ca + dy * sa, v = -dx * sa + dy * ca;
    const au = u < 0 ? -u : u, av = v < 0 ? -v : v;
    if (au > 1.4) {
      const e = 3.3 - au, s = 0.6 + (au - 1.6) * 0.8 - av;
      let cw = e < s ? e : s; cw = cw > 1 ? 1 : cw;
      if (cw > 0) px(x, y, wr, wg, wb, cw * a);
    }
    const er = Math.sqrt(u * u * 0.8 + v * v);
    let cb = 2.4 - er;
    if (cb <= 0) continue;
    cb = cb > 1 ? 1 : cb;
    const hu = dx + 0.7, hv = dy + 0.7, hl = Math.max(0, 1 - Math.sqrt(hu * hu + hv * hv)) * 0.55 + glint;
    px(x, y, c[0] + (1 - c[0]) * hl, c[1] + (1 - c[1]) * hl, c[2] + (1 - c[2]) * hl, cb * a);
  }
}

// --------------------------------------------- candy numerals (5 x 10 cells)
const CANDY_DIG = [
  ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  ['..#..', '.##..', '#.#..', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
  ['.###.', '#...#', '....#', '....#', '...#.', '..#..', '.#...', '#....', '#....', '#####'],
  ['.###.', '#...#', '....#', '....#', '..##.', '....#', '....#', '....#', '#...#', '.###.'],
  ['...#.', '..##.', '.#.#.', '.#.#.', '#..#.', '#..#.', '#####', '...#.', '...#.', '...#.'],
  ['#####', '#....', '#....', '####.', '....#', '....#', '....#', '....#', '#...#', '.###.'],
  ['.###.', '#...#', '#....', '#....', '####.', '#...#', '#...#', '#...#', '#...#', '.###.'],
  ['#####', '....#', '....#', '...#.', '...#.', '..#..', '..#..', '..#..', '..#..', '..#..'],
  ['.###.', '#...#', '#...#', '#...#', '.###.', '#...#', '#...#', '#...#', '#...#', '.###.'],
  ['.###.', '#...#', '#...#', '#...#', '.####', '....#', '....#', '....#', '#...#', '.###.'],
];
const CELLS = CANDY_DIG.map((rows) => {
  const out = [];
  rows.forEach((row, r) => { for (let c = 0; c < 5; c++) if (row[c] === '#') out.push(c + 5 * r); });
  return out;
});
const SLOT_X = [4, 35], TOP_Y = 89;                    // candy stacks: slot 0 tens, slot 1 units
const cellX = (s, cell) => SLOT_X[s] + 2 + 5 * (cell % 5) + (hash(cell, s, 23) - 0.5) * 0.7;
const cellY = (cell) => TOP_Y + 1 + 4 * Math.floor(cell / 5);
const rot = (s, cell) => (hash(cell, s, 17) - 0.5) * 1.1 + (hash(cell, s, 19) < 0.25 ? Math.PI / 2 : 0);
const cellCol = (s, cell) => CANDY[Math.floor(hash(cell, s, 91) * 4)];
/** x of the middle of a numeral's top row: where its kid stands. */
const topX = (s, dg) => {
  const top = CELLS[dg].filter((c) => c < 5);
  return SLOT_X[s] + 2 + 5 * (top.reduce((a, c) => a + c, 0) / top.length);
};

const plans = new Map();
/** How the candies of numeral a become numeral b: stay, move, get eaten, drop in. */
function plan(a, b) {
  const key = a * 10 + b;
  if (plans.has(key)) return plans.get(key);
  const A = new Set(CELLS[a]), B = new Set(CELLS[b]);
  const oldOnly = CELLS[a].filter((c) => !B.has(c)), newOnly = CELLS[b].filter((c) => !A.has(c));
  const pairs = [];
  for (const o of oldOnly) for (const n of newOnly) {
    const dx = (o % 5 - n % 5) * 5, dy = (Math.floor(o / 5) - Math.floor(n / 5)) * 4;
    pairs.push([Math.hypot(dx, dy) + hash(o, n) * 0.01, o, n]);
  }
  pairs.sort((p, q) => p[0] - q[0]);
  const usedO = new Set(), usedN = new Set(), move = [];
  for (const [d, o, n] of pairs) {
    if (usedO.has(o) || usedN.has(n)) continue;
    usedO.add(o); usedN.add(n); move.push({ o, n, d });
  }
  move.forEach((m, i) => {
    m.st = 0.05 + 0.4 * (move.length > 1 ? i / (move.length - 1) : 0) + 0.06 * hash(m.o, 3);
    m.du = clamp(0.75 + 0.02 * m.d, 0.75, 1.1);
    m.arc = 14 + 0.35 * m.d + 3 * hash(m.o, 2);
    m.spin = (hash(m.n, 4) < 0.5 ? -1 : 1) * (2 + 3 * hash(m.n, 5));
  });
  const eat = oldOnly.filter((o) => !usedO.has(o)).map((o, i) => ({ o, st: 0.1 + 0.14 * i, du: 0.42 }));
  const dl = newOnly.filter((n) => !usedN.has(n));
  const drop = dl.map((n, i) => ({
    n, st: 0.12 + 0.75 * (dl.length > 1 ? i / (dl.length - 1) : 0.3), du: 0.85 + 0.15 * hash(n, 6),
    ex: (hash(n, 7) - 0.5) * 14, spin: (hash(n, 8) < 0.5 ? -1 : 1) * (3 + 3 * hash(n, 9)),
  }));
  const p = { stay: CELLS[a].filter((c) => B.has(c)), move, eat, drop, end: 2.3 };
  plans.set(key, p);
  return p;
}

// ------------------------------------------------- piñata numerals (SDF)
// Centre lines in a 15 x 23 box, stroked with radius SR: fat papier-mâché.
const SR = 3.3;
function arc(cx, cy, rx, ry, a0, a1, n) {
  const pts = [];
  for (let k = 0; k <= n; k++) { const a = (a0 + (a1 - a0) * k / n) * Math.PI / 180; pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]); }
  return pts;
}
const six = [arc(7.5, 15.5, 7.5, 7.5, 0, 360, 40), arc(15, 15.5, 15, 15.5, 180, 250, 14)];
const GLYPHS = [
  [arc(7.5, 11.5, 7.5, 11.5, 0, 360, 48)],
  [[[2.5, 5.5], [8.5, 0], [8.5, 23]], [[3.5, 23], [13.5, 23]]],
  [[...arc(7.5, 7.5, 7.5, 7.5, 200, 400, 24), [0.5, 23], [15, 23]]],
  [arc(7.5, 6, 7, 6, 205, 450, 22), [[4, 12], [7.5, 12]], arc(7.5, 16.75, 7.5, 6.25, 270, 515, 24)],
  [[[11, 23], [11, 0], [0, 16], [15, 16]]],
  [[[14.5, 0], [1.5, 0], [1, 10.5]], arc(7.2, 15.5, 7.8, 7.5, 218, 510, 28)],
  six,
  [[[0, 0], [15, 0], [5, 23]]],
  [arc(7.5, 5.5, 6, 5.5, 0, 360, 32), arc(7.5, 16.25, 7.5, 6.75, 0, 360, 40)],
  six.map((path) => path.map(([x, y]) => [15 - x, 23 - y])),
];
// The SDF grid, in piñata-local px: x across, y down from the rope's knot.
const GX0 = -26, GY0 = -1, GS = 2, GNX = 105, GNY = 96;
const GLY_TOP = 5 + SR;                 // stroke-centre y of a glyph's top
const glyphCache = new Map();
function glyph(str) {
  if (glyphCache.has(str)) return glyphCache.get(str);
  const segs = [];
  const two = str.length === 2, centres = two ? [-13.2, 13.2] : [0], sr = two ? 2.75 : 3.4;
  [...str].forEach((ch, gi) => {
    const sc = two ? 1.1 : 1.3, ox = centres[gi] - 7.5 * sc, oy = GLY_TOP;
    for (const path of GLYPHS[+ch]) for (let k = 0; k + 1 < path.length; k++) {
      segs.push([ox + path[k][0] * sc, oy + path[k][1] * sc, ox + path[k + 1][0] * sc, oy + path[k + 1][1] * sc]);
    }
  });
  const d = new Float32Array(GNX * GNY), id = new Uint8Array(GNX * GNY);
  // chunks it breaks into when it bursts
  const span = str.length === 2 ? 23 : 14, seeds = [];
  const NS = str.length === 2 ? 11 : 6;
  for (let k = 0; k < NS; k++) seeds.push([(hash(k, 11, +str) * 2 - 1) * span, GLY_TOP - SR + hash(k, 12, +str) * (str.length === 2 ? 30 : 37)]);
  const rad = new Float32Array(NS);
  // distance to the centre lines, only near each segment (beyond the cap it is "far")
  const CAP = 9, dm = new Float32Array(GNX * GNY).fill(CAP + sr);
  for (const [ax, ay, bx, by] of segs) {
    const R = sr + 6;
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - R - GX0) * GS)), i1 = Math.min(GNX - 1, Math.ceil((Math.max(ax, bx) + R - GX0) * GS));
    const j0 = Math.max(0, Math.floor((Math.min(ay, by) - R - GY0) * GS)), j1 = Math.min(GNY - 1, Math.ceil((Math.max(ay, by) + R - GY0) * GS));
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-9;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = GX0 + i / GS, y = GY0 + j / GS;
      let t = ((x - ax) * dx + (y - ay) * dy) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = x - ax - t * dx, ey = y - ay - t * dy, q = Math.sqrt(ex * ex + ey * ey);
      if (q < dm[j * GNX + i]) dm[j * GNX + i] = q;
    }
  }
  for (let j = 0; j < GNY; j++) for (let i = 0; i < GNX; i++) {
    const x = GX0 + i / GS, y = GY0 + j / GS, m = dm[j * GNX + i];
    d[j * GNX + i] = m - sr;
    if (m - sr >= 1.5) continue;
    let best = 0, bd = 1e9;
    for (let k = 0; k < NS; k++) { const ux = x - seeds[k][0], uy = y - seeds[k][1], q = ux * ux + uy * uy; if (q < bd) { bd = q; best = k; } }
    id[j * GNX + i] = best;
    bd = Math.sqrt(bd);
    if (m - sr < 1 && bd > rad[best]) rad[best] = bd;
  }
  const g = { d, id, seeds, rad, str };
  glyphCache.set(str, g);
  return g;
}
function sdf(g, x, y) {
  const fx = (x - GX0) * GS, fy = (y - GY0) * GS;
  if (fx < 0 || fy < 0 || fx >= GNX - 1 || fy >= GNY - 1) return 9;
  const i = fx | 0, j = fy | 0, u = fx - i, v = fy - j, k = j * GNX + i, D = g.d;
  return (D[k] * (1 - u) + D[k + 1] * u) * (1 - v) + (D[k + GNX] * (1 - u) + D[k + GNX + 1] * u) * v;
}
function chunkId(g, x, y) {
  const i = Math.round((x - GX0) * GS), j = Math.round((y - GY0) * GS);
  if (i < 0 || j < 0 || i >= GNX || j >= GNY) return 255;
  return g.id[j * GNX + i];
}

// Crepe stripes: bands 5 px tall whose lower edges are ragged fringe.
let bandR = 0, bandG = 0, bandB = 0;
function band(lx, ly, t, depth) {
  const col = Math.floor(lx + 64);
  const jag = 1.5 * hash(col, 77) + 0.45 * Math.sin(t * 7.3 + col * 1.9);
  const v = (ly - GLY_TOP + SR - jag) / 5, b = Math.floor(v), f = v - b;
  const c = STRIPES[((b % 4) + 4) % 4];
  let sh = (0.5 + 0.5 * Math.sqrt(f)) * (col & 1 ? 0.86 : 1);          // layered fringe, strands
  sh *= 1 - 0.22 * clamp(ly / 38);                                      // lit from above
  sh *= 0.68 + 0.32 * clamp(depth / SR);                                // rounded body
  bandR = c[0] * sh; bandG = c[1] * sh; bandB = c[2] * sh;
}

const PIV_X = 32, PIV_Y = 1, ROPE = 14;
/** The piñata on its rope: th swing (+ = bottom right), ph twist, rope length. */
function drawPinata(g, th, ph, rope, t, alpha) {
  const c = Math.cos(th), s = Math.sin(th), cp = Math.max(0.3, Math.cos(ph)), sp = Math.sin(ph);
  const toX = (lx, ly) => PIV_X + lx * cp * c + (ly + rope) * s;
  const toY = (lx, ly) => PIV_Y - lx * cp * s + (ly + rope) * c;
  // rope and bridle
  const kx = toX(0, 0), ky = toY(0, 0);
  capsule(PIV_X, PIV_Y, kx, ky, 0.5, TWINE, alpha);
  if (g.str.length === 2) {
    capsule(kx, ky, toX(-11, GLY_TOP - SR + 0.5), toY(-11, GLY_TOP - SR + 0.5), 0.4, TWINE, alpha);
    capsule(kx, ky, toX(11, GLY_TOP - SR + 0.5), toY(11, GLY_TOP - SR + 0.5), 0.4, TWINE, alpha);
  }
  // bounding box of the body
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const [lx, ly] of [[-26, 0], [26, 0], [-26, 46], [26, 46]]) {
    const X = toX(lx, ly), Y = toY(lx, ly);
    x0 = Math.min(x0, X); x1 = Math.max(x1, X); y0 = Math.min(y0, Y); y1 = Math.max(y1, Y);
  }
  x0 = Math.max(0, Math.floor(x0)); x1 = Math.min(W - 1, Math.ceil(x1));
  y0 = Math.max(0, Math.floor(y0)); y1 = Math.min(H - 1, Math.ceil(y1));
  const ex = 2.4 * sp, ey = 1.3;                    // the papier-mâché's thickness shows below and on the turning side
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const dx = x - PIV_X, dy = y - PIV_Y;
    const lx = (dx * c - dy * s) / cp, ly = dx * s + dy * c - rope;
    const d = sdf(g, lx, ly);
    if (d > 4) continue;
    const col = Math.floor(lx + 64);
    const fr = 0.7 + 1.5 * hash(col, 5) * (0.75 + 0.25 * Math.sin(t * 8.5 + col * 2.1));
    const dF = sdf(g, lx, ly - fr);
    const dE = Math.min(sdf(g, lx - ex * 0.5, ly - ey * 0.5), sdf(g, lx - ex, ly - ey));
    const cE = clamp(0.5 - dE), cFr = clamp(0.5 - dF) * 0.85, cF = clamp(0.5 - d);
    if (cE > 0) { band(lx - ex, ly - ey, t, 0); px(x, y, bandR * 0.32, bandG * 0.32, bandB * 0.32, cE * alpha); }
    if (cFr > cF) { band(lx, ly - fr, t, 0.5); px(x, y, bandR * 0.8, bandG * 0.8, bandB * 0.8, cFr * alpha); }
    if (cF > 0) { band(lx, ly, t, -d); px(x, y, bandR, bandG, bandB, cF * alpha); }
  }
  return { toX, toY };
}

// ------------------------------------------------------------- timing
const pad = (n) => String(n).padStart(2, '0');
const hourStr = (h) => String(h);
/** Whack times around a minute boundary B whose new minute is mB. */
function hits(B, mB) {
  const out = [{ te: B - 0.15, kid: 1, dir: -1, A: mB === 0 ? 0.27 : 0.2 }];
  if (mB % 10 === 0) out.push({ te: B - 0.75, kid: 0, dir: 1, A: mB === 0 ? 0.24 : 0.16 });
  return out;
}
/** Swing and twist of the piñata born at `birth`, at time t. */
function pose(t, birth, M, minM) {
  let th = 0.05 * Math.sin(TAU * t / 2.7) + 0.018 * Math.sin(TAU * t / 4.3 + 1.3);
  let ph = 0.16 * Math.sin(TAU * t / 6.1 + 0.4) + 0.06 * Math.sin(TAU * t / 3.3);
  for (let k = -1; k <= 1; k++) {
    const B = M + 60 * k, mB = (minM + k + 60) % 60;
    for (const h of hits(B, mB)) {
      if (h.te < birth || h.te > t) continue;
      const u = t - h.te;
      th += h.dir * h.A * Math.exp(-u / 2.4) * Math.sin(TAU * u / 1.7);
      ph += h.dir * 0.7 * Math.exp(-u / 1.7) * Math.sin(TAU * u / 1.3);
    }
  }
  // a new piñata swings in as it is lowered
  const a = t - birth - 0.9;
  if (a > 0 && a < 12) { th += 0.1 * Math.exp(-a / 2) * Math.sin(TAU * a / 2.1); ph += 0.35 * Math.exp(-a / 2) * Math.sin(TAU * a / 1.6); }
  return [th, ph];
}
/** Extra rope while a new piñata is lowered (negative = still above). */
function dropOf(ageH) {
  if (ageH >= 3) return 0;
  const k = clamp((ageH - 0.2) / 1.1);
  return -52 * (1 - kit.ease.outBack(k));
}

// --------------------------------------------------------------- kids
const KID = [{ m: 1 }, { m: -1 }];                 // m: the direction of the piñata (inner side)
const STICK = { rest: -105, wind: -22, strike: -128, follow: -158 };
function stickAngle(u) {                            // u: time since the stick touches the piñata
  const { rest, wind, strike, follow } = STICK;
  let a;
  if (u < -0.8 || u > 1.0) a = rest;
  else if (u < -0.28) a = lerp(rest, wind, kit.ease.inOut((u + 0.8) / 0.52));
  else if (u < 0) a = lerp(wind, strike, kit.ease.in((u + 0.28) / 0.28));
  else if (u < 0.15) a = lerp(strike, follow, kit.ease.out(u / 0.15));
  else a = lerp(follow, rest, kit.ease.inOut((u - 0.15) / 0.85));
  return a * Math.PI / 180;
}

function drawKid(K, now) {
  const { x, y, m } = K;
  const hx = x, hy = y - 14.8;
  // legs
  const kick = K.air * 1.2;
  capsule(x - 1.6, y - 3.8, x - 1.6 - kick * 0.5, y - 0.6, 1.0, PANTS);
  capsule(x + 1.6, y - 3.8, x + 1.6 + kick * 0.5, y - 0.6, 1.0, PANTS);
  // free arm (behind)
  const fsx = x - m * 2.6, fsy = y - 9.4;
  const wave = Math.sin(now * 15) * 1.3;
  const fhx = lerp(x - m * 4.3, x - m * 5.2 + wave * 0.4, K.cheer), fhy = lerp(y - 5.8 + 0.4 * Math.sin(now * 2.1 + m), y - 15.5 + wave, K.cheer);
  capsule(fsx, fsy, fhx, fhy, 0.85, SKIN);
  // shirt
  capsule(x, y - 9.2, x, y - 5.2, 3.0, K.shirt);
  // head
  disc(hx, hy, 4.7, SKIN);
  disc(hx - 3.0, hy + 1.4, 0.9, CHEEK, 0.55);
  disc(hx + 3.0, hy + 1.4, 0.9, CHEEK, 0.55);
  const lkx = K.lookX * 0.55, lky = K.lookY * 0.55;
  for (const e of [-1, 1]) {
    const exx = hx + e * 1.9, eyy = hy - 0.4;
    if (K.blink) capsule(exx - 0.8, eyy + 0.2, exx + 0.8, eyy + 0.2, 0.35, DARK);
    else { disc(exx, eyy, 1.2, WHITE, 0.95); disc(exx + lkx, eyy + lky, 0.62, DARK); }
  }
  if (K.mouth > 0.05) disc(hx + lkx * 0.4, hy + 2.5, 0.5 + 1.0 * K.mouth, DARK);
  else capsule(hx - 1.2, hy + 2.3, hx + 1.2, hy + 2.3, 0.42, DARK, 0.85);
  // hat
  hat(hx - 3.7, hx + 3.7, hy - 3.2, hx + K.tilt, hy - 12.5, K.hat[0], K.hat[1]);
  disc(hx + K.tilt, hy - 12.8, 1.25, WHITE, 0.9);
  // stick and the arm that holds it
  const ssx = x + m * 2.6, ssy = y - 9.4;
  const hdx = x + m * 3.6, hdy = y - 8.8 - 6 * K.raise;
  const a = K.stick, dxs = -m * Math.cos(a), dys = Math.sin(a);
  capsule(hdx - dxs * 2.5, hdy - dys * 2.5, hdx + dxs * 17, hdy + dys * 17, 0.6, WOOD);
  capsule(ssx, ssy, hdx, hdy, 0.85, SKIN);
  K.tipX = hdx + dxs * 17; K.tipY = hdy + dys * 17;
}

// ---------------------------------------------------------- the frame
const arcPos = (x0, y0, x1, y1, s, h) => [x0 + (x1 - x0) * s, y0 + (y1 - y0) * s - h * 4 * s * (1 - s)];

export default {
  name: 'Piñata Party',
  blurb: 'the hour is a fringed number piñata; kids stand on candy-stack minutes, whack it every minute and eat the leftovers',
  layouts: ['hub-tall'], look: 'smoke', fps: 60, brightness: 0.42, dither: true,
  frame(ctx) {
    img.fill(0);
    const date = ctx.date, now = date.getTime() / 1000;
    const sec = date.getSeconds() + date.getMilliseconds() / 1000;
    const M = now - sec, tau = sec;
    const minN = date.getMinutes(), hN = date.getHours();
    const prevD = new Date((M - 60) * 1000);
    const minP = prevD.getMinutes(), hP = prevD.getHours();
    const Hb = M - minN * 60, ageH = now - Hb;
    const digN = [Math.floor(minN / 10), minN % 10], digP = [Math.floor(minP / 10), minP % 10];
    const inTurn = tau < 2.4;

    // ---- bunting across the ceiling
    for (const side of [0, 1]) {
      const xa = side ? 32 : -3, xb = side ? 67 : 32;
      const sag = 6.5 + 0.6 * Math.sin(now * 1.3 + side * 2);
      const yAt = (x) => 0.5 + sag * Math.sin(Math.PI * (x - xa) / (xb - xa));
      for (let x = Math.max(0, Math.ceil(xa)); x <= Math.min(W - 1, Math.floor(xb)); x++) {
        const yy = yAt(x), j = Math.floor(yy), f = yy - j;
        if (j >= 0 && j < H) px(x, j, TWINE[0] * 0.4, TWINE[1] * 0.4, TWINE[2] * 0.4, 1 - f);
        if (j + 1 >= 0 && j + 1 < H) px(x, j + 1, TWINE[0] * 0.4, TWINE[1] * 0.4, TWINE[2] * 0.4, f);
      }
      for (let k = 0; k < 5; k++) {
        const cx = xa + (xb - xa) * (k + 0.5) / 5, sw = 0.8 * Math.sin(now * 2.2 + k * 1.7 + side);
        const c = kit.scale(STRIPES[(k + side * 2) % 4], 0.3);
        hat(cx - 2.4, cx + 2.4, yAt(cx) + 0.3, cx + sw, yAt(cx) + 5.8, c, kit.scale(c, 0.7));
      }
    }
    // ---- a few flecks of confetti always drifting down
    for (let k = 0; k < 7; k++) {
      const P = 11 + 5 * hash(k, 21), ph = (now / P + hash(k, 22)) % 1;
      const fx = 3 + 58 * hash(k, 23) + 2.5 * Math.sin(now * 1.4 + k * 2), fy = -2 + 132 * ph;
      const tw = 0.35 + 0.65 * Math.abs(Math.sin(now * 3 + k));
      disc(fx, fy, 0.25, kit.scale(STRIPES[k % 4], 0.22 * tw));
    }

    // ---- the piñata(s)
    const show = ageH < 3;
    let pin = null;
    if (!(show && ageH < 0.2)) {
      const [th, ph] = pose(now, Hb, M, minN);
      pin = drawPinata(glyph(hourStr(hN)), th, ph, ROPE + dropOf(ageH), now, 1);
    }
    // the burst: last hour's piñata in flying chunks
    let burst = null;
    if (show) {
      const g = glyph(hourStr(hP === hN ? (hN + 23) % 24 : hP));
      const [thb] = pose(Hb, Hb - 3600, Hb, 0);
      const cb = Math.cos(thb), sb = Math.sin(thb);
      const toX = (lx, ly) => PIV_X + lx * cb + (ly + ROPE) * sb, toY = (lx, ly) => PIV_Y - lx * sb + (ly + ROPE) * cb;
      const pcx = toX(0, 20), pcy = toY(0, 20);
      burst = { x: pcx, y: pcy };
      const s = ageH;
      if (s < 1.6) {
        capsule(PIV_X, PIV_Y, lerp(toX(0, 0), PIV_X, kit.ease.out(clamp(s / 0.5))), lerp(toY(0, 0), PIV_Y + 3, kit.ease.out(clamp(s / 0.5))), 0.5, TWINE, 1 - clamp(s / 0.6));
        const fade = 1 - smoothstep(0.9, 1.5, s);
        g.seeds.forEach(([sx, sy], k) => {
          const p0x = toX(sx, sy), p0y = toY(sx, sy);
          let vx = p0x - pcx, vy = p0y - pcy; const L = Math.hypot(vx, vy) || 1;
          const sp = 34 + 34 * hash(k, 31);
          vx = vx / L * sp; vy = vy / L * sp - 38;
          const Px = p0x + vx * s, Py = p0y + vy * s + 85 * s * s;
          const psi = thb + (hash(k, 32) - 0.5) * 13 * s, cps = Math.cos(psi), sps = Math.sin(psi);
          const R = g.rad[k] + 1.5;
          const bx0 = Math.max(0, Math.floor(Px - R)), bx1 = Math.min(W - 1, Math.ceil(Px + R));
          const by0 = Math.max(0, Math.floor(Py - R)), by1 = Math.min(H - 1, Math.ceil(Py + R));
          for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) {
            const qx = x - Px, qy = y - Py;
            const lx = sx + qx * cps - qy * sps, ly = sy + qx * sps + qy * cps;
            if (chunkId(g, lx, ly) !== k) continue;
            const d = sdf(g, lx, ly), cov = clamp(0.5 - d);
            if (cov <= 0) continue;
            band(lx, ly, Hb, -d);
            px(x, y, bandR, bandG, bandB, cov * fade);
          }
        });
      }
    }

    // ---- kids: where they are and what they do
    const B1 = M + 60, minNext = (minN + 1) % 60;
    const ev = [...hits(M, minN), ...hits(B1, minNext)];
    const kids = [];
    for (let k = 0; k < 2; k++) {
      const changed = digP[k] !== digN[k];
      let u = 99;
      for (const h of ev) if (h.kid === k && Math.abs(now - h.te) < Math.abs(u)) u = now - h.te;
      const jump = Math.abs(u) < 0.45 ? 11 * (1 - (u / 0.45) ** 2) : 0;
      let hop = 0;
      if (changed && tau > 0.27 && tau < 2.1) hop = 4.5 * Math.abs(Math.sin(Math.PI * (tau - 0.27) / 0.61)) * (1 - smoothstep(1.6, 2.1, tau));
      // an idle hop now and then
      const win = Math.floor(now / 6), t0 = win * 6 + 0.5 + 4 * hash(k, win, 41), iu = now - t0;
      if (Math.abs(u) > 1.4 && !(inTurn && changed) && iu > 0 && iu < 0.44) hop += 3 * Math.sin(Math.PI * iu / 0.44);
      const xOld = topX(k, digP[k]), xNew = topX(k, digN[k]);
      const x = changed ? lerp(xOld, xNew, smoothstep(0.3, 1.5, tau)) : xNew;
      const y = TOP_Y - 2.4 - jump - hop + 0.3 * Math.sin(now * 2.4 + k * 2);
      const other = ev.some((h) => h.kid !== k && Math.abs(now - h.te) < 0.9);
      const cheer = Math.max(changed && tau < 2.2 ? smoothstep(0.2, 0.5, tau) * (1 - smoothstep(1.8, 2.2, tau)) : 0, other ? 1 - smoothstep(0.5, 0.9, Math.abs(u < 99 ? 0 : 1)) : 0,
        show ? 1 - smoothstep(2.4, 3, ageH) : 0);
      const lookTo = pin ? [32 - x, 36 - (y - 15)] : [burst.x - x, burst.y - (y - 15)];
      const LL = Math.hypot(lookTo[0], lookTo[1]) || 1;
      const bl = (now + 1.7 * k) % 4.1;
      kids.push({
        k, m: KID[k].m, x, y, shirt: SHIRT[k], hat: HAT[k], air: (jump + hop) / 9,
        stick: stickAngle(u), raise: Math.abs(u) < 0.6 ? smoothstep(-0.45, -0.1, u) * (1 - smoothstep(0.2, 0.6, u)) : 0,
        cheer: clamp(cheer), lookX: lookTo[0] / LL, lookY: lookTo[1] / LL, blink: bl < 0.13, mouth: 0,
        tilt: 0.8 * Math.sin(now * 1.9 + k) - 1.6 * (jump + hop) / 9 * KID[k].m, tipX: 0, tipY: 0,
      });
    }

    // ---- the candy stacks
    const glintPos = ((now % 7) / 7) * 190 - 30;
    const flying = [];
    for (let s = 0; s < 2; s++) {
      const K = kids[s];
      const mouthX = K.x + K.lookX * 0.2, mouthY = K.y - 14.8 + 2.5;
      const draw = (cell, x, y, ang, col, a) => candy(x, y, ang + rot(s, cell), col, a, 0.4 * Math.exp(-(((x + 0.6 * y - glintPos) / 3) ** 2)));
      if (digP[s] === digN[s] || tau >= 2.3) {
        for (const cell of CELLS[digN[s]]) draw(cell, cellX(s, cell), cellY(cell), 0, cellCol(s, cell), 1);
        continue;
      }
      const P = plan(digP[s], digN[s]);
      for (const cell of P.stay) {
        // stay-at-home candies jiggle a little as the stack is rebuilt
        const r = Math.floor(cell / 5), j = 0.35 * Math.sin(tau * 18 + r) * (1 - smoothstep(0.3, 2.0, tau)) * smoothstep(0, 0.15, tau);
        draw(cell, cellX(s, cell) + j, cellY(cell), 0, cellCol(s, cell), 1);
      }
      for (const mv of P.move) {
        const q = (tau - mv.st) / mv.du;
        const x0 = cellX(s, mv.o), y0 = cellY(mv.o), x1 = cellX(s, mv.n), y1 = cellY(mv.n);
        const col = kit.mix(cellCol(s, mv.o), cellCol(s, mv.n), smoothstep(0.2, 0.8, q));
        if (q <= 0) draw(mv.o, x0, y0, 0, col, 1);
        else if (q >= 1) { const b = clamp((q - 1) * mv.du / 0.3); draw(mv.n, x1, y1 - 1.2 * Math.sin(Math.PI * b) * (1 - b), 0, col, 1); }
        else { const [x, y] = arcPos(x0, y0, x1, y1, q, mv.arc); flying.push([x, y, rot(s, mv.n) + mv.spin * (1 - q) * 2, col, 1]); }
      }
      for (const e of P.eat) {
        const q = (tau - e.st) / e.du;
        const x0 = cellX(s, e.o), y0 = cellY(e.o);
        if (q <= 0) draw(e.o, x0, y0, 0, cellCol(s, e.o), 1);
        else if (q < 1) {
          const [x, y] = arcPos(x0, y0, mouthX, mouthY, kit.ease.inOut(q), 7);
          flying.push([x, y, rot(s, e.o) + q * 9, cellCol(s, e.o), 1 - smoothstep(0.85, 1, q)]);
        }
        K.mouth = Math.max(K.mouth, smoothstep(0.45, 0.8, q) * (1 - smoothstep(1.0, 1.35, q)));
      }
      for (const dr of P.drop) {
        const q = (tau - dr.st) / dr.du;
        if (q <= 0) continue;
        const x1 = cellX(s, dr.n), y1 = cellY(dr.n);
        let x0, y0;
        if (show && burst) { x0 = burst.x + dr.ex; y0 = burst.y; }
        else {
          const [th, ph] = pose(M + dr.st, Hb, M, minN);
          const cth = Math.cos(th), sth = Math.sin(th), lx = dr.ex + (s ? 8 : -8) * (glyph(hourStr(hN)).str.length === 2 ? 1 : 0.4);
          x0 = PIV_X + lx * Math.cos(ph) * cth + (26 + ROPE) * sth; y0 = PIV_Y - lx * sth + (26 + ROPE) * cth;
        }
        if (q >= 1) { const b = clamp((q - 1) * dr.du / 0.3); draw(dr.n, x1, y1 - 1.5 * Math.sin(Math.PI * b) * (1 - b), 0, cellCol(s, dr.n), 1); }
        else { const [x, y] = arcPos(x0, y0, x1, y1, q, 5); flying.push([x, y, rot(s, dr.n) + dr.spin * (1 - q) * 2.5, cellCol(s, dr.n), 1]); }
      }
    }

    for (const K of kids) drawKid(K, now);
    for (const f of flying) candy(f[0], f[1], f[2], f[3], f[4], 0);

    // ---- whack! a star where the stick meets the piñata
    for (const h of ev) {
      const u = now - h.te;
      if (u < 0 || u > 0.3) continue;
      const K = kids[h.kid], k = u / 0.3, r = 2 + 5 * kit.ease.out(k), a = 1 - k;
      const sx = K.tipX, sy = K.tipY;
      for (let i = 0; i < 4; i++) {
        const an = i * Math.PI / 4 + 0.4;
        capsule(sx - Math.cos(an) * r, sy - Math.sin(an) * r, sx + Math.cos(an) * r, sy + Math.sin(an) * r, i & 1 ? 0.3 : 0.5, [1, 0.9, 0.55], a);
      }
      disc(sx, sy, 1.4 * (1 - k), WHITE, a);
    }

    // ---- the hour's party: flash, candy shower, confetti
    if (show && burst) {
      const s = ageH;
      if (s < 0.35) disc(burst.x, burst.y, 4 + 30 * kit.ease.out(s / 0.35), [1, 0.85, 0.6], 0.6 * (1 - s / 0.35));
      for (let k = 0; k < 30; k++) {
        const an = -Math.PI / 2 + (hash(k, 51) - 0.5) * 3.4, sp = 45 + 55 * hash(k, 52);
        const x = burst.x + Math.cos(an) * sp * s, y = burst.y + Math.sin(an) * sp * s + 95 * s * s;
        if (y > H + 4 || x < -4 || x > W + 4) continue;
        candy(x, y, (hash(k, 53) - 0.5) * 16 * s, CANDY[k % 4], 1, 0);
      }
      for (let k = 0; k < 56; k++) {
        const an = hash(k, 61) * TAU, sp = 40 + 60 * hash(k, 62), kd = 2.6;
        const e = (1 - Math.exp(-kd * s)) / kd;
        const x = burst.x + Math.cos(an) * sp * e + 2 * Math.sin(s * 3 + k);
        const y = burst.y + Math.sin(an) * sp * e + 10 * s;
        const tw = 0.3 + 0.7 * Math.abs(Math.sin(s * (4 + 3 * hash(k, 63)) + k));
        disc(x, y, 0.35, STRIPES[k % 4], tw * (1 - smoothstep(2.0, 3.0, s)));
      }
    }

    kit.blitGrid(ctx, img, 1 - 0.7 * ctx.night);
  },
};
