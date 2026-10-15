// Papercut numerals: one family of hand-cut paper digits, drawn as
// skeletons with a knife-cut stroke (thick verticals, thinner horizontals,
// the way a scalpel follows a pencilled line) and rasterised at 4x into
// masks. The hours are cut big, as limestone towers standing in the lake;
// the minutes small, as pop-up cards on the near shore.
//
// A mask texel is 0 (no paper), 1 (paper) or 2 (paper on an upward-facing
// cut edge: where the lamp above catches it).

const deg = Math.PI / 180;
/** Points along an ellipse arc, angles in degrees (y down: 90 is the bottom). */
function E(cx, cy, rx, ry, a0 = 0, a1 = 360) {
  const n = Math.max(10, Math.round(Math.abs(a1 - a0) / 8)), p = [];
  for (let i = 0; i <= n; i++) {
    const a = (a0 + ((a1 - a0) * i) / n) * deg;
    p.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return p;
}
/** Quadratic Bezier as points. */
function Q(a, c, b, n = 12) {
  const p = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    p.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]);
  }
  return p;
}

// Skeletons in a 10 x 16 unit box (stroke centres), y down.
export const SKEL = {
  0: [E(5, 8, 3.55, 6.45)],
  1: [[[2.4, 4.3], [5.7, 1.4], [5.7, 14.6]]],
  2: [[...E(5, 5.0, 3.5, 3.6, 192, 384), [1.4, 14.6], [8.9, 14.6]]],
  3: [[[1.8, 1.4], [8.4, 1.4], [4.6, 6.6]], [...E(5, 10.6, 3.7, 4.0, 240, 520)]],
  4: [[[6.7, 14.6], [6.7, 1.4], [1.1, 10.6], [9.1, 10.6]]],
  5: [[[8.6, 1.4], [2.9, 1.4], [2.5, 7.3]], E(5.0, 10.4, 3.7, 4.2, 232, 510)],
  6: [E(5, 10.6, 3.6, 3.95), E(9.6, 10.4, 8.0, 9.0, 180, 251)],
  7: [[[1.1, 1.4], [8.9, 1.4], ...Q([8.9, 1.4], [5.4, 7.0], [4.6, 14.6]).slice(1)]],
  8: [E(5, 4.45, 3.05, 3.05), E(5, 10.85, 3.65, 3.75)],
  9: [E(5, 5.4, 3.6, 3.95), E(0.4, 5.6, 8.0, 9.0, 0, 71)],
};

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
  let t = L2 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const ex = px - ax - t * dx, ey = py - ay - t * dy;
  return Math.sqrt(ex * ex + ey * ey);
}

/**
 * Rasterise digit `ch` with an ink box of W x H px: stroke `wv` px on
 * vertical runs, `wh` on horizontal ones. `rough` (px) wobbles the cut edge
 * like a hand-held knife; `seed` keeps it the same each time.
 * Returns { data (Uint8 at 4x), mw, mh, pad, W, H }.
 */
export function glyphMask(ch, W, H, { wv = 3, wh = 2.4, pad = 2, rough = 0, seed = 1, tufts = 0, bush = 0 } = {}) {
  const sx = W / 10, sy = H / 16;
  const segs = [];
  for (const line of SKEL[ch]) {
    for (let k = 0; k + 1 < line.length; k++) {
      const ax = pad + line[k][0] * sx, ay = pad + line[k][1] * sy;
      const bx = pad + line[k + 1][0] * sx, by = pad + line[k + 1][1] * sy;
      const len = Math.hypot(bx - ax, by - ay) || 1;
      const w = wh + (wv - wh) * Math.abs(by - ay) / len;
      segs.push(ax, ay, bx, by, w / 2);
    }
  }
  const mw = Math.ceil((W + 2 * pad) * 4), mh = Math.ceil((H + 2 * pad) * 4);
  const inside = new Uint8Array(mw * mh);
  for (let j = 0; j < mh; j++) {
    const py = (j + 0.5) / 4;
    for (let i = 0; i < mw; i++) {
      const px = (i + 0.5) / 4;
      let d = 1e9;
      for (let s = 0; s < segs.length; s += 5) {
        const e = segDist(px, py, segs[s], segs[s + 1], segs[s + 2], segs[s + 3]) - segs[s + 4];
        if (e < d) d = e;
      }
      if (rough) d += rough * (Math.sin(px * 1.7 + seed) * Math.sin(py * 1.3 + seed * 2.1) + 0.5 * Math.sin(px * 3.9 - py * 2.7 + seed));
      inside[j * mw + i] = d < 0 ? 1 : 0;
    }
  }
  // little pines on the tower tops: cut into the same sheet, standing on
  // the highest edge of each stretch of the glyph
  if (tufts) {
    const top = new Int32Array(mw).fill(-1);
    for (let i = 0; i < mw; i++) for (let j = 0; j < mh; j++) if (inside[j * mw + i]) { top[i] = j; break; }
    let next = Math.floor(6 + 6 * Math.abs(Math.sin(seed * 7.1)));
    for (let i = 2; i < mw - 2; i++) {
      if (i < next || top[i] < 0) continue;
      // only on a fairly level stretch
      if (Math.abs(top[i - 2] - top[i]) > 4 || Math.abs(top[i + 2] - top[i]) > 4 || top[i - 2] < 0 || top[i + 2] < 0) continue;
      const h = (2.4 + 1.2 * Math.abs(Math.sin(i * 1.37 + seed))) * tufts * 4, hw = 0.32 * h;
      for (let j = Math.max(0, Math.floor(top[i] - h)); j <= top[i] + 2; j++)
        for (let ii = Math.max(0, Math.floor(i - hw)); ii <= Math.min(mw - 1, Math.ceil(i + hw)); ii++) {
          const f = (top[i] + 1 - j) / h;                       // 0 at the foot, 1 at the tip
          if (f <= 1 && Math.abs(ii - i) <= hw * (1 - f) + 0.5) inside[j * mw + ii] = 1;
        }
      next = i + Math.floor(22 + 30 * Math.abs(Math.sin(i * 2.3 + seed)));
    }
  }
  // bushes: a scalloped crown of little round shrubs along each top edge
  if (bush) {
    const tops = [];
    for (let i = 0; i < mw; i++) for (let j = 1; j < mh; j++) if (inside[j * mw + i] && !inside[(j - 1) * mw + i]) tops.push(i, j);
    const r4 = bush * 4;
    for (let k = 0; k < tops.length; k += 2) {
      const i = tops[k], j = tops[k + 1];
      if ((i + Math.floor(j / 6)) % 7 !== 0) continue;                       // a shrub every ~1.75 px
      const rr = r4 * (0.75 + 0.5 * Math.abs(Math.sin(i * 0.71 + j * 0.37 + seed)));
      const cy = j + rr * 0.35;
      for (let jj = Math.max(0, Math.floor(cy - rr)); jj <= Math.min(mh - 1, cy + rr); jj++)
        for (let ii = Math.max(0, Math.floor(i - rr)); ii <= Math.min(mw - 1, i + rr); ii++)
          if ((ii - i) ** 2 + (jj - cy) ** 2 < rr * rr) inside[jj * mw + ii] = 1;
    }
  }
  const data = new Uint8Array(mw * mh);
  for (let j = 0; j < mh; j++) for (let i = 0; i < mw; i++) {
    const p = j * mw + i;
    if (!inside[p]) continue;
    // an up-facing edge: no paper within the last ~0.75 px above
    const up = j >= 3 ? inside[p - 3 * mw] : 0;
    data[p] = up ? 1 : 2;
  }
  return { data, mw, mh, pad, W, H };
}
