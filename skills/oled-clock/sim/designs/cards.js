// Cards — the time held by an unseen card magician, in real 3D.
//
// The hour is the face card of a deck held up on the left (24 h; a jumbo
// index of one or two condensed digits over its suit); the minutes are two
// cards fanned on the right, tens behind, ones in front. Every card is a
// quad in perspective, filled by inverse mapping from a face tabulated at 4x
// (black inside, so cards occlude), its outline drawn as crisp lines; the
// deck is a box whose visible long sides are a lit block of card edges.
// The index is a condensed art-deco hand (thick verticals, hairline
// horizontals, stadium bowls), all ten digits from the same parts; a zero
// wears the Joker's cap instead of a suit.
//
// Always alive: every card sways on its own (yaw, pitch, roll, bob); at :14
// the ones card twirls, at :32 the tens flips end over end, at :40 the deck
// thumb-fans its cards out behind the face and squares them.
// The minute: each changed card is thrown back to the deck in a helicopter
// twirl and slid in behind the hour card; the deck squeezes; after :00 the
// new card rises out of it and is spun out to its slot, slowing into the
// catch (the tens goes first and comes back last).
// The hour: the deck sprays a ring of cards that orbits the whole table,
// behind the minute cards over the top and in front of them low, back into
// the deck. One card rides the ring face down and drops onto the front of
// the deck; at the turn it turns over to show the new hour while the minute
// cards spin on the spot from 59 to 00. The old hour stays on the deck until
// the turn, so the time is always readable.
// Burn-in: the sway and kit.orbit; night dimming via ctx.night.

import { clamp, ease, progress, clockFields, orbit, smoothNoise } from '../js/kit.js';

const TAU = Math.PI * 2;
const W = 128, H = 64;

