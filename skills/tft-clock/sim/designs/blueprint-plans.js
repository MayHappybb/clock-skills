// Blueprint: the ten numerals as floor plans. Each digit is a building whose
// cut walls (two hard outlines with 45-degree poche hatching between) make
// the numeral: straight walls, a curved apse for the 2, rotundas for the
// bowls of 6, 8 and 9. Windows are wall runs drawn as three thin lines with
// jambs; doors are gaps with a leaf and its swing arc; the rooms get a few
// furniture symbols and spiral stairs, dimmer than the walls.
//
// Geometry is in design units on a 24 x 52 skeleton box, rasterised once at
// load per size into a class map (what each pixel is) and an ink-order map
// (where along the drafting path it lies, 0..255), so the face only looks
// them up. Flash: hours 37 x 65 and minutes 30 x 51 (a 3 px pad for the
// roof line), 2 bytes a pixel, ten digits each: ~79 KB.

const TAU = Math.PI * 2;
const D = Math.PI / 180;

// classes in a digit map
export const C_NONE = 0, C_MOAT = 1, C_OUT = 2, C_HATCH = 3, C_WALL = 4, C_WLINE = 5, C_WGAP = 6, C_THIN = 7, C_LEAF = 8, C_ROOF = 9;

// elements: ['L', x0, y0, x1, y1, cap0, cap1] or ['A', cx, cy, r, a0deg, a1deg] (clock angles, clockwise)
// openings: { e, t0, t1, kind: 'win' | 'door', side: +1 | -1 (door swings to the left/right normal), hinge: 0 | 1 }
// furniture: ['r', x, y, w, h] | ['c', cx, cy, r] | ['l', x0, y0, x1, y1] | ['spiral', cx, cy, r, n] | ['stair', x0, x1, y0, y1, step]
export const PLANS = {
  0: {
    el: [['A', 12, 11, 12, -90, 90], ['L', 24, 11, 24, 41, 0, 0], ['A', 12, 41, 12, 90, 270], ['L', 0, 41, 0, 11, 0, 0]],
    open: [{ e: 1, t0: 0.22, t1: 0.78, kind: 'win' }, { e: 3, t0: 0.3, t1: 0.7, kind: 'win' }],
    furn: [['r', 9, 18, 6, 16], ['r', 5.5, 20, 2, 3], ['r', 5.5, 28, 2, 3], ['r', 16.5, 20, 2, 3], ['r', 16.5, 28, 2, 3]],
  },
  1: {
    el: [['L', 4, 9, 15, 0, 1, 0], ['L', 15, 0, 15, 52, 1, 1]],
    open: [{ e: 1, t0: 0.5, t1: 0.78, kind: 'win' }],
    furn: [['stair', 2, 9, 22, 48, 3.5]],
  },
  2: {
    el: [['A', 12, 12, 12, -90, 122], ['L', 22.2, 18.4, 0, 52, 0, 1], ['L', 0, 52, 24, 52, 1, 1]],
    open: [{ e: 2, t0: 0.38, t1: 0.58, kind: 'door', side: -1, hinge: 1 }],
    furn: [['r', 6, 10, 12, 5]],
  },
  3: {
    el: [['L', 1, 0, 23, 0, 1, 1], ['L', 23, 0, 11, 26, 1, 0], ['A', 11, 39, 13, 0, 238]],
    open: [{ e: 0, t0: 0.18, t1: 0.62, kind: 'win' }],
    furn: [['c', 11, 39, 4], ['c', 11, 39, 1]],
  },
  4: {
    el: [['L', 14, 0, 0, 34, 1, 1], ['L', 0, 34, 24, 34, 1, 1], ['L', 18, 14, 18, 52, 1, 1]],
    open: [{ e: 2, t0: 0.6, t1: 0.86, kind: 'win' }],
    furn: [],
  },
  5: {
    el: [['L', 23, 0, 2, 0, 1, 1], ['L', 2, 0, 2, 22, 1, 1], ['L', 2, 22, 11, 22, 1, 0], ['A', 11, 37, 13, 0, 236]],
    open: [{ e: 0, t0: 0.22, t1: 0.6, kind: 'win' }],
    furn: [['r', 6, 33, 10, 7], ['l', 8.5, 33, 8.5, 40]],
  },
  6: {
    el: [['A', 12, 13, 12, -90, 48], ['L', 0, 13, 0, 39, 0, 0], ['A', 12, 39, 12, 270, 270 + 360]],
    open: [{ e: 1, t0: 0.15, t1: 0.75, kind: 'win' }],
    furn: [['spiral', 12, 39, 5, 8]],
  },
  7: {
    el: [['L', 0, 0, 24, 0, 1, 1], ['L', 24, 0, 9, 52, 1, 1]],
    open: [{ e: 1, t0: 0.38, t1: 0.68, kind: 'win' }],
    furn: [],
  },
  8: {
    el: [['A', 12, 12.5, 11, 180, 540], ['A', 12, 38.5, 13, 0, 360]],
    open: [],
    furn: [['c', 12, 12.5, 3.5], ['spiral', 12, 38.5, 5.5, 8]],
  },
  9: {
    el: [['A', 12, 13, 12, 90, 450], ['L', 24, 13, 24, 39, 0, 0], ['A', 12, 39, 12, 90, 228]],
    open: [{ e: 1, t0: 0.2, t1: 0.8, kind: 'win' }],
    furn: [['c', 12, 13, 4], ['l', 8, 13, 16, 13]],
  },
};

