// Raymarch — the time as four solid objects standing in a lit room.
//
// There is no GPU here, but a fragment shader is only a function of
// (x, y, time) run once per pixel, and that is exactly what frame() is. So
// this face is a real raymarcher: a signed-distance scene — the four digits
// as their own SDF letterforms, extruded into solid slabs; two tiers of
// stone to stand on; the floor; two colon markers afloat between the pairs —
// lit by a key light that sweeps across the room. Every pixel is a ray cast
// into that scene and marched. There is no sprite, no font, and nothing kept
// between frames.
//
// The time is carried by the objects, not drawn on them. The hours stand on
// the raised tier at the left and back; the minutes on the lower tier at the
// right and nearer, so each pair sits at its own height and its own depth in
// the room; the colon markers float in the step between them. At the
// minute turn the digit that changes physically sinks into the stone and the
// new one extrudes up out of it, hot at the cut. At the hour the room changes
// with it: the camera swings round, the key light rakes across, and the
// platform under the hours lifts and settles.
//
// Grey is a dither: the level each ray returns goes to the panel's ordered
// dither, and the shading is built for it. The letterform faces are lit
// nearly white so the time reads at arm's length; the extruded sides, the
// stone and the floor sit far down the ramp so the picture stays mostly black
// glass; the floor keeps a dim reflection of what stands on it.
//
// Cost. 8192 rays is far too many for JavaScript at 60 fps, so the field is
// marched at half resolution (64 x 32) and each sample becomes a 2 x 2 block
// of dithered pixels — a dither is what the panel does with grey anyway, so
// the block hides inside the shading. Rays that leave the room give up in a
// step or two; a glyph is only worked out in detail inside its bounding box,
// where its own distance is cheap, and outside it the box's distance is a
// valid, cheaper bound, so the march never looks closely at a glyph it is
// nowhere near. Normals are analytic (a glyph's are its 2-D gradient and its
// extrusion), so shading costs no extra scene calls.
//
// Burn-in: the key light and the camera never stop moving; the room walks a
// small square, taken up slowly during the minute, and the dither travels
// with the room, so a shaded surface lights different glass as it moves.

import { clamp, ease, dither } from '../js/kit.js';

// ============================================================ 2-D pens
//
// A glyph is a set of fat strokes: distances to capsules, to the outline of a
// rounded box, and to arcs. Every one is a lower bound on the true distance,
// so the raymarcher can trust them without overshooting.

const PEN = 0.285;                   // half the stroke width, in the glyph box

/** Distance to the capsule a-b with radius w. */
function sdSeg(px, py, ax, ay, bx, by, w) {
  const dx = bx - ax, dy = by - ay;
  let h = dx * dx + dy * dy;
  h = h > 1e-9 ? ((px - ax) * dx + (py - ay) * dy) / h : 0;
  h = h < 0 ? 0 : h > 1 ? 1 : h;
  const qx = px - ax - h * dx, qy = py - ay - h * dy;
  return Math.sqrt(qx * qx + qy * qy) - w;
}

/** Distance to a rounded box centred on the origin (r <= min(hx, hy)). */
function sdRBox(px, py, hx, hy, r) {
  const qx = (px < 0 ? -px : px) - hx + r, qy = (py < 0 ? -py : py) - hy + r;
  const ax = qx > 0 ? qx : 0, ay = qy > 0 ? qy : 0;
  const m = qx > qy ? qx : qy;
  return Math.sqrt(ax * ax + ay * ay) + (m < 0 ? m : 0) - r;
}

/** The outline of a rounded box: the machined, squared-off bowl. */
function sdSqRing(px, py, cx, cy, hx, hy, r, w) {
  const d = sdRBox(px - cx, py - cy, hx, hy, r);
  return (d < 0 ? -d : d) - w;
}

/** A circle outline. */
function sdRing(px, py, cx, cy, r, w) {
  const dx = px - cx, dy = py - cy;
  return Math.abs(Math.sqrt(dx * dx + dy * dy) - r) - w;
}