// ------------------------------------------------------------ shape algebra
// Tests (x, y) -> bool in whatever units the caller uses.
const rect = (x0, y0, x1, y1) => (x, y) => x >= x0 && x < x1 && y >= y0 && y < y1;
const ell = (cx, cy, rx, ry) => (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
const ring = (cx, cy, rx, ry, tx, ty) => {
  const o = ell(cx, cy, rx, ry), i = ell(cx, cy, rx - tx, ry - ty);
  return (x, y) => o(x, y) && !i(x, y);
};
const rr = (x0, y0, x1, y1, r) => (x, y) => {
  if (x < x0 || y < y0 || x > x1 || y > y1) return false;
  const qx = Math.max(x0 + r - x, 0, x - (x1 - r)), qy = Math.max(y0 + r - y, 0, y - (y1 - r));
  return qx * qx + qy * qy <= r * r;
};
const poly = (pts) => (x, y) => {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const or = (...s) => (x, y) => { for (const f of s) if (f(x, y)) return true; return false; };
const and = (...s) => (x, y) => { for (const f of s) if (!f(x, y)) return false; return true; };
const not = (s) => (x, y) => !s(x, y);
const disc = (cx, cy, r) => ell(cx, cy, r, r);

// ------------------------------------------------------------ letterforms
// A condensed art-deco index, as on a jumbo-index poker card: a 14 x 28 box,
// thick verticals (4), hairline horizontals (2), stadium bowls with the
// stress upright. Every digit is built from the same few parts.

const BOWL = ring(7, 19, 7, 9, 4, 2);                 // the lower bowl of 3 5 6 8
const DIG = [
  // 0: a stadium
  and(rr(0, 0, 14, 28, 7), not(rr(4, 2, 10, 26, 3))),
  // 1: stem, hairline flag, foot
  or(rect(5.5, 0, 10, 28), poly([[5.5, 0], [7.5, 0], [2.2, 7], [0.8, 5.2]]), rect(2.5, 26, 13, 28)),
  // 2: hooked bowl, thick diagonal, base
  or(and(ring(7, 7, 7, 7, 4, 2), (x, y) => y <= 7), poly([[10, 7], [14, 7], [4.5, 26], [0, 26]]), rect(0, 26, 14, 28)),
  // 3: flat top, diagonal, lower bowl
  or(rect(0, 0, 14, 2), poly([[9.6, 2], [14, 2], [8.4, 11.2], [4.6, 10.4]]), and(BOWL, (x, y) => x >= 7 || y >= 19)),
  // 4: open top: a leaning thick stroke, the stem, a bar (never an A)
  or(poly([[1.6, 0], [5.6, 0], [4, 18.5], [0, 18.5]]), rect(9.4, 5, 13.4, 28), rect(0, 17.6, 14, 19.8)),
  // 5: top bar, stem, bowl
  or(rect(1, 0, 14, 2), rect(1, 0, 5, 12), rect(1, 10, 8, 12), and(BOWL, (x, y) => x >= 7 || y >= 19)),
  // 6: bowl, stem, hook
  or(BOWL, rect(0, 8, 4, 19), and(ring(7, 8, 7, 8, 4, 2), (x, y) => y <= 8 && (x <= 9 || y <= 3))),
  // 7: top bar, diagonal
  or(rect(0, 0, 14, 2), poly([[10, 2], [14, 2], [7.2, 28], [3, 28]])),
  // 8: two stadium rings
  or(ring(7, 7, 6, 7, 3.8, 2), ring(7, 20, 7, 8, 4, 2)),
  null,
];
DIG[9] = (x, y) => DIG[6](14 - x, 28 - y);

// Suits, centred on 0, about 2 units across.
const SUIT = [
  // spade
  or(disc(-0.48, 0.12, 0.5), disc(0.48, 0.12, 0.5), poly([[-0.96, 0.06], [0.96, 0.06], [0, -1]]), poly([[0, 0.2], [0.34, 1], [-0.34, 1]])),
  // heart
  or(disc(-0.48, -0.32, 0.5), disc(0.48, -0.32, 0.5), poly([[-0.96, -0.2], [0.96, -0.2], [0, 1]])),
  // club
  or(disc(0, -0.48, 0.5), disc(-0.52, 0.18, 0.5), disc(0.52, 0.18, 0.5), disc(0, 0, 0.3), poly([[0, -0.1], [0.4, 1], [-0.4, 1]])),
  // diamond
  (x, y) => Math.abs(x) / 0.9 + Math.abs(y) <= 1.08,
];
// The Joker's cap, for the zero cards: a band and three floppy points, each
// with its bell.
const CAP = or(
  rect(-0.9, 0.35, 0.9, 1),
  poly([[-0.9, 0.4], [0.05, 0.4], [-1.05, -0.55]]),
  poly([[-0.45, 0.4], [0.45, 0.4], [0, -0.85]]),
  poly([[-0.05, 0.4], [0.9, 0.4], [1.05, -0.55]]),
  disc(-1.1, -0.65, 0.34), disc(0, -1.0, 0.34), disc(1.1, -0.65, 0.34),
);
const CAPB = bake(CAP, -1.6, -1.6, 1.6, 1.2, 24);

// Each glyph is baked once into a table at 8 samples per unit, so a card
// face is built from lookups (about a millisecond) rather than geometry.
function bake(shape, x0, y0, x1, y1, res = 8) {
  const w = Math.ceil((x1 - x0) * res), h = Math.ceil((y1 - y0) * res), t = new Uint8Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) t[j * w + i] = shape(x0 + (i + 0.5) / res, y0 + (j + 0.5) / res) ? 1 : 0;
  return (x, y) => {
    const i = Math.floor((x - x0) * res), j = Math.floor((y - y0) * res);
    return i >= 0 && j >= 0 && i < w && j < h && t[j * w + i] === 1;
  };
}
for (let d = 0; d < 10; d++) DIG[d] = bake(DIG[d], 0, 0, 14, 28, 6);
for (let k = 0; k < 4; k++) SUIT[k] = bake(SUIT[k], -1.5, -1.5, 1.5, 1.5, 24);

// ------------------------------------------------------------ card faces
// A card is 32 x 46 units (px at z = 0). Each face is tabulated at 4x: 0 is
// black (opaque), 1 lit, 2 outside the rounded corners (transparent).

const CW = 32, CH = 46, S = 4, MW = CW * S, MH = CH * S;
const OUTER = rr(0, 0, CW, CH, 3.5), INNER = rr(1.3, 1.3, CW - 1.3, CH - 1.3, 2.3);
const FRAME = (() => {                      // 2 outside, 1 inside the border, 0 on it
  const m = new Uint8Array(MW * MH);
  for (let j = 0; j < MH; j++) for (let i = 0; i < MW; i++) {
    const x = (i + 0.5) / S, y = (j + 0.5) / S;
    m[j * MW + i] = !OUTER(x, y) ? 2 : INNER(x, y) ? 1 : 0;
  }
  return m;
})();

function tabulate(test) {
  const m = new Uint8Array(MW * MH);
  for (let j = 0; j < MH; j++)
    for (let i = 0; i < MW; i++) {
      const fr = FRAME[j * MW + i];
      m[j * MW + i] = fr === 2 ? 2 : fr === 1 && test((i + 0.5) / S, (j + 0.5) / S) ? 1 : 0;
    }
  return m;
}
const place = (shape, ox, oy, sx, sy = sx) => (x, y) => shape((x - ox) / sx, (y - oy) / sy);

const cache = new Map();
function face(key, build) {
  let m = cache.get(key);
  if (!m) cache.set(key, (m = tabulate(build())));
  return m;
}
/** A minute card: one big index, its suit beneath. */
const minuteFace = (d) => face('m' + d, () => or(
  place(DIG[d], 3.6, 2.8, 1.2, 1.12),
  d ? place(SUIT[d % 4], 12, 40, 4.6) : place(CAPB, 12, 40.2, 3.8),
));
/** The hour card: one or two condensed indices, centred, a big pip beneath. */
const hourFace = (h) => face('h' + h, () => {
  const s = String(h), sx = s.length > 1 ? 0.84 : 1.1, sy = 0.98;
  const gw = 14 * sx, gap = 1.6, total = s.length * gw + (s.length - 1) * gap;
  const parts = [...s].map((c, i) => place(DIG[+c], (CW - total) / 2 + i * (gw + gap), 3.5, sx, sy));
  parts.push(h ? place(SUIT[h % 4], CW / 2, 39, 5.4) : place(CAPB, CW / 2, 39.4, 4.4));
  return or(...parts);
});
const backFace = () => face('back', () => or(
  and(rr(3.6, 3.6, CW - 3.6, CH - 3.6, 1.5), not(rr(4.8, 4.8, CW - 4.8, CH - 4.8, 1))),
  (x, y) => { const d = Math.abs(x - CW / 2) / 9 + Math.abs(y - CH / 2) / 14; return d <= 1 && (d >= 0.84 || d <= 0.42); },
));
const edgeFace = () => face('edge', () => () => false);

// a card in flight, small: a plain back with one bold diamond
const smallBack = () => face('small', () => (x, y) => Math.abs(x - CW / 2) / 8 + Math.abs(y - CH / 2) / 12 <= 1);

// All 38 faces are built at load (~0.1 s), so no frame waits for one.
for (let d = 0; d < 10; d++) minuteFace(d);
for (let h = 0; h < 24; h++) hourFace(h);
backFace(); edgeFace(); smallBack();

// ------------------------------------------------------------ 3D
// World units are px at z = 0; the eye is D in front of the glass, centred
// on (VX, VY). Rotations are 3x3 row-major.

const D = 190, VX = 64, VY = 30;
const rotX = (a) => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c]; };
const rotY = (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; };
const rotZ = (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1]; };
function mul(A, B) {
  const o = new Array(9);
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++) o[r * 3 + c] = A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c];
  return o;
}
/** Card orientation: yaw about its own vertical, then pitch, then roll in the glass. */
const orient = (yaw, pitch, roll) => mul(rotZ(roll), mul(rotX(pitch), rotY(yaw)));
const apply = (R, x, y, z) => [R[0] * x + R[1] * y + R[2] * z, R[3] * x + R[4] * y + R[5] * z, R[6] * x + R[7] * y + R[8] * z];

