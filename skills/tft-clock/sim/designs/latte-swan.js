// Latte: the hour's swans. One swan is poured in each cup, round the rim
// behind the time: the wing a crescent of rosetta leaves along the bottom and
// up the far side, the neck pulled up the near side, the head a small heart
// with a beak, so the two swans face each other over the gap between the
// cups. Each swan is a list of its pixels with the moment the pour reaches
// them (built once at load: ~1.5 KB a swan in flash).

import { CUPS, W } from './latte-scene.js';

const DEG = Math.PI / 180;
const WING_A = 300, WING_B = 142;            // clock angles: tail (10 o'clock) to the front (5 o'clock)
const NECK_TOP = 52, NECK_R = 30.6, HEAD_A = 33, HEAD_R = 28.6;
const T_WING = 0.56, T_NECK = 0.88;          // pour order: wing, neck, then the head drops

function build(c) {
  const C = CUPS[c], m = c === 0 ? 1 : -1, rOut = C.Rin - 2.6;
  const k = rOut / 32.2;                     // the minutes' cup is smaller: scale the swan to it
  const px = [], ord = [], tone = [];
  const hx = Math.sin(HEAD_A * DEG) * HEAD_R * k * m, hy = -Math.cos(HEAD_A * DEG) * HEAD_R * k;
  for (let y = Math.floor(C.cy - C.Rin); y <= C.cy + C.Rin; y++) for (let x = Math.floor(C.cx - C.Rin); x <= C.cx + C.Rin; x++) {
    const dx = (x + 0.5 - C.cx) * m, dy = y + 0.5 - C.cy, r = Math.hypot(dx, dy);
    if (r >= rOut) continue;
    let a = Math.atan2(dx, -dy) / DEG; if (a < 0) a += 360;
    let o = -1, t = 0;
    // the wing: leaves stacked from the tail, wider toward the body
    if (a <= WING_A && a >= WING_B) {
      const f = (WING_A - a) / (WING_A - WING_B);          // 0 tail .. 1 front
      const r0 = rOut - (1.8 + 5.2 * Math.sin(Math.min(1, f * 1.25) * Math.PI * 0.5)) * k;
      // leaves: 7 of them, each rib bent back toward the tail at the outer edge, each leaf's inner edge a scallop
      const q = f * 7 - ((r - r0) / (rOut - r0 + 0.01)) * 0.45;
      const lf = q - Math.floor(q);
      if (r >= r0 + 1.6 * (1 - lf) * k) {
        o = f * T_WING;
        t = lf < 0.2 && f > 0.04 ? 1 : 0;
      }
    }
    // the neck: up the near side along the rim, then curling in to the head
    if (o < 0 && a <= WING_B + 6 && a >= NECK_TOP) {
      const rn = NECK_R * k - (a < 70 ? (70 - a) * 0.06 : 0);
      if (Math.abs(r - rn) < 1.35 * (0.9 + 0.1 * k)) { o = T_WING + ((WING_B + 6 - a) / (WING_B + 6 - NECK_TOP)) * (T_NECK - T_WING); t = 0; }
    }
    if (o < 0) {
      // from the neck's top into the head
      const nx = Math.sin(NECK_TOP * DEG) * (NECK_R * k - 1.1), ny = -Math.cos(NECK_TOP * DEG) * (NECK_R * k - 1.1);
      const ex = hx * m - nx, ey = hy - ny, l2 = ex * ex + ey * ey;
      let u = ((dx - nx) * ex + (dy - ny) * ey) / l2; u = u < 0 ? 0 : u > 1 ? 1 : u;
      if (Math.hypot(dx - nx - u * ex, dy - ny - u * ey) < 1.3) { o = T_NECK + u * 0.04; t = 0; }
      // the head: a heart, its point toward the neck, and a beak toward the other cup
      const hdx = dx - hx * m, hdy = dy - hy, rl = 2.5 * k + 0.2;
      const lob = Math.min(Math.hypot(hdx + 1.2, hdy + 1.0), Math.hypot(hdx - 1.6, hdy + 1.2));
      const tip = hdy > -1 && hdy < 3.6 && Math.abs(hdx) < (3.6 - hdy) * 0.9;
      if (lob < rl || tip) { o = T_NECK + 0.04 + 0.08 * (Math.hypot(hdx, hdy) / 4); t = 0; }
      if (hdx > 2 && hdx < 6.5 && Math.abs(hdy + 0.4) < 1.0 - (hdx - 2) * 0.18) { o = 0.99; t = 1; }
    }
    if (o < 0) continue;
    px.push(y * W + x); ord.push(Math.round(o * 255)); tone.push(t);
  }
  // the pour path for the stream: wing along the band's middle, then the neck, then the head
  const at = (p) => {
    let ddx, ddy;
    if (p < T_WING) {
      const f = p / T_WING, a = (WING_A - f * (WING_A - WING_B)) * DEG, rr = rOut - 3 * k;
      ddx = Math.sin(a) * rr; ddy = -Math.cos(a) * rr;
    } else if (p < T_NECK) {
      const a = (WING_B + 6 - ((p - T_WING) / (T_NECK - T_WING)) * (WING_B + 6 - NECK_TOP)) * DEG;
      ddx = Math.sin(a) * NECK_R * k; ddy = -Math.cos(a) * NECK_R * k;
    } else { ddx = hx * m; ddy = hy; }
    return [C.cx + ddx * m, C.cy + ddy];
  };
  const rank = Uint8Array.from(px, (v, i) => (Math.imul(v ^ 0x3c6ef372, 0x9e3779b1) >>> 24) ^ (i & 7));
  return { px: Int32Array.from(px), ord: Uint8Array.from(ord), tone: Uint8Array.from(tone), rank, at };
}

export const SWANS = [build(0), build(1)];

export const SWAN_T0 = 0.35, SWAN_T1 = 3.4, SWAN_GONE0 = 8.0, SWAN_GONE1 = 11.5;

/** The swan at second `s` of the hour's first minute: poured, held, then sinking back into the crema. */
export function swanPaint(g, S, s, C) {
  if (s < SWAN_T0 || s >= SWAN_GONE1) return null;
  const p = Math.min(1, (s - SWAN_T0) / (SWAN_T1 - SWAN_T0));
  const lim = Math.round(p * 255), gone = s < SWAN_GONE0 ? -1 : Math.round(((s - SWAN_GONE0) / (SWAN_GONE1 - SWAN_GONE0)) * 256);
  const buf = g.buf, n = S.px.length, c0 = gone > 140 ? C.latte : C.swan, c1 = C.swanRib;
  for (let i = 0; i < n; i++) {
    if (S.ord[i] > lim || S.rank[i] < gone) continue;
    buf[S.px[i]] = S.tone[i] ? c1 : c0;
  }
  g.cost.box += n * 3;
  return p < 1 ? S.at(p) : null;
}
