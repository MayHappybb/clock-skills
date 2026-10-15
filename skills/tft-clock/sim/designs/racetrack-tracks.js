// Track geometry for racetrack.js: the ten numerals as slot-car layouts.
//
// Each numeral is a centreline drawn as track pieces: straights and
// constant-radius curves (a polyline with a fillet radius per corner, so the
// layout is literally straights + curve pieces). Italic, like a race number.
// From that centreline, built once at load (on the device these are flash
// tables):
//   - a sprite: asphalt, two slots, white edge lines on straights, red/white
//     kerbs on every curve, joint lines between pieces, rubber on the racing
//     line, and the shadow the raised plastic track throws on the grass;
//   - the lanes: the contours at the slot offset (marching squares), which
//     run up one side of a stroke, round the end in a hairpin, and back down
//     the other: every numeral is a closed circuit, whatever its topology;
//   - a car's lap on the longest lane as a table sampled every 1/60 s:
//     position, heading, drift angle and speed, from a speed profile
//     (straight-line top speed, braking and lateral grip limits).
// Flash: the sprites as row spans of their non-empty pixels, 3 bytes each
// (RGB565 + 4-bit track and shadow coverage), ~95 KB for the 29 layouts;
// the lap tables at 7 bytes a sample, ~30 KB.

export const T = 9;              // track width, px
export const LANE = 2.25;        // slot offset from the centreline
export const SLANT = 0.14;       // italic shear
const HALF = T / 2;

// ------------------------------------------------------------ the numerals
// Strokes of [u, v, r]: u, v in the centreline box (0..1), r the fillet
// radius at that corner as a fraction of the box width.
const DIGITS = {
  0: [{ c: true, p: [[0, 0, 0.5], [1, 0, 0.5], [1, 1, 0.5], [0, 1, 0.5]] }],
  1: [{ c: false, p: [[0.08, 0.26, 0], [0.62, 0, 0.12], [0.62, 1, 0]] }],
  2: [{ c: false, p: [[0, 0.2, 0], [0, 0, 0.5], [1, 0, 0.5], [1, 0.4, 0.7], [0, 1, 0.12], [1, 1, 0]] }],
  3: [{ c: false, p: [[0, 0.16, 0], [0, 0, 0.45], [1, 0, 0.45], [1, 0.47, 0.42], [0.3, 0.47, 0]] },
      { c: false, p: [[0.3, 0.47, 0], [1, 0.47, 0.45], [1, 1, 0.45], [0, 1, 0.45], [0, 0.82, 0]] }],
  4: [{ c: false, p: [[0.74, 1, 0], [0.74, 0, 0.1], [0, 0.66, 0.1], [1, 0.66, 0]] }],
  5: [{ c: false, p: [[1, 0, 0], [0.04, 0, 0.1], [0.02, 0.44, 0.15], [1, 0.44, 0.5], [1, 1, 0.5], [0, 1, 0.5], [0, 0.82, 0]] }],
  6: [{ c: false, p: [[0.98, 0.03, 0], [0, 0, 0.5], [0, 1, 0.5], [1, 1, 0.5], [1, 0.46, 0.5], [0, 0.46, 0]] }],
  7: [{ c: false, p: [[0, 0, 0], [1, 0, 0.12], [0.3, 1, 0]] }],
  8: [{ c: true, p: [[0.04, 0, 0.48], [0.96, 0, 0.48], [0, 1, 0.5], [1, 1, 0.5]] }],
  9: [{ c: false, p: [[0.02, 0.97, 0], [1, 1, 0.5], [1, 0, 0.5], [0, 0, 0.5], [0, 0.54, 0.5], [1, 0.54, 0]] }],
};

// ------------------------------------------------------------ pieces

