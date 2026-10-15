// The hour's giant: a diamondback serpent ~11 px thick that slithers the
// whole board along the free corridor (in from the right along the top band,
// down the channel between the hours and the minutes, out left along the
// bottom band), never touching a numeral.
//
// Its route is fixed, so the corridor is precomputed at load as a table:
// for every pixel near the route, its arc along the route and its signed
// offset across it (flash: ~5,000 entries x 5 B). A frame then looks each
// pixel up: how far behind the nose it is (u) and how far off the spine (v),
// and paints keyline, head, eye, diamonds and chain from those two numbers.

const W = 160, H = 80;

// the route: corners rounded with radius R, sampled every px
const PTS = [[176, 8], [80, 8], [80, 71], [-60, 71]];
const R = 9;
const route = [];
(function build() {
  const seg = (ax, ay, bx, by) => {
    const L = Math.hypot(bx - ax, by - ay);
    for (let i = 0; i < L; i++) route.push([ax + ((bx - ax) * i) / L, ay + ((by - ay) * i) / L]);
  };
  const arc = (cx, cy, a0, a1) => {
    const n = Math.ceil(Math.abs(a1 - a0) * R);
    for (let i = 0; i < n; i++) { const a = a0 + ((a1 - a0) * i) / n; route.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]); }
  };
  // (176,8) -> (80+R, 8), turn down to (80, 8+R), -> (80, 71-R), turn left to (80-R, 71), -> (-60, 71)
  seg(176, 8, 80 + R, 8);
  arc(80 + R, 8 + R, -Math.PI / 2, -Math.PI);
  seg(80, 8 + R, 80, 71 - R);
  arc(80 - R, 71 - R, 0, Math.PI / 2);
  seg(80 - R, 71, -60, 71);
})();
export const ROUTE_LEN = route.length;

// the table: nearest route sample within RAD px of each pixel
const RAD = 8;
const best = new Float32Array(W * H).fill(1e9);
const ARC = new Int16Array(W * H).fill(-1), OFF = new Int8Array(W * H);   // OFF: v * 8, signed
for (let a = 0; a < route.length; a++) {
  const [x, y] = route[a];
  const b = route[Math.min(a + 1, route.length - 1)], p = route[Math.max(a - 1, 0)];
  let tx = b[0] - p[0], ty = b[1] - p[1];
  const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
  for (let py = Math.floor(y - RAD); py <= Math.ceil(y + RAD); py++)
    for (let px = Math.floor(x - RAD); px <= Math.ceil(x + RAD); px++) {
      if (px < 0 || py < 0 || px >= W || py >= H) continue;
      const dx = px + 0.5 - x, dy = py + 0.5 - y, d = dx * dx + dy * dy;
      if (d > RAD * RAD || d >= best[py * W + px]) continue;
      best[py * W + px] = d;
      ARC[py * W + px] = a;
      OFF[py * W + px] = Math.round((dx * -ty + dy * tx) * 8);   // + to the right of travel
    }
}
const CELLS = [];
for (let i = 0; i < W * H; i++) if (ARC[i] >= 0) CELLS.push(i);
export const CORRIDOR = Int16Array.from(CELLS);

export const GLEN = 190;
// half-width (x8) along the body, u = px behind the nose
const HW8 = new Uint8Array(GLEN + 1);
for (let u = 0; u <= GLEN; u++) {
  let w;
  if (u < 16) w = u < 9 ? 2.5 + 4.3 * Math.sqrt(u / 9) : 6.8 - ((u - 9) / 7) * 1.6;
  else if (u > GLEN - 60) w = 5.2 - ((u - (GLEN - 60)) / 60) * 4.4;
  else w = 5.2;
  HW8[u] = Math.round(w * 8);
}

/**
 * Paint the serpent with its nose at arc `head` of the route into `mask`
 * (1 ink, 0 ground, inside its body only). `flick` shows the tongue.
 * Returns the pixels visited.
 */
export function paintGiant(mask, head, flick) {
  const n = CORRIDOR.length;
  for (let k = 0; k < n; k++) {
    const i = CORRIDOR[k], u = head - ARC[i];
    const v8 = OFF[i], av8 = v8 < 0 ? -v8 : v8;
    if (u < 0) {
      // the tongue, along the spine, forked at the tip
      if (flick && u >= -7) {
        if (u >= -5 ? av8 <= 3 : av8 >= 5 && av8 <= 12) mask[i] = 1;
      }
      continue;
    }
    if (u > GLEN) continue;
    const hw8 = HW8[u];
    if (av8 > hw8) continue;
    let ink;
    if (av8 > hw8 - 9) ink = 1;                                        // the keyline
    else if (u < 16) {                                                 // the head
      const ex = u - 6, ey8 = v8 + 22;                                 // the eye, on the left of travel
      const e2 = ex * ex * 64 + ey8 * ey8;
      ink = e2 < 64 * 3.2 ? (e2 < 64 * 0.6 ? 0 : 1) : 0;
      if (u < 7 && v8 > 2 && v8 < 11) ink = 1;                         // the mouth line
      if (u >= 14 && (u & 1) === 0 && av8 < hw8 - 16) ink = 1;         // the neck
    } else {                                                           // diamondback
      let a = ((u - 16) % 12) - 6; if (a < 0) a = -a;
      ink = a * 6 + av8 < 24 ? 1 : 0;
      if (av8 < 5 && a > 4) ink = 1;                                   // the chain between diamonds
    }
    mask[i] = ink;
  }
  return n;
}

/** The arc at which the nose passes x on the top band (y 8) or the bottom band (y 71). */
export function arcAtX(x, band) {
  let bestA = 0, bd = 1e9;
  for (let a = 0; a < route.length; a++) {
    const [rx, ry] = route[a];
    if ((band === 'top' ? ry < 20 : ry > 60) && Math.abs(rx - x) < bd) { bd = Math.abs(rx - x); bestA = a; }
  }
  return bestA;
}
