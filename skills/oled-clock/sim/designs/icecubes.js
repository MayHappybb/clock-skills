// Icecubes — a glass of soda whose ice is carved into the time.
//
// Four numerals of clear ice float in a tumbler, in real 3D: each is a
// centre-line path thickened into mitred prisms, rotated, projected in
// perspective and z-buffered, so blocks occlude each other and turn their
// faces to the light. Ice on one bit: the face is solid, the outer edge
// bright, the walls clear (only their arrises catch light), the far outline
// seen through the block as a dark line, a double glint sliding across as
// it yaws, and a black moat round every block. The hour floats small at the
// back of the glass, the minutes big in front.
//
// Idle: every block bobs, sways and drifts; the minutes clink; bubbles rise
// in streams off the floor; the candy straw leans, broken at the surface.
// Minute: the changing block melts from :57 (shrinks, thins, rounds, sheds
// meltwater drops and fizz), the last blob dwindles at :00 and the new
// numeral drops in from the top with a crown splash and a fizz burst.
// Hour: a stream pours in from the top right, the soda rises and a head of
// froth domes over the lip and runs down the outside; the new hour blocks
// bob up from below once the minutes have landed.
// Burn-in: kit.orbit walks the whole glass; the panel dims at night.

import { clamp, ease, progress, previousMinute, orbit, noise } from '../js/kit.js';

const W = 128, H = 64, N = W * H;
const TAU = Math.PI * 2;

// ------------------------------------------------------------ glyphs
// Each numeral is a carved block of ice: a centre-line path on a 10 x 14
// grid, thickened into mitred quads (bevels where the turn is sharp), every
// quad a convex piece that is extruded into a prism.

const HW = 1.45;                        // half stroke width, grid units
const L = HW, R = 10 - HW, T = HW, B = 14 - HW, C = 2.0;

const PATHS = {
  0: [{ p: [[L, T + C], [L + C, T], [R - C, T], [R, T + C], [R, B - C], [R - C, B], [L + C, B], [L, B - C]], closed: true }],
  1: [{ p: [[2.3, 4.6], [5.6, T], [5.6, B]] }, { p: [[2.2, B], [8.6, B]] }],
  2: [{ p: [[L, T + C], [L + C, T], [R - C, T], [R, T + C], [R, 5.6], [L, B], [R + 0.2, B]] }],
  3: [{ p: [[L, T + 1.6], [L + C, T], [R - C, T], [R, T + C], [R, 5.3], [R - 1.7, 7], [4.2, 7]] },
      { p: [[R - 1.7, 7], [R, 8.7], [R, B - C], [R - C, B], [L + C, B], [L, B - 1.6]] }],
  4: [{ p: [[5.6, T - 0.6], [L, 9.4], [R + 0.5, 9.4]] }, { p: [[7.0, 5.6], [7.0, B + HW]] }],
  5: [{ p: [[R + 0.2, T], [L, T], [L, 6.2], [R - C, 6.2], [R, 6.2 + C], [R, B - C], [R - C, B], [L - 0.2, B]] }],
  6: [{ p: [[R - 0.2, T], [L + C, T], [L, T + C], [L, B - C], [L + C, B], [R - C, B], [R, B - C], [R, 7 + 2.1], [R - 2.1, 7], [L, 7]] }],
  7: [{ p: [[L - 0.2, T], [R, T], [4.3, B + HW * 0.6]] }],
  8: [{ p: [[L + 0.4, T + 1.7], [L + 2.1, T], [R - 2.1, T], [R - 0.4, T + 1.7], [R - 0.4, 5.3], [R - 2.1, 7], [L + 2.1, 7], [L + 0.4, 5.3]], closed: true },
      { p: [[L, 7 + 2.0], [L + 2.0, 7], [R - 2.0, 7], [R, 7 + 2.0], [R, B - C], [R - C, B], [L + C, B], [L, B - C]], closed: true }],
};
PATHS[9] = PATHS[6].map((s) => ({ ...s, p: s.p.map(([x, y]) => [10 - x, 14 - y]) }));