/** Fillet a polyline of [x, y, r] (px) into straights and arcs. */
function fillet(pts, closed) {
  const n = pts.length, cor = [];
  for (let i = 0; i < n; i++) {
    const P = pts[i];
    if (!closed && (i === 0 || i === n - 1)) { cor.push({ a: [P[0], P[1]], b: [P[0], P[1]], arc: null }); continue; }
    const A = pts[(i - 1 + n) % n], Bp = pts[(i + 1) % n];
    let ux = P[0] - A[0], uy = P[1] - A[1]; const l1 = Math.hypot(ux, uy); ux /= l1; uy /= l1;
    let vx = Bp[0] - P[0], vy = Bp[1] - P[1]; const l2 = Math.hypot(vx, vy); vx /= l2; vy /= l2;
    const cr = ux * vy - uy * vx, th = Math.atan2(Math.abs(cr), ux * vx + uy * vy);
    let r = P[2];
    if (r <= 0 || th < 1e-3) { cor.push({ a: [P[0], P[1]], b: [P[0], P[1]], arc: null }); continue; }
    const endA = !closed && i - 1 === 0, endB = !closed && i + 1 === n - 1;
    let t = r * Math.tan(th / 2);
    const tmax = Math.min(l1 * (endA ? 0.95 : 0.5), l2 * (endB ? 0.95 : 0.5));
    if (t > tmax) { t = tmax; r = t / Math.tan(th / 2); }
    const s = cr > 0 ? 1 : -1;
    const ax = P[0] - ux * t, ay = P[1] - uy * t, bx = P[0] + vx * t, by = P[1] + vy * t;
    cor.push({ a: [ax, ay], b: [bx, by], arc: { cx: ax - uy * s * r, cy: ay + ux * s * r, r, s, th } });
  }
  const pieces = [];
  const m = closed ? n : n - 1;
  for (let i = 0; i < m; i++) {
    const c0 = cor[i], c1 = cor[(i + 1) % n];
    pieces.push({ kind: 'S', ax: c0.b[0], ay: c0.b[1], bx: c1.a[0], by: c1.a[1],
      capA: !closed && i === 0, capB: !closed && i === n - 2 });
    if (c1.arc && (closed || i + 1 < n - 1)) pieces.push({ kind: 'A', ax: c1.a[0], ay: c1.a[1], bx: c1.b[0], by: c1.b[1], ...c1.arc });
  }
  return pieces;
}

/** The pieces of numeral d in the box (x, y, w, h), screen px. */
export function digitPieces(d, x, y, w, h) {
  const cw = w - T, ch = h - T, x0 = x + HALF, y0 = y + HALF;
  const out = [];
  for (const st of DIGITS[d]) {
    const pts = st.p.map(([u, v, r]) => [x0 + u * cw + (1 - v) * ch * SLANT, y0 + v * ch, r * cw]);
    out.push(...fillet(pts, st.c));
  }
  return out;
}

// Nearest-piece query; results in module scratch (no allocation).
const Q = { d: 0, kind: 0, along: 0, outer: 0, joint: 0, curve: 0 };
function query(P, px, py) {
  let best = 1e9;
  for (let k = 0; k < P.length; k++) {
    const p = P[k];
    if (p.kind === 'S') {
      const dx = p.bx - p.ax, dy = p.by - p.ay, L2 = dx * dx + dy * dy;
      let u = L2 ? ((px - p.ax) * dx + (py - p.ay) * dy) / L2 : 0;
      const raw = u;
      u = u < 0 ? 0 : u > 1 ? 1 : u;
      const ex = px - p.ax - u * dx, ey = py - p.ay - u * dy, d = Math.hypot(ex, ey);
      if (d < best) {
        best = d;
        const L = Math.sqrt(L2);
        const cap = (raw < 0 && p.capA) || (raw > 1 && p.capB);
        Q.curve = cap ? 1 : 0;
        Q.along = cap ? Math.atan2(ey, ex) * HALF : raw * L;
        // joints: piece ends and every ~13 px along a long straight
        const nseg = Math.max(1, Math.round(L / 13)), seg = L / nseg;
        const a = raw * L, j = cap ? 99 : Math.min(...[0, 1, 2, 3, 4, 5, 6].filter((q) => q <= nseg).map((q) => Math.abs(a - q * seg)));
        Q.joint = j;
      }
    } else {
      const vx = px - p.cx, vy = py - p.cy;
      const e0x = p.ax - p.cx, e0y = p.ay - p.cy, e1x = p.bx - p.cx, e1y = p.by - p.cy;
      if (p.s * (e0x * vy - e0y * vx) >= 0 && p.s * (vx * e1y - vy * e1x) >= 0) {
        const len = Math.hypot(vx, vy), d = Math.abs(len - p.r);
        if (d < best) {
          best = d;
          Q.curve = 1;
          const ang = Math.atan2(e0x * vy - e0y * vx, e0x * vx + e0y * vy) * p.s;
          Q.along = ang * Math.max(p.r, 3);
          const sweep = p.th, nj = Math.max(1, Math.round(sweep / (Math.PI / 4)));
          let j = 99;
          for (let q = 0; q <= nj; q++) j = Math.min(j, Math.abs(ang - (q * sweep) / nj) * len);
          Q.joint = j;
        }
      }
    }
  }
  Q.d = best;
  return Q;
}

