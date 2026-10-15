// Quicksilver: a 256 mm tray of mercury in a dark photo studio, seen from
// straight above. The time is the liquid itself: four digits stand up out of
// the pool as surface-tension ridges of metal, stroke ends beaded, joints
// filleted. Nothing is painted: every pixel is the studio mirrored in the
// metal (a heightfield; slopes; reflection; a designed environment: a ring
// light round the lens, the walls of a light tent with a window on the left
// whose sky follows the time of day, cool bounce above, a warm lamp right).
// Flat mercury mirrors only the black hole round the camera, so the GOB face
// stays black and only curvature lights up: the digits, the bead, and every
// wave that crosses the pool.
//
// Seconds: a bead of mercury rolls round the bottom-right once a minute,
// laying a thin rivulet behind it (the minute so far, as an arc of metal),
// and taps the pool each second (a ring runs out). At :57.6 it rolls into
// the minute digit and the rivulet drains after it; the digits that change
// slump, gather into one trembling chrome dome, and the new digit stands up
// out of it from the centre outward, with a ring wave. A fresh bead pinches
// off and rolls back. Swells travel along every stroke all the time.
// Hour: a swell rolls diagonally across the whole tray, every digit rides
// it, the changed ones re-form behind its crest, and the studio turns once
// round the tray, so every reflection sweeps round the metal.
//
// Look: smoke. The panel face must vanish so the black mirror reads as
// liquid, not as a black board with dots on it.
import * as kit from '../js/kit.js';
import { glyphSDF } from './mercury-glyphs.js';

const W = 128, SS = 2, FW = W * SS, FN = FW * FW;
const ZC = 600;                             // camera height above the tray (coarse px)

// slots: glyph box top-left, scale (px per unit of the 10 x 15 glyph), stroke radius (coarse px)
const SLOTS = [
  { x: 17, y: 4, s: 4.4, R: 5.8 },
  { x: 67, y: 4, s: 4.4, R: 5.8 },
  { x: 4, y: 80, s: 2.9, R: 3.9 },
  { x: 36, y: 80, s: 2.9, R: 3.9 },
];
// build every digit's distance raster once, so no minute turn stalls on it
for (const S of [SLOTS[0], SLOTS[2]]) for (let d = 0; d < 10; d++) glyphSDF(String(d), S.s * SS, S.R * SS, S.pad * SS);
const ORB = { x: 97, y: 102, r: 16 };      // the bead's orbit (seconds)
const BEAD_R = 5.2, TRAIL_R = 1.6;
const TARGET = { x: 62, y: 102 };           // where the bead enters the minute digit