/** Offset line intersection: the miter point at vertex b between a->b and b->c, on side `sgn`. */
function thicken(path, closed, hw) {
  const P = path, n = P.length;
  const pieces = [];
  const seg = (i) => {
    const a = P[i], b = P[(i + 1) % n];
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy);
    return { a, b, nx: -dy / l, ny: dx / l, dx: dx / l, dy: dy / l };
  };
  const ns = closed ? n : n - 1;
  const S = [];
  for (let i = 0; i < ns; i++) S.push(seg(i));
  // corner points for every segment start/end, left (+n) and right (-n)
  const cs = S.map((s) => ({
    sl: [s.a[0] + s.nx * hw, s.a[1] + s.ny * hw], sr: [s.a[0] - s.nx * hw, s.a[1] - s.ny * hw],
    el: [s.b[0] + s.nx * hw, s.b[1] + s.ny * hw], er: [s.b[0] - s.nx * hw, s.b[1] - s.ny * hw],
  }));
  const joints = [];
  for (let j = 0; j < ns; j++) {
    const i0 = j, i1 = j + 1;
    if (i1 >= ns && !closed) break;
    const s0 = S[i0], s1 = S[i1 % ns];
    const cosT = s0.dx * s1.dx + s0.dy * s1.dy;      // cos of turn
    const half = Math.sqrt(Math.max(0, (1 + cosT) / 2)); // cos(turn/2)
    const mx = s0.nx + s1.nx, my = s0.ny + s1.ny, ml = Math.hypot(mx, my) || 1;
    const v = s0.b;
    if (half > 0.55) {                               // miter
      const k = hw / half;
      const L1 = [v[0] + (mx / ml) * k, v[1] + (my / ml) * k];
      const R1 = [v[0] - (mx / ml) * k, v[1] - (my / ml) * k];
      cs[i0].el = L1; cs[i0].er = R1; cs[i1 % ns].sl = L1; cs[i1 % ns].sr = R1;
    } else {                                         // bevel: fill the outer wedge
      const cross = s0.dx * s1.dy - s0.dy * s1.dx;   // >0: turning toward +n? (y down)
      if (cross > 0) joints.push([v, cs[i0].er, [s1.a[0] - s1.nx * hw, s1.a[1] - s1.ny * hw]]);
      else joints.push([v, [s1.a[0] + s1.nx * hw, s1.a[1] + s1.ny * hw], cs[i0].el]);
    }
  }
  for (const c of cs) pieces.push([c.sl, c.el, c.er, c.sr]);
  return pieces.concat(joints);
}

/** Corner-cut a convex polygon (one Chaikin pass at ratio r): rounding while it melts. */
function chaikin(poly, r) {
  if (r <= 0) return poly;
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    out.push([a[0] + (b[0] - a[0]) * r, a[1] + (b[1] - a[1]) * r]);
    out.push([b[0] + (a[0] - b[0]) * r, b[1] + (a[1] - b[1]) * r]);
  }
  return out;
}

/** Signed area > 0 for every piece, so prism faces wind the same way. */
function orient(q) {
  let a = 0;
  for (let i = 0, j = q.length - 1; i < q.length; j = i++) a += (q[j][0] - q[i][0]) * (q[j][1] + q[i][1]);
  return a < 0 ? q.slice().reverse() : q;
}
function glyphPieces(d, hw = HW) {
  const out = [];
  for (const s of PATHS[d]) for (const q of thicken(s.p, !!s.closed, hw)) out.push(orient(q.map(([x, y]) => [x - 5, y - 7])));
  return out;
}
const GLYPHS = Array.from({ length: 10 }, (_, d) => glyphPieces(d));

// ------------------------------------------------------------ rasteriser

const back = new Int8Array(N);   // which block's back face covers each pixel (seen through the ice)
const zb = new Float32Array(N), fid = new Int32Array(N), dg = new Int8Array(N), kind = new Uint8Array(N);
let nextId = 1;
let bx0 = W, by0 = H, bx1 = 0, by1 = 0;

function resetBuffers() {
  zb.fill(0); fid.fill(0); back.fill(-1); dg.fill(-1); kind.fill(0);
  nextId = 1; bx0 = W; by0 = H; bx1 = 0; by1 = 0;
}

/** Fill a convex screen polygon with a depth plane (1/z affine in screen space). */
function raster(P, iz, id, k, digit) {
  const n = P.length;
  let area = 0;
  for (let i = 0, j = n - 1; i < n; j = i++) area += (P[j][0] - P[i][0]) * (P[j][1] + P[i][1]);
  if (area <= 0.05) return;                          // back-facing or edge-on (winding)
  // depth plane through three well-spread vertices
  const a = P[0], b = P[Math.floor(n / 3)], c = P[Math.floor((2 * n) / 3)];
  const za = iz[0], zb_ = iz[Math.floor(n / 3)], zc = iz[Math.floor((2 * n) / 3)];
  const det = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
  let pa = 0, pb = 0;
  if (Math.abs(det) > 1e-6) {
    pa = ((zb_ - za) * (c[1] - a[1]) - (zc - za) * (b[1] - a[1])) / det;
    pb = ((zc - za) * (b[0] - a[0]) - (zb_ - za) * (c[0] - a[0])) / det;
  }
  let minx = W, miny = H, maxx = -1, maxy = -1;
  for (const p of P) { if (p[0] < minx) minx = p[0]; if (p[0] > maxx) maxx = p[0]; if (p[1] < miny) miny = p[1]; if (p[1] > maxy) maxy = p[1]; }
  const x0 = Math.max(0, Math.floor(minx)), x1 = Math.min(W - 1, Math.ceil(maxx));
  const y0 = Math.max(0, Math.floor(miny)), y1 = Math.min(H - 1, Math.ceil(maxy));
  if (x0 > x1 || y0 > y1) return;
  if (x0 < bx0) bx0 = x0; if (y0 < by0) by0 = y0; if (x1 > bx1) bx1 = x1; if (y1 > by1) by1 = y1;
  for (let y = y0; y <= y1; y++) {
    const py = y + 0.5;
    for (let x = x0; x <= x1; x++) {
      const px = x + 0.5;
      let inside = true;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        // clockwise on screen (y down) after the area test: inside is right of each edge
        if ((P[i][0] - P[j][0]) * (py - P[j][1]) - (P[i][1] - P[j][1]) * (px - P[j][0]) < 0) { inside = false; break; }
      }
      if (!inside) continue;
      const z = za + pa * (px - a[0]) + pb * (py - a[1]);
      const o = y * W + x;
      if (z > zb[o]) { zb[o] = z; fid[o] = id; dg[o] = digit; kind[o] = k; }
    }
  }
}

