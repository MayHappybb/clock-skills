// Beamzone: the glass is a 1980 colour vector cabinet in attract mode, a
// Battlezone plain seen through the tank's periscope. The time is four
// wireframe monoliths standing on the plain: hours far back on the left,
// minutes close on the right, each an extruded solid drawn by the beam
// (bright front face, blue back face and depth edges, hot vertices where the
// beam lingers), rocking slowly while the camera drifts round them so the
// pairs parallax against each other and against the ridge at infinity. The
// gunsight rests between them as the colon.
//
// Constant life: a retrace glint runs along every numeral's strokes in turn;
// the radar sweeps (blips: the enemy tank and the monoliths); the red enemy
// tank patrols behind the numerals and three times a minute swings its
// turret round and fires at us, the shell growing out of the distance and
// whistling past; the volcano smokes.
//
// Minute turn: the sight slides onto each digit that is about to change and
// locks (the tank turns a little with it), a shell flies down-range, and the
// numeral bursts into its own strokes: 16 tumbling 3D slabs, gone before :00.
// After :00 the same strokes fly back, each on its own clock, dim while in
// flight and lighting as they lock, into the new numeral (2.6-3.3 s from hit
// to whole). The score goes up 1000 a digit (it counts every digit shot
// since midnight, so it is a pure function of the time).
// Hour: no shell. The saucer comes in over the plain, its tractor beams take
// the old numerals up in a spiral, and after :00 it rains the new ones down
// into place and leaves; the volcano erupts. Unchanged digits stay put.
//
// Type: the numerals are drawn for the beam on a 6 x 10 grid, straight
// strokes and chamfers only (a vector cabinet draws lines), slashed zero; the
// HUD uses the same hand at 4 x 6 with 1-pixel strokes. AA everywhere, own
// beam renderer (vector-beam.js): strokes of any width, bloom from a coarse
// 4-pixel light grid, one g.coarse pass for tube + halo.
//
// Palette: the dark is the tube: deep blue-black glass with a curved glare,
// a teal horizon glow, a vignette, and the top strip under a red gel like
// Battlezone's (debris that flies up there turns red). Time in one family,
// cyan-white front, blue depth; the ground green, enemies red and magenta,
// shells pale yellow: the colours of 1980-83 colour vector games, chosen so
// the time is the only cyan thing. Night: backlight to 38 %, bloom eased.
import * as beam from './vector-beam.js';
import { PIECES, NPIECE, GH as GLH, TANK, SAUCER, smallText } from './vector-glyphs.js';
import { hex, mix, scale, sin, cos, clamp, rand, ease, progress, lerp, clockFields } from '../js/kit.js';

// ------------------------------------------------------------ camera
const F = 118, CX = 80, CY = 60;              // focal length (px), principal point
const CAM_H = 0.62, PIVOT_Z = 5.3, CAM_D = 5.3;
const cam = { x: 0, y: CAM_H, z: 0, cy: 1, sy: 0, yaw: 0 };
let ox = 0, oy = 0, oz = 0;                   // the last projected point
function setCam(orbit, aim) {
  cam.x = -CAM_D * sin(orbit); cam.z = PIVOT_Z - CAM_D * cos(orbit);
  cam.yaw = orbit + aim; cam.cy = cos(cam.yaw); cam.sy = sin(cam.yaw);
}
function project(x, y, z) {
  const dx = x - cam.x, dz = z - cam.z;
  const xr = dx * cam.cy - dz * cam.sy, zr = dx * cam.sy + dz * cam.cy;
  oz = zr;
  const k = F / (zr > 0.25 ? zr : 0.25);
  ox = CX + xr * k; oy = CY - (y - cam.y) * k;
}
/** Screen x of the camera-relative bearing `a` (radians): things at infinity. */
const bearingX = (a) => CX + F * (a - cam.yaw);

// ------------------------------------------------------------ the numerals
const DH = 2.3, DS = DH / GLH, DEPTH = 0.46, HOVER = 0.14;
const SLOTS = [
  { x: -3.9, z: 8.0 }, { x: -2.05, z: 8.0 },     // hours, further back
  { x: 0.62, z: 5.3 }, { x: 2.26, z: 5.3 },       // minutes, nearer
];
const FRONT = hex('e4fdff'), CORE = hex('56e2ff'), BACK = hex('2c54ff'), EDGE = hex('3a90ff');

// This minute's transition plan: which slots change, when they are hit.
const LOCK = 56.9, FIRE = 58.0, NEXT = 0.6, FLIGHT = 0.34, ASM = 1.45;
const LIFT0 = 57.5, LIFT1 = 59.9, DROP = 1.7;
function plan(a, b) {
  // slots that differ between strings a and b, shot right to left
  const t = [];
  for (let i = 3; i >= 0; i--) if (a[i] !== b[i]) t.push(i);
  return t;
}

