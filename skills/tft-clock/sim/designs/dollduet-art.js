// dollduet: the two dolls, drawn from flat shapes every frame (hard pixels).
//
// Puppy: lying flat facing us, head resting on its front paws, hind legs
// splayed out to the sides (its natural beanbag pose, which doubles as a
// skydiver's when it floats). Wide flattened black head, two long black ears
// hanging past the jaw, a wide puffy tan muzzle (two round cheeks, a fat
// crescent), small rounded-triangle dark-brown felt nose in the tan, two
// close-set shiny bead eyes with a tan eyebrow dot above each, four stubby
// tan mitten paws, a lavender tag on one front paw. Short plush: a few fuzz
// pixels on the edges.
//
// Panda: sitting slumped, legs straight out at us so the big round black
// feet face the viewer. Big round cream head with a ragged looped-pile edge,
// round black ears on the top corners, big teardrop eye patches drooping
// outward and down from the bridge of the nose (sleepy-sad), the eyes lost in
// them (a dull bead glint only), small black nose low in the face; a black
// shawl over the shoulders running into the two hanging arms, cream heart
// belly, black legs. Every edge is frizzed with little loop tufts and the
// pile is stippled with loops.
//
// Light comes from the upper left: one lit and one shaded tone per material,
// flat, no gradients.
import { hex, hash, sin, cos, to565, from565 } from '../js/kit.js';

export const PUP = {
  tan: hex('#b8781a'), lit: hex('#e0a040'), shade: hex('#845618'),
  black: hex('#161412'), ear: hex('#1f1b18'), rim: hex('#463c32'),
  nose: hex('#5a3a22'), noseLit: hex('#7a5436'), tag: hex('#9a7ad8'),
  eye: hex('#040303'), glint: hex('#f4f0ea'), brow: hex('#d09038'),
};
export const PAN = {
  cream: hex('#efeadf'), shade: hex('#d2cbbc'), deep: hex('#b8b0a0'),
  black: hex('#141418'), loop: hex('#30303a'), glint: hex('#6e6e7c'),
};

const h01 = (a, b = 0, c = 0) => hash(a, b, c) / 4294967296;

// ------------------------------------------------------------ helpers

// A capsule (thick segment) with round ends, hard edges.
function cap(g, x0, y0, x1, y1, r, c) {
  g.thickLine(x0, y0, x1, y1, r * 2, c);
}

// Little loop tufts round an ellipse: the ragged edge of long curly pile.
function frizzEllipse(g, cx, cy, rx, ry, c, n, seed, amp = 1, a0 = 0, a1 = Math.PI * 2) {
  for (let i = 0; i < n; i++) {
    const a = a0 + ((i + 0.5 + (h01(i, seed) - 0.5) * 0.6) / n) * (a1 - a0);
    const k = 0.15 + h01(i, seed, 7) * amp;
    const x = cx + (rx + k) * sin(a), y = cy - (ry + k) * cos(a);
    g.fillCircle(x, y, 0.9 + h01(i, seed, 3) * 0.6, c);
  }
}

// Tufts along both sides of a capsule.
function frizzCap(g, x0, y0, x1, y1, r, c, n, seed, amp = 1) {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L, ny = dx / L;
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n, side = i % 2 ? 1 : -1;
    const k = r + 0.1 + h01(i, seed) * amp;
    g.fillCircle(x0 + dx * u + nx * k * side, y0 + dy * u + ny * k * side, 0.9 + h01(i, seed, 5) * 0.5, c);
  }
  // round end
  for (let i = 0; i < 4; i++) {
    const a = Math.atan2(dy, dx) + (i - 1.5) * 0.7;
    const k = r + 0.1 + h01(i, seed, 9) * amp;
    g.fillCircle(x1 + Math.cos(a) * k, y1 + Math.sin(a) * k, 1.0, c);
  }
}

const rounded = (c) => from565(to565(c));

