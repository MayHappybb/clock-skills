// Abyss characters, drawn by coverage into a linear RGB raster (W x H):
// the anglerfish (jaw on a hinge, fangs, eye, lure on its rod) and the
// sperm whale (boxy head, undulating body, flukes).
const clamp = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

function over(img, p, r, g, b, a) {
  img[p] += (r - img[p]) * a; img[p + 1] += (g - img[p + 1]) * a; img[p + 2] += (b - img[p + 2]) * a;
}
function addDot(img, W, H, x, y, rad, r, g, b) {
  const x0 = Math.max(0, Math.ceil(x - rad)), x1 = Math.min(W - 1, Math.floor(x + rad));
  const y0 = Math.max(0, Math.ceil(y - rad)), y1 = Math.min(H - 1, Math.floor(y + rad));
  const k = 1 / (rad * rad);
  for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
    const d2 = ((px - x) ** 2 + (py - y) ** 2) * k;
    if (d2 >= 1) continue;
    const f = (1 - d2) * (1 - d2), p = 3 * (py * W + px);
    img[p] += r * f; img[p + 1] += g * f; img[p + 2] += b * f;
  }
}

// body ellipse in fish space (fish faces -x), and the lower jaw's (underbite)
const BX = 1, BY = -0.5, BRX = 12, BRY = 9.5, JRX = 13.6, JRY = 9.8, HX = 3.5, HY = 2.6;
/** Depth inside an ellipse in px (positive inside). */
function ell(x, y, cx, cy, rx, ry) {
  const e = Math.sqrt(((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2);
  return (1 - e) * (rx < ry ? rx : ry);
}
function tooth(f, big) {
  if (f < 2.2 || f > 16.5) return 0;
  const u = (f - 2.2) / 2.6, k = Math.floor(u), fr = u - k;
  const L = (k % 2 ? 1.7 : 3.4) * (big ? 1 : 0.8) * Math.min(1, (f - 1.2) / 3);
  return L * (1 - Math.abs(2 * fr - 1));
}

/** Mouth tip of the fish in world coordinates for a pose. */
export const SC = 1.35;
export function mouthAt(A) {
  const c = Math.cos(A.tilt), s = Math.sin(A.tilt), mx = -13 * SC, my = 2 * SC;
  return [A.x + c * mx - s * my, A.y + s * mx + c * my];
}

/**
 * A = { x, y, tilt (rad, + = nose up), jaw (rad open), lure (0..1), t, eye (0..1 wide) }
 * dim scales everything.
 */
export function drawAngler(img, W, H, A, dim) {
  const c = Math.cos(A.tilt), s = Math.sin(A.tilt);
  const t = A.t, lure = A.lure;
  // lure tip on its rod (fish space), swaying
  const lx = -18 + 1.6 * Math.sin(t * 1.25), ly = -16 + 1.1 * Math.sin(t * 0.9 + 1);
  const cu = Math.cos(A.jaw * 0.5), su = Math.sin(A.jaw * 0.5);
  const fin = Math.sin(t * 3.1);
  const S = SC, R = 22 * S;
  const x0 = Math.max(0, Math.floor(A.x - R)), x1 = Math.min(W - 1, Math.ceil(A.x + R));
  const y0 = Math.max(0, Math.floor(A.y - R)), y1 = Math.min(H - 1, Math.ceil(A.y + R));
  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      const dx = px - A.x, dy = py - A.y;
      const qx = (c * dx + s * dy) / S, qy = (-s * dx + c * dy) / S;
      let cov = 0, r = 0, g = 0, b = 0, depth = 0, part = 0; // part 1 body 2 tooth 3 mouth 4 eye
      if (qx >= HX) {
        depth = ell(qx, qy, BX, BY, BRX, BRY); if (depth > -0.5 / S) part = 1;
      } else {
        // upper head: undo its opening (rotate about hinge)
        const ax = qx - HX, ay = qy - HY;
        const ux = cu * ax + su * ay + HX, uy = -su * ax + cu * ay + HY;  // upper frame
        const vx = cu * ax - su * ay + HX, vy = su * ax + cu * ay + HY;   // lower frame
        const du = uy <= HY ? ell(ux, uy, BX, BY, BRX, BRY) : -9;
        const dv = vy >= HY ? ell(vx, vy, BX, BY + 0.6, JRX, JRY) : -9;
        if (du > -0.5 / S) { depth = du; part = 1; }
        else if (dv > -0.5 / S) { depth = dv; part = 1; }
        // fangs: hang from the upper jaw line, stand on the lower one
        if (part === 0 || depth < 1.2) {
          const tu = tooth(HX - ux, true), tv = tooth(HX - vx, false);
          if (uy > HY - 0.3 && uy - HY < tu && ell(ux, HY - 0.5, BX, BY, BRX, BRY) > 0) { part = 2; depth = Math.min(1, tu - (uy - HY)); }
          else if (vy < HY + 0.3 && HY - vy < tv && ell(vx, HY + 0.5, BX, BY + 0.6, JRX, JRY) > 0) { part = 2; depth = Math.min(1, tv - (HY - vy)); }
        }
        if (part === 0) {
          const dm = ell(qx, qy, BX, BY + 0.3, BRX, BRY + 0.5);
          if (dm > -0.5 / S) { part = 3; depth = dm; }
        }
      }
      // tail fin and pectoral fin
      if (part === 0 && qx > 9) {
        const half = (qx - 9.5) * 0.9 + 0.8, notch = qx > 15 ? (qx - 15) * 1.2 : -9;
        const aq = Math.abs(qy + 0.3 * Math.sin(t * 2.3 + qx * 0.3));
        if (qx < 19.5 && aq < half && aq > notch * 0.0 - 9 && !(aq < notch)) { part = 5; depth = Math.min(half - aq, 19.5 - qx) ; }
      }
      if (part === 0) continue;
      depth *= S;
      cov = clamp(depth + 0.5);
      // light from the lure (fish space distance)
      const ld2 = (qx - lx) ** 2 + (qy - ly) ** 2;
      const L = lure / (1 + ld2 / 45);
      if (part === 1 || part === 5) {
        // a keyline rim (lit by the lure from above-front), dark mottled skin
        const rim = depth < 1.3 ? 1 : depth < 2.3 ? 0.35 : 0;
        const spot = ((Math.floor(qx * 0.6) * 7 + Math.floor(qy * 0.6) * 13) & 7) === 0 ? 0.55 : 1;
        const sh = (0.75 - 0.04 * qy) * spot;
        const up = clamp(0.5 - qy * 0.08 - qx * 0.03);
        r = 0.06 * sh + (0.07 + 0.16 * up) * rim + 0.07 * L;
        g = 0.036 * sh + (0.06 + 0.2 * up) * rim + 0.10 * L;
        b = 0.04 * sh + (0.05 + 0.1 * up) * rim + 0.04 * L;
        if (part === 5) { r *= 0.8; g *= 0.8; b *= 0.8; }
        if (A.meal > 0) {
          // the swallowed colony glows through the belly
          const bm = A.meal / (1 + ((qx - 1.5) ** 2 + (qy - 3.5) ** 2) / 22);
          r += 0.02 * bm; g += 0.3 * bm; b += 0.55 * bm;
        }
        // pectoral fin: brighter fan behind the eye
        const fx = qx - 5, fy = qy - 3.5 - 0.8 * fin;
        if (fx > -0.5 && fx < 4.5 && Math.abs(fy) < fx * 0.6 + 0.5) { r += 0.08; g += 0.05; b += 0.03; }
        // eye: big pale disc, pupil looking forward-up, a glint
        const ex = qx + 5.2, ey = qy + 3.6, ed = Math.sqrt(ex * ex + ey * ey);
        if (ed < 2.9) {
          const pe = Math.sqrt((ex + 0.9) ** 2 + (ey + 0.5) ** 2);
          const er = 1.35 - 0.5 * A.eye;
          if (pe < er) { r = 0.004; g = 0.004; b = 0.004; }
          else { const w = ed > 2.3 ? 0.35 : 0.7; r = 0.7 * w; g = 0.66 * w; b = 0.3 * w; }
          if (Math.abs(ex + 1.5) < 0.45 && Math.abs(ey + 1.0) < 0.45) { r = 0.9; g = 0.9; b = 0.9; }
          cov = clamp((2.9 - ed) * S + 0.5);
        }
      } else if (part === 2) {
        r = 0.62 + 0.2 * L; g = 0.62 + 0.2 * L; b = 0.5;
      } else if (part === 3) {
        r = 0.07; g = 0.006; b = 0.02;
      }
      over(img, 3 * (py * W + px), r * dim, g * dim, b * dim, cov);
    }
  }
  // the rod: a thin curve from the forehead to the lure, then the lure
  const fx0 = -3, fy0 = -9, fcx = -8, fcy = -24;
  for (let k = 0; k <= 20; k++) {
    const u = k / 20, a = (1 - u) * (1 - u), m = 2 * u * (1 - u), e = u * u;
    const X = (a * fx0 + m * fcx + e * lx) * S, Y = (a * fy0 + m * fcy + e * ly) * S;
    const wx = A.x + c * X - s * Y, wy = A.y + s * X + c * Y;
    addDot(img, W, H, wx, wy, 0.9, 0.14 * dim, 0.10 * dim, 0.06 * dim);
  }
  const wx = A.x + c * lx * S - s * ly * S, wy = A.y + s * lx * S + c * ly * S;
  const fl = lure * dim * (0.85 + 0.15 * Math.sin(t * 5.3) * Math.sin(t * 2.1));
  addDot(img, W, H, wx, wy, 7, 0.05 * fl, 0.09 * fl, 0.02 * fl);
  addDot(img, W, H, wx, wy, 2.4, 0.75 * fl, 1.0 * fl, 0.35 * fl);
  return [wx, wy];
}

