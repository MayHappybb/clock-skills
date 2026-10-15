// What the odd set out (bottom right) is tuned to: the frog's weather
// report, a test card, an aquarium, a cartoon; and the frog presenter itself, bold and
// simple (rainbow bands, a dark outline, two big white-rimmed glasses, a
// smile), which also fronts the hour broadcast. All painters take tube
// picture coordinates u, v (0..1) and write linear RGB into o[0..2].
import * as kit from '../js/kit.js';

const RAINBOW = [[0.9, 0.04, 0.03], [1, 0.28, 0], [0.95, 0.75, 0], [0.08, 0.7, 0.08], [0.04, 0.22, 0.95], [0.42, 0.04, 0.85]];
const OUT = [0.0, 0.03, 0.0];
const set3 = (o, c, k = 1) => { o[0] = c[0] * k; o[1] = c[1] * k; o[2] = c[2] * k; };

/**
 * Paint the frog over o if (u, v) hits it. (fx, fy) the centre, sc its size
 * in tube heights, asp the tube's width/height. pose: 0 rest, 1 point up-right,
 * 2 both arms up (the hour). blink 0..1. tie: a bow tie. Returns true if hit.
 */
export function frog(o, u, v, fx, fy, sc, asp, t, pose, blink, tie) {
  const X = ((u - fx) * asp) / sc, Y = (v - fy) / sc;
  if (X < -1.1 || X > 1.1 || Y < -0.75 || Y > 0.7) return false;
  let hit = false;
  // arms: capsules from the shoulders
  const arm = (sx, sy, hx, hy) => {
    const d = kit.segDist(X, Y, sx, sy, hx, hy);
    if (d < 0.11) { set3(o, d < 0.065 ? RAINBOW[3] : OUT, 0.8); hit = true; }
  };
  const wave = Math.sin(t * 7) * 0.12;
  if (pose === 1) { arm(0.4, 0.05, 0.78, -0.42 + wave * 0.5); arm(-0.4, 0.2, -0.62, 0.42); }
  else if (pose === 2) { arm(0.4, 0.05, 0.8 + wave, -0.5); arm(-0.4, 0.05, -0.8 - wave, -0.5); }
  else { arm(0.42, 0.22, 0.6, 0.45); arm(-0.42, 0.22, -0.6, 0.45); }
  // body: an ellipse in six rainbow bands with a dark outline
  const by = 0.17, rx = 0.52, ry = 0.38;
  const ex = X / rx, ey = (Y - by) / ry, e = Math.sqrt(ex * ex + ey * ey);
  if (e < 1) {
    hit = true;
    if (e > 1 - 0.07 / ry) set3(o, OUT);
    else set3(o, RAINBOW[Math.min(5, Math.max(0, Math.floor((ey + 1) * 3)))], 0.75);
    // smile
    const sd = Math.hypot(X, Y - 0.04), sm = Math.abs(sd - 0.27);
    if (sm < 0.045 && Y > 0.13 && Math.abs(X) < 0.26) set3(o, OUT);
  }
  if (tie && Math.abs(X) < 0.2 && Math.abs(Y - 0.5) < 0.09 + Math.abs(X) * 0.5 && Math.abs(X) > 0.03) { set3(o, [0.95, 0.02, 0.1], 0.8); hit = true; }
  // glasses
  for (const gx of [-0.25, 0.25]) {
    const d = Math.hypot(X - gx, Y + 0.2);
    if (d < 0.27) {
      hit = true;
      if (d > 0.235) set3(o, OUT);
      else if (d > 0.17) set3(o, [1, 1, 0.95], 0.9);
      else if (blink > 0.5) set3(o, Math.abs(Y + 0.2) < 0.03 ? OUT : RAINBOW[3], 0.6);
      else {
        const lx = gx + 0.05 * Math.sin(t * 0.7), d2 = Math.hypot(X - lx, Y + 0.19);
        set3(o, d2 < 0.08 ? [0, 0, 0] : [0.85, 0.85, 0.8], 0.8);
      }
    }
  }
  if (Math.abs(Y + 0.2) < 0.03 && Math.abs(X) < 0.08) { set3(o, [1, 1, 0.95], 0.9); hit = true; }
  return hit;
}

const blinkAt = (t) => (kit.fract(t / 3.7) > 0.96 ? 1 : 0);

function weather(o, u, v, t, asp) {
  // sky, the sun, a drifting cloud, the frog pointing at it
  const sky = 0.55 + 0.45 * v;
  set3(o, [0.02 * sky, 0.09 * sky, 0.32 * sky]);
  const sx = 0.78, sy = 0.2, du = (u - sx) * asp, dv = v - sy, r = Math.hypot(du, dv);
  const a = Math.atan2(dv, du) + t * 0.6;
  if (r < 0.085) set3(o, [1, 0.72, 0.05]);
  else if (r < 0.15 && Math.cos(a * 8) > 0.55) set3(o, [1, 0.5, 0.02], 0.8);
  const cx = kit.fract(t / 14) * 1.5 - 0.25, cy = 0.3;
  const c = Math.min(Math.hypot((u - cx) * asp, v - cy) - 0.09, Math.hypot((u - cx - 0.1) * asp, v - cy + 0.04) - 0.1, Math.hypot((u - cx - 0.2) * asp, v - cy) - 0.08);
  if (c < 0) set3(o, c < -0.015 ? [0.7, 0.72, 0.75] : [0.25, 0.27, 0.3]);
  frog(o, u, v, 0.36, 0.68 + 0.012 * Math.sin(t * 2.2), 0.46, asp, t, 1, blinkAt(t), false);
}