// Precomputed stipple point lists (flash on the device): [x, y] in the
// doll's frame, chosen once by hash.
function points(box, density, seed) {
  const [bx, by, bw, bh] = box, out = [];
  for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) if (h01(bx + i, by + j, seed) < density) out.push([bx + i, by + j]);
  return out;
}
function applyPoints(g, pts, ox, oy, map) {
  for (const [px, py] of pts) {
    const x = Math.round(ox + px), y = Math.round(oy + py);
    const to = map.get(g.get(x, y));
    if (to !== undefined) g.pixel(x, y, to);
  }
}

// ------------------------------------------------------------ panda

const PAN_HEAD_PTS = points([-13, -12, 26, 24], 0.13, 41);
const PAN_BODY_PTS = points([-16, -26, 32, 26], 0.12, 43);
let PAN_MAP = null;

/**
 * The panda, sitting on the floor at (x, y) = its centre line, floor.
 * o: { hx, hy head offset, gx, gy gaze (-1..1), blink 0..1, sleep,
 *      armL, armR (radians from hanging, outward/up positive), slump (px),
 *      lift (feet raised px) }
 */
export function drawPanda(g, x, y, o = {}) {
  const C = PAN;
  if (!PAN_MAP) PAN_MAP = new Map([[rounded(C.cream), C.shade], [rounded(C.black), C.loop]]);
  const hx = x + (o.hx ?? 0), hy = y + (o.hy ?? 0) - 35 + (o.slump ?? 0) * 0.5;
  const gx = o.gx ?? 0, gy = o.gy ?? 0;
  const lift = o.lift ?? 0;

  // body: black torso, legs, feet
  const ty = y - 13 + (o.slump ?? 0) * 0.3;
  g.fillEllipse(x, ty, 13, 11.5, C.black);
  frizzEllipse(g, x, ty, 13, 11.5, C.black, 22, 11, 1.1, -2.2, 2.2);
  // shawl band over the shoulders (under the head)
  g.fillEllipse(x, ty - 7.5, 13.5, 4.6, C.black);
  frizzEllipse(g, x, ty - 7.5, 13.5, 4.6, C.black, 14, 13, 1.0, -1.7, 1.7);

  // heart belly, right under the shawl
  g.fillCircle(x - 5.0, ty + 0.4, 5.6, C.cream);
  g.fillCircle(x + 5.0, ty + 0.4, 5.6, C.cream);
  g.fillPolygon([[x - 10.5, ty + 2.2], [x + 10.5, ty + 2.2], [x, ty + 10.2]], C.cream);
  // its lower-right side in the shade tone (light from the upper left)
  g.fillPolygon([[x + 3.5, ty + 4.0], [x + 10.5, ty + 2.2], [x, ty + 10.2]], C.shade);

  // legs stuck out at us: short black stubs and big round feet, soles to us
  for (const s of [-1, 1]) {
    const fx = x + s * 10.4, fy = y - 5.6 - lift;
    frizzEllipse(g, fx, fy, 5.4, 5.4, C.black, 12, 20 + s, 0.9);
    g.fillCircle(fx, fy, 5.6, C.loop);
    g.fillCircle(fx + 0.4, fy + 0.4, 4.4, C.black);
  }

  // arms: hang from the shawl, swing by angle
  const arm = (s, ang) => {
    const sx = x + s * 10.2, sy = ty - 6.5;
    const a = 0.16 + ang;                     // from straight down, outward
    const px = sx + s * Math.sin(a) * 11.5, py = sy + Math.cos(a) * 11.5;
    frizzCap(g, sx, sy, px, py, 3.7, C.black, 9, 30 + s, 1.0);
    cap(g, sx, sy, px, py, 3.9, C.loop);
    g.fillCircle(px, py, 4.5, C.loop);
    cap(g, sx, sy, px, py, 3.1, C.black);
    g.fillCircle(px, py, 3.7, C.black);
    return [px, py];
  };
  const pawL = arm(-1, o.armL ?? 0);
  const pawR = arm(1, o.armR ?? 0);

  applyPoints(g, PAN_BODY_PTS, x, y, PAN_MAP);

  // head: ears first, then the round cream face with its ragged edge
  for (const s of [-1, 1]) {
    const ex = hx + s * 9.8, ey = hy - 9.4;
    g.fillCircle(ex, ey, 4.5, C.black);
    frizzEllipse(g, ex, ey, 4.5, 4.5, C.black, 10, 50 + s, 1.0);
  }
  g.fillEllipse(hx, hy, 12.6, 11.6, C.cream);
  frizzEllipse(g, hx, hy, 12.6, 11.6, C.cream, 34, 61, 1.2);
  // a shaded lower-right crescent of the face (flat tone)
  g.fillWhere((px, py) => {
    const u = (px - hx) / 12.6, v = (py - hy) / 11.6;
    if (u * u + v * v > 1) return false;
    const u2 = (px - hx + 2.4) / 12.6, v2 = (py - hy + 2.4) / 11.6;
    return u2 * u2 + v2 * v2 > 1;
  }, C.shade, [hx - 13, hy - 12, 27, 25]);

  // eye patches: teardrops drooping outward and down from the bridge
  const fx = hx + gx * 1.2, fy = hy + gy * 1.0;
  for (const s of [-1, 1]) {
    const ax = fx + s * 1.9, ay = fy - 4.4, bx = fx + s * 6.4, by = fy + 1.6;
    for (let k = 0; k <= 5; k++) {
      const u = k / 5;
      g.fillCircle(ax + (bx - ax) * u, ay + (by - ay) * u, 1.0 + 2.2 * u * u * (3 - 2 * u), C.black);
    }
    // the bead, lost in the patch: a dull glint that blinks
    if (!o.sleep && (o.blink ?? 0) < 0.5) g.pixel(fx + s * 4.2 + (s > 0 ? -1 : 0) + gx * 0.6, fy - 0.8 + gy * 0.6, C.glint);
  }
  // nose, low in the face, and a tiny mouth
  g.fillEllipse(fx, fy + 5.3, 2.2, 1.5, C.black);
  g.pixel(fx, fy + 7.4, C.deep);
  applyPoints(g, PAN_HEAD_PTS, hx, hy, PAN_MAP);
  return { pawL, pawR, head: [hx, hy] };
}