// ------------------------------------------------------------ the sprite
const ASPHALT = [0x4c, 0x50, 0x58], SLOT = [0x16, 0x17, 0x1c], BRAID = [0x9a, 0xa0, 0xaa];
const EDGE = [0xf2, 0xf2, 0xee], KERB_R = [0xe0, 0x2a, 0x24], KERB_W = [0xf4, 0xf0, 0xea], RUBBER = [0x30, 0x32, 0x38];
const sat = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const mixc = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];

function hash2(x, y) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

/** Track colour [r, g, b] at a pixel centre, given the nearest-piece query. */
function trackColour(q, px, py) {
  const d = q.d;
  const g = (hash2(px * 7 | 0, py * 13 | 0) - 0.5) * 10;
  let c = [ASPHALT[0] + g, ASPHALT[1] + g, ASPHALT[2] + g];
  // rubber laid down on the racing line through the curves
  if (q.curve) c = mixc(c, RUBBER, 0.35 * sat(1.4 - Math.abs(d - LANE) * 0.6));
  // piece joints
  if (d < HALF - 1.4) c = mixc(c, [0x2c, 0x2e, 0x34], 0.75 * sat(0.9 - q.joint));
  // the slots, with their braid either side
  const sd = Math.abs(d - LANE);
  c = mixc(c, BRAID, 0.45 * sat(1.6 - sd) * sat(sd * 2 - 0.4));
  c = mixc(c, SLOT, sat(1.05 - sd * 1.1));
  // the outer edge: kerbs on curves, a white line on straights
  if (q.curve) {
    const stripe = Math.floor(q.along / 2.2) & 1;
    const k = sat((d - (HALF - 2.0)) * 1.6 + 0.5);
    c = mixc(c, stripe ? KERB_W : KERB_R, k);
  } else {
    const k = sat(1 - Math.abs(d - (HALF - 0.9)) * 1.4);
    c = mixc(c, EDGE, k);
  }
  return c;
}

/**
 * Build the sprite for a numeral: a box with colour per pixel (0xRRGGBB),
 * track coverage ta and shadow coverage sa (0..255), plus the alpha-only
 * silhouette the lifted assembly casts.
 */
export function buildSprite(d, x, y, w, h) {
  const P = digitPieces(d, x, y, w, h);
  const bx = Math.floor(x) - 2, by = Math.floor(y) - 2;
  const bw = Math.ceil(w + (h - T) * SLANT) + 6, bh = Math.ceil(h) + 6;
  const n = bw * bh;
  const col = new Uint32Array(n), ta = new Uint8Array(n), sa = new Uint8Array(n);
  for (let j = 0; j < bh; j++)
    for (let i = 0; i < bw; i++) {
      const px = bx + i + 0.5, py = by + j + 0.5, k = j * bw + i;
      const q = query(P, px, py);
      const cov = sat(HALF - q.d + 0.5);
      if (cov > 0) {
        const c = trackColour(q, px, py);
        col[k] = (clamp255(c[0]) << 16) | (clamp255(c[1]) << 8) | clamp255(c[2]);
        ta[k] = Math.round(cov * 15) * 17;            // 4-bit coverage, as stored
      }
      const qs = query(P, px - 1.2, py - 1.6);
      sa[k] = Math.round(sat(HALF - qs.d + 0.5) * 0.42 * 15) * 17;
    }
  return { x: bx, y: by, w: bw, h: bh, col, ta, sa, pieces: P };
}
const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

