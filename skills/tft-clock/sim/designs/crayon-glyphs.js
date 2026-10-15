// The cast of "crayon": ten doodle-monster bodies, one per numeral, in two
// sizes (hours big, minutes a little smaller). Each body is a numeral drawn
// as a fat marker stroke (centre lines below, stroked radius R) the way a
// child draws one: a black felt-tip outline 2 px thick, coloured in with a
// waxy crayon scribble that misses the line in places and spills over it in
// others. Line boil: every body exists as three drawings (BOIL), each with
// its own wobble of the outline and its own colouring-in, cycled 12 times a
// second, the way hand-drawn animation boils.
//
// At load each drawing becomes a byte map of material codes (0 paper,
// 1 crayon pressed light, 2 crayon, 3 crayon pressed hard, 4 ink), plus one
// rank map per body (its drawing order: where along the numeral's writing
// path each pixel lies, and a hashed order for the colouring-in), used when
// a new monster is drawn in. Flash: ~203 KB for the set (bytes; the hashed
// fill rank, 20 KB of it, could be recomputed on the device instead).
//
// Anchors per digit, in map pixels: eyes (on the top edge, googly), mouth
// (on a horizontal stroke, centre line), hips (where legs leave the bottom),
// hat (top centre, for the hour party).

import { hash } from '../js/kit.js';

export const BOIL = 3;
export const M = 4;                        // map margin round the body box, for spill and wobble
export const SIZES = [
  { W: 31, H: 48, R: 5.0, eyeR: 3.7 },     // hours
  { W: 27, H: 42, R: 4.5, eyeR: 3.4 },     // minutes
];

const arc = (cx, cy, rx, ry, a0, a1, n = 32) => {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + (a1 - a0) * (i / n)) * Math.PI) / 180;
    pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return pts;
};

// centre lines in a unit box (u right, v down), in the order a child writes them
const SKEL = {
  0: [arc(0.5, 0.5, 0.5, 0.5, -95, 265, 48)],
  1: [[[0.12, 0.3], [0.64, 0]], [[0.64, 0], [0.64, 1]]],
  2: [[...arc(0.5, 0.3, 0.5, 0.3, 195, 390, 30), [0.02, 1], [1, 1]]],
  3: [arc(0.48, 0.25, 0.48, 0.25, 200, 440, 30), [[0.3, 0.475], [0.56, 0.475]], arc(0.5, 0.72, 0.5, 0.28, 280, 520, 30)],
  4: [[[0.14, 0], [0.02, 0.66], [1, 0.66]], [[0.8, 0.18], [0.8, 1]]],
  5: [[[0.96, 0], [0.1, 0], [0.055, 0.46]], arc(0.47, 0.68, 0.53, 0.32, 218, 486, 30)],
  6: [arc(0.9, 0.75, 0.86, 0.75, 264, 180, 20), arc(0.52, 0.72, 0.48, 0.28, 180, 540, 40)],
  7: [[[0, 0], [1, 0], [0.64, 0.42], [0.38, 1]]],
  8: [arc(0.5, 0.235, 0.42, 0.235, -90, 270, 36), arc(0.5, 0.72, 0.5, 0.28, -90, 270, 40)],
  9: [arc(0.5, 0.32, 0.5, 0.32, 0, 360, 40), [[1, 0.32], [0.98, 0.78], [0.9, 1]]],
};

// features in unit coordinates: eyes (u, size), mouth [u, v, width as a fraction of W], hips (u), hat (u)
const FEAT = {
  0: { eyes: [[0.27, 1], [0.73, 1]], mouth: [0.5, 0, 0.24], hips: [0.3, 0.7], hat: 0.5 },
  1: { eyes: [[0.64, 1.25]], mouth: [0.64, 0.34, 0.18], hips: [0.5, 0.78], hat: 0.64 },
  2: { eyes: [[0.3, 1], [0.72, 1]], mouth: [0.52, 0, 0.24], hips: [0.14, 0.86], hat: 0.51 },
  3: { eyes: [[0.2, 0.8], [0.48, 0.8], [0.76, 0.8]], mouth: [0.5, 0, 0.2], hips: [0.28, 0.66], hat: 0.48 },
  4: { eyes: [[0.13, 1], [0.8, 1]], mouth: [0.42, 0.66, 0.3], hips: [0.7, 0.9], hat: 0.47 },
  5: { eyes: [[0.32, 1], [0.72, 1]], mouth: [0.52, 0, 0.26], hips: [0.3, 0.68], hat: 0.52 },
  6: { eyes: [[0.8, 1.2]], mouth: [0.6, 0.44, 0.22], hips: [0.3, 0.72], hat: 0.45 },
  7: { eyes: [[0.27, 1], [0.7, 1]], mouth: [0.49, 0, 0.26], hips: [0.27, 0.48], hat: 0.49 },
  8: { eyes: [[0.3, 1], [0.7, 1]], mouth: [0.5, 0, 0.2], hips: [0.3, 0.7], hat: 0.5 },
  9: { eyes: [[0.28, 1], [0.72, 1]], mouth: [0.5, 0, 0.24], hips: [0.8, 1.0], hat: 0.5 },
};

