// The numerals for gears.js: each one is a roller-chain drive.
//
// A digit is a skeleton of strokes (lines and elliptic arcs in a unit box)
// with a sprocket at each stroke end and at the corners. Every stroke is a
// run of roller chain seen from above: two side plates (the rails: the outer
// pixel row is solid and holds the silhouette steady, the inner row swells
// at each pin like real link plates) and the rollers across between them.
// The chain runs along the stroke, so the pattern travels and the outline
// stays put. Counters stay open because the chain only follows the skeleton.
//
// Rasterised once, at load (flash tables on the device), two bytes per pixel
// of a glyph's box:
//   pos   arc length along the chain, mod 240 (every stroke is rescaled to a
//         whole number of 6 px links, so closed loops have no seam)
//   code  kind (3 bits: moat, outer rail, inner rail, roller) | reveal << 3
//         (5 bits: 0 next to a sprocket or stroke end, 31 midway between,
//         so the chain threads on from every sprocket at once and runs back
//         into them evenly)
// The sprockets are not in the table: gears.js draws them from a polar
// sprite, so they can roll to new places at the minute turn.

export const PITCH = 6;            // chain pitch in pixels (divides 240)
export const ANG = 120;            // angle steps round a wheel

export const K_NONE = 0, K_MOAT = 1, K_RAILO = 2, K_RAILI = 3, K_ROLL = 4;

const D = Math.PI / 180;
const line = (ax, ay, bx, by) => ({ t: 'l', ax, ay, bx, by });
const arc = (cx, cy, rx, ry, a0, a1) => ({ t: 'a', cx, cy, rx, ry, a0, a1 });

// The ten skeletons (u right, v down, 0..1 over the box the stroke centre
// line spans) and their sprocket nodes. Condensed, like an engraved
// regulator dial; 6 and 9 have long open hooks so their counters never close.
const SK = {
  0: { s: [arc(0.5, 0.5, 0.5, 0.5, -90, 270)], n: [[0.5, 0], [0.5, 1]] },
  1: { s: [line(0.1, 0.24, 0.64, 0), line(0.64, 0, 0.64, 1)], n: [[0.64, 0], [0.64, 1], [0.1, 0.24]] },
  2: { s: [arc(0.5, 0.27, 0.5, 0.27, 165, 383), line(0.96, 0.37, 0, 1), line(0, 1, 1, 1)], n: [[0.02, 0.34], [0, 1], [1, 1]] },
  3: { s: [arc(0.5, 0.22, 0.46, 0.22, 205, 450), arc(0.5, 0.72, 0.5, 0.28, -90, 158)], n: [[0.08, 0.13], [0.5, 0.44], [0.04, 0.83]] },
  4: { s: [line(0.72, 0, 0, 0.68), line(0, 0.68, 1, 0.68), line(0.72, 0, 0.72, 1)], n: [[0.72, 0], [0, 0.68], [0.72, 1]] },
  5: { s: [line(1, 0, 0.05, 0), line(0.05, 0, 0.05, 0.46), arc(0.5, 0.67, 0.5, 0.33, -140, 152)], n: [[1, 0], [0.05, 0], [0.06, 0.82]] },
  6: { s: [arc(1.0, 0.7, 1.0, 0.7, 255, 180), arc(0.5, 0.7, 0.5, 0.3, 180, 540)], n: [[0.74, 0.024], [0, 0.7]] },
  7: { s: [line(0, 0, 1, 0), line(1, 0, 0.3, 1)], n: [[0, 0], [1, 0], [0.3, 1]] },
  8: { s: [arc(0.5, 0.23, 0.42, 0.23, 90, 450), arc(0.5, 0.72, 0.5, 0.28, -90, 270)], n: [[0.5, 0], [0.5, 0.46], [0.5, 1]] },
};
// 9 is 6 turned half round
SK[9] = {
  s: SK[6].s.map((a) => ({ ...a, cx: 1 - a.cx, cy: 1 - a.cy, a0: a.a0 + 180, a1: a.a1 + 180 })),
  n: SK[6].n.map(([u, v]) => [1 - u, 1 - v]),
};

