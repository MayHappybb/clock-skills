// The numerals of "tomb": ten signs of the hieroglyphic script, each one the
// body of a numeral. Every digit is a set of centre lines; each line is a
// creature or a thing of the tomb wall:
//   SNAKE  a serpent (the cobra and horned-viper signs): head at one end with
//          an eye, the tail tapering at the other, chevron bands that slither
//   REED   the flowering reed (the "i" sign): a green stem with nodes; its
//          leaf is the numeral's flag
//   ROPE   twisted flax / the shen ring: an ochre cord whose twist turns
// 0 shen ring (rope), 1 reed, 2 3 5 6 9 serpents, 4 a serpent coiled on a
// reed staff (the reed is drawn over it), 7 a reed with a long leaf, 8 the
// twisted-flax sign (two rope loops).
//
// At load each digit is rasterised at two sizes (hours, minutes) into
// per-pixel tables over its box plus a margin:
//   MAT  Uint8: 0 ground, 1 keyline, 2 body, 3 eye, 4 head (no bands)
//   U    Uint8: arc length along the line at the nearest point, px (closed
//        loops rescaled to a whole number of pattern periods)
//   V    Int8: signed distance across the line, half pixels
//   S    Uint8: which line (index into the digit's lines)
// 4 bytes a pixel; hours 36 x 60, minutes 29 x 46 boxes: 86 KB + 53 KB,
// ~140 KB of flash for both sets.

export const SNAKE = 0, REED = 1, ROPE = 2;
export const M = 3;                     // raster margin around the glyph box

const arc = (cx, cy, rx, ry, a0, a1, n = 48) => {
  const p = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + (a1 - a0) * (i / n)) * Math.PI) / 180;
    p.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return p;
};
const seg = (x0, y0, x1, y1, n = 12) => {
  const p = [];
  for (let i = 0; i <= n; i++) p.push([x0 + (x1 - x0) * (i / n), y0 + (y1 - y0) * (i / n)]);
  return p;
};
const cat = (...parts) => {
  const out = [];
  for (const p of parts) for (const q of p) {
    const l = out[out.length - 1];
    if (!l || Math.hypot(l[0] - q[0], l[1] - q[1]) > 1e-4) out.push(q);
  }
  return out;
};
const rot180 = (pts) => pts.map(([x, y]) => [1 - x, 1 - y]).reverse();

// Centre lines in a unit box (x 0..1 across, y 0..1 down; angles 0 right,
// 90 down). Each line: { k: kind, p: points, head: 'start'|'end', tail:
// 'start'|'end', closed }. Lines later in the list are painted over earlier.
const six = cat(arc(0.6, 0.62, 0.58, 0.62, -62, -180, 30), arc(0.5, 0.69, 0.5, 0.31, 180, -122, 60));
export const SKEL = {
  0: [{ k: ROPE, p: arc(0.5, 0.5, 0.5, 0.5, -90, 270, 72), closed: true }],
  1: [
    { k: REED, p: seg(0.62, 1, 0.62, 0.0), tail: null },
    { k: REED, p: cat(seg(0.62, 0.0, 0.62, 0.0, 1), arc(0.62, 0.3, 0.52, 0.3, -90, -160, 16)), tail: 'end', leaf: true, merge: true },
  ],
  2: [{ k: SNAKE, p: cat(arc(0.5, 0.29, 0.5, 0.29, 168, 375, 40), seg(0.99, 0.37, 0.06, 0.93), arc(0.12, 0.93, 0.07, 0.07, 160, 90, 4), seg(0.12, 1, 1, 1)), head: 'start', tail: 'end' }],
  3: [{ k: SNAKE, p: cat(arc(0.48, 0.25, 0.47, 0.25, 205, 430, 40), seg(0.64, 0.485, 0.34, 0.485, 4), arc(0.5, 0.735, 0.5, 0.265, 250, 520, 44)), head: 'start', tail: 'end' }],
  4: [
    { k: SNAKE, p: cat(seg(0.7, 0.02, 0.0, 0.7), seg(0.0, 0.7, 1.0, 0.7)), head: 'end', tail: 'start' },
    { k: REED, p: seg(0.7, 1, 0.7, 0.0), tail: null },
  ],
  5: [{ k: SNAKE, p: cat(seg(1, 0, 0.1, 0), seg(0.1, 0, 0.06, 0.44), arc(0.48, 0.69, 0.52, 0.31, 232, 520, 50)), head: 'end', tail: 'start' }],
  6: [{ k: SNAKE, p: six, head: 'start', tail: 'end' }],
  7: [
    { k: REED, p: cat(seg(0.3, 1, 0.98, 0.02)), tail: null },
    { k: REED, p: cat(seg(1, 0, 0.0, 0.02, 20)), tail: 'end', leaf: true, merge: true },
  ],
  8: [
    { k: ROPE, p: arc(0.5, 0.725, 0.5, 0.275, -90, 270, 64), closed: true },
    { k: ROPE, p: arc(0.5, 0.24, 0.41, 0.24, 90, 450, 56), closed: true },
  ],
  9: [{ k: SNAKE, p: rot180(six), head: 'end', tail: 'start' }],
};