// profile of a liquid stroke across its width, x = distance / radius, built
// from its tilt: a narrow round crest, broad flanks at 18-42 degrees (they
// mirror the bright middle of the studio), and a steep lip at the edge that
// mirrors the dark pool, so every stroke has a dark outline.
const LUTN = 1024, LUTX = 1.6, LUT = new Float32Array(LUTN + 1), TANL = new Float32Array(LUTN + 1);
{
  const tilt = (x) => (x < 0.12 ? 18 * (x / 0.12) : x < 0.78 ? 18 + 24 * ((x - 0.12) / 0.66) : x < 1 ? 42 + 30 * ((x - 0.78) / 0.22) ** 0.7 : 0);
  let acc = 0;
  const tmp = new Float32Array(LUTN + 1);
  for (let k = LUTN; k >= 0; k--) {
    const x = (k / LUTN) * LUTX;
    acc += Math.tan((tilt(x) * Math.PI) / 180) * (LUTX / LUTN);
    tmp[k] = acc;
  }
  const top = tmp[0];
  for (let k = 0; k <= LUTN; k++) LUT[k] = tmp[k] / top;
  LUT.peak = top;                            // height / radius
  for (let k = 0; k <= LUTN; k++) TANL[k] = Math.tan((tilt((k / LUTN) * LUTX) * Math.PI) / 180) / top;
}
// The lip: past 45 degrees a stroke's edge mirrors the pool, i.e. black. It
// is under a pixel wide, and no finite difference can see it, so the lip
// samples are flagged where the profile is drawn and shaded black.
for (const S of SLOTS) {
  S.H = LUT.peak * S.R;                      // stroke height (coarse px)
  S.pad = Math.ceil(S.R * 1.6 * 1.6);        // margin a slumped glyph can reach
  S.cx = S.x + 5 * S.s; S.cy = S.y + 7.5 * S.s;
  S.reach = Math.hypot(5 * S.s, 7.5 * S.s) + S.R * 1.6;
}
// static per-fine-pixel data: view ray, ripple phases, tray meniscus
const VX = new Float32Array(FN), VY = new Float32Array(FN), VZ = new Float32Array(FN);
const RIP = [
  { x: -220, y: -70, k: kit.TAU / 26, w: 1.3, a: 0.016 },
  { x: 330, y: 160, k: kit.TAU / 19, w: 1.7, a: 0.013 },
  { x: 40, y: 420, k: kit.TAU / 33, w: 1.0, a: 0.016 },
];
const RS = RIP.map(() => new Float32Array(FN)), RC = RIP.map(() => new Float32Array(FN));
const MEN = new Float32Array(FN);
for (let j = 0; j < FW; j++) for (let i = 0; i < FW; i++) {
  const p = j * FW + i, X = (i + 0.5) / SS, Y = (j + 0.5) / SS;
  const dx = X - 64, dy = Y - 64, l = Math.hypot(dx, dy, ZC);
  VX[p] = dx / l; VY[p] = dy / l; VZ[p] = -ZC / l;
  RIP.forEach((r, q) => { const d = Math.hypot(X - r.x, Y - r.y); RS[q][p] = Math.sin(r.k * d); RC[q][p] = Math.cos(r.k * d); });
  const ed = Math.min(X, Y, W - X, W - Y);
  MEN[p] = -1.1 * Math.exp(-ed / 1.6);
}

const LIP = new Uint8Array(FN), SW = new Float32Array(2 * FW), h = new Float32Array(FN), D = new Float32Array(FN), img = new Float32Array(3 * W * W);

const pad2 = (n) => String(n).padStart(2, '0');
const digitsAt = (ms) => { const d = new Date(ms); return pad2(d.getHours()) + pad2(d.getMinutes()); };
const ss = (a, b, x) => { let t = (x - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };   // either direction
const easeIO = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const mm = (a, b) => (a * b <= 0 ? 0 : Math.abs(a) < Math.abs(b) ? a : b);
const easeOut = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : 1 - (1 - t) ** 3);

// flow: swells travel along every stroke, one wavelength a second
const SIN = new Float32Array(1024);
for (let k = 0; k < 1024; k++) SIN[k] = Math.sin((k / 1024) * kit.TAU);
const FLOW_A = 0.035, FLOW_L = 5.5;           // amplitude (of height), wavelength (glyph units)
let FLOW_T = 0;
const LIPQ = Math.round((0.8 / LUTX) * LUTN);

/** smooth union of a height into D (surface tension between touching blobs) */
function put(p, v, k, lip = 0) {
  const a = D[p];
  if (a <= 0) { D[p] = v; LIP[p] = lip; return; }
  const m = Math.max(k - Math.abs(a - v), 0) / k;
  if (v > a) LIP[p] = lip;
  else if (!lip) LIP[p] = 0;
  D[p] = (a > v ? a : v) + m * m * k * 0.25;
}

