// Zen Sand: a kinetic sand table seen from above. A polished steel ball,
// pulled by a hidden magnet, ploughs the time through fine sand as one
// unbroken line of italic groove script (a ball cannot lift), while it lays
// a braided lace round the rim. One low lamp rakes the table, so every groove
// is relief: a lit wall, a shadowed wall, glinting grains. The lamp walks
// round the table with the time of day, and the shadows turn with it.
//
// Minute: the ball runs in along the stem, smooths the old digit flat in
// tight columns, ploughs the new one stroke by stroke, and runs back out.
// Hour: it re-rakes the whole table round the script, arc after arc from the
// rim inward like a pendulum, then whips the lace round twice.
//
// The sand is a height field kept by zensand-sand.js; this file lights it.
// Look: a thin opal sheet (1.2 mm on the 2 mm pitch) so the GOB dots just
// touch and the relief reads as one lit surface instead of separate points.
import * as kit from '../js/kit.js';
import { W, N, CX, CY, RS, minuteData, fieldAt, ballAt } from './zensand-sand.js';

const SAND = kit.hex('#f3e7d2');     // albedo of the sand, sRGB pick
const LAMP = kit.blackbody(3700);    // a warm lamp
const ROOM = kit.blackbody(4200);    // the room's soft fill from above
const BRASS = kit.hex('#c89a52');

const EL = 0.32;                     // lamp elevation (rad): low, raking
const KH = 1.1;                      // height units -> pixels of relief
const BALL_R = 2.5;

const h = new Float32Array(N), img = new Float32Array(3 * N);
// per-pixel constants: sand mask, albedo jitter, grain glint seeds
const inSand = new Uint8Array(N), alb = new Float32Array(N), glint = new Float32Array(N), gph = new Float32Array(N);
const rr = new Float32Array(N), rth = new Float32Array(N);
for (let p = 0; p < N; p++) {
  const x = p % W, y = (p / W) | 0, dx = x - CX, dy = y - CY, r = Math.hypot(dx, dy);
  rr[p] = r; rth[p] = Math.atan2(dy, dx);
  inSand[p] = r < RS ? 1 : 0;
  alb[p] = 0.94 + 0.12 * kit.hash(x, y, 7);
  const g = kit.hash(x, y, 13);
  glint[p] = g > 0.9 ? (g - 0.9) * 10 : 0;
  gph[p] = kit.hash(x, y, 29) * kit.TAU;
}

/** Lamp azimuth (where the lamp stands, screen angle) from the time of day. */
function lampAz(date) {
  const hr = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
  return -Math.PI / 2 + (hr - 12) / 24 * kit.TAU; // noon: lamp at the top
}