/**
 * An arc of a circle, sweeping counter-clockwise from a0 to a1 (a1 > a0,
 * span <= PI). Built as the ring cut by the two half-planes that bound the
 * wedge, so there is no trigonometry in the hot path.
 */
function sdArc(px, py, cx, cy, r, a0, a1, w) {
  const dx = px - cx, dy = py - cy;
  const l = Math.sqrt(dx * dx + dy * dy);
  let d = (l > r ? l - r : r - l) - w;
  const c0 = -dx * Math.sin(a0) + dy * Math.cos(a0);   // > 0 on the a0 side
  const c1 = -dx * Math.sin(a1) + dy * Math.cos(a1);   // > 0 past the a1 end
  if (-c0 > d) d = -c0;
  if (c1 > d) d = c1;
  return d;
}

/** As sdArc, for any span: a long sweep is two overlapping short ones. */
function sdArc2(px, py, cx, cy, r, a0, a1, w) {
  if (a1 - a0 <= Math.PI) return sdArc(px, py, cx, cy, r, a0, a1, w);
  const m = (a0 + a1) * 0.5;
  return Math.min(sdArc(px, py, cx, cy, r, a0, m, w), sdArc(px, py, cx, cy, r, m - 0.25, a1, w));
}

const D = Math.PI / 180;

// ------------------------------------------------------------ the ten digits
//
// One box, 2 wide by 3 tall, x in [-1, 1] and y in [-1.5, 1.5] (y up). Every
// digit is a union — a min — of pens, so the whole set is one family: squared
// bowls, straight rods, no serifs. 9 is 6 turned through half a turn, so the
// pair can never drift apart.
export function glyph2D(d, x, y) {
  switch (d) {
    case 0:
      return sdSqRing(x, y, 0, 0, 0.60, 1.06, 0.56, PEN);
    case 1:
      return Math.min(
        sdSeg(x, y, 0.16, -1.30, 0.16, 1.30, PEN),
        sdSeg(x, y, -0.50, 0.84, 0.16, 1.28, PEN),
        sdSeg(x, y, -0.60, -1.30, 0.78, -1.30, PEN));
    case 2:
      return Math.min(
        sdArc2(x, y, 0.02, 0.58, 0.68, -28 * D, 184 * D, PEN),
        sdSeg(x, y, 0.62, 0.26, -0.64, -1.30, PEN),
        sdSeg(x, y, -0.70, -1.30, 0.78, -1.30, PEN));
    case 3:
      return Math.min(
        sdArc2(x, y, -0.02, 0.62, 0.62, -70 * D, 176 * D, PEN),
        sdArc2(x, y, -0.02, -0.62, 0.66, -184 * D, 70 * D, PEN));
    case 4:
      return Math.min(
        sdSeg(x, y, 0.60, 1.30, -0.66, -0.30, PEN),
        sdSeg(x, y, 0.60, -1.30, 0.60, 1.30, PEN),
        sdSeg(x, y, -0.80, -0.30, 0.82, -0.30, PEN));
    case 5:
      return Math.min(
        sdSeg(x, y, -0.66, 1.30, 0.72, 1.30, PEN),
        sdSeg(x, y, -0.66, 1.26, -0.76, -0.52, PEN),
        sdArc2(x, y, 0.0, -0.55, 0.75, 180 * D, 372 * D, PEN));
    case 6:
      return Math.min(
        sdRing(x, y, 0.0, -0.62, 0.68, PEN),
        sdSeg(x, y, -0.68, -0.62, -0.62, 0.56, PEN),
        sdArc2(x, y, 0.0, 0.62, 0.62, 96 * D, 186 * D, PEN));
    case 7:
      return Math.min(
        sdSeg(x, y, -0.70, 1.30, 0.70, 1.30, PEN),
        sdSeg(x, y, 0.70, 1.28, 0.10, -0.05, PEN),
        sdSeg(x, y, 0.10, -0.05, -0.18, -1.30, PEN));
    case 8:
      return Math.min(
        sdSqRing(x, y, 0.0, 0.70, 0.52, 0.50, 0.46, PEN),
        sdSqRing(x, y, 0.0, -0.68, 0.62, 0.58, 0.54, PEN));
    default:                                    // 9: 6 half a turn round
      return glyph2D(6, -x, -y);
  }
}

