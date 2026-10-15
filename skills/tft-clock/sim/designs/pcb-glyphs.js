// The trace typeface for pcb.js: ten numerals drawn the way a layout
// engineer routes a net. Rules of the set:
//   - centrelines run only horizontal, vertical or at 45 degrees;
//   - every 90-degree corner is mitred (a 45-degree chamfer), big bowls get a
//     big mitre, joints a small one; no acute angles anywhere;
//   - a free stroke end finishes on a plated through-hole pad (with drill);
//   - a T-junction or a waist is a via;
//   - pads join their traces through teardrops (a smooth union);
//   - every trace keeps a clearance moat from the ground pour around it.
//
// buildGlyph() bakes a digit at one size into a sparse table over its slot:
// for every pixel near copper, the signed distance to the copper, the
// arclength along the route (for the autorouter) and along the current
// (for the pulses), a bevel shade, the drill coverage, and which pad it
// belongs to. pcb.js looks those up per frame; no distance maths per frame.

import { segDist } from '../js/kit.js';

/** Sizes: slot box, trace / pad / via / drill radii, clearance. Hours are integer-centred (4 px traces), minutes half-centred (3 px). */
export const HOUR = { W: 25, H: 62, L: 4, R: 21, T: 4, B: 58, k: 6, c: 3, rT: 2.0, rP: 3.5, rV: 2.7, rH: 1.35, rVH: 1.0, clr: 2.2 };
export const MIN = { W: 21, H: 46, L: 3.5, R: 17.5, T: 3.5, B: 42.5, k: 5, c: 3, rT: 1.5, rP: 3.0, rV: 2.2, rH: 1.15, rVH: 0.8, clr: 1.9 };

/** Snap a coordinate onto the size's centreline lattice (integers or halves). */
const snapper = (S) => { const off = S.L - Math.floor(S.L); return (v) => Math.round(v - off) + off; };

/** Mitre: points [x, y, c?]; a third element c cuts that corner c px back along both legs. */
function mitre(pts) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (!p[2] || i === 0 || i === pts.length - 1) { out.push([p[0], p[1]]); continue; }
    const a = pts[i - 1], b = pts[i + 1], c = p[2];
    const la = Math.hypot(p[0] - a[0], p[1] - a[1]), lb = Math.hypot(b[0] - p[0], b[1] - p[1]);
    out.push([p[0] + (a[0] - p[0]) * c / la, p[1] + (a[1] - p[1]) * c / la]);
    out.push([p[0] + (b[0] - p[0]) * c / lb, p[1] + (b[1] - p[1]) * c / lb]);
  }
  return out;
}

/**
 * The skeleton of digit d at size S: paths (routed in order), pads (free
 * ends, drilled) and vias (joints).
 */
