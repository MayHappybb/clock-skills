// Frost letterforms: each digit is an ice crystal. The skeleton is a few
// paths that grow out of one seed point (a crystal nucleus), drawn with the
// pointed hexagonal roofs of an ice prism; along every path, feather barbs
// branch off forward at 60 degrees, as fern frost does.
//
// buildGlyph() rasterises one digit once into an ARRIVAL-TIME FIELD: for each
// pixel, when the growing crystal reaches it (T, 0 at the seed, ~0.75 where
// the spine ends, 1..1.5 out along the barbs), how much of it the ice covers
// (cov) and the facet orientation there (ang). Growth is then a threshold
// g rising with time: lit = cov * smoothstep(T, T + soft, g). Closed form.
import * as kit from '../js/kit.js';

const R = 0.17; // roof height as a fraction of glyph height (pointed tops)

// Paths in unit box coords [x, y]; each path starts at the glyph's seed or
// at a point of an earlier path (its start arrival is looked up).
// prettier-ignore
export const SKEL = {
  0: [[[.5, 0], [1, R], [1, 1 - R], [.5, 1]], [[.5, 0], [0, R], [0, 1 - R], [.5, 1]]],
  1: [[[.62, 0], [.62, 1]], [[.62, 0], [.1, R * 1.25]]],
  2: [[[1, .4], [1, R], [.5, 0], [0, R]], [[1, .4], [0, 1], [1, 1]]],
  3: [[[.55, .5], [1, .5 - R * .7], [1, R], [.5, 0], [0, R]], [[.55, .5], [1, .5 + R * .7], [1, 1 - R], [.5, 1], [0, 1 - R]], [[.55, .5], [.25, .5]]],
  4: [[[.72, .68], [.72, 0], [0, .68], [.72, .68]], [[.72, .68], [1, .68]], [[.72, .68], [.72, 1]]],
  5: [[[0, .43], [0, 0], [1, 0]], [[0, .43], [.5, .43 - R * .5], [1, .43 + R * .6], [1, 1 - R], [.5, 1], [0, 1 - R]]],
  6: [[[0, .55], [.8, 0]], [[0, .55], [0, 1 - R], [.5, 1], [1, 1 - R], [1, .55 + R * .2], [.5, .5 - R * .6], [0, .55]]],
  7: [[[1, 0], [0, 0]], [[1, 0], [.62, .5], [.35, 1]]],
  8: [[[.5, .47], [.92, .47 - R * .75], [.92, R * .8], [.5, 0], [.08, R * .8], [.08, .47 - R * .75], [.5, .47]],
      [[.5, .47], [1, .47 + R * .8], [1, 1 - R], [.5, 1], [0, 1 - R], [0, .47 + R * .8], [.5, .47]]],
  9: [[[1, .45], [1, R], [.5, 0], [0, R], [0, .45 - R * .2], [.5, .5 + R * .6], [1, .45]], [[1, .45], [.2, 1]]],
};

/**
 * Rasterise digit d in a W x H box (pixels), padded by `pad` each side.
 * Returns { w, h, pad, cov, T, ang, spine } typed arrays of w*h.
 */
