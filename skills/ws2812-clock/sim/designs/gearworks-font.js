// Gearworks letterforms: each digit is a skeleton path, and gears are laid
// along it at exactly their meshing distance (pitch radii touching), so a
// digit is a real gear train. Closed bowls get an EVEN number of gears (an
// odd ring of gears locks solid) and are solved so the ring closes exactly.
//
// Skeletons are in a unit box (u right 0..1, v down 0..1), mapped to the box
// the gear CENTRES may occupy. Primitives:
//   ['L', x1, y1, x2, y2]                 a straight run
//   ['A', cx, cy, rx, ry, a0, a1]         an elliptic arc, degrees, y down (90 = down)
// Stroke options: closed (a bowl), start (place exactly from the start point,
// no centring: for strokes leaving a junction), skip (drop the first gear:
// it is the junction gear already laid by another stroke), big (index list of
// gears, by order along this stroke, that are larger "ball terminal" wheels).

const S = (prims, o = {}) => ({ prims, ...o });

export const SKELETONS = {
  0: [S([['A', 0.5, 0.3, 0.5, 0.3, 180, 360], ['L', 1, 0.3, 1, 0.7], ['A', 0.5, 0.7, 0.5, 0.3, 0, 180], ['L', 0, 0.7, 0, 0.3]], { closed: true })],
  // 1: a tall stem and a long diving flag, no foot (a foot made it a cross / t)
  1: [S([['L', 0.64, 1, 0.64, 0], ['L', 0.64, 0, 0.0, 0.38]], { start: true })],
  2: [S([['A', 0.5, 0.27, 0.5, 0.27, 168, 360], ['A', 0.5, 0.27, 0.5, 0.27, 0, 32], ['L', 0.92, 0.42, 0, 1], ['L', 0, 1, 1.05, 1]], { big: [0] })],
  3: [S([['A', 0.47, 0.25, 0.5, 0.25, 195, 450], ['A', 0.47, 0.745, 0.53, 0.255, 270, 525]], { big: [0, -1] })],
  // 4: the closed, diagonal 4 (the open-top one read as y / h)
  4: [
    S([['L', 0.8, 0, 0.8, 1]], { start: true }),
    S([['L', 0.8, 0, -0.1, 0.8], ['L', -0.1, 0.8, 1.06, 0.8]], { start: true, thin: true }),
  ],
  5: [S([['L', 1.02, 0, 0.04, 0], ['L', 0.04, 0, 0.02, 0.44], ['A', 0.46, 0.7, 0.54, 0.3, 240, 515]], { big: [0, -1] })],
  6: [S([['A', 0.55, 0.62, 0.5, 0.62, 300, 180], ['A', 0.5, 0.7, 0.5, 0.3, 180, -175]], { big: [0] })],
  7: [S([['L', 0, 0, 1.02, 0], ['L', 1.02, 0, 0.32, 1]], { big: [-1] })],
  8: [
    S([['A', 0.5, 0.725, 0.5, 0.275, 270, 630]], { closed: true }),
    S([['A', 0.5, 0.225, 0.44, 0.225, 90, 450]], { closed: true }),
  ],
  9: null, // the 6 turned upside down, below
};
// 9 is 6 rotated half a turn, as in most faces.
SKELETONS[9] = SKELETONS[6].map((st) => ({
  ...st,
  prims: st.prims.map((p) => (p[0] === 'L'
    ? ['L', 1 - p[1], 1 - p[2], 1 - p[3], 1 - p[4]]
    : ['A', 1 - p[1], 1 - p[2], p[3], p[4], p[5] + 180, p[6] + 180])),
}));

/** Dense polyline (pixel space) for one stroke. */
function densify(st, box) {
  const pts = [];
  const map = (u, v) => [box.x + u * box.w, box.y + v * box.h];
  for (const p of st.prims) {
    if (p[0] === 'L') {
      const [ax, ay] = map(p[1], p[2]), [bx, by] = map(p[3], p[4]);
      const n = Math.max(2, Math.ceil(Math.hypot(bx - ax, by - ay) / 0.05));
      for (let k = 0; k <= n; k++) pts.push([ax + (bx - ax) * k / n, ay + (by - ay) * k / n]);
    } else {
      const [, cx, cy, rx, ry, a0, a1] = p;
      const len = Math.abs(a1 - a0) * Math.PI / 180 * Math.max(rx * box.w, ry * box.h);
      const n = Math.max(2, Math.ceil(len / 0.05));
      for (let k = 0; k <= n; k++) {
        const a = (a0 + (a1 - a0) * k / n) * Math.PI / 180;
        pts.push(map(cx + rx * Math.cos(a), cy + ry * Math.sin(a)));
      }
    }
  }
  // cumulative arc length
  const s = [0];
  for (let k = 1; k < pts.length; k++) s.push(s[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
  return { pts, s, L: s[s.length - 1] };
}

/** Point and unit tangent at arc length t on polyline P. */
function at(P, t) {
  const s = P.s;
  let lo = 0, hi = s.length - 1;
  t = Math.max(0, Math.min(P.L, t));
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (s[m] <= t) lo = m; else hi = m; }
  const a = P.pts[lo], b = P.pts[Math.min(lo + 1, s.length - 1)], L = s[hi] - s[lo] || 1, f = (t - s[lo]) / L;
  // tangent over a wider window, so corners blend
  const a2 = P.pts[Math.max(0, lo - 20)], b2 = P.pts[Math.min(s.length - 1, lo + 20)];
  const tx = b2[0] - a2[0], ty = b2[1] - a2[1], tl = Math.hypot(tx, ty) || 1;
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, tx / tl, ty / tl];
}