const Q = new Float64Array(8);
let OX = 0, OY = 0;                          // the burn-in walk, set each frame
function project(P, R, lx, ly, lz, k) {
  const [x, y, z] = apply(R, lx, ly, lz);
  const s = D / (D + P[2] + z);
  Q[k] = VX + OX + (P[0] + x - VX) * s; Q[k + 1] = VY + OY + (P[1] + y - VY) * s;
}

/**
 * Fill the screen quad Q (corners for uv (0,0) (1,0) (1,1) (0,1)) from mask
 * m, mirrored in u if `flip`.
 */
function fillQuad(g, m, flip, clipY, mw = MW, mh = MH) {
  const [x0, y0, x1, y1, x2, y2, x3, y3] = Q;
  const sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3;
  const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2;
  const den = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(den) < 1e-9) return;
  const gg = (sx * dy2 - dx2 * sy) / den, hh = (dx1 * sy - sx * dy1) / den;
  const a = x1 - x0 + gg * x1, b = x3 - x0 + hh * x3, c = x0;
  const d = y1 - y0 + gg * y1, e = y3 - y0 + hh * y3, f = y0;
  const A = e - f * hh, B = c * hh - b, C = b * f - c * e;
  const Dd = f * gg - d, E = a - c * gg, F = c * d - a * f;
  const G = d * hh - e * gg, Hh = b * gg - a * hh, II = a * e - b * d;
  const GW = g.width, GH = g.height;
  const xa = Math.max(0, Math.floor(Math.min(x0, x1, x2, x3))), xb = Math.min(GW - 1, Math.ceil(Math.max(x0, x1, x2, x3)));
  const ya = Math.max(0, Math.floor(Math.min(y0, y1, y2, y3))), yb = Math.min(clipY ?? GH - 1, Math.ceil(Math.max(y0, y1, y2, y3)));
  const buf = g.buf, gw = g.width;
  for (let y = ya; y <= yb; y++) {
    const py = y + 0.5;
    for (let x = xa; x <= xb; x++) {
      const px = x + 0.5;
      const w = G * px + Hh * py + II;
      let u = (A * px + B * py + C) / w;
      if (u < 0 || u >= 1) continue;
      const v = (Dd * px + E * py + F) / w;
      if (v < 0 || v >= 1) continue;
      if (flip) u = 1 - 1e-9 - u;
      const r = m[((v * mh) | 0) * mw + ((u * mw) | 0)];
      if (r < 2) buf[y * gw + x] = r;
    }
  }
}

