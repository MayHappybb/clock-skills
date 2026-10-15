// The ten numerals of "seachart": each digit is ONE sea serpent, its body
// laid along the digit's pen path from the tail (path start) to the head
// (path end). The paths are drawn in a 24 x 48 design box (centre lines,
// inset for the stroke) with lines and cubic curves, flattened, softened at
// the corners and resampled at 1 px for each size the face shows.
//
// Where the head goes is part of the letterform: a 1 rears with its head as
// the flag, a 4 and a 9 plunge head-down at the foot of the stem, a 5 and a
// 7 reach along their top bars, a 0 and an 8 bite their own tails on their
// right flanks (ouroboros), a 2, a 3 and a 6 curl their heads in at the end
// of the stroke. Every head end runs straight for ~8 px so the head reads.
//
// At load, per size and digit, a distance table over the glyph's box: for
// each pixel the arc position of the strand it belongs to (quarter px) and
// its signed distance from that strand's centre line (quarter px, the sign
// telling the side). Where two strands cross (4, 6, 8, 9, and the tail
// bitten by the head) the later one is on top: a pixel within reach of it
// belongs to it. The face then draws the body per frame from these two
// numbers alone, so the body can undulate and swell by moving thresholds.
//
// Flash: 2 sizes x 10 digits, a padded box each (~44 x 72 hours, ~36 x 58
// minutes) at 3 bytes a pixel (uint16 arc + int8 offset): ~205 KB, plus the
// centre lines and tangents as 16-bit fixed point (~6 KB).

const P = {
  // ouroboros: tail on the right flank going up, round anticlockwise, head
  // comes up the right flank and bites it
  0: [['M', 21.6, 26], ['C', 21.6, 10, 17.6, 2.4, 12, 2.4], ['C', 6.4, 2.4, 2.4, 10, 2.4, 24],
    ['C', 2.4, 38, 6.4, 45.6, 12, 45.6], ['C', 17.6, 45.6, 21.6, 38, 21.6, 25]],
  // foot -> up the stem -> the head is the flag, bent down to the left
  1: [['M', 14.5, 45.8], ['L', 14.5, 5], ['C', 14.5, 3, 13.2, 2.2, 11.6, 3.4], ['L', 4.2, 10.6]],
  // tail at the base's right end -> base -> diagonal -> over the top -> head down the hook
  2: [['M', 22, 45.6], ['L', 2.6, 45.6], ['C', 9, 37, 21, 26, 21, 13], ['C', 21, 6, 17, 2.4, 12, 2.4],
    ['C', 7.6, 2.4, 4.4, 4.6, 2.8, 8.4], ['L', 1.6, 14.6]],
  // tail bottom-left -> lower bowl -> waist -> upper bowl -> head bottom-left of the top
  3: [['M', 1.6, 37.5], ['C', 2.6, 42.8, 6.6, 45.6, 11.6, 45.6], ['C', 18, 45.6, 22, 41, 22, 34.5],
    ['C', 22, 27.6, 17.4, 23.4, 10, 23.4], ['C', 16.8, 23.4, 20.8, 19, 20.8, 12.4],
    ['C', 20.8, 6.2, 16.8, 2.4, 11.4, 2.4], ['C', 7.4, 2.4, 4.6, 4.4, 3, 7.4], ['L', 1.4, 12.6]],
  // tail at the bar's right end -> bar -> up the diagonal -> head plunging down the stem
  4: [['M', 23, 33], ['L', 1.6, 33], ['L', 15.2, 2.2], ['L', 15.2, 46.4]],
  // tail at the bowl's end -> bowl -> up the left -> head reaching right along the top bar
  5: [['M', 1.6, 39.5], ['C', 3, 43.6, 6.6, 45.6, 11, 45.6], ['C', 17.8, 45.6, 22, 40.4, 22, 32.6],
    ['C', 22, 24.4, 17.6, 19.6, 11.6, 19.6], ['C', 8.2, 19.6, 5.4, 20.6, 3.6, 22.4],
    ['L', 4.4, 2.6], ['L', 22.4, 2.6]],
  // tail is the top hairline -> down the left -> round the loop -> head bites the stem
  6: [['M', 20.6, 6.4], ['C', 18.6, 3.6, 15.6, 2.4, 12.4, 2.4], ['C', 5.6, 2.4, 2.4, 11, 2.4, 27],
    ['C', 2.4, 40, 6.4, 45.6, 12, 45.6], ['C', 17.8, 45.6, 21.6, 41, 21.6, 34.6],
    ['C', 21.6, 28, 17.6, 23.6, 12, 23.6], ['C', 9, 23.6, 6.4, 24.8, 4.2, 27.2]],
  // tail at the foot -> up the diagonal -> head reaching left along the top bar
  7: [['M', 7.6, 46], ['C', 9.6, 30, 14, 15, 21.6, 2.6], ['L', 1.6, 2.6]],
  // ouroboros: tail on the upper right flank going up, over the top, down
  // through the waist, round the lower loop, back through the waist and
  // up the right flank to bite it
  8: [['M', 20.4, 13.4], ['C', 20.4, 6.4, 16.6, 2.4, 12, 2.4], ['C', 7.4, 2.4, 3.6, 6.4, 3.6, 12],
    ['C', 3.6, 18.4, 8, 21.4, 12, 23.2], ['C', 17, 25.4, 22, 29, 22, 35.4],
    ['C', 22, 41.8, 17.6, 45.6, 12, 45.6], ['C', 6.4, 45.6, 2, 41.8, 2, 35.4],
    ['C', 2, 29, 7, 25.4, 12, 23.2], ['C', 16, 21.4, 20.4, 18.8, 20.4, 12.6]],
  // tail at the bowl's join -> round the bowl -> head plunging down the stem
  9: [['M', 20.8, 21.4], ['C', 18.4, 23.6, 15.4, 24.6, 12, 24.6], ['C', 6.2, 24.6, 2.4, 20, 2.4, 13.4],
    ['C', 2.4, 7, 6.2, 2.4, 12, 2.4], ['C', 18.6, 2.4, 21.6, 8.4, 21.6, 20],
    ['C', 21.6, 30, 20, 38, 15.4, 45.6]],
};