export function digitGeom(d, S) {
  const sn = snapper(S);
  const { L, R, T, B, k, c } = S, w = R - L, h = B - T;
  let paths = [], pads = [], vias = [];
  switch (+d) {
    case 0: {
      const M = sn(T + h * 0.5), cx = sn(L + w * 0.5);
      paths = [[[cx, B], [L, B, k], [L, T, k], [R, T, k], [R, B, k], [cx, B]]];
      vias = [[cx, B], [cx, M]];
      break;
    }
    case 1: {
      const cx = sn(L + w * 0.62), dd = sn(L + w * 0.42) - L;
      paths = [[[cx - dd, T + dd], [cx, T], [cx, B]]];
      pads = [[cx - dd, T + dd], [cx, B]];
      break;
    }
    case 2: {
      const y1 = sn(B - w - c - 1);
      paths = [[[L, T + k], [L + k, T], [R, T, k], [R, y1], [L, y1 + w], [L, B, c], [R, B]]];
      pads = [[L, T + k], [R, B]];
      break;
    }
    case 3: {
      const M = sn(T + h * 0.45), k2 = sn(L + w * 0.32) - L, xb = sn(L + w * 0.3);
      paths = [
        [[L, T + k], [L + k, T], [R, T, k], [R, M, k2], [xb, M]],
        [[R - k2, M], [R, M + k2], [R, B, k], [L + k, B], [L, B - k]],
      ];
      pads = [[L, T + k], [xb, M], [L, B - k]];
      vias = [[R - k2, M]];
      break;
    }
    case 4: {
      const xv = sn(L + w * 0.74), y2 = sn(T + h * 0.66);
      paths = [
        [[xv, T], [L, T + (xv - L)], [L, y2, c], [R, y2]],
        [[xv, T], [xv, B]],
      ];
      pads = [[xv, T], [R, y2], [xv, B]];
      vias = [[xv, y2]];
      break;
    }
    case 5: {
      const y3 = sn(T + h * 0.42);
      paths = [[[R, T], [L, T, c], [L, y3, c], [R, y3, k], [R, B, k], [L, B]]];
      pads = [[R, T], [L, B]];
      break;
    }
    case 6: {
      const M = sn(T + h * 0.48);
      paths = [[[R, T + k], [R - k, T], [L, T, k], [L, B, k], [R, B, k], [R, M, k], [L, M]]];
      pads = [[R, T + k]];
      vias = [[L, M]];
      break;
    }
    case 7: {
      const xm = sn(L + w * 0.36), y4 = sn(T + h * 0.2);
      paths = [[[L, T], [R, T, c], [R, y4], [xm, y4 + (R - xm)], [xm, B]]];
      pads = [[L, T], [xm, B]];
      break;
    }
    case 8: {
      const cx = (L + R) / 2, M = sn(T + h * 0.44), i = S === HOUR ? 1.5 : 1.0;
      const l2 = L + i, r2 = R - i, ht = cx - l2, hb = cx - L;
      paths = [
        [[cx, M], [l2, M - ht], [l2, T, k], [r2, T, k], [r2, M - ht], [cx, M]],
        [[cx, M], [L, M + hb], [L, B, k], [R, B, k], [R, M + hb], [cx, M]],
      ];
      vias = [[cx, M]];
      break;
    }
    case 9: {
      const M = sn(T + h * 0.52);
      paths = [[[L, B - k], [L + k, B], [R, B, k], [R, T, k], [L, T, k], [L, M, k], [R, M]]];
      pads = [[L, B - k]];
      vias = [[R, M]];
      break;
    }
  }
  return { paths: paths.map(mitre), pads, vias };
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
function smin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

const LX = -0.6, LY = -0.8;   // towards the light (upper left)

/**
 * Bake digit d at size S. Returns
 *   n, ix, iy (Int8: pixel offset from the slot origin), sd (signed distance, px),
 *   lr (route arclength), lp (current arclength), sh (shade -1..1), hole (drill coverage),
 *   node (pad/via index or -1), nz (noise 0..1), y (row in the slot, for the plating front),
 *   segs [{ax, ay, bx, by, L0, len}], nodes [{x, y, L, r, drill}], len (total route length)
 */
export function buildGlyph(d, S) {
  const geo = digitGeom(d, S);
  const segs = [];
  let Lr = 0;
  const pathOff = [], paths = [];
  for (let p = 0; p < geo.paths.length; p++) {
    const pts = geo.paths[p];
    // where this path's current comes from: the arclength of its start on an earlier path
    let off = 0;
    for (const s of segs) {
      if (segDist(pts[0][0], pts[0][1], s.ax, s.ay, s.bx, s.by) < 0.6) {
        const t = Math.hypot(pts[0][0] - s.ax, pts[0][1] - s.ay);
        off = s.P0 + t;
        break;
      }
    }
    pathOff.push(off);
    const pStart = Lr;
    let P = off;
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
      const len = Math.hypot(bx - ax, by - ay);
      if (len < 1e-6) continue;
      segs.push({ ax, ay, bx, by, L0: Lr, P0: P, len, path: p });
      Lr += len; P += len;
    }
    paths.push({ L0: pStart, len: Lr - pStart, segs: segs.filter((q) => q.path === p) });
  }
  const nodes = [
    ...geo.pads.map(([x, y]) => ({ x, y, r: S.rP, drill: S.rH, pad: true })),
    ...geo.vias.map(([x, y]) => ({ x, y, r: S.rV, drill: S.rVH, pad: false })),
  ];
  // each node's place on the route
  for (const nd of nodes) {
    let best = 1e9, L = 0, P = 0;
    for (const s of segs) {
      const e = segDist(nd.x, nd.y, s.ax, s.ay, s.bx, s.by);
      if (e < best - 1e-6) {
        best = e;
        const t = Math.max(0, Math.min(1, ((nd.x - s.ax) * (s.bx - s.ax) + (nd.y - s.ay) * (s.by - s.ay)) / (s.len * s.len)));
        L = s.L0 + t * s.len; P = s.P0 + t * s.len;
      }
    }
    nd.L = L; nd.P = P;
  }
  nodes.sort((a, b) => a.L - b.L);

  const sdAt = (px, py, out) => {
    let dt = 1e9, si = 0;
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i], e = segDist(px, py, s.ax, s.ay, s.bx, s.by);
      if (e < dt) { dt = e; si = i; }
    }
    let dn = 1e9, ni = -1;
    for (let i = 0; i < nodes.length; i++) {
      const nd = nodes[i], e = Math.hypot(px - nd.x, py - nd.y) - nd.r;
      if (e < dn) { dn = e; ni = i; }
    }
    if (out) { out.si = si; out.ni = ni; out.dn = dn; }
    return smin(dt - S.rT, dn, 2.2);
  };

  const m = Math.ceil(S.clr + 2);
  const cap = (S.W + 2 * m) * (S.H + 2 * m);
  const ix = new Int8Array(cap), iy = new Int8Array(cap), sd = new Float32Array(cap), lr = new Float32Array(cap), lp = new Float32Array(cap);
  const rk = new Float32Array(cap), pid = new Int8Array(cap);
  const sh = new Float32Array(cap), hole = new Float32Array(cap), node = new Int8Array(cap), nz = new Float32Array(cap);
  const o = { si: 0, ni: 0, dn: 0 };
  let n = 0;
  for (let y = -m; y < S.H + m; y++)
    for (let x = -m; x < S.W + m; x++) {
      const px = x + 0.5, py = y + 0.5;
      const v = sdAt(px, py, o);
      if (v >= S.clr + 0.5) continue;
      const s = segs[o.si];
      const t = Math.max(0, Math.min(1, ((px - s.ax) * (s.bx - s.ax) + (py - s.ay) * (s.by - s.ay)) / (s.len * s.len)));
      ix[n] = x; iy[n] = y; sd[n] = v;
      lr[n] = s.L0 + t * s.len; lp[n] = s.P0 + t * s.len;
      rk[n] = rankOf(paths[s.path], lr[n]); pid[n] = s.path;
      // bevel: the gradient of the distance, toward the light, near the edge
      const gx = sdAt(px + 0.5, py) - sdAt(px - 0.5, py), gy = sdAt(px, py + 0.5) - sdAt(px, py - 0.5);
      const gl = Math.hypot(gx, gy) || 1;
      let shade = ((gx * LX + gy * LY) / gl) * clamp01(1 - -v / 1.7);
      // drill holes, and the domed pads round them
      const nd = nodes[o.ni];
      let hc = 0, ni = -1;
      if (nd) {
        const dc = Math.hypot(px - nd.x, py - nd.y);
        if (dc < nd.r + S.clr + 0.6) ni = o.ni;
        hc = clamp01(nd.drill - dc + 0.5);
        if (dc < nd.r) {
          const qx = (px - nd.x) / nd.r, qy = (py - nd.y) / nd.r;
          shade = 0.55 * shade + 0.6 * (qx * LX + qy * LY) * (dc > nd.drill ? 1 : 0);
          lr[n] = Math.min(lr[n], nd.L); lp[n] = nd.P;
        }
      }
      sh[n] = Math.max(-1, Math.min(1, shade));
      hole[n] = hc; node[n] = ni;
      nz[n] = ((Math.imul(x + 97, 0x27d4eb2d) ^ Math.imul(y + 31, 0x165667b1)) >>> 8 & 255) / 255;
      n++;
    }
  return { d: +d, n, ix, iy, sd, lr, lp, rk, pid, sh, hole, node, nz, segs, nodes, paths, len: Lr };
}