// pose scratch, filled per piece (monomorphic, no allocation)
const PO = { x: 0, y: 0, z: 0, ex: 0, ey: 0, kx: 0, ky: 0, kz: 1, c: 1, s: 0, sc: 1, i: 1, q: 1 };
const P3 = new Float32Array(8);

/** A piece's scatter pose for event `key`, slot `slot`, piece `k`, written into SC_. */
const SC_ = { x: 0, y: 0, z: 0, kx: 0, ky: 0, kz: 1, ang: 0 };
function scatter(key, slot, k, mx, my) {
  const r1 = rand(key, slot * 32 + k, 1), r2 = rand(key, slot * 32 + k, 2), r3 = rand(key, slot * 32 + k, 3);
  const hx = 0, hy = HOVER + DH * 0.5;
  let dx = mx - hx, dy = my - hy;
  const l = Math.sqrt(dx * dx + dy * dy) + 0.15;
  dx /= l; dy /= l;
  const dist = 0.4 + 0.75 * r1;
  SC_.x = mx + (dx + (r2 - 0.5) * 0.9) * dist;
  SC_.y = my + (dy + 0.35 + (r3 - 0.5) * 0.7) * dist * 0.85;
  SC_.z = 0.35 + 1.3 * r3;
  const ax = r1 - 0.5, ay = r2 - 0.5, az = 0.6, al = Math.sqrt(ax * ax + ay * ay + az * az);
  SC_.kx = ax / al; SC_.ky = ay / al; SC_.kz = az / al;
  SC_.ang = (r2 < 0.5 ? -1 : 1) * (2.2 + 3.2 * r1);
}

/**
 * Draw slot `slot` at time T. `mode` 0 whole digit `dn`; 1 shattering `do_`
 * (u: 0 at the hit, 1 at :00); 2 assembling `dn` from the cloud of `do_`
 * (u: 0 at :00, 1 done); 3 lifted into the saucer (u 0..1); 4 dropped from it.
 */
function drawSlot(slot, T, mode, do_, dn, u, key, sauc) {
  const S = SLOTS[slot];
  const yaw = 0.22 * sin(T * 0.29 + slot * 1.9), cyw = cos(yaw), syw = sin(yaw);
  const bob = 0.05 * sin(T * 0.83 + slot * 2.3) + HOVER;
  const po = PIECES[mode === 0 ? dn : do_], pn = PIECES[dn];
  GLINT_K = -1;
  if (mode === 0 && GHOST === 1) {
    const gp = (T * 0.23 + slot * 0.27) % 1;          // one retrace every ~4.3 s, staggered per slot
    if (gp < 0.42) { const v = (gp / 0.42) * NPIECE; GLINT_K = Math.floor(v); GLINT_F = v - GLINT_K; }
  }
  for (let k = 0; k < NPIECE; k++) {
    const a = mode === 2 || mode === 4 ? pn[k] : po[k];
    const mx = ((a.ax + a.bx) * 0.5 - 3) * DS, my = (GLH - (a.ay + a.by) * 0.5) * DS + bob;
    PO.x = mx; PO.y = my; PO.z = 0; PO.ex = (a.bx - a.ax) * 0.5 * DS; PO.ey = -(a.by - a.ay) * 0.5 * DS;
    PO.c = 1; PO.s = 0; PO.sc = 1; PO.i = 1; PO.q = 1;
    if (mode === 1 || mode === 2) {
      const b = po[k];
      const bx = ((b.ax + b.bx) * 0.5 - 3) * DS, by = (GLH - (b.ay + b.by) * 0.5) * DS + bob;
      scatter(key, slot, k, bx, by);
      let w, ang;
      if (mode === 1) {
        w = ease.outCubic(u); ang = SC_.ang * ease.outQuad(u);
        PO.x = lerp(mx, SC_.x, w); PO.y = lerp(my, SC_.y, w); PO.z = SC_.z * w;
        PO.q = 1 - clamp(u * 4, 0, 1);
        PO.i = 0.55 + 1.2 * (1 - clamp(u * 3, 0, 1));
      } else {
        const uk = clamp((u - 0.3 * rand(key, slot * 32 + k, 5)) / 0.7, 0, 1);   // each piece on its own clock
        w = ease.inOutCubic(uk); ang = SC_.ang * (1 - w);
        PO.x = lerp(SC_.x, mx, w); PO.y = lerp(SC_.y, my, w); PO.z = SC_.z * (1 - w);
        const ex = (b.bx - b.ax) * 0.5 * DS, ey = -(b.by - b.ay) * 0.5 * DS;
        PO.ex = lerp(ex, PO.ex, w); PO.ey = lerp(ey, PO.ey, w);
        PO.q = clamp((u - 0.75) * 4, 0, 1);
        PO.i = 0.5 + 0.5 * ease.inQuad(clamp((uk - 0.6) / 0.4, 0, 1));   // debris dim, each piece lights as it locks
      }
      PO.kx = SC_.kx; PO.ky = SC_.ky; PO.kz = SC_.kz; PO.c = cos(ang); PO.s = sin(ang);
    } else if (mode === 3 || mode === 4) {
      // the saucer's tractor beam: pieces spiral up into it / rain down from it
      const sx = (sauc.x - S.x) * cyw - (sauc.z - S.z) * syw, sz = (sauc.x - S.x) * syw + (sauc.z - S.z) * cyw;
      const ph = rand(key, slot * 32 + k, 4) * 6.283;
      const uk = mode === 3 ? clamp(u * 1.05 - 0.05 * rand(key, k, slot), 0, 1) : clamp((u - 0.3 * rand(key, slot * 32 + k, 5)) / 0.7, 0, 1);
      const w = mode === 3 ? ease.inCubic(uk) : 1 - ease.outCubic(uk);
      const sw = 0.5 * (1 - w) * w * 4;
      PO.x = lerp(mx, sx, w) + sw * cos(ph + u * 9); PO.y = lerp(my, sauc.y - 0.1, w); PO.z = lerp(0, sz, w) + sw * sin(ph + u * 9);
      PO.sc = 1 - 0.85 * w;
      const ang = (mode === 3 ? 1 : -1) * w * 5;
      PO.kx = 0; PO.ky = 1; PO.kz = 0; PO.c = cos(ang); PO.s = sin(ang);
      PO.q = mode === 3 ? 1 - clamp(u * 4, 0, 1) : clamp((u - 0.8) * 5, 0, 1);
      PO.i = mode === 3 ? 1 - 0.7 * w : 0.3 + 0.7 * ease.inQuad(clamp((uk - 0.6) / 0.4, 0, 1));
    }
    drawPiece(S, cyw, syw, a, k);
  }
}

