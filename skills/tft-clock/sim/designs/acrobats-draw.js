// Acrobats: drawing. Everything is hard pixels in exactly two colours: the
// big top behind (per-pixel loop straight into g.buf, integer arithmetic),
// then every actor twice, once fat in GROUND (its moat) and once in INK.
import { K, clear as handClear } from './acrobats-glyphs.js';
import { sin, cos, to565 } from '../js/kit.js';

export const INK_C = 0x16120e, GROUND_C = 0xf2c230;
export const INK = to565(INK_C), GROUND = to565(GROUND_C);
const W = 160, H = 80, N = W * H;

// ---------------------------------------------------------------- bodies

const LC = new Float32Array(K);       // cumulative length along a path
const PT = new Float32Array(4);       // point + unit tangent scratch

function lengths(P) {
  LC[0] = 0;
  for (let i = 1; i < K; i++) {
    const dx = P[2 * i] - P[2 * i - 2], dy = P[2 * i + 1] - P[2 * i - 1];
    LC[i] = LC[i - 1] + Math.sqrt(dx * dx + dy * dy);
  }
  return LC[K - 1];
}
/** Point and tangent at arc length s (after lengths(P)). */
function pointAt(P, s) {
  let i = 1;
  while (i < K - 1 && LC[i] < s) i++;
  const seg = LC[i] - LC[i - 1] || 1;
  let u = (s - LC[i - 1]) / seg; u = u < 0 ? 0 : u > 1 ? 1 : u;
  const dx = P[2 * i] - P[2 * i - 2], dy = P[2 * i + 1] - P[2 * i - 1];
  PT[0] = P[2 * i - 2] + dx * u; PT[1] = P[2 * i - 1] + dy * u;
  PT[2] = dx / seg; PT[3] = dy / seg;
  return PT;
}

/**
 * One acrobat along path P (world coords, head first). `pass` 0 draws the
 * moat (GROUND, fat), 1 the body (INK). `arms`: [alphaL, alphaR] in radians
 * from "up the body" (0: arm over the head, PI/2: straight out); NaN hides
 * an arm. `cell` (or null) gives the clearance mask and transform used to
 * keep hands out of counters and off other strokes.
 */
export function body(g, P, pass, aL, aR, shoes, cell) {
  const c = pass ? INK_C : GROUND_C, m = pass ? 0 : 2;
  const L = lengths(P);
  const h = pointAt(P, 3.4), hx = h[0], hy = h[1];
  if (!pass) {
    // the moat: one fat stroke and a fat head
    g.fillCircle(hx, hy, 3.9 + m, c);
    for (let i = 1; i < K; i++) g.thickLine(P[2 * i - 2], P[2 * i - 1], P[2 * i], P[2 * i + 1], 4 + 2 * m, c);
  } else {
    g.fillCircle(hx, hy, 3.9, c);
    const t0 = pointAt(P, 1.5), ex0 = Math.floor(hx - t0[2] * 1.4 + t0[3] * 1.3), ey0 = Math.floor(hy - t0[3] * 1.4 - t0[2] * 1.3);
    g.fillRect(ex0, ey0, 1, 1, GROUND_C);
    // torso and legs: one 4-px stroke from below the neck gap to the ankles
    const s0 = 8.2, s1 = L - 4.5;
    let q = pointAt(P, s0), px = q[0], py = q[1];
    let i = 1; while (i < K - 1 && LC[i] <= s0) i++;
    for (; i < K && LC[i] < s1; i++) { g.thickLine(px, py, P[2 * i], P[2 * i + 1], 4, c); px = P[2 * i]; py = P[2 * i + 1]; }
    q = pointAt(P, s1); g.thickLine(px, py, q[0], q[1], 4, c);
    // the feet: the stroke splits in two for its last few pixels
    const ax = q[0], ay = q[1];
    q = pointAt(P, L); const ex = q[0], ey = q[1], enx = -q[3], eny = q[2];
    for (let sd = -1; sd <= 1; sd += 2) g.thickLine(ax + enx * sd * 0.9, ay + eny * sd * 0.9, ex + enx * sd * 2, ey + eny * sd * 2, 2, c);
    if (shoes) {
      const fx = Math.floor(ex), fy = Math.floor(ey);
      g.fillRect(fx - 4, fy, 3, 2, INK_C); g.fillRect(fx + 2, fy, 3, 2, INK_C);
    }
  }
  // arms, from the shoulder
  const sh = pointAt(P, 10), sx = sh[0], sy = sh[1], dx = sh[2], dy = sh[3];
  const flat = dy < 0.45 && dy > -0.45;   // a body lying along a bar keeps its arms to itself
  for (let side = -1; side <= 1; side += 2) {
    if (flat) break;
    const a = side < 0 ? aL : aR;
    if (a !== a) continue;
    const nx = -dy * side, ny = dx * side;
    const ca = cos(a), sa = sin(a);
    const ux = -dx * ca + nx * sa, uy = -dy * ca + ny * sa;
    const x0 = sx + nx * 1.5, y0 = sy + ny * 1.5;
    let len = 7;
    if (cell) {
      while (len > 2.5 && !(handOk(cell, x0 + ux * len, y0 + uy * len) && handOk(cell, x0 + ux * len * 0.55, y0 + uy * len * 0.55))) len -= 1.5;
      if (len <= 2.5) continue;
    }
    const hx2 = x0 + ux * len, hy2 = y0 + uy * len;
    if (pass) { g.thickLine(x0, y0, hx2, hy2, 2, c); g.fillCircle(hx2, hy2, 1.6, c); }
    else { g.thickLine(x0, y0, hx2, hy2, 2 + 2 * m, c); g.fillCircle(hx2, hy2, 1.6 + m, c); }
  }
}