const clockAng = (dx, dy) => { let a = Math.atan2(dx, -dy); if (a < 0) a += TAU; return a; };

function prep(k, T, o) {
  // element in pixel space
  return (e) => {
    if (e[0] === 'L') {
      const x0 = o + T / 2 + k * e[1], y0 = o + T / 2 + k * e[2], x1 = o + T / 2 + k * e[3], y1 = o + T / 2 + k * e[4];
      const L = Math.hypot(x1 - x0, y1 - y0), ux = (x1 - x0) / L, uy = (y1 - y0) / L;
      return { t: 'L', x0, y0, x1, y1, L, ux, uy, c0: e[5] ? T / 2 : 0, c1: e[6] ? T / 2 : 0, len: L };
    }
    const cx = o + T / 2 + k * e[1], cy = o + T / 2 + k * e[2], r = k * e[3], a0 = e[4] * D, a1 = e[5] * D;
    return { t: 'A', cx, cy, r, a0, span: a1 - a0, len: r * (a1 - a0) };
  };
}

/** Box distance (negative inside the wall), along-parameter t and signed offset for one element. */
function measure(el, px, py, T) {
  const h = T / 2;
  if (el.t === 'L') {
    const dx = px - el.x0, dy = py - el.y0;
    const al = dx * el.ux + dy * el.uy, pe = -dx * el.uy + dy * el.ux;
    const outA = al < -el.c0 ? -el.c0 - al : al > el.L + el.c1 ? al - el.L - el.c1 : 0;
    const d = Math.max(Math.abs(pe) - h, outA > 0 ? outA : Math.max(-el.c0 - al, al - el.L - el.c1));
    return [d, Math.min(1, Math.max(0, al / el.L)), pe];
  }
  const dx = px - el.cx, dy = py - el.cy, rp = Math.hypot(dx, dy);
  let rel = clockAng(dx, dy) - el.a0;
  rel = ((rel % TAU) + TAU) % TAU;
  let angOut = 0;
  if (el.span < TAU - 1e-6 && rel > el.span) {
    const over = rel - el.span, under = TAU - rel;
    angOut = Math.min(over, under) * rp;
    rel = over < under ? el.span : 0;
  }
  const d = Math.max(Math.abs(rp - el.r) - h, angOut > 0 ? angOut : -h);
  return [d, rel / el.span, rp - el.r];
}