// The card's outline, a rounded rectangle as a polygon in card units, drawn
// as crisp 1 px lines after the fill (a tabulated border breaks up when the
// card is foreshortened).
const OUTLINE = (() => {
  const r = 3, e = 0.5, pts = [];
  const corners = [[CW - e - r, e + r, -Math.PI / 2], [CW - e - r, CH - e - r, 0], [e + r, CH - e - r, Math.PI / 2], [e + r, e + r, Math.PI]];
  for (const [cx, cy, a0] of corners)
    for (let k = 0; k <= 2; k++) { const a = a0 + (k / 2) * (Math.PI / 2); pts.push([cx + r * Math.cos(a) - CW / 2, cy + r * Math.sin(a) - CH / 2]); }
  return pts;
})();
const OP = new Float64Array(OUTLINE.length * 2);

/** Draw a card: centre P, orientation R, scale sc, face mask, back mask. */
function drawCard(g, c) {
  const sc = c.sc ?? 1, hw = (CW / 2) * sc, hh = (CH / 2) * sc;
  project(c.P, c.R, -hw, -hh, 0, 0); project(c.P, c.R, hw, -hh, 0, 2);
  project(c.P, c.R, hw, hh, 0, 4); project(c.P, c.R, -hw, hh, 0, 6);
  const area = (Q[2] - Q[0]) * (Q[7] - Q[1]) - (Q[3] - Q[1]) * (Q[6] - Q[0]);
  const front = area > 0;
  const q = Array.from(Q);
  fillQuad(g, front ? c.face : c.back, !front);
  OUTLINE.forEach(([x, y], k) => { project(c.P, c.R, x * sc, y * sc, 0, 0); OP[2 * k] = Q[0]; OP[2 * k + 1] = Q[1]; });
  const n = OUTLINE.length;
  for (let k = 0; k < n; k++) {
    const j = (k + 1) % n;
    g.line(Math.floor(OP[2 * k]), Math.floor(OP[2 * k + 1]), Math.floor(OP[2 * j]), Math.floor(OP[2 * j + 1]));
  }
  Q.set(q);
}

// ------------------------------------------------------------ motion