const BARS = [[0.75, 0.75, 0.75], [0.75, 0.75, 0], [0, 0.75, 0.75], [0, 0.75, 0], [0.75, 0, 0.75], [0.75, 0, 0], [0, 0, 0.75]];
function testcard(o, u, v, t, asp) {
  if (v < 0.68) set3(o, BARS[Math.max(0, Math.min(6, Math.floor(u * 7)))], 0.55);
  else if (v < 0.76) set3(o, BARS[6 - Math.max(0, Math.min(6, Math.floor(u * 7)))], 0.15);
  else set3(o, u < 0.18 ? [0.02, 0.05, 0.2] : u < 0.36 ? [0.55, 0.55, 0.55] : u < 0.54 ? [0.12, 0.0, 0.25] : [0.01, 0.01, 0.01]);
  const r = Math.hypot((u - 0.5) * asp, v - 0.45);
  if (Math.abs(r - 0.3) < 0.025) set3(o, [0.6, 0.6, 0.6]);
  if (r < 0.3 && (Math.abs(u - 0.5) < 0.012 || Math.abs(v - 0.45) < 0.012)) set3(o, [0.6, 0.6, 0.6]);
  // the 1 kHz tone's reference pip crawls along the bottom edge
  if (v > 0.9 && Math.abs(u - kit.fract(t / 3)) < 0.03) set3(o, [0.7, 0.7, 0.7]);
}

function aquarium(o, u, v, t, asp) {
  const deep = v;
  set3(o, [0.0, 0.12 - 0.07 * deep, 0.22 - 0.1 * deep]);
  // caustic shimmer near the surface
  const cs = kit.noise2(u * 8 + t * 0.6, v * 5 - t * 0.3);
  if (v < 0.5 && cs > 0.7) { o[1] += 0.05; o[2] += 0.06; }
  if (v > 0.86 + 0.03 * Math.sin(u * 9)) set3(o, [0.35, 0.25, 0.08]);
  // weed
  for (const wx of [0.12, 0.2, 0.86]) {
    const sway = 0.04 * Math.sin(t * 1.3 + wx * 9 + v * 5) * (1 - v);
    if (v > 0.45 && Math.abs(u - wx - sway) * asp < 0.022) set3(o, [0.05, 0.42, 0.08]);
  }
  // three fish gliding on slow loops
  for (let k = 0; k < 3; k++) {
    const ph = t * (0.09 + 0.03 * k) + k * 0.37, dir = k === 1 ? -1 : 1;
    const fx = dir > 0 ? kit.fract(ph) * 1.4 - 0.2 : 1.2 - kit.fract(ph) * 1.4;
    const fy = 0.3 + 0.18 * k + 0.04 * Math.sin(t * 0.9 + k * 2);
    const X = ((u - fx) * asp) * dir, Y = v - fy;
    const sz = 0.075 + 0.02 * k;
    const body = (X / sz) ** 2 + (Y / (sz * 0.55)) ** 2;
    const tl = -X - sz * 0.8, tail = tl > 0 && tl < sz * 0.6 && Math.abs(Y) < tl * 0.9;
    const col = k === 1 ? [0.95, 0.75, 0.05] : [1, 0.3, 0.02];
    if (body < 1 || tail) set3(o, col, 0.85);
    if (Math.hypot(X - sz * 0.5, Y + sz * 0.1) < sz * 0.18) set3(o, [0, 0, 0]);
    if (body < 1 && Math.abs(X + sz * 0.15) < sz * 0.08) set3(o, [1, 1, 1], 0.7);
  }
  // bubbles
  for (let k = 0; k < 4; k++) {
    const by = 1 - kit.fract(t * 0.18 + k * 0.27), bx = 0.62 + 0.03 * Math.sin(t * 3 + k * 2) + 0.02 * k;
    const d = Math.hypot((u - bx) * asp, v - by);
    if (Math.abs(d - 0.022) < 0.01) set3(o, [0.5, 0.75, 0.85], 0.6);
  }
}

