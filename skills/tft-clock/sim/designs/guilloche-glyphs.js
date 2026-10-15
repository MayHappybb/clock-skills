// Guilloche numerals: banknote denomination figures, engraved.
//
// Each figure is drawn once at load as a hard shape on a 4x grid (ellipses,
// wedges, ball terminals: a high-contrast Didone cut, thick stems and
// hairline joins), then turned into a signed distance by an exact distance
// transform and sampled at the panel's pixel centres. From the distance each
// pixel gets a role:
//   moat      just outside: always paper, so the figure stands clear of the ground
//   key       the engraved keyline, 2 px of solid ink
//   white     the white line inside the keyline, 1 px of paper
//   hatch     the inside, ruled with horizontal lines whose weight follows the
//             form: solid in the shadow (bottom-right edges), broken where the
//             light falls (top-left edges)
// Hairlines narrower than ~5 px stay solid keyline: in the engraving they are
// cut as one line.
//
// Flash: per figure and size one byte of role and one byte of run position
// (where the pixel sits along its hatch line, for the burnish), ~63 KB.

const SS = 4;   // design grid per panel pixel

export const ROLE = { OUT: 0, MOAT: 1, KEY_O: 2, KEY_I: 3, WHITE: 4, HATCH: 5 };
// hatch kinds, bits 3-4 of the role byte
export const HK = { PLAIN: 0, SHADOW: 1, LIT: 2 };
export const PAD = 4;   // moat margin around the box

// ------------------------------------------------------------ shapes on the design grid

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let u = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  u = u < 0 ? 0 : u > 1 ? 1 : u;
  const ex = px - ax - u * dx, ey = py - ay - u * dy;
  return Math.sqrt(ex * ex + ey * ey);
}
function inPoly(px, py, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Paint ops onto a grid. Coordinates in panel px of the glyph box; v 1 ink, 0 cut. */
function raster(ops, w, h) {
  const gw = (w + 2 * PAD) * SS, gh = (h + 2 * PAD) * SS;
  const m = new Uint8Array(gw * gh);
  for (let gy = 0; gy < gh; gy++) {
    const py = (gy + 0.5) / SS - PAD;
    for (let gx = 0; gx < gw; gx++) {
      const px = (gx + 0.5) / SS - PAD;
      let v = 0;
      for (const op of ops) {
        let hit = false;
        switch (op[0]) {
          case 'E': { const dx = (px - op[1]) / op[3], dy = (py - op[2]) / op[4]; hit = dx * dx + dy * dy <= 1; break; }
          case 'C': { const dx = px - op[1], dy = py - op[2]; hit = dx * dx + dy * dy <= op[3] * op[3]; break; }
          case 'R': hit = px >= op[1] && px < op[1] + op[3] && py >= op[2] && py < op[2] + op[4]; break;
          case 'L': hit = segDist(px, py, op[1], op[2], op[3], op[4]) <= op[5] / 2; break;
          case 'P': hit = inPoly(px, py, op[1]); break;
        }
        if (hit) v = op[op.length - 1];
      }
      m[gy * gw + gx] = v;
    }
  }
  return { m, gw, gh };
}

// exact squared Euclidean distance transform (Felzenszwalb & Huttenlocher)
function edt1(f, n, d, v, z) {
  let k = 0; v[0] = 0; z[0] = -1e20; z[1] = 1e20;
  for (let q = 1; q < n; q++) {
    let s;
    for (;;) {
      const p = v[k];
      s = ((f[q] + q * q) - (f[p] + p * p)) / (2 * q - 2 * p);
      if (s <= z[k]) { k--; continue; }
      break;
    }
    k++; v[k] = q; z[k] = s; z[k + 1] = 1e20;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const p = v[k];
    d[q] = (q - p) * (q - p) + f[p];
  }
}
function edt(mask, gw, gh, target) {
  const INF = 1e12, n = Math.max(gw, gh);
  const D = new Float64Array(gw * gh);
  for (let i = 0; i < D.length; i++) D[i] = mask[i] === target ? 0 : INF;
  const f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  for (let x = 0; x < gw; x++) {
    for (let y = 0; y < gh; y++) f[y] = D[y * gw + x];
    edt1(f, gh, d, v, z);
    for (let y = 0; y < gh; y++) D[y * gw + x] = d[y];
  }
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) f[x] = D[y * gw + x];
    edt1(f, gw, d, v, z);
    for (let x = 0; x < gw; x++) D[y * gw + x] = d[x];
  }
  return D;
}