function flatten(cmds, sx, sy) {
  const pts = [];
  let cx = 0, cy = 0;
  for (const c of cmds) {
    if (c[0] === 'M') { cx = c[1]; cy = c[2]; pts.push([cx * sx, cy * sy]); }
    else if (c[0] === 'L') {
      const n = Math.max(2, Math.ceil(Math.hypot((c[1] - cx) * sx, (c[2] - cy) * sy) * 4));
      for (let i = 1; i <= n; i++) pts.push([(cx + (c[1] - cx) * (i / n)) * sx, (cy + (c[2] - cy) * (i / n)) * sy]);
      cx = c[1]; cy = c[2];
    } else {
      const [, x1, y1, x2, y2, x3, y3] = c;
      for (let i = 1; i <= 64; i++) {
        const t = i / 64, u = 1 - t;
        pts.push([(u * u * u * cx + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3) * sx,
          (u * u * u * cy + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3) * sy]);
      }
      cx = x3; cy = y3;
    }
  }
  return pts;
}

function resample(pts, step) {
  const out = [pts[0]];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    let [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    let seg = Math.hypot(bx - ax, by - ay);
    while (acc + seg >= step) {
      const u = (step - acc) / seg;
      ax += (bx - ax) * u; ay += (by - ay) * u;
      out.push([ax, ay]);
      seg = Math.hypot(bx - ax, by - ay); acc = 0;
    }
    acc += seg;
  }
  const last = pts[pts.length - 1], o = out[out.length - 1];
  if (Math.hypot(last[0] - o[0], last[1] - o[1]) > step * 0.4) out.push(last);
  return out;
}

function soften(pts, k) {
  const n = pts.length, out = [];
  for (let i = 0; i < n; i++) {
    const w = Math.min(k, i, n - 1 - i);
    let sx = 0, sy = 0, c = 0;
    for (let j = -w; j <= w; j++) { sx += pts[i + j][0]; sy += pts[i + j][1]; c++; }
    out.push([sx / c, sy / c]);
  }
  return out;
}

export const NONE = 0xffff;

/**
 * The serpent's radius at arc position s (px) of a path of length L, for a
 * body radius r: a tapering tail, the body, a slim neck, a broad head and a
 * blunt snout. HEAD is how far back from the tip the head zone runs.
 */
