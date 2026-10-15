// VHS cast: the instructors (whose bodies are the numerals) and the class,
// their routine, and how each is drawn (vhs.js).
//
// The routine is counted the aerobics way: two counts a second, moves in
// phrases of eight counts. Every count each body snaps to its next key pose
// in the first 45 % of the beat and holds (the "and ONE" of a taped class):
// arms (shoulder and elbow angles), legs (spread and knee lift), and the body
// itself, which hops, sways, leans (a shear of the numeral) and squashes on
// the landing. The class does the same moves half a count late.
import { sin, cos, to565 } from '../js/kit.js';
import { SDF, SW, SH, M, GW, GH, BELT0, BELT1, NECK, HIP, HIPW, SHOULDER } from './vhs-glyphs.js';
import { W, H, INK, SHOE, SHOE_D, mixc } from './vhs-art.js';

const D2R = Math.PI / 180;
export const SLANT = 0.1;
export const GROOVE = 4;          // px of side-to-side rock under every move            // the font's italic: px of lean per glyph row

// ------------------------------------------------------------ key poses

// No arm ever reaches sideways at shoulder height: the gap between partners is 13 px, and a level
// arm bridging two numerals would read as a stroke of one of them (a 1 with an arm in it reads 7).
const A = { dn: [14, 4], hip: [46, -80], V: [148, 0], up: [168, 2], curl: [24, 128], gp: [120, 60], clap: [156, 32], pump: [32, 104] };
const LG = { tog: [3, 0], wide: [15, 0], knee: [5, 1], kick: [54, 0], hi: [70, 0], heel: [3, -1], step: [10, 0] };
const K = (aL, aR, lL, lR, b = {}) => ({ aL: A[aL], aR: A[aR], lL: LG[lL], lR: LG[lR], hop: b.hop ?? 0, sway: b.sway ?? 0, lean: b.lean ?? 0, bob: b.bob ?? 1.8, reach: b.reach ?? 0 });

export const MOVES = {
  jacks: [K('V', 'V', 'wide', 'wide', { hop: 3 }), K('dn', 'dn', 'tog', 'tog', { hop: 3 })],
  march: [K('dn', 'curl', 'knee', 'tog', { bob: 2 }), K('curl', 'dn', 'tog', 'knee', { bob: 2 })],
  step: [K('gp', 'gp', 'step', 'tog', { sway: -2 }), K('clap', 'clap', 'tog', 'step', { sway: 2 })],
  reach: [K('hip', 'up', 'wide', 'wide', { lean: -1.6, sway: -1 }), K('hip', 'up', 'wide', 'wide', { lean: -1.8, sway: -1, bob: 2 }),
    K('up', 'hip', 'wide', 'wide', { lean: 1.6, sway: 1 }), K('up', 'hip', 'wide', 'wide', { lean: 1.8, sway: 1, bob: 2 })],
  kick: [K('gp', 'gp', 'kick', 'tog', { hop: 1 }), K('V', 'V', 'tog', 'tog'), K('gp', 'gp', 'tog', 'kick', { hop: 1 }), K('V', 'V', 'tog', 'tog')],
  punch: [K('up', 'pump', 'step', 'tog', { sway: -1 }), K('pump', 'up', 'tog', 'step', { sway: 1 })],
  goal: [K('gp', 'gp', 'knee', 'tog'), K('up', 'up', 'tog', 'tog', { reach: 1 }), K('gp', 'gp', 'tog', 'knee'), K('up', 'up', 'tog', 'tog', { reach: 1 })],
  ham: [K('V', 'V', 'heel', 'tog', { sway: 1 }), K('curl', 'curl', 'tog', 'tog'), K('V', 'V', 'tog', 'heel', { sway: -1 }), K('curl', 'curl', 'tog', 'tog')],
  // the hour's cool-down: slow, held stretches (each key held two counts)
  cool: [K('up', 'up', 'tog', 'tog', { reach: 1.4, bob: 0 }), K('up', 'up', 'tog', 'tog', { reach: 1.4, bob: 0 }),
    K('hip', 'up', 'wide', 'wide', { lean: -2.6, sway: -1, bob: 0 }), K('hip', 'up', 'wide', 'wide', { lean: -2.6, sway: -1, bob: 0 }),
    K('V', 'V', 'wide', 'wide', { bob: 0 }), K('V', 'V', 'wide', 'wide', { bob: 0 }),
    K('up', 'hip', 'wide', 'wide', { lean: 2.6, sway: 1, bob: 0 }), K('up', 'hip', 'wide', 'wide', { lean: 2.6, sway: 1, bob: 0 })],
  // flourishes
  kickline: [K('V', 'V', 'tog', 'tog'), K('gp', 'gp', 'hi', 'tog', { hop: 1 }), K('V', 'V', 'tog', 'tog'), K('gp', 'gp', 'tog', 'hi', { hop: 1 })],
  jazz: [K('V', 'V', 'wide', 'wide', { hop: 3, reach: 1 }), K('V', 'V', 'wide', 'wide', { reach: 1 })],
  jog: [K('pump', 'curl', 'knee', 'tog', { bob: 2 }), K('curl', 'pump', 'tog', 'knee', { bob: 2 })],
};
export const ROUTINE = ['jacks', 'march', 'step', 'reach', 'kick', 'punch', 'goal', 'ham'];

