// dollbed: the two dolls, the bed and the stolen blanket.
//
// Every doll part is a polygon built from an ellipse with a little radial
// "fur" jitter, filled with hard pixels: the jitter is what makes a plush
// edge at this size (short fuzz on the puppy, long ragged loops on the panda).
// Jitter tables are made once at load; per frame a part is a few table
// lookups and one fillPolygon.

import { Gfx, sprite, hex, mix, rand, sin, cos, clamp } from '../js/kit.js';

export const C = {
  wallTop: hex('#181c40'), wallBot: hex('#2a3064'),
  pillow: hex('#c3c6d8'), pillowHi: hex('#d9dbe8'), pillowSh: hex('#9fa3bd'), pillowLine: hex('#7f84a2'),
  quilt: hex('#878a96'), quiltHi: hex('#9a9da9'), quiltSh: hex('#5f626f'), stitch: hex('#c9ccd6'), binding: hex('#d6d8e2'),
  star: hex('#d8e0a0'),
  // puppy (sampled from the photos)
  tan: hex('#b8781a'), tanLit: hex('#e0a040'), tanSh: hex('#845618'), blk: hex('#161412'), blkRim: hex('#3a3634'),
  nose: hex('#5a3a22'), noseHi: hex('#7c5a3e'), tag: hex('#9a7ad8'), glint: hex('#e8e8f0'),
  // panda
  cream: hex('#efeadf'), creamSh: hex('#d2cbbc'), pblk: hex('#141418'), pblkRim: hex('#474a66'), pcurl: hex('#2c2c38'),
};

// ------------------------------------------------------------ polygons

const UNIT = new Map();
function unit(n) {
  let u = UNIT.get(n);
  if (!u) {
    u = { c: new Float32Array(n), s: new Float32Array(n) };
    for (let i = 0; i < n; i++) { u.c[i] = Math.cos((i / n) * Math.PI * 2); u.s[i] = Math.sin((i / n) * Math.PI * 2); }
    UNIT.set(n, u);
  }
  return u;
}

/** A fur jitter table: `n` radial offsets in pixels. kind 'fuzz' = short soft, 'shag' = long looped pile. */
export function furTable(n, amp, seed, kind = 'fuzz') {
  const j = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = rand(i, seed, 7);
    if (kind === 'shag') j[i] = (i & 1) ? amp * (0.55 + 0.6 * r) : -amp * (0.15 + 0.35 * r);
    else j[i] = amp * (r * 2 - 1);
  }
  return j;
}

/**
 * Points of an ellipse (rx, ry) rotated by `rot`, centred at (cx, cy) in a
 * local frame, with fur jitter `fur` (a table, or null), mapped by `T`
 * (a function (x, y) -> [X, Y]) or used as is.
 */
export function ellPts(cx, cy, rx, ry, rot, n, fur, T) {
  const u = unit(n), cr = cos(rot), sr = sin(rot), pts = new Array(n);
  for (let i = 0; i < n; i++) {
    const j = fur ? fur[i] : 0;
    const ex = (rx + j) * u.c[i], ey = (ry + j) * u.s[i];
    const x = cx + ex * cr - ey * sr, y = cy + ex * sr + ey * cr;
    pts[i] = T ? T(x, y) : [x, y];
  }
  return pts;
}

export function blob(g, cx, cy, rx, ry, rot, n, fur, col, T, o) {
  g.fillPolygon(ellPts(cx, cy, rx, ry, rot, n, fur, T), col, o);
}

/** A teardrop: a disc of radius r at (cx, cy) drawn out to a point at (tx, ty). */
export function teardropPts(tx, ty, cx, cy, r, n, fur, T) {
  const dx = tx - cx, dy = ty - cy, D = Math.sqrt(dx * dx + dy * dy);
  const a = Math.atan2(dy, dx), b = Math.acos(clamp(r / D, -1, 1));
  const pts = [T ? T(tx, ty) : [tx, ty]];
  for (let i = 0; i <= n; i++) {
    const ang = a + b + ((2 * Math.PI - 2 * b) * i) / n;
    const j = fur ? fur[i % fur.length] : 0;
    const x = cx + (r + j) * Math.cos(ang), y = cy + (r + j) * Math.sin(ang);
    pts.push(T ? T(x, y) : [x, y]);
  }
  return pts;
}

/** Rotation by `a` about the origin, then translation: the local frame of a doll. */
export function frame2(ox, oy, a) {
  const c = cos(a), s = sin(a);
  return (x, y) => [ox + c * x - s * y, oy + s * x + c * y];
}

