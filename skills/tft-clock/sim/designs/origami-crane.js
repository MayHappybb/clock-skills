// Origami: the hour's crane. A square of gold paper slides in above the
// minutes, is folded on its diagonal and folded in half again (real simple
// folds: each the projection of a rotation about the crease), turned so its
// long edge is on top, then opens: the neck and tail swing up out of the
// packet on arcs, the wings rise on their hinge, and it flies off to the
// left, flapping, climbing and growing smaller into the distance, above the
// numerals. A handful of hard polygons per frame.

import { sin, cos } from '../js/kit.js';

const PI = Math.PI;
const sm = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const sm5 = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * x * (x * (x * 6 - 15) + 10));
const prog = (v, a, b) => (v <= a ? 0 : v >= b ? 1 : (v - a) / (b - a));

/**
 * Rotate the part of each polygon on the +n side of the line through P
 * (unit normal n) by angle a about that line, seen from above: the distance
 * across the crease scales by cos a, and the face flips past 90 degrees.
 * The moving part comes last (it is on top).
 */
function fold(polys, P, n, a) {
  const ca = cos(a), still = [], moved = [];
  for (const p of polys) {
    const keep = [], mov = [], pts = p.pts;
    for (let i = 0; i < pts.length; i++) {
      const A = pts[i], B = pts[(i + 1) % pts.length];
      const da = (A[0] - P[0]) * n[0] + (A[1] - P[1]) * n[1], db = (B[0] - P[0]) * n[0] + (B[1] - P[1]) * n[1];
      if (da <= 0) keep.push(A);
      if (da >= 0) mov.push([A[0] - n[0] * da * (1 - ca), A[1] - n[1] * da * (1 - ca)]);
      if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
        const u = da / (da - db), X = [A[0] + (B[0] - A[0]) * u, A[1] + (B[1] - A[1]) * u];
        keep.push(X); mov.push(X);
      }
    }
    if (keep.length >= 3) still.push({ pts: keep, back: p.back, lit: p.lit });
    if (mov.length >= 3) moved.push({ pts: mov, back: ca < 0 ? !p.back : p.back, lit: Math.abs(ca) });
  }
  return still.concat(moved);
}

const HALF = 11, CX = 124, CY = 13;            // the square: 22 x 22, centred above the minutes
export const CRANE_T = 9.6;                     // seconds the show lasts

/**
 * The crane at show time t (s). Returns { polys, shadow } in screen
 * coordinates (each poly: pts, back = reverse side up, lit = 0..1 how square
 * it faces the viewer), or null when it is not on the glass.
 */
const S = Math.SQRT1_2;

/**
 * The sheet waiting for the hour, lying above the minutes: its top-right
 * corner lifts on the beat (`lift` 0..1, a turn of up to ~75 degrees about a
 * short diagonal crease), as paper does in a draught. `dx` slides it.
 */
export function waiting(lift, dx = 0, drift = 0) {
  const cx = CX + dx + drift, cy = CY - Math.abs(drift) * 0.4, h = HALF;
  const sq = [{ pts: [[cx - h, cy - h], [cx + h, cy - h], [cx + h, cy + h], [cx - h, cy + h]], back: false, lit: 1 }];
  // the crane's crease pattern, pressed in: diagonals, midlines and the bird base's inner diamond
  const k = h * 0.414, hi = h - 0.6, cp0 = [
    [cx - h, cy - h, cx + h, cy + h], [cx + h, cy - h, cx - h, cy + h], [cx - h, cy, cx + h, cy], [cx, cy - h, cx, cy + h],
    [cx - k, cy - h, cx, cy], [cx + k, cy - h, cx, cy], [cx - k, cy + h, cx, cy], [cx + k, cy + h, cx, cy],
  ];
  const cl = (v, c0) => Math.max(c0 - hi, Math.min(c0 + hi, v));
  const cp = cp0.map(([a, b, c2, d]) => [cl(a, cx), cl(b, cy), cl(c2, cx), cl(d, cy)]);
  const P = [cx + h - 9, cy - h], n = [S, -S];
  // the corner that lifts carries no creases over the table: clip them to the side that stays
  const keep = (x, y) => (x - P[0]) * n[0] + (y - P[1]) * n[1] <= 0;
  const lines = [];
  for (const [x0, y0, x1, y1] of cp) {
    const d0 = (x0 - P[0]) * n[0] + (y0 - P[1]) * n[1], d1 = (x1 - P[0]) * n[0] + (y1 - P[1]) * n[1];
    if (lift > 0 && d0 > 0 && d1 > 0) continue;
    if (lift > 0 && (d0 > 0) !== (d1 > 0)) {
      const u = d0 / (d0 - d1), X = x0 + (x1 - x0) * u, Y = y0 + (y1 - y0) * u;
      lines.push(keep(x0, y0) ? [x0, y0, X, Y] : [X, Y, x1, y1]);
    } else lines.push([x0, y0, x1, y1]);
  }
  if (lift <= 0) return { polys: sq, shadow: 1.5, lines, linesAfter: 1 };
  return { polys: fold(sq, P, n, 1.45 * lift), shadow: 1.5 + 1.5 * lift, lines, linesAfter: 1 };
}

