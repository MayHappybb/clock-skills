// Fountain numerals: each digit is a water sculpture, drawn as centreline
// jets that leave a nozzle at the digit's lowest point and flow outward along
// the strokes, ending in free ends where the water drips off (some with a
// hanging drop: a ball terminal). The paths are in a 0..100 box (y down);
// every stroke is listed in its flow direction.
//
// Rasterised once at load per size into flash tables, per pixel of the box:
//   D  signed distance to the stroke's edge (the jet tapers), quarter px + 64
//   S  arc length along that stroke from its nozzle, whole pixels (0..255)
//   C  signed offset across the stroke, quarter pixels + 128
// plus a 1-bit silhouette (ink with its swell, counters filled, dilated by
// MOAT px) that keeps the background show away from the numerals.

const PATHS = {
  0: [{ p: 'M 50 100 C 14 100 0 86 0 50 C 0 14 14 0 50 0' },
      { p: 'M 50 100 C 86 100 100 86 100 50 C 100 14 86 0 50 0' }],
  1: [{ p: 'M 64 100 L 64 0 C 52 12 34 20 8 24', drip: 1 }],
  2: [{ p: 'M 2 100 L 100 100', drip: 1 },
      { p: 'M 2 100 C 30 74 94 62 96 32 C 98 8 74 0 50 0 C 28 0 8 9 4 27', ball: 1, drip: 1 }],
  3: [{ p: 'M 48 100 C 26 100 8 94 3 80', ball: 1, drip: 1 },
      { p: 'M 48 100 C 80 100 99 88 99 71 C 99 54 80 46 40 46 C 76 46 94 36 94 21 C 94 8 76 0 52 0 C 30 0 12 8 7 20', ball: 1, drip: 1 }],
  4: [{ p: 'M 72 100 L 72 0 C 52 18 20 44 0 68 L 100 68', drip: 1 }],
  5: [{ p: 'M 48 100 C 26 100 8 94 3 80', ball: 1, drip: 1 },
      { p: 'M 48 100 C 82 100 100 86 100 66 C 100 46 82 36 56 36 C 36 36 20 41 10 47 L 14 0 L 100 0', drip: 1 }],
  6: [{ p: 'M 52 100 C 82 100 100 86 100 68 C 100 48 82 37 56 37 C 32 37 12 46 4 60' },
      { p: 'M 52 100 C 18 100 2 84 2 62 C 2 26 22 0 58 0 C 72 0 84 4 92 12', ball: 1, drip: 1 }],
  7: [{ p: 'M 30 100 C 34 62 62 28 100 0 L 0 0', drip: 1 }],
  8: [{ p: 'M 50 100 C 22 100 2 88 2 72 C 2 56 24 48 50 46 C 72 44 91 36 91 23 C 91 10 72 0 50 0' },
      { p: 'M 50 100 C 78 100 98 88 98 72 C 98 56 76 48 50 46 C 28 44 9 36 9 23 C 9 10 28 0 50 0' }],
  9: [{ p: 'M 46 100 C 26 100 10 96 4 86', ball: 1, drip: 1 },
      { p: 'M 46 100 C 78 98 98 72 98 42 C 98 14 78 0 50 0 C 22 0 2 14 2 34 C 2 54 22 64 50 64 C 72 64 90 57 98 45' }],
};

const WIDTH = [1, 0.62, 1, 1, 1, 1, 1, 1, 1, 1];   // the 1 is narrow
export const PAD = 3;    // data box margin round the ink box (swell, balls)
export const MOAT = 3;   // background keeps this far from a numeral
const SP = PAD + MOAT;   // silhouette box margin

function parse(str) {
  const tok = str.trim().split(/\s+/);
  const segs = []; let i = 0, cx = 0, cy = 0;
  while (i < tok.length) {
    const op = tok[i++];
    if (op === 'M') { cx = +tok[i++]; cy = +tok[i++]; }
    else if (op === 'L') { const x = +tok[i++], y = +tok[i++]; segs.push([cx, cy, cx, cy, x, y, x, y]); cx = x; cy = y; }
    else if (op === 'C') { const a = tok.slice(i, i + 6).map(Number); i += 6; segs.push([cx, cy, ...a]); cx = a[4]; cy = a[5]; }
  }
  return segs;
}

