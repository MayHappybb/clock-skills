// dollclaw: the plush prize numerals.
//
// Each numeral is a stuffed felt toy: a fat rounded tube sewn along a
// skeleton, with a darker seam edge, a dashed running stitch just inside
// it, a pale nap on the upper-left rim, a few fuzz flecks and the same
// lavender sewn-in tag the puppy has. The shapes are distance fields from
// hand-drawn skeletons, sampled once per (digit, size, colour) into a
// sprite; frames only blit them (the firmware keeps them as small
// palette sprites).

import { mix, rand } from '../js/kit.js';

export const DW = 18, DH = 25;          // a numeral at rest
const R = 3.35;                          // tube radius (a 6.7 px stroke)
export const TAG = 0x9a7ad8;             // the sewn-in tag lavender (sampled off the puppy)

// Skeletons in a DW x DH box: lists of polylines; `arc(cx, cy, rx, ry, a0, a1)`
// gives points along an ellipse (clock angles in turns, 0 = top, clockwise).
function arc(cx, cy, rx, ry, a0, a1, n = 18) {
  const p = [];
  for (let i = 0; i <= n; i++) {
    const a = (a0 + (a1 - a0) * (i / n)) * Math.PI * 2;
    p.push([cx + rx * Math.sin(a), cy - ry * Math.cos(a)]);
  }
  return p;
}
const L = 3.5, Rt = 14.5, T = 3.5, B = 21.5, M = 12.5, C = 9;
const SKEL = {
  0: [arc(C, M, 5.4, 9.0, 0, 1, 28)],
  1: [[[10.2, T - 0.2], [10.2, B]], [[10.2, T - 0.2], [5.2, 7.6]]],
  2: [[...arc(C, 8.2, 5.4, 4.8, -0.23, 0.30, 12), [3.8, B], [Rt, B]]],
  3: [arc(C, 7.8, 5.0, 4.4, -0.22, 0.47, 14), arc(C, 16.6, 5.6, 5.0, 0.03, 0.72, 14)],
  4: [[[11.8, T - 0.3], [3.4, 15.6], [Rt + 0.3, 15.6]], [[11.8, T - 0.3], [11.8, B]]],
  5: [[[Rt - 0.3, T], [4.3, T], [4.0, 11.0]], [[4.0, 11.0], ...arc(8.6, 15.6, 5.6, 5.9, -0.14, 0.62, 16)]],
  6: [[[12.8, T + 0.2], ...arc(C + 1.0, 16.2, 6.4, 12.4, -0.03, -0.21, 6).slice(1)], arc(C, 16.0, 5.4, 5.4, 0, 1, 22)],
  7: [[[L - 0.2, T], [Rt + 0.2, T], [6.6, B]]],
  8: [arc(C, 7.6, 4.5, 4.1, 0, 1, 20), arc(C, 16.6, 5.4, 4.9, 0, 1, 22)],
  9: [arc(C, 9.0, 5.4, 5.4, 0, 1, 22), [[14.4, 9.6], ...arc(C - 1.0, 8.8, 6.4, 12.4, 0.22, 0.47, 6).slice(1)]],
};

function segD(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let u = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  u = u < 0 ? 0 : u > 1 ? 1 : u;
  const ex = px - ax - u * dx, ey = py - ay - u * dy;
  return Math.sqrt(ex * ex + ey * ey);
}

// Distance to a digit's skeleton at (x, y) in rest-box units.
const FIELD = new Map();
function field(d) {
  if (FIELD.has(d)) return FIELD.get(d);
  const S = 4, W = DW * S, H = DH * S, f = new Float32Array(W * H);
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      const x = (i + 0.5) / S, y = (j + 0.5) / S;
      let m = 1e9;
      for (const line of SKEL[d])
        for (let k = 1; k < line.length; k++) m = Math.min(m, segD(x, y, line[k - 1][0], line[k - 1][1], line[k][0], line[k][1]));
      f[j * W + i] = m;
    }
  const o = { f, W, H, S };
  FIELD.set(d, o);
  return o;
}
function sample(F, x, y) {
  const i = Math.floor(x * F.S), j = Math.floor(y * F.S);
  if (i < 0 || j < 0 || i >= F.W || j >= F.H) return 1e9;
  return F.f[j * F.W + i];
}

/**
 * The numeral `d` as a sprite of w x h pixels (a squashed or stretched
 * plush: the distance field is sampled with the box scaled), in felt
 * colour `c`. Cached.
 */
const SPR = new Map();
export function plushSprite(d, c, w = DW, h = DH) {
  const key = `${d}|${c}|${w}|${h}`;
  if (SPR.has(key)) return SPR.get(key);
  const F = field(d);
  const edge = mix(c, 0x1a0f24, 0.5), stitch = mix(c, 0xffffff, 0.62), nap = mix(c, 0xffffff, 0.3), shade = mix(c, 0x2a1030, 0.22);
  const W2 = w + 2;                      // two spare columns for the tag
  const data = new Int32Array(W2 * h).fill(-1);
  const sx = DW / w, sy = DH / h;
  const at = (x, y) => sample(F, (x + 0.5) * sx, (y + 0.5) * sy);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = at(x, y);
      if (v > R) continue;
      let col = c;
      if (v > R - 1.0) col = edge;
      else if (v > R - 2.0 && v <= R - 1.0) {
        // running stitch: 2 on, 1 off along the seam
        col = (x * 7 + y * 5) % 3 !== 0 ? stitch : c;
      } else if (at(x - 1, y - 1) > R - 1.0) col = nap;
      else if (at(x + 1, y + 2) > R - 0.6) col = shade;
      if (col === c && rand(d * 131 + x, y, 7) < 0.05) col = nap;   // felt fuzz
      data[y * W2 + x] = col;
    }
  // the tag: a little lavender loop sewn into the right-hand seam, low down
  const ty = Math.round(h * 0.72);
  for (let x = w - 1; x >= 0; x--) {
    if (data[ty * W2 + x] !== -1) {
      for (let k = 1; k <= 2; k++) {
        data[ty * W2 + x + k] = TAG;
        if (ty + 1 < h) data[(ty + 1) * W2 + x + k] = mix(TAG, 0x000000, 0.25);
      }
      break;
    }
  }
  const s = { w: W2, h, data };
  SPR.set(key, s);
  return s;
}

/** Felt colours of the numerals, one per value, so a swapped prize is visibly a new toy. */
export const FELT = [0x5cc8f2, 0xffd23a, 0x7fe3a2, 0xff9440, 0xc4ec50, 0x5cc8f2, 0xffd23a, 0x7fe3a2, 0xff9440, 0xc4ec50];
