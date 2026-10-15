// Acrobats: the ten numerals as troupe formations.
//
// Each digit lives in a 26 x 50 cell (local x 0..25, y 0..49; stroke
// centrelines inside x 2..23, y 2..47, the cell's bottom on the plank). A
// digit is a set of BODIES: each is a path from the head end to the feet end,
// drawn as a head disc, a 4-px torso and legs, and two arms. Bodies chain
// head to feet (one stands on another's head, holds another's ankles), so the
// union of their strokes is the numeral. Closed bowls (0, 6, 8, 9) are
// WHEELS: a ring of contortionists holding ankles, which turns all the time;
// the ring's outline never changes, only the heads travel round it.
//
// Everything here is computed once at load (tables a C port keeps in flash):
// the rest paths, and per digit a clearance mask (where an arm may reach
// without touching another stroke or closing a counter).

export const K = 8;                 // points per body path, head first
export const CW = 26, CH = 50;      // the cell
const D2R = Math.PI / 180;

function arcPts(cx, cy, rx, ry, a0, a1, n = 16) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = (a0 + (a1 - a0) * (i / n)) * D2R;
    out.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return out;
}
function bez(p0, c, p1, n = 16) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, v = 1 - u;
    out.push([v * v * p0[0] + 2 * u * v * c[0] + u * u * p1[0], v * v * p0[1] + 2 * u * v * c[1] + u * u * p1[1]]);
  }
  return out;
}
const line = (a, b) => [a, b];
const cat = (...parts) => parts.reduce((acc, p) => (acc.length ? acc.concat(p.slice(1)) : p.slice()), []);

