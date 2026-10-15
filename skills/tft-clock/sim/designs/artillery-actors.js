// The cast and props of artillery.js, all anti-aliased so they glide by
// fractions of a pixel: soldier worms (pink, outlined, big eyes, a team
// helmet), parachutes, the bazooka and its rocket, the bomber, explosions,
// the buoy with its windsock.

import { mix, sin, cos, rand } from '../js/kit.js';

const AA = { aa: true };
export const TEAM = [0xd8402e, 0x3a6ee0];          // red holds the hours, blue the minutes
export const TEAM_DK = [0x7a1c14, 0x1c3478];
const PINK = 0xf59aae, PINK_LT = 0xffc8d2, OUT = 0x4a1424, EYE = 0xffffff, PUPIL = 0x101018;

/**
 * A worm standing with its tail at (x, y). P: dir (-1..1, eased turn), team,
 * ang (tumble, radians), open (eyes 0..1), lx/ly (gaze), breath, mouth,
 * aim (radians, bazooka out if not null), jet (flame 0..1), L (light: colour -> colour).
 */
export function drawWorm(g, x, y, P) {
  const d = P.dir, L = P.L, ca = cos(P.ang), sa = sin(P.ang);
  const by = 5 * (1 + P.breath);
  // local (forward, up) -> screen, rotated about the body centre
  const X = (fx, uy) => { const u = fx * d, v = -uy * (1 + P.breath); return x + u * ca - (v + by) * sa; };
  const Y = (fx, uy) => { const u = fx * d, v = -uy * (1 + P.breath); return y - by + u * sa + (v + by) * ca; };
  const parts = [[-3.3, 1.3, 1.45], [-1.7, 1.8, 2.0], [0, 3.4, 3.2], [0.45, 6.5, 2.9], [0.9, 9.5, 3.3]];
  if (P.jet > 0) {
    g.fillRoundRect(X(-3.4, 6.5) - 1.6, Y(-3.4, 6.5) - 2.2, 3.2, 4.4, 1, L(0x8a8e98), AA);
    const fl = 0.75 + 0.25 * sin(P.t * 61);
    g.fillCircle(X(-3.4, 3.4), Y(-3.4, 3.4) + 1.2, 1.7 * P.jet * fl, 0xffa020, { aa: true, a: 0.9 });
    g.fillCircle(X(-3.4, 3.4), Y(-3.4, 3.4) + 0.6, 1.0 * P.jet * fl, 0xfff2a0, AA);
  }
  for (const [fx, uy, r] of parts) g.fillCircle(X(fx, uy), Y(fx, uy), r + 0.9, L(OUT), AA);
  for (const [fx, uy, r] of parts) g.fillCircle(X(fx, uy), Y(fx, uy), r, L(PINK), AA);
  g.fillCircle(X(1.1, 3.8), Y(1.1, 3.8), 1.5, L(PINK_LT), AA);
  if (P.aim !== null) {
    const ux = Math.cos(P.aim), uy = Math.sin(P.aim), cx = X(0.6, 5.6), cy = Y(0.6, 5.6);
    g.thickLine(cx - 4 * ux, cy - 4 * uy, cx + 5 * ux, cy + 5 * uy, 2.6, L(0x4a5a26), AA);
    g.thickLine(cx - 3.5 * ux, cy - 3.5 * uy, cx + 4.5 * ux, cy + 4.5 * uy, 1.0, L(0x7e9442), AA);
    g.fillCircle(cx + 5 * ux, cy + 5 * uy, 1.1, L(0x22280f), AA);
  }
  const hx = X(0.9, 9.5), hy = Y(0.9, 9.5);
  // eyes: big, under the helmet's brim
  for (const side of [-1, 1]) {
    const ex = hx + (d * 1.4 + side * 1.45) * ca, ey = hy + 0.4 + (d * 1.4 + side * 1.45) * sa;
    if (P.open > 0.3) {
      g.fillEllipse(ex, ey, 1.95, 2.35 * P.open, L(OUT), AA);
      g.fillEllipse(ex, ey, 1.45, 1.95 * P.open, EYE, AA);
      g.fillCircle(ex + P.lx * 0.55, ey + 0.25 + P.ly * 0.6, 0.85, PUPIL, AA);
    } else g.thickLine(ex - 1.1, ey + 0.4, ex + 1.1, ey + 0.4, 0.8, L(OUT), AA);
  }
  if (P.mouth > 0.05) g.fillEllipse(hx + d * 1.9 * ca, hy + 2.3, 0.9 + 0.4 * P.mouth, 0.6 + 0.8 * P.mouth, L(0x6a1830), AA);
  // the helmet: a dome with a brim
  const tc = L(TEAM[P.team]);
  const mx = hx + 1.9 * sa, my = hy - 2.7 * ca;
  g.fillEllipse(mx, my, 4.1, 2.2, L(TEAM_DK[P.team]), AA);
  g.fillEllipse(mx, my - 0.3, 3.6, 1.8, tc, AA);
  g.fillCircle(mx - 1.2, my - 0.9, 0.8, mix(tc, 0xffffff, 0.55), AA);
  g.thickLine(mx - 4.4 * ca + d * 0.6, my + 1.3 - 4.4 * sa, mx + 4.4 * ca + d * 0.9, my + 1.3 + 4.4 * sa, 1.1, L(TEAM_DK[P.team]), AA);
}

