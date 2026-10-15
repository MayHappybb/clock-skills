// Lemmings — a level, not a clock face.
//
// The minutes are two brick walls in running bond (stretchers and headers,
// diagonals stepped like a builder's stair); the hour is two lumps of rock
// terrain on a floating ledge. Lemmings drop out of the hatch every eight
// seconds onto the minutes and walk left over the numerals' tops: stepping
// down small ledges, falling off big ones (umbrella for a long drop),
// climbing any wall in the way, and leave by the torch-lit exit. Hod stands
// by the pallet juggling a brick once a second; Dig taps his foot on the
// pallet; Mason patrols the top of the tens wall, tapping it with his hammer.
//
// The minute: Dig hops onto the old units wall and digs it out top down,
// standing on each brick he lifts; every brick he lifts is thrown, spinning,
// to the place the new numeral needs one, where Mason lays it, bottom up.
// Spares go to Hod and missing bricks come from him. When the tens changes a
// second crew is released from the hatch for it, and walks home after. Both
// walls change together, so a new tens never stands beside an old unit.
//
// The hour: two bombers glide from the hatch onto the rock, sparking faster;
// "Oh no!"; at :00 the hour goes up in a flash and a fountain of rubble. A
// new slab drops onto the ledge with three diggers riding it, and they dig
// the new hour out of it column by column, then walk off the end of the
// ledge under umbrellas and into the exit.
//
// Every frame comes from the clock: walker routes and turn plans are built
// from the digits (and cached), and every position is a closed-form lookup
// into them. Burn-in: the level walks kit.orbit; 23:00-07:00 it dims.
import { sprite, ease, progress, noise, smoothNoise, orbit, clamp, lerp, segDist, previousMinute, clockFields, dither, ON, OFF } from '../js/kit.js';

// ------------------------------------------------------------ brick numerals
//
// A minute numeral is a wall: 7 courses of running bond, drawn on a grid of
// half-bricks (8 across). Odd courses are offset half a brick, so a stroke
// that is one brick wide is a stretcher on one course and two headers on the
// next, as a real pier is laid. Diagonals step one half-brick per course:
// the same stair a builder lays.

const HU = 4, CO = 4;            // half-brick width, course height (px)
const GW = 8, GH = 7;            // grid: half-bricks across, courses up
export const BW = GW * HU, BH = GH * CO;

const BRICK_GLYPHS = {
  0: ['.######.', '##....##', '##....##', '##....##', '##....##', '##....##', '.######.'],
  1: ['...##...', '.####...', '...##...', '...##...', '...##...', '...##...', '.######.'],
  2: ['.######.', '##....##', '......##', '....###.', '..###...', '.##.....', '########'],
  3: ['.######.', '##....##', '......##', '...####.', '......##', '##....##', '.######.'],
  4: ['....###.', '...####.', '..##.##.', '.##..##.', '########', '.....##.', '.....##.'],
  5: ['########', '##......', '#######.', '......##', '......##', '##....##', '.######.'],
  6: ['..#####.', '.##.....', '##......', '#######.', '##....##', '##....##', '.######.'],
  7: ['########', '......##', '.....##.', '....##..', '...##...', '...##...', '...##...'],
  8: ['.######.', '##....##', '##....##', '.######.', '##....##', '##....##', '.######.'],
  9: ['.######.', '##....##', '##....##', '.#######', '......##', '.....##.', '.#####..'],
};

/**
 * The bricks of a numeral: { r, c0, n } = course r (0 top), first half-brick
 * column c0, n half-bricks long (1 or 2). Bricks sit on a grid that is offset
 * one half-brick on alternate courses (counted from the bottom, so the
 * footing course is always whole bricks).
 */
function tile(rows) {
  const out = [];
  rows.forEach((row, r) => {
    const par = (GH - 1 - r) & 1;
    for (let slot = -1; slot <= GW / 2; slot++) {
      const a = slot * 2 + par, b = a + 1;
      const fa = a >= 0 && a < GW && row[a] === '#', fb = b >= 0 && b < GW && row[b] === '#';
      if (fa && fb) out.push({ r, c0: a, n: 2 });
      else if (fa) out.push({ r, c0: a, n: 1 });
      else if (fb) out.push({ r, c0: b, n: 1 });
    }
  });
  return out;
}

export const BRICKS = {};
for (const d in BRICK_GLYPHS) BRICKS[d] = tile(BRICK_GLYPHS[d]);
const brickKey = (b) => b.r * 100 + b.c0 * 10 + b.n;

/** A brick's lit rectangle in px, relative to the numeral's top-left. */
function brickRect(b) {
  return [b.c0 * HU, b.r * CO, b.n * HU - 1, CO - 1];
}

function drawBrick(g, x, y, w, h) {
  g.fillRect(Math.round(x), Math.round(y), w, h, ON);
}

function drawWall(g, d, x, y) {
  for (const b of BRICKS[d]) {
    const [bx, by, bw, bh] = brickRect(b);
    drawBrick(g, x + bx, y + by, bw, bh);
  }
}

// ------------------------------------------------------------ rock numerals
//
// The hour is not built, it is ground: lumpy terrain numerals like the rock
// of a Lemmings level, a thick stroke round a centre-line whose radius
// wanders with a 2D noise, pocked with a few holes, and grassed on top.

const RW = 18, RH = 24;
const TAU = Math.PI * 2;

function hash2(x, y, s = 0) {
  const v = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453;
  return v - Math.floor(v);
}
function vnoise(x, y, s = 0) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, s), b = hash2(ix + 1, iy, s), c = hash2(ix, iy + 1, s), d = hash2(ix + 1, iy + 1, s);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uy);
}

/** Clock-angle arc (0 = up, clockwise), radians. */
function arcPts(cx, cy, rx, ry, a0, a1, n = 16) {
  const p = [];
  for (let k = 0; k <= n; k++) {
    const a = a0 + ((a1 - a0) * k) / n;
    p.push([cx + rx * Math.sin(a), cy - ry * Math.cos(a)]);
  }
  return p;
}