export const HEAD = 11, TAIL = 11;
export function profile(s, L, r) {
  let k = 1;
  if (s < TAIL) { const u = s / TAIL; k = 0.32 + 0.68 * u * (2 - u); }
  const u = L - s;
  if (u < 4.5) k = 0.62 + 0.72 * Math.sqrt(u / 4.5);          // snout up to the widest at the eyes
  else if (u < 7.5) k = 1.34 - 0.42 * ((u - 4.5) / 3);         // back of the head to the neck
  else if (u < HEAD) k = 0.92 + 0.08 * ((u - 7.5) / 3.5);      // neck into the body
  return r * k;
}

/**
 * One glyph at a size: centre line, its length, and the distance table over
 * a padded box. `ox, oy` is where the table's (0,0) sits relative to the
 * glyph box's top-left; tw x th its size.
 */
function build(d, w, h, r) {
  const sx = w / 24, sy = h / 48;
  let pts = resample(flatten(P[d], sx, sy), 0.25);
  pts = soften(soften(pts, 5), 5);
  pts = resample(pts, 1);
  const n = pts.length;
  const x = new Float32Array(n), y = new Float32Array(n), tx = new Float32Array(n), ty = new Float32Array(n);
  for (let i = 0; i < n; i++) { x[i] = pts[i][0]; y[i] = pts[i][1]; }
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 2), b = Math.min(n - 1, i + 2);
    const dx = x[b] - x[a], dy = y[b] - y[a], l = Math.hypot(dx, dy) || 1;
    tx[i] = dx / l; ty[i] = dy / l;
  }
  const L = n - 1;
  const PAD = Math.ceil(r * 1.4) + 5;
  const ox = -PAD, oy = -PAD, tw = Math.ceil(w) + 2 * PAD, th = Math.ceil(h) + 2 * PAD;
  const S = new Uint16Array(tw * th).fill(NONE), O = new Int8Array(tw * th);
  const reach = (i) => profile(i, L, r) + 1.8;
  const win = 4 * r + 6, dd = new Float32Array(n);
  for (let j = 0; j < th; j++)
    for (let i = 0; i < tw; i++) {
      const px = ox + i + 0.5, py = oy + j + 0.5;
      let best = 1e9, bi = -1, smax = -1;
      for (let k = 0; k < n; k++) {
        const ex = px - x[k], ey = py - y[k], e = Math.hypot(ex, ey);
        dd[k] = e;
        if (e < best) { best = e; bi = k; }
        if (e < reach(k) && k > smax) smax = k;
      }
      if (smax >= 0) {
        // the topmost strand within reach: its nearest sample
        best = 1e9;
        for (let k = Math.max(0, Math.floor(smax - win)); k <= smax; k++) if (dd[k] < best) { best = dd[k]; bi = k; }
      }
      if (best > r * 1.4 + 4.5) continue;
      const ex = px - x[bi], ey = py - y[bi];
      const along = ex * tx[bi] + ey * ty[bi], side = -ex * ty[bi] + ey * tx[bi];
      const sp = Math.max(0, Math.min(L, bi + along));
      S[j * tw + i] = Math.round(sp * 4);
      O[j * tw + i] = Math.round((side < 0 ? -best : best) * 4);
    }
  // the head: where its eye sits (the side whose normal looks up, or out)
  const hi = Math.max(0, L - 5), nx = -ty[hi], ny = tx[hi];
  let eye = ny < -0.3 ? 1 : ny > 0.3 ? -1 : (nx * (x[hi] - w / 2) > 0 ? 1 : -1);
  const prof = Float32Array.from({ length: n }, (_, i) => profile(i, L, r));
  return { d, n, L, x, y, tx, ty, r, ox, oy, tw, th, S, O, eye, prof };
}

/** GLYPHS[size][digit]: size 0 the hours, 1 the minutes. */
export const SIZES = [{ w: 28, h: 56, r: 3.1 }, { w: 22, h: 42, r: 2.5 }];
export const GLYPHS = SIZES.map(({ w, h, r }) => Array.from({ length: 10 }, (_, d) => build(d, w, h, r)));
/** Visual widths: a 1 is narrow and set to the right of its box. */
export const WIDTH = (size, d) => SIZES[size].w;
