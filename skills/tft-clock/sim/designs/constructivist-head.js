// constructivist: the photomontage head.
//
// A shouting woman in profile, facing right, in a red worker's kerchief: the
// cut-out photograph of a Rodchenko poster, reduced to a coarse halftone (a
// 45-degree dot screen, ink on cream paper, dot area = the photo's tone).
// It is built once, at load, into two small keyed canvases (on the device:
// two const bitmaps), so a frame only copies them:
//   HEAD  the static cut-out: kerchief, brow, eye, nose, upper lip, cheek
//   JAW   the lower lip, chin and throat, a separate paper piece that drops a few
//         pixels when she shouts (a cut-out puppet hinge, the way the
//         photomontage films of the 1920s animated their pieces)
// Pixels that are exactly 0x000000 are transparent.

import { Gfx, clamp } from '../js/kit.js';

export const HW = 50, HH = 80;
export const INK = 0x1c1915, PAPER = 0xeee2c4, RED = 0xc9261c;

// ------------------------------------------------------------ silhouettes (screen px)
// The face: forehead from under the kerchief to the upper lip, and the cheek
// down behind the jaw (it overlaps the jaw piece so the jaw tucks under it).
const FACE = [
  [6, 10], [30, 4], [37.5, 12], [38.6, 20], [39.2, 26.5], [37.6, 30.6], [38.4, 33.5],
  [41, 37.6], [44.2, 41.6], [43.8, 43.6], [40.6, 45.2], [40.2, 46.8], [41.8, 48.8],
  [41.4, 50.6], [38.4, 51.4], [35.2, 51.8], [33.6, 55.4], [30, 59.5], [20, 61.5], [6, 61],
];
// The jaw at rest (lips closed): lower lip, chin, jaw line; its top runs up
// under the cheek.
const JAW = [
  [33.5, 50.8], [38.4, 51.2], [41.4, 51.4], [42.3, 53.6], [41.2, 56.2], [38.6, 58.2],
  [39.6, 61.6], [39.2, 65.2], [36.4, 68.4], [31, 70.6], [25, 71.2], [17, 66.4], [10, 58], [12, 50],
];
// The throat and the nape, static, in shadow under the chin.
const NECK = [[4, 56], [18, 64], [27, 70.5], [27.5, 75], [26.5, 80], [0, 80], [0, 56]];
// The kerchief: over the crown and the back of the head, its front edge
// across the top of the forehead, its knot at the nape.
const SCARF = [
  [0, 0], [42, 0], [40.6, 5], [38.2, 11.6], [33, 14.2], [26, 17], [20.5, 21.5], [16.5, 28],
  [14.2, 36], [13, 45], [11.2, 53], [7, 59], [0, 62],
];
const KNOT = [[[8, 54], [1, 66], [6, 67.5], [12, 57]], [[9, 56], [11, 69], [15.5, 67.5], [13, 55]]];

// ------------------------------------------------------------ the photograph's tone (0 paper .. 1 ink)
const gs = (x, y, cx, cy, r) => Math.exp(-(((x - cx) ** 2 + (y - cy) ** 2) / (r * r)));
function skinTone(x, y) {
  let t = 0.05;
  t += 0.26 * clamp((30 - x) / 14, 0, 1);             // turning away from the light
  t += 0.55 * gs(x, y, 35.6, 31, 3.2);                // eye socket
  t -= 0.16 * gs(x, y, 36, 19, 5);                    // forehead highlight
  t -= 0.2 * gs(x, y, 40.6, 38.5, 2.6);               // nose ridge highlight
  t -= 0.2 * gs(x, y, 32.5, 41, 4.2);                 // cheekbone highlight
  t += 0.42 * gs(x, y, 39.4, 46.4, 1.8);              // under the nose
  t += 0.3 * gs(x, y, 39.6, 49.5, 1.8);               // upper lip
  t += 0.25 * gs(x, y, 40, 54.5, 2);                  // lower lip
  t += 0.42 * gs(x, y, 37.6, 58.6, 2.2);              // under the lip
  t -= 0.12 * gs(x, y, 38, 63.5, 2.6);                // the chin catches the light
  t += 0.55 * clamp((y - 65) / 6, 0, 1) * clamp((x - 16) / 8, 0, 1); // under the jaw
  return clamp(t, 0, 1);
}
const neckTone = (x, y) => clamp(0.3 + 0.35 * clamp((72 - y) / 8, 0, 1) + 0.25 * clamp((14 - x) / 14, 0, 1), 0, 1);
const scarfTone = (x, y) => clamp(-0.1 + 0.45 * clamp((20 - x) / 20, 0, 1) + 0.2 * gs(x, y, 16, 32, 5), 0, 0.6);

// a 45-degree screen: rows every PITCH px, alternate rows offset by PITCH
const PITCH = 2;
function screen(g, poly, tone, dx = 0, dy = 0) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [x, y] of poly) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const rmax = PITCH * 0.82;
  for (let j = Math.floor(y0 / PITCH) - 1; j * PITCH <= y1 + PITCH; j++)
    for (let i = Math.floor(x0 / (2 * PITCH)) - 1; i * 2 * PITCH <= x1 + 2 * PITCH; i++) {
      const cx = i * 2 * PITCH + (j & 1) * PITCH + 0.5, cy = j * PITCH + 0.5;
      if (!inside(cx, cy, poly)) continue;
      const t = tone(cx, cy);
      if (t < 0.04) continue;
      g.fillCircle(cx + dx, cy + dy, rmax * Math.sqrt(t), INK, { aa: true });
    }
}
function inside(px, py, pts) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

function build() {
  const head = new Gfx(HW, HH), jaw = new Gfx(HW, HH);
  // the jaw piece on its own canvas, with the throat behind it (both drop
  // together; the throat runs off the bottom of the glass, so it never shows)
  jaw.fillPolygon(NECK, PAPER, { aa: true });
  screen(jaw, NECK, neckTone);
  jaw.fillPolygon(JAW, PAPER, { aa: true });
  screen(jaw, JAW, skinTone);
  // the head: the face, the kerchief over it
  head.fillPolygon(FACE, PAPER, { aa: true });
  screen(head, FACE, skinTone);
  // the eye: a dark sideways wedge under a brow, the lash line catching ink
  head.fillPolygon([[33.2, 30.2], [37.4, 30.4], [34.2, 32.4]], INK, { aa: true });
  head.thickLine(31.4, 27.6, 37.8, 27.3, 1.4, INK, { aa: true });
  // the nostril and the line of the lips
  head.fillPolygon([[39.4, 44.2], [41.6, 44.6], [40, 45.4]], INK, { aa: true });
  head.fillPolygon(SCARF, RED, { aa: true });
  for (const k of KNOT) head.fillPolygon(k, RED, { aa: true });
  screen(head, SCARF, scarfTone);
  for (const k of KNOT) screen(head, k, () => 0.3);
  return { head, jaw };
}

export const ART = build();