/** Coverage only, no depth: the back face as seen through the front. */
function rasterBack(P, digit) {
  const n = P.length;
  let minx = W, miny = H, maxx = -1, maxy = -1;
  for (const p of P) { if (p[0] < minx) minx = p[0]; if (p[0] > maxx) maxx = p[0]; if (p[1] < miny) miny = p[1]; if (p[1] > maxy) maxy = p[1]; }
  const x0 = Math.max(0, Math.floor(minx)), x1 = Math.min(W - 1, Math.ceil(maxx));
  const y0 = Math.max(0, Math.floor(miny)), y1 = Math.min(H - 1, Math.ceil(maxy));
  let area = 0;
  for (let i = 0, j = n - 1; i < n; j = i++) area += (P[j][0] - P[i][0]) * (P[j][1] + P[i][1]);
  const sg = area > 0 ? 1 : -1;
  for (let y = y0; y <= y1; y++) {
    const py = y + 0.5;
    for (let x = x0; x <= x1; x++) {
      const px = x + 0.5;
      let inside = true;
      for (let i = 0, j = n - 1; i < n; j = i++)
        if (sg * ((P[i][0] - P[j][0]) * (py - P[j][1]) - (P[i][1] - P[j][1]) * (px - P[j][0])) < 0) { inside = false; break; }
      if (inside) back[y * W + x] = digit;
    }
  }
}

/**
 * One ice numeral into the buffers.
 * cube: { d, x, y, s, yaw, pitch, roll, depth, melt, idx }
 */
function drawIce(cube) {
  const { x: cx, y: cy, s, idx } = cube;
  const bias = cube.bias || 0;
  const melt = cube.melt || 0;
  const depth = (cube.depth ?? 4.2) * (1 - 0.35 * melt);
  const pieces = melt > 0 ? glyphPieces(cube.d, HW * (1 - 0.3 * melt)).map((q) => chaikin(chaikin(q, 0.22 * melt), 0.22 * melt)) : GLYPHS[cube.d];
  const cyw = Math.cos(cube.yaw), syw = Math.sin(cube.yaw);
  const cp = Math.cos(cube.pitch), sp = Math.sin(cube.pitch);
  const cr = Math.cos(cube.roll), sr = Math.sin(cube.roll);
  const D = 34;
  const rot = (X, Y, Z) => {
    // roll (z), pitch (x), yaw (y)
    let x = X * cr - Y * sr, y = X * sr + Y * cr, z = Z;
    const y2 = y * cp - z * sp, z2 = y * sp + z * cp; y = y2; z = z2;
    const x3 = x * cyw + z * syw, z3 = -x * syw + z * cyw;
    return [x3, y, z3];
  };
  const proj = (X, Y, Z) => {
    const [x, y, z] = rot(X, Y, Z);
    const k = D / (D + z);
    return [cx + s * x * k, cy + s * y * k, k - bias];
  };
  const frontId = nextId++, backId = nextId++;
  const zf = -depth / 2, zk = depth / 2;
  for (const q of pieces) {
    const n = q.length;
    const F = [], Fz = [], Bk = [], Bz = [];
    for (const [x, y] of q) {
      const f = proj(x, y, zf); F.push([f[0], f[1]]); Fz.push(f[2]);
      const b = proj(x, y, zk); Bk.push([b[0], b[1]]); Bz.push(b[2]);
    }
    raster(F, Fz, frontId, 1, idx);
    raster(Bk.slice().reverse(), Bz.slice().reverse(), backId, 2, idx);
    rasterBack(Bk, idx);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      raster([F[j], F[i], Bk[i], Bk[j]], [Fz[j], Fz[i], Bz[i], Bz[j]], nextId++, 3, idx);
    }
  }
}

