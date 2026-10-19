// Armillary — a brass armillary sphere in real 3D, and the time is engraved on it.
//
// The sphere (a meridian ring, the equator and the ecliptic on a tilted polar
// rod, a small globe at the centre) stands on a column, seen from a little
// below. Round it runs the broad horizon band, its outer face engraved with
// the 24 hours; the hour is the numeral at the front, over a fixed index.
// The minutes are engraved, far too small to read, round a collar on the
// column; a reading glass on an arm hangs in front of the collar and
// magnifies the minute under it.
//
// Everything is geometry: every ring is a strip of quads projected in
// perspective, back faces show the band's plain inside, faces are filled by
// inverse mapping and painted far to near, so rings pass in front of and
// behind each other, the globe and the sun. The engraving is looked up on the
// band's own surface, so numerals foreshorten as the band carries them round.
//
// Always: the sun bead runs once round the ecliptic a minute (the seconds)
// and lights the globe, whose graticule turns; the sky rings turn slowly
// about the pole; the viewpoint drifts, so the 3D is always moving.
// The minute: the collar winds back, then swings one notch on a spring with
// overshoot; in the glass the old minute slides out and the new one in.
// The hour: the horizon band swings round one hour, heavy, and the sphere
// spins up on its pivot like a gyroscope, becomes a ghost of light, slows,
// wobbles (precession) and settles.

import { dither, clamp, ease, progress, previousMinute, orbit, sprite } from '../js/kit.js';

const TAU = Math.PI * 2;
const W = 128, H = 64;

// ------------------------------------------------------------ the engraving
// Instrument-maker's numerals, 7 x 11: two-pixel stems, one-pixel hairlines,
// ball terminals, the stress of a burin cut.
// At the front of the horizon band (and in the glass) one texel is one pixel.

const DIG = [
  `
  ..###..
  .#...#.
  ##...##
  ##...##
  ##...##
  ##...##
  ##...##
  ##...##
  ##...##
  .#...#.
  ..###..`,
  `
  ...##..
  ..###..
  .#.##..
  ...##..
  ...##..
  ...##..
  ...##..
  ...##..
  ...##..
  ...##..
  .######`,
  `
  .####..
  ##...#.
  ##...##
  .....##
  ....##.
  ...##..
  ..##...
  .##....
  ##.....
  #.....#
  #######`,
  `
  .####..
  ##...#.
  ##...##
  .....##
  ....##.
  ..###..
  ....##.
  .....##
  ##...##
  ##...#.
  .####..`,
  `
  ....##.
  ...###.
  ..#.##.
  ..#.##.
  .#..##.
  .#..##.
  #######
  ....##.
  ....##.
  ....##.
  ...####`,
  `
  .######
  .##....
  .##....
  .##....
  .#####.
  .....##
  .....##
  .....##
  ##...##
  ##..##.
  .####..`,
  `
  ...###.
  ..#..##
  .##..##
  ##.....
  ##.###.
  ###..##
  ##...##
  ##...##
  ##...##
  .#...#.
  ..###..`,
  `
  #######
  #....#.
  .....#.
  ....##.
  ....##.
  ...##..
  ...##..
  ..###..
  ..##...
  ..##...
  ..##...`,
  `
  ..###..
  .#...#.
  .#...#.
  .##..#.
  ..###..
  .#..##.
  ##...##
  ##...##
  ##...##
  .#...#.
  ..###..`,
  `
  ..###..
  .#...#.
  ##...##
  ##...##
  ##...##
  ##..###
  .###.##
  .....##
  ##..##.
  ##..#..
  .###...`,
].map((s) => sprite(s));
const GW = 7, GH = 11, PAIR = 15;          // a two-digit numeral is 15 texels wide

/** Whether texel (x, y) of the numeral n (two digits) is engraved. */
function numeralBit(n, x, y) {
  if (y < 0 || y >= GH || x < 0 || x >= PAIR) return 0;
  const k = x < GW ? 0 : x >= GW + 1 ? 1 : -1;
  if (k < 0) return 0;
  const d = k ? n % 10 : Math.floor(n / 10);
  return DIG[d].data[y * GW + (x - k * (GW + 1))];
}

