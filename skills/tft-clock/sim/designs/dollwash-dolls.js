// dollwash: the two plush dolls as vector rigs, drawn flat (colour blocks,
// no shading) from fills that can be moved, scaled and rotated freely:
// they tumble in the drum, hang from the line and fly between the two.
//
// Each doll is drawn in its own local units (1 unit = 1 px at scale 1),
// origin at the middle of the body, y down. `pose` gives the placement
// { x, y, s, rot } and a few continuous joint parameters, so every pose
// blends into every other without a jump.
//
// The puppy: short smooth plush, so smooth AA outlines.
// The panda: long looped pile, so every outline is a ragged polygon whose
// radius zigzags by a fixed per-vertex hash (it moves with the doll and
// never shimmers).

import { sin, cos, rand, mix, clamp, lerp } from '../js/kit.js';

export const PUP = {
  tan: 0xb8781a, tanLit: 0xe0a040, tanShade: 0x845618,
  black: 0x161412, ear: 0x161412, earRim: 0x4a4038, nose: 0x5a3a22, tag: 0x9a7ad8,
};
export const PANDA = { cream: 0xefeadf, shade: 0xd2cbbc, black: 0x141418, curl: 0x2e2e36 };

// ------------------------------------------------------------ transform

function xf(p) {
  const c = cos(p.rot || 0) * p.s, s = sin(p.rot || 0) * p.s;
  return {
    s: p.s,
    p: (lx, ly) => [p.x + lx * c - ly * s, p.y + lx * s + ly * c],
  };
}

/**
 * Points of an ellipse in local units (centre cx, cy; radii rx, ry; own tilt
 * a), mapped through T. `fuzz` > 0 zigzags the radius by up to that many
 * units: ragged pile.
 */
function ellPts(T, cx, cy, rx, ry, a = 0, n = 16, fuzz = 0, seed = 0) {
  const ca = cos(a), sa = sin(a), pts = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    let ex = rx * cos(t), ey = ry * sin(t);
    if (fuzz) {
      const k = (i & 1 ? 0.55 : -0.45) * fuzz * (0.6 + 0.8 * rand(seed, i));
      const r = Math.sqrt(ex * ex + ey * ey) || 1;
      ex += (ex / r) * k; ey += (ey / r) * k;
    }
    pts.push(T.p(cx + ex * ca - ey * sa, cy + ex * sa + ey * ca));
  }
  return pts;
}

const AA = { aa: true };
function ell(g, T, cx, cy, rx, ry, c, a = 0, n = 16, fuzz = 0, seed = 0) {
  g.fillPolygon(ellPts(T, cx, cy, rx, ry, a, n, fuzz, seed), c, AA);
}
function cap(g, T, x0, y0, x1, y1, w, c) {
  const [ax, ay] = T.p(x0, y0), [bx, by] = T.p(x1, y1);
  g.thickLine(ax, ay, bx, by, w * T.s, c, AA);
}
function dot(g, T, x, y, c, r = 0) {
  const [px, py] = T.p(x, y);
  if (r > 0) g.fillCircle(px, py, r * T.s, c, AA);
  else g.pixel(px, py, c);
}
function poly(g, T, pts, c) { g.fillPolygon(pts.map(([x, y]) => T.p(x, y)), c, AA); }

// ------------------------------------------------------------ the puppy

/**
 * pose: { x, y, s, rot,
 *   lie     0 sprawled (belly to us, legs out in an X) .. 1 lying flat, head on front paws
 *   flop    -1..1 extra swing of ears and legs (lags the motion)
 *   wet     0..1 darker, soaked
 *   glint   0..1 the bead eyes catch the light (0 = a "blink")
 *   look    -1..1 eyes shift sideways a hair }
 */
