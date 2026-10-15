// Ice-lantern palace numerals for icelantern.js.
//
// Each digit is a building of sawn ice blocks: straight strokes are walls of
// stacked courses (staggered joints), curved strokes are arches of wedge
// blocks (voussoirs, radial joints). Domed digits carry an onion dome on a
// drum (Harbin's St. Sophia), flat tops carry battlements, the 1 a spire.
// Built once at start-up as signed distances, sampled into per-pixel maps:
//
//   A   ice coverage 0..255 (anti-aliased edge)
//   L   how much LED light the ice passes there 0..255 (block cores dimmer,
//       edges and joints brighter: light refracts at every surface)
//   Wh  white added (frosty snow mortar in the joints, rim glints, bubbles)
//   F   facing 0..255 (128 flat, high = edge turned to the upper-left sun,
//       low = turned away: the blue shadow side by day)
//   K   dark keyline just outside the ice 0..255
//   C   1 where the pixel belongs to the crown (dome, spire, merlons)
//
// Cost: start-up only (two sizes x ten digits); the maps total
// (31 x 56 + 25 x 44) x 10 x 6 bytes = 170 KB unpacked; on the device
// A, L and Wh take a byte each and F, K, C share one (4 + 3 + 1 bits):
// 4 bytes a pixel, 113 KB in flash.

const DEG = Math.PI / 180;

/** Signed distance to a square-capped thick segment. */
function segD(px, py, p, T) {
  const dx = p.x1 - p.x0, dy = p.y1 - p.y0, len = Math.hypot(dx, dy) || 1e-6;
  const ux = dx / len, uy = dy / len;
  const qx = px - p.x0, qy = py - p.y0;
  const a = qx * ux + qy * uy, b = -qx * uy + qy * ux;
  const ext = p.ext ?? T / 2;
  const qa = Math.abs(a - len / 2) - (len / 2 + ext), qb = Math.abs(b) - T / 2;
  const ox = Math.max(qa, 0), oy = Math.max(qb, 0);
  return { d: Math.hypot(ox, oy) + Math.min(Math.max(qa, qb), 0), along: a, across: b };
}

/** Signed distance to an elliptical arc stroke from a0 to a1 (degrees, CCW, y up). */
function arcD(px, py, p, T) {
  const dx = px - p.cx, dy = p.cy - py;          // y up
  const nx = dx / p.rx, ny = dy / p.ry;
  const rho = Math.hypot(nx, ny) || 1e-6;
  const g = Math.hypot(dx / (p.rx * p.rx), dy / (p.ry * p.ry)) / rho || 1e-6;
  const dE = (rho - 1) / g;
  let th = Math.atan2(ny, nx) / DEG;
  while (th < p.a0) th += 360;
  while (th >= p.a0 + 360) th -= 360;
  if (th <= p.a1) return { d: Math.abs(dE) - T / 2, th, dE };
  // beyond either end: a butt cap across the stroke
  let best = 1e9;
  for (const a of [p.a0, p.a1]) {
    const ex = p.cx + p.rx * Math.cos(a * DEG), ey = p.cy - p.ry * Math.sin(a * DEG);
    let tx = -p.rx * Math.sin(a * DEG), ty = -p.ry * Math.cos(a * DEG);   // tangent (screen y down)
    const tl = Math.hypot(tx, ty); tx /= tl; ty /= tl;
    const qx = px - ex, qy = py - ey;
    const al = Math.abs(qx * tx + qy * ty), ac = Math.abs(-qx * ty + qy * tx) - T / 2;
    const d = Math.hypot(al, Math.max(ac, 0)) + Math.min(Math.max(al, ac), 0);
    if (d < best) best = d;
  }
  return { d: best, th, dE };
}

function ellD(px, py, p) {
  const dx = px - p.cx, dy = py - p.cy;
  const rho = Math.hypot(dx / p.rx, dy / p.ry) || 1e-6;
  const g = Math.hypot(dx / (p.rx * p.rx), dy / (p.ry * p.ry)) / rho || 1e-6;
  return (rho - 1) / g;
}

function rectD(px, py, p) {
  const qx = Math.abs(px - (p.x + p.w / 2)) - p.w / 2, qy = Math.abs(py - (p.y + p.h / 2)) - p.h / 2;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0);
}