// ------------------------------------------------------------ small linear algebra

const rotY = (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; };
function mul(A, B) {
  const o = new Array(9);
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++) o[r * 3 + c] = A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c];
  return o;
}
function axisAngle([x, y, z], a) {
  const l = Math.hypot(x, y, z); x /= l; y /= l; z /= l;
  const c = Math.cos(a), s = Math.sin(a), k = 1 - c;
  return [c + x * x * k, x * y * k - z * s, x * z * k + y * s,
    y * x * k + z * s, c + y * y * k, y * z * k - x * s,
    z * x * k - y * s, z * y * k + x * s, c + z * z * k];
}
const app = (M, v) => [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]];
const norm = (v) => { const l = Math.hypot(...v); return v.map((c) => c / l); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// ------------------------------------------------------------ the camera
// World: x right, y down, z away; origin the sphere's centre. The eye is D in
// front and a little below, looking up (PITCH < 0), and drifts in yaw.

const D = 210, F = 210, PITCH = -0.27;
const CP = Math.cos(PITCH), SP = Math.sin(PITCH);
const cam = { cy: 1, sy: 0, vx: 64, vy: 26 };

function proj(x, y, z, out, k) {
  const xr = x * cam.cy + z * cam.sy, zr = -x * cam.sy + z * cam.cy;
  const yc = y * CP - zr * SP, zc = y * SP + zr * CP + D;
  out[k] = cam.vx + (F * xr) / zc; out[k + 1] = cam.vy + (F * yc) / zc; out[k + 2] = zc;
}
/** A direction (no translation) into camera space. */
function camDir([x, y, z]) {
  const xr = x * cam.cy + z * cam.sy, zr = -x * cam.sy + z * cam.cy;
  return [xr, y * CP - zr * SP, y * SP + zr * CP];
}

// ------------------------------------------------------------ quads

/** Fill the screen quad q (corners for uv (0,0) (1,0) (1,1) (0,1)); shade returns 1, 0 or -1 (leave). */
function fillQuad(g, q, shade) {
  const [x0, y0, x1, y1, x2, y2, x3, y3] = q;
  const sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3;
  const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2;
  const den = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(den) < 1e-9) return;
  const gg = (sx * dy2 - dx2 * sy) / den, hh = (dx1 * sy - sx * dy1) / den;
  const a = x1 - x0 + gg * x1, b = x3 - x0 + hh * x3, c = x0;
  const d = y1 - y0 + gg * y1, e = y3 - y0 + hh * y3, f = y0;
  const A = e - f * hh, B = c * hh - b, C = b * f - c * e;
  const Dd = f * gg - d, E = a - c * gg, Fq = c * d - a * f;
  const G = d * hh - e * gg, Hh = b * gg - a * hh, II = a * e - b * d;
  const xa = Math.max(0, Math.floor(Math.min(x0, x1, x2, x3))), xb = Math.min(W - 1, Math.ceil(Math.max(x0, x1, x2, x3)));
  const ya = Math.max(0, Math.floor(Math.min(y0, y1, y2, y3))), yb = Math.min(H - 1, Math.ceil(Math.max(y0, y1, y2, y3)));
  const buf = g.buf;
  for (let y = ya; y <= yb; y++) {
    const py = y + 0.5;
    for (let x = xa; x <= xb; x++) {
      const px = x + 0.5;
      const w = G * px + Hh * py + II;
      const u = (A * px + B * py + C) / w;
      if (u < -0.002 || u > 1.002) continue;
      const v = (Dd * px + E * py + Fq) / w;
      if (v < -0.002 || v > 1.002) continue;
      const r = shade(u, v, x, y);
      if (r >= 0) buf[y * W + x] = r;
    }
  }
}

const TMP = new Float64Array(3);
/**
 * A ring as a strip of n quads: pt(a, s, out) gives the world point at angle
 * a, across-coordinate s in [0, 1]. Each quad becomes a painter's item.
 */
