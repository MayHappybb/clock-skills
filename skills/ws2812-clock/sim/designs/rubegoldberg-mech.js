// Rube Goldberg: the four number mechanisms. Each takes the canvas, the old
// and new digit, and the seconds since the minute turned (age, may be
// negative before the turn), and draws itself. All closed-form in age.
import * as kit from '../js/kit.js';
import { makeCard } from './rubegoldberg-glyphs.js';
import { blitImage, sampleRGB } from './rubegoldberg-draw.js';

const CW = 24, CH = 36;          // card size for the sign, the tile and the slat board
const set = (wood, seed, o = {}) => Array.from({ length: 10 }, (_, d) => makeCard(d, o.w ?? CW, o.h ?? CH, { wood, seed: seed + d * 3, ...o }));
const SIGN = set(kit.hex('#3c7434'), 11, { grain: 0.25 });       // green-painted sign board
const TILE = set(kit.hex('#a8642c'), 23);                        // oak tile
const SLAT = set(kit.hex('#844822'), 37, { bevel: 0, grain: 0.1 });          // walnut slats
const DRUM = set(kit.hex('#b88044'), 51, { w: 22, h: 36, gx: 1 }); // maple drum cards

export const TOP = 24;           // top row of every card
const BRASS = kit.hex('#c08a2a'), DARK = kit.hex('#2a1608'), IRON = kit.hex('#5a5a62');
const tmp = [0, 0, 0];

// --------------------------------------------------------- H tens: pop-up sign
export const SIGN_X = 20;
/** Sign board on a spring post: drops into its box and springs up with the new figure. */
export function drawSign(cv, oldD, newD, age, idle) {
  let dy, d;
  const changed = oldD !== newD;
  if (!changed || age < -0.2 || age > 2) { d = newD; dy = 0; }
  else if (age < 0.38) { d = oldD; dy = 40 * kit.ease.in(kit.clamp((age + 0.2) / 0.58)); }
  else { d = newD; const k = kit.clamp((age - 0.45) / 1.4); dy = 40 * (1 - kit.ease.outElastic(k)); }
  dy += 0.35 * Math.sin(idle * 2.1);            // the spring never quite settles
  const cx = SIGN_X + CW / 2 - 0.5, cy = TOP + CH / 2 - 0.5 + dy;
  // spring post below the board
  const bot = cy + CH / 2;
  for (let k = 0; k < 6; k++) {
    const y0 = bot + ((63 - bot) * k) / 6, y1 = bot + ((63 - bot) * (k + 1)) / 6;
    cv.line(cx - 3, y0, cx + 3, y1, 0.5, IRON, 0.9);
  }
  blitImage(cv, SIGN[d], CW, CH, cx, cy, 0, 1, 1, 1, 55.5);
  // the box front that hides the board when it drops
  cv.box(SIGN_X + 11.5, 59.5, 15, 4, 0, kit.hex('#3a2010'), 1, (u, v) => 0.8 + 0.4 * (v < -0.7 ? 1 : 0));
  cv.line(SIGN_X - 3, 55.5, SIGN_X + 26, 55.5, 0.5, BRASS, 0.9);
}