const PI = Math.PI;
const ROCK_SKEL = {
  0: [arcPts(9, 12, 5.8, 8.6, 0, TAU, 28)],
  1: [[[4.2, 7], [9.5, 3.2], [9.5, 20.8]], [[4.8, 20.8], [14.2, 20.8]]],
  2: [[...arcPts(9, 8, 5.6, 4.8, -1.35, 2.05, 12), [3.4, 20.8], [15, 20.8]]],
  3: [arcPts(8.8, 7.6, 5.2, 4.4, -1.45, PI, 12), arcPts(8.8, 16, 5.8, 4.8, 0, 4.3, 14)],
  4: [[[11.5, 3.2], [3.2, 15.4], [15.4, 15.4]], [[11.8, 9], [11.8, 20.8]]],
  5: [[[14.8, 3.2], [4.8, 3.2], [4.2, 10.6]], arcPts(8.8, 15, 5.8, 5.8, -0.95, 4.1, 14)],
  6: [arcPts(9.6, 12, 5.6, 8.8, 0.7, -PI, 12), arcPts(9, 15.6, 5.6, 5.2, 0, TAU, 20)],
  7: [[[3.2, 3.2], [15, 3.2], [7.4, 20.8]]],
  8: [arcPts(9, 7.4, 4.6, 4.2, 0, TAU, 18), arcPts(9, 16, 5.8, 4.8, 0, TAU, 20)],
};
ROCK_SKEL[9] = ROCK_SKEL[6].map((pl) => pl.map(([x, y]) => [RW - x, RH - y]));
const ROCK_SEGS = {};
for (const d in ROCK_SKEL) {
  const s = [];
  for (const pl of ROCK_SKEL[d]) for (let i = 1; i < pl.length; i++) s.push([...pl[i - 1], ...pl[i]]);
  ROCK_SEGS[d] = s;
}

const rockCache = new Map();
/**
 * A rock numeral as a bitmap (RW x RH, 1 = rock, 2 = grass blade), lumpy
 * from `seed`, so every hour's ground is new ground.
 */
export function rockGlyph(d, seed) {
  const key = seed * 10 + d;
  let m = rockCache.get(key);
  if (m) return m;
  m = new Uint8Array(RW * RH);
  const segs = ROCK_SEGS[d];
  for (let y = 0; y < RH; y++)
    for (let x = 0; x < RW; x++) {
      const px = x + 0.5, py = y + 0.5;
      let dist = 1e9;
      for (const s of segs) dist = Math.min(dist, segDist(px, py, s[0], s[1], s[2], s[3]));
      const r = 2.15 + 1.0 * (vnoise(px * 0.45, py * 0.45, seed) - 0.5) + 0.45 * (vnoise(px * 1.1, py * 1.1, seed + 7) - 0.5);
      if (dist <= r) m[y * RW + x] = 1;
    }
  // Pocks: a few single holes well inside the stroke.
  for (let y = 1; y < RH - 1; y++)
    for (let x = 1; x < RW - 1; x++) {
      const i = y * RW + x;
      if (m[i] && m[i - 1] && m[i + 1] && m[i - RW] && m[i + RW] && hash2(x, y, seed + 3) < 0.03) m[i] = 3;
    }
  for (let i = 0; i < m.length; i++) if (m[i] === 3) m[i] = 0;
  // Grass: blades on upward-facing rock.
  for (let y = 1; y < RH; y++)
    for (let x = 0; x < RW; x++)
      if (m[y * RW + x] === 1 && !m[(y - 1) * RW + x] && hash2(x, y, seed + 11) < 0.45) m[(y - 1) * RW + x] = 2;
  rockCache.set(key, m);
  return m;
}

function drawRock(g, d, seed, x, y, sway = 0) {
  const m = rockGlyph(d, seed);
  for (let j = 0; j < RH; j++)
    for (let i = 0; i < RW; i++) {
      const v = m[j * RW + i];
      if (v === 1) g.pixel(x + i, y + j, ON);
      else if (v === 2) g.pixel(x + i + (sway && hash2(i, j, seed) < 0.5 ? sway : 0), y + j, ON);
    }
}

// ------------------------------------------------------------ the crew
//
// Lemmings, 7 x 10, facing right; the feet are on the bottom row and the
// sprite's anchor is the middle of its feet (x 3, y 10). The mop of hair is
// lit, the face is a dark notch with a lit nose, the robe lit.

// Every pose shares the head (rows 0-5: mop, eye notch, nose) so the crew
// reads as one family; only arms and legs change.
const HEAD = ['..###..', '.#####.', '######.', '###..##', '.####..', '...#...'];
const S = (...rows) => sprite(rows.flat());
const L = {
  walk: [
    S(HEAD, '..###..', '.#####.', '..###..', '.#...#.'),
    S(HEAD, '..####.', '..###..', '..###..', '..#.#..'),
    S('.......', HEAD, '.####..', '..###..', '...##..'),
    S(HEAD, '.####..', '..###..', '..###..', '..#.#..'),
  ],
  fall: [S('.#...#.', '.#.#.#.', '.#####.', '#######', '###..##', '.####..', '...#...', '..###..', '..###..', '..#.#..')],
  climb: [
    S('.....#.', '..####.', '.#####.', '.####..', '..###..', '...##..', '..###..', '..###..', '...#...', '...##..'),
    S('.......', '..####.', '.######', '.####..', '..###..', '...##..', '..###..', '..###..', '...##..', '...#...'),
  ],
  build: [
    S('.....##', '..###.#', '.#####.', '######.', '###..##', '.####..', '...#...', '..####.', '.####..', '.##.##.'),
    S('.......', '..###..', '.#####.', '######.', '###..##', '.####..', '...#...', '..#####', '.###.##', '.##.#..'),
  ],
  dig: [
    S('.......', '.......', '..###..', '.#####.', '######.', '###..##', '.####..', '..###.#', '.######', '.#...#.'),
    S('.......', HEAD, '..###..', '..####.', '.#.##..', '.#.#.#.'),
  ],
  throw: [
    S(HEAD, '#.###..', '######.', '..###..', '.#...#.'),
    S('..###....', '.#####...', '######...', '###..##..', '.####....', '...#.....', '..#######', '.#####...', '..###....', '.#...#...'),
  ],
  ohno: [S('#.###.#', '#######', '######.', '###..##', '.####..', '...#...', '..###..', '..###..', '..###..', '..#.#..')],
  yippee: [S('#.....#', '#.###.#', '.#####.', '######.', '###..##', '.####..', '...#...', '..###..', '..###..', '.#...#.')],
  catch: [S('.#...#.', '.#.###.', '.#####.', '######.', '###..##', '.####..', '...#...', '..###..', '..###..', '..#.#..')],
  block: [S(HEAD, '#######', '..###..', '..###..', '.##.##.')],
};
const UMBRELLA = sprite(['..#####..', '.#######.', '#########', '#...#...#', '....#....', '....#....']);