/** The pose of one body: plain numbers, one object reused per performer (monomorphic). */
export function newPose() {
  return { aL1: 0, aL2: 0, aR1: 0, aR2: 0, lLa: 0, lLl: 0, lRa: 0, lRl: 0, hop: 0, sway: 0, lean: 0, sq: 1, reach: 0, pony: 0, mouth: 0 };
}

const outC = (u) => 1 - (1 - u) * (1 - u) * (1 - u);
const sm = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

/**
 * Fill `P` with move `name` at count `c` (integer, any) and beat phase `p`
 * (0..1). `slow` holds each key over two counts with a gentle ease.
 */
export function perform(P, name, c, p, prevName = name, slow = false) {
  const keys = MOVES[name], n = keys.length, pk = MOVES[prevName], pn = pk.length;
  const b = keys[((c % n) + n) % n], a = pk[(((c - 1) % pn) + pn) % pn];
  const e = slow ? sm(p) : outC(Math.min(1, p / 0.45));
  const L = (x, y) => x + (y - x) * e;
  P.aL1 = L(a.aL[0], b.aL[0]); P.aL2 = L(a.aL[1], b.aL[1]);
  P.aR1 = L(a.aR[0], b.aR[0]); P.aR2 = L(a.aR[1], b.aR[1]);
  P.lLa = L(a.lL[0], b.lL[0]); P.lLl = L(a.lL[1], b.lL[1]);
  P.lRa = L(a.lR[0], b.lR[0]); P.lRl = L(a.lR[1], b.lR[1]);
  P.sway = L(a.sway, b.sway); P.lean = L(a.lean, b.lean); P.reach = L(a.reach, b.reach);
  // the beat in the body: a hop through the count, or a dip on it, and a squash on landing
  const hp = Math.min(1, p / 0.5);
  P.hop = b.hop > 0 ? b.hop * sin(Math.PI * hp) : 0;
  const land = b.hop > 0 ? (p >= 0.5 && p < 0.68 ? 1 - (p - 0.5) / 0.18 : 0) : (p < 0.2 ? 1 - p / 0.2 : 0);
  P.sq = 1 - (b.hop > 0 ? 0.06 : 0.035 * b.bob) * land + 0.03 * P.reach;
  P.hop -= b.hop > 0 ? 0 : b.bob * land;
  // the groove under every move: the whole body rocks side to side over two counts
  if (!slow) P.sway += GROOVE * sin(Math.PI * (c + p - 0.5));
  P.pony = sin(Math.PI * (c + p)) * (0.6 + 0.4 * (b.hop > 0 ? 1 : 0));
  P.mouth = p < 0.3 ? 1 : 0;
  return P;
}

// ------------------------------------------------------------ an instructor

/** The colours of one costume, faded `f` (0..1) towards the set `bg`; 565 values and 0xRRGGBB. */
export function paint(cos, f, bg) {
  const m = (c) => (f > 0 ? mixc(c, bg, f) : c);
  const o = { top: m(cos.top), belt: m(cos.belt), tights: m(mixc(cos.skin, cos.tights, 0.18)), warm: m(cos.warm), rib: m(cos.rib), hair: m(cos.hair), skin: m(cos.skin), ink: m(INK), shoe: m(SHOE), shoeD: m(SHOE_D), style: cos.style };
  o.top5 = to565(o.top); o.belt5 = to565(o.belt); o.tights5 = to565(o.tights); o.ink5 = to565(o.ink);
  return o;
}

/**
 * The body: the numeral's distance field under the pose, hard pixels, no
 * keyline (on the dark cyc the tape's own soft edge and colour fringe are
 * the outline).
 * (cx, by): centre and bottom of the glyph on screen; sc: scale;
 * the italic and the lean shear the rows; sq squashes.
 */