// --------------------------------------------------------- H ones: punched tile
export const TILE_X = 52;
/** Oak tile in a chute: a boxing glove punches the old one out, the new drops in. */
export function drawTile(cv, oldD, newD, age) {
  const cx = TILE_X + CW / 2 - 0.5, cy = TOP + CH / 2 - 0.5;
  // chute rails
  cv.line(TILE_X - 1.5, 0, TILE_X - 1.5, 60, 0.6, BRASS, 0.8);
  cv.line(TILE_X + CW + 0.5, 0, TILE_X + CW + 0.5, 60, 0.6, BRASS, 0.8);
  const changed = oldD !== newD;
  const magazine = () => {
    cv.box(cx, 11.5, CW / 2 + 1.5, 9, 0, kit.hex('#2e160a'), 1, (u, v) => (v > 0.8 ? 0.5 : u < -0.85 || v < -0.85 ? 2.2 : 1));
    for (const rx of [-9, 9]) for (const ry of [4, 18]) cv.disc(cx + rx, ry, 0.7, BRASS, 0.9);
    cv.line(cx - 7, 11, cx + 7, 11, 0.5, kit.hex('#1a0c04'));
  };
  if (!changed || age < 0.12 || age > 4) {
    blitImage(cv, TILE[changed && age < 0.12 ? oldD : newD], CW, CH, cx, cy);
    magazine();
  } else {
    // new tile falls from above the panel and bounces in its seat
    const tf = age - 0.3;
    if (tf > 0) {
      const tl = Math.sqrt((2 * 64) / 300);
      let y;
      if (tf < tl) y = cy - 64 + 150 * tf * tf;
      else { const b = tf - tl; y = cy - Math.abs(Math.sin(b * 9)) * 3.5 * Math.exp(-b * 6); }
      blitImage(cv, TILE[newD], CW, CH, cx, y);
    }
    magazine();
    // old tile flies off to the left, tumbling
    const t = age - 0.12;
    const x = cx - 75 * t, y = cy - 70 * t + 150 * t * t, ang = -4.2 * t;
    if (y < 110) blitImage(cv, TILE[oldD], CW, CH, x, y, ang);
  }
}
/** Glove: wound back at rest; punches at the hour (age 0..0.35). */
export function drawGlove(cv, punch, idle) {
  const reach = punch;                           // 0 rest .. 1 full punch
  const gx = 88 - 16 * reach, gy = 47 + 0.4 * Math.sin(idle * 3);
  // lazy-tongs arm from the spring box to the glove
  const bx = 93, by = 57, n = 3;
  for (let k = 0; k < n; k++) {
    const ax = bx + ((gx + 3 - bx) * k) / n, ay = by + ((gy - by) * k) / n;
    const zx = bx + ((gx + 3 - bx) * (k + 1)) / n, zy = by + ((gy - by) * (k + 1)) / n;
    cv.line(ax, ay - 1.5, zx, zy + 1.5, 0.45, IRON, 0.9);
    cv.line(ax, ay + 1.5, zx, zy - 1.5, 0.45, IRON, 0.9);
  }
  cv.box(95, 58.5, 3.5, 3, 0, kit.hex('#5a2a12'), 1, (u, v) => (v < -0.5 ? 1.4 : 1));
  const RED = kit.hex('#d8261a');
  cv.box(gx + 5.6, gy + 0.3, 2.0, 3.4, 0, kit.hex('#f4e6c8'));        // cuff
  cv.line(gx + 5.6, gy - 2.4, gx + 5.6, gy + 3, 0.35, kit.hex('#8a2010'));
  cv.disc(gx, gy, 4.8, RED);
  cv.disc(gx + 0.6, gy - 4.0, 2.2, kit.scale(RED, 0.85));            // thumb
  for (let k = -1; k <= 1; k++) cv.line(gx - 4.4, gy + k * 1.6, gx - 2.8, gy + k * 1.6, 0.3, kit.hex('#6a0c06'), 0.8);
  cv.disc(gx - 1.8, gy - 1.6, 1.3, [1, 0.65, 0.55], 0.6);            // shine
}

// --------------------------------------------------------- M tens: flipping slats
export const SLAT_X = 157;
const NSL = 6, SH = CH / NSL;
/** Six walnut slats; each turns over on its axle, top first. */
export function drawSlats(cv, oldD, newD, age) {
  const changed = oldD !== newD;
  const imgO = SLAT[oldD], imgN = SLAT[newD];
  // frame
  cv.box(SLAT_X + CW / 2 - 0.5, TOP + CH / 2 - 0.5, CW / 2 + 1.5, CH / 2 + 1.5, 0, [0.004, 0.002, 0.001]);
  for (let s = 0; s < NSL; s++) {
    let phi = 0;
    if (changed) phi = Math.PI * kit.ease.inOut(kit.clamp((age - s * 0.08) / 0.45));
    const c = Math.cos(phi), front = c >= 0, h = Math.abs(c);
    const img = changed ? (front ? imgO : imgN) : imgN;
    const mid = TOP + s * SH + SH / 2 - 0.5;
    const lite = 0.55 + 0.45 * h + (front ? 0.12 : -0.08) * Math.sin(phi);
    const half = (SH / 2) * h;
    for (let y = Math.floor(mid - half - 1); y <= Math.ceil(mid + half + 1); y++) {
      const dy = y - mid;
      let a = half + 0.5 - Math.abs(dy);
      if (a <= 0) continue; if (a > 1) a = 1;
      const v = s * SH + SH / 2 + (h > 0.02 ? dy / h : 0);
      // each slat is a bevelled board: lit top edge, shadowed bottom edge
      const r = v - s * SH, bev = r < 1 ? 1.25 : r > SH - 1 ? 0.35 : 1;
      const lk = lite * bev;
      for (let x = SLAT_X; x < SLAT_X + CW; x++) {
        sampleRGB(img, CW, CH, x - SLAT_X + 0.5, v, tmp);
        tmp[0] *= lk; tmp[1] *= lk; tmp[2] *= lk;
        cv.over(x, y, tmp, a);
      }
    }
    // the slat's edge, seen as it turns
    const e = Math.abs(Math.sin(phi));
    if (e > 0.05) cv.line(SLAT_X, mid + (front ? half : -half), SLAT_X + CW - 1, mid + (front ? half : -half), 0.5, kit.hex('#d09050'), e * 0.8);
    cv.disc(SLAT_X - 1, mid, 0.9, BRASS, 0.9);
    cv.disc(SLAT_X + CW, mid, 0.9, BRASS, 0.9);
  }
}

