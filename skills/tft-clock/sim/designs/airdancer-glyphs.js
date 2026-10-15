// Air Dancer glyphs: the ten numerals as inflated nylon tubes.
//
// Each digit is the centre line of a fat fabric tube (radius R0, about 9 px
// across with its keyline), drawn as strokes in a 17 x 41 px centre-line box
// (y down). The tube is round-ended, bends in soft arcs, and every digit
// stands on its blower at the bottom: `noz` is where the tube leaves the
// nozzle, `head` where its painted face sits.
//
// At load each glyph is rasterised into four small byte maps (flash):
//   D  distance to the centre line, 1/16 px (so the radius can change per frame)
//   S  air distance from the nozzle along the tube, px (a pulse of air runs up it)
//   L  how much the surface faces the light (upper left), for the sheen line
//   NY how vertical the surface normal is (0..15), so a squashed tube keeps its girth
// The face renders them through a per-row warp (sway, squash, crumple), so a
// digit is never redrawn from strokes at run time.

export const R0 = 4.5;            // tube radius, px
export const CW = 17, CH = 41;    // centre-line box
export const M = 8;               // field margin round the box
export const FW = CW + 2 * M + 1, FH = CH + 2 * M + 1;

const rad = (d) => (d * Math.PI) / 180;
/** A superellipse arc, angles in degrees (0 right, 90 down), `p` 2 = ellipse. */
function arc(cx, cy, rx, ry, a0, a1, p = 2, step = 6) {
  const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / step));
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = rad(a0 + ((a1 - a0) * i) / n), c = Math.cos(a), s = Math.sin(a);
    const e = 2 / p;
    out.push([cx + rx * Math.sign(c) * Math.abs(c) ** e, cy + ry * Math.sign(s) * Math.abs(s) ** e]);
  }
  return out;
}
/** A smooth curve through points (Catmull-Rom), for the hand-drawn strokes. */
function curve(pts, per = 6) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

// ------------------------------------------------------------ the ten tubes

export const GLYPHS = [
  { // 0: one fat ring of tube, a little squarer than an ellipse
    strokes: [arc(8.5, 20.5, 8.5, 20.5, 0, 360, 2.5)],
    noz: [8.5, 41], head: [8.5, 1.2],
  },
  { // 1: a straight stem whose top bends over into a short flag
    strokes: [curve([[10.5, 41], [10.5, 20], [10.5, 3.5], [9, 1.2]]), curve([[9, 1.2], [6.6, 2.6], [3.4, 6.6]])],
    noz: [10.5, 41], head: [10.0, 3.2],
  },
  { // 2: a round top, a swooping diagonal, a flat foot on the blower
    strokes: [arc(8.5, 9.3, 8.3, 8.8, 172, 382, 2.2), curve([[16.3, 14], [13.5, 21], [7.5, 29.5], [0.6, 40.4]]), [[0.6, 40.4], [17.2, 40.4]]],
    noz: [8.5, 40.4], head: [5.5, 1.5],
  },
  { // 3: two bowls, the lower one fuller
    strokes: [arc(8.2, 9.6, 8.0, 8.6, 196, 452, 2.2), arc(8.3, 30.0, 8.7, 10.8, 255, 515, 2.2)],
    noz: [8.3, 40.8], head: [6.2, 1.4],
  },
  { // 4: open-throated: diagonal, crossbar, and the stem it stands on
    strokes: [[[2.2, 0.6], [-0.6, 27.5]], [[-0.6, 27.5], [19.4, 27.5]], [[14.8, 5.0], [14.8, 41]]],
    noz: [14.8, 41], head: [14.6, 7.0],
  },
  { // 5: flag, neck, and a big belly
    strokes: [[[16.6, 0.9], [2.0, 0.9]], [[2.0, 0.9], [1.4, 17.4]],
      curve([[1.4, 17.4], [5.5, 15.4], [11, 16], [15.6, 19.6], [17.2, 27], [15.6, 35.4], [10, 40.6], [4.2, 40.4], [0.2, 36.4]])],
    noz: [8.5, 40.9], head: [12.4, 1.6],
  },
  { // 6: a curling top that drops into a closed belly
    strokes: [curve([[15.6, 4.6], [12.4, 1.1], [7.6, 0.7], [3.4, 3.4], [0.9, 9.5], [0.2, 18], [0.3, 30]]),
      arc(8.5, 30.6, 8.3, 10.2, 180, -180, 2.3)],
    noz: [8.5, 40.8], head: [9.0, 1.6],
  },
  { // 7: a straight brim and a long leaning stem
    strokes: [[[0.4, 0.9], [17.0, 0.9]], curve([[17.0, 0.9], [14.4, 9], [11.4, 19], [8.8, 29], [7.4, 41]])],
    noz: [7.4, 41], head: [6.0, 1.6],
  },
  { // 8: a smaller ring sat on a bigger one
    strokes: [arc(8.5, 9.6, 7.4, 9.4, 0, 360, 2.2), arc(8.5, 30.4, 8.5, 10.6, 0, 360, 2.3)],
    noz: [8.5, 41], head: [8.5, 1.2],
  },
  { // 9: a ring with a tail that swings down under it
    strokes: [arc(8.5, 10.4, 8.3, 10.2, 0, 360, 2.3), curve([[16.8, 11], [16.9, 21], [15.2, 30.5], [11, 38], [5.6, 40.8], [1.0, 38.6]])],
    noz: [8.0, 40.8], head: [8.5, 1.2],
  },
];