function body(g, d, cx, by, sc, sq, kt, C) {
  const f = SDF[d], buf = g.buf, sx = sc * (1 + (1 - sq) * 0.7), sy = sc * sq;
  const top = by - GH * sy, hw = (GW / 2 + M) * sx + Math.abs(kt) * 18 * sy + 2;
  const y0 = Math.max(0, Math.floor(top - M * sy)), y1 = Math.min(H, Math.ceil(by + M * sy));
  const x0 = Math.max(0, Math.floor(cx - hw)), x1 = Math.min(W, Math.ceil(cx + hw));
  const isx = 1 / sx, top5 = C.top5, belt5 = C.belt5;
  let n = 0;
  for (let y = y0; y < y1; y++) {
    const v = GH - (by - (y + 0.5)) / sy;
    const gj = v + M;
    if (gj < 0 || gj >= SH - 1) continue;
    const j = gj | 0, fy = gj - j, row = j * SW;
    const col = v < BELT0 || v >= BELT1 ? top5 : belt5;
    const shx = cx + kt * (18 - v) * sy;
    for (let x = x0; x < x1; x++) {
      const gi = GW / 2 + (x + 0.5 - shx) * isx + M;
      if (gi < 0 || gi >= SW - 1) continue;
      const i = gi | 0, fx = gi - i, k = row + i;
      const a = f[k] + (f[k + 1] - f[k]) * fx, b = f[k + SW] + (f[k + SW + 1] - f[k + SW]) * fx;
      const dd = (a + (b - a) * fy) * 0.125;
      n++;
      if (dd <= 0) buf[y * W + x] = col;
    }
  }
  g.cost.box += n * 9;
}

/** Glyph point (u, v) to screen, under the same transform as body(). */
function gx(u, v, cx, sc, sq, kt) { const sx = sc * (1 + (1 - sq) * 0.7), sy = sc * sq; return cx + (u - GW / 2) * sx + kt * (18 - v) * sy; }
function gy(v, by, sc, sq) { return by - (GH - v) * sc * sq; }

const UA = 6, FA = 6, TH = 5.2, SH_ = 5.2;    // upper arm, forearm, thigh, shin (px at scale 1)

function arm(g, x, y, side, a1, a2, sc, C) {
  const r1 = a1 * D2R, r2 = (a1 + a2) * D2R;
  const ex = x + side * UA * sc * sin(r1), ey = y + UA * sc * cos(r1);
  const hx = ex + side * FA * sc * sin(r2), hy = ey + FA * sc * cos(r2);
  const w = Math.max(1.2, 2.5 * sc);
  g.thickLine(x, y, ex, ey, w, C.skin);
  g.thickLine(ex, ey, hx, hy, w, C.skin);
  // wristband
  if (sc > 0.6) g.thickLine(ex + (hx - ex) * 0.62, ey + (hy - ey) * 0.62, ex + (hx - ex) * 0.86, ey + (hy - ey) * 0.86, w + 0.9, C.belt);
  g.fillCircle(hx, hy, Math.max(0.8, 1.5 * sc), C.skin);
}

function leg(g, x, y, side, ang, lift, sc, C) {
  const r = ang * D2R, up = lift > 0 ? lift : 0, heel = lift < 0 ? -lift : 0;
  const kx = x + side * TH * sc * sin(r), ky = y + TH * sc * cos(r) * (1 - 0.72 * up);
  const sl = SH_ * sc * (1 - 0.62 * heel);
  const fx = kx + side * sl * sin(r) * (1 - up), fy = ky + sl * (up > 0 ? 1 : cos(r));
  const w = Math.max(1.3, 3 * sc), ww = Math.max(2, 4.6 * sc);
  g.thickLine(x, y, kx, ky, w, C.tights);
  // the scrunched leg warmer over the lower shin, with two ribs
  const wx0 = kx + (fx - kx) * 0.3, wy0 = ky + (fy - ky) * 0.3;
  g.thickLine(kx, ky, wx0, wy0, w, C.tights);
  g.thickLine(wx0, wy0, fx, fy, ww, C.warm);
  if (sc > 0.6) for (const q of [0.5, 0.78]) g.fillRect(Math.round(kx + (fx - kx) * q - ww / 2), Math.round(ky + (fy - ky) * q), Math.round(ww), 1, C.rib);
  // the high-top: toe out
  const shw = Math.round(6 * sc), sx0 = Math.round(fx - shw / 2 + side * sc * 1.2);
  g.fillRect(sx0, Math.round(fy - 0.5), shw, Math.max(1, Math.round(2.4 * sc)), C.shoe);
  if (sc > 0.6) g.fillRect(sx0, Math.round(fy - 0.5) + 2, shw, 1, C.shoeD);
}