// ------------------------------------------------------------ the bed (static, drawn once)

const FRUIT = {
  apple: sprite(`
    ..s..
    .ss..
    s...s
    s...s
    .sss.`, { s: 1 }),
  pear: sprite(`
    ..s.
    .s.s
    .s.s
    s...s
    .sss.`, { s: 1 }),
  cherry: sprite(`
    ...s.
    ..ss.
    .s..s
    ss.ss
    ss.ss`, { s: 1 }),
  strawberry: sprite(`
    .s.s.
    sssss
    s.s.s
    .s.s.
    ..s..`, { s: 1 }),
};
const FRUITS = Object.values(FRUIT);

/** Diamond quilting: two families of dashed diagonals. `ox` slides the fabric. */
export const QUILT = { dx: 14, slope: 0.5 };
export function quiltPixel(x, y, ox, oy) {
  // the two diagonal families through a lattice of period dx (x) and dx*slope (y)
  const u = x - ox + (y - oy) / QUILT.slope, v = x - ox - (y - oy) / QUILT.slope;
  const P = QUILT.dx * 2;
  const fu = ((u % P) + P) % P, fv = ((v % P) + P) % P;
  const on = fu < 1 || fv < 1;
  // a running stitch: 3 on, 1 off along x
  return on && ((x & 3) !== 3);
}

let BG = null;
/** The wall, the shared pillow and the bedspread with its quilting and fruit outlines. */
export function background() {
  if (BG) return BG;
  const g = new Gfx(160, 80);
  g.gradient(0, 0, 160, 34, [C.wallTop, C.wallBot]);
  g.fillRect(0, 34, 160, 46, C.wallBot);
  // the bedspread (its far part is hidden behind the pillow)
  g.fillRect(0, 46, 160, 34, C.quilt);
  for (let y = 46; y < 80; y++)
    for (let x = 0; x < 160; x++) if (quiltPixel(x, y, 0, 0)) g.pixel(x, y, mix(C.quilt, C.stitch, 0.75));
  // fruit outlines in some of the diamonds
  const P = QUILT.dx * 2;
  let k = 0;
  for (let row = 0; row < 6; row++)
    for (let col = -1; col < 8; col++) {
      // diamond centres sit half a period off the lines
      const cx = col * P + (row & 1 ? P / 2 : 0) + P / 2, cy = 46 + row * QUILT.dx * QUILT.slope - 3;
      if (cy < 55 || cy > 78 || cx < 2 || cx > 156) continue;
      if (rand(col, row, 3) < 0.35) continue;
      g.blit(FRUITS[k++ % FRUITS.length], cx - 2, cy - 2, { c: C.stitch });
    }
  // the pillow they share, on the bed, with its shadow
  g.fillRect(4, 55, 152, 3, C.quiltSh);
  g.fillRoundRect(2, 27, 156, 30, 10, C.pillowLine);
  g.fillRoundRect(3, 28, 154, 28, 9, C.pillow);
  g.fillRoundRect(6, 29, 148, 6, 3, C.pillowHi);
  g.fillRoundRect(5, 47, 150, 8, 4, C.pillowSh);
  g.fillRoundRect(5, 45, 150, 7, 4, C.pillow);
  // a soft dent in the middle where it was slept on, and the corner tufts
  g.fillEllipse(80, 41, 10, 4, mix(C.pillow, C.pillowSh, 0.45));
  for (const [x, d] of [[3, -1], [156, 1]]) {
    g.fillPolygon([[x, 30], [x + 3 * d, 26], [x + 2 * d, 33]], C.pillowLine);
    g.fillPolygon([[x, 54], [x + 3 * d, 58], [x + 2 * d, 51]], C.pillowLine);
  }
  BG = g;
  return g;
}

// ------------------------------------------------------------ the blanket (a pulled-up fold of the bedspread)

/**
 * The fold's outline: base on the bed, a hump whose top sits at `top`,
 * centred at cx with half-width hw, flattened by `flat` (0 round .. 1 square),
 * with travelling folds of amplitude `wav`.
 */
export function flapTop(x, cx, hw, top, flat, wav, ph) {
  const u = (x - cx) / hw;
  if (u <= -1 || u >= 1) return 80;
  const b = 1 - u * u;
  const k = b + (Math.sqrt(b) - b) * flat;
  return 80 - (80 - top) * k + wav * sin(u * 7 + ph) * k;
}