const lerp = (a, b, u) => a + (b - a) * u;
const lerp3 = (a, b, u) => [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];
const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const wob = (t, seed, rate = 1) => smoothNoise(t * rate, seed) * 2 - 1 + 0.5 * (smoothNoise(t * rate * 2.3, seed + 7) * 2 - 1);

// Rest poses: the hour deck held up on the left, the minute pair fanned on
// the right (tens behind, ones in front).
const DECK = [19, 27, 14];
const SLOT = [{ P: [73, 31, -6], roll: -0.22 }, { P: [98, 33, -10], roll: 0.12 }];
const N = 5, TH = 8;                    // slices drawn for a full deck, its thickness

function deckPose(t) {
  return {
    P: [DECK[0] + 0.8 * wob(t, 1, 0.4), DECK[1] + 1.2 * Math.sin(t * 1.3), DECK[2]],
    yaw: 0.46 + 0.08 * wob(t, 2, 0.35), pitch: -0.05 + 0.06 * wob(t, 3, 0.3), roll: -0.1 + 0.04 * wob(t, 4, 0.3),
  };
}
function slotPose(k, t) {
  const s = SLOT[k], ph = k * 1.7;
  return {
    P: [s.P[0] + 0.6 * wob(t, 10 + k, 0.4), s.P[1] + 1.1 * Math.sin(t * 1.1 + ph), s.P[2]],
    yaw: 0.17 * wob(t, 12 + k, 0.25), pitch: 0.09 * wob(t, 14 + k, 0.3), roll: s.roll + 0.04 * wob(t, 16 + k, 0.3),
  };
}
const poseR = (p) => orient(p.yaw, p.pitch, p.roll);
function mixPose(a, b, u) {
  return { P: lerp3(a.P, b.P, u), yaw: lerp(a.yaw, b.yaw, u), pitch: lerp(a.pitch, b.pitch, u), roll: lerp(a.roll, b.roll, u) };
}

/**
 * The slices of a packet: n cards' worth drawn as outlines stacked behind
 * the front one, each offset by `off(i)` in the packet's own frame (local x,
 * y, and a roll about the lower-left corner for a thumb fan).
 */
function packet(items, pose, n, front, rear, off) {
  const R = poseR(pose);
  const depth = TH * (n / N);
  // a squared packet is a box: the back card, its four corner edges, the
  // front card. Slices between are drawn only while they are offset (a
  // thumb fan, the squeeze), when their edges are the point.
  const loose = off && [1, 2].some((i) => { const o = off(i); return Math.abs(o.y) > 0.3 || Math.abs(o.fan) > 0.004; });
  const idx = loose ? [...Array(Math.max(2, n)).keys()] : n > 1 ? [0, n - 1] : [0];
  const last = idx[idx.length - 1];
  for (const i of idx) {
    const o = off ? off(i) : null;
    const dz = last ? (i / last) * depth : 0;
    let Ri = R, lx = o?.x ?? 0, ly = o?.y ?? 0;
    if (o?.fan) {
      // turn the slice about the packet's lower-left corner
      const px = -CW / 2 + 3, py = CH / 2 - 3, c = Math.cos(o.fan), s = Math.sin(o.fan);
      lx += px - (c * px - s * py); ly += py - (s * px + c * py);
      Ri = mul(R, rotZ(o.fan));
    }
    const d = apply(R, lx, ly, dz);
    items.push({ P: add3(pose.P, d), R: Ri, face: i === 0 ? front : edgeFace(), back: i === last ? rear : edgeFace(), z: pose.P[2] + d[2] });
  }
  if (last && !loose) {
    // the four long sides of the box, each a quad from the front card's edge
    // to the back card's: drawn black with an outline, after the back card
    const hx = CW / 2 - 0.8, hy = CH / 2 - 0.8;
    const c = [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]];
    for (let k = 0; k < 4; k++) {
      const [ax, ay] = c[k], [bx, by] = c[(k + 1) % 4];
      const q = [[ax, ay, 0], [bx, by, 0], [bx, by, depth], [ax, ay, depth]].map(([x, y, z]) => add3(pose.P, apply(R, x, y, z)));
      // outward normal against the line of sight: draw only the sides that face the eye
      const nl = [[0, -1], [1, 0], [0, 1], [-1, 0]][k], nw = apply(R, nl[0], nl[1], 0);
      const mid = add3(pose.P, apply(R, (ax + bx) / 2, (ay + by) / 2, depth / 2));
      const vis = nw[0] * (mid[0] - VX) + nw[1] * (mid[1] - VY) + nw[2] * (mid[2] + D);
      if (vis < 0) items.push({ side: q, z: pose.P[2] + depth / 2 + 0.01 });
    }
  }
}