let GHOST = 1, GLINT_K = -1, GLINT_F = 0;   // phosphor ghost intensity; the retrace glint's piece and place
function drawPiece(S, cyw, syw, a, k) {
  const sc = PO.sc;
  for (let c = 0; c < 4; c++) {
    // corner offset from the piece's centre, then the tumble (Rodrigues), then the slot
    let vx = (c & 1 ? PO.ex : -PO.ex) * sc, vy = (c & 1 ? PO.ey : -PO.ey) * sc, vz = (c & 2 ? DEPTH : -DEPTH) * 0.5 * sc;
    if (PO.s !== 0) {
      const d = PO.kx * vx + PO.ky * vy + PO.kz * vz, cc = PO.c, ss = PO.s;
      const cx = PO.ky * vz - PO.kz * vy, cy = PO.kz * vx - PO.kx * vz, cz = PO.kx * vy - PO.ky * vx;
      vx = vx * cc + cx * ss + PO.kx * d * (1 - cc); vy = vy * cc + cy * ss + PO.ky * d * (1 - cc); vz = vz * cc + cz * ss + PO.kz * d * (1 - cc);
    }
    const lx = PO.x + vx, ly = PO.y + vy, lz = PO.z + vz;
    project(S.x + lx * cyw + lz * syw, ly, S.z - lx * syw + lz * cyw);
    P3[c * 2] = ox; P3[c * 2 + 1] = oy;
  }
  const I = PO.i * GHOST, q = PO.q;
  const ca = a.ca ? 1 : 1 - q, cb = a.cb ? 1 : 1 - q;
  if (k === GLINT_K) {
    // the beam lingering as it retraces: a hot spot running along the stroke
    const gx = lerp(P3[0], P3[2], GLINT_F), gy = lerp(P3[1], P3[3], GLINT_F);
    beam.point(gx, gy, 0xffffff, 1);
    beam.point(gx, gy, 0xffffff, 1);
    const hx = lerp(P3[0], P3[2], Math.max(0, GLINT_F - 0.7)), hy = lerp(P3[1], P3[3], Math.max(0, GLINT_F - 0.7));
    beam.line(hx, hy, gx, gy, 0xffffff, 0.9, 1.9, 2.5);
  }
  beam.line(P3[4], P3[5], P3[6], P3[7], BACK, 0.5 * I, 1.1, 0.6);
  beam.line(P3[0], P3[1], P3[4], P3[5], EDGE, 0.45 * ca * I, 1.0, 0.4);
  beam.line(P3[2], P3[3], P3[6], P3[7], EDGE, 0.45 * cb * I, 1.0, 0.4);
  beam.line(P3[0], P3[1], P3[2], P3[3], CORE, I, 1.75, 1);
  beam.line(P3[0], P3[1], P3[2], P3[3], FRONT, 0.4 * I, 0.7, 0);
  beam.point(P3[0], P3[1], FRONT, 0.6 * ca * I);
  beam.point(P3[2], P3[3], FRONT, 0.6 * cb * I);
}