/** Turn the buffers into pixels: white faces, the back seen through as a dark line, wire sides, black moat. */
const seeThrough = new Uint8Array(16);
// a glint per block: a dark double slash across the face that slides as the block turns
const glint = new Float32Array(16 * 3);
function compose(g) {
  const buf = g.buf;
  const x0 = Math.max(0, bx0 - 1), x1 = Math.min(W - 1, bx1 + 1), y0 = Math.max(0, by0 - 1), y1 = Math.min(H - 1, by1 + 1);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const o = y * W + x;
      const f = fid[o];
      if (!f) {
        if ((x > 0 && fid[o - 1]) || (x < W - 1 && fid[o + 1]) || (y > 0 && fid[o - W]) || (y < H - 1 && fid[o + W]) ||
            (x > 0 && y > 0 && fid[o - W - 1]) || (x < W - 1 && y > 0 && fid[o - W + 1]) ||
            (x > 0 && y < H - 1 && fid[o + W - 1]) || (x < W - 1 && y < H - 1 && fid[o + W + 1])) buf[o] = 0;
        continue;
      }
      const d = dg[o], z = zb[o], kf = kind[o];
      let sil = false, behind = false, crease = false, side4 = false, backEdge = false;
      const bo = back[o] === d && seeThrough[d];
      for (let k = 0; k < 8; k++) {
        const xx = x + DX8[k], yy = y + DY8[k];
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) { if (k < 4) sil = true; continue; }
        const q = yy * W + xx;
        if (!fid[q]) { if (k < 4) sil = true; continue; }
        if (dg[q] !== d) { if (zb[q] > z) behind = true; else if (k < 4) sil = true; continue; }
        if (k < 4) {
          if (fid[q] !== f) crease = true;
          if (kind[q] !== 1) side4 = true;
          if (bo && back[q] !== d) backEdge = true;
        }
      }
      let lit;
      if (behind) lit = 0;                       // moat where a nearer block passes in front
      else if (sil) lit = 1;                     // bright outer edge
      else if (kf === 1) {
        // the face, with the block's far outline seen through the clear ice as a dark line
        lit = backEdge && !side4 ? 0 : 1;
        if (lit && seeThrough[d]) {
          const gv = (x + 0.5 - glint[d * 3]) + 0.75 * (y + 0.5 - glint[d * 3 + 1]) - glint[d * 3 + 2];
          if (!side4 && ((gv > 0 && gv < 1.1) || (gv > 2.6 && gv < 3.4))) lit = 0;
        }
      }
      else lit = crease ? 1 : 0;                 // clear walls: only their edges catch light
      buf[o] = lit;
    }
  }
}
const DX8 = [1, -1, 0, 0, 1, 1, -1, -1], DY8 = [0, 0, 1, -1, 1, -1, 1, -1];

/** Darken one row across a block where the soda's surface cuts it. */
function waterline(g, idx, y, xa, xb) {
  y = Math.round(y);
  if (y < 0 || y >= H) return;
  for (let x = Math.max(0, Math.floor(xa)); x <= Math.min(W - 1, Math.ceil(xb)); x++) {
    const o = y * W + x;
    if (fid[o] && dg[o] === idx && kind[o] === 1) g.buf[o] = 0;
  }
}

// ------------------------------------------------------------ the glass

const CXG = 63;                        // glass axis
const RIM_Y = 5, RIM_RX = 41, RIM_RY = 4;
const FLOOR_Y = 54, BOT_Y = 60, BOT_RX = 34;
const L0 = 19;                          // the soda's resting level
const wallX = (y, side) => CXG + side * (RIM_RX + (BOT_RX - RIM_RX) * (y - RIM_Y) / (BOT_Y - RIM_Y));

/** Ellipse outline from angle a0 to a1 (0 = right, PI/2 = front/bottom). */
function ellArc(g, cx, cy, rx, ry, a0, a1, c = 1) {
  const n = Math.max(8, Math.ceil((a1 - a0) * Math.max(rx, ry)));
  let px = null, py = null;
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    const x = Math.round(cx + rx * Math.cos(a) - 0.5), y = Math.round(cy + ry * Math.sin(a) - 0.5);
    if (px !== null && (x !== px || y !== py)) g.line(px, py, x, y, c);
    else g.pixel(x, y, c);
    px = x; py = y;
  }
}

function bubble(g, x, y, r) {
  x = Math.round(x); y = Math.round(y);
  r = Math.max(2, Math.round(r));
  g.fillCircle(x + 0.5, y + 0.5, r - 0.6, 0); g.circle(x, y, r);
}