// ============================================================ the room
//
// x right, y up, z towards the viewer. The floor is the half-space y < 0.
// The hours stand on a platform whose top is PLAT_Y and whose step edge is at
// x = 0; the minutes stand on the floor, nearer the viewer.

const DW = 1.90, DDH = 2.90;              // a digit: this wide, this tall
const SW2 = DW / 2, SH3 = DDH / 3;        // unit box -> world
const SU = Math.min(SW2, SH3);            // and the SDF's scale, conservatively
const BX = 1.02 * SW2, BY = 1.56 * SH3;   // the glyph's bounding box (a bound)

const GX = [-3.58, -1.40, 1.40, 3.58];    // glyph centres x
// The hours stand further back, so they are cut a little larger: the two
// pairs then read as one clock, and the depth shows in the parallax and the
// shadows rather than in a size the eye reads as two different faces.
let GS = [1.07, 1.07, 0.97, 0.97];
const GZB = [-0.58, -0.58, 0.20, 0.20];   // and the depth each pair stands at
const EXT_H = 0.42;                       // half the digits' depth (thick slabs)
// Every glyph lives inside this slab of z, whatever its digit or its height:
// outside it no glyph can be nearer than the slab itself, so the four of them
// cost nothing to a ray that is nowhere near the plane they stand in.
const GZLO = -1.02, GZHI = 0.64;
const FLOOR_Y = [1.00, 1.00, 0.18, 0.18]; // what each glyph stands on (animated)

let GY = [0, 0, 0, 0];                    // glyph centre heights (animated)
let GD = [0, 0, 0, 0];                    // the digit each glyph is showing
let GMOVE = [0, 0, 0, 0];                 // 1 while that glyph is in the air

const PLAT_Y0 = 0.52;                     // the hour tier's resting height
let PLAT_Y = PLAT_Y0;                     // (it lifts at the hour turn)
const PLAT2_Y = 0.18;                     // the minute tier, one step down
const PLAT_Z = -0.05, PLAT_HZ = 1.45;     // their depth: front face at +1.40

// colon markers
let COL_Y = [1.60, 2.62], COL_S = [1, 1];

// camera and light, computed once a frame
const EYE = [0, 3.55, 11.0], FWD = [0, 0, 0], RGT = [0, 0, 0], UPV = [0, 0, 0];
let TANH = 0.47, TANV = 0.235;
let LPX = 0, LPY = 0, LPZ = 0;            // key light position
let KEY = 1;                              // key light gain (the second's pulse)
let DOX = 0, DOY = 0;                     // the walk, in whole pixels: the
                                          // dither travels with the room, so
                                          // a dithered area never lights the
                                          // same glass twice a day.
let TARGET_Y = 1.80;

// ------------------------------------------------------------ the SDF
//
// Returns the distance to the nearest surface and records which body it was,
// for the shading. 0 the floor, 1 the platform, 2..5 the glyphs, 6/7 the
// markers.

let SID = 0;

function box3(px, py, pz, hx, hy, hz) {
  const qx = (px < 0 ? -px : px) - hx, qy = (py < 0 ? -py : py) - hy, qz = (pz < 0 ? -pz : pz) - hz;
  const mx = qx > 0 ? qx : 0, my = qy > 0 ? qy : 0, mz = qz > 0 ? qz : 0;
  const m = qx > qy ? (qx > qz ? qx : qz) : (qy > qz ? qy : qz);
  return Math.sqrt(mx * mx + my * my + mz * mz) + (m < 0 ? m : 0);
}