/** Each sprite with a one-pixel dark halo, so a lemming reads in front of bricks. */
function haloOf(s) {
  const w = s.w + 2, h = s.h + 2, data = new Uint8Array(w * h);
  for (let y = 0; y < s.h; y++)
    for (let x = 0; x < s.w; x++)
      if (s.data[y * s.w + x])
        for (let dy = 0; dy <= 2; dy++) for (let dx = 0; dx <= 2; dx++) if (dx === 1 || dy === 1) data[(y + dy) * w + x + dx] = 1;
  return { w, h, data };
}
for (const k in L) L[k] = L[k].map((s) => ({ s, halo: haloOf(s) }));
const UMB = { s: UMBRELLA, halo: haloOf(UMBRELLA) };

/** A lemming with its feet at (x, y): x the middle of the feet, y the surface. */
function lem(g, pose, i, x, y, left = false) {
  const p = L[pose][((i % L[pose].length) + L[pose].length) % L[pose].length];
  const sx = Math.round(x) - (left ? p.s.w - 4 : 3), sy = Math.round(y) - p.s.h;
  g.blit(p.halo, sx - 1, sy - 1, { c: OFF, flipX: left });
  g.blit(p.s, sx, sy, { flipX: left });
}
function umbrella(g, x, y) {
  const sx = Math.round(x) - 4, sy = Math.round(y) - 10 - UMB.s.h;
  g.blit(UMB.halo, sx - 1, sy - 1, { c: OFF });
  g.blit(UMB.s, sx, sy);
}

// ------------------------------------------------------------ the level
//
// Scene coordinates; the whole level walks kit.orbit for burn-in.

const GY = 58;                       // ground surface (first lit row)
const WX = [58, 93], WY = GY - BH;   // the two brick walls (minutes)
const HX = [4, 25], LEDGE = 30, HY = LEDGE - RH;  // rock hour, on its ledge
const LEDGE_X0 = 2, LEDGE_X1 = 46;
const EXIT_X = 17;                   // the exit's doorway centre
const PAL_X = 38, PAL_Y = GY - 12;   // the brick pallet: 2 bricks x 3 courses
const PAL_TOP = [PAL_X + 8, PAL_Y];  // where bricks land on / leave it
const TRAP_X = 108;                  // the entrance hatch, top right
const G = 140;                       // gravity, px/s^2

function drawGround(g, ox, oy) {
  g.fillRect(0, GY + oy, 128, 1, ON);
  for (let y = GY + 1; y < 64; y++) {
    const lv = 0.32 - (y - GY) * 0.06;
    for (let x = 0; x < 128; x++) if (dither(x - ox, y - oy, lv)) g.pixel(x, y + oy, ON);
  }
}

/** The rock ledge the hour stands on, with drips hanging under it. */
const LEDGE_MAP = (() => {
  const w = LEDGE_X1 - LEDGE_X0, m = [];
  for (let x = 0; x < w; x++) {
    const edge = Math.min(x, w - 1 - x);
    const under = 2 + Math.round(1.4 * vnoise(x * 0.35, 1, 5)) + (edge < 3 ? edge - 3 : 0) + (hash2(x, 2, 9) < 0.12 && edge > 3 ? 2 : 0);
    m.push(Math.max(1, under));
  }
  return m;
})();
function drawLedge(g, ox, oy) {
  LEDGE_MAP.forEach((d, i) => g.fillRect(LEDGE_X0 + i + ox, LEDGE + oy, 1, d, ON));
}

/** The exit: a stone doorway with a torch flaming on each post. */
const EXIT_PIC = sprite([
  '.......#.......',
  '.....##.##.....',
  '...##.....##...',
  '.##.........##.',
  '###############',
  '.#############.',
  '.##.........##.',
  '.##.........##.',
  '.##.........##.',
  '.##.........##.',
  '.##.........##.',
  '.##.........##.',
  '.##.........##.',
  '###.........###',
]);

/** The exit: a gabled doorway, lit from inside, a torch flaming each side. */
function drawExit(g, t, ox, oy) {
  const x0 = EXIT_X - 7 + ox, y0 = GY - 14 + oy;
  g.blit(EXIT_PIC, x0, y0);
  for (const [fx, ph] of [[x0 - 3, 0], [x0 + 17, 1.7]]) {
    g.fillRect(fx, y0 + 7, 1, 7, ON);
    g.fillRect(fx - 1, y0 + 6, 3, 1, ON);
    // A teardrop flame on a dark gap above the cup: narrow foot, round
    // belly, a tip that licks from side to side.
    const n = smoothNoise(t * 9 + ph * 13, 3), n2 = smoothNoise(t * 6 + ph * 5, 4);
    const lean = n2 > 0.6 ? 1 : n2 < 0.4 ? -1 : 0, tall = n > 0.5 ? 1 : 0;
    const by = y0 + 4;
    g.pixel(fx, by, ON);
    g.fillRect(fx - 1, by - 2, 3, 2, ON);
    g.pixel(fx + (lean > 0 ? 1 : 0), by - 3, ON);
    g.pixel(fx + lean, by - 4, ON);
    if (tall) g.pixel(fx + lean, by - 5, ON);
    if (n > 0.78) g.pixel(fx - lean, by - 7, ON);   // a spark
  }
}

/** The entrance: a planked hatch under the ceiling whose two flaps swing open. */
function drawTrap(g, open, ox, oy) {
  const x0 = TRAP_X - 9 + ox, y0 = oy;
  g.fillRect(x0 - 2, y0, 23, 1, ON);
  g.fillPolygon([[x0 + 0.5, y0 + 2], [x0 + 18.5, y0 + 2], [x0 + 17, y0 + 6], [x0 + 2, y0 + 6]], ON);
  g.vline(x0 + 1, y0 + 1, 1); g.vline(x0 + 17, y0 + 1, 1);
  for (let x = x0 + 4; x < x0 + 17; x += 3) g.vline(x, y0 + 3, 2, OFF);
  const a = open * 1.4;
  g.fillRect(x0 + 3, y0 + 5, 13, 1, OFF);
  g.thickLine(x0 + 3, y0 + 6.5, x0 + 3 + 6.5 * Math.cos(a), y0 + 6.5 + 6.5 * Math.sin(a), 1.3);
  g.thickLine(x0 + 16, y0 + 6.5, x0 + 16 - 6.5 * Math.cos(a), y0 + 6.5 + 6.5 * Math.sin(a), 1.3);
}

