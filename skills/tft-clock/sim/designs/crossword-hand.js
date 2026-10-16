// crossword: the hand. Hand-printed pencil capitals as stroke paths (in the
// order a person writes them, so the pencil tip can follow the graphite),
// and the pencil itself: a yellow hexagonal HB with a sharpened cone, a
// ferrule and a pink eraser, seen from above with its shadow on the paper.

// Glyphs on a 6 x 8 box (x right, y down), strokes in writing order.
const ell = (cx, cy, rx, ry, a0, a1, n) => {
  const p = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    p.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return p;
};
const PI = Math.PI;

const GLYPHS = {
  A: [[[0, 8], [3, 0], [6, 8]], [[1.1, 5.2], [4.9, 5.2]]],
  B: [[[0, 8], [0, 0]], [[0, 0], [3.8, 0], [5.4, 0.9], [5.4, 3], [3.8, 3.9], [0, 3.9]], [[3.8, 3.9], [5.9, 4.9], [5.9, 7], [4.2, 8], [0, 8]]],
  C: [ell(3.2, 4, 3.1, 4, -0.28 * PI, -1.72 * PI, 12)],
  D: [[[0, 8], [0, 0]], [[0, 0], [3.2, 0], [5.6, 1.6], [6, 4], [5.6, 6.4], [3.2, 8], [0, 8]]],
  E: [[[6, 0], [0, 0], [0, 8], [6, 8]], [[0, 3.9], [4.6, 3.9]]],
  F: [[[6, 0], [0, 0], [0, 8]], [[0, 3.9], [4.6, 3.9]]],
  G: [[...ell(3.2, 4, 3.1, 4, -0.28 * PI, -1.95 * PI, 12), [6.1, 4.6], [3.4, 4.6]]],
  H: [[[0, 0], [0, 8]], [[6, 0], [6, 8]], [[0, 4], [6, 4]]],
  I: [[[3, 0], [3, 8]], [[0.8, 0], [5.2, 0]], [[0.8, 8], [5.2, 8]]],
  J: [[[6, 0], [6, 5.8], [5, 7.6], [3, 8], [1, 7.6], [0, 6]]],
  K: [[[0, 0], [0, 8]], [[6, 0], [0, 5]], [[2, 3.4], [6, 8]]],
  L: [[[0, 0], [0, 8], [6, 8]]],
  M: [[[0, 8], [0, 0], [3, 5.2], [6, 0], [6, 8]]],
  N: [[[0, 8], [0, 0], [6, 8], [6, 0]]],
  O: [ell(3, 4, 3, 4, -0.5 * PI, -2.5 * PI, 16)],
  P: [[[0, 8], [0, 0], [3.9, 0], [5.8, 1.1], [5.8, 3], [3.9, 4.2], [0, 4.2]]],
  Q: [ell(3, 4, 3, 4, -0.5 * PI, -2.5 * PI, 16), [[3.6, 5.6], [6.4, 8.4]]],
  R: [[[0, 8], [0, 0], [3.9, 0], [5.8, 1.1], [5.8, 3], [3.9, 4.2], [0, 4.2]], [[2.6, 4.2], [6, 8]]],
  S: [[[5.8, 1], [4.4, 0], [1.6, 0], [0.2, 1.1], [0.2, 2.7], [1.6, 3.7], [4.4, 4.2], [5.9, 5.3], [5.9, 6.9], [4.4, 8], [1.5, 8], [0, 6.9]]],
  T: [[[0, 0], [6, 0]], [[3, 0], [3, 8]]],
  U: [[[0, 0], [0, 5.8], [1.2, 7.6], [3, 8], [4.8, 7.6], [6, 5.8], [6, 0]]],
  V: [[[0, 0], [3, 8], [6, 0]]],
  W: [[[0, 0], [1.4, 8], [3, 2.6], [4.6, 8], [6, 0]]],
  X: [[[0, 0], [6, 8]], [[6, 0], [0, 8]]],
  Y: [[[0, 0], [3, 4.2], [6, 0]], [[3, 4.2], [3, 8]]],
  Z: [[[0, 0], [6, 0], [0, 8], [6, 8]]],
};

