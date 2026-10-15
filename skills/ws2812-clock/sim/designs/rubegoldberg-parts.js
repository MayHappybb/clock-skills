// Rube Goldberg: the machine's parts, drawn into the canvas.
import * as kit from '../js/kit.js';
import * as T from './rubegoldberg-time.js';

export const BRASS = kit.hex('#c08a2a'), IRON = kit.hex('#6a6a74'), WOOD = kit.hex('#9a5c26');
const LEATHER = kit.hex('#a85a26'), LACQ = kit.hex('#c42a14'), IVORY = kit.hex('#ffe6b0');
const STEEL = kit.hex('#9aa6c0');

/** Filled ellipse; col(y) gives the colour per row (y relative to top, 0..1). */
function ellipse(cv, cx, cy, rx, ry, col, a = 1) {
  const x0 = Math.max(0, Math.floor(cx - rx - 1)), x1 = Math.min(cv.w - 1, Math.ceil(cx + rx + 1));
  const y0 = Math.max(0, Math.floor(cy - ry - 1)), y1 = Math.min(cv.h - 1, Math.ceil(cy + ry + 1));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const dx = (x - cx) / rx, dy = (y - cy) / ry, d = Math.sqrt(dx * dx + dy * dy);
    const k = (1 - d) * Math.min(rx, ry) + 0.5;
    if (k <= 0) continue;
    cv.over(x, y, typeof col === 'function' ? col((y - cy + ry) / (2 * ry)) : col, a * (k > 1 ? 1 : k));
  }
}

// ------------------------------------------------------------ marbles
export function marble(cv, x, y, k = 1) {
  cv.disc(x, y, T.MR + 0.6, [0, 0, 0], 0.8);
  cv.disc(x, y, T.MR, kit.scale(STEEL, 0.85 * k));
  cv.disc(x - 0.7, y - 0.8, 1.0, [1, 1, 1], 0.9 * k, true);
}

// ------------------------------------------------------------ lift + hopper + rail
export function lift(cv, tday) {
  const { x, yb, yt, r } = T.LIFT, H = yb - yt;
  cv.line(x - 5.5, 0, x - 5.5, 62, 0.5, kit.scale(WOOD, 0.5));
  cv.line(x + 5.5, 0, x + 5.5, 62, 0.5, kit.scale(WOOD, 0.5));
  cv.line(x + r, yt, x + r, yb, 0.4, IRON, 0.8);
  cv.line(x - r, yt, x - r, yb, 0.4, IRON, 0.8);
  cv.ring(x, yt, r, 0.5, IRON); cv.ring(x, yb, r, 0.5, IRON);
  const ang = (T.LIFT_V * tday) / r;
  for (const cy of [yt, yb]) for (let s = 0; s < 3; s++) {
    const a = ang + (s * 2 * Math.PI) / 3;
    cv.line(x, cy, x + r * Math.cos(a), cy + r * Math.sin(a), 0.4, IRON, 0.8);
  }
  for (let j = 0; j < 14; j++) {
    let p = (T.LIFT_V * tday + j * T.LIFT_SP) % T.liftLoop;
    let bx, by, side;
    if (p < H) { bx = x + r; by = yb - p; side = 1; }
    else if ((p -= H) < Math.PI * r) { const a = -p / r; bx = x + r * Math.cos(a); by = yt + r * Math.sin(a); side = 0; }
    else if ((p -= Math.PI * r) < H) { bx = x - r; by = yt + p; side = -1; }
    else { p -= H; const a = Math.PI - p / r; bx = x + r * Math.cos(a); by = yb - r * Math.sin(a); side = 0; }
    cv.box(bx + side * 1.4, by + 0.8, 1.5, 0.7, 0, BRASS);
  }
}
export function rail(cv) {
  const R = T.RAIL;
  for (const hx of [22, 48, 70]) cv.line(hx, 0, hx, T.railY(hx), 0.35, IRON, 0.5);
  cv.line(R.x0, R.y0, R.x1, R.y1, 0.6, BRASS);
  cv.line(R.x1, R.y1, R.x1 + 1.2, R.y1 - 1.5, 0.5, BRASS);   // lip at the end
}
export function gate(cv, open) {
  const gx = T.GATE_X, gy = T.ballY(gx) + T.MR;
  const a = -1.35 * open;
  cv.line(gx, gy - 6, gx + 6 * Math.sin(-a), gy - 6 + 6 * Math.cos(a), 0.55, LACQ);
  cv.disc(gx, gy - 6, 0.9, BRASS);
}