/** World position of slot i's centre (for aiming). */
function slotCentre(i, T) {
  const S = SLOTS[i];
  return [S.x, HOVER + DH * 0.5 + 0.05 * sin(T * 0.83 + i * 2.3), S.z];
}

// ------------------------------------------------------------ the world
const MOUNT = hex('22a860'), GROUND = hex('1b6a52'), MOON = hex('ffe27a');
const TANKC = hex('ff4a3a'), SHELL = hex('fff2a0'), SIGHT = hex('5dff8a'), SAUC = hex('ff5ad8'), LAVA = hex('ffb030');
const RIDGE = [[-1.3, 0], [-1.12, 0.06], [-1.0, 0.03], [-0.9, 0.1], [-0.8, 0.05], [-0.7, 0.08], [-0.6, 0.02], [-0.52, 0.04],
  [-0.42, 0.012], [-0.34, 0.07], [-0.27, 0.115], [-0.2, 0.06], [-0.14, 0.03],
  [-0.06, 0.02], [0.0, 0.035], [0.08, 0.02], [0.18, 0.06], [0.27, 0.035], [0.36, 0.09], [0.44, 0.13], [0.5, 0.1], [0.6, 0.05],
  [0.72, 0.085], [0.84, 0.03], [0.98, 0.07], [1.1, 0.02], [1.3, 0]];
const VOLC = -0.105;                 // bearing of the volcano, in the gap between the pairs

function drawWorld(T, s, hourShow, sinceHour) {
  // ridge at infinity: only the camera's turning moves it
  let px = bearingX(RIDGE[0][0]), py = CY - F * RIDGE[0][1];
  for (let i = 1; i < RIDGE.length; i++) {
    const x = bearingX(RIDGE[i][0]), y = CY - F * RIDGE[i][1];
    if (x > -20 && px < 180) beam.line(px, py, x, y, MOUNT, 0.5, 1.0, 0.5);
    px = x; py = y;
  }
  // the volcano: a cone with a broken crater, smoke puffs rising from it
  const vx = bearingX(VOLC), vb = CY, vt = CY - 9;
  beam.line(vx - 9, vb, vx - 2.2, vt, MOUNT, 0.55); beam.line(vx + 2.2, vt, vx + 9, vb, MOUNT, 0.55);
  beam.line(vx - 2.2, vt, vx - 0.6, vt + 1, MOUNT, 0.55); beam.line(vx + 0.7, vt + 0.8, vx + 2.2, vt, MOUNT, 0.55);
  for (let p = 0; p < 4; p++) {
    const age = (T * 0.35 + p * 0.25) % 1, id = Math.floor(T * 0.35 + p * 0.25) * 4 + p;
    const dx = (rand(id, 7) - 0.5) * 6 * age, y = vt - 1 - age * 13, r = 0.6 + age * 1.6;
    beam.line(vx + dx - r, y, vx + dx + r, y - r * 0.3, MOUNT, 0.35 * (1 - age), 1.0, 0.2);
  }
  // eruption at the hour: lava bombs on arcs
  if (hourShow && sinceHour >= 0 && sinceHour < 6) {
    for (let b = 0; b < 22; b++) {
      const t0 = rand(b, 11) * 3.2, age = sinceHour - t0;
      if (age < 0 || age > 2.8) continue;
      const vxb = (rand(b, 12) - 0.5) * 44, vyb = 30 + rand(b, 13) * 26, gr = 26;
      const bx = vx + vxb * age, by = vt - vyb * age + gr * age * age;
      if (by > vb) continue;
      const a2 = Math.max(0, age - 0.09), bx2 = vx + vxb * a2, by2 = vt - vyb * a2 + gr * a2 * a2;
      const fade = 1 - age / 2.8;
      beam.line(bx2, by2, bx, by, LAVA, 0.9 * fade, 1.3, 0.9);
      beam.point(bx, by, 0xffe0a0, 0.9 * fade);
    }
  }
  // moon: a crescent of five strokes, high on the left
  const mx = bearingX(-0.36), my = 21;
  const MO = [[0, -5], [2.4, -3.4], [3.2, 0], [2.4, 3.4], [0, 5], [1.2, 2.2], [1.5, 0], [1.2, -2.2], [0, -5]];
  for (let i = 1; i < MO.length; i++) beam.line(mx - MO[i - 1][0], my + MO[i - 1][1], mx - MO[i][0], my + MO[i][1], MOON, 0.55, 1.0, 0.6);
  // the horizon and a few ground markers at fixed spots, so the ground has depth
  beam.line(0, CY, 160, CY, GROUND, 0.45, 1.0, 0.6);
  for (let j = 0; j < 9; j++) {
    const gx = -6 + (j * 2.37) % 12, gz = 3.2 + ((j * 3.1) % 8);
    project(gx - 0.35, 0, gz); const ax = ox, ay = oy, az = oz;
    project(gx + 0.35, 0, gz);
    if (az > 0.5 && oz > 0.5) beam.line(ax, ay, ox, oy, GROUND, 0.35, 1.0, 0.2);
  }
}