/** Rasterise digit `d` for an ink box gw x h (gw = slot width scaled by WIDTH) with stroke `sw`. */
function build(d, slotW, h, sw) {
  const gw = Math.round(slotW * WIDTH[d]);
  const bw = gw + PAD * 2, bh = h + PAD * 2;
  const X = (x) => PAD + sw / 2 + (x / 100) * (gw - sw), Y = (y) => PAD + sw / 2 + (y / 100) * (h - sw);
  const strokes = [], ends = [];
  for (const st of PATHS[d]) {
    const pts = [];
    for (const s of parse(st.p)) {
      const n = 28;
      for (let k = pts.length ? 1 : 0; k <= n; k++) {
        const t = k / n, u = 1 - t;
        const x = u * u * u * s[0] + 3 * u * u * t * s[2] + 3 * u * t * t * s[4] + t * t * t * s[6];
        const y = u * u * u * s[1] + 3 * u * u * t * s[3] + 3 * u * t * t * s[5] + t * t * t * s[7];
        const px = X(x), py = Y(y), q = pts[pts.length - 1];
        if (!q || Math.hypot(px - q[0], py - q[1]) > 0.05) pts.push([px, py]);
      }
    }
    let acc = 0; const arc = [0];
    for (let k = 1; k < pts.length; k++) { acc += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]); arc.push(acc); }
    const free = !!(st.ball || st.drip);
    strokes.push({ pts, arc, ball: !!st.ball, free, L: acc });
    if (st.drip) {
      const e = pts[pts.length - 1], q = pts[Math.max(0, pts.length - 4)], tl = Math.hypot(e[0] - q[0], e[1] - q[1]) || 1;
      ends.push({ x: e[0], y: e[1], s: Math.round(acc), tx: (e[0] - q[0]) / tl, ty: (e[1] - q[1]) / tl });
    }
  }
  const n = bw * bh;
  const D = new Uint8Array(n).fill(255), S = new Uint8Array(n), C = new Uint8Array(n).fill(128);
  // the jet thins as it rises: full at the nozzle, ~0.7 at a free tip
  const rad = (st, s) => (sw / 2) * (st.free ? 1.18 - 0.5 * (s / st.L) : 1.12 - 0.3 * (s / st.L));
  for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) {
    const px = i + 0.5, py = j + 0.5;
    let best = 1e9, bs = 0, bc = 0, bo = 1e9;
    for (const st of strokes) {
      const P = st.pts;
      for (let k = 1; k < P.length; k++) {
        const ax = P[k - 1][0], ay = P[k - 1][1], dx = P[k][0] - ax, dy = P[k][1] - ay;
        const L2 = dx * dx + dy * dy || 1e-9;
        let t = ((px - ax) * dx + (py - ay) * dy) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = ax + dx * t - px, qy = ay + dy * t - py, ds = st.arc[k - 1] + (st.arc[k] - st.arc[k - 1]) * t;
        const dd = Math.hypot(qx, qy), o = dd - rad(st, ds);   // signed distance to this stroke's edge
        if (o < bo) {
          bo = o; best = dd; bs = ds;
          bc = ((px - ax) * dy - (py - ay) * dx) / Math.sqrt(L2);
        }
      }
      if (st.ball) {
        const e = P[P.length - 1], o = Math.hypot(px - e[0], py - e[1]) - (rad(st, st.L) + (sw >= 7 ? 1.3 : 1.1));
        if (o < bo) { bo = o; bs = st.L; bc = 0; }
      }
    }
    const k = j * bw + i;
    // D holds the signed edge distance, quarter px, biased: ink at rest when D <= 64
    D[k] = Math.max(0, Math.min(255, 64 + Math.round(bo * 4)));
    S[k] = Math.min(255, Math.round(bs));
    C[k] = Math.max(0, Math.min(255, 128 + Math.round(bc * 4)));
  }
  // counters: ground enclosed by the rest ink. The jets may swell outward on
  // the beat, but barely inward, so a counter never closes (no 6 or 0 into 8)
  {
    const reach = new Uint8Array(n), st = [];
    for (let i = 0; i < bw; i++) { st.push(i, (bh - 1) * bw + i); }
    for (let j = 0; j < bh; j++) { st.push(j * bw, j * bw + bw - 1); }
    while (st.length) {
      const k = st.pop(); if (reach[k] || D[k] <= 64) continue; reach[k] = 1;
      const x = k % bw, y = (k / bw) | 0;
      if (x > 0) st.push(k - 1); if (x < bw - 1) st.push(k + 1); if (y > 0) st.push(k - bw); if (y < bh - 1) st.push(k + bw);
    }
    for (let k = 0; k < n; k++) if (D[k] > 64 && !reach[k]) D[k] = Math.min(255, D[k] + 7);
  }
  // silhouette: ink with its swell, counters filled, dilated by MOAT
  const sbw = gw + SP * 2, sbh = h + SP * 2, sn = sbw * sbh;
  const solid = new Uint8Array(sn), halo = 64 + 8;
  for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) if (D[j * bw + i] <= halo) solid[(j + MOAT) * sbw + i + MOAT] = 1;
  const out = new Uint8Array(sn), stack = [0]; out[0] = 1;
  while (stack.length) {
    const k = stack.pop(), x = k % sbw, y = (k / sbw) | 0;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < 0 || ny < 0 || nx >= sbw || ny >= sbh) continue;
      const q = ny * sbw + nx; if (!out[q] && !solid[q]) { out[q] = 1; stack.push(q); }
    }
  }
  const SIL = new Uint8Array(sn);
  for (let y = 0; y < sbh; y++) for (let x = 0; x < sbw; x++) {
    let on = 0;
    for (let dy = -MOAT; dy <= MOAT && !on; dy++) for (let dx = -MOAT; dx <= MOAT && !on; dx++) {
      if (dx * dx + dy * dy > MOAT * MOAT + 1) continue;
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < sbw && yy < sbh && !out[yy * sbw + xx]) on = 1;
    }
    SIL[y * sbw + x] = on;
  }
  // the feed: ink columns on the glyph's bottom row, where the nozzle jets come up
  const feed = [];
  const rest = 64;
  for (let i = 0; i < bw; i++) if (D[(PAD + h - 1) * bw + i] <= rest) feed.push(i);
  // ink pixel list (rest ink) for the turn: index into the box
  const ink = [];
  for (let k = 0; k < n; k++) if (D[k] <= rest) ink.push(k);
  return { d, gw, h, sw, bw, bh, D, S, C, sbw, sbh, SIL, ends, feed, ink: Uint16Array.from(ink) };
}

export function makeSet(slotW, h, sw) {
  const set = [];
  for (let d = 0; d < 10; d++) set.push(build(d, slotW, h, sw));
  return set;
}

/** Flash bytes of a set as it would be stored on the device (D, S, C bytes; silhouette bit-packed; ink lists). */
export function flashBytes(set) {
  let b = 0;
  for (const gl of set) b += gl.bw * gl.bh * 3 + Math.ceil(gl.sbw * gl.sbh / 8) + gl.ink.length * 2 + gl.feed.length + gl.ends.length * 4;
  return b;
}
