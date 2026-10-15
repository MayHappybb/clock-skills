// Playbook's numerals: ten chalk routes, drawn for a 26 x 44 slot.
//
// Each digit is one continuous route, the way a coach chalks a receiver's
// pattern: a single line from the snap to the break, with the play's own
// notation on its end: an arrowhead where the route keeps going (2, 7, 9),
// a block "T" where it stops (1, 4). 0 and 8 are loops the runner circles.
// The coach's hand slants them a little and wobbles every line a fraction
// of a pixel; the chalk is wider where it was pressed.
//
// Built once at load into flash tables, per digit, over a padded 34 x 52 box:
//   SD   signed distance to the chalk's edge, 1/8 px (Int8)
//   U    arc length of the nearest point of the route, px (Uint8; 255 = the
//        notation, which belongs to the route's end)
//   PX, PY  the route's centreline sampled every 1 px of arc length, for the
//        runners (box coordinates, Float32)
// Flash: 10 x 34 x 52 x 2 B = 35 KB of maps, ~10 KB of route samples.

import { noise } from '../js/kit.js';

export const GW = 34, GH = 52, PAD = 4;   // padded glyph box; slot is 26 x 44 inside it
const SLANT = 0.11;                         // the coach's italic: px of x per px of y
const HW = 2.15;                            // chalk half-width (route)
const HW_NOTE = 1.7;                        // notation is drawn lighter

// ---- route builders (slot coordinates, y down; angles in degrees, increasing = clockwise on screen)
function arc(cx, cy, rx, ry, a0, a1) {
  const n = Math.max(4, Math.ceil((Math.abs(a1 - a0) / 360) * 2 * Math.PI * Math.max(rx, ry) / 1.5));
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    out.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return out;
}
function quad(p0, c, p1) {
  const L = Math.hypot(c[0] - p0[0], c[1] - p0[1]) + Math.hypot(p1[0] - c[0], p1[1] - c[1]);
  const n = Math.max(3, Math.ceil(L / 1.5)), out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push([u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]]);
  }
  return out;
}
function line(a, b) {
  const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2)), out = [];
  for (let i = 0; i <= n; i++) out.push([a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n]);
  return out;
}
const join = (...parts) => {
  const out = [];
  for (const p of parts) for (const q of p) {
    const l = out[out.length - 1];
    if (!l || Math.hypot(l[0] - q[0], l[1] - q[1]) > 0.05) out.push(q);
  }
  return out;
};

// ---- the ten routes. `loop`: the runner circles; `note`: notation strokes at the end.
function arrowAt(path, len = 7.5, half = 42) {
  const b = path[path.length - 1];
  let k = path.length - 2;
  while (k > 0 && Math.hypot(b[0] - path[k][0], b[1] - path[k][1]) < 3) k--;
  const a = path[k], dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy);
  const ux = dx / d, uy = dy / d, tip = [b[0] + ux * 2.2, b[1] + uy * 2.2];
  const r = (half * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  const w1 = [tip[0] - len * (ux * c - uy * s), tip[1] - len * (uy * c + ux * s)];
  const w2 = [tip[0] - len * (ux * c + uy * s), tip[1] - len * (uy * c - ux * s)];
  return [[w1, tip], [tip, w2], [b, tip]];
}

