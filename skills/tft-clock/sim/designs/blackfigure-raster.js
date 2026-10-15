// Black-figure: the painter's rasteriser. A figure is a list of parts in
// painting order, in the units of its own box; this turns it into byte maps
// once, at load (on the device they would ship in flash):
//   k     black-slip coverage 0..16 (4x4 supersampled, so big curves have a
//         clean edge; everything else about the figure is hard pixels)
//   o     what lies on the slip at the pixel centre: 0 none, INC an incised
//         line (bare clay), RED added red, WHT added white
//   ordK  0..255, when the brush reaches this pixel (stroke by stroke)
//   ordO  0..255, when the stylus / the added-colour brush reaches it
//   tipK, tipO  where the brush / stylus is at each order step (x, y pairs)
//
// Parts:
//   { t: 'L', p: [[x, y], ...], w: 4 | [w0, w1] }  a stroke, tapered along its length
//   { t: 'P', p: [[x, y], ...] }                      a polygon (even-odd)
//   { t: 'E', c: [x, y], r: [rx, ry] }                an ellipse
//   { t: 'R', c: [x, y], r: [rx, ry], w, a: [a0, a1] } an elliptical ring (optional arc, clock radians)
// and an op `m`: 'k' slip (default), 'x' scrape back to clay, 'i' incise, 'r' red, 'w' white.

export const INC = 17, RED = 18, WHT = 19;
const TAU = Math.PI * 2;

function polyInfo(p) {
  const seg = [];
  let L = 0;
  for (let i = 1; i < p.length; i++) {
    const dx = p[i][0] - p[i - 1][0], dy = p[i][1] - p[i - 1][1], l = Math.hypot(dx, dy);
    seg.push({ ax: p[i - 1][0], ay: p[i - 1][1], dx, dy, l, s: L });
    L += l;
  }
  return { seg, L: L || 1 };
}

/** Nearest point on the polyline: [distance, arclength fraction]. */
function nearest(info, x, y) {
  let best = Infinity, bu = 0;
  for (const s of info.seg) {
    const l2 = s.l * s.l;
    let u = l2 ? ((x - s.ax) * s.dx + (y - s.ay) * s.dy) / l2 : 0;
    u = u < 0 ? 0 : u > 1 ? 1 : u;
    const ex = x - s.ax - u * s.dx, ey = y - s.ay - u * s.dy, d = ex * ex + ey * ey;
    if (d < best) { best = d; bu = (s.s + u * s.l) / info.L; }
  }
  return [Math.sqrt(best), bu];
}

function prep(part) {
  const q = { ...part, m: part.m ?? 'k' };
  if (q.t === 'L') {
    q.info = polyInfo(q.p.length === 1 ? [q.p[0], q.p[0]] : q.p);
    const [w0, w1] = Array.isArray(q.w) ? q.w : [q.w ?? 1, q.w ?? 1];
    q.w0 = w0; q.w1 = w1;
  }
  if (q.t === 'P' || q.t === 'E') {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const pts = q.t === 'P' ? q.p : [[q.c[0] - q.r[0], q.c[1] - q.r[1]], [q.c[0] + q.r[0], q.c[1] + q.r[1]]];
    for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    // the brush sweeps along the longer side unless told otherwise
    const ax = q.ax ?? (x1 - x0 > y1 - y0 ? [1, 0] : [0, 1]);
    const n = Math.hypot(ax[0], ax[1]);
    q.ux = ax[0] / n; q.uy = ax[1] / n;
    const pr = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]].map(([x, y]) => x * q.ux + y * q.uy);
    q.lo = Math.min(...pr); q.span = Math.max(...pr) - q.lo || 1;
  }
  if (q.t === 'R') { q.a0 = q.a ? q.a[0] : 0; q.a1 = q.a ? q.a[1] : TAU; }
  return q;
}

/** Is (x, y) inside the part? Returns -1 if not, else the part's progress 0..1 there. */
function test(q, x, y) {
  switch (q.t) {
    case 'L': {
      const [d, u] = nearest(q.info, x, y);
      return d <= (q.w0 + (q.w1 - q.w0) * u) / 2 ? u : -1;
    }
    case 'P': {
      let inside = false;
      const p = q.p;
      for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
        const xi = p[i][0], yi = p[i][1], xj = p[j][0], yj = p[j][1];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      }
      return inside ? ((x * q.ux + y * q.uy) - q.lo) / q.span : -1;
    }
    case 'E': {
      const dx = (x - q.c[0]) / q.r[0], dy = (y - q.c[1]) / q.r[1];
      return dx * dx + dy * dy <= 1 ? ((x * q.ux + y * q.uy) - q.lo) / q.span : -1;
    }
    case 'R': {
      const dx = x - q.c[0], dy = y - q.c[1];
      const o = (dx / q.r[0]) ** 2 + (dy / q.r[1]) ** 2;
      const i = (dx / (q.r[0] - q.w)) ** 2 + (dy / (q.r[1] - q.w)) ** 2;
      if (o > 1 || i < 1) return -1;
      let a = Math.atan2(dx, -dy);           // clock angle
      if (a < q.a0) a += TAU;
      if (a > q.a1) { if (a - TAU >= q.a0) a -= TAU; else return -1; }
      return (a - q.a0) / (q.a1 - q.a0);
    }
  }
  return -1;
}