// the enemy tank's patrol: a slow loop on the ground behind the numerals
function tankPose(T) {
  const p = T * 0.085;
  const x = 0.1 + 5.6 * sin(p), z = 10.4 + 2.6 * sin(2 * p);
  const dx = 5.6 * cos(p), dz = 5.2 * cos(2 * p);
  return [x, z, Math.atan2(dx, dz)];
}
// it takes a shot at us now and then: the shell grows out of the distance and
// whistles past the camera
const ESHOTS = [9, 24, 39], EFLY = 1.25;
function enemyShot(s) {
  for (let i = 0; i < ESHOTS.length; i++) if (s >= ESHOTS[i] - 2.2 && s < ESHOTS[i] + EFLY + 0.3) return i;
  return -1;
}
function drawTank(T, s, I) {
  const [x, z, h] = tankPose(T);
  let tur = 0.6 * sin(T * 0.4);
  const es = enemyShot(s);
  if (es >= 0) {
    // turn the turret onto the camera, hold, fire, swing back
    let want = Math.atan2(cam.x - x, cam.z - z) - h;
    while (want > Math.PI) want -= 2 * Math.PI;
    while (want < -Math.PI) want += 2 * Math.PI;
    const t0 = ESHOTS[es];
    const w = ease.inOutCubic(progress(s, t0 - 2.2, t0 - 0.8)) * (1 - ease.inOutCubic(progress(s, t0 + 0.6, t0 + EFLY + 0.3)));
    tur = lerp(tur, want, w);
    const age = s - t0;
    if (age >= 0 && age < EFLY) {
      const gx = x + 1.25 * sin(h + want), gz = z + 1.25 * cos(h + want);
      const side = rand(T / 60 | 0, es) < 0.5 ? -1 : 1;
      const ex = cam.x + side * 0.9 * cam.cy, ez = cam.z - side * 0.9 * cam.sy;
      for (let g = 0; g < 3; g++) {
        const u = Math.max(0, age - g * 0.04) / EFLY;
        const px = lerp(gx, ex, u), py = lerp(0.45, 0.5, u), pz = lerp(gz, ez, u);
        project(px, py, pz);
        if (oz < 0.7) continue;
        const r = 0.07 * F / oz, I2 = g ? 0.35 / g : 1;
        beam.line(ox - r, oy, ox, oy - r, SHELL, I2); beam.line(ox, oy - r, ox + r, oy, SHELL, I2);
        beam.line(ox + r, oy, ox, oy + r, SHELL, I2); beam.line(ox, oy + r, ox - r, oy, SHELL, I2);
      }
      if (age < 0.15) { project(gx, 0.45, gz); beam.point(ox, oy, 0xffffff, 1 - age / 0.15); }
    }
  }
  const ch = cos(h), sh = sin(h);
  const ct = cos(tur), st = sin(tur);
  for (let e = 0; e < TANK.length; e++) {
    const A = TANK[e][0], B = TANK[e][1];
    const turret = A[1] > 0.29 || B[1] > 0.29 || e === TANK.length - 1;
    let ax = A[0], az = A[2], bx = B[0], bz = B[2];
    if (turret) { const t1 = ax * ct + az * st, t2 = -ax * st + az * ct, t3 = bx * ct + bz * st, t4 = -bx * st + bz * ct; ax = t1; az = t2; bx = t3; bz = t4; }
    project(x + ax * ch + az * sh, A[1], z - ax * sh + az * ch); const px = ox, py = oy;
    project(x + bx * ch + bz * sh, B[1], z - bx * sh + bz * ch);
    beam.line(px, py, ox, oy, TANKC, 0.75 * I, 1.0, 0.6);
  }
}

function drawSaucer(x, y, z, T, I) {
  const spin = T * 2.2, c = cos(spin), s = sin(spin);
  for (let e = 0; e < SAUCER.length; e++) {
    const A = SAUCER[e][0], B = SAUCER[e][1];
    project(x + 0.75 * (A[0] * c - A[2] * s), y + 0.75 * A[1], z + 0.75 * (A[0] * s + A[2] * c)); const px = ox, py = oy;
    project(x + 0.75 * (B[0] * c - B[2] * s), y + 0.75 * B[1], z + 0.75 * (B[0] * s + B[2] * c));
    beam.line(px, py, ox, oy, SAUC, 0.85 * I, 1.1, 0.8);
  }
}

