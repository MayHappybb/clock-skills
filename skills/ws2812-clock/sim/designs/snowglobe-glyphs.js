// Snowglobe digits: packed-snow numerals for a 64x64 HUB75 panel.
// Each digit is rolled from snow: 3-pixel logs with snowball terminals,
// drawn as centrelines and rasterised once, by 4x4 coverage, into an
// 11 x 15 mask. Every lit pixel of a mask is one "grain" the shake can carry.

export const GW = 11, GH = 15;
const R = 1.5;               // log radius: a 3 px stroke on pixel centres
const BALL = 1.95;           // snowball terminals, a little fatter than the log

// An elliptical arc as points; angles in degrees, 0 = right, 90 = down.
function arc(cx, cy, rx, ry, a0, a1, n = 20) {
  const p = [];
  for (let k = 0; k <= n; k++) {
    const a = ((a0 + (a1 - a0) * k / n) * Math.PI) / 180;
    p.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return p;
}
const cat = (...parts) => parts.flat();

// paths: polylines; balls: snowball terminals [x, y, r]
const DEF = {
  0: { paths: [arc(5, 7, 3.6, 5.6, 0, 360, 40)], balls: [] },
  1: { paths: [[[6, 1.2], [6, 13]], [[6, 1.2], [2.6, 4.2]], [[2.4, 13], [9.4, 13]]], balls: [] },
  2: { paths: [cat(arc(5, 4.6, 3.6, 3.4, 190, 360, 14), [[8.4, 6.2], [5.2, 9.4], [1.4, 13], [9.3, 13]])], balls: [[1.6, 4.1, BALL], [9.1, 12.7, 1.75]] },
  3: { paths: [cat(arc(5, 4, 3.4, 2.9, 195, 450, 22)), cat(arc(5, 9.7, 3.9, 3.4, 270, 515, 24))], balls: [[1.8, 3.4, BALL], [1.5, 11.2, BALL]] },
  4: { paths: [[[7, 1.3], [1.2, 9.8], [9.6, 9.8]], [[7, 1.3], [7, 13]]], balls: [[7, 12.9, 1.8]] },
  5: { paths: [cat([[9, 1.2], [2, 1.2], [1.6, 6.3]], arc(5, 9.4, 3.9, 3.6, 238, 485, 24))], balls: [[9.1, 1.3, 1.8], [1.4, 11.6, BALL]] },
  6: { paths: [cat(arc(7.8, 7.6, 6.6, 6.6, 250, 180, 12)), arc(5.1, 9.6, 3.6, 3.4, 0, 360, 32)], balls: [[8.3, 1.4, BALL]] },
  7: { paths: [[[1.2, 1.2], [9.2, 1.2], [6.6, 6], [4.6, 13]]], balls: [[1.3, 1.3, 1.8], [4.6, 12.8, 1.8]] },
  8: { paths: [arc(5, 3.9, 3.0, 2.75, 0, 360, 28), arc(5, 10, 3.75, 3.1, 0, 360, 32)], balls: [] },
  9: { paths: [cat(arc(2.2, 6.4, 6.6, 6.6, 70, 0, 12)), arc(4.9, 4.4, 3.6, 3.4, 0, 360, 32)], balls: [[1.7, 12.6, BALL]] },
};

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
  let t = L2 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const ex = px - ax - t * dx, ey = py - ay - t * dy;
  return Math.sqrt(ex * ex + ey * ey);
}

function raster(def) {
  const segs = [];
  for (const p of def.paths) for (let k = 0; k + 1 < p.length; k++) segs.push([...p[k], ...p[k + 1]]);
  const m = new Float32Array(GW * GH), S = 4;
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    let hit = 0;
    for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
      const px = x - 0.5 + (sx + 0.5) / S, py = y - 0.5 + (sy + 0.5) / S;
      let inside = false;
      for (const [cx, cy, r] of def.balls) if ((px - cx) ** 2 + (py - cy) ** 2 < r * r) { inside = true; break; }
      if (!inside) for (const s of segs) if (segDist(px, py, s[0], s[1], s[2], s[3]) < R) { inside = true; break; }
      if (inside) hit++;
    }
    m[y * GW + x] = hit / (S * S);
  }
  return m;
}

/** Ten masks, coverage 0..1, GW x GH each. */
export const MASKS = Array.from({ length: 10 }, (_, d) => raster(DEF[d]));

/** ASCII preview, for tuning by eye. */
export function ascii(d) {
  const m = MASKS[d], ch = ' .:-=+*#%@';
  const rows = [];
  for (let y = 0; y < GH; y++) {
    let s = '';
    for (let x = 0; x < GW; x++) s += ch[Math.min(9, Math.round(m[y * GW + x] * 9))];
    rows.push(s);
  }
  return rows;
}