/**
 * Rasterise a figure into a w x h map whose local origin sits at (ox, oy).
 * `iw` is the incision half-width test (pixel centre within iw of the line).
 */
export function raster(parts, w, h, ox, oy, { iw = 0.55 } = {}) {
  const ps = parts.map(prep);
  const N = w * h;
  const k = new Uint8Array(N), o = new Uint8Array(N), ordK = new Uint8Array(N), ordO = new Uint8Array(N);
  const pk = new Int16Array(N).fill(-1), uk = new Float32Array(N);
  const po = new Int16Array(N).fill(-1), uo = new Float32Array(N);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let cov = 0;
      for (let sy = 0; sy < 4; sy++)
        for (let sx = 0; sx < 4; sx++) {
          const lx = x + (sx + 0.5) / 4 - ox, ly = y + (sy + 0.5) / 4 - oy;
          let on = false, who = -1, wu = 0;
          for (let j = 0; j < ps.length; j++) {
            const q = ps[j];
            if (q.m !== 'k' && q.m !== 'x') continue;
            const u = test(q, lx, ly);
            if (u < 0) continue;
            if (q.m === 'k') { on = true; who = j; wu = u; } else on = false;
          }
          if (on) {
            cov++;
            const centre = sx === 1 && sy === 1;
            if (pk[i] < 0 || centre) { pk[i] = who; uk[i] = wu; }
          }
        }
      k[i] = cov;
      // the overlay, tested at the pixel centre
      const cx = x + 0.5 - ox, cy = y + 0.5 - oy;
      for (let j = 0; j < ps.length; j++) {
        const q = ps[j];
        if (q.m !== 'i' && q.m !== 'r' && q.m !== 'w') continue;
        let u;
        if (q.m === 'i' && q.t === 'L') {
          const [d, uu] = nearest(q.info, cx, cy);
          u = d <= iw ? uu : -1;
        } else u = test(q, cx, cy);
        if (u < 0) continue;
        if (q.m === 'i' && cov < 12) continue;   // incisions only cut through slip
        o[i] = q.m === 'i' ? INC : q.m === 'r' ? RED : WHT;
        po[i] = j; uo[i] = u;
      }
    }
  // orders: each part gets a share of 0..255 by its pixel count, in sequence
  const assign = (pp, uu, ord, filter) => {
    const cnt = new Float64Array(ps.length);
    for (let i = 0; i < N; i++) if (pp[i] >= 0 && filter(i)) cnt[pp[i]]++;
    const start = new Float64Array(ps.length);
    let tot = 0;
    for (let j = 0; j < ps.length; j++) { start[j] = tot; tot += cnt[j] ? Math.max(cnt[j], 6) : 0; }
    tot = tot || 1;
    for (let j = 0; j < ps.length; j++) cnt[j] = cnt[j] ? Math.max(cnt[j], 6) : 0;
    for (let i = 0; i < N; i++) if (pp[i] >= 0 && filter(i)) ord[i] = Math.min(255, Math.floor((255 * (start[pp[i]] + uu[i] * cnt[pp[i]])) / tot));
  };
  assign(pk, uk, ordK, (i) => k[i] > 0);
  assign(po, uo, ordO, (i) => o[i] === INC);
  // the added colours get their own sequence in the same array
  const colOrd = new Uint8Array(N);
  assign(po, uo, colOrd, (i) => o[i] === RED || o[i] === WHT);
  for (let i = 0; i < N; i++) if (o[i] === RED || o[i] === WHT) ordO[i] = colOrd[i];
  const tips = (ord, filter) => {
    const sx = new Float64Array(256), sy = new Float64Array(256), n = new Float64Array(256);
    for (let i = 0; i < N; i++) if (filter(i)) { const v = ord[i]; sx[v] += i % w; sy[v] += (i / w) | 0; n[v]++; }
    const t = new Float32Array(512);
    let lx = w / 2, ly = h / 2;
    for (let v = 0; v < 256; v++) {
      let ax = 0, ay = 0, an = 0;
      for (let d = -3; d <= 3; d++) { const q = v + d; if (q >= 0 && q < 256) { ax += sx[q]; ay += sy[q]; an += n[q]; } }
      if (an) { lx = ax / an + 0.5; ly = ay / an + 0.5; }
      t[v * 2] = lx; t[v * 2 + 1] = ly;
    }
    return t;
  };
  const tipK = tips(ordK, (i) => k[i] > 0);
  const tipO = tips(ordO, (i) => o[i] === INC);
  let px = 0;
  for (let i = 0; i < N; i++) if (k[i] || o[i]) px++;
  return { w, h, ox, oy, k, o, ordK, ordO, tipK, tipO, px };
}