/** Rasterise one digit at scale k with wall thickness T. */
export function buildDigit(n, k, T) {
  const P = PLANS[n];
  const PAD = 3, w = Math.ceil(24 * k + T) + 2 * PAD, hgt = Math.ceil(52 * k + T) + 2 * PAD;
  const els = P.el.map(prep(k, T, PAD));
  let total = 0;
  const cum = els.map((e) => { const c = total; total += e.len; return c; });
  const N = w * hgt;
  const best = new Float32Array(N), eid = new Int8Array(N), tt = new Float32Array(N), pp = new Float32Array(N);
  for (let y = 0; y < hgt; y++)
    for (let x = 0; x < w; x++) {
      let bd = 1e9, be = -1, bt = 0, bp = 0;
      els.forEach((el, i) => {
        const [d, t, pe] = measure(el, x + 0.5, y + 0.5, T);
        if (d < bd) { bd = d; be = i; bt = t; bp = pe; }
      });
      const i = y * w + x;
      best[i] = bd; eid[i] = be; tt[i] = bt; pp[i] = bp;
    }
  const wall = new Uint8Array(N);
  for (let i = 0; i < N; i++) wall[i] = best[i] <= 0 ? 1 : 0;
  const doors = P.open.filter((o) => o.kind === 'door');
  const wins = P.open.filter((o) => o.kind === 'win');
  // door gaps
  for (let i = 0; i < N; i++) if (wall[i]) for (const o of doors) if (eid[i] === o.e && tt[i] >= o.t0 && tt[i] <= o.t1) wall[i] = 0;
  const cls = new Uint8Array(N), S = new Uint8Array(N);
  const isWall = (x, y) => x >= 0 && y >= 0 && x < w && y < hgt && wall[y * w + x];
  for (let y = 0; y < hgt; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x, e = eid[i];
      S[i] = Math.min(255, Math.round(((cum[e] + tt[i] * els[e].len) / total) * 255));
      if (!wall[i]) {
        // the roof's edge above, dashed, a step outside the walls (a door's gap stays open)
        const roof = best[i] > 2.0 && best[i] <= 3.0 && ((x + y) & 3) < 2;
        cls[i] = roof ? C_ROOF : best[i] <= 2.0 ? C_MOAT : C_NONE; continue;
      }
      const edge = !isWall(x - 1, y) || !isWall(x + 1, y) || !isWall(x, y - 1) || !isWall(x, y + 1);
      const win = wins.find((o) => o.e === e && tt[i] >= o.t0 && tt[i] <= o.t1);
      if (edge) cls[i] = C_OUT;
      else if (win) {
        const jam = Math.min(tt[i] - win.t0, win.t1 - tt[i]) * els[e].len < 1;
        cls[i] = jam || (pp[i] > -0.5 && pp[i] <= 0.5) ? C_WLINE : C_WGAP;
      } else cls[i] = (x + y) % 3 === 0 ? C_HATCH : C_WALL;
    }

  // thin work: door leaves and swings, furniture
  const plot = (x, y, c) => {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= w || y >= hgt) return;
    const i = y * w + x;
    if (wall[i] && cls[i] !== C_WGAP) return;
    if (cls[i] === C_LEAF && c === C_THIN) return;
    cls[i] = c; S[i] = 255;
  };
  const seg = (x0, y0, x1, y1, c) => {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2));
    for (let j = 0; j <= n; j++) plot(x0 + ((x1 - x0) * j) / n, y0 + ((y1 - y0) * j) / n, c);
  };
  const arcPts = (cx, cy, r, a0, a1, c) => {
    const n = Math.max(4, Math.ceil(Math.abs(a1 - a0) * r * 2));
    for (let j = 0; j <= n; j++) { const a = a0 + ((a1 - a0) * j) / n; plot(cx + r * Math.cos(a), cy + r * Math.sin(a), c); }
  };
  for (const o of doors) {
    const el = els[o.e];
    const h = T / 2 - 0.5;
    const tH = o.hinge ? o.t1 : o.t0, tO = o.hinge ? o.t0 : o.t1;
    const nx = -el.uy * o.side, ny = el.ux * o.side;   // side +1: to the right of the wall's direction... (screen)
    const hx = el.x0 + el.ux * el.L * tH + nx * h, hy = el.y0 + el.uy * el.L * tH + ny * h;
    const gap = (o.t1 - o.t0) * el.L;
    const lx = hx + nx * gap, ly = hy + ny * gap;
    seg(hx, hy, lx, ly, C_LEAF);
    const aL = Math.atan2(ny, nx), sgn = o.hinge ? -1 : 1;
    const aJ = Math.atan2(el.uy * sgn, el.ux * sgn);
    let da = aJ - aL; while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
    arcPts(hx, hy, gap, aL, aL + da, C_THIN);
  }
  const X = (v) => PAD + T / 2 + k * v;
  for (const f of P.furn) {
    if (f[0] === 'r') {
      const x0 = X(f[1]), y0 = X(f[2]), x1 = X(f[1] + f[3]), y1 = X(f[2] + f[4]);
      seg(x0, y0, x1, y0, C_THIN); seg(x1, y0, x1, y1, C_THIN); seg(x1, y1, x0, y1, C_THIN); seg(x0, y1, x0, y0, C_THIN);
    } else if (f[0] === 'c') arcPts(X(f[1]), X(f[2]), k * f[3], 0, TAU, C_THIN);
    else if (f[0] === 'l') seg(X(f[1]), X(f[2]), X(f[3]), X(f[4]), C_THIN);
    else if (f[0] === 'spiral') {
      const cx = X(f[1]), cy = X(f[2]), r = k * f[3];
      arcPts(cx, cy, r, 0, TAU, C_THIN);
      for (let j = 0; j < f[4]; j++) { const a = (j / f[4]) * TAU; seg(cx + Math.cos(a) * 1.2, cy + Math.sin(a) * 1.2, cx + Math.cos(a) * r, cy + Math.sin(a) * r, C_THIN); }
    } else if (f[0] === 'stair') {
      const [, x0, x1, y0, y1, st] = f;
      seg(X(x0), X(y0), X(x0), X(y1), C_THIN);
      for (let y = y0; y <= y1 + 0.01; y += st) seg(X(x0), X(y), X(x1), X(y), C_THIN);
      const mx = X((x0 + x1) / 2);
      seg(mx, X(y1 - 1), mx, X(y0 + 2), C_LEAF);
      seg(mx, X(y0 + 2), mx - 1.5, X(y0 + 4), C_LEAF); seg(mx, X(y0 + 2), mx + 1.5, X(y0 + 4), C_LEAF);
    }
  }

  // construction geometry (pixel space): long faint lines and full circles
  const guides = els.map((el) => {
    if (el.t === 'L') {
      const ext = 6;
      return { t: 'L', x0: el.x0 - el.ux * ext, y0: el.y0 - el.uy * ext, x1: el.x1 + el.ux * ext, y1: el.y1 + el.uy * ext };
    }
    // arcs: the circle's own span run on a little either way (never the full circle: two of those would draw an 8)
    const over = Math.min(0.45, (TAU - el.span) / 2);
    return { t: 'C', cx: el.cx, cy: el.cy, r: el.r, a0: el.a0 - over, span: el.span + 2 * over };
  });
  // the drafting pen's path along the skeleton
  const pathAt = (u) => {
    let d = Math.max(0, Math.min(1, u)) * total;
    for (const el of els) {
      if (d <= el.len || el === els[els.length - 1]) {
        const f = Math.min(1, d / el.len);
        if (el.t === 'L') return [el.x0 + (el.x1 - el.x0) * f, el.y0 + (el.y1 - el.y0) * f];
        const a = el.a0 + el.span * f;
        return [el.cx + el.r * Math.sin(a), el.cy - el.r * Math.cos(a)];
      }
      d -= el.len;
    }
    return [0, 0];
  };
  // places worth a detail bubble: the doors and windows
  const feats = P.open.map((o) => {
    const el = els[o.e], t = (o.t0 + o.t1) / 2;
    return el.t === 'L' ? [el.x0 + (el.x1 - el.x0) * t, el.y0 + (el.y1 - el.y0) * t] : [el.cx, el.cy];
  });
  return { n, w, h: hgt, cls, S, guides, pathAt, T, feats, pad: PAD };
}

export const HOUR = { k: 1, T: 7 }, MIN = { k: 0.75, T: 6 };
export const GLYPHS_H = Array.from({ length: 10 }, (_, n) => buildDigit(n, HOUR.k, HOUR.T));
export const GLYPHS_M = Array.from({ length: 10 }, (_, n) => buildDigit(n, MIN.k, MIN.T));