// ------------------------------------------------------------ load-time maths (not on the frame path)

const rnd = (a, b, c) => hash(a, b, c) / 4294967296;
function vnoise(x, y, seed) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = rnd(ix, iy, seed), b = rnd(ix + 1, iy, seed), c = rnd(ix, iy + 1, seed), d = rnd(ix + 1, iy + 1, seed);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

/** Distance from (px, py) to the polylines, and the writing-path parameter (0..1) of the nearest point. */
function nearest(segs, px, py) {
  let best = 1e9, bs = 0;
  for (let i = 0; i < segs.length; i++) {
    const [ax, ay, bx, by, s0, s1] = segs[i];
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
    let t = L2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = ax + dx * t - px, ey = ay + dy * t - py, d = ex * ex + ey * ey;
    if (d < best) { best = d; bs = s0 + (s1 - s0) * t; }
  }
  return [Math.sqrt(best), bs];
}

function buildDigit(size, d, si) {
  const { W, H, R } = size;
  const MW = W + 2 * M, MH = H + 2 * M;
  const X = (u) => M + R + u * (W - 2 * R), Y = (v) => M + R + v * (H - 2 * R);
  // segments with cumulative arc length
  const segs = [];
  let total = 0;
  for (const line of SKEL[d]) {
    for (let i = 1; i < line.length; i++) {
      const ax = X(line[i - 1][0]), ay = Y(line[i - 1][1]), bx = X(line[i][0]), by = Y(line[i][1]);
      const L = Math.hypot(bx - ax, by - ay);
      segs.push([ax, ay, bx, by, total, total + L]);
      total += L;
    }
  }
  for (const s of segs) { s[4] /= total; s[5] /= total; }

  const maps = [];
  for (let k = 0; k < BOIL; k++) {
    const map = new Uint8Array(MW * MH);
    const sd = 1000 + d * 37 + k * 11 + si * 5;
    // the colouring-in is a separate act: shifted off the line a little, hatched at its own slant
    const ox = (rnd(d, k, 77 + si) - 0.5) * 1.6, oy = (rnd(d, k, 78 + si) - 0.5) * 1.4;
    const slant = 0.42 + rnd(d, k, 79) * 0.25, phase = rnd(d, k, 80) * 3;
    for (let y = 0; y < MH; y++) {
      for (let x = 0; x < MW; x++) {
        const px = x + 0.5, py = y + 0.5;
        // the felt-tip line: wobbled position, slightly varying width
        const wx = (vnoise(px / 6, py / 6, sd) - 0.5) * 1.7, wy = (vnoise(px / 6, py / 6, sd + 1) - 0.5) * 1.7;
        const [dI] = nearest(segs, px + wx, py + wy);
        const outer = R + (vnoise(px / 4, py / 4, sd + 2) - 0.5) * 0.6;
        const inner = R - 1.8 + (vnoise(px / 4, py / 4, sd + 3) - 0.5) * 0.5;
        if (dI < outer && dI >= inner) { map[y * MW + x] = 4; continue; }
        // the crayon: misregistered, spilling out in places, short of the line in others
        const fx = px - ox + (vnoise(px / 5, py / 5, sd + 4) - 0.5) * 1.2, fy = py - oy + (vnoise(px / 5, py / 5, sd + 5) - 0.5) * 1.2;
        const [dF] = nearest(segs, fx, fy);
        const edge = R - 1.3 + (vnoise(px / 7, py / 7, sd + 6) - 0.38) * 3.6;
        if (dF >= edge) continue;
        const h = px * slant + py + (vnoise(px / 9, py / 9, sd + 7) - 0.5) * 2.6 + phase;
        const f = ((h % 3) + 3) % 3;
        const r = rnd(x * 131 + y, k, sd);
        if (f < 1.95) map[y * MW + x] = edge - dF < 1.3 ? 3 : r < 0.14 ? 1 : 2;
        else if (r < 0.4) map[y * MW + x] = 1;
      }
    }
    maps.push(map);
  }

  // ranks: writing path for the ink (0..255), a hashed order for the crayon
  const path = new Uint8Array(MW * MH), fill = new Uint8Array(MW * MH);
  const dist = new Float32Array(MW * MH);
  for (let y = 0; y < MH; y++) {
    for (let x = 0; x < MW; x++) {
      const [dd, s] = nearest(segs, x + 0.5, y + 0.5);
      dist[y * MW + x] = dd;
      path[y * MW + x] = Math.min(255, Math.floor(s * 256));
      fill[y * MW + x] = hash(x, y, d * 7 + si) & 255;
    }
  }
  // anchors
  const f = FEAT[d];
  const topAt = (x) => { for (let y = 0; y < MH; y++) if (dist[y * MW + x] < R) return y; return M; };
  const botAt = (x) => { for (let y = MH - 1; y >= 0; y--) if (dist[y * MW + x] < R) return y; return MH - M; };
  const clampX = (x) => Math.max(0, Math.min(MW - 1, Math.round(x)));
  const eyes = f.eyes.map(([u, s]) => {
    const x = X(u);
    return { x, y: topAt(clampX(x)) + 1.2, r: size.eyeR * s };
  });
  const mouth = { x: X(f.mouth[0]), y: Y(f.mouth[1]), w: Math.max(4, Math.round(f.mouth[2] * W)) };
  const hips = f.hips.map((u) => { const x = X(u); return { x, y: botAt(clampX(x)) - 1 }; });
  const hat = { x: X(f.hat), y: topAt(clampX(X(f.hat))) };
  // the body's own bottom row, so the legs know where the ground starts
  let bottom = 0, top = MH;
  for (let i = 0; i < MW * MH; i++) if (dist[i] < R) { const y = (i / MW) | 0; if (y > bottom) bottom = y; if (y < top) top = y; }
  // the writing path sampled at 65 points, for the pen that inks it
  const pen = new Float32Array(130);
  for (let q = 0; q <= 64; q++) {
    const sq = q / 64;
    let sg = segs[segs.length - 1];
    for (const sgm of segs) if (sq <= sgm[5]) { sg = sgm; break; }
    const tt = sg[5] > sg[4] ? (sq - sg[4]) / (sg[5] - sg[4]) : 0;
    pen[q * 2] = sg[0] + (sg[2] - sg[0]) * tt; pen[q * 2 + 1] = sg[1] + (sg[3] - sg[1]) * tt;
  }
  const tops = Int16Array.from({ length: MW }, (_, x) => topAt(x));
  return { MW, MH, maps, path, fill, eyes, mouth, hips, hat, bottom, top, tops, pen };
}