function polyD(px, py, pts) {
  let d = 1e9, inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    const ex = xi - xj, ey = yi - yj, l2 = ex * ex + ey * ey || 1e-9;
    let u = ((px - xj) * ex + (py - yj) * ey) / l2; u = u < 0 ? 0 : u > 1 ? 1 : u;
    const e = Math.hypot(px - xj - u * ex, py - yj - u * ey);
    if (e < d) d = e;
    if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside ? -d : d;
}

// ------------------------------------------------------------ the ten buildings

/**
 * Primitives for digit `n` in a body box w x h with stroke T (pixels, y down).
 * Crown pieces (above y = 0) are flagged `crown`.
 */
function parts(n, w, h, T, S) {
  const m = T / 2, L = m, R = w - m, Tp = m, B = h - m, cx = w / 2;
  const rx = (R - L) / 2;
  const P = [];
  const seg = (x0, y0, x1, y1, o = {}) => P.push({ t: 'seg', x0, y0, x1, y1, ...o });
  const arc = (cx_, cy_, rx_, ry_, a0, a1) => P.push({ t: 'arc', cx: cx_, cy: cy_, rx: rx_, ry: ry_, a0, a1 });
  // ---- crowns
  const dome = (ax, top) => {
    const dw = S.drumW, dh = S.drumH, brx = S.bulbR, bry = S.bulbR * 0.9;
    P.push({ t: 'rect', x: ax - dw / 2, y: top - dh - 0.6, w: dw, h: dh + 1.2, crown: true, drum: true });
    const by = top - dh - bry + 0.4;
    P.push({ t: 'ell', cx: ax, cy: by, rx: brx, ry: bry, crown: true });
    P.push({ t: 'poly', pts: [[ax - brx * 0.62, by - bry * 0.55], [ax + brx * 0.62, by - bry * 0.55], [ax, by - bry - S.tip]], crown: true });
    P.push({ t: 'seg', x0: ax, y0: by - bry - S.tip + 0.5, x1: ax, y1: by - bry - S.tip - S.spire, ext: 0, w: 1.1, crown: true });
  };
  const spire = (ax, top, half) => {
    P.push({ t: 'poly', pts: [[ax - half, top + 0.4], [ax + half, top + 0.4], [ax, top - S.spireH]], crown: true });
    P.push({ t: 'seg', x0: ax, y0: top - S.spireH + 0.5, x1: ax, y1: top - S.spireH - S.spire, ext: 0, w: 1.1, crown: true });
  };
  const merlons = (x0, x1) => {
    const mw = S.merW, gap = S.merGap, n2 = Math.max(2, Math.round((x1 - x0 + gap) / (mw + gap)));
    const step = (x1 - x0 - mw) / (n2 - 1);
    for (let i = 0; i < n2; i++) P.push({ t: 'rect', x: x0 + i * step, y: -S.merH, w: mw, h: S.merH + 0.6, crown: true });
  };
  const ry = (h - T) / 2;   // full-height bowl half height
  switch (n) {
    case 0: {
      // a tall gate: two walls, arches top and bottom
      const r = rx;
      seg(L, Tp + r * 0.9, L, B - r * 0.9, { ext: 0 }); seg(R, Tp + r * 0.9, R, B - r * 0.9, { ext: 0 });
      arc(cx, Tp + r * 0.9, rx, r * 0.9, 0, 180); arc(cx, B - r * 0.9, rx, r * 0.9, 180, 360);
      dome(cx, 0);
      break;
    }
    case 1: {
      const sx = cx + T * 0.25;
      seg(sx, Tp + 0.5, sx, B - 0.5, { ext: m });
      seg(sx - T * 0.6, Tp + T * 0.15, sx - T * 0.6 - S.flag, Tp + T * 0.15 + S.flag * 0.7, { ext: m * 0.4 });   // the beak
      seg(sx - S.foot, B, sx + S.foot, B, { ext: 0 });                                                       // plinth
      spire(sx, 0, m);
      break;
    }
    case 2: {
      const r = rx, cy = Tp + r * 0.95;
      arc(cx, cy, rx, r * 0.95, -38, 172);
      const ex = cx + rx * Math.cos(-38 * DEG), ey = cy + r * 0.95 * Math.sin(38 * DEG);
      seg(ex, ey, L + 0.3, B - m * 0.6, { ext: m * 0.5 });
      seg(L, B, R, B, { ext: m });
      dome(cx, 0);
      break;
    }
    case 3: {
      // flat battlemented top, a diagonal buttress, a round lower bowl
      const br = (B - h * 0.43) / 2, bcy = B - br;
      seg(L, Tp, R, Tp, { ext: m });
      seg(R - 0.4, Tp + m * 0.6, cx - T * 0.1, bcy - br, { ext: m * 0.5 });
      arc(cx, bcy, rx, br, -155, 90);
      merlons(0, w);
      break;
    }
    case 4: {
      const sx = R - T * 0.35, by = h * 0.68;
      seg(sx, Tp, sx, B, { ext: m });
      seg(sx - 0.3, Tp - m * 0.2, L + 0.2, by - 0.3, { ext: m * 0.45 });
      seg(L, by, R + m * 0.2, by, { ext: m });
      dome(sx, 0);
      break;
    }
    case 5: {
      const mid = h * 0.42, br = (B - mid) / 2, bcy = B - br;
      seg(L, Tp, R, Tp, { ext: m });
      seg(L, Tp, L, mid + 0.2, { ext: m });
      seg(L, mid, cx, mid, { ext: 0 });
      arc(cx - 0.2, bcy, rx + 0.2, br, -152, 90);
      merlons(0, w);
      break;
    }
    case 6: {
      const br = h * 0.29, bcy = B - br;
      arc(cx, bcy, rx, br, 0, 360);
      const tr = rx, tcy = Tp + tr * 1.0;
      seg(L, tcy, L, bcy, { ext: 0 });
      arc(cx, tcy, rx, tr, 40, 180);
      dome(cx - rx * 0.1, 0);
      break;
    }
    case 7: {
      seg(L, Tp, R, Tp, { ext: m });
      seg(R - 0.2, Tp + m * 0.5, cx - T * 0.45, B, { ext: m });
      merlons(0, w);
      break;
    }
    case 8: {
      const r1 = h * 0.22, r2 = (B - (Tp + 2 * r1) + T * 0.5) / 2;
      arc(cx, Tp + r1, rx * 0.86, r1, 0, 360);
      arc(cx, B - r2, rx, r2, 0, 360);
      dome(cx, 0);
      break;
    }
    case 9: {
      const tr = h * 0.29, tcy = Tp + tr;
      arc(cx, tcy, rx, tr, 0, 360);
      const br = rx, bcy = B - br;
      seg(R, tcy, R, bcy, { ext: 0 });
      arc(cx, bcy, rx, br, 220, 360);
      dome(cx, 0);
      break;
    }
  }
  return P;
}

