// dollclaw: the owner's two plush toys, drawn flat with hard pixels.
//
// PANDA: shaggy, sitting slumped with legs out. Every fur part is an ellipse
// whose edge is a ring of small overlapping tuft circles, so no outline is
// ever smooth (the long looped pile), and the cream parts carry a few fixed
// curl marks. Black-and-cream blocks: round shaggy ears, drooping teardrop
// eye patches with the eyes lost inside, a small low nose, a black shawl
// running into the arms, a cream heart belly, black legs with big round feet.
//
// PUPPY: the floppy black-and-tan beanbag, front view, draped over the
// claw's hub the way it droops over a hand: wide flattened black head, long
// rounded black ears hanging past the jaw, a puffy tan muzzle crescent with
// a dark-brown felt nose, two tiny bead eyes with tan eyebrow dots, tan
// mitten paws (one with the lavender tag) dangling front and back.

import { mix, rand, sin, cos, TAU } from '../js/kit.js';

export const P = {
  cream: 0xefeadf, creamShade: 0xd2cbbc, black: 0x141418, blackLit: 0x2c2c34,
  tan: 0xb8781a, tanLit: 0xe0a040, tanShade: 0x845618, pupBlack: 0x161412, pupLit: 0x3a332c,
  nose: 0x5a3a22, tag: 0x9a7ad8, bead: 0x040404, glint: 0xf4f4f4,
};

// Tuft rings, one per seed, fixed for ever (angle jitter, tuft size).
const RINGS = new Map();
function ring(seed, n) {
  const k = seed * 64 + n;
  if (RINGS.has(k)) return RINGS.get(k);
  const r = [];
  for (let i = 0; i < n; i++) {
    const a = ((i + (rand(seed, i, 1) - 0.5) * 0.6) / n) * TAU;
    r.push([sin(a), -cos(a), 0.9 + rand(seed, i, 2) * 1.0, rand(seed, i, 3)]);
  }
  RINGS.set(k, r);
  return r;
}

/** A shaggy ellipse: a core plus a ring of tuft circles on its edge, and a few stray hairs. */
function shag(g, cx, cy, rx, ry, c, seed, n, stray = 0) {
  g.fillEllipse(cx, cy, rx - 0.6, ry - 0.6, c);
  for (const [sx, sy, r, q] of ring(seed, n)) {
    const x = cx + sx * (rx - 0.4), y = cy + sy * (ry - 0.4);
    g.fillCircle(x, y, r, c);
    if (q < stray) g.pixel(Math.floor(x + sx * (r + 0.8)), Math.floor(y + sy * (r + 0.8)), c);
  }
}

// Curl marks in a unit disc: little two-pixel loops of the shade colour.
const CURLS = [];
for (let i = 0; i < 40; i++) {
  const a = rand(i, 9, 1) * TAU, r = Math.sqrt(rand(i, 9, 2)) * 0.82;
  CURLS.push([Math.sin(a) * r, Math.cos(a) * r, rand(i, 9, 3) < 0.5 ? 1 : -1]);
}
function curls(g, cx, cy, rx, ry, c, from, n) {
  for (let i = from; i < from + n; i++) {
    const [u, v, s] = CURLS[i % CURLS.length];
    const x = Math.floor(cx + u * rx), y = Math.floor(cy + v * ry);
    g.pixel(x, y, c); g.pixel(x + s, y + 1, c);
  }
}

/**
 * The panda, bottom-centre at (x, y).
 * pose: look -1..1 (face turns left/right), up 0..1 (looks up), breathe 0..1,
 * lift 0..1 (hanging from the claw by the head: body sags, feet drop),
 * squash 0..1 (landing), wave 0..1 (her left arm, viewer's left, raised), doze 0..1.
 */