export function crane(t) {
  if (t < 0 || t > CRANE_T) return null;
  if (t < 2.9) {
    const cx = CX, cy = CY;
    const h = HALF;
    let polys = [{ pts: [[cx - h, cy - h], [cx + h, cy - h], [cx + h, cy + h], [cx - h, cy + h]], back: false, lit: 1 }];
    const f1 = sm5(prog(t, 1.15, 1.95)), f2 = sm5(prog(t, 2.05, 2.8));
    // 1: the top-right half over onto the bottom-left, on the diagonal
    if (f1 > 0) polys = fold(polys, [cx, cy], [S, -S], PI * f1);
    // 2: that triangle in half, on the line from the bottom-left corner through the centre
    if (f2 > 0) polys = fold(polys, [cx, cy], [S, S], PI * f2);
    const up = 4 * f1 * (1 - f1) + 4 * f2 * (1 - f2);
    return { polys, shadow: 1.5 + 2 * up };
  }
  // the packet is a right triangle (long edge on the left); it is turned a
  // quarter clockwise so the long edge lies on top, apex down: the body
  const turn = sm5(prog(t, 2.9, 3.5)) * PI / 2;
  const open = sm5(prog(t, 3.5, 4.4)), wingsUp = sm5(prog(t, 3.75, 4.6));
  // flight: off to the left, climbing, smaller with distance
  const fl = prog(t, 4.5, CRANE_T), fe = fl * fl * (3 - 2 * fl) * 0.45 + fl * 0.55;
  const sc = 1 - 0.5 * sm(fl * 1.4);
  const flapT = Math.max(0, t - 4.5);
  const bob = 1.6 * sin(flapT * 2 * PI * 1.6 - PI) * sm(prog(t, 4.5, 5.2));
  // the packet's own centroid before the turn, and where the body flies
  const gx = CX - (2 * HALF) / 3, gy = CY;
  const px = gx - 175 * fe, py = gy - 2 - 11 * sm(fl * 1.6) + bob * sc;
  const ct = cos(turn), st = sin(turn);
  // local frame: the body's long edge centred at (0, 0) once turned
  const P = (x, y) => [px + sc * x, py + sc * y];
  const R = (x, y) => {
    // packet coordinates (before the turn) relative to its centroid, turned
    return P(x * ct - y * st, x * st + y * ct);
  };
  const out = [];
  // the body: hypotenuse on the left of the packet, apex at the square's centre
  const ax = -HALF / 3, apx = (2 * HALF) / 3;
  const body = [R(ax, -HALF), R(ax, HALF), R(apx, 0)];
  if (open <= 0) return { polys: [{ pts: body, back: false, lit: 1 }], shadow: 1.5 };
  // once turned, the long edge runs from (-HALF, ex) to (HALF, ex) with the apex below
  const ey = ax;                                                // the edge's offset from the centroid, turned onto the top
  const E = (x, y) => P(x, y + ey);
  // neck and tail: thin flaps lying along the top edge inside the body, swinging up and out on arcs
  const ra = (pv, len, wdt, a0, a1) => {
    const a = a0 + (a1 - a0) * open, ca = Math.cos(a), sa = Math.sin(a);
    const base = [pv[0] - sa * wdt * 0.5, pv[1] + ca * wdt * 0.5], tip = [pv[0] + ca * len, pv[1] + sa * len];
    return { base, tip, a, pts: [E(pv[0], pv[1]), E(base[0], base[1]), E(tip[0], tip[1])] };
  };
  const neck = ra([-HALF + 1.5, 0.4], 13, 3.4, 0, -2.25), tail = ra([HALF - 1.5, 0.4], 12, 3.4, PI, PI + 2.15);
  // the head: a small tip bent forward and down off the end of the neck
  const ha = neck.a - 1.9, hx = neck.tip[0], hy = neck.tip[1];
  const head = [E(hx, hy), E(hx + Math.cos(neck.a) * -1.2, hy + Math.sin(neck.a) * -1.2 + 1), E(hx + Math.cos(ha) * 4, hy + Math.sin(ha) * 4)];
  // the wings: hinged on the top edge, rising out of the edge-on, then flapping
  const wingPh = PI / 2 - wingsUp * (PI / 2 - 0.32);
  const wing = (ox, len, lag, far) => {
    const ph = wingsUp < 1 ? wingPh : 0.32 + 1.6 * (0.5 + 0.5 * sin((flapT - lag) * 2 * PI * 1.6 - PI / 2)) * sm(prog(t, 4.5, 4.8));
    const hgt = -len * Math.cos(ph);
    return { pts: [E(-6 + ox, 0), E(6 + ox, 0), E(3 + ox, hgt), E(-3 + ox, hgt * 1.08)], back: hgt > 0, lit: far ? 0.55 : Math.abs(Math.cos(ph)) * 0.6 + 0.5 };
  };
  out.push(wing(-2, 12.5, 0.06, true));
  out.push({ pts: neck.pts, back: true, lit: 0.85 }, { pts: tail.pts, back: true, lit: 0.85 }, { pts: head, back: false, lit: 1 });
  out.push({ pts: [E(-HALF, 0), E(HALF, 0), E(0, HALF)], back: false, lit: 1 });
  out.push(wing(1, 13.5, 0, false));
  return { polys: out, shadow: 3 + 3 * wingsUp };
}