/** One glyph, a 2-D letterform extruded in z. */
function glyph3D(i, px, py, pz) {
  const s = GS[i];
  const qx = (px - GX[i]) / s, qy = (py - GY[i]) / s;
  const dz = (pz - GZB[i] < 0 ? GZB[i] - pz : pz - GZB[i]) - EXT_H;
  // Outside the box, the box's own distance bounds the glyph: the march takes
  // a long safe step, and the strokes are only worked out up close.
  const ax = qx < 0 ? -qx : qx, ay = qy < 0 ? -qy : qy;
  let d;
  if (ax > BX || ay > BY) {
    const ex = ax - BX > 0 ? ax - BX : 0, ey = ay - BY > 0 ? ay - BY : 0;
    d = Math.sqrt(ex * ex + ey * ey) * s;
  } else {
    d = glyph2D(GD[i], qx / SW2, qy / SH3) * SU * s;
  }
  return d > dz ? d : dz;
}

function scene(px, py, pz) {
  let d = py, id = 0;                                     // the floor, y < 0
  // Two tiers of stone: the hours' step, and the minutes' a step below it.
  const b = box3(px + 2.6, py - (PLAT_Y - 1.5), pz - PLAT_Z, 2.75, 1.5, PLAT_HZ);
  if (b < d) { d = b; id = 1; }
  const b2 = box3(px - 2.95, py - (PLAT2_Y - 1.5), pz - PLAT_Z, 2.85, 1.5, PLAT_HZ);
  if (b2 < d) { d = b2; id = 1; }
  // Every glyph stands inside one slab of z. Outside it the slab itself is a
  // valid bound, and a cheaper one than four box tests, so a ray on its way
  // in pays for nobody's letterform.
  if (pz > GZLO && pz < GZHI) {
    for (let i = 0; i < 4; i++) {
      const g = glyph3D(i, px, py, pz);
      if (g < d) { d = g; id = 2 + i; }
    }
  } else {
    const gz = pz < GZLO ? GZLO - pz : pz - GZHI;
    if (gz < d) { d = gz < 0.015 ? 0.015 : gz; id = 9; }  // a bound, not a body
  }
  // The two markers, bounded by one sphere: a ray that is nowhere near them
  // pays for one distance rather than two.
  {
    const mx = px, my = py - 2.20, mz = pz - 0.20;
    const ms = Math.sqrt(mx * mx + my * my + mz * mz) - 0.86;
    if (ms < d) {
      for (let k = 0; k < 2; k++) {
        const r = COL_S[k] * 0.215;
        const ax = px, ay = py - COL_Y[k], az = pz - 0.20;
        const m = Math.sqrt(ax * ax + ay * ay + az * az) - r;
        if (m < d) { d = m; id = 6 + k; }
      }
      if (ms > 0 && ms < d) { d = ms < 0.015 ? 0.015 : ms; id = 9; }
    }
  }
  SID = id;
  return d;
}

/** The room without its floor: what a floor pixel can see reflected in it. */
function sceneAbove(px, py, pz) {
  let d = 1e9;
  if (pz > GZLO && pz < GZHI) {
    for (let i = 0; i < 4; i++) {
      const g = glyph3D(i, px, py, pz);
      if (g < d) d = g;
    }
  }
  const b = box3(px + 2.6, py - (PLAT_Y - 1.5), pz - PLAT_Z, 2.75, 1.5, PLAT_HZ);
  if (b < d) d = b;
  const b2 = box3(px - 2.95, py - (PLAT2_Y - 1.5), pz - PLAT_Z, 2.85, 1.5, PLAT_HZ);
  return b2 < d ? b2 : d;
}

// ------------------------------------------------------------ march and shade

const STEPS = 44, EPS = 0.005, TMAX = 22;
let STEPS_TAKEN = 0;

/** March from o along d; returns the hit distance, or -1. */
function march(ox, oy, oz, dx, dy, dz) {
  let t = 0.05;
  for (let i = 0; i < STEPS; i++) {
    const d = scene(ox + dx * t, oy + dy * t, oz + dz * t);
    if (d < EPS && SID !== 9) { STEPS_TAKEN = i; return t; }
    t += d;                                // an id 9 bound is never under EPS
    if (t > TMAX) break;
  }
  STEPS_TAKEN = STEPS;
  return -1;
}

