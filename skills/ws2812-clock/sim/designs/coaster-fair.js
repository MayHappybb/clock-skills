// Coaster: the funfair around the ride. A static layer (lift tower lattice,
// station canopy, Ferris-wheel legs, a midway of striped tents) baked once,
// and the live parts drawn per frame (the turning wheel with hanging
// gondolas, swags of bulbs between the tents, the canopy bulbs). Everything
// here is lit at levels above ~32/255, where a 3-panel HUB75 chain still shows
// levels in proportion.
import * as kit from '../js/kit.js';

const W = 192, H = 64;
export const WHEEL = { x: 15, y: 20, r: 11 };
// tents: centre x, half-width
export const TENTS = [[52, 8], [70, 7], [91, 9], [111, 6], [131, 8], [150, 7], [170, 9]];
const RED = [0.22, 0.016, 0.024], CREAM = [0.16, 0.115, 0.06], TOWER = [0.16, 0.12, 0.1], LEG = [0.14, 0.09, 0.11];
const RIM = [0.24, 0.12, 0.17], SPOKE = [0.14, 0.075, 0.1];
const GONDOLA = [[0.5, 0.25, 0.02], [0.45, 0.04, 0.08], [0.25, 0.05, 0.4], [0.45, 0.4, 0.04]];
const BULB_A = [1, 0.6, 0.25], BULB_B = [1, 0.25, 0.32];

function over(img, x, y, c, a) {
  if (x < 0 || y < 0 || x >= W || y >= H || a <= 0) return;
  const p = 3 * (y * W + x);
  img[p] += (c[0] - img[p]) * a; img[p + 1] += (c[1] - img[p + 1]) * a; img[p + 2] += (c[2] - img[p + 2]) * a;
}
/** An anti-aliased line, painted over. */
function line(img, ax, ay, bx, by, c, w = 0.9) {
  const x0 = Math.floor(Math.min(ax, bx) - 1), x1 = Math.ceil(Math.max(ax, bx) + 1);
  const y0 = Math.floor(Math.min(ay, by) - 1), y1 = Math.ceil(Math.max(ay, by) + 1);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const d = kit.segDist(x, y, ax, ay, bx, by);
    over(img, x, y, c, kit.clamp(w - d));
  }
}

/** The fair's still parts, linear RGB, W x H. */
export function fairStatic() {
  const img = new Float32Array(3 * W * H);
  // midway tents along the foot of the track: striped tops with pennants
  for (const [cx, hw] of TENTS) {
    for (let y = 54; y <= 60; y++) for (let x = Math.floor(cx - hw - 1); x <= Math.ceil(cx + hw + 1); x++) {
      const dx = x - cx, ax = Math.abs(dx) / hw;
      if (ax > 1.05) continue;
      const roof = 54.6 + 3.4 * ax ** 0.85;                      // the roof line
      const cov = kit.clamp(y - roof + 0.8) * kit.clamp((1.05 - ax) * hw);
      if (cov <= 0) continue;
      const skirt = y >= 58.5;
      const band = skirt ? Math.floor((dx + 40) / 2) : Math.floor((dx * 2.2) / (y - 53.2) + 40);
      over(img, x, y, band % 2 ? CREAM : RED, cov);
      if (skirt && y === 59 && (x & 1)) over(img, x, y, [0, 0, 0], 0.55);   // scalloped hem
    }
    over(img, Math.round(cx), 53, [0.3, 0.24, 0.03], 1);
    over(img, Math.round(cx) + 1, 53, [0.3, 0.05, 0.02], 0.8);
  }
  // the lift tower: X-braced lattice between the lift and the drop
  for (let y = 14; y < 44; y += 6) {
    line(img, 30.9, y, 37.1, y + 6, TOWER, 0.75);
    line(img, 37.1, y, 30.9, y + 6, TOWER, 0.75);
    line(img, 30.9, y, 37.1, y, TOWER, 0.75);
  }
  line(img, 31, 50, 31, 62, TOWER); line(img, 38.4, 47, 38.4, 62, TOWER);
  line(img, 31, 50, 38.4, 56, TOWER, 0.7); line(img, 38.4, 50, 31, 56, TOWER, 0.7);
  // the Ferris wheel's A-frame legs, standing on the station roof
  line(img, WHEEL.x, WHEEL.y, 6.5, 38, LEG); line(img, WHEEL.x, WHEEL.y, 23.5, 38, LEG);
  // station canopy: striped awning with a scalloped valance, two posts
  for (let x = 3; x <= 28; x++) {
    const c = Math.floor((x - 3) / 2) % 2 ? CREAM : RED;
    for (let y = 38; y <= 40; y++) over(img, x, y, c, 1);
    if (x % 3 !== 0) over(img, x, 41, c, 0.8);
  }
  line(img, 4, 42, 4, 55, TOWER, 0.7); line(img, 27, 42, 27, 52, TOWER, 0.7);
  return img;
}