// ------------------------------------------------------------ the lanes
/** Closed contours at the slot offset, as point lists, longest first. */
export function lanes(P, box) {
  const S = 0.25;
  const x0 = box.x, y0 = box.y, NX = Math.ceil(box.w / S), NY = Math.ceil(box.h / S);
  const f = new Float32Array((NX + 1) * (NY + 1));
  for (let j = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) f[j * (NX + 1) + i] = query(P, x0 + i * S, y0 + j * S).d - LANE;
  const V = (i, j) => f[j * (NX + 1) + i];
  const H_ = (i, j) => (j * (NX + 1) + i) * 2, V_ = (i, j) => (j * (NX + 1) + i) * 2 + 1;
  const pos = new Map(), adj = new Map();
  const point = (e) => {
    if (pos.has(e)) return;
    const base = e >> 1, i = base % (NX + 1), j = (base / (NX + 1)) | 0;
    let a, b, ax, ay, bx2, by2;
    if ((e & 1) === 0) { a = V(i, j); b = V(i + 1, j); ax = i; ay = j; bx2 = i + 1; by2 = j; }
    else { a = V(i, j); b = V(i, j + 1); ax = i; ay = j; bx2 = i; by2 = j + 1; }
    const u = a / (a - b);
    pos.set(e, [x0 + (ax + (bx2 - ax) * u) * S, y0 + (ay + (by2 - ay) * u) * S]);
  };
  const link = (e1, e2) => {
    point(e1); point(e2);
    if (!adj.has(e1)) adj.set(e1, []); if (!adj.has(e2)) adj.set(e2, []);
    adj.get(e1).push(e2); adj.get(e2).push(e1);
  };
  for (let j = 0; j < NY; j++)
    for (let i = 0; i < NX; i++) {
      const v0 = V(i, j), v1 = V(i + 1, j), v2 = V(i + 1, j + 1), v3 = V(i, j + 1);
      const c = (v0 < 0 ? 1 : 0) | (v1 < 0 ? 2 : 0) | (v2 < 0 ? 4 : 0) | (v3 < 0 ? 8 : 0);
      if (c === 0 || c === 15) continue;
      const e0 = H_(i, j), e1 = V_(i + 1, j), e2 = H_(i, j + 1), e3 = V_(i, j);
      const mid = (v0 + v1 + v2 + v3) / 4 < 0;
      switch (c) {
        case 1: case 14: link(e3, e0); break;
        case 2: case 13: link(e0, e1); break;
        case 3: case 12: link(e3, e1); break;
        case 4: case 11: link(e1, e2); break;
        case 6: case 9: link(e0, e2); break;
        case 7: case 8: link(e3, e2); break;
        case 5: if (mid) { link(e0, e1); link(e2, e3); } else { link(e3, e0); link(e1, e2); } break;
        case 10: if (mid) { link(e3, e0); link(e1, e2); } else { link(e0, e1); link(e2, e3); } break;
      }
    }
  const seen = new Set(), loops = [];
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    const loop = [];
    let prev = -1, cur = start;
    while (!seen.has(cur)) {
      seen.add(cur); loop.push(pos.get(cur));
      const nb = adj.get(cur);
      const nxt = nb[0] !== prev ? nb[0] : nb[1];
      prev = cur; cur = nxt;
      if (cur === undefined) break;
    }
    if (loop.length > 20) loops.push(loop);
  }
  return loops.map(resample).sort((a, b) => b.length - a.length);
}

