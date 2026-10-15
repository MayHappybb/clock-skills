// Sandcastle letterforms: every digit is built from the parts a child builds a
// castle with. Upright strokes are TOWERS cast from an upturned bucket and
// stacked, each drum tapering like the bucket it came out of; flat strokes
// are patted WALLS with crenellations on every open top; counters are ARCHED
// gateways cut through the sand; the 7 and the 2 come down as ramps.
//
// Drawn in the hour size's coordinates (20 x 32, ground at y = 32) and
// re-snapped for the minute size, so each size lands on whole pixels.
// glyph(d, size) rasterises once and caches: coverage, which part each pixel
// belongs to (so the crab can build it part by part), materials, and how much
// sand each column holds (what the slumped mound is made of).

export const SIZES = {
  H: { W: 20, H: 32, sx: 1, sy: 1, t: 5, tw: 6, drum: 11.5, win: [2, 3] },
  M: { W: 16, H: 24, sx: 0.8, sy: 0.75, t: 4, tw: 5, drum: 9, win: [1, 2] },
};

// T(cx, yTop, yBot)  tower of bucket drums, standing on whatever is below
// R(x0, y0, x1, y1)  patted block of sand (a wall)
// D(x0, y0, x1, y1)  ramp: a thick diagonal stroke with stair treads
// O(x0, y0, x1, y1, roundTop, roundBot)  an arched opening cut through
// Build order is list order (bottom first, as you would build it).
const T = (cx, y0, y1 = 32, o = {}) => ({ k: 'T', cx, y0, y1, ...o });
const R = (x0, y0, x1, y1) => ({ k: 'R', x0, y0, x1, y1 });
const D = (x0, y0, x1, y1, w = 6) => ({ k: 'D', x0, y0, x1, y1, w });
const O = (x0, y0, x1, y1, rt = 1, rb = 1) => ({ k: 'O', x0, y0, x1, y1, rt, rb });

export const GLYPHS = {
  0: [R(5, 23, 15, 32), T(3, 4), T(17, 4), R(5, 5, 15, 14), O(6, 9, 14, 27)],
  1: [R(3, 27, 17, 32), T(10, 0, 27, { flag: 1 }), T(4.5, 5, 12, { hang: 1 })],
  2: [R(0, 27, 20, 32), D(16, 16, 4.5, 28, 7), T(16.5, 4, 19), R(4, 5, 15, 11), T(3.5, 3, 13, { flag: 1 }), O(6, 10, 14, 22, 1, 0)],
  3: [R(0, 27, 15, 32), T(17, 4, 32, { flag: 1 }), R(6, 15, 15, 20), R(0, 5, 15, 10), O(6, 9.5, 14, 15.5, 0, 0), O(6, 20, 14, 27, 0, 0)],
  4: [T(14.5, 0, 32, { flag: 1 }), R(0, 19, 20, 25), D(12.5, 3, 2.5, 21, 6)],   // the diagonal as a ramp: an open 4 read as a U
  5: [R(0, 27, 15, 32), T(16.5, 15), R(3, 14, 15, 20), T(3.5, 4, 14), R(6, 4, 15, 9), T(17, 2, 10, { flag: 1 }), O(6, 20, 13.5, 27, 1, 0)],
  6: [R(4, 27, 16, 32), T(3.5, 4), T(16.5, 15), R(4, 14, 16, 20), R(5, 4, 15, 9), T(17, 2, 10, { flag: 1 }), O(6, 18.5, 14, 27, 1, 1)],
  7: [R(5, 28, 15, 32), D(16.5, 8, 10, 28, 6.5), R(0, 4, 15, 10), T(17, 2, 11, { flag: 1 }), T(3, 2, 12, { hang: 1 })],
  8: [R(4, 24, 16, 32), T(3, 15), T(17, 15), R(5, 13, 15, 20), T(4, 3, 15), T(16, 3, 15, { flag: 1 }), R(5, 4, 15, 10), O(6.5, 8, 13.5, 16), O(6, 18.5, 14, 27)],
  9: [R(4, 27, 16, 32), T(16.5, 4, 32, { flag: 1 }), R(4, 14, 16, 20), T(3.5, 4, 17), R(5, 4, 15, 10), O(6, 8, 14, 16, 1, 1)],
};

const PAD_X = 3, PAD_TOP = 3;

/** Snap one glyph's parts into a size's pixel coordinates. */
function snap(prims, S) {
  const X = (x) => Math.round(x * S.sx), Y = (y) => Math.round(y * S.sy);
  const out = [];
  for (const p of prims) {
    if (p.k === 'T') {
      const cx = S.sx === 1 ? p.cx : Math.round(p.cx * S.sx * 2) / 2;
      out.push({ ...p, cx, y0: Y(p.y0), y1: Y(p.y1) });
    } else if (p.k === 'R') out.push({ ...p, x0: X(p.x0), y0: Y(p.y0), x1: X(p.x1), y1: Y(p.y1) });
    else if (p.k === 'D') out.push({ ...p, x0: p.x0 * S.sx, y0: p.y0 * S.sy, x1: p.x1 * S.sx, y1: p.y1 * S.sy, w: p.w * (S.t / 5) });
    else if (p.k === 'O') out.push({ ...p, x0: X(p.x0), y0: Y(p.y0), x1: X(p.x1), y1: Y(p.y1) });
  }
  return out;
}