/** How much of the key light reaches p: a soft shadow from a short march. */
function shadow(px, py, pz, lx, ly, lz) {
  let t = 0.08, res = 1;
  for (let i = 0; i < 7; i++) {
    const d = scene(px + lx * t, py + ly * t, pz + lz * t);
    const h = 7 * d / t;
    if (h < res) res = h > 1 ? 1 : h;
    t += d + 0.14;
    if (t > 8) break;
  }
  return res < 0 ? 0 : res;
}

/** The floor's reflection: one short march up, and the light it catches. */
function reflect(px, py, pz, dx, dy, dz) {
  let t = 0.10;
  for (let i = 0; i < 9; i++) {
    const qx = px + dx * t, qy = py + dy * t, qz = pz + dz * t;
    const d = sceneAbove(qx, qy, qz);
    if (d < 0.03) {
      const e = 0.02;
      let nx = sceneAbove(qx + e, qy, qz) - sceneAbove(qx - e, qy, qz);
      let ny = sceneAbove(qx, qy + e, qz) - sceneAbove(qx, qy - e, qz);
      let nz = sceneAbove(qx, qy, qz + e) - sceneAbove(qx, qy, qz - e);
      const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      nx /= nl; ny /= nl; nz /= nl;
      if (ny < 0) ny = -ny;
      let lx = LPX - qx, ly = LPY - qy, lz = LPZ - qz;
      const ll = Math.sqrt(lx * lx + ly * ly + lz * lz) || 1;
      lx /= ll; ly /= ll; lz /= ll;
      let dif = nx * lx + ny * ly + nz * lz;
      dif = dif > 0 ? dif : 0;
      return (0.20 + 0.80 * dif) / (1 + 0.55 * t * t);
    }
    t += d;
    if (t > 11) break;
  }
  return 0;
}