/** A parachute canopy centred (cx, cy), width w, lines to (ax, ay) and (bx, by). */
export function drawChute(g, cx, cy, w, team, ax, ay, bx, by, L, a = 1) {
  const o = { aa: true, a };
  g.thickLine(cx - w * 0.46, cy, ax, ay, 0.5, L(0xe8e0d0), { aa: true, a: 0.8 * a });
  g.thickLine(cx + w * 0.46, cy, bx, by, 0.5, L(0xe8e0d0), { aa: true, a: 0.8 * a });
  g.clip(0, 0, 160, Math.floor(cy) + 1);
  g.fillEllipse(cx, cy + 0.5, w / 2, w * 0.36, L(TEAM_DK[team]), o);
  g.fillEllipse(cx, cy + 0.5, w / 2 - 0.8, w * 0.36 - 0.8, L(TEAM[team]), o);
  g.fillEllipse(cx, cy + 0.5, w * 0.16, w * 0.36 - 0.8, L(0xf4f0e6), o);
  g.unclip();
}

/** The bazooka rocket at (x, y) flying along (vx, vy), with its flame. */
export function drawRocket(g, x, y, vx, vy, T, L) {
  const n = Math.hypot(vx, vy) || 1, ux = vx / n, uy = vy / n;
  const fl = 0.8 + 0.2 * sin(T * 70);
  g.fillCircle(x - 3.4 * ux, y - 3.4 * uy, 1.6 * fl, 0xffa020, { aa: true, a: 0.85 });
  g.fillCircle(x - 3.0 * ux, y - 3.0 * uy, 0.9, 0xfff4b0, AA);
  g.thickLine(x - 2.4 * ux, y - 2.4 * uy, x + 2 * ux, y + 2 * uy, 2.3, L(0x3e4a20), AA);
  g.fillCircle(x + 2.2 * ux, y + 2.2 * uy, 1.0, L(0xc83a2a), AA);
}

/** A falling bomb. */
export function drawBomb(g, x, y, ang, L) {
  const ux = cos(ang), uy = sin(ang);
  g.fillEllipse(x, y, 1.6, 1.6, L(0x2a2e34), AA);
  g.thickLine(x - 2.2 * ux, y - 2.2 * uy, x + 1.5 * ux, y + 1.5 * uy, 2.4, L(0x2a2e34), AA);
  g.thickLine(x - 3 * ux - uy * 1.4, y - 3 * uy + ux * 1.4, x - 3 * ux + uy * 1.4, y - 3 * uy - ux * 1.4, 0.9, L(0x8a3a2a), AA);
}

/** The bomber, flying right, nose at (x, y). */
export function drawPlane(g, x, y, T, L) {
  const body = L(0x6a7a62), dark = L(0x3e4a3a);
  g.fillPolygon([[x - 21, y - 1], [x - 24, y - 6], [x - 20, y - 6], [x - 16, y - 1]], dark, AA);
  g.fillEllipse(x - 10, y, 11, 2.6, body, AA);
  g.fillEllipse(x - 9, y + 0.9, 9, 1.4, L(0x8a9a80), AA);
  g.fillPolygon([[x - 13, y], [x - 7, y], [x - 12, y + 4.5], [x - 17, y + 4.5]], dark, AA);
  g.fillEllipse(x - 4, y - 1.6, 2.4, 1.3, L(0xa8d8f0), AA);
  g.fillCircle(x - 15, y - 0.2, 1.4, L(TEAM[1]), AA);
  g.fillCircle(x - 15, y - 0.2, 0.6, 0xffffff, AA);
  g.fillEllipse(x + 1.2, y, 0.8, 3.6 + 0.4 * sin(T * 80), 0xd0d4d8, { aa: true, a: 0.45 });
}