function handOk(cell, x, y) {
  // world -> cell-local (undo the squash about the base line)
  const lx = x - cell.ox, ly = 50 - (cell.base - y) / cell.k;
  // hands only outside the numeral's own cell: above it, or out of the
  // pair's outer side, so no arm ever crosses a stroke or enters a counter
  // never across the 5-px gap to the pair's other digit
  if (cell.left && lx > 26.5) return false;
  if (cell.right && lx < -0.5) return false;
  return ly < 44 && lx > -4 && handClear(cell.G, lx, ly);
}

// ---------------------------------------------------------------- the juggler

const JR = new Float32Array(40);

/**
 * The juggler on the teeterboard's middle: a small clown (pointed cap, ruff,
 * 2-px limbs, so he never reads as a numeral) keeping balls up in a cascade.
 * (x, y) his feet; `rot` radians about his waist (the flourish's flip);
 * `lift` px off the board; `hand` 0..1 the cascade phase; `balls` [x, y]...
 */
export function juggler(g, pass, x, y, lift, rot, hand, balls) {
  const c = pass ? INK_C : GROUND_C, m = pass ? 0 : 1.5;
  const cy = -9, cr = Math.cos(rot), sr = Math.sin(rot);
  let n = 0;
  const P = (px, py) => {
    const qy = py - cy;
    JR[n++] = x + px * cr - qy * sr; JR[n++] = y - lift + cy + px * sr + qy * cr;
    return n - 2;
  };
  const tuck = rot !== 0 ? 4 : 0;
  const hip = P(0, -7 + tuck * 0.3), neck = P(0, -13), head = P(0, -16.5);
  const fl = P(-3, -0.5 - tuck), fr = P(3, -0.5 - tuck);
  const shd = P(0, -12), hl = P(-6, -10 - 2 * hand), hr = P(6, -12 + 2 * hand);
  const c0 = P(-2.6, -19), c1 = P(2.6, -19), c2 = P(1, -25);
  const ln = (a, b2, w) => g.thickLine(JR[a], JR[a + 1], JR[b2], JR[b2 + 1], w + 2 * m, c);
  ln(hip, fl, 2); ln(hip, fr, 2); ln(hip, neck, 3); ln(shd, hl, 2); ln(shd, hr, 2);
  g.fillCircle(JR[head], JR[head + 1], 2.6 + m, c);
  if (pass) g.fillPolygon([[JR[c0], JR[c0 + 1]], [JR[c1], JR[c1 + 1]], [JR[c2], JR[c2 + 1]]], c);
  else g.fillCircle((JR[c0] + JR[c1] + JR[c2]) / 3, (JR[c0 + 1] + JR[c1 + 1] + JR[c2 + 1]) / 3, 4.5, c);
  if (pass) {
    // ruff: two ground notches in the neck; shoes when standing
    if (!lift && !rot) { g.fillRect(Math.round(JR[fl]) - 3, Math.round(JR[fl + 1]), 3, 1, c); g.fillRect(Math.round(JR[fr]) + 1, Math.round(JR[fr + 1]), 3, 1, c); }
  }
  for (let k = 0; k < balls.length; k += 2) g.fillCircle(balls[k], balls[k + 1], 1.6 + m, c);
}

