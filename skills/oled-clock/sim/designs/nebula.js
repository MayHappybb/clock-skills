// Nebula — a volumetric raymarch: the camera drifts, forever, through an
// endless cloud of glowing, self-shadowed fog.
//
// There is no GPU here, but a fragment shader is only a function of
// (x, y, time) run once per pixel, and that is what frame() is. So this is a
// real volumetric renderer, written as one: for every pixel a ray is marched
// through a 3-D fractal density field, and along the ray emission is
// accumulated and light absorbed -- the emission-absorption integral, in the
// usual Beer-Lambert form. Nothing is a sprite; nothing is kept between
// frames; the same t gives the same sky.
//
// The field is value noise in three octaves. The low one, thresholded hard,
// is the body of the cloud: it is the reason there is empty space at all.
// Most of the volume has to be exactly zero or a ray through it can never be
// black -- thirty samples through even a lightly fogged column add up, and
// the picture turns to flat grey plate. The second octave's ridges are the
// wisps: the thin sheets where it crosses its own middle, so a ray meets a
// few strands with gaps between them rather than one wall. The third, finest
// octave is asked for only inside a sheet and threads it. No two octaves
// share a velocity, so the cloud does not merely slide past the eye: it
// churns from the inside while it streams.
//
// Shading. A dense sample is lit from one direction: a short march toward the
// light returns how much cloud stands in the way, so a core casts its shadow
// through the wisps and the depth reads. The core is emissive on its own too,
// so it glows through a wisp rather than merely being lit by it. Grey is the
// panel's ordered dither: the ray's accumulated brightness goes to the Bayer
// matrix, and at arm's length that dither is smoke and light.
//
// Cost. 8192 rays is far too many to march in JavaScript at 60 fps, so the
// field is marched at 32 x 16 -- a 4 x 4 block to a sample -- and each sample
// is spread over its block by bilinear interpolation before the dither, so
// the gradients stay smooth while the march stays cheap. The cloud is thin
// enough that most steps find nothing and skip; the march gives up early once
// the fog has absorbed the light behind it. Rays start at a jittered offset,
// so thirty-odd long steps on a smooth gradient do not band into rings.
//
// Burn-in: nothing is ever still. The camera flies forward and the cloud
// churns, so a bright core travels across the glass and no pixel keeps its
// brightness for long. The ordered dither is fixed to the glass, as the kit's
// other dithered designs are: the hottest pixel is lit about half the day,
// which at this panel's 10,000 h rating is some two years to half brightness.

import { dither } from '../js/kit.js';

// ------------------------------------------------------------ value noise

function hash3(i, j, k) {
  let n = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(k, 1274126177)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177) | 0;
  return ((n ^ (n >>> 16)) >>> 0) * 2.3283064365386963e-10;
}

function vnoise(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy), uz = fz * fz * (3 - 2 * fz);
  const c000 = hash3(ix, iy, iz), c100 = hash3(ix + 1, iy, iz);
  const c010 = hash3(ix, iy + 1, iz), c110 = hash3(ix + 1, iy + 1, iz);
  const c001 = hash3(ix, iy, iz + 1), c101 = hash3(ix + 1, iy, iz + 1);
  const c011 = hash3(ix, iy + 1, iz + 1), c111 = hash3(ix + 1, iy + 1, iz + 1);
  const x00 = c000 + (c100 - c000) * ux, x10 = c010 + (c110 - c010) * ux;
  const x01 = c001 + (c101 - c001) * ux, x11 = c011 + (c111 - c011) * ux;
  const y0 = x00 + (x10 - x00) * uy, y1 = x01 + (x11 - x01) * uy;
  return y0 + (y1 - y0) * uz;
}

// ------------------------------------------------------------ the field
//
// The sampling frame tumbles slowly about the view axis, so the cloud turns
// as it streams. The octaves carry separate drifts, set once a frame, and
// that is what makes the field churn rather than slide.

const S1 = 0.26;                 // the body of the cloud (slow, large)
const S2 = 0.45;                 // the wisp sheets
const S3 = 0.85;                 // the strands inside a sheet
let A1 = 0, B1 = 0, C1 = 0;
let A2 = 0, B2 = 0, C2 = 0;
let A3 = 0, B3 = 0, C3 = 0;
let CT = 1, ST = 0;
let RX = 0, RY = 0;              // the rotated sample point, from rot()

/** Rotate a point about the view axis into (RX, RY). */
function rot(x, y) { RX = x * CT - y * ST; RY = x * ST + y * CT; }

/** The mask: how much cloud body is here at all (the low octave). */
function body(x, y, z) {
  return vnoise(x * S1 + A1, y * S1 + B1, z * S1 + C1);
}