// ------------------------------------------------------------ belt and hamster wheel
export function belt(cv, tday) {
  const B = T.BELT;
  cv.line(B.x0, B.y, B.x1, B.y, 1.0, kit.hex('#2a2018'));
  const off = (B.v * tday) % 5;
  for (let x = B.x1 - (5 - off); x > B.x0; x -= 5) cv.line(x, B.y, x + 1.2, B.y, 0.45, kit.hex('#6a5a40'));
  cv.disc(B.x0, B.y, 1.4, IRON); cv.disc(B.x1, B.y, 1.4, IRON);
}
export function hamsterWheel(cv, ang, run, tday) {
  const cx = 148, cy = 52.5, r = 8;
  cv.line(cx, cy, cx - 4, 61, 0.5, IRON); cv.line(cx, cy, cx + 4, 61, 0.5, IRON);
  cv.ring(cx, cy, r, 0.55, kit.scale(BRASS, 0.8));
  for (let s = 0; s < 8; s++) {
    const a = ang + (s * Math.PI) / 4;
    cv.line(cx + 2 * Math.cos(a), cy + 2 * Math.sin(a), cx + r * Math.cos(a), cy + r * Math.sin(a), 0.3, IRON, 0.6);
  }
  cv.disc(cx, cy, 1.3, BRASS);
  // the hamster runs at the bottom, leaning into it
  const hb = 0.6 * Math.abs(Math.sin(run * 2)), hx = cx + 0.5, hy = cy + r - 3.6 - hb;
  const FUR = kit.hex('#f0a050');
  ellipse(cv, hx, hy, 3.4, 2.4, FUR);
  ellipse(cv, hx + 2.6, hy - 0.8, 1.9, 1.7, FUR);
  cv.disc(hx + 0.2, hy + 0.7, 1.5, kit.hex('#fff0d8'), 0.8);   // belly
  cv.disc(hx + 1.6, hy - 2.6, 0.8, kit.hex('#ff9a9a'));          // ear
  cv.disc(hx + 3.2, hy - 1.2, 0.55, [0, 0, 0]);                  // eye
  for (let l = 0; l < 2; l++) {
    const ph = run * 2 + l * Math.PI;
    cv.line(hx - 1 + l * 2, hy + 1.8, hx - 1 + l * 2 + 1.6 * Math.sin(ph), hy + 3.2, 0.4, FUR);
  }
}

// ------------------------------------------------------------ seesaw
export function seesaw(cv, th) {
  const X = T.PIV_X, Y = T.PIV_Y, c = Math.cos(th), s = Math.sin(th);
  cv.line(X, Y, X - 4.5, 61, 0.7, kit.scale(WOOD, 0.7)); cv.line(X, Y, X + 4.5, 61, 0.7, kit.scale(WOOD, 0.7));
  cv.line(X - T.HALF * c, Y - T.HALF * s, X + T.HALF * c, Y + T.HALF * s, 0.9, WOOD);
  cv.disc(X, Y, 1.2, BRASS);
  const lx = X - T.HALF * c, ly = Y - T.HALF * s;
  cv.line(lx - 2.8 * c - s * 2.2, ly - 2.8 * s + c * -2.2 + 0, lx - 2.8 * c, ly - 2.8 * s, 0.45, BRASS);
  cv.line(lx + 2.8 * c - s * 2.2, ly + 2.8 * s - c * 2.2, lx + 2.8 * c, ly + 2.8 * s, 0.45, BRASS);
  cv.line(lx - 2.8 * c, ly - 2.8 * s - 0.6, lx + 2.8 * c, ly + 2.8 * s - 0.6, 0.45, BRASS);
}
export const rightEnd = (th) => [T.PIV_X + T.HALF * Math.cos(th), T.PIV_Y + T.HALF * Math.sin(th)];