function drawPallet(g, ox, oy) {
  for (let r = 0; r < 3; r++) {
    const off = r & 1 ? 4 : 0;
    for (let x = -off; x < 16; x += 8) {
      const a = Math.max(0, x), b = Math.min(16, x + 7);
      if (b > a) g.fillRect(PAL_X + a + ox, PAL_Y + r * 4 + oy, b - a, 3, ON);
    }
  }
}

// ------------------------------------------------------------ the minute turn
//
// The bricks the old numeral has and the new one lacks are dug out top
// down; the bricks the new one needs are laid bottom up. The k-th brick dug
// out is thrown to the k-th place to lay, so the old numeral is taken apart
// and rebuilt as the new one from its own bricks. Spare bricks are thrown
// onto the pallet; missing ones are thrown up from it.

const FLY = 0.5;                     // a brick's flight, s
const absBrick = (w, b) => ({ w, x: WX[w] + b.c0 * HU, y: WY + b.r * CO, bw: b.n * HU - 1, b });
const planCache = new Map();

function turnPlan(od, nd) {
  const key = `${od}${nd}`;
  let p = planCache.get(key);
  if (p) return p;
  let moves = [];
  const kept = [];
  for (let w = 0; w < 2; w++) {
    const A = BRICKS[od[w]], B = BRICKS[nd[w]];
    const inB = new Set(B.map(brickKey)), inA = new Set(A.map(brickKey));
    for (const b of A) if (inB.has(brickKey(b))) kept.push(absBrick(w, b));
    if (od[w] === nd[w]) continue;
    const R = A.filter((b) => !inB.has(brickKey(b))).sort((a, b) => a.r - b.r || a.c0 - b.c0).map((b) => absBrick(w, b));
    const D = B.filter((b) => !inA.has(brickKey(b))).sort((a, b) => b.r - a.r || a.c0 - b.c0).map((b) => absBrick(w, b));
    const n = Math.max(R.length, D.length);
    for (let i = 0; i < n; i++) moves.push({ src: R[i] ?? null, dst: D[i] ?? null, ord: (i + 0.5) / n + w * 1e-3 });
  }
  // Both walls change together, so the turn never shows a whole new tens
  // beside a whole old unit (09 -> 19 -> 10 would be a wrong time).
  moves = moves.sort((a, b) => a.ord - b.ord);
  const dt = clamp(2.1 / Math.max(1, moves.length), 0.07, 0.24);
  moves.forEach((m, k) => { m.s = 0.15 + k * dt; m.k = k; });
  const end = moves.length ? moves[moves.length - 1].s + FLY : 0;
  p = { moves, kept, end, dt };
  planCache.set(key, p);
  return p;
}

const palletBrick = { x: PAL_TOP[0] - 3, y: PAL_TOP[1] - 4, bw: 7 };

/** A brick in flight, spinning half a turn so it lands flat. */
function flyingBrick(g, m, u, ox, oy) {
  const a = m.src ?? palletBrick, b = m.dst ?? palletBrick;
  const e = ease.inOutQuad(u);
  const x0 = a.x + a.bw / 2, y0 = a.y + 1.5, x1 = b.x + b.bw / 2, y1 = b.y + 1.5;
  const hop = 7 + Math.abs(x1 - x0) * 0.25;
  const cx = lerp(x0, x1, u) + ox, cy = lerp(y0, y1, u) - 4 * hop * u * (1 - u) + oy;
  const w = lerp(a.bw, b.bw, e) / 2, h = 1.5, ang = (m.k & 1 ? 1 : -1) * Math.PI * e;
  const c = Math.cos(ang), s = Math.sin(ang);
  const pts = [[-w, -h], [w, -h], [w, h], [-w, h]].map(([px, py]) => [cx + px * c - py * s, cy + px * s + py * c]);
  g.fillPolygon(pts, ON);
}

function drawBrickAt(g, br, ox, oy, dy = 0) {
  g.fillRect(br.x + ox, Math.round(br.y + dy) + oy, br.bw, CO - 1, ON);
}

/** The walls at `tau` seconds after the turn of plan `p`. */
function drawWallsTurn(g, p, tau, ox, oy) {
  for (const br of p.kept) drawBrickAt(g, br, ox, oy);
  for (const m of p.moves) {
    if (m.src && tau < m.s) drawBrickAt(g, m.src, ox, oy);
    const u = (tau - m.s) / FLY;
    if (u >= 0 && u < 1) flyingBrick(g, m, u, ox, oy);
    if (m.dst && u >= 1) drawBrickAt(g, m.dst, ox, oy, u < 1.3 ? -Math.sin((u - 1) / 0.3 * Math.PI) * 1.2 : 0);
  }
}

function drawWallsSteady(g, d, ox, oy) {
  for (let w = 0; w < 2; w++) drawWall(g, d[w], WX[w] + ox, WY + oy);
}

// ------------------------------------------------------------ the walkers
//
// Lemmings drop out of the hatch onto the minutes and walk left over the
// numerals: they step down small ledges, fall off big ones (opening an
// umbrella for a long drop), climb any wall in their way, and leave by the
// exit. Each walker's whole route is a list of segments built from the
// numerals it walks over, so where it is at any instant is a lookup.

const WALK = 11, CLIMB = 7, FLOAT = 13;
const SPAWNS = [4, 12, 20, 28, 36, 44];
const pathCache = new Map();