/** one glyph's liquid into D. amp: dome height; rs: width scale; front: radial reveal radius (coarse px) or -1 */
function drawGlyph(S, d, amp, rs, front) {
  if (amp <= 0.01) return;
  const sdf = glyphSDF(d, S.s * SS, S.R * SS, S.pad * SS), arc = sdf.arc;
  const kL = 1024 / (FLOW_L * S.s * SS);
  const Rf = S.R * SS * rs, inv = LUTN / (Rf * LUTX), margin = Math.min(S.pad * SS, Math.ceil(Rf * LUTX) + 1);
  const ox = (S.x - S.pad) * SS, oy = (S.y - S.pad) * SS, pd = S.pad * SS;
  const i0 = Math.max(0, pd - margin), i1 = Math.min(sdf.w, sdf.w - pd + margin);
  const j0 = Math.max(0, pd - margin), j1 = Math.min(sdf.h, sdf.h - pd + margin);
  const cx = S.cx * SS, cy = S.cy * SS, fr = front * SS, soft = 1 / (S.R * SS * 1.4), k = S.R * 0.5;
  const slope1 = S.R * rs;                   // amp * TANL > R: steeper than 45 degrees
  for (let j = j0; j < j1; j++) {
    const gy = oy + j;
    if (gy < 0 || gy >= FW) continue;
    const row = j * sdf.w;
    for (let i = i0; i < i1; i++) {
      const gx = ox + i;
      if (gx < 0 || gx >= FW) continue;
      let q = sdf.d[row + i] * inv;
      if (q >= LUTN) continue;
      let lift = 1;
      if (q < 0) { lift = 1 - 0.6 * q / LUTN * LUTX; q = 0; }   // inside a bead: it swells above the stream
      let v = amp * lift * LUT[q | 0] * (1 + FLOW_A * SIN[((arc[row + i] * kL - FLOW_T) | 0) & 1023]);
      if (front >= 0) {
        const dx = gx + 0.5 - cx, dy = gy + 0.5 - cy;
        const f = (fr - Math.sqrt(dx * dx + dy * dy)) * soft;
        if (f <= 0) continue;
        if (f < 1) v *= f * f * (3 - 2 * f);
      }
      if (v > 0.002) { const qi = q | 0; put(gy * FW + gx, v, k, qi > LIPQ && amp * TANL[qi] > slope1 ? 1 : 0); }
    }
  }
}

/** a round blob (bead or gathered dome) into D; x, y, r in coarse px */
function drawBlob(x, y, r, amp, k) {
  if (r <= 0.05 || amp <= 0.01) return;
  const R = r * SS, ext = R * LUTX, inv = LUTN / ext, cx = x * SS, cy = y * SS;
  const i0 = Math.max(0, Math.floor(cx - ext)), i1 = Math.min(FW - 1, Math.ceil(cx + ext));
  const j0 = Math.max(0, Math.floor(cy - ext)), j1 = Math.min(FW - 1, Math.ceil(cy + ext));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const dx = i + 0.5 - cx, dy = j + 0.5 - cy, q = Math.sqrt(dx * dx + dy * dy) * inv;
    if (q >= LUTN) continue;
    const qi = q | 0, v = amp * LUT[qi];
    if (v > 0.002) put(j * FW + i, v, k, qi > LIPQ && amp * TANL[qi] > r ? 1 : 0);
  }
}

/**
 * A thin rivulet of liquid into D: the arc of the orbit circle from angle
 * a0 to a1 (radians, a0 < a1), plus an optional straight stream from the
 * arc's head to (sx, sy). r: rivulet radius (coarse px).
 */