/** Sample the skeleton into polylines with arc length, each stroke a whole number of links. */
function samples(sk, x0, y0, iw, ih) {
  const polys = [];
  let s0 = 0;
  for (const p of sk) {
    const pts = [];
    if (p.t === 'l') {
      const n = Math.ceil(Math.hypot((p.bx - p.ax) * iw, (p.by - p.ay) * ih) * 2) + 1;
      for (let i = 0; i <= n; i++) { const u = i / n; pts.push([x0 + (p.ax + (p.bx - p.ax) * u) * iw, y0 + (p.ay + (p.by - p.ay) * u) * ih]); }
    } else {
      const n = Math.ceil(Math.abs(p.a1 - p.a0) * 1.2) + 1;
      for (let i = 0; i <= n; i++) {
        const a = (p.a0 + (p.a1 - p.a0) * (i / n)) * D;
        pts.push([x0 + (p.cx + p.rx * Math.cos(a)) * iw, y0 + (p.cy + p.ry * Math.sin(a)) * ih]);
      }
    }
    const s = [0];
    for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const L = s[s.length - 1], k = (Math.max(1, Math.round(L / PITCH)) * PITCH) / L;
    for (let i = 0; i < s.length; i++) s[i] = s0 + s[i] * k;
    s0 = s[s.length - 1];
    polys.push({ pts, s });
  }
  return polys;
}

/**
 * Build one glyph. `w`, `h`: the stroke silhouette's outer size; `R`: stroke
 * half-width; `pad`: the moat. The box is the silhouette plus the moat;
 * `nodes` are sprocket centres in box coordinates.
 */
export function buildGlyph(digit, w, h, R, pad) {
  const BW = w + 2 * pad, BH = h + 2 * pad;
  const x0 = pad + R, y0 = pad + R, iw = w - 2 * R, ih = h - 2 * R;
  const sk = SK[digit];
  const polys = samples(sk.s, x0, y0, iw, ih);
  const nodes = sk.n.map(([u, v]) => [x0 + u * iw, y0 + v * ih]);
  const anchors = [];
  for (const p of polys) {
    for (let i = 0; i < p.pts.length; i++)
      for (const [nx, ny] of nodes) if (Math.hypot(p.pts[i][0] - nx, p.pts[i][1] - ny) < 2.0) anchors.push(p.s[i]);
  }
  const revAt = (s) => {
    let lo = -1e9, hi = 1e9;
    for (const a of anchors) { if (a <= s && a > lo) lo = a; if (a >= s && a < hi) hi = a; }
    const half = (hi - lo) / 2;
    return half > 0 ? Math.min(1, Math.min(s - lo, hi - s) / half) : 0;
  };
  const N = BW * BH, pos = new Uint8Array(N), code = new Uint8Array(N);
  let ink = 0;
  for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) {
    const i = y * BW + x, px = x + 0.5, py = y + 0.5;
    let bd = 1e9, bs = 0;
    for (const p of polys) for (let j = 1; j < p.pts.length; j++) {
      const [ax, ay] = p.pts[j - 1], [bx, by] = p.pts[j];
      const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
      let u = l ? ((px - ax) * dx + (py - ay) * dy) / l : 0;
      u = u < 0 ? 0 : u > 1 ? 1 : u;
      const ex = ax + dx * u - px, ey = ay + dy * u - py, d = Math.sqrt(ex * ex + ey * ey);
      if (d < bd) { bd = d; bs = p.s[j - 1] + (p.s[j] - p.s[j - 1]) * u; }
    }
    let k = K_NONE;
    if (bd <= R - 2) k = K_ROLL;
    else if (bd <= R - 1) k = K_RAILI;
    else if (bd <= R) k = K_RAILO;
    else if (bd <= R + pad) k = K_MOAT;
    if (!k) continue;
    if (k !== K_MOAT) ink++;
    pos[i] = ((Math.floor(bs) % 240) + 240) % 240;
    code[i] = k | (Math.round(revAt(bs) * 31) << 3);
  }
  return { W: BW, H: BH, pos, code, nodes, ink };
}

/**
 * A sprocket's polar sprite: for each pixel of a (2E+1)^2 box round the
 * centre, the distance in half pixels (255 = outside E) and the angle step.
 */
export function polarSprite(E) {
  const S = 2 * E + 1, rad = new Uint8Array(S * S), ang = new Uint8Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = x - E, dy = y - E, d = Math.hypot(dx, dy), i = y * S + x;
    rad[i] = d <= E + 0.01 ? Math.round(d * 2) : 255;
    let a = Math.atan2(dy, dx) / (2 * Math.PI);
    if (a < 0) a += 1;
    ang[i] = Math.floor(a * ANG) % ANG;
  }
  return { E, S, rad, ang };
}