// the long sides of a deck: a lit block of card edges, with a dark line
// a third of the way in so it reads as paper, not as a frame
const SIDE = new Uint8Array([1]);
function drawSide(g, q) {
  const pr = q.map((P) => { const s = D / (D + P[2]); return [VX + OX + (P[0] - VX) * s, VY + OY + (P[1] - VY) * s]; });
  pr.forEach(([x, y], k) => { Q[2 * k] = x; Q[2 * k + 1] = y; });
  fillQuad(g, SIDE, false, undefined, 1, 1);
  // one dark line along the stack, drawn as a line so it never breaks up
  const m = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
  const a = m(pr[0], pr[3], 0.22), b = m(pr[1], pr[2], 0.22);
  if (Math.hypot(pr[3][0] - pr[0][0], pr[3][1] - pr[0][1]) > 3.5)
    g.line(Math.floor(a[0]), Math.floor(a[1]), Math.floor(b[0]), Math.floor(b[1]), 0);

}

const SPIN_LEAD = 1.7, TAIL = 1.6, HLEAD = 2.4;

// ------------------------------------------------------------ the frame

export default {
  name: 'Cardistry',
  blurb: 'Cardistry by unseen hands, in 3D: the hour is the face of the deck, the minutes two fanned cards; each minute the old card is twirled back into the deck and the new one spun out, and on the hour a ring of cards orbits the table and the new hour card lands on the deck.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  frame(g, ctx) {
    const t = ctx.date.getTime() / 1000, now = ctx.date.getTime();
    const f = ctx.fields;
    [OX, OY] = orbit(ctx.date, 2, 4);
    ctx.oled.contrast(Math.round(207 + (40 - 207) * ctx.night));
    const m0 = Math.floor(now / 60000) * 60000, into = (now - m0) / 1000;
    let turnAt = null;
    if (into > 60 - HLEAD) turnAt = m0 + 60000; else if (into < TAIL) turnAt = m0;
    const u = turnAt === null ? 99 : (now - turnAt) / 1000;
    const was = turnAt === null ? f : clockFields(new Date(turnAt - 1000));
    const is = turnAt === null ? f : clockFields(new Date(turnAt));
    const hourShow = turnAt !== null && was.h !== is.h;
    const items = [];

    // --- the hour deck, and on the hour the spring to the other hand and back
    const dp = deckPose(t);
    const sec = f.sec;
    let fanA = 0;                                   // idle thumb fan, once a minute
    if (sec > 40 && sec < 43) fanA = Math.sin(Math.PI * ease.inOutCubic(progress(sec, 40, 43))) * 0.11;
    let wave = null;                                // the riffle squeeze at a minute turn
    if (turnAt !== null && !hourShow && u > -0.4 && u < 0.3) wave = progress(u, -0.4, 0.3);
    const deckOff = (i) => {
      let y = 0, fan = fanA * i;
      if (wave !== null) y -= 6 * Math.sin(Math.PI * clamp(wave * 1.6 - i * 0.12, 0, 1));
      return { x: 0, y, fan };
    };

    if (!hourShow) {
      packet(items, dp, N, hourFace(f.h), backFace(), deckOff);
    } else {
      hourSpring(items, u, dp, was.h, is.h);
    }

    // --- the minute cards
    const digits = (ff) => [Math.floor(ff.m / 10), ff.m % 10];
    const dw = digits(was), di = digits(is);
    for (let k = 0; k < 2; k++) {
      const rest = slotPose(k, t);
      // idle flourishes: the ones card twirls at :14, the tens flips end over end at :32
      if (k === 1 && sec > 14 && sec < 15.3) rest.yaw += TAU * ease.inOutCubic(progress(sec, 14, 15.3));
      if (k === 0 && sec > 32 && sec < 33.4) rest.pitch += TAU * ease.inOutCubic(progress(sec, 32, 33.4)), rest.P[1] -= 5 * Math.sin(Math.PI * progress(sec, 32, 33.4));
      const changing = turnAt !== null && dw[k] !== di[k];
      if (!changing) {
        items.push({ P: rest.P, R: poseR(rest), face: minuteFace(turnAt !== null ? di[k] : digits(f)[k]), back: backFace(), z: rest.P[2] });
        continue;
      }
      if (hourShow) { spinChange(items, rest, u, dw[k], di[k], k); continue; }
      gatherAndDeal(items, rest, dp, u, dw[k], di[k], k);
    }

    items.sort((a, b) => b.z - a.z);
    for (const c of items) (c.side ? drawSide(g, c.side) : drawCard(g, c));
  },
};