export function drawPuppy(g, pose) {
  const T = xf(pose);
  const lie = clamp(pose.lie ?? 0, 0, 1), flop = pose.flop ?? 0, wet = pose.wet ?? 0;
  const tan = mix(PUP.tan, PUP.tanShade, 0.65 * wet), black = PUP.black;
  const tanLit = mix(PUP.tanLit, PUP.tan, 0.6 * wet);

  // Joints, blended between the two poses.
  const headY = lerp(-9, -3.5, lie);
  const bodyY = lerp(5, -4.5, lie), bodyRy = lerp(9.5, 6.5, lie), bodyRx = lerp(8, 10.5, lie);
  // Front legs: sprawled up and out; lying, tucked under the chin.
  const fHip = [lerp(5.5, 3.5, lie), lerp(-1, 1, lie)];
  const fA = (pose.fA ?? lerp(1.95, 0.2, lie)) + 0.25 * flop;   // angle from straight down, outward
  const fL = lerp(9, 6.5, lie);
  // Hind legs: down and out; lying, splayed flat to the sides behind.
  const hHip = [lerp(5, 8, lie), lerp(10.5, -1, lie)];
  const hA = (pose.hA ?? lerp(0.62, 1.45, lie)) - 0.3 * flop;
  const hL = lerp(8, 5.5, lie);

  const legEnd = (side, hip, a, L) => [side * hip[0] + side * sin(a) * L, hip[1] + cos(a) * L];
  const legBlack = (side, hip, a, L) => {
    const [px, py] = legEnd(side, hip, a, L);
    cap(g, T, side * hip[0], hip[1], px, py, 5, black);
  };
  const paw = (side, hip, a, L, front) => {
    const [px, py] = legEnd(side, hip, a, L);
    // a stubby rounded tan mitten, a little longer than wide
    ell(g, T, px, py, 3.1, 2.6, tan, side * a, 12);
    if (front && side > 0) dot(g, T, px + 0.6, py + 0.8, PUP.tag); // the sewn-in tag on one paw
  };

  // Hind legs and the body (behind everything when lying).
  for (const sd of [-1, 1]) { legBlack(sd, hHip, hA, hL); paw(sd, hHip, hA, hL, false); }
  for (const sd of [-1, 1]) { legBlack(sd, fHip, fA, fL); if (lie < 0.5) paw(sd, fHip, fA, fL, true); }
  ell(g, T, 0, bodyY, bodyRx, bodyRy, black, 0, 18);
  if (lie < 0.85) {
    const k = 1 - lie / 0.85;
    ell(g, T, 0, bodyY + 0.6, 5 * k + 0.5, 7.4 * k + 0.5, tan, 0, 16);
    if (k > 0.5) { const [tx, ty] = T.p(2.2, bodyY + 4.5); g.fillRect(tx, ty, Math.max(1, 2 * T.s), 1, PUP.tag); }
  }

  drawPuppyHead(g, T, headY, pose, tan, tanLit);
  // lying, the chin rests on the two front mittens
  if (lie >= 0.5) for (const sd of [-1, 1]) paw(sd, fHip, fA, fL, true);
}

function drawPuppyHead(g, T, hy, pose, tan, tanLit) {
  const flop = pose.flop ?? 0;
  ell(g, T, 0, hy, 9.6, 7.4, PUP.black, 0, 20);                        // wide, flattened head
  // the muzzle: a fat tan crescent of two puffy cheeks and a bridge
  ell(g, T, -3.3, hy + 3.4, 4.6, 3.9, tan, 0, 14);
  ell(g, T, 3.3, hy + 3.4, 4.6, 3.9, tan, 0, 14);
  ell(g, T, 0, hy + 2.5, 3.6, 3.2, tan, 0, 12);
  // ears: long, soft, rounded, hanging below the jaw
  for (const side of [-1, 1]) {
    const tilt = side * (0.22 + 0.18 * flop * side);
    // a faint sheen on the plush along the ear's edge, so the black flap reads against the black head
    ell(g, T, side * 8.6, hy + 3.2, 3.0 + 0.9 / T.s, 6.9 + 0.7 / T.s, PUP.earRim, tilt, 14);
    ell(g, T, side * 8.6, hy + 3.2, 3.0, 6.9, PUP.ear, tilt, 14);
  }
  // nose: a rounded triangle of dark-brown felt in the middle of the tan
  poly(g, T, [[-2.3, hy + 1.2], [2.3, hy + 1.2], [1.6, hy + 2.6], [0, hy + 3.7], [-1.6, hy + 2.6]], PUP.nose);
  // bead eyes, close together, high, just above the muzzle, a tan brow dot over each
  const look = (pose.look ?? 0) * 0.4;
  for (const side of [-1, 1]) {
    dot(g, T, side * 2.6 + look, hy - 1.8, 0x000000, 1.25);
    if ((pose.glint ?? 1) > 0.5) dot(g, T, side * 2.6 + look - 0.5, hy - 2.4, 0xffffff);
    dot(g, T, side * 2.9, hy - 4.5, tanLit, 0.95);
  }
}

// ------------------------------------------------------------ the panda

/**
 * pose: { x, y, s, rot,
 *   legA    angle of the legs from straight down, outward (sitting ~0.45)
 *   legL    leg length as seen (short = pointing at us, sitting)
 *   armA    arms' swing out from hanging (0) .. raised (~2.5)
 *   armR    extra swing of the right arm (a wave)
 *   wet, glint }
 */