// ------------------------------------------------------------ the frog
const BANDS = ['#ff3b30', '#ff9500', '#ffd60a', '#34c759', '#0a84ff', '#8e5cff'].map(kit.hex);
const GREEN = kit.hex('#34c759');
/** The owner's frog: rainbow body, big white-rimmed round glasses, smile. (x, yb) = bottom centre. */
export function frog(cv, x, yb, { squash = 0, legs = 0, look = 0, blink = 0, face = 1 } = {}) {
  const sy = 1 - squash, sx = 1 + 0.6 * squash;
  const by = yb - 6.2 * sy;
  // feet / legs
  const fy = yb - 0.8 + legs * 3;
  for (const s of [-1, 1]) {
    if (legs > 0.05) cv.line(x + s * 5 * sx, by + 2, x + s * 6.5 * sx, fy, 1.0, GREEN);
    ellipse(cv, x + s * 6.6 * sx, fy, 2.6, 1.2, GREEN);
  }
  ellipse(cv, x, by, 9.2 * sx, 6.6 * sy, [0, 0, 0], 0.9);   // dark keyline
  ellipse(cv, x, by, 8.4 * sx, 5.9 * sy, (v) => BANDS[Math.max(0, Math.min(5, Math.floor(v * 6)))]);
  // smile
  for (let i = -3; i <= 3; i++) {
    const u = i / 3.4, mx = x + face * 1 + i * 1.15 * sx, my = by + 1.6 * sy + (1 - u * u) * 1.6 * sy;
    cv.disc(mx, my, 0.55, [0.02, 0, 0.02]);
  }
  // glasses
  const ey = yb - 12.4 * sy - 0.4 * squash;
  for (const s of [-1, 1]) {
    const ex = x + s * 3.9 * sx + face * 0.6;
    cv.disc(ex, ey, 3.9, [0, 0, 0], 0.9);
    cv.disc(ex, ey, 3.3, kit.hex('#fff6dc'));
    cv.disc(ex, ey, 2.4, kit.hex('#1a2a14'));
    if (blink < 0.5) {
      cv.disc(ex + 0.5 * face + look, ey + 0.2, 1.5, kit.hex('#e8f0d0'));
      cv.disc(ex + 0.7 * face + look, ey + 0.3, 0.8, [0, 0, 0]);
    } else cv.line(ex - 1.6, ey + 0.3, ex + 1.6, ey + 0.3, 0.45, kit.hex('#e8f0d0'));
  }
  cv.line(x - 0.6 + face * 0.6, ey, x + 0.6 + face * 0.6, ey, 0.5, kit.hex('#fff6dc'));
}