function drawTrail(a0, a1, r, sx, sy, sr) {
  if (r <= 0.05 || a1 <= a0) return;
  const R = ORB.r * SS, cx = ORB.x * SS, cy = ORB.y * SS, rr = r * SS, ext = rr * LUTX, inv = LUTN / ext;
  const hx = cx + R * Math.cos(a1), hy = cy + R * Math.sin(a1), tx = cx + R * Math.cos(a0), ty = cy + R * Math.sin(a0);
  const amp = r * LUT.peak, sR = sr * SS, sExt = sR * LUTX, sInv = sR > 0 ? LUTN / sExt : 0, sAmp = sr * LUT.peak;
  const SX = sx * SS, SY = sy * SS, ddx = SX - hx, ddy = SY - hy, l2 = ddx * ddx + ddy * ddy || 1;
  const i0 = Math.max(0, Math.floor(Math.min(cx - R - ext, sR > 0 ? SX - sExt : 1e9))), i1 = Math.min(FW - 1, Math.ceil(cx + R + ext));
  const j0 = Math.max(0, Math.floor(cy - R - ext)), j1 = Math.min(FW - 1, Math.ceil(cy + R + ext));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const px = i + 0.5, py = j + 0.5, dx = px - cx, dy = py - cy;
    // angle measured from a0, so the arc test is one comparison
    let a = Math.atan2(dy, dx) - a0;
    a -= kit.TAU * Math.floor(a / kit.TAU);
    let d;
    if (a <= a1 - a0) d = Math.abs(Math.sqrt(dx * dx + dy * dy) - R);
    else d = Math.min(Math.hypot(px - hx, py - hy), Math.hypot(px - tx, py - ty));
    const q = d * inv;
    if (q < LUTN) { const qi = q | 0, v = amp * LUT[qi]; if (v > 0.002) put(j * FW + i, v, 1, qi > LIPQ && amp * TANL[qi] > r ? 1 : 0); }
    if (sR > 0) {
      let t = ((px - hx) * ddx + (py - hy) * ddy) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = px - hx - t * ddx, ey = py - hy - t * ddy, qs = Math.sqrt(ex * ex + ey * ey) * sInv;
      if (qs < LUTN) { const qi = qs | 0, v = sAmp * LUT[qi]; if (v > 0.002) put(j * FW + i, v, 1, qi > LIPQ && sAmp * TANL[qi] > sr ? 1 : 0); }
    }
  }
}

/** gaussian dome into D (the gathered liquid of a melting digit) */
function drawDome(x, y, sig, amp) {
  if (amp <= 0.01) return;
  const S = sig * SS, ext = S * 2.6, cx = x * SS, cy = y * SS, i2 = 1 / (2 * S * S);
  const i0 = Math.max(0, Math.floor(cx - ext)), i1 = Math.min(FW - 1, Math.ceil(cx + ext));
  const j0 = Math.max(0, Math.floor(cy - ext)), j1 = Math.min(FW - 1, Math.ceil(cy + ext));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const dx = i + 0.5 - cx, dy = j + 0.5 - cy, v = amp * Math.exp(-(dx * dx + dy * dy) * i2);
    if (v > 0.003) put(j * FW + i, v, 2);
  }
}

/** a travelling ring wave packet added to h; age in s */
function ring(x, y, age, A0, speed = 42, w = 5.5, lam = 9, life = 3, r0 = 6) {
  if (age <= 0 || age > life) return;
  const rf = r0 + speed * age, A = A0 * Math.exp(-age / (life * 0.37)) * ss(0, 0.12, age) * ss(life, life * 0.8, age);
  const ext = (rf + 2.5 * w) * SS, cx = x * SS, cy = y * SS;
  const rin = Math.max(0, rf - 2.5 * w) * SS, rin2 = rin * rin, ext2 = ext * ext;
  const i0 = Math.max(0, Math.floor(cx - ext)), i1 = Math.min(FW - 1, Math.ceil(cx + ext));
  const j0 = Math.max(0, Math.floor(cy - ext)), j1 = Math.min(FW - 1, Math.ceil(cy + ext));
  const kk = kit.TAU / lam, iw = 1 / (w * w);
  for (let j = j0; j <= j1; j++) {
    const dy = j + 0.5 - cy, dy2 = dy * dy;
    for (let i = i0; i <= i1; i++) {
      const dx = i + 0.5 - cx, d2 = dx * dx + dy2;
      if (d2 < rin2 || d2 > ext2) continue;
      const u = Math.sqrt(d2) / SS - rf;
      h[j * FW + i] += A * Math.cos(kk * u) * Math.exp(-u * u * iw);
    }
  }
}

