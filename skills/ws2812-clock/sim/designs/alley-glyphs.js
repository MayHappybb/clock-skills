// Alley glyphs: two neon sign alphabets bent from glass tube, for a 2 mm grid.
//
// BLADE (hours): Hong Kong "outline" neon. Each digit is a fat skeleton whose
// OUTLINE is the tube: two parallel tubes ~9 px apart that turn round every
// end, the hollow bubble letters of vertical blade signs.
// BOX (minutes): one thin tube per digit, bent in one go like a sign-shop
// script, slanted, 8 crossing itself.
//
// A glyph is a list of polylines in a local box (y down). stamp() samples
// one at a fixed grid position into typed arrays: per pixel the tube's core
// and halo intensity and s, how far along the tube (0..1) its nearest point
// is, so a strike can run the plasma along the glass.

const D2R = Math.PI / 180;
function arc(cx, cy, rx, ry, a0, a1) {
  const n = Math.max(4, Math.ceil(Math.abs(a1 - a0) / 9)), pts = [];
  for (let k = 0; k <= n; k++) { const a = (a0 + ((a1 - a0) * k) / n) * D2R; pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]); }
  return pts;
}
function bez(p0, p1, p2, p3, n = 12) {
  const pts = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n, u = 1 - t;
    pts.push([u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]);
  }
  return pts;
}
const join = (...parts) => parts.flat();
const rot = (paths, w, h) => paths.map((p) => p.map(([x, y]) => [w - x, h - y]).reverse());

// ---------------------------------------------------------------- BLADE
// skeleton box 20 x 31; the tube runs at distance R from it.
const BW = 20, BH = 31;
function bladeSix() {
  return [join(bez([17.5, 0], [8, 0.5], [0.5, 7], [0, 19]), arc(10, 21, 10, 10, 180, 540))];
}
const BLADE = {
  0: [join(arc(10, 9.5, 10, 9.5, 180, 360), [[20, 21.5]], arc(10, 21.5, 10, 9.5, 0, 180), [[0, 9.5]])],
  1: [[[4, 6.5], [12, 0], [12, 31]]],
  2: [join(arc(10, 9, 9.5, 9, 195, 380), bez([18.9, 12], [16, 19], [6, 24], [0.5, 31], 10), [[20, 31]])],
  3: [join(arc(9.5, 7.5, 9, 7.5, 200, 450), [[6.5, 15]]), join([[9.5, 15]], arc(10, 23, 10, 8, 270, 520))],
  4: [[[3, 0], [0.5, 20], [20, 20]], [[14.5, 7], [14.5, 31]]],
  5: [join([[19, 0], [1.5, 0], [0.5, 13]], arc(9.5, 21.5, 10.5, 9.5, 220, 515))],
  6: bladeSix(),
  7: [join([[0, 0], [20, 0]], bez([20, 0], [15, 9], [9, 19], [7.5, 31]))],
  8: [arc(10, 7.5, 8, 7.5, -90, 270), arc(10, 22.5, 10, 8.5, -90, 270)],
  9: rot(bladeSix(), BW, BH),
};

// ------------------------------------------------------------------ BOX
// one thin tube; box 21 x 28, slanted when stamped.
const XW = 21, XH = 28;
function boxSix() {
  return [join(bez([18, 1], [8, -1], [0, 7], [0, 18]), arc(10.5, 18.5, 10.5, 9.5, 180, 530))];
}
const BOX = {
  0: [arc(10.5, 14, 10.5, 14, -90, 270)],
  1: [[[5, 6], [13, 0], [13, 28]], [[7, 28], [19, 28]]],
  2: [join(arc(10.5, 8, 9.5, 8, 190, 375), bez([19.7, 10], [17, 18], [6, 21], [0, 28], 10), [[21, 28]])],
  3: [join([[1, 0], [20, 0], [9, 11]], arc(10.5, 19, 10.5, 9, -105, 150))],
  4: [[[16, 28], [16, 0], [0, 19], [21, 19]]],
  5: [join([[20, 0], [3, 0], [1.5, 12]], arc(10, 18.5, 11, 9.5, -145, 155))],
  6: boxSix(),
  7: [join([[0, 0], [21, 0]], bez([21, 0], [15, 9], [9, 18], [7.5, 28]))],
  8: [join(arc(10.5, 7, 8, 7, 90, -270)), join(arc(10.5, 20, 10.5, 8, -90, 270))],
  9: rot(boxSix(), XW, XH),
};

export const STYLE = {
  blade: { glyphs: BLADE, w: BW, h: BH, R: 4.5, slant: 0, core: 0.85, halo: 1.7, reach: 6 },
  box: { glyphs: BOX, w: XW, h: XH, R: 0, slant: 0.14, core: 0.95, halo: 1.6, reach: 5 },
};

/** Segments [ax, ay, bx, by, s0, s1] of a glyph, placed at (ox, oy), s normalised over all tubes. */
function segments(st, paths, ox, oy) {
  const segs = [];
  let L = 0;
  for (const path of paths) {
    for (let k = 0; k + 1 < path.length; k++) {
      const [ax0, ay] = path[k], [bx0, by] = path[k + 1];
      const ax = ax0 + (st.h - ay) * st.slant, bx = bx0 + (st.h - by) * st.slant;
      const len = Math.hypot(bx - ax, by - ay);
      segs.push([ox + ax, oy + ay, ox + bx, oy + by, L, L + len]);
      L += len;
    }
  }
  for (const s of segs) { s[4] /= L; s[5] /= L; }
  return segs;
}

/**
 * Sample a glyph onto a W-wide grid at (ox, oy): { p, core, halo, s, n }.
 * core is the bright glass, halo the glow round it; both 0..1.
 */
export const stamp = (style, digit, ox, oy, W, H) => stampPaths(STYLE[style], STYLE[style].glyphs[digit], ox, oy, W, H);
/** The same for any tube paths (a sign's border); st as in STYLE. */
export function stampPaths(st, paths, ox, oy, W, H) {
  const segs = segments(st, paths, ox, oy);
  const x0 = Math.floor(ox - st.R - st.reach), x1 = Math.ceil(ox + st.w + st.h * st.slant + st.R + st.reach);
  const y0 = Math.floor(oy - st.R - st.reach), y1 = Math.ceil(oy + st.h + st.R + st.reach);
  const P = [], C = [], Hh = [], S = [];
  for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++) {
    for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) {
      let best = 1e9, bs = 0;
      for (const [ax, ay, bx, by, s0, s1] of segs) {
        const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
        let t = L2 ? ((x - ax) * dx + (y - ay) * dy) / L2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = x - ax - t * dx, ey = y - ay - t * dy, d = ex * ex + ey * ey;
        if (d < best) { best = d; bs = s0 + (s1 - s0) * t; }
      }
      const e = Math.abs(Math.sqrt(best) - st.R);              // distance to the glass
      const core = st.core * Math.max(0, 1 - Math.max(0, e - 0.3) / 0.95) ** 1.6;
      const halo = Math.exp(-e / st.halo) * (1 - Math.min(1, e / st.reach));
      if (core + halo < 0.01) continue;
      P.push(y * W + x); C.push(core); Hh.push(halo); S.push(bs);
    }
  }
  return { p: Int32Array.from(P), core: Float32Array.from(C), halo: Float32Array.from(Hh), s: Float32Array.from(S), n: P.length };
}