// ------------------------------------------------------------ boot pendulum
export function boot(cv, th) {
  const { px, py, L } = T.BOOT, s = Math.sin(th), c = Math.cos(th);
  const bx = px + L * s, by = py + L * c;
  // local frame: down the rod is +v, toe points +u (right); (bx, by) is the ankle
  const K = 1.35, P = (u, v) => [bx + K * (u * c + v * s), by + K * (-u * s + v * c)];
  cv.line(px, py, ...P(-0.5, -5.5), 0.45, IRON, 0.9);
  cv.box(...P(-0.6, -2.6), 2.6 * K, 3.6 * K, -th, LEATHER, 1, (u) => (u < -0.4 ? 1.4 : 1));        // shaft
  cv.box(...P(-0.6, -6.1), 3.0 * K, 0.8 * K, -th, kit.scale(LEATHER, 0.6));                        // cuff
  cv.box(...P(1.6, 2.3), 4.6 * K, 2.2 * K, -th, LEATHER, 1, (u, v) => (v < -0.3 ? 1.35 : 1));      // foot
  cv.disc(...P(5.6, 2.6), 2.0 * K, LEATHER);                                                     // round toe
  cv.disc(...P(5.3, 1.8), 0.8, kit.hex('#ffd0a0'), 0.5);                                     // toe shine
  cv.line(...P(-3.2, 4.8), ...P(7.0, 4.8), 0.65, kit.hex('#2a1408'));                       // sole
  cv.box(...P(-2.2, 4.8), 1.2 * K, 0.9 * K, -th, kit.hex('#2a1408'));                               // heel
  for (let k = 0; k < 3; k++) cv.line(...P(0.4, -4.4 + k * 1.6), ...P(1.9, -3.8 + k * 1.6), 0.35, IVORY, 0.9); // laces
}
export function bootTip(th) {
  const { px, py, L } = T.BOOT;
  return [px + L * Math.sin(th) + 6 * Math.cos(th), py + L * Math.cos(th)];
}

// ------------------------------------------------------------ dominoes, shelf, lever
export function shelf(cv) {
  cv.line(158, T.DOM.shelf + 0.8, 246, T.DOM.shelf + 0.8, 0.7, kit.scale(WOOD, 0.8));
}
export function domino(cv, i, phi) {
  const D = T.DOM, bx = D.x0 + i * D.dx, pxp = bx + D.w / 2, py = D.shelf;
  const c = Math.cos(phi), s = Math.sin(phi);
  const rot = (a, b) => [pxp + a * c - b * s, py + a * s + b * c];
  const [cx, cy] = rot(-D.w / 2, -D.h / 2);
  cv.box(cx, cy, D.w / 2, D.h / 2, phi, LACQ, 1, (u) => (u < -0.3 ? 1.3 : 0.9));
  cv.disc(...rot(-D.w / 2, -D.h * 0.75), 0.55, IVORY, 0.9);
  cv.disc(...rot(-D.w / 2, -D.h * 0.25), 0.55, IVORY, 0.9);
}
export function lever(cv, a) {
  const X = 238.5, Y = 19.5;
  cv.line(X - 4.5 * Math.cos(a), Y + 4.5 * Math.sin(a), X + 4.5 * Math.cos(a), Y - 4.5 * Math.sin(a), 0.55, IRON);
  cv.disc(X, Y, 0.9, BRASS);
  return [X + 4.5 * Math.cos(a), Y - 4.5 * Math.sin(a)];
}
export function rope(cv, endX, endY, shift) {
  const C = kit.hex('#8a6a40');
  cv.line(92, 1.5, 244, 1.5, 0.35, C, 0.6);
  cv.line(244, 1.5, endX, endY, 0.35, C, 0.6);
  cv.line(92, 1.5, 93, 55, 0.35, C, 0.6);
  cv.disc(244, 1.5, 1.1, IRON); cv.disc(92, 1.5, 1.1, IRON);
  for (let x = 96 + (shift % 8 + 8) % 8; x < 242; x += 8) cv.disc(x, 1.5, 0.7, C, 0.8);
}