function drawGlass(g, ox, oy, level, foamTop) {
  const lx0 = wallX(RIM_Y, -1) + ox, rx0 = wallX(RIM_Y, 1) + ox;
  const lx1 = wallX(BOT_Y, -1) + ox, rx1 = wallX(BOT_Y, 1) + ox;
  // walls
  g.line(Math.round(lx0), RIM_Y + oy, Math.round(lx1), BOT_Y + oy);
  g.line(Math.round(rx0) - 1, RIM_Y + oy, Math.round(rx1) - 1, BOT_Y + oy);
  // rim, both lips
  ellArc(g, CXG + ox, RIM_Y + oy, RIM_RX, RIM_RY, 0, TAU);
  // thick base: the floor inside, and the bottom
  ellArc(g, CXG + ox, FLOOR_Y + oy, BOT_RX - 1.5, 2.5, 0, Math.PI);
  ellArc(g, CXG + ox, BOT_Y + oy, BOT_RX, 3, 0.15, Math.PI - 0.15);
  // highlights on the glass: a long streak down the right wall, behind the minutes' moat
  g.thickLine(rx0 - 4.5, RIM_Y + 7 + oy, rx1 - 4.2, FLOOR_Y - 6 + oy, 2);
  // the base's glint
  g.line(Math.round(CXG + ox - 16), BOT_Y + oy - 2, Math.round(CXG + ox - 8), BOT_Y + oy - 2);
}

// ------------------------------------------------------------ motion helpers

/** Damped oscillation after an impact at t=0: starts at 0 with speed v (px/s). */
function ring(t, v, w, z) {
  if (t < 0) return 0;
  const wd = w * Math.sqrt(1 - z * z);
  return (v / wd) * Math.exp(-z * w * t) * Math.sin(wd * t);
}
const hash = (a, b = 0) => noise(a * 1.37 + b * 7.91, b);

// rest pose of the four blocks: hours small at the back left, minutes big in front
const SLOTS = [
  { x: 38, y: 17, s: 1.3, bias: 0.6 },
  { x: 52, y: 16, s: 1.3, bias: 0.6 },
  { x: 72.5, y: 38, s: 1.75, bias: 0 },
  { x: 91.5, y: 37, s: 1.75, bias: 0 },
];

