// The hero: the owner's rainbow frog in round glasses, about 13 px tall,
// drawn as soft shapes (signed distances) so it can squash, stretch, spin
// and glide between pixels. Side view, facing +x unless dir = -1.
import * as kit from '../js/kit.js';

const RAIN = [0.0, 0.07, 0.15, 0.33, 0.58, 0.76].map((h) => kit.hsv(h, 0.9, 1));
const BELLY = kit.hex('#ffe9a8'), RIM = kit.hex('#f2f6ff'), LENS = kit.hex('#060a14'), PUPIL = [0, 0, 0], MOUTH = kit.hex('#5a0f1c');

const ell = (x, y, cx, cy, rx, ry) => (Math.hypot((x - cx) / rx, (y - cy) / ry) - 1) * Math.min(rx, ry);
function cap(x, y, ax, ay, bx, by, r) {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
  const t = L2 ? kit.clamp(((x - ax) * dx + (y - ay) * dy) / L2) : 0;
  return Math.hypot(x - ax - dx * t, y - ay - dy * t) - r;
}
const smin = (a, b, k) => { const h = kit.clamp(0.5 + (0.5 * (b - a)) / k); return b + (a - b) * h - k * h * (1 - h); };
const cov = (d) => kit.clamp(0.5 - d);

/**
 * Draw the frog into img (N x N linear RGB). (x, y): the point between its
 * feet, in raster pixels (y down). o: { dir, leg (0 tucked .. 1 stretched),
 * arm (0 down .. 1 up), sq (1 = normal, >1 squashed wide), rot (radians),
 * blink (0..1), look (-1..1 pupils), clip: [px, py, nx, ny] keep where
 * (p - P).n > 0, tongue: length px, a: alpha, slide (0..1 wall pose) }.
 */
