// Slide puzzle numerals: Didone / Deco poster figures painted on 64x64 tiles.
// Thick verticals, hairline horizontals, ball terminals: the contrast that a
// 1930s travel poster's lettering has, drawn for a 2 mm pixel grid (strokes
// 8-9 px thick, hairlines 3 px so they survive at 1-2 m).
//
// Each glyph is a 40 x 54 px figure placed at (12, 5) on the tile. Built as
// an inside() test, supersampled 4x4 at load into coverage masks:
//   G[d]  ink coverage (0..1), 64*64
//   K[d]  the dark keyline + poster drop shadow under the ink, 64*64

const W = 64, OX = 12, OY = 5, SS = 4;

const ell = (x, y, cx, cy, a, b) => ((x - cx) / a) ** 2 + ((y - cy) / b) ** 2 <= 1;
/** Ring between an outer ellipse and one shrunk by th (sides) and tv (top/bottom). */
const ring = (x, y, cx, cy, a, b, th, tv) => ell(x, y, cx, cy, a, b) && !ell(x, y, cx, cy, a - th, b - tv);
/** Angle of (x, y) round an ellipse centre, degrees 0..360, 0 = right, 90 = down. */
const ang = (x, y, cx, cy, a, b) => { const d = Math.atan2((y - cy) / b, (x - cx) / a) * 180 / Math.PI; return d < 0 ? d + 360 : d; };
const inA = (d, a0, a1) => { d = ((d - a0) % 360 + 360) % 360; return d <= a1 - a0; };
const arc = (x, y, cx, cy, a, b, th, tv, a0, a1) => ring(x, y, cx, cy, a, b, th, tv) && inA(ang(x, y, cx, cy, a, b), a0, a1);
const box = (x, y, x0, y0, x1, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
const disc = (x, y, cx, cy, r) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
/** A straight stroke with butt ends from a to b, width w. */
function bar(x, y, ax, ay, bx, by, w) {
  const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L;
  const px = x - ax, py = y - ay, along = px * ux + py * uy, across = Math.abs(px * uy - py * ux);
  return along >= 0 && along <= L && across <= w / 2;
}

const SIX = (x, y) =>
  ring(x, y, 20, 37, 19, 17, 8.5, 3.2) ||
  arc(x, y, 25, 33, 22, 33, 8, 3.2, 180, 284) ||
  disc(x, y, 32.5, 5.5, 4.8);

const SHAPES = [
  // 0: one ellipse, thick flanks, hairline crown and foot
  (x, y) => ring(x, y, 20, 27, 18.5, 27, 8.8, 3.2),
  // 1: heavy stem, a hairline flag, a foot serif
  (x, y) => box(x, y, 15.5, 0, 24.5, 51) || bar(x, y, 16.5, 1.5, 7, 11, 3.6) || box(x, y, 8, 50.5, 32, 54),
  // 2: ball, bowl, heavy spine, flat foot
  (x, y) =>
    arc(x, y, 20, 16, 18, 16, 8, 3.2, 180, 410) || disc(x, y, 7, 18, 5) ||
    bar(x, y, 34.5, 22.5, 3.5, 50.5, 8) || box(x, y, 2, 49, 39, 54) || box(x, y, 35, 43.5, 39, 54),
  // 3: small upper bowl, larger lower bowl, two balls
  (x, y) =>
    arc(x, y, 19, 13.5, 16, 13.5, 7.5, 3.2, 205, 445) || disc(x, y, 6.5, 9, 4.6) ||
    arc(x, y, 20, 38.5, 18.5, 15.5, 8.5, 3.2, 262, 520) || disc(x, y, 6.5, 43.5, 5),
  // 4: closed apex: hairline diagonal into a heavy stem, crossbar, foot
  (x, y) =>
    box(x, y, 25, 0, 33.5, 51) || bar(x, y, 28, 0.5, 1, 38.5, 3.4) || box(x, y, 0.5, 36, 40, 40) || box(x, y, 19, 50.5, 39, 54),
  // 5: flag, short stem, big bowl, ball
  (x, y) =>
    box(x, y, 9, 0, 37, 4.2) || box(x, y, 34, 0, 37.5, 8) || box(x, y, 9, 0, 14.5, 24) ||
    arc(x, y, 19.5, 36, 19, 17.5, 8.5, 3.2, 212, 512) || disc(x, y, 6, 44, 5),
  // 6
  SIX,
  // 7: hairline bar with a drop serif, heavy stroke down to the left
  (x, y) => box(x, y, 1, 0, 39, 4.2) || box(x, y, 1, 0, 4.5, 9) || bar(x, y, 37.5, 2, 17, 54, 8.8),
  // 8: two stacked rings, the lower one larger
  (x, y) => ring(x, y, 20, 13.5, 15.5, 13.5, 7.2, 3.2) || ring(x, y, 20, 39, 19, 15, 8.5, 3.2),
  // 9: the 6 turned round
  (x, y) => SIX(40 - x, 54 - y),
];

function build() {
  const G = [], K = [];
  for (let d = 0; d < 10; d++) {
    const g = new Float32Array(W * W), f = SHAPES[d];
    for (let py = 0; py < W; py++) for (let px = 0; px < W; px++) {
      let n = 0;
      for (let j = 0; j < SS; j++) for (let i = 0; i < SS; i++) {
        if (f(px - OX + (i + 0.5) / SS, py - OY + (j + 0.5) / SS)) n++;
      }
      g[py * W + px] = n / (SS * SS);
    }
    // keyline: the ink grown by ~1.6 px; shadow: the ink dropped (2, 2.5) px, softened
    const k = new Float32Array(W * W);
    for (let py = 0; py < W; py++) for (let px = 0; px < W; px++) {
      let m = 0, s = 0;
      for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) {
        const x = px + i, y = py + j;
        if (x < 0 || y < 0 || x >= W || y >= W) continue;
        const r = Math.hypot(i, j), w = r <= 1.2 ? 1 : r <= 2.0 ? 0.6 : 0;
        m = Math.max(m, g[y * W + x] * w);
      }
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const x = px - 2 + i, y = py - 3 + j;
        if (x < 0 || y < 0 || x >= W || y >= W) continue;
        s += g[y * W + x] / 9;
      }
      k[py * W + px] = Math.min(1, Math.max(m, s * 1.1));
    }
    G.push(g); K.push(k);
  }
  return { G, K };
}

export const GLYPHS = build();