const BUBBLE = (x, y, s) => {
  let h = Math.imul(x * 73856093 ^ y * 19349663 ^ s * 83492791, 0x2c1b3c6d);
  h ^= h >>> 13; h = Math.imul(h, 0x297a2d39); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};

/**
 * Build digit `n` for a slot size: { w, h, ox, oy, A, L, Wh, F, K, C, rowL, rowR }.
 * (ox, oy) is where the body box's top-left sits inside the glyph's arrays.
 */
export function buildGlyph(n, size) {
  const { w, h, T, S } = size;
  const M = 2, CH = S.crownH;
  const GW = w + 2 * M, GH = CH + h + M;
  const P = parts(n, w, h, T, S);
  const N = GW * GH;
  const D = new Float32Array(N), KIND = new Int16Array(N), AUX = new Float32Array(N), AUX2 = new Float32Array(N);
  for (let j = 0; j < GH; j++)
    for (let i = 0; i < GW; i++) {
      const px = i + 0.5 - M, py = j + 0.5 - CH;
      let best = 1e9, kind = -1, aux = 0, aux2 = 0;
      for (let k = 0; k < P.length; k++) {
        const p = P[k];
        let d, a1 = 0, a2 = 0;
        if (p.t === 'seg') { const r = segD(px, py, p, p.w ?? T); d = r.d; a1 = r.along; a2 = r.across; }
        else if (p.t === 'arc') { const r = arcD(px, py, p, T); d = r.d; a1 = r.th; a2 = r.dE; }
        else if (p.t === 'ell') d = ellD(px, py, p);
        else if (p.t === 'rect') d = rectD(px, py, p);
        else d = polyD(px, py, p.pts);
        if (d < best) { best = d; kind = k; aux = a1; aux2 = a2; }
      }
      const q = j * GW + i;
      D[q] = best; KIND[q] = kind; AUX[q] = aux; AUX2[q] = aux2;
    }
  const A = new Uint8Array(N), Lm = new Uint8Array(N), Wh = new Uint8Array(N), F = new Uint8Array(N), K = new Uint8Array(N), C = new Uint8Array(N);
  const rowL = new Int16Array(GH).fill(GW), rowR = new Int16Array(GH).fill(-1);
  const at = (i, j) => D[Math.min(GH - 1, Math.max(0, j)) * GW + Math.min(GW - 1, Math.max(0, i))];
  for (let j = 0; j < GH; j++)
    for (let i = 0; i < GW; i++) {
      const q = j * GW + i, d = D[q];
      const cov = Math.min(1, Math.max(0, 0.5 - d));
      if (d < 2.2) { if (i < rowL[j]) rowL[j] = i; if (i > rowR[j]) rowR[j] = i; }
      if (d > 0) K[q] = Math.round(255 * Math.min(1, Math.max(0, (2.0 - d) / 1.5)));
      if (cov <= 0) continue;
      A[q] = Math.round(cov * 255);
      const p = P[KIND[q]];
      const crown = !!p.crown;
      C[q] = crown ? 1 : 0;
      const depth = -d, by = j - CH, bx = i - M;
      // joints
      let joint = false;
      if (!crown) {
        if (p.t === 'seg') {
          const vert = Math.abs(p.y1 - p.y0) > Math.abs(p.x1 - p.x0);
          if (vert) {
            const r = h - 1 - by, course = Math.floor(r / 4);
            if (r % 4 === 3) joint = true;
            else if (course % 2 === 1 && Math.abs(AUX2[q]) < 0.5) joint = true;
          } else {
            const along = AUX[q] + 50, half = AUX2[q] >= 0 ? 1 : 0;
            if (T >= 6 && Math.abs(AUX2[q]) < 0.5) joint = true;
            else if (Math.floor(along + half * 3) % 6 === 0) joint = true;
          }
        } else if (p.t === 'arc') {
          const rm = (p.rx + p.ry) / 2, span = p.a1 - p.a0, len = span * DEG * rm;
          const nb = Math.max(2, Math.round(len / 5));
          const u = ((AUX[q] - p.a0) / span) * nb, f = u - Math.floor(u);
          const pxw = nb / len;   // one pixel in units of u
          if (f < pxw * 0.9 && u > 0.5 && u < nb - 0.5) joint = true;
        }
      } else if (p.drum) joint = by > -1.4;   // the drum's seat
      // light through the ice
      let lum, wh = 0;
      if (depth < 0.9) { lum = 235; wh = 55; }                       // refraction at the edge
      else if (joint) { lum = 120; wh = 50; }                          // snow-slush joint, frosty and dimmer
      else if (depth < 1.9) { lum = 185; wh = 0; }
      else { lum = 250; wh = 45; if ((bx + by * 2) % 6 === 0) lum -= 30; }   // the bright core, faint saw marks
      if (!crown && depth > 1 && BUBBLE(i, j, n) > 0.96) { lum = 255; wh = 150; }
      if (crown && !p.drum) { lum = Math.min(255, lum + 20); }
      Lm[q] = lum; Wh[q] = wh;
      // facing: the gradient of the distance, toward the upper-left sun
      const gx = at(i + 1, j) - at(i - 1, j), gy = at(i, j + 1) - at(i, j - 1), gl = Math.hypot(gx, gy) || 1;
      const f = (-0.6 * gx - 0.8 * gy) / gl, wgt = Math.max(0, 1 - depth / 2.6);
      F[q] = Math.round(128 + 127 * f * wgt);
    }
  let top = 0;
  while (top < GH - 1 && !A.subarray(top * GW, top * GW + GW).some((v) => v > 0)) top++;
  return { w, h, ox: M, oy: CH, gw: GW, gh: GH, top, A, L: Lm, Wh, F, K, C, rowL, rowR };
}

/** The two slot sizes: the hour towers and the minute wing. */
export const SIZES = {
  hour: { w: 27, h: 42, T: 6.6, S: { crownH: 12, drumW: 4.6, drumH: 2, bulbR: 3.9, tip: 2.6, spire: 2.5, spireH: 7, flag: 4.5, foot: 7.5, merW: 3.2, merGap: 2.4, merH: 2.6 } },
  min: { w: 21, h: 32, T: 5.4, S: { crownH: 10, drumW: 3.6, drumH: 1.6, bulbR: 3.1, tip: 2.1, spire: 2, spireH: 5.5, flag: 3.5, foot: 5.8, merW: 2.6, merGap: 2, merH: 2.2 } },
};