function head(g, x, y, sc, C, P, i) {
  const r = 3.7 * sc;
  const hc = C.hair;
  // hair behind the face
  if (C.style === 'perm') {
    g.fillCircle(x, y - 1.2 * sc, 4.9 * sc, hc);
    g.fillCircle(x - 3.9 * sc, y + 0.6 * sc, 2.4 * sc, hc);
    g.fillCircle(x + 3.9 * sc, y + 0.6 * sc, 2.4 * sc, hc);
  } else if (C.style === 'pony') {
    g.fillCircle(x, y - 0.8 * sc, 4.6 * sc, hc);
    const a = 1.9 + 0.55 * P.pony;                      // the ponytail swings on the beat
    const px = x + 3.4 * sc, py = y - 3.6 * sc;
    g.thickLine(px, py, px + 5.5 * sc * sin(a), py - 5.5 * sc * cos(a), 2.6 * sc, hc);
  } else {
    g.fillCircle(x, y - 0.8 * sc, 4.8 * sc, hc);
    g.fillRect(Math.round(x - 4.8 * sc), Math.round(y - 1 * sc), Math.round(9.6 * sc), Math.round(4.4 * sc), hc);
  }
  g.fillCircle(x, y + 0.6 * sc, r, C.skin);
  if (sc < 0.6) return;
  // headband, eyes, the count shouted on the beat
  g.fillRect(Math.round(x - r), Math.round(y - 2.6 * sc), Math.round(2 * r), 2, C.belt);
  g.fillRect(Math.round(x - 1.8), Math.round(y + 0.4), 1, 1, C.ink);
  g.fillRect(Math.round(x + 1.2), Math.round(y + 0.4), 1, 1, C.ink);
  if (P.mouth) g.fillRect(Math.round(x - 0.3), Math.round(y + 2.5), 1, 1, C.ink);
}

/**
 * One instructor: numeral `d` with feet on `floor`, centred on `cx`, at
 * scale `sc`, posed by `P`, in colours `C` (paint()).
 */
export function instructor(g, d, cx, floor, sc, P, C, i = 0) {
  const kt = SLANT + P.lean * 0.06, sq = P.sq;
  const x = cx + P.sway * sc;
  // the stance leg decides how high the hips ride
  const stand = Math.min(P.lLl > 0.3 ? 99 : P.lLa, P.lRl > 0.3 ? 99 : P.lRa);
  const hipY = floor - 2.2 * sc - (TH + SH_) * sc * cos(Math.min(stand, 40) * D2R) - P.hop * sc;
  const by = hipY + 2.2 * sc * sq;
  const hv = GH - 2.2;
  const hx0 = gx(HIP[d] - HIPW[d], hv, x, sc, sq, kt), hx1 = gx(HIP[d] + HIPW[d], hv, x, sc, sq, kt), hy = gy(hv, by, sc, sq);
  const [uL, uR, sv] = SHOULDER[d];
  const sxL = gx(uL, sv, x, sc, sq, kt), sxR = gx(uR, sv, x, sc, sq, kt), sy = gy(sv, by, sc, sq);
  leg(g, hx0, hy, -1, P.lLa, P.lLl, sc, C);
  leg(g, hx1, hy, 1, P.lRa, P.lRl, sc, C);
  body(g, d, x, by, sc, sq, kt, C);
  arm(g, sxL, sy, -1, P.aL1, P.aL2, sc, C);
  arm(g, sxR, sy, 1, P.aR1, P.aR2, sc, C);
  // the head on its neck
  const nx = gx(NECK[d], 0, x, sc, sq, kt), ny = gy(0, by, sc, sq);
  const hdy = ny - 5.6 * sc;
  g.thickLine(nx, ny + 1, nx, hdy + 2 * sc, 2.6 * sc, C.skin);
  head(g, nx + P.lean * 0.5 * sc, hdy, sc, C, P, i);
}

// ------------------------------------------------------------ the class

/**
 * A class member: a small generic body (head, leotard torso, limbs) doing
 * the same pose, in muted colours. ~20 px tall.
 */
export function member(g, cx, floor, P, C) {
  const sc = 0.5, x = cx + P.sway * sc;
  const stand = Math.min(P.lLl > 0.3 ? 99 : P.lLa, P.lRl > 0.3 ? 99 : P.lRa);
  const hipY = floor - 1 - (TH + SH_) * sc * cos(Math.min(stand, 40) * D2R) - P.hop * sc;
  const top = hipY - 9 * P.sq, lean = P.lean * 0.5;
  leg(g, x - 1.5, hipY, -1, P.lLa, P.lLl, sc, C);
  leg(g, x + 1.5, hipY, 1, P.lRa, P.lRl, sc, C);
  g.fillPolygon([[x - 3 + lean, top], [x + 3 + lean, top], [x + 2.5, hipY + 1], [x - 2.5, hipY + 1]], C.top);
  arm(g, x - 2.6 + lean, top + 1, -1, P.aL1, P.aL2, 0.62, C);
  arm(g, x + 2.6 + lean, top + 1, 1, P.aR1, P.aR2, 0.62, C);
  g.fillCircle(x + lean * 1.3, top - 3, 2.6, C.hair);
  g.fillCircle(x + lean * 1.3, top - 2.4, 1.9, C.skin);
}