// ------------------------------------------------------------ HUD, under the red gel
function drawText(str, x, y, I) {
  const t = smallText(str);
  for (const pl of t.paths) for (let i = 1; i < pl.length; i++)
    beam.line(x + pl[i - 1][0] + 0.5, y + pl[i - 1][1] + 0.5, x + pl[i][0] + 0.5, y + pl[i][1] + 0.5, 0xffffff, I, 1.0, 0.25);
  return t.width;
}
function shots(H, M) {
  // digits shot since midnight up to the start of minute H:M
  const mins = H * 60 + M;
  return mins + Math.floor(mins / 10) + H + (H >= 10 ? 1 : 0) + (H >= 20 ? 1 : 0);
}
function drawHUD(T, f, score, blips) {
  // radar: a scope with a sweeping arm; blips glow when the arm passes
  const rx = 80, ry = 6, rr = 5.2;
  for (let i = 0; i < 12; i++) {
    const a0 = i * 0.5236, a1 = a0 + 0.5236;
    beam.line(rx + rr * sin(a0), ry - rr * cos(a0), rx + rr * sin(a1), ry - rr * cos(a1), 0xffffff, 0.5, 1.0, 0.3);
  }
  const sweep = (T * 2.4) % 6.2832;
  beam.line(rx, ry, rx + rr * sin(sweep), ry - rr * cos(sweep), 0xffffff, 0.8, 1.0, 0.3);
  for (let b = 0; b < blips.length; b += 2) {
    const bx = blips[b], bz = blips[b + 1];
    const dx = bx - cam.x, dz = bz - cam.z;
    const xr = dx * cam.cy - dz * cam.sy, zr = dx * cam.sy + dz * cam.cy;
    const a = Math.atan2(xr, zr), d = Math.min(rr - 0.8, Math.sqrt(xr * xr + zr * zr) * 0.38);
    let lag = (sweep - (a < 0 ? a + 6.2832 : a)) % 6.2832; if (lag < 0) lag += 6.2832;
    beam.point(rx + d * sin(a), ry - d * cos(a), 0xffffff, 0.25 + 0.75 * Math.max(0, 1 - lag / 3));
  }
  const sc = String(score), x0 = 157 - (sc.length * 5 - 1);
  drawText(sc, x0, 2, 0.8);
  drawText('SCORE', x0 - 28, 2, 0.5);
  // lives: three little tanks
  for (let l = 0; l < 3; l++) {
    const x = 4 + l * 9;
    beam.line(x, 7, x + 6, 7, 0xffffff, 0.6); beam.line(x + 0.6, 7, x + 1.2, 5, 0xffffff, 0.6); beam.line(x + 6, 7, x + 5.2, 5, 0xffffff, 0.6);
    beam.line(x + 1.2, 5, x + 5.2, 5, 0xffffff, 0.6); beam.line(x + 2.2, 5, x + 2.8, 3.3, 0xffffff, 0.6); beam.line(x + 2.8, 3.3, x + 4.2, 3.3, 0xffffff, 0.6);
    beam.line(x + 4.2, 4.1, x + 7.2, 3.6, 0xffffff, 0.6);
  }
}

// ------------------------------------------------------------ the sight and the shells
function drawSight(x, y, h, lock, I) {
  const w = h * 0.38, c = lock > 0.5 ? mix(SIGHT, 0xffffff, 0.3) : SIGHT;
  const a = 0.45 + 0.4 * lock;
  // Battlezone's gunsight: two brackets and a split cross line
  beam.line(x - w, y - h * 0.5, x - w, y + h * 0.5, c, a * I); beam.line(x + w, y - h * 0.5, x + w, y + h * 0.5, c, a * I);
  beam.line(x - w, y - h * 0.5, x - w + 2, y - h * 0.5, c, a * I); beam.line(x - w, y + h * 0.5, x - w + 2, y + h * 0.5, c, a * I);
  beam.line(x + w, y - h * 0.5, x + w - 2, y - h * 0.5, c, a * I); beam.line(x + w, y + h * 0.5, x + w - 2, y + h * 0.5, c, a * I);
  beam.line(x, y - h * 0.5 - 2, x, y - h * 0.2, c, a * I * 0.8); beam.line(x, y + h * 0.2, x, y + h * 0.5 + 2, c, a * I * 0.8);
}