// ---------------------------------------------------------------- the studio
let ER = 0, EG = 0, EB = 0;
let SKY = [0, 0, 0];
/** sky through the window, by hour of day (sRGB-picked keyframes, linear out) */
const SKYKEYS = [
  [0, '#0a1430', 0.30], [5, '#14204a', 0.35], [6.5, '#ff9a6a', 0.8], [8.5, '#cfe0ff', 0.95],
  [15.5, '#e8e4d8', 0.95], [18.3, '#ffa040', 0.9], [19.8, '#6a3a8a', 0.6], [21.5, '#0a1430', 0.3], [24, '#0a1430', 0.3],
].map(([t, c, a]) => [t, kit.hex(c), a]);
function skyAt(hr) {
  let k = 0;
  while (k < SKYKEYS.length - 2 && SKYKEYS[k + 1][0] <= hr) k++;
  const [t0, c0, a0] = SKYKEYS[k], [t1, c1, a1] = SKYKEYS[k + 1];
  const f = ss(0, 1, (hr - t0) / (t1 - t0)), a = a0 + (a1 - a0) * f;
  return [kit.lerp(c0[0], c1[0], f) * a, kit.lerp(c0[1], c1[1], f) * a, kit.lerp(c0[2], c1[2], f) * a];
}
const RING = kit.hex('#f4f7ff'), COOL = kit.hex('#7fb0ff'), LAMP = kit.hex('#ff8a2a'), FLOOR = kit.hex('#c9a27a');

/**
 * The studio, as radiance along a unit direction (rx, ry, rz) (rz = up).
 * It is designed in bands of elevation, because on a liquid stroke the
 * elevation it mirrors is set by how far down the flank you are:
 *   above 79 deg  the black hole round the camera: the open pool mirrors only
 *                 this, so the tray stays black and only relief lights up
 *   62-79         an ring light round the lens: the white core of every
 *                 stroke
 *   14-62         the tent walls, each side its own light: the window on the
 *                 left (the sky of the hour; its mullion splits the reflection), cool bounce at the top, a warm
 *                 lamp on the right, warm floor bounce at the bottom
 *   0-14          dark: the lip of each stroke
 *   below 0       the pool itself: black, so every stroke has a dark lip
 */
function env(rx, ry, rz) {
  ER = 0; EG = 0; EB = 0;
  if (rz <= 0) return;
  const el = Math.asin(rz < 1 ? rz : 1), deg = el * 57.2958;
  if (deg > 79) return;
  const hl = Math.sqrt(rx * rx + ry * ry) || 1, ux = rx / hl, uy = ry / hl;
  if (deg > 60) {
    // the ring light: soft inner and outer edge
        const c = ss(80, 74, deg) * ss(58, 65, deg);
    ER = 0.05 + RING[0] * c; EG = 0.05 + RING[1] * c; EB = 0.06 + RING[2] * c;
    return;
  }
  if (deg > 10) {
    const k = ss(10, 20, deg) * ss(62, 55, deg);
    let r = 0.1, g = 0.1, b = 0.11;
    if (uy < 0) { const c = (-uy) ** 1.2 * 0.9; r += COOL[0] * c; g += COOL[1] * c; b += COOL[2] * c; }
    if (ux > 0) { const c = ux ** 2.5 * 0.85; r += LAMP[0] * c; g += LAMP[1] * c; b += LAMP[2] * c; }
    if (ux < -0.5) {
      // the window: four panes and a mullion cross
      const az = Math.atan2(uy, -ux);
      const mull = Math.abs(az) - 0.05;
      const c = ss(0, 0.12, mull) * ss(1.0, 0.85, Math.abs(az)) * 1.5;
      r += SKY[0] * c; g += SKY[1] * c; b += SKY[2] * c;
    }
    if (uy > 0) { const c = uy * uy * 0.3; r += FLOOR[0] * c; g += FLOOR[1] * c; b += FLOOR[2] * c; }
    ER += r * k; EG += g * k; EB += b * k;
    return;
  }
}