export const glyphOf = (ch) => GLYPHS[ch] ?? GLYPHS.O;

const segLen = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const polyLen = (p) => { let s = 0; for (let i = 1; i < p.length; i++) s += segLen(p[i - 1], p[i]); return s; };

/** The first `len` of a polyline, and where it ends. */
export function polyPart(p, len) {
  const out = [p[0]];
  for (let i = 1; i < p.length; i++) {
    const l = segLen(p[i - 1], p[i]);
    if (len >= l) { out.push(p[i]); len -= l; continue; }
    const u = l ? len / l : 0;
    out.push([p[i - 1][0] + (p[i][0] - p[i - 1][0]) * u, p[i - 1][1] + (p[i][1] - p[i - 1][1]) * u]);
    break;
  }
  return out;
}

/**
 * A letter laid out in world coordinates: strokes, and the timeline the tip
 * follows (ink runs and the hops in the air between them, by weight).
 * `xf(u, v)` maps glyph units to world.
 */
export function layoutLetter(ch, xf) {
  const strokes = glyphOf(ch).map((s) => s.map(([u, v]) => xf(u, v)));
  const runs = [];
  let tot = 0;
  strokes.forEach((s, i) => {
    if (i > 0) {
      const a = strokes[i - 1][strokes[i - 1].length - 1], b = s[0];
      const w = segLen(a, b) / 2.6 + 0.8;
      runs.push({ ink: false, a, b, w }); tot += w;
    }
    const len = polyLen(s), w = len + 0.6;
    runs.push({ ink: true, s, len, w, i }); tot += w;
  });
  return { strokes, runs, tot, start: strokes[0][0], end: strokes[strokes.length - 1][strokes[strokes.length - 1].length - 1] };
}

/**
 * Where a letter is at progress p (0..1): the polylines inked so far and the
 * tip (x, y, lift).
 */
export function letterAt(L, p) {
  if (p >= 1) return { done: L.strokes, tip: [...L.end, 0] };
  let at = p * L.tot;
  const done = [];
  for (const r of L.runs) {
    if (at >= r.w) { if (r.ink) done.push(r.s); at -= r.w; continue; }
    const u = at / r.w;
    if (!r.ink) {
      const x = r.a[0] + (r.b[0] - r.a[0]) * u, y = r.a[1] + (r.b[1] - r.a[1]) * u;
      return { done, tip: [x, y, 0.22 * Math.sin(PI * u)] };
    }
    const part = polyPart(r.s, u * r.len);
    if (part.length > 1) done.push(part);
    const e = part[part.length - 1];
    return { done, tip: [e[0], e[1], 0] };
  }
  return { done: L.strokes, tip: [...L.end, 0] };
}

// ------------------------------------------------------------ the pencil

const C = {
  lead: 0x34343a, leadHi: 0x7a7a84,
  wood: 0xe8c08c, woodDark: 0xc79a62,
  hi: 0xffd94a, mid: 0xf2ae0c, lo: 0xc98400, edgeLine: 0x9a6400,
  ferrule: 0xc3c6cb, ferruleLo: 0x8b9097, ferruleHi: 0xeceef0,
  eraser: 0xea8d8f, eraserLo: 0xc96a70,
  shadow: 0x2a2018,
};
export const PENCIL_LEN = 150;

/**
 * Draw the pencil with its working end at screen (tx, ty), pointing up-left
 * from its body (the body runs off towards angle `ang`, radians, screen).
 * `s` is the scale (camera zoom), `lift` 0 on the paper .. 1 high,
 * `eraser` true to present the eraser end instead of the point.
 */