// --------------------------------------------------------- M ones: the drum
export const DRUM_CX = 220.5;
const FW = 22, APO = FW / (2 * Math.tan(Math.PI / 10)), ROUT = FW / 2 / Math.sin(Math.PI / 10);
const TILT = 0.07;               // seen a little from above: far parts rise
/** Ten maple cards on a decagonal drum, vertical axle; angle rot (rad) turns it. */
export function drawDrum(cv, rot) {
  const cx = DRUM_CX, y0 = TOP;
  // lid: the top of the prism, an ellipse seen from above
  for (let x = Math.floor(cx - ROUT); x <= Math.ceil(cx + ROUT); x++) {
    const dx = (x - cx) / ROUT;
    if (Math.abs(dx) >= 1) continue;
    const zf = Math.sqrt(1 - dx * dx) * ROUT;
    const yb = y0 - TILT * (ROUT - zf) - 0.5, yt = y0 - TILT * (ROUT + zf) - 0.5;
    for (let y = Math.floor(yt); y <= Math.ceil(yb); y++) {
      let a = Math.min(yb - y + 0.5, y - yt + 0.5, 1);
      if (a <= 0) continue;
      cv.over(x, y, kit.scale(BRASS, 0.55 + 0.35 * (1 - Math.abs(dx))), a);
    }
  }
  for (let k = 0; k < 10; k++) {
    const th = rot + (k * Math.PI) / 5;
    const c = Math.cos(th), s = Math.sin(th);
    if (c <= 0.02) continue;
    const xa = cx + APO * s - (FW / 2) * c, xb = cx + APO * s + (FW / 2) * c;
    const lite = 0.1 + 0.9 * Math.max(0, Math.cos(th)) ** 4;
    for (let x = Math.floor(xa); x <= Math.ceil(xb); x++) {
      let ax = Math.min(x + 0.5 - xa, xb - (x - 0.5), 1);
      if (ax <= 0) continue;
      const u = (x - cx - APO * s) / c + FW / 2;
      const z = APO * c - (u - FW / 2) * s;           // depth toward the viewer
      const lift = TILT * (ROUT - z);
      const edge = Math.min(u, FW - u) < 0.8 ? 0.6 : 1;
      for (let y = TOP - 1; y < TOP + CH + 1; y++) {
        const v = y - (y0 - lift) + 0.5;
        let a = Math.min(v + 0.5, CH - v + 0.5, 1);
        if (a <= 0) continue;
        sampleRGB(DRUM[k], FW, CH, u, v, tmp);
        const kk = lite * edge;
        tmp[0] *= kk; tmp[1] *= kk; tmp[2] *= kk;
        cv.over(x, y, tmp, a * ax);
      }
    }
  }
  // the drum's housing: a walnut shell round the cards, shaded as a cylinder,
  // with a window one card wide; brass hoops top and bottom
  const WIN = 12.6, SHELL = kit.hex('#34486e');
  for (let x = Math.floor(cx - ROUT - 1); x <= Math.ceil(cx + ROUT + 1); x++) {
    const nx = (x - cx) / (ROUT + 0.8);
    if (Math.abs(nx) >= 1) continue;
    const ax = Math.min(1, (1 - Math.abs(nx)) * (ROUT + 0.8) + 0.2);
    const win = Math.abs(x - cx) - WIN;               // > 0 outside the window
    const nz = Math.sqrt(1 - nx * nx), sh = 0.18 + 0.82 * nz * (0.6 + 0.4 * Math.max(0, -nx + 0.3));
    const lift = TILT * (ROUT + 0.8) * (1 - nz);
    for (let y = TOP - 2; y <= TOP + CH + 1; y++) {
      const yy = y + lift;                             // straight rows bend with the shell
      const hoop = yy < TOP + 1.5 || yy > TOP + CH - 2.5;
      let a = win > 0 ? Math.min(1, win + 0.5) : hoop ? 1 : 0;
      if (a <= 0 || yy < TOP - 1 || yy > TOP + CH) continue;
      const col = hoop ? BRASS : SHELL;
      // barrel staves every 15 degrees: their spacing closes up toward the edges
      const st = Math.abs(Math.asin(nx) / (Math.PI / 12) - Math.round(Math.asin(nx) / (Math.PI / 12)));
      const k = sh * (hoop ? 0.8 : st < 0.12 ? 0.35 : 1.25);
      tmp[0] = col[0] * k; tmp[1] = col[1] * k; tmp[2] = col[2] * k;
      cv.over(x, y, tmp, a * ax);
    }
  }
  // plinth
  cv.box(cx, TOP + CH + 1.5, ROUT + 1, 1.5, 0, kit.scale(BRASS, 0.6));
}
/** Drum angle for showing value d, turning from d-1 with a ratchet kick over age 0..1.1. */
export function drumAngle(oldD, newD, age, carry = false) {
  const target = (-newD * Math.PI) / 5;
  if (oldD === newD || age > 1.6) return target;
  if (age < 0) return (-oldD * Math.PI) / 5;
  // on a carry the drum leaves the old figure at once (two half cards show
  // while the tens slats turn), so 09 never reads as 19 or 00 on the way
  if (carry) return target + (Math.PI / 5) * (1 - kit.ease.out(kit.clamp(age / 0.95)));
  const k = kit.clamp(age / 1.1);
  const e = 1 + 2.7 * (k - 1) ** 3 + 1.7 * (k - 1) ** 2;   // outBack
  return target + (Math.PI / 5) * (1 - e);
}