let CR = 1, SR = 0;
const CVX = new Float32Array(W * W), CVY = new Float32Array(W * W), CVZ = new Float32Array(W * W);
for (let q = 0; q < W * W; q++) {
  const dx = (q % W) + 0.5 - 64, dy = ((q / W) | 0) + 0.5 - 64, l = Math.sqrt(dx * dx + dy * dy + ZC * ZC);
  CVX[q] = dx / l; CVY[q] = dy / l; CVZ[q] = -ZC / l;
}
/** mirror the studio at pool point (X, Y) with slope (gx, gy), view ray v; result in ER, EG, EB */
function shade(X, Y, gx, gy, vx, vy, vz) {
  const inv = 1 / Math.sqrt(gx * gx + gy * gy + 1);
  const nx = -gx * inv, ny = -gy * inv, nz = inv;
  const dt = vx * nx + vy * ny + vz * nz;
  const rx0 = vx - 2 * dt * nx, ry0 = vy - 2 * dt * ny, rz = vz - 2 * dt * nz;
  // the studio may be turned by phi: rotate ray and point into its frame
  const rx = rx0 * CR + ry0 * SR, ry = -rx0 * SR + ry0 * CR;
  env(rx, ry, rz);
  const c = 1 + dt < 0 ? 0 : 1 + dt, c2 = c * c, F = 0.72 + 0.28 * c2 * c2 * c;
  ER *= F; EG *= F; EB *= F;
}

// ------------------------------------------------------------------ frame
/** the state of one slot at time a (s after its turn starts); returns layers to draw */
function slotDraw(S, oldD, newD, a, rise) {
  // rise: when the new digit starts standing up (s)
  if (oldD === newD) { drawGlyph(S, newD, S.H, 1, -1); return; }
  const e = easeIO(a / 0.8);
  if (e < 1) drawGlyph(S, oldD, S.H * (1 - e) ** 1.5, 1 + 0.6 * e, -1);
  // the gathered dome: rises as the old slumps, sinks as the new stands
  const up = ss(0.25, 0.85, a), down = ss(rise + 0.15, rise + 1.1, a);
  const wob = 1 + 0.14 * Math.sin(9 * a) * Math.exp(-1.5 * Math.max(0, a - 0.5));
  drawDome(S.cx, S.cy, S.s * 2.6 * (1 + 0.15 * up), S.H * 1.25 * up * (1 - down) * wob);
  if (a > rise) {
    const t = a - rise, front = easeOut(t / 1.1) * S.reach;
    const jig = t > 0.3 ? 1 + 0.12 * Math.sin(13 * (t - 0.3)) * Math.exp(-2.5 * (t - 0.3)) : 1;
    drawGlyph(S, newD, S.H * jig * ss(0, 0.35, t), 1 + 0.25 * (1 - ss(0, 1.2, t)), front);
  }
}

/** the bead at second `sec` of the minute: [x, y, radius] */
function beadAt(sec) {
  if (sec >= 57.6) {
    const [ox, oy] = beadOrbit(sec), f = easeIO((sec - 57.6) / 2.2);
    return [ox + (TARGET.x - ox) * f, oy + (TARGET.y - oy) * f, BEAD_R * (1 - ss(59.25, 59.97, sec))];
  }
  if (sec < 2.1) return [TARGET.x, TARGET.y, 0];
  const [ox, oy] = beadOrbit(sec), f = easeIO((sec - 2.1) / 2.2);
  return [TARGET.x + (ox - TARGET.x) * f, TARGET.y + (oy - TARGET.y) * f, BEAD_R * ss(2.1, 2.7, sec)];
}
const beadOrbit = (sec) => {
  const th = -Math.PI / 2 + (kit.TAU * sec) / 60;
  return [ORB.x + ORB.r * Math.cos(th), ORB.y + ORB.r * Math.sin(th)];
};