/** One ray: march the room, shade what it hit, return a dither level 0..1. */
function trace(ox, oy, oz, dx, dy, dz) {
  const t = march(ox, oy, oz, dx, dy, dz);
  if (t < 0) return 0;                     // black glass, and nothing else
  const px = ox + dx * t, py = oy + dy * t, pz = oz + dz * t;
  const id = SID;
  const steps = STEPS_TAKEN;

  let nx, ny, nz, moving = 0, rim = 0;
  if (id === 0) { nx = 0; ny = 1; nz = 0; }
  else if (id === 1) {
    // A tier of stone is an axis-aligned box, so its normal is a sign, not a
    // gradient: whichever face the point is nearest to, and which way it faces.
    const tall = box3(px + 2.6, py - (PLAT_Y - 1.5), pz - PLAT_Z, 2.75, 1.5, PLAT_HZ);
    const low = box3(px - 2.95, py - (PLAT2_Y - 1.5), pz - PLAT_Z, 2.85, 1.5, PLAT_HZ);
    const up = tall <= low;
    const cx = up ? -2.6 : 2.95, hx = up ? 2.75 : 2.85;
    const cy = (up ? PLAT_Y : PLAT2_Y) - 1.5;
    const qx = (px - cx < 0 ? cx - px : px - cx) - hx;
    const qy = (py - cy < 0 ? cy - py : py - cy) - 1.5;
    const qz = (pz - PLAT_Z < 0 ? PLAT_Z - pz : pz - PLAT_Z) - PLAT_HZ;
    nx = 0; ny = 0; nz = 0;
    if (qx > qy && qx > qz) nx = px < cx ? -1 : 1;
    else if (qy > qz) ny = py < cy ? -1 : 1;
    else nz = pz < PLAT_Z ? -1 : 1;
  } else if (id === 6 || id === 7) { nx = 0; ny = 1; nz = 0; }
  else {
    // A glyph: the extrusion gives the front and back faces, the 2-D field
    // the sides, so the normal is analytic and needs no extra scene calls.
    const i = id - 2;
    const dz = pz - GZB[i];
    moving = GMOVE[i];
    const gi = GS[i];
    const qx = (px - GX[i]) / gi, qy = (py - GY[i]) / gi;
    if (Math.abs(dz) > EXT_H - 0.008) {
      nx = 0; ny = 0; nz = dz < 0 ? -1 : 1;
    } else {
      const e = 0.014;
      const a = glyph2D(GD[i], (qx + e) / SW2, qy / SH3);
      const b = glyph2D(GD[i], (qx - e) / SW2, qy / SH3);
      const c = glyph2D(GD[i], qx / SW2, (qy + e) / SH3);
      const f = glyph2D(GD[i], qx / SW2, (qy - e) / SH3);
      nx = a - b; ny = c - f; nz = 0;
      const nl = Math.sqrt(nx * nx + ny * ny) || 1;
      nx /= nl; ny /= nl;
    }
  }

  // Key light, plus the room's ambient. A glyph's face is nearly self-lit, so
  // the time always reads, whatever the light is doing.
  let lx = LPX - px, ly = LPY - py, lz = LPZ - pz;
  const ll = Math.sqrt(lx * lx + ly * ly + lz * lz) || 1;
  lx /= ll; ly /= ll; lz /= ll;
  let dif = nx * lx + ny * ly + nz * lz;
  dif = dif > 0 ? dif : 0;
  const sh = (dif > 0.02 && (id === 0 || id === 1 || id >= 6))
    ? shadow(px + nx * 0.035, py + ny * 0.035, pz + nz * 0.035, lx, ly, lz) : (dif > 0.02 ? 1 : 0);
  const sky = 0.5 + 0.5 * ny;
  const front = -(nx * dx + ny * dy + nz * dz);

  let lvl, alb, ao = 1;
  if (id === 0) { alb = 0.08; ao = clamp(1 - 0.3 * steps / STEPS, 0.82, 1); }
  else if (id === 1) {
    alb = ny > 0.5 ? 0.44 : 0.08; ao = clamp(1 - 0.3 * steps / STEPS, 0.82, 1);
    // The lit lip along each step's top-front edge: one bright line, which is
    // all a 1-bit picture needs to say "this is a block of stone".
    const ez = pz - (PLAT_Z + PLAT_HZ);
    const ey = py - PLAT_Y;
    let er = 0.22 - Math.abs(Math.sqrt(ey * ey + ez * ez) - 0.06);
    if (!(er > 0 && px > -5.5 && px < 0.3)) er = 0;
    const fy = py - PLAT2_Y;
    let er2 = 0.20 - Math.abs(Math.sqrt(fy * fy + ez * ez) - 0.05);
    if (!(er2 > 0 && px > 0.2 && px < 5.9)) er2 = 0;
    if (er2 > er) er = er2;
    if (er > 0) rim = er * 2.6;
  }
  else if (id >= 6) alb = 0.95;
  else alb = 0.92;

  // The key light falls off with distance, so the room has a bright end
  // and a dark end and the surfaces that face it read as surfaces.
  lvl = alb * (0.06 * sky + 0.95 * dif * sh) / (1 + 0.012 * ll * ll) * KEY * ao;
  if (id >= 2 && id < 6) {
    // The face of a letterform is self-lit: the time reads whatever the key
    // light is doing, and the room's light moves the shading round it.
    lvl += clamp((front - 0.28) / 0.5, 0, 1);
    // While a digit is in the air the stone under it is still hot.
    if (moving && py < FLOOR_Y[id - 2] + 0.22) lvl += 0.6;
  } else if (id === 6 || id === 7) lvl += 0.75 * COL_S[id - 6];
  if (rim > 0) lvl += rim > 1 ? 1 : rim;

  // A polished floor: what the room throws back, and a sheen where the key
  // light grazes off it towards the eye.
  if (id === 0 && dy < -0.02) {
    const r = reflect(px, py, pz, dx, -dy, dz);
    if (r > 0.002) lvl += 0.26 * r;
    const hx = lx, hy = ly + 1, hz = lz;
    const hlen = Math.sqrt(hx * hx + hy * hy + hz * hz) || 1;
    const spec = (hx * nx + hy * ny + hz * nz) / hlen;
    if (spec > 0.86) lvl += 8 * (spec - 0.86) * (spec - 0.86);
  }

  // Distance fade, so the floor's far edge melts into the black glass.
  let fade = 1;
  if (id === 0 && t > 5) fade = clamp(1 - (t - 5) / 8, 0, 1);
  lvl *= fade;

  // The dither's floor: any level that would light only a speckle or two in a
  // block is simply black. A dim room reads as black glass, not as dust.
  return lvl < 0.115 ? 0 : lvl;
}