/**
 * A minute card going back into the deck and the new one dealt out: the
 * old card flies to the deck, twirling, and slides in from the top behind
 * the hour card; the deck squeezes (a riffle's cascade through its edges);
 * the new card rises out of the top and spins out to the slot.
 */
function gatherAndDeal(items, rest, dp, u, oldD, newD, k) {
  const st = k === 0 ? 0.12 : 0;             // the tens goes first and comes back last
  const Rd = poseR(dp);
  // gathered behind the deck: first beside it, level with its back card,
  // then slid across behind it, where the deck itself hides it
  const back = TH + 0.6 + k * 0.4;
  const side = add3(dp.P, apply(Rd, 36, -2, back));
  const inside = add3(dp.P, apply(Rd, 0, 0, back));
  const at = (P) => ({ P, yaw: dp.yaw, pitch: dp.pitch, roll: dp.roll });
  const a0 = -1.0 - st, a1 = -0.32 - st, a2 = a1 + 0.2;
  const b0 = 0.0 + st, b1 = b0 + 0.16, b2 = b1 + 0.8;
  let pose, face, behind = false;
  if (u < a0) { pose = rest; face = minuteFace(oldD); }
  else if (u < a1) {
    // thrown back to the deck in a flat spin, face to the glass
    const p = ease.inOutCubic(progress(u, a0, a1));
    pose = mixPose(rest, at(side), p);
    pose.P[1] -= 7 * Math.sin(Math.PI * p);
    pose.P[2] -= 8 * Math.sin(Math.PI * p);
    pose.yaw -= TAU * p;                    // a helicopter twirl: back, never upside down
    pose.roll -= 0.35 * Math.sin(Math.PI * p);
    face = minuteFace(oldD);
  } else if (u < a2) {
    pose = at(lerp3(side, inside, ease.inQuad(progress(u, a1, a2))));
    face = minuteFace(oldD); behind = true;
  } else if (u < b0) return;
  else if (u < b1) {
    pose = at(lerp3(inside, side, ease.outQuad(progress(u, b0, b1))));
    face = minuteFace(newD); behind = true;
  } else {
    // spun out to the slot: a flat spin that slows into the catch
    const p = progress(u, b1, b2), e = ease.outBack(p), q = ease.outCubic(p);
    pose = mixPose(at(side), rest, q);
    pose.P = lerp3(side, rest.P, e);
    pose.P[1] -= 5 * Math.sin(Math.PI * p);
    pose.P[2] -= 8 * Math.sin(Math.PI * p);
    pose.yaw += TAU * 2 * (1 - q);           // spun out: two twirls slowing into the catch
    pose.roll += 0.3 * Math.sin(Math.PI * p);
    face = minuteFace(newD);
  }
  // behind the deck it sorts behind the back card and the sides
  items.push({ P: pose.P, R: poseR(pose), face, back: backFace(), z: behind ? dp.P[2] + TH + 1 + k * 0.1 : pose.P[2], sc: behind ? 0.97 : 1 });
}