/** GLYPHS[size][digit] */
export const GLYPHS = SIZES.map((size, si) => Array.from({ length: 10 }, (_, d) => buildDigit(size, d, si)));

// ------------------------------------------------------------ the scribble-out

/**
 * A felt-tip scribble over a body box: loops whose centre sweeps the box
 * three times (down, up, down), so it darkens evenly rather than top first.
 * Each byte is the moment (1..255) the pen passes; 0 is never inked.
 */
function buildScribble(w, h, seed) {
  const map = new Uint8Array(w * h);
  const N = 1600, loops = 21;
  for (let i = 0; i < N; i++) {
    const t = i / N;
    const pass = Math.min(2, Math.floor(t * 3)), tp = t * 3 - pass;
    const vy = pass === 1 ? 1 - tp : tp;
    const cx = w / 2 + Math.sin(t * Math.PI * 2 * 4.3 + seed) * w * 0.26;
    const cy = 3 + vy * (h - 6);
    const a = t * Math.PI * 2 * loops;
    const rr = w * (0.2 + 0.08 * Math.sin(t * 37 + seed));
    const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr * 1.15;
    const v = 1 + Math.floor(t * 254);
    for (let dy = 0; dy <= 1; dy++) {
      for (let dx = 0; dx <= 1; dx++) {
        const x = Math.floor(px - 0.5) + dx, y = Math.floor(py - 0.5) + dy;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const j = y * w + x;
        if (!map[j] || map[j] > v) map[j] = v;
      }
    }
  }
  return map;
}

export const SCRIBBLE = SIZES.map((s, i) => ({ w: s.W + 4, h: s.H + 4, map: buildScribble(s.W + 4, s.H + 4, 1.7 + i) }));