// ---------------------------------------------------------------- the big top

const ANG = new Uint8Array(N);  // angle round the centre (80, 40), 0..255: the hour's sunburst
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  ANG[y * W + x] = Math.floor(((Math.atan2(y + 0.5 - 40, (x + 0.5 - 80) * 0.75) / (2 * Math.PI)) + 1) * 256) & 255;
}
const SC = new Int32Array(H);   // per-row stripe scale, 16.16: the tent's stripes converge upwards
for (let y = 0; y < H; y++) SC[y] = Math.round(65536 * (1 + (79 - y) / 95));

/**
 * The tent wall: canvas panels, alternate ones hatched, converging up to the
 * king pole; spotlight cones (clean ground) sweep across it; at the hour a
 * sunburst of hatched rays opens from the centre and turns.
 * cones: [xTop, xFloor] x2. sun: radius of the sunburst (0 = none), rot 0..255.
 */
export function bigTop(g, cones, sunR, sunRot) {
  const buf = g.buf, ink = INK, gr = GROUND;
  const r2 = sunR * sunR;
  for (let y = 0; y < H; y++) {
    const f = (y + 6) / 86;
    const c0 = cones[0] + (cones[1] - cones[0]) * f, w0 = 3 + (y + 6) * 0.3;
    const c1 = cones[2] + (cones[3] - cones[2]) * f;
    const a0 = Math.round(c0 - w0), b0 = Math.round(c0 + w0), a1 = Math.round(c1 - w0), b1 = Math.round(c1 + w0);
    const dy = (y + 0.5 - 40) * 1.33;
    let s0 = W, s1 = -1;
    if (r2 > dy * dy) { const hw = Math.sqrt(r2 - dy * dy); s0 = Math.round(80 - hw); s1 = Math.round(80 + hw); }
    const sc = SC[y];
    let u = (0 - 80) * sc + (1 << 30);
    const row = y * W;
    for (let x = 0; x < W; x++, u += sc) {
      let v = gr;
      if ((x < a0 || x >= b0) && (x < a1 || x >= b1) && ((x + y) & 3) === 0) {
        const band = x >= s0 && x < s1 ? ((ANG[row + x] + sunRot) >> 4) & 1 : (y & 1) === 0 && (u >> 20) & 1;
        if (band) v = ink;
      }
      buf[row + x] = v;
    }
  }
  g.cost.box += N * 4;
}

// ---------------------------------------------------------------- the trapeze

const TP = new Float32Array(2 * K);
export const PIVOT_X = 80;

/**
 * The flying trapeze, slung from above the glass: `th` the swing angle
 * (radians, 0 hanging straight down), `lag` how far the flyer's legs trail
 * the ropes, `pike` 0..1 folds the legs up. Two passes like everyone else.
 */
export function trapeze(g, pass, th, lag, pike, PIVOT_Y, ROPE) {
  const st = Math.sin(th), ct = Math.cos(th);
  const bx = PIVOT_X + ROPE * st, by = PIVOT_Y + ROPE * ct;
  const px = -ct * 4, py = st * 4;           // half the bar, across the ropes
  if (pass) {
    g.line(Math.round(PIVOT_X - 4), PIVOT_Y, Math.round(bx + px), Math.round(by + py), INK_C);
    g.line(Math.round(PIVOT_X + 4), PIVOT_Y, Math.round(bx - px), Math.round(by - py), INK_C);
  }
  g.thickLine(bx + px, by + py, bx - px, by - py, pass ? 2 : 5, pass ? INK_C : GROUND_C);
  // the flyer hangs by the hands: head 3 px under the bar, body down the
  // ropes' line plus the trailing lag; a pike folds the shins forward
  const a = th + lag, sa = Math.sin(a), ca = Math.cos(a);
  const hx = bx + st * 3, hy = by + ct * 3;
  for (let k = 0; k < K; k++) {
    let s = (k / (K - 1)) * 19, x = hx + sa * s, y = hy + ca * s;
    if (s > 12 && pike > 0) {
      const f = (s - 12) * pike, b = a + 1.9 * pike;
      x = hx + sa * 12 + Math.sin(b) * (s - 12) * (1 - 0.1 * f / 8); y = hy + ca * 12 + Math.cos(b) * (s - 12);
    }
    TP[2 * k] = x; TP[2 * k + 1] = y;
  }
  body(g, TP, pass, 0.05, 0.05, false, null);
}