/** On the hour the minute cards change in place: two turns on the spot. */
function spinChange(items, rest, u, oldD, newD, k) {
  // two turns, timed so the card shows its back at the turn (eased 1/4 of
  // the way round = half a turn): the digit is swapped out of sight
  const span = 1.1 + k * 0.25, a = -0.397 * span, b = a + span;
  const p = ease.inOutCubic(progress(u, a, b));
  const pose = { ...rest, P: [...rest.P] };
  pose.yaw += TAU * 2 * p;
  pose.P[2] -= 10 * Math.sin(Math.PI * p);
  // swap the digit while the card is edge-on nearest to the turn
  const face = minuteFace(u < 0 ? oldD : newD);
  items.push({ P: pose.P, R: poseR(pose), face, back: backFace(), z: pose.P[2] });
}

/**
 * The hour: the deck sprays out from behind the hour card into a ring that
 * orbits the whole table, in front of the minute cards over the top and
 * behind them low, and back into the back of the deck. The old hour stays on
 * the front all the while. One card rides the ring face down and drops out
 * of it onto the front of the deck, turning over as it lands: edge-on at the
 * turn, the new hour after it.
 */
const SPRING = 22, L0 = -2.4, L1 = -1.05, FL = 1.15, HL = -1.3, HFL = 1.15;
// The ring, tilted like a planet's: out of the deck, up and behind the
// minute cards along the top, round the right end, and back low in front
// of them across the pips into the deck.
function ringPos(p, zc) {
  const a = TAU * (0.15 * ease.inOutQuad(p) + 0.85 * p), s = Math.sin(a);
  return [64 - 47 * Math.cos(a), 31 - (s > 0 ? 25 : 31) * s, zc + (s > 0 ? 14 : 40) * s];
}
function hourSpring(items, u, dp, oldH, newH) {
  let inHand = 0;
  for (let i = 0; i < SPRING; i++) {
    const l = L0 + (i / (SPRING - 1)) * (L1 - L0);
    if (u < l || u > l + FL) { inHand++; continue; }
    const p = (u - l) / FL;
    const pose = { P: ringPos(p, DECK[2] + 4), yaw: dp.yaw * (1 - Math.sin(Math.PI * p)), pitch: 0.6 * Math.sin(TAU * p), roll: dp.roll - TAU * p };
    // leaving and coming home they pass behind the deck, into its back
    const z = p < 0.1 || p > 0.88 ? dp.P[2] + TH + 2 : pose.P[2];
    items.push({ P: pose.P, R: poseR(pose), face: smallBack(), back: smallBack(), z, sc: 0.5 + 0.5 * (1 - Math.sin(Math.PI * p)) ** 4 });
  }
  const n = Math.max(2, Math.round((inHand / SPRING) * N));
  const flipped = u >= 0.25;
  // the deck's own face: the old hour until the turn; after it, under the
  // turning card, a plain card
  packet(items, dp, n, u < 0 ? hourFace(oldH) : flipped ? hourFace(newH) : edgeFace(), backFace());
  if (u > HL && !flipped) {
    const p = clamp((u - HL) / HFL, 0, 1);
    const q = ease.inOutCubic(progress(p, 0.8, 1));
    const P = ringPos(Math.min(p, 0.999), DECK[2] - 2);
    const home = [dp.P[0], dp.P[1], dp.P[2] - 1.5];
    // turned over on the deck: back to the glass until the turn, edge-on at it
    const turn = ease.inOutCubic(progress(u, -0.25, 0.25));
    const pose = { P: lerp3(P, home, q), yaw: lerp(Math.PI + dp.yaw, dp.yaw, turn), pitch: lerp(0.5 * Math.sin(TAU * p), dp.pitch, q), roll: lerp(dp.roll - TAU * p, dp.roll, q) };
    items.push({ P: pose.P, R: poseR(pose), face: hourFace(newH), back: smallBack(), z: dp.P[2] - 2, sc: lerp(0.55, 1, q) });
  }
}

/** Specimen sheet for out/cards-digits.mjs: every face, face on, at 1x. */
export function specimen(g) {
  OX = OY = 0;
  const flat = orient(0, 0, 0);
  const at = (x, y, m) => drawCard(g, { P: [x + CW / 2, y + CH / 2, 0], R: flat, face: m, back: m });
  for (let d = 0; d < 10; d++) at(2 + d * 35, 2, minuteFace(d));
  [0, 7, 10, 12, 18, 23].forEach((h, i) => at(2 + i * 35, 52, hourFace(h)));
  at(2 + 6 * 35, 52, backFace());
}