export function drawFlap(g, cx, hw, top, flat, wav, ph, slide) {
  const x0 = Math.floor(cx - hw), x1 = Math.ceil(cx + hw);
  const pts = [[x0, 80]];
  for (let x = x0; x <= x1; x += 2) pts.push([x, flapTop(x, cx, hw, top, flat, wav, ph)]);
  pts.push([x1, 80]);
  // shadow on the bedspread, then the fold, its quilting, its bound edge
  g.fillPolygon(pts.map(([x, y]) => [x + 1.5, y + 1.2]), C.quiltSh);
  g.fillPolygon(pts, C.quiltHi);
  for (let x = Math.max(0, x0); x < Math.min(160, x1); x++) {
    const ty = flapTop(x + 0.5, cx, hw, top, flat, wav, ph);
    for (let y = Math.ceil(ty + 1.5); y < 80; y++) if (quiltPixel(x, y, slide, 3)) g.pixel(x, y, C.stitch);
    g.pixel(x, Math.floor(ty + 0.5), C.binding);
  }
}

// ------------------------------------------------------------ the puppy

// Local coordinates are centred on the head; a roll turns about a pivot
// between head and body so the rolled puppy stays on the bed.
const PIV = [0, 1];
function puppyFrame(p) {
  const T = frame2(p.x + PIV[0], p.y + PIV[1] + p.lift, p.roll);
  return (x, y) => T(x - PIV[0], y - PIV[1]);
}

const PF = {
  hump: furTable(28, 0.5, 11), head: furTable(30, 0.45, 12),
  earL: furTable(18, 0.4, 13), earR: furTable(18, 0.4, 14),
  cheek: furTable(16, 0.3, 15), paw: furTable(14, 0.3, 16), leg: furTable(14, 0.4, 17),
};

/**
 * The puppy lying flat, head resting on its front paws, facing us.
 * p: { x, y (head centre), roll (0 lying, PI belly-up), paddle, earSwing, breath, glint }
 */
export function drawPuppy(g, p) {
  const L = puppyFrame(p);
  const up = cos(p.roll);                 // 1 lying on its belly, -1 belly-up
  const belly = clamp((0.2 - up) / 0.6, 0, 1);
  const br = p.breath;
  const pl = p.paddle;

  // rear legs splayed out to the sides, tan mitten paws
  const legs = [[-1, 0], [1, 1]];
  for (const [s, i] of legs) {
    const kick = belly * 1.5 * sin(p.t * 9 + i * 2);
    blob(g, s * 21, 1 + kick, 7, 4.2, -s * 0.35, 14, PF.leg, C.blk, L);
    blob(g, s * 27, 4 + kick, 4.6, 3.6, -s * 0.2, 14, PF.paw, C.tan, L);
  }
  // the back (and, rolled over, the tan belly with its tag). The body lies
  // away from us, so it does not turn with the head: it just shows its other side.
  const bx = p.x + 7, by = p.y - 8.5 + p.lift - 3 * belly;
  blob(g, bx, by - br * 0.5, 18.5, 8.5 + br * 0.4 + 1.5 * belly, 0, 28, PF.hump, C.blk);
  if (belly > 0) {
    blob(g, bx, by - 1, 13 * belly + 0.5, 5.8 * belly + 0.5, 0, 16, PF.cheek, C.tan);
    blob(g, bx - 2, by - 3, 8 * belly, 2 * belly, 0, 12, null, C.tanLit);
    if (belly > 0.6) g.fillRect(Math.round(bx + 9), Math.round(by - 3), 3, 2, C.tag);
  }
}