const surfCache = new Map();
function surfaceOf(d) {
  const key = `${d}`;
  if (surfCache.has(key)) return surfCache.get(key);
  const s = new Int16Array(128).fill(GY);
  surfCache.set(key, s);
  // On the half-brick grid, so a walker steps over the mortar joints.
  for (let w = 0; w < 2; w++) {
    const rows = BRICK_GLYPHS[d[w]];
    for (let c = 0; c < GW; c++) {
      const r = rows.findIndex((row) => row[c] === '#');
      if (r < 0) continue;
      const w0 = c === GW - 1 || rows[r][c + 1] !== '#' ? HU - 1 : HU;
      for (let i = 0; i < w0; i++) s[WX[w] + c * HU + i] = WY + r * CO;
    }
  }
  // A gap of a pixel or three between bricks is stepped over.
  for (let x = WX[0]; x < WX[1] + BW; x++)
    if (s[x] === GY) {
      let e = x; while (e < 128 && s[e] === GY) e++;
      if (e - x <= 4 && e < 128 && s[x - 1] < GY) for (let i = x; i < e; i++) s[i] = Math.max(s[x - 1], s[e]);
      x = e;
    }
  return s;
}

function pathFor(d) {
  const key = `${d}`;
  let p = pathCache.get(key);
  if (p) return p;
  const surf = surfaceOf(d), segs = [];
  let t = 0, x = TRAP_X, y = 8, dist = 0;
  const push = (type, x1, y1, dur) => { segs.push({ type, t0: t, dur, x0: x, y0: y, x1, y1, dist }); t += dur; if (type === 'walk') dist += Math.abs(x1 - x); x = x1; y = y1; };
  const drop = (y1) => {
    const h = y1 - y;
    if (h > 16) { push('fall', x, y + 5, Math.sqrt(10 / G)); push('float', x, y1, (h - 5) / FLOAT); }
    else push('fall', x, y1, Math.sqrt((2 * h) / G));
  };
  drop(surf[x]);
  let wallsDone = 0;
  while (x > EXIT_X) {
    const ny = surf[x - 1];
    if (ny < y - 2) push('climb', x, ny, (y - ny) / CLIMB);
    if (ny > y + 3) { push('walk', x - 1, y, 1 / WALK); drop(ny); }
    else push('walk', x - 1, ny, 1 / WALK);
    if (!wallsDone && x < WX[0] - 1) wallsDone = t;
  }
  push('exit', x, y, 0.7);
  p = { segs, total: t, wallsDone };
  pathCache.set(key, p);
  return p;
}

function drawWalker(g, path, tau, ox, oy) {
  const segs = path.segs;
  let lo = 0, hi = segs.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (segs[mid].t0 <= tau) lo = mid; else hi = mid - 1; }
  const s = segs[lo], u = s.dur ? clamp((tau - s.t0) / s.dur, 0, 1) : 1;
  let x = lerp(s.x0, s.x1, u), y = lerp(s.y0, s.y1, u);
  if (s.type === 'fall') y = s.y0 + (s.y1 - s.y0) * u * u;
  x += ox; y += oy;
  if (s.type === 'walk') lem(g, 'walk', Math.floor((s.dist + u) / 1.5), x, y, true);
  else if (s.type === 'climb') lem(g, 'climb', Math.floor(tau * 6), x - 1, y + (1 - u) * 0, true);
  else if (s.type === 'fall') lem(g, 'fall', 0, x, y, true);
  else if (s.type === 'float') { umbrella(g, x, y); lem(g, 'fall', 0, x, y, true); }
  else if (s.type === 'exit') {
    if (u < 0.55) lem(g, 'yippee', 0, x, y - Math.sin(u / 0.55 * Math.PI) * 3, true);
  }
}

// ------------------------------------------------------------ the crew
//
// Three workers. Dig, the digger, waits on the pallet tapping a foot; at
// the turn he hops onto the old numeral and digs it out brick by brick,
// standing on each brick he lifts. Mason, the builder, keeps his hammer on
// the tens wall and lays the new bricks as they land, standing on each one.
// Hod stands by the pallet juggling a brick once a second (the seconds), and
// at the turn throws up the bricks the new numeral needs, or catches spares.

const HOD_X = 33, HOD_HAND = [34, GY - 13];
const DIG_IDLE = [PAL_X + 8, PAL_Y];
Object.assign(palletBrick, { x: HOD_HAND[0] - 3, y: HOD_HAND[1] - 3, bw: 7 });

function hopTo(a, b, u, h) {
  const e = ease.inOutQuad(u);
  return [lerp(a[0], b[0], e), lerp(a[1], b[1], e) - 4 * h * u * (1 - u)];
}

/**
 * Where a worker is `tau` s after the turn, given its jobs [{t, x, y}]: it
 * hops from `from` to the first job, from job to job, and from the last job
 * to `to`. Null before and after.
 */
function track(jobs, from, to, tau, inDur = 0.9, outDur = 1.0) {
  const n = jobs.length;
  if (!n || tau < jobs[0].t - inDur || tau > jobs[n - 1].t + 0.25 + outDur) return null;
  const at = (j) => [j.x, j.y];
  let pos, air = false, left = false, act = 0;
  if (tau < jobs[0].t) {
    const u = (tau - jobs[0].t + inDur) / inDur;
    pos = hopTo(from, at(jobs[0]), u, from[1] < jobs[0].y ? 3 : 10); air = u > 0.08 && u < 0.92; left = jobs[0].x < from[0];
  } else if (tau >= jobs[n - 1].t + 0.25) {
    const u = (tau - jobs[n - 1].t - 0.25) / outDur;
    pos = hopTo(at(jobs[n - 1]), to, u, 10); air = u > 0.08 && u < 0.92; left = to[0] < jobs[n - 1].x;
  } else {
    let i = 0; while (i < n - 1 && jobs[i + 1].t <= tau) i++;
    const a = jobs[i], b = jobs[Math.min(n - 1, i + 1)];
    const u = b.t > a.t ? clamp((tau - a.t) / (b.t - a.t), 0, 1) : 0;
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    pos = hopTo(at(a), at(b), u, d < 6 ? 0 : 2 + d * 0.12);
    air = d >= 6 && u > 0.15 && u < 0.85; left = b.x < a.x;
    for (const j of jobs) if (Math.abs(tau - j.t) < 0.08) act = 1;
  }
  return { x: pos[0], y: pos[1], air, left, act };
}