export function drawPencil(g, tx, ty, ang, s, lift, eraser, shadowOn = true) {
  const dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy, ny = dx;
  const P = (u, v, ox = 0, oy = 0) => [tx + ox + (dx * u + nx * v) * s, ty + oy + (dy * u + ny * v) * s];
  const R = 3.5, r1 = 1.15;
  const aa = { aa: true };
  // The near end layout along the axis.
  const cone0 = eraser ? 0 : 2.6, coneEnd = eraser ? 0 : 12;
  const bodyStart = eraser ? 16 : 12, bodyEnd = PENCIL_LEN;
  if (shadowOn) {
    const ox = (1.2 + 6 * lift) * s, oy = (1.6 + 7.5 * lift) * s;
    const sh = eraser
      ? [P(0, -R, ox, oy), P(bodyEnd, -R, ox, oy), P(bodyEnd, R, ox, oy), P(0, R, ox, oy)]
      : [P(0, 0, ox, oy), P(coneEnd, -R, ox, oy), P(bodyEnd, -R, ox, oy), P(bodyEnd, R, ox, oy), P(coneEnd, R, ox, oy)];
    g.fillPolygon(sh, C.shadow, { aa: true, a: 0.26 - 0.1 * lift });
  }
  if (!eraser) {
    // Wood cone, with the scalloped paint line where the facets end.
    g.fillPolygon([P(cone0, -1.0), P(coneEnd + 1.5, -R), P(coneEnd + 1.5, R), P(cone0, 1.0)], C.wood, aa);
    g.fillPolygon([P(cone0, 0.2), P(coneEnd + 1.5, 1.4), P(coneEnd + 1.5, R), P(cone0, 1.0)], C.woodDark, { aa: true, a: 0.6 });
    g.fillPolygon([P(0, 0), P(cone0 + 0.4, -1.05), P(cone0 + 0.4, 1.05)], C.lead, aa);
    g.thickLine(...P(0.6, -0.15), ...P(cone0, -0.7), 0.6 * s, C.leadHi, { aa: true, a: 0.7 });
  } else {
    // Eraser and ferrule.
    g.fillPolygon([P(0.6, -R + 0.4), P(7, -R), P(7, R), P(0.6, R - 0.4), P(0, 0)], C.eraser, aa);
    g.fillPolygon([P(0.3, 0.8), P(7, 1.4), P(7, R), P(0.6, R - 0.4)], C.eraserLo, { aa: true, a: 0.7 });
    g.fillPolygon([P(7, -R - 0.2), P(16, -R - 0.2), P(16, R + 0.2), P(7, R + 0.2)], C.ferrule, aa);
    for (const u of [8.5, 11.5, 14.5]) g.thickLine(...P(u, -R), ...P(u, R), 0.9 * s, C.ferruleLo, { aa: true, a: 0.8 });
    g.thickLine(...P(7.4, -R + 0.9), ...P(15.6, -R + 0.9), 0.8 * s, C.ferruleHi, { aa: true, a: 0.8 });
  }
  // Three visible facets: lit (upper-left), face, shade.
  const sc = (v) => (eraser ? 0 : 1.6 * (1 - Math.abs(v) / R));   // scallop: facet middles reach further down the cone
  const facet = (v0, v1, c) => g.fillPolygon([
    P(bodyStart - sc(v0) + (eraser ? 0 : 1.3), v0), P(bodyStart - sc((v0 + v1) / 2), (v0 + v1) / 2), P(bodyStart - sc(v1) + (eraser ? 0 : 1.3), v1),
    P(bodyEnd, v1), P(bodyEnd, v0)], c, aa);
  facet(-R, -r1, C.hi);
  facet(-r1, r1, C.mid);
  facet(r1, R, C.lo);
  g.thickLine(...P(bodyStart + 2, r1), ...P(bodyEnd, r1), 0.5 * s, C.edgeLine, { aa: true, a: 0.5 });
  // A gold-foil "HB" stamp suggested by two short dashes on the face.
  g.thickLine(...P(46, -0.2), ...P(50, -0.2), 0.9 * s, 0x6b4a10, { aa: true, a: 0.55 });
  g.thickLine(...P(52, -0.2), ...P(56, -0.2), 0.9 * s, 0x6b4a10, { aa: true, a: 0.55 });
}