export function drawPanda(g, pose) {
  const T = xf(pose);
  const wet = pose.wet ?? 0;
  const cream = mix(PANDA.cream, 0xa8b0b8, 0.45 * wet), shade = mix(PANDA.shade, 0x9098a0, 0.45 * wet);
  const black = PANDA.black;
  const legA = pose.legA ?? 0.45, legL = pose.legL ?? 5.5;
  const armA = pose.armA ?? 0.15, armR = pose.armR ?? 0;

  // ears behind the head
  ell(g, T, -8.2, -21.2, 4.1, 4.0, black, 0, 12, 1.2, 11);
  ell(g, T, 8.2, -21.2, 4.1, 4.0, black, 0, 12, 1.2, 12);

  // torso: cream, slumped
  ell(g, T, 0, 3, 9.6, 9.4, cream, 0, 22, 1.3, 1);
  // the black shawl over the shoulders; its lower edge dips in the middle so the
  // cream below reads as the two lobes of a heart
  poly(g, T, [[-10.5, -3.5], [-7, -7.5], [7, -7.5], [10.5, -3.5], [10.2, 0.5], [7.6, 0.2], [5.6, -1.6], [3.4, -1.9],
    [1.4, -0.8], [0, 0.9], [-1.4, -0.8], [-3.4, -1.9], [-5.6, -1.6], [-7.6, 0.2], [-10.2, 0.5]], black);
  // legs, straight out in front, big round feet; their tops pinch the belly's
  // lower sides into the heart's point
  for (const side of [-1, 1]) {
    const hx = side * 4.6, hy = 8.6;
    const fx = hx + side * sin(legA) * legL, fy = hy + cos(legA) * legL;
    cap(g, T, hx, hy, fx, fy, 6.4, black);
    ell(g, T, fx + side * 0.3, fy + 0.6, 4.4, 4.2, black, 0, 14, 1.1, 20 + side);
  }
  ell(g, T, -5.8, 9.4, 2.6, 2.2, black, 0, 10, 0.8, 30);
  ell(g, T, 5.8, 9.4, 2.6, 2.2, black, 0, 10, 0.8, 31);
  // arms hang at the sides from the shawl
  for (const side of [-1, 1]) {
    const a = armA + (side > 0 ? armR : 0);
    const sx = side * 8.4, sy = -3.2;
    const ex = sx + side * sin(a) * 8.4, ey = sy + cos(a) * 8.4;
    cap(g, T, sx, sy, ex, ey, 6.2, black);
    ell(g, T, ex, ey, 3.4, 3.4, black, 0, 10, 1.0, 40 + side);
  }

  // the big round head
  ell(g, T, 0, -12.6, 10.6, 10.0, cream, 0, 30, 1.5, 2);
  // eye patches: slanting teardrops drooping outward and down from the bridge
  for (const side of [-1, 1]) {
    const tip = [side * 1.5, -16.4], ctr = [side * 5.0, -11.8], r = 2.9;
    const ux = ctr[0] - tip[0], uy = ctr[1] - tip[1], d = Math.hypot(ux, uy);
    const ang = Math.atan2(uy, ux), pts = [T.p(tip[0], tip[1])];
    for (let i = 0; i <= 10; i++) {
      const t = ang - Math.PI / 2 - 0.25 + (i / 10) * (Math.PI + 0.5);
      const rr = r + (i & 1 ? 0.35 : -0.2);
      pts.push(T.p(ctr[0] + rr * cos(t), ctr[1] + rr * sin(t)));
    }
    g.fillPolygon(pts, black, AA);
    // the bead eye is lost in the patch: only a faint glint gives it away
    if ((pose.glint ?? 1) > 0.5) dot(g, T, ctr[0] - side * 0.6, ctr[1] - 0.9, 0x6a6a78);
  }
  // small black rounded nose, low in the face
  ell(g, T, 0, -6.6, 1.9, 1.35, black, 0, 10);
  // a few curls of the looped pile, shaded cream on the white
  for (let i = 0; i < 14; i++) {
    const a = rand(i, 5) * 6.28, rr = 3 + rand(i, 6) * 6;
    const onHead = i < 8;
    const [x, y] = onHead ? [cos(a) * rr * 0.95, -12.6 + sin(a) * rr * 0.9] : [cos(a) * rr * 0.55, 4.5 + sin(a) * rr * 0.55];
    if (onHead && y > -15 && y < -8 && Math.abs(x) > 1 && Math.abs(x) < 8) continue; // keep the patches clean
    dot(g, T, x, y, shade);
  }
  dot(g, T, -9, 3, PANDA.curl); dot(g, T, 9, 2, PANDA.curl); dot(g, T, -4, -5.5, PANDA.curl); dot(g, T, 4.5, -5.5, PANDA.curl);
}
