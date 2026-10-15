// The owner's frog, as a face pressed through the pinscreen from behind:
// a broad head, two eye domes on top wearing big round glasses (raised
// rims), a wide smile left as a groove. Heights are pin travel (1 = a digit).
import * as kit from '../js/kit.js';

const HX = 64, HY = 74, HRX = 56, HRY = 40;     // head
const EYES = [[38, 38], [90, 38]], ER = 19;     // eye domes / glasses centres
const RIM = 16, RIM_W = 4.6;                    // glasses rims (thick: they are 2 px pins at 0.46 scale)

/** The face's relief at grid px (x, y), before timing: 0..~1. */
function face(x, y, blink, lk) {
  let z = 0;
  const hx = (x - HX) / HRX, hy = (y - HY) / HRY, hq = 1 - hx * hx - hy * hy;
  if (hq > 0) z = 0.42 * Math.sqrt(hq);
  for (const [ex, ey] of EYES) {
    const dx = x - ex, dy = y - ey, d = Math.hypot(dx, dy);
    if (d < ER) z = Math.max(z, 0.42 + 0.2 * Math.sqrt(1 - (d / ER) ** 2));
    // glasses: a raised ring
    const rim = Math.abs(d - RIM) / RIM_W;
    if (rim < 1) z = Math.max(z, 0.95 - 0.25 * rim * rim);
    // pupil: a dome looking slightly inward, squashed by a blink
    const px = ex + lk[0], py = ey + lk[1];
    const pr = 7.5, pd = Math.hypot((x - px) / pr, (y - py) / (pr * (1 - 0.85 * blink)));
    if (d < RIM - 1 && pd < 1) z = Math.max(z, 0.62 + 0.3 * Math.sqrt(1 - pd * pd));
  }
  // bridge of the glasses
  if (Math.abs(y - 36) < 4 && x > EYES[0][0] + RIM && x < EYES[1][0] - RIM) z = Math.max(z, 0.85);
  // smile: a groove along an arc
  if (hq > 0) {
    const sx = (x - HX) / 36;
    if (Math.abs(sx) < 1.05) {
      const cy = 88 + 14 * (1 - sx * sx), dd = Math.abs(y - cy) / 4.6;
      if (dd < 1) z -= 0.36 * (1 - dd * dd) * (1 - 0.6 * sx * sx * sx * sx);
    }
    // cheeks
    for (const cx of [26, 102]) {
      const d = Math.hypot(x - cx, y - 86) / 9;
      if (d < 1) z += 0.12 * (1 - d * d);
    }
    // nostrils
    for (const nx of [58, 70]) if (Math.hypot(x - nx, y - 70) < 3.5) z -= 0.14;
  }
  return Math.max(0, z);
}

// The face peeks into the empty lower-left quarter (hours sit top left,
// minutes bottom right), at 0.46 of the drawing's size.
export const FROG = { cx: 30, cy: 98, s: 0.46 };

/** Relief added at grid px (x, y) at `age` seconds into the hour's first minute. */
export function frogHeight(gx, gy, age) {
  const x = 64 + (gx - FROG.cx) / FROG.s, y = 66 + (gy - FROG.cy) / FROG.s;
  if (x < 0 || x > 128 || y < 10 || y > 120) return 0;
  // rises from behind with a spring, holds, blinks, sinks back
  const up = age < 0.35 ? 0 : 1 - Math.exp(-(age - 0.35) * 5) * Math.cos((age - 0.35) * 9);
  const down = kit.smoothstep(4.4, 5.6, age + 0.012 * (y - 64));
  const k = up * (1 - down) + (age > 5.6 ? 0.04 * Math.exp(-(age - 5.6) * 6) * Math.sin((age - 5.6) * 28) : 0);
  if (Math.abs(k) < 1e-3) return 0;
  const bl = Math.max(0, 1 - Math.abs(age - 3.1) / 0.14);
  return k * 0.85 * face(x, y, bl, look(age));
}

/** Where the pupils look: at the hours, then the new minutes, then you. */
function look(age) {
  const a = kit.smoothstep(0.9, 1.4, age), b = kit.smoothstep(2.2, 2.7, age), c = kit.smoothstep(3.6, 4.0, age);
  const x = 2 + a * 3 + b * 1 - c * 6, y = 1 - a * 5 + b * 6 - c * 2;
  return [x, y];
}
