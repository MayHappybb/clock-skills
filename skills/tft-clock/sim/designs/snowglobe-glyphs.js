// snowglobe: the glass numerals, and the snow that settles on them.
//
// Each numeral is a solid of clear glass with the same refractive index as
// the water, so it cannot be seen; only the snow that sticks to it shows its
// shape. Here a numeral is its mask (the rounded stroke face of the kit,
// thick), split into clumps: each clump is the patch of snow one flake
// leaves where it lands. Every mask pixel carries a tone (fresh cap on top,
// body, shadow underneath), so a fully settled numeral looks like packed
// snow lit from above, not a flat fill.
//
// Built once at import; nothing here runs per frame.

import { digitSegments, segDist, rng } from '../js/kit.js';

/** Tones a snow pixel can have. */
export const T_SHADE = 0, T_BODY = 1, T_LIT = 2, T_CAP = 3, T_GLINT = 4;

/**
 * Build the ten numerals at one size.
 * @returns {Array<{w,h,x:Int8Array,y:Int8Array,tone:Uint8Array,clump:Uint16Array,
 *   clumps:Array<{cx,cy,first,count}>,edge:{x:Int8Array,y:Int8Array,lit:Uint8Array}}>}
 */
export function buildDigits(w, h, weight, seed) {
  const out = [];
  for (let d = 0; d < 10; d++) out.push(buildDigit(d, w, h, weight, seed * 31 + d));
  return out;
}

function buildDigit(d, w, h, weight, seed) {
  const r = rng(seed);
  const segs = digitSegments(String(d), 0, 0, w, h, weight);
  // a cap of drifted snow can sit one pixel above the glass: the box grows by 1 on top
  const W = w, H = h + 1, OY = 1;
  const inside = new Uint8Array(W * H);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let best = Infinity;
      for (const s of segs) { const e = segDist(x + 0.5, y + 0.5, s[0], s[1], s[2], s[3]); if (e < best) best = e; }
      if (best - weight / 2 <= 0) inside[(y + OY) * W + x] = 1;
    }
  const at = (x, y) => (x >= 0 && y >= 0 && x < W && y < H ? inside[y * W + x] : 0);

  // glass edge (what shows faintly before the snow comes): lit on the upper left, dark on the lower right
  const ex = [], ey = [], el = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!at(x, y)) continue;
      const up = !at(x, y - 1), lf = !at(x - 1, y), dn = !at(x, y + 1), rt = !at(x + 1, y);
      if (up || lf || dn || rt) { ex.push(x); ey.push(y - OY); el.push(up || lf ? 1 : 0); }
    }

  // snow tones, plus drift caps on top surfaces
  const tone = new Int8Array(W * H).fill(-1);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!at(x, y)) continue;
      const up = !at(x, y - 1), dn = !at(x, y + 1), lf = !at(x - 1, y), rt = !at(x + 1, y);
      const up2 = !at(x, y - 2);
      let t = T_BODY;
      if (up) t = T_CAP;
      else if (up2 || lf) t = T_LIT;
      else if (dn || (rt && r() < 0.7)) t = T_SHADE;
      else if (r() < 0.18) t = T_LIT;
      if (r() < 0.035) t = T_GLINT;
      tone[y * W + x] = t;
      if (up && y > 0 && r() < 0.32) tone[(y - 1) * W + x] = T_CAP;
    }

  // clumps: Voronoi cells round seeds scattered over the snow, about 3.5 px each
  const pts = [];
  for (let i = 0; i < W * H; i++) if (tone[i] >= 0) pts.push(i);
  const nSeeds = Math.max(4, Math.round(pts.length / 3.5));
  const pool = pts.slice();
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const seeds = pool.slice(0, nSeeds).map((i) => [i % W, (i / W) | 0]);
  const owner = new Map();
  for (const i of pts) {
    const x = i % W, y = (i / W) | 0;
    let best = Infinity, k = 0;
    for (let s = 0; s < seeds.length; s++) {
      const dx = seeds[s][0] - x, dy = (seeds[s][1] - y) * 1.3, e = dx * dx + dy * dy;
      if (e < best) { best = e; k = s; }
    }
    owner.set(i, k);
  }
  // pack pixels clump by clump
  const byClump = seeds.map(() => []);
  for (const i of pts) byClump[owner.get(i)].push(i);
  const clumps = [], X = [], Y = [], TN = [], CL = [];
  for (const list of byClump) {
    if (!list.length) continue;
    let sx = 0, sy = 0;
    const first = X.length;
    for (const i of list) {
      const x = i % W, y = ((i / W) | 0) - OY;
      X.push(x); Y.push(y); TN.push(tone[i]); CL.push(clumps.length);
      sx += x; sy += y;
    }
    clumps.push({ cx: sx / list.length + 0.5, cy: sy / list.length + 0.5, first, count: list.length });
  }
  return {
    w, h,
    x: Int8Array.from(X), y: Int8Array.from(Y), tone: Uint8Array.from(TN), clump: Uint16Array.from(CL),
    clumps,
    edge: { x: Int8Array.from(ex), y: Int8Array.from(ey), lit: Uint8Array.from(el) },
  };
}