/** The parts in front of the blanket: front paws, head, ears, face. */
export function drawPuppyFront(g, p) {
  const L = puppyFrame(p);
  const pl = p.paddle;
  const q = (x, y) => [x, y];

  // front legs and mitten paws under the chin
  for (const s of [-1, 1]) {
    const lift = pl * (s < 0 ? sin(p.t * 16) : -sin(p.t * 16)) * 1.4;
    const [lx, ly] = q(s * 7.5, 8 - Math.max(0, lift));
    blob(g, lx, ly, 4, 3.2, 0, 14, PF.leg, C.blk, L);
    const [px, py] = q(s * 8.5, 12.2 - Math.max(0, lift));
    blob(g, px, py + 0.6, 5.6, 3.8, s * 0.1, 14, PF.paw, C.tanSh, L);
    blob(g, px, py, 5.6, 3.6, s * 0.1, 14, PF.paw, C.tan, L);
    blob(g, px - s * 0.5, py - 1.3, 3.4, 1.4, 0, 10, null, C.tanLit, L);
    if (s > 0) { const [tx, ty] = L(px + 4.2, py + 0.5); g.fillRect(tx - 0.5, ty - 1, 2, 2, C.tag); }
  }

  // head: wide, slightly flat, black on top
  const [hx, hy] = q(0, 0);
  blob(g, hx, hy, 14.2, 9.6, 0, 30, PF.head, C.blk, L);
  // the fat tan crescent of a muzzle: two round cheeks and a chin
  for (const s of [-1, 1]) blob(g, hx + s * 5.2, hy + 4.6, 7.4, 5.1, 0, 16, PF.cheek, C.tanSh, L);
  for (const s of [-1, 1]) blob(g, hx + s * 5.2, hy + 4, 7.2, 4.8, 0, 16, PF.cheek, C.tan, L);
  blob(g, hx, hy + 5.2, 5, 3.6, 0, 12, null, C.tan, L);
  for (const s of [-1, 1]) blob(g, hx + s * 6, hy + 1.6, 3.6, 1.3, s * 0.25, 10, null, C.tanLit, L);
  // nose: a small rounded triangle of matte brown felt
  g.fillPolygon([L(hx - 3, hy + 0.9), L(hx + 3, hy + 0.9), L(hx + 2.2, hy + 2.6), L(hx, hy + 4.2), L(hx - 2.2, hy + 2.6)], C.nose);
  g.fillPolygon([L(hx - 1.8, hy + 1.1), L(hx + 1.8, hy + 1.1), L(hx, hy + 2)], C.noseHi);
  // bead eyes, close together, high, just above the muzzle; tan brow dots
  for (const s of [-1, 1]) {
    const [ex, ey] = L(hx + s * 3.6, hy - 3);
    g.fillRect(Math.floor(ex) - 1, Math.floor(ey) - 1, 2, 2, 0x050404);
    g.pixel(ex - 1, ey - 1, mix(C.blk, C.glint, p.glint));
    const [bx, by] = L(hx + s * 4.4, hy - 6.2);
    g.fillRect(Math.floor(bx), Math.floor(by), 2, 1, C.tan);
  }
  // the big soft ears hang down either side, past the jaw; they always hang with gravity
  const ears = [[-1, PF.earL], [1, PF.earR]];
  for (const [s, fur] of ears) {
    const [ax, ay] = L(hx + s * 11.5, hy - 5.5);
    // which side of the head the ear is on now (the roll carries it round)
    const [hcx] = L(hx, hy - 5.5);
    const side = clamp((ax - hcx) / 11.5, -1, 1);
    const flop = clamp((0.2 - cos(p.roll)) / 0.6, 0, 1);
    const phi = side * (0.2 + 0.9 * flop + 0.06 * sin(p.t * 1.3 + s)) + p.earSwing * side;
    const ex = ax + 9.6 * sin(phi), ey = ay + 9.6 * cos(phi);
    blob(g, ex + side * 0.8, ey, 5.6, 10.4, -phi, 18, fur, C.blkRim);
    blob(g, ex, ey, 5.2, 10.2, -phi, 18, fur, C.blk);
  }
}

// ------------------------------------------------------------ the panda

const QF = {
  head: furTable(44, 1.5, 21, 'shag'), earL: furTable(20, 1.3, 22, 'shag'), earR: furTable(20, 1.3, 23, 'shag'),
  torso: furTable(40, 1.4, 24, 'shag'), armL: furTable(26, 1.2, 25, 'shag'), armR: furTable(26, 1.2, 26, 'shag'),
  lobe: furTable(18, 0.9, 27, 'shag'), leg: furTable(20, 1.1, 28, 'shag'), foot: furTable(26, 1.2, 29, 'shag'),
  patch: furTable(16, 0.5, 30, 'shag'),
};
// loops of pile drawn as tiny curls, fixed on the head (local coords)
const CURLS = [];
for (let i = 0; i < 26; i++) {
  const a = rand(i, 1, 41) * Math.PI * 2, r = Math.sqrt(rand(i, 2, 41));
  const x = Math.cos(a) * r * 12.5, y = Math.sin(a) * r * 11;
  // keep the face clear
  if (Math.abs(x) < 10 && y > -6 && y < 10) continue;
  CURLS.push([x, y, rand(i, 3, 41) < 0.5 ? 1 : -1]);
}
const BCURLS = [];
for (let i = 0; i < 18; i++) BCURLS.push([(rand(i, 4, 41) - 0.5) * 26, 14 + rand(i, 5, 41) * 18]);