export default {
  name: 'Zen Sand',
  blurb: 'a steel ball ploughs the time as one unbroken groove script through raked sand, lit by a lamp that walks round with the day',
  layouts: ['hub'], look: { look: 'opal', gap: 1.2 }, fps: 60, brightness: 0.4, dither: true,
  frame(ctx) {
    const ms = ctx.date.getTime(), m = Math.floor(ms / 60000), t = (ms - m * 60000) / 1000;
    const { start, path, V } = minuteData(m);
    fieldAt(h, start, V, path, t);
    const [bx, by] = ballAt(path, t);

    const az = lampAz(ctx.date), ce = Math.cos(EL), se = Math.sin(EL);
    const lx = Math.cos(az) * ce, ly = Math.sin(az) * ce, lz = se, tanE = se / ce;
    const ux = Math.cos(az), uy = Math.sin(az);
    const dim = 1 - 0.6 * ctx.night;
    const now = ms / 1000;
    // ball shadow: a capsule from the ball away from the lamp
    const shLen = BALL_R * 1.6 / tanE;

    for (let y = 0; y < W; y++) {
      for (let x = 0; x < W; x++) {
        const p = y * W + x, o = 3 * p;
        if (!inSand[p]) { img[o] = img[o + 1] = img[o + 2] = 0; continue; }
        const hp = h[p];
        const hl = x > 0 ? h[p - 1] : hp, hr = x < W - 1 ? h[p + 1] : hp;
        const hu = y > 0 ? h[p - W] : hp, hd = y < W - 1 ? h[p + W] : hp;
        const gx = (hr - hl) * 0.5 * KH, gy = (hd - hu) * 0.5 * KH;
        const inv = 1 / Math.sqrt(gx * gx + gy * gy + 1);
        const nx = -gx * inv, ny = -gy * inv, nz = inv;
        let diff = nx * lx + ny * ly + nz * lz;
        if (diff < 0) diff = 0;
        // cast shadow: march toward the lamp
        let sh = 1;
        const h0 = hp * KH;
        for (let k = 1; k <= 4; k++) {
          const qx = Math.round(x + ux * k), qy = Math.round(y + uy * k);
          if (qx < 0 || qy < 0 || qx >= W || qy >= W) break;
          const over = h[qy * W + qx] * KH - h0 - k * tanE;
          if (over > 0) sh -= over * 0.7;
        }
        // the table wall shadows the sand on the lamp's side
        const dx = x - CX, dy = y - CY;
        const bdot = dx * ux + dy * uy, c2 = dx * dx + dy * dy - RS * RS;
        const sHit = -bdot + Math.sqrt(Math.max(0, bdot * bdot - c2));
        const wall = kit.smoothstep(0.5, 2.6, sHit * tanE / 0.55);
        sh = (sh < 0 ? 0 : sh) * (0.12 + 0.88 * wall);
        // ball shadow
        const sx = x - bx, sy = y - by;
        const along = -(sx * ux + sy * uy);
        if (along > -BALL_R && along < shLen + BALL_R) {
          const a = Math.max(0, Math.min(shLen, along));
          const px = sx + ux * a, py = sy + uy * a;
          const dd = Math.sqrt(px * px + py * py);
          const w = BALL_R * (1 - 0.35 * a / shLen);
          if (dd < w + 0.8) sh *= 0.15 + 0.85 * kit.smoothstep(w - 0.8, w + 0.8, dd);
        }
        // occlusion: troughs see less of the room
        const avg = (hl + hr + hu + hd) * 0.25;
        let ao = 1 - (avg - hp) * 1.2 - (hp < 0 ? -hp * 0.55 : 0);
        ao = ao < 0 ? 0 : ao > 1.15 ? 1.15 : ao;
        // the lamp's pool: brighter toward it
        const pool = 0.72 + 0.28 * (bdot / 32);
        const cav = ao > 1 ? 1 : 0.25 + 0.75 * ao;
        const d2 = diff * diff, L = d2 * diff * sh * pool * cav * 3.2;
        const sky = 0.16 * nz * nz * ao * (0.6 + 0.4 * wall);
        const al = alb[p];
        let r = al * SAND[0] * (LAMP[0] * L + ROOM[0] * sky);
        let g = al * SAND[1] * (LAMP[1] * L + ROOM[1] * sky);
        let b = al * SAND[2] * (LAMP[2] * L + ROOM[2] * sky);
        // glinting grains: mica turning to the lamp
        if (glint[p] > 0 && L > 0.25) {
          const tw = Math.sin(now * (0.7 + glint[p]) + gph[p] + az * 9);
          if (tw > 0.93) { const s = (tw - 0.93) * 14 * glint[p] * L; r += s; g += s * 0.95; b += s * 0.85; }
        }
        img[o] = r; img[o + 1] = g; img[o + 2] = b;
      }
    }

    // the steel ball: a dark mirror with the lamp in it and the sand round
    // its rim; at speed it is drawn over the frame's travel (motion blur)
    const SUB = 4, bp = [];
    for (let k = 0; k < SUB; k++) bp.push(ballAt(path, Math.max(0, t - k / (60 * SUB))));
    const blur = Math.hypot(bp[0][0] - bp[SUB - 1][0], bp[0][1] - bp[SUB - 1][1]) > 0.6;
    const subs = blur ? SUB : 1;
    const x0 = Math.floor(Math.min(bx, bp[SUB - 1][0]) - BALL_R - 1), x1 = Math.ceil(Math.max(bx, bp[SUB - 1][0]) + BALL_R + 1);
    const y0 = Math.floor(Math.min(by, bp[SUB - 1][1]) - BALL_R - 1), y1 = Math.ceil(Math.max(by, bp[SUB - 1][1]) + BALL_R + 1);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (x < 0 || y < 0 || x >= W || y >= W) continue;
      let cr = 0, cg = 0, cb = 0, cv = 0;
      for (let k = 0; k < subs; k++) {
        const dx = (x - bp[k][0]) / BALL_R, dy = (y - bp[k][1]) / BALL_R, d2 = dx * dx + dy * dy;
        const cov = kit.clamp(BALL_R + 0.5 - Math.sqrt(d2) * BALL_R);
        if (cov <= 0) continue;
        const nz = Math.sqrt(Math.max(0, 1 - Math.min(1, d2)));
        // reflect the view ray: r = 2 nz n - z
        const rx = 2 * nz * dx, ry = 2 * nz * dy, rz = 2 * nz * nz - 1;
        const spec = Math.max(0, rx * lx + ry * ly + rz * lz);
        const hot = spec ** 30 * 3.0 + spec ** 4 * 0.35;
        const ground = rz < 0.15 ? 0.1 + 0.5 * (0.15 - rz) : 0.012;  // sand seen in the rim, dark room above
        cr += cov * (SAND[0] * LAMP[0] * ground + LAMP[0] * hot);
        cg += cov * (SAND[1] * LAMP[1] * ground + LAMP[1] * hot);
        cb += cov * (SAND[2] * LAMP[2] * ground + LAMP[2] * hot + 0.012);
        cv += cov;
      }
      if (cv <= 0) continue;
      const a = cv / subs, o = 3 * (y * W + x), inv = 1 / cv;
      img[o] += (cr * inv - img[o]) * a; img[o + 1] += (cg * inv - img[o + 1]) * a; img[o + 2] += (cb * inv - img[o + 2]) * a;
    }

    // the table's brass wall: catches the lamp on the far side
    for (let p = 0; p < N; p++) {
      const r = rr[p];
      if (r < RS - 0.2 || r > RS + 1.6) continue;
      const cov = kit.clamp(1 - Math.abs(r - (RS + 0.7)) / 0.9);
      const facing = Math.cos(rth[p] - az + Math.PI);  // inner face turned to the lamp
      const s = 0.03 + 0.5 * Math.max(0, facing) ** 6 + 0.06 * Math.max(0, -facing);
      const o = 3 * p;
      img[o] += BRASS[0] * s * cov; img[o + 1] += BRASS[1] * s * cov; img[o + 2] += BRASS[2] * s * cov;
    }
    kit.blitGrid(ctx, img, dim);
  },
};
