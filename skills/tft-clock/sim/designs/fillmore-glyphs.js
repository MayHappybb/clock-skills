// Fillmore glyphs: the poster's hand lettering, drawn for this grid.
//
// The model is the Fillmore/Avalon bill of 1966: Alfred Roller's Vienna
// Secession letters as Wes Wilson revived them, tall and condensed, square
// shoulders with soft melted corners, fat verticals and thinner bars (a
// brush's thick-thin), swollen ball terminals, every letter stretched to
// fill its box. Each digit is a few centre-line strokes whose half-width
// swells and thins along them; the field is the signed distance to that
// tapered ink, so the face can swell a letter, hollow it, draw its echo
// outlines and its inline from one byte per pixel.
//
// Counters are kept open (at least ~6 px of ground in every one after the
// keyline), the 4 is open-topped (a peaked 4 reads "A"), 6 and 9 hook well
// clear of their bowls (a closed hook reads 8), 1 has a flag and a foot.

export const GW = 31, GH = 64;           // a digit's box on the glass
const L = 5.5, R = 25.5, T = 4, B = 60, M = 32;
const V = 5, HB = 3.8;                    // half-widths: verticals, bars

// strokes: { p: [[x, y, halfWidth], ...], c: closed, f: fillet radius }
const DIGITS = {
  0: [{ p: [[L, T, 4.6], [15.5, T, HB], [R, T, 4.6], [R, M, V + 0.4], [R, B, 4.6], [15.5, B, HB], [L, B, 4.6], [L, M, V + 0.4]], c: true, f: 9 }],
  1: [
    { p: [[8, 17, 4.6], [17, T, 4.6], [17.5, M, 5.6], [17, B - 2, 5.4]], f: 4 },
    { p: [[10.5, 14.5, 3.4], [14, 16, 3.6]] },                 // fills the flag's pocket: a solid wedge
    { p: [[7, B, 3.6], [17, B, 4.4], [27, B, 3.8]] },
  ],
  2: [{ p: [[L, 15, 5.6], [L, T, 4], [15.5, T, HB], [R, T, 4.2], [R, 23, V], [L, B - 1, 4.6], [L + 1, B, 4], [16, B, HB], [R + 1, B, 4.4]], f: 7 }],
  3: [
    { p: [[L, 14, 5.6], [L, T, 4], [15.5, T, HB], [R, T, 4.4], [R, 18, V + 0.3], [R, M, V], [R, 46, V + 0.3], [R, B, 4.4], [15.5, B, HB], [L, B, 4], [L, 50, 5.6]], f: 8 },
    { p: [[12, M, 4], [R, M, HB]] },
  ],
  4: [
    { p: [[7, T, 3.8], [4.5, 41, 4]], f: 0 },
    { p: [[4.5, 41, 3.8], [R + 2.5, 41, 3.8]] },
    { p: [[24.5, T, 4.4], [24.5, 30, V], [24.5, B, 5]] },
  ],
  5: [{ p: [[R + 1, T, 4.6], [15.5, T, HB], [L, T, 4], [L, 18, V], [L, 31, 4.4], [16, 31, HB], [R, 31, 4.2], [R, 46, V + 0.4], [R, B, 4.4], [15.5, B, HB], [L, B, 4], [L, 49, 5.6]], f: 7 },
  ],
  6: [{ p: [[R, 14, 5.6], [R, T, 4], [15.5, T, HB], [L, T, 4.4], [L, M, V + 0.4], [L, B, 4.4], [15.5, B, HB], [R, B, 4.4], [R, 46, V + 0.2], [R, 31, 4.2], [15.5, 31, HB], [L, 31, 4.4]], f: 7 }],
  7: [{ p: [[L, 14, 5.6], [L, T, 4], [15.5, T, HB], [R, T, 4.2], [R, 15, V], [13, B, 5.8]], f: 6 }],
  8: [
    { p: [[6.5, T, 4.2], [15.5, T, HB], [24.5, T, 4.2], [24.5, 18, 4.6], [24.5, M, 4.2], [15.5, M, HB], [6.5, M, 4.2], [6.5, 18, 4.6]], c: true, f: 7 },
    { p: [[L, M, 4.2], [15.5, M, HB], [R, M, 4.2], [R, 46, V + 0.3], [R, B, 4.4], [15.5, B, HB], [L, B, 4.4], [L, 46, V + 0.3]], c: true, f: 8 },
  ],
  9: [{ p: [[L, 50, 5.6], [L, B, 4], [15.5, B, HB], [R, B, 4.4], [R, M, V + 0.4], [R, T, 4.4], [15.5, T, HB], [L, T, 4.4], [L, 18, V + 0.2], [L, 33, 4.2], [15.5, 33, HB], [R, 33, 4.2]], f: 7 }],
};