const PERIOD = 7;                        // pattern period along a line, px

/**
 * Rasterise digit d into a glyph box w x h with half stroke r.
 * Returns { w, h, bw, bh, mat, u, v, s, lines: [{k, L, head:[x,y,tx,ty]|null}] }.
 */
export function rasterise(d, w, h, r) {
  const bw = w + 2 * M, bh = h + 2 * M, n = bw * bh;
  const mat = new Uint8Array(n), U = new Uint8Array(n), V = new Int8Array(n), S = new Uint8Array(n);
  const lines = [];
  SKEL[d].forEach((ln, li) => {
    const P = ln.p.map(([x, y]) => [M + r + x * (w - 2 * r), M + r + y * (h - 2 * r)]);
    const cum = [0];
    for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
    const L = cum[cum.length - 1];
    const us = ln.closed ? (Math.max(1, Math.round(L / PERIOD)) * PERIOD) / L : 1;
    // the width along the line: head bulge, tail and leaf taper
    const HL = 2.0 * r, TL = 3.2 * r;
    const headAt = ln.head === 'start' ? 0 : ln.head === 'end' ? L : -1;
    const tailAt = ln.tail === 'start' ? 0 : ln.tail === 'end' ? L : -1;
    const rad = (u) => {
      let q = r;
      if (headAt >= 0) { const dd = Math.abs(u - headAt); if (dd < HL) q = r + 0.9 * Math.min(1, (HL - dd) / (0.5 * HL)); }
      if (tailAt >= 0) { const dd = Math.abs(u - tailAt); if (dd < TL) q = Math.min(q, (ln.leaf ? 0.9 : 1.1) + (r - (ln.leaf ? 0.9 : 1.1)) * (dd / TL)); }
      return q;
    };
    let head = null;
    if (headAt >= 0) {
      const i0 = headAt === 0 ? 0 : P.length - 1, i1 = headAt === 0 ? 3 : P.length - 4;
      let tx = P[i0][0] - P[i1][0], ty = P[i0][1] - P[i1][1];
      const tl = Math.hypot(tx, ty); tx /= tl; ty /= tl;
      head = [P[i0][0], P[i0][1], tx, ty];
    }
    lines.push({ k: ln.k, L: L * us, raw: L, head, P, cum, leaf: !!ln.leaf });
    for (let y = 0; y < bh; y++)
      for (let x = 0; x < bw; x++) {
        const px = x + 0.5, py = y + 0.5;
        let best = 1e9, bu = 0, bv = 0;
        for (let i = 1; i < P.length; i++) {
          const ax = P[i - 1][0], ay = P[i - 1][1], dx = P[i][0] - ax, dy = P[i][1] - ay;
          const ll = dx * dx + dy * dy || 1e-9;
          let t = ((px - ax) * dx + (py - ay) * dy) / ll;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const qx = ax + dx * t, qy = ay + dy * t, dd = Math.hypot(px - qx, py - qy);
          const uu = cum[i - 1] + Math.sqrt(ll) * t, mg = dd - rad(uu);
          if (mg < best) { best = mg; bu = uu; bv = Math.sign(dx * (py - ay) - dy * (px - ax)) * dd; }
        }
        if (best > 0) continue;
        const q = 0;
        const i = y * bw + x, m = best > -1.0 ? 1 : 2;
        if (ln.merge && m === 1 && mat[i] >= 2) continue;
        mat[i] = m;
        U[i] = Math.round(bu * us) & 255; V[i] = Math.round(bv * 2); S[i] = li;
        if (headAt >= 0 && Math.abs(bu - headAt) < HL * 0.95 && mat[i] === 2) mat[i] = 4;
      }
    // the eye: on the head, set back from the tip, on its upper side
    if (head) {
      const [hx, hy, tx, ty] = head;
      let nx = -ty, ny = tx;
      if (ny > 0 || (Math.abs(ny) < 0.2 && nx < 0)) { nx = -nx; ny = -ny; }
      const ex = hx - tx * (r * 0.75) + nx * (r * 0.45), ey = hy - ty * (r * 0.75) + ny * (r * 0.45);
      for (let y = 0; y < bh; y++)
        for (let x = 0; x < bw; x++) {
          const i = y * bw + x;
          if (mat[i] && S[i] === li && Math.abs(x + 0.5 - ex) < (r > 3.2 ? 1.0 : 0.8) && Math.abs(y + 0.5 - ey) < 1.0) mat[i] = 3;
        }
    }
  });
  return { w, h, bw, bh, mat, u: U, v: V, s: S, lines };
}