/** The fair's moving parts, drawn into img. glow(x, y, r, c, a) adds a soft light. */
export function drawFair(img, glow, now, dim) {
  // the Ferris wheel turns slowly; gondolas hang plumb
  const { x: cx, y: cy, r } = WHEEL, th = -now * (Math.PI * 2 / 48);
  const step = Math.PI / 4;
  for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) {
    for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
      const dx = x - cx, dy = y - cy, rp = Math.hypot(dx, dy);
      const ring = kit.clamp(0.85 - Math.abs(rp - r));
      let a = ring, c = RIM;
      if (rp < r) {
        let d = (Math.atan2(dy, dx) - th) % step;
        if (d < 0) d += step;
        const sp = kit.clamp(0.8 - rp * Math.sin(Math.min(d, step - d))) * kit.smoothstep(0.5, 2, rp);
        if (sp > a) { a = sp; c = SPOKE; }
      }
      if (a > 0) over(img, x, y, kit.scale(c, dim), a);
    }
  }
  glow(cx, cy, 1.4, [1, 0.7, 0.4], 0.35 * dim);
  for (let k = 0; k < 16; k++) {
    const a = th + (k * Math.PI) / 8, ph = 0.5 + 0.5 * Math.sin(now * 3 - k * 0.8);
    glow(cx + r * Math.cos(a), cy + r * Math.sin(a), 0.95, k % 2 ? BULB_A : BULB_B, dim * (0.25 + 0.5 * ph));
  }
  for (let k = 0; k < 8; k++) {
    const a = th + k * step + step / 2, gx = cx + r * Math.cos(a), gy = cy + r * Math.sin(a) + 2.1;
    const sway = 0.25 * Math.sin(now * 1.7 + k);
    const col = kit.scale(GONDOLA[k % 4], dim);
    for (let y = Math.floor(gy - 2); y <= Math.ceil(gy + 2); y++) for (let x = Math.floor(gx - 2.5); x <= Math.ceil(gx + 2.5); x++) {
      const sd = Math.max(Math.abs(x - gx - sway) - 1.35, Math.abs(y - gy) - 0.95);
      over(img, x, y, col, kit.clamp(0.5 - sd));
    }
  }
  // swags of bulbs strung between the tent peaks
  for (let q = 0; q + 1 < TENTS.length; q++) {
    const x0 = TENTS[q][0], x1 = TENTS[q + 1][0], len = x1 - x0, ph = now * 1.3 + q * 1.7;
    for (let b = 1; b * 3 < len; b++) {
      const f = (b * 3) / len, y = 53.6 + (2.4 + 0.35 * Math.sin(ph)) * 4 * f * (1 - f);
      const tw = 0.7 + 0.3 * Math.sin(now * 2.2 + b * 2.4 + q);
      glow(x0 + len * f + 0.3 * Math.sin(ph) * Math.sin(Math.PI * f), y, 0.85, (b + q) % 2 ? BULB_A : BULB_B, 0.5 * tw * dim);
    }
  }
  // canopy bulbs
  for (let x = 4; x <= 27; x += 3) glow(x, 41.6, 0.85, BULB_A, dim * (0.35 + 0.25 * Math.sin(now * 2 + x)));
}