/** Split towers into stacked bucket drums: [{ cx, y0, y1, wt, wb, tower, j }] */
function drums(T, S) {
  const len = T.y1 - T.y0, n = Math.max(1, Math.round(len / S.drum)), L = len / n, out = [];
  for (let j = 0; j < n; j++) {
    const y1 = T.y1 - j * L, y0 = y1 - L;
    // each drum is a bucket cast: wide mouth at the bottom, narrower base at the top
    let wb = S.tw + 1 - 0.5 * j, wt = S.tw - 0.6 - 0.5 * j;
    if (T.hang) { wb = S.tw - 1.5; wt = S.tw; }         // a turret hung on the wall: corbelled, narrow at the foot
    out.push({ cx: T.cx, y0, y1, wt, wb, j, n });
  }
  return out;
}

function inside(p, x, y) {
  switch (p.k) {
    case 'drum': {
      if (y < p.y0 || y > p.y1) return false;
      const f = (y - p.y0) / (p.y1 - p.y0);
      let hw = (p.wt + (p.wb - p.wt) * f) / 2;
      if (y - p.y0 < 1.2 && !p.hang) hw = p.wt / 2 + 0.55;    // the bucket's base rim
      return Math.abs(x - p.cx) <= hw;
    }
    case 'R': return x >= p.x0 && x <= p.x1 && y >= p.y0 && y <= p.y1;
    case 'D': {
      const dx = p.x1 - p.x0, dy = p.y1 - p.y0, L2 = dx * dx + dy * dy;
      const t = Math.max(0, Math.min(1, ((x - p.x0) * dx + (y - p.y0) * dy) / L2));
      const ex = x - p.x0 - t * dx, ey = y - p.y0 - t * dy;
      // flat ends: only the band between the two end-lines, plus a horizontal cut at the ends
      if (y < Math.min(p.y0, p.y1) - 0.5 || y > Math.max(p.y0, p.y1) + 0.5) return false;
      return Math.hypot(ex, ey) <= p.w / 2;
    }
    case 'O': {
      if (x < p.x0 || x > p.x1 || y < p.y0 || y > p.y1) return false;
      const r = (p.x1 - p.x0) / 2, cx = (p.x0 + p.x1) / 2;
      if (p.rt && y < p.y0 + r) return Math.hypot(x - cx, y - (p.y0 + r)) <= r;
      if (p.rb && y > p.y1 - r) return Math.hypot(x - cx, y - (p.y1 - r)) <= r;
      return true;
    }
  }
  return false;
}

const cache = new Map();
/**
 * The raster of digit d at size 'H' or 'M'.
 *   bw, bh       raster size; (ox, oy) = where glyph (0, 0) sits in it; ground is row oy + S.H
 *   cov          coverage 0..1
 *   part         part index per pixel (-1 none); parts[] in build order
 *   mat          0 sand, 1 merlon, 2 window, 3 tread, 4 rim, 5 drum joint shadow
 *   cyl          -1..1 across a drum (round), or 9 for flat walls
 *   sweep        0..1 along a wall / ramp: the order it is patted in
 *   col          sand per column (for the slumped mound)
 *   flag         { x, y } top of the flag pole (raster coords)
 */