/**
 * Wheels along P by arc length, each sized by its stroke direction (a
 * Didone stress: vertical runs are big wheels, horizontal runs small
 * pinions), spaced r_i + r_j apart scaled by k. Returns [{x, y, n}].
 */
function lay(P, t0, k, size, maxN = 99, closed = false) {
  const out = [];
  let t = t0, [x, y, , ty] = at(P, t), n = size(ty);
  out.push({ x, y, n, t });
  while (out.length < maxN) {
    // the next wheel's size depends on where it lands: two fixed-point passes
    let n2 = n;
    for (let it = 0; it < 2; it++) n2 = size(at(P, t + k * (n + n2))[3]);
    const t2 = t + k * (n + n2);
    if (closed ? t2 > P.L - 1e-6 : t2 > P.L + 0.25 * k * (n + n2)) break;
    t = Math.min(t2, P.L); n = n2; [x, y] = at(P, t);
    out.push({ x, y, n, t });
  }
  return out;
}

/**
 * Lay gears along a digit. box = rectangle for gear centres (pixels);
 * nThin / nThick the tooth counts of horizontal and vertical runs; nBig the
 * terminal wheel; rOf(n) the pitch radius. Returns [{x, y, r, n, big}] in
 * path order, meshing exactly with their chain neighbours.
 */
export function layDigit(digit, box, nThin, nThick, nBig, rOf) {
  const sizeBy = (ty) => Math.round(nThin + (nThick - nThin) * Math.abs(ty) ** 1.6);
  const gears = [], links = [];
  for (const st of SKELETONS[digit]) {
    const P = densify(st, box);
    const size = st.thin ? () => nThin : sizeBy;
    let list;
    // spacing in "teeth": centre distance = (n_i + n_j) * rOf(1)
    const unit = rOf(1);
    if (st.closed) {
      // an even ring that closes on itself: search the spacing factor
      const L0 = lay(P, 0, unit, size, 99, true);
      let n = L0.length; if (n % 2) n++;
      let lo = unit * 0.7, hi = unit * 1.4;
      for (let it = 0; it < 40; it++) {
        const mid = (lo + hi) / 2, l = lay(P, 0, mid, size, n + 1, true);
        if (l.length > n) lo = mid; else hi = mid;
      }
      list = lay(P, 0, hi, size, n, true);
    } else if (st.start) {
      list = lay(P, 0, unit, size);
    } else {
      const l = lay(P, 0, unit, size), left = P.L - l[l.length - 1].t;
      list = lay(P, Math.max(0, left / 2), unit, size);
    }
    if (st.skip) list = list.slice(1);
    for (const b of st.big || []) {
      const g = list[b < 0 ? list.length + b : b];
      if (g) { g.n = Math.max(g.n, nBig); g.big = true; }
    }
    const first = gears.length;
    let prev = -1;
    for (const g of list) {
      const r = rOf(g.n);
      if (prev < 0 && (st.skip || st.start) && first > 0) {
        // joins a stroke laid earlier: chain on from the nearest wheel there
        let bi = -1, bd = 1e9;
        for (let j = 0; j < first; j++) { const d = Math.hypot(gears[j].x - g.x, gears[j].y - g.y) - gears[j].r - r; if (d < bd) { bd = d; bi = j; } }
        if (bd < 2.5) prev = bi;
      }
      const hit = gears.findIndex((h) => Math.hypot(h.x - g.x, h.y - g.y) < 0.75 * (h.r + r));
      if (hit >= 0) { if (prev >= 0 && prev !== hit) links.push([prev, hit]); prev = hit; continue; }
      if (prev >= 0) links.push([prev, gears.length]);
      prev = gears.length;
      gears.push({ x: g.x, y: g.y, n: g.n, r, big: !!g.big, hx: g.x, hy: g.y });
    }
    if (st.closed && gears.length - first > 2) links.push([gears.length - 1, first]);
  }
  relax(gears, links, box);
  return gears;
}

/** Make linked wheels mesh exactly and unlinked ones clear each other. */
function relax(gs, links, box) {
  const isLink = new Set(links.map(([a, b]) => a * 1000 + b).concat(links.map(([a, b]) => b * 1000 + a)));
  for (let it = 0; it < 300; it++) {
    for (const [a, b] of links) {
      const A = gs[a], B = gs[b], dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy) || 1, e = (d - (A.r + B.r)) / d * 0.5;
      A.x += dx * e; A.y += dy * e; B.x -= dx * e; B.y -= dy * e;
    }
    for (let a = 0; a < gs.length; a++) for (let b = a + 1; b < gs.length; b++) {
      if (isLink.has(a * 1000 + b)) continue;
      const A = gs[a], B = gs[b], dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy) || 1, want = A.r + B.r + 1.5;
      if (d >= want) continue;
      const e = (d - want) / d * 0.5;
      A.x += dx * e; A.y += dy * e; B.x -= dx * e; B.y -= dy * e;
    }
    for (const g of gs) {
      g.x += (g.hx - g.x) * 0.02; g.y += (g.hy - g.y) * 0.02;
      // keep the wheel inside the cell
      g.x = Math.max(box.x + (g.r - box.r0), Math.min(box.x + box.w - (g.r - box.r0), g.x));
      g.y = Math.max(box.y + (g.r - box.r0), Math.min(box.y + box.h - (g.r - box.r0), g.y));
    }
  }
  gs.links = links;
}
