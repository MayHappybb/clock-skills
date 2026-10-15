// The typist: a frog in round brass spectacles at the lower left, fingers on
// the (unseen) keyboard below the frame. It nods to the escapement's tick,
// blinks, watches the print point, taps a key for every character, throws
// the carriage back at the minute and cheers at the hour.
import * as kit from '../js/kit.js';
import { W, H, over, ellipse, seg } from './typewriter-paint.js';

const SKIN = kit.hex('#3f9a3a'), BELLY = kit.hex('#b9d77a'), DARK = kit.hex('#1f5a24');
const BRASS = kit.hex('#d9a441'), WHITE = [0.85, 0.85, 0.78], CHEEK = kit.hex('#e0607a');

export function drawFrog(img, { s, tm, strikeT, hourTurn, night }) {
  const k = 0.16 * (1 - 0.2 * night);              // the frog is lit by the lamp's spill
  // nod to each tick of the escapement, and breathe
  const f = s - Math.floor(s);
  const nod = s >= 3 ? 0.7 * Math.exp(-f * 7) * Math.sin(f * 14) : 0;
  const breathe = 0.4 * Math.sin(s * 1.3);
  // hour: a little hop of joy once the page is out
  const hop = hourTurn ? 3.5 * Math.sin(Math.PI * kit.clamp((s - 0.6) / 0.55)) : 0;
  const cx = 22, hy = 52 + nod * 0.6 - hop, by = 62 - hop * 0.6;

  // keys: which hand is down now (alternating), and how far
  let press = [0, 0];
  for (let i = 0; i < 5; i++) {
    const T = strikeT(tm, i) - 0.12, q = (s - T + 0.1) / 0.24;
    if (q > 0 && q < 1) press[i % 2] = Math.max(press[i % 2], Math.sin(Math.PI * q));
  }
  // carriage throw (right arm sweeps up and right) and the hour cheer (both up)
  const thr = Math.sin(Math.PI * kit.clamp((s - tm.ret0 + 0.1) / (tm.ret1 - tm.ret0 + 0.3)));
  const cheer = hourTurn ? Math.sin(Math.PI * kit.clamp((s - 0.15) / 1.25)) : 0;

  // body
  ellipse(img, cx, by + 1, 15, 9.5, (dx, dy) => kit.scale(kit.mix(SKIN, BELLY, kit.clamp(0.6 - Math.abs(dx) * 1.2 + dy * 0.2)), k * (0.8 - 0.25 * dx)));
  // arms: shoulder -> hand on the keys (bottom edge), unless throwing or cheering
  const arm = (sx, sy, hx, hy2, side) => {
    seg(img, sx, sy, hx, hy2, 3.2, kit.scale(SKIN, k * (side < 0 ? 0.75 : 0.95)));
    for (let j = -1; j <= 1; j++) ellipse(img, hx + j * 1.6, hy2 + 0.6 * Math.abs(j), 1.1, 1, kit.scale(BELLY, k));
  };
  const lhx = 10 + 1 * Math.sin(s * 2.1), rhx = 33 + 1 * Math.sin(s * 1.7 + 1);
  const hover = (i) => 1.2 + 0.6 * Math.sin(s * 3 + i);
  let L = [lhx, 61 - hover(0) + 2 * press[0]], R = [rhx, 61 - hover(1) + 2 * press[1]];
  if (thr > 0) R = [kit.lerp(R[0], 42, thr), kit.lerp(R[1], 46, thr)];
  if (cheer > 0) { L = [kit.lerp(L[0], 6, cheer), kit.lerp(L[1], 38 - hop, cheer)]; R = [kit.lerp(R[0], 38, cheer), kit.lerp(R[1], 38 - hop, cheer)]; }
  arm(cx - 9, by - 4, L[0], L[1], -1);
  arm(cx + 9, by - 4, R[0], R[1], 1);

  // head
  ellipse(img, cx, hy, 12 + breathe * 0.3, 7 + breathe * 0.2, (dx, dy) => kit.scale(kit.mix(SKIN, DARK, kit.clamp(dy * 0.5 + 0.3 + dx * 0.25)), k * (1.05 - 0.2 * dx)));
  // mouth: a wide, content line
  for (let x = -7; x <= 7; x += 0.5) {
    const y = hy + 3.4 - 0.03 * x * x;
    const p = Math.round(y) * W + Math.round(cx + x);
    if (p >= 0 && p < W * H) over(img, p, kit.scale(DARK, k * 0.25), 0.8);
  }
  ellipse(img, cx - 8, hy + 1.5, 1.8, 1, kit.scale(CHEEK, k * 0.8), 0.6);
  ellipse(img, cx + 8, hy + 1.5, 1.8, 1, kit.scale(CHEEK, k * 0.8), 0.6);

  // eyes in round brass spectacles; they watch the print point
  const blink = (() => { const b = (s + 1.3) % 4.3; return b < 0.16 ? Math.sin(Math.PI * b / 0.16) : 0; })();
  const lookX = 1.2, lookY = -0.9;
  for (const sx of [-6.5, 6.5]) {
    const ex = cx + sx, ey = hy - 6;
    ellipse(img, ex, ey, 4.6, 4.4, kit.scale(SKIN, k));                          // the bump
    ellipse(img, ex, ey, 3.3, 3.3 * (1 - 0.9 * blink), kit.scale(WHITE, k * 0.9));
    if (blink < 0.5) ellipse(img, ex + lookX, ey + lookY, 1.5, 1.5, [0.004, 0.004, 0.006]);
    // spectacle rim
    for (let a = 0; a < kit.TAU; a += 0.2) {
      const x = ex + Math.cos(a) * 4.1, y = ey + Math.sin(a) * 4.1;
      const xi = Math.round(x), yi = Math.round(y);
      if (xi >= 0 && xi < W && yi >= 0 && yi < H) over(img, yi * W + xi, kit.scale(BRASS, k * (0.9 + 0.5 * Math.max(0, -Math.sin(a + 0.7)))), 0.75);
    }
    // a lamp glint on the lens
    ellipse(img, ex - 1.6, ey - 1.6, 0.7, 0.7, [k * 2, k * 1.9, k * 1.6], 0.8);
  }
  seg(img, cx - 2.4, hy - 6.5, cx + 2.4, hy - 6.5, 0.9, kit.scale(BRASS, k));   // bridge
}