/** How far along its path (px) a route arclength is from the nearer end: two heads route each path from both ends. */
function rankOf(path, L) {
  const loc = L - path.L0, half = path.len / 2;
  return Math.max(0, Math.min(half, Math.min(loc, path.len - loc)));
}

/** A point on path pa at local arclength loc. */
export function pathPoint(pa, loc) {
  for (const s of pa.segs) {
    const u = (loc - (s.L0 - pa.L0)) / s.len;
    if (u <= 1) { const v = u < 0 ? 0 : u; return [s.ax + (s.bx - s.ax) * v, s.ay + (s.by - s.ay) * v]; }
  }
  const s = pa.segs[pa.segs.length - 1];
  return [s.bx, s.by];
}

/**
 * The autorouter's head at route progress u (0..1): segment by segment, each
 * eased (the head settles at every corner). Returns [L, x, y].
 */
export function routeHead(gl, u) {
  const segs = gl.segs;
  let tot = 0;
  for (const s of segs) tot += 0.35 + Math.pow(s.len, 0.7);
  let acc = 0;
  const target = u * tot;
  for (const s of segs) {
    const dur = 0.35 + Math.pow(s.len, 0.7);
    if (target <= acc + dur) {
      let v = (target - acc) / dur;
      v = v < 0.5 ? 2 * v * v : 1 - 2 * (1 - v) * (1 - v);
      return [s.L0 + v * s.len, s.ax + (s.bx - s.ax) * v, s.ay + (s.by - s.ay) * v];
    }
    acc += dur;
  }
  const s = segs[segs.length - 1];
  return [gl.len + 1, s.bx, s.by];
}