// ------------------------------------------------------------ rasterise (at load)

function bake(gl) {
  // sample every stroke densely
  const pts = [];          // [x, y, strokeIndex]
  gl.strokes.forEach((st, k) => {
    for (let i = 0; i < st.length - 1; i++) {
      const [ax, ay] = st[i], [bx, by] = st[i + 1];
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 0.5));
      for (let j = 0; j < n; j++) pts.push([ax + ((bx - ax) * j) / n, ay + ((by - ay) * j) / n, k]);
    }
    const e = st[st.length - 1];
    pts.push([e[0], e[1], k]);
  });
  // air distance from the nozzle: Dijkstra over the samples, linked along
  // strokes and wherever two strokes touch
  const n = pts.length, dist = new Float64Array(n).fill(Infinity), done = new Uint8Array(n);
  let src = 0, best = Infinity;
  for (let i = 0; i < n; i++) { const d = Math.hypot(pts[i][0] - gl.noz[0], pts[i][1] - gl.noz[1]); if (d < best) { best = d; src = i; } }
  dist[src] = 0;
  for (let it = 0; it < n; it++) {
    let u = -1, du = Infinity;
    for (let i = 0; i < n; i++) if (!done[i] && dist[i] < du) { du = dist[i]; u = i; }
    if (u < 0) break;
    done[u] = 1;
    for (let v = 0; v < n; v++) {
      if (done[v]) continue;
      const d = Math.hypot(pts[u][0] - pts[v][0], pts[u][1] - pts[v][1]);
      if ((d < 0.9 || (d < 3 && pts[u][2] !== pts[v][2])) && du + d < dist[v]) dist[v] = du + d;
    }
  }
  const D = new Uint8Array(FW * FH), S = new Uint8Array(FW * FH), L = new Int8Array(FW * FH), NY = new Uint8Array(FW * FH);
  for (let j = 0; j < FH; j++)
    for (let i = 0; i < FW; i++) {
      const x = i - M, y = j - M;
      let bd = Infinity, bk = 0;
      for (let k = 0; k < n; k++) {
        const dx = x - pts[k][0], dy = y - pts[k][1], d = dx * dx + dy * dy;
        if (d < bd) { bd = d; bk = k; }
      }
      const d = Math.sqrt(bd);
      const idx = j * FW + i;
      D[idx] = Math.min(255, Math.round(d * 16));
      S[idx] = Math.min(255, Math.round(dist[bk]));
      const nx = d > 0.01 ? (x - pts[bk][0]) / d : 0, ny = d > 0.01 ? (y - pts[bk][1]) / d : 0;
      NY[idx] = Math.round(ny * ny * 15);
      L[idx] = Math.round(Math.max(-1, Math.min(1, -(nx * 0.6 + ny * 0.8))) * 127);
    }
  let sMax = 0;
  for (let i = 0; i < n; i++) sMax = Math.max(sMax, dist[i]);
  const hs = S[Math.round(gl.head[1] + M) * FW + Math.round(gl.head[0] + M)];
  return { D, S, L, NY, sMax: Math.ceil(sMax), sHead: hs, noz: gl.noz, head: gl.head };
}

export const FIELDS = GLYPHS.map(bake);
/** Flash: four byte maps a digit. */
export const FLASH_BYTES = FIELDS.length * FW * FH * 4;