// ============================================================ the schedule

const SW = 64, SH = 32;                   // field samples: 2 x 2 pixels each
const LEVEL = new Float32Array(SW * SH);

const SINK0 = 59.40, SINK1 = 60.0;        // the changing digit sinks into the
const RISE = 0.85;                        // stone, and the new one extrudes up

/** Ease of the rise: a small overshoot, so the stone settles with a knock. */
const riseEase = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : ease.outBack(u));

/** The burn-in walk: where the camera stands for this minute. */
function walk(date) {
  const ph = (date.getTime() - 30000) / 120000;
  const i = Math.floor(ph), f = ph - i;
  const path = [[-3, -3], [0, -3], [3, -3], [3, 0], [3, 3], [0, 3], [-3, 3], [-3, 0]];
  const n = path.length;
  const a = path[((i % n) + n) % n], b = path[(((i + 1) % n) + n) % n];
  const u = clamp((f - 0.85) / 0.15, 0, 1);
  const w = u * u * (3 - 2 * u);
  return [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w];
}

/** Everything the frame depends on, worked out from the clock alone. */
function place(date, f) {
  const s = f.sec;
  const t = date.getTime() / 1000;
  const prev = new Date(date.getTime() - 60000);
  const ch = String(f.h).padStart(2, '0') + f.mm;
  const ph = String(prev.getHours()).padStart(2, '0') + String(prev.getMinutes()).padStart(2, '0');

  // The hour: the platform lifts, the camera swings round, the light rakes.
  const hs = f.m === 0 ? s : 999;
  const hourK = hs < 7 ? Math.exp(-Math.max(0, hs - 0.5) / 1.6) : 0;
  const lift = hs < 7 ? ease.inOutCubic(clamp(hs / 1.2, 0, 1)) * Math.exp(-Math.max(0, hs - 2.4) / 1.5) : 0;
  PLAT_Y = PLAT_Y0 + 0.26 * lift;
  FLOOR_Y[0] = FLOOR_Y[1] = PLAT_Y;

  // The letterforms breathe by a few per cent on a long cycle of their own:
  // the strokes' edges cross the pixel grid, so no pixel of a stroke is lit
  // for every hour of the day. This has to be settled before the glyphs are
  // placed: nothing in a frame may depend on the frame before it.
  const br = 1 + 0.045 * Math.sin(t * 0.0163);
  GS[0] = GS[1] = 1.07 * br; GS[2] = GS[3] = 0.97 * (2 - br);

  // Which glyphs are in the air this second: the ones whose digit changed.
  // Sinking before the turn (the old time is still the time), rising after.
  const sink = s > SINK0 ? (s - SINK0) / (SINK1 - SINK0) : 0;
  const rise = s < RISE ? riseEase(s / RISE) : 1;
  for (let i = 0; i < 4; i++) {
    const now = ch.charCodeAt(i) - 48, then = ph.charCodeAt(i) - 48;
    // The digit on show is always the current minute's, before and after the
    // turn: it is the one that sinks, and the new one that comes up.
    GD[i] = now; GMOVE[i] = 0;
    if (now !== then) GMOVE[i] = 1;
    let dy = 0;
    if (GMOVE[i]) dy = -(1 - (sink > 0 ? riseEase(sink) : rise)) * 3.7;
    GY[i] = FLOOR_Y[i] + DDH * GS[i] / 2 + dy;
  }

  // The burn-in walk: the whole room is shifted a few pixels, taken up slowly
  // during the minute, so no pixel of a letterform stays lit all day.
  const [wx, wy] = walk(date);
  DOX = wx * 1.2; DOY = wy * 1.2;
  // The letterforms breathe by a few per cent on a long cycle of their own:
  // the strokes' edges cross the pixel grid, so no pixel of a stroke is lit
  // for every hour of the day.

  const drift = 0.055 * Math.sin(t * 0.171) + 0.032 * Math.sin(t * 0.1013);
  const yaw = 0.15 + drift + 0.13 * hourK * Math.cos((hs - 0.5) * 1.5);
  const pitch = 0.05 * Math.sin(t * 0.077 + 1.3) + 0.06 * hourK;

  // A long lens, a low eye: the digits stand up and the floor runs away.
  const R = 12.0, th = yaw;
  const tx = 0.10 * wx, ty = TARGET_Y + 0.10 * wy + 0.07 * lift;
  const ex = Math.sin(th) * R + tx, ey = ty + 4.13 + pitch * 4, ez = Math.cos(th) * R;
  EYE[0] = ex; EYE[1] = ey; EYE[2] = ez;
  let fx = tx - ex, fy = ty - ey, fz = -ez;
  const fl = Math.sqrt(fx * fx + fy * fy + fz * fz) || 1;
  fx /= fl; fy /= fl; fz /= fl;
  FWD[0] = fx; FWD[1] = fy; FWD[2] = fz;
  let rx = -fz, rz = fx;
  const rl = Math.sqrt(rx * rx + rz * rz) || 1;
  rx /= rl; rz /= rl;
  RGT[0] = rx; RGT[1] = 0; RGT[2] = rz;
  UPV[0] = -fx * fy; UPV[1] = fx * fx + fz * fz; UPV[2] = -fz * fy;
  TANV = 0.248;
  TANH = TANV * (128 / 64);

  // The key light: it walks round the room, and the light itself beats once a
  // second, so the scene is alive between the turns as well as at them.
  const la = 0.98 * Math.sin(t * 0.132 + 0.7) + (hs < 7 ? 1.5 * Math.exp(-hs / 1.2) : 0);
  LPX = 5.6 * Math.sin(la);
  LPY = 6.8 + 1.1 * Math.sin(t * 0.081);
  LPZ = 4.6 * Math.cos(la) + 0.7;
  const beat = s - Math.floor(s);
  KEY = 0.94 + 0.06 * Math.exp(-beat * 3.2);

  // The markers beat once a second, and lift a little with the beat: the
  // colon is never still, and it is never unreadable either.
  const bp = Math.exp(-beat * 2.6);
  COL_Y[0] = 1.72 + 0.05 * bp; COL_Y[1] = 2.68 - 0.05 * bp;
  COL_S[0] = 0.80 + 0.55 * bp;
  COL_S[1] = 0.80 + 0.55 * bp;
}