export function drawPanda(g, x, y, pose = {}) {
  const { look = 0, up = 0, breathe = 0, lift = 0, squash = 0, wave = 0, doze = 0 } = pose;
  const kx = 1 + 0.1 * squash, ky = 1 - 0.14 * squash;
  const X = (lx) => x + lx * kx, Y = (ly) => y + ly * ky;
  const sag = lift * 3;                 // hanging: everything below the head stretches down
  const B = P.black, Cr = P.cream;

  // head position (it is what the claw holds when lifted)
  const hx = look * 0.8 + doze * 0.8, hy = -37 + doze * 1.5 + sag * 0;
  const body = (ly) => Y(ly + sag * (1 - (-ly) / 37));   // body points sag more near the seat

  // legs and big round feet, pointing at the viewer; hanging, they swing down
  for (const s of [-1, 1]) {
    const fx = X(s * (9 - lift * 2.5)), fy = body(-4.4) + lift * 3.5;
    shag(g, (X(s * 5.5) + fx) / 2, (body(-9) + fy) / 2, 4.4, 4.2, B, 11 + (s > 0 ? 1 : 0), 10);
    shag(g, fx, fy, 4.5, 4.4 + lift * 0.6, B, 13 + (s > 0 ? 1 : 0), 12, 0.3);
    g.fillEllipse(fx + s * 0.3, fy + 0.3, 2.3, 2.3, P.blackLit);           // the round sole
  }

  // torso: black shawl body, cream heart belly
  const by = -16 - breathe * 0.5;
  shag(g, X(0), body(by), 13.2 * kx, 12.2 * ky + breathe * 0.4, B, 21, 22, 0.4);
  // heart: two lobes up top meeting the shawl, the point down between the legs
  const hl = body(-15.6), hp = body(-3.8);
  g.fillCircle(X(-4.3), hl, 4.9, Cr);
  g.fillCircle(X(4.3), hl, 4.9, Cr);
  g.fillPolygon([[X(-9), hl + 1.2], [X(9), hl + 1.2], [X(0), hp]], Cr);
  g.fillEllipse(X(0), hl + 3.8, 6.4, 3.8, Cr);
  curls(g, X(0), hl + 2.5, 6, 4, P.creamShade, 0, 6);

  // arms, hanging at the sides (the viewer's left one can wave)
  for (const s of [-1, 1]) {
    const w = s < 0 ? wave : 0;
    const ax = s * 11, ay = -25;
    const hxA = s * (13.2 + w * 2.5 + lift * -1), hyA = -11.5 + lift * 2 - w * 24;
    const sx = X(ax), sy = body(ay), ex = X(hxA), ey = w > 0 ? Y(hyA) : body(hyA);
    g.thickLine(sx - s * 1.2, sy + 2, ex - s * 1.2, ey, 7.2, P.blackLit);   // a lit seam where the arm meets the body
    g.thickLine(sx, sy, ex, ey, 7.2, B);
    shag(g, ex, ey, 3.8, 3.8, B, 31 + (s > 0 ? 1 : 0), 9, 0.4);
  }

  // ears (behind the head), head
  const HX = X(hx), HY = Y(hy);
  for (const s of [-1, 1]) shag(g, HX + s * 10.2 * kx, HY - 9.0 * ky, 3.7, 3.6, B, 41 + (s > 0 ? 1 : 0), 10, 0.5);
  shag(g, HX, HY, 13.6 * kx, 11.6 * ky, Cr, 51, 28, 0.5);
  curls(g, HX, HY + 1, 11, 8, P.creamShade, 10, 9);

  // face: drooping teardrop patches, eyes lost inside, small low nose
  const fx = HX + look * 1.4, fy = HY - up * 1.2 + doze * 0.6;
  for (const s of [-1, 1]) {
    const ox = fx + s * 6.0, oy = fy + 2.0 + doze * 0.4, ix = fx + s * 1.9, iy = fy - 3.2;
    g.fillCircle(ox, oy, 3.4, B);
    g.fillPolygon([[ix - 1.1, iy - 0.4], [ix + 1.1, iy + 0.6], [ox + s * 2.6, oy - 1.2], [ox - s * 2.9, oy + 1.3]], B);
    g.fillCircle(ix + s * 0.3, iy + 0.4, 1.2, B);
    if (doze < 0.5) g.pixel(Math.floor(ox - s * 0.6 + look * 0.6), Math.floor(oy - 1 - up * 0.6), 0x6e6e7c);   // a glint of the eye inside
  }
  g.fillEllipse(fx, fy + 6.6, 2.3, 1.6, B);
  g.fillRect(Math.floor(fx), Math.floor(fy + 8), 1, 1, B);
}