/** Smooth 0..1 ramp between a and b. */
function sstep(a, b, x) {
  let u = (x - a) / (b - a);
  u = u < 0 ? 0 : u > 1 ? 1 : u;
  return u * u * (3 - 2 * u);
}

/** The density at a point, in the already-tumbled frame: 0 is empty space. */
function dens(x, y, z) {
  const b = sstep(0.60, 1.00, body(x, y, z));
  if (b <= 0) return 0;
  // The wisps are the ridges of the second octave -- the thin sheets where
  // the noise crosses its own middle, not its lumps. A nebula is filaments
  // and holes: a ray has to cross a few distinct sheets with gaps between
  // them, or it integrates to one flat wall and the picture is a silhouette.
  const wn = vnoise(x * S2 + A2, y * S2 + B2, z * S2 + C2);
  const r = 1 - (wn < 0.5 ? 1 - 2 * wn : 2 * wn - 1);
  const w = sstep(0.72, 0.98, r);
  if (w <= 0) return 0;
  // A third, finer octave only inside the sheet: it costs nothing in the
  // empty volumes, and it threads the strands that keep a bright core from
  // reading as one flat plate.
  const f = vnoise(x * S3 + A3, y * S3 + B3, z * S3 + C3);
  return b * b * w * (0.45 + 0.85 * f) * 2.9;
}

/** 2-D value noise, for the fine grain that breaks up a flat dither. */
function vnoise2(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash3(ix, iy, 7), b = hash3(ix + 1, iy, 7);
  const c = hash3(ix, iy + 1, 7), d = hash3(ix + 1, iy + 1, 7);
  const t0 = a + (b - a) * ux, t1 = c + (d - c) * ux;
  return t0 + (t1 - t0) * uy;
}

// ------------------------------------------------------------ shading

const LX = -0.55, LY = 0.56, LZ = -0.36;   // towards the key light

/**
 * How much cloud the key light crosses on its way to a point: two taps of the
 * real density, at the wisp scale, so it is the sheets that cast the shadows
 * and not the slow body mask they hang in.
 */
function shadow(x, y, z) {
  rot(x + LX * 0.85, y + LY * 0.85);
  const s1 = dens(RX, RY, z + LZ * 0.85);
  rot(x + LX * 2.10, y + LY * 2.10);
  const s2 = dens(RX, RY, z + LZ * 2.10);
  return s1 + 0.75 * s2;
}

const STEP = 0.42;             // world units per march step
const STEPS = 32;              // steps per ray
const TSTART = 0.45;           // first sample: a little in front of the eye

/** One ray from the eye: march the fog, accumulate emission through it. */
function trace(dx, dy, dz, jitter) {
  let acc = 0, trans = 1;
  for (let i = 0; i < STEPS; i++) {
    const t = TSTART + (i + jitter) * STEP;
    const x = dx * t, y = dy * t, z = dz * t;
    rot(x, y);
    const d = dens(RX, RY, z);
    if (d > 0.006) {
      const sh = Math.exp(-shadow(x, y, z) * 2.6);
      // The core glows on its own and is not shaded by the cloud around it;
      // the wisps are lit from the side, so the light rakes across them and
      // the shadow of whatever stands in the way falls on them. Emission plus
      // a lit term: that is what lets a core burn through a wisp in front.
      const emis = d * (0.55 + 1.5 * d) + 0.85 * d * sh;
      acc += trans * emis * STEP;
      trans *= Math.exp(-d * STEP * 3.1);
      if (trans < 0.02) break;         // the fog has gone opaque
    }
  }
  return 1 - Math.exp(-acc * 1.7);
}

// ============================================================ the face

const SW = 32, SH = 16;                   // marcher resolution: a 4 x 4 block a sample
const LEVEL = new Float32Array(SW * SH);
const JW = new Float32Array(SW * SH);     // per-ray start jitter, fixed on glass

for (let i = 0; i < JW.length; i++) {
  const s = Math.sin(i * 12.9898 + 4.1) * 43758.5453;
  JW[i] = s - Math.floor(s);
}

/**
 * The flight, as a pure function of t: each octave's drift, the tumble of the
 * sampling frame, and the walk of the dither phase. The octaves do not share
 * a velocity, and that is what makes the cloud churn rather than slide.
 */