// ------------------------------------------------------------ the tube
beam.setTube((x, y) => {
  const nx = (x - 80) / 80, ny = (y - 40) / 40;
  const vig = clamp(1 - 0.6 * (nx * nx * 0.55 + ny * ny * 0.75), 0, 1);
  let c = y < CY ? mix(hex('0a1036'), hex('0e2a44'), clamp((y - 8) / (CY - 8), 0, 1) ** 2) : mix(hex('0c2034'), hex('070c20'), clamp((y - CY) / 20, 0, 1));
  c = scale(c, 0.5 + 0.5 * vig);
  // the glass: a faint curved reflection across the upper left
  const gx = x - 52, gy = y - 74, rr = Math.sqrt(gx * gx * 0.45 + gy * gy);
  const glare = clamp(1 - Math.abs(rr - 60) / 8, 0, 1) * clamp((70 - x) / 55, 0, 1) * clamp((54 - y) / 30, 0, 1);
  c = mix(c, hex('4a6a9a'), glare * 0.45);
  if (y < beam.OVL) c = mix(c, hex('240812'), 0.55);
  return c;
});

export default {
  name: 'Beamzone',
  blurb: 'A colour vector cabinet: wireframe numerals on a tank plain; a shell shatters each old digit and its strokes fly back as the new one; on the hour a saucer beams them up.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec;
    const T = ctx.date.getTime() / 1000;
    const night = ctx.night;
    ctx.lcd.backlight(1 - 0.62 * night);
    beam.reset();

    const now = ctx.date.getTime();
    const nxF = clockFields(new Date(now + 60000)), pvF = clockFields(new Date(now - 60000));
    const cur = f.hh + f.mm, nxt = nxF.hh + nxF.mm, prv = pvF.hh + pvF.mm;
    const outT = plan(cur, nxt), inT = plan(prv, cur);
    const hourOut = nxF.m === 0, hourIn = f.m === 0;

    // aim: the sight walks to each target, the tank turns a little with it
    let aimSlot = -1, aimW = 0, lock = 0;
    if (!hourOut && s >= LOCK) {
      const n = outT.length;
      let idx = 0;
      for (let k = 1; k < n; k++) if (s >= FIRE + (k - 1) * NEXT + 0.1) idx = k;
      aimSlot = outT[idx];
      aimW = ease.inOutCubic(progress(s, LOCK, LOCK + 0.8));
      lock = progress(s, LOCK + 0.75, LOCK + 0.95);
      if (idx > 0) lock = progress(s, FIRE + (idx - 1) * NEXT + 0.35, FIRE + (idx - 1) * NEXT + 0.5);
    }
    const back = !hourIn && s < 2.4 ? 1 - ease.inOutCubic(progress(s, 0.6, 2.4)) : 0;
    const orbit = 0.1 * sin(T * 0.17) + 0.03 * sin(T * 0.41);
    setCam(orbit, 0);
    // sight position: rest at the gap, else on the target, eased between
    let sx = 72, sy = 40, sh = 12;
    let tx = sx, ty = sy, th = sh, w = 0;
    const tgt = aimSlot >= 0 ? aimSlot : back > 0 && inT.length ? inT[inT.length - 1] : -1;
    if (tgt >= 0) {
      const [cx, cy, cz] = slotCentre(tgt, T);
      w = aimSlot >= 0 ? aimW : back;
      setCam(orbit, 0.12 * w * Math.atan2(cx - cam.x, cz - cam.z) * 1);
      project(cx, cy, cz); tx = ox; ty = oy; th = F * DH * 1.1 / oz;
    }
    // (the aim turn changes the view: recompute the target on screen after it)
    const ssx = lerp(sx, tx, w), ssy = lerp(sy, ty, w), ssh = lerp(sh, th, w);

    drawWorld(T, s, hourIn, s);
    drawTank(T, s, 1);

    // the saucer at the hour
    let sauc = null;
    if (hourOut && s > 50) {
      const u = ease.inOutCubic(progress(s, 50, 56.5));
      let mxs = 0;
      for (const i of outT) mxs += SLOTS[i].x;
      mxs /= outT.length;
      sauc = { x: lerp(9, mxs, u), y: lerp(4.6, 2.85, u) + 0.06 * sin(T * 3), z: lerp(16, 6.4, u) };
    } else if (hourIn && s < 7) {
      const u = ease.inCubic(progress(s, 2.2, 6.5));
      let mxs = 0;
      for (const i of inT) mxs += SLOTS[i].x;
      mxs /= inT.length;
      sauc = { x: lerp(mxs, -11, u), y: 2.85 + 2.5 * u + 0.06 * sin(T * 3), z: lerp(6.4, 17, u) };
    }
    if (sauc) {
      drawSaucer(sauc.x, sauc.y, sauc.z, T, 1);
      // tractor beam: lines from the saucer's belly to the digits it is taking or giving
      const on = hourOut ? progress(s, LIFT0 - 0.4, LIFT0) * (1 - progress(s, 59.85, 60)) : hourIn ? 1 - progress(s, DROP - 0.3, DROP + 0.2) : 0;
      if (on > 0) {
        project(sauc.x, sauc.y - 0.15, sauc.z); const bx = ox, by = oy;
        for (const i of hourOut ? outT : inT) {
          const S = SLOTS[i];
          for (let e = -1; e <= 1; e += 2) {
            const flick = 0.75 + 0.25 * sin(T * 31 + i * 3 + e);
            project(S.x + e * 0.75, 0.05, S.z); beam.line(bx, by, ox, oy, SAUC, 0.4 * on * flick, 1.0, 0.7);
          }
        }
      }
    }

    // the numerals (moving pieces leave a phosphor ghost: the same pose 50 ms earlier, dim)
    const slotAt = (i, mode, d0, d1, u, du, key) => {
      if (mode !== 0) { GHOST = 0.3; drawSlot(i, T - 0.05, mode, d0, d1, Math.max(0, u - du), key, sauc); GHOST = 1; }
      drawSlot(i, T, mode, d0, d1, u, key, sauc);
    };
    for (let i = 0; i < 4; i++) {
      const goes = outT.includes(i), came = inT.includes(i);
      if (came && hourIn && s < DROP) slotAt(i, 4, +prv[i], +cur[i], progress(s, 0, DROP), 0.05 / DROP, f.minuteKey - 1);
      else if (came && !hourIn && s < ASM) slotAt(i, 2, +prv[i], +cur[i], progress(s, 0, ASM), 0.05 / ASM, f.minuteKey - 1);
      else if (goes && hourOut && s >= LIFT0) slotAt(i, 3, +cur[i], +cur[i], progress(s, LIFT0, LIFT1), 0.05 / (LIFT1 - LIFT0), f.minuteKey);
      else if (goes && !hourOut && s >= FIRE + outT.indexOf(i) * NEXT + FLIGHT) {
        const hit = FIRE + outT.indexOf(i) * NEXT + FLIGHT;
        slotAt(i, 1, +cur[i], +cur[i], progress(s, hit, 60), 0.05 / (60 - hit), f.minuteKey);
      } else drawSlot(i, T, 0, 0, +cur[i], 0, 0, null);
    }

    // shells and hit flashes
    if (!hourOut) {
      for (let k = 0; k < outT.length; k++) {
        const t0 = FIRE + k * NEXT, age = s - t0;
        if (age < 0 || age > FLIGHT + 0.45) continue;
        const [cx, cy, cz] = slotCentre(outT[k], T);
        const gx = cam.x + 0.3 * cam.sy, gz = cam.z + 0.3 * cam.cy;
        if (age < FLIGHT) {
          const u = age / FLIGHT, u0 = Math.max(0, u - 0.3);
          project(lerp(gx, cx, u0), lerp(0.25, cy, u0), lerp(gz, cz, u0)); const px = ox, py = oy;
          project(lerp(gx, cx, u), lerp(0.25, cy, u), lerp(gz, cz, u));
          beam.line(px, py, ox, oy, SHELL, 0.5, 1.0, 0.6);
          const r = 0.09 * F / oz;
          beam.line(ox - r, oy, ox, oy - r, SHELL, 1); beam.line(ox, oy - r, ox + r, oy, SHELL, 1);
          beam.line(ox + r, oy, ox, oy + r, SHELL, 1); beam.line(ox, oy + r, ox - r, oy, SHELL, 1);
        } else {
          const a = (age - FLIGHT) / 0.45;
          project(cx, cy, cz);
          const R0 = 2 + a * 16, R1 = R0 * 0.55;
          for (let r = 0; r < 8; r++) {
            const ang = r * 0.785 + 0.3;
            beam.line(ox + R1 * sin(ang), oy - R1 * cos(ang), ox + R0 * sin(ang), oy - R0 * cos(ang), SHELL, 1 - a, 1.0, 1);
          }
          beam.point(ox, oy, 0xffffff, 1 - a);
        }
      }
    }
    drawSight(ssx, ssy, ssh, tgt >= 0 && aimSlot >= 0 ? lock : 0, 1);

    // HUD
    const pend = hourOut ? 0 : outT.filter((i, k) => s >= FIRE + k * NEXT + FLIGHT).length;
    const score = (shots(f.h, f.m) + pend) * 1000 + (f.h + (hourIn && s < DROP ? 0 : 0)) * 4000;
    const [tkx, tkz] = tankPose(T);
    const blips = [tkx, tkz, SLOTS[0].x, SLOTS[0].z, SLOTS[3].x, SLOTS[3].z];
    drawHUD(T, f, score, blips);

    beam.flush(g, { bloom: 1 - 0.3 * night });
  },
};