// ------------------------------------------------------------ puppy

const PUP_PTS = points([-30, -24, 60, 24], 0.05, 77);
let PUP_MAP = null;

/**
 * The puppy, lying at (x, y) = centre line, floor.
 * o: { sx, sy squash, hy head lift px, gx, gy gaze, blink, sleep,
 *      earL, earR (radians: + flies out/up, - swings in over the eyes),
 *      droop (paws hang lower when airborne, px), bounce (body hop px) }
 */
export function drawPuppy(g, x, y, o = {}) {
  const C = PUP;
  if (!PUP_MAP) PUP_MAP = new Map([[rounded(C.black), C.rim], [rounded(C.tan), C.lit]]);
  const sx = o.sx ?? 1, sy = o.sy ?? 1;
  const X = (lx) => x + lx * sx, Y = (ly) => y + ly * sy;
  const droop = o.droop ?? 0;
  const hl = o.hy ?? 0;                 // head lift (px, up positive)
  const gx = o.gx ?? 0, gy = o.gy ?? 0;

  // hind legs, splayed out to the sides behind the body
  for (const s of [-1, 1]) {
    cap(g, X(s * 12), Y(-8.5), X(s * 19.5), Y(-5.4 + droop * 0.6), 4.2 * sy, C.black);
    g.fillEllipse(X(s * 23.4), Y(-3.9 + droop), 5.4 * sx, 3.5 * sy, C.shade);
    g.fillEllipse(X(s * 23.4 - 0.5), Y(-4.5 + droop), 4.8 * sx, 2.8 * sy, C.tan);
    g.fillEllipse(X(s * 23.4 - 1.4), Y(-5.6 + droop), 2.6 * sx, 0.9 * sy, C.lit);
  }
  // back: a black beanbag hump behind the head
  g.fillEllipse(X(0), Y(-11), 17 * sx, 9 * sy, C.black);

  // head resting on the paws: wide, flattened, black on top
  const hy = -14 - hl;
  const HX = X(0), HY = Y(hy);
  g.fillEllipse(HX, HY, 13.6 * sx, 9 * sy, C.black);
  g.fillWhere((px, py) => {
    const u = (px - HX) / (13.6 * sx), v = (py - HY) / (9 * sy);
    if (u * u + v * v > 1) return false;
    const u2 = (px - HX - 1.1) / (13.6 * sx), v2 = (py - HY - 1.3) / (9 * sy);
    return u2 * u2 + v2 * v2 > 1 && v < 0;
  }, C.rim, [HX - 15, HY - 10, 30, 11]);
  // tan muzzle: two puffy cheeks and the jaw between, a fat crescent
  const mx = HX + gx * 0.8, my = HY + gy * 0.5;
  g.fillEllipse(mx, my + 5.9 * sy, 8.6 * sx, 3.2 * sy, C.shade);
  for (const s of [-1, 1]) g.fillCircle(mx + s * 4.7 * sx, my + 4.4 * sy, 4.7 * Math.min(sx, sy), C.tan);
  g.fillEllipse(mx, my + 5.3 * sy, 8.3 * sx, 2.9 * sy, C.tan);
  g.fillEllipse(mx, my + 3.0 * sy, 2.8 * sx, 2.2 * sy, C.tan);
  for (const s of [-1, 1]) g.fillEllipse(mx + s * 5.0 * sx - 0.7, my + 2.1 * sy, 2.0 * sx, 0.9 * sy, C.lit);
  // nose: a small rounded triangle of brown felt
  g.fillPolygon([[mx - 2.3 * sx, my + 2.0 * sy], [mx + 2.3 * sx, my + 2.0 * sy], [mx, my + 4.7 * sy]], C.nose);
  g.fillEllipse(mx, my + 2.4 * sy, 2.1 * sx, 0.9 * sy, C.nose);
  g.pixel(mx - 1, my + 2.0 * sy, C.noseLit);
  // bead eyes high above the muzzle, tan eyebrow dots
  for (const s of [-1, 1]) {
    const ex = Math.round(mx + s * 2.9 * sx - 0.5 - (s < 0 ? 0.5 : -0.5)), ey = Math.round(my - 2.2 * sy);
    if (o.sleep || (o.blink ?? 0) >= 0.5) {
      g.hline(ex, ey + 1, 2, C.rim);
    } else {
      g.fillRect(ex, ey, 2, 2, C.eye);
      g.pixel(ex + (gx > 0.3 ? 1 : 0), ey, C.glint);
    }
    g.pixel(ex + (s < 0 ? 0 : 1), ey - 2, C.brow);
  }

  // ears: long soft black flaps hanging past the jaw, narrow at the top and
  // round at the bottom, a lighter seam round each
  const ear = (s, ang) => {
    const ax = X(s * 10.6), ay = Y(hy - 5.5);
    const a = 0.3 + ang;                      // from straight down, outward
    const L = 10.6;
    const tx = ax + s * Math.sin(a) * L * sx, ty = ay + Math.cos(a) * L * sy;
    for (const [c, d] of [[C.rim, 0.8], [C.ear, 0]])
      for (let k = 0; k <= 5; k++) {
        const u = k / 5;
        g.fillCircle(ax + (tx - ax) * u, ay + (ty - ay) * u, 1.7 + 1.7 * u * u * (3 - 2 * u) + d, c);
      }
    return [tx, ty];
  };
  ear(-1, o.earL ?? 0);
  ear(1, o.earR ?? 0);

  // front paws, out in front under the chin (nearest us, drawn last)
  for (const s of [-1, 1]) {
    const px = X(s * 7.4), py = Y(-2.8 + droop * 0.5);
    g.fillEllipse(px, py, 5.4 * sx, 3.4 * sy, C.shade);
    g.fillEllipse(px - 0.3, py - 0.2, 4.6 * sx, 2.6 * sy, C.tan);
    g.fillEllipse(px - 1.2, py - 1.3, 2.4 * sx, 0.9 * sy, C.lit);
  }
  g.fillRect(Math.round(X(9.4)), Math.round(Y(-2.6 + droop * 0.5)), 2, 2, C.tag);

  applyPoints(g, PUP_PTS, x, y, PUP_MAP);
  return { head: [HX, HY], pawR: [X(22.5), Y(-4 + droop)], pawL: [X(-22.5), Y(-4 + droop)] };
}