function emitRing(items, n, pt, shade, extra = {}) {
  const P = new Float64Array((n + 1) * 6);
  for (let i = 0; i <= n; i++) {
    const a = (TAU * i) / n;
    for (let s = 0; s < 2; s++) { pt(a, s, TMP); proj(TMP[0], TMP[1], TMP[2], P, (i * 2 + s) * 3); }
  }
  for (let i = 0; i < n; i++) {
    const k0 = i * 6, k1 = (i + 1) * 6;
    const q = [P[k0], P[k0 + 1], P[k1], P[k1 + 1], P[k1 + 3], P[k1 + 4], P[k0 + 3], P[k0 + 4]];
    let area = 0;
    for (let k = 0; k < 4; k++) { const j = (k + 1) & 3; area += q[2 * k] * q[2 * j + 1] - q[2 * j] * q[2 * k + 1]; }
    if (q.every((v, j) => (j & 1 ? v < -4 || v > H + 4 : v < -4 || v > W + 4))) continue;
    const z = (P[k0 + 2] + P[k1 + 2] + P[k0 + 5] + P[k1 + 5]) / 4;
    const lenV = (Math.hypot(q[6] - q[0], q[7] - q[1]) + Math.hypot(q[4] - q[2], q[5] - q[3])) / 2;
    items.push({ z, q, area, a0: (TAU * i) / n, a1: (TAU * (i + 1)) / n, lenV, shade, ...extra });
  }
}

const drawItem = (g, it) => (it.draw ? it.draw(g, it) : fillQuad(g, it.q, (u, v, x, y) => it.shade(it, u, v, x, y)));

// ------------------------------------------------------------ the horizon band: the hours

const HR = { y: -3.5, R: 56, h: 10.6 };
const H_TPU = F / (D - HR.R * CP);                 // texels per world unit at the front: 1 texel ~ 1 px
const H_PITCH = (TAU * HR.R * H_TPU) / 24;         // texels from one hour to the next
const H_ROWS = HR.h * H_TPU;                       // texel rows across the band
const H_TOP = (H_ROWS - GH) / 2;

function shadeHour(it, u, v, x, y) {
  const e = Math.min(v, 1 - v) * it.lenV;
  if (it.area < 0) return v < 0.5 && e < 0.9 ? 1 : 0;                // the plain inside: one rim
  if (e < 1) return 1;                                                // the rims
  let a = it.a0 + u * (it.a1 - it.a0);
  if (a > Math.PI) a -= TAU;                                          // -pi..pi, 0 at the index
  const arc = (a * H_PITCH * 24) / TAU + it.phi * H_PITCH;
  const n = Math.round(arc / H_PITCH);
  const lx = arc - n * H_PITCH + PAIR / 2, ly = v * H_ROWS - H_TOP;
  const hn = ((n % 24) + 24) % 24, ix = Math.floor(lx), iy = Math.floor(ly);
  if (numeralBit(hn, ix, iy)) {
    // A lamp over the index lights a window one numeral wide: inside it the
    // engraving is filled (bold), outside only its cut edge shows (hairline).
    const off = Math.abs(arc - it.phi * H_PITCH);
    if (off < PAIR / 2 + 1.5) return 1;
    if (off > H_PITCH * 1.45) return 0;
    return numeralBit(hn, ix - 1, iy) && numeralBit(hn, ix, iy - 1) ? 0 : 1;
  }
  // Half-hour ticks off both rims.
  const half = Math.abs(lx - PAIR / 2 - H_PITCH / 2);
  if (half < 0.6 && (ly < 0.5 || ly > GH - 0.5)) return 1;
  return 0;
}

// ------------------------------------------------------------ the collar: the minutes

const MR = { y: 22.5, R: 12, h: 3.2 };
function shadeCollar(it, u, v, x, y) {
  const e = Math.min(v, 1 - v) * it.lenV;
  if (it.area < 0) return v < 0.5 && e < 0.8 ? 1 : 0;
  if (e < 0.8) return 1;
  const a = it.a0 + u * (it.a1 - it.a0);
  const k = ((a / TAU) * 60 + it.phi) / 5;          // 5-minute notches, engraved through
  return Math.abs(k - Math.round(k)) * ((TAU * MR.R) / 12) < 0.55 ? 1 : 0;
}