export function buildGlyph(d, W, H, seed, { pad = 4, barbLen = 2.6, step = 2.3, room = 2 } = {}) {
  const w = W + 2 * pad, h = H + 2 * pad;
  const els = []; // [ax, ay, bx, by, T0, T1, width, kind]  kind 0 spine 1 barb
  // the skeleton is inset by `room`: barbs grow into that margin and never past the slot
  const sx0 = pad + room, sx1 = pad + W - 1 - room, sy0 = pad + room * 0.8, sy1 = pad + H - 1 - room * 0.8;
  const P = (p) => [sx0 + p[0] * (sx1 - sx0), sy0 + p[1] * (sy1 - sy0)];
  const bx0 = pad - 0.2, bx1 = pad + W - 0.8, by0 = pad - 0.2, by1 = pad + H - 0.8;   // the slot
  const counterFree = d === 1 || d === 7;   // no counters: inside barbs allowed, but short
  const paths = SKEL[d].map((pp) => pp.map(P));
  // arrival distance along each path (pixels from the seed)
  let maxD = 0;
  const known = []; // points with their arrival distance, for branch starts
  const pathD = paths.map((pts) => {
    let d0 = 0, best = 1e9;
    for (const k of known) { const e = Math.hypot(k[0] - pts[0][0], k[1] - pts[0][1]); if (e < 1.5 && k[2] < best) best = k[2]; }
    if (best < 1e9) d0 = best;
    const ds = [d0];
    for (let i = 1; i < pts.length; i++) ds.push(ds[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    pts.forEach((p, i) => known.push([p[0], p[1], ds[i]]));
    maxD = Math.max(maxD, ds[ds.length - 1]);
    return ds;
  });
  const SPINE_END = 0.72;
  const tOf = (dist) => (dist / maxD) * SPINE_END;
  let bi = 0;
  paths.forEach((pts, pi) => {
    const ds = pathD[pi], total = ds[ds.length - 1];
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
      els.push([ax, ay, bx, by, tOf(ds[i - 1]), tOf(ds[i]), 1.45, 0]);
      // barbs: herringbone, both sides, pointing forward along the growth
      const L = ds[i] - ds[i - 1], ux = (bx - ax) / L, uy = (by - ay) / L;
      for (let s = 1.2; s < L - 0.6; s += step) {
        const along = ds[i - 1] + s, fromEnd = Math.min(along - ds[0], total - along);
        const taper = kit.clamp(fromEnd / 4 + 0.25, 0.3, 1);
        for (const side of [-1, 1]) {
          bi++;
          const r = kit.hash(seed, bi, d * 7 + 1);
          const len = barbLen * (0.7 + 0.6 * r) * taper * 1.5; // full (creep) length
          const c = Math.cos(1.0), sn = Math.sin(1.0) * side; // ~57 deg off the spine
          const dx = ux * c - uy * sn, dy = uy * c + ux * sn;
          const ox = ax + ux * s, oy = ay + uy * s;
          // a barb pointing into the skeleton's box would fill a counter or the gap: drop it
          // (on 1 and 7 keep a short one); clip every barb to the slot
          let L2 = len;
          const tx = ox + dx * L2, ty = oy + dy * L2;
          const inside = tx > sx0 + 0.6 && tx < sx1 - 0.6 && ty > sy0 + 0.6 && ty < sy1 - 0.6;
          if (inside) { if (!counterFree) continue; L2 = Math.min(L2, 1.4); }
          for (let it = 0; it < 6; it++) {
            const ex = ox + dx * L2, ey = oy + dy * L2;
            if (ex >= bx0 && ex <= bx1 && ey >= by0 && ey <= by1) break;
            L2 *= 0.75;
          }
          if (L2 < 0.9) continue;
          const t0 = tOf(along) + 0.04 + 0.05 * kit.hash(seed, bi, 99);
          // barb reaches 2/3 of its length at t0 + 0.28: creep continues to 1.5
          els.push([ox, oy, ox + dx * L2, oy + dy * L2, t0, t0 + (0.42 + 0.1 * r) * (L2 / len), 0.85, 1]);
        }
      }
    }
  });
  const N = w * h;
  const cov = new Float32Array(N), T = new Float32Array(N).fill(9), ang = new Float32Array(N), spine = new Float32Array(N);
  for (const [ax, ay, bx, by, t0, t1, wd, kind] of els) {
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - 2)), x1 = Math.min(w - 1, Math.ceil(Math.max(ax, bx) + 2));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by) - 2)), y1 = Math.min(h - 1, Math.ceil(Math.max(ay, by) + 2));
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-6;
    const a = Math.atan2(dy, dx);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const u = kit.clamp(((x - ax) * dx + (y - ay) * dy) / L2);
      const dd = Math.hypot(x - ax - u * dx, y - ay - u * dy);
      const c = 1 - kit.smoothstep(wd / 2 - 0.45, wd / 2 + 0.55, dd);
      if (c <= 0.02) continue;
      const p = y * w + x;
      const t = t0 + (t1 - t0) * u + 0.02 * kit.hash(seed, p, 5);
      const cc = kind === 0 ? c : c * 0.75;
      if (cc > 0.3 && t < T[p]) T[p] = t;
      if (cc > cov[p]) { cov[p] = cc; ang[p] = a; }
      if (kind === 0 && c > spine[p]) spine[p] = c;
    }
  }
  for (let p = 0; p < N; p++) if (T[p] > 8 && cov[p] > 0) T[p] = 1.6;
  return { w, h, pad, cov, T, ang, spine };
}