/**
 * The puppy draped over the claw's hub at (hx, hy).
 * pose: ear -1..1 (ears swing sideways), lift 0..1 (ears blown up), look -1..1,
 * down 0..1 (looks down), kick 0..1 (hind paws paddle), sleep 0..1.
 */
export function drawPuppy(g, hx, hy, pose = {}) {
  const { ear = 0, flap = 0, look = 0, down = 0, kick = 0, sleep = 0 } = pose;
  const K = P.pupBlack, T = P.tan;
  // body slung over the hub: black back, a soft lit ridge
  g.fillEllipse(hx, hy - 1, 9.8, 4.6, K);
  g.hline(Math.floor(hx - 5), Math.floor(hy - 5), 9, P.pupLit);
  // front legs and mitten paws under the chin
  for (const s of [-1, 1]) {
    const k = kick * (s > 0 ? 1 : -1) * 1.2;
    const px = hx + s * 3.9 + ear * 0.8, py = hy + 16.4 + k;
    g.thickLine(hx + s * 3.6, hy + 9, px, py - 1.5, 3.8, K);
    g.fillEllipse(px, py, 2.8, 2.3, T);
    g.hline(Math.floor(px) - 1, Math.floor(py + 1.6), 3, P.tanShade);
    if (s > 0) g.fillRect(Math.floor(px + 1.4), Math.floor(py - 1), 1, 2, P.tag);   // the sewn-in tag
  }
  // head: wide and flat, black on top
  const HX = hx + look * 0.5, HY = hy + 5.6;
  g.fillEllipse(HX, HY, 8.2, 6.2, K);
  // long rounded ears hanging either side, past the jaw; a lit seam on the
  // inner edge parts them from the black head
  for (const s of [-1, 1]) {
    const tx = hx + s * (8.6 + flap * 2.5) + ear * 2.2, ty = hy + 12.6 - flap * 4;
    g.thickLine(hx + s * 6.0, hy + 2.0, tx - s * 1, ty, 5.4, P.pupLit);
    g.fillEllipse(tx - s * 1, ty, 2.8, 2.4, P.pupLit);
    g.thickLine(hx + s * 6.8, hy + 2.0, tx, ty, 5.4, K);
    g.fillEllipse(tx, ty, 2.8, 2.4, K);
  }
  // tan muzzle: a fat crescent of two puffy cheeks
  const mx = HX + look * 0.6;
  g.fillEllipse(mx, HY + 3.2, 6.2, 3.0, T);
  g.fillCircle(mx - 3.3, HY + 3.4, 2.9, T);
  g.fillCircle(mx + 3.3, HY + 3.4, 2.9, T);
  g.hline(Math.floor(mx - 4), Math.floor(HY + 1.2), 3, P.tanLit);      // lit tops of the cheeks
  g.hline(Math.floor(mx + 2), Math.floor(HY + 1.2), 3, P.tanLit);
  g.hline(Math.floor(mx - 3), Math.floor(HY + 6.2), 7, P.tanShade);    // under the chin
  // nose: a small rounded triangle of dark-brown felt
  g.fillPolygon([[mx - 2.1, HY + 1.4], [mx + 2.1, HY + 1.4], [mx, HY + 3.9]], P.nose);
  g.fillEllipse(mx, HY + 1.9, 2.0, 1.1, P.nose);
  // bead eyes, close together and high, each with a tan eyebrow dot
  for (const s of [-1, 1]) {
    const ex = Math.floor(mx + s * 2.6 + (s < 0 ? -1 : 0)), ey = Math.floor(HY - 1.6 + down * 0.8);
    g.pixel(ex + (s < 0 ? 0 : 0), ey - 2, P.tanLit);
    if (sleep > 0.5) { g.hline(ex - 1 + (s < 0 ? 1 : 0), ey + 1, 2, P.tanShade); continue; }
    g.fillRect(ex, ey, 2, 2, P.bead);
    g.pixel(ex + (look > 0.3 ? 1 : 0), ey, P.glint);
  }
}