// The reading glass: what is under it, magnified so that one texel is one
// pixel at the centre, with the barrel distortion of a strong lens.
const L_R = 11, M_PITCH = 21, M_HALF = 8;
function drawLens(g, cx, cy, mPos) {
  const r2 = L_R * L_R, buf = g.buf;
  const x0 = Math.max(0, Math.floor(cx - L_R)), x1 = Math.min(W - 1, Math.ceil(cx + L_R));
  const y0 = Math.max(0, Math.floor(cy - L_R)), y1 = Math.min(H - 1, Math.ceil(cy + L_R));
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      const k = 1 + 0.3 * (d2 / r2) * (d2 / r2);
      const ux = dx * k, uy = dy * k - 0.012 * ux * ux;    // the collar's curve, seen from below
      const arc = mPos * M_PITCH + ux;
      const n = Math.round(arc / M_PITCH);
      const lx = arc - n * M_PITCH + PAIR / 2, ly = uy + GH / 2;
      let on = 0;
      if (Math.abs(Math.abs(uy) - M_HALF) < 0.5) on = 1;
      else if (Math.abs(uy) < M_HALF) {
        on = numeralBit(((n % 60) + 60) % 60, Math.floor(lx), Math.floor(ly));
        // a minute tick off each rim, between the numerals
        if (!on && Math.abs(Math.abs(lx - PAIR / 2) - M_PITCH / 2) < 0.6 && Math.abs(uy) > M_HALF - 1.6) on = 1;
      }
      buf[y * W + x] = on;
    }
  // The brass rim, its index notches and a glint.
  g.ring(cx, cy, L_R, L_R + 2);
  g.fillPolygon([[cx - 2, cy - L_R - 0.5], [cx + 2, cy - L_R - 0.5], [cx, cy - L_R + 2]], 1);
  g.fillPolygon([[cx - 2, cy + L_R + 0.5], [cx + 2, cy + L_R + 0.5], [cx, cy + L_R - 2]], 1);
  g.arc(cx, cy, L_R - 2, L_R - 1, 4.9, 5.6);
}

// ------------------------------------------------------------ the sphere

const MER = { r0: 20.0, r1: 22.2, yaw: -0.5 };
const RING = { r0: 15.6, r1: 17.4 };
const LAT = (38 * Math.PI) / 180, OBL = (23.4 * Math.PI) / 180;
const GLOBE = 5.4;

function shadeFlat(it, u, v, x, y) {
  if (it.notch) {
    const a = it.a0 + u * (it.a1 - it.a0);
    const k = ((a + it.off) * it.notch) / TAU;
    if (Math.abs(k - Math.round(k)) * it.notchPx < 0.5) return 0;
  }
  if (it.thin) return Math.abs(v - 0.5) * it.lenV < 0.8 ? 1 : -1;      // the far half: a hairline
  // A dark moat along both edges, so a ring crossing in front of another cuts it.
  if (it.lenV > 2.4 && Math.min(v, 1 - v) * it.lenV < 0.75) return 0;
  return it.lv >= 1 || dither(x + it.dx, y + it.dy, it.lv) ? 1 : 0;
}

/** Push a flat ring (annulus) with in-plane basis e1, e2 (world, unit), centre 0. */
function emitFlat(items, n, e1, e2, r0, r1, extra) {
  emitRing(items, n, (a, s, o) => {
    const r = r0 + s * (r1 - r0), c = Math.cos(a) * r, sn = Math.sin(a) * r;
    o[0] = e1[0] * c + e2[0] * sn; o[1] = e1[1] * c + e2[1] * sn; o[2] = e1[2] * c + e2[2] * sn;
  }, shadeFlat, extra);
  for (const it of items) if (it.shade === shadeFlat && it.lv === undefined) { it.lv = extra.lv ?? 1; it.thin = extra.ghost || (extra.far && it.z > D); }
}