const jobsCache = new WeakMap();
/** Each wall's dig and lay jobs, and Hod's throws and catches. */
function crewJobs(p) {
  let J = jobsCache.get(p);
  if (J) return J;
  J = { dig: [[], []], lay: [[], []], hodThrow: [], hodCatch: [] };
  for (const m of p.moves) {
    const w = (m.src ?? m.dst).w;
    if (m.src) J.dig[w].push({ t: m.s, x: m.src.x + m.src.bw / 2, y: m.src.y });
    else J.hodThrow.push(m.s);
    if (m.dst) J.lay[w].push({ t: m.s + FLY, x: m.dst.x + m.dst.bw / 2, y: m.dst.y });
    else J.hodCatch.push(m.s + FLY);
  }
  jobsCache.set(p, J);
  return J;
}

// The tens crew, released from the hatch when the tens changes, and gone by
// the exit when it is done.
const TENS_IN = [[TRAP_X - 3, 8], [TRAP_X + 3, 8]], TENS_OUT = [[WX[0] - 4, GY], [WX[0] - 12, GY]];

function tensWorker(g, jobs, k, pose, tau, ox, oy) {
  const n = jobs.length;
  if (!n) return;
  const tr = track(jobs, TENS_IN[k], TENS_OUT[k], tau, 1.3, 1.0);
  if (tr) {
    if (tau < jobs[0].t && tr.air) umbrella(g, tr.x + ox, tr.y + oy);
    lem(g, tr.air ? 'fall' : pose, tr.act, tr.x + ox, tr.y + oy, tr.left);
    return;
  }
  const tw = tau - (jobs[n - 1].t + 1.25);
  if (tw < 0) return;
  const x = TENS_OUT[k][0] - tw * WALK;
  if (x > EXIT_X) lem(g, 'walk', Math.floor((TENS_OUT[k][0] - x) / 1.5), x + ox, GY + oy, true);
  else if (x > EXIT_X - 6) lem(g, 'yippee', 0, EXIT_X + ox, GY + oy - 2, true);
}

function drawCrew(g, p, tau, surfOld, surfNew, sec, ox, oy) {
  const J = crewJobs(p);
  const surf = tau < 0.5 ? surfOld : surfNew;
  const masonAt = (s) => [WX[0] + 9, s[WX[0] + 9]];
  const d = track(J.dig[1], DIG_IDLE, DIG_IDLE, tau);
  if (d) lem(g, d.air ? 'fall' : 'dig', d.act, d.x + ox, d.y + oy, d.left);
  else lem(g, 'walk', Math.floor(sec * 4) & 1 ? 1 : 3, DIG_IDLE[0] + ox, DIG_IDLE[1] + oy, Math.floor(sec / 5) & 1);
  const m = track(J.lay[1], masonAt(surfOld), masonAt(surfNew), tau);
  if (m) lem(g, m.air ? 'fall' : 'build', m.act ? 1 : 0, m.x + ox, m.y + oy, m.left);
  else {
    // Mason patrols the top of the tens wall between turns, stopping to tap
    // it, and is home by the time the next one starts.
    const [hx, hy] = masonAt(surf);
    let lo = hx, hi = hx;
    while (lo > WX[0] + 2 && surf[lo - 1] < GY && Math.abs(surf[lo - 1] - hy) <= 4) lo--;
    while (hi < WX[0] + BW - 3 && surf[hi + 1] < GY && Math.abs(surf[hi + 1] - hy) <= 4) hi++;
    const amp = progress(sec, 5, 6) * (1 - progress(sec, 53, 54));
    const ph = (sec % 16) / 16;   // out right, tap, back, past home left, tap, home
    const wave = ph < 0.35 ? ease.inOutQuad(ph / 0.35) : ph < 0.5 ? 1 : ph < 0.85 ? 1 - 2 * ease.inOutQuad((ph - 0.5) / 0.35) : -1 + ease.inOutQuad((ph - 0.85) / 0.15);
    const x = Math.round(hx + amp * (wave > 0 ? wave * (hi - hx) : -wave * (lo - hx)));
    const still = amp < 0.01 || (ph > 0.35 && ph < 0.5) || ph > 0.97 || (ph > 0.82 && ph < 0.87);
    const left = ph > 0.5 && ph < 0.86;
    if (still) lem(g, 'build', sec % 1 > 0.8 ? 1 : 0, x + ox, surf[x] + oy, left);
    else lem(g, 'walk', Math.floor(sec * 7), x + ox, surf[x] + oy, left);
  }
  tensWorker(g, J.dig[0], 0, 'dig', tau, ox, oy);
  tensWorker(g, J.lay[0], 1, 'build', tau, ox, oy);
  // Hod: throws and catches during the turn, juggles the rest of the time.
  const busy = p.moves.length && tau > -0.4 && tau < p.end + 0.4;
  let pose = 'walk', fr = 1;
  if (busy) {
    for (const s of J.hodThrow) if (tau > s - 0.15 && tau < s + 0.1) { pose = 'throw'; fr = tau < s ? 0 : 1; }
    for (const s of J.hodCatch) if (Math.abs(tau - s) < 0.12) { pose = 'catch'; fr = 0; }
  } else {
    const u = sec % 1;
    if (u < 0.14 || u > 0.86) pose = 'catch';
    const y = HOD_HAND[1] - 13 * 4 * u * (1 - u), a = u * Math.PI;
    const c = Math.cos(a), s = Math.sin(a), cx = HOD_HAND[0] + ox, cy = y + oy;
    g.fillPolygon([[-3.5, -1.5], [3.5, -1.5], [3.5, 1.5], [-3.5, 1.5]].map(([px, py]) => [cx + px * c - py * s, cy + px * s + py * c]), ON);
  }
  lem(g, pose, fr, HOD_X + ox, GY + oy, false);
}

// ------------------------------------------------------------ the hour
//
// Bricks are for minutes; the hour is ground, and ground is dug. From :59:52
// two bombers float over from the hatch and land on the old hour, fuses
// sparking faster and faster; "Oh no!", and at :00 they blow it to bits. A
// fresh slab of rock drops onto the ledge with three diggers riding it, and
// they dig the new hour out of it column by column, fall out of the bottom
// of the ledge under umbrellas and walk into the exit.

const SLAB = [2, 4, 44, 26];                // x, y, w, h
const SLAB_DROP = [0.8, 1.45], CARVE0 = 1.9, COLT = 0.95;
const STRIPS = [[2, 4, 3.5], [16, 4, 3.5], [30, 4, 4]];   // x0, columns, column width
const BOMB_LAND = [-5.6, -8.2];             // landing time, release time
const HOUR_PRE = 50, HOUR_POST = 16;        // the show runs :59:50 - :00:16