// ============================================================ the face

export default {
  name: 'Raymarch',
  blurb: 'The time as four solid objects in a lit room: a real raymarched SDF scene, where the changing digit sinks into the stone and the new one extrudes back up out of it.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  driver: 'full',

  frame(g, { date, fields: f, oled, night }) {
    place(date, f);
    const sw = 2 / SW, sh = 2 / SH;
    for (let sy = 0; sy < SH; sy++) {
      const py = 1 - (sy + 0.5) * sh;
      for (let sx = 0; sx < SW; sx++) {
        const px = (sx + 0.5) * sw - 1;
        const dx = FWD[0] + RGT[0] * px * TANH + UPV[0] * py * TANV;
        const dy = FWD[1] + RGT[1] * px * TANH + UPV[1] * py * TANV;
        const dz = FWD[2] + RGT[2] * px * TANH + UPV[2] * py * TANV;
        const dl = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
        LEVEL[sy * SW + sx] = trace(EYE[0], EYE[1], EYE[2], dx / dl, dy / dl, dz / dl);
      }
    }
    // One sample to a 2 x 2 block. The dither is the panel's only grey, and
    // it is tied to the room rather than to the glass, so a shaded surface
    // lights different pixels as the room walks.
    g.fillWhere((x, y, ix, iy) => {
      const lv = LEVEL[(iy >> 1) * SW + (ix >> 1)];
      return lv > 0.115 && dither(ix - DOX, iy - DOY, lv);
    });
    oled.contrast(0xcf + (0x1e - 0xcf) * night);
  },
};