// ------------------------------------------------------------ timing

const smooth = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
function spring(s, zeta, w) {
  if (s <= 0) return 0;
  const wd = w * Math.sqrt(1 - zeta * zeta);
  return 1 - Math.exp(-zeta * w * s) * (Math.cos(wd * s) + ((zeta * w) / wd) * Math.sin(wd * s));
}
/** A wound-back, sprung step 0 -> 1 around tau = 0. */
function step(tau, wind, w0, w1, t0, zeta, w) {
  if (tau < w0) return 0;
  const back = -wind * ease.inOutCubic(progress(tau, w0, w1));
  return tau < t0 ? back : -wind + (1 + wind) * spring(tau - t0, zeta, w);
}
// The gyroscope spin, in turns, over the hour show.
const G0 = -2.2, G1 = 3.2, TURNS = 11;
const spinAt = (tau) => TURNS * ease.inOutCubic(progress(tau, G0, G1));

// ------------------------------------------------------------ the face

function scene(g, { T, sec, hPos, mPos, spin, tilt, prec, ox, oy, dk }) {
  const yaw = 0.09 * Math.sin((TAU * T) / 53) + 0.03 * Math.sin((TAU * T) / 19);
  cam.cy = Math.cos(yaw); cam.sy = Math.sin(yaw); cam.vx = 64 + ox; cam.vy = 31 + oy;
  const items = [];

  // Horizon band (world-fixed axis) and the collar.
  const hphi = hPos;
  emitRing(items, 96, (a, s, o) => { o[0] = HR.R * Math.sin(a); o[1] = HR.y + (s - 0.5) * HR.h; o[2] = -HR.R * Math.cos(a); }, shadeHour, { phi: hphi });
  emitRing(items, 40, (a, s, o) => { o[0] = MR.R * Math.sin(a); o[1] = MR.y + (s - 0.5) * MR.h; o[2] = -MR.R * Math.cos(a); }, shadeCollar, { phi: mPos });

  // The sphere: G turns it on its pivot (the gyroscope at the hour).
  const sway = 0.05 * Math.sin((TAU * T) / 11);
  const Gm = mul(rotY(spin + sway), axisAngle([Math.cos(prec), 0, Math.sin(prec)], tilt));
  const up = [0, -1, 0], mAx = [Math.cos(MER.yaw), 0, Math.sin(MER.yaw)];
  const merE1 = app(Gm, up), merE2 = app(Gm, mAx);
  const pole = app(Gm, norm([mAx[0] * Math.cos(LAT), -Math.sin(LAT), mAx[2] * Math.cos(LAT)]));
  // The equator's plane: perpendicular to the pole; the ecliptic tilted from it.
  const sky = (TAU * T) / 240;
  const q1 = norm(cross(pole, merE1.map((c, i) => c + 0.3 * merE2[i])));
  const q2 = cross(pole, q1);
  const eq1 = q1, eq2 = q2;
  const tiltE = axisAngle(eq1, OBL);
  const ec1 = app(axisAngle(pole, sky), eq1), ec2 = app(axisAngle(pole, sky), app(tiltE, eq2));
  const dith = { dx: dk, dy: 3 * dk };
  emitFlat(items, 48, merE1, merE2, MER.r0, MER.r1, { ...dith });
  emitFlat(items, 44, ec1, ec2, RING.r0 - 0.3, RING.r1 - 0.3, { ...dith, far: 0.5 });

  // Ghosts of the spinning meridian, while the sphere is a blur.
  // At speed the meridian is a blur: a lantern of hairline meridians, as many
  // as the speed allows, that sweeps the whole sphere of light.
  if (ghosts.n) {
    const nut = axisAngle([Math.cos(prec), 0, Math.sin(prec)], tilt);
    for (let j = 1; j <= ghosts.n; j++) {
      const Gg = mul(rotY(spin + (j * Math.PI) / (ghosts.n + 1)), nut);
      emitFlat(items, 40, app(Gg, up), app(Gg, mAx), MER.r1 - 0.6, MER.r1 + 0.2, { ...dith, ghost: true });
    }
  }

  // The polar rod, in two halves either side of the globe.
  const P2 = new Float64Array(6);
  for (const sgn of [1, -1]) {
    const a = pole.map((c) => c * sgn * GLOBE), b = pole.map((c) => c * sgn * (MER.r1 + 1.5));
    proj(a[0], a[1], a[2], P2, 0); proj(b[0], b[1], b[2], P2, 3);
    const z = (P2[2] + P2[5]) / 2, l = [P2[0], P2[1], P2[3], P2[4]];
    items.push({ z, draw: (gg) => gg.thickLine(l[0], l[1], l[2], l[3], 1.1) });
  }

  // The sun, once round the ecliptic a minute: the seconds.
  const lam = (TAU * sec) / 60 - Math.PI / 2;
  const rs = (RING.r0 + RING.r1) / 2 - 0.4;
  const sun = [0, 1, 2].map((i) => rs * (Math.cos(lam) * ec1[i] + Math.sin(lam) * ec2[i]));
  {
    const S = new Float64Array(3); proj(sun[0], sun[1], sun[2], S, 0);
    const rr = (2.5 * F) / S[2], rot = T * 0.8;
    items.push({ z: S[2] - 1.5, draw: (gg) => {
      gg.fillCircle(S[0], S[1], rr + 1.6, 0);
      gg.fillCircle(S[0], S[1], rr);
      for (let k = 0; k < 0; k++) {
        const a = rot + (k * TAU) / 8, c = Math.cos(a), s = Math.sin(a);
        gg.line(Math.round(S[0] + c * (rr + 1.5)), Math.round(S[1] + s * (rr + 1.5)), Math.round(S[0] + c * (rr + 3)), Math.round(S[1] + s * (rr + 3)));
      }
    } });
  }

  // The globe, lit by the sun, its graticule turning about the pole.
  {
    const C = new Float64Array(3); proj(0, 0, 0, C, 0);
    const rg = (GLOBE * F) / C[2];
    const L = norm(camDir(sun)), pc = norm(camDir(pole));
    const g1 = norm(cross(pc, [0, 0, 1])), g2 = cross(pc, g1);
    const spinG = (TAU * T) / 9 + spin * 3;
    items.push({ z: C[2], draw: (gg) => {
      const buf = gg.buf;
      for (let y = Math.floor(C[1] - rg - 1); y <= C[1] + rg + 1; y++)
        for (let x = Math.floor(C[0] - rg - 1); x <= C[0] + rg + 1; x++) {
          if (x < 0 || x >= W || y < 0 || y >= H) continue;
          const nx = (x + 0.5 - C[0]) / rg, ny = (y + 0.5 - C[1]) / rg, q = nx * nx + ny * ny;
          if (q > 1.0) continue;
          if (q > 0.8) { buf[y * W + x] = 1; continue; }            // the limb
          const nz = -Math.sqrt(1 - q);
          const lam2 = nx * L[0] + ny * L[1] + nz * L[2];
          const lat = nx * pc[0] + ny * pc[1] + nz * pc[2];
          const lon = Math.atan2(nx * g2[0] + ny * g2[1] + nz * g2[2], nx * g1[0] + ny * g1[1] + nz * g1[2]) + spinG;
          // Sunlit side solid, one meridian line turning with the earth.
          const grid = Math.cos(lon) > 0 && Math.abs(Math.sin(lon)) < 0.16 && Math.abs(lat) < 0.8;
          buf[y * W + x] = lam2 > 0.08 && !grid ? 1 : 0;
        }
    } });
  }

  // The column under the pivot, and the reading glass's arm.
  {
    const A = new Float64Array(12);
    proj(-2.6, MER.r1 + 1, 0, A, 0); proj(2.6, MER.r1 + 1, 0, A, 3); proj(3.6, 60, 0, A, 6); proj(-3.6, 60, 0, A, 9);
    const poly = [[A[0], A[1]], [A[3], A[4]], [A[6], A[7]], [A[9], A[10]]];
    items.push({ z: A[2] + 0.5, draw: (gg) => {
      gg.fillPolygon(poly, 0);
      gg.line(Math.round(A[0]), Math.round(A[1]), Math.round(A[9]), Math.round(A[10]));
      gg.line(Math.round(A[3]), Math.round(A[4]), Math.round(A[6]), Math.round(A[7]));
    } });
  }

  // The hour index: a fixed pointer under the front of the band.
  {
    const A = new Float64Array(9), zf = -HR.R - 0.3, yb = HR.y + HR.h / 2;
    proj(0, yb + 1.0, zf, A, 0); proj(-2.4, yb + 4.2, zf, A, 3); proj(2.4, yb + 4.2, zf, A, 6);
    items.push({ z: A[2], draw: (gg) => gg.fillPolygon([[A[0], A[1]], [A[3], A[4]], [A[6], A[7]]], 1) });
  }

  // The reading glass, in front of the collar.
  {
    const A = new Float64Array(3); proj(0, MR.y, -MR.R - 4, A, 0);
    items.push({ z: A[2], draw: (gg) => drawLens(gg, A[0], A[1], mPos) });
  }

  items.sort((p, q) => q.z - p.z);
  for (const it of items) drawItem(g, it);
}