export default {
  name: 'Quicksilver',
  blurb: 'a tray of mercury in a photo studio: digits stand up out of the liquid, a bead rolls the seconds, and at the turn the metal slumps and re-forms',
  layouts: ['hub-2x2'], look: 'smoke', fps: 60, brightness: 0.42, dither: true,
  frame(ctx) {
    const ms = ctx.date.getTime(), now = ms / 1000;
    const m = Math.floor(ms / 60000), age = (ms - m * 60000) / 1000;
    const prev = digitsAt((m - 1) * 60000), next = digitsAt(m * 60000);
    const hourTurn = ctx.date.getMinutes() === 0;
    const hr = ctx.date.getHours() + ctx.date.getMinutes() / 60;
    SKY = skyAt(hr);

    D.fill(0); LIP.fill(0);

    // digits (a turn lasts ~3 s; outside it every slot is simply standing)
    const inTurn = age < 4;
    // hour: a swell crosses the tray along x + y; each slot re-forms as it passes
    const swellF = (a) => -10 + 55 * a;
    for (let k = 0; k < 4; k++) {
      const S = SLOTS[k];
      if (!inTurn) { drawGlyph(S, next[k], S.H, 1, -1); continue; }
      const rise = hourTurn ? Math.max(0.8, ((S.cx + S.cy) / 2 + 10) / 55 - 0.1) : 0.85;
      slotDraw(S, prev[k], next[k], age, rise);
    }

    // the seconds bead
    FLOW_T = (now % 600) * 1024;
    const [bx, by, br] = beadAt(age);
    if (br > 0.05) {
      const sq = 1 + 0.06 * Math.sin(now * 11);              // a rolling bead trembles
      drawBlob(bx, by, br * sq, br * LUT.peak / sq, 1.5);
    }
    // the trail: the bead lays a thin rivulet round its orbit as it rolls,
    // so the minute so far is a growing arc of metal. At :57.6 the rivulet
    // drains after the bead into the digit.
    {
      const th = (sec) => -Math.PI / 2 + (kit.TAU * sec) / 60;
      const a0 = th(4.3);
      if (age > 4.3 && age < 57.6) {
        drawTrail(a0, th(age) - 0.12, TRAIL_R * ss(4.3, 5.5, age), 0, 0, 0);
      } else if (age >= 57.6) {
        const e = th(57.6) - 0.12, f = easeIO((age - 57.6) / 1.9);
        const w = TRAIL_R * (1 - 0.35 * f) * (1 - ss(59.3, 59.75, age));
        drawTrail(a0 + (e - a0) * f, e, w, bx, by, w * 0.85);
      }
    }
    // pool surface: meniscus at the tray wall + slow ripples from far away
    const c0 = Math.cos(RIP[0].w * now), s0 = Math.sin(RIP[0].w * now);
    const c1 = Math.cos(RIP[1].w * now), s1 = Math.sin(RIP[1].w * now);
    const c2 = Math.cos(RIP[2].w * now), s2 = Math.sin(RIP[2].w * now);
    const a0 = RIP[0].a, a1 = RIP[1].a, a2 = RIP[2].a;
    const S0 = RS[0], C0 = RC[0], S1 = RS[1], C1 = RC[1], S2 = RS[2], C2 = RC[2];
    for (let p = 0; p < FN; p++) {
      h[p] = D[p] + MEN[p] + a0 * (S0[p] * c0 - C0[p] * s0) + a1 * (S1[p] * c1 - C1[p] * s1) + a2 * (S2[p] * c2 - C2[p] * s2);
    }

    // waves. Every second the bead taps the pool: a ring runs out from
    // where it was, and the ring light catches it
    for (let k = Math.floor(age) - 2; k <= Math.floor(age); k++) {
      const tb = k < 0 ? k + 60 : k, [rx0, ry0, rr] = beadAt(tb);
      if (rr > 1) ring(rx0, ry0, age - k, 0.2, 15, 2.6, 4.6, 2.6, BEAD_R * 1.1);
    }
    if (inTurn) {
      for (let k = 0; k < 4; k++) {
        const S = SLOTS[k];
        if (prev[k] === next[k]) continue;
        const rise = hourTurn ? Math.max(0.8, ((S.cx + S.cy) / 2 + 10) / 55 - 0.1) : 0.85;
        ring(S.cx, S.cy, age - rise, 0.55 * S.R / 5);
      }
      if (hourTurn) {
        // the swell: a long crest along x + y with a train behind it
        const sf = swellF(age), A = 1.7 * ss(0, 0.4, age) * (1 - ss(3.0, 4.0, age));
        if (A > 0.01) {
          for (let q = 0; q < 2 * FW; q++) {
            const u = (q + 1) / SS / 2 - sf;
            SW[q] = u > 36 || u < -60 ? 0 : A * (Math.exp(-u * u / 150) + (u < 0 ? 0.18 * Math.sin(u * 0.32) * Math.exp(u / 18) : 0));
          }
          for (let j = 0; j < FW; j++) for (let i = 0, p = j * FW; i < FW; i++, p++) h[p] += SW[i + j];
        }
      }
    }

    // the studio turns once round the tray at the hour
    const phi = 0.07 * Math.sin(now * kit.TAU / 23) + (hourTurn ? kit.TAU * easeIO((age - 0.3) / 5) : 0);
    const cr = Math.cos(phi), sr = Math.sin(phi);

    // shade: reflect the studio. Where a coarse pixel holds liquid relief
    // its four fine samples are shaded and averaged (the rims need it); open
    // pool is shaded once at the pixel centre from the 2x2 block's slope.
    CR = cr; SR = sr;
    for (let y = 0; y < W; y++) {
      const j = 2 * y, ju = j > 0 ? -FW : 0, jd = j + 1 < FW - 1 ? FW : 0;
      for (let x = 0; x < W; x++) {
        const i = 2 * x, p = j * FW + i, o = 3 * (y * W + x);
        if (D[p] + D[p + 1] + D[p + FW] + D[p + FW + 1] === 0) {
          const gx = (h[p + 1] - h[p] + h[p + FW + 1] - h[p + FW]);
          const gy = (h[p + FW] - h[p] + h[p + FW + 1] - h[p + 1]);
          const q = y * W + x;
          shade(x + 0.5 - 64, y + 0.5 - 64, gx, gy, CVX[q], CVY[q], CVZ[q]);
          img[o] = ER; img[o + 1] = EG; img[o + 2] = EB;
          continue;
        }
        let r = 0, g = 0, b = 0;
        for (let sj = 0; sj < 2; sj++) for (let si = 0; si < 2; si++) {
          const jj = j + sj, ii = i + si, pp = jj * FW + ii;
          if (LIP[pp]) continue;
          const up = jj > 0 ? pp - FW : pp, dn = jj < FW - 1 ? pp + FW : pp;
          const lf = ii > 0 ? pp - 1 : pp, rt = ii < FW - 1 ? pp + 1 : pp;
          // minmod slopes: a stroke's lip is a true edge, so the flat pool
          // beside it must not borrow the cliff's slope (central differences
          // would ring every glyph with false highlights)
          const c = h[pp];
          const gx = mm(h[rt] - c, c - h[lf]) * SS, gy = mm(h[dn] - c, c - h[up]) * SS;
          shade((ii + 0.5) / SS - 64, (jj + 0.5) / SS - 64, gx, gy, VX[pp], VY[pp], VZ[pp]);
          r += ER; g += EG; b += EB;
        }
        img[o] = r * 0.25; img[o + 1] = g * 0.25; img[o + 2] = b * 0.25;
      }
    }
    kit.blitGrid(ctx, img, 1 - 0.5 * ctx.night);
  },
};