export function drawFrog(img, N, x, y, o = {}) {
  const dir = o.dir ?? 1, sq = o.sq ?? 1, sx = Math.sqrt(sq), sy = 1 / Math.sqrt(sq), rot = (o.rot ?? 0) * dir;
  const leg = o.leg ?? 0, arm = o.arm ?? 0, blink = o.blink ?? 0, A = o.a ?? 1, look = o.look ?? 0.4, slide = o.slide ?? 0;
  const tongue = o.tongue ?? 0, clip = o.clip;
  const cr = Math.cos(rot), sr = Math.sin(rot);
  const pivotY = -6.5; // spin about the body's middle
  const x0 = Math.floor(x - 12), x1 = Math.ceil(x + 12 + Math.max(0, tongue)), y0 = Math.floor(y - 18), y1 = Math.ceil(y + 4);
  // leg geometry (frog-local, y up = negative)
  const kneeX = -3.2 - 1.2 * leg, kneeY = -2.6 + 1.4 * leg;
  const footX = -1.0 - 4.2 * leg, footY = -0.6 + 2.2 * leg;
  const handX = 3.6 + 1.0 * arm - 1.5 * slide, handY = -1.2 - 6.5 * arm - 3 * slide;
  for (let py = y0; py <= y1; py++) {
    if (py < 0 || py >= N) continue;
    for (let px = x0; px <= x1; px++) {
      if (px < 0 || px >= N) continue;
      const wx = px + 0.5, wy = py + 0.5;
      if (clip && (wx - clip[0]) * clip[2] + (wy - clip[1]) * clip[3] < 0) continue;
      // world -> local: undo position, rotation about the pivot, squash, facing
      let lx = wx - x, ly = wy - y - pivotY;
      const rx = cr * lx + sr * ly, ry = -sr * lx + cr * ly;
      lx = (rx / sx) * dir; ly = ry / sy + pivotY;
      // tongue (drawn first, it shoots out of the mouth)
      let tng = 1e9;
      if (tongue > 0) tng = cap(lx, ly, 5.8, -5.4, 5.8 + tongue, -5.4 - tongue * 0.25, 0.7);
      // body + head: a wide low dome with the head at the front
      const body = Math.max(ell(lx, ly, -0.6, -4.4, 6.4, 4.4), ly + 0.6);
      const head = ell(lx, ly, 2.8, -5.9, 4.1, 3.3);
      const bd = smin(body, head, 1.6);
      const thigh = ell(lx, ly, kneeX + 0.6, kneeY - 0.9, 3.0, 2.3);
      const shin = cap(lx, ly, kneeX, kneeY, footX, footY, 1.0);
      const foot = cap(lx, ly, footX, footY, footX + 2.4, footY + 0.2 * leg, 0.75);
      const armD = cap(lx, ly, 3.4, -3.6, handX + 0.6, handY, 0.8);
      const eyeN = Math.hypot(lx - 3.3, ly + 9.6) - 2.3, eyeF = Math.hypot(lx - 0.0, ly + 9.9) - 2.0;
      const legD = Math.min(smin(thigh, shin, 0.8), foot);
      const all = Math.min(bd, legD, armD, eyeN - 0.5, eyeF - 0.5, tng);
      if (all > 1.6) continue;
      const o3 = 3 * (py * N + px);
      // dark outline first: separates the frog from pipes and sky
      const out = cov(all - 1.0) * 0.95 * A;
      if (out > 0) { img[o3] *= 1 - out; img[o3 + 1] *= 1 - out; img[o3 + 2] *= 1 - out; }
      const paint = (c, a) => {
        if (a <= 0) return;
        a *= A;
        img[o3] += (c[0] - img[o3]) * a; img[o3 + 1] += (c[1] - img[o3 + 1]) * a; img[o3 + 2] += (c[2] - img[o3 + 2]) * a;
      };
      if (tng < 1) paint(kit.hex('#ff5a8a'), cov(tng));
      // rainbow arcs over the back: red outside, violet inside
      const band = (1 - kit.clamp((Math.hypot(lx - 0.8, ly + 0.2) - 2.2) / 6.6)) * 5.999;
      const bi = Math.floor(band), bf = band - bi, c0 = RAIN[bi], c1 = RAIN[Math.min(5, bi + 1)];
      const sm = kit.smoothstep(0.7, 1, bf);
      const shadeK = 0.6 + 0.4 * kit.clamp(0.4 - (ly + 3) / 8);
      const skin = [(c0[0] + (c1[0] - c0[0]) * sm) * shadeK, (c0[1] + (c1[1] - c0[1]) * sm) * shadeK, (c0[2] + (c1[2] - c0[2]) * sm) * shadeK];
      paint(skin, cov(bd));
      // the folded hind leg, with its own crease line
      if (legD < 0.5) { paint([0, 0, 0], cov(legD - 0.0) * 0.9); paint(skin.map((v) => v * 0.85), cov(legD + 0.7)); }
      paint(skin.map((v) => v * 1.1), cov(armD));
      // mouth: a wide smile
      const mouth = Math.abs(ell(lx, ly, 3.4, -6.4, 3.4, 1.7)) - 0.32;
      if (ly > -6.4 && lx > 1.6) paint(MOUTH, cov(mouth));
      // round glasses: bright rims, dark lenses, a glint each
      paint(RIM.map((v) => v * 0.8), cov(cap(lx, ly, 1.6, -10.2, 1.4, -10.2, 0.4)));
      for (const [ex, ey, er, k] of [[0.0, -9.9, 2.0, 0.75], [3.3, -9.6, 2.3, 1]]) {
        const d = Math.hypot(lx - ex, ly - ey) - er;
        paint(RIM.map((v) => v * k * 0.9), cov(d - 0.25));
        const lid = blink > 0 && ly < ey - er + 2 * er * blink + 0.4;
        paint(lid ? skin : LENS, cov(d + 0.7));
        if (!lid) {
          paint(PUPIL, cov(Math.hypot(lx - ex - 0.6 * look, ly - ey - 0.2) - 0.85));
          paint([1, 1, 1], cov(Math.hypot(lx - ex + 0.6, ly - ey + 0.7) - 0.4) * 0.9);
        }
      }
    }
  }
}