/** Resample a closed polyline every 0.5 px and smooth it; oriented clockwise on screen. */
function resample(pts) {
  const n = pts.length, cum = [0];
  for (let i = 1; i <= n; i++) { const a = pts[i - 1], b = pts[i % n]; cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  const L = cum[n], m = Math.round(L / 0.5), out = [];
  let k = 0;
  for (let q = 0; q < m; q++) {
    const s = (q * L) / m;
    while (cum[k + 1] < s) k++;
    const a = pts[k], b = pts[(k + 1) % n], u = (s - cum[k]) / (cum[k + 1] - cum[k] || 1);
    out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]);
  }
  for (let pass = 0; pass < 3; pass++) {
    const c = out.map((p) => [...p]);
    for (let i = 0; i < m; i++) {
      const a = c[(i - 1 + m) % m], b = c[(i + 1) % m];
      out[i][0] = 0.25 * a[0] + 0.5 * c[i][0] + 0.25 * b[0];
      out[i][1] = 0.25 * a[1] + 0.5 * c[i][1] + 0.25 * b[1];
    }
  }
  let area = 0;
  for (let i = 0; i < m; i++) { const a = out[i], b = out[(i + 1) % m]; area += a[0] * b[1] - b[0] * a[1]; }
  if (area < 0) out.reverse();     // y is down: positive area = clockwise on screen
  return out;
}

// ------------------------------------------------------------ the lap
export const VMAX = 105, ACC = 150, BRK = 260, ALAT = 520, DT = 1 / 60;

/**
 * A lap of a lane as a table every DT seconds: x, y, heading, drift, speed.
 * Returned as typed arrays (flash tables on the device).
 */
export function lapTable(pts) {
  const m = pts.length, ds = 0.5;
  const head = new Float32Array(m), kap = new Float32Array(m);
  for (let i = 0; i < m; i++) {
    const a = pts[(i - 1 + m) % m], b = pts[(i + 1) % m];
    head[i] = Math.atan2(b[1] - a[1], b[0] - a[0]);
  }
  for (let i = 0; i < m; i++) {
    let dh = head[(i + 1) % m] - head[(i - 1 + m) % m];
    while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
    kap[i] = dh / (2 * ds);
  }
  // smooth curvature over ~3 px
  const ks = new Float32Array(m);
  for (let i = 0; i < m; i++) { let s = 0; for (let q = -3; q <= 3; q++) s += kap[(i + q + m) % m]; ks[i] = s / 7; }
  const v = new Float32Array(m);
  for (let i = 0; i < m; i++) v[i] = Math.min(VMAX, Math.sqrt(ALAT / Math.max(1e-4, Math.abs(ks[i]))));
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 1; i <= m; i++) { const a = v[(i - 1) % m], k = i % m; v[k] = Math.min(v[k], Math.sqrt(a * a + 2 * ACC * ds)); }
    for (let i = m - 1; i >= -m; i--) { const k = (i + m) % m, b = v[(k + 1) % m]; v[k] = Math.min(v[k], Math.sqrt(b * b + 2 * BRK * ds)); }
  }
  const tcum = new Float32Array(m + 1);
  for (let i = 0; i < m; i++) tcum[i + 1] = tcum[i] + ds / ((v[i] + v[(i + 1) % m]) / 2);
  const lap = tcum[m], n = Math.ceil(lap / DT);
  const X = new Float32Array(n), Y = new Float32Array(n), HD = new Float32Array(n), BE = new Float32Array(n), SP = new Float32Array(n);
  let k = 0;
  for (let q = 0; q < n; q++) {
    const t = (q * lap) / n;
    while (tcum[k + 1] < t) k++;
    const u = (t - tcum[k]) / (tcum[k + 1] - tcum[k]);
    const a = pts[k], b = pts[(k + 1) % m];
    X[q] = a[0] + (b[0] - a[0]) * u; Y[q] = a[1] + (b[1] - a[1]) * u;
    let dh = head[(k + 1) % m] - head[k];
    while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
    HD[q] = head[k] + dh * u;
    SP[q] = v[k] + (v[(k + 1) % m] - v[k]) * u;
    // drift: the nose points into the turn, by the lateral load
    const lat = ks[k] * SP[q] * SP[q] / ALAT;
    BE[q] = Math.max(-0.75, Math.min(0.75, lat * 0.62));
  }
  // the drift builds and lets go with the car's inertia: smooth it in time (a lag), twice round
  let b = BE[n - 1];
  for (let pass = 0; pass < 2; pass++) for (let q = 0; q < n; q++) { b += (BE[q] - b) * 0.17; if (pass) BE[q] = b; }
  return { n, lap: n * DT, X, Y, HD, BE, SP };
}