// ------------------------------------------------------------ the figures

/** The ops for digit `n` in a w x h box, stem S, hairline T. */
function figure(n, w, h, S, T) {
  const cx = w / 2;
  switch (n) {
    case 0: return [['E', cx, h / 2, cx, h / 2, 1], ['E', cx, h / 2, cx - S, h / 2 - T, 0]];
    case 1: {
      const x0 = cx - S / 2 + 1;
      return [
        ['R', x0, 0, S, h, 1],
        ['P', [[x0 + 0.5, 0], [x0 + 0.5, T * 1.8], [w * 0.1, h * 0.2], [w * 0.1, h * 0.2 - T * 1.3]], 1],
        ['R', w * 0.12, h - T * 1.1, w * 0.78, T * 1.1, 1],
        ['P', [[x0 - 4, h - T * 1.1], [x0, h - T * 1.1 - 4], [x0, h - T * 1.1]], 1],
        ['P', [[x0 + S + 4, h - T * 1.1], [x0 + S, h - T * 1.1 - 4], [x0 + S, h - T * 1.1]], 1],
      ];
    }
    case 2: {
      const by = h * 0.29, ry = h * 0.29;
      return [
        ['E', cx, by, cx, ry, 1], ['E', cx - 0.8, by + 0.6, cx - S * 0.95, ry - T, 0],
        ['R', -1, by, cx + 1, h * 0.3, 0],
        ['P', [[w - S * 1.05, by + 1], [w, by + 1], [S * 0.85, h - T * 1.25], [0, h - T * 1.25]], 1],
        ['R', 0, h - T * 1.35, w, T * 1.35, 1],
        ['R', w - T * 1.1, h - h * 0.12, T * 1.1, h * 0.12, 1],
        ['C', S * 0.62, by, S * 0.62, 1],
      ];
    }
    case 3: {
      const ty = h * 0.25, try_ = h * 0.25, trx = cx * 0.9;
      const bty = h * 0.69, bry = h * 0.31;
      return [
        ['E', cx + 1, ty, trx, try_, 1], ['E', cx + 0.2, ty + 0.4, trx - S * 0.85, try_ - T, 0],
        ['E', cx, bty, cx, bry, 1], ['E', cx - 0.5, bty - 0.4, cx - S, bry - T, 0],
        ['R', -1, h * 0.17, w * 0.47, h * 0.66, 0],
        ['C', S * 0.6 + 1, h * 0.2, S * 0.56, 1],
        ['C', S * 0.62, h * 0.8, S * 0.62, 1],
      ];
    }
    case 4: {
      const sx = w * 0.64 - S / 2, bar = h * 0.66;
      return [
        ['R', sx, 0, S, h, 1],
        ['P', [[sx, 0], [sx + S * 0.6, 0], [T * 1.2, bar], [0, bar]], 1],
        ['R', 0, bar, w, T * 1.3, 1],
        ['R', sx - 3, h - T * 1.1, S + 6, T * 1.1, 1],
      ];
    }
    case 5: {
      const bty = h * 0.67, bry = h * 0.33, vx = w * 0.14;
      return [
        ['R', vx, 0, w * 0.86 - vx + w * 0.14, T * 1.5, 1],
        ['R', w - T * 1.1, 0, T * 1.1, h * 0.1, 1],
        ['R', vx, 0, T * 1.4, h * 0.47, 1],
        ['E', cx, bty, cx, bry, 1], ['E', cx - 0.5, bty + 0.4, cx - S, bry - T, 0],
        ['R', -1, h * 0.38, vx, h * 0.2, 0],
        ['P', [[-1, h * 0.5], [w * 0.45, h * 0.62], [w * 0.45, h * 0.84], [-1, h * 0.84]], 0],
        ['C', S * 0.62, h * 0.81, S * 0.62, 1],
      ];
    }
    case 6: {
      const bty = h * 0.665, bry = h * 0.335;
      return [
        ['E', cx, h / 2, cx, h / 2, 1], ['E', cx + 0.6, h / 2 + 1, cx - S * 0.95, h / 2 - T, 0],
        ['P', [[cx - 1, h * 0.42], [w + 1, h * 0.17], [w + 1, h * 0.6]], 0],
        ['E', cx, bty, cx, bry, 1], ['E', cx, bty, cx - S, bry - T, 0],
        ['C', w - S * 0.58, h * 0.235, S * 0.58, 1],
      ];
    }
    case 7: {
      return [
        ['R', 0, 0, w, T * 1.5, 1],
        ['R', 0, 0, T * 1.1, h * 0.12, 1],
        ['P', [[w - S * 0.75, 0], [w, 0], [w, T * 1.6], [w * 0.42 + S * 0.55, h], [w * 0.42 - S * 0.55, h]], 1],
      ];
    }
    case 8: {
      const ty = h * 0.245, try_ = h * 0.245, trx = cx * 0.86;
      const bty = h * 0.7, bry = h * 0.3;
      return [
        ['E', cx, ty, trx, try_, 1],
        ['E', cx, bty, cx, bry, 1],
        ['E', cx, ty, trx - S * 0.85, try_ - T, 0],
        ['E', cx, bty, cx - S, bry - T, 0],
      ];
    }
  }
  return [];
}