function setFlight(t) {
  A1 = 0.20 * Math.sin(t * 0.071);        B1 = 0.14 * Math.sin(t * 0.053 + 1.3);
  A2 = 0.30 * Math.sin(t * 0.047 + 2.1);  B2 = -0.20 * Math.sin(t * 0.061 + 0.4);
  A3 = -0.38 * Math.sin(t * 0.053 + 0.7); B3 = 0.26 * Math.sin(t * 0.067 + 2.6);
  C1 = t * 0.24;                          // forward: the cloud streams past
  C2 = t * 0.16 + 13.0;                   // slower in its own scale: churn
  C3 = t * 0.20 + 29.0;
  const tumble = 0.10 * Math.sin(t * 0.021 + 0.5);
  CT = Math.cos(tumble); ST = Math.sin(tumble);
}

export default {
  name: 'Nebula',
  blurb: 'A volumetric raymarch: the camera drifts through an endless, self-shadowed cloud of glowing fog that churns as it streams past.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  driver: 'full',

  frame(g, { t, oled, night }) {
    setFlight(t);

    const yaw = 0.15 * Math.sin(t * 0.043) + 0.08 * Math.sin(t * 0.017 + 2.0);
    const pitch = 0.10 * Math.sin(t * 0.031 + 1.1);
    const roll = 0.13 * Math.sin(t * 0.021 + 0.5);
    const CY = Math.cos(yaw), SY = Math.sin(yaw);
    const CP = Math.cos(pitch), SP = Math.sin(pitch);
    const CR = Math.cos(roll), SR = Math.sin(roll);

    const FOVY = 0.50, FOVX = FOVY * 2;     // 128 : 64
    const jx = 2 / SW, jy = 2 / SH;

    for (let sy = 0; sy < SH; sy++) {
      const py0 = (sy + 0.5) * jy - 1;
      for (let sx = 0; sx < SW; sx++) {
        const px = ((sx + 0.5) * jx - 1) * FOVX;
        const py = py0 * FOVY;
        const rx = px * CR - py * SR, ry = px * SR + py * CR;   // roll
        const pz = ry * SP + CP, qy = ry * CP - SP;             // pitch
        const dx = rx * CY + pz * SY, dz = -rx * SY + pz * CY;  // yaw
        const inv = 1 / Math.sqrt(dx * dx + qy * qy + dz * dz);
        LEVEL[sy * SW + sx] = trace(dx * inv, qy * inv, dz * inv, JW[sy * SW + sx]);
      }
    }

    // ---- the dither: each sample spread over its 4 x 4 block, bilinear.
    //
    // Two things happen to the level here. It is interpolated, so the coarse
    // march does not show as blocks; and it is shaken by a fine noise of the
    // cloud's own, tied to the drift so it travels with the fog and not with
    // the glass. Without that shake a broad area of the cloud sits at a half
    // level and the Bayer matrix prints a perfect checkerboard there -- not
    // smoke but a grey plate. The shake is strongest at mid levels, where the
    // checker would be, and vanishes at black and at white.
    //
    // The dither below is the canvas's own, fixed to the glass and not walked
    // with the cloud: a Bayer lattice is what a 1-bit panel wants, and moving
    // its phase even by one pixel reshuffles half the screen in a frame, which
    // the eye catches. The floor under it is set high enough that the faintest
    // haze is simply black, so the pixels the matrix favours are not lit all
    // day on a level of nothing.
    const hx = SW - 1, hy = SH - 1;
    const nx = 0.85, ny = 0.85, sj = 0.30, dr = t * 0.55;
    g.fillWhere((x, y, ix, iy) => {
      const fx = (ix + 0.5) * 0.25 - 0.5, fy = (iy + 0.5) * 0.25 - 0.5;
      let x0 = Math.floor(fx), y0 = Math.floor(fy);
      const ax = fx - x0, ay = fy - y0;
      if (x0 < 0) x0 = 0; if (x0 > hx) x0 = hx;
      if (y0 < 0) y0 = 0; if (y0 > hy) y0 = hy;
      const x1 = x0 < hx ? x0 + 1 : x0, y1 = y0 < hy ? y0 + 1 : y0;
      const i00 = LEVEL[y0 * SW + x0], i10 = LEVEL[y0 * SW + x1];
      const i01 = LEVEL[y1 * SW + x0], i11 = LEVEL[y1 * SW + x1];
      const a = i00 + (i10 - i00) * ax, b = i01 + (i11 - i01) * ax;
      let lv = a + (b - a) * ay;
      const g4 = 4 * lv * (1 - lv);
      lv += (vnoise2(ix * nx + dr, iy * ny) - 0.5) * sj * g4;
      if (lv < 0) lv = 0; else if (lv > 1) lv = 1;
      return lv > 0.09 && dither(ix, iy, lv);
    });

    oled.contrast(0xcf + (0x1e - 0xcf) * night);
  },
};