const ROUTES = [
  // 0: an out-and-back loop
  () => ({ path: arc(13, 22, 10.3, 19.4, -90, 270), loop: true, note: [] }),
  // 1: a flag, a straight go, and the block at the foot
  () => ({ path: join(line([5.5, 11.5], [14.5, 2.6]), line([14.5, 2.6], [14.5, 41.2])), note: [[[7, 41.6], [22, 41.6]]] }),
  // 2: a hook over the top, a slant, and an out to the right
  () => {
    const p = join(arc(12.8, 12.6, 9.4, 10, 192, 380), quad([21.6, 16], [18.5, 27], [3.4, 41.3]), line([3.4, 41.3], [20.5, 41.3]));
    return { path: p, note: arrowAt(p) };
  },
  // 3: two curls
  () => ({ path: join(arc(12.2, 11.6, 9.4, 9.1, 205, 450), line([12.2, 20.7], [9.6, 21.1]), arc(12, 31.2, 10.4, 10.3, 254, 515)), note: [] }),
  // 4: up the stem, the slant down, the crossbar; blocked at the foot
  () => ({ path: join(line([17.6, 41.2], [17.6, 2.6]), line([17.6, 2.6], [2.6, 29.2]), line([2.6, 29.2], [23.6, 29.2])), note: [[[12.5, 41.6], [22.6, 41.6]]] }),
  // 5: the flag, down, and the big curl
  () => ({ path: join(line([22.4, 2.6], [6.6, 2.6]), line([6.6, 2.6], [5.6, 19.6]), arc(11.6, 29.2, 10.8, 11.8, 235, 505)), note: [] }),
  // 6: a long fade down the left and a curl back
  () => ({ path: join(quad([20.6, 3.2], [4.4, 9], [3.2, 31.2]), arc(13.2, 31.2, 10, 10.3, 180, -150)), note: [] }),
  // 7: across, then the post down, arrow at the end
  () => {
    const p = join(line([3, 2.6], [23, 2.6]), quad([23, 2.6], [15, 19], [9.6, 40.4]));
    return { path: p, note: arrowAt(p) };
  },
  // 8: around the top and around the bottom, through the waist
  () => ({ path: join(arc(13, 11.6, 8.4, 9, 90, 450), arc(13, 31.6, 10.4, 10, 270, -90)), loop: true, note: [] }),
  // 9: the curl first, then the stem down, arrow at the end
  () => {
    const p = join(arc(12.6, 12.8, 9.9, 10.2, 0, -360), quad([22.5, 12.8], [22.8, 32], [17.4, 40.4]));
    return { path: p, note: arrowAt(p) };
  },
];

// ---- the hand: slant and wobble, into padded box coordinates
function hand(pt, d, i) {
  const [x, y] = pt;
  const wx = (noise(i * 0.09 + d * 7.1, 11) - 0.5) * 0.9, wy = (noise(i * 0.09 + d * 3.3, 12) - 0.5) * 0.9;
  return [x + (22 - y) * SLANT + wx + PAD, y + wy + PAD];
}

function segDist2(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const ex = px - ax - t * dx, ey = py - ay - t * dy;
  return [ex * ex + ey * ey, t];
}

function build(d) {
  const r = ROUTES[d]();
  const pts = r.path.map((p, i) => hand(p, d, i));
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const L = cum[cum.length - 1];
  const notes = r.note.map((s) => s.map((p) => { const q = [p[0] + (22 - p[1]) * SLANT + PAD, p[1] + PAD]; return q; }));
  const SD = new Int8Array(GW * GH), U = new Uint8Array(GW * GH);
  for (let y = 0; y < GH; y++)
    for (let x = 0; x < GW; x++) {
      const px = x + 0.5, py = y + 0.5;
      let best = 1e9, bu = 0, bw = HW;
      for (let i = 1; i < pts.length; i++) {
        const [e, t] = segDist2(px, py, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
        if (e < best) { best = e; bu = cum[i - 1] + t * (cum[i] - cum[i - 1]); }
      }
      // pressure: the chalk is a little wider here and there along the route
      bw = HW + (noise(bu / 9, 40 + d) - 0.5) * 0.7;
      let sd = Math.sqrt(best) - bw, isNote = false;
      for (const s of notes) {
        const [e] = segDist2(px, py, s[0][0], s[0][1], s[1][0], s[1][1]);
        const nd = Math.sqrt(e) - HW_NOTE;
        if (nd < sd) { sd = nd; isNote = true; }
      }
      SD[y * GW + x] = Math.max(-127, Math.min(127, Math.round(sd * 8)));
      U[y * GW + x] = isNote ? 255 : Math.min(254, Math.round(bu));
    }
  const n = Math.ceil(L) + 1, PX = new Float32Array(n), PY = new Float32Array(n);
  for (let k = 0, i = 1; k < n; k++) {
    const u = Math.min(L, k);
    while (i < pts.length - 1 && cum[i] < u) i++;
    const t = (u - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
    PX[k] = pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t;
    PY[k] = pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t;
  }
  return { d, SD, U, PX, PY, L, loop: !!r.loop };
}

export const GLYPHS = Array.from({ length: 10 }, (_, d) => build(d));

/** A runner's centre at arc length u along digit d's route (box coordinates). */
export function along(gl, u) {
  if (u < 0) u = 0;
  if (u > gl.L) u = gl.L;
  const k = u | 0, f = u - k, k1 = k + 1 < gl.PX.length ? k + 1 : k;
  return [gl.PX[k] + (gl.PX[k1] - gl.PX[k]) * f, gl.PY[k] + (gl.PY[k1] - gl.PY[k]) * f];
}