// ------------------------------------------------------------ silkscreen type
// A 3 x 5 silkscreen alphabet (only the characters the board needs), stroked
// like a plotter's vector font: square ends, a pen one pixel wide.
const SILK_ROWS = {
  A: '.#.|#.#|###|#.#|#.#', B: '##.|#.#|##.|#.#|##.', C: '.##|#..|#..|#..|.##', D: '##.|#.#|#.#|#.#|##.',
  E: '###|#..|##.|#..|###', F: '###|#..|##.|#..|#..', G: '.##|#..|#.#|#.#|.##', H: '#.#|#.#|###|#.#|#.#',
  I: '###|.#.|.#.|.#.|###', J: '..#|..#|..#|#.#|.#.', K: '#.#|#.#|##.|#.#|#.#', L: '#..|#..|#..|#..|###',
  M: '#.#|###|###|#.#|#.#', N: '##.|#.#|#.#|#.#|#.#', O: '.#.|#.#|#.#|#.#|.#.', P: '##.|#.#|##.|#..|#..',
  R: '##.|#.#|##.|#.#|#.#', S: '.##|#..|.#.|..#|##.', T: '###|.#.|.#.|.#.|.#.', U: '#.#|#.#|#.#|#.#|###',
  V: '#.#|#.#|#.#|#.#|.#.', W: '#.#|#.#|###|###|#.#', X: '#.#|#.#|.#.|#.#|#.#', Y: '#.#|#.#|.#.|.#.|.#.',
  Z: '###|..#|.#.|#..|###',
  0: '###|#.#|#.#|#.#|###', 1: '.#.|##.|.#.|.#.|###', 2: '##.|..#|.#.|#..|###', 3: '##.|..#|.#.|..#|##.',
  4: '#.#|#.#|###|..#|..#', 5: '###|#..|##.|..#|##.', 6: '.##|#..|###|#.#|###', 7: '###|..#|.#.|.#.|.#.',
  8: '###|#.#|###|#.#|###', 9: '###|#.#|###|..#|##.',
  '-': '...|...|###|...|...', '.': '...|...|...|...|.#.', ' ': '...|...|...|...|...', '+': '...|.#.|###|.#.|...',
};
const SILK = Object.fromEntries(Object.entries(SILK_ROWS).map(([k, v]) => [k, v.replace(/\|/g, '')]));

/** Draw silkscreen text onto canvas c (hard pixels). Returns the x past the end. */
export function silk(c, str, x, y, col, { a = 1 } = {}) {
  let cx = Math.round(x);
  for (const ch of String(str)) {
    const gl = SILK[ch] ?? SILK[' '];
    for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) if (gl[j * 3 + i] === '#') c.pixel(cx + i, y + j, col, { a });
    cx += 4;
  }
  return cx - 1;
}