/**
 * Sperm whale diving head first. (hx, hy) the head tip, (ux, uy) unit
 * heading, t time; light(y) the ambient light at depth y (0..1).
 */
export function drawWhale(img, W, H, hx, hy, ux, uy, t, light, dim) {
  const Lw = 68;
  const x0 = Math.max(0, Math.floor(Math.min(hx, hx - ux * Lw) - 16)), x1 = Math.min(W - 1, Math.ceil(Math.max(hx, hx - ux * Lw) + 16));
  const y0 = Math.max(0, Math.floor(Math.min(hy, hy - uy * Lw) - 16)), y1 = Math.min(H - 1, Math.ceil(Math.max(hy, hy - uy * Lw) + 16));
  for (let py = y0; py <= y1; py++) {
    const amb = light(py);
    for (let px = x0; px <= x1; px++) {
      const dx = px - hx, dy = py - hy;
      const sAl = -(dx * ux + dy * uy);           // 0 at the head tip, growing to the tail
      if (sAl < -1 || sAl > Lw + 2) continue;
      let n = dx * uy - dy * ux;                  // across
      const sw = sAl / Lw;
      n -= 2.6 * sw * sw * Math.sin(sAl * 0.11 - t * 4.2);
      // half width: the great box head (a third of the whale), body, tail stock, flukes
      let hw;
      if (sAl < 2.5) hw = 7 + sAl * 1.0;
      else if (sAl < 24) hw = 9.5 + 0.03 * (sAl - 2.5);
      else if (sAl < 30) hw = 10.1 - 1.4 * (sAl - 24) / 6;
      else if (sAl < 54) hw = 8.7 - 6.9 * ((sAl - 30) / 24) ** 1.2;
      else if (sAl < 59) hw = 1.8;
      else hw = 1.8 + 11 * Math.sin(Math.PI * Math.min(1, (sAl - 59) / 8)) * (1 - 0.2 * Math.abs(Math.sin(t * 4.2 - 6)));
      let d = hw - Math.abs(n);
      if (sAl < 0.8) d = Math.min(d, sAl + 0.6);
      if (sAl > 66) d = Math.min(d, (67.5 - sAl) * 1.0 - (Math.abs(n) < 2 ? 1.2 - Math.abs(n) * 0.6 : 0));
      if (d <= -0.5) continue;
      const cov = clamp(d + 0.5);
      const side = n / (hw + 0.01);
      // slate grey, lit from above and by the colony's blue; a pale keyline
      const sun = 0.55 + 0.45 * side;
      const wrinkle = sAl > 30 && sAl < 54 ? 0.8 + 0.2 * Math.sin(sAl * 1.5 + n * 0.3) : 1;
      const base = (0.09 + 0.45 * amb * sun) * wrinkle;
      const rim = d < 1.2 ? 0.16 : d < 2.2 ? 0.05 : 0;
      let r = base * 0.6 + rim * 0.55, g = base * 0.7 + rim * 0.8, b = base * 0.85 + rim;
      // squid scars on the head: pale arcs
      if (sAl > 3 && sAl < 24) {
        const sc = Math.sin(sAl * 0.9 + n * 1.3) * Math.sin(sAl * 0.37 - n * 0.6 + 1);
        if (sc > 0.86) { r += 0.06; g += 0.07; b += 0.08; }
      }
      // the narrow underslung jaw and the small eye just behind its corner
      if (sAl > 3 && sAl < 20 && n < -5 && n > -6.6) { r *= 0.3; g *= 0.3; b *= 0.3; }
      if (sAl > 2.5 && sAl < 19 && n < -6.6) { r += 0.03; g += 0.035; b += 0.04; }
      if (Math.hypot(sAl - 21.5, n + 4.6) < 1.2) { r = 0.32; g = 0.34; b = 0.36; }
      // pectoral flipper
      const fpx = sAl - 27, fpn = -n - 8;
      if (fpx > 0 && fpx < 7 && fpn > 0 && fpn < 3.5 - fpx * 0.4) { r = 0.06; g = 0.07; b = 0.09; }
      over(img, 3 * (py * W + px), r * dim, g * dim, b * dim, cov);
    }
  }
}