/**
 * The maps for one figure: role byte per pixel (role | kind << 3) and a run
 * byte (0..255, position along its hatch line, left to right), over the box
 * grown by PAD on each side. `bend` lets the hatch lines bow with the form.
 */
function build(n, w, h, S, T) {
  const flip = n === 9;
  const { m, gw, gh } = raster(figure(flip ? 6 : n, w, h, S, T), w, h);
  if (flip) m.reverse();      // 9 is the 6 turned round, as in the engraver's set
  const din = edt(m, gw, gh, 0), dout = edt(m, gw, gh, 1);
  const bw = w + 2 * PAD, bh = h + 2 * PAD;
  const dist = new Float32Array(bw * bh);
  for (let y = 0; y < bh; y++)
    for (let x = 0; x < bw; x++) {
      // the pixel centre falls between design cells 4x+1 and 4x+2: average the four
      let s = 0;
      for (const [ox, oy] of [[1, 1], [2, 1], [1, 2], [2, 2]]) {
        const k = (y * SS + oy) * gw + x * SS + ox;
        s += m[k] ? -Math.sqrt(din[k]) : Math.sqrt(dout[k]);
      }
      dist[y * bw + x] = s / 4 / SS;
    }
  const role = new Uint8Array(bw * bh), run = new Uint8Array(bw * bh);
  for (let y = 0; y < bh; y++)
    for (let x = 0; x < bw; x++) {
      const i = y * bw + x, d = dist[i];
      let r;
      if (d >= 3) r = ROLE.OUT;
      else if (d >= 0) r = ROLE.MOAT;
      else if (d >= -1) r = ROLE.KEY_O;
      else if (d >= -2) r = ROLE.KEY_I;
      else if (d >= -3) r = ROLE.WHITE;
      else r = ROLE.HATCH;
      if (r === ROLE.HATCH) {
        const gx = dist[i + 1] - dist[i - 1], gy = dist[i + bw] - dist[i - bw];
        const gl = Math.hypot(gx, gy) || 1, lit = -(gx + gy) / gl / Math.SQRT2;   // +1 faces the light (top-left)
        let k = HK.PLAIN;
        if (d > -4.6 && lit < -0.35) k = HK.SHADOW;
        else if (d > -4.6 && lit > 0.35) k = HK.LIT;
        r |= k << 3;
      }
      role[i] = r;
    }
  // run positions: each horizontal run of hatch pixels, 0 at its left end, 255 at its right
  for (let y = 0; y < bh; y++) {
    let x = 0;
    while (x < bw) {
      if ((role[y * bw + x] & 7) !== ROLE.HATCH) { x++; continue; }
      let e = x;
      while (e < bw && (role[y * bw + e] & 7) === ROLE.HATCH) e++;
      const L = e - x;
      for (let k = x; k < e; k++) run[y * bw + k] = L > 1 ? Math.round(((k - x) / (L - 1)) * 255) : 128;
      x = e;
    }
  }
  return { w: bw, h: bh, role, run };
}

/** A set of ten figures at one size. */
export function figureSet(w, h, S, T) {
  return Array.from({ length: 10 }, (_, n) => build(n, w, h, S, T));
}