function cartoon(o, u, v, t, asp) {
  // a night pond: the frog hops from lily pad to lily pad, squashing on landing
  set3(o, v < 0.62 ? [0.01, 0.02, 0.09 + 0.06 * v] : [0.0, 0.05 + 0.04 * Math.sin(u * 30 + t * 2) * (v - 0.62), 0.14]);
  const mx = 0.8, my = 0.17;
  if (Math.hypot((u - mx) * asp, v - my) < 0.07) set3(o, [0.75, 0.72, 0.5]);
  for (const px of [0.24, 0.76]) {
    const e = ((u - px) * asp / 0.22) ** 2 + ((v - 0.8) / 0.06) ** 2;
    if (e < 1) set3(o, e > 0.6 ? [0.02, 0.25, 0.03] : [0.08, 0.5, 0.08]);
  }
  const P = 2.6, k = kit.fract(t / P), leg = Math.floor(t / P) & 1;
  const a = kit.smoothstep(0.45, 1, k), from = leg ? 0.76 : 0.24, to = leg ? 0.24 : 0.76;
  const fx = from + (to - from) * a, lift = Math.sin(Math.PI * a) * 0.34;
  const land = Math.max(0, 1 - Math.abs(k - 0.06) * 12) + Math.max(0, 1 - Math.abs(k - 0.42) * 14);
  const fy = 0.68 - lift + 0.02 * land;
  frog(o, u, v, fx, fy, 0.36, asp, t, a > 0 && a < 1 ? 2 : 0, blinkAt(t), false);
}

export const CHANNELS = [weather, testcard, aquarium, cartoon];
export { blinkAt };

/**
 * The hour broadcast: the frog standing tall across the three stacked sets
 * of the right-hand column, head in the top tube, rainbow body in the
 * middle, legs in the bottom one, waving. X is across the column (0 at its
 * centre, in tube heights), Y down the column (0..3, one per set).
 */
export function tallFrog(o, X, Y, t) {
  const hop = -0.07 * Math.abs(Math.sin(t * 3.2)), y = Y - hop, wave = Math.sin(t * 6.5);
  let hit = false;
  const ell = (cx, cy, rx, ry) => { const ex = (X - cx) / rx, ey = (y - cy) / ry; return Math.sqrt(ex * ex + ey * ey); };
  const cap = (ax, ay, bx, by, r, col) => {
    const d = kit.segDist(X, y, ax, ay, bx, by);
    if (d < r + 0.04) { set3(o, d < r ? col : OUT, 0.8); hit = true; }
  };
  // legs and feet (bottom set)
  for (const sd of [-1, 1]) {
    const bend = 0.06 * Math.abs(Math.sin(t * 3.2));
    cap(sd * 0.16, 1.95, sd * (0.34 + bend), 2.3, 0.07, RAINBOW[3]);
    cap(sd * (0.34 + bend), 2.3, sd * 0.22, 2.68, 0.07, RAINBOW[3]);
    const f = ell(sd * 0.3, 2.74, 0.17, 0.07);
    if (f < 1.25) { set3(o, f < 1 ? RAINBOW[3] : OUT, 0.8); hit = true; }
  }
  // arms waving up (middle set)
  for (const sd of [-1, 1]) cap(sd * 0.3, 1.3, sd * (0.46 + 0.04 * wave * sd), 1.06 - 0.06 * wave * sd, 0.065, RAINBOW[3]);
  // rainbow body
  const b = ell(0, 1.52, 0.34, 0.47);
  if (b < 1) {
    hit = true;
    if (b > 0.88) set3(o, OUT);
    else set3(o, RAINBOW[Math.min(5, Math.max(0, Math.floor((y - 1.05) / 0.94 * 6)))], 0.75);
  }
  // bow tie at the collar
  const tx = Math.abs(X), ty = y - 1.12;
  if (tx < 0.17 && tx > 0.02 && Math.abs(ty) < 0.035 + tx * 0.45) { set3(o, [0.95, 0.02, 0.1], 0.85); hit = true; }
  // head (top set): wide green dome, smile, glasses on top
  const h = ell(0, 0.66, 0.44, 0.27);
  if (h < 1) {
    hit = true;
    set3(o, h > 0.86 ? OUT : RAINBOW[3], h > 0.86 ? 1 : 0.7);
    const sd = Math.hypot(X, (y - 0.56) * 1.2), sm = Math.abs(sd - 0.24);
    if (sm < 0.03 && y > 0.66) set3(o, OUT);
  }
  const blink = blinkAt(t);
  for (const gx of [-0.2, 0.2]) {
    const d = Math.hypot(X - gx, y - 0.45);
    if (d < 0.19) {
      hit = true;
      if (d > 0.165) set3(o, OUT);
      else if (d > 0.115) set3(o, [1, 1, 0.95], 0.9);
      else if (blink) set3(o, Math.abs(y - 0.45) < 0.025 ? OUT : RAINBOW[3], 0.7);
      else set3(o, Math.hypot(X - gx - 0.03 * Math.sin(t), y - 0.46) < 0.055 ? [0, 0, 0] : [0.85, 0.85, 0.8], 0.8);
    }
  }
  if (Math.abs(y - 0.45) < 0.022 && Math.abs(X) < 0.05) { set3(o, [1, 1, 0.95], 0.9); hit = true; }
  return hit;
}