export function glyph(d, size) {
  const key = size + d;
  if (cache.has(key)) return cache.get(key);
  const S = SIZES[size];
  const prims = snap(GLYPHS[d], S);
  const parts = [];
  const holes = [];
  let flag = null;
  for (const p of prims) {
    if (p.k === 'O') { holes.push(p); continue; }
    if (p.k === 'T') {
      const ds = drums(p, S);
      for (const q of ds) parts.push({ k: 'drum', ...q, hang: p.hang, kind: 'drum' });
      if (p.flag) flag = { x: p.cx, y: p.y0 };
      continue;
    }
    parts.push({ ...p, kind: p.k === 'D' ? 'ramp' : 'wall' });
  }
  if (!flag) { const t = parts.filter((p) => p.k === 'drum').sort((a, b) => a.y0 - b.y0)[0]; flag = t ? { x: t.cx, y: t.y0 } : { x: S.W / 2, y: 0 }; }

  const bw = S.W + 2 * PAD_X, bh = S.H + PAD_TOP, N = bw * bh;
  const cov = new Float32Array(N), part = new Int8Array(N).fill(-1), mat = new Uint8Array(N);
  const cyl = new Float32Array(N).fill(9), sweep = new Float32Array(N);
  const SS = 4, cnt = new Int16Array(parts.length);
  for (let py = 0; py < bh; py++) for (let px = 0; px < bw; px++) {
    cnt.fill(0); let n = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const x = px - PAD_X + (sx + 0.5) / SS, y = py - PAD_TOP + (sy + 0.5) / SS;
      let hole = false;
      for (const h of holes) if (inside(h, x, y)) { hole = true; break; }
      if (hole) continue;
      for (let k = 0; k < parts.length; k++) if (inside(parts[k], x, y)) { cnt[k]++; n++; break; }
    }
    const p = py * bw + px;
    cov[p] = n / (SS * SS);
    if (n) {
      let best = 0;
      for (let k = 1; k < parts.length; k++) if (cnt[k] > cnt[best]) best = k;
      part[p] = best;
      const q = parts[best], x = px - PAD_X + 0.5, y = py - PAD_TOP + 0.5;
      if (q.k === 'drum') {
        const f = (y - q.y0) / (q.y1 - q.y0), hw = (q.wt + (q.wb - q.wt) * Math.max(0, Math.min(1, f))) / 2 + 0.3;
        cyl[p] = Math.max(-1, Math.min(1, (x - q.cx) / hw));
        if (y - q.y0 < 1.2 && !q.hang) mat[p] = 4;
        else if (q.y1 - y < 1 && q.j < q.n - 1 + (q.hang ? 1 : 0) && q.j > 0) mat[p] = 5;
      } else if (q.k === 'R') {
        sweep[p] = (x - q.x0) / Math.max(1, q.x1 - q.x0);
      } else {
        const dx = q.x1 - q.x0, dy = q.y1 - q.y0;
        sweep[p] = Math.max(0, Math.min(1, ((x - q.x0) * dx + (y - q.y0) * dy) / (dx * dx + dy * dy)));
        if (((Math.floor(y) % 3) + 3) % 3 === 0) mat[p] = 3;
      }
    }
  }
  // crenellations on every open top: a flat run of column tops gets merlons
  const top = new Int16Array(bw).fill(-1);
  for (let px = 0; px < bw; px++) for (let py = 0; py < bh; py++) if (cov[py * bw + px] > 0.5) { top[px] = py; break; }
  for (let px = 0; px < bw;) {
    if (top[px] < 0) { px++; continue; }
    let e = px;
    while (e + 1 < bw && top[e + 1] === top[px]) e++;
    const w = e - px + 1, y = top[px];
    if (w >= 3 && y >= 1) {
      for (let i = 0; i < w; i++) {
        const on = i < w / 2 ? i % 2 === 0 : (w - 1 - i) % 2 === 0;
        if (!on) continue;
        const below = y * bw + px + i, at = (y - 1) * bw + px + i;
        cov[at] = 1; part[at] = part[below]; mat[at] = 1; cyl[at] = cyl[below]; sweep[at] = sweep[below];
      }
    }
    px = e + 1;
  }
  // windows: one dark arched slit in the middle of each tall enough drum
  for (const q of parts) {
    if (q.k !== 'drum' || q.hang || q.j !== q.n - 1 || q.y1 - q.y0 < (size === 'H' ? 8 : 6.5) || q.wt < 3.8) continue;
    const [ww, wh] = S.win;
    const x0 = Math.round(q.cx - ww / 2) + PAD_X, y0 = Math.round((q.y0 + q.y1) / 2 - wh / 2 + 0.5) + PAD_TOP;
    for (let j = 0; j < wh; j++) for (let i = 0; i < ww; i++) {
      const p = (y0 + j) * bw + x0 + i;
      if (cov[p] > 0.9) mat[p] = 2;
    }
  }
  const col = new Float32Array(bw);
  for (let px = 0; px < bw; px++) for (let py = 0; py < bh; py++) col[px] += cov[py * bw + px];

  const g = { d, size, S, bw, bh, ox: PAD_X, oy: PAD_TOP, cov, part, mat, cyl, sweep, col, parts,
    flag: { x: flag.x + PAD_X, y: flag.y + PAD_TOP - 2 } };
  cache.set(key, g);
  return g;
}

/** ASCII of a glyph, for checking letterforms in a terminal. */
export function ascii(d, size) {
  const g = glyph(d, size), rows = [];
  for (let y = 0; y < g.bh; y++) {
    let s = '';
    for (let x = 0; x < g.bw; x++) {
      const p = y * g.bw + x, c = g.cov[p];
      s += c < 0.25 ? '.' : g.mat[p] === 2 ? 'o' : g.mat[p] === 1 ? 'm' : c < 0.75 ? '+' : '#';
    }
    rows.push(s);
  }
  return rows;
}

// rasterise every digit at both sizes up front, so no frame pays for it
for (const s of ['H', 'M']) for (let d = 0; d <= 9; d++) glyph(String(d), s);