/** Resample a polyline to K points evenly spaced by arc length, into `out` (Float32Array 2K). */
export function resample(pts, out = new Float32Array(2 * K)) {
  const n = pts.length, L = [0];
  for (let i = 1; i < n; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const tot = L[n - 1];
  let j = 1;
  for (let k = 0; k < K; k++) {
    const s = (tot * k) / (K - 1);
    while (j < n - 1 && L[j] < s) j++;
    const seg = L[j] - L[j - 1] || 1, u = Math.min(1, Math.max(0, (s - L[j - 1]) / seg));
    out[2 * k] = pts[j - 1][0] + (pts[j][0] - pts[j - 1][0]) * u;
    out[2 * k + 1] = pts[j - 1][1] + (pts[j][1] - pts[j - 1][1]) * u;
  }
  return out;
}

// ---------------------------------------------------------------- the font
// b(path, opts): a body. opts.flag: a fixed arm as the 1's flag; opts.shoes:
// feet on the plank. Wheels: { cx, cy, rx, ry, n, dir, a0 } (degrees, y down).
const b = (pts, o = {}) => ({ pts, ...o });

const DEFS = {
  0: { bodies: [], wheels: [{ cx: 12.5, cy: 24.5, rx: 10.5, ry: 22.5, n: 4, dir: 1, a0: 0 }] },
  1: {
    bodies: [
      b(line([14, 2], [14, 24]), { still: true }),
      b(line([14, 25.5], [14, 47]), { shoes: true, hold: true }),
    ],
    flag: [[13, 8], [5, 15]],
  },
  2: {
    bodies: [
      b(arcPts(12.5, 12, 10.5, 10, 162, 338)),
      b(cat(arcPts(12.5, 12, 10.5, 10, 338, 385, 6), line([22, 17.5], [12, 31]))),
      b(line([12, 31], [2.5, 46])),
      b(line([23, 47], [4, 47])),
    ],
  },
  3: {
    bodies: [
      b(arcPts(12.5, 12.5, 10, 10.5, 196, 320)),
      b(arcPts(12.5, 12.5, 10, 10.5, 320, 448)),
      b(arcPts(12.5, 35, 10.5, 12, 272, 380)),
      b(arcPts(12.5, 35, 10.5, 12, 162, 20)),
    ],
  },
  4: {
    bodies: [
      b(line([17, 2], [17, 31])),
      b(line([17, 47], [17, 35.5]), { hands: true }),
      b(line([3, 32.5], [16, 4])),
      b(line([23, 33], [5, 33])),
    ],
  },
  5: {
    bodies: [
      b(line([23, 2.5], [5, 2.5])),
      b(line([3.5, 4], [3.5, 23])),
      b(arcPts(12, 33.5, 10.5, 12.5, 220, 378)),
      b(arcPts(12, 33.5, 10.5, 12.5, 158, 18)),
    ],
  },
  6: {
    bodies: [b(bez([21, 3], [3.5, 5], [2.2, 32]))],
    wheels: [{ cx: 12.5, cy: 34.5, rx: 10.5, ry: 12.5, n: 3, dir: -1, a0: 30 }],
  },
  7: {
    bodies: [
      b(line([2.5, 2.5], [22, 2.5])),
      b(line([10.5, 47], [22.5, 4.5]), { hands: true }),
    ],
  },
  8: {
    bodies: [],
    wheels: [
      { cx: 12.5, cy: 12.5, rx: 9, ry: 10.5, n: 2, dir: 1, a0: 0 },
      { cx: 12.5, cy: 35, rx: 10.5, ry: 12, n: 3, dir: -1, a0: 60 },
    ],
  },
  9: {
    bodies: [b(bez([22.8, 17], [22.5, 40], [5, 46.5]), { shoes: false })],
    wheels: [{ cx: 12.5, cy: 14.5, rx: 10.5, ry: 12.5, n: 3, dir: 1, a0: 200 }],
  },
};
// Arcs given with a0 > a1 run backwards: the head is always at a0.

/** A wheel body k at rotation `rot` (degrees): its path, head first. */
export function wheelPath(w, k, rot, out) {
  const span = 360 / w.n;
  const a = w.a0 + k * span + rot * w.dir;
  const a1 = w.dir > 0 ? a - span : a + span;
  // head leads in the direction of travel
  for (let i = 0; i < K; i++) {
    const t = (a + (a1 - a) * (i / (K - 1))) * D2R;
    out[2 * i] = w.cx + w.rx * Math.cos(t);
    out[2 * i + 1] = w.cy + w.ry * Math.sin(t);
  }
  return out;
}

// ---------------------------------------------------------------- tables
export const GLYPHS = [];
const MW = CW + 16, MH = CH + 8, MX = 8, MY = 4; // clearance mask covers x -8..33, y -4..53

function segD(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let u = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  u = u < 0 ? 0 : u > 1 ? 1 : u;
  return Math.hypot(px - ax - u * dx, py - ay - u * dy);
}

for (let d = 0; d <= 9; d++) {
  const def = DEFS[d];
  const bodies = def.bodies.map((q) => ({ p: resample(q.pts), shoes: !!q.shoes, arms: q.hands ? 'hands' : q.hold ? 'hold' : q.still ? 'none' : 'free' }));
  const wheels = def.wheels ?? [];
  // all centrelines, for the mask
  const segs = [];
  for (const q of def.bodies) for (let i = 1; i < q.pts.length; i++) segs.push([...q.pts[i - 1], ...q.pts[i]]);
  for (const w of wheels) { const r = arcPts(w.cx, w.cy, w.rx, w.ry, 0, 360, 48); for (let i = 1; i < r.length; i++) segs.push([...r[i - 1], ...r[i]]); }
  if (def.flag) segs.push([...def.flag[0], ...def.flag[1]]);
  // clearance: 1 where an arm's hand may go (> 4.5 px from every centreline,
  // and outside every counter: not inside a wheel or between strokes)
  const mask = new Uint8Array(MW * MH);
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const px = x - MX + 0.5, py = y - MY + 0.5;
    let m = 99;
    for (const s of segs) { const e = segD(px, py, s[0], s[1], s[2], s[3]); if (e < m) m = e; }
    let free = m > 4.5;
    for (const w of wheels) if (((px - w.cx) / w.rx) ** 2 + ((py - w.cy) / w.ry) ** 2 < 1) free = false;
    mask[y * MW + x] = free ? 1 : 0;
  }
  GLYPHS.push({ bodies, wheels, flag: def.flag ?? null, mask, segs });
}

// Counters that are not wheels (the 2's, 3's, 4's, 5's, 7's open bowls):
// close them off so an arm cannot reach in. A point is "in a counter" if it is
// hemmed in by strokes on both sides horizontally and vertically.
for (const G of GLYPHS) {
  const m = G.mask, near = (x, y) => (x < 0 || y < 0 || x >= MW || y >= MH ? 1 : m[y * MW + x]);
  const out = new Uint8Array(m.length);
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    if (!m[y * MW + x]) continue;
    let l = 0, r = 0, u = 0, dn = 0;
    for (let k = x - 1; k >= 0; k--) if (!m[y * MW + k]) { l = 1; break; }
    for (let k = x + 1; k < MW; k++) if (!m[y * MW + k]) { r = 1; break; }
    for (let k = y - 1; k >= 0; k--) if (!m[k * MW + x]) { u = 1; break; }
    for (let k = y + 1; k < MH; k++) if (!m[k * MW + x]) { dn = 1; break; }
    out[y * MW + x] = (l && r) || (u && dn) ? 0 : near(x, y);
  }
  G.mask = out;
}

/** May a hand go at local (x, y) of digit d? */
export function clear(G, x, y) {
  const ix = Math.floor(x) + MX, iy = Math.floor(y) + MY;
  if (ix < 0 || iy < 0 || ix >= MW || iy >= MH) return true;
  return G.mask[iy * MW + ix] === 1;
}