/** The buoy in the strait, its mast and windsock (wind -1..1), bobbing on surface y. */
export function drawBuoy(g, x, sy, wind, T, sec, L) {
  const tilt = 0.6 * sin(T * 1.7);
  const top = [x + tilt * 0.8, sy - 18];
  g.thickLine(x, sy - 2, top[0], top[1], 1.3, L(0x3a3e46), AA);
  // the sock: four rings pointing downwind, drooping when the wind is light
  const s = wind >= 0 ? 1 : -1, w = Math.abs(wind), droop = (1 - w) * 1.1;
  let px = top[0], py = top[1] + 0.5, a = droop;
  for (let k = 0; k < 4; k++) {
    a = droop * (0.6 + k * 0.25) + 0.12 * sin(T * 9 - k * 1.3) * (0.4 + w);
    const len = 2.2 + 1.4 * w;
    const nx = px + s * len * cos(a), ny = py + len * sin(a);
    g.thickLine(px, py, nx, ny, 3.8 - k * 0.5, L(k & 1 ? 0xf4efe4 : 0xf0642a), AA);
    px = nx; py = ny;
  }
  g.fillEllipse(x, sy - 1, 5.2, 3.4, L(0x5a1410), AA);
  g.fillEllipse(x, sy - 1.3, 4.6, 2.9, L(0xd8402e), AA);
  g.fillRect(Math.round(x - 4), Math.round(sy - 2), 9, 1, L(0xf4efe4));
  const blink = sec % 1 < 0.18 ? 1 : 0.25;
  g.fillCircle(top[0], top[1] - 1, 2.2, 0xffd040, { aa: true, a: 0.35 * blink });
  g.fillCircle(top[0], top[1] - 1, 0.9, mix(0x8a6a20, 0xfff0a0, blink), AA);
}

/**
 * An explosion at (x, y), `age` seconds old, size k: flash, fireball, a
 * shock ring, smoke puffs drifting with the wind, terrain debris flying.
 */
export function drawBoom(g, x, y, age, k, seed, wind, debris, L, smoke) {
  if (age < 0 || age > 2.6) return;
  // smoke first, behind the fire
  for (let p = 0; p < 5; p++) {
    const st = 0.05 + p * 0.04, a = age - st;
    if (a <= 0) continue;
    const ang = rand(seed, p) * 6.283, sp = 6 + 6 * rand(seed, p, 1);
    const sx = x + cos(ang) * sp * Math.min(a, 0.4) * 2 * k + wind * 9 * a * a;
    const sy2 = y + sin(ang) * sp * Math.min(a, 0.4) * k - 7 * a;
    const r = (2 + 3.2 * Math.min(1, a / 0.9)) * k, fade = 1 - a / (2.6 - st);
    g.fillCircle(sx, sy2, r, smoke, { aa: true, a: 0.55 * fade });
  }
  if (age < 0.5) {
    const u = age / 0.5, r = k * (3 + 7 * Math.sqrt(u)) * (1 - 0.3 * u);
    g.fillCircle(x, y, r * 1.15, 0xd84a1c, { aa: true, a: 1 - u });
    g.fillCircle(x, y, r * 0.85, 0xffa22a, { aa: true, a: 1 - u * u });
    g.fillCircle(x, y, r * 0.5, 0xfff0b0, { aa: true, a: 1 - u });
  }
  if (age < 0.3) g.ring(x, y, k * (3 + age * 50) - 0.8, k * (3 + age * 50) + 0.8, 0xffffff, { aa: true, a: 0.7 * (1 - age / 0.3) });
  for (let p = 0; p < 9; p++) {
    const vx = (rand(seed, p, 3) - 0.5) * 90 * k, vy = -40 - 70 * rand(seed, p, 4) * k;
    const dx = x + vx * age, dy = y + vy * age + 110 * age * age;
    if (dy > 70 || age > 1.6) continue;
    g.fillCircle(dx, dy, 0.9 + 0.5 * (p % 2), L(debris[p % debris.length]), AA);
  }
}