export default {
  name: 'Icecubes',
  blurb: 'A glass of soda whose ice is carved into the time: the hour bobs at the back, the minutes in front; each minute the old numeral melts away and a new one is dropped in with a splash, and on the hour the glass is topped up until the foam spills over.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,

  frame(g, ctx) {
    const { oled, fields: f, date } = ctx;
    oled.contrast(Math.round(207 + (40 - 207) * ctx.night));
    const [ox, oy] = orbit(date, 2, 3);
    const T = date.getTime() / 1000;           // wall seconds: all motion from the clock
    const sec = f.sec;
    const prev = previousMinute(date);
    const prevDigits = [prev.hh[0], prev.hh[1], prev.mm[0], prev.mm[1]].map(Number);
    const nowDigits = [f.hh[0], f.hh[1], f.mm[0], f.mm[1]].map(Number);
    // the next minute, for the melt that starts before the turn
    const next = ctx.kit.clockFields(new Date(date.getTime() + 60000));
    const nextDigits = [next.hh[0], next.hh[1], next.mm[0], next.mm[1]].map(Number);
    const hourNext = next.m === 0, hourNow = f.m === 0;

    // ---- refill on the hour: bottle in at :57, pour :58-:01.6, out by :03
    const hs = hourNow ? sec : hourNext ? sec - 60 : 99;     // seconds from the hour
    const rise = hs < 20 ? ease.inOutQuad(progress(hs, -1.8, 0.2)) * (1 - ease.inOutQuad(progress(hs, 2.5, 6.0))) : 0;
    const level = L0 - 5 * rise;
    const foam = hs < 20 ? ease.outCubic(progress(hs, -1.6, 0.6)) * (1 - ease.inOutQuad(progress(hs, 2.0, 5.0))) : 0;
    const spill = hs < 20 ? progress(hs, -0.2, 3.2) : 0;

    // ---- blocks
    const cubes = [];
    const fx = [];                                 // splash and fizz to draw
    for (let i = 0; i < 4; i++) {
      const sl = SLOTS[i];
      const ph = i * 1.9 + 0.7;
      // idle: bob, sway, slow turn so the faces catch the light
      let x = sl.x + ox, y = sl.y + oy + (level - L0) * (i < 2 ? 1.0 : 0.8);
      y += 0.8 * Math.sin(T * 1.3 + ph) + 0.4 * Math.sin(T * 0.53 + ph * 2);
      x += 1.8 * Math.sin(T * 0.105 + ph * 3.1);         // a slow drift round the glass
      let yaw = 0.26 * Math.sin(T * 0.31 + ph) + 0.08 * Math.sin(T * 0.77 + ph * 1.3);
      let pitch = 0.14 + 0.07 * Math.sin(T * 0.43 + ph * 0.7);
      let roll = 0.07 * Math.sin(T * 0.61 + ph);
      // the two minute blocks drift together and clink every ~7 s
      if (i >= 2) {
        const c = Math.cos(T * 0.9);
        x += (i === 2 ? 1 : -1) * 1.3 * (c - 1) * -0.5 * -1;
      }
      let d = nowDigits[i], melt = 0, scale = 1, hidden = false;
      // melt of a block whose digit is about to change
      if (nextDigits[i] !== nowDigits[i] && sec > 57.0) {
        melt = ease.inOutQuad(progress(sec, 57.0, 59.95)) * 0.9;
        scale = 1 - 0.35 * melt;
        y += 3 * melt;
        // meltwater: drops gather at its lowest corner, fall and ring the surface
        for (let k = 0; k < 3; k++) {
          const a = sec - 57.3 - k * 0.8;
          if (a < 0 || a > 0.8) continue;
          const dx = (hash(k, i + 20) - 0.5) * 10 * sl.s * scale;
          const y0 = y + 7 * sl.s * scale - 2;
          const grow = Math.min(1, a / 0.35), fall = Math.max(0, a - 0.35);
          fx.push({ drip: 1, x: x + dx, y: y0 + 1.5 * grow + 110 * fall * fall, r: grow });
        }
        // fizz streaming off it
        for (let k = 0; k < 2; k++) {
          const a = ((sec - 57 + k * 0.45) % 0.9);
          fx.push({ b: 1, x: x + (hash(k, i) - 0.5) * 14 * sl.s * scale, y: y + 6 * sl.s - a * 30, r: 1 });
        }
      }
      // a new block: the old blob dwindles, the new one drops in (minutes) or bobs up (hours on the hour)
      if (prevDigits[i] !== nowDigits[i] && sec < 4.5) {
        const old = 1 - ease.inQuad(progress(sec, 0, 0.32));
        if (old > 0) cubes.push({ d: prevDigits[i], x, y: y + 3.2 + 2 * (1 - old), s: sl.s * 0.65 * old, yaw, pitch, roll, idx: 4 + i, melt: 0.92, bias: sl.bias });
        const fromBelow = hourNow && i < 2;
        if (fromBelow) {
          // buoyancy: rises from the floor and breaks the surface
          // waits until the minutes have landed, so the four never pass level with each other
          const t0 = 0.4, u = progress(sec, t0, t0 + 0.6);
          if (sec < t0) hidden = true;
          else if (sec < t0 + 0.6) y += (1 - ease.outQuad(u)) * 13;
          else y += ring(sec - t0 - 0.6, -26, 8, 0.3);
          yaw += (1 - ease.outCubic(progress(sec, t0, t0 + 1.4))) * 0.5 * (i ? -1 : 1);
          if (sec > t0 + 0.5 && sec < t0 + 1.3) fx.push({ splash: 1, x, y: level + oy, t: sec - t0 - 0.5, n: 4, small: 1 });
        } else {
          // gravity from above the screen, then a plunge and a damped bob
          const tFall = 0.36, y0 = -4 - sl.s * 7;
          if (sec < tFall) {
            const u = sec / tFall;
            y = y0 + (y - y0) * u * u;
            pitch += (1 - u) * 0.25;
          } else {
            y += ring(sec - tFall, 46, 10, 0.32);
            if (sec < tFall + 1.4) fx.push({ splash: 1, x, y: level + oy + (i >= 2 ? 3.5 : 0), t: sec - tFall, n: i >= 2 ? 5 : 4 });
          }
          yaw += (1 - ease.outCubic(progress(sec, 0, 1.6))) * 0.35 * (i % 2 ? -1 : 1);
          roll += (1 - ease.outCubic(progress(sec, 0, 1.4))) * 0.18 * (i % 2 ? 1 : -1);
        }
        // fizz burst
        if (sec > 0.3 && sec < 3) for (let k = 0; k < 4; k++) {
          const a = sec - 0.3 - k * 0.12;
          if (a > 0 && a < 1.6) fx.push({ b: 1, x: x + (hash(k, i + 9) - 0.5) * 22 + Math.sin(a * 7 + k) * 1.2, y: y + 10 + hash(k, i + 3) * 8 - a * 28, r: a > 0.6 ? 2 : 1 });
        }
      }
      if (!hidden) cubes.push({ d, x, y, s: sl.s * scale, yaw, pitch, roll, idx: i, melt, bias: sl.bias });
    }

    // ---- background: glass, straw, bubbles, surface
    drawGlass(g, ox, oy, level);
    const ly = level + oy;
    // the surface of the soda
    {
      const rx = (wallX(level, 1) - wallX(level, -1)) / 2 - 1;
      const wob = 0.3 * Math.sin(T * 2.1);
      ellArc(g, CXG + ox, ly + wob, rx, 3, 0, Math.PI);
    }
    // bubbles: streams off nucleation sites on the floor, accelerating up, wobbling, popping at the top
    for (let j = 0; j < 5; j++) {
      const bx = 34 + j * 13.5 + hash(j, 2) * 4 + ox, per = 1.3 + hash(j, 5) * 1.1, phase = hash(j, 8) * per;
      for (let k = 0; k < 4; k++) {
        const a = ((T - phase) % per + per) % per + k * per;
        const y = FLOOR_Y - 2 + oy - (5 * a + 6 * a * a);
        if (y < ly + 2) { if (y > ly - 1) fx.push({ pop: 1, x: bx, y: ly }); break; }
        const x = bx + 1.2 * Math.sin(a * 5 + j) * Math.min(1, a);
        bubble(g, x, y, a > 1.1 ? 2 : 1);
      }
    }
    // foam head on a refill: packed rings of froth that climb past the lip and dome over it
    if (foam > 0.01) {
      const top = ly - foam * 15;
      const cx = CXG + ox;
      const halfAt = (y) => y - oy < RIM_Y ? RIM_RX + 1 - (RIM_Y - (y - oy)) * 1.5 : (wallX(y - oy, 1) - wallX(y - oy, -1)) / 2 - 1;
      const domeTop = (x) => top + 4 * ((x - cx) / (RIM_RX + 2)) ** 2;
      g.fillWhere((px, py) => py > domeTop(px) - 3 && py < ly + 3 && Math.abs(px - cx) < halfAt(py) + 1, 0,
        [cx - RIM_RX - 4, top - 4, 2 * RIM_RX + 8, ly + 8 - top]);
      // two rows of froth on the dome: big bubbles on the crown, smaller ones tucked under
      for (let r = 0; r < 2; r++) {
        const yy0 = top + r * 4.6, rr = r ? 2 : 3, step = r ? 5.4 : 6.6;
        if (yy0 > ly) break;
        const half = halfAt(yy0) - rr - 0.5;
        const off = r * 3.3 + Math.sin(T * 1.4 + r * 2) * 0.7;
        for (let xx = -half + off; xx <= half + 0.01; xx += step) {
          const yy = yy0 + 4 * (xx / (RIM_RX + 2)) ** 2 + Math.sin(T * 2.2 + xx) * 0.35;
          if (yy > ly + 1) continue;
          bubble(g, cx + xx, yy, rr);
        }
      }
    }
    if (spill > 0 && spill < 1) {
      for (let k = 0; k < 2; k++) {
        const side = k ? 1 : -1, delay = k ? 0.12 : 0;
        const u = clamp((spill - delay) / (1 - delay), 0, 1);
        if (u <= 0) continue;
        const len = ease.outQuad(u) * (k ? 26 : 20);
        const yTop = RIM_Y + 1 + len * progress(u, 0.7, 1), yEnd = RIM_Y + 1 + len;
        const xAt = (y) => wallX(y, side) + side * 2.2 + ox;
        for (let y = Math.round(yTop); y <= yEnd; y++) g.fillRect(Math.round(xAt(y) - 1), y + oy, 2, 1, 1);
        g.fillCircle(xAt(yEnd), yEnd + oy + 1, 1.7, 1);
      }
    }

    // straw: from the floor, leaning out over the left lip; broken where it enters the soda
    {
      const sway = 0.5 * Math.sin(T * 0.7);
      const topX = 11 + ox + sway, topY = -6 + oy;
      const botX = 41 + ox, botY = FLOOR_Y - 1 + oy;
      const uS = (ly - topY) / (botY - topY), inX = topX + (botX - topX) * uS;
      for (const [ax, ay, bx, by, sh] of [[topX, topY, inX, ly, 0], [inX + 2, ly, botX + 2, botY, 2]]) {
        const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy), nx = -dy / l, ny = dx / l;
        const hw = 2.4;
        g.fillWhere((px, py) => {
          const u = ((px - ax) * dx + (py - ay) * dy) / l, v = (px - ax) * nx + (py - ay) * ny;
          if (u < 0 || u > l || Math.abs(v) > hw) return false;
          if (Math.abs(v) > hw - 0.9) return true;                    // the tube's two walls
          return ((u - v * 0.8 + (sh ? 2 : 0)) % 6 + 6) % 6 < 3;      // candy stripes between them
        }, 1, [Math.min(ax, bx) - 4, Math.min(ay, by) - 4, Math.abs(dx) + 8, Math.abs(dy) + 8]);
        g.fillWhere((px, py) => {
          const u = ((px - ax) * dx + (py - ay) * dy) / l, v = (px - ax) * nx + (py - ay) * ny;
          return u >= 0 && u <= l && Math.abs(v) <= hw + 1 && Math.abs(v) > hw;
        }, 0, [Math.min(ax, bx) - 5, Math.min(ay, by) - 5, Math.abs(dx) + 10, Math.abs(dy) + 10]);
      }
    }
    // the pour runs behind the ice: the blocks' moats cut it
    if (hs > -2.2 && hs < 2.4) drawPour(g, ox, oy, { head: progress(hs, -2.1, -1.6), tail: progress(hs, 1.6, 2.2) }, ly, T);
    // fizz behind the ice: the blocks' moats keep them off the numerals
    for (const e of fx) if (e.b && e.y > ly + 2 && e.y < FLOOR_Y + oy - 2) bubble(g, e.x, e.y, e.r);

    // splashes, drips: behind the ice, so the blocks' moats keep them off the numerals
    for (const e of fx) {
      if (e.drip) {
        if (e.y < FLOOR_Y + oy - 2) { g.fillRect(Math.round(e.x - 0.5), Math.round(e.y - 0.5), e.r > 0.6 ? 2 : 1, 2, 1); }
      }
      else if (e.pop) { /* a bubble breaking the surface: the ring itself is enough */ }
      else if (e.splash) {
        // crown: drops thrown up and out, falling back under gravity
        for (let k = 0; k < e.n; k++) {
          const vx = ((k + 0.5) / e.n - 0.5) * (e.small ? 40 : 60), vy = -(e.small ? 30 : 40) - (k % 2 ? 35 : 0) - hash(k, 77) * 15;
          const px = e.x + vx * e.t, py = e.y + vy * e.t + 130 * e.t * e.t;
          if (py > e.y + 1 || e.t <= 0) continue;
          g.fillCircle(px, py, 1.1, 0);
          g.fillRect(Math.round(px - 0.5), Math.round(py - 0.5), 2, 2);
        }
        // a ring running out over the surface
        if (e.t < 0.9) {
          const r = 4 + e.t * 22;
          const lim = (wallX(e.y - oy, 1) - wallX(e.y - oy, -1)) / 2 - 3;
          g.clip(Math.round(CXG + ox - lim), 0, Math.round(2 * lim), H);
          ellArc(g, e.x, e.y, r, r * 0.22, 0.2, Math.PI - 0.2);
          g.unclip();
        }
      }
    }
    // ---- the ice
    resetBuffers();
    for (const c of cubes) {
      drawIce(c);
      seeThrough[c.idx] = c.melt || c.s < 1.5 ? 0 : 1;
      glint[c.idx * 3] = c.x; glint[c.idx * 3 + 1] = c.y; glint[c.idx * 3 + 2] = (c.yaw + 0.05 * c.idx) * 70 - 4;
    }
    compose(g);

    // ---- in front: splashes, pops, clink, the bottle
    // clink: when the minute blocks touch, a tick of light between them
    {
      const c = Math.cos(T * 0.9);
      if (c > 0.985) {
        const cx = (cubes.find((q) => q.idx === 2).x + cubes.find((q) => q.idx === 3).x) / 2;
        const cy = SLOTS[2].y + oy - 14 + (level - L0) * 0.8;
        const a = (c - 0.985) / 0.015;
        const r0 = 2, r1 = 2 + 3 * a;
        for (const [dx, dy] of [[0, -1], [-0.8, -0.6], [0.8, -0.6]]) g.line(Math.round(cx + dx * r0), Math.round(cy + dy * r0), Math.round(cx + dx * r1), Math.round(cy + dy * r1));
      }
    }
    // the bottle on the hour
  },
};