// ------------------------------------------------------------ flag and confetti
export function flag(cv, h, t) {
  const X = 253, y0 = 21 - 15 * h;
  cv.line(X, 0.5, X, 22, 0.45, IRON);
  cv.disc(X, 0.8, 0.8, BRASS);
  for (let i = 0; i < 10; i++) {
    const w = Math.sin(t * 7 - i * 0.8) * 0.9 * (i / 9), hh = 5.4 * (1 - i / 13);
    for (let j = 0; j < hh; j += 1) {
      const col = Math.floor((j / hh) * 3) % 2 ? IVORY : LACQ;
      cv.over(Math.round(X - 1 - i), Math.round(y0 + j + w), col, 0.95);
    }
  }
}
const CONF = ['#ff3b30', '#ffd60a', '#34c759', '#0a84ff', '#fff1cf', '#ff9500'].map(kit.hex);
export function confetti(cv, age) {
  if (age < 0 || age > 8) return;
  const k = 1.7, g = 95, f = (1 - Math.exp(-k * age)) / k;
  const fade = kit.clamp((8 - age) / 2);
  for (let i = 0; i < 180; i++) {
    const a = -Math.PI / 2 + (kit.hash(i, 7) - 0.58) * 2.6, v = 50 + 170 * kit.hash(i, 9);
    const t = age - 0.02 * (i % 5);
    if (t < 0) continue;
    const x = 232 + v * Math.cos(a) * f + 2.5 * Math.sin(age * 4 + i);
    const y = 8 + v * Math.sin(a) * f + (g / k) * (age - f);
    if (y > 64 || y < -2 || x < 0) continue;
    const spin = Math.sin(age * (5 + 7 * kit.hash(i, 3)) + i);
    const c = CONF[i % 6], br = (0.4 + 0.6 * Math.abs(spin)) * fade;
    cv.disc(x, y, 0.95, c, br, true);
    cv.disc(x + spin * 0.9, y + 0.5, 0.6, c, br * 0.8, true);
  }
}

// ------------------------------------------------------------ workshop lamp
export function lamp(cv, t) {
  const sway = 0.05 * Math.sin(t * 0.9), X = 121, L = 7;
  const bx = X + L * Math.sin(sway), by = L * Math.cos(sway);
  cv.line(X, 0, bx, by, 0.35, IRON, 0.8);
  cv.box(bx, by + 1, 3.6, 1.3, sway, kit.scale(BRASS, 0.9), 1, (u, v) => (v < 0 ? 1.3 : 0.8));
  const fl = 0.92 + 0.08 * kit.noise2(t * 3, 1.7);
  cv.disc(bx, by + 3.4, 3.6, kit.hex('#ff9a40'), 0.1 * fl, true);
  cv.disc(bx, by + 3.2, 1.6, kit.hex('#ffd890'), 0.9 * fl, true);
}

// ------------------------------------------------------------ background gear train
const GEARC = kit.hex('#4a5060');
/** A spur gear: n teeth, pitch radius R, turned by ang. Dim iron, behind everything. */
function gear(cv, cx, cy, R, n, ang, k) {
  const ro = R + 1.3, ri = R - 1.3, x0 = Math.max(0, Math.floor(cx - ro - 1)), x1 = Math.min(cv.w - 1, Math.ceil(cx + ro + 1));
  const y0 = Math.max(0, Math.floor(cy - ro - 1)), y1 = Math.min(cv.h - 1, Math.ceil(cy + ro + 1));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const dx = x - cx, dy = y - cy, r = Math.hypot(dx, dy);
    if (r > ro + 0.6 || r < 1.6) continue;
    const ph = kit.fract(((Math.atan2(dy, dx) - ang) * n) / (2 * Math.PI));
    const tooth = Math.abs(ph - 0.5) < 0.24 ? ro : ri;              // square-ish teeth
    let a = Math.min(1, tooth - r + 0.5);
    if (a <= 0) continue;
    // spoked web: four windows between rim and hub
    const sp = kit.fract(((Math.atan2(dy, dx) - ang) * 4) / (2 * Math.PI));
    if (r > 3 && r < ri - 2 && Math.abs(sp - 0.5) < 0.32) a *= 0.12;
    const lit = 0.75 + 0.35 * (-dx - dy) / (ro * 1.4);               // lamp from upper left
    cv.over(x, y, kit.scale(GEARC, 0.85 * lit * k), a);
  }
  cv.disc(cx, cy, 1.5, kit.scale(BRASS, 0.7));
}
export function gears(cv, t) {
  const w = (2 * Math.PI) / 60;                                     // the big gear turns once a minute
  gear(cv, 107, 29, 9.5, 16, w * t, 1);
  gear(cv, 107 + 15.8, 29 - 7.4, 6, 10, -w * t * 1.6 + 0.16, 1);
}
