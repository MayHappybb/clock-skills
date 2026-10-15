// Foam numerals for the bubbles face.
//
// Each digit is a pen path (centre line of the stroke) in a 10 x 14 unit box,
// y down. The path is strung with bubbles at an even spacing, in pen order
// (the order they pop and the order the wand refills them). Where two strokes
// cross or meet, bubbles that would sit on top of each other merge, so the
// junction becomes one shared cell: the power diagram of the bubbles gives
// flat shared walls and three-way Plateau junctions.

const SP = 2.3;                 // bubble spacing along the pen, units

const rad = (a) => (a * Math.PI) / 180;
/** Points of an elliptical arc from a0 to a1 degrees (screen angles, y down). */
function arc(cx, cy, rx, ry, a0, a1) {
  const n = Math.max(8, Math.ceil(Math.abs(a1 - a0) / 6)), pts = [];
  for (let i = 0; i <= n; i++) { const a = rad(a0 + ((a1 - a0) * i) / n); pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]); }
  return pts;
}
const cat = (...parts) => parts.flat(1);

// Pen paths: [points, closed]
const PATHS = {
  0: [[arc(5, 7, 3.4, 5.4, -90, 270), true]],
  1: [[[[2.7, 4.2], [5.9, 1.6], [5.9, 12.4]], false]],
  2: [[cat(arc(5, 4.9, 3.3, 3.25, 192, 382), [[1.7, 12.4], [8.7, 12.4]]), false]],
  3: [[cat(arc(5, 4.25, 3.15, 2.7, 205, 450), arc(5, 9.65, 3.45, 2.75, -90, 158)), false]],
  4: [[[[6.9, 1.6], [1.4, 9.4], [9.1, 9.4]], false], [[[6.9, 1.6], [6.9, 12.4]], false]],
  5: [[cat([[8.5, 1.6], [2.6, 1.6], [2.2, 6.6]], arc(5, 9.3, 3.45, 3.1, -128, 148)), false]],
  6: [[arc(7.3, 8.7, 5.7, 7.1, 281, 180), false], [arc(5, 9.35, 3.4, 3.05, 180, 540), true]],
  7: [[[[1.5, 1.6], [8.7, 1.6], [6.5, 6.3], [4.7, 12.4]], false]],
  8: [[arc(5, 4.15, 2.9, 2.55, 90, 450), true], [arc(5, 9.65, 3.4, 2.75, -90, 270), true]],
  9: [[arc(5, 4.65, 3.4, 3.05, 0, 360), true], [arc(2.7, 5.3, 5.7, 7.1, 0, 101), false]],
};

/** Resample a polyline to points `step` apart (ends included for open paths). */
function resample(pts, closed) {
  const P = closed ? [...pts.slice(0, -1), pts[0]] : pts;
  const cum = [0];
  for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const L = cum[cum.length - 1];
  const n = closed ? Math.max(3, Math.round(L / SP)) : Math.max(2, Math.round(L / SP) + 1);
  const out = [];
  for (let k = 0; k < n; k++) {
    const s = closed ? (k * L) / n : (k * L) / (n - 1);
    let j = 1;
    while (j < cum.length - 1 && cum[j] < s) j++;
    const f = (s - cum[j - 1]) / (cum[j] - cum[j - 1] || 1);
    out.push([P[j - 1][0] + (P[j][0] - P[j - 1][0]) * f, P[j - 1][1] + (P[j][1] - P[j - 1][1]) * f]);
  }
  return out;
}

const hash = (a, b) => { let h = Math.imul(a * 7919 + b * 104729 + 13, 0x9e3779b1); h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b); return ((h ^ (h >>> 13)) >>> 0) / 4294967296; };

/** Bubbles of digit d: [{ x, y, r }] in units, pen order. */
function build(d) {
  const seeds = [];
  for (const [pts, closed] of PATHS[d]) {
    for (const [x, y] of resample(pts, closed)) {
      const near = seeds.find((s) => Math.hypot(s.x - x, s.y - y) < 0.62 * SP);
      if (near) { near.x = (near.x + x) / 2; near.y = (near.y + y) / 2; near.r *= 1.06; continue; }
      seeds.push({ x, y, r: 1 });
    }
  }
  seeds.forEach((s, k) => { s.r = s.r * SP * 0.69 * (0.78 + 0.42 * hash(d, k)); });
  // a few small satellite bubbles stuck in the notches on the outside, as real foam has
  const n = seeds.length;
  for (let k = 0, added = 0; k < n && added < 3; k++) {
    if (hash(d, k + 40) > 0.3) continue;
    const a = seeds[k], b = seeds[(k + 1) % n];
    if (Math.hypot(a.x - b.x, a.y - b.y) > 1.3 * SP) continue;
    let mx = (a.x + b.x) / 2 - 5, my = (a.y + b.y) / 2 - 7; const ml = Math.hypot(mx, my) || 1;
    const x = (a.x + b.x) / 2 + (mx / ml) * 0.95 * SP, y = (a.y + b.y) / 2 + (my / ml) * 0.95 * SP;
    if (x < 0.3 || x > 9.7 || y < 0.3 || y > 13.7) continue;
    if (seeds.some((s) => Math.hypot(s.x - x, s.y - y) < 0.9 * SP)) continue;
    seeds.push({ x, y, r: SP * 0.3 }); added++;
  }
  return seeds;
}

export const GLYPHS = Array.from({ length: 10 }, (_, d) => build(d));
/**
 * Order in which a numeral's bubbles pop and are refilled: shuffled, so a
 * half-built (or half-popped) numeral is a sparse version of itself, never a
 * different digit (a 4 popped stroke by stroke would pass through a 1).
 * ORDER[d][k] is bubble k's place in the sequence.
 */
export const ORDER = GLYPHS.map((g, d) => {
  const idx = g.map((_, k) => k).sort((a, b) => hash(d + 20, a) - hash(d + 20, b));
  const rank = new Array(g.length);
  idx.forEach((k, i) => { rank[k] = i; });
  return rank;
});
export const BOX = { w: 10, h: 14 };