const slabMask = (() => {
  const [sx, sy, sw, sh] = SLAB, m = new Float32Array(sw * sh).fill(-1);
  for (let y = 0; y < sh; y++)
    for (let x = 0; x < sw; x++) {
      const edge = Math.min(x, sw - 1 - x, y * 1.4);
      if (edge < 2.2 * vnoise(x * 0.5, y * 0.5, 41)) continue;
      // When this pixel is dug out: by its strip's digger, column by column.
      const ax = sx + x;
      const k = ax < STRIPS[1][0] ? 0 : ax < STRIPS[2][0] ? 1 : 2;
      const j = Math.min(STRIPS[k][1] - 1, Math.floor((ax - STRIPS[k][0]) / STRIPS[k][2]));
      m[y * sw + x] = CARVE0 + j * COLT + (y / sh) * COLT * 0.92;
    }
  return m;
})();

/** Top of rock in column i of an hour numeral (for a lemming to stand on). */
function rockTop(d, seed, i) {
  const m = rockGlyph(d, seed);
  for (let j = 0; j < RH; j++) if (m[j * RW + i] === 1) return j;
  return RH;
}

function drawHourShow(g, tau, oldH, newH, oldSeed, newSeed, ox, oy) {
  const od = [oldH / 10 | 0, oldH % 10], nd = [newH / 10 | 0, newH % 10];
  // Bombers: glide in, stand, spark, "Oh no!", bang.
  for (let k = 0; k < 2; k++) {
    const lx = HX[k] + 9, ly = HY + rockTop(od[k], oldSeed + k, 9);
    const [tl, tr] = BOMB_LAND, rel = tr + k * 0.5;
    if (tau < rel || tau >= 0) continue;
    if (tau < tl) {
      const u = progress(tau, rel, tl), e = ease.inOutQuad(u);
      const x = lerp(TRAP_X + (k ? 3 : -3), lx, e), y = lerp(4, ly, u) - 10 * Math.sin(u * Math.PI);
      umbrella(g, x + ox, y + oy);
      lem(g, 'fall', 0, x + ox, y + oy, true);
    } else if (tau < -1.2) {
      lem(g, 'walk', 1, lx + ox, ly + oy, k === 1);
      const rate = lerp(2, 9, progress(tau, tl, -1.2));
      if ((tau * rate) % 1 < 0.5) g.pixel(lx + ox + (k ? -1 : 1), ly + oy - 12, ON);
    } else {
      const sh = Math.floor(tau * 30) & 1 ? 1 : -1;
      lem(g, 'ohno', 0, lx + ox + sh, ly + oy, k === 1);
      g.pixel(lx + ox, ly + oy - 12 - (Math.floor(tau * 20) & 1), ON);
    }
  }
  // The old hour: whole until :00, then debris.
  if (tau < 0) {
    for (let k = 0; k < 2; k++) drawRock(g, od[k], oldSeed + k, HX[k] + ox, HY + oy);
  } else if (tau < 2.5) {
    for (let k = 0; k < 2; k++) {
      const m = rockGlyph(od[k], oldSeed + k), cx = HX[k] + 9, cy = HY + rockTop(od[k], oldSeed + k, 9);
      for (let j = 0; j < RH; j++)
        for (let i = 0; i < RW; i++) {
          if (!m[j * RW + i]) continue;
          // Every other grain flies as a 2x2 chunk; the rest is dust.
          const x0 = HX[k] + i, y0 = HY + j, h = hash2(i, j, k + 17);
          if ((i + j) & 1 && h > 0.35) continue;
          const dx = x0 - cx, dy = y0 - cy - 3, dl = Math.hypot(dx, dy) + 1;
          const sp = 14 + 46 * h * h, vx = (dx / dl) * sp * 1.4, vy = (dy / dl) * sp - 38;
          const x = x0 + vx * tau, y = y0 + vy * tau + 0.5 * G * 0.6 * tau * tau;
          if (y < 70) g.fillRect(Math.round(x + ox), Math.round(y + oy), h > 0.6 ? 2 : 1, h > 0.6 ? 2 : 1, ON);
        }
      // The blast: a ring, and the bomber's confetti.
      if (tau < 0.45) g.circle(cx + ox, cy - 4 + oy, 3 + ease.outQuad(tau / 0.45) * 18, ON);
      if (tau > 0.08 && tau < 0.5) g.circle(cx + ox, cy - 4 + oy, ease.outQuad((tau - 0.08) / 0.42) * 12, ON);
    }
  }
  // The slab: drops in, then is dug out around the new hour.
  if (tau < SLAB_DROP[0]) return;
  let dy = 0;
  if (tau < SLAB_DROP[1]) { const u = tau - SLAB_DROP[0]; dy = -44 + 0.5 * 208 * u * u; dy = Math.min(0, dy); }
  else if (tau < SLAB_DROP[1] + 0.2) dy = -1.5 * Math.sin(((tau - SLAB_DROP[1]) / 0.2) * Math.PI);
  const [sx, sy, sw, sh] = SLAB;
  const gm = [rockGlyph(nd[0], newSeed), rockGlyph(nd[1], newSeed + 1)];
  const chips = [];
  for (let y = 0; y < sh; y++)
    for (let x = 0; x < sw; x++) {
      const ax = sx + x, ay = sy + y;
      let glyph = 0;
      for (let k = 0; k < 2; k++) {
        const i = ax - HX[k], j = ay - HY;
        if (i >= 0 && i < RW && j >= 0 && j < RH && gm[k][j * RW + i]) glyph = gm[k][j * RW + i];
      }
      const tr = slabMask[y * sw + x];
      if (glyph === 1 || (tr >= 0 && tau < tr) || (glyph === 2 && (tr < 0 || tau >= tr))) g.pixel(ax + ox, Math.round(ay + dy) + oy, ON);
      if (tr >= 0 && !glyph && tau >= tr && tau < tr + 0.4 && hash2(x, y, 5) < 0.3) chips.push([ax, ay, tau - tr, hash2(y, x, 6)]);
    }
  for (const [x, y, a, h] of chips) g.pixel(x + (h < 0.5 ? -1 : 1) * (12 + 30 * h) * a + ox, y - 30 * a + 0.5 * G * a * a + oy, ON);
  // The diggers: ride the slab, dig, fall out under the ledge, go home.
  STRIPS.forEach(([x0, n, cw], k) => {
    const end = CARVE0 + n * COLT;
    if (tau < CARVE0) { lem(g, 'walk', 1, x0 + cw / 2 + ox, sy + dy + oy, k === 2); return; }
    if (tau < end) {
      const j = Math.floor((tau - CARVE0) / COLT), u = ((tau - CARVE0) % COLT) / COLT;
      const cx = x0 + j * cw + cw / 2;
      if (u < 0.92 || j === n - 1) lem(g, 'dig', Math.floor(tau * 8), cx + ox, sy + Math.min(1, u / 0.92) * sh + oy, false);
      else {
        // Out of the hole and on to the top of the next column.
        const [x, y] = hopTo([cx, sy + sh], [cx + cw, sy], (u - 0.92) / 0.08, 3);
        lem(g, 'climb', 0, x + ox, y + oy, false);
      }
      return;
    }
    // Along the ledge, off its end under an umbrella, and home.
    const xs = x0 + (n - 0.5) * cw, a = tau - end;
    const tLedge = (LEDGE_X1 + 1 - xs) / WALK, tFloat = (GY - LEDGE) / FLOAT;
    if (a < tLedge) lem(g, 'walk', Math.floor((a * WALK) / 1.5), xs + a * WALK + ox, LEDGE + oy, false);
    else if (a < tLedge + tFloat) {
      const y = LEDGE + (a - tLedge) * FLOAT, x = LEDGE_X1 + 1 + Math.min(3, (a - tLedge) * 8);
      umbrella(g, x + ox, y + oy); lem(g, 'fall', 0, x + ox, y + oy, true);
    } else {
      const w = (a - tLedge - tFloat) * WALK, xx = LEDGE_X1 + 4 - w;
      if (xx > EXIT_X) lem(g, 'walk', Math.floor(w / 1.5), xx + ox, GY + oy, true);
      else if (xx > EXIT_X - 6) lem(g, 'yippee', 0, EXIT_X + ox, GY + oy - 2, true);
    }
  });
}