// The colon: two flame drops, points up.
const COLON = [
  { p: [[0, 17, 1.2], [0, 22, 3.6], [0, 24.5, 4]] },
  { p: [[0, 39, 1.2], [0, 44, 3.6], [0, 46.5, 4]] },
];

/** Replace each corner of a polyline by a quadratic arc (soft, melted corners). */
function fillet(pts, closed, rad) {
  if (!rad) return closed ? [...pts, pts[0]] : pts;
  const n = pts.length, out = [];
  const lerp3 = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
  for (let i = 0; i < n; i++) {
    const P = pts[i];
    if (!closed && (i === 0 || i === n - 1)) { out.push(P); continue; }
    const A = pts[(i - 1 + n) % n], C = pts[(i + 1) % n];
    const la = Math.hypot(A[0] - P[0], A[1] - P[1]), lc = Math.hypot(C[0] - P[0], C[1] - P[1]);
    // collinear points need no arc
    const cr = ((A[0] - P[0]) * (C[1] - P[1]) - (A[1] - P[1]) * (C[0] - P[0])) / (la * lc);
    if (Math.abs(cr) < 0.05) { out.push(P); continue; }
    const k0 = Math.min(rad / la, 0.5), k1 = Math.min(rad / lc, 0.5);
    const Q0 = lerp3(P, A, k0), Q1 = lerp3(P, C, k1);
    for (let j = 0; j <= 6; j++) {
      const u = j / 6;
      out.push(lerp3(lerp3(Q0, P, u), lerp3(P, Q1, u), u));
    }
  }
  if (closed) out.push(out[0]);
  return out;
}

function segments(strokes) {
  const segs = [];
  for (const s of strokes) {
    const p = fillet(s.p, !!s.c, s.f ?? 0);
    for (let i = 0; i + 1 < p.length; i++) segs.push([p[i][0], p[i][1], p[i][2], p[i + 1][0], p[i + 1][1], p[i + 1][2]]);
  }
  return segs;
}

/** Signed distance (px) from (x, y) to the tapered ink. */
function dist(segs, x, y) {
  let best = 1e9;
  for (const [ax, ay, ar, bx, by, br] of segs) {
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    let t = l2 > 0 ? ((x - ax) * dx + (y - ay) * dy) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = ax + dx * t - x, py = ay + dy * t - y;
    const d = Math.sqrt(px * px + py * py) - (ar + (br - ar) * t);
    if (d < best) best = d;
  }
  return best;
}

// ------------------------------------------------------------ the fields (flash)

/** One byte per pixel: q = Q0 + 4 * distance, clamped to 0..255. */
export const Q0 = 48;
export const MARGIN = 14;                // ground kept round a glyph's box
export const CW = GW + 2 * MARGIN;       // a stored field's size
export const CH = GH + 2 * MARGIN;

function bake(strokes, ox) {
  const segs = segments(strokes), f = new Uint8Array(CW * CH);
  for (let y = 0; y < CH; y++)
    for (let x = 0; x < CW; x++) {
      const d = dist(segs, x + 0.5 - MARGIN - ox, y + 0.5 - MARGIN);
      f[y * CW + x] = Math.max(0, Math.min(255, Math.round(Q0 + 4 * d)));
    }
  return f;
}

/** FIELDS[0..9] the digits, FIELDS[10] the colon (centred in the box). */
export const FIELDS = [...Array(10).keys()].map((d) => bake(DIGITS[d], 0)).concat([bake(COLON, 16)]);