const ghosts = { n: 0 };

export default {
  name: 'Armillary',
  blurb: 'A brass armillary sphere in real 3D: the hour engraved round its horizon band, the minute read through a glass; on the hour the sphere spins up like a gyroscope.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,

  frame(g, { date, fields: f, oled, night }) {
    const T = date.getTime() / 1000, sec = f.sec;
    const late = sec >= 57;
    const prev = previousMinute(date);
    const from = late ? f : prev;
    const tau = late ? sec - 60 : sec;
    const toM = (from.m + 1) % 60, toH = toM === 0 ? (from.h + 1) % 24 : from.h;

    // The minute: wind back, swing one notch, overshoot, settle.
    let mPos = f.m;
    if (tau > -1 && tau < 3) mPos = from.m + step(tau, 0.12, -0.9, -0.3, -0.16, 0.38, 11);
    // The hour: the band swings round one hour, heavier.
    let hPos = f.h;
    const hourShow = toM === 0 && tau > G0 && tau < G1 + 2.5;
    if (hourShow && tau < 5) hPos = from.h + (toH === from.h ? 0 : step(tau, 0.1, -1.6, -0.5, -0.3, 0.3, 6.5));
    if (hPos >= 24) hPos -= 24;

    let spin = 0, tilt = 0, prec = 0;
    ghosts.n = 0;
    if (hourShow) {
      spin = TAU * spinAt(tau);
      const w = (TAU * (spinAt(tau + 0.01) - spinAt(tau - 0.01))) / 0.02;   // rad/s
      ghosts.n = Math.round(clamp((w - 4) / 2.2, 0, 9));
      // Precession: the pivot wobbles as the spin dies, then settles.
      const wob = Math.sin(Math.PI * progress(tau, G0 + 0.5, G1)) * 0.07 + (tau > G1 - 0.6 ? 0.16 * Math.exp(-(tau - G1 + 0.6) * 1.6) : 0);
      tilt = wob * Math.sin(clamp((tau - G0) / 0.4, 0, 1) * 1.57);
      prec = spin * 0.18 + tau * 5;
    }

    const [ox, oy] = orbit(date, 2, 3);
    const dk = (Math.floor(f.minuteKey / 5) * 5) & 7;
    scene(g, { T, sec, hPos, mPos, spin, tilt, prec, ox, oy, dk });
    oled.contrast(0xcf + (0x20 - 0xcf) * night);
  },
};

/** Digit specimen (for out/armillary-digits.mjs): the ten digits at 1x and 2x, and two numerals. */
export function specimen(g) {
  for (let d = 0; d < 10; d++) {
    const s = DIG[d];
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) if (s.data[y * GW + x]) {
      g.pixel(4 + d * 10 + x, 4 + y);
      g.fillRect(4 + d * 16 + x * 2, 24 + y * 2, 2, 2);
    }
  }
}