// ------------------------------------------------------------ review

export const SPEC_SIZE = [340, 90];
/** For review: the ten brick numerals, then the ten rock numerals (out/lemmings-digits.png). */
export function specimen(g, seed = 0) {
  for (let d = 0; d < 10; d++) drawWall(g, d, 4 + d * (BW + 2), 4);
  for (let d = 0; d < 10; d++) drawRock(g, d, seed + d, 4 + d * (RW + 6), 40);
  let x = 4;
  for (const k in L) for (const s of L[k]) { g.blit(s, x, 74); x += 10; }
}

const DAY = 0xcf, NIGHT_C = 0x20;
const digitsOf = (f) => [f.mm.charCodeAt(0) - 48, f.mm.charCodeAt(1) - 48];

export default {
  name: 'Lemmings',
  blurb: 'A Lemmings level: walkers march over brick minutes, a crew digs the old numeral out and lays its bricks as the new one; on the hour bombers blow up the rock hour and diggers carve the next.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  driver: 'full',

  frame(g, { fields: f, date, oled, night, t }) {
    oled.contrast(DAY + (NIGHT_C - DAY) * night);
    const [ox, oy] = orbit(date, 2, 3);
    const sec = f.sec;
    const pf = previousMinute(date), nf = clockFields(new Date(date.getTime() + 60000));
    const cur = digitsOf(f), prev = digitsOf(pf), next = digitsOf(nf);
    const plan = turnPlan(prev, cur), nextPlan = turnPlan(cur, next);

    drawGround(g, ox, oy);
    drawLedge(g, ox, oy);
    const hk = Math.floor(f.minuteKey / 60), seed = (h) => ((h % 997) + 997) % 997 * 2;
    const sway = Math.sin(sec * 1.3) > 0.6 ? 1 : 0;
    if (f.m === 0 && sec < 0.034) oled.invert(true);   // the bang: one frame
    if (f.m === 59 && sec >= HOUR_PRE) drawHourShow(g, sec - 60, f.h, (f.h + 1) % 24, seed(hk), seed(hk + 1), ox, oy);
    else if (f.m === 0 && sec < HOUR_POST) drawHourShow(g, sec, (f.h + 23) % 24, f.h, seed(hk - 1), seed(hk), ox, oy);
    else {
      drawRock(g, f.h / 10 | 0, seed(hk), HX[0] + ox, HY + oy, sway);
      drawRock(g, f.h % 10, seed(hk) + 1, HX[1] + ox, HY + oy, sway);
    }
    drawExit(g, sec + f.m * 60, ox, oy);
    drawPallet(g, ox, oy);

    if (sec < plan.end + 0.05) drawWallsTurn(g, plan, sec, ox, oy);
    else drawWallsSteady(g, cur, ox, oy);

    // The hatch opens for each walker.
    let open = 0;
    const releases = [...SPAWNS];
    for (const [p, at] of [[plan, 0], [nextPlan, 60]]) {
      const J = crewJobs(p);
      if (J.dig[0].length || J.lay[0].length) releases.push(at + Math.min(J.dig[0][0]?.t ?? 9, J.lay[0][0]?.t ?? 9) - 1.3);
    }
    if (f.m === 59) releases.push(60 + BOMB_LAND[1], 60.5 + BOMB_LAND[1]);
    for (const s0 of releases) open = Math.max(open, progress(sec, s0 - 0.45, s0 - 0.05) * (1 - progress(sec, s0 + 0.5, s0 + 1.0)));
    drawTrap(g, ease.inOutQuad(open), ox, oy);

    // The crew work this minute's turn until :30, then get ready for the next.
    if (sec < 30) drawCrew(g, plan, sec, surfaceOf(prev), surfaceOf(cur), sec, ox, oy);
    else drawCrew(g, nextPlan, sec - 60, surfaceOf(cur), surfaceOf(next), sec, ox, oy);

    // Walkers from this minute, and the last ones of the minute before.
    for (const [fd, base] of [[prev, sec + 60], [cur, sec]]) {
      const path = pathFor(fd);
      for (const s0 of SPAWNS) {
        if (s0 + path.wallsDone > 57) continue;
        const tau = base - s0;
        if (tau >= 0 && tau < path.total) drawWalker(g, path, tau, ox, oy);
      }
    }
  },
};