/** The pour: a thick stream arcing in from the top right, landing between the blocks. */
function drawPour(g, ox, oy, k, ly, T) {
  // the stream's head runs down as the pour starts, its tail follows as it stops
  const x0 = 131, y0 = -1, x1 = 75 + ox, y1 = ly;
  const P = (u) => [x0 + (x1 - x0) * u, y0 + (y1 - y0) * u * u + oy * u];
  const head = clamp(k.head, 0, 1), tail = clamp(k.tail, 0, 1);
  if (head <= tail) return;
  for (let i = 0; i <= 60; i++) {
    const u = tail + (head - tail) * (i / 60);
    const [x, y] = P(u);
    const w = 1.6 + 0.5 * Math.sin(u * 30 - T * 20);
    g.fillCircle(x, y, w + 1, 0);
  }
  for (let i = 0; i <= 60; i++) {
    const u = tail + (head - tail) * (i / 60);
    const [x, y] = P(u);
    const w = 1.6 + 0.5 * Math.sin(u * 30 - T * 20);
    g.fillCircle(x, y, w, 1);
  }
}

export function iceSpecimen(g, cubes) {
  resetBuffers();
  for (const c of cubes) { drawIce(c); seeThrough[c.idx] = c.melt ? 0 : 1; }
  compose(g);
}
