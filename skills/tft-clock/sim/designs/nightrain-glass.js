// nightrain glass: what is on and in the window itself. Raindrops that the
// wind of the train's speed drives backward along the glass (and that run
// straight down when it stands); the reflection of the lit carriage behind
// you, faint against the night and plain as a mirror in a tunnel; the
// rounded corners of the window frame.
import { rand, clamp, sprite } from '../js/kit.js';
import { W, H } from './nightrain-world.js';

/** Raindrops: `n` of them, each living a few seconds, beading then running. */
export function drawDrops(g, T, v, n, tint) {
  for (let i = 0; i < n; i++) {
    const P = 4 + 5 * rand(i, 1, 77);
    const tt = T + rand(i, 2, 77) * P;
    const cyc = Math.floor(tt / P), tau = tt - cyc * P;
    const r = 0.7 + 1.5 * rand(i, cyc, 3);
    let x = rand(i, cyc, 4) * (W + 30), y = rand(i, cyc, 5) * (H + 4) - 4;
    const go = P * (0.25 + 0.45 * rand(i, cyc, 6));
    let k = 0;
    // Wind pushes drops back along the glass; standing still, they fall.
    const vx = -(14 + 24 * r) * v, vy = 3 + 7 * r * (1 - v) + 4 * r * v;
    if (tau > go) {
      k = tau - go;
      x += vx * k; y += vy * k;
      // The clear wet trail a running drop leaves: tiny beads behind it.
      const steps = Math.min(6, Math.floor(k * 3));
      for (let j = 1; j <= steps; j++) {
        const bx = x - vx * j * 0.18, by = y - vy * j * 0.18;
        if (rand(i, cyc * 13 + j, 8) < 0.6) g.pixel(bx, by, tint, { a: 0.18 });
      }
    }
    if (x < -3 || x > W + 3 || y < -3 || y > H + 3) continue;
    if (r < 1.2) {
      g.pixel(x, y, 0x000000, { a: 0.25 });
      g.pixel(x + 0.6, y + 0.8, tint, { a: 0.4 });
    } else {
      // A lens: dark rim, the light behind gathered low (it inverts), a glint high.
      g.fillCircle(x, y, r, 0x000000, { a: 0.28 });
      g.fillRect(Math.round(x - r * 0.4), Math.round(y + r * 0.2), Math.max(1, Math.round(r * 0.9)), 1, tint, { a: 0.5 });
      g.pixel(x - r * 0.4, y - r * 0.5, 0xffffff, { a: 0.55 });
    }
  }
}

const SKIN = 0xd8a080, KNIT = 0x6a4a3a, HAIR = 0x2a1a14, CLOTH = 0xe8e2d4, PLUSH = 0x7a3a34, LAMPC = 0xfff0c8;

/**
 * The carriage reflected in the glass: ceiling light, luggage rack, the seat
 * backs opposite, a reading lamp, and you, looking out. `k` is how strong
 * the reflection is (the darker outside, the stronger).
 */
export function drawReflection(g, k, sway) {
  if (k <= 0.01) return;
  const a = (m) => ({ a: clamp(k * m, 0, 1) });
  g.fillRect(0, 0, W, 2, LAMPC, a(1.1));
  g.fillRect(0, 2, W, 3, LAMPC, a(0.35));
  g.fillRect(0, 10, W, 1, 0xb0a898, a(0.7));
  g.fillRect(0, 12, W, 1, 0xb0a898, a(0.45));
  for (let x = 14; x < W; x += 36) g.fillRect(x, 10, 1, 3, 0xb0a898, a(0.6));
  // Seat backs across the aisle, each with its white headrest cloth.
  for (const sx of [100, 128]) {
    g.fillRoundRect(sx, 58 + sway, 24, 26, 4, PLUSH, { ...a(0.9), aa: true });
    g.fillRoundRect(sx + 2, 58 + sway, 20, 5, 2, CLOTH, { ...a(0.9), aa: true });
  }
  // The reading lamp over your seat, a hot point in the glass.
  g.fillCircle(7, 13, 1.8, LAMPC, { ...a(2.2), aa: true });
  g.fillCircle(7, 13, 4, LAMPC, { ...a(0.35), aa: true });
  // You: shoulders in a jumper, the face lit by the lamp, dark hair.
  g.fillRoundRect(16, 62 + sway, 36, 30, 10, KNIT, { ...a(0.9), aa: true });
  g.fillEllipse(34, 51 + sway, 7, 9, SKIN, { ...a(0.75), aa: true });
  g.fillEllipse(35.5, 45.5 + sway, 7, 5, HAIR, { ...a(0.9), aa: true });
  g.fillRect(31, 58 + sway, 6, 5, SKIN, a(0.6));
}

// Rounded window corners: the carriage wall, a rubber seal.
const R = 7;
const CORNER = (() => {
  const rows = [];
  for (let y = 0; y < R; y++) {
    let s = '';
    for (let x = 0; x < R; x++) {
      const d = Math.hypot(R - x - 0.5, R - y - 0.5);
      s += d > R ? 'w' : d > R - 1 ? 's' : '.';
    }
    rows.push(s);
  }
  return sprite(rows, { w: 0x2a221c, s: 0x4a3e34 });
})();

export function drawFrame(g) {
  g.blit(CORNER, 0, 0);
  g.blit(CORNER, W - R, 0, { flipX: true });
  g.blit(CORNER, 0, H - R, { flipY: true });
  g.blit(CORNER, W - R, H - R, { flipX: true, flipY: true });
}