/** The body: legs, torso, heart belly, feet (behind the blanket). */
export function drawPanda(g, q) {
  const X = q.x, Y = q.y, br = q.breath;
  // legs straight out towards us
  for (const s of [-1, 1]) blob(g, X + s * 8, Y + 36.5, 6.2, 5, 0, 20, QF.leg, C.pblk);
  // torso, black: the shoulder band and the sides
  blob(g, X, Y + 23.5 - br * 0.3, 16.5 + br * 0.4, 12.5 + br * 0.4, 0, 40, QF.torso, C.pblk);
  for (const [x, y] of BCURLS) g.pixel(X + x, Y + y, C.pcurl);
  // the cream heart belly
  const hy = Y + 20 - br * 0.2;
  for (const s of [-1, 1]) blob(g, X + s * 5, hy, 5.8 + br * 0.2, 5.4 + br * 0.2, 0, 18, QF.lobe, C.cream);
  g.fillPolygon([[X - 10.6, hy + 1], [X + 10.6, hy + 1], [X + 4, hy + 9], [X, hy + 12.5], [X - 4, hy + 9]], C.cream);
  for (const s of [-1, 1]) g.pixel(X + s * 3, hy + 5, C.creamSh);
  g.pixel(X, hy + 8, C.creamSh);
  // big round black feet, stuck out towards us (under the blanket when it has it)
  for (const s of [-1, 1]) {
    const fx = X + s * 9 + q.shiver, fy = Y + 40.5;
    blob(g, fx, fy, 6.6, 6.4, 0, 26, QF.foot, C.pblkRim);
    blob(g, fx + s * 0.4, fy + 0.5, 6.4, 6.2, 0, 26, QF.foot, C.pblk);
  }
}

/** Arms and head (in front of the blanket). */
export function drawPandaFront(g, q) {
  const X = q.x, Y = q.y;
  // arms hang at its sides like a shawl; when it holds the blanket they hug inwards
  for (const [s, fur] of [[-1, QF.armL], [1, QF.armR]]) {
    const hug = q.hug;
    const ax = X + s * (15.5 - 3.5 * hug), ay = Y + 24 + 3 * hug, rot = s * (-0.12 - 0.55 * hug);
    blob(g, ax, ay, 5.2, 11 - 2 * hug, rot, 26, fur, C.pblkRim);
    blob(g, ax + s * 0.6, ay + 0.4, 5.2, 11 - 2 * hug, rot, 26, fur, C.pblk);
  }
  drawPandaHead(g, q);
}

function drawPandaHead(g, q) {
  const T = frame2(q.x + q.hx, q.y + q.hy, q.tilt);
  // round black shaggy ears on the top corners, moonlit on their tops
  for (const [s, fur] of [[-1, QF.earL], [1, QF.earR]]) {
    blob(g, s * 12.8, -10.8, 5.6, 5.4, 0, 20, fur, C.pblkRim, T);
    blob(g, s * 12.8, -10.2, 5.4, 5.2, 0, 20, fur, C.pblk, T);
  }
  // the big round cream head, frizzy all round
  blob(g, 0, 0.8, 15.2, 12.8, 0, 44, QF.head, C.creamSh, T);
  blob(g, 0, 0, 15, 12.6, 0, 44, QF.head, C.cream, T);
  for (const [x, y, d] of CURLS) {
    const [px, py] = T(x, y);
    g.pixel(px, py, C.creamSh); g.pixel(px + d, py + 1, C.creamSh);
  }
  // slanting teardrop eye patches drooping outward and down from the bridge of the nose
  for (const s of [-1, 1]) {
    g.fillPolygon(teardropPts(s * 2.6, -4.8, s * 7.4, 1.6, 4.3, 14, QF.patch, T), C.pblk);
    const [ex, ey] = T(s * 6.2, 0.6);
    g.pixel(ex, ey, q.eye);
  }
  // small black rounded nose, low in the face
  blob(g, 0, 7.4, 2.7, 1.9, 0, 12, null, C.pblk, T);
  const [mx, my] = T(0, 9.6);
  g.pixel(mx, my, C.creamSh);
}
